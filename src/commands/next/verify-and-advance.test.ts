/**
 * src/commands/next/verify-and-advance.test.ts — Colocated tests for the
 * canonical lock-acquiring `/bmad-next` post-dispatch runner (Story 2.6
 * AC-1 through AC-5 + lock-acquired invariant + lock-release-in-finally
 * invariant + verifier-failure halt + lock-contention halt + args parser
 * error + AR41 boundary + NFR-S1 + AR9 schema validation).
 *
 * AR35 tmpdir-per-test pattern: every test runs under a unique
 * `os.tmpdir()`-derived directory; cleanup via `fs.rm({ recursive: true,
 * force: true })` in `afterEach`. NEVER hard-coded `/tmp/...` paths.
 *
 * Coverage map (Task 11 from story spec):
 *   - 11.2 AC-1 + AC-2 happy path (state-hash match → verifier pass →
 *     promote → state advance + tokens recorded into runHistory[]).
 *   - 11.3 AC-2 atomic copy + .bak rotation.
 *   - 11.4 AC-2 tokens recorded into runHistory.
 *   - 11.5 AC-3 + AC-5 TOCTOU mismatch (state advanced during dispatch).
 *   - 11.6 AC-4 transcript + run log written.
 *   - 11.7 lock-acquired invariant (acquire called exactly once).
 *   - 11.8 lock-release-in-finally invariant (release called on error).
 *   - 11.9 verifier-failure halt.
 *   - 11.10 lock-contention halt.
 *   - 11.11 args parser error.
 *   - 11.12 AR9 schema validation (round-trip).
 *   - 11.13 AR41 boundary (programmatic source-content check).
 *   - 11.14 NFR-S1 no-network (programmatic check).
 *
 * Tests target the testable `runVerifyAndAdvance()` export — NOT the
 * `import.meta.main` entrypoint (covered by Story 2.8 smoke test).
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { DagAdjacency, DagNode, Phase } from "../../dag/index.ts";
import { DispatchActionV1Schema } from "../../schemas/dispatch-protocol.ts";
import type { DispatchSpecV1 } from "../../schemas/dispatch-spec.ts";
import { RunLogV1Schema } from "../../schemas/run-log.ts";
import {
  compareStateHashes,
  derivePhaseFromStep,
  matchCheckpointPhase,
  runVerifyAndAdvance,
} from "./verify-and-advance.ts";

let tmp = "";

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-verify-"));
});

afterEach(async () => {
  if (tmp !== "") {
    await fs.rm(tmp, { recursive: true, force: true });
    tmp = "";
  }
});

// ─── Fixture helpers ──────────────────────────────────────────────────────

interface SeedFixtureInput {
  readonly runId: string;
  readonly stepName: string;
  readonly epic: number;
  readonly story: string;
  /**
   * State to seed in state.yaml. If omitted, a minimal state is written
   * with no lastSuccessfulStep / lastAttempted (cold start).
   */
  readonly stateOverride?: Record<string, unknown>;
  /**
   * If omitted, the state is built so that the dispatch-spec matches it
   * (state-hash match by default for happy-path tests). When `stateOverride`
   * is provided, it takes precedence.
   */
  readonly seedHappyPathState?: boolean;
  /** If true, write an artifact with valid markdown body. Default true. */
  readonly seedArtifact?: boolean;
  /** Custom artifact body. Default a minimal valid markdown. */
  readonly artifactBody?: string;
}

interface FixturePaths {
  readonly statePath: string;
  readonly stagingRoot: string;
  readonly canonicalRoot: string;
  readonly runsRoot: string;
  readonly lockDir: string;
}

function fixturePaths(): FixturePaths {
  return {
    statePath: path.join(tmp, "state.yaml"),
    stagingRoot: path.join(tmp, "staging"),
    canonicalRoot: path.join(tmp, "canonical"),
    runsRoot: path.join(tmp, "runs"),
    lockDir: path.join(tmp, "lock"),
  };
}

async function seedFixture(input: SeedFixtureInput): Promise<FixturePaths> {
  const paths = fixturePaths();

  // Seed state.yaml.
  let state: Record<string, unknown>;
  if (input.stateOverride !== undefined) {
    state = input.stateOverride;
  } else if (input.seedHappyPathState !== false) {
    state = {
      schemaVersion: 1,
      project: { name: "stepper-test", bmadVersion: "6.5.0" },
      lastSuccessfulStep: {
        step: "bmad-create-prd",
        epic: input.epic,
        story: input.story,
        completedAt: "2026-04-29T10:00:00Z",
      },
      runHistory: [],
      checkpoints: [],
    };
  } else {
    state = {
      schemaVersion: 1,
      project: { name: "stepper-test", bmadVersion: "6.5.0" },
      runHistory: [],
      checkpoints: [],
    };
  }
  await Bun.write(paths.statePath, Bun.YAML.stringify(state));

  // Seed staging/<runId>/dispatch-spec.json.
  const stagingDir = path.join(paths.stagingRoot, input.runId);
  await fs.mkdir(stagingDir, { recursive: true });
  await fs.mkdir(path.join(stagingDir, "outputs"), { recursive: true });
  await fs.mkdir(path.join(stagingDir, "inputs"), { recursive: true });
  const dispatchSpec: DispatchSpecV1 = {
    schemaVersion: 1,
    runId: input.runId,
    step: input.stepName,
    epic: input.epic,
    story: input.story,
    model: "sonnet",
    budget: { contextTokens: 60_000, timeoutMs: 300_000 },
    taskSpec: {
      persona: "dev",
      context: [
        {
          path: "_bmad-output/planning-artifacts/bmad-create-prd.md",
          label: "PRD",
        },
      ],
      task: `Execute BMAD step ${input.stepName}.`,
      outputFormat: {
        fileLocation: `staging/${input.runId}/outputs/${input.stepName}.md`,
        requiredSections: [],
      },
      successCriteria: ["Artifact exists and verifier passes."],
      constraints: {
        allowedTools: ["Read", "Write", "Edit", "Grep", "Bash"],
        scopeLimits: `Only files inside staging/${input.runId}/ may be written.`,
      },
    },
  };
  await Bun.write(
    path.join(stagingDir, "dispatch-spec.json"),
    JSON.stringify(dispatchSpec, null, 2),
  );

  // Seed staging/<runId>/outputs/<step>.md (the sub-agent output).
  if (input.seedArtifact !== false) {
    const body =
      input.artifactBody ??
      "---\ntitle: Sample Artifact\nstatus: review\n---\n\n# Body\n\nLorem ipsum.\n";
    await Bun.write(
      path.join(stagingDir, "outputs", `${input.stepName}.md`),
      body,
    );
  }

  return paths;
}

// ─── 11.2 + 11.4: AC-1 + AC-2 happy path ─────────────────────────────────

describe("runVerifyAndAdvance — AC-1 + AC-2 happy path (state-hash match → verifier pass → promote → state advance)", () => {
  it("emits action: 'report' with success line + advances state.yaml + writes transcript pair", async () => {
    const paths = await seedFixture({
      runId: "test-run-1",
      stepName: "bmad-create-architecture",
      epic: 1,
      story: "1.0",
    });

    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "test-run-1",
        "--tokens-in",
        "100",
        "--tokens-out",
        "200",
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-01T08:00:00.000Z",
    });

    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    expect(result.action.message).toContain("✓ bmad-create-architecture → ");
    expect(result.action.message).toContain("planning-artifacts");
    expect(result.action.message).toContain("tokens: in=100 out=200");
    expect(result.action.exitCode).toBe(0);
    expect(result.promotedTo).toBe(
      path.join(
        paths.canonicalRoot,
        "planning-artifacts",
        "bmad-create-architecture.md",
      ),
    );

    // The artifact exists at the canonical path.
    const destStat = await fs.stat(result.promotedTo as string);
    expect(destStat.isFile()).toBe(true);

    // state.yaml advanced.
    const updated = Bun.YAML.parse(
      await Bun.file(paths.statePath).text(),
    ) as Record<string, unknown>;
    const lastSuccess = updated.lastSuccessfulStep as
      | { step: string; epic: number; story: string }
      | undefined;
    expect(lastSuccess?.step).toBe("bmad-create-architecture");
    expect(updated.lastAttempted).toBeNull();
    const runHistory = updated.runHistory as Array<Record<string, unknown>>;
    expect(runHistory.length).toBe(1);
    expect(runHistory[0]?.runId).toBe("test-run-1");
    expect(runHistory[0]?.tokensIn).toBe(100);
    expect(runHistory[0]?.tokensOut).toBe(200);
    expect(runHistory[0]?.verifierStatus).toBe("pass");

    // Transcript paths captured.
    expect(result.transcriptPaths?.markdown).toContain(paths.runsRoot);
    expect(result.transcriptPaths?.json).toContain(paths.runsRoot);
    const mdStat = await fs.stat(result.transcriptPaths?.markdown as string);
    expect(mdStat.isFile()).toBe(true);
    const jsonStat = await fs.stat(result.transcriptPaths?.json as string);
    expect(jsonStat.isFile()).toBe(true);

    // Lock dir released.
    let lockExists = true;
    try {
      await fs.access(paths.lockDir);
    } catch {
      lockExists = false;
    }
    expect(lockExists).toBe(false);
  });
});

// ─── 11.3: AC-2 atomic copy + .bak rotation ──────────────────────────────

describe("runVerifyAndAdvance — AC-2 atomic copy + .bak rotation", () => {
  it("writes prior canonical content to <path>.bak when overwriting", async () => {
    const paths = await seedFixture({
      runId: "rot-1",
      stepName: "bmad-create-architecture",
      epic: 1,
      story: "1.0",
    });

    // Pre-populate the canonical destination with prior content.
    const destDir = path.join(paths.canonicalRoot, "planning-artifacts");
    await fs.mkdir(destDir, { recursive: true });
    const priorContent = "# Prior architecture content\n";
    const destPath = path.join(destDir, "bmad-create-architecture.md");
    await Bun.write(destPath, priorContent);

    const result = await runVerifyAndAdvance({
      argv: ["--run-id", "rot-1", "--tokens-in", "0", "--tokens-out", "0"],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-01T08:00:00.000Z",
    });

    expect(result.exitCode).toBe(0);
    // The canonical destination has the new content (from the seeded artifact).
    const destText = await Bun.file(destPath).text();
    expect(destText.includes("Lorem ipsum")).toBe(true);
    // The .bak has the prior content.
    const bakText = await Bun.file(`${destPath}.bak`).text();
    expect(bakText).toBe(priorContent);
  });
});

// ─── 11.5: AC-3 + AC-5 TOCTOU mismatch ───────────────────────────────────

describe("runVerifyAndAdvance — AC-3 + AC-5 state-hash mismatch (TOCTOU)", () => {
  it("returns exit 1 + halt with verbatim StateChangedDuringDispatchError hint", async () => {
    // Seed state with epic 2, story 2.0 (advanced); but dispatch-spec for epic 1, story 1.0 (stale).
    const paths = await seedFixture({
      runId: "toc-1",
      stepName: "bmad-dev-story",
      epic: 1,
      story: "1.0",
      stateOverride: {
        schemaVersion: 1,
        project: { name: "stepper-test", bmadVersion: "6.5.0" },
        lastSuccessfulStep: {
          step: "bmad-create-architecture",
          epic: 2,
          story: "2.0",
          completedAt: "2026-04-30T10:00:00Z",
        },
        runHistory: [],
        checkpoints: [],
      },
    });

    const beforeStateMtime = (await fs.stat(paths.statePath)).mtimeMs;

    const result = await runVerifyAndAdvance({
      argv: ["--run-id", "toc-1", "--tokens-in", "100", "--tokens-out", "200"],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-01T08:00:00.000Z",
    });

    expect(result.exitCode).toBe(1);
    expect(result.action.action).toBe("halt");
    if (result.action.action !== "halt") return;
    expect(result.action.message).toBe(
      "Run /bmad-next --diff-state to see what changed and /bmad-next --resume to retry from the current state.",
    );
    expect(result.action.exitCode).toBe(1);

    // Artifact NOT promoted.
    let destExists = true;
    try {
      await fs.access(
        path.join(
          paths.canonicalRoot,
          "implementation-artifacts",
          "bmad-dev-story.md",
        ),
      );
    } catch {
      destExists = false;
    }
    expect(destExists).toBe(false);

    // Story 3.1: state.yaml IS now modified on halt — the halt-path
    // state-save records `lastFailureReason` (and clears `lastAttempted` to
    // null since `--last-attempted-json` was not passed). The mtime check
    // is replaced with a structural assertion that lastSuccessfulStep is
    // unchanged from before (AC line 732 — "lastSuccessfulStep is cleared
    // to point at the previous success (unchanged from before the failed
    // attempt)").
    void beforeStateMtime;
    const updated = Bun.YAML.parse(
      await Bun.file(paths.statePath).text(),
    ) as Record<string, unknown>;
    const lastSuccess = updated.lastSuccessfulStep as
      | { step: string; epic: number; story: string }
      | undefined;
    expect(lastSuccess?.step).toBe("bmad-create-architecture");
    expect(lastSuccess?.epic).toBe(2);
    const failureReason = updated.lastFailureReason as
      | { code: string; runId: string }
      | null
      | undefined;
    expect(failureReason?.code).toBe("STATE_CHANGED_DURING_DISPATCH");
    expect(failureReason?.runId).toBe("toc-1");

    // Lock released.
    let lockExists = true;
    try {
      await fs.access(paths.lockDir);
    } catch {
      lockExists = false;
    }
    expect(lockExists).toBe(false);

    // Transcript pair STILL written (forensic discipline).
    expect(result.transcriptPaths?.markdown).toBeDefined();
    expect(result.transcriptPaths?.json).toBeDefined();

    // Run-log JSON's errors[] contains the StateChangedDuringDispatchError.toJSON() entry.
    const runLogText = await Bun.file(
      result.transcriptPaths?.json as string,
    ).text();
    const runLog = JSON.parse(runLogText) as { errors: unknown[] };
    expect(runLog.errors.length).toBeGreaterThan(0);
    const firstErr = runLog.errors[0] as { code: string };
    expect(firstErr.code).toBe("STATE_CHANGED_DURING_DISPATCH");
  });
});

// ─── 11.6: AC-4 transcript + run log written ─────────────────────────────

describe("runVerifyAndAdvance — AC-4 transcript + run log written", () => {
  it("run-log JSON validates against RunLogV1Schema", async () => {
    const paths = await seedFixture({
      runId: "log-1",
      stepName: "bmad-dev-story",
      epic: 3,
      story: "3.1",
    });

    const result = await runVerifyAndAdvance({
      argv: ["--run-id", "log-1", "--tokens-in", "50", "--tokens-out", "75"],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-01T08:00:00.000Z",
    });

    expect(result.exitCode).toBe(0);
    const runLogText = await Bun.file(
      result.transcriptPaths?.json as string,
    ).text();
    const parsed = JSON.parse(runLogText);
    const validated = RunLogV1Schema.parse(parsed);
    expect(validated.runId).toBe("log-1");
    expect(validated.step).toBe("bmad-dev-story");
    expect(validated.tokensIn).toBe(50);
    expect(validated.tokensOut).toBe(75);
  });

  it("markdown transcript file exists with correct path naming", async () => {
    const paths = await seedFixture({
      runId: "md-1",
      stepName: "bmad-dev-story",
      epic: 1,
      story: "1.0",
    });

    const result = await runVerifyAndAdvance({
      argv: ["--run-id", "md-1", "--tokens-in", "0", "--tokens-out", "0"],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-01T08:00:00.000Z",
    });

    expect(result.transcriptPaths?.markdown.endsWith(".log")).toBe(true);
    expect(result.transcriptPaths?.json.endsWith(".json")).toBe(true);
    const mdContent = await Bun.file(
      result.transcriptPaths?.markdown as string,
    ).text();
    expect(mdContent.length).toBeGreaterThan(0);
  });
});

// ─── 11.7 + 11.8: lock-acquired + lock-release-in-finally invariants ────

describe("runVerifyAndAdvance — lock invariants (acquire + release)", () => {
  it("calls acquire exactly once on the happy path (lock dir created then removed)", async () => {
    const paths = await seedFixture({
      runId: "lock-1",
      stepName: "bmad-dev-story",
      epic: 1,
      story: "1.0",
    });

    // Verify the lock dir doesn't exist before the call.
    let lockExistsBefore = true;
    try {
      await fs.access(paths.lockDir);
    } catch {
      lockExistsBefore = false;
    }
    expect(lockExistsBefore).toBe(false);

    const result = await runVerifyAndAdvance({
      argv: ["--run-id", "lock-1", "--tokens-in", "0", "--tokens-out", "0"],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-01T08:00:00.000Z",
    });

    expect(result.exitCode).toBe(0);
    // Lock dir released in finally.
    let lockExistsAfter = true;
    try {
      await fs.access(paths.lockDir);
    } catch {
      lockExistsAfter = false;
    }
    expect(lockExistsAfter).toBe(false);
  });

  it("releases the lock even when verification fails (verifier-fail path)", async () => {
    const paths = await seedFixture({
      runId: "fail-lock-1",
      stepName: "bmad-dev-story",
      epic: 1,
      story: "1.0",
      // The default verifier config has empty requiredFrontmatterSections;
      // we trigger a failure by passing a runId that does NOT have a
      // staging dir → runVerifier throws VerifierFailureError (orchestration).
    });
    // Remove the staging subdir to trigger the orchestration-level failure.
    await fs.rm(path.join(paths.stagingRoot, "fail-lock-1"), {
      recursive: true,
      force: true,
    });
    // Re-create the dispatch-spec at the staging root so readDispatchSpec
    // succeeds — actually, we can't because we just deleted the dir.
    // Instead: trigger the failure via state-hash mismatch (lighter weight)
    // in the dedicated TOCTOU test above; this test covers the
    // release-on-error path via the dispatch-spec missing case.
    // Let's instead leave the dispatch-spec but remove the artifact, so
    // the verifier fails (frontmatter check fails on missing file).
    // Re-seed the dispatch-spec.
    const stagingDir = path.join(paths.stagingRoot, "fail-lock-1");
    await fs.mkdir(path.join(stagingDir, "outputs"), { recursive: true });
    const dispatchSpec: DispatchSpecV1 = {
      schemaVersion: 1,
      runId: "fail-lock-1",
      step: "bmad-dev-story",
      epic: 1,
      story: "1.0",
      model: "sonnet",
      budget: { contextTokens: 60_000, timeoutMs: 300_000 },
      taskSpec: {
        persona: "dev",
        context: [],
        task: "Execute step.",
        outputFormat: { fileLocation: "x", requiredSections: [] },
        successCriteria: ["x"],
        constraints: {
          allowedTools: ["Read"],
          scopeLimits: "x",
        },
      },
    };
    await Bun.write(
      path.join(stagingDir, "dispatch-spec.json"),
      JSON.stringify(dispatchSpec, null, 2),
    );

    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "fail-lock-1",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-01T08:00:00.000Z",
    });

    // The dev-story default config has empty requiredFiles (per registry
    // for unknown step names like bmad-dev-story → falls back to default
    // baseline → all checks skip → status: "pass"). So the verifier
    // passes; but then promote() should fail because the source artifact
    // is missing. promote() throws VerifierFailureError; outer catch
    // translates to halt; lock STILL released in finally.
    expect([1]).toContain(result.exitCode);
    expect(result.action.action).toBe("halt");

    // Lock released in finally.
    let lockExistsAfter = true;
    try {
      await fs.access(paths.lockDir);
    } catch {
      lockExistsAfter = false;
    }
    expect(lockExistsAfter).toBe(false);
  });
});

// ─── 11.10: lock-contention halt ─────────────────────────────────────────

describe("runVerifyAndAdvance — lock-contention halt", () => {
  /**
   * Lock-contention test — exercises the second-process-during-contention
   * path per Story 1.4 lock.ts (an alien holder simulated via lock dir +
   * pid file pointing at a synthetic alive pid). The test SKIPS when the
   * lock module has been mocked by a sibling test file (Story 2.4
   * `run.test.ts` uses `mock.module("../../lock/lock.ts", ...)`; Bun's
   * mock.module persists globally for the test runner). The skip is
   * detected by feature-checking the imported `acquire`'s return shape;
   * if the canonical Story 1.4 LockHandle is missing, the test logs a
   * skip note and moves on. The lock-contention behavior is canonically
   * exercised by `src/lock/lock.test.ts` regardless.
   */
  it("returns exit 4 + halt with LockContentionError hint when another live process holds the lock", async () => {
    // Detect whether the lock module is real (via dynamic import to avoid
    // re-binding our static import). If mocked, skip the test.
    const lockMod = await import("../../lock/lock.ts");
    const isReal = typeof lockMod.LOCK_DIR_REL === "string";
    const probe = await lockMod.acquire({
      lockDir: path.join(tmp, "probe-lock"),
    });
    const probeHandleIsReal = typeof probe.release === "function";
    if (probeHandleIsReal) await probe.release();
    if (!isReal || !probeHandleIsReal) {
      // Mock active — Story 1.4's tests cover the canonical
      // lock-contention behavior. Skip.
      return;
    }

    const paths = await seedFixture({
      runId: "lc-1",
      stepName: "bmad-dev-story",
      epic: 1,
      story: "1.0",
    });

    // Simulate an alien holder: lock dir + pid file pointing at a
    // synthetic pid OTHER than ours; isPidAlive override reports the
    // synthetic pid as alive; large stale thresholds prevent the
    // mtime-based stale-reclaim path from firing.
    await fs.mkdir(paths.lockDir, { recursive: true });
    const alienPid = process.pid + 1;
    const pidFileContents = {
      pid: alienPid,
      hostname: os.hostname(),
      acquiredAt: new Date().toISOString(),
      heartbeatIntervalMs: 5000,
    };
    await Bun.write(
      path.join(paths.lockDir, "pid"),
      JSON.stringify(pidFileContents, null, 2),
    );

    const result = await runVerifyAndAdvance({
      argv: ["--run-id", "lc-1", "--tokens-in", "0", "--tokens-out", "0"],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: {
        lockDir: paths.lockDir,
        isPidAlive: (pid) => pid === alienPid,
        staleThresholdMs: 600_000,
        staleThresholdFallbackMs: 600_000,
      },
      nowIso: "2026-05-01T08:00:00.000Z",
    });

    expect(result.exitCode).toBe(4);
    expect(result.action.action).toBe("halt");
    if (result.action.action !== "halt") return;
    expect(result.action.message).toContain("Run /bmad-next --doctor");
    expect(result.action.exitCode).toBe(4);

    // The fixture lock is preserved (NOT released by the failed call).
    const lockStillExists = await fs
      .access(paths.lockDir)
      .then(() => true)
      .catch(() => false);
    expect(lockStillExists).toBe(true);
  });
});

// ─── 11.11: args parser error ────────────────────────────────────────────

describe("runVerifyAndAdvance — args parser error", () => {
  it("returns exit 2 + halt with parser hint when --run-id is missing", async () => {
    const result = await runVerifyAndAdvance({
      argv: ["--tokens-in", "100", "--tokens-out", "200"],
      // Other paths irrelevant — args parsing fails before lock acquire.
    });

    expect(result.exitCode).toBe(2);
    expect(result.action.action).toBe("halt");
    if (result.action.action !== "halt") return;
    expect(result.action.message).toContain("--run-id");
    expect(result.action.exitCode).toBe(2);
  });
});

// ─── 11.12: AR9 schema validation ────────────────────────────────────────

describe("runVerifyAndAdvance — AR9 schema validation (round-trip)", () => {
  it("happy-path action validates against DispatchActionV1Schema", async () => {
    const paths = await seedFixture({
      runId: "ar9-1",
      stepName: "bmad-dev-story",
      epic: 1,
      story: "1.0",
    });

    const result = await runVerifyAndAdvance({
      argv: ["--run-id", "ar9-1", "--tokens-in", "10", "--tokens-out", "20"],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-01T08:00:00.000Z",
    });

    // Round-trip via JSON.stringify + parse + schema.parse.
    const roundTripped = JSON.parse(JSON.stringify(result.action));
    const validated = DispatchActionV1Schema.parse(roundTripped);
    expect(validated.action).toBe("report");
    if (validated.action !== "report") return;
    expect(validated.exitCode).toBe(0);
  });

  it("halt action validates against DispatchActionV1Schema", async () => {
    const result = await runVerifyAndAdvance({
      argv: [], // empty → MISSING_REQUIRED → halt
    });
    const roundTripped = JSON.parse(JSON.stringify(result.action));
    const validated = DispatchActionV1Schema.parse(roundTripped);
    expect(validated.action).toBe("halt");
    if (validated.action !== "halt") return;
    expect(validated.exitCode).toBeGreaterThanOrEqual(1);
  });
});

// ─── 11.13: AR41 boundary check ──────────────────────────────────────────

describe("runVerifyAndAdvance — AR41 boundary + NFR-S1 no-network", () => {
  it("source file does not import forbidden node:* modules or network APIs", async () => {
    const source = await Bun.file(
      path.join(import.meta.dir, "verify-and-advance.ts"),
    ).text();
    // AR41 top-tier: no node:child_process / net / http / https.
    expect(source.includes('from "node:child_process"')).toBe(false);
    expect(source.includes('from "node:net"')).toBe(false);
    expect(source.includes('from "node:http"')).toBe(false);
    expect(source.includes('from "node:https"')).toBe(false);
    // NFR-S1: no fetch / Bun.fetch / network APIs.
    expect(source.includes("fetch(")).toBe(false);
    expect(source.includes("Bun.fetch")).toBe(false);
  });
});

// ─── Helper-function tests ───────────────────────────────────────────────

describe("derivePhaseFromStep helper", () => {
  it("maps planning-phase steps to 'planning'", () => {
    expect(derivePhaseFromStep("bmad-create-prd")).toBe("planning");
    expect(derivePhaseFromStep("bmad-create-architecture")).toBe("planning");
    expect(derivePhaseFromStep("bmad-research")).toBe("planning");
    expect(derivePhaseFromStep("bmad-create-ux-design")).toBe("planning");
    expect(derivePhaseFromStep("bmad-brainstorming")).toBe("planning");
  });

  it("maps implementation/retro/unknown steps to 'implementation'", () => {
    expect(derivePhaseFromStep("bmad-dev-story")).toBe("implementation");
    expect(derivePhaseFromStep("bmad-create-story")).toBe("implementation");
    expect(derivePhaseFromStep("bmad-code-review")).toBe("implementation");
    expect(derivePhaseFromStep("bmad-retrospective")).toBe("implementation");
    expect(derivePhaseFromStep("unknown-step")).toBe("implementation");
  });
});

describe("compareStateHashes helper (Story 2.6 v0.1 Option A)", () => {
  it("returns match=true when current state's lastSuccessfulStep matches dispatch-spec (epic, story)", () => {
    const state = {
      schemaVersion: 1 as const,
      project: { name: "x", bmadVersion: "6.5.0" },
      lastSuccessfulStep: {
        step: "bmad-create-prd",
        epic: 1,
        story: "1.0",
        completedAt: "2026-04-29T10:00:00Z",
      },
      checkpoints: [],
      runHistory: [],
    };
    const spec: DispatchSpecV1 = {
      schemaVersion: 1,
      runId: "x",
      step: "bmad-create-architecture",
      epic: 1,
      story: "1.0",
      model: "sonnet",
      budget: { contextTokens: 60_000, timeoutMs: 300_000 },
      taskSpec: {
        persona: "dev",
        context: [],
        task: "x",
        outputFormat: {},
        successCriteria: [],
        constraints: {},
      },
    };
    const result = compareStateHashes(state, spec);
    expect(result.match).toBe(true);
    expect(result.currentEpicStory).toEqual({ epic: 1, story: "1.0" });
    expect(result.dispatchEpicStory).toEqual({ epic: 1, story: "1.0" });
  });

  it("returns match=false when state advanced past dispatch-spec (TOCTOU)", () => {
    const state = {
      schemaVersion: 1 as const,
      project: { name: "x", bmadVersion: "6.5.0" },
      lastSuccessfulStep: {
        step: "bmad-dev-story",
        epic: 2,
        story: "2.0",
        completedAt: "2026-04-29T10:00:00Z",
      },
      checkpoints: [],
      runHistory: [],
    };
    const spec: DispatchSpecV1 = {
      schemaVersion: 1,
      runId: "x",
      step: "bmad-dev-story",
      epic: 1,
      story: "1.0",
      model: "sonnet",
      budget: { contextTokens: 60_000, timeoutMs: 300_000 },
      taskSpec: {
        persona: "dev",
        context: [],
        task: "x",
        outputFormat: {},
        successCriteria: [],
        constraints: {},
      },
    };
    const result = compareStateHashes(state, spec);
    expect(result.match).toBe(false);
  });

  it("uses lastAttempted when present (overrides lastSuccessfulStep for the projection)", () => {
    const state = {
      schemaVersion: 1 as const,
      project: { name: "x", bmadVersion: "6.5.0" },
      lastSuccessfulStep: {
        step: "bmad-create-prd",
        epic: 1,
        story: "1.0",
        completedAt: "2026-04-29T10:00:00Z",
      },
      lastAttempted: {
        step: "bmad-dev-story",
        epic: 3,
        story: "3.5",
        attemptedAt: "2026-04-29T11:00:00Z",
      },
      checkpoints: [],
      runHistory: [],
    };
    const spec: DispatchSpecV1 = {
      schemaVersion: 1,
      runId: "x",
      step: "bmad-dev-story",
      epic: 3,
      story: "3.5",
      model: "sonnet",
      budget: { contextTokens: 60_000, timeoutMs: 300_000 },
      taskSpec: {
        persona: "dev",
        context: [],
        task: "x",
        outputFormat: {},
        successCriteria: [],
        constraints: {},
      },
    };
    const result = compareStateHashes(state, spec);
    expect(result.match).toBe(true);
    expect(result.currentEpicStory).toEqual({ epic: 3, story: "3.5" });
  });

  it("defaults to (epic: 0, story: '0.0') when state has neither lastAttempted nor lastSuccessfulStep", () => {
    const state = {
      schemaVersion: 1 as const,
      project: { name: "x", bmadVersion: "6.5.0" },
      checkpoints: [],
      runHistory: [],
    };
    const spec: DispatchSpecV1 = {
      schemaVersion: 1,
      runId: "x",
      step: "bmad-create-prd",
      epic: 0,
      story: "0.0",
      model: "sonnet",
      budget: { contextTokens: 60_000, timeoutMs: 300_000 },
      taskSpec: {
        persona: "dev",
        context: [],
        task: "x",
        outputFormat: {},
        successCriteria: [],
        constraints: {},
      },
    };
    const result = compareStateHashes(state, spec);
    expect(result.match).toBe(true);
    expect(result.currentEpicStory).toEqual({ epic: 0, story: "0.0" });
  });
});

// ─── Malformed dispatch-spec test ────────────────────────────────────────

describe("runVerifyAndAdvance — malformed dispatch-spec", () => {
  it("returns exit 2 + halt with ConfigError hint when dispatch-spec is missing", async () => {
    // Seed state but NOT staging/dispatch-spec.
    const paths = fixturePaths();
    await Bun.write(
      paths.statePath,
      Bun.YAML.stringify({
        schemaVersion: 1,
        project: { name: "stepper-test", bmadVersion: "6.5.0" },
        runHistory: [],
        checkpoints: [],
      }),
    );

    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "missing-spec",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-01T08:00:00.000Z",
    });

    expect(result.exitCode).toBe(2);
    expect(result.action.action).toBe("halt");
    if (result.action.action !== "halt") return;
    // ConfigError default registry hint.
    expect(result.action.exitCode).toBe(2);

    // Lock released in finally.
    let lockExists = true;
    try {
      await fs.access(paths.lockDir);
    } catch {
      lockExists = false;
    }
    expect(lockExists).toBe(false);
  });

  it("returns exit 2 + halt when dispatch-spec is malformed JSON", async () => {
    const paths = fixturePaths();
    await Bun.write(
      paths.statePath,
      Bun.YAML.stringify({
        schemaVersion: 1,
        project: { name: "stepper-test", bmadVersion: "6.5.0" },
        runHistory: [],
        checkpoints: [],
      }),
    );
    const stagingDir = path.join(paths.stagingRoot, "bad-json");
    await fs.mkdir(stagingDir, { recursive: true });
    await Bun.write(
      path.join(stagingDir, "dispatch-spec.json"),
      "{not valid json",
    );

    const result = await runVerifyAndAdvance({
      argv: ["--run-id", "bad-json", "--tokens-in", "0", "--tokens-out", "0"],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-01T08:00:00.000Z",
    });

    expect(result.exitCode).toBe(2);
    expect(result.action.action).toBe("halt");
  });
});

// ─── Story 3.1: lastAttempted + lastFailureReason on halt ────────────────

/**
 * Story 3.1 test surface — verifies the canonical halt-path state-save
 * mutations:
 *   - AC-1: state.lastAttempted populated from --last-attempted-json + state
 *           .lastFailureReason populated from the thrown StepperError.
 *   - AC-2: state.lastSuccessfulStep is unchanged (preserves stateBefore).
 *   - AC-3: success path clears all three fields (lastSuccessfulStep advances,
 *           lastAttempted=null, lastFailureReason=null).
 *
 * Halt code coverage at the colocated tier (the integration tier in
 * src/integration/halt-records-state.test.ts covers the 5-code matrix at AC
 * line 736). Here we exercise the most natural reproducible halt — STATE_
 * CHANGED_DURING_DISPATCH — which originates entirely inside verify-and-
 * advance.ts's catch block.
 */

const STORY_3_1_LAST_ATTEMPTED_JSON = JSON.stringify({
  step: "bmad-dev-story",
  epic: 1,
  story: "1.0",
  attemptedAt: "2026-05-01T07:30:00Z",
});

describe("runVerifyAndAdvance — Story 3.1 lastAttempted + lastFailureReason on halt", () => {
  it("STATE_CHANGED_DURING_DISPATCH halt records lastAttempted (from --last-attempted-json) + lastFailureReason", async () => {
    const paths = await seedFixture({
      runId: "s3-1-toctou",
      stepName: "bmad-dev-story",
      epic: 1,
      story: "1.0",
      stateOverride: {
        schemaVersion: 1,
        project: { name: "stepper-test", bmadVersion: "6.5.0" },
        lastSuccessfulStep: {
          step: "bmad-create-architecture",
          epic: 2,
          story: "2.0",
          completedAt: "2026-04-30T10:00:00Z",
        },
        lastAttempted: null,
        lastFailureReason: null,
        runHistory: [],
        checkpoints: [],
      },
    });

    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "s3-1-toctou",
        "--tokens-in",
        "100",
        "--tokens-out",
        "200",
        "--last-attempted-json",
        STORY_3_1_LAST_ATTEMPTED_JSON,
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-01T08:00:00.000Z",
    });

    expect(result.exitCode).toBe(1);
    expect(result.action.action).toBe("halt");

    const updated = Bun.YAML.parse(
      await Bun.file(paths.statePath).text(),
    ) as Record<string, unknown>;

    // AC-1: lastAttempted matches the forwarded payload.
    const lastAttempted = updated.lastAttempted as
      | { step: string; epic: number; story: string; attemptedAt: string }
      | null
      | undefined;
    expect(lastAttempted?.step).toBe("bmad-dev-story");
    expect(lastAttempted?.epic).toBe(1);
    expect(lastAttempted?.story).toBe("1.0");
    expect(lastAttempted?.attemptedAt).toBe("2026-05-01T07:30:00Z");

    // AC-1: lastFailureReason reflects the thrown StepperError.
    const failureReason = updated.lastFailureReason as
      | { code: string; message: string; hint: string; runId: string }
      | null
      | undefined;
    expect(failureReason?.code).toBe("STATE_CHANGED_DURING_DISPATCH");
    expect(failureReason?.runId).toBe("s3-1-toctou");
    // Hint is the canonical StateChangedDuringDispatchError.actionableHint
    // (cross-validated with the AR9 halt action's `message` field below).
    expect(failureReason?.hint).toContain("--diff-state");
    expect(failureReason?.hint).toContain("--resume");

    // AC-2: lastSuccessfulStep is UNCHANGED (preserves stateBefore).
    const lastSuccess = updated.lastSuccessfulStep as
      | { step: string; epic: number; story: string }
      | undefined;
    expect(lastSuccess?.step).toBe("bmad-create-architecture");
    expect(lastSuccess?.epic).toBe(2);
    expect(lastSuccess?.story).toBe("2.0");

    // Cross-validation: the AR9 halt action's `message` matches
    // lastFailureReason.hint (both come from err.actionableHint).
    if (result.action.action !== "halt") return;
    expect(result.action.message).toBe(failureReason?.hint as string);
  });

  it("VERIFIER_FAILURE halt records lastAttempted + lastFailureReason (verifier rejects artifact)", async () => {
    // Seed dispatch-spec for an artifact that will fail the verifier.
    // Use the dev-story step name. The seedFixture by default writes a
    // MINIMAL artifact at outputs/<step>.md; we need to make the verifier
    // fail. Strategy: remove the artifact so promote() fails (the verifier
    // chain's required-files check is not in the default config for
    // bmad-dev-story; promote() will raise because the source artifact is
    // missing — this manifests as a VerifierFailureError-equivalent halt).
    const paths = await seedFixture({
      runId: "s3-1-vf",
      stepName: "bmad-dev-story",
      epic: 1,
      story: "1.0",
      seedArtifact: false,
    });

    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "s3-1-vf",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
        "--last-attempted-json",
        STORY_3_1_LAST_ATTEMPTED_JSON,
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-01T08:00:00.000Z",
    });

    expect(result.exitCode).toBe(1);
    expect(result.action.action).toBe("halt");

    const updated = Bun.YAML.parse(
      await Bun.file(paths.statePath).text(),
    ) as Record<string, unknown>;

    const lastAttempted = updated.lastAttempted as
      | { step: string; epic: number; story: string }
      | null
      | undefined;
    expect(lastAttempted?.step).toBe("bmad-dev-story");
    expect(lastAttempted?.epic).toBe(1);

    const failureReason = updated.lastFailureReason as
      | { code: string; runId: string }
      | null
      | undefined;
    // The thrown error type may be VerifierFailureError or another
    // StepperError depending on whether promote() or the verifier is the
    // first to surface the missing artifact. Both produce a
    // lastFailureReason record per Story 3.1.
    expect(failureReason).toBeDefined();
    expect(failureReason?.runId).toBe("s3-1-vf");
    expect(typeof failureReason?.code).toBe("string");
  });

  it("Halt without --last-attempted-json sets state.lastAttempted to null", async () => {
    const paths = await seedFixture({
      runId: "s3-1-no-la",
      stepName: "bmad-dev-story",
      epic: 1,
      story: "1.0",
      stateOverride: {
        schemaVersion: 1,
        project: { name: "stepper-test", bmadVersion: "6.5.0" },
        lastSuccessfulStep: {
          step: "bmad-create-architecture",
          epic: 2,
          story: "2.0",
          completedAt: "2026-04-30T10:00:00Z",
        },
        runHistory: [],
        checkpoints: [],
      },
    });

    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "s3-1-no-la",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
        // NO --last-attempted-json
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-01T08:00:00.000Z",
    });

    expect(result.exitCode).toBe(1);
    const updated = Bun.YAML.parse(
      await Bun.file(paths.statePath).text(),
    ) as Record<string, unknown>;
    expect(updated.lastAttempted).toBeNull();
    // lastFailureReason is still set despite the absent flag (graceful
    // degradation per Story 3.1 design decision).
    const failureReason = updated.lastFailureReason as
      | { code: string }
      | null
      | undefined;
    expect(failureReason).toBeDefined();
    expect(typeof failureReason?.code).toBe("string");
  });

  it("Success path clears lastAttempted AND lastFailureReason (Story 3.1 AC-3)", async () => {
    // Seed state with prior failure context that should be CLEARED on
    // successful step completion.
    const paths = await seedFixture({
      runId: "s3-1-success",
      stepName: "bmad-dev-story",
      epic: 1,
      story: "1.0",
      stateOverride: {
        schemaVersion: 1,
        project: { name: "stepper-test", bmadVersion: "6.5.0" },
        lastSuccessfulStep: {
          step: "bmad-create-prd",
          epic: 1,
          story: "1.0",
          completedAt: "2026-04-29T10:00:00Z",
        },
        // Prior halt context — should be wiped after this run.
        lastAttempted: {
          step: "bmad-dev-story",
          epic: 1,
          story: "1.0",
          attemptedAt: "2026-04-30T11:00:00Z",
        },
        lastFailureReason: {
          code: "VERIFIER_FAILURE",
          message: "stale failure forensics",
          hint: "Run /bmad-next --resume to retry.",
          runId: "old-run",
        },
        runHistory: [],
        checkpoints: [],
      },
    });

    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "s3-1-success",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
        "--last-attempted-json",
        STORY_3_1_LAST_ATTEMPTED_JSON,
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-01T08:00:00.000Z",
    });

    expect(result.exitCode).toBe(0);
    const updated = Bun.YAML.parse(
      await Bun.file(paths.statePath).text(),
    ) as Record<string, unknown>;
    // Success path: lastSuccessfulStep advances; lastAttempted clears; lastFailureReason clears.
    const lastSuccess = updated.lastSuccessfulStep as
      | { step: string }
      | undefined;
    expect(lastSuccess?.step).toBe("bmad-dev-story");
    expect(updated.lastAttempted).toBeNull();
    expect(updated.lastFailureReason).toBeNull();
  });

  it("Lock-contention halt does NOT write state.yaml (handle undefined guard)", async () => {
    // Re-use the lock-contention pattern from the existing 11.10 test —
    // mock detection ensures we skip when the lock module is mocked by a
    // sibling test file (Story 2.4 run.test.ts uses mock.module).
    const lockMod = await import("../../lock/lock.ts");
    const isReal = typeof lockMod.LOCK_DIR_REL === "string";
    const probe = await lockMod.acquire({
      lockDir: path.join(tmp, "probe-lock-3-1"),
    });
    const probeHandleIsReal = typeof probe.release === "function";
    if (probeHandleIsReal) await probe.release();
    if (!isReal || !probeHandleIsReal) {
      return;
    }

    const paths = await seedFixture({
      runId: "s3-1-lc",
      stepName: "bmad-dev-story",
      epic: 1,
      story: "1.0",
    });

    // Snapshot state.yaml byte content BEFORE.
    const stateBefore = await Bun.file(paths.statePath).text();

    // Simulate alien holder.
    await fs.mkdir(paths.lockDir, { recursive: true });
    const alienPid = process.pid + 1;
    await Bun.write(
      path.join(paths.lockDir, "pid"),
      JSON.stringify(
        {
          pid: alienPid,
          hostname: os.hostname(),
          acquiredAt: new Date().toISOString(),
          heartbeatIntervalMs: 5000,
        },
        null,
        2,
      ),
    );

    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "s3-1-lc",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
        "--last-attempted-json",
        STORY_3_1_LAST_ATTEMPTED_JSON,
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: {
        lockDir: paths.lockDir,
        isPidAlive: (pid) => pid === alienPid,
        staleThresholdMs: 600_000,
        staleThresholdFallbackMs: 600_000,
      },
      nowIso: "2026-05-01T08:00:00.000Z",
    });

    expect(result.exitCode).toBe(4);
    // state.yaml byte-identical (handle === undefined → no save).
    const stateAfter = await Bun.file(paths.statePath).text();
    expect(stateAfter).toBe(stateBefore);
  });

  it("CorruptStateError halt does NOT write state.yaml (stateBefore undefined guard)", async () => {
    const paths = fixturePaths();
    // state.yaml is empty (size 0) → CorruptStateError on load.
    await Bun.write(paths.statePath, "");

    // Seed dispatch-spec so the run reaches loadStateUnlocked (which throws).
    const stagingDir = path.join(paths.stagingRoot, "s3-1-cs");
    await fs.mkdir(stagingDir, { recursive: true });
    const dispatchSpec: DispatchSpecV1 = {
      schemaVersion: 1,
      runId: "s3-1-cs",
      step: "bmad-dev-story",
      epic: 1,
      story: "1.0",
      model: "sonnet",
      budget: { contextTokens: 60_000, timeoutMs: 300_000 },
      taskSpec: {
        persona: "dev",
        context: [],
        task: "x",
        outputFormat: { fileLocation: "x", requiredSections: [] },
        successCriteria: ["x"],
        constraints: { allowedTools: ["Read"], scopeLimits: "x" },
      },
    };
    await Bun.write(
      path.join(stagingDir, "dispatch-spec.json"),
      JSON.stringify(dispatchSpec, null, 2),
    );

    const result = await runVerifyAndAdvance({
      argv: ["--run-id", "s3-1-cs", "--tokens-in", "0", "--tokens-out", "0"],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-01T08:00:00.000Z",
    });

    expect(result.exitCode).toBe(1);
    expect(result.action.action).toBe("halt");
    // state.yaml is still 0 bytes (no save took place — stateBefore was
    // undefined when the catch block fired).
    const stateText = await Bun.file(paths.statePath).text();
    expect(stateText).toBe("");
  });

  it("StepperError.actionableHint is the canonical lastFailureReason.hint source-of-truth (cross-validation)", async () => {
    const paths = await seedFixture({
      runId: "s3-1-xv",
      stepName: "bmad-dev-story",
      epic: 1,
      story: "1.0",
      stateOverride: {
        schemaVersion: 1,
        project: { name: "stepper-test", bmadVersion: "6.5.0" },
        lastSuccessfulStep: {
          step: "bmad-create-architecture",
          epic: 5,
          story: "5.5",
          completedAt: "2026-04-30T10:00:00Z",
        },
        runHistory: [],
        checkpoints: [],
      },
    });

    const result = await runVerifyAndAdvance({
      argv: ["--run-id", "s3-1-xv", "--tokens-in", "0", "--tokens-out", "0"],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-01T08:00:00.000Z",
    });

    expect(result.action.action).toBe("halt");
    if (result.action.action !== "halt") return;
    const updated = Bun.YAML.parse(
      await Bun.file(paths.statePath).text(),
    ) as Record<string, unknown>;
    const failureReason = updated.lastFailureReason as
      | { hint: string }
      | undefined;
    expect(failureReason?.hint).toBeDefined();
    expect(result.action.message).toBe(failureReason?.hint as string);
  });

  it("state.yaml after halt is re-loadable via StateLatestSchema (no schema regression)", async () => {
    const paths = await seedFixture({
      runId: "s3-1-rl",
      stepName: "bmad-dev-story",
      epic: 1,
      story: "1.0",
      stateOverride: {
        schemaVersion: 1,
        project: { name: "stepper-test", bmadVersion: "6.5.0" },
        lastSuccessfulStep: {
          step: "bmad-create-architecture",
          epic: 7,
          story: "7.0",
          completedAt: "2026-04-30T10:00:00Z",
        },
        runHistory: [],
        checkpoints: [],
      },
    });

    await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "s3-1-rl",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
        "--last-attempted-json",
        STORY_3_1_LAST_ATTEMPTED_JSON,
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-01T08:00:00.000Z",
    });

    // Re-load the state via the same schema the production code uses.
    const { StateLatestSchema } = await import("../../schemas/state.ts");
    const raw = Bun.YAML.parse(await Bun.file(paths.statePath).text());
    const validated = StateLatestSchema.parse(raw);
    expect(validated.lastAttempted?.step).toBe("bmad-dev-story");
    expect(validated.lastFailureReason?.code).toBeDefined();
    expect(validated.lastSuccessfulStep?.epic).toBe(7);
  });
});

// ─── Story 4.8 — matchCheckpointPhase (pure-function unit tests) ──────────

describe("matchCheckpointPhase (Story 4.8 — pure-function lookup)", () => {
  function makeDag(stepName: string, phase: Phase): DagAdjacency {
    const node: DagNode = {
      name: stepName,
      phase,
      after: [],
      before: [],
      optional: false,
      persona: "dev",
    };
    const nodes = new Map<string, DagNode>();
    nodes.set(stepName, node);
    return {
      nodes,
      edgesOut: new Map(),
      edgesIn: new Map(),
    };
  }

  it("returns null when checkpointEach is undefined (no flag supplied)", () => {
    const result = matchCheckpointPhase(
      "bmad-dev-story",
      makeDag("bmad-dev-story", "implementation"),
      undefined,
    );
    expect(result).toBeNull();
  });

  it("returns the matched phase when DAG node phase === checkpointEach", () => {
    const result = matchCheckpointPhase(
      "bmad-dev-story",
      makeDag("bmad-dev-story", "implementation"),
      "implementation",
    );
    expect(result).toBe("implementation");
  });

  it("returns null when DAG node phase !== checkpointEach (mismatch)", () => {
    const result = matchCheckpointPhase(
      "bmad-dev-story",
      makeDag("bmad-dev-story", "analysis"),
      "implementation",
    );
    expect(result).toBeNull();
  });

  it("returns null when DAG does not contain the step name", () => {
    const result = matchCheckpointPhase(
      "unknown-step",
      makeDag("bmad-dev-story", "implementation"),
      "implementation",
    );
    expect(result).toBeNull();
  });

  it("falls back to derivePhaseFromStep when DAG is undefined (planning step)", () => {
    // bmad-create-prd is in PLANNING_STEPS lookup table.
    const result = matchCheckpointPhase(
      "bmad-create-prd",
      undefined,
      "planning",
    );
    expect(result).toBe("planning");
  });

  it("falls back to derivePhaseFromStep when DAG is undefined (implementation step)", () => {
    // bmad-dev-story is NOT in PLANNING_STEPS, so derived = "implementation".
    const result = matchCheckpointPhase(
      "bmad-dev-story",
      undefined,
      "implementation",
    );
    expect(result).toBe("implementation");
  });

  it("returns null when fallback derivePhaseFromStep mismatches checkpointEach", () => {
    const result = matchCheckpointPhase(
      "bmad-dev-story",
      undefined,
      "analysis",
    );
    expect(result).toBeNull();
  });
});

// ─── Story 4.8 — checkpoint-append integration tests ──────────────────────

describe("runVerifyAndAdvance — Story 4.8 checkpoint-append (CV_48_1-6)", () => {
  it("CV_48_1: opts.checkpointEach === undefined → ZERO checkpoints written", async () => {
    const paths = await seedFixture({
      runId: "cv48-1",
      stepName: "bmad-dev-story",
      epic: 1,
      story: "1.1",
    });

    const result = await runVerifyAndAdvance({
      argv: ["--run-id", "cv48-1", "--tokens-in", "0", "--tokens-out", "0"],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-01T08:00:00.000Z",
      // No checkpointEach supplied.
    });

    expect(result.exitCode).toBe(0);
    const updated = Bun.YAML.parse(
      await Bun.file(paths.statePath).text(),
    ) as Record<string, unknown>;
    const checkpoints = updated.checkpoints as Array<unknown>;
    expect(checkpoints).toEqual([]);
  });

  it("CV_48_2: opts.checkpointEach matches phase + tmpdir is git-init → ONE checkpoint written", async () => {
    const paths = await seedFixture({
      runId: "cv48-2",
      stepName: "bmad-dev-story",
      epic: 1,
      story: "1.1",
    });

    // Initialize a Git work-tree at the cwd of the verify-and-advance run.
    // We cannot inject cwd into detectSnapshot, so we initialize at the
    // process cwd's tmp instead — Story 1.8 detectSnapshot defaults to
    // process.cwd(); for this test we initialize Git at process.cwd() if
    // not already a Git repo. Since this project IS a Git repo (the
    // bmad-stepper repo), detectSnapshot should succeed.
    const { runVerifyAndAdvance: runVA } = await import(
      "./verify-and-advance.ts"
    );

    const result = await runVA({
      argv: ["--run-id", "cv48-2", "--tokens-in", "0", "--tokens-out", "0"],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-01T08:00:00.000Z",
      checkpointEach: "implementation",
    });

    expect(result.exitCode).toBe(0);
    const updated = Bun.YAML.parse(
      await Bun.file(paths.statePath).text(),
    ) as Record<string, unknown>;
    const checkpoints = updated.checkpoints as Array<{
      branch: string;
      sha: string;
      takenAt: string;
      stepType: string;
    }>;
    // The bmad-stepper repo is a Git work-tree, so detectSnapshot returns
    // a non-null Snapshot. The bmad-dev-story step is "implementation"
    // per derivePhaseFromStep fallback (NOT in PLANNING_STEPS).
    expect(checkpoints.length).toBe(1);
    expect(checkpoints[0]?.stepType).toBe("implementation");
    expect(typeof checkpoints[0]?.branch).toBe("string");
    expect(typeof checkpoints[0]?.sha).toBe("string");
    expect(typeof checkpoints[0]?.takenAt).toBe("string");
  });

  it("CV_48_3: opts.checkpointEach mismatches phase → ZERO checkpoints written", async () => {
    const paths = await seedFixture({
      runId: "cv48-3",
      stepName: "bmad-dev-story", // implementation per fallback
      epic: 1,
      story: "1.1",
    });

    const result = await runVerifyAndAdvance({
      argv: ["--run-id", "cv48-3", "--tokens-in", "0", "--tokens-out", "0"],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-01T08:00:00.000Z",
      checkpointEach: "analysis", // mismatch — bmad-dev-story is implementation
    });

    expect(result.exitCode).toBe(0);
    const updated = Bun.YAML.parse(
      await Bun.file(paths.statePath).text(),
    ) as Record<string, unknown>;
    const checkpoints = updated.checkpoints as Array<unknown>;
    expect(checkpoints).toEqual([]);
  });

  it("CV_48_4: FIFO-50 trim — pre-state at 50 entries → post-state at 50 entries (oldest evicted)", async () => {
    const oldestEntry = {
      branch: "main",
      sha: "0000000000000000000000000000000000000000",
      takenAt: "2025-01-01T00:00:00Z",
      stepType: "implementation" as const,
    };
    const fillEntry = {
      branch: "main",
      sha: "1111111111111111111111111111111111111111",
      takenAt: "2025-06-01T00:00:00Z",
      stepType: "implementation" as const,
    };
    const checkpoints50: Array<typeof fillEntry> = [
      oldestEntry,
      ...new Array(49).fill(fillEntry),
    ];

    const paths = await seedFixture({
      runId: "cv48-4",
      stepName: "bmad-dev-story",
      epic: 1,
      story: "1.1",
      stateOverride: {
        schemaVersion: 1,
        project: { name: "stepper-test", bmadVersion: "6.5.0" },
        lastSuccessfulStep: {
          step: "bmad-create-prd",
          epic: 1,
          story: "1.1",
          completedAt: "2026-04-29T10:00:00Z",
        },
        runHistory: [],
        checkpoints: checkpoints50,
      },
    });

    const result = await runVerifyAndAdvance({
      argv: ["--run-id", "cv48-4", "--tokens-in", "0", "--tokens-out", "0"],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-01T08:00:00.000Z",
      checkpointEach: "implementation",
    });

    expect(result.exitCode).toBe(0);
    const updated = Bun.YAML.parse(
      await Bun.file(paths.statePath).text(),
    ) as Record<string, unknown>;
    const checkpoints = updated.checkpoints as Array<{
      sha: string;
      stepType: string;
    }>;
    expect(checkpoints.length).toBe(50);
    // Oldest entry (sha 000...) is evicted; first remaining entry should
    // be a "fill" entry (sha 111...).
    expect(checkpoints[0]?.sha).toBe(
      "1111111111111111111111111111111111111111",
    );
    // Last entry should be the new one (NOT 000... and NOT 111...).
    const lastEntry = checkpoints[checkpoints.length - 1];
    expect(lastEntry?.stepType).toBe("implementation");
  });

  it("CV_48_5: opts.checkpointEach with DAG injection (matched implementation phase) → ONE checkpoint", async () => {
    const paths = await seedFixture({
      runId: "cv48-5",
      stepName: "bmad-dev-story",
      epic: 1,
      story: "1.1",
    });

    const dagNode: DagNode = {
      name: "bmad-dev-story",
      phase: "implementation",
      after: [],
      before: [],
      optional: false,
      persona: "dev",
    };
    const dag: DagAdjacency = {
      nodes: new Map([["bmad-dev-story", dagNode]]),
      edgesOut: new Map(),
      edgesIn: new Map(),
    };

    const result = await runVerifyAndAdvance({
      argv: ["--run-id", "cv48-5", "--tokens-in", "0", "--tokens-out", "0"],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-01T08:00:00.000Z",
      checkpointEach: "implementation",
      dag,
    });

    expect(result.exitCode).toBe(0);
    const updated = Bun.YAML.parse(
      await Bun.file(paths.statePath).text(),
    ) as Record<string, unknown>;
    const checkpoints = updated.checkpoints as Array<{ stepType: string }>;
    expect(checkpoints.length).toBe(1);
    expect(checkpoints[0]?.stepType).toBe("implementation");
  });

  it("CV_48_6: DAG-injected node phase mismatch → ZERO checkpoints written", async () => {
    const paths = await seedFixture({
      runId: "cv48-6",
      stepName: "bmad-dev-story",
      epic: 1,
      story: "1.1",
    });

    const dagNode: DagNode = {
      name: "bmad-dev-story",
      phase: "analysis", // declared as analysis (override)
      after: [],
      before: [],
      optional: false,
      persona: "dev",
    };
    const dag: DagAdjacency = {
      nodes: new Map([["bmad-dev-story", dagNode]]),
      edgesOut: new Map(),
      edgesIn: new Map(),
    };

    const result = await runVerifyAndAdvance({
      argv: ["--run-id", "cv48-6", "--tokens-in", "0", "--tokens-out", "0"],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-01T08:00:00.000Z",
      checkpointEach: "implementation", // mismatch with DAG declaration
      dag,
    });

    expect(result.exitCode).toBe(0);
    const updated = Bun.YAML.parse(
      await Bun.file(paths.statePath).text(),
    ) as Record<string, unknown>;
    const checkpoints = updated.checkpoints as Array<unknown>;
    expect(checkpoints).toEqual([]);
  });
});

// ─── Story 5.1 — Retry failure mode (RT_51_VA_*) ──────────────────────────

describe("runVerifyAndAdvance — Story 5.1 retry-policy integration (RT_51_VA_*)", () => {
  /**
   * Build a verifier stub that returns the supplied sequence of statuses
   * on each call. Beyond the sequence, returns "pass" (defensive).
   */
  function sequencedVerifier(
    statuses: ReadonlyArray<"pass" | "fail" | "skip">,
  ) {
    let callCount = 0;
    const calls: number[] = [];
    const stub = async (
      _runId: string,
      _opts: { stepName: string; stagingRoot: string },
    ) => {
      const idx = callCount;
      callCount++;
      calls.push(callCount);
      const status = statuses[idx] ?? "pass";
      return {
        schemaVersion: 1 as const,
        status,
        checks: [],
        promotedTo: null,
        resultPath: "/tmp/test-verifier-result.json",
      };
    };
    return { stub, getCallCount: () => callCount, calls };
  }

  it("RT_51_VA_1: retry policy + verifier passes on attempt 1 → ONE runHistory entry (outcome: pass, attemptNumber: 1)", async () => {
    const paths = await seedFixture({
      runId: "rt-51-va-1",
      stepName: "bmad-dev-story",
      epic: 5,
      story: "5.1",
    });
    const { stub, getCallCount } = sequencedVerifier(["pass"]);

    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "rt-51-va-1",
        "--tokens-in",
        "10",
        "--tokens-out",
        "20",
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-04T20:00:00.000Z",
      failurePolicyOverride: "retry",
      maxRetriesOverride: 2,
      verifierOverride: stub,
    });

    expect(result.exitCode).toBe(0);
    expect(getCallCount()).toBe(1);
    const updated = Bun.YAML.parse(await Bun.file(paths.statePath).text()) as {
      runHistory: Array<Record<string, unknown>>;
    };
    expect(updated.runHistory).toHaveLength(1);
    expect(updated.runHistory[0]?.attemptNumber).toBe(1);
    expect(updated.runHistory[0]?.outcome).toBe("pass");
  });

  it("RT_51_VA_2: retry policy + fail attempt 1, pass attempt 2 → TWO runHistory entries (fail, pass)", async () => {
    const paths = await seedFixture({
      runId: "rt-51-va-2",
      stepName: "bmad-dev-story",
      epic: 5,
      story: "5.1",
    });
    const { stub, getCallCount } = sequencedVerifier(["fail", "pass"]);
    let reDispatchCallCount = 0;

    const result = await runVerifyAndAdvance({
      argv: ["--run-id", "rt-51-va-2", "--tokens-in", "0", "--tokens-out", "0"],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-04T20:00:00.000Z",
      failurePolicyOverride: "retry",
      maxRetriesOverride: 2,
      verifierOverride: stub,
      reDispatchOverride: () => {
        reDispatchCallCount++;
      },
    });

    expect(result.exitCode).toBe(0);
    expect(getCallCount()).toBe(2);
    expect(reDispatchCallCount).toBe(1);
    const updated = Bun.YAML.parse(await Bun.file(paths.statePath).text()) as {
      runHistory: Array<Record<string, unknown>>;
    };
    expect(updated.runHistory).toHaveLength(2);
    expect(updated.runHistory[0]?.attemptNumber).toBe(1);
    expect(updated.runHistory[0]?.outcome).toBe("fail");
    expect(updated.runHistory[0]?.failureCode).toBe("VERIFIER_FAILURE");
    expect(updated.runHistory[1]?.attemptNumber).toBe(2);
    expect(updated.runHistory[1]?.outcome).toBe("pass");
  });

  it("RT_51_VA_3: retry policy + all 3 attempts fail → THREE runHistory entries + escalate (VerifierFailureError)", async () => {
    const paths = await seedFixture({
      runId: "rt-51-va-3",
      stepName: "bmad-dev-story",
      epic: 5,
      story: "5.1",
    });
    const { stub, getCallCount } = sequencedVerifier(["fail", "fail", "fail"]);
    let reDispatchCallCount = 0;

    const result = await runVerifyAndAdvance({
      argv: ["--run-id", "rt-51-va-3", "--tokens-in", "0", "--tokens-out", "0"],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-04T20:00:00.000Z",
      failurePolicyOverride: "retry",
      maxRetriesOverride: 2,
      verifierOverride: stub,
      reDispatchOverride: () => {
        reDispatchCallCount++;
      },
    });

    expect(result.exitCode).toBe(1);
    expect(result.action.action).toBe("halt");
    expect(getCallCount()).toBe(3); // 1 original + 2 retries = 3 attempts
    expect(reDispatchCallCount).toBe(2); // re-dispatched between attempts 1→2 and 2→3
    const updated = Bun.YAML.parse(await Bun.file(paths.statePath).text()) as {
      runHistory: Array<Record<string, unknown>>;
      lastFailureReason: { code: string };
    };
    expect(updated.runHistory).toHaveLength(3);
    expect(updated.runHistory[0]?.attemptNumber).toBe(1);
    expect(updated.runHistory[1]?.attemptNumber).toBe(2);
    expect(updated.runHistory[2]?.attemptNumber).toBe(3);
    for (const entry of updated.runHistory) {
      expect(entry.outcome).toBe("fail");
      expect(entry.failureCode).toBe("VERIFIER_FAILURE");
    }
    expect(updated.lastFailureReason?.code).toBe("VERIFIER_FAILURE");
  });

  it("RT_51_VA_4: escalate policy + verifier fails attempt 1 → ONE runHistory entry + immediate escalate (no retry)", async () => {
    const paths = await seedFixture({
      runId: "rt-51-va-4",
      stepName: "bmad-dev-story",
      epic: 5,
      story: "5.1",
    });
    const { stub, getCallCount } = sequencedVerifier(["fail"]);
    let reDispatchCallCount = 0;

    const result = await runVerifyAndAdvance({
      argv: ["--run-id", "rt-51-va-4", "--tokens-in", "0", "--tokens-out", "0"],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-04T20:00:00.000Z",
      failurePolicyOverride: "escalate",
      maxRetriesOverride: 2,
      verifierOverride: stub,
      reDispatchOverride: () => {
        reDispatchCallCount++;
      },
    });

    expect(result.exitCode).toBe(1);
    expect(result.action.action).toBe("halt");
    expect(getCallCount()).toBe(1); // no retries attempted
    expect(reDispatchCallCount).toBe(0); // no re-dispatch
    const updated = Bun.YAML.parse(await Bun.file(paths.statePath).text()) as {
      runHistory: Array<Record<string, unknown>>;
      lastFailureReason: { code: string };
    };
    expect(updated.runHistory).toHaveLength(1);
    expect(updated.runHistory[0]?.attemptNumber).toBe(1);
    expect(updated.runHistory[0]?.outcome).toBe("fail");
    expect(updated.lastFailureReason?.code).toBe("VERIFIER_FAILURE");
  });

  it("RT_51_VA_5: maxRetriesOverride=0 + retry policy + fail → ONE runHistory entry + escalate (zero-retry config)", async () => {
    const paths = await seedFixture({
      runId: "rt-51-va-5",
      stepName: "bmad-dev-story",
      epic: 5,
      story: "5.1",
    });
    const { stub, getCallCount } = sequencedVerifier(["fail"]);

    const result = await runVerifyAndAdvance({
      argv: ["--run-id", "rt-51-va-5", "--tokens-in", "0", "--tokens-out", "0"],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-04T20:00:00.000Z",
      failurePolicyOverride: "retry",
      maxRetriesOverride: 0, // zero-retry: original attempt only
      verifierOverride: stub,
    });

    expect(result.exitCode).toBe(1);
    expect(getCallCount()).toBe(1);
    const updated = Bun.YAML.parse(await Bun.file(paths.statePath).text()) as {
      runHistory: Array<Record<string, unknown>>;
    };
    expect(updated.runHistory).toHaveLength(1);
    expect(updated.runHistory[0]?.attemptNumber).toBe(1);
    expect(updated.runHistory[0]?.outcome).toBe("fail");
  });

  it("RT_51_VA_6: maxRetriesOverride=5 + retry policy + 6 fails → SIX runHistory entries + escalate", async () => {
    const paths = await seedFixture({
      runId: "rt-51-va-6",
      stepName: "bmad-dev-story",
      epic: 5,
      story: "5.1",
    });
    const { stub, getCallCount } = sequencedVerifier([
      "fail",
      "fail",
      "fail",
      "fail",
      "fail",
      "fail",
    ]);

    const result = await runVerifyAndAdvance({
      argv: ["--run-id", "rt-51-va-6", "--tokens-in", "0", "--tokens-out", "0"],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-04T20:00:00.000Z",
      failurePolicyOverride: "retry",
      maxRetriesOverride: 5, // 5 retries → 6 total attempts
      verifierOverride: stub,
    });

    expect(result.exitCode).toBe(1);
    expect(getCallCount()).toBe(6);
    const updated = Bun.YAML.parse(await Bun.file(paths.statePath).text()) as {
      runHistory: Array<Record<string, unknown>>;
    };
    expect(updated.runHistory).toHaveLength(6);
    expect(updated.runHistory[0]?.attemptNumber).toBe(1);
    expect(updated.runHistory[5]?.attemptNumber).toBe(6);
  });

  it("RT_51_VA_7: each attempt's runHistory entry shares the SAME runId (prior attempts persist on retry)", async () => {
    const paths = await seedFixture({
      runId: "rt-51-va-7",
      stepName: "bmad-dev-story",
      epic: 5,
      story: "5.1",
    });
    const { stub } = sequencedVerifier(["fail", "fail", "fail"]);

    const result = await runVerifyAndAdvance({
      argv: ["--run-id", "rt-51-va-7", "--tokens-in", "0", "--tokens-out", "0"],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-04T20:00:00.000Z",
      failurePolicyOverride: "retry",
      maxRetriesOverride: 2,
      verifierOverride: stub,
    });

    expect(result.exitCode).toBe(1);
    const updated = Bun.YAML.parse(await Bun.file(paths.statePath).text()) as {
      runHistory: Array<Record<string, unknown>>;
    };
    expect(updated.runHistory).toHaveLength(3);
    for (const entry of updated.runHistory) {
      expect(entry.runId).toBe("rt-51-va-7");
    }
  });

  it("RT_51_VA_8: SIGINT mid-retry (shutdownRequested=true after attempt 1) → halt; runHistory has ONE fail entry; no further attempts", async () => {
    const paths = await seedFixture({
      runId: "rt-51-va-8",
      stepName: "bmad-dev-story",
      epic: 5,
      story: "5.1",
    });
    const { stub, getCallCount } = sequencedVerifier(["fail", "fail", "fail"]);
    // Trigger shutdown mid-retry — after the first attempt's fail entry
    // is appended, the retry loop polls shutdownRequested before
    // re-dispatching attempt 2.
    let shutdownPollCount = 0;
    const shutdownRequested = () => {
      shutdownPollCount++;
      return true; // simulate SIGINT received between attempt 1 and 2
    };

    const result = await runVerifyAndAdvance({
      argv: ["--run-id", "rt-51-va-8", "--tokens-in", "0", "--tokens-out", "0"],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-04T20:00:00.000Z",
      failurePolicyOverride: "retry",
      maxRetriesOverride: 2,
      verifierOverride: stub,
      shutdownRequested,
    });

    expect(result.exitCode).toBe(1);
    expect(result.action.action).toBe("halt");
    // Only attempt 1 dispatched (verifier called once); shutdown
    // short-circuits the retry loop before attempt 2.
    expect(getCallCount()).toBe(1);
    expect(shutdownPollCount).toBe(1); // polled exactly once (after attempt 1 fail)
    const updated = Bun.YAML.parse(await Bun.file(paths.statePath).text()) as {
      runHistory: Array<Record<string, unknown>>;
    };
    expect(updated.runHistory).toHaveLength(1);
    expect(updated.runHistory[0]?.attemptNumber).toBe(1);
    expect(updated.runHistory[0]?.outcome).toBe("fail");
  });
});

// ─── Story 5.2 — Skip failure mode (SK_52_VA_*) ───────────────────────────

describe("runVerifyAndAdvance — Story 5.2 skip-policy integration (SK_52_VA_*)", () => {
  /**
   * Helper: seed a state.yaml with a halted lastAttempted populated +
   * a halted lastFailureReason; the skip path operates on this state.
   * The dispatch-spec is also seeded (the skip path bypasses the read,
   * but seedFixture writes one for parity with the success-path seed).
   */
  async function seedSkipState(opts: {
    runId: string;
    skippedStep: string;
    epic: number;
    story: string;
    runHistoryEntries?: Array<Record<string, unknown>>;
  }): Promise<FixturePaths> {
    const stateOverride: Record<string, unknown> = {
      schemaVersion: 1,
      project: { name: "stepper-test", bmadVersion: "6.5.0" },
      lastSuccessfulStep: {
        step: "bmad-create-prd",
        epic: opts.epic,
        story: opts.story,
        completedAt: "2026-04-28T10:00:00Z",
      },
      lastAttempted: {
        step: opts.skippedStep,
        epic: opts.epic,
        story: opts.story,
        attemptedAt: "2026-04-29T11:00:00Z",
      },
      lastFailureReason: {
        code: "VERIFIER_FAILURE",
        message: "verifier failed; user is giving up via --skip",
        hint: "See _bmad-output/.stepper/runs/<ts>-<step>.log for the verifier output; try /bmad-next --resume after fixing the underlying issue.",
        runId: opts.runId,
      },
      runHistory: opts.runHistoryEntries ?? [],
      checkpoints: [],
    };
    return seedFixture({
      runId: opts.runId,
      stepName: opts.skippedStep,
      epic: opts.epic,
      story: opts.story,
      stateOverride,
    });
  }

  /**
   * Build a minimal DAG with the skipped step + a single successor
   * for the SK_52_VA_4 next-step resolution test.
   */
  function buildSkipDag(skippedStep: string, nextStep: string): DagAdjacency {
    const skippedNode: DagNode = {
      name: skippedStep,
      after: ["bmad-create-prd"],
      before: [nextStep],
      phase: "implementation",
      optional: false,
      persona: "dev",
    };
    const nextNode: DagNode = {
      name: nextStep,
      after: [skippedStep],
      before: [],
      phase: "implementation",
      optional: false,
      persona: "dev",
    };
    const nodes = new Map<string, DagNode>([
      [skippedStep, skippedNode],
      [nextStep, nextNode],
    ]);
    return {
      nodes,
      edgesIn: new Map<string, ReadonlySet<string>>([
        [skippedStep, new Set<string>()],
        [nextStep, new Set<string>([skippedStep])],
      ]),
      edgesOut: new Map<string, ReadonlySet<string>>([
        [skippedStep, new Set<string>([nextStep])],
        [nextStep, new Set<string>()],
      ]),
    };
  }

  it("SK_52_VA_1: skip path with matched lastAttempted.step → state mutates: runHistory entry skipped=true + lastSuccessfulStep advances + lastAttempted clears", async () => {
    const paths = await seedSkipState({
      runId: "sk-52-va-1",
      skippedStep: "bmad-dev-story",
      epic: 5,
      story: "5.2",
    });
    const dag = buildSkipDag("bmad-dev-story", "bmad-code-review");

    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "sk-52-va-1",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
        "--skip-step",
        "bmad-dev-story",
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-04T20:00:00.000Z",
      dag,
    });

    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    expect(result.action.message).toContain("SKIPPED");
    expect(result.action.message).toContain("bmad-dev-story");

    const updated = Bun.YAML.parse(await Bun.file(paths.statePath).text()) as {
      runHistory: Array<Record<string, unknown>>;
      lastSuccessfulStep: { step: string } | null;
      lastAttempted: unknown;
      lastFailureReason: unknown;
    };
    // Three simultaneous mutations per AC line 1077.
    expect(updated.runHistory).toHaveLength(1);
    expect(updated.runHistory[0]?.skipped).toBe(true);
    expect(updated.runHistory[0]?.step).toBe("bmad-dev-story");
    expect(updated.lastSuccessfulStep?.step).toBe("bmad-code-review");
    expect(updated.lastAttempted).toBeNull();
    expect(updated.lastFailureReason).toBeNull();
  });

  it("SK_52_VA_2: skip path with mismatched lastAttempted.step → ConfigError thrown with mismatch hint", async () => {
    const paths = await seedSkipState({
      runId: "sk-52-va-2",
      skippedStep: "bmad-dev-story",
      epic: 5,
      story: "5.2",
    });

    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "sk-52-va-2",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
        // Mismatch: state.lastAttempted.step is "bmad-dev-story" but
        // user supplied "bmad-code-review" (typo or stale).
        "--skip-step",
        "bmad-code-review",
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-04T20:00:00.000Z",
    });

    expect(result.exitCode).toBe(2);
    expect(result.action.action).toBe("halt");
    if (result.action.action !== "halt") return;
    // Hint surfaces the actual lastAttempted.step for the user to
    // correct the typo per OQ-6 decision.
    expect(result.action.message).toContain("bmad-dev-story");
    expect(result.action.message).toMatch(/^.*(Run|See|Try|Check) /);
  });

  it("SK_52_VA_3: skip path with null lastAttempted → ConfigError thrown — OQ-4 decision", async () => {
    // Use seedFixture but with stateOverride that has lastAttempted = null.
    const paths = await seedFixture({
      runId: "sk-52-va-3",
      stepName: "bmad-dev-story",
      epic: 5,
      story: "5.2",
      stateOverride: {
        schemaVersion: 1,
        project: { name: "stepper-test", bmadVersion: "6.5.0" },
        lastSuccessfulStep: {
          step: "bmad-create-prd",
          epic: 5,
          story: "5.2",
          completedAt: "2026-04-28T10:00:00Z",
        },
        lastAttempted: null,
        runHistory: [],
        checkpoints: [],
      },
    });

    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "sk-52-va-3",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
        "--skip-step",
        "bmad-dev-story",
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-04T20:00:00.000Z",
    });

    expect(result.exitCode).toBe(2);
    expect(result.action.action).toBe("halt");
    if (result.action.action !== "halt") return;
    // Hint per OQ-4 points the user at /bmad-next first.
    expect(result.action.message).toContain("Run /bmad-next");
  });

  it("SK_52_VA_4: skip path advances lastSuccessfulStep to NEXT step via DAG resolver — assert next.step matches DAG successor", async () => {
    const paths = await seedSkipState({
      runId: "sk-52-va-4",
      skippedStep: "bmad-dev-story",
      epic: 5,
      story: "5.2",
    });
    // DAG with bmad-code-review as the successor to bmad-dev-story.
    const dag = buildSkipDag("bmad-dev-story", "bmad-code-review");

    await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "sk-52-va-4",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
        "--skip-step",
        "bmad-dev-story",
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-04T20:00:00.000Z",
      dag,
    });

    const updated = Bun.YAML.parse(await Bun.file(paths.statePath).text()) as {
      lastSuccessfulStep: { step: string };
    };
    expect(updated.lastSuccessfulStep?.step).toBe("bmad-code-review");
  });

  it("SK_52_VA_5: skip-path saveState is atomic — single .yaml write, no .bak rotation issue", async () => {
    const paths = await seedSkipState({
      runId: "sk-52-va-5",
      skippedStep: "bmad-dev-story",
      epic: 5,
      story: "5.2",
    });
    const dag = buildSkipDag("bmad-dev-story", "bmad-code-review");

    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "sk-52-va-5",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
        "--skip-step",
        "bmad-dev-story",
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-04T20:00:00.000Z",
      dag,
    });
    expect(result.exitCode).toBe(0);

    // Verify the state.yaml was written + the .bak rotation occurred
    // exactly once (the original prior file became .bak via atomicWrite).
    const stateExists = await Bun.file(paths.statePath).exists();
    const backupExists = await Bun.file(`${paths.statePath}.bak`).exists();
    expect(stateExists).toBe(true);
    expect(backupExists).toBe(true);
  });

  it("SK_52_VA_6: idempotent re-skip — second invocation on already-skipped step → ConfigError 'is already skipped'", async () => {
    const paths = await seedSkipState({
      runId: "sk-52-va-6",
      skippedStep: "bmad-dev-story",
      epic: 5,
      story: "5.2",
      // Pre-existing runHistory: the prior --skip already landed an entry
      // with skipped: true for bmad-dev-story.
      runHistoryEntries: [
        {
          runId: "prior-skip-runid",
          step: "bmad-dev-story",
          epic: 5,
          story: "5.2",
          attemptNumber: 1,
          outcome: "pass",
          failureCode: null,
          completedAt: "2026-05-04T19:00:00Z",
          skipped: true,
        },
      ],
    });

    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "sk-52-va-6",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
        "--skip-step",
        "bmad-dev-story",
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-04T20:00:00.000Z",
    });

    expect(result.exitCode).toBe(2);
    expect(result.action.action).toBe("halt");
    if (result.action.action !== "halt") return;
    expect(result.action.message).toMatch(/^.*(Run|See|Try|Check) /);
  });

  it("SK_52_VA_7: skip-path AR9 emission shape — single-line message, exitCode 0, includes skipped step + next step name", async () => {
    const paths = await seedSkipState({
      runId: "sk-52-va-7",
      skippedStep: "bmad-dev-story",
      epic: 5,
      story: "5.2",
    });
    const dag = buildSkipDag("bmad-dev-story", "bmad-code-review");

    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "sk-52-va-7",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
        "--skip-step",
        "bmad-dev-story",
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-04T20:00:00.000Z",
      dag,
    });

    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    // Single-line per AR9.
    expect(result.action.message).not.toContain("\n");
    expect(result.action.message).toContain("bmad-dev-story");
    expect(result.action.message).toContain("bmad-code-review");
    // Round-trip through DispatchActionV1Schema (defence-in-depth).
    const validated = DispatchActionV1Schema.parse(result.action);
    expect(validated.action).toBe("report");
    expect(validated.exitCode).toBe(0);
  });

  it("SK_52_VA_8: SIGINT cooperation — skip path's atomic saveState honours the Story 1.3 atomic tmp+rename contract (no partial writes)", async () => {
    // The skip path's saveState rides the existing atomic-write contract
    // per Story 1.3 + AR13 Layer 2; the .bak rotation is the canonical
    // halt-and-resume safety net. This test verifies the post-skip state
    // is byte-identical to a fully-completed write — an aborted write
    // would leave a .yaml.tmp orphan or a partially-written .yaml. Both
    // are absent under the atomic-write contract.
    const paths = await seedSkipState({
      runId: "sk-52-va-8",
      skippedStep: "bmad-dev-story",
      epic: 5,
      story: "5.2",
    });
    const dag = buildSkipDag("bmad-dev-story", "bmad-code-review");

    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "sk-52-va-8",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
        "--skip-step",
        "bmad-dev-story",
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-04T20:00:00.000Z",
      dag,
    });
    expect(result.exitCode).toBe(0);

    // Verify no .tmp orphan exists post-write.
    const tmpExists = await Bun.file(`${paths.statePath}.tmp`).exists();
    expect(tmpExists).toBe(false);
    // Verify the canonical state.yaml is parseable + complete.
    const stateText = await Bun.file(paths.statePath).text();
    const parsed = Bun.YAML.parse(stateText) as {
      schemaVersion: number;
      runHistory: Array<Record<string, unknown>>;
    };
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.runHistory).toHaveLength(1);
    expect(parsed.runHistory[0]?.skipped).toBe(true);
  });

  it("SK_52_VA_9: skip path does NOT invoke verifier — verifierOverride NOT called when skipStep is set", async () => {
    const paths = await seedSkipState({
      runId: "sk-52-va-9",
      skippedStep: "bmad-dev-story",
      epic: 5,
      story: "5.2",
    });
    const dag = buildSkipDag("bmad-dev-story", "bmad-code-review");
    let verifierCallCount = 0;
    const verifierStub = async (
      _runId: string,
      _opts: { stepName: string; stagingRoot: string },
    ) => {
      verifierCallCount++;
      return {
        schemaVersion: 1 as const,
        status: "pass" as const,
        checks: [],
        promotedTo: null,
        resultPath: "/tmp/test-verifier-result.json",
      };
    };

    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "sk-52-va-9",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
        "--skip-step",
        "bmad-dev-story",
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-04T20:00:00.000Z",
      dag,
      verifierOverride: verifierStub,
    });
    expect(result.exitCode).toBe(0);
    // The skip path BYPASSES the verifier — call count must be zero.
    expect(verifierCallCount).toBe(0);
  });

  it("SK_52_VA_10: skip path does NOT trigger checkpoint append — checkpoints[] unchanged per Story 4.8 atomic-write contract", async () => {
    const paths = await seedSkipState({
      runId: "sk-52-va-10",
      skippedStep: "bmad-dev-story",
      epic: 5,
      story: "5.2",
    });
    const dag = buildSkipDag("bmad-dev-story", "bmad-code-review");

    const before = Bun.YAML.parse(await Bun.file(paths.statePath).text()) as {
      checkpoints: Array<Record<string, unknown>>;
    };
    expect(before.checkpoints).toEqual([]);

    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "sk-52-va-10",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
        "--skip-step",
        "bmad-dev-story",
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-04T20:00:00.000Z",
      dag,
      // Even when --checkpoint-each is set to match the just-skipped
      // step's phase, the skip path does NOT trigger checkpoint append
      // (the just-skipped step did not successfully complete).
      checkpointEach: "implementation",
    });
    expect(result.exitCode).toBe(0);

    const after = Bun.YAML.parse(await Bun.file(paths.statePath).text()) as {
      checkpoints: Array<Record<string, unknown>>;
    };
    expect(after.checkpoints).toEqual([]);
  });
});

// ─── Story 5.3 — Route-to-fixer failure mode (RTF_53_VA_*) ────────────────

describe("runVerifyAndAdvance — Story 5.3 route-to-fixer integration (RTF_53_VA_*)", () => {
  /**
   * Build a verifier stub that returns the supplied sequence of statuses
   * on each call, keyed by runId so the test can assert which staging
   * dir the call used. The stub also captures the runIds it was called
   * with so the test can verify the fixer's runId was used for the
   * post-fix verifier re-run.
   */
  function sequencedVerifierByRunId(
    sequence: ReadonlyArray<{
      readonly runIdMatcher: RegExp | string;
      readonly status: "pass" | "fail" | "skip";
    }>,
  ) {
    let callCount = 0;
    const calls: Array<{ runId: string; status: string }> = [];
    const stub = async (
      runId: string,
      _opts: { stepName: string; stagingRoot: string },
    ) => {
      // Find first matching entry that has not been consumed yet.
      const idx = callCount;
      callCount++;
      const match = sequence[idx];
      const status = match?.status ?? "pass";
      calls.push({ runId, status });
      return {
        schemaVersion: 1 as const,
        status,
        checks: [],
        promotedTo: null,
        resultPath: `/tmp/test-verifier-result-${runId}.json`,
      };
    };
    return { stub, getCallCount: () => callCount, calls };
  }

  /**
   * Helper: build a fixerDispatchOverride that simulates the fixer
   * sub-agent writing a corrected artifact to the FIXER staging dir.
   * The body is a benign valid markdown so the post-fix verifier (when
   * stubbed to "pass") can succeed; tests that target the escalate
   * branch supply a separate sequencedVerifierByRunId where the post-
   * fix call returns "fail".
   */
  function buildFixerDispatch(
    paths: FixturePaths,
    stepName: string,
    artifactBody?: string,
  ): (fixerRunId: string) => Promise<void> {
    return async (fixerRunId: string) => {
      const fixerStagingDir = path.join(paths.stagingRoot, fixerRunId);
      await fs.mkdir(path.join(fixerStagingDir, "outputs"), {
        recursive: true,
      });
      await Bun.write(
        path.join(fixerStagingDir, "outputs", `${stepName}.md`),
        artifactBody ??
          "---\ntitle: Corrected Artifact\nstatus: review\n---\n\n# Body\n\nFixed.\n",
      );
    };
  }

  it("RTF_53_VA_1: route-to-fixer + verifier-fail-then-fixer-pass results in success → ONE success runHistory entry with fixAttempt:true; corrected artifact promoted from FIXER staging dir", async () => {
    const paths = await seedFixture({
      runId: "rtf-53-va-1",
      stepName: "bmad-dev-story",
      epic: 5,
      story: "5.3",
    });
    // Sequence: original verifier fails → fixer dispatched → post-fix
    // verifier passes (on the FIXER's runId).
    const { stub, calls } = sequencedVerifierByRunId([
      { runIdMatcher: "rtf-53-va-1", status: "fail" },
      { runIdMatcher: "rtf-53-va-1-fix", status: "pass" },
    ]);
    const fixerDispatch = buildFixerDispatch(paths, "bmad-dev-story");

    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "rtf-53-va-1",
        "--tokens-in",
        "10",
        "--tokens-out",
        "20",
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-04T22:56:12.000Z",
      failurePolicyOverride: "route-to-fixer",
      verifierOverride: stub,
      fixerDispatchOverride: fixerDispatch,
    });

    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    // Verifier was called twice: once with original runId (fail), once
    // with fixer runId (pass).
    expect(calls).toHaveLength(2);
    expect(calls[0]?.runId).toBe("rtf-53-va-1");
    expect(calls[0]?.status).toBe("fail");
    expect(calls[1]?.runId).toBe("rtf-53-va-1-fix");
    expect(calls[1]?.status).toBe("pass");

    const updated = Bun.YAML.parse(await Bun.file(paths.statePath).text()) as {
      runHistory: Array<Record<string, unknown>>;
      lastSuccessfulStep: Record<string, unknown> | null;
    };
    // Two entries: the original verifier-fail attempt + the fix-success.
    expect(updated.runHistory).toHaveLength(2);
    // Entry 1: original verifier-fail.
    expect(updated.runHistory[0]?.outcome).toBe("fail");
    expect(updated.runHistory[0]?.fixAttempt).toBeUndefined();
    // Entry 2: fix-success — fixAttempt:true marker per OQ-2.
    expect(updated.runHistory[1]?.outcome).toBe("pass");
    expect(updated.runHistory[1]?.fixAttempt).toBe(true);
    // The success entry's runId references the FIXER runId (forensic
    // cross-reference to the fix staging dir).
    expect(updated.runHistory[1]?.runId).toBe("rtf-53-va-1-fix");
  });

  it("RTF_53_VA_2: route-to-fixer + verifier-fail-then-fixer-fail results in escalate → TWO runHistory fail entries (original + post-fix); VerifierFailureError thrown with both failure codes in message", async () => {
    const paths = await seedFixture({
      runId: "rtf-53-va-2",
      stepName: "bmad-dev-story",
      epic: 5,
      story: "5.3",
    });
    // Sequence: original verifier fails → fixer dispatched → post-fix
    // verifier ALSO fails → escalate.
    const { stub, calls } = sequencedVerifierByRunId([
      { runIdMatcher: "rtf-53-va-2", status: "fail" },
      { runIdMatcher: "rtf-53-va-2-fix", status: "fail" },
    ]);
    const fixerDispatch = buildFixerDispatch(paths, "bmad-dev-story");

    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "rtf-53-va-2",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-04T22:56:12.000Z",
      failurePolicyOverride: "route-to-fixer",
      verifierOverride: stub,
      fixerDispatchOverride: fixerDispatch,
    });

    // VerifierFailureError → AR21 halt with exitCode 1.
    expect(result.exitCode).toBe(1);
    expect(result.action.action).toBe("halt");
    // Both verifier calls happened.
    expect(calls).toHaveLength(2);
    expect(calls[0]?.runId).toBe("rtf-53-va-2");
    expect(calls[1]?.runId).toBe("rtf-53-va-2-fix");

    const updated = Bun.YAML.parse(await Bun.file(paths.statePath).text()) as {
      runHistory: Array<Record<string, unknown>>;
      lastFailureReason: Record<string, unknown> | null;
    };
    // Two fail entries: original verifier-fail + post-fix verifier-fail
    // (both with fail outcome; the second has fixAttempt:true).
    expect(updated.runHistory).toHaveLength(2);
    expect(updated.runHistory[0]?.outcome).toBe("fail");
    expect(updated.runHistory[0]?.fixAttempt).toBeUndefined();
    expect(updated.runHistory[0]?.failureCode).toBe("VERIFIER_FAILURE");
    expect(updated.runHistory[1]?.outcome).toBe("fail");
    expect(updated.runHistory[1]?.fixAttempt).toBe(true);
    expect(updated.runHistory[1]?.failureCode).toBe("VERIFIER_FAILURE");
    // lastFailureReason carries the LAST attempt's code per AC line 1099
    // ("with both failures recorded").
    expect(updated.lastFailureReason?.code).toBe("VERIFIER_FAILURE");
  });

  it("RTF_53_VA_3: route-to-fixer dispatch generates the fixer's dispatch-spec at staging/<runId>-fix/dispatch-spec.json with AC-mandated CONTEXT entries", async () => {
    const paths = await seedFixture({
      runId: "rtf-53-va-3",
      stepName: "bmad-dev-story",
      epic: 5,
      story: "5.3",
    });
    const { stub } = sequencedVerifierByRunId([
      { runIdMatcher: "rtf-53-va-3", status: "fail" },
      { runIdMatcher: "rtf-53-va-3-fix", status: "pass" },
    ]);
    const fixerDispatch = buildFixerDispatch(paths, "bmad-dev-story");

    await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "rtf-53-va-3",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-04T22:56:12.000Z",
      failurePolicyOverride: "route-to-fixer",
      verifierOverride: stub,
      fixerDispatchOverride: fixerDispatch,
    });

    // Read the generated fixer dispatch-spec at staging/<fixerRunId>/.
    const fixerSpecPath = path.join(
      paths.stagingRoot,
      "rtf-53-va-3-fix",
      "dispatch-spec.json",
    );
    const exists = await Bun.file(fixerSpecPath).exists();
    expect(exists).toBe(true);
    const fixerSpec = JSON.parse(
      await Bun.file(fixerSpecPath).text(),
    ) as DispatchSpecV1;
    // The AC-mandated CONTEXT entries: verifier-result + original artifact.
    const context = fixerSpec.taskSpec.context as ReadonlyArray<{
      path: string;
      label: string;
    }>;
    const verifierResultEntry = context.find((c) =>
      c.path.includes("verifier-result.json"),
    );
    const artifactEntry = context.find((c) =>
      c.path.includes("/outputs/bmad-dev-story.md"),
    );
    expect(verifierResultEntry).toBeDefined();
    expect(artifactEntry).toBeDefined();
    // Both reference the ORIGINAL run-id staging dir (not the fixer's).
    expect(verifierResultEntry?.path).toContain(
      "rtf-53-va-3/verifier-result.json",
    );
    expect(artifactEntry?.path).toContain(
      "rtf-53-va-3/outputs/bmad-dev-story.md",
    );
  });

  it("RTF_53_VA_4: the fixer's taskSpec.task is BYTE-IDENTICAL to AC line 1091 substring 'remediate a BMAD step artifact based on a verifier failure'", async () => {
    const paths = await seedFixture({
      runId: "rtf-53-va-4",
      stepName: "bmad-dev-story",
      epic: 5,
      story: "5.3",
    });
    const { stub } = sequencedVerifierByRunId([
      { runIdMatcher: "rtf-53-va-4", status: "fail" },
      { runIdMatcher: "rtf-53-va-4-fix", status: "pass" },
    ]);
    const fixerDispatch = buildFixerDispatch(paths, "bmad-dev-story");

    await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "rtf-53-va-4",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-04T22:56:12.000Z",
      failurePolicyOverride: "route-to-fixer",
      verifierOverride: stub,
      fixerDispatchOverride: fixerDispatch,
    });

    const fixerSpec = JSON.parse(
      await Bun.file(
        path.join(paths.stagingRoot, "rtf-53-va-4-fix", "dispatch-spec.json"),
      ).text(),
    ) as DispatchSpecV1;
    expect(fixerSpec.taskSpec.task).toBe(
      "remediate a BMAD step artifact based on a verifier failure",
    );
  });

  it("RTF_53_VA_5: the fixer's taskSpec.persona resolves to 'bmad-step-fixer' per OQ-1", async () => {
    const paths = await seedFixture({
      runId: "rtf-53-va-5",
      stepName: "bmad-dev-story",
      epic: 5,
      story: "5.3",
    });
    const { stub } = sequencedVerifierByRunId([
      { runIdMatcher: "rtf-53-va-5", status: "fail" },
      { runIdMatcher: "rtf-53-va-5-fix", status: "pass" },
    ]);
    const fixerDispatch = buildFixerDispatch(paths, "bmad-dev-story");

    await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "rtf-53-va-5",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-04T22:56:12.000Z",
      failurePolicyOverride: "route-to-fixer",
      verifierOverride: stub,
      fixerDispatchOverride: fixerDispatch,
    });

    const fixerSpec = JSON.parse(
      await Bun.file(
        path.join(paths.stagingRoot, "rtf-53-va-5-fix", "dispatch-spec.json"),
      ).text(),
    ) as DispatchSpecV1;
    expect(fixerSpec.taskSpec.persona).toBe("bmad-step-fixer");
  });

  it("RTF_53_VA_6: the fixer's output is promoted from staging/<runId>-fix/outputs/<artifact> on success (NOT from original failed artifact)", async () => {
    const paths = await seedFixture({
      runId: "rtf-53-va-6",
      stepName: "bmad-dev-story",
      epic: 5,
      story: "5.3",
      artifactBody:
        "---\ntitle: Original (failed) artifact\nstatus: review\n---\n\n# Body\n\nOriginal failure.\n",
    });
    const { stub } = sequencedVerifierByRunId([
      { runIdMatcher: "rtf-53-va-6", status: "fail" },
      { runIdMatcher: "rtf-53-va-6-fix", status: "pass" },
    ]);
    // Fixer writes a DISTINCT artifact body to the fix staging dir.
    const fixedBody =
      "---\ntitle: Fixed Artifact\nstatus: review\n---\n\n# Body\n\nCorrected via auto-fix.\n";
    const fixerDispatch = buildFixerDispatch(
      paths,
      "bmad-dev-story",
      fixedBody,
    );

    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "rtf-53-va-6",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-04T22:56:12.000Z",
      failurePolicyOverride: "route-to-fixer",
      verifierOverride: stub,
      fixerDispatchOverride: fixerDispatch,
    });

    expect(result.exitCode).toBe(0);
    expect(result.promotedTo).toBeDefined();
    expect(result.promotedTo).not.toBeNull();
    if (result.promotedTo === null || result.promotedTo === undefined) return;
    // The promoted artifact body matches the FIXER's corrected body, NOT
    // the original failed body — proving promote read from the fix
    // staging dir.
    const promotedBody = await Bun.file(result.promotedTo).text();
    expect(promotedBody).toBe(fixedBody);
  });

  it("RTF_53_VA_7: the original verifier-result.json + the fixer verifier-result.json BOTH exist after the fix attempt (forensic preservation per AC line 1099)", async () => {
    const paths = await seedFixture({
      runId: "rtf-53-va-7",
      stepName: "bmad-dev-story",
      epic: 5,
      story: "5.3",
    });
    // Sequence: original fail (writes to staging/rtf-53-va-7/...) →
    // fixer dispatched → post-fix pass (writes to staging/rtf-53-va-7-fix/...).
    const { stub } = sequencedVerifierByRunId([
      { runIdMatcher: "rtf-53-va-7", status: "fail" },
      { runIdMatcher: "rtf-53-va-7-fix", status: "pass" },
    ]);
    // The stub doesn't write verifier-result.json (it's a stub), so we
    // simulate that by having the test seam write both. The fixer
    // dispatch writes the fix output; the test writes the
    // verifier-result.json files after the fact to mirror what the real
    // verifier would do.
    const originalVerifierResult = path.join(
      paths.stagingRoot,
      "rtf-53-va-7",
      "verifier-result.json",
    );
    await Bun.write(
      originalVerifierResult,
      JSON.stringify({ status: "fail", schemaVersion: 1, checks: [] }),
    );
    const fixerDispatch = async (fixerRunId: string) => {
      const fixerStagingDir = path.join(paths.stagingRoot, fixerRunId);
      await fs.mkdir(path.join(fixerStagingDir, "outputs"), {
        recursive: true,
      });
      await Bun.write(
        path.join(fixerStagingDir, "outputs", "bmad-dev-story.md"),
        "---\ntitle: Fixed\nstatus: review\n---\n\n# Body\n",
      );
      // Simulate post-fix verifier-result.json write at fix staging dir.
      await Bun.write(
        path.join(fixerStagingDir, "verifier-result.json"),
        JSON.stringify({ status: "pass", schemaVersion: 1, checks: [] }),
      );
    };

    await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "rtf-53-va-7",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-04T22:56:12.000Z",
      failurePolicyOverride: "route-to-fixer",
      verifierOverride: stub,
      fixerDispatchOverride: fixerDispatch,
    });

    // BOTH verifier-result.json files exist (forensic preservation).
    const originalExists = await Bun.file(originalVerifierResult).exists();
    const fixerVerifierResult = path.join(
      paths.stagingRoot,
      "rtf-53-va-7-fix",
      "verifier-result.json",
    );
    const fixerExists = await Bun.file(fixerVerifierResult).exists();
    expect(originalExists).toBe(true);
    expect(fixerExists).toBe(true);
  });

  it("RTF_53_VA_8: SIGINT mid-fixer-dispatch halts cleanly with VerifierFailureError carrying the original verifier-fail context", async () => {
    const paths = await seedFixture({
      runId: "rtf-53-va-8",
      stepName: "bmad-dev-story",
      epic: 5,
      story: "5.3",
    });
    const { stub, getCallCount } = sequencedVerifierByRunId([
      { runIdMatcher: "rtf-53-va-8", status: "fail" },
    ]);
    let shutdownPolled = 0;
    const fixerDispatch = buildFixerDispatch(paths, "bmad-dev-story");

    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "rtf-53-va-8",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-04T22:56:12.000Z",
      failurePolicyOverride: "route-to-fixer",
      verifierOverride: stub,
      fixerDispatchOverride: fixerDispatch,
      shutdownRequested: () => {
        // Return true on the FIRST poll (which happens BEFORE fixer
        // dispatch) — simulates SIGINT mid-route-to-fixer.
        shutdownPolled++;
        return true;
      },
    });

    // Verifier was called exactly ONCE (the original) — fixer dispatch
    // was BYPASSED because shutdownRequested returned true before the
    // dispatch.
    expect(getCallCount()).toBe(1);
    expect(shutdownPolled).toBeGreaterThan(0);
    // VerifierFailureError → AR21 halt.
    expect(result.exitCode).toBe(1);
    expect(result.action.action).toBe("halt");
  });

  it("RTF_53_VA_9: --auto-fix flag overrides per-step policy to 'route-to-fixer' (per architecture line 499)", async () => {
    const paths = await seedFixture({
      runId: "rtf-53-va-9",
      stepName: "bmad-dev-story",
      epic: 5,
      story: "5.3",
    });
    const { stub, calls } = sequencedVerifierByRunId([
      { runIdMatcher: "rtf-53-va-9", status: "fail" },
      { runIdMatcher: "rtf-53-va-9-fix", status: "pass" },
    ]);
    const fixerDispatch = buildFixerDispatch(paths, "bmad-dev-story");

    // Use the --auto-fix positional flag instead of failurePolicyOverride
    // to verify the override behaviour.
    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "rtf-53-va-9",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
        "--auto-fix",
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-04T22:56:12.000Z",
      // Even with failurePolicyOverride set to "retry", --auto-fix
      // overrides to "route-to-fixer" unconditionally.
      failurePolicyOverride: "retry",
      verifierOverride: stub,
      fixerDispatchOverride: fixerDispatch,
    });

    expect(result.exitCode).toBe(0);
    // Two verifier calls: original (fail) + post-fix (pass) — proves the
    // route-to-fixer path was taken (NOT the retry path which would
    // call the verifier on the SAME runId twice).
    expect(calls).toHaveLength(2);
    expect(calls[0]?.runId).toBe("rtf-53-va-9");
    expect(calls[1]?.runId).toBe("rtf-53-va-9-fix");
  });

  it("RTF_53_VA_10: the fix-attempt success runHistory entry has fixAttempt:true field set per OQ-2", async () => {
    const paths = await seedFixture({
      runId: "rtf-53-va-10",
      stepName: "bmad-dev-story",
      epic: 5,
      story: "5.3",
    });
    const { stub } = sequencedVerifierByRunId([
      { runIdMatcher: "rtf-53-va-10", status: "fail" },
      { runIdMatcher: "rtf-53-va-10-fix", status: "pass" },
    ]);
    const fixerDispatch = buildFixerDispatch(paths, "bmad-dev-story");

    await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "rtf-53-va-10",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-04T22:56:12.000Z",
      failurePolicyOverride: "route-to-fixer",
      verifierOverride: stub,
      fixerDispatchOverride: fixerDispatch,
    });

    const updated = Bun.YAML.parse(await Bun.file(paths.statePath).text()) as {
      runHistory: Array<Record<string, unknown>>;
    };
    // The success entry (LAST in runHistory) must have fixAttempt:true.
    const successEntry = updated.runHistory[updated.runHistory.length - 1];
    expect(successEntry?.outcome).toBe("pass");
    expect(successEntry?.fixAttempt).toBe(true);
  });
});

// ─── Story 5.4 — Escalate failure mode (ESC_54_VA_*) ──────────────────────

describe("runVerifyAndAdvance — Story 5.4 escalate-mode integration (ESC_54_VA_*)", () => {
  /** AR22 actionable-hint regex (architecture line 589 + AC line 1113). */
  const AR22_REGEX = /^.*(Run|See|Try|Check) /;

  function sequencedVerifier(
    statuses: ReadonlyArray<"pass" | "fail" | "skip">,
  ) {
    let callCount = 0;
    const stub = async (
      _runId: string,
      _opts: { stepName: string; stagingRoot: string },
    ) => {
      const idx = callCount;
      callCount++;
      return {
        schemaVersion: 1 as const,
        status: statuses[idx] ?? "pass",
        checks: [],
        promotedTo: null,
        resultPath: "/tmp/test-verifier-result.json",
      };
    };
    return { stub, getCallCount: () => callCount };
  }

  it("ESC_54_VA_1: retry-cap escalate path → throw VerifierFailureError; lastFailureReason.hint matches AR22 regex; AR9 message matches; no Error.stack on main thread", async () => {
    const paths = await seedFixture({
      runId: "esc-54-va-1",
      stepName: "bmad-dev-story",
      epic: 5,
      story: "5.4",
    });
    const { stub } = sequencedVerifier(["fail", "fail", "fail"]);
    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "esc-54-va-1",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-05T01:40:46.000Z",
      failurePolicyOverride: "retry",
      maxRetriesOverride: 2,
      verifierOverride: stub,
      reDispatchOverride: () => {},
    });
    expect(result.exitCode).toBe(1);
    expect(result.action.action).toBe("halt");
    if (result.action.action === "halt") {
      expect(AR22_REGEX.test(result.action.message)).toBe(true);
      // No Error.stack substring (NFR-M2).
      expect(result.action.message).not.toContain("at runVerifyAndAdvance");
      expect(result.action.message).not.toContain("    at ");
    }
    const updated = Bun.YAML.parse(await Bun.file(paths.statePath).text()) as {
      lastFailureReason: { hint: string; code: string };
    };
    expect(updated.lastFailureReason?.code).toBe("VERIFIER_FAILURE");
    expect(AR22_REGEX.test(updated.lastFailureReason?.hint ?? "")).toBe(true);
  });

  it("ESC_54_VA_2: route-to-fixer-cap escalate path (post-fix-fail with both-failures) → AR9 message + lastFailureReason.hint match regex", async () => {
    const paths = await seedFixture({
      runId: "esc-54-va-2",
      stepName: "bmad-dev-story",
      epic: 5,
      story: "5.4",
    });
    // 1st verifier call: fail (original); 2nd verifier call: fail (post-fix).
    const { stub } = sequencedVerifier(["fail", "fail"]);
    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "esc-54-va-2",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-05T01:40:46.000Z",
      failurePolicyOverride: "route-to-fixer",
      verifierOverride: stub,
      // fixerDispatchOverride: simulate the fixer producing a corrected
      // artifact (the second verifier call still returns fail).
      fixerDispatchOverride: async (fixerRunId: string) => {
        const fxStaging = `${paths.stagingRoot}/${fixerRunId}`;
        await Bun.write(
          `${fxStaging}/outputs/bmad-dev-story.md`,
          "# fixer output\n",
        );
      },
    });
    expect(result.exitCode).toBe(1);
    expect(result.action.action).toBe("halt");
    if (result.action.action === "halt") {
      expect(AR22_REGEX.test(result.action.message)).toBe(true);
    }
    const updated = Bun.YAML.parse(await Bun.file(paths.statePath).text()) as {
      lastFailureReason: { hint: string; code: string };
    };
    expect(AR22_REGEX.test(updated.lastFailureReason?.hint ?? "")).toBe(true);
    expect(updated.lastFailureReason?.code).toBe("VERIFIER_FAILURE");
  });

  it("ESC_54_VA_3: raw verifier failure (first-attempt fail with default escalate policy) → hint matches regex", async () => {
    const paths = await seedFixture({
      runId: "esc-54-va-3",
      stepName: "bmad-dev-story",
      epic: 5,
      story: "5.4",
    });
    const { stub } = sequencedVerifier(["fail"]);
    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "esc-54-va-3",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-05T01:40:46.000Z",
      failurePolicyOverride: "escalate",
      verifierOverride: stub,
    });
    expect(result.exitCode).toBe(1);
    if (result.action.action === "halt") {
      expect(AR22_REGEX.test(result.action.message)).toBe(true);
    }
    const updated = Bun.YAML.parse(await Bun.file(paths.statePath).text()) as {
      lastFailureReason: { hint: string };
    };
    expect(AR22_REGEX.test(updated.lastFailureReason?.hint ?? "")).toBe(true);
  });

  it("ESC_54_VA_7: SIGINT mid-retry escalate path halts cleanly; lastFailureReason.hint matches regex (atomic write)", async () => {
    const paths = await seedFixture({
      runId: "esc-54-va-7",
      stepName: "bmad-dev-story",
      epic: 5,
      story: "5.4",
    });
    const { stub } = sequencedVerifier(["fail", "fail"]);
    let shutdownCalls = 0;
    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "esc-54-va-7",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-05T01:40:46.000Z",
      failurePolicyOverride: "retry",
      maxRetriesOverride: 2,
      verifierOverride: stub,
      // Trigger SIGINT after first fail attempt (return true on 2nd
      // call to shutdownRequested — after attempt 1 is finished).
      shutdownRequested: () => {
        shutdownCalls++;
        return shutdownCalls > 0; // first call after attempt 1 finishes
      },
      reDispatchOverride: () => {},
    });
    expect(result.exitCode).toBe(1);
    if (result.action.action === "halt") {
      expect(AR22_REGEX.test(result.action.message)).toBe(true);
    }
    // The SIGINT-triggered halt persisted lastFailureReason.
    const updated = Bun.YAML.parse(await Bun.file(paths.statePath).text()) as {
      lastFailureReason: { hint: string; code: string };
    };
    expect(AR22_REGEX.test(updated.lastFailureReason?.hint ?? "")).toBe(true);
  });

  it("ESC_54_VA_8: lastFailureReason auto-cleared on next successful step's verify-and-advance run (per OQ-6)", async () => {
    const paths = await seedFixture({
      runId: "esc-54-va-8",
      stepName: "bmad-dev-story",
      epic: 5,
      story: "5.4",
    });
    // Pre-seed state with a non-null lastFailureReason from a prior halt.
    const seeded = Bun.YAML.parse(
      await Bun.file(paths.statePath).text(),
    ) as Record<string, unknown>;
    seeded.lastFailureReason = {
      code: "VERIFIER_FAILURE",
      message: "prior halt",
      hint: "Run /bmad-next --resume.",
      runId: "prior-run",
    };
    await Bun.write(paths.statePath, Bun.YAML.stringify(seeded));
    const { stub } = sequencedVerifier(["pass"]);
    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "esc-54-va-8",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-05T01:40:46.000Z",
      failurePolicyOverride: "escalate",
      verifierOverride: stub,
    });
    expect(result.exitCode).toBe(0);
    const updated = Bun.YAML.parse(await Bun.file(paths.statePath).text()) as {
      lastFailureReason: unknown;
    };
    // Per Story 3.1 + 5.1 + 5.3 success-path clear: lastFailureReason
    // is set to null on successful step (Story 5.4 does not change this).
    expect(updated.lastFailureReason).toBeNull();
  });

  it("ESC_54_VA_9: NO stack trace on main thread (NFR-M2) — AR9 message contains ONLY the actionable hint, not Error.stack", async () => {
    const paths = await seedFixture({
      runId: "esc-54-va-9",
      stepName: "bmad-dev-story",
      epic: 5,
      story: "5.4",
    });
    const { stub } = sequencedVerifier(["fail"]);
    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "esc-54-va-9",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-05T01:40:46.000Z",
      failurePolicyOverride: "escalate",
      verifierOverride: stub,
    });
    expect(result.exitCode).toBe(1);
    if (result.action.action === "halt") {
      // The AR9 message field is the actionable hint string (single
      // line; matches regex). The full Error.stack lives in the run-log
      // JSON file (FR44), NOT in the AR9 message field.
      expect(result.action.message).not.toContain("Error:");
      expect(result.action.message).not.toContain("VerifierFailureError:");
      expect(result.action.message).not.toContain("    at ");
      // The single-line shape contract.
      expect(result.action.message.split("\n").length).toBeLessThanOrEqual(2);
      expect(AR22_REGEX.test(result.action.message)).toBe(true);
    }
  });

  it("ESC_54_VA_10: pre-audit pass-through — VerifierFailureError.actionableHint matches regex (PASS-THROUGH common case)", async () => {
    const paths = await seedFixture({
      runId: "esc-54-va-10",
      stepName: "bmad-dev-story",
      epic: 5,
      story: "5.4",
    });
    const { stub } = sequencedVerifier(["fail"]);
    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "esc-54-va-10",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-05T01:40:46.000Z",
      failurePolicyOverride: "escalate",
      verifierOverride: stub,
    });
    if (result.action.action === "halt") {
      // VerifierFailureError.actionableHint = "See _bmad-output/.stepper/
      // runs/<ts>-<step>.log for the verifier output; try /bmad-next
      // --resume after fixing the underlying issue." — matches regex
      // via leading "See ". PASS-THROUGH preserves the hint unchanged.
      expect(result.action.message).toContain("See ");
      expect(result.action.message).toContain("--resume");
      expect(AR22_REGEX.test(result.action.message)).toBe(true);
    }
  });
});

// ─── Story 6.5: VER_65_VANDA_* — RunVerifyAndAdvanceOptions.config.verifiers
// threading. Mirrors BUD_64_VANDA pattern: opts.config.verifiers field
// + verifierFn test stub captures projectVerifiers + end-to-end via real
// runVerifier to confirm merged config surfaces in checks.

describe("VER_65_VANDA: RunVerifyAndAdvanceOptions.config.verifiers threading (Story 6.5 AC-1)", () => {
  it("VER_65_VANDA_1: stub captures projectVerifiers from opts.config.verifiers", async () => {
    const paths = await seedFixture({
      runId: "ver-65-vanda-1",
      stepName: "bmad-dev-story",
      epic: 6,
      story: "6.5",
    });

    let capturedProjectVerifiers: unknown = "NOT-CALLED";
    const stub = async (
      _runId: string,
      callOpts: {
        stepName: string;
        stagingRoot: string;
        projectVerifiers?: import("../../schemas/config.ts").Verifiers;
      },
    ) => {
      capturedProjectVerifiers = callOpts.projectVerifiers;
      return {
        schemaVersion: 1 as const,
        status: "pass" as const,
        checks: [],
        promotedTo: null,
        resultPath: "/tmp/x.json",
      };
    };

    const verifiers = {
      "bmad-dev-story": { requiredFrontmatterSections: ["owner"] },
    };

    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "ver-65-vanda-1",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-05T11:30:00.000Z",
      verifierOverride: stub,
      config: { verifiers },
    });

    expect(result.exitCode).toBe(0);
    expect(capturedProjectVerifiers).toEqual(verifiers);
  });

  it("VER_65_VANDA_2: end-to-end real runVerifier — extra requiredFrontmatterSections surface as fail", async () => {
    const paths = await seedFixture({
      runId: "ver-65-vanda-2",
      stepName: "bmad-dev-story",
      epic: 6,
      story: "6.5",
      // Default seedFixture body has title+status frontmatter; lacks owner.
    });

    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "ver-65-vanda-2",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-05T11:30:01.000Z",
      // Story 5.6 — escalate policy ensures the failure throws as
      // VerifierFailureError per the existing baseline behaviour.
      failurePolicyOverride: "escalate",
      maxRetriesOverride: 0,
      config: {
        verifiers: {
          "bmad-dev-story": { requiredFrontmatterSections: ["owner"] },
        },
      },
    });

    // The merged config requires "owner" → frontmatter check fails.
    expect(result.action.action).toBe("halt");
  });

  it("VER_65_VANDA_3: backwards-compat — undefined opts.config → stub sees undefined projectVerifiers", async () => {
    const paths = await seedFixture({
      runId: "ver-65-vanda-3",
      stepName: "bmad-dev-story",
      epic: 6,
      story: "6.5",
    });

    let captured: unknown = "NOT-CALLED";
    const stub = async (
      _runId: string,
      callOpts: {
        stepName: string;
        stagingRoot: string;
        projectVerifiers?: import("../../schemas/config.ts").Verifiers;
      },
    ) => {
      captured = callOpts.projectVerifiers;
      return {
        schemaVersion: 1 as const,
        status: "pass" as const,
        checks: [],
        promotedTo: null,
        resultPath: "/tmp/x.json",
      };
    };

    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "ver-65-vanda-3",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-05T11:30:02.000Z",
      verifierOverride: stub,
    });

    expect(result.exitCode).toBe(0);
    // No config supplied → stub receives undefined projectVerifiers.
    expect(captured).toBeUndefined();
  });
});

// ─── Story 6.6: TLM_66_VANDA_* — RunVerifyAndAdvanceOptions.config.telemetry
// + telemetryRoot test seam. AC-1 (write happens), AC-2 (Zod-throw fall-
// through), AC-3 (opt-in gate skips writes when disabled / undefined).
// Mirrors VER_65_VANDA pattern.

describe("TLM_66_VANDA: RunVerifyAndAdvanceOptions.config.telemetry threading (Story 6.6)", () => {
  it("TLM_66_VANDA_ENABLED_1: AC-1 — telemetry.enabled=true → JSONL line written with valid record", async () => {
    const paths = await seedFixture({
      runId: "tlm-66-vanda-enabled-1",
      stepName: "bmad-dev-story",
      epic: 6,
      story: "6.6",
    });
    const telemetryRoot = path.join(tmp, "telemetry");

    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "tlm-66-vanda-enabled-1",
        "--tokens-in",
        "100",
        "--tokens-out",
        "50",
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-05T12:00:00.000Z",
      telemetryRoot,
      config: { telemetry: { enabled: true } },
    });

    expect(result.exitCode).toBe(0);

    const expectedFile = path.join(telemetryRoot, "2026-05.jsonl");
    const content = await fs.readFile(expectedFile, "utf8");
    const lines = content.split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBe(1);
    const record = JSON.parse(lines[0] as string);
    expect(record.schemaVersion).toBe(1);
    expect(record.step).toBe("bmad-dev-story");
    expect(record.verifierStatus).toBe("pass");
    expect(record.retries).toBe(0);
    expect(record.tokensIn).toBe(100);
    expect(record.tokensOut).toBe(50);
    expect(record.model).toBe("sonnet");
    expect(record.persona).toBe("dev");
    expect(record.ts).toBe("2026-05-05T12:00:00.000Z");
  });

  it("TLM_66_VANDA_DISABLED_1: AC-3 — telemetry.enabled=false → no telemetry file written", async () => {
    const paths = await seedFixture({
      runId: "tlm-66-vanda-disabled-1",
      stepName: "bmad-dev-story",
      epic: 6,
      story: "6.6",
    });
    const telemetryRoot = path.join(tmp, "telemetry-disabled");

    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "tlm-66-vanda-disabled-1",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-05T12:01:00.000Z",
      telemetryRoot,
      config: { telemetry: { enabled: false } },
    });

    expect(result.exitCode).toBe(0);

    let exists = true;
    try {
      await fs.access(telemetryRoot);
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);
  });

  it("TLM_66_VANDA_NO_CONFIG_1: AC-3 — opts.config undefined → no telemetry file written", async () => {
    const paths = await seedFixture({
      runId: "tlm-66-vanda-no-config-1",
      stepName: "bmad-dev-story",
      epic: 6,
      story: "6.6",
    });
    const telemetryRoot = path.join(tmp, "telemetry-noconfig");

    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "tlm-66-vanda-no-config-1",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-05T12:02:00.000Z",
      telemetryRoot,
    });

    expect(result.exitCode).toBe(0);

    let exists = true;
    try {
      await fs.access(telemetryRoot);
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);
  });

  it("TLM_66_VANDA_ZOD_REJECT_1: AC-2 best-effort fall-through — writeTelemetryRecord throws → log.warn fires; exit code preserved", async () => {
    const paths = await seedFixture({
      runId: "tlm-66-vanda-zod-1",
      stepName: "bmad-dev-story",
      epic: 6,
      story: "6.6",
    });
    const telemetryRoot = path.join(tmp, "telemetry-zod");

    let warnedMessage: string | undefined;
    const logStub = {
      info(_message: string): void {},
      warn(message: string): void {
        if (message.includes("telemetry write failed")) {
          warnedMessage = message;
        }
      },
      error(_message: string): void {},
    };

    const throwingWriter: typeof import("../../telemetry/index.ts").writeTelemetryRecord =
      async (_record, _opts) => {
        throw new Error("synthetic Zod parse failure");
      };

    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "tlm-66-vanda-zod-1",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-05T12:03:00.000Z",
      logger: logStub,
      telemetryRoot,
      writeTelemetryRecordOverride: throwingWriter,
      config: { telemetry: { enabled: true } },
    });

    // Verifier outcome preserved (AC-2 best-effort discipline).
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    // log.warn was called with the telemetry-failure prefix.
    expect(warnedMessage).toBeDefined();
    expect(warnedMessage).toContain("telemetry write failed");
    expect(warnedMessage).toContain("synthetic Zod parse failure");
  });

  it("TLM_66_VANDA_ON_VERIFIER_FAIL_1: AC-1 — verifier fail still writes telemetry with verifierStatus=fail", async () => {
    const paths = await seedFixture({
      runId: "tlm-66-vanda-vfail-1",
      stepName: "bmad-dev-story",
      epic: 6,
      story: "6.6",
    });
    const telemetryRoot = path.join(tmp, "telemetry-vfail");

    const failStub = async (
      _runId: string,
      _opts: {
        stepName: string;
        stagingRoot: string;
        projectVerifiers?: import("../../schemas/config.ts").Verifiers;
      },
    ) => ({
      schemaVersion: 1 as const,
      status: "fail" as const,
      checks: [],
      promotedTo: null,
      resultPath: "/tmp/fail.json",
    });

    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "tlm-66-vanda-vfail-1",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-05T12:04:00.000Z",
      verifierOverride: failStub,
      failurePolicyOverride: "escalate",
      maxRetriesOverride: 0,
      telemetryRoot,
      config: { telemetry: { enabled: true } },
    });

    // The escalate path returns action: "halt" (verifier-failure -> halt).
    expect(result.action.action).toBe("halt");

    // Telemetry record MUST have been written in the finally block.
    const expectedFile = path.join(telemetryRoot, "2026-05.jsonl");
    const content = await fs.readFile(expectedFile, "utf8");
    const lines = content.split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBe(1);
    const record = JSON.parse(lines[0] as string);
    expect(record.verifierStatus).toBe("fail");
    // errorCode populated when the escalate path produces an outcomeError.
    expect(record.errorCode).toBeDefined();
  });

  it("TLM_66_VANDA_BACKWARDS_COMPAT_1: telemetryRoot omitted when telemetry disabled → no behavior change", async () => {
    const paths = await seedFixture({
      runId: "tlm-66-vanda-bc-1",
      stepName: "bmad-dev-story",
      epic: 6,
      story: "6.6",
    });

    // Existing baseline pattern (no telemetry-related opts).
    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "tlm-66-vanda-bc-1",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
      ],
      statePath: paths.statePath,
      stagingRoot: paths.stagingRoot,
      canonicalRoot: paths.canonicalRoot,
      runsRoot: paths.runsRoot,
      lockOptions: { lockDir: paths.lockDir },
      nowIso: "2026-05-05T12:05:00.000Z",
    });

    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
  });
});

// ─── v0.2.1 — invoke-skill mode (skip verifier + promote, just advance state) ─

describe("runVerifyAndAdvance — v0.2.1 invoke-skill mode (IS_VA_*)", () => {
  it("IS_VA_1: --invoke-skill-mode + --last-attempted-json advances state, skips verifier+promote", async () => {
    // Seed a minimal state where bmad-create-prd is the last successful step.
    // The invoke-skill path does NOT read the dispatch-spec, so we do not
    // need to seed a staging dir for this path.
    const statePath = path.join(tmp, "state.yaml");
    await Bun.write(
      statePath,
      Bun.YAML.stringify({
        schemaVersion: 1,
        project: { name: "stepper-test", bmadVersion: "6.5.0" },
        lastSuccessfulStep: {
          step: "bmad-create-prd",
          epic: 1,
          story: "1.0",
          completedAt: "2026-05-13T10:00:00Z",
        },
        runHistory: [],
        checkpoints: [],
      }),
    );
    const stagingRoot = path.join(tmp, "staging");
    const lockDir = path.join(tmp, "lock");
    const runsRoot = path.join(tmp, "runs");

    const lastAttempted = {
      step: "bmad-brainstorming",
      epic: 1,
      story: "1.1",
      attemptedAt: "2026-05-14T12:00:00.000Z",
    };
    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "is-30-va-1",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
        "--invoke-skill-mode",
        "--last-attempted-json",
        JSON.stringify(lastAttempted),
      ],
      statePath,
      stagingRoot,
      runsRoot,
      lockOptions: { lockDir },
      nowIso: "2026-05-14T12:01:00.000Z",
    });

    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    expect(result.action.message).toContain("bmad-brainstorming");
    expect(result.action.message).toContain("invoke-skill");

    // State advanced.
    const updated = Bun.YAML.parse(await Bun.file(statePath).text()) as {
      lastSuccessfulStep: { step: string; epic: number; story: string };
      lastAttempted: unknown;
      lastFailureReason: unknown;
      runHistory: Array<Record<string, unknown>>;
    };
    expect(updated.lastSuccessfulStep.step).toBe("bmad-brainstorming");
    expect(updated.lastSuccessfulStep.epic).toBe(1);
    expect(updated.lastSuccessfulStep.story).toBe("1.1");
    expect(updated.lastAttempted).toBeNull();
    expect(updated.lastFailureReason).toBeNull();
    expect(updated.runHistory).toHaveLength(1);
    expect(updated.runHistory[0]?.step).toBe("bmad-brainstorming");
    expect(updated.runHistory[0]?.outcome).toBe("pass");
    // The verifier was BYPASSED on this path — runHistory entry reflects that.
    expect(updated.runHistory[0]?.verifierStatus).toBe("skip");
  });

  it("IS_VA_2: --invoke-skill-mode WITHOUT --last-attempted-json throws ConfigError", async () => {
    const statePath = path.join(tmp, "state.yaml");
    await Bun.write(
      statePath,
      Bun.YAML.stringify({
        schemaVersion: 1,
        project: { name: "stepper-test", bmadVersion: "6.5.0" },
        runHistory: [],
        checkpoints: [],
      }),
    );
    const stagingRoot = path.join(tmp, "staging");
    const lockDir = path.join(tmp, "lock");
    const runsRoot = path.join(tmp, "runs");

    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "is-30-va-2",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
        "--invoke-skill-mode",
      ],
      statePath,
      stagingRoot,
      runsRoot,
      lockOptions: { lockDir },
      nowIso: "2026-05-14T12:01:00.000Z",
    });

    expect(result.action.action).toBe("halt");
    if (result.action.action !== "halt") return;
    expect(result.exitCode).toBe(2);
    expect(result.action.message).toContain("--last-attempted-json");
    expect(result.action.message).toMatch(/^.*(Run|See|Try|Check|Pass) /);
  });

  it("IS_VA_3: --invoke-skill-mode does NOT require a staging dir to exist (no dispatch-spec read)", async () => {
    // Confirm the invoke-skill path does not throw when the staging dir
    // for the runId is absent — the path bypasses readDispatchSpec.
    // (story value avoids "0.X" / "1.X" YAML round-trip ambiguity: Bun.YAML
    // unquotes strings that look like decimals starting with "0.", so we
    // use "1.5" which survives stringify→parse as a string.)
    const statePath = path.join(tmp, "state.yaml");
    await Bun.write(
      statePath,
      Bun.YAML.stringify({
        schemaVersion: 1,
        project: { name: "stepper-test", bmadVersion: "6.5.0" },
        lastSuccessfulStep: {
          step: "bmad-create-prd",
          epic: 1,
          story: "1.5",
          completedAt: "2026-05-13T10:00:00Z",
        },
        runHistory: [],
        checkpoints: [],
      }),
    );
    const stagingRoot = path.join(tmp, "staging-nonexistent");
    const lockDir = path.join(tmp, "lock");
    const runsRoot = path.join(tmp, "runs");

    const lastAttempted = {
      step: "bmad-domain-research",
      epic: 1,
      story: "1.5",
      attemptedAt: "2026-05-14T12:00:00.000Z",
    };
    const result = await runVerifyAndAdvance({
      argv: [
        "--run-id",
        "is-30-va-3",
        "--tokens-in",
        "0",
        "--tokens-out",
        "0",
        "--invoke-skill-mode",
        "--last-attempted-json",
        JSON.stringify(lastAttempted),
      ],
      statePath,
      stagingRoot,
      runsRoot,
      lockOptions: { lockDir },
      nowIso: "2026-05-14T12:01:00.000Z",
    });

    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
  });
});
