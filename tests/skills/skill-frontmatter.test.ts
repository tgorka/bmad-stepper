/**
 * tests/skills/skill-frontmatter.test.ts — Sanity sweep over every
 * `skills/<name>/SKILL.md` file in the plugin.
 *
 * Asserts:
 *   1. SKILL.md exists at every skill subdirectory of `skills/`.
 *   2. The YAML frontmatter parses cleanly.
 *   3. `name` field equals the parent directory basename (the convention
 *      Claude Code uses to map `skills/<dir>/SKILL.md` → invocable
 *      `<plugin>:<dir>` skill).
 *   4. `description` is a non-empty string.
 *   5. The body still references `bun run` invocation of an
 *      `src/commands/<name>/run.ts` (the Layer-2 entry point) — guards
 *      against accidental loss of the AR9 four-step protocol during
 *      future skill rewrites.
 *
 * AR35 isolation: tests are pure-FS reads against the repo's own files;
 * no tmpdir setup needed.
 */

import { describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const PLUGIN_ROOT = path.resolve(import.meta.dir, "..", "..");
const SKILLS_DIR = path.join(PLUGIN_ROOT, "skills");

interface Frontmatter {
  name?: unknown;
  description?: unknown;
}

async function listSkillDirs(): Promise<string[]> {
  const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function splitFrontmatter(
  raw: string,
): { frontmatter: string; body: string } | null {
  if (!raw.startsWith("---\n")) return null;
  const end = raw.indexOf("\n---\n", 4);
  if (end === -1) return null;
  return {
    frontmatter: raw.slice(4, end),
    body: raw.slice(end + 5),
  };
}

describe("skills/<name>/SKILL.md frontmatter sanity", () => {
  it("declares at least one skill", async () => {
    const dirs = await listSkillDirs();
    expect(dirs.length).toBeGreaterThan(0);
  });

  it("each skill has a SKILL.md with valid frontmatter", async () => {
    const dirs = await listSkillDirs();
    for (const dir of dirs) {
      const skillPath = path.join(SKILLS_DIR, dir, "SKILL.md");
      const raw = await fs.readFile(skillPath, "utf8");
      const split = splitFrontmatter(raw);
      if (split === null) {
        throw new Error(`${dir}/SKILL.md missing/malformed frontmatter`);
      }
      const fm = Bun.YAML.parse(split.frontmatter) as Frontmatter;

      expect(typeof fm.name).toBe("string");
      expect(fm.name, `${dir}/SKILL.md name mismatch`).toBe(dir);
      expect(typeof fm.description).toBe("string");
      expect((fm.description as string).length).toBeGreaterThan(0);
    }
  });

  it("each skill body references its Layer-2 bun run entry point", async () => {
    const dirs = await listSkillDirs();
    for (const dir of dirs) {
      const skillPath = path.join(SKILLS_DIR, dir, "SKILL.md");
      const raw = await fs.readFile(skillPath, "utf8");
      const split = splitFrontmatter(raw);
      if (split === null) {
        throw new Error(`${dir}/SKILL.md missing/malformed frontmatter`);
      }
      const body = split.body;

      // Loop and next dispatch through src/commands/{loop,next}/run.ts; doctor
      // delegates to src/commands/doctor/run.ts. Match either pattern.
      const hasRunInvocation =
        /bun run\s+(<plugin-root>\/)?src\/commands\/[a-z]+\/(run|verify-and-advance)\.ts/.test(
          body,
        );
      expect(
        hasRunInvocation,
        `${dir}/SKILL.md missing bun run invocation`,
      ).toBe(true);
    }
  });
});
