/**
 * src/telemetry/rotate.ts — `rotateOldTelemetry()` 12-month rotation of
 * telemetry/ JSONL + markdown reports (Story 6.8 — NFR-Sc5; AC-2; AC-3;
 * AR41, AR42).
 *
 * **MID-TIER MODULE per AR41** (architecture line 1283 — sibling of
 * `collect.ts`, `aggregate.ts`, `render-report.ts`, `cli.ts`). Allowed
 * imports = foundational + intra-module sibling:
 *   - `../io/log.ts` (warn — best-effort per-entry log).
 *   - `../io/paths.ts` (assertWithinScope — AR42 + NFR-S2).
 *   - `./collect.ts` (DEFAULT_TELEMETRY_ROOT constant — sibling).
 *   - `node:fs/promises` + `node:path` (standard library).
 * ZERO higher-tier or top-tier imports.
 *
 * Algorithm (mirrors `archiveOldRuns` discipline; differs only in the FLAT
 * `.archive/` layout per architecture line 358 + OQ-8 — telemetry files
 * are ALREADY per-period via the `<YYYY-MM>.{jsonl,md}` filename pattern,
 * so the period-subdir would be redundant):
 *   1. Resolve `telemetryRoot` (default DEFAULT_TELEMETRY_ROOT),
 *      `ageThresholdMs` (default 12m), `now`.
 *   2. If `telemetryRoot` does not exist → return no-op.
 *   3. List top-level entries.
 *   4. For each dirent: SKIP if `.archive` (idempotency) OR not a regular
 *      file OR not matching `/^\d{4}-\d{2}\.(jsonl|md)$/` (foreign-file
 *      gate per OQ-7). Then `fs.stat`; SKIP if mtime within threshold.
 *   5. Compute destination `<telemetryRoot>/.archive/<basename>` (FLAT
 *      layout per architecture line 358).
 *   6. `assertWithinScope(destPath)` per AR42 + NFR-S2.
 *   7. `fs.mkdir(destDir, {recursive:true})`.
 *   8. `fs.rename(srcPath, destPath)` with EXDEV copy-fallback (OQ-5).
 *   9. Per-entry exceptions caught + logged + loop continues.
 *
 * **AC-2 (epics.md line 1274)**: telemetry JSONL + markdown reports older
 * than 12 months are moved to `telemetry/.archive/` (per NFR-Sc5
 * architecture line 1414). Caller (orchestrator at
 * `src/startup/archival-trigger.ts`) gates this on
 * `config.telemetry.enabled === true` per AC-2 verbatim.
 *
 * **OQ-6 ms-arithmetic threshold (resolved)**: Production path now uses
 * calendar-aware arithmetic via `setUTCMonth(now.getUTCMonth() - 12)` to
 * avoid the ~5-day drift of the fixed `12 * 30 * 24 * 60 * 60 * 1000` ms
 * approximation. The constant `TELEMETRY_AGE_THRESHOLD_MS_12M` is retained
 * as a reference/docs value and as the test-seam default when
 * `opts.ageThresholdMs` is supplied.
 *
 * **OQ-7 foreign-file regex skip**: only canonical
 * `<period>.{jsonl,md}` files are rotated. Files like `notes.txt`,
 * `.DS_Store`, etc. are LEFT ALONE — they are not Stepper-owned.
 *
 * **OQ-8 flat archive layout**: telemetry files are already per-period
 * (`<YYYY-MM>.jsonl`); the flat `.archive/` carries the period in the
 * filename — grep-friendly, no additional structure needed.
 *
 * Architecture cross-references:
 *   - architecture.md §line 358 — `telemetry/.archive/` flat layout.
 *   - architecture.md §line 1414 — NFR-Sc5 (12-month rotation).
 *   - epics.md §lines 1273-1276 — AC-2/AC-3/AC-4.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { warn } from "../io/log.ts";
import { assertWithinScope } from "../io/paths.ts";
import { DEFAULT_TELEMETRY_ROOT } from "./collect.ts";

/**
 * 12-month threshold reference constant per NFR-Sc5 + AC-2 verbatim.
 * Computed: 12 * 30 * 24 * 60 * 60 * 1000 = 31,104,000,000 ms (~360 days).
 *
 * Kept for reference/docs and as the test-seam value when
 * `opts.ageThresholdMs` is explicitly supplied. The production default path
 * now uses calendar-aware arithmetic (`setUTCMonth`) — see OQ-6 (resolved).
 */
export const TELEMETRY_AGE_THRESHOLD_MS_12M = 12 * 30 * 24 * 60 * 60 * 1000;

const ARCHIVE_SUBDIR = ".archive";

/** Canonical `<period>.{jsonl,md}` filename pattern (OQ-7 foreign-file
 * gate). */
const TELEMETRY_FILE_PATTERN = /^\d{4}-\d{2}\.(jsonl|md)$/;

export interface RotateOldTelemetryOptions {
  /** Test seam: when supplied, overrides the telemetry directory root. */
  readonly telemetryRoot?: string;
  /** Test seam: overrides the 12-month threshold. */
  readonly ageThresholdMs?: number;
  /** Test seam: overrides `now` for deterministic mtime comparisons. */
  readonly now?: Date;
}

export interface RotateOldTelemetryResult {
  readonly rotatedCount: number;
  /** Project-relative paths of moved files (destination paths). */
  readonly rotatedFiles: readonly string[];
}

/**
 * Rotates telemetry `<period>.jsonl` and `<period>.md` files older than
 * `ageThresholdMs` (default 12 months) by moving each to
 * `<telemetryRoot>/.archive/<basename>` (FLAT layout per OQ-8).
 *
 * Per AC-3 idempotency: the `.archive/` subdir is hard-skipped; subsequent
 * calls find nothing to rotate.
 *
 * Per OQ-7 foreign-file gate: only files matching the canonical
 * `<period>.{jsonl,md}` regex are eligible; foreign files are left alone.
 *
 * Per Story 2.2 precedent: per-entry failures are caught + logged via
 * `warn()` + the loop continues (best-effort).
 *
 * @param opts injected dependencies; production callers omit.
 * @returns aggregate count + list of moved destination paths.
 */
export async function rotateOldTelemetry(
  opts: RotateOldTelemetryOptions = {},
): Promise<RotateOldTelemetryResult> {
  const telemetryRoot = opts.telemetryRoot ?? DEFAULT_TELEMETRY_ROOT;
  const now = opts.now ?? new Date();
  const ageThresholdMs =
    opts.ageThresholdMs ??
    (() => {
      const cutoff = new Date(now);
      cutoff.setUTCMonth(cutoff.getUTCMonth() - 12);
      return now.getTime() - cutoff.getTime();
    })();

  // Step 2: no-op when telemetryRoot does not exist.
  try {
    await fs.access(telemetryRoot);
  } catch {
    return { rotatedCount: 0, rotatedFiles: [] };
  }

  // Step 3: top-level enumeration.
  let dirents: import("node:fs").Dirent[];
  try {
    dirents = await fs.readdir(telemetryRoot, { withFileTypes: true });
  } catch (err) {
    warn(
      `telemetry: rotate failed to enumerate ${telemetryRoot}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { rotatedCount: 0, rotatedFiles: [] };
  }

  const rotatedFiles: string[] = [];

  for (const dirent of dirents) {
    if (dirent.name === ARCHIVE_SUBDIR) {
      continue;
    }
    if (!dirent.isFile()) {
      continue;
    }
    if (!TELEMETRY_FILE_PATTERN.test(dirent.name)) {
      // Foreign file (OQ-7): leave alone.
      continue;
    }

    const srcPath = path.join(telemetryRoot, dirent.name);

    try {
      const stat = await fs.stat(srcPath);
      const ageMs = now.getTime() - stat.mtimeMs;
      if (ageMs <= ageThresholdMs) {
        continue;
      }

      // FLAT layout per OQ-8 — NO `<YYYY-MM>` subdir.
      const destDir = path.join(telemetryRoot, ARCHIVE_SUBDIR);
      const destPath = path.join(destDir, dirent.name);

      assertWithinScope(destPath);

      await fs.mkdir(destDir, { recursive: true });

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

      rotatedFiles.push(destPath);
    } catch (err) {
      warn(
        `telemetry: rotate failed for ${dirent.name}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { rotatedCount: rotatedFiles.length, rotatedFiles };
}
