/**
 * src/schemas/config.ts — Zod schema for bmad-stepper.config.yaml v1
 * (FR6, FR7, NFR-M3, AR20, AR41).
 *
 * Foundational module per AR41: zero upward imports; only depends on `zod`.
 *
 * The schema captures the top-level structure of the config file as
 * documented in architecture.md §P3 (lines 773–790). Per-step shapes
 * (`overrides[stepId]`, `personas[stepId]`, etc.) are validated by their
 * own stories — Story 1.7 (CLI args), Story 1.10 (DAG overrides), Story
 * 6.x (verifiers/budgets/timeouts) — so the open-shape sub-objects use
 * `z.record(z.string(), z.unknown())` here.
 *
 * Public surface:
 *   - ConfigV1Schema     — Zod schema for v1.
 *   - ConfigV1           — `z.infer<typeof ConfigV1Schema>`.
 *   - Config             — application-code alias (= ConfigV1).
 *   - ConfigLatestSchema — schema alias for the current version.
 */

import { z } from "zod";

export const ConfigV1Schema = z.object({
  schemaVersion: z.literal(1),
  personas: z.record(z.string(), z.unknown()).default({}),
  overrides: z.record(z.string(), z.unknown()).default({}),
  verifiers: z.record(z.string(), z.unknown()).default({}),
  failurePolicies: z.record(z.string(), z.unknown()).default({}),
  models: z.record(z.string(), z.unknown()).default({}),
  budgets: z.record(z.string(), z.unknown()).default({}),
  paths: z.object({
    state: z.string(),
    runs: z.string(),
    staging: z.string(),
    telemetry: z.string(),
  }),
  telemetry: z.object({
    enabled: z.boolean(),
  }),
});

export type ConfigV1 = z.infer<typeof ConfigV1Schema>;
export type Config = ConfigV1;
export const ConfigLatestSchema = ConfigV1Schema;
