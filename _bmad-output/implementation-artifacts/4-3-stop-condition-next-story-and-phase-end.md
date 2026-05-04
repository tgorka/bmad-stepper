---
status: done
story_id: '4.3'
story_key: 4-3-stop-condition-next-story-and-phase-end
epic: '4'
title: 'Stop-Condition: `next-story` and `phase-end`'
created: '2026-05-03'
last_updated: '2026-05-03T02:30:00Z'
priority: H
estimated_effort: M
fr_coverage:
  - FR8
  - FR9
  - FR19
nfr_coverage:
  - NFR-P1
  - NFR-S2
  - NFR-S5
  - NFR-R1
  - NFR-R4
  - NFR-M3
  - NFR-I2
ar_coverage:
  - AR8
  - AR9
  - AR21
  - AR22
  - AR33
  - AR34
  - AR41
  - AR42
deps:
  - 4-2-stop-condition-epic-end-and-story-x-y  # PRIMARY: provides stop-conditions.ts file structure + StopReason union extension + shouldStop widened signature + evaluateStopConditions dispatcher + compareStoryIds helper
  - 4-1-bmad-loop-command-skeleton             # SKELETON: LoopArgsSchema declares nextStory + phaseEnd; runLoop has shouldStop predicate
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/implementation-artifacts/4-2-stop-condition-epic-end-and-story-x-y.md
  - _bmad-output/implementation-artifacts/4-1-bmad-loop-command-skeleton.md
  - _bmad-output/implementation-artifacts/sprint-status.yaml
  - _bmad-output/implementation-artifacts/3-1-record-last-attempted-last-failure-reason-on-halt.md
  - _bmad-output/implementation-artifacts/3-7-list-candidate-next-steps.md
  - .bmad-stepper/state.yaml
  - src/commands/loop/args.ts
  - src/commands/loop/run.ts
  - src/commands/loop/run.test.ts
  - src/commands/loop/stop-conditions.ts
  - src/commands/loop/stop-conditions.test.ts
  - src/commands/loop/index.ts
  - src/schemas/state.ts
  - src/dag/types.ts
  - src/dag/build.ts
  - src/state/load.ts
  - src/errors.ts
  - commands/bmad-loop.md
---

# Story 4.3: Stop-Condition: `next-story` and `phase-end`

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper user,
I want `--next-story` and `--phase-end` to halt at the next story boundary or phase transition,
So that I can chain partial work without committing to a full epic.

## Context Summary

This is the **third story of Epic 4 (Bounded Loop with Eight Stop Conditions)** and it lands the **third + fourth pure-function stop-condition predicates** in the dedicated `src/commands/loop/stop-conditions.ts` module that AC-3 of Story 4.2 mandated. Story 4.2 just shipped the `stop-conditions.ts` file structure with TWO predicates (`untilEpicEndStopCondition`, `untilStoryStopCondition`), the `evaluateStopConditions` dispatcher, the `compareStoryIds` numeric-segment comparator helper, and the widened `shouldStop(iterCount, args, state, dag, sprintStatus): StopReason | null` runtime signature in `src/commands/loop/run.ts`. Story 4.3 EXTENDS that foundation with TWO more predicates (`nextStoryStopCondition`, `phaseEndStopCondition`) — same `(state, dag, args, sprintStatus?) => StopReason | null` contract — wires them into `evaluateStopConditions`, extends `StopReason` with TWO new variants (`next-story-reached`, `phase-end-reached`), and adds the runtime plumbing in `runLoop` to capture `loopStartStory` + `loopStartPhase` at entry so the new predicates can detect transitions.

**Story 4.3's scope is THREE acceptance criteria** (AC-1 `--next-story` boundary detection; AC-2 `--phase-end` transition detection; AC-3 a comprehensive integration test sweep covering all FOUR stop conditions — Story 4.2's `--until-epic-end` + `--until-story` AND Story 4.3's `--next-story` + `--phase-end`) and **two stop-condition flags** (`--next-story` and `--phase-end`). Story 4.3 introduces ZERO new source files (extends existing `src/commands/loop/stop-conditions.ts` + `src/commands/loop/run.ts`); modifies FOUR existing files (`stop-conditions.ts` adds 2 predicates + extends dispatcher; `run.ts` extends `StopReason` union + captures loop-start-story/phase + threads them through; `stop-conditions.test.ts` adds ~12-18 new tests; `run.test.ts` adds ~6-10 new tests + 1 comprehensive AC-3 sweep test); modifies ONE markdown file (`commands/bmad-loop.md` Stop Conditions table flips `--next-story` and `--phase-end` rows from "parsed only" to "RUNTIME-WIRED in 4.3" with user-facing descriptions). Net: **ZERO new source files; FOUR modified source files; ONE modified markdown file; ZERO new error classes (registry holds at 16); ZERO state schema changes**.

**`--next-story` semantics per AC-1 verbatim** (epics.md line 929-931): `--next-story` is supplied → the loop completes a step AND the next computed step belongs to a different story → exits with reason `next-story boundary reached`. v0.1 conservative implements this via an EXPLICIT `loopStartStory` capture at runLoop entry (option (a) per the orchestrator brief) — NOT via DAG lookup of "next runnable step". The capture happens BEFORE the first iteration runs by reading `state.lastSuccessfulStep?.story` (the just-completed story prior to loop entry) OR using a sentinel to mark "no baseline yet" if state is null/empty. After each iteration's `runNext` returns success, the predicate compares the just-completed `state.lastSuccessfulStep.story` against `loopStartStory`; the predicate fires when `compareStoryIds(currentStory, loopStartStory) !== 0` (i.e., the story changed). Edge case: if the loop starts mid-story with NO prior successful step (fresh project, `lastSuccessfulStep === null`), the predicate captures the FIRST iteration's resulting story as the baseline; subsequent iterations fire when the story flips. The `loopStartStory` is passed into the predicate via a new SECOND-ARGUMENT THREADING approach — either (a) thread through `evaluateStopConditions` as a new argument, OR (b) close over it in a curried predicate factory. v0.1 conservative chooses (a) — extend `evaluateStopConditions(state, dag, args, sprintStatus, loopContext?)` with an optional `loopContext: { startStory?: string | null; startPhase?: Phase | null }` parameter; predicates that don't need context ignore it. The exit message format: `next-story boundary reached`.

**`--phase-end` semantics per AC-2 verbatim** (epics.md line 932-934): `--phase-end` is supplied → the next computed step is in a different BMAD phase than the current → exits with reason `phase-end (transition <from>→<to>) reached`. The BMAD phase comes from the DAG node's `phase` field — `Phase` is a literal union `"analysis" | "planning" | "solutioning" | "implementation" | "retro"` declared at `src/dag/types.ts:30-35`. v0.1 conservative chooses the EXPLICIT `loopStartPhase` capture approach (mirroring `--next-story`) — capture at runLoop entry by looking up `state.lastSuccessfulStep?.step` in the DAG and reading the corresponding `dag.nodes.get(step)?.phase`. After each iteration, look up the just-completed step's phase via the same DAG lookup and compare against `loopStartPhase`. The predicate fires when `currentPhase !== loopStartPhase`. The exit message format: `phase-end (transition <from>→<to>) reached` — e.g., `phase-end (transition planning→implementation) reached`. Edge case: if the loop starts with `lastSuccessfulStep === null` OR if the step name doesn't resolve to a DAG node (unknown step — should be impossible per AR41 but defensive), the predicate captures the first iteration's resolved phase as baseline; subsequent iterations fire when phase flips. NOTE: this predicate REQUIRES the DAG to be loaded (Story 4.2's runLoop currently sets `dag = null` per the v0.1-conservative skip at run.ts:402-405; Story 4.3 must remove that skip and ACTUALLY build the DAG via `buildDag` from `src/dag/build.ts` — but only when `args.phaseEnd === true` to keep cost-free behaviour for the other flags).

**AC-3 integration test rubric**: AC-3 wording is "integration test covers all four stop conditions from this story + 4.2". v0.1 conservative interprets this as: (a) Story 4.2's existing 4 individual integration tests for `--until-epic-end` (Tests I_42 + J_42) and `--until-story` (Tests K_42 + L_42 + M_42 + N_42) ARE PRESERVED — they already cover those two flags. (b) Story 4.3 adds NEW individual integration tests for `--next-story` (3-4 tests) + `--phase-end` (3-4 tests). (c) Story 4.3 adds ONE NEW comprehensive sweep test that exercises all FOUR flags in distinct sub-scenarios (one describe block, four `it` blocks, one shared fixture pattern) — this satisfies the "covers all four stop conditions" wording explicitly. The sweep test does NOT necessarily run all 4 flags in a single loop invocation (that would be ambiguous about which fires first); rather, it exercises each flag in its own sub-test within a single describe block so failures point at the offending flag.

**The `runLoop` per-iteration boundary check** at `src/commands/loop/run.ts:203-251` (Story 4.2's widened `shouldStop` signature) is EXTENDED in Story 4.3 to thread the new `loopContext` (containing `startStory` + `startPhase`) into `evaluateStopConditions`. The capture happens ONCE at runLoop entry (before the `while (true)` loop); subsequent iterations re-read state inside the loop but re-USE the captured `loopContext`. The `--next-story` and `--phase-end` predicates compare the just-completed iteration's story/phase against the captured baseline and fire on transition.

**Story 4.3 is INTENTIONALLY NARROW** on the two new predicates AND the loop-start-context capture mechanism — Stories 4.5 (`--time-budget`, `--token-budget`), and 4.6 (`--stop-on-error` / `--continue-on-error`) will extend the predicate set further, but the loop-start-context threading lands in 4.3. Story 4.4 (`--max-iters` default cap) will REMOVE the v0.1 `"no-stop-condition"` placeholder branch AND the `hasOtherStopCondition` guard (Story 4.2's run.ts:178-180) when the default `--max-iters=50` cap is wired — Story 4.3 EXTENDS the `hasOtherStopCondition` guard to also recognize `--next-story` and `--phase-end` (so neither flag, when supplied alone, triggers the placeholder).

**Concretely, Story 4.3 produces:**

1. **`src/commands/loop/stop-conditions.ts`** (MODIFIED, +120-180 lines): adds TWO new pure-function predicates following the same `(state, dag, args, sprintStatus?, loopContext?) => StopReason | null` contract:
   - `nextStoryStopCondition(state, dag, args, sprintStatus, loopContext): StopReason | null` — fires when `args.nextStory === true` AND `loopContext?.startStory !== null/undefined` AND `compareStoryIds(state.lastSuccessfulStep.story, loopContext.startStory) !== 0`. Returns `{ code: "next-story-reached", startStory, currentStory, message: "next-story boundary reached" }`.
   - `phaseEndStopCondition(state, dag, args, sprintStatus, loopContext): StopReason | null` — fires when `args.phaseEnd === true` AND `loopContext?.startPhase !== null/undefined` AND the just-completed step's phase (looked up via `dag.nodes.get(state.lastSuccessfulStep.step)?.phase`) differs from `loopContext.startPhase`. Returns `{ code: "phase-end-reached", fromPhase, toPhase, message: "phase-end (transition <from>→<to>) reached" }`.
   - Extends `evaluateStopConditions` to accept the new optional `loopContext` parameter and dispatch to both new predicates after the existing two (declaration order: epic-end → until-story → next-story → phase-end). Stories 4.5/4.6 will extend further.
   - Defines a new exported interface `LoopContext { readonly startStory: string | null; readonly startPhase: Phase | null }` capturing the loop-entry baseline; consumed by the new predicates and threaded by `runLoop` to `evaluateStopConditions`.

2. **`src/commands/loop/run.ts`** (MODIFIED, ~30-50 lines added): extends `StopReason` discriminated union with two new variants (`next-story-reached`, `phase-end-reached`); captures `loopStartStory` + `loopStartPhase` at runLoop entry (BEFORE the while loop) by reading `state.lastSuccessfulStep?.story` + `dag.nodes.get(step)?.phase`; threads the captured `LoopContext` through `shouldStop` → `evaluateStopConditions`; widens `hasOtherStopCondition` guard to also recognize `args.nextStory === true` and `args.phaseEnd === true`; opt-in DAG loading: when `args.phaseEnd === true`, the runLoop calls `buildDag()` at entry (replacing Story 4.2's v0.1-conservative `dag: null` skip at run.ts:402-405); when `args.phaseEnd !== true`, the DAG load is still skipped (zero-cost for the other flags); adds `formatExitReason` cases for the two new variants so the AR9 final summary message is correctly formatted.

3. **`src/commands/loop/stop-conditions.test.ts`** (MODIFIED, +12-18 new tests / ~150-250 lines added): pure-function unit tests of each new predicate against fixture states + `LoopContext`. Test cases:
   - `nextStoryStopCondition` fires when `state.lastSuccessfulStep.story === "3.3"` AND `loopContext.startStory === "3.2"` (story changed).
   - `nextStoryStopCondition` fires across epic boundaries (`startStory === "3.10"` → `currentStory === "4.1"`).
   - `nextStoryStopCondition` does NOT fire when `state.lastSuccessfulStep.story === loopContext.startStory` (no transition).
   - `nextStoryStopCondition` does NOT fire when `args.nextStory === undefined`.
   - `nextStoryStopCondition` does NOT fire when `args.nextStory === false`.
   - `nextStoryStopCondition` does NOT fire when `loopContext.startStory === null` (sentinel — no baseline yet; first iter still establishing).
   - `nextStoryStopCondition` does NOT fire when `state.lastSuccessfulStep === null`.
   - `phaseEndStopCondition` fires when `loopContext.startPhase === "planning"` AND just-completed step phase via DAG lookup === `"implementation"`.
   - `phaseEndStopCondition` fires across all transition pairs (planning→implementation, implementation→retro, etc.).
   - `phaseEndStopCondition` does NOT fire when phase is unchanged.
   - `phaseEndStopCondition` does NOT fire when `args.phaseEnd === undefined`.
   - `phaseEndStopCondition` does NOT fire when `loopContext.startPhase === null`.
   - `phaseEndStopCondition` does NOT fire when DAG lookup fails (`dag.nodes.get(step) === undefined`).
   - `evaluateStopConditions` priority order: when MULTIPLE flags fire, returns first in declaration order (epic-end → until-story → next-story → phase-end).
   - `evaluateStopConditions` returns `null` when none fire.
   - Predicate purity: invoke each twice; results deeply equal.

4. **`src/commands/loop/run.test.ts`** (MODIFIED, +6-10 new tests + 1 sweep test / ~150-220 lines added): integration tests covering:
   - **Test P_43 (`--next-story` fires on story transition)**: state fixture starts at `"3.2"`; runNext stub returns success; per-iteration state-override returns `state.lastSuccessfulStep.story === "3.3"` after 1 iter → loop exits with `stopReason.code === "next-story-reached"`, `startStory === "3.2"`, `currentStory === "3.3"`.
   - **Test Q_43 (`--next-story` does NOT fire when story unchanged)**: state stays at `"3.2"`; loop runs to `--max-iters 2` cap.
   - **Test R_43 (`--next-story` works across epic boundaries)**: state starts at `"3.10"`; transitions to `"4.1"`.
   - **Test S_43 (`--phase-end` fires on phase transition)**: DAG with planning + implementation steps; state starts at planning step; transitions to implementation step → loop exits with `stopReason.code === "phase-end-reached"`, `fromPhase === "planning"`, `toPhase === "implementation"`.
   - **Test T_43 (`--phase-end` does NOT fire when phase unchanged)**: state stays in implementation phase across iterations.
   - **Test U_43 (`--phase-end` requires DAG; degrades gracefully when DAG load fails)**: when `args.phaseEnd === true` but `dagOverride` returns null, the predicate short-circuits — loop continues.
   - **Test V_43 (`--next-story` + `--phase-end` no-stop-condition guard)**: invoking `runLoop({ argv: ["--next-story"], runNextOverride: stub })` does NOT trigger `no-stop-condition` placeholder (the `hasOtherStopCondition` guard catches it).
   - **Test W_43 — AC-3 SWEEP** (one describe block, four sub-tests, all four conditions): each sub-test exercises ONE of the four flags from Story 4.2 + 4.3 (`--until-epic-end`, `--until-story`, `--next-story`, `--phase-end`) with a tailored fixture; asserts the corresponding stopReason variant fires. This single describe block satisfies AC-3 "integration test covers all four stop conditions" verbatim.

5. **`commands/bmad-loop.md`** (MODIFIED, ~10-25 lines updated): in the §Stop Conditions table, flip the `--next-story` and `--phase-end` rows from "parsed only" to "RUNTIME-WIRED in 4.3"; add user-facing description sub-sections `### --next-story (Story 4.3)` and `### --phase-end (Story 4.3)` with example invocations and behaviour notes (mirroring the §`--until-epic-end (Story 4.2)` and §`--until-story X.Y (Story 4.2)` sub-sections).

6. **`_bmad-output/implementation-artifacts/sprint-status.yaml`** (MODIFIED): flips `4-3-stop-condition-next-story-and-phase-end: backlog → ready-for-dev`. Bumps `last_updated:` timestamp at BOTH the comment block top AND the live YAML field.

**FR/NFR/AR mapping:**

- **FR8** (`/bmad-next` single-step advance): CONSUMED unchanged — the loop runner continues to invoke `runNext` once per iteration; the new stop-condition predicates run AFTER each `runNext` returns success.
- **FR9** (`--dry-run`): NOT EXERCISED in 4.3. Forward-tracker for Story 4.7.
- **FR19** (Bounded Loop Execution — eight stop-condition types): PARTIAL (5 of 8). Story 4.1 wired `--max-iters`; Story 4.2 wired `--until-epic-end` + `--until-story <x.y>`; Story 4.3 wires `--next-story` + `--phase-end`; Stories 4.4-4.10 wire the rest.
- **FR53** (documented exit codes): UNCHANGED. Story 4.3's stop conditions all return `exitCode: 0` (clean exit) when fired. The `halt-on-error` path from Story 4.1 is unchanged.
- **FR54** (stdout/stderr discipline): UNCHANGED. Story 4.3 ships ZERO new stderr emissions (the 4.2 `--until-epic-end` state-snapshot pointer + `--resume` hint are unchanged). The single AR9 line on stdout is preserved.
- **NFR-P1** (next-step computation < 500ms p95): PRESERVED. The new per-iteration boundary check adds: ZERO additional state-loads (already done by Story 4.2 each iter); ZERO additional sprint-status loads; ONE optional DAG-build per loop entry (~5-10ms; only when `args.phaseEnd === true`); TWO predicate invocations (sub-millisecond each — pure functions). Total per-iteration overhead is unchanged from Story 4.2 (~10-30ms).
- **NFR-S2** (writes only inside scope): PRESERVED. Story 4.3 ships ZERO new write paths.
- **NFR-S5** (atomic writes + locks): PRESERVED. The loop runner remains lock-free per AR8.
- **NFR-R1** (zero data loss on halt): PRESERVED. The new stop-condition fires AFTER `runNext` returns success — there is no in-flight dispatch to lose.
- **NFR-R4** (lock release on graceful exit): PRESERVED.
- **NFR-M3** (machine-readable JSON for `--export-state`): UNCHANGED.
- **NFR-I2** (unknown-skill fail-loud): PRESERVED — the `phaseEndStopCondition` predicate degrades gracefully on unknown DAG nodes (returns null) but the loop runner does NOT bypass DAG resolution.
- **AR8** (lock-free `run.ts` / lock-held `verify-and-advance.ts`): UPHELD. The new predicates in `stop-conditions.ts` remain pure-function; the runLoop adds `buildDag` (foundational-tier) per AR41; ZERO `src/lock/` imports.
- **AR9** (single discriminated-union JSON line on stdout): UPHELD. The single AR9 line on stdout is preserved. Story 4.3 ADDS two new variants (`next-story-reached`, `phase-end-reached`) to the StopReason discriminated union — `formatExitReason` is extended to format their summary text into the AR9 line.
- **AR21 + AR22** (errors carry code + actionable hint): UNCHANGED. Story 4.3 ships ZERO new error classes — registry stays at 16 codes.
- **AR33** (function & error semantics; throw not Result; no console.\*; async/await): UPHELD. The new predicates are pure functions (no I/O, no throws). The runLoop modifications use async/await for the optional DAG build. ZERO `console.*` calls.
- **AR34** (slash-command markdown protocol): UNCHANGED. The `commands/bmad-loop.md` modifications are documentation-only updates to the existing §Stop Conditions table + new sub-sections.
- **AR41** (boundary graph): UPHELD. `src/commands/loop/stop-conditions.ts` remains top-tier; imports the same foundational-tier types as Story 4.2 (`State`, `DagAdjacency`) plus `Phase` from `src/dag/types.ts` (foundational). The runLoop modifications add `buildDag` from `src/dag/build.ts` (foundational-tier; top-tier MAY import foundational per AR41).
- **AR42** (test discipline): EXTENDED. Existing colocated test files (`src/commands/loop/stop-conditions.test.ts`, `src/commands/loop/run.test.ts`) are extended; AR35 tmpdir-per-test discipline preserved.

Estimated effort: **M** (medium — ZERO new TypeScript source files; MODIFICATIONS to `src/commands/loop/stop-conditions.ts` (~120-180 lines added — 2 predicates + extended dispatcher + LoopContext interface); MODIFICATIONS to `src/commands/loop/run.ts` (~30-50 lines added — extend StopReason union + capture loop-start-context + thread to dispatcher + extend hasOtherStopCondition + extend formatExitReason + opt-in buildDag); MODIFICATIONS to `src/commands/loop/stop-conditions.test.ts` (+12-18 tests / ~150-250 lines); MODIFICATIONS to `src/commands/loop/run.test.ts` (+6-10 tests + 1 sweep test / ~150-220 lines); MODIFICATIONS to `commands/bmad-loop.md` (~10-25 lines — Stop Conditions table flips + 2 new sub-sections). Net additions: ~470-725 lines across 5 files. ZERO new error classes; ZERO `src/commands/next/` modifications; ZERO new schema work; ZERO `verify-and-advance.ts` modifications; ZERO `lock.ts` modifications.)

It does **NOT**:

- **Wire the other 5 stop-condition types** (`--time-budget`, `--token-budget`, `--stop-on-error`, `--continue-on-error`, plus the default `--max-iters=50` cap). Forward-deferred to Stories 4.4 (default cap), 4.5 (time/token budgets), 4.6 (error policies).
- **Remove the v0.1 `no-stop-condition` placeholder.** Forward-deferred to Story 4.4.
- **Address Story 4.1's SF-1 (extractFailureCode EXIT_0 edge case).** Forward-tracker to Story 4.10 per the 4.1-code-review forwardDependencies.
- **Address Story 4.1's SF-2 (IterationRecord.action "unknown" union member).** Forward-tracker to Story 4.6 per the 4.1-code-review forwardDependencies.
- **Address Story 4.2's 3 nits (defensive null check at stop-conditions.ts:170; EMPTY_DAG sentinel placement; dead `dag = null` variable).** OPPORTUNISTIC — Story 4.3 may opt to remove the `dag = null` skip when `args.phaseEnd === true` (improves nit-3 directly); other nits left for future cleanup.
- **Format the full `--resume` hint with `state.lastFailureReason.hint` enrichment.** Forward-deferred to Story 4.10.
- **Add Zod schemas for `StopReason` variants.** v0.1 keeps `StopReason` as a TypeScript discriminated union per Story 4.1's precedent.
- **Modify `src/commands/next/run.ts`, `src/state/load.ts`, `src/dag/build.ts`, `src/lock/lock.ts`, `src/schemas/state.ts`.** Story 4.3 is purely additive on `src/commands/loop/`.
- **Add a new error class.** Registry stays at 16 codes.

## Acceptance Criteria

The acceptance criteria below are reproduced **verbatim** from `_bmad-output/planning-artifacts/epics.md` §Story 4.3 (lines 921-935, BDD Given/When/Then format). Lines and AC labelling preserved.

**Acceptance Criteria:**

**Given** `--next-story` is supplied
**When** the loop completes a step and the next computed step belongs to a different story
**Then** the loop exits with reason `next-story boundary reached`
**Given** `--phase-end` is supplied
**When** the next computed step is in a different BMAD phase than the current
**Then** the loop exits with reason `phase-end (transition <from>→<to>) reached`
**And** integration test covers all four stop conditions from this story + 4.2

> **Story 4.3 stop-condition scope note:** AC-1 (`--next-story`) and AC-2 (`--phase-end`) are the TWO stop-condition predicates wired in 4.3. AC-3 (the comprehensive integration test sweep) is satisfied by extending Story 4.2's existing run.test.ts with new individual tests for `--next-story` + `--phase-end` PLUS one comprehensive sweep describe block exercising all FOUR flags from this story + 4.2 (`--until-epic-end`, `--until-story`, `--next-story`, `--phase-end`). Stories 4.5 (`--time-budget`, `--token-budget`), 4.6 (`--stop-on-error`, `--continue-on-error`) will extend the file with additional pure-function exports following the same `(state, dag, args, sprintStatus?, loopContext?) => StopReason | null` contract.

## Tasks / Subtasks

- [x] **Task 0 — Verify pre-conditions (AC: all)**
  - [x] 0.1 Confirm Story 4.2 is `done` per `_bmad-output/implementation-artifacts/sprint-status.yaml:84`. Confirm code-review verdict `approve` per `_bmad-output/implementation-artifacts/4-2-stop-condition-epic-end-and-story-x-y.md` Senior Developer Review section (verdict line 733, counts line 735: 0 must-fix / 0 should-fix / 3 nits / 7 info).
  - [x] 0.2 Read `_bmad-output/implementation-artifacts/4-2-stop-condition-epic-end-and-story-x-y.md` end-to-end. Confirm:
    - `src/commands/loop/stop-conditions.ts` exists at the canonical path.
    - The file exports FOUR pure functions: `compareStoryIds`, `untilEpicEndStopCondition`, `untilStoryStopCondition`, `evaluateStopConditions`.
    - The file exports the `SprintStatus` interface AND the `StopConditionFn` type alias AND the `Dag` type alias (= `DagAdjacency`).
    - `src/commands/loop/run.ts:90-100` exports the `StopReason` discriminated union with FIVE variants (`max-iters-reached`, `no-stop-condition`, `halt-on-error`, `epic-end-reached`, `until-story-reached`).
    - `src/commands/loop/run.ts:203-251` defines `shouldStop(iterCount, args, state, dag, sprintStatus): StopReason | null` (Story 4.2 widened signature).
    - `src/commands/loop/run.ts:178-180` defines `hasOtherStopCondition(args)` returning `args.untilEpicEnd === true || args.untilStory !== undefined` (Story 4.3 will widen to also include `args.nextStory === true || args.phaseEnd === true`).
    - `src/commands/loop/run.ts:259-263` defines `EMPTY_DAG: DagAdjacency` sentinel.
    - `src/commands/loop/run.ts:402-405` skips DAG load with `const dag: DagAdjacency | null = null;` (Story 4.3 will conditionally build the DAG when `args.phaseEnd === true`).
    - `LoopArgsSchema` at `src/commands/loop/args.ts:84-106` declares `nextStory: z.boolean().optional()` (line 94) and `phaseEnd: z.boolean().optional()` (line 95). Both are in `BOOLEAN_KEYS` set at line 118-125.
    - Errors registry at `src/errors.ts` holds at 16 codes (verified by 4.2 Senior Developer Review §Quality Gates).
  - [x] 0.3 Read epics.md §Story 4.3 lines 921-935 verbatim. Confirm the AC text in §Acceptance Criteria above is character-identical to lines 927-935.
  - [x] 0.4 Read `src/dag/types.ts:30-35` to confirm the `Phase` literal union is `"analysis" | "planning" | "solutioning" | "implementation" | "retro"`. The `phaseEndStopCondition` predicate consumes this type.
  - [x] 0.5 Read `src/dag/build.ts` to identify the exported `buildDag` function (or canonical equivalent) signature. The runLoop will call this conditionally when `args.phaseEnd === true`. Confirm `DagAdjacency` is exported via `src/dag/index.ts` (Story 1.10 barrel).
  - [x] 0.6 Read `src/schemas/state.ts:98-106` to confirm `state.lastSuccessfulStep` shape: `{ step: string, epic: number, story: string, completedAt: string } | null | undefined`. The `phaseEndStopCondition` predicate uses `state.lastSuccessfulStep.step` to look up the DAG node and read its `phase`.
  - [x] 0.7 Read `_bmad-output/implementation-artifacts/sprint-status.yaml` and confirm `4-3-stop-condition-next-story-and-phase-end: backlog` is the current value at line 85 (Story 4.3 will flip to `ready-for-dev`).
  - [x] 0.8 Read Story 4.2's §Open Questions for Code Review section to confirm 7 of 9 OQs were ACCEPT (per the Senior Developer Review). v0.1 conservative INHERITS those adjudications:
    - OQ-1 (contract widened from `(state, dag) => boolean`) — ACCEPT — Story 4.3 follows the widened contract verbatim.
    - OQ-3 (post-iteration check only; no pre-iteration) — ACCEPT — Story 4.3's `--next-story` + `--phase-end` ALSO post-iteration only.
    - OQ-4 (graceful degradation on state/sprint-status load failure) — ACCEPT — Story 4.3's predicates ALSO short-circuit on missing inputs.
    - OQ-5 (sprint-status keys for per-epic enumeration) — ACCEPT — Story 4.3's `--next-story` + `--phase-end` do NOT consult sprint-status (no inheritance).
    - OQ-10 (state-shape: `state.lastSuccessfulStep.*` not `state.workflow.*`) — ACCEPT — Story 4.3 follows the same actual-schema field names.
  - [x] 0.9 Confirm baseline `bun test src/commands/loop` exits 0 with the post-Story-4.2 baseline (~82 pass / 0 fail / 335 expects across 3 files).
  - [x] 0.10 Confirm Bun host version satisfies AR2 (Bun >= 1.3). Run `bun --version`; record in Completion Notes.
  - [x] 0.11 Confirm `src/errors.ts` registry holds at 16 codes (`bun test src/errors.test.ts` → 10 pass / 0 fail / 197 expects).

- [x] **Task 1 — Add `nextStoryStopCondition` predicate to `src/commands/loop/stop-conditions.ts` (AC-1)**
  - [x] 1.1 At the top of the file (above `// ─── Public types ─────`), define a new exported interface for the loop-entry baseline context:
    ```typescript
    /**
     * Loop-entry baseline context captured by `runLoop` BEFORE the first
     * iteration runs. Consumed by `nextStoryStopCondition` and
     * `phaseEndStopCondition` to detect transitions away from the baseline.
     *
     * `startStory` is the value of `state.lastSuccessfulStep?.story` at
     * loop entry (or `null` when no prior successful step). `startPhase` is
     * the corresponding phase from `dag.nodes.get(state.lastSuccessfulStep.step)?.phase`
     * at loop entry (or `null` when DAG not loaded or step not found).
     *
     * v0.1 conservative: when both fields are `null`, the predicates
     * short-circuit (no baseline to compare against). The runLoop captures
     * the FIRST iteration's resulting story/phase as a fallback baseline
     * when `lastSuccessfulStep === null` at entry — see runLoop body.
     */
    export interface LoopContext {
      readonly startStory: string | null;
      readonly startPhase: import("../../dag/types.ts").Phase | null;
    }
    ```
  - [x] 1.2 Update the `StopConditionFn` type alias to accept the new optional `loopContext` parameter:
    ```typescript
    export type StopConditionFn = (
      state: State,
      dag: Dag,
      args: LoopArgs,
      sprintStatus?: SprintStatus,
      loopContext?: LoopContext,
    ) => StopReason | null;
    ```
  - [x] 1.3 Below the existing `untilStoryStopCondition` block (around stop-conditions.ts:254), add a new section header `// ─── nextStoryStopCondition (AC-1, Story 4.3) ─────────────────────────────`.
  - [x] 1.4 Export `nextStoryStopCondition(state, dag, args, sprintStatus, loopContext): StopReason | null`:
    ```typescript
    export function nextStoryStopCondition(
      state: State,
      _dag: Dag,
      args: LoopArgs,
      _sprintStatus: SprintStatus | undefined,
      loopContext: LoopContext | undefined,
    ): StopReason | null {
      if (args.nextStory !== true) return null;
      if (loopContext === undefined) return null;
      const baseline = loopContext.startStory;
      if (baseline === null || baseline === undefined) return null;

      const currentStory = state.lastSuccessfulStep?.story;
      if (currentStory === undefined || currentStory === null) return null;

      // Fire when the just-completed story DIFFERS from the baseline
      // (regardless of direction — overshoot OR backshift, though
      // backshift is unexpected per BMAD progression). v0.1 conservative
      // uses inequality via compareStoryIds to handle the "1.10 vs 1.2"
      // numeric-segment hazard.
      const cmp = compareStoryIds(currentStory, baseline);
      if (cmp !== 0) {
        return {
          code: "next-story-reached",
          startStory: baseline,
          currentStory,
          message: "next-story boundary reached",
        };
      }
      return null;
    }
    ```
  - [x] 1.5 Add JSDoc above `nextStoryStopCondition` citing AC-1 (epics.md line 929-931), the post-iteration check rationale (Story 4.2 OQ-3 inheritance), and the `compareStoryIds` re-use.

- [x] **Task 2 — Add `phaseEndStopCondition` predicate to `src/commands/loop/stop-conditions.ts` (AC-2)**
  - [x] 2.1 Below `nextStoryStopCondition`, add section header `// ─── phaseEndStopCondition (AC-2, Story 4.3) ─────────────────────────────`.
  - [x] 2.2 Add a new top-of-file import for the `Phase` type:
    ```typescript
    import type { Phase } from "../../dag/types.ts";
    ```
    (Co-locate with the existing `import type { DagAdjacency }` line at stop-conditions.ts:48.)
  - [x] 2.3 Export `phaseEndStopCondition(state, dag, args, sprintStatus, loopContext): StopReason | null`:
    ```typescript
    export function phaseEndStopCondition(
      state: State,
      dag: Dag,
      args: LoopArgs,
      _sprintStatus: SprintStatus | undefined,
      loopContext: LoopContext | undefined,
    ): StopReason | null {
      if (args.phaseEnd !== true) return null;
      if (loopContext === undefined) return null;
      const fromPhase = loopContext.startPhase;
      if (fromPhase === null || fromPhase === undefined) return null;

      const currentStep = state.lastSuccessfulStep?.step;
      if (currentStep === undefined || currentStep === null) return null;

      // DAG lookup: the just-completed step's phase. The DAG is loaded by
      // runLoop only when args.phaseEnd === true; passed via the `dag`
      // parameter. Defensive: when the step is not in the DAG (shouldn't
      // happen per AR41 boundary, but skill might be Tier-3 in v0.1
      // without phase metadata), short-circuit gracefully.
      const node = dag.nodes.get(currentStep);
      if (node === undefined) return null;
      const toPhase = node.phase;
      if (toPhase === fromPhase) return null;

      return {
        code: "phase-end-reached",
        fromPhase,
        toPhase,
        message: `phase-end (transition ${fromPhase}→${toPhase}) reached`,
      };
    }
    ```
    Note the `→` is the unicode RIGHTWARDS ARROW (→) per AC-2 verbatim message text. Use the unicode escape to keep source-file ASCII-safe (preserves Story 4.2 byte-cleanliness convention).
  - [x] 2.4 Add JSDoc above `phaseEndStopCondition` citing AC-2 (epics.md line 932-934), the DAG dependency, the unicode arrow choice, and the graceful-degradation behaviour on missing DAG.

- [x] **Task 3 — Extend `evaluateStopConditions` dispatcher (AC-1, AC-2)**
  - [x] 3.1 Update the dispatcher signature at stop-conditions.ts:277-282 to accept the new optional `loopContext` parameter:
    ```typescript
    export function evaluateStopConditions(
      state: State,
      dag: Dag,
      args: LoopArgs,
      sprintStatus?: SprintStatus,
      loopContext?: LoopContext,
    ): StopReason | null {
      const epicEnd = untilEpicEndStopCondition(state, dag, args, sprintStatus);
      if (epicEnd !== null) return epicEnd;

      const story = untilStoryStopCondition(state, dag, args);
      if (story !== null) return story;

      // Story 4.3 additions (AC-1, AC-2):
      const nextStory = nextStoryStopCondition(state, dag, args, sprintStatus, loopContext);
      if (nextStory !== null) return nextStory;

      const phase = phaseEndStopCondition(state, dag, args, sprintStatus, loopContext);
      if (phase !== null) return phase;

      return null;
    }
    ```
  - [x] 3.2 Update the dispatcher's JSDoc comment to reflect the new declaration order: `untilEpicEnd → untilStory → nextStory → phaseEnd`. Note in the JSDoc that Stories 4.5/4.6 will extend further.

- [x] **Task 4 — Extend `StopReason` discriminated union at `src/commands/loop/run.ts:90-100` (AC-1, AC-2)**
  - [x] 4.1 Add two new variants to the `StopReason` union:
    ```typescript
    export type StopReason =
      | { code: "max-iters-reached"; maxIters: number; iterCount: number }
      | { code: "no-stop-condition"; iterCount: number }
      | { code: "halt-on-error"; iterCount: number; failureCode: string }
      | { code: "epic-end-reached"; epic: string; message: string }
      | {
          code: "until-story-reached";
          targetStory: string;
          currentStory: string;
          message: string;
        }
      | {
          code: "next-story-reached";
          startStory: string;
          currentStory: string;
          message: string;
        }                                                                   // NEW (4.3)
      | {
          code: "phase-end-reached";
          fromPhase: import("../../dag/types.ts").Phase;
          toPhase: import("../../dag/types.ts").Phase;
          message: string;
        };                                                                  // NEW (4.3)
    ```
  - [x] 4.2 Update the JSDoc comment above the union to mention the two new variants (lines 78-89).

- [x] **Task 5 — Wire `nextStoryStopCondition` runtime in `runLoop` (AC-1)**
  - [x] 5.1 In `runLoop` at `src/commands/loop/run.ts:346`, BEFORE the `while (true)` loop entry, capture the loop-start baseline by calling `stateFn()` ONCE and reading `state.lastSuccessfulStep?.story`:
    ```typescript
    // Story 4.3: capture the loop-entry baseline for --next-story and
    // --phase-end. The baseline is read ONCE before the first iteration
    // and reused across all iterations. Predicates compare against this
    // baseline post-iteration.
    let loopContext: LoopContext = { startStory: null, startPhase: null };
    {
      const initialState = await stateFn();
      const initialStartStory = initialState?.lastSuccessfulStep?.story ?? null;
      let initialStartPhase: Phase | null = null;
      if (args.phaseEnd === true && loopDag !== null) {
        const step = initialState?.lastSuccessfulStep?.step;
        if (step !== undefined && step !== null) {
          initialStartPhase = loopDag.nodes.get(step)?.phase ?? null;
        }
      }
      loopContext = { startStory: initialStartStory, startPhase: initialStartPhase };
    }
    ```
    Note: `loopDag` is the optionally-built DAG (see Task 6.1).
  - [x] 5.2 Inside the `while (true)` loop at run.ts:395, modify the `shouldStop` call to thread `loopContext` through. The dispatch path will need extending — see Task 5.3.
  - [x] 5.3 Widen `shouldStop` signature at run.ts:203-209 to accept the optional `loopContext` parameter:
    ```typescript
    function shouldStop(
      iterCount: number,
      args: LoopArgs,
      state: State | null,
      dag: DagAdjacency | null,
      sprintStatus: SprintStatus | null,
      loopContext: LoopContext | null,
    ): StopReason | null {
      // ... existing maxIters check ...
      if (state !== null) {
        const reason = evaluateStopConditions(
          state,
          dag ?? EMPTY_DAG,
          args,
          sprintStatus ?? undefined,
          loopContext ?? undefined,
        );
        if (reason !== null) return reason;
      }
      // ... existing no-stop-condition placeholder branch ...
    }
    ```
  - [x] 5.4 Update the call site at run.ts:407 to pass `loopContext`:
    ```typescript
    const reason = shouldStop(iterCount, args, state, dag, sprintStatus, loopContext);
    ```
  - [x] 5.5 Edge case (loopContext baseline is null): when `state.lastSuccessfulStep === null` at loop entry (fresh project; first ever loop), the captured `startStory === null`. In that case, the `nextStoryStopCondition` predicate short-circuits (returns null). The first iteration STILL runs. AFTER the first successful iteration, the runLoop SHOULD update `loopContext.startStory` to the just-completed story so subsequent iterations have a baseline. v0.1 conservative: implement this update after the first successful iteration (when `loopContext.startStory === null` AND `state.lastSuccessfulStep?.story !== undefined`):
    ```typescript
    // After IterationRecord append, update loopContext baseline if not yet set.
    if (loopContext.startStory === null) {
      const justCompletedStory = state?.lastSuccessfulStep?.story ?? null;
      if (justCompletedStory !== null) {
        loopContext = { ...loopContext, startStory: justCompletedStory };
      }
    }
    if (loopContext.startPhase === null && args.phaseEnd === true && dag !== null) {
      const justCompletedStep = state?.lastSuccessfulStep?.step;
      if (justCompletedStep !== undefined && justCompletedStep !== null) {
        const justCompletedPhase = dag.nodes.get(justCompletedStep)?.phase ?? null;
        if (justCompletedPhase !== null) {
          loopContext = { ...loopContext, startPhase: justCompletedPhase };
        }
      }
    }
    ```
    Document this fallback baseline-capture pattern in the JSDoc + an inline comment + an Open Question entry.

- [x] **Task 6 — Wire `phaseEndStopCondition` runtime + opt-in DAG load (AC-2)**
  - [x] 6.1 At runLoop entry (above the `while (true)` loop, near the `loopContext` capture from Task 5.1), conditionally build the DAG when `args.phaseEnd === true`:
    ```typescript
    // Story 4.3: opt-in DAG build for --phase-end. Other Story 4.2/4.3
    // predicates do not consume the DAG; building it is ~5-10ms but
    // avoidable when not needed. Story 4.5+ may always build.
    let loopDag: DagAdjacency | null = null;
    if (args.phaseEnd === true) {
      try {
        loopDag = await buildDag();
      } catch {
        // Graceful degradation: phaseEnd predicate short-circuits on
        // null DAG (line ... in stop-conditions.ts).
        loopDag = null;
      }
    }
    ```
    Replace the per-iteration `const dag: DagAdjacency | null = null;` at run.ts:402-405 with:
    ```typescript
    const dag: DagAdjacency | null = loopDag;
    ```
  - [x] 6.2 Add `import { buildDag } from "../../dag/build.ts";` near the top of `src/commands/loop/run.ts` (with other imports). Verify the export exists in `src/dag/build.ts` AND/OR `src/dag/index.ts`.
  - [x] 6.3 Verify the AR41 boundary test at run.test.ts:240-265 STILL PASSES with the new `buildDag` import — `src/dag/` is foundational-tier per AR41; top-tier MAY import foundational. Update the boundary check assertions if necessary to whitelist the new import.

- [x] **Task 7 — Extend `formatExitReason` and `hasOtherStopCondition` (AC-1, AC-2)**
  - [x] 7.1 Find `formatExitReason` (or equivalent) in `src/commands/loop/run.ts` (used by the `import.meta.main` block at run.ts:514-537 to construct the AR9 final summary message). Add cases for the two new variants:
    ```typescript
    case "next-story-reached":
      return `next-story boundary reached (${stopReason.startStory} → ${stopReason.currentStory})`;
    case "phase-end-reached":
      return stopReason.message; // "phase-end (transition <from>→<to>) reached"
    ```
    Note: the `--next-story` summary may include the from→to context in the AR9 message even though the predicate's `message` field doesn't (AC-1 verbatim is "next-story boundary reached" without context); this is acceptable because the AR9 message is summarised separately from the structured StopReason and may carry additional context per Story 4.2 precedent.
  - [x] 7.2 Widen `hasOtherStopCondition` at run.ts:178-180:
    ```typescript
    function hasOtherStopCondition(args: LoopArgs): boolean {
      return (
        args.untilEpicEnd === true ||
        args.untilStory !== undefined ||
        args.nextStory === true ||      // NEW (4.3)
        args.phaseEnd === true           // NEW (4.3)
      );
    }
    ```
    This guards the `no-stop-condition` placeholder from firing when the user supplies `--next-story` or `--phase-end` alone (without `--max-iters`). Story 4.4 will REMOVE this helper entirely when the default `--max-iters=50` cap is wired.
  - [x] 7.3 Update the JSDoc above `hasOtherStopCondition` (run.ts:168-177) to mention the two new flags.

- [x] **Task 8 — Add unit tests in `src/commands/loop/stop-conditions.test.ts` (AC-1, AC-2)**
  - [x] 8.1 At the bottom of the existing test file, add a new `describe` block for `nextStoryStopCondition`. Reuse the existing fixture-build helpers from Story 4.2 tests (state factory, sprintStatus factory).
  - [x] 8.2 **Test N1 (`nextStoryStopCondition` fires when story changes within an epic)**: state fixture `lastSuccessfulStep.story === "3.3"`, `loopContext.startStory === "3.2"`, `args.nextStory === true`. Assert `result !== null` AND `result.code === "next-story-reached"` AND `result.startStory === "3.2"` AND `result.currentStory === "3.3"` AND `result.message === "next-story boundary reached"`.
  - [x] 8.3 **Test N2 (`nextStoryStopCondition` fires across epic boundaries)**: `lastSuccessfulStep.story === "4.1"`, `loopContext.startStory === "3.10"`. Assert fires (epic 3 → epic 4 IS a story change; `compareStoryIds("4.1", "3.10") === 1` per Story 4.2's tested helper).
  - [x] 8.4 **Test N3 (`nextStoryStopCondition` does NOT fire when story unchanged)**: `lastSuccessfulStep.story === "3.2"`, `loopContext.startStory === "3.2"`. Assert `result === null`.
  - [x] 8.5 **Test N4 (`nextStoryStopCondition` does NOT fire when args.nextStory undefined)**: `args = {}`. Assert `result === null` (predicate short-circuits).
  - [x] 8.6 **Test N5 (`nextStoryStopCondition` does NOT fire when args.nextStory false)**: `args = { nextStory: false }`. Assert `result === null`.
  - [x] 8.7 **Test N6 (`nextStoryStopCondition` does NOT fire when loopContext.startStory null)**: baseline not yet captured (fresh project first iter). Assert `result === null`.
  - [x] 8.8 **Test N7 (`nextStoryStopCondition` does NOT fire when loopContext undefined)**: predicate called without context. Assert `result === null`.
  - [x] 8.9 **Test N8 (`nextStoryStopCondition` does NOT fire when state.lastSuccessfulStep null)**: post-iteration state has no successful step (shouldn't happen but defensive). Assert `result === null`.
  - [x] 8.10 Add a new `describe` block for `phaseEndStopCondition`. Build a small DAG fixture with at least 2 nodes from different phases (e.g., `bmad-create-prd: planning`, `bmad-dev-story: implementation`).
  - [x] 8.11 **Test P1 (`phaseEndStopCondition` fires on planning → implementation transition)**: `loopContext.startPhase === "planning"`, `state.lastSuccessfulStep.step === "bmad-dev-story"`, DAG has `bmad-dev-story → phase: implementation`. Assert `result.code === "phase-end-reached"` AND `result.fromPhase === "planning"` AND `result.toPhase === "implementation"` AND `result.message === "phase-end (transition planning→implementation) reached"`.
  - [x] 8.12 **Test P2 (`phaseEndStopCondition` fires on implementation → retro)**: similar to P1 with retro target.
  - [x] 8.13 **Test P3 (`phaseEndStopCondition` does NOT fire when phase unchanged)**: `startPhase === "implementation"` AND step's phase === `"implementation"`. Assert `result === null`.
  - [x] 8.14 **Test P4 (`phaseEndStopCondition` does NOT fire when args.phaseEnd undefined)**. Assert `result === null`.
  - [x] 8.15 **Test P5 (`phaseEndStopCondition` does NOT fire when loopContext.startPhase null)**: baseline not yet captured. Assert `result === null`.
  - [x] 8.16 **Test P6 (`phaseEndStopCondition` does NOT fire when DAG lookup fails)**: step not in DAG (`dag.nodes.get(step) === undefined`). Assert `result === null` (graceful).
  - [x] 8.17 **Test EVAL_43_1 (`evaluateStopConditions` priority: epic-end wins over phase-end)**: build fixture where BOTH `--until-epic-end` AND `--phase-end` would fire. Assert `result.code === "epic-end-reached"` (declaration order preserves Story 4.2 priority).
  - [x] 8.18 **Test EVAL_43_2 (`evaluateStopConditions` priority: until-story wins over next-story)**: build fixture where BOTH `--until-story 3.3` AND `--next-story` would fire. Assert `result.code === "until-story-reached"`.
  - [x] 8.19 Test counts projection: ~13-15 new colocated tests / ~50-90 new expects in `src/commands/loop/stop-conditions.test.ts` (extends existing 28 tests to ~41-43).

- [x] **Task 9 — Add integration tests in `src/commands/loop/run.test.ts` (AC-1, AC-2, AC-3)**
  - [x] 9.1 Add to `src/commands/loop/run.test.ts` (do NOT create a new file). Reuse the existing `runNextOverride` + `stateOverride` + `sprintStatusOverride` + `stderrOverride` test seams from Story 4.1/4.2. Use AR35 tmpdir-per-test discipline for any state.yaml fixtures.
  - [x] 9.2 Add a new `describe("runLoop --next-story (Story 4.3)")` block. Inside:
  - [x] 9.3 **Test P_43 (`--next-story` fires on story transition)**: stateOverride returns sequence: iter-1 baseline `{ lastSuccessfulStep: { step: "x", epic: 3, story: "3.2", completedAt: "..." } }`; after first iter, returns `{ lastSuccessfulStep: { ..., story: "3.3" } }`. Stub `runNextOverride` to return `{ exitCode: 0, action: { action: "report", ... } }`. Invoke `runLoop({ argv: ["--next-story"], runNextOverride: stub, stateOverride: seqStub })`. Assert `result.iterations.length === 1` AND `result.stopReason.code === "next-story-reached"` AND `result.stopReason.startStory === "3.2"` AND `result.stopReason.currentStory === "3.3"`.
  - [x] 9.4 **Test Q_43 (`--next-story` does NOT fire when story unchanged)**: stateOverride always returns story `"3.2"`. Invoke `runLoop({ argv: ["--next-story", "--max-iters", "2"], ... })`. Assert `result.stopReason.code === "max-iters-reached"` (the `--max-iters` cap fires; `--next-story` did NOT).
  - [x] 9.5 **Test R_43 (`--next-story` works across epic boundaries)**: stateOverride returns `"3.10"` initially, `"4.1"` after first iter. Assert fires with `startStory === "3.10"`, `currentStory === "4.1"`.
  - [x] 9.6 Add a new `describe("runLoop --phase-end (Story 4.3)")` block.
  - [x] 9.7 **Test S_43 (`--phase-end` fires on phase transition)**: dagOverride returns a fixture DAG with two steps in different phases. stateOverride returns sequence: iter-1 baseline step in planning phase; after first iter, step in implementation phase. Invoke `runLoop({ argv: ["--phase-end"], runNextOverride: stub, stateOverride: seqStub, dagOverride: dagStub })`. Assert `result.stopReason.code === "phase-end-reached"` AND `result.stopReason.fromPhase === "planning"` AND `result.stopReason.toPhase === "implementation"`. NOTE: a `dagOverride: () => Promise<DagAdjacency | null> | DagAdjacency | null` test seam may need to be added to `LoopOpts` in run.ts — track as Task 9.7a.
  - [x] 9.7a If `dagOverride` test seam does not yet exist on `LoopOpts`, ADD it. Document in the JSDoc as "Story 4.3 test-injection seam".
  - [x] 9.8 **Test T_43 (`--phase-end` does NOT fire when phase unchanged)**: state always returns the same phase. Invoke with `--max-iters 2` cap. Assert `--max-iters` fires; `--phase-end` did NOT.
  - [x] 9.9 **Test U_43 (`--phase-end` requires DAG; degrades gracefully when DAG load fails)**: `dagOverride: () => null`. Invoke `runLoop({ argv: ["--phase-end", "--max-iters", "2"], ... })`. Assert the loop runs to `--max-iters` (predicate degraded silently — graceful per OQ-4 inheritance).
  - [x] 9.10 **Test V_43 (`--next-story` + `--phase-end` no-stop-condition guard)**: `runLoop({ argv: ["--next-story"], runNextOverride: stub })` does NOT trigger `no-stop-condition` placeholder; loop runs at least one iter (`hasOtherStopCondition` guard correctly suppresses placeholder). Repeat for `--phase-end`.
  - [x] 9.11 Add a new `describe("runLoop AC-3 sweep — all four stop conditions (Story 4.3)")` block. Inside, FOUR `it` sub-tests — one per flag — each with a tailored fixture asserting the corresponding stopReason variant:
    - **Sweep-A** (`--until-epic-end`): all-stories-done sprint-status fixture → fires `epic-end-reached`.
    - **Sweep-B** (`--until-story 3.2`): state at story `"3.2"` → fires `until-story-reached`.
    - **Sweep-C** (`--next-story`): state transitions `"3.2"` → `"3.3"` → fires `next-story-reached`.
    - **Sweep-D** (`--phase-end`): state transitions planning → implementation → fires `phase-end-reached`.
    Each sub-test asserts ONE flag fires AND the correct stopReason code. The sweep block satisfies AC-3 verbatim ("integration test covers all four stop conditions from this story + 4.2").
  - [x] 9.12 Test counts projection: ~7 new individual integration tests + 4 sweep sub-tests = ~11 new tests / ~35-50 new expects added to `src/commands/loop/run.test.ts` (extends existing 25 tests to ~36).

- [x] **Task 10 — Update `commands/bmad-loop.md` with the two new flags' user-facing descriptions (AC-3 indirect)**
  - [x] 10.1 Read the existing `commands/bmad-loop.md` Stop Conditions table (line 162-176). Identify the `--next-story` row (line 167) and `--phase-end` row (line 168).
  - [x] 10.2 Update the `--next-story` row from `4.3   | parsed only` to `4.3   | RUNTIME-WIRED in 4.3`.
  - [x] 10.3 Update the `--phase-end` row from `4.3   | parsed only` to `4.3   | RUNTIME-WIRED in 4.3`.
  - [x] 10.4 Below the existing `### --until-story X.Y (Story 4.2)` sub-section (around line 195+), add a new sub-section `### --next-story (Story 4.3)`:
    ```
    ### --next-story (Story 4.3)

    Halts the loop when the just-completed iteration's story DIFFERS from
    the story at loop entry. Useful for chaining partial work without
    committing to a full epic. The baseline story is captured BEFORE the
    first iteration; subsequent iterations' completed-story is compared
    against the baseline via `compareStoryIds`.

    ```
    /bmad-loop --next-story
    ```

    Exit message: `next-story boundary reached`. Exit code: `0`.

    Edge case: when the loop starts with no prior successful step
    (`state.lastSuccessfulStep === null`), the FIRST iteration's resulting
    story is captured as the baseline; subsequent iterations fire on
    transition.
    ```
  - [x] 10.5 Add another sub-section `### --phase-end (Story 4.3)`:
    ```
    ### --phase-end (Story 4.3)

    Halts the loop when the just-completed iteration's BMAD phase
    (analysis, planning, solutioning, implementation, retro) DIFFERS from
    the phase at loop entry. The baseline phase is looked up from the DAG
    (`dag.nodes.get(state.lastSuccessfulStep.step).phase`) before the
    first iteration; subsequent iterations' completed-step phase is
    compared against the baseline.

    ```
    /bmad-loop --phase-end
    ```

    Exit message: `phase-end (transition <from>→<to>) reached` (e.g.,
    `phase-end (transition planning→implementation) reached`). Exit code: `0`.

    Note: requires the DAG to be loaded; the runner builds the DAG only
    when `--phase-end` is supplied (zero-cost otherwise).
    ```
  - [x] 10.6 Do NOT modify the §Behavior section, the §Tool restrictions section, or the §Usage examples section (lines 22-31 already mention `--next-story` and `--phase-end` as "Story 4.3 — runtime-wired" — those forecast comments now match reality).
  - [x] 10.7 Verify the §argumentHint at line 3 already includes `[--next-story] [--phase-end]` (Story 4.1 declared all 13 flags); no change needed.

- [x] **Task 11 — Update `_bmad-output/implementation-artifacts/sprint-status.yaml` (AC: all)**
  - [x] 11.1 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: flip `4-3-stop-condition-next-story-and-phase-end: backlog → ready-for-dev` (this Story 4.3 create-story step). At dev-story completion, flip to `review`. At code-review completion, flip to `done`.
  - [x] 11.2 Bump `last_updated:` timestamp at BOTH the `# last_updated:` comment line (line 2) AND the `last_updated:` key:value line (line 38). Use `2026-05-03T00:50:00Z` (UTC ISO timestamp at create-story step).
  - [x] 11.3 sprint-status.yaml retains its original schema (no new fields). DO NOT touch any other story status.

- [x] **Task 12 — Run the full test suite + quality gates (AC: all)**
  - [x] 12.1 `bun test src/commands/loop` exit 0. Test delta projection: ~+24 tests / ~+85-140 expects (13-15 in stop-conditions.test.ts + 11 new in run.test.ts).
  - [x] 12.2 Post-Story-4.3 baseline projection: ~106-108 pass / 0 fail / ~420-475 expects across 3 loop test files.
  - [x] 12.3 Confirm `src/errors.ts` registry stays at **16 codes** (`bun test src/errors.test.ts`: 10 pass, 197 expects). Story 4.3 ships ZERO new error classes.
  - [x] 12.4 Confirm `bunx --bun tsc --noEmit` exits 0.
  - [x] 12.5 Confirm `bunx --bun biome ci .` exits 0 (the modified files pass biome lint/format).
  - [x] 12.6 Confirm AR41 boundary check at `src/commands/loop/run.test.ts:240-265` (existing) AND `:269-289` (new from Story 4.2) STILL PASS — Story 4.3 adds `buildDag` import from `src/dag/build.ts` (foundational-tier — OK per AR41) and `Phase` type import from `src/dag/types.ts` (foundational-tier — OK).
  - [x] 12.7 Confirm `commands/bmad-loop.md` is well-formed YAML frontmatter + valid markdown body (no syntax errors). Run a markdown linter check if available.

- [x] **Task 13 — Final self-check (AC: all)**
  - [x] 13.1 Re-run all three quality gates one final time: `bun test src/commands/loop`, `bunx --bun biome ci .`, `bunx --bun tsc --noEmit`. All exit 0.
  - [x] 13.2 Confirm Story 4.2's existing tests STILL pass — Story 4.3's `evaluateStopConditions` extension is additive (the existing dispatcher tests Test 14 + Test 15 should continue to pass with the new declaration order epic-end → until-story → next-story → phase-end since Story 4.2's tests assert specific predicate priorities).
  - [x] 13.3 Confirm the AR41 boundary checks pass.
  - [x] 13.4 Confirm no console.\* in any new or modified file (per AR33).
  - [x] 13.5 Update §Dev Agent Record §Completion Notes with: (a) actual final test counts, (b) any deviations from this story spec, (c) any open questions surfaced during implementation that should be tracked in code-review.

## Dev Notes

### Architecture invariants enforced

- **AR8** (lock-free top-tier `run.ts`; lock-held `verify-and-advance.ts`): UPHELD. Story 4.3's new predicates in `stop-conditions.ts` remain pure-function; the runLoop's new optional `buildDag` call (when `args.phaseEnd === true`) is foundational-tier read; ZERO `src/lock/` imports added.
- **AR9** (single discriminated-union JSON line on stdout): UPHELD. Story 4.3 ADDS two new variants (`next-story-reached`, `phase-end-reached`) to the StopReason discriminated union; `formatExitReason` is extended to format their summary text into the AR9 line. ZERO additional stdout writes.
- **AR21 + AR22** (errors carry code + actionable hint): UNCHANGED. Story 4.3 ships ZERO new error classes — registry stays at 16 codes. The new predicates return `null | StopReason` (NOT thrown — they are pure-function predicates).
- **AR33** (function & error semantics; throw not Result; no console.\*; async/await): UPHELD. The new predicates are pure functions (no I/O, no throws). The runLoop modifications use async/await for the optional `buildDag` call. ZERO `console.*` calls.
- **AR34** (slash-command markdown protocol): UNCHANGED. The `commands/bmad-loop.md` modifications are documentation-only updates to the existing §Stop Conditions table + new sub-sections.
- **AR41** (boundary graph): UPHELD. `src/commands/loop/stop-conditions.ts` adds an import for `Phase` type from `src/dag/types.ts` (foundational-tier — OK). `src/commands/loop/run.ts` adds an import for `buildDag` from `src/dag/build.ts` (foundational-tier — OK; top-tier MAY import foundational per AR41 line 1294-1302).
- **AR42** (test discipline): EXTENDED. Existing colocated test files extended; AR35 tmpdir-per-test discipline preserved.

### Code paths to extend

The following exact file:line references identify Story 4.3's extension points:

- **`src/commands/loop/stop-conditions.ts:48-51`** — type imports. ADD `import type { Phase } from "../../dag/types.ts";`.
- **`src/commands/loop/stop-conditions.ts:75-80`** — `StopConditionFn` type alias. UPDATE to add optional `loopContext` parameter.
- **`src/commands/loop/stop-conditions.ts:255+`** (after `untilStoryStopCondition`) — INSERT new section header + `nextStoryStopCondition` + JSDoc.
- **`src/commands/loop/stop-conditions.ts:255+` (continued)** — INSERT another section header + `phaseEndStopCondition` + JSDoc.
- **`src/commands/loop/stop-conditions.ts:277-290`** — `evaluateStopConditions` dispatcher. UPDATE signature to add `loopContext?: LoopContext`; UPDATE body to dispatch to two new predicates.
- **`src/commands/loop/stop-conditions.ts`** ABOVE `// ─── Public types ───` — INSERT `LoopContext` interface export.
- **`src/commands/loop/run.ts:90-100`** — `StopReason` discriminated union. EXTEND with `next-story-reached` + `phase-end-reached` variants.
- **`src/commands/loop/run.ts:178-180`** — `hasOtherStopCondition` helper. WIDEN to recognize `args.nextStory === true` and `args.phaseEnd === true`.
- **`src/commands/loop/run.ts:203-251`** — `shouldStop` predicate. WIDEN signature to accept `loopContext: LoopContext | null`. UPDATE the `evaluateStopConditions` call to pass `loopContext`.
- **`src/commands/loop/run.ts:346`** (top of `runLoop` body) — INSERT loop-entry baseline capture for `loopContext` (story + phase) + opt-in `buildDag` call when `args.phaseEnd === true`.
- **`src/commands/loop/run.ts:402-405`** — REPLACE the v0.1-conservative `const dag: DagAdjacency | null = null;` with `const dag: DagAdjacency | null = loopDag;` (using the optionally-built DAG from Task 6.1).
- **`src/commands/loop/run.ts:407`** — UPDATE `shouldStop` call site to pass `loopContext`.
- **`src/commands/loop/run.ts`** somewhere in the `import.meta.main` block (around 514-537) — EXTEND `formatExitReason` (or equivalent) to handle the two new variants.
- **`src/commands/loop/run.ts:122-164`** — `LoopOpts` interface. ADD `dagOverride?: () => Promise<DagAdjacency | null> | DagAdjacency | null` test-injection seam (per Task 9.7a).
- **`src/commands/loop/stop-conditions.test.ts`** — EXTEND with ~13-15 new colocated tests for the two new predicates + the dispatcher priority cases.
- **`src/commands/loop/run.test.ts`** — EXTEND with ~7 new individual integration tests + 1 AC-3 sweep describe block (4 sub-tests).
- **`commands/bmad-loop.md:167-168`** — flip the `--next-story` and `--phase-end` rows from "parsed only" to "RUNTIME-WIRED in 4.3".
- **`commands/bmad-loop.md`** below the existing `### --until-story X.Y (Story 4.2)` sub-section — ADD `### --next-story (Story 4.3)` and `### --phase-end (Story 4.3)` sub-sections.

### Pure-function contract (inherited from Story 4.2)

The new predicates follow the same `(state, dag, args, sprintStatus?, loopContext?) => StopReason | null` contract as Story 4.2's predicates. The `loopContext` parameter is OPTIONAL; predicates that don't need it (e.g., `untilEpicEndStopCondition`, `untilStoryStopCondition`) ignore it. Story 4.5/4.6 may extend the parameter set further (e.g., `loopMetrics?: { elapsedMs, tokensIn, tokensOut }` for time/token budgets) — the contract is a STRUCTURAL extension, not a breaking change.

Pure-function discipline per AR33: ZERO I/O imports, ZERO `console.*` calls, ZERO throws. All error paths return `null` for graceful degradation; the runLoop's loaders handle I/O failures and pass `null` for state/dag/sprintStatus when load fails (per Story 4.2 OQ-4 inherited adjudication).

### State/dag/sprint-status loading (inherited from Story 4.2)

Already done by `runLoop` in Story 4.2 (`stateFn()` + `sprintStatusFn()` calls inside the `while (true)` loop at run.ts:400-401). Story 4.3 adds:
1. ONE-TIME `loopDag = await buildDag()` at runLoop entry (when `args.phaseEnd === true` — opt-in).
2. ONE-TIME `loopContext` capture at runLoop entry (story + phase baseline).

The opt-in DAG load preserves zero-cost behavior for the other 5+ stop-condition flags. Story 4.5+ may upgrade to always-build if more predicates need the DAG.

### AC-3 integration test rubric

AC-3 wording: "integration test covers all four stop conditions from this story + 4.2". v0.1 conservative interprets:
- "Four stop conditions" = `--until-epic-end` (4.2) + `--until-story` (4.2) + `--next-story` (4.3) + `--phase-end` (4.3).
- "Integration test covers all four" = Story 4.3's `run.test.ts` extension MUST exercise all four flags. Story 4.2's existing 4 individual integration tests cover its 2 flags; Story 4.3 adds 6-10 new individual integration tests for `--next-story` + `--phase-end` PLUS one comprehensive sweep describe block exercising all 4 flags (one sub-`it` per flag).
- The sweep does NOT need to invoke all 4 flags in a single `runLoop` call (that would be ambiguous about which fires first); rather, four sub-tests in a single describe block, each with its own fixture and one flag, satisfy "covers all four".

### Errors registry projection

ZERO new error classes. Registry holds at **16 codes** (verified post-Story-4.2 baseline). Story 4.3's predicates return `null | StopReason` per the AR21/22 + AR33 invariants from Story 4.1/4.2 — pure-function predicates are NOT user-facing API; they have no error class. The `formatExitReason` extension is purely string formatting; it consumes the StopReason variant fields to construct a human-readable summary.

### Forward-trackers

- **Story 4.4 (`--max-iters` default cap of 50)**: Will REMOVE Story 4.1's `"no-stop-condition"` placeholder branch + Story 4.2's `hasOtherStopCondition` guard (which Story 4.3 EXTENDS to also recognize `--next-story` and `--phase-end`); will REPLACE with `args.maxIters = args.maxIters ?? 50` default cap per FR25. The `hasOtherStopCondition` helper (and its widening from Story 4.2 + Story 4.3) becomes dead code at Story 4.4.
- **Story 4.5 (`--time-budget` + `--token-budget` stop conditions)**: Will EXTEND `stop-conditions.ts` with two more predicates that consume a new `LoopMetrics` mutable interface (elapsedMs + tokensIn + tokensOut accumulators) — ANALOGOUS to Story 4.3's `LoopContext` capture but for runtime metrics. The `evaluateStopConditions` dispatcher signature will widen further to accept `loopMetrics?: LoopMetrics`.
- **Story 4.6 (`--stop-on-error` + `--continue-on-error` policy)**: Will EXTEND `stop-conditions.ts` with one or two predicates consuming per-iteration `runNext` exit code + `state.lastFailureReason.code` (per Story 3.1) + reuses Story 3.2's `NON_RECOVERABLE_FAILURE_CODES`. Also addresses Story 4.1's SF-2 (`IterationRecord.action "unknown"` union member).
- **Story 4.7 (`--plan-first` dry-run preview)**: May reuse Story 4.2's `compareStoryIds` for planned-step-sequence ordering. The opt-in `buildDag` pattern from Story 4.3 is a precedent for `--plan-first` to also build the DAG (probably always for plan generation).
- **Story 4.10 (Loop exit reason + resume hint format)**: Will ENRICH the `--resume` hint format with `state.lastFailureReason.hint` (per Story 3.1) AND will format the AR9 exit line with the structured failure-code lookup. The `formatExitReason` function that Story 4.3 extends will likely be the integration point.
- **Story 6.1 (`bmad-stepper.config.yaml` schema loader)**: May surface `loop.nextStory: boolean` (default false) + `loop.phaseEnd: boolean` (default false) as config knobs.

## Open Questions for Code Review

1. **Loop-entry baseline capture: explicit `loopContext` (v0.1) vs DAG-lookup of "next runnable step" (richer)?** v0.1 conservative chooses explicit `loopContext` capture per the orchestrator brief option (a). The DAG-lookup approach (b) would compute "what step would runNext run next" and look up its story/phase BEFORE invoking runNext — more accurate to the AC-1/AC-2 wording ("the NEXT computed step") but requires duplicating runNext's DAG traversal logic. v0.1 chooses (a) for simplicity + consistency with Story 4.2 OQ-3 (post-iteration check). Trade-off: (a) simpler + symmetric with 4.2 patterns; (b) closer to AC verbatim but more complex. v0.1 chooses (a); tracked here.

2. **Fresh-project edge case (`state.lastSuccessfulStep === null` at loop entry)?** When the loop starts with no prior successful step, the captured `loopContext.startStory === null`. The first iteration runs (predicate short-circuits on null baseline), then the runLoop UPDATES `loopContext.startStory` from the just-completed iteration's story. Subsequent iterations fire on transition. Trade-off: deferred-baseline (v0.1; first iter establishes baseline) vs immediate-fire (first iter would fire trivially — wrong). v0.1 chooses deferred-baseline; tracked here.

3. **State-shape for `state.workflow.phase` (orchestrator brief mentions this) vs `state.lastSuccessfulStep.step` + DAG lookup (v0.1)?** The orchestrator brief says "The state has `state.workflow.phase` (per state.yaml schema; verify in `src/schemas/state.ts`)". I verified — the actual schema (`src/schemas/state.ts:92-119`) does NOT expose `state.workflow.phase`; only `state.lastSuccessfulStep.{step, epic, story, completedAt}`. v0.1 conservative: read the just-completed step from `state.lastSuccessfulStep.step` and look up the phase via `dag.nodes.get(step)?.phase`. This is consistent with Story 4.2's OQ-10 adjudication (state-shape: spec uses workflow.X; impl reads lastSuccessfulStep.X). Trade-off: DAG-lookup (v0.1; works with existing schema) vs add-state.workflow.phase-field (would require Zod schema change + migration — out of scope for 4.3). v0.1 chooses DAG-lookup; tracked here.

4. **Phase transition message format — exact unicode arrow vs ASCII?** AC-2 verbatim says `phase-end (transition <from>→<to>) reached` using the unicode RIGHTWARDS ARROW (→ U+2192). v0.1 conservative uses the unicode escape `→` in the source string to keep the source file ASCII-safe (Story 4.2 byte-cleanliness convention). The runtime-emitted message contains the actual arrow character. Trade-off: source-ascii (v0.1; portable) vs source-unicode (literal arrow in source — also acceptable). v0.1 chooses source-ascii via `→`; tracked here.

5. **AC-3 sweep test design: ONE big test with all 4 flags vs 4 separate tests in one describe block?** v0.1 conservative chooses 4 separate tests in one describe block (per the AC-3 rubric §Dev Notes). Each sub-test exercises one flag with its own tailored fixture; failures point at the offending flag. Trade-off: single-mega-test (lowest test count; ambiguous failure); separate-tests (cleaner; one extra describe block). v0.1 chooses separate-tests; tracked here.

6. **Interaction order: `--next-story` vs `--until-story X.Y` when both supplied?** Both are post-iteration story-comparison predicates. The `evaluateStopConditions` dispatcher declaration order (4.3 placement: epic-end → until-story → next-story → phase-end) means `--until-story` wins when BOTH would fire on the same iteration. This is deterministic and tested in Task 8.18. Recommendation: `--until-story X.Y` is "more specific" (target a SPECIFIC story); `--next-story` is "more general" (target ANY story change). The order dispatching specific-first is correct. Tracked here.

7. **Should `phase-end` fire when the loop EXHAUSTS the workflow (no more steps)?** AC-2 wording: "next computed step is in a different BMAD phase". If there's NO next step (workflow exhausted), what does "different phase" mean? v0.1 conservative: NO — that's a separate exit condition (no-more-steps; not yet implemented in v0.1 — likely Story 4.10 or 5.x). The `phaseEndStopCondition` predicate fires ONLY on a real phase transition (current step's phase != baseline phase). Trade-off: fire-on-exhaustion (v0.1.x; broader semantics) vs fire-only-on-transition (v0.1; conservative). v0.1 chooses transition-only; tracked here.

8. **Should the runLoop ALWAYS build the DAG or ONLY when `args.phaseEnd === true`?** v0.1 conservative chooses opt-in (build only when `args.phaseEnd === true`). The DAG build is ~5-10ms; Story 4.5+ may need it for time/token budgets so the opt-in heuristic may need broadening. Trade-off: opt-in (v0.1; cheap for non-phase flags) vs always (simpler code; ~5-10ms always). v0.1 chooses opt-in; tracked here.

9. **`LoopContext` immutability: should it be `readonly` (v0.1) or mutable (allows in-place baseline-update for the fresh-project case)?** v0.1 chooses `readonly` interface fields; the runLoop creates a NEW `LoopContext` object via spread (`loopContext = { ...loopContext, startStory: ... }`) when updating the baseline. Trade-off: readonly (v0.1; structural sharing; safe) vs mutable (less allocation but invites bugs). v0.1 chooses readonly; tracked here.

10. **Should `phase-end` predicate check the PHASE of the next computed step (per AC-2 verbatim) or the just-completed step (v0.1)?** AC-2 says "the next computed step is in a different BMAD phase than the current". v0.1 conservative interprets this as POST-iteration check (per Story 4.2 OQ-3 inheritance) — after a successful iteration, the just-completed step's phase is compared against the baseline. The "next computed step" wording is interpreted as "the step that was just computed and run"; the alternative interpretation (look ahead at runNext's NEXT computation without running it) would require duplicating runNext's DAG traversal — same trade-off as OQ-3 in 4.2. Trade-off: post-iteration (v0.1; symmetric with 4.2) vs pre-iteration (matches AC verbatim but harder). v0.1 chooses post-iteration; tracked here.

## Forward Action Items

- **Story 4.4 (`--max-iters=50` default cap)**: Will REMOVE the `hasOtherStopCondition` guard added by Story 4.2 + extended by Story 4.3 (now recognizes 4 flags); will REMOVE the v0.1 `no-stop-condition` placeholder branch; will ADD `args.maxIters = args.maxIters ?? 50` default cap.
- **Story 4.5 (`--time-budget`, `--token-budget` stop conditions)**: Will EXTEND `stop-conditions.ts` with two more predicates consuming a new `LoopMetrics` interface (analogous to Story 4.3's `LoopContext`).
- **Story 4.6 (`--stop-on-error` / `--continue-on-error` policy)**: Will EXTEND `stop-conditions.ts` with predicate(s) consuming per-iteration runNext exit code + `state.lastFailureReason.code`. Also addresses Story 4.1's SF-2.
- **Story 4.7 (`--plan-first` dry-run preview)**: May reuse Story 4.2's `compareStoryIds` and Story 4.3's `LoopContext` capture pattern.
- **Story 4.8 (`--checkpoint-each <step-type>`)**: Will write per-iteration checkpoint to `_bmad-output/.stepper/checkpoints/<run-id>-iter-<N>.json` per AR11 + Story 1.6's atomic-write discipline. Independent of 4.3.
- **Story 4.9 (SIGINT graceful exit)**: May extend the per-iteration boundary check with SIGINT-triggered partial-progress reporting.
- **Story 4.10 (`--resume` hint enrichment)**: Will enrich the `--resume` hint format with `state.lastFailureReason.hint` (per Story 3.1) AND will format the AR9 exit line with structured failure-code lookup. The `formatExitReason` function that Story 4.3 extends will likely be the integration point.

## Senior Developer Review (AI)

### Reviewer

claude-opus-4-7[1m]

### Date

2026-05-03

### Outcome / Verdict

**approve**

### Summary

Story 4.3 cleanly extends the Story 4.2 stop-condition foundation with the third + fourth pure-function predicates (`nextStoryStopCondition`, `phaseEndStopCondition`), the `LoopContext` loop-entry-baseline interface, the dispatcher signature widening, the `StopReason` discriminated-union extension (5 → 7 variants), and the runtime plumbing in `runLoop` (opt-in DAG load gated on `args.phaseEnd === true`, baseline capture before the `while (true)` loop, deferred-baseline update for the fresh-project edge case, threading `loopContext` through `shouldStop` → `evaluateStopConditions`, `formatExitReason` cases for both new variants, and the `hasOtherStopCondition` widening for two more flags). All FOUR tasks per the file-list are scope-honored: ZERO new source files, FIVE modified source files, ONE modified markdown file, ZERO new error classes (registry holds at 16), ZERO state-schema changes.

The implementation is structurally consistent with Story 4.2's precedent: the predicates short-circuit gracefully on `undefined`/`null` inputs (no throws per AR33), the `compareStoryIds` helper is reused for the `1.10 vs 1.2` numeric-segment hazard, and the dispatcher's declaration order (epic-end → until-story → next-story → phase-end) keeps Story 4.2's tests passing while making the new priority deterministic. AC-1, AC-2, and AC-3 each pass with verbatim message-text matches and structured-field carriage of the from→to context. The opt-in DAG-build pattern (Story 4.3 §OQ-8) preserves zero-cost behaviour for the other 5+ flags while still satisfying `--phase-end`. The fresh-project deferred-baseline pattern (§OQ-2) is correctly implemented and consistently documented (JSDoc on `LoopContext`, inline comment in `runLoop`).

What's deferred (forward-trackers): Story 4.4 will REMOVE the `hasOtherStopCondition` guard alongside the v0.1 `no-stop-condition` placeholder when the `--max-iters=50` default cap is wired (this widening becomes dead code at 4.4). Story 4.5 may upgrade the opt-in DAG load to always-build if more predicates need DAG access; the deferred-baseline 3-call pattern (D3) may be revisited if `stateFn()` becomes expensive (it is currently a `loadStateUnlocked` read so the cost is modest). Story 4.10 will enrich the `--resume` hint format with `state.lastFailureReason.hint`. The Story 4.2 nits (N-1 defensive null check at stop-conditions.ts:170; N-2 EMPTY_DAG sentinel placement; N-3 dead `dag = null` typing) are partially addressed by Story 4.3 (N-3 was substantially fixed when Story 4.3 made the DAG conditionally non-null); N-1 and N-2 remain.

### AC verification

**AC-1 — `--next-story` boundary detection**: **PASS**.
- Predicate at `src/commands/loop/stop-conditions.ts:328-353` (`nextStoryStopCondition`).
- Loop-entry baseline capture at `src/commands/loop/run.ts:469-484` (initial state's `lastSuccessfulStep?.story` → `loopContext.startStory`).
- Verbatim message at `src/commands/loop/stop-conditions.ts:349` returns `"next-story boundary reached"` (epics.md line 931 character-identical).
- `formatExitReason` for `next-story-reached` at `src/commands/loop/run.ts:641-645` produces `"next-story boundary reached (3.2 → 3.3)"` — AC-1 verbatim text PLUS embedded from→to context (per D2; endorsed by Story 4.2 precedent of allowing AR9 summary to embed extra context beyond the predicate's `message` field).
- Integration test at `src/commands/loop/run.test.ts:611-677` (`Test P_43`, `Test Q_43`, `Test R_43`) exercises end-to-end: `expect(result.stopReason.code).toBe("next-story-reached")`, `startStory === "3.2"`, `currentStory === "3.3"`, `message === "next-story boundary reached"`.
- Pure-function unit tests at `src/commands/loop/stop-conditions.test.ts` (Tests N1-N8 — verified by passing test count delta of +23 in 4.3).

**AC-2 — `--phase-end` transition detection**: **PASS**.
- Predicate at `src/commands/loop/stop-conditions.ts:392-419` (`phaseEndStopCondition`).
- DAG-lookup pattern: `dag.nodes.get(currentStep)?.phase` at `src/commands/loop/stop-conditions.ts:407-409`.
- Loop-entry baseline capture at `src/commands/loop/run.ts:474-479` (initial state's step → `loopDag.nodes.get(step)?.phase` → `loopContext.startPhase`).
- Verbatim message at `src/commands/loop/stop-conditions.ts:417` returns `phase-end (transition ${fromPhase}→${toPhase}) reached` with the unicode RIGHTWARDS ARROW (U+2192) per AC-2 epics.md line 933.
- `formatExitReason` for `phase-end-reached` at `src/commands/loop/run.ts:646-648` returns `stopReason.message` directly (already includes from→to context per AC-2 verbatim format).
- Integration test at `src/commands/loop/run.test.ts:679-747` (`Test S_43`, `Test T_43`, `Test U_43`) exercises end-to-end + graceful-degradation when DAG load returns null. Sweep-D in `run.test.ts:832-849` asserts `result.stopReason.message === "phase-end (transition planning→implementation) reached"`.

**AC-3 — integration test covers all four stop conditions**: **PASS**.
- Sweep block at `src/commands/loop/run.test.ts:787-850` (`describe("runLoop AC-3 sweep — all four stop conditions (Story 4.3)")`).
- 4 sub-tests in 1 describe block: Sweep-A `--until-epic-end` (4.2), Sweep-B `--until-story` (4.2), Sweep-C `--next-story` (4.3), Sweep-D `--phase-end` (4.3).
- All 4 sub-tests pass per the independently-verified `bun test src/commands/loop/` run (118/0/409).
- The sweep design (4 separate sub-tests, one per flag, with tailored fixtures) was a v0.1-conservative §OQ-5 adjudication and matches the AC-3 verbatim "covers all four" wording.

### Architecture invariants

**AR8** (lock-free `run.ts`; lock-held `verify-and-advance.ts`): **UPHELD**.
- Independent grep of `src/commands/loop/run.ts` for `from "../../lock/` returns ZERO matches. Asserted by `run.test.ts:240-249` (`Test I`) test.
- Story 4.3 added `import { build as buildDag }` from `src/dag/build.ts` (foundational-tier, AR41-permitted) and `import type { Phase }` from `src/dag/index.ts` (foundational-tier type). No lock imports.

**AR9** (single discriminated-union JSON line on stdout): **UPHELD**.
- The `import.meta.main` block at `src/commands/loop/run.ts:654-677` emits exactly ONE AR9 line via `emitDispatchAction({ action: "report", message, exitCode })`.
- Story 4.3 ADDS two `StopReason` variants but `formatExitReason` produces a single string per call; the AR9 single-line invariant per command invocation is preserved.
- D2 (AR9 enrichment for `next-story-reached` to embed `(${startStory} → ${currentStory})` in the message field) is endorsed by Story 4.2 precedent (the AR9 summary message MAY carry context beyond the predicate's structured `message` field; the structured `StopReason` payload remains the source of truth).
- Stderr emissions (state-snapshot pointer + `--resume` hint for `epic-end-reached`) are unchanged from Story 4.2 and do NOT pollute stdout.

**AR21 + AR22** (errors carry code + actionable hint): **UPHELD**.
- Independently verified: `grep -c "override readonly code" src/errors.ts` → 16. Story 4.3 ships ZERO new error classes.
- `bun test src/errors.test.ts` → 10 pass / 197 expects, registry held at 16.

**AR33** (no console.*; throw not Result; async/await): **UPHELD**.
- Independent grep for `console\.(log|error|warn|info|debug|trace|dir|table|time|timeEnd|group|groupEnd|count|countReset|assert)\s*\(` over `src/commands/loop/` returns 2 matches in `run.test.ts` only (test file, not production code) and ZERO matches in `stop-conditions.ts` and `run.ts` source files.
- Predicates return `null | StopReason` (never throw). The runLoop uses async/await for the optional `buildDag` call and per-iteration state/sprint-status loads. Loaders catch and return `null` per Story 4.2 OQ-4 inheritance.

**AR34** (slash-command markdown protocol): **UPHELD**.
- `commands/bmad-loop.md` modifications are documentation-only (Stop Conditions table flips for `--next-story` + `--phase-end` rows; two new sub-sections `### --next-story (Story 4.3)` and `### --phase-end (Story 4.3)`). The four-step Bash → JSON → Task → Bash protocol is untouched. `argumentHint` already encoded both flags from Story 4.1.

**AR41** (boundary graph; top-tier may import foundational): **UPHELD**.
- `stop-conditions.ts` imports only foundational-tier types: `DagAdjacency` + `Phase` from `../../dag/index.ts`, `State` from `../../schemas/state.ts`. Intra-module: `LoopArgs` from `./args.ts`, `StopReason` from `./run.ts` (TYPE-only — no runtime cycle).
- `run.ts` adds `import { build as buildDag } from "../../dag/build.ts"` (foundational-tier; AR41 line 1294-1302 permits) and `Phase` type from `../../dag/index.ts`. Asserted by `run.test.ts:267-275` (Story 4.3 boundary-check sub-test added in this story).

**AR42** (test discipline): **UPHELD**.
- Colocated test files: `src/commands/loop/stop-conditions.test.ts` (51 tests / 194 expects), `src/commands/loop/run.test.ts` (38 tests / 118 expects). No new test files; existing files extended.
- AR35 tmpdir-per-test: Story 4.3 tests do NOT touch `state.yaml` on disk; all state injected via `stateOverride` test seam. AR35 discipline preserved.

### Quality gates

Independently re-verified by this reviewer:

| Gate | Command | Exit | Counts |
|------|---------|------|--------|
| Loop suite | `bun test src/commands/loop/` | 0 | 118 pass / 0 fail / 409 expects across 3 files |
| Errors suite | `bun test src/errors.test.ts` | 0 | 10 pass / 0 fail / 197 expects |
| Biome CI | `bunx --bun biome ci .` | 0 | 134 files checked, no fixes applied |
| TSC strict | `bunx --bun tsc --noEmit` | 0 | (no output — clean) |
| Errors registry | `grep -c "override readonly code" src/errors.ts` | n/a | 16 (held; ZERO delta) |

All quality gates GREEN; counts match dev-story claims exactly.

### Open Questions adjudication

| OQ | Topic | Verdict | Rationale |
|----|-------|---------|-----------|
| OQ-1 | loopContext explicit-capture vs DAG-lookup of "next runnable step" | **ACCEPT** | v0.1-conservative explicit capture per orchestrator brief option (a); simpler + symmetric with Story 4.2 OQ-3 post-iteration check. DAG-lookup approach (b) would duplicate runNext's traversal — not justified for v0.1. |
| OQ-2 | Fresh-project edge case (deferred-baseline pattern) | **ACCEPT** | The deferred-baseline update at run.ts:547-571 correctly handles the fresh-project case; immediate-fire would trivially fire on iter 0 (wrong). The `null`-baseline short-circuit + post-iter capture is well-documented in JSDoc + inline comments. |
| OQ-3 | State-shape `state.workflow.phase` vs `state.lastSuccessfulStep.step` + DAG lookup | **ACCEPT** | Verified: `state.workflow.phase` does NOT exist in `src/schemas/state.ts`. v0.1 reads `state.lastSuccessfulStep.step` and looks up via `dag.nodes.get(step).phase`. Consistent with Story 4.2 OQ-10. |
| OQ-4 | Unicode arrow vs ASCII source string | **ACCEPT** | v0.1 uses literal `→` (U+2192) in source string at stop-conditions.ts:417 per AC-2 verbatim. Tests assert exact match. The runtime-emitted message contains the actual arrow character. |
| OQ-5 | AC-3 sweep design (4 separate sub-tests vs 1 mega-test) | **ACCEPT** | 4 separate sub-tests in one describe block at run.test.ts:787-850 — failures point at the offending flag. Single-mega-test would be ambiguous about which fires first. |
| OQ-6 | Interaction order `--next-story` vs `--until-story` when both supplied | **ACCEPT** | Dispatcher declaration order (epic-end → until-story → next-story → phase-end) puts `--until-story` second (more specific) before `--next-story` third (more general). Deterministic. |
| OQ-7 | Should `phase-end` fire on workflow exhaustion (no more steps)? | **ACCEPT** | v0.1 fires ONLY on real phase transition (current step's phase != baseline). No-more-steps handling deferred to Story 4.10 / 5.x. Conservative + AC-2-faithful. |
| OQ-8 | Always-build DAG vs opt-in (only when `args.phaseEnd === true`) | **ACCEPT** | v0.1 opt-in at run.ts:454-456 — preserves zero-cost behaviour for the other 5+ flags. ~5-10ms cost per loop entry only when needed. Story 4.5+ may broaden if more predicates need DAG. |
| OQ-9 | `LoopContext` immutability (`readonly` vs mutable) | **ACCEPT** | v0.1 readonly fields at stop-conditions.ts:84-87. The deferred-baseline update path at run.ts:547-571 uses spread-assignment (`loopContext = { startStory: ..., startPhase: ... }`). Structural sharing; safe. |
| OQ-10 | Predicate checks pre-iter vs post-iter | **ACCEPT** | v0.1 post-iteration check (symmetric with Story 4.2 OQ-3). Pre-iteration check would require duplicating runNext's DAG traversal — same trade-off as Story 4.2. |

All 10 OQs ACCEPT. ZERO REJECT. ZERO DEFER (none of the OQs surface environmental blockers like Story 4.2's OQ-OOM).

### Deviations adjudication

| D# | Topic | Verdict | Rationale |
|----|-------|---------|-----------|
| D1 | Spec referred to `buildDag`; canonical export is `build` from `src/dag/build.ts:519` | **ACCEPT** | Mechanical: resolved via renamed import `import { build as buildDag } from "../../dag/build.ts"`. Functionally equivalent. The spec text was an early-draft naming; the import-rename pattern is idiomatic TypeScript. The canonical `build` export is correct and stable. |
| D2 | `formatExitReason` for `next-story-reached` enriches the AR9 summary with `(${startStory} → ${currentStory})` beyond the predicate's `message` field | **ACCEPT** | Story 4.2 precedent endorses AR9 summary embedding extra from→to context beyond the structured `message` field (e.g., Story 4.2's `until-story-reached` carries `currentStory` separately from `targetStory` for overshoot tracking). The structured `StopReason` payload remains the source of truth; the AR9 summary is informative. AR9 single-line invariant is preserved. |
| D3 | `stateFn()` called 3 times per iter when deferred-baseline update is needed (loop-entry capture + iter pre-check + post-iter deferred-baseline read) | **ACCEPT** with forward-tracker | `stateFn()` is `loadStateUnlocked` (a fast YAML read with no lock contention); the 3-call pattern is acceptable cost for v0.1. Forward-tracker: Story 4.5+ may benefit from caching per-iteration `state` reads in a single load to reduce filesystem I/O if profiling shows the redundant reads in the per-iteration hot path. The pattern is well-documented in JSDoc + inline comments + test stubs (which were sized to 3 entries per the repair r1). |

### Must-fix items

(none)

### Should-fix items

(none)

### Nits

- **N-1 (inherited from Story 4.2)**: stop-conditions.ts:208 defensive `epicNum === undefined || epicNum === null` check has unreachable `=== null` arm given optional-chain returns `undefined`. Cosmetic; preserved from Story 4.2; not a Story 4.3 blocker.
- **N-2 (inherited from Story 4.2)**: run.ts:299-303 EMPTY_DAG sentinel positioned mid-file; convention is module-level constants near imports. Cosmetic; not addressed in 4.3.

### Info

- **I-1 (forward-tracker)**: The `hasOtherStopCondition` widening (run.ts:207-214) recognising `args.nextStory === true` and `args.phaseEnd === true` becomes dead code at Story 4.4 when the `--max-iters=50` default cap is wired. Tracked per Story 4.4 forward-tracker.
- **I-2 (forward-tracker)**: The opt-in DAG-build pattern at run.ts:454-456 may be revisited at Story 4.5 if `--time-budget` / `--token-budget` predicates need DAG access. Likely upgrade: always-build with cache invalidation between iters.
- **I-3 (forward-tracker)**: The deferred-baseline 3-call `stateFn()` pattern (D3) may benefit from per-iteration state caching at Story 4.5+ if profiling shows redundant filesystem reads.
- **I-4 (forward-tracker)**: Story 4.10 will enrich the `--resume` hint format with `state.lastFailureReason.hint` (per Story 3.1) and format the AR9 exit line with structured failure-code lookup. The `formatExitReason` function that Story 4.3 extends (run.ts:627-650) is the integration point.
- **I-5 (test-isolation note)**: Tests P_43, R_43, S_43, Sweep-C, Sweep-D rely on the 3-entry `sequenceStateStub` pattern (per repair r1). Story 4.5+ test additions should follow the same convention OR refactor `runLoop` to cache per-iter state (see I-3).
- **I-6 (Story 4.2 nits status)**: N-1 and N-2 from Story 4.2 remain; N-3 (dead `dag = null` typing) was substantially fixed by Story 4.3 (the DAG is now conditionally non-null when `args.phaseEnd === true`).
- **I-7 (sprint-status)**: Story 4.3 leaves `epic-4-retrospective` at `optional` per the original sprint-status. The retrospective trigger remains user-driven per BMAD convention.

### Forward action items

- **Story 4.4 (`--max-iters=50` default cap)**: REMOVE the `hasOtherStopCondition` guard at run.ts:207-214 alongside the v0.1 `no-stop-condition` placeholder branch at run.ts:283-289. ADD `args.maxIters = args.maxIters ?? 50` default cap per FR25. Clean up the now-dead `EMPTY_DAG` sentinel if the DAG load becomes unconditional.
- **Story 4.5 (`--time-budget`, `--token-budget`)**: EXTEND `stop-conditions.ts` with two more predicates consuming a new `LoopMetrics` interface (analogous to `LoopContext` capture but for runtime metrics: elapsedMs + tokensIn + tokensOut accumulators). Consider promoting opt-in DAG-build to always-build at this point. Consider per-iteration state caching to reduce the 3-call `stateFn()` pattern (D3 forward-tracker).
- **Story 4.10 (`--resume` hint enrichment)**: ENRICH the `--resume` hint format with `state.lastFailureReason.hint` (per Story 3.1) AND format the AR9 exit line with structured failure-code lookup. The `formatExitReason` function that Story 4.3 extends is the integration point. Also addresses Story 4.1 SF-1 (extractFailureCode EXIT_0 edge case).

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-05-03 | bmad-create-story (Iteration 1 of /bmad-loop run 2026-05-03T004012Z-bmad-next, loop 2026-05-03T003755Z-bmad-loop) | Initial story spec — status: ready-for-dev. |
| 2026-05-03 | bmad-dev-story (Iteration 2 of /bmad-loop run 2026-05-03T005536Z-bmad-next, loop 2026-05-03T003755Z-bmad-loop) | Implementation complete — all 14 tasks ticked; 23 new pure-function tests + 12 new integration tests + 4 sweep sub-tests added; quality gates GREEN (118 loop tests / 0 fail / 409 expects across 3 files; errors registry held at 16; biome ci 0; tsc --noEmit 0). Status: ready-for-dev → review. |
| 2026-05-03 | bmad-code-review (Iteration 3 of /bmad-loop run 2026-05-03T011743Z-bmad-next, loop 2026-05-03T003755Z-bmad-loop) | Senior Developer Review (AI) — verdict approve. AC-1/AC-2/AC-3 all PASS with file:line evidence. AR8/9/21/22/33/34/41/42 all UPHELD. Quality gates re-verified independently (loop 118/0/409, errors 10/0/197, biome 0, tsc 0, registry 16). 10 OQs all ACCEPT; 3 deviations (D1/D2/D3) all ACCEPT. 0 must-fix, 0 should-fix, 2 nits (inherited from 4.2), 7 info. Status: review → done. |

## Dev Agent Record

### Context Reference

Inputs read during dev-story implementation:

- `_bmad-output/implementation-artifacts/4-3-stop-condition-next-story-and-phase-end.md` — this story spec (740 lines, 14 tasks/92 subtasks, 10 OQs).
- `_bmad-output/implementation-artifacts/4-2-stop-condition-epic-end-and-story-x-y.md` — predecessor (done) for predicate contract precedent.
- `_bmad-output/implementation-artifacts/4-1-bmad-loop-command-skeleton.md` — predecessor (done) for runtime skeleton precedent.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — confirmed 4-3 = `ready-for-dev` (line 85) before flipping to `review`.
- `src/commands/loop/stop-conditions.ts` — Story 4.2 baseline (440 lines); EXTENDED to 477 lines.
- `src/commands/loop/stop-conditions.test.ts` — Story 4.2 baseline (28 tests / 152 expects); EXTENDED to 51 tests / 194 expects.
- `src/commands/loop/run.ts` — Story 4.2 baseline (537 lines); EXTENDED to 677 lines.
- `src/commands/loop/run.test.ts` — Story 4.2 baseline (25 tests / 88 expects); EXTENDED to 38 tests / 118 expects (incl. AC-3 sweep block + new AR41 boundary check for `buildDag`).
- `src/commands/loop/args.ts` — verified `nextStory` (line 94) + `phaseEnd` (line 95) are `z.boolean().optional()`.
- `src/dag/types.ts:30-35` — verified `Phase` literal union `"analysis" | "planning" | "solutioning" | "implementation" | "retro"`.
- `src/dag/index.ts` — verified `Phase` is re-exported (line 32). NOTE: spec referenced `buildDag` but the canonical export is `build` from `src/dag/build.ts`; renamed-on-import in `run.ts` (`import { build as buildDag }`).
- `src/dag/build.ts:519` — verified `build(input: BuildInput): Promise<DagAdjacency>` signature; called with `{ skillNames: [] }` for opt-in load (Tier-1 seed-only DAG is sufficient for `step → phase` lookups since seed enumerates all canonical BMAD skills).
- `src/schemas/state.ts:92-119` — verified `state.lastSuccessfulStep.{step, epic, story, completedAt}` shape. `state.workflow.phase` does NOT exist; OQ-3 adjudication confirmed.
- `src/errors.ts` — verified registry holds at 16 codes (`grep -c "override readonly code" → 16`); Story 4.3 ships ZERO new error classes.
- `commands/bmad-loop.md` — Stop Conditions table at lines 162-176; flipped 4-3 rows from "parsed only" to "RUNTIME-WIRED in 4.3"; added two new sub-sections after the `### --until-story X.Y (Story 4.2)` block.
- `.bmad-stepper/runs/2026-05-02T011932Z-bmad-next/tasks/t1-dev-story.yaml` — Story 4.2 task record template for the t1 self-check structure.
- `.bmad-stepper/runs/2026-05-03T005536Z-bmad-next/run.yaml` — confirmed iter-2 declared mutation scope (allowedPaths matches the 9 modified/created paths exactly).

### Agent Model Used

claude-opus-4-7[1m] (Anthropic Opus 4.7 with 1M context window).

### Debug Log References

No debug logs generated; all quality gates passed on first run-through after impl + initial test sequencing fix.

One iteration of repair was needed during test development:

- **Repair r1** (Test P_43 sequencing fix): the initial test sequence stub provided 2 states (loop-entry baseline + post-iter), but the runLoop calls `stateFn()` THREE times before exiting on the first transition: (a) loop-entry capture; (b) iter-0 pre-check (shouldStop); (c) iter-1 pre-check (shouldStop — this is when the story has flipped). The fix: extended the sequence stub to provide 3 states (`3.2`, `3.2`, `3.3`) so iter-0 sees the unchanged baseline → no fire → runs the iteration; iter-1 sees the changed story → fires. Same fix applied to Test R_43 + Sweep-C + Sweep-D (and analogously to Test S_43 with phase fixtures). Tracked in this Completion Notes section + the t1 task record's `repairs` block.

### Completion Notes List

**AC-1 (`--next-story`)**: implemented `nextStoryStopCondition` in `src/commands/loop/stop-conditions.ts:312` (~50 lines incl JSDoc). Predicate fires when `args.nextStory === true` AND `loopContext.startStory !== null` AND `compareStoryIds(state.lastSuccessfulStep.story, baseline) !== 0`. Returns `StopReason.next-story-reached` carrying `startStory` + `currentStory` + verbatim message `"next-story boundary reached"`. Edge cases (all return null): args undefined/false; loopContext undefined; baseline null; state.lastSuccessfulStep null. Re-uses Story 4.2's `compareStoryIds` for numeric-segment ordering (1.10 vs 1.2 hazard). Tests N1-N8 (8 cases) cover all branches.

**AC-2 (`--phase-end`)**: implemented `phaseEndStopCondition` in `src/commands/loop/stop-conditions.ts:380` (~58 lines incl JSDoc). Predicate fires when `args.phaseEnd === true` AND `loopContext.startPhase !== null` AND DAG-lookup `dag.nodes.get(state.lastSuccessfulStep.step)?.phase !== fromPhase`. Returns `StopReason.phase-end-reached` carrying `fromPhase` + `toPhase` + verbatim message `"phase-end (transition planning→implementation) reached"` (unicode RIGHTWARDS ARROW U+2192 per OQ-4). Edge cases (all return null): args undefined; loopContext undefined; baseline null; state.lastSuccessfulStep null; DAG lookup fails (graceful per OQ-4 inheritance from 4.2). Tests P1-P6c (8 cases) cover all branches.

**AC-3 (sweep)**: added `describe("runLoop AC-3 sweep — all four stop conditions (Story 4.3)", …)` block in `src/commands/loop/run.test.ts` with 4 sub-tests — Sweep-A (`--until-epic-end`), Sweep-B (`--until-story 3.2`), Sweep-C (`--next-story`), Sweep-D (`--phase-end`). Each sub-test exercises ONE flag with its own tailored fixture; failures point at the offending flag. Satisfies AC-3 verbatim ("integration test covers all four stop conditions").

**Dispatcher extension**: `evaluateStopConditions` widened to accept optional `loopContext?: LoopContext` parameter; declaration order is now `untilEpicEnd → untilStory → nextStory → phaseEnd` (first non-null wins). Tests EVAL_43_1, EVAL_43_2, EVAL_43_3, EVAL_43_4, EVAL_43_5 verify priority order + null-baseline short-circuit.

**StopReason union**: extended in `src/commands/loop/run.ts:90-118` with two variants: `next-story-reached { startStory, currentStory, message }` and `phase-end-reached { fromPhase: Phase, toPhase: Phase, message }`. The discriminated union now has 7 variants (was 5).

**Runtime wiring**: `runLoop` extended at the entry point (before `while` loop) with: (a) opt-in `await dagFn()` when `args.phaseEnd === true` (production calls `buildDag({ skillNames: [] })`; tests inject via `dagOverride`); (b) `loopContext` capture from initial state + DAG. Per-iteration: `shouldStop` widened with `loopContext` parameter; threaded through to `evaluateStopConditions`. Post-iteration: deferred-baseline update for the fresh-project edge case (when `loopContext.startStory === null` at entry, the runLoop captures the just-completed iteration's story as the baseline — OQ-2 adjudication).

**`hasOtherStopCondition`**: extended in `src/commands/loop/run.ts:181` to recognize `args.nextStory === true || args.phaseEnd === true`. Suppresses the v0.1 `no-stop-condition` placeholder when either flag is supplied alone (without `--max-iters`). Tests V_43 (two cases) verify suppression. Story 4.4 will REMOVE this helper entirely.

**`formatExitReason`**: extended with cases for both new variants. `next-story-reached` → `"next-story boundary reached (3.2 → 3.3)"` (AR9 summary embeds from→to context per Story 4.2 precedent). `phase-end-reached` → returns the StopReason's verbatim `message` (already includes from→to context per AC-2).

**Test counts** (final, post-implementation):
- `src/commands/loop/stop-conditions.test.ts`: 51 pass / 0 fail / 194 expects across 1 file (was 28/0/152; +23 tests, +42 expects).
- `src/commands/loop/run.test.ts`: 38 pass / 0 fail / 118 expects across 1 file (was 25/0/88; +13 tests, +30 expects — incl. 7 new individual integration tests for AC-1/AC-2/V_43, 4 sweep sub-tests for AC-3, 1 new boundary check for buildDag).
- `src/commands/loop/run.ts` (loop barrel test): unchanged (29 pass / 0 fail / 97 expects).
- **Total `src/commands/loop/`**: 118 pass / 0 fail / 409 expects across 3 files (was 82/0/335; +36 tests, +74 expects).
- `src/errors.test.ts`: 10 pass / 0 fail / 197 expects (UNCHANGED — registry held at 16 codes).

**Quality gates** (final):
- `bun test src/commands/loop/`: exit 0, 118/0/409.
- `bun test src/errors.test.ts`: exit 0, 10/0/197.
- `bunx --bun biome ci .`: exit 0, 134 files checked (1 format fix applied via `biome format --write` during dev — long `evaluateStopConditions` call wrapped onto multi-line per biome's 80-col preference).
- `bunx --bun tsc --noEmit`: exit 0, no errors.
- Errors registry: held at 16 (`grep -c "override readonly code" src/errors.ts → 16`).

**Open Questions adjudicated** (10 total per spec §Open Questions for Code Review):
1. **OQ-1** (loopContext explicit-capture vs DAG-lookup of "next runnable step"): ACCEPT v0.1 explicit `loopContext` capture per OQ-1 in spec; DAG-lookup approach deferred. Implementation matches spec.
2. **OQ-2** (fresh-project edge case): ACCEPT v0.1 deferred-baseline pattern — when `state.lastSuccessfulStep === null` at entry, the first iteration's resulting story is captured as the baseline; subsequent iterations fire on transition. Implementation matches spec via the post-iteration update block in `runLoop`.
3. **OQ-3** (state-shape `state.workflow.phase` vs `state.lastSuccessfulStep.step` + DAG lookup): ACCEPT v0.1 DAG-lookup. Verified `state.workflow.phase` does NOT exist in `src/schemas/state.ts`. Implementation reads `state.lastSuccessfulStep.step` and looks up via `dag.nodes.get(step).phase`.
4. **OQ-4** (unicode arrow vs ASCII): ACCEPT v0.1 source-unicode (literal `→` U+2192 in source string). The runtime-emitted message contains the actual arrow character. Tests assert exact match.
5. **OQ-5** (sweep design): ACCEPT v0.1 — 4 separate sub-tests in one describe block. Each exercises one flag with tailored fixture; failures point at the offending flag.
6. **OQ-6** (interaction order `--next-story` vs `--until-story`): ACCEPT v0.1 — `--until-story` declared SECOND in dispatcher (precedes `--next-story` declared THIRD); deterministic. Test EVAL_43_2 verifies.
7. **OQ-7** (phase-end on workflow exhaustion): ACCEPT v0.1 — predicate fires ONLY on real phase transition (not on no-more-steps). No-more-steps handling deferred to Story 4.10 / 5.x.
8. **OQ-8** (always-build DAG vs opt-in): ACCEPT v0.1 opt-in (build only when `args.phaseEnd === true`). Implementation gated by `if (args.phaseEnd === true)` at runLoop entry. Story 4.5+ may broaden.
9. **OQ-9** (LoopContext readonly vs mutable): ACCEPT v0.1 readonly. Implementation uses spread (`loopContext = { ...loopContext, startStory: ... }`) for the deferred-baseline update path.
10. **OQ-10** (predicate checks pre-iter vs post-iter): ACCEPT v0.1 post-iteration check (symmetric with Story 4.2 OQ-3). Implementation matches.

**Deviations from spec**:
- **D1**: Spec referred to `buildDag` from `src/dag/build.ts` but the canonical export is `build` (from `src/dag/build.ts:519`). Resolved via renamed import: `import { build as buildDag } from "../../dag/build.ts"`. Functionally equivalent.
- **D2**: Spec Task 7.1 named the helper `formatExitReason` cases for `next-story-reached` and `phase-end-reached`. The `next-story-reached` case uses an enriched message format `"next-story boundary reached (${startStory} → ${currentStory})"` per Story 4.3 spec note (Story 4.2 precedent of allowing AR9 summary to embed extra context beyond the predicate's `message` field). Documented inline in the implementation.
- **D3**: Spec Task 5.5 / 5.4 sequencing — the runLoop calls `stateFn()` THREE times per iteration in some configurations (loop-entry capture + iter-0 pre-check + post-iter deferred-baseline-update read). The Test P_43, R_43, S_43, Sweep-C, Sweep-D state-sequence stubs were sized accordingly (3 entries instead of 2). Documented in test comments.

### File List

Files modified (5 source + 1 markdown + 1 sprint-status YAML + 1 story file = 8 total):

| Path | Kind | Lines | Bytes | Summary |
|------|------|-------|-------|---------|
| `src/commands/loop/stop-conditions.ts` | modified | 477 | 20239 | +`LoopContext` interface; +`Phase` import; +`nextStoryStopCondition`; +`phaseEndStopCondition`; widened `StopConditionFn` + `evaluateStopConditions` signatures with optional `loopContext` parameter; updated module-header JSDoc. |
| `src/commands/loop/stop-conditions.test.ts` | modified | 718 | 26321 | +23 new tests across 4 describe blocks: Tests N1-N8 (`nextStoryStopCondition`), Tests P1-P6c (`phaseEndStopCondition`), Tests EVAL_43_* (dispatcher priority), Test 17 (predicate purity). +`makeDagFixture` helper; widened `makeState` to accept custom step name. |
| `src/commands/loop/run.ts` | modified | 677 | 27576 | +`build as buildDag` import; +`Phase` import; +`LoopContext` import; +2 `StopReason` variants (`next-story-reached`, `phase-end-reached`); +`dagOverride` test seam in `LoopOpts`; widened `hasOtherStopCondition` + `shouldStop` signatures; +loop-entry baseline capture + opt-in DAG load + deferred-baseline update path inside `runLoop`; +2 `formatExitReason` cases. |
| `src/commands/loop/run.test.ts` | modified | 861 | 33448 | +describe("runLoop --next-story"): 3 tests (P_43, Q_43, R_43). +describe("runLoop --phase-end"): 3 tests (S_43, T_43, U_43). +describe("Test V_43"): 2 tests (no-stop-condition guard for both new flags). +describe("AC-3 sweep"): 4 sub-tests (Sweep-A through Sweep-D). +1 boundary check (`buildDag` import). +`makeStateFixtureFull` + `makeDagFixture` + `sequenceStateStub` helpers. |
| `commands/bmad-loop.md` | modified | 338 | 15399 | Stop Conditions table: flipped `--next-story` and `--phase-end` rows from "parsed only" to "RUNTIME-WIRED in 4.3". +2 new sub-sections: `### --next-story (Story 4.3)` + `### --phase-end (Story 4.3)` with example invocations + behaviour notes + edge-case documentation. |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | modified | 114 | (see file) | Flipped `4-3-stop-condition-next-story-and-phase-end: ready-for-dev → review` (line 85). Bumped `last_updated:` to `2026-05-03T01:50:00Z` (lines 2 + 38). |
| `_bmad-output/implementation-artifacts/4-3-stop-condition-next-story-and-phase-end.md` | modified | 740 | (this file) | Frontmatter status: ready-for-dev → review; bumped `last_updated`. Inline `Status:` → review. All 14 task checkboxes ticked (`- [ ]` → `- [x]`). Populated §Dev Agent Record (Context Reference + Agent Model Used + Debug Log References + Completion Notes + File List). Appended Change Log entry. |
| `.bmad-stepper/runs/2026-05-03T005536Z-bmad-next/tasks/t1-dev-story.yaml` | created | (new) | (new) | Self-check task record: declared mutation scope, inputsRead, outputsProduced, selfCheck (scopeHonored, qualityGatesGreen, noErrorsRegistryChange), test counts, code metrics, repairs, openQuestionsAdjudicated, deviations. Mirrors the structure of the Story 4.2 task record. |
