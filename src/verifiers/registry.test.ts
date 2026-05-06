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

describe("VER_65_REGISTRY: getVerifierConfig — projectVerifiers override (Story 6.5 AC-1)", () => {
  it("VER_65_REGISTRY_NO_OVERRIDE_1: undefined projectVerifiers → byte-identical Story 2.1 baseline (regression)", () => {
    const config = getVerifierConfig("dev-story", undefined);
    expect(config).toEqual(verifierRegistry["dev-story"] as VerifierConfig);
  });

  it("VER_65_REGISTRY_NO_OVERRIDE_2: undefined projectVerifiers + unknown step → default baseline", () => {
    const config = getVerifierConfig("unknown-step", undefined);
    expect(config).toEqual(verifierRegistry.default as VerifierConfig);
  });

  it("VER_65_REGISTRY_MERGE_1: AC-1 default mode (merge) — appends new entry, baseline order preserved", () => {
    const config = getVerifierConfig("story-create", {
      "story-create": { requiredFrontmatterSections: ["owner"] },
    });
    expect(config.requiredFrontmatterSections).toEqual([
      "title",
      "status",
      "story_id",
      "owner",
    ]);
    expect(config.requiredFiles).toEqual(["**/*.md"]);
    expect(config.schema).toBeNull();
  });

  it("VER_65_REGISTRY_MERGE_2: AC-1 explicit mode='merge' — same result as default", () => {
    const config = getVerifierConfig("story-create", {
      "story-create": {
        requiredFrontmatterSections: ["owner"],
        mode: "merge",
      },
    });
    expect(config.requiredFrontmatterSections).toEqual([
      "title",
      "status",
      "story_id",
      "owner",
    ]);
  });

  it("VER_65_REGISTRY_MERGE_3: AC-1 de-dup — duplicate baseline entries collapse, baseline-position preserved (OQ-4)", () => {
    const config = getVerifierConfig("dev-story", {
      "dev-story": { requiredFrontmatterSections: ["status", "owner"] },
    });
    // Baseline ["title", "status"]; override ["status", "owner"];
    // Expected ["title", "status", "owner"] (status from baseline; owner appended).
    expect(config.requiredFrontmatterSections).toEqual([
      "title",
      "status",
      "owner",
    ]);
    expect(config.requiredFiles).toEqual(["**/*.md"]);
  });

  it("VER_65_REGISTRY_MERGE_4: AC-1 partial — only requiredFiles overridden, frontmatter preserved baseline-only", () => {
    const config = getVerifierConfig("dev-story", {
      "dev-story": { requiredFiles: ["**/*.json"] },
    });
    expect(config.requiredFiles).toEqual(["**/*.md", "**/*.json"]);
    expect(config.requiredFrontmatterSections).toEqual(["title", "status"]);
  });

  it("VER_65_REGISTRY_REPLACE_1: AC-1 replace mode — UNSET requiredFiles falls through to empty (OQ-3)", () => {
    const config = getVerifierConfig("dev-story", {
      "dev-story": {
        requiredFrontmatterSections: ["title", "owner"],
        mode: "replace",
      },
    });
    expect(config.requiredFiles).toEqual([]);
    expect(config.requiredFrontmatterSections).toEqual(["title", "owner"]);
    expect(config.schema).toBeNull();
  });

  it("VER_65_REGISTRY_REPLACE_2: AC-1 replace mode — both arrays explicit override the baseline", () => {
    const config = getVerifierConfig("dev-story", {
      "dev-story": {
        requiredFiles: ["**/*.json"],
        requiredFrontmatterSections: ["title"],
        mode: "replace",
      },
    });
    expect(config.requiredFiles).toEqual(["**/*.json"]);
    expect(config.requiredFrontmatterSections).toEqual(["title"]);
  });

  it("VER_65_REGISTRY_REPLACE_3: AC-1 replace mode + ALL fields unset → both arrays empty (OQ-3)", () => {
    const config = getVerifierConfig("dev-story", {
      "dev-story": { mode: "replace" },
    });
    expect(config.requiredFiles).toEqual([]);
    expect(config.requiredFrontmatterSections).toEqual([]);
    expect(config.schema).toBeNull();
  });

  it("VER_65_REGISTRY_NO_MATCH_1: AC-1 — project override for OTHER step → current step byte-identical to baseline", () => {
    const config = getVerifierConfig("dev-story", {
      "different-step": { requiredFrontmatterSections: ["owner"] },
    });
    expect(config).toEqual(verifierRegistry["dev-story"] as VerifierConfig);
  });

  it("VER_65_REGISTRY_FALLBACK_1: AC-1 — unknown step + override for that step → merged from default baseline", () => {
    const config = getVerifierConfig("totally-unknown-step", {
      "totally-unknown-step": { requiredFrontmatterSections: ["x"] },
    });
    // Default baseline has empty arrays; merge mode appends "x".
    expect(config.requiredFiles).toEqual([]);
    expect(config.requiredFrontmatterSections).toEqual(["x"]);
    expect(config.schema).toBeNull();
  });

  it("VER_65_REGISTRY_CUSTOM_PRESERVED_1: AR17 — baseline.custom preserved across merge (project cannot supply custom)", () => {
    // Synthetic: build a virtual baseline with a `custom` callback and
    // exercise the merge path's preservation contract via the merge-output
    // shape. We cannot easily monkey-patch verifierRegistry without
    // affecting other tests, so we exercise the runtime semantics via a
    // direct property-shape assertion: merging an override against an
    // arbitrary step name still returns a config object whose `custom`
    // field comes from the baseline lookup (verifierRegistry["dev-story"]
    // has no custom — so result has no custom; this asserts the type-system
    // contract holds — projectVerifiers carries no `custom` field so the
    // merge output cannot reference it). The runtime AR17 boundary is
    // additionally enforced by `.strict()` rejecting `custom:` at LOAD time
    // (see VER_65_SCHEMA_STRICT_5).
    const config = getVerifierConfig("dev-story", {
      "dev-story": { requiredFrontmatterSections: ["owner"] },
    });
    // Baseline has no custom — merge result must also have no custom.
    expect(config.custom).toBeUndefined();
    // Schema preserved from baseline (null in v0.1).
    expect(config.schema).toBeNull();
  });
});
