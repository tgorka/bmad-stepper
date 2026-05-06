/**
 * src/schemas/config.test.ts — Unit tests for `ConfigV1Schema` (AC-1)
 * + Story 5.6 CFG_56_* coverage of the narrowed `failurePolicies`
 * value type (closed enum union per FR31).
 *
 * Coverage:
 *   - Positive parse of the canonical fixture.
 *   - Missing required field (`schemaVersion`).
 *   - Wrong field type (`telemetry.enabled: "true"` string fails).
 *   - Defaults applied to the open-shape sub-objects when omitted.
 *   - CFG_56_* — narrowed failurePolicies enum (Story 5.6 — FR31).
 *
 * Also exports `canonicalConfigV1Fixture` for cross-file reuse by
 * `migration.test.ts`.
 */

import { describe, expect, it } from "bun:test";
import {
  type ConfigV1,
  ConfigV1Schema,
  FailurePoliciesSchema,
  type FailurePolicy,
  FailurePolicySchema,
} from "./config.ts";

export const canonicalConfigV1Fixture = {
  schemaVersion: 1 as const,
  paths: {
    state: "_bmad-output/.stepper/state.yaml",
    runs: "_bmad-output/.stepper/runs",
    staging: "_bmad-output/.stepper/staging",
    telemetry: "_bmad-output/.stepper/telemetry",
  },
  telemetry: { enabled: false },
} satisfies Pick<ConfigV1, "schemaVersion" | "paths" | "telemetry">;

describe("ConfigV1Schema", () => {
  it("parses the canonical config v1 fixture", () => {
    const parsed = ConfigV1Schema.parse(canonicalConfigV1Fixture);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.paths.state).toBe("_bmad-output/.stepper/state.yaml");
    expect(parsed.telemetry.enabled).toBe(false);
    // Defaults applied to open-shape sub-objects.
    expect(parsed.personas).toEqual({});
    expect(parsed.overrides).toEqual({});
    expect(parsed.verifiers).toEqual({});
    expect(parsed.failurePolicies).toEqual({});
    expect(parsed.models).toEqual({});
    expect(parsed.budgets).toEqual({});
  });

  it("rejects when schemaVersion is absent", () => {
    const result = ConfigV1Schema.safeParse({
      paths: canonicalConfigV1Fixture.paths,
      telemetry: { enabled: false },
    });
    expect(result.success).toBe(false);
  });

  it("rejects when telemetry.enabled is a string instead of boolean", () => {
    const result = ConfigV1Schema.safeParse({
      schemaVersion: 1,
      paths: canonicalConfigV1Fixture.paths,
      telemetry: { enabled: "true" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects when paths is missing a required field", () => {
    const result = ConfigV1Schema.safeParse({
      schemaVersion: 1,
      paths: {
        state: "x",
        runs: "y",
        staging: "z",
        // telemetry missing
      },
      telemetry: { enabled: false },
    });
    expect(result.success).toBe(false);
  });

  it("accepts when open-shape sub-objects carry arbitrary entries", () => {
    const parsed = ConfigV1Schema.parse({
      ...canonicalConfigV1Fixture,
      personas: { "step-foo": { agent: "amelia" } },
      overrides: { "step-foo": ["pre-foo"] },
    });
    expect(parsed.personas["step-foo"]).toBeDefined();
    expect(parsed.overrides["step-foo"]).toBeDefined();
  });
});

// ─── Story 5.6 — failurePolicies narrowed enum (FR31 PRIMARY) ────────────

describe("CFG_56_*: failurePolicies narrowed enum (Story 5.6 — FR31)", () => {
  it("CFG_56_1: parses a single-entry failurePolicies record with 'retry'", () => {
    const parsed = ConfigV1Schema.parse({
      ...canonicalConfigV1Fixture,
      failurePolicies: { "dev-story": "retry" },
    });
    expect(parsed.failurePolicies).toEqual({ "dev-story": "retry" });
  });

  it("CFG_56_2: parses each of the 4 valid policy values (parametric)", () => {
    const policies: FailurePolicy[] = [
      "retry",
      "skip",
      "route-to-fixer",
      "escalate",
    ];
    for (const policy of policies) {
      const parsed = ConfigV1Schema.parse({
        ...canonicalConfigV1Fixture,
        failurePolicies: { "dev-story": policy },
      });
      expect(parsed.failurePolicies["dev-story"]).toBe(policy);
    }
  });

  it("CFG_56_3: REJECTS invalid policy string per OQ-10 (Zod parse error)", () => {
    const result = ConfigV1Schema.safeParse({
      ...canonicalConfigV1Fixture,
      failurePolicies: { "dev-story": "nonsense-policy" },
    });
    expect(result.success).toBe(false);
  });

  it("CFG_56_4: REJECTS non-string policy value (e.g., number)", () => {
    const result = ConfigV1Schema.safeParse({
      ...canonicalConfigV1Fixture,
      failurePolicies: { "dev-story": 42 },
    });
    expect(result.success).toBe(false);
  });

  it("CFG_56_5: omitted failurePolicies parses to {} per existing default (backwards compat)", () => {
    const parsed = ConfigV1Schema.parse({
      ...canonicalConfigV1Fixture,
      // No failurePolicies key.
    });
    expect(parsed.failurePolicies).toEqual({});
  });

  it("CFG_56_6: parses multiple entries with both preserved", () => {
    const parsed = ConfigV1Schema.parse({
      ...canonicalConfigV1Fixture,
      failurePolicies: {
        "bmad-dev-story": "retry",
        "bmad-code-review": "route-to-fixer",
      },
    });
    expect(parsed.failurePolicies["bmad-dev-story"]).toBe("retry");
    expect(parsed.failurePolicies["bmad-code-review"]).toBe("route-to-fixer");
  });

  it("CFG_56_7: case-sensitive lookup — distinct keys preserved (per OQ-4)", () => {
    const parsed = ConfigV1Schema.parse({
      ...canonicalConfigV1Fixture,
      failurePolicies: {
        "BMad-Dev-Story": "retry",
        "bmad-dev-story": "skip",
      },
    });
    expect(parsed.failurePolicies["BMad-Dev-Story"]).toBe("retry");
    expect(parsed.failurePolicies["bmad-dev-story"]).toBe("skip");
  });
});

describe("CFG_56_REGISTRY_*: standalone schema exports (Story 5.6 — FR31)", () => {
  it("CFG_56_REGISTRY_1: FailurePolicySchema accepts all 4 valid values", () => {
    expect(FailurePolicySchema.safeParse("retry").success).toBe(true);
    expect(FailurePolicySchema.safeParse("skip").success).toBe(true);
    expect(FailurePolicySchema.safeParse("route-to-fixer").success).toBe(true);
    expect(FailurePolicySchema.safeParse("escalate").success).toBe(true);
  });

  it("CFG_56_REGISTRY_2: FailurePolicySchema rejects invalid values", () => {
    expect(FailurePolicySchema.safeParse("nonsense").success).toBe(false);
    expect(FailurePolicySchema.safeParse("RETRY").success).toBe(false);
    expect(FailurePolicySchema.safeParse(42).success).toBe(false);
    expect(FailurePolicySchema.safeParse(null).success).toBe(false);
  });

  it("CFG_56_REGISTRY_3: FailurePoliciesSchema accepts an empty record", () => {
    const result = FailurePoliciesSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("CFG_56_REGISTRY_4: FailurePoliciesSchema accepts populated record", () => {
    const result = FailurePoliciesSchema.safeParse({
      "bmad-dev-story": "retry",
      "bmad-code-review": "route-to-fixer",
    });
    expect(result.success).toBe(true);
  });
});
