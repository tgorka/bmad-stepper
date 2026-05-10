/**
 * src/smoke/loop-stop-conditions.test.ts — Subprocess-level smoke for the
 * /bmad-loop stop conditions that don't require a Task dispatch
 * (--plan-first, --time-budget at zero-elapsed). Complements
 * src/commands/loop/run.test.ts which exercises the predicates in-process
 * via the runNextOverride seam (fast unit-style coverage).
 *
 * Coverage:
 *   - --plan-first emits AR9 report + exit 0 (the canonical happy path).
 *   - --time-budget 1ms with default --max-iters fires the time-budget
 *     stop reason on iter 0 (the budget is exhausted before any
 *     iteration starts).
 *   - --max-iters 0 is rejected as a parse error (positive integer
 *     constraint per LoopArgsSchema).
 *
 * AR35 tmpdir-per-test discipline.
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
const LOOP_RUN_TS = path.join(REPO_ROOT, "src/commands/loop/run.ts");

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-smoke-loop-stop-"));
  await fs.cp(path.join(FIXTURE_ROOT, "_bmad"), path.join(tmp, "_bmad"), {
    recursive: true,
  });
  await fs.mkdir(path.join(tmp, "_bmad-output/.stepper"), { recursive: true });
  await Bun.write(
    path.join(tmp, "_bmad-output/.stepper/state.yaml"),
    Bun.YAML.stringify({
      schemaVersion: 1,
      project: { name: "smoke-test-project", bmadVersion: "6.6.0" },
      runHistory: [],
      checkpoints: [],
    }),
  );
  const pluginDir = path.join(tmp, ".claude", "plugins", "bmad-method-6.6.0");
  await fs.mkdir(path.join(pluginDir, ".claude-plugin"), { recursive: true });
  await Bun.write(
    path.join(pluginDir, ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: "bmad-method", version: "6.6.0" }),
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

async function spawnLoop(args: readonly string[]): Promise<SpawnResult> {
  const proc = Bun.spawn(["bun", "run", LOOP_RUN_TS, ...args], {
    cwd: tmp,
    env: { ...process.env, HOME: tmp },
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

function parseSingleAR9(stdout: string): {
  action: string;
  message: string;
  exitCode: number;
} {
  const lines = stdout
    .trim()
    .split("\n")
    .filter((l) => l.length > 0);
  expect(lines.length).toBe(1);
  const parsed = DispatchActionV1Schema.parse(JSON.parse(lines[0] as string));
  return parsed as { action: string; message: string; exitCode: number };
}

describe("smoke /bmad-loop stop conditions (subprocess)", () => {
  it("--plan-first short-circuits with AR9 report + exit 0", async () => {
    const result = await spawnLoop(["--plan-first", "--max-iters", "1"]);
    expect(result.exitCode).toBe(0);
    const action = parseSingleAR9(result.stdout);
    expect(action.action).toBe("report");
    expect(action.exitCode).toBe(0);
    expect(action.message).toContain("steps planned");
  });

  it("--time-budget with a tiny budget exits cleanly with the time-budget reason", async () => {
    // 1ms budget — practically guaranteed to be exhausted by the time
    // the runner reaches the per-iteration shouldStop check. Exits 0
    // (clean exit per FR53).
    const result = await spawnLoop(["--time-budget", "1", "--max-iters", "5"]);
    expect(result.exitCode).toBe(0);
    const action = parseSingleAR9(result.stdout);
    expect(action.action).toBe("report");
    // The Story 4.5 exit message includes the budget unit suffix.
    expect(action.message).toContain("time-budget");
  });

  it("--max-iters 0 is rejected as a parse error (exit 2)", async () => {
    const result = await spawnLoop(["--max-iters", "0"]);
    // Story 4.1 LoopArgsSchema rejects zero/negative max-iters.
    expect(result.exitCode).toBe(2);
  });
});
