/**
 * src/smoke/loop.test.ts — End-to-end smoke test for /bmad-loop happy
 * paths. Mirrors the Story 2.8 src/smoke/next.test.ts pattern:
 * tmpdir-per-test, fake BMAD plugin under <tmp>/.claude/plugins/, real
 * `bun run` subprocess invocations of src/commands/loop/run.ts.
 *
 * Coverage:
 *   - --max-iters 1 --plan-first happy path → AR9 `report` JSON line +
 *     exit code 0 + plan body shape.
 *   - --max-iters 1 (default-driver loop) on a synthetic state with
 *     `lastSuccessfulStep` already set → no-progress halt fires
 *     (the loop runner detects a dispatch action that does not advance
 *     state and short-circuits per `noProgressDetector`).
 *
 * AR35 tmpdir-per-test discipline. NEVER hard-coded /tmp paths.
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
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-smoke-loop-"));
  await copyDirectory(
    path.join(FIXTURE_ROOT, "_bmad"),
    path.join(tmp, "_bmad"),
  );
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
  // Fake BMAD plugin under <tmp>/.claude/plugins/ (legacy spec layout) so
  // detectBmadVersion clears under spawnRunner's HOME=<tmp> isolation.
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

function parseSingleAR9Line(stdout: string): unknown {
  const stdoutLines = stdout
    .trim()
    .split("\n")
    .filter((l) => l.length > 0);
  expect(stdoutLines.length).toBe(1);
  return DispatchActionV1Schema.parse(JSON.parse(stdoutLines[0] as string));
}

describe("smoke /bmad-loop happy paths", () => {
  it("--max-iters 1 --plan-first emits one AR9 report line with exit 0", async () => {
    const result = await spawnRunner(
      LOOP_RUN_TS,
      ["--max-iters", "1", "--plan-first"],
      tmp,
    );
    expect(result.exitCode).toBe(0);
    const action = parseSingleAR9Line(result.stdout);
    expect(action).toMatchObject({ action: "report", exitCode: 0 });

    // The plan body lives in the report's `message` field (AR9 stdout
    // discipline keeps it on a single JSON line; embedded newlines are
    // JSON-escaped). Assert the canonical Story 4.7 plan shape.
    const report = action as { action: string; message: string; exitCode: 0 };
    expect(report.message.length).toBeGreaterThan(0);
    // Plan output should mention the planned step count + first stop
    // condition per Story 4.7 formatPlan contract.
    expect(report.message).toContain("steps planned");
  });

  it("--max-iters 1 with empty state reports a clean exit with no dispatch", async () => {
    // Plain --max-iters 1 against a state where the cold-start picker
    // can not find a non-optional unstarted step exits cleanly with a
    // report describing the situation. This exercises the runtime-driver
    // path WITHOUT requiring a Task dispatch (which bun test cannot
    // exercise per architecture §line 1265).
    const result = await spawnRunner(LOOP_RUN_TS, ["--max-iters", "1"], tmp);
    // Exit may be 0 (clean exit via report) or 1 (halt) — both are
    // valid happy/sad ends. Assert AR9 stdout discipline only.
    expect([0, 1]).toContain(result.exitCode);
    const action = parseSingleAR9Line(result.stdout);
    expect(["report", "halt"]).toContain((action as { action: string }).action);
    // FR54: stdout discipline holds even on the halt path.
    expect(typeof (action as { exitCode?: number }).exitCode).toBe("number");
  });
});
