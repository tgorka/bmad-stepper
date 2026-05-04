/**
 * src/commands/loop/stop-conditions.test.ts — Pure-function unit tests
 * for Story 4.2's stop-condition predicates (AC-1, AC-2, AC-3).
 *
 * Each predicate is exercised against fixture states without any I/O.
 * The `compareStoryIds` helper is exhaustively tested for the
 * numeric-segment ordering critical case (`"1.10" > "1.2"` is the
 * canonical hazard; lexicographic ordering would return the wrong
 * answer).
 *
 * Test count projection: 16 tests / ~70 expects.
 */

import { describe, expect, it } from "bun:test";
import type { DagAdjacency, DagNode, Phase } from "../../dag/index.ts";
import type { State } from "../../schemas/state.ts";
import type { LoopArgs } from "./args.ts";
import {
  compareStoryIds,
  evaluateStopConditions,
  formatTimeBudget,
  type LoopContext,
  type LoopMetrics,
  nextStoryStopCondition,
  phaseEndStopCondition,
  type SprintStatus,
  timeBudgetStopCondition,
  tokenBudgetStopCondition,
  untilEpicEndStopCondition,
  untilStoryStopCondition,
} from "./stop-conditions.ts";

// ─── Fixture helpers ──────────────────────────────────────────────────────

const EMPTY_DAG: DagAdjacency = {
  nodes: new Map(),
  edgesOut: new Map(),
  edgesIn: new Map(),
};

function makeState(
  epic: number | null,
  story: string | null,
  step = "bmad-dev-story",
): State {
  if (epic === null || story === null) {
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
  return {
    schemaVersion: 1,
    project: { name: "bmad-stepper", bmadVersion: "v6.x" },
    lastSuccessfulStep: {
      step,
      epic,
      story,
      completedAt: "2026-05-02T00:00:00Z",
    },
    lastAttempted: null,
    lastFailureReason: null,
    lastSnapshot: null,
    checkpoints: [],
    runHistory: [],
  };
}

// ─── Story 4.3 fixture helpers ────────────────────────────────────────────

/**
 * Build a minimal DagAdjacency fixture with a known set of nodes whose
 * `phase` field can be queried. The fixture covers the canonical step
 * names used in Story 4.3 phase-transition tests:
 *   - `bmad-create-prd`  → planning
 *   - `bmad-dev-story`   → implementation
 *   - `bmad-retrospective` → retro
 */
function makeDagFixture(): DagAdjacency {
  const nodes = new Map<string, DagNode>();
  const addNode = (name: string, phase: Phase): void => {
    nodes.set(name, {
      name,
      phase,
      after: [],
      before: [],
      optional: false,
      persona: null,
    });
  };
  addNode("bmad-create-prd", "planning");
  addNode("bmad-dev-story", "implementation");
  addNode("bmad-retrospective", "retro");
  addNode("bmad-create-architecture", "solutioning");
  addNode("bmad-domain-research", "analysis");
  return {
    nodes,
    edgesOut: new Map(),
    edgesIn: new Map(),
  };
}

function makeSprintStatusEpic3(): SprintStatus {
  return {
    development_status: {
      "epic-3": "done",
      "3-1-record-last-attempted-last-failure-reason-on-halt": "done",
      "3-2-resume-flag": "done",
      "3-3-dry-run-flag": "done",
      "3-4-step-id-and-scope-flags": "done",
      "3-5-persona-override-include-optional-no-optional": "done",
      "3-6-explain-reasoning-trace": "done",
      "3-7-list-candidate-next-steps": "done",
      "3-8-diff-state-and-export-state": "done",
      "3-9-watch-live-transcript-tail": "done",
      "3-10-non-locking-read-flags": "done",
      "epic-3-retrospective": "done",
    },
  };
}

// ─── Test 1: compareStoryIds — numeric-segment ordering ───────────────────

describe("compareStoryIds — numeric-segment ordering (Test 1)", () => {
  it("returns 0 for equal ids", () => {
    expect(compareStoryIds("1.2", "1.2")).toBe(0);
    expect(compareStoryIds("3.10", "3.10")).toBe(0);
  });

  it("returns -1 / 1 for distinct sub-stories within the same epic", () => {
    expect(compareStoryIds("1.1", "1.2")).toBe(-1);
    expect(compareStoryIds("1.2", "1.1")).toBe(1);
  });

  it("orders 1.10 GREATER THAN 1.2 (numeric, NOT lexical) — critical hazard", () => {
    // Lexicographic ordering would return -1 here (because "1" === "1",
    // "." === "." then "1" < "2"). Numeric ordering returns 1 (because
    // 10 > 2). This is the canonical hazard that motivates the helper.
    expect(compareStoryIds("1.10", "1.2")).toBe(1);
    expect(compareStoryIds("1.2", "1.10")).toBe(-1);
  });

  it("orders 1.10 LESS THAN 1.11 (consecutive double-digit subs)", () => {
    expect(compareStoryIds("1.10", "1.11")).toBe(-1);
    expect(compareStoryIds("1.11", "1.10")).toBe(1);
  });

  it("orders epic boundaries correctly (cross-epic)", () => {
    expect(compareStoryIds("2.1", "1.99")).toBe(1);
    expect(compareStoryIds("1.99", "2.1")).toBe(-1);
    expect(compareStoryIds("3.0", "2.99")).toBe(1);
  });

  it("orders 4.0 GREATER THAN 3.10 (Story 4.2 overshoot canonical case)", () => {
    expect(compareStoryIds("4.0", "3.10")).toBe(1);
    expect(compareStoryIds("3.10", "4.0")).toBe(-1);
  });

  it("orders multi-digit epic numbers (e.g. 10.x > 9.x)", () => {
    expect(compareStoryIds("10.1", "9.99")).toBe(1);
    expect(compareStoryIds("9.99", "10.1")).toBe(-1);
  });
});

// ─── Test 2-8: untilEpicEndStopCondition ──────────────────────────────────

describe("untilEpicEndStopCondition (Tests 2-8)", () => {
  const args: LoopArgs = { untilEpicEnd: true };

  it("Test 2: fires when all stories done + retro done", () => {
    const state = makeState(3, "3.10");
    const sprintStatus = makeSprintStatusEpic3();
    const result = untilEpicEndStopCondition(
      state,
      EMPTY_DAG,
      args,
      sprintStatus,
    );
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.code).toBe("epic-end-reached");
    if (result.code !== "epic-end-reached") return;
    expect(result.epic).toBe("3");
    expect(result.message).toBe("epic-end reached");
  });

  it("Test 3: fires when retro is optional (not yet done)", () => {
    const state = makeState(3, "3.10");
    const sprintStatus = makeSprintStatusEpic3();
    const mutated: SprintStatus = {
      development_status: {
        ...sprintStatus.development_status,
        "epic-3-retrospective": "optional",
      },
    };
    const result = untilEpicEndStopCondition(state, EMPTY_DAG, args, mutated);
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.code).toBe("epic-end-reached");
  });

  it("Test 4: does NOT fire when one story still backlog", () => {
    const state = makeState(3, "3.5");
    const sprintStatus = makeSprintStatusEpic3();
    const mutated: SprintStatus = {
      development_status: {
        ...sprintStatus.development_status,
        "3-7-list-candidate-next-steps": "backlog",
      },
    };
    expect(
      untilEpicEndStopCondition(state, EMPTY_DAG, args, mutated),
    ).toBeNull();
  });

  it("Test 5: does NOT fire when one story still review", () => {
    const state = makeState(3, "3.5");
    const sprintStatus = makeSprintStatusEpic3();
    const mutated: SprintStatus = {
      development_status: {
        ...sprintStatus.development_status,
        "3-5-persona-override-include-optional-no-optional": "review",
      },
    };
    expect(
      untilEpicEndStopCondition(state, EMPTY_DAG, args, mutated),
    ).toBeNull();
  });

  it("Test 6: does NOT fire when retro neither done nor optional (legacy edge)", () => {
    const state = makeState(3, "3.10");
    const sprintStatus = makeSprintStatusEpic3();
    const mutated: SprintStatus = {
      development_status: {
        ...sprintStatus.development_status,
        "epic-3-retrospective": "in-progress",
      },
    };
    expect(
      untilEpicEndStopCondition(state, EMPTY_DAG, args, mutated),
    ).toBeNull();
  });

  it("Test 7: does NOT fire when args.untilEpicEnd is undefined", () => {
    const state = makeState(3, "3.10");
    const sprintStatus = makeSprintStatusEpic3();
    const result = untilEpicEndStopCondition(
      state,
      EMPTY_DAG,
      {},
      sprintStatus,
    );
    expect(result).toBeNull();
  });

  it("Test 8: does NOT fire when args.untilEpicEnd === false (explicit-false)", () => {
    const state = makeState(3, "3.10");
    const sprintStatus = makeSprintStatusEpic3();
    const result = untilEpicEndStopCondition(
      state,
      EMPTY_DAG,
      { untilEpicEnd: false },
      sprintStatus,
    );
    expect(result).toBeNull();
  });

  it("Test 8b: does NOT fire when sprintStatus is undefined (graceful degradation)", () => {
    const state = makeState(3, "3.10");
    expect(
      untilEpicEndStopCondition(state, EMPTY_DAG, args, undefined),
    ).toBeNull();
  });

  it("Test 8c: does NOT fire when state.lastSuccessfulStep is null (fresh project)", () => {
    const state = makeState(null, null);
    const sprintStatus = makeSprintStatusEpic3();
    expect(
      untilEpicEndStopCondition(state, EMPTY_DAG, args, sprintStatus),
    ).toBeNull();
  });
});

// ─── Test 9-13: untilStoryStopCondition ───────────────────────────────────

describe("untilStoryStopCondition (Tests 9-13)", () => {
  it("Test 9: fires on exact match", () => {
    const state = makeState(3, "3.2");
    const result = untilStoryStopCondition(state, EMPTY_DAG, {
      untilStory: "3.2",
    });
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.code).toBe("until-story-reached");
    if (result.code !== "until-story-reached") return;
    expect(result.targetStory).toBe("3.2");
    expect(result.currentStory).toBe("3.2");
    expect(result.message).toBe("story 3.2 reached");
  });

  it("Test 10: fires on overshoot — current 3.3 vs target 3.2", () => {
    const state = makeState(3, "3.3");
    const result = untilStoryStopCondition(state, EMPTY_DAG, {
      untilStory: "3.2",
    });
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.code).toBe("until-story-reached");
    if (result.code !== "until-story-reached") return;
    expect(result.currentStory).toBe("3.3");
    expect(result.targetStory).toBe("3.2");
    // AC-2 verbatim message text (overshoot context in structured fields).
    expect(result.message).toBe("story 3.2 reached");
  });

  it("Test 11: fires on epic-boundary overshoot — current 4.0 vs target 3.10", () => {
    // Critical: numeric comparison must order 4.0 > 3.10 (not lexical).
    const state = makeState(4, "4.0");
    const result = untilStoryStopCondition(state, EMPTY_DAG, {
      untilStory: "3.10",
    });
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.code).toBe("until-story-reached");
    if (result.code !== "until-story-reached") return;
    expect(result.currentStory).toBe("4.0");
    expect(result.targetStory).toBe("3.10");
  });

  it("Test 12: does NOT fire when current < target (3.1 vs 3.2)", () => {
    const state = makeState(3, "3.1");
    expect(
      untilStoryStopCondition(state, EMPTY_DAG, { untilStory: "3.2" }),
    ).toBeNull();
  });

  it("Test 13: does NOT fire when args.untilStory is undefined", () => {
    const state = makeState(3, "3.2");
    expect(untilStoryStopCondition(state, EMPTY_DAG, {})).toBeNull();
  });

  it("Test 13b: does NOT fire when state.lastSuccessfulStep is null", () => {
    const state = makeState(null, null);
    expect(
      untilStoryStopCondition(state, EMPTY_DAG, { untilStory: "3.2" }),
    ).toBeNull();
  });
});

// ─── Test 14-15: evaluateStopConditions dispatcher ────────────────────────

describe("evaluateStopConditions dispatcher (Tests 14-15)", () => {
  it("Test 14: when BOTH predicates would fire, returns epic-end-reached (declaration-order priority)", () => {
    // State has just-completed story 3.10 (epic-end target). Args
    // request BOTH untilEpicEnd AND untilStory 3.5 (overshoot — would
    // fire too). The dispatcher returns the FIRST non-null in declaration
    // order, which is epic-end-reached.
    const state = makeState(3, "3.10");
    const sprintStatus = makeSprintStatusEpic3();
    const args: LoopArgs = { untilEpicEnd: true, untilStory: "3.5" };
    const result = evaluateStopConditions(state, EMPTY_DAG, args, sprintStatus);
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.code).toBe("epic-end-reached");
  });

  it("Test 15: returns null when neither predicate fires", () => {
    const state = makeState(3, "3.1");
    const sprintStatus = makeSprintStatusEpic3();
    const mutated: SprintStatus = {
      development_status: {
        ...sprintStatus.development_status,
        "3-7-list-candidate-next-steps": "in-progress",
      },
    };
    const args: LoopArgs = { untilEpicEnd: true, untilStory: "3.5" };
    expect(evaluateStopConditions(state, EMPTY_DAG, args, mutated)).toBeNull();
  });

  it("Test 15b: dispatcher with only untilStory routes to untilStoryStopCondition", () => {
    const state = makeState(3, "3.5");
    const args: LoopArgs = { untilStory: "3.5" };
    // No sprintStatus passed — epic-end would degrade gracefully; until-
    // story still fires.
    const result = evaluateStopConditions(state, EMPTY_DAG, args, undefined);
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.code).toBe("until-story-reached");
  });
});

// ─── Test 16: predicate purity (defence-in-depth) ─────────────────────────

describe("predicate purity (Test 16)", () => {
  it("untilEpicEndStopCondition: identical inputs → identical results (idempotent)", () => {
    const state = makeState(3, "3.10");
    const sprintStatus = makeSprintStatusEpic3();
    const args: LoopArgs = { untilEpicEnd: true };
    const a = untilEpicEndStopCondition(state, EMPTY_DAG, args, sprintStatus);
    const b = untilEpicEndStopCondition(state, EMPTY_DAG, args, sprintStatus);
    expect(a).toEqual(b);
  });

  it("untilStoryStopCondition: identical inputs → identical results (idempotent)", () => {
    const state = makeState(3, "3.2");
    const args: LoopArgs = { untilStory: "3.2" };
    const a = untilStoryStopCondition(state, EMPTY_DAG, args);
    const b = untilStoryStopCondition(state, EMPTY_DAG, args);
    expect(a).toEqual(b);
  });

  it("compareStoryIds: idempotent over many calls", () => {
    for (let i = 0; i < 100; i++) {
      expect(compareStoryIds("1.10", "1.2")).toBe(1);
    }
  });
});

// ─── Tests N1-N8: nextStoryStopCondition (Story 4.3 AC-1) ─────────────────

describe("nextStoryStopCondition (Story 4.3 AC-1, Tests N1-N8)", () => {
  const args: LoopArgs = { nextStory: true };

  it("Test N1: fires when story changes within an epic (3.2 → 3.3)", () => {
    const state = makeState(3, "3.3");
    const ctx: LoopContext = { startStory: "3.2", startPhase: null };
    const result = nextStoryStopCondition(
      state,
      EMPTY_DAG,
      args,
      undefined,
      ctx,
    );
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.code).toBe("next-story-reached");
    if (result.code !== "next-story-reached") return;
    expect(result.startStory).toBe("3.2");
    expect(result.currentStory).toBe("3.3");
    expect(result.message).toBe("next-story boundary reached");
  });

  it("Test N2: fires across epic boundaries (3.10 → 4.1)", () => {
    const state = makeState(4, "4.1");
    const ctx: LoopContext = { startStory: "3.10", startPhase: null };
    const result = nextStoryStopCondition(
      state,
      EMPTY_DAG,
      args,
      undefined,
      ctx,
    );
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.code).toBe("next-story-reached");
    if (result.code !== "next-story-reached") return;
    expect(result.startStory).toBe("3.10");
    expect(result.currentStory).toBe("4.1");
  });

  it("Test N3: does NOT fire when story unchanged (3.2 === 3.2)", () => {
    const state = makeState(3, "3.2");
    const ctx: LoopContext = { startStory: "3.2", startPhase: null };
    expect(
      nextStoryStopCondition(state, EMPTY_DAG, args, undefined, ctx),
    ).toBeNull();
  });

  it("Test N4: does NOT fire when args.nextStory is undefined", () => {
    const state = makeState(3, "3.3");
    const ctx: LoopContext = { startStory: "3.2", startPhase: null };
    expect(
      nextStoryStopCondition(state, EMPTY_DAG, {}, undefined, ctx),
    ).toBeNull();
  });

  it("Test N5: does NOT fire when args.nextStory is explicit false", () => {
    const state = makeState(3, "3.3");
    const ctx: LoopContext = { startStory: "3.2", startPhase: null };
    expect(
      nextStoryStopCondition(
        state,
        EMPTY_DAG,
        { nextStory: false },
        undefined,
        ctx,
      ),
    ).toBeNull();
  });

  it("Test N6: does NOT fire when loopContext.startStory is null (fresh project)", () => {
    const state = makeState(3, "3.3");
    const ctx: LoopContext = { startStory: null, startPhase: null };
    expect(
      nextStoryStopCondition(state, EMPTY_DAG, args, undefined, ctx),
    ).toBeNull();
  });

  it("Test N7: does NOT fire when loopContext is undefined", () => {
    const state = makeState(3, "3.3");
    expect(
      nextStoryStopCondition(state, EMPTY_DAG, args, undefined, undefined),
    ).toBeNull();
  });

  it("Test N8: does NOT fire when state.lastSuccessfulStep is null", () => {
    const state = makeState(null, null);
    const ctx: LoopContext = { startStory: "3.2", startPhase: null };
    expect(
      nextStoryStopCondition(state, EMPTY_DAG, args, undefined, ctx),
    ).toBeNull();
  });
});

// ─── Tests P1-P6: phaseEndStopCondition (Story 4.3 AC-2) ──────────────────

describe("phaseEndStopCondition (Story 4.3 AC-2, Tests P1-P6)", () => {
  const args: LoopArgs = { phaseEnd: true };

  it("Test P1: fires on planning → implementation transition", () => {
    const dag = makeDagFixture();
    // The just-completed step is `bmad-dev-story` (implementation phase).
    const state = makeState(3, "3.3", "bmad-dev-story");
    const ctx: LoopContext = {
      startStory: null,
      startPhase: "planning",
    };
    const result = phaseEndStopCondition(state, dag, args, undefined, ctx);
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.code).toBe("phase-end-reached");
    if (result.code !== "phase-end-reached") return;
    expect(result.fromPhase).toBe("planning");
    expect(result.toPhase).toBe("implementation");
    expect(result.message).toBe(
      "phase-end (transition planning→implementation) reached",
    );
  });

  it("Test P2: fires on implementation → retro transition", () => {
    const dag = makeDagFixture();
    // Just-completed is `bmad-retrospective` (retro phase).
    const state = makeState(3, "3.10", "bmad-retrospective");
    const ctx: LoopContext = {
      startStory: null,
      startPhase: "implementation",
    };
    const result = phaseEndStopCondition(state, dag, args, undefined, ctx);
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.code).toBe("phase-end-reached");
    if (result.code !== "phase-end-reached") return;
    expect(result.fromPhase).toBe("implementation");
    expect(result.toPhase).toBe("retro");
    expect(result.message).toBe(
      "phase-end (transition implementation→retro) reached",
    );
  });

  it("Test P3: does NOT fire when phase unchanged (implementation === implementation)", () => {
    const dag = makeDagFixture();
    const state = makeState(3, "3.3", "bmad-dev-story");
    const ctx: LoopContext = {
      startStory: null,
      startPhase: "implementation",
    };
    expect(phaseEndStopCondition(state, dag, args, undefined, ctx)).toBeNull();
  });

  it("Test P4: does NOT fire when args.phaseEnd is undefined", () => {
    const dag = makeDagFixture();
    const state = makeState(3, "3.3", "bmad-dev-story");
    const ctx: LoopContext = {
      startStory: null,
      startPhase: "planning",
    };
    expect(phaseEndStopCondition(state, dag, {}, undefined, ctx)).toBeNull();
  });

  it("Test P5: does NOT fire when loopContext.startPhase is null (baseline not yet captured)", () => {
    const dag = makeDagFixture();
    const state = makeState(3, "3.3", "bmad-dev-story");
    const ctx: LoopContext = { startStory: null, startPhase: null };
    expect(phaseEndStopCondition(state, dag, args, undefined, ctx)).toBeNull();
  });

  it("Test P6: does NOT fire when DAG lookup fails (graceful degradation)", () => {
    const dag = makeDagFixture();
    // Step name not in DAG.
    const state = makeState(3, "3.3", "bmad-unknown-skill");
    const ctx: LoopContext = {
      startStory: null,
      startPhase: "planning",
    };
    expect(phaseEndStopCondition(state, dag, args, undefined, ctx)).toBeNull();
  });

  it("Test P6b: does NOT fire when state.lastSuccessfulStep is null (defensive)", () => {
    const dag = makeDagFixture();
    const state = makeState(null, null);
    const ctx: LoopContext = {
      startStory: null,
      startPhase: "planning",
    };
    expect(phaseEndStopCondition(state, dag, args, undefined, ctx)).toBeNull();
  });

  it("Test P6c: does NOT fire when loopContext is undefined", () => {
    const dag = makeDagFixture();
    const state = makeState(3, "3.3", "bmad-dev-story");
    expect(
      phaseEndStopCondition(state, dag, args, undefined, undefined),
    ).toBeNull();
  });
});

// ─── Tests EVAL_43_*: dispatcher priority for Story 4.3 predicates ────────

describe("evaluateStopConditions priority — Story 4.3 (Tests EVAL_43_1, EVAL_43_2)", () => {
  it("Test EVAL_43_1: epic-end wins over phase-end (declaration order)", () => {
    // Setup: both epic-end AND phase-end would fire on this iteration.
    const dag = makeDagFixture();
    // Just-completed is `bmad-retrospective` in epic 3 story 3.10 (retro
    // phase). All stories done + retro done → epic-end fires. Phase
    // baseline === implementation → phase changed → phase-end would fire.
    const state = makeState(3, "3.10", "bmad-retrospective");
    const sprintStatus = makeSprintStatusEpic3();
    const ctx: LoopContext = {
      startStory: "3.9",
      startPhase: "implementation",
    };
    const args: LoopArgs = { untilEpicEnd: true, phaseEnd: true };
    const result = evaluateStopConditions(state, dag, args, sprintStatus, ctx);
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.code).toBe("epic-end-reached");
  });

  it("Test EVAL_43_2: until-story wins over next-story (declaration order)", () => {
    // Setup: --until-story 3.3 + --next-story; both fire (current 3.3
    // matches target AND differs from baseline 3.2). until-story is
    // declared SECOND but precedes next-story (declared THIRD); that
    // ordering is canonical per Story 4.3 §Open Question 6.
    const state = makeState(3, "3.3");
    const ctx: LoopContext = { startStory: "3.2", startPhase: null };
    const args: LoopArgs = { untilStory: "3.3", nextStory: true };
    const result = evaluateStopConditions(
      state,
      EMPTY_DAG,
      args,
      undefined,
      ctx,
    );
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.code).toBe("until-story-reached");
  });

  it("Test EVAL_43_3: dispatcher routes to nextStoryStopCondition when only --next-story fires", () => {
    const state = makeState(3, "3.3");
    const ctx: LoopContext = { startStory: "3.2", startPhase: null };
    const args: LoopArgs = { nextStory: true };
    const result = evaluateStopConditions(
      state,
      EMPTY_DAG,
      args,
      undefined,
      ctx,
    );
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.code).toBe("next-story-reached");
  });

  it("Test EVAL_43_4: dispatcher routes to phaseEndStopCondition when only --phase-end fires", () => {
    const dag = makeDagFixture();
    const state = makeState(3, "3.3", "bmad-dev-story");
    const ctx: LoopContext = { startStory: null, startPhase: "planning" };
    const args: LoopArgs = { phaseEnd: true };
    const result = evaluateStopConditions(state, dag, args, undefined, ctx);
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.code).toBe("phase-end-reached");
  });

  it("Test EVAL_43_5: dispatcher returns null when no Story 4.3 predicate fires (loopContext undefined)", () => {
    const state = makeState(3, "3.3");
    const args: LoopArgs = { nextStory: true, phaseEnd: true };
    expect(
      evaluateStopConditions(state, EMPTY_DAG, args, undefined, undefined),
    ).toBeNull();
  });
});

// ─── Test 17: Story 4.3 predicate purity (defence-in-depth) ───────────────

describe("predicate purity — Story 4.3 (Test 17)", () => {
  it("nextStoryStopCondition: identical inputs → identical results (idempotent)", () => {
    const state = makeState(3, "3.3");
    const ctx: LoopContext = { startStory: "3.2", startPhase: null };
    const args: LoopArgs = { nextStory: true };
    const a = nextStoryStopCondition(state, EMPTY_DAG, args, undefined, ctx);
    const b = nextStoryStopCondition(state, EMPTY_DAG, args, undefined, ctx);
    expect(a).toEqual(b);
  });

  it("phaseEndStopCondition: identical inputs → identical results (idempotent)", () => {
    const dag = makeDagFixture();
    const state = makeState(3, "3.3", "bmad-dev-story");
    const ctx: LoopContext = { startStory: null, startPhase: "planning" };
    const args: LoopArgs = { phaseEnd: true };
    const a = phaseEndStopCondition(state, dag, args, undefined, ctx);
    const b = phaseEndStopCondition(state, dag, args, undefined, ctx);
    expect(a).toEqual(b);
  });

  // ─── Story 4.5 — predicate purity (Test 18) ─────────────────────────────

  it("timeBudgetStopCondition: identical inputs → identical results (idempotent)", () => {
    const state = makeState(4, "4.1");
    const args: LoopArgs = { timeBudgetMs: 100 };
    const metrics: LoopMetrics = {
      // Far in the past → guaranteed elapsed >> budget.
      startedAtNs: -1e15,
      tokensIn: 0,
      tokensOut: 0,
      warned80Time: false,
      warned80Token: false,
    };
    const a = timeBudgetStopCondition(
      state,
      EMPTY_DAG,
      args,
      undefined,
      undefined,
      metrics,
    );
    const b = timeBudgetStopCondition(
      state,
      EMPTY_DAG,
      args,
      undefined,
      undefined,
      metrics,
    );
    // Codes / structured fields equal across calls; elapsedMs may differ
    // by sub-millisecond between calls because Bun.nanoseconds() advances.
    // Assert the discriminator + the byte-identical message + budget.
    expect(a?.code).toBe("time-budget-reached");
    expect(b?.code).toBe("time-budget-reached");
    if (a?.code !== "time-budget-reached") return;
    if (b?.code !== "time-budget-reached") return;
    expect(a.budgetMs).toBe(b.budgetMs);
    expect(a.message).toBe(b.message);
  });

  it("tokenBudgetStopCondition: identical inputs → identical results (idempotent)", () => {
    const state = makeState(4, "4.1");
    const args: LoopArgs = { tokenBudget: 100 };
    const metrics: LoopMetrics = {
      startedAtNs: Bun.nanoseconds(),
      tokensIn: 50,
      tokensOut: 50,
      warned80Time: false,
      warned80Token: false,
    };
    const a = tokenBudgetStopCondition(
      state,
      EMPTY_DAG,
      args,
      undefined,
      undefined,
      metrics,
    );
    const b = tokenBudgetStopCondition(
      state,
      EMPTY_DAG,
      args,
      undefined,
      undefined,
      metrics,
    );
    expect(a).toEqual(b);
  });
});

// ─── Story 4.5 — formatTimeBudget cascade ─────────────────────────────────

describe("formatTimeBudget (Story 4.5)", () => {
  it("7_200_000 → '2h' (AC-1 canonical exemplar)", () => {
    expect(formatTimeBudget(7_200_000)).toBe("2h");
  });

  it("3_600_000 → '1h'", () => {
    expect(formatTimeBudget(3_600_000)).toBe("1h");
  });

  it("5_400_000 → '90m' (hours not evenly divisible)", () => {
    expect(formatTimeBudget(5_400_000)).toBe("90m");
  });

  it("60_000 → '1m'", () => {
    expect(formatTimeBudget(60_000)).toBe("1m");
  });

  it("120_000 → '2m'", () => {
    expect(formatTimeBudget(120_000)).toBe("2m");
  });

  it("1_000 → '1s'", () => {
    expect(formatTimeBudget(1_000)).toBe("1s");
  });

  it("5_000 → '5s'", () => {
    expect(formatTimeBudget(5_000)).toBe("5s");
  });

  it("500 → '500ms' (non-round sub-second)", () => {
    expect(formatTimeBudget(500)).toBe("500ms");
  });

  it("1_500 → '1500ms' (not evenly divisible by 1000)", () => {
    expect(formatTimeBudget(1_500)).toBe("1500ms");
  });

  it("0 → '0ms'", () => {
    expect(formatTimeBudget(0)).toBe("0ms");
  });
});

// ─── Story 4.5 — timeBudgetStopCondition unit tests ───────────────────────

describe("timeBudgetStopCondition (Story 4.5, AC-1)", () => {
  const makeMetrics = (opts?: Partial<LoopMetrics>): LoopMetrics => ({
    startedAtNs: Bun.nanoseconds(),
    tokensIn: 0,
    tokensOut: 0,
    warned80Time: false,
    warned80Token: false,
    ...opts,
  });

  it("returns null when args.timeBudgetMs is undefined", () => {
    const state = makeState(4, "4.1");
    const result = timeBudgetStopCondition(
      state,
      EMPTY_DAG,
      {},
      undefined,
      undefined,
      makeMetrics(),
    );
    expect(result).toBeNull();
  });

  it("returns null when loopMetrics is undefined", () => {
    const state = makeState(4, "4.1");
    const result = timeBudgetStopCondition(
      state,
      EMPTY_DAG,
      { timeBudgetMs: 1000 },
      undefined,
      undefined,
      undefined,
    );
    expect(result).toBeNull();
  });

  it("returns null when elapsed < budget", () => {
    const state = makeState(4, "4.1");
    // startedAtNs in the future → negative elapsed → under budget
    const result = timeBudgetStopCondition(
      state,
      EMPTY_DAG,
      { timeBudgetMs: 1_000_000 },
      undefined,
      undefined,
      makeMetrics({ startedAtNs: Bun.nanoseconds() + 1e15 }),
    );
    expect(result).toBeNull();
  });

  it("fires when elapsed >= budget (startedAtNs far in the past)", () => {
    const state = makeState(4, "4.1");
    const result = timeBudgetStopCondition(
      state,
      EMPTY_DAG,
      { timeBudgetMs: 100 },
      undefined,
      undefined,
      makeMetrics({ startedAtNs: -1e15 }),
    );
    expect(result?.code).toBe("time-budget-reached");
    if (result?.code !== "time-budget-reached") return;
    expect(result.budgetMs).toBe(100);
    expect(result.elapsedMs).toBeGreaterThan(100);
  });

  it("AC-1 message format: 'time-budget (Xh) reached, partial work committed' for 2h budget", () => {
    const state = makeState(4, "4.1");
    const result = timeBudgetStopCondition(
      state,
      EMPTY_DAG,
      { timeBudgetMs: 7_200_000 },
      undefined,
      undefined,
      makeMetrics({ startedAtNs: -1e15 }),
    );
    expect(result?.code).toBe("time-budget-reached");
    if (result?.code !== "time-budget-reached") return;
    expect(result.message).toBe(
      "time-budget (2h) reached, partial work committed",
    );
  });

  it("AC-1 message format: 'time-budget (500ms) reached, partial work committed' for 500ms budget", () => {
    const state = makeState(4, "4.1");
    const result = timeBudgetStopCondition(
      state,
      EMPTY_DAG,
      { timeBudgetMs: 500 },
      undefined,
      undefined,
      makeMetrics({ startedAtNs: -1e15 }),
    );
    expect(result?.code).toBe("time-budget-reached");
    if (result?.code !== "time-budget-reached") return;
    expect(result.message).toBe(
      "time-budget (500ms) reached, partial work committed",
    );
  });
});

// ─── Story 4.5 — tokenBudgetStopCondition unit tests ─────────────────────

describe("tokenBudgetStopCondition (Story 4.5, AC-2)", () => {
  const makeMetrics = (opts?: Partial<LoopMetrics>): LoopMetrics => ({
    startedAtNs: Bun.nanoseconds(),
    tokensIn: 0,
    tokensOut: 0,
    warned80Time: false,
    warned80Token: false,
    ...opts,
  });

  it("returns null when args.tokenBudget is undefined", () => {
    const state = makeState(4, "4.1");
    const result = tokenBudgetStopCondition(
      state,
      EMPTY_DAG,
      {},
      undefined,
      undefined,
      makeMetrics({ tokensIn: 100, tokensOut: 100 }),
    );
    expect(result).toBeNull();
  });

  it("returns null when loopMetrics is undefined", () => {
    const state = makeState(4, "4.1");
    const result = tokenBudgetStopCondition(
      state,
      EMPTY_DAG,
      { tokenBudget: 100 },
      undefined,
      undefined,
      undefined,
    );
    expect(result).toBeNull();
  });

  it("returns null when total tokens < budget", () => {
    const state = makeState(4, "4.1");
    const result = tokenBudgetStopCondition(
      state,
      EMPTY_DAG,
      { tokenBudget: 200 },
      undefined,
      undefined,
      makeMetrics({ tokensIn: 50, tokensOut: 50 }),
    );
    expect(result).toBeNull();
  });

  it("fires when total tokens === budget (exact hit)", () => {
    const state = makeState(4, "4.1");
    const result = tokenBudgetStopCondition(
      state,
      EMPTY_DAG,
      { tokenBudget: 100 },
      undefined,
      undefined,
      makeMetrics({ tokensIn: 50, tokensOut: 50 }),
    );
    expect(result?.code).toBe("token-budget-reached");
    if (result?.code !== "token-budget-reached") return;
    expect(result.budget).toBe(100);
    expect(result.tokensIn).toBe(50);
    expect(result.tokensOut).toBe(50);
  });

  it("fires when total tokens > budget (overshoot)", () => {
    const state = makeState(4, "4.1");
    const result = tokenBudgetStopCondition(
      state,
      EMPTY_DAG,
      { tokenBudget: 100 },
      undefined,
      undefined,
      makeMetrics({ tokensIn: 80, tokensOut: 80 }),
    );
    expect(result?.code).toBe("token-budget-reached");
  });

  it("AC-2 message includes actual usage stats", () => {
    const state = makeState(4, "4.1");
    const result = tokenBudgetStopCondition(
      state,
      EMPTY_DAG,
      { tokenBudget: 100 },
      undefined,
      undefined,
      makeMetrics({ tokensIn: 60, tokensOut: 40 }),
    );
    expect(result?.code).toBe("token-budget-reached");
    if (result?.code !== "token-budget-reached") return;
    expect(result.message).toBe(
      "token-budget (100) reached, used 60 tokensIn + 40 tokensOut",
    );
  });
});

// ─── Story 4.5 — evaluateStopConditions with loopMetrics ─────────────────

describe("evaluateStopConditions with loopMetrics (Story 4.5)", () => {
  it("EVAL_45_1: timeBudgetStopCondition fires through dispatcher when budget exceeded", () => {
    const state = makeState(4, "4.1");
    const metrics: LoopMetrics = {
      startedAtNs: -1e15,
      tokensIn: 0,
      tokensOut: 0,
      warned80Time: false,
      warned80Token: false,
    };
    const result = evaluateStopConditions(
      state,
      EMPTY_DAG,
      { timeBudgetMs: 100 },
      undefined,
      undefined,
      metrics,
    );
    expect(result?.code).toBe("time-budget-reached");
  });

  it("EVAL_45_2: tokenBudgetStopCondition fires through dispatcher when budget exceeded", () => {
    const state = makeState(4, "4.1");
    const metrics: LoopMetrics = {
      startedAtNs: Bun.nanoseconds(),
      tokensIn: 60,
      tokensOut: 60,
      warned80Time: false,
      warned80Token: false,
    };
    const result = evaluateStopConditions(
      state,
      EMPTY_DAG,
      { tokenBudget: 100 },
      undefined,
      undefined,
      metrics,
    );
    expect(result?.code).toBe("token-budget-reached");
  });

  it("EVAL_45_3: explicit --until-story takes priority over budget (declaration order)", () => {
    const state = makeState(4, "4.1");
    const metrics: LoopMetrics = {
      startedAtNs: -1e15,
      tokensIn: 200,
      tokensOut: 200,
      warned80Time: false,
      warned80Token: false,
    };
    // Both until-story AND token-budget would fire; until-story is first.
    const result = evaluateStopConditions(
      state,
      EMPTY_DAG,
      { untilStory: "4.1", tokenBudget: 100 },
      undefined,
      undefined,
      metrics,
    );
    expect(result?.code).toBe("until-story-reached");
  });

  it("EVAL_45_4: no loopMetrics → budget predicates return null (graceful degradation)", () => {
    const state = makeState(4, "4.1");
    const result = evaluateStopConditions(
      state,
      EMPTY_DAG,
      { timeBudgetMs: 1, tokenBudget: 1 },
      undefined,
      undefined,
      undefined,
    );
    expect(result).toBeNull();
  });
});
