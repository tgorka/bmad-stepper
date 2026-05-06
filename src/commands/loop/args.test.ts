/**
 * src/commands/loop/args.test.ts — colocated unit tests for parseLoopArgs +
 * LoopArgsSchema (Story 4.1 AC-2).
 *
 * The parser is sync-pure (no IO, no async). Tests are pure synchronous
 * assertions against the `Result<LoopArgs, ParseError>` shape.
 *
 * Coverage:
 *   - 13-field schema inventory: every documented field verified per AC-2.
 *   - LoopArgsSchema parses empty object as all-undefined.
 *   - Strict mode rejects unknown fields.
 *   - Type rejection per field.
 *   - untilStory regex (X.Y) positive + negative cases.
 *   - Numeric fields require positive integers.
 *   - parseLoopArgs flag-form coverage:
 *     - --max-iters / --until-story / boolean flags / --checkpoint-each enum.
 *     - Order-independence.
 *     - Unknown flag rejection.
 *     - Missing-value rejection.
 *     - Invalid-numeric-value rejection.
 *     - untilStory regex mismatch propagation.
 */

import { describe, expect, it } from "bun:test";
import { LoopArgsSchema, parseLoopArgs } from "./args.ts";

describe("LoopArgsSchema — schema inventory + defaults", () => {
  it("LoopArgsSchema enumerates exactly 13 keys (AC-2 verbatim)", () => {
    const keys = Object.keys(LoopArgsSchema.shape).sort();
    expect(keys).toEqual(
      [
        "untilEpicEnd",
        "untilStory",
        "nextStory",
        "phaseEnd",
        "maxIters",
        "timeBudgetMs",
        "tokenBudget",
        "stopOnError",
        "continueOnError",
        "interactive",
        "autoFix",
        "planFirst",
        "checkpointEach",
      ].sort(),
    );
    expect(keys.length).toBe(13);
  });

  it("parses empty object as all-undefined (every field is .optional())", () => {
    const result = LoopArgsSchema.safeParse({});
    expect(result.success).toBe(true);
    if (!result.success) return;
    // All fields are absent (undefined) when not supplied.
    expect(result.data.untilEpicEnd).toBeUndefined();
    expect(result.data.untilStory).toBeUndefined();
    expect(result.data.nextStory).toBeUndefined();
    expect(result.data.phaseEnd).toBeUndefined();
    expect(result.data.maxIters).toBeUndefined();
    expect(result.data.timeBudgetMs).toBeUndefined();
    expect(result.data.tokenBudget).toBeUndefined();
    expect(result.data.stopOnError).toBeUndefined();
    expect(result.data.continueOnError).toBeUndefined();
    expect(result.data.interactive).toBeUndefined();
    expect(result.data.autoFix).toBeUndefined();
    expect(result.data.planFirst).toBeUndefined();
    expect(result.data.checkpointEach).toBeUndefined();
  });

  it("parses every field when all 13 are populated", () => {
    const populated = {
      untilEpicEnd: true,
      untilStory: "3.2",
      nextStory: true,
      phaseEnd: true,
      maxIters: 50,
      timeBudgetMs: 7_200_000,
      tokenBudget: 200_000,
      stopOnError: true,
      continueOnError: false,
      interactive: true,
      autoFix: false,
      planFirst: true,
      checkpointEach: "implementation" as const,
    };
    const result = LoopArgsSchema.safeParse(populated);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual(populated);
  });
});

describe("LoopArgsSchema — strict mode rejects unknown keys", () => {
  it("rejects an unknown field via .strict()", () => {
    const result = LoopArgsSchema.safeParse({ unknownField: "foo" });
    expect(result.success).toBe(false);
  });

  it("rejects a typo of an existing field", () => {
    // `maxIter` (singular) is not the same as `maxIters` (plural).
    const result = LoopArgsSchema.safeParse({ maxIter: 5 });
    expect(result.success).toBe(false);
  });
});

describe("LoopArgsSchema — type rejections per field", () => {
  it("rejects a string for untilEpicEnd", () => {
    const result = LoopArgsSchema.safeParse({ untilEpicEnd: "yes" });
    expect(result.success).toBe(false);
  });

  it("rejects a number for stopOnError", () => {
    const result = LoopArgsSchema.safeParse({ stopOnError: 1 });
    expect(result.success).toBe(false);
  });

  it("rejects a string for maxIters", () => {
    const result = LoopArgsSchema.safeParse({ maxIters: "1" });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown enum value for checkpointEach", () => {
    const result = LoopArgsSchema.safeParse({ checkpointEach: "invalid" });
    expect(result.success).toBe(false);
  });
});

describe("LoopArgsSchema — untilStory regex (X.Y format)", () => {
  it("accepts X.Y-form values", () => {
    for (const value of ["3.2", "10.5", "1.10", "100.999"]) {
      const result = LoopArgsSchema.safeParse({ untilStory: value });
      expect(result.success).toBe(true);
    }
  });

  it("rejects single-integer / three-part / non-numeric forms", () => {
    for (const value of ["3", "3.2.1", "a.b", "3.x", "", "3."]) {
      const result = LoopArgsSchema.safeParse({ untilStory: value });
      expect(result.success).toBe(false);
    }
  });
});

describe("LoopArgsSchema — numeric fields require positive integers", () => {
  it("rejects zero, negative, fractional, and non-integer strings", () => {
    for (const field of ["maxIters", "timeBudgetMs", "tokenBudget"] as const) {
      for (const value of [0, -1, 1.5, "1", null]) {
        const result = LoopArgsSchema.safeParse({ [field]: value });
        expect(result.success).toBe(false);
      }
    }
  });

  it("accepts positive integers", () => {
    for (const field of ["maxIters", "timeBudgetMs", "tokenBudget"] as const) {
      for (const value of [1, 100, 2_147_483_647]) {
        const result = LoopArgsSchema.safeParse({ [field]: value });
        expect(result.success).toBe(true);
      }
    }
  });
});

describe("parseLoopArgs — happy path", () => {
  it("parseLoopArgs([]) returns all-undefined", () => {
    const result = parseLoopArgs([]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.maxIters).toBeUndefined();
    expect(result.value.untilEpicEnd).toBeUndefined();
  });

  it('parseLoopArgs(["--max-iters", "1"]) parses correctly', () => {
    const result = parseLoopArgs(["--max-iters", "1"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.maxIters).toBe(1);
    expect(result.value.untilEpicEnd).toBeUndefined();
  });

  it('parseLoopArgs(["--until-story", "3.2"]) parses correctly', () => {
    const result = parseLoopArgs(["--until-story", "3.2"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.untilStory).toBe("3.2");
  });

  it("parses all 13 flags when supplied together", () => {
    const result = parseLoopArgs([
      "--until-epic-end",
      "--until-story",
      "5.10",
      "--next-story",
      "--phase-end",
      "--max-iters",
      "50",
      "--time-budget",
      "7200000",
      "--token-budget",
      "200000",
      "--stop-on-error",
      "--continue-on-error",
      "--interactive",
      "--auto-fix",
      "--plan-first",
      "--checkpoint-each",
      "implementation",
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      untilEpicEnd: true,
      untilStory: "5.10",
      nextStory: true,
      phaseEnd: true,
      maxIters: 50,
      timeBudgetMs: 7_200_000,
      tokenBudget: 200_000,
      stopOnError: true,
      continueOnError: true,
      interactive: true,
      autoFix: true,
      planFirst: true,
      checkpointEach: "implementation",
    });
  });

  it("--auto-fix sets autoFix to true", () => {
    const result = parseLoopArgs(["--auto-fix"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.autoFix).toBe(true);
  });

  it("--checkpoint-each accepts each of the 5 Phase values (Story 4.8)", () => {
    for (const value of [
      "analysis",
      "planning",
      "solutioning",
      "implementation",
      "retro",
    ] as const) {
      const result = parseLoopArgs(["--checkpoint-each", value]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.checkpointEach).toBe(value);
    }
  });

  it("--checkpoint-each rejects invalid enum values", () => {
    const result = parseLoopArgs(["--checkpoint-each", "invalid"]);
    expect(result.ok).toBe(false);
  });

  it("--checkpoint-each rejects legacy 3-value enum (story|epic|phase) per Story 4.8", () => {
    for (const value of ["story", "epic", "phase"] as const) {
      const result = parseLoopArgs(["--checkpoint-each", value]);
      expect(result.ok).toBe(false);
    }
  });

  it("preserves order-independence between flags", () => {
    const a = parseLoopArgs(["--max-iters", "5", "--until-epic-end"]);
    const b = parseLoopArgs(["--until-epic-end", "--max-iters", "5"]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.value).toEqual(b.value);
  });
});

describe("parseLoopArgs — error paths", () => {
  it("rejects unknown flags", () => {
    const result = parseLoopArgs(["--no-such-flag"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PARSE_ERROR");
    expect(result.error.hint).toMatch(/--help|recognised/);
  });

  it("rejects --max-iters with no value", () => {
    const result = parseLoopArgs(["--max-iters"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PARSE_ERROR");
    expect(result.error.hint).toMatch(/integer|value/);
  });

  it("rejects --max-iters with non-numeric value", () => {
    const result = parseLoopArgs(["--max-iters", "foo"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PARSE_ERROR");
    expect(result.error.message).toMatch(/expected|integer/);
  });

  it("rejects --max-iters with fractional value", () => {
    const result = parseLoopArgs(["--max-iters", "1.5"]);
    expect(result.ok).toBe(false);
  });

  it("rejects --max-iters with zero or negative value via Zod", () => {
    const a = parseLoopArgs(["--max-iters", "0"]);
    const b = parseLoopArgs(["--max-iters", "-1"]);
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
  });

  it('rejects --until-story with malformed value (e.g. "abc")', () => {
    const result = parseLoopArgs(["--until-story", "abc"]);
    expect(result.ok).toBe(false);
  });

  it("rejects positional arguments", () => {
    const result = parseLoopArgs(["positional"]);
    expect(result.ok).toBe(false);
  });

  it("rejects --until-story with no value (next is another flag)", () => {
    const result = parseLoopArgs(["--until-story", "--max-iters", "1"]);
    expect(result.ok).toBe(false);
  });
});

// ─── Story 5.5 — IA_55_PARSE_*: --interactive flag parsing (defence-in-depth) ─

describe("parseLoopArgs — IA_55_PARSE_* (Story 5.5: --interactive flag parsing)", () => {
  it("IA_55_PARSE_1: --interactive parses to interactive: true", () => {
    const result = parseLoopArgs(["--interactive"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.interactive).toBe(true);
  });

  it("IA_55_PARSE_2: --interactive combined with --max-iters parses both", () => {
    const result = parseLoopArgs(["--interactive", "--max-iters", "5"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.interactive).toBe(true);
    expect(result.value.maxIters).toBe(5);
  });

  it("IA_55_PARSE_3: --interactive true (defence-in-depth boolean shorthand) parses to true", () => {
    const result = parseLoopArgs(["--interactive", "true"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.interactive).toBe(true);
  });

  it("IA_55_PARSE_4: --interactive false parses to false", () => {
    const result = parseLoopArgs(["--interactive", "false"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.interactive).toBe(false);
  });
});
