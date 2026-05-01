/**
 * src/commands/next/run.test.ts — Colocated tests for the canonical
 * lock-free `/bmad-next` runner (Story 2.4 AC-1 through AC-5 +
 * lock-free invariant + AR41 boundary + scope discipline).
 *
 * AR35 tmpdir-per-test pattern: every test runs under a unique
 * `os.tmpdir()`-derived directory; cleanup via `fs.rm({ recursive: true,
 * force: true })` in `afterEach`. NEVER hard-coded `/tmp/...` paths.
 *
 * Coverage map (Task 10 from story spec):
 *   - 10.2 AC-1 happy path (zero-config dispatch).
 *   - 10.3 AC-2 read-only flag tests (one per flag).
 *   - 10.4 AC-3 state-loading failure path.
 *   - 10.5 AC-4 schema validation (round-trip via DispatchActionV1Schema).
 *   - 10.6 AC-5 scope discipline (no writes outside staging/<runId>/).
 *   - 10.7 Lock-free invariant (mock-spy on `acquire` not invoked).
 *   - 10.8 Doctor delegation test.
 *   - 10.9 Mutually-exclusive flags test (Story 1.7 forward-dep closure).
 *   - 10.10 --upgrade deferral test (Story 6.9 hint).
 *   - 10.11 AR41 boundary test (programmatic source-content check).
 *   - 10.12 NFR-S1 no-network test (programmatic source-content check).
 *
 * Tests target the testable `runNext()` export — NOT the
 * `import.meta.main` entrypoint (covered by Story 2.8 smoke test).
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { DispatchActionV1Schema } from "../../schemas/dispatch-protocol.ts";
import { runNext } from "./run.ts";

let tmp = "";

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-next-"));
});

afterEach(async () => {
  if (tmp !== "") {
    await fs.rm(tmp, { recursive: true, force: true });
    tmp = "";
  }
});

/**
 * Seed a minimal valid state.yaml file at `tmp/state.yaml`. The state
 * has no `lastSuccessfulStep` so the runner picks the seed entry-point
 * (an analysis-phase step with empty `after[]`).
 */
async function writeMinimalState(stateText?: string): Promise<string> {
  const statePath = path.join(tmp, "state.yaml");
  const text =
    stateText ??
    Bun.YAML.stringify({
      schemaVersion: 1,
      project: { name: "stepper-test", bmadVersion: "6.5.0" },
      runHistory: [],
      checkpoints: [],
    });
  await Bun.write(statePath, text);
  return statePath;
}

/**
 * Common runNext invocation options for tmpdir-rooted tests.
 */
function commonOpts(statePath: string): Parameters<typeof runNext>[0] {
  return {
    projectRoot: tmp,
    statePath,
    stagingRoot: path.join(tmp, "staging"),
    skillNames: [],
    nowIso: "2026-04-29T10:15:00.000Z",
  };
}

// ─── AC-1: happy path (zero-config dispatch) ──────────────────────────────
//
// The seed-v6.x DAG (Story 1.10) marks ALL analysis-phase entry-points
// as `optional: true` — including some persona-null entries
// (bmad-advanced-elicitation, bmad-help, bmad-distillator) that fall
// through to the no-tier-resolves persona throw. The
// alphabetically-first entry-point with `--include-optional` is
// `bmad-advanced-elicitation` (persona null) — the runner halts with
// the verbatim AC-2 hint per Story 1.11. To exercise the dispatch
// happy path deterministically, the AC-1 tests use either an explicit
// `--step` argument or a seeded state with `lastSuccessfulStep`.

describe("runNext — AC-1 happy path (explicit --step bmad-brainstorming)", () => {
  it("emits action: 'dispatch' with valid AR9 line + creates dispatch-spec.json", async () => {
    const statePath = await writeMinimalState();

    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming"],
    });

    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("dispatch");
    if (result.action.action !== "dispatch") {
      throw new Error("type narrowing");
    }
    expect(result.action.runId.startsWith("2026-04-29T10-15-00-")).toBe(true);
    expect(result.action.agent).toBe("bmad-step-runner");
    expect(result.action.exitCode).toBe(0);

    // The on-disk dispatch-spec.json exists.
    const stagingDir = path.join(tmp, "staging", result.action.runId);
    const specPath = path.join(stagingDir, "dispatch-spec.json");
    const specStat = await fs.stat(specPath);
    expect(specStat.isFile()).toBe(true);

    // staging/<runId>/inputs/ + outputs/ exist.
    const inputsStat = await fs.stat(path.join(stagingDir, "inputs"));
    expect(inputsStat.isDirectory()).toBe(true);
    const outputsStat = await fs.stat(path.join(stagingDir, "outputs"));
    expect(outputsStat.isDirectory()).toBe(true);
  });

  it("picks the requested analysis-phase entry-point with persona 'analyst'", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming"],
    });
    expect(result.action.action).toBe("dispatch");
    if (result.action.action !== "dispatch") return;
    const specPath = path.join(
      tmp,
      "staging",
      result.action.runId,
      "dispatch-spec.json",
    );
    const spec = JSON.parse(await Bun.file(specPath).text());
    expect(spec.taskSpec.persona).toBe("analyst");
    expect(result.action.runId.includes("bmad-brainstorming")).toBe(true);
  });
});

describe("runNext — AC-1 happy path (post-first-step state)", () => {
  it("picks bmad-create-epics-and-stories after lastSuccessfulStep=bmad-create-prd", async () => {
    // Seed a state where bmad-create-prd is the last successful step.
    // bmad-create-epics-and-stories has after: [bmad-create-prd] and is
    // non-optional, so it's the unique post-first-step candidate.
    const stateText = Bun.YAML.stringify({
      schemaVersion: 1,
      project: { name: "stepper-test", bmadVersion: "6.5.0" },
      lastSuccessfulStep: {
        step: "bmad-create-prd",
        epic: 1,
        story: "1.5",
        completedAt: "2026-04-29T10:00:00Z",
      },
      runHistory: [],
      checkpoints: [],
    });
    const statePath = await writeMinimalState(stateText);

    const result = await runNext({
      ...commonOpts(statePath),
      argv: [],
    });

    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("dispatch");
    if (result.action.action !== "dispatch") return;
    expect(result.action.runId.includes("bmad-create-epics-and-stories")).toBe(
      true,
    );
    expect(result.action.agent).toBe("bmad-step-runner");
  });

  it("populates taskSpec.constraints.allowedTools (5 tools per Story 2.2)", async () => {
    const stateText = Bun.YAML.stringify({
      schemaVersion: 1,
      project: { name: "stepper-test", bmadVersion: "6.5.0" },
      lastSuccessfulStep: {
        step: "bmad-create-prd",
        epic: 1,
        story: "1.5",
        completedAt: "2026-04-29T10:00:00Z",
      },
      runHistory: [],
      checkpoints: [],
    });
    const statePath = await writeMinimalState(stateText);
    const result = await runNext({
      ...commonOpts(statePath),
      argv: [],
    });
    expect(result.action.action).toBe("dispatch");
    if (result.action.action !== "dispatch") return;
    const specPath = path.join(
      tmp,
      "staging",
      result.action.runId,
      "dispatch-spec.json",
    );
    const spec = JSON.parse(await Bun.file(specPath).text());
    expect(spec.taskSpec.constraints.allowedTools).toEqual([
      "Read",
      "Write",
      "Edit",
      "Grep",
      "Bash",
    ]);
    expect(spec.taskSpec.constraints.scopeLimits).toMatch(
      /^Only files inside staging\/.+\/ may be written\.$/,
    );
  });

  it("populates taskSpec.outputFormat.requiredSections from Story 2.1 verifier registry (Story 2.2 carry-over)", async () => {
    const stateText = Bun.YAML.stringify({
      schemaVersion: 1,
      project: { name: "stepper-test", bmadVersion: "6.5.0" },
      lastSuccessfulStep: {
        step: "bmad-create-prd",
        epic: 1,
        story: "1.5",
        completedAt: "2026-04-29T10:00:00Z",
      },
      runHistory: [],
      checkpoints: [],
    });
    const statePath = await writeMinimalState(stateText);
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-dev-story"],
    });
    expect(result.action.action).toBe("dispatch");
    if (result.action.action !== "dispatch") return;
    const specPath = path.join(
      tmp,
      "staging",
      result.action.runId,
      "dispatch-spec.json",
    );
    const spec = JSON.parse(await Bun.file(specPath).text());
    // The verifier registry has no entry for "bmad-dev-story" (the
    // registry uses short names like "dev-story", not the kebab-prefixed
    // BMAD skill names). The default fallback returns []; this is the
    // Story 2.1 dev-001 invariant.
    expect(spec.taskSpec.outputFormat.requiredSections).toEqual([]);
  });

  it("populates taskSpec.context[] from DAG node after[] (Story 2.2 carry-over)", async () => {
    const stateText = Bun.YAML.stringify({
      schemaVersion: 1,
      project: { name: "stepper-test", bmadVersion: "6.5.0" },
      lastSuccessfulStep: {
        step: "bmad-create-prd",
        epic: 1,
        story: "1.5",
        completedAt: "2026-04-29T10:00:00Z",
      },
      runHistory: [],
      checkpoints: [],
    });
    const statePath = await writeMinimalState(stateText);
    const result = await runNext({
      ...commonOpts(statePath),
      argv: [],
    });
    expect(result.action.action).toBe("dispatch");
    if (result.action.action !== "dispatch") return;
    const specPath = path.join(
      tmp,
      "staging",
      result.action.runId,
      "dispatch-spec.json",
    );
    const spec = JSON.parse(await Bun.file(specPath).text());
    // bmad-create-epics-and-stories has after: [bmad-create-prd]. The
    // populator emits a context entry for the prerequisite.
    expect(Array.isArray(spec.taskSpec.context)).toBe(true);
    expect(spec.taskSpec.context.length).toBeGreaterThan(0);
    const ctx = spec.taskSpec.context[0];
    expect(ctx.label).toBe("bmad-create-prd");
    expect(ctx.path.startsWith("_bmad-output/")).toBe(true);
  });
});

// ─── AC-2: read-only flag report paths ────────────────────────────────────

describe("runNext — AC-2 read-only flag tests", () => {
  it("--list emits action: 'report' with candidate step list", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--list"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    expect(result.action.exitCode).toBe(0);
    expect(result.action.message).toContain("Candidate next steps:");
  });

  it("--explain emits action: 'report' with deferred-to-Story-3.6 hint", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--explain"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    expect(result.action.message).toContain("Story 3.6");
  });

  it("--diff-state emits action: 'report' with deferred-to-Story-3.8 hint", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--diff-state"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    expect(result.action.message).toContain("Story 3.8");
  });

  it("--export-state emits action: 'report' with deferred-to-Story-3.10 hint", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--export-state"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    expect(result.action.message).toContain("Story 3.10");
  });

  it("--dry-run emits action: 'report' starting with 'Dry-run: would dispatch step '", async () => {
    // Seed a post-first-step state to surface a non-optional candidate.
    const stateText = Bun.YAML.stringify({
      schemaVersion: 1,
      project: { name: "stepper-test", bmadVersion: "6.5.0" },
      lastSuccessfulStep: {
        step: "bmad-create-prd",
        epic: 1,
        story: "1.5",
        completedAt: "2026-04-29T10:00:00Z",
      },
      runHistory: [],
      checkpoints: [],
    });
    const statePath = await writeMinimalState(stateText);
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--dry-run"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    expect(
      result.action.message.startsWith("Dry-run: would dispatch step "),
    ).toBe(true);
    // The dispatch-spec WAS still written to staging.
    const stagingEntries = await fs.readdir(path.join(tmp, "staging"));
    expect(stagingEntries.length).toBeGreaterThan(0);
  });
});

// ─── AC-3: state-loading failure path ─────────────────────────────────────

describe("runNext — AC-3 state-loading failure path", () => {
  it("emits action: 'halt' with exitCode 1 + actionable hint when state.yaml is missing", async () => {
    // Write empty state.yaml (size 0).
    const statePath = path.join(tmp, "state.yaml");
    await Bun.write(statePath, "");

    const result = await runNext({
      ...commonOpts(statePath),
      argv: [],
    });

    expect(result.exitCode).toBe(1);
    expect(result.action.action).toBe("halt");
    if (result.action.action !== "halt") return;
    expect(result.action.exitCode).toBe(1);
    // CorruptStateError.actionableHint starts with "Run /bmad-next…".
    expect(result.action.message.startsWith("Run /bmad-next")).toBe(true);
  });
});

// ─── AC-4: schema validation defence-in-depth ─────────────────────────────

describe("runNext — AC-4 schema validation", () => {
  it("the emitted action validates against DispatchActionV1Schema (dispatch path)", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming"],
    });
    // Round-trip via JSON.stringify + JSON.parse + schema.parse.
    const roundTripped = JSON.parse(JSON.stringify(result.action));
    const parsed = DispatchActionV1Schema.parse(roundTripped);
    expect(parsed.action).toBe("dispatch");
  });

  it("the emitted action validates against DispatchActionV1Schema (report path)", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--list"],
    });
    const parsed = DispatchActionV1Schema.parse(
      JSON.parse(JSON.stringify(result.action)),
    );
    expect(parsed.action).toBe("report");
  });

  it("the emitted action validates against DispatchActionV1Schema (halt path)", async () => {
    const statePath = path.join(tmp, "state.yaml");
    await Bun.write(statePath, "");
    const result = await runNext({
      ...commonOpts(statePath),
      argv: [],
    });
    const parsed = DispatchActionV1Schema.parse(
      JSON.parse(JSON.stringify(result.action)),
    );
    expect(parsed.action).toBe("halt");
  });
});

// ─── AC-5: scope discipline (no writes outside staging/) ──────────────────

describe("runNext — AC-5 scope discipline", () => {
  it("does NOT write outside staging/<runId>/", async () => {
    const statePath = await writeMinimalState();

    // Snapshot the tmpdir contents BEFORE the call.
    const beforeEntries = await listAllFiles(tmp);

    await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming"],
    });

    const afterEntries = await listAllFiles(tmp);
    const newEntries = afterEntries.filter((e) => !beforeEntries.includes(e));

    // Every NEW file must live under staging/<runId>/.
    const stagingPrefix = path.join(tmp, "staging") + path.sep;
    for (const entry of newEntries) {
      expect(entry.startsWith(stagingPrefix)).toBe(true);
    }
  });

  it("does NOT touch state.yaml on the dispatch path", async () => {
    const statePath = await writeMinimalState();
    const beforeMtime = (await fs.stat(statePath)).mtimeMs;
    await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming"],
    });
    const afterMtime = (await fs.stat(statePath)).mtimeMs;
    expect(afterMtime).toBe(beforeMtime);
    // No state.yaml.bak rotation.
    await expect(fs.access(`${statePath}.bak`)).rejects.toThrow();
  });
});

async function listAllFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else {
        out.push(full);
      }
    }
  }
  await walk(root);
  return out;
}

// ─── Lock-free invariant (mock-spy on `acquire`) ──────────────────────────

describe("runNext — lock-free invariant (architecture line 1672 + AR8)", () => {
  it("never invokes `acquire` from src/lock/lock.ts during dispatch", async () => {
    const statePath = await writeMinimalState();
    const acquireSpy = mock(() => Promise.resolve({}));
    // Use Bun's mock.module to spy on the lock module. Even when
    // mocked, the module is irrelevant to the lock-free runner — the
    // spy assertion is sufficient.
    mock.module("../../lock/lock.ts", () => ({
      acquire: acquireSpy,
      forceUnlock: mock(() => Promise.resolve()),
      LOCK_DIR_REL: "_bmad-output/.stepper/state.yaml.lock",
      PID_FILE_NAME: "pid",
      HEARTBEAT_INTERVAL_MS: 5_000,
      STALE_THRESHOLD_MS: 30_000,
      STALE_THRESHOLD_FALLBACK_MS: 60_000,
    }));

    await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming"],
    });

    expect(acquireSpy).not.toHaveBeenCalled();
  });
});

// ─── Doctor delegation ────────────────────────────────────────────────────

describe("runNext — doctor delegation (Story 1.12 reuse)", () => {
  it("--doctor emits action: 'report' with the doctor's structured output", async () => {
    // Skip the BMAD-detected happy path; instead surface the BMAD-not-
    // installed exit-3 path via the home-dir not having a plugin layout.
    // The doctor's output gets reformatted as the report message.
    const statePath = await writeMinimalState();
    const result = await runNext({
      projectRoot: tmp,
      statePath,
      stagingRoot: path.join(tmp, "staging"),
      skillNames: [],
      nowIso: "2026-04-29T10:15:00.000Z",
      argv: ["--doctor"],
    });

    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    // The doctor's output appears in the message — at minimum the
    // synthesised error line for the (likely) BMAD-not-installed path
    // OR the happy-path 5-line block. The message must be non-empty.
    expect(result.action.message.length).toBeGreaterThan(0);
  });
});

// ─── Mutually-exclusive flags (Story 1.7 forward-dep closure) ────────────

describe("runNext — mutually-exclusive flags (Story 1.7 cross-validation gap)", () => {
  it("--include-optional + --no-optional → halt with exitCode 2 + actionable hint", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--include-optional", "--no-optional"],
    });
    expect(result.exitCode).toBe(2);
    expect(result.action.action).toBe("halt");
    if (result.action.action !== "halt") return;
    expect(result.action.exitCode).toBe(2);
    expect(result.action.message).toBe(
      "Pass either --include-optional or --no-optional, not both.",
    );
  });
});

// ─── Forward-deferral guards ──────────────────────────────────────────────

describe("runNext — forward-deferral guards", () => {
  it("--upgrade halts with exitCode 1 + Story 6.9 hint", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--upgrade"],
    });
    expect(result.exitCode).toBe(1);
    expect(result.action.action).toBe("halt");
    if (result.action.action !== "halt") return;
    expect(result.action.message).toContain("Story 6.9");
  });

  it("--watch halts with exitCode 1 + Story 3.9 hint", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--watch"],
    });
    expect(result.exitCode).toBe(1);
    expect(result.action.action).toBe("halt");
    if (result.action.action !== "halt") return;
    expect(result.action.message).toContain("Story 3.9");
  });

  it("--force-unlock halts with exitCode 1 + Story 6.x hint", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--force-unlock"],
    });
    expect(result.exitCode).toBe(1);
    expect(result.action.action).toBe("halt");
    if (result.action.action !== "halt") return;
    expect(result.action.message).toContain("Story 6.x");
  });
});

// ─── AR41 boundary (programmatic source-content check) ────────────────────

describe("runNext — AR41 boundary check (architecture lines 1294-1302)", () => {
  it("src/commands/next/run.ts does NOT import from forbidden modules", async () => {
    const source = await Bun.file(path.join(import.meta.dir, "run.ts")).text();
    // Forbidden imports per the lock-free + AR41 contract:
    expect(source).not.toMatch(/from\s+["']\.\.\/\.\.\/lock\//);
    expect(source).not.toMatch(/from\s+["']\.\.\/\.\.\/state\/save/);
    expect(source).not.toMatch(/from\s+["']\.\.\/\.\.\/snapshot\//);
    expect(source).not.toMatch(/from\s+["']node:child_process["']/);
  });

  it("src/commands/next/run.ts does NOT call the locked loadState variant", async () => {
    const source = await Bun.file(path.join(import.meta.dir, "run.ts")).text();
    // Strip JSDoc/comment lines so the check inspects executable code
    // only — the file's docblock is allowed to mention forbidden APIs
    // for prose context.
    const code = source
      .split("\n")
      .filter((line) => !/^\s*\*/.test(line) && !/^\s*\/\//.test(line))
      .join("\n");
    // The unlocked variant (loadStateUnlocked) IS allowed; the locked
    // variant (loadState as a call expression) is forbidden.
    expect(code).not.toMatch(/\bloadState\(/);
    // saveState (lock-required write surface) is forbidden as either
    // an import binding or a call expression.
    expect(code).not.toMatch(/\bsaveState\(/);
    expect(code).not.toMatch(/\{\s*saveState\b/);
  });

  it("STEP_RUNNER_AGENT literal matches Story 2.3 frontmatter `name:` verbatim", async () => {
    const source = await Bun.file(path.join(import.meta.dir, "run.ts")).text();
    expect(source).toContain('STEP_RUNNER_AGENT = "bmad-step-runner"');
  });
});

// ─── NFR-S1 (no main-thread network) ──────────────────────────────────────

describe("runNext — NFR-S1 (no main-thread network)", () => {
  it("src/commands/next/run.ts has no fetch / http / https / net references", async () => {
    const source = await Bun.file(path.join(import.meta.dir, "run.ts")).text();
    expect(source).not.toMatch(/\bfetch\(/);
    expect(source).not.toMatch(/Bun\.fetch/);
    expect(source).not.toMatch(/from\s+["']node:http["']/);
    expect(source).not.toMatch(/from\s+["']node:https["']/);
    expect(source).not.toMatch(/from\s+["']node:net["']/);
  });
});

// ─── Story 3.1: AR9 dispatch lastAttempted payload extension ──────────────

describe("runNext — Story 3.1 lastAttempted on AR9 dispatch action", () => {
  it("dispatch emit includes lastAttempted with correct shape", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming"],
    });
    expect(result.action.action).toBe("dispatch");
    if (result.action.action !== "dispatch") return;
    expect(result.action.lastAttempted).toBeDefined();
    expect(result.action.lastAttempted?.step).toBe("bmad-brainstorming");
    // dispatch-spec gets epic/story from state defaults: 0 and "0.0"
    // when the seed state has no lastSuccessfulStep.
    expect(typeof result.action.lastAttempted?.epic).toBe("number");
    expect(typeof result.action.lastAttempted?.story).toBe("string");
    expect(typeof result.action.lastAttempted?.attemptedAt).toBe("string");
  });

  it("dispatch lastAttempted.attemptedAt matches injected nowIso", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming"],
    });
    if (result.action.action !== "dispatch") return;
    expect(result.action.lastAttempted?.attemptedAt).toBe(
      "2026-04-29T10:15:00.000Z",
    );
  });

  it("dispatch lastAttempted.epic+story carry from dispatchSpec literal", async () => {
    // Post-first-step state: bmad-create-prd succeeded at epic=1 story=1.5.
    const stateText = Bun.YAML.stringify({
      schemaVersion: 1,
      project: { name: "stepper-test", bmadVersion: "6.5.0" },
      lastSuccessfulStep: {
        step: "bmad-create-prd",
        epic: 1,
        story: "1.5",
        completedAt: "2026-04-29T10:00:00Z",
      },
      runHistory: [],
      checkpoints: [],
    });
    const statePath = await writeMinimalState(stateText);
    const result = await runNext({
      ...commonOpts(statePath),
      argv: [],
    });
    if (result.action.action !== "dispatch") return;
    expect(result.action.lastAttempted?.epic).toBe(1);
    expect(result.action.lastAttempted?.story).toBe("1.5");
    expect(result.action.lastAttempted?.step).toBe(
      "bmad-create-epics-and-stories",
    );
  });

  it("--dry-run report does NOT include lastAttempted (only dispatch variant carries it)", async () => {
    const stateText = Bun.YAML.stringify({
      schemaVersion: 1,
      project: { name: "stepper-test", bmadVersion: "6.5.0" },
      lastSuccessfulStep: {
        step: "bmad-create-prd",
        epic: 1,
        story: "1.5",
        completedAt: "2026-04-29T10:00:00Z",
      },
      runHistory: [],
      checkpoints: [],
    });
    const statePath = await writeMinimalState(stateText);
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--dry-run"],
    });
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    // The report variant has no lastAttempted field at all (TypeScript
    // narrowing — discriminated union excludes it from this branch).
    expect("lastAttempted" in result.action).toBe(false);
  });

  it("halt action does NOT include lastAttempted (only dispatch variant carries it)", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--include-optional", "--no-optional"],
    });
    expect(result.action.action).toBe("halt");
    if (result.action.action !== "halt") return;
    expect("lastAttempted" in result.action).toBe(false);
  });

  it("the extended action with lastAttempted validates against DispatchActionV1Schema", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming"],
    });
    const roundTripped = JSON.parse(JSON.stringify(result.action));
    const parsed = DispatchActionV1Schema.parse(roundTripped);
    expect(parsed.action).toBe("dispatch");
    if (parsed.action !== "dispatch") return;
    expect(parsed.lastAttempted?.step).toBe("bmad-brainstorming");
  });
});

// ─── Story 3.2: --resume flag (epic AC lines 738-754) ─────────────────────

describe("runNext — Story 3.2 --resume flag", () => {
  /**
   * Helper: seed a state.yaml with a prior halted attempt.
   *
   * `failureCode` is one of the 16 registry codes. Passing `null` for
   * `failureCode` simulates the edge case where `state.lastAttempted` is
   * set but `state.lastFailureReason` is null (e.g., the user killed the
   * process between `run.ts` exit and `verify-and-advance.ts` start).
   */
  async function writeResumeState(opts: {
    lastAttempted: {
      step: string;
      epic: number;
      story: string;
      attemptedAt: string;
    } | null;
    failureCode?: string | null;
    failureMessage?: string;
    failureRunId?: string;
    lastSuccessfulStep?: {
      step: string;
      epic: number;
      story: string;
      completedAt: string;
    } | null;
  }): Promise<string> {
    const stateObj: Record<string, unknown> = {
      schemaVersion: 1,
      project: { name: "stepper-test", bmadVersion: "6.5.0" },
      runHistory: [],
      checkpoints: [],
    };
    if (opts.lastSuccessfulStep !== undefined) {
      stateObj.lastSuccessfulStep = opts.lastSuccessfulStep;
    }
    stateObj.lastAttempted = opts.lastAttempted;
    if (opts.failureCode === null) {
      stateObj.lastFailureReason = null;
    } else if (opts.failureCode !== undefined) {
      stateObj.lastFailureReason = {
        code: opts.failureCode,
        message: opts.failureMessage ?? "halt detail",
        hint: "Run /bmad-next --resume after fixing the underlying issue.",
        runId: opts.failureRunId ?? "abc123",
      };
    }
    return writeMinimalState(Bun.YAML.stringify(stateObj));
  }

  // ─── AC-1 happy path ──────────────────────────────────────────────────

  it("AC-1 happy path: resume re-dispatches the cached lastAttempted step", async () => {
    const statePath = await writeResumeState({
      lastSuccessfulStep: {
        step: "bmad-create-prd",
        epic: 1,
        story: "1.0",
        completedAt: "2026-04-28T10:00:00Z",
      },
      lastAttempted: {
        step: "bmad-dev-story",
        epic: 2,
        story: "2.1",
        attemptedAt: "2026-04-29T11:00:00Z",
      },
      failureCode: "VERIFIER_FAILURE",
      failureMessage: "missing Checklist",
      failureRunId: "abc123",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--resume"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("dispatch");
    if (result.action.action !== "dispatch") return;
    // Resume target carried verbatim from state.lastAttempted (NOT
    // recomputed from state.lastSuccessfulStep).
    expect(result.action.lastAttempted?.step).toBe("bmad-dev-story");
    expect(result.action.lastAttempted?.epic).toBe(2);
    expect(result.action.lastAttempted?.story).toBe("2.1");
  });

  it("AC-1 context-surfacing: resume appends 2 context entries (failure transcript + last-attempt artifact)", async () => {
    const statePath = await writeResumeState({
      lastSuccessfulStep: {
        step: "bmad-create-prd",
        epic: 1,
        story: "1.0",
        completedAt: "2026-04-28T10:00:00Z",
      },
      lastAttempted: {
        step: "bmad-dev-story",
        epic: 2,
        story: "2.1",
        attemptedAt: "2026-04-29T11:00:00Z",
      },
      failureCode: "VERIFIER_FAILURE",
      failureMessage: "missing Checklist",
      failureRunId: "abc123",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--resume"],
    });
    expect(result.action.action).toBe("dispatch");
    if (result.action.action !== "dispatch") return;
    const specPath = path.join(
      tmp,
      "staging",
      result.action.runId,
      "dispatch-spec.json",
    );
    const spec = JSON.parse(await Bun.file(specPath).text());
    const ctx = spec.taskSpec.context as Array<{ path: string; label: string }>;
    // The 2 NEW resume-context entries are appended LAST (recency bias).
    const failureEntry = ctx.find((c) =>
      c.label.startsWith("Previous failure: VERIFIER_FAILURE"),
    );
    expect(failureEntry).toBeDefined();
    expect(failureEntry?.path).toBe("_bmad-output/.stepper/runs/abc123/log.md");
    expect(failureEntry?.label).toContain("missing Checklist");
    const artifactEntry = ctx.find(
      (c) =>
        c.label === "Last attempted artifact (may be missing or incomplete)",
    );
    expect(artifactEntry).toBeDefined();
    // bmad-dev-story is implementation phase per the seed DAG → maps to
    // the implementation-artifacts/ prefix.
    expect(artifactEntry?.path).toBe(
      "_bmad-output/implementation-artifacts/bmad-dev-story.md",
    );
  });

  // ─── AC-2: missing lastAttempted ──────────────────────────────────────

  it("AC-2 missing lastAttempted: halts with verbatim hint per epic AC line 751", async () => {
    const statePath = await writeResumeState({
      lastSuccessfulStep: null,
      lastAttempted: null,
      failureCode: null,
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--resume"],
    });
    expect(result.exitCode).toBe(2);
    expect(result.action.action).toBe("halt");
    if (result.action.action !== "halt") return;
    expect(result.action.message).toBe(
      "No prior halt to resume from. Run /bmad-next to advance to the next step.",
    );
    expect(result.action.exitCode).toBe(2);
  });

  // ─── AC-1 recoverability gate ─────────────────────────────────────────

  it("AC-1 non-recoverable BMAD_INCOMPATIBLE: halts with the non-resumable hint", async () => {
    const statePath = await writeResumeState({
      lastAttempted: {
        step: "bmad-dev-story",
        epic: 2,
        story: "2.1",
        attemptedAt: "2026-04-29T11:00:00Z",
      },
      failureCode: "BMAD_INCOMPATIBLE",
      failureMessage: "BMAD 5.x detected",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--resume"],
    });
    expect(result.exitCode).toBe(2);
    expect(result.action.action).toBe("halt");
    if (result.action.action !== "halt") return;
    expect(result.action.message).toBe(
      "Last failure was BMAD_INCOMPATIBLE which is not resumable. Run /bmad-next --doctor to inspect the BMAD installation, then re-run /bmad-next.",
    );
    expect(result.action.exitCode).toBe(2);
  });

  it("AC-1 non-recoverable BMAD_NOT_INSTALLED: halts with the non-resumable hint", async () => {
    const statePath = await writeResumeState({
      lastAttempted: {
        step: "bmad-dev-story",
        epic: 2,
        story: "2.1",
        attemptedAt: "2026-04-29T11:00:00Z",
      },
      failureCode: "BMAD_NOT_INSTALLED",
      failureMessage: "no BMAD plugin found",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--resume"],
    });
    expect(result.exitCode).toBe(2);
    expect(result.action.action).toBe("halt");
    if (result.action.action !== "halt") return;
    expect(result.action.message).toContain("BMAD_NOT_INSTALLED");
    expect(result.action.message).toContain("not resumable");
    expect(result.action.message).toContain("--doctor");
  });

  // ─── Edge: lastAttempted set but lastFailureReason null ───────────────

  it("Edge: lastAttempted set + lastFailureReason null → resume succeeds with 1 context entry", async () => {
    const statePath = await writeResumeState({
      lastAttempted: {
        step: "bmad-dev-story",
        epic: 2,
        story: "2.1",
        attemptedAt: "2026-04-29T11:00:00Z",
      },
      failureCode: null,
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--resume"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("dispatch");
    if (result.action.action !== "dispatch") return;
    const specPath = path.join(
      tmp,
      "staging",
      result.action.runId,
      "dispatch-spec.json",
    );
    const spec = JSON.parse(await Bun.file(specPath).text());
    const ctx = spec.taskSpec.context as Array<{ path: string; label: string }>;
    // No failure-reason entry; only the artifact-path entry is added.
    const failureEntry = ctx.find((c) =>
      c.label.startsWith("Previous failure:"),
    );
    expect(failureEntry).toBeUndefined();
    const artifactEntry = ctx.find(
      (c) =>
        c.label === "Last attempted artifact (may be missing or incomplete)",
    );
    expect(artifactEntry).toBeDefined();
  });

  // ─── Edge: lastAttempted.step no longer in DAG ────────────────────────

  it("Edge: lastAttempted.step not in DAG → halts with --recompute-state hint", async () => {
    const statePath = await writeResumeState({
      lastAttempted: {
        step: "deleted-step",
        epic: 99,
        story: "99.1",
        attemptedAt: "2026-04-29T11:00:00Z",
      },
      failureCode: "VERIFIER_FAILURE",
      failureMessage: "test",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      // Empty skillNames produces a DAG without "deleted-step".
      argv: ["--resume"],
    });
    expect(result.exitCode).toBe(2);
    expect(result.action.action).toBe("halt");
    if (result.action.action !== "halt") return;
    expect(result.action.message).toBe(
      "Step deleted-step from lastAttempted is no longer in the DAG. Run /bmad-next --recompute-state and re-run /bmad-next.",
    );
  });

  // ─── Resume bypasses pickNextStep (cached target wins) ───────────────

  it("resume bypasses pickNextStep — cached lastAttempted.step wins over lastSuccessfulStep advancement", async () => {
    // Defensive case: lastSuccessfulStep advanced PAST lastAttempted.
    // Resume should STILL target lastAttempted.step (cached resume tuple).
    const statePath = await writeResumeState({
      lastSuccessfulStep: {
        step: "bmad-create-prd",
        epic: 1,
        story: "1.5",
        completedAt: "2026-04-29T10:00:00Z",
      },
      lastAttempted: {
        step: "bmad-dev-story",
        epic: 1,
        story: "1.0",
        attemptedAt: "2026-04-28T10:00:00Z",
      },
      failureCode: "VERIFIER_FAILURE",
      failureMessage: "test",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--resume"],
    });
    expect(result.action.action).toBe("dispatch");
    if (result.action.action !== "dispatch") return;
    expect(result.action.lastAttempted?.step).toBe("bmad-dev-story");
    // The default post-first-step pickNextStep would have produced
    // bmad-create-epics-and-stories (after: [bmad-create-prd]); resume
    // overrides with the cached target.
  });

  // ─── --resume + --dry-run combo ───────────────────────────────────────

  it("--resume + --dry-run: report message references the resume target", async () => {
    const statePath = await writeResumeState({
      lastAttempted: {
        step: "bmad-dev-story",
        epic: 2,
        story: "2.1",
        attemptedAt: "2026-04-29T11:00:00Z",
      },
      failureCode: "VERIFIER_FAILURE",
      failureMessage: "test",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--resume", "--dry-run"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    expect(result.action.message).toContain(
      "would dispatch step bmad-dev-story",
    );
  });

  // ─── --resume + --explain combo ───────────────────────────────────────

  it("--resume + --explain: report message references the resume target", async () => {
    const statePath = await writeResumeState({
      lastAttempted: {
        step: "bmad-dev-story",
        epic: 2,
        story: "2.1",
        attemptedAt: "2026-04-29T11:00:00Z",
      },
      failureCode: "VERIFIER_FAILURE",
      failureMessage: "test",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--resume", "--explain"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    expect(result.action.message).toContain("Story 3.6");
    // The resume target surfaces in the v0.1 explain stub.
    expect(result.action.message).toContain("bmad-dev-story");
  });

  // ─── nowIso injection ────────────────────────────────────────────────

  it("--resume registers a NEW attempt with a fresh attemptedAt (nowIso wins)", async () => {
    const statePath = await writeResumeState({
      lastAttempted: {
        step: "bmad-dev-story",
        epic: 2,
        story: "2.1",
        // Old timestamp from the original (failed) attempt.
        attemptedAt: "2026-04-29T00:00:00Z",
      },
      failureCode: "VERIFIER_FAILURE",
      failureMessage: "test",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--resume"],
      nowIso: "2026-05-01T12:00:00.000Z",
    });
    expect(result.action.action).toBe("dispatch");
    if (result.action.action !== "dispatch") return;
    // Fresh timestamp from opts.nowIso, NOT the seed attemptedAt.
    expect(result.action.lastAttempted?.attemptedAt).toBe(
      "2026-05-01T12:00:00.000Z",
    );
    // step + epic + story carry verbatim from seed.
    expect(result.action.lastAttempted?.step).toBe("bmad-dev-story");
    expect(result.action.lastAttempted?.epic).toBe(2);
    expect(result.action.lastAttempted?.story).toBe("2.1");
  });

  // ─── Lock-free contract: state.yaml unchanged after resume ───────────

  it("--resume does NOT modify state.yaml (lock-free run.ts contract)", async () => {
    const statePath = await writeResumeState({
      lastAttempted: {
        step: "bmad-dev-story",
        epic: 2,
        story: "2.1",
        attemptedAt: "2026-04-29T11:00:00Z",
      },
      failureCode: "VERIFIER_FAILURE",
      failureMessage: "test",
    });
    const beforeText = await Bun.file(statePath).text();
    const beforeMtime = (await fs.stat(statePath)).mtimeMs;
    await runNext({
      ...commonOpts(statePath),
      argv: ["--resume"],
    });
    const afterText = await Bun.file(statePath).text();
    const afterMtime = (await fs.stat(statePath)).mtimeMs;
    expect(afterText).toBe(beforeText);
    expect(afterMtime).toBe(beforeMtime);
    // No state.yaml.bak rotation either.
    await expect(fs.access(`${statePath}.bak`)).rejects.toThrow();
  });

  // ─── Defence-in-depth: corrupt lastAttempted shape rejected by Zod ───

  it("Defence-in-depth: malformed state.lastAttempted is rejected by loadStateUnlocked", async () => {
    // Write a state.yaml with a malformed lastAttempted (missing `step`).
    const text = Bun.YAML.stringify({
      schemaVersion: 1,
      project: { name: "stepper-test", bmadVersion: "6.5.0" },
      lastAttempted: { epic: 2, story: "2.1", attemptedAt: "x" },
      runHistory: [],
      checkpoints: [],
    });
    const statePath = path.join(tmp, "state.yaml");
    await Bun.write(statePath, text);
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--resume"],
    });
    // CorruptStateError per Story 1.5/1.6 schema validation; the runner
    // translates StepperError throws into action: "halt" with exitCode
    // matching the error class (CorruptStateError → exitCode 1).
    expect(result.action.action).toBe("halt");
    if (result.action.action !== "halt") return;
    expect(result.exitCode).toBe(1);
  });

  // ─── Schema validation: emitted action validates against DispatchActionV1Schema ─

  it("the resume-emitted dispatch action validates against DispatchActionV1Schema", async () => {
    const statePath = await writeResumeState({
      lastAttempted: {
        step: "bmad-dev-story",
        epic: 2,
        story: "2.1",
        attemptedAt: "2026-04-29T11:00:00Z",
      },
      failureCode: "VERIFIER_FAILURE",
      failureMessage: "test",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--resume"],
    });
    const roundTripped = JSON.parse(JSON.stringify(result.action));
    const parsed = DispatchActionV1Schema.parse(roundTripped);
    expect(parsed.action).toBe("dispatch");
    if (parsed.action !== "dispatch") return;
    expect(parsed.lastAttempted?.step).toBe("bmad-dev-story");
    expect(parsed.lastAttempted?.epic).toBe(2);
    expect(parsed.lastAttempted?.story).toBe("2.1");
  });
});
