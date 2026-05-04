/**
 * src/commands/doctor/index.ts — public barrel for the `doctor` command
 * (FR40, FR41, FR47, FR49, FR50, FR53, FR54, AR21, AR22, AR33, AR41).
 *
 * Story 1.12 ships the doctor diagnostic runner as the first INTEGRATION
 * command — composes every prior mid-tier module (`bmad-detect/`, `dag/`,
 * `personas/`, `state/`) into a single user-facing surface. The runner is
 * read-only and lock-free per architecture line 1672 (doctor never acquires
 * the project lock and never mutates `state.yaml`).
 *
 * Per AR41 top-tier boundary (architecture lines 1294-1295), this barrel
 * re-exports ONLY the public surface; internal helpers (per-check
 * formatters, output-line builders) stay private to the implementation
 * files. Top-tier-to-top-tier imports (e.g., `next/run.ts` re-exporting
 * `runDoctor` for the `--doctor` flag) are allowed.
 *
 * Architecture cross-references:
 *   - architecture.md §G CLI Surface (lines 553-629) — exit-code mapping
 *     (FR53) + stderr discipline (FR54).
 *   - architecture.md §D1 (lines 1102-1123) — directory layout.
 *   - architecture.md §AR41 (lines 1294-1295) — top-tier boundary.
 *   - architecture.md §1671-1678 — read-only / lock-free + thin-alias
 *     contract.
 */

export type { DoctorArgs, DoctorParseError } from "./args.ts";
export { DoctorArgsSchema, parseDoctorArgs } from "./args.ts";
export type { CheckContext, CheckResult, CheckStatus } from "./checks.ts";
export type { DoctorResult, RunDoctorOptions } from "./run.ts";
export { runDoctor } from "./run.ts";
