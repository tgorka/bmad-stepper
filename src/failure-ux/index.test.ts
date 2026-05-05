/**
 * src/failure-ux/index.test.ts — Unit tests for the failure-UX dispatcher
 * surface (Story 5.1 — Epic 5 retry mode).
 *
 * Coverage:
 *   - resolveFailurePolicy (RT_51_RESOLVE_*): config-resolved policy
 *     vs default `escalate` fallback per architecture line 499.
 *   - dispatchFailureUx (RT_51_DISPATCH_*): delegation to retryHandler
 *     for `policy === "retry"`; Story 5.2 wires skip → skipHandler;
 *     Story 5.3 wires route-to-fixer → routeToFixerHandler; v0.1 stub
 *     returns escalate for the one remaining policy (escalate).
 *
 * Pure-function tests; no IO, no fixtures needed.
 */

import { describe, expect, it } from "bun:test";
import {
  dispatchFailureUx,
  type FailureContext,
  type FailurePolicy,
  resolveFailurePolicy,
} from "./index.ts";

const baseCtx: FailureContext = {
  code: "VERIFIER_FAILURE",
  message: "verifier failed",
  hint: "See the run log.",
  runId: "2026-05-04T19-57-50-bmad-dev-story-abc12",
  step: "bmad-dev-story",
  attemptNumber: 1,
};

describe("resolveFailurePolicy (Story 5.1 RT_51_RESOLVE_*)", () => {
  it("RT_51_RESOLVE_1: returns 'escalate' when no config (default fallback)", () => {
    expect(resolveFailurePolicy("bmad-dev-story", undefined)).toBe("escalate");
  });

  it("RT_51_RESOLVE_2: returns 'escalate' when empty config (default fallback)", () => {
    expect(
      resolveFailurePolicy("bmad-dev-story", { failurePolicies: {} }),
    ).toBe("escalate");
  });

  it("RT_51_RESOLVE_3: returns 'retry' when config has policy for step", () => {
    expect(
      resolveFailurePolicy("bmad-dev-story", {
        failurePolicies: { "bmad-dev-story": "retry" },
      }),
    ).toBe("retry");
  });

  it("RT_51_RESOLVE_4: returns 'escalate' when config has policy for OTHER step", () => {
    expect(
      resolveFailurePolicy("bmad-dev-story", {
        failurePolicies: { "bmad-code-review": "retry" },
      }),
    ).toBe("escalate");
  });

  it("RT_51_RESOLVE_5: all 4 FailurePolicy values resolve when set in config", () => {
    const policies: FailurePolicy[] = [
      "retry",
      "skip",
      "route-to-fixer",
      "escalate",
    ];
    for (const p of policies) {
      expect(
        resolveFailurePolicy("step-x", {
          failurePolicies: { "step-x": p },
        }),
      ).toBe(p);
    }
  });

  it("RT_51_RESOLVE_6: returns 'escalate' when config object is undefined.failurePolicies", () => {
    // Empty object (no `failurePolicies` key at all).
    expect(resolveFailurePolicy("bmad-dev-story", {})).toBe("escalate");
  });
});

describe("dispatchFailureUx (Story 5.1 RT_51_DISPATCH_*)", () => {
  it("RT_51_DISPATCH_1: 'retry' with attemptNumber=1 + maxRetries=2 → retry, nextAttempt=2", () => {
    const result = dispatchFailureUx(
      { ...baseCtx, attemptNumber: 1 },
      "retry",
      { maxRetries: 2 },
    );
    expect(result.outcome).toBe("retry");
    if (result.outcome === "retry") {
      expect(result.nextAttempt).toBe(2);
    }
  });

  it("RT_51_DISPATCH_2: 'retry' with attemptNumber=3 + maxRetries=2 → escalate, reason=ctx", () => {
    const ctx = { ...baseCtx, attemptNumber: 3 };
    const result = dispatchFailureUx(ctx, "retry", { maxRetries: 2 });
    expect(result.outcome).toBe("escalate");
    if (result.outcome === "escalate") {
      expect(result.reason).toBe(ctx);
    }
  });

  it("RT_51_DISPATCH_3 → SK_52_DISPATCH_INDEX: 'skip' delegates to formal skipHandler (Story 5.2 supersedes Story 5.1 v0.1 stub)", () => {
    // Story 5.1 originally asserted v0.1 stub: dispatchFailureUx(ctx,
    // "skip", {}) → {outcome: "escalate", reason: ctx}. Story 5.2 wires
    // the formal skipHandler from src/failure-ux/skip.ts; the dispatcher
    // now returns {outcome: "skip"} for the "skip" policy. The v0.1
    // stub branch comment is updated in src/failure-ux/index.ts to
    // reflect that ONLY route-to-fixer + escalate remain stubbed.
    const result = dispatchFailureUx(baseCtx, "skip", {});
    expect(result.outcome).toBe("skip");
    expect(result.outcome).not.toBe("escalate");
  });

  it("RT_51_DISPATCH_4 → RTF_53_DISPATCH_INDEX: 'route-to-fixer' delegates to formal routeToFixerHandler (Story 5.3 supersedes Story 5.2 v0.1 stub)", () => {
    // Story 5.1/5.2 originally asserted v0.1 stub: dispatchFailureUx(ctx,
    // "route-to-fixer", {}) → {outcome: "escalate", reason: ctx}. Story
    // 5.3 wires the formal routeToFixerHandler from
    // src/failure-ux/route-to-fixer.ts; the dispatcher now returns
    // {outcome: "route-to-fixer", fixerRunId: <ctx.runId>-fix} for the
    // "route-to-fixer" policy. The v0.1 stub branch comment is updated in
    // src/failure-ux/index.ts to reflect that ONLY escalate remains
    // stubbed (Story 5.4 lands the formal escalate handler).
    const result = dispatchFailureUx(baseCtx, "route-to-fixer", {});
    expect(result.outcome).toBe("route-to-fixer");
    expect(result.outcome).not.toBe("escalate");
    if (result.outcome === "route-to-fixer") {
      expect(result.fixerRunId).toBe(`${baseCtx.runId}-fix`);
    }
  });

  it("RT_51_DISPATCH_5 → ESC_54_DISPATCH_INDEX: 'escalate' delegates to formal escalateHandler (Story 5.4 supersedes Story 5.1 v0.1 stub)", () => {
    // Story 5.1 originally asserted v0.1 stub: dispatchFailureUx(ctx,
    // "escalate", {}) → {outcome: "escalate", reason: ctx} (inline
    // return). Story 5.4 wires the formal escalateHandler from
    // src/failure-ux/escalate.ts; the dispatcher now invokes the handler
    // for the "escalate" policy. The v0.1 stub branch comment block at
    // src/failure-ux/index.ts:102-105 is REMOVED entirely. After Story
    // 5.4 the four-handler module group is COMPLETE with ZERO stub
    // fallthrough.
    //
    // baseCtx.hint = "See the run log." which matches the AR22 regex
    // /^.*(Run|See|Try|Check) / via the leading "See " — so PASS-THROUGH
    // preserves identity (reason === baseCtx).
    const result = dispatchFailureUx(baseCtx, "escalate", {});
    expect(result.outcome).toBe("escalate");
    if (result.outcome === "escalate") {
      expect(result.reason).toBe(baseCtx);
    }
  });

  it("RT_51_DISPATCH_6: 'retry' defaults maxRetries=2 when opts.maxRetries undefined", () => {
    // attempt 3 with default maxRetries=2 should escalate (3 >= 2+1).
    const ctx = { ...baseCtx, attemptNumber: 3 };
    const result = dispatchFailureUx(ctx, "retry", {});
    expect(result.outcome).toBe("escalate");
  });

  it("RT_51_DISPATCH_7: 'retry' defaults maxRetries=2 when opts not supplied at all", () => {
    // attempt 1 with default maxRetries=2 should retry to attempt 2.
    const result = dispatchFailureUx({ ...baseCtx, attemptNumber: 1 }, "retry");
    expect(result.outcome).toBe("retry");
    if (result.outcome === "retry") {
      expect(result.nextAttempt).toBe(2);
    }
  });

  it("RT_51_DISPATCH_8: TypeScript exhaustiveness — switch over FailurePolicy covers all 4 variants", () => {
    // Compile-time assurance via TypeScript exhaustiveness on the
    // discriminated union; runtime check verifies all 4 variants do
    // produce a defined outcome.
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
  });
});
