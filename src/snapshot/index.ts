/**
 * src/snapshot/index.ts — public barrel for the `snapshot/` mid-tier module
 * (FR5, FR33, FR55, NFR-R1, NFR-S1, NFR-S2, AR13, AR33, AR41).
 *
 * Re-exports the branch+SHA detector. The branch-switch comparator that
 * compares freshly detected snapshots against `state.yaml.lastSnapshot` and
 * throws `BranchSwitchError` lives in the orchestrator (Story 2.4
 * `src/commands/next/run.ts`); Story 1.8 lands the detection primitive only.
 *
 * AR41 boundary (architecture lines 1278-1304): `src/snapshot/` is a mid-tier
 * module; allowed sibling-tier imports are foundational
 * (`../errors.ts`, `../io/log.ts`). Forbidden imports: `../state/`,
 * `../schemas/`, `../lock/`, `../migrations/`, sibling mid-tier modules,
 * `node:child_process`, external git-helper libraries.
 */

export {
  type DetectSnapshotOptions,
  detectSnapshot,
  type Snapshot,
  type SnapshotLogger,
} from "./detect.ts";
