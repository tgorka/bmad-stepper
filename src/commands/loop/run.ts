/**
 * src/commands/loop/run.ts — `/bmad-loop` runner skeleton (FR8, FR9, FR19,
 * FR53, FR54, AR8, AR9, AR33, AR41).
 *
 * Top-tier module per AR41 (architecture lines 1294-1302). Imports the
 * top-tier sibling `runNext` from `../next/run.ts` for in-process
 * per-iteration dispatch (NOT subprocess spawn — that would defeat AR9
 * line discipline + add ~30ms overhead per iteration; see story §Open
 * Question 2). Does NOT import `src/lock/`, `src/state/`, or any sub-tier
 * module — all per-iteration state I/O flows through `runNext` per the
 * AR41 boundary.
 *
 * Story 4.1 wires ONLY `--max-iters` as the runtime stop condition per
 * AC-1 verbatim. The other 7 stop-condition types (epic-end, story-X-Y,
 * next-story, phase-end, time-budget, token-budget, stop-on-error /
 * continue-on-error) are owned by Stories 4.2-4.10. The other flags
 * declared on `LoopArgsSchema` are ARG-SURFACE-PRESENT (Zod parses them)
 * but RUNTIME-DEFERRED (`shouldStop` does not branch on them).
 *
 * **AR9 STDOUT DISCIPLINE (final-emission strategy)**: per-iteration
 * `runNext` invocations have their AR9 lines captured in-process via the
 * direct return shape (NOT emitted to stdout). The loop runner's OWN
 * `import.meta.main` block emits ONE AR9 line at exit summarising the
 * loop outcome (`{ action: "report", message: "<summary>", exitCode: 0 }`).
 * This preserves the AR9 single-line invariant per command invocation.
 *
 * **EXIT-CODE MAPPING (FR53)**:
 *   - 0 — `max-iters-reached` OR `no-stop-condition` (clean exit per
 *         Story 4.1 v0.1 pre-Story-4.4 placeholder).
 *   - 1 — `halt-on-error` (per-iteration `runNext` halt; relayed verbatim).
 *   - 2 — argv parse error (configuration error).
 *
 * Architecture cross-references:
 *   - architecture.md §line 1294-1302 (AR41 top-tier import boundary).
 *   - architecture.md §line 1660 (AR9 protocol concretization).
 *   - architecture.md §line 1672 (run.ts is read-only / lock-free).
 *   - epics.md §Story 4.1 lines 891-903 (AC verbatim source).
 *   - epics.md §Epic 4 lines 887-1062 (Stories 4.1-4.10 stop-condition map).
 */

import type { DagAdjacency } from "../../dag/index.ts";
import { emitDispatchAction } from "../../dispatch/index.ts";
import { ConfigError, StepperError } from "../../errors.ts";
import { error } from "../../io/log.ts";
import type { DispatchActionV1 } from "../../schemas/dispatch-protocol.ts";
import type { State } from "../../schemas/state.ts";
import { loadStateUnlocked } from "../../state/load.ts";
import { type NextResult, type RunNextOptions, runNext } from "../next/run.ts";
import { type LoopArgs, parseLoopArgs } from "./args.ts";
import {
  evaluateStopConditions,
  type SprintStatus,
} from "./stop-conditions.ts";

// ─── Public types ─────────────────────────────────────────────────────────

/**
 * Per-iteration record appended to `LoopResult.iterations[]`. Plain
 * TypeScript type (NOT a Zod schema) — internal-only return shape; not
 * persisted; no migration concern. Forward-tracker: Story 6.x may extract
 * to `src/schemas/loop-result.ts` if checkpoints need Zod validation.
 */
export interface IterationRecord {
  /** 1-indexed iteration number (the first iteration is `1`). */
  readonly iterCount: number;
  /** runId from runNext result; `null` if the dispatch action carried none. */
  readonly runId: string | null;
  /** Discriminator from runNext's AR9 action variant. */
  readonly action: "dispatch" | "report" | "halt" | "unknown";
  /** Exit code from the per-iteration runNext invocation. */
  readonly exitCode: number;
  /** Wall-clock duration of the iteration in milliseconds (Bun.nanoseconds-derived). */
  readonly durationMs: number;
  /** ISO timestamp of iteration start (`new Date().toISOString()`). */
  readonly startedAt: string;
}

/**
 * Discriminated union describing why the loop exited. Each variant
 * carries the stop-condition-specific fields (e.g., the `maxIters` cap
 * value for `max-iters-reached`).
 *
 * Story 4.2 extends this union with two new variants
 * (`epic-end-reached`, `until-story-reached`) emitted by
 * `evaluateStopConditions` (see `./stop-conditions.ts`). Stories 4.3
 * (`--next-story`, `--phase-end`), 4.5 (`--time-budget`,
 * `--token-budget`), and 4.6 (`--stop-on-error`, `--continue-on-error`)
 * will extend with additional variants following the same shape.
 */
export type StopReason =
  | { code: "max-iters-reached"; maxIters: number; iterCount: number }
  | { code: "no-stop-condition"; iterCount: number }
  | { code: "halt-on-error"; iterCount: number; failureCode: string }
  | { code: "epic-end-reached"; epic: string; message: string }
  | {
      code: "until-story-reached";
      targetStory: string;
      currentStory: string;
      message: string;
    };

/**
 * Structured return value from `runLoop`. Tests inspect this directly
 * without mutating stdout / process state. The `import.meta.main` block
 * emits the AR9 line via `emitDispatchAction` and exits with
 * `result.exitCode`.
 */
export interface LoopResult {
  readonly stopReason: StopReason;
  readonly exitCode: 0 | 1 | 2;
  readonly iterations: readonly IterationRecord[];
  readonly durationMs: number;
  readonly startedAt: string;
  readonly completedAt: string;
}

/**
 * Test-injection escape hatches for `runLoop`. Mirrors the project's
 * preference for runtime-injectable test seams over `mock.module`
 * (Story 3.1 dev-002 + Epic 3 retrospective Forward Action Item §6.x).
 */
export interface LoopOpts {
  /** Argv slice (defaults to `process.argv.slice(2)` when absent). */
  readonly argv?: readonly string[];
  /**
   * Pre-parsed args. Mutually exclusive with `argv`; when both are
   * supplied, `args` wins and parsing is skipped.
   */
  readonly args?: LoopArgs;
  /**
   * Test-injection seam: replaces the imported `runNext` with a stub.
   * Tests pass a stub to assert the iteration loop's call count + the
   * IterationRecord shape; production code passes nothing.
   */
  readonly runNextOverride?: (
    opts?: RunNextOptions,
  ) => Promise<NextResult> | NextResult;
  /**
   * Story 4.2 test-injection seam: replaces the per-iteration
   * `loadStateUnlocked` call with a stub returning a `State` directly.
   * When the stub returns `null`, the predicates degrade gracefully —
   * only the `--max-iters` + `no-stop-condition` branches remain active.
   * Production code passes nothing.
   */
  readonly stateOverride?: () => Promise<State | null> | State | null;
  /**
   * Story 4.2 test-injection seam: replaces the per-iteration sprint-
   * status YAML load with a stub returning a `SprintStatus` directly.
   * Production code passes nothing — the runner reads
   * `_bmad-output/implementation-artifacts/sprint-status.yaml`.
   */
  readonly sprintStatusOverride?: () =>
    | Promise<SprintStatus | null>
    | SprintStatus
    | null;
  /**
   * Story 4.2 test-injection seam: replaces the standard
   * `process.stderr.write` call used to emit the state-snapshot pointer +
   * `--resume` hint on `--until-epic-end` exit. Tests pass a capturing
   * stub to assert the emitted text without polluting stderr; production
   * code passes nothing.
   */
  readonly stderrOverride?: (chunk: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Returns `true` when any non-`--max-iters` stop condition is supplied on
 * the args. Story 4.2 wires `--until-epic-end` + `--until-story`. Stories
 * 4.3/4.5/4.6 will EXTEND this guard with their flags. Used by
 * `shouldStop` to suppress the v0.1 `no-stop-condition` placeholder when
 * the user supplied a stop condition (without `--max-iters`).
 *
 * Story 4.4 will REMOVE this helper entirely when the `--max-iters=50`
 * default cap eliminates the no-stop-condition branch.
 */
function hasOtherStopCondition(args: LoopArgs): boolean {
  return args.untilEpicEnd === true || args.untilStory !== undefined;
}

/**
 * Stop-condition gate. Returns the StopReason if the loop should halt;
 * otherwise returns `null` to indicate "continue".
 *
 * Story 4.1 wired ONLY `--max-iters` per AC-1 verbatim. Story 4.2 widens
 * the signature to accept `state` + `dag` + `sprintStatus` and dispatches
 * to `evaluateStopConditions` (in `./stop-conditions.ts`) for the other
 * stop-condition predicates after the `--max-iters` check. When
 * `state`/`sprintStatus` are `null` (per-iteration load failed; graceful
 * degradation per Story 4.2 §Open Question 4), only the
 * `--max-iters` + `no-stop-condition` branches remain active.
 *
 * The `no-stop-condition` placeholder (Story 4.1 v0.1 pre-Story-4.4) is
 * SUPPRESSED by `hasOtherStopCondition(args)` when the user supplied
 * `--until-epic-end` or `--until-story` alone — without the suppression,
 * the placeholder would fire on iter 0 BEFORE any iteration runs.
 *
 * Stories 4.3-4.10 will extend `evaluateStopConditions` with the other
 * 5 stop-condition types (next-story, phase-end, time-budget,
 * token-budget, stop-on-error / continue-on-error).
 */
function shouldStop(
  iterCount: number,
  args: LoopArgs,
  state: State | null,
  dag: DagAdjacency | null,
  sprintStatus: SprintStatus | null,
): StopReason | null {
  if (args.maxIters !== undefined && iterCount >= args.maxIters) {
    return {
      code: "max-iters-reached",
      maxIters: args.maxIters,
      iterCount,
    };
  }
  // Story 4.2: dispatch to the pure-function predicates in
  // `stop-conditions.ts`. The dispatcher returns `null` when no predicate
  // fires (or when state/sprintStatus is missing — predicates short-
  // circuit on undefined inputs).
  //
  // Note: only `state` is required at the dispatch level. `sprintStatus`
  // is OPTIONAL — `untilStoryStopCondition` does not consult it, and
  // `untilEpicEndStopCondition` handles `undefined` sprintStatus
  // gracefully (returns null). Requiring both at the gate would prevent
  // `--until-story` from firing whenever the sprint-status load fails or
  // the test injects `null` for it. (Repair r1: tightened the guard from
  // `state !== null && sprintStatus !== null` to `state !== null`.)
  if (state !== null) {
    const reason = evaluateStopConditions(
      state,
      dag ?? EMPTY_DAG,
      args,
      sprintStatus ?? undefined,
    );
    if (reason !== null) return reason;
  }
  // Story 4.1 v0.1 pre-Story-4.4: no stop condition supplied → halt
  // immediately. This branch is REMOVED by Story 4.4 when the default
  // cap (--max-iters=50) is wired. Story 4.2 adds the
  // `hasOtherStopCondition` guard so the placeholder does NOT fire when
  // `--until-epic-end` or `--until-story` is supplied alone.
  if (
    args.maxIters === undefined &&
    iterCount === 0 &&
    !hasOtherStopCondition(args)
  ) {
    return { code: "no-stop-condition", iterCount };
  }
  return null;
}

/**
 * Empty DAG sentinel passed to predicates when the runtime DAG load is
 * skipped. Story 4.2's predicates do not actually consult the DAG (the
 * `_dag` parameter is unused); Stories 4.3+ will use it. The sentinel
 * keeps the type signatures uniform.
 */
const EMPTY_DAG: DagAdjacency = {
  nodes: new Map(),
  edgesOut: new Map(),
  edgesIn: new Map(),
};

/**
 * Per-iteration sprint-status loader. Reads
 * `_bmad-output/implementation-artifacts/sprint-status.yaml` via
 * `Bun.file` + `Bun.YAML.parse`. Returns `null` on any error (graceful
 * degradation per Story 4.2 §Open Question 4 — `untilEpicEndStopCondition`
 * short-circuits on `null` sprint-status; the loop continues with the
 * `--max-iters` branch only).
 */
async function loadSprintStatusForLoop(): Promise<SprintStatus | null> {
  try {
    const file = Bun.file(
      "_bmad-output/implementation-artifacts/sprint-status.yaml",
    );
    if (file.size === 0) return null;
    const text = await file.text();
    const parsed = Bun.YAML.parse(text) as
      | { development_status?: Record<string, string> }
      | null
      | undefined;
    const devStatus = parsed?.development_status;
    if (devStatus === undefined || devStatus === null) return null;
    return { development_status: devStatus };
  } catch {
    return null;
  }
}

/**
 * Extract a runId from the AR9 dispatch action when present. Only the
 * `dispatch` variant carries a `runId` — `report` and `halt` variants
 * return `null`.
 */
function extractRunId(action: DispatchActionV1): string | null {
  if (action.action === "dispatch") {
    return action.runId;
  }
  return null;
}

/**
 * Extract the failure code from a halt action's message. The dispatch
 * protocol does NOT carry a structured `code` field on halt — the code
 * is encoded in the `runNext` exit code mapping. v0.1 conservative:
 * return `"UNKNOWN_FAILURE"` when not derivable; the loop runner relays
 * the surrounding context via the `IterationRecord`.
 */
function extractFailureCode(
  action: DispatchActionV1,
  exitCode: number,
): string {
  if (action.action !== "halt") return "UNKNOWN_FAILURE";
  // The exit code is the canonical FR53 mapping; return a stable string
  // tag so Story 4.6 (--stop-on-error) can branch on it without parsing
  // the human-readable message. Story 4.10 may enrich with a structured
  // failure-code lookup pulled from state.lastFailureReason.code.
  return `EXIT_${exitCode}`;
}

// ─── Public runner ────────────────────────────────────────────────────────

/**
 * Run the bounded loop. Each iteration invokes `runNext` once; the loop
 * exits when `shouldStop` returns a non-null StopReason.
 *
 * The function NEVER throws on `runNext` halts — those are captured into
 * an `IterationRecord` and surface as `stopReason.code === "halt-on-error"`.
 * It DOES throw `ConfigError` on argv parse failure (per architecture P4
 * line 858 — argv parsing is the sole exception to throw-not-Result;
 * when consumed via `runLoop`, the parser's Result-shape result is
 * translated to a thrown `ConfigError` for AR33 compliance at this
 * tier).
 *
 * Architecture compliance:
 *   - AR8: lock-free top-tier; does not import `src/lock/`.
 *   - AR9: per-iteration AR9 lines are captured in-process; the loop's
 *          OWN AR9 line is emitted by `import.meta.main` only.
 *   - AR41: imports only top-tier sibling `runNext` (next/run.ts);
 *          intra-module `./args.ts`; foundational `errors.ts` + `io/log.ts`
 *          + `schemas/dispatch-protocol.ts`; mid-tier `dispatch/index.ts`
 *          for the AR9 emit helper.
 */
export async function runLoop(opts?: LoopOpts): Promise<LoopResult> {
  // Resolve LoopArgs from either pre-parsed `opts.args` or argv.
  let args: LoopArgs;
  if (opts?.args !== undefined) {
    args = opts.args;
  } else {
    const argv = opts?.argv ?? process.argv.slice(2);
    const parsed = parseLoopArgs(argv);
    if (!parsed.ok) {
      throw new ConfigError(
        parsed.error.message,
        JSON.stringify({ argv }),
        parsed.error.hint,
      );
    }
    args = parsed.value;
  }

  const runNextFn = opts?.runNextOverride ?? runNext;
  // Story 4.2: per-iteration state/sprint-status loaders. Tests inject
  // overrides; production reads `_bmad-output/.stepper/state.yaml` (via
  // `loadStateUnlocked` — the loop runner is read-only per AR8) +
  // `_bmad-output/implementation-artifacts/sprint-status.yaml`.
  const stateFn =
    opts?.stateOverride ??
    (async () => {
      try {
        return await loadStateUnlocked();
      } catch {
        return null;
      }
    });
  const sprintStatusFn = opts?.sprintStatusOverride ?? loadSprintStatusForLoop;
  const stderrFn =
    opts?.stderrOverride ??
    ((chunk: string) => {
      process.stderr.write(chunk);
    });

  const startedAt = new Date().toISOString();
  // Bun.nanoseconds() returns number (not BigInt) per Bun's docs; we use
  // it for monotonic durations that won't drift across system clock
  // adjustments mid-loop.
  const loopStartNs: number = Bun.nanoseconds();
  const iterations: IterationRecord[] = [];
  let iterCount = 0;
  let stopReason: StopReason | null = null;

  // Iterate until shouldStop fires.
  while (true) {
    // Story 4.2: load state + sprint-status fresh BEFORE each shouldStop
    // call so the predicates see the just-completed iteration's mutation.
    // Graceful degradation: a `null` return from either loader leaves the
    // predicates without their inputs; the `--max-iters` branch still runs.
    const state = await stateFn();
    const sprintStatus = await sprintStatusFn();
    // v0.1 conservative: skip the DAG load (predicates do not consume it
    // yet; Stories 4.3+ will). The empty-DAG sentinel is passed to
    // satisfy the predicate signature.
    const dag: DagAdjacency | null = null;

    const reason = shouldStop(iterCount, args, state, dag, sprintStatus);
    if (reason !== null) {
      // Story 4.2 AC-1: --until-epic-end emits state-snapshot pointer +
      // --resume hint to STDERR per FR54 + AR9 single-line discipline.
      if (reason.code === "epic-end-reached") {
        stderrFn(
          "epic-end reached. State snapshot: _bmad-output/.stepper/state.yaml\n",
        );
        stderrFn("Run `/bmad-loop --resume` to continue from current state.\n");
      }
      stopReason = reason;
      break;
    }

    // Dispatch one iteration via runNext. The per-iteration AR9 line is
    // captured in the NextResult; we do NOT emit it to stdout (Story
    // 4.1 final-emission strategy — the loop's OWN AR9 line is emitted
    // by import.meta.main).
    const iterStartedAt = new Date().toISOString();
    const iterStartNs: number = Bun.nanoseconds();
    const nextResult = await runNextFn();
    const iterDurationMs = (Bun.nanoseconds() - iterStartNs) / 1_000_000;

    const record: IterationRecord = {
      iterCount: iterCount + 1,
      runId: extractRunId(nextResult.action),
      action: nextResult.action.action,
      exitCode: nextResult.exitCode,
      durationMs: iterDurationMs,
      startedAt: iterStartedAt,
    };
    iterations.push(record);
    iterCount++;

    // halt-on-error short-circuit. Any non-zero exitCode OR explicit
    // "halt" action stops the loop. Story 4.6 (--continue-on-error)
    // will gate this short-circuit on args.continueOnError.
    if (nextResult.exitCode !== 0 || nextResult.action.action === "halt") {
      stopReason = {
        code: "halt-on-error",
        iterCount,
        failureCode: extractFailureCode(nextResult.action, nextResult.exitCode),
      };
      break;
    }
  }

  const completedAt = new Date().toISOString();
  const durationMs = (Bun.nanoseconds() - loopStartNs) / 1_000_000;

  // Compute exit code per FR53 mapping.
  const exitCode: 0 | 1 | 2 = stopReason?.code === "halt-on-error" ? 1 : 0;

  // Defensive: stopReason cannot be null because shouldStop always
  // returns non-null on iterCount===0 when no stop condition was
  // supplied, AND on iterCount===maxIters when --max-iters is set, AND
  // on halt-on-error before this point. But TypeScript can't prove it;
  // cast via assertion:
  if (stopReason === null) {
    // Should be unreachable; surface as a defensive ConfigError so any
    // future refactor that breaks the invariant fails loudly.
    throw new ConfigError(
      "runLoop terminated without a stop reason; this is a bug.",
      JSON.stringify({ iterCount, args }),
      "Run /bmad-loop --doctor to verify your install; report this as a bug if it persists.",
    );
  }

  return {
    stopReason,
    exitCode,
    iterations,
    durationMs,
    startedAt,
    completedAt,
  };
}

// ─── Helper: format the AR9 summary message ───────────────────────────────

/**
 * Format the human-readable summary message embedded in the loop's
 * final AR9 line. Mirrors Story 4.1 Task 4.8:
 *
 *   - max-iters-reached:  "max-iters reached (1 iteration)" (AC-1 verbatim).
 *   - no-stop-condition:  "no stop condition supplied (Story 4.4 ...)" placeholder.
 *   - halt-on-error:      "halt on error (<failureCode>) at iteration <N>".
 */
function formatExitReason(stopReason: StopReason): string {
  switch (stopReason.code) {
    case "max-iters-reached": {
      const plural = stopReason.iterCount === 1 ? "iteration" : "iterations";
      return `max-iters reached (${stopReason.iterCount} ${plural})`;
    }
    case "no-stop-condition":
      return "no stop condition supplied (Story 4.4 default cap not yet wired) — exiting";
    case "halt-on-error":
      return `halt on error (${stopReason.failureCode}) at iteration ${stopReason.iterCount}`;
    case "epic-end-reached":
      return stopReason.message;
    case "until-story-reached":
      return stopReason.message;
  }
}

// ─── import.meta.main entrypoint ──────────────────────────────────────────

if (import.meta.main) {
  try {
    const result = await runLoop({ argv: process.argv.slice(2) });
    const message = formatExitReason(result.stopReason);
    emitDispatchAction({
      action: "report",
      message,
      exitCode: result.exitCode,
    });
    process.exit(result.exitCode);
  } catch (err) {
    if (err instanceof StepperError) {
      emitDispatchAction({
        action: "halt",
        message: err.actionableHint,
        exitCode: err.exitCode === 0 ? 1 : err.exitCode,
      });
      process.exit(err.exitCode === 0 ? 1 : err.exitCode);
    }
    const message = err instanceof Error ? err.message : String(err);
    error(`loop: unexpected failure: ${message}`);
    process.exit(1);
  }
}
