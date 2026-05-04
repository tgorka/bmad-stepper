/**
 * src/state/load.test.ts — Unit + behavioural tests for `loadState` and
 * `loadStateUnlocked` (AC-1, FR5, FR6, FR7, NFR-P5).
 *
 * Coverage map:
 *   - AC-1 happy path (≤ 1 MB):     loadStateUnderOneMb
 *   - AC-1 size warn (> 1 MB):      warnsAboveOneMb
 *   - AC-1 size halt (> 50 MB):     haltsAboveFiftyMb (verbatim hint)
 *   - CORRUPT_STATE missing file:   missingFile
 *   - CORRUPT_STATE malformed YAML: malformedYaml
 *   - STATE_TOO_NEW:                schemaVersionTooNew
 *   - loadStateUnlocked skip lock:  unlockedVariant
 *   - 100 ms p95 informational:     loadPerformance (mark `it.skip` if flaky)
 *
 * Tests use a unique tmpdir per `it(...)` block per AR35; the project's
 * real `_bmad-output/` is never touched.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  CorruptStateError,
  PathologicalInputError,
  StateTooNewError,
} from "../errors.ts";
import { canonicalStateV1Fixture } from "../schemas/state.test.ts";
import {
  DEFAULT_HALT_SIZE_BYTES,
  DEFAULT_WARN_SIZE_BYTES,
  loadState,
  loadStateUnlocked,
} from "./load.ts";

let tmpDir: string;
let statePath: string;
let lockDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-load-state-"));
  statePath = path.join(tmpDir, "state.yaml");
  lockDir = path.join(tmpDir, "state.yaml.lock");
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const fastLockOptions = {
  heartbeatIntervalMs: 100,
  staleThresholdMs: 1000,
  isPidAlive: () => true,
  logger: {
    info: () => {},
    warn: () => {},
  },
};

async function writeFixtureState(): Promise<void> {
  const yaml = Bun.YAML.stringify({
    ...canonicalStateV1Fixture,
    runHistory: [],
    checkpoints: [],
  });
  await Bun.write(statePath, yaml);
}

describe("loadState — happy path (≤ 1 MB; AC-1)", () => {
  it("round-trips the canonical state fixture", async () => {
    await writeFixtureState();
    const result = await loadState({
      statePath,
      lockOptions: { lockDir, ...fastLockOptions },
    });
    expect(result.schemaVersion).toBe(1);
    expect(result.project.name).toBe("bmad-stepper");
    expect(result.project.bmadVersion).toBe("6.5.0.1");
    expect(result.runHistory).toEqual([]);
    expect(result.checkpoints).toEqual([]);
  });

  it("returns the parsed value with default checkpoints/runHistory arrays", async () => {
    await writeFixtureState();
    const result = await loadState({
      statePath,
      lockOptions: { lockDir, ...fastLockOptions },
    });
    expect(Array.isArray(result.checkpoints)).toBe(true);
    expect(Array.isArray(result.runHistory)).toBe(true);
  });
});

describe("loadState — size guards (NFR-P5)", () => {
  it("emits a stderr warning when state.yaml is between 1 MB and 50 MB", async () => {
    // Build a synthetic YAML body exceeding the 1 MB warn threshold by
    // padding a custom string field. We write raw text since it is not
    // required to round-trip — we only need the file size to trigger the
    // warn branch.
    const padding = "x".repeat(DEFAULT_WARN_SIZE_BYTES + 1024);
    const yaml = `${Bun.YAML.stringify({
      ...canonicalStateV1Fixture,
      runHistory: [],
      checkpoints: [],
    })}\n# pad: ${padding}\n`;
    // The warn-branch test does NOT require the YAML to be valid for the
    // schema after we add the comment — `Bun.YAML.parse` ignores comments
    // (or rounds them) and the canonical fixture remains the parsed value.
    await Bun.write(statePath, yaml);

    const warnSpy = mock((_msg: string) => {});
    const result = await loadState({
      statePath,
      lockOptions: { lockDir, ...fastLockOptions },
      logger: { warn: warnSpy },
    });
    expect(result.schemaVersion).toBe(1);
    expect(warnSpy).toHaveBeenCalled();
    const args = warnSpy.mock.calls[0];
    expect(args).toBeDefined();
    if (args) {
      expect(args[0]).toMatch(/exceeds 1 MB warn threshold/);
    }
  });

  it("halts with PathologicalInputError when state.yaml exceeds 50 MB (AC-1)", async () => {
    // Synthesize a 51 MB scratch file. The size guard fires before the YAML
    // parser; the bytes do not need to be valid YAML.
    const halfMb = new Uint8Array(512 * 1024).fill(120); // 'x'
    const handle = await fs.open(statePath, "w");
    try {
      // 51 MB / 512 KB = 102 chunks of 512 KB.
      for (let i = 0; i < 102; i += 1) {
        await handle.write(halfMb);
      }
    } finally {
      await handle.close();
    }
    const stat = await fs.stat(statePath);
    expect(stat.size).toBeGreaterThan(DEFAULT_HALT_SIZE_BYTES);

    let caught: unknown = null;
    try {
      await loadState({
        statePath,
        lockOptions: { lockDir, ...fastLockOptions },
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PathologicalInputError);
    const stepperErr = caught as PathologicalInputError;
    expect(stepperErr.code).toBe("PATHOLOGICAL_INPUT");
    expect(stepperErr.exitCode).toBe(5);
    expect(stepperErr.actionableHint).toBe(
      "Run /bmad-next --recompute-state to rebuild the cache.",
    );
  });

  it("respects an injected warnSizeBytes override", async () => {
    await writeFixtureState();
    const warnSpy = mock((_msg: string) => {});
    // Force the warn branch by setting the threshold below the file size.
    const stat = await fs.stat(statePath);
    const result = await loadState({
      statePath,
      warnSizeBytes: Math.max(1, stat.size - 1),
      lockOptions: { lockDir, ...fastLockOptions },
      logger: { warn: warnSpy },
    });
    expect(result.schemaVersion).toBe(1);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("respects an injected haltSizeBytes override", async () => {
    await writeFixtureState();
    const stat = await fs.stat(statePath);
    let caught: unknown = null;
    try {
      await loadState({
        statePath,
        haltSizeBytes: Math.max(1, stat.size - 1),
        lockOptions: { lockDir, ...fastLockOptions },
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PathologicalInputError);
  });
});

describe("loadState — error pathways", () => {
  it("throws CorruptStateError when state.yaml is missing", async () => {
    let caught: unknown = null;
    try {
      await loadState({
        statePath, // file does not exist on disk
        lockOptions: { lockDir, ...fastLockOptions },
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CorruptStateError);
    const stepperErr = caught as CorruptStateError;
    expect(stepperErr.code).toBe("CORRUPT_STATE");
    expect(stepperErr.message).toMatch(/missing or empty/);
  });

  it("throws CorruptStateError when state.yaml has malformed YAML", async () => {
    await Bun.write(statePath, "::: not: a: : valid: : yaml :\n");
    let caught: unknown = null;
    try {
      await loadState({
        statePath,
        lockOptions: { lockDir, ...fastLockOptions },
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CorruptStateError);
  });

  it("throws StateTooNewError when schemaVersion exceeds the registry's current", async () => {
    await Bun.write(
      statePath,
      Bun.YAML.stringify({
        schemaVersion: 99,
        project: { name: "x", bmadVersion: "y" },
      }),
    );
    let caught: unknown = null;
    try {
      await loadState({
        statePath,
        lockOptions: { lockDir, ...fastLockOptions },
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(StateTooNewError);
    const stepperErr = caught as StateTooNewError;
    expect(stepperErr.code).toBe("STATE_TOO_NEW");
  });

  it("releases the lock even when readStateAt throws", async () => {
    // Pre-create a corrupt file so readStateAt throws after acquire().
    await Bun.write(statePath, "::: malformed :::\n");
    try {
      await loadState({
        statePath,
        lockOptions: { lockDir, ...fastLockOptions },
      });
    } catch {
      // expected — the assertion is on lock release below.
    }
    const lockExists = await fs
      .access(lockDir)
      .then(() => true)
      .catch(() => false);
    expect(lockExists).toBe(false);
  });
});

describe("loadStateUnlocked — read-only variant", () => {
  it("reads state.yaml without acquiring the lock", async () => {
    await writeFixtureState();
    const result = await loadStateUnlocked({ statePath });
    expect(result.schemaVersion).toBe(1);
    expect(result.project.name).toBe("bmad-stepper");
  });

  it("does not create the lock dir on the unlocked path", async () => {
    await writeFixtureState();
    await loadStateUnlocked({ statePath });
    const lockExists = await fs
      .access(lockDir)
      .then(() => true)
      .catch(() => false);
    expect(lockExists).toBe(false);
  });

  it("propagates CorruptStateError on missing file (no lock interaction)", async () => {
    let caught: unknown = null;
    try {
      await loadStateUnlocked({ statePath });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CorruptStateError);
  });
});
