/**
 * src/lock/integration/concurrent-acquire.test.ts — AC-4 integration test
 * for the concurrent-acquire scenario (AC-1 cross-process contention path).
 *
 * Strategy: synthesise a held lock dir + pid file with a "live" PID and a
 * recent mtime, then attempt to acquire from the test process. The
 * underlying contention path is the EEXIST + live-PID branch in
 * `evaluateStaleness()` — the same branch a real second process would
 * exercise. This avoids the complexity of `Bun.spawn` while testing the
 * exact code path AC-1 specifies.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { LockContentionError } from "../../errors.ts";
import {
  acquire,
  HEARTBEAT_INTERVAL_MS,
  type LockLogger,
  PID_FILE_NAME,
} from "../lock.ts";

let tmpDir: string;
let lockDir: string;

const silentLogger: LockLogger = {
  info(_message: string): void {},
  warn(_message: string): void {},
};

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-concurrent-"));
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

async function synthesiseHeldLock(
  pidPayload: PidFileShape,
  mtimeMs: number,
): Promise<void> {
  await fs.mkdir(lockDir, { recursive: true });
  const pidPath = path.join(lockDir, PID_FILE_NAME);
  await fs.writeFile(pidPath, JSON.stringify(pidPayload, null, 2), "utf8");
  const date = new Date(mtimeMs);
  await fs.utimes(pidPath, date, date);
}

describe("concurrent acquire — AC-1 contention path", () => {
  it("throws LockContentionError when a live holder owns the lock", async () => {
    await synthesiseHeldLock(
      {
        pid: process.pid + 100_000,
        hostname: "concurrent-test-other-host",
        acquiredAt: new Date().toISOString(),
        heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
      },
      Date.now(),
    );

    let caught: unknown;
    try {
      await acquire({
        lockDir,
        isPidAlive: () => true,
        logger: silentLogger,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(LockContentionError);
    const e = caught as LockContentionError;
    expect(e.code).toBe("LOCK_CONTENTION");
    expect(e.exitCode).toBe(4);
  });

  it("hint matches AC-1 verbatim string", async () => {
    await synthesiseHeldLock(
      {
        pid: process.pid + 100_001,
        hostname: "concurrent-test-other-host-2",
        acquiredAt: new Date().toISOString(),
        heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
      },
      Date.now(),
    );

    let caught: unknown;
    try {
      await acquire({
        lockDir,
        isPidAlive: () => true,
        logger: silentLogger,
      });
    } catch (err) {
      caught = err;
    }
    const e = caught as LockContentionError;
    expect(e.actionableHint).toBe(
      "Run /bmad-next --doctor to inspect lock state, or /bmad-next --force-unlock if you're sure no other Stepper is running.",
    );
  });

  it("does not modify the existing lock when contention is detected", async () => {
    const pidPayload: PidFileShape = {
      pid: process.pid + 100_002,
      hostname: "concurrent-test-other-host-3",
      acquiredAt: new Date().toISOString(),
      heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
    };
    await synthesiseHeldLock(pidPayload, Date.now());

    try {
      await acquire({
        lockDir,
        isPidAlive: () => true,
        logger: silentLogger,
      });
    } catch {
      // expected throw
    }
    // The original pid file should be untouched.
    const raw = await fs.readFile(path.join(lockDir, PID_FILE_NAME), "utf8");
    const parsed = JSON.parse(raw) as PidFileShape;
    expect(parsed.pid).toBe(pidPayload.pid);
    expect(parsed.hostname).toBe(pidPayload.hostname);
  });
});
