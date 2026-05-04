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
import { NextArgsSchema, parseNextArgs } from "./args.ts";

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
    });
  });

  it("NextArgsSchema enumerates exactly 18 keys (AC-1 inventory)", () => {
    const keys = Object.keys(NextArgsSchema.shape).sort();
    expect(keys).toEqual(
      [
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
        "step",
        "story",
        "upgrade",
        "watch",
      ].sort(),
    );
    expect(keys.length).toBe(18);
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
