/**
 * src/commands/next/args.ts — hand-rolled CLI tokenizer + Zod-validated
 * argument schema for the `/bmad-next` command (FR8, FR9, FR10, FR11, FR12,
 * FR13, FR14, FR15, FR27, FR53, FR54, AR21, AR22, AR33, AR41).
 *
 * Top-tier module per AR41 (architecture lines 1294–1302). First source-side
 * `src/commands/` module of the project. First source-side `Result<T, E>`
 * return — architecture line 858 declares the CLI argument parser as the
 * sole exception to AR33's throw-everywhere discipline.
 *
 * ── Public surface ─────────────────────────────────────────────────────────
 *   - NextArgsSchema   — Zod schema enumerating the 20 documented flags
 *                        (Story 1.7 baseline 18 + Story 5.2 `--skip <step>`
 *                        + Story 5.3 `--auto-fix`).
 *                        `.strict()` rejects unknown keys (AC-1 mechanism).
 *   - NextArgs         — `z.infer<typeof NextArgsSchema>` (the typed shape).
 *   - ParseError       — value-object error returned in `{ ok: false, error }`.
 *                        NOT a `StepperError` subclass (intentional, see below).
 *   - Result<T, E>     — `{ ok: true; value: T } | { ok: false; error: E }`.
 *                        The sole Result-shaped surface in v0.1.
 *   - parseNextArgs    — synchronous parser: argv → Result<NextArgs, ParseError>.
 *
 * ── Why Result, not throw? ─────────────────────────────────────────────────
 * Architecture line 858 (P4): "Sole exception: the CLI argument parser
 * returns Result<Args, ParseError>. Argument parsing failure is non-fatal
 * in the sense that we want a pretty error and exit 2 without a stack trace
 * even in development. All other code paths use throw."
 *
 * `ParseError` is intentionally NOT a `StepperError` subclass:
 *   1. `StepperError` extends `Error`; constructing `Error` allocates a
 *      stack trace eagerly via `Error.captureStackTrace`. AC-1 requires
 *      "single-line Zod hint, no stack trace" — using a plain object avoids
 *      the trace allocation entirely.
 *   2. The 16-entry `errors.test.ts` registry stays at 16. Adding a 17th
 *      class would force every CI run to update the `REQUIRED_CODES` list;
 *      since `ParseError` lives on a different channel (Result, not throw),
 *      keeping it out of the registry preserves the throw-everywhere CI gate.
 *
 * ── Why hand-rolled, not commander/oclif/yargs/meow/node:util.parseArgs? ───
 * Architecture §G D12 (lines 602–629) prescribes a hand-rolled tokenizer.
 * Reasons not to use `node:util.parseArgs`:
 *   - D12 explicit choice — "for this flag inventory the hand-rolled
 *     approach is shorter than the framework configuration".
 *   - Output-shape mismatch — `parseArgs` returns `{ values, positionals }`
 *     with Node-runtime semantics; the hand-rolled tokenizer maps cleanly
 *     to Zod's `safeParse` input.
 *   - Bun-first preference (AR33 line 860) — Bun-native APIs preferred.
 *   - Test isolation — pure JS function with no Node-version-specific
 *     behaviour.
 *
 * AR1 forbids new runtime deps; the only external import is `zod`.
 *
 * ── Slash-command argument flow (downstream-only documentation) ────────────
 * Per architecture line 629: Claude expands `$ARGUMENTS` in the slash-command
 * body to the user's tail string. The slash-command prompt instructs Claude
 * to invoke `bun run <plugin-root>/src/commands/next/run.ts -- $ARGUMENTS`.
 * The Bun script (Story 2.4 deliverable) calls `parseNextArgs(process.argv
 * .slice(2))`. If `result.ok === false`, the runner writes `result.error
 * .hint` to stderr (via `error(...)` from `src/io/log.ts`) and exits with
 * code 2 per FR53's "configuration error" bucket.
 *
 * Story 1.7 lands the parser only. The runner (Story 2.4) and slash-command
 * markdown body (Story 2.7) are separate deliverables.
 *
 * ── Cross-validation gap (intentional) ─────────────────────────────────────
 * `--include-optional` and `--no-optional` are mutually exclusive in
 * semantics, but the parser is lenient — both can be passed together and
 * the schema accepts the combination. The runner (Story 2.4) is responsible
 * for cross-validation and emitting an actionable error. Documenting the
 * gap here so the runner author can grep for "cross-validation gap".
 *
 * Empty-string flag values (e.g. `--epic ""`) are accepted by the parser
 * (Zod's `.string().optional()` accepts empty strings); the runner is
 * responsible for treating empty-string flag values as "no filter".
 *
 * ── Logging discipline ─────────────────────────────────────────────────────
 * This module is logging-free. It does NOT import from `src/io/log.ts`. The
 * caller (Story 2.4 runner) writes the Zod hint to stderr after observing
 * `Err(ParseError)`. Biome's `noConsole` rule blocks all `console.*` calls;
 * this module satisfies the rule trivially.
 *
 * ── Architecture cross-references ──────────────────────────────────────────
 * - architecture.md §G CLI Surface & Errors (lines 553–629).
 * - architecture.md §G D11 (lines 555–600) — error class shape.
 * - architecture.md §G D12 (lines 602–629) — hand-rolled Zod-validated
 *   parser; verbatim Zod schema referenced below.
 * - architecture.md §P4 line 858 — Result-shaped CLI parser exception.
 * - architecture.md §AR21 (line 198) — error UX shape (code/hint).
 * - architecture.md §AR22 (line 199) — single-line "Run/See/Try/Check"
 *   actionable-hint regex.
 * - architecture.md §AR33 (line 213) — throw-everywhere + sole Result
 *   exception.
 * - architecture.md §AR41 (line 236) — module boundary graph.
 */

import { z } from "zod";
import {
  type LastAttempted,
  LastAttemptedSchema,
} from "../../schemas/state.ts";

// ─── Public types ──────────────────────────────────────────────────────────

/**
 * Discriminated union for fallible operations. Per architecture line 858,
 * this is the SOLE Result-shaped surface in v0.1 — every other code path
 * throws. Future stories that need Result-shaped returns may either re-export
 * from this module or migrate this type to a foundational `src/types/result.ts`
 * module (deferred decision; see Story 1.7 Dev Notes "Result Helper Type —
 * Colocated, Not Centralised").
 */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

/**
 * Value-object error for CLI argument parse failures. NOT a `StepperError`
 * subclass — see module header for the rationale.
 *
 * Fields:
 *   - code:    literal `"PARSE_ERROR"` (NOT in `StepperErrorCode` union;
 *              NOT in `errors.ts` registry).
 *   - message: full Zod error message (multi-line; useful for run-log dumps).
 *   - hint:    single-line, AR22-compliant hint starting with "Run ".
 *   - issues:  full Zod issue list preserved for the caller.
 */
export type ParseError = {
  code: "PARSE_ERROR";
  message: string;
  hint: string;
  issues: readonly z.ZodIssue[];
};

// ─── Zod schema (verbatim per architecture §G D12 + epics.md AC-1) ─────────

/**
 * Zod schema for the parsed `/bmad-next` arguments. The 20 keys are
 * enumerated character-for-character per epics.md AC-1 + Story 5.2 §FR28
 * + Story 5.3 §FR29:
 *
 *   - 5 optional strings: step, epic, story, persona, skip.
 *   - 1 optional enum:    phase (5 values per architecture line 611).
 *   - 14 booleans (default false): dryRun, resume, includeOptional,
 *     noOptional, explain, list, doctor, upgrade, recomputeState,
 *     exportState, diffState, watch, forceUnlock, autoFix.
 *
 * Story 5.2 ADDS `skip: z.string().optional()` (the 19th key) per FR28
 * + AC line 1076: `--skip <step> --resume` skips the matched step and
 * advances state. The runner enforces co-required relationship with
 * `--resume` (Story 1.7 cross-validation gap closure pattern at
 * `src/commands/next/run.ts`).
 *
 * Story 5.3 ADDS `autoFix: z.boolean().default(false)` (the 20th key)
 * per FR29 + AC line 1092: `--auto-fix` overrides per-step policy to
 * `route-to-fixer` for one run (mirror /bmad-loop --auto-fix per
 * architecture line 499). The runner threads the override unconditionally
 * — when `args.autoFix === true` the per-step failure policy is forced to
 * `"route-to-fixer"` regardless of any per-step config setting.
 *
 * `.strict()` rejects unknown keys. Zod 4.4.1's strict-mode response surfaces
 * an `unrecognized_keys` issue for any flag the schema does not enumerate.
 * This is the AC-1 unknown-flag-rejection mechanism.
 */
export const NextArgsSchema = z
  .object({
    step: z.string().optional(),
    epic: z.string().optional(),
    story: z.string().optional(),
    phase: z
      .enum(["analysis", "planning", "solutioning", "implementation", "retro"])
      .optional(),
    dryRun: z.boolean().default(false),
    resume: z.boolean().default(false),
    // Story 5.2: --skip <step> co-required with --resume per FR28.
    skip: z.string().optional(),
    includeOptional: z.boolean().default(false),
    noOptional: z.boolean().default(false),
    persona: z.string().optional(),
    explain: z.boolean().default(false),
    list: z.boolean().default(false),
    doctor: z.boolean().default(false),
    upgrade: z.boolean().default(false),
    recomputeState: z.boolean().default(false),
    exportState: z.boolean().default(false),
    diffState: z.boolean().default(false),
    watch: z.boolean().default(false),
    forceUnlock: z.boolean().default(false),
    // Story 5.3: --auto-fix overrides per-step policy to route-to-fixer.
    autoFix: z.boolean().default(false),
  })
  .strict();

export type NextArgs = z.infer<typeof NextArgsSchema>;

// ─── Tokenizer helpers ─────────────────────────────────────────────────────

/**
 * Convert a kebab-case flag name (`--dry-run`) into camelCase (`dryRun`).
 * Pure string transformation; safe for empty input (returns "").
 */
function kebabToCamel(input: string): string {
  return input.replace(/-([a-z0-9])/g, (_, ch: string) => ch.toUpperCase());
}

/**
 * Hand-rolled tokenizer per architecture §G D12 (line 627). Walks `argv` and
 * returns a raw object keyed by camelCase flag names. The boolean-coerce step
 * happens here for boolean shorthand (`--dry-run` → true) and for the
 * `--no-optional` negation; the Zod schema handles type validation downstream.
 *
 * Forms supported:
 *   - `--flag=value`            → raw[flag] = "value" (string)
 *   - `--flag value`            → raw[flag] = "value" (string), consume next
 *   - `--flag` (boolean shorthand) → raw[flag] = true
 *
 * The `--no-optional` flag is treated as a regular kebab→camel boolean: the
 * schema key `noOptional` defaults to false; `--no-optional` sets it to true
 * via the standard boolean shorthand pathway. There is no special
 * "negation" handling — `--no-X` for any other X (e.g. `--no-dry-run`) is
 * mapped via kebab→camel to `noDryRun` and rejected by `.strict()`.
 *
 * String→boolean coercion: if the schema key is a boolean and the captured
 * value is the string `"true"` or `"false"`, coerce to the corresponding
 * literal. Any other string (including the empty string) is left as-is so
 * that Zod surfaces a typed error.
 *
 * Unknown flags accumulate in the raw object — `.strict()` makes Zod reject
 * them with an `unrecognized_keys` issue.
 */
function tokenize(argv: readonly string[]): Record<string, string | boolean> {
  const raw: Record<string, string | boolean> = {};
  const booleanKeys = new Set<string>([
    "dryRun",
    "resume",
    "includeOptional",
    "noOptional",
    "explain",
    "list",
    "doctor",
    "upgrade",
    "recomputeState",
    "exportState",
    "diffState",
    "watch",
    "forceUnlock",
    // Story 5.3: --auto-fix
    "autoFix",
  ]);

  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === undefined || !tok.startsWith("--")) continue;
    const body = tok.slice(2);
    const eq = body.indexOf("=");

    if (eq !== -1) {
      // --flag=value form
      const rawKey = body.slice(0, eq);
      const rawValue = body.slice(eq + 1);
      const key = kebabToCamel(rawKey);
      if (
        booleanKeys.has(key) &&
        (rawValue === "true" || rawValue === "false")
      ) {
        raw[key] = rawValue === "true";
      } else {
        raw[key] = rawValue;
      }
      continue;
    }

    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      // --flag value form (consume next)
      const key = kebabToCamel(body);
      if (booleanKeys.has(key) && (next === "true" || next === "false")) {
        raw[key] = next === "true";
      } else {
        raw[key] = next;
      }
      i++;
      continue;
    }

    // --flag boolean shorthand. Both `--no-optional` (which directly maps
    // to the schema key `noOptional`) and any other boolean flag fall
    // through this path. The schema enumerates `noOptional` as a boolean
    // defaulting to false; setting `--no-optional` flips it to true via
    // standard kebab→camel conversion. Other `--no-X` invocations (e.g.
    // `--no-dry-run`) become unknown keys (`noDryRun`) and are rejected
    // by Zod's `.strict()`.
    const key = kebabToCamel(body);
    raw[key] = true;
  }

  return raw;
}

// ─── Public parser ─────────────────────────────────────────────────────────

/**
 * Synchronous parser for the `/bmad-next` argument vector. Returns
 * `Result<NextArgs, ParseError>` per architecture line 858.
 *
 * Algorithm:
 *   1. Tokenize argv → `Record<string, string | boolean>`.
 *   2. `NextArgsSchema.safeParse(raw)` (sync; no IO).
 *   3. On success: `{ ok: true, value: parsed.data }` (defaults applied).
 *   4. On failure: build `ParseError` with single-line AR22-compliant hint
 *      (`Run /bmad-next --help to see the supported flags. (<first-issue>)`).
 *
 * The function is intentionally synchronous — the tokenizer is pure string
 * arithmetic and `safeParse` is sync. Making it async would break Result
 * narrowing for callers and would violate the architecture's "first sync
 * surface" expectation.
 *
 * The function NEVER throws on any input. The Result discriminated union
 * is the sole error channel.
 */
export function parseNextArgs(
  argv: readonly string[],
): Result<NextArgs, ParseError> {
  const raw = tokenize(argv);
  const parsed = NextArgsSchema.safeParse(raw);

  if (parsed.success) {
    return { ok: true, value: parsed.data };
  }

  const firstIssue = parsed.error.issues[0];
  const issueMessage = firstIssue?.message ?? "unknown parse error";
  const hint = `Run /bmad-next --help to see the supported flags. (${issueMessage})`;

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

// ─── Story 2.6: parseVerifyAndAdvanceArgs ──────────────────────────────────

/**
 * Schema for the verify-and-advance argv. Per Story 2.6 epics.md AC + epic
 * line 694 step 5 + architecture Critical Gap Resolution 6 line 1677,
 * Layer 1's slash-command markdown invokes
 * `bun run src/commands/next/verify-and-advance.ts -- --run-id <id>
 * --tokens-in <n> --tokens-out <n>` after the Task tool returns the
 * sub-agent's output + token counts. All three flags are REQUIRED — the
 * runner has no defaults for them.
 *
 * Token counts are non-negative integers (the Task tool returns
 * usage.input_tokens / output_tokens which are always >= 0). The schema
 * uses `.strict()` to reject unknown keys per the parseNextArgs precedent.
 */
export const VerifyAndAdvanceArgsSchema = z
  .object({
    runId: z.string().min(1),
    tokensIn: z.number().int().nonnegative(),
    tokensOut: z.number().int().nonnegative(),
    /**
     * Story 3.1: optional `lastAttempted` payload forwarded by Layer 1's
     * slash-command markdown from the AR9 dispatch line. When omitted (e.g.
     * older bmad-next.md body, or programmatic invocation without the flag),
     * the halt-path state-save sets `state.lastAttempted` to `null`
     * (graceful degradation).
     */
    lastAttempted: LastAttemptedSchema.optional(),
    /**
     * Story 5.2: optional `--skip-step <step>` positional flag forwarded by
     * the runner-tier `src/commands/next/run.ts` when the user invokes
     * `/bmad-next --skip <step> --resume`. When supplied, runVerifyAndAdvance
     * enters the SKIP path (state-mutation only — no dispatch-spec read,
     * no verifier invocation) per AC line 1075-1077. Mirrors the Story 3.1
     * `--last-attempted-json` threading pattern (positional argv flag for
     * the lock-held second-process invocation only — NOT carried in the
     * JSON dispatch-spec).
     */
    skipStep: z.string().optional(),
    /**
     * Story 5.3: optional `--auto-fix` positional flag forwarded by the
     * slash-command markdown when the user invokes `/bmad-next --auto-fix`
     * (or `/bmad-loop --auto-fix`). When `true`, runVerifyAndAdvance forces
     * the per-step failure policy to `"route-to-fixer"` (architecture line
     * 499 — "Loop-level `--auto-fix` flag overrides per-step policy to
     * `route-to-fixer` for one run"). Mirrors the Story 5.2 `--skip-step`
     * positional-flag threading pattern (positional argv flag for the
     * lock-held second-process invocation only — NOT carried in the JSON
     * dispatch-spec).
     */
    autoFix: z.boolean().optional(),
  })
  .strict();

export type VerifyAndAdvanceArgs = z.infer<typeof VerifyAndAdvanceArgsSchema>;

// Re-export the LastAttempted type so the runner-tier (Story 3.1
// `verify-and-advance.ts`) can consume it without an additional import path.
export type { LastAttempted } from "../../schemas/state.ts";

/**
 * Parse the verify-and-advance argv into a structured `VerifyAndAdvanceArgs`.
 * Returns `Result<VerifyAndAdvanceArgs, ParseError>` per the parseNextArgs
 * precedent (architecture line 858 — sole exception to AR33 throw-everywhere
 * applies to BOTH parsers).
 *
 * Algorithm:
 *   1. Initialise `runId | tokensIn | tokensOut` to `undefined`.
 *   2. Iterate argv (skip leading `--` separator if present, since
 *      `bun run script.ts -- --flag` strips one `--` but the Task-tool
 *      orchestration may pass another).
 *   3. For each arg:
 *      - `--run-id <id>` → store `id` (next arg consumed).
 *      - `--tokens-in <n>` → parseInt; on NaN return INVALID_TOKENS_IN.
 *      - `--tokens-out <n>` → analogous.
 *      - Unknown flag → return UNKNOWN_FLAG.
 *   4. After tokenizing, if any of `runId`/`tokensIn`/`tokensOut` is
 *      undefined, return MISSING_REQUIRED.
 *   5. Validate via `VerifyAndAdvanceArgsSchema.parse({...})`; on Zod
 *      error, return ZOD_PARSE.
 *   6. Return `{ ok: true, value: parsed }`.
 *
 * Per AR22, every error hint starts with a concrete next-action verb
 * (`Pass` / `Run`). The hint is single-line.
 *
 * Sync-pure (no IO, no async) per the parseNextArgs precedent.
 */
export function parseVerifyAndAdvanceArgs(
  argv: readonly string[],
): Result<VerifyAndAdvanceArgs, ParseError> {
  let runId: string | undefined;
  let tokensIn: number | undefined;
  let tokensOut: number | undefined;
  let lastAttempted: LastAttempted | undefined;
  // Story 5.2: optional --skip-step <step> threading from the runner-tier
  // when the user invokes `/bmad-next --skip <step> --resume`.
  let skipStep: string | undefined;
  // Story 5.3: optional --auto-fix boolean shorthand threading from the
  // slash-command markdown when the user invokes `/bmad-next --auto-fix`
  // or `/bmad-loop --auto-fix`. Forces failurePolicyOverride =
  // "route-to-fixer" per architecture line 499.
  let autoFix: boolean | undefined;

  // Skip a leading `--` separator if present (may appear when Layer 1
  // passes the args through `bun run -- <argv>`). After Bun's own `--`
  // strip we may still have a user-supplied separator.
  let i = 0;
  if (argv[0] === "--") {
    i = 1;
  }

  for (; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === undefined) continue;

    if (tok === "--run-id") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        return {
          ok: false,
          error: {
            code: "PARSE_ERROR",
            message: "--run-id missing value",
            hint: "Pass --run-id <id>; the value must follow the flag.",
            issues: [],
          },
        };
      }
      runId = value;
      i++;
      continue;
    }

    if (tok === "--tokens-in") {
      const value = argv[i + 1];
      if (value === undefined) {
        return {
          ok: false,
          error: {
            code: "PARSE_ERROR",
            message: "--tokens-in missing value",
            hint: "Pass --tokens-in <integer>; the value must follow the flag.",
            issues: [],
          },
        };
      }
      const parsed = Number.parseInt(value, 10);
      if (
        Number.isNaN(parsed) ||
        !/^-?\d+$/.test(value.trim()) ||
        String(parsed) !== value.trim()
      ) {
        return {
          ok: false,
          error: {
            code: "PARSE_ERROR",
            message: `--tokens-in expected integer, got "${value}"`,
            hint: `Pass --tokens-in <integer> (got "${value}"); the value must be a non-negative integer.`,
            issues: [],
          },
        };
      }
      tokensIn = parsed;
      i++;
      continue;
    }

    if (tok === "--tokens-out") {
      const value = argv[i + 1];
      if (value === undefined) {
        return {
          ok: false,
          error: {
            code: "PARSE_ERROR",
            message: "--tokens-out missing value",
            hint: "Pass --tokens-out <integer>; the value must follow the flag.",
            issues: [],
          },
        };
      }
      const parsed = Number.parseInt(value, 10);
      if (
        Number.isNaN(parsed) ||
        !/^-?\d+$/.test(value.trim()) ||
        String(parsed) !== value.trim()
      ) {
        return {
          ok: false,
          error: {
            code: "PARSE_ERROR",
            message: `--tokens-out expected integer, got "${value}"`,
            hint: `Pass --tokens-out <integer> (got "${value}"); the value must be a non-negative integer.`,
            issues: [],
          },
        };
      }
      tokensOut = parsed;
      i++;
      continue;
    }

    // Story 5.2: optional --skip-step <step> positional flag forwarded
    // by the runner-tier (src/commands/next/run.ts) when the user
    // invokes `/bmad-next --skip <step> --resume`. The value is
    // threaded across the dispatch boundary to runVerifyAndAdvance,
    // which detects args.skipStep !== undefined and enters the skip
    // path. Empty-string is accepted at the parser tier (the runner
    // has already enforced non-empty per the cross-validation gap
    // intentional split — Story 1.7 line 65 + Story 5.2 OQ-1).
    if (tok === "--skip-step") {
      const value = argv[i + 1];
      if (value === undefined) {
        return {
          ok: false,
          error: {
            code: "PARSE_ERROR",
            message: "--skip-step missing value",
            hint: "Pass --skip-step <step>; the value must follow the flag.",
            issues: [],
          },
        };
      }
      skipStep = value;
      i++;
      continue;
    }

    // Story 5.3: optional --auto-fix boolean shorthand. The flag is a
    // pure boolean (no value follows); it forces the per-step failure
    // policy to "route-to-fixer" inside runVerifyAndAdvance (per
    // architecture line 499). Mirrors the Story 5.2 --skip-step
    // positional-flag pattern but with boolean shorthand semantics
    // (no value to consume).
    if (tok === "--auto-fix") {
      autoFix = true;
      continue;
    }

    // Story 3.1: optional --last-attempted-json '<JSON>' flag.
    if (tok === "--last-attempted-json") {
      const value = argv[i + 1];
      if (value === undefined) {
        return {
          ok: false,
          error: {
            code: "PARSE_ERROR",
            message: "--last-attempted-json missing value",
            hint: "Pass --last-attempted-json '<JSON>'; the value must follow the flag.",
            issues: [],
          },
        };
      }
      let payload: unknown;
      try {
        payload = JSON.parse(value);
      } catch (err) {
        return {
          ok: false,
          error: {
            code: "PARSE_ERROR",
            message: `--last-attempted-json payload was not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
            hint: "Pass --last-attempted-json '<JSON>'; the value must be a valid JSON object matching { step, epic, story, attemptedAt }.",
            issues: [],
          },
        };
      }
      const result = LastAttemptedSchema.safeParse(payload);
      if (!result.success) {
        const firstIssue = result.error.issues[0];
        const issueMessage = firstIssue?.message ?? "unknown shape error";
        return {
          ok: false,
          error: {
            code: "PARSE_ERROR",
            message: `--last-attempted-json failed schema validation: ${issueMessage}`,
            hint: `Pass --last-attempted-json '<JSON>' matching { step, epic, story, attemptedAt } (${issueMessage}).`,
            issues: result.error.issues,
          },
        };
      }
      lastAttempted = result.data;
      i++;
      continue;
    }

    // Unknown flag.
    return {
      ok: false,
      error: {
        code: "PARSE_ERROR",
        message: `Unknown flag: ${tok}`,
        hint: `Run /bmad-next --doctor to see supported flags; "${tok}" is not recognised by verify-and-advance.`,
        issues: [],
      },
    };
  }

  if (runId === undefined) {
    return {
      ok: false,
      error: {
        code: "PARSE_ERROR",
        message: "--run-id is required",
        hint: "Pass --run-id <id> --tokens-in <n> --tokens-out <n>; --run-id is missing.",
        issues: [],
      },
    };
  }
  if (tokensIn === undefined) {
    return {
      ok: false,
      error: {
        code: "PARSE_ERROR",
        message: "--tokens-in is required",
        hint: "Pass --run-id <id> --tokens-in <n> --tokens-out <n>; --tokens-in is missing.",
        issues: [],
      },
    };
  }
  if (tokensOut === undefined) {
    return {
      ok: false,
      error: {
        code: "PARSE_ERROR",
        message: "--tokens-out is required",
        hint: "Pass --run-id <id> --tokens-in <n> --tokens-out <n>; --tokens-out is missing.",
        issues: [],
      },
    };
  }

  const parsed = VerifyAndAdvanceArgsSchema.safeParse({
    runId,
    tokensIn,
    tokensOut,
    lastAttempted,
    skipStep,
    autoFix,
  });
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const issueMessage = firstIssue?.message ?? "unknown parse error";
    return {
      ok: false,
      error: {
        code: "PARSE_ERROR",
        message: parsed.error.message,
        hint: `Pass --run-id <id> --tokens-in <n> --tokens-out <n>; the args failed validation (${issueMessage}).`,
        issues: parsed.error.issues,
      },
    };
  }
  return { ok: true, value: parsed.data };
}
