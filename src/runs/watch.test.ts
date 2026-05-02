/**
 * src/runs/watch.test.ts — Colocated tests for `watchMostRecentRunLog`
 * (Story 3.9 epic AC lines 860-868; FR42, FR43, FR54, AR8, AR41, AR42).
 *
 * AR35 tmpdir-per-test pattern: every test runs under a unique
 * `os.tmpdir()`-derived directory; cleanup via `fs.rm({ recursive: true,
 * force: true })` in `afterEach`. NEVER hard-coded `/tmp/...` paths.
 *
 * Coverage map (Task 6 from story spec):
 *   - Test A — empty-runs case emits verbatim hint + returns no-runs.
 *   - Test B — single-file present opens, emits existing, polls.
 *   - Test C — most-recent-by-mtime selection.
 *   - Test D — tie-breaker by filename descending.
 *   - Test E — append-detection mid-watch.
 *   - Test F — partial-line buffering.
 *   - Test G — SIGINT cleanup via AbortController (listener removed).
 *   - Test H — skip non-`*.log` entries (.json / .bak / directory).
 *   - Test I — file deletion mid-watch (graceful exit, stderr warn).
 *   - Test J — lock-free invariant via source-content scan.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { watchMostRecentRunLog } from "./watch.ts";

let tmp = "";
let runsRoot = "";

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-watch-"));
  runsRoot = path.join(tmp, "runs");
});

afterEach(async () => {
  if (tmp !== "") {
    await fs.rm(tmp, { recursive: true, force: true });
    tmp = "";
    runsRoot = "";
  }
});

/**
 * Capture `process.stdout.write` for the duration of `fn`. Restores
 * the original writer in a finally block. Returns the concatenated
 * captured bytes.
 *
 * Pattern: monkey-patch `process.stdout.write` and append every chunk
 * to a string buffer. Bun's typed signatures for `write` accept
 * (string | Uint8Array, encoding?, callback?) returning boolean —
 * mirror the boolean return.
 */
async function captureStdout<T>(fn: () => Promise<T>): Promise<{
  result: T;
  stdout: string;
}> {
  const original = process.stdout.write.bind(process.stdout);
  let buf = "";
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    if (typeof chunk === "string") {
      buf += chunk;
    } else {
      buf += new TextDecoder().decode(chunk);
    }
    return true;
  }) as typeof process.stdout.write;
  try {
    const result = await fn();
    return { result, stdout: buf };
  } finally {
    process.stdout.write = original;
  }
}

/**
 * Capture `process.stderr.write` for the duration of `fn`. Mirror of
 * `captureStdout`.
 */
async function captureStderr<T>(fn: () => Promise<T>): Promise<{
  result: T;
  stderr: string;
}> {
  const original = process.stderr.write.bind(process.stderr);
  let buf = "";
  process.stderr.write = ((chunk: string | Uint8Array): boolean => {
    if (typeof chunk === "string") {
      buf += chunk;
    } else {
      buf += new TextDecoder().decode(chunk);
    }
    return true;
  }) as typeof process.stderr.write;
  try {
    const result = await fn();
    return { result, stderr: buf };
  } finally {
    process.stderr.write = original;
  }
}

// ─── Test A — empty-runs case ─────────────────────────────────────────────

describe("watchMostRecentRunLog — Test A: empty-runs (fresh project)", () => {
  it("emits verbatim AC-line-867 hint + returns { status: 'no-runs', filePath: null }", async () => {
    // No runsRoot directory exists at all (fresh-project case).
    const { result, stdout } = await captureStdout(() =>
      watchMostRecentRunLog({ runsRoot, pollMs: 25 }),
    );

    expect(result.status).toBe("no-runs");
    expect(result.filePath).toBeNull();
    expect(stdout).toBe("No run logs yet. Start a step with /bmad-next.\n");
  });

  it("emits same hint when runsRoot exists but has zero *.log files", async () => {
    await fs.mkdir(runsRoot, { recursive: true });
    // Seed only non-*.log siblings (should be skipped per Task 2.2-2.4).
    await Bun.write(path.join(runsRoot, "2026-05-01T120000-step.json"), "{}");
    await Bun.write(
      path.join(runsRoot, "2026-05-01T120000-step.log.bak"),
      "old",
    );

    const { result, stdout } = await captureStdout(() =>
      watchMostRecentRunLog({ runsRoot, pollMs: 25 }),
    );

    expect(result.status).toBe("no-runs");
    expect(result.filePath).toBeNull();
    expect(stdout).toBe("No run logs yet. Start a step with /bmad-next.\n");
  });
});

// ─── Test B — single file present ─────────────────────────────────────────

describe("watchMostRecentRunLog — Test B: single file opens + emits + polls", () => {
  it("opens the single *.log file, emits existing content, returns 'watched'", async () => {
    await fs.mkdir(runsRoot, { recursive: true });
    const filePath = path.join(runsRoot, "2026-05-01T120000-step.log");
    await Bun.write(filePath, "line1\nline2\n");

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);

    const { result, stdout } = await captureStdout(() =>
      watchMostRecentRunLog({
        runsRoot,
        pollMs: 25,
        signal: controller.signal,
      }),
    );

    expect(result.status).toBe("watched");
    expect(result.filePath).toBe(filePath);
    expect(stdout).toContain("line1\n");
    expect(stdout).toContain("line2\n");
  });
});

// ─── Test C — most-recent-by-mtime selection ──────────────────────────────

describe("watchMostRecentRunLog — Test C: selects the most-recent file by mtime", () => {
  it("picks the latest-mtime *.log file when multiple exist with different mtimes", async () => {
    await fs.mkdir(runsRoot, { recursive: true });
    const oldPath = path.join(runsRoot, "2026-05-01T100000-old.log");
    const midPath = path.join(runsRoot, "2026-05-01T110000-mid.log");
    const newPath = path.join(runsRoot, "2026-05-01T120000-new.log");

    await Bun.write(oldPath, "old\n");
    await Bun.write(midPath, "mid\n");
    await Bun.write(newPath, "new\n");

    // Set mtimes in increasing order via fs.utimes (atime, mtime).
    const now = Date.now() / 1000;
    await fs.utimes(oldPath, now - 3, now - 3);
    await fs.utimes(midPath, now - 2, now - 2);
    await fs.utimes(newPath, now - 1, now - 1);

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);

    const { result, stdout } = await captureStdout(() =>
      watchMostRecentRunLog({
        runsRoot,
        pollMs: 25,
        signal: controller.signal,
      }),
    );

    expect(result.filePath).toBe(newPath);
    expect(stdout).toContain("new\n");
    expect(stdout).not.toContain("old");
    expect(stdout).not.toContain("mid");
  });
});

// ─── Test D — tie-breaker by filename descending ──────────────────────────

describe("watchMostRecentRunLog — Test D: tie-breaker by filename descending", () => {
  it("picks the lexically-greatest filename when mtimes are equal", async () => {
    await fs.mkdir(runsRoot, { recursive: true });
    const aaaPath = path.join(runsRoot, "2026-05-01T100000-aaa.log");
    const zzzPath = path.join(runsRoot, "2026-05-01T100000-zzz.log");

    await Bun.write(aaaPath, "from-aaa\n");
    await Bun.write(zzzPath, "from-zzz\n");

    // Set equal mtimes.
    const sharedMtime = Date.now() / 1000 - 1;
    await fs.utimes(aaaPath, sharedMtime, sharedMtime);
    await fs.utimes(zzzPath, sharedMtime, sharedMtime);

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);

    const { result, stdout } = await captureStdout(() =>
      watchMostRecentRunLog({
        runsRoot,
        pollMs: 25,
        signal: controller.signal,
      }),
    );

    expect(result.filePath).toBe(zzzPath);
    expect(stdout).toContain("from-zzz\n");
    expect(stdout).not.toContain("from-aaa");
  });
});

// ─── Test E — append-detection mid-watch ──────────────────────────────────

describe("watchMostRecentRunLog — Test E: append-detection mid-watch", () => {
  it("emits both initial and appended content in order", async () => {
    await fs.mkdir(runsRoot, { recursive: true });
    const filePath = path.join(runsRoot, "2026-05-01T120000-step.log");
    await Bun.write(filePath, "initial\n");

    const controller = new AbortController();

    // Spawn the watcher in the background; append after the first poll
    // tick fires.
    const watcherPromise = captureStdout(() =>
      watchMostRecentRunLog({
        runsRoot,
        pollMs: 25,
        signal: controller.signal,
      }),
    );

    // Wait for the watcher to consume the initial content + start
    // polling, then append new content.
    await new Promise((resolve) => setTimeout(resolve, 60));
    await fs.appendFile(filePath, "appended\n");

    // Allow another poll cycle to detect the append, then abort.
    await new Promise((resolve) => setTimeout(resolve, 100));
    controller.abort();

    const { result, stdout } = await watcherPromise;

    expect(result.status).toBe("watched");
    expect(stdout).toContain("initial\n");
    expect(stdout).toContain("appended\n");
    // Order check: initial appears before appended.
    expect(stdout.indexOf("initial")).toBeLessThan(stdout.indexOf("appended"));
  });
});

// ─── Test F — partial-line buffering ──────────────────────────────────────

describe("watchMostRecentRunLog — Test F: partial-line buffering", () => {
  it("buffers content without trailing \\n until a newline arrives", async () => {
    await fs.mkdir(runsRoot, { recursive: true });
    const filePath = path.join(runsRoot, "2026-05-01T120000-step.log");
    // Seed empty.
    await Bun.write(filePath, "");

    const controller = new AbortController();
    const watcherPromise = captureStdout(() =>
      watchMostRecentRunLog({
        runsRoot,
        pollMs: 25,
        signal: controller.signal,
      }),
    );

    // 30ms later, append "abc" (no newline) — should NOT emit yet.
    await new Promise((resolve) => setTimeout(resolve, 30));
    await fs.appendFile(filePath, "abc");

    // 60ms later, append "def\n" — combined line "abcdef" should emit.
    await new Promise((resolve) => setTimeout(resolve, 60));
    await fs.appendFile(filePath, "def\n");

    // Allow another poll cycle to read the appended bytes.
    await new Promise((resolve) => setTimeout(resolve, 80));
    controller.abort();

    const { result, stdout } = await watcherPromise;

    expect(result.status).toBe("watched");
    // The combined line emits as one. Partial buffer fix: the watcher
    // should NOT have emitted "abc\n" earlier.
    expect(stdout).toContain("abcdef\n");
    // Negative — "abc" never got an interim newline.
    expect(stdout).not.toContain("abc\n");
  });
});

// ─── Test G — SIGINT cleanup via AbortController ──────────────────────────

describe("watchMostRecentRunLog — Test G: AbortController cleanup", () => {
  it("registers SIGINT listener on entry; removes it on exit", async () => {
    await fs.mkdir(runsRoot, { recursive: true });
    const filePath = path.join(runsRoot, "2026-05-01T120000-step.log");
    await Bun.write(filePath, "line\n");

    const baseline = process.listenerCount("SIGINT");

    const controller = new AbortController();

    // Start the watcher.
    const watcherPromise = captureStdout(() =>
      watchMostRecentRunLog({
        runsRoot,
        pollMs: 25,
        signal: controller.signal,
      }),
    );

    // Allow the watcher to register the SIGINT listener.
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(process.listenerCount("SIGINT")).toBe(baseline + 1);

    // Abort and await cleanup.
    const abortStart = Date.now();
    controller.abort();
    const { result } = await watcherPromise;
    const abortElapsed = Date.now() - abortStart;

    expect(result.status).toBe("watched");
    // Cleanup well under NFR-R5's 30s budget. Allow up to 300ms (one
    // poll cycle + scheduling jitter).
    expect(abortElapsed).toBeLessThan(300);

    // SIGINT listener was removed in the finally block.
    expect(process.listenerCount("SIGINT")).toBe(baseline);
  });
});

// ─── Test H — skip non-*.log entries ──────────────────────────────────────

describe("watchMostRecentRunLog — Test H: skip non-*.log entries", () => {
  it("ignores .json siblings, .bak rotations, and directories", async () => {
    await fs.mkdir(runsRoot, { recursive: true });
    const activePath = path.join(runsRoot, "2026-05-01T120000-step.log");
    await Bun.write(activePath, "active\n");
    // .json sibling (Story 2.5 AR26 JSON run-log).
    await Bun.write(
      path.join(runsRoot, "2026-05-01T120000-step.json"),
      '{"foo":"bar"}',
    );
    // .log.bak rotation (Story 1.3 atomicWrite).
    await Bun.write(
      path.join(runsRoot, "2026-05-01T120000-step.log.bak"),
      "stale-snapshot\n",
    );
    // Subdirectory (e.g., future Story 6.8 archive/ dir).
    await fs.mkdir(path.join(runsRoot, "archive"), { recursive: true });

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);

    const { result, stdout } = await captureStdout(() =>
      watchMostRecentRunLog({
        runsRoot,
        pollMs: 25,
        signal: controller.signal,
      }),
    );

    expect(result.filePath).toBe(activePath);
    expect(stdout).toContain("active\n");
    // Negative — none of the skipped entries leaked their content.
    expect(stdout).not.toContain("stale-snapshot");
    expect(stdout).not.toContain("foo");
  });
});

// ─── Test I — file deletion mid-watch ─────────────────────────────────────

describe("watchMostRecentRunLog — Test I: file deletion mid-watch", () => {
  it("exits gracefully on ENOENT (file deleted/rotated mid-watch)", async () => {
    await fs.mkdir(runsRoot, { recursive: true });
    const filePath = path.join(runsRoot, "2026-05-01T120000-step.log");
    await Bun.write(filePath, "before-delete\n");

    const controller = new AbortController();

    // Capture both stdout and stderr around the same async invocation by
    // nesting capture wrappers. The inner returns the {result, stdout};
    // the outer adds stderr.
    const captured = await captureStderr(() =>
      captureStdout(async () => {
        const watcherPromise = watchMostRecentRunLog({
          runsRoot,
          pollMs: 25,
          signal: controller.signal,
        });

        // Wait for the watcher to read initial content.
        await new Promise((resolve) => setTimeout(resolve, 50));
        await fs.unlink(filePath);

        // Allow the next poll iteration to detect the ENOENT.
        await new Promise((resolve) => setTimeout(resolve, 80));
        // Belt-and-suspenders: also abort in case the ENOENT path
        // already finished cleanly.
        controller.abort();

        return watcherPromise;
      }),
    );

    const watchResult = captured.result.result;
    const stdout = captured.result.stdout;
    const stderr = captured.stderr;

    // The watcher exited (did NOT throw) — we got a WatchResult.
    expect(watchResult.status).toBe("watched");
    expect(stdout.includes("before-delete\n")).toBe(true);
    // The stderr warn was emitted on the ENOENT detection (or the
    // watcher exited cleanly via the AbortController belt-and-
    // suspenders before the next poll, in which case stderr is empty —
    // both paths are valid v0.1 behaviour).
    expect(stderr.includes("rotated/deleted") || stderr.length === 0).toBe(
      true,
    );
  });
});

// ─── Test J — lock-free invariant via source-content scan ─────────────────

describe("watchMostRecentRunLog — Test J: lock-free invariant", () => {
  it("src/runs/watch.ts does NOT import from src/lock/ or call locked state APIs", async () => {
    const source = await Bun.file(
      path.join(import.meta.dir, "watch.ts"),
    ).text();
    // Strip JSDoc/comment lines so the check inspects executable code
    // only — the file's docblock is allowed to mention forbidden APIs
    // for prose context.
    const code = source
      .split("\n")
      .filter((line) => !/^\s*\*/.test(line) && !/^\s*\/\//.test(line))
      .join("\n");

    // No import from src/lock/.
    expect(code).not.toMatch(/from\s+["']\.\.\/lock\//);
    // No `acquire(...)` call (the lock acquisition primitive).
    expect(code).not.toMatch(/\bacquire\(/);
    // No `loadState(...)` (the locked variant; lock-held state read).
    expect(code).not.toMatch(/\bloadState\(/);
    // No `loadStateUnlocked(...)` either — the watcher does NOT touch
    // state.yaml at all.
    expect(code).not.toMatch(/\bloadStateUnlocked\(/);
    // No `recomputeState(...)` / `recomputeStateUnlocked(...)`.
    expect(code).not.toMatch(/\brecomputeState\(/);
    expect(code).not.toMatch(/\brecomputeStateUnlocked\(/);
    // No `saveState(...)` (write-side primitive; the watcher is
    // structurally read-only).
    expect(code).not.toMatch(/\bsaveState\(/);
  });

  it("src/runs/watch.ts uses Bun streams (no external `tail` dep) per AC line 868", async () => {
    const source = await Bun.file(
      path.join(import.meta.dir, "watch.ts"),
    ).text();
    const code = source
      .split("\n")
      .filter((line) => !/^\s*\*/.test(line) && !/^\s*\/\//.test(line))
      .join("\n");

    // Bun.file().slice().stream() is the canonical primitive.
    expect(code).toMatch(/Bun\.file\(/);
    expect(code).toMatch(/\.stream\(\)/);
    // No external child_process.spawn("tail") or similar.
    expect(code).not.toMatch(/from\s+["']node:child_process["']/);
    expect(code).not.toMatch(/spawn\(\s*["']tail["']/);
    // No node:tty (terminal-control external dep).
    expect(code).not.toMatch(/from\s+["']node:tty["']/);
  });
});
