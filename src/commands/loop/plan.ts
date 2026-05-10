/**
 * src/commands/loop/plan.ts — Pure-function plan computation + formatting
 * for `/bmad-loop --plan-first` (FR21, AR9, AR33, AR41, AR42).
 *
 * Top-tier module per AR41 (architecture lines 1294-1302). Pure functions
 * only — ZERO I/O imports, ZERO `console.*` calls, ZERO throws. Analogous
 * to `./stop-conditions.ts` — the runner (./run.ts) handles I/O loading
 * and passes the resolved values here.
 *
 * Story 4.7 §AC-1 contract: `--plan-first` short-circuits the iteration
 * body and emits a single AR9 `"report"` JSON line carrying the human-
 * readable plan in its `message` field. The plan walks the DAG until the
 * first declared stop condition would fire (best-effort, since failures
 * may divert).
 *
 * Story 4.7 §AC-2 contract: the plan includes total estimated steps,
 * total estimated tokens (using `models:` config — Story 6.3 forward
 * dependency, v0.1 stub returns null), checkpoints (if `--checkpoint-each`
 * is supplied — Story 4.8 forward dependency, v0.1 surfaces planned
 * locations without runtime semantics).
 *
 * Story 4.7 §AC-3 contract: the plan output is reproducible across
 * invocations on the same state. `computePlan` + `formatPlan` are PURE
 * FUNCTIONS over their inputs — no `Bun.nanoseconds()`, no `new Date()`,
 * no random IDs, no hashes. The DAG iteration order is deterministic per
 * `Map` insertion-order (Story 1.10 invariant). The plan-walk's tie-
 * breaking heuristic (optional === false first, then insertion-order) is
 * deterministic. The same `(state, dag, sprintStatus, args)` quadruple
 * produces the same `Plan` value, and the same `Plan` value produces the
 * same `formattedPlan` string.
 *
 * Architecture cross-references:
 *   - architecture.md §AR41 lines 1294-1302 (boundary graph; top-tier
 *     may import foundational types).
 *   - architecture.md §line 1351 (FR21 — `--plan-first` — implementation
 *     in `src/commands/loop/run.ts` + plan-walk helper module).
 *   - architecture.md §line 1660 (AR9 protocol concretization — the
 *     `"report"` action's `message` field carries human-readable text).
 *   - architecture.md §line 587 (`--plan-first` previews the loop's
 *     planned step sequence before committing tokens).
 *   - epics.md §Story 4.7 lines 988-1000 (AC verbatim source).
 *   - prd.md FR21 line 697 (preview the loop's planned step sequence).
 */

import type { DagAdjacency, DagNode, Phase } from "../../dag/index.ts";
import type { State } from "../../schemas/state.ts";
import type { LoopArgs } from "./args.ts";
import type { StopReason } from "./run.ts";
import {
  evaluateStopConditions,
  type SprintStatus,
} from "./stop-conditions.ts";

/**
 * Plan-walk safety cap. The walk halts after this many hops if no stop
 * condition has fired. Rationale: the actual `--max-iters=50` default-cap
 * injection is BYPASSED in plan-mode (per Task 1 of Story 4.7), so a
 * misconfigured loop or a DAG cycle could otherwise spin indefinitely
 * in plan-mode. The 200 cap is generous enough to surface the user's
 * intended scope while bounding worst-case plan computation. Tracked
 * as Story 4.7 OQ-5.
 */
export const MAX_PLAN_WALK = 200;

// ─── Public types ─────────────────────────────────────────────────────────

/**
 * One step in the planned sequence. Each field is `readonly` per the
 * Story 4.3 OQ-9 immutable-struct precedent.
 *
 * - `step`               — DAG node name (skill directory name; the same
 *                          string `runNext` would dispatch).
 * - `epic` / `story`     — Best-effort epic/story tracking derived from
 *                          `state.lastSuccessfulStep` at plan-walk time.
 *                          Stringified per the architecture's epic→string
 *                          normalisation (Story 4.2). May be `null` for
 *                          steps with no associated epic/story (e.g.,
 *                          early DAG nodes in the analysis phase).
 * - `phase`              — BMAD phase from the DAG node.
 * - `persona`            — Persona identifier(s) from the DAG node.
 * - `estimatedTokensIn`  — Per-step estimated input tokens from `models:`
 *                          config. v0.1 stub returns `null` (Story 6.3
 *                          forward dependency).
 * - `estimatedTokensOut` — Per-step estimated output tokens. Same v0.1
 *                          stub semantics as `estimatedTokensIn`.
 */
export interface PlannedStep {
  readonly step: string;
  readonly epic: string | null;
  readonly story: string | null;
  readonly phase: Phase;
  readonly persona: string | readonly string[] | null;
  readonly estimatedTokensIn: number | null;
  readonly estimatedTokensOut: number | null;
}

/**
 * One checkpoint location in the plan. Surfaced when `--checkpoint-each`
 * is supplied AND the planned step's `phase` matches the supplied
 * step-type. Story 4.8 RUNTIME-WIRES `--checkpoint-each` to the
 * `verify-and-advance.ts` post-step state save; plan-mode mirrors the
 * runtime contract by only enumerating checkpoint locations that the
 * runtime would actually emit.
 *
 * - `afterStep`   — Step name after which the checkpoint would fire.
 *                   Matches a step in `Plan.steps[]`.
 * - `stepType`    — Echoes `args.checkpointEach` (one of the 5 `Phase`
 *                   values: `analysis`, `planning`, `solutioning`,
 *                   `implementation`, `retro`). Story 4.8 RESTRICTED the
 *                   value to phase-only (the legacy `story|epic|phase`
 *                   placeholder values are NO LONGER accepted).
 * - `description` — Human-readable single-line description of the
 *                   checkpoint.
 */
export interface PlanCheckpoint {
  readonly afterStep: string;
  readonly stepType: Phase;
  readonly description: string;
}

/**
 * The first stop condition that would fire on the plan walk. SUBSET of
 * `StopReason` carrying only the discriminator and message — plan-mode
 * does not consume the structured StopReason fields (e.g., `step`,
 * `runLogPath`).
 */
export interface PlanFirstStopCondition {
  readonly code: StopReason["code"];
  readonly message: string;
}

/**
 * Structured plan returned by `computePlan`. Each field is `readonly` per
 * the Story 4.3 OQ-9 immutable-struct precedent.
 *
 * - `totalEstimatedSteps`         — Number of steps in `steps[]`.
 * - `steps`                       — The planned sequence in walk order.
 * - `totalEstimatedTokensIn`      — Sum of per-step `estimatedTokensIn`
 *                                   when ALL steps have non-null tokens;
 *                                   `null` when ANY step lacks tokens.
 * - `totalEstimatedTokensOut`     — Analogous to `totalEstimatedTokensIn`.
 * - `modelsConfigPresent`         — Heuristic flag for whether the
 *                                   v0.1 stub returned non-null tokens
 *                                   (will flip `true` once Story 6.3 lands).
 * - `checkpoints`                 — Planned checkpoint locations (empty
 *                                   when `--checkpoint-each` is absent
 *                                   OR no plan steps match).
 * - `checkpointEachConfigured`    — `true` iff `args.checkpointEach` is
 *                                   non-undefined.
 * - `firstStopCondition`          — The first stop condition that would
 *                                   fire on the plan walk; `null` if no
 *                                   stop condition fires within the
 *                                   safety cap.
 */
export interface Plan {
  readonly totalEstimatedSteps: number;
  readonly steps: readonly PlannedStep[];
  readonly totalEstimatedTokensIn: number | null;
  readonly totalEstimatedTokensOut: number | null;
  readonly modelsConfigPresent: boolean;
  readonly checkpoints: readonly PlanCheckpoint[];
  readonly checkpointEachConfigured: boolean;
  readonly firstStopCondition: PlanFirstStopCondition | null;
}

// ─── lookupModelTokens — v0.1 stub (Story 6.3 forward dependency) ─────────

/**
 * v0.1 STUB — returns null for ALL inputs. Story 6.3 (`models:` per-step
 * config) will replace this with a config-driven lookup. The plan-mode
 * formatter renders "<unknown — Story 6.3 `models:` config required>"
 * when this returns null. Tracked as Story 4.7 OQ-2.
 *
 * The underscore prefix on `_stepName` signals the unused parameter
 * (per the project's biome lint rules).
 */
export function lookupModelTokens(
  _stepName: string,
): { tokensIn: number; tokensOut: number } | null {
  return null;
}

// ─── Internal helpers (pure functions) ────────────────────────────────────

/**
 * Returns `true` iff a step name appears in `state.runHistory[]` with a
 * `verifierStatus === "pass"` entry. Defensive typeof guards because
 * `runHistory[]` is `z.unknown()` per Story 1.5.
 */
function isStepCompleted(state: State, stepName: string): boolean {
  for (const entry of state.runHistory) {
    if (entry === null || typeof entry !== "object") continue;
    const e = entry as { step?: unknown; verifierStatus?: unknown };
    if (e.step === stepName && e.verifierStatus === "pass") return true;
  }
  return false;
}

/**
 * Pick the plan-walk start node. Returns `undefined` when no candidate
 * exists.
 *
 * Algorithm:
 *   - When `state.lastSuccessfulStep === null`: pick the FIRST seed node
 *     with no predecessors (insertion-order tie-break).
 *   - When `state.lastSuccessfulStep !== null`: find the FIRST successor
 *     of that step that is NOT yet completed.
 *   - When neither path identifies a candidate: return `undefined`.
 */
function pickStartNode(state: State, dag: DagAdjacency): DagNode | undefined {
  const lastStep = state.lastSuccessfulStep?.step;
  if (lastStep !== undefined && lastStep !== null) {
    const successors = dag.edgesOut.get(lastStep);
    if (successors !== undefined) {
      for (const succ of successors) {
        if (!isStepCompleted(state, succ)) {
          const node = dag.nodes.get(succ);
          if (node !== undefined) return node;
        }
      }
    }
  }
  // Zero-state path or all successors completed: pick the first seed
  // node with no predecessors (insertion-order tie-break).
  for (const [name, node] of dag.nodes) {
    const incoming = dag.edgesIn.get(name);
    if (incoming === undefined || incoming.size === 0) {
      if (!isStepCompleted(state, name)) return node;
    }
  }
  return undefined;
}

/**
 * Synthesize a State value pretending the just-visited node has just
 * completed. Used to feed `evaluateStopConditions` during the plan walk.
 *
 * Best-effort epic/story derivation: when the prior `state.lastSuccessfulStep`
 * carries epic/story values, those are inherited (the synthetic state's
 * `lastSuccessfulStep.step` is the visited node, but the epic/story
 * tracking is approximate per AC-1 wording "best-effort").
 */
function synthesizeStateAfterStep(state: State, node: DagNode): State {
  const prior = state.lastSuccessfulStep;
  return {
    ...state,
    lastSuccessfulStep: {
      step: node.name,
      epic: prior?.epic ?? 0,
      story: prior?.story ?? "0.0",
      completedAt: prior?.completedAt ?? "1970-01-01T00:00:00Z",
    },
  };
}

/**
 * Pick the next successor in the plan walk. Pure function over
 * `(currentNode, dag, visited)`.
 *
 * Tie-breaking heuristic:
 *   - Filter out names already in `visited[]` (cycle defence).
 *   - Filter out names not in `dag.nodes` (defensive — should not happen).
 *   - Among remaining: prefer `optional === false` first; among ties,
 *     use insertion-order (the iteration order of the `Set` returned by
 *     `edgesOut.get` is the order edges were added).
 */
function pickNextSuccessor(
  currentNode: DagNode,
  dag: DagAdjacency,
  visited: ReadonlySet<string>,
): DagNode | undefined {
  const successors = dag.edgesOut.get(currentNode.name);
  if (successors === undefined) return undefined;
  let firstOptional: DagNode | undefined;
  for (const succ of successors) {
    if (visited.has(succ)) continue;
    const node = dag.nodes.get(succ);
    if (node === undefined) continue;
    if (node.optional === false) return node;
    if (firstOptional === undefined) firstOptional = node;
  }
  return firstOptional;
}

/**
 * Extract a human-readable message from a `StopReason`. Mirrors the
 * `formatExitReason` switch in `run.ts:927-963` — plan-mode preserves
 * the same message text for consistency with the loop's exit summary.
 */
function extractStopReasonMessage(stopReason: StopReason): string {
  switch (stopReason.code) {
    case "max-iters-reached":
      return `max-iters (${stopReason.maxIters}) reached`;
    case "halt-on-error":
      return `halt on error (${stopReason.failureCode}) at iteration ${stopReason.iterCount}`;
    case "epic-end-reached":
      return stopReason.message;
    case "until-story-reached":
      return stopReason.message;
    case "next-story-reached":
      return `next-story boundary reached (${stopReason.startStory} → ${stopReason.currentStory})`;
    case "phase-end-reached":
      return stopReason.message;
    case "time-budget-reached":
      return stopReason.message;
    case "token-budget-reached":
      return stopReason.message;
    case "error-stop":
      return stopReason.message;
    case "manual-sigint":
      // Story 4.9: SIGINT graceful exit. Plan-mode short-circuits on
      // SIGINT BEFORE computePlan is reached, so this branch is
      // unreachable at runtime — but the case is required for
      // TypeScript exhaustiveness on the discriminated union. Delegate
      // to the stored AC-3 verbatim message for consistency with
      // run.ts:formatExitReason.
      return stopReason.message;
    case "manual-interactive-halt":
      // Story 5.5: --interactive per-step pause halt. Plan-mode short-
      // circuits BEFORE the iteration body (per Story 4.7 AC-1), and the
      // `--interactive` runtime gate ONLY fires inside the iteration body
      // — so this branch is unreachable at plan-walk time. The case is
      // required for TypeScript exhaustiveness on the discriminated
      // union. Delegate to the stored AC-3 verbatim message for
      // consistency with run.ts:formatExitReason.
      return stopReason.message;
    case "all-steps-complete":
      // All-steps-complete graceful exit. Plan-mode short-circuits BEFORE
      // the iteration body — this branch is unreachable at plan-walk time
      // but required for TypeScript exhaustiveness on the discriminated
      // union. Delegate to the stored runNext report message for
      // consistency with run.ts:formatExitReason.
      return stopReason.message;
    case "no-progress-detected":
      // No-progress detector: plan-mode short-circuits BEFORE the
      // iteration body — this branch is unreachable at plan-walk time
      // but required for TypeScript exhaustiveness on the discriminated
      // union. Delegate to the stored runner-composed message for
      // consistency with run.ts:formatExitReason.
      return stopReason.message;
  }
}

/**
 * Pure-function lookup: would the given node fire a checkpoint under
 * `checkpointEachType`? Returns the checkpoint entry or `null`.
 *
 * Story 4.8 semantics (RUNTIME-WIRED): a checkpoint fires ONLY when the
 * node's `phase` matches `checkpointEachType` exactly. This restricts
 * the v0.1 (Story 4.7) "accept-all" boilerplate to the actual runtime
 * contract — `verify-and-advance.ts` (lock-held mid-tier) only appends
 * a `state.checkpoints[]` entry when the just-completed step's phase
 * matches the supplied step-type, so plan-mode mirrors that behaviour
 * faithfully (FIFO-50 cap is enforced at the runtime write site only).
 */
function matchCheckpointType(
  node: DagNode,
  checkpointEachType: Phase,
): PlanCheckpoint | null {
  if (node.phase !== checkpointEachType) return null;
  return {
    afterStep: node.name,
    stepType: checkpointEachType,
    description: `${node.name} [${node.phase}] checkpoint after step (Story 4.8 wires runtime semantics; FIFO-50 cap)`,
  };
}

// ─── Public function: computePlan ─────────────────────────────────────────

/**
 * Compute the plan for `--plan-first`. Pure function over its four
 * inputs — no `Bun.nanoseconds()`, no `new Date()`, no random IDs, no
 * hashes. The same `(state, dag, sprintStatus, args)` quadruple produces
 * the same `Plan` value (AC-3 reproducibility).
 *
 * Algorithm:
 *   1. Determine the plan-walk start node via `pickStartNode`.
 *   2. Walk the DAG iteratively. For each visited node:
 *      a. Build a `PlannedStep` record.
 *      b. If `args.checkpointEach !== undefined`, append a checkpoint.
 *      c. Synthesize a state pretending the node has just completed.
 *      d. Evaluate stop conditions against the synthetic state. If any
 *         fires, record `firstStopCondition` and break.
 *      e. Pick the next successor via `pickNextSuccessor`.
 *   3. Apply the `MAX_PLAN_WALK = 200` safety cap if no stop condition
 *      fires within 200 hops.
 *   4. Aggregate totals and return the immutable `Plan`.
 */
export function computePlan(
  state: State,
  dag: DagAdjacency,
  sprintStatus: SprintStatus | null,
  args: LoopArgs,
): Plan {
  const visited: PlannedStep[] = [];
  const checkpoints: PlanCheckpoint[] = [];
  const visitedNames = new Set<string>();
  let firstStopCondition: PlanFirstStopCondition | null = null;
  let currentNode: DagNode | undefined = pickStartNode(state, dag);

  // Edge case: no start node (e.g., empty DAG, or all successors of
  // lastSuccessfulStep are completed). Return an empty plan with a
  // synthetic firstStopCondition.
  if (currentNode === undefined) {
    return {
      totalEstimatedSteps: 0,
      steps: [],
      totalEstimatedTokensIn: null,
      totalEstimatedTokensOut: null,
      modelsConfigPresent: false,
      checkpoints: [],
      checkpointEachConfigured: args.checkpointEach !== undefined,
      firstStopCondition: {
        code: "epic-end-reached",
        message: "all steps completed at plan-time",
      },
    };
  }

  let hops = 0;
  while (currentNode !== undefined && hops < MAX_PLAN_WALK) {
    hops++;
    const tokens = lookupModelTokens(currentNode.name);
    const planned: PlannedStep = {
      step: currentNode.name,
      epic:
        state.lastSuccessfulStep?.epic !== undefined &&
        state.lastSuccessfulStep?.epic !== null
          ? String(state.lastSuccessfulStep.epic)
          : null,
      story: state.lastSuccessfulStep?.story ?? null,
      phase: currentNode.phase,
      persona: currentNode.persona,
      estimatedTokensIn: tokens?.tokensIn ?? null,
      estimatedTokensOut: tokens?.tokensOut ?? null,
    };
    visited.push(planned);
    visitedNames.add(currentNode.name);

    // Story 4.8 forward dependency: surface checkpoint locations.
    if (args.checkpointEach !== undefined) {
      const checkpointMatch = matchCheckpointType(
        currentNode,
        args.checkpointEach,
      );
      if (checkpointMatch !== null) {
        checkpoints.push(checkpointMatch);
      }
    }

    // Synthesize a State that pretends `currentNode` has just completed.
    const syntheticState: State = synthesizeStateAfterStep(state, currentNode);

    // Evaluate stop conditions against the synthetic state. The plan
    // walk does not consume `loopContext` (no transitions detected
    // from a baseline) or `loopMetrics` (plan-mode is wall-clock-zero).
    const stopReason = evaluateStopConditions(
      syntheticState,
      dag,
      args,
      sprintStatus ?? undefined,
      undefined,
      undefined,
    );
    if (stopReason !== null) {
      firstStopCondition = {
        code: stopReason.code,
        message: extractStopReasonMessage(stopReason),
      };
      break;
    }

    // Walk to the next node.
    currentNode = pickNextSuccessor(currentNode, dag, visitedNames);
  }

  if (firstStopCondition === null && hops >= MAX_PLAN_WALK) {
    firstStopCondition = {
      code: "max-iters-reached",
      message: `(plan-walk safety cap reached at ${MAX_PLAN_WALK} hops)`,
    };
  }

  // Aggregate totals.
  const totalEstimatedSteps = visited.length;
  const allHaveTokensIn = visited.every((s) => s.estimatedTokensIn !== null);
  const allHaveTokensOut = visited.every((s) => s.estimatedTokensOut !== null);
  const totalEstimatedTokensIn =
    allHaveTokensIn && visited.length > 0
      ? visited.reduce((sum, s) => sum + (s.estimatedTokensIn ?? 0), 0)
      : null;
  const totalEstimatedTokensOut =
    allHaveTokensOut && visited.length > 0
      ? visited.reduce((sum, s) => sum + (s.estimatedTokensOut ?? 0), 0)
      : null;
  const modelsConfigPresent =
    visited.length > 0 && visited[0]?.estimatedTokensIn !== null;
  const checkpointEachConfigured = args.checkpointEach !== undefined;

  return {
    totalEstimatedSteps,
    steps: visited,
    totalEstimatedTokensIn,
    totalEstimatedTokensOut,
    modelsConfigPresent,
    checkpoints,
    checkpointEachConfigured,
    firstStopCondition,
  };
}

// ─── Public function: formatPlan ──────────────────────────────────────────

/**
 * Format the persona for the steps section. Handles `string | string[] |
 * null` rendering.
 */
function formatPersona(persona: string | readonly string[] | null): string {
  if (persona === null) return "<no persona>";
  if (typeof persona === "string") return persona;
  if (persona.length === 0) return "<no persona>";
  return persona.join("/");
}

/**
 * Format per-step token estimates for the steps section.
 */
function formatStepTokens(step: PlannedStep): string {
  if (step.estimatedTokensIn === null || step.estimatedTokensOut === null) {
    return "<unknown tokens>";
  }
  return `~${step.estimatedTokensIn} in / ~${step.estimatedTokensOut} out tokens`;
}

/**
 * Format the plan as a human-readable multi-line text body. Pure function
 * over `plan` — no `Date()`, no `Math.random()`, no `Bun.nanoseconds()`,
 * no non-deterministic source. The same `Plan` value produces the same
 * `formattedPlan` string (AC-3 reproducibility).
 *
 * The output text is consumed as the AR9 `"report"` action's `message`
 * field. Newlines inside the message are JSON-escaped within the outer
 * AR9 JSON line, which preserves the AR9 single-line invariant.
 */
export function formatPlan(plan: Plan): string {
  const lines: string[] = [];

  // Header line.
  const stopCode = plan.firstStopCondition?.code ?? "none";
  const stopMessage =
    plan.firstStopCondition?.message ?? "no stop condition will fire";
  lines.push(
    `Plan: ${plan.totalEstimatedSteps} steps planned (first stop: ${stopCode} — ${stopMessage})`,
  );
  lines.push("");

  // Total estimated steps.
  lines.push(`Total estimated steps: ${plan.totalEstimatedSteps}`);

  // Token totals.
  if (
    plan.totalEstimatedTokensIn === null ||
    plan.totalEstimatedTokensOut === null
  ) {
    lines.push(
      "Total estimated tokens: <unknown — Story 6.3 `models:` config required>",
    );
  } else {
    lines.push(
      `Total estimated tokens: ${plan.totalEstimatedTokensIn} in + ${plan.totalEstimatedTokensOut} out`,
    );
  }
  lines.push("");

  // Steps section.
  lines.push("Steps:");
  if (plan.steps.length === 0) {
    lines.push("  (no steps planned)");
  } else {
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      if (step === undefined) continue;
      const epicStr = step.epic ?? "?";
      const storyStr = step.story ?? "?";
      lines.push(
        `  ${i + 1}. ${step.step} [${step.phase}] (epic ${epicStr}, story ${storyStr}) — ${formatPersona(step.persona)} — ${formatStepTokens(step)}`,
      );
    }
  }
  lines.push("");

  // Checkpoints section.
  lines.push("Checkpoints (--checkpoint-each <type>):");
  if (plan.checkpoints.length === 0) {
    if (!plan.checkpointEachConfigured) {
      lines.push("  (none — --checkpoint-each not supplied)");
    } else {
      lines.push("  (none — no matches in plan walk)");
    }
  } else {
    for (const cp of plan.checkpoints) {
      lines.push(`  After step ${cp.afterStep}: ${cp.description}`);
    }
  }
  lines.push("");

  // First stop condition section.
  lines.push(`First stop condition: ${stopCode} — ${stopMessage}`);

  return lines.join("\n");
}
