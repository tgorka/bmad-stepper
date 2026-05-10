/**
 * src/integration/no-write-outside-scope.test.ts — NFR-S2 enforcement
 * smoke (architecture §line 1245 + §line 1396).
 *
 * Story 2.8 lands BOTH the canonical /bmad-next happy-path smoke
 * (src/smoke/next.test.ts) AND this dedicated NFR-S2 enforcement
 * smoke. The two share the same fixture (tests/fixtures/minimal-
 * bmad-project/) but assert different properties:
 *
 *   - src/smoke/next.test.ts          — happy-path correctness.
 *   - src/integration/no-write-outside-scope.test.ts (this file)
 *                                       — NFR-S2 scope enforcement
 *                                         across the full pipeline.
 *
 * The NFR-S2 assertion is a recursive walk of the test tmpdir
 * AFTER the smoke completes, confirming every file path lives
 * under one of the four allowed roots:
 *
 *   1. <tmp>/_bmad/                       — read-only fixture
 *   2. <tmp>/_bmad-output/                — Stepper internal scope
 *                                            (covers .stepper/ and
 *                                            <phase>-artifacts/)
 *   3. <tmp>/staging/                     — pre-promotion staging area
 *                                            (legacy; also covered by
 *                                            _bmad-output/.stepper/staging
 *                                            under #2)
 *
 * Per architecture line 1007: "an integration test exercises typical
 * paths (state advance, lock, snapshot, telemetry) and afterwards
 * uses fs.access to verify nothing was written outside _bmad-output/
 * .stepper/ and the test's tmpdir. Enforces NFR-S2."
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { DispatchActionV1Schema } from "../schemas/dispatch-protocol.ts";

let tmp = "";
const REPO_ROOT = process.cwd();
const FIXTURE_ROOT = path.join(
  REPO_ROOT,
  "tests/fixtures/minimal-bmad-project",
);
const NEXT_RUN_TS = path.join(REPO_ROOT, "src/commands/next/run.ts");
const VERIFY_AND_ADVANCE_TS = path.join(
  REPO_ROOT,
  "src/commands/next/verify-and-advance.ts",
);

// ─── Lifecycle hooks ──────────────────────────────────────────────────────

beforeEach(async () => {
  tmp = await fs.mkdtemp(
    path.join(os.tmpdir(), "stepper-no-write-outside-scope-"),
  );
  await copyDirectory(
    path.join(FIXTURE_ROOT, "_bmad"),
    path.join(tmp, "_bmad"),
  );
  await fs.mkdir(path.join(tmp, "_bmad-output"), { recursive: true });
  // Seed minimal state.yaml — see src/smoke/next.test.ts dev-002 deviation.
  await fs.mkdir(path.join(tmp, "_bmad-output/.stepper"), { recursive: true });
  await Bun.write(
    path.join(tmp, "_bmad-output/.stepper/state.yaml"),
    Bun.YAML.stringify({
      schemaVersion: 1,
      project: { name: "smoke-test-project", bmadVersion: "6.5.0" },
      runHistory: [],
      checkpoints: [],
    }),
  );
  // Set up a fake BMAD plugin under <tmp>/.claude/plugins/ so the
  // dispatch-path BMAD pre-check (`detectBmadVersion`) clears under
  // the spawnRunner `HOME=tmp` env. The plugin directory lives under
  // `.claude/plugins/` — same root the no-write invariants permit.
  const pluginDir = path.join(tmp, ".claude", "plugins", "bmad-method-6.5.0");
  await fs.mkdir(path.join(pluginDir, ".claude-plugin"), { recursive: true });
  await Bun.write(
    path.join(pluginDir, ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: "bmad-method", version: "6.5.0" }),
  );
});

afterEach(async () => {
  if (tmp !== "") {
    await fs.rm(tmp, { recursive: true, force: true });
    tmp = "";
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────

async function copyDirectory(src: string, dst: string): Promise<void> {
  await fs.mkdir(dst, { recursive: true });
  await fs.cp(src, dst, { recursive: true });
}

interface SpawnResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

async function spawnRunner(
  scriptPath: string,
  args: readonly string[],
  cwd: string,
): Promise<SpawnResult> {
  const proc = Bun.spawn(["bun", "run", scriptPath, ...args], {
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

/**
 * Recursively enumerate every file path under `root`. Returns absolute
 * paths. Excludes directories (only files are inspected).
 */
async function walkFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  const stack: string[] = [root];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  }
  return out;
}

/**
 * Per architecture line 1007 + NFR-S2: every file under the test
 * tmpdir MUST live under one of the allowed roots:
 *   - `<tmp>/_bmad/`         (read-only fixture)
 *   - `<tmp>/_bmad-output/`  (Stepper internal scope + canonical artifacts +
 *                              staging under .stepper/staging)
 *   - `<tmp>/staging/`       (legacy; defensive — current code stages under
 *                              _bmad-output/.stepper/staging)
 *
 * Returns the list of out-of-scope files (empty list = pass). Files
 * directly in the tmp root (no subdirectory) are also accepted as the
 * test's working scope.
 *
 * The `<tmp>/Library/Caches/bun/` and `<tmp>/.bun/install/cache/` paths
 * are infrastructure noise: setting `HOME: tmp` in the spawn helper
 * (per the doctor-marketplace.test.ts precedent for ~/.claude isolation)
 * causes Bun to populate its on-disk module cache under HOME. These are
 * Bun-runtime artifacts unrelated to the Stepper write surface and are
 * filtered out of the NFR-S2 assertion.
 */
function findOutOfScopeFiles(
  tmpdir: string,
  files: readonly string[],
): string[] {
  const allowedPrefixes = [
    `${path.join(tmpdir, "_bmad")}${path.sep}`,
    `${path.join(tmpdir, "_bmad-output")}${path.sep}`,
    `${path.join(tmpdir, "staging")}${path.sep}`,
  ];
  // Bun spawn-time cache prefixes — see helper docstring above.
  // `.claude/` is the test-fixture path for the fake BMAD plugin used
  // to satisfy the dispatch-path BMAD pre-check under HOME=tmp; it is
  // not a Stepper write surface, so it is filtered the same way as the
  // Bun cache directories.
  const bunCachePrefixes = [
    `${path.join(tmpdir, "Library/Caches/bun")}${path.sep}`,
    `${path.join(tmpdir, ".bun")}${path.sep}`,
    `${path.join(tmpdir, ".cache")}${path.sep}`,
    `${path.join(tmpdir, ".claude")}${path.sep}`,
  ];
  return files.filter((f) => {
    const parent = path.dirname(f);
    if (parent === tmpdir) return false;
    if (bunCachePrefixes.some((p) => f.startsWith(p))) return false;
    return !allowedPrefixes.some((p) => f.startsWith(p));
  });
}

function stagedArtifactPath(
  tmpdir: string,
  runId: string,
  stepName: string,
): string {
  return path.join(
    tmpdir,
    "_bmad-output/.stepper/staging",
    runId,
    "outputs",
    `${stepName}.md`,
  );
}

// ─── NFR-S2 enforcement test ──────────────────────────────────────────────

describe("NFR-S2 enforcement — no writes outside _bmad-output/.stepper/ and tmpdir", () => {
  it("after a happy-path /bmad-next smoke, every file lives under one of the allowed roots", async () => {
    // ─── Run the smoke pipeline (Steps 1-3 from src/smoke/next.test.ts). ──
    const result1 = await spawnRunner(
      NEXT_RUN_TS,
      ["--step", "bmad-brainstorming"],
      tmp,
    );
    expect(result1.exitCode).toBe(0);
    const stdoutLines = result1.stdout
      .trim()
      .split("\n")
      .filter((l) => l.length > 0);
    expect(stdoutLines.length).toBe(1);
    const action1 = DispatchActionV1Schema.parse(
      JSON.parse(stdoutLines[0] as string),
    );
    if (action1.action !== "dispatch") {
      throw new Error("expected dispatch");
    }
    const runId = action1.runId;

    // Mock the sub-agent step.
    const outputPath = stagedArtifactPath(tmp, runId, "bmad-brainstorming");
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await Bun.write(
      outputPath,
      "---\ntitle: NFR-S2 Smoke Test\nstatus: review\n---\n\n# Body\n",
    );

    const result2 = await spawnRunner(
      VERIFY_AND_ADVANCE_TS,
      ["--run-id", runId, "--tokens-in", "100", "--tokens-out", "50"],
      tmp,
    );
    expect(result2.exitCode).toBe(0);

    // ─── NFR-S2 walk: every file under tmp must live in an allowed root. ──
    const allFiles = await walkFiles(tmp);
    const outOfScope = findOutOfScopeFiles(tmp, allFiles);
    expect(outOfScope).toEqual([]);

    // Sanity — also confirm the canonical artifact exists under
    // _bmad-output/planning-artifacts/ (the verifier-pass + promote
    // chain landed correctly).
    const canonical = path.join(
      tmp,
      "_bmad-output/planning-artifacts/bmad-brainstorming.md",
    );
    expect(await Bun.file(canonical).exists()).toBe(true);
  });
});
