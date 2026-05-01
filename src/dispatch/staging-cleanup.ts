/**
 * src/dispatch/staging-cleanup.ts — cleanStagingOrphans() orphan cleanup
 * (AC-4; NFR-S1; AR41).
 *
 * **HIGHER-TIER module per AR41** (architecture lines 1287-1289). Allowed
 * imports:
 *   - foundational: `../io/log.ts` (info() — stderr discipline FR54),
 *     `../io/paths.ts` (STAGING_PATH default).
 *   - Node stdlib: `node:fs/promises` (readdir, stat, rm, access),
 *     `node:path` (join).
 *
 * **FORBIDDEN** imports:
 *   - sibling higher-tier (`../verifiers/`, `../failure-ux/`).
 *   - top-tier (`../commands/`).
 *   - `node:child_process`.
 *
 * Algorithm (AC-4 + Story 2.2 §Tasks 7):
 *   1. Resolve stagingRoot from opts (defaults to STAGING_PATH).
 *   2. If stagingRoot does not exist → return { removedCount: 0, removedDirs: [] }.
 *   3. List immediate subdirs (each is a <runId>/).
 *   4. For each subdir, check mtime; compute ageMs vs (now - mtime).
 *   5. If ageMs > ageThresholdMs (default 24h) AND no completion-marker.json:
 *      `await fs.rm(subdir, { recursive: true, force: true })`.
 *   6. Return { removedCount, removedDirs }.
 *
 * Caller note (Story 2.2 Task 7.5): "at Stepper start" wording (AC-4)
 * implies the runner-tier (Story 2.4 run.ts or Story 2.6
 * verify-and-advance.ts) calls this once per `bun run` invocation.
 * Story 2.2 ships ONLY the function; the wiring lives at runner tier.
 *
 * Architecture references:
 *   - §P5 line 917 (promotion-contract — completion marker preservation).
 *   - §AR41 lines 1287-1289 (higher-tier boundary).
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { info } from "../io/log.ts";
import { STAGING_PATH } from "../io/paths.ts";

const DEFAULT_AGE_THRESHOLD_MS = 86_400_000; // 24h
const DEFAULT_COMPLETION_MARKER = "completion-marker.json";

export interface CleanStagingOrphansOptions {
  /** Injectable timestamp for tests; defaults to new Date(). */
  readonly now?: Date;
  /** Age threshold in ms; defaults to 24h. */
  readonly ageThresholdMs?: number;
  /** Tmpdir override for tests; defaults to STAGING_PATH. */
  readonly stagingRoot?: string;
  /** Marker filename; defaults to "completion-marker.json". */
  readonly completionMarkerName?: string;
}

export interface CleanStagingOrphansResult {
  readonly removedCount: number;
  /** Absolute paths of removed subdirs. */
  readonly removedDirs: readonly string[];
}

/**
 * Enumerates `STAGING_PATH/`'s (or opts.stagingRoot's) immediate subdirs
 * and removes any whose mtime is older than the threshold AND that lack a
 * completion-marker.json file.
 *
 * No-op when stagingRoot does not exist (first-run case).
 *
 * Per-subdir cleanup failures are logged via `info()` (stderr) but do NOT
 * propagate — the function continues with the remaining subdirs.
 */
export async function cleanStagingOrphans(
  opts?: CleanStagingOrphansOptions,
): Promise<CleanStagingOrphansResult> {
  const stagingRoot = opts?.stagingRoot ?? STAGING_PATH;
  const ageThresholdMs = opts?.ageThresholdMs ?? DEFAULT_AGE_THRESHOLD_MS;
  const now = opts?.now ?? new Date();
  const markerName = opts?.completionMarkerName ?? DEFAULT_COMPLETION_MARKER;

  // Step 2: no-op when stagingRoot does not exist.
  try {
    await fs.access(stagingRoot);
  } catch {
    return { removedCount: 0, removedDirs: [] };
  }

  // Step 3: list immediate subdirs.
  let dirents: import("node:fs").Dirent[];
  try {
    dirents = await fs.readdir(stagingRoot, { withFileTypes: true });
  } catch (err) {
    info(
      `dispatch: failed to enumerate staging root ${stagingRoot}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { removedCount: 0, removedDirs: [] };
  }

  const removedDirs: string[] = [];

  for (const dirent of dirents) {
    if (!dirent.isDirectory()) {
      continue;
    }
    const subdir = path.join(stagingRoot, dirent.name);

    // Step 4: check mtime.
    let stat: import("node:fs").Stats;
    try {
      stat = await fs.stat(subdir);
    } catch {
      // Race: dir deleted between readdir and stat — skip.
      continue;
    }
    const ageMs = now.getTime() - stat.mtimeMs;
    if (ageMs <= ageThresholdMs) {
      continue;
    }

    // Step 5: check for completion-marker.json (preservation).
    const markerPath = path.join(subdir, markerName);
    try {
      await fs.access(markerPath);
      // Marker present → preserve.
      continue;
    } catch {
      // Marker absent → eligible for removal.
    }

    try {
      await fs.rm(subdir, { recursive: true, force: true });
      removedDirs.push(subdir);
      info(`dispatch: removed orphan staging dir ${subdir}`);
    } catch (err) {
      info(
        `dispatch: failed to remove orphan staging dir ${subdir}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { removedCount: removedDirs.length, removedDirs };
}
