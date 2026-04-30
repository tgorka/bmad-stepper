/**
 * src/lock/integration/sub-second-mtime.test.ts — AC-4 integration test for
 * the sub-second-mtime filesystem fallback (architecture §D4 line 387).
 *
 * Older filesystems (FAT32, some NFS configs) round mtime to whole seconds.
 * The lock module detects this via the `stat.mtimeMs % 1000 === 0` heuristic
 * and falls back from the 30-second default stale threshold to 60 seconds
 * (avoiding false-positive reclaims caused by mtime-rounding error).
 *
 * Strategy: synthesise a held lock with a whole-second-rounded mtime; verify
 * that:
 *   1. With ageMs between defaultStale (30s default → 100ms in test) and
 *      fallbackStale (60s default → 300ms in test), the lock is NOT
 *      reclaimed (fallback threshold applies).
 *   2. With ageMs > fallbackStale, the lock IS reclaimed.
 *   3. A warning is emitted noting the fallback was triggered.
 *
 * Tight thresholds (stale=100ms, fallback=300ms) keep the test fast.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { LockContentionError } from "../../errors.ts";
import { acquire, type LockLogger, PID_FILE_NAME } from "../lock.ts";

let tmpDir: string;
let lockDir: string;

interface CapturingLogger extends LockLogger {
  readonly infos: string[];
  readonly warns: string[];
}

function makeCapturingLogger(): CapturingLogger {
  const infos: string[] = [];
  const warns: string[] = [];
  return {
    infos,
    warns,
    info(message: string): void {
      infos.push(message);
    },
    warn(message: string): void {
      warns.push(message);
    },
  };
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-sub-second-"));
  lockDir = path.join(tmpDir, "state.yaml.lock");
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

interface PidFileShape {
  pid: number;
  hostname: string;
  acquiredAt: string;
  heartbeatIntervalMs: number;
}

async function synthesiseWholeSecondMtimeLock(
  apparentAgeMs: number,
): Promise<PidFileShape> {
  await fs.mkdir(lockDir, { recursive: true });
  // Round to whole second to simulate FAT32-style filesystem behaviour.
  // (We can't actually mount a FAT32 filesystem in CI; we synthesise the
  // observable signal — `stat.mtimeMs` divisible by 1000 — directly.)
  const wholeSecondMtime =
    Math.floor((Date.now() - apparentAgeMs) / 1000) * 1000;
  const payload: PidFileShape = {
    pid: process.pid + 333_333,
    hostname: "fat32-style-host",
    acquiredAt: new Date(wholeSecondMtime).toISOString(),
    heartbeatIntervalMs: 5000,
  };
  const pidPath = path.join(lockDir, PID_FILE_NAME);
  await fs.writeFile(pidPath, JSON.stringify(payload, null, 2), "utf8");
  const date = new Date(wholeSecondMtime);
  await fs.utimes(pidPath, date, date);
  return payload;
}

describe("sub-second-mtime fallback — AC-4", () => {
  it("does NOT reclaim when age is between default and fallback thresholds", async () => {
    // Synthesise mtime at a known whole-second value such that the apparent
    // age is solidly between the default (100ms) and the fallback (5000ms).
    // Floor-to-second arithmetic means the apparent age is the wall-clock
    // delta from the floored second mark, so we use a generous fallback
    // window to avoid timing flakes.
    await synthesiseWholeSecondMtimeLock(200);

    const logger = makeCapturingLogger();
    let caught: unknown;
    try {
      await acquire({
        lockDir,
        heartbeatIntervalMs: 50,
        staleThresholdMs: 100,
        staleThresholdFallbackMs: 5000,
        isPidAlive: () => true,
        logger,
      });
    } catch (err) {
      caught = err;
    }
    // The fallback threshold (5000ms) saved us; live holder retains the lock.
    expect(caught).toBeInstanceOf(LockContentionError);
  });

  it("emits a warning when sub-second mtime is detected", async () => {
    await synthesiseWholeSecondMtimeLock(50); // Recent enough; not stale either way.

    const logger = makeCapturingLogger();
    try {
      await acquire({
        lockDir,
        heartbeatIntervalMs: 50,
        staleThresholdMs: 100,
        staleThresholdFallbackMs: 600,
        isPidAlive: () => true,
        logger,
      });
    } catch {
      // expected — lock is held; we just want the warning.
    }
    const warning = logger.warns.find(
      (w) => w.includes("sub-second") || w.includes("fallback stale threshold"),
    );
    expect(warning).toBeDefined();
  });

  it("DOES reclaim when age exceeds the fallback threshold", async () => {
    const oldPayload = await synthesiseWholeSecondMtimeLock(2000);

    const logger = makeCapturingLogger();
    const handle = await acquire({
      lockDir,
      heartbeatIntervalMs: 50,
      staleThresholdMs: 100,
      staleThresholdFallbackMs: 600,
      isPidAlive: () => true,
      logger,
    });
    try {
      const raw = await fs.readFile(handle.pidFile, "utf8");
      const parsed = JSON.parse(raw) as PidFileShape;
      expect(parsed.pid).toBe(process.pid);
      expect(parsed.pid).not.toBe(oldPayload.pid);
    } finally {
      await handle.release();
    }
  });

  it("uses default 30s threshold when mtime has sub-millisecond resolution", async () => {
    // Synthesise a held lock with NON-rounded mtime (mtimeMs % 1000 !== 0)
    // and verify the default 100ms threshold applies (NOT the 600ms fallback).
    await fs.mkdir(lockDir, { recursive: true });
    const mtimeMs = Date.now() - 200; // 200ms ago, with millisecond resolution
    const payload: PidFileShape = {
      pid: process.pid + 444_444,
      hostname: "modern-fs-host",
      acquiredAt: new Date(mtimeMs).toISOString(),
      heartbeatIntervalMs: 50,
    };
    const pidPath = path.join(lockDir, PID_FILE_NAME);
    await fs.writeFile(pidPath, JSON.stringify(payload, null, 2), "utf8");
    // Force a non-rounded mtime by using +1ms; most filesystems preserve
    // sub-millisecond values.
    const date = new Date(mtimeMs + 1);
    await fs.utimes(pidPath, date, date);

    const logger = makeCapturingLogger();
    const handle = await acquire({
      lockDir,
      heartbeatIntervalMs: 50,
      staleThresholdMs: 100,
      staleThresholdFallbackMs: 600,
      isPidAlive: () => true,
      logger,
    });
    try {
      // 200ms > 100ms default → reclaimed. (Without the fallback warning.)
      const raw = await fs.readFile(handle.pidFile, "utf8");
      const parsed = JSON.parse(raw) as PidFileShape;
      expect(parsed.pid).toBe(process.pid);
      const fallbackWarning = logger.warns.find(
        (w) => w.includes("sub-second") || w.includes("fallback stale"),
      );
      expect(fallbackWarning).toBeUndefined();
    } finally {
      await handle.release();
    }
  });
});
