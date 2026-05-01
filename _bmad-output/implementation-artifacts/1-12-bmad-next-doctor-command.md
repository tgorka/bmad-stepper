---
status: ready-for-dev
story_id: '1.12'
story_key: 1-12-bmad-next-doctor-command
epic: '1'
title: '/bmad-next --doctor Command'
created: '2026-05-01'
last_updated: '2026-05-01'
priority: blocking
estimated_effort: M
fr_coverage:
  - FR40
  - FR41
  - FR47
  - FR49
  - FR50
  - FR53
  - FR54
nfr_coverage:
  - NFR-M4
  - NFR-R1
  - NFR-I2
  - NFR-S1
ar_coverage:
  - AR21
  - AR22
  - AR33
  - AR41
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/implementation-artifacts/1-1-initialize-repository-scaffold.md
  - _bmad-output/implementation-artifacts/1-2-errors-module-registry-ci-gate.md
  - _bmad-output/implementation-artifacts/1-3-logger-path-helpers-atomic-write.md
  - _bmad-output/implementation-artifacts/1-4-file-lock-with-heartbeat.md
  - _bmad-output/implementation-artifacts/1-5-schemas-migrations-skeleton.md
  - _bmad-output/implementation-artifacts/1-6-state-subsystem-load-save-recompute-skeleton.md
  - _bmad-output/implementation-artifacts/1-7-cli-argument-parser.md
  - _bmad-output/implementation-artifacts/1-8-snapshot-branch-sha-detection.md
  - _bmad-output/implementation-artifacts/1-9-bmad-detection.md
  - _bmad-output/implementation-artifacts/1-10-dag-seed-three-tier-registry.md
  - _bmad-output/implementation-artifacts/1-11-persona-resolution.md
  - _bmad/config.yaml
  - src/errors.ts
  - src/io/log.ts
  - src/bmad-detect/index.ts
  - src/dag/index.ts
  - src/personas/index.ts
  - src/state/load.ts
  - src/commands/index.ts
  - src/commands/next/args.ts
  - commands/bmad-next.md
  - package.json
---

# Story 1.12: `/bmad-next --doctor` Command

Status: ready-for-dev

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper user (Lena's first install scenario),
I want `/bmad-next --doctor` to report BMAD compatibility, state file presence, and DAG validity,
So that I can verify my install in 30 seconds without typing any other command.

## Context Summary

This story lands the **first integration command** of the project — the **`/bmad-next --doctor` diagnostic runner** that operationalises **architecture §G + §FR41 + §FR50 + §FR53** by composing every prior mid-tier module (`bmad-detect/`, `dag/`, `personas/`, `state/`) into a single user-facing diagnostic surface. Until now, Stories 1.1–1.11 have shipped foundational primitives (`errors.ts`, `io/{log,paths,atomic-write}.ts`), the lock + state + schemas + migrations subsystem, snapshot detection, BMAD detection, the DAG builder, and the persona resolver — all as **library modules with zero command-tier glue**. Story 1.12 fills that gap by composing these libraries inside `src/commands/doctor/run.ts` and producing the canonical 5-line stderr output documented in epics.md AC-1.

Concretely, this story produces:

1. **`src/commands/doctor/args.ts`** — minimal CLI argument parser for the doctor command. Mirrors Story 1.7's `parseNextArgs` Result-shape. The doctor command accepts NO additional flags in v0.1 (the `--doctor` flag itself is parsed by `parseNextArgs` for the `/bmad-next --doctor` invocation; the standalone `bun run src/commands/doctor/run.ts` entrypoint accepts no flags). The args.ts is a small Zod schema (`DoctorArgsSchema`) with no required fields; future stories may extend it (e.g., `--json` for machine-readable output, `--strict` to fail on warnings).
2. **`src/commands/doctor/checks.ts`** — the diagnostic check suite. Pure-async functions, one per check: `checkBmadInstalled()` (calls `detectBmadVersion()` from `src/bmad-detect/`), `checkProjectName()` (reads `_bmad/config.yaml` `bmm.project_name` or falls back to `package.json`'s `name`), `checkStateFile()` (calls `loadStateUnlocked()` from `src/state/load.ts`; handles `state.yaml is missing` as the fresh-project case + `CorruptStateError` as the corrupt-schema case), `checkStepRegistry()` (calls `detectBmadSkills()` then `build()` from `src/dag/` and counts `<N>` BMAD skills + `<M>` overrides). Each check returns a structured result `{ status: "ok" | "warn" | "error", line: string, error?: StepperError }`. The runner aggregates these into the final stderr output.
3. **`src/commands/doctor/run.ts`** — the orchestrator. Read-only and lock-free per architecture line 1672 (`run.ts` is read-only; only `verify-and-advance.ts` acquires the lock, and doctor never advances state). Composes the four checks, formats the 5-line stderr output, and exits with the appropriate code per FR53. On `BMAD_NOT_INSTALLED` (exit 3) or `CORRUPT_STATE` (exit 1), surfaces the error's `actionableHint` and exits with the error's `exitCode`.
4. **`src/commands/doctor/index.ts`** — the public barrel re-exporting `DoctorArgsSchema`, the `parseDoctorArgs` Result-shape (if any), and the runner entry point. Mirrors Story 1.7's `src/commands/next/index.ts` pattern.
5. **`commands/bmad-doctor.md`** — the **thin alias** Layer 1 slash-command markdown file. Per architecture lines 1659 + 1678, this is a wrapper that delegates to `bun run <plugin-root>/src/commands/doctor/run.ts -- $ARGUMENTS`. Functionally equivalent to `/bmad-next --doctor` invoking the same runner. Preserves muscle memory for the v0.0.x dogfood phase where users typed `/bmad-doctor` directly.
6. **Test files** — `src/commands/doctor/run.test.ts` (orchestrator integration tests using tmpdir per AR35), `src/commands/doctor/checks.test.ts` (per-check unit tests), and `src/integration/doctor.test.ts` OR `tests/integration/doctor-marketplace.test.ts` (the marketplace-install smoke test that creates a tmp `.claude/plugins/`, copies the plugin, runs `/bmad-next --doctor`, and asserts exit 0 + expected output per AC-5).

This story is the **canonical first INTEGRATION story** — it composes every prior mid-tier module into a runnable command. It does **NOT**:

- Modify any prior mid-tier module. The composition lives in `src/commands/doctor/run.ts` (top-tier per AR41); the mid-tier modules' public APIs are consumed verbatim. If the runner author finds a missing feature in `bmad-detect/`, `dag/`, `personas/`, or `state/`, the gap is documented and deferred (NOT patched in this story).
- Implement `--upgrade`. Per architecture line 1378, `--upgrade` lives in `src/upgrade/check.ts` (Story 6.9 deliverable). The doctor's `--upgrade` integration is forward-dep.
- Implement persona-resolvability check. Per architecture §D13 + Story 1.11 forward-dep notes, doctor MAY validate persona resolution by calling `resolvePersona()` per candidate next step. Story 1.12 ships only the four mandatory checks (BMAD installed, project name, state file, DAG validity); persona-validation is OPTIONAL deferred (a single-line "NICE TO HAVE" enhancement that can ship in 1.12 if time permits, OR be deferred to 3.6 `--explain`).
- Implement the full marketplace release manifest. The smoke test in AC-5 creates a *minimal* `.claude/plugins/` fixture with the doctor command and required files; the full marketplace metadata + release flow lands in Story 6.10.
- Document FR49 uninstall behavior in source code. AC-5b requires that uninstall preserve `_bmad-output/.stepper/`; per FR49 (PRD line 737) this is a **README documentation requirement, no code gate**. Story 1.13 (Quick-Start Documentation) is the canonical location for this README section.

It DOES land:

- The exact AR41-conformant placement of `src/commands/doctor/` as a **top-tier** module. Per architecture line 1295, `commands/` is the highest tier in the boundary graph: it depends on every other tier (foundational `errors.ts`, `io/`; mid-tier `bmad-detect/`, `dag/`, `personas/`, `state/`; higher-tier `verifiers/`, `dispatch/`, `failure-ux/` — none of which doctor needs in 1.12) and nothing imports from `commands/`. The doctor runner is therefore the **first source-side composer** that imports from MULTIPLE mid-tier modules in a single file — the AR41 mid-tier-to-mid-tier import ban does NOT apply at the commands tier.
- The canonical 5-line stderr output format documented verbatim in AC-1: `BMAD detected: v<version> (compatible)`, `Project: <name>`, `State file: not present (fresh project)`, `Step registry: built from <N> BMAD skills + <M> project overrides; DAG validated; no cycles`, `Suggestion: run /bmad-next to start the analysis phase.`. Each line maps 1:1 to a check function in `checks.ts`. The output goes to **stderr** per AR/FR54 (stdout is reserved for the JSON-line dispatch protocol; diagnostics use stderr).
- The exit-code mapping per FR53: 0 = success, 1 = halt-with-actionable-error (used for `CORRUPT_STATE` and `MIGRATION_FAILURE`), 2 = configuration error, 3 = BMAD compatibility error (used for `BMAD_NOT_INSTALLED`, `BMAD_INCOMPATIBLE`, `UNKNOWN_BMAD_SKILL`, `DAG_CYCLE`), 4 = lock contention, 5 = pathological input. Doctor never returns 4 or 5 in v0.1 (read-only + small DAG).
- The Layer 1 / Layer 2 split per architecture §D1: the slash-command markdown file (`commands/bmad-doctor.md`) is the **prompt** that Claude Code reads when the user types `/bmad-doctor`; the markdown's body invokes Layer 2's `bun run src/commands/doctor/run.ts -- $ARGUMENTS`. The same Layer 2 runner is invoked by `/bmad-next --doctor` (via the next/run.ts dispatcher in Story 2.4). Both invocation paths share the SAME runner code per architecture line 1678.
- The marketplace-smoke-test fixture pattern for AC-5: a tmp `.claude/plugins/bmad-stepper/` directory populated with a minimal plugin manifest + commands + src/ tree, then `bun run` invocation through that fixture. Establishes the AR35 tmp-per-test pattern for command-tier integration tests.

This is **AR21** (errors carry `code` + `actionableHint`), **AR22** (single-line "Run/See/Try/Check" hint), **AR33** (function & error semantics — `run.ts` is `async`; throws `StepperError` subclasses through to a top-level catch that prints the `actionableHint` and `process.exit(error.exitCode)`; no `console.*`), **AR41** (module boundary — `src/commands/doctor/` is top-tier; allowed imports include EVERY lower tier). It also operationalises **FR40** (layered config — doctor reads `_bmad/config.yaml` for the project name; full layered resolver is Story 6.1), **FR41** (`--doctor` diagnostic — primary), **FR47** (marketplace install — smoke test validates), **FR49** (uninstall preserves state — documented in README, validated by AC-5b smoke), **FR50** (BMAD version detection on first run — primary), **FR53** (documented exit codes — primary), **FR54** (stdout/stderr discipline), **NFR-M4** (dogfood validation — doctor IS the dogfood entrypoint), **NFR-R1** (zero data loss — doctor is read-only), **NFR-I2** (fail-loud unknown skill), **NFR-S1** (no main-thread network — doctor performs zero network IO).

## Acceptance Criteria

The acceptance criteria below are reproduced **verbatim** from `_bmad-output/planning-artifacts/epics.md` §Story 1.12 (lines 544-557, BDD Given/When/Then format). Lines and AC labelling preserved.

**Given** `src/commands/doctor/{args,run,checks}.ts` and the thin alias `commands/bmad-doctor.md` (which delegates to `bun run src/commands/doctor/run.ts`)
**When** `/bmad-next --doctor` runs in a project with BMAD installed and a fresh state
**Then** it prints to stderr: `BMAD detected: v<version> (compatible)`, `Project: <name>`, `State file: not present (fresh project)`, `Step registry: built from <N> BMAD skills + <M> project overrides; DAG validated; no cycles`, `Suggestion: run /bmad-next to start the analysis phase.`
**Given** BMAD is missing
**When** `--doctor` runs
**Then** it exits 3 with `BMAD_NOT_INSTALLED` hint
**Given** a `state.yaml` with corrupt schemaVersion
**When** `--doctor` runs
**Then** it surfaces `CORRUPT_STATE` with remediation hint
**And** exit codes follow the documented mapping (FR53)
**And** the marketplace install path works: a smoke test installs the plugin to a tmp `.claude/plugins/`, types `/bmad-next --doctor`, asserts green
**And** uninstall preserves `_bmad-output/.stepper/` (FR49 — documented in README, no code gate)

## Tasks / Subtasks

- [ ] **Task 0 — Verify pre-conditions (AC: all)**
  - [ ] 0.1 Confirm `src/errors.ts` registry stays at 16 codes after Story 1.11 (Story 1.11 extended `ConfigError` constructor but added no new code). Confirm `BmadNotInstalledError` exists at `src/errors.ts` lines 99-104 with `code: "BMAD_NOT_INSTALLED"`, `exitCode: 3`, hint `Run npx bmad-method install --tools claude-code first.`. Confirm `CorruptStateError` exists at lines 150-155 with `code: "CORRUPT_STATE"`, `exitCode: 1`, hint `Run /bmad-next --recompute-state to rebuild the cache from project files.`. Verify `bun test src/errors.test.ts` exits 0. **Story 1.12 does NOT modify `src/errors.ts`** — registry stays at 16; both error classes are pre-existing.
  - [ ] 0.2 Confirm `src/io/log.ts` exports `info`, `warn`, `error`, `json` per Story 1.3. Story 1.12 imports `info` (for the 5 stderr diagnostic lines) and `error` (for the actionable-hint emit on failure paths). Per AR/FR54, `info` writes to **stderr** (NOT stdout — stdout is reserved for the JSON dispatch protocol).
  - [ ] 0.3 Confirm `src/bmad-detect/index.ts` exports `detectBmadVersion(opts?)` and `detectBmadSkills(opts?)` per Story 1.9. The detector returns `BmadDetection { version: string; pluginDir: string; ... }` on success and throws `BmadNotInstalledError` on absence. Doctor calls both detectors at the top of the run.
  - [ ] 0.4 Confirm `src/dag/index.ts` exports `build({ skillNames, overrides? })` and `SEED_BMAD_VERSION` per Story 1.10. The builder returns `{ adjacency, ... }` on success and throws `DagCycleError` (or `UnknownBmadSkillError`) on failure. Doctor uses the builder's success-shape to render the `<N> BMAD skills + <M> project overrides` count line.
  - [ ] 0.5 Confirm `src/personas/index.ts` exports `resolvePersona(input)` and `DEFAULT_PERSONAS` per Story 1.11. Doctor MAY call `resolvePersona()` for OPTIONAL persona-resolvability check; v0.1 doctor ships without this check (deferred to a future polish PR or Story 3.6 `--explain`).
  - [ ] 0.6 Confirm `src/state/load.ts` exports `loadState(opts?)` and `loadStateUnlocked(opts?)` per Story 1.6. Doctor calls `loadStateUnlocked()` (read-only, lock-free per architecture line 1672). On `state.yaml missing` (the fresh-project case), `loadStateUnlocked` throws `CorruptStateError` with message `state.yaml is missing or empty`; doctor catches this specific message and treats it as the fresh-project case (NOT a corrupt state). On a real `CorruptStateError` (parse failure or migration failure), doctor surfaces the error's `actionableHint` and exits 1.
  - [ ] 0.7 Confirm `src/commands/next/args.ts` parses the `--doctor` boolean flag (per Story 1.7 lines 156-157 — `doctor: z.boolean().default(false)`). Story 1.12 does NOT modify this. The `/bmad-next --doctor` invocation flow is: (a) Layer 1 markdown receives `--doctor`; (b) calls `bun run src/commands/next/run.ts -- --doctor`; (c) Story 2.4's `next/run.ts` parses args and dispatches to `doctor/run.ts` when `--doctor` is set. Story 2.4 hasn't shipped yet — Story 1.12 ships ONLY the doctor runner; the dispatch from `next/run.ts` is forward-dep. The `commands/bmad-doctor.md` alias provides an alternative entrypoint that bypasses next/run.ts entirely (delegating directly to `doctor/run.ts`).
  - [ ] 0.8 Confirm baseline `bun run check` exits 0. Record the baseline test count in Completion Notes (expected ~286 pass / 0 fail per Story 1.11 final).
  - [ ] 0.9 Confirm Bun host version satisfies AR2 (Bun >= 1.3). Run `bun --version`; record in Completion Notes (1.3.12 expected per Story 1.11 baseline).
  - [ ] 0.10 Read epics.md Story 1.12 §lines 538-557 verbatim. Confirm the AC text in §Acceptance Criteria above is character-identical.
  - [ ] 0.11 Read architecture.md §G CLI Surface (lines 553-629) for the exit-code mapping (FR53), §1102-1123 for the doctor directory layout, §1671-1678 for the read-only / lock-free run.ts contract + thin-alias bmad-doctor.md, §1590-1592 for the "doctor is a flag, not a separate command" correction.
  - [ ] 0.12 Read prd.md FR40 (line 722 — layered config), FR41 (line 726 — `--doctor`), FR47 (line 731 — marketplace install), FR49 (line 737 — uninstall preserves), FR50 (line 738 — BMAD version detection), FR53 (line 744 — exit codes), FR54 (stdout/stderr discipline), NFR-M4 (line 803 — dogfood validation, real-world coverage), NFR-R1 (line 773 — zero data loss), NFR-S1 (line 783 — no main-thread network).

- [ ] **Task 1 — Create `src/commands/doctor/` directory + `src/commands/doctor/index.ts` barrel (AC: all)**
  - [ ] 1.1 Create directory `src/commands/doctor/`. Per AR41, this is **top-tier** — the same tier as `src/commands/next/` (Story 1.7). Allowed imports for any file under `src/commands/doctor/`: foundational (`../../errors.ts`, `../../io/log.ts`), Bun stdlib (`Bun.file`, `Bun.spawn`), Node stdlib (`node:fs/promises`, `node:path`, `node:os`), AND any mid-tier module: `../../bmad-detect/`, `../../dag/`, `../../personas/`, `../../state/`, `../../snapshot/`, `../../schemas/`, `../../migrations/`, `../../lock/`. The mid-tier-to-mid-tier ban does NOT apply at the commands tier — composition is the runner's job. JSDoc on every file MUST cite AR41 + the architecture line for the boundary graph (lines 1294-1295) + the read-only / lock-free contract (line 1672).
  - [ ] 1.2 Create `src/commands/doctor/index.ts` — public barrel:
    ```typescript
    /**
     * src/commands/doctor/index.ts — public barrel for the `doctor`
     * command (FR40, FR41, FR47, FR49, FR50, FR53, FR54, AR21, AR22,
     * AR33, AR41).
     *
     * Story 1.12 ships the doctor diagnostic runner as the first
     * INTEGRATION command — composes every prior mid-tier module
     * (bmad-detect, dag, personas, state) into a single user-facing
     * surface. The runner is read-only and lock-free per architecture
     * line 1672.
     *
     * Per AR41 top-tier boundary (architecture lines 1294-1295), this
     * barrel re-exports ONLY the public surface; internal helpers
     * (per-check formatters, output-line builders) stay private to the
     * implementation files.
     */
    export { DoctorArgsSchema, parseDoctorArgs } from "./args.ts";
    export type { DoctorArgs } from "./args.ts";
    export { runDoctor } from "./run.ts";
    export type { DoctorResult } from "./run.ts";
    ```
    No test file is needed (pure re-export).
  - [ ] 1.3 Update `src/commands/index.ts` to add `export * as doctor from "./doctor/index.ts";` after the existing `export * as next from "./next/index.ts";` line. Mirrors the Story 1.7 pattern. **This is the only modification to a pre-existing file in Story 1.12** (other than potentially `commands/bmad-doctor.md` which currently does not exist — Story 1.1 only shipped `commands/bmad-next.md`).

- [ ] **Task 2 — Implement `src/commands/doctor/args.ts` — Doctor-command argument parser (AC: all)**
  - [ ] 2.1 Create `src/commands/doctor/args.ts`. Module purpose: parse the doctor-runner's argv. The runner accepts NO flags in v0.1; the args.ts is a placeholder for future expansion (e.g., `--json` for machine-readable output, `--strict` to fail on warnings, `--check <name>` to run a single check).
  - [ ] 2.2 Mirror Story 1.7's `parseNextArgs` pattern: hand-rolled tokenizer + Zod schema + Result-shape return. The schema is empty in v0.1:
    ```typescript
    export const DoctorArgsSchema = z.object({}).strict();
    export type DoctorArgs = z.infer<typeof DoctorArgsSchema>;
    export type DoctorParseError = ParseError;  // Story 1.7 type
    export function parseDoctorArgs(argv: readonly string[]): Result<DoctorArgs, DoctorParseError>;
    ```
    `.strict()` rejects unknown flags with a Zod `unrecognized_keys` issue → maps to a `PARSE_ERROR` Result. Story 1.7's `Result<T, E>` and `ParseError` types may be re-exported from `src/commands/next/args.ts` (the parser-level `Result` type) OR re-defined locally. Recommended: re-export from `next/args.ts` to avoid duplication; document the cross-command-tier import as deliberate (the args modules at the COMMANDS tier may import from each other; commands-tier-to-commands-tier imports are NOT banned by AR41).
  - [ ] 2.3 Add a `parseDoctorArgs(argv)` function. Same shape as `parseNextArgs`: returns `Result<DoctorArgs, ParseError>` synchronously. Tokenizer is trivial since there are no flags — any input argv is rejected by `.strict()`. Empty argv returns `{ ok: true, value: {} }`. Hint string on failure: `Run /bmad-next --doctor (no flags accepted in v0.1).` (AR22-compliant — starts with "Run").
  - [ ] 2.4 Add JSDoc per Story 1.7 conventions. Cite architecture §G D12 lines 602-629 (hand-rolled Zod-validated parser); cite the Story 1.7 precedent for the Result-shape exception to AR33's throw-everywhere discipline.

- [ ] **Task 3 — Implement `src/commands/doctor/checks.ts` — Diagnostic check suite (AC-1, AC-2, AC-3, AC-4)**
  - [ ] 3.1 Create `src/commands/doctor/checks.ts`. Module purpose: define the four diagnostic checks as pure-async functions. Each check returns a `CheckResult { status: "ok" | "fresh" | "warn" | "error"; line: string; error?: StepperError }`. The runner aggregates these results.
  - [ ] 3.2 Public types and signature:
    ```typescript
    export type CheckStatus = "ok" | "fresh" | "warn" | "error";

    export interface CheckResult {
      readonly name: string;
      readonly status: CheckStatus;
      readonly line: string;          // The stderr output line for this check
      readonly error?: StepperError;  // Set when status === "error"
    }

    export interface CheckContext {
      readonly projectRoot?: string;     // defaults to process.cwd()
      readonly pluginDir?: string;       // override BMAD detection (test escape hatch)
      readonly statePath?: string;       // override state.yaml path (test escape hatch)
      readonly configPath?: string;      // override _bmad/config.yaml path (test escape hatch)
    }

    export async function checkBmadInstalled(ctx: CheckContext): Promise<CheckResult>;
    export async function checkProjectName(ctx: CheckContext): Promise<CheckResult>;
    export async function checkStateFile(ctx: CheckContext): Promise<CheckResult>;
    export async function checkStepRegistry(ctx: CheckContext, bmad: BmadDetection): Promise<CheckResult>;
    ```
    Each check is async because it touches the filesystem. Each check's `line` field is the **exact verbatim string** from AC-1.

  - [ ] 3.3 **`checkBmadInstalled(ctx)` — produces line `BMAD detected: v<version> (compatible)`**. Algorithm:
    1. Call `detectBmadVersion({ pluginDir: ctx.pluginDir })` from `src/bmad-detect/`.
    2. On success: return `{ status: "ok", line: "BMAD detected: v" + detection.version + " (compatible)", name: "bmad-installed" }`. Compatibility check: per architecture §FR50 + Story 1.9 contract, `detectBmadVersion` already validates compatibility against `SEED_BMAD_VERSION` from `src/dag/seed-v6.x.ts` (or surfaces `BmadIncompatibleError` if version mismatch). Doctor renders `(compatible)` literally on success.
    3. On `BmadNotInstalledError` thrown: re-throw verbatim (the runner catches at top level, surfaces the actionable hint, exits 3 per AC-2).
    4. On `BmadIncompatibleError` thrown: re-throw verbatim (runner exits 3).
    5. NEVER swallow other errors — let them propagate.
    Note: this check is the FIRST run; if it throws, all downstream checks are skipped (the runner short-circuits).

  - [ ] 3.4 **`checkProjectName(ctx)` — produces line `Project: <name>`**. Algorithm:
    1. Try to read `<projectRoot>/_bmad/config.yaml` (or `ctx.configPath`). Use `Bun.file(path).exists()` then `Bun.YAML.parse(await Bun.file(path).text())`.
    2. If the file exists and the parsed YAML has `bmm.project_name` (string), use that. From `_bmad/config.yaml` line 24 in this repo: `project_name: bmad-stepper`.
    3. If `_bmad/config.yaml` is missing OR has no `bmm.project_name`, fall back to reading `<projectRoot>/package.json`'s `name` field via `Bun.file(path).json()`.
    4. If both are missing OR yield no string, return `{ status: "warn", line: "Project: (unknown — set bmm.project_name in _bmad/config.yaml)", name: "project-name" }`. The runner does NOT exit on warn; the warn is rendered inline.
    5. Errors from `Bun.YAML.parse` or `Bun.file.json` (malformed input): swallow gracefully and fall through to the next source. Don't crash on a malformed `_bmad/config.yaml` — the doctor's job is to report problems, not crash on them.

  - [ ] 3.5 **`checkStateFile(ctx)` — produces line `State file: not present (fresh project)` OR `State file: present (schemaVersion <X>)`**. Algorithm:
    1. Call `loadStateUnlocked({ statePath: ctx.statePath })` from `src/state/load.ts`.
    2. On success: return `{ status: "ok", line: "State file: present (schemaVersion " + state.schemaVersion + ")", name: "state-file" }`.
    3. On `CorruptStateError` with message matching `/missing or empty/`: this is the fresh-project case (per Story 1.6's `loadState` throws this when `state.yaml` size is 0 or absent). Return `{ status: "fresh", line: "State file: not present (fresh project)", name: "state-file" }` — NOT an error.
    4. On any other `CorruptStateError`: re-throw verbatim. The runner catches and surfaces `CORRUPT_STATE` with remediation hint per AC-3 (exit 1).
    5. On `StateTooNewError`, `MigrationFailureError`, `PathologicalInputError`: re-throw verbatim.
    Note: distinguishing "missing" from "corrupt" by message-string match is fragile. **Safer approach**: check `Bun.file(statePath).size === 0` BEFORE calling `loadStateUnlocked`. If size === 0, return the fresh-project result without invoking the loader. If size > 0, call `loadStateUnlocked` and surface its errors. Document the choice in JSDoc; the dev may pick whichever pattern matches Story 1.6's existing behaviour more cleanly.

  - [ ] 3.6 **`checkStepRegistry(ctx, bmad)` — produces line `Step registry: built from <N> BMAD skills + <M> project overrides; DAG validated; no cycles`**. Algorithm:
    1. Call `detectBmadSkills({ pluginDir: bmad.pluginDir })` from `src/bmad-detect/`. Returns `string[]` of skill directory names.
    2. Read project overrides from `<projectRoot>/bmad-stepper.config.yaml` `dag.overrides:` block. Use Story 1.10's hand-rolled YAML extractor pattern (or call into the public surface if Story 1.10 exposed one — verify; if not, doctor inlines a simple line-based extractor mirroring `src/dag/build.ts`'s helper).
    3. Call `build({ skillNames: bmadSkills, overrides: projectOverrides })` from `src/dag/`. Counts: `<N> = bmadSkills.length`, `<M> = projectOverrides.length`. On success, return the verbatim line.
    4. On `DagCycleError`: re-throw (runner exits 3 with cycle-path hint per the Story 1.10 cycle-detection design).
    5. On `UnknownBmadSkillError`: re-throw (runner exits 3).
    Note: counts are exact; the line is rendered as a single template literal. Architecture line 548 (epics.md AC-1) shows the format verbatim.

  - [ ] 3.7 Add JSDoc per Story 1.6/1.7/1.8/1.9/1.10/1.11 conventions. Cite architecture §FR41, §FR50, §G CLI Surface, AR41 boundary graph (top-tier — all imports allowed), and the per-check verbatim AC-1 line format. Document the `CheckResult` discriminated-union shape and the runner's aggregation pattern.

- [ ] **Task 4 — Implement `src/commands/doctor/run.ts` — Orchestrator + stderr formatter (AC-1, AC-2, AC-3, AC-4, AC-5)**
  - [ ] 4.1 Create `src/commands/doctor/run.ts`. Module purpose: compose the four checks, format the 5-line stderr output, surface errors via the global error formatter, exit with the appropriate code per FR53. Read-only and lock-free per architecture line 1672 — doctor never acquires the project lock and never mutates `state.yaml`.
  - [ ] 4.2 Public types and main entry:
    ```typescript
    export interface DoctorResult {
      readonly exitCode: 0 | 1 | 3;  // 0 = ok; 1 = corrupt state; 3 = bmad missing/incompatible
      readonly results: readonly CheckResult[];
    }

    export interface RunDoctorOptions extends CheckContext {
      readonly logger?: { info(msg: string): void; error(msg: string): void };
    }

    export async function runDoctor(opts?: RunDoctorOptions): Promise<DoctorResult>;
    ```
    The runner returns a `DoctorResult` for testability; the **outer entrypoint** (a small main() at the bottom of the file behind `if (import.meta.main)`) calls `runDoctor(...)`, prints each `result.line` to stderr in order, then `process.exit(result.exitCode)`.
  - [ ] 4.3 Algorithm step 1 — **Resolve options** against defaults (`projectRoot: process.cwd()`, default logger from `src/io/log.ts`).
  - [ ] 4.4 Algorithm step 2 — **Run checks in order**:
    1. `checkBmadInstalled(ctx)` — if throws, jump to step 4 (error path).
    2. Capture `bmad: BmadDetection` from the success result for the next check.
    3. `checkProjectName(ctx)` — if throws, propagate (warn-only by design, but errors should still surface).
    4. `checkStateFile(ctx)` — if throws (real corruption, NOT the missing case), jump to step 4.
    5. `checkStepRegistry(ctx, bmad)` — if throws, jump to step 4.
  - [ ] 4.5 Algorithm step 3 — **On success path**: append the static suggestion line `Suggestion: run /bmad-next to start the analysis phase.` (or a context-dependent suggestion if the state file is present and a step is in-progress — but v0.1 ships the static line per AC-1). Return `{ exitCode: 0, results }`.
  - [ ] 4.6 Algorithm step 4 — **On error path**: catch the thrown `StepperError`, append a synthetic `CheckResult` with `status: "error"` and `line: error.actionableHint`, and return `{ exitCode: error.exitCode, results }`. The outer entrypoint prints all `results.line` values to stderr in order, then exits with `result.exitCode`.
  - [ ] 4.7 Algorithm step 5 — **Outer entrypoint** (`if (import.meta.main) { ... }` at the bottom of run.ts):
    ```typescript
    if (import.meta.main) {
      const argResult = parseDoctorArgs(process.argv.slice(2));
      if (!argResult.ok) {
        process.stderr.write(argResult.error.hint + "\n");
        process.exit(2);  // FR53: configuration error
      }
      const result = await runDoctor();
      for (const r of result.results) {
        process.stderr.write(r.line + "\n");
      }
      process.exit(result.exitCode);
    }
    ```
    The `import.meta.main` guard ensures the runner can be imported by tests without auto-executing.
  - [ ] 4.8 Output discipline — All diagnostic lines go to **stderr** per AR/FR54. Story 1.3's `info()` writes to stderr (verify; per Story 1.3's design info-level logs are stderr-bound). The architecture line 1660 mandates stdout is reserved for the JSON-line dispatch protocol; doctor never emits a dispatch JSON line, so stdout stays empty.
  - [ ] 4.9 Add JSDoc per Story 1.6/1.7/1.8/1.9/1.10/1.11 conventions. Cite architecture §G CLI Surface, §1672 (read-only / lock-free), §1671-1678 (thin-alias delegation), §FR41 (`--doctor`), §FR53 (exit codes), §FR54 (stderr). Document the `import.meta.main` entrypoint pattern and the `runDoctor()` testable export.

- [ ] **Task 5 — Create `commands/bmad-doctor.md` — Layer 1 thin-alias slash-command (AC-1, AC-5)**
  - [ ] 5.1 Create `commands/bmad-doctor.md`. Per architecture line 1678, this is a thin alias that delegates to `bun run <plugin-root>/src/commands/doctor/run.ts -- $ARGUMENTS`. Mirror the shape of `commands/bmad-next.md`:
    ```markdown
    ---
    description: Run the Stepper diagnostic suite (BMAD detection, state, DAG validity).
    argumentHint: "(no flags in v0.1)"
    allowedTools: ["Bash"]
    ---

    # /bmad-doctor

    Thin alias for `/bmad-next --doctor`. Delegates to the same Layer 2
    runner (`src/commands/doctor/run.ts`).

    Per architecture line 1678, this command is functionally equivalent to
    `/bmad-next --doctor` — both invoke `bun run <plugin-root>/src/commands/doctor/run.ts`.
    Preserved as a single-token slash command for muscle memory.

    Run:
    \`\`\`bash
    bun run src/commands/doctor/run.ts -- $ARGUMENTS
    \`\`\`

    The script writes 5 diagnostic lines to stderr and exits with:
    - 0 — all checks passed
    - 1 — corrupt state.yaml (run /bmad-next --recompute-state)
    - 2 — argument parse error
    - 3 — BMAD missing or incompatible (run npx bmad-method install --tools claude-code)
    ```
  - [ ] 5.2 Frontmatter `description` and `argumentHint` mirror `commands/bmad-next.md`'s shape (Story 1.1). The `allowedTools` list is `["Bash"]` only — doctor needs to invoke `bun run`; it does NOT need `Task` (no sub-agent dispatch) or `Read` (the diagnostic lines come from the runner's stderr).
  - [ ] 5.3 Body content per architecture line 1678 — minimal markdown that explains the alias relationship + a fenced bash block invoking the runner. The Layer 1 prompt for Claude Code is the markdown itself; Claude reads the body and executes the bash block when the user types `/bmad-doctor`.

- [ ] **Task 6 — Implement `src/commands/doctor/checks.test.ts` — Per-check unit tests (AC-1, AC-2, AC-3)**
  - [ ] 6.1 Create `src/commands/doctor/checks.test.ts`. Per AR35 (test patterns), use Bun's built-in test runner; spin up tmpdirs per test via `node:fs/promises mkdtemp(path.join(os.tmpdir(), "stepper-doctor-checks-"))`; clean up via `afterEach rm({ recursive: true })`. NEVER hard-code `/tmp/...` paths.
  - [ ] 6.2 Test 1 — **`checkBmadInstalled` happy path**. Set up tmpdir with a fake plugin layout (`<pluginDir>/skills/bmad-create-prd/SKILL.md` etc.) so `detectBmadVersion` succeeds. Call `checkBmadInstalled({ pluginDir })`. Assert `result.status === "ok"` and `result.line.startsWith("BMAD detected: v")` and `result.line.endsWith("(compatible)")`.
  - [ ] 6.3 Test 2 — **`checkBmadInstalled` BMAD missing throws**. Call `checkBmadInstalled({ pluginDir: "/nonexistent/path" })`. Expect `BmadNotInstalledError` thrown; assert `error.code === "BMAD_NOT_INSTALLED"`, `error.exitCode === 3`, hint matches the registry default.
  - [ ] 6.4 Test 3 — **`checkProjectName` happy path from `_bmad/config.yaml`**. Set up tmpdir with `_bmad/config.yaml` containing `bmm:\n  project_name: my-project\n`. Call `checkProjectName({ projectRoot: tmpdir })`. Assert `result.line === "Project: my-project"`.
  - [ ] 6.5 Test 4 — **`checkProjectName` fallback to `package.json`**. Set up tmpdir with `package.json` containing `{ "name": "my-pkg" }` and NO `_bmad/config.yaml`. Call. Assert `result.line === "Project: my-pkg"`.
  - [ ] 6.6 Test 5 — **`checkProjectName` warn when both missing**. Set up empty tmpdir. Call. Assert `result.status === "warn"` and `result.line` includes `(unknown` or similar marker.
  - [ ] 6.7 Test 6 — **`checkStateFile` fresh project (file absent)**. Set up tmpdir with no `_bmad-output/.stepper/state.yaml`. Call `checkStateFile({ statePath: path.join(tmpdir, "_bmad-output/.stepper/state.yaml") })`. Assert `result.status === "fresh"` and `result.line === "State file: not present (fresh project)"` (verbatim per AC-1).
  - [ ] 6.8 Test 7 — **`checkStateFile` present (valid)**. Set up tmpdir with a valid `state.yaml` (use Story 1.6's `saveState()` to construct OR write a minimal YAML manually with `schemaVersion: 1`). Call. Assert `result.status === "ok"` and `result.line === "State file: present (schemaVersion 1)"`.
  - [ ] 6.9 Test 8 — **`checkStateFile` corrupt schemaVersion throws** (AC-3). Set up tmpdir with a `state.yaml` containing `schemaVersion: 999` (or an invalid YAML payload). Call. Expect `CorruptStateError` thrown (or `StateTooNewError` depending on the corruption type). Assert `error.code === "CORRUPT_STATE"` and `error.actionableHint === "Run /bmad-next --recompute-state to rebuild the cache from project files."` (verbatim from registry).
  - [ ] 6.10 Test 9 — **`checkStepRegistry` happy path**. Set up tmpdir with a fake plugin layout containing a few skills (e.g., `bmad-create-prd`, `bmad-dev-story`); call `checkStepRegistry({ projectRoot: tmpdir, pluginDir }, { version: "6.5.0", pluginDir, ... })`. Assert `result.line` matches `/^Step registry: built from \d+ BMAD skills \+ \d+ project overrides; DAG validated; no cycles$/`.
  - [ ] 6.11 Test 10 — **`checkStepRegistry` overrides counted**. Set up tmpdir with `bmad-stepper.config.yaml` containing `dag:\n  overrides:\n    - { name: foo, after: bar }\n`. Call. Assert `result.line` includes `+ 1 project overrides`.
  - [ ] 6.12 Test 11 — **`checkStepRegistry` cycle detection throws**. Set up tmpdir with overrides forming a cycle. Call. Expect `DagCycleError` thrown.

- [ ] **Task 7 — Implement `src/commands/doctor/run.test.ts` — Orchestrator integration tests (AC-1, AC-2, AC-3, AC-4)**
  - [ ] 7.1 Create `src/commands/doctor/run.test.ts`. Use AR35 tmpdir-per-test. Tests target the `runDoctor()` testable export (NOT the `import.meta.main` entrypoint — that's covered by the marketplace smoke test in Task 8).
  - [ ] 7.2 Test 1 — **AC-1 happy path: fresh project, BMAD installed**. Set up tmpdir with fake plugin layout + no `state.yaml` + `_bmad/config.yaml` with `project_name: stepper-test`. Call `runDoctor({ projectRoot: tmpdir, pluginDir: ... })`. Assert `result.exitCode === 0` and `result.results.length === 5` and the lines are (in order): `BMAD detected: v...`, `Project: stepper-test`, `State file: not present (fresh project)`, `Step registry: built from N BMAD skills + 0 project overrides; DAG validated; no cycles`, `Suggestion: run /bmad-next to start the analysis phase.`.
  - [ ] 7.3 Test 2 — **AC-2: BMAD missing → exit 3**. Set up tmpdir with NO plugin layout (or pass `pluginDir: "/nonexistent"`). Call `runDoctor({ pluginDir: "/nonexistent" })`. Assert `result.exitCode === 3` and the last `results[i].line` includes `Run npx bmad-method install --tools claude-code first.` (the `BMAD_NOT_INSTALLED` actionable hint).
  - [ ] 7.4 Test 3 — **AC-3: corrupt schemaVersion → CORRUPT_STATE**. Set up tmpdir with valid plugin + `state.yaml` containing malformed YAML. Call `runDoctor({ projectRoot: tmpdir, pluginDir, statePath: ... })`. Assert `result.exitCode === 1` and the last `results[i].line` includes `Run /bmad-next --recompute-state to rebuild the cache from project files.` (the `CORRUPT_STATE` hint).
  - [ ] 7.5 Test 4 — **AC-4 exit code mapping (FR53) — DAG cycle → exit 3**. Set up tmpdir with valid plugin + `bmad-stepper.config.yaml` overrides forming a cycle. Call. Assert `result.exitCode === 3` (cycle is BMAD compatibility / scaffold breakage).
  - [ ] 7.6 Test 5 — **AC-1 happy path with present state**. Set up tmpdir with valid plugin + valid `state.yaml` (schemaVersion 1). Call. Assert third line is `State file: present (schemaVersion 1)` (NOT the fresh-project line).
  - [ ] 7.7 Test 6 — **stderr discipline**. Capture stdout + stderr during `runDoctor()`. Assert stdout is empty (per AR/FR54 — doctor emits no JSON dispatch line). All diagnostic lines went to stderr (note: `runDoctor()` itself returns the structured result; the entrypoint writes to stderr — so this test may target the `import.meta.main` block via `Bun.spawn` instead of calling `runDoctor()` directly).
  - [ ] 7.8 Test 7 — **No lock acquired** (architecture line 1672 — `run.ts` is read-only / lock-free). Set up tmpdir with a held lock file (mimic `src/lock/lock.ts` heartbeat). Call `runDoctor({ projectRoot: tmpdir, ... })`. Assert no `LockContentionError` is raised — doctor is lock-free.

- [ ] **Task 8 — Implement marketplace smoke test (AC-5)**
  - [ ] 8.1 Decide path: per architecture line 1252 (`smoke/doctor.test.ts`) OR `src/integration/doctor.test.ts` (line 1236) OR `tests/integration/doctor-marketplace.test.ts`. **Choose `src/integration/doctor-marketplace.test.ts`** — the architecture-prescribed `smoke/` directory hasn't been created yet (Story 1.x deferred); the integration directory is the canonical home for cross-module + marketplace tests. Document choice in JSDoc.
  - [ ] 8.2 Create `src/integration/doctor-marketplace.test.ts`. Per AR35 tmpdir, `mkdtemp(path.join(os.tmpdir(), "stepper-doctor-marketplace-"))`. Inside the tmpdir, create the marketplace fixture:
    - `<tmpdir>/.claude/plugins/bmad-stepper/` directory
    - Copy or symlink `commands/bmad-doctor.md`, `commands/bmad-next.md` into the fixture
    - Copy or symlink `src/`, `package.json` into the fixture (the runner needs the source tree to invoke)
    - Optionally also create a fake BMAD plugin layout under `<tmpdir>/.claude/plugins/bmad-method-6.5.0/` so `detectBmadVersion` succeeds
  - [ ] 8.3 Invoke the doctor runner via `Bun.spawn(["bun", "run", "src/commands/doctor/run.ts"], { cwd: <tmpdir>, env: { ... HOME: tmpdir, ... } })`. **Critical**: override `HOME` so `detectBmadVersion`'s default `~/.claude/plugins/` lookup resolves to the fixture, NOT the developer's real home.
  - [ ] 8.4 Capture stdout, stderr, and exit code from the spawned process. Assert:
    - exit code === 0 (green per AC-5)
    - stderr contains `BMAD detected: v` line
    - stderr contains `Step registry: built from <N> BMAD skills + 0 project overrides; DAG validated; no cycles`
    - stderr contains `Suggestion: run /bmad-next` line
    - stdout is empty (FR54 discipline)
  - [ ] 8.5 Test 2 — **AC-5b: uninstall preserves `_bmad-output/.stepper/`**. After successful doctor run + a (fake) state.yaml write, simulate uninstall by `rm -rf <tmpdir>/.claude/plugins/bmad-stepper/` (the plugin directory; NOT the `_bmad-output/` directory). Assert `<tmpdir>/_bmad-output/.stepper/state.yaml` still exists. **Note**: per FR49 + AC-5b, this is a documentation requirement, NOT a code-enforced gate. The smoke test asserts the *property* (uninstall doesn't accidentally delete `.stepper/`); the actual uninstall logic lives in the user's `/plugin marketplace remove` workflow which we do NOT control. The test serves as a regression guard against any future Stepper code that would try to clean up `_bmad-output/.stepper/`.
  - [ ] 8.6 Add JSDoc per Story 1.10/1.11 conventions citing FR47 (marketplace install), FR49 (uninstall preservation), AR35 (tmpdir-per-test).

- [ ] **Task 9 — Quality gates (AC: all)**
  - [ ] 9.1 Run `bun run check` — expect 0 fail, baseline 286 + ~20 new tests passing (~306 total). Record in Completion Notes.
  - [ ] 9.2 Run `bun run lint` (Biome) — expect 0 errors, 0 warnings. Confirm `src/commands/doctor/*.ts` adheres to project Biome config.
  - [ ] 9.3 Run `bun run typecheck` (`tsc --noEmit`) — expect 0 errors. The `CheckResult`, `DoctorResult`, `CheckContext`, `RunDoctorOptions` types MUST type-check cleanly.
  - [ ] 9.4 Run AR41 import-boundary CI check (if landed) — expect zero violations from `src/commands/doctor/*.ts`. The commands tier permits ALL lower-tier imports, so the only banned imports here are: nonexistent modules, `node:child_process` (use `Bun.spawn` instead), external libraries (no new deps).
  - [ ] 9.5 Confirm `src/errors.ts` registry stays at 16 codes. Story 1.12 USES `BmadNotInstalledError`, `BmadIncompatibleError`, `CorruptStateError`, `StateTooNewError`, `MigrationFailureError`, `DagCycleError`, `UnknownBmadSkillError`, `PathologicalInputError` but does NOT extend the registry.
  - [ ] 9.6 Confirm `bun run check` exits 0 on a clean checkout (`git stash && bun run check && git stash pop`) — the doctor runner must not depend on any uncommitted state.
  - [ ] 9.7 **Manual smoke (recommended)**: run `bun run src/commands/doctor/run.ts` from the repo root. Verify the stderr output matches the AC-1 5-line format. Capture in Completion Notes.

- [ ] **Task 10 — Update story status + sprint status (AC: all)**
  - [ ] 10.1 Update story file frontmatter: `status: ready-for-dev` → `status: review` (after dev completes; the bmad-create-story persona starts at `ready-for-dev`).
  - [ ] 10.2 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: `1-12-bmad-next-doctor-command: ready-for-dev` → `1-12-bmad-next-doctor-command: in-progress` → eventually `review` → `done` per Stepper's status transitions.
  - [ ] 10.3 Append a Change Log entry per the template at the bottom of this file.

## Dev Notes

### Architecture compliance

- **§G CLI Surface (lines 553-629)** — exit-code mapping (FR53) and stderr discipline (FR54) are verbatim translated to AC-4 and Task 4.8. Doctor never emits to stdout (no JSON dispatch protocol line).
- **§D1 (lines 1102-1123) — directory layout**: `src/commands/doctor/{index,args,run,checks}.ts` plus colocated tests. Story 1.12 ships exactly this surface.
- **§AR41 (lines 1294-1295) — top-tier boundary**: `src/commands/doctor/` is top-tier. Allowed imports: every lower tier (foundational `errors.ts`, `io/`; mid-tier `bmad-detect/`, `dag/`, `personas/`, `state/`, `snapshot/`, `schemas/`, `migrations/`, `lock/`; higher-tier `verifiers/`, `dispatch/`, `failure-ux/` — none of which doctor needs in v0.1). The mid-tier-to-mid-tier ban does NOT apply at the commands tier.
- **§Coherence Validation Correction 2 (lines 1590-1592) — `--doctor` is a flag**: PRD §api_surface lists `--doctor` as a *flag*, not a separate slash command. Story 1.12 ships the `src/commands/doctor/` runner code; the `commands/bmad-doctor.md` slash file is a thin alias preserved for muscle memory per architecture line 1659. The canonical invocation is `/bmad-next --doctor` (which Story 2.4's `next/run.ts` will dispatch to `doctor/run.ts` when the `--doctor` flag is set per Story 1.7's `NextArgsSchema.doctor` boolean). The standalone `bmad-doctor.md` alias provides an alternative entry point that bypasses next/run.ts.
- **§1672 — `run.ts` is read-only / lock-free**: doctor never acquires the project lock and never mutates `state.yaml`. Calls `loadStateUnlocked()` (NOT `loadState()`) per Story 1.6's contract.
- **§1678 — `commands/bmad-doctor.md` is a thin alias**: Story 1.12's slash file delegates to `bun run <plugin-root>/src/commands/doctor/run.ts -- $ARGUMENTS`; functionally equivalent to `/bmad-next --doctor`.
- **AR21 (line 198), AR22 (line 199)**: error-UX shape — every error class carries `code` + `actionableHint` (single-line, AR22-compliant `Run/See/Try/Check`-prefixed). The doctor runner surfaces only `error.actionableHint` to the user; the multi-line `error.detail` goes to the run-log (Story 2.5) — but doctor doesn't write run-logs, so detail is dropped in v0.1.
- **AR33 (line 213) — function & error semantics**: `runDoctor()` is `async`; throws `StepperError` subclasses through to a top-level catch in the `import.meta.main` block; no `console.*` calls anywhere; no `process.exit()` inside `runDoctor` (only in the `import.meta.main` entrypoint).

### Output format (AC-1 verbatim)

The 5 stderr lines, in order:

1. `BMAD detected: v<version> (compatible)` — from `checkBmadInstalled()` → `detectBmadVersion()`.
2. `Project: <name>` — from `checkProjectName()` → `_bmad/config.yaml` `bmm.project_name` OR `package.json` `name`.
3. `State file: not present (fresh project)` — from `checkStateFile()` when `state.yaml` size is 0 or absent. **Alt format**: `State file: present (schemaVersion <X>)` when present.
4. `Step registry: built from <N> BMAD skills + <M> project overrides; DAG validated; no cycles` — from `checkStepRegistry()` → `detectBmadSkills()` + `build()`. Counts are exact integers.
5. `Suggestion: run /bmad-next to start the analysis phase.` — static (or context-dependent in a future polish PR).

The `(compatible)` suffix in line 1 is rendered verbatim. Compatibility is asserted by `detectBmadVersion()` matching the installed BMAD version against `SEED_BMAD_VERSION` from `src/dag/seed-v6.x.ts`. Mismatch throws `BmadIncompatibleError` (exit 3); doctor never renders `(incompatible)`.

### Error paths (AC-2, AC-3, AC-4)

- **BMAD missing → exit 3, `BMAD_NOT_INSTALLED` hint**: `detectBmadVersion` throws `BmadNotInstalledError` when no BMAD plugin is found at the expected paths (`~/.claude/plugins/bmad-method-*` per spec, OR the cache layout `~/.claude/plugins/cache/bmad-method/bmad/<v>/` per Story 1.9 R2 carry-over). The runner catches, prints `error.actionableHint` (`Run npx bmad-method install --tools claude-code first.`), exits 3.
- **Corrupt `schemaVersion` → exit 1, `CORRUPT_STATE` hint**: `loadStateUnlocked` throws `CorruptStateError` on YAML parse failure or missing/empty file. Doctor distinguishes the missing-file case (status: "fresh", NOT an error) from real corruption (re-throws). The runner catches real corruption, prints `error.actionableHint` (`Run /bmad-next --recompute-state to rebuild the cache from project files.`), exits 1.
- **`state.yaml` schemaVersion > current → exit 1, `STATE_TOO_NEW` hint** (forward-compat — schemas/migrations Story 1.5): `loadStateUnlocked` throws `StateTooNewError` when `schemaVersion > stateMigrationRegistry.current`. Doctor surfaces, exits 1.
- **DAG cycle → exit 3, `DAG_CYCLE` hint**: `build()` throws `DagCycleError` when overrides form a cycle. Doctor surfaces, exits 3.
- **Unknown skill → exit 3, `UNKNOWN_BMAD_SKILL` hint**: `build()` throws `UnknownBmadSkillError` if a project override references a skill that doesn't exist in the BMAD plugin. Doctor surfaces, exits 3.
- **Argument parse error → exit 2, `PARSE_ERROR` hint**: `parseDoctorArgs` returns Result.Err on unknown flags. The `import.meta.main` block writes the hint to stderr, exits 2.

### Exit code mapping (FR53 verbatim)

| Code | Meaning | Used by doctor for |
|------|---------|--------------------|
| 0 | success | All checks pass |
| 1 | halt-with-actionable-error | `CORRUPT_STATE`, `STATE_TOO_NEW`, `MIGRATION_FAILURE` |
| 2 | configuration error | `PARSE_ERROR` (unknown flag) |
| 3 | BMAD compatibility error | `BMAD_NOT_INSTALLED`, `BMAD_INCOMPATIBLE`, `DAG_CYCLE`, `UNKNOWN_BMAD_SKILL` |
| 4 | lock contention | NEVER (doctor is lock-free) |
| 5 | pathological input / budget | `PATHOLOGICAL_INPUT` (state.yaml > 50 MB) — rare |

### Marketplace smoke test fixture (AC-5)

Per architecture line 1252 + AR35 tmpdir-per-test, the smoke test creates a self-contained fixture:

```
<tmpdir>/
  .claude/
    plugins/
      bmad-stepper/                         # the plugin under test
        commands/
          bmad-doctor.md
          bmad-next.md
        src/                                # source tree (or symlinks to repo)
          commands/doctor/
          bmad-detect/
          dag/
          state/
          ...
        package.json
      bmad-method-6.5.0/                    # fake BMAD install
        skills/
          bmad-create-prd/
            SKILL.md
          ...
  _bmad-output/
    .stepper/
      (empty for fresh-project case)
```

The test then `Bun.spawn(["bun", "run", "src/commands/doctor/run.ts"], { cwd: tmpdir, env: { HOME: tmpdir, ... } })` and asserts stderr + exit-code per AC-5. Setting `HOME` to the tmpdir is critical: `detectBmadVersion`'s default `~/.claude/plugins/` lookup resolves via `HOME`.

**AC-5b uninstall-preserves**: this is a **README documentation requirement, no code gate** per FR49. Story 1.12 documents the requirement in a comment on the smoke test (the smoke fixture's `_bmad-output/.stepper/` directory persists across plugin removal because it lives outside `<tmpdir>/.claude/plugins/`). Story 1.13 (Quick-Start Documentation) adds the README section explaining this to users.

### Real-world plugin path layout (Story 1.9 R2 carry-over)

Per Story 1.9 R2 carry-over (in run.yaml notes): the real-world Claude Code plugin install layout is `~/.claude/plugins/cache/bmad-method/bmad/<version>/`, NOT the spec-described `~/.claude/plugins/bmad-method-*/`. Story 1.9's `detectBmadVersion` already handles BOTH layouts (spec-described + cache layout). Story 1.12's doctor runner inherits this dual-path support via the `bmad-detect/` API — no additional code is required in `src/commands/doctor/`. The smoke test should optionally cover both layouts (one test fixture per layout) to validate the integration.

### AR41 boundary (top-tier)

`src/commands/doctor/` joins the top-tier sibling `src/commands/next/` (Story 1.7). Top-tier modules may import from EVERY lower tier:

**Allowed imports** for `src/commands/doctor/*.ts`:
- `../../errors.ts` (foundational; for error catching + actionable hint surfacing).
- `../../io/log.ts` (foundational; for `info` / `error` writers).
- `../../bmad-detect/index.ts` (mid-tier; for `detectBmadVersion`, `detectBmadSkills`).
- `../../dag/index.ts` (mid-tier; for `build`, `SEED_BMAD_VERSION`).
- `../../personas/index.ts` (mid-tier; for `resolvePersona`, `DEFAULT_PERSONAS` — OPTIONAL in v0.1 doctor).
- `../../state/load.ts` (mid-tier; for `loadStateUnlocked`).
- `../../schemas/state.ts` (foundational; for the `State` type if needed for schemaVersion access).
- `../../snapshot/` (mid-tier; OPTIONAL — doctor MAY render branch+sha for diagnostics in a future polish PR).
- `../next/args.ts` (commands tier; for `Result<T, E>` and `ParseError` types — commands-tier-to-commands-tier imports are NOT banned by AR41).
- Bun stdlib: `Bun.file`, `Bun.spawn`, `Bun.YAML`.
- Node stdlib: `node:fs/promises`, `node:path`, `node:os` (for `os.tmpdir()` in tests only).
- External libraries: `zod` (for the empty `DoctorArgsSchema`).

**FORBIDDEN imports** for `src/commands/doctor/*.ts`:
- `node:child_process` — use `Bun.spawn` instead.
- Any new external runtime dep beyond `zod`.

The architecture's import-boundary CI check excludes `*.test.ts` files from cross-module restrictions; the test files MAY import freely.

### Logging discipline (AR/FR54)

Per architecture line 1396 (NFR-S1) + epics.md AC-1 ("prints to stderr"): all 5 diagnostic lines + the actionable-hint on error paths go to **stderr**. The `import.meta.main` entrypoint uses `process.stderr.write(line + "\n")` directly (or via `info()` from `src/io/log.ts` which writes to stderr per Story 1.3 design). **stdout stays empty** — Story 2.4's `run.ts` reserves stdout for the JSON-line dispatch protocol; doctor never emits a dispatch line, so stdout is silent. The smoke test asserts this discipline via `Bun.spawn`'s separate stdout/stderr capture.

### Test pattern (AR35)

Per Story 1.3 / 1.4 / 1.6 / 1.8 / 1.9 / 1.10 / 1.11 precedent:
- Use Bun's built-in test runner (`bun test`).
- Spin up a tmpdir per test via `node:fs/promises mkdtemp(path.join(os.tmpdir(), "stepper-doctor-"))`.
- Clean up via `afterEach rm({ recursive: true })`.
- NEVER hard-code `/tmp/...` paths.
- For the `import.meta.main` entrypoint test (stderr discipline), use `Bun.spawn` to invoke the runner as a child process, capture `proc.stdout` + `proc.stderr` + `await proc.exited` for the exit code.
- For `runDoctor()` integration tests, call the testable export directly and inspect the returned `DoctorResult`.

### Forward-dep notes

- **Story 1.13 — Quick-Start Documentation**: README references the doctor command's expected output for the dogfood walkthrough. The fixture file `tests/fixtures/quick-start-walkthrough.md` will reference the AC-1 5-line format verbatim; any change to the format MUST update both the doctor runner AND the fixture in the same PR. NFR-M4 (real-world coverage) is validated by the timed walkthrough.
- **Story 2.4 — `next/run.ts` lock-free runner**: the canonical `/bmad-next` entrypoint will parse `--doctor` (already wired in Story 1.7's `NextArgsSchema`) and dispatch to `runDoctor()` from `src/commands/doctor/run.ts` when `args.doctor === true`. Story 2.4 imports `runDoctor` via the `src/commands/doctor/index.ts` barrel — top-tier-to-top-tier import (allowed by AR41).
- **Story 4.1 — `loop/run.ts` skeleton**: the `/bmad-loop` entrypoint will optionally invoke `runDoctor()` at the top of each loop iteration to validate the environment (similar to architecture's "every command-level invocation calls detection at the top" pattern documented in `bmad-detect/index.ts`).
- **Story 6.9 — `--upgrade` flow**: `src/upgrade/check.ts` lives outside `commands/doctor/`. Per architecture line 1378, the upgrade check is invoked from `doctor/run.ts` when `--upgrade` is set; v0.1 doctor does NOT support `--upgrade` (parser doesn't accept it; runner doesn't dispatch). Story 6.9 extends `DoctorArgsSchema` with the `--upgrade` flag.
- **Story 6.10 — Marketplace release v0.1.0**: validates the doctor command's output against the published plugin manifest. The smoke test in Task 8 establishes the fixture pattern; Story 6.10 extends with the actual `.claude-plugin/plugin.json` manifest validation.
- **Story 1.11 nit (D5) carry-over**: Story 1.11 senior-review NIT-1 noted "consider adding `export type ResolvedPersona = string | readonly string[]` to `src/personas/resolve.ts` and `src/personas/index.ts` for spec-planned barrel-surface parity". Doctor does NOT need this type (uses the inline `string | readonly string[]` shape via `resolvePersona`'s return). Carry-over remains in the persona module's polish backlog.

### Persona-resolvability check (deferred)

Per architecture §D13 + Story 1.11 forward-dep notes (Story 1.11 line 137: "Story 1.12 — src/commands/doctor/run.ts (persona-resolvability smoke check)"), doctor MAY validate persona resolution by calling `resolvePersona({ step })` for each candidate next step (or for the entire seed list). This is OPTIONAL in v0.1 — Story 1.12 ships only the four MANDATORY checks (BMAD installed, project name, state file, DAG validity). The persona-resolvability check is deferred to:
- A future polish PR if time permits in Story 1.12 dev iteration; OR
- Story 3.6 (`--explain --reasoning-trace`) which renders persona-resolution paths per step.

If the dev decides to ship the persona-resolvability check in Story 1.12: add a 6th line `Personas: <K> resolved, <L> deferred (set in bmad-stepper.config.yaml).` AFTER the step-registry line, BEFORE the suggestion line. Document the choice in Completion Notes.

## Previous Story Intelligence

This is iteration 12 of Epic 1. Lessons learned from Stories 1.1–1.11 directly applicable to Story 1.12:

### Story 1.1 — Bun host scaffold

- Bun 1.3.12 is the minimum supported runtime (AR2). Story 1.12's tests use `Bun.write`, `Bun.file`, `Bun.spawn`, and Bun's built-in test runner. No `bun add` is required (zero new deps).
- `commands/bmad-next.md` is the placeholder Layer 1 file. Story 1.12 creates `commands/bmad-doctor.md` with the same shape: frontmatter (`description`, `argumentHint`, `allowedTools`), then a fenced bash block invoking the Layer 2 runner.
- `package.json` `scripts` block exposes `check`, `lint`, `typecheck`, `test`. Story 1.12 must keep these passing.

### Story 1.2 — Errors module + registry CI gate

- The 16-entry registry contains every error doctor surfaces: `BmadNotInstalledError` (exit 3), `BmadIncompatibleError` (exit 3), `CorruptStateError` (exit 1), `StateTooNewError` (exit 1), `MigrationFailureError` (exit 2), `DagCycleError` (exit 3), `UnknownBmadSkillError` (exit 3), `PathologicalInputError` (exit 5). Story 1.12 USES these classes; does NOT modify the registry.
- The `errors.test.ts` registry CI gate enforces the AR22 "Run/See/Try/Check"-prefixed actionable-hint discipline. Story 1.12's runner surfaces `error.actionableHint` verbatim; no string mutation.

### Story 1.3 — Logger + path helpers + atomic write

- `src/io/log.ts` exports `info`, `warn`, `error`, `json`. Story 1.12 imports `info` (or directly uses `process.stderr.write`) for the 5 diagnostic lines and `error` for the actionable-hint emit on failure paths. Per architecture line 1396 (NFR-S1) and FR54, `info` writes to **stderr**.
- `src/io/paths.ts` exports `STATE_PATH` (the canonical `_bmad-output/.stepper/state.yaml`). Doctor uses this when no `ctx.statePath` override is provided.
- `src/io/atomic-write.ts` is NOT used by doctor (read-only).

### Story 1.4 — File lock with heartbeat

- `src/lock/lock.ts` is a mid-tier sibling. Per architecture line 1672 + AR41, `src/commands/doctor/run.ts` does NOT acquire the lock. Doctor calls `loadStateUnlocked()` (NOT `loadState()`) per Story 1.6's lock-free contract.
- The smoke test in Task 8 verifies doctor is lock-free even when a stale lock file exists in the fixture.

### Story 1.5 — Schemas + migrations skeleton

- `src/schemas/state.ts` exports `State` (the typed `z.infer<typeof StateLatestSchema>`). Story 1.12's `checkStateFile()` may import this type to render `state.schemaVersion` in the diagnostic line.
- `src/migrations/state/index.ts` exports the migration registry. Doctor doesn't directly use it — `loadStateUnlocked` invokes the registry internally and surfaces `StateTooNewError`/`MigrationFailureError` on incompatibility.

### Story 1.6 — State subsystem load/save/recompute skeleton

- `src/state/load.ts` exports `loadState(opts?)` (locked, for production state mutation) and `loadStateUnlocked(opts?)` (lock-free, for read-only flags including doctor). Story 1.12's `checkStateFile()` calls `loadStateUnlocked()` per architecture line 1672.
- The fresh-project case: `loadStateUnlocked` throws `CorruptStateError` with message `state.yaml is missing or empty` when `Bun.file(statePath).size === 0`. Doctor distinguishes this from real corruption by **checking file size BEFORE calling the loader** (cleaner pattern than message-string matching).
- The corruption case: any other `CorruptStateError` (YAML parse failure or migration validation failure) is real corruption — doctor re-throws and exits 1 per AC-3.

### Story 1.7 — CLI argument parser

- `src/commands/next/args.ts` parses 18 flags including `--doctor` (line 156: `doctor: z.boolean().default(false)`). Story 1.12 does NOT modify this. The flag wiring lives in Story 2.4's `next/run.ts` which dispatches to `doctor/run.ts` when set. The standalone `commands/bmad-doctor.md` alias provides an alternative entrypoint.
- The `Result<T, E>` and `ParseError` types from `next/args.ts` are RE-EXPORTED from `doctor/args.ts` (commands-tier-to-commands-tier import is allowed). Same hand-rolled tokenizer + Zod schema + `.strict()` rejection pattern.
- The Story 1.7 dev's design choice — "Story 1.7 lands the parser only. The runner (Story 2.4) and slash-command markdown body (Story 2.7) are separate deliverables" — is the precedent for Story 1.12: doctor ships its OWN runner and slash-command markdown body in this story (not deferred).

### Story 1.8 — Snapshot branch+sha detection

- `src/snapshot/` is a mid-tier sibling. Story 1.12's doctor MAY render the branch+sha for diagnostics in a future polish PR (e.g., line 6: `Branch: main @ a10bc4f`). v0.1 ships without this. Story 1.8's `detectSnapshot()` is the entry point if added.

### Story 1.9 — BMAD detection

- `src/bmad-detect/index.ts` exports `detectBmadVersion(opts?)` and `detectBmadSkills(opts?)`. Story 1.12's `checkBmadInstalled()` calls `detectBmadVersion()`; `checkStepRegistry()` calls `detectBmadSkills()`.
- Story 1.9 R2 carry-over: real-world plugin layout `~/.claude/plugins/cache/bmad-method/bmad/<v>/` is supported in addition to the spec-described `~/.claude/plugins/bmad-method-*/`. Doctor inherits both layouts via the bmad-detect API. The smoke test in Task 8 may cover both layouts as separate fixtures.
- Story 1.9's reviewer noted that the cache-layout detection may render a non-standard version string in some environments. Story 1.12's `checkBmadInstalled()` renders `detection.version` verbatim — if the version string contains unexpected characters, doctor's output reflects that without crashing.

### Story 1.10 — DAG seed + three-tier registry

- `src/dag/index.ts` exports `build({ skillNames, overrides? })`, `SEED_BMAD_VERSION`, `tarjanScc`, and structural types. Story 1.12's `checkStepRegistry()` calls `build()` and counts `skillNames.length` + `overrides.length` for the `<N> + <M>` line.
- Story 1.10's hand-rolled `overrides:` YAML extractor lives privately in `src/dag/build.ts`. Story 1.12 inlines a parallel extractor for the `dag.overrides:` block read in `checkStepRegistry()` — OR refactors the extractor into a shared helper. **Recommended**: keep them separate for v0.1; full Zod-validated config-yaml loader lands in Story 6.1.
- Story 1.10's `DagCycleError` carries cycle-path detail in `error.detail`. Doctor surfaces only `error.actionableHint` (single line); the detail is NOT rendered in v0.1 (would clutter the 5-line output). Story 2.5 (run-log writer) is the canonical home for full error detail.
- Story 1.10's reviewer flagged INFO-2 (idempotent-rerun field deferred to 5.1). Doctor v0.1 does NOT track repeated invocations; each `/bmad-next --doctor` call is a fresh diagnostic run.

### Story 1.11 — Persona resolution

- `src/personas/index.ts` exports `resolvePersona`, `DEFAULT_PERSONAS`, and types `ResolveInput`, `ResolveOptions`. Story 1.12's doctor MAY invoke `resolvePersona()` for the OPTIONAL persona-resolvability check (deferred — see Dev Notes).
- Story 1.11 extended `ConfigError` constructor with an optional `hintOverride?: string` argument. Story 1.12's doctor does NOT throw `ConfigError` directly (AC-2/AC-3 reserve `BMAD_NOT_INSTALLED` and `CORRUPT_STATE` as the failure error types). If a future polish PR adds the persona-resolvability check, that path may surface `ConfigError` (the AC-2 verbatim hint from Story 1.11).
- Story 1.11's reviewer NIT-1 — "consider adding `export type ResolvedPersona = string | readonly string[]` for spec-planned barrel-surface parity" — does NOT block Story 1.12. The fix can land in any future persona-touching story.

## File List (Planned)

### New files

- `src/commands/doctor/index.ts` — public barrel re-exporting `DoctorArgsSchema`, `parseDoctorArgs`, `runDoctor`, types. ~25 lines.
- `src/commands/doctor/args.ts` — minimal Zod schema + `parseDoctorArgs` Result-shape parser. Mirrors Story 1.7. ~80 lines.
- `src/commands/doctor/checks.ts` — four diagnostic checks (`checkBmadInstalled`, `checkProjectName`, `checkStateFile`, `checkStepRegistry`). ~250 lines.
- `src/commands/doctor/run.ts` — `runDoctor()` orchestrator + `import.meta.main` entrypoint. ~200 lines.
- `src/commands/doctor/checks.test.ts` — per-check unit tests with tmpdir fixtures. ~250 lines, ~12 tests.
- `src/commands/doctor/run.test.ts` — orchestrator integration tests. ~200 lines, ~7 tests.
- `src/integration/doctor-marketplace.test.ts` — marketplace-install smoke test. ~150 lines, ~2 tests.
- `commands/bmad-doctor.md` — Layer 1 thin-alias slash-command markdown. ~25 lines.

### Modified files

- `src/commands/index.ts` — add `export * as doctor from "./doctor/index.ts";` after the existing `next` re-export (Story 1.7 line 24). 1-line addition.

### Unchanged files (cited but not touched)

- `src/errors.ts`, `src/errors.test.ts` — registry stays at 16; doctor USES `BmadNotInstalledError`, `CorruptStateError`, etc. but does NOT extend.
- `src/io/log.ts`, `src/io/paths.ts`, `src/io/atomic-write.ts` — Story 1.3 foundational; doctor imports `info`/`error` from `log.ts`.
- `src/bmad-detect/index.ts`, `src/bmad-detect/detect-version.ts`, `src/bmad-detect/detect-skills.ts` — Story 1.9 mid-tier; doctor calls public APIs.
- `src/dag/index.ts`, `src/dag/build.ts`, `src/dag/seed-v6.x.ts`, etc. — Story 1.10 mid-tier; doctor calls `build()` + reads `SEED_BMAD_VERSION`.
- `src/personas/index.ts`, `src/personas/resolve.ts`, `src/personas/defaults.ts` — Story 1.11 mid-tier; doctor MAY call `resolvePersona()` (OPTIONAL deferred).
- `src/state/load.ts`, `src/state/save.ts`, `src/state/paths.ts` — Story 1.6 mid-tier; doctor calls `loadStateUnlocked()` only.
- `src/commands/next/args.ts` — Story 1.7; doctor re-exports `Result`, `ParseError` from this module.
- `commands/bmad-next.md` — Story 1.1 placeholder; Story 1.12 leaves it untouched.
- `package.json` — zero new deps.

## Dev Agent Record

### Context Reference

- _bmad-output/planning-artifacts/architecture.md §G CLI Surface lines 553-629 (FR53 exit codes)
- _bmad-output/planning-artifacts/architecture.md §1102-1123 (doctor directory layout)
- _bmad-output/planning-artifacts/architecture.md §1294-1295 (AR41 top-tier boundary)
- _bmad-output/planning-artifacts/architecture.md §1590-1592 (--doctor is a flag, not a separate command)
- _bmad-output/planning-artifacts/architecture.md §1659, §1671-1678 (read-only / lock-free + thin-alias contract)
- _bmad-output/planning-artifacts/prd.md FR40, FR41, FR47, FR49, FR50, FR53, FR54, NFR-M4, NFR-R1, NFR-I2, NFR-S1
- _bmad-output/implementation-artifacts/1-7-cli-argument-parser.md (parser pattern)
- _bmad-output/implementation-artifacts/1-9-bmad-detection.md (detector API + R2 cache layout)
- _bmad-output/implementation-artifacts/1-10-dag-seed-three-tier-registry.md (build() API)
- _bmad-output/implementation-artifacts/1-11-persona-resolution.md (resolvePersona API + ConfigError extension)
- src/errors.ts (BmadNotInstalledError, CorruptStateError lookup)
- src/bmad-detect/index.ts, src/dag/index.ts, src/personas/index.ts, src/state/load.ts (consumed APIs)
- src/commands/next/args.ts (Result<T,E> + ParseError pattern)
- commands/bmad-next.md (Layer 1 alias pattern)

### Agent Model Used

claude-opus-4-7[1m] (Opus 4.7 1M context) — bmad-create-story persona.

### Debug Log References

(populated by dev-story persona)

### Completion Notes

(populated by dev-story persona)

## Senior Developer Review (AI)

(populated by code-review persona)

## Change Log

- **2026-05-01**: Story file created (status `ready-for-dev`) — bmad-create-story persona. Drafted from epics.md §Story 1.12 lines 538-557, architecture.md §G + §1102-1123 + §1671-1678 + §AR41 lines 1294-1295 + §Coherence Validation Correction 2 lines 1590-1592, prd.md FR40/FR41/FR47/FR49/FR50/FR53/FR54/NFR-M4/NFR-R1/NFR-I2/NFR-S1. Mirrors Story 1.11 template structure. Files planned: 8 new (`src/commands/doctor/{index,args,run,checks}.ts` + 2 colocated tests + 1 integration smoke + `commands/bmad-doctor.md`); 1 modified (`src/commands/index.ts` 1-line barrel addition). FIRST integration story — composes bmad-detect/, dag/, personas/, state/, errors.ts into a single user-facing diagnostic command per architecture line 1672 (read-only / lock-free).
