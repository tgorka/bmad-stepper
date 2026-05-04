/**
 * src/commands/loop/plan.test.ts — colocated unit tests for `computePlan`
 * + `formatPlan` + `lookupModelTokens` (Story 4.7 AC-1, AC-2, AC-3).
 *
 * Coverage:
 *   - PC1-PC10: computePlan unit tests (zero-state walk, mid-DAG walk,
 *     stop-condition firing during walk, safety-cap fire, null-token
 *     aggregation, checkpoint enumeration, reproducibility — same
 *     inputs → same Plan, deterministic DAG iteration order).
 *   - PF1-PF6: formatPlan unit tests (single-step plan, multi-step plan,
 *     null-token rendering, checkpoint section rendering,
 *     firstStopCondition rendering, reproducibility — same Plan → same
 *     formatted text).
 *   - LMT1: lookupModelTokens v0.1 stub returns null for ALL inputs.
 */

import { describe, expect, it } from "bun:test";
import type { DagAdjacency, DagNode, Phase } from "../../dag/index.ts";
import type { State } from "../../schemas/state.ts";
import type { LoopArgs } from "./args.ts";
import {
  computePlan,
  formatPlan,
  lookupModelTokens,
  MAX_PLAN_WALK,
  type Plan,
  type PlanCheckpoint,
  type PlannedStep,
} from "./plan.ts";
import type { SprintStatus } from "./stop-conditions.ts";

// ─── Fixtures ─────────────────────────────────────────────────────────────

function freshState(): State {
  return {
    schemaVersion: 1,
    project: { name: "bmad-stepper", bmadVersion: "v6.x" },
    lastSuccessfulStep: null,
    lastAttempted: null,
    lastFailureReason: null,
    lastSnapshot: null,
    checkpoints: [],
    runHistory: [],
  };
}

function midState(stepName: string, epic: number, story: string): State {
  return {
    schemaVersion: 1,
    project: { name: "bmad-stepper", bmadVersion: "v6.x" },
    lastSuccessfulStep: {
      step: stepName,
      epic,
      story,
      completedAt: "2026-05-04T00:00:00Z",
    },
    lastAttempted: null,
    lastFailureReason: null,
    lastSnapshot: null,
    checkpoints: [],
    runHistory: [],
  };
}

/**
 * Build a small fixture DAG with deterministic ordering. 5 nodes
 * across analysis → planning → solutioning → implementation.
 */
function seedDag(): DagAdjacency {
  const node = (
    name: string,
    phase: Phase,
    after: readonly string[],
  ): DagNode => ({
    name,
    phase,
    after,
    before: [],
    optional: false,
    persona: "dev",
  });
  const nodes = new Map<string, DagNode>();
  nodes.set("step-a", node("step-a", "analysis", []));
  nodes.set("step-b", node("step-b", "planning", ["step-a"]));
  nodes.set("step-c", node("step-c", "solutioning", ["step-b"]));
  nodes.set("step-d", node("step-d", "implementation", ["step-c"]));
  nodes.set("step-e", node("step-e", "implementation", ["step-d"]));
  const edgesOut = new Map<string, ReadonlySet<string>>();
  edgesOut.set("step-a", new Set(["step-b"]));
  edgesOut.set("step-b", new Set(["step-c"]));
  edgesOut.set("step-c", new Set(["step-d"]));
  edgesOut.set("step-d", new Set(["step-e"]));
  const edgesIn = new Map<string, ReadonlySet<string>>();
  edgesIn.set("step-b", new Set(["step-a"]));
  edgesIn.set("step-c", new Set(["step-b"]));
  edgesIn.set("step-d", new Set(["step-c"]));
  edgesIn.set("step-e", new Set(["step-d"]));
  return { nodes, edgesOut, edgesIn };
}

/**
 * Construct a synthetic DAG with an outgoing-edge cycle so the plan walk
 * exercises the safety cap. step-a → step-b → step-a (cycle); but the
 * walk's `visitedNames` defence breaks the cycle. To force the safety
 * cap, we instead produce a DAG with 250+ unique nodes in a chain.
 */
function chainDag(length: number): DagAdjacency {
  const nodes = new Map<string, DagNode>();
  const edgesOut = new Map<string, ReadonlySet<string>>();
  const edgesIn = new Map<string, ReadonlySet<string>>();
  for (let i = 0; i < length; i++) {
    const name = `chain-${i}`;
    const after = i === 0 ? [] : [`chain-${i - 1}`];
    nodes.set(name, {
      name,
      phase: "implementation",
      after,
      before: [],
      optional: false,
      persona: "dev",
    });
    if (i > 0) {
      edgesOut.set(`chain-${i - 1}`, new Set([name]));
      edgesIn.set(name, new Set([`chain-${i - 1}`]));
    }
  }
  return { nodes, edgesOut, edgesIn };
}

function defaultArgs(overrides: Partial<LoopArgs> = {}): LoopArgs {
  return { ...overrides };
}

// ─── PC1: zero-state walk ─────────────────────────────────────────────────

describe("computePlan — PC1 (zero-state walk)", () => {
  it("walks from the first seed node when state.lastSuccessfulStep === null", () => {
    const plan = computePlan(freshState(), seedDag(), null, defaultArgs());
    expect(plan.totalEstimatedSteps).toBeGreaterThan(0);
    // The walk picks step-a first (no predecessors; insertion-order tie-break).
    expect(plan.steps[0]?.step).toBe("step-a");
  });
});

// ─── PC2: mid-DAG walk ────────────────────────────────────────────────────

describe("computePlan — PC2 (mid-DAG walk from successor of lastSuccessfulStep)", () => {
  it("walks from the FIRST UNCOMPLETED successor of state.lastSuccessfulStep.step", () => {
    const plan = computePlan(
      midState("step-b", 1, "1.1"),
      seedDag(),
      null,
      defaultArgs(),
    );
    expect(plan.totalEstimatedSteps).toBeGreaterThan(0);
    // Successor of step-b is step-c.
    expect(plan.steps[0]?.step).toBe("step-c");
  });
});

// ─── PC3: stop-condition firing during walk ───────────────────────────────

describe("computePlan — PC3 (stop-condition fires during walk)", () => {
  it("--until-story 1.1 fires immediately because synthetic state inherits epic/story", () => {
    const state = midState("step-a", 1, "1.1");
    const plan = computePlan(
      state,
      seedDag(),
      null,
      defaultArgs({ untilStory: "1.1" }),
    );
    // The synthetic state pretends the visited node has just completed,
    // inheriting epic=1/story=1.1 from the prior state. The
    // untilStoryStopCondition predicate fires when current story === target.
    expect(plan.firstStopCondition).not.toBeNull();
    expect(plan.firstStopCondition?.code).toBe("until-story-reached");
  });
});

// ─── PC4: safety cap ──────────────────────────────────────────────────────

describe("computePlan — PC4 (safety cap fires on a 250-node chain)", () => {
  it("plan.steps.length === MAX_PLAN_WALK when no stop condition fires", () => {
    const dag = chainDag(MAX_PLAN_WALK + 50);
    const plan = computePlan(freshState(), dag, null, defaultArgs());
    expect(plan.steps.length).toBe(MAX_PLAN_WALK);
    expect(plan.firstStopCondition).not.toBeNull();
    expect(plan.firstStopCondition?.code).toBe("max-iters-reached");
    expect(plan.firstStopCondition?.message).toContain("safety cap");
  });
});

// ─── PC5: null-token aggregation ──────────────────────────────────────────

describe("computePlan — PC5 (v0.1 null-token aggregation)", () => {
  it("ALL steps have null tokens; total is null; modelsConfigPresent is false", () => {
    const plan = computePlan(freshState(), seedDag(), null, defaultArgs());
    expect(plan.steps.every((s) => s.estimatedTokensIn === null)).toBe(true);
    expect(plan.steps.every((s) => s.estimatedTokensOut === null)).toBe(true);
    expect(plan.totalEstimatedTokensIn).toBeNull();
    expect(plan.totalEstimatedTokensOut).toBeNull();
    expect(plan.modelsConfigPresent).toBe(false);
  });
});

// ─── PC6: checkpoints with --checkpoint-each ──────────────────────────────

describe("computePlan — PC6 (--checkpoint-each story surfaces checkpoint locations)", () => {
  it("checkpointEachConfigured === true; checkpoints.length > 0", () => {
    const plan = computePlan(
      freshState(),
      seedDag(),
      null,
      defaultArgs({ checkpointEach: "story" }),
    );
    expect(plan.checkpointEachConfigured).toBe(true);
    expect(plan.checkpoints.length).toBeGreaterThan(0);
    for (const cp of plan.checkpoints) {
      expect(cp.stepType).toBe("story");
      const inSteps = plan.steps.some((s) => s.step === cp.afterStep);
      expect(inSteps).toBe(true);
    }
  });
});

// ─── PC7: no checkpoints when not configured ──────────────────────────────

describe("computePlan — PC7 (no --checkpoint-each → empty checkpoints)", () => {
  it("checkpointEachConfigured === false; checkpoints.length === 0", () => {
    const plan = computePlan(freshState(), seedDag(), null, defaultArgs());
    expect(plan.checkpointEachConfigured).toBe(false);
    expect(plan.checkpoints.length).toBe(0);
  });
});

// ─── PC8: reproducibility (same inputs) ───────────────────────────────────

describe("computePlan — PC8 (REPRODUCIBILITY: same inputs → same Plan)", () => {
  it("two invocations on the same inputs produce byte-identical plans", () => {
    const state = freshState();
    const dag = seedDag();
    const sprintStatus: SprintStatus | null = null;
    const args = defaultArgs();
    const plan1 = computePlan(state, dag, sprintStatus, args);
    const plan2 = computePlan(state, dag, sprintStatus, args);
    expect(JSON.stringify(plan1)).toBe(JSON.stringify(plan2));
  });
});

// ─── PC9: deterministic DAG iteration order ───────────────────────────────

describe("computePlan — PC9 (deterministic DAG iteration order)", () => {
  it("two structurally-equivalent DAGs (same Map insertion order) produce equal plans", () => {
    const dag1 = seedDag();
    const dag2 = seedDag();
    const plan1 = computePlan(freshState(), dag1, null, defaultArgs());
    const plan2 = computePlan(freshState(), dag2, null, defaultArgs());
    expect(JSON.stringify(plan1)).toBe(JSON.stringify(plan2));
  });
});

// ─── PC10: zero-state path explicit ──────────────────────────────────────

describe("computePlan — PC10 (zero-state walks first seed node)", () => {
  it("plan.steps[0].step === 'step-a' (first seed with no predecessors)", () => {
    const plan = computePlan(freshState(), seedDag(), null, defaultArgs());
    expect(plan.steps[0]?.step).toBe("step-a");
    expect(plan.steps[0]?.phase).toBe("analysis");
  });
});

// ─── PF1: single-step plan ────────────────────────────────────────────────

describe("formatPlan — PF1 (single-step plan)", () => {
  it("output contains the step name + first-stop-condition section", () => {
    const step: PlannedStep = {
      step: "single-step",
      epic: "1",
      story: "1.1",
      phase: "implementation",
      persona: "dev",
      estimatedTokensIn: null,
      estimatedTokensOut: null,
    };
    const plan: Plan = {
      totalEstimatedSteps: 1,
      steps: [step],
      totalEstimatedTokensIn: null,
      totalEstimatedTokensOut: null,
      modelsConfigPresent: false,
      checkpoints: [],
      checkpointEachConfigured: false,
      firstStopCondition: { code: "max-iters-reached", message: "test" },
    };
    const text = formatPlan(plan);
    expect(text).toContain("Plan: 1 steps planned");
    expect(text).toContain("single-step");
    expect(text).toContain("First stop condition:");
  });
});

// ─── PF2: multi-step plan ─────────────────────────────────────────────────

describe("formatPlan — PF2 (multi-step plan)", () => {
  it("output contains 5 numbered step lines", () => {
    const steps: PlannedStep[] = [];
    for (let i = 0; i < 5; i++) {
      steps.push({
        step: `step-${i}`,
        epic: "1",
        story: "1.1",
        phase: "implementation",
        persona: "dev",
        estimatedTokensIn: null,
        estimatedTokensOut: null,
      });
    }
    const plan: Plan = {
      totalEstimatedSteps: 5,
      steps,
      totalEstimatedTokensIn: null,
      totalEstimatedTokensOut: null,
      modelsConfigPresent: false,
      checkpoints: [],
      checkpointEachConfigured: false,
      firstStopCondition: null,
    };
    const text = formatPlan(plan);
    expect(text).toContain("1. step-0");
    expect(text).toContain("2. step-1");
    expect(text).toContain("3. step-2");
    expect(text).toContain("4. step-3");
    expect(text).toContain("5. step-4");
  });
});

// ─── PF3: null-token rendering ────────────────────────────────────────────

describe("formatPlan — PF3 (null-token rendering)", () => {
  it("includes '<unknown — Story 6.3' placeholder when totals are null", () => {
    const plan: Plan = {
      totalEstimatedSteps: 0,
      steps: [],
      totalEstimatedTokensIn: null,
      totalEstimatedTokensOut: null,
      modelsConfigPresent: false,
      checkpoints: [],
      checkpointEachConfigured: false,
      firstStopCondition: null,
    };
    const text = formatPlan(plan);
    expect(text).toContain("<unknown — Story 6.3");
  });

  it("renders numeric totals when both are non-null", () => {
    const plan: Plan = {
      totalEstimatedSteps: 0,
      steps: [],
      totalEstimatedTokensIn: 1000,
      totalEstimatedTokensOut: 500,
      modelsConfigPresent: true,
      checkpoints: [],
      checkpointEachConfigured: false,
      firstStopCondition: null,
    };
    const text = formatPlan(plan);
    expect(text).toContain("1000 in + 500 out");
  });
});

// ─── PF4: checkpoint section rendering ────────────────────────────────────

describe("formatPlan — PF4 (checkpoint section rendering)", () => {
  it("renders 2 checkpoint lines + a header when 2 checkpoints present", () => {
    const cps: PlanCheckpoint[] = [
      {
        afterStep: "step-1",
        stepType: "story",
        description: "checkpoint after step-1",
      },
      {
        afterStep: "step-2",
        stepType: "story",
        description: "checkpoint after step-2",
      },
    ];
    const plan: Plan = {
      totalEstimatedSteps: 0,
      steps: [],
      totalEstimatedTokensIn: null,
      totalEstimatedTokensOut: null,
      modelsConfigPresent: false,
      checkpoints: cps,
      checkpointEachConfigured: true,
      firstStopCondition: null,
    };
    const text = formatPlan(plan);
    expect(text).toContain("Checkpoints");
    expect(text).toContain("After step step-1");
    expect(text).toContain("After step step-2");
  });

  it("renders '(none — --checkpoint-each not supplied)' when not configured", () => {
    const plan: Plan = {
      totalEstimatedSteps: 0,
      steps: [],
      totalEstimatedTokensIn: null,
      totalEstimatedTokensOut: null,
      modelsConfigPresent: false,
      checkpoints: [],
      checkpointEachConfigured: false,
      firstStopCondition: null,
    };
    const text = formatPlan(plan);
    expect(text).toContain("(none — --checkpoint-each not supplied)");
  });
});

// ─── PF5: firstStopCondition rendering ────────────────────────────────────

describe("formatPlan — PF5 (firstStopCondition rendering)", () => {
  it("renders 'First stop condition: <code> — <message>'", () => {
    const plan: Plan = {
      totalEstimatedSteps: 0,
      steps: [],
      totalEstimatedTokensIn: null,
      totalEstimatedTokensOut: null,
      modelsConfigPresent: false,
      checkpoints: [],
      checkpointEachConfigured: false,
      firstStopCondition: {
        code: "max-iters-reached",
        message: "max-iters (50) reached",
      },
    };
    const text = formatPlan(plan);
    expect(text).toContain("First stop condition: max-iters-reached");
    expect(text).toContain("max-iters (50) reached");
  });
});

// ─── PF6: reproducibility ─────────────────────────────────────────────────

describe("formatPlan — PF6 (REPRODUCIBILITY: same Plan → same text)", () => {
  it("two invocations with the same Plan produce byte-identical text", () => {
    const plan: Plan = {
      totalEstimatedSteps: 2,
      steps: [
        {
          step: "step-a",
          epic: "1",
          story: "1.1",
          phase: "analysis",
          persona: "dev",
          estimatedTokensIn: null,
          estimatedTokensOut: null,
        },
        {
          step: "step-b",
          epic: "1",
          story: "1.2",
          phase: "planning",
          persona: ["pm", "architect"],
          estimatedTokensIn: 100,
          estimatedTokensOut: 50,
        },
      ],
      totalEstimatedTokensIn: null,
      totalEstimatedTokensOut: null,
      modelsConfigPresent: false,
      checkpoints: [],
      checkpointEachConfigured: false,
      firstStopCondition: { code: "epic-end-reached", message: "test" },
    };
    const text1 = formatPlan(plan);
    const text2 = formatPlan(plan);
    expect(text1).toBe(text2);
  });
});

// ─── LMT1: lookupModelTokens v0.1 stub ────────────────────────────────────

describe("lookupModelTokens — LMT1 (v0.1 stub returns null for ALL inputs)", () => {
  it("returns null for any step name", () => {
    expect(lookupModelTokens("dev-story")).toBeNull();
    expect(lookupModelTokens("any-step")).toBeNull();
    expect(lookupModelTokens("")).toBeNull();
    expect(lookupModelTokens("bmad-create-story")).toBeNull();
  });
});
