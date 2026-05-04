/**
 * src/commands/next/index.ts — public barrel for the `next` command.
 *
 * Story 1.7 exports the args parser surface only:
 *   - parseNextArgs (function)
 *   - NextArgs (type, Zod-inferred)
 *   - NextArgsSchema (Zod schema)
 *   - ParseError (value-object type for the Result error channel)
 *   - Result (discriminated union; sole AR33 throw-everywhere exception)
 *
 * Subsequent stories will extend this barrel:
 *   - Story 2.4 — runner (run.ts) wires parseNextArgs to recomputeState /
 *     loadState / DAG / dispatch.
 *   - Story 2.6 — verify-and-advance.ts adds the post-dispatch verifier
 *     hook + state-hash check.
 *
 * Architecture cross-references:
 * - architecture.md §G D12 (lines 602–629) — hand-rolled Zod-validated
 *   CLI parser; the canonical reference for this story.
 * - architecture.md §P4 line 858 — Result-shaped CLI parser is the sole
 *   exception to AR33 throw-everywhere.
 * - architecture.md "Complete Project Directory Structure" lines 1102–1110
 *   — `src/commands/next/` placement.
 */

export {
  type NextArgs,
  NextArgsSchema,
  type ParseError,
  parseNextArgs,
  type Result,
} from "./args.ts";
