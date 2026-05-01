/**
 * src/integration/halt-records-state.test.ts — Story 3.1 integration test
 * verifying every halt path persists `lastAttempted` + `lastFailureReason`
 * to `state.yaml` per FR5 + FR33 + epic AC line 736 (5-code coverage).
 *
 * Halt codes verified (epic AC line 736):
 *   - VERIFIER_FAILURE — verifier rejects the artifact
 *   - BRANCH_SWITCH — Story 1.8 branch detection (Story 3.1 v0.1: simulated
 *                     via subprocess module-mock; full Layer 2 check lives
 *                     in a future Story 6.x runner-tier wiring)
 *   - BMAD_INCOMPATIBLE — Story 1.9 BMAD-version detection (Story 3.1 v0.1:
 *                     simulated via subprocess module-mock)
 *   - TIMEOUT — sub-agent timeout (Story 3.1 v0.1: simulated via
 *                     subprocess module-mock on the verifier path)
 *   - BUDGET_EXCEEDED — token budget exceeded (Story 3.1 v0.1: simulated via
 *                     subprocess module-mock on the verifier path)
 *
 * Per AR35: tmpdir-per-test isolation; tests rely on injected paths only.
 * Per Story 2.8 precedent: integration tests under src/integration/ exercise
 * cross-tier flows that colocated tests cannot easily cover.
 *
 * Story 3.1 v0.1 subprocess-spawn strategy: BRANCH_SWITCH, BMAD_INCOMPATIBLE,
 * TIMEOUT, and BUDGET_EXCEEDED do NOT throw natively from any code path
 * inside `runVerifyAndAdvance` today — the verifier-tier (Story 2.1) does
 * NOT raise these classes, and the runner-tier check sites for
 * BRANCH_SWITCH (Story 1.8) and BMAD_INCOMPATIBLE (Story 1.9) live in
 * `run.ts` (the lock-free pre-dispatch), NOT in `verify-and-advance.ts`.
 * Story 3.1's contract is that ANY thrown `StepperError` produces the
 * canonical halt-state-record. We simulate the throws by spawning a
 * subprocess that mocks `../verifiers/index.ts` BEFORE invoking
 * `runVerifyAndAdvance`. The subprocess isolation prevents Bun's
 * `mock.module` global persistence from poisoning sibling test files
 * (Story 2.6 dev-004 carry-over: in-process `mock.module` cannot be
 * undone by `mock.restore()` and persists across test files).
 *
 * STATE_CHANGED_DURING_DISPATCH (the "natural" halt code from the
 * colocated test surface) is NOT in the AC line 736 list and is covered by
 * the colocated `verify-and-advance.test.ts` Story 3.1 test block.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { DispatchSpecV1 } from "../schemas/dispatch-spec.ts";
import { StateLatestSchema } from "../schemas/state.ts";

let tmp = "";
const REPO_ROOT = process.cwd();

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-integration-3-1-"));
});

afterEach(async () => {
  if (tmp !== "") {
    await fs.rm(tmp, { recursive: true, force: true });
    tmp = "";
  }
});

// ─── Fixture helpers ──────────────────────────────────────────────────────

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

const SEEDED_LAST_SUCCESSFUL_STEP = {
  step: "bmad-create-prd",
  epic: 1,
  story: "1.1",
  completedAt: "2026-04-29T00:00:00Z",
};

const LAST_ATTEMPTED_PAYLOAD = {
  step: "bmad-dev-story",
  epic: 1,
  story: "1.1",
  attemptedAt: "2026-05-01T07:30:00Z",
};

async function seedHaltFixture(runId: string): Promise<FixturePaths> {
  const paths = fixturePaths();
  // State seeded with a known lastSuccessfulStep + null halt fields.
  await Bun.write(
    paths.statePath,
    Bun.YAML.stringify({
      schemaVersion: 1,
      project: { name: "stepper-integration-3-1", bmadVersion: "6.5.0" },
      lastSuccessfulStep: SEEDED_LAST_SUCCESSFUL_STEP,
      lastAttempted: null,
      lastFailureReason: null,
      runHistory: [],
      checkpoints: [],
    }),
  );
  // Dispatch-spec under staging/<runId>/ with epic+story matching state
  // (state-hash check passes for these tests; the throw originates from
  // the verifier tier, not the TOCTOU check).
  const stagingDir = path.join(paths.stagingRoot, runId);
  await fs.mkdir(path.join(stagingDir, "outputs"), { recursive: true });
  await fs.mkdir(path.join(stagingDir, "inputs"), { recursive: true });
  const dispatchSpec: DispatchSpecV1 = {
    schemaVersion: 1,
    runId,
    step: "bmad-dev-story",
    epic: 1,
    story: "1.1",
    model: "sonnet",
    budget: { contextTokens: 60_000, timeoutMs: 300_000 },
    taskSpec: {
      persona: "dev",
      context: [],
      task: `Execute step bmad-dev-story for run ${runId}.`,
      outputFormat: {
        fileLocation: `staging/${runId}/outputs/bmad-dev-story.md`,
        requiredSections: [],
      },
      successCriteria: ["Artifact exists and verifier passes."],
      constraints: {
        allowedTools: ["Read", "Write", "Edit", "Grep", "Bash"],
        scopeLimits: `Only files inside staging/${runId}/ may be written.`,
      },
    },
  };
  await Bun.write(
    path.join(stagingDir, "dispatch-spec.json"),
    JSON.stringify(dispatchSpec, null, 2),
  );
  // Seed a minimal artifact under outputs/ (the readSubAgentOutput helper
  // logs a non-fatal warn when missing; presence keeps the transcript
  // clean).
  await Bun.write(
    path.join(stagingDir, "outputs", "bmad-dev-story.md"),
    "---\ntitle: Sample\nstatus: review\n---\n\n# Body\n\nLorem ipsum.\n",
  );
  return paths;
}

/**
 * Build a one-shot driver script that mocks `../../verifiers/index.ts` to
 * throw the named StepperError, invokes `runVerifyAndAdvance`, and exits
 * with the result code. Subprocess isolation prevents Bun's `mock.module`
 * global persistence from poisoning sibling test files.
 *
 * The driver writes its result (exitCode + action) to stdout as JSON for
 * the parent test to assert against.
 */
function buildDriverSource(
  errorClassName: string,
  errorArgs: readonly [string, string],
  scriptPaths: {
    readonly statePath: string;
    readonly stagingRoot: string;
    readonly canonicalRoot: string;
    readonly runsRoot: string;
    readonly lockDir: string;
  },
  runId: string,
): string {
  // The driver runs in a fresh Bun process; it imports test utilities and
  // production code via absolute paths under the repo root.
  const errorsModule = path.join(REPO_ROOT, "src/errors.ts");
  const verifiersModule = path.join(REPO_ROOT, "src/verifiers/index.ts");
  const runnerModule = path.join(
    REPO_ROOT,
    "src/commands/next/verify-and-advance.ts",
  );
  return `
import { mock } from "bun:test";
import { ${errorClassName} } from ${JSON.stringify(errorsModule)};

mock.module(${JSON.stringify(verifiersModule)}, () => ({
  runVerifier: () => {
    throw new ${errorClassName}(${JSON.stringify(errorArgs[0])}, ${JSON.stringify(errorArgs[1])});
  },
}));

const { runVerifyAndAdvance } = await import(${JSON.stringify(runnerModule)});
const result = await runVerifyAndAdvance({
  argv: [
    "--run-id", ${JSON.stringify(runId)},
    "--tokens-in", "100",
    "--tokens-out", "200",
    "--last-attempted-json", ${JSON.stringify(JSON.stringify(LAST_ATTEMPTED_PAYLOAD))},
  ],
  statePath: ${JSON.stringify(scriptPaths.statePath)},
  stagingRoot: ${JSON.stringify(scriptPaths.stagingRoot)},
  canonicalRoot: ${JSON.stringify(scriptPaths.canonicalRoot)},
  runsRoot: ${JSON.stringify(scriptPaths.runsRoot)},
  lockOptions: { lockDir: ${JSON.stringify(scriptPaths.lockDir)} },
  nowIso: "2026-05-01T08:00:00.000Z",
});
process.stdout.write(JSON.stringify({
  exitCode: result.exitCode,
  action: result.action,
}));
process.exit(0);
`;
}

interface DriverResult {
  readonly exitCode: number;
  readonly action: { action: string; message?: string; exitCode?: number };
}

async function runDriver(
  errorClassName: string,
  errorArgs: readonly [string, string],
  paths: FixturePaths,
  runId: string,
): Promise<DriverResult> {
  const scriptSrc = buildDriverSource(errorClassName, errorArgs, paths, runId);
  const scriptPath = path.join(tmp, `driver-${runId}.ts`);
  await Bun.write(scriptPath, scriptSrc);
  const proc = Bun.spawn(["bun", "run", scriptPath], {
    cwd: REPO_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  await proc.exited;
  if (stdout.trim().length === 0) {
    throw new Error(`Driver produced no stdout. stderr: ${stderr}`);
  }
  return JSON.parse(stdout) as DriverResult;
}

/**
 * Common assertion for every halt-code test: state.yaml carries the
 * canonical Story 3.1 fields after the halt.
 */
function assertHaltStateRecord(
  stateRaw: Record<string, unknown>,
  runId: string,
  expectedCode: string,
  haltMessage: string,
): void {
  // AC-1: lastAttempted matches forwarded payload.
  const lastAttempted = stateRaw.lastAttempted as
    | { step: string; epic: number; story: string; attemptedAt: string }
    | null
    | undefined;
  expect(lastAttempted?.step).toBe(LAST_ATTEMPTED_PAYLOAD.step);
  expect(lastAttempted?.epic).toBe(LAST_ATTEMPTED_PAYLOAD.epic);
  expect(lastAttempted?.story).toBe(LAST_ATTEMPTED_PAYLOAD.story);
  expect(lastAttempted?.attemptedAt).toBe(LAST_ATTEMPTED_PAYLOAD.attemptedAt);

  // AC-1: lastFailureReason carries the thrown StepperError's projection.
  const failureReason = stateRaw.lastFailureReason as
    | { code: string; message: string; hint: string; runId: string }
    | null
    | undefined;
  expect(failureReason?.code).toBe(expectedCode);
  expect(failureReason?.runId).toBe(runId);
  expect(typeof failureReason?.message).toBe("string");
  expect(typeof failureReason?.hint).toBe("string");
  // Cross-validation per Task 13.9: AR9 halt action's `message` matches
  // lastFailureReason.hint (both source from err.actionableHint).
  expect(haltMessage).toBe(failureReason?.hint as string);

  // AC-2: lastSuccessfulStep is UNCHANGED from the seed.
  const lastSuccess = stateRaw.lastSuccessfulStep as
    | { step: string; epic: number; story: string; completedAt: string }
    | undefined;
  expect(lastSuccess?.step).toBe(SEEDED_LAST_SUCCESSFUL_STEP.step);
  expect(lastSuccess?.epic).toBe(SEEDED_LAST_SUCCESSFUL_STEP.epic);
  expect(lastSuccess?.story).toBe(SEEDED_LAST_SUCCESSFUL_STEP.story);

  // AC line 736 invariant: state.yaml is re-loadable via StateLatestSchema
  // (no schema regression).
  const validated = StateLatestSchema.parse(stateRaw);
  expect(validated.schemaVersion).toBe(1);
  expect(validated.lastFailureReason?.code).toBe(expectedCode);
}

async function loadStateRaw(
  paths: FixturePaths,
): Promise<Record<string, unknown>> {
  const stateText = await Bun.file(paths.statePath).text();
  return Bun.YAML.parse(stateText) as Record<string, unknown>;
}

// ─── Halt-code matrix tests ──────────────────────────────────────────────

describe("halt-records-state integration — 5-code matrix per epic AC line 736", () => {
  it("VERIFIER_FAILURE: state.yaml records lastAttempted + lastFailureReason", async () => {
    const runId = "ints-3-1-vf";
    const paths = await seedHaltFixture(runId);
    const result = await runDriver(
      "VerifierFailureError",
      ["verifier rejected the artifact", "missing required section"],
      paths,
      runId,
    );
    expect(result.exitCode).toBe(1);
    expect(result.action.action).toBe("halt");
    const stateRaw = await loadStateRaw(paths);
    assertHaltStateRecord(
      stateRaw,
      runId,
      "VERIFIER_FAILURE",
      result.action.message ?? "",
    );
  });

  it("BRANCH_SWITCH: state.yaml records lastAttempted + lastFailureReason", async () => {
    const runId = "ints-3-1-bs";
    const paths = await seedHaltFixture(runId);
    const result = await runDriver(
      "BranchSwitchError",
      ["branch changed mid-dispatch", "main → feature/x"],
      paths,
      runId,
    );
    expect(result.exitCode).toBe(1);
    expect(result.action.action).toBe("halt");
    const stateRaw = await loadStateRaw(paths);
    assertHaltStateRecord(
      stateRaw,
      runId,
      "BRANCH_SWITCH",
      result.action.message ?? "",
    );
  });

  it("BMAD_INCOMPATIBLE: state.yaml records lastAttempted + lastFailureReason", async () => {
    const runId = "ints-3-1-bi";
    const paths = await seedHaltFixture(runId);
    const result = await runDriver(
      "BmadIncompatibleError",
      ["BMAD version mismatch", "installed: 6.4 expected: 6.5+"],
      paths,
      runId,
    );
    expect(result.exitCode).toBe(3);
    expect(result.action.action).toBe("halt");
    const stateRaw = await loadStateRaw(paths);
    assertHaltStateRecord(
      stateRaw,
      runId,
      "BMAD_INCOMPATIBLE",
      result.action.message ?? "",
    );
  });

  it("TIMEOUT: state.yaml records lastAttempted + lastFailureReason", async () => {
    const runId = "ints-3-1-to";
    const paths = await seedHaltFixture(runId);
    const result = await runDriver(
      "TimeoutError",
      ["verifier execution exceeded 300000ms", "timeout in runVerifier"],
      paths,
      runId,
    );
    expect(result.exitCode).toBe(1);
    expect(result.action.action).toBe("halt");
    const stateRaw = await loadStateRaw(paths);
    assertHaltStateRecord(
      stateRaw,
      runId,
      "TIMEOUT",
      result.action.message ?? "",
    );
  });

  it("BUDGET_EXCEEDED: state.yaml records lastAttempted + lastFailureReason", async () => {
    const runId = "ints-3-1-be";
    const paths = await seedHaltFixture(runId);
    const result = await runDriver(
      "BudgetExceededError",
      ["token budget exceeded", "tokensIn=60000+ exceeded contextTokens=60000"],
      paths,
      runId,
    );
    expect(result.exitCode).toBe(5);
    expect(result.action.action).toBe("halt");
    const stateRaw = await loadStateRaw(paths);
    assertHaltStateRecord(
      stateRaw,
      runId,
      "BUDGET_EXCEEDED",
      result.action.message ?? "",
    );
  });
});

// ─── Cross-cutting invariant tests ────────────────────────────────────────

describe("halt-records-state integration — cross-cutting invariants", () => {
  it("state.yaml after halt is byte-stable across two reads (no .bak rotation race)", async () => {
    const runId = "ints-3-1-stable";
    const paths = await seedHaltFixture(runId);
    await runDriver(
      "VerifierFailureError",
      ["verifier rejected the artifact", "missing required section"],
      paths,
      runId,
    );
    const firstRead = await Bun.file(paths.statePath).text();
    const secondRead = await Bun.file(paths.statePath).text();
    expect(firstRead).toBe(secondRead);
  });

  it("after halt, state.yaml's prior-failure context survives a re-load via StateLatestSchema", async () => {
    const runId = "ints-3-1-survive";
    const paths = await seedHaltFixture(runId);
    await runDriver(
      "VerifierFailureError",
      ["first failure", "x"],
      paths,
      runId,
    );
    const stateAfter = (await loadStateRaw(paths)) as Record<string, unknown>;
    expect(stateAfter.lastFailureReason).not.toBeNull();
    expect(stateAfter.lastAttempted).not.toBeNull();
    const validated = StateLatestSchema.parse(stateAfter);
    expect(validated.lastAttempted?.step).toBe(LAST_ATTEMPTED_PAYLOAD.step);
    expect(validated.lastFailureReason?.code).toBe("VERIFIER_FAILURE");
  });
});
