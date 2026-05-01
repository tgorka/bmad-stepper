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
import { type StateV1, StateV1Schema } from "./state.ts";

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
