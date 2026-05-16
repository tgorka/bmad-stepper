/**
 * src/bmad-detect/detect-skills.test.ts — Integration tests for the BMAD
 * skill enumerator (AC-1 happy path, AC-2 throw, edge cases for Story 1.9).
 *
 * Tests use real filesystem operations in a fresh `os.tmpdir()`-derived
 * directory per test (AR35: every test runs under a unique tmpdir; cleanup
 * via `fs.rm({ recursive: true, force: true })` in `afterEach`). No mocking
 * of `fs.readdir`, `Bun.file`, or `os.homedir` — the architectural preference
 * is real-FS behavior with `homeDir` injected via `DetectBmadOptions`.
 *
 * Per the Story 1.6 test-isolation pattern, this file declares its own copy
 * of the `setupFakeBmadPlugin` fixture (do NOT cross-import from
 * `detect-version.test.ts` — colocated tests do not share helpers via
 * imports).
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { BmadNotInstalledError } from "../errors.ts";
import {
  detectBmadSkills,
  resolveBmadSkillReferences,
} from "./detect-skills.ts";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-bmad-skills-"));
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

/**
 * Test fixture: writes the marketplace install layout under
 * `<homeDir>/.claude/plugins/cache/bmad-method/bmad/<version>/` plus the
 * `installed_plugins.json` v2 manifest entry.
 */
async function setupFakeBmadMarketplacePlugin(
  homeDir: string,
  version: string,
  skills: string[],
): Promise<{ pluginDir: string; manifestPath: string }> {
  const pluginDir = path.join(
    homeDir,
    ".claude",
    "plugins",
    "cache",
    "bmad-method",
    "bmad",
    version,
  );
  const claudePluginDir = path.join(pluginDir, ".claude-plugin");
  await fs.mkdir(claudePluginDir, { recursive: true });
  const manifestPath = path.join(claudePluginDir, "plugin.json");
  await Bun.write(
    manifestPath,
    JSON.stringify({
      name: "bmad",
      version,
      description: "BMAD Method - Marketplace test fixture",
    }),
  );
  for (const skill of skills) {
    await fs.mkdir(path.join(pluginDir, "skills", skill), { recursive: true });
  }

  const installedManifest = path.join(
    homeDir,
    ".claude",
    "plugins",
    "installed_plugins.json",
  );
  let parsed: {
    version: number;
    plugins: Record<
      string,
      Array<{ scope: string; installPath: string; version: string }>
    >;
  } = { version: 2, plugins: {} };
  if (await Bun.file(installedManifest).exists()) {
    parsed = (await Bun.file(installedManifest).json()) as typeof parsed;
  }
  parsed.plugins["bmad@bmad-method"] = [
    ...(parsed.plugins["bmad@bmad-method"] ?? []),
    { scope: "user", installPath: pluginDir, version },
  ];
  await Bun.write(installedManifest, JSON.stringify(parsed));

  return { pluginDir, manifestPath };
}

describe("detectBmadSkills — AC-1 happy path", () => {
  it("returns sorted skill names from plugin/skills/ directories", async () => {
    await setupFakeBmadPlugin(tmpDir, "6.5.0.1", [
      "bmad-create-prd",
      "bmad-create-story",
      "bmad-dev-story",
    ]);
    const skills = await detectBmadSkills({
      homeDir: tmpDir,
      projectRoot: tmpDir,
    });
    expect(skills).toEqual([
      "bmad-create-prd",
      "bmad-create-story",
      "bmad-dev-story",
    ]);
  });

  it("returns skills sorted lexicographically (ASCII order) regardless of insertion order", async () => {
    // Insert intentionally in non-lex order; expect lex-sorted output.
    await setupFakeBmadPlugin(tmpDir, "6.5.0.1", [
      "zzz-skill",
      "aaa-skill",
      "mmm-skill",
    ]);
    const skills = await detectBmadSkills({
      homeDir: tmpDir,
      projectRoot: tmpDir,
    });
    expect(skills).toEqual(["aaa-skill", "mmm-skill", "zzz-skill"]);
  });
});

describe("detectBmadSkills — empty + filtering edge cases", () => {
  it("returns empty array when plugin has no skills directory", async () => {
    // Plugin dir + manifest exist; no <pluginDir>/skills/ subdirectory.
    await setupFakeBmadPlugin(tmpDir, "6.5.0.1", []);
    const skills = await detectBmadSkills({
      homeDir: tmpDir,
      projectRoot: tmpDir,
    });
    expect(skills).toEqual([]);
  });

  it("filters out non-directory entries in skills/", async () => {
    await setupFakeBmadPlugin(tmpDir, "6.5.0.1", ["bar", "foo"]);
    // Add a stray file in the skills directory — must be filtered out.
    const skillsDir = path.join(
      tmpDir,
      ".claude",
      "plugins",
      "bmad-method-6.5.0.1",
      "skills",
    );
    await Bun.write(path.join(skillsDir, "README.md"), "Skills index\n");

    const skills = await detectBmadSkills({
      homeDir: tmpDir,
      projectRoot: tmpDir,
    });
    expect(skills).toEqual(["bar", "foo"]);
  });
});

describe("detectBmadSkills — marketplace install layout", () => {
  it("returns sorted skill names from a marketplace-installed plugin's skills/ dir", async () => {
    await setupFakeBmadMarketplacePlugin(tmpDir, "6.5.0.1", [
      "bmad-create-prd",
      "bmad-create-story",
      "bmad-dev-story",
    ]);
    const skills = await detectBmadSkills({
      homeDir: tmpDir,
      projectRoot: tmpDir,
    });
    expect(skills).toEqual([
      "bmad-create-prd",
      "bmad-create-story",
      "bmad-dev-story",
    ]);
  });

  it("returns [] when marketplace plugin has no skills/ subdirectory", async () => {
    await setupFakeBmadMarketplacePlugin(tmpDir, "6.5.0.1", []);
    const skills = await detectBmadSkills({
      homeDir: tmpDir,
      projectRoot: tmpDir,
    });
    expect(skills).toEqual([]);
  });
});

describe("detectBmadSkills — AC-2 throw path", () => {
  it("throws BmadNotInstalledError when plugin dir is missing", async () => {
    // Empty tmpdir — no .claude/plugins/bmad-method-* exists.
    await expect(
      detectBmadSkills({ homeDir: tmpDir, projectRoot: tmpDir }),
    ).rejects.toBeInstanceOf(BmadNotInstalledError);
  });

  it("BmadNotInstalledError carries the AC-2 verbatim hint and exit code 3", async () => {
    try {
      await detectBmadSkills({ homeDir: tmpDir, projectRoot: tmpDir });
      throw new Error("expected detectBmadSkills to throw");
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
});

// ─── resolveBmadSkillReferences (v0.2.1) ───────────────────────────────────

describe("resolveBmadSkillReferences — v0.2.1", () => {
  it("returns the absolute SKILL.md path for an installed skill", async () => {
    const { pluginDir } = await setupFakeBmadPlugin(tmpDir, "6.5.0.1", [
      "bmad-brainstorming",
    ]);
    // setupFakeBmadPlugin creates the skill directory but not SKILL.md;
    // write the entrypoint file so the existence check passes.
    await Bun.write(
      path.join(pluginDir, "skills", "bmad-brainstorming", "SKILL.md"),
      "---\nname: bmad-brainstorming\n---\n",
    );
    const refs = await resolveBmadSkillReferences(
      "bmad-brainstorming",
      undefined,
      { homeDir: tmpDir, projectRoot: tmpDir },
    );
    expect(refs.skillPath).toBe(
      path.join(pluginDir, "skills", "bmad-brainstorming", "SKILL.md"),
    );
    expect(refs.personaPath).toBeNull();
  });

  it("returns null skillPath when SKILL.md is absent", async () => {
    const { pluginDir } = await setupFakeBmadPlugin(tmpDir, "6.5.0.1", [
      "bmad-brainstorming",
    ]);
    // Skill directory exists but no SKILL.md inside.
    const refs = await resolveBmadSkillReferences(
      "bmad-brainstorming",
      undefined,
      { homeDir: tmpDir, projectRoot: tmpDir },
    );
    // Defensive — ensure the test setup did not accidentally seed SKILL.md.
    expect(
      await Bun.file(
        path.join(pluginDir, "skills", "bmad-brainstorming", "SKILL.md"),
      ).exists(),
    ).toBe(false);
    expect(refs.skillPath).toBeNull();
  });

  it("returns personaPath using the bmad-agent-<persona> convention", async () => {
    const { pluginDir } = await setupFakeBmadPlugin(tmpDir, "6.5.0.1", [
      "bmad-brainstorming",
      "bmad-agent-analyst",
    ]);
    await Bun.write(
      path.join(pluginDir, "skills", "bmad-brainstorming", "SKILL.md"),
      "---\nname: bmad-brainstorming\n---\n",
    );
    await Bun.write(
      path.join(pluginDir, "skills", "bmad-agent-analyst", "SKILL.md"),
      "---\nname: bmad-agent-analyst\n---\n",
    );
    const refs = await resolveBmadSkillReferences(
      "bmad-brainstorming",
      "analyst",
      { homeDir: tmpDir, projectRoot: tmpDir },
    );
    expect(refs.skillPath).toBe(
      path.join(pluginDir, "skills", "bmad-brainstorming", "SKILL.md"),
    );
    expect(refs.personaPath).toBe(
      path.join(pluginDir, "skills", "bmad-agent-analyst", "SKILL.md"),
    );
  });

  it("returns null personaPath when persona is undefined", async () => {
    const { pluginDir } = await setupFakeBmadPlugin(tmpDir, "6.5.0.1", [
      "bmad-brainstorming",
    ]);
    await Bun.write(
      path.join(pluginDir, "skills", "bmad-brainstorming", "SKILL.md"),
      "---\nname: bmad-brainstorming\n---\n",
    );
    const refs = await resolveBmadSkillReferences(
      "bmad-brainstorming",
      undefined,
      { homeDir: tmpDir, projectRoot: tmpDir },
    );
    expect(refs.personaPath).toBeNull();
  });

  it("returns null personaPath when no matching bmad-agent-<persona> skill exists", async () => {
    const { pluginDir } = await setupFakeBmadPlugin(tmpDir, "6.5.0.1", [
      "bmad-brainstorming",
    ]);
    await Bun.write(
      path.join(pluginDir, "skills", "bmad-brainstorming", "SKILL.md"),
      "---\nname: bmad-brainstorming\n---\n",
    );
    const refs = await resolveBmadSkillReferences("bmad-brainstorming", "tea", {
      homeDir: tmpDir,
      projectRoot: tmpDir,
    });
    expect(refs.personaPath).toBeNull();
  });

  it("returns { skillPath: null, personaPath: null } when BMad is not installed (no throw)", async () => {
    // tmpDir has no .claude/plugins/ — _resolvePluginDir throws
    // BmadNotInstalledError; resolveBmadSkillReferences swallows it.
    const refs = await resolveBmadSkillReferences(
      "bmad-brainstorming",
      "analyst",
      { homeDir: tmpDir, projectRoot: tmpDir },
    );
    expect(refs.skillPath).toBeNull();
    expect(refs.personaPath).toBeNull();
  });
});
