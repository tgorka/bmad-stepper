/**
 * src/commands/next/args.test.ts — colocated unit tests for parseNextArgs
 * (Story 1.7 AC-1).
 *
 * The parser is sync-pure (no IO, no async). Tests are pure synchronous
 * assertions against the `Result<NextArgs, ParseError>` shape.
 *
 * Coverage:
 *   - 18-flag inventory: every documented flag verified with --flag value,
 *     --flag=value, and (where applicable) boolean shorthand forms.
 *   - Defaults filled when no flags supplied.
 *   - kebab-case → camelCase conversion for multi-word flags.
 *   - --no-optional negation (architecture line 615).
 *   - Unknown flag rejection via Zod .strict() (unrecognized_keys issue).
 *   - Wrong enum value rejection (invalid_enum_value issue).
 *   - Wrong-type boolean rejection (`--dry-run=maybe`).
 *   - First Zod issue surfaced in AR22-compliant hint.
 *   - Cross-validation gap intentional: --include-optional + --no-optional
 *     both pass (runner is responsible for cross-validation).
 *   - Empty-string value accepted (runner is responsible).
 *   - Form-coverage equivalence between --flag value and --flag=value.
 */

import { describe, expect, it } from "bun:test";
import {
  NextArgsSchema,
  parseNextArgs,
  parseVerifyAndAdvanceArgs,
  VerifyAndAdvanceArgsSchema,
} from "./args.ts";

describe("parseNextArgs — defaults", () => {
  it("returns ok=true with all defaults filled when argv is empty", () => {
    const result = parseNextArgs([]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      step: undefined,
      epic: undefined,
      story: undefined,
      phase: undefined,
      dryRun: false,
      resume: false,
      // Story 5.2: --skip <step> defaults to undefined (no skip).
      skip: undefined,
      includeOptional: false,
      noOptional: false,
      persona: undefined,
      explain: false,
      list: false,
      doctor: false,
      upgrade: false,
      recomputeState: false,
      exportState: false,
      diffState: false,
      watch: false,
      forceUnlock: false,
      // Story 5.3: --auto-fix defaults to false (no auto-fix).
      autoFix: false,
    });
  });

  it("NextArgsSchema enumerates exactly 20 keys (Story 1.7 baseline 18 + Story 5.2 skip + Story 5.3 autoFix)", () => {
    const keys = Object.keys(NextArgsSchema.shape).sort();
    expect(keys).toEqual(
      [
        // Story 5.3: --auto-fix 20th flag per FR29.
        "autoFix",
        "diffState",
        "doctor",
        "dryRun",
        "epic",
        "explain",
        "exportState",
        "forceUnlock",
        "includeOptional",
        "list",
        "noOptional",
        "persona",
        "phase",
        "recomputeState",
        "resume",
        // Story 5.2: --skip <step> 19th flag per FR28.
        "skip",
        "step",
        "story",
        "upgrade",
        "watch",
      ].sort(),
    );
    expect(keys.length).toBe(20);
  });
});

describe("parseNextArgs — happy path: form coverage", () => {
  it("--dry-run boolean shorthand sets dryRun=true", () => {
    const result = parseNextArgs(["--dry-run"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.dryRun).toBe(true);
  });

  it("--epic 3 (space form) sets epic to '3'", () => {
    const result = parseNextArgs(["--epic", "3"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.epic).toBe("3");
  });

  it("--epic=3 (equals form) sets epic to '3'", () => {
    const result = parseNextArgs(["--epic=3"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.epic).toBe("3");
  });

  it("--phase analysis sets phase to enum value", () => {
    const result = parseNextArgs(["--phase", "analysis"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.phase).toBe("analysis");
  });

  it("--no-optional sets noOptional=true (architecture line 615 — kebab→camel)", () => {
    const result = parseNextArgs(["--no-optional"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The schema enumerates `noOptional` as a boolean. `--no-optional`
    // maps via the standard kebab→camel conversion to the `noOptional`
    // schema key and is set to `true` via boolean shorthand. The runner
    // (Story 2.4) treats `noOptional === true` as "exclude optional
    // steps" per FR15.
    expect(result.value.noOptional).toBe(true);
  });

  it("--include-optional sets includeOptional=true (kebab→camel)", () => {
    const result = parseNextArgs(["--include-optional"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.includeOptional).toBe(true);
  });

  // Programmatic coverage of all 13 boolean flags via boolean shorthand.
  const booleanFlagPairs: ReadonlyArray<{
    kebab: string;
    camel: keyof Parameters<typeof getBooleanField>[0];
  }> = [
    { kebab: "--dry-run", camel: "dryRun" },
    { kebab: "--resume", camel: "resume" },
    { kebab: "--include-optional", camel: "includeOptional" },
    { kebab: "--no-optional", camel: "noOptional" },
    { kebab: "--explain", camel: "explain" },
    { kebab: "--list", camel: "list" },
    { kebab: "--doctor", camel: "doctor" },
    { kebab: "--upgrade", camel: "upgrade" },
    { kebab: "--recompute-state", camel: "recomputeState" },
    { kebab: "--export-state", camel: "exportState" },
    { kebab: "--diff-state", camel: "diffState" },
    { kebab: "--watch", camel: "watch" },
    { kebab: "--force-unlock", camel: "forceUnlock" },
  ];

  for (const { kebab, camel } of booleanFlagPairs) {
    it(`${kebab} sets ${camel}=true (boolean shorthand)`, () => {
      const result = parseNextArgs([kebab]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const field = getBooleanField(result.value, camel);
      expect(field).toBe(true);
    });
  }

  // Programmatic coverage of all 4 optional string flags.
  const stringFlagPairs: ReadonlyArray<{
    kebab: string;
    camel: "step" | "epic" | "story" | "persona";
  }> = [
    { kebab: "--step", camel: "step" },
    { kebab: "--epic", camel: "epic" },
    { kebab: "--story", camel: "story" },
    { kebab: "--persona", camel: "persona" },
  ];

  for (const { kebab, camel } of stringFlagPairs) {
    it(`${kebab} abc sets ${camel} to 'abc'`, () => {
      const result = parseNextArgs([kebab, "abc"]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value[camel]).toBe("abc");
    });
  }
});

describe("parseNextArgs — error path", () => {
  it("returns ok=false with code PARSE_ERROR for unknown --bogus flag", () => {
    const result = parseNextArgs(["--bogus"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PARSE_ERROR");
    expect(result.error.issues.length).toBeGreaterThanOrEqual(1);
    const firstIssue = result.error.issues[0];
    expect(firstIssue?.code).toBe("unrecognized_keys");
  });

  it("hint starts with 'Run ' for AR22 compliance and is single-line", () => {
    const result = parseNextArgs(["--bogus"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.hint.startsWith("Run ")).toBe(true);
    // Hint must be single-line: no embedded newlines (trailing newline is
    // not added by the parser; the caller's logger appends one).
    expect(result.error.hint.includes("\n")).toBe(false);
  });

  it("rejects --phase bogus with invalid_value issue", () => {
    const result = parseNextArgs(["--phase", "bogus"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const firstIssue = result.error.issues[0];
    // Zod 4.x reports enum mismatches under the `invalid_value` code.
    expect(firstIssue?.code).toBe("invalid_value");
  });

  it("rejects --dry-run=maybe (boolean expected, string given)", () => {
    const result = parseNextArgs(["--dry-run=maybe"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PARSE_ERROR");
    const firstIssue = result.error.issues[0];
    // The non-coercible string surfaces as a Zod type error on dryRun.
    expect(firstIssue?.path).toEqual(["dryRun"]);
  });

  it("surfaces the first Zod issue's message in the hint when multiple issues exist", () => {
    const result = parseNextArgs(["--bogus", "--phase", "fake"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.issues.length).toBeGreaterThanOrEqual(2);
    const firstIssue = result.error.issues[0];
    expect(firstIssue).toBeDefined();
    if (firstIssue) {
      expect(result.error.hint).toContain(firstIssue.message);
    }
  });
});

describe("parseNextArgs — cross-validation gap (intentional)", () => {
  it("accepts --include-optional and --no-optional together (runner is responsible)", () => {
    const result = parseNextArgs(["--include-optional", "--no-optional"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Both schema keys flip true; the parser does not cross-validate the
    // semantic conflict (the runner — Story 2.4 — is responsible).
    expect(result.value.includeOptional).toBe(true);
    expect(result.value.noOptional).toBe(true);
  });

  it("accepts empty-string flag value (runner is responsible for filter handling)", () => {
    const result = parseNextArgs(["--epic="]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.epic).toBe("");
  });
});

describe("parseNextArgs — form equivalence", () => {
  it("--epic=3 and --epic 3 produce identical Result.value", () => {
    const a = parseNextArgs(["--epic=3"]);
    const b = parseNextArgs(["--epic", "3"]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.value).toEqual(b.value);
  });

  it("--dry-run shorthand and --dry-run=true produce equal dryRun=true", () => {
    const a = parseNextArgs(["--dry-run"]);
    const b = parseNextArgs(["--dry-run=true"]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.value.dryRun).toBe(true);
    expect(b.value.dryRun).toBe(true);
    expect(a.value).toEqual(b.value);
  });

  it("mixed forms in one argv are parsed correctly", () => {
    const result = parseNextArgs([
      "--epic=3",
      "--story",
      "1.7",
      "--dry-run",
      "--phase",
      "implementation",
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.epic).toBe("3");
    expect(result.value.story).toBe("1.7");
    expect(result.value.dryRun).toBe(true);
    expect(result.value.phase).toBe("implementation");
  });
});

// ─── Test helpers ──────────────────────────────────────────────────────────

/**
 * Type-safe accessor for the boolean fields of NextArgs. Avoids `as any`
 * narrowing and satisfies Biome's noExplicitAny rule.
 */
function getBooleanField(
  value: {
    dryRun: boolean;
    resume: boolean;
    includeOptional: boolean;
    noOptional: boolean;
    explain: boolean;
    list: boolean;
    doctor: boolean;
    upgrade: boolean;
    recomputeState: boolean;
    exportState: boolean;
    diffState: boolean;
    watch: boolean;
    forceUnlock: boolean;
  },
  key:
    | "dryRun"
    | "resume"
    | "includeOptional"
    | "noOptional"
    | "explain"
    | "list"
    | "doctor"
    | "upgrade"
    | "recomputeState"
    | "exportState"
    | "diffState"
    | "watch"
    | "forceUnlock",
): boolean {
  return value[key];
}

// ─── parseVerifyAndAdvanceArgs (Story 2.6 Task 13) ─────────────────────────

describe("parseVerifyAndAdvanceArgs — happy path", () => {
  it("returns ok=true with parsed { runId, tokensIn, tokensOut } for valid argv", () => {
    const result = parseVerifyAndAdvanceArgs([
      "--run-id",
      "abc-123",
      "--tokens-in",
      "100",
      "--tokens-out",
      "200",
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      runId: "abc-123",
      tokensIn: 100,
      tokensOut: 200,
    });
  });

  it("accepts a leading -- separator (Layer 1 may pass another -- after Bun's own)", () => {
    const result = parseVerifyAndAdvanceArgs([
      "--",
      "--run-id",
      "abc-123",
      "--tokens-in",
      "100",
      "--tokens-out",
      "200",
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.runId).toBe("abc-123");
    expect(result.value.tokensIn).toBe(100);
    expect(result.value.tokensOut).toBe(200);
  });

  it("accepts zero token counts (cold-start dispatch with no tokens)", () => {
    const result = parseVerifyAndAdvanceArgs([
      "--run-id",
      "x",
      "--tokens-in",
      "0",
      "--tokens-out",
      "0",
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.tokensIn).toBe(0);
    expect(result.value.tokensOut).toBe(0);
  });

  it("VerifyAndAdvanceArgsSchema is .strict() (rejects unknown keys at the schema level)", () => {
    // Use unknown-cast to avoid `as any` (Biome `noExplicitAny`). This
    // exercises the schema's strict-mode unknown-key rejection.
    const result = VerifyAndAdvanceArgsSchema.safeParse({
      runId: "x",
      tokensIn: 1,
      tokensOut: 2,
      extra: "bogus",
    } as unknown as { runId: string; tokensIn: number; tokensOut: number });
    expect(result.success).toBe(false);
  });
});

describe("parseVerifyAndAdvanceArgs — missing required args", () => {
  it("returns ok=false when --run-id is missing", () => {
    const result = parseVerifyAndAdvanceArgs([
      "--tokens-in",
      "100",
      "--tokens-out",
      "200",
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PARSE_ERROR");
    expect(result.error.hint).toContain("--run-id");
    expect(result.error.hint.startsWith("Pass ")).toBe(true);
  });

  it("returns ok=false when --tokens-in is missing", () => {
    const result = parseVerifyAndAdvanceArgs([
      "--run-id",
      "abc",
      "--tokens-out",
      "200",
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.hint).toContain("--tokens-in");
  });

  it("returns ok=false when --tokens-out is missing", () => {
    const result = parseVerifyAndAdvanceArgs([
      "--run-id",
      "abc",
      "--tokens-in",
      "100",
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.hint).toContain("--tokens-out");
  });

  it("returns ok=false when argv is empty", () => {
    const result = parseVerifyAndAdvanceArgs([]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // First missing (per the function's check order) is --run-id.
    expect(result.error.hint).toContain("--run-id");
  });
});

describe("parseVerifyAndAdvanceArgs — invalid token values", () => {
  it("returns ok=false for non-numeric --tokens-in", () => {
    const result = parseVerifyAndAdvanceArgs([
      "--run-id",
      "abc",
      "--tokens-in",
      "not-a-number",
      "--tokens-out",
      "200",
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.hint).toContain("--tokens-in");
    expect(result.error.hint).toContain("not-a-number");
  });

  it("returns ok=false for negative --tokens-in (Zod schema rejects negatives)", () => {
    const result = parseVerifyAndAdvanceArgs([
      "--run-id",
      "abc",
      "--tokens-in",
      "-5",
      "--tokens-out",
      "200",
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PARSE_ERROR");
  });

  it("returns ok=false for floating-point --tokens-out (parseInt drops fractional)", () => {
    const result = parseVerifyAndAdvanceArgs([
      "--run-id",
      "abc",
      "--tokens-in",
      "100",
      "--tokens-out",
      "200.5",
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PARSE_ERROR");
  });
});

describe("parseVerifyAndAdvanceArgs — unknown flags", () => {
  it("returns ok=false with PARSE_ERROR for an unknown flag", () => {
    const result = parseVerifyAndAdvanceArgs([
      "--run-id",
      "abc",
      "--tokens-in",
      "100",
      "--tokens-out",
      "200",
      "--unknown-flag",
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PARSE_ERROR");
    expect(result.error.hint).toContain("--unknown-flag");
    expect(result.error.hint.startsWith("Run ")).toBe(true);
  });
});

describe("parseVerifyAndAdvanceArgs — --run-id missing value", () => {
  it("returns ok=false when --run-id is followed by another flag", () => {
    const result = parseVerifyAndAdvanceArgs([
      "--run-id",
      "--tokens-in",
      "100",
      "--tokens-out",
      "200",
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.hint.startsWith("Pass ")).toBe(true);
  });
});

// ─── Story 3.1 — --last-attempted-json flag ───────────────────────────────

describe("parseVerifyAndAdvanceArgs — Story 3.1 --last-attempted-json", () => {
  it("happy path: parses well-formed JSON payload into args.lastAttempted", () => {
    const payload = {
      step: "bmad-create-architecture",
      epic: 1,
      story: "1.1",
      attemptedAt: "2026-04-30T10:00:00Z",
    };
    const result = parseVerifyAndAdvanceArgs([
      "--run-id",
      "abc",
      "--tokens-in",
      "0",
      "--tokens-out",
      "0",
      "--last-attempted-json",
      JSON.stringify(payload),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.lastAttempted).toEqual(payload);
    expect(result.value.runId).toBe("abc");
  });

  it("optional: returns ok=true with lastAttempted=undefined when flag is absent", () => {
    const result = parseVerifyAndAdvanceArgs([
      "--run-id",
      "abc",
      "--tokens-in",
      "0",
      "--tokens-out",
      "0",
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.lastAttempted).toBeUndefined();
  });

  it("missing value: returns PARSE_ERROR when --last-attempted-json has no payload", () => {
    const result = parseVerifyAndAdvanceArgs([
      "--run-id",
      "abc",
      "--tokens-in",
      "0",
      "--tokens-out",
      "0",
      "--last-attempted-json",
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PARSE_ERROR");
    expect(result.error.hint).toContain("--last-attempted-json");
    expect(result.error.hint.startsWith("Pass ")).toBe(true);
  });

  it("invalid JSON: returns PARSE_ERROR when payload is not valid JSON", () => {
    const result = parseVerifyAndAdvanceArgs([
      "--run-id",
      "abc",
      "--tokens-in",
      "0",
      "--tokens-out",
      "0",
      "--last-attempted-json",
      "{not valid json",
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PARSE_ERROR");
    expect(result.error.message).toContain("not valid JSON");
    expect(result.error.hint.startsWith("Pass ")).toBe(true);
  });

  it("schema mismatch: returns PARSE_ERROR when payload is missing required fields", () => {
    const result = parseVerifyAndAdvanceArgs([
      "--run-id",
      "abc",
      "--tokens-in",
      "0",
      "--tokens-out",
      "0",
      "--last-attempted-json",
      JSON.stringify({ step: "x" }),
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PARSE_ERROR");
    expect(result.error.message).toContain("schema validation");
    expect(result.error.hint.startsWith("Pass ")).toBe(true);
  });
});

// ─── Story 5.2 — --skip <step> parsing (SK_52_ARGS_*) ─────────────────────

describe("parseNextArgs — Story 5.2 --skip flag (SK_52_ARGS_*)", () => {
  it("SK_52_ARGS_1: parseNextArgs(['--skip', 'dev-story']) returns {skip: 'dev-story'}", () => {
    const result = parseNextArgs(["--skip", "dev-story"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.skip).toBe("dev-story");
  });

  it("SK_52_ARGS_2: parseNextArgs(['--skip', 'dev-story', '--resume']) returns {skip, resume: true}", () => {
    const result = parseNextArgs(["--skip", "dev-story", "--resume"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.skip).toBe("dev-story");
    expect(result.value.resume).toBe(true);
  });

  it("SK_52_ARGS_3: parseNextArgs(['--skip']) (without value) → ParseError (string-valued flag requires a value)", () => {
    // Per the hand-rolled tokenizer: when a string-valued flag appears
    // alone (no following non-flag token), it falls through the
    // boolean-shorthand branch and is set to `true`. Zod's
    // .string().optional() rejects boolean true → ParseError.
    const result = parseNextArgs(["--skip"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PARSE_ERROR");
  });

  it("SK_52_ARGS_4: parseNextArgs(['--skip', '']) (empty value) accepted by parser; runner enforces non-empty (Story 1.7 intentional gap pattern)", () => {
    // Empty-string is accepted by the parser per the existing Story 1.7
    // line 70 forward-dep precedent (the runner consistently treats
    // empty-string flag values as "no filter / no override").
    const result = parseNextArgs(["--skip", ""]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.skip).toBe("");
  });

  it("SK_52_ARGS_5: parseNextArgs(['--skip=dev-story']) (= form) returns {skip: 'dev-story'}", () => {
    const result = parseNextArgs(["--skip=dev-story"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.skip).toBe("dev-story");
  });

  it("SK_52_ARGS_6: unknown flag rejection (--skip-extra) → ParseError per .strict() mode", () => {
    const result = parseNextArgs(["--skip-extra", "dev-story"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PARSE_ERROR");
  });
});

// ─── Story 5.2 — --skip-step <step> parsing in parseVerifyAndAdvanceArgs ──

describe("parseVerifyAndAdvanceArgs — Story 5.2 --skip-step (SK_52_ARGS_VA_*)", () => {
  it("SK_52_ARGS_VA_1: parses --skip-step <step> and threads it via skipStep on the parsed args", () => {
    const result = parseVerifyAndAdvanceArgs([
      "--run-id",
      "skip-runid",
      "--tokens-in",
      "0",
      "--tokens-out",
      "0",
      "--skip-step",
      "bmad-dev-story",
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.skipStep).toBe("bmad-dev-story");
  });

  it("SK_52_ARGS_VA_2: --skip-step missing value → PARSE_ERROR with AR22 hint", () => {
    const result = parseVerifyAndAdvanceArgs([
      "--run-id",
      "abc",
      "--tokens-in",
      "0",
      "--tokens-out",
      "0",
      "--skip-step",
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PARSE_ERROR");
    expect(result.error.message).toContain("--skip-step");
    expect(result.error.hint.startsWith("Pass ")).toBe(true);
  });

  it("SK_52_ARGS_VA_3: omitted --skip-step → skipStep is undefined (back-compat)", () => {
    const result = parseVerifyAndAdvanceArgs([
      "--run-id",
      "abc",
      "--tokens-in",
      "0",
      "--tokens-out",
      "0",
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.skipStep).toBeUndefined();
  });
});

// ─── Story 5.3 — --auto-fix flag (RTF_53_ARGS_*) ──────────────────────────

describe("parseNextArgs — Story 5.3 --auto-fix flag (RTF_53_ARGS_*)", () => {
  it("RTF_53_ARGS_1: parseNextArgs(['--auto-fix']) returns {autoFix: true}", () => {
    const result = parseNextArgs(["--auto-fix"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.autoFix).toBe(true);
  });

  it("RTF_53_ARGS_2: parseNextArgs(['--auto-fix', '--resume']) returns both flags set", () => {
    const result = parseNextArgs(["--auto-fix", "--resume"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.autoFix).toBe(true);
    expect(result.value.resume).toBe(true);
  });

  it("RTF_53_ARGS_3: parseNextArgs(['--auto-fix=true']) (= form) returns {autoFix: true}", () => {
    const result = parseNextArgs(["--auto-fix=true"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.autoFix).toBe(true);
  });

  it("RTF_53_ARGS_4: parseNextArgs(['--auto-fix=false']) returns {autoFix: false}", () => {
    const result = parseNextArgs(["--auto-fix=false"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.autoFix).toBe(false);
  });

  it("RTF_53_ARGS_5: empty argv default test confirms autoFix: false", () => {
    // Inventory + defaults are checked elsewhere; this asserts the
    // specific autoFix default for explicit Story 5.3 documentation.
    const result = parseNextArgs([]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.autoFix).toBe(false);
  });

  it("RTF_53_ARGS_6: inventory grew to 20 keys (Story 5.2 baseline 19 + Story 5.3 autoFix)", () => {
    // Cross-references the 20-key inventory test in defaults block.
    const keys = Object.keys(NextArgsSchema.shape);
    expect(keys.length).toBe(20);
    expect(keys).toContain("autoFix");
  });

  it("RTF_53_ARGS_7: unknown flag rejection (--auto-fix-extra) → ParseError per .strict() mode", () => {
    const result = parseNextArgs(["--auto-fix-extra"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PARSE_ERROR");
  });
});

describe("parseVerifyAndAdvanceArgs — v0.2.2 --invoke-skill-mode", () => {
  it("parses --invoke-skill-mode as a boolean (no value follows)", () => {
    const result = parseVerifyAndAdvanceArgs([
      "--run-id",
      "rid",
      "--tokens-in",
      "0",
      "--tokens-out",
      "0",
      "--invoke-skill-mode",
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.invokeSkillMode).toBe(true);
  });

  it("omits invokeSkillMode (undefined) when flag is absent", () => {
    const result = parseVerifyAndAdvanceArgs([
      "--run-id",
      "rid",
      "--tokens-in",
      "0",
      "--tokens-out",
      "0",
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.invokeSkillMode).toBeUndefined();
  });

  it("--invoke-skill-mode coexists with --last-attempted-json", () => {
    const lastAttempted = {
      step: "bmad-brainstorming",
      epic: 0,
      story: "0.0",
      attemptedAt: "2026-05-14T12:00:00Z",
    };
    const result = parseVerifyAndAdvanceArgs([
      "--run-id",
      "rid",
      "--tokens-in",
      "0",
      "--tokens-out",
      "0",
      "--invoke-skill-mode",
      "--last-attempted-json",
      JSON.stringify(lastAttempted),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.invokeSkillMode).toBe(true);
    expect(result.value.lastAttempted?.step).toBe("bmad-brainstorming");
  });
});
