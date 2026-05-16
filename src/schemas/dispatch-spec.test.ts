/**
 * src/schemas/dispatch-spec.test.ts — Unit tests for `DispatchSpecV1Schema`
 * (AC-1).
 *
 * Coverage:
 *   - Positive parse of the canonical fixture.
 *   - Missing required field (`runId`).
 *   - Wrong field type (`epic: "3"` fails — must be number).
 *
 * Also exports `canonicalDispatchSpecV1Fixture` for cross-file reuse by
 * `migration.test.ts`.
 */

import { describe, expect, it } from "bun:test";
import { type DispatchSpecV1, DispatchSpecV1Schema } from "./dispatch-spec.ts";

export const canonicalDispatchSpecV1Fixture = {
  schemaVersion: 1 as const,
  runId: "2026-04-30T120000Z-bmad-next",
  step: "bmad-dev-story",
  epic: 1,
  story: "1.5",
  model: "claude-opus-4-7",
  budget: { contextTokens: 200_000, timeoutMs: 1_800_000 },
  taskSpec: {
    persona: "bmad-dev-story",
    context: [],
    task: "implement story 1.5",
    outputFormat: { type: "markdown" },
    successCriteria: ["all tasks ticked"],
    constraints: { mutationScope: ["src/schemas/**"] },
  },
} satisfies DispatchSpecV1;

describe("DispatchSpecV1Schema", () => {
  it("parses the canonical dispatch spec v1 fixture", () => {
    const parsed = DispatchSpecV1Schema.parse(canonicalDispatchSpecV1Fixture);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.runId).toBe("2026-04-30T120000Z-bmad-next");
    expect(parsed.budget.contextTokens).toBe(200_000);
    expect(parsed.taskSpec.persona).toBe("bmad-dev-story");
    expect(parsed.taskSpec.successCriteria).toContain("all tasks ticked");
  });

  it("rejects when runId is absent", () => {
    const result = DispatchSpecV1Schema.safeParse({
      ...canonicalDispatchSpecV1Fixture,
      runId: undefined,
    });
    expect(result.success).toBe(false);
  });

  it("rejects when epic is a string instead of number", () => {
    const result = DispatchSpecV1Schema.safeParse({
      ...canonicalDispatchSpecV1Fixture,
      epic: "3",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when budget.timeoutMs is missing", () => {
    const result = DispatchSpecV1Schema.safeParse({
      ...canonicalDispatchSpecV1Fixture,
      budget: { contextTokens: 100 },
    });
    expect(result.success).toBe(false);
  });

  // ─── v0.2.1 — skillReference + personaReference (both optional) ──────────

  it("accepts taskSpec.skillReference when supplied (v0.2.1)", () => {
    const parsed = DispatchSpecV1Schema.parse({
      ...canonicalDispatchSpecV1Fixture,
      taskSpec: {
        ...canonicalDispatchSpecV1Fixture.taskSpec,
        skillReference: "/abs/path/to/skills/bmad-brainstorming/SKILL.md",
      },
    });
    expect(parsed.taskSpec.skillReference).toBe(
      "/abs/path/to/skills/bmad-brainstorming/SKILL.md",
    );
  });

  it("accepts taskSpec.personaReference when supplied (v0.2.1)", () => {
    const parsed = DispatchSpecV1Schema.parse({
      ...canonicalDispatchSpecV1Fixture,
      taskSpec: {
        ...canonicalDispatchSpecV1Fixture.taskSpec,
        personaReference: "/abs/path/to/skills/bmad-agent-analyst/SKILL.md",
      },
    });
    expect(parsed.taskSpec.personaReference).toBe(
      "/abs/path/to/skills/bmad-agent-analyst/SKILL.md",
    );
  });

  it("accepts the canonical fixture WITHOUT either reference (back-compat)", () => {
    const parsed = DispatchSpecV1Schema.parse(canonicalDispatchSpecV1Fixture);
    expect(parsed.taskSpec.skillReference).toBeUndefined();
    expect(parsed.taskSpec.personaReference).toBeUndefined();
  });

  it("rejects when taskSpec.skillReference is a non-string (number)", () => {
    const result = DispatchSpecV1Schema.safeParse({
      ...canonicalDispatchSpecV1Fixture,
      taskSpec: {
        ...canonicalDispatchSpecV1Fixture.taskSpec,
        skillReference: 42,
      },
    });
    expect(result.success).toBe(false);
  });
});
