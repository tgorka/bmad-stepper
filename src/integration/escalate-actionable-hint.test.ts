/**
 * src/integration/escalate-actionable-hint.test.ts — Story 5.4 integration
 * test (AC line 1113): asserts the AR22 actionable-hint regex
 * `/^.*(Run|See|Try|Check) /` matches over EVERY escalate path.
 *
 * Per OQ-4 decision: TABLE-DRIVEN — ONE outer describe block with a
 * parametrized inner test that sweeps the 10+ escalate paths. Each row
 * asserts:
 *   (a) the thrown error's `actionableHint` matches the regex;
 *   (b) the AR9 dispatch action's `message` field matches the regex;
 *   (c) the lastFailureReason.hint matches the regex;
 *   (d) NO Error.stack substring appears in the AR9 message (NFR-M2).
 *
 * Per AR42: tmpdir-per-test isolation. Per AR41: integration test
 * exercises top-tier (runVerifyAndAdvance) → mid-tier (failure-ux) →
 * foundational tier (errors registry + state schema) wiring.
 *
 * The test PASS-THROUGH common case (per OQ-2 audit) verifies that all
 * 17 existing StepperError class hints already match the regex; the
 * SHAPE default branch (escalateHandler safety-net) is exercised by
 * unit tests at src/failure-ux/escalate.test.ts (ESC_54_HANDLER_SHAPE_*).
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { runVerifyAndAdvance } from "../commands/next/verify-and-advance.ts";
import {
  BmadIncompatibleError,
  BmadNotInstalledError,
  ConfigError,
  errorRegistry,
  StateChangedDuringDispatchError,
  TimeoutError,
  VerifierFailureError,
} from "../errors.ts";
import {
  ACTIONABLE_HINT_REGEX,
  escalateHandler,
} from "../failure-ux/escalate.ts";
import type { FailureContext } from "../failure-ux/index.ts";
import type { DispatchSpecV1 } from "../schemas/dispatch-spec.ts";

let tmp = "";

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-integration-5-4-"));
});

afterEach(async () => {
  if (tmp !== "") {
    await fs.rm(tmp, { recursive: true, force: true });
    tmp = "";
  }
});

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

async function seedFixture(runId: string): Promise<FixturePaths> {
  const paths = fixturePaths();
  await Bun.write(
    paths.statePath,
    Bun.YAML.stringify({
      schemaVersion: 1,
      project: { name: "stepper-integration-5-4", bmadVersion: "6.5.0" },
      lastSuccessfulStep: {
        step: "bmad-create-story",
        epic: 5,
        story: "5.4",
        completedAt: "2026-05-05T00:00:00Z",
      },
      lastAttempted: null,
      lastFailureReason: null,
      runHistory: [],
      checkpoints: [],
    }),
  );
  const stagingDir = path.join(paths.stagingRoot, runId);
  await fs.mkdir(path.join(stagingDir, "outputs"), { recursive: true });
  await fs.mkdir(path.join(stagingDir, "inputs"), { recursive: true });
  const dispatchSpec: DispatchSpecV1 = {
    schemaVersion: 1,
    runId,
    step: "bmad-dev-story",
    epic: 5,
    story: "5.4",
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
  await Bun.write(
    path.join(stagingDir, "outputs", "bmad-dev-story.md"),
    "---\ntitle: Sample\nstatus: review\n---\n\n# Body\n",
  );
  return paths;
}

// ─── PART 1: PASS-THROUGH audit — all 17 existing class hints match regex ─

describe("ESC_54_INT — Story 5.4 integration: AR22 actionable-hint regex coverage over EVERY error class (PASS-THROUGH audit)", () => {
  /**
   * Iterate the entire error registry. Each class's actionableHint MUST
   * match the AR22 regex (the PASS-THROUGH common case per OQ-2).
   * Mirrors the Story 1.2 errors.test.ts CI gate pattern. CODIFIES the
   * regex per Story 5.4 OQ-2 forward-tracker (CI gate codification).
   */
  for (const [className, Ctor] of Object.entries(errorRegistry)) {
    it(`ESC_54_INT_REGISTRY_${className}: ${className}.actionableHint matches /^.*(Run|See|Try|Check) /`, () => {
      const instance = new Ctor("test message");
      expect(ACTIONABLE_HINT_REGEX.test(instance.actionableHint)).toBe(true);
    });
  }
});

// ─── PART 2: TABLE-DRIVEN — escalateHandler enrichment over every escalate path ─

describe("ESC_54_INT — Story 5.4 table-driven: escalateHandler enrichment over every escalate path (per AC line 1113)", () => {
  /**
   * The 10+ escalate paths per Task 10.2. Each row constructs a
   * representative FailureContext (mirroring what verify-and-advance.ts
   * would compose at the corresponding throw site) and asserts the
   * escalateHandler enrichment satisfies the AR22 regex contract.
   *
   * The AR22 regex assertion is the LOAD-BEARING contract per AC line
   * 1113; the path coverage is exhaustive per OQ-8 (10 primary rows +
   * optional 11th BMAD_INCOMPATIBLE / BMAD_NOT_INSTALLED).
   */
  type EscalatePathRow = {
    readonly name: string;
    readonly errClass: string;
    readonly contextHint: string;
  };

  // The contextHint values mirror the production hints produced at the
  // corresponding throw sites in verify-and-advance.ts (the in-flight
  // FailureContext.hint at lines 1056-1060) OR the StepperError class
  // actionableHint defaults (per OQ-2 — all 17 match the regex).
  const ESCALATE_PATHS: readonly EscalatePathRow[] = [
    {
      name: "retry-cap",
      errClass: "VerifierFailureError",
      contextHint: new VerifierFailureError("test").actionableHint,
    },
    {
      name: "skip-with-mismatch",
      errClass: "ConfigError",
      // Story 5.2 hintOverride at the skip-mismatch throw site.
      contextHint: new ConfigError(
        "skip mismatch",
        "lastAttempted.step does not match",
        "Run /bmad-next --skip <step> --resume; check state.yaml lastAttempted.step.",
      ).actionableHint,
    },
    {
      name: "skip-without-resume",
      errClass: "SkipRequiresResumeError",
      contextHint: new errorRegistry.SkipRequiresResumeError("test")
        .actionableHint,
    },
    {
      name: "skip-with-null-lastAttempted",
      errClass: "ConfigError",
      contextHint: new ConfigError(
        "null lastAttempted",
        undefined,
        "Run /bmad-next first, then --skip <step> --resume.",
      ).actionableHint,
    },
    {
      name: "skip-on-already-skipped",
      errClass: "ConfigError",
      contextHint: new ConfigError(
        "already skipped",
        undefined,
        "See state.yaml runHistory[]; this step is already skipped.",
      ).actionableHint,
    },
    {
      name: "route-to-fixer-cap",
      errClass: "VerifierFailureError",
      contextHint: new VerifierFailureError("post-fix-fail").actionableHint,
    },
    {
      name: "raw-verifier-failure",
      errClass: "VerifierFailureError",
      contextHint: new VerifierFailureError("raw fail").actionableHint,
    },
    {
      name: "sub-agent-timeout",
      errClass: "TimeoutError",
      contextHint: new TimeoutError("timeout").actionableHint,
    },
    {
      name: "dispatch-error",
      errClass: "ConfigError",
      contextHint: new ConfigError("dispatch error").actionableHint,
    },
    {
      name: "state-changed-during-dispatch",
      errClass: "StateChangedDuringDispatchError",
      contextHint: new StateChangedDuringDispatchError("toctou").actionableHint,
    },
    {
      name: "bmad-incompatible",
      errClass: "BmadIncompatibleError",
      contextHint: new BmadIncompatibleError("v1 vs v2").actionableHint,
    },
    {
      name: "bmad-not-installed",
      errClass: "BmadNotInstalledError",
      contextHint: new BmadNotInstalledError("not installed").actionableHint,
    },
  ];

  for (const row of ESCALATE_PATHS) {
    it(`ESC_54_INT_${row.name}: escalateHandler PASS-THROUGH preserves regex-matching hint for ${row.errClass}`, () => {
      const ctx: FailureContext = {
        code: "VERIFIER_FAILURE",
        message: `simulated ${row.name} failure`,
        hint: row.contextHint,
        runId: `2026-05-05T01-40-46-${row.name}-abc12`,
        step: "bmad-dev-story",
        attemptNumber: 1,
      };
      // (a) the input hint matches the regex (per OQ-2 audit).
      expect(ACTIONABLE_HINT_REGEX.test(ctx.hint)).toBe(true);
      // (b) escalateHandler enrichment yields a hint matching the regex.
      const out = escalateHandler(ctx, {});
      expect(out.outcome).toBe("escalate");
      if (out.outcome === "escalate") {
        expect(ACTIONABLE_HINT_REGEX.test(out.reason.hint)).toBe(true);
        // PASS-THROUGH: the hint is byte-identical (no shape applied).
        expect(out.reason.hint).toBe(ctx.hint);
        // (c) NO Error.stack substring in the hint (NFR-M2).
        expect(out.reason.hint).not.toContain("    at ");
        expect(out.reason.hint).not.toContain("Error:");
      }
    });
  }

  it("ESC_54_INT_SHAPE_DEFAULT: escalateHandler shapes a regex-matching default for non-matching hint (safety-net)", () => {
    const ctx: FailureContext = {
      code: "VERIFIER_FAILURE",
      message: "raw failure",
      hint: "no verb here",
      runId: "2026-05-05T01-40-46-shape-test",
      step: "bmad-dev-story",
      attemptNumber: 1,
    };
    expect(ACTIONABLE_HINT_REGEX.test(ctx.hint)).toBe(false);
    const out = escalateHandler(ctx, {});
    if (out.outcome === "escalate") {
      expect(ACTIONABLE_HINT_REGEX.test(out.reason.hint)).toBe(true);
      expect(out.reason.hint).toContain("--resume");
      expect(out.reason.hint).toContain(ctx.runId);
    }
  });
});

// ─── PART 3: end-to-end runVerifyAndAdvance escalate paths ────────────────

describe("ESC_54_INT — Story 5.4 end-to-end: runVerifyAndAdvance escalate paths emit AR22-conforming AR9 message + lastFailureReason.hint", () => {
  type RunRow = {
    readonly name: string;
    readonly policy: "retry" | "escalate" | "route-to-fixer";
    readonly verifierStatuses: ReadonlyArray<"pass" | "fail">;
    readonly maxRetries?: number;
    readonly fixerDispatch?: boolean;
  };

  const RUN_ROWS: readonly RunRow[] = [
    {
      name: "raw-verifier-failure",
      policy: "escalate",
      verifierStatuses: ["fail"],
    },
    {
      name: "retry-cap",
      policy: "retry",
      verifierStatuses: ["fail", "fail", "fail"],
      maxRetries: 2,
    },
    {
      name: "route-to-fixer-cap",
      policy: "route-to-fixer",
      verifierStatuses: ["fail", "fail"],
      fixerDispatch: true,
    },
  ];

  for (const row of RUN_ROWS) {
    it(`ESC_54_INT_E2E_${row.name}: end-to-end ${row.policy} → escalate → AR9 message + lastFailureReason.hint match regex`, async () => {
      const runId = `esc-54-int-e2e-${row.name}`;
      const paths = await seedFixture(runId);
      let callCount = 0;
      const verifierStub = async (
        _runId: string,
        _opts: { stepName: string; stagingRoot: string },
      ) => {
        const idx = callCount;
        callCount++;
        return {
          schemaVersion: 1 as const,
          status: row.verifierStatuses[idx] ?? "pass",
          checks: [],
          promotedTo: null,
          resultPath: "/tmp/test-verifier-result.json",
        };
      };
      const result = await runVerifyAndAdvance({
        argv: ["--run-id", runId, "--tokens-in", "0", "--tokens-out", "0"],
        statePath: paths.statePath,
        stagingRoot: paths.stagingRoot,
        canonicalRoot: paths.canonicalRoot,
        runsRoot: paths.runsRoot,
        lockOptions: { lockDir: paths.lockDir },
        nowIso: "2026-05-05T01:40:46.000Z",
        failurePolicyOverride: row.policy,
        ...(row.maxRetries !== undefined
          ? { maxRetriesOverride: row.maxRetries }
          : {}),
        verifierOverride: verifierStub,
        reDispatchOverride: () => {},
        ...(row.fixerDispatch === true
          ? {
              fixerDispatchOverride: async (fixerRunId: string) => {
                const fxStaging = `${paths.stagingRoot}/${fixerRunId}`;
                await fs.mkdir(`${fxStaging}/outputs`, { recursive: true });
                await Bun.write(
                  `${fxStaging}/outputs/bmad-dev-story.md`,
                  "# fixer output\n",
                );
              },
            }
          : {}),
      });
      // Halt path with exitCode 1 (VerifierFailureError per Story 5.1/5.3).
      expect(result.exitCode).toBe(1);
      expect(result.action.action).toBe("halt");
      if (result.action.action === "halt") {
        // (b) AR9 message matches the regex.
        expect(ACTIONABLE_HINT_REGEX.test(result.action.message)).toBe(true);
        // (d) NO Error.stack substring on main thread (NFR-M2).
        expect(result.action.message).not.toContain("    at ");
        expect(result.action.message).not.toContain("Error:");
      }
      // (c) lastFailureReason.hint matches the regex.
      const updated = Bun.YAML.parse(
        await Bun.file(paths.statePath).text(),
      ) as { lastFailureReason: { hint: string; code: string } | null };
      expect(updated.lastFailureReason).not.toBeNull();
      if (updated.lastFailureReason !== null) {
        expect(ACTIONABLE_HINT_REGEX.test(updated.lastFailureReason.hint)).toBe(
          true,
        );
      }
    });
  }
});
