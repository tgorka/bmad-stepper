/**
 * src/runs/index.ts — Public barrel for the runs (transcript) module
 * (FR18, FR43, FR44, FR46, FR54, AR25, AR26, AR41).
 *
 * **MID-TIER module per AR41** (architecture lines 1278-1282). Re-exports
 * the public surface produced by Story 2.5: the dual-writer entry point
 * (`writeStepTranscript`), the pure builders (`buildRunLog`,
 * `renderTranscriptMarkdown`), and the structured input/result type
 * surface. Mirrors the Story 2.2 `src/dispatch/index.ts` barrel pattern.
 *
 * Callers consume `RunLogV1` / `RunLogV1Schema` directly from
 * `src/schemas/run-log.ts` (foundational); Story 2.5 deliberately does NOT
 * re-export schemas through this barrel per AR41 mid-tier rule.
 */

export { buildRunLog } from "./build-run-log.ts";
export { renderTranscriptMarkdown } from "./render-markdown.ts";
export type {
  TranscriptInput,
  WriteStepTranscriptInput,
  WriteStepTranscriptResult,
} from "./types.ts";
export { writeStepTranscript } from "./write-step.ts";
