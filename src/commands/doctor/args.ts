/**
 * src/commands/doctor/args.ts — minimal CLI argument parser for the
 * `/bmad-next --doctor` command (FR41, FR53, FR54, AR21, AR22, AR33, AR41).
 *
 * Top-tier module per AR41. Mirrors Story 1.7's `parseNextArgs`
 * Result-shape pattern verbatim — sole exception to AR33's
 * throw-everywhere discipline (architecture line 858: "Sole exception:
 * the CLI argument parser returns Result<Args, ParseError>").
 *
 * Story 1.12 v0.1 doctor accepts NO additional flags. The schema is
 * intentionally empty (`z.object({}).strict()`). `.strict()` rejects any
 * unknown flag with a Zod `unrecognized_keys` issue → maps to a
 * `PARSE_ERROR` Result.
 *
 * Future stories may extend this schema:
 *   - `--json` for machine-readable output (Story 6.x polish).
 *   - `--strict` to fail on warnings (Story 6.x polish).
 *   - `--check <name>` to run a single check (Story 6.x polish).
 *   - `--upgrade` for the upgrade flow check (Story 6.9; per architecture
 *     line 1378, `--upgrade` lives in `src/upgrade/check.ts`).
 *
 * The `Result<T, E>` and `ParseError` types are RE-EXPORTED from
 * `../next/args.ts` — commands-tier-to-commands-tier imports are NOT
 * banned by AR41 (the mid-tier-to-mid-tier ban does not apply at the
 * commands tier). Cross-importing avoids duplicating the type/value
 * surface between `doctor/args.ts` and `next/args.ts`.
 *
 * Architecture cross-references:
 *   - architecture.md §G D12 (lines 602-629) — hand-rolled Zod-validated
 *     parser; canonical reference.
 *   - architecture.md §P4 line 858 — Result-shaped CLI parser exception.
 *   - architecture.md §AR21 (line 198) — error UX shape (code/hint).
 *   - architecture.md §AR22 (line 199) — single-line "Run/See/Try/Check"
 *     hint regex.
 *   - architecture.md §AR41 (line 236) — module boundary graph.
 */

import { z } from "zod";
import type { ParseError, Result } from "../next/args.ts";

// ─── Public types ──────────────────────────────────────────────────────────

/**
 * Re-export the parser-level Result discriminated union for downstream
 * consumers (notably `runDoctor`'s `import.meta.main` entrypoint). Per
 * Story 1.7 module header, this is the SOLE Result-shaped surface in v0.1
 * — every other code path throws `StepperError` subclasses.
 */
export type { ParseError, Result } from "../next/args.ts";

/**
 * Alias for `ParseError` scoped to the doctor command. Identical shape
 * (`{ code: "PARSE_ERROR"; message; hint; issues }`); the alias exists
 * to keep the doctor barrel's public surface self-documenting.
 */
export type DoctorParseError = ParseError;

// ─── Zod schema (empty in v0.1) ────────────────────────────────────────────

/**
 * Zod schema for the parsed `/bmad-next --doctor` arguments.
 *
 * v0.2 surface (additive over the v0.1 empty schema):
 *   - `verbose` (boolean, optional) — when true, runDoctor emits an
 *     extra "diagnostics" stderr block AFTER the canonical 5 lines:
 *     detected install paths (cache + legacy), DAG node count, seed
 *     version, project state file path, lock dir state, last 3
 *     run-log entries. Read-only; no state mutation. Wired by the
 *     `--verbose` flag in v0.2.0.
 *
 * `.strict()` rejects any unknown key with an `unrecognized_keys`
 * issue. Future flag extensions MUST preserve `.strict()`.
 */
export const DoctorArgsSchema = z
  .object({
    verbose: z.boolean().optional(),
  })
  .strict();

export type DoctorArgs = z.infer<typeof DoctorArgsSchema>;

// ─── Tokenizer (trivial — rejects every flag) ──────────────────────────────

/**
 * Minimal tokenizer for the doctor command. Accepts an empty argv (the
 * v0.1 contract); any non-empty argv produces a raw object containing the
 * unrecognised key, which `.strict()` then rejects.
 *
 * The tokenizer mirrors Story 1.7's kebab→camel conversion for the
 * `--flag=value` and `--flag value` forms; in v0.1 this code path only
 * triggers for unknown flags so the rejection message is informative.
 */
function tokenize(argv: readonly string[]): Record<string, string | boolean> {
  const raw: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === undefined || !tok.startsWith("--")) continue;
    const body = tok.slice(2);
    const eq = body.indexOf("=");
    if (eq !== -1) {
      const rawKey = body.slice(0, eq);
      const rawValue = body.slice(eq + 1);
      raw[kebabToCamel(rawKey)] = rawValue;
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      raw[kebabToCamel(body)] = next;
      i++;
      continue;
    }
    raw[kebabToCamel(body)] = true;
  }
  return raw;
}

function kebabToCamel(input: string): string {
  return input.replace(/-([a-z0-9])/g, (_, ch: string) => ch.toUpperCase());
}

// ─── Public parser ─────────────────────────────────────────────────────────

/**
 * Synchronous parser for the doctor command's argument vector. Returns
 * `Result<DoctorArgs, ParseError>` per architecture line 858.
 *
 * Algorithm:
 *   1. Tokenize argv → `Record<string, string | boolean>`.
 *   2. `DoctorArgsSchema.safeParse(raw)` (sync; no IO).
 *   3. On success: `{ ok: true, value: parsed.data }` (the empty object).
 *   4. On failure: build `ParseError` with single-line AR22-compliant
 *      hint (`Run /bmad-next --doctor [--verbose]. (<first-issue>)`).
 *
 * The function NEVER throws on any input. The Result discriminated union
 * is the sole error channel.
 */
export function parseDoctorArgs(
  argv: readonly string[],
): Result<DoctorArgs, ParseError> {
  const raw = tokenize(argv);
  const parsed = DoctorArgsSchema.safeParse(raw);

  if (parsed.success) {
    return { ok: true, value: parsed.data };
  }

  const firstIssue = parsed.error.issues[0];
  const issueMessage = firstIssue?.message ?? "unknown parse error";
  const hint = `Run /bmad-next --doctor [--verbose]. (${issueMessage})`;

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
