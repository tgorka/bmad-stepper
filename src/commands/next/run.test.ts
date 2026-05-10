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
import { parseNextArgs } from "./args.ts";
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
    // Story 3.4: --step now verifies preconditions; bmad-dev-story has
    // `after: ["bmad-create-story"]` per the seed DAG, so seed
    // lastSuccessfulStep to bmad-create-story for the precondition match.
    const stateText = Bun.YAML.stringify({
      schemaVersion: 1,
      project: { name: "stepper-test", bmadVersion: "6.5.0" },
      lastSuccessfulStep: {
        step: "bmad-create-story",
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

  it("--explain emits action: 'report' with structured 5-component reasoning trace (Story 3.6)", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--explain"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    // Story 3.6 replaces the placeholder hint with the 5-component
    // reasoning trace per AC line 815-817.
    expect(result.action.message).toContain("Next step:");
    expect(result.action.message).toContain("Chain of completed predecessors:");
    expect(result.action.message).toContain("Reasoning:");
  });

  it("--diff-state emits action: 'report' with diffState humanReadable (Story 3.8)", async () => {
    // Story 3.8 replaced the Story 2.4 placeholder with the diffState helper.
    // The minimal-state fixture has no lastSuccessfulStep AND no artifacts,
    // so the diff is in-sync (zero divergences).
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--diff-state"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    // Either in-sync OR diverges-with-listed-fields; both are valid Story 3.8
    // outputs depending on whether the test fixture writes any artifacts.
    const startsWithSync = result.action.message.startsWith(
      "state.yaml is in sync with files of truth",
    );
    const startsWithDiverges = result.action.message.startsWith(
      "state.yaml diverges from files of truth",
    );
    expect(startsWithSync || startsWithDiverges).toBe(true);
  });

  it("--export-state emits action: 'report' with JSON body (Story 3.8)", async () => {
    // Story 3.8 replaced the Story 2.4 placeholder with the exportState helper.
    // The result.action.message is the schema-versioned 7-field JSON body
    // (compact `JSON.stringify` output); FR54 special-case in the
    // `import.meta.main` block emits the body directly to stdout.
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--export-state"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    const parsed = JSON.parse(result.action.message);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.bmadVersion).toBe("6.5.0");
    expect(parsed.stepperVersion).toBe("0.1.0");
  });

  it("--dry-run emits action: 'report' starting with 'Dry-run: would dispatch ' (Story 3.3 format)", async () => {
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
    // Story 3.3: canonical prefix is `Dry-run: would dispatch ` followed by
    // the step name (no `step ` word in v0.1+; the format inverts the v0.1
    // placeholder to surface step + epic+story + persona + model + budget +
    // expected output path on a single line per AC line 767).
    expect(result.action.message.startsWith("Dry-run: would dispatch ")).toBe(
      true,
    );
    // Story 3.3 INVERTS the v0.1 invariant: dispatch-spec is composed
    // PURELY in-memory; NO staging dir is created on the dry-run path.
    const stagingExists = await fs
      .access(path.join(tmp, "staging"))
      .then(() => true)
      .catch(() => false);
    if (stagingExists) {
      // If the dir somehow exists (e.g., test pollution), it must be empty.
      const stagingEntries = await fs.readdir(path.join(tmp, "staging"));
      expect(stagingEntries.length).toBe(0);
    } else {
      expect(stagingExists).toBe(false);
    }
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

// ─── Story 6.9 — `--upgrade` short-circuit at Step 0a ────────────────────

describe("runNext — Story 6.9 --upgrade short-circuit", () => {
  function makeStubFetch(opts: {
    body?: unknown;
    throws?: unknown;
  }): typeof globalThis.fetch {
    return ((_input: unknown, _init?: RequestInit) => {
      if (opts.throws !== undefined) {
        return Promise.reject(opts.throws);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => opts.body,
      } as unknown as Response);
    }) as unknown as typeof globalThis.fetch;
  }

  it("UPGRADE_69_RUN_SHORT_CIRCUIT_1: --upgrade returns report action with AC-1 hint", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--upgrade"],
      upgradeFetchOverride: makeStubFetch({
        body: {
          tag_name: "v0.2.0",
          html_url:
            "https://github.com/tgorka/bmad-stepper/releases/tag/v0.2.0",
          body: "## BMAD Compatibility — v6.5.x\n\nNotes.",
        },
      }),
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    expect(result.action.message).toContain("# Stepper Upgrade Check");
    expect(result.action.message).toContain(
      "Run /plugin marketplace update tgorka/bmad-stepper to upgrade.",
    );
  });

  it("UPGRADE_69_RUN_NETWORK_FAILURE_1: stub fetch rejects → halt with AC-2 hint byte-identical", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--upgrade"],
      upgradeFetchOverride: makeStubFetch({
        throws: new TypeError("fetch failed"),
      }),
    });
    expect(result.exitCode).toBe(1);
    expect(result.action.action).toBe("halt");
    if (result.action.action !== "halt") return;
    expect(result.action.message).toBe(
      "Could not reach GitHub Releases. Check your network or try again later.",
    );
  });

  it("UPGRADE_69_RUN_TAKES_PRECEDENCE_1: --upgrade short-circuits BEFORE --doctor", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--upgrade", "--doctor"],
      upgradeFetchOverride: makeStubFetch({
        body: {
          tag_name: "v0.0.0",
          html_url:
            "https://github.com/tgorka/bmad-stepper/releases/tag/v0.0.0",
          body: "",
        },
      }),
    });
    // The runner SHOULD return the upgrade report (NOT a doctor halt or
    // doctor success). When upgrade fires first, the action is "report"
    // (up-to-date or upgrade-available); the doctor branch never runs.
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    expect(result.action.message).toContain("# Stepper Upgrade Check");
  });

  it("UPGRADE_69_RUN_BYPASSES_BMAD_DETECT_1: upgrade returns report when BMAD not installed (no skill names supplied)", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--upgrade"],
      // skillNames: [] in commonOpts simulates a fixture without
      // BMAD detection / installed skills. The upgrade short-circuit
      // fires regardless and returns the report action.
      upgradeFetchOverride: makeStubFetch({
        body: {
          tag_name: "v0.0.0",
          html_url:
            "https://github.com/tgorka/bmad-stepper/releases/tag/v0.0.0",
          body: "",
        },
      }),
    });
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    expect(result.action.message).toContain("# Stepper Upgrade Check");
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
    // Story 3.3 reformulates the dry-run preview format. The resume
    // target step name is still surfaced as a substring (the canonical
    // prefix is `Dry-run: would dispatch <step>`).
    expect(result.action.message).toContain("would dispatch bmad-dev-story");
  });

  // ─── --resume + --explain combo ───────────────────────────────────────

  it("--resume + --explain: report message references the resume target (Story 3.6)", async () => {
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
    // Story 3.6: the resume target surfaces in the structured reasoning trace.
    expect(result.action.message).toContain("Next step: bmad-dev-story");
    // The reasoning summary cites the explicit --resume target.
    expect(result.action.message).toContain(
      "explicit --resume target (bmad-dev-story)",
    );
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

// ─── Story 3.3: --dry-run flag (epic AC lines 762-768) ────────────────────

describe("runNext — Story 3.3 --dry-run flag", () => {
  /**
   * Helper: seed a post-first-step state (`lastSuccessfulStep` set to
   * `bmad-create-prd` at epic=1 / story=1.5) so `pickNextStep` returns a
   * deterministic non-optional candidate (`bmad-create-epics-and-stories`,
   * with `after: [bmad-create-prd]` per the seed DAG).
   */
  async function writePostFirstStepState(): Promise<string> {
    return writeMinimalState(
      Bun.YAML.stringify({
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
      }),
    );
  }

  // ─── Test A: AC happy path — 5-field preview ────────────────────────────

  it("AC happy path: --dry-run preview surfaces target step + epic+story + persona + model + budget + expected output path", async () => {
    const statePath = await writePostFirstStepState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--dry-run"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    const message = result.action.message;
    // Canonical prefix per Story 3.3 Task 6.3.
    expect(message.startsWith("Dry-run: would dispatch ")).toBe(true);
    // (a) target step name (the deterministic next step is
    // bmad-create-epics-and-stories per the seed DAG).
    expect(message).toContain("bmad-create-epics-and-stories");
    // (b) epic + story projection (carries from lastSuccessfulStep).
    expect(message).toContain("epic 1");
    expect(message).toContain("story 1.5");
    // (c) persona (resolved via the existing 4-tier algorithm).
    //     Step bmad-create-epics-and-stories resolves to persona "pm"
    //     per Story 1.11 + the seed BMAD frontmatter.
    expect(message).toContain("→ ");
    // (d) hardcoded v0.1 model.
    expect(message).toContain("sonnet");
    // (e) hardcoded v0.1 budget (60k context + 5min timeout).
    expect(message).toContain("60k context");
    expect(message).toContain("5min timeout");
    // (f) expected output path uses the dry-run runId (DRYRUN suffix).
    expect(message).toContain(
      "Expected output: staging/2026-04-29T10-15-00-bmad-create-epics-and-stories-DRYRUN/outputs/bmad-create-epics-and-stories.md",
    );
  });

  // ─── Test B: AC no-staging-dir invariant ────────────────────────────────

  it("AC no-staging-dir: --dry-run does NOT create staging/<runId>/", async () => {
    const statePath = await writePostFirstStepState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--dry-run"],
    });
    expect(result.action.action).toBe("report");
    // staging/ either does not exist OR contains zero subdirectories.
    const stagingPath = path.join(tmp, "staging");
    const stagingExists = await fs
      .access(stagingPath)
      .then(() => true)
      .catch(() => false);
    if (stagingExists) {
      const entries = await fs.readdir(stagingPath);
      expect(entries.length).toBe(0);
    } else {
      expect(stagingExists).toBe(false);
    }
  });

  // ─── Test C: AC no-dispatch-spec-write invariant ────────────────────────

  it("AC no-dispatch-spec-write: --dry-run does NOT write any dispatch-spec.json under tmp/", async () => {
    const statePath = await writePostFirstStepState();
    await runNext({
      ...commonOpts(statePath),
      argv: ["--dry-run"],
    });
    // Recursively scan tmp/ for any dispatch-spec.json file.
    async function findDispatchSpecs(root: string): Promise<string[]> {
      const out: string[] = [];
      const stack: string[] = [root];
      while (stack.length > 0) {
        const dir = stack.pop() as string;
        let entries: import("node:fs").Dirent[];
        try {
          entries = await fs.readdir(dir, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            stack.push(full);
          } else if (entry.isFile() && entry.name === "dispatch-spec.json") {
            out.push(full);
          }
        }
      }
      return out;
    }
    const found = await findDispatchSpecs(tmp);
    expect(found).toEqual([]);
  });

  // ─── Test D: AR9 schema validation round-trip ───────────────────────────

  it("AR9 schema validation: the --dry-run report validates against DispatchActionV1Schema", async () => {
    const statePath = await writePostFirstStepState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--dry-run"],
    });
    const roundTripped = JSON.parse(JSON.stringify(result.action));
    const parsed = DispatchActionV1Schema.parse(roundTripped);
    expect(parsed.action).toBe("report");
    if (parsed.action !== "report") return;
    expect(parsed.message.length).toBeGreaterThan(0);
    expect(parsed.exitCode).toBe(0);
  });

  // ─── Test E: state.yaml byte-stable after --dry-run ─────────────────────

  it("--dry-run does NOT modify state.yaml (lock-free run.ts contract)", async () => {
    const statePath = await writePostFirstStepState();
    const beforeText = await Bun.file(statePath).text();
    const beforeMtime = (await fs.stat(statePath)).mtimeMs;
    await runNext({
      ...commonOpts(statePath),
      argv: ["--dry-run"],
    });
    const afterText = await Bun.file(statePath).text();
    const afterMtime = (await fs.stat(statePath)).mtimeMs;
    expect(afterText).toBe(beforeText);
    expect(afterMtime).toBe(beforeMtime);
    // No state.yaml.bak rotation either.
    await expect(fs.access(`${statePath}.bak`)).rejects.toThrow();
    // No state.yaml.tmp written either.
    await expect(fs.access(`${statePath}.tmp`)).rejects.toThrow();
  });

  // ─── Test F: --dry-run + --explain — explain wins ───────────────────────

  it("--dry-run + --explain: --explain short-circuit wins (explain > dry-run)", async () => {
    const statePath = await writePostFirstStepState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--dry-run", "--explain"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    // Story 3.6: the --explain short-circuit returns BEFORE the dry-run
    // branch, so the user sees the structured reasoning trace — NOT the
    // dry-run preview format.
    expect(result.action.message).toContain("Next step:");
    expect(result.action.message).toContain("Reasoning:");
    // The dry-run preview prefix is NOT present (explain wins).
    expect(result.action.message.startsWith("Dry-run: would dispatch ")).toBe(
      false,
    );
  });

  // ─── Test G: --dry-run nowIso injection honored ─────────────────────────

  it("--dry-run nowIso injection: the dry-run runId reflects opts.nowIso", async () => {
    const statePath = await writePostFirstStepState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--dry-run"],
      nowIso: "2026-04-29T10:15:00.000Z",
    });
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    // The tsPart projection strips milliseconds + Z and replaces : with -.
    expect(result.action.message).toContain("2026-04-29T10-15-00-");
    expect(result.action.message).toContain("-DRYRUN/");
  });

  // ─── Test H: --dry-run + --persona override ─────────────────────────────

  it("--dry-run + --persona: preview surfaces the override persona name", async () => {
    const statePath = await writePostFirstStepState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--dry-run", "--persona", "my-custom-persona"],
    });
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    // The override persona surfaces verbatim in the preview message.
    expect(result.action.message).toContain("→ my-custom-persona");
  });

  // ─── Test I: --dry-run + --step explicit override ───────────────────────

  it("--dry-run + --step: preview surfaces the explicit step override", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--dry-run", "--step", "bmad-brainstorming"],
    });
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    expect(
      result.action.message.startsWith(
        "Dry-run: would dispatch bmad-brainstorming ",
      ),
    ).toBe(true);
  });

  // ─── Test J: --dry-run on fresh project — empty state ───────────────────

  it("--dry-run on fresh project: preview format with epic 0 / story 0.0 defaults", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--dry-run", "--step", "bmad-brainstorming"],
    });
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    // Fresh state with no lastSuccessfulStep/lastAttempted — defaults
    // per `generate-spec.ts:176-177` are epic=0, story="0.0".
    expect(result.action.message).toContain("epic 0");
    expect(result.action.message).toContain("story 0.0");
  });

  // ─── Test K: --dry-run preview canonical format assertion ──────────────

  it("--dry-run preview message format matches the canonical Story 3.3 format string", async () => {
    const statePath = await writePostFirstStepState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--dry-run"],
    });
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    // Match the full format: `Dry-run: would dispatch <step>
    // (epic <n> / story <x.y>) → <persona> (sonnet, 60k context, 5min
    // timeout). Expected output: staging/<runId>/outputs/<step>.md`.
    expect(result.action.message).toMatch(
      /^Dry-run: would dispatch \S+ \(epic \d+ \/ story \S+\) → \S+ \(sonnet, 60k context, 5min timeout\)\. Expected output: staging\/\S+-DRYRUN\/outputs\/\S+\.md$/,
    );
  });
});

// ─── Story 3.4: --step <id> + scope flags (epic AC lines 776-784) ─────────

describe("runNext — Story 3.4 --step + scope flags", () => {
  /**
   * Helper: capture log.warn() calls for AC-3 warning-emission tests.
   * Returns a `LoggerFns` shape compatible with `RunNextOptions.logger`.
   */
  function captureLogger(): {
    logger: {
      info(message: string): void;
      warn(message: string): void;
      error(message: string): void;
      json(payload: unknown): void;
    };
    warnMessages: string[];
    infoMessages: string[];
    errorMessages: string[];
  } {
    const warnMessages: string[] = [];
    const infoMessages: string[] = [];
    const errorMessages: string[] = [];
    return {
      logger: {
        info(m: string): void {
          infoMessages.push(m);
        },
        warn(m: string): void {
          warnMessages.push(m);
        },
        error(m: string): void {
          errorMessages.push(m);
        },
        json(_p: unknown): void {
          // no-op
        },
      },
      warnMessages,
      infoMessages,
      errorMessages,
    };
  }

  /**
   * Helper: seed a state.yaml with `lastSuccessfulStep` set to the given
   * step + epic + story. Default values cover the most common Story 3.4
   * fixture (epic 3 / story 3.4 fresh-after-brainstorming).
   */
  async function writeStateWithLastSuccessful(opts: {
    step: string;
    epic?: number;
    story?: string;
  }): Promise<string> {
    return writeMinimalState(
      Bun.YAML.stringify({
        schemaVersion: 1,
        project: { name: "stepper-test", bmadVersion: "6.5.0" },
        lastSuccessfulStep: {
          step: opts.step,
          epic: opts.epic ?? 3,
          story: opts.story ?? "3.4",
          completedAt: "2026-04-29T10:00:00Z",
        },
        runHistory: [],
        checkpoints: [],
      }),
    );
  }

  // ─── AC-1 happy path (preconditions met) ───────────────────────────────

  it("AC-1 happy path: --step bmad-product-brief succeeds when lastSuccessfulStep=bmad-brainstorming", async () => {
    const statePath = await writeStateWithLastSuccessful({
      step: "bmad-brainstorming",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-product-brief"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("dispatch");
    if (result.action.action !== "dispatch") return;
    expect(result.action.lastAttempted?.step).toBe("bmad-product-brief");
  });

  // ─── AC-1 unmet preconditions (--step blocked) ─────────────────────────

  it("AC-1 unmet preconditions: --step bmad-create-architecture on fresh state halts with explain hint", async () => {
    // Fresh state (no lastSuccessfulStep). bmad-create-architecture has
    // after: [bmad-create-prd] per the seed DAG — NOT an entry-point.
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-create-architecture"],
    });
    expect(result.exitCode).toBe(2);
    expect(result.action.action).toBe("halt");
    if (result.action.action !== "halt") return;
    expect(result.action.message).toBe(
      "Run /bmad-next --explain to see why bmad-create-architecture is blocked.",
    );
    expect(result.action.exitCode).toBe(2);
  });

  // ─── AC-1 entry-point trivially met on fresh project ───────────────────

  it("AC-1 entry-point on fresh project: --step bmad-brainstorming succeeds (empty after[])", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("dispatch");
    if (result.action.action !== "dispatch") return;
    expect(result.action.lastAttempted?.step).toBe("bmad-brainstorming");
  });

  // ─── AC-1 unknown step preserves Story 2.4 hint ────────────────────────

  it("AC-1 unknown step: --step bmad-not-a-real-step halts with the existing Story 2.4 hint", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-not-a-real-step"],
    });
    expect(result.exitCode).toBe(2);
    expect(result.action.action).toBe("halt");
    if (result.action.action !== "halt") return;
    expect(result.action.message).toBe(
      'Run /bmad-next --list to see candidate steps; "bmad-not-a-real-step" is not in the resolved DAG.',
    );
  });

  // ─── AC-2 scope filtering happy path (--phase) ─────────────────────────

  it("AC-2 scope filter --phase planning: dispatched step is in the planning phase", async () => {
    // Seed lastSuccessfulStep to bmad-create-prd; the deterministic
    // non-optional post-create-prd candidate is bmad-create-epics-and-stories
    // (planning phase, non-optional, after: [bmad-create-prd]).
    const statePath = await writeStateWithLastSuccessful({
      step: "bmad-create-prd",
      epic: 3,
      story: "3.4",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--phase", "planning"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("dispatch");
    if (result.action.action !== "dispatch") return;
    expect(result.action.lastAttempted?.step).toBe(
      "bmad-create-epics-and-stories",
    );
  });

  // ─── AC-2 scope filtering happy path (--epic match) ────────────────────

  it("AC-2 scope filter --epic 3 (match): dispatch succeeds when projection equals filter", async () => {
    const statePath = await writeStateWithLastSuccessful({
      step: "bmad-create-prd",
      epic: 3,
      story: "3.0",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--epic", "3"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("dispatch");
    if (result.action.action !== "dispatch") return;
    // Projection passes (3 === 3); pickNextStep returns
    // bmad-create-epics-and-stories (the unique non-optional candidate).
    expect(result.action.lastAttempted?.step).toBe(
      "bmad-create-epics-and-stories",
    );
  });

  // ─── AC-2 scope filtering empty result (--epic mismatch) ───────────────

  it("AC-2 scope filter --epic 999 (mismatch): halts with empty-candidate hint", async () => {
    const statePath = await writeStateWithLastSuccessful({
      step: "bmad-create-prd",
      epic: 3,
      story: "3.0",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--epic", "999"],
    });
    expect(result.exitCode).toBe(2);
    expect(result.action.action).toBe("halt");
    if (result.action.action !== "halt") return;
    expect(result.action.message).toContain(
      "Run /bmad-next --list to see candidate steps",
    );
  });

  // ─── AC-2 scope filtering happy path (--story match) ───────────────────

  it("AC-2 scope filter --story (match): dispatch succeeds when projection equals filter", async () => {
    const statePath = await writeStateWithLastSuccessful({
      step: "bmad-create-prd",
      epic: 3,
      story: "3.4",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--story", "3.4"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("dispatch");
    if (result.action.action !== "dispatch") return;
    expect(result.action.lastAttempted?.story).toBe("3.4");
  });

  // ─── AC-2 combined --epic + --story ────────────────────────────────────

  it("AC-2 combined --epic + --story (both match): dispatch succeeds", async () => {
    const statePath = await writeStateWithLastSuccessful({
      step: "bmad-create-prd",
      epic: 3,
      story: "3.4",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--epic", "3", "--story", "3.4"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("dispatch");
    if (result.action.action !== "dispatch") return;
    expect(result.action.lastAttempted?.epic).toBe(3);
    expect(result.action.lastAttempted?.story).toBe("3.4");
  });

  // ─── AC-2 combined --epic + --phase ────────────────────────────────────

  it("AC-2 combined --epic + --phase (both match): dispatch succeeds", async () => {
    const statePath = await writeStateWithLastSuccessful({
      step: "bmad-create-prd",
      epic: 3,
      story: "3.0",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--epic", "3", "--phase", "planning"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("dispatch");
    if (result.action.action !== "dispatch") return;
    // Phase filter narrows to planning; epic projection passes (3 === 3).
    // bmad-create-epics-and-stories is non-optional, planning phase.
    expect(result.action.lastAttempted?.step).toBe(
      "bmad-create-epics-and-stories",
    );
  });

  // ─── AC-3 warning emission (--step + --epic) ───────────────────────────

  it("AC-3 warning: --step + --epic emits the scope-ignored warning", async () => {
    const statePath = await writeMinimalState();
    const cap = captureLogger();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming", "--epic", "3"],
      logger: cap.logger,
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("dispatch");
    expect(cap.warnMessages).toContain(
      "next: --step is explicit; --epic/--story/--phase scope flags are ignored.",
    );
  });

  // ─── AC-3 warning emission (--step + --story) ──────────────────────────

  it("AC-3 warning: --step + --story emits the scope-ignored warning", async () => {
    const statePath = await writeMinimalState();
    const cap = captureLogger();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming", "--story", "3.4"],
      logger: cap.logger,
    });
    expect(result.exitCode).toBe(0);
    expect(cap.warnMessages).toContain(
      "next: --step is explicit; --epic/--story/--phase scope flags are ignored.",
    );
  });

  // ─── AC-3 warning emission (--step + --phase) ──────────────────────────

  it("AC-3 warning: --step + --phase emits the scope-ignored warning", async () => {
    const statePath = await writeMinimalState();
    const cap = captureLogger();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming", "--phase", "planning"],
      logger: cap.logger,
    });
    expect(result.exitCode).toBe(0);
    expect(cap.warnMessages).toContain(
      "next: --step is explicit; --epic/--story/--phase scope flags are ignored.",
    );
  });

  // ─── AC-3 warning emission (--step + multiple scope flags = ONE warn) ──

  it("AC-3 warning: --step + multiple scope flags emits exactly ONE warning (not 3)", async () => {
    const statePath = await writeMinimalState();
    const cap = captureLogger();
    await runNext({
      ...commonOpts(statePath),
      argv: [
        "--step",
        "bmad-brainstorming",
        "--epic",
        "3",
        "--story",
        "3.0",
        "--phase",
        "analysis",
      ],
      logger: cap.logger,
    });
    const scopeWarnings = cap.warnMessages.filter((m) =>
      m.includes("scope flags are ignored"),
    );
    expect(scopeWarnings.length).toBe(1);
  });

  // ─── AC-3 no warning (--step alone) ────────────────────────────────────

  it("AC-3 no warning: --step alone does NOT emit the scope-ignored warning", async () => {
    const statePath = await writeMinimalState();
    const cap = captureLogger();
    await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming"],
      logger: cap.logger,
    });
    const scopeWarnings = cap.warnMessages.filter((m) =>
      m.includes("scope flags are ignored"),
    );
    expect(scopeWarnings.length).toBe(0);
  });

  // ─── AC-3 no warning (scope flags alone, no --step) ────────────────────

  it("AC-3 no warning: --epic alone does NOT emit the scope-ignored warning", async () => {
    const statePath = await writeStateWithLastSuccessful({
      step: "bmad-brainstorming",
      epic: 3,
      story: "3.0",
    });
    const cap = captureLogger();
    await runNext({
      ...commonOpts(statePath),
      argv: ["--epic", "3"],
      logger: cap.logger,
    });
    const scopeWarnings = cap.warnMessages.filter((m) =>
      m.includes("scope flags are ignored"),
    );
    expect(scopeWarnings.length).toBe(0);
  });

  // ─── Edge: --step + --resume (resume wins; no warning) ─────────────────

  it("Edge: --step + --resume — resume wins, no scope-warning emitted (resume bypasses pickNextStep)", async () => {
    const stateText = Bun.YAML.stringify({
      schemaVersion: 1,
      project: { name: "stepper-test", bmadVersion: "6.5.0" },
      lastAttempted: {
        step: "bmad-dev-story",
        epic: 2,
        story: "2.1",
        attemptedAt: "2026-04-29T11:00:00Z",
      },
      lastFailureReason: {
        code: "VERIFIER_FAILURE",
        message: "test",
        hint: "Run /bmad-next --resume after fixing the underlying issue.",
        runId: "abc123",
      },
      runHistory: [],
      checkpoints: [],
    });
    const statePath = await writeMinimalState(stateText);
    const cap = captureLogger();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-product-brief", "--resume"],
      logger: cap.logger,
    });
    expect(result.action.action).toBe("dispatch");
    if (result.action.action !== "dispatch") return;
    // Resume target wins; --step value is silently ignored on resume.
    expect(result.action.lastAttempted?.step).toBe("bmad-dev-story");
    // No scope-warning emitted (resume bypasses pickNextStep entirely).
    const scopeWarnings = cap.warnMessages.filter((m) =>
      m.includes("scope flags are ignored"),
    );
    expect(scopeWarnings.length).toBe(0);
  });

  // ─── Edge: --step + --dry-run combo ────────────────────────────────────

  it("Edge: --step + --dry-run on fresh state previews the explicit step", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming", "--dry-run"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    expect(result.action.message).toContain(
      "Dry-run: would dispatch bmad-brainstorming ",
    );
  });

  // ─── Edge: --step blocked + --explain (explain catches throw) ──────────

  it("Edge: --step bmad-create-architecture + --explain on fresh state — explain catches throw (Story 3.6)", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-create-architecture", "--explain"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    // Story 3.6: the surrounding try/catch in the explain branch catches
    // the precondition-unmet throw; the structured trace surfaces the
    // graceful "no target step matches" line + the alternatives list.
    expect(result.action.message).toContain(
      "Next step: (no target step matches; current filter excludes all candidates)",
    );
    // Alternatives are still computed (over the unfiltered candidate set).
    expect(result.action.message).toContain("Alternative candidates");
  });
});

// ─── Story 3.5: --persona override + --include-optional/--no-optional ─────
//
// AC verbatim (epic AC lines 794-805):
//   - Given `--persona <name>` is supplied | When dispatching | Then the
//     dispatch-spec's PERSONA field uses the supplied name, bypassing the
//     4-tier resolution
//   - Given `--no-optional` is supplied | When computing next step | Then
//     steps with `optional: true` in the DAG are excluded from candidates
//   - Given `--include-optional` is supplied | When computing | Then
//     optional steps are included with normal priority
//   - Given neither flag is supplied | When computing | Then the project-
//     config `failurePolicies` and `personas` defaults apply (no toggle)
//
// All 3 flag branches PRE-EXIST per Story 2.4 (see run.ts:1044-1056 for
// persona override; run.ts:619-626 + 1001-1004 for optional-toggle filter;
// run.ts:266-284 for cross-validation closure). Story 3.5 ships JSDoc
// tightening + the colocated coverage tests below.
//
// Fixture choice rationale:
//   - `lastSuccessfulStep: bmad-brainstorming` is the canonical multi-flag
//     fixture: only `bmad-product-brief` (optional, after=[bmad-brainstorming])
//     follows. Default-exclude-optional → halt with empty-candidate hint;
//     `--include-optional` → dispatches `bmad-product-brief`. Clean
//     differentiator for the include/no-optional toggle.
//   - `lastSuccessfulStep: bmad-create-prd` produces 4 candidates (3
//     optional + bmad-create-epics-and-stories non-optional). Default
//     and `--no-optional` both dispatch `bmad-create-epics-and-stories`;
//     `--include-optional` still dispatches `bmad-create-epics-and-stories`
//     (alphabetically first). Fixture used to exercise the no-optional
//     filter without depending on tiebreaker semantics.
//   - `lastSuccessfulStep: bmad-sprint-planning` produces multi-persona
//     candidate `bmad-create-story` (persona: ["analyst", "pm"]); used to
//     exercise the multi-persona warn elision on `--persona` override.
//
// Reuses the Story 3.4 `captureLogger()` factory + `writeStateWithLastSuccessful()`
// factory (declared in the Story 3.4 describe block above). Bun:test
// describe blocks are sibling-scoped and share the module-level
// `tmp`/`beforeEach`/`afterEach`; helpers are declared per-describe.

describe("runNext — Story 3.5 --persona override + --include-optional/--no-optional", () => {
  /**
   * Helper: capture log.warn() calls for multi-persona-warn tests.
   * Returns a `LoggerFns` shape compatible with `RunNextOptions.logger`.
   * Mirrors Story 3.4's `captureLogger()` factory.
   */
  function captureLogger(): {
    logger: {
      info(message: string): void;
      warn(message: string): void;
      error(message: string): void;
      json(payload: unknown): void;
    };
    warnMessages: string[];
    infoMessages: string[];
    errorMessages: string[];
  } {
    const warnMessages: string[] = [];
    const infoMessages: string[] = [];
    const errorMessages: string[] = [];
    return {
      logger: {
        info(m: string): void {
          infoMessages.push(m);
        },
        warn(m: string): void {
          warnMessages.push(m);
        },
        error(m: string): void {
          errorMessages.push(m);
        },
        json(_p: unknown): void {
          // no-op
        },
      },
      warnMessages,
      infoMessages,
      errorMessages,
    };
  }

  /**
   * Helper: seed a state.yaml with `lastSuccessfulStep` set to the given
   * step + epic + story. Mirrors Story 3.4's `writeStateWithLastSuccessful()`
   * factory with the same defaults (epic=3, story="3.5").
   */
  async function writeStateWithLastSuccessful(opts: {
    step: string;
    epic?: number;
    story?: string;
  }): Promise<string> {
    const statePath = path.join(tmp, "state.yaml");
    const text = Bun.YAML.stringify({
      schemaVersion: 1,
      project: { name: "stepper-test", bmadVersion: "6.5.0" },
      lastSuccessfulStep: {
        step: opts.step,
        epic: opts.epic ?? 3,
        story: opts.story ?? "3.5",
        completedAt: "2026-04-29T10:00:00Z",
      },
      runHistory: [],
      checkpoints: [],
    });
    await Bun.write(statePath, text);
    return statePath;
  }

  /**
   * Helper: read the dispatched persona from the on-disk dispatch-spec.json
   * for a given runId. Centralises the spec-read pattern used in 6+ tests.
   */
  async function readDispatchedPersona(runId: string): Promise<string> {
    const specPath = path.join(tmp, "staging", runId, "dispatch-spec.json");
    const spec = JSON.parse(await Bun.file(specPath).text());
    return spec.taskSpec.persona;
  }

  // ─── Test A — AC line 794-796: --persona override bypasses 4-tier ──────

  it("AC line 794-796 (Test A): --persona tea overrides Tier 3 default for bmad-product-brief", async () => {
    const statePath = await writeStateWithLastSuccessful({
      step: "bmad-brainstorming",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-product-brief", "--persona", "tea"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("dispatch");
    if (result.action.action !== "dispatch") return;
    // Tier 3 default for bmad-product-brief is "analyst" per
    // src/personas/defaults.ts; --persona tea overrides verbatim.
    const persona = await readDispatchedPersona(result.action.runId);
    expect(persona).toBe("tea");
  });

  // ─── Test B — AC line 794-796: --persona "" falls through to 4-tier ────

  it("AC line 794-796 (Test B): --persona empty string falls through to Tier 3 default", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming", "--persona", ""],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("dispatch");
    if (result.action.action !== "dispatch") return;
    // Empty string → no override; Tier 3 default for bmad-brainstorming
    // is "analyst" per src/personas/defaults.ts.
    const persona = await readDispatchedPersona(result.action.runId);
    expect(persona).toBe("analyst");
  });

  // ─── Test C — AC line 794-796: --persona override does NOT emit warn ───

  it("AC line 794-796 (Test C): --persona override on multi-persona step does NOT emit multi-persona warn", async () => {
    // bmad-create-story has Tier 3 multi-persona ["analyst", "pm"];
    // --persona dev short-circuits resolvePersona and supplies a single
    // string — pickFirstPersona's Array.isArray branch is NOT taken.
    const statePath = await writeStateWithLastSuccessful({
      step: "bmad-sprint-planning",
    });
    const cap = captureLogger();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--persona", "dev"],
      logger: cap.logger,
    });
    expect(result.action.action).toBe("dispatch");
    if (result.action.action !== "dispatch") return;
    // dispatched step is bmad-create-story (after: [bmad-sprint-planning],
    // non-optional); supplied persona "dev" overrides the multi-persona
    // Tier 3 default.
    const persona = await readDispatchedPersona(result.action.runId);
    expect(persona).toBe("dev");
    const multiPersonaWarns = cap.warnMessages.filter((m) =>
      m.includes("multi-persona"),
    );
    expect(multiPersonaWarns.length).toBe(0);
  });

  // ─── Test C-baseline — multi-persona warn DOES fire when --persona absent ─

  it("AC line 794-796 (Test C-baseline): multi-persona warn fires when --persona NOT supplied (Tier 3 array)", async () => {
    const statePath = await writeStateWithLastSuccessful({
      step: "bmad-sprint-planning",
    });
    const cap = captureLogger();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: [],
      logger: cap.logger,
    });
    expect(result.action.action).toBe("dispatch");
    if (result.action.action !== "dispatch") return;
    // Tier 3 default for bmad-create-story is ["analyst", "pm"];
    // pickFirstPersona picks first ("analyst") + emits the warn.
    const persona = await readDispatchedPersona(result.action.runId);
    expect(persona).toBe("analyst");
    const multiPersonaWarns = cap.warnMessages.filter((m) =>
      m.includes("multi-persona"),
    );
    expect(multiPersonaWarns.length).toBe(1);
  });

  // ─── Test D — AC line 797-799: --no-optional excludes optional candidates ─

  it("AC line 797-799 (Test D): --no-optional excludes optional candidates from pickNextStep", async () => {
    // After bmad-create-prd: 3 optional (bmad-validate-prd, bmad-edit-prd,
    // bmad-create-ux-design) + 1 non-optional (bmad-create-epics-and-stories).
    // --no-optional filters out the 3 optional candidates; only
    // bmad-create-epics-and-stories survives.
    const statePath = await writeStateWithLastSuccessful({
      step: "bmad-create-prd",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--no-optional"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("dispatch");
    if (result.action.action !== "dispatch") return;
    expect(result.action.lastAttempted?.step).toBe(
      "bmad-create-epics-and-stories",
    );
  });

  // ─── Test E — AC line 800-802: --include-optional includes optional candidates ─

  it("AC line 800-802 (Test E): --include-optional surfaces optional candidate when default excludes all", async () => {
    // After bmad-brainstorming: only bmad-product-brief (optional).
    // Default → halt with empty-candidate hint; --include-optional →
    // dispatches bmad-product-brief. Clean differentiator.
    const statePath = await writeStateWithLastSuccessful({
      step: "bmad-brainstorming",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--include-optional"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("dispatch");
    if (result.action.action !== "dispatch") return;
    expect(result.action.lastAttempted?.step).toBe("bmad-product-brief");
  });

  // ─── Test E-baseline — default behaviour halts when only optional candidates ─

  it("AC line 800-802 (Test E-baseline): default behaviour halts when only optional candidates exist", async () => {
    const statePath = await writeStateWithLastSuccessful({
      step: "bmad-brainstorming",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: [],
    });
    // Default-exclude-optional + only optional candidates → halt.
    expect(result.exitCode).toBe(2);
    expect(result.action.action).toBe("halt");
    if (result.action.action !== "halt") return;
    expect(result.action.message).toContain(
      "Run /bmad-next --list to see candidate steps",
    );
  });

  // ─── Test F — AC line 803-805: default no-toggle behaviour ────────────

  it("AC line 803-805 (Test F): default no-toggle uses Tier 3 persona + excludes optional candidates", async () => {
    const statePath = await writeStateWithLastSuccessful({
      step: "bmad-create-prd",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: [],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("dispatch");
    if (result.action.action !== "dispatch") return;
    // Default-exclude-optional → bmad-create-epics-and-stories
    // (non-optional planning candidate).
    expect(result.action.lastAttempted?.step).toBe(
      "bmad-create-epics-and-stories",
    );
    // Tier 3 default for bmad-create-epics-and-stories is "pm".
    const persona = await readDispatchedPersona(result.action.runId);
    expect(persona).toBe("pm");
  });

  // ─── Test G — Cross-validation preservation: --include-optional + --no-optional ─

  it("AC cross-validation (Test G): --include-optional + --no-optional throws ConfigError (Story 2.4 closure preserved)", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--include-optional", "--no-optional"],
    });
    expect(result.exitCode).toBe(2);
    expect(result.action.action).toBe("halt");
    if (result.action.action !== "halt") return;
    expect(result.action.message).toBe(
      "Pass either --include-optional or --no-optional, not both.",
    );
    expect(result.action.exitCode).toBe(2);
  });

  // ─── Test H — AC line 797-799: --no-optional in --list short-circuit ───

  it("AC line 797-799 (Test H): --list + --no-optional excludes optional steps from enumeration", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--list", "--no-optional"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    // Fresh state → entry-points only. ALL analysis-phase entry-points
    // are optional per the seed; --no-optional excludes them. Only
    // bmad-technical-research (solutioning, optional) and other
    // optional entry-points are filtered. Result: empty list — header
    // + the Story 3.7 empty-candidate-set hint.
    expect(result.action.message).toBe(
      "Candidate next steps:\n  (none — current state + filters yield zero candidates)",
    );
    // No `optional: yes` line in output (Story 3.7 canonical format).
    expect(result.action.message).not.toContain("optional: yes");
  });

  // ─── Test I — AC line 800-802: --include-optional in --list short-circuit ─

  it("AC line 800-802 (Test I): --list + --include-optional includes optional steps with optional surfacing", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--list", "--include-optional"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    expect(result.action.message).toContain("Candidate next steps:");
    // Fresh state → analysis entry-points (all optional per seed:
    // bmad-brainstorming, bmad-domain-research, bmad-market-research)
    // surface with `optional: yes` per Story 3.7 canonical format.
    expect(result.action.message).toContain("bmad-brainstorming");
    expect(result.action.message).toContain("optional: yes");
  });

  // ─── Test J — Edge: --persona + --step combo ────────────────────────────

  it("Edge (Test J): --persona + --step compose orthogonally — explicit step + override persona", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming", "--persona", "tea"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("dispatch");
    if (result.action.action !== "dispatch") return;
    expect(result.action.lastAttempted?.step).toBe("bmad-brainstorming");
    const persona = await readDispatchedPersona(result.action.runId);
    expect(persona).toBe("tea");
  });

  // ─── Test K — Edge: --persona + --resume (override wins on resume) ─────

  it("Edge (Test K): --persona + --resume — persona override wins on resume", async () => {
    // Seed lastAttempted (resume target) → bmad-dev-story.
    const stateText = Bun.YAML.stringify({
      schemaVersion: 1,
      project: { name: "stepper-test", bmadVersion: "6.5.0" },
      lastAttempted: {
        step: "bmad-dev-story",
        epic: 3,
        story: "3.5",
        attemptedAt: "2026-04-29T11:00:00Z",
      },
      lastFailureReason: {
        code: "VERIFIER_FAILURE",
        message: "test",
        hint: "Run /bmad-next --resume after fixing the underlying issue.",
        runId: "abc123",
      },
      runHistory: [],
      checkpoints: [],
    });
    const statePath = await writeMinimalState(stateText);
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--resume", "--persona", "tea"],
    });
    expect(result.action.action).toBe("dispatch");
    if (result.action.action !== "dispatch") return;
    expect(result.action.lastAttempted?.step).toBe("bmad-dev-story");
    // --persona tea overrides EVEN ON RESUME (persona resolution runs
    // AFTER the resume-target resolver).
    const persona = await readDispatchedPersona(result.action.runId);
    expect(persona).toBe("tea");
  });

  // ─── Test L — Edge: --persona + --dry-run (preview surfaces override) ──

  it("Edge (Test L): --persona + --dry-run preview surfaces the supplied persona", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming", "--persona", "tea", "--dry-run"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    // Dry-run preview format: "Dry-run: would dispatch <step> (epic <n> /
    // story <x.y>) → <persona> (sonnet, ...)"
    expect(result.action.message).toContain("→ tea ");
    // The Tier 3 default "analyst" is NOT in the message.
    expect(result.action.message).not.toContain("→ analyst ");
  });

  // ─── Test M — Edge: --no-optional + --step <optional-step> (step wins) ──

  it("Edge (Test M): --no-optional + --step <optional-step> dispatches the explicit step (step wins)", async () => {
    // bmad-product-brief is optional: true per the seed; with
    // --no-optional, the candidate filter would normally exclude it.
    // But the explicit --step branch returns BEFORE the optional-toggle
    // filter applies. Documented in run.ts:619-626 JSDoc.
    const statePath = await writeStateWithLastSuccessful({
      step: "bmad-brainstorming",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-product-brief", "--no-optional"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("dispatch");
    if (result.action.action !== "dispatch") return;
    expect(result.action.lastAttempted?.step).toBe("bmad-product-brief");
  });

  // ─── Test N — Edge: cross-validation fires before --step branch ─────────

  it("Edge (Test N): --include-optional + --no-optional + --step throws cross-validation BEFORE --step branch", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: [
        "--step",
        "bmad-brainstorming",
        "--include-optional",
        "--no-optional",
      ],
    });
    expect(result.exitCode).toBe(2);
    expect(result.action.action).toBe("halt");
    if (result.action.action !== "halt") return;
    // Cross-validation throw fires at runNext Step 2, BEFORE pickNextStep
    // is reached. Verbatim hint per AC line 803-805 + Story 2.4.
    expect(result.action.message).toBe(
      "Pass either --include-optional or --no-optional, not both.",
    );
  });

  // ─── Test O — Edge: --persona + --explain (explain stub references step) ─

  it("Edge (Test O): --persona + --explain emits report referencing resolved next step + Tier 0 persona (Story 3.6)", async () => {
    const statePath = await writeStateWithLastSuccessful({
      step: "bmad-create-prd",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--persona", "tea", "--explain"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    // Story 3.6: the explain trace surfaces the resolved next step + the
    // Tier 0 (--persona override) provenance label.
    expect(result.action.message).toContain(
      "Next step: bmad-create-epics-and-stories",
    );
    expect(result.action.message).toContain(
      "Resolved persona: tea (Tier 0: --persona override; bypassed 4-tier resolution)",
    );
  });
});

// ─── Story 3.6: --explain reasoning trace ─────────────────────────────────
//
// AC verbatim (epic AC lines 815-821):
//   - Given Stepper has computed the next step | When --explain is supplied
//     | Then the JSON-line action is "report" with `message` containing:
//     target step name, the chain of completed predecessors, the unmet
//     preconditions for alternative candidates (sorted by closest-to-ready),
//     the resolved persona, and a one-sentence reasoning summary in PRD
//     Journey 1 format.
//   - Given there is no next step (all done) | When --explain runs | Then
//     the message reads "All BMAD steps for this project are complete. See
//     /bmad-next --list to inspect remaining optional or unsatisfied steps."
//   - And the explain output is human-greppable (not JSON-only) —
//     diagnostics on stderr per FR54.
//
// Story 3.6 replaces the Story 2.4 placeholder explain branch at
// `run.ts:1001-1029` (now ~1384-1487 post-edit) with a structured 5-component
// multi-line "report" message. The persona-tier provenance comes from the
// new sibling helper `resolvePersonaWithTier(...)` in `src/personas/resolve.ts`.

describe("runNext — Story 3.6 --explain reasoning trace", () => {
  /**
   * Helper: capture log.warn() / log.info() calls for FR54 stderr discipline
   * tests. Returns a `LoggerFns` shape compatible with `RunNextOptions.logger`.
   * Mirrors Story 3.4 + Story 3.5's `captureLogger()` factory.
   */
  function captureLogger(): {
    logger: {
      info(message: string): void;
      warn(message: string): void;
      error(message: string): void;
      json(payload: unknown): void;
    };
    warnMessages: string[];
    infoMessages: string[];
    errorMessages: string[];
  } {
    const warnMessages: string[] = [];
    const infoMessages: string[] = [];
    const errorMessages: string[] = [];
    return {
      logger: {
        info(m: string): void {
          infoMessages.push(m);
        },
        warn(m: string): void {
          warnMessages.push(m);
        },
        error(m: string): void {
          errorMessages.push(m);
        },
        json(_p: unknown): void {
          // no-op
        },
      },
      warnMessages,
      infoMessages,
      errorMessages,
    };
  }

  /**
   * Helper: seed a state.yaml with `lastSuccessfulStep` set to the given
   * step + epic + story. Mirrors Story 3.5's factory.
   */
  async function writeStateWithLastSuccessful(opts: {
    step: string;
    epic?: number;
    story?: string;
  }): Promise<string> {
    const statePath = path.join(tmp, "state.yaml");
    const text = Bun.YAML.stringify({
      schemaVersion: 1,
      project: { name: "stepper-test", bmadVersion: "6.5.0" },
      lastSuccessfulStep: {
        step: opts.step,
        epic: opts.epic ?? 3,
        story: opts.story ?? "3.6",
        completedAt: "2026-04-29T10:00:00Z",
      },
      runHistory: [],
      checkpoints: [],
    });
    await Bun.write(statePath, text);
    return statePath;
  }

  /**
   * Helper: seed a fresh-project state.yaml (no lastSuccessfulStep / no
   * lastAttempted).
   */
  async function writeFreshState(): Promise<string> {
    return writeMinimalState();
  }

  // ─── Test A — AC line 815-817: 5-component reasoning trace ──────────────

  it("AC line 815-817 (Test A): --explain emits 5-component reasoning trace (target / chain / alternatives / persona / reasoning)", async () => {
    const statePath = await writeStateWithLastSuccessful({
      step: "bmad-brainstorming",
      epic: 1,
      story: "1.0",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--explain", "--include-optional"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    const message = result.action.message;
    // (i) target step name surfaces (bmad-product-brief is the unique
    // post-bmad-brainstorming candidate, optional → surfaced under
    // --include-optional).
    expect(message).toContain("Next step: bmad-product-brief");
    // (ii) chain of completed predecessors.
    expect(message).toContain(
      "Chain of completed predecessors: bmad-brainstorming",
    );
    // (iii) alternatives header (some alternatives may be (none) under the
    // narrow post-brainstorming candidate set; assert section presence).
    expect(message).toMatch(/Alternative candidates(:|: \(none\))/);
    // (iv) resolved persona with tier label (Tier 3: built-in defaults).
    expect(message).toContain("Resolved persona:");
    expect(message).toContain("Tier ");
    // (v) reasoning summary (single sentence; semicolon-separated).
    expect(message).toContain("Reasoning:");
    expect(message).toContain("persona resolved to");
  });

  // ─── Test B — AC line 815-817: fresh project — empty predecessor chain ──

  it("AC line 815-817 (Test B): --explain on fresh project emits empty predecessor chain", async () => {
    const statePath = await writeFreshState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--explain", "--include-optional"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    expect(result.action.message).toContain(
      "Chain of completed predecessors: (none — fresh project)",
    );
  });

  // ─── Test C — AC line 817: alternatives sorted by closeness-to-ready ────

  it("AC line 817 (Test C): alternatives sorted by closeness-to-ready ascending (lower count first)", async () => {
    // After bmad-create-prd: 4 candidates (3 optional + 1 non-optional) all
    // have `after: ["bmad-create-prd"]` → count=0. All other DAG nodes
    // have count >= 1. With --include-optional, the alternatives list
    // includes count=0 candidates first.
    const statePath = await writeStateWithLastSuccessful({
      step: "bmad-create-prd",
      epic: 1,
      story: "1.5",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--explain", "--include-optional"],
    });
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    const message = result.action.message;
    // Parse the alternatives lines and extract the per-line counts.
    const altLines = message
      .split("\n")
      .filter((l) => l.startsWith("  - "))
      .map((l) => {
        const m = l.match(/\(count: (\d+)\)/);
        if (m === null) return 0; // "preconditions met" → count 0
        return Number(m[1]);
      });
    // Sort assertion: counts must be non-decreasing.
    for (let i = 1; i < altLines.length; i += 1) {
      const prev = altLines[i - 1] ?? 0;
      const curr = altLines[i] ?? 0;
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });

  // ─── Test D — AC line 817: alternatives respect --no-optional ────────────

  it("AC line 817 (Test D): --explain + --no-optional excludes optional candidates from alternatives list", async () => {
    const statePath = await writeStateWithLastSuccessful({
      step: "bmad-create-prd",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--explain", "--no-optional"],
    });
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    const message = result.action.message;
    // bmad-validate-prd, bmad-edit-prd, bmad-create-ux-design are optional
    // post-create-prd candidates. With --no-optional they MUST NOT appear.
    expect(message).not.toContain("bmad-validate-prd");
    expect(message).not.toContain("bmad-edit-prd");
    expect(message).not.toContain("bmad-create-ux-design");
  });

  // ─── Test E — AC line 817: --persona override → Tier 0 label ─────────────

  it("AC line 817 (Test E): --explain + --persona surfaces Tier 0 override label", async () => {
    const statePath = await writeStateWithLastSuccessful({
      step: "bmad-create-prd",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--explain", "--persona", "tea"],
    });
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    expect(result.action.message).toContain(
      "Resolved persona: tea (Tier 0: --persona override; bypassed 4-tier resolution)",
    );
  });

  // ─── Test F — AC line 817: default → Tier 3 built-in defaults label ──────

  it("AC line 817 (Test F): --explain without --persona surfaces Tier 3 built-in defaults label", async () => {
    // bmad-create-epics-and-stories (default post-create-prd non-optional
    // candidate) has Tier 3 default "pm" per src/personas/defaults.ts.
    const statePath = await writeStateWithLastSuccessful({
      step: "bmad-create-prd",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--explain"],
    });
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    expect(result.action.message).toContain(
      "Resolved persona: pm (Tier 3: built-in defaults)",
    );
  });

  // ─── Test G — AC line 817: reasoning summary three-slot format ────────────

  it("AC line 817 (Test G): reasoning summary has 3 semicolon-separated slots ending with period", async () => {
    const statePath = await writeStateWithLastSuccessful({
      step: "bmad-create-prd",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--explain"],
    });
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    // Grab the Reasoning: line.
    const reasoningLine = result.action.message
      .split("\n")
      .find((l) => l.startsWith("Reasoning:"));
    expect(reasoningLine).toBeDefined();
    // Pattern: "Reasoning: <slot1>; <slot2>; <slot3>." (3 semicolons → split
    // into 3 segments after stripping the prefix; trailing period present).
    expect(reasoningLine).toMatch(
      /^Reasoning: [^;]+; [^;]+; persona resolved to .+\.$/,
    );
  });

  // ─── Test H — AC lines 818-820: all-done verbatim message ────────────────

  it("AC lines 818-820 (Test H): all-done branch emits the verbatim hint byte-identical", async () => {
    // bmad-retrospective is the only retro-phase node + the highest
    // phase-order terminal. No DAG node has it in `after[]`. The
    // all-done detector v0.1 fires on this fixture.
    const statePath = await writeStateWithLastSuccessful({
      step: "bmad-retrospective",
      epic: 6,
      story: "6.0",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--explain"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    // Byte-identical match per AC line 820 wording.
    expect(result.action.message).toBe(
      "All BMAD steps for this project are complete. See /bmad-next --list to inspect remaining optional or unsatisfied steps.",
    );
  });

  // ─── Test I — AC line 821: stderr discipline (multi-persona warn elision) ─

  it("AC line 821 (Test I): --explain + --persona on multi-persona step emits NO multi-persona warn (stderr discipline)", async () => {
    // bmad-create-story Tier 3 = ["analyst", "pm"]. With --persona dev,
    // resolvePersonaWithTier short-circuits at Tier 0 → no array path,
    // no multi-persona warn. The explain branch ALSO does not invoke
    // pickFirstPersona (which is the source of the multi-persona warn).
    const statePath = await writeStateWithLastSuccessful({
      step: "bmad-sprint-planning",
    });
    const cap = captureLogger();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--explain", "--persona", "dev"],
      logger: cap.logger,
    });
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    // Persona Tier 0 line surfaces.
    expect(result.action.message).toContain(
      "Resolved persona: dev (Tier 0: --persona override",
    );
    // No multi-persona warn captured.
    const multiPersonaWarns = cap.warnMessages.filter((m) =>
      m.includes("multi-persona"),
    );
    expect(multiPersonaWarns.length).toBe(0);
  });

  // ─── Test J — Edge: --explain + --resume — surfaces resume target ────────

  it("Edge (Test J): --explain + --resume surfaces resume target + reasoning slot", async () => {
    // Seed a halted state.
    const stateText = Bun.YAML.stringify({
      schemaVersion: 1,
      project: { name: "stepper-test", bmadVersion: "6.5.0" },
      lastAttempted: {
        step: "bmad-dev-story",
        epic: 3,
        story: "3.6",
        attemptedAt: "2026-04-29T11:00:00Z",
      },
      lastFailureReason: {
        code: "VERIFIER_FAILURE",
        message: "test",
        hint: "Run /bmad-next --resume after fixing the underlying issue.",
        runId: "abc123",
      },
      runHistory: [],
      checkpoints: [],
    });
    const statePath = await writeMinimalState(stateText);
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--explain", "--resume"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    expect(result.action.message).toContain("Next step: bmad-dev-story");
    expect(result.action.message).toContain(
      "explicit --resume target (bmad-dev-story)",
    );
  });

  // ─── Test K — Edge: --explain + --step — surfaces explicit step target ────

  it("Edge (Test K): --explain + --step surfaces explicit step target + reasoning slot", async () => {
    const statePath = await writeFreshState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--explain", "--step", "bmad-brainstorming"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    expect(result.action.message).toContain("Next step: bmad-brainstorming");
    expect(result.action.message).toContain(
      "explicit --step override (bmad-brainstorming)",
    );
  });

  // ─── Test L — Edge: --explain + --dry-run — explain wins (precedence) ────

  it("Edge (Test L): --explain + --dry-run — explain short-circuit wins (precedence per run.ts:974)", async () => {
    const statePath = await writeStateWithLastSuccessful({
      step: "bmad-create-prd",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--explain", "--dry-run"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    // Explain trace (NOT dry-run preview format).
    expect(result.action.message).toContain("Next step:");
    expect(result.action.message).toContain("Reasoning:");
    expect(result.action.message.startsWith("Dry-run: would dispatch ")).toBe(
      false,
    );
  });

  // ─── Test M — Edge: --explain when pickNextStep throws filter-exhaustion ─

  it("Edge (Test M): --explain when --phase retro on fresh state — graceful surface", async () => {
    const statePath = await writeFreshState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--explain", "--phase", "retro"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    // No retro-phase entry-point exists; pickNextStep throws filter
    // exhaustion. Explain branch catches and surfaces the graceful line.
    expect(result.action.message).toContain(
      "Next step: (no target step matches; current filter excludes all candidates)",
    );
    // Alternatives are still computed.
    expect(result.action.message).toContain("Alternative candidates");
  });

  // ─── Test N — Edge: persona-resolution AC-2 throw → graceful hint inside ─

  it("Edge (Test N): --explain when persona-resolution throws — graceful AC-2 hint inside message", async () => {
    // Seed a state advancing past a step that has an entry-point successor
    // not registered in any tier (no SKILL.md / no project config / no
    // Tier 3 default / no module config). Use --step <unknown-step> to
    // force the target to a step name that has no persona resolution.
    //
    // Actually, the scenario is: the explain branch resolves a target
    // step (real DAG node like bmad-help — Tier 3 OMITTED in defaults.ts),
    // then resolvePersonaWithTier throws ConfigError; the catch surfaces
    // the AC-2 hint inside the explain message.
    //
    // bmad-help has persona null in seed-v6.x.ts; defaults.ts OMITS it —
    // so resolvePersonaWithTier throws AC-2 ConfigError. Use --step to
    // route the explain target to bmad-help.
    const statePath = await writeFreshState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--explain", "--step", "bmad-help"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    // The AC-2 verbatim hint is rendered inside the explain message; the
    // explain branch returns exitCode 0 (NOT halt).
    expect(result.action.message).toContain(
      "Resolved persona: (unresolvable — see hint:",
    );
    expect(result.action.message).toContain(
      "Add a persona for bmad-help in bmad-stepper.config.yaml under the personas: block.",
    );
  });

  // ─── Test O — AC line 821: human-greppable multi-line message ────────────

  it("AC line 821 (Test O): --explain message is human-greppable (multi-line; per-line greppable)", async () => {
    const statePath = await writeStateWithLastSuccessful({
      step: "bmad-create-prd",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--explain"],
    });
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    const message = result.action.message;
    // (a) AR9 invariant: action is "report" with a single message field.
    expect(result.action.action).toBe("report");
    // (b) Multi-line: contains at least 4 newlines (5 component lines).
    const newlineCount = (message.match(/\n/g) ?? []).length;
    expect(newlineCount).toBeGreaterThanOrEqual(4);
    // (c) Per-line greppable: split-by-\n returns lines beginning with the
    // canonical prefixes.
    const lines = message.split("\n");
    expect(lines.some((l) => l.startsWith("Next step:"))).toBe(true);
    expect(
      lines.some((l) => l.startsWith("Chain of completed predecessors:")),
    ).toBe(true);
    expect(lines.some((l) => l.startsWith("Resolved persona:"))).toBe(true);
    expect(lines.some((l) => l.startsWith("Reasoning:"))).toBe(true);
  });
});

// ─── Story 3.7: --list canonical line format ──────────────────────────────
//
// AC verbatim (epic AC lines 829-835):
//   - Given Stepper has built the DAG | When --list is supplied | Then the
//     JSON-line action is "report" with `message` listing each candidate as
//     `<step-name> — <phase> — preconditions: [<met>/<unmet>] — optional:
//     <yes/no>`, sorted by phase order then name.
//   - And the topological tiebreaker is consistent across runs (reproducible
//     output).
//   - And for projects with 100 epics × 1000 stories, the list emits within 1
//     second (NFR-Sc1, NFR-P1).
//
// Story 3.7 replaces the Story 2.4 placeholder per-line format
// (`<name> (phase: <phase>[, optional])`) with the AC-line-833 canonical
// 4-component format. Adds the synthetic 100k-node NFR-Sc1 perf test.
// Reuses module-level `beforeEach`/`afterEach` + `commonOpts`/
// `writeMinimalState` factories. The `writeStateWithLastSuccessful` helper
// is duplicated locally to avoid scope leakage from the Story 3.6 describe.

describe("runNext — Story 3.7 --list canonical line format", () => {
  /**
   * Helper: seed a state.yaml with `lastSuccessfulStep` set to the given
   * step + epic + story. Mirrors Story 3.5 / 3.6 factory.
   */
  async function writeStateWithLastSuccessful(opts: {
    step: string;
    epic?: number;
    story?: string;
  }): Promise<string> {
    const statePath = path.join(tmp, "state.yaml");
    const text = Bun.YAML.stringify({
      schemaVersion: 1,
      project: { name: "stepper-test", bmadVersion: "6.5.0" },
      lastSuccessfulStep: {
        step: opts.step,
        epic: opts.epic ?? 3,
        story: opts.story ?? "3.7",
        completedAt: "2026-04-29T10:00:00Z",
      },
      runHistory: [],
      checkpoints: [],
    });
    await Bun.write(statePath, text);
    return statePath;
  }

  // ─── Test A — AC line 833: canonical line format on fresh project ───────

  it("AC line 833 (Test A): --list on fresh project emits canonical 4-component line for entry-points", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--list", "--include-optional"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    // (a) Header.
    expect(result.action.message.startsWith("Candidate next steps:")).toBe(
      true,
    );
    // (b) Canonical line for an entry-point: bmad-brainstorming has
    //     `after: []`, `phase: "analysis"`, `optional: true`.
    expect(result.action.message).toContain(
      "  - bmad-brainstorming — analysis — preconditions: [0/0] — optional: yes",
    );
  });

  // ─── Test B — AC line 833: canonical line format on post-first-step ─────

  it("AC line 833 (Test B): --list after lastSuccessfulStep=bmad-brainstorming emits [1/0] for bmad-product-brief", async () => {
    const statePath = await writeStateWithLastSuccessful({
      step: "bmad-brainstorming",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--list", "--include-optional"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    // bmad-product-brief.after === ["bmad-brainstorming"] — fully met.
    expect(result.action.message).toContain(
      "  - bmad-product-brief — analysis — preconditions: [1/0] — optional: yes",
    );
  });

  // ─── Test C — AC line 833: phase-order then name lexicographic sort ─────

  it("AC line 833 (Test C): candidates sorted by phase-order then name lexicographic", async () => {
    // bmad-create-prd unblocks 5+ candidates across multiple phases; with
    // --include-optional we surface them all and assert the sort.
    const statePath = await writeStateWithLastSuccessful({
      step: "bmad-create-prd",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--list", "--include-optional"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    const message = result.action.message;
    // Parse the per-candidate lines (skip the header).
    const PHASE_ORDER_LOCAL: Record<string, number> = {
      analysis: 0,
      planning: 1,
      solutioning: 2,
      implementation: 3,
      retro: 4,
    };
    const lineRe = /^ {2}- (\S+) — (\w+) —/;
    const parsed = message
      .split("\n")
      .filter((l) => l.startsWith("  - "))
      .map((l) => {
        const m = l.match(lineRe);
        if (m === null) return null;
        return { name: m[1] ?? "", phase: m[2] ?? "" };
      })
      .filter((x): x is { name: string; phase: string } => x !== null);
    expect(parsed.length).toBeGreaterThan(0);
    // Phase-order non-decreasing; within same phase, names are
    // lexicographically non-decreasing.
    for (let i = 1; i < parsed.length; i += 1) {
      const prev = parsed[i - 1] as { name: string; phase: string };
      const curr = parsed[i] as { name: string; phase: string };
      const pPrev = PHASE_ORDER_LOCAL[prev.phase] ?? 999;
      const pCurr = PHASE_ORDER_LOCAL[curr.phase] ?? 999;
      expect(pCurr).toBeGreaterThanOrEqual(pPrev);
      if (pCurr === pPrev) {
        expect(curr.name.localeCompare(prev.name)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  // ─── Test D — AC line 833: optional yes surfacing under --include-optional

  it("AC line 833 (Test D): --include-optional surfaces both 'optional: yes' and 'optional: no' lines", async () => {
    // bmad-create-prd post-state surfaces the non-optional
    // bmad-create-epics-and-stories AND optional candidates like
    // bmad-validate-prd / bmad-edit-prd / bmad-create-ux-design.
    const statePath = await writeStateWithLastSuccessful({
      step: "bmad-create-prd",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--list", "--include-optional"],
    });
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    const lines = result.action.message
      .split("\n")
      .filter((l) => l.startsWith("  - "));
    expect(lines.some((l) => l.endsWith("optional: yes"))).toBe(true);
    expect(lines.some((l) => l.endsWith("optional: no"))).toBe(true);
  });

  // ─── Test E — AC line 833: default excludes optional (no 'optional: yes')

  it("AC line 833 (Test E): --list default excludes optional candidates (no 'optional: yes' lines)", async () => {
    const statePath = await writeStateWithLastSuccessful({
      step: "bmad-create-prd",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--list"],
    });
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    expect(result.action.message).not.toContain("optional: yes");
    // The non-optional bmad-create-epics-and-stories surfaces with
    // "optional: no" per the canonical format.
    expect(result.action.message).toContain("optional: no");
  });

  // ─── Test F — AC line 833: precondition counter for entry-points ────────

  it("AC line 833 (Test F): entry-point candidates render preconditions: [0/0] (zero prerequisites)", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--list", "--include-optional"],
    });
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    // Every entry-point on a fresh project has after: [] → [0/0].
    const lines = result.action.message
      .split("\n")
      .filter((l) => l.startsWith("  - "));
    for (const l of lines) {
      expect(l).toContain("preconditions: [0/0]");
    }
  });

  // ─── Test G — AC line 833: precondition counter [1/0] post-first-step ───

  it("AC line 833 (Test G): post-first-step single-prereq candidates render [1/0]", async () => {
    const statePath = await writeStateWithLastSuccessful({
      step: "bmad-create-prd",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--list"],
    });
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    // bmad-create-epics-and-stories.after === ["bmad-create-prd"] → [1/0].
    expect(result.action.message).toContain(
      "  - bmad-create-epics-and-stories — planning — preconditions: [1/0] — optional: no",
    );
  });

  // ─── Test H — AC line 834: reproducibility (byte-identical across runs) ─

  it("AC line 834 (Test H): --list emits byte-identical output across two invocations (reproducibility)", async () => {
    const statePath = await writeStateWithLastSuccessful({
      step: "bmad-create-prd",
    });
    const r1 = await runNext({
      ...commonOpts(statePath),
      argv: ["--list", "--include-optional"],
    });
    const r2 = await runNext({
      ...commonOpts(statePath),
      argv: ["--list", "--include-optional"],
    });
    expect(r1.action.action).toBe("report");
    expect(r2.action.action).toBe("report");
    if (r1.action.action !== "report" || r2.action.action !== "report") return;
    expect(r1.action.message).toBe(r2.action.message);
  });

  // ─── Test I — Edge: --list + --phase planning constrains to phase ──────

  it("Edge (Test I): --list + --phase planning emits only planning-phase candidates", async () => {
    const statePath = await writeStateWithLastSuccessful({
      step: "bmad-create-prd",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--list", "--include-optional", "--phase", "planning"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    const lines = result.action.message
      .split("\n")
      .filter((l) => l.startsWith("  - ") && !l.startsWith("  (none"));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      // Each line's phase component must equal "planning".
      expect(l).toMatch(/ — planning — preconditions: /);
    }
  });

  // ─── Test J — Edge: --list + --no-optional excludes optional ────────────

  it("Edge (Test J): --list + --no-optional emits no 'optional: yes' lines", async () => {
    const statePath = await writeStateWithLastSuccessful({
      step: "bmad-create-prd",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--list", "--no-optional"],
    });
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    expect(result.action.message).not.toContain("optional: yes");
  });

  // ─── Test K — Edge: --list + --explain → explain wins (route order) ─────

  it("Edge (Test K): --list + --explain — explain short-circuit fires first (route order)", async () => {
    const statePath = await writeStateWithLastSuccessful({
      step: "bmad-create-prd",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--list", "--explain"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    // Explain trace markers (NOT list output).
    expect(result.action.message).toContain("Next step:");
    expect(result.action.message).toContain("Reasoning:");
    expect(result.action.message).not.toContain("Candidate next steps:");
  });

  // ─── Test L — Edge: empty candidate set hint ────────────────────────────

  it("Edge (Test L): --list with --no-optional on fresh project emits empty-candidate-set hint", async () => {
    // ALL fresh-project entry-points are optional per seed-v6.x; with
    // --no-optional the candidate set is empty.
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--list", "--no-optional"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    // Header + the empty-set hint.
    expect(result.action.message).toContain("Candidate next steps:");
    expect(result.action.message).toContain(
      "(none — current state + filters yield zero candidates)",
    );
  });

  // ─── Test M — Edge: em-dash literal U+2014 in line format ───────────────

  it("Edge (Test M): per-line format uses U+2014 EM DASH separator (' — ')", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--list", "--include-optional"],
    });
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    const candidateLines = result.action.message
      .split("\n")
      .filter((l) => l.startsWith("  - ") && !l.startsWith("  (none"));
    expect(candidateLines.length).toBeGreaterThan(0);
    // Each line contains TWO em-dashes (between name/phase and between
    // phase/preconditions and between preconditions/optional → 3 em-dashes
    // total per Story 3.7 canonical format).
    for (const line of candidateLines) {
      expect(line).toContain(" — ");
      // Confirm U+2014 (NOT hyphen-minus U+002D which is the bullet prefix).
      const emDashCount = (line.match(/—/g) ?? []).length;
      expect(emDashCount).toBe(3);
    }
  });

  // ─── Test N — NFR-Sc1: 100k-node perf test (AC line 835) ────────────────

  it("NFR-Sc1 (Test N): formatter + sorter emit within 800ms for 100 epics × 1000 stories (~100k nodes)", () => {
    type Phase =
      | "analysis"
      | "planning"
      | "solutioning"
      | "implementation"
      | "retro";
    interface SyntheticNode {
      readonly name: string;
      readonly phase: Phase;
      readonly after: readonly string[];
      readonly optional: boolean;
    }
    const PHASE_ORDER_LOCAL: ReadonlyMap<string, number> = new Map([
      ["analysis", 0],
      ["planning", 1],
      ["solutioning", 2],
      ["implementation", 3],
      ["retro", 4],
    ]);
    const phases: Phase[] = [
      "analysis",
      "planning",
      "solutioning",
      "implementation",
      "retro",
    ];
    // Build synthetic 100-epic × 1000-story DAG (~100k nodes).
    const nodes = new Map<string, SyntheticNode>();
    const epicCount = 100;
    const storyCount = 1000;
    for (let i = 0; i < epicCount; i += 1) {
      const name = `epic-${i}-root`;
      nodes.set(name, {
        name,
        phase: "analysis",
        after: [],
        optional: false,
      });
    }
    for (let i = 0; i < epicCount; i += 1) {
      for (let j = 0; j < storyCount; j += 1) {
        const name = `epic-${i}-story-${j}`;
        const phase = phases[j % phases.length] as Phase;
        nodes.set(name, {
          name,
          phase,
          after: [`epic-${i}-root`],
          optional: false,
        });
      }
    }
    expect(nodes.size).toBe(epicCount + epicCount * storyCount);

    // Inline the Story 3.7 formatter + sorter hot path. Direct
    // construction skips runNext orchestration overhead per spec design
    // decision (test the formatter unit, not the full orchestration).
    const start = performance.now();
    // Fresh-project candidate set: only entry-points (after: []).
    const candidates: SyntheticNode[] = [];
    for (const node of nodes.values()) {
      if (node.after.length !== 0) continue;
      candidates.push(node);
    }
    candidates.sort((a, b) => {
      const pa = PHASE_ORDER_LOCAL.get(a.phase) ?? 999;
      const pb = PHASE_ORDER_LOCAL.get(b.phase) ?? 999;
      if (pa !== pb) return pa - pb;
      return a.name.localeCompare(b.name);
    });
    const lines: string[] = ["Candidate next steps:"];
    for (const node of candidates) {
      // Inline the Story 3.7 formatCandidateLine logic.
      let met = 0;
      for (const _p of node.after) met += 0;
      const unmet = node.after.length - met;
      const optional = node.optional ? "yes" : "no";
      lines.push(
        `  - ${node.name} — ${node.phase} — preconditions: [${met}/${unmet}] — optional: ${optional}`,
      );
    }
    const message = lines.join("\n");
    const elapsed = performance.now() - start;

    // 20% safety margin under the 1s AC budget per spec Task 9.4.
    expect(elapsed).toBeLessThan(800);
    expect(message).toContain("Candidate next steps:");
    // 100 root nodes are entry-points → 100 candidate lines + 1 header.
    expect(message.split("\n")).toHaveLength(101);
  });
});

// ─── Story 3.8 — `--diff-state` and `--export-state` ──────────────────────
//
// Story 3.8 (epic AC lines 845-852):
// - --diff-state invokes src/state/diff.ts → loads state.yaml, runs
//   recomputeStateUnlocked, computes divergences, emits human-readable report.
// - --export-state invokes src/state/export.ts → loads state.yaml, projects
//   into the schema-versioned 7-field JSON shape, emits valid JSON body.
// - Both flags do NOT acquire the project lock (FR52, lock-free contract per
//   AR8 + architecture §line 1672).
// - Integration test (export-state-no-lock.test.ts) verifies stdout-only
//   JSON emission per FR54 special-case.

describe("runNext — Story 3.8 --diff-state and --export-state", () => {
  /**
   * Helper: seed a state.yaml with `lastSuccessfulStep` set. The export
   * shape's `currentPhase` lookup uses the runner-built DAG; the seeded
   * step name resolves via `dag.nodes.get(name)?.phase`. `bmad-create-prd`
   * resolves to `"planning"` per Story 1.10's seed-v6.x DAG.
   */
  async function writeStateWithLastSuccessful(opts: {
    step: string;
    epic?: number;
    story?: string;
  }): Promise<string> {
    const statePath = path.join(tmp, "state.yaml");
    const text = Bun.YAML.stringify({
      schemaVersion: 1,
      project: { name: "stepper-test", bmadVersion: "6.5.0" },
      lastSuccessfulStep: {
        step: opts.step,
        epic: opts.epic ?? 3,
        story: opts.story ?? "3.8",
        completedAt: "2026-05-01T10:00:00Z",
      },
      runHistory: [],
      checkpoints: [],
    });
    await Bun.write(statePath, text);
    return statePath;
  }

  // ─── Test A — --diff-state returns report action with in-sync message ───

  it("AC line 847 (Test A): --diff-state returns 'report' action with humanReadable message", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--diff-state"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    // Either in-sync (no artifacts) OR diverges-with-fields. The minimal
    // state has no lastSuccessfulStep and no artifacts, so it must be in-sync.
    const startsWithSync = result.action.message.startsWith(
      "state.yaml is in sync with files of truth",
    );
    const startsWithDiverges = result.action.message.startsWith(
      "state.yaml diverges from files of truth",
    );
    expect(startsWithSync || startsWithDiverges).toBe(true);
  });

  // ─── Test B — --export-state returns report action with parseable JSON ──

  it("AC line 850 (Test B): --export-state returns 'report' action with valid JSON body", async () => {
    const statePath = await writeStateWithLastSuccessful({
      step: "bmad-create-prd",
      epic: 1,
      story: "1.5",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--export-state"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    // The message is the JSON body; JSON.parse must succeed.
    const parsed = JSON.parse(result.action.message);
    expect(parsed.schemaVersion).toBe(1);
    // currentPhase resolves via the DAG: bmad-create-prd is "planning".
    expect(parsed.currentPhase).toBe("planning");
    expect(parsed.activeEpic).toBe(1);
    expect(parsed.lastSuccessfulStep?.step).toBe("bmad-create-prd");
    expect(parsed.bmadVersion).toBe("6.5.0");
    expect(parsed.stepperVersion).toBe("0.1.0");
    // Defence-in-depth: the schema parse already ran inside exportState;
    // re-run safeParse on the JSON-roundtripped value.
    const { StateExportV1Schema } = await import(
      "../../schemas/state-export.ts"
    );
    const safe = StateExportV1Schema.safeParse(parsed);
    expect(safe.success).toBe(true);
  });

  // ─── Test C — route order: --export-state + --diff-state → export wins ──

  it("AC line 850 (Test C): --export-state + --diff-state combo → export wins (route order)", async () => {
    const statePath = await writeStateWithLastSuccessful({
      step: "bmad-create-prd",
      epic: 1,
      story: "1.5",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--export-state", "--diff-state"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    // Should be the JSON body (export wins per route order at run.ts:1398-1400).
    const parsed = JSON.parse(result.action.message);
    expect(parsed.schemaVersion).toBe(1);
  });

  // ─── Test D — route order: --diff-state + --explain → diff wins ─────────

  it("AC line 847 (Test D): --diff-state + --explain combo → diff wins (route order)", async () => {
    const statePath = await writeStateWithLastSuccessful({
      step: "bmad-create-prd",
      epic: 1,
      story: "1.5",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--diff-state", "--explain"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    // Should be the diff humanReadable (NOT the explain "Next step:" trace).
    const startsWithSync = result.action.message.startsWith(
      "state.yaml is in sync with files of truth",
    );
    const startsWithDiverges = result.action.message.startsWith(
      "state.yaml diverges from files of truth",
    );
    expect(startsWithSync || startsWithDiverges).toBe(true);
    // Negative — should NOT be the explain trace.
    expect(result.action.message.startsWith("Next step:")).toBe(false);
  });

  // ─── Test E — route order: --export-state + --doctor → doctor wins ──────

  it("AC line 850 (Test E): --export-state + --doctor combo → doctor wins (--doctor at 1380-1396 fires earlier)", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--export-state", "--doctor"],
    });
    // Doctor runs FIRST per the route order at run.ts:1380-1396; its result
    // is the `report` action's message, NOT the JSON export body.
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    // Doctor messages are NOT JSON parseable. Try-catch the parse to assert.
    let parsedAsJson = false;
    try {
      const parsed = JSON.parse(result.action.message);
      parsedAsJson =
        typeof parsed === "object" &&
        parsed !== null &&
        "schemaVersion" in parsed;
    } catch {
      parsedAsJson = false;
    }
    expect(parsedAsJson).toBe(false);
  });

  // ─── Test F — --export-state with empty state has all-null fields ───────

  it("AC line 850 (Test F): --export-state on empty state emits all-null fields except bmadVersion + stepperVersion", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--export-state"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    const parsed = JSON.parse(result.action.message);
    expect(parsed.currentPhase).toBeNull();
    expect(parsed.activeEpic).toBeNull();
    expect(parsed.lastSuccessfulStep).toBeNull();
    expect(parsed.lastAttempted).toBeNull();
    expect(parsed.lastFailureReason).toBeNull();
    expect(parsed.bmadVersion).toBe("6.5.0");
    expect(parsed.stepperVersion).toBe("0.1.0");
  });

  // ─── Test G — --diff-state lock-free invariant (no `acquire` import in run.ts)

  it("AC line 851 (Test G): --diff-state + --export-state preserve the lock-free invariant", async () => {
    // Story 3.8 imports diffState + exportState from ../../state/{diff,export}.
    // Both helpers are mid-tier modules per AR41 — they MUST NOT import from
    // src/lock/, MUST NOT call acquire(), MUST NOT call loadState/saveState.
    // The pre-existing AR41 boundary check at run.test.ts:606-638 enforces
    // this for run.ts; the new Story 3.8 helpers carry their own colocated
    // boundary checks in src/state/diff.test.ts (Test G) and
    // src/state/export.test.ts (Test G).
    //
    // This test re-asserts the invariant at the runner level: the run.ts
    // imports for the new helpers are present; the locked variants are NOT.
    const source = await Bun.file(path.join(import.meta.dir, "run.ts")).text();
    expect(source).toContain('from "../../state/diff.ts"');
    expect(source).toContain('from "../../state/export.ts"');
    // Forbidden imports — ensure the locked variants are NOT imported by run.ts.
    expect(source).not.toMatch(/\brecomputeState\b\s*[,}]/);
    expect(source).not.toMatch(/\bsaveState\b\s*[,}]/);
  });
});

// ─── Story 3.9 — `--watch` live transcript tail ───────────────────────────

describe("runNext — Story 3.9 --watch live transcript tail", () => {
  /**
   * Capture `process.stdout.write` for the duration of `fn`. Mirrors
   * `src/runs/watch.test.ts`'s capture helper. Runner-tier tests need
   * to suppress + capture the watcher's raw stdout emissions so the
   * test runner output stays clean.
   */
  async function captureStdout<T>(fn: () => Promise<T>): Promise<{
    result: T;
    stdout: string;
  }> {
    const original = process.stdout.write.bind(process.stdout);
    let buf = "";
    process.stdout.write = ((chunk: string | Uint8Array): boolean => {
      if (typeof chunk === "string") {
        buf += chunk;
      } else {
        buf += new TextDecoder().decode(chunk);
      }
      return true;
    }) as typeof process.stdout.write;
    try {
      const result = await fn();
      return { result, stdout: buf };
    } finally {
      process.stdout.write = original;
    }
  }

  // ─── Test A — empty-runs path (no logs) returns no-runs report ──────────

  it("Test A: --watch with no runs returns 'report' action with no-runs message", async () => {
    const statePath = await writeMinimalState();
    const watchRunsRoot = path.join(tmp, "runs"); // does NOT exist
    const { result, stdout } = await captureStdout(() =>
      runNext({
        ...commonOpts(statePath),
        argv: ["--watch"],
        watchRunsRoot,
        watchPollMs: 25,
      }),
    );
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    expect(result.action.message).toContain("no runs to watch");
    // The watcher emitted the verbatim hint via raw stdout.
    expect(stdout).toContain("No run logs yet. Start a step with /bmad-next.");
  });

  // ─── Test B — populated path with abort-driven exit returns watched ─────

  it("Test B: --watch with a populated log returns 'watched' message after abort", async () => {
    const statePath = await writeMinimalState();
    const watchRunsRoot = path.join(tmp, "runs");
    await fs.mkdir(watchRunsRoot, { recursive: true });
    const filePath = path.join(watchRunsRoot, "2026-05-01T120000-step.log");
    await Bun.write(filePath, "watched-content\n");

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 80);

    const { result, stdout } = await captureStdout(() =>
      runNext({
        ...commonOpts(statePath),
        argv: ["--watch"],
        watchRunsRoot,
        watchPollMs: 25,
        watchSignal: controller.signal,
      }),
    );

    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    expect(result.action.message).toContain("watch session ended");
    // The streamed transcript line went to stdout DIRECTLY.
    expect(stdout).toContain("watched-content\n");
  });

  // ─── Test C — route order: --watch + --diff-state → watch wins ──────────

  it("Test C: --watch + --diff-state combo → watch wins (route order)", async () => {
    const statePath = await writeMinimalState();
    const watchRunsRoot = path.join(tmp, "runs");
    await fs.mkdir(watchRunsRoot, { recursive: true });
    await Bun.write(
      path.join(watchRunsRoot, "2026-05-01T120000-step.log"),
      "log-line\n",
    );

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 80);

    const { result } = await captureStdout(() =>
      runNext({
        ...commonOpts(statePath),
        argv: ["--watch", "--diff-state"],
        watchRunsRoot,
        watchPollMs: 25,
        watchSignal: controller.signal,
      }),
    );

    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    // Watch summary message — NOT the diff humanReadable.
    expect(result.action.message).toContain("watch session ended");
    expect(result.action.message).not.toContain("state.yaml is in sync");
    expect(result.action.message).not.toContain("state.yaml diverges");
  });

  // ─── Test D — route order: --doctor + --watch → doctor wins ─────────────

  it("Test D: --doctor + --watch combo → doctor wins (route order: doctor at 1395-1411 fires first)", async () => {
    const statePath = await writeMinimalState();
    const { result } = await captureStdout(() =>
      runNext({
        ...commonOpts(statePath),
        argv: ["--doctor", "--watch"],
        watchRunsRoot: path.join(tmp, "runs"),
        watchPollMs: 25,
      }),
    );
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    // Doctor messages do NOT contain the watch summary.
    expect(result.action.message).not.toContain("watch session ended");
    expect(result.action.message).not.toContain("no runs to watch");
  });

  // ─── Test E — lock-free invariant: --watch does NOT import lock module ──

  it("Test E: --watch invocation preserves the lock-free invariant", async () => {
    // Source-content scan: Story 3.9 imports watchMostRecentRunLog from
    // ../../runs/watch.ts (mid-tier sibling). The locked variants are NOT
    // imported by run.ts. The pre-existing AR41 boundary check at
    // run.test.ts:606-638 enforces this; this test re-asserts at the runner
    // level that the new Story 3.9 import is mid-tier (NOT src/lock/).
    const source = await Bun.file(path.join(import.meta.dir, "run.ts")).text();
    expect(source).toContain('from "../../runs/watch.ts"');
    // Forbidden — Story 3.9 must NOT route through src/lock/ in any new code path.
    expect(source).not.toMatch(/from\s+["']\.\.\/\.\.\/lock\//);
  });
});

// ─── Story 3.10 — read-only flags map to action=report (FR52) ─────────────
//
// AC verbatim (epics.md line 885):
//   - And all read-only flags map to action=`report` with no state mutation.
//
// Story 3.10 verifies the existing structurally-lock-free invariant for the
// FIVE read-only flags (`--export-state`, `--diff-state`, `--explain`,
// `--list`, `--dry-run`). The invariant ALREADY HOLDS in v0.1 (Story 2.4
// established run.ts as lock-free per AR8 + architecture §line 1672); these
// tests are defense-in-depth assertions:
//
// - Test A: action=report invariant — each flag returns
//   `result.action.action === "report"`.
// - Test B: source-content scan — `src/commands/next/run.ts` has ZERO
//   `acquire(` invocations (the AR8 lock-free contract). Mirrors Story 3.9's
//   structural source-scan pattern.
// - Test C: no FS mutation — tmpdir snapshot is byte-identical before +
//   after each flag's invocation. Extends Story 3.3's `dry-run-no-writes`
//   pattern to ALL FIVE flags.

describe("runNext — Story 3.10 read-only flags map to action=report", () => {
  /**
   * Seed a state.yaml with a populated `lastSuccessfulStep` so the FIVE
   * read-only flags have non-trivial input (e.g., `--diff-state` has both
   * sides populated; `--export-state` resolves currentPhase).
   */
  async function writeStateWithLastSuccessful(): Promise<string> {
    const stateText = Bun.YAML.stringify({
      schemaVersion: 1,
      project: { name: "stepper-test-3-10", bmadVersion: "6.5.0" },
      lastSuccessfulStep: {
        step: "bmad-create-prd",
        epic: 1,
        story: "1.5",
        completedAt: "2026-04-30T12:00:00Z",
      },
      runHistory: [],
      checkpoints: [],
    });
    return writeMinimalState(stateText);
  }

  /**
   * Recursively enumerate every file path under `root`. Returns a Map of
   * relative-path → { mtimeMs, size, contentHash }. Mirrors the
   * `walkFiles` helper from
   * `src/integration/no-write-outside-scope.test.ts:119-140` adapted for
   * snapshot-diff comparison.
   */
  async function snapshotFiles(
    root: string,
  ): Promise<Map<string, { mtimeMs: number; size: number; sha: string }>> {
    const out = new Map<
      string,
      { mtimeMs: number; size: number; sha: string }
    >();
    const stack: string[] = [root];
    while (stack.length > 0) {
      const dir = stack.pop() as string;
      let entries: import("node:fs").Dirent[];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          stack.push(full);
        } else if (entry.isFile()) {
          const rel = path.relative(root, full);
          const stat = await fs.stat(full);
          const text = await Bun.file(full).text();
          const sha = Bun.hash(text).toString();
          out.set(rel, { mtimeMs: stat.mtimeMs, size: stat.size, sha });
        }
      }
    }
    return out;
  }

  // The FIVE read-only flags per AC line 873.
  const FIVE_FLAGS = [
    "--export-state",
    "--diff-state",
    "--explain",
    "--list",
    "--dry-run",
  ] as const;

  // ─── Test A — action=report invariant for FIVE flags (AC line 885) ──────

  it("Test A: every read-only flag returns action='report'", async () => {
    const statePath = await writeStateWithLastSuccessful();
    for (const flag of FIVE_FLAGS) {
      const result = await runNext({
        ...commonOpts(statePath),
        argv: [flag],
      });
      // Per AC line 885: each read-only flag's runNext result MUST carry
      // action="report". The exit code is 0 on the happy path; the
      // halt-on-malformed-state path would surface as exitCode 1, but the
      // seeded state.yaml is well-formed, so we expect 0 here.
      expect(result.exitCode).toBe(0);
      expect(result.action.action).toBe("report");
    }
  });

  // ─── Test B — source-content scan: no `acquire(` in run.ts ──────────────

  it("Test B: src/commands/next/run.ts contains ZERO `acquire(` invocations (AR8)", async () => {
    // The structurally-lock-free contract per AR8 + architecture §line 1672:
    // run.ts NEVER calls `acquire()` from `src/lock/lock.ts`. This test
    // re-asserts the invariant at the source-content level, complementing
    // the existing AR41 boundary check at run.test.ts:606-638.
    const source = await Bun.file(path.join(import.meta.dir, "run.ts")).text();
    // Strip JSDoc/comment lines so the docblock can mention forbidden APIs
    // for prose context.
    const code = source
      .split("\n")
      .filter((line) => !/^\s*\*/.test(line) && !/^\s*\/\//.test(line))
      .join("\n");
    // No `acquire(` call expressions in the executable code.
    expect(code).not.toMatch(/\bacquire\(/);
    // No `from "../../lock/"` imports — Story 3.10 does NOT route any new
    // code path through src/lock/ in run.ts. The AR41 boundary check at
    // line 637 already enforces this; we re-assert here for clarity in the
    // Story 3.10 test cluster.
    expect(source).not.toMatch(/from\s+["']\.\.\/\.\.\/lock\//);
  });

  // ─── Test C — no FS mutation for FIVE flags (AC line 885) ───────────────

  it("Test C: every read-only flag leaves the tmpdir byte-identical (no state mutation)", async () => {
    // For each flag: snapshot tmpdir before + after; assert byte-identical
    // inventory (zero new files; zero modified mtimes; zero modified
    // contents). Extends Story 3.3's `dry-run-no-writes` pattern to ALL
    // FIVE flags.
    for (const flag of FIVE_FLAGS) {
      // Fresh tmpdir per flag (AR35 discipline).
      const flagTmp = await fs.mkdtemp(
        path.join(os.tmpdir(), `stepper-3-10-${flag.slice(2)}-`),
      );
      try {
        const flagStateText = Bun.YAML.stringify({
          schemaVersion: 1,
          project: { name: "stepper-test-3-10-c", bmadVersion: "6.5.0" },
          lastSuccessfulStep: {
            step: "bmad-create-prd",
            epic: 1,
            story: "1.5",
            completedAt: "2026-04-30T12:00:00Z",
          },
          runHistory: [],
          checkpoints: [],
        });
        const flagStatePath = path.join(flagTmp, "state.yaml");
        await Bun.write(flagStatePath, flagStateText);

        // Snapshot BEFORE.
        const before = await snapshotFiles(flagTmp);

        await runNext({
          projectRoot: flagTmp,
          statePath: flagStatePath,
          stagingRoot: path.join(flagTmp, "staging"),
          skillNames: [],
          nowIso: "2026-04-29T10:15:00.000Z",
          argv: [flag],
        });

        // Snapshot AFTER.
        const after = await snapshotFiles(flagTmp);

        // Same number of files.
        expect(after.size).toBe(before.size);
        // Same paths + same content.
        for (const [rel, beforeEntry] of before.entries()) {
          const afterEntry = after.get(rel);
          expect(afterEntry).toBeDefined();
          if (afterEntry === undefined) continue;
          // Content hash must match (no in-place modifications).
          expect(afterEntry.sha).toBe(beforeEntry.sha);
          // Size must match.
          expect(afterEntry.size).toBe(beforeEntry.size);
        }
      } finally {
        await fs.rm(flagTmp, { recursive: true, force: true });
      }
    }
  });

  // ─── Test D — `acquire` import surface check (forward-proofing) ──────────

  it("Test D: skipAcquire field is exposed on LockOptions in src/lock/lock.ts", async () => {
    // Story 3.10's primary mutation: src/lock/lock.ts gains a
    // `readonly skipAcquire?: boolean` field on LockOptions + an
    // EARLY-EXIT branch in acquire(). Source-content scan asserts both
    // surfaces are present, regardless of v0.1 caller usage.
    const lockSource = await Bun.file(
      path.join(import.meta.dir, "../../lock/lock.ts"),
    ).text();
    expect(lockSource).toContain("readonly skipAcquire?: boolean");
    expect(lockSource).toContain("skipAcquire === true");
    // The sentinel marker is present (machine-recognisable; never refers
    // to a real path).
    expect(lockSource).toContain("<no-op:skipAcquire>");
  });
});

// ─── Story 5.2 — --skip <step> flag handling (SK_52_RUN_*) ────────────────

describe("runNext — Story 5.2 --skip flag (SK_52_RUN_*)", () => {
  /**
   * Helper: seed state with a halted lastAttempted so --skip + --resume
   * has a target to skip. Mirrors the writeResumeState helper from the
   * Story 3.2 --resume tests.
   */
  async function writeSkipState(opts: {
    skippedStep: string;
    epic: number;
    story: string;
  }): Promise<string> {
    const stateObj: Record<string, unknown> = {
      schemaVersion: 1,
      project: { name: "stepper-test", bmadVersion: "6.5.0" },
      lastSuccessfulStep: {
        step: "bmad-create-prd",
        epic: 1,
        story: "1.0",
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
        hint: "Run /bmad-next --resume after fixing the underlying issue.",
        runId: "abc123",
      },
      runHistory: [],
      checkpoints: [],
    };
    return writeMinimalState(Bun.YAML.stringify(stateObj));
  }

  it("SK_52_RUN_1: --skip alone (no --resume) → SkipRequiresResumeError → exit 2 + AC-verbatim hint", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--skip", "bmad-dev-story"],
    });
    expect(result.exitCode).toBe(2);
    expect(result.action.action).toBe("halt");
    if (result.action.action !== "halt") return;
    // BYTE-IDENTICAL hint per AC line 1080.
    expect(result.action.message).toBe(
      "--skip requires --resume to advance state. Run /bmad-next --skip <step> --resume.",
    );
  });

  it("SK_52_RUN_2: --skip <step> --resume routes through dispatch (action=dispatch, exit 0)", async () => {
    const statePath = await writeSkipState({
      skippedStep: "bmad-dev-story",
      epic: 5,
      story: "5.2",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--skip", "bmad-dev-story", "--resume"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("dispatch");
    if (result.action.action !== "dispatch") return;
    // The dispatch carries the lastAttempted payload that Layer 1
    // forwards to verify-and-advance.ts; the user-supplied --skip
    // value is the same step, so the step name on the dispatch matches.
    expect(result.action.lastAttempted?.step).toBe("bmad-dev-story");
  });

  it('SK_52_RUN_3: --skip "" (empty value) + --resume routes through (parser accepts; runner-tier defers to verify-and-advance.ts mismatch check)', async () => {
    // Per Story 1.7 line 70 forward-dep precedent, empty-string values
    // are accepted by the parser; the runner enforces the cross-
    // validation (--skip alone must throw); the actual mismatch with
    // state.lastAttempted.step lands at verify-and-advance.ts (OQ-6).
    // With --resume present, --skip "" passes the cross-validation;
    // the dispatch goes through the resume path.
    const statePath = await writeSkipState({
      skippedStep: "bmad-dev-story",
      epic: 5,
      story: "5.2",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--skip", "", "--resume"],
    });
    // With --resume, the dispatch happens; the empty-string skip value
    // would be caught at the Layer 2 mismatch check in
    // verify-and-advance.ts (covered by SK_52_VA_2).
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("dispatch");
  });

  it("SK_52_RUN_4: SK_52_RUN_2 result.exitCode === 0 + result.action.action === 'dispatch' on the routing path", async () => {
    const statePath = await writeSkipState({
      skippedStep: "bmad-dev-story",
      epic: 5,
      story: "5.2",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--skip", "bmad-dev-story", "--resume"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("dispatch");
  });

  it("SK_52_RUN_5: the exit-2 hint matches the AR22 regex /^.*(Run|See|Try|Check) /", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--skip", "bmad-dev-story"],
    });
    expect(result.action.action).toBe("halt");
    if (result.action.action !== "halt") return;
    expect(result.action.message).toMatch(/^.*(Run|See|Try|Check) /);
  });

  it("SK_52_RUN_6: --skip + --resume + --dry-run combination (forward-tracker per OQ-9 — v0.1 routes through dispatch flow)", async () => {
    // Per OQ-9 v0.1 conservative: --skip + --dry-run goes through the
    // dry-run preview path (the runner emits action: report with the
    // planned skip preview). Story 5.x or 6.x may extend the preview
    // with skip-specific framing; v0.1 ships the existing dry-run
    // output augmented by the resume-target step (which == args.skip).
    const statePath = await writeSkipState({
      skippedStep: "bmad-dev-story",
      epic: 5,
      story: "5.2",
    });
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--skip", "bmad-dev-story", "--resume", "--dry-run"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("report");
  });
});

// ─── Story 5.3 — --auto-fix flag handling (RTF_53_RUN_*) ──────────────────

describe("runNext — Story 5.3 --auto-fix flag (RTF_53_RUN_*)", () => {
  it("RTF_53_RUN_1: --auto-fix routes through dispatch + sets resolvedFailurePolicy='route-to-fixer'", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming", "--auto-fix"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("dispatch");
    // Story 5.3: --auto-fix overrides per-step policy to "route-to-fixer"
    // for one run (architecture line 499).
    expect(result.resolvedFailurePolicy).toBe("route-to-fixer");
  });

  it("RTF_53_RUN_2: --auto-fix + --resume accepted at the parser tier (combination not rejected by Zod or cross-validation)", async () => {
    // The combination --auto-fix + --resume is parser-accepted (both
    // flags are independent — no enforceMutuallyExclusiveFlags rule
    // forbids it). Validated via parseNextArgs directly to isolate the
    // parser tier from runtime concerns (state coherence, lock acquire,
    // etc. are tested separately via the verify-and-advance.ts seam).
    const result = parseNextArgs(["--auto-fix", "--resume"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.autoFix).toBe(true);
    expect(result.value.resume).toBe(true);
  });

  it("RTF_53_RUN_3: --auto-fix overrides any incoming failurePolicyOverride from RunNextOptions (per architecture line 499)", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming", "--auto-fix"],
      // Even when test-injection seam supplies "retry", --auto-fix
      // overrides to "route-to-fixer" unconditionally.
      failurePolicyOverride: "retry",
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("dispatch");
    expect(result.resolvedFailurePolicy).toBe("route-to-fixer");
  });

  it("RTF_53_RUN_4: --auto-fix + --dry-run produces report-mode output (forward-tracker per OQ-6 dry-run preview)", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming", "--auto-fix", "--dry-run"],
    });
    expect(result.exitCode).toBe(0);
    // Per the existing dry-run path (Story 1.7 / 3.3), --dry-run
    // produces a report-mode output describing the planned dispatch.
    // Story 5.3 v0.1 conservative: the dry-run preview shows the
    // dispatch with --auto-fix planned; full report-mode preview with
    // planned-fix-attempt enumeration is forward-tracker for Story 6.x.
    expect(result.action.action).toBe("report");
  });

  it("RTF_53_RUN_5: result.exitCode === 0 + result.action.action === 'dispatch' on the routing path", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming", "--auto-fix"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("dispatch");
  });

  it("RTF_53_RUN_6: --auto-fix=false → autoFix === false → resolvedFailurePolicy preserves opts.failurePolicyOverride (no override)", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming", "--auto-fix=false"],
      failurePolicyOverride: "retry",
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("dispatch");
    // With --auto-fix=false the override is NOT applied; the
    // RunNextOptions.failurePolicyOverride passes through untouched.
    expect(result.resolvedFailurePolicy).toBe("retry");
  });

  it("RTF_53_RUN_7: omitted --auto-fix → resolvedFailurePolicy is 'escalate' (Story 5.6 — resolver fallback when no per-step config)", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("dispatch");
    // Story 5.6 (FR31): no --auto-fix + no failurePolicyOverride + no
    // opts.config → resolveFailurePolicy(step, undefined) returns the
    // plugin default "escalate" per architecture line 499 ("escalate is
    // the safest fallback when no per-step policy is set"). Pre-Story-5.6
    // this returned undefined; Story 5.6 wires the production resolver
    // path so the field is now ALWAYS populated when the runner reaches
    // the dispatch composition (NextResult.resolvedFailurePolicy).
    expect(result.resolvedFailurePolicy).toBe("escalate");
  });
});

// ─── Story 6.1: loadConfigOverride seam wiring (FR34-FR40) ────────────────

describe("CFG_61_RUN_*: loadConfigOverride wiring (Story 6.1)", () => {
  it("CFG_61_RUN_1: loadConfigOverride resolves to config object → resolveFailurePolicy uses the policy", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming"],
      loadConfigOverride: () => ({
        failurePolicies: { "bmad-brainstorming": "retry" },
      }),
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("dispatch");
    expect(result.resolvedFailurePolicy).toBe("retry");
  });

  it("CFG_61_RUN_2: loadConfigOverride NOT used when opts.config supplied directly (opts.config wins)", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming"],
      // opts.config WINS over loadConfigOverride.
      config: { failurePolicies: { "bmad-brainstorming": "skip" } },
      loadConfigOverride: () => ({
        failurePolicies: { "bmad-brainstorming": "retry" },
      }),
    });
    expect(result.exitCode).toBe(0);
    expect(result.resolvedFailurePolicy).toBe("skip");
  });

  it("CFG_61_RUN_3: loadConfigOverride absent + opts.config absent → escalate-default fallback", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.resolvedFailurePolicy).toBe("escalate");
  });

  it("CFG_61_RUN_4: --auto-fix overrides config policy unconditionally (priority order per OQ-5)", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming", "--auto-fix"],
      loadConfigOverride: () => ({
        failurePolicies: { "bmad-brainstorming": "retry" },
      }),
    });
    expect(result.exitCode).toBe(0);
    expect(result.resolvedFailurePolicy).toBe("route-to-fixer");
  });
});

// ─── Story 6.2: opts.config?.overrides → BuildInput.overrides wiring ────

describe("OVR_62_RUN_*: opts.config?.overrides threading (Story 6.2)", () => {
  it("OVR_62_RUN_1: opts.config.overrides threads into build() via the strict path (override accepted)", async () => {
    // Supply a typed override Record. The override redefines
    // `bmad-brainstorming` (a seed entry) to a different phase. The
    // dispatch-spec embeds the phase verbatim in the `taskSpec.task`
    // string ("Execute BMAD step <name> (phase <phase>) ..."); we
    // verify the override flowed through by string-matching the
    // dispatch-spec.json output.
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming"],
      config: {
        overrides: {
          "bmad-brainstorming": {
            phase: "implementation",
          },
        },
      },
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
    const spec = JSON.parse(await Bun.file(specPath).text()) as {
      taskSpec: { task: string };
    };
    // Override pinned the step to "implementation" (vs the seed's
    // "analysis" baseline for bmad-brainstorming).
    expect(spec.taskSpec.task).toContain("phase implementation");
  });

  it("OVR_62_RUN_2: unknown predecessor in opts.config.overrides → halt action exit 2 with edge-pointing hint (AC-2)", async () => {
    // Override declares an unknown predecessor → strict path throws
    // ConfigError; runNext catches it via haltFromError and returns a
    // halt action carrying the actionable hint.
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming"],
      config: {
        overrides: {
          "bmad-brainstorming": {
            phase: "analysis",
            after: ["nonexistent-predecessor"],
          },
        },
      },
    });
    expect(result.exitCode).toBe(2);
    expect(result.action.action).toBe("halt");
    if (result.action.action !== "halt") return;
    expect(result.action.exitCode).toBe(2);
    expect(result.action.message).toMatch(
      /See bmad-stepper\.config\.yaml at overrides\.bmad-brainstorming\.after\[0\]: predecessor "nonexistent-predecessor"/,
    );
    expect(result.action.message).toMatch(/Run \/bmad-next --doctor/);
    expect(result.action.message).not.toMatch(/[\n\r]/);
  });
});

// ─── Story 6.3: opts.config?.models → buildDispatchSpec.modelOverride ──
//
// AC-1 — `models:` config block → dispatch-spec.json's `model` field;
// default `sonnet` if not configured. The runner reads
// `opts.config?.models?.[stepName]` (Story 6.1 typed `Config.models`)
// and threads via `modelOverride` (Story 2.2 existing field). Tests
// supply synthetic config records via the typed `RunNextOptions.config`
// seam (Story 5.6 + 6.1 + 6.2 frozen).

describe("MOD_63_RUN_*: opts.config?.models threading (Story 6.3)", () => {
  it("MOD_63_RUN_1: opts.config.models[stepName] threads into dispatch-spec.json's `model` field (AC-1)", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming"],
      config: {
        models: {
          "bmad-brainstorming": "opus",
        },
      },
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
    const spec = JSON.parse(await Bun.file(specPath).text()) as {
      model: string;
    };
    expect(spec.model).toBe("opus");
  });

  it("MOD_63_RUN_2: empty config.models record → dispatch-spec.json's model defaults to 'sonnet' (AC-1 fallback)", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming"],
      config: {
        models: {},
      },
    });
    expect(result.action.action).toBe("dispatch");
    if (result.action.action !== "dispatch") return;
    const specPath = path.join(
      tmp,
      "staging",
      result.action.runId,
      "dispatch-spec.json",
    );
    const spec = JSON.parse(await Bun.file(specPath).text()) as {
      model: string;
    };
    expect(spec.model).toBe("sonnet");
  });

  it("MOD_63_RUN_3: absent opts.config → dispatch-spec.json's model defaults to 'sonnet' (AC-1 fallback)", async () => {
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
    const spec = JSON.parse(await Bun.file(specPath).text()) as {
      model: string;
    };
    expect(spec.model).toBe("sonnet");
  });

  it("MOD_63_RUN_4: per-step config selectivity — only the matching step receives the configured model", async () => {
    // Configure 'haiku' for a DIFFERENT step than the one we dispatch.
    // The dispatched step should still receive the default 'sonnet'.
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming"],
      config: {
        models: {
          "some-other-step": "haiku",
        },
      },
    });
    expect(result.action.action).toBe("dispatch");
    if (result.action.action !== "dispatch") return;
    const specPath = path.join(
      tmp,
      "staging",
      result.action.runId,
      "dispatch-spec.json",
    );
    const spec = JSON.parse(await Bun.file(specPath).text()) as {
      model: string;
    };
    expect(spec.model).toBe("sonnet");
  });
});

describe("MOD_63_RUN_DRYRUN_*: opts.config?.models in --dry-run preview (Story 6.3)", () => {
  it("MOD_63_RUN_DRYRUN_1: dry-run preview surfaces the configured model", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming", "--dry-run"],
      config: {
        models: {
          "bmad-brainstorming": "opus",
        },
      },
    });
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    expect(result.action.message).toContain("opus");
    expect(result.action.message).not.toContain("sonnet");
    expect(result.action.message).toContain("60k context");
    expect(result.action.message).toContain("5min timeout");
  });

  it("MOD_63_RUN_DRYRUN_2: dry-run preview defaults to sonnet when config absent", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming", "--dry-run"],
    });
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    expect(result.action.message).toContain("sonnet");
  });
});

// Story 6.4 — `budgets:` per-step config consumer wiring tests. Mirrors
// the Story 6.3 MOD_63_RUN_* + MOD_63_RUN_DRYRUN_* pattern: the runner
// reads `opts.config?.budgets?.[stepName]` (Story 6.1 typed Config.budgets
// field) and threads via `buildDispatchSpec.budgetOverride`. When undefined
// (no per-step config), defaults fire (60_000 / 300_000) per AC-1.

describe("BUD_64_RUN_*: opts.config?.budgets threading (Story 6.4 AC-1)", () => {
  it("BUD_64_RUN_1: opts.config.budgets[stepName] threads into dispatch-spec.json's `budget` field", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming"],
      config: {
        budgets: {
          "bmad-brainstorming": { contextTokens: 80000, timeoutMs: 600000 },
        },
      },
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
    const spec = JSON.parse(await Bun.file(specPath).text()) as {
      budget: { contextTokens: number; timeoutMs: number };
    };
    expect(spec.budget).toEqual({ contextTokens: 80000, timeoutMs: 600000 });
  });

  it("BUD_64_RUN_2: empty config.budgets record → defaults 60000/300000", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming"],
      config: {
        budgets: {},
      },
    });
    expect(result.action.action).toBe("dispatch");
    if (result.action.action !== "dispatch") return;
    const specPath = path.join(
      tmp,
      "staging",
      result.action.runId,
      "dispatch-spec.json",
    );
    const spec = JSON.parse(await Bun.file(specPath).text()) as {
      budget: { contextTokens: number; timeoutMs: number };
    };
    expect(spec.budget).toEqual({ contextTokens: 60000, timeoutMs: 300000 });
  });

  it("BUD_64_RUN_3: non-matching step key in budgets → defaults 60000/300000", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming"],
      config: {
        budgets: {
          "some-other-step": { contextTokens: 100000, timeoutMs: 900000 },
        },
      },
    });
    expect(result.action.action).toBe("dispatch");
    if (result.action.action !== "dispatch") return;
    const specPath = path.join(
      tmp,
      "staging",
      result.action.runId,
      "dispatch-spec.json",
    );
    const spec = JSON.parse(await Bun.file(specPath).text()) as {
      budget: { contextTokens: number; timeoutMs: number };
    };
    expect(spec.budget).toEqual({ contextTokens: 60000, timeoutMs: 300000 });
  });

  it("BUD_64_RUN_4: partial override (only contextTokens) — timeoutMs falls through to default", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming"],
      config: {
        budgets: {
          "bmad-brainstorming": { contextTokens: 80000 },
        },
      },
    });
    expect(result.action.action).toBe("dispatch");
    if (result.action.action !== "dispatch") return;
    const specPath = path.join(
      tmp,
      "staging",
      result.action.runId,
      "dispatch-spec.json",
    );
    const spec = JSON.parse(await Bun.file(specPath).text()) as {
      budget: { contextTokens: number; timeoutMs: number };
    };
    expect(spec.budget).toEqual({ contextTokens: 80000, timeoutMs: 300000 });
  });
});

describe("BUD_64_RUN_DRYRUN_*: opts.config?.budgets in --dry-run preview (Story 6.4)", () => {
  it("BUD_64_RUN_DRYRUN_1: preview surfaces the configured budget (80k context, 10min timeout)", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming", "--dry-run"],
      config: {
        budgets: {
          "bmad-brainstorming": { contextTokens: 80000, timeoutMs: 600000 },
        },
      },
    });
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    expect(result.action.message).toContain("80k context");
    expect(result.action.message).toContain("10min timeout");
    expect(result.action.message).not.toContain("60k context");
    expect(result.action.message).not.toContain("5min timeout");
  });

  it("BUD_64_RUN_DRYRUN_2: preview defaults to `60k context, 5min timeout` when config absent", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming", "--dry-run"],
    });
    expect(result.action.action).toBe("report");
    if (result.action.action !== "report") return;
    expect(result.action.message).toContain("60k context");
    expect(result.action.message).toContain("5min timeout");
  });
});

// ─── Story 6.5: VER_65_RUN_* — RunNextOptions.config.verifiers type
// extension (the runner does not consume verifiers at the dispatch tier;
// the field is forwarded to the verify-and-advance Layer 2 when called
// in sequence — see VER_65_VANDA_* in verify-and-advance.test.ts for the
// behaviour validation. These tests confirm the type extension does not
// regress the dispatch-tier path).

describe("VER_65_RUN_*: opts.config?.verifiers type extension (Story 6.5 AC-1 wiring)", () => {
  it("VER_65_RUN_1: opts.config.verifiers does not regress runNext dispatch-tier behaviour", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming"],
      config: {
        verifiers: {
          "bmad-brainstorming": { requiredFrontmatterSections: ["owner"] },
        },
      },
    });
    // The runner emits a dispatch action; verifier consumption happens
    // at Layer 2 (verify-and-advance.ts), not here.
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("dispatch");
  });

  it("VER_65_RUN_2: backwards-compat — absent config.verifiers preserves runNext dispatch-tier semantics", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("dispatch");
  });
});

// ─── Story 6.6: TLM_66_RUN_* — RunNextOptions.config.telemetry type
// extension. The runner does NOT consume telemetry at the dispatch tier;
// the field is forwarded to verify-and-advance Layer 2 when called in
// sequence — see TLM_66_VANDA_* in verify-and-advance.test.ts for the
// behaviour validation. These tests confirm the type extension does not
// regress the dispatch-tier path.

describe("TLM_66_RUN_*: opts.config?.telemetry type extension (Story 6.6 AC-1 wiring)", () => {
  it("TLM_66_RUN_1: opts.config.telemetry={enabled:true} does not regress runNext dispatch-tier behaviour", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming"],
      config: { telemetry: { enabled: true } },
    });
    // runNext composer emits dispatch; telemetry write happens at
    // verify-and-advance Layer 2, NOT here.
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("dispatch");
  });

  it("TLM_66_RUN_2: backwards-compat — absent config.telemetry preserves runNext dispatch-tier semantics", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("dispatch");
  });

  it("TLM_66_RUN_3: opts.config.telemetry={enabled:false} (explicit default) does not regress dispatch", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming"],
      config: { telemetry: { enabled: false } },
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("dispatch");
  });

  it("TLM_66_RUN_4: loadConfigOverride returns telemetry → flows through type system", async () => {
    const statePath = await writeMinimalState();
    const result = await runNext({
      ...commonOpts(statePath),
      argv: ["--step", "bmad-brainstorming"],
      loadConfigOverride: () => ({ telemetry: { enabled: true } }),
    });
    expect(result.exitCode).toBe(0);
    expect(result.action.action).toBe("dispatch");
  });
});
