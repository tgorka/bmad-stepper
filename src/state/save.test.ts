/**
 * src/state/save.test.ts — Unit tests for `saveState` (AC-2 partial — atomic
 * write composition; FR5; NFR-S5).
 *
 * Coverage map:
 *   - happy path round-trip:        roundTripFixture
 *   - .bak rotation:                bakRotation
 *   - Zod validation rejects:       invalidShape
 *   - Parent-dir lazy creation:     lazyParentDir
 *   - assertWithinScope enforced:   outOfScopePath (ScopeViolationError)
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { CorruptStateError, ScopeViolationError } from "../errors.ts";
import { acquire, type LockHandle } from "../lock/lock.ts";
import { canonicalStateV1Fixture } from "../schemas/state.test.ts";
import type { State } from "../schemas/state.ts";
import { saveState } from "./save.ts";

let tmpDir: string;
let statePath: string;
let lockDir: string;
let handle: LockHandle;

const fastLockOptions = {
  heartbeatIntervalMs: 100,
  staleThresholdMs: 1000,
  isPidAlive: () => true,
  logger: {
    info: () => {},
    warn: () => {},
  },
};

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-save-state-"));
  statePath = path.join(tmpDir, ".stepper", "state.yaml");
  lockDir = path.join(tmpDir, "state.yaml.lock");
  handle = await acquire({ lockDir, ...fastLockOptions });
});

afterEach(async () => {
  await handle.release();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("saveState — happy path", () => {
  it("atomic-writes the canonical state and reads back via Bun.YAML.parse", async () => {
    const fixture: State = {
      ...canonicalStateV1Fixture,
      runHistory: [],
      checkpoints: [],
    };
    await saveState(fixture, handle, { statePath });
    const text = await Bun.file(statePath).text();
    const parsed = Bun.YAML.parse(text) as State;
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.project.name).toBe("bmad-stepper");
    expect(parsed.project.bmadVersion).toBe("6.5.0.1");
  });

  it("creates the parent directory lazily on first write", async () => {
    const fixture: State = {
      ...canonicalStateV1Fixture,
      runHistory: [],
      checkpoints: [],
    };
    expect(
      await fs
        .access(path.dirname(statePath))
        .then(() => true)
        .catch(() => false),
    ).toBe(false);
    await saveState(fixture, handle, { statePath });
    expect(
      await fs
        .access(path.dirname(statePath))
        .then(() => true)
        .catch(() => false),
    ).toBe(true);
  });
});

describe("saveState — .bak rotation (architecture §D10)", () => {
  it("rotates the prior canonical contents into state.yaml.bak on second write", async () => {
    const fixture: State = {
      ...canonicalStateV1Fixture,
      runHistory: [],
      checkpoints: [],
    };
    await saveState(fixture, handle, { statePath });

    const v2: State = {
      ...fixture,
      project: { name: "bmad-stepper", bmadVersion: "6.5.0.2" },
    };
    await saveState(v2, handle, { statePath });

    const bakText = await Bun.file(`${statePath}.bak`).text();
    const bakParsed = Bun.YAML.parse(bakText) as State;
    expect(bakParsed.project.bmadVersion).toBe("6.5.0.1");

    const liveText = await Bun.file(statePath).text();
    const liveParsed = Bun.YAML.parse(liveText) as State;
    expect(liveParsed.project.bmadVersion).toBe("6.5.0.2");
  });
});

describe("saveState — pre-write Zod validation (NFR-S5)", () => {
  it("rejects a state missing the project field with CorruptStateError", async () => {
    const invalid = {
      schemaVersion: 1,
      runHistory: [],
      checkpoints: [],
    } as unknown as State;
    let caught: unknown = null;
    try {
      await saveState(invalid, handle, { statePath });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CorruptStateError);
  });

  it("does not write any bytes when validation rejects", async () => {
    const invalid = {
      schemaVersion: 1,
      runHistory: [],
      checkpoints: [],
    } as unknown as State;
    try {
      await saveState(invalid, handle, { statePath });
    } catch {
      // expected
    }
    const exists = await fs
      .access(statePath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });
});

describe("saveState — scope enforcement (AR42)", () => {
  it("rejects an out-of-scope statePath with ScopeViolationError", async () => {
    const fixture: State = {
      ...canonicalStateV1Fixture,
      runHistory: [],
      checkpoints: [],
    };
    let caught: unknown = null;
    try {
      await saveState(fixture, handle, {
        statePath: "/etc/no-such-stepper-state-must-fail.yaml",
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ScopeViolationError);
  });
});
