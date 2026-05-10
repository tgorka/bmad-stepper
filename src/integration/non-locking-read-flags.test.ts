/**
 * src/integration/non-locking-read-flags.test.ts — Story 3.10 AC-line-884
 * enforcement integration test (epic AC line 884: "integration test runs
 * concurrent active + read-only invocations and asserts both succeed").
 *
 * For each of the FIVE read-only flags (`--export-state`, `--diff-state`,
 * `--explain`, `--list`, `--dry-run`):
 *   1. Seed a minimal valid state.yaml in a tmpdir.
 *   2. Synthesise a held lock dir with a "live" pid file (mtime = now;
 *      pid = process.pid + 100_000 to evade the self-owned reclaim path).
 *      Mirrors src/lock/integration/concurrent-acquire.test.ts:49-58.
 *   3. Spawn `bun run src/commands/next/run.ts -- --<flag>` as a subprocess
 *      against the tmpdir.
 *   4. Capture stdout + stderr + exit code.
 *   5. Assert (a) exit code === 0 (NOT 4 — the LOCK_CONTENTION exit code per
 *      FR53), (b) appropriate stdout shape per flag, (c) NO `LOCK_CONTENTION`
 *      substring in stderr, (d) the synthesised lock dir is STILL PRESENT
 *      after the spawn (the read-only flag did NOT touch the lock).
 *
 * The structural lock-free contract per AR8 means these tests pass in v0.1
 * EVEN WITHOUT the `skipAcquire` flag (the read-only flags structurally
 * never reach `acquire(...)` in `run.ts`); Story 3.10's new flag formalises
 * the contract surface; this integration test verifies the contract end-to-
 * end against a held-lock fixture.
 *
 * `--watch` is OUT of the five-flag enumeration (epics.md line 873) — the
 * watcher's lock-free posture is structural without the opt-in (Story 3.9
 * §Forward Dependencies). Story 3.9's integration test
 * (`src/integration/watch-fresh-project.test.ts`) covers `--watch` separately.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { StateExportV1Schema } from "../schemas/state-export.ts";

let tmp = "";
const REPO_ROOT = process.cwd();
const NEXT_RUN_TS = path.join(REPO_ROOT, "src/commands/next/run.ts");

interface PidFileShape {
  pid: number;
  hostname: string;
  acquiredAt: string;
  heartbeatIntervalMs: number;
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
 * Inline the `synthesiseHeldLock` pattern from
 * `src/lock/integration/concurrent-acquire.test.ts:49-58` per Story 3.10
 * §Open Question 7 (cross-tree imports add coupling; inline is self-
 * contained). Creates `<tmp>/_bmad-output/.stepper/state.yaml.lock/` plus a
 * "live" pid file with the requested mtime.
 */
async function synthesiseHeldLock(
  lockDir: string,
  pidPayload: PidFileShape,
  mtimeMs: number,
): Promise<void> {
  await fs.mkdir(lockDir, { recursive: true });
  const pidPath = path.join(lockDir, "pid");
  await fs.writeFile(pidPath, JSON.stringify(pidPayload, null, 2), "utf8");
  const date = new Date(mtimeMs);
  await fs.utimes(pidPath, date, date);
}

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-non-locking-read-"));
  await fs.mkdir(path.join(tmp, "_bmad-output/.stepper"), { recursive: true });
  // Seed a minimal valid state.yaml. lastSuccessfulStep is populated so
  // --export-state has a non-null currentPhase, --diff-state has both sides
  // populated, etc.
  await Bun.write(
    path.join(tmp, "_bmad-output/.stepper/state.yaml"),
    Bun.YAML.stringify({
      schemaVersion: 1,
      project: { name: "non-locking-read-test", bmadVersion: "6.5.0" },
      lastSuccessfulStep: {
        step: "bmad-create-prd",
        epic: 1,
        story: "1.5",
        completedAt: "2026-04-30T12:00:00Z",
      },
      runHistory: [],
      checkpoints: [],
    }),
  );
  // Set up a fake BMAD plugin under <tmp>/.claude/plugins/ so the
  // dispatch-path BMAD pre-check (`detectBmadVersion`) clears under
  // the spawnRunner `HOME=tmp` env. --dry-run shares the dispatch
  // happy path, so the BMAD check fires for it too.
  const pluginDir = path.join(tmp, ".claude", "plugins", "bmad-method-6.5.0");
  await fs.mkdir(path.join(pluginDir, ".claude-plugin"), { recursive: true });
  await Bun.write(
    path.join(pluginDir, ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: "bmad-method", version: "6.5.0" }),
  );
  // Synthesise a held lock at the canonical path. The pid is process.pid
  // + 100_000 to evade the self-owned reclaim path; mtime is current so the
  // staleness evaluator would mark the holder as "live and heartbeating"
  // (NOT stale).
  const lockDir = path.join(tmp, "_bmad-output/.stepper/state.yaml.lock");
  await synthesiseHeldLock(
    lockDir,
    {
      pid: process.pid + 100_000,
      hostname: "concurrent-active-test-host",
      acquiredAt: new Date().toISOString(),
      heartbeatIntervalMs: 5000,
    },
    Date.now(),
  );
});

afterEach(async () => {
  if (tmp !== "") {
    await fs.rm(tmp, { recursive: true, force: true });
    tmp = "";
  }
});

/**
 * Helper: assert that the synthesised held-lock fixture is still present
 * AFTER the spawn (the read-only flag must not have touched the lock).
 */
async function assertHeldLockStillPresent(): Promise<void> {
  const lockDir = path.join(tmp, "_bmad-output/.stepper/state.yaml.lock");
  const pidFile = path.join(lockDir, "pid");
  await fs.access(lockDir);
  await fs.access(pidFile);
  const raw = await fs.readFile(pidFile, "utf8");
  const parsed = JSON.parse(raw) as PidFileShape;
  // The synthesised pid (process.pid + 100_000) is preserved — the spawn
  // did NOT overwrite it.
  expect(parsed.pid).toBe(process.pid + 100_000);
  expect(parsed.hostname).toBe("concurrent-active-test-host");
}

describe("Story 3.10 AC-line-884 — read-only flags succeed concurrent with held lock", () => {
  // ─── Test A — `--export-state` with held lock ─────────────────────────────
  it("Test A: `--export-state` succeeds (exit 0; parseable JSON; held lock untouched)", async () => {
    const result = await spawnRunner(NEXT_RUN_TS, ["--export-state"], tmp);

    // (a) exit code 0 — NOT 4 (LOCK_CONTENTION).
    expect(result.exitCode).toBe(0);

    // (b) stdout is parseable JSON with the 7 export fields per Story 3.8's
    // StateExportV1Schema (FR54 SPECIAL CASE — raw JSON to stdout).
    const stdoutBody = result.stdout.trim();
    expect(stdoutBody.length).toBeGreaterThan(0);
    const parsed = JSON.parse(stdoutBody) as Record<string, unknown>;
    const safe = StateExportV1Schema.safeParse(parsed);
    expect(safe.success).toBe(true);
    expect(parsed.schemaVersion).toBe(1);

    // (c) NO LOCK_CONTENTION error in stderr.
    expect(result.stderr).not.toContain("LOCK_CONTENTION");

    // (d) the synthesised lock dir is STILL PRESENT after the spawn.
    await assertHeldLockStillPresent();
  });

  // ─── Test B — `--diff-state` with held lock ───────────────────────────────
  it("Test B: `--diff-state` succeeds (exit 0; report shape; held lock untouched)", async () => {
    const result = await spawnRunner(NEXT_RUN_TS, ["--diff-state"], tmp);

    // (a) exit code 0.
    expect(result.exitCode).toBe(0);

    // (b) stdout contains the AR9 single-line `report` JSON wrapper. The
    // diff humanReadable text is in result.action.message; the stdout body
    // is the AR9 JSON wrapper.
    const stdoutBody = result.stdout.trim();
    expect(stdoutBody.length).toBeGreaterThan(0);
    const parsed = JSON.parse(stdoutBody) as Record<string, unknown>;
    expect(parsed.action).toBe("report");
    expect(typeof parsed.message).toBe("string");

    // (c) NO LOCK_CONTENTION error.
    expect(result.stderr).not.toContain("LOCK_CONTENTION");

    // (d) the synthesised lock dir is STILL PRESENT.
    await assertHeldLockStillPresent();
  });

  // ─── Test C — `--explain` with held lock ──────────────────────────────────
  it("Test C: `--explain` succeeds (exit 0; report shape; held lock untouched)", async () => {
    const result = await spawnRunner(NEXT_RUN_TS, ["--explain"], tmp);

    // (a) exit code 0.
    expect(result.exitCode).toBe(0);

    // (b) stdout is the AR9 `report` JSON wrapper carrying the multi-line
    // explain trace per Story 3.6's formatExplainMessage format.
    const stdoutBody = result.stdout.trim();
    expect(stdoutBody.length).toBeGreaterThan(0);
    const parsed = JSON.parse(stdoutBody) as Record<string, unknown>;
    expect(parsed.action).toBe("report");
    expect(typeof parsed.message).toBe("string");

    // (c) NO LOCK_CONTENTION error.
    expect(result.stderr).not.toContain("LOCK_CONTENTION");

    // (d) the synthesised lock dir is STILL PRESENT.
    await assertHeldLockStillPresent();
  });

  // ─── Test D — `--list` with held lock ─────────────────────────────────────
  it("Test D: `--list` succeeds (exit 0; report shape; held lock untouched)", async () => {
    const result = await spawnRunner(NEXT_RUN_TS, ["--list"], tmp);

    // (a) exit code 0.
    expect(result.exitCode).toBe(0);

    // (b) stdout is the AR9 `report` JSON wrapper carrying the candidate
    // enumeration per Story 3.7's 4-component per-line format.
    const stdoutBody = result.stdout.trim();
    expect(stdoutBody.length).toBeGreaterThan(0);
    const parsed = JSON.parse(stdoutBody) as Record<string, unknown>;
    expect(parsed.action).toBe("report");
    expect(typeof parsed.message).toBe("string");

    // (c) NO LOCK_CONTENTION error.
    expect(result.stderr).not.toContain("LOCK_CONTENTION");

    // (d) the synthesised lock dir is STILL PRESENT.
    await assertHeldLockStillPresent();
  });

  // ─── Test E — `--dry-run` with held lock ──────────────────────────────────
  it("Test E: `--dry-run` succeeds (exit 0; report shape; held lock untouched)", async () => {
    const result = await spawnRunner(NEXT_RUN_TS, ["--dry-run"], tmp);

    // (a) exit code 0.
    expect(result.exitCode).toBe(0);

    // (b) stdout is the AR9 `report` JSON wrapper carrying the dispatch-
    // spec preview per Story 3.3's "Dry-run: would dispatch ..." preview
    // format.
    const stdoutBody = result.stdout.trim();
    expect(stdoutBody.length).toBeGreaterThan(0);
    const parsed = JSON.parse(stdoutBody) as Record<string, unknown>;
    expect(parsed.action).toBe("report");
    expect(typeof parsed.message).toBe("string");
    // The dry-run preview message contains the "Dry-run: would dispatch"
    // substring per Story 3.3's format.
    expect(parsed.message as string).toContain("Dry-run: would dispatch");

    // (c) NO LOCK_CONTENTION error.
    expect(result.stderr).not.toContain("LOCK_CONTENTION");

    // (d) the synthesised lock dir is STILL PRESENT.
    await assertHeldLockStillPresent();
  });
});
