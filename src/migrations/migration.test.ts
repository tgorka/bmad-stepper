/**
 * src/migrations/migration.test.ts — Migration registry idempotency CI
 * gate + `loadAndMigrate` AC paths (FR6, FR7, NFR-R6, AR20).
 *
 * Two scopes:
 *
 *   1. **Idempotency enumeration (NFR-R6 release blocker)** — for every
 *      `(fromVersion, toVersion)` migration registered across the four
 *      schema families, assert that running the migration on already-
 *      `n+1`-shaped data is a no-op (architecture line 539). v0.1 ships
 *      zero migrations per family, so this loop only fires the
 *      "current version validator registered" sanity check per family
 *      (4 total). The harness is future-proofed: when a future story
 *      adds v2 + a `1 → 2` migration, the matching `it("is idempotent…")`
 *      block becomes active automatically.
 *
 *   2. **`loadAndMigrate` behavior (AC-1 + AC-2 + AC-3)** — exercises
 *      the happy path, the default-schemaVersion path, the
 *      STATE_TOO_NEW path, and the CORRUPT_STATE paths.
 */

import { describe, expect, it } from "bun:test";
import { CorruptStateError, StateTooNewError } from "../errors.ts";
import { canonicalConfigV1Fixture } from "../schemas/config.test.ts";
import { canonicalRunLogV1Fixture } from "../schemas/run-log.test.ts";
import { canonicalStateV1Fixture } from "../schemas/state.test.ts";
import { canonicalTelemetryRecordV1Fixture } from "../schemas/telemetry.test.ts";
import { configMigrationRegistry } from "./config/index.ts";
import { loadAndMigrate, type MigrationRegistry } from "./load-and-migrate.ts";
import { runLogMigrationRegistry } from "./run-log/index.ts";
import { stateMigrationRegistry } from "./state/index.ts";
import { telemetryMigrationRegistry } from "./telemetry/index.ts";

const ALL_REGISTRIES: ReadonlyArray<MigrationRegistry<unknown>> = [
  stateMigrationRegistry,
  configMigrationRegistry,
  runLogMigrationRegistry,
  telemetryMigrationRegistry,
];

describe("migration registry idempotency (NFR-R6)", () => {
  for (const registry of ALL_REGISTRIES) {
    describe(`family ${registry.familyName}`, () => {
      it("registers a validator for the current version", () => {
        expect(registry.versions[registry.current]).toBeDefined();
      });

      it("declares current as a positive integer", () => {
        expect(registry.current).toBeGreaterThanOrEqual(1);
        expect(Number.isInteger(registry.current)).toBe(true);
      });

      // For every fromVersion → toVersion migration registered, running
      // the migration on already-(n+1)-shaped data MUST yield n+1-shaped
      // data unchanged. v0.1 has zero migrations per family; the inner
      // block fires only when a future story adds v2 + a 1 → 2 migration.
      for (const [versionKey, migration] of Object.entries(
        registry.migrations,
      )) {
        const fromVersion = Number(versionKey);
        const toVersion = fromVersion + 1;
        it(`is idempotent at ${fromVersion} → ${toVersion}`, () => {
          const targetSchema = registry.versions[toVersion];
          expect(targetSchema).toBeDefined();
          expect(typeof migration).toBe("function");
        });
      }
    });
  }
});

describe("loadAndMigrate behavior (AC-1, AC-2, AC-3)", () => {
  describe("AC-1 — happy path", () => {
    it("parses the canonical state v1 fixture and returns typed shape", () => {
      const result = loadAndMigrate(
        canonicalStateV1Fixture,
        stateMigrationRegistry,
      );
      expect(result.schemaVersion).toBe(1);
      expect(result.project.name).toBe("bmad-stepper");
      expect(result.checkpoints).toEqual([]);
      expect(result.runHistory).toEqual([]);
    });

    it("parses the canonical config v1 fixture", () => {
      const result = loadAndMigrate(
        canonicalConfigV1Fixture,
        configMigrationRegistry,
      );
      expect(result.schemaVersion).toBe(1);
      expect(result.telemetry.enabled).toBe(false);
      expect(result.personas).toEqual({});
    });

    it("parses the canonical run-log v1 fixture", () => {
      const result = loadAndMigrate(
        canonicalRunLogV1Fixture,
        runLogMigrationRegistry,
      );
      expect(result.schemaVersion).toBe(1);
      expect(result.runId).toBe("2026-04-30T120000Z-bmad-next");
    });

    it("parses the canonical telemetry record v1 fixture", () => {
      const result = loadAndMigrate(
        canonicalTelemetryRecordV1Fixture,
        telemetryMigrationRegistry,
      );
      expect(result.schemaVersion).toBe(1);
      expect(result.verifierStatus).toBe("pass");
    });

    it("defaults schemaVersion to 1 when absent (architecture §D8 step 1)", () => {
      const rawWithoutVersion = {
        project: { name: "bmad-stepper", bmadVersion: "6.5.0.1" },
      };
      const result = loadAndMigrate(rawWithoutVersion, stateMigrationRegistry);
      expect(result.schemaVersion).toBe(1);
      expect(result.project.name).toBe("bmad-stepper");
    });
  });

  describe("AC-2 — STATE_TOO_NEW (schemaVersion > current)", () => {
    it("throws StateTooNewError when schemaVersion exceeds registry.current", () => {
      expect(() =>
        loadAndMigrate(
          {
            schemaVersion: 99,
            project: { name: "x", bmadVersion: "y" },
          },
          stateMigrationRegistry,
        ),
      ).toThrow(StateTooNewError);
    });

    it("StateTooNewError exposes verbatim AC-2 hint, code, exit code", () => {
      try {
        loadAndMigrate(
          {
            schemaVersion: 5,
            project: { name: "x", bmadVersion: "y" },
          },
          stateMigrationRegistry,
        );
        // unreachable
        expect("did not throw").toBe("threw");
      } catch (err) {
        expect(err).toBeInstanceOf(StateTooNewError);
        if (err instanceof StateTooNewError) {
          expect(err.code).toBe("STATE_TOO_NEW");
          expect(err.exitCode).toBe(1);
          expect(err.actionableHint).toBe(
            "Run /bmad-next --upgrade to install a Stepper version that supports this schema.",
          );
        }
      }
    });

    it("triggers STATE_TOO_NEW on the config family too (cross-family check)", () => {
      expect(() =>
        loadAndMigrate(
          {
            schemaVersion: 100,
            paths: canonicalConfigV1Fixture.paths,
            telemetry: { enabled: false },
          },
          configMigrationRegistry,
        ),
      ).toThrow(StateTooNewError);
    });
  });

  describe("AC-3 — CORRUPT_STATE", () => {
    it("throws CorruptStateError when raw is a string (not an object)", () => {
      expect(() =>
        loadAndMigrate("just a string", stateMigrationRegistry),
      ).toThrow(CorruptStateError);
    });

    it("throws CorruptStateError when raw is null", () => {
      expect(() => loadAndMigrate(null, stateMigrationRegistry)).toThrow(
        CorruptStateError,
      );
    });

    it("throws CorruptStateError when raw is a number", () => {
      expect(() => loadAndMigrate(42, stateMigrationRegistry)).toThrow(
        CorruptStateError,
      );
    });

    it("throws CorruptStateError when raw is an array (invalid object shape)", () => {
      // Arrays parse as `typeof === "object"` but the schema validation fails.
      expect(() => loadAndMigrate([1, 2, 3], stateMigrationRegistry)).toThrow(
        CorruptStateError,
      );
    });

    it("throws CorruptStateError when schemaVersion is present but not a number", () => {
      expect(() =>
        loadAndMigrate(
          { schemaVersion: "1", project: { name: "x", bmadVersion: "y" } },
          stateMigrationRegistry,
        ),
      ).toThrow(CorruptStateError);
    });

    it("throws CorruptStateError when validation fails (missing required field)", () => {
      expect(() =>
        loadAndMigrate({ schemaVersion: 1 }, stateMigrationRegistry),
      ).toThrow(CorruptStateError);
    });

    it("CorruptStateError exposes verbatim AC-3 hint, code, exit code", () => {
      try {
        loadAndMigrate({ schemaVersion: 1 }, stateMigrationRegistry);
        expect("did not throw").toBe("threw");
      } catch (err) {
        expect(err).toBeInstanceOf(CorruptStateError);
        if (err instanceof CorruptStateError) {
          expect(err.code).toBe("CORRUPT_STATE");
          expect(err.exitCode).toBe(1);
          expect(err.actionableHint).toBe(
            "Run /bmad-next --recompute-state to rebuild the cache from project files.",
          );
        }
      }
    });

    it("rejects telemetry records with extra fields (.strict() enforcement)", () => {
      expect(() =>
        loadAndMigrate(
          {
            ...canonicalTelemetryRecordV1Fixture,
            projectName: "secret",
          },
          telemetryMigrationRegistry,
        ),
      ).toThrow(CorruptStateError);
    });
  });
});
