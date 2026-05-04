/**
 * src/snapshot/detect.test.ts — Integration tests for the branch+SHA detector
 * (AC-1, AC-2 detection-half, AC-3 of Story 1.8).
 *
 * AC-3's "And integration test branch-switch.test.ts covers all three paths"
 * names a test file the comparator (Story 2.4) will own. Story 1.8 colocates
 * the detection-only tests in `detect.test.ts`; the branch-switch comparator
 * tests in `branch-switch.test.ts` are Story 2.4's deliverable. The tests
 * here exercise the AC-3 "three paths" via the detection primitive:
 *   (a) Git work-tree → Snapshot (AC-1 happy path);
 *   (b) Non-Git tmpdir → null + one-time warn (AC-3 fallback);
 *   (c) Differential branch (foundation of AC-2 mismatch detection — the
 *       comparator subtracts saved snapshot from fresh snapshot at the
 *       orchestrator level in Story 2.4).
 *
 * Tests use real `git init` + `git config` + `git commit --allow-empty` in
 * unique tmpdirs per AR35 (every test runs under a fresh tmpdir; cleanup via
 * `fs.rm({ recursive: true, force: true })` in afterEach). No mocking of
 * `Bun.spawn` — the architectural preference is real subprocess behavior +
 * Bun-native test idioms.
 *
 * `git config commit.gpgsign false` is set in the fixture so CI hosts that
 * sign by default still complete `git commit --allow-empty`. Detection
 * itself is unaffected by signing config.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  type DetectSnapshotOptions,
  detectSnapshot,
  NOT_A_GIT_REPO_WARNING,
  type Snapshot,
  type SnapshotLogger,
} from "./detect.ts";

let tmpDir: string;

interface CapturingLogger extends SnapshotLogger {
  readonly warns: string[];
}

function makeCapturingLogger(): CapturingLogger {
  const warns: string[] = [];
  return {
    warns,
    warn(message: string): void {
      warns.push(message);
    },
  };
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-snapshot-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/**
 * Test fixture: initialise a Git repo at `cwd` and create one empty commit.
 * Configures `commit.gpgsign false` so CI hosts that sign by default succeed.
 * Returns the SHA of the initial commit for direct comparison in tests.
 */
async function setupGitRepo(
  cwd: string,
): Promise<{ branch: string; sha: string }> {
  const gitInitProc = Bun.spawn(["git", "init", "--initial-branch=main"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  await gitInitProc.exited;
  expect(gitInitProc.exitCode).toBe(0);

  const configEmailProc = Bun.spawn(
    ["git", "config", "user.email", "test@example.com"],
    { cwd, stdout: "pipe", stderr: "pipe" },
  );
  await configEmailProc.exited;
  expect(configEmailProc.exitCode).toBe(0);

  const configNameProc = Bun.spawn(["git", "config", "user.name", "Test"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  await configNameProc.exited;
  expect(configNameProc.exitCode).toBe(0);

  const configGpgsignProc = Bun.spawn(
    ["git", "config", "commit.gpgsign", "false"],
    { cwd, stdout: "pipe", stderr: "pipe" },
  );
  await configGpgsignProc.exited;
  expect(configGpgsignProc.exitCode).toBe(0);

  const commitProc = Bun.spawn(
    ["git", "commit", "--allow-empty", "-m", "initial"],
    { cwd, stdout: "pipe", stderr: "pipe" },
  );
  await commitProc.exited;
  expect(commitProc.exitCode).toBe(0);

  const shaProc = Bun.spawn(["git", "rev-parse", "HEAD"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  await shaProc.exited;
  expect(shaProc.exitCode).toBe(0);
  const sha = (await new Response(shaProc.stdout).text()).trim();

  return { branch: "main", sha };
}

async function spawnGit(
  cwd: string,
  ...args: readonly string[]
): Promise<string> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  expect(proc.exitCode).toBe(0);
  return (await new Response(proc.stdout).text()).trim();
}

describe("detectSnapshot — Git work-tree happy path (AC-1)", () => {
  it("returns Snapshot with branch + sha + takenAt for a Git work-tree", async () => {
    const fixture = await setupGitRepo(tmpDir);
    const logger = makeCapturingLogger();

    const result = await detectSnapshot({ cwd: tmpDir, logger });

    expect(result).not.toBeNull();
    const snapshot = result as Snapshot;
    expect(snapshot.branch).toBe("main");
    expect(snapshot.sha).toBe(fixture.sha);
    expect(snapshot.sha.length).toBe(40);
    expect(/^[a-f0-9]{40}$/.test(snapshot.sha)).toBe(true);
    expect(new Date(snapshot.takenAt).toISOString()).toBe(snapshot.takenAt);
    expect(logger.warns.length).toBe(0);
  });
});

describe("detectSnapshot — non-Git fallback (AC-3)", () => {
  it("returns null + emits one-time warning for a non-Git tmpdir", async () => {
    const logger = makeCapturingLogger();

    const result = await detectSnapshot({ cwd: tmpDir, logger });

    expect(result).toBeNull();
    expect(logger.warns).toEqual([NOT_A_GIT_REPO_WARNING]);
  });

  it("emits exactly one warning per detectSnapshot call (per-call semantics)", async () => {
    const logger = makeCapturingLogger();

    await detectSnapshot({ cwd: tmpDir, logger });
    await detectSnapshot({ cwd: tmpDir, logger });

    expect(logger.warns.length).toBe(2);
    expect(logger.warns[0]).toBe(NOT_A_GIT_REPO_WARNING);
    expect(logger.warns[1]).toBe(NOT_A_GIT_REPO_WARNING);
  });
});

describe("detectSnapshot — differential branch (foundation of AC-2 mismatch)", () => {
  it("captures different branch values after git checkout -b feature-x + new commit", async () => {
    await setupGitRepo(tmpDir);

    const s1 = await detectSnapshot({ cwd: tmpDir });
    expect(s1).not.toBeNull();
    expect((s1 as Snapshot).branch).toBe("main");

    await spawnGit(tmpDir, "checkout", "-b", "feature-x");
    await spawnGit(tmpDir, "commit", "--allow-empty", "-m", "feature-x commit");

    const s2 = await detectSnapshot({ cwd: tmpDir });
    expect(s2).not.toBeNull();
    expect((s2 as Snapshot).branch).toBe("feature-x");
    expect((s2 as Snapshot).sha).not.toBe((s1 as Snapshot).sha);
  });
});

describe("detectSnapshot — detached-HEAD edge case", () => {
  it("returns 'HEAD' as branch for a detached-HEAD repo", async () => {
    const fixture = await setupGitRepo(tmpDir);

    await spawnGit(tmpDir, "checkout", fixture.sha);

    const result = await detectSnapshot({ cwd: tmpDir });

    expect(result).not.toBeNull();
    expect((result as Snapshot).branch).toBe("HEAD");
    expect((result as Snapshot).sha).toBe(fixture.sha);
  });
});

describe("detectSnapshot — DetectSnapshotOptions injection", () => {
  it("uses opts.now for deterministic takenAt timestamps", async () => {
    await setupGitRepo(tmpDir);
    const fixedDate = new Date("2026-04-30T22:30:00.000Z");
    const opts: DetectSnapshotOptions = { cwd: tmpDir, now: () => fixedDate };

    const result = await detectSnapshot(opts);

    expect(result).not.toBeNull();
    expect((result as Snapshot).takenAt).toBe("2026-04-30T22:30:00.000Z");
  });
});
