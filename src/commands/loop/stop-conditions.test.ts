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
import type { DagAdjacency } from "../../dag/index.ts";
import type { State } from "../../schemas/state.ts";
import type { LoopArgs } from "./args.ts";
import {
  compareStoryIds,
  evaluateStopConditions,
  type SprintStatus,
  untilEpicEndStopCondition,
  untilStoryStopCondition,
} from "./stop-conditions.ts";

// ─── Fixture helpers ──────────────────────────────────────────────────────

const EMPTY_DAG: DagAdjacency = {
  nodes: new Map(),
  edgesOut: new Map(),
  edgesIn: new Map(),
};

function makeState(epic: number | null, story: string | null): State {
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
      step: "bmad-dev-story",
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
