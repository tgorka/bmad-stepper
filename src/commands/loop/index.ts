/**
 * src/commands/loop/index.ts — public barrel for the `loop` command
 * (Story 4.1).
 *
 * Story 4.1 ships the runner skeleton — `runLoop` + `parseLoopArgs` +
 * the Zod-validated `LoopArgsSchema` declaring all 13 future flag fields
 * per AC-2 verbatim. Only `--max-iters` is RUNTIME-WIRED in this story;
 * Stories 4.2-4.10 progressively wire the other 7 stop-condition types.
 *
 * Architecture cross-references:
 * - architecture.md §line 1102-1123 — `src/commands/<verb>/` directory
 *   layout (each command has args.ts + run.ts + index.ts barrel).
 * - architecture.md §AR41 line 236 — module boundary graph.
 * - epics.md §Story 4.1 lines 891-903 (AC verbatim source).
 */

export {
  type LoopArgs,
  LoopArgsSchema,
  type ParseError,
  parseLoopArgs,
  type Result,
} from "./args.ts";
export {
  computePlan,
  formatPlan,
  lookupModelTokens,
  MAX_PLAN_WALK,
  type Plan,
  type PlanCheckpoint,
  type PlanFirstStopCondition,
  type PlannedStep,
} from "./plan.ts";
export {
  type IterationRecord,
  type LoopOpts,
  type LoopResult,
  type PlanResult,
  runLoop,
  type StopReason,
} from "./run.ts";
export {
  compareStoryIds,
  type Dag,
  evaluateStopConditions,
  type SprintStatus,
  type StopConditionFn,
  untilEpicEndStopCondition,
  untilStoryStopCondition,
} from "./stop-conditions.ts";
