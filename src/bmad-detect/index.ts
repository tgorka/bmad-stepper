/**
 * src/bmad-detect/index.ts — public barrel for the `bmad-detect/` mid-tier
 * module (FR2, FR41, FR50, FR51, NFR-S1, NFR-R1, AR33, AR41).
 *
 * Story 1.9 exports the BMAD version + skill detectors. The runner-side
 * wiring (call detection at the top of every command) lives in:
 *   - Story 1.12 — `src/commands/doctor/run.ts` (doctor diagnostic).
 *   - Story 2.4  — `src/commands/next/run.ts` (every /bmad-next call).
 *   - Story 4.1  — `src/commands/loop/run.ts` (every /bmad-loop call).
 *
 * Per AR41 mid-tier boundary (architecture lines 1278-1304), this barrel
 * re-exports ONLY the public surface: the two detector functions and the
 * two structural types (`BmadDetection`, `DetectBmadOptions`). Internal
 * helpers (e.g., the shared `_resolvePluginDir`) stay private to the
 * module — the underscore-prefixed export from `./detect-version.ts` is
 * intentionally NOT re-exported here.
 */

export { detectBmadSkills } from "./detect-skills.ts";
export {
  type BmadDetection,
  type DetectBmadOptions,
  detectBmadVersion,
} from "./detect-version.ts";
