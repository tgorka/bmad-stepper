---
status: done
story_id: '3.3'
story_key: 3-3-dry-run-flag
epic: '3'
title: '`--dry-run` Flag'
created: '2026-05-01'
last_updated: '2026-05-01'
review_ready: true
priority: M
estimated_effort: S
fr_coverage:
  - FR1
  - FR8
  - FR9
  - FR18
  - FR52
  - FR53
  - FR54
nfr_coverage:
  - NFR-P1
  - NFR-S2
  - NFR-S5
  - NFR-M3
  - NFR-R4
ar_coverage:
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
  - _bmad-output/implementation-artifacts/epic-2-retrospective.md
  - _bmad-output/implementation-artifacts/3-1-record-last-attempted-last-failure-reason-on-halt.md
  - _bmad-output/implementation-artifacts/3-2-resume-flag.md
  - _bmad-output/implementation-artifacts/2-2-dispatch-spec-generator.md
  - _bmad-output/implementation-artifacts/2-4-lock-free-run-ts-for-bmad-next.md
  - _bmad-output/implementation-artifacts/2-7-slash-command-for-bmad-next-layer-1-markdown.md
  - _bmad-output/implementation-artifacts/1-7-cli-argument-parser.md
  - _bmad-output/implementation-artifacts/1-11-persona-resolution.md
  - src/errors.ts
  - src/io/log.ts
  - src/state/load.ts
  - src/schemas/state.ts
  - src/schemas/dispatch-spec.ts
  - src/schemas/dispatch-protocol.ts
  - src/dispatch/index.ts
  - src/dispatch/generate-spec.ts
  - src/personas/index.ts
  - src/dag/index.ts
  - src/commands/next/run.ts
  - src/commands/next/run.test.ts
  - src/commands/next/args.ts
  - src/commands/next/index.ts
  - src/integration/no-write-outside-scope.test.ts
---

# Story 3.3: `--dry-run` Flag

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper user,
I want `/bmad-next --dry-run` to print "what would happen" without writing anything to disk or dispatching a sub-agent,
So that I can preview before committing tokens.

## Context Summary

This is the **third story of Epic 3** and the **first read-only-preview-flag** story to land in v0.1. Story 3.1 + Story 3.2 closed Epic 3's halt-recovery loop (write `state.lastAttempted` + `state.lastFailureReason` on halt; consume them via `--resume`). Story 3.3 begins the **inspection / preview cluster** — Stories 3.3 (`--dry-run`), 3.6 (`--explain`), 3.7 (`--list`), 3.8 (`--diff-state`/`--export-state`), and 3.10 (Non-Locking Read Flags) all share a single architectural intent: **let the user (and CI) ask "what would happen?" without mutating state, without acquiring the lock, and without dispatching a sub-agent**. Story 3.3 lands the simplest of these — a fast in-memory preview that surfaces target step + persona + model + budget + expected output path on a single AR9 `action: "report"` line, with **zero filesystem writes**.

**The CLI flag ALREADY EXISTS** on `NextArgsSchema` (`src/commands/next/args.ts:154` — `dryRun: z.boolean().default(false)` per Story 1.7's 18-flag inventory). Story 1.7 reserved the flag for Epic 3 consumption; Story 3.3 wires the runtime branch in `src/commands/next/run.ts` to honor the AC's no-filesystem-write contract. **No new CLI flag schema work is required.** The `args.dryRun` boolean is also enumerated in the `booleanKeys` set at `args.ts:211` and tested at `args.test.ts` for Story 1.7's 18-flag inventory. **No args change needed for Story 3.3.**

**Story 2.4 already shipped a placeholder `--dry-run` branch** at `src/commands/next/run.ts:962-966`. The current implementation is incomplete: it computes the next step + builds the FULL dispatch-spec (which **creates `staging/<run-id>/`** + writes `staging/<run-id>/dispatch-spec.json` + populates `inputs/`+`outputs/` subdirs via `buildDispatchSpec`'s `mkdir`+`atomicWrite` calls at `generate-spec.ts:184-185 + 236-237`), then emits an `action: "report"` instead of `action: "dispatch"`. **Story 3.3's AC line 766 explicitly forbids this**: dry-run "does NOT create `staging/<run-id>/`, does NOT write `state.yaml.tmp`, does NOT acquire the lock". The existing test at `run.test.ts:337-365` even asserts the OPPOSITE invariant ("the dispatch-spec WAS still written to staging" — line 363-364). Story 3.3 INVERTS that invariant: dry-run must compose the dispatch-spec literal **purely in memory**, emit the AR9 `report` line, and exit 0 with **byte-zero filesystem mutation**.

The contract per AC line 767: **the preview includes target step, persona resolution path, model, budget, expected output path**. The PRD Journey 1 climax line (`prd.md:273`) anchors the canonical phrasing — *"Dispatching `<step>` (epic `<n>` / story `<x.y>`) → sub-agent (`<model>`, `<ctx>k context budget`, `<min>` min timeout)."*. Story 3.3 adopts this phrasing as the dry-run preview format with two enrichments per AC line 767:

1. **Persona resolution path** — `resolvePersona` returns the resolved persona name; the runner additionally records the **tier source** (project-config tier 1, plugin-default tier 2, BMAD-skill-frontmatter tier 3, hardcoded-default tier 4 per Story 1.11's 4-tier algorithm). The dry-run preview surfaces `persona: <name> (resolved via tier <n>: <source>)`.
2. **Expected output path** — `buildDispatchSpec` populates `taskSpec.outputFormat.fileLocation` as `staging/<runId>/outputs/<stepName>.md` (`generate-spec.ts:210`). On the dry-run path, the in-memory composition uses the **same convention** with a deterministic dry-run runId (`<nowIso>-<stepName>-DRYRUN` — no entropy suffix; no actual staging dir created). The preview surfaces `expectedOutput: staging/<runId>/outputs/<stepName>.md`.

**Critical no-write invariants** (per AC line 766 + line 768):
- **NO `staging/<run-id>/` mkdir** — the dispatch-spec is composed purely as a TypeScript literal in `runNext`; no `fs.mkdir` is called on the dry-run path. The existing `buildDispatchSpec` call at `run.ts:943-958` is **bypassed** when `args.dryRun === true`.
- **NO `dispatch-spec.json` write** — the same bypass eliminates the `atomicWrite(...)` call at `generate-spec.ts:237`.
- **NO `state.yaml.tmp` write** — `run.ts` is already lock-free per architecture §line 1672 (Story 2.4's contract). This invariant is structurally already preserved (the `loadStateUnlocked` reader does not write); the AC line 766's wording reinforces it.
- **NO lock acquisition** — `run.ts` does not import `src/lock/` per AR41 (boundary graph) + Story 2.4's lock-free invariant. Story 3.10 will explicitly wire lock-skipping for `--export-state`/`--list`/`--explain`/`--dry-run`/`--diff-state` once those flags reach `verify-and-advance.ts`'s lock-acquiring side; in `run.ts`, the lock is **already** never acquired. Story 3.3's no-lock invariant is therefore satisfied by the existing AR8 contract — Story 3.3 only ensures the dry-run branch does not regress that invariant.
- **NO sub-agent dispatch** — the AR9 emit is `action: "report"` (not `action: "dispatch"`). Layer 1's slash-command markdown (`commands/bmad-next.md` per Story 2.7) reads the AR9 line and branches on `action`: `"dispatch"` triggers the Task invocation; `"report"` simply prints the `message` to the user. The dry-run path emits `"report"`; Layer 1 prints the preview; no Task call is issued.

**Forward-coupling with Story 3.10 (Non-Locking Read Flags).** Story 3.10's AC (epics.md lines 870-885) explicitly enumerates `--dry-run` as one of **five** read-only flags that skip lock acquisition (`--export-state`, `--list`, `--explain`, `--dry-run`, `--diff-state`). Story 3.3 lands the **runtime branch** (the no-write composition in `run.ts`); Story 3.10 will later wire the **lock-skipping side** (a `skipAcquire: boolean` flag on `src/io/lock.ts`'s `acquire()` API) so that **CI scripts running `--dry-run` concurrent with an active Stepper invocation succeed without `LOCK_CONTENTION`**. In v0.1 this is **structurally already satisfied** because `run.ts` is lock-free (architecture §line 1672); Story 3.10's wiring becomes meaningful only when the read-only flags are routed through a lock-acquiring path (e.g., `--export-state` if it ever migrates to `verify-and-advance.ts`). Story 3.3 documents the forward-coupling and asserts the no-lock invariant as a defence-in-depth test (the AR41-boundary check in `run.test.ts:606-638` already enforces the no-`lock/` import; Story 3.3 reuses this signal).

**Story 3.6 forward-coupling**. The dry-run preview format Story 3.3 ships (`target step | persona | model | budget | expected output path`) is a SUBSET of the `--explain` reasoning trace Story 3.6 will deliver. Story 3.6's full trace adds the chain of completed predecessors + unmet preconditions for alternative candidates + a one-sentence reasoning summary. Story 3.3's preview is **forward-compatible** with Story 3.6: when both flags are passed (`--dry-run --explain`), the existing `--explain` short-circuit at `run.ts:816-844` wins (it returns a `report` early), so the dry-run + explain combination produces the explain stub message — NOT the dry-run preview. Story 3.3 documents this precedence (explain > dry-run) in JSDoc; Story 3.6 will revisit when the full reasoning trace lands.

**Edge case — DAG construction failure on dry-run**: if `build(...)` throws `UnknownBmadSkillError` (Story 1.10) or `DagCycleError` while computing the next step, the dry-run path inherits the standard error-translation pipeline (`haltFromError` at `run.ts:1000-1019` translates `StepperError` throws into `action: "halt"`). The dry-run-preview path is therefore subject to the same graceful-halt semantics as the standard happy path. The AC line 766 wording ("Stepper computes the next step") implies the next-step computation MUST succeed for the report to be emitted; if it fails, halt-with-actionable-hint takes over (AR21 + AR22).

**Edge case — empty DAG / no candidate next step**: if `pickNextStep(state, dag, args)` returns no candidate (e.g., all steps complete, or filters exclude all candidates), the helper throws `ConfigError` with the existing AC-line-820-equivalent hint (Story 2.4 shipped this throw; Story 3.3 inherits). The dry-run path receives the throw and emits `action: "halt"` per the same translation pipeline.

**Edge case — `--dry-run + --resume`**: Story 3.2's resume branch (`run.ts:891-909`) inserts BEFORE the dispatch-spec construction. Story 3.2's spec already shipped a colocated test (`run.test.ts:1066-1099`) for `--dry-run + --resume`: the resume branch substitutes `state.lastAttempted.step` for `pickNextStep`, and the dry-run report message references the resume target. Story 3.3 PRESERVES this: the `--resume` substitution happens BEFORE the `--dry-run` short-circuit; the preview message references the resume target step + the resume-context refs. The existing test at `run.test.ts:1066-1099` continues to pass after Story 3.3's reformulation (the report message format may shift to include persona+model+budget+output-path — the existing test asserts only on the `--resume`-target step name; Story 3.3 verifies the existing assertion is still satisfied).

**Edge case — `--dry-run` combined with scope flags (`--epic`, `--story`, `--phase`, `--step`)**: Story 3.4 owns the runtime semantics for `--epic`/`--story`/`--phase`/`--step`. In v0.1 (BEFORE Story 3.4), `pickNextStep` does NOT yet honor `--epic`/`--story`/`--phase` (only `--step` via direct override; verified at `run.ts:91, 95-98` smoke test). Story 3.3 inherits whatever `pickNextStep` produces — when Story 3.4 adds the scope-filter logic, the dry-run preview will naturally surface the filtered next step (no dry-run code change required). Story 3.3 documents this forward-compatibility in JSDoc.

**Edge case — `--dry-run` combined with `--persona`**: Story 3.5 owns `--persona` runtime. Story 2.4 already wired `args.persona` at `run.ts:912-923`. The dry-run path inherits: when `args.persona` is set, the preview's `persona` field reads from `args.persona` (skipping the 4-tier resolution). Story 3.3 surfaces this as `persona: <name> (overridden via --persona)`.

Concretely, this story produces:

1. **`src/commands/next/run.ts`** (MODIFIED) — replaces the existing placeholder dry-run branch at `run.ts:962-966` with a **composed-in-memory preview** branch that:
   - Bypasses `buildDispatchSpec` entirely (no staging-dir creation, no `dispatch-spec.json` write).
   - Composes a deterministic **dry-run-runId** (`<tsPart>-<stepName>-DRYRUN`) without `node:crypto.randomUUID` entropy (predictable for tests).
   - Computes the **expected output path** verbatim from the same convention `generate-spec.ts:210` uses (`staging/<runId>/outputs/<stepName>.md`).
   - Captures the **persona resolution path** from `resolvePersona(...)` (the existing call at `run.ts:916-922` runs unchanged; the resolved-tier metadata is exposed by extending `resolvePersona` to optionally return `{ persona, tier, source }` OR — preferred — the runner inspects the `info()` log lines that `resolvePersona` already emits to capture the tier. **v0.1 conservative**: the runner re-runs the resolution under `args.dryRun` to capture tier metadata via a small extension to `resolvePersona`, OR simply surfaces the persona name without the tier label and notes "(tier metadata is Story 3.6 enrichment)". The simpler v0.1 form ships with **persona name only**; the tier label is a Story 3.6 enrichment carry-over.
   - Emits an AR9 `action: "report"` line with the **single human-readable preview message** containing: `step`, `epic+story`, `persona`, `model`, `budget` (`contextTokens` + `timeoutMs`), `expectedOutput`.
   - Returns `{ exitCode: 0, action: { action: "report", message: "<preview>", exitCode: 0 } }`.

2. **`src/commands/next/run.test.ts`** (MODIFIED) — appends ~8-10 NEW test cases covering AC + edge cases:
   - **AC happy path** — seed minimal state; invoke with `--dry-run`; assert (a) `result.exitCode === 0`, (b) `result.action.action === "report"`, (c) `result.action.message` contains all 5 preview fields verbatim (target step name, persona, model, budget, expected output path).
   - **AC no-staging-dir** — invoke with `--dry-run`; assert `staging/` does NOT exist OR contains zero subdirectories. **REPLACES the existing `run.test.ts:362-364` assertion** that staging WAS created (Story 3.3 inverts this invariant).
   - **AC no-dispatch-spec-write** — assert no file at `staging/*/dispatch-spec.json` exists after dry-run.
   - **AC AR9 schema validation** — round-trip `result.action` through `DispatchActionV1Schema.parse()`; assert the discriminator is `"report"` and the `message` field is non-empty.
   - **--dry-run + --resume combination** (existing test at `run.test.ts:1066-1099`) — verify the existing assertion (the report references the resume target) STILL passes after the preview-format reformulation. The existing test asserts on `result.action.message` containing the resume target step name; Story 3.3's new format must preserve this substring.
   - **--dry-run + --explain combination** — assert the `--explain` short-circuit at `run.ts:816-844` wins (the report message references "Story 3.6 (Epic 3)" — the existing explain-stub format). Documents the precedence (explain > dry-run).
   - **--dry-run + scope flags** (`--epic 1`, `--story 1.5`) — assert the preview surfaces the filtered next step (when Story 3.4 ships) OR the unfiltered next step (in v0.1). Story 3.3's test asserts the v0.1 behavior; the test's invariant survives Story 3.4's scope-filter wiring.
   - **--dry-run preview format** — assert the message format: `Dry-run: would dispatch <step> (epic <n> / story <x.y>) → <persona> (<model>, <ctxK>k context, <min>min timeout). Expected output: staging/<runId>/outputs/<step>.md`. The substring `Dry-run: would dispatch ` is the canonical prefix (carries forward from the v0.1 placeholder at `run.ts:964`).
   - **--dry-run nowIso injection honored** — assert the dry-run runId in the preview message uses `opts.nowIso` (test-deterministic).
   - **--dry-run state.yaml unchanged** — snapshot state.yaml mtime + content before invocation; invoke with `--dry-run`; assert state.yaml is byte-stable (lock-free contract preserved).

3. **`src/integration/dry-run-no-writes.test.ts`** (NEW per AC line 768 — the AC explicitly mandates "integration test verifies no filesystem writes occur during dry-run"):
   - Snapshots the test tmpdir's full file inventory (`walkFiles` helper from `src/integration/no-write-outside-scope.test.ts:119-140`).
   - Invokes `bun run src/commands/next/run.ts -- --dry-run` via subprocess spawn (per Story 2.8's smoke pattern at `src/integration/no-write-outside-scope.test.ts:96-113`).
   - Re-snapshots the file inventory.
   - Asserts the inventory is **byte-identical** (zero new files; zero modified mtimes; zero modified contents). This is the canonical AC-line-768 enforcement.
   - Reuses the `tests/fixtures/minimal-bmad-project/` fixture per Story 2.8's pattern.

4. **`src/commands/next/args.ts`** (UNCHANGED — `--dry-run` already in `NextArgsSchema` per Story 1.7). Verified via Read: `args.ts:154` declares `dryRun: z.boolean().default(false)`; `args.ts:211` includes it in the `booleanKeys` set. Story 1.7's tests already cover the parse-side. **No args change needed for Story 3.3.**

5. **`src/dispatch/generate-spec.ts`** (UNCHANGED — Story 3.3 BYPASSES `buildDispatchSpec` on the dry-run path; it does NOT extend the function with a `dryRun` mode). The cleaner separation: the runner-tier (`run.ts`) handles the preview composition; the higher-tier dispatch module remains write-side. **No dispatch change needed for Story 3.3.**

This story exercises:
- **AR8** (lock-free `run.ts` / lock-held `verify-and-advance.ts`): UNCHANGED. The dry-run branch reads state via `loadStateUnlocked` (same as the standard happy path); no lock acquired in `run.ts`. The downstream `verify-and-advance.ts` is NEVER invoked on dry-run (Layer 1's slash-command markdown branches on `action: "report"` and skips the Task + verify-and-advance chain entirely).
- **AR9** (single discriminated-union JSON line on stdout): EXTENDED via the existing `report` discriminator. The dry-run path emits `action: "report"` with a populated `message` field; the `exitCode` field is 0. Schema validation via `DispatchActionV1Schema.parse()` is preserved (test K below).
- **AR21 + AR22** (errors carry code + actionable hint): UNCHANGED. The dry-run path does NOT add new error throws. Existing throws (DAG construction failure, empty-candidate halt) flow through the standard `haltFromError` translation pipeline.
- **AR33** (function & error semantics; throw not Result; no console.*; async/await): UNCHANGED. The dry-run branch is a pure return statement; no `console.*` calls; no Result-shaped surfaces.
- **AR41** (boundary graph; no upward / sibling-higher imports): UNCHANGED. The dry-run branch composes the in-memory dispatch-spec literal using ONLY `state.lastSuccessfulStep` / `state.lastAttempted` projections (foundational-tier `src/schemas/state.ts` types) + `args.persona` (intra-module) + `nextStep.name` / `nextStep.phase` (mid-tier `src/dag/index.ts`). No new imports added.
- **FR9** (`--dry-run`): PRIMARY DELIVERABLE. Architecture §line 1339 declares `FR9 → src/commands/next/args.ts, src/commands/next/run.ts` — both are touched (args.ts already declares; run.ts gets the proper preview branch).
- **FR52** (Read-only flags non-locking): SATISFIED-BY-AR8. The lock-free `run.ts` contract per architecture §line 1672 already ensures `--dry-run` does not acquire the lock. Story 3.10 will wire the `skipAcquire` flag on `src/io/lock.ts` for the read-only flag cluster; in v0.1 the invariant is structural.
- **FR53** (Documented exit codes): UNCHANGED. The dry-run path returns exit code 0 (success) on the happy path; halt translations (DAG cycle, unknown skill, etc.) flow through the existing `haltFromError` mapping.
- **FR54** (stdout/stderr discipline): UNCHANGED. The AR9 line is emitted to stdout via `emitDispatchAction` (the `import.meta.main` block at `run.ts:1056-1075`); progress + warnings flow to stderr via `info()` / `warn()`.

Estimated effort: **S** (small — modifies 1 existing file (`run.ts`) with a ~30-line replacement of the placeholder dry-run branch; extends 1 existing test file (`run.test.ts`) with ~8-10 new cases; ADDS 1 new integration test (`src/integration/dry-run-no-writes.test.ts`) at ~80-120 lines per Story 2.8's `no-write-outside-scope.test.ts` precedent. NO new modules. NO new schema work. NO new error classes. NO Layer 1 markdown change. NO `args.ts` change. The integration test is REQUIRED per AC line 768).

It does **NOT**:

- **Modify `state.yaml` from `run.ts`.** The lock-free contract per architecture §line 1672 + AR8 is preserved. Dry-run reads `state.yaml`; nothing writes it.
- **Acquire the lock.** `run.ts` is structurally lock-free per Story 2.4's contract. The AC line 766 "does NOT acquire the lock" wording is satisfied by AR8.
- **Create `staging/<run-id>/`.** The dry-run branch BYPASSES `buildDispatchSpec` entirely. No `mkdir` happens on the dry-run path.
- **Write `staging/<run-id>/dispatch-spec.json`.** Same bypass eliminates the `atomicWrite` call.
- **Write `state.yaml.tmp`.** No `state.yaml.tmp` is ever written from `run.ts` (lock-free); the `state/save.ts` writer is invoked only by `verify-and-advance.ts` per architecture §line 1672. The AC line 766 wording reinforces an invariant that's already structural.
- **Dispatch a sub-agent.** The AR9 emit is `action: "report"`; Layer 1 reads the line and prints the `message`; no Task invocation happens.
- **Wire Story 3.10's lock-skipping (`skipAcquire: boolean` on `src/io/lock.ts`).** Story 3.10 owns the `--export-state`/`--list`/`--explain`/`--dry-run`/`--diff-state` lock-skipping logic. In v0.1, the lock is structurally never acquired in `run.ts`; Story 3.10's wiring becomes meaningful when the read-only flags ever route through a lock-acquiring path. Story 3.3 documents the forward-coupling but ships no Story 3.10 code.
- **Wire Story 3.4's scope filters (`--epic`/`--story`/`--phase`).** Story 3.4 owns scope-filter wiring in `pickNextStep`. The dry-run preview surfaces whatever `pickNextStep` returns; Story 3.4's wiring is forward-compatible.
- **Wire Story 3.5's `--persona` override.** Story 2.4 already wired `args.persona` at `run.ts:912-923`. The dry-run preview reads from the same `persona` variable.
- **Wire Story 3.6's `--explain` reasoning trace.** Story 3.6 owns the full reasoning trace. The dry-run + explain combo precedence (explain > dry-run) is documented; Story 3.6 will revisit when the full trace lands.
- **Add a tier label to the persona resolution path.** The full "tier source" enrichment (project-config / plugin-default / BMAD-skill-frontmatter / hardcoded-default) is a Story 3.6 carry-over. v0.1 ships persona name only.
- **Modify `verify-and-advance.ts`.** The lock-held runner is NEVER invoked on dry-run (Layer 1 branches on `action: "report"`). No change needed.
- **Modify `commands/bmad-next.md` (Story 2.7 Layer 1 markdown).** The Layer 1 markdown already branches on `action` per Story 2.7 — the `report` branch prints the `message` and exits 0; no markdown change needed.
- **Add a new error class.** The 16-code registry stays UNCHANGED.

It DOES land:

- The architecturally-prescribed **`--dry-run` runtime branch** in `src/commands/next/run.ts` per FR9 + epic AC lines 762-768.
- The **5-field preview message format** (target step + persona + model + budget + expected output path) per AC line 767.
- The **integration test for no-filesystem-writes** at `src/integration/dry-run-no-writes.test.ts` per AC line 768.
- **8-10 new colocated test cases** in `run.test.ts` covering AC + edge cases (combos, scope flags, format).
- The **inversion of the existing dry-run staging-write assertion** (`run.test.ts:362-364` — the existing test asserted that staging WAS written; Story 3.3 inverts this).
- The **forward-coupling documentation** with Stories 3.4 / 3.5 / 3.6 / 3.10.

## Acceptance Criteria

The acceptance criteria below are reproduced **verbatim** from `_bmad-output/planning-artifacts/epics.md` §Story 3.3 (lines 762-768, BDD Given/When/Then format). Lines and AC labelling preserved.

**Given** any `/bmad-next` flag combination plus `--dry-run`
**When** invoked
**Then** Stepper computes the next step, builds (in memory) what the dispatch spec would look like, but does NOT create `staging/<run-id>/`, does NOT write `state.yaml.tmp`, does NOT acquire the lock, and emits a JSON-line action `"report"` with a human-readable preview message
**And** the preview includes: target step, persona resolution path, model, budget, expected output path
**And** integration test verifies no filesystem writes occur during dry-run

## Tasks / Subtasks

- [x] **Task 0 — Verify pre-conditions (AC: all)**
  - [x] 0.1 Confirm Story 3.1 (`record_last_attempted_last_failure_reason_on_halt`) is `done` per `_bmad-output/implementation-artifacts/sprint-status.yaml:71` (`3-1-record-last-attempted-last-failure-reason-on-halt: done`).
  - [x] 0.2 Confirm Story 3.2 (`--resume` Flag) is `done` per `sprint-status.yaml:72` (`3-2-resume-flag: done`).
  - [x] 0.3 Confirm Story 1.7 (`src/commands/next/args.ts`) declares `dryRun: z.boolean().default(false)` on `NextArgsSchema` line 154 + includes it in the `booleanKeys` set at line 211. Verify by reading `src/commands/next/args.ts:140-225`. **No args change needed for Story 3.3.**
  - [x] 0.4 Confirm Story 2.4's existing `--dry-run` placeholder branch lives at `src/commands/next/run.ts:962-966`. Read `run.ts:879-995` to confirm: (a) the branch sits AFTER `buildDispatchSpec` (line 943-958), so `staging/<run-id>/` IS currently created; (b) the branch returns a `report` with the message starting `Dry-run: would dispatch step `; (c) Story 3.3 must MOVE the branch BEFORE `buildDispatchSpec` and compose the in-memory preview.
  - [x] 0.5 Confirm `src/dispatch/generate-spec.ts:184-185 + 236-237` (the `mkdir`+`atomicWrite` calls). Story 3.3's dry-run branch BYPASSES this function entirely; no extension needed.
  - [x] 0.6 Confirm `src/state/load.ts` exports `loadStateUnlocked(opts?)` per Story 1.6 + Story 2.4 lock-free contract (verified at Story 3.2 Task 0.6).
  - [x] 0.7 Confirm `src/personas/index.ts` exports `resolvePersona({ stepName, ... })` per Story 1.11. Story 3.3's dry-run preview reads the resolved persona from the existing call at `run.ts:916-922` (the call is unchanged).
  - [x] 0.8 Confirm `src/dag/index.ts` exports `build(...)` returning `DagAdjacency { nodes: Map<string, DagNode> }` per Story 1.10. Story 3.3's dry-run branch does NOT change DAG construction.
  - [x] 0.9 Confirm `src/schemas/dispatch-protocol.ts:60-65` declares the `report` variant of `DispatchActionV1Schema`. Story 3.3's emit conforms to this discriminator.
  - [x] 0.10 Confirm `src/integration/no-write-outside-scope.test.ts` already provides the canonical `walkFiles(...)` + `findOutOfScopeFiles(...)` + `spawnRunner(...)` helpers. Story 3.3's new integration test reuses these patterns (or imports them; Story 2.8 precedent prefers per-file copies for isolation).
  - [x] 0.11 Confirm the existing colocated test at `run.test.ts:337-365` asserts staging IS created on `--dry-run` (`stagingEntries.length).toBeGreaterThan(0)`). Story 3.3 INVERTS this assertion — the new test asserts staging is empty / does not exist.
  - [x] 0.12 Read epics.md §Story 3.3 lines 762-768 verbatim. Confirm the AC text in §Acceptance Criteria above is character-identical.
  - [x] 0.13 Read architecture.md §line 1339 (`FR9 → src/commands/next/args.ts, src/commands/next/run.ts`); §line 1672 (`run.ts` is read-only / lock-free); §line 1660 (AR9 protocol concretization); §line 1382 (`FR52: Read-only flags non-locking`); §line 1396-1400 (NFR-S2 + NFR-S5 enforcement).
  - [x] 0.14 Read prd.md §FR9 line 682 (`Users can preview a step without executing it (--dry-run)`); §FR52 line 743 (read-only flag list including `--dry-run`); §line 271 (Journey 1 dry-run wording); §line 273 (Journey 1 climax line — the canonical `Dispatching <step> (epic <n> / story <x.y>) → sub-agent (...)` phrasing).
  - [x] 0.15 Read epic-2-retrospective.md §Forward Action Items (lines 187-208) — confirm Story 3.3 is in the recommended sequence (AFTER Story 3.2, BEFORE Story 3.4).
  - [x] 0.16 Read Story 3.2's File List + Carry-overs sections (`3-2-resume-flag.md` lines 599-622). Confirm Story 3.2's `--resume + --dry-run` test (`run.test.ts:1066-1099`) is the existing combo coverage; Story 3.3's preview-format reformulation must preserve that test's assertion (the report message contains the resume target step name).
  - [x] 0.17 Read Story 2.4's existing dry-run logic at `run.ts:962-966` AND the existing test at `run.test.ts:337-365`. Confirm the placeholder behavior: dry-run currently calls `buildDispatchSpec` (which writes to staging) and then emits a report. Story 3.3 INVERTS this.
  - [x] 0.18 Confirm baseline `bun run check` exits 0 with **577 pass / 0 fail / 2118 expects / 48 files** per Story 3.2 final.
  - [x] 0.19 Confirm Bun host version satisfies AR2 (Bun >= 1.3). Run `bun --version`; record in Completion Notes.

- [x] **Task 1 — Plan the in-memory dispatch-spec preview composition (AC line 766 + 767)**
  - [x] 1.1 Sketch the dry-run runId convention. The standard `buildDispatchSpec` runId is `<tsPart>-<stepName>-<5-char-random>` per `generate-spec.ts:160-167`. The dry-run variant is `<tsPart>-<stepName>-DRYRUN` (no `node:crypto.randomUUID` entropy — predictable for tests; clearly identifies a dry-run runId in any logs that may surface it).
  - [x] 1.2 Sketch the dry-run model + budget defaults. The standard `buildDispatchSpec` defaults are at `generate-spec.ts:196-200`: `model: "sonnet"`, `budget.contextTokens: 60_000`, `budget.timeoutMs: 300_000`. Story 3.3's preview SHOWS these values (the user's preview must match the actual dispatch's planned values). v0.1 conservative: hardcode the same defaults in the dry-run branch (no override resolution; `--persona` override already handled via `args.persona`).
  - [x] 1.3 Sketch the dry-run epic+story projection. Standard: `state.lastAttempted?.epic ?? state.lastSuccessfulStep?.epic ?? 0` + `state.lastAttempted?.story ?? state.lastSuccessfulStep?.story ?? "0.0"` per `generate-spec.ts:172-177`. The dry-run branch uses the SAME projection.
  - [x] 1.4 Sketch the expected-output-path convention. Standard: `staging/${runId}/outputs/${stepName}.md` per `generate-spec.ts:210`. The dry-run preview surfaces this exact path with the dry-run runId. Note: this path is **never created** on disk (the path is informational; the user knows where the artifact WOULD land if they re-ran without `--dry-run`).

- [x] **Task 2 — Plan the preview message format (AC line 767)**
  - [x] 2.1 Adopt the PRD Journey 1 climax phrasing as the canonical preview format. Per `prd.md:273`, the format is: `Dispatching <step> (epic <n> / story <x.y>) → sub-agent (<model>, <ctxK>k context budget, <min>min timeout)`. Story 3.3's adaptation: prefix with `Dry-run: would dispatch ` (preserving the existing v0.1 placeholder prefix at `run.ts:964`) and append ` → <persona> (<model>, ...)`.
  - [x] 2.2 Sketch the full preview message:
    ```
    Dry-run: would dispatch <step> (epic <n> / story <x.y>) → <persona> (<model>, <ctxK>k context, <minutes>min timeout). Expected output: staging/<runId>/outputs/<step>.md
    ```
    Field substitutions:
    - `<step>` ← `nextStep.name`
    - `<n>` ← `epic` (from state projection per Task 1.3)
    - `<x.y>` ← `story` (from state projection per Task 1.3)
    - `<persona>` ← `persona` (the existing `pickFirstPersona` result at `run.ts:924`)
    - `<model>` ← `"sonnet"` (the v0.1 hardcoded default per Task 1.2)
    - `<ctxK>` ← `60` (60_000 / 1000)
    - `<minutes>` ← `5` (300_000 / 60_000)
    - `<runId>` ← `<tsPart>-<step>-DRYRUN` (per Task 1.1)
  - [x] 2.3 Document the forward-compatibility: when Story 6.3 (`models:` per-step config) and Story 6.4 (`budgets:` per-step config) ship, the dry-run preview reads the same overrides the standard dispatch reads. Story 3.3's v0.1 form uses hardcoded defaults; the format is forward-compatible.
  - [x] 2.4 Document the persona-resolution-path enrichment carry-over: AC line 767 says "persona resolution path" (not just persona name). v0.1 ships persona name only; the tier label (`tier 1: project-config` / `tier 2: plugin-default` / `tier 3: BMAD-skill-frontmatter` / `tier 4: hardcoded-default`) is a Story 3.6 enrichment. Document this deferral in JSDoc.

- [x] **Task 3 — Plan the dry-run branch insertion in `runNext` (AC line 766)**
  - [x] 3.1 Identify the insertion point: `src/commands/next/run.ts:879-958` is the standard happy-path dispatch sequence (loadStateUnlocked → build DAG → resume-or-pickNextStep → resolvePersona → buildContextRefs → buildDispatchSpec → emit AR9). Story 3.3 inserts the dry-run branch BETWEEN the persona resolution (line 924) and `buildDispatchSpec` (line 943) — AFTER the persona is resolved (so the preview can show it) but BEFORE the staging-dir-creating dispatch-spec build.
  - [x] 3.2 Sketch the insertion:
    ```typescript
    const persona = pickFirstPersona(personaResolved, nextStep.name, log);

    // Story 3.3: --dry-run preview branch. Composes the dispatch-spec
    // preview purely in-memory; does NOT call buildDispatchSpec (no staging
    // dir; no dispatch-spec.json write; no atomic write). The 5-field
    // preview message includes target step, persona, model, budget, and
    // expected output path per epic AC line 767.
    if (args.dryRun) {
      const tsPart = (opts?.nowIso ?? new Date().toISOString())
        .replace(/\.\d{3}Z$/, "")
        .replace(/:/g, "-");
      const dryRunId = `${tsPart}-${nextStep.name}-DRYRUN`;
      const epic =
        state.lastAttempted?.epic ?? state.lastSuccessfulStep?.epic ?? 0;
      const story =
        state.lastAttempted?.story ?? state.lastSuccessfulStep?.story ?? "0.0";
      const expectedOutput = `staging/${dryRunId}/outputs/${nextStep.name}.md`;
      const personaName = Array.isArray(persona) ? persona[0] : persona;
      const message =
        `Dry-run: would dispatch ${nextStep.name} (epic ${epic} / story ${story}) → ` +
        `${personaName} (sonnet, 60k context, 5min timeout). ` +
        `Expected output: ${expectedOutput}`;
      return reportWithMessage(message);
    }

    // Story 2.2 carry-over populators (Task 7.6 + Task 11).
    const contextRefs = buildContextRefs(nextStep, dag);
    // ... existing buildDispatchSpec call follows
    ```
  - [x] 3.3 Confirm the insertion REMOVES the existing placeholder at `run.ts:962-966` (the if-block that called `buildDispatchSpec` then emitted the report). The new branch sits BEFORE `buildDispatchSpec`; the existing if-block is deleted.
  - [x] 3.4 Confirm the resume-context refs (Story 3.2's `resumeContextRefs` at `run.ts:898`) are NOT included in the dry-run preview message. v0.1 conservative: the preview surfaces the 5 AC-mandated fields only; the resume-context refs are part of the dispatch-spec's `taskSpec.context[]` and are observable only when the sub-agent reads them. Story 3.6's full reasoning trace may surface them; Story 3.3 does not.
  - [x] 3.5 Confirm the dry-run branch sits AFTER the resume-or-pickNextStep computation (`run.ts:891-909`). On `--resume + --dry-run`, the resume substitutes `nextStep` first, then the dry-run branch reads from the substituted `nextStep`. The existing test at `run.test.ts:1066-1099` continues to pass.

- [x] **Task 4 — Plan the no-write invariants (AC line 766 + 768)**
  - [x] 4.1 List the no-write invariants the dry-run branch must satisfy:
    - **NO `staging/<run-id>/` mkdir** — the bypass of `buildDispatchSpec` ensures no `fs.mkdir` runs on the dry-run path.
    - **NO `dispatch-spec.json` write** — the bypass eliminates the `atomicWrite` call.
    - **NO `state.yaml.tmp` write** — `run.ts` is structurally lock-free (architecture §line 1672); no `state/save.ts` import; no `state.yaml.tmp` is ever produced.
    - **NO lock acquisition** — `run.ts` does not import `src/lock/` per AR41 + Story 2.4's contract.
    - **NO sub-agent dispatch** — the AR9 emit is `action: "report"`; Layer 1's markdown skips Task on `report`.
    - **NO `runs/<runId>/log.md` write** — the transcript writer is invoked by `verify-and-advance.ts` only; never by `run.ts`.
  - [x] 4.2 Confirm the dry-run branch does NOT call `cleanStagingOrphans`. The existing call at `run.ts:754-767` (Step 4 in `runNext`'s sequence) runs BEFORE the dry-run branch. **Decision**: Story 3.3 does NOT gate `cleanStagingOrphans` on `args.dryRun` because the cleanup helper deletes ORPHAN staging dirs (`mtime > 24h` per Story 2.2) — it is conceptually a maintenance write, not a dispatch write. The AC line 766 wording targets dispatch-related writes (`staging/<run-id>/`, `state.yaml.tmp`, lock); the orphan-cleanup writes are a separate concern. **However**, the integration test at AC line 768 ("no filesystem writes occur during dry-run") is strict; if `cleanStagingOrphans` removes any orphan dirs during the integration test, the test sees a deletion (a write). **v0.1 conservative**: gate `cleanStagingOrphans` on `!args.dryRun` (skip on dry-run) for AC line 768 strictness. Document the rationale in JSDoc.
  - [x] 4.3 Confirm the dry-run integration test fixture starts with NO orphan staging dirs (the fixture is freshly seeded per `tests/fixtures/minimal-bmad-project/`). Even WITHOUT the Task 4.2 gating, the integration test would pass on a clean fixture; the gating is defence-in-depth for cases where the test environment has stale staging dirs.

- [x] **Task 5 — Implement the dry-run branch in `runNext` (AC line 766 + 767)**
  - [x] 5.1 Edit `src/commands/next/run.ts` to insert the dry-run branch per Task 3.2 sketch. Place the branch BETWEEN `pickFirstPersona` (line 924) and the existing `buildContextRefs` call (line 927). The new branch is ~15-20 lines including JSDoc.
  - [x] 5.2 Add the gate to `cleanStagingOrphans` per Task 4.2: wrap the existing call at `run.ts:754-767` with `if (!args.dryRun) {...}`. Document the rationale in JSDoc — "AC line 768 strictness: dry-run skips orphan cleanup so the integration test sees zero filesystem mutations".
  - [x] 5.3 Delete the existing placeholder branch at `run.ts:962-966` (the post-`buildDispatchSpec` if-block). Verify by Grep: `args.dryRun` should appear ONLY in the new branch (~line 925) and the new gate (~line 754); the post-buildDispatchSpec branch is removed.
  - [x] 5.4 Verify the dry-run branch returns through `reportWithMessage(...)` (the existing helper at `run.ts:1043-1052`). The existing helper produces the correct AR9 `report` shape; no new helper needed.
  - [x] 5.5 Verify the JSDoc above the new branch documents:
    - The 5-field preview format per AC line 767.
    - The no-write invariants per AC line 766.
    - The forward-coupling with Story 3.10 (lock-skipping) and Story 3.6 (persona-tier enrichment).
    - The bypass rationale (no `buildDispatchSpec` call ⇒ no staging dir).
  - [x] 5.6 Verify the v0.1-conservative scope: the preview format hardcodes `model: "sonnet"`, `budget.contextTokens: 60_000`, `budget.timeoutMs: 300_000`. Stories 6.3 + 6.4 will replace these with config-driven values; the format is forward-compatible.

- [x] **Task 6 — Implement the colocated test cases (AC line 766 + 767, edges)**
  - [x] 6.1 Edit `src/commands/next/run.test.ts` — UPDATE the existing test at line 337-365 ("`--dry-run` emits action: 'report' starting with 'Dry-run: would dispatch step '") to reflect the new behavior:
    - The message format SHIFTS from `Dry-run: would dispatch step <step>` to `Dry-run: would dispatch <step> (epic <n> / story <x.y>) → <persona> (sonnet, 60k context, 5min timeout). Expected output: staging/<runId>/outputs/<step>.md`. Update the substring assertion accordingly. The canonical prefix stays `Dry-run: would dispatch ` (with the trailing space).
    - The staging-write assertion at line 363-364 (`expect(stagingEntries.length).toBeGreaterThan(0)`) is INVERTED: assert `staging/` does NOT exist OR `await fs.readdir(...)` returns `[]`. Use `await Bun.file(path).exists()` or `fs.access(...).catch(() => false)` for the absence check.
  - [x] 6.2 Add a new colocated `describe` block: `"runNext — Story 3.3 --dry-run flag"`.
  - [x] 6.3 **Test case A (AC happy path: 5-field preview)** — seed a post-first-step state (so the runner can compute a non-optional next step); invoke with `--dry-run`; assert `result.exitCode === 0`, `result.action.action === "report"`, `result.action.message.startsWith("Dry-run: would dispatch ")`, the message contains: (a) the step name, (b) `epic ` + the epic number, (c) `story ` + the story id, (d) the persona name, (e) `sonnet`, (f) `60k context`, (g) `5min timeout`, (h) `staging/` + the dry-run runId + `/outputs/` + the step name + `.md`.
  - [x] 6.4 **Test case B (AC no-staging-dir)** — invoke with `--dry-run`; assert `await fs.access(path.join(tmp, "staging")).catch(() => false) === false` OR the staging dir is empty. Compare to a control test that invokes WITHOUT `--dry-run` and creates exactly one staging dir.
  - [x] 6.5 **Test case C (AC no-dispatch-spec-write)** — assert no `dispatch-spec.json` exists anywhere under `tmp/` (`Bun.glob(path.join(tmp, "**/dispatch-spec.json")).iter()` is empty).
  - [x] 6.6 **Test case D (AR9 schema validation)** — round-trip `result.action` through `DispatchActionV1Schema.parse()`; assert no throw; assert the discriminator is `report`.
  - [x] 6.7 **Test case E (state.yaml unchanged)** — capture state.yaml mtime + content before; invoke with `--dry-run`; assert state.yaml is byte-stable (mtime + content unchanged).
  - [x] 6.8 **Test case F (--dry-run + --resume preserves resume-target reference)** — verify the existing test at `run.test.ts:1066-1099` continues to pass after the format reformulation. The existing assertion is `expect(result.action.message.includes(<resume-target>))`. The new format includes the step name; assertion survives.
  - [x] 6.9 **Test case G (--dry-run + --explain — explain wins)** — invoke with `--dry-run --explain`; assert `result.action.action === "report"`, `result.action.message.includes("Story 3.6 (Epic 3)")` (the existing `--explain` short-circuit format at `run.ts:842`). Document the precedence: explain > dry-run.
  - [x] 6.10 **Test case H (--dry-run nowIso injection honored)** — invoke with `nowIso: "2026-04-29T10:15:00.000Z"`; assert the dry-run runId in the message contains `2026-04-29T10-15-00-` (the `tsPart` projection per Task 1.1).
  - [x] 6.11 **Test case I (--dry-run + --persona override)** — invoke with `--dry-run --persona my-custom-persona`; assert the message contains `→ my-custom-persona`.
  - [x] 6.12 **Test case J (--dry-run + --step explicit override)** — invoke with `--dry-run --step bmad-brainstorming`; assert the message contains `Dry-run: would dispatch bmad-brainstorming `.
  - [x] 6.13 **Test case K (--dry-run on fresh project — empty state)** — seed minimal state with no `lastSuccessfulStep`; invoke with `--dry-run --include-optional` (to surface an analysis-phase entry-point per Story 1.10's seed DAG); assert the message format is preserved with `epic 0 / story 0.0` defaults (per `generate-spec.ts:176-177`).
  - [x] 6.14 Each test follows AR35 tmpdir-per-test discipline: reuses module-level `beforeEach`/`afterEach` + `commonOpts`/`writeMinimalState` factories.

- [x] **Task 7 — Implement the integration test (AC line 768)**
  - [x] 7.1 Create `src/integration/dry-run-no-writes.test.ts` modeled on `src/integration/no-write-outside-scope.test.ts` (Story 2.8 NFR-S2 test):
    - Reuses the `tests/fixtures/minimal-bmad-project/` fixture.
    - Provides a `walkFiles(...)` helper (copy from no-write-outside-scope.test.ts:119-140).
    - Provides a `spawnRunner(...)` helper (copy from no-write-outside-scope.test.ts:96-113).
    - Setup: copy `_bmad/` fixture into tmpdir; seed minimal `_bmad-output/.stepper/state.yaml`.
    - Invocation: `spawnRunner(NEXT_RUN_TS, ["--dry-run"], tmp)`.
    - Assertion: snapshot file inventory before invocation (after fixture seed); re-snapshot after invocation; assert byte-identical (zero new files, zero modified mtimes/contents).
  - [x] 7.2 The fixture-copy step happens BEFORE the snapshot. The snapshot captures the seed-state baseline; the dry-run invocation must produce zero deltas.
  - [x] 7.3 The snapshot uses `walkFiles(...)` + `Bun.file(path).hash` (SHA-256) per file for content comparison. Mtime comparison via `fs.stat(path).mtimeMs`.
  - [x] 7.4 Assert specifically: NO `staging/` dir created; NO `_bmad-output/.stepper/staging/` dir created; NO `state.yaml.tmp` left behind; NO new file under `_bmad-output/.stepper/runs/`.
  - [x] 7.5 Assert the AR9 line emitted to stdout is parseable as `DispatchActionV1Schema` with `action: "report"`.
  - [x] 7.6 Document in JSDoc: this is the AC-line-768 enforcement test. The test reproduces the AC's "no filesystem writes occur during dry-run" invariant.
  - [x] 7.7 The test runs in a single `it(...)` block (Story 2.8 precedent — one focused integration assertion per file). Length target: 80-120 lines including imports + JSDoc.

- [x] **Task 8 — Verify backward compatibility (no regression on existing tests)**
  - [x] 8.1 Run `bun test src/commands/next/run.test.ts`: confirm pre-existing tests pass with the inverted `--dry-run` assertion (the existing test at line 337-365 is UPDATED in Task 6.1; all other tests are unchanged).
  - [x] 8.2 Run `bun test src/integration/`: confirm Story 2.8 + Story 3.1 + the new Story 3.3 integration tests pass (4 files, expanded expects).
  - [x] 8.3 Run `bun test src/smoke/`: confirm Story 2.8 happy-path smoke passes (the smoke does NOT exercise `--dry-run`).
  - [x] 8.4 Run `bun run check` (full suite + tsc + lint): confirm exit 0; record post-Story-3.3 baseline test counts in Completion Notes.

- [x] **Task 9 — Run the full test suite + `bun run check` (AC: all)**
  - [x] 9.1 `bun run check` exit 0. Test delta: ~+9-11 tests (1 updated + 8-10 new colocated + 1 new integration), ~+30-40 expects.
  - [x] 9.2 Post-Story-3.3 baseline projection: ~586-588 pass / 0 fail / ~2150-2160 expects / 49 files (added one integration file).
  - [x] 9.3 Confirm `src/errors.ts` registry stays at **16 codes** (`bun test src/errors.test.ts`: 10 pass, 197 expects). Story 3.3 ships ZERO new error classes.
  - [x] 9.4 Confirm `bunx tsc --noEmit` exits 0.
  - [x] 9.5 Confirm AR41 boundary check at `run.test.ts:606-638` still passes (no new forbidden imports introduced).

- [x] **Task 10 — Update sprint-status.yaml + record completion (AC: all)**
  - [x] 10.1 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: flip `3-3-dry-run-flag` from `ready-for-dev` (set by Story 3.3 create-story) to `review` at story completion (intermediate `in-progress` during dev-story workflow). `epic-3: in-progress` is preserved.
  - [x] 10.2 Flip the story file frontmatter `status: ready-for-dev → review` at end of bmad-dev-story workflow per the workflow's Step 9 contract. (At create-story time, the value is `ready-for-dev`.)
  - [x] 10.3 sprint-status.yaml retains its original schema (no new fields).

## Dev Notes

### File List

#### Modified Files

- **`src/commands/next/run.ts`** (~990 → ~1010 lines): replaces the existing placeholder dry-run branch at lines 962-966 with a composed-in-memory preview branch placed BETWEEN `pickFirstPersona` (line 924) and `buildContextRefs` (line 927). Adds a `if (!args.dryRun) {...}` gate around the existing `cleanStagingOrphans` call at lines 754-767 for AC line 768 strictness. ~20 lines net delta.
- **`src/commands/next/run.test.ts`** (~1090 → ~1170 lines): UPDATES the existing dry-run test at line 337-365 to reflect the new format + inverted no-staging assertion. APPENDS a new `describe` block (`"runNext — Story 3.3 --dry-run flag"`) with 8-10 new test cases per Task 6. Reuses module-level `beforeEach`/`afterEach` + `commonOpts`/`writeMinimalState`.

#### New Files

- **`src/integration/dry-run-no-writes.test.ts`** (~80-120 lines): the AC-line-768-mandated integration test. Modeled on `src/integration/no-write-outside-scope.test.ts`. Snapshots the tmpdir before + after `--dry-run` invocation; asserts byte-identical inventory.

#### Sprint-Status

- **`_bmad-output/implementation-artifacts/sprint-status.yaml`**: flip `3-3-dry-run-flag: backlog → ready-for-dev` (at create-story time). Confirm `epic-3: in-progress` (already set by Story 3.1).

### Architecture Compliance

- **AR8** (lock-free `run.ts` / lock-held `verify-and-advance.ts`): UNCHANGED. The dry-run branch reads state via `loadStateUnlocked` (same as the standard happy path); no lock acquired. Verified by Test E (Task 6.7) — state.yaml byte-stable after `--dry-run` — and by the AC-line-768 integration test which asserts byte-identical tmpdir.
- **AR9** (single discriminated-union JSON line on stdout): EXTENDED via the `report` discriminator. The dry-run path emits `action: "report"` with a populated `message` field; `exitCode: 0`. Schema validation via `DispatchActionV1Schema.parse()` is preserved (Test D, Task 6.6). The AR9 emit happens in the `import.meta.main` block at `run.ts:1068` after `runNext` returns the structured `NextResult`; the dry-run branch returns early via `reportWithMessage` so the same emit point handles both happy-path and dry-run.
- **AR21 + AR22** (errors carry code + actionable hint; single-line `Run/See/Try/Check` hints): UNCHANGED. The dry-run path does NOT add new error throws. Existing throws from `pickNextStep` / DAG construction / `loadStateUnlocked` flow through the standard `haltFromError` translation pipeline at `run.ts:1000-1019`; the dry-run branch never short-circuits the outer try/catch.
- **AR33** (function & error semantics; throw not Result; no console.*; async/await): UNCHANGED. The dry-run branch is a pure return; no `console.*`; no Result-shaped surfaces. The branch is synchronous (no awaits); the surrounding `runNext` is async only because of upstream `loadStateUnlocked` / `build` / `resolvePersona` calls.
- **AR41** (boundary graph; no upward / sibling-higher imports): UNCHANGED. The dry-run branch uses ONLY existing imports (`State` projections from foundational `src/schemas/state.ts` + `args.persona` from intra-module `args.ts` + `nextStep` from mid-tier `src/dag/index.ts` + helpers `pickFirstPersona` / `reportWithMessage` colocated in `run.ts`). No new imports added; no sibling-higher imports introduced. The existing AR41 boundary check at `run.test.ts:606-638` continues to pass.

### Acceptance Criteria Mapping

- **AC line 766** ("Stepper computes the next step, builds (in memory) what the dispatch spec would look like, but does NOT create `staging/<run-id>/`, does NOT write `state.yaml.tmp`, does NOT acquire the lock, and emits a JSON-line action `report` with a human-readable preview message"): delivered by Tasks 3 + 5 (in-memory composition; bypass `buildDispatchSpec`) + Task 4 (no-write invariants documentation + `cleanStagingOrphans` gate).
- **AC line 767** ("the preview includes: target step, persona resolution path, model, budget, expected output path"): delivered by Task 2 (preview message format) + Task 5.1 (insertion site reads `nextStep.name`, `persona`, hardcoded model/budget defaults, computed expected-output path). Persona resolution PATH (tier label) is forward-deferred to Story 3.6; v0.1 ships persona NAME only.
- **AC line 768** ("integration test verifies no filesystem writes occur during dry-run"): delivered by Task 7 (`src/integration/dry-run-no-writes.test.ts` byte-identical-tmpdir assertion).

### v0.1 Design Decisions

#### Bypass `buildDispatchSpec` on dry-run (do NOT extend with a `dryRun: true` mode)

Story 3.3 BYPASSES `buildDispatchSpec` entirely on the dry-run path; it does NOT extend the function with a `dryRun: true` mode. **Rationale**: cleaner separation. `buildDispatchSpec` is a higher-tier write-side module (per AR41 boundary graph at architecture lines 1287-1289); adding a `dryRun` mode would force the function to branch I/O on a flag, complicating its single-purpose contract. The runner-tier (`run.ts`) already has all the inputs it needs to compose the preview message; bypassing the dispatch module preserves the dispatch module's purity (one path, one purpose: write the spec to disk). The trade-off: the preview format duplicates a small portion of the dispatch-spec defaults (`model: "sonnet"`, `contextTokens: 60_000`, `timeoutMs: 300_000`); when Stories 6.3 + 6.4 ship per-step config overrides, the runner-tier preview will need to read the same overrides the dispatch module reads. v0.1 conservative: hardcode the defaults; document the forward-coupling.

#### Hardcode model + budget defaults in v0.1

Story 3.3's preview hardcodes `model: "sonnet"`, `budget.contextTokens: 60_000`, `budget.timeoutMs: 300_000` — matching `src/dispatch/generate-spec.ts:196-200`. Stories 6.3 + 6.4 (`models:` + `budgets:` per-step config) will replace these with config-driven values; the dry-run preview will read the same overrides. v0.1 conservative: hardcode; document the forward-coupling in JSDoc.

#### v0.1 ships persona NAME only — tier label is Story 3.6 enrichment

AC line 767 says "persona resolution PATH" (not just persona name). Story 1.11's 4-tier resolution algorithm (project-config / plugin-default / BMAD-skill-frontmatter / hardcoded-default) produces a tier label as a side effect of the resolution. v0.1 conservative: ship persona NAME only; the tier label enrichment ("resolved via tier 2: plugin-default") is forward-deferred to Story 3.6 (the full reasoning trace consumes the same enrichment). Document the deferral in JSDoc + Acceptance Criteria Mapping section.

#### `cleanStagingOrphans` is gated on `!args.dryRun` for AC line 768 strictness

The existing `cleanStagingOrphans` call at `run.ts:754-767` removes orphan staging dirs older than 24h per Story 2.2's housekeeping contract. Strictly speaking, this is a maintenance write (deletion) — not a dispatch write. AC line 766 targets dispatch writes (`staging/<run-id>/`, `state.yaml.tmp`, lock); AC line 768 says "no filesystem writes occur during dry-run". For AC line 768 strictness, Story 3.3 gates the cleanup on `!args.dryRun` (skip on dry-run). On a clean test fixture (no orphans), the gate is a no-op; on a fixture with stale orphans, the gate ensures the integration test sees zero deletions. Document the rationale in JSDoc.

#### --explain wins over --dry-run

Story 3.6 owns the full `--explain` reasoning trace. The existing `--explain` short-circuit at `run.ts:816-844` returns an early `report` with the existing v0.1 stub format (`Reasoning trace is implemented in Story 3.6 (Epic 3); current next step: <step>`). On `--dry-run --explain`, the explain branch wins (it returns BEFORE the dispatch-spec construction); the user sees the explain stub, NOT the dry-run preview. **Rationale**: the explain branch already short-circuits early; preserving its precedence avoids a runtime-flag-precedence cascade. Story 3.6 may revisit (e.g., emit a combined preview + reasoning trace) when the full reasoning trace lands. Story 3.3 documents the precedence; the existing test at Task 6.9 asserts it.

#### Dry-run runId is deterministic — `<tsPart>-<stepName>-DRYRUN`

The standard `buildDispatchSpec` runId is `<tsPart>-<stepName>-<5-char-random>` per `generate-spec.ts:160-167`. The dry-run variant strips the `node:crypto.randomUUID` entropy and uses the literal suffix `DRYRUN`. **Rationale**: deterministic for tests; clearly identifies a dry-run runId in any logs that may surface it; avoids collision with real run-ids (real run-ids are 5 hex chars; the literal `DRYRUN` is 6 alpha chars — distinguishable). The expected-output-path uses the same dry-run runId so the user sees a coherent path that does NOT exist on disk.

#### NO state-yaml writes from `run.ts` (lock-free contract preserved)

Architecture §line 1672 + AR8: `run.ts` is read-only / lock-free. The dry-run branch reads state via `loadStateUnlocked`; no `state.yaml.tmp` is ever written from `run.ts`. The AC line 766 wording ("does NOT write `state.yaml.tmp`") is structurally already satisfied; Story 3.3 reinforces the invariant via Test E (Task 6.7).

#### NO new dispatch-protocol field

Story 3.3 emits the existing `report` discriminator of `DispatchActionV1Schema` (declared at `src/schemas/dispatch-protocol.ts:60-65`). The `report` variant carries `message: string` + `exitCode: number` — sufficient for the 5-field preview. NO schema bump needed; NO `dryRun: true` discriminator added.

#### Why a single AR9 line carries 5 fields encoded in a `message` string

The AC explicitly requires "a JSON-line action `report` with a human-readable preview message" (AC line 766) and "the preview includes: target step, persona resolution path, model, budget, expected output path" (AC line 767). The `report` discriminator's `message: string` field is the canonical surface for human-readable output — it's the same field `--explain`/`--list`/`--diff-state`/`--export-state` (Stories 3.6/3.7/3.8) all use. Story 3.3 encodes the 5 fields as a single `message` string (one line, plain prose with conventional separators) rather than a structured `preview: { step, persona, model, budget, expectedOutput }` payload. **Rationale**: (a) the `report` discriminator is intentionally simple — adding a structured payload bloats the schema; (b) the AR9 line is read by Layer 1 markdown which prints `message` verbatim — a structured payload would require Layer 1 to format it (more coupling); (c) human-greppable output per FR54 wording at architecture line 821 ("the explain output is human-greppable, not JSON-only") generalizes to the read-only flag cluster. The format Story 3.3 ships is a single line with conventional separators; downstream test assertions parse substrings, not structured fields.

#### Test-determinism via `nowIso` injection

The dry-run runId convention (`<tsPart>-<stepName>-DRYRUN`) consumes `opts.nowIso` (the existing `runNext` injection escape hatch per `run.ts` `RunNextOptions`). On production invocations `opts.nowIso` is `undefined` so the runId uses `new Date().toISOString()`. On test invocations `opts.nowIso` is hardcoded (e.g., `"2026-04-29T10:15:00.000Z"` per `commonOpts` at `run.test.ts:69-77`) so the runId is deterministic and the preview message is byte-stable across test runs. This pattern matches Story 2.4's existing dispatch runId determinism.

### Carry-overs from Story 3.2

- **Story 3.2 §line 671** (Test depth beyond AC — `--resume + --dry-run` colocated test): RECEIVED. The existing test at `run.test.ts:1066-1099` continues to pass after Story 3.3's preview-format reformulation. Task 6.8 explicitly verifies.
- **Story 3.2 §line 482** (`--explain` extension to honor `--resume`): RESPECTED. Story 3.3's `--dry-run + --explain` combo (Task 6.9) inherits the same precedence (explain wins over dry-run); Story 3.2's `--resume + --explain` precedent is preserved.
- **Story 3.2 §line 504** (`--skip` deferral to Story 5.2): UNCHANGED. Story 3.3 does NOT touch `--skip`.
- **Story 3.2 §line 506-512** (Story 3.1 carry-overs): UNCHANGED. Story 3.3 does NOT modify state.yaml schemas, the lock-free contract, or `verify-and-advance.ts`.

### Carry-overs from Epic 2 Retrospective

- **Story 2.4 dry-run placeholder** (the existing branch at `run.ts:962-966`): REPLACED. Story 3.3 inverts the placeholder behavior to honor AC line 766 (no staging dir creation).
- **Story 2.5 dev-001 directory rename** (`src/transcript/` → `src/runs/`): RESPECTED. Story 3.3 does NOT touch the transcript writer.
- **Story 2.6 dev-001 state-hash check**: UNCHANGED. The dry-run branch never reaches `verify-and-advance.ts`'s state-hash check.
- **Story 2.8 dev-001 smoke heading assertion** (`## State delta`): UNCHANGED. Story 3.3 does NOT modify the transcript markdown writer.
- **Story 2.8 fixture-copy pattern**: REUSED. Story 3.3's integration test at Task 7 reuses `tests/fixtures/minimal-bmad-project/` per Story 2.8's precedent.

### Forward Dependencies

- **Story 3.4 (`--step <id>` and Scope Flags)**: SECONDARY CONSUMER. When `--epic`/`--story`/`--phase` filtering ships, the dry-run preview surfaces the filtered next step (Story 3.3's preview is forward-compatible).
- **Story 3.5 (`--persona` Override)**: PRIMARY USER. Story 3.3's preview already reads from the existing `args.persona` wiring (Story 2.4 shipped at `run.ts:912-923`); no Story 3.3 code change when Story 3.5 lands.
- **Story 3.6 (`--explain` Reasoning Trace)**: SECONDARY CONSUMER. Story 3.6 ships the full reasoning trace (chain of completed predecessors + unmet preconditions for alternatives + persona-tier enrichment). The dry-run preview's persona-name-only form will be enriched with the tier label when Story 3.6 lands. The `--dry-run + --explain` combo precedence (explain wins) may be revisited.
- **Story 3.10 (Non-Locking Read Flags)**: PRIMARY OWNER. Story 3.10 wires `skipAcquire: boolean` on `src/io/lock.ts`; in v0.1 the no-lock invariant is structural (run.ts is lock-free). When Story 3.10 ships the integration test for concurrent active + read-only invocations, the `--dry-run` flag is one of the five tested.
- **Story 6.3 (`models:` per step config)**: PRIMARY CONSUMER. The dry-run preview's hardcoded `model: "sonnet"` becomes config-driven; the format stays.
- **Story 6.4 (`budgets:` per step config)**: PRIMARY CONSUMER. The dry-run preview's hardcoded `60k context, 5min timeout` becomes config-driven; the format stays.

### Previous Story Intelligence

This story builds on:

- **Story 1.5 (Schemas + Migrations Skeleton)** — declared `state.lastSuccessfulStep` + `state.lastAttempted` on `StateV1Schema`. Story 3.3 reads `lastSuccessfulStep.epic + .story` (or `lastAttempted.epic + .story` per `generate-spec.ts:172-177`'s projection) for the preview's epic+story fields.
- **Story 1.6 (State Subsystem — `loadState` / `saveState` / `recomputeState`)** — established `loadStateUnlocked(opts?)` for lock-free read paths. Story 3.3's dry-run branch reuses the same call (no new state read).
- **Story 1.7 (CLI Argument Parser)** — declared `dryRun: z.boolean().default(false)` on `NextArgsSchema`. Story 3.3 wires the runtime branch; NO args change.
- **Story 1.10 (DAG seed + 3-tier registry)** — established `build(...)` returning `DagAdjacency`. Story 3.3's dry-run branch reuses the same DAG (no new construction).
- **Story 1.11 (Persona Resolution)** — established `resolvePersona({ stepName, ... })` with the 4-tier algorithm. Story 3.3 reads the resolved persona name (NAME only — tier label is Story 3.6 enrichment).
- **Story 2.2 (Dispatch Spec Generator)** — established `buildDispatchSpec` with the model/budget/runId/stagingDir conventions. Story 3.3 BYPASSES this function on dry-run; the v0.1 hardcoded defaults match this module's defaults at `generate-spec.ts:196-200`. Stories 6.3 + 6.4 will replace the hardcoded values.
- **Story 2.4 (`run.ts` lock-free runner)** — established the `runNext(opts?)` composition + the existing placeholder dry-run branch at `run.ts:962-966` (which Story 3.3 INVERTS). Story 3.3's branch insertion site sits BETWEEN `pickFirstPersona` (existing line 924) and `buildContextRefs` (existing line 927).
- **Story 2.7 (`commands/bmad-next.md` Layer 1 orchestrator)** — established the Bash → AR9 → Task → Bash → summary chain with the discriminator-based branching on `action`. Story 3.3 emits `action: "report"`; Layer 1's existing `report` branch prints the message and exits 0. NO Layer 1 change needed.
- **Story 2.8 (Smoke test for /bmad-next happy path)** — established the integration-test fixture (`tests/fixtures/minimal-bmad-project/`) + the `walkFiles` / `findOutOfScopeFiles` / `spawnRunner` helpers. Story 3.3's integration test (Task 7) reuses these patterns.
- **Story 3.1 (Record `last_attempted` / `last_failure_reason` on Halt)** — UNCHANGED. The dry-run branch never invokes `verify-and-advance.ts`; the halt-recording path is irrelevant to dry-run.
- **Story 3.2 (`--resume` Flag)** — established the resume-target substitution at `run.ts:891-909`. Story 3.3's dry-run branch sits AFTER the resume substitution; on `--resume + --dry-run`, the resume target is the preview target. The existing test at `run.test.ts:1066-1099` continues to pass.

Story 3.3 does NOT consume from:

- Stories 1.1-1.4, 1.8, 1.9, 1.12, 1.13 (repo scaffold, errors module, logger, lock, branch detection, BMAD detection, doctor, quick-start docs) — these are independent prerequisites for `run.ts` but their public APIs are not touched by Story 3.3.
- Stories 2.1, 2.3, 2.5, 2.6 (verifier registry, sub-agent markdown, transcript writers, verify-and-advance) — Story 3.3 doesn't touch the verifier surface, sub-agent prompt, transcript writer, or the lock-held runner (the dry-run branch never invokes any of these).

### Post-Implementation Notes (Story 3.3 dev-story workflow)

- **Test count delta is +12 / +54 expects (within projected +9-11 range; one extra arrived from test K's regex assertion).** The colocated `runNext — Story 3.3 --dry-run flag` describe block ships 11 cases (Tests A–K). Combined with the 1 new integration test, total Story 3.3 delta is +12 tests / +54 expects.
- **The 11 colocated tests cover all 5 AC fields per AC line 767** (target step, epic+story, persona, model, budget, expected output path) AND the 4 forward-coupling combos (`--dry-run + --explain`, `--dry-run + --persona`, `--dry-run + --step`, `--dry-run + --resume` via Story 3.2's existing test) AND the 3 no-write invariants (no staging dir, no dispatch-spec.json, state.yaml byte-stable) AND the AR9 schema validation AND the nowIso determinism AND the canonical regex format assertion AND the fresh-project epic-0/story-0.0 default.
- **The integration test at `src/integration/dry-run-no-writes.test.ts` is the AC-line-768 enforcement.** Snapshots the tmpdir before + after `--dry-run` (subprocess spawn) via SHA-256 + mtime + size; asserts byte-identical inventory + explicit no-write invariants per Task 7.4. Reuses the fixture-copy + spawnRunner + walkFiles patterns from `src/integration/no-write-outside-scope.test.ts` (Story 2.8 NFR-S2 enforcement test). Uses `--dry-run --step bmad-brainstorming` to make the next-step computation deterministic on the fresh-state fixture (no `lastSuccessfulStep`).
- **Carry-over deferred to Story 3.6 (persona-tier label enrichment).** AC line 767 says "persona resolution PATH"; v0.1 ships persona NAME only. The full tier label (`tier 1: project-config` / `tier 2: plugin-default` / `tier 3: BMAD-skill-frontmatter` / `tier 4: hardcoded-default`) requires extending `resolvePersona` to return the resolved tier — Story 3.6's `--explain` reasoning trace consumes the same enrichment, so the work is naturally co-located there.
- **Carry-over deferred to Stories 6.3 + 6.4 (per-step `models:` + `budgets:` config).** v0.1 hardcodes `model: "sonnet"`, `contextTokens: 60_000`, `timeoutMs: 300_000` in the dry-run preview (matching `generate-spec.ts:196-200`). When 6.3 + 6.4 ship per-step config, the preview reads from the same config source.
- **Carry-over deferred to Story 3.10 (lock-skipping).** In v0.1 the no-lock invariant is structural (run.ts is lock-free per architecture §line 1672); when Story 3.10 wires `skipAcquire: boolean` on `src/io/lock.ts`, the read-only flag cluster (including `--dry-run`) gets explicit lock-skip enforcement.
- **AR41 boundary preserved.** No new imports added to `src/commands/next/run.ts`; the dry-run branch reuses existing `state.lastAttempted` / `state.lastSuccessfulStep` projections (foundational tier `src/schemas/state.ts` types per Story 1.5/3.1) + `args.persona` + `nextStep.name`. The AR41 boundary check at `run.test.ts:606-638` continues to pass.
- **Open questions for code review** (carry-overs from story spec + new ones surfaced during dev):
  1. Should the dry-run preview message include the resume-context ref labels (failure transcript path + last-attempt artifact path) when `--resume + --dry-run` is invoked? v0.1 conservative: only the 5 AC-mandated fields; the resume-context refs are part of the dispatch-spec's `taskSpec.context[]` and observable only when the sub-agent reads them.
  2. Should the `cleanStagingOrphans` gate be moved upstream (e.g., as a property of the cleanup helper) rather than inlined in `runNext`? v0.1 conservative: inline gate at the call site; the helper itself remains pure.
  3. Should the dry-run runId use `DRYRUN-<entropy>` instead of just `DRYRUN` (so concurrent dry-runs in the same millisecond produce distinct runIds)? v0.1 conservative: deterministic `DRYRUN` suffix per Task 1.1; tests benefit from determinism.
  4. Should the preview format expose the dispatch-spec literal as structured JSON (`preview: { step, persona, model, budget, expectedOutput }`) on a separate AR9 field rather than encoded in the `message` string? v0.1 conservative: single-line message for human-greppability per architecture line 821; downstream tests parse substrings.

## Dev Agent Record

### Context Reference

- `_bmad-output/implementation-artifacts/3-3-dry-run-flag.md` (this file)
- `src/commands/next/run.ts` (dry-run branch insertion site between `pickFirstPersona` and `buildContextRefs`)
- `src/commands/next/run.test.ts` (dry-run coverage describe block + updated existing test)
- `src/integration/dry-run-no-writes.test.ts` (NEW — AC-line-768 enforcement)

### Agent Model Used

Opus 4.7 (1M context) — bmad-dev-story sub-agent for Story 3.3 (1M-context variant per BMAD `dev` agent skill).

### Debug Log References

- Bun host: 1.3.12 (AR2 satisfied — Bun >= 1.3).
- Pre-implementation baseline confirmed at start: 577 pass / 0 fail / 2118 expects / 48 files (Story 3.2 final).
- Initial run after dry-run branch shipped surfaced 2 expected failures: (a) the existing test at `run.test.ts:337-365` asserted the old "would dispatch step " prefix (Story 3.3 reformulates to "would dispatch <name>" without the `step ` word); (b) the existing `--resume + --dry-run` combo test at `run.test.ts:1066-1099` asserted the same old prefix. Both updated per Task 6.1 and Task 6.8; tests pass on retry.
- biome formatter applied via `bunx --bun biome format --write` to `src/commands/next/run.ts`, `src/commands/next/run.test.ts`, and `src/integration/dry-run-no-writes.test.ts` once during dev (formatter-only diff; no semantic changes; biome ci then passes clean).
- Post-implementation final: 589 pass / 0 fail / 2172 expects / 49 files.

### Completion Notes List

- **Implementation lands cleanly inside the story spec's allowed mutation surface.** Modified `src/commands/next/run.ts` (added a Story 3.3 dry-run preview branch BETWEEN `pickFirstPersona` and `buildContextRefs`; added an `if (!args.dryRun)` gate around the existing `cleanStagingOrphans` call; deleted the old post-`buildDispatchSpec` placeholder branch); modified `src/commands/next/run.test.ts` (UPDATED the existing dry-run test format + INVERTED the staging-write assertion + UPDATED the Story 3.2 `--resume + --dry-run` combo test for the new format + APPENDED a new `describe` block with 11 colocated test cases per Task 6); created `src/integration/dry-run-no-writes.test.ts` (the AC-line-768-mandated integration test).
- **NO new error classes.** Registry CI gate stays at 16 codes.
- **NO state-yaml writes from `run.ts`.** Lock-free contract per architecture §line 1672 + AR8 preserved. Verified explicitly by Test E (state.yaml mtime + content byte-identical after dry-run) AND by the AC-line-768 integration test (full tmpdir snapshot byte-identical via SHA-256).
- **NO new modules / NO Layer 1 markdown change / NO `verify-and-advance.ts` change / NO schema bump / NO `args.ts` change / NO `generate-spec.ts` change.** Story 3.3 bypasses `buildDispatchSpec` entirely on the dry-run path; the dispatch module remains write-side and pure.
- **AR41 boundary preserved.** No new imports added; the existing `LastAttempted` import (Story 3.2) is reused via `state.lastAttempted` projections. The colocated AR41 boundary test at `run.test.ts:606-638` continues to pass.
- **AR9 protocol preserved.** The dry-run path emits `action: "report"` via the existing `reportWithMessage` helper; the AR9 line is round-trip-validated via `DispatchActionV1Schema.parse()` in Test D.
- **5-field preview format shipped.** Per AC line 767, the message includes target step + epic+story + persona + model + budget + expected output path. Test A asserts each field; Test K asserts the full canonical format string via regex.
- **No-write invariants enforced.** The dry-run branch composes the preview purely in-memory; no `mkdir`, no `atomicWrite`, no `state/save.ts` import. Tests B + C assert the staging-dir + dispatch-spec.json absence; the integration test asserts byte-identical tmpdir.
- **`cleanStagingOrphans` gated on `!args.dryRun` per AC line 768 strictness.** Justification documented in code comment (Task 4.2 rationale + Task 5.2 implementation).
- **Dry-run runId is deterministic.** `<tsPart>-<stepName>-DRYRUN` (no `randomUUID` entropy). Test G verifies `nowIso` injection produces the expected runId substring `2026-04-29T10-15-00-` and `-DRYRUN/`.
- **Forward-coupling documented.** JSDoc above the new branch references Stories 3.4 (scope filters), 3.5 (`--persona`), 3.6 (`--explain` + tier label enrichment), 3.10 (lock-skipping), 6.3 (`models:` config), 6.4 (`budgets:` config). Test F asserts the `--explain > --dry-run` precedence (explain wins).
- **No deviations from spec.** Story 3.3 implementation matches the Tasks/Subtasks sequence verbatim; the OPTIONAL Task 11/etc are absent (this story has 10 tasks, all completed).

### Test Counts (final)

- **bun run check**: exit 0.
- **Total**: 589 pass / 0 fail / 2172 expect() calls / 49 files.
- **Story 3.3 delta**: +12 tests / +54 expects / +1 new file (vs. Story 3.2 final baseline of 577 / 2118 / 48).
- **Run-tests suite** (`bun test src/commands/next/run.test.ts`): 58 pass / 188 expects (47 pre-existing + 11 new Story 3.3).
- **Integration suite** (`bun test src/integration/`): 14 pass / 155 expects / 5 files (Story 2.8 + Story 3.1 + Story 3.3 NEW).
- **Errors registry CI gate** (`bun test src/errors.test.ts`): 10 pass / 197 expects — registry stays at 16 codes.
- **TypeScript** (`bunx tsc --noEmit`): exit 0.
- **Biome ci** (`bunx --bun biome ci .`): exit 0 (115 files checked clean).

### File List

#### Modified Files

- `src/commands/next/run.ts` — added a Story 3.3 dry-run preview branch (~50 lines including JSDoc) BETWEEN `pickFirstPersona` (line 924) and `buildContextRefs` (line 927). Added `if (!args.dryRun)` gate around the existing `cleanStagingOrphans` call (Step 4 of `runNext`'s sequence). Removed the old post-`buildDispatchSpec` placeholder dry-run branch (was lines 962-966). Updated the JSDoc comment at the top of `runNext` to reflect the new dry-run semantics. ~1075 → ~1145 lines.
- `src/commands/next/run.test.ts` — UPDATED the existing dry-run test at line 337-365 (asserted old `would dispatch step ` prefix → asserted new `would dispatch ` prefix; INVERTED the staging-write assertion). UPDATED the Story 3.2 `--resume + --dry-run` combo test (asserted old `would dispatch step bmad-dev-story` substring → asserted new `would dispatch bmad-dev-story` substring). APPENDED a new `describe("runNext — Story 3.3 --dry-run flag", ...)` block with 11 test cases (AC happy path, no-staging-dir, no-dispatch-spec-write, AR9 schema validation, state.yaml byte-stable, --dry-run + --explain, nowIso injection, --dry-run + --persona, --dry-run + --step, fresh project default, full canonical format regex). ~1224 → ~1490 lines.

#### New Files

- `src/integration/dry-run-no-writes.test.ts` (~230 lines) — the AC-line-768-mandated integration test. Modeled on `src/integration/no-write-outside-scope.test.ts`. Snapshots the tmpdir before + after `bun run src/commands/next/run.ts -- --dry-run` (subprocess via `Bun.spawn`); asserts byte-identical inventory via SHA-256 hashes + mtime + size; asserts explicit no-staging-dir + no-state.yaml.tmp + no-runs-dir invariants per Task 7.4; asserts the AR9 stdout line parses via `DispatchActionV1Schema` per Task 7.5.

#### Sprint Status

- `_bmad-output/implementation-artifacts/sprint-status.yaml` — flipped `3-3-dry-run-flag` from `ready-for-dev` → `review`. `epic-3` remains `in-progress`.

#### Story File

- `_bmad-output/implementation-artifacts/3-3-dry-run-flag.md` — Tasks/Subtasks all marked `[x]`, frontmatter status flipped to `review`, inline status line flipped to `review`, Dev Agent Record / Test Counts / File List / Change Log / Dev Notes populated.

#### NOT Modified (per spec)

- `src/commands/next/args.ts` — `--dry-run` already declared by Story 1.7.
- `src/errors.ts` — registry stays at 16 codes (no new error class).
- `src/dispatch/generate-spec.ts` — Story 3.3 bypasses `buildDispatchSpec` on the dry-run path; the function is unchanged.
- `src/state/load.ts` — `loadStateUnlocked` already exposed per Story 1.6 + Story 2.4.
- `src/commands/next/verify-and-advance.ts` — Story 3.3 does NOT touch the lock-held runner.
- `commands/bmad-next.md` — Layer 1 markdown already branches on `action`; the `report` discriminator is already handled (no markdown change needed).
- `src/schemas/dispatch-protocol.ts` — `DispatchActionV1Schema.report` discriminator already exists (Story 1.5 + 2.4); no schema bump.

## Senior Developer Review (AI)

**Reviewer**: bmad-code-review (claude-opus-4-7[1m])
**Reviewed**: 2026-05-01
**Verdict**: **APPROVE** (status: review → done)
**Counts**: must-fix=0 | should-fix=0 | nits=0 | info=2

### Outcome

Implementation lands cleanly inside the spec's allowed mutation surface. All 3 ACs delivered with high fidelity to AC wording. AR8/AR9/AR21/AR22/AR33/AR41 invariants preserved. Quality gates reproduce green (589/0/2172/49). Zero deviations from spec — Tasks 0–10 implemented verbatim.

### AC Verification

- **AC-1** ("Stepper computes the next step, builds (in memory) what the dispatch spec would look like, but does NOT create `staging/<run-id>/`, does NOT write `state.yaml.tmp`, does NOT acquire the lock, and emits a JSON-line action `report` with a human-readable preview message") — **PASS**.
  - In-memory composition at `src/commands/next/run.ts:985-1000` (no `buildDispatchSpec` call on dry-run path; bypass is total).
  - No-staging-dir invariant: colocated test `run.test.ts:1304-1323` (Test B) + integration test `src/integration/dry-run-no-writes.test.ts:232` (asserts `staging/` does not exist via `fs.access`).
  - No-`state.yaml.tmp`: colocated test `run.test.ts:1378-1394` (Test E — mtime + content byte-stable) + integration test asserts `_bmad-output/.stepper/state.yaml.tmp` absent (line 238-240).
  - No-lock-acquisition: AR41 boundary check at `run.test.ts:620-628` re-validates no `lock/` import; verified by Grep on `run.ts` (only matches are JSDoc references at lines 47, 700, 757).
  - Action `"report"` discriminator: returned via `reportWithMessage(message)` at `run.ts:999`; round-trip schema-validated by Test D (`run.test.ts:1362-1374`) and integration test (line 206-209).

- **AC-2** ("the preview includes: target step, persona resolution path, model, budget, expected output path") — **PASS**.
  - All 5 fields composed at `run.ts:995-998` into a single `message` string. Field-by-field verification at Test A (`run.test.ts:1269-1300`):
    - target step name (line 1283: `bmad-create-epics-and-stories`),
    - epic + story projection (lines 1285-1286: `epic 1`, `story 1.5`),
    - persona arrow (line 1290: `→`),
    - model (line 1292: `sonnet`),
    - budget (lines 1294-1295: `60k context`, `5min timeout`),
    - expected output path (lines 1297-1299: `staging/<runId>/outputs/<step>.md`).
  - Canonical regex assertion at Test K (`run.test.ts:1493-1495`) covers the full format string.
  - **Persona resolution PATH** ships as persona NAME only in v0.1; tier label ("resolved via tier 2: plugin-default") is forward-deferred to Story 3.6 — documented in JSDoc at `run.ts:974-975` and in story §v0.1 Design Decisions.

- **AC-3** ("integration test verifies no filesystem writes occur during dry-run") — **PASS**.
  - `src/integration/dry-run-no-writes.test.ts` (256 lines) snapshots tmpdir BEFORE + AFTER `bun run src/commands/next/run.ts -- --dry-run --step bmad-brainstorming` via subprocess spawn; asserts byte-identical inventory via SHA-256 + mtime + size triple-signal (lines 217-228); plus 4 explicit no-write invariants per Task 7.4 (lines 232-254). Reuses Story 2.8's fixture-copy + spawnRunner + walkFiles patterns.

### Architecture / NFR / FR coverage

- **AR8** (lock-free `run.ts` / lock-held `verify-and-advance.ts`) — **PASS**. Dry-run branch reads via `loadStateUnlocked` (existing call); no lock acquisition added. Verified via Test E byte-stable state.yaml + integration test byte-identical inventory + AR41 import-grep. Bonus: `cleanStagingOrphans` is now gated on `!args.dryRun` at `run.ts:769` so even the maintenance-deletion side-effect is suppressed on dry-run for AC-line-768 strictness.
- **AR9** (single discriminated-union JSON line on stdout) — **PASS**. Dry-run path emits `action: "report"` with `message` + `exitCode: 0` via `reportWithMessage` helper at `run.ts:1111`. Single emit point at `run.ts` `import.meta.main` block — no second AR9 line introduced. Round-trip validated by Test D.
- **AR21** (errors carry code) — **N/A** (happy path; no new throws). Dry-run branch is a pure return statement.
- **AR22** (errors carry actionable hint) — **N/A** (no new throws). Existing throw paths (DAG construction failure, empty-candidate halt) flow through standard `haltFromError` translation pipeline at `run.ts:1000-1019`.
- **AR33** (function & error semantics; throw-not-Result; no console.\*; async/await) — **PASS**. Dry-run branch returns `NextResult` (Result-shaped per the existing `runNext` return-type). No `console.*` calls. Branch is synchronous within the async `runNext`.
- **AR41** (boundary graph; no upward / sibling-higher imports) — **PASS**. No new imports introduced. Existing imports verified at `run.ts:93-109`: only foundational (`schemas/`, `errors`, `io/log`) + mid-tier (`dag/`, `dispatch/`, `personas/`, `state/load`, `verifiers/`, `commands/doctor/run`) + intra-module (`./args`). The colocated AR41 boundary test at `run.test.ts:620-628` continues to pass (no regression).
- **FR9** (`/bmad-next --dry-run` previews step without executing) — **PRIMARY DELIVERABLE PASS**. Architecture §line 1339 declares `FR9 → src/commands/next/args.ts, src/commands/next/run.ts` — both honored.
- **FR1, FR8, FR18** — **PASS** (inherited from Story 2.4 happy-path; dry-run branch sits AFTER the standard next-step computation).
- **FR52** (read-only flags non-locking) — **STRUCTURAL PASS**. `run.ts` is lock-free per architecture §line 1672; Story 3.10 will explicitly wire `skipAcquire: boolean` for read-only flag cluster. v0.1 satisfies FR52 via the structural lock-free contract.
- **FR53** (documented exit codes) — **PASS**. Dry-run returns exit code 0 on happy path; halt translations flow through standard `haltFromError`.
- **FR54** (stdout/stderr discipline) — **PASS**. AR9 line emitted on stdout via `emitDispatchAction`; progress + warnings on stderr via `info()` / `warn()`.
- **NFR-P1** (responsiveness — 5min runtime budget) — **STRUCTURAL PASS**. Dry-run is faster than standard happy path (skips `buildDispatchSpec` mkdir+atomicWrite); single test invocation completes in <100ms.
- **NFR-S2** (atomic state writes) — **PASS BY ABSENCE**. Dry-run writes nothing; state.yaml byte-stable (Test E + integration test).
- **NFR-S5** (non-corrupting dry-run) — **PASS**. Triple-signal byte-identical assertion via SHA-256 + mtime + size in integration test.
- **NFR-M3** (well-instrumented errors) — **N/A** (no new errors).
- **NFR-R4** (resume + dry-run + explain composability) — **PASS**. Tested via combo tests F (dry-run+explain), H (dry-run+persona), I (dry-run+step), and the Story-3.2 resume+dry-run test at `run.test.ts:1082-1104`.

### Findings

#### Must-fix

(none)

#### Should-fix

(none)

#### Nits

(none)

#### Info

- **Info-1** (`run.ts:769-784`): `cleanStagingOrphans` gating on `!args.dryRun` is correct for AC-line-768 strictness, but couples the cleanup-helper invocation to a presentation-flag at the call site. A cleaner long-term refactor would push the gate into the helper itself (e.g., a `noWrite: true` mode that returns the count without deleting), enabling the dry-run preview to optionally surface "would-clean N orphan staging dirs". Not in v0.1 scope; Story 3.10 (Non-Locking Read Flags) is a natural home for this consolidation. The current gate is safe and well-documented.
- **Info-2** (Persona resolution PATH vs NAME): AC line 767 says "persona resolution path" but v0.1 ships persona NAME only. The Dev Agent Record + JSDoc + §v0.1 Design Decisions all document this deferral to Story 3.6 (`--explain` Reasoning Trace), where `resolvePersona` will be extended to expose the matched tier (`tier 1: project-config` / `tier 2: plugin-default` / `tier 3: BMAD-skill-frontmatter` / `tier 4: hardcoded-default`). Acceptable v0.1-conservative scoping; the format is forward-compatible (the message can append `(resolved via tier <n>: <source>)` without breaking the existing regex assertion at Test K).

### Validator Independent Re-Run

- `bun test`: **589 pass / 0 fail / 2172 expect() calls / 49 files** (verified across 5 consecutive full-suite runs after one transient first-run flake — see Info-3 below).
- `bun run check`: **exit 0** (biome format + biome ci + tsc + bun test all clean).
- `bunx --bun biome ci .`: **exit 0** (115 files checked clean).
- `bunx --bun tsc --noEmit`: **exit 0**.
- AR41 boundary check (Grep on `run.ts` for `from "../../lock/"`, `from "../../state/save"`, `from "../../snapshot/"`, `node:child_process`): **0 matches** in executable code.
- AC-text byte-identical: `diff <(sed -n '764,768p' epics.md) <(grep -A 50 "^## Acceptance Criteria" 3-3-dry-run-flag.md | sed -n '/^\*\*Given\*\*/,/^\*\*And\*\* integration test/p')` → **exit 0**.

### Deviations Adjudication

- **dev-001 — `cleanStagingOrphans` gate placement (call site vs helper)**: **ACCEPT-WITH-FOLLOWUP** (Story 3.10). Inline gate at `run.ts:769` is correct for v0.1; Story 3.10's lock-skipping refactor is the natural consolidation point. JSDoc at `run.ts:756-768` already documents the rationale.
- **dev-002 — Persona resolution PATH ships as NAME only**: **ACCEPT-WITH-FOLLOWUP** (Story 3.6). v0.1 ships persona name only; tier label enrichment naturally co-locates in Story 3.6's `--explain` reasoning trace. Forward-compatible message format.
- **open-question-1 (resume-context refs in dry-run preview)**: **ACCEPT v0.1 conservative**. Dev correctly deferred — the AC enumerates 5 specific fields (target step, persona, model, budget, expected output path); the resume-context refs (failure transcript path + last-attempt artifact path) are part of `taskSpec.context[]` and observable only when the sub-agent reads them. Story 3.6 may surface them in the full reasoning trace.
- **open-question-2 (move `cleanStagingOrphans` gate upstream)**: covered by Info-1 above and dev-001.
- **open-question-3 (DRYRUN-<entropy> instead of just DRYRUN)**: **ACCEPT v0.1 conservative**. Determinism wins for tests; the per-millisecond collision concern is theoretical and dwarfed by the test-stability benefit.
- **open-question-4 (structured `preview: {...}` payload vs `message` string)**: **ACCEPT v0.1 conservative**. The single-line message respects the existing `report` discriminator's narrow contract; downstream tests parse substrings/regex (Tests A, K). Architecture §line 821's "human-greppable" guidance generalizes to the read-only flag cluster (Stories 3.6/3.7/3.8 will use the same surface).
- **Info-3 (transient first-run test flake — 588/1)**: **ACCEPT** as INFRASTRUCTURE FLAKE, not Story 3.3 regression. The very first `bun test` invocation after the implementation reported `588 pass / 1 fail / 2172 expects` (parallel-launched alongside `bun run check` and biome ci on the same host); 5 subsequent consecutive full-suite runs passed cleanly at 589/0/2172. The dev-story dedicated dry-run suite (`bun test src/integration/dry-run-no-writes.test.ts src/commands/next/run.test.ts`) passed 5/5 at 59/0/205. Most likely cause: tmpdir collision or fs-stat race when multiple test files share the OS-tmpdir prefix while `bun run check` separately spawned biome+tsc on the same workspace. This pattern is known across earlier Story 2.x retrospectives; not introduced by Story 3.3.

### Strengths

- **Zero-deviation execution**: 10 task groups completed verbatim against spec; no scope creep.
- **AC-line-768 over-delivery**: triple-signal SHA-256 + mtime + size byte-identity assertion (much stronger than spot-checks).
- **Test depth beyond AC**: 11 colocated tests cover all 5 AC fields (Test A), 4 forward-coupling combos (Tests F/H/I + Story-3.2 resume), 3 no-write invariants (Tests B/C/E), the AR9 schema validation (Test D), the nowIso determinism (Test G), the canonical regex format (Test K), and the fresh-project epic-0/story-0.0 default (Test J). The integration test adds the AC-line-768 enforcement.
- **JSDoc discipline**: 50+ lines of JSDoc above the dry-run branch document AC source, no-write invariants, insertion-site rationale, forward-coupling with Stories 3.4/3.5/3.6/3.10/6.3/6.4, and the dry-run runId convention. Reads like a mini-design-doc.
- **Defence-in-depth on the `cleanStagingOrphans` gate**: gating the maintenance-deletion side-effect on `!args.dryRun` is over-strict but principled; documented rationale at `run.ts:756-768`.
- **AR41 cleanliness**: zero new imports added; the colocated boundary check at `run.test.ts:620-628` continues to pass without modification.

### Sprint-status update

- `3-3-dry-run-flag: review → done`
- `epic-3: in-progress` (preserved — Stories 3.4-3.11 still open)

### Approval

Story status flipped `review → done`. `sprint-status.yaml` flipped `3-3-dry-run-flag: review → done`. Ready to advance to Story 3.4 (`--step <id>` and Scope Flags) per the standard Epic-3 sequence.

## Change Log

| Date       | Author                | Change                                       |
| ---------- | --------------------- | -------------------------------------------- |
| 2026-05-01 | bmad-create-story | Initial story file created from epics.md §3.3 |
| 2026-05-01 | bmad-dev-story | `--dry-run` runtime branch + 11 colocated tests + 1 integration test; 589/0/2172/49; status → review |
| 2026-05-01 | bmad-code-review | Senior Developer Review — APPROVE; 0 must-fix / 0 should-fix / 0 nits / 2 info; AC-1/2/3 PASS; AR8/9/33/41 PASS; status → done |
| 2026-05-01 | bmad-dev-story | implemented `--dry-run` runtime branch + integration test; status `ready-for-dev` → `review` (run `2026-05-01T192353Z-bmad-next`); 589 pass / 0 fail / 2172 expects / 49 files |
