/**
 * src/io/paths.ts — Path scope-checker (NFR-S2, AR42).
 *
 * Foundational module per AR41. Sibling foundational import allowed:
 * `../errors.ts` for `ScopeViolationError` (the dedicated SCOPE_VIOLATION
 * code introduced in Story 1.5; the throw-site migration from
 * `PathologicalInputError` to `ScopeViolationError` was completed in
 * Story 1.6 Task 6.4 — Story 1.5 review I-finding I3 deferred-task
 * resolution).
 *
 * `assertWithinScope(path)` throws when a write target is outside the three
 * allowed write roots (AR42 + AC-2):
 *   1. `_bmad-output/.stepper/**`  — Stepper internal state.
 *   2. `_bmad-output/**`           — BMAD planning + implementation artifacts.
 *   3. `os.tmpdir()/**`            — process tmpdir (test scratch only, AR35).
 *
 * Reads are NOT validated here — callers in later stories read freely from
 * `_bmad/`, `docs/`, etc. Only writes are scope-checked, per AR42.
 */

import * as os from "node:os";
import * as path from "node:path";
import { ScopeViolationError } from "../errors.ts";

export const STEPPER_INTERNAL_ROOT = "_bmad-output/.stepper";
export const BMAD_OUTPUT_ROOT = "_bmad-output";

/**
 * Canonical staging directory root for sub-agent dispatch
 * (architecture §P5 lines 864-917; Story 2.2 introduces this constant
 * to resolve Story 2.1 dev-002 forward-dep — runVerifier's stagingRoot
 * option can default to STAGING_PATH instead of being REQUIRED).
 *
 * Resolves to `_bmad-output/.stepper/staging` (under STEPPER_INTERNAL_ROOT,
 * so any write target under `STAGING_PATH/<runId>/` is automatically inside
 * the assertWithinScope() allowed roots).
 *
 * Each sub-agent dispatch creates
 * `STAGING_PATH/<runId>/{inputs/, outputs/, dispatch-spec.json}`.
 */
export const STAGING_PATH = `${STEPPER_INTERNAL_ROOT}/staging`;

/**
 * Pending-input directory for interactive BMAD steps. When the next
 * step is flagged `interactive: true`, the runner writes a questions
 * stub at `<PENDING_INPUT_PATH>/<step>.md` and halts; the user (or the
 * loop) fills the stub, then `/bmad-next --resume` includes it as
 * dispatch context and proceeds. The path is step-stable (NOT runId-
 * scoped) so resume can find the same file without threading a runId
 * through `state.lastAttempted`.
 */
export const PENDING_INPUT_PATH = `${STEPPER_INTERNAL_ROOT}/pending-input`;

/**
 * Returns true if `child` (already absolute and normalised) is the same
 * directory as `parent` or strictly inside it. Uses `path.relative()` so the
 * comparison handles trailing-separator differences and platform separators
 * uniformly.
 */
function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  if (rel === "") {
    return true;
  }
  if (rel.startsWith("..")) {
    return false;
  }
  if (path.isAbsolute(rel)) {
    return false;
  }
  return true;
}

/**
 * Throws a `ScopeViolationError` (code `SCOPE_VIOLATION`, exitCode 5) when
 * `targetPath` resolves outside the allowed write roots. The thrown error's
 * `actionableHint` directs the user to the project's path scope
 * documentation.
 *
 * The helper resolves the target against `process.cwd()` as the project
 * root. `path.resolve()` collapses `..` segments before the prefix-match,
 * so traversal escapes are caught (e.g., `_bmad-output/../etc/passwd`
 * resolves to `/etc/passwd` and fails the prefix match).
 *
 * Pure path-string check: no IO, no filesystem access.
 */
export function assertWithinScope(targetPath: string): void {
  const projectRoot = process.cwd();
  const resolvedTarget = path.resolve(projectRoot, targetPath);

  const stepperInternalAbs = path.resolve(projectRoot, STEPPER_INTERNAL_ROOT);
  const bmadOutputAbs = path.resolve(projectRoot, BMAD_OUTPUT_ROOT);
  const tmpRoot = path.resolve(os.tmpdir());

  if (
    isInside(stepperInternalAbs, resolvedTarget) ||
    isInside(bmadOutputAbs, resolvedTarget) ||
    isInside(tmpRoot, resolvedTarget)
  ) {
    return;
  }

  throw new ScopeViolationError(
    `SCOPE_VIOLATION: write target outside allowed roots: ${targetPath} (resolved: ${resolvedTarget})`,
    `allowed roots: ${stepperInternalAbs}, ${bmadOutputAbs}, ${tmpRoot}`,
  );
}
