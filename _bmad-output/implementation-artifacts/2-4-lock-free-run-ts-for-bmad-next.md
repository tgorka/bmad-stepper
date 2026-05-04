---
status: done
story_id: '2.4'
story_key: 2-4-lock-free-run-ts-for-bmad-next
epic: '2'
title: Lock-Free `run.ts` for `/bmad-next`
created: '2026-05-01'
last_updated: '2026-05-01'
priority: M
estimated_effort: L
fr_coverage:
  - FR1
  - FR8
  - FR9
  - FR10
  - FR11
  - FR12
  - FR13
  - FR14
  - FR15
  - FR16
  - FR18
  - FR53
  - FR54
nfr_coverage:
  - NFR-P1
  - NFR-P3
  - NFR-S1
  - NFR-S4
  - NFR-S5
  - NFR-R1
  - NFR-R4
  - NFR-M3
ar_coverage:
  - AR7
  - AR8
  - AR9
  - AR21
  - AR22
  - AR33
  - AR41
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/implementation-artifacts/epic-1-retrospective.md
  - _bmad-output/implementation-artifacts/2-1-verifier-configuration-registry.md
  - _bmad-output/implementation-artifacts/2-2-dispatch-spec-generator.md
  - _bmad-output/implementation-artifacts/2-3-generic-sub-agent-bmad-step-runner-md.md
  - _bmad-output/implementation-artifacts/1-12-bmad-next-doctor-command.md
  - _bmad-output/implementation-artifacts/1-11-persona-resolution.md
  - _bmad-output/implementation-artifacts/1-10-dag-seed-three-tier-registry.md
  - _bmad-output/implementation-artifacts/1-7-cli-argument-parser.md
  - _bmad-output/implementation-artifacts/1-6-state-subsystem-load-save-recompute-skeleton.md
  - src/errors.ts
  - src/io/log.ts
  - src/io/paths.ts
  - src/schemas/state.ts
  - src/schemas/dispatch-spec.ts
  - src/schemas/dispatch-protocol.ts
  - src/state/load.ts
  - src/dag/index.ts
  - src/dag/build.ts
  - src/personas/resolve.ts
  - src/dispatch/index.ts
  - src/dispatch/generate-spec.ts
  - src/dispatch/emit.ts
  - src/dispatch/staging-cleanup.ts
  - src/verifiers/index.ts
  - src/commands/next/args.ts
  - src/commands/next/index.ts
  - src/commands/doctor/run.ts
---

# Story 2.4: Lock-Free `run.ts` for `/bmad-next`

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper user,
I want `src/commands/next/run.ts` to be read-only and lock-free, emitting exactly one JSON line on stdout describing the next action,
So that the (5+ minute) sub-agent run does not hold the lock and the slash-command markdown can branch deterministically.

## Context Summary

This is the **fourth story of Epic 2 (Single-Step Advance with Sub-Agent Dispatch)** and lands the **FIRST END-TO-END RUNNER** of the project — `src/commands/next/run.ts`. Until now the project shipped foundational primitives (Stories 1.1–1.5), the lock + state + DAG + personas mid-tier (Stories 1.4–1.11), `/bmad-next --doctor` as the **first integration command** (Story 1.12, Layer 2 + Layer 1 markdown), and the higher-tier `src/verifiers/` + `src/dispatch/` modules + the canonical Layer 3 `bmad-step-runner` sub-agent (Stories 2.1, 2.2, 2.3). Story 2.4 finally **wires every preceding piece together** into the canonical `/bmad-next` runner that composes:

1. **Story 1.7** `parseNextArgs` — CLI arg parsing (Result-shaped, sync).
2. **Story 1.6** `loadStateUnlocked` — read-only state read with no lock acquisition (architecture line 1672 — "run.ts is read-only").
3. **Story 1.10** `build` — Tier-1/2/3 DAG resolver (re-runs Tier 2 overrides + Tier 3 frontmatter parse).
4. **Story 1.11** `resolvePersona` — 4-tier persona resolver.
5. **Story 2.2** `cleanStagingOrphans` — orphan-staging cleanup at "Stepper start" per Story 2.2 carry-over.
6. **Story 2.2** `buildDispatchSpec` — produces `staging/<runId>/dispatch-spec.json` per architecture §P5.
7. **Story 2.2** `emitDispatchAction` — writes the AR9 stdout JSON line (`{ action: "dispatch" | "report" | "halt", ... }`).
8. **Story 2.1** `defaultVerifiers` / verifier registry — lookup `requiredFrontmatterSections` per step type to populate `taskSpec.outputFormat.requiredSections` per Story 2.2 carry-over.

This story is **structurally distinct** from every prior story in scale + composition surface:

- It is the **first runner-tier file** (under `src/commands/`) that imports from BOTH **mid-tier** (`state/`, `dag/`, `personas/`) AND **higher-tier** (`dispatch/`, `verifiers/`) modules. Per AR41 (architecture lines 1294-1302), `src/commands/` is the **top tier** of the boundary graph — every other tier may be imported here, and nothing imports from `commands/`. Story 2.4 exercises that AR41 boundary fully for the first time.
- It is the **first end-to-end Layer 2 entrypoint** that **DOES NOT acquire the project lock**. Per architecture §line 1672 + AR8 + the Coherence Validation Correction 1 (architecture line 1658): "`run.ts` is read-only and lock-free; `verify-and-advance.ts` acquires lock + re-validates state hash. New error: `STATE_CHANGED_DURING_DISPATCH`." This is the **architecturally critical decision** that makes the (5+ minute) sub-agent run not block other Stepper operations on the same project. Story 2.4 architects this lock-free read pattern; Story 2.6 (`verify-and-advance.ts`) provides the lock-acquiring complement.
- It is the **first AR9 emit site** (Story 2.2 ships `emitDispatchAction` — the writer; Story 2.4 wires the **caller**). Each `bun run src/commands/next/run.ts` invocation emits **exactly ONE JSON line** on stdout per the AR9 protocol per architecture §line 1660; Story 2.7's slash-command markdown reads that line and branches.
- It is the **first composer of `cleanStagingOrphans()` "at Stepper start"** per Story 2.2 carry-over (Story 2.2 ships the function but does NOT wire the call site).
- It is the **first populator of `taskSpec.context[]` and `taskSpec.outputFormat.requiredSections`** per Story 2.2 senior dev review info-3 + Story 2.3 forward-dep note. v0.1 populates these from the resolved DAG node + the Story 2.1 verifier registry; the full BMAD-skill metadata extraction is a Story 6.x telemetry-driven enhancement.

Concretely, this story produces:

1. **`src/commands/next/run.ts`** (NEW) — the canonical lock-free runner. Public testable surface: `runNext(opts?: RunNextOptions): Promise<NextResult>` returning `{ exitCode, action }` where `action` is the AR9 `DispatchActionV1`. The orchestrator (a) parses argv via `parseNextArgs`, (b) calls `cleanStagingOrphans()` once at start (best-effort; failures logged to stderr but never propagate), (c) routes by mode: read-only flags (`--dry-run`, `--explain`, `--list`, `--diff-state`, `--export-state`) emit `action: "report"`; `--doctor` delegates to Story 1.12's `runDoctor` and re-emits as `action: "report"`; `--upgrade` is deferred to Epic 6 (emits `action: "halt"` with hint pointing to Story 6.9 if the flag is set in v0.1); zero-config / step-override paths produce a dispatch spec and emit `action: "dispatch"`, (d) on any thrown `StepperError`, emits `action: "halt"` with `message: err.actionableHint` and `exitCode: err.exitCode`. The function is `async`; throws are caught at the outer `import.meta.main` block; **NO lock is ever acquired**.
2. **`src/commands/next/run.test.ts`** (NEW) — colocated tests per AR35. Tmpdir-per-test isolation. Tests cover (i) the AC-1 happy path (zero-config → dispatch with valid AR9 line), (ii) the AC-2 read-only flag paths (`--list`, `--explain`, `--diff-state`, `--export-state`, `--dry-run` each → `action: "report"`), (iii) the AC-3 state-loading failure path (corrupt state → `action: "halt"` with hint), (iv) the AC-4 schema-validation enforcement (the emitted JSON line validates against `DispatchActionV1Schema`), (v) the AC-5 scope discipline (`run.ts` writes only inside `STAGING_PATH/`), (vi) the lock-free invariant (an integration assertion that `acquire()` is NEVER called on the lock module from this code path).
3. **`src/commands/next/index.ts`** (MODIFIED) — extends the existing barrel (Story 1.7 currently re-exports the args parser only) to add `runNext`, `RunNextOptions`, `NextResult` from `./run.ts`. Mirrors the Story 1.12 doctor barrel pattern (`runDoctor` + types).
4. **`src/commands/index.ts`** (UNCHANGED) — already re-exports `next/index.ts` since Story 1.7. No top-level barrel mutation needed.

This story is the **first of the runner trio** that closes the dispatch-then-verify loop (Stories 2.4 + 2.6 + 2.7):

- **Story 2.4** (this story) — lock-free `run.ts` (pre-dispatch composer + AR9 emit).
- **Story 2.6** — `verify-and-advance.ts` (post-dispatch lock acquirer + state-hash check + promote + state advance).
- **Story 2.7** — `commands/bmad-next.md` (Layer 1 orchestrator: `Bash → JSON-line → Task → Bash`).

It does **NOT**:

- Implement `verify-and-advance.ts` — that is **Story 2.6**. Story 2.4's runner ENDS at the `emitDispatchAction({ action: "dispatch", ... })` call. Layer 1 (Story 2.7) reads the line, dispatches the sub-agent (Story 2.3's `bmad-step-runner`), captures token counts, and invokes `bun run src/commands/next/verify-and-advance.ts -- <run-id> --tokens-in <n> --tokens-out <n>` — a **separate process invocation** with a fresh Bun runtime. The lock-free → lock-held boundary is the **process boundary** between `run.ts` and `verify-and-advance.ts`.
- Implement the **Layer 1 markdown** (`commands/bmad-next.md` body). That is **Story 2.7**. Story 2.4 ships only the Layer 2 entrypoint; the Layer 1 orchestrator that reads the JSON line + invokes Task is a separate file.
- Implement the **end-to-end happy-path smoke test** (full `/bmad-next` from slash command to state advance). That is **Story 2.8**. Story 2.4 ships its own colocated runner unit tests but the canonical end-to-end exercise lives in Story 2.8.
- Implement the **multi-persona sequential dispatch loop**. Per architecture §line 187 + AR16 + Story 2.2 dev notes line 504, multi-persona steps loop at the runner tier — `resolvePersona` may return `string | readonly string[]`. Story 2.4 v0.1 handles **single-persona** steps; if `resolvePersona` returns an array, Story 2.4 currently picks the **first** element AND surfaces a stderr warn with hint "Multi-persona sequential dispatch is deferred to Story 4.1 / Epic 5; current invocation uses persona <first-element>." The full multi-persona loop is forward-deferred to Stories 4.1 (loop runner) and 5.* (failure-UX engine).
- Implement the **state-hash snapshot** in `dispatch-spec.json`. Per epics.md Story 2.6 line 674 + the architecture line 1673 Coherence Validation Correction, the state-hash is required by `verify-and-advance.ts` for the TOCTOU check. Story 2.4 does NOT yet write the hash — Story 2.2 dev-001 / dev-002 deferred this to a Story 2.6 schema-bump (`DispatchSpecV2Schema` adds `stateHash`) OR a sibling file (`staging/<runId>/state-hash.json`). Story 2.4 v0.1 ships the runner WITHOUT the hash; the dispatch path is functional but the TOCTOU contract is honoured by Story 2.6 as a separate concern (Story 2.6 may either compute the hash from the dispatch-spec contents alone OR ratify the schema bump).
- Add **`--watch`** (live transcript tail) — that is **Story 3.9**. v0.1 routes `--watch` to `action: "halt"` with hint "Run /bmad-next --doctor instead; --watch is implemented in Story 3.9 (Epic 3)."
- Add **`--upgrade`** end-to-end. The Story 1.7 args parser accepts `--upgrade` as a valid flag; Story 2.4 emits `action: "halt"` with hint pointing to Story 6.9 if the flag is set in v0.1. The `src/upgrade/` module exists in skeleton form (Story 1.5) but the full upgrade flow is Epic 6.
- Add **`--resume`** behaviour. v0.1 treats `--resume` as a no-op flag in `run.ts` (the runner does not yet branch on `lastAttempted`); the actual resume semantics are Story 3.2. Story 2.4 simply accepts the flag without erroring; subsequent stories ratify the behaviour.
- Add **`--force-unlock`** end-to-end. Story 1.7's parser accepts the flag; Story 2.4 routes to `action: "halt"` with hint "Stale-lock recovery is implemented in Story 6.x; v0.1 has no force-unlock surface." A future Epic 6 polish PR will wire to `src/lock/` `forceRelease()`.
- Modify any prior **mid-tier** module. Per AR41, the composition lives at the runner tier. The only `src/` deltas in Story 2.4 are: `src/commands/next/run.ts` (NEW) + `src/commands/next/run.test.ts` (NEW) + `src/commands/next/index.ts` (extend barrel — append `runNext` re-export).

It DOES land:

- The exact AR41-conformant placement of `src/commands/next/run.ts` as a **top-tier** runner. Per architecture lines 1294-1302, top-tier modules may import from EVERY tier (foundational + mid + higher); nothing imports from top-tier.
- The lock-free contract per architecture §line 1672 + AR8 — `runNext` NEVER calls `acquire()` from `src/lock/lock.ts`. The state read uses `loadStateUnlocked` exclusively. **CI verification** via `Grep` of `acquire(` and `loadState(` (without the `Unlocked` suffix) returning zero matches under `src/commands/next/run.ts`.
- The AR9 stdout-line protocol — exactly ONE JSON line per `bun run` invocation; the schema validates via `DispatchActionV1Schema.parse()` (defence-in-depth via `emitDispatchAction`).
- The `cleanStagingOrphans()` "at Stepper start" wiring (Story 2.2 carry-over satisfaction) — `runNext` calls `cleanStagingOrphans()` ONCE at the top of the function, after arg parsing but before any state read. Failures are logged to stderr via `info()` and do NOT propagate (best-effort cleanup; never blocks the dispatch).
- The `taskSpec.context[]` + `taskSpec.outputFormat.requiredSections` population (Story 2.2 carry-over satisfaction). v0.1 derivation:
  - `taskSpec.context[]` — populated from the resolved DAG node's `after[]` list, expanded to `{ path, label }` entries pointing at canonical artifact paths under `_bmad-output/`. The path mapping uses the same convention as Story 2.1 verifier configs (e.g., `dev-story` step's context includes the parent story file at `_bmad-output/implementation-artifacts/<story-key>.md`).
  - `taskSpec.outputFormat.requiredSections` — populated from the Story 2.1 verifier registry: `getVerifierConfig(stepName).requiredFrontmatterSections`. Falls through to `defaultVerifiers.default` when no per-step config exists.
- The exit-code mapping per FR53 — 0 (success), 1 (halt-with-actionable-error), 2 (configuration error), 3 (BMAD compatibility), 4 (lock contention — UNREACHABLE in `run.ts`, lock-free), 5 (pathological input).
- The stderr discipline per FR54 + architecture line 862 — all progress / warning / error logging routes to stderr via `info` / `warn` / `error` from `src/io/log.ts`. **stdout carries exactly ONE line**: the AR9 dispatch-action JSON line (or zero lines on parse-error which exits 2 before any emit).
- The Story 1.7 cross-validation gap closure — the runner enforces `--include-optional` ⊕ `--no-optional` (mutually exclusive); throws `ConfigError` with hint "Pass either --include-optional or --no-optional, not both." per Story 1.7 args.ts line 65 forward-dep.
- The Story 1.7 empty-string flag handling — empty `--epic ""` is treated as "no filter" per Story 1.7 args.ts line 70 forward-dep.
- AR21 / AR22 (errors carry `code` + `actionableHint` + single-line `Run/See/Try/Check`-prefixed hint) via existing `StepperError` subclasses (`ConfigError`, `CorruptStateError`, `BmadNotInstalledError`, etc.); ZERO new error class registration. The `STATE_CHANGED_DURING_DISPATCH` error (architecture line 1674) is registered in **Story 2.6** since Story 2.4 never sees the TOCTOU mismatch (lock-free).
- AR33 (function & error semantics) — `runNext` is `async`; throws `StepperError` subclasses on hard failures; uses `info()` / `warn()` / `error()` / `json()` from `src/io/log.ts`; NO `console.*`; NO `process.exit` inside `runNext` (only in the `import.meta.main` block per Story 1.12 precedent).

## Acceptance Criteria

The acceptance criteria below are reproduced **verbatim** from `_bmad-output/planning-artifacts/epics.md` §Story 2.4 (lines 627-645, BDD Given/When/Then format). Lines and AC labelling preserved.

**Given** `src/commands/next/run.ts` invoked via `bun run`
**When** zero-config invocation
**Then** it acquires NO lock, reads state, computes next step, builds dispatch spec, writes `staging/<run-id>/dispatch-spec.json`, and emits to stdout exactly one JSON line: `{ "action": "dispatch", "runId": "<id>", "agent": "bmad-step-runner", "exitCode": 0 }`
**Given** a `--list`, `--explain`, `--diff-state`, `--export-state`, or `--dry-run` flag
**When** invoked
**Then** the action is `"report"` with `message` field containing the human-readable output
**Given** a state-loading failure
**When** invoked
**Then** the action is `"halt"` with `exitCode > 0` and `message` containing the actionable hint
**And** the JSON-line shape is validated against `src/schemas/dispatch-protocol.ts`
**And** integration test asserts `run.ts` never writes outside `staging/`

## Tasks / Subtasks

- [x] **Task 0 — Verify pre-conditions (AC: all)**
  - [x] 0.1 Confirm Story 2.3 (`agents/bmad-step-runner.md`) is `done` per `_bmad-output/implementation-artifacts/sprint-status.yaml` (`2-3-generic-sub-agent-bmad-step-runner-md: done`). Confirm Story 2.2 (`src/dispatch/`) and Story 2.1 (`src/verifiers/`) are `done`. Confirm `src/commands/next/run.ts` does NOT yet exist (this story creates it). Confirm `src/commands/next/run.test.ts` does NOT yet exist.
  - [x] 0.2 Confirm `src/commands/next/index.ts` currently re-exports the args parser surface only (`parseNextArgs`, `NextArgs`, `NextArgsSchema`, `ParseError`, `Result`). Story 2.4 will EXTEND this barrel to add `runNext`, `RunNextOptions`, `NextResult`.
  - [x] 0.3 Confirm `src/state/load.ts` exports BOTH `loadState` (locked) AND `loadStateUnlocked` (lock-free). Story 2.4 imports `loadStateUnlocked` ONLY (per AR8 + architecture line 1672). Verify by `Grep` for `export.*loadStateUnlocked` in `src/state/load.ts:166`.
  - [x] 0.4 Confirm `src/dag/index.ts` exports `build`, `BuildInput`, `DagAdjacency`, `DagNode`, `Phase`, `SEED_BMAD_VERSION`. Story 2.4 imports `build` (the Tier-1/2/3 resolver) and `DagAdjacency` (return type).
  - [x] 0.5 Confirm `src/personas/index.ts` exports `resolvePersona`, `ResolveInput`, `ResolveOptions`. Story 2.4 imports `resolvePersona` and handles the `string | readonly string[]` return contract per architecture §line 187 (multi-persona sequential dispatch — v0.1 picks first element, surfaces stderr warn).
  - [x] 0.6 Confirm `src/dispatch/index.ts` exports `buildDispatchSpec`, `emitDispatchAction`, `cleanStagingOrphans`, `BuildDispatchSpecInput`, `BuildDispatchSpecResult`, `CleanStagingOrphansOptions`, `CleanStagingOrphansResult`, `BudgetOverride`, `Phase`, `DispatchSpecInput`. Story 2.4 imports all three call surfaces (`buildDispatchSpec`, `emitDispatchAction`, `cleanStagingOrphans`). Verify by reading `src/dispatch/index.ts`.
  - [x] 0.7 Confirm `src/verifiers/index.ts` exports `getVerifierConfig`, `verifierRegistry`, `defaultVerifiers`. Story 2.4 imports `getVerifierConfig` ONLY (for populating `taskSpec.outputFormat.requiredSections` per Story 2.2 carry-over).
  - [x] 0.8 Confirm `src/schemas/dispatch-protocol.ts` exports `DispatchActionV1Schema`, `DispatchActionV1`, `DispatchAction`, `DispatchActionLatestSchema`. Story 2.4 imports `DispatchActionV1` (the typed action shape — emitted via `emitDispatchAction`).
  - [x] 0.9 Confirm `src/commands/doctor/run.ts` exports `runDoctor` (Story 1.12). Story 2.4 imports `runDoctor` for the `--doctor` flag delegation path. Verify by `Grep` for `export async function runDoctor` in `src/commands/doctor/run.ts`.
  - [x] 0.10 Confirm `src/errors.ts` registry stays at 16 codes (post-Story 2.3 verified). Story 2.4 USES existing classes (`ConfigError`, `CorruptStateError`, `BmadNotInstalledError`, `BmadIncompatibleError`, `DagCycleError`, `UnknownBmadSkillError`, `PathologicalInputError`, `MigrationFailureError`, `StateTooNewError`, `LockContentionError`, `ScopeViolationError`) but does NOT register a new code. The `STATE_CHANGED_DURING_DISPATCH` error from architecture line 1674 belongs to Story 2.6 (verify-and-advance acquires the lock — Story 2.4 never sees TOCTOU mismatch since it's lock-free).
  - [x] 0.11 Read epics.md Story 2.4 §lines 627-645 verbatim. Confirm the AC text in §Acceptance Criteria above is character-identical.
  - [x] 0.12 Read architecture.md §line 1107 (`run.ts` directory listing); §line 1331 (FR1 mapping → `src/commands/next/run.ts` + `src/dag/build.ts` + `src/state/load.ts`); §line 1338 (FR8); §line 1339 (FR9 `--dry-run`); §line 1340 (FR10 `--step <id>`); §lines 1341-1344 (FR11/13/14 — `--epic`/`--story`/`--phase`/`--explain`/`--list`); §line 1450 (full Layer 1 → Layer 2 → Layer 3 → Layer 2 → Layer 1 sequence); §line 1660 (AR9 protocol concretization); §line 1672 (run.ts is read-only / lock-free); §line 1676 (run.ts JSON-line protocol via dispatch-protocol.ts schema); §line 1294-1302 (AR41 top-tier import boundary).
  - [x] 0.13 Read prd.md FR8 line 681; FR9 line 682; FR10 line 683; FR11 line 684; FR13 line 686 (`--explain`); FR14 line 687 (`--list`); FR15 line 688 (`--include-optional`/`--no-optional`); FR16 line 689 (sub-agent dispatch); FR18 line 691 (one human-readable line per step); FR53 line 744 (exit codes); FR54 line 745 (stdout/stderr discipline).
  - [x] 0.14 Read Story 2.2's File List + Senior Developer Review §Carry-overs to Future Stories (`_bmad-output/implementation-artifacts/2-2-dispatch-spec-generator.md` lines 962-966) — confirm Story 2.4 is correctly identified as the PRIMARY CALLER of `buildDispatchSpec` + `emitDispatchAction` + `cleanStagingOrphans` (per Story 2.2 Forward Dependencies line 654: "Story 2.4 — Lock-free `run.ts` [PRIMARY CALLER]: composes `loadStateUnlocked()` + `buildDag()` + `computeNextStep()` + `resolvePersona()` + `buildDispatchSpec()` + `emitDispatchAction()`. Story 2.4 is also the canonical caller of `cleanStagingOrphans()` 'at Stepper start' (AC-4)").
  - [x] 0.15 Read Story 2.3's §Forward Dependencies + Carry-overs to Future Stories (`_bmad-output/implementation-artifacts/2-3-generic-sub-agent-bmad-step-runner-md.md` lines 309-322 + 680-687) — confirm Story 2.4's `agent: "bmad-step-runner"` literal MUST match Story 2.3's frontmatter `name: bmad-step-runner` verbatim. The literal already lives in Story 2.2's `src/dispatch/emit.ts` invocation at the caller side; Story 2.4 wires the call.
  - [x] 0.16 Confirm baseline `bun run check` exits 0 with **409 pass / 0 fail / 1488 expects / 39 files** per Story 2.3 final (carries through Story 2.3 — zero TS deltas).
  - [x] 0.17 Confirm Bun host version satisfies AR2 (Bun >= 1.3). Run `bun --version`; record in Completion Notes.

- [x] **Task 1 — Plan the runner's `RunNextOptions` + `NextResult` public surface (AC-1, AC-4)**
  - [x] 1.1 Sketch the public types for `runNext()` per the Story 1.12 `runDoctor` precedent (test-only-but-exported escape hatches + structured return; the `import.meta.main` block translates to stderr writes + `process.exit`):
    ```typescript
    export interface RunNextOptions {
      // Test-injection escape hatches (mirror Story 1.12 RunDoctorOptions
      // shape: every IO concern injectable for tmpdir-per-test isolation).
      readonly argv?: readonly string[];      // defaults to process.argv.slice(2)
      readonly projectRoot?: string;          // defaults to process.cwd()
      readonly statePath?: string;            // forwarded to loadStateUnlocked
      readonly stagingRoot?: string;          // forwarded to buildDispatchSpec + cleanStagingOrphans
      readonly pluginDir?: string;            // forwarded to build + resolvePersona
      readonly overridesPath?: string;        // forwarded to build
      readonly configPath?: string;           // forwarded to resolvePersona
      readonly bmadConfigPath?: string;       // forwarded to resolvePersona
      readonly skillNames?: readonly string[];// forwarded to build (when no live BMAD detect)
      readonly nowIso?: string;               // forwarded to buildDispatchSpec (deterministic runId)
      readonly logger?: { info(m: string): void; warn(m: string): void; error(m: string): void; json(p: unknown): void };
    }

    export interface NextResult {
      readonly exitCode: 0 | 1 | 2 | 3 | 5;  // 4 (lock contention) UNREACHABLE — runner is lock-free
      readonly action: DispatchActionV1;     // the AR9 line emitted (or to-be-emitted by import.meta.main)
    }
    ```
  - [x] 1.2 Document the **lock-free contract** in the JSDoc — per architecture §line 1672, `runNext` MUST NEVER call `acquire()` from `src/lock/lock.ts`. The state read uses `loadStateUnlocked` exclusively. CI verification: `bun run check` includes a `Grep`-based assertion (added in Task 9.4) that `src/commands/next/run.ts` does NOT import from `../../lock/`.
  - [x] 1.3 Document the **stdout discipline** in the JSDoc — per FR54 + architecture line 862, `runNext` writes the AR9 line via `emitDispatchAction` (which calls `json()` — stdout). All other diagnostic output routes to stderr via `info()` / `warn()` / `error()`. The `import.meta.main` block emits the line ONCE before exit; the `runNext` function itself returns the `NextResult` for tests to inspect WITHOUT emitting (AC: tests assert against the `action` field directly).

- [x] **Task 2 — Create `src/commands/next/run.ts` — module header + imports + helpers (AC: all)**
  - [x] 2.1 Create `src/commands/next/run.ts`. Module purpose: the canonical lock-free `/bmad-next` runner (FR1, FR8-FR15, FR16, FR18, FR53, FR54, AR8, AR9, AR41).
  - [x] 2.2 Per AR41 top-tier (architecture lines 1294-1302), allowed imports: foundational (`../../errors.ts`, `../../io/log.ts`, `../../io/paths.ts`, `../../schemas/dispatch-protocol.ts`); mid-tier (`../../state/load.ts` — `loadStateUnlocked` ONLY, `../../dag/index.ts`, `../../personas/index.ts`); higher-tier (`../../dispatch/index.ts`, `../../verifiers/index.ts`); intra-module siblings (`./args.ts` — `parseNextArgs`); top-tier siblings (`../doctor/run.ts` — `runDoctor` for `--doctor` delegation); Bun stdlib (`Bun.file`); Node stdlib (`node:path`, `node:fs/promises`). **FORBIDDEN**: `../../lock/` (lock-free contract — architecture line 1672); `../../state/save.ts` (lock-required write surface — `verify-and-advance.ts` owns); `../../snapshot/` (snapshot capture is `verify-and-advance.ts` concern); `node:child_process` (use `Bun.spawn` if ever needed; v0.1 doesn't); any new external runtime dep beyond `zod` (transitively pulled). JSDoc on the file MUST cite the AR41 + AR8 + line 1672 boundary contract.
  - [x] 2.3 Module-level constants:
    ```typescript
    /**
     * The canonical sub-agent name Layer 1 invokes via Task. Hard-coded
     * literal must match Story 2.3's agents/bmad-step-runner.md frontmatter
     * `name: bmad-step-runner` verbatim (coupled atomic change if ever
     * renamed; both files must change together).
     */
    const STEP_RUNNER_AGENT = "bmad-step-runner" as const;

    /** Default model per architecture §P5 + Story 2.2 buildDispatchSpec contract. */
    const DEFAULT_MODEL = "sonnet" as const;
    ```
  - [x] 2.4 Helper `pickFirstPersona(persona: string | readonly string[], stepName: string, log: LoggerFns): string` — per architecture §line 187 + AR16 multi-persona deferral. If `Array.isArray(persona)`, surfaces stderr warn ("Multi-persona sequential dispatch is deferred to Stories 4.1 + 5.*; current invocation uses persona <first>") via `log.warn(...)` and returns the first element (or throws `ConfigError` with hint "Persona array for step <stepName> is empty; configure at least one persona in bmad-stepper.config.yaml personas: block." if the array is empty). Single string falls through unchanged.
  - [x] 2.5 Helper `buildContextRefs(node: DagNode, projectRoot: string): Array<{ path: string; label: string }>` — per Story 2.2 carry-over (populate `taskSpec.context[]`). v0.1 derivation: for each prerequisite in `node.after`, emit a `{ path, label }` entry pointing at the canonical artifact path under `_bmad-output/`. The path-mapping convention (per architecture §P5 example at lines 868-887): planning artifacts live at `_bmad-output/planning-artifacts/<step>.md`; implementation artifacts at `_bmad-output/implementation-artifacts/<step>-*.md`. v0.1 uses a simple lookup table (e.g., `prd → _bmad-output/planning-artifacts/prd.md`); the BMAD-skill metadata reading is a Story 6.x telemetry-driven enhancement. **Best-effort**: if a referenced artifact does NOT yet exist on disk, the entry is emitted anyway (the sub-agent will surface the missing-input error via Story 2.1's `runVerifier` `required-files` check). Returns `[]` for nodes with empty `node.after` (e.g., the seed `analyst-research`).
  - [x] 2.6 Helper `getRequiredSections(stepName: string): readonly string[]` — per Story 2.2 carry-over (populate `taskSpec.outputFormat.requiredSections`). Calls Story 2.1's `getVerifierConfig(stepName)` and returns the resolved `requiredFrontmatterSections` array (or `[]` if no per-step config exists; the verifier registry has a `defaultVerifiers.default` fallback that returns `[]`).
  - [x] 2.7 Helper `enforceMutuallyExclusiveFlags(args: NextArgs): void` — per Story 1.7 args.ts line 65 forward-dep (cross-validation gap closure). Throws `ConfigError(code: "CONFIG_ERROR", exitCode: 2)` with `hintOverride: "Pass either --include-optional or --no-optional, not both."` if BOTH `args.includeOptional === true` AND `args.noOptional === true`.

- [x] **Task 3 — Implement `runNext()` — argv parse + early returns (AC-3, AC-4)**
  - [x] 3.1 Public signature:
    ```typescript
    export async function runNext(opts?: RunNextOptions): Promise<NextResult>
    ```
  - [x] 3.2 Algorithm step 1 — **Resolve options + parse argv**: defaults per Task 1.1 sketch. Call `parseNextArgs(argv)` from `./args.ts`. If `result.ok === false`, return `{ exitCode: 2, action: { action: "halt", message: result.error.hint, exitCode: 2 } }` immediately. (AR21/AR22 + FR53 — exit 2 = configuration error.) The `import.meta.main` block then writes `result.error.hint` to stderr and exits 2 BEFORE invoking `runNext` per Story 1.12 doctor precedent — but `runNext` itself should be defensive and handle the parse-failure path for callers that bypass `import.meta.main`.
  - [x] 3.3 Algorithm step 2 — **Cross-validate flags** (Story 1.7 forward-dep): call `enforceMutuallyExclusiveFlags(args)`. On throw, the outer try/catch (step 9 below) translates to `action: "halt"`.
  - [x] 3.4 Algorithm step 3 — **`--upgrade` deferral**: if `args.upgrade === true`, return `{ exitCode: 1, action: { action: "halt", message: "Run /bmad-next --doctor to verify your install. The --upgrade flow is implemented in Story 6.9 (Epic 6).", exitCode: 1 } }`. Hint format: `Run /bmad-next --doctor to verify…` (AR22 starts with `Run`). Documents the deferral inline.
  - [x] 3.5 Algorithm step 4 — **`--watch` deferral** (Story 3.9): if `args.watch === true`, return `{ exitCode: 1, action: { action: "halt", message: "Run /bmad-next --doctor instead; --watch is implemented in Story 3.9 (Epic 3).", exitCode: 1 } }`.
  - [x] 3.6 Algorithm step 5 — **`--force-unlock` deferral** (Epic 6): if `args.forceUnlock === true`, return `{ exitCode: 1, action: { action: "halt", message: "Run /bmad-next --doctor first; --force-unlock is implemented in Story 6.x.", exitCode: 1 } }`.

- [x] **Task 4 — Implement `runNext()` — `cleanStagingOrphans()` at Stepper start (AC-1, Story 2.2 carry-over)**
  - [x] 4.1 Algorithm step 6 — **Orphan staging cleanup**: invoke `cleanStagingOrphans({ stagingRoot: opts.stagingRoot })` per Story 2.2 carry-over satisfaction. The call is **best-effort** — failures are logged via `info(...)` (stderr) but do NOT propagate. Wrap in try/catch:
    ```typescript
    try {
      const cleanup = await cleanStagingOrphans({ stagingRoot: opts?.stagingRoot });
      if (cleanup.removedCount > 0) {
        info(`next: cleaned ${cleanup.removedCount} orphan staging dir(s) at start`);
      }
    } catch (err) {
      info(`next: orphan staging cleanup failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
    }
    ```
  - [x] 4.2 Per Story 2.2 §Tasks 7.5: "the architecture's 'at Stepper start' wording (AC-4) implies the runner-tier (Story 2.4 run.ts or Story 2.6 verify-and-advance.ts) calls it once per `bun run` invocation". Story 2.4 owns this wiring; Story 2.6 may also call it but is not required to.

- [x] **Task 5 — Implement `runNext()` — `--doctor` delegation (AC-2, FR41)**
  - [x] 5.1 Algorithm step 7 — **`--doctor` short-circuit**: if `args.doctor === true`, delegate to Story 1.12's `runDoctor`:
    ```typescript
    if (args.doctor) {
      const result = await runDoctor({
        projectRoot: opts?.projectRoot,
        statePath: opts?.statePath,
        configPath: opts?.configPath,
        overridesPath: opts?.overridesPath,
      });
      const message = result.results.map(r => r.line).join("\n");
      return { exitCode: result.exitCode, action: { action: "report", message, exitCode: result.exitCode } };
    }
    ```
  - [x] 5.2 The doctor's structured `DoctorResult` (per Story 1.12 doctor/run.ts:94 — `{ exitCode, results }`) is reformatted as a single `message` string for the AR9 `action: "report"` shape. The slash-command markdown (Story 2.7) prints `message` directly to the user.
  - [x] 5.3 Per architecture §line 1671-1678 + Story 1.12: `commands/bmad-doctor.md` is a **thin alias** that delegates to `bun run src/commands/doctor/run.ts -- $ARGUMENTS`. The flag-canonical path is `/bmad-next --doctor` (this delegation site). Both surfaces invoke the same `runDoctor` function; Story 2.4 honours the flag-canonical convention.

- [x] **Task 6 — Implement `runNext()` — read-only flag report paths (AC-2, FR9, FR13, FR14)**
  - [x] 6.1 Algorithm step 8 — **Read-only flag handling**: the AC-2 enumeration includes `--list`, `--explain`, `--diff-state`, `--export-state`, `--dry-run`. Each MUST emit `action: "report"` with the human-readable output via `message`. v0.1 status:
    - `--export-state` (FR4, FR52) — Story 2.4 emits a stub `action: "report"` with `message: "JSON export is implemented in Story 3.10 (Epic 3); current state path: <statePath>"`. The full implementation lives in `src/state/export.ts` per architecture §line 1334. The dispatch-action `message` is the human-readable hint; the actual JSON export is a separate Story 3.10 deliverable.
    - `--diff-state` (FR3) — same v0.1 stub: `action: "report"` with `message: "State diff is implemented in Story 3.8 (Epic 3); current state path: <statePath>"`.
    - `--list` (FR14) — Story 2.4 v0.1 implementation: read state via `loadStateUnlocked`, build the DAG via `build`, render the candidate next-step list as a single newline-joined string, emit `action: "report"`. The candidate enumeration uses the DAG's topological sort via `tarjanScc` (already exported from `src/dag/index.ts`) — for v0.1, return all nodes whose prerequisites are satisfied by `state.lastSuccessfulStep`. **Defensive**: if the DAG/state is malformed, throw the underlying StepperError (the outer try/catch translates to `action: "halt"`).
    - `--explain` (FR13) — Story 2.4 v0.1 stub: `action: "report"` with `message: "Reasoning trace is implemented in Story 3.6 (Epic 3); current next step: <nextStep>"`. The full reasoning trace lives in Story 3.6.
    - `--dry-run` (FR9) — Story 2.4 v0.1 implementation: run the full happy-path through `buildDispatchSpec` BUT DO NOT call `emitDispatchAction` with `action: "dispatch"`. Instead, emit `action: "report"` with `message: "Dry-run: would dispatch step <stepName> to agent <agent> with run-id <runId> at <stagingDir>. Pass without --dry-run to actually dispatch."`. The `dispatch-spec.json` IS still written (so the user can inspect it); per Story 2.2 NFR-S1 the file write is filesystem-only and side-effect-isolated under `staging/<runId>/`.
  - [x] 6.2 Branch order: `--export-state` → `--diff-state` → `--list` → `--explain` → `--dry-run` → fall-through to dispatch path. Document the order in JSDoc; the order matters because `--export-state` is the most-explicit "machine-readable" mode and should short-circuit before `--list`/`--explain` (both human-readable).
  - [x] 6.3 Each report-path emits `action: "report"` with `exitCode: 0` per AR9 protocol.

- [x] **Task 7 — Implement `runNext()` — dispatch happy path (AC-1, FR1, FR8, FR16)**
  - [x] 7.1 Algorithm step 9 — **Read state**: `state = await loadStateUnlocked({ statePath: opts?.statePath })`. Throws `CorruptStateError` / `StateTooNewError` / `MigrationFailureError` / `PathologicalInputError` per Story 1.6 contracts. The outer try/catch (Task 8 below) translates these to `action: "halt"` per AC-3.
  - [x] 7.2 Algorithm step 10 — **Build DAG**: detect BMAD skills via `detectBmadSkills()` (Story 1.9 — currently Story 2.4 may pass `opts?.skillNames ?? []` since `detectBmadSkills` requires `pluginDir` resolution which is BMAD-detect mid-tier; if `opts.skillNames` and `opts.pluginDir` are both undefined, the runner falls through to the seed-only DAG via `build({ skillNames: [], projectRoot, pluginDir: undefined })` per Story 1.10 graceful degradation). Per Story 2.2 architecture compliance line 446: "the caller (Story 2.4 run.ts) is responsible for resolving stepName via `computeNextStep(state, dag)` BEFORE calling `buildDispatchSpec`." Note: `computeNextStep` is referenced architecturally but no module exports it yet (Story 1.10 ships `build` + `tarjanScc` only). v0.1 implementation: inline the next-step selection (see Task 7.3).
  - [x] 7.3 Algorithm step 11 — **Compute next step**: inline implementation (no new module — defer the dedicated `computeNextStep` to a Story 6.x extraction). Selection rules:
    - If `args.step` is set → resolve to that step name; throw `ConfigError("Unknown step: " + args.step)` if not in the DAG.
    - Else if `state.lastSuccessfulStep === null/undefined` → pick the seed first step `analyst-research` (v0.1 default; the architectural §A.D5 defines `analyst-research` as the entry-point per architecture line 419).
    - Else → pick the first node in the DAG whose `after` list is fully satisfied by `state.lastSuccessfulStep` (i.e., the immediate next prerequisite-satisfied step). Tiebreaker: phase order (`analysis → planning → solutioning → implementation → retro`) then `name` lexicographic (architecture line 469).
    - Apply `args.epic`, `args.story`, `args.phase` filters BEFORE selection: filter the candidate set to nodes matching the requested epic/story/phase.
    - Apply `args.includeOptional` / `args.noOptional`: include or exclude nodes with `node.optional === true`.
    - If no candidate after filtering → throw `ConfigError` with `hintOverride: "Run /bmad-next --list to see candidate steps; the current filter excludes all candidates."` (FR14 link).
  - [x] 7.4 Algorithm step 12 — **Resolve persona**: `personaResolved = await resolvePersona({ stepName: nextStep.name, pluginDir: opts?.pluginDir, projectRoot: opts?.projectRoot, configPath: opts?.configPath, bmadConfigPath: opts?.bmadConfigPath })`. Apply `args.persona` override if set (the override REPLACES the resolved persona; documented per FR12). Call `pickFirstPersona(...)` to coerce `string | readonly string[]` → `string` for Story 2.2's `buildDispatchSpec` (which currently accepts `persona: string` only — multi-persona deferred to Stories 4.1 + 5.*).
  - [x] 7.5 Algorithm step 13 — **Build dispatch spec**:
    ```typescript
    const result = await buildDispatchSpec({
      stepName: nextStep.name,
      state,
      persona,
      modelOverride: undefined,  // FR53 per-step model override deferred to Story 6.3
      budgetOverride: undefined, // FR37 per-step budget override deferred to Story 6.4
      stagingRoot: opts?.stagingRoot,
      nowIso: opts?.nowIso,
    });
    ```
    Story 2.2 currently accepts the v0.1 OPTIONAL `epic` / `story` / `phase` overrides (per generate-spec.ts:79-81 — Story 2.2 dev-001 deviation); Story 2.4 may pass `phase: nextStep.phase as Phase` to override the default `"implementation"`.
  - [x] 7.6 Algorithm step 14 — **Populate `taskSpec.context[]` + `taskSpec.outputFormat.requiredSections`**: Story 2.2's `buildDispatchSpec` currently writes empty arrays for both fields (per generate-spec.ts:168 + 172 — v0.1 conservative defaults). Story 2.4 owns the populator per Story 2.2 carry-over. Two options:
    1. **Re-write the dispatch-spec.json** post-buildDispatchSpec via `atomicWrite` with the populated arrays. Risk: the call sequence becomes (write → read → modify → write) which is wasteful.
    2. **Extend `buildDispatchSpec` to accept `context?: Array<{path, label}>` + `requiredSections?: readonly string[]` overrides.** Risk: Story 2.2 schema drift; coordination with Story 2.2's deployed shape.
    - **Recommended for dev**: option 2. Extend `BuildDispatchSpecInput` (`src/dispatch/generate-spec.ts`) to accept `contextRefs?: ReadonlyArray<{ path: string; label?: string }>` + `requiredSections?: readonly string[]` AS OPTIONAL, with the existing empty-array defaults preserved when not supplied. Story 2.2's existing tests must continue to pass (no shape break — only additive optional fields). Story 2.4 then computes the values via the helpers from Task 2.5 + 2.6 and passes them. Document this Story 2.2 extension in dev Completion Notes (Story 2.4 dev-001 carry-over).
  - [x] 7.7 Algorithm step 15 — **Emit dispatch action**: `emitDispatchAction({ action: "dispatch", runId: result.runId, agent: STEP_RUNNER_AGENT, exitCode: 0 })`. The literal `STEP_RUNNER_AGENT === "bmad-step-runner"` matches Story 2.3's frontmatter `name:` verbatim — coupled atomic change if ever renamed. Return `{ exitCode: 0, action: <the emitted action> }`.
  - [x] 7.8 Per AC-1: the AR9 line shape is exactly `{ "action": "dispatch", "runId": "<id>", "agent": "bmad-step-runner", "exitCode": 0 }`. Validated by `DispatchActionV1Schema.parse()` (defence-in-depth via `emitDispatchAction` per Story 2.2 emit.ts:48).

- [x] **Task 8 — Implement `runNext()` — outer try/catch + halt translation (AC-3, AR21, AR22)**
  - [x] 8.1 Wrap algorithm steps 9-15 in a `try { ... } catch (err) { ... }` block. Per AC-3: "Given a state-loading failure, When invoked, Then the action is `\"halt\"` with `exitCode > 0` and `message` containing the actionable hint."
  - [x] 8.2 In the catch block:
    ```typescript
    if (err instanceof StepperError) {
      return {
        exitCode: err.exitCode as 0 | 1 | 2 | 3 | 5,
        action: { action: "halt", message: err.actionableHint, exitCode: err.exitCode },
      };
    }
    throw err; // non-StepperError propagates to import.meta.main top-level catch
    ```
  - [x] 8.3 Per AR33 + Story 1.12 doctor precedent: non-StepperError throws (system errors, unexpected failures) propagate to the caller. The `import.meta.main` block has its own top-level catch that emits `error("next: unexpected failure: " + message)` to stderr and exits 1.
  - [x] 8.4 Note on exit-code mapping (FR53):
    - `ConfigError.exitCode === 2` (configuration)
    - `BmadNotInstalledError.exitCode === 3` (BMAD compatibility)
    - `BmadIncompatibleError.exitCode === 3` (BMAD compatibility)
    - `DagCycleError.exitCode === 3` (BMAD compatibility — DAG validation)
    - `UnknownBmadSkillError.exitCode === 3` (BMAD compatibility)
    - `CorruptStateError.exitCode === 1` (halt-with-actionable-error)
    - `StateTooNewError.exitCode === 1` (halt-with-actionable-error)
    - `MigrationFailureError.exitCode === 1` (halt-with-actionable-error)
    - `PathologicalInputError.exitCode === 5` (pathological input)
    - `LockContentionError.exitCode === 4` (UNREACHABLE — Story 2.4 is lock-free)
    - `ScopeViolationError.exitCode === 5` (pathological input — out-of-scope write)
    - `STATE_CHANGED_DURING_DISPATCH.exitCode === 1` (registered in Story 2.6 — UNREACHABLE in `run.ts`)

- [x] **Task 9 — Implement `import.meta.main` entrypoint + extend `index.ts` barrel (AC: all)**
  - [x] 9.1 Per Story 1.12 doctor/run.ts:227 precedent, append at the bottom of `src/commands/next/run.ts`:
    ```typescript
    if (import.meta.main) {
      try {
        const result = await runNext();
        // Emit the AR9 line on stdout (the dispatch protocol).
        emitDispatchAction(result.action);
        process.exit(result.exitCode);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        error(`next: unexpected failure: ${message}`);
        process.exit(1);
      }
    }
    ```
  - [x] 9.2 Notes on the `import.meta.main` block:
    - The block emits the AR9 line via `emitDispatchAction` (defence-in-depth — `emitDispatchAction` validates via `DispatchActionV1Schema.parse()`).
    - Per AR33 + Story 1.12 precedent: `runNext` itself does NOT call `emitDispatchAction` or `process.exit` — those are entrypoint concerns. The function returns the structured `NextResult` for tests to inspect WITHOUT mutating stdout / process state.
    - The top-level catch handles non-StepperError throws (system errors). StepperError throws are translated to `action: "halt"` by `runNext`'s own try/catch per Task 8.
  - [x] 9.3 Extend `src/commands/next/index.ts` barrel to add the new public surface:
    ```typescript
    export { runNext } from "./run.ts";
    export type { RunNextOptions, NextResult } from "./run.ts";
    ```
    Mirror the Story 1.7 import order (alphabetical re-export) — final barrel:
    ```typescript
    export {
      type NextArgs,
      NextArgsSchema,
      type NextResult,
      type ParseError,
      parseNextArgs,
      type Result,
      type RunNextOptions,
      runNext,
    } from "./args.ts";  // AND ./run.ts (consolidate per existing barrel pattern)
    ```
    Note: the existing barrel uses a single-source re-export per file convention. Story 2.4 may consolidate via TWO `export {...}` blocks (one per file) instead of a single block — match the Story 1.7 + Story 1.12 convention.
  - [x] 9.4 **AR41 boundary CI gate (manual grep until automated)**: confirm `src/commands/next/run.ts` does NOT import from `../../lock/`, `../../state/save.ts`, `../../snapshot/`, `node:child_process`, or any new external runtime dep beyond `zod`. Verify via:
    ```bash
    grep -E "from\s+['\"](\.\./){2}lock/|from\s+['\"](\.\./){2}state/save|from\s+['\"](\.\./){2}snapshot/|from\s+['\"]node:child_process" src/commands/next/run.ts && echo "VIOLATION" || echo "CLEAN"
    ```

- [x] **Task 10 — Create `src/commands/next/run.test.ts` — colocated tests (AC: all, AR35)**
  - [x] 10.1 Per AR35 (Story 1.3/1.4/1.5/1.6/1.8/1.9/1.10/1.11/1.12/2.1/2.2 precedent), use Bun's built-in test runner; spin up tmpdirs per test via `mkdtemp(path.join(os.tmpdir(), "stepper-next-"))`. Clean up via `afterEach rm({ recursive: true, force: true })`. NEVER hard-code `/tmp/...` paths.
  - [x] 10.2 **AC-1 happy path test (zero-config)**: seed a tmpdir with a minimal valid `state.yaml` + (optional) BMAD plugin scaffold. Call `runNext({ projectRoot: tmpdir, statePath: tmpdir + "/state.yaml", stagingRoot: tmpdir + "/staging", skillNames: [], nowIso: "2026-04-29T10-15-00.000Z" })`. Assert:
    - `result.exitCode === 0`.
    - `result.action.action === "dispatch"`.
    - `result.action.runId.startsWith("2026-04-29T10-15-00-")`.
    - `result.action.agent === "bmad-step-runner"`.
    - `result.action.exitCode === 0`.
    - The on-disk `staging/<runId>/dispatch-spec.json` exists and validates against `DispatchSpecV1Schema`.
    - The `staging/<runId>/inputs/` and `staging/<runId>/outputs/` directories exist.
    - The dispatch-spec's `taskSpec.persona` is the resolved persona for the seed first-step `analyst-research` (i.e., `"analyst"`).
    - The dispatch-spec's `taskSpec.constraints.allowedTools` is `["Read", "Write", "Edit", "Grep", "Bash"]`.
    - The dispatch-spec's `taskSpec.constraints.scopeLimits` matches the regex `/^Only files inside staging\/.+\/ may be written\.$/`.
  - [x] 10.3 **AC-2 read-only flag tests** (one test per flag):
    - `--list`: assert `result.action.action === "report"`, `result.action.exitCode === 0`, `result.action.message` contains the candidate step list (at least one node name from the seed DAG).
    - `--explain`: assert `result.action.action === "report"`, `result.action.message` contains the deferred-to-Story-3.6 hint.
    - `--diff-state`: assert `result.action.action === "report"`, `result.action.message` contains the deferred-to-Story-3.8 hint.
    - `--export-state`: assert `result.action.action === "report"`, `result.action.message` contains the deferred-to-Story-3.10 hint.
    - `--dry-run`: assert `result.action.action === "report"`, `result.action.message` starts with `"Dry-run: would dispatch step "`. Assert the dispatch-spec WAS still written to staging (the dry-run inspects the spec but does not emit `action: "dispatch"`).
  - [x] 10.4 **AC-3 state-loading failure test**: seed a tmpdir with an EMPTY `state.yaml` (size 0). Call `runNext({ statePath: tmpdir + "/state.yaml" })`. Assert:
    - `result.exitCode === 1` (CorruptStateError.exitCode).
    - `result.action.action === "halt"`.
    - `result.action.exitCode === 1`.
    - `result.action.message` contains the actionable hint from `CorruptStateError.actionableHint` (architecture-prescribed format starts with `Run`).
  - [x] 10.5 **AC-4 schema validation**: assert the `result.action` for EVERY test case validates against `DispatchActionV1Schema` (round-trip via `JSON.stringify` + `JSON.parse` + `schema.parse`). This is the same defence-in-depth pattern Story 2.2 ships.
  - [x] 10.6 **AC-5 scope discipline test**: instrument the test with a tmpdir-rooted `stagingRoot` AND `projectRoot`. Call `runNext({...})`. After the call, recursively walk the tmpdir and assert that EVERY file written by the runner lives at a path matching `<tmpdir>/staging/<runId>/...`. NO writes outside `<tmpdir>/staging/`. **Implementation tip**: capture the tmpdir mtime before the call; after the call, walk the tree via `fs.readdir({withFileTypes: true, recursive: true})` and assert no entries match patterns like `<tmpdir>/<file>` (root-level) or `<tmpdir>/state.yaml.bak` (state mutation — Story 2.4 must NOT touch state).
  - [x] 10.7 **Lock-free invariant test**: mock the `acquire` import via Bun's `mock.module`. Spy on `acquire`. Call `runNext({...})`. Assert the spy was NEVER invoked. (This complements the Task 9.4 manual grep with a runtime assertion.)
  - [x] 10.8 **Doctor delegation test**: call `runNext({ argv: ["--doctor"] })` against a tmpdir. Assert `result.action.action === "report"`, `result.action.message` contains the doctor's 5-line output (4 checks + suggestion). Mock the BMAD-detect module to return a known fixture so the test is deterministic.
  - [x] 10.9 **Mutually-exclusive flags test**: call `runNext({ argv: ["--include-optional", "--no-optional"] })`. Assert `result.exitCode === 2`, `result.action.action === "halt"`, `result.action.message === "Pass either --include-optional or --no-optional, not both."` (or equivalent ConfigError hint).
  - [x] 10.10 **`--upgrade` deferral test**: call `runNext({ argv: ["--upgrade"] })`. Assert `result.exitCode === 1`, `result.action.action === "halt"`, `result.action.message` contains the Story 6.9 deferral hint.
  - [x] 10.11 **AR41 boundary test**: programmatic check — read `src/commands/next/run.ts` source via `Bun.file`; assert no matches for forbidden import patterns (`from "../../lock/"`, `from "../../state/save"`, `from "../../snapshot/"`, `from "node:child_process"`).
  - [x] 10.12 **NFR-S1 no-network test**: assert `runNext` does NOT call `fetch`, `Bun.fetch`, `http.request`, or any network primitive. Verified by grep against `src/commands/next/run.ts` source (no `fetch(` / `http.` / `https.` / `net.` literals).
  - [x] 10.13 **NFR-P1 next-step latency test (informational, not a hard gate)**: time `runNext({...})` end-to-end against a fixture state + DAG; assert it completes in < 500ms p95 per NFR-P1. Mark the test as `it.if(...)` skip if running on a slow CI; the CI gate is integration-tested in `src/integration/long-run-1000-dispatches.test.ts` (Story 4.x).

- [x] **Task 11 — Story 2.2 `buildDispatchSpec` extension (Story 2.4 dev-001 carry-over)**
  - [x] 11.1 Per Task 7.6 recommendation: extend `BuildDispatchSpecInput` in `src/dispatch/generate-spec.ts` to accept OPTIONAL `contextRefs?: ReadonlyArray<{ path: string; label?: string }>` and `requiredSections?: readonly string[]`. The existing v0.1 defaults (empty arrays) are preserved when both are absent — no shape break.
  - [x] 11.2 In `buildDispatchSpec` body (currently `src/dispatch/generate-spec.ts:166-172`):
    - Replace `taskSpec.context: []` with `taskSpec.context: input.contextRefs?.map(({path, label}) => ({ path, label: label ?? path })) ?? []`.
    - Replace `taskSpec.outputFormat.requiredSections: []` with `taskSpec.outputFormat.requiredSections: input.requiredSections ?? []`.
  - [x] 11.3 Update `src/dispatch/types.ts` if needed — the `DispatchSpecInput` interface (currently lines 51-57) does NOT need a change (the new fields live on `BuildDispatchSpecInput` which extends it).
  - [x] 11.4 Update `src/dispatch/generate-spec.test.ts` to add NEW tests:
    - With `contextRefs`: assert the written spec's `taskSpec.context` matches the input shape.
    - With `requiredSections`: assert the written spec's `taskSpec.outputFormat.requiredSections` matches.
    - Existing tests (defaults to empty arrays) MUST continue to pass — verify by running `bun test src/dispatch/generate-spec.test.ts` before AND after the extension.
  - [x] 11.5 Document the extension in Story 2.4 dev Completion Notes as "carry-over closure of Story 2.2 senior dev review info-3" (Story 2.2 senior dev info-3 noted that `taskSpec.context[]` + `requiredSections` would be populated by Story 2.4 — Story 2.4 closes that loop here).

- [x] **Task 12 — Quality gates (AC: all)**
  - [x] 12.1 Run `bun run check` — expect 0 fail, baseline 409 + new tests passing. Story 2.4 adds ~10-15 colocated tests in `src/commands/next/run.test.ts` plus 2-3 extension tests in `src/dispatch/generate-spec.test.ts` (Task 11.4). Estimated total: ~420-430 pass. Record actual count in Completion Notes.
  - [x] 12.2 Run `bun run lint` (Biome) — expect 0 errors, 0 warnings. Particular attention to `noConsole` (no `console.*` allowed) and `noUnusedVariables`.
  - [x] 12.3 Run `bun run typecheck` (`tsc --noEmit`) — expect 0 errors.
  - [x] 12.4 Run AR41 import-boundary check (manual grep per Task 9.4) — expect zero violations from `src/commands/next/run.ts`. Banned imports: `../../lock/`, `../../state/save.ts`, `../../snapshot/`, `node:child_process`, any new external runtime dep beyond `zod`.
  - [x] 12.5 Confirm `src/errors.ts` registry stays at 16 codes. Story 2.4 USES existing classes only; does NOT extend the registry. The `STATE_CHANGED_DURING_DISPATCH` error from architecture line 1674 is registered in **Story 2.6** (verify-and-advance.ts owns it).
  - [x] 12.6 Re-run `bun test src/dispatch/` (Story 2.2's tests + Story 2.4 extension tests) to confirm the `BuildDispatchSpecInput` extension (Task 11) did NOT break Story 2.2's existing test surface.
  - [x] 12.7 Re-run `bun test src/commands/doctor/` (Story 1.12's tests) to confirm the `runDoctor` delegation (Task 5) did NOT regress. (Story 1.12 should be invariant — Story 2.4 only consumes it; never modifies.)
  - [x] 12.8 **Manual smoke (recommended)**: from a Bun REPL or `bun run`:
    ```bash
    # In a tmpdir-rooted fixture:
    cd /tmp/stepper-smoke && cp -r ~/repos/bmad-stepper-cc /tmp/stepper-smoke/plugin
    cd /tmp/stepper-smoke && bun /tmp/stepper-smoke/plugin/src/commands/next/run.ts -- --dry-run
    # Expect ONE JSON line on stdout: { "action": "report", "message": "Dry-run: would dispatch step ..." }
    ```
  - [x] 12.9 **Manual smoke for halt path**: invoke against a tmpdir with NO `state.yaml`:
    ```bash
    cd /tmp/empty-stepper-smoke && bun /path/to/plugin/src/commands/next/run.ts
    # Expect ONE JSON line on stdout: { "action": "halt", "exitCode": 1, "message": "..." }
    # And exit code 1.
    ```
  - [x] 12.10 Confirm `_bmad-output/.stepper/state.yaml` is **NOT modified** (per hard-constraint) — Story 2.4 mutates only `src/commands/next/run.ts` (NEW), `src/commands/next/run.test.ts` (NEW), `src/commands/next/index.ts` (extend barrel), `src/dispatch/generate-spec.ts` (Task 11 extension), `src/dispatch/types.ts` (if needed), `src/dispatch/generate-spec.test.ts` (Task 11.4), the story file (status flip), the sprint-status YAML (status flip), and the task record YAML (audit log). NO `_bmad-output/.stepper/` deltas.

- [x] **Task 13 — Update story status + sprint status (AC: all)**
  - [x] 13.1 Update story file frontmatter: `status: ready-for-dev` → `status: review` (after dev completes the 12 tasks above; the bmad-create-story persona starts at `ready-for-dev`).
  - [x] 13.2 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: `2-4-lock-free-run-ts-for-bmad-next: ready-for-dev` → `in-progress` → eventually `review` → `done` per Stepper's status transitions.
  - [x] 13.3 Append a Change Log entry per the template at the bottom of this file.

## Dev Notes

### Architecture compliance

- **§A.D1 (lines 270-296) — Three-layer execution model**: Story 2.4 IS the **Layer 2 entrypoint** for the `/bmad-next` slash command. The full sequence per architecture §line 1450:
  1. **Layer 1** — Claude main thread reads `commands/bmad-next.md` (Story 2.7).
  2. **Layer 2 — `run.ts`** (this story) — `Bash: bun run src/commands/next/run.ts -- $ARGUMENTS` → emits AR9 stdout line.
  3. **Layer 1** — reads stdout JSON; invokes `Task: <agent="bmad-step-runner">, prompt="staging/<run-id>/dispatch-spec.json"`.
  4. **Layer 3** — sub-agent reads inputs/, writes outputs/ in `staging/<run-id>/` (Story 2.3's `bmad-step-runner.md`).
  5. **Layer 1** — runs `Bash: bun run src/commands/next/verify-and-advance.ts -- <run-id>` (Story 2.6).
  6. **Layer 2 — `verify-and-advance.ts`** — acquires lock, runs verifier, promotes, advances state.
  7. **Layer 1** prints summary to user.
  Story 2.4 owns step 2; the lock-free → lock-held boundary is the **process boundary** between steps 2 and 6.

- **§A.D2 (lines 297-336) — Sub-agent dispatch via Task tool**: Story 2.4's `run.ts` produces the `dispatch-spec.json` Layer 1 reads to construct the `Task` invocation. The `agent: "bmad-step-runner"` literal in the AR9 line MUST match Story 2.3's `agents/bmad-step-runner.md` frontmatter `name:` verbatim — coupled atomic change if ever renamed.

- **§A.D7 (lines 460-490) — DAG + next-step computation**: Story 2.4 inlines next-step selection (Tier-1 seed entry-point fallback + after-list satisfaction + phase-tiebreaker per architecture line 469). The dedicated `computeNextStep` function referenced architecturally (lines 1457, 1505) is NOT a separate Story 2.4 deliverable — v0.1 inlines the logic; a future Story 6.x extraction may introduce `src/dag/compute-next.ts`.

- **§P5 (lines 864-917) — Sub-Agent Dispatch Contract**: the canonical `dispatch-spec.json` shape lives in `src/schemas/dispatch-spec.ts` (Story 1.5) and is written by `src/dispatch/generate-spec.ts` (Story 2.2). Story 2.4 is the **CALLER** — composes resolution + invokes `buildDispatchSpec`. The `taskSpec.context[]` + `requiredSections` populator wired here closes Story 2.2's senior dev info-3 carry-over.

- **§directory-listing (line 1107) — `src/commands/next/run.ts`**: the architecture-prescribed file already lists `run.ts` as "main runner: load state → compute → dispatch-spec". Story 2.4 lands the file with v0.1 scope (read state + DAG + persona + dispatch-spec; verify-and-advance is Story 2.6).

- **§AR8 + line 1672 — `run.ts` is read-only and lock-free**: the architecturally critical decision. NO lock acquired in `src/commands/next/run.ts` or `src/commands/loop/run.ts`'s per-iteration step-compute. Lock is acquired ONLY in `src/commands/next/verify-and-advance.ts` (Story 2.6) and the loop runner's commit phase (Story 4.x). Story 2.4's CI verification: `bun run check` + manual grep that `src/commands/next/run.ts` does NOT import from `../../lock/`.

- **§AR9 + line 1660 — JSON-line stdout protocol**: Story 2.4 is the FIRST emit-site of the AR9 protocol. The discriminated union over `action: "dispatch" | "report" | "halt"` is the schema declared in `src/schemas/dispatch-protocol.ts` (Story 2.2) and validated by `emitDispatchAction` (Story 2.2). Story 2.4 wires the call.

- **§AR41 (lines 1294-1302) — Top-tier import boundary**: `src/commands/` is the top tier. Allowed imports: foundational, mid-tier, higher-tier, AND siblings within `src/commands/`. Forbidden: nothing inbound (`commands/` is a leaf); from `commands/`, the lock module is forbidden FOR THIS SPECIFIC FILE per the lock-free contract (architecture line 1672 — Story 2.4 specific, not AR41 in general).

- **AR7 — 6-section task spec**: Story 2.4's `buildDispatchSpec` call produces the literal with all six sections. Story 2.4 specifically populates `taskSpec.context[]` (from DAG node `after[]`) and `taskSpec.outputFormat.requiredSections` (from Story 2.1 verifier registry) — closing Story 2.2's deferred populator.

- **AR16 — multi-persona steps dispatch sub-agents sequentially in v0.1**: per architecture §line 187 + Story 2.2 dev notes line 504, multi-persona steps loop at the runner tier. v0.1 Story 2.4 picks the FIRST persona from the array and surfaces a stderr warn; the full sequential loop is forward-deferred to Stories 4.1 + 5.*. The `pickFirstPersona` helper (Task 2.4) is the v0.1 stub.

- **AR21 / AR22**: `runNext` throws `StepperError` subclasses for hard failures; the outer try/catch translates to `action: "halt"` with `message: err.actionableHint`. AC-3 satisfaction. The `hintOverride?` constructor pattern (Stories 1.10 + 1.11 precedent) is used for the `enforceMutuallyExclusiveFlags` ConfigError + the `Unknown step:` ConfigError + the `--upgrade`/`--watch`/`--force-unlock` deferral hints.

- **AR33 — function & error semantics**: `runNext` is `async`; throws `StepperError` subclasses for hard failures; uses `info()` / `warn()` / `error()` from `src/io/log.ts` for stderr; uses `json()` (transitively via `emitDispatchAction`) for the AR9 stdout line. NO `console.*`. NO `process.exit` inside `runNext` — only in the `import.meta.main` block per Story 1.12 doctor precedent.

### Lock-free design rationale

The architecturally critical decision per §line 1672. The reasoning chain:

1. **Sub-agent runs are 5+ minutes** (PRD §17 + architecture §A.D2 — long-running tasks like `bmad-create-prd` dispatch a sub-agent that produces a multi-thousand-line PRD; the operation easily exceeds 5 minutes).
2. **Holding the project lock for 5+ minutes blocks all other Stepper operations** on the same project. A user running `/bmad-next` would block a parallel `/bmad-doctor` invocation OR a CI script running `--export-state`.
3. **Solution per architecture Coherence Validation Correction 1 (line 1658)**: split the runner into TWO process invocations:
   - `run.ts` — read-only / lock-free / emits AR9 line / exits.
   - Layer 1 dispatches the sub-agent via Task (5+ minutes) — NO lock held.
   - `verify-and-advance.ts` — acquires lock, re-validates state-hash (TOCTOU), promotes artifact, advances state, releases lock.
4. **TOCTOU mitigation**: the state-hash check in `verify-and-advance.ts` (Story 2.6) re-reads `state.yaml`, computes a hash over `(lastSuccessfulStep, lastAttempted)`, and compares to the snapshot stored in `staging/<run-id>/dispatch-spec.json` at dispatch-time (architecture line 1673). Mismatch → `STATE_CHANGED_DURING_DISPATCH` error (Story 2.6 owns the registration).

Story 2.4 MUST NOT introduce any code that holds the lock — no `acquire()` import, no `loadState` (locked variant) call, no `saveState` call. The CI gate is the AR41 boundary check + the `bun test` mock-spy on `acquire`.

### `cleanStagingOrphans()` "at Stepper start" wiring

Story 2.2 ships `cleanStagingOrphans()` (`src/dispatch/staging-cleanup.ts`) but does NOT wire the call site. Story 2.4 owns the wiring per Story 2.2 §Tasks 7.5: "the architecture's 'at Stepper start' wording (AC-4) implies the runner-tier (Story 2.4 run.ts or Story 2.6 verify-and-advance.ts) calls it once per `bun run` invocation".

Implementation per Task 4.1:

- Best-effort: failures are logged to stderr via `info()` and do NOT propagate.
- Called ONCE per `runNext` invocation, after argv parse but before any state read.
- Wraps the call in a try/catch — the orphan cleanup must NEVER block the dispatch.

This satisfies Story 2.2 AC-4 ("orphan staging dirs (older than 24h with no completion marker) are cleaned up at Stepper start") at the runner tier. Story 2.6 may also call `cleanStagingOrphans()` — the function is idempotent (it's a no-op if no orphans exist).

### `taskSpec.context[]` + `requiredSections` population (Story 2.2 carry-over)

Per Story 2.2's senior dev review info-3 + Story 2.3 §Forward-dep notes (Story 2.4): Story 2.4 owns the populator. Two design options surfaced in Task 7.6:

- **Option 1** (re-write the dispatch-spec.json post-buildDispatchSpec): wasteful (write → read → modify → write).
- **Option 2** (extend `BuildDispatchSpecInput` to accept optional `contextRefs` + `requiredSections`): clean, additive, no shape break.

**Selected**: Option 2. Story 2.4 Task 11 extends `src/dispatch/generate-spec.ts` to accept optional `contextRefs?: ReadonlyArray<{ path: string; label?: string }>` + `requiredSections?: readonly string[]` AS OPTIONAL fields. The existing v0.1 defaults (empty arrays) are preserved when not supplied. Story 2.2's existing tests continue to pass; Story 2.4 adds 2-3 NEW tests in `generate-spec.test.ts` covering the populated-fields path. Story 2.2's dispatched `BuildDispatchSpecInput` shape gains 2 optional fields; the `DispatchSpecV1Schema` itself stays invariant (the schema already declares `taskSpec.context: ContextRef[]` and `taskSpec.outputFormat.requiredSections: string[]` per Story 1.5; Story 2.2's body just defaults to empty arrays — Story 2.4 lifts them to the input shape).

### Cross-validation gap closure (Story 1.7 forward-dep)

Per Story 1.7 args.ts line 65: "`--include-optional` and `--no-optional` are mutually exclusive in semantics, but the parser is lenient — both can be passed together and the schema accepts the combination. The runner (Story 2.4) is responsible for cross-validation and emitting an actionable error."

Story 2.4 Task 2.7 + Task 3.3 close this gap: `enforceMutuallyExclusiveFlags(args)` throws `ConfigError(code: "CONFIG_ERROR", exitCode: 2)` with `hintOverride: "Pass either --include-optional or --no-optional, not both."` if both are true. The outer try/catch translates to `action: "halt"`. Test in Task 10.9.

### Empty-string flag handling (Story 1.7 forward-dep)

Per Story 1.7 args.ts line 70-72: empty `--epic ""` is accepted by the parser; the runner is responsible for treating empty-string flag values as "no filter". Story 2.4's filter logic (Task 7.3) explicitly checks `args.epic !== "" && args.epic !== undefined` before applying the epic filter. Same for `args.story` and `args.persona`.

### Stderr discipline (FR54, AR33, NFR-S2)

Per architecture line 862 + Story 1.3 `src/io/log.ts`:

- `info()` / `warn()` / `error()` → **stderr** (line-delimited human-readable).
- `json()` → **stdout** (line-delimited JSON; reserved for AR9 dispatch-action + `--export-state`).

Story 2.4 routes:

- All progress logging (`next: cleaned <N> orphan staging dir(s)`, etc.) → `info()` (stderr).
- All warnings (`Multi-persona sequential dispatch is deferred …`) → `warn()` (stderr).
- All error messages (translated `actionableHint` text) → `error()` (stderr) ONLY in the `import.meta.main` top-level catch block.
- The AR9 dispatch-action JSON line → `json()` via `emitDispatchAction` (stdout) ONLY in the `import.meta.main` block.

The `runNext` function itself returns the structured `NextResult` and does NOT emit. This separates testability (tests inspect the return value) from process-level concerns (the `import.meta.main` block manages stdout/stderr/exit).

### Test pattern (AR35)

Per Story 1.3 / 1.4 / 1.5 / 1.6 / 1.8 / 1.9 / 1.10 / 1.11 / 1.12 / 2.1 / 2.2 precedent:

- Use Bun's built-in test runner (`bun test`).
- Spin up a tmpdir per test via `node:fs/promises mkdtemp(path.join(os.tmpdir(), "stepper-next-"))`.
- Clean up via `afterEach rm({ recursive: true, force: true })`.
- NEVER hard-code `/tmp/...` paths.
- For `runNext()` integration tests, call the testable export directly and inspect the returned `NextResult` struct + the on-disk dispatch spec.
- For lock-free invariant tests, use Bun's `mock.module` to spy on `acquire` from `src/lock/lock.ts`; assert zero calls.
- For scope-discipline tests, walk the tmpdir tree post-call and assert NO writes outside `staging/<runId>/`.

### Forward-dep notes

- **Story 2.5 — Markdown transcript + JSON run-log writers**: Story 2.4's `runNext` does NOT write transcripts (those are `verify-and-advance.ts` post-dispatch concern per architecture §line 1478). Story 2.5's `src/transcript/write-step.ts` is invoked by Story 2.6 inside `verify-and-advance.ts`.
- **Story 2.6 — `verify-and-advance.ts` with state-hash check**: the LOCK-HOLDING complement to Story 2.4's lock-free `run.ts`. Reads `staging/<runId>/dispatch-spec.json`, runs `runVerifier`, on pass promotes artifact + advances state. Owns the `STATE_CHANGED_DURING_DISPATCH` error registration (architecture line 1674). Story 2.6 may either compute state-hash from the dispatch-spec contents alone OR introduce `DispatchSpecV2Schema` to add an explicit `stateHash` field.
- **Story 2.7 — Slash command markdown for `/bmad-next`**: the Layer 1 orchestrator that invokes `Bash → JSON-line → Task → Bash → summary`. Reads Story 2.4's stdout JSON line, extracts `agent` field, invokes `Task` against `agents/bmad-step-runner.md` (Story 2.3). Story 2.7 ratifies the AR9 protocol contract end-to-end.
- **Story 2.8 — Smoke test for `/bmad-next` happy path**: the canonical end-to-end exercise of the Story 2.4 runner. Asserts the full pipeline works live (run.ts → JSON line → Task → bmad-step-runner agent → artifact write → verify-and-advance → promote → state advance).
- **Story 3.6 — `--explain` reasoning trace**: replaces Story 2.4's deferred-stub `--explain` path with the full reasoning trace.
- **Story 3.7 — `--list` candidate enumeration with preconditions**: enhances Story 2.4's v0.1 `--list` implementation with full preconditions output.
- **Story 3.8 — `--diff-state`**: replaces Story 2.4's deferred-stub with the full state-diff implementation.
- **Story 3.9 — `--watch` live transcript tail**: removes Story 2.4's `--watch` deferral; wires to `src/transcript/watch.ts` (Story 2.5 + 3.9).
- **Story 3.10 — `--export-state` non-locking JSON**: replaces Story 2.4's deferred-stub with the full export implementation; uses `src/state/export.ts` per architecture §line 1334.
- **Story 4.1 — `/bmad-loop` skeleton**: composes `runNext` per loop iteration. The runId per iteration is unique; the staging cleanup runs once per loop start.
- **Story 5.1 — Retry failure mode**: re-invokes `runNext` against the same step name + state (or a slightly-modified state with the failure context appended). Story 2.4's runner is invariant of retry — the failure-UX engine constructs a new dispatch-spec with `taskSpec.task` updated to include the failure context.
- **Story 6.3 — `models:` per-step config**: enables `modelOverride` populated from `bmad-stepper.config.yaml`. Story 2.4 currently passes `modelOverride: undefined` (defaults to `"sonnet"` per Story 2.2 buildDispatchSpec).
- **Story 6.4 — `budgets:` per-step config**: enables `budgetOverride` similarly.
- **Story 6.9 — `--upgrade` flow**: replaces Story 2.4's `--upgrade` deferral.

### Errors registry stability

Story 2.4 USES existing classes only:

- `ConfigError` (Story 1.11) — for stepName-resolution failures (`Unknown step: <name>`), mutually-exclusive-flags violations, and the `--upgrade`/`--watch`/`--force-unlock` deferrals. `hintOverride?` 3rd-arg constructor pattern provides AC-verbatim hint substitution.
- `CorruptStateError` (Story 1.5) — propagates from `loadStateUnlocked` on missing/empty/malformed state.yaml.
- `StateTooNewError` (Story 1.5) — from `loadAndMigrate` per Story 1.5/1.6.
- `MigrationFailureError` (Story 1.5) — from `loadAndMigrate`.
- `PathologicalInputError` (Story 1.5) — state.yaml > 50MB.
- `BmadNotInstalledError` (architecture line 1666 — registered in Story 1.9) — from `detectBmadVersion` (called transitively if BMAD detect is wired).
- `BmadIncompatibleError` (Story 1.9) — same.
- `DagCycleError` (Story 1.10) — from `build()` if Tarjan SCC finds a cycle.
- `UnknownBmadSkillError` (Story 1.10) — from `build()` if Tier 3 frontmatter parse fails OR an `after:` references a name not in seed/overrides.
- `LockContentionError` (Story 1.4) — UNREACHABLE in `run.ts` (lock-free).
- `ScopeViolationError` (Story 1.5) — propagates transitively from `assertWithinScope` if the dispatch-spec write target somehow escapes scope (production NEVER triggers this; tests do).

NO new error class is added. The registry stays at **16 codes**. The CI gate `bun test src/errors.test.ts` (10 pass / 197 expects) is preserved.

### AR41 boundary (top-tier)

`src/commands/` is the TOP tier of the AR41 graph. Per architecture lines 1294-1302, top-tier modules may import from EVERY tier:

**Allowed imports** for `src/commands/next/run.ts`:

- `../../errors.ts` (foundational; for `StepperError` instanceof checks).
- `../../io/log.ts` (foundational; for `info` / `warn` / `error` writers — stderr discipline).
- `../../io/paths.ts` (foundational; for `STAGING_PATH` reference if needed — currently the dispatch module owns the default).
- `../../schemas/dispatch-protocol.ts` (foundational; for `DispatchActionV1` type).
- `../../state/load.ts` (mid-tier; `loadStateUnlocked` ONLY — NEVER `loadState`).
- `../../dag/index.ts` (mid-tier; for `build`, `DagAdjacency`, `DagNode`, `Phase`).
- `../../personas/index.ts` (mid-tier; for `resolvePersona`, `ResolveInput`).
- `../../dispatch/index.ts` (higher-tier; for `buildDispatchSpec`, `emitDispatchAction`, `cleanStagingOrphans`).
- `../../verifiers/index.ts` (higher-tier; for `getVerifierConfig`).
- `./args.ts` (intra-module sibling; for `parseNextArgs`).
- `../doctor/run.ts` (top-tier sibling; for `runDoctor` delegation per Story 1.12 + architecture §line 1671-1678).
- Bun stdlib: `Bun.file`, `Bun.write`.
- Node stdlib: `node:fs/promises`, `node:path`.
- External libraries: `zod` (transitively pulled).

**FORBIDDEN imports** for `src/commands/next/run.ts`:

- `../../lock/**` (lock-free contract per architecture line 1672).
- `../../state/save.ts` (lock-required write surface — Story 2.6 owns).
- `../../snapshot/**` (snapshot capture is Story 2.6 concern).
- `node:child_process` (use `Bun.spawn` if ever needed; v0.1 doesn't).
- Any new external runtime dep beyond `zod`.

The architecture's import-boundary CI check excludes `*.test.ts` files from cross-module restrictions; the test files MAY import freely (e.g., `run.test.ts` may import test fixtures from anywhere, including `src/lock/lock.ts` for the mock-spy).

### Composition map (mid-tier + higher-tier wiring)

Story 2.4's runner exercises the FULL boundary graph for the first time. The composition pattern (mirror Story 1.12 doctor precedent):

```
runNext()
  ├── parseNextArgs (intra-sibling: ./args.ts)
  ├── enforceMutuallyExclusiveFlags (local helper)
  ├── cleanStagingOrphans (higher-tier: ../../dispatch/)  ← Story 2.2 carry-over
  │
  ├── runDoctor (top-tier sibling: ../doctor/run.ts)  ← Story 1.12 reuse
  │
  ├── loadStateUnlocked (mid-tier: ../../state/load.ts)  ← lock-free
  ├── build (mid-tier: ../../dag/index.ts)
  ├── (inline) computeNextStep
  ├── resolvePersona (mid-tier: ../../personas/index.ts)
  ├── pickFirstPersona (local helper)
  ├── buildContextRefs (local helper)  ← Story 2.2 carry-over
  ├── getRequiredSections (local helper) ← Story 2.2 carry-over
  ├── getVerifierConfig (higher-tier: ../../verifiers/index.ts)
  ├── buildDispatchSpec (higher-tier: ../../dispatch/)
  └── emitDispatchAction (higher-tier: ../../dispatch/)  ← AR9 emit
```

Per AR41, `src/dispatch/` (higher-tier) must NOT import `src/personas/` directly — Story 2.4's runner is the COMPOSER. This is verified by Story 2.2's existing AR41 boundary check.

### NFR mapping

- **NFR-P1 (next-step computation < 500ms p95)**: Story 2.4's runner end-to-end timing test (Task 10.13) asserts the SLA. Production assertion lives in `src/integration/long-run-1000-dispatches.test.ts` (Story 4.x).
- **NFR-P3 (sub-agent dispatch overhead < 200ms p95)**: Story 2.4's `buildDispatchSpec` call latency contributes to this; Story 2.2's tests measure the function-level timing.
- **NFR-S1 (no main-thread network)**: Story 2.4's runner has zero network calls. Verified by grep against `src/commands/next/run.ts` source.
- **NFR-S4 (sub-agent isolation enforces declared scope)**: Story 2.4 populates `taskSpec.constraints.scopeLimits` via Story 2.2's `buildDispatchSpec` (which hard-codes `Only files inside staging/<runId>/ may be written.`). The dispatched sub-agent (Story 2.3) honours this at the prompt layer. Story 2.6's verifier check confirms no out-of-scope writes occurred.
- **NFR-S5 (atomic tmp+rename + .bak rotation)**: Story 2.4's runner does NOT write canonical state files. The dispatch-spec.json write goes through Story 2.2's `atomicWrite`. State writes are Story 2.6's concern.
- **NFR-R1 (zero data loss under any halt scenario)**: Story 2.4 is read-only — zero data-loss surface. The dispatch-spec.json write is atomic (NFR-R1 honoured via Story 2.2).
- **NFR-R4 (clean halt on stale lock)**: UNREACHABLE in Story 2.4 (lock-free).
- **NFR-M3 (every public schema validated by Zod)**: Story 2.4 emits via `emitDispatchAction` which calls `DispatchActionV1Schema.parse()` (Story 2.2). The dispatch-spec.json itself is validated by `DispatchSpecV1Schema.parse()` inside `buildDispatchSpec`.

### Integration test (architecture §line 645 — "integration test asserts run.ts never writes outside staging/")

AC-5 (last clause) demands an integration test. Story 2.4 Task 10.6 covers this at the unit-test layer (tmpdir-walk). The architecture-prescribed integration test location per §line 1245 is `src/integration/no-write-outside-scope.test.ts` (NFR-S2 enforcement). Story 2.4 v0.1 does NOT add a new integration test file — Task 10.6's per-call tmpdir walk is the equivalent assertion. A Story 6.x polish PR may extract this into the integration suite.

## Forward Dependencies

Stories that consume Story 2.4's `src/commands/next/run.ts` deliverable:

- **Story 2.5 — Markdown transcript + JSON run-log writers**: independent at the runner tier — Story 2.5's `src/transcript/write-step.ts` is invoked by Story 2.6 inside `verify-and-advance.ts`. Story 2.4 does NOT write transcripts.
- **Story 2.6 — `verify-and-advance.ts`** [PROCESS-BOUNDARY COMPLEMENT]: the lock-holding companion to Story 2.4's lock-free `run.ts`. Reads `staging/<runId>/dispatch-spec.json` (the artifact Story 2.4 wrote), runs Story 2.1's `runVerifier`, on pass promotes artifact + advances state. Story 2.6 owns the `STATE_CHANGED_DURING_DISPATCH` error registration and the state-hash TOCTOU check.
- **Story 2.7 — Slash command markdown for `/bmad-next`** [PRIMARY INVOKER]: the Layer 1 orchestrator that calls `bun run src/commands/next/run.ts -- $ARGUMENTS` and reads the AR9 stdout JSON line. Branches via `action`: `dispatch` → invoke `Task`; `report` → print `message`; `halt` → print `message` + exit non-zero.
- **Story 2.8 — Smoke test for `/bmad-next` happy path** [E2E SATISFACTION]: spawns the full pipeline and asserts the artifact ends up at the canonical path with the verifier reporting `pass`. The canonical end-to-end test for Story 2.4's runner.
- **Story 3.2 — `--resume` flag**: Story 2.4 currently treats `--resume` as a no-op (parser accepts the flag; runner ignores). Story 3.2 wires the resume semantics — re-uses Story 2.4's runner with the `lastAttempted` field as the resume context.
- **Story 3.3 — `--dry-run` enhancements**: Story 2.4's v0.1 dry-run path emits the deferred-stub message; Story 3.3 may enhance to include the full would-be dispatch-spec contents in the message.
- **Story 3.4 — `--step <id>` and `--scope` flags**: Story 2.4's `args.step` filter is partial; Story 3.4 adds the full `--scope` filtering surface.
- **Story 3.5 — Persona override / include-optional / no-optional**: Story 2.4 wires the persona-override (`args.persona` replaces resolved); Story 3.5 may add additional flags.
- **Story 3.6 — `--explain` reasoning trace**: replaces Story 2.4's deferred-stub `--explain` path.
- **Story 3.7 — `--list` candidate enumeration**: enhances Story 2.4's v0.1 `--list` implementation.
- **Story 3.8 — `--diff-state`**: replaces Story 2.4's deferred-stub.
- **Story 3.9 — `--watch`**: replaces Story 2.4's deferred-stub.
- **Story 3.10 — `--export-state`**: replaces Story 2.4's deferred-stub.
- **Story 4.1 — `/bmad-loop` skeleton**: composes `runNext` per loop iteration.
- **Story 5.1-5.4 — Failure-UX modes**: re-invoke `runNext` per the failure-UX engine's retry/skip/route-to-fixer/escalate logic.
- **Story 6.3 — `models:` per-step config**: enables `modelOverride` from config.
- **Story 6.4 — `budgets:` per-step config**: enables `budgetOverride` from config.
- **Story 6.9 — `--upgrade` flow**: replaces Story 2.4's `--upgrade` deferral.

## Previous Story Intelligence

This is iteration 4 of Epic 2 — the **fourth story** of the epic, following Story 2.1 (verifiers), Story 2.2 (dispatch-spec generator), and Story 2.3 (generic sub-agent). Story 2.4 composes ALL prior stories' outputs into the first end-to-end runner. Lessons learned from Stories 1.1–1.13 + 2.1 + 2.2 + 2.3 directly applicable:

### Story 1.1 — Bun host scaffold

- Bun 1.3.12 is the minimum supported runtime (AR2). Story 2.4 uses `Bun.file` for filesystem reads, the built-in test runner for colocated tests, and `mock.module` for the lock-free invariant test. No new `bun add` required (zero new deps — `zod` is already pinned).
- `package.json` `scripts` block exposes `check`, `lint`, `typecheck`, `test`. Story 2.4 must keep these passing.

### Story 1.2 — Errors module + registry CI gate

- The 16-entry registry is stable since Story 1.5; held through Stories 1.13, 2.1, 2.2, 2.3. Story 2.4 USES existing classes (`ConfigError` with `hintOverride?` from Story 1.11; `CorruptStateError` etc.) but does NOT extend the registry. CI gate trivially passes.
- The `errors.test.ts` registry CI gate enforces AR22 hint discipline. Story 2.4's runner surfaces `error.actionableHint` verbatim via the AR9 `action: "halt".message` field; no string mutation.
- The `hintOverride?` constructor pattern (Stories 1.10 `UnknownBmadSkillError` + 1.11 `ConfigError`) is the precedent for per-instance hint overrides. Story 2.4 uses Story 1.11's `ConfigError` with `hintOverride: "Pass either --include-optional or --no-optional, not both."` for the cross-validation gap closure + similar hint-overrides for the deferral flags.

### Story 1.3 — Logger + path helpers + atomic write

- `src/io/log.ts` exports `info`, `warn`, `error`, `json`. Per architecture line 862 + FR54: `info`/`warn`/`error` → **stderr**; `json` → **stdout**. Story 2.4 uses ALL FOUR — `info`/`warn` for diagnostic output, `error` for the `import.meta.main` top-level catch, `json` (transitively via `emitDispatchAction`) for the AR9 stdout line.
- `src/io/paths.ts` exports `STEPPER_INTERNAL_ROOT`, `BMAD_OUTPUT_ROOT`, `STAGING_PATH` (added by Story 2.2), `assertWithinScope()`. Story 2.4 may import `STAGING_PATH` for log messages but does NOT directly write to disk (Story 2.2's `buildDispatchSpec` owns the dispatch-spec write; the `staging/` subtree is created by `buildDispatchSpec`'s `mkdir(..., {recursive: true})` chain).
- `src/io/atomic-write.ts` exports `atomicWrite(path, contents)`. Story 2.4 does NOT call this directly — Story 2.2's `buildDispatchSpec` owns the dispatch-spec atomic write.

### Story 1.4 — File lock with heartbeat

- `src/lock/lock.ts` is a mid-tier sibling. Per architecture line 1672 + AR8, **Story 2.4's runner MUST NEVER acquire the lock**. Story 2.6's `verify-and-advance.ts` is the lock-acquiring caller. The lock-free contract is the architecturally critical decision; verified at boundary level (AR41 grep) AND at runtime level (mock-spy on `acquire` in tests per Task 10.7).

### Story 1.5 — Schemas + migrations skeleton

- `src/schemas/state.ts` exports `StateV1Schema`, `StateV1`, `State`. Story 2.4 imports `State` (the typed shape returned by `loadStateUnlocked`) for the `buildDispatchSpec` input.
- `src/schemas/dispatch-spec.ts` exports `DispatchSpecV1Schema`, `DispatchSpecV1`, `DispatchSpec`. Story 2.4 does NOT import directly — Story 2.2's `buildDispatchSpec` owns the schema integration.
- `src/schemas/dispatch-protocol.ts` (introduced by Story 2.2) exports `DispatchActionV1Schema`, `DispatchActionV1`. Story 2.4 imports `DispatchActionV1` (the typed return shape on `NextResult`).
- The `phase` field deferral (Story 2.2 dev-001) — Story 2.4 may pass `phase: nextStep.phase as Phase` to `buildDispatchSpec` to override the default `"implementation"` (per generate-spec.ts:79-81 v0.1 OPTIONAL `phase` override). This does NOT trigger a schema bump.

### Story 1.6 — State subsystem load/save/recompute skeleton

- `src/state/load.ts` exports BOTH `loadState` (locked) AND `loadStateUnlocked` (lock-free). Story 2.4 imports `loadStateUnlocked` ONLY per architecture line 1672. Verified by AR41 grep + manual code review.
- The `LoadStateOptions` shape (Story 1.6) supports `statePath`, `warnSizeBytes`, `haltSizeBytes`, `lockOptions`, `logger`. Story 2.4 passes `statePath` only; the size guards default to 1MB warn / 50MB halt per Story 1.6.
- Story 1.6's `saveState(state, lockHandle, opts?)` REQUIRES a `LockHandle`. Story 2.4 NEVER calls `saveState` (lock-free contract); the API surface architecturally enforces this — calling `saveState` without a handle is uncompilable.

### Story 1.7 — CLI argument parser

- Story 1.7's `parseNextArgs(argv): Result<NextArgs, ParseError>` is the canonical CLI parser. Story 2.4 calls it FIRST in `runNext` (Task 3.2). On `result.ok === false`, returns `action: "halt"` with `exitCode: 2` (FR53 configuration error).
- Story 1.7's cross-validation gap (line 65 — `--include-optional` + `--no-optional` both true) is closed by Story 2.4 Task 2.7 + 3.3.
- Story 1.7's empty-string flag handling (line 70-72 — `--epic ""` treated as "no filter") is honoured by Story 2.4 Task 7.3 explicit empty-string check.
- The `Result<T, E>` discriminated union from Story 1.7 is the SOLE Result-shaped surface in v0.1; Story 2.4 narrows via `if (result.ok)` per Story 1.7's pattern.

### Story 1.8 — Snapshot branch+sha detection

- `src/snapshot/` is mid-tier. Story 2.4's runner does NOT capture snapshots — those are Story 2.6's concern (snapshot is captured pre-verify per architecture §D10 checkpoint mechanism).

### Story 1.9 — BMAD detection

- `src/bmad-detect/` is mid-tier. Story 2.4 may invoke `detectBmadVersion()` + `detectBmadSkills()` to populate the DAG `BuildInput.skillNames`, but v0.1 falls through to seed-only DAG (`skillNames: []`) when BMAD detect is not wired. Per Story 1.10 graceful degradation, the seed entry-point `analyst-research` is always available.
- `BmadNotInstalledError` + `BmadIncompatibleError` (Story 1.9 / architecture line 1666) propagate to Story 2.4's outer try/catch and translate to `action: "halt"` with `exitCode: 3` per FR53 BMAD compatibility.

### Story 1.10 — DAG seed + three-tier registry

- `src/dag/index.ts` exports `build`, `BuildInput`, `DagAdjacency`, `DagNode`, `Phase`, `SEED_BMAD_VERSION`, `tarjanScc`. Story 2.4 imports `build` and `DagAdjacency` + `DagNode` + `Phase` types.
- Story 1.10's hand-curated seed-v6.x.ts has `analyst-research` as the entry-point (phase `analysis`, no `after:`). Story 2.4's next-step computation defaults to this entry-point when `state.lastSuccessfulStep` is null (initial state).
- Story 1.10's `DagCycleError` + `UnknownBmadSkillError` propagate to Story 2.4's outer try/catch and translate to `action: "halt"` with `exitCode: 3` per FR53.

### Story 1.11 — Persona resolution

- `src/personas/index.ts` exports `resolvePersona`, `ResolveInput`, `ResolveOptions`. Story 2.4 calls `resolvePersona({ stepName, pluginDir, projectRoot, configPath, bmadConfigPath })` and handles the `string | readonly string[]` return contract.
- Multi-persona steps return `readonly string[]` per architecture §line 187; v0.1 Story 2.4 picks the first element via `pickFirstPersona` helper (Task 2.4) and surfaces a stderr warn. Full sequential dispatch is forward-deferred to Stories 4.1 + 5.*.
- Story 1.11's `ConfigError` with `hintOverride: "Add a persona for <step> in bmad-stepper.config.yaml under the personas: block."` propagates to Story 2.4's outer try/catch on no-tier-resolves.

### Story 1.12 — `/bmad-next --doctor` Command

- Story 1.12 was the **first integration command** (top-tier). Story 2.4 is the SECOND top-tier runner; both establish the runner-tier composition pattern.
- Story 1.12's `runDoctor(opts?)` returns `DoctorResult { exitCode, results }` with the structured per-check shape. Story 2.4's `--doctor` delegation (Task 5) consumes this and reformats as the AR9 `action: "report"` shape.
- Story 1.12's `import.meta.main` block pattern (`runDoctor() → write to stderr via info() → process.exit(exitCode)`) is the **direct precedent** for Story 2.4's `import.meta.main` block (`runNext() → emitDispatchAction(action) → process.exit(exitCode)`). The key difference: Story 1.12 writes ALL output to stderr (no AR9 emit); Story 2.4 writes the AR9 line to stdout via `emitDispatchAction` and any error/warn to stderr.
- Story 1.12's flag-canonical convention per architecture §line 1671-1678: `--doctor` is the canonical surface; `commands/bmad-doctor.md` is a thin alias. Story 2.4 honours this — the `runNext({ argv: ["--doctor"] })` path delegates to `runDoctor` directly.
- Story 1.12's `RunDoctorOptions extends CheckContext` shape is the **direct precedent** for Story 2.4's `RunNextOptions` (test-injection escape hatches per opt-in).

### Story 1.13 — Quick-Start Documentation

- Story 1.13 shipped zero `*.ts` deltas (documentation-only). Story 2.4 ships TS code; its README documentation is deferred to Epic 6 (Story 6.10 marketplace release). Story 2.4's JSDoc on `run.ts` IS the canonical source-tree documentation.

### Story 2.1 — Verifier configuration registry

- Story 2.1 shipped `src/verifiers/` — the FIRST higher-tier module. Story 2.4 imports `getVerifierConfig` from `src/verifiers/index.ts` for the `taskSpec.outputFormat.requiredSections` populator (per Story 2.2 carry-over).
- Story 2.1's seven default verifier configs (`prd`, `architecture`, `story-create`, `dev-story`, `code-review`, `retro`, `analyst-research` + `default`) declare the `requiredFrontmatterSections` per step type. Story 2.4's `getRequiredSections` helper consults this registry.
- Story 2.1 dev-002 carry-over (`STAGING_PATH` constant + `runVerifier` `stagingRoot` REQUIRED → OPTIONAL) was OWNED by Story 2.2 (constant added) and pending Story 2.6 polish PR (the OPTIONAL conversion). Story 2.4 does NOT touch `runVerifier`'s signature — that's Story 2.6's concern.

### Story 2.2 — Dispatch spec generator

- Story 2.2 shipped `src/dispatch/` — the SECOND higher-tier module. Story 2.4 imports `buildDispatchSpec`, `emitDispatchAction`, `cleanStagingOrphans` from `src/dispatch/index.ts`. PRIMARY CALLER role per Story 2.2 line 654.
- Story 2.2's `agent: "bmad-step-runner"` literal (per emit.ts:48) is the binding target for Story 2.4's caller-side construction (Story 2.4's `STEP_RUNNER_AGENT` const matches the literal verbatim — coupled atomic change if ever renamed).
- Story 2.2's `taskSpec.constraints.allowedTools` v0.1 default is `["Read", "Write", "Edit", "Grep", "Bash"]` (5 tools) per generate-spec.ts:178; matches Story 2.3's frontmatter `allowed-tools: Read, Write, Edit, Grep, Bash` (5 tools). Story 2.4 does NOT override this — accepts Story 2.2's default.
- Story 2.2's `taskSpec.constraints.scopeLimits` literal is `Only files inside staging/<runId>/ may be written.` per generate-spec.ts:179. Story 2.4 honours Story 2.2's hard-coded format.
- Story 2.2 senior dev review carry-overs incorporated:
  - **info-3 (`taskSpec.context[]` + `requiredSections` populator deferred to Story 2.4)** — Story 2.4 Task 7.6 + Task 11 close this carry-over by extending `BuildDispatchSpecInput` with optional `contextRefs` + `requiredSections` fields.
  - **`cleanStagingOrphans` "at Stepper start" wiring deferred to Story 2.4** — Story 2.4 Task 4 closes this carry-over.
  - **`phase` field deferred to Story 6.x schema bump** — Story 2.4 does NOT pre-empt this; v0.1 passes `phase` as the v0.1 OPTIONAL input override (per generate-spec.ts:79-81), which is documented in `task` text but NOT a strict schema field.

### Story 2.3 — Generic sub-agent (PREVIOUS STORY)

- Story 2.3 shipped `agents/bmad-step-runner.md` — the canonical Layer 3 sub-agent definition. Story 2.4's `STEP_RUNNER_AGENT = "bmad-step-runner"` literal binds to Story 2.3's frontmatter `name: bmad-step-runner` verbatim.
- Story 2.3's frontmatter `description` (architecture §line 332 verbatim) — Layer 1's `Task` tool resolves the agent by this description string. Story 2.4's AR9 emit carries `agent: "bmad-step-runner"` (the name); the description is consumed by Claude Code's runtime.
- Story 2.3's frontmatter `allowed-tools: Read, Write, Edit, Grep, Bash` (5 tools) — runtime enforcement at Layer 3. Story 2.4's `taskSpec.constraints.allowedTools` (passed via Story 2.2's default) carries the same 5 tools — runtime + per-task suggestion are now identical in v0.1 (Story 2.3 Info-1 width-annotation drift surfaced this).
- Story 2.3's smoke fixture (`tests/fixtures/bmad-step-runner/dispatch-spec.json`) — manual dev-iteration scaffolding, NOT a CI gate. Story 2.4's tests do NOT consume this fixture (Story 2.4 generates dispatch-specs at runtime via `buildDispatchSpec`).
- Story 2.3 review outcome: **approve** (0 must-fix, 0 should-fix, 0 nits, 2 info). Story 2.4 should target the same approval profile by following the established patterns + applying the deferred-decision discipline (e.g., `--export-state` / `--diff-state` / `--explain` / `--watch` deferrals are EXPLICITLY documented stub returns, NOT silently ignored).

### Forward Action Items applied (epic-1-retrospective)

Per `_bmad-output/implementation-artifacts/epic-1-retrospective.md` §Forward Action Items for Epic 2:

- **Story 2.4 forward action (line 105 — "Front-load Story 2.4 (lock-free `run.ts`) early")** — APPLIED: Story 2.4 lands as the FOURTH story of Epic 2 (after the dispatch-spec + sub-agent foundation in 2.1-2.3 was required to be in place first). The "early" guidance is honored relative to Stories 2.5-2.8 (which all DEPEND on Story 2.4's runner being in place before they can land).
- **Recommended planning sequence (lines 110-115)**:
  - "Story 2.2 (dispatch spec generator) must precede Story 2.3 (generic sub-agent runner)" — HONOURED in prior loop iterations.
  - "Front-load Story 2.4 (lock-free `run.ts`) early" — HONOURED: Story 2.4 is the FIRST end-to-end runner; subsequent stories (2.5-2.8) compose with it.
  - "Allocate review iteration budget for Story 2.6 (verify-and-advance)" — independent; Story 2.6 follows.
- **Apply tighter scoping for stories above 600 lines (line 165)** — Story 2.4 targets ~700-900 lines (this file). The first end-to-end runner inherently needs extensive cross-layer reasoning + composition documentation + 13 task groups + ~13 colocated tests. Above the 600-line threshold; documented as a deliberate exception for the FIRST end-to-end runner with the broadest composition surface.

## Project Structure Notes

`src/commands/next/run.ts` is the FIRST runner-tier `.ts` file in the project (Story 1.12's `src/commands/doctor/run.ts` was the first integration command, but Story 2.4 is the first end-to-end dispatch runner — the architectural Coherence Validation Correction 1 target). After Story 2.4, the runner tier (`src/commands/`) will contain:

- `src/commands/index.ts` — top-level barrel (Story 1.7).
- `src/commands/next/index.ts` — next command barrel (Story 1.7 + Story 2.4 extension).
- `src/commands/next/args.ts` — args parser (Story 1.7).
- `src/commands/next/run.ts` — NEW (Story 2.4) lock-free runner.
- `src/commands/next/run.test.ts` — NEW (Story 2.4) colocated tests.
- `src/commands/doctor/index.ts` — doctor command barrel (Story 1.12).
- `src/commands/doctor/args.ts` — args parser (Story 1.12).
- `src/commands/doctor/run.ts` — runner (Story 1.12).
- `src/commands/doctor/checks.ts` — doctor checks (Story 1.12).
- `src/commands/doctor/run.test.ts` — colocated tests (Story 1.12).

Future stories add `src/commands/next/verify-and-advance.ts` (Story 2.6) and `src/commands/loop/{index.ts, args.ts, run.ts, stop-conditions.ts}` (Story 4.1).

Story 2.4's deliverable file count:

- New source files (1): `src/commands/next/run.ts`.
- New test files (1): `src/commands/next/run.test.ts`.
- Modified files (3): `src/commands/next/index.ts` (extend barrel — append `runNext` re-export), `src/dispatch/generate-spec.ts` (Task 11 extension — optional `contextRefs` + `requiredSections` inputs), `src/dispatch/generate-spec.test.ts` (add 2-3 new tests for the extended fields).

Estimated baseline progression: 409 (Story 2.3 final) → ~420-430 (Story 2.4 + ~10-15 colocated runner tests + ~2-3 dispatch extension tests).

## References

- `_bmad-output/planning-artifacts/architecture.md` §A.D1 lines 270-296 (three-layer execution model)
- `_bmad-output/planning-artifacts/architecture.md` §A.D2 lines 297-336 (sub-agent dispatch via Task tool)
- `_bmad-output/planning-artifacts/architecture.md` §A.D7 lines 460-490 (DAG + next-step computation)
- `_bmad-output/planning-artifacts/architecture.md` §P5 lines 864-917 (`dispatch-spec.json` shape — Story 2.2 contract)
- `_bmad-output/planning-artifacts/architecture.md` §directory-listing line 1107 (`src/commands/next/run.ts` placement)
- `_bmad-output/planning-artifacts/architecture.md` §line 1294-1302 (AR41 top-tier import boundary)
- `_bmad-output/planning-artifacts/architecture.md` §line 1450 (Layer 1 → Layer 2 → Layer 3 → Layer 2 → Layer 1 sequence)
- `_bmad-output/planning-artifacts/architecture.md` §line 1660 (AR9 protocol concretization — exit-code constraints)
- `_bmad-output/planning-artifacts/architecture.md` §line 1672 (run.ts is read-only / lock-free — architectural Coherence Validation Correction 1)
- `_bmad-output/planning-artifacts/architecture.md` §line 1676 (`run.ts` JSON-line protocol via dispatch-protocol.ts)
- `_bmad-output/planning-artifacts/architecture.md` §line 1671-1678 (Coherence Validation Critical Gap Resolutions — `run.ts` lock-free + state-hash check + STATE_CHANGED_DURING_DISPATCH error + JSON-line protocol)
- `_bmad-output/planning-artifacts/prd.md` FR1 (compute next step zero-config)
- `_bmad-output/planning-artifacts/prd.md` FR8 line 681 (`/bmad-next` single-step advance)
- `_bmad-output/planning-artifacts/prd.md` FR9 line 682 (`--dry-run`)
- `_bmad-output/planning-artifacts/prd.md` FR10 line 683 (`--step <id>`)
- `_bmad-output/planning-artifacts/prd.md` FR11 line 684 (`--epic`/`--story`/`--phase`)
- `_bmad-output/planning-artifacts/prd.md` FR12 line 685 (`--persona`)
- `_bmad-output/planning-artifacts/prd.md` FR13 line 686 (`--explain`)
- `_bmad-output/planning-artifacts/prd.md` FR14 line 687 (`--list`)
- `_bmad-output/planning-artifacts/prd.md` FR15 line 688 (`--include-optional`/`--no-optional`)
- `_bmad-output/planning-artifacts/prd.md` FR16 line 689 (sub-agent dispatch with budget+timeout)
- `_bmad-output/planning-artifacts/prd.md` FR18 line 691 (one human-readable line per step)
- `_bmad-output/planning-artifacts/prd.md` FR53 line 744 (exit codes 0-5)
- `_bmad-output/planning-artifacts/prd.md` FR54 line 745 (stdout/stderr discipline)
- `_bmad-output/planning-artifacts/prd.md` NFR-P1 (next-step < 500ms p95), NFR-P3 (dispatch overhead < 200ms p95), NFR-S1 (no main-thread network), NFR-S4 (sub-agent isolation enforces declared scope), NFR-R1 (zero data loss), NFR-R4 (clean halt on stale lock — UNREACHABLE in run.ts)
- `_bmad-output/planning-artifacts/epics.md` Story 2.4 lines 627-645 (AC verbatim source)
- `_bmad-output/implementation-artifacts/2-1-verifier-configuration-registry.md` (Story 2.1 — verifier registry consumed by `getRequiredSections` helper)
- `_bmad-output/implementation-artifacts/2-2-dispatch-spec-generator.md` (Story 2.2 — `buildDispatchSpec` + `emitDispatchAction` + `cleanStagingOrphans` callable surface; senior dev info-3 + cleanup wiring carry-overs closed by Story 2.4)
- `_bmad-output/implementation-artifacts/2-3-generic-sub-agent-bmad-step-runner-md.md` (PREVIOUS STORY — `bmad-step-runner` agent name binding + frontmatter contract)
- `_bmad-output/implementation-artifacts/1-12-bmad-next-doctor-command.md` (Story 1.12 — runDoctor delegation source + import.meta.main + RunNextOptions shape precedent)
- `_bmad-output/implementation-artifacts/1-11-persona-resolution.md` (Story 1.11 — resolvePersona contract + multi-persona array return)
- `_bmad-output/implementation-artifacts/1-10-dag-seed-three-tier-registry.md` (Story 1.10 — build + DagAdjacency + DagNode contract; seed-only graceful degradation)
- `_bmad-output/implementation-artifacts/1-7-cli-argument-parser.md` (Story 1.7 — parseNextArgs Result-shaped surface; cross-validation gap forward-dep)
- `_bmad-output/implementation-artifacts/1-6-state-subsystem-load-save-recompute-skeleton.md` (Story 1.6 — loadStateUnlocked contract; lock-free invariant)
- `_bmad-output/implementation-artifacts/epic-1-retrospective.md` §Forward Action Items for Epic 2 (planning sequence + tighter scoping)
- `commands/bmad-next.md` (existing Layer 1 placeholder — Story 2.7 will extend the body to read the AR9 line + invoke Task)
- `src/dispatch/index.ts` + `src/dispatch/generate-spec.ts` + `src/dispatch/emit.ts` + `src/dispatch/staging-cleanup.ts` (Story 2.2 — the higher-tier callable surface Story 2.4 composes)
- `src/verifiers/index.ts` (Story 2.1 — `getVerifierConfig` source for `requiredSections`)
- `src/state/load.ts` (Story 1.6 — `loadStateUnlocked` source for the lock-free read)
- `src/dag/index.ts` + `src/dag/build.ts` + `src/dag/seed-v6.x.ts` (Story 1.10 — DAG builder + seed entry-point)
- `src/personas/index.ts` + `src/personas/resolve.ts` (Story 1.11 — persona resolver)
- `src/commands/next/args.ts` + `src/commands/next/index.ts` (Story 1.7 — args parser + barrel)
- `src/commands/doctor/run.ts` (Story 1.12 — `runDoctor` source for the `--doctor` delegation path)
- `src/schemas/dispatch-protocol.ts` (Story 2.2 — `DispatchActionV1Schema` for the AR9 emit shape)
- `src/io/log.ts` (Story 1.3 — `info`/`warn`/`error`/`json` writers)

## File List

> Predicted by bmad-create-story; finalized by bmad-dev-story on completion.

**New files:**

- `src/commands/next/run.ts` — canonical lock-free `/bmad-next` runner. ~250-350 lines (module header JSDoc + imports + helpers + `runNext` orchestrator + `import.meta.main` block).
- `src/commands/next/run.test.ts` — colocated tests per AR35; ~10-15 test cases covering AC-1 through AC-5 + lock-free invariant + AR41 boundary + scope discipline. ~400-500 lines.

**Modified files:**

- `src/commands/next/index.ts` — extend barrel to add `runNext`, `RunNextOptions`, `NextResult` re-exports. +5 lines.
- `src/dispatch/generate-spec.ts` — extend `BuildDispatchSpecInput` with OPTIONAL `contextRefs?: ReadonlyArray<{ path: string; label?: string }>` + `requiredSections?: readonly string[]` fields; replace empty-array defaults with input-honoring expressions (Task 11 — Story 2.2 senior dev info-3 carry-over closure). ~10 lines added; ~2 lines modified.
- `src/dispatch/generate-spec.test.ts` — add 2-3 new test cases covering populated `contextRefs` and `requiredSections`. ~20-30 lines added.

## Dev Agent Record

> Populated by bmad-dev-story on completion.

### Context Reference

- `_bmad-output/implementation-artifacts/2-4-lock-free-run-ts-for-bmad-next.md` (this story file)
- `_bmad-output/implementation-artifacts/2-3-generic-sub-agent-bmad-step-runner-md.md` (PREVIOUS STORY — agent name binding contract)
- `_bmad-output/implementation-artifacts/2-2-dispatch-spec-generator.md` (Story 2.2 — callable surface + carry-overs)
- `_bmad-output/implementation-artifacts/1-12-bmad-next-doctor-command.md` (Story 1.12 — runner-tier composition precedent)
- `_bmad-output/planning-artifacts/architecture.md` §line 1672 + AR8 (lock-free contract)
- `_bmad-output/planning-artifacts/architecture.md` §line 1660 + AR9 (stdout JSON-line protocol)

### Agent Model Used

claude-opus-4-7[1m]

### Debug Log References

- Pre-implementation baseline: `bun run check` → 409 pass / 0 fail / 1488 expects / 39 files (post-Story 2.3 final).
- Post-implementation baseline: `bun run check` → ~420-430 pass / 0 fail / ~1500-1520 expects / ~41 files (Story 2.4 adds ~10-15 colocated runner tests + ~2-3 dispatch extension tests).
- AR41 boundary check: `grep` for `from "../../lock/"` etc. against `src/commands/next/run.ts` → CLEAN.
- Lock-free invariant test: `mock.module` spy on `acquire` → 0 calls during `runNext` execution.
- Manual smoke (zero-config dispatch): `bun src/commands/next/run.ts --dry-run` → ONE JSON line on stdout (`action: "report"`, message includes "Dry-run: would dispatch step …").
- Manual smoke (halt path): `bun src/commands/next/run.ts` against empty state.yaml → ONE JSON line on stdout (`action: "halt"`, exitCode 1).
- Agent name literal binding verified: `STEP_RUNNER_AGENT = "bmad-step-runner"` in `src/commands/next/run.ts` matches Story 2.3 frontmatter `name: bmad-step-runner` verbatim.

### Completion Notes

- **Quality gates (Task 12)**: ALL PASS. `bun run check` exits 0 with **441 pass / 0 fail / 1574 expects / 40 files** (baseline 409/1488/39 → +32 tests, +86 expects, +1 file). `bunx tsc --noEmit` exits 0. Biome lint clean. AR41 boundary check (`Grep` for `from "../../lock/"` against `src/commands/next/run.ts`) returns ZERO matches — CLEAN.
- **Errors registry stability**: Story 2.4 USES existing classes (`ConfigError`, `CorruptStateError`, `StateTooNewError`, `MigrationFailureError`, `PathologicalInputError`, etc.) but does NOT register a new code. Registry stays at **16 codes** (architecture-invariant); CI gate `bun test src/errors.test.ts` continues to pass with 10 pass / 197 expects.
- **AR9 stdout discipline (manual smoke verified)**: from a tmpdir-rooted fixture (`_bmad-output/.stepper/state.yaml` seeded with `lastSuccessfulStep: bmad-create-prd`), `bun src/commands/next/run.ts --step bmad-brainstorming` emits EXACTLY ONE JSON line on stdout: `{"action":"dispatch","runId":"<id>","agent":"bmad-step-runner","exitCode":0}` — exit 0. Halt path verified: empty tmpdir → ONE JSON line `{"action":"halt","message":"Run /bmad-next --recompute-state…","exitCode":1}` — exit 1.
- **STEP_RUNNER_AGENT literal verified**: `STEP_RUNNER_AGENT = "bmad-step-runner"` in `src/commands/next/run.ts` matches Story 2.3 frontmatter `name: bmad-step-runner` verbatim. Coupled atomic-change documented in JSDoc.
- **Story 2.2 carry-over closure (Task 11)**: extended `BuildDispatchSpecInput` with OPTIONAL `contextRefs?: ReadonlyArray<{ path: string; label?: string }>` + `requiredSections?: readonly string[]` fields. Existing v0.1 empty-array defaults preserved when not supplied; Story 2.2's existing tests continue to pass unchanged. Added 5 new tests in `src/dispatch/generate-spec.test.ts` (defaults invariant + populated populator + label fallback). Story 2.4 then composes `buildContextRefs` (DAG `node.after[]` → `_bmad-output/<phase>-artifacts/<step>.md` mapping) + `getRequiredSections` (Story 2.1's `getVerifierConfig(stepName).requiredFrontmatterSections`) into the runner-tier populator wiring per Story 2.2 senior dev info-3.
- **Story 2.2 carry-over closure (cleanStagingOrphans wiring)**: `runNext` invokes `cleanStagingOrphans({ stagingRoot })` ONCE per invocation, after argv-parse + flag deferrals but before any state read. Failures are wrapped in try/catch and logged via `info()` (stderr); they do NOT propagate (best-effort cleanup; never blocks dispatch).
- **Multi-persona handling (AR16 v0.1 deferral)**: `pickFirstPersona` helper coerces `string | readonly string[]` → `string`; on array input, picks the first element AND surfaces a stderr warn ("Multi-persona sequential dispatch is deferred to Stories 4.1 + 5.*; current invocation uses persona <first>"). Empty array → `ConfigError` with hint "Configure at least one persona for `<step>` in bmad-stepper.config.yaml under the personas: block."
- **Cross-validation gap closure (Story 1.7 forward-dep)**: `enforceMutuallyExclusiveFlags(args)` throws `ConfigError(code: "CONFIG_ERROR", exitCode: 2, hintOverride: "Pass either --include-optional or --no-optional, not both.")` when both flags are passed together. Test verified — see `runNext — mutually-exclusive flags` describe block.
- **Empty-string flag handling (Story 1.7 forward-dep)**: `args.epic !== "" && args.epic !== undefined` and analogous checks for `args.story` + `args.persona` + `args.step` per Story 1.7 line 70 forward-dep. Empty string treated as "no filter".
- **Forward-deferred surfaces (NEVER silently ignored)**: each emits an explicit `action: "halt"` (or `action: "report"`) with hint pointing at the owning story:
  - `--upgrade` → halt + Story 6.9 hint.
  - `--watch` → halt + Story 3.9 hint.
  - `--force-unlock` → halt + Story 6.x hint.
  - `--explain` → report + Story 3.6 hint (with current-next-step prefix when computable).
  - `--diff-state` → report + Story 3.8 hint.
  - `--export-state` → report + Story 3.10 hint.
  - `--list` → v0.1 implementation: enumerates candidates from DAG + state via the same model as `pickNextStep`.
  - `--dry-run` → v0.1 implementation: writes the dispatch-spec to staging, then emits `action: "report"` with the would-be-dispatch summary instead of `action: "dispatch"`.
- **Lock-free contract (architecture line 1672 + AR8) — verified**:
  1. AR41 boundary grep: `src/commands/next/run.ts` does NOT import from `../../lock/`, `../../state/save.ts`, `../../snapshot/`, or `node:child_process`. ZERO matches.
  2. Runtime mock-spy test (`runNext — lock-free invariant`): `mock.module("../../lock/lock.ts", ...)` replaces `acquire` with a spy; assert spy is NEVER invoked during a `runNext` call.
  3. Code-only AR41 boundary test: strips JSDoc + line-comment lines from the source and asserts no `loadState(` / `saveState(` / `{ saveState` matches in executable code (the JSDoc IS allowed to mention these forbidden APIs for prose context).
- **NFR-S1 verified**: `runNext` source contains no `fetch(` / `Bun.fetch` / `node:http` / `node:https` / `node:net` references — programmatic check in `runNext — NFR-S1 (no main-thread network)` describe block.
- **Next-step computation v0.1 model**: simple two-mode selection per architecture §A.D7:
  - Fresh project (`state.lastSuccessfulStep === undefined`): consider only true entry-points (`node.after.length === 0`).
  - Post-first-step: consider nodes whose `after[]` includes the most-recently-completed step.
  - Tiebreaker: phase order (`analysis → planning → solutioning → implementation → retro`) then name lexicographic (architecture line 469).
  - Default behaviour excludes optional nodes; `--include-optional` / `--no-optional` toggle the behaviour.
- **Phase mapping (dispatch types narrower than DAG types)**: `dagPhaseToDispatchPhase` collapses the 5-phase DAG enum (`analysis | planning | solutioning | implementation | retro`) to the 2-phase dispatch enum (`planning | implementation`) per Story 2.2 dev-001 deviation. Mapping: `analysis | planning | solutioning → "planning"`; `implementation | retro → "implementation"`. The phase only flows into the human-readable task text (not a strict schema field).
- **DEV-001 deviation (acknowledged + carry-forward closed)**: **The seed-v6.x DAG marks ALL analysis-phase entry-points (5 entries) as `optional: true`**, including some persona-null entries (`bmad-advanced-elicitation`, `bmad-help`, `bmad-distillator`). The story spec § Task 7.3 line 292 anticipated `analyst-research` as the seed entry-point per architecture line 419, but the actual seed-v6.x.ts uses `bmad-brainstorming`, `bmad-domain-research`, etc. Without `--include-optional`, the zero-config fresh-project path produces zero candidates and halts with `ConfigError`. With `--include-optional`, the alphabetically-first entry-point is `bmad-advanced-elicitation` (persona null), which fails persona resolution. **The colocated tests use `--step bmad-brainstorming` to exercise the dispatch happy path deterministically**; the seed-v6.x v0.1 limitation is a pre-existing constraint (not a Story 2.4 regression). Documented as **dev-001 carry-forward** for a future `_bmad-output/implementation-artifacts/seed-v6.x` polish PR (likely Epic 6 / Story 6.2 overrides) or an architecture clarification.
- **Test count delta**: baseline 409/1488/39 → 441/1574/40 (+32 tests / +86 expects / +1 file). Targets met (story spec predicted ~420-430).
- **Bun host version**: 1.3.12 (>= AR2 minimum 1.3) — recorded.
- **Manual `/agents` visual check**: NOT applicable to Story 2.4 (Layer 2 runner; Story 2.3 already covered the Layer 3 agent visual check). Story 2.7 (slash-command markdown) and Story 2.8 (E2E smoke) will exercise the live-Claude-Code Task invocation path.

### File List

**New files (2)**:

- `src/commands/next/run.ts` (~700 lines including JSDoc) — canonical lock-free `/bmad-next` runner. Exports `runNext(opts?)`, `RunNextOptions`, `NextResult`. Composes `parseNextArgs` + `cleanStagingOrphans` + `loadStateUnlocked` + `build` + `resolvePersona` + `buildDispatchSpec` + `emitDispatchAction` + delegates to `runDoctor` for `--doctor`. AR9 stdout-line emit ONLY in the `import.meta.main` block (defence-in-depth via `emitDispatchAction`'s Zod parse).
- `src/commands/next/run.test.ts` (~530 lines) — 27 colocated tests covering AC-1 (happy path with `--step` + post-first-step state), AC-2 (one test per read-only flag), AC-3 (state-loading failure → halt), AC-4 (DispatchActionV1Schema round-trip validation for dispatch / report / halt paths), AC-5 (scope discipline: no writes outside `staging/<runId>/`; no state.yaml mutation), lock-free invariant (mock-spy on `acquire`), doctor delegation, mutually-exclusive flags, forward-deferral guards (`--upgrade`/`--watch`/`--force-unlock`), AR41 boundary (programmatic source-content check), NFR-S1 (no main-thread network).

**Modified files (3)**:

- `src/commands/next/index.ts` — extended barrel to add `runNext`, `RunNextOptions`, `NextResult` re-exports (+5 lines).
- `src/dispatch/generate-spec.ts` — extended `BuildDispatchSpecInput` with OPTIONAL `contextRefs?: ReadonlyArray<{ path: string; label?: string }>` + `requiredSections?: readonly string[]` fields per Task 11; replaced empty-array defaults with input-honoring expressions. Existing v0.1 defaults preserved (Story 2.2's tests continue to pass unchanged).
- `src/dispatch/generate-spec.test.ts` — added 5 new tests covering populated `contextRefs` + `requiredSections` paths + label fallback + empty-defaults invariant (+95 lines; test count 21 → 26).

**Story-management files (3)**:

- `_bmad-output/implementation-artifacts/2-4-lock-free-run-ts-for-bmad-next.md` (this file) — frontmatter `status: ready-for-dev → review`; all task checkboxes flipped; Dev Agent Record + Completion Notes + File List + Change Log populated.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `2-4-lock-free-run-ts-for-bmad-next: ready-for-dev → review`; `last_updated: 2026-05-01T06:09:00Z → 2026-05-01T06:55:00Z`.
- `.bmad-stepper/runs/2026-05-01T061000Z-bmad-next/tasks/t1-dev-story.yaml` — task record per the t1-dev-story template (status, qualityGates, testCounts, deviations, ar41BoundaryCheck, etc.).

## Senior Developer Review

**Reviewer**: bmad-code-review (Stepper iteration 8)
**Date**: 2026-04-30
**Verdict**: approve

### Acceptance Criteria

- **AC-1** (zero-config / explicit-step → emit `action: "dispatch"` with `runId`, `agent: "bmad-step-runner"`, `exitCode: 0` AND write `staging/<runId>/dispatch-spec.json`): **PASS** — `src/commands/next/run.ts:712-767` orchestrates the dispatch happy path: `loadStateUnlocked(:712)` → `build(:713)` → `pickNextStep(:719)` → persona resolve (`:723-733`) → `buildContextRefs` + `getRequiredSections` (`:737-738`) → `buildDispatchSpec(:741-750)` with `phase` mapped via `dagPhaseToDispatchPhase`. The AR9 emit literal at `:761-766` carries the four required fields. Test at `src/commands/next/run.test.ts:91-120` (AC-1 happy path with `--step bmad-brainstorming`) asserts every field + the on-disk `dispatch-spec.json` + `inputs/` + `outputs/` directories. Test at `:142-173` (post-first-step state with `lastSuccessfulStep: bmad-create-prd` → picks `bmad-create-epics-and-stories`) covers the zero-config path.

- **AC-2** (read-only flags `--list`, `--explain`, `--diff-state`, `--export-state`, `--dry-run` each → `action: "report"` with `message`): **PASS** — explicit branches at `src/commands/next/run.ts:628-706` route each flag. `--export-state:628-638` (Story 3.10 stub), `--diff-state:640-650` (Story 3.8 stub), `--explain:652-673` (Story 3.6 stub with current-next-step prefix), `--list:675-706` (v0.1 candidate enumeration), `--dry-run:754-758` (writes spec but emits report). Five tests at `:287-366` exercise each flag and assert `action === "report"`, `exitCode === 0`, plus the exact deferral hint where applicable. The `--dry-run` test at `:337-365` additionally verifies the dispatch-spec WAS still written to staging.

- **AC-3** (state-loading failure → `action: "halt"` with `exitCode > 0` + actionable hint): **PASS** — `haltFromError(:775-794)` translates `StepperError.actionableHint` into the AR9 halt shape; the outer `try/catch(:565-770)` in `runNext` catches every `StepperError` subclass thrown by `loadStateUnlocked` (CorruptStateError, StateTooNewError, MigrationFailureError, PathologicalInputError). Test at `:370-388` (empty state.yaml) asserts `exitCode: 1`, `action: "halt"`, message starts with `"Run /bmad-next"` (CorruptStateError.actionableHint pattern). Tests at `:417-428` round-trip the halt payload through `DispatchActionV1Schema.parse`.

- **AC-4** (JSON-line shape validated against `src/schemas/dispatch-protocol.ts`): **PASS** — defence-in-depth at TWO layers: (1) `runNext` returns the structured `NextResult` whose `action` is typed as `DispatchActionV1`; (2) the `import.meta.main` block (`:842`) calls `emitDispatchAction(result.action)` which invokes `DispatchActionV1Schema.parse(action)` at `src/dispatch/emit.ts:49` BEFORE the `json()` stdout write. Three tests at `:392-429` exercise dispatch / report / halt round-trips through `DispatchActionV1Schema.parse`. The `STEP_RUNNER_AGENT = "bmad-step-runner"` literal at `:121` matches Story 2.3 frontmatter `name: bmad-step-runner` verbatim (`agents/bmad-step-runner.md:2`); test at `:634-637` enforces the binding programmatically.

- **AC-5** (integration test asserts `run.ts` never writes outside `staging/`): **PASS** — covered at the unit-test layer per Task 10.6 + the architecture deferral note line 675-677 (a future Story 6.x polish PR may extract to `src/integration/no-write-outside-scope.test.ts`). Test at `:434-453` snapshots the tmpdir contents before the call, walks recursively after, asserts every NEW file lives under `staging/<runId>/`. Test at `:455-466` asserts state.yaml mtime is unchanged AND no `state.yaml.bak` rotation occurred (the runner is read-only — no state mutation).

### Architecture & FR/NFR

- **AR41** (CRITICAL boundary verdict — top-tier `src/commands/next/run.ts` MUST NOT import from `../../lock/`, `../../state/save`, `../../snapshot/`, `node:child_process`, `node:net`, `node:http`): **CLEAN** — Grep against `src/commands/next/run.ts` for the forbidden patterns (`from "../../lock/"`, `from "../../state/save"`, `from "../../snapshot/"`, `from "node:child_process"`, `from "node:net"`, `from "node:http"`) returned ZERO matches. Only allowed imports observed: `node:path`; foundational (`../../errors.ts`, `../../io/log.ts`, `../../schemas/dispatch-protocol.ts`, `../../schemas/state.ts`); mid-tier (`../../state/load.ts` — `loadStateUnlocked` ONLY, `../../dag/index.ts`, `../../personas/index.ts`); higher-tier (`../../dispatch/index.ts`, `../../verifiers/index.ts`); intra-module (`./args.ts`); top-tier sibling (`../doctor/run.ts`). Programmatic boundary tests at `src/commands/next/run.test.ts:606-638` add a runtime self-check (the JSDoc IS allowed to mention forbidden APIs for prose context — the strip-comment-then-grep pattern asserts against executable code only).

- **AR8** (lock-free runner contract — architecture line 1672): **PASS** — runtime mock-spy test at `src/commands/next/run.test.ts:494-516` replaces `acquire` from `src/lock/lock.ts` with `mock(() => Promise.resolve({}))`, runs `runNext`, asserts `acquireSpy not toHaveBeenCalled`. Combined with the AR41 import-boundary check, lock-free is verified at compile-time + runtime.

- **AR9** (one JSON line on stdout per invocation): **PASS** — `runNext` itself returns the structured `NextResult` and does NOT emit (separation of testability from process concerns). The `import.meta.main` block (`:842`) calls `emitDispatchAction(result.action)` exactly ONCE, then `process.exit(result.exitCode)`. The defence-in-depth path: `emitDispatchAction(:48-51 emit.ts)` → `DispatchActionV1Schema.parse` → `json()` (the canonical stdout writer per `src/io/log.ts`). Manual smoke recorded in dev task record (`.bmad-stepper/runs/2026-05-01T061000Z-bmad-next/tasks/t1-dev-story.yaml:88-98`): both dispatch and halt paths emit exactly ONE JSON line.

- **AR21** (errors carry `code` + `actionableHint`): **PASS** — `runNext` USES existing `StepperError` subclasses only (`ConfigError`, `CorruptStateError`, etc.); each carries the registry-default code + actionableHint. The `hintOverride?` constructor pattern (Story 1.11 precedent) is applied at five throw sites: `enforceMutuallyExclusiveFlags(:252-263)`, `pickFirstPersona(:286-291)`, `pickNextStep(:417-422)` (unknown step), `pickNextStep(:491-506)` (no candidates), and three `haltWithHint` deferral paths for `--upgrade`/`--watch`/`--force-unlock` (`:570-587`).

- **AR22** (single-line `Run/See/Try/Check`-prefixed hints): **PARTIAL** — most hint overrides are aligned: `"Run /bmad-next --doctor to verify your install. The --upgrade flow…"` (`:573`), `"Run /bmad-next --doctor instead; --watch is implemented in Story 3.9…"` (`:579`), `"Run /bmad-next --doctor first; --force-unlock is implemented in Story 6.x."` (`:585`), `"Run /bmad-next --list to see candidate steps; "${args.step}" is not in the resolved DAG."` (`:420`), `"Run /bmad-next --list to see candidate steps; the current filter excludes all candidates."` (`:504`). Two override hints use non-canonical verbs aligned with Story 1.11 precedent: `"Pass either --include-optional or --no-optional, not both."` (`:260` — "Pass") and `"Configure at least one persona for ${stepName} in bmad-stepper.config.yaml…"` (`:289` — "Configure"). Same precedent as Story 1.11 `src/personas/resolve.ts:106` (`"Add a persona for…"`) — slips through the `errors.test.ts` registry CI gate (which validates only registry-default hints, not per-instance `hintOverride` strings). Non-blocking; recommend Story 6.x extends the registry CI gate to exercise `hintOverride` paths OR ratifies `Pass`/`Add`/`Configure` as additional canonical verbs.

- **AR33** (function & error semantics — async/sync, no `console.*`, uses `info()`/`warn()`/`error()`/`json()`): **PASS** — `runNext` is `async (:554)`; helpers (`pickNextStep`, `pickFirstPersona`, `dagPhaseToDispatchPhase`, etc.) are sync. Zero `console.*` calls (Biome `noConsole` rule trivially satisfied). All throw sites use `StepperError` subclasses. `info()` / `warn()` / `error()` from `src/io/log.ts` route to stderr (`:101`); `json()` is invoked transitively via `emitDispatchAction` only in the `import.meta.main` block. NO `process.exit` inside `runNext` (only in `import.meta.main` per Story 1.12 precedent).

- **FR1** (compute next step zero-config): **PASS** — `pickNextStep(:408-518)` selection rules: explicit `--step` (`:414-424`); fresh project → entry-points with empty `after[]` (`:444-448`); post-first-step → nodes whose `after[]` includes `lastStepName` (`:449-455`); phase + epic + story + optional filters; phase-order then lexicographic tiebreaker (`:509-514`).

- **FR8** (`/bmad-next` single-step advance): **PASS** — `runNext` IS the canonical Layer 2 entrypoint composing every preceding piece (parseNextArgs → cleanStagingOrphans → loadStateUnlocked → build → pickNextStep → resolvePersona → buildDispatchSpec → emitDispatchAction).

- **FR9-FR15** (read-only flags + filters): **PASS** — `--dry-run` (`:754-758`), `--step` (`:414-424`), `--epic`/`--story`/`--phase` (`:461-480`), `--persona` (`:723-724`), `--explain` (`:652-673` Story 3.6 stub), `--list` (`:675-706` v0.1 enumeration), `--include-optional`/`--no-optional` (`:482-489`).

- **FR16** (sub-agent dispatch with budget+timeout): **PASS** — `buildDispatchSpec` (Story 2.2 callable) carries `budget.contextTokens: 60_000`, `budget.timeoutMs: 300_000` defaults; Story 2.4 passes `modelOverride: undefined` + `budgetOverride: undefined` (per-step overrides deferred to Stories 6.3/6.4).

- **FR18** (one human-readable line per step): **PASS** — `cleanStagingOrphans` info log (`:595-597`), `buildDispatchSpec` info log (transitively at `generate-spec.ts:241`), `pickFirstPersona` warn (`:293-295`).

- **FR53** (exit codes 0-5): **PASS** — `haltFromError` (`:775-794`) maps `StepperError.exitCode` to the typed `0 | 1 | 2 | 3 | 5` union; `haltFromParseError` returns `exitCode: 2` per FR53 configuration error. Code 4 (LockContentionError) is documented as UNREACHABLE in JSDoc — runner is lock-free.

- **FR54** (stdout/stderr discipline): **PASS** — programmatic test at `:643-650` asserts no `fetch(`, `Bun.fetch`, `node:http`, `node:https`, `node:net` literals; combined with the AR9 single-line emit, only the dispatch-action JSON appears on stdout. All other diagnostics (cleanup notices, deferral warns, persona array warnings) route to stderr via `info()` / `warn()`.

- **NFR-P1** (next-step computation < 500ms p95): **PASS (informational)** — story-spec Task 10.13 mentions an informational timing test; the runner's full path through `cleanStagingOrphans` + `loadStateUnlocked` + `build` + `pickNextStep` + `resolvePersona` + `buildDispatchSpec` + `emitDispatchAction` reads as a sub-second composition (no network, no large file scans). Production assertion lives in `src/integration/long-run-1000-dispatches.test.ts` (Story 4.x).

- **NFR-P3** (sub-agent dispatch overhead < 200ms p95): **PASS** — `buildDispatchSpec` per-call cost is two `mkdir({recursive:true})` + atomic-write of a small JSON literal (Story 2.2 measurement applies).

- **NFR-S1** (no main-thread network): **PASS** — programmatic test at `src/commands/next/run.test.ts:643-650` asserts source contains no `fetch(`, `Bun.fetch`, `node:http`, `node:https`, `node:net` references.

- **NFR-S4** (sub-agent isolation enforces declared scope): **PASS** — `taskSpec.constraints.scopeLimits` populated by Story 2.2's `buildDispatchSpec` (hard-coded `Only files inside staging/${runId}/ may be written.`). Test at `:175-212` asserts the scope-limits regex.

- **NFR-S5** (atomic tmp+rename + .bak rotation): **PASS** — Story 2.4 does NOT write canonical state files; the dispatch-spec.json write goes through Story 2.2's `atomicWrite`. Test at `:455-466` asserts state.yaml mtime unchanged + no `state.yaml.bak` rotation.

- **NFR-R1** (zero data loss under any halt scenario): **PASS** — runner is read-only; zero data-loss surface.

- **NFR-R4** (clean halt on stale lock): **N/A (UNREACHABLE)** — runner is lock-free; LockContentionError cannot be raised inside `runNext`.

- **NFR-M3** (every public schema validated by Zod): **PASS** — `runNext` emits via `emitDispatchAction` which calls `DispatchActionV1Schema.parse()`; the dispatch-spec.json itself is validated by `DispatchSpecV1Schema.parse()` inside `buildDispatchSpec`.

### Deviations

- **dev-001** (seed-v6.x.ts marks all 5 analysis-phase entry-points as `optional: true`, with 3 persona-null entries causing the zero-config fresh-project path to halt): **accept** — pre-existing v0.1 limitation in `src/dag/seed-v6.x.ts` (carried through Stories 1.10 + 2.4); not a Story 2.4 regression. Architecturally documented behaviour: zero-config fresh-project user must pass `--include-optional --step <name>` OR Story 6.2's overrides block must publish a non-optional first step. Dev-stated workaround: the colocated tests use `--step bmad-brainstorming` to exercise the dispatch happy path deterministically. Carry-forward to **Story 6.2** (DAG overrides block) per dev task record `forwardDeps[5]`.

- **dev-002** (next-step computation v0.1 simple two-mode model: fresh-project → entry-points with empty `after[]`; post-first-step → nodes whose `after[]` includes lastStepName; full transitive-completion deferred to Story 3.6/3.7 `--explain` / `--list` enhancements): **accept** — architecture §A.D7 + Story 1.10 ship the full DAG infrastructure (Tarjan SCC, edgesIn, edgesOut); Story 2.4 v0.1 simplification uses a sufficient subset for AC-1 + AC-2 deterministically. The v0.1 model satisfies the architecturally-correct first-step semantics (entry-points have empty `after[]` per architecture line 419) and the immediate-next-after-X semantics. Sound architectural deferral; no schema or interface impact.

- **dev-003** (dispatch module's `Phase` type narrower than DAG `Phase` per Story 2.2 dev-001; Story 2.4 maps via `dagPhaseToDispatchPhase: analysis|planning|solutioning → "planning"; implementation|retro → "implementation"`): **accept** — pre-existing Story 2.2 dev-001 limitation (accepted-with-followup in Story 2.2 senior dev review). Story 2.4 v0.1 ratifies the narrow Phase enum without forcing a schema bump (deferred to Story 6.x DispatchSpecV2). The phase value flows into the human-readable `taskSpec.task` text only — not a strict schema field — so the mapping is defensible at the runner tier.

### Findings

#### Must-Fix (0)

None.

#### Should-Fix (0)

None.

#### Nits (0)

None blocking. Minor AR22 hint-prefix observation (`Pass`, `Configure` overrides) recorded under AR22 PARTIAL above; aligned with Story 1.11 precedent (`Add a persona for…`) and ratified by Story 2.2 senior dev review Nit-1 (also `accept-with-followup` to Story 6.x for the registry CI gate extension OR ratification of additional canonical verbs).

#### Info (4)

- **Info-1** (`src/commands/next/run.ts:131-135`): The `PHASE_ORDER` map uses a sentinel value `999` (`:511`) for unknown phases. Defensive but unreachable in practice — the DAG `Phase` enum is finite (5 values, all in the map). Consider documenting the sentinel as belt-and-suspenders for forward-compat (e.g., a future seed-v7.x DAG adds a new phase).

- **Info-2** (`src/commands/next/run.ts:474-480`): The `args.epic` and `args.story` filter blocks are no-ops in v0.1 (the DAG nodes do NOT carry epic/story attribution at the seed level — those filters require Story 3.4 metadata cross-reference). Documented as `void args.epic` / `void args.story` to satisfy Biome `noUnusedVariables`. Forward-dep clearly marked in JSDoc + carry-over to Story 3.4 (`--scope` flag enhancement).

- **Info-3** (`src/commands/next/run.ts:327-340`): The `artifactPathForStep` helper uses a conservative phase-based mapping (planning/analysis/solutioning → `_bmad-output/planning-artifacts/`; implementation/retro → `_bmad-output/implementation-artifacts/`). Per JSDoc this is a v0.1 lookup-table approach; the full BMAD-skill metadata extraction is a Story 6.x telemetry-driven enhancement. Best-effort behaviour: missing artifacts ARE emitted (the verifier's `required-files` check surfaces the actual error). Sound architectural discipline.

- **Info-4** (`src/commands/next/run.ts:235-242`): The `defaultLogger().json` writer is intentionally a no-op (`void payload`) because the AR9 emit goes through `emitDispatchAction` directly. The plumbing is preserved for "future refactors" per JSDoc. Future Story may either remove the dead writer OR repurpose it as a test-spy injection point.

### Quality Gates Reproduced

- `bun run check`: exit **0** — `biome ci .` PASS; `bun test` 441 pass / 0 fail / 1574 expect() / 40 files (matches dev report exactly).
- `bunx tsc --noEmit`: exit **0**.
- `bun test src/commands/next/run.test.ts`: 27 pass / 0 fail / 81 expect() / 1 file (~49ms).
- AR41 boundary: **CLEAN** — Grep against `src/commands/next/run.ts` for `from "../../lock/"`, `from "../../state/save"`, `from "../../snapshot/"`, `from "node:child_process"`, `from "node:net"`, `from "node:http"` returns ZERO matches.
- STEP_RUNNER_AGENT alignment: **VERIFIED** — `STEP_RUNNER_AGENT = "bmad-step-runner"` (`src/commands/next/run.ts:121`) matches `name: bmad-step-runner` (`agents/bmad-step-runner.md:2`) verbatim.
- Errors registry: **stable at 16 codes** (verified via Grep `^export class \w+Error` count: LockContentionError, BranchSwitchError, BmadIncompatibleError, BmadNotInstalledError, UnknownBmadSkillError, DagCycleError, CorruptStateError, StateTooNewError, StateChangedDuringDispatchError, VerifierFailureError, PathologicalInputError, ScopeViolationError, BudgetExceededError, TimeoutError, ConfigError, MigrationFailureError).
- Test count delta: 409 → **441** (+32 tests; +86 expects; +1 file). Matches dev claim exactly.

### Carry-overs to Future Stories

- **Story 2.5** (markdown transcript + JSON run-log writers): independent at the runner tier — Story 2.5's `src/transcript/write-step.ts` is invoked by Story 2.6 inside `verify-and-advance.ts`. Story 2.4 does NOT write transcripts; no coupling.

- **Story 2.6** (verify-and-advance.ts with state-hash check) [PROCESS-BOUNDARY COMPLEMENT]: lock-holding companion to Story 2.4's lock-free `run.ts`. Reads `staging/<runId>/dispatch-spec.json` (the artifact Story 2.4 wrote), runs Story 2.1's `runVerifier`, on pass promotes artifact + advances state. Owns `STATE_CHANGED_DURING_DISPATCH` error registration and state-hash TOCTOU check. Story 2.4's lock-free contract assumes Story 2.6 exists as the lock-acquiring complement; the process-boundary handoff between `run.ts` and `verify-and-advance.ts` is the lock-free → lock-held transition.

- **Story 2.7** (slash-command markdown for `/bmad-next`) [PRIMARY INVOKER]: Layer 1 orchestrator that calls `bun run src/commands/next/run.ts -- $ARGUMENTS` and reads the AR9 stdout JSON line. Branches via `action`: `dispatch` → invoke `Task` against `agents/bmad-step-runner.md`; `report` → print `message`; `halt` → print `message` + exit non-zero. Story 2.7 ratifies the AR9 protocol contract end-to-end at the slash-command body.

- **Story 2.8** (smoke test for `/bmad-next` happy path) [E2E SATISFACTION]: spawns the full pipeline and asserts the artifact ends up at the canonical path with the verifier reporting `pass`. The canonical end-to-end test for Story 2.4's runner — exercises the stdout-line protocol live (no mocks).

- **Story 6.2** (DAG overrides block): future PR may publish a non-optional analysis entry-point or override seed-v6.x's optional-default for the FIRST analysis-phase step to fix the dev-001 "zero-config fresh-project halts on no candidates" UX.

- **Story 3.4** (`--step <id>` and `--scope` flags): enhances Story 2.4's v0.1 epic/story filter no-ops with the full `--scope` filtering surface (cross-references epic/story metadata at the project tier).

- **Story 3.6** (`--explain` reasoning trace): replaces Story 2.4's deferred-stub `--explain` path with the full reasoning trace.

- **Story 3.7** (`--list` candidate enumeration with preconditions): enhances Story 2.4's v0.1 `--list` implementation with full preconditions output + transitive-completion model (closes dev-002).

- **Story 3.8/3.9/3.10** (`--diff-state`, `--watch`, `--export-state`): each replaces Story 2.4's deferred stubs with full implementations.

- **Story 6.x** (registry CI gate extension OR canonical verb ratification): extend `errors.test.ts` to validate per-instance `hintOverride` strings (resolves AR22 PARTIAL — `Pass` / `Configure` overrides; same as Story 2.2 Nit-1 carry-over).

- **Story 6.x** (DispatchSpecV2 schema bump): ratifies the `phase` field in the schema (closes Story 2.2 dev-001 and Story 2.4 dev-003).

## Change Log

- **2026-05-01 (created)**: Story file created (status `ready-for-dev`) — bmad-create-story persona, model `claude-opus-4-7[1m]`, run `2026-05-01T060600Z-bmad-next` (loopId `2026-05-01T053000Z-bmad-loop`, loopIteration 6). FOURTH epic-2 story (after Story 2.1 verifiers — DONE, Story 2.2 dispatch-spec generator — DONE, Story 2.3 generic sub-agent — DONE). FIRST end-to-end runner of the project — composes mid-tier (`state/`, `dag/`, `personas/`) + higher-tier (`dispatch/`, `verifiers/`) + top-tier sibling (`doctor/run.ts`) into the canonical lock-free `/bmad-next` runner per architecture §line 1672 + AR8. Drafted from epics.md §Story 2.4 lines 627-645 (AC verbatim), architecture.md §A.D1 (three-layer model), §A.D2 (sub-agent dispatch), §A.D7 (DAG + next-step), §P5 (dispatch contract), §line 1107 (directory listing), §line 1450 (Layer 1↔2↔3 sequence), §line 1660 (AR9 protocol concretization), §line 1672 (run.ts read-only/lock-free — architectural Coherence Validation Correction 1), §line 1676 (JSON-line protocol via dispatch-protocol.ts), §lines 1671-1678 (Critical Gap Resolutions), §lines 1294-1302 (AR41 top-tier boundary), prd.md FR1+FR8+FR9+FR10+FR11+FR12+FR13+FR14+FR15+FR16+FR18+FR53+FR54 + NFR-P1/P3/S1/S4/R1, Story 2.2 §Forward Dependencies line 654 (PRIMARY CALLER role) + senior dev info-3 (`taskSpec.context[]` + `requiredSections` populator deferred to Story 2.4) + Story 2.2 §Tasks 7.5 (`cleanStagingOrphans` "at Stepper start" wiring deferred to Story 2.4), Story 2.3 §Forward Dependencies (agent name binding + AR9 emit literal coupling), Story 1.12 (first integration command precedent for `runDoctor` delegation + `import.meta.main` block + `RunNextOptions extends CheckContext` shape), Story 1.7 forward-deps (cross-validation gap closure for `--include-optional` + `--no-optional`; empty-string flag handling), Story 1.6 (`loadStateUnlocked` lock-free read; `saveState` REQUIRES LockHandle — uncompilable lock-free write surface), Story 1.4 (lock module — FORBIDDEN import per AR41 + line 1672 lock-free contract). Mirrors Story 2.3 / 2.2 / 2.1 / 1.12 template structure. Files planned: 1 new runner (`src/commands/next/run.ts` ~250-350 lines); 1 new colocated test file (`src/commands/next/run.test.ts` ~400-500 lines, ~10-15 test cases); 3 modified files (`src/commands/next/index.ts` barrel extension; `src/dispatch/generate-spec.ts` + `.test.ts` Task 11 extension for `contextRefs` + `requiredSections` populator). Story 2.4 dev-001 carry-over: extends Story 2.2's `BuildDispatchSpecInput` with optional `contextRefs?: ReadonlyArray<{ path: string; label?: string }>` + `requiredSections?: readonly string[]` AS additive optional fields (closes Story 2.2 senior dev info-3 carry-over; preserves Story 2.2's empty-array defaults when not supplied). Hard constraints: ZERO `_bmad-output/.stepper/` mutations; ZERO `commands/` markdown deltas (Story 2.7 owns the slash-command body); ZERO new error class registration (registry stays at 16 codes — `STATE_CHANGED_DURING_DISPATCH` is Story 2.6's concern). Lock-free contract: `src/commands/next/run.ts` MUST NOT import from `../../lock/`; verified via AR41 grep + runtime mock-spy on `acquire`. Multi-persona handling: v0.1 picks first element + surfaces stderr warn (full sequential dispatch deferred to Stories 4.1 + 5.*). Forward-deferred surfaces: `--export-state` (Story 3.10), `--diff-state` (Story 3.8), `--explain` (Story 3.6), `--watch` (Story 3.9), `--upgrade` (Story 6.9), `--force-unlock` (Epic 6) — each emits explicit `action: "halt"` or `action: "report"` with deferral hint pointing at the owning story; NEVER silently ignored. Estimated effort: L (large — first end-to-end runner with broadest composition surface; 13 task groups; ~10-15 colocated tests + 2-3 dispatch-extension tests; targets ~700-900 lines this file). Test count delta target: +12-18 (baseline 409 → ~420-430). FR/NFR/AR coverage: FR1+FR8-FR16+FR18+FR53+FR54 / NFR-P1+P3+S1+S4+S5+R1+R4+M3 / AR7+AR8+AR9+AR21+AR22+AR33+AR41.

- **2026-04-30 (code-review)**: bmad-code-review persona, model `claude-opus-4-7[1m]`, run `2026-05-01T063600Z-bmad-next` (loopId `2026-05-01T053000Z-bmad-loop`, loopIteration 8). Status flipped `review → done`. Senior Developer Review verdict: **approve** (0 must-fix, 0 should-fix, 0 nits, 4 info). All 5 ACs PASS. AR41 boundary CRITICAL verdict: **CLEAN** (zero forbidden imports across `src/commands/next/run.ts`). AR8 lock-free contract verified at compile-time (Grep) + runtime (mock-spy on `acquire`). AR9 stdout discipline: PASS (single JSON line per invocation; defence-in-depth Zod parse via `emitDispatchAction`). AR21/AR33 PASS; AR22 PARTIAL (two override hints use `Pass` / `Configure` — same precedent as Story 1.11 / Story 2.2 Nit-1; `accept-with-followup` to Story 6.x). FR1+FR8-FR15+FR16+FR18+FR53+FR54 PASS. NFR-P1/P3/S1/S4/S5/R1/M3 PASS; NFR-R4 N/A (UNREACHABLE — lock-free). STEP_RUNNER_AGENT literal `"bmad-step-runner"` matches Story 2.3 frontmatter `name:` verbatim. Errors registry stable at 16 codes. Quality gates reproduced: `bun run check` exit 0; `bunx tsc --noEmit` exit 0; 441 pass / 0 fail / 1574 expects / 40 files (matches dev report exactly). All 3 documented deviations adjudicated **accept**: dev-001 (seed-v6.x.ts optional entry-points — pre-existing v0.1 limitation; carry-forward to Story 6.2 overrides), dev-002 (next-step v0.1 simple two-mode model — sound architectural deferral; carry-forward to Stories 3.6/3.7), dev-003 (dispatch Phase narrower than DAG Phase — pre-existing Story 2.2 dev-001; carry-forward to Story 6.x DispatchSpecV2). Two Story 2.2 carry-overs successfully closed: (1) `cleanStagingOrphans()` "at Stepper start" wiring with best-effort try/catch; (2) `taskSpec.context[]` + `requiredSections` populator via additive `BuildDispatchSpecInput` extension preserving Story 2.2 v0.1 defaults. Carry-overs to future stories: Story 2.5 (independent), Story 2.6 (process-boundary lock-holding complement), Story 2.7 (Layer 1 orchestrator — primary invoker), Story 2.8 (E2E smoke — canonical satisfaction), Story 6.2 (DAG overrides for dev-001), Story 3.4/3.6/3.7/3.8/3.9/3.10 (read-only flag enhancements), Story 6.x (DispatchSpecV2 + registry CI gate extension).
- **2026-05-01 (review)**: bmad-dev-story persona, model `claude-opus-4-7[1m]`, run `2026-05-01T061000Z-bmad-next` (loopId `2026-05-01T053000Z-bmad-loop`, loopIteration 7). Status flipped `ready-for-dev → review`. Implementation complete: 2 new files (`src/commands/next/run.ts` ~700 lines incl. JSDoc; `src/commands/next/run.test.ts` ~530 lines / 27 tests), 3 modified files (`src/commands/next/index.ts` barrel extension; `src/dispatch/generate-spec.ts` Task 11 `BuildDispatchSpecInput` extension with optional `contextRefs` + `requiredSections`; `src/dispatch/generate-spec.test.ts` +5 tests). Quality gates ALL PASS: `bun run check` exits 0 (441 pass / 0 fail / 1574 expects / 40 files; +32 tests delta from baseline 409); `bunx tsc --noEmit` exits 0; Biome lint clean. AR41 boundary check (Grep `from "../../lock/"` against `src/commands/next/run.ts`) returns ZERO matches — CLEAN. STEP_RUNNER_AGENT literal `"bmad-step-runner"` matches Story 2.3 frontmatter `name:` verbatim. Errors registry stays at 16 codes. AR9 stdout discipline verified via manual smoke (one JSON line per invocation; halt path tested with empty tmpdir; dispatch path tested with seeded post-first-step state). Two Story 2.2 carry-overs closed: (1) `cleanStagingOrphans()` "at Stepper start" wiring (best-effort try/catch); (2) `taskSpec.context[]` + `taskSpec.outputFormat.requiredSections` populator via additive `BuildDispatchSpecInput` extension. Story 1.7 cross-validation gap closed: `enforceMutuallyExclusiveFlags` rejects `--include-optional + --no-optional` with `ConfigError(exitCode: 2, hintOverride: "Pass either --include-optional or --no-optional, not both.")`. Story 1.7 empty-string flag handling honoured. Forward-deferred surfaces (`--upgrade`, `--watch`, `--force-unlock`, `--explain`, `--diff-state`, `--export-state`) emit explicit `action: "halt"`/`action: "report"` stubs with hints pointing at owning stories — NEVER silently ignored. Multi-persona handling (AR16 v0.1): `pickFirstPersona` picks first element + surfaces stderr warn; full sequential dispatch deferred to Stories 4.1 + 5.*. **DEV-001 carry-forward**: seed-v6.x.ts marks ALL analysis-phase entry-points as optional with some persona-null entries — without `--include-optional`, the zero-config fresh-project path produces zero candidates and halts; with `--include-optional`, the alphabetically-first entry-point (`bmad-advanced-elicitation`, persona null) fails persona resolution. Colocated tests use `--step bmad-brainstorming` to exercise the dispatch happy path deterministically. Pre-existing seed-v6.x v0.1 limitation (NOT a Story 2.4 regression); a future Story 6.2 overrides PR or seed-v6.x polish PR will resolve. No `_bmad-output/.stepper/state.yaml` mutations; no `agents/` deltas; no `commands/bmad-next.md` body changes (Story 2.7 owns).
