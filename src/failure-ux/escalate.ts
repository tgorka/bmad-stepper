/**
 * src/failure-ux/escalate.ts — Escalate policy handler (Story 5.4 AC: 1.1+1.2+1.3).
 *
 * Pure function. Returns the enriched escalate outcome whose `reason.hint`
 * is GUARANTEED to match the AR22 actionable-hint regex
 * `/^.*(Run|See|Try|Check) /` (architecture line 589 + epics.md §Story 5.4
 * AC line 1113). Mid-tier per AR41 (architecture lines 1182-1188); no I/O
 * imports; no side effects.
 *
 * Story 5.4 design decisions:
 *   - Pure function (mirror Story 5.1 retryHandler + 5.2 skipHandler +
 *     5.3 routeToFixerHandler precedents).
 *   - PASS-THROUGH when `context.hint` already matches the regex (the
 *     common case per OQ-2 pre-audit — all 17 existing StepperError
 *     class actionableHint strings already match).
 *   - SHAPE a default hint when `context.hint` does NOT match (safety-
 *     net for FUTURE error classes or per-instance hintOverrides whose
 *     hint does not satisfy the regex). The shaped default references
 *     the run-log path (derived from `context.runId`) AND the `--resume`
 *     invocation literal per AC line 1111.
 *   - The handler does NOT mutate state directly — that is the caller's
 *     responsibility (mirrors retry/skip/route-to-fixer handler
 *     separation of decision from mutation). The CALLER
 *     (verify-and-advance.ts) constructs the appropriate StepperError
 *     subclass with the enriched hint and throws; the catch handler
 *     persists `lastFailureReason` atomically per Story 3.1 + 1.3.
 *
 * Per OQ-1 decision: NO schema extension — the existing
 * `LastFailureReasonSchema` 4-field shape `{code, message, hint, runId}`
 * is sufficient; the run-log path is derived from `runId` at presentation
 * time (`_bmad-output/.stepper/runs/<runId>/log.md`).
 *
 * Per OQ-9 decision: lock-held mid-tier placement (mirrors Stories
 * 5.1/5.2/5.3 placements; same scope as the throw sites + lastFailureReason
 * write site at verify-and-advance.ts).
 *
 * Per Story 5.1 SDR N-5 forward-tracker (line 1005): "Story 5.2/5.3/5.4 to
 * wire the formal handlers and update the v0.1 stub comment in
 * src/failure-ux/index.ts" — Story 5.4 RESOLVES the LAST stub portion
 * (the `case "escalate"` inline return at lines 102-105). After Story
 * 5.4 the four-handler module group is COMPLETE with ZERO stub
 * fallthrough.
 */

import type { FailureContext, FailureUxOutcome } from "./index.ts";

/**
 * The canonical AR22 actionable-hint regex (architecture line 589 +
 * epics.md §Story 5.4 AC line 1113). EVERY escalate path's
 * `actionableHint` MUST match this regex (enforced by the escalate
 * handler's enrichment + the integration test at
 * `src/integration/escalate-actionable-hint.test.ts`).
 *
 * The regex matches any string that contains one of "Run", "See", "Try",
 * or "Check" followed by a space — the "concrete next-action verb"
 * vocabulary defined in Story 1.2 errors registry CI gate. PASS-THROUGH
 * is the common case for the 17 existing StepperError class hints
 * (per OQ-2 pre-audit).
 */
export const ACTIONABLE_HINT_REGEX = /^.*(Run|See|Try|Check) /;

// Empty interface in v0.1; future Story 6.x may extend with
// `runLogPathFormatter?: (runId: string) => string` per OQ-7
// forward-tracker. Declared as an interface (not a type alias) so
// consumers can extend it via declaration merging if helpful.
// biome-ignore lint/suspicious/noEmptyInterface: forward-extensible per OQ-7
export interface EscalateHandlerOpts {
  // v0.1: empty. Future Story 6.x: runLogPathFormatter, etc.
}

/**
 * Escalate policy handler. Returns
 * `{outcome: "escalate", reason: <enriched-or-pass-through context>}`.
 *
 * Enrichment policy (per OQ-2 decision):
 *   - IF `context.hint` matches `ACTIONABLE_HINT_REGEX` → PASS-THROUGH
 *     (return the context unchanged inside the outcome).
 *   - ELSE shape a default hint of the form `"Run /bmad-next --resume to
 *     retry; see _bmad-output/.stepper/runs/${runId}/log.md for the
 *     failure detail."` (matches the regex via the leading "Run " verb;
 *     references the run-log path + --resume invocation per AC line
 *     1111) and return the outcome with the shaped hint.
 *
 * The handler does NOT mutate the input context — it returns a new
 * outcome object whose `reason` is either the original context (PASS-
 * THROUGH) or a spread copy with the `hint` field replaced (SHAPE).
 *
 * @param context - The failure context for the just-failed attempt.
 * @param _opts   - Escalate handler options (empty in v0.1).
 * @returns The dispatcher outcome
 *          `{outcome: "escalate", reason: <enriched context>}`.
 */
export function escalateHandler(
  context: FailureContext,
  _opts: EscalateHandlerOpts = {},
): FailureUxOutcome {
  if (ACTIONABLE_HINT_REGEX.test(context.hint)) {
    // PASS-THROUGH: the input hint already matches the regex (the common
    // case per OQ-2 audit — all 17 existing StepperError class hints
    // satisfy the regex).
    return { outcome: "escalate", reason: context };
  }
  // SHAPE: the input hint does not match the regex. Construct a default
  // hint that does match (leading "Run " verb), referencing the run-log
  // path (derived from runId per OQ-1 decision) AND the --resume
  // invocation literal per AC line 1111.
  const shapedHint = `Run /bmad-next --resume to retry; see _bmad-output/.stepper/runs/${context.runId}/log.md for the failure detail.`;
  return {
    outcome: "escalate",
    reason: { ...context, hint: shapedHint },
  };
}
