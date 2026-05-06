/**
 * src/failure-ux/skip.test.ts — Unit tests for the skip policy handler
 * (Story 5.2 — Epic 5 skip mode).
 *
 * Coverage (SK_52_HANDLER_*, SK_52_DISPATCH_*):
 *   - skipHandler returns `{outcome: "skip"}` for any FailureContext.
 *   - Pure-function discipline: same input → same output, no side effects.
 *   - Context-agnostic: independent of attemptNumber / code / message /
 *     hint / runId / step values (the skip decision is invariant).
 *   - dispatchFailureUx with `policy === "skip"` delegates to skipHandler
 *     (NOT to the v0.1 escalate stub — Story 5.2 wires the formal handler).
 *   - TypeScript exhaustiveness: the switch branch covers `"skip"` as a
 *     SEPARATE case, NOT folded into the escalate stub.
 *   - Behaviour-change regression: dispatchFailureUx(ctx, "skip", {}) no
 *     longer returns `{outcome: "escalate"}` (Story 5.1 v0.1 stub
 *     superseded by Story 5.2 formal handler).
 */

import { describe, expect, it } from "bun:test";
import { dispatchFailureUx, type FailureContext } from "./index.ts";
import { skipHandler } from "./skip.ts";

const baseCtx: FailureContext = {
  code: "VERIFIER_FAILURE",
  message: "verifier failed",
  hint: "See the run log.",
  runId: "2026-05-04T20-00-00-bmad-dev-story-skip12",
  step: "bmad-dev-story",
  attemptNumber: 1,
};

describe("skipHandler (Story 5.2 SK_52_HANDLER_*)", () => {
  it("SK_52_HANDLER_1: attemptNumber=1 → returns {outcome: 'skip'}", () => {
    const result = skipHandler({ ...baseCtx, attemptNumber: 1 });
    expect(result.outcome).toBe("skip");
  });

  it("SK_52_HANDLER_2: attemptNumber=5 → returns {outcome: 'skip'} (independent of attemptNumber)", () => {
    const result = skipHandler({ ...baseCtx, attemptNumber: 5 });
    expect(result.outcome).toBe("skip");
  });

  it("SK_52_HANDLER_3: pure-function — same input twice produces same output (no hidden state)", () => {
    const ctx = { ...baseCtx, attemptNumber: 2 };
    const r1 = skipHandler(ctx);
    const r2 = skipHandler(ctx);
    expect(r1).toEqual(r2);
    // Each invocation produces a fresh literal {outcome: "skip"}; the
    // outcomes are structurally equal (the handler does NOT cache or
    // share a sentinel object across calls).
    expect(r1.outcome).toBe("skip");
    expect(r2.outcome).toBe("skip");
  });

  it("SK_52_HANDLER_4: context-agnostic — varying code/message/hint/runId/step all return {outcome: 'skip'}", () => {
    const variants: ReadonlyArray<Partial<FailureContext>> = [
      { code: "TIMEOUT" },
      { message: "totally different message" },
      { hint: "some other hint" },
      { runId: "different-run-id" },
      { step: "bmad-code-review" },
      { code: "BUDGET_EXCEEDED", message: "tokens exceeded", attemptNumber: 9 },
    ];
    for (const variant of variants) {
      const result = skipHandler({ ...baseCtx, ...variant });
      expect(result.outcome).toBe("skip");
    }
  });

  it("SK_52_HANDLER_5: explicit empty opts is accepted (default param works)", () => {
    // The signature accepts an optional `opts: SkipHandlerOpts = {}`;
    // verify both call shapes (with and without opts) produce identical
    // outcomes.
    const ctx = { ...baseCtx };
    const withoutOpts = skipHandler(ctx);
    const withEmptyOpts = skipHandler(ctx, {});
    expect(withoutOpts).toEqual(withEmptyOpts);
  });
});

describe("dispatchFailureUx with policy='skip' (Story 5.2 SK_52_DISPATCH_*)", () => {
  it("SK_52_DISPATCH_1: dispatchFailureUx(ctx, 'skip', {}) delegates to skipHandler returning {outcome: 'skip'}", () => {
    const result = dispatchFailureUx(baseCtx, "skip", {});
    expect(result.outcome).toBe("skip");
  });

  it("SK_52_DISPATCH_2: TypeScript exhaustiveness — switch branch covers 'skip' as a separate case", () => {
    // The switch statement covers "skip" as its own case; if the case
    // were folded into the escalate stub, the result.outcome would be
    // "escalate" (the Story 5.1 v0.1 behaviour). The Story 5.2 formal
    // wiring asserts the SEPARATE branch is exercised.
    const result = dispatchFailureUx(baseCtx, "skip", {});
    expect(result.outcome).toBe("skip");
    expect(result.outcome).not.toBe("escalate");
  });

  it("SK_52_DISPATCH_3: dispatchFailureUx(ctx, 'skip', {}) produces NO escalate outcome (Story 5.1 v0.1 stub regression)", () => {
    // Regression check against Story 5.1 RT_51_DISPATCH_3 baseline:
    // Story 5.1 ASSERTED dispatchFailureUx(ctx, "skip", {}) →
    // {outcome: "escalate", reason: ctx}; Story 5.2 SUPERSEDES that
    // assertion — the formal handler now returns {outcome: "skip"}.
    const result = dispatchFailureUx(baseCtx, "skip", {});
    if (result.outcome === "escalate") {
      // Should never enter this branch under Story 5.2 wiring.
      throw new Error(
        "regression: dispatchFailureUx(ctx, 'skip', {}) returned 'escalate' (Story 5.1 v0.1 stub still active)",
      );
    }
    expect(result.outcome).toBe("skip");
  });

  it("SK_52_DISPATCH_4: dispatchFailureUx(ctx, 'skip', { maxRetries: 5 }) IGNORES maxRetries (skip is not a retry policy)", () => {
    // The skip handler is independent of the maxRetries option; the
    // option is still accepted by dispatchFailureUx's union signature
    // but the skip branch does not consume it.
    const result = dispatchFailureUx(baseCtx, "skip", { maxRetries: 5 });
    expect(result.outcome).toBe("skip");
  });

  it("SK_52_DISPATCH_5: dispatchFailureUx(ctx, 'skip') (no opts) delegates to skipHandler", () => {
    // The opts argument is optional on dispatchFailureUx; verify the
    // skip branch tolerates the no-opts call shape.
    const result = dispatchFailureUx(baseCtx, "skip");
    expect(result.outcome).toBe("skip");
  });
});
