/**
 * src/schemas/state.ts — Zod schema for state.yaml v1 (FR6, FR7, NFR-M3, AR20, AR41).
 *
 * Foundational module per AR41: zero upward imports; only depends on `zod`.
 *
 * Public surface:
 *   - StateV1Schema     — Zod schema for `state.yaml`'s v1 shape.
 *   - StateV1           — `z.infer<typeof StateV1Schema>` (explicit-version type).
 *   - State             — application-code alias (= StateV1 in v0.1).
 *   - StateLatestSchema — schema alias for the current version (= StateV1Schema).
 *
 * Forward-compat: when v2 is introduced, `<Family>` and `<Family>LatestSchema`
 * are repointed at v2; explicit-version types stay reserved for migration code.
 *
 * Sources:
 *   - architecture.md §P3 (lines 747–771) — canonical state.yaml fields.
 *   - architecture.md (line 719)         — type-alias chain.
 */

import { z } from "zod";

export const StateV1Schema = z.object({
  schemaVersion: z.literal(1),
  project: z.object({
    name: z.string(),
    bmadVersion: z.string(),
  }),
  lastSuccessfulStep: z
    .object({
      step: z.string(),
      epic: z.number(),
      story: z.string(),
      completedAt: z.string(),
    })
    .nullable()
    .optional(),
  lastAttempted: z
    .object({
      step: z.string(),
      epic: z.number(),
      story: z.string(),
      attemptedAt: z.string(),
    })
    .nullable()
    .optional(),
  lastFailureReason: z
    .object({
      code: z.string(),
      message: z.string(),
      hint: z.string(),
      runId: z.string(),
    })
    .nullable()
    .optional(),
  lastSnapshot: z
    .object({
      branch: z.string(),
      sha: z.string(),
      takenAt: z.string(),
    })
    .nullable()
    .optional(),
  checkpoints: z.array(z.unknown()).max(50).default([]),
  runHistory: z.array(z.unknown()).max(100).default([]),
});

export type StateV1 = z.infer<typeof StateV1Schema>;
export type State = StateV1;
export const StateLatestSchema = StateV1Schema;
