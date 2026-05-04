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
 *   - NextArgsSchema   — Zod schema enumerating the 18 documented flags.
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
 * Zod schema for the parsed `/bmad-next` arguments. The 18 keys are
 * enumerated character-for-character per epics.md AC-1:
 *
 *   - 4 optional strings: step, epic, story, persona.
 *   - 1 optional enum:    phase (5 values per architecture line 611).
 *   - 13 booleans (default false): dryRun, resume, includeOptional,
 *     noOptional, explain, list, doctor, upgrade, recomputeState,
 *     exportState, diffState, watch, forceUnlock.
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
