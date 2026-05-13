/**
 * src/smoke/skill-invocation.test.ts — Body-shape sanity sweep over the
 * three skills/<name>/SKILL.md files. Complements
 * tests/skills/skill-frontmatter.test.ts (which asserts frontmatter
 * structure) by checking that each skill body still describes the AR9
 * four-step protocol Layer-1 contract.
 *
 * Asserts:
 *   - Each known skill has a SKILL.md.
 *   - bmad-next + bmad-loop bodies reference both the run.ts and the
 *     verify-and-advance.ts Bash invocations (Layer 1 → Layer 2).
 *   - bmad-next + bmad-loop bodies reference the Task dispatch step
 *     (Layer 1 → Layer 3) — the word "Task" appears in either step
 *     instructions or the AR34 protocol exposition.
 *   - bmad-doctor body references its Layer-2 entry point (the alias
 *     does not dispatch a Task).
 *   - No SKILL.md leaks the deprecated v0.1 `$ARGUMENTS` engine token
 *     in an executable position (only the explanatory note about the
 *     replacement remains).
 *
 * AR35 isolation: pure FS reads against the repo's own files; no tmpdir
 * setup needed.
 */

import { describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const REPO_ROOT = process.cwd();
const SKILLS_DIR = path.join(REPO_ROOT, "skills");

async function readSkillBody(name: string): Promise<string> {
  return await fs.readFile(path.join(SKILLS_DIR, name, "SKILL.md"), "utf8");
}

describe("skill-invocation body shape", () => {
  it("each known skill has a SKILL.md present", async () => {
    for (const name of ["bmad-next", "bmad-loop", "bmad-doctor"]) {
      const body = await readSkillBody(name);
      expect(body.length).toBeGreaterThan(0);
    }
  });

  it("bmad-next body references both Layer-2 entry points + Task tool", async () => {
    const body = await readSkillBody("bmad-next");
    expect(body).toMatch(/bun run.*src\/commands\/next\/run\.ts/);
    expect(body).toMatch(
      /bun run.*src\/commands\/next\/verify-and-advance\.ts/,
    );
    // Tighter than `body.contains("Task")`: assert the body documents
    // a concrete Task dispatch step ("Task(...)" call shape OR the
    // canonical "Task tool" phrase). A bare word "Task" anywhere in
    // prose was too lenient (cubic PR #67).
    expect(body).toMatch(/Task\(|Task tool|Task dispatch/);
  });

  it("bmad-loop body references both Layer-2 entry points + Task tool + verify-and-advance.ts", async () => {
    const body = await readSkillBody("bmad-loop");
    // Loop's per-iteration body delegates to next/run.ts + next/verify-
    // and-advance.ts (driver loop) AND has a plan-first delegation to
    // src/commands/loop/run.ts.
    expect(body).toMatch(/bun run.*src\/commands\/next\/run\.ts/);
    expect(body).toMatch(/bun run.*src\/commands\/loop\/run\.ts/);
    // Cubic PR #67: the loop's required post-dispatch step is verify-
    // and-advance.ts — assert the body references it explicitly.
    expect(body).toMatch(/verify-and-advance\.ts/);
    expect(body).toMatch(/Task\(|Task tool|Task dispatch/);
  });

  it("bmad-doctor body references its Layer-2 entry point", async () => {
    const body = await readSkillBody("bmad-doctor");
    expect(body).toMatch(/bun run.*src\/commands\/doctor\/run\.ts/);
  });

  it("no skill body uses the deprecated $ARGUMENTS engine token in code blocks", async () => {
    // The string `$ARGUMENTS` may appear in explanatory prose
    // (clarifying that v0.2.0 dropped the substitution); it MUST NOT
    // appear inside a fenced bash code block (which would imply the
    // skill body still expects engine-level interpolation).
    for (const name of ["bmad-next", "bmad-loop", "bmad-doctor"]) {
      const body = await readSkillBody(name);
      // Find every fenced bash block; assert none contain $ARGUMENTS.
      const fence = /```bash\n([\s\S]*?)\n```/g;
      let match: RegExpExecArray | null = fence.exec(body);
      while (match !== null) {
        const block = match[1] ?? "";
        expect(
          block.includes("$ARGUMENTS"),
          `${name}/SKILL.md: bash code block uses deprecated $ARGUMENTS`,
        ).toBe(false);
        match = fence.exec(body);
      }
    }
  });
});
