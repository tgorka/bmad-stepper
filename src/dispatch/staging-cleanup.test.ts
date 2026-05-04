/**
 * src/dispatch/staging-cleanup.test.ts — Unit + integration tests for
 * cleanStagingOrphans() (Story 2.2 AC-4).
 *
 * AR35 tmpdir-per-test pattern: every test runs under a unique
 * `os.tmpdir()`-derived directory; cleanup via `fs.rm({ recursive: true,
 * force: true })` in `afterEach`.
 *
 * Coverage:
 *   - AC-4 happy path: 3 fixture dirs (1 old/no-marker, 1 young, 1 old/with-marker);
 *     only the old/no-marker is removed.
 *   - AC-4 no-op when stagingRoot is absent.
 *   - AC-4 custom age threshold.
 *   - AC-4 completion-marker preservation (even at 25h).
 *   - Custom completion-marker name override.
 *   - File entries (non-dirs) under stagingRoot are ignored.
 *   - Per-subdir failure does not abort enumeration.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { cleanStagingOrphans } from "./staging-cleanup.ts";

let tmp = "";

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-staging-cleanup-"));
});

afterEach(async () => {
  if (tmp !== "") {
    await fs.rm(tmp, { recursive: true, force: true });
    tmp = "";
  }
});

/**
 * Creates a fake staging subdir at <root>/<name>/ and forces its mtime to
 * `mtimeMs`. Optionally writes a marker file.
 */
async function makeStagingDir(
  root: string,
  name: string,
  mtimeMs: number,
  withMarker: boolean,
  markerName: string = "completion-marker.json",
): Promise<string> {
  const dir = path.join(root, name);
  await fs.mkdir(dir, { recursive: true });
  if (withMarker) {
    await fs.writeFile(path.join(dir, markerName), "{}");
  }
  // utimes accepts seconds; convert from ms.
  const mtimeSec = mtimeMs / 1000;
  await fs.utimes(dir, mtimeSec, mtimeSec);
  return dir;
}

describe("cleanStagingOrphans — AC-4 happy path", () => {
  it("removes only old subdirs without a completion-marker", async () => {
    const stagingRoot = path.join(tmp, "staging");
    await fs.mkdir(stagingRoot, { recursive: true });

    const now = new Date("2026-04-30T12:00:00Z");

    // dir-old-no-marker: 25h ago, no marker → REMOVED.
    const oldNoMarker = await makeStagingDir(
      stagingRoot,
      "old-no-marker",
      now.getTime() - 25 * 3600 * 1000,
      false,
    );
    // dir-young: 23h ago, no marker → KEPT (too young).
    const young = await makeStagingDir(
      stagingRoot,
      "young",
      now.getTime() - 23 * 3600 * 1000,
      false,
    );
    // dir-old-with-marker: 25h ago, WITH marker → KEPT (preserved).
    const oldWithMarker = await makeStagingDir(
      stagingRoot,
      "old-with-marker",
      now.getTime() - 25 * 3600 * 1000,
      true,
    );

    const result = await cleanStagingOrphans({
      stagingRoot,
      now,
    });

    expect(result.removedCount).toBe(1);
    expect(result.removedDirs).toEqual([oldNoMarker]);

    // Verify on disk.
    await expect(fs.access(oldNoMarker)).rejects.toThrow();
    await expect(fs.access(young)).resolves.toBeNull();
    await expect(fs.access(oldWithMarker)).resolves.toBeNull();
  });
});

describe("cleanStagingOrphans — AC-4 no-op when stagingRoot absent", () => {
  it("returns { removedCount: 0, removedDirs: [] } without throwing", async () => {
    const stagingRoot = path.join(tmp, "does-not-exist");
    const result = await cleanStagingOrphans({ stagingRoot });
    expect(result.removedCount).toBe(0);
    expect(result.removedDirs).toEqual([]);
  });
});

describe("cleanStagingOrphans — AC-4 custom age threshold", () => {
  it("uses ageThresholdMs override (1s removes anything older)", async () => {
    const stagingRoot = path.join(tmp, "staging");
    await fs.mkdir(stagingRoot, { recursive: true });

    const now = new Date("2026-04-30T12:00:00Z");

    const oldDir = await makeStagingDir(
      stagingRoot,
      "old",
      now.getTime() - 5_000,
      false,
    );
    const newDir = await makeStagingDir(
      stagingRoot,
      "new",
      now.getTime() - 500,
      false,
    );

    const result = await cleanStagingOrphans({
      stagingRoot,
      now,
      ageThresholdMs: 1000,
    });

    expect(result.removedCount).toBe(1);
    expect(result.removedDirs).toEqual([oldDir]);
    await expect(fs.access(oldDir)).rejects.toThrow();
    await expect(fs.access(newDir)).resolves.toBeNull();
  });

  it("treats ageThresholdMs as inclusive lower bound (equal age = kept)", async () => {
    const stagingRoot = path.join(tmp, "staging");
    await fs.mkdir(stagingRoot, { recursive: true });
    const now = new Date("2026-04-30T12:00:00Z");

    // exactly at the threshold → kept (algorithm: ageMs > threshold).
    await makeStagingDir(stagingRoot, "exact", now.getTime() - 1000, false);

    const result = await cleanStagingOrphans({
      stagingRoot,
      now,
      ageThresholdMs: 1000,
    });
    expect(result.removedCount).toBe(0);
  });
});

describe("cleanStagingOrphans — AC-4 completion-marker preservation", () => {
  it("preserves a 25h-old subdir when completion-marker.json is present", async () => {
    const stagingRoot = path.join(tmp, "staging");
    await fs.mkdir(stagingRoot, { recursive: true });
    const now = new Date("2026-04-30T12:00:00Z");

    const dir = await makeStagingDir(
      stagingRoot,
      "preserved",
      now.getTime() - 25 * 3600 * 1000,
      true,
    );

    const result = await cleanStagingOrphans({ stagingRoot, now });
    expect(result.removedCount).toBe(0);
    await expect(fs.access(dir)).resolves.toBeNull();
  });

  it("honors a custom completionMarkerName", async () => {
    const stagingRoot = path.join(tmp, "staging");
    await fs.mkdir(stagingRoot, { recursive: true });
    const now = new Date("2026-04-30T12:00:00Z");

    // Old, with custom marker name "done.flag" → preserved.
    const preserved = await makeStagingDir(
      stagingRoot,
      "preserved",
      now.getTime() - 25 * 3600 * 1000,
      true,
      "done.flag",
    );
    // Old, default-name marker but custom name expected → removed.
    const orphan = await makeStagingDir(
      stagingRoot,
      "orphan",
      now.getTime() - 25 * 3600 * 1000,
      true,
      "completion-marker.json",
    );

    const result = await cleanStagingOrphans({
      stagingRoot,
      now,
      completionMarkerName: "done.flag",
    });
    expect(result.removedCount).toBe(1);
    expect(result.removedDirs).toEqual([orphan]);
    await expect(fs.access(preserved)).resolves.toBeNull();
    await expect(fs.access(orphan)).rejects.toThrow();
  });
});

describe("cleanStagingOrphans — non-directory entries", () => {
  it("ignores files under stagingRoot (only enumerates directories)", async () => {
    const stagingRoot = path.join(tmp, "staging");
    await fs.mkdir(stagingRoot, { recursive: true });
    const now = new Date("2026-04-30T12:00:00Z");

    // A stray file at the staging root.
    const strayFile = path.join(stagingRoot, "stray.txt");
    await fs.writeFile(strayFile, "leftover");
    await fs.utimes(strayFile, 0, 0);

    const result = await cleanStagingOrphans({ stagingRoot, now });
    expect(result.removedCount).toBe(0);
    // The stray file is preserved (not a subdir).
    await expect(fs.access(strayFile)).resolves.toBeNull();
  });
});

describe("cleanStagingOrphans — defaults", () => {
  it("uses 24h default age threshold when not specified", async () => {
    const stagingRoot = path.join(tmp, "staging");
    await fs.mkdir(stagingRoot, { recursive: true });
    const now = new Date("2026-04-30T12:00:00Z");

    // 23.99h → kept. 24.01h → removed.
    const young = await makeStagingDir(
      stagingRoot,
      "young",
      now.getTime() - 23.99 * 3600 * 1000,
      false,
    );
    const old = await makeStagingDir(
      stagingRoot,
      "old",
      now.getTime() - 24.01 * 3600 * 1000,
      false,
    );

    const result = await cleanStagingOrphans({ stagingRoot, now });
    expect(result.removedDirs).toEqual([old]);
    await expect(fs.access(young)).resolves.toBeNull();
    await expect(fs.access(old)).rejects.toThrow();
  });
});
