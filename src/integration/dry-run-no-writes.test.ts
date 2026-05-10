/**
 * src/integration/dry-run-no-writes.test.ts — Story 3.3 AC-line-768
 * enforcement test (epic AC line 768: "integration test verifies no
 * filesystem writes occur during dry-run").
 *
 * The test snapshots the fixture-seeded tmpdir BEFORE the
 * `--dry-run` invocation, runs `bun run src/commands/next/run.ts
 * -- --dry-run` as a subprocess, then re-snapshots and asserts the
 * inventory is byte-identical: zero new files, zero deleted files,
 * zero modified mtimes, zero modified contents (SHA-256 hash).
 *
 * No-write invariants asserted (per Story 3.3 spec §Task 7.4):
 *   - NO `staging/` dir created.
 *   - NO `_bmad-output/.stepper/staging/` dir created.
 *   - NO `state.yaml.tmp` left behind.
 *   - NO new file under `_bmad-output/.stepper/runs/`.
 *   - NO modification of any pre-existing file (mtime + content).
 *
 * Modeled on `src/integration/no-write-outside-scope.test.ts` (Story 2.8
 * NFR-S2 enforcement test): reuses the fixture-copy + `walkFiles` +
 * `spawnRunner` patterns. Single focused assertion per file, per Story
 * 2.8 precedent.
 *
 * Also asserts the AR9 line emitted to stdout parses against
 * `DispatchActionV1Schema` with `action: "report"` (Story 3.3 Task 7.5).
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
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

// ─── Lifecycle hooks ──────────────────────────────────────────────────────

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-dry-run-no-writes-"));
  await copyDirectory(
    path.join(FIXTURE_ROOT, "_bmad"),
    path.join(tmp, "_bmad"),
  );
  await fs.mkdir(path.join(tmp, "_bmad-output"), { recursive: true });
  await fs.mkdir(path.join(tmp, "_bmad-output/.stepper"), { recursive: true });
  // Seed a minimal valid state.yaml — no lastSuccessfulStep so the
  // runner picks the seed entry-point. The dry-run preview will still
  // surface the format with epic 0 / story 0.0 defaults.
  await Bun.write(
    path.join(tmp, "_bmad-output/.stepper/state.yaml"),
    Bun.YAML.stringify({
      schemaVersion: 1,
      project: { name: "dry-run-test-project", bmadVersion: "6.5.0" },
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

interface FileSnapshot {
  readonly path: string;
  readonly sha256: string;
  readonly mtimeMs: number;
  readonly size: number;
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
        // Filter out Bun-runtime cache dirs that may surface from
        // setting HOME=tmp (per the no-write-outside-scope.test.ts
        // precedent — these are infrastructure noise unrelated to the
        // Stepper write surface).
        const rel = path.relative(root, full);
        if (
          rel.startsWith("Library/Caches/bun") ||
          rel.startsWith(".bun") ||
          rel.startsWith(".cache")
        ) {
          continue;
        }
        stack.push(full);
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  }
  return out;
}

/**
 * Snapshot a file's content hash + mtime + size. The snapshot is the
 * defence-in-depth signal — equality across BEFORE/AFTER snapshots
 * proves byte-identical filesystem state.
 */
async function snapshotFile(filePath: string): Promise<FileSnapshot> {
  const [buf, st] = await Promise.all([
    fs.readFile(filePath),
    fs.stat(filePath),
  ]);
  const sha256 = createHash("sha256").update(buf).digest("hex");
  return { path: filePath, sha256, mtimeMs: st.mtimeMs, size: st.size };
}

async function snapshotInventory(root: string): Promise<FileSnapshot[]> {
  const files = await walkFiles(root);
  // Filter out the Bun-runtime cache files that walkFiles misses on
  // file-level (Bun caches under HOME=tmp may include leaf-file matches
  // outside the cache dirs filtered above).
  const filtered = files.filter((f) => {
    const rel = path.relative(root, f);
    return (
      !rel.startsWith("Library/Caches/bun") &&
      !rel.startsWith(".bun") &&
      !rel.startsWith(".cache")
    );
  });
  // Sort for deterministic comparison.
  filtered.sort();
  return Promise.all(filtered.map(snapshotFile));
}

// ─── AC-line-768 enforcement test ─────────────────────────────────────────

describe("Story 3.3 AC-line-768 — no filesystem writes occur during --dry-run", () => {
  it("after `bun run src/commands/next/run.ts -- --dry-run`, the tmpdir is byte-identical", async () => {
    // BEFORE snapshot: capture every file under tmp/ post-fixture-seed.
    const before = await snapshotInventory(tmp);

    // Invocation: --dry-run with explicit --step so the runner can
    // compute a deterministic next step on the fresh-state fixture.
    const result = await spawnRunner(
      NEXT_RUN_TS,
      ["--dry-run", "--step", "bmad-brainstorming"],
      tmp,
    );

    // The dry-run path emits exit code 0 with `action: "report"`.
    expect(result.exitCode).toBe(0);
    const stdoutLines = result.stdout
      .trim()
      .split("\n")
      .filter((l) => l.length > 0);
    expect(stdoutLines.length).toBe(1);
    const action = DispatchActionV1Schema.parse(
      JSON.parse(stdoutLines[0] as string),
    );
    expect(action.action).toBe("report");
    if (action.action !== "report") return;
    expect(action.message.startsWith("Dry-run: would dispatch ")).toBe(true);

    // AFTER snapshot: capture the same inventory.
    const after = await snapshotInventory(tmp);

    // Assertion 1: file count is byte-identical.
    expect(after.length).toBe(before.length);

    // Assertion 2: every file path + content + mtime + size is identical.
    const beforeByPath = new Map(before.map((s) => [s.path, s]));
    for (const a of after) {
      const b = beforeByPath.get(a.path);
      expect(b).toBeDefined();
      if (b === undefined) continue;
      expect(a.sha256).toBe(b.sha256);
      expect(a.mtimeMs).toBe(b.mtimeMs);
      expect(a.size).toBe(b.size);
    }

    // Assertion 3: explicit no-write invariants per Story 3.3 Task 7.4.
    // NO `staging/` dir at the project root.
    await expect(fs.access(path.join(tmp, "staging"))).rejects.toThrow();
    // NO `_bmad-output/.stepper/staging/` dir created.
    await expect(
      fs.access(path.join(tmp, "_bmad-output/.stepper/staging")),
    ).rejects.toThrow();
    // NO `state.yaml.tmp` left behind.
    await expect(
      fs.access(path.join(tmp, "_bmad-output/.stepper/state.yaml.tmp")),
    ).rejects.toThrow();
    // NO new file under `_bmad-output/.stepper/runs/` (the dir may not
    // exist at all on a clean dry-run).
    const runsExists = await fs
      .access(path.join(tmp, "_bmad-output/.stepper/runs"))
      .then(() => true)
      .catch(() => false);
    if (runsExists) {
      const runsEntries = await fs.readdir(
        path.join(tmp, "_bmad-output/.stepper/runs"),
      );
      expect(runsEntries.length).toBe(0);
    } else {
      expect(runsExists).toBe(false);
    }
  });
});
