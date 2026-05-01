/**
 * src/schemas/run-log.ts — Zod schema for per-step run-log JSON v1
 * (FR6, FR7, NFR-M3, AR20, AR41).
 *
 * Foundational module per AR41: zero upward imports; only depends on `zod`.
 *
 * Run logs land in `_bmad-output/.stepper/runs/<ts>-<step>.json` (architecture
 * line 548). Each record captures the lifecycle of one step dispatch.
 *
 * Public surface:
 *   - RunLogV1Schema     — Zod schema for v1.
 *   - RunLogV1           — `z.infer<typeof RunLogV1Schema>`.
 *   - RunLog             — application-code alias (= RunLogV1).
 *   - RunLogLatestSchema — schema alias for the current version.
 */

import { z } from "zod";

export const RunLogV1Schema = z.object({
  schemaVersion: z.literal(1),
  ts: z.string(),
  runId: z.string(),
  step: z.string(),
  epic: z.number().nullable().optional(),
  story: z.string().nullable().optional(),
  phase: z.string().nullable().optional(),
  persona: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  budget: z.unknown().nullable().optional(),
  timeout: z.unknown().nullable().optional(),
  verifierResult: z.unknown().nullable().optional(),
  stateBefore: z.unknown().nullable().optional(),
  stateAfter: z.unknown().nullable().optional(),
  durationMs: z.number().nullable().optional(),
  tokensIn: z.number().nullable().optional(),
  tokensOut: z.number().nullable().optional(),
  errors: z.array(z.unknown()).default([]),
});

export type RunLogV1 = z.infer<typeof RunLogV1Schema>;
export type RunLog = RunLogV1;
export const RunLogLatestSchema = RunLogV1Schema;
