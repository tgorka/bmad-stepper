/**
 * src/smoke/next.test.ts — Canonical end-to-end smoke test for
 * /bmad-next happy path (Story 2.8 AC verbatim from epics.md
 * lines 703-715).
 *
 * Per architecture §line 1249 + §line 1252, smoke tests live under
 * src/smoke/<command>.test.ts. Story 2.8 is the FIRST canonical
 * occupant of src/smoke/.
 *
 * Coverage:
 *   - Bash invoke 1 (run.ts) → AR9 stdout JSON line "dispatch"
 *   - Mocked Task dispatch (write expected artifact to staging/<runId>/outputs/)
 *   - Bash invoke 2 (verify-and-advance.ts --run-id <id> --tokens-in 100 --tokens-out 50)
 *   - State.yaml advance with lastSuccessfulStep
 *   - Canonical artifact promotion to _bmad-output/<phase>-artifacts/<step>.md
 *   - Transcript pair (.log + .json) under _bmad-output/.stepper/runs/
 *   - RunLogV1Schema validation of the JSON run-log
 *   - No-write-outside-tmpdir property (best-effort; tightened by
 *     src/integration/no-write-outside-scope.test.ts)
 *
 * Mocking strategy: per architecture §line 1265 (Layer 2 forbidden
 * from Task tool) + Story 2.7 line 794 (bun test cannot exercise
 * Layer 1 — no Claude API access in unit tests), the Task dispatch
 * is SUBSTITUTED by writing the expected artifact directly to
 * `_bmad-output/.stepper/staging/<runId>/outputs/<step>.md` (the
 * canonical staging path under STAGING_PATH; the dispatch-spec's
 * outputFormat.fileLocation is documented as `staging/<runId>/...`
 * but resolves under the absolute STAGING_PATH at runtime). The
 * verifier then runs identically to a real sub-agent run.
 *
 * AR35 tmpdir-per-test discipline: every test runs under a unique
 * os.tmpdir()-derived directory; cleanup via fs.rm in afterEach.
 * NEVER hard-coded /tmp/... paths.
 *
 * Step choice: --step bmad-brainstorming is the alphabetically-first
 * analyst-phase entry per seed-v6.x.ts:55-62 with empty after[],
 * persona=analyst, phase=analysis (mapped to planning-artifacts/ per
 * verify-and-advance.ts:227-231 derivePhaseFromStep lookup table).
 * Avoids cold-start optional-step halt (Story 2.4 run.test.ts:79-89).
 *
 * Deviations:
 *   - dev-001: Story spec asserts on "## State Before" / "## State After"
 *     headings in the markdown transcript; the actual emitter
 *     (src/runs/render-markdown.ts:109-110) emits a single "## State delta"
 *     section with state-transition bullets. The smoke asserts on the
 *     ACTUAL emitted heading.
 *   - dev-002: Story spec implies the test starts with "no state.yaml".
 *     The runner's loadStateUnlocked throws CorruptStateError when state
 *     is missing. The smoke seeds a minimal cold-start state.yaml at
 *     <tmp>/_bmad-output/.stepper/state.yaml in beforeEach (per the
 *     run.test.ts:52-64 writeMinimalState precedent). The fixture itself
 *     contains NO state.yaml (per AC line 711); the seed lives in the
 *     tmpdir copy only.
 *
 * CI matrix coverage (NFR-I5): Story 1.1's `.github/workflows/ci.yml`
 * already runs `bun test` on Linux + macOS via `oven-sh/setup-bun@v2`;
 * Story 2.8 piggybacks on that surface. No new CI configuration.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { DispatchActionV1Schema } from "../schemas/dispatch-protocol.ts";
import { RunLogV1Schema } from "../schemas/run-log.ts";

let tmp = "";
const REPO_ROOT = process.cwd();
const FIXTURE_ROOT = path.join(
  REPO_ROOT,
  "tests/fixtures/minimal-bmad-project",
);
const NEXT_RUN_TS = path.join(REPO_ROOT, "src/commands/next/run.ts");
const VERIFY_AND_ADVANCE_TS = path.join(
  REPO_ROOT,
  "src/commands/next/verify-and-advance.ts",
);

// ─── Lifecycle hooks ──────────────────────────────────────────────────────

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-smoke-next-"));
  // Copy _bmad/ from the fixture into the tmpdir.
  await copyDirectory(
    path.join(FIXTURE_ROOT, "_bmad"),
    path.join(tmp, "_bmad"),
  );
  // Materialize an empty _bmad-output/ per AC line 711.
  await fs.mkdir(path.join(tmp, "_bmad-output"), { recursive: true });
  // dev-002: seed a minimal cold-start state.yaml so loadStateUnlocked
  // does not throw CorruptStateError. Per run.test.ts:52-64 precedent.
  await fs.mkdir(path.join(tmp, "_bmad-output/.stepper"), { recursive: true });
  await Bun.write(
    path.join(tmp, "_bmad-output/.stepper/state.yaml"),
    Bun.YAML.stringify({
      schemaVersion: 1,
      project: { name: "smoke-test-project", bmadVersion: "6.5.0" },
      runHistory: [],
      checkpoints: [],
    }),
  );
  // Set up a fake BMAD plugin under <tmp>/.claude/plugins/ so the
  // dispatch-path BMAD pre-check (`detectBmadVersion`) clears under
  // the spawnRunner `HOME=tmp` env. Mirrors the pattern in
  // src/integration/doctor-marketplace.test.ts:53-67.
  const pluginDir = path.join(tmp, ".claude", "plugins", "bmad-method-6.5.0");
  await fs.mkdir(path.join(pluginDir, ".claude-plugin"), { recursive: true });
  await Bun.write(
    path.join(pluginDir, ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: "bmad-method", version: "6.5.0" }),
  );
});

afterEach(async () => {
  if (tmp !== "") {
    await fs.rm(tmp, { recursive: true, force: true });
    tmp = "";
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Recursively copy a directory tree using `fs.cp` (Node ≥ 16.7 / Bun ≥ 1.0
 * stable surface). The destination directory is created with `mkdir
 * { recursive: true }` first so `fs.cp` does not race with directory
 * creation.
 */
async function copyDirectory(src: string, dst: string): Promise<void> {
  await fs.mkdir(dst, { recursive: true });
  await fs.cp(src, dst, { recursive: true });
}

interface SpawnResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Spawn a script via `bun run` and capture stdout / stderr / exit code.
 * Mirrors src/integration/doctor-marketplace.test.ts:91-104 (Story 1.12)
 * verbatim: cwd: tmp (tmpdir-rooted state resolution); env spread +
 * HOME: tmp (~/.claude isolation, harmless for /bmad-next); pipe both
 * streams; await proc.exited; await Promise.all([stdout, stderr]) to
 * avoid pipe-buffer blocking.
 */
async function spawnRunner(
  scriptPath: string,
  args: readonly string[],
  cwd: string,
): Promise<SpawnResult> {
  const proc = Bun.spawn(["bun", "run", scriptPath, ...args], {
    cwd,
    env: { ...process.env, HOME: cwd },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}

/**
 * Parse the AR9 dispatch-action JSON line from a captured stdout buffer.
 * Asserts there is exactly ONE non-empty line (FR54 stdout discipline)
 * and round-trip-validates against DispatchActionV1Schema.
 */
function parseSingleAR9Line(stdout: string): unknown {
  const stdoutLines = stdout
    .trim()
    .split("\n")
    .filter((l) => l.length > 0);
  expect(stdoutLines.length).toBe(1);
  return DispatchActionV1Schema.parse(JSON.parse(stdoutLines[0] as string));
}

/**
 * Compute the absolute on-disk path to the staged artifact for a given
 * runId + step. The dispatch-spec's `outputFormat.fileLocation` is the
 * relative form `staging/<runId>/outputs/<step>.md`; the actual on-disk
 * file lives under `_bmad-output/.stepper/staging/<runId>/outputs/<step>.md`
 * (per STAGING_PATH = STEPPER_INTERNAL_ROOT/staging).
 */
function stagedArtifactPath(
  tmpdir: string,
  runId: string,
  stepName: string,
): string {
  return path.join(
    tmpdir,
    "_bmad-output/.stepper/staging",
    runId,
    "outputs",
    `${stepName}.md`,
  );
}

// ─── Smoke happy-path test (AC-1, AC-2, AC-3, AC-4) ───────────────────────

describe("smoke /bmad-next happy path", () => {
  it("invokes run.ts → mocks Task → invokes verify-and-advance.ts → asserts full pipeline", async () => {
    // ─── Step 1: Bash invoke 1 (run.ts) ───────────────────────────────────
    const result1 = await spawnRunner(
      NEXT_RUN_TS,
      ["--step", "bmad-brainstorming"],
      tmp,
    );
    expect(result1.exitCode).toBe(0);

    // FR54 stdout discipline + AR9 schema round-trip.
    const action1 = parseSingleAR9Line(result1.stdout);
    expect(action1).toMatchObject({ action: "dispatch", exitCode: 0 });
    if (typeof action1 !== "object" || action1 === null) {
      throw new Error("expected object");
    }
    const dispatchAction = action1 as {
      action: string;
      runId: string;
      agent: string;
      exitCode: number;
    };
    expect(dispatchAction.agent).toBe("bmad-step-runner");
    const runId = dispatchAction.runId;
    expect(runId.length).toBeGreaterThan(0);
    expect(runId).toContain("bmad-brainstorming");

    // ─── Step 2: Mocked Task dispatch ──────────────────────────────────────
    // Read the dispatch-spec for documentation purposes (the smoke does NOT
    // depend on its content — the staging path is canonical).
    const dispatchSpecPath = path.join(
      tmp,
      "_bmad-output/.stepper/staging",
      runId,
      "dispatch-spec.json",
    );
    const dispatchSpecExists = await Bun.file(dispatchSpecPath).exists();
    expect(dispatchSpecExists).toBe(true);

    // Write a mocked artifact satisfying the v0.1 default verifier
    // (bmad-brainstorming has no per-step verifier registered → `default`
    // baseline → empty requiredFiles + empty requiredFrontmatterSections;
    // the body still includes valid YAML frontmatter for forward-compat
    // with stricter per-step verifiers per Story 2.1).
    const outputPath = stagedArtifactPath(tmp, runId, "bmad-brainstorming");
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await Bun.write(
      outputPath,
      "---\ntitle: Smoke Test Artifact\nstatus: review\n---\n\n# Body\n\nLorem ipsum (smoke fixture).\n",
    );

    // ─── Step 3: Bash invoke 2 (verify-and-advance.ts) ────────────────────
    const result2 = await spawnRunner(
      VERIFY_AND_ADVANCE_TS,
      ["--run-id", runId, "--tokens-in", "100", "--tokens-out", "50"],
      tmp,
    );
    expect(result2.exitCode).toBe(0);
    const action2 = parseSingleAR9Line(result2.stdout);
    expect(action2).toMatchObject({ action: "report", exitCode: 0 });
    const reportAction = action2 as {
      action: string;
      message: string;
      exitCode: number;
    };
    // FR18 single-line summary shape per Story 2.6 verify-and-advance.ts:541.
    expect(reportAction.message.startsWith("✓ bmad-brainstorming → ")).toBe(
      true,
    );
    expect(reportAction.message).toContain("tokens: in=100 out=50");

    // ─── Step 4: Post-run assertions (AC line 714) ─────────────────────────

    // 4a. state.yaml advanced with lastSuccessfulStep = bmad-brainstorming.
    const statePath = path.join(tmp, "_bmad-output/.stepper/state.yaml");
    expect(await Bun.file(statePath).exists()).toBe(true);
    const stateText = await Bun.file(statePath).text();
    const state = Bun.YAML.parse(stateText) as {
      lastSuccessfulStep?: { step?: string };
      runHistory?: Array<{
        runId?: string;
        tokensIn?: number;
        tokensOut?: number;
        verifierStatus?: string;
      }>;
    };
    expect(state.lastSuccessfulStep?.step).toBe("bmad-brainstorming");
    expect(state.runHistory?.length).toBe(1);
    expect(state.runHistory?.[0]?.runId).toBe(runId);
    expect(state.runHistory?.[0]?.tokensIn).toBe(100);
    expect(state.runHistory?.[0]?.tokensOut).toBe(50);
    expect(state.runHistory?.[0]?.verifierStatus).toBe("pass");

    // 4b. Artifact promoted to canonical location
    //     (analysis-phase → planning-artifacts/ per derivePhaseFromStep).
    const canonicalPath = path.join(
      tmp,
      "_bmad-output/planning-artifacts/bmad-brainstorming.md",
    );
    expect(await Bun.file(canonicalPath).exists()).toBe(true);
    const canonicalText = await Bun.file(canonicalPath).text();
    expect(canonicalText).toContain("Smoke Test Artifact");

    // 4c. Transcript pair under _bmad-output/.stepper/runs/.
    const runsDir = path.join(tmp, "_bmad-output/.stepper/runs");
    const runEntries = await fs.readdir(runsDir);
    const logFile = runEntries.find((e) => e.endsWith(".log"));
    const jsonFile = runEntries.find((e) => e.endsWith(".json"));
    expect(logFile).toBeDefined();
    expect(jsonFile).toBeDefined();

    // 4d. Markdown transcript has expected sections per AR25 + Story 2.5.
    //     dev-001: the actual emitter (src/runs/render-markdown.ts:109-110)
    //     emits "## State delta" with state-transition bullets — NOT the
    //     "## State Before" / "## State After" sections the story spec
    //     mentions. Asserting on the actual emitted heading.
    const logText = await Bun.file(
      path.join(runsDir, logFile as string),
    ).text();
    expect(logText).toContain("## State delta");
    expect(logText).toContain("## Verifier result");
    expect(logText).toContain("## Outcome");
    expect(logText).toContain("bmad-brainstorming");

    // 4e. JSON run log validates against RunLogV1Schema.
    const jsonText = await Bun.file(
      path.join(runsDir, jsonFile as string),
    ).text();
    const runLog = JSON.parse(jsonText);
    expect(() => RunLogV1Schema.parse(runLog)).not.toThrow();
    // Sanity checks on key fields the smoke's contract depends on.
    expect(runLog.step).toBe("bmad-brainstorming");
    expect(runLog.runId).toBe(runId);
    expect(runLog.tokensIn).toBe(100);
    expect(runLog.tokensOut).toBe(50);
  });

  // ─── No-write-outside-tmpdir property (AC-5 — partial) ──────────────────
  it("does not write any files outside the test tmpdir during the happy path", async () => {
    // Snapshot the parent dir's mtime BEFORE the smoke. Per Story 2.8 §Task
    // 5.2: this is a NECESSARY but not SUFFICIENT check — the dedicated
    // src/integration/no-write-outside-scope.test.ts tightens this with a
    // recursive walk + system-wide path-prefix assertion.
    const parentDir = path.dirname(tmp);
    const parentMtimeBefore = (await fs.stat(parentDir)).mtimeMs;

    // Re-run the happy-path smoke (Task 4.1 condensed).
    const result1 = await spawnRunner(
      NEXT_RUN_TS,
      ["--step", "bmad-brainstorming"],
      tmp,
    );
    expect(result1.exitCode).toBe(0);
    const action1 = parseSingleAR9Line(result1.stdout) as {
      action: string;
      runId: string;
    };
    if (action1.action !== "dispatch") {
      throw new Error("expected dispatch");
    }
    const runId = action1.runId;

    const outputPath = stagedArtifactPath(tmp, runId, "bmad-brainstorming");
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await Bun.write(
      outputPath,
      "---\ntitle: Smoke Scope Test\nstatus: review\n---\n\n# Body\n",
    );

    const result2 = await spawnRunner(
      VERIFY_AND_ADVANCE_TS,
      ["--run-id", runId, "--tokens-in", "100", "--tokens-out", "50"],
      tmp,
    );
    expect(result2.exitCode).toBe(0);

    // Parent dir's mtime must be unchanged — no writes ABOVE tmpdir.
    // (mtime change indicates a child was added/removed; we expect ZERO
    // additions to the parent during the smoke.)
    const parentMtimeAfter = (await fs.stat(parentDir)).mtimeMs;
    expect(parentMtimeAfter).toBe(parentMtimeBefore);
  });
});
