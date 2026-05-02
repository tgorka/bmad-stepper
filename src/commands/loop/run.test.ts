/**
 * src/commands/loop/run.test.ts — colocated unit tests for `runLoop`
 * (Story 4.1 AC-1).
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
 *   - No stop condition (Test E): v0.1 pre-Story-4.4 behaviour.
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

describe("runLoop — Test E (no stop condition supplied)", () => {
  it("argv=[] halts immediately with no-stop-condition reason + exit 0", async () => {
    const { stub, calls } = countingStub(successResult());
    const result = await runLoop({ argv: [], runNextOverride: stub });
    expect(result.iterations.length).toBe(0);
    expect(result.stopReason.code).toBe("no-stop-condition");
    expect(result.exitCode).toBe(0);
    expect(calls()).toBe(0);
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

describe("runLoop — Test N_42 (Story 4.2: hasOtherStopCondition guard)", () => {
  it("--until-epic-end alone does NOT trigger no-stop-condition placeholder", async () => {
    const { stub, calls } = countingStub(successResult());
    // Epic NOT done — predicate does not fire. With --max-iters 2 to
    // bound. Without the hasOtherStopCondition guard the v0.1 placeholder
    // would fire on iter 0 BEFORE any iteration runs.
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
    // The placeholder does NOT fire; the loop ran 2 iterations and hit
    // the --max-iters cap.
    expect(result.stopReason.code).toBe("max-iters-reached");
    expect(calls()).toBe(2);
  });

  it("--until-story 3.5 alone (no --max-iters) does NOT trigger no-stop-condition before any iteration runs", async () => {
    const { stub, calls } = countingStub(successResult());
    // Current story is 3.5 (>= target) so the predicate fires AFTER
    // iter 0's state load. The point of this test is to confirm the
    // hasOtherStopCondition guard suppresses the placeholder.
    const state = makeStateFixture(3, "3.5");
    const result = await runLoop({
      argv: ["--until-story", "3.5"],
      runNextOverride: stub,
      stateOverride: () => state,
      sprintStatusOverride: () => null,
      stderrOverride: () => {},
    });
    expect(result.stopReason.code).toBe("until-story-reached");
    // Predicate fires on the iter-0 boundary check (BEFORE any
    // runNext call) because state.lastSuccessfulStep.story already
    // matches the target.
    expect(calls()).toBe(0);
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
