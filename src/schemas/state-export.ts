/**
 * src/schemas/state-export.ts — Zod schema for the `--export-state` JSON
 * wire shape v1 (FR4, FR54, NFR-M3, AR20, AR41).
 *
 * Foundational module per AR41: zero upward imports; only depends on `zod`
 * and the foundational sibling `./state.ts` (re-uses `LastAttemptedSchema`,
 * `LastFailureReasonSchema`, `StateV1Schema.shape.lastSuccessfulStep`).
 *
 * Public surface:
 *   - StateExportV1Schema     — Zod schema for the v1 export shape (7 named
 *                               fields + `schemaVersion`).
 *   - StateExportV1           — `z.infer<typeof StateExportV1Schema>`.
 *   - StateExport             — application-code alias (= StateExportV1 in v0.1).
 *   - StateExportLatestSchema — schema alias for the current version
 *                               (= StateExportV1Schema in v0.1).
 *
 * Wire-shape stability per architecture §line 453: stable within a Stepper
 * MAJOR version. v1 → v2 cannot drop fields; can ADD fields with `.optional()`
 * per AR20 type-alias-chain pattern.
 *
 * The seven AC-line-850 fields:
 *   - currentPhase        — derived from `state.lastSuccessfulStep` via DAG
 *                            node phase lookup (or `null` when unresolved).
 *   - activeEpic          — `state.lastSuccessfulStep?.epic ?? state.lastAttempted?.epic ?? null`.
 *   - lastSuccessfulStep  — pass-through from `state.lastSuccessfulStep`.
 *   - lastAttempted       — pass-through from `state.lastAttempted`.
 *   - lastFailureReason   — pass-through from `state.lastFailureReason`.
 *   - bmadVersion         — pass-through from `state.project.bmadVersion`
 *                            (preserves the `"unknown"` placeholder verbatim
 *                            per FR4 wording "export the current state").
 *   - stepperVersion      — sourced from `STEPPER_VERSION` in `src/version.ts`.
 *
 * Forward-compat: when StateExport gains a v2, `StateExportLatestSchema`
 * repoints; `StateExportV1Schema` stays reserved for migration code (Story 6.x).
 */

import { z } from "zod";
import {
  LastAttemptedSchema,
  LastFailureReasonSchema,
  StateV1Schema,
} from "./state.ts";

export const StateExportV1Schema = z.object({
  schemaVersion: z.literal(1),
  currentPhase: z
    .enum(["analysis", "planning", "solutioning", "implementation", "retro"])
    .nullable(),
  activeEpic: z.number().nullable(),
  lastSuccessfulStep: StateV1Schema.shape.lastSuccessfulStep,
  lastAttempted: LastAttemptedSchema.nullable(),
  lastFailureReason: LastFailureReasonSchema.nullable(),
  bmadVersion: z.string(),
  stepperVersion: z.string(),
});

export type StateExportV1 = z.infer<typeof StateExportV1Schema>;
export type StateExport = StateExportV1;
export const StateExportLatestSchema = StateExportV1Schema;
