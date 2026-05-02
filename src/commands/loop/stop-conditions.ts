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
 * Story 4.2 ships TWO predicates (`untilEpicEndStopCondition`,
 * `untilStoryStopCondition`) plus the `evaluateStopConditions` dispatcher
 * + the `compareStoryIds` numeric-segment comparator helper. Stories
 * 4.3 (`--next-story`, `--phase-end`), 4.5 (`--time-budget`,
 * `--token-budget`), and 4.6 (`--stop-on-error` / `--continue-on-error`)
 * will EXTEND this file with additional pure-function predicates following
 * the same `(state, dag, args, sprintStatus?) => StopReason | null`
 * contract.
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

import type { DagAdjacency } from "../../dag/index.ts";
import type { State } from "../../schemas/state.ts";
import type { LoopArgs } from "./args.ts";
import type { StopReason } from "./run.ts";

// Type alias kept for forward-compatibility with the story spec's
// `Dag` reference; the project's canonical type is `DagAdjacency` from
// `src/dag/types.ts`. Stories 4.3 + later may rename if a richer Dag
// abstraction emerges.
export type Dag = DagAdjacency;

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
 * Pure-function stop-condition predicate signature. Stories 4.3/4.5/4.6
 * MUST follow this contract when adding new predicates.
 */
export type StopConditionFn = (
  state: State,
  dag: Dag,
  args: LoopArgs,
  sprintStatus?: SprintStatus,
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

// ─── evaluateStopConditions — dispatcher ──────────────────────────────────

/**
 * Dispatcher: evaluates each active stop-condition predicate in declaration
 * order; returns the first non-null `StopReason` or `null` when no predicate
 * fires.
 *
 * Stories 4.3/4.5/4.6 will EXTEND this function with additional predicate
 * invocations following the same `(state, dag, args, sprintStatus?) =>
 * StopReason | null` contract.
 *
 * Declaration order = priority order. The current order is:
 *   1. `untilEpicEndStopCondition` (Story 4.2 — AC-1).
 *   2. `untilStoryStopCondition`   (Story 4.2 — AC-2).
 *
 * When BOTH predicates fire on the same iteration, the dispatcher
 * returns the epic-end variant (first in declaration order). This is
 * deterministic and documented in `stop-conditions.test.ts` Test 14.
 *
 * Pure function; no I/O; no throws.
 */
export function evaluateStopConditions(
  state: State,
  dag: Dag,
  args: LoopArgs,
  sprintStatus?: SprintStatus,
): StopReason | null {
  const epicEnd = untilEpicEndStopCondition(state, dag, args, sprintStatus);
  if (epicEnd !== null) return epicEnd;

  const story = untilStoryStopCondition(state, dag, args);
  if (story !== null) return story;

  return null;
}
