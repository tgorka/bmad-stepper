/**
 * src/integration/watch-fresh-project.test.ts — Story 3.9 AC-line-866-867
 * enforcement test (epic AC lines 866-867: "there are no run logs yet
 * (fresh project) → it prints `No run logs yet. Start a step with
 * /bmad-next.` and exits 0").
 *
 * The test:
 *   1. Spawns `bun run src/commands/next/run.ts -- --watch` against an
 *      empty tmpdir (no `_bmad-output/.stepper/runs/`).
 *   2. Captures stdout; asserts byte-identical match against the AC-line-867
 *      verbatim hint string (including the trailing `\n`).
 *   3. Asserts exit code 0 (success per FR53; the fresh-project case is a
 *      VALID success state).
 *   4. FR52 invariant: asserts no lock dir / lock file written (the
 *      watcher is structurally lock-free).
 *   5. FR54 invariant: asserts the stdout content is the verbatim hint
 *      DIRECTLY (NOT wrapped in AR9 JSON). The SECOND documented FR54
 *      carve-out (after Story 3.8's `--export-state`).
 *
 * Forward-deferred to v6.x: a sibling integration test invoking the
 * spawned subprocess + `process.kill(child.pid, "SIGINT")` for end-to-
 * end SIGINT validation. v0.1 Story 3.9 asserts only the fresh-project
 * edge per AC line 866-867; the SIGINT timing test lives in
 * `src/runs/watch.test.ts` Test G (colocated, deterministic via
 * AbortController).
 *
 * Modeled on src/integration/dry-run-no-writes.test.ts (Story 3.3) +
 * src/integration/export-state-no-lock.test.ts (Story 3.8).
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

let tmp = "";
const REPO_ROOT = process.cwd();
const NEXT_RUN_TS = path.join(REPO_ROOT, "src/commands/next/run.ts");

beforeEach(async () => {
  tmp = await fs.mkdtemp(
    path.join(os.tmpdir(), "stepper-watch-fresh-project-"),
  );
});

afterEach(async () => {
  if (tmp !== "") {
    await fs.rm(tmp, { recursive: true, force: true });
    tmp = "";
  }
});

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

describe("Story 3.9 AC-line-866-867 — `--watch` on fresh project emits hint + exits 0", () => {
  it("after `bun run src/commands/next/run.ts -- --watch` against an empty tmpdir, stdout is the verbatim hint", async () => {
    // No `_bmad-output/` directory exists at all (fresh-project case
    // per AC line 866-867).
    const result = await spawnRunner(NEXT_RUN_TS, ["--watch"], tmp);

    // FR53 — exit code 0 (success). The fresh-project case is a VALID
    // success state (the user simply hasn't run a step yet).
    expect(result.exitCode).toBe(0);

    // AC line 867 — byte-identical verbatim hint. The watcher emits the
    // hint via `process.stdout.write` from inside the helper.
    expect(result.stdout).toBe(
      "No run logs yet. Start a step with /bmad-next.\n",
    );

    // FR54 SPECIAL CASE: stdout is the raw hint, NOT an AR9-wrapped
    // JSON line. JSON.parse on this body must FAIL.
    let parsedAsJson = false;
    try {
      JSON.parse(result.stdout);
      parsedAsJson = true;
    } catch {
      parsedAsJson = false;
    }
    expect(parsedAsJson).toBe(false);

    // FR52 invariant: NO lock file or lock dir was created (the helper
    // never acquires the lock; structurally lock-free).
    const lockPath = path.join(tmp, "_bmad-output/.stepper/state.yaml.lock");
    await expect(fs.access(lockPath)).rejects.toThrow();
    const lockDirPath = path.join(tmp, "_bmad-output/.stepper/locks");
    await expect(fs.access(lockDirPath)).rejects.toThrow();

    // NFR-S2 invariant: no transcript files were created (the watcher is a
    // pure CONSUMER; ZERO write surface).
    const runsRoot = path.join(tmp, "_bmad-output/.stepper/runs");
    await expect(fs.access(runsRoot)).rejects.toThrow();
  });

  it("after spawn against a tmpdir with empty runsRoot, stdout is the same verbatim hint", async () => {
    // Pre-create `_bmad-output/.stepper/runs/` but leave it EMPTY (no
    // *.log files). Per Task 5.4: the fresh-project hint is emitted
    // when the directory has zero matching log files.
    await fs.mkdir(path.join(tmp, "_bmad-output/.stepper/runs"), {
      recursive: true,
    });

    const result = await spawnRunner(NEXT_RUN_TS, ["--watch"], tmp);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(
      "No run logs yet. Start a step with /bmad-next.\n",
    );
  });
});
