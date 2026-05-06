/**
 * src/failure-ux/route-to-fixer.ts — Route-to-fixer policy handler (Story 5.3 AC: 1.1).
 *
 * Pure function. Returns the route-to-fixer outcome with a deterministic
 * fixerRunId (the original runId with `-fix` suffix); the caller
 * (verify-and-advance.ts) drives the actual fixer dispatch + re-verify
 * based on the returned outcome.
 *
 * Mid-tier per AR41 (architecture lines 1182-1188). No I/O imports;
 * no side effects.
 *
 * Story 5.3 design decisions:
 *   - Pure function (mirror Story 5.1 retryHandler + Story 5.2 skipHandler).
 *   - Empty RouteToFixerHandlerOpts for v0.1 (no fields); future Story
 *     6.x may extend with `maxFixAttempts` per OQ-3 forward-tracker.
 *   - The handler does NOT mutate state directly — that is the caller's
 *     responsibility (mirrors retry/skip handler separation of decision
 *     from mutation).
 *   - The fixerRunId composition rule: `${context.runId}-fix` (deterministic
 *     suffix). The caller uses this to locate the fixer's staging dir
 *     at staging/<fixerRunId>/.
 *
 * The handler is context-agnostic for the OUTCOME — it always returns
 * `{outcome: "route-to-fixer", fixerRunId: <runId>-fix}` regardless of
 * the failure context's code/message/hint/step/attemptNumber. The CALLER
 * decides whether to dispatch the fixer (it owns the side effects:
 * dispatch-spec generation, AR9 emission, post-fix verifier re-run,
 * runHistory append, escalate-on-fail).
 */

import type { FailureContext, FailureUxOutcome } from "./index.ts";

// Empty interface in v0.1; future Story 6.x may extend with
// maxFixAttempts, etc. per OQ-3. Declared as an interface (not a type
// alias) so consumers can extend it via declaration merging if helpful.
// biome-ignore lint/suspicious/noEmptyInterface: forward-extensible per OQ-3
export interface RouteToFixerHandlerOpts {
  // v0.1: empty. Future Story 6.x: maxFixAttempts, etc.
}

/**
 * Route-to-fixer policy handler. Returns
 * `{outcome: "route-to-fixer", fixerRunId: <context.runId>-fix}` for any
 * failure context. The caller (verify-and-advance.ts) translates the
 * outcome to the dispatch + re-verify cycle:
 *   1. Generate the fixer's dispatch-spec at
 *      staging/<fixerRunId>/dispatch-spec.json with verifier-result +
 *      original artifact in the CONTEXT section.
 *   2. Emit the AR9 dispatch action for the fixer (slash-command markdown
 *      reads + dispatches the fixer via the Task tool).
 *   3. Re-run the original verifier on the fixer's output.
 *   4. On pass: PROMOTE the corrected artifact + append a SUCCESS
 *      runHistory entry with `fixAttempt: true`.
 *   5. On fail: APPEND a SECOND runHistory entry with `fixAttempt: true`
 *      + `outcome: "fail"` + ESCALATE via VerifierFailureError throw
 *      (both failures recorded per AC line 1099).
 *
 * @param context - The failure context for the just-failed attempt.
 *                  Only `runId` participates in the outcome derivation;
 *                  the other fields (code/message/hint/step/attemptNumber)
 *                  are forwarded to the caller for forensic logging.
 * @param _opts   - Route-to-fixer handler options (empty in v0.1).
 * @returns The dispatcher outcome
 *          `{outcome: "route-to-fixer", fixerRunId: <runId>-fix}`.
 */
export function routeToFixerHandler(
  context: FailureContext,
  _opts: RouteToFixerHandlerOpts = {},
): FailureUxOutcome {
  return {
    outcome: "route-to-fixer",
    fixerRunId: `${context.runId}-fix`,
  };
}
