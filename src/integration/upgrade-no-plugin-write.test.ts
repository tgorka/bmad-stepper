/**
 * src/integration/upgrade-no-plugin-write.test.ts — AC-1.5 + NFR-S2
 * PRIMARY integration test (Story 6.9).
 *
 * Cross-module integration test: invokes `runUpgradeCheck` with a
 * tmpdir-isolated `.claude-plugin/plugin.json` fixture + a stubbed
 * fetch returning a synthetic GitHub release. Asserts that ZERO writes
 * occur on any fs API (writeFile / appendFile / copyFile / rename /
 * unlink) AND that a synthetic `~/.claude/plugins/` snapshot is
 * byte-identical before + after the call.
 *
 * AC-1 (epics.md line 1289) — "Stepper never writes to
 * `~/.claude/plugins/` from this code path".
 * NFR-S2 (architecture line 1397; PRD line 765) — read-only respect for
 * marketplace plugin runtime files.
 * AC-1 verbatim hint (epics.md line 1288) — `Run /plugin marketplace
 * update Tgorka/bmad-stepper to upgrade.` byte-identical via the
 * renderer.
 *
 * AR35: tmpdir per test; cleanup in `afterEach`.
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { runUpgradeCheck } from "../upgrade/check.ts";
import { renderUpgradeReport } from "../upgrade/render.ts";

let tmpDir: string;
let pluginsSnapshotDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-upgrade-int-"));
  pluginsSnapshotDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "stepper-plugins-snapshot-"),
  );
  // Seed the synthetic ~/.claude/plugins/ analogue with a canary file
  // (the integration sweep asserts this file remains byte-identical
  // after runUpgradeCheck).
  await fs.writeFile(
    path.join(pluginsSnapshotDir, "canary.txt"),
    "canary-content-do-not-touch",
    "utf8",
  );
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.rm(pluginsSnapshotDir, { recursive: true, force: true });
});

interface DirSnapshot {
  files: ReadonlyArray<{ name: string; size: number; mtimeMs: number }>;
}

async function snapshotDir(dir: string): Promise<DirSnapshot> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (e) => {
      const stat = await fs.stat(path.join(dir, e.name));
      return { name: e.name, size: stat.size, mtimeMs: stat.mtimeMs };
    }),
  );
  return { files: files.sort((a, b) => a.name.localeCompare(b.name)) };
}

async function writeManifest(dir: string, version: string): Promise<string> {
  const dotDir = path.join(dir, ".claude-plugin");
  await fs.mkdir(dotDir, { recursive: true });
  const manifestPath = path.join(dotDir, "plugin.json");
  await fs.writeFile(
    manifestPath,
    JSON.stringify({ name: "bmad-stepper", version }),
    "utf8",
  );
  return manifestPath;
}

function makeStubFetch(body: unknown): typeof globalThis.fetch {
  return ((_input: unknown, _init?: RequestInit) =>
    Promise.resolve({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => body,
    } as unknown as Response)) as unknown as typeof globalThis.fetch;
}

const SAMPLE_RELEASE = {
  tag_name: "v0.2.0",
  html_url: "https://github.com/Tgorka/bmad-stepper/releases/tag/v0.2.0",
  body: "## BMAD Compatibility — v6.5.x\n\nWhatever release notes go here.",
};

describe("upgrade flow — NFR-S2 + AC-1.5 PRIMARY (no-plugin-write)", () => {
  it("AC-1.5 PRIMARY (write-API spy): zero fs.writeFile/appendFile/copyFile/rename/unlink calls during runUpgradeCheck", async () => {
    const manifestPath = await writeManifest(tmpDir, "0.1.0");
    const writeFileSpy = spyOn(fs, "writeFile");
    const appendFileSpy = spyOn(fs, "appendFile");
    const copyFileSpy = spyOn(fs, "copyFile");
    const renameSpy = spyOn(fs, "rename");
    const unlinkSpy = spyOn(fs, "unlink");
    try {
      const result = await runUpgradeCheck({
        pluginManifestPath: manifestPath,
        fetch: makeStubFetch(SAMPLE_RELEASE),
      });
      expect(result.kind).toBe("upgrade-available");
      expect(writeFileSpy).not.toHaveBeenCalled();
      expect(appendFileSpy).not.toHaveBeenCalled();
      expect(copyFileSpy).not.toHaveBeenCalled();
      expect(renameSpy).not.toHaveBeenCalled();
      expect(unlinkSpy).not.toHaveBeenCalled();
    } finally {
      writeFileSpy.mockRestore();
      appendFileSpy.mockRestore();
      copyFileSpy.mockRestore();
      renameSpy.mockRestore();
      unlinkSpy.mockRestore();
    }
  });

  it("AC-1.5 SECONDARY (path snapshot): ~/.claude/plugins/ analogue byte-identical before + after", async () => {
    const manifestPath = await writeManifest(tmpDir, "0.1.0");
    const before = await snapshotDir(pluginsSnapshotDir);
    const canaryBefore = await fs.readFile(
      path.join(pluginsSnapshotDir, "canary.txt"),
      "utf8",
    );

    await runUpgradeCheck({
      pluginManifestPath: manifestPath,
      fetch: makeStubFetch(SAMPLE_RELEASE),
    });

    const after = await snapshotDir(pluginsSnapshotDir);
    const canaryAfter = await fs.readFile(
      path.join(pluginsSnapshotDir, "canary.txt"),
      "utf8",
    );

    // File inventory matches: same names, same sizes, same mtimes.
    expect(after.files.length).toBe(before.files.length);
    for (let i = 0; i < after.files.length; i++) {
      expect(after.files[i]?.name).toBe(before.files[i]?.name);
      expect(after.files[i]?.size).toBe(before.files[i]?.size);
      expect(after.files[i]?.mtimeMs).toBe(before.files[i]?.mtimeMs);
    }
    expect(canaryAfter).toBe(canaryBefore);
    expect(canaryAfter).toBe("canary-content-do-not-touch");
  });

  it("AC-1 hint byte-identical: the rendered upgrade-available report contains the AC-1 hint", async () => {
    const manifestPath = await writeManifest(tmpDir, "0.1.0");
    const result = await runUpgradeCheck({
      pluginManifestPath: manifestPath,
      fetch: makeStubFetch(SAMPLE_RELEASE),
    });
    expect(result.kind).toBe("upgrade-available");
    const report = renderUpgradeReport(result);
    expect(report).toContain(
      "Run /plugin marketplace update Tgorka/bmad-stepper to upgrade.",
    );
  });
});
