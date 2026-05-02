/**
 * src/personas/index.ts — public barrel for the `src/personas/` mid-tier
 * module (FR12, FR34, FR40, NFR-R1, NFR-I2, AR33, AR41).
 *
 * Story 1.11 exports the 4-tier persona resolver + the defaults map.
 * The runner-side wiring lives in:
 *   - Story 2.2  — src/dispatch/generate-spec.ts (PERSONA section).
 *   - Story 2.3  — src/dispatch/runner.ts (sequential multi-persona).
 *   - Story 2.4  — src/commands/next/run.ts (calls resolvePersona() per
 *                  candidate next step).
 *   - Story 1.12 — src/commands/doctor/run.ts (persona-resolvability
 *                  smoke check).
 *
 * Per AR41 mid-tier boundary (architecture lines 1278-1304), this barrel
 * re-exports ONLY the public surface — internal helpers (the YAML
 * extractor, the frontmatter parser, the per-tier helpers) stay private
 * to the implementation files.
 */

export { DEFAULT_PERSONAS } from "./defaults.ts";
export type {
  ResolvedPersonaWithTier,
  ResolveInput,
  ResolveOptions,
} from "./resolve.ts";
export { resolvePersona, resolvePersonaWithTier } from "./resolve.ts";
