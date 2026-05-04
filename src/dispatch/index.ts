/**
 * src/dispatch/index.ts — Public barrel for the dispatch module
 * (FR16, FR18, FR54, NFR-P3, NFR-S4, NFR-S6, NFR-R1, NFR-S1, NFR-M3,
 *  AR7, AR9, AR21, AR22, AR33, AR41).
 *
 * **HIGHER-TIER module per AR41** (architecture lines 1287-1289).
 * Sibling of `src/verifiers/` (Story 2.1) and `src/failure-ux/` (Epic 5).
 * Depends on foundational + (optionally) mid-tier modules; NEVER on
 * sibling higher-tier modules.
 *
 * Story 2.2 ships:
 *   - buildDispatchSpec(): writes staging/<runId>/dispatch-spec.json.
 *   - emitDispatchAction(): writes one JSON line to stdout per AR9.
 *   - cleanStagingOrphans(): removes orphan staging dirs > 24h on start.
 *
 * Composition of (resolvePersona() → buildDispatchSpec → emitDispatchAction)
 * lives at runner tier (Story 2.4 src/commands/next/run.ts).
 * The promote.ts post-verify step is a separate Story 2.6 deliverable.
 *
 * Architecture references:
 *   - §A.D2 lines 297-336 (sub-agent dispatch via Task tool).
 *   - §P5 lines 864-917 (dispatch-spec.json contract).
 *   - §line 1175 (`src/dispatch/` directory layout).
 *   - §lines 1287-1289 (AR41 higher-tier boundary).
 *   - §line 1660 (AR9 stdout JSON-line protocol).
 *   - §line 1676 (`src/schemas/dispatch-protocol.ts` deferred-from-step-06).
 */

export { emitDispatchAction } from "./emit.ts";
export type {
  BuildDispatchSpecInput,
  BuildDispatchSpecResult,
} from "./generate-spec.ts";
export { buildDispatchSpec } from "./generate-spec.ts";
export type { PromoteInput, PromoteResult } from "./promote.ts";
export { promote, resolvePhaseDir } from "./promote.ts";
export type {
  CleanStagingOrphansOptions,
  CleanStagingOrphansResult,
} from "./staging-cleanup.ts";
export { cleanStagingOrphans } from "./staging-cleanup.ts";
export type {
  BudgetOverride,
  DispatchSpecInput,
  Phase,
} from "./types.ts";
