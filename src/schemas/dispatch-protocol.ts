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
 * The discriminated union over `action` carries four variants:
 *   - dispatch: `{ runId, agent, exitCode: 0, lastAttempted? }` — Layer 1
 *     invokes Task against `agent` with the spec at
 *     `staging/<runId>/dispatch-spec.json`. Story 3.1: the OPTIONAL
 *     `lastAttempted` field carries the planned `{ step, epic, story,
 *     attemptedAt }` payload that Layer 1 forwards to
 *     `verify-and-advance.ts` via `--last-attempted-json`. The field is
 *     OPTIONAL so existing callers that emit without it continue to validate.
 *   - invoke-skill: `{ runId, skillName, exitCode: 0, lastAttempted? }` —
 *     v0.2.1 path for steps that map to a matching plugin skill
 *     (`<bmadPluginDir>/skills/<stepName>/SKILL.md` exists). Layer 1
 *     invokes the Skill tool against `skillName` (the fully qualified
 *     `bmad:<stepName>` form) and the rich BMad skill body produces the
 *     canonical artifact directly. The generic `bmad-step-runner`
 *     sub-agent is bypassed, so artifacts carry the BMad skill's own
 *     title/structure/depth instead of the generic dispatch-spec body.
 *     Layer 1 still forwards `lastAttempted` to verify-and-advance via
 *     `--last-attempted-json` for state-mutation symmetry with `dispatch`.
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
    action: z.literal("invoke-skill"),
    runId: z.string(),
    /**
     * Fully qualified Skill tool name for the matching plugin skill,
     * e.g., `bmad:bmad-brainstorming`. Layer 1 invokes the Skill tool
     * against this name so the BMad skill body runs in-thread with full
     * user interaction; the generic `bmad-step-runner` sub-agent is
     * bypassed for this variant.
     */
    skillName: z.string(),
    /**
     * Symmetric with the `dispatch` variant — same payload, same forward
     * path through `--last-attempted-json` to `verify-and-advance.ts`.
     */
    lastAttempted: LastAttemptedSchema.optional(),
    exitCode: z.literal(0),
  }),
  z.object({
    action: z.literal("report"),
    message: z.string(),
    exitCode: z.number().int().min(0),
    /**
     * Optional flag set when the report represents an interactive-step
     * pre-flight halt — Stepper wrote a questions stub at
     * `_bmad-output/.stepper/pending-input/<step>.md` and is waiting
     * for the user (or `/bmad-loop` Layer 1) to fill it. The loop
     * runner uses this flag to break with the `await-input` stop
     * reason instead of the misleading `all-steps-complete`.
     *
     * `awaitInputPath` carries the file path so the loop's exit
     * message can point at it. Both fields are additive — older
     * consumers that ignore them keep working.
     */
    awaitInput: z.boolean().optional(),
    awaitInputPath: z.string().optional(),
    awaitInputStep: z.string().optional(),
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
