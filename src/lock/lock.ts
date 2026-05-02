/**
 * src/lock/lock.ts — mkdir-based exclusive file lock with heartbeat
 * (architecture §D4 lines 371-387; FR15, FR24, FR55; NFR-R1, NFR-R4, NFR-S2,
 * NFR-S5; AR33, AR41, AR42).
 *
 * Foundational module per AR41 (zero upward imports). Allowed sibling imports:
 * `../io/paths.ts` (for `assertWithinScope`) and `../errors.ts` (for
 * `LockContentionError`). Allowed `node:*`: `node:fs/promises`, `node:os`,
 * `node:path`. Bun-native `Bun.write` is used for the inner pid file per
 * AR33 ("Bun-native APIs preferred").
 *
 * Public API:
 *   - acquire(opts?) → Promise<LockHandle>
 *       Performs `mkdir(state.yaml.lock)` (atomic on every filesystem
 *       including NFS). On EEXIST evaluates staleness (mtime + kill(pid, 0))
 *       and either reclaims the lock or throws `LockContentionError`. On
 *       success, writes the inner pid file and starts a 5s heartbeat that
 *       updates the pid file's mtime via `utimes`. Returns a `LockHandle`
 *       whose `.release()` method stops the heartbeat and `rm -rf`s the
 *       lock dir.
 *   - forceUnlock(opts?) → Promise<void>
 *       Unconditional `rm -rf state.yaml.lock` (force: true → no throw on
 *       ENOENT). The user-facing prompt ("Are you sure no other Stepper is
 *       running?") is the CLI layer's responsibility (Story 1.12) — this
 *       module exposes the unconditional removal primitive only.
 *
 * Story 3.10 (FR52 / epic AC line 878-880) — `skipAcquire` carve-out:
 *   When `opts.skipAcquire === true`, `acquire(opts)` returns a sentinel
 *   no-op `LockHandle` IMMEDIATELY — ZERO filesystem mutation, ZERO
 *   heartbeat timer, ZERO scope check, ZERO log emission. The handle's
 *   `release()` is also a no-op (idempotent). Use case: read-only flag
 *   cluster (`--export-state`, `--list`, `--explain`, `--dry-run`,
 *   `--diff-state`). NOTE: `--watch` is structurally lock-free without
 *   the opt-in (Story 3.9 §Forward Dependencies). v0.1 callers do NOT
 *   exercise this flag — the read-only flags structurally never reach
 *   `acquire(...)` in `run.ts` per AR8 + architecture §line 1672. The
 *   flag is forward-proofing for Story 6.x lock-acquiring read flows +
 *   AC verbatim compliance per epics.md line 878.
 *
 * The `opts` parameter is purely for testing — production callers pass none.
 * It allows tests to point at an isolated `lockDir`, lower the heartbeat /
 * stale thresholds for fast simulation, or stub the liveness check.
 *
 * Persistence boundary (AR42): the canonical lock dir is exactly
 * `_bmad-output/.stepper/state.yaml.lock/`; both `acquire()` and
 * `forceUnlock()` route the path through `assertWithinScope()` for
 * defence-in-depth.
 *
 * Error semantics (AR33): `LockContentionError` is thrown on the
 * second-process-during-contention path. The pid-file shape is documented
 * inline as `PidFileContents`; Story 1.5 will replace the inline narrowing
 * with a Zod schema in `src/schemas/pid.ts`.
 *
 * SIGINT integration: out-of-scope for this story. Higher-level callers
 * (Epic 4 Story 4.9) wire `process.on('SIGINT', () => handle.release())`
 * around the dispatch loop. The release primitive is provided here.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { LockContentionError } from "../errors.ts";
import { assertWithinScope } from "../io/paths.ts";

export const LOCK_DIR_REL = "_bmad-output/.stepper/state.yaml.lock";
export const PID_FILE_NAME = "pid";
export const HEARTBEAT_INTERVAL_MS = 5_000;
export const STALE_THRESHOLD_MS = 30_000;
export const STALE_THRESHOLD_FALLBACK_MS = 60_000;

/**
 * Optional configuration (test-only). Production code passes `undefined`.
 * Tests inject a lock dir + tighter timing thresholds so the AC-2 stale-
 * recovery scenario can be simulated without 30+ seconds of wall-clock wait.
 */
export interface LockOptions {
  /** Absolute path of the lock dir. Defaults to <cwd>/_bmad-output/.stepper/state.yaml.lock. */
  readonly lockDir?: string;
  /** Heartbeat interval in milliseconds. Defaults to 5000. */
  readonly heartbeatIntervalMs?: number;
  /** Stale threshold in milliseconds. Defaults to 30000. */
  readonly staleThresholdMs?: number;
  /** Fallback threshold for sub-second-mtime filesystems. Defaults to 60000. */
  readonly staleThresholdFallbackMs?: number;
  /**
   * Liveness probe override (test-only). Production uses `process.kill(pid, 0)`.
   * The probe MUST return `true` if the PID is alive, `false` if dead (ESRCH),
   * and `true` defensively for any other error (e.g., EPERM — process exists,
   * we just can't signal it).
   */
  readonly isPidAlive?: (pid: number) => boolean;
  /**
   * Logger override (test-only). Defaults to `info`/`warn` from `src/io/log.ts`.
   * Tests pass a no-op or capturing logger.
   */
  readonly logger?: LockLogger;
  /**
   * Skip lock acquisition (Story 3.10 / FR52 / epic AC line 878). When
   * `true`, `acquire(opts)` returns a sentinel no-op `LockHandle`
   * IMMEDIATELY — ZERO `mkdir`, ZERO staleness evaluation, ZERO pid file,
   * ZERO heartbeat. The handle's `release()` is a no-op (idempotent;
   * resolves `undefined`).
   *
   * Use case: the FIVE read-only flags (`--export-state`, `--list`,
   * `--explain`, `--dry-run`, `--diff-state`) — they need a structurally
   * clean escape hatch from the lock-acquiring code path. NOTE: `--watch`
   * is OUT of this enumeration (per Story 3.9 §Forward Dependencies +
   * epics.md line 873) — it is structurally lock-free without the opt-in.
   *
   * v0.1 callers do NOT exercise this flag in production code. The
   * read-only flags structurally never reach `acquire(...)` in
   * `src/commands/next/run.ts` per AR8 + architecture §line 1672 (the
   * runner module is read-only / lock-free). The flag is forward-proofing
   * for Story 6.x lock-acquiring read flows + AC verbatim compliance per
   * epics.md line 878.
   *
   * Defense-in-depth: should a future story accidentally route a read-
   * only flag through a lock-acquiring path, this flag provides the
   * right-answer-off-the-shelf without forcing a refactor.
   */
  readonly skipAcquire?: boolean;
}

export interface LockLogger {
  info(message: string): void;
  warn(message: string): void;
}

export interface LockHandle {
  readonly lockDir: string;
  readonly pidFile: string;
  readonly acquiredAt: string;
  release(): Promise<void>;
}

/**
 * Inline shape for the pid file. Story 1.5 (Schemas + Migrations Skeleton)
 * will replace this with a Zod schema at `src/schemas/pid.ts`. Field naming
 * deviates from architecture §D4 line 378 (which calls the field
 * `heartbeatInterval`, in seconds) — we use `heartbeatIntervalMs`
 * (milliseconds, explicit unit) and let Story 1.5's Zod schema reconcile
 * both representations.
 */
interface PidFileContents {
  pid: number;
  hostname: string;
  acquiredAt: string;
  heartbeatIntervalMs: number;
}

interface ResolvedConfig {
  readonly lockDir: string;
  readonly pidFile: string;
  readonly heartbeatIntervalMs: number;
  readonly staleThresholdMs: number;
  readonly staleThresholdFallbackMs: number;
  readonly isPidAlive: (pid: number) => boolean;
  readonly logger: LockLogger;
}

interface StalenessResult {
  readonly stale: boolean;
  readonly reason: string;
  readonly pidContents?: PidFileContents;
}

const defaultLogger: LockLogger = {
  info(message: string): void {
    process.stderr.write(`${message}\n`);
  },
  warn(message: string): void {
    process.stderr.write(`${message}\n`);
  },
};

function defaultIsPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    // ESRCH = "definitely dead". EPERM = "exists but inaccessible" → treat
    // as alive for safety (don't reclaim someone else's lock). Any other
    // error (rare) — also treat as alive.
    return code !== "ESRCH";
  }
}

function resolveConfig(opts?: LockOptions): ResolvedConfig {
  const lockDir = opts?.lockDir ?? path.resolve(process.cwd(), LOCK_DIR_REL);
  return {
    lockDir,
    pidFile: path.join(lockDir, PID_FILE_NAME),
    heartbeatIntervalMs: opts?.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS,
    staleThresholdMs: opts?.staleThresholdMs ?? STALE_THRESHOLD_MS,
    staleThresholdFallbackMs:
      opts?.staleThresholdFallbackMs ?? STALE_THRESHOLD_FALLBACK_MS,
    isPidAlive: opts?.isPidAlive ?? defaultIsPidAlive,
    logger: opts?.logger ?? defaultLogger,
  };
}

function isPidFileShape(value: unknown): value is PidFileContents {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v.pid === "number" &&
    typeof v.hostname === "string" &&
    typeof v.acquiredAt === "string" &&
    typeof v.heartbeatIntervalMs === "number"
  );
}

/**
 * Inspects an existing (EEXIST) lock dir and decides whether it is stale.
 * Returns `{ stale: true, reason }` when the holder is dead or the heartbeat
 * is too old; `{ stale: false }` when the holder is alive and recently
 * heartbeating. Indeterminate states (missing/malformed pid file) are treated
 * as stale per architecture §D4's graceful-degradation stance.
 */
async function evaluateStaleness(
  config: ResolvedConfig,
): Promise<StalenessResult> {
  let raw: string;
  try {
    raw = await fs.readFile(config.pidFile, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { stale: true, reason: "pid file missing" };
    }
    return { stale: true, reason: `pid file unreadable: ${code ?? "unknown"}` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { stale: true, reason: "pid file malformed JSON" };
  }

  if (!isPidFileShape(parsed)) {
    return { stale: true, reason: "pid file schema invalid" };
  }
  const pidContents: PidFileContents = parsed;

  // Self-owned lock at acquire time → bizarre, treat as stale.
  if (
    pidContents.pid === process.pid &&
    pidContents.hostname === os.hostname()
  ) {
    config.logger.warn(
      "lock: self-owned lock dir found at acquire time (likely orphaned by prior crash); reclaiming",
    );
    return {
      stale: true,
      reason: "self-owned lock dir found at acquire time",
      pidContents,
    };
  }

  let stat: import("node:fs").Stats;
  try {
    stat = await fs.stat(config.pidFile);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return {
      stale: true,
      reason: `pid file stat failed: ${code ?? "unknown"}`,
      pidContents,
    };
  }

  const mtimeAge = Date.now() - stat.mtimeMs;

  // Sub-second mtime fallback heuristic: if mtimeMs is a whole-second value,
  // the filesystem likely rounds mtime to whole seconds. Use the wider
  // 60-second threshold to avoid false positives on the heartbeat-loss check.
  const subSecondCapable = stat.mtimeMs % 1000 !== 0;
  let thresholdMs = config.staleThresholdMs;
  if (!subSecondCapable) {
    config.logger.warn(
      "lock: filesystem lacks sub-second mtime; using fallback stale threshold",
    );
    thresholdMs = config.staleThresholdFallbackMs;
  }

  const pidAlive = config.isPidAlive(pidContents.pid);
  const stale = !pidAlive || mtimeAge > thresholdMs;
  const reason = !pidAlive
    ? `holder pid ${pidContents.pid} is not alive`
    : mtimeAge > thresholdMs
      ? `heartbeat mtime ${mtimeAge}ms older than threshold ${thresholdMs}ms`
      : `holder pid ${pidContents.pid} alive and heartbeating (mtime ${mtimeAge}ms ago)`;

  return { stale, reason, pidContents };
}

/**
 * Acquire the project's exclusive file lock.
 *
 * Algorithm (architecture §D4):
 *   1. mkdir(lockDir) — succeeds → we hold the lock; jump to step 4.
 *      Fails with EEXIST → another holder; go to step 2.
 *   2. evaluateStaleness(lockDir).
 *      - Stale → rm -rf lockDir, retry mkdir ONCE; if second mkdir also
 *        fails with EEXIST, throw `LockContentionError` (a third process
 *        raced us; fail fast per "no backoff loop" — see story 1.4 D4 note).
 *      - Live → throw `LockContentionError` immediately.
 *   3. Write pid file; start 5s heartbeat via `utimes` on the pid file.
 *   4. Return a `LockHandle` whose `.release()` stops the heartbeat and
 *      `rm -rf`s the lock dir.
 *
 * **Story 3.10 (epic AC line 878-880; FR52)**: when
 * `opts?.skipAcquire === true`, the function returns a sentinel no-op
 * `LockHandle` IMMEDIATELY — ZERO filesystem mutation, ZERO heartbeat
 * timer, ZERO scope check, ZERO log emission. The handle's `release()`
 * is also a no-op (idempotent). The sentinel `lockDir` and `pidFile`
 * fields hold the literal string `"<no-op:skipAcquire>"` (machine-
 * recognisable marker; never refers to a real path). Use case: the
 * FIVE read-only flags (`--export-state`, `--list`, `--explain`,
 * `--dry-run`, `--diff-state`). v0.1 callers do NOT exercise this path
 * — the read-only flags structurally never reach `acquire(...)` in
 * `run.ts` per AR8 + architecture §line 1672. The flag is forward-
 * proofing for Story 6.x lock-acquiring read flows + AC verbatim
 * compliance per epics.md line 878.
 *
 * @throws {LockContentionError} when a live holder owns the lock.
 */
export async function acquire(opts?: LockOptions): Promise<LockHandle> {
  // Story 3.10 (epic AC line 878-880; FR52): when skipAcquire is true,
  // return a sentinel no-op handle IMMEDIATELY. ZERO filesystem mutation;
  // ZERO heartbeat timer; ZERO scope-check; ZERO log emission. The
  // handle's release() is also a no-op (idempotent). Use case: FR52
  // read-only flag cluster (--export-state, --list, --explain,
  // --dry-run, --diff-state). NOTE: --watch is OUT of the enumeration
  // (Story 3.9 §Forward Dependencies + epics.md line 873).
  //
  // The v0.1 callers do NOT reach this path (run.ts is structurally
  // lock-free per AR8 + architecture §line 1672); this is forward-
  // proofing + AC verbatim compliance.
  //
  // Placed BEFORE resolveConfig + assertWithinScope so the no-op path
  // skips the unnecessary path.resolve + scope-check work; the no-op
  // path doesn't touch any path so the scope guard is irrelevant.
  if (opts?.skipAcquire === true) {
    const sentinelAt = new Date().toISOString();
    let releasedNoOp = false;
    const releaseNoOp = async (): Promise<void> => {
      if (releasedNoOp) {
        return;
      }
      releasedNoOp = true;
    };
    return {
      lockDir: "<no-op:skipAcquire>",
      pidFile: "<no-op:skipAcquire>",
      acquiredAt: sentinelAt,
      release: releaseNoOp,
    };
  }

  const config = resolveConfig(opts);

  // AR42 defensive: if the caller did not override `lockDir`, sanity-check
  // the canonical path is inside our scope. With an injected `lockDir`
  // (test-only), the caller has already chosen the path; skip the scope
  // check to allow tmpdir-based fixtures (which `assertWithinScope` already
  // permits via `os.tmpdir()`).
  if (opts?.lockDir === undefined) {
    assertWithinScope(LOCK_DIR_REL);
  }

  // Try mkdir; on EEXIST, evaluate staleness and reclaim or throw.
  let acquiredOnFirstTry = false;
  try {
    await fs.mkdir(config.lockDir, { recursive: false });
    acquiredOnFirstTry = true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "EEXIST") {
      throw err;
    }
  }

  if (!acquiredOnFirstTry) {
    const result = await evaluateStaleness(config);
    if (!result.stale) {
      throw new LockContentionError(
        "LOCK_CONTENTION: another Stepper process holds the lock",
        result.pidContents !== undefined
          ? JSON.stringify(result.pidContents)
          : `evaluation: ${result.reason}`,
      );
    }
    // Stale → reclaim and retry exactly once.
    config.logger.info(
      `lock: reclaiming stale lock at ${config.lockDir} (${result.reason})`,
    );
    await fs.rm(config.lockDir, { recursive: true, force: true });
    try {
      await fs.mkdir(config.lockDir, { recursive: false });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EEXIST") {
        // A third process raced us between rm and mkdir; fail fast (no
        // backoff loop in v0.1).
        throw new LockContentionError(
          "LOCK_CONTENTION: another Stepper process raced during stale-lock reclaim",
          "second mkdir attempt also returned EEXIST",
        );
      }
      throw err;
    }
  }

  // Write the inner pid file (metadata, not canonical state — bypasses
  // atomicWrite per Task 2.4 of story 1.4).
  const acquiredAt = new Date().toISOString();
  const payload: PidFileContents = {
    pid: process.pid,
    hostname: os.hostname(),
    acquiredAt,
    heartbeatIntervalMs: config.heartbeatIntervalMs,
  };
  await Bun.write(config.pidFile, JSON.stringify(payload, null, 2));

  // Start the heartbeat timer. Each tick best-effort `utimes` on the pid
  // file; transient failure logs a warning but does not crash the loop.
  const heartbeatTimer = setInterval(() => {
    const now = new Date();
    fs.utimes(config.pidFile, now, now).catch((err: unknown) => {
      const code = (err as NodeJS.ErrnoException).code;
      config.logger.warn(
        `lock: heartbeat utimes failed (code: ${code ?? "unknown"}); continuing`,
      );
    });
  }, config.heartbeatIntervalMs);

  // Don't keep the event loop alive solely for the heartbeat — the higher-
  // level dispatch loop (Epic 4) holds it via its own active work.
  if (typeof heartbeatTimer.unref === "function") {
    heartbeatTimer.unref();
  }

  let released = false;
  const release = async (): Promise<void> => {
    if (released) {
      return;
    }
    released = true;
    try {
      clearInterval(heartbeatTimer);
    } finally {
      await fs.rm(config.lockDir, { recursive: true, force: true });
    }
    config.logger.info(`lock: released at ${config.lockDir}`);
  };

  config.logger.info(
    `lock: acquired at ${config.lockDir} (pid ${process.pid})`,
  );

  return {
    lockDir: config.lockDir,
    pidFile: config.pidFile,
    acquiredAt,
    release,
  };
}

/**
 * Unconditional removal of the lock dir (`--force-unlock` primitive). The
 * `force: true` flag swallows ENOENT, so this is idempotent — safe to call
 * when no lock exists. The user-facing `"Are you sure no other Stepper is
 * running?"` prompt lives in the CLI layer (Story 1.12); this module
 * exposes the primitive only.
 */
export async function forceUnlock(opts?: LockOptions): Promise<void> {
  const config = resolveConfig(opts);
  if (opts?.lockDir === undefined) {
    assertWithinScope(LOCK_DIR_REL);
  }
  await fs.rm(config.lockDir, { recursive: true, force: true });
  config.logger.info(`lock: force-unlocked at ${config.lockDir}`);
}
