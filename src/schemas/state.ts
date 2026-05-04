/**
 * src/schemas/state.ts — Zod schema for state.yaml v1 (FR6, FR7, NFR-M3, AR20, AR41).
 *
 * Foundational module per AR41: zero upward imports; only depends on `zod`.
 *
 * Public surface:
 *   - StateV1Schema           — Zod schema for `state.yaml`'s v1 shape.
 *   - StateV1                 — `z.infer<typeof StateV1Schema>` (explicit-version type).
 *   - State                   — application-code alias (= StateV1 in v0.1).
 *   - StateLatestSchema       — schema alias for the current version (= StateV1Schema).
 *   - LastAttemptedSchema     — named extraction of the `lastAttempted` field shape (Story 3.1).
 *   - LastFailureReasonSchema — named extraction of the `lastFailureReason` field shape (Story 3.1).
 *   - LastAttempted           — `z.infer<typeof LastAttemptedSchema>`.
 *   - LastFailureReason       — `z.infer<typeof LastFailureReasonSchema>`.
 *
 * Forward-compat: when v2 is introduced, `<Family>` and `<Family>LatestSchema`
 * are repointed at v2; explicit-version types stay reserved for migration code.
 *
 * Story 3.1 (named-schema extraction):
 *   The `lastAttempted` and `lastFailureReason` field shapes were originally
 *   declared inline on `StateV1Schema` in Story 1.5. Story 3.1 extracts them
 *   into named exports (`LastAttemptedSchema`, `LastFailureReasonSchema`) so
 *   that:
 *     - `src/commands/next/args.ts` can validate the
 *       `--last-attempted-json '<payload>'` flag against `LastAttemptedSchema`.
 *     - `src/commands/next/verify-and-advance.ts` can construct the
 *       `lastFailureReason` literal from a thrown `StepperError`.
 *     - `src/schemas/dispatch-protocol.ts` can carry the `lastAttempted`
 *       payload on the AR9 dispatch action via a foundational-tier sibling
 *       import (allowed per AR41).
 *
 *   The extraction is purely a re-use refactoring — the wire shape is
 *   byte-identical to the prior inline declarations. Existing on-disk
 *   `state.yaml` files validate against the extracted schemas without
 *   migration. NO schema-version bump (V1 stays as V1; the extraction is
 *   additive).
 *
 * Sources:
 *   - architecture.md §P3 (lines 747–771) — canonical state.yaml fields.
 *   - architecture.md (line 719)         — type-alias chain.
 *   - epics.md §Story 3.1 (lines 727–736) — `lastAttempted` + `lastFailureReason` write semantics.
 */

import { z } from "zod";

/**
 * `state.lastAttempted` field shape (Story 3.1 extraction). Populated on
 * every dispatch BEFORE the AR9 line is emitted; cleared on success
 * (set to `null` by `verify-and-advance.ts`); persisted on halt
 * (carried over from `args.lastAttempted`).
 *
 * Wire shape per architecture §P3 lines 759–763:
 *   - step:        the BMAD step name being attempted.
 *   - epic:        the epic number (1-based).
 *   - story:       the story key (e.g. "1.1").
 *   - attemptedAt: ISO 8601 timestamp at the moment the dispatch was emitted.
 */
export const LastAttemptedSchema = z.object({
  step: z.string(),
  epic: z.number(),
  story: z.string(),
  attemptedAt: z.string(),
});

/**
 * `state.lastFailureReason` field shape (Story 3.1 extraction). Written on
 * every halt path inside `verify-and-advance.ts`; cleared on success.
 *
 * Wire shape per architecture §P3 line 764:
 *   - code:    the `StepperErrorCode` of the thrown error (e.g.
 *              "VERIFIER_FAILURE", "TIMEOUT"). The field type is `z.string()`
 *              (NOT the closed enum) per Story 1.5 schema decision — leaves
 *              room for v0.1.x error class additions without a state schema
 *              bump.
 *   - message: the thrown `Error.message` (forensic context).
 *   - hint:    the thrown `StepperError.actionableHint` (single-line, AR22-
 *              compliant; the canonical source-of-truth shared with the AR9
 *              halt action's `message` field).
 *   - runId:   the dispatch run-id at the time of halt (for cross-reference
 *              with `_bmad-output/.stepper/runs/<runId>/`).
 */
export const LastFailureReasonSchema = z.object({
  code: z.string(),
  message: z.string(),
  hint: z.string(),
  runId: z.string(),
});

export type LastAttempted = z.infer<typeof LastAttemptedSchema>;
export type LastFailureReason = z.infer<typeof LastFailureReasonSchema>;

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
  lastAttempted: LastAttemptedSchema.nullable().optional(),
  lastFailureReason: LastFailureReasonSchema.nullable().optional(),
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
