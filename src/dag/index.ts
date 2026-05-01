/**
 * src/dag/index.ts — public barrel for the `src/dag/` mid-tier module
 * (FR1, FR2, FR8, FR9, FR35, FR51, NFR-Sc1, NFR-R1, NFR-I2, AR33, AR41).
 *
 * Story 1.10 exports the global skill-DAG builder + adjacency types. The
 * runner-side wiring (call detection at the top of every command, then
 * call build()) lives in:
 *   - Story 2.4  — `src/commands/next/run.ts` (every /bmad-next call).
 *   - Story 1.12 — `src/commands/doctor/run.ts` (DAG-validity check).
 *   - Story 4.1  — `src/commands/loop/run.ts` (every /bmad-loop call).
 *
 * Per AR41 mid-tier boundary (architecture lines 1278-1304), this barrel
 * re-exports ONLY the public surface: the builder, the Tarjan helper for
 * downstream testability, and the structural types. Internal helpers
 * (the seed array, the hand-rolled YAML extractor) stay private to the
 * module.
 *
 * Note: `seedV6_x` is intentionally NOT re-exported — it stays private to
 * `seed-v6.x.ts` and is consumed only by `build.ts` via intra-module
 * sibling import. `SEED_BMAD_VERSION` IS re-exported so doctor (Story 1.12)
 * can render the BMAD compatibility version.
 */

export { build } from "./build.ts";
export { SEED_BMAD_VERSION } from "./seed-v6.x.ts";
export { tarjanScc } from "./tarjan.ts";
export type {
  BuildInput,
  DagAdjacency,
  DagNode,
  OverrideEntry,
  Phase,
  SeedEntry,
} from "./types.ts";
