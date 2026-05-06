/**
 * src/failure-ux/retry.ts — Retry policy handler (Story 5.1 AC: 1.1).
 *
 * Pure function. Decides whether to retry or escalate based on the
 * current attempt number and the configured maxRetries cap.
 *
 * Default maxRetries = 2 per architecture line 494 + epics.md §Story 5.1
 * AC line 1061. The cap is RETRIES AFTER THE ORIGINAL — so default 2
 * means UP TO 3 TOTAL ATTEMPTS (original + 2 retries). After the cap,
 * the handler returns { outcome: "escalate" } and the caller
 * (verify-and-advance.ts) re-throws VerifierFailureError with the
 * LAST attempt's failure context.
 *
 * Mid-tier per AR41 (architecture lines 1182-1188). No I/O imports;
 * no side effects.
 */

import type { FailureContext, FailureUxOutcome } from "./index.ts";

export interface RetryHandlerOpts {
  /** Max retries AFTER the original attempt (default 2 → 3 total attempts). */
  readonly maxRetries: number;
}

/**
 * Retry policy handler. Returns:
 *   - { outcome: "retry", nextAttempt: N+1 } when attempt N is under cap.
 *   - { outcome: "escalate", reason: <last context> } when N exceeds cap.
 *
 * Worked example (default maxRetries: 2):
 *   - Attempt 1 (original) fails → retryHandler({attemptNumber: 1}, {maxRetries: 2})
 *     → returns { outcome: "retry", nextAttempt: 2 }
 *   - Attempt 2 (first retry) fails → retryHandler({attemptNumber: 2}, {maxRetries: 2})
 *     → returns { outcome: "retry", nextAttempt: 3 }
 *   - Attempt 3 (second retry) fails → retryHandler({attemptNumber: 3}, {maxRetries: 2})
 *     → returns { outcome: "escalate", reason: <attempt 3 context> }
 *
 * @param context - The failure context for the just-failed attempt.
 * @param opts    - Retry handler options (maxRetries cap).
 * @returns The dispatcher outcome (retry with next attempt number, or escalate).
 */
export function retryHandler(
  context: FailureContext,
  opts: RetryHandlerOpts,
): FailureUxOutcome {
  const { attemptNumber } = context;
  const maxAttempts = opts.maxRetries + 1; // includes original
  if (attemptNumber >= maxAttempts) {
    return { outcome: "escalate", reason: context };
  }
  return { outcome: "retry", nextAttempt: attemptNumber + 1 };
}
