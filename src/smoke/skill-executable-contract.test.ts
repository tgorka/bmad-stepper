/**
 * src/smoke/skill-executable-contract.test.ts — Skill body executable
 * contract sweep. Stronger than skill-invocation.test.ts (which is a
 * static text grep): this file EXTRACTS the first bash code block from
 * each SKILL.md, parses out the script path the body prescribes, and
 * verifies (a) the path exists on disk, (b) the script is invocable via
 * `bun run` with a known-safe argv, and (c) the resulting stdout obeys
 * AR9 discipline (exactly one JSON line for /bmad-next + /bmad-loop;
 * zero stdout for /bmad-doctor — its output goes to stderr per FR54).
 *
 * What this catches that skill-invocation.test.ts does not:
 *   - SKILL.md body referencing a script path that no longer exists
 *     (e.g., a future refactor renames src/commands/loop/run.ts).
 *   - SKILL.md prescribing a bun run invocation that crashes on parse
 *     (script-side argv validation regression).
 *   - The script being unrunnable in the freshly-extracted form (e.g.,
 *     a stale `--flag=value` syntax the tokenizer no longer accepts).
 *
 * What this does NOT catch:
 *   - Semantic correctness of the SKILL.md prose (Claude's
 *     interpretation of the body — out of scope for bun test per the
 *     architecture §line 1265 "Layer 2 forbidden from Task tool"
 *     constraint).
 *   - The Task dispatch step inside the four-step AR9 protocol (no
 *     Claude API access in unit tests).
 *
 * AR35 tmpdir-per-test discipline: each invocation runs in its own
 * tmpdir with a fake BMAD plugin installed under <tmp>/.claude/plugins/.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { DispatchActionV1Schema } from "../schemas/dispatch-protocol.ts";

const REPO_ROOT = process.cwd();
const SKILLS_DIR = path.join(REPO_ROOT, "skills");

let tmp = "";

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-skill-exec-"));
  // Set up a fake BMAD plugin under <tmp>/.claude/plugins/ so the
  // detector clears under HOME=<tmp> isolation. Use the same minimal
  // shape as src/smoke/{loop,doctor,next}.test.ts.
  const pluginDir = path.join(tmp, ".claude", "plugins", "bmad-method-6.6.0");
  await fs.mkdir(path.join(pluginDir, ".claude-plugin"), { recursive: true });
  await Bun.write(
    path.join(pluginDir, ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: "bmad-method", version: "6.6.0" }),
  );
  await fs.mkdir(path.join(pluginDir, "skills", "bmad-brainstorming"), {
    recursive: true,
  });
  await Bun.write(
    path.join(pluginDir, "skills", "bmad-brainstorming", "SKILL.md"),
    "---\nname: bmad-brainstorming\ndescription: Stub.\n---\n",
  );
  // Seed a minimal cold-start state.yaml so loadStateUnlocked does not
  // throw CorruptStateError on the next/loop invocations.
  await fs.mkdir(path.join(tmp, "_bmad-output/.stepper"), { recursive: true });
  await Bun.write(
    path.join(tmp, "_bmad-output/.stepper/state.yaml"),
    Bun.YAML.stringify({
      schemaVersion: 1,
      project: { name: "skill-exec-test", bmadVersion: "6.6.0" },
      runHistory: [],
      checkpoints: [],
    }),
  );
});

afterEach(async () => {
  if (tmp !== "") {
    await fs.rm(tmp, { recursive: true, force: true });
    tmp = "";
  }
});

interface ExtractedBash {
  readonly scriptRelPath: string;
  readonly raw: string;
}

/**
 * Extract a bash code block matching `bun run <expectedScriptPattern>`
 * from a SKILL.md. Returns the script's repo-relative path and the raw
 * block text (for forensic visibility on assertion failure).
 *
 * The parser walks every fenced bash block and returns the FIRST match
 * whose script path includes `expectedScriptPattern`. Skills that
 * delegate to multiple Layer-2 entry points (e.g., bmad-loop has both
 * `src/commands/next/run.ts` for per-iteration AND
 * `src/commands/loop/run.ts` for plan-first delegation) require the
 * pattern to disambiguate.
 *
 * Intentionally narrow: matches the canonical
 * `bun run src/commands/<group>/<file>.ts -- <captured-flags>`
 * shape the AR9 four-step protocol prescribes. Future SKILL.md
 * variations (different invocation forms) need to extend this parser.
 */
function extractBunRun(
  body: string,
  expectedScriptPattern: string,
): ExtractedBash | null {
  const fence = /```bash\n([\s\S]*?)\n```/g;
  let match: RegExpExecArray | null = fence.exec(body);
  while (match !== null) {
    const block = match[1] ?? "";
    const bunRun = block.match(/bun run\s+(?:<plugin-root>\/)?(\S+\.ts)/);
    if (bunRun?.[1]?.includes(expectedScriptPattern)) {
      return { scriptRelPath: bunRun[1], raw: block };
    }
    match = fence.exec(body);
  }
  return null;
}

interface SpawnResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

async function spawnBun(
  scriptAbsPath: string,
  argv: readonly string[],
  cwd: string,
): Promise<SpawnResult> {
  const proc = Bun.spawn(["bun", "run", scriptAbsPath, ...argv], {
    cwd,
    env: { ...process.env, HOME: cwd },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}

interface SkillContract {
  readonly name: string;
  /**
   * Substring used to disambiguate which bash block to extract from
   * the SKILL.md. The bmad-loop body contains BOTH a per-iteration
   * `next/run.ts` block (Step 2a) AND a `loop/run.ts` plan-first
   * delegation block (Step 4); the contract test asserts the
   * loop/run.ts block since that's the canonical entry point for
   * the loop skill.
   */
  readonly expectedScriptPattern: string;
  /** Known-safe argv to invoke the extracted script with. */
  readonly safeArgv: readonly string[];
  /** Expected stdout discipline: how many AR9 JSON lines on stdout. */
  readonly expectedAR9Lines: 0 | 1;
}

const contracts: readonly SkillContract[] = [
  {
    name: "bmad-doctor",
    expectedScriptPattern: "src/commands/doctor/run.ts",
    // Doctor is read-only and emits to stderr only — stdout is empty.
    safeArgv: [],
    expectedAR9Lines: 0,
  },
  {
    name: "bmad-next",
    expectedScriptPattern: "src/commands/next/run.ts",
    // --explain exercises an AR9-emitting path that does not require
    // dispatching a sub-agent.
    safeArgv: ["--explain"],
    expectedAR9Lines: 1,
  },
  {
    name: "bmad-loop",
    expectedScriptPattern: "src/commands/loop/run.ts",
    // --plan-first short-circuits before any iteration body and emits
    // one AR9 report line.
    safeArgv: ["--plan-first", "--max-iters", "1"],
    expectedAR9Lines: 1,
  },
];

describe("skill-executable contract sweep", () => {
  for (const contract of contracts) {
    it(`${contract.name}: SKILL.md prescribes a runnable bun run invocation`, async () => {
      const body = await fs.readFile(
        path.join(SKILLS_DIR, contract.name, "SKILL.md"),
        "utf8",
      );
      const extracted = extractBunRun(body, contract.expectedScriptPattern);
      if (extracted === null) {
        throw new Error(
          `${contract.name}/SKILL.md: no \`bun run ${contract.expectedScriptPattern}\` invocation found in any bash code block`,
        );
      }

      // (a) Script path resolves to an existing file in the repo.
      const absPath = path.join(REPO_ROOT, extracted.scriptRelPath);
      const exists = await fs
        .stat(absPath)
        .then(() => true)
        .catch(() => false);
      expect(
        exists,
        `${contract.name}/SKILL.md references missing script ${extracted.scriptRelPath}`,
      ).toBe(true);

      // (b) Script is invocable via the extracted shape with the
      //     known-safe argv. Exit code MUST NOT be PARSE_ERROR (2) — a
      //     2 means the runner rejected our argv shape, indicating the
      //     SKILL.md's argv-forwarding contract drifted. Other non-zero
      //     codes (1, 3) are acceptable for the contract sweep — they
      //     reflect runtime branches, not contract regressions.
      const result = await spawnBun(absPath, contract.safeArgv, tmp);
      expect(
        result.exitCode,
        `${contract.name}: parse error (exit 2) — argv shape regression. stderr:\n${result.stderr}`,
      ).not.toBe(2);

      // (c) AR9 stdout discipline (FR54): exactly the expected line count.
      const stdoutLines = result.stdout
        .trim()
        .split("\n")
        .filter((l) => l.length > 0);
      expect(stdoutLines.length).toBe(contract.expectedAR9Lines);

      // When an AR9 line is expected, validate it round-trips through
      // the schema. Defence-in-depth: the runner's `emit.ts` already
      // validates before write, but a contract regression in the
      // schema itself would surface here.
      if (contract.expectedAR9Lines === 1) {
        expect(() =>
          DispatchActionV1Schema.parse(JSON.parse(stdoutLines[0] as string)),
        ).not.toThrow();
      }
    });
  }
});
