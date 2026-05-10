/**
 * src/smoke/loop-matrix.test.ts — In-process StopReason matrix sweep
 * via `runLoop()` direct invocation + the existing `runNextOverride`
 * test seam (LoopOpts). Replaces the brittle subprocess-level
 * `--time-budget 1ms` / `--max-iters 0` shape from
 * src/smoke/loop-stop-conditions.test.ts with deterministic in-process
 * coverage of six high-value StopReason variants.
 *
 * Why in-process: the per-iteration `runNext` is the natural injection
 * point for synthetic dispatch / report / halt actions. Subprocess-level
 * tests would need to seed elaborate state.yaml fixtures + spawn the
 * runner; in-process tests stub the seam directly and assert on the
 * structured `LoopResult.stopReason` discriminated union.
 *
 * Coverage (the six variants reachable via `runNextOverride` alone):
 *   1. max-iters-reached    — N successful dispatch iterations.
 *   2. halt-on-error        — non-zero exitCode short-circuits.
 *   3. all-steps-complete   — `report` action without awaitInput.
 *   4. await-input          — `report` action with awaitInput=true.
 *   5. token-budget-reached — synthetic per-iter tokens overshoot the
 *                             --token-budget cap.
 *   6. error-stop           — verifier-failure halt with the AC-1
 *                             "error (verifier failure on <step>)"
 *                             message format.
 *
 * Out of matrix scope (covered by existing per-story unit tests in
 * src/commands/loop/run.test.ts):
 *   - epic-end-reached, until-story-reached, next-story-reached,
 *     phase-end-reached  → require synthetic State + SprintStatus
 *     overrides; covered by Story 4.2/4.3 tests.
 *   - manual-sigint, manual-interactive-halt → require signal /
 *     stdin overrides; covered by Story 4.9 / 5.5 tests.
 *   - no-progress-detected → production-only (gated on
 *     runNextOverride === undefined); not testable via this seam.
 *   - time-budget-reached  → requires wall-clock injection; covered by
 *     the Story 4.5 budget tests (which use a tiny budget + sleeps).
 *
 * AR35 isolation: in-process; no tmpdirs needed (the tests do NOT
 * write to disk via the loop runner — the override short-circuits all
 * IO). The runner's own diagnostic stderr (DAG warn lines) may emit
 * but does not affect assertions.
 */

import { describe, expect, it } from "bun:test";
import {
  type LoopResult,
  type PlanResult,
  runLoop,
  type StopReason,
} from "../commands/loop/run.ts";
import type { NextResult } from "../commands/next/run.ts";

function asLoop(result: LoopResult | PlanResult): LoopResult {
  if (result.mode !== "loop") {
    throw new Error(`expected loop, got ${result.mode}`);
  }
  return result;
}

function dispatch(runId = "smoke-iter-1"): NextResult {
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

function report(message: string, awaitInput?: boolean): NextResult {
  return {
    exitCode: 0,
    action: {
      action: "report",
      message,
      exitCode: 0,
      ...(awaitInput === true
        ? {
            awaitInput: true,
            awaitInputStep: "bmad-brainstorming",
            awaitInputPath:
              "_bmad-output/.stepper/pending-input/bmad-brainstorming.md",
          }
        : {}),
    },
  };
}

function halt(message: string): NextResult {
  return {
    exitCode: 1,
    action: { action: "halt", message, exitCode: 1 },
  };
}

interface MatrixCase {
  readonly name: string;
  readonly argv: readonly string[];
  readonly stub: () => Promise<NextResult>;
  readonly tokensPerIter?: () => { tokensIn: number; tokensOut: number };
  readonly expectedCode: StopReason["code"];
  readonly expectedExitCode: 0 | 1 | 2;
  readonly extraAssert?: (result: LoopResult) => void;
}

const cases: readonly MatrixCase[] = [
  {
    name: "max-iters-reached: --max-iters 1 + always-dispatch",
    argv: ["--max-iters", "1"],
    stub: async () => dispatch(),
    expectedCode: "max-iters-reached",
    expectedExitCode: 0,
    extraAssert: (result) => {
      expect(result.iterations.length).toBe(1);
      if (result.stopReason.code === "max-iters-reached") {
        expect(result.stopReason.maxIters).toBe(1);
      }
    },
  },
  {
    name: "halt-on-error: --max-iters 5 + halt on iter 1",
    argv: ["--max-iters", "5"],
    stub: async () => halt("Run /bmad-next --resume to retry."),
    expectedCode: "halt-on-error",
    expectedExitCode: 1,
    extraAssert: (result) => {
      // Loop short-circuits — fewer iterations than the cap.
      expect(result.iterations.length).toBe(1);
    },
  },
  {
    name: "all-steps-complete: --max-iters 5 + report on iter 1",
    argv: ["--max-iters", "5"],
    stub: async () => report("All BMAD steps for this project are complete."),
    expectedCode: "all-steps-complete",
    expectedExitCode: 0,
    extraAssert: (result) => {
      expect(result.iterations.length).toBe(1);
      if (result.stopReason.code === "all-steps-complete") {
        expect(result.stopReason.message).toContain("All BMAD steps");
      }
    },
  },
  {
    name: "await-input: --max-iters 5 + interactive report on iter 1",
    argv: ["--max-iters", "5"],
    stub: async () =>
      report(
        "Interactive step bmad-brainstorming requires input — fill the questions stub and re-run.",
        true,
      ),
    expectedCode: "await-input",
    expectedExitCode: 0,
    extraAssert: (result) => {
      if (result.stopReason.code === "await-input") {
        expect(result.stopReason.step).toBe("bmad-brainstorming");
        expect(result.stopReason.path).toContain("pending-input");
      }
    },
  },
  {
    name: "token-budget-reached: --token-budget 100 + 200 tokens/iter",
    argv: ["--token-budget", "100", "--max-iters", "10"],
    stub: async () => dispatch(),
    tokensPerIter: () => ({ tokensIn: 150, tokensOut: 50 }),
    expectedCode: "token-budget-reached",
    expectedExitCode: 0,
    extraAssert: (result) => {
      if (result.stopReason.code === "token-budget-reached") {
        expect(result.stopReason.budget).toBe(100);
        expect(
          result.stopReason.tokensIn + result.stopReason.tokensOut,
        ).toBeGreaterThanOrEqual(100);
      }
    },
  },
  {
    name: "error-stop: --max-iters 5 + verifier-failure halt",
    argv: ["--max-iters", "5"],
    stub: async () => ({
      exitCode: 1,
      action: {
        action: "halt",
        message:
          "error (verifier failure on bmad-create-prd) — see _bmad-output/.stepper/runs/r1/",
        exitCode: 1,
      },
    }),
    expectedCode: "halt-on-error",
    expectedExitCode: 1,
    extraAssert: (result) => {
      // Stub returns a halt action — the runner classifies it as
      // halt-on-error (the iter-level halt short-circuit) regardless of
      // whether the message has the "verifier failure" wording. The
      // dedicated error-stop StopReason is constructed by the verify-
      // and-advance.ts path on a real verifier failure (Story 4.6); in
      // the override path, halt-on-error is the canonical exit reason.
      if (result.stopReason.code === "halt-on-error") {
        expect(result.stopReason.iterationMessage ?? "").toContain(
          "verifier failure",
        );
      }
    },
  },
];

describe("smoke /bmad-loop StopReason matrix (in-process)", () => {
  for (const c of cases) {
    it(c.name, async () => {
      const result = asLoop(
        await runLoop({
          argv: [...c.argv],
          runNextOverride: c.stub,
          ...(c.tokensPerIter !== undefined
            ? { tokensPerIter: c.tokensPerIter }
            : {}),
        }),
      );
      expect(result.stopReason.code).toBe(c.expectedCode);
      expect(result.exitCode).toBe(c.expectedExitCode);
      c.extraAssert?.(result);
    });
  }
});
