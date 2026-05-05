/**
 * src/failure-ux/skip.ts — Skip policy handler (Story 5.2 AC: 1.1).
 *
 * Pure function. Returns the skip outcome; the caller
 * (verify-and-advance.ts) translates the outcome to the state
 * mutation: runHistory[].skipped: true + lastSuccessfulStep
 * advance + lastAttempted clear.
 *
 * Mid-tier per AR41 (architecture lines 1182-1188). No I/O imports;
 * no side effects.
 *
 * Story 5.2 design decisions:
 *   - Pure function (mirror Story 5.1 retryHandler precedent).
 *   - Empty SkipHandlerOpts for v0.1 (no fields); future Story 6.x
 *     may extend with `maxConsecutiveSkips` per OQ-7 forward-tracker
 *     idempotent-re-skip protection.
 *   - The handler does NOT mutate state directly — that is the
 *     caller's responsibility (mirrors retryHandler's separation
 *     of decision from mutation).
 *   - The handler is context-agnostic — the outcome is `{outcome:
 *     "skip"}` regardless of the failure context's code/message/hint
 *     /runId/step/attemptNumber. The caller decides (via separate
 *     state.lastAttempted assertion) whether to apply the skip.
 */

import type { FailureContext, FailureUxOutcome } from "./index.ts";

// Empty interface in v0.1; future Story 6.x may extend with
// maxConsecutiveSkips, etc. per OQ-7. Declared as an interface (not a
// type alias) so consumers can extend it via declaration merging if
// helpful.
// biome-ignore lint/suspicious/noEmptyInterface: forward-extensible per OQ-7
export interface SkipHandlerOpts {
  // v0.1: empty. Future Story 6.x: maxConsecutiveSkips, etc.
}

/**
 * Skip policy handler. Returns `{outcome: "skip"}` for any failure
 * context. The caller translates the outcome to state mutation:
 * runHistory[].skipped: true + lastSuccessfulStep advance +
 * lastAttempted clear.
 *
 * @param context - The failure context for the just-failed attempt.
 *                  Read by future Story 6.x for forensic logging; v0.1
 *                  ignores the context (the skip decision is invariant).
 * @param opts    - Skip handler options (empty in v0.1).
 * @returns The dispatcher outcome `{outcome: "skip"}`.
 */
export function skipHandler(
  context: FailureContext,
  _opts: SkipHandlerOpts = {},
): FailureUxOutcome {
  // The context is intentionally unused in v0.1; future Story 6.x may
  // log per-context metadata (e.g., per-step skip counts).
  void context;
  return { outcome: "skip" };
}
