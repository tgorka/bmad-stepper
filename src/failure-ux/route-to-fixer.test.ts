/**
 * src/failure-ux/route-to-fixer.test.ts — Unit tests for the
 * route-to-fixer policy handler (Story 5.3 — Epic 5 route-to-fixer mode).
 *
 * Coverage:
 *   - routeToFixerHandler (RTF_53_HANDLER_*): pure-function returns
 *     `{outcome: "route-to-fixer", fixerRunId: <runId>-fix}` for any
 *     failure context; only `runId` participates in the outcome
 *     derivation (handler invariant).
 *   - dispatchFailureUx (RTF_53_DISPATCH_*): delegation to
 *     routeToFixerHandler for `policy === "route-to-fixer"`; verifies
 *     the v0.1 stub regression (Story 5.2 → Story 5.3 behaviour change).
 *
 * Pure-function tests; no IO, no fixtures needed.
 */

import { describe, expect, it } from "bun:test";
import {
  dispatchFailureUx,
  type FailureContext,
  type FailurePolicy,
} from "./index.ts";
import {
  type RouteToFixerHandlerOpts,
  routeToFixerHandler,
} from "./route-to-fixer.ts";

const baseCtx: FailureContext = {
  code: "VERIFIER_FAILURE",
  message: "verifier failed",
  hint: "See the run log.",
  runId: "2026-05-04T22-56-12-bmad-dev-story-abc12",
  step: "bmad-dev-story",
  attemptNumber: 1,
};

describe("routeToFixerHandler (Story 5.3 RTF_53_HANDLER_*)", () => {
  it("RTF_53_HANDLER_1: returns {outcome: 'route-to-fixer', fixerRunId: 'abc-fix'} for runId='abc'", () => {
    const result = routeToFixerHandler({ ...baseCtx, runId: "abc" });
    expect(result.outcome).toBe("route-to-fixer");
    if (result.outcome === "route-to-fixer") {
      expect(result.fixerRunId).toBe("abc-fix");
    }
  });

  it("RTF_53_HANDLER_2: returns fixerRunId with '-fix' suffix for canonical run-id timestamp shape", () => {
    const longRunId = "2026-05-04T22-56-12-bmad-dev-story-xyz99";
    const result = routeToFixerHandler({ ...baseCtx, runId: longRunId });
    expect(result.outcome).toBe("route-to-fixer");
    if (result.outcome === "route-to-fixer") {
      expect(result.fixerRunId).toBe(`${longRunId}-fix`);
      expect(result.fixerRunId.endsWith("-fix")).toBe(true);
    }
  });

  it("RTF_53_HANDLER_3: pure-function check — calling twice with same input produces same output", () => {
    const ctx = { ...baseCtx, runId: "deterministic-run-id" };
    const r1 = routeToFixerHandler(ctx);
    const r2 = routeToFixerHandler(ctx);
    expect(r1).toEqual(r2);
    expect(r1.outcome).toBe("route-to-fixer");
    if (r1.outcome === "route-to-fixer" && r2.outcome === "route-to-fixer") {
      expect(r1.fixerRunId).toBe(r2.fixerRunId);
    }
  });

  it("RTF_53_HANDLER_4: handler invariant — different code/message/hint/step/attemptNumber values all return outcome=route-to-fixer", () => {
    const variants: FailureContext[] = [
      { ...baseCtx, code: "TIMEOUT" },
      { ...baseCtx, message: "different message" },
      { ...baseCtx, hint: "Run /bmad-next --doctor." },
      { ...baseCtx, step: "bmad-create-prd" },
      { ...baseCtx, attemptNumber: 5 },
    ];
    for (const v of variants) {
      const result = routeToFixerHandler(v);
      expect(result.outcome).toBe("route-to-fixer");
      if (result.outcome === "route-to-fixer") {
        // Only runId participates in the fixerRunId derivation; the
        // other fields are forwarded to the caller via the original
        // context (handler is invariant in those fields).
        expect(result.fixerRunId).toBe(`${v.runId}-fix`);
      }
    }
  });

  it("RTF_53_HANDLER_5: empty RouteToFixerHandlerOpts accepted (forward-extensible per OQ-3)", () => {
    // The opts parameter defaults to {} per the function signature;
    // explicit empty opts also accepted.
    const result1 = routeToFixerHandler(baseCtx);
    const result2 = routeToFixerHandler(baseCtx, {});
    const opts: RouteToFixerHandlerOpts = {};
    const result3 = routeToFixerHandler(baseCtx, opts);
    expect(result1.outcome).toBe("route-to-fixer");
    expect(result2.outcome).toBe("route-to-fixer");
    expect(result3.outcome).toBe("route-to-fixer");
    if (
      result1.outcome === "route-to-fixer" &&
      result2.outcome === "route-to-fixer" &&
      result3.outcome === "route-to-fixer"
    ) {
      expect(result1.fixerRunId).toBe(result2.fixerRunId);
      expect(result2.fixerRunId).toBe(result3.fixerRunId);
    }
  });
});

describe("dispatchFailureUx (Story 5.3 RTF_53_DISPATCH_*)", () => {
  it("RTF_53_DISPATCH_1: dispatchFailureUx(ctx, 'route-to-fixer', {}) delegates to routeToFixerHandler", () => {
    const result = dispatchFailureUx(baseCtx, "route-to-fixer", {});
    const direct = routeToFixerHandler(baseCtx);
    expect(result).toEqual(direct);
    expect(result.outcome).toBe("route-to-fixer");
    if (result.outcome === "route-to-fixer") {
      expect(result.fixerRunId).toBe(`${baseCtx.runId}-fix`);
    }
  });

  it("RTF_53_DISPATCH_2: TypeScript exhaustiveness — switch covers 'route-to-fixer' as separate case", () => {
    // All four FailurePolicy values produce a defined outcome with the
    // expected discriminant — verifies the switch branch covers
    // "route-to-fixer" as a SEPARATE case (not folded into the escalate
    // stub like Story 5.1 v0.1 wired it).
    const allPolicies: FailurePolicy[] = [
      "retry",
      "skip",
      "route-to-fixer",
      "escalate",
    ];
    for (const p of allPolicies) {
      const result = dispatchFailureUx(baseCtx, p, { maxRetries: 2 });
      expect(result.outcome).toBeDefined();
    }
    // Spot-check that route-to-fixer specifically returns the
    // route-to-fixer outcome (NOT escalate).
    const rtfResult = dispatchFailureUx(baseCtx, "route-to-fixer", {});
    expect(rtfResult.outcome).toBe("route-to-fixer");
  });

  it("RTF_53_DISPATCH_3: dispatchFailureUx(ctx, 'route-to-fixer', {}) produces NO escalate outcome (Story 5.2 → Story 5.3 regression)", () => {
    // Story 5.2's v0.1 stub asserted dispatchFailureUx(ctx,
    // "route-to-fixer", {}) → {outcome: "escalate", reason: ctx}. Story
    // 5.3 wires the formal handler; the dispatcher now returns
    // {outcome: "route-to-fixer", fixerRunId: <runId>-fix} for the
    // "route-to-fixer" policy.
    const result = dispatchFailureUx(baseCtx, "route-to-fixer", {});
    expect(result.outcome).not.toBe("escalate");
    expect(result.outcome).toBe("route-to-fixer");
    if (result.outcome === "route-to-fixer") {
      expect(result.fixerRunId).toBe(`${baseCtx.runId}-fix`);
    }
  });
});
