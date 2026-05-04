/**
 * src/schemas/dispatch-spec.ts — Zod schema for sub-agent dispatch specs v1
 * (FR6, FR7, NFR-M3, AR20, AR41).
 *
 * Foundational module per AR41: zero upward imports; only depends on `zod`.
 *
 * Dispatch specs land in `_bmad-output/.stepper/runs/<runId>/dispatch.json`
 * (architecture §P5 lines 868–898). Story 2.2 authors the generator; Story
 * 1.5 only declares the schema.
 *
 * The `taskSpec.context` array is intentionally open-shaped (`z.unknown()`)
 * in v0.1 — Story 2.2 will tighten the per-element shape if/when the
 * dispatch contract narrows.
 *
 * Public surface:
 *   - DispatchSpecV1Schema     — Zod schema for v1.
 *   - DispatchSpecV1           — `z.infer<typeof DispatchSpecV1Schema>`.
 *   - DispatchSpec             — application-code alias.
 *   - DispatchSpecLatestSchema — schema alias for the current version.
 */

import { z } from "zod";

export const DispatchSpecV1Schema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string(),
  step: z.string(),
  epic: z.number(),
  story: z.string(),
  model: z.string(),
  budget: z.object({
    contextTokens: z.number(),
    timeoutMs: z.number(),
  }),
  taskSpec: z.object({
    persona: z.string(),
    context: z.array(z.unknown()),
    task: z.string(),
    outputFormat: z.unknown(),
    successCriteria: z.array(z.string()),
    constraints: z.unknown(),
  }),
});

export type DispatchSpecV1 = z.infer<typeof DispatchSpecV1Schema>;
export type DispatchSpec = DispatchSpecV1;
export const DispatchSpecLatestSchema = DispatchSpecV1Schema;
