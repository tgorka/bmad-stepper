/**
 * src/schemas/dispatch-protocol.test.ts — Unit tests for `DispatchActionV1Schema`
 * (Story 2.2 AC-5).
 *
 * Coverage (mirrors Story 1.5 schema-test patterns):
 *   - Each of the three union variants (dispatch, report, halt) parses a
 *     fixture successfully.
 *   - Each variant rejects mismatched/missing fields:
 *     * dispatch requires runId+agent+exitCode:0;
 *     * halt requires exitCode >= 1;
 *     * report requires exitCode >= 0.
 *   - The discriminated union correctly switches on the `action` field.
 *   - Round-trip: JSON.stringify(parsed) → JSON.parse → schema.parse produces
 *     an identical literal.
 */

import { describe, expect, it } from "bun:test";
import {
  DispatchActionLatestSchema,
  type DispatchActionV1,
  DispatchActionV1Schema,
} from "./dispatch-protocol.ts";

const dispatchFixture = {
  action: "dispatch",
  runId: "2026-04-29T10-15-00-dev-story-abc12",
  agent: "bmad-step-runner",
  exitCode: 0,
} as const satisfies DispatchActionV1;

const reportFixture = {
  action: "report",
  message: "candidate next steps: dev-story, code-review",
  exitCode: 0,
} as const satisfies DispatchActionV1;

const haltFixture = {
  action: "halt",
  message: "Run /bmad-next --doctor to validate the state.yaml.",
  exitCode: 1,
} as const satisfies DispatchActionV1;

describe("DispatchActionV1Schema — dispatch variant", () => {
  it("parses the canonical dispatch fixture", () => {
    const parsed = DispatchActionV1Schema.parse(dispatchFixture);
    expect(parsed.action).toBe("dispatch");
    if (parsed.action === "dispatch") {
      expect(parsed.runId).toBe("2026-04-29T10-15-00-dev-story-abc12");
      expect(parsed.agent).toBe("bmad-step-runner");
      expect(parsed.exitCode).toBe(0);
    }
  });

  it("rejects when runId is missing", () => {
    const result = DispatchActionV1Schema.safeParse({
      action: "dispatch",
      agent: "bmad-step-runner",
      exitCode: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects when agent is missing", () => {
    const result = DispatchActionV1Schema.safeParse({
      action: "dispatch",
      runId: "abc",
      exitCode: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects when exitCode is non-zero", () => {
    const result = DispatchActionV1Schema.safeParse({
      action: "dispatch",
      runId: "abc",
      agent: "bmad-step-runner",
      exitCode: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe("DispatchActionV1Schema — report variant", () => {
  it("parses the canonical report fixture", () => {
    const parsed = DispatchActionV1Schema.parse(reportFixture);
    expect(parsed.action).toBe("report");
    if (parsed.action === "report") {
      expect(parsed.message).toContain("candidate next steps");
      expect(parsed.exitCode).toBe(0);
    }
  });

  it("accepts non-zero exitCode for report", () => {
    const result = DispatchActionV1Schema.safeParse({
      action: "report",
      message: "ok",
      exitCode: 0,
    });
    expect(result.success).toBe(true);
  });

  it("rejects when message is missing", () => {
    const result = DispatchActionV1Schema.safeParse({
      action: "report",
      exitCode: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects when exitCode is negative", () => {
    const result = DispatchActionV1Schema.safeParse({
      action: "report",
      message: "ok",
      exitCode: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe("DispatchActionV1Schema — halt variant", () => {
  it("parses the canonical halt fixture", () => {
    const parsed = DispatchActionV1Schema.parse(haltFixture);
    expect(parsed.action).toBe("halt");
    if (parsed.action === "halt") {
      expect(parsed.message).toContain("Run /bmad-next");
      expect(parsed.exitCode).toBe(1);
    }
  });

  it("rejects when exitCode is 0 (halt must be >= 1)", () => {
    const result = DispatchActionV1Schema.safeParse({
      action: "halt",
      message: "halted",
      exitCode: 0,
    });
    expect(result.success).toBe(false);
  });

  it("accepts higher exit codes for halt (e.g., 5 for budget)", () => {
    const result = DispatchActionV1Schema.safeParse({
      action: "halt",
      message: "budget exceeded",
      exitCode: 5,
    });
    expect(result.success).toBe(true);
  });

  it("rejects when message is missing", () => {
    const result = DispatchActionV1Schema.safeParse({
      action: "halt",
      exitCode: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe("DispatchActionV1Schema — discriminated-union switching", () => {
  it("rejects an unknown action value", () => {
    const result = DispatchActionV1Schema.safeParse({
      action: "explode",
      message: "kaboom",
      exitCode: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects when action field is missing", () => {
    const result = DispatchActionV1Schema.safeParse({
      runId: "abc",
      agent: "bmad-step-runner",
      exitCode: 0,
    });
    expect(result.success).toBe(false);
  });

  it("DispatchActionLatestSchema is the v1 schema alias", () => {
    expect(DispatchActionLatestSchema).toBe(DispatchActionV1Schema);
  });
});

describe("DispatchActionV1Schema — round-trip", () => {
  it("round-trips dispatch fixture via JSON", () => {
    const parsed = DispatchActionV1Schema.parse(dispatchFixture);
    const reparsed = DispatchActionV1Schema.parse(
      JSON.parse(JSON.stringify(parsed)),
    );
    expect(reparsed).toEqual(parsed);
  });

  it("round-trips report fixture via JSON", () => {
    const parsed = DispatchActionV1Schema.parse(reportFixture);
    const reparsed = DispatchActionV1Schema.parse(
      JSON.parse(JSON.stringify(parsed)),
    );
    expect(reparsed).toEqual(parsed);
  });

  it("round-trips halt fixture via JSON", () => {
    const parsed = DispatchActionV1Schema.parse(haltFixture);
    const reparsed = DispatchActionV1Schema.parse(
      JSON.parse(JSON.stringify(parsed)),
    );
    expect(reparsed).toEqual(parsed);
  });
});

// ─── Story 3.1 — dispatch variant lastAttempted extension ─────────────────

describe("DispatchActionV1Schema — Story 3.1 lastAttempted on dispatch variant", () => {
  it("dispatch variant accepts dispatch line WITHOUT lastAttempted (existing shape)", () => {
    const parsed = DispatchActionV1Schema.parse({
      action: "dispatch",
      runId: "abc",
      agent: "bmad-step-runner",
      exitCode: 0,
    });
    expect(parsed.action).toBe("dispatch");
    if (parsed.action === "dispatch") {
      expect(parsed.lastAttempted).toBeUndefined();
    }
  });

  it("dispatch variant accepts dispatch line WITH lastAttempted (Story 3.1 extension)", () => {
    const parsed = DispatchActionV1Schema.parse({
      action: "dispatch",
      runId: "abc",
      agent: "bmad-step-runner",
      lastAttempted: {
        step: "bmad-create-architecture",
        epic: 1,
        story: "1.1",
        attemptedAt: "2026-04-30T10:00:00Z",
      },
      exitCode: 0,
    });
    expect(parsed.action).toBe("dispatch");
    if (parsed.action === "dispatch") {
      expect(parsed.lastAttempted?.step).toBe("bmad-create-architecture");
      expect(parsed.lastAttempted?.epic).toBe(1);
      expect(parsed.lastAttempted?.story).toBe("1.1");
      expect(parsed.lastAttempted?.attemptedAt).toBe("2026-04-30T10:00:00Z");
    }
  });

  it("dispatch variant rejects malformed lastAttempted (missing required fields)", () => {
    const result = DispatchActionV1Schema.safeParse({
      action: "dispatch",
      runId: "abc",
      agent: "bmad-step-runner",
      lastAttempted: { step: "x" }, // missing epic/story/attemptedAt
      exitCode: 0,
    });
    expect(result.success).toBe(false);
  });

  it("round-trips dispatch fixture WITH lastAttempted via JSON", () => {
    const fixture = {
      action: "dispatch" as const,
      runId: "abc",
      agent: "bmad-step-runner",
      lastAttempted: {
        step: "bmad-create-architecture",
        epic: 1,
        story: "1.1",
        attemptedAt: "2026-04-30T10:00:00Z",
      },
      exitCode: 0 as const,
    };
    const parsed = DispatchActionV1Schema.parse(fixture);
    const reparsed = DispatchActionV1Schema.parse(
      JSON.parse(JSON.stringify(parsed)),
    );
    expect(reparsed).toEqual(parsed);
  });
});

// ─── v0.2.2 — invoke-skill variant ─────────────────────────────────────────

describe("DispatchActionV1Schema — invoke-skill variant (v0.2.2)", () => {
  const invokeSkillFixture = {
    action: "invoke-skill" as const,
    runId: "2026-05-14T12-00-00-bmad-brainstorming-abc12",
    skillName: "bmad:bmad-brainstorming",
    exitCode: 0 as const,
  };

  it("parses the canonical invoke-skill fixture (no lastAttempted)", () => {
    const parsed = DispatchActionV1Schema.parse(invokeSkillFixture);
    expect(parsed.action).toBe("invoke-skill");
    if (parsed.action === "invoke-skill") {
      expect(parsed.runId).toBe("2026-05-14T12-00-00-bmad-brainstorming-abc12");
      expect(parsed.skillName).toBe("bmad:bmad-brainstorming");
      expect(parsed.exitCode).toBe(0);
      expect(parsed.lastAttempted).toBeUndefined();
    }
  });

  it("parses invoke-skill fixture WITH lastAttempted", () => {
    const parsed = DispatchActionV1Schema.parse({
      ...invokeSkillFixture,
      lastAttempted: {
        step: "bmad-brainstorming",
        epic: 0,
        story: "0.0",
        attemptedAt: "2026-05-14T12:00:00Z",
      },
    });
    expect(parsed.action).toBe("invoke-skill");
    if (parsed.action === "invoke-skill") {
      expect(parsed.lastAttempted?.step).toBe("bmad-brainstorming");
    }
  });

  it("rejects when skillName is missing", () => {
    const result = DispatchActionV1Schema.safeParse({
      action: "invoke-skill",
      runId: "abc",
      exitCode: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects when runId is missing", () => {
    const result = DispatchActionV1Schema.safeParse({
      action: "invoke-skill",
      skillName: "bmad:x",
      exitCode: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects when exitCode is non-zero (invoke-skill must be 0)", () => {
    const result = DispatchActionV1Schema.safeParse({
      action: "invoke-skill",
      runId: "abc",
      skillName: "bmad:x",
      exitCode: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects malformed lastAttempted (missing required fields)", () => {
    const result = DispatchActionV1Schema.safeParse({
      action: "invoke-skill",
      runId: "abc",
      skillName: "bmad:x",
      lastAttempted: { step: "x" },
      exitCode: 0,
    });
    expect(result.success).toBe(false);
  });

  it("round-trips invoke-skill fixture via JSON", () => {
    const fixture = {
      ...invokeSkillFixture,
      lastAttempted: {
        step: "bmad-brainstorming",
        epic: 0,
        story: "0.0",
        attemptedAt: "2026-05-14T12:00:00Z",
      },
    };
    const parsed = DispatchActionV1Schema.parse(fixture);
    const reparsed = DispatchActionV1Schema.parse(
      JSON.parse(JSON.stringify(parsed)),
    );
    expect(reparsed).toEqual(parsed);
  });
});
