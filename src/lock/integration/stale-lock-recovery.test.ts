/**
 * src/lock/integration/stale-lock-recovery.test.ts — AC-2 + AC-4 integration
 * test for stale-lock recovery via PID-not-alive (kill -9 simulation).
 *
 * Strategy: synthesise a lock dir with a pid file claiming a guaranteed-dead
 * PID (or stub `isPidAlive` to return `false`); call `acquire()`; assert
 * success and that the new pid file claims the test process's PID. This is
 * the canonical AC-2 path — kill -9 leaves no graceful release, the next
 * acquire detects the dead PID and reclaims.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  acquire,
  HEARTBEAT_INTERVAL_MS,
  type LockLogger,
  PID_FILE_NAME,
} from "../lock.ts";

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
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-stale-recovery-"));
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

async function synthesiseDeadHolderLock(): Promise<PidFileShape> {
  await fs.mkdir(lockDir, { recursive: true });
  const payload: PidFileShape = {
    pid: 999_999_999, // effectively guaranteed dead
    hostname: "killed-with-sigkill-host",
    acquiredAt: new Date().toISOString(),
    heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
  };
  const pidPath = path.join(lockDir, PID_FILE_NAME);
  await fs.writeFile(pidPath, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

describe("stale-lock recovery — AC-2 (kill -9 → PID not alive)", () => {
  it("reclaims the lock when holder PID is dead", async () => {
    const oldPayload = await synthesiseDeadHolderLock();
    const logger = makeCapturingLogger();
    const handle = await acquire({
      lockDir,
      isPidAlive: () => false, // simulate dead holder
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

  it("logs an informational reclaim message", async () => {
    await synthesiseDeadHolderLock();
    const logger = makeCapturingLogger();
    const handle = await acquire({
      lockDir,
      isPidAlive: () => false,
      logger,
    });
    try {
      const reclaimedLine = logger.infos.find((l) => l.includes("reclaiming"));
      expect(reclaimedLine).toBeDefined();
    } finally {
      await handle.release();
    }
  });

  it("permits subsequent normal release after recovery", async () => {
    await synthesiseDeadHolderLock();
    const logger = makeCapturingLogger();
    const handle = await acquire({
      lockDir,
      isPidAlive: () => false,
      logger,
    });
    await handle.release();
    // The dir must be gone after release (verifies the recovery path
    // produces a fully-functional handle).
    const stillExists = await fs
      .access(handle.lockDir)
      .then(() => true)
      .catch(() => false);
    expect(stillExists).toBe(false);
  });

  it("does NOT reclaim when isPidAlive returns true (live holder)", async () => {
    await synthesiseDeadHolderLock();
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
    expect(caught).toBeDefined();
  });
});
