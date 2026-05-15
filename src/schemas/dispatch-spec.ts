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
 *   - BudgetV1Schema           — Zod schema for the budget sub-object (I-45).
 *   - BudgetV1                 — `z.infer<typeof BudgetV1Schema>`.
 *   - DispatchSpecV1Schema     — Zod schema for v1.
 *   - DispatchSpecV1           — `z.infer<typeof DispatchSpecV1Schema>`.
 *   - DispatchSpec             — application-code alias.
 *   - DispatchSpecLatestSchema — schema alias for the current version.
 */

import { z } from "zod";

/**
 * Strict budget sub-schema for dispatch specs v1 (closes forward-tracker
 * I-45). Uses `.strict()` to reject unknown fields and `.int().positive()`
 * to ensure both `contextTokens` and `timeoutMs` are positive integers.
 */
export const BudgetV1Schema = z
  .object({
    contextTokens: z.number().int().positive(),
    timeoutMs: z.number().int().positive(),
  })
  .strict();

export type BudgetV1 = z.infer<typeof BudgetV1Schema>;

export const DispatchSpecV1Schema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string(),
  step: z.string(),
  epic: z.number(),
  story: z.string(),
  model: z.string(),
  budget: BudgetV1Schema,
  taskSpec: z.object({
    persona: z.string(),
    context: z.array(z.unknown()),
    task: z.string(),
    outputFormat: z.unknown(),
    successCriteria: z.array(z.string()),
    constraints: z.unknown(),
    /**
     * v0.2.1 — optional absolute path to the matching BMad plugin skill's
     * SKILL.md when one is installed. The sub-agent (`bmad-step-runner`)
     * reads this file and follows its instructions as the primary work
     * source — preserving the BMad skill's framework, title conventions,
     * output structure, and quality criteria instead of inventing from
     * the generic `task` text. Absent when no matching BMad skill is
     * installed for this step name (fallback to the generic `task`).
     */
    skillReference: z.string().optional(),
    /**
     * v0.2.1 — optional absolute path to the matching BMad persona skill's
     * SKILL.md (the `bmad-agent-<persona>` convention) when installed.
     * The sub-agent reads this file and adopts the persona's voice +
     * expertise — preserving the BMad persona definition instead of
     * inferring from the bare persona name. Absent when no matching
     * persona skill is installed for this persona name.
     */
    personaReference: z.string().optional(),
  }),
});

export type DispatchSpecV1 = z.infer<typeof DispatchSpecV1Schema>;
export type DispatchSpec = DispatchSpecV1;
export const DispatchSpecLatestSchema = DispatchSpecV1Schema;
