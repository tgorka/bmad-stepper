/**
 * src/personas/resolve.test.ts — colocated integration tests for the
 * 4-tier persona resolver (FR12, FR34, FR40, AR33, AR41, AR35).
 *
 * Test pattern (AR35): per-test tmpdir via
 * `mkdtemp(path.join(os.tmpdir(), "stepper-personas-"))`; cleanup via
 * `afterEach` `rm({ recursive: true })`. Mock SKILL.md fixtures, mock
 * `bmad-stepper.config.yaml`, mock `_bmad/<module>/config.yaml` files
 * via `Bun.write(...)` + `mkdir({ recursive: true })`.
 *
 * Coverage:
 *   - AC-1: each tier resolves in isolation; tier-precedence ladder.
 *   - AC-2: no-tier-resolves throws ConfigError with verbatim hint.
 *   - AC-3: multi-persona array return shape signals sequential dispatch.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { ConfigError } from "../errors.ts";
import { resolvePersona } from "./resolve.ts";

describe("resolvePersona", () => {
  let tmpdir = "";

  beforeEach(async () => {
    tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-personas-"));
  });

  afterEach(async () => {
    await fs.rm(tmpdir, { recursive: true, force: true });
  });

  describe("Tier 1 — SKILL.md frontmatter", () => {
    it("resolves a single-persona string from SKILL.md frontmatter", async () => {
      const pluginDir = path.join(tmpdir, "plugin");
      const skillDir = path.join(pluginDir, "skills", "foo-step");
      await fs.mkdir(skillDir, { recursive: true });
      await Bun.write(
        path.join(skillDir, "SKILL.md"),
        "---\npersona: alice\n---\nbody",
      );
      const result = await resolvePersona({
        stepName: "foo-step",
        pluginDir,
        projectRoot: tmpdir,
      });
      expect(result).toBe("alice");
    });

    it("resolves a multi-persona array from SKILL.md frontmatter", async () => {
      const pluginDir = path.join(tmpdir, "plugin");
      const skillDir = path.join(pluginDir, "skills", "multi-step");
      await fs.mkdir(skillDir, { recursive: true });
      await Bun.write(
        path.join(skillDir, "SKILL.md"),
        "---\npersona: [alice, bob]\n---\nbody",
      );
      const result = await resolvePersona({
        stepName: "multi-step",
        pluginDir,
        projectRoot: tmpdir,
      });
      expect(Array.isArray(result)).toBe(true);
      expect([...(result as readonly string[])]).toEqual(["alice", "bob"]);
    });

    it("falls back to skill.yaml when SKILL.md absent", async () => {
      const pluginDir = path.join(tmpdir, "plugin");
      const skillDir = path.join(pluginDir, "skills", "yaml-step");
      await fs.mkdir(skillDir, { recursive: true });
      await Bun.write(path.join(skillDir, "skill.yaml"), "persona: zara\n");
      const result = await resolvePersona({
        stepName: "yaml-step",
        pluginDir,
        projectRoot: tmpdir,
      });
      expect(result).toBe("zara");
    });
  });

  describe("Tier 2 — project config personas: block", () => {
    it("resolves a single-persona string from bmad-stepper.config.yaml", async () => {
      await Bun.write(
        path.join(tmpdir, "bmad-stepper.config.yaml"),
        "personas:\n  some-step: bob\n",
      );
      const result = await resolvePersona({
        stepName: "some-step",
        projectRoot: tmpdir,
      });
      expect(result).toBe("bob");
    });

    it("resolves an inline array from bmad-stepper.config.yaml", async () => {
      await Bun.write(
        path.join(tmpdir, "bmad-stepper.config.yaml"),
        "personas:\n  arr-step: [alice, bob]\n",
      );
      const result = await resolvePersona({
        stepName: "arr-step",
        projectRoot: tmpdir,
      });
      expect(Array.isArray(result)).toBe(true);
      expect([...(result as readonly string[])]).toEqual(["alice", "bob"]);
    });

    it("resolves a dash-list array from bmad-stepper.config.yaml", async () => {
      await Bun.write(
        path.join(tmpdir, "bmad-stepper.config.yaml"),
        "personas:\n  dash-step:\n    - alice\n    - bob\n",
      );
      const result = await resolvePersona({
        stepName: "dash-step",
        projectRoot: tmpdir,
      });
      expect(Array.isArray(result)).toBe(true);
      expect([...(result as readonly string[])]).toEqual(["alice", "bob"]);
    });

    it("supports configPath escape hatch (test-only override)", async () => {
      const customPath = path.join(tmpdir, "custom-config.yaml");
      await Bun.write(customPath, "personas:\n  custom-step: carol\n");
      const result = await resolvePersona({
        stepName: "custom-step",
        configPath: customPath,
        projectRoot: tmpdir,
      });
      expect(result).toBe("carol");
    });
  });

  describe("Tier 3 — DEFAULT_PERSONAS", () => {
    it("resolves a known seed step to its default persona", async () => {
      const result = await resolvePersona({
        stepName: "bmad-create-prd",
        projectRoot: tmpdir,
      });
      expect(result).toBe("pm");
    });

    it("returns multi-persona array for bmad-create-story", async () => {
      const result = await resolvePersona({
        stepName: "bmad-create-story",
        projectRoot: tmpdir,
      });
      expect(Array.isArray(result)).toBe(true);
      expect([...(result as readonly string[])]).toEqual(["analyst", "pm"]);
    });
  });

  describe("Tier 4 — _bmad/<module>/config.yaml triggers", () => {
    it("resolves via _bmad/bmm/config.yaml when the trigger matches", async () => {
      const moduleDir = path.join(tmpdir, "_bmad", "bmm");
      await fs.mkdir(moduleDir, { recursive: true });
      await Bun.write(
        path.join(moduleDir, "config.yaml"),
        "triggers:\n  - some-bmm-step\n",
      );
      const result = await resolvePersona({
        stepName: "some-bmm-step",
        projectRoot: tmpdir,
      });
      expect(result).toBe("pm");
    });

    it("resolves via _bmad/tea/config.yaml to the tea persona", async () => {
      const moduleDir = path.join(tmpdir, "_bmad", "tea");
      await fs.mkdir(moduleDir, { recursive: true });
      await Bun.write(
        path.join(moduleDir, "config.yaml"),
        "triggers:\n  - some-tea-step\n",
      );
      const result = await resolvePersona({
        stepName: "some-tea-step",
        projectRoot: tmpdir,
      });
      expect(result).toBe("tea");
    });
  });

  describe("Tier ordering — lower-numbered tier wins", () => {
    it("Tier 1 wins over Tier 2, Tier 3, and Tier 4", async () => {
      // Tier 1 fixture
      const pluginDir = path.join(tmpdir, "plugin");
      const skillDir = path.join(pluginDir, "skills", "bmad-create-prd");
      await fs.mkdir(skillDir, { recursive: true });
      await Bun.write(
        path.join(skillDir, "SKILL.md"),
        "---\npersona: frontmatter-persona\n---\n",
      );
      // Tier 2 fixture
      await Bun.write(
        path.join(tmpdir, "bmad-stepper.config.yaml"),
        "personas:\n  bmad-create-prd: config-persona\n",
      );
      // Tier 4 fixture
      const moduleDir = path.join(tmpdir, "_bmad", "bmm");
      await fs.mkdir(moduleDir, { recursive: true });
      await Bun.write(
        path.join(moduleDir, "config.yaml"),
        "triggers:\n  - bmad-create-prd\n",
      );
      const result = await resolvePersona({
        stepName: "bmad-create-prd",
        pluginDir,
        projectRoot: tmpdir,
      });
      expect(result).toBe("frontmatter-persona");
    });

    it("Tier 2 wins over Tier 3 and Tier 4", async () => {
      // Tier 2 fixture (bmad-create-prd is a Tier 3 default = "pm")
      await Bun.write(
        path.join(tmpdir, "bmad-stepper.config.yaml"),
        "personas:\n  bmad-create-prd: config-persona\n",
      );
      // Tier 4 fixture
      const moduleDir = path.join(tmpdir, "_bmad", "bmm");
      await fs.mkdir(moduleDir, { recursive: true });
      await Bun.write(
        path.join(moduleDir, "config.yaml"),
        "triggers:\n  - bmad-create-prd\n",
      );
      const result = await resolvePersona({
        stepName: "bmad-create-prd",
        projectRoot: tmpdir,
      });
      expect(result).toBe("config-persona");
    });

    it("Tier 3 wins over Tier 4 (default present, module trigger present)", async () => {
      // Tier 4 fixture for bmad-create-prd (Tier 3 default is "pm" → tea/bmm
      // trigger should not override).
      const moduleDir = path.join(tmpdir, "_bmad", "tea");
      await fs.mkdir(moduleDir, { recursive: true });
      await Bun.write(
        path.join(moduleDir, "config.yaml"),
        "triggers:\n  - bmad-create-prd\n",
      );
      const result = await resolvePersona({
        stepName: "bmad-create-prd",
        projectRoot: tmpdir,
      });
      expect(result).toBe("pm");
    });
  });

  describe("AC-2 — no-tier-resolves throws ConfigError", () => {
    it("throws ConfigError with verbatim AC-2 hint and exit code 2", async () => {
      let caught: unknown = null;
      try {
        await resolvePersona({
          stepName: "totally-unknown-step",
          projectRoot: tmpdir,
        });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ConfigError);
      const error = caught as ConfigError;
      expect(error.code).toBe("CONFIG_ERROR");
      expect(error.exitCode).toBe(2);
      expect(error.actionableHint).toBe(
        "Add a persona for totally-unknown-step in bmad-stepper.config.yaml under the personas: block.",
      );
    });

    it("includes structured tiers-checked detail in the error", async () => {
      let caught: unknown = null;
      try {
        await resolvePersona({
          stepName: "another-unknown-step",
          projectRoot: tmpdir,
        });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ConfigError);
      const error = caught as ConfigError;
      expect(error.detail).toBeDefined();
      const detailObj = JSON.parse(error.detail ?? "{}") as {
        step: string;
        tiersChecked: Record<string, string>;
      };
      expect(detailObj.step).toBe("another-unknown-step");
      expect(detailObj.tiersChecked.tier1).toBe("skipped");
      expect(detailObj.tiersChecked.tier2).toBe("checked-no-match");
      expect(detailObj.tiersChecked.tier3).toBe("checked-no-match");
      expect(detailObj.tiersChecked.tier4).toBe("checked-no-match");
    });
  });

  describe("graceful degradation", () => {
    it("Tier 2 file absent gracefully falls through to Tier 3", async () => {
      // No bmad-stepper.config.yaml in tmpdir.
      const result = await resolvePersona({
        stepName: "bmad-create-prd",
        projectRoot: tmpdir,
      });
      expect(result).toBe("pm");
    });

    it("Tier 2 file present but personas: block absent falls through to Tier 3", async () => {
      await Bun.write(
        path.join(tmpdir, "bmad-stepper.config.yaml"),
        "overrides:\n  some-skill:\n    optional: true\n",
      );
      const result = await resolvePersona({
        stepName: "bmad-create-prd",
        projectRoot: tmpdir,
      });
      expect(result).toBe("pm");
    });

    it("Tier 4 directory absent gracefully fails through", async () => {
      // No _bmad/ directory; no SKILL.md fixture; no bmad-stepper.config.yaml.
      // Use a step name that is in Tier 3 defaults (sanity check tier 4 skip
      // does not break the chain).
      const result = await resolvePersona({
        stepName: "bmad-dev-story",
        projectRoot: tmpdir,
      });
      expect(result).toBe("dev");
    });
  });
});
