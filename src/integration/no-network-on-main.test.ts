/**
 * src/integration/no-network-on-main.test.ts — F-3
 *
 * Integration sweep enforcing the architecture contract documented in
 * AGENTS.md, CONTRIBUTING.md, and SECURITY.md:
 *
 *   "NEVER make a main-thread network call EXCEPT inside `src/upgrade/`."
 *
 * `src/upgrade/check.ts` is the SOLE consumer of `globalThis.fetch`
 * (via `opts?.fetch ?? globalThis.fetch`). Every other module is
 * strictly network-free.
 *
 * Two assertions:
 *   1. NON-UPGRADE PATHS: replace `globalThis.fetch` with a spy that
 *      throws immediately if called; invoke representative non-upgrade
 *      modules (config loading, DAG building, state loading) against
 *      tmpdir fixtures; assert zero calls to the spy.
 *   2. UPGRADE PATH: verify that `runUpgradeCheck` WITHOUT the `fetch`
 *      test-seam falls through to `globalThis.fetch`, confirming the
 *      upgrade module is the sole real consumer of the network.
 *
 * AR35: tmpdir per test; cleanup in afterEach.
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { loadConfig } from "../config/index.ts";
import { build } from "../dag/build.ts";
import { loadStateUnlocked } from "../state/load.ts";
import { runUpgradeCheck } from "../upgrade/check.ts";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-no-network-int-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Write a minimal valid state.yaml to tmpDir. */
async function seedStateYaml(): Promise<string> {
  const stepperDir = path.join(tmpDir, "_bmad-output", ".stepper");
  await fs.mkdir(stepperDir, { recursive: true });
  const statePath = path.join(stepperDir, "state.yaml");
  await Bun.write(
    statePath,
    Bun.YAML.stringify({
      schemaVersion: 1,
      project: { name: "no-network-test", bmadVersion: "6.5.0" },
      runHistory: [],
      checkpoints: [],
    }),
  );
  return statePath;
}

/** Write a minimal valid plugin.json to tmpDir. */
async function seedPluginManifest(version = "0.1.0"): Promise<string> {
  const dotDir = path.join(tmpDir, ".claude-plugin");
  await fs.mkdir(dotDir, { recursive: true });
  const manifestPath = path.join(dotDir, "plugin.json");
  await fs.writeFile(
    manifestPath,
    JSON.stringify({ name: "bmad-stepper", version }),
    "utf8",
  );
  return manifestPath;
}

// ─── Test 1: non-upgrade paths never touch globalThis.fetch ───────────────

describe("no-network-on-main — F-3 (AGENTS.md / CONTRIBUTING.md contract)", () => {
  it("non-upgrade modules (loadConfig, build, loadStateUnlocked) never call globalThis.fetch", async () => {
    // Install a fetch spy that throws immediately — any accidental network
    // call from non-upgrade code will fail the test with a clear error.
    let callCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((..._args: Parameters<typeof fetch>) => {
      callCount += 1;
      throw new Error(
        "FORBIDDEN: globalThis.fetch called from a non-upgrade code path",
      );
    }) as typeof globalThis.fetch;

    try {
      // 1a. loadConfig — three-layer YAML loader; zero network I/O.
      // Provide a project root with no config file so the loader uses
      // defaults; the user config override avoids touching $HOME.
      const fakeUserConfig = path.join(tmpDir, "no-such-user-config.yaml");
      const config = await loadConfig({
        projectRoot: tmpDir,
        userConfigPath: fakeUserConfig,
      });
      expect(config).toBeDefined();

      // 1b. build — DAG assembly from the seed; zero network I/O.
      // Pass an empty skillNames list so Tier 3 frontmatter parse is skipped
      // entirely; projectRoot pointing at tmpDir avoids touching $CWD.
      const dag = await build({
        skillNames: [],
        projectRoot: tmpDir,
      });
      expect(dag.nodes.size).toBeGreaterThan(0);

      // 1c. loadStateUnlocked — YAML read + migration; zero network I/O.
      const statePath = await seedStateYaml();
      const state = await loadStateUnlocked({ statePath });
      expect(state).toBeDefined();

      // Primary assertion: the spy was never triggered.
      expect(callCount).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // ─── Test 2: upgrade module IS the sole real fetch consumer ─────────────

  it("runUpgradeCheck WITHOUT opts.fetch falls through to globalThis.fetch (sole real consumer)", async () => {
    const manifestPath = await seedPluginManifest("0.1.0");

    // Install a spy on globalThis.fetch that records calls and resolves with
    // a synthetic 'up-to-date' GitHub Releases response so the function can
    // complete without a real network connection.
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(((
      _input: unknown,
      _init?: RequestInit,
    ) =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          tag_name: "v0.1.0",
          html_url:
            "https://github.com/Tgorka/bmad-stepper/releases/tag/v0.1.0",
          body: "",
        }),
      } as unknown as Response)) as typeof globalThis.fetch);

    try {
      // Call WITHOUT the opts.fetch seam — the module must reach globalThis.fetch.
      const result = await runUpgradeCheck({
        pluginManifestPath: manifestPath,
      });
      expect(result.kind).toBe("up-to-date");

      // The upgrade module MUST have called globalThis.fetch exactly once.
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
