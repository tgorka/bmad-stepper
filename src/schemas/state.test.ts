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
  CheckpointEntrySchema,
  LastAttemptedSchema,
  LastFailureReasonSchema,
  RunHistoryEntrySchema,
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
    const validEntry = {
      branch: "main",
      sha: "abc1234567890abcdef1234567890abcdef12345",
      takenAt: "2026-05-04T00:00:00Z",
      stepType: "implementation" as const,
    };
    const parsed = StateV1Schema.parse({
      schemaVersion: 1,
      project: { name: "x", bmadVersion: "y" },
      checkpoints: new Array(50).fill(validEntry),
    });
    expect(parsed.checkpoints).toHaveLength(50);
  });

  it("rejects checkpoints arrays of size 51 (FIFO upper bound exceeded)", () => {
    const validEntry = {
      branch: "main",
      sha: "abc1234567890abcdef1234567890abcdef12345",
      takenAt: "2026-05-04T00:00:00Z",
      stepType: "implementation" as const,
    };
    const result = StateV1Schema.safeParse({
      schemaVersion: 1,
      project: { name: "x", bmadVersion: "y" },
      checkpoints: new Array(51).fill(validEntry),
    });
    expect(result.success).toBe(false);
  });

  it("rejects runHistory arrays of size 101 (FIFO upper bound exceeded)", () => {
    // Story 5.1: tightened to z.array(RunHistoryEntrySchema) — entries
    // must validate against the typed schema. Use 101 valid entries to
    // verify the cap rejects, not the per-entry shape.
    const validRunHistoryEntry = {
      runId: "r-1",
      step: "bmad-dev-story",
      epic: 1,
      story: "1.1",
      attemptNumber: 1,
      outcome: "pass" as const,
      failureCode: null,
      completedAt: "2026-05-04T19:57:50Z",
    };
    const result = StateV1Schema.safeParse({
      schemaVersion: 1,
      project: { name: "x", bmadVersion: "y" },
      runHistory: new Array(101).fill(validRunHistoryEntry),
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

// ─── Story 4.8 — CheckpointEntrySchema (typed checkpoints[] entries) ──────

describe("CheckpointEntrySchema (Story 4.8 — AR13 Layer 1 typed entry)", () => {
  const validEntry = {
    branch: "main",
    sha: "abc1234567890abcdef1234567890abcdef12345",
    takenAt: "2026-05-04T00:00:00Z",
    stepType: "implementation" as const,
  };

  it("accepts a valid entry with all 4 fields populated", () => {
    const parsed = CheckpointEntrySchema.parse(validEntry);
    expect(parsed.branch).toBe("main");
    expect(parsed.sha).toBe("abc1234567890abcdef1234567890abcdef12345");
    expect(parsed.takenAt).toBe("2026-05-04T00:00:00Z");
    expect(parsed.stepType).toBe("implementation");
  });

  it("accepts each of the 5 valid stepType values", () => {
    for (const stepType of [
      "analysis",
      "planning",
      "solutioning",
      "implementation",
      "retro",
    ] as const) {
      const parsed = CheckpointEntrySchema.parse({
        ...validEntry,
        stepType,
      });
      expect(parsed.stepType).toBe(stepType);
    }
  });

  it("rejects an entry missing the stepType field", () => {
    const { stepType: _stepType, ...rest } = validEntry;
    const result = CheckpointEntrySchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects an entry with an unknown stepType (e.g. "story" — legacy)', () => {
    const result = CheckpointEntrySchema.safeParse({
      ...validEntry,
      stepType: "story",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an entry with a non-string branch", () => {
    const result = CheckpointEntrySchema.safeParse({
      ...validEntry,
      branch: 42,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an entry with a non-string sha", () => {
    const result = CheckpointEntrySchema.safeParse({
      ...validEntry,
      sha: 42,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an entry with a non-string takenAt", () => {
    const result = CheckpointEntrySchema.safeParse({
      ...validEntry,
      takenAt: 42,
    });
    expect(result.success).toBe(false);
  });

  it("accepts the literal HEAD branch (detached-HEAD repos per Story 1.8)", () => {
    const parsed = CheckpointEntrySchema.parse({
      ...validEntry,
      branch: "HEAD",
    });
    expect(parsed.branch).toBe("HEAD");
  });
});

describe("StateV1Schema.checkpoints — Story 4.8 typed entries", () => {
  const validEntry = {
    branch: "main",
    sha: "abc1234567890abcdef1234567890abcdef12345",
    takenAt: "2026-05-04T00:00:00Z",
    stepType: "implementation" as const,
  };

  it("accepts state with empty checkpoints[] (preserves the .default([]))", () => {
    const parsed = StateV1Schema.parse({
      schemaVersion: 1,
      project: { name: "x", bmadVersion: "y" },
    });
    expect(parsed.checkpoints).toEqual([]);
  });

  it("accepts state with one valid checkpoint entry", () => {
    const parsed = StateV1Schema.parse({
      schemaVersion: 1,
      project: { name: "x", bmadVersion: "y" },
      checkpoints: [validEntry],
    });
    expect(parsed.checkpoints).toHaveLength(1);
    expect(parsed.checkpoints[0]?.stepType).toBe("implementation");
  });

  it("rejects state with one INVALID checkpoint entry (legacy stepType)", () => {
    const result = StateV1Schema.safeParse({
      schemaVersion: 1,
      project: { name: "x", bmadVersion: "y" },
      checkpoints: [{ ...validEntry, stepType: "story" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects state with one INVALID checkpoint entry (missing field)", () => {
    const result = StateV1Schema.safeParse({
      schemaVersion: 1,
      project: { name: "x", bmadVersion: "y" },
      checkpoints: [{ branch: "main" }],
    });
    expect(result.success).toBe(false);
  });
});

// ─── Story 5.1 — RunHistoryEntrySchema (typed runHistory[] entries) ───────

describe("RunHistoryEntrySchema (Story 5.1 — Epic 5 retry mode typed entry)", () => {
  const validRunHistoryEntry = {
    runId: "2026-05-04T19-57-50-bmad-dev-story-abc12",
    step: "bmad-dev-story",
    epic: 5,
    story: "5.1",
    attemptNumber: 1,
    outcome: "pass" as const,
    failureCode: null,
    completedAt: "2026-05-04T19:57:50Z",
  };

  it("RHS_1: accepts a valid entry with all 8 fields populated", () => {
    const parsed = RunHistoryEntrySchema.parse(validRunHistoryEntry);
    expect(parsed.runId).toBe("2026-05-04T19-57-50-bmad-dev-story-abc12");
    expect(parsed.step).toBe("bmad-dev-story");
    expect(parsed.epic).toBe(5);
    expect(parsed.story).toBe("5.1");
    expect(parsed.attemptNumber).toBe(1);
    expect(parsed.outcome).toBe("pass");
    expect(parsed.failureCode).toBeNull();
    expect(parsed.completedAt).toBe("2026-05-04T19:57:50Z");
  });

  it("RHS_2: rejects an entry missing required fields", () => {
    const { runId: _runId, ...rest } = validRunHistoryEntry;
    const result = RunHistoryEntrySchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("RHS_3: rejects attemptNumber=0 (.min(1) violation)", () => {
    const result = RunHistoryEntrySchema.safeParse({
      ...validRunHistoryEntry,
      attemptNumber: 0,
    });
    expect(result.success).toBe(false);
  });

  it("RHS_4: rejects attemptNumber=-1 (.min(1) violation)", () => {
    const result = RunHistoryEntrySchema.safeParse({
      ...validRunHistoryEntry,
      attemptNumber: -1,
    });
    expect(result.success).toBe(false);
  });

  it("RHS_5: accepts attemptNumber=1 (boundary)", () => {
    const parsed = RunHistoryEntrySchema.parse({
      ...validRunHistoryEntry,
      attemptNumber: 1,
    });
    expect(parsed.attemptNumber).toBe(1);
  });

  it("RHS_6: rejects attemptNumber=1.5 (.int() violation)", () => {
    const result = RunHistoryEntrySchema.safeParse({
      ...validRunHistoryEntry,
      attemptNumber: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it("RHS_7: rejects unknown outcome value", () => {
    const result = RunHistoryEntrySchema.safeParse({
      ...validRunHistoryEntry,
      outcome: "unknown",
    });
    expect(result.success).toBe(false);
  });

  it("RHS_8: accepts outcome='fail' with non-null failureCode", () => {
    const parsed = RunHistoryEntrySchema.parse({
      ...validRunHistoryEntry,
      outcome: "fail",
      failureCode: "VERIFIER_FAILURE",
    });
    expect(parsed.outcome).toBe("fail");
    expect(parsed.failureCode).toBe("VERIFIER_FAILURE");
  });

  it("RHS_9: accepts outcome='pass' with failureCode=null", () => {
    const parsed = RunHistoryEntrySchema.parse({
      ...validRunHistoryEntry,
      outcome: "pass",
      failureCode: null,
    });
    expect(parsed.outcome).toBe("pass");
    expect(parsed.failureCode).toBeNull();
  });

  it("RHS_10: rejects failureCode=42 (non-string, non-null)", () => {
    const result = RunHistoryEntrySchema.safeParse({
      ...validRunHistoryEntry,
      failureCode: 42,
    });
    expect(result.success).toBe(false);
  });
});

describe("StateV1Schema.runHistory — Story 5.1 typed entries", () => {
  const validRunHistoryEntry = {
    runId: "2026-05-04T19-57-50-bmad-dev-story-abc12",
    step: "bmad-dev-story",
    epic: 5,
    story: "5.1",
    attemptNumber: 1,
    outcome: "pass" as const,
    failureCode: null,
    completedAt: "2026-05-04T19:57:50Z",
  };

  it("accepts state with empty runHistory[] (preserves the .default([]))", () => {
    const parsed = StateV1Schema.parse({
      schemaVersion: 1,
      project: { name: "x", bmadVersion: "y" },
    });
    expect(parsed.runHistory).toEqual([]);
  });

  it("accepts state with one valid runHistory entry", () => {
    const parsed = StateV1Schema.parse({
      schemaVersion: 1,
      project: { name: "x", bmadVersion: "y" },
      runHistory: [validRunHistoryEntry],
    });
    expect(parsed.runHistory).toHaveLength(1);
    expect(parsed.runHistory[0]?.attemptNumber).toBe(1);
  });

  it("accepts state with mixed pass/fail runHistory entries (3 attempts)", () => {
    const parsed = StateV1Schema.parse({
      schemaVersion: 1,
      project: { name: "x", bmadVersion: "y" },
      runHistory: [
        {
          ...validRunHistoryEntry,
          attemptNumber: 1,
          outcome: "fail",
          failureCode: "VERIFIER_FAILURE",
        },
        {
          ...validRunHistoryEntry,
          attemptNumber: 2,
          outcome: "fail",
          failureCode: "VERIFIER_FAILURE",
        },
        {
          ...validRunHistoryEntry,
          attemptNumber: 3,
          outcome: "pass",
          failureCode: null,
        },
      ],
    });
    expect(parsed.runHistory).toHaveLength(3);
    expect(parsed.runHistory[0]?.outcome).toBe("fail");
    expect(parsed.runHistory[2]?.outcome).toBe("pass");
  });

  it("accepts runHistory of size 100 (FIFO upper bound)", () => {
    const parsed = StateV1Schema.parse({
      schemaVersion: 1,
      project: { name: "x", bmadVersion: "y" },
      runHistory: new Array(100).fill(validRunHistoryEntry),
    });
    expect(parsed.runHistory).toHaveLength(100);
  });

  it("rejects state with one INVALID runHistory entry (legacy untyped object)", () => {
    const result = StateV1Schema.safeParse({
      schemaVersion: 1,
      project: { name: "x", bmadVersion: "y" },
      runHistory: [{ verifierStatus: "pass" }],
    });
    expect(result.success).toBe(false);
  });
});

// ─── Story 5.2 — RunHistoryEntrySchema.skipped optional field (SK_52_RHS_*) ───

describe("RunHistoryEntrySchema (Story 5.2 — skip marker SK_52_RHS_*)", () => {
  const baseEntry = {
    runId: "2026-05-04T20-00-00-bmad-dev-story-skipid",
    step: "bmad-dev-story",
    epic: 5,
    story: "5.2",
    attemptNumber: 1,
    outcome: "pass" as const,
    failureCode: null,
    completedAt: "2026-05-04T20:00:00Z",
  };

  it("SK_52_RHS_1: accepts entry with skipped: true", () => {
    const parsed = RunHistoryEntrySchema.parse({
      ...baseEntry,
      skipped: true,
    });
    expect(parsed.skipped).toBe(true);
    // Outcome stays "pass" per the success-path-shape contract; the
    // skipped: true marker is the forensic record that the verifier
    // was bypassed.
    expect(parsed.outcome).toBe("pass");
  });

  it("SK_52_RHS_2: accepts entry with skipped: false", () => {
    const parsed = RunHistoryEntrySchema.parse({
      ...baseEntry,
      skipped: false,
    });
    expect(parsed.skipped).toBe(false);
  });

  it("SK_52_RHS_3: accepts entry with NO skipped field (undefined; back-compat)", () => {
    const parsed = RunHistoryEntrySchema.parse(baseEntry);
    // undefined-means-false per OQ-2 decision; readers check
    // `entry.skipped === true` (strict equality) to disambiguate.
    expect(parsed.skipped).toBeUndefined();
  });

  it('SK_52_RHS_4: rejects entry with skipped: "yes" (non-boolean)', () => {
    const result = RunHistoryEntrySchema.safeParse({
      ...baseEntry,
      skipped: "yes",
    });
    expect(result.success).toBe(false);
  });

  it("SK_52_RHS_5: StateV1Schema.runHistory[] with mixed entries (some skipped=true, some without) validates", () => {
    const parsed = StateV1Schema.parse({
      schemaVersion: 1,
      project: { name: "x", bmadVersion: "y" },
      runHistory: [
        // Genuine pass (no skipped field)
        baseEntry,
        // Skip-mode pass (skipped: true marker)
        {
          ...baseEntry,
          attemptNumber: 1,
          step: "bmad-code-review",
          skipped: true,
        },
        // Genuine pass (skipped: false)
        {
          ...baseEntry,
          attemptNumber: 1,
          step: "bmad-retrospective",
          skipped: false,
        },
      ],
    });
    expect(parsed.runHistory).toHaveLength(3);
    expect(parsed.runHistory[0]?.skipped).toBeUndefined();
    expect(parsed.runHistory[1]?.skipped).toBe(true);
    expect(parsed.runHistory[2]?.skipped).toBe(false);
  });
});

// ─── Story 5.3 — RunHistoryEntrySchema.fixAttempt optional field (RTF_53_RHS_*) ───

describe("RunHistoryEntrySchema (Story 5.3 — fix-attempt marker RTF_53_RHS_*)", () => {
  const baseEntry = {
    runId: "2026-05-04T22-56-12-bmad-dev-story-fixid",
    step: "bmad-dev-story",
    epic: 5,
    story: "5.3",
    attemptNumber: 1,
    outcome: "pass" as const,
    failureCode: null,
    completedAt: "2026-05-04T22:56:12Z",
  };

  it("RTF_53_RHS_1: accepts entry with fixAttempt: true", () => {
    const parsed = RunHistoryEntrySchema.parse({
      ...baseEntry,
      fixAttempt: true,
    });
    expect(parsed.fixAttempt).toBe(true);
    // Outcome can be either "pass" (post-fix verifier passed) or
    // "fail" (post-fix verifier failed per AC line 1099 escalate
    // path). Here the fixture is a "pass" — the success-path
    // construction site sets fixAttempt:true on the success entry.
    expect(parsed.outcome).toBe("pass");
  });

  it("RTF_53_RHS_2: accepts entry with fixAttempt: false", () => {
    const parsed = RunHistoryEntrySchema.parse({
      ...baseEntry,
      fixAttempt: false,
    });
    expect(parsed.fixAttempt).toBe(false);
  });

  it("RTF_53_RHS_3: accepts entry with NO fixAttempt field (undefined; back-compat)", () => {
    const parsed = RunHistoryEntrySchema.parse(baseEntry);
    // undefined-means-false per OQ-2 decision; readers check
    // `entry.fixAttempt === true` (strict equality) to disambiguate.
    expect(parsed.fixAttempt).toBeUndefined();
  });

  it('RTF_53_RHS_4: rejects entry with fixAttempt: "yes" (non-boolean)', () => {
    const result = RunHistoryEntrySchema.safeParse({
      ...baseEntry,
      fixAttempt: "yes",
    });
    expect(result.success).toBe(false);
  });

  it("RTF_53_RHS_5: StateV1Schema.runHistory[] with mixed entries (fixAttempt=true, skipped=true, neither) validates", () => {
    const parsed = StateV1Schema.parse({
      schemaVersion: 1,
      project: { name: "x", bmadVersion: "y" },
      runHistory: [
        // Genuine pass (no fixAttempt or skipped marker)
        baseEntry,
        // Skip-mode pass (skipped: true marker)
        {
          ...baseEntry,
          attemptNumber: 1,
          step: "bmad-code-review",
          skipped: true,
        },
        // Fix-mode pass (fixAttempt: true marker)
        {
          ...baseEntry,
          attemptNumber: 1,
          step: "bmad-retrospective",
          fixAttempt: true,
        },
        // Fix-mode fail (fixAttempt: true + outcome: "fail" per AC
        // line 1099 escalate path)
        {
          ...baseEntry,
          attemptNumber: 1,
          step: "bmad-create-story",
          outcome: "fail" as const,
          failureCode: "VERIFIER_FAILURE",
          fixAttempt: true,
        },
      ],
    });
    expect(parsed.runHistory).toHaveLength(4);
    expect(parsed.runHistory[0]?.fixAttempt).toBeUndefined();
    expect(parsed.runHistory[0]?.skipped).toBeUndefined();
    expect(parsed.runHistory[1]?.skipped).toBe(true);
    expect(parsed.runHistory[1]?.fixAttempt).toBeUndefined();
    expect(parsed.runHistory[2]?.fixAttempt).toBe(true);
    expect(parsed.runHistory[2]?.skipped).toBeUndefined();
    expect(parsed.runHistory[2]?.outcome).toBe("pass");
    expect(parsed.runHistory[3]?.fixAttempt).toBe(true);
    expect(parsed.runHistory[3]?.outcome).toBe("fail");
  });
});

// ─── Story 5.4 — LastFailureReasonSchema escalate-mode docs (ESC_54_LFR_*) ──

describe("LastFailureReasonSchema — Story 5.4 escalate-mode docs (ESC_54_LFR_*)", () => {
  /**
   * The AR22 actionable-hint regex (architecture line 589 + epics.md
   * §Story 5.4 AC line 1113). The schema does NOT enforce the regex; the
   * escalate handler enriches the hint value (see
   * src/failure-ux/escalate.ts). These tests verify the schema accepts
   * BOTH matching and non-matching hints (shape validation only).
   */
  const AR22_REGEX = /^.*(Run|See|Try|Check) /;

  it("ESC_54_LFR_1: accepts a hint matching the AR22 regex (PASS-THROUGH common case)", () => {
    const result = LastFailureReasonSchema.safeParse({
      code: "VERIFIER_FAILURE",
      message: "verifier failed",
      hint: "Run /bmad-next --resume to retry from the recorded failure.",
      runId: "2026-05-05T01-40-46-bmad-next-abc12",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(AR22_REGEX.test(result.data.hint)).toBe(true);
    }
  });

  it("ESC_54_LFR_2: accepts a hint NOT matching the AR22 regex (schema validates shape; handler enriches value)", () => {
    // The schema does NOT enforce the regex — that is the formal
    // escalateHandler's responsibility. The schema validates only the
    // FIELD SHAPE (presence + types). This test documents that contract.
    const result = LastFailureReasonSchema.safeParse({
      code: "VERIFIER_FAILURE",
      message: "verifier failed",
      hint: "raw failure no verb",
      runId: "abc",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(AR22_REGEX.test(result.data.hint)).toBe(false);
    }
  });

  it("ESC_54_LFR_3: validates the existing 4-field shape unchanged (back-compat with Story 1.6 + 3.1)", () => {
    const parsed = LastFailureReasonSchema.parse({
      code: "TIMEOUT",
      message: "exceeded budget",
      hint: "Run /bmad-next --resume to retry.",
      runId: "abc",
    });
    expect(Object.keys(parsed)).toEqual(["code", "message", "hint", "runId"]);
  });

  it("ESC_54_LFR_4: state.yaml round-trip with full lastFailureReason validates cleanly", () => {
    const yamlInput = {
      schemaVersion: 1,
      project: { name: "x", bmadVersion: "y" },
      lastFailureReason: {
        code: "VERIFIER_FAILURE",
        message: "verifier failed",
        hint: "Run /bmad-next --resume to retry from the recorded failure; see _bmad-output/.stepper/runs/2026-05-05T01-40-46-bmad-next-abc12/log.md for the failure detail.",
        runId: "2026-05-05T01-40-46-bmad-next-abc12",
      },
    };
    const parsed = StateV1Schema.parse(yamlInput);
    expect(parsed.lastFailureReason?.code).toBe("VERIFIER_FAILURE");
    expect(parsed.lastFailureReason?.runId).toContain(
      "2026-05-05T01-40-46-bmad-next-abc12",
    );
    expect(parsed.lastFailureReason?.hint).toContain("--resume");
  });

  it("ESC_54_LFR_5: state.yaml with lastFailureReason: null validates (back-compat)", () => {
    const parsed = StateV1Schema.parse({
      schemaVersion: 1,
      project: { name: "x", bmadVersion: "y" },
      lastFailureReason: null,
    });
    expect(parsed.lastFailureReason).toBeNull();
  });
});
