/**
 * src/config/defaults.test.ts — Unit tests for `DEFAULT_CONFIG` (Story 6.1).
 *
 * Validates that the TypeScript-constant defaults round-trip cleanly
 * through `ConfigV1Schema.parse()` and `loadAndMigrate(...)`. Catches
 * shape drift between the constant and the Zod schema at test time.
 */

import { describe, expect, it } from "bun:test";
import { configMigrationRegistry } from "../migrations/config/index.ts";
import { loadAndMigrate } from "../migrations/load-and-migrate.ts";
import { ConfigV1Schema } from "../schemas/config.ts";
import { DEFAULT_CONFIG } from "./defaults.ts";

describe("DEF_61_*: DEFAULT_CONFIG (Story 6.1, FR37)", () => {
  it("DEF_61_1: ConfigV1Schema.parse(DEFAULT_CONFIG) returns the same shape", () => {
    const parsed = ConfigV1Schema.parse(DEFAULT_CONFIG);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.personas).toEqual({});
    expect(parsed.overrides).toEqual({});
    expect(parsed.verifiers).toEqual({});
    expect(parsed.failurePolicies).toEqual({});
    expect(parsed.models).toEqual({});
    expect(parsed.budgets).toEqual({});
    expect(parsed.paths).toEqual({
      state: "_bmad-output/.stepper/state.yaml",
      runs: "_bmad-output/.stepper/runs/",
      staging: "_bmad-output/.stepper/staging/",
      telemetry: "_bmad-output/.stepper/telemetry/",
    });
    expect(parsed.telemetry).toEqual({ enabled: false });
  });

  it("DEF_61_2: loadAndMigrate(DEFAULT_CONFIG, configMigrationRegistry) returns the same shape", () => {
    const migrated = loadAndMigrate(DEFAULT_CONFIG, configMigrationRegistry);
    expect(migrated.schemaVersion).toBe(1);
    expect(migrated.paths.state).toBe("_bmad-output/.stepper/state.yaml");
    expect(migrated.telemetry.enabled).toBe(false);
  });

  it("DEF_61_3: telemetry defaults to disabled (NFR-S3)", () => {
    expect(DEFAULT_CONFIG.telemetry.enabled).toBe(false);
  });

  it("DEF_61_4: paths fields match architecture lines 783-787 exactly", () => {
    expect(DEFAULT_CONFIG.paths.state).toBe("_bmad-output/.stepper/state.yaml");
    expect(DEFAULT_CONFIG.paths.runs).toBe("_bmad-output/.stepper/runs/");
    expect(DEFAULT_CONFIG.paths.staging).toBe("_bmad-output/.stepper/staging/");
    expect(DEFAULT_CONFIG.paths.telemetry).toBe(
      "_bmad-output/.stepper/telemetry/",
    );
  });

  it("DEF_61_5: schemaVersion is the literal 1", () => {
    expect(DEFAULT_CONFIG.schemaVersion).toBe(1);
  });
});
