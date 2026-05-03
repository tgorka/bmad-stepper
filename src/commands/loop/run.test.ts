/**
 * src/commands/loop/run.test.ts — colocated unit tests for `runLoop`
 * (Story 4.1 AC-1; Story 4.2 AC-1/2; Story 4.3 AC-1/2/3; Story 4.4 AC-1/2/3).
 *
 * Tests use the `runNextOverride` test-injection seam (per Story 1.6 +
 * Story 3.x precedent — runtime-injectable test seams are preferred over
 * `mock.module` per Bun mock-restore carry-over). Tests pass a stub
 * `runNextOverride` to assert the iteration loop's call count, the
 * IterationRecord shape, and the StopReason discriminated union.
 *
 * Coverage:
 *   - AC-1 verbatim (Test A + B): `--max-iters 1` runs exactly one
 *     iteration and exits with reason `max-iters reached`.
 *   - Multi-iteration (Test C): `--max-iters 3` runs exactly 3 iterations.
 *   - IterationRecord shape (Test D).
 *   - Default cap (Test E + X_44 + AA_44): Story 4.4 AC-1 — `argv=[]`
 *     injects `--max-iters=50` and runs 50 iterations exiting with
 *     `max-iters-reached`.
 *   - AC-2 (Test Y_44): `--max-iters 10` exits with `max-iters-reached`
 *     carrying maxIters=10.
 *   - AC-3 (Test Z_44 + AA_44): explicit `--until-epic-end` /
 *     `--until-story` / `--next-story` do NOT inject the default cap.
 *   - halt-on-error (Test F): non-zero exitCode stops the loop.
 *   - LoopResult shape (Test G).
 *   - ConfigError on argv parse failure (Test H).
 *   - AR41 boundary check (Test I).
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextResult } from "../next/run.ts";
import { runLoop } from "./run.ts";

// Helper: build a stub NextResult that returns success.
function successResult(runId = "iter-test-1"): NextResult {
  return {
    exitCode: 0,
    action: {
      action: "dispatch",
      runId,
      agent: "bmad-step-runner",
      exitCode: 0,
    },
  };
}

// Helper: build a stub NextResult that returns a halt action.
function haltResult(message = "verifier failure"): NextResult {
  return {
    exitCode: 1,
    action: {
      action: "halt",
      message,
      exitCode: 1,
    },
  };
}

// Helper: build a counting stub to track call count.
function countingStub(result: NextResult | (() => NextResult)): {
  stub: () => Promise<NextResult>;
  calls: () => number;
} {
  let count = 0;
  return {
    stub: async () => {
      count++;
      return typeof result === "function" ? result() : result;
    },
    calls: () => count,
  };
}

describe("runLoop — Test A + B (AC-1 verbatim: --max-iters 1)", () => {
  it("Test A: --max-iters 1 runs exactly one iteration", async () => {
    const { stub, calls } = countingStub(successResult());
    const result = await runLoop({
      argv: ["--max-iters", "1"],
      runNextOverride: stub,
    });
    expect(result.iterations.length).toBe(1);
    expect(result.iterations[0]?.iterCount).toBe(1);
    expect(result.exitCode).toBe(0);
    expect(calls()).toBe(1);
  });

  it("Test B: exits with reason max-iters-reached + maxIters=1", async () => {
    const { stub } = countingStub(successResult());
    const result = await runLoop({
      argv: ["--max-iters", "1"],
      runNextOverride: stub,
    });
    expect(result.stopReason.code).toBe("max-iters-reached");
    if (result.stopReason.code !== "max-iters-reached") return;
    expect(result.stopReason.maxIters).toBe(1);
    expect(result.stopReason.iterCount).toBe(1);
  });
});

describe("runLoop — Test C (multi-iteration --max-iters 3)", () => {
  it("--max-iters 3 runs exactly 3 iterations", async () => {
    const { stub, calls } = countingStub(successResult());
    const result = await runLoop({
      argv: ["--max-iters", "3"],
      runNextOverride: stub,
    });
    expect(result.iterations.length).toBe(3);
    expect(calls()).toBe(3);
    expect(result.stopReason.code).toBe("max-iters-reached");
    if (result.stopReason.code !== "max-iters-reached") return;
    expect(result.stopReason.maxIters).toBe(3);
    expect(result.stopReason.iterCount).toBe(3);
    // 1-indexed iteration numbers.
    expect(result.iterations[0]?.iterCount).toBe(1);
    expect(result.iterations[1]?.iterCount).toBe(2);
    expect(result.iterations[2]?.iterCount).toBe(3);
  });
});

describe("runLoop — Test D (IterationRecord shape)", () => {
  it("each iteration record contains the expected fields", async () => {
    const { stub } = countingStub(successResult("rec-shape-test"));
    const result = await runLoop({
      argv: ["--max-iters", "1"],
      runNextOverride: stub,
    });
    const record = result.iterations[0];
    expect(record).toBeDefined();
    if (record === undefined) return;
    expect(record.iterCount).toBe(1);
    expect(record.runId).toBe("rec-shape-test");
    expect(record.action).toBe("dispatch");
    expect(record.exitCode).toBe(0);
    expect(typeof record.durationMs).toBe("number");
    expect(record.durationMs).toBeGreaterThanOrEqual(0);
    // Validate ISO timestamp parses.
    expect(Number.isNaN(Date.parse(record.startedAt))).toBe(false);
  });

  it("runId is null when action is report (no runId in dispatch protocol)", async () => {
    const reportResult: NextResult = {
      exitCode: 0,
      action: { action: "report", message: "OK", exitCode: 0 },
    };
    // To exercise the null-runId branch we need to break out of the loop
    // before halting; use --max-iters 1 with a report-action result.
    // The loop does NOT halt-on-error since exitCode===0, so iteration 1
    // appends with runId=null and then max-iters fires.
    const { stub } = countingStub(reportResult);
    const result = await runLoop({
      argv: ["--max-iters", "1"],
      runNextOverride: stub,
    });
    expect(result.iterations.length).toBe(1);
    expect(result.iterations[0]?.runId).toBeNull();
    expect(result.iterations[0]?.action).toBe("report");
  });
});

describe("runLoop — Test E (default --max-iters=50 when no stop condition supplied; Story 4.4 AC-1)", () => {
  it("argv=[] applies the default --max-iters=50 cap and runs 50 iterations", async () => {
    const { stub, calls } = countingStub(successResult());
    const result = await runLoop({ argv: [], runNextOverride: stub });
    expect(result.iterations.length).toBe(50);
    expect(result.stopReason.code).toBe("max-iters-reached");
    if (result.stopReason.code !== "max-iters-reached") return;
    expect(result.stopReason.maxIters).toBe(50);
    expect(result.stopReason.iterCount).toBe(50);
    expect(result.exitCode).toBe(0);
    expect(calls()).toBe(50);
  });
});

describe("runLoop — Test F (halt-on-error stops the loop)", () => {
  it("non-zero exitCode short-circuits before reaching --max-iters cap", async () => {
    const { stub, calls } = countingStub(haltResult("verifier_failure"));
    const result = await runLoop({
      argv: ["--max-iters", "5"],
      runNextOverride: stub,
    });
    // Loop attempted iteration 1, runNext returned halt, loop short-circuited.
    expect(result.iterations.length).toBe(1);
    expect(calls()).toBe(1);
    expect(result.stopReason.code).toBe("halt-on-error");
    if (result.stopReason.code !== "halt-on-error") return;
    expect(result.stopReason.iterCount).toBe(1);
    expect(result.stopReason.failureCode).toBe("EXIT_1");
    expect(result.exitCode).toBe(1);
  });

  it("halt-on-error iteration record carries action=halt", async () => {
    const { stub } = countingStub(haltResult("verifier_failure"));
    const result = await runLoop({
      argv: ["--max-iters", "5"],
      runNextOverride: stub,
    });
    expect(result.iterations[0]?.action).toBe("halt");
    expect(result.iterations[0]?.exitCode).toBe(1);
  });
});

describe("runLoop — Test G (LoopResult shape)", () => {
  it("startedAt + completedAt are ISO timestamps; durationMs >= 0", async () => {
    const { stub } = countingStub(successResult());
    const result = await runLoop({
      argv: ["--max-iters", "2"],
      runNextOverride: stub,
    });
    expect(Number.isNaN(Date.parse(result.startedAt))).toBe(false);
    expect(Number.isNaN(Date.parse(result.completedAt))).toBe(false);
    expect(typeof result.durationMs).toBe("number");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    // completedAt is at-or-after startedAt.
    expect(Date.parse(result.completedAt)).toBeGreaterThanOrEqual(
      Date.parse(result.startedAt),
    );
  });
});

describe("runLoop — Test H (ConfigError on argv parse failure)", () => {
  it("throws on unknown flag", async () => {
    let caught: unknown;
    try {
      await runLoop({ argv: ["--unknown-flag"] });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    // Verify it's a thrown error with code === "CONFIG_ERROR".
    const err = caught as { code?: string; actionableHint?: string };
    expect(err.code).toBe("CONFIG_ERROR");
  });

  it("throws on missing --max-iters value", async () => {
    let caught: unknown;
    try {
      await runLoop({ argv: ["--max-iters"] });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    const err = caught as { code?: string };
    expect(err.code).toBe("CONFIG_ERROR");
  });
});

describe("runLoop — Test I (AR41 boundary check)", () => {
  it("src/commands/loop/run.ts does not import from src/lock/ (lock-free per AR8)", () => {
    const source = readFileSync(join(import.meta.dir, "run.ts"), "utf-8");
    // Top-tier loop runner must remain lock-free per AR8 — `src/lock/`
    // imports are forbidden. Story 4.2 ADDS `src/state/load.ts` and
    // `src/dag/index.ts` imports (foundational/mid-tier per AR41 lines
    // 1271-1295 — top-tier MAY import mid-tier; only the lock module is
    // forbidden because the runner's lock-free invariant is wider than
    // AR41 alone).
    expect(source).not.toMatch(/from\s+["']\.\.\/\.\.\/lock\//);
  });

  it("src/commands/loop/run.ts imports runNext from ../next/run.ts (top-tier sibling)", () => {
    const source = readFileSync(join(import.meta.dir, "run.ts"), "utf-8");
    // Validates the canonical top-tier sibling import per AR41 + AC-1.
    expect(source).toMatch(/from\s+["']\.\.\/next\/run\.ts["']/);
  });

  it("src/commands/loop/run.ts imports loadStateUnlocked from src/state/load.ts (Story 4.2)", () => {
    const source = readFileSync(join(import.meta.dir, "run.ts"), "utf-8");
    // Story 4.2: per-iteration state load via the read-only/lock-free
    // entry point. Production code MUST use `loadStateUnlocked` (not
    // `loadState`) — the loop runner is read-only at the top tier per
    // AR8 + Story 2.4's contract.
    expect(source).toMatch(/loadStateUnlocked/);
    expect(source).toMatch(/from\s+["']\.\.\/\.\.\/state\/load\.ts["']/);
  });

  it("src/commands/loop/run.ts imports buildDag from src/dag/build.ts (Story 4.3)", () => {
    const source = readFileSync(join(import.meta.dir, "run.ts"), "utf-8");
    // Story 4.3: opt-in DAG build for `--phase-end`. The `buildDag` alias
    // for the canonical `build` export from `src/dag/build.ts` is the
    // sole new mid-tier import; foundational/mid-tier-import is
    // permitted at the top tier per AR41 lines 1294-1302.
    expect(source).toMatch(/buildDag/);
    expect(source).toMatch(/from\s+["']\.\.\/\.\.\/dag\/build\.ts["']/);
  });
});

// Story 4.2: AR41 boundary check on the new pure-function module.
describe("stop-conditions — AR41 boundary check (Story 4.2)", () => {
  it("src/commands/loop/stop-conditions.ts is pure — zero I/O imports", () => {
    const source = readFileSync(
      join(import.meta.dir, "stop-conditions.ts"),
      "utf-8",
    );
    // Forbidden: any I/O-tier or sibling-higher import. Only foundational
    // type imports + intra-module type imports are allowed.
    expect(source).not.toMatch(/from\s+["']\.\.\/\.\.\/lock\//);
    expect(source).not.toMatch(/from\s+["']\.\.\/\.\.\/state\//);
    expect(source).not.toMatch(/from\s+["']\.\.\/next\//);
    expect(source).not.toMatch(/from\s+["']node:fs/);
    expect(source).not.toMatch(/from\s+["']node:fs\/promises/);
    // No console.X() invocations per AR33 (matches console.log(),
    // console.error(), etc. — not the literal string "console.*" in
    // doc comments).
    expect(source).not.toMatch(
      /console\.(log|error|warn|info|debug|trace|dir|table|time|timeEnd|group|groupEnd|count|countReset|assert)\s*\(/,
    );
  });
});

describe("runLoop — args pass-through", () => {
  it("opts.args overrides opts.argv", async () => {
    const { stub, calls } = countingStub(successResult());
    const result = await runLoop({
      args: { maxIters: 2 },
      // argv is ignored when args is set.
      argv: ["--max-iters", "100"],
      runNextOverride: stub,
    });
    expect(result.iterations.length).toBe(2);
    expect(calls()).toBe(2);
    if (result.stopReason.code !== "max-iters-reached") return;
    expect(result.stopReason.maxIters).toBe(2);
  });
});

describe("runLoop — multi-iteration with mixed action sequence", () => {
  it("each successful iteration records its own runId", async () => {
    let i = 0;
    const stub = mock(async () => {
      i++;
      return successResult(`iter-${i}`);
    });
    const result = await runLoop({
      argv: ["--max-iters", "3"],
      runNextOverride: stub,
    });
    expect(result.iterations.length).toBe(3);
    expect(result.iterations[0]?.runId).toBe("iter-1");
    expect(result.iterations[1]?.runId).toBe("iter-2");
    expect(result.iterations[2]?.runId).toBe("iter-3");
  });
});

// ─── Story 4.2 integration tests (AC-1 + AC-2) ────────────────────────────

import type { State } from "../../schemas/state.ts";
import type { SprintStatus } from "./stop-conditions.ts";

// Helper: build a minimal State fixture with `lastSuccessfulStep.epic`
// + `.story`. v0.1 conservative fields — runtime-validated by the Zod
// schema (`src/schemas/state.ts`).
function makeStateFixture(epic: number, story: string): State {
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

// Helper: build a SprintStatus fixture for a fully-done epic + retro.
function makeSprintStatusEpic3Done(): SprintStatus {
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

describe("runLoop — Test I_42 (Story 4.2 AC-1: --until-epic-end fires when epic done)", () => {
  it("exits with stopReason.code === epic-end-reached when all stories done + retro done", async () => {
    const { stub } = countingStub(successResult());
    const state = makeStateFixture(3, "3.10");
    const sprintStatus = makeSprintStatusEpic3Done();
    const result = await runLoop({
      argv: ["--until-epic-end"],
      runNextOverride: stub,
      stateOverride: () => state,
      sprintStatusOverride: () => sprintStatus,
      stderrOverride: () => {},
    });
    expect(result.stopReason.code).toBe("epic-end-reached");
    if (result.stopReason.code !== "epic-end-reached") return;
    expect(result.stopReason.epic).toBe("3");
    expect(result.stopReason.message).toBe("epic-end reached");
    expect(result.exitCode).toBe(0);
  });

  it("does NOT fire when one story is still in-progress", async () => {
    const { stub } = countingStub(successResult());
    const state = makeStateFixture(3, "3.5");
    const sprintStatus = makeSprintStatusEpic3Done();
    const mutated: SprintStatus = {
      development_status: {
        ...sprintStatus.development_status,
        "3-7-list-candidate-next-steps": "in-progress",
      },
    };
    // Combine with --max-iters 2 to bound the loop (the until-epic-end
    // predicate does NOT fire; max-iters does).
    const result = await runLoop({
      argv: ["--until-epic-end", "--max-iters", "2"],
      runNextOverride: stub,
      stateOverride: () => state,
      sprintStatusOverride: () => mutated,
      stderrOverride: () => {},
    });
    expect(result.stopReason.code).toBe("max-iters-reached");
    expect(result.iterations.length).toBe(2);
  });
});

describe("runLoop — Test J_42 (Story 4.2 AC-1: state-snapshot pointer + --resume hint to stderr)", () => {
  it("emits the state-snapshot pointer + --resume hint to stderr on epic-end-reached", async () => {
    const { stub } = countingStub(successResult());
    const state = makeStateFixture(3, "3.10");
    const sprintStatus = makeSprintStatusEpic3Done();
    const captured: string[] = [];
    await runLoop({
      argv: ["--until-epic-end"],
      runNextOverride: stub,
      stateOverride: () => state,
      sprintStatusOverride: () => sprintStatus,
      stderrOverride: (chunk: string) => {
        captured.push(chunk);
      },
    });
    const combined = captured.join("");
    expect(combined).toContain("epic-end reached");
    expect(combined).toContain("State snapshot");
    expect(combined).toContain("/bmad-loop --resume");
  });
});

describe("runLoop — Test K_42 (Story 4.2 AC-2: --until-story 3.2 fires on exact match)", () => {
  it("exits with stopReason.code === until-story-reached + correct fields", async () => {
    const { stub } = countingStub(successResult());
    const state = makeStateFixture(3, "3.2");
    const result = await runLoop({
      argv: ["--until-story", "3.2"],
      runNextOverride: stub,
      stateOverride: () => state,
      sprintStatusOverride: () => null,
      stderrOverride: () => {},
    });
    expect(result.stopReason.code).toBe("until-story-reached");
    if (result.stopReason.code !== "until-story-reached") return;
    expect(result.stopReason.targetStory).toBe("3.2");
    expect(result.stopReason.currentStory).toBe("3.2");
    expect(result.stopReason.message).toBe("story 3.2 reached");
    expect(result.exitCode).toBe(0);
  });
});

describe("runLoop — Test L_42 (Story 4.2 AC-2: --until-story 3.2 fires on overshoot)", () => {
  it("fires when state advanced to story 3.3 (overshoot) — message stays AC-2 verbatim", async () => {
    const { stub } = countingStub(successResult());
    const state = makeStateFixture(3, "3.3");
    const result = await runLoop({
      argv: ["--until-story", "3.2"],
      runNextOverride: stub,
      stateOverride: () => state,
      sprintStatusOverride: () => null,
      stderrOverride: () => {},
    });
    expect(result.stopReason.code).toBe("until-story-reached");
    if (result.stopReason.code !== "until-story-reached") return;
    expect(result.stopReason.targetStory).toBe("3.2");
    expect(result.stopReason.currentStory).toBe("3.3");
    expect(result.stopReason.message).toBe("story 3.2 reached");
  });
});

describe("runLoop — Test M_42 (Story 4.2 AC-2: --until-story 3.2 does NOT fire when current < target)", () => {
  it("loop bounded by --max-iters when current story < target story", async () => {
    const { stub } = countingStub(successResult());
    const state = makeStateFixture(3, "3.1");
    const result = await runLoop({
      argv: ["--until-story", "3.2", "--max-iters", "2"],
      runNextOverride: stub,
      stateOverride: () => state,
      sprintStatusOverride: () => null,
      stderrOverride: () => {},
    });
    // The until-story predicate does NOT fire because 3.1 < 3.2.
    // The --max-iters cap kicks in instead.
    expect(result.stopReason.code).toBe("max-iters-reached");
    expect(result.iterations.length).toBe(2);
  });
});

describe("runLoop — Test N_42 (Story 4.4 AC-3: explicit-overrides-default — `--until-epic-end` alone does NOT apply default cap)", () => {
  it("--until-epic-end + --max-iters 2 — explicit cap controls; no default-50 injection", async () => {
    const { stub, calls } = countingStub(successResult());
    // Epic NOT done — predicate does not fire. With --max-iters 2 to
    // bound. Story 4.2 introduced `hasOtherStopCondition` to suppress
    // the v0.1 `no-stop-condition` placeholder when another condition
    // is supplied; Story 4.4 REMOVED both the helper AND the
    // placeholder, replacing them with a default-cap injection. The
    // semantic is now: when `--until-epic-end` is supplied WITHOUT
    // `--max-iters`, NO default cap is applied (the explicit condition
    // controls). This test pins the explicit-cap path: `--max-iters 2`
    // wins, the loop runs 2 iterations.
    const state = makeStateFixture(3, "3.5");
    const sprintStatus = makeSprintStatusEpic3Done();
    const mutated: SprintStatus = {
      development_status: {
        ...sprintStatus.development_status,
        "3-7-list-candidate-next-steps": "in-progress",
      },
    };
    const result = await runLoop({
      argv: ["--until-epic-end", "--max-iters", "2"],
      runNextOverride: stub,
      stateOverride: () => state,
      sprintStatusOverride: () => mutated,
      stderrOverride: () => {},
    });
    expect(result.stopReason.code).toBe("max-iters-reached");
    expect(calls()).toBe(2);
  });

  it("--until-story 3.5 alone (no --max-iters) — explicit predicate fires; no default-cap", async () => {
    const { stub, calls } = countingStub(successResult());
    // Current story is 3.5 (>= target) so the predicate fires on the
    // iter-0 boundary check. Story 4.4: when `--until-story` is
    // supplied alone, NO default cap is applied — the explicit
    // condition controls.
    const state = makeStateFixture(3, "3.5");
    const result = await runLoop({
      argv: ["--until-story", "3.5"],
      runNextOverride: stub,
      stateOverride: () => state,
      sprintStatusOverride: () => null,
      stderrOverride: () => {},
    });
    expect(result.stopReason.code).toBe("until-story-reached");
    expect(calls()).toBe(0);
  });
});

// ─── Story 4.3 integration tests (AC-1 + AC-2 + AC-3 sweep) ───────────────

import type { DagAdjacency, DagNode, Phase } from "../../dag/index.ts";

// Helper: build a state fixture allowing custom step + epic + story.
function makeStateFixtureFull(
  epic: number,
  story: string,
  step = "bmad-dev-story",
): State {
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

// Helper: minimal DAG fixture for Story 4.3 phase-transition tests.
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
  addNode("bmad-domain-research", "analysis");
  return { nodes, edgesOut: new Map(), edgesIn: new Map() };
}

// Helper: build a sequencing state stub. Each call returns the next
// state in the array; clamps at the last element.
function sequenceStateStub(
  states: ReadonlyArray<State | null>,
): () => State | null {
  let i = 0;
  return () => {
    const out = states[Math.min(i, states.length - 1)] ?? null;
    i++;
    return out;
  };
}

describe("runLoop --next-story (Story 4.3 AC-1)", () => {
  it("Test P_43: --next-story fires on story transition (3.2 → 3.3)", async () => {
    const { stub } = countingStub(successResult());
    // The runLoop calls stateFn at:
    //   1) loop entry (baseline capture) → state 3.2
    //   2) iter-0 pre-check (shouldStop) → state 3.2 (predicate compares baseline === 3.2 → no-fire)
    //   3) post-iter-0 deferred-baseline update path → only runs if startStory was null;
    //      our baseline is 3.2 (non-null), so this path is skipped
    //   4) iter-1 pre-check (shouldStop) → state 3.3 (predicate fires)
    const states: ReadonlyArray<State | null> = [
      makeStateFixtureFull(3, "3.2"),
      makeStateFixtureFull(3, "3.2"),
      makeStateFixtureFull(3, "3.3"),
    ];
    const result = await runLoop({
      argv: ["--next-story"],
      runNextOverride: stub,
      stateOverride: sequenceStateStub(states),
      sprintStatusOverride: () => null,
      stderrOverride: () => {},
    });
    expect(result.iterations.length).toBe(1);
    expect(result.stopReason.code).toBe("next-story-reached");
    if (result.stopReason.code !== "next-story-reached") return;
    expect(result.stopReason.startStory).toBe("3.2");
    expect(result.stopReason.currentStory).toBe("3.3");
    expect(result.stopReason.message).toBe("next-story boundary reached");
    expect(result.exitCode).toBe(0);
  });

  it("Test Q_43: --next-story does NOT fire when story unchanged", async () => {
    const { stub, calls } = countingStub(successResult());
    // State remains at 3.2 across iterations.
    const state = makeStateFixtureFull(3, "3.2");
    const result = await runLoop({
      argv: ["--next-story", "--max-iters", "2"],
      runNextOverride: stub,
      stateOverride: () => state,
      sprintStatusOverride: () => null,
      stderrOverride: () => {},
    });
    expect(result.stopReason.code).toBe("max-iters-reached");
    expect(result.iterations.length).toBe(2);
    expect(calls()).toBe(2);
  });

  it("Test R_43: --next-story works across epic boundaries (3.10 → 4.1)", async () => {
    const { stub } = countingStub(successResult());
    // Same call sequence as P_43: loop-entry + iter-0 pre-check at 3.10, then 4.1.
    const states: ReadonlyArray<State | null> = [
      makeStateFixtureFull(3, "3.10"),
      makeStateFixtureFull(3, "3.10"),
      makeStateFixtureFull(4, "4.1"),
    ];
    const result = await runLoop({
      argv: ["--next-story"],
      runNextOverride: stub,
      stateOverride: sequenceStateStub(states),
      sprintStatusOverride: () => null,
      stderrOverride: () => {},
    });
    expect(result.stopReason.code).toBe("next-story-reached");
    if (result.stopReason.code !== "next-story-reached") return;
    expect(result.stopReason.startStory).toBe("3.10");
    expect(result.stopReason.currentStory).toBe("4.1");
  });
});

describe("runLoop --phase-end (Story 4.3 AC-2)", () => {
  it("Test S_43: --phase-end fires on planning → implementation transition", async () => {
    const { stub } = countingStub(successResult());
    const dag = makeDagFixture();
    // The runLoop calls stateFn at loop entry + per-iter pre-check + post-iter
    // (deferred-baseline path; only fires when one of the baselines is null).
    // For this test loopContext.startPhase resolves to "planning" (non-null);
    // baseline.startStory is "3.2" (non-null) — so the deferred-baseline path
    // is skipped. Sequence: loop-entry (planning), iter-0 pre-check (planning,
    // matches baseline → no-fire), iter-1 pre-check (implementation → fires).
    const states: ReadonlyArray<State | null> = [
      makeStateFixtureFull(3, "3.2", "bmad-create-prd"),
      makeStateFixtureFull(3, "3.2", "bmad-create-prd"),
      makeStateFixtureFull(3, "3.2", "bmad-dev-story"),
    ];
    const result = await runLoop({
      argv: ["--phase-end"],
      runNextOverride: stub,
      stateOverride: sequenceStateStub(states),
      sprintStatusOverride: () => null,
      stderrOverride: () => {},
      dagOverride: () => dag,
    });
    expect(result.stopReason.code).toBe("phase-end-reached");
    if (result.stopReason.code !== "phase-end-reached") return;
    expect(result.stopReason.fromPhase).toBe("planning");
    expect(result.stopReason.toPhase).toBe("implementation");
    expect(result.stopReason.message).toBe(
      "phase-end (transition planning→implementation) reached",
    );
    expect(result.exitCode).toBe(0);
  });

  it("Test T_43: --phase-end does NOT fire when phase unchanged", async () => {
    const { stub, calls } = countingStub(successResult());
    const dag = makeDagFixture();
    // State always returns the same step (implementation phase).
    const state = makeStateFixtureFull(3, "3.2", "bmad-dev-story");
    const result = await runLoop({
      argv: ["--phase-end", "--max-iters", "2"],
      runNextOverride: stub,
      stateOverride: () => state,
      sprintStatusOverride: () => null,
      stderrOverride: () => {},
      dagOverride: () => dag,
    });
    expect(result.stopReason.code).toBe("max-iters-reached");
    expect(result.iterations.length).toBe(2);
    expect(calls()).toBe(2);
  });

  it("Test U_43: --phase-end degrades gracefully when DAG load fails", async () => {
    const { stub, calls } = countingStub(successResult());
    const state = makeStateFixtureFull(3, "3.2", "bmad-dev-story");
    const result = await runLoop({
      argv: ["--phase-end", "--max-iters", "2"],
      runNextOverride: stub,
      stateOverride: () => state,
      sprintStatusOverride: () => null,
      stderrOverride: () => {},
      // dagOverride returns null — simulates buildDag failure.
      dagOverride: () => null,
    });
    // The phase-end predicate short-circuits (loopContext.startPhase
    // === null because DAG load failed). The loop runs to --max-iters cap.
    expect(result.stopReason.code).toBe("max-iters-reached");
    expect(calls()).toBe(2);
  });
});

describe("runLoop — Test V_43 (Story 4.4: --next-story / --phase-end alone WITHOUT --max-iters do not apply default cap; with explicit --max-iters 1 the cap fires immediately)", () => {
  it("--next-story + --max-iters 1 — explicit cap fires; default-cap not applied", async () => {
    const { stub, calls } = countingStub(successResult());
    // State stays at 3.2 (--next-story predicate would not fire on
    // unchanged story). Story 4.4: when `--next-story` is supplied
    // WITHOUT `--max-iters`, NO default cap is applied — the explicit
    // `--max-iters 1` here wins and bounds the loop to 1 iteration.
    const state = makeStateFixtureFull(3, "3.2");
    const result = await runLoop({
      argv: ["--next-story", "--max-iters", "1"],
      runNextOverride: stub,
      stateOverride: () => state,
      sprintStatusOverride: () => null,
      stderrOverride: () => {},
    });
    expect(result.stopReason.code).toBe("max-iters-reached");
    expect(calls()).toBe(1);
  });

  it("--phase-end + --max-iters 1 — explicit cap fires; default-cap not applied", async () => {
    const { stub, calls } = countingStub(successResult());
    const dag = makeDagFixture();
    const state = makeStateFixtureFull(3, "3.2", "bmad-dev-story");
    const result = await runLoop({
      argv: ["--phase-end", "--max-iters", "1"],
      runNextOverride: stub,
      stateOverride: () => state,
      sprintStatusOverride: () => null,
      stderrOverride: () => {},
      dagOverride: () => dag,
    });
    expect(result.stopReason.code).toBe("max-iters-reached");
    expect(calls()).toBe(1);
  });
});

describe("runLoop AC-3 sweep — all four stop conditions (Story 4.3)", () => {
  it("Sweep-A: --until-epic-end fires when epic done + retro done", async () => {
    const { stub } = countingStub(successResult());
    const state = makeStateFixture(3, "3.10");
    const sprintStatus = makeSprintStatusEpic3Done();
    const result = await runLoop({
      argv: ["--until-epic-end"],
      runNextOverride: stub,
      stateOverride: () => state,
      sprintStatusOverride: () => sprintStatus,
      stderrOverride: () => {},
    });
    expect(result.stopReason.code).toBe("epic-end-reached");
  });

  it("Sweep-B: --until-story 3.2 fires on exact match", async () => {
    const { stub } = countingStub(successResult());
    const state = makeStateFixture(3, "3.2");
    const result = await runLoop({
      argv: ["--until-story", "3.2"],
      runNextOverride: stub,
      stateOverride: () => state,
      sprintStatusOverride: () => null,
      stderrOverride: () => {},
    });
    expect(result.stopReason.code).toBe("until-story-reached");
  });

  it("Sweep-C: --next-story fires on story transition (3.2 → 3.3)", async () => {
    const { stub } = countingStub(successResult());
    const states: ReadonlyArray<State | null> = [
      makeStateFixtureFull(3, "3.2"),
      makeStateFixtureFull(3, "3.2"),
      makeStateFixtureFull(3, "3.3"),
    ];
    const result = await runLoop({
      argv: ["--next-story"],
      runNextOverride: stub,
      stateOverride: sequenceStateStub(states),
      sprintStatusOverride: () => null,
      stderrOverride: () => {},
    });
    expect(result.stopReason.code).toBe("next-story-reached");
  });

  it("Sweep-D: --phase-end fires on planning → implementation transition", async () => {
    const { stub } = countingStub(successResult());
    const dag = makeDagFixture();
    const states: ReadonlyArray<State | null> = [
      makeStateFixtureFull(3, "3.2", "bmad-create-prd"),
      makeStateFixtureFull(3, "3.2", "bmad-create-prd"),
      makeStateFixtureFull(3, "3.2", "bmad-dev-story"),
    ];
    const result = await runLoop({
      argv: ["--phase-end"],
      runNextOverride: stub,
      stateOverride: sequenceStateStub(states),
      sprintStatusOverride: () => null,
      stderrOverride: () => {},
      dagOverride: () => dag,
    });
    expect(result.stopReason.code).toBe("phase-end-reached");
  });
});

// ─── Story 4.4 tests (AC-1 + AC-2 + AC-3) ─────────────────────────────────

describe("runLoop — Test X_44 (Story 4.4 AC-1: default cap fires with max-iters-reached)", () => {
  it("default-cap injection produces stopReason.maxIters === 50 when argv=[]", async () => {
    const { stub } = countingStub(successResult());
    const result = await runLoop({ argv: [], runNextOverride: stub });
    expect(result.stopReason.code).toBe("max-iters-reached");
    if (result.stopReason.code !== "max-iters-reached") return;
    expect(result.stopReason.maxIters).toBe(50);
    expect(result.stopReason.iterCount).toBe(50);
  });
});

describe("runLoop — Test Y_44 (Story 4.4 AC-2: --max-iters 10 exits with maxIters=10/iterCount=10)", () => {
  it("--max-iters 10 exits with stopReason.maxIters === 10 + iterCount === 10", async () => {
    const { stub, calls } = countingStub(successResult());
    const result = await runLoop({
      argv: ["--max-iters", "10"],
      runNextOverride: stub,
    });
    expect(result.iterations.length).toBe(10);
    expect(result.stopReason.code).toBe("max-iters-reached");
    if (result.stopReason.code !== "max-iters-reached") return;
    expect(result.stopReason.maxIters).toBe(10);
    expect(result.stopReason.iterCount).toBe(10);
    expect(calls()).toBe(10);
  });
  // Note: the AR9 emitted message text "max-iters (10) reached" is
  // assembled by `formatExitReason` inside `import.meta.main`. This unit
  // test verifies the structured StopReason fields used by
  // `formatExitReason`; the AR9 line shape is covered by the
  // import.meta.main path (Story 4.1 baseline). Story 4.4 changes only
  // the message format string, not the structured StopReason.
});

describe("runLoop — Test Z_44 (Story 4.4 AC-3: explicit condition does NOT inject default cap)", () => {
  it("--until-epic-end alone fires on epic-end-reached without applying --max-iters=50", async () => {
    const { stub, calls } = countingStub(successResult());
    // Epic-3 is fully done in this fixture → --until-epic-end fires on iter 0.
    const state = makeStateFixture(3, "3.10");
    const sprintStatus = makeSprintStatusEpic3Done();
    const result = await runLoop({
      argv: ["--until-epic-end"],
      runNextOverride: stub,
      stateOverride: () => state,
      sprintStatusOverride: () => sprintStatus,
      stderrOverride: () => {},
    });
    expect(result.stopReason.code).toBe("epic-end-reached");
    // The default-cap was NOT applied; the loop exited via the
    // explicit condition. iter count is 0 because --until-epic-end
    // fires BEFORE the first iteration runs.
    expect(result.iterations.length).toBe(0);
    expect(calls()).toBe(0);
  });

  it("--until-story 3.5 alone fires WITHOUT applying default cap", async () => {
    const { stub, calls } = countingStub(successResult());
    const state = makeStateFixture(3, "3.5");
    const result = await runLoop({
      argv: ["--until-story", "3.5"],
      runNextOverride: stub,
      stateOverride: () => state,
      sprintStatusOverride: () => null,
      stderrOverride: () => {},
    });
    expect(result.stopReason.code).toBe("until-story-reached");
    expect(calls()).toBe(0);
  });

  it("--next-story alone — no default cap; loop bounded by external halt", async () => {
    // Story stays at 3.2 → predicate never fires → loop runs without
    // a default cap. AC-3 verbatim: "no default cap is applied (the
    // explicit condition controls)". To bound the test we use a stub
    // that emits halt-on-error after a few iterations; assert the
    // halt path fires (NOT max-iters-reached, which would require the
    // default cap to have been applied).
    let count = 0;
    const haltStub = async (): Promise<NextResult> => {
      count++;
      if (count >= 3) return haltResult("test bound");
      return successResult();
    };
    const state = makeStateFixtureFull(3, "3.2");
    const result = await runLoop({
      argv: ["--next-story"],
      runNextOverride: haltStub,
      stateOverride: () => state,
      sprintStatusOverride: () => null,
      stderrOverride: () => {},
    });
    expect(result.stopReason.code).toBe("halt-on-error");
  });
});

describe("runLoop AC-3 sweep — default cap behaviour (Story 4.4)", () => {
  it("Sweep-44-A: default cap fires when no stop condition supplied (50 iters)", async () => {
    const { stub, calls } = countingStub(successResult());
    const result = await runLoop({ argv: [], runNextOverride: stub });
    expect(result.stopReason.code).toBe("max-iters-reached");
    if (result.stopReason.code !== "max-iters-reached") return;
    expect(result.stopReason.maxIters).toBe(50);
    expect(calls()).toBe(50);
  });

  it("Sweep-44-B: explicit --max-iters 10 overrides default cap", async () => {
    const { stub, calls } = countingStub(successResult());
    const result = await runLoop({
      argv: ["--max-iters", "10"],
      runNextOverride: stub,
    });
    expect(result.stopReason.code).toBe("max-iters-reached");
    if (result.stopReason.code !== "max-iters-reached") return;
    expect(result.stopReason.maxIters).toBe(10);
    expect(calls()).toBe(10);
  });

  it("Sweep-44-C: explicit --until-epic-end does NOT apply default cap", async () => {
    const { stub } = countingStub(successResult());
    const state = makeStateFixture(3, "3.10");
    const sprintStatus = makeSprintStatusEpic3Done();
    const result = await runLoop({
      argv: ["--until-epic-end"],
      runNextOverride: stub,
      stateOverride: () => state,
      sprintStatusOverride: () => sprintStatus,
      stderrOverride: () => {},
    });
    expect(result.stopReason.code).toBe("epic-end-reached");
  });
});

// ─── Story 4.5 — runLoop integration tests (AC-1 + AC-2) ────────────────

/**
 * Story 4.5 Test fixture: returns a `tokensPerIter`-compatible function
 * that emits the same per-iteration token usage every call.
 */
function tokensStub(perIter: { in: number; out: number }) {
  return () => ({ tokensIn: perIter.in, tokensOut: perIter.out });
}

describe("runLoop — Test TB_45_1 (Story 4.5 AC-1: --time-budget fires at 100%)", () => {
  it("--time-budget 100 halts with time-budget-reached after wall-clock budget elapses", async () => {
    // Use a slow stub that takes ~50ms/iter so the 100ms budget fires.
    const slowStub = async () => {
      await Bun.sleep(50);
      return successResult();
    };
    const result = await runLoop({
      argv: ["--time-budget", "100"],
      runNextOverride: slowStub,
      stateOverride: () => null,
      sprintStatusOverride: () => null,
      stderrOverride: () => {},
    });
    expect(result.stopReason.code).toBe("time-budget-reached");
    expect(result.exitCode).toBe(0);
  });
});

describe("runLoop — Test TB_45_2 (Story 4.5 AC-1: 80%-warning to stderr)", () => {
  it("--time-budget 100 emits a stderr 80%-warning before halt", async () => {
    const stderrLines: string[] = [];
    const slowStub = async () => {
      await Bun.sleep(50);
      return successResult();
    };
    await runLoop({
      argv: ["--time-budget", "100"],
      runNextOverride: slowStub,
      stateOverride: () => null,
      sprintStatusOverride: () => null,
      stderrOverride: (chunk) => stderrLines.push(chunk),
    });
    const warningEmitted = stderrLines.some((l) =>
      l.includes("time-budget at 80%"),
    );
    expect(warningEmitted).toBe(true);
  });
});

describe("runLoop — Test TB_45_3 (Story 4.5 AC-1: exit message format)", () => {
  it("exit message matches /^time-budget \\(\\d+(h|m|s|ms)\\) reached, partial work committed$/", async () => {
    const slowStub = async () => {
      await Bun.sleep(50);
      return successResult();
    };
    const result = await runLoop({
      argv: ["--time-budget", "100"],
      runNextOverride: slowStub,
      stateOverride: () => null,
      sprintStatusOverride: () => null,
      stderrOverride: () => {},
    });
    expect(result.stopReason.code).toBe("time-budget-reached");
    if (result.stopReason.code !== "time-budget-reached") return;
    expect(result.stopReason.message).toMatch(
      /^time-budget \(\d+(h|m|s|ms)\) reached, partial work committed$/,
    );
  });
});

describe("runLoop — Test TB_45_4 (Story 4.5: --time-budget alone does NOT inject default cap)", () => {
  it("--time-budget 100 alone exits via time-budget-reached, NOT max-iters-reached(50)", async () => {
    const slowStub = async () => {
      await Bun.sleep(50);
      return successResult();
    };
    const result = await runLoop({
      argv: ["--time-budget", "100"],
      runNextOverride: slowStub,
      stateOverride: () => null,
      sprintStatusOverride: () => null,
      stderrOverride: () => {},
    });
    expect(result.stopReason.code).toBe("time-budget-reached");
    expect(result.stopReason.code).not.toBe("max-iters-reached");
  });
});

describe("runLoop — Test KB_45_1 (Story 4.5 AC-2: --token-budget fires at 100%)", () => {
  it("--token-budget 100 with tokensPerIter 50/50 halts after exactly 1 iter", async () => {
    const { stub, calls } = countingStub(successResult());
    const result = await runLoop({
      argv: ["--token-budget", "100"],
      runNextOverride: stub,
      tokensPerIter: tokensStub({ in: 50, out: 50 }),
      stateOverride: () => null,
      sprintStatusOverride: () => null,
      stderrOverride: () => {},
    });
    expect(result.stopReason.code).toBe("token-budget-reached");
    expect(result.exitCode).toBe(0);
    // 1 iter: 50+50=100 >= budget 100 → fires on next check
    expect(calls()).toBe(1);
  });
});

describe("runLoop — Test KB_45_2 (Story 4.5 AC-2: 80%-warning to stderr)", () => {
  it("--token-budget 100 emits a stderr 80%-warning before halt", async () => {
    const stderrLines: string[] = [];
    const { stub } = countingStub(successResult());
    await runLoop({
      argv: ["--token-budget", "100"],
      runNextOverride: stub,
      tokensPerIter: tokensStub({ in: 40, out: 40 }),
      stateOverride: () => null,
      sprintStatusOverride: () => null,
      stderrOverride: (chunk) => stderrLines.push(chunk),
    });
    const warningEmitted = stderrLines.some((l) =>
      l.includes("token-budget at 80%"),
    );
    expect(warningEmitted).toBe(true);
  });
});

describe("runLoop — Test KB_45_3 (Story 4.5 AC-2: exit message includes usage stats)", () => {
  it("token-budget exit message matches /^token-budget \\(\\d+\\) reached, used \\d+ tokensIn \\+ \\d+ tokensOut$/", async () => {
    const { stub } = countingStub(successResult());
    const result = await runLoop({
      argv: ["--token-budget", "100"],
      runNextOverride: stub,
      tokensPerIter: tokensStub({ in: 60, out: 60 }),
      stateOverride: () => null,
      sprintStatusOverride: () => null,
      stderrOverride: () => {},
    });
    expect(result.stopReason.code).toBe("token-budget-reached");
    if (result.stopReason.code !== "token-budget-reached") return;
    expect(result.stopReason.message).toMatch(
      /^token-budget \(\d+\) reached, used \d+ tokensIn \+ \d+ tokensOut$/,
    );
  });
});

describe("runLoop — Test KB_45_4 (Story 4.5: --token-budget alone does NOT inject default cap)", () => {
  it("--token-budget 100 alone exits via token-budget-reached, NOT max-iters-reached(50)", async () => {
    const { stub } = countingStub(successResult());
    const result = await runLoop({
      argv: ["--token-budget", "100"],
      runNextOverride: stub,
      tokensPerIter: tokensStub({ in: 100, out: 100 }),
      stateOverride: () => null,
      sprintStatusOverride: () => null,
      stderrOverride: () => {},
    });
    expect(result.stopReason.code).toBe("token-budget-reached");
    expect(result.stopReason.code).not.toBe("max-iters-reached");
  });
});

describe("runLoop — Test KB_45_5 (Story 4.5: production-style flow reads tokens from state.runHistory[])", () => {
  it("production path (no tokensPerIter seam) reads tokens from latest state.runHistory entry", async () => {
    const { stub } = countingStub(successResult());
    // Simulate state with 60 tokensIn + 60 tokensOut in latest runHistory entry.
    const stateWithTokens = {
      schemaVersion: 1 as const,
      project: { name: "bmad-stepper", bmadVersion: "v6.x" },
      lastSuccessfulStep: { story: "4.1", step: "bmad-dev-story", epic: 4 },
      lastAttempted: null,
      lastFailureReason: null,
      lastSnapshot: null,
      checkpoints: [],
      runHistory: [{ tokensIn: 60, tokensOut: 60 }],
    };
    let callCount = 0;
    const stateSeq = () => {
      callCount++;
      return stateWithTokens;
    };
    const result = await runLoop({
      argv: ["--token-budget", "100"],
      runNextOverride: stub,
      // No tokensPerIter — exercises production reading path.
      stateOverride: stateSeq,
      sprintStatusOverride: () => null,
      stderrOverride: () => {},
    });
    expect(result.stopReason.code).toBe("token-budget-reached");
  });
});

describe("runLoop — Test SWEEP_45 (Story 4.5: AC-1 + AC-2 sweep)", () => {
  it("Sweep-45-A: --time-budget fires (uses Bun.sleep)", async () => {
    const slowStub = async () => {
      await Bun.sleep(50);
      return successResult();
    };
    const result = await runLoop({
      argv: ["--time-budget", "100"],
      runNextOverride: slowStub,
      stateOverride: () => null,
      sprintStatusOverride: () => null,
      stderrOverride: () => {},
    });
    expect(result.stopReason.code).toBe("time-budget-reached");
  });

  it("Sweep-45-B: --token-budget fires (uses tokensPerIter)", async () => {
    const { stub } = countingStub(successResult());
    const result = await runLoop({
      argv: ["--token-budget", "200"],
      runNextOverride: stub,
      tokensPerIter: tokensStub({ in: 100, out: 100 }),
      stateOverride: () => null,
      sprintStatusOverride: () => null,
      stderrOverride: () => {},
    });
    expect(result.stopReason.code).toBe("token-budget-reached");
  });
});

// Cleanup any potential mocks across the file boundary.
let originalArgv: string[] | undefined;
beforeEach(() => {
  originalArgv = [...process.argv];
});
afterEach(() => {
  if (originalArgv !== undefined) {
    process.argv = [...originalArgv];
  }
});
