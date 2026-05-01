/**
 * src/runs/build-run-log.test.ts — Colocated unit tests for the pure JSON
 * builder (Story 2.5 AC-2 / Task 6).
 *
 * AR35 pattern: Bun's built-in test runner; pure-function tests with no IO.
 *
 * Coverage map (Task 6 from story spec):
 *   - 6.3 AC-2 builder shape — every required RunLogV1 field populated.
 *   - 6.4 Schema round-trip — RunLogV1Schema.parse(buildRunLog(...)) succeeds.
 *   - 6.5 errors[] override — passes through to result.
 *   - 6.6 errors[] default — omitted input → result.errors === [].
 *   - 6.7 Nullable fields propagate AND round-trip.
 *   - 6.8 Pure-function determinism — two calls with same input yield equal results.
 */

import { describe, expect, it } from "bun:test";
import { RunLogV1Schema } from "../schemas/run-log.ts";
import { buildRunLog } from "./build-run-log.ts";
import type { TranscriptInput } from "./types.ts";

/**
 * Canonical fixture — analogous to `canonicalRunLogV1Fixture` in
 * `src/schemas/run-log.test.ts:17-22`. Story 2.5 supersets the v1 fields
 * with the markdown-rendering inputs.
 */
function canonicalTranscriptInput(
  overrides: Partial<TranscriptInput> = {},
): TranscriptInput {
  return {
    runId: "2026-04-29T10-15-00-bmad-create-prd-abc12",
    stepName: "bmad-create-prd",
    epic: 1,
    story: "1.1",
    phase: "planning",
    persona: "pm",
    model: "sonnet",
    budget: { contextTokens: 60000, timeoutMs: 300000 },
    inputs: [{ path: "docs/brief.md", label: "Brief" }],
    subAgentPrompt: "PERSONA: pm\nTASK: write PRD",
    subAgentOutput: "PRD body content",
    verifierResult: {
      status: "pass",
      checks: [{ name: "requiredFiles", status: "pass", detail: "ok" }],
      promotedTo: "_bmad-output/planning-artifacts/prd.md",
    },
    stateBefore: { lastSuccessfulStep: null, lastAttempted: null },
    stateAfter: {
      lastSuccessfulStep: "bmad-create-prd",
      lastAttempted: null,
    },
    outcome: "✓ Promoted from staging/<runId>/ to canonical location.",
    durationMs: 1234,
    tokensIn: 100,
    tokensOut: 200,
    nowIso: "2026-04-29T10:15:00.000Z",
    ...overrides,
  };
}

describe("buildRunLog — AC-2 builder shape", () => {
  it("returns a RunLogV1 literal with every required field populated", () => {
    const result = buildRunLog(canonicalTranscriptInput());
    expect(result.schemaVersion).toBe(1);
    expect(result.runId).toBe("2026-04-29T10-15-00-bmad-create-prd-abc12");
    expect(result.step).toBe("bmad-create-prd");
    expect(result.epic).toBe(1);
    expect(result.story).toBe("1.1");
    expect(result.phase).toBe("planning");
    expect(result.persona).toBe("pm");
    expect(result.model).toBe("sonnet");
    expect(result.durationMs).toBe(1234);
    expect(result.tokensIn).toBe(100);
    expect(result.tokensOut).toBe(200);
    expect(result.ts).toBe("2026-04-29T10:15:00.000Z");
    expect(result.errors).toEqual([]);
  });

  it("uses input.nowIso for ts when supplied", () => {
    const result = buildRunLog(
      canonicalTranscriptInput({ nowIso: "2030-01-01T00:00:00.000Z" }),
    );
    expect(result.ts).toBe("2030-01-01T00:00:00.000Z");
  });

  it("falls back to current ISO when nowIso is omitted", () => {
    const input = canonicalTranscriptInput();
    const stripped: TranscriptInput = {
      runId: input.runId,
      stepName: input.stepName,
      epic: input.epic,
      story: input.story,
      phase: input.phase,
      persona: input.persona,
      model: input.model,
      budget: input.budget,
      inputs: input.inputs,
      subAgentPrompt: input.subAgentPrompt,
      subAgentOutput: input.subAgentOutput,
      verifierResult: input.verifierResult,
      stateBefore: input.stateBefore,
      stateAfter: input.stateAfter,
      outcome: input.outcome,
      durationMs: input.durationMs,
      tokensIn: input.tokensIn,
      tokensOut: input.tokensOut,
    };
    const result = buildRunLog(stripped);
    // ISO format YYYY-MM-DDTHH:MM:SS.sssZ — verify it parses to a Date.
    expect(Number.isNaN(Date.parse(result.ts))).toBe(false);
  });
});

describe("buildRunLog — schema round-trip (AC-2)", () => {
  it("RunLogV1Schema.parse round-trip succeeds for the canonical fixture", () => {
    const built = buildRunLog(canonicalTranscriptInput());
    expect(() => RunLogV1Schema.parse(built)).not.toThrow();
    const parsed = RunLogV1Schema.parse(built);
    expect(parsed).toEqual(built);
  });
});

describe("buildRunLog — errors[] handling", () => {
  it("propagates input.errors[] verbatim", () => {
    const errors = [
      { code: "TEST_ERROR", message: "test failure" },
      { code: "SECOND_ERROR", message: "another" },
    ];
    const result = buildRunLog(canonicalTranscriptInput({ errors }));
    expect(result.errors).toEqual(errors);
  });

  it("defaults errors[] to [] when input.errors is undefined", () => {
    const input = canonicalTranscriptInput();
    expect(input.errors).toBeUndefined();
    const result = buildRunLog(input);
    expect(result.errors).toEqual([]);
  });
});

describe("buildRunLog — nullable fields", () => {
  it("propagates null epic/story/phase/persona/model/budget AND round-trips through schema", () => {
    const input = canonicalTranscriptInput({
      epic: null,
      story: null,
      phase: null,
      persona: null,
      model: null,
      budget: null,
    });
    const result = buildRunLog(input);
    expect(result.epic).toBeNull();
    expect(result.story).toBeNull();
    expect(result.phase).toBeNull();
    expect(result.persona).toBeNull();
    expect(result.model).toBeNull();
    expect(result.budget).toBeNull();
    // Schema accepts these as nullable optional.
    expect(() => RunLogV1Schema.parse(result)).not.toThrow();
  });
});

describe("buildRunLog — purity / determinism", () => {
  it("two calls with the same input yield deeply-equal results", () => {
    const input = canonicalTranscriptInput();
    const a = buildRunLog(input);
    const b = buildRunLog(input);
    expect(a).toEqual(b);
  });
});
