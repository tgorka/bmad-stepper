/**
 * src/schemas/state.test.ts — Unit tests for `StateV1Schema` (AC-1).
 *
 * Coverage:
 *   - Positive parse of the canonical fixture.
 *   - Missing required field (`schemaVersion`).
 *   - Wrong `schemaVersion` literal (`2` rejected; `z.literal(1)`).
 *   - Wrong field type at depth (`project.bmadVersion: 6` rejected).
 *   - Optional fields omitted.
 *   - `checkpoints` / `runHistory` boundary (max 50 / 100).
 *
 * Also exports `canonicalStateV1Fixture` for cross-file reuse by
 * `migration.test.ts` (architecture §D8 idempotency harness fixture).
 */

import { describe, expect, it } from "bun:test";
import {
  LastAttemptedSchema,
  LastFailureReasonSchema,
  type StateV1,
  StateV1Schema,
} from "./state.ts";

export const canonicalStateV1Fixture = {
  schemaVersion: 1 as const,
  project: { name: "bmad-stepper", bmadVersion: "6.5.0.1" },
} satisfies Pick<StateV1, "schemaVersion" | "project">;

describe("StateV1Schema", () => {
  it("parses the canonical state v1 fixture", () => {
    const parsed = StateV1Schema.parse(canonicalStateV1Fixture);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.project.name).toBe("bmad-stepper");
    expect(parsed.project.bmadVersion).toBe("6.5.0.1");
    // Defaults applied by Zod.
    expect(parsed.checkpoints).toEqual([]);
    expect(parsed.runHistory).toEqual([]);
  });

  it("rejects when schemaVersion is absent", () => {
    const result = StateV1Schema.safeParse({
      project: { name: "x", bmadVersion: "y" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects when schemaVersion is 2 (literal(1))", () => {
    const result = StateV1Schema.safeParse({
      schemaVersion: 2,
      project: { name: "x", bmadVersion: "y" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects when project.bmadVersion is a number", () => {
    const result = StateV1Schema.safeParse({
      schemaVersion: 1,
      project: { name: "x", bmadVersion: 6 },
    });
    expect(result.success).toBe(false);
  });

  it("accepts when optional fields are absent (defaults applied)", () => {
    const parsed = StateV1Schema.parse({
      schemaVersion: 1,
      project: { name: "x", bmadVersion: "y" },
    });
    expect(parsed.lastSuccessfulStep).toBeUndefined();
    expect(parsed.lastAttempted).toBeUndefined();
    expect(parsed.lastFailureReason).toBeUndefined();
    expect(parsed.lastSnapshot).toBeUndefined();
    expect(parsed.checkpoints).toEqual([]);
    expect(parsed.runHistory).toEqual([]);
  });

  it("accepts checkpoints arrays of size 50 (FIFO upper bound)", () => {
    const parsed = StateV1Schema.parse({
      schemaVersion: 1,
      project: { name: "x", bmadVersion: "y" },
      checkpoints: new Array(50).fill({}),
    });
    expect(parsed.checkpoints).toHaveLength(50);
  });

  it("rejects checkpoints arrays of size 51 (FIFO upper bound exceeded)", () => {
    const result = StateV1Schema.safeParse({
      schemaVersion: 1,
      project: { name: "x", bmadVersion: "y" },
      checkpoints: new Array(51).fill({}),
    });
    expect(result.success).toBe(false);
  });

  it("rejects runHistory arrays of size 101 (FIFO upper bound exceeded)", () => {
    const result = StateV1Schema.safeParse({
      schemaVersion: 1,
      project: { name: "x", bmadVersion: "y" },
      runHistory: new Array(101).fill({}),
    });
    expect(result.success).toBe(false);
  });
});

// ─── Story 3.1 — named-schema extraction (LastAttemptedSchema + LastFailureReasonSchema) ───

describe("LastAttemptedSchema + LastFailureReasonSchema (Story 3.1 named extraction)", () => {
  it("LastAttemptedSchema parses the canonical lastAttempted shape", () => {
    const parsed = LastAttemptedSchema.parse({
      step: "bmad-create-architecture",
      epic: 1,
      story: "1.1",
      attemptedAt: "2026-04-30T10:00:00Z",
    });
    expect(parsed.step).toBe("bmad-create-architecture");
    expect(parsed.epic).toBe(1);
    expect(parsed.story).toBe("1.1");
    expect(parsed.attemptedAt).toBe("2026-04-30T10:00:00Z");
  });

  it("LastFailureReasonSchema parses the canonical lastFailureReason shape", () => {
    const parsed = LastFailureReasonSchema.parse({
      code: "VERIFIER_FAILURE",
      message: "verifier rejected the artifact",
      hint: "See _bmad-output/.stepper/runs/<ts>-<step>.log for the verifier output; try /bmad-next --resume after fixing the underlying issue.",
      runId: "2026-04-30T10-00-00-bmad-create-architecture-abc12",
    });
    expect(parsed.code).toBe("VERIFIER_FAILURE");
    expect(parsed.message).toContain("verifier rejected");
    expect(parsed.hint).toContain("/bmad-next");
    expect(parsed.runId).toContain("bmad-create-architecture");
  });

  it("StateV1Schema accepts the extracted lastAttempted shape inline (wire-compatible)", () => {
    const parsed = StateV1Schema.parse({
      schemaVersion: 1,
      project: { name: "x", bmadVersion: "y" },
      lastAttempted: {
        step: "z",
        epic: 1,
        story: "1.1",
        attemptedAt: "2026-04-30T00:00:00Z",
      },
    });
    expect(parsed.lastAttempted?.step).toBe("z");
    expect(parsed.lastAttempted?.epic).toBe(1);
  });

  it("StateV1Schema accepts the extracted lastFailureReason shape inline (wire-compatible)", () => {
    const parsed = StateV1Schema.parse({
      schemaVersion: 1,
      project: { name: "x", bmadVersion: "y" },
      lastFailureReason: {
        code: "TIMEOUT",
        message: "exceeded budget",
        hint: "Run /bmad-next --resume to retry.",
        runId: "abc",
      },
    });
    expect(parsed.lastFailureReason?.code).toBe("TIMEOUT");
  });

  it("StateV1Schema accepts both lastAttempted=null and lastFailureReason=null (clean exit)", () => {
    const parsed = StateV1Schema.parse({
      schemaVersion: 1,
      project: { name: "x", bmadVersion: "y" },
      lastAttempted: null,
      lastFailureReason: null,
    });
    expect(parsed.lastAttempted).toBeNull();
    expect(parsed.lastFailureReason).toBeNull();
  });

  it("LastAttemptedSchema rejects when required fields are missing", () => {
    const result = LastAttemptedSchema.safeParse({ step: "x" });
    expect(result.success).toBe(false);
  });

  it("LastFailureReasonSchema rejects when required fields are missing", () => {
    const result = LastFailureReasonSchema.safeParse({ code: "x" });
    expect(result.success).toBe(false);
  });
});
