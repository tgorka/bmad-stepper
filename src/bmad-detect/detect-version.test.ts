/**
 * src/bmad-detect/detect-version.test.ts — Integration tests for the BMAD
 * version detector (AC-1 happy path, AC-2 throw paths, edge cases for
 * Story 1.9).
 *
 * Tests use real filesystem operations in a fresh `os.tmpdir()`-derived
 * directory per test (AR35: every test runs under a unique tmpdir; cleanup
 * via `fs.rm({ recursive: true, force: true })` in `afterEach`). No mocking
 * of `Bun.file`, `fs.readdir`, or `os.homedir` — the architectural preference
 * is real-FS behavior with `homeDir` injected via `DetectBmadOptions`.
 *
 * Test fixture `setupFakeBmadPlugin(homeDir, version, skills)` writes a fake
 * `<homeDir>/.claude/plugins/bmad-method-<version>/.claude-plugin/plugin.json`
 * with `{ name, version, description }` and creates empty `skills/<name>/`
 * directories — the `detectBmadSkills` test file declares its own copy of the
 * fixture (Story 1.6 test-isolation pattern; do NOT cross-import from sibling
 * test files).
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { BmadNotInstalledError } from "../errors.ts";
import { detectBmadVersion } from "./detect-version.ts";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-bmad-detect-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/**
 * Test fixture: writes `<homeDir>/.claude/plugins/bmad-method-<version>/.claude-plugin/plugin.json`
 * with the given version embedded, plus empty `skills/<name>/` directories.
 * Returns the absolute paths to the created plugin directory and manifest.
 */
async function setupFakeBmadPlugin(
  homeDir: string,
  version: string,
  skills: string[],
): Promise<{ pluginDir: string; manifestPath: string }> {
  const pluginDir = path.join(
    homeDir,
    ".claude",
    "plugins",
    `bmad-method-${version}`,
  );
  const claudePluginDir = path.join(pluginDir, ".claude-plugin");
  await fs.mkdir(claudePluginDir, { recursive: true });
  const manifestPath = path.join(claudePluginDir, "plugin.json");
  await Bun.write(
    manifestPath,
    JSON.stringify({
      name: "bmad-method",
      version,
      description: "BMAD Method - Test fixture",
    }),
  );
  for (const skill of skills) {
    await fs.mkdir(path.join(pluginDir, "skills", skill), { recursive: true });
  }
  return { pluginDir, manifestPath };
}

describe("detectBmadVersion — AC-1 happy path", () => {
  it("returns the version string from plugin.json for an installed BMAD plugin", async () => {
    await setupFakeBmadPlugin(tmpDir, "6.5.0.1", []);
    const v = await detectBmadVersion({ homeDir: tmpDir, projectRoot: tmpDir });
    expect(v).toBe("6.5.0.1");
  });
});

describe("detectBmadVersion — AC-2 throw paths", () => {
  it("throws BmadNotInstalledError when neither plugin dir nor _bmad/ exists", async () => {
    // Empty tmpdir — no .claude/plugins, no _bmad/.
    await expect(
      detectBmadVersion({ homeDir: tmpDir, projectRoot: tmpDir }),
    ).rejects.toBeInstanceOf(BmadNotInstalledError);
  });

  it("BmadNotInstalledError carries the AC-2 verbatim hint and exit code 3", async () => {
    try {
      await detectBmadVersion({ homeDir: tmpDir, projectRoot: tmpDir });
      throw new Error("expected detectBmadVersion to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(BmadNotInstalledError);
      const e = err as BmadNotInstalledError;
      expect(e.code).toBe("BMAD_NOT_INSTALLED");
      expect(e.exitCode).toBe(3);
      expect(e.actionableHint).toBe(
        "Run npx bmad-method install --tools claude-code first.",
      );
    }
  });

  it("throws BmadNotInstalledError when _bmad/ exists but no plugin dir", async () => {
    // _bmad/ in projectRoot but no upstream plugin under homeDir/.claude/plugins/.
    await fs.mkdir(path.join(tmpDir, "_bmad"), { recursive: true });
    await expect(
      detectBmadVersion({ homeDir: tmpDir, projectRoot: tmpDir }),
    ).rejects.toBeInstanceOf(BmadNotInstalledError);
  });

  it("throws BmadNotInstalledError when ~/.claude/plugins exists but has no bmad-method-* entries", async () => {
    // .claude/plugins/ exists but contains only unrelated plugin directories.
    await fs.mkdir(
      path.join(tmpDir, ".claude", "plugins", "other-plugin-1.0.0"),
      { recursive: true },
    );
    await expect(
      detectBmadVersion({ homeDir: tmpDir, projectRoot: tmpDir }),
    ).rejects.toBeInstanceOf(BmadNotInstalledError);
  });
});

describe("detectBmadVersion — manifest edge cases", () => {
  it("throws system Error (not BmadNotInstalledError) when plugin.json is missing", async () => {
    // Plugin directory exists but no .claude-plugin/plugin.json file.
    const pluginDir = path.join(
      tmpDir,
      ".claude",
      "plugins",
      "bmad-method-6.5.0.1",
    );
    await fs.mkdir(pluginDir, { recursive: true });
    // The plugin dir exists but no manifest — Bun.file().json() will reject.
    let caught: unknown;
    try {
      await detectBmadVersion({ homeDir: tmpDir, projectRoot: tmpDir });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(BmadNotInstalledError);
  });

  it("throws system Error when plugin.json lacks a 'version' field", async () => {
    const claudePluginDir = path.join(
      tmpDir,
      ".claude",
      "plugins",
      "bmad-method-6.5.0.1",
      ".claude-plugin",
    );
    await fs.mkdir(claudePluginDir, { recursive: true });
    await Bun.write(
      path.join(claudePluginDir, "plugin.json"),
      JSON.stringify({ name: "bmad-method" }),
    );

    let caught: unknown;
    try {
      await detectBmadVersion({ homeDir: tmpDir, projectRoot: tmpDir });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(BmadNotInstalledError);
    const message = (caught as Error).message;
    expect(message).toContain("version");
  });

  it("throws system Error when plugin.json has a non-string 'version' field", async () => {
    const claudePluginDir = path.join(
      tmpDir,
      ".claude",
      "plugins",
      "bmad-method-6.5.0.1",
      ".claude-plugin",
    );
    await fs.mkdir(claudePluginDir, { recursive: true });
    await Bun.write(
      path.join(claudePluginDir, "plugin.json"),
      JSON.stringify({ name: "bmad-method", version: 6.5 }),
    );

    let caught: unknown;
    try {
      await detectBmadVersion({ homeDir: tmpDir, projectRoot: tmpDir });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(BmadNotInstalledError);
    const message = (caught as Error).message;
    expect(message).toContain("version");
  });
});

describe("detectBmadVersion — multi-plugin lex-max selection", () => {
  it("picks lexicographically highest plugin dir when multiple bmad-method-* dirs exist", async () => {
    // Both plugins exist; expect the version from bmad-method-6.5.0.1 (lex-max).
    await setupFakeBmadPlugin(tmpDir, "6.5.0.0", []);
    await setupFakeBmadPlugin(tmpDir, "6.5.0.1", []);

    const v = await detectBmadVersion({ homeDir: tmpDir, projectRoot: tmpDir });
    expect(v).toBe("6.5.0.1");
  });
});
