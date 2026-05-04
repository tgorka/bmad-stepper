/**
 * src/io/paths.ts — Path scope-checker (NFR-S2, AR42).
 *
 * Foundational module per AR41. Sibling foundational imports allowed:
 * `../errors.ts` for `PathologicalInputError` (the registered code we reuse
 * for SCOPE_VIOLATION-class failures — `errors.ts` does not yet have a
 * dedicated `SCOPE_VIOLATION` code, so we route through the existing
 * `PATHOLOGICAL_INPUT` code per the dev-task constraint to avoid mutating
 * the central registry from this story).
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
import { PathologicalInputError } from "../errors.ts";

export const STEPPER_INTERNAL_ROOT = "_bmad-output/.stepper";
export const BMAD_OUTPUT_ROOT = "_bmad-output";

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
 * Throws a `PathologicalInputError` (code `PATHOLOGICAL_INPUT`, exitCode 5)
 * when `targetPath` resolves outside the allowed write roots. The thrown
 * error's `actionableHint` directs the user to the project's path scope
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

  throw new PathologicalInputError(
    `SCOPE_VIOLATION: write target outside allowed roots: ${targetPath} (resolved: ${resolvedTarget})`,
    `allowed roots: ${stepperInternalAbs}, ${bmadOutputAbs}, ${tmpRoot}`,
  );
}
