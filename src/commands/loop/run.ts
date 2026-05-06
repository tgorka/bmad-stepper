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
 *   - 1 — `halt-on-error` OR `error-stop` (Story 4.6 — verifier failure
 *         under default `--stop-on-error` policy). Both variants surface
 *         exit code `1` per FR53 `halt-with-actionable-error`; the
 *         AR22-conformant message text is the differentiator (the
 *         `error-stop` variant emits `error (verifier failure on <step>)
 *         — see <run-log-path>` per AC-1; `halt-on-error` retains the
 *         v0.1 generic-halt message format for non-verifier halts).
 *   - 2 — argv parse error (configuration error).
 *
 * Plan-mode (`--plan-first`, Story 4.7) ALWAYS maps to exit code `0`
 * (clean exit; the dry-run is the success path per AC-1). The plan body
 * is carried in the AR9 `"report"` action's `message` field; the exit
 * code is fixed.
 *
 * Architecture cross-references:
 *   - architecture.md §line 1294-1302 (AR41 top-tier import boundary).
 *   - architecture.md §line 1660 (AR9 protocol concretization).
 *   - architecture.md §line 1672 (run.ts is read-only / lock-free).
 *   - epics.md §Story 4.1 lines 891-903 (AC verbatim source).
 *   - epics.md §Epic 4 lines 887-1062 (Stories 4.1-4.10 stop-condition map).
 */

import * as fs from "node:fs/promises";
import { build as buildDag } from "../../dag/build.ts";
import type { DagAdjacency, Phase } from "../../dag/index.ts";
import { emitDispatchAction } from "../../dispatch/index.ts";
import { ConfigError, StepperError } from "../../errors.ts";
import { atomicWrite } from "../../io/atomic-write.ts";
import { error, warn } from "../../io/log.ts";
import type { DispatchActionV1 } from "../../schemas/dispatch-protocol.ts";
import type { State } from "../../schemas/state.ts";
import { loadStateUnlocked } from "../../state/load.ts";
import { type NextResult, type RunNextOptions, runNext } from "../next/run.ts";
import { type LoopArgs, parseLoopArgs } from "./args.ts";
import { computePlan, formatPlan, type Plan } from "./plan.ts";
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
  /**
   * Discriminator from runNext's AR9 action variant. Story 4.6 SF-2
   * cleanup: REMOVED the v0.1 defensive `"unknown"` member because no
   * production code emits it. The dispatch protocol at
   * `src/schemas/dispatch-protocol.ts` is closed-set per AR9 (Story 2.2)
   * — any future variant requires a state-schema bump that would also
   * extend this discriminator. Keeping the type honest avoids
   * defensive default-branches in `formatExitReason` consumers.
   */
  readonly action: "dispatch" | "report" | "halt";
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
 * (`--stop-on-error`, `--continue-on-error`) extends with ONE MORE
 * variant (`error-stop`) emitted by the runner's halt-on-error short-
 * circuit at run.ts:735-745 when the failure source is a verifier
 * failure (`state.lastFailureReason.code === "VERIFIER_FAILURE"`);
 * other halt sources (e.g., `LOCK_CONTENTION`) continue to surface as
 * `halt-on-error` to preserve tooling-consumer compatibility.
 *
 * Story 4.9 EXTENDS the union with ONE MORE variant (`manual-sigint`)
 * constructed DIRECTLY by the runner body when `shutdownRequested ===
 * true` — NOT via `evaluateStopConditions` dispatch. This mirrors the
 * existing `halt-on-error` and `error-stop` runner-direct variants.
 * `manual-sigint` maps to exit code `0` (clean exit per FR53 — the user
 * requested the halt deliberately).
 *
 * Story 5.5 EXTENDS the union with ONE MORE variant
 * (`manual-interactive-halt`) constructed DIRECTLY by the runner body
 * when `args.interactive === true` AND the user's stdin response to the
 * per-iteration `Continue? [y/N]` prompt is anything OTHER than
 * case-insensitive `y` (with optional surrounding whitespace). NOT
 * dispatched via `evaluateStopConditions`. This mirrors the existing
 * Story 4.9 `manual-sigint` runner-direct variant. `manual-interactive-
 * halt` maps to exit code `0` (clean exit per FR53 — the user requested
 * the halt deliberately). The variant carries the actual response
 * (`response: string`) for forensic visibility, the ISO timestamp the
 * response was received at (`receivedAt: string`), and the AC-3
 * verbatim message text "manual (interactive halt) — --resume
 * available" (em-dash U+2014; epics.md line 1131).
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
    }
  | {
      code: "error-stop";
      failureCode: string;
      iterCount: number;
      step: string | null;
      runLogPath: string | null;
      message: string;
    }
  | {
      // Story 4.9: SIGINT graceful exit. Constructed DIRECTLY by the
      // runner body when `shutdownRequested === true` — NOT via
      // `evaluateStopConditions` dispatch (mirrors the existing
      // `halt-on-error` and `error-stop` runner-direct variants).
      // `iterCount` is the iter count at SIGINT-observation (0 if
      // SIGINT arrived before the first iteration); `receivedAt` is
      // the ISO timestamp of signal delivery (set by the handler);
      // `message` is the AC-3 verbatim text (`"manual (SIGINT) — partial
      // work committed; --resume available"`, em-dash U+2014) composed
      // by the runner at construction.
      code: "manual-sigint";
      iterCount: number;
      receivedAt: string;
      message: string;
    }
  | {
      // Story 5.5: --interactive per-step pause, user response halt.
      // Constructed DIRECTLY by the runner body when stdin response is
      // non-`y` — NOT via `evaluateStopConditions` dispatch (mirrors
      // the existing `manual-sigint` runner-direct variant). `iterCount`
      // is the iter count at halt-observation (0 if halt fires before
      // iteration 1's body); `response` is the actual response received
      // (for forensic visibility); `receivedAt` is the ISO timestamp of
      // stdin response (set by the runner); `message` is the AC-3
      // verbatim text `"manual (interactive halt) — --resume available"`
      // (em-dash U+2014) composed by the runner at construction.
      code: "manual-interactive-halt";
      iterCount: number;
      response: string;
      receivedAt: string;
      message: string;
    };

/**
 * Structured return value from `runLoop` when invoked in iteration-body
 * mode (the default). Tests inspect this directly without mutating
 * stdout / process state. The `import.meta.main` block emits the AR9
 * line via `emitDispatchAction` and exits with `result.exitCode`.
 *
 * Story 4.7: the `mode: "loop"` discriminator field distinguishes this
 * from the new `PlanResult` shape returned in plan-mode. The discriminator
 * is the FIRST field for canonical positioning.
 */
export interface LoopResult {
  readonly mode: "loop";
  readonly stopReason: StopReason;
  readonly exitCode: 0 | 1 | 2;
  readonly iterations: readonly IterationRecord[];
  readonly durationMs: number;
  readonly startedAt: string;
  readonly completedAt: string;
}

/**
 * Structured return value from `runLoop` when invoked in plan-mode
 * (`--plan-first`). The plan-mode short-circuit at run.ts:486+ returns
 * this shape INSTEAD OF the iteration-body `LoopResult`. The
 * `import.meta.main` block branches on `result.mode` to dispatch the
 * AR9 emit + exit code.
 *
 * Fields:
 *   - mode           — Discriminator literal `"plan"`.
 *   - plan           — Structured `Plan` value (for tests / tooling).
 *   - formattedPlan  — Human-readable text body carried in the AR9
 *                      `"report"` action's `message` field.
 *   - exitCode       — Fixed at literal `0` (plan-mode is always clean).
 *   - startedAt      — ISO timestamp at plan-mode entry (observability).
 *   - completedAt    — ISO timestamp at plan-mode exit (observability).
 *   - durationMs     — Plan computation wall-clock in ms (observability).
 *
 * AC-3 reproducibility: `plan` and `formattedPlan` are byte-identical
 * across invocations on the same state. The wrapper fields
 * (`startedAt`, `completedAt`, `durationMs`) are NOT included in
 * `formattedPlan` and are NOT subject to the AC-3 guarantee.
 */
export interface PlanResult {
  readonly mode: "plan";
  readonly plan: Plan;
  readonly formattedPlan: string;
  readonly exitCode: 0;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
}

/**
 * Story 4.10 AC-3 input shape for `writeLoopExitTranscript`. The structured
 * loop-exit transcript JSON written under `runs/` captures aggregate loop-
 * level data (loopStartedAt / loopCompletedAt / iterationCount / total
 * durationMs) plus the StopReason variant + snapshot pointer + composed
 * message text. Schema is ad-hoc inline (Story 4.10 OQ-5 DEFERS the
 * formal `LoopExitTranscriptV1Schema` to Story 6.x telemetry consolidation).
 *
 * Field rationale:
 *   - loopStartedAt / loopCompletedAt — wall-clock bracket of the loop run.
 *   - stopReason                      — full StopReason discriminated union
 *                                       value for post-hoc analysis.
 *   - exitCode                        — FR53 mapping (0 / 1 / 2).
 *   - iterationCount                  — number of completed iterations.
 *   - durationMs                      — wall-clock duration in ms.
 *   - snapshotSha/Branch/TakenAt      — captured from state.lastSnapshot at
 *                                       loop-exit; null when no snapshot is
 *                                       available (non-Git, state-load fail).
 *   - message                         — the composed Story 4.10 message text
 *                                       (one or two lines joined by `\n`).
 */
export interface LoopExitTranscriptInput {
  readonly loopStartedAt: string;
  readonly loopCompletedAt: string;
  readonly stopReason: StopReason;
  readonly exitCode: 0 | 1 | 2;
  readonly iterationCount: number;
  readonly durationMs: number;
  readonly snapshotSha: string | null;
  readonly snapshotBranch: string | null;
  readonly snapshotTakenAt: string | null;
  readonly message: string;
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
  /**
   * Story 4.9 test-injection seam: replaces the production
   * `process.on('SIGINT', handler)` install with a stub. The stub
   * receives the runner's signal handler and returns an "uninstaller"
   * function that the runner calls in its body-wide `finally` block.
   * Tests pass a stub that captures the handler reference (so the
   * test can TRIGGER the simulated SIGINT by invoking the captured
   * handler directly — without actually killing the test runner via
   * `process.kill(process.pid, 'SIGINT')`) AND records install /
   * uninstall counts (so the test can assert the handler was removed
   * in the finally block per AR42 invariant). Production callers pass
   * nothing → the runner uses the real `process.on` + `process.off` pair.
   */
  readonly signalOverride?: (handler: () => void) => () => void;
  /**
   * Story 4.9 test-injection seam: optional ISO-timestamp source for
   * the `manual-sigint` `receivedAt` field (also reused for
   * `completedAt` in setup-phase early exit). Tests pass a deterministic
   * stub (`() => "2026-05-04T08:00:00Z"`) for assertion; production
   * code passes nothing → the runner calls `() => new Date().toISOString()`.
   */
  readonly nowOverride?: () => string;
  /**
   * Story 4.10 test-injection seam: replaces the `loadStateUnlocked()`
   * call performed at the import.meta.main loop-exit emission site. Tests
   * pass a stub returning a synthetic `State` (or `null` to simulate a
   * state-load failure); the import.meta.main block consumes the stub's
   * return value as `finalState` for the `formatLoopExitLines` second-line
   * snapshot pointer. Production callers pass nothing → the runner calls
   * the real `loadStateUnlocked()`.
   *
   * NOTE: this seam is INDEPENDENT from `stateOverride` — `stateOverride`
   * is consumed PER ITERATION inside `runLoop`; `finalStateOverride` is
   * consumed AT the import.meta.main site for the LOOP-FINAL state read.
   * The two seams may be supplied together (per-iter + loop-final) or
   * independently.
   */
  readonly finalStateOverride?: () => Promise<State | null> | State | null;
  /**
   * Story 4.10 test-injection seam: replaces the `writeLoopExitTranscript`
   * call performed at the import.meta.main loop-exit emission site. Tests
   * pass a stub that captures the input (asserting the structured
   * transcript shape) and returns a synthetic file path. Production
   * callers pass nothing → the runner uses the real `writeLoopExitTranscript`
   * (which writes to `_bmad-output/.stepper/runs/<ts>-loop-exit.json`).
   */
  readonly writeLoopExitTranscriptOverride?: (
    input: LoopExitTranscriptInput,
  ) => Promise<string> | string;
  /**
   * Story 5.1 test-injection seam: per-step failure policy override
   * threaded to `verify-and-advance.ts` via `RunNextOptions.failurePolicyOverride`.
   * Tests pass `"retry"` to exercise the retry loop deterministically;
   *
   * **TEST-ONLY SEAM (per Story 5.6 OQ-5)** — production resolution
   * flows through `resolveFailurePolicy(step, opts?.config)`. Production
   * callers do NOT pass this field; it remains for unit-test injection
   * without writing a config file.
   */
  readonly failurePolicyOverride?: import("../../failure-ux/index.ts").FailurePolicy;
  /**
   * Story 5.6 — optional parsed config object for per-step policy
   * resolution (FR31 PRIMARY). Production callers receive this from the
   * Story 6.1 file loader (when it lands); tests pass synthetic config
   * objects directly. Until Story 6.1 lands, the resolver is invoked with
   * `undefined` config in production → escalate-default for every step.
   *
   * The shape is a structural subset of `ConfigV1` (only the
   * `failurePolicies` field is consumed by the resolver). Using a
   * narrow shape here keeps the LoopOpts surface minimal and
   * decouples the runner from the full ConfigV1Schema.
   */
  readonly config?: {
    failurePolicies?: import("../../schemas/config.ts").FailurePolicies;
  };
  /**
   * Story 5.1 test-injection seam: max-retries override threaded to
   * `verify-and-advance.ts` via `RunNextOptions.maxRetriesOverride`.
   * Tests pass non-default values (e.g. `0` for zero-retry, `5` for
   * high-cap) to exercise boundary cases; production callers pass
   * nothing → the v0.1 default `2` retries (3 total attempts) per
   * architecture line 494.
   */
  readonly maxRetriesOverride?: number;
  /**
   * Story 5.5 test-injection seam: replaces the production
   * `Bun.stdin`-backed stdin reader used by the `--interactive` per-
   * iteration prompt with a stub. The stub returns the simulated user
   * response (one line WITHOUT the trailing newline). Tests pass a
   * stub that returns successive responses from a queue; production
   * callers pass nothing → the runner uses the real Bun.stdin async
   * iterator (per OQ-1 decision: Bun.stdin natively responds to SIGINT
   * via the existing `process.on("SIGINT")` handler from Story 4.9).
   *
   * Mirrors the Story 4.9 `signalOverride` seam pattern verbatim — a
   * closure-replaceable function returning the simulated response. The
   * production implementation reads ONE LINE from `Bun.stdin` via
   * `for await (const chunk of Bun.stdin.stream())` accumulating chunks
   * until the first `\n`; returns the accumulated line WITHOUT the
   * trailing newline. Defensive: empty-EOF → returns empty string
   * (treated as halt per the strict-`y` parsing rules per OQ-4).
   */
  readonly interactiveStdinOverride?: () => Promise<string> | string;
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
 * Story 4.7 (`--plan-first`) ADDS a pre-flight branch BEFORE the
 * iteration body. When `args.planFirst === true`, the runner performs
 * THREE one-shot read-only loads (state, sprint-status, DAG) and computes
 * a `Plan` value via `computePlan`; the formatted plan is returned via
 * the `PlanResult` discriminated-union variant. The plan-mode branch is
 * gated AFTER LoopArgs resolution and BEFORE the default-cap injection
 * — argv parse errors still fire correctly. The iteration body never
 * runs in plan-mode; ZERO tokens are spent on Task subagents.
 *
 * Architecture compliance:
 *   - AR8: lock-free top-tier; does not import `src/lock/`.
 *   - AR9: per-iteration AR9 lines are captured in-process; the loop's
 *          OWN AR9 line is emitted by `import.meta.main` only.
 *   - AR41: imports only top-tier sibling `runNext` (next/run.ts);
 *          intra-module `./args.ts` + `./plan.ts` + `./stop-conditions.ts`;
 *          foundational `errors.ts` + `io/log.ts` + `schemas/`;
 *          mid-tier `dispatch/index.ts` for the AR9 emit helper.
 */
export async function runLoop(
  opts?: LoopOpts,
): Promise<LoopResult | PlanResult> {
  // Story 4.9: SIGINT graceful exit. Install the OS-level signal
  // handler at runLoop entry — BEFORE args resolution — so SIGINT
  // arriving during args parse / plan-mode read / loop-entry baseline
  // capture is observed at the next strategic gate (setup-phase short-
  // circuit checks below). The handler ONLY toggles a closure-private
  // `shutdownRequested` flag + records the receivedAt timestamp; it
  // does NOT call `process.exit()`, does NOT emit AR9 lines, does NOT
  // touch state.yaml, does NOT release locks (per AR33 + AR9). The
  // closure-private flag scoping ensures multiple concurrent runLoop
  // invocations (uncommon but possible in tests) do NOT cross-contaminate.
  // Idempotency: a second SIGINT is a no-op (v0.1 conservative;
  // forward-tracker for Story 6.x force-quit-on-second-press).
  let shutdownRequested = false;
  let shutdownReceivedAt: string | null = null;
  const nowFn = opts?.nowOverride ?? (() => new Date().toISOString());
  const sigintHandler = (): void => {
    if (shutdownRequested) return; // idempotent — second SIGINT is a no-op
    shutdownRequested = true;
    shutdownReceivedAt = nowFn();
  };
  const installSignalFn =
    opts?.signalOverride ??
    ((handler: () => void): (() => void) => {
      process.on("SIGINT", handler);
      return () => {
        process.off("SIGINT", handler);
      };
    });
  const uninstallSignal = installSignalFn(sigintHandler);

  // Story 5.5: production stdin reader for the per-iteration `--interactive`
  // prompt. Uses `Bun.stdin` async iterator (per OQ-1 decision — matches
  // Bun-native preference; native SIGINT cooperation via the existing
  // process.on("SIGINT") handler installed above). Reads one line WITHOUT
  // the trailing newline; defensive empty-EOF returns empty string (treated
  // as halt per the strict-`y` parsing rules per OQ-4).
  const readStdinLineFn =
    opts?.interactiveStdinOverride ??
    (async (): Promise<string> => {
      const decoder = new TextDecoder();
      let buf = "";
      try {
        for await (const chunk of Bun.stdin.stream()) {
          buf += decoder.decode(chunk, { stream: true });
          const newlineIdx = buf.indexOf("\n");
          if (newlineIdx !== -1) {
            return buf.slice(0, newlineIdx).replace(/\r$/, "");
          }
        }
        // Stream ended with no newline: return accumulated buffer (possibly
        // empty when EOF arrived immediately or SIGINT closed the stream).
        return buf.replace(/\r$/, "");
      } catch {
        // Defensive: treat read failure as empty response (parser will halt).
        return "";
      }
    });

  try {
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

    // Story 4.9 AC-4/AC-5 setup-phase check #1: if SIGINT arrived during
    // args resolution, halt immediately without entering plan-mode or the
    // iteration loop. The check happens AFTER args resolution (so argv
    // parse errors still throw correctly) and BEFORE the plan-mode pre-
    // flight branch (so plan-mode SIGINT is also intercepted here).
    if (shutdownRequested) {
      const completedAt = nowFn();
      return {
        mode: "loop",
        stopReason: {
          code: "manual-sigint",
          iterCount: 0,
          receivedAt: shutdownReceivedAt ?? completedAt,
          message:
            "manual (SIGINT) — partial work committed; --resume available",
        },
        exitCode: 0,
        iterations: [],
        durationMs: 0,
        startedAt: completedAt,
        completedAt,
      };
    }

    // Story 4.7 AC-1: --plan-first short-circuits the iteration body.
    // Compute the plan, format it, and emit a single AR9 "report" line at
    // the import.meta.main block — exit 0 without dispatching anything.
    // The branch is gated AFTER LoopArgs resolution (argv parse errors
    // fire correctly) and BEFORE the default-cap injection (so plan-mode
    // never triggers the implicit 50-iter cap). All loaders/closures
    // below this point are unused in plan-mode.
    if (args.planFirst === true) {
      const planStartedAt = new Date().toISOString();
      const planStartNs: number = Bun.nanoseconds();

      // One-shot state read (lock-free per AR8 — same loader the iteration
      // body uses, but called ONCE before any iteration would have run).
      const planStateFn =
        opts?.stateOverride ??
        (async () => {
          try {
            return await loadStateUnlocked();
          } catch {
            return null;
          }
        });
      let planState: State | null = null;
      try {
        planState = await planStateFn();
      } catch {
        planState = null;
      }

      // One-shot sprint-status read.
      const planSprintStatusFn =
        opts?.sprintStatusOverride ?? loadSprintStatusForLoop;
      let planSprintStatus: SprintStatus | null = null;
      try {
        planSprintStatus = await planSprintStatusFn();
      } catch {
        planSprintStatus = null;
      }

      // One-shot DAG build (always — plan-mode requires the DAG to walk).
      const planDagFn =
        opts?.dagOverride ??
        (async () => {
          try {
            return await buildDag({ skillNames: [] });
          } catch {
            return null;
          }
        });
      let planDag: DagAdjacency | null = null;
      try {
        planDag = await planDagFn();
      } catch {
        planDag = null;
      }

      // Story 4.9 AC-4/AC-5 plan-mode SIGINT check: if SIGINT arrived
      // during plan-mode I/O (state / sprint-status / DAG one-shot
      // loads), halt cleanly with a `manual-sigint` LoopResult — NOT a
      // partial PlanResult. The user did not request a partial plan.
      if (shutdownRequested) {
        const completedAt = nowFn();
        return {
          mode: "loop",
          stopReason: {
            code: "manual-sigint",
            iterCount: 0,
            receivedAt: shutdownReceivedAt ?? completedAt,
            message:
              "manual (SIGINT) — partial work committed; --resume available",
          },
          exitCode: 0,
          iterations: [],
          durationMs: 0,
          startedAt: completedAt,
          completedAt,
        };
      }

      // Construct the Plan + formattedPlan.
      let plan: Plan;
      let formattedPlan: string;
      if (planState === null || planDag === null) {
        // Graceful fallback (Story 4.7 OQ-4): emit a single-line message
        // with an AR22-conformant hint. Plan-mode does NOT throw on read
        // failure — AC-1 mandates "exits 0 without dispatching anything".
        plan = {
          totalEstimatedSteps: 0,
          steps: [],
          totalEstimatedTokensIn: null,
          totalEstimatedTokensOut: null,
          modelsConfigPresent: false,
          checkpoints: [],
          checkpointEachConfigured: args.checkpointEach !== undefined,
          firstStopCondition: null,
        };
        formattedPlan =
          planState === null
            ? "Plan unavailable — state.yaml could not be read. Run /bmad-loop --doctor to diagnose."
            : "Plan unavailable — DAG build failed. Run /bmad-loop --doctor to diagnose.";
      } else {
        plan = computePlan(planState, planDag, planSprintStatus, args);
        formattedPlan = formatPlan(plan);
      }

      const planCompletedAt = new Date().toISOString();
      const planDurationMs = (Bun.nanoseconds() - planStartNs) / 1_000_000;

      return {
        mode: "plan",
        plan,
        formattedPlan,
        exitCode: 0,
        startedAt: planStartedAt,
        completedAt: planCompletedAt,
        durationMs: planDurationMs,
      };
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
    // Story 4.5 wired the time-budget + token-budget clauses; Story 4.6
    // wired the stop-on-error + continue-on-error clauses; Story 4.7
    // wired the plan-first clause — when `--plan-first` is supplied
    // alone (without `--max-iters`), the pre-flight branch (run.ts:486+)
    // short-circuits BEFORE this stanza is reached, but the defensive
    // clause is preserved for refactor-safety. The default-cap predicate
    // is now COMPLETE for all wired stop-condition flags.
    //
    // The default value (50) matches PRD §Bounded Loop Execution line 589
    // and epics.md §Story 4.4 AC-1 line 947.
    // The `planFirst` clause is defensive: at this point the plan-mode
    // pre-flight branch above has already returned when `args.planFirst
    // === true`, so TypeScript narrows the value to `false | undefined`
    // here. The cast preserves the symmetry of the predicate (10 clauses,
    // one per LoopArgsSchema field) and future-proofs against a
    // hypothetical refactor that moves the pre-flight gate INTO the
    // iteration body. Story 4.7 OQ-1 (deferred `hasExplicitStopCondition`
    // helper refactor).
    if (
      args.maxIters === undefined &&
      args.untilEpicEnd !== true &&
      args.untilStory === undefined &&
      args.nextStory !== true &&
      args.phaseEnd !== true &&
      args.timeBudgetMs === undefined &&
      args.tokenBudget === undefined &&
      args.stopOnError !== true &&
      args.continueOnError !== true &&
      (args.planFirst as boolean | undefined) !== true
    ) {
      args = { ...args, maxIters: 50 };
    }

    // Story 4.8: thread args.checkpointEach into per-iteration runNext
    // invocations so verify-and-advance.ts can match the just-completed
    // step's phase against the supplied step-type and append the
    // state.checkpoints[] entry. The closure preserves the
    // runNextOverride seam — when an override is supplied (test path),
    // it is called WITHOUT the production checkpointEach injection
    // (tests construct their own RunNextOptions directly).
    const productionRunNextFn = async (): Promise<NextResult> => {
      // Story 5.3: --auto-fix on /bmad-loop overrides the per-iteration
      // failurePolicyOverride to "route-to-fixer" per architecture line
      // 499 ("Loop-level `--auto-fix` flag overrides per-step policy to
      // `route-to-fixer` for one run"). The override is unconditional —
      // when args.autoFix === true ALL iterations of this loop run with
      // route-to-fixer policy. The threaded value flows through to
      // RunNextOptions.failurePolicyOverride which the lock-free
      // runNext composer captures and which verify-and-advance.ts
      // consumes via its own RunVerifyAndAdvanceOptions.failurePolicyOverride.
      //
      // Story 5.6 (FR31 PRIMARY): per-step config-driven resolution
      // happens at verify-and-advance.ts (the dispatch site where
      // `dispatchSpec.step` is computed). The loop-level composition
      // here threads `opts.config` downstream via RunNextOptions.config
      // → RunVerifyAndAdvanceOptions.config so the resolver can
      // consult `config.failurePolicies[step]`. The Story 5.6 priority
      // order at the dispatch site:
      //   1. --auto-fix → "route-to-fixer" (this branch when set)
      //   2. opts.failurePolicyOverride (TEST-ONLY SEAM per OQ-5)
      //   3. resolveFailurePolicy(step, opts.config) (production path)
      //   4. plugin default "escalate" (resolver fallback)
      const effectiveFailurePolicyOverride:
        | import("../../failure-ux/index.ts").FailurePolicy
        | undefined =
        args.autoFix === true ? "route-to-fixer" : opts?.failurePolicyOverride;
      return await runNext({
        ...(args.checkpointEach !== undefined
          ? { checkpointEach: args.checkpointEach }
          : {}),
        // Story 5.1: thread failurePolicyOverride + maxRetriesOverride
        // across the dispatch boundary. The lock-free runNext composer
        // captures these for verify-and-advance.ts consumption.
        // Story 5.3: --auto-fix overrides to "route-to-fixer" via the
        // effective override computed above.
        // Story 5.6: --auto-fix and the test-only failurePolicyOverride
        // SHORT-CIRCUIT the resolver at dispatch site; opts.config is
        // threaded for the production path (priority 3).
        ...(effectiveFailurePolicyOverride !== undefined
          ? { failurePolicyOverride: effectiveFailurePolicyOverride }
          : {}),
        ...(opts?.maxRetriesOverride !== undefined
          ? { maxRetriesOverride: opts.maxRetriesOverride }
          : {}),
        ...(opts?.config !== undefined ? { config: opts.config } : {}),
      });
    };
    const runNextFn = opts?.runNextOverride ?? productionRunNextFn;
    // Story 4.2: per-iteration state/sprint-status loaders. Tests inject
    // overrides; production reads `_bmad-output/.stepper/state.yaml` (via
    // `loadStateUnlocked` — the loop runner is read-only per AR8) +
    // `_bmad-output/implementation-artifacts/sprint-status.yaml`.
    const stderrFn =
      opts?.stderrOverride ??
      ((chunk: string) => {
        process.stderr.write(chunk);
      });

    // Story 4.6 OQ-4: when --continue-on-error is supplied alone (no
    // --max-iters and no other stop condition), the loop has no natural
    // exit. Emit a stderr warning at loop entry to alert the user that
    // they may have created an unbounded loop. The warning is single-
    // line per FR54 and fires AT MOST ONCE per loop run (loop-entry; no
    // per-iteration repetition). The default-cap stanza above already
    // suppresses the implicit 50-iter cap when --continue-on-error is
    // supplied — so this warning is the user-facing notification of
    // that suppression.
    if (
      args.continueOnError === true &&
      args.maxIters === undefined &&
      args.untilEpicEnd !== true &&
      args.untilStory === undefined &&
      args.nextStory !== true &&
      args.phaseEnd !== true &&
      args.timeBudgetMs === undefined &&
      args.tokenBudget === undefined
    ) {
      stderrFn(
        "Warning: --continue-on-error supplied without any stop condition; the loop may run indefinitely. Combine with --max-iters or another stop condition for safety.\n",
      );
    }
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
    const sprintStatusFn =
      opts?.sprintStatusOverride ?? loadSprintStatusForLoop;
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
    //
    // Story 4.8 EXTENDS the predicate to ALSO load the DAG when
    // `--checkpoint-each` is supplied — the runtime checkpoint-write
    // inside `verify-and-advance.ts` looks up the just-completed step's
    // `phase` via `dag.nodes.get(step)` to match against
    // `args.checkpointEach`. The opt-in is preserved (no DAG load when
    // neither flag is supplied).
    let loopDag: DagAdjacency | null = null;
    if (args.phaseEnd === true || args.checkpointEach !== undefined) {
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

    // Story 4.9 AC-4/AC-5 setup-phase check #2: if SIGINT arrived during
    // the loop-entry baseline capture (the awaited stateFn() call inside
    // the `loopContext` block above) or during the opt-in DAG build, halt
    // immediately without entering the iteration loop. This ensures the
    // setup-phase SIGINT path is bounded by ~one await call latency.
    if (shutdownRequested) {
      const completedAt = nowFn();
      return {
        mode: "loop",
        stopReason: {
          code: "manual-sigint",
          iterCount: 0,
          receivedAt: shutdownReceivedAt ?? completedAt,
          message:
            "manual (SIGINT) — partial work committed; --resume available",
        },
        exitCode: 0,
        iterations: [],
        durationMs: (Bun.nanoseconds() - loopStartNs) / 1_000_000,
        startedAt,
        completedAt,
      };
    }

    // Iterate until shouldStop fires.
    while (true) {
      // Story 4.9 AC-1 top-of-while SIGINT check: catches the case where
      // SIGINT arrives BETWEEN iterations (after iteration N's runNextFn
      // returned but before iteration N+1's shouldStop consult). Without
      // this, the next iteration would begin and only halt at the
      // iteration-body check below — a wasted iteration. Per AC-1,
      // halt BEFORE the next iteration.
      if (shutdownRequested) {
        stopReason = {
          code: "manual-sigint",
          iterCount,
          receivedAt: shutdownReceivedAt ?? nowFn(),
          message:
            "manual (SIGINT) — partial work committed; --resume available",
        };
        break;
      }
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
          stderrFn(
            "Run `/bmad-loop --resume` to continue from current state.\n",
          );
        }
        stopReason = reason;
        break;
      }

      // Story 5.5 AC-1/AC-2/AC-3/AC-4: --interactive per-step prompt + read
      // gate (FR30; AR9 + AR34). Fires AFTER the top-of-while SIGINT check
      // and AFTER the shouldStop call (so stop conditions like max-iters
      // take priority over the prompt — the user is NOT prompted before
      // an iteration that would not run anyway), and BEFORE the runNextFn
      // dispatch (so the user can halt the loop without consuming any
      // sub-agent tokens). DEVIATION D1 from spec line 271 ("BEFORE the
      // existing stateFn/sprintStatusFn/shouldStop call"): repositioned
      // AFTER shouldStop so max-iters / time-budget / token-budget /
      // until-* / next-story / phase-end / epic-end stop conditions take
      // priority over the per-iteration prompt — matches AC line 1125
      // wording "when each iteration is about to dispatch" (an iteration
      // that shouldStop would skip is NOT about to dispatch). Per OQ-3
      // decision: a post-stdin SIGINT re-check catches the case where
      // SIGINT arrives DURING the stdin await (Bun stdin natively responds
      // to SIGINT — the async iterator interrupts; the runner's iteration
      // body re-checks `shutdownRequested` and surfaces `manual-sigint`).
      // Per OQ-4 decision: case-insensitive strict-`y` parsing —
      // `response.trim().toLowerCase() === "y"` continues; any other
      // response (`n`, `N`, empty, blank, garbage, multi-character like
      // `yes`) halts with the new `manual-interactive-halt` StopReason.
      if (args.interactive === true) {
        // Emit the prompt as a single AR9 "report" JSON line (per AR9 +
        // FR54). Per OQ-6 decision: AR9 `report` action with prompt as
        // `message` field (no schema bump; reuses existing AR9 `report`
        // action). The slash-command markdown displays the prompt to the
        // user (per AC line 1125).
        emitDispatchAction({
          action: "report",
          message: "Continue? [y/N]",
          exitCode: 0,
        });

        // Read ONE LINE from stdin via the test-injectable seam. Production
        // path uses Bun.stdin async iterator (interruptible by SIGINT).
        const response = await readStdinLineFn();

        // Re-check SIGINT: the stdin read may have been interrupted by a
        // SIGINT signal (Bun.stdin natively responds to SIGINT). The double-
        // check ensures SIGINT-during-prompt is caught BEFORE the response-
        // parsing branch — surfaces as `manual-sigint` (NOT `manual-
        // interactive-halt`) per AC-4.
        if (shutdownRequested) {
          stopReason = {
            code: "manual-sigint",
            iterCount,
            receivedAt: shutdownReceivedAt ?? nowFn(),
            message:
              "manual (SIGINT) — partial work committed; --resume available",
          };
          break;
        }

        // Parse response: case-insensitive `y` → continue; anything else →
        // halt. Per OQ-4 decision: strict `y` discipline; multi-character
        // responses like `"yes"` are HALT (not continue) — matches the
        // prompt's `[y/N]` single-char convention.
        const normalized = response.trim().toLowerCase();
        if (normalized !== "y") {
          stopReason = {
            code: "manual-interactive-halt",
            iterCount,
            response,
            receivedAt: nowFn(),
            // AC-3 verbatim text (em-dash U+2014; consistent with Story 4.6
            // `error-stop` and Story 4.9 `manual-sigint` precedents).
            message: "manual (interactive halt) — --resume available",
          };
          break;
        }

        // `y` response → fall through to the runNextFn dispatch.
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
        loopContext = {
          startStory: nextStartStory,
          startPhase: nextStartPhase,
        };
      }

      // Story 4.9 AC-1/AC-2: SIGINT iteration-body short-circuit. Check
      // shutdownRequested AFTER the just-completed iteration's mutation is
      // fully captured (IterationRecord push + token accumulation +
      // 80%-warning latches + deferred-baseline capture all complete) so
      // the partial-iteration is visible in result.iterations[] for
      // forensic visibility, AND BEFORE the halt-on-error gate / the next
      // shouldStop call so we halt cleanly rather than mis-classifying a
      // SIGINT-induced halt as a halt-on-error or evaluating a stop-
      // condition we know we won't reach.
      if (shutdownRequested) {
        stopReason = {
          code: "manual-sigint",
          iterCount,
          receivedAt: shutdownReceivedAt ?? nowFn(),
          message:
            "manual (SIGINT) — partial work committed; --resume available",
        };
        break;
      }

      // Story 4.6 AC-1/AC-2: halt-on-error short-circuit, GATED on
      // args.continueOnError. Default policy (--stop-on-error implicit OR
      // explicit) halts the loop on first verifier failure. Explicit
      // --continue-on-error logs the failure to stderr but does NOT set
      // stopReason — the loop proceeds to the next iteration. The two
      // variants of failure halt (`error-stop` for verifier failures vs
      // `halt-on-error` for other halt sources) are dispatched by reading
      // state.lastFailureReason.code post-halt.
      if (nextResult.exitCode !== 0 || nextResult.action.action === "halt") {
        const failureCode = extractFailureCode(
          nextResult.action,
          nextResult.exitCode,
        );
        if (args.continueOnError === true) {
          // AC-2: log + continue. The IterationRecord still carries
          // action: "halt" + exitCode: 1 for forensic visibility (recorded
          // earlier in the loop body); we just don't set stopReason. The
          // stderr warning is single-line per FR54.
          stderrFn(
            `Warning: iteration ${iterCount} halted with ${failureCode}; continuing per --continue-on-error.\n`,
          );
          continue;
        }
        // AC-1: --stop-on-error (default) — halt the loop. Detect verifier-
        // failure path via state.lastFailureReason.code; otherwise fall back
        // to the existing halt-on-error semantics for non-verifier halts
        // (e.g., LOCK_CONTENTION, BMAD_INCOMPATIBLE).
        const postState = await stateFn();
        const failureReasonCode = postState?.lastFailureReason?.code;
        const lastAttemptedStep = postState?.lastAttempted?.step ?? null;
        const failureRunId = postState?.lastFailureReason?.runId ?? null;
        if (
          failureReasonCode === "VERIFIER_FAILURE" &&
          lastAttemptedStep !== null
        ) {
          const runLogPath =
            failureRunId !== null
              ? `_bmad-output/.stepper/runs/${failureRunId}/`
              : null;
          const message =
            runLogPath !== null
              ? `error (verifier failure on ${lastAttemptedStep}) — see ${runLogPath}`
              : `error (verifier failure on ${lastAttemptedStep})`;
          // FR26 + AR22 stderr emission: halt+resume hint analogous to
          // Story 4.2's --until-epic-end pointer + Story 3.1's hint.
          stderrFn(`${message}\n`);
          if (postState?.lastFailureReason?.hint !== undefined) {
            stderrFn(`${postState.lastFailureReason.hint}\n`);
          }
          stopReason = {
            code: "error-stop",
            failureCode,
            iterCount,
            step: lastAttemptedStep,
            runLogPath,
            message,
          };
        } else {
          stopReason = { code: "halt-on-error", iterCount, failureCode };
        }
        break;
      }
    }

    const completedAt = new Date().toISOString();
    const durationMs = (Bun.nanoseconds() - loopStartNs) / 1_000_000;

    // Compute exit code per FR53 mapping. Story 4.6: `error-stop` and
    // `halt-on-error` both map to exit code `1` (`halt-with-actionable-
    // error` per FR53); the AR22-conformant message is the differentiator.
    const exitCode: 0 | 1 | 2 =
      stopReason?.code === "halt-on-error" || stopReason?.code === "error-stop"
        ? 1
        : 0;

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
      mode: "loop",
      stopReason,
      exitCode,
      iterations,
      durationMs,
      startedAt,
      completedAt,
    };
  } finally {
    // Story 4.9: ensure the SIGINT handler is REMOVED on every exit
    // path (clean exit, plan-mode return, SIGINT-induced halt, thrown
    // error). Critical for AR42 test isolation: a leftover handler
    // from a prior test invocation would cross-contaminate subsequent
    // tests in the same process. The uninstaller is idempotent (safe
    // to call multiple times — Bun's `process.off` accepts duplicates).
    uninstallSignal();
  }
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
 *   - error-stop:         Story 4.6 AC-1 verbatim: "error (verifier
 *                         failure on <step>) — see <run-log-path>"
 *                         (epics.md line 982). The message is composed
 *                         by the runner from `state.lastFailureReason`
 *                         + `state.lastAttempted.step`; we delegate to
 *                         the stored message field for AC-byte-
 *                         identical text.
 *   - manual-sigint:      Story 4.9 AC-3 verbatim: "manual (SIGINT) —
 *                         partial work committed; --resume available"
 *                         (epics.md line 1028; em-dash U+2014). The
 *                         message is composed by the runner at
 *                         construction (run.ts setup-phase + iteration-
 *                         body checks); we delegate to the stored
 *                         message field for AC-byte-identical text.
 *   - manual-interactive-halt:
 *                         Story 5.5 AC-3 verbatim: "manual (interactive
 *                         halt) — --resume available" (epics.md line
 *                         1131; em-dash U+2014). The message is composed
 *                         by the runner at construction (iteration-body
 *                         interactive-prompt gate when the user response
 *                         is non-`y`); we delegate to the stored message
 *                         field for AC-byte-identical text.
 */
// Exported for Story 4.9 SI_49_7 test (AC-3 byte-identical assertion).
// The function is also consumed by the import.meta.main block below.
export function formatExitReason(stopReason: StopReason): string {
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
    case "error-stop":
      // Story 4.6 AC-1 verbatim: "error (verifier failure on <step>) —
      // see <run-log-path>" (epics.md line 982). The message is
      // composed by the runner via state.lastFailureReason; we delegate
      // to the stored message field for AC-byte-identical text.
      return stopReason.message;
    case "manual-sigint":
      // Story 4.9 AC-3 verbatim: "manual (SIGINT) — partial work
      // committed; --resume available" (epics.md line 1028; em-dash
      // U+2014). The message is composed by the runner at construction
      // (setup-phase early-exit + iteration-body short-circuit); we
      // delegate to the stored message field for AC-byte-identical text.
      return stopReason.message;
    case "manual-interactive-halt":
      // Story 5.5 AC-3 verbatim: "manual (interactive halt) —
      // --resume available" (epics.md line 1131; em-dash U+2014). The
      // message is composed by the runner at construction (iteration-
      // body interactive-prompt gate when the user response is non-`y`);
      // we delegate to the stored message field for AC-byte-identical text.
      return stopReason.message;
  }
}

/**
 * Story 4.10 AC-1/AC-2: composes the loop-exit message text for the
 * AR9 final emission. Returns the AC-mandated two-line shape:
 *
 *   Loop exited: <reason>.
 *   Snapshot: <state.yaml.lastSnapshot.sha>. Resume: /bmad-next --resume.
 *
 * Where <reason> is delegated to formatExitReason(stopReason) (the
 * existing per-variant first-line text — Story 4.10 does NOT regress
 * any per-variant AC text). The two lines are joined by a literal `\n`
 * newline character; the AR9 outer JSON envelope at import.meta.main
 * carries the resulting string in its `message` field (the embedded
 * `\n` is JSON-escape-preserved on the wire and unescaped at the
 * display layer per AR9 single-line discipline).
 *
 * Snapshot-null fallback (AC line 1043 "one or two lines"): when
 * `state.lastSnapshot` is `null`/`undefined` OR `state.lastSnapshot.sha`
 * is missing/empty, the function returns the FIRST LINE ONLY (no
 * second line, no trailing snapshot/resume segment). This honours
 * Story 1.8 AC-3 — non-Git projects have null `lastSnapshot` and
 * MUST NOT emit a fake or placeholder snapshot value.
 *
 * Pure function: NO I/O, NO side effects. Reads `state.lastSnapshot`
 * via the passed `state` argument (caller is responsible for the
 * one-shot `loadStateUnlocked()` per AR8 lock-free top-tier).
 *
 * AR41 boundary: consumes `State` import from `src/schemas/state.ts`
 * (already imported by `runLoop` for the per-iteration state read);
 * NO new cross-tier imports.
 *
 * @param stopReason - The discriminated-union StopReason value (10 variants).
 * @param state - The final loaded state (or null when state load failed).
 * @returns The composed message text — one line OR two lines joined by `\n`.
 */
export function formatLoopExitLines(
  stopReason: StopReason,
  state: State | null,
): string {
  const firstLine = `Loop exited: ${formatExitReason(stopReason)}.`;
  const sha = state?.lastSnapshot?.sha;
  if (sha === undefined || sha === null || sha === "") {
    // Snapshot-null fallback per AC "one or two lines": single-line
    // emission when no snapshot is available (Story 1.8 AC-3 non-Git
    // case OR state load failure).
    return firstLine;
  }
  const secondLine = `Snapshot: ${sha}. Resume: /bmad-next --resume.`;
  return `${firstLine}\n${secondLine}`;
}

/**
 * Story 4.10 AC-3: writes a final transcript log entry under runs/
 * capturing the structured loop-exit reason + snapshot + iteration
 * count + duration. Single JSON object per loop run (the file content
 * is one JSON object per loop run). Best-effort: failure to write is
 * logged via `warn` at the import.meta.main caller (does NOT mask the
 * AR9 exit emission).
 *
 * The transcript file is located at:
 *
 *   _bmad-output/.stepper/runs/<loopStartedAtTs>-loop-exit.json
 *
 * Where <loopStartedAtTs> is the filesystem-safe form of the loop's
 * startedAt ISO timestamp (mirror src/runs/write-step.ts deriveTimestamp
 * pattern: replace `:` with `-`; drop `.<ms>` suffix; drop trailing `Z`).
 *
 * Schema: ad-hoc inline JSON shape (Story 4.10 OQ-5 DEFERS the formal
 * LoopExitTranscriptV1Schema to Story 6.x telemetry consolidation).
 *
 * AR41 boundary: consumes `atomicWrite` from `src/io/atomic-write.ts`
 * (foundational tier — already imported by mid-tier `src/runs/write-
 * step.ts`); NO new cross-tier imports beyond the existing top-tier
 * surface. The transcript file path stays inside STEPPER_INTERNAL_ROOT
 * (`_bmad-output/.stepper/`) per NFR-S2 + Story 1.3 assertWithinScope.
 *
 * @param input - Structured loop-exit transcript input.
 * @returns The written file path (absolute or relative to project root).
 */
export async function writeLoopExitTranscript(
  input: LoopExitTranscriptInput,
): Promise<string> {
  // Filesystem-safe ts derivation per Story 2.5 src/runs/write-step.ts
  // line 73-83 pattern: replace `:` with `-`; drop `.<ms>` suffix; drop
  // trailing `Z`. e.g., 2026-05-04T08:51:46Z → 2026-05-04T08-51-46.
  const ts = input.loopStartedAt
    .replace(/:/g, "-")
    .replace(/\.\d+/, "")
    .replace(/Z$/, "");
  const filePath = `_bmad-output/.stepper/runs/${ts}-loop-exit.json`;
  // Compose the structured transcript JSON. Single JSON object;
  // pretty-printed (2-space indent) for human readability +
  // grep-friendly downstream consumption. Trailing newline per
  // POSIX convention (mirror src/runs/write-step.ts step 8).
  const transcriptJson = `${JSON.stringify(
    {
      schemaVersion: 1,
      kind: "loop-exit",
      loopStartedAt: input.loopStartedAt,
      loopCompletedAt: input.loopCompletedAt,
      stopReason: input.stopReason,
      exitCode: input.exitCode,
      iterationCount: input.iterationCount,
      durationMs: input.durationMs,
      snapshot:
        input.snapshotSha !== null
          ? {
              sha: input.snapshotSha,
              branch: input.snapshotBranch,
              takenAt: input.snapshotTakenAt,
            }
          : null,
      message: input.message,
    },
    null,
    2,
  )}\n`;
  // Ensure parent directory exists (mirror src/runs/write-step.ts step 6).
  const parentDir = filePath.substring(0, filePath.lastIndexOf("/"));
  await fs.mkdir(parentDir, { recursive: true });
  // Atomic write per NFR-S5 (Story 1.3 surface — tmp+rename + .bak rotation).
  await atomicWrite(filePath, transcriptJson);
  return filePath;
}

// ─── import.meta.main entrypoint ──────────────────────────────────────────

if (import.meta.main) {
  try {
    const result = await runLoop({ argv: process.argv.slice(2) });
    if (result.mode === "plan") {
      // Story 4.7 AC-1: plan-mode emits a single AR9 "report" line
      // carrying the human-readable plan in its message field. Exit
      // code is fixed at 0 (clean exit; the dry-run is the success path).
      emitDispatchAction({
        action: "report",
        message: result.formattedPlan,
        exitCode: result.exitCode,
      });
      process.exit(result.exitCode);
    }
    // Story 4.10: read the final state to obtain lastSnapshot.sha for the
    // AC-mandated second-line snapshot pointer. The read is one-shot,
    // lock-free per AR8 (loadStateUnlocked is the read-only loader the
    // iteration body also uses). Failure to read the state degrades to
    // single-line emission per the snapshot-null fallback in
    // formatLoopExitLines (state === null case).
    let finalState: State | null = null;
    try {
      finalState = await loadStateUnlocked();
    } catch {
      finalState = null;
    }
    const message = formatLoopExitLines(result.stopReason, finalState);
    emitDispatchAction({
      action: "report",
      message,
      exitCode: result.exitCode,
    });
    // Story 4.10 AC-3: write a final transcript log entry under runs/
    // capturing the structured exit reason + snapshot + iteration count.
    // Best-effort: failure to write the loop-final transcript does NOT
    // mask the AR9 exit emission (same pattern as verify-and-advance.ts:
    // 790-794 transcript write).
    try {
      await writeLoopExitTranscript({
        loopStartedAt: result.startedAt,
        loopCompletedAt: result.completedAt,
        stopReason: result.stopReason,
        exitCode: result.exitCode,
        iterationCount: result.iterations.length,
        durationMs: result.durationMs,
        snapshotSha: finalState?.lastSnapshot?.sha ?? null,
        snapshotBranch: finalState?.lastSnapshot?.branch ?? null,
        snapshotTakenAt: finalState?.lastSnapshot?.takenAt ?? null,
        message,
      });
    } catch (writeErr) {
      // Best-effort transcript write — log via warn (not error) to
      // avoid masking the legitimate exit code; the AR9 emit was the
      // canonical user-facing report.
      warn(
        `loop: loop-exit transcript write failed (non-fatal): ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`,
      );
    }
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
