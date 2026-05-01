/**
 * src/verifiers/defaults.test.ts — Shape-validation tests for the
 * `defaultVerifiers` map (Story 2.1 AC-1).
 *
 * Coverage map:
 *   - shape conformance
 *     - Test 1: every entry has the required `VerifierConfig` fields.
 *     - Test 2: arrays are arrays (not strings, not objects).
 *     - Test 3: schema is null for every v0.1 default.
 *   - per-step expectations
 *     - Test 4: `default` baseline has empty arrays (true fallback).
 *     - Test 5: prose step types have non-empty `requiredFrontmatterSections`.
 *     - Test 6: `story-create` requires the `story_id` key.
 *     - Test 7: `retro` requires the `epic` key.
 *     - Test 8: `analyst-research` requires only the `title` key.
 *
 * No filesystem IO required (defaults are pure data); no tmpdir setup.
 */

import { describe, expect, it } from "bun:test";
import { defaultVerifiers } from "./defaults.ts";

describe("defaultVerifiers — shape conformance", () => {
  it("every entry has the required VerifierConfig fields", () => {
    for (const [stepName, config] of Object.entries(defaultVerifiers)) {
      expect(config).toBeDefined();
      expect(config.requiredFiles).toBeDefined();
      expect(config.requiredFrontmatterSections).toBeDefined();
      expect("schema" in config).toBe(true);
      // sanity: stepName is a non-empty string key
      expect(stepName.length).toBeGreaterThan(0);
    }
  });

  it("arrays are arrays (not strings, not objects)", () => {
    for (const config of Object.values(defaultVerifiers)) {
      expect(Array.isArray(config.requiredFiles)).toBe(true);
      expect(Array.isArray(config.requiredFrontmatterSections)).toBe(true);
    }
  });

  it("schema is null for every v0.1 default (per-artifact schemas deferred to Story 6.x)", () => {
    for (const config of Object.values(defaultVerifiers)) {
      expect(config.schema).toBeNull();
    }
  });

  it("custom is undefined for every v0.1 default (custom callbacks deferred to Story 6.5)", () => {
    for (const config of Object.values(defaultVerifiers)) {
      expect(config.custom).toBeUndefined();
    }
  });
});

describe("defaultVerifiers — per-step expectations", () => {
  it("`default` baseline has empty requiredFiles and empty requiredFrontmatterSections", () => {
    const baseline = defaultVerifiers.default;
    expect(baseline).toBeDefined();
    expect(baseline?.requiredFiles).toEqual([]);
    expect(baseline?.requiredFrontmatterSections).toEqual([]);
  });

  it("prose step types have non-empty requiredFrontmatterSections", () => {
    const proseSteps = [
      "prd",
      "architecture",
      "story-create",
      "dev-story",
      "code-review",
      "retro",
    ];
    for (const step of proseSteps) {
      const config = defaultVerifiers[step];
      expect(config).toBeDefined();
      expect(config?.requiredFrontmatterSections.length).toBeGreaterThan(0);
    }
  });

  it("prose step types declare `**/*.md` as their requiredFiles glob", () => {
    const proseSteps = [
      "prd",
      "architecture",
      "story-create",
      "dev-story",
      "code-review",
      "retro",
      "analyst-research",
    ];
    for (const step of proseSteps) {
      const config = defaultVerifiers[step];
      expect(config?.requiredFiles).toEqual(["**/*.md"]);
    }
  });

  it("`story-create` requires the `story_id` key", () => {
    const config = defaultVerifiers["story-create"];
    expect(config?.requiredFrontmatterSections).toContain("story_id");
    expect(config?.requiredFrontmatterSections).toContain("title");
    expect(config?.requiredFrontmatterSections).toContain("status");
  });

  it("`retro` requires the `epic` key", () => {
    const config = defaultVerifiers.retro;
    expect(config?.requiredFrontmatterSections).toContain("epic");
    expect(config?.requiredFrontmatterSections).toContain("status");
  });

  it("`analyst-research` requires only the `title` key", () => {
    const config = defaultVerifiers["analyst-research"];
    expect(config?.requiredFrontmatterSections).toEqual(["title"]);
  });
});
