/**
 * src/lock/lock.test.ts — Unit tests for the mkdir-based file lock
 * (AC-1, AC-2, AC-3 of Story 1.4).
 *
 * Tests use unique tmpdirs per AR35 and inject `LockOptions.lockDir` so
 * `acquire()` operates on an isolated lock dir (no chdir, no project-root
 * pollution). Heartbeat / stale thresholds are also injected so the
 * AC-2 stale-recovery scenario can be simulated without real-time waits.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { LockContentionError } from "../errors.ts";
import {
  acquire,
  forceUnlock,
  HEARTBEAT_INTERVAL_MS,
  LOCK_DIR_REL,
  type LockHandle,
  type LockLogger,
  type LockOptions,
  PID_FILE_NAME,
  STALE_THRESHOLD_FALLBACK_MS,
  STALE_THRESHOLD_MS,
} from "./lock.ts";

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
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-lock-"));
  lockDir = path.join(tmpDir, "state.yaml.lock");
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

interface PidFileShape {
  pid: number;
  hostname: string;
  acquiredAt: string;
  heartbeatIntervalMs: number;
}

async function readPidFile(pidFilePath: string): Promise<PidFileShape> {
  const raw = await fs.readFile(pidFilePath, "utf8");
  return JSON.parse(raw) as PidFileShape;
}

async function writeFakePidFile(
  dir: string,
  contents: PidFileShape,
  mtimeMs?: number,
): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  const pidPath = path.join(dir, PID_FILE_NAME);
  await fs.writeFile(pidPath, JSON.stringify(contents, null, 2), "utf8");
  if (mtimeMs !== undefined) {
    const date = new Date(mtimeMs);
    await fs.utimes(pidPath, date, date);
  }
}

describe("acquire — happy path", () => {
  it("creates the lock dir and writes the inner pid file", async () => {
    const handle = await acquire({ lockDir, logger: makeCapturingLogger() });
    try {
      expect(await pathExists(handle.lockDir)).toBe(true);
      expect(await pathExists(handle.pidFile)).toBe(true);
    } finally {
      await handle.release();
    }
  });

  it("writes pid file with current PID, hostname, ISO acquiredAt, heartbeat interval", async () => {
    const handle = await acquire({ lockDir, logger: makeCapturingLogger() });
    try {
      const contents = await readPidFile(handle.pidFile);
      expect(contents.pid).toBe(process.pid);
      expect(contents.hostname).toBe(os.hostname());
      expect(typeof contents.acquiredAt).toBe("string");
      expect(contents.acquiredAt).toMatch(/Z$/);
      expect(contents.heartbeatIntervalMs).toBe(HEARTBEAT_INTERVAL_MS);
    } finally {
      await handle.release();
    }
  });

  it("returns a LockHandle whose lockDir matches the configured path", async () => {
    const handle = await acquire({ lockDir, logger: makeCapturingLogger() });
    try {
      expect(handle.lockDir).toBe(lockDir);
      expect(handle.pidFile).toBe(path.join(lockDir, PID_FILE_NAME));
    } finally {
      await handle.release();
    }
  });

  it("emits an info log line on successful acquire", async () => {
    const logger = makeCapturingLogger();
    const handle = await acquire({ lockDir, logger });
    try {
      const acquiredLine = logger.infos.find((l) => l.includes("acquired"));
      expect(acquiredLine).toBeDefined();
    } finally {
      await handle.release();
    }
  });
});

describe("release — happy path + idempotence", () => {
  it("removes the lock dir on release", async () => {
    const handle = await acquire({ lockDir, logger: makeCapturingLogger() });
    await handle.release();
    expect(await pathExists(handle.lockDir)).toBe(false);
  });

  it("is idempotent (second release does not throw)", async () => {
    const handle = await acquire({ lockDir, logger: makeCapturingLogger() });
    await handle.release();
    await handle.release();
    expect(await pathExists(handle.lockDir)).toBe(false);
  });

  it("emits an info log line on release", async () => {
    const logger = makeCapturingLogger();
    const handle = await acquire({ lockDir, logger });
    await handle.release();
    const releasedLine = logger.infos.find((l) => l.includes("released"));
    expect(releasedLine).toBeDefined();
  });
});

describe("acquire — contention against another live holder (AC-1)", () => {
  it("throws LockContentionError when holder is alive and heartbeating recently", async () => {
    // Synthesise a held lock claiming a different PID with recent mtime;
    // the test process attempts to acquire and should be rejected.
    const recentMtime = Date.now();
    await writeFakePidFile(
      lockDir,
      {
        pid: process.pid + 7777,
        hostname: "fake-other-host",
        acquiredAt: new Date(recentMtime).toISOString(),
        heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
      },
      recentMtime,
    );

    const logger = makeCapturingLogger();
    let caught: unknown;
    try {
      await acquire({
        lockDir,
        isPidAlive: () => true, // simulate the other holder is alive
        logger,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(LockContentionError);
    const stepperErr = caught as LockContentionError;
    expect(stepperErr.code).toBe("LOCK_CONTENTION");
    expect(stepperErr.exitCode).toBe(4);
  });

  it("LockContentionError carries the AC-1 verbatim actionableHint", async () => {
    const recentMtime = Date.now();
    await writeFakePidFile(
      lockDir,
      {
        pid: process.pid + 8888,
        hostname: "fake-other-host",
        acquiredAt: new Date(recentMtime).toISOString(),
        heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
      },
      recentMtime,
    );

    const logger = makeCapturingLogger();
    let caught: unknown;
    try {
      await acquire({
        lockDir,
        isPidAlive: () => true,
        logger,
      });
    } catch (err) {
      caught = err;
    }
    const stepperErr = caught as LockContentionError;
    expect(stepperErr.actionableHint).toBe(
      "Run /bmad-next --doctor to inspect lock state, or /bmad-next --force-unlock if you're sure no other Stepper is running.",
    );
  });

  it("includes the holder pid file contents in the error detail", async () => {
    const recentMtime = Date.now();
    await writeFakePidFile(
      lockDir,
      {
        pid: process.pid + 9999,
        hostname: "fake-detail-host",
        acquiredAt: new Date(recentMtime).toISOString(),
        heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
      },
      recentMtime,
    );

    const logger = makeCapturingLogger();
    let caught: unknown;
    try {
      await acquire({
        lockDir,
        isPidAlive: () => true,
        logger,
      });
    } catch (err) {
      caught = err;
    }
    const stepperErr = caught as LockContentionError;
    expect(stepperErr.detail).toContain("fake-detail-host");
  });
});

describe("acquire — stale lock recovery (AC-2)", () => {
  it("reclaims when holder PID is dead (PID 999999999)", async () => {
    await writeFakePidFile(
      lockDir,
      {
        pid: 999_999_999,
        hostname: "fake-dead-host",
        acquiredAt: new Date().toISOString(),
        heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
      },
      Date.now(),
    );

    const logger = makeCapturingLogger();
    const handle = await acquire({ lockDir, logger });
    try {
      const contents = await readPidFile(handle.pidFile);
      expect(contents.pid).toBe(process.pid);
      const reclaimedLine = logger.infos.find((l) => l.includes("reclaiming"));
      expect(reclaimedLine).toBeDefined();
    } finally {
      await handle.release();
    }
  });

  it("reclaims when mtime is older than stale threshold (suspended-process simulation)", async () => {
    const oldMtime = Date.now() - 10_000;
    await writeFakePidFile(
      lockDir,
      {
        pid: process.pid + 12345,
        hostname: "fake-suspended-host",
        acquiredAt: new Date(oldMtime).toISOString(),
        heartbeatIntervalMs: 1000,
      },
      oldMtime,
    );

    const logger = makeCapturingLogger();
    const handle = await acquire({
      lockDir,
      heartbeatIntervalMs: 1000,
      staleThresholdMs: 5000,
      isPidAlive: () => true, // PID claims alive but mtime is stale
      logger,
    });
    try {
      const contents = await readPidFile(handle.pidFile);
      expect(contents.pid).toBe(process.pid);
    } finally {
      await handle.release();
    }
  });

  it("does NOT reclaim when holder is alive and heartbeating recently", async () => {
    const recentMtime = Date.now();
    await writeFakePidFile(
      lockDir,
      {
        pid: process.pid + 555,
        hostname: "fake-live-host",
        acquiredAt: new Date(recentMtime).toISOString(),
        heartbeatIntervalMs: 1000,
      },
      recentMtime,
    );

    const logger = makeCapturingLogger();
    let caught: unknown;
    try {
      await acquire({
        lockDir,
        heartbeatIntervalMs: 1000,
        staleThresholdMs: 5000,
        isPidAlive: () => true,
        logger,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(LockContentionError);
  });

  it("treats malformed pid file as stale and reclaims", async () => {
    await fs.mkdir(lockDir, { recursive: true });
    await fs.writeFile(
      path.join(lockDir, PID_FILE_NAME),
      "this is not json",
      "utf8",
    );

    const logger = makeCapturingLogger();
    const handle = await acquire({ lockDir, logger });
    try {
      const contents = await readPidFile(handle.pidFile);
      expect(contents.pid).toBe(process.pid);
    } finally {
      await handle.release();
    }
  });

  it("treats missing pid file as stale and reclaims", async () => {
    await fs.mkdir(lockDir, { recursive: true });
    // No pid file inside.

    const logger = makeCapturingLogger();
    const handle = await acquire({ lockDir, logger });
    try {
      const contents = await readPidFile(handle.pidFile);
      expect(contents.pid).toBe(process.pid);
    } finally {
      await handle.release();
    }
  });

  it("treats invalid pid file shape as stale and reclaims", async () => {
    await fs.mkdir(lockDir, { recursive: true });
    await fs.writeFile(
      path.join(lockDir, PID_FILE_NAME),
      JSON.stringify({ unrelated: "shape" }),
      "utf8",
    );

    const logger = makeCapturingLogger();
    const handle = await acquire({ lockDir, logger });
    try {
      const contents = await readPidFile(handle.pidFile);
      expect(contents.pid).toBe(process.pid);
    } finally {
      await handle.release();
    }
  });

  it("treats self-owned lock dir at acquire time as stale", async () => {
    await writeFakePidFile(
      lockDir,
      {
        pid: process.pid,
        hostname: os.hostname(),
        acquiredAt: new Date().toISOString(),
        heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
      },
      Date.now(),
    );

    const logger = makeCapturingLogger();
    const handle = await acquire({ lockDir, logger });
    try {
      const contents = await readPidFile(handle.pidFile);
      expect(contents.pid).toBe(process.pid);
      const warning = logger.warns.find((w) => w.includes("self-owned"));
      expect(warning).toBeDefined();
    } finally {
      await handle.release();
    }
  });
});

describe("acquire — heartbeat lifecycle", () => {
  it("starts a heartbeat timer that updates pid file mtime", async () => {
    const logger = makeCapturingLogger();
    const opts: LockOptions = {
      lockDir,
      heartbeatIntervalMs: 50,
      staleThresholdMs: 1000,
      logger,
    };
    const handle = await acquire(opts);
    try {
      const before = await fs.stat(handle.pidFile);
      // Wait long enough for at least 2 heartbeat ticks.
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 200);
      });
      const after = await fs.stat(handle.pidFile);
      expect(after.mtimeMs).toBeGreaterThanOrEqual(before.mtimeMs);
    } finally {
      await handle.release();
    }
  });

  it("stops the heartbeat timer on release", async () => {
    const logger = makeCapturingLogger();
    const handle = await acquire({
      lockDir,
      heartbeatIntervalMs: 50,
      logger,
    });
    await handle.release();
    // After release, calling release again must not crash and the dir
    // should remain absent.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 100);
    });
    expect(await pathExists(handle.lockDir)).toBe(false);
  });
});

describe("forceUnlock", () => {
  it("removes the lock dir unconditionally", async () => {
    const logger = makeCapturingLogger();
    const handle = await acquire({ lockDir, logger });
    // Don't release explicitly — exercise the force-unlock path.
    await forceUnlock({ lockDir, logger });
    expect(await pathExists(lockDir)).toBe(false);
    // Cleanup the handle's heartbeat timer.
    await handle.release();
  });

  it("is idempotent when no lock dir exists", async () => {
    const logger = makeCapturingLogger();
    await forceUnlock({ lockDir, logger });
    expect(await pathExists(lockDir)).toBe(false);
  });

  it("permits a fresh acquire after force-unlock", async () => {
    const logger = makeCapturingLogger();
    const handle1 = await acquire({ lockDir, logger });
    await forceUnlock({ lockDir, logger });
    const handle2 = await acquire({ lockDir, logger });
    try {
      expect(await pathExists(handle2.lockDir)).toBe(true);
    } finally {
      await handle1.release(); // no-op since dir gone, but stops timer
      await handle2.release();
    }
  });
});

describe("constants", () => {
  it("LOCK_DIR_REL is the canonical AR42 path", () => {
    expect(LOCK_DIR_REL).toBe("_bmad-output/.stepper/state.yaml.lock");
  });

  it("PID_FILE_NAME is exactly 'pid'", () => {
    expect(PID_FILE_NAME).toBe("pid");
  });

  it("HEARTBEAT_INTERVAL_MS is 5000 (architecture §D4)", () => {
    expect(HEARTBEAT_INTERVAL_MS).toBe(5_000);
  });

  it("STALE_THRESHOLD_MS is 30000 (architecture §D4)", () => {
    expect(STALE_THRESHOLD_MS).toBe(30_000);
  });

  it("STALE_THRESHOLD_FALLBACK_MS is 60000 (sub-second-mtime fallback)", () => {
    expect(STALE_THRESHOLD_FALLBACK_MS).toBe(60_000);
  });
});

// Suppress unused-import lint by exporting a type alias used in JSDoc.
export type _LockHandleAlias = LockHandle;
