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
 * Story 4.8 (`--checkpoint-each <step-type>`):
 *   The `state.checkpoints[]` declaration is TIGHTENED from the loose
 *   `z.array(z.unknown())` to a typed `z.array(CheckpointEntrySchema)`. The
 *   per-entry shape (`{ branch, sha, takenAt, stepType }`) is the AR13
 *   Layer 1 wire contract; the `.max(50)` cap + `.default([])` are
 *   preserved verbatim. The 5-value `stepType` enum mirrors the `Phase`
 *   literal-union from `src/dag/types.ts:30-35` (deliberately duplicated
 *   here per OQ-3 because AR41 forbids `src/schemas/` from importing
 *   `src/dag/`). The extension is additive — existing `state.yaml` files
 *   with empty `checkpoints: []` arrays continue to validate cleanly; NO
 *   schema-version bump.
 *
 * Story 5.1 (Epic 5 retry mode — typed `runHistory[]`):
 *   The `state.runHistory[]` declaration is TIGHTENED from the loose
 *   `z.array(z.unknown())` to a typed `z.array(RunHistoryEntrySchema)`
 *   mirroring the Story 4.8 CheckpointEntrySchema precedent. The per-
 *   entry shape (`{ runId, step, epic, story, attemptNumber, outcome,
 *   failureCode, completedAt }`) is the new wire contract; the
 *   `.max(100)` cap + `.default([])` are preserved verbatim. The
 *   `attemptNumber` field is the load-bearing addition for the Epic 5
 *   retry telemetry consumption (Story 6.6/6.7) — original attempt = 1,
 *   first retry = 2, second retry = 3 under default `maxRetries: 2`.
 *   Backwards-compat caveat: existing `state.yaml` files with non-empty
 *   `runHistory[]` entries written PRIOR to Story 5.1 (when the field
 *   was `z.array(z.unknown())`) will fail to validate; recovery is
 *   `--recompute-state` (NFR-R3). NO schema-version bump.
 *
 * Story 5.2 (Epic 5 skip mode — `runHistory[].skipped` marker):
 *   The `RunHistoryEntrySchema` is EXTENDED with one OPTIONAL field
 *   `skipped: z.boolean().optional()`. When set to `true`, the entry
 *   records a skip operation invoked via `/bmad-next --skip <step>
 *   --resume` (NOT a verifier-pass outcome); the `outcome` field stays
 *   `"pass"` per the success-path-shape contract; the `skipped: true`
 *   marker is the FORENSIC RECORD that the verifier was BYPASSED.
 *   Future telemetry (Story 6.6/6.7) iterates `state.runHistory[]`
 *   filtered by `skipped === true` to count skip-events per step.
 *   Per OQ-2 the field is OPTIONAL + undefined-means-false — existing
 *   state.yaml files with non-skip runHistory entries continue to
 *   validate cleanly without migration. NO schema-version bump.
 *
 * Story 5.3 (Epic 5 route-to-fixer mode — `runHistory[].fixAttempt` marker):
 *   The `RunHistoryEntrySchema` is EXTENDED with one OPTIONAL field
 *   `fixAttempt: z.boolean().optional()`. When set to `true`, the entry
 *   records a fix-attempt invoked via `/bmad-next --auto-fix` or
 *   per-step `route-to-fixer` policy (the verifier re-ran on the
 *   fixer's corrected output; pass/fail outcome is the post-fix
 *   verifier result). The `outcome` field stays `"pass"` (post-fix
 *   pass) or `"fail"` (post-fix fail per AC line 1099) per the entry
 *   schema; the `fixAttempt: true` marker is the FORENSIC RECORD that
 *   the entry corresponds to a remediation attempt distinct from a
 *   normal retry attempt (which uses `attemptNumber > 1`). Future
 *   telemetry (Story 6.6/6.7) iterates `state.runHistory[]` filtered
 *   by `fixAttempt === true` to count fix-events per step independently
 *   from retry-event counts. Per OQ-2 the field is OPTIONAL +
 *   undefined-means-false — existing state.yaml files with non-fix
 *   runHistory entries continue to validate cleanly without migration.
 *   NO schema-version bump.
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
 *
 * Story 5.4 (Epic 5 escalate failure mode — actionable-hint regex contract):
 *   Per AC line 1111-1113 the `hint` field MUST match the AR22 regex
 *   `/^.*(Run|See|Try|Check) /` (architecture line 589). This contract is
 *   ENFORCED by the formal escalate handler at `src/failure-ux/escalate.ts`
 *   (which PASS-THROUGHs hints already matching the regex and SHAPEs a
 *   default for non-matching hints) + the integration test at
 *   `src/integration/escalate-actionable-hint.test.ts` (parametrized over
 *   EVERY escalate path). The `runId` field is the canonical run-log path
 *   cross-reference (`_bmad-output/.stepper/runs/<runId>/log.md`) — the
 *   path is DERIVED from runId at presentation time per OQ-1 decision (NO
 *   schema extension needed; the existing 4-field shape is sufficient).
 *   The `code` field is the `StepperErrorCode` of one of the 17 existing
 *   classes (registry held at 17 per AC line 1111 + epic-4-retrospective
 *   §Recommendations item 3). The `message` field is the forensic context
 *   (full Error.message — NOT main-thread visible per NFR-M2; only the
 *   `hint` field is main-thread visible). The schema does NOT enforce the
 *   regex itself — the schema validates the field SHAPE; the handler
 *   enriches the field VALUE.
 */
export const LastFailureReasonSchema = z.object({
  code: z.string(),
  message: z.string(),
  hint: z.string(),
  runId: z.string(),
});

export type LastAttempted = z.infer<typeof LastAttemptedSchema>;
export type LastFailureReason = z.infer<typeof LastFailureReasonSchema>;

/**
 * `state.checkpoints[]` per-entry shape (Story 4.8 — AR13 Layer 1).
 * Appended on each iteration whose just-completed step's phase matches
 * `args.checkpointEach`. FIFO-evicted at 50 entries (architecture
 * line 405 + line 769).
 *
 * Wire shape per AR13 Layer 1:
 *   - branch:    Git branch name at the moment of capture (from
 *                `detectSnapshot()` — Story 1.8 at
 *                `src/snapshot/detect.ts:158-213`). The literal string
 *                `"HEAD"` for detached-HEAD repos.
 *   - sha:       40-char lowercase hex Git SHA at HEAD (from
 *                `detectSnapshot()`).
 *   - takenAt:   ISO 8601 timestamp at the moment of capture.
 *   - stepType:  The matched `Phase` value (one of `analysis`,
 *                `planning`, `solutioning`, `implementation`, `retro`).
 *                Echoes `args.checkpointEach`.
 *
 * The 5-value enum is duplicated here (NOT imported from `src/dag/types.ts`)
 * per AR41 — `src/schemas/` is foundational tier and may NOT import from
 * `src/dag/` (mid-tier). The duplication is a deliberate trade-off
 * documented in Story 4.8 OQ-3; a future Story 6.x may extract the 5
 * phase values into a foundational `src/types/phase.ts` module that all
 * three consumers (`dag/types.ts`, `loop/args.ts`, `schemas/state.ts`)
 * import from.
 */
export const CheckpointEntrySchema = z.object({
  branch: z.string(),
  sha: z.string(),
  takenAt: z.string(),
  stepType: z.enum([
    "analysis",
    "planning",
    "solutioning",
    "implementation",
    "retro",
  ]),
});

export type CheckpointEntry = z.infer<typeof CheckpointEntrySchema>;

/**
 * `state.runHistory[]` per-entry shape (Story 5.1 — Epic 5 retry mode).
 * Appended on each per-attempt outcome (one entry per attempt; attempt 1
 * = original; attempt 2 = first retry; attempt 3 = second retry under
 * default maxRetries: 2).
 *
 * Wire shape per architecture line 770 + epics.md §Story 5.1 AC line 1062:
 *   - runId:         The dispatch run-id at the time of this attempt
 *                    (canonical cross-reference to
 *                    `_bmad-output/.stepper/runs/<runId>/`).
 *   - step:          The BMAD step name attempted.
 *   - epic:          The epic number (1-based).
 *   - story:         The story key (e.g. "5.1").
 *   - attemptNumber: 1-indexed per-step attempt counter (1 = original,
 *                    2 = first retry, 3 = second retry under default
 *                    maxRetries: 2).
 *   - outcome:       Either "pass" (verifier passed) or "fail" (verifier
 *                    failed for this attempt).
 *   - failureCode:   The `StepperErrorCode` of the failure when
 *                    outcome === "fail"; null when outcome === "pass".
 *                    `z.string().nullable()` (NOT enum) per Story 1.5
 *                    schema decision (matches LastFailureReasonSchema.code).
 *   - completedAt:   ISO 8601 timestamp at attempt completion.
 *
 * Migration note: existing `state.yaml` files with empty `runHistory: []`
 * arrays continue to validate cleanly. Projects with non-empty
 * runHistory[] entries written prior to Story 5.1 (when the field was
 * `z.array(z.unknown())`) will fail to validate; recovery is
 * `--recompute-state` (NFR-R3) which rebuilds the cache from disk.
 */
export const RunHistoryEntrySchema = z.object({
  runId: z.string(),
  step: z.string(),
  epic: z.number(),
  story: z.string(),
  attemptNumber: z.number().int().min(1),
  outcome: z.enum(["pass", "fail"]),
  failureCode: z.string().nullable(),
  completedAt: z.string(),
  // Story 5.1 deviation D1 (back-compat): the Story 2.6 inline RunHistoryEntry
  // shape included these fields and they are read by Story 4.5 token
  // accumulation (src/commands/loop/run.ts) and Story 4.x plan-walk
  // completion check (src/commands/loop/plan.ts). Preserving them as
  // OPTIONAL allows existing reads to keep working while the new
  // attemptNumber + outcome + failureCode + completedAt fields land. A
  // future Story 6.x may consolidate the dual-shape into a single
  // canonical entry — for v0.1 the dual fields are written by
  // verify-and-advance.ts and read by the consumers as before.
  verifierStatus: z.enum(["pass", "fail", "skip"]).optional(),
  promotedTo: z.string().nullable().optional(),
  durationMs: z.number().optional(),
  tokensIn: z.number().optional(),
  tokensOut: z.number().optional(),
  ts: z.string().optional(),
  // Story 5.2: skip-mode marker per FR28 + AC line 1077.
  // When set to true, the entry records a skip operation invoked
  // via /bmad-next --skip <step> --resume (NOT a verifier-pass
  // outcome). The `outcome` field above stays "pass" per the
  // success-path-shape contract; the `skipped: true` marker is the
  // forensic record that the verifier was BYPASSED. Future
  // telemetry (Story 6.6/6.7) iterates state.runHistory[] filtered
  // by `skipped === true` to count skip-events per step.
  // Optional + undefined-means-false per Story 5.2 OQ-2 decision —
  // no migration burden on existing entries.
  skipped: z.boolean().optional(),
  // Story 5.3: route-to-fixer mode marker per FR29 + AC line 1096.
  // When set to true, the entry records a fix-attempt invoked via
  // /bmad-next --auto-fix or per-step `route-to-fixer` policy.
  // Distinguishes a fix-attempt entry from a retry-attempt entry
  // (which uses `attemptNumber > 1`); the `outcome` field above
  // stays "pass" or "fail" per the post-fix verifier outcome on the
  // fixer's output. Future telemetry (Story 6.6/6.7) iterates
  // state.runHistory[] filtered by `fixAttempt === true` to count
  // fix-events per step independently from retry-event counts.
  // Optional + undefined-means-false per Story 5.3 OQ-2 decision —
  // no migration burden on existing entries.
  fixAttempt: z.boolean().optional(),
});

export type RunHistoryEntry = z.infer<typeof RunHistoryEntrySchema>;

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
  checkpoints: z.array(CheckpointEntrySchema).max(50).default([]),
  runHistory: z.array(RunHistoryEntrySchema).max(100).default([]),
});

export type StateV1 = z.infer<typeof StateV1Schema>;
export type State = StateV1;
export const StateLatestSchema = StateV1Schema;
