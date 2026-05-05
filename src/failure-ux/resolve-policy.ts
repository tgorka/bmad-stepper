/**
 * src/failure-ux/resolve-policy.ts — Per-step failure-policy resolver
 * (Story 5.6 — FR31 PRIMARY).
 *
 * Pure function. Mid-tier per AR41 (joins src/failure-ux/{retry,skip,
 * route-to-fixer,escalate}.ts as the 5th file in the failure-ux module
 * group). Depends on:
 *   - src/schemas/config.ts FailurePolicies type (foundational tier)
 *   - src/failure-ux/index.ts FailurePolicy type (mid-tier; same module group)
 *
 * **Priority order at the dispatch site** (codified in
 * `src/commands/loop/run.ts`, `src/commands/next/run.ts`, and
 * `src/commands/next/verify-and-advance.ts`):
 *
 *   1. `--auto-fix` flag       → "route-to-fixer" (overrides everything; one-run scope per AC line 1144)
 *   2. `opts.failurePolicyOverride` (test-only seam per OQ-5; production callers do NOT pass)
 *   3. `config.failurePolicies[step]` (this resolver's responsibility)
 *   4. plugin default `escalate` (this resolver's fallback per architecture line 499)
 *
 * The Story 6.1 file loader will pass the parsed config object to this
 * resolver; until Story 6.1 lands, production callers pass `undefined`
 * for `config` → escalate-default for every step.
 *
 * This file REPLACES the Story 5.1 inline stub at
 * `src/failure-ux/index.ts:67-76` (the index file now re-exports
 * `resolveFailurePolicy` from this dedicated file per OQ-1 — separation
 * of concerns mirrors the per-handler file pattern for retry/skip/
 * route-to-fixer/escalate).
 *
 * @param step    The BMAD step ID (e.g., "bmad-dev-story", "bmad-code-review").
 *                Case-sensitive lookup per OQ-4 — the user is responsible for
 *                matching the exact step ID per BMAD method documentation.
 * @param config  Optional parsed config object containing the failurePolicies
 *                record. When omitted OR when `config.failurePolicies` is
 *                undefined OR when the step is not present in the record,
 *                the resolver falls back to the plugin default `escalate`.
 * @returns The resolved FailurePolicy value (one of: retry, skip,
 *          route-to-fixer, escalate).
 */

import type { FailurePolicies } from "../schemas/config.ts";
import type { FailurePolicy } from "./index.ts";

export function resolveFailurePolicy(
  step: string,
  config?: { failurePolicies?: FailurePolicies },
): FailurePolicy {
  const fromConfig = config?.failurePolicies?.[step];
  if (fromConfig !== undefined) {
    return fromConfig;
  }
  return "escalate";
}
