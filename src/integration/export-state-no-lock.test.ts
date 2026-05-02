/**
 * src/integration/export-state-no-lock.test.ts — Story 3.8 AC-line-852
 * enforcement test (epic AC line 852: "integration test asserts
 * `--export-state | jq '.currentPhase'` works without the lock").
 *
 * The test:
 *   1. Seeds a minimal valid state.yaml in a tmpdir.
 *   2. Spawns `bun run src/commands/next/run.ts -- --export-state` as a
 *      subprocess (per Story 3.3's spawn pattern).
 *   3. Captures stdout; parses the body as JSON DIRECTLY (functionally
 *      equivalent to `--export-state | jq '.currentPhase'` per AC line
 *      852); asserts `StateExportV1Schema.parse` succeeds; asserts the 7
 *      AC-line-850 fields are present.
 *   4. Asserts exit code 0.
 *   5. FR52 invariant: asserts no lock dir / lock file written.
 *   6. FR54 invariant: asserts the parsed JSON is the export shape DIRECTLY
 *      (no AR9 wrapper); the `import.meta.main` block bypasses
 *      `emitDispatchAction` for `--export-state` per the spec.
 *
 * Forward-deferred to Story 3.10: the concurrent-active-lock test (one
 * process holds the lock and another runs `--export-state` simultaneously).
 * v0.1 Story 3.8 asserts only the structural read-only contract (no
 * src/lock/ import; helper is async + lock-free).
 *
 * Modeled on src/integration/dry-run-no-writes.test.ts (Story 3.3).
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { StateExportV1Schema } from "../schemas/state-export.ts";

let tmp = "";
const REPO_ROOT = process.cwd();
const NEXT_RUN_TS = path.join(REPO_ROOT, "src/commands/next/run.ts");

beforeEach(async () => {
  tmp = await fs.mkdtemp(
    path.join(os.tmpdir(), "stepper-export-state-no-lock-"),
  );
  await fs.mkdir(path.join(tmp, "_bmad-output/.stepper"), { recursive: true });
  // Seed a state.yaml WITH a populated lastSuccessfulStep so the JSON
  // body has non-null fields per AC line 852.
  await Bun.write(
    path.join(tmp, "_bmad-output/.stepper/state.yaml"),
    Bun.YAML.stringify({
      schemaVersion: 1,
      project: { name: "export-state-test-project", bmadVersion: "6.5.0" },
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

describe("Story 3.8 AC-line-852 — `--export-state` emits parseable JSON without the lock", () => {
  it("after `bun run src/commands/next/run.ts -- --export-state`, stdout is the schema-versioned 7-field JSON body", async () => {
    const result = await spawnRunner(NEXT_RUN_TS, ["--export-state"], tmp);

    // Exit code 0 — success per FR53.
    expect(result.exitCode).toBe(0);

    // FR54 SPECIAL CASE: the stdout body is the JSON export, NOT the AR9
    // line. Parse stdout as JSON directly (functionally equivalent to
    // `--export-state | jq '.currentPhase'`).
    const stdoutBody = result.stdout.trim();
    expect(stdoutBody.length).toBeGreaterThan(0);

    let parsed: unknown;
    expect(() => {
      parsed = JSON.parse(stdoutBody);
    }).not.toThrow();

    // FR54 invariant: the parsed JSON is the EXPORT shape, NOT the AR9
    // wrapper. The export shape has `schemaVersion`; the AR9 wrapper has
    // `action`. Both should NOT coexist in the parsed body.
    expect(typeof parsed).toBe("object");
    if (typeof parsed !== "object" || parsed === null) return;
    const obj = parsed as Record<string, unknown>;
    expect(obj.schemaVersion).toBe(1);
    expect("action" in obj).toBe(false);

    // Defence-in-depth: assert the full schema parse succeeds.
    const safe = StateExportV1Schema.safeParse(parsed);
    expect(safe.success).toBe(true);
    if (!safe.success) return;

    // AC line 850 — 7 fields populated (or null).
    expect(safe.data.schemaVersion).toBe(1);
    expect(safe.data.activeEpic).toBe(1);
    expect(safe.data.lastSuccessfulStep?.step).toBe("bmad-create-prd");
    expect(safe.data.bmadVersion).toBe("6.5.0");
    expect(safe.data.stepperVersion).toBe("0.1.0");

    // AC line 852 — `--export-state | jq '.currentPhase'` workflow:
    // currentPhase resolves via the DAG; bmad-create-prd is "planning".
    expect(safe.data.currentPhase).toBe("planning");

    // FR52 invariant: NO lock file or lock dir was created in the tmpdir
    // (the helper never acquires the lock; lock-free contract).
    const lockPath = path.join(tmp, "_bmad-output/.stepper/state.yaml.lock");
    await expect(fs.access(lockPath)).rejects.toThrow();
    const lockDirPath = path.join(tmp, "_bmad-output/.stepper/locks");
    await expect(fs.access(lockDirPath)).rejects.toThrow();
  });

  it("currentPhase on empty state is null (no lastSuccessfulStep → no phase lookup)", async () => {
    // Overwrite the seeded state with an empty one.
    await Bun.write(
      path.join(tmp, "_bmad-output/.stepper/state.yaml"),
      Bun.YAML.stringify({
        schemaVersion: 1,
        project: { name: "export-state-test-project", bmadVersion: "6.5.0" },
        runHistory: [],
        checkpoints: [],
      }),
    );

    const result = await spawnRunner(NEXT_RUN_TS, ["--export-state"], tmp);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout.trim()) as Record<string, unknown>;
    expect(parsed.currentPhase).toBeNull();
    expect(parsed.activeEpic).toBeNull();
    expect(parsed.lastSuccessfulStep).toBeNull();
  });
});
