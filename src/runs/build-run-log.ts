/**
 * src/runs/build-run-log.ts — Pure JSON run-log builder (AR26, NFR-M3, AR41).
 *
 * **MID-TIER module per AR41** (architecture lines 1278-1282). Allowed
 * imports: foundational only — `../schemas/run-log.ts` for the typed
 * `RunLogV1` return. NO IO, no time-of-call dependencies — the `ts` field
 * is derived from `input.nowIso` (caller-supplied) or the runtime clock if
 * absent. NO upward imports.
 *
 * Architecture references:
 *   - §F line 548 (JSON run log shape — `runs/<ts>-<step>.json`).
 *   - §P5 lines 793-813 (worked example — JSON shape verbatim).
 *   - AR26 (epics.md line 206) — JSON run log per step.
 */

import type { RunLogV1 } from "../schemas/run-log.ts";
import type { TranscriptInput } from "./types.ts";

/**
 * Builds a typed `RunLogV1` literal from `TranscriptInput`. Pure function
 * (deterministic for a given input when `input.nowIso` is supplied; when
 * omitted the `ts` field falls back to the wall-clock at call time).
 *
 * The `errors[]` field defaults to `[]` per the schema's
 * `z.array(z.unknown()).default([])` — the builder also defaults defensively
 * (defence-in-depth: both schema-level and builder-level defaults).
 *
 * The `timeout` field declared in `RunLogV1Schema` as optional is NOT
 * populated by Story 2.5; the timeout is already inside `budget.timeoutMs`.
 * Forward-compat: a future Story 6.x may decide to populate `timeout`
 * separately.
 *
 * NO Zod parse inside the builder — the builder returns a typed literal.
 * The Zod parse happens at the writer site (`writeStepTranscript`) as
 * defence-in-depth (per Story 2.2 / 2.4 precedent).
 */
export function buildRunLog(input: TranscriptInput): RunLogV1 {
  return {
    schemaVersion: 1,
    ts: input.nowIso ?? new Date().toISOString(),
    runId: input.runId,
    step: input.stepName,
    epic: input.epic,
    story: input.story,
    phase: input.phase,
    persona: input.persona,
    model: input.model,
    budget: input.budget,
    verifierResult: input.verifierResult,
    stateBefore: input.stateBefore,
    stateAfter: input.stateAfter,
    durationMs: input.durationMs,
    tokensIn: input.tokensIn,
    tokensOut: input.tokensOut,
    errors: input.errors !== undefined ? [...input.errors] : [],
  };
}
