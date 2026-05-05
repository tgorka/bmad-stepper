/**
 * src/failure-ux/resolve-policy.test.ts — Unit tests for the per-step
 * failure-policy resolver (Story 5.6 — FR31 PRIMARY).
 *
 * Pure-function tests; no IO; no mock.module discipline; matches the
 * mid-tier purity per AR41 + AR42.
 *
 * Test surface (RP_56_*) — 11 cases per the Test Surface Inventory in
 * `_bmad-output/implementation-artifacts/5-6-per-step-failure-policy-via-config-actionable-errors.md`:
 *
 *   - RP_56_1  — escalate default when no config (undefined)
 *   - RP_56_2  — escalate default when empty config object ({})
 *   - RP_56_3  — escalate default when failurePolicies absent (undefined)
 *   - RP_56_4  — escalate default when step not in failurePolicies
 *   - RP_56_5  — returns configured "retry"
 *   - RP_56_6  — returns configured "skip"
 *   - RP_56_7  — returns configured "route-to-fixer"
 *   - RP_56_8  — returns configured "escalate" (explicit, not default)
 *   - RP_56_9  — case-sensitive lookup
 *   - RP_56_10 — multi-step config (returns the matching entry)
 *   - RP_56_11 — pure function (idempotent across 100 calls)
 */

import { describe, expect, it } from "bun:test";
import type { FailurePolicy } from "./index.ts";
import { resolveFailurePolicy } from "./resolve-policy.ts";

describe("resolveFailurePolicy (Story 5.6 — RP_56_*)", () => {
  it("RP_56_1: escalate default when no config (undefined)", () => {
    expect(resolveFailurePolicy("any-step", undefined)).toBe("escalate");
  });

  it("RP_56_2: escalate default when empty config object ({})", () => {
    expect(resolveFailurePolicy("any-step", {})).toBe("escalate");
  });

  it("RP_56_3: escalate default when failurePolicies absent (undefined)", () => {
    expect(
      resolveFailurePolicy("any-step", { failurePolicies: undefined }),
    ).toBe("escalate");
  });

  it("RP_56_4: escalate default when step not in failurePolicies", () => {
    expect(
      resolveFailurePolicy("nonexistent-step", {
        failurePolicies: { "other-step": "retry" },
      }),
    ).toBe("escalate");
  });

  it("RP_56_5: returns configured 'retry'", () => {
    expect(
      resolveFailurePolicy("dev-story", {
        failurePolicies: { "dev-story": "retry" },
      }),
    ).toBe("retry");
  });

  it("RP_56_6: returns configured 'skip'", () => {
    expect(
      resolveFailurePolicy("dev-story", {
        failurePolicies: { "dev-story": "skip" },
      }),
    ).toBe("skip");
  });

  it("RP_56_7: returns configured 'route-to-fixer'", () => {
    expect(
      resolveFailurePolicy("dev-story", {
        failurePolicies: { "dev-story": "route-to-fixer" },
      }),
    ).toBe("route-to-fixer");
  });

  it("RP_56_8: returns configured 'escalate' (explicit, not default)", () => {
    expect(
      resolveFailurePolicy("dev-story", {
        failurePolicies: { "dev-story": "escalate" },
      }),
    ).toBe("escalate");
  });

  it("RP_56_9: case-sensitive lookup (per OQ-4)", () => {
    // The resolver does NOT normalize keys — case mismatch falls through
    // to the escalate plugin default per OQ-4 (BMAD step IDs verbatim).
    expect(
      resolveFailurePolicy("Dev-Story", {
        failurePolicies: { "dev-story": "retry" },
      }),
    ).toBe("escalate");
  });

  it("RP_56_10: multi-step config (returns the matching entry)", () => {
    const config = {
      failurePolicies: {
        "bmad-dev-story": "retry" as const,
        "bmad-code-review": "route-to-fixer" as const,
      },
    };
    expect(resolveFailurePolicy("bmad-dev-story", config)).toBe("retry");
    expect(resolveFailurePolicy("bmad-code-review", config)).toBe(
      "route-to-fixer",
    );
    // Step not in either entry → escalate default.
    expect(resolveFailurePolicy("bmad-retrospective", config)).toBe("escalate");
  });

  it("RP_56_11: pure function — 100 calls with same input → same output", () => {
    const config = {
      failurePolicies: { "bmad-dev-story": "retry" as const },
    };
    const seen = new Set<FailurePolicy>();
    for (let i = 0; i < 100; i++) {
      const result = resolveFailurePolicy("bmad-dev-story", config);
      seen.add(result);
    }
    expect(seen.size).toBe(1);
    expect(seen.has("retry")).toBe(true);
  });

  it("RP_56_TYPE_NARROWING: return type is assignable to FailurePolicy", () => {
    // Compile-time + runtime check: the resolver's return value MUST be
    // assignable to FailurePolicy (the closed union of 4 strings).
    const policy: FailurePolicy = resolveFailurePolicy("any-step", undefined);
    expect(["retry", "skip", "route-to-fixer", "escalate"]).toContain(policy);
  });

  it("RP_56_BACKWARDS_COMPAT: re-exported from src/failure-ux/index.ts matches canonical export", async () => {
    // The Story 5.1 inline stub was REPLACED by a re-export from
    // ./resolve-policy.ts per OQ-1. Confirm the re-export is the same
    // function reference (single source of truth).
    const indexModule = await import("./index.ts");
    expect(indexModule.resolveFailurePolicy).toBe(resolveFailurePolicy);
  });
});
