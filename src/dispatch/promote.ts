/**
 * src/dispatch/promote.ts — promote() atomic-copy + completion-marker writer
 * (FR43, FR44, NFR-S2, NFR-S5, NFR-R1, AR21, AR22, AR33, AR41).
 *
 * **HIGHER-TIER module per AR41** (architecture lines 1287-1289). The
 * Story 2.2 deferred deliverable per architecture §line 1178 + Story 2.2
 * §line 93 deferral note. Sibling of `./generate-spec.ts` (Story 2.2),
 * `./emit.ts` (Story 2.2), `./staging-cleanup.ts` (Story 2.2). Owned by
 * Story 2.6 to land the canonical post-verify atomic-copy surface that
 * `verify-and-advance.ts` invokes between the verifier-pass branch and the
 * `saveState` call.
 *
 * Allowed imports per AR41 higher-tier (architecture lines 1287-1289):
 *   - foundational: `../errors.ts` (`VerifierFailureError` for missing /
 *     empty source artifact); `../io/log.ts` (`info` — stderr discipline
 *     per FR54); `../io/paths.ts` (`assertWithinScope`, `BMAD_OUTPUT_ROOT`,
 *     `STAGING_PATH`); `../io/atomic-write.ts` (`atomicWrite` — NFR-S5
 *     atomic write + `.bak` rotation).
 *   - Bun stdlib: `Bun.file`, `Bun.write`.
 *   - Node stdlib: `node:fs/promises` (mkdir), `node:path` (join, dirname).
 *
 * **FORBIDDEN** imports per AR41:
 *   - sibling higher-tier (`../verifiers/`, `../failure-ux/`).
 *   - top-tier (`../commands/`).
 *   - `node:child_process` (no subprocess work in v0.1).
 *   - any new external runtime dep beyond `zod` (transitively pulled by
 *     the foundational modules).
 *
 * Algorithm (architecture §P5 lines 864-917 + Story 2.6 Task 2.2):
 *   1. Resolve options: `stagingRoot` defaults to `STAGING_PATH`;
 *      `canonicalRoot` defaults to `BMAD_OUTPUT_ROOT`; `nowIso` defaults
 *      to `new Date().toISOString()`.
 *   2. Resolve `sourcePath = <stagingRoot>/<runId>/outputs/<artifactFilename ?? stepName + ".md">`.
 *   3. Verify the source exists + is non-empty. Missing → throw
 *      `VerifierFailureError` (defensive — verifier should have caught).
 *      Empty → throw `VerifierFailureError`.
 *   4. Resolve `phaseDir` via `PHASE_TO_DIR` lookup: planning |
 *      analysis | solutioning → `planning-artifacts`; implementation |
 *      retro → `implementation-artifacts`. Unknown phase → defaults to
 *      `implementation-artifacts` (conservative).
 *   5. Resolve `promotedTo = <canonicalRoot>/<phaseDir>/<artifactFilename ?? stepName + ".md">`.
 *   6. `assertWithinScope(promotedTo)` — defensive scope check BEFORE
 *      mkdir (per Story 2.5 dev-002 precedent — surface canonical
 *      `ScopeViolationError` before mkdir's EACCES masks it).
 *   7. Read the source contents via `Bun.file(sourcePath).text()`.
 *   8. Ensure parent dir exists via `fs.mkdir({ recursive: true })`.
 *   9. Atomic write to canonical destination via `atomicWrite(promotedTo,
 *      contents)` — `.bak` rotation + tmp+rename per NFR-S5.
 *  10. Write `staging/<runId>/completion-marker.json` containing
 *      `{ promotedAt, promotedTo, runId, step }` per architecture §P5
 *      line 917 (24-hour cleanup retention).
 *  11. Log `info("promote: copied <bytes> bytes from <sourcePath> to
 *      <promotedTo>")` per FR54.
 *  12. Return `{ promotedTo, sourcePath, bytes, markerPath }`.
 *
 * Error semantics (AR21 + AR22 + AR33):
 *   - `VerifierFailureError` (existing class — code `VERIFIER_FAILURE`,
 *     exitCode 1) — thrown if the source artifact is missing OR empty
 *     (defensive — the verifier should have caught these; promote() is
 *     belt-and-suspenders for the contract boundary).
 *   - `ScopeViolationError` (existing class — code `SCOPE_VIOLATION`,
 *     exitCode 5) — propagated transitively from `assertWithinScope`
 *     (called explicitly in step 6) and from `atomicWrite` (called in
 *     step 9; transitively via its own assertWithinScope).
 *   - Filesystem errors (ENOENT, EACCES, EROFS) — propagate from
 *     `atomicWrite` and `fs.mkdir` per Story 1.3 + Bun.write contracts.
 *   - **NO new error class registration**. Registry stays at 16 codes.
 *
 * Architecture cross-references:
 *   - §P5 lines 864-917 (sub-agent dispatch contract — promote step + 24h cleanup).
 *   - §P5 line 917 (completion-marker.json + cleanStagingOrphans handshake).
 *   - §directory-listing line 1178 (`src/dispatch/promote.ts` placement).
 *   - §line 1287-1289 (AR41 higher-tier import boundary).
 *   - Story 2.2 line 93 (deferral note — Story 2.6 owns this file).
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { VerifierFailureError } from "../errors.ts";
import { atomicWrite } from "../io/atomic-write.ts";
import { info } from "../io/log.ts";
import {
  assertWithinScope,
  BMAD_OUTPUT_ROOT,
  STAGING_PATH,
} from "../io/paths.ts";

const COMPLETION_MARKER_NAME = "completion-marker.json";

/**
 * Phase → canonical artifact-directory mapping per architecture §P5 worked
 * example + Story 2.4's `artifactPathForStep` helper info-3 (Story 2.4
 * senior dev review). The five seed-v6.x phases (analysis, planning,
 * solutioning, implementation, retro) collapse onto two canonical roots:
 *
 *   - planning-artifacts:       analysis | planning | solutioning
 *   - implementation-artifacts: implementation | retro
 *
 * Unknown phases default to `implementation-artifacts` (conservative —
 * Story 6.x may externalize this via per-step config).
 */
const PHASE_TO_DIR: Readonly<
  Record<string, "planning-artifacts" | "implementation-artifacts">
> = {
  analysis: "planning-artifacts",
  planning: "planning-artifacts",
  solutioning: "planning-artifacts",
  implementation: "implementation-artifacts",
  retro: "implementation-artifacts",
};

/**
 * Phase argument accepted by `promote()`. The five-element union mirrors
 * the seed-v6.x DAG phase enum (architecture §A.D5 lines 167-168 + Story
 * 1.10 DAG seed). Unknown phases fall through to `implementation-artifacts`
 * via the `PHASE_TO_DIR` default; `Phase` documents the supported values
 * but does NOT enforce them at the type-system level (callers may pass any
 * string — the lookup is permissive).
 */
export type Phase =
  | "analysis"
  | "planning"
  | "solutioning"
  | "implementation"
  | "retro";

export interface PromoteInput {
  /** Stable run identifier from the dispatch (Story 2.2). */
  readonly runId: string;
  /** BMAD step name (e.g., `"bmad-create-prd"`). */
  readonly stepName: string;
  /** Resolved phase to choose canonical artifact root. */
  readonly phase: Phase;
  /** Tmpdir override for tests; defaults to `STAGING_PATH`. */
  readonly stagingRoot?: string;
  /** Tmpdir override for tests; defaults to `BMAD_OUTPUT_ROOT`. */
  readonly canonicalRoot?: string;
  /**
   * Optional artifact filename under `staging/<runId>/outputs/`; defaults
   * to `<stepName>.md` (the canonical markdown convention).
   */
  readonly artifactFilename?: string;
  /**
   * Injectable timestamp for the completion-marker.json `promotedAt`
   * field. Defaults to `new Date().toISOString()`.
   */
  readonly nowIso?: string;
}

export interface PromoteResult {
  /** Absolute path of the canonical destination after the atomic copy. */
  readonly promotedTo: string;
  /** Absolute path of the source artifact (under staging). */
  readonly sourcePath: string;
  /** Bytes copied (from the source's UTF-8 text length). */
  readonly bytes: number;
  /** Absolute path of the completion-marker.json that was written. */
  readonly markerPath: string;
}

/**
 * Resolves a phase string to its canonical artifact directory name. The
 * v0.1 mapping covers the five seed-v6.x phases; unknown phases fall
 * through to `implementation-artifacts` (conservative). A future Story
 * 6.x may externalize this via project config.
 *
 * Pure function — no IO, no allocation beyond the lookup.
 */
export function resolvePhaseDir(
  phase: string,
): "planning-artifacts" | "implementation-artifacts" {
  return PHASE_TO_DIR[phase] ?? "implementation-artifacts";
}

/**
 * Atomically promotes a staged sub-agent artifact from
 * `staging/<runId>/outputs/<filename>` to its canonical location under
 * `<canonicalRoot>/<phaseDir>/<filename>`, then writes a
 * `staging/<runId>/completion-marker.json` so the staging dir survives
 * Story 2.2's 24h `cleanStagingOrphans` sweep.
 *
 * The function is the canonical post-verify step in the
 * `verify-and-advance.ts` flow (Story 2.6 Task 8.3). It is invoked ONLY
 * after `runVerifier(...)` returns `status: "pass"` — the missing /
 * empty source-artifact paths in steps 3 are defensive / belt-and-
 * suspenders only.
 *
 * @throws {VerifierFailureError} if the source artifact does not exist
 *   OR is empty (defensive — verifier should have caught these).
 * @throws {ScopeViolationError} if the canonical destination resolves
 *   outside the allowed write roots (per `assertWithinScope`).
 */
export async function promote(input: PromoteInput): Promise<PromoteResult> {
  // Step 1: resolve options.
  const stagingRoot = input.stagingRoot ?? STAGING_PATH;
  const canonicalRoot = input.canonicalRoot ?? BMAD_OUTPUT_ROOT;
  const nowIso = input.nowIso ?? new Date().toISOString();
  const artifactFilename = input.artifactFilename ?? `${input.stepName}.md`;

  // Step 2: resolve sourcePath.
  const sourcePath = path.join(
    stagingRoot,
    input.runId,
    "outputs",
    artifactFilename,
  );

  // Step 3: verify source exists + is non-empty (defensive — verifier
  // should have caught these). Story 2.6 Task 3.5 + Task 12.5 + 12.6
  // pre-emptively defend the contract boundary.
  const sourceFile = Bun.file(sourcePath);
  const sourceExists = await sourceFile.exists();
  if (!sourceExists) {
    throw new VerifierFailureError(
      `promote: source artifact missing at ${sourcePath}`,
      `runId=${input.runId}, step=${input.stepName}; the verifier output should have caught this — see _bmad-output/.stepper/staging/${input.runId}/verifier-result.json`,
    );
  }
  const sourceSize = sourceFile.size;
  if (sourceSize === 0) {
    throw new VerifierFailureError(
      `promote: staged artifact is empty at ${sourcePath}`,
      `runId=${input.runId}, step=${input.stepName}; expected non-empty markdown artifact under staging/<runId>/outputs/`,
    );
  }

  // Step 4: resolve phaseDir.
  const phaseDir = resolvePhaseDir(input.phase);

  // Step 5: resolve promotedTo.
  const promotedTo = path.join(canonicalRoot, phaseDir, artifactFilename);

  // Step 6: defensive scope check BEFORE mkdir (per Story 2.5 dev-002
  // precedent — surface canonical ScopeViolationError before mkdir's
  // EACCES masks it). assertWithinScope is also called transitively by
  // atomicWrite, but calling it here surfaces the canonical error earlier.
  assertWithinScope(promotedTo);

  // Step 7: read source contents via Bun.file().text(). Bun.file caches
  // size + content efficiently; the .size check above did not consume the
  // body.
  const contents = await sourceFile.text();
  const bytes = contents.length;

  // Step 8: ensure parent dir exists.
  await fs.mkdir(path.dirname(promotedTo), { recursive: true });

  // Step 9: atomic write to canonical destination (NFR-S5 — .bak rotation
  // via atomicWrite).
  await atomicWrite(promotedTo, contents);

  // Step 10: write completion-marker.json (architecture §P5 line 917 —
  // preserves the staging dir against the 24h cleanStagingOrphans sweep).
  const markerPath = path.join(
    stagingRoot,
    input.runId,
    COMPLETION_MARKER_NAME,
  );
  const marker = {
    runId: input.runId,
    step: input.stepName,
    promotedTo,
    promotedAt: nowIso,
  };
  // The marker is a lightweight handshake (not subject to .bak rotation
  // — the staging dir is ephemeral). Use Bun.write directly for the
  // trailing-newline + JSON-stringified shape.
  await Bun.write(markerPath, `${JSON.stringify(marker, null, 2)}\n`);

  // Step 11: stderr progress log per FR54.
  info(`promote: copied ${bytes} bytes from ${sourcePath} to ${promotedTo}`);

  // Step 12: return the structured result.
  return { promotedTo, sourcePath, bytes, markerPath };
}
