/**
 * src/verifiers/registry.test.ts — Unit tests for the verifier registry
 * + `getVerifierConfig` lookup (Story 2.1 AC-1, AC-2).
 *
 * Coverage map:
 *   - registry surface
 *     - Test 1: contains the 8 expected entries (default + 7 step types).
 *     - Test 2: every entry satisfies the `VerifierConfig` shape.
 *   - getVerifierConfig
 *     - Test 3: known step → returns the per-step config verbatim.
 *     - Test 4: unknown step → returns the `default` baseline.
 *     - Test 5: empty-string step → returns the `default` baseline.
 *     - Test 6: each canonical AC-1 step name resolves successfully.
 *
 * No filesystem IO required (registry is pure data); no tmpdir setup.
 */

import { describe, expect, it } from "bun:test";
import { defaultVerifiers } from "./defaults.ts";
import { getVerifierConfig, verifierRegistry } from "./registry.ts";
import type { VerifierConfig } from "./types.ts";

describe("verifierRegistry surface", () => {
  it("contains exactly the 8 expected entries", () => {
    const expected = [
      "default",
      "prd",
      "architecture",
      "story-create",
      "dev-story",
      "code-review",
      "retro",
      "analyst-research",
    ];
    const actual = Object.keys(verifierRegistry).sort();
    expect(actual.sort()).toEqual(expected.sort());
  });

  it("every entry has the VerifierConfig shape", () => {
    for (const [stepName, config] of Object.entries(verifierRegistry)) {
      expect(Array.isArray(config.requiredFiles)).toBe(true);
      expect(Array.isArray(config.requiredFrontmatterSections)).toBe(true);
      // schema must be ZodSchema | null — v0.1 all null
      expect(config.schema).toBeNull();
      // custom is optional
      if (config.custom !== undefined) {
        expect(typeof config.custom).toBe("function");
      }
      // sanity: stepName is the registry key (non-empty)
      expect(stepName.length).toBeGreaterThan(0);
    }
  });

  it("verifierRegistry is the defaultVerifiers map", () => {
    // v0.1 invariant: registry === defaultVerifiers (no project-config layer).
    // Story 6.5 will extend this; until then we assert object identity.
    expect(verifierRegistry).toBe(defaultVerifiers);
  });
});

describe("getVerifierConfig — known step names", () => {
  it("returns the dev-story config verbatim for `dev-story`", () => {
    const config = getVerifierConfig("dev-story");
    expect(config).toEqual(verifierRegistry["dev-story"] as VerifierConfig);
    expect(config.requiredFrontmatterSections).toEqual(["title", "status"]);
    expect(config.requiredFiles).toEqual(["**/*.md"]);
  });

  it("returns the prd config for `prd`", () => {
    const config = getVerifierConfig("prd");
    expect(config).toEqual(verifierRegistry.prd as VerifierConfig);
    expect(config.requiredFrontmatterSections).toEqual(["title", "status"]);
  });

  it("returns the story-create config for `story-create`", () => {
    const config = getVerifierConfig("story-create");
    expect(config.requiredFrontmatterSections).toEqual([
      "title",
      "status",
      "story_id",
    ]);
  });

  it("resolves every canonical AC-1 step name", () => {
    const canonical = [
      "prd",
      "architecture",
      "story-create",
      "dev-story",
      "code-review",
      "retro",
      "analyst-research",
    ];
    for (const name of canonical) {
      const config = getVerifierConfig(name);
      expect(config).toEqual(verifierRegistry[name] as VerifierConfig);
    }
  });
});

describe("getVerifierConfig — fallback to default baseline", () => {
  it("returns the default baseline for an unregistered step", () => {
    const config = getVerifierConfig("totally-made-up-step");
    expect(config).toEqual(verifierRegistry.default as VerifierConfig);
    expect(config.requiredFiles).toEqual([]);
    expect(config.requiredFrontmatterSections).toEqual([]);
    expect(config.schema).toBeNull();
  });

  it("returns the default baseline for an empty-string step", () => {
    const config = getVerifierConfig("");
    expect(config).toEqual(verifierRegistry.default as VerifierConfig);
  });
});
