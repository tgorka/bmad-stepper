/**
 * src/state/recompute.test.ts — Unit tests for `recomputeState` (AC-2;
 * FR2; NFR-P2; NFR-R3; NFR-Sc1).
 *
 * Coverage map:
 *   - AC-2 happy path:               recomputeWithCompletedArtifact
 *   - Fresh-project (no artifacts):  recomputeEmptyProject
 *   - bmadVersion override:          recomputeBmadVersionOverride
 *   - Atomic write produces YAML:    recomputeAtomicWrite
 *   - Lock release in finally:       recomputeLockRelease
 *   - statusDoneRecognised:          status: done is also recognised
 *   - skipsArtifactsWithoutFm:       artifact without frontmatter is ignored
 *   - mostRecentChosen:              picks the artifact with greatest last_updated
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { State } from "../schemas/state.ts";
import { recomputeState } from "./recompute.ts";

let tmpDir: string;
let projectRoot: string;
let statePath: string;
let lockDir: string;

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
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-recompute-"));
  projectRoot = tmpDir;
  statePath = path.join(tmpDir, ".stepper", "state.yaml");
  lockDir = path.join(tmpDir, "state.yaml.lock");
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function writeArtifact(
  relPath: string,
  frontmatter: Record<string, unknown>,
  body: string = "",
): Promise<void> {
  const full = path.join(projectRoot, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  const fmYaml = Bun.YAML.stringify(frontmatter);
  // Bun.YAML.stringify produces flow style — wrap in --- blocks; the
  // recompute frontmatter parser uses Bun.YAML.parse on the inner block,
  // so any valid YAML form is fine.
  const content = `---\n${fmYaml}\n---\n${body}`;
  await Bun.write(full, content);
}

describe("recomputeState — AC-2 happy path", () => {
  it("computes lastSuccessfulStep from a single complete artifact", async () => {
    await writeArtifact(
      "_bmad-output/implementation-artifacts/1-1-foo.md",
      {
        status: "complete",
        last_updated: "2026-01-15T10:00:00Z",
        epic: 1,
        story_id: "1.1",
        story_key: "1-1-foo",
      },
      "# Story 1.1\n",
    );

    const result: State = await recomputeState({
      projectRoot,
      statePath,
      lockOptions: { lockDir, ...fastLockOptions },
    });

    expect(result.schemaVersion).toBe(1);
    expect(result.project.name).toBe(path.basename(projectRoot));
    expect(result.project.bmadVersion).toBe("unknown");
    expect(result.runHistory).toEqual([]);
    expect(result.checkpoints).toEqual([]);
    expect(result.lastSuccessfulStep).not.toBeNull();
    if (result.lastSuccessfulStep) {
      expect(result.lastSuccessfulStep.completedAt).toBe(
        "2026-01-15T10:00:00Z",
      );
      expect(result.lastSuccessfulStep.story).toBe("1.1");
      expect(result.lastSuccessfulStep.epic).toBe(1);
    }
  });

  it("picks the most recently updated artifact across multiple status: complete entries", async () => {
    await writeArtifact("_bmad-output/implementation-artifacts/a.md", {
      status: "complete",
      last_updated: "2026-01-01T00:00:00Z",
      story_id: "1.1",
      epic: 1,
    });
    await writeArtifact("_bmad-output/implementation-artifacts/b.md", {
      status: "complete",
      last_updated: "2026-02-01T00:00:00Z",
      story_id: "1.2",
      epic: 1,
    });
    await writeArtifact("_bmad-output/planning-artifacts/c.md", {
      status: "complete",
      last_updated: "2026-03-01T00:00:00Z",
      story_id: "1.3",
      epic: 1,
    });

    const result = await recomputeState({
      projectRoot,
      statePath,
      lockOptions: { lockDir, ...fastLockOptions },
    });
    expect(result.lastSuccessfulStep).not.toBeNull();
    if (result.lastSuccessfulStep) {
      expect(result.lastSuccessfulStep.story).toBe("1.3");
      expect(result.lastSuccessfulStep.completedAt).toBe(
        "2026-03-01T00:00:00Z",
      );
    }
  });

  it("recognises status: done as equivalent to status: complete", async () => {
    await writeArtifact("_bmad-output/implementation-artifacts/done-art.md", {
      status: "done",
      last_updated: "2026-04-01T00:00:00Z",
      story_id: "1.4",
      epic: 1,
    });
    const result = await recomputeState({
      projectRoot,
      statePath,
      lockOptions: { lockDir, ...fastLockOptions },
    });
    expect(result.lastSuccessfulStep).not.toBeNull();
    if (result.lastSuccessfulStep) {
      expect(result.lastSuccessfulStep.story).toBe("1.4");
    }
  });
});

describe("recomputeState — fresh project (no artifacts)", () => {
  it("returns a fresh State with lastSuccessfulStep null on empty project", async () => {
    const result = await recomputeState({
      projectRoot,
      statePath,
      lockOptions: { lockDir, ...fastLockOptions },
    });
    expect(result.schemaVersion).toBe(1);
    expect(result.project.name).toBe(path.basename(projectRoot));
    expect(result.project.bmadVersion).toBe("unknown");
    expect(result.runHistory).toEqual([]);
    expect(result.checkpoints).toEqual([]);
    expect(result.lastSuccessfulStep ?? null).toBeNull();
  });

  it("writes the fresh state.yaml to disk after recompute", async () => {
    await recomputeState({
      projectRoot,
      statePath,
      lockOptions: { lockDir, ...fastLockOptions },
    });
    const exists = await fs
      .access(statePath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
    const onDisk = Bun.YAML.parse(await Bun.file(statePath).text()) as State;
    expect(onDisk.schemaVersion).toBe(1);
    expect(onDisk.project.bmadVersion).toBe("unknown");
  });
});

describe("recomputeState — bmadVersion override + filtering", () => {
  it("applies the bmadVersion override", async () => {
    const result = await recomputeState({
      projectRoot,
      statePath,
      bmadVersion: "6.5.0.1",
      lockOptions: { lockDir, ...fastLockOptions },
    });
    expect(result.project.bmadVersion).toBe("6.5.0.1");
  });

  it("skips artifacts without frontmatter (no leading ---)", async () => {
    const noFm = path.join(
      projectRoot,
      "_bmad-output/implementation-artifacts/no-fm.md",
    );
    await fs.mkdir(path.dirname(noFm), { recursive: true });
    await Bun.write(noFm, "# Just a story\nNo frontmatter here.\n");
    const result = await recomputeState({
      projectRoot,
      statePath,
      lockOptions: { lockDir, ...fastLockOptions },
    });
    expect(result.lastSuccessfulStep ?? null).toBeNull();
  });

  it("skips artifacts whose status is not complete or done", async () => {
    await writeArtifact("_bmad-output/implementation-artifacts/x.md", {
      status: "in-progress",
      last_updated: "2026-04-01T00:00:00Z",
      story_id: "1.5",
      epic: 1,
    });
    const result = await recomputeState({
      projectRoot,
      statePath,
      lockOptions: { lockDir, ...fastLockOptions },
    });
    expect(result.lastSuccessfulStep ?? null).toBeNull();
  });
});

describe("recomputeState — lock lifecycle", () => {
  it("releases the lock after a successful recompute", async () => {
    await recomputeState({
      projectRoot,
      statePath,
      lockOptions: { lockDir, ...fastLockOptions },
    });
    const lockExists = await fs
      .access(lockDir)
      .then(() => true)
      .catch(() => false);
    expect(lockExists).toBe(false);
  });
});
