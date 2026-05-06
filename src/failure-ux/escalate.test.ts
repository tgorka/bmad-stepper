/**
 * src/failure-ux/escalate.test.ts — Unit tests for the formal escalate
 * policy handler (Story 5.4 — Epic 5 escalate failure mode).
 *
 * Coverage:
 *   - ESC_54_HANDLER_*       — pure-function check (immutability, determinism, default opts).
 *   - ESC_54_HANDLER_REGEX_* — PASS-THROUGH for regex-matching hints.
 *   - ESC_54_HANDLER_SHAPE_* — SHAPE default for non-matching hints.
 *   - ESC_54_DISPATCH_*      — dispatchFailureUx delegation to escalateHandler.
 *
 * Pure-function tests; no IO, no fixtures needed.
 */

import { describe, expect, it } from "bun:test";
import { ACTIONABLE_HINT_REGEX, escalateHandler } from "./escalate.ts";
import {
  dispatchFailureUx,
  type FailureContext,
  type FailurePolicy,
} from "./index.ts";

const baseCtx: FailureContext = {
  code: "VERIFIER_FAILURE",
  message: "verifier failed",
  hint: "Run /bmad-next --resume to retry.",
  runId: "2026-05-05T01-40-46-bmad-next-abc12",
  step: "bmad-dev-story",
  attemptNumber: 1,
};

describe("escalateHandler — Story 5.4 pure-function checks (ESC_54_HANDLER_*)", () => {
  it("ESC_54_HANDLER_1: pure-function — same input → same output", () => {
    const out1 = escalateHandler(baseCtx, {});
    const out2 = escalateHandler(baseCtx, {});
    expect(out1).toEqual(out2);
  });

  it("ESC_54_HANDLER_2: accepts undefined opts param (default = {})", () => {
    const out = escalateHandler(baseCtx);
    expect(out.outcome).toBe("escalate");
  });

  it("ESC_54_HANDLER_3: returns FailureUxOutcome shape {outcome: 'escalate', reason: <ctx>}", () => {
    const out = escalateHandler(baseCtx, {});
    expect(out.outcome).toBe("escalate");
    if (out.outcome === "escalate") {
      expect(out.reason).toBeDefined();
      expect(out.reason.code).toBe("VERIFIER_FAILURE");
      expect(out.reason.runId).toBe(baseCtx.runId);
    }
  });

  it("ESC_54_HANDLER_4: does NOT mutate the input context (immutability)", () => {
    const ctx: FailureContext = { ...baseCtx, hint: "raw failure" };
    const before = { ...ctx };
    escalateHandler(ctx, {});
    expect(ctx).toEqual(before);
  });

  it("ESC_54_HANDLER_5: deterministic — calling twice with same input → identical output", () => {
    const out1 = escalateHandler(baseCtx, {});
    const out2 = escalateHandler(baseCtx, {});
    expect(out1).toEqual(out2);
    if (out1.outcome === "escalate" && out2.outcome === "escalate") {
      expect(out1.reason.hint).toBe(out2.reason.hint);
    }
  });
});

describe("escalateHandler — Story 5.4 PASS-THROUGH for regex-matching hints (ESC_54_HANDLER_REGEX_*)", () => {
  it("ESC_54_HANDLER_REGEX_1: 'Run /bmad-next --resume' matches → PASS-THROUGH", () => {
    const ctx: FailureContext = {
      ...baseCtx,
      hint: "Run /bmad-next --resume to retry.",
    };
    const out = escalateHandler(ctx, {});
    if (out.outcome === "escalate") {
      expect(out.reason).toBe(ctx); // PASS-THROUGH: identical reference
      expect(out.reason.hint).toBe("Run /bmad-next --resume to retry.");
    }
  });

  it("ESC_54_HANDLER_REGEX_2: 'See _bmad-output/.stepper/runs/123/log.md' matches → PASS-THROUGH", () => {
    const ctx: FailureContext = {
      ...baseCtx,
      hint: "See _bmad-output/.stepper/runs/123/log.md for the verifier output.",
    };
    const out = escalateHandler(ctx, {});
    if (out.outcome === "escalate") {
      expect(out.reason).toBe(ctx);
    }
  });

  it("ESC_54_HANDLER_REGEX_3: 'Try /bmad-next --doctor' matches → PASS-THROUGH", () => {
    const ctx: FailureContext = {
      ...baseCtx,
      hint: "Try /bmad-next --doctor to diagnose.",
    };
    const out = escalateHandler(ctx, {});
    if (out.outcome === "escalate") {
      expect(out.reason).toBe(ctx);
    }
  });

  it("ESC_54_HANDLER_REGEX_4: 'Check the verifier output' matches → PASS-THROUGH", () => {
    const ctx: FailureContext = {
      ...baseCtx,
      hint: "Check the verifier output for clues.",
    };
    const out = escalateHandler(ctx, {});
    if (out.outcome === "escalate") {
      expect(out.reason).toBe(ctx);
    }
  });
});

describe("escalateHandler — Story 5.4 SHAPE default for non-matching hints (ESC_54_HANDLER_SHAPE_*)", () => {
  it("ESC_54_HANDLER_SHAPE_1: empty hint '' does NOT match → shape default applied; default matches regex", () => {
    const ctx: FailureContext = { ...baseCtx, hint: "" };
    const out = escalateHandler(ctx, {});
    if (out.outcome === "escalate") {
      expect(out.reason.hint).not.toBe("");
      expect(ACTIONABLE_HINT_REGEX.test(out.reason.hint)).toBe(true);
    }
  });

  it("ESC_54_HANDLER_SHAPE_2: 'Failed.' does NOT match → shape default; default contains context.runId substring", () => {
    const ctx: FailureContext = { ...baseCtx, hint: "Failed." };
    const out = escalateHandler(ctx, {});
    if (out.outcome === "escalate") {
      expect(ACTIONABLE_HINT_REGEX.test(out.reason.hint)).toBe(true);
      expect(out.reason.hint).toContain(baseCtx.runId);
    }
  });

  it("ESC_54_HANDLER_SHAPE_3: hint with no Run/See/Try/Check verb → shape default", () => {
    const ctx: FailureContext = {
      ...baseCtx,
      hint: "the verifier was unhappy",
    };
    const out = escalateHandler(ctx, {});
    if (out.outcome === "escalate") {
      expect(ACTIONABLE_HINT_REGEX.test(out.reason.hint)).toBe(true);
      expect(out.reason.hint).toContain("--resume");
      expect(out.reason.hint).toContain("_bmad-output/.stepper/runs/");
    }
  });

  it("ESC_54_HANDLER_SHAPE_4 (extra coverage): SHAPE preserves all non-hint fields", () => {
    const ctx: FailureContext = { ...baseCtx, hint: "no verb" };
    const out = escalateHandler(ctx, {});
    if (out.outcome === "escalate") {
      expect(out.reason.code).toBe(ctx.code);
      expect(out.reason.message).toBe(ctx.message);
      expect(out.reason.runId).toBe(ctx.runId);
      expect(out.reason.step).toBe(ctx.step);
      expect(out.reason.attemptNumber).toBe(ctx.attemptNumber);
    }
  });
});

describe("dispatchFailureUx — Story 5.4 escalate delegation (ESC_54_DISPATCH_*)", () => {
  it("ESC_54_DISPATCH_1: dispatchFailureUx(ctx, 'escalate', {}) invokes escalateHandler (PASS-THROUGH for regex-matching ctx)", () => {
    const result = dispatchFailureUx(baseCtx, "escalate", {});
    expect(result.outcome).toBe("escalate");
    if (result.outcome === "escalate") {
      // baseCtx.hint matches the regex so PASS-THROUGH preserves identity.
      expect(result.reason).toBe(baseCtx);
    }
  });

  it("ESC_54_DISPATCH_2: TypeScript exhaustiveness — switch covers 'escalate' as a separate case (all 4 policies produce defined outcome)", () => {
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

  it("ESC_54_DISPATCH_3: v0.1 stub regression — for non-matching hint, outcome's reason.hint matches the regex (NOT unshaped pass-through)", () => {
    const ctxWithBadHint: FailureContext = {
      ...baseCtx,
      hint: "raw error message no verb",
    };
    const result = dispatchFailureUx(ctxWithBadHint, "escalate", {});
    expect(result.outcome).toBe("escalate");
    if (result.outcome === "escalate") {
      expect(ACTIONABLE_HINT_REGEX.test(result.reason.hint)).toBe(true);
      expect(result.reason.hint).not.toBe(ctxWithBadHint.hint);
    }
  });
});
