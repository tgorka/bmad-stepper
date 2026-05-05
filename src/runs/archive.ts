/**
 * src/runs/archive.ts — `archiveOldRuns()` 90-day archival of runs/
 * (Story 6.8 — NFR-Sc4; AC-1; AC-3; AR41, AR42).
 *
 * **MID-TIER MODULE per AR41** (architecture lines 1281-1283 — sibling of
 * `write-step.ts`, `build-run-log.ts`, `render-markdown.ts`, `watch.ts`).
 * Allowed imports = foundational only:
 *   - `../io/log.ts` (warn — best-effort per-entry failure log).
 *   - `../io/paths.ts` (assertWithinScope — AR42 + NFR-S2 boundary).
 *   - `node:fs/promises` + `node:path` (standard library).
 * ZERO higher-tier or top-tier imports.
 *
 * **Naming-drift note**: AC-1 in `_bmad-output/planning-artifacts/epics.md`
 * line 1271 references `src/transcript/archive.ts` per the architecture's
 * planning-time naming (architecture line 1215). The codebase implements
 * the runs (transcript) module at `src/runs/` (Story 2.5 close — a
 * documented variance from architecture's pre-implementation listing).
 * Story 6.8 places the archival module at `src/runs/archive.ts` per the
 * codebase truth, preserving AC-1 INTENT byte-equivalently.
 *
 * Algorithm (mirrors Story 2.2 `cleanStagingOrphans` discipline):
 *   1. Resolve `runsRoot` (default RUNS_DEFAULT_PATH), `ageThresholdMs`
 *      (default 90d), `now` (default `new Date()`).
 *   2. If `runsRoot` does not exist → return `{archivedCount:0,
 *      archivedFiles:[]}` (no-op; first-run idempotent).
 *   3. List top-level entries via `fs.readdir(...{withFileTypes:true})`.
 *   4. For each dirent: SKIP if `.archive` (idempotency hard-gate at the
 *      entry-loop level) OR not a regular file. Then `fs.stat` to get
 *      mtime; SKIP if `now - mtime <= threshold`.
 *   5. Compute destination subdir from mtime UTC `<YYYY-MM>` (per OQ-4 —
 *      mtime is canonical truth; filename `<ts>` prefix may drift).
 *   6. `assertWithinScope(destPath)` per AR42 + NFR-S2.
 *   7. `fs.mkdir(destDir, {recursive:true})` (idempotent).
 *   8. `fs.rename(srcPath, destPath)` — atomic same-FS move. On EXDEV
 *      cross-FS error → `fs.copyFile` + `fs.unlink` fallback (per OQ-5).
 *   9. Per-entry exceptions caught + logged via `warn()` + loop continues
 *      (best-effort discipline per Story 2.2 precedent).
 *
 * **AC-1 (epics.md line 1271)**: runs older than 90 days are moved to
 * `runs/.archive/<YYYY-MM>/` (per NFR-Sc4 architecture line 1413).
 *
 * **AC-3 (epics.md line 1275)**: archival is idempotent (running twice in
 * a row is a no-op). The threshold filter on mtime + the `.archive/`
 * skip-at-entry-level naturally re-skip already-moved files.
 *
 * **OQ-1 archive-vs-delete**: AC-1 wording "moves" mandates rename, NOT
 * delete. The historical record is preserved for auditability + future
 * post-mortem reconstruction.
 *
 * **OQ-4 UTC-locked period derivation**: `<YYYY-MM>` is derived from
 * `stat.mtime.toISOString().slice(0, 7)` per the I-48 UTC discipline
 * transitively HONOURED across Stories 6.6 + 6.7 + 6.8.
 *
 * Architecture cross-references:
 *   - architecture.md §line 349 — `runs/.archive/<period>/` directory layout.
 *   - architecture.md §line 1215 — `src/transcript/archive.ts` planning name.
 *   - architecture.md §line 1413 — NFR-Sc4 (90-day archival).
 *   - epics.md §lines 1269-1276 — AC-1/AC-3/AC-4 verbatim.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { warn } from "../io/log.ts";
import { assertWithinScope } from "../io/paths.ts";

/**
 * Default path for the runs/ directory root. Mirrors
 * `src/config/defaults.ts:46` (the `paths.runs` default).
 */
export const RUNS_DEFAULT_PATH = "_bmad-output/.stepper/runs/";

/**
 * 90-day threshold per NFR-Sc4 + AC-1 verbatim.
 * Computed: 90 * 24 * 60 * 60 * 1000 = 7,776,000,000 ms.
 */
export const RUNS_AGE_THRESHOLD_MS_90D = 90 * 24 * 60 * 60 * 1000;

const ARCHIVE_SUBDIR = ".archive";

export interface ArchiveOldRunsOptions {
  /** Test seam: when supplied, overrides the runs directory root. */
  readonly runsRoot?: string;
  /** Test seam: when supplied, overrides the 90-day threshold. */
  readonly ageThresholdMs?: number;
  /** Test seam: when supplied, overrides "now" for deterministic mtime
   * comparisons. */
  readonly now?: Date;
}

export interface ArchiveOldRunsResult {
  readonly archivedCount: number;
  /** Project-relative paths of moved files (destination paths). */
  readonly archivedFiles: readonly string[];
}

/**
 * Archives runs files (markdown transcripts + JSON run-logs) older than
 * `ageThresholdMs` (default 90 days) by moving each to
 * `<runsRoot>/.archive/<YYYY-MM>/<basename>`.
 *
 * Per AC-3 idempotency: the `.archive/` subdir is hard-skipped at the
 * top-level enumeration; subsequent calls find nothing to archive. The
 * test seam options enable deterministic threshold + clock control.
 *
 * Per Story 2.2's `cleanStagingOrphans` precedent, per-entry failures are
 * caught + logged via `warn()` + the loop continues (best-effort).
 *
 * @param opts injected dependencies; production callers omit.
 * @returns aggregate count + list of moved destination paths.
 */
export async function archiveOldRuns(
  opts: ArchiveOldRunsOptions = {},
): Promise<ArchiveOldRunsResult> {
  const runsRoot = opts.runsRoot ?? RUNS_DEFAULT_PATH;
  const ageThresholdMs = opts.ageThresholdMs ?? RUNS_AGE_THRESHOLD_MS_90D;
  const now = opts.now ?? new Date();

  // Step 2: no-op when runsRoot does not exist (first-run idempotent).
  try {
    await fs.access(runsRoot);
  } catch {
    return { archivedCount: 0, archivedFiles: [] };
  }

  // Step 3: top-level enumeration (NOT recursive — `.archive/` subdirs are
  // not re-visited).
  let dirents: import("node:fs").Dirent[];
  try {
    dirents = await fs.readdir(runsRoot, { withFileTypes: true });
  } catch (err) {
    warn(
      `runs: archive failed to enumerate ${runsRoot}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { archivedCount: 0, archivedFiles: [] };
  }

  const archivedFiles: string[] = [];

  for (const dirent of dirents) {
    // Idempotency hard-gate: skip the `.archive/` subdir itself at the
    // entry-loop level so already-archived files are NEVER re-evaluated.
    if (dirent.name === ARCHIVE_SUBDIR) {
      continue;
    }
    // Subdirs other than `.archive/` are forward-deferred (v0.1's runs
    // structure has files only).
    if (!dirent.isFile()) {
      continue;
    }

    const srcPath = path.join(runsRoot, dirent.name);

    try {
      const stat = await fs.stat(srcPath);
      const ageMs = now.getTime() - stat.mtimeMs;
      if (ageMs <= ageThresholdMs) {
        continue;
      }

      // UTC-locked period (per OQ-4 + I-48). mtime is canonical truth.
      const periodYearMonth = stat.mtime.toISOString().slice(0, 7);

      const destDir = path.join(runsRoot, ARCHIVE_SUBDIR, periodYearMonth);
      const destPath = path.join(destDir, dirent.name);

      // AR42 + NFR-S2: every move target re-checked at runtime.
      assertWithinScope(destPath);

      await fs.mkdir(destDir, { recursive: true });

      // Atomic same-FS rename. EXDEV (cross-FS) fallback per OQ-5.
      try {
        await fs.rename(srcPath, destPath);
      } catch (renameErr) {
        const code =
          renameErr instanceof Error && "code" in renameErr
            ? (renameErr as NodeJS.ErrnoException).code
            : undefined;
        if (code === "EXDEV") {
          await fs.copyFile(srcPath, destPath);
          await fs.unlink(srcPath);
        } else {
          throw renameErr;
        }
      }

      archivedFiles.push(destPath);
    } catch (err) {
      warn(
        `runs: archive failed for ${dirent.name}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { archivedCount: archivedFiles.length, archivedFiles };
}
