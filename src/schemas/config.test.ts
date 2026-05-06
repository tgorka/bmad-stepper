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
  BudgetSchema,
  BudgetsSchema,
  type ConfigV1,
  ConfigV1Schema,
  FailurePoliciesSchema,
  type FailurePolicy,
  FailurePolicySchema,
  ModelSchema,
  ModelsSchema,
  OverrideEntrySchema,
  OverridesSchema,
  PathsSchema,
  PersonasSchema,
  type Phase,
  PhaseSchema,
  TelemetrySchema,
  VerifierConfigSchema,
  VerifiersSchema,
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

  it("accepts when narrowed sub-objects carry valid entries (Story 6.1)", () => {
    // Story 6.1 NARROWED these from open-shape `z.unknown()` to typed
    // sub-schemas. Personas accepts string | string[]; overrides accepts
    // OverrideEntry. The pre-Story-6.1 shapes (`{ agent: "amelia" }` for
    // personas, `["pre-foo"]` for overrides values) were always wrong but
    // silently accepted; they are now rejected at parse time per OQ-9.
    const parsed = ConfigV1Schema.parse({
      ...canonicalConfigV1Fixture,
      personas: { "step-foo": "amelia" },
      overrides: { "step-foo": { after: ["pre-foo"] } },
    });
    expect(parsed.personas["step-foo"]).toBe("amelia");
    expect(parsed.overrides["step-foo"]).toEqual({ after: ["pre-foo"] });
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

// ─── Story 6.1 — narrowed sub-schemas (FR34–FR40) ──────────────────────────

describe("CFG_61_PERSONAS: PersonasSchema (Story 6.1 — FR34)", () => {
  it("CFG_61_PERSONAS_1: accepts a single-string value", () => {
    const result = PersonasSchema.safeParse({ "dev-story": "amelia" });
    expect(result.success).toBe(true);
  });

  it("CFG_61_PERSONAS_2: accepts a string-array value", () => {
    const result = PersonasSchema.safeParse({
      "dev-story": ["amelia", "indie"],
    });
    expect(result.success).toBe(true);
  });

  it("CFG_61_PERSONAS_3: REJECTS numeric value", () => {
    const result = PersonasSchema.safeParse({ "dev-story": 42 });
    expect(result.success).toBe(false);
  });

  it("CFG_61_PERSONAS_4: REJECTS object value", () => {
    const result = PersonasSchema.safeParse({
      "dev-story": { agent: "amelia" },
    });
    expect(result.success).toBe(false);
  });

  it("CFG_61_PERSONAS_5: accepts an empty record", () => {
    const result = PersonasSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("CFG_61_OVERRIDES: OverridesSchema (Story 6.1 — FR35)", () => {
  it("CFG_61_OVERRIDES_1: accepts entry with all four fields", () => {
    const result = OverrideEntrySchema.safeParse({
      phase: "implementation",
      after: ["bmad-create-story"],
      before: ["bmad-code-review"],
      optional: false,
    });
    expect(result.success).toBe(true);
  });

  it("CFG_61_OVERRIDES_2: accepts empty entry (all fields optional)", () => {
    const result = OverrideEntrySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("CFG_61_OVERRIDES_3: accepts entry with phase only", () => {
    const result = OverrideEntrySchema.safeParse({ phase: "planning" });
    expect(result.success).toBe(true);
  });

  it("CFG_61_OVERRIDES_4: REJECTS non-array `after`", () => {
    const result = OverrideEntrySchema.safeParse({ after: "single-string" });
    expect(result.success).toBe(false);
  });

  it("CFG_61_OVERRIDES_5: REJECTS non-boolean `optional`", () => {
    const result = OverrideEntrySchema.safeParse({ optional: "yes" });
    expect(result.success).toBe(false);
  });

  it("CFG_61_OVERRIDES_6: OverridesSchema accepts populated record", () => {
    const result = OverridesSchema.safeParse({
      "architecture-validator": {
        phase: "solutioning",
        after: ["bmad-create-architecture"],
        optional: true,
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("CFG_61_VERIFIERS: VerifiersSchema (Story 6.1 — FR38)", () => {
  it("CFG_61_VERIFIERS_1: accepts entry with all three fields", () => {
    const result = VerifierConfigSchema.safeParse({
      requiredFiles: ["docs/foo.md"],
      requiredFrontmatterSections: ["Overview"],
      mode: "merge",
    });
    expect(result.success).toBe(true);
  });

  it("CFG_61_VERIFIERS_2: accepts empty entry", () => {
    const result = VerifierConfigSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("CFG_61_VERIFIERS_3: accepts mode='replace'", () => {
    const result = VerifierConfigSchema.safeParse({ mode: "replace" });
    expect(result.success).toBe(true);
  });

  it("CFG_61_VERIFIERS_4: REJECTS unknown mode value", () => {
    const result = VerifierConfigSchema.safeParse({ mode: "append" });
    expect(result.success).toBe(false);
  });

  it("CFG_61_VERIFIERS_5: REJECTS non-array requiredFiles", () => {
    const result = VerifierConfigSchema.safeParse({ requiredFiles: "x.md" });
    expect(result.success).toBe(false);
  });

  it("CFG_61_VERIFIERS_6: VerifiersSchema accepts populated record", () => {
    const result = VerifiersSchema.safeParse({
      "bmad-dev-story": {
        requiredFrontmatterSections: ["Implementation Plan"],
        mode: "merge",
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("VER_65_SCHEMA: VerifierConfigSchema (Story 6.5 base parses)", () => {
  it("VER_65_SCHEMA_1: accepts requiredFrontmatterSections only", () => {
    const result = VerifierConfigSchema.safeParse({
      requiredFrontmatterSections: ["status", "owner"],
    });
    expect(result.success).toBe(true);
  });

  it("VER_65_SCHEMA_2: accepts requiredFiles only (partial)", () => {
    const result = VerifierConfigSchema.safeParse({
      requiredFiles: ["**/*.md"],
    });
    expect(result.success).toBe(true);
  });

  it("VER_65_SCHEMA_3: accepts mode='merge', mode='replace', or empty object", () => {
    expect(VerifierConfigSchema.safeParse({ mode: "merge" }).success).toBe(
      true,
    );
    expect(VerifierConfigSchema.safeParse({ mode: "replace" }).success).toBe(
      true,
    );
    expect(VerifierConfigSchema.safeParse({}).success).toBe(true);
  });

  it("VER_65_SCHEMA_4: REJECTS mode='invalid' (enum constraint)", () => {
    const result = VerifierConfigSchema.safeParse({ mode: "invalid" });
    expect(result.success).toBe(false);
  });
});

describe("VER_65_SCHEMA_STRICT: VerifierConfigSchema.strict() (Story 6.5 I-46 — AR17 + AC-3)", () => {
  it("VER_65_SCHEMA_STRICT_1: REJECTS schema field (AC-3 PRIMARY — non-existent Zod schema name)", () => {
    const result = VerifierConfigSchema.safeParse({
      requiredFrontmatterSections: ["x"],
      schema: "MySchema",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      // Verify the issue path includes "schema" (unrecognized-keys path).
      const flatIssues = JSON.stringify(result.error.issues);
      expect(flatIssues).toContain("schema");
    }
  });

  it("VER_65_SCHEMA_STRICT_2: REJECTS verifierFile field", () => {
    const result = VerifierConfigSchema.safeParse({
      verifierFile: "./custom.ts",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toContain("verifierFile");
    }
  });

  it("VER_65_SCHEMA_STRICT_3: REJECTS judge field (LLM-as-judge deferred per architecture line 1727)", () => {
    const result = VerifierConfigSchema.safeParse({ judge: "claude" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toContain("judge");
    }
  });

  it("VER_65_SCHEMA_STRICT_4: REJECTS customFn field (AR17 — no user-supplied custom code)", () => {
    const result = VerifierConfigSchema.safeParse({
      customFn: { name: "x" },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toContain("customFn");
    }
  });

  it("VER_65_SCHEMA_STRICT_5: REJECTS custom field (AR17 — symmetric)", () => {
    const result = VerifierConfigSchema.safeParse({
      custom: "() => true",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toContain("custom");
    }
  });
});

describe("VER_65_VERIFIERS_RECORD: VerifiersSchema (Story 6.5)", () => {
  it("VER_65_VERIFIERS_RECORD_1: accepts empty record (Story 6.1 backwards-compat)", () => {
    const result = VerifiersSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("VER_65_VERIFIERS_RECORD_2: accepts multi-step record with mixed mode values", () => {
    const result = VerifiersSchema.safeParse({
      "dev-story": {
        requiredFrontmatterSections: ["status", "owner"],
        mode: "merge",
      },
      "story-create": { mode: "replace" },
    });
    expect(result.success).toBe(true);
  });

  it("VER_65_VERIFIERS_RECORD_3: REJECTS bad mode at nested step path", () => {
    const result = VerifiersSchema.safeParse({
      "dev-story": { mode: "replace-all" },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toContain("dev-story");
    }
  });
});

describe("CFG_61_MODELS: ModelsSchema (Story 6.1)", () => {
  it("CFG_61_MODELS_1: accepts 'sonnet'", () => {
    expect(ModelSchema.safeParse("sonnet").success).toBe(true);
  });

  it("CFG_61_MODELS_2: accepts 'opus'", () => {
    expect(ModelSchema.safeParse("opus").success).toBe(true);
  });

  it("CFG_61_MODELS_3: accepts 'haiku'", () => {
    expect(ModelSchema.safeParse("haiku").success).toBe(true);
  });

  it("CFG_61_MODELS_4: REJECTS 'claude-3'", () => {
    expect(ModelSchema.safeParse("claude-3").success).toBe(false);
  });

  it("CFG_61_MODELS_5: REJECTS uppercase variants", () => {
    expect(ModelSchema.safeParse("SONNET").success).toBe(false);
  });

  it("CFG_61_MODELS_6: ModelsSchema accepts populated record", () => {
    const result = ModelsSchema.safeParse({
      "bmad-dev-story": "opus",
      "bmad-code-review": "sonnet",
    });
    expect(result.success).toBe(true);
  });
});

describe("CFG_61_BUDGETS: BudgetsSchema (Story 6.1)", () => {
  it("CFG_61_BUDGETS_1: accepts entry with both fields", () => {
    const result = BudgetSchema.safeParse({
      contextTokens: 60000,
      timeoutMs: 300000,
    });
    expect(result.success).toBe(true);
  });

  it("CFG_61_BUDGETS_2: accepts entry with only contextTokens", () => {
    const result = BudgetSchema.safeParse({ contextTokens: 60000 });
    expect(result.success).toBe(true);
  });

  it("CFG_61_BUDGETS_3: REJECTS negative contextTokens", () => {
    const result = BudgetSchema.safeParse({ contextTokens: -1 });
    expect(result.success).toBe(false);
  });

  it("CFG_61_BUDGETS_4: REJECTS zero contextTokens", () => {
    const result = BudgetSchema.safeParse({ contextTokens: 0 });
    expect(result.success).toBe(false);
  });

  it("CFG_61_BUDGETS_5: REJECTS non-integer contextTokens", () => {
    const result = BudgetSchema.safeParse({ contextTokens: 1.5 });
    expect(result.success).toBe(false);
  });

  it("CFG_61_BUDGETS_6: REJECTS negative timeoutMs", () => {
    const result = BudgetSchema.safeParse({ timeoutMs: -100 });
    expect(result.success).toBe(false);
  });

  it("CFG_61_BUDGETS_7: BudgetsSchema accepts populated record", () => {
    const result = BudgetsSchema.safeParse({
      "bmad-dev-story": { contextTokens: 80000, timeoutMs: 600000 },
    });
    expect(result.success).toBe(true);
  });
});

// Story 6.4 (`budgets:` per-step config) — BudgetSchema `.strict()` extension
// per I-38 forward-tracker (Story 6.2 OQ-4 pattern). The `.strict()` rejects
// unknown fields like `costUsd` or `maxToolCalls` at LOAD time. Backwards-
// compat preserved (existing fixtures use only contextTokens + timeoutMs).
describe("BUD_64_SCHEMA_*: BudgetSchema parametric (Story 6.4 AC-1)", () => {
  it("BUD_64_SCHEMA_1: accepts both fields populated (80000 / 600000)", () => {
    const result = BudgetSchema.safeParse({
      contextTokens: 80000,
      timeoutMs: 600000,
    });
    expect(result.success).toBe(true);
  });

  it("BUD_64_SCHEMA_2: accepts partial — only contextTokens", () => {
    const result = BudgetSchema.safeParse({ contextTokens: 80000 });
    expect(result.success).toBe(true);
  });

  it("BUD_64_SCHEMA_3: accepts empty object (both fields optional)", () => {
    const result = BudgetSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("BUD_64_SCHEMA_STRICT_*: BudgetSchema rejects unknown fields (Story 6.4 I-38)", () => {
  it("BUD_64_SCHEMA_STRICT_1: rejects unknown `costUsd` field", () => {
    const result = BudgetSchema.safeParse({
      contextTokens: 80000,
      costUsd: 500,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issuePathSegments = result.error.issues.flatMap(
        (issue) => issue.path,
      );
      expect(
        issuePathSegments.includes("costUsd") ||
          result.error.issues.some((issue) =>
            issue.message.toLowerCase().includes("costusd"),
          ) ||
          result.error.issues.some((issue) =>
            "keys" in issue && Array.isArray((issue as { keys?: unknown }).keys)
              ? (issue as { keys: string[] }).keys.includes("costUsd")
              : false,
          ) ||
          JSON.stringify(result.error.issues).includes("costUsd"),
      ).toBe(true);
    }
  });

  it("BUD_64_SCHEMA_STRICT_2: rejects unknown `maxToolCalls` field", () => {
    const result = BudgetSchema.safeParse({
      contextTokens: 80000,
      maxToolCalls: 10,
    });
    expect(result.success).toBe(false);
  });

  it("BUD_64_SCHEMA_STRICT_3: rejects unknown field even when no other fields supplied", () => {
    const result = BudgetSchema.safeParse({ unknownKey: "value" });
    expect(result.success).toBe(false);
  });
});

describe("BUD_64_BUDGETS_RECORD_*: BudgetsSchema record (Story 6.4 AC-1)", () => {
  it("BUD_64_BUDGETS_RECORD_1: accepts empty record (Story 6.1 default fixture)", () => {
    const result = BudgetsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("BUD_64_BUDGETS_RECORD_2: accepts multiple step-keyed entries", () => {
    const result = BudgetsSchema.safeParse({
      "dev-story": { contextTokens: 80000, timeoutMs: 600000 },
      "code-review": { contextTokens: 100000 },
    });
    expect(result.success).toBe(true);
  });

  it("BUD_64_BUDGETS_RECORD_3: REJECTS negative contextTokens nested at step path", () => {
    const result = BudgetsSchema.safeParse({
      "dev-story": { contextTokens: -1 },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const path = result.error.issues
        .map((issue) => issue.path.join("."))
        .join(",");
      expect(path).toContain("dev-story");
      expect(path).toContain("contextTokens");
    }
  });

  it("BUD_64_BUDGETS_RECORD_4: REJECTS unknown field nested in record entry (.strict)", () => {
    const result = BudgetsSchema.safeParse({
      "dev-story": { contextTokens: 80000, costUsd: 500 },
    });
    expect(result.success).toBe(false);
  });
});

describe("CFG_61_PATHS: PathsSchema (Story 6.1 — FR39)", () => {
  it("CFG_61_PATHS_1: accepts all four required string fields", () => {
    const result = PathsSchema.safeParse({
      state: "_bmad-output/.stepper/state.yaml",
      runs: "_bmad-output/.stepper/runs/",
      staging: "_bmad-output/.stepper/staging/",
      telemetry: "_bmad-output/.stepper/telemetry/",
    });
    expect(result.success).toBe(true);
  });

  it("CFG_61_PATHS_2: REJECTS missing field", () => {
    const result = PathsSchema.safeParse({
      state: "x",
      runs: "y",
      staging: "z",
      // telemetry missing
    });
    expect(result.success).toBe(false);
  });

  it("CFG_61_PATHS_3: REJECTS non-string field", () => {
    const result = PathsSchema.safeParse({
      state: 42,
      runs: "y",
      staging: "z",
      telemetry: "w",
    });
    expect(result.success).toBe(false);
  });
});

describe("CFG_61_TELEMETRY: TelemetrySchema (Story 6.1 — FR40)", () => {
  it("CFG_61_TELEMETRY_1: accepts { enabled: false }", () => {
    expect(TelemetrySchema.safeParse({ enabled: false }).success).toBe(true);
  });

  it("CFG_61_TELEMETRY_2: accepts { enabled: true }", () => {
    expect(TelemetrySchema.safeParse({ enabled: true }).success).toBe(true);
  });

  it("CFG_61_TELEMETRY_3: REJECTS non-boolean enabled", () => {
    expect(TelemetrySchema.safeParse({ enabled: "true" }).success).toBe(false);
  });

  it("CFG_61_TELEMETRY_4: REJECTS missing enabled", () => {
    expect(TelemetrySchema.safeParse({}).success).toBe(false);
  });
});

describe("CFG_61_FULL_CONFIG: full ConfigV1Schema parse with all sub-schemas (Story 6.1)", () => {
  it("CFG_61_FULL_CONFIG_1: parses architecture lines 775-789 fixture", () => {
    const result = ConfigV1Schema.safeParse({
      schemaVersion: 1,
      personas: { "bmad-dev-story": "amelia" },
      overrides: {
        "architecture-validator": {
          phase: "solutioning",
          after: ["bmad-create-architecture"],
          optional: true,
        },
      },
      verifiers: {
        "bmad-dev-story": {
          requiredFrontmatterSections: ["Implementation Plan"],
          mode: "merge",
        },
      },
      failurePolicies: { "bmad-dev-story": "retry" },
      models: { "bmad-dev-story": "opus" },
      budgets: {
        "bmad-dev-story": { contextTokens: 80000, timeoutMs: 600000 },
      },
      paths: {
        state: "_bmad-output/.stepper/state.yaml",
        runs: "_bmad-output/.stepper/runs/",
        staging: "_bmad-output/.stepper/staging/",
        telemetry: "_bmad-output/.stepper/telemetry/",
      },
      telemetry: { enabled: false },
    });
    expect(result.success).toBe(true);
  });

  it("CFG_61_FULL_CONFIG_2: rejects personas with numeric value (was silently accepted at v1.5 baseline)", () => {
    const result = ConfigV1Schema.safeParse({
      ...canonicalConfigV1Fixture,
      personas: { "dev-story": 42 },
    });
    expect(result.success).toBe(false);
  });

  it("CFG_61_FULL_CONFIG_3: rejects models with invalid value", () => {
    const result = ConfigV1Schema.safeParse({
      ...canonicalConfigV1Fixture,
      models: { "dev-story": "claude-3" },
    });
    expect(result.success).toBe(false);
  });

  it("CFG_61_FULL_CONFIG_4: rejects overrides with non-array `after`", () => {
    const result = ConfigV1Schema.safeParse({
      ...canonicalConfigV1Fixture,
      overrides: { "skill-foo": { after: "string-not-array" } },
    });
    expect(result.success).toBe(false);
  });
});

describe("CFG_61_BACKWARDS_COMPAT: empty records still parse (Story 6.1)", () => {
  it("CFG_61_BACKWARDS_COMPAT_1: empty record fields preserved (no schema-version bump)", () => {
    const parsed = ConfigV1Schema.parse({
      ...canonicalConfigV1Fixture,
      personas: {},
      overrides: {},
      verifiers: {},
      models: {},
      budgets: {},
    });
    expect(parsed.personas).toEqual({});
    expect(parsed.overrides).toEqual({});
    expect(parsed.verifiers).toEqual({});
    expect(parsed.models).toEqual({});
    expect(parsed.budgets).toEqual({});
  });

  it("CFG_61_BACKWARDS_COMPAT_2: omitted record fields default to empty record", () => {
    const parsed = ConfigV1Schema.parse(canonicalConfigV1Fixture);
    expect(parsed.personas).toEqual({});
    expect(parsed.overrides).toEqual({});
    expect(parsed.verifiers).toEqual({});
    expect(parsed.failurePolicies).toEqual({});
    expect(parsed.models).toEqual({});
    expect(parsed.budgets).toEqual({});
  });
});

// ─── Story 6.2 — OverrideEntrySchema tightening (FR35 PRIMARY) ──────────

describe("OVR_62_SCHEMA: OverrideEntrySchema Phase enum + .strict() (Story 6.2)", () => {
  it("OVR_62_SCHEMA_PHASE_ENUM_1: REJECTS invalid phase value (e.g., 'deployment')", () => {
    // AC-3 — Phase enum is the schema-level source of truth; a typo'd
    // phase string yields a Zod error pointing at the `phase` path.
    const result = OverrideEntrySchema.safeParse({ phase: "deployment" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fieldPaths = result.error.issues.map((iss) => iss.path.join("."));
      expect(fieldPaths).toContain("phase");
    }
  });

  it("OVR_62_SCHEMA_PHASE_ENUM_2: accepts each of the 5 valid phases (parametric)", () => {
    // CI consistency assertion per OQ-2 — the dag-local literal union and
    // the Zod enum MUST stay in lock-step. If a 6th phase is introduced
    // anywhere, this parametric loop should be extended in lock-step.
    const phases: Phase[] = [
      "analysis",
      "planning",
      "solutioning",
      "implementation",
      "retro",
    ];
    for (const p of phases) {
      const result = OverrideEntrySchema.safeParse({ phase: p });
      expect(result.success).toBe(true);
    }
  });

  it("OVR_62_SCHEMA_STRICT_1: REJECTS unknown sub-key (typo'd 'optionnal')", () => {
    // OQ-4 — `.strict()` rejects unknown keys at parse time. The Zod
    // issue path includes the unknown key name so the loader's hint can
    // point at it.
    const result = OverrideEntrySchema.safeParse({
      phase: "solutioning",
      optionnal: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = JSON.stringify(result.error.issues);
      expect(flat).toContain("optionnal");
    }
  });

  it("OVR_62_SCHEMA_PERSONA_1: accepts string, string-array, and null persona", () => {
    expect(
      OverrideEntrySchema.safeParse({
        phase: "solutioning",
        persona: "architect",
      }).success,
    ).toBe(true);
    expect(
      OverrideEntrySchema.safeParse({
        phase: "solutioning",
        persona: ["architect", "dev"],
      }).success,
    ).toBe(true);
    expect(
      OverrideEntrySchema.safeParse({ phase: "solutioning", persona: null })
        .success,
    ).toBe(true);
  });

  it("OVR_62_SCHEMA_IDEMPOTENT_1: accepts boolean idempotent", () => {
    expect(
      OverrideEntrySchema.safeParse({
        phase: "solutioning",
        idempotent: true,
      }).success,
    ).toBe(true);
    expect(
      OverrideEntrySchema.safeParse({
        phase: "solutioning",
        idempotent: false,
      }).success,
    ).toBe(true);
  });

  it("OVR_62_SCHEMA_FULL_1: parses the AC-1 verbatim canonical example", () => {
    // AC-1 — `overrides: { architecture-validator: { phase: solutioning,
    //   after: [bmad-create-architecture], optional: true } }`
    const result = OverrideEntrySchema.safeParse({
      phase: "solutioning",
      after: ["bmad-create-architecture"],
      optional: true,
    });
    expect(result.success).toBe(true);
  });

  it("OVR_62_SCHEMA_BACKCOMPAT_1: empty {} parses cleanly (backwards-compat)", () => {
    const result = OverrideEntrySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("OVR_62_SCHEMA_PHASE_REGISTRY_1: PhaseSchema accepts all 5 valid values", () => {
    expect(PhaseSchema.safeParse("analysis").success).toBe(true);
    expect(PhaseSchema.safeParse("planning").success).toBe(true);
    expect(PhaseSchema.safeParse("solutioning").success).toBe(true);
    expect(PhaseSchema.safeParse("implementation").success).toBe(true);
    expect(PhaseSchema.safeParse("retro").success).toBe(true);
  });

  it("OVR_62_SCHEMA_PHASE_REGISTRY_2: PhaseSchema rejects invalid values", () => {
    expect(PhaseSchema.safeParse("DEPLOYMENT").success).toBe(false);
    expect(PhaseSchema.safeParse("PLANNING").success).toBe(false);
    expect(PhaseSchema.safeParse("").success).toBe(false);
    expect(PhaseSchema.safeParse(42).success).toBe(false);
    expect(PhaseSchema.safeParse(null).success).toBe(false);
  });

  it("OVR_62_SCHEMA_OVERRIDES_RECORD_1: OverridesSchema rejects invalid sub-keys (delegates to .strict())", () => {
    const result = OverridesSchema.safeParse({
      "architecture-validator": {
        phase: "solutioning",
        after: ["bmad-create-architecture"],
        optional: true,
        bogusKey: 1,
      },
    });
    expect(result.success).toBe(false);
  });
});

// ─── Story 6.3: ModelSchema + ModelsSchema test density (FR36, NFR-R6) ────
//
// Story 6.3 ships ZERO schema mutations — `ModelSchema` is already a closed
// `z.enum(["sonnet", "opus", "haiku"])` per Story 6.1 (`src/schemas/config.ts:208`).
// This block extends test density via parametric positive + negative
// coverage on the existing schema, plus record-level positive + negative
// coverage on `ModelsSchema = z.record(z.string(), ModelSchema)`. Per the
// architectural decision in Story 6.3 (OQ-1 + I-38 trivially honoured),
// `.strict()` on a `z.enum` is a no-op — the enum already rejects unknown
// values; no schema-side change needed.

describe("Story 6.3 — ModelSchema closed-enum (sonnet/opus/haiku)", () => {
  it("MOD_63_SCHEMA_1: parses each of the 3 valid Anthropic Claude tier values", () => {
    expect(ModelSchema.safeParse("sonnet").success).toBe(true);
    expect(ModelSchema.safeParse("opus").success).toBe(true);
    expect(ModelSchema.safeParse("haiku").success).toBe(true);
  });

  it("MOD_63_SCHEMA_2: rejects an out-of-enum string (gpt-4) with Zod error mentioning the 3 valid options", () => {
    const result = ModelSchema.safeParse("gpt-4");
    expect(result.success).toBe(false);
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? "";
      // Zod's enum invalid-value message lists the valid options.
      expect(message).toContain("sonnet");
      expect(message).toContain("opus");
      expect(message).toContain("haiku");
    }
  });

  it("MOD_63_SCHEMA_3: rejects non-string types (number)", () => {
    const result = ModelSchema.safeParse(42);
    expect(result.success).toBe(false);
  });

  it("MOD_63_SCHEMA_4: rejects null + undefined + empty string", () => {
    expect(ModelSchema.safeParse(null).success).toBe(false);
    expect(ModelSchema.safeParse(undefined).success).toBe(false);
    expect(ModelSchema.safeParse("").success).toBe(false);
  });
});

describe("Story 6.3 — ModelsSchema record (z.record(z.string(), ModelSchema))", () => {
  it("MOD_63_MODELS_RECORD_1: empty record parses (backwards-compat with Story 6.1 fixtures)", () => {
    const result = ModelsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("MOD_63_MODELS_RECORD_2: per-step record with multiple valid entries", () => {
    const result = ModelsSchema.safeParse({
      "bmad-dev-story": "sonnet",
      "bmad-code-review": "opus",
      "bmad-create-prd": "haiku",
    });
    expect(result.success).toBe(true);
  });

  it("MOD_63_MODELS_RECORD_3: invalid model value surfaces the offending stepName in the issue path", () => {
    const result = ModelsSchema.safeParse({ "bmad-dev-story": "claude-3" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0];
      expect(issue?.path).toContain("bmad-dev-story");
    }
  });

  it("MOD_63_MODELS_RECORD_4: non-string value rejected (number)", () => {
    const result = ModelsSchema.safeParse({ "bmad-dev-story": 1 });
    expect(result.success).toBe(false);
  });
});
