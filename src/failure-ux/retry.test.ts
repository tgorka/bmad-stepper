/**
 * src/failure-ux/retry.test.ts — Unit tests for the retry policy handler
 * (Story 5.1 — Epic 5 retry mode).
 *
 * Coverage (RT_51_HANDLER_*, RT_51_BOUNDARY_*):
 *   - Retry-vs-escalate transitions across the maxRetries cap.
 *   - Boundary tests at attemptNumber == maxRetries+1 (escalate).
 *   - Zero-retry config (maxRetries: 0) — only the original attempt.
 *   - High-cap config (maxRetries: 5) — boundary verification.
 *   - Pure-function discipline: same input → same output, no side effects.
 *   - Object-identity preservation: result.reason === context on escalate.
 */

import { describe, expect, it } from "bun:test";
import type { FailureContext } from "./index.ts";
import { retryHandler } from "./retry.ts";

const baseCtx: FailureContext = {
  code: "VERIFIER_FAILURE",
  message: "verifier failed",
  hint: "See the run log.",
  runId: "2026-05-04T19-57-50-bmad-dev-story-abc12",
  step: "bmad-dev-story",
  attemptNumber: 1,
};

describe("retryHandler (Story 5.1 RT_51_HANDLER_*)", () => {
  it("RT_51_HANDLER_1: attemptNumber=1, maxRetries=2 → retry, nextAttempt=2", () => {
    const result = retryHandler(
      { ...baseCtx, attemptNumber: 1 },
      {
        maxRetries: 2,
      },
    );
    expect(result.outcome).toBe("retry");
    if (result.outcome === "retry") {
      expect(result.nextAttempt).toBe(2);
    }
  });

  it("RT_51_HANDLER_2: attemptNumber=2, maxRetries=2 → retry, nextAttempt=3", () => {
    const result = retryHandler(
      { ...baseCtx, attemptNumber: 2 },
      {
        maxRetries: 2,
      },
    );
    expect(result.outcome).toBe("retry");
    if (result.outcome === "retry") {
      expect(result.nextAttempt).toBe(3);
    }
  });

  it("RT_51_HANDLER_3: attemptNumber=3, maxRetries=2 → escalate, reason=ctx", () => {
    const ctx = { ...baseCtx, attemptNumber: 3 };
    const result = retryHandler(ctx, { maxRetries: 2 });
    expect(result.outcome).toBe("escalate");
    if (result.outcome === "escalate") {
      expect(result.reason).toBe(ctx);
    }
  });

  it("RT_51_HANDLER_4: attemptNumber=4, maxRetries=2 → escalate (boundary above cap)", () => {
    const ctx = { ...baseCtx, attemptNumber: 4 };
    const result = retryHandler(ctx, { maxRetries: 2 });
    expect(result.outcome).toBe("escalate");
    if (result.outcome === "escalate") {
      expect(result.reason).toBe(ctx);
    }
  });

  it("RT_51_HANDLER_5: attemptNumber=1, maxRetries=0 → escalate (zero-retry config = original only)", () => {
    const ctx = { ...baseCtx, attemptNumber: 1 };
    const result = retryHandler(ctx, { maxRetries: 0 });
    expect(result.outcome).toBe("escalate");
    if (result.outcome === "escalate") {
      expect(result.reason).toBe(ctx);
    }
  });

  it("RT_51_HANDLER_6: attemptNumber=1, maxRetries=5 → retry, nextAttempt=2 (high cap)", () => {
    const result = retryHandler(
      { ...baseCtx, attemptNumber: 1 },
      {
        maxRetries: 5,
      },
    );
    expect(result.outcome).toBe("retry");
    if (result.outcome === "retry") {
      expect(result.nextAttempt).toBe(2);
    }
  });

  it("RT_51_HANDLER_7: attemptNumber=6, maxRetries=5 → escalate (boundary at cap)", () => {
    const ctx = { ...baseCtx, attemptNumber: 6 };
    const result = retryHandler(ctx, { maxRetries: 5 });
    expect(result.outcome).toBe("escalate");
    if (result.outcome === "escalate") {
      expect(result.reason).toBe(ctx);
    }
  });

  it("RT_51_HANDLER_8: pure-function — same input twice produces same output", () => {
    const ctx = { ...baseCtx, attemptNumber: 2 };
    const r1 = retryHandler(ctx, { maxRetries: 2 });
    const r2 = retryHandler(ctx, { maxRetries: 2 });
    expect(r1).toEqual(r2);
  });
});

describe("retryHandler — boundary walk (Story 5.1 RT_51_BOUNDARY_*)", () => {
  it("RT_51_BOUNDARY_1: worked example walk — 3 calls (attemptNumber=1,2,3) → retry,retry,escalate", () => {
    // Simulate the worked example from the AC spec line 1066: with
    // failurePolicies: { dev-story: retry } in config + maxRetries: 2,
    // dev-story verifier fails attempt 1 → retry to attempt 2; fails
    // attempt 2 → retry to attempt 3; fails attempt 3 → escalate.
    const ctx1 = { ...baseCtx, attemptNumber: 1 };
    const r1 = retryHandler(ctx1, { maxRetries: 2 });
    expect(r1.outcome).toBe("retry");
    if (r1.outcome === "retry") expect(r1.nextAttempt).toBe(2);

    const ctx2 = { ...baseCtx, attemptNumber: 2 };
    const r2 = retryHandler(ctx2, { maxRetries: 2 });
    expect(r2.outcome).toBe("retry");
    if (r2.outcome === "retry") expect(r2.nextAttempt).toBe(3);

    const ctx3 = { ...baseCtx, attemptNumber: 3 };
    const r3 = retryHandler(ctx3, { maxRetries: 2 });
    expect(r3.outcome).toBe("escalate");
    if (r3.outcome === "escalate") expect(r3.reason).toBe(ctx3);
  });

  it("RT_51_BOUNDARY_2: object identity preserved — result.reason === input context", () => {
    const ctx = { ...baseCtx, attemptNumber: 5 };
    const result = retryHandler(ctx, { maxRetries: 2 });
    expect(result.outcome).toBe("escalate");
    if (result.outcome === "escalate") {
      // Object identity (NOT just structural equality) verifies the
      // pure-function discipline — the handler does not clone or mutate.
      expect(result.reason).toBe(ctx);
    }
  });
});
