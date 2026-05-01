/**
 * src/schemas/config.test.ts — Unit tests for `ConfigV1Schema` (AC-1).
 *
 * Coverage:
 *   - Positive parse of the canonical fixture.
 *   - Missing required field (`schemaVersion`).
 *   - Wrong field type (`telemetry.enabled: "true"` string fails).
 *   - Defaults applied to the open-shape sub-objects when omitted.
 *
 * Also exports `canonicalConfigV1Fixture` for cross-file reuse by
 * `migration.test.ts`.
 */

import { describe, expect, it } from "bun:test";
import { type ConfigV1, ConfigV1Schema } from "./config.ts";

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
