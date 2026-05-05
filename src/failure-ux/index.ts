/**
 * src/failure-ux/index.ts — Failure-UX module group public surface
 * (Story 5.1 — Epic 5 retry mode + per-step policy registry per FR31).
 *
 * Mid-tier per AR41 (architecture lines 1182-1188). No upward imports
 * from src/commands/. Foundational dependencies on src/errors.ts +
 * src/schemas/state.ts only.
 *
 * Public surface:
 *   - FailurePolicy        — closed union of 4 policies per architecture line 494-497.
 *   - FailureContext       — failure context shape (mirrors LastFailureReasonSchema).
 *   - FailureUxOutcome     — closed discriminated union of dispatch outcomes.
 *   - resolveFailurePolicy — per-step policy resolver (config + default; Story 5.6 LANDED in `./resolve-policy.ts`).
 *   - dispatchFailureUx    — central dispatcher delegating to handlers.
 *
 * Story 5.1 lands the retry handler. Story 5.2 lands the skip handler.
 * Story 5.3 lands the route-to-fixer handler. Story 5.4 lands the
 * formal escalate handler — COMPLETING the four-handler module group
 * with ZERO stub fallthrough. Story 5.6 LANDED the failurePolicies:
 * config block consumption — the resolver is now in `./resolve-policy.ts`
 * (separation of concerns mirrors the per-handler file pattern for
 * retry/skip/route-to-fixer/escalate). The resolver is RE-EXPORTED
 * from this index module for backwards compatibility with existing
 * consumers.
 */

import { type EscalateHandlerOpts, escalateHandler } from "./escalate.ts";
import { resolveFailurePolicy } from "./resolve-policy.ts";
import { type RetryHandlerOpts, retryHandler } from "./retry.ts";
import {
  type RouteToFixerHandlerOpts,
  routeToFixerHandler,
} from "./route-to-fixer.ts";
import { type SkipHandlerOpts, skipHandler } from "./skip.ts";

/** Closed union of the 4 failure-UX policies (architecture lines 494-497). */
export type FailurePolicy = "retry" | "skip" | "route-to-fixer" | "escalate";

/** Failure context passed to the dispatcher (mirrors LastFailureReasonSchema + step + attemptNumber). */
export interface FailureContext {
  readonly code: string;
  readonly message: string;
  readonly hint: string;
  readonly runId: string;
  readonly step: string;
  readonly attemptNumber: number;
}

/** Closed discriminated union of dispatcher outcomes. */
export type FailureUxOutcome =
  | { readonly outcome: "retry"; readonly nextAttempt: number }
  | { readonly outcome: "skip" }
  | { readonly outcome: "route-to-fixer"; readonly fixerRunId: string }
  | { readonly outcome: "escalate"; readonly reason: FailureContext };

export interface DispatchFailureUxOpts {
  /** Max retries AFTER the original attempt (default 2 → 3 total attempts). */
  readonly maxRetries?: number;
}

/**
 * Resolve the per-step failure policy from config (or default).
 *
 * Story 5.6 LANDED — the resolver is implemented in
 * `./resolve-policy.ts` (separation of concerns mirrors the per-handler
 * file pattern for retry/skip/route-to-fixer/escalate). This re-export
 * preserves backwards compatibility with existing consumers at
 * `src/commands/next/verify-and-advance.ts` and the Story 5.1 dispatcher.
 *
 * Priority order at the dispatch site (codified in run.ts +
 * verify-and-advance.ts):
 *   1. --auto-fix flag → "route-to-fixer" (one-run scope per AC line 1144)
 *   2. opts.failurePolicyOverride (test-only seam per OQ-5)
 *   3. config.failurePolicies[step] (this resolver's responsibility)
 *   4. plugin default "escalate" (architecture line 499)
 */
export { resolveFailurePolicy };

/**
 * Central failure-UX dispatcher. Delegates to per-policy handlers.
 *
 * Story 5.1 lands the retry handler. Story 5.2 lands the skip handler.
 * Story 5.3 lands the route-to-fixer handler. Story 5.4 lands the formal
 * escalate handler — COMPLETING the four-handler module group with ZERO
 * stub fallthrough.
 *
 * @param context - The failure context (code, message, hint, runId, step, attemptNumber).
 * @param policy  - The resolved failure policy for this step.
 * @param opts    - Optional dispatch options (e.g., maxRetries override).
 * @returns The dispatcher outcome (retry, skip, route-to-fixer, or escalate).
 */
export function dispatchFailureUx(
  context: FailureContext,
  policy: FailurePolicy,
  opts: DispatchFailureUxOpts = {},
): FailureUxOutcome {
  switch (policy) {
    case "retry":
      return retryHandler(context, { maxRetries: opts.maxRetries ?? 2 });
    case "skip":
      return skipHandler(context, {});
    case "route-to-fixer":
      return routeToFixerHandler(context, {});
    case "escalate":
      return escalateHandler(context, {});
  }
}

export type {
  EscalateHandlerOpts,
  RetryHandlerOpts,
  RouteToFixerHandlerOpts,
  SkipHandlerOpts,
};
export { escalateHandler, retryHandler, routeToFixerHandler, skipHandler };
