/**
 * src/commands/loop/args.ts — hand-rolled CLI tokenizer + Zod-validated
 * argument schema for the `/bmad-loop` command (FR8, FR9, FR19, FR53,
 * FR54, AR9, AR21, AR22, AR33, AR41).
 *
 * Top-tier module per AR41 (architecture lines 1294–1302). Mirrors the
 * Story 1.7 `src/commands/next/args.ts` pattern verbatim — Result-shape
 * return for the parse function is the SOLE exception to AR33's
 * throw-everywhere discipline (architecture P4 line 858).
 *
 * Story 4.1's `LoopArgsSchema` declares the FULL 13-field surface per AC-2
 * verbatim (epics.md line 902). Only `maxIters` is RUNTIME-WIRED in this
 * story; the other 12 fields are ARG-SURFACE-PRESENT but RUNTIME-DEFERRED
 * to subsequent Epic 4 + Epic 5 stories. This mirrors Story 1.7's pattern
 * where `NextArgsSchema` declared all future flag names that subsequent
 * stories progressively wired.
 *
 * ── Public surface ─────────────────────────────────────────────────────────
 *   - LoopArgsSchema   — Zod schema enumerating the 13 documented flags.
 *                        `.strict()` rejects unknown keys.
 *   - LoopArgs         — `z.infer<typeof LoopArgsSchema>` (the typed shape).
 *   - parseLoopArgs    — argv → Result<LoopArgs, ParseError>.
 *
 * ── Field enumeration (AC-2 verbatim) ──────────────────────────────────────
 * | Field           | Zod type                    | Story    |
 * |-----------------|-----------------------------|----------|
 * | untilEpicEnd    | boolean().optional()        | 4.2      |
 * | untilStory      | string().regex(X.Y)         | 4.2      |
 * | nextStory       | boolean().optional()        | 4.3      |
 * | phaseEnd        | boolean().optional()        | 4.3      |
 * | maxIters        | number().int().positive()   | 4.1+4.4  | ← wired in 4.1
 * | timeBudgetMs    | number().int().positive()   | 4.5      |
 * | tokenBudget     | number().int().positive()   | 4.5      |
 * | stopOnError     | boolean().optional()        | 4.6      |
 * | continueOnError | boolean().optional()        | 4.6      |
 * | interactive     | boolean().optional()        | 5.5      |
 * | autoFix         | boolean().optional()        | 5.3      |
 * | planFirst       | boolean().optional()        | 4.7      |
 * | checkpointEach  | enum(story|epic|phase)      | 4.8      |
 *
 * Architecture cross-references:
 * - architecture.md §G CLI Surface & Errors (lines 553–629).
 * - architecture.md §P4 line 858 — Result-shaped CLI parser exception.
 * - architecture.md §AR21 / §AR22 — error UX shape.
 * - architecture.md §AR33 — throw-everywhere + sole Result exception.
 * - architecture.md §AR41 — module boundary graph.
 * - epics.md §Story 4.1 lines 891-903 (AC verbatim).
 */

import { z } from "zod";
import type { ParseError, Result } from "../next/args.ts";

// Re-export the Result helper + ParseError type from the next sibling
// per Story 1.7 + Story 4.1 §Open Question 1 / §Design Decision: keep
// Result colocated in next/args.ts; loop/args.ts imports the type to
// avoid duplicating the discriminated union (a future foundational
// `src/types/result.ts` could absorb both).
export type { ParseError, Result } from "../next/args.ts";

// ─── Zod schema (verbatim per epics.md AC-2 line 902) ─────────────────────

/**
 * Zod schema for the parsed `/bmad-loop` arguments. The 13 fields are
 * enumerated character-for-character per AC-2 (epics.md line 902):
 *
 *   "LoopArgsSchema Zod-validates: untilEpicEnd?, untilStory?, nextStory?,
 *    phaseEnd?, maxIters?, timeBudgetMs?, tokenBudget?, stopOnError?,
 *    continueOnError?, interactive?, autoFix?, planFirst?, checkpointEach?"
 *
 * `.strict()` rejects unknown keys per the Story 1.7 NextArgsSchema
 * precedent — defence-in-depth against typos in argv parsing.
 *
 * Numeric fields use `z.number().int().positive()` to reject zero,
 * negative, and non-integer values. Story 4.5 may relax `timeBudgetMs`
 * to allow `0` for "no time limit" — forward-tracker; v0.1 conservative
 * is positive-only.
 *
 * `untilStory` regex `/^\d+\.\d+$/` matches `3.2`, `10.5`, `1.10`, etc.;
 * rejects `3` (no minor), `3.2.1` (three parts), `a.b` (non-numeric).
 *
 * `checkpointEach` enum allows `"story"` | `"epic"` | `"phase"` per
 * Story 4.8 contract.
 */
export const LoopArgsSchema = z
  .object({
    untilEpicEnd: z.boolean().optional(),
    untilStory: z
      .string()
      .regex(/^\d+\.\d+$/, {
        message:
          'untilStory must be in <epic>.<story> form (e.g. "3.2"); single integers and three-part versions are rejected.',
      })
      .optional(),
    nextStory: z.boolean().optional(),
    phaseEnd: z.boolean().optional(),
    maxIters: z.number().int().positive().optional(),
    timeBudgetMs: z.number().int().positive().optional(),
    tokenBudget: z.number().int().positive().optional(),
    stopOnError: z.boolean().optional(),
    continueOnError: z.boolean().optional(),
    interactive: z.boolean().optional(),
    autoFix: z.boolean().optional(),
    planFirst: z.boolean().optional(),
    checkpointEach: z.enum(["story", "epic", "phase"]).optional(),
  })
  .strict();

export type LoopArgs = z.infer<typeof LoopArgsSchema>;

// ─── Tokenizer ────────────────────────────────────────────────────────────

/**
 * Set of schema keys that are boolean flags (no value required). The
 * tokenizer treats these specially — when encountered as `--flag` (with
 * no following value) it sets the value to `true`; when followed by
 * `true`/`false` it coerces the literal.
 */
const BOOLEAN_KEYS: ReadonlySet<string> = new Set([
  "untilEpicEnd",
  "nextStory",
  "phaseEnd",
  "stopOnError",
  "continueOnError",
  "interactive",
  "autoFix",
  "planFirst",
]);

/**
 * Set of schema keys that take a numeric integer value. The tokenizer
 * parses these via `Number.parseInt(value, 10)` and verifies the value
 * is an exact integer string before passing through.
 */
const NUMERIC_KEYS: ReadonlySet<string> = new Set([
  "maxIters",
  "timeBudgetMs",
  "tokenBudget",
]);

/**
 * Set of schema keys that take a string value (regex/enum-validated by Zod).
 */
const STRING_KEYS: ReadonlySet<string> = new Set([
  "untilStory",
  "checkpointEach",
]);

/**
 * Explicit flag-name aliases that diverge from the camelCase schema key.
 * Per Story 4.1 Tasks 2.1 + 3.2, the user-facing flag is `--time-budget MS`
 * (the value is implicitly milliseconds) while the schema field is
 * `timeBudgetMs` (units in the name for self-documenting Zod). Other 12
 * fields share the canonical kebab↔camel mapping.
 */
const FLAG_ALIASES: ReadonlyMap<string, string> = new Map([
  ["timeBudget", "timeBudgetMs"],
]);

/**
 * Convert a kebab-case flag name (`--max-iters`) into camelCase
 * (`maxIters`). Pure string transformation; safe for empty input.
 */
function kebabToCamel(input: string): string {
  return input.replace(/-([a-z0-9])/g, (_, ch: string) => ch.toUpperCase());
}

// ─── Public parser ────────────────────────────────────────────────────────

/**
 * Synchronous parser for the `/bmad-loop` argument vector. Returns
 * `Result<LoopArgs, ParseError>` per architecture line 858.
 *
 * The parser walks `argv` left-to-right looking for canonical CLI flag
 * forms. Each recognised flag is converted to its camelCase schema key
 * and stored in a partial object; unrecognised flags surface as
 * UNKNOWN_FLAG; missing required values surface as MISSING_VALUE; type
 * mismatches surface via Zod's strict-parse as INVALID_VALUE.
 *
 * Forms supported:
 *   - `--flag value`  (next-arg consumed) for numeric + string flags
 *   - `--flag`        (boolean shorthand) for boolean flags
 *
 * The function NEVER throws on any input. The Result discriminated union
 * is the sole error channel.
 */
export function parseLoopArgs(
  argv: readonly string[],
): Result<LoopArgs, ParseError> {
  const raw: Record<string, string | number | boolean> = {};

  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === undefined) continue;
    if (!tok.startsWith("--")) {
      return {
        ok: false,
        error: {
          code: "PARSE_ERROR",
          message: `Unexpected positional argument: ${tok}`,
          hint: `Run /bmad-loop --help to see the supported flags; "${tok}" is not a recognised flag.`,
          issues: [],
        },
      };
    }
    const body = tok.slice(2);
    const camelKey = kebabToCamel(body);
    const key = FLAG_ALIASES.get(camelKey) ?? camelKey;

    if (BOOLEAN_KEYS.has(key)) {
      // Boolean shorthand: `--flag` → true. Allow explicit `--flag true`
      // / `--flag false` via lookahead but treat them as defence-in-depth
      // only — the canonical form is `--flag` alone.
      const next = argv[i + 1];
      if (next === "true" || next === "false") {
        raw[key] = next === "true";
        i++;
      } else {
        raw[key] = true;
      }
      continue;
    }

    if (NUMERIC_KEYS.has(key)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        return {
          ok: false,
          error: {
            code: "PARSE_ERROR",
            message: `${tok} missing value`,
            hint: `Pass ${tok} <integer>; the value must follow the flag.`,
            issues: [],
          },
        };
      }
      const parsed = Number.parseInt(value, 10);
      if (
        Number.isNaN(parsed) ||
        !Number.isInteger(parsed) ||
        !/^-?\d+$/.test(value.trim()) ||
        String(parsed) !== value.trim()
      ) {
        return {
          ok: false,
          error: {
            code: "PARSE_ERROR",
            message: `${tok} expected positive integer, got "${value}"`,
            hint: `Pass ${tok} <positive integer> (got "${value}").`,
            issues: [],
          },
        };
      }
      raw[key] = parsed;
      i++;
      continue;
    }

    if (STRING_KEYS.has(key)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        return {
          ok: false,
          error: {
            code: "PARSE_ERROR",
            message: `${tok} missing value`,
            hint: `Pass ${tok} <value>; the value must follow the flag.`,
            issues: [],
          },
        };
      }
      raw[key] = value;
      i++;
      continue;
    }

    // Unknown flag — surface verbatim per Story 1.7 precedent.
    return {
      ok: false,
      error: {
        code: "PARSE_ERROR",
        message: `Unknown flag: ${tok}`,
        hint: `Run /bmad-loop --help to see the supported flags; "${tok}" is not recognised.`,
        issues: [],
      },
    };
  }

  // Validate via Zod — defence-in-depth for type/regex/enum constraints.
  const parsed = LoopArgsSchema.safeParse(raw);
  if (parsed.success) {
    return { ok: true, value: parsed.data };
  }

  const firstIssue = parsed.error.issues[0];
  const issueMessage = firstIssue?.message ?? "unknown parse error";
  const hint = `Run /bmad-loop --help to see the supported flags. (${issueMessage})`;

  return {
    ok: false,
    error: {
      code: "PARSE_ERROR",
      message: parsed.error.message,
      hint,
      issues: parsed.error.issues,
    },
  };
}
