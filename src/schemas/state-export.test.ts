/**
 * src/schemas/state-export.test.ts — colocated schema tests for the
 * `--export-state` JSON wire shape v1 (Story 3.8 Task 8.3; FR4, AR20, AR42).
 *
 * Coverage map:
 *   - Test A: a valid `StateExportV1` shape passes `.parse()`.
 *   - Test B: missing `schemaVersion` rejects.
 *   - Test C: round-trip via `JSON.stringify` → `JSON.parse` → `.parse()`
 *             yields a byte-equal value (defence-in-depth contract).
 */

import { describe, expect, it } from "bun:test";
import {
  StateExportLatestSchema,
  type StateExportV1,
  StateExportV1Schema,
} from "./state-export.ts";

describe("StateExportV1Schema — Story 3.8 Task 8.3", () => {
  it("Test A — valid full shape passes parse", () => {
    const value: StateExportV1 = {
      schemaVersion: 1,
      currentPhase: "implementation",
      activeEpic: 3,
      lastSuccessfulStep: {
        step: "dev-story",
        epic: 3,
        story: "3.8",
        completedAt: "2026-05-01T12:00:00Z",
      },
      lastAttempted: {
        step: "code-review",
        epic: 3,
        story: "3.8",
        attemptedAt: "2026-05-01T12:30:00Z",
      },
      lastFailureReason: null,
      bmadVersion: "6.5.0",
      stepperVersion: "0.1.0",
    };
    const parsed = StateExportV1Schema.parse(value);
    expect(parsed).toEqual(value);
    // Latest alias points at v1 in v0.1.
    expect(StateExportLatestSchema).toBe(StateExportV1Schema);
  });

  it("Test A.1 — minimal shape with all-null optional fields passes parse", () => {
    const value: StateExportV1 = {
      schemaVersion: 1,
      currentPhase: null,
      activeEpic: null,
      lastSuccessfulStep: null,
      lastAttempted: null,
      lastFailureReason: null,
      bmadVersion: "unknown",
      stepperVersion: "0.1.0",
    };
    const parsed = StateExportV1Schema.parse(value);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.currentPhase).toBeNull();
    expect(parsed.activeEpic).toBeNull();
    expect(parsed.lastSuccessfulStep).toBeNull();
    expect(parsed.bmadVersion).toBe("unknown");
  });

  it("Test B — missing schemaVersion rejects", () => {
    const value = {
      // no schemaVersion
      currentPhase: null,
      activeEpic: null,
      lastSuccessfulStep: null,
      lastAttempted: null,
      lastFailureReason: null,
      bmadVersion: "6.5.0",
      stepperVersion: "0.1.0",
    };
    const result = StateExportV1Schema.safeParse(value);
    expect(result.success).toBe(false);
  });

  it("Test B.1 — wrong schemaVersion rejects (literal(1))", () => {
    const value = {
      schemaVersion: 2,
      currentPhase: null,
      activeEpic: null,
      lastSuccessfulStep: null,
      lastAttempted: null,
      lastFailureReason: null,
      bmadVersion: "6.5.0",
      stepperVersion: "0.1.0",
    };
    const result = StateExportV1Schema.safeParse(value);
    expect(result.success).toBe(false);
  });

  it("Test C — round-trip JSON.stringify → JSON.parse → schema parse", () => {
    const value: StateExportV1 = {
      schemaVersion: 1,
      currentPhase: "planning",
      activeEpic: 1,
      lastSuccessfulStep: {
        step: "bmad-create-prd",
        epic: 1,
        story: "1.5",
        completedAt: "2026-04-30T12:00:00Z",
      },
      lastAttempted: null,
      lastFailureReason: {
        code: "VERIFIER_FAILURE",
        message: "frontmatter required-section missing: status",
        hint: "Add `status: complete` to the frontmatter and re-run.",
        runId: "2026-04-30T12-30-00Z-bmad-next",
      },
      bmadVersion: "6.5.0",
      stepperVersion: "0.1.0",
    };
    const serialised = JSON.stringify(value);
    const back = JSON.parse(serialised) as unknown;
    const reparsed = StateExportV1Schema.parse(back);
    expect(reparsed).toEqual(value);
  });
});
