/**
 * src/schemas/run-log.test.ts — Unit tests for `RunLogV1Schema` (AC-1).
 *
 * Coverage:
 *   - Positive parse of the canonical fixture.
 *   - Missing required field (`runId`).
 *   - Wrong field type (`durationMs: "100"` fails).
 *   - Default `errors: []` applied when omitted.
 *
 * Also exports `canonicalRunLogV1Fixture` for cross-file reuse by
 * `migration.test.ts`.
 */

import { describe, expect, it } from "bun:test";
import { type RunLogV1, RunLogV1Schema } from "./run-log.ts";

export const canonicalRunLogV1Fixture = {
  schemaVersion: 1 as const,
  ts: "2026-04-30T12:00:00.000Z",
  runId: "2026-04-30T120000Z-bmad-next",
  step: "bmad-dev-story",
} satisfies Pick<RunLogV1, "schemaVersion" | "ts" | "runId" | "step">;

describe("RunLogV1Schema", () => {
  it("parses the canonical run-log v1 fixture", () => {
    const parsed = RunLogV1Schema.parse(canonicalRunLogV1Fixture);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.runId).toBe("2026-04-30T120000Z-bmad-next");
    expect(parsed.step).toBe("bmad-dev-story");
    // Default applied.
    expect(parsed.errors).toEqual([]);
  });

  it("rejects when runId is absent", () => {
    const result = RunLogV1Schema.safeParse({
      schemaVersion: 1,
      ts: "2026-04-30T12:00:00.000Z",
      step: "bmad-dev-story",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when durationMs is a string instead of number", () => {
    const result = RunLogV1Schema.safeParse({
      ...canonicalRunLogV1Fixture,
      durationMs: "100",
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional fields populated and validates types", () => {
    const parsed = RunLogV1Schema.parse({
      ...canonicalRunLogV1Fixture,
      epic: 1,
      story: "1.5",
      phase: "implementation",
      persona: "bmad-dev-story",
      model: "claude-opus-4-7",
      durationMs: 1234,
      tokensIn: 100,
      tokensOut: 200,
    });
    expect(parsed.epic).toBe(1);
    expect(parsed.story).toBe("1.5");
    expect(parsed.tokensIn).toBe(100);
    expect(parsed.tokensOut).toBe(200);
  });

  it("accepts nullable optional fields set to null", () => {
    const parsed = RunLogV1Schema.parse({
      ...canonicalRunLogV1Fixture,
      epic: null,
      story: null,
      phase: null,
      durationMs: null,
    });
    expect(parsed.epic).toBeNull();
    expect(parsed.story).toBeNull();
  });
});
