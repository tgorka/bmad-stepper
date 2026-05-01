/**
 * src/schemas/dispatch-protocol.ts — Zod schema for the AR9 stdout
 * JSON-line dispatch-action protocol (FR54, AR9, AR41).
 *
 * Foundational module per AR41: zero upward imports; only depends on `zod`
 * and the foundational-tier sibling `./state.ts` for the `LastAttemptedSchema`
 * import (foundational sibling-tier import — explicitly allowed per AR41).
 *
 * Architecture line 1660 + line 1676: `run.ts` emits exactly ONE JSON line
 * on stdout per invocation; Layer 1's slash-command markdown reads that line
 * and branches via `action`. Other modes (`--dry-run`, `--explain`,
 * `--list`) use `action: "report"` and pass content via `message`.
 *
 * The discriminated union over `action` carries three variants:
 *   - dispatch: `{ runId, agent, exitCode: 0, lastAttempted? }` — Layer 1
 *     invokes Task against `agent` with the spec at
 *     `staging/<runId>/dispatch-spec.json`. Story 3.1: the OPTIONAL
 *     `lastAttempted` field carries the planned `{ step, epic, story,
 *     attemptedAt }` payload that Layer 1 forwards to
 *     `verify-and-advance.ts` via `--last-attempted-json`. The field is
 *     OPTIONAL so existing callers that emit without it continue to validate.
 *   - report:   `{ message, exitCode >= 0 }` — Layer 1 prints `message` to
 *     the user (used by --dry-run / --explain / --list).
 *   - halt:     `{ message, exitCode >= 1 }` — Layer 1 prints `message`
 *     (the actionable hint) and exits with the non-zero code.
 *
 * Public surface:
 *   - DispatchActionV1Schema     — Zod discriminated-union schema for v1.
 *   - DispatchActionV1           — `z.infer<typeof DispatchActionV1Schema>`.
 *   - DispatchAction             — application-code alias.
 *   - DispatchActionLatestSchema — schema alias for the current version.
 *
 * Sources:
 *   - architecture.md §line 862 (no `console.log`; stdout reserved for json()).
 *   - architecture.md §line 1460 (AR9 stdout JSON-line emit).
 *   - architecture.md §line 1660 (AR9 protocol concretization — exit-code constraints).
 *   - architecture.md §line 1676 (`src/schemas/dispatch-protocol.ts` deferred-from-step-06 — NEW in Story 2.2).
 *   - prd.md FR54 line 745 (stdout/stderr discipline).
 *   - epics.md §Story 3.1 line 731 (dispatch-spec carries `lastAttempted` — Story 3.1 extends the AR9 line).
 *   - epic-1-retrospective.md §Forward Action Items line 102 (JSON-line protocol design).
 */

import { z } from "zod";
import { LastAttemptedSchema } from "./state.ts";

export const DispatchActionV1Schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("dispatch"),
    runId: z.string(),
    agent: z.string(),
    /**
     * Story 3.1: optional `lastAttempted` payload populated by `run.ts`
     * BEFORE the AR9 emit. Layer 1 captures the field and forwards via
     * `--last-attempted-json '<JSON>'` to `verify-and-advance.ts`.
     * Additive — existing callers that emit without it continue to validate.
     */
    lastAttempted: LastAttemptedSchema.optional(),
    exitCode: z.literal(0),
  }),
  z.object({
    action: z.literal("report"),
    message: z.string(),
    exitCode: z.number().int().min(0),
  }),
  z.object({
    action: z.literal("halt"),
    message: z.string(),
    exitCode: z.number().int().min(1),
  }),
]);

export type DispatchActionV1 = z.infer<typeof DispatchActionV1Schema>;
export type DispatchAction = DispatchActionV1;
export const DispatchActionLatestSchema = DispatchActionV1Schema;
