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
 * Story 4.1 wired `--max-iters` as the FIRST runtime stop condition per
 * AC-1 verbatim. Story 4.2 wired `--until-epic-end` + `--until-story X.Y`.
 * Story 4.3 wired `--next-story` + `--phase-end`. Story 4.4 ADDS the
 * **`--max-iters=50` default cap** per FR25 — when no other stop
 * condition is supplied, the runner injects `args.maxIters = 50` so the
 * bounded loop has a hard ceiling. Stories 4.5-4.10 will wire the
 * remaining flags (`--time-budget`, `--token-budget`, `--stop-on-error`,
 * `--continue-on-error`, `--plan-first`).
 *
 * **AR9 STDOUT DISCIPLINE (final-emission strategy)**: per-iteration
 * `runNext` invocations have their AR9 lines captured in-process via the
 * direct return shape (NOT emitted to stdout). The loop runner's OWN
 * `import.meta.main` block emits ONE AR9 line at exit summarising the
 * loop outcome (`{ action: "report", message: "<summary>", exitCode: 0 }`).
 * This preserves the AR9 single-line invariant per command invocation.
 *
 * **EXIT-CODE MAPPING (FR53)**:
 *   - 0 — clean exit (one of `max-iters-reached`, `epic-end-reached`,
 *         `until-story-reached`, `next-story-reached`, `phase-end-reached`,
 *         `time-budget-reached`, `token-budget-reached`).
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

import { build as buildDag } from "../../dag/build.ts";
import type { DagAdjacency, Phase } from "../../dag/index.ts";
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
  type LoopContext,
  type LoopMetrics,
  type SprintStatus,
  timeBudgetStopCondition,
  tokenBudgetStopCondition,
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
 * Story 4.2 extended this union with two variants (`epic-end-reached`,
 * `until-story-reached`) emitted by `evaluateStopConditions`
 * (see `./stop-conditions.ts`). Story 4.3 EXTENDS with two MORE
 * variants (`next-story-reached`, `phase-end-reached`) emitted by the
 * Story 4.3 predicates (`nextStoryStopCondition`,
 * `phaseEndStopCondition`). Story 4.4 REMOVED the v0.1 placeholder
 * variant `no-stop-condition` — when no stop condition is supplied,
 * the runner injects `--max-iters=50` as a default cap (FR25) and the
 * loop exits via `max-iters-reached`. Story 4.5 (`--time-budget`,
 * `--token-budget`) extends with TWO MORE variants
 * (`time-budget-reached`, `token-budget-reached`) emitted by the new
 * pure-function predicates `timeBudgetStopCondition` +
 * `tokenBudgetStopCondition` (see `./stop-conditions.ts`). Story 4.6
 * (`--stop-on-error`, `--continue-on-error`) will extend further
 * following the same shape.
 */
export type StopReason =
  | { code: "max-iters-reached"; maxIters: number; iterCount: number }
  | { code: "halt-on-error"; iterCount: number; failureCode: string }
  | { code: "epic-end-reached"; epic: string; message: string }
  | {
      code: "until-story-reached";
      targetStory: string;
      currentStory: string;
      message: string;
    }
  | {
      code: "next-story-reached";
      startStory: string;
      currentStory: string;
      message: string;
    }
  | {
      code: "phase-end-reached";
      fromPhase: Phase;
      toPhase: Phase;
      message: string;
    }
  | {
      code: "time-budget-reached";
      budgetMs: number;
      elapsedMs: number;
      message: string;
    }
  | {
      code: "token-budget-reached";
      budget: number;
      tokensIn: number;
      tokensOut: number;
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
  /**
   * Story 4.3 test-injection seam: replaces the opt-in `buildDag()` call
   * used by `--phase-end`. When the stub returns `null`, the
   * `phaseEndStopCondition` predicate degrades gracefully (returns null
   * because `loopContext.startPhase === null`); the loop continues with
   * other stop conditions. Production code passes nothing — the runner
   * calls `buildDag({ skillNames: [] })` only when `args.phaseEnd === true`.
   */
  readonly dagOverride?: () =>
    | Promise<DagAdjacency | null>
    | DagAdjacency
    | null;
  /**
   * Story 4.5 test-injection seam: directly inject per-iteration token
   * counts without round-tripping through `state.yaml`. When supplied,
   * the runner uses these values; otherwise it reads tokens from the
   * latest `state.runHistory[]` entry (production path per AR10).
   * Production code passes nothing.
   */
  readonly tokensPerIter?: () => { tokensIn: number; tokensOut: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Stop-condition gate. Returns the StopReason if the loop should halt;
 * otherwise returns `null` to indicate "continue".
 *
 * Story 4.1 wired ONLY `--max-iters` per AC-1 verbatim. Story 4.2 widens
 * the signature to accept `state` + `dag` + `sprintStatus` and dispatches
 * to `evaluateStopConditions` (in `./stop-conditions.ts`) for the other
 * stop-condition predicates after the `--max-iters` check. When
 * `state`/`sprintStatus` are `null` (per-iteration load failed; graceful
 * degradation per Story 4.2 §Open Question 4), only the `--max-iters`
 * branch remains active. Story 4.4 ADDED the `--max-iters=50` default
 * cap (injected by `runLoop` before `shouldStop` is called) and REMOVED
 * the v0.1 `no-stop-condition` placeholder branch — when no stop
 * condition is supplied, the default-cap injection makes
 * `args.maxIters` non-undefined and the `--max-iters` branch fires
 * naturally.
 *
 *
 * Story 4.5 EXTENDS the signature with `loopMetrics` (loop-level wall-
 * clock + token accumulator) so the new `--time-budget` + `--token-budget`
 * predicates can read elapsed time + cumulative token counts. Stories
 * 4.6-4.10 will continue to extend `evaluateStopConditions` (stop-on-error /
 * continue-on-error / plan-first / checkpoint-each).
 */
function shouldStop(
  iterCount: number,
  args: LoopArgs,
  state: State | null,
  dag: DagAdjacency | null,
  sprintStatus: SprintStatus | null,
  loopContext: LoopContext | null,
  loopMetrics: LoopMetrics | null,
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
  //
  // Story 4.3: thread `loopContext` (loop-entry baseline) through to
  // `evaluateStopConditions` so the new `--next-story` + `--phase-end`
  // predicates can detect transitions from the baseline.
  if (state !== null) {
    const reason = evaluateStopConditions(
      state,
      dag ?? EMPTY_DAG,
      args,
      sprintStatus ?? undefined,
      loopContext ?? undefined,
      loopMetrics ?? undefined,
    );
    if (reason !== null) return reason;
  } else if (loopMetrics !== null) {
    // Story 4.5: budget predicates do NOT consume `state` (they only
    // read `args` + `loopMetrics`). When state is null (e.g., test
    // injects `stateOverride: () => null`, or the per-iteration state
    // load failed), the dispatcher above is skipped. Call the budget
    // predicates directly so `--time-budget` / `--token-budget` still
    // fire. The predicates ignore `_state` (underscore prefix) so the
    // sentinel passed here is safe.
    const time = timeBudgetStopCondition(
      EMPTY_STATE,
      dag ?? EMPTY_DAG,
      args,
      sprintStatus ?? undefined,
      loopContext ?? undefined,
      loopMetrics,
    );
    if (time !== null) return time;
    const token = tokenBudgetStopCondition(
      EMPTY_STATE,
      dag ?? EMPTY_DAG,
      args,
      sprintStatus ?? undefined,
      loopContext ?? undefined,
      loopMetrics,
    );
    if (token !== null) return token;
  }
  // Story 4.4: the v0.1 `no-stop-condition` placeholder branch was
  // REMOVED. When no stop condition is supplied, `runLoop` injects
  // `args.maxIters = 50` as a default cap (FR25) BEFORE this gate is
  // called, so the `--max-iters` branch above fires naturally. When
  // another stop condition is supplied without `--max-iters`, the
  // explicit condition controls (no default cap).
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
 * Empty State sentinel passed to budget predicates when the runtime state
 * load returned `null` (e.g., test injects `stateOverride: () => null`).
 * The Story 4.5 budget predicates (`timeBudgetStopCondition`,
 * `tokenBudgetStopCondition`) ignore `_state` (underscore-prefixed
 * parameter) — they only consume `args` + `loopMetrics`. The sentinel
 * keeps the type signature uniform.
 */
const EMPTY_STATE: State = {
  schemaVersion: 1,
  project: { name: "bmad-stepper", bmadVersion: "v6.x" },
  lastSuccessfulStep: null,
  lastAttempted: null,
  lastFailureReason: null,
  lastSnapshot: null,
  checkpoints: [],
  runHistory: [],
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

  // Story 4.4 (FR25): default `--max-iters=50` when no stop condition is
  // supplied. The injection ONLY applies when `args.maxIters` is
  // undefined AND no other stop condition is set. When the user
  // supplies another stop condition (e.g., `--until-epic-end`,
  // `--until-story X.Y`, `--next-story`, `--phase-end`) WITHOUT
  // `--max-iters`, the explicit condition controls and NO default cap
  // is applied (AC-3 explicit-overrides-default). When `--max-iters`
  // is explicitly set, this is a no-op.
  //
  // Forward-tracker: Stories 4.6/4.7 will EXTEND this stanza with
  // their flags as they become RUNTIME-WIRED:
  //   - 4.6: && args.stopOnError !== true && args.continueOnError !== true
  //   - 4.7: && args.planFirst !== true
  //
  // Story 4.5 wired the time-budget + token-budget clauses below.
  //
  // The default value (50) matches PRD §Bounded Loop Execution line 589
  // and epics.md §Story 4.4 AC-1 line 947.
  if (
    args.maxIters === undefined &&
    args.untilEpicEnd !== true &&
    args.untilStory === undefined &&
    args.nextStory !== true &&
    args.phaseEnd !== true &&
    args.timeBudgetMs === undefined &&
    args.tokenBudget === undefined
  ) {
    args = { ...args, maxIters: 50 };
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
  // Story 4.3: opt-in DAG loader for `--phase-end`. Tests inject overrides;
  // production calls `buildDag({ skillNames: [] })` only when
  // `args.phaseEnd === true`. The seed-only DAG (Tier 1 of the three-tier
  // resolver) is sufficient for `state.lastSuccessfulStep.step → phase`
  // lookups because the seed enumerates all canonical BMAD skills.
  const dagFn =
    opts?.dagOverride ??
    (async () => {
      try {
        return await buildDag({ skillNames: [] });
      } catch {
        return null;
      }
    });

  const startedAt = new Date().toISOString();
  // Bun.nanoseconds() returns number (not BigInt) per Bun's docs; we use
  // it for monotonic durations that won't drift across system clock
  // adjustments mid-loop.
  const loopStartNs: number = Bun.nanoseconds();
  const iterations: IterationRecord[] = [];
  let iterCount = 0;
  let stopReason: StopReason | null = null;

  // Story 4.3: opt-in DAG build at loop entry. Other Story 4.2/4.3
  // predicates do not consume the DAG; building it costs ~5-10ms but is
  // avoidable when not needed. Story 4.5+ may always build (broader
  // predicate consumption). Per Story 4.3 §Open Question 8, the opt-in
  // heuristic preserves zero-cost behaviour for the other 5+ flags.
  let loopDag: DagAdjacency | null = null;
  if (args.phaseEnd === true) {
    loopDag = await dagFn();
  }

  // Story 4.3: capture the loop-entry baseline for `--next-story` and
  // `--phase-end`. The baseline is read ONCE before the first iteration
  // and reused across all iterations. Predicates compare the just-
  // completed iteration's story/phase against this baseline (post-
  // iteration check per Story 4.3 §Open Questions 3 + 10 inheritance).
  //
  // Edge case (Story 4.3 §Open Question 2): when `state.lastSuccessfulStep
  // === null` at entry (fresh project), the baseline fields are `null`.
  // The predicates short-circuit on `null` baselines; the runLoop
  // UPDATES the baseline after the first successful iteration so
  // subsequent iterations have a baseline to compare against.
  let loopContext: LoopContext = { startStory: null, startPhase: null };
  {
    const initialState = await stateFn();
    const initialStartStory = initialState?.lastSuccessfulStep?.story ?? null;
    let initialStartPhase: Phase | null = null;
    if (args.phaseEnd === true && loopDag !== null) {
      const step = initialState?.lastSuccessfulStep?.step;
      if (step !== undefined && step !== null) {
        initialStartPhase = loopDag.nodes.get(step)?.phase ?? null;
      }
    }
    loopContext = {
      startStory: initialStartStory,
      startPhase: initialStartPhase,
    };
  }

  // Story 4.5: initialise the LoopMetrics accumulator at loop entry.
  // The runner UPDATES this struct after each successful iteration
  // (token accumulation from state.runHistory[]; the 80%-warning
  // latches flip when the predicates would emit warnings). Reuses
  // the existing `loopStartNs` from line 448 (`Bun.nanoseconds()` at
  // loop entry) — no double-clock-read.
  let loopMetrics: LoopMetrics = {
    startedAtNs: loopStartNs,
    tokensIn: 0,
    tokensOut: 0,
    warned80Time: false,
    warned80Token: false,
  };

  // Iterate until shouldStop fires.
  while (true) {
    // Story 4.2: load state + sprint-status fresh BEFORE each shouldStop
    // call so the predicates see the just-completed iteration's mutation.
    // Graceful degradation: a `null` return from either loader leaves the
    // predicates without their inputs; the `--max-iters` branch still runs.
    const state = await stateFn();
    const sprintStatus = await sprintStatusFn();
    // Story 4.3: use the opt-in DAG (loaded once at loop entry when
    // `args.phaseEnd === true`; null otherwise). The empty-DAG sentinel
    // is passed downstream to satisfy the predicate signature when
    // `loopDag === null`.
    const dag: DagAdjacency | null = loopDag;

    const reason = shouldStop(
      iterCount,
      args,
      state,
      dag,
      sprintStatus,
      loopContext,
      loopMetrics,
    );
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

    // Story 4.5: token accumulation from state.runHistory[] per AR10.
    // The verify-and-advance.ts (Layer 2) writes tokensIn/tokensOut to
    // runHistory[]; we read the LATEST entry per-iteration. v0.1
    // conservative: defensive typeof guards because runHistory[] is
    // schema-typed as z.unknown() per Story 1.5.
    let iterTokensIn = 0;
    let iterTokensOut = 0;
    if (opts?.tokensPerIter !== undefined) {
      // Test-injection seam: bypass state.yaml round-trip.
      const tokens = opts.tokensPerIter();
      iterTokensIn = tokens.tokensIn;
      iterTokensOut = tokens.tokensOut;
    } else {
      // Production path: read latest runHistory entry from state.yaml.
      const postState = await stateFn();
      const history = postState?.runHistory ?? [];
      const latest = history[history.length - 1];
      if (
        latest !== undefined &&
        latest !== null &&
        typeof latest === "object"
      ) {
        const entry = latest as { tokensIn?: unknown; tokensOut?: unknown };
        if (typeof entry.tokensIn === "number") iterTokensIn = entry.tokensIn;
        if (typeof entry.tokensOut === "number")
          iterTokensOut = entry.tokensOut;
      }
    }
    loopMetrics = {
      ...loopMetrics,
      tokensIn: loopMetrics.tokensIn + iterTokensIn,
      tokensOut: loopMetrics.tokensOut + iterTokensOut,
    };

    // Story 4.5: 80%-warning emission for time/token budgets. The
    // emission happens AFTER the iteration completes (so the predicates
    // see the just-completed iteration's metrics on the NEXT iteration's
    // pre-iter check) and BEFORE the next shouldStop call. The latches
    // (warned80Time, warned80Token) ensure each warning fires AT MOST
    // ONCE per loop run.
    if (args.timeBudgetMs !== undefined && !loopMetrics.warned80Time) {
      const elapsedMs =
        (Bun.nanoseconds() - loopMetrics.startedAtNs) / 1_000_000;
      if (elapsedMs >= args.timeBudgetMs * 0.8) {
        stderrFn(
          `Warning: time-budget at 80% (elapsed ${Math.round(elapsedMs)}ms of ${args.timeBudgetMs}ms budget).\n`,
        );
        loopMetrics = { ...loopMetrics, warned80Time: true };
      }
    }
    if (args.tokenBudget !== undefined && !loopMetrics.warned80Token) {
      const totalTokens = loopMetrics.tokensIn + loopMetrics.tokensOut;
      if (totalTokens >= args.tokenBudget * 0.8) {
        stderrFn(
          `Warning: token-budget at 80% (used ${totalTokens} of ${args.tokenBudget} tokens).\n`,
        );
        loopMetrics = { ...loopMetrics, warned80Token: true };
      }
    }

    // Story 4.3 §Open Question 2: deferred-baseline capture for the
    // fresh-project edge case. When `loopContext.startStory === null`
    // (no prior successful step at loop entry), update the baseline
    // from the just-completed iteration's state so subsequent
    // iterations have something to compare against. The same applies
    // to `loopContext.startPhase` when `args.phaseEnd === true`.
    if (loopContext.startStory === null || loopContext.startPhase === null) {
      const postState = await stateFn();
      let nextStartStory = loopContext.startStory;
      let nextStartPhase = loopContext.startPhase;
      if (loopContext.startStory === null) {
        const story = postState?.lastSuccessfulStep?.story ?? null;
        if (story !== null) {
          nextStartStory = story;
        }
      }
      if (
        loopContext.startPhase === null &&
        args.phaseEnd === true &&
        loopDag !== null
      ) {
        const step = postState?.lastSuccessfulStep?.step;
        if (step !== undefined && step !== null) {
          const phase = loopDag.nodes.get(step)?.phase ?? null;
          if (phase !== null) {
            nextStartPhase = phase;
          }
        }
      }
      loopContext = { startStory: nextStartStory, startPhase: nextStartPhase };
    }

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

  // Defensive: stopReason cannot be null because the default-cap
  // injection (Story 4.4) ensures `args.maxIters` is non-undefined
  // whenever no other stop condition is supplied — so `shouldStop`
  // ALWAYS fires on `iterCount === maxIters` if no other predicate
  // fires sooner, AND halt-on-error short-circuits before this point.
  // TypeScript can't prove the invariant; cast via assertion:
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
 * final AR9 line.
 *
 *   - max-iters-reached:  "max-iters (N) reached" (Story 4.4 AC-2
 *                         verbatim per epics.md line 950). The `(N)`
 *                         is the cap value (`stopReason.maxIters`),
 *                         not the actual iter count — tracked as
 *                         OQ-1 in the Story 4.4 spec.
 *   - halt-on-error:      "halt on error (<failureCode>) at iteration <N>".
 *   - epic-end-reached / until-story-reached / next-story-reached /
 *     phase-end-reached:  delegated to the predicate's `message` field
 *                         (Story 4.2/4.3 verbatim per their AC-1/AC-2).
 *   - time-budget-reached / token-budget-reached:
 *                         delegated to the predicate's `message` field
 *                         (Story 4.5 AC-1/AC-2 verbatim — "time-budget
 *                         (Xh) reached, partial work committed" /
 *                         "token-budget (N) reached, used X tokensIn +
 *                         Y tokensOut").
 */
function formatExitReason(stopReason: StopReason): string {
  switch (stopReason.code) {
    case "max-iters-reached":
      // AC-2 verbatim: "max-iters (N) reached" (epics.md line 950).
      return `max-iters (${stopReason.maxIters}) reached`;
    case "halt-on-error":
      return `halt on error (${stopReason.failureCode}) at iteration ${stopReason.iterCount}`;
    case "epic-end-reached":
      return stopReason.message;
    case "until-story-reached":
      return stopReason.message;
    case "next-story-reached":
      // AC-1 verbatim message ("next-story boundary reached") plus
      // structured from→to context per Story 4.2 precedent (AR9 summary
      // may include extra context beyond the predicate's `message` field).
      return `next-story boundary reached (${stopReason.startStory} → ${stopReason.currentStory})`;
    case "phase-end-reached":
      // AC-2 verbatim message format already includes the from→to context.
      return stopReason.message;
    case "time-budget-reached":
      // Story 4.5 AC-1 verbatim: "time-budget (Xh) reached, partial work
      // committed" (epics.md line 966). The message is composed by the
      // predicate via formatTimeBudget(args.timeBudgetMs); we delegate
      // to the predicate's message field for AC-byte-identical text.
      return stopReason.message;
    case "token-budget-reached":
      // Story 4.5 AC-2: "the exit reason includes the actual usage
      // stats" — the predicate composes the message using budget +
      // tokensIn + tokensOut.
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
