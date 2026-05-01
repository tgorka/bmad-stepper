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
import { DagCycleError, UnknownBmadSkillError } from "../errors.ts";
import { build } from "./build.ts";

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

  it("throws UnknownBmadSkillError when an override's `after` references an unknown name", async () => {
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
    expect(caught).toBeInstanceOf(UnknownBmadSkillError);
    if (caught instanceof UnknownBmadSkillError) {
      expect(caught.actionableHint).toBe(
        "Add an override for some-undeclared-name in bmad-stepper.config.yaml under the overrides: block.",
      );
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
