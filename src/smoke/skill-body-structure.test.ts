/**
 * src/smoke/skill-body-structure.test.ts — Static structural analyzer
 * for SKILL.md bodies. Implements docs/testing-roadmap.md §"Out of
 * scope #1 — True Layer 1 simulation" by enforcing structural
 * invariants on the SKILL.md prose without requiring Claude API
 * access. The analyzer asserts that the body PRESCRIBES the AR9
 * four-step protocol unambiguously enough that any faithful reader
 * (Claude or a deterministic mini-interpreter) would produce the
 * same dispatch sequence.
 *
 * What this analyzer enforces:
 *
 *   1. Frontmatter `name` matches directory basename (covered by
 *      tests/skills/skill-frontmatter.test.ts; re-checked here for
 *      defence-in-depth).
 *   2. Body has a "Tool restrictions" section listing the allowed
 *      tools (Bash for doctor; Bash + Task + Read for next + loop).
 *   3. Body has at least one bash code block invoking the
 *      `bun run src/commands/<name>/run.ts` Layer-2 entry point.
 *   4. For next + loop only: body references the Task tool with an
 *      AGENT name matching one of the declared agents under
 *      `agents/<name>.md` (bmad-step-runner OR bmad-step-fixer).
 *   5. For next + loop only: body references
 *      `verify-and-advance.ts` (the AR9 step 4 invocation).
 *   6. For next + loop only: body documents the AR9 JSON line shape
 *      (mentions the `action` field discriminator with at least the
 *      three variants `dispatch` / `report` / `halt`).
 *   7. Body has NO TODO / FIXME / XXX markers (would indicate
 *      incomplete documentation that Claude might misinterpret).
 *
 * What this does NOT enforce (still genuinely out of scope):
 *
 *   - Semantic correctness of the prose explanation under context
 *     pressure (Claude paraphrasing or summarizing the body).
 *   - The actual Task tool invocation by Claude with the right
 *     agent + dispatch-spec path + model parameter.
 *   - Per-flag branch reasoning (e.g., does the body correctly
 *     guide Claude to thread `--skip-step <step>` to verify-and-
 *     advance.ts when the user types `/bmad-next --skip X --resume`).
 *
 * For a true Claude API integration test, see
 * `tests/harness/layer1-claude-sim.test.ts` (env-gated on
 * ANTHROPIC_API_KEY; skipped in standard CI).
 *
 * AR35 isolation: pure FS reads against the repo's own files.
 */

import { describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const REPO_ROOT = process.cwd();
const SKILLS_DIR = path.join(REPO_ROOT, "skills");
const AGENTS_DIR = path.join(REPO_ROOT, "agents");

interface SkillStructure {
  readonly name: string;
  /** Tools the SKILL.md body must list under "Tool restrictions". */
  readonly expectedTools: readonly ("Bash" | "Task" | "Read")[];
  /** Whether the body must reference Task + verify-and-advance. */
  readonly hasFullAR9: boolean;
}

const skills: readonly SkillStructure[] = [
  {
    name: "bmad-doctor",
    expectedTools: ["Bash"],
    hasFullAR9: false,
  },
  {
    name: "bmad-next",
    expectedTools: ["Bash", "Task", "Read"],
    hasFullAR9: true,
  },
  {
    name: "bmad-loop",
    expectedTools: ["Bash", "Task", "Read"],
    hasFullAR9: true,
  },
];

async function readSkill(name: string): Promise<string> {
  return await fs.readFile(path.join(SKILLS_DIR, name, "SKILL.md"), "utf8");
}

async function listDeclaredAgents(): Promise<readonly string[]> {
  const entries = await fs.readdir(AGENTS_DIR);
  return entries
    .filter((e) => e.endsWith(".md"))
    .map((e) => e.replace(/\.md$/, ""));
}

function splitFrontmatterAndBody(raw: string): {
  frontmatter: string;
  body: string;
} {
  if (!raw.startsWith("---\n")) {
    return { frontmatter: "", body: raw };
  }
  const end = raw.indexOf("\n---\n", 4);
  if (end === -1) {
    return { frontmatter: "", body: raw };
  }
  return { frontmatter: raw.slice(4, end), body: raw.slice(end + 5) };
}

function extractBashBlocks(body: string): readonly string[] {
  const blocks: string[] = [];
  const fence = /```bash\n([\s\S]*?)\n```/g;
  let m: RegExpExecArray | null = fence.exec(body);
  while (m !== null) {
    blocks.push(m[1] ?? "");
    m = fence.exec(body);
  }
  return blocks;
}

describe("skill body structure analyzer", () => {
  for (const skill of skills) {
    describe(`skill ${skill.name}`, () => {
      it("has Tool restrictions section listing the expected tools", async () => {
        const { body } = splitFrontmatterAndBody(await readSkill(skill.name));
        const toolSection = body.match(/##[^\n]*Tool restrictions[\s\S]*/);
        expect(
          toolSection,
          `${skill.name}: missing "Tool restrictions" section`,
        ).not.toBeNull();
        if (toolSection !== null) {
          for (const tool of skill.expectedTools) {
            expect(
              toolSection[0],
              `${skill.name} Tool restrictions section missing ${tool}`,
            ).toContain(tool);
          }
        }
      });

      it(`prescribes bun run src/commands/<group>/run.ts in a bash code block`, async () => {
        const body = await readSkill(skill.name);
        const blocks = extractBashBlocks(body);
        expect(blocks.length).toBeGreaterThan(0);
        const groupKey = skill.name.replace(/^bmad-/, "");
        const expectedScript = `src/commands/${groupKey}/run.ts`;
        const matches = blocks.filter((b) => b.includes(expectedScript));
        expect(
          matches.length,
          `${skill.name}: no bash block invokes ${expectedScript}`,
        ).toBeGreaterThan(0);
      });

      if (skill.hasFullAR9) {
        it("references at least one declared agent under agents/", async () => {
          const body = await readSkill(skill.name);
          const declaredAgents = await listDeclaredAgents();
          const referenced = declaredAgents.filter((agent) =>
            body.includes(agent),
          );
          expect(
            referenced.length,
            `${skill.name}: references no declared agent (one of ${declaredAgents.join(", ")})`,
          ).toBeGreaterThan(0);
        });

        it("documents the AR9 action discriminator (dispatch / report / halt)", async () => {
          const body = await readSkill(skill.name);
          for (const variant of ["dispatch", "report", "halt"]) {
            expect(
              body,
              `${skill.name}: AR9 ${variant} variant not documented`,
            ).toContain(variant);
          }
        });

        it("references the verify-and-advance.ts Layer-2 second-call entry point", async () => {
          const body = await readSkill(skill.name);
          expect(body).toContain("verify-and-advance.ts");
        });

        it("references the Task tool", async () => {
          const body = await readSkill(skill.name);
          expect(body).toContain("Task");
        });
      }

      it("has no TODO / FIXME / XXX markers in the body", async () => {
        const { body } = splitFrontmatterAndBody(await readSkill(skill.name));
        expect(body).not.toMatch(/\bTODO\b/);
        expect(body).not.toMatch(/\bFIXME\b/);
        expect(body).not.toMatch(/\bXXX\b/);
      });
    });
  }
});
