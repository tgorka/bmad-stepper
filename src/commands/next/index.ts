/**
 * src/commands/next/index.ts — public barrel for the `next` command.
 *
 * Story 1.7 exports the args parser surface:
 *   - parseNextArgs (function)
 *   - NextArgs (type, Zod-inferred)
 *   - NextArgsSchema (Zod schema)
 *   - ParseError (value-object type for the Result error channel)
 *   - Result (discriminated union; sole AR33 throw-everywhere exception)
 *
 * Story 2.4 extends with the canonical lock-free `/bmad-next` runner:
 *   - runNext (async function — composes loadStateUnlocked + build +
 *     resolvePersona + buildDispatchSpec + emitDispatchAction)
 *   - RunNextOptions (test-injection escape hatches)
 *   - NextResult (structured return value: { exitCode, action })
 *
 * Future stories will extend this barrel:
 *   - Story 2.6 — verify-and-advance.ts adds the post-dispatch verifier
 *     hook + state-hash check.
 *
 * Architecture cross-references:
 * - architecture.md §G D12 (lines 602–629) — hand-rolled Zod-validated
 *   CLI parser; the canonical reference for Story 1.7.
 * - architecture.md §P4 line 858 — Result-shaped CLI parser is the sole
 *   exception to AR33 throw-everywhere.
 * - architecture.md §line 1672 + AR8 — `run.ts` is read-only / lock-free
 *   (Story 2.4 contract).
 * - architecture.md §line 1660 + AR9 — JSON-line stdout protocol
 *   (Story 2.4 emits via emitDispatchAction).
 * - architecture.md "Complete Project Directory Structure" lines 1102–1110
 *   — `src/commands/next/` placement.
 */

export {
  type NextArgs,
  NextArgsSchema,
  type ParseError,
  parseNextArgs,
  parseVerifyAndAdvanceArgs,
  type Result,
  type VerifyAndAdvanceArgs,
  VerifyAndAdvanceArgsSchema,
} from "./args.ts";
export {
  type NextResult,
  type RunNextOptions,
  runNext,
} from "./run.ts";
export {
  type RunVerifyAndAdvanceOptions,
  runVerifyAndAdvance,
  type VerifyAndAdvanceResult,
} from "./verify-and-advance.ts";
