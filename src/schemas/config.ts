/**
 * src/schemas/config.ts — Zod schema for bmad-stepper.config.yaml v1
 * (FR6, FR7, FR31, NFR-M3, AR20, AR41).
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
 * Story 5.6 NARROWED the `failurePolicies` field from
 * `z.record(z.string(), z.unknown())` to `FailurePoliciesSchema`
 * (closed enum union of 4 values: retry/skip/route-to-fixer/escalate)
 * per FR31. The standalone `FailurePolicySchema` + `FailurePoliciesSchema`
 * exports enable direct reuse by the Story 5.6 resolver tests + the
 * future Story 6.1 file loader. NO schema version bump (still v1; the
 * closed-enum narrowing is BACKWARDS COMPATIBLE for existing fixtures
 * that have `failurePolicies: {}` — the empty record still parses).
 *
 * Public surface:
 *   - ConfigV1Schema         — Zod schema for v1.
 *   - ConfigV1               — `z.infer<typeof ConfigV1Schema>`.
 *   - Config                 — application-code alias (= ConfigV1).
 *   - ConfigLatestSchema     — schema alias for the current version.
 *   - FailurePolicySchema    — closed enum (Story 5.6 — FR31).
 *   - FailurePoliciesSchema  — record of step-id → FailurePolicy (Story 5.6).
 *   - FailurePolicy          — `z.infer<typeof FailurePolicySchema>`.
 *   - FailurePolicies        — `z.infer<typeof FailurePoliciesSchema>`.
 */

import { z } from "zod";

/**
 * Story 5.6 — closed enum union of the 4 per-step failure-UX policies
 * (architecture lines 494-497; FR31 PRIMARY).
 *
 * Mirrors the `FailurePolicy` type alias at `src/failure-ux/index.ts:32`
 * (the two unions are byte-identical; TypeScript treats them as the same
 * type). The schema-side declaration enables Zod parse-time rejection
 * of invalid policy values per OQ-10 (config files with typos surface
 * as a structured ConfigError at load time, not silently fallback).
 */
export const FailurePolicySchema = z.enum([
  "retry",
  "skip",
  "route-to-fixer",
  "escalate",
]);

/**
 * Story 5.6 — record of BMAD step-id → FailurePolicy (FR31 PRIMARY).
 *
 * The keys are BMAD step IDs (e.g., `bmad-create-story`, `bmad-dev-story`,
 * `bmad-code-review`, `bmad-retrospective`); case-sensitive lookup per
 * OQ-4. Absent keys fall back to the plugin default `escalate` per
 * architecture line 499 ("escalate is the safest fallback when no
 * per-step policy is set"). The fallback is implemented at the resolver
 * (`src/failure-ux/resolve-policy.ts`), NOT the schema — the schema
 * accepts an empty record (existing default).
 */
export const FailurePoliciesSchema = z.record(z.string(), FailurePolicySchema);

export type FailurePolicy = z.infer<typeof FailurePolicySchema>;
export type FailurePolicies = z.infer<typeof FailurePoliciesSchema>;

export const ConfigV1Schema = z.object({
  schemaVersion: z.literal(1),
  personas: z.record(z.string(), z.unknown()).default({}),
  overrides: z.record(z.string(), z.unknown()).default({}),
  verifiers: z.record(z.string(), z.unknown()).default({}),
  /**
   * Story 5.6 — per-step failure policy block (FR31 PRIMARY). NARROWED
   * from `z.record(z.string(), z.unknown())` (Story 1.5 baseline) to
   * `FailurePoliciesSchema` (closed enum union). User-authored configs
   * with invalid policy values (e.g., typos) are rejected at parse time
   * with a structured Zod validation error per OQ-10.
   */
  failurePolicies: FailurePoliciesSchema.default({}),
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
