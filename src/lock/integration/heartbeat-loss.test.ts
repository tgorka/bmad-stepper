/**
 * src/lock/integration/heartbeat-loss.test.ts — AC-2 + AC-4 integration test
 * for the suspended-process scenario (heartbeat-loss with a still-alive PID).
 *
 * Strategy: synthesise a lock dir whose pid file's mtime is older than the
 * configured stale threshold but whose claimed PID is still "alive" (the
 * `isPidAlive` stub returns true). This simulates a process that received
 * SIGSTOP — the kernel still reports the PID as alive but the heartbeat
 * loop stopped firing. The lock module should reclaim via the mtime-stale
 * branch of `evaluateStaleness()`.
 *
 * Uses tight thresholds (stale = 100ms) to avoid wall-clock waits in CI.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { acquire, type LockLogger, PID_FILE_NAME } from "../lock.ts";

let tmpDir: string;
let lockDir: string;

const silentLogger: LockLogger = {
  info(_message: string): void {},
  warn(_message: string): void {},
};

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-heartbeat-loss-"));
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

async function synthesiseSuspendedHolder(ageMs: number): Promise<PidFileShape> {
  await fs.mkdir(lockDir, { recursive: true });
  const mtimeMs = Date.now() - ageMs;
  // Force a sub-millisecond perturbation so the mtime appears non-rounded
  // (avoids tripping the sub-second-mtime fallback path which would widen
  // the threshold to 60s and break this test's 5s threshold).
  const payload: PidFileShape = {
    pid: process.pid + 555_555,
    hostname: "suspended-with-sigstop-host",
    acquiredAt: new Date(mtimeMs).toISOString(),
    heartbeatIntervalMs: 10,
  };
  const pidPath = path.join(lockDir, PID_FILE_NAME);
  await fs.writeFile(pidPath, JSON.stringify(payload, null, 2), "utf8");
  // Add 1ms to ensure mtimeMs % 1000 !== 0 (most filesystems will preserve).
  const dateWithMs = new Date(mtimeMs + 1);
  await fs.utimes(pidPath, dateWithMs, dateWithMs);
  return payload;
}

describe("heartbeat-loss — AC-2 (suspended process / stale mtime)", () => {
  it("reclaims when mtime exceeds the stale threshold (PID still 'alive')", async () => {
    const oldPayload = await synthesiseSuspendedHolder(500);

    const handle = await acquire({
      lockDir,
      heartbeatIntervalMs: 50,
      staleThresholdMs: 100,
      isPidAlive: () => true, // simulates the suspended-but-alive case
      logger: silentLogger,
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

  it("does NOT reclaim when mtime is fresh (heartbeat ticking normally)", async () => {
    await synthesiseSuspendedHolder(10); // mtime is 10ms ago — well within threshold

    let caught: unknown;
    try {
      await acquire({
        lockDir,
        heartbeatIntervalMs: 50,
        staleThresholdMs: 1000,
        isPidAlive: () => true,
        logger: silentLogger,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
  });

  it("reclaims at the boundary: mtime just past threshold", async () => {
    const oldPayload = await synthesiseSuspendedHolder(200);

    const handle = await acquire({
      lockDir,
      heartbeatIntervalMs: 50,
      staleThresholdMs: 100,
      isPidAlive: () => true,
      logger: silentLogger,
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
});
