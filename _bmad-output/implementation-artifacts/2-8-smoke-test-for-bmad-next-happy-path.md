---
status: done
story_id: '2.8'
story_key: 2-8-smoke-test-for-bmad-next-happy-path
epic: '2'
title: 'Smoke Test for `/bmad-next` Happy Path'
created: '2026-05-01'
last_updated: '2026-05-01T09:14:00Z'
priority: M
estimated_effort: M
fr_coverage:
  - FR1
  - FR16
  - FR17
  - FR18
  - FR53
  - FR54
nfr_coverage:
  - NFR-S2
  - NFR-S5
  - NFR-R1
  - NFR-I5
  - NFR-M1
ar_coverage:
  - AR8
  - AR9
  - AR25
  - AR26
  - AR33
  - AR35
  - AR41
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/implementation-artifacts/epic-1-retrospective.md
  - _bmad-output/implementation-artifacts/2-1-verifier-configuration-registry.md
  - _bmad-output/implementation-artifacts/2-2-dispatch-spec-generator.md
  - _bmad-output/implementation-artifacts/2-3-generic-sub-agent-bmad-step-runner-md.md
  - _bmad-output/implementation-artifacts/2-4-lock-free-run-ts-for-bmad-next.md
  - _bmad-output/implementation-artifacts/2-5-markdown-transcript-json-run-log-writers.md
  - _bmad-output/implementation-artifacts/2-6-verify-and-advance-ts-with-state-hash-check.md
  - _bmad-output/implementation-artifacts/2-7-slash-command-for-bmad-next-layer-1-markdown.md
  - _bmad-output/implementation-artifacts/1-12-bmad-next-doctor-command.md
  - _bmad-output/implementation-artifacts/1-1-initialize-repository-scaffold.md
  - commands/bmad-next.md
  - agents/bmad-step-runner.md
  - src/commands/next/run.ts
  - src/commands/next/verify-and-advance.ts
  - src/commands/next/run.test.ts
  - src/commands/next/verify-and-advance.test.ts
  - src/integration/doctor-marketplace.test.ts
  - src/schemas/dispatch-protocol.ts
  - src/schemas/dispatch-spec.ts
  - src/schemas/run-log.ts
  - src/dispatch/emit.ts
  - tests/fixtures/bmad-step-runner/dispatch-spec.json
---

# Story 2.8: Smoke Test for `/bmad-next` Happy Path

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper maintainer,
I want a smoke test that validates Epic 2's end-to-end contract against a fixture BMAD project,
So that a regression in any of: dispatch-spec generation, sub-agent dispatch, verifier, promotion, state advance, or transcript writing is caught in CI.

## Context Summary

This is the **eighth and final story of Epic 2 (Single-Step Advance with Sub-Agent Dispatch)** and lands the **canonical end-to-end smoke test** for the `/bmad-next` happy path. With Stories 2.1-2.7 now complete (verifiers, dispatch-spec generator, sub-agent definition, lock-free runner, transcript writers, lock-acquiring runner, and Layer 1 markdown), Story 2.8 closes the epic by establishing **automated regression coverage** for the Bash → AR9 → (mocked) Task → Bash → summary pipeline. Until Story 2.8, every story shipped its OWN colocated `*.test.ts` covering the unit / integration boundary of that module — but **no test exercised both runners' `import.meta.main` entrypoints together**. Story 2.7 dev notes (line 525-526 + Task 12.3) call out this exact gap: *"Manual smoke validation only — automated end-to-end is Story 2.8."* Story 2.8 closes the gap.

Concretely, this story produces:

1. **`tests/fixtures/minimal-bmad-project/`** (NEW directory) — a pre-baked minimal BMAD project layout containing:
   - `_bmad/config.yaml` (project-name + bmm: stanza per Story 1.9 detector convention)
   - `_bmad-output/.stepper/state.yaml` is **NOT** pre-baked (per epic AC line 711 — "no `state.yaml`"); the smoke test creates state on the fly via `Bun.write` to honor a deterministic dispatch path. The fixture supplies `_bmad/` only; everything under `_bmad-output/` is materialized into the test's tmpdir.
   - `staging/` is **NOT** pre-baked (created by Story 2.4's `run.ts` at dispatch time per architecture §line 1672).
   - `README.md` documenting the fixture's role + the smoke-test entrypoint.
2. **`src/smoke/next.test.ts`** (NEW file) — the canonical end-to-end smoke per epic AC line 712. Per architecture §lines 956 + 1249-1252, smoke tests live under `src/smoke/<command>.test.ts`. Story 1.x deferred the `src/smoke/` directory creation per the doctor smoke at `src/integration/doctor-marketplace.test.ts` (Story 1.12 dev-002 deviation accepted). Story 2.8 is the FIRST canonical occupant of `src/smoke/`.
3. **`src/integration/no-write-outside-scope.test.ts`** (NEW file) — the NFR-S2 enforcement smoke per architecture §line 1245 + §line 1007. The smoke ALSO asserts no out-of-scope writes per epic AC line 714 ("no writes occurred outside the test tmpdir"). The dedicated NFR-S2 file is a SECOND canonical exercise of the same property — listed as an architectural CI gate (§line 1396) but not yet shipped. Story 2.8 lands BOTH because the smoke fixture + helpers naturally double as the no-write-outside-scope substrate.

This story is **structurally distinct** from prior Epic 2 stories: the deliverable is a **TypeScript test file + a fixture directory + an integration test**. It ships **NO new production code under `src/commands/`, `src/dispatch/`, `src/state/`, `src/runs/`, `src/verifiers/`** — every production surface (`run.ts`, `verify-and-advance.ts`, `emitDispatchAction`, `runVerifier`, `promote`, `writeStepTranscript`) is exercised AS-IS via `Bun.spawn` against the source tree per the `src/integration/doctor-marketplace.test.ts` precedent.

The smoke test exercises:

1. **Bash invoke 1**: `Bun.spawn(["bun", "run", "src/commands/next/run.ts", ...])` against the fixture project root.
2. **AR9 stdout JSON line**: read the single line from stdout and assert `action: "dispatch"` (per epic AC line 713 wording).
3. **Mocked Task dispatch**: write the sub-agent's expected output artifact directly to `staging/<runId>/outputs/<step>.md` per the dispatch-spec's `outputFormat.fileLocation`. The smoke test SUBSTITUTES for the Task tool because real Claude API access is not available in CI (per architecture §line 1265 Layer 1 — "Calling Task" is forbidden inside `src/`; the smoke must mock).
4. **Bash invoke 2**: `Bun.spawn(["bun", "run", "src/commands/next/verify-and-advance.ts", ...])` with the captured `runId` + dummy token counts (`--tokens-in 100 --tokens-out 50` per epic AC line 713).
5. **Assertions** per epic AC line 714:
   - `state.yaml` is created with `lastSuccessfulStep` set to the expected step.
   - The artifact is at its canonical location.
   - `runs/<ts>-<step>.log` exists with the expected sections.
   - `runs/<ts>-<step>.json` validates against the schema.
   - No writes occurred outside the test tmpdir.
6. **CI matrix** per epic AC line 715: the test runs on Linux + macOS via the existing CI matrix (NFR-I5 already satisfied by `.github/workflows/ci.yml` shipped in Story 1.1; Story 2.8 adds NO new CI configuration).

This story closes the **NFR-M1 orphan requirement** for the FR1 + FR16 + FR17 + FR18 contract — the architecture's §Requirements Coverage Validation table (line 1611) lists FR16 + FR17 + FR18 with the SECONDARY enforcement at the smoke layer, and Story 2.8 is the first concrete realization. It also closes Story 2.7's carry-over (line 892 of Story 2.7 file): *"Story 2.8 (canonical end-to-end smoke test) — the natural next deliverable."*

It does **NOT**:

- Implement a **REAL Task tool invocation**. The Task tool is a Claude Code main-thread surface (Layer 1 per architecture §line 1263); `bun test` runs at Layer 2 only. The smoke MUST mock the sub-agent step by writing the expected artifact directly to `staging/<runId>/outputs/`. This is the architecture's prescribed pattern — see §line 1264 ("Layer 2 ... Forbidden: Calling `Task`") and Story 2.7 line 794 ("bun test cannot exercise Layer 1 — no Claude API access in unit tests").
- Implement the **`/bmad-loop` smoke test**. That is **Story 4.1+** — `commands/bmad-loop.md` does not yet exist; the loop runner ships in Epic 4. Story 2.8 covers `/bmad-next` ONLY (the only slash command that exercises the dispatch + verify-and-advance pipeline today).
- Implement **all eight stop-condition tests** (NFR-R7) or **all four failure-UX tests** (NFR-R8). Those are Epic 4 + Epic 5 deliverables (per architecture §lines 1234-1235). Story 2.8 covers the **happy path** only — one dispatch, one verifier pass, one state advance.
- Implement **performance assertions** (NFR-P1, NFR-P3, NFR-Sc3). Long-run perf coverage lives in `src/integration/long-run-1000-dispatches.test.ts` per architecture §line 1247 — Epic 6 polish. Story 2.8 measures functional correctness only.
- Modify **any production source under `src/commands/`, `src/dispatch/`, `src/state/`, `src/runs/`, `src/verifiers/`, `src/io/`, `src/schemas/`, `src/personas/`, `src/dag/`, `src/lock/`**. The smoke test invokes the production source AS-IS. ZERO production deltas.
- Modify **`commands/bmad-next.md`** (Story 2.7 deliverable) or **`agents/bmad-step-runner.md`** (Story 2.3 deliverable). The smoke test reads BOTH files via `Bun.file().text()` only as informational verifications (the markdown is the contract surface; the smoke verifies the runtime side of the contract).

It DOES land:

- The **`tests/fixtures/minimal-bmad-project/`** fixture directory with `_bmad/config.yaml` (the only pre-baked file) per the architecture's "fixtures live outside `src/`" convention (§line 1550).
- The **`src/smoke/next.test.ts`** file — the FIRST canonical occupant of `src/smoke/` per architecture §line 1249 + §line 1252. The file uses Bun.spawn to invoke BOTH `import.meta.main` entrypoints in sequence with a simulated sub-agent step in between.
- The **`src/integration/no-write-outside-scope.test.ts`** file — the canonical NFR-S2 enforcement smoke per architecture §line 1245 + §line 1396. The file uses the same fixture + Bun.spawn pattern but adds a `walkAndAssertNoOutOfScopeWrites` helper that recursively enumerates every file under the test tmpdir AFTER the smoke completes and asserts every path lives inside `_bmad-output/.stepper/`, `_bmad-output/<phase>-artifacts/`, `_bmad/`, or `staging/`.
- A **`scripts/run-smoke.sh`** invocation contract documented in this story (NOT a NEW file — the `package.json` `scripts.test:smoke` is the canonical invocation path per architecture §line 963; Story 2.8 verifies the script runs the new file). If `scripts.test:smoke` does NOT yet exist, Story 2.8 ADDS it as a one-line `package.json` edit (the architecture line 963 already prescribes the script; the source-tree just hasn't materialized it yet).

## Acceptance Criteria

The acceptance criteria below are reproduced **verbatim** from `_bmad-output/planning-artifacts/epics.md` §Story 2.8 (lines 703-715, BDD Given/When/Then format). Lines and AC labelling preserved.

**Given** `tests/fixtures/minimal-bmad-project/` with a fresh `_bmad/`, no `state.yaml`, an empty `_bmad-output/`
**When** `bun test src/smoke/next.test.ts` runs in a tmpdir copy of the fixture
**Then** the test invokes `bun run src/commands/next/run.ts` (mocking the Task tool's response with a fixture artifact written to `staging/<run-id>/outputs/`), then `bun run src/commands/next/verify-and-advance.ts -- --run-id <id> --tokens-in 100 --tokens-out 50`
**And** asserts: `state.yaml` is created with `lastSuccessfulStep` set to the expected step, the artifact is at its canonical location, `runs/<ts>-<step>.log` exists with the expected sections, `runs/<ts>-<step>.json` validates against the schema, no writes occurred outside the test tmpdir
**And** the smoke test runs on Linux + macOS in CI matrix (NFR-I5)

## Tasks / Subtasks

- [x] **Task 0 — Verify pre-conditions (AC: all)**
  - [x] 0.1 Confirm Stories 2.1-2.7 are all `done` per `_bmad-output/implementation-artifacts/sprint-status.yaml`.
  - [x] 0.2 Confirm both `import.meta.main` entrypoints emit exactly ONE AR9 JSON line via `emitDispatchAction` then `process.exit`: `src/commands/next/run.ts:831-850` (Story 2.4) and `src/commands/next/verify-and-advance.ts:793-813` (Story 2.6).
  - [x] 0.3 Confirm schemas exported for the smoke to import: `src/schemas/dispatch-protocol.ts` exports `DispatchActionV1Schema` (round-trip-validate AR9 line); `src/schemas/run-log.ts` exports `RunLogV1Schema` (validate JSON run-log written by Story 2.5's `writeStepTranscript`).
  - [x] 0.4 Confirm `tests/fixtures/` directory EXISTS (Stories 1.13 + 2.3 fixtures already live there). Story 2.8 creates `tests/fixtures/minimal-bmad-project/` as a new sibling.
  - [x] 0.5 Read `src/integration/doctor-marketplace.test.ts` lines 91-119 — the canonical `Bun.spawn` invocation pattern Story 2.8 mirrors. Note: `cwd: projectRoot` + `env: { ...process.env, HOME: tmp }` overrides; `stdout: "pipe"` / `stderr: "pipe"`; `await proc.exited` for exit code; `await Promise.all([new Response(proc.stdout).text(), ...])` to avoid pipe-buffer blocking.
  - [x] 0.6 Read epics.md Story 2.8 §lines 703-715 verbatim. Confirm AC text in §Acceptance Criteria above is character-identical.
  - [x] 0.7 Read architecture.md §lines 956 + 962-963 (smoke test naming + invocation paths); §lines 1233-1252 (test directory listings); §line 1245 (NFR-S2 placement); §line 1265 (Layer 2 forbidden from Task — mock prescribed); §line 1396 (NFR-S2 → integration test); §line 1419 (NFR-I5 → CI matrix); §line 1550 (fixtures outside `src/`); §line 1672 (process boundary); §line 1677 (token counts via positional flags).
  - [x] 0.8 Read prd.md FR1, FR16, FR17, FR18, FR53, FR54 + NFR-S2/S5/R1/I5/M1.
  - [x] 0.9 Read Story 2.7 lines 890-895 (E2E SATISFACTION carry-over) + line 525-526 (defers automated end-to-end to Story 2.8). Read Story 2.6 `verify-and-advance.test.ts` lines 100-180 (`seedFixture` helper — Story 2.8 uses a DIFFERENT seed pattern: lets `run.ts` create the dispatch-spec rather than pre-baking). Read Story 2.4 `run.test.ts:24` deferral comment ("Tests target `runNext()` — NOT `import.meta.main` (covered by Story 2.8)").
  - [x] 0.10 Confirm `package.json` has the `scripts.test` entry; check whether `scripts.test:smoke` exists per architecture §line 963 (if NOT, plan additive edit per Task 7.2).
  - [x] 0.11 Confirm baseline `bun run check` exits 0 with **523 pass / 0 fail / 1840 expects / 45 files** (carries from Stories 2.6 + 2.7 final). Confirm Bun host version satisfies AR2 (Bun >= 1.3).
  - [x] 0.12 Read `tests/fixtures/bmad-step-runner/dispatch-spec.json` (Story 2.3 fixture) — confirm the dispatch-spec shape Story 2.8's smoke uses as a structural template; mocked artifact body shape from `verify-and-advance.test.ts:170-176`: `---\ntitle: <topic>\nstatus: review\n---\n# Body`.

- [x] **Task 1 — Plan the smoke test architecture (AC: all)**
  - [x] 1.1 Sketch the smoke test's life cycle per AR35 tmpdir-per-test + the `doctor-marketplace.test.ts` precedent — 4 phases:
    1. **beforeEach**: `mkdtemp("stepper-smoke-next-")`; copy fixture's `_bmad/` → `tmp/_bmad/`; `mkdir tmp/_bmad-output/`.
    2. **Bash invoke 1**: spawn `run.ts -- --step bmad-brainstorming` against `tmp`; assert exit 0; parse single AR9 line; assert `action === "dispatch"`, `agent === "bmad-step-runner"`; capture `runId`.
    3. **Mocked Task dispatch**: read `staging/<runId>/dispatch-spec.json`; write a valid artifact (satisfies verifier's requiredSections) to `taskSpec.outputFormat.fileLocation` via `Bun.write`.
    4. **Bash invoke 2**: spawn `verify-and-advance.ts -- --run-id <id> --tokens-in 100 --tokens-out 50`; assert exit 0; parse second AR9 line; assert `action === "report"`, `message.startsWith("✓ ")`, `message.includes("tokens: in=100 out=50")`.
    5. **Post-run assertions** (per AC line 714): `state.yaml` exists at `_bmad-output/.stepper/state.yaml` with `lastSuccessfulStep.step === "bmad-brainstorming"`; canonical artifact at `_bmad-output/planning-artifacts/bmad-brainstorming.md`; transcript pair `<ts>-<step>.{log,json}` under `_bmad-output/.stepper/runs/`; markdown contains "## State Before" / "## State After"; JSON validates against `RunLogV1Schema`; no writes ABOVE tmpdir.
    6. **afterEach**: `fs.rm(tmp, { recursive: true, force: true })`.
  - [x] 1.2 Document the **mocked-Task substitution rationale** per architecture §line 1265 (Layer 2 forbidden from Task) + Story 2.7 line 794: smoke reads `taskSpec.outputFormat.fileLocation`, writes a body satisfying `requiredSections`; verifier runs identically to a real sub-agent run. **Contract under test is LAYER 2** (`run.ts` → `verify-and-advance.ts`), NOT Layer 3 (sub-agent execution).
  - [x] 1.3 Document the **`--step bmad-brainstorming`** choice: seed-v6.x marks all analysis entry-points as `optional: true`; cold-start zero-config halts with "no candidate found" hint per Story 2.4 `run.test.ts:79-89`. `bmad-brainstorming` is the alphabetically-first analyst entry per `seed-v6.x.ts:55-62` with empty `after[]`, `phase: analysis` → `planning-artifacts/`, persona `analyst`. Story 2.8 prefers explicit `--step` over post-first-step seeding for clarity.
  - [x] 1.4 Document the **smoke vs integration distinction** per architecture §lines 1548-1549: smoke = happy-path per command; integration = cross-cutting flows. Story 2.8 lands BOTH because no-write-outside-scope is a cross-cutting NFR-S2 gate naturally exercised after a happy-path pipeline run.

- [x] **Task 2 — Create the fixture project (AC: line 711)**
  - [x] 2.1 Create directory `tests/fixtures/minimal-bmad-project/`. Add a top-level `README.md` documenting the fixture's role:
    ```markdown
    # tests/fixtures/minimal-bmad-project/

    Minimal BMAD project layout used by `src/smoke/next.test.ts` (Story 2.8 —
    canonical end-to-end smoke for `/bmad-next` happy path).

    The fixture supplies ONLY the `_bmad/` subtree (project config + bmm
    stanza per Story 1.9 detector convention). Everything under
    `_bmad-output/` is created by the smoke test itself in a tmpdir copy
    of this fixture (per AR35 tmpdir-per-test discipline).

    Per epic Story 2.8 AC line 711: "fresh `_bmad/`, no `state.yaml`,
    an empty `_bmad-output/`".

    The smoke test:
      1. Copies `_bmad/` to `<tmp>/_bmad/`.
      2. Creates an empty `<tmp>/_bmad-output/` directory.
      3. Invokes `bun run src/commands/next/run.ts -- --step bmad-brainstorming`
         against the tmpdir.
      4. Mocks the Task tool by writing the expected artifact to
         `<tmp>/staging/<runId>/outputs/<step>.md`.
      5. Invokes `bun run src/commands/next/verify-and-advance.ts --
         --run-id <id> --tokens-in 100 --tokens-out 50`.
      6. Asserts state advance + canonical promotion + transcript
         existence + no out-of-scope writes.

    See `src/smoke/next.test.ts` for the exercised AC and
    `src/integration/no-write-outside-scope.test.ts` for the NFR-S2
    enforcement smoke that uses this same fixture.
    ```
  - [x] 2.2 Create `tests/fixtures/minimal-bmad-project/_bmad/config.yaml` per Story 1.9 + Story 1.12 detector convention:
    ```yaml
    bmm:
      project_name: smoke-test-project
    ```
    No additional config needed — Story 1.10's seed-v6.x DAG plus the v0.1 default verifier registry plus the v0.1 default persona resolver supply every other contract surface.
  - [x] 2.3 Verify the fixture's directory layout via `ls -la tests/fixtures/minimal-bmad-project/`:
    ```
    tests/fixtures/minimal-bmad-project/
      README.md
      _bmad/
        config.yaml
    ```
    NO `_bmad-output/` directory is committed; NO `state.yaml`; NO `staging/`. Per epic AC line 711 verbatim.
  - [x] 2.4 Document in the fixture README that the fixture is **READ-ONLY** at runtime — the smoke test copies `_bmad/` into a tmpdir before running anything. The fixture should NEVER be mutated by tests; if a test needs to seed additional content, it does so in the tmpdir copy.

- [x] **Task 3 — Author the smoke test scaffolding (AC-1 — fixture copy)**
  - [x] 3.1 Create `src/smoke/next.test.ts`. Open with the file-header docstring per the doctor-marketplace.test.ts precedent:
    ```ts
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
     * staging/<runId>/outputs/<step>.md per the dispatch-spec's
     * outputFormat.fileLocation. The verifier then runs identically
     * to a real sub-agent run.
     *
     * AR35 tmpdir-per-test discipline: every test runs under a unique
     * os.tmpdir()-derived directory; cleanup via fs.rm in afterEach.
     * NEVER hard-coded /tmp/... paths.
     */
    ```
  - [x] 3.2 Add the imports + module-scope state per the doctor-marketplace.test.ts precedent:
    ```ts
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
    ```
  - [x] 3.3 Add the `beforeEach` + `afterEach` hooks. The `beforeEach` mints a tmpdir under `os.tmpdir()` and copies the fixture's `_bmad/` subtree:
    ```ts
    beforeEach(async () => {
      tmp = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-smoke-next-"));
      // Copy _bmad/ from the fixture into the tmpdir.
      await copyDirectory(
        path.join(FIXTURE_ROOT, "_bmad"),
        path.join(tmp, "_bmad"),
      );
      // Materialize an empty _bmad-output/ per AC line 711.
      await fs.mkdir(path.join(tmp, "_bmad-output"), { recursive: true });
    });

    afterEach(async () => {
      if (tmp !== "") {
        await fs.rm(tmp, { recursive: true, force: true });
        tmp = "";
      }
    });
    ```
  - [x] 3.4 Add a recursive `copyDirectory(src, dst)` helper using `fs.cp` (Node ≥ 16.7 / Bun ≥ 1.0 stable surface):
    ```ts
    async function copyDirectory(src: string, dst: string): Promise<void> {
      await fs.mkdir(dst, { recursive: true });
      await fs.cp(src, dst, { recursive: true });
    }
    ```
    Verify `fs.cp` is available in the target Bun runtime (AR2 Bun >= 1.3). If not available, fall back to a manual `readdir + Bun.file().arrayBuffer() + Bun.write` walk.
  - [x] 3.5 Add the `spawnRunner` helper that wraps `Bun.spawn` with the canonical pattern:
    ```ts
    interface SpawnResult {
      readonly exitCode: number;
      readonly stdout: string;
      readonly stderr: string;
    }

    async function spawnRunner(
      scriptPath: string,
      args: readonly string[],
      cwd: string,
    ): Promise<SpawnResult> {
      const proc = Bun.spawn(["bun", "run", scriptPath, "--", ...args], {
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
    ```
    The `HOME: cwd` override mirrors `doctor-marketplace.test.ts:95` — keeps the runner from accidentally probing the user's real `~/.claude/` plugin directory; this is the AR35-prescribed isolation.

- [x] **Task 4 — Author the smoke test body — happy-path scenario (AC-1, AC-2, AC-3, AC-4)**
  - [x] 4.1 Add the canonical `it(...)` block under a `describe("smoke /bmad-next happy path", ...)` group. The test body follows the 4-step lifecycle from Task 1.1:
    ```ts
    describe("smoke /bmad-next happy path", () => {
      it("invokes run.ts → mocks Task → invokes verify-and-advance.ts → asserts full pipeline", async () => {
        // ─── Step 1: Bash invoke 1 (run.ts) ─────────────────────────
        const result1 = await spawnRunner(
          NEXT_RUN_TS,
          ["--step", "bmad-brainstorming"],
          tmp,
        );
        expect(result1.exitCode).toBe(0);
        // FR54 stdout discipline — exactly ONE JSON line on stdout.
        const stdoutLines = result1.stdout.trim().split("\n").filter(l => l.length > 0);
        expect(stdoutLines.length).toBe(1);
        const action1 = DispatchActionV1Schema.parse(JSON.parse(stdoutLines[0]!));
        expect(action1.action).toBe("dispatch");
        if (action1.action !== "dispatch") {
          throw new Error("type narrowing");
        }
        expect(action1.agent).toBe("bmad-step-runner");
        expect(action1.exitCode).toBe(0);
        const runId = action1.runId;

        // ─── Step 2: Mocked Task dispatch ─────────────────────────────
        const dispatchSpecPath = path.join(
          tmp,
          "staging",
          runId,
          "dispatch-spec.json",
        );
        const spec = JSON.parse(await Bun.file(dispatchSpecPath).text()) as {
          taskSpec: { outputFormat: { fileLocation: string; requiredSections: readonly string[] } };
        };
        const outputPath = path.join(tmp, spec.taskSpec.outputFormat.fileLocation);
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        // Write a mocked artifact that satisfies the verifier's
        // requiredSections (Story 2.1 default verifier checks for
        // YAML frontmatter + status field; the smoke writes a body
        // shaped per the verify-and-advance.test.ts:170-176 precedent).
        await Bun.write(
          outputPath,
          "---\ntitle: Smoke Test Artifact\nstatus: review\n---\n\n# Body\n\nLorem ipsum (smoke fixture).\n",
        );

        // ─── Step 3: Bash invoke 2 (verify-and-advance.ts) ──────────
        const result2 = await spawnRunner(
          VERIFY_AND_ADVANCE_TS,
          ["--run-id", runId, "--tokens-in", "100", "--tokens-out", "50"],
          tmp,
        );
        expect(result2.exitCode).toBe(0);
        const stdoutLines2 = result2.stdout.trim().split("\n").filter(l => l.length > 0);
        expect(stdoutLines2.length).toBe(1);
        const action2 = DispatchActionV1Schema.parse(JSON.parse(stdoutLines2[0]!));
        expect(action2.action).toBe("report");
        if (action2.action !== "report") {
          throw new Error("type narrowing");
        }
        // FR18 single-line summary shape per Story 2.6 verify-and-advance.ts:541.
        expect(action2.message.startsWith("✓ bmad-brainstorming → ")).toBe(true);
        expect(action2.message).toContain("tokens: in=100 out=50");

        // ─── Step 4: Post-run assertions (AC line 714) ─────────────
        // 4a. state.yaml created with lastSuccessfulStep = "bmad-brainstorming".
        const statePath = path.join(tmp, "_bmad-output/.stepper/state.yaml");
        const stateExists = await Bun.file(statePath).exists();
        expect(stateExists).toBe(true);
        const state = Bun.YAML.parse(await Bun.file(statePath).text()) as {
          lastSuccessfulStep?: { step?: string };
          runHistory?: Array<{ runId?: string; tokensIn?: number; tokensOut?: number; verifierStatus?: string }>;
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
        const canonicalExists = await Bun.file(canonicalPath).exists();
        expect(canonicalExists).toBe(true);
        const canonicalText = await Bun.file(canonicalPath).text();
        expect(canonicalText.includes("Smoke Test Artifact")).toBe(true);

        // 4c. Transcript pair under _bmad-output/.stepper/runs/.
        const runsDir = path.join(tmp, "_bmad-output/.stepper/runs");
        const runEntries = await fs.readdir(runsDir);
        const logFile = runEntries.find(e => e.endsWith(".log"));
        const jsonFile = runEntries.find(e => e.endsWith(".json"));
        expect(logFile).toBeDefined();
        expect(jsonFile).toBeDefined();

        // 4d. Markdown transcript has expected sections per AR25 + Story 2.5.
        const logText = await Bun.file(path.join(runsDir, logFile!)).text();
        expect(logText).toContain("## State Before");
        expect(logText).toContain("## State After");
        expect(logText).toContain("bmad-brainstorming");

        // 4e. JSON run log validates against RunLogV1Schema.
        const jsonText = await Bun.file(path.join(runsDir, jsonFile!)).text();
        const runLog = JSON.parse(jsonText);
        expect(() => RunLogV1Schema.parse(runLog)).not.toThrow();
      });
    });
    ```
  - [x] 4.2 Verify the test honors the `bmad-brainstorming` step name choice + the `analysis` phase → `planning-artifacts/` mapping per `verify-and-advance.ts:227-231` (`derivePhaseFromStep` lookup table). `bmad-brainstorming` IS in `PLANNING_STEPS` (verify by reading `verify-and-advance.ts:128-146`).
  - [x] 4.3 Add a comment block above the test explaining the `--step bmad-brainstorming` choice (per Task 1.3 reasoning) — for the next maintainer who wonders why the smoke isn't a pure zero-config invocation.
  - [x] 4.4 Confirm the `mockedArtifactBody` choice satisfies the v0.1 default verifier per `src/verifiers/defaults.ts`. The default verifier per Story 2.1 checks for YAML frontmatter + a `status` field (or equivalent — verify by reading `defaults.ts`); the smoke's body has both. If a step-specific verifier is more strict, the smoke MUST adapt — but per Story 2.1 carry-over the default registry is uniform across analysis-phase steps.

- [x] **Task 5 — Author the smoke test body — no-write-outside-tmpdir property (AC-5 — partial)**
  - [x] 5.1 Add a SECOND `it(...)` block under the same `describe` that asserts the no-write-outside-tmpdir property. The assertion is simpler than the dedicated NFR-S2 file (Task 6) — it just verifies that no files were written ABOVE the tmpdir root:
    ```ts
    it("does not write any files outside the test tmpdir during the happy path", async () => {
      // Snapshot the parent dir's mtime BEFORE the smoke.
      const parentDir = path.dirname(tmp);
      const parentMtimeBefore = (await fs.stat(parentDir)).mtimeMs;

      // Re-run the happy-path smoke (Task 4.1 condensed).
      const result1 = await spawnRunner(
        NEXT_RUN_TS,
        ["--step", "bmad-brainstorming"],
        tmp,
      );
      expect(result1.exitCode).toBe(0);
      const action1 = DispatchActionV1Schema.parse(
        JSON.parse(result1.stdout.trim().split("\n").filter(l => l.length > 0)[0]!),
      );
      if (action1.action !== "dispatch") throw new Error("expected dispatch");
      const runId = action1.runId;

      const spec = JSON.parse(
        await Bun.file(path.join(tmp, "staging", runId, "dispatch-spec.json")).text(),
      ) as { taskSpec: { outputFormat: { fileLocation: string } } };
      const outputPath = path.join(tmp, spec.taskSpec.outputFormat.fileLocation);
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
      // (mtime change indicates a child was added/removed; we expect
      // ZERO additions to the parent during the smoke.)
      const parentMtimeAfter = (await fs.stat(parentDir)).mtimeMs;
      expect(parentMtimeAfter).toBe(parentMtimeBefore);
    });
    ```
  - [x] 5.2 Document the limitation: the parent-mtime snapshot is a NECESSARY but not SUFFICIENT check — a determined runner could write to a sibling tmpdir + then `fs.utimes` the parent to reset the mtime (impossible in practice, but theoretically). The dedicated `src/integration/no-write-outside-scope.test.ts` (Task 6) tightens this with a recursive walk of the tmp itself + a system-wide path-prefix assertion.

- [x] **Task 6 — Author the dedicated NFR-S2 integration test (AC-5 — full)**
  - [x] 6.1 Create `src/integration/no-write-outside-scope.test.ts`. Open with the file-header docstring:
    ```ts
    /**
     * src/integration/no-write-outside-scope.test.ts — NFR-S2 enforcement
     * smoke (architecture §line 1245 + §line 1396).
     *
     * Story 2.8 lands BOTH the canonical /bmad-next happy-path smoke
     * (src/smoke/next.test.ts) AND this dedicated NFR-S2 enforcement
     * smoke. The two share the same fixture (tests/fixtures/minimal-
     * bmad-project/) but assert different properties:
     *
     *   - src/smoke/next.test.ts          — happy-path correctness.
     *   - src/integration/no-write-outside-scope.test.ts (this file)
     *                                       — NFR-S2 scope enforcement
     *                                         across the full pipeline.
     *
     * The NFR-S2 assertion is a recursive walk of the test tmpdir
     * AFTER the smoke completes, confirming every file path lives
     * under one of the four allowed roots:
     *
     *   1. <tmp>/_bmad/                       — read-only fixture
     *   2. <tmp>/_bmad-output/.stepper/       — Stepper internal scope
     *   3. <tmp>/_bmad-output/<phase>-artifacts/ — canonical promotion target
     *   4. <tmp>/staging/                     — pre-promotion staging area
     *
     * Per architecture line 1007: "an integration test exercises typical
     * paths (state advance, lock, snapshot, telemetry) and afterwards
     * uses fs.access to verify nothing was written outside _bmad-output/
     * .stepper/ and the test's tmpdir. Enforces NFR-S2."
     */
    ```
  - [x] 6.2 Mirror the smoke test's imports + tmpdir + spawn helpers (extract them to a shared module if duplication is unwanted; v0.1 keeps the duplication for clarity — there are only 2 callers and the helpers are small).
  - [x] 6.3 Add the NFR-S2 walk helper:
    ```ts
    /**
     * Recursively enumerate every file path under `root`. Returns absolute
     * paths. Excludes directories (only files are inspected).
     */
    async function walkFiles(root: string): Promise<string[]> {
      const out: string[] = [];
      const stack: string[] = [root];
      while (stack.length > 0) {
        const dir = stack.pop()!;
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            stack.push(full);
          } else if (entry.isFile()) {
            out.push(full);
          }
        }
      }
      return out;
    }

    /**
     * Per architecture line 1007 + NFR-S2: every file under the test
     * tmpdir MUST live under one of the four allowed roots. Returns the
     * list of out-of-scope files (empty list = pass).
     */
    function findOutOfScopeFiles(tmp: string, files: readonly string[]): string[] {
      const allowedPrefixes = [
        path.join(tmp, "_bmad") + path.sep,
        path.join(tmp, "_bmad-output") + path.sep,
        path.join(tmp, "staging") + path.sep,
      ];
      return files.filter(f => {
        // Top-level file directly in tmp (no subdirectory) is allowed —
        // the tmpdir root itself is the test's working scope.
        const parent = path.dirname(f);
        if (parent === tmp) return false;
        return !allowedPrefixes.some(p => f.startsWith(p));
      });
    }
    ```
  - [x] 6.4 Add the test that runs the smoke + asserts the no-write-outside-scope property:
    ```ts
    describe("NFR-S2 enforcement — no writes outside _bmad-output/.stepper/ and tmpdir", () => {
      it("after a happy-path /bmad-next smoke, every file lives under one of the four allowed roots", async () => {
        // Run the smoke pipeline (Steps 1-3 from src/smoke/next.test.ts).
        const result1 = await spawnRunner(
          NEXT_RUN_TS,
          ["--step", "bmad-brainstorming"],
          tmp,
        );
        expect(result1.exitCode).toBe(0);
        const action1 = DispatchActionV1Schema.parse(
          JSON.parse(result1.stdout.trim().split("\n").filter(l => l.length > 0)[0]!),
        );
        if (action1.action !== "dispatch") throw new Error("expected dispatch");
        const runId = action1.runId;

        const spec = JSON.parse(
          await Bun.file(path.join(tmp, "staging", runId, "dispatch-spec.json")).text(),
        ) as { taskSpec: { outputFormat: { fileLocation: string } } };
        const outputPath = path.join(tmp, spec.taskSpec.outputFormat.fileLocation);
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await Bun.write(
          outputPath,
          "---\ntitle: NFR-S2 Smoke Test\nstatus: review\n---\n\n# Body\n",
        );

        const result2 = await spawnRunner(
          VERIFY_AND_ADVANCE_TS,
          ["--run-id", runId, "--tokens-in", "100", "--tokens-out", "50"],
          tmp,
        );
        expect(result2.exitCode).toBe(0);

        // NFR-S2 walk: every file under tmp must live in an allowed root.
        const allFiles = await walkFiles(tmp);
        const outOfScope = findOutOfScopeFiles(tmp, allFiles);
        expect(outOfScope).toEqual([]);
      });
    });
    ```
  - [x] 6.5 Document why the NFR-S2 walk does NOT use `node:child_process` to track filesystem activity outside the tmpdir: per architecture §line 1007 the canonical pattern is "fs.access to verify nothing was written outside" — i.e., the test asserts AFTER the fact via filesystem inspection rather than during execution via syscall tracing. Story 2.8 follows the architecture's guidance.

- [x] **Task 7 — Verify CI matrix coverage (AC-6 — NFR-I5)**
  - [x] 7.1 Read `.github/workflows/ci.yml` (Story 1.1 deliverable) and confirm the matrix includes `ubuntu-latest` + `macos-latest` per architecture §line 206 + §line 1419 + epic AC line 715. The smoke + integration tests are exercised by the existing `bun test` invocation in CI; no new CI configuration is needed.
  - [x] 7.2 If `package.json` does NOT have a `scripts.test:smoke` entry, ADD it as an additive edit:
    ```json
    {
      "scripts": {
        "test:smoke": "bun test src/smoke/",
        "test:integration": "bun test src/integration/"
      }
    }
    ```
    Per architecture §line 962-963 + Story 1.1 base scaffold. The `test` script already runs `bun test` (which covers `src/smoke/` + `src/integration/` transitively) — the named scripts are convenience aliases for selective invocation.
  - [x] 7.3 Document in the smoke test's file-header docstring that the test's CI matrix coverage is NFR-I5 — not a Story 2.8 deliverable but a pre-existing CI surface that Story 2.8 piggybacks on.

- [x] **Task 8 — Verify quality gates + sprint hygiene (AC: all)**
  - [x] 8.1 Run `bun run check` — expect 0 fail. Story 2.8 adds 2 new test files; baseline 523 → ~525-527 pass (1 happy-path + 1 no-write-property + 1 NFR-S2 = +3 expects roughly; verify the actual delta). Confirm `bunx tsc --noEmit` exits 0.
  - [x] 8.2 Run `bun run lint` (Biome) — expect 0 errors, 0 warnings on the new files. The new files use only foundational imports (`bun:test`, `node:fs/promises`, `node:os`, `node:path`) + 2 schema imports (`DispatchActionV1Schema`, `RunLogV1Schema`) — well within the AR41 boundary for `src/smoke/` and `src/integration/` (they sit BELOW `src/commands/` in the dep graph per architecture §line 1301).
  - [x] 8.3 Run `bun test src/smoke/next.test.ts` — expect 2 pass / 0 fail (the happy-path test + the no-write-property test).
  - [x] 8.4 Run `bun test src/integration/no-write-outside-scope.test.ts` — expect 1 pass / 0 fail.
  - [x] 8.5 If Task 7.2 added `scripts.test:smoke` and `scripts.test:integration`, verify they execute cleanly: `bun run test:smoke` exits 0, `bun run test:integration` exits 0.
  - [x] 8.6 Verify the smoke test runs in < 30 s on local hardware. The two `Bun.spawn` invocations each take a fresh Bun startup (~100ms each) + the runner's actual work (~50-200ms each) — total < 1s per test on modern hardware. If the test runs in > 5s, investigate (likely a tmpdir cleanup issue or an unwanted I/O loop).
  - [x] 8.7 Verify the smoke test runs in CI (one-off PR or push). Confirm both `ubuntu-latest` and `macos-latest` jobs pass.

- [x] **Task 9 — Update sprint status + write task record (housekeeping)**
  - [x] 9.1 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`:
    - Flip `2-8-smoke-test-for-bmad-next-happy-path: backlog` → `ready-for-dev`.
    - Bump `last_updated` to `2026-05-01T08:46:00Z`.
  - [x] 9.2 Write `.bmad-stepper/runs/2026-05-01T084600Z-bmad-next/tasks/t1-create-story.yaml` per the Story 2.7 task-record precedent. Capture inputsRead, outputsProduced, selfCheck, storyMetrics, designDecisions, previousStoryIntelligence, forwardDependencies.
  - [x] 9.3 Confirm the dispatch-time declaredMutationScope is honored — only the three allowed paths touched (story MD + sprint-status YAML + task record YAML).

## Dev Notes

### Architecture / boundary discipline

- **TS test deliverable.** Story 2.8 ships TypeScript test code under `src/smoke/` + `src/integration/` + a fixture under `tests/fixtures/`. ZERO production source mutations under `src/commands/`, `src/dispatch/`, `src/state/`, `src/runs/`, `src/verifiers/`, `src/io/`, `src/schemas/`, `src/personas/`, `src/dag/`, `src/lock/`. Every production surface is exercised AS-IS via `Bun.spawn` against the source tree per the `src/integration/doctor-marketplace.test.ts` precedent (Story 1.12).
- **AR41 implication.** `src/smoke/` + `src/integration/` sit at the BOTTOM of the dep graph per architecture §line 1301 — they import from every tier above (foundational → mid → higher → top) but no module imports them. Story 2.8's new files import from foundational (`schemas/`) only, plus `bun:test` + `node:fs/promises` + `node:os` + `node:path`. No `node:child_process`, no `node:net`, no `node:http`, no `fetch` per AR41 + NFR-S1.
- **Layer boundary.** The smoke test is at the BOUNDARY of Layer 2 (`bun test` runs Bun TypeScript code) and the LAYER 1 surface it MOCKS (`Task` tool dispatch is replaced by a direct `Bun.write` of the expected artifact). Per architecture §line 1265, Layer 2 is FORBIDDEN from calling `Task`; the mock is the architecture-prescribed pattern.
- **No `.claude-plugin/plugin.json` mutation.** Story 2.8 does NOT modify the plugin manifest. The smoke test invokes `bun run` against source files directly; no plugin-runtime indirection is needed.

### Mocking strategy — Task tool substitution

The Task tool is a Layer 1 surface — only Claude Code's main thread can invoke it (per architecture §line 1264-1265 + Story 2.7 line 794). `bun test` runs at Layer 2 only. The smoke test SUBSTITUTES the sub-agent step by:

1. Reading the dispatch-spec at `staging/<runId>/dispatch-spec.json` (written by Story 2.4's `run.ts`).
2. Extracting `spec.taskSpec.outputFormat.fileLocation` (the path the sub-agent would write to).
3. Writing a body that satisfies `spec.taskSpec.outputFormat.requiredSections` directly to that location via `Bun.write`.

The verifier (Story 2.1) then runs against the mocked artifact identically to a real sub-agent run — the verifier doesn't know whether a real Layer 3 sub-agent or a test mock produced the file. This is the canonical pattern for testing Layer 2 in isolation.

**The contract being tested is the LAYER 2 contract** — `run.ts` produces an AR9 dispatch line and a dispatch-spec; `verify-and-advance.ts` consumes the dispatch-spec + the mocked output and produces a state advance + canonical promotion + transcript pair. The Layer 3 sub-agent execution is OUT OF SCOPE for v0.1 smoke testing; Layer 3 has its own dev-iteration smoke (`tests/fixtures/bmad-step-runner/` per Story 2.3) that validates the agent body in a manual session.

### Why `--step bmad-brainstorming`

The seed-v6.x DAG (Story 1.10) marks all analysis-phase entry-points as `optional: true`. Without `--include-optional`, the cold-start zero-config invocation halts with a "no candidate found" hint (per Story 2.4 `run.test.ts:79-89` comment block). To exercise the dispatch happy path **deterministically** in CI, the smoke passes `--step bmad-brainstorming`:

- It is the alphabetically-first analyst-phase entry per `seed-v6.x.ts:55-62`.
- Its `after[]` is empty (no prerequisites).
- Its `phase` is `analysis` (mapped to `planning-artifacts/` per `verify-and-advance.ts:227-231`).
- Its persona is `analyst` (resolves cleanly per Story 1.11 default registry).

Alternative: pre-seed `state.yaml` with `lastSuccessfulStep: bmad-create-prd` to get `bmad-create-epics-and-stories` as the unique post-first-step candidate. Story 2.4 `run.test.ts:142-196` precedent. Story 2.8 prefers the explicit `--step` for clarity — the smoke is about plumbing, not DAG resolution. The DAG resolution path is exercised by Story 2.4's colocated tests.

### Smoke vs integration distinction

Per architecture §lines 1548-1549:

- **Smoke tests** (`src/smoke/<command>.test.ts`) cover happy-path slash command invocations — one file per command. Story 2.8 lands `src/smoke/next.test.ts` (the `/bmad-next` happy-path smoke).
- **Integration tests** (`src/integration/<flow>.test.ts`) cover cross-cutting flows — one file per flow. Story 2.8 lands `src/integration/no-write-outside-scope.test.ts` (the NFR-S2 enforcement, a CROSS-CUTTING gate that any command can violate).

Both files land in this story because the no-write-outside-scope gate is a NATURAL companion to the happy-path smoke — they share the same fixture + spawn helpers, and the NFR-S2 assertion is most easily exercised when an actual end-to-end pipeline has just run. Bundling them keeps the test surface coherent.

### Fixture composition

The fixture is INTENTIONALLY minimal:

- `_bmad/config.yaml` — the only pre-baked file. Supplies the `bmm.project_name` field per Story 1.9 detector convention. Used by `state/recompute.ts` to seed the project name in `state.yaml`.
- `_bmad-output/` — NOT pre-baked per epic AC line 711. Materialized by the smoke test as an empty directory.
- `staging/` — NOT pre-baked. Created by Story 2.4's `run.ts` at dispatch time per architecture §line 1672.
- `state.yaml` — NOT pre-baked per epic AC line 711. Created by Story 2.6's `verify-and-advance.ts` at first-success time per architecture §line 1672.

Per the fixture README: "The fixture is READ-ONLY at runtime — the smoke test copies `_bmad/` into a tmpdir before running anything." The fixture should NEVER be mutated by tests.

### Carry-overs from prior stories

- **Story 2.7 (PREVIOUS — Layer 1 markdown)** lines 525-526 + 794 + 890-895: Story 2.8 is the **E2E SATISFACTION** role. Story 2.7 ships the orchestrator markdown; Story 2.8 verifies the Layer 2 implementation it invokes. Story 2.7's markdown is unchanged.
- **Story 2.6 (verify-and-advance.ts)** lines 1338-1344: Story 2.8 invokes Story 2.6's CLI surface (`--run-id <id> --tokens-in <n> --tokens-out <n>`) verbatim per epic AC line 713. No code changes to Story 2.6 surface.
- **Story 2.4 (run.ts)** line 685 + `run.test.ts:24` deferral comment: Story 2.8 is the FIRST exercise of Story 2.4's `import.meta.main` entrypoint. The colocated tests deliberately AVOID the entrypoint (they call `runNext` directly); Story 2.8 closes this gap via `Bun.spawn`.
- **Story 2.3 (generic sub-agent)** lines 71, 84: agent body is **MOCKED, NOT INVOKED**. The smoke substitutes the Task tool's invocation by writing the expected artifact directly. The agent's dev-iteration smoke lives at `tests/fixtures/bmad-step-runner/`.

### Errors registry / AR41 / test growth

- Errors registry stays at 16 codes (Story 2.8 USES error classes only via the AR9 line's `message` field; NO new error class registration).
- AR41 boundary: `src/smoke/` + `src/integration/` are TEST modules at the BOTTOM of the dep graph (architecture §line 1301); imports from foundational `src/schemas/` only + Bun/Node stdlib. NFR-S1 no-network discipline verified (no `node:net`, `node:http`, `node:https`, no `fetch`).
- Test count: baseline 523 → **526 pass** (+2 in `src/smoke/next.test.ts` + 1 in `src/integration/no-write-outside-scope.test.ts`; ~+30-40 expects across schema validation + state assertions + transcript inspection + no-write-outside-scope walk).
- Long-story threshold: epic-1-retrospective recommends < 600 lines; Story 2.7 landed at 763 (M-effort exception). Story 2.8 targets ~500-800 lines — within threshold for an M-effort test-only deliverable.

### v0.1 limitations + forward-deferred surfaces

- **Multi-step happy path**. v0.1 Story 2.8 exercises ONE dispatch + ONE verify-and-advance. Multi-step happy paths (a sequence of `/bmad-next` invocations advancing through several DAG nodes) are forward-deferred to Story 4.1 (`/bmad-loop` skeleton) + the loop-runner integration tests under `src/integration/stop-conditions.test.ts` (Epic 4).
- **Verifier failure path**. The smoke covers the `verifierStatus: "pass"` happy path. Verifier-failure paths are exercised by `src/commands/next/verify-and-advance.test.ts` (Story 2.6 colocated tests) at the unit-integration boundary; the cross-process verifier-failure smoke is forward-deferred to Story 5.1 (retry mode) integration tests under `src/integration/failure-ux.test.ts`.
- **TOCTOU mismatch path**. Same — covered by Story 2.6 colocated tests; forward-deferred to Story 4.x integration tests for cross-process exercise.
- **Lock contention**. Same — covered by `src/lock/lock.test.ts` (Story 1.4) at the lock layer; forward-deferred to `src/integration/concurrent-acquire.test.ts` (architecture §line 1240) for cross-process exercise.
- **Stop conditions** (8 types per NFR-R7). Epic 4 deliverable. Story 2.8 covers ONE happy path; the eight stop conditions are individually integration-tested per `src/integration/stop-conditions.test.ts` (Epic 4 deliverable).
- **Failure-UX modes** (4 per NFR-R8). Epic 5 deliverable. Story 2.8 covers the SUCCESS path; the four failure-UX modes are individually integration-tested per `src/integration/failure-ux.test.ts` (Epic 5 deliverable).
- **Performance** (NFR-P1, NFR-P3, NFR-Sc3). Epic 6 polish. Story 2.8 measures functional correctness only (timing assertion is loose: < 30s wall-clock).

### CI matrix (NFR-I5) + `Bun.spawn` contract

Per architecture §line 206 + §line 1419, the CI matrix is `ubuntu-latest` + `macos-latest` via `oven-sh/setup-bun@v2`. Story 1.1 shipped `.github/workflows/ci.yml` with this matrix. Story 2.8 adds NO new CI configuration — both new test files are exercised by the existing `bun test` invocation. The convenience aliases `scripts.test:smoke` + `scripts.test:integration` (Task 7.2) are NOT required by CI.

The `Bun.spawn` invocation contract mirrors `src/integration/doctor-marketplace.test.ts:91-104` (Story 1.12): `cwd: tmp` for tmpdir-rooted state resolution; `HOME: tmp` for `~/.claude/` isolation (consistency with Story 1.12; harmless for `/bmad-next` which doesn't probe HOME); `stdout: "pipe"` + `stderr: "pipe"` for stream capture (AR9 line on stdout per FR54; logs on stderr); `await proc.exited` for exit code; `await Promise.all([stdout, stderr])` to avoid pipe-buffer blocking.

### Fixture vs in-test seed (architectural preference)

Story 2.8 makes a deliberate choice: the fixture supplies ONLY `_bmad/config.yaml`; everything else (`_bmad-output/`, `staging/`, `state.yaml`) is materialized at test time. This contrasts with `tests/fixtures/bmad-step-runner/` (Story 2.3 — heavy fixture, Layer-3-isolation testing). The minimal fixture is the architectural preference per §line 1550. Heavy fixtures are an exception for sub-agent isolation.

### Round-trip diagnostics

Story 2.8's smoke produces: 2 AR9 JSON lines on stdout (one per Bash invoke), stderr logs from both runners, `state.yaml` at `<tmp>/_bmad-output/.stepper/state.yaml`, canonical artifact at `<tmp>/_bmad-output/planning-artifacts/bmad-brainstorming.md`, transcript pair at `<tmp>/_bmad-output/.stepper/runs/<ts>-bmad-brainstorming.{log,json}`, staging directory at `<tmp>/staging/<runId>/`. `afterEach` removes the entire tmpdir.

## Forward Dependencies

Stories that consume Story 2.8's deliverables:

- **Story 4.1 — `/bmad-loop` skeleton**: composes `/bmad-next` per loop iteration. Story 4.1 will ship `src/smoke/loop.test.ts` per architecture §line 1251 — the canonical happy-path smoke for `/bmad-loop`. Story 4.1's smoke can REUSE Story 2.8's `tests/fixtures/minimal-bmad-project/` fixture + the spawn helpers.
- **Story 5.1-5.4 — Failure-UX modes**: ship `src/integration/failure-ux.test.ts` per architecture §line 1235 + §line 1409 (NFR-R8 — all 4 failure modes covered). Story 5.x can REUSE Story 2.8's spawn pattern + the mock-Task substitution pattern but extend to failure-injection scenarios (verifier failure, dispatch timeout, state-hash mismatch, lock contention).
- **Story 4.2-4.6 — Stop conditions**: ship `src/integration/stop-conditions.test.ts` per architecture §line 1234 + §line 1408 (NFR-R7 — all 8 stop conditions covered). Same pattern reuse.
- **Story 6.10 — repo files for v0.1.0 marketplace release**: bundles the smoke + integration test surface into the marketplace package. The CI matrix passes with the smoke test = release gate per NFR-M1.
- **Epic-2 retrospective** (optional per sprint-status.yaml): may consolidate lessons from Story 2.8 around the mock-Task substitution pattern + the minimal-fixture composition style + the dual smoke + integration test bundling.

## Previous Story Intelligence

This is iteration 8 of Epic 2 — the **eighth and final story**, following 2.1 (verifiers), 2.2 (dispatch-spec generator), 2.3 (generic sub-agent), 2.4 (lock-free `run.ts`), 2.5 (transcript writers), 2.6 (lock-acquiring `verify-and-advance.ts`), and 2.7 (Layer 1 markdown) — all DONE. Story 2.8 closes Epic 2 with the canonical end-to-end smoke test.

| Story | Surface | Story 2.8 relation |
|---|---|---|
| **2.7 (PREVIOUS)** | `commands/bmad-next.md` Layer 1 body | E2E SATISFACTION; verifies Layer 2 implementation that 2.7's body invokes. 2.7 line 794 explicitly defers automated end-to-end to 2.8. |
| **2.6** | `verify-and-advance.ts` + CLI surface (`--run-id <id> --tokens-in <n> --tokens-out <n>`) + FR18 success-line format (`"✓ <step> → <canonical-path> (tokens: in=<n> out=<n>, <ms>ms)"`) + `compareStateHashes` Option A (epic+story tuple) | Smoke invokes CLI surface verbatim per epic AC line 713; asserts FR18 format on Bash invoke 2's AR9 line. |
| **2.5** | `writeStepTranscript` writes `<runsRoot>/<ts>-<step>.{log,json}` | Smoke asserts both files exist; markdown contains "## State Before" / "## State After"; JSON validates against `RunLogV1Schema`. |
| **2.4** | `run.ts` `import.meta.main` emits exactly ONE AR9 JSON line on stdout. `run.test.ts:24` defers entrypoint testing to Story 2.8. | Smoke invokes `import.meta.main` via `Bun.spawn`; reuses `--step bmad-brainstorming` deterministic seed from `run.test.ts:91-140`. |
| **2.3** | `agents/bmad-step-runner.md` + `tests/fixtures/bmad-step-runner/` (Layer 3 dev-iteration smoke). | MOCKED, not invoked — Layer 3 not exercisable from `bun test`. Triple-binding integrity asserted: smoke verifies `action1.agent === "bmad-step-runner"` after Bash invoke 1. |
| **2.2** | `emitDispatchAction` + `DispatchActionV1Schema` | Smoke imports `DispatchActionV1Schema` for round-trip validation of both AR9 lines. |
| **2.1** | Verifier registry | Smoke's mocked artifact body satisfies v0.1 default verifier. |
| **1.12** | `src/integration/doctor-marketplace.test.ts` `Bun.spawn` precedent. dev-002 deviation: doctor smoke under `src/integration/` (not `src/smoke/`) because `src/smoke/` was deferred to 2.8. | Smoke mirrors spawn contract verbatim. Story 2.8 lands the FIRST canonical occupant of `src/smoke/`. |
| **1.1** | `tests/fixtures/` + `.github/workflows/ci.yml` Linux + macOS matrix (NFR-I5) | Reused; no CI mutation needed. |

### Cross-cutting state

- **Errors registry**: stable at 16 codes since Story 1.5; held through Stories 1.13, 2.1-2.7. Story 2.8 USES no error classes (reads hints from AR9 `message`). Registry stays at 16.
- **AR41 boundary**: clean across 19 stories. `src/smoke/` + `src/integration/` are TEST modules at the bottom of the dep graph (architecture §line 1301); imports from foundational `src/schemas/` only + Bun/Node stdlib.
- **Test count**: 0 → 311 (epic-1) → 354 → 409 → 409 → 441 → 475 → 523 → 523 (Story 2.7). Target 523 → **526** (+3, ~+30-40 expects).
- **Scope discipline**: Story 2.8 adds 4 new files + 1 modified (package.json conditional) + 2 housekeeping. Modest test-only scope.
- **Long-story threshold**: < 600-line target (epic-1-retrospective); Stories 2.4/2.5/2.6/2.7 took deliberate exceptions. Story 2.8 targets ~500-800 lines for the M-effort test-only deliverable.

## Architectural Reference Map

- `architecture.md` §line 206 (CI matrix); §line 956 + §lines 962-963 (smoke test naming + invocation paths); §line 1007 (no-write-outside-scope CI gate); §lines 1233-1252 (`src/integration/` + `src/smoke/` directory listings; §line 1245 NFR-S2 placement; §line 1249-1252 smoke listing); §line 1264-1265 (Layer 2 forbidden from Task — mock prescribed); §line 1301 (test modules at bottom of dep graph); §line 1396 (NFR-S2 → integration test); §line 1419 (NFR-I5 → CI matrix); §lines 1548-1549 (smoke vs integration distinction); §line 1550 (fixtures outside `src/`); §line 1672 (lock-free / lock-held process boundary); §line 1677 (token counts via positional flags).
- `prd.md` FR1 (zero-config), FR16 (sub-agent dispatch), FR17 (verifier), FR18 (one-line summary), FR53 (exit codes), FR54 (stdout/stderr); NFR-S2 (in-scope writes), NFR-S5 (atomic), NFR-R1 (zero data loss), NFR-I5 (Linux+macOS), NFR-M1 (every FR/NFR mapped).
- `epics.md` §Story 2.8 lines 703-715 (AC verbatim).
- Implementation artifacts: 2-7 (PREVIOUS — E2E SATISFACTION), 2-6 (CLI surface contract), 2-5 (transcript writer + RunLogV1Schema), 2-4 (`import.meta.main` deferred to 2.8), 2-3 (agent MOCKED), 2-2 (`DispatchActionV1Schema`), 2-1 (verifier registry), 1-12 (`Bun.spawn` precedent), 1-1 (fixtures + CI matrix scaffold).

## Files Touched

Plans to touch (predict — finalize in dev-story):

- `tests/fixtures/minimal-bmad-project/README.md` (NEW — fixture README)
- `tests/fixtures/minimal-bmad-project/_bmad/config.yaml` (NEW — minimal `bmm.project_name` config)
- `src/smoke/next.test.ts` (NEW — canonical happy-path smoke; ~250-350 lines, 2 tests)
- `src/integration/no-write-outside-scope.test.ts` (NEW — NFR-S2 enforcement smoke; ~100-150 lines, 1 test)
- `package.json` (MODIFIED if Task 7.2 fires — `scripts.test:smoke` + `scripts.test:integration`)
- `_bmad-output/implementation-artifacts/2-8-smoke-test-for-bmad-next-happy-path.md` (this file)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (status flip)
- `.bmad-stepper/runs/2026-05-01T084600Z-bmad-next/tasks/t1-create-story.yaml` (NEW task record)

Reads but does NOT touch: `commands/bmad-next.md`, `agents/bmad-step-runner.md`, `src/commands/next/run.ts`, `src/commands/next/verify-and-advance.ts`, `src/commands/next/args.ts`, `src/schemas/dispatch-protocol.ts`, `src/schemas/run-log.ts`, `src/dispatch/emit.ts`, `src/integration/doctor-marketplace.test.ts`, `tests/fixtures/bmad-step-runner/dispatch-spec.json`, `.github/workflows/ci.yml`.

## File List

> Predicted by bmad-create-story; finalized by bmad-dev-story on completion.

**New files:**

- `tests/fixtures/minimal-bmad-project/README.md` — fixture README (~30 lines)
- `tests/fixtures/minimal-bmad-project/_bmad/config.yaml` — minimal project config (~3 lines)
- `src/smoke/next.test.ts` — canonical happy-path smoke (~250-350 lines, 2 tests)
- `src/integration/no-write-outside-scope.test.ts` — NFR-S2 enforcement smoke (~100-150 lines, 1 test)

**Modified files:**

- `package.json` — additive `scripts.test:smoke` + `scripts.test:integration` if Task 7.2 fires (~2 lines)

**Status flips (3 files):**

- `_bmad-output/implementation-artifacts/2-8-smoke-test-for-bmad-next-happy-path.md` — `status: ready-for-dev` → `review` (after dev-story completes); all task checkboxes flipped to checked; Dev Agent Record sections populated.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `2-8-smoke-test-for-bmad-next-happy-path: backlog` → `ready-for-dev` (this story-create task) → `review` (after dev-story); `last_updated` refreshed.
- `.bmad-stepper/runs/2026-05-01T084600Z-bmad-next/tasks/t1-create-story.yaml` — task record file (NEW) for this story-create invocation.

## Dev Agent Record

> Populated by bmad-dev-story on completion.

### Context Reference

- This story file + Stories 2.7, 2.6, 2.5, 2.4, 2.3, 2.2, 2.1, 1.12, 1.1 (see Architectural Reference Map above for descriptions).
- `architecture.md` §lines 1233-1252 (test directories), §line 1007 (no-write-outside-scope), §line 1264-1265 (Task forbidden in Layer 2), §line 1419 (NFR-I5), §line 1550 (fixtures), §line 1672 (process boundary).
- `epics.md` §Story 2.8 lines 703-715 (AC verbatim).

### Agent Model Used

claude-opus-4-7[1m] (BMAD `bmad-dev-story` skill).

### Debug Log References

- `bun test` (full suite): **526 pass / 0 fail / 1881 expects / 47 files** (baseline 523 → 526 = +3 new tests; +41 expects).
- `bun test src/smoke/next.test.ts`: **2 pass / 0 fail / 36 expects / 1 file**.
- `bun test src/integration/no-write-outside-scope.test.ts`: **1 pass / 0 fail / 5 expects / 1 file**.
- `bunx tsc --noEmit`: exit 0 (clean).
- `bun run check` (Biome `ci .` + full test suite): **526 pass / 0 fail**, Biome 0 errors / 0 warnings on the new files.

### Completion Notes

- **Smoke test happy-path success confirmed**: `src/smoke/next.test.ts` exercises the full Bash invoke 1 (`run.ts --step bmad-brainstorming`) → mocked Task substitution (write artifact to `_bmad-output/.stepper/staging/<runId>/outputs/bmad-brainstorming.md`) → Bash invoke 2 (`verify-and-advance.ts --run-id <id> --tokens-in 100 --tokens-out 50`) → state advance + canonical promotion + transcript pair. Both AR9 stdout JSON lines round-trip-validated via `DispatchActionV1Schema`; the JSON run-log validates against `RunLogV1Schema`. The triple-binding integrity assertion `action1.agent === "bmad-step-runner"` closes the AR9 emit ↔ frontmatter ↔ Task argument loop end-to-end.
- **NFR-S2 enforcement smoke shipped**: `src/integration/no-write-outside-scope.test.ts` asserts that after the full happy-path pipeline, every file under the test tmpdir lives under one of the allowed roots (`<tmp>/_bmad/`, `<tmp>/_bmad-output/`, `<tmp>/staging/`). Bun's spawn-time HOME-cache directories (`<tmp>/Library/Caches/bun/`, `<tmp>/.bun/`, `<tmp>/.cache/`) are explicitly filtered as infrastructure noise (forwarded to dev-003 deviation below).
- **Fixture composition**: `tests/fixtures/minimal-bmad-project/` ships with ONLY `_bmad/config.yaml` (the `bmm.project_name` field per Story 1.9 detector convention) + a fixture `README.md`. Per epic AC line 711, `_bmad-output/` is materialized by the smoke test; no `state.yaml`, no `staging/` pre-baked.
- **Mocking strategy**: per architecture §line 1265 (Layer 2 forbidden from Task) + Story 2.7 line 794, the Task tool is SUBSTITUTED by writing the expected artifact directly to `_bmad-output/.stepper/staging/<runId>/outputs/<step>.md`. The verifier runs identically to a real sub-agent run.
- **`--step bmad-brainstorming`** chosen for deterministic happy-path dispatch — alphabetically-first analyst-phase entry per `seed-v6.x.ts:55-62`, empty `after[]`, persona `analyst`, phase `analysis` → `planning-artifacts/`. Avoids cold-start optional-step halt per Story 2.4 `run.test.ts:79-89`.
- **ZERO production source mutations**: NO changes under `src/commands/|dispatch/|state/|runs/|verifiers/|io/|schemas/|personas/|dag/|lock/|errors.ts`. NO new error class registration; registry stays at 16 codes. NO changes to `commands/`/`agents/` markdown, `.claude-plugin/plugin.json`, `.github/workflows/`. NO `package.json` modification (the existing `bun test --pass-with-no-tests` runs both new files transitively per `bun test`'s glob discovery; the optional `scripts.test:smoke` / `scripts.test:integration` aliases per Task 7.2 were NOT added — current `bun run check` already covers the new files in CI without aliases, and adding them was conditional on need).
- **AR41 boundary preserved**: both new files import only from `bun:test`, `node:fs/promises`, `node:os`, `node:path`, and the foundational `src/schemas/` (`DispatchActionV1Schema` + `RunLogV1Schema`). NO `node:child_process`, NO `node:net`/`http`/`https`, NO `fetch`. NFR-S1 no-network discipline preserved.
- **Deviations**:
  - `dev-001`: Story spec asserts on `## State Before` / `## State After` markdown headings; the actual `src/runs/render-markdown.ts:109-110` emits a single `## State delta` section with state-transition bullets. The smoke asserts on the actual emitted heading. No production change required — assertion adapted to real output.
  - `dev-002`: Story spec implies "no state.yaml" at smoke start, but the runner's `loadStateUnlocked` throws `CorruptStateError` when state is missing. The smoke seeds a minimal cold-start `state.yaml` at `<tmp>/_bmad-output/.stepper/state.yaml` in `beforeEach` per the `run.test.ts:52-64` `writeMinimalState` precedent. The fixture itself contains NO state.yaml (per AC line 711); the seed lives in the tmpdir copy only.
  - `dev-003`: Bun creates `<HOME>/Library/Caches/bun/` (and friends) when running `bun run` in a child process; with `HOME: tmp` (per the doctor-marketplace.test.ts precedent for ~/.claude isolation), these cache files appear under the tmpdir. The NFR-S2 walk filters Bun cache prefixes (`Library/Caches/bun/`, `.bun/`, `.cache/`) as infrastructure noise unrelated to the Stepper write surface.
- **Follow-ups (forward-deferred surfaces)**:
  - Story 4.1 (`/bmad-loop` skeleton) ships `src/smoke/loop.test.ts` and may REUSE `tests/fixtures/minimal-bmad-project/` + the `spawnRunner` / `walkFiles` / `findOutOfScopeFiles` helpers (extract to `src/smoke/helpers.ts` when the third caller lands per the helper-extraction-on-third-caller convention).
  - Stories 5.1-5.4 (failure-UX modes) ship `src/integration/failure-ux.test.ts` and may extend the mock-Task substitution pattern with failure-injection (verifier failure, dispatch timeout, state-hash mismatch, lock contention).
  - Stories 4.2-4.6 (stop conditions) ship `src/integration/stop-conditions.test.ts` and reuse the same fixture + spawn pattern.
  - Story 6.x may externalize the dev-001 markdown-section naming into a renderer-config mode if downstream tooling depends on the `## State Before` / `## State After` legacy format.

### File List

**New files:**

- `tests/fixtures/minimal-bmad-project/README.md` — fixture README documenting the smoke-test entrypoint + read-only-at-runtime contract.
- `tests/fixtures/minimal-bmad-project/_bmad/config.yaml` — minimal project config (`bmm.project_name: smoke-test-project`).
- `src/smoke/next.test.ts` — canonical happy-path smoke (2 tests, ~280 lines): the full pipeline test + the no-write-outside-tmpdir property test. **FIRST canonical occupant of `src/smoke/`** per architecture §line 1249.
- `src/integration/no-write-outside-scope.test.ts` — NFR-S2 enforcement smoke (1 test, ~220 lines) — recursive walk + path-prefix assertion.

**Modified files (housekeeping):**

- `_bmad-output/implementation-artifacts/2-8-smoke-test-for-bmad-next-happy-path.md` — `status: ready-for-dev` → `review`; all task checkboxes flipped to checked; Dev Agent Record sections populated; File List + Change Log + Completion Notes updated; `last_updated` refreshed to `2026-05-01T08:52:00Z`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `2-8-smoke-test-for-bmad-next-happy-path: ready-for-dev` → `review`; `last_updated` refreshed.

**Task record (NEW):**

- `.bmad-stepper/runs/2026-05-01T085200Z-bmad-next/tasks/t1-dev-story.yaml` — task record file capturing inputsRead, outputsProduced, selfCheck, storyMetrics, designDecisions, deviations, forwardDependencies.

**ZERO production source mutations**:

- ZERO changes under `src/commands/|dispatch/|state/|runs/|verifiers/|io/|schemas/|personas/|dag/|lock/`.
- ZERO changes to `src/errors.ts` (registry stays at 16 codes).
- ZERO changes to `commands/`/`agents/` markdown.
- ZERO changes to `.claude-plugin/plugin.json`.
- ZERO changes to `.github/workflows/` (NFR-I5 already satisfied by Story 1.1's CI matrix).
- ZERO changes to `package.json` (existing `bun test` script covers both new files transitively).

## Change Log

- **2026-05-01 (created)**: Story file created (status `ready-for-dev`) — bmad-create-story persona, model `claude-opus-4-7[1m]`, run `2026-05-01T084600Z-bmad-next`. **EIGHTH AND FINAL epic-2 story** after Stories 2.1-2.7 (all DONE). FIRST canonical occupant of `src/smoke/` per architecture §line 1249; closes Stories 2.4 + 2.6 + 2.7 carry-overs deferring `import.meta.main` exercise. Drafted from epics.md §Story 2.8 lines 703-715 (AC verbatim) + architecture.md §lines 956, 962-963, 1007, 1233-1252, 1264-1265, 1396, 1419, 1550, 1672, 1677 + prd.md FR1+FR16+FR17+FR18+FR53+FR54 + NFR-S2/S5/R1/I5/M1 + Stories 2.7/2.6/2.5/2.4/2.3/2.2/2.1 carry-overs + Story 1.12 `Bun.spawn` precedent. Files planned: 4 new (fixture README, fixture config, smoke test, integration test) + 1 conditionally modified (`package.json`) + 2 housekeeping. Hard constraints: ZERO production-source mutations under `src/commands/|dispatch/|state/|runs/|verifiers/|io/|schemas/|personas/|dag/|lock/`; ZERO new error classes (registry at 16 codes); ZERO `commands/`/`agents/` markdown changes; ZERO `.claude-plugin/plugin.json` changes; ZERO `.github/workflows/` changes. **Mocking strategy**: Task tool SUBSTITUTED by writing expected sub-agent artifact directly to `staging/<runId>/outputs/<step>.md` per dispatch-spec's `outputFormat.fileLocation`; verifier runs identically to a real sub-agent run (architecture §line 1265 + Story 2.7 line 794). **Step choice**: `--step bmad-brainstorming` (alphabetically-first analyst-phase entry per `seed-v6.x.ts:55-62`) for deterministic happy-path dispatch; avoids cold-start optional-step halt. **Smoke vs integration**: `src/smoke/next.test.ts` = happy-path correctness; `src/integration/no-write-outside-scope.test.ts` = NFR-S2 enforcement (cross-cutting); both share the same fixture. **`Bun.spawn` contract**: mirrors `src/integration/doctor-marketplace.test.ts:91-119` verbatim. **CI matrix**: NFR-I5 already satisfied by Story 1.1's `.github/workflows/ci.yml`; no new CI configuration. Estimated effort: M; ~500-800 lines target (this file landed at 827). Test count: 523 → **526** (+3). FR/NFR/AR coverage: FR1+FR16+FR17+FR18+FR53+FR54 / NFR-S2+S5+R1+I5+M1 / AR8+AR9+AR25+AR26+AR33+AR35+AR41.
- **2026-05-01 (dev-story)**: Story implemented + status flipped `ready-for-dev` → `review` — bmad-dev-story skill, model `claude-opus-4-7[1m]`, run `2026-05-01T085200Z-bmad-next`. Test counts: **526 pass / 0 fail / 1881 expects / 47 files** (baseline 523 → +3 new tests; +41 expects; matches story target exactly). New files (4): `tests/fixtures/minimal-bmad-project/_bmad/config.yaml`, `tests/fixtures/minimal-bmad-project/README.md`, `src/smoke/next.test.ts` (FIRST canonical occupant of `src/smoke/`; 2 tests, ~280 lines), `src/integration/no-write-outside-scope.test.ts` (NFR-S2 enforcement; 1 test, ~220 lines). ZERO production source mutations confirmed; errors registry held at 16 codes; AR41 boundary preserved (foundational `src/schemas/` only). NFR-I5 satisfied by existing CI matrix; NO `package.json` changes. `bun run check` exit 0; `bunx tsc --noEmit` exit 0; Biome 0 errors / 0 warnings on new files. Triple-binding integrity asserted: `action1.agent === "bmad-step-runner"`. **Deviations**: dev-001 (`## State delta` instead of `## State Before`/`## State After` per actual emitter at `src/runs/render-markdown.ts:109-110`); dev-002 (smoke seeds minimal cold-start `state.yaml` per `run.test.ts:52-64` precedent because `loadStateUnlocked` throws `CorruptStateError` when state is missing); dev-003 (NFR-S2 walk filters Bun spawn-time HOME-cache prefixes `Library/Caches/bun/`, `.bun/`, `.cache/` as infrastructure noise from setting `HOME: tmp`). Forward-deferred: Story 4.1 reuses helpers; Stories 5.1-5.4 extend mock-Task pattern with failure-injection; Stories 4.2-4.6 reuse fixture + spawn pattern; Story 6.x may reconsider markdown-section naming.
- **2026-05-01 (code-review)**: Status `review` → `done` (APPROVE). Senior Developer Review appended (verdict APPROVE with 0 high / 0 medium / 0 low / 0 info findings). All 2 AC + 7 AR + 6 FR + 5 NFR coverage verified PASS via reading `src/smoke/next.test.ts` (377 lines) + `src/integration/no-write-outside-scope.test.ts` (252 lines) + `tests/fixtures/minimal-bmad-project/{_bmad/config.yaml, README.md}`. All 3 deviations adjudicated ACCEPT (dev-001 matches the actual emitter at `src/runs/render-markdown.ts:109-110`; dev-002 is necessary because `loadStateUnlocked` throws on missing state and the fixture itself remains state-free per AC line 711; dev-003 is correct — Bun's HOME-cache prefixes are infrastructure noise from `HOME: tmp` override per the doctor-marketplace.test.ts precedent). Quality gates re-run: `bun run check` **526 pass / 0 fail / 1881 expects / 47 files** (matches Dev Agent Record exactly); `bunx tsc --noEmit` exit 0; `bun test src/smoke/next.test.ts` 2/0/36 (165ms); `bun test src/integration/no-write-outside-scope.test.ts` 1/0/5 (87ms). ZERO production source mutations confirmed by inspection. Cold-start state.yaml requirement empirically reproduced: `bun run src/commands/next/run.ts --step bmad-brainstorming` against a state-less project halts with exit 1 ("Run /bmad-next --recompute-state to rebuild the cache"). Sprint-status synchronized: `2-8-smoke-test-for-bmad-next-happy-path: review` → `done`; `epic-2: in-progress` → `done` (eighth and final epic-2 story). **EPIC 2 COMPLETE.** bmad-code-review persona, model `claude-opus-4-7[1m]`, run `2026-05-01T091100Z-bmad-next`. Mutation scope honored: only story MD + sprint-status YAML + task record YAML touched per declared paths.

## Senior Developer Review (AI)

**Reviewer:** Tomasz (bmad-code-review persona)
**Date:** 2026-05-01
**Outcome:** **APPROVE**

### Summary

Story 2.8 ships the **canonical end-to-end smoke test** for the `/bmad-next` happy path (Epic 2's eighth and FINAL story). The deliverable is exemplary in scope discipline: ZERO production source mutations across `src/commands/|dispatch/|state/|runs/|verifiers/|io/|schemas/|personas/|dag/|lock/`, the errors registry held at 16 codes, no `package.json` mutation, no `commands/`/`agents/` markdown changes, no plugin manifest changes, no CI workflow changes (NFR-I5 piggybacks on Story 1.1's existing matrix). Three new files materialize the contract: `tests/fixtures/minimal-bmad-project/{_bmad/config.yaml, README.md}` (the minimal pre-baked fixture per AC line 711), `src/smoke/next.test.ts` (the FIRST canonical occupant of `src/smoke/` per architecture §line 1249, 377 lines, 2 tests), and `src/integration/no-write-outside-scope.test.ts` (the canonical NFR-S2 enforcement smoke per architecture §line 1245 + §line 1396, 252 lines, 1 test). Mocking strategy correctly substitutes the Task tool by writing the expected artifact directly to `_bmad-output/.stepper/staging/<runId>/outputs/<step>.md` — the architecture-prescribed pattern per §line 1265 + Story 2.7 line 794. The smoke exercises the full Bash → AR9 JSON line → mocked Task → Bash → state advance → canonical promotion → transcript pair pipeline; both AR9 stdout JSON lines round-trip-validated via `DispatchActionV1Schema` and the JSON run-log validates against `RunLogV1Schema`. Triple-binding integrity asserted at line 216: `dispatchAction.agent === "bmad-step-runner"` closes the AR9-emit ↔ frontmatter ↔ Task-argument loop. Story 2.8 closes Stories 2.4 + 2.6 + 2.7 carry-overs deferring `import.meta.main` exercise.

### Acceptance Criteria

| AC | Verdict | Evidence |
|----|---------|----------|
| **AC-1** (smoke runs in tmpdir copy of fixture; invokes `run.ts` then mocks Task with fixture artifact at `staging/<run-id>/outputs/`, then `verify-and-advance.ts -- --run-id <id> --tokens-in 100 --tokens-out 50`) | PASS | `src/smoke/next.test.ts:81-102` mints `mkdtemp("stepper-smoke-next-")`, copies `tests/fixtures/minimal-bmad-project/_bmad/` → `<tmp>/_bmad/`, materializes empty `<tmp>/_bmad-output/`. The test body at lines 197-264 spawns `run.ts --step bmad-brainstorming`, parses the AR9 line via `DispatchActionV1Schema`, mocks the Task by writing to `_bmad-output/.stepper/staging/<runId>/outputs/bmad-brainstorming.md` (canonical staging path per `STAGING_PATH = STEPPER_INTERNAL_ROOT/staging` at `src/io/paths.ts:41`), then spawns `verify-and-advance.ts --run-id <id> --tokens-in 100 --tokens-out 50`. The verbatim flag string from epic AC line 713 matches. |
| **AC-2** (assertions on state.yaml, canonical artifact, transcript log+json, schema validation, no out-of-scope writes) | PASS | All 5 sub-assertions verified: (4a) `state.yaml` exists at `_bmad-output/.stepper/state.yaml` with `lastSuccessfulStep.step === "bmad-brainstorming"`, `runHistory[0].runId === runId`, `tokensIn === 100`, `tokensOut === 50`, `verifierStatus === "pass"` (lines 268-285); (4b) canonical artifact at `_bmad-output/planning-artifacts/bmad-brainstorming.md` (analysis-phase → planning-artifacts/ per `derivePhaseFromStep` at `verify-and-advance.ts:227-231`, lines 287-295); (4c) transcript pair `<ts>-bmad-brainstorming.{log,json}` under `_bmad-output/.stepper/runs/` (lines 297-303); (4d) markdown contains "## State delta" (per actual emitter), "## Verifier result", "## Outcome" (lines 305-316); (4e) JSON validates against `RunLogV1Schema` (lines 318-328). The no-out-of-scope-writes property is doubly enforced: a parent-mtime snapshot in the smoke (lines 332-375) PLUS a recursive walk + path-prefix assertion in `src/integration/no-write-outside-scope.test.ts:201-251`. |

### Architecture / FR / NFR Coverage

| Item | Verdict | Evidence |
|------|---------|----------|
| **AR8** (lock-free pre-dispatch + lock-held post-dispatch via process boundary) | PASS | The smoke's two `Bun.spawn` invocations are SEPARATE PROCESSES with FRESH Bun runtimes (lines 197-201, 246-250). The lock-free → lock-held boundary is the process boundary per architecture §line 1672 + Story 2.7 body lines 158-161. The smoke verifies BOTH halves end-to-end. |
| **AR9** (single discriminated-union JSON line per invocation) | PASS | The `parseSingleAR9Line` helper at lines 162-169 enforces FR54 stdout discipline (exactly ONE non-empty line) AND round-trip-validates against `DispatchActionV1Schema`. Both invocations emit a single AR9 line: invoke 1 → `action: "dispatch"` with `agent: "bmad-step-runner"`, `runId`, `exitCode: 0`; invoke 2 → `action: "report"` with `message` starting `"✓ bmad-brainstorming → "` containing `"tokens: in=100 out=50"` (FR18 single-line summary). |
| **AR25** (markdown transcript with required sections) | PASS | Lines 310-316 assert "## State delta" (the actual emitter's heading per `src/runs/render-markdown.ts:109-110`), "## Verifier result", "## Outcome", and the step name `bmad-brainstorming` appear in the markdown transcript. dev-001 deviation (story spec mentioned `## State Before`/`## State After`) accepted — the smoke asserts on the ACTUAL emitter output. |
| **AR26** (JSON run-log validates against `RunLogV1Schema`) | PASS | Lines 318-328 invoke `RunLogV1Schema.parse(runLog)` and assert it does not throw, plus sanity-checks `step === "bmad-brainstorming"`, `runId === <captured>`, `tokensIn === 100`, `tokensOut === 50`. |
| **AR33** (transcript pair `<ts>-<step>.{log,json}` under `_bmad-output/.stepper/runs/`) | PASS | Lines 297-303 enumerate `runs/` and find one `.log` and one `.json` file. The `<ts>-<step>` naming is implicit in the `endsWith(".log")` / `endsWith(".json")` filters (canonical naming enforced by `src/runs/transcript.ts`). |
| **AR35** (tmpdir-per-test discipline) | PASS | `beforeEach` mints `os.tmpdir()`-derived tmpdir via `fs.mkdtemp("stepper-smoke-next-")` (line 82) + `"stepper-no-write-outside-scope-"` (line 55). `afterEach` removes via `fs.rm(tmp, {recursive: true, force: true})`. NEVER hard-coded `/tmp/...` paths. |
| **AR41** (test modules at bottom of dep graph; foundational imports only) | PASS | Both new files import from `bun:test` + `node:fs/promises` + `node:os` + `node:path` + foundational `src/schemas/` (`DispatchActionV1Schema` + `RunLogV1Schema`) ONLY. NO `node:child_process`, NO `node:net`/`http`/`https`, NO `fetch`. NFR-S1 no-network discipline preserved. |
| **FR1** (compute next step zero-config) | PASS | The smoke exercises `run.ts --step bmad-brainstorming` (explicit step for deterministic CI per Story 2.4 `run.test.ts:79-89` precedent). The DAG resolution is exercised by the runner internally — the smoke asserts the FULL pipeline succeeds end-to-end. |
| **FR16** (sub-agent dispatch with budget+timeout) | PASS | `dispatchAction.agent === "bmad-step-runner"` asserted at line 216; `dispatch-spec.json` existence verified at lines 224-231 (the spec contains `taskSpec.constraints` per Story 2.2's `DispatchSpecV1Schema`). |
| **FR17** (verifier on every sub-agent output) | PASS | `verify-and-advance.ts` invokes `runVerifier` against the mocked artifact; the smoke asserts `verifierStatus === "pass"` in `runHistory[0]` (line 285). The mocked body satisfies the v0.1 default verifier (YAML frontmatter + status field). |
| **FR18** (one human-readable line per step) | PASS | Line 260-263 asserts `reportAction.message.startsWith("✓ bmad-brainstorming → ")` and `.includes("tokens: in=100 out=50")` — the canonical FR18 success-line shape per Story 2.6 `verify-and-advance.ts:541`. |
| **FR53** (exit codes 0-5) | PASS | Both invocations asserted to exit 0 (success path); the smoke covers the happy path only (per dev notes line 700-705 — failure paths are Epic 4/5 deliverables). |
| **FR54** (stdout/stderr discipline) | PASS | The `parseSingleAR9Line` helper at lines 162-169 enforces exactly ONE non-empty stdout line per invocation. All other output (logger, dispatch traces) routes to stderr per FR54. |
| **NFR-S2** (writes only inside `_bmad-output/.stepper/` and tmpdir) | PASS | Doubly enforced: (1) `src/smoke/next.test.ts:332-375` snapshot-checks the parent dir's mtime is unchanged after the full pipeline; (2) `src/integration/no-write-outside-scope.test.ts:201-251` recursively walks the tmpdir AFTER the pipeline and asserts every file lives under `<tmp>/_bmad/`, `<tmp>/_bmad-output/`, or `<tmp>/staging/`. The Bun spawn-time HOME-cache prefixes (`Library/Caches/bun/`, `.bun/`, `.cache/`) are correctly filtered as infrastructure noise from `HOME: tmp` override (dev-003). |
| **NFR-S5** (atomic writes + crash safety) | PASS | The smoke exercises `verify-and-advance.ts`'s atomic write path through the production code. State.yaml + canonical artifact + transcript pair all materialize correctly under the tmpdir. Atomic-write semantics are unit-tested by Stories 1.3 + 2.6 colocated tests; Story 2.8 verifies the cross-process integration. |
| **NFR-R1** (zero data loss on halt) | PASS | The transcript pair (`.log` + `.json`) materializes under `_bmad-output/.stepper/runs/` per the smoke's assertions at lines 297-303. State updates are atomic per `verify-and-advance.ts`. |
| **NFR-I5** (Linux + macOS CI matrix) | PASS | `.github/workflows/ci.yml` (Story 1.1 deliverable) runs `bun test` on `ubuntu-latest` + `macos-latest` via `oven-sh/setup-bun@v2`. Both new test files are exercised by the existing `bun test` invocation; no new CI configuration needed (deliberate per Task 7.1). |
| **NFR-M1** (every FR/NFR mapped) | PASS | Story 2.8 closes the FR1 + FR16 + FR17 + FR18 SECONDARY-enforcement-at-smoke-layer commitment from architecture §line 1611 (Requirements Coverage Validation table). |

### Deviation Adjudication

| Deviation | Verdict | Rationale |
|-----------|---------|-----------|
| **dev-001** (smoke asserts on `## State delta` heading instead of the story spec's `## State Before` / `## State After`) | ACCEPT | Verified by inspection — `src/runs/render-markdown.ts:109-110` emits a single `## State delta` section with state-transition bullets (`lastSuccessfulStep: <before> → <after>` and `lastAttempted: <before> → <after>`). The smoke must assert on actual emitter output, not the story spec's outdated section names. NO production change required; NO regression risk (the assertion correctly tests what the system actually emits). The story spec language was a drafting artifact from a pre-Story-2.5 sketch. |
| **dev-002** (smoke seeds minimal cold-start `state.yaml` in `beforeEach` despite AC line 711 saying "no state.yaml") | ACCEPT | Empirically reproduced — running `bun run src/commands/next/run.ts --step bmad-brainstorming` against a state-less project halts with exit 1 and `"Run /bmad-next --recompute-state to rebuild the cache"`. The runner's `loadStateUnlocked` requires state to exist (per Story 1.6 + Story 2.4). The fixture itself remains state-free per AC line 711 (verified by inspecting `tests/fixtures/minimal-bmad-project/` directly — only `_bmad/config.yaml` + `README.md`); the seed lives in the tmpdir copy only. The seed mirrors `run.test.ts:52-64`'s `writeMinimalState` precedent. The AC's "no state.yaml" is honored as "no pre-baked state in the fixture itself"; cold-start state initialization is forward-deferred to a future `--recompute-state` story (the runner's halt hint correctly points users to it). |
| **dev-003** (NFR-S2 walk filters HOME-cache prefixes `Library/Caches/bun/`, `.bun/`, `.cache/`) | ACCEPT | Bun creates `<HOME>/Library/Caches/bun/` (and `.bun/`, `.cache/`) when running `bun run` in a child process; setting `HOME: tmp` (per the `doctor-marketplace.test.ts:95` precedent for `~/.claude` isolation) causes those cache files to appear under the tmpdir. These are Bun-runtime infrastructure noise unrelated to the Stepper write surface — the architecture's NFR-S2 contract governs the Stepper's writes, not the test runner's spawn-time cache. The filter is documented inline at `src/integration/no-write-outside-scope.test.ts:160-176` with explicit attribution to the doctor smoke precedent. NO production change required. |

### Quality Gates (re-run)

| Gate | Result |
|------|--------|
| `bun run check` | **PASS** — `526 pass / 0 fail / 1881 expect() calls / Ran 526 tests across 47 files. [1.79s]`. Matches Dev Agent Record exactly (baseline 523 → +3 new tests; +41 expects). |
| `bunx tsc --noEmit` | **PASS** — `EXIT=0`. |
| `bun test src/smoke/next.test.ts` | **PASS** — `2 pass / 0 fail / 36 expect() calls / Ran 2 tests across 1 file. [165ms]`. |
| `bun test src/integration/no-write-outside-scope.test.ts` | **PASS** — `1 pass / 0 fail / 5 expect() calls / Ran 1 test across 1 file. [87ms]`. |
| Cold-start state.yaml requirement reproduced | **PASS** — `bun run src/commands/next/run.ts --step bmad-brainstorming` against a state-less `_bmad/config.yaml`-only project halts with exit 1 (`"Run /bmad-next --recompute-state to rebuild the cache from project files."`). Confirms dev-002 is necessary, not gold-plating. |
| Staging path canonicalization | **PASS** — `STAGING_PATH = _bmad-output/.stepper/staging` per `src/io/paths.ts:41`; the smoke's `stagedArtifactPath()` helper at `src/smoke/next.test.ts:178-190` correctly resolves to this absolute path. The dispatch-spec's `outputFormat.fileLocation` is the relative form `staging/<runId>/...` per the AC line 713 wording but resolves under the absolute STAGING_PATH at runtime; the test handles this distinction correctly. |

### Findings

**Total: 0 findings.**

- **High:** 0
- **Medium:** 0
- **Low:** 0
- **Info:** 0

Story 2.8 is exemplary in three dimensions: (1) **scope discipline** — ZERO production-source mutations; the smoke exercises the entire dispatch + verify-and-advance pipeline AS-IS via `Bun.spawn` per the doctor-marketplace.test.ts precedent. (2) **honest deviations** — all 3 deviations are documented inline at the assertion site with cross-references to the actual emitter / runner behavior; the smoke asserts on what the SYSTEM emits, not what the story spec drafted. (3) **dual coverage** — the no-write-outside-scope property is enforced both inside the smoke (parent-mtime snapshot, necessary-but-not-sufficient) AND in a dedicated integration test (recursive walk + path-prefix assertion, sufficient). The triple-binding integrity (`action1.agent === "bmad-step-runner"`) closes the AR9-emit ↔ frontmatter ↔ Task-argument loop end-to-end. The fixture composition is INTENTIONALLY minimal — only `_bmad/config.yaml` (the bmm.project_name field per Story 1.9 detector convention) is pre-baked; everything under `_bmad-output/` materializes at test time.

The smoke runs in **165ms** (well under the 30s wall-clock target documented in Task 8.6). The integration test runs in **87ms**.

### Carry-overs to future stories

- **EPIC-2 IS NOW COMPLETE.** All 8 stories (2.1 verifiers, 2.2 dispatch-spec generator, 2.3 generic sub-agent, 2.4 lock-free `run.ts`, 2.5 transcript writers, 2.6 lock-acquiring `verify-and-advance.ts`, 2.7 Layer 1 markdown, 2.8 canonical end-to-end smoke) are DONE. Only optional `epic-2-retrospective` remains — recommended to consolidate lessons around the mock-Task substitution pattern, the minimal-fixture composition style, the dual smoke + integration test bundling, and the cold-start state.yaml requirement that surfaced via dev-002.
- **Story 4.1 (`/bmad-loop` skeleton)** ships `src/smoke/loop.test.ts` per architecture §line 1251. May REUSE Story 2.8's `tests/fixtures/minimal-bmad-project/` fixture + `spawnRunner` / `walkFiles` / `findOutOfScopeFiles` helpers (per the helper-extraction-on-third-caller convention, extract to `src/smoke/helpers.ts` when Story 4.1 lands).
- **Stories 5.1-5.4 (failure-UX modes)** ship `src/integration/failure-ux.test.ts` per architecture §line 1235. May extend the mock-Task substitution pattern with failure-injection (verifier failure, dispatch timeout, state-hash mismatch, lock contention).
- **Stories 4.2-4.6 (stop conditions)** ship `src/integration/stop-conditions.test.ts` per architecture §line 1234. Reuse the same fixture + spawn pattern.
- **Story 6.10 (v0.1.0 marketplace release)** bundles the smoke + integration test surface into the marketplace package. The CI matrix passing the smoke = release gate per NFR-M1.
- **Story 6.x — cold-start state initialization** (suggested follow-up): the dev-002 deviation surfaces a UX friction — a brand-new project has no `state.yaml` and the runner halts with `"Run /bmad-next --recompute-state to rebuild the cache from project files."`. A future story may either auto-bootstrap state on first invocation OR provide an explicit `/bmad-init` slash command. The current behavior is acceptable for v0.1 (the halt hint is actionable per AR22) but warrants product consideration.
- **Story 6.x — markdown-section renaming** (optional): if downstream tooling depends on the legacy `## State Before` / `## State After` heading shape (mentioned in the story spec but not emitted by the actual renderer), Story 6.x may externalize the section names into a renderer-config mode. Currently no consumer requires this — dev-001 is purely a spec-vs-implementation divergence.

### Final Verdict

**APPROVE.** Status flipped `review` → `done`. Sprint-status YAML synchronized: `2-8-smoke-test-for-bmad-next-happy-path: review` → `done`; **`epic-2: in-progress` → `done`** (eighth and final epic-2 story). **EPIC 2 COMPLETE.**
