/**
 * src/runs/watch.ts — Live tail of the most recent transcript log
 * (Story 3.9 epic AC lines 860-868; FR8, FR42, FR43, FR44, FR52, FR53,
 *  FR54, NFR-P1, NFR-P4, NFR-S2, NFR-S5, NFR-R1, NFR-R5, NFR-I2,
 *  AR2, AR8, AR9, AR11, AR21, AR22, AR25, AR26, AR33, AR41, AR42).
 *
 * **MID-TIER module per AR41** (architecture lines 1278-1282). Allowed
 * imports:
 *   - foundational: `../io/paths.ts` for `STEPPER_INTERNAL_ROOT`.
 *   - Node stdlib: `node:fs/promises` (stat, readdir), `node:path` (join).
 *   - Bun runtime: `Bun.file()` for ReadableStream + slice.
 *
 * **FORBIDDEN** imports per AR8 lock-free + AR41 mid-tier rule:
 *   - `../lock/` — the watcher is structurally lock-free.
 *   - `../state/` — the watcher does NOT touch state.yaml.
 *   - `../dag/`, `../personas/`, `../dispatch/`, `../verifiers/`,
 *     `../failure-ux/` — no upward / sibling-higher imports.
 *   - `../commands/` — top-tier; the runner imports the watcher, not
 *     vice versa.
 *
 * **AR9 SPECIAL CASE per FR42 + FR54** (architecture §line 524 + §line
 * 862; SECOND documented exception after Story 3.8's `--export-state`):
 * the `--watch` raw transcript stream goes to stdout DIRECTLY (NOT
 * wrapped in the AR9 single-JSON-line discriminated-union). Streaming-
 * mode is structurally incompatible with single-line AR9; pre-buffering
 * until SIGINT defeats the streaming intent. Every OTHER read-only flag
 * preserves AR9 strictly. The `runNext` runner returns a structural
 * `report` action for testability; the `import.meta.main` block detects
 * `args.watch === true` and SKIPS `emitDispatchAction`.
 *
 * Algorithm (architecture §F line 547 + §line 550 + §line 1216 +
 * §line 1372; AC lines 862-868):
 *   1. Resolve `runsRoot` (default `${STEPPER_INTERNAL_ROOT}/runs`).
 *   2. `findMostRecentRunLog(runsRoot)` — list `*.log` (skip `.bak`,
 *      `.json`, directories); sort by mtime desc, filename desc tie-
 *      breaker; pick `[0]`.
 *   3. If null → emit verbatim AC-line-867 hint
 *      `No run logs yet. Start a step with /bmad-next.\n`; return
 *      `{ filePath: null, status: "no-runs" }`.
 *   4. Otherwise → `tailLineByLine(filePath, ...)`:
 *      a. Read initial bytes [0, size) via `Bun.file(p).slice(...)
 *         .stream()` piped through `TextDecoderStream`; split on `\n`;
 *         emit each complete line via `process.stdout.write`.
 *      b. Buffer trailing partial line in `partialLine: string`.
 *      c. Poll every `pollMs` (default 250); on size growth, read
 *         [oldOffset, newSize), append to partial, split + emit.
 *      d. On `signal.aborted` → break loop + cleanup.
 *      e. On ENOENT (file deleted/rotated mid-watch) → stderr warn +
 *         exit gracefully.
 *   5. Return `{ filePath, status: "watched" }`.
 *
 * **SIGINT handling**: registers `process.on("SIGINT", () =>
 * controller.abort())` BEFORE entering the poll loop. The bridged
 * AbortController flips the cancellation flag; the loop checks
 * `signal.aborted` per iteration; cleanup is sub-millisecond (no
 * in-flight writes). The `finally` block removes the listener so
 * downstream callers (tests with their own AbortController) don't see
 * leaked listeners. Caller-supplied `signal` is composed via internal
 * AbortController whose abort fires on EITHER SIGINT or external
 * abort.
 *
 * **Polling vs `node:fs/promises#watch`**: v0.1 conservative chooses
 * polling per cross-platform determinism (macOS uses FSEvents, Linux
 * uses inotify; Bun's coverage of edge cases like file-rotation is
 * incomplete). 250ms latency floor is acceptable for v0.1; Story 6.x
 * may add the FS-watcher path with platform-specific fallbacks.
 *
 * **No external `tail` dependency** per AC line 868: the
 * implementation uses ZERO `child_process.spawn("tail")`-style calls;
 * ZERO `node:tty` or external-binary primitives. Bun.file().slice()
 * .stream() + TextDecoderStream + line-buffer is the entire stack.
 *
 * Architecture cross-references:
 *   - architecture.md §F line 547 (`runs/<ts>-<step>.log` markdown).
 *   - architecture.md §F line 550 (`--watch` tails the most recent log).
 *   - architecture.md §line 1216 (`watch.ts # --watch tail`).
 *   - architecture.md §line 1372 (FR42 → `src/transcript/watch.ts`).
 *   - architecture.md §line 524 + §line 862 (FR54 stdout discipline).
 *   - architecture.md §line 1660 (AR9 protocol concretization).
 *   - architecture.md §line 1672 (run.ts is read-only / lock-free).
 *   - architecture.md §line 1278-1282 (AR41 mid-tier import boundary).
 *   - prd.md FR42 line 727 (`--watch` live transcript).
 *   - prd.md FR43-FR44 lines 728-729 (transcript paths).
 *   - prd.md FR53 line 744 (exit codes 0-5).
 *   - prd.md FR54 line 745 (stdout/stderr discipline).
 *   - prd.md NFR-P4 (transcript streaming non-blocking).
 *   - prd.md NFR-R5 (SIGINT graceful within 30s).
 *   - epics.md §Story 3.9 lines 860-868 (AC verbatim source).
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { STEPPER_INTERNAL_ROOT } from "../io/paths.ts";

/**
 * Default poll interval in milliseconds (Story 3.9 v0.1 conservative —
 * Story 6.1 config-loader may surface as `bmad-stepper.config.yaml
 * watch.pollMs`).
 */
const DEFAULT_POLL_MS = 250;

/**
 * Verbatim AC-line-867 fresh-project hint string. Byte-identical: a
 * single trailing `\n` per terminal-output convention. ANY deviation
 * fails the integration test at
 * `src/integration/watch-fresh-project.test.ts`.
 */
const FRESH_PROJECT_HINT = "No run logs yet. Start a step with /bmad-next.\n";

/**
 * Test-injection escape hatches for `watchMostRecentRunLog`. Mirrors
 * Story 2.5 `WriteStepTranscriptInput` precedent.
 */
export interface WatchOptions {
  /**
   * Override the canonical runs root for tests (defaults to
   * `${STEPPER_INTERNAL_ROOT}/runs` per Story 2.5 `RUNS_ROOT`).
   */
  readonly runsRoot?: string;
  /**
   * Override the polling interval in milliseconds (defaults to 250ms).
   * Tests may set this very low (e.g., 25ms) for deterministic timing.
   */
  readonly pollMs?: number;
  /**
   * Optional caller-supplied `AbortSignal` for testability — when the
   * signal aborts, the poll loop exits cleanly. The internal SIGINT
   * handler also drives the same abort path; this is functionally
   * equivalent to a real `kill -INT <pid>` for tests.
   */
  readonly signal?: AbortSignal;
}

/**
 * Result of `watchMostRecentRunLog()`. Tests inspect this without
 * mutating stdout / process state.
 */
export interface WatchResult {
  /**
   * The absolute path to the transcript file being tailed, or `null`
   * when no run logs exist (fresh-project case).
   */
  readonly filePath: string | null;
  /**
   * `"watched"` when the watcher entered + exited a tail loop;
   * `"no-runs"` when the fresh-project hint was emitted.
   */
  readonly status: "watched" | "no-runs";
}

/**
 * Internal candidate shape used by `findMostRecentRunLog`.
 */
interface LogCandidate {
  readonly fullPath: string;
  readonly name: string;
  readonly mtimeMs: number;
}

/**
 * Scan `runsRoot` for `*.log` files; sort by mtime desc, filename desc;
 * return the top candidate's absolute path, or null when the directory
 * is missing / empty.
 *
 * Filters:
 *   - Only `entry.isFile()` — excludes directories (e.g., future
 *     `runs/archive/` from Story 6.8).
 *   - Only `name.endsWith(".log")` — excludes `*.json` siblings (AR26
 *     JSON run-log; not stream-friendly), `*.log.bak` rotations from
 *     Story 1.3's atomicWrite, `*.log.tmp` mid-write tmp files from
 *     atomicWrite's tmp+rename cycle.
 *
 * Sort:
 *   - Primary: `mtimeMs` descending (most-recently-touched first).
 *   - Tiebreaker: filename descending (lexically-greatest filename
 *     wins when mtimes are equal — matches Story 2.5's `<ts>-<step>`
 *     convention where the lexical sort agrees with the timestamp
 *     sort).
 */
async function findMostRecentRunLog(runsRoot: string): Promise<string | null> {
  // Step 1: directory existence check (ENOENT means fresh-project).
  try {
    const stat = await fs.stat(runsRoot);
    if (!stat.isDirectory()) {
      return null;
    }
  } catch {
    return null;
  }

  // Step 2: read entries.
  const entries = await fs.readdir(runsRoot, { withFileTypes: true });

  // Step 3: filter + collect candidates with mtime.
  const candidates: LogCandidate[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".log")) continue;
    // The `endsWith(".log")` filter excludes `.log.bak`, `.log.tmp`,
    // `.json` siblings naturally (those don't end with `.log`).
    const fullPath = path.join(runsRoot, entry.name);
    try {
      const stat = await fs.stat(fullPath);
      candidates.push({
        fullPath,
        name: entry.name,
        mtimeMs: stat.mtimeMs,
      });
    } catch {
      // Race condition: file deleted between readdir and stat. Skip.
    }
  }

  if (candidates.length === 0) return null;

  // Step 4: sort by mtime desc, filename desc.
  candidates.sort((a, b) => {
    if (a.mtimeMs !== b.mtimeMs) return b.mtimeMs - a.mtimeMs;
    return b.name.localeCompare(a.name);
  });

  return candidates[0]?.fullPath ?? null;
}

/**
 * Bun-stream-based line-by-line tail loop.
 *
 * Reads the initial file content (offset 0 → current size), then polls
 * every `pollMs` for size growth and reads the appended bytes. Buffers
 * partial lines (no terminating `\n`) until a newline arrives.
 *
 * Cleanup: the `signal.aborted` check runs at the top of each poll
 * iteration; the loop exits cleanly on abort. ENOENT (file deleted /
 * rotated mid-watch) emits a stderr warn + breaks the loop gracefully
 * per Story 6.8 forward-compat (file-rotation auto-archival).
 */
async function tailLineByLine(
  filePath: string,
  opts: { pollMs: number; signal: AbortSignal },
): Promise<void> {
  let offset = 0;
  let partialLine = "";

  // Initial read: emit any existing content from offset 0 to current size.
  try {
    const stat = await fs.stat(filePath);
    const initialSize = stat.size;
    if (initialSize > 0) {
      const result = await readSliceAsLines(
        filePath,
        0,
        initialSize,
        partialLine,
      );
      partialLine = result.partial;
      for (const line of result.lines) {
        process.stdout.write(`${line}\n`);
      }
    }
    offset = initialSize;
  } catch (err) {
    // ENOENT on initial read: file vanished between findMostRecentRunLog
    // and tailLineByLine. Emit a stderr warn and exit cleanly.
    process.stderr.write(
      `watch: transcript ${filePath} disappeared before tail (${err instanceof Error ? err.message : String(err)})\n`,
    );
    return;
  }

  // Poll loop.
  while (!opts.signal.aborted) {
    await sleep(opts.pollMs);
    if (opts.signal.aborted) break;

    let newSize: number;
    try {
      const stat = await fs.stat(filePath);
      newSize = stat.size;
    } catch (err) {
      // ENOENT mid-watch: file deleted/rotated. Story 6.8 forward-compat.
      process.stderr.write(
        `watch: transcript ${filePath} rotated/deleted; exiting (${err instanceof Error ? err.message : String(err)})\n`,
      );
      break;
    }

    if (newSize > offset) {
      try {
        const result = await readSliceAsLines(
          filePath,
          offset,
          newSize,
          partialLine,
        );
        partialLine = result.partial;
        for (const line of result.lines) {
          process.stdout.write(`${line}\n`);
        }
        offset = newSize;
      } catch (err) {
        process.stderr.write(
          `watch: read failed at offset ${offset} (${err instanceof Error ? err.message : String(err)})\n`,
        );
        break;
      }
    } else if (newSize < offset) {
      // File was truncated mid-watch (unusual; could happen if a writer
      // rewrote rather than appended). Reset offset to the new size.
      offset = newSize;
    }
  }
}

/**
 * Read [start, end) bytes from `filePath` via `Bun.file().slice()
 * .stream()`, decode UTF-8 via `TextDecoderStream`, append to the
 * caller's `partial` buffer, and split on `\n`. Returns the complete
 * lines + the new trailing partial.
 *
 * v0.1 conservative: LF-only line splitting (Story 2.5's writer emits
 * LF per `write-step.ts:147`); no CRLF normalisation; UTF-8 only
 * (markdown transcripts are structurally UTF-8 per AR25).
 */
async function readSliceAsLines(
  filePath: string,
  start: number,
  end: number,
  partial: string,
): Promise<{ lines: string[]; partial: string }> {
  const stream = Bun.file(filePath).slice(start, end).stream();
  const decoder = new TextDecoderStream();
  const decoded = stream.pipeThrough(decoder);

  let buffer = partial;
  for await (const chunk of decoded as AsyncIterable<string>) {
    buffer += chunk;
  }

  const lines: string[] = [];
  let nextNewline = buffer.indexOf("\n");
  while (nextNewline !== -1) {
    lines.push(buffer.slice(0, nextNewline));
    buffer = buffer.slice(nextNewline + 1);
    nextNewline = buffer.indexOf("\n");
  }
  return { lines, partial: buffer };
}

/**
 * Promise-based sleep helper (used by the poll loop). The poll
 * interval is hard-coded for v0.1; Story 6.1 may surface
 * `bmad-stepper.config.yaml watch.pollMs` as a config knob.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Tail the most recent transcript log under `runsRoot` until SIGINT or
 * caller-supplied `signal` aborts.
 *
 * **Behaviour**:
 *   - Fresh project (no `runsRoot`, empty dir, no `*.log` files) →
 *     emits the AC-line-867 verbatim hint to stdout, returns
 *     `{ filePath: null, status: "no-runs" }`. Exit code is implicitly
 *     0 (the runner returns a `report` action with exitCode: 0).
 *   - Populated → opens the most recent `*.log` (mtime desc, filename
 *     desc tiebreaker), emits existing content, polls for appends,
 *     emits each new line via `process.stdout.write`. SIGINT or
 *     caller-aborted signal exits the loop sub-millisecond. Returns
 *     `{ filePath, status: "watched" }`.
 *
 * **Lock-free invariant**: this helper does NOT acquire the lock,
 * does NOT call `loadState`, does NOT call `loadStateUnlocked`, does
 * NOT touch `state.yaml`. ZERO `src/lock/` import. The watcher is a
 * pure CONSUMER of Story 2.5's transcript files.
 *
 * **AR9 SPECIAL CASE**: the watcher emits raw text lines via
 * `process.stdout.write` (NOT the AR9 single-JSON-line wrapper). The
 * `runNext` runner detects `args.watch === true` in its
 * `import.meta.main` block and SKIPS `emitDispatchAction`. Every
 * OTHER flag preserves AR9; this is the SECOND documented exception
 * (after Story 3.8's `--export-state`).
 *
 * **AR33**: throw not Result; async/await; ZERO `console.*` calls
 * (uses `process.stdout.write` + `process.stderr.write` directly per
 * architecture §line 862).
 */
export async function watchMostRecentRunLog(
  opts?: WatchOptions,
): Promise<WatchResult> {
  const runsRoot = opts?.runsRoot ?? `${STEPPER_INTERNAL_ROOT}/runs`;
  const pollMs = opts?.pollMs ?? DEFAULT_POLL_MS;

  const filePath = await findMostRecentRunLog(runsRoot);

  if (filePath === null) {
    process.stdout.write(FRESH_PROJECT_HINT);
    return { filePath: null, status: "no-runs" };
  }

  // Bridge SIGINT → AbortController. Compose with caller's signal so
  // EITHER source can abort. When the caller passes their own signal
  // (tests), SIGINT is still wired but the test usually drives via the
  // caller's controller for deterministic timing.
  const internalController = new AbortController();
  const onSigint = (): void => {
    internalController.abort();
  };
  process.on("SIGINT", onSigint);

  // Forward caller's abort into the internal controller so the loop
  // checks a single signal.
  let onCallerAbort: (() => void) | null = null;
  if (opts?.signal !== undefined) {
    if (opts.signal.aborted) {
      internalController.abort();
    } else {
      onCallerAbort = (): void => {
        internalController.abort();
      };
      opts.signal.addEventListener("abort", onCallerAbort, { once: true });
    }
  }

  try {
    await tailLineByLine(filePath, {
      pollMs,
      signal: internalController.signal,
    });
  } finally {
    process.off("SIGINT", onSigint);
    if (onCallerAbort !== null && opts?.signal !== undefined) {
      opts.signal.removeEventListener("abort", onCallerAbort);
    }
  }

  return { filePath, status: "watched" };
}
