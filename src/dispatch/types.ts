/**
 * src/dispatch/types.ts — Public type surface for the dispatch module
 * (FR16, AR7, AR9, AR41).
 *
 * **HIGHER-TIER module per AR41** (architecture lines 1287-1289).
 * Re-exports the canonical DispatchSpec / DispatchAction shapes from the
 * foundational schemas; declares dispatch-specific input types.
 *
 * Architecture references:
 *   - §A.D5 lines 167-168 + Story 1.10 DAG seed (planning vs implementation phase).
 *   - §P5 lines 864-917 (dispatch-spec.json contract — input shape mirrors AC-1).
 *   - §line 1660 (AR9 dispatch-action JSON-line protocol).
 */

import type { DispatchActionV1 } from "../schemas/dispatch-protocol.ts";
import type { DispatchSpecV1 } from "../schemas/dispatch-spec.ts";
import type { State } from "../schemas/state.ts";

/**
 * Phase of the BMAD workflow. Per architecture §A.D5 lines 167-168 +
 * Story 1.10 DAG seed: planning phase produces analysis/PRD/architecture
 * artifacts; implementation phase produces stories + dev iterations.
 *
 * NOTE on AC-1 `phase` deferral: AC-1 lists `phase` as a dispatch-spec.json
 * field, but the existing Story 1.5 `DispatchSpecV1Schema` does NOT declare
 * it. Story 2.2 ships the schema verbatim and defers the schema bump to a
 * future Story 6.x (or Story 2.6) ratification. The `Phase` type lives
 * here as a public dispatch-module type so callers can request a phase
 * without depending on a schema bump that hasn't shipped.
 */
export type Phase = "planning" | "implementation";

/**
 * Optional per-step budget override (FR37). Caller may override the
 * default 60k context tokens / 300s timeout per step; missing fields
 * fall through to the architecture-§P5 defaults.
 */
export interface BudgetOverride {
  readonly contextTokens?: number;
  readonly timeoutMs?: number;
}

/**
 * Input shape for buildDispatchSpec(). The signature mirrors AC-1's
 * verbatim function listing: stepName, state, persona, modelOverride?,
 * budgetOverride?. The phase and (epic, story) are extracted from state
 * via the existing State shape (Story 1.5 + Story 1.6) when available;
 * see `BuildDispatchSpecInput` in `./generate-spec.ts` for the v0.1
 * fallback (optional epic/story/phase overrides).
 */
export interface DispatchSpecInput {
  readonly stepName: string;
  readonly state: State;
  readonly persona: string;
  readonly modelOverride?: string;
  readonly budgetOverride?: BudgetOverride;
}

/** Re-exports for caller convenience. */
export type { DispatchActionV1, DispatchSpecV1 };
