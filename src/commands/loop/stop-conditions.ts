/**
 * src/commands/loop/stop-conditions.ts — Pure-function stop-condition
 * predicates for `/bmad-loop` (FR8, FR9, FR19, AR9, AR21, AR33, AR41, AR42).
 *
 * Top-tier module per AR41 (architecture lines 1294-1302). Pure functions
 * only — ZERO I/O imports, ZERO `console.*` calls, ZERO throws (all error
 * paths return `null` for graceful degradation; the runLoop's per-iteration
 * loader handles I/O failures and passes `null` for `state`/`dag`/
 * `sprintStatus` when load fails).
 *
 * Story 4.2 shipped TWO predicates (`untilEpicEndStopCondition`,
 * `untilStoryStopCondition`) plus the `evaluateStopConditions` dispatcher
 * + the `compareStoryIds` numeric-segment comparator helper. Story 4.3
 * EXTENDS the file with TWO MORE predicates (`nextStoryStopCondition`,
 * `phaseEndStopCondition`) + the `LoopContext` interface (loop-entry
 * baseline captured by `runLoop`); the dispatcher signature widens to
 * accept an optional `loopContext` parameter; predicates that don't
 * need it ignore it. Stories 4.5 (`--time-budget`, `--token-budget`)
 * and 4.6 (`--stop-on-error` / `--continue-on-error`) will EXTEND
 * further following the same `(state, dag, args, sprintStatus?,
 * loopContext?) => StopReason | null` contract.
 *
 * §AC-3 contract widening: AC-3 (epics.md line 919) literally says
 * "exports each stop-condition as a pure function `(state, dag) => boolean`".
 * v0.1 conservative widens to `(state, dag, args, sprintStatus?) =>
 * StopReason | null` per Story 4.2 §Open Question 1 — `args` is required
 * to short-circuit when the flag is undefined, `sprintStatus` is required
 * for `untilEpicEndStopCondition`'s "all stories done" check, and the
 * richer `StopReason` return shape preserves Story 4.1's
 * `LoopResult.stopReason` discriminated union. The "boolean" wording in
 * AC-3 is interpreted as the BINARY OUTCOME (fired vs not-fired); the
 * `StopReason` return carries the metadata.
 *
 * §State-shape note (deviation from story spec): the story spec text uses
 * `state.workflow.epic` / `state.workflow.story` field names; the actual
 * `State` Zod schema (`src/schemas/state.ts`) uses
 * `state.lastSuccessfulStep.epic` (number) / `state.lastSuccessfulStep.story`
 * (string). v0.1 conservative reads from the actual schema fields and
 * normalises the `epic` number to its string representation. Tracked as
 * Open Question 10 (added during dev-story implementation).
 *
 * Architecture cross-references:
 *   - architecture.md §AR41 lines 1294-1302 (boundary graph; top-tier
 *     may import foundational types).
 *   - architecture.md §AR33 (no console.*; throw not Result;
 *     async/await — pure predicates return `null | StopReason`).
 *   - epics.md §Story 4.2 lines 905-919 (AC verbatim source; AC-3 line 919
 *     pure-function file structure mandate).
 */

import type { DagAdjacency, Phase } from "../../dag/index.ts";
import type { State } from "../../schemas/state.ts";
import type { LoopArgs } from "./args.ts";
import type { StopReason } from "./run.ts";

// Type alias kept for forward-compatibility with the story spec's
// `Dag` reference; the project's canonical type is `DagAdjacency` from
// `src/dag/types.ts`. Stories 4.3 + later may rename if a richer Dag
// abstraction emerges.
export type Dag = DagAdjacency;

/**
 * Loop-entry baseline context captured by `runLoop` BEFORE the first
 * iteration runs. Consumed by `nextStoryStopCondition` and
 * `phaseEndStopCondition` (Story 4.3) to detect transitions away from
 * the baseline.
 *
 * `startStory` is the value of `state.lastSuccessfulStep?.story` at
 * loop entry (or `null` when no prior successful step). `startPhase`
 * is the corresponding phase from
 * `dag.nodes.get(state.lastSuccessfulStep.step)?.phase` at loop entry
 * (or `null` when DAG not loaded or step not found).
 *
 * v0.1 conservative: when both fields are `null`, the predicates
 * short-circuit (no baseline to compare against). The runLoop captures
 * the FIRST iteration's resulting story/phase as a fallback baseline
 * when `lastSuccessfulStep === null` at entry — see `runLoop` body
 * (Story 4.3 §Open Question 2 deferred-baseline adjudication).
 *
 * Fields are `readonly` per Story 4.3 §Open Question 9 (immutable
 * struct; the runLoop creates a new object via spread when updating
 * the baseline).
 */
export interface LoopContext {
  readonly startStory: string | null;
  readonly startPhase: Phase | null;
}

/**
 * Loop-level runtime metrics captured by `runLoop` for the budget
 * predicates (Story 4.5). The `runLoop` initialises this struct at
 * loop entry and updates it after each successful iteration. Pure
 * predicates (`timeBudgetStopCondition`, `tokenBudgetStopCondition`)
 * READ this struct to decide whether to halt; they do NOT mutate it.
 *
 * Fields:
 *   - startedAtNs: `Bun.nanoseconds()` snapshot at loop entry; subtract
 *                  to derive `elapsedMs` per-iteration.
 *   - tokensIn / tokensOut: cumulative token counts read from
 *                  `state.runHistory[].tokensIn / tokensOut` per AR10.
 *   - warned80Time / warned80Token: latches set true after the 80%-
 *                  warning is emitted to stderr; prevents repeated
 *                  emissions on subsequent iterations.
 *
 * Fields are `readonly` per Story 4.3 §Open Question 9 precedent
 * (immutable struct; the runLoop creates a new object via spread when
 * updating fields).
 */
export interface LoopMetrics {
  readonly startedAtNs: number;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly warned80Time: boolean;
  readonly warned80Token: boolean;
}

// ─── Public types ─────────────────────────────────────────────────────────

/**
 * Sprint-status YAML structure consumed by `--until-epic-end`. Subset of
 * `_bmad-output/implementation-artifacts/sprint-status.yaml`'s top-level
 * shape. The runLoop loads + parses + passes; the predicate consumes
 * read-only.
 */
export interface SprintStatus {
  readonly development_status: Readonly<Record<string, string>>;
}

/**
 * Pure-function stop-condition predicate signature. Stories 4.5/4.6
 * MUST follow this contract when adding new predicates.
 *
 * Story 4.3 widened the contract with an optional `loopContext`
 * parameter (the loop-entry baseline captured by `runLoop`). Predicates
 * that don't consume the baseline (e.g., `untilEpicEndStopCondition`,
 * `untilStoryStopCondition`) ignore it; predicates that DO consume it
 * (`nextStoryStopCondition`, `phaseEndStopCondition`) short-circuit
 * gracefully when the parameter is `undefined`.
 */
export type StopConditionFn = (
  state: State,
  dag: Dag,
  args: LoopArgs,
  sprintStatus?: SprintStatus,
  loopContext?: LoopContext,
  loopMetrics?: LoopMetrics,
) => StopReason | null;

// ─── compareStoryIds — numeric-segment comparator ─────────────────────────

/**
 * Compare two story-id strings (`"<epic>.<sub>"`) using numeric-segment
 * ordering. Returns `-1` if `a < b`, `0` if equal, `1` if `a > b`.
 *
 * Critical: `"1.10"` is numerically GREATER than `"1.2"` (because the
 * sub-story segment 10 > 2). Lexicographic ordering would return the
 * opposite — WRONG for story-id comparison. Used by:
 *   - `untilStoryStopCondition` (Story 4.2) for the AC-2 overshoot check.
 *   - `nextStoryStopCondition`  (Story 4.3) for the `--next-story` boundary.
 *   - `--stop-on-error` tie-breaks (Story 4.6) for failure-code lookups.
 *
 * Defensive parsing: malformed inputs (non-numeric segments, missing
 * segments) are compared via lexicographic fallback. v0.1 conservative —
 * Story 4.6 may enrich with a stricter validation path.
 *
 * Pure function; no I/O; no throws.
 *
 * @example
 *   compareStoryIds("1.1", "1.2") === -1
 *   compareStoryIds("1.10", "1.2") === 1   // numeric-segment, NOT lexical
 *   compareStoryIds("3.0", "2.99") === 1   // epic boundary
 *   compareStoryIds("4.0", "3.10") === 1   // overshoot canonical case
 */
export function compareStoryIds(a: string, b: string): -1 | 0 | 1 {
  if (a === b) return 0;
  const segA = a.split(".");
  const segB = b.split(".");
  const len = Math.max(segA.length, segB.length);
  for (let i = 0; i < len; i++) {
    const partA = segA[i] ?? "0";
    const partB = segB[i] ?? "0";
    const numA = Number.parseInt(partA, 10);
    const numB = Number.parseInt(partB, 10);
    // Defensive: if either segment is non-numeric, fall back to
    // lexicographic comparison of the remaining string. This preserves
    // a deterministic ordering for any input that survives Zod validation.
    if (Number.isNaN(numA) || Number.isNaN(numB)) {
      if (partA < partB) return -1;
      if (partA > partB) return 1;
      continue;
    }
    if (numA < numB) return -1;
    if (numA > numB) return 1;
  }
  return 0;
}

// ─── formatTimeBudget — pure helper (Story 4.5) ───────────────────────────

/**
 * Format an integer milliseconds value as the canonical
 * human-readable unit per AC-1 (`Xh` / `Xm` / `Xs` / `Xms`). Used by
 * `timeBudgetStopCondition` to produce the AC-1 byte-identical
 * exit-message text `time-budget (Xh) reached, partial work committed`
 * where `Xh` is the canonical formatted unit per `formatTimeBudget`.
 *
 * Rules:
 *   - ms >= 3_600_000 AND ms % 3_600_000 === 0 → `${ms / 3_600_000}h`
 *   - ms >= 60_000   AND ms % 60_000 === 0    → `${ms / 60_000}m`
 *   - ms >= 1_000    AND ms % 1_000 === 0     → `${ms / 1_000}s`
 *   - otherwise                                → `${ms}ms`
 *
 * Pure function; no I/O; no throws. Used ONLY by
 * `timeBudgetStopCondition` for message-text composition.
 *
 * Examples:
 *   formatTimeBudget(7_200_000) === "2h"
 *   formatTimeBudget(3_600_000) === "1h"
 *   formatTimeBudget(60_000)    === "1m"
 *   formatTimeBudget(500)       === "500ms"
 *   formatTimeBudget(0)         === "0ms"
 */
export function formatTimeBudget(ms: number): string {
  if (ms >= 3_600_000 && ms % 3_600_000 === 0) return `${ms / 3_600_000}h`;
  if (ms >= 60_000 && ms % 60_000 === 0) return `${ms / 60_000}m`;
  if (ms >= 1_000 && ms % 1_000 === 0) return `${ms / 1_000}s`;
  return `${ms}ms`;
}

// ─── untilEpicEndStopCondition (AC-1) ─────────────────────────────────────

/**
 * Fires when `args.untilEpicEnd === true` AND ALL stories in the current
 * epic are `done` per `sprintStatus.development_status` AND the
 * `epic-N-retrospective` entry is either `done` or `optional`.
 *
 * Returns a `StopReason` of code `"epic-end-reached"` carrying the epic
 * number + the verbatim AC-1 message text `"epic-end reached"`. The
 * runLoop emits the state-snapshot pointer + `--resume` hint to STDERR
 * per AC-1 + FR54 when this predicate fires.
 *
 * Pure function; no I/O; no throws. The `sprintStatus` parameter is
 * loaded by the runLoop and passed in; when it's `undefined`, the
 * predicate degrades gracefully and returns `null`.
 *
 * Per-epic story enumeration uses `sprintStatus.development_status` keys
 * filtered by `^${epic}-\d+-` pattern (e.g., `"3-1-..."`, `"3-2-..."`)
 * per Story 4.2 §Open Question 5. The DAG-based enumeration is available
 * as a fallback but the sprint-status keys naturally encode both the
 * enumeration AND the per-story status.
 *
 * Story 4.10 forward-tracker: enrich with `state.lastFailureReason.hint`
 * when relevant — `--until-epic-end` fires on CLEAN exit so there is no
 * failure hint to surface today.
 */
export function untilEpicEndStopCondition(
  state: State,
  _dag: Dag,
  args: LoopArgs,
  sprintStatus?: SprintStatus,
): StopReason | null {
  if (args.untilEpicEnd !== true) return null;
  if (sprintStatus === undefined) return null;

  // The story spec uses `state.workflow.epic` but the actual State schema
  // exposes `state.lastSuccessfulStep.epic`. v0.1 reads from the latter
  // and normalises to a string. Tracked as Open Question 10.
  const epicNum = state.lastSuccessfulStep?.epic;
  if (epicNum === undefined || epicNum === null) return null;
  const epic = String(epicNum);

  // Enumerate all stories in the current epic via sprint-status keys
  // matching `^${epic}-\d+-` (e.g., "3-1-foo", "3-2-bar", "3-10-baz").
  const storyKeyPattern = new RegExp(`^${epic}-\\d+-`);
  const storyKeys = Object.keys(sprintStatus.development_status).filter((k) =>
    storyKeyPattern.test(k),
  );
  if (storyKeys.length === 0) return null;

  const allStoriesDone = storyKeys.every(
    (k) => sprintStatus.development_status[k] === "done",
  );
  if (!allStoriesDone) return null;

  // Retrospective: either `done` OR `optional` per the sprint-status
  // STATUS DEFINITIONS comment block (`backlog`/`ready-for-dev`/
  // `in-progress`/`review`/`done` for stories; `optional`/`done` for
  // retros).
  const retroKey = `epic-${epic}-retrospective`;
  const retroStatus = sprintStatus.development_status[retroKey];
  // When the retro key is absent (legacy projects), v0.1 conservative
  // treats it as "no retro filed" → predicate does NOT fire. Story 4.10
  // may revise the absent-retro semantics.
  if (retroStatus === undefined) return null;
  const retroOk = retroStatus === "done" || retroStatus === "optional";
  if (!retroOk) return null;

  return {
    code: "epic-end-reached",
    epic,
    message: "epic-end reached",
  };
}

// ─── untilStoryStopCondition (AC-2) ───────────────────────────────────────

/**
 * Fires when `args.untilStory !== undefined` AND
 * `compareStoryIds(state.lastSuccessfulStep.story, args.untilStory) >= 0`
 * — i.e., exact match OR overshoot per the canonical numeric-segment
 * ordering.
 *
 * Returns a `StopReason` of code `"until-story-reached"` carrying the
 * `targetStory` (`args.untilStory`) + the `currentStory`
 * (`state.lastSuccessfulStep.story`) + the verbatim AC-2 message text
 * `"story <x.y> reached"`. The overshoot context is preserved in the
 * structured `currentStory` field, NOT prepended to the message text.
 *
 * Pure function; no I/O; no throws.
 *
 * AC-2 wording: "completes a step in story 3.2 OR begins a step in a
 * story past 3.2". v0.1 conservative implements ONLY the post-iteration
 * check (consistent with Story 4.1's per-iteration boundary at run.ts
 * firing AFTER each `runNext` returns success). The post-iteration check
 * naturally catches the overshoot because `state.lastSuccessfulStep.story`
 * is updated by the just-completed `verify-and-advance.ts` invocation.
 * Tracked as Open Question 3.
 */
export function untilStoryStopCondition(
  state: State,
  _dag: Dag,
  args: LoopArgs,
): StopReason | null {
  if (args.untilStory === undefined) return null;

  // The story spec uses `state.workflow.story` but the actual State
  // schema exposes `state.lastSuccessfulStep.story`. v0.1 reads from
  // the latter. Tracked as Open Question 10.
  const currentStory = state.lastSuccessfulStep?.story;
  if (currentStory === undefined || currentStory === null) return null;

  const cmp = compareStoryIds(currentStory, args.untilStory);
  if (cmp >= 0) {
    // Exact match (cmp === 0) OR overshoot (cmp > 0).
    return {
      code: "until-story-reached",
      targetStory: args.untilStory,
      currentStory,
      message: `story ${args.untilStory} reached`,
    };
  }
  return null;
}

// ─── nextStoryStopCondition (AC-1, Story 4.3) ─────────────────────────────

/**
 * Fires when `args.nextStory === true` AND `loopContext.startStory` was
 * captured at loop entry AND `compareStoryIds(state.lastSuccessfulStep.story,
 * loopContext.startStory) !== 0` — i.e., the just-completed iteration's
 * story DIFFERS from the loop-entry baseline.
 *
 * Returns a `StopReason` of code `"next-story-reached"` carrying the
 * `startStory` (baseline at loop entry) + the `currentStory` (post-
 * iteration story) + the verbatim AC-1 message text
 * `"next-story boundary reached"` (epics.md line 931).
 *
 * Pure function; no I/O; no throws. Inherits Story 4.2 §Open Question 3
 * adjudication (post-iteration check only — the predicate runs AFTER
 * each `runNext` returns success; the `state.lastSuccessfulStep.story`
 * is updated by the just-completed `verify-and-advance.ts` invocation).
 *
 * Re-uses `compareStoryIds` (Story 4.2) for numeric-segment ordering —
 * critical for the "1.10 vs 1.2" hazard where lexicographic ordering
 * would return the wrong sign. The predicate fires on ANY direction of
 * change (overshoot OR backshift); backshift is unexpected per BMAD
 * progression but the inequality is symmetric for safety.
 *
 * Edge cases (all return `null`):
 *   - `args.nextStory !== true` (flag absent or explicit-false).
 *   - `loopContext === undefined` (predicate called without context).
 *   - `loopContext.startStory === null` (fresh-project: baseline not
 *     yet captured; the runLoop will UPDATE the baseline after the
 *     first iteration per Story 4.3 §Open Question 2).
 *   - `state.lastSuccessfulStep === null/undefined` (defensive — should
 *     not happen post-iteration but guards against the fresh-project
 *     edge case).
 */
export function nextStoryStopCondition(
  state: State,
  _dag: Dag,
  args: LoopArgs,
  _sprintStatus: SprintStatus | undefined,
  loopContext: LoopContext | undefined,
): StopReason | null {
  if (args.nextStory !== true) return null;
  if (loopContext === undefined) return null;
  const baseline = loopContext.startStory;
  if (baseline === null) return null;

  const currentStory = state.lastSuccessfulStep?.story;
  if (currentStory === undefined || currentStory === null) return null;

  const cmp = compareStoryIds(currentStory, baseline);
  if (cmp !== 0) {
    return {
      code: "next-story-reached",
      startStory: baseline,
      currentStory,
      message: "next-story boundary reached",
    };
  }
  return null;
}

// ─── phaseEndStopCondition (AC-2, Story 4.3) ──────────────────────────────

/**
 * Fires when `args.phaseEnd === true` AND `loopContext.startPhase` was
 * captured at loop entry AND the just-completed iteration's step phase
 * (looked up via `dag.nodes.get(state.lastSuccessfulStep.step)?.phase`)
 * DIFFERS from `loopContext.startPhase`.
 *
 * Returns a `StopReason` of code `"phase-end-reached"` carrying the
 * `fromPhase` (baseline) + the `toPhase` (post-iteration) + the verbatim
 * AC-2 message text `"phase-end (transition <from>→<to>) reached"`
 * (epics.md line 933) — e.g., `"phase-end (transition planning→implementation) reached"`.
 *
 * The `→` character is the unicode RIGHTWARDS ARROW (U+2192). Per
 * Story 4.3 §Open Question 4, the source string uses the `→`
 * unicode escape to keep the source file byte-clean (Story 4.2
 * convention). The runtime-emitted message contains the actual arrow
 * character.
 *
 * Pure function; no I/O; no throws. The DAG dependency is HARD — the
 * predicate REQUIRES `dag.nodes` to be populated; the runLoop loads
 * the DAG opt-in only when `args.phaseEnd === true` (Story 4.3 §Open
 * Question 8 — opt-in to preserve zero-cost behaviour for the other
 * five stop-condition flags).
 *
 * Edge cases (all return `null`):
 *   - `args.phaseEnd !== true` (flag absent or explicit-false).
 *   - `loopContext === undefined` (predicate called without context).
 *   - `loopContext.startPhase === null` (fresh-project: baseline not
 *     yet captured OR DAG load failed at loop entry).
 *   - `state.lastSuccessfulStep === null/undefined` (defensive — fresh
 *     project pre-first-iteration).
 *   - `dag.nodes.get(currentStep) === undefined` (graceful degradation
 *     when the step is not in the DAG; should not happen per AR41 but
 *     defensive against Tier-3 unknown skills without phase metadata).
 *   - `currentPhase === fromPhase` (no transition).
 */
export function phaseEndStopCondition(
  state: State,
  dag: Dag,
  args: LoopArgs,
  _sprintStatus: SprintStatus | undefined,
  loopContext: LoopContext | undefined,
): StopReason | null {
  if (args.phaseEnd !== true) return null;
  if (loopContext === undefined) return null;
  const fromPhase = loopContext.startPhase;
  if (fromPhase === null) return null;

  const currentStep = state.lastSuccessfulStep?.step;
  if (currentStep === undefined || currentStep === null) return null;

  const node = dag.nodes.get(currentStep);
  if (node === undefined) return null;
  const toPhase = node.phase;
  if (toPhase === fromPhase) return null;

  return {
    code: "phase-end-reached",
    fromPhase,
    toPhase,
    // Unicode RIGHTWARDS ARROW (U+2192) per AC-2 verbatim.
    message: `phase-end (transition ${fromPhase}→${toPhase}) reached`,
  };
}

// ─── timeBudgetStopCondition (AC-1, Story 4.5) ────────────────────────────

/**
 * Fires when `args.timeBudgetMs !== undefined` AND
 * `loopMetrics.elapsedMs >= args.timeBudgetMs` — i.e., the wall-clock
 * elapsed time has reached or exceeded the budget.
 *
 * Returns a `StopReason` of code `"time-budget-reached"` carrying the
 * `budgetMs` (`args.timeBudgetMs`) + the `elapsedMs` (actual elapsed)
 * + the verbatim AC-1 message text
 * `"time-budget (Xh) reached, partial work committed"` where `Xh` is
 * the canonical formatted unit per `formatTimeBudget`.
 *
 * Pure function; no I/O; no throws. Reads `Bun.nanoseconds()` directly
 * to compute the elapsed since `loopMetrics.startedAtNs`. Per Open
 * Question 2, the predicate (not the runner) computes elapsed to keep
 * `LoopMetrics` immutable from the predicate's perspective.
 *
 * Edge cases (all return `null`):
 *   - `args.timeBudgetMs === undefined` (flag absent).
 *   - `loopMetrics === undefined` (predicate called without metrics).
 *   - `elapsedMs < args.timeBudgetMs` (under budget).
 *
 * The 80%-warning (per AC-1 wording "at 80% the loop emits a stderr
 * warning") is emitted by `runLoop` (NOT by this predicate); the
 * predicate signals only the 100% halt. The two-step pattern keeps
 * the predicate pure-function and the warning side-effect localised
 * to the runner.
 */
export function timeBudgetStopCondition(
  _state: State,
  _dag: Dag,
  args: LoopArgs,
  _sprintStatus: SprintStatus | undefined,
  _loopContext: LoopContext | undefined,
  loopMetrics: LoopMetrics | undefined,
): StopReason | null {
  if (args.timeBudgetMs === undefined) return null;
  if (loopMetrics === undefined) return null;
  const elapsedMs = (Bun.nanoseconds() - loopMetrics.startedAtNs) / 1_000_000;
  if (elapsedMs < args.timeBudgetMs) return null;
  const unit = formatTimeBudget(args.timeBudgetMs);
  return {
    code: "time-budget-reached",
    budgetMs: args.timeBudgetMs,
    elapsedMs,
    message: `time-budget (${unit}) reached, partial work committed`,
  };
}

// ─── tokenBudgetStopCondition (AC-2, Story 4.5) ───────────────────────────

/**
 * Fires when `args.tokenBudget !== undefined` AND
 * `loopMetrics.tokensIn + loopMetrics.tokensOut >= args.tokenBudget`
 * — i.e., the cumulative token usage has reached or exceeded the
 * budget.
 *
 * Returns a `StopReason` of code `"token-budget-reached"` carrying:
 *   - `budget` (`args.tokenBudget`)
 *   - `tokensIn` (cumulative input tokens at halt time)
 *   - `tokensOut` (cumulative output tokens at halt time)
 *   - `message`: AC-2 exit text WITH actual usage stats —
 *     `"token-budget (N) reached, used X tokensIn + Y tokensOut"`.
 *
 * Pure function; no I/O; no throws. The token accumulator is updated
 * by `runLoop` after each successful iteration by reading the latest
 * `state.runHistory[]` entry's `tokensIn / tokensOut` fields per AR10.
 *
 * Edge cases (all return `null`):
 *   - `args.tokenBudget === undefined` (flag absent).
 *   - `loopMetrics === undefined` (predicate called without metrics).
 *   - `tokensIn + tokensOut < args.tokenBudget` (under budget).
 *
 * The 80%-warning (per AC-2 wording "at 80% a warning is emitted")
 * is emitted by `runLoop` (NOT by this predicate); the predicate
 * signals only the 100% halt.
 */
export function tokenBudgetStopCondition(
  _state: State,
  _dag: Dag,
  args: LoopArgs,
  _sprintStatus: SprintStatus | undefined,
  _loopContext: LoopContext | undefined,
  loopMetrics: LoopMetrics | undefined,
): StopReason | null {
  if (args.tokenBudget === undefined) return null;
  if (loopMetrics === undefined) return null;
  const total = loopMetrics.tokensIn + loopMetrics.tokensOut;
  if (total < args.tokenBudget) return null;
  return {
    code: "token-budget-reached",
    budget: args.tokenBudget,
    tokensIn: loopMetrics.tokensIn,
    tokensOut: loopMetrics.tokensOut,
    message: `token-budget (${args.tokenBudget}) reached, used ${loopMetrics.tokensIn} tokensIn + ${loopMetrics.tokensOut} tokensOut`,
  };
}

// ─── evaluateStopConditions — dispatcher ──────────────────────────────────

/**
 * Dispatcher: evaluates each active stop-condition predicate in declaration
 * order; returns the first non-null `StopReason` or `null` when no predicate
 * fires.
 *
 * Story 4.6 will EXTEND this function with additional predicate
 * invocations following the same `(state, dag, args, sprintStatus?,
 * loopContext?, loopMetrics?) => StopReason | null` contract.
 *
 * Declaration order = priority order. The current order is:
 *   1. `untilEpicEndStopCondition`  (Story 4.2 — AC-1).
 *   2. `untilStoryStopCondition`    (Story 4.2 — AC-2).
 *   3. `nextStoryStopCondition`     (Story 4.3 — AC-1).
 *   4. `phaseEndStopCondition`      (Story 4.3 — AC-2).
 *   5. `timeBudgetStopCondition`    (Story 4.5 — AC-1).
 *   6. `tokenBudgetStopCondition`   (Story 4.5 — AC-2).
 *
 * When MULTIPLE predicates would fire on the same iteration, the dispatcher
 * returns the FIRST non-null in declaration order. The Story 4.5 placement
 * (after the Story 4.2/4.3 predicates) gives explicit user-facing flags
 * priority over budget exhaustion. Tracked as Open Question 4 in 4.5.
 *
 * Pure function; no I/O; no throws.
 */
export function evaluateStopConditions(
  state: State,
  dag: Dag,
  args: LoopArgs,
  sprintStatus?: SprintStatus,
  loopContext?: LoopContext,
  loopMetrics?: LoopMetrics,
): StopReason | null {
  const epicEnd = untilEpicEndStopCondition(state, dag, args, sprintStatus);
  if (epicEnd !== null) return epicEnd;

  const story = untilStoryStopCondition(state, dag, args);
  if (story !== null) return story;

  // Story 4.3 additions (AC-1, AC-2):
  const nextStory = nextStoryStopCondition(
    state,
    dag,
    args,
    sprintStatus,
    loopContext,
  );
  if (nextStory !== null) return nextStory;

  const phase = phaseEndStopCondition(
    state,
    dag,
    args,
    sprintStatus,
    loopContext,
  );
  if (phase !== null) return phase;

  // Story 4.5 additions (AC-1, AC-2):
  const timeBudget = timeBudgetStopCondition(
    state,
    dag,
    args,
    sprintStatus,
    loopContext,
    loopMetrics,
  );
  if (timeBudget !== null) return timeBudget;

  const tokenBudget = tokenBudgetStopCondition(
    state,
    dag,
    args,
    sprintStatus,
    loopContext,
    loopMetrics,
  );
  if (tokenBudget !== null) return tokenBudget;

  return null;
}
