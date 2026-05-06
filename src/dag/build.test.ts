/**
 * src/dag/build.test.ts — Integration tests for the three-tier resolver.
 *
 * Uses AR35 tmpdir-per-test pattern — every test runs under a unique
 * `os.tmpdir()`-derived directory; cleanup via `fs.rm({ recursive: true,
 * force: true })` in `afterEach`. No mocking of `Bun.file` or
 * `node:fs/promises` — real-FS integration tests that exercise the
 * actual code path.
 *
 * Coverage:
 *   - AC-1: Tier 1 seed populates the adjacency list.
 *   - AC-2: Tier 2 overrides replace + append + graceful degradation.
 *   - AC-3: Tier 3 frontmatter parse success + failure → throws
 *           `UnknownBmadSkillError` with the AC-3 verbatim hint;
 *           cycle detection → throws `DagCycleError`; lazy story-level
 *           loading verified.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  ConfigError,
  DagCycleError,
  UnknownBmadSkillError,
} from "../errors.ts";
import { build } from "./build.ts";
import type { OverrideEntry } from "./types.ts";

let tmp = "";

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "bmad-stepper-dag-"));
});

afterEach(async () => {
  if (tmp !== "") {
    await fs.rm(tmp, { recursive: true, force: true });
    tmp = "";
  }
});

describe("build — Tier 1 (seed)", () => {
  it("populates the adjacency list from the seed when no overrides exist", async () => {
    const dag = await build({ skillNames: [], projectRoot: tmp });
    // Seed has ~40 entries.
    expect(dag.nodes.size).toBeGreaterThanOrEqual(30);
    expect(dag.nodes.size).toBeLessThanOrEqual(60);

    const createPrd = dag.nodes.get("bmad-create-prd");
    expect(createPrd).toBeDefined();
    expect(createPrd?.phase).toBe("planning");
    expect(createPrd?.persona).toBe("pm");
    expect(createPrd?.optional).toBe(false);
    expect(createPrd?.after).toContain("bmad-product-brief");

    // edgesOut: bmad-product-brief points to bmad-create-prd (since
    // bmad-create-prd.after = [bmad-product-brief]).
    expect(dag.edgesOut.get("bmad-product-brief")?.has("bmad-create-prd")).toBe(
      true,
    );
    // edgesIn mirror.
    expect(dag.edgesIn.get("bmad-create-prd")?.has("bmad-product-brief")).toBe(
      true,
    );
  });

  it("populates phase, after, optional, persona for every seed entry", async () => {
    const dag = await build({ skillNames: [], projectRoot: tmp });
    const validPhases = new Set([
      "analysis",
      "planning",
      "solutioning",
      "implementation",
      "retro",
    ]);
    for (const node of dag.nodes.values()) {
      expect(validPhases.has(node.phase)).toBe(true);
      expect(Array.isArray(node.after)).toBe(true);
      expect(typeof node.optional).toBe("boolean");
      expect(
        node.persona === null ||
          typeof node.persona === "string" ||
          Array.isArray(node.persona),
      ).toBe(true);
    }
  });

  it("computes the `before` field by inverting `after` across all entries", async () => {
    const dag = await build({ skillNames: [], projectRoot: tmp });
    // bmad-product-brief is named in bmad-create-prd.after; therefore
    // bmad-product-brief.before should include bmad-create-prd.
    const productBrief = dag.nodes.get("bmad-product-brief");
    expect(productBrief).toBeDefined();
    expect(productBrief?.before).toContain("bmad-create-prd");
  });
});

describe("build — Tier 2 (overrides)", () => {
  async function writeOverrides(yaml: string): Promise<void> {
    await Bun.write(path.join(tmp, "bmad-stepper.config.yaml"), yaml);
  }

  it("replaces seed entries when names match (AC-2)", async () => {
    // Override redefines bmad-create-prd with phase/persona/optional
    // changes; keep the seed `after` topology intact (bmad-product-brief)
    // to avoid cycle interference with seed.
    await writeOverrides(`overrides:
  bmad-create-prd:
    phase: solutioning
    after: [bmad-product-brief]
    optional: true
    persona: architect
`);
    const dag = await build({ skillNames: [], projectRoot: tmp });
    const node = dag.nodes.get("bmad-create-prd");
    expect(node).toBeDefined();
    expect(node?.phase).toBe("solutioning");
    expect(node?.persona).toBe("architect");
    expect(node?.optional).toBe(true);
    expect([...(node?.after ?? [])]).toEqual(["bmad-product-brief"]);
  });

  it("appends new entries not in the seed (AC-2)", async () => {
    await writeOverrides(`overrides:
  my-custom-skill:
    phase: implementation
    after: [bmad-dev-story]
    optional: true
    persona: dev
`);
    const dag = await build({ skillNames: [], projectRoot: tmp });
    expect(dag.nodes.has("my-custom-skill")).toBe(true);
    const node = dag.nodes.get("my-custom-skill");
    expect(node?.phase).toBe("implementation");
    expect(node?.persona).toBe("dev");
    expect([...(node?.after ?? [])]).toEqual(["bmad-dev-story"]);
  });

  it("supports dash-list `after` blocks (YAML alternative form)", async () => {
    await writeOverrides(`overrides:
  bmad-create-prd:
    phase: planning
    after:
      - bmad-product-brief
      - bmad-brainstorming
    optional: false
    persona: pm
`);
    const dag = await build({ skillNames: [], projectRoot: tmp });
    const node = dag.nodes.get("bmad-create-prd");
    expect([...(node?.after ?? [])].sort()).toEqual([
      "bmad-brainstorming",
      "bmad-product-brief",
    ]);
  });

  it("gracefully degrades when bmad-stepper.config.yaml is absent (AC-2)", async () => {
    // tmp has no config file.
    const dag = await build({ skillNames: [], projectRoot: tmp });
    expect(dag.nodes.size).toBeGreaterThan(0);
    // Seed-only graph — no override skills present.
    expect(dag.nodes.has("my-custom-skill")).toBe(false);
  });

  it("gracefully degrades when overrides parse fails (AC-2)", async () => {
    await writeOverrides(`overrides:
  bmad-create-prd:
    phase: not-a-valid-phase
    optional: notabool
`);
    const dag = await build({ skillNames: [], projectRoot: tmp });
    // Seed-only graph survives — bmad-create-prd retains seed phase.
    const node = dag.nodes.get("bmad-create-prd");
    expect(node?.phase).toBe("planning");
  });

  it("supports a custom overridesPath argument", async () => {
    const customPath = path.join(tmp, "custom-config.yaml");
    await Bun.write(
      customPath,
      `overrides:
  bmad-create-prd:
    phase: implementation
    persona: dev
`,
    );
    const dag = await build({
      skillNames: [],
      projectRoot: tmp,
      overridesPath: customPath,
    });
    const node = dag.nodes.get("bmad-create-prd");
    expect(node?.phase).toBe("implementation");
    expect(node?.persona).toBe("dev");
  });
});

describe("build — Tier 3 (frontmatter parse)", () => {
  it("parses SKILL.md frontmatter for unknown skills (AC-3 success)", async () => {
    const skillDir = path.join(
      tmp,
      "plugins",
      "skills",
      "my-frontmatter-skill",
    );
    await fs.mkdir(skillDir, { recursive: true });
    await Bun.write(
      path.join(skillDir, "SKILL.md"),
      `---
phase: implementation
after: [bmad-create-story]
optional: true
persona: dev
---

# My Frontmatter Skill body...
`,
    );
    const dag = await build({
      skillNames: ["my-frontmatter-skill"],
      projectRoot: tmp,
      pluginDir: path.join(tmp, "plugins"),
    });
    const node = dag.nodes.get("my-frontmatter-skill");
    expect(node).toBeDefined();
    expect(node?.phase).toBe("implementation");
    expect(node?.persona).toBe("dev");
    expect(node?.optional).toBe(true);
    expect([...(node?.after ?? [])]).toEqual(["bmad-create-story"]);
  });

  it("falls back to skill.yaml when SKILL.md is absent", async () => {
    const skillDir = path.join(tmp, "plugins", "skills", "yaml-only-skill");
    await fs.mkdir(skillDir, { recursive: true });
    await Bun.write(
      path.join(skillDir, "skill.yaml"),
      `phase: analysis
after: []
optional: true
persona: analyst
`,
    );
    const dag = await build({
      skillNames: ["yaml-only-skill"],
      projectRoot: tmp,
      pluginDir: path.join(tmp, "plugins"),
    });
    const node = dag.nodes.get("yaml-only-skill");
    expect(node).toBeDefined();
    expect(node?.phase).toBe("analysis");
    expect(node?.persona).toBe("analyst");
  });

  it("throws UnknownBmadSkillError when skill is unknown and no pluginDir is provided (AC-3 throw)", async () => {
    let caught: unknown;
    try {
      await build({ skillNames: ["nonexistent-skill"], projectRoot: tmp });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(UnknownBmadSkillError);
    if (caught instanceof UnknownBmadSkillError) {
      expect(caught.code).toBe("UNKNOWN_BMAD_SKILL");
      expect(caught.exitCode).toBe(3);
      expect(caught.actionableHint).toBe(
        "Add an override for nonexistent-skill in bmad-stepper.config.yaml under the overrides: block.",
      );
    }
  });

  it("throws UnknownBmadSkillError when SKILL.md and skill.yaml are both absent (AC-3 throw)", async () => {
    let caught: unknown;
    try {
      await build({
        skillNames: ["missing-skill"],
        projectRoot: tmp,
        pluginDir: path.join(tmp, "plugins"),
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(UnknownBmadSkillError);
    if (caught instanceof UnknownBmadSkillError) {
      expect(caught.actionableHint).toBe(
        "Add an override for missing-skill in bmad-stepper.config.yaml under the overrides: block.",
      );
    }
  });

  it("throws UnknownBmadSkillError when SKILL.md frontmatter is malformed (AC-3 throw)", async () => {
    const skillDir = path.join(tmp, "plugins", "skills", "malformed-skill");
    await fs.mkdir(skillDir, { recursive: true });
    await Bun.write(
      path.join(skillDir, "SKILL.md"),
      `# No frontmatter delimiters at all
just a body.
`,
    );
    let caught: unknown;
    try {
      await build({
        skillNames: ["malformed-skill"],
        projectRoot: tmp,
        pluginDir: path.join(tmp, "plugins"),
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(UnknownBmadSkillError);
  });
});

describe("build — Cycle detection (Tarjan)", () => {
  async function writeOverrides(yaml: string): Promise<void> {
    await Bun.write(path.join(tmp, "bmad-stepper.config.yaml"), yaml);
  }

  it("throws DagCycleError on a 2-cycle in overrides (AC-3)", async () => {
    await writeOverrides(`overrides:
  cycle-a:
    phase: implementation
    after: [cycle-b]
    optional: true
    persona: dev
  cycle-b:
    phase: implementation
    after: [cycle-a]
    optional: true
    persona: dev
`);
    let caught: unknown;
    try {
      await build({ skillNames: [], projectRoot: tmp });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(DagCycleError);
    if (caught instanceof DagCycleError) {
      expect(caught.code).toBe("DAG_CYCLE");
      expect(caught.exitCode).toBe(3);
      expect(caught.detail).toBeDefined();
      const parsed = JSON.parse(caught.detail ?? "{}") as {
        cycles: string[][];
      };
      const flat = parsed.cycles.flat().sort();
      expect(flat).toEqual(["cycle-a", "cycle-b"]);
    }
  });

  it("throws DagCycleError on a 3-cycle in overrides (AC-3)", async () => {
    await writeOverrides(`overrides:
  triple-a:
    phase: implementation
    after: [triple-c]
    optional: true
    persona: dev
  triple-b:
    phase: implementation
    after: [triple-a]
    optional: true
    persona: dev
  triple-c:
    phase: implementation
    after: [triple-b]
    optional: true
    persona: dev
`);
    let caught: unknown;
    try {
      await build({ skillNames: [], projectRoot: tmp });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(DagCycleError);
  });

  it("throws DagCycleError on a self-loop in overrides", async () => {
    await writeOverrides(`overrides:
  self-loop:
    phase: implementation
    after: [self-loop]
    optional: true
    persona: dev
`);
    let caught: unknown;
    try {
      await build({ skillNames: [], projectRoot: tmp });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(DagCycleError);
  });

  it("does NOT throw on the cycle-free seed alone (regression guard)", async () => {
    const dag = await build({ skillNames: [], projectRoot: tmp });
    expect(dag.nodes.size).toBeGreaterThan(0);
  });
});

describe("build — Lazy story-level loading (NFR-Sc1)", () => {
  it("returns only the global skill DAG, not story-level expansions (AC-3)", async () => {
    // Plant story files that should NOT be enumerated.
    const storyDir = path.join(tmp, "_bmad-output", "implementation-artifacts");
    await fs.mkdir(storyDir, { recursive: true });
    await Bun.write(path.join(storyDir, "2-1-foo.md"), "# Story 2.1");
    await Bun.write(path.join(storyDir, "2-2-bar.md"), "# Story 2.2");
    const dag = await build({ skillNames: [], projectRoot: tmp });
    expect(dag.nodes.has("2-1-foo")).toBe(false);
    expect(dag.nodes.has("2-2-bar")).toBe(false);
  });
});

describe("build — Dangling-edge defensive check", () => {
  async function writeOverrides(yaml: string): Promise<void> {
    await Bun.write(path.join(tmp, "bmad-stepper.config.yaml"), yaml);
  }

  it("throws ConfigError when an override's `after` references an unknown name (Story 6.2 AC-2 — was UnknownBmadSkillError pre-Story-6.2)", async () => {
    // Story 6.2 — the LEGACY hand-rolled YAML path also tracks override
    // origin via overrideTracking, so override-introduced unknown
    // predecessors uniformly surface as ConfigError (exit 2) per AC-2,
    // regardless of whether they arrived via STRICT (BuildInput.overrides)
    // or LEGACY (parseOverridesYaml on disk) entry. The hint format is
    // the OQ-5 single-line edge-pointing format.
    await writeOverrides(`overrides:
  my-skill:
    phase: implementation
    after: [some-undeclared-name]
    optional: true
    persona: dev
`);
    let caught: unknown;
    try {
      await build({ skillNames: [], projectRoot: tmp });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ConfigError);
    if (caught instanceof ConfigError) {
      expect(caught.code).toBe("CONFIG_ERROR");
      expect(caught.exitCode).toBe(2);
      expect(caught.actionableHint).toMatch(
        /See bmad-stepper\.config\.yaml at overrides\.my-skill\.after\[0\]: predecessor "some-undeclared-name"/,
      );
      expect(caught.actionableHint).toMatch(/Run \/bmad-next --doctor/);
      expect(caught.actionableHint).not.toMatch(/[\n\r]/);
    }
  });
});

describe("build — Determinism (AR33)", () => {
  it("produces identical adjacency-list keys in identical order across consecutive builds", async () => {
    const a = await build({ skillNames: [], projectRoot: tmp });
    const b = await build({ skillNames: [], projectRoot: tmp });
    expect([...a.nodes.keys()]).toEqual([...b.nodes.keys()]);
    expect([...a.edgesOut.keys()]).toEqual([...b.edgesOut.keys()]);
  });
});

// ─── Story 6.2 — Tier 2 strict path (BuildInput.overrides) ──────────────

describe("OVR_62: Tier 2 strict path via BuildInput.overrides (Story 6.2)", () => {
  it("OVR_62_REPLACE_1: AC-1 — places override at declared phase + replaces seed entry of same name", async () => {
    // AC-1 verbatim — supply { architecture-validator: { phase:
    // solutioning, after: [bmad-create-architecture], optional: true } }
    // (the AC's example uses the more concrete `bmad-create-architecture`
    // seed name as the predecessor). Verify the override entry is placed
    // at the declared phase with the declared edges.
    const overrides = new Map<string, OverrideEntry>([
      [
        "architecture-validator",
        {
          name: "architecture-validator",
          phase: "solutioning",
          after: ["bmad-create-architecture"],
          optional: true,
        },
      ],
    ]);
    const dag = await build({
      skillNames: [],
      projectRoot: tmp,
      overrides,
    });
    const node = dag.nodes.get("architecture-validator");
    expect(node).toBeDefined();
    expect(node?.phase).toBe("solutioning");
    expect(node?.optional).toBe(true);
    expect([...(node?.after ?? [])]).toEqual(["bmad-create-architecture"]);
  });

  it("OVR_62_REPLACE_2: replaces an EXISTING seed entry — phase + after fields override", async () => {
    // bmad-create-prd is in the seed at planning; override pins it to
    // implementation with a different `after`.
    const overrides = new Map<string, OverrideEntry>([
      [
        "bmad-create-prd",
        {
          name: "bmad-create-prd",
          phase: "implementation",
          after: ["bmad-product-brief"],
          optional: true,
        },
      ],
    ]);
    const dag = await build({
      skillNames: [],
      projectRoot: tmp,
      overrides,
    });
    const node = dag.nodes.get("bmad-create-prd");
    expect(node?.phase).toBe("implementation");
    expect(node?.optional).toBe(true);
    expect([...(node?.after ?? [])]).toEqual(["bmad-product-brief"]);
  });

  it("OVR_62_APPEND_1: appends a new skill not in the seed", async () => {
    const overrides = new Map<string, OverrideEntry>([
      [
        "experimental-skill",
        {
          name: "experimental-skill",
          phase: "implementation",
          after: ["bmad-dev-story"],
          optional: true,
          persona: "dev",
        },
      ],
    ]);
    const dag = await build({
      skillNames: [],
      projectRoot: tmp,
      overrides,
    });
    expect(dag.nodes.has("experimental-skill")).toBe(true);
    const node = dag.nodes.get("experimental-skill");
    expect(node?.phase).toBe("implementation");
    expect(node?.persona).toBe("dev");
    expect([...(node?.after ?? [])]).toEqual(["bmad-dev-story"]);
  });

  it("OVR_62_UNKNOWN_PRED_1: AC-2 — unknown predecessor surfaces ConfigError with hint pointing at after[0]", async () => {
    const overrides = new Map<string, OverrideEntry>([
      [
        "foo",
        {
          name: "foo",
          phase: "solutioning",
          after: ["nonexistent-skill"],
          optional: true,
        },
      ],
    ]);
    let caught: unknown;
    try {
      await build({ skillNames: [], projectRoot: tmp, overrides });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ConfigError);
    if (caught instanceof ConfigError) {
      expect(caught.code).toBe("CONFIG_ERROR");
      expect(caught.exitCode).toBe(2);
      expect(caught.actionableHint).toMatch(
        /See bmad-stepper\.config\.yaml at overrides\.foo\.after\[0\]: predecessor "nonexistent-skill" is not a known skill\./,
      );
      expect(caught.actionableHint).toMatch(/Run \/bmad-next --doctor/);
      expect(caught.actionableHint).not.toMatch(/[\n\r]/);
    }
  });

  it("OVR_62_UNKNOWN_PRED_2: hint satisfies AR22 regex /^.*(Run|See|Try|Check) /", async () => {
    const overrides = new Map<string, OverrideEntry>([
      [
        "bar",
        {
          name: "bar",
          phase: "solutioning",
          after: ["nonexistent-2"],
          optional: true,
        },
      ],
    ]);
    let caught: unknown;
    try {
      await build({ skillNames: [], projectRoot: tmp, overrides });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ConfigError);
    if (caught instanceof ConfigError) {
      expect(caught.actionableHint).toMatch(/^.*(Run|See|Try|Check) /);
    }
  });

  it("OVR_62_UNKNOWN_SUCC_1: AC-2 symmetric — unknown successor (before) surfaces ConfigError pointing at before[0]", async () => {
    const overrides = new Map<string, OverrideEntry>([
      [
        "qux",
        {
          name: "qux",
          phase: "solutioning",
          before: ["nonexistent-target"],
          optional: true,
        },
      ],
    ]);
    let caught: unknown;
    try {
      await build({ skillNames: [], projectRoot: tmp, overrides });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ConfigError);
    if (caught instanceof ConfigError) {
      expect(caught.code).toBe("CONFIG_ERROR");
      expect(caught.exitCode).toBe(2);
      expect(caught.actionableHint).toMatch(
        /See bmad-stepper\.config\.yaml at overrides\.qux\.before\[0\]: successor "nonexistent-target" is not a known skill\./,
      );
      expect(caught.actionableHint).not.toMatch(/[\n\r]/);
    }
  });

  it("OVR_62_TYPED_INPUT_1: AC-1 — when BuildInput.overrides is provided, malformed YAML on disk is IGNORED (strict path bypasses YAML)", async () => {
    // Write a malformed YAML to disk. Then supply a valid typed
    // overrides Map. The strict path should fire and bypass the YAML
    // entirely, so build() succeeds.
    await Bun.write(
      path.join(tmp, "bmad-stepper.config.yaml"),
      `overrides:
  bmad-create-prd:
    phase: not-a-valid-phase
    optional: notabool
`,
    );
    const overrides = new Map<string, OverrideEntry>([
      [
        "experimental-2",
        {
          name: "experimental-2",
          phase: "implementation",
          after: ["bmad-dev-story"],
          optional: true,
        },
      ],
    ]);
    const dag = await build({
      skillNames: [],
      projectRoot: tmp,
      overrides,
    });
    // Strict path applied → experimental-2 present, bmad-create-prd
    // unchanged (seed phase).
    expect(dag.nodes.has("experimental-2")).toBe(true);
    expect(dag.nodes.get("bmad-create-prd")?.phase).toBe("planning");
  });

  it("OVR_62_LEGACY_FALLBACK_1: regression — BuildInput.overrides === undefined → LEGACY parseOverridesYaml fallback fires", async () => {
    await Bun.write(
      path.join(tmp, "bmad-stepper.config.yaml"),
      `overrides:
  bmad-create-prd:
    phase: solutioning
    after: [bmad-product-brief]
    optional: true
    persona: architect
`,
    );
    const dag = await build({ skillNames: [], projectRoot: tmp });
    const node = dag.nodes.get("bmad-create-prd");
    expect(node?.phase).toBe("solutioning");
    expect(node?.persona).toBe("architect");
  });

  it("OVR_62_CYCLE_1: AC-3 — override introduces a 2-cycle → DagCycleError (existing path unchanged)", async () => {
    const overrides = new Map<string, OverrideEntry>([
      [
        "cycle-x",
        {
          name: "cycle-x",
          phase: "implementation",
          after: ["cycle-y"],
          optional: true,
          persona: "dev",
        },
      ],
      [
        "cycle-y",
        {
          name: "cycle-y",
          phase: "implementation",
          after: ["cycle-x"],
          optional: true,
          persona: "dev",
        },
      ],
    ]);
    let caught: unknown;
    try {
      await build({ skillNames: [], projectRoot: tmp, overrides });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(DagCycleError);
  });

  it("OVR_62_RECORD_INPUT_1: accepts a plain Record<string, OverrideEntry> (Zod-record shape)", async () => {
    // Zod's `z.record(z.string(), OverrideEntrySchema)` infers to
    // `Record<string, OverrideEntry>`; build() must normalise it to a
    // Map internally.
    const overrides: Record<string, OverrideEntry> = {
      "experimental-3": {
        name: "experimental-3",
        phase: "implementation",
        after: ["bmad-dev-story"],
        optional: true,
      },
    };
    const dag = await build({
      skillNames: [],
      projectRoot: tmp,
      overrides,
    });
    expect(dag.nodes.has("experimental-3")).toBe(true);
  });

  it("OVR_62_HINT_SINGLE_LINE_1: ConfigError hint passes the Story 5.6 single-line constraint", async () => {
    const overrides = new Map<string, OverrideEntry>([
      [
        "single-line-test",
        {
          name: "single-line-test",
          phase: "solutioning",
          after: ["nonexistent-x"],
          optional: true,
        },
      ],
    ]);
    let caught: unknown;
    try {
      await build({ skillNames: [], projectRoot: tmp, overrides });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ConfigError);
    if (caught instanceof ConfigError) {
      // No newline characters anywhere in the hint.
      expect(caught.actionableHint).not.toMatch(/[\n\r]/);
    }
  });

  it("OVR_62_BEFORE_INVERSION_1: override-authored `before` edges are folded into adjacency", async () => {
    // When override authors `before: [bmad-dev-story]`, the override
    // owner becomes a predecessor of bmad-dev-story — so
    // bmad-dev-story.before should include the owner name.
    const overrides = new Map<string, OverrideEntry>([
      [
        "pre-dev-step",
        {
          name: "pre-dev-step",
          phase: "implementation",
          before: ["bmad-dev-story"],
          optional: true,
          persona: "dev",
        },
      ],
    ]);
    const dag = await build({
      skillNames: [],
      projectRoot: tmp,
      overrides,
    });
    const target = dag.nodes.get("bmad-dev-story");
    expect(target).toBeDefined();
    expect(target?.before).toContain("pre-dev-step");
    // edgesOut: pre-dev-step → bmad-dev-story.
    expect(dag.edgesOut.get("pre-dev-step")?.has("bmad-dev-story")).toBe(true);
  });
});
