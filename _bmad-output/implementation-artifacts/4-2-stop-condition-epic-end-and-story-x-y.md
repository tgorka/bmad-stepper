---
status: done
story_id: '4.2'
story_key: 4-2-stop-condition-epic-end-and-story-x-y
epic: '4'
title: 'Stop-Condition: `epic-end` and `story-X-Y`'
created: '2026-05-02'
last_updated: '2026-05-02'
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
  - 4-1-bmad-loop-command-skeleton  # SKELETON: LoopArgsSchema declares untilEpicEnd + untilStory; runLoop has shouldStop predicate at run.ts:134-149
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/implementation-artifacts/4-1-bmad-loop-command-skeleton.md
  - _bmad-output/implementation-artifacts/sprint-status.yaml
  - _bmad-output/implementation-artifacts/3-1-record-last-attempted-last-failure-reason-on-halt.md
  - _bmad-output/implementation-artifacts/3-2-resume-flag.md
  - _bmad-output/implementation-artifacts/3-7-list-candidate-next-steps.md
  - _bmad-output/implementation-artifacts/3-8-diff-state-and-export-state.md
  - .bmad-stepper/state.yaml
  - src/commands/loop/args.ts
  - src/commands/loop/run.ts
  - src/commands/loop/run.test.ts
  - src/commands/loop/index.ts
  - src/commands/next/run.ts
  - src/state/load.ts
  - src/state/recompute.ts
  - src/dag/index.ts
  - src/errors.ts
  - commands/bmad-loop.md
---

# Story 4.2: Stop-Condition: `epic-end` and `story-X-Y`

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper user,
I want `--until-epic-end` and `--until-story <x.y>` to halt the loop on epic boundary or specific story completion,
So that I can scope an overnight run to one epic or one story.

## Context Summary

This is the **second story of Epic 4 (Bounded Loop with Eight Stop Conditions)** and it lands the **first two pure-function stop-condition predicates** in the dedicated `src/commands/loop/stop-conditions.ts` module that AC-3 mandates. Story 4.1 just shipped the `/bmad-loop` skeleton (`src/commands/loop/{args,run,index}.ts` + `commands/bmad-loop.md`) with `LoopArgsSchema` declaring all 13 future flag fields per AC-2 verbatim and `runLoop` runtime-wiring ONLY `--max-iters` per AC-1 narrow. The 12 other LoopArgsSchema fields are ARG-SURFACE-PRESENT but RUNTIME-DEFERRED. Story 4.2 is the second of those 12 to come online (after `--max-iters` in 4.1) and the first to introduce the `(state, dag) => StopReason | null` pure-function predicate contract that Stories 4.3 (`--next-story`, `--phase-end`), 4.4 (`--max-iters` default cap), 4.5 (`--time-budget`, `--token-budget`), and 4.6 (`--stop-on-error` / `--continue-on-error`) will extend.

**Story 4.2's scope is THREE acceptance criteria** (AC-1 epic-end behaviour, AC-2 story-X-Y behaviour, AC-3 pure-function file structure) and **two stop-condition flags** (`--until-epic-end` and `--until-story <x.y>`). It introduces ONE new file (`src/commands/loop/stop-conditions.ts`), modifies TWO existing files (`src/commands/loop/run.ts` to wire the predicates into the per-iteration boundary check; `commands/bmad-loop.md` to document the two flags' user-facing description), and adds TWO new colocated test files (`src/commands/loop/stop-conditions.test.ts` for pure-function tests + extends `src/commands/loop/run.test.ts` for integration tests).

**The pure-function contract per AC-3** (epics.md line 919): `src/commands/loop/stop-conditions.ts` exports each stop-condition as a pure function `(state, dag) => boolean`. v0.1 conservative interprets the contract as `(state, dag, args) => StopReason | null` — i.e., the predicate accepts the loop's `LoopArgs` plus the canonical `StepperState` (loaded via `src/state/load.ts`) plus the canonical `Dag` (constructed via `src/dag/index.ts`), and returns either `null` (condition not met; loop continues) OR a `StopReason` object with `code` (e.g., `"epic-end-reached"` or `"until-story-reached"`) and a `message` (matching the AC-1 / AC-2 verbatim wording: `"epic-end reached"` or `"story 3.2 reached"`). The boolean-vs-StopReason narrowing decision is documented in §Open Questions for Code Review §OQ-1 — the AC says "boolean" but Story 4.1's existing `StopReason` discriminated union already encodes the richer return shape; v0.1 conservative extends rather than narrows to preserve the existing `LoopResult.stopReason` shape AND the `runLoop` per-iteration boundary check at `src/commands/loop/run.ts:134-149`.

**`--until-epic-end` semantics per AC-1 verbatim** (epics.md line 913-915): `--until-epic-end` is supplied → the loop completes a step that's the last in the current epic phase (story shipped + retro filed if applicable) → exits with reason `epic-end reached` and prints state-snapshot pointer + `--resume` hint. Concretely: after each iteration's `runNext` returns success, the predicate consults `state.workflow.epic` (the current epic) AND the DAG's per-epic story enumeration (e.g., `dag.storiesInEpic("4")` returning `["4.1", "4.2", ..., "4.10"]`) AND sprint-status.yaml's per-story status map (loaded fresh per iteration from `_bmad-output/implementation-artifacts/sprint-status.yaml`). The predicate returns non-null (stop) when ALL stories in the current epic are `done` AND the epic-N-retrospective is either `done` OR `optional` (per the existing sprint-status epic-N-retrospective convention from Stories 1.13, 2.8, 3.10). The `--resume` hint format follows Story 4.10's forward-tracker (Story 4.10 will enrich with `state.lastFailureReason.hint`); Story 4.2 prints a v0.1-conservative format: `"Run /bmad-loop --resume to continue from current state."`

**`--until-story <x.y>` semantics per AC-2 verbatim** (epics.md line 916-918): `--until-story 3.2` is supplied → the loop completes a step in story 3.2 OR begins a step in a story past 3.2 → exits with reason `story 3.2 reached`. Concretely: the predicate canonicalises the user-supplied `<x.y>` arg (already validated by the `LoopArgsSchema.untilStory` regex at `src/commands/loop/args.ts:88` to match `/^\d+\.\d+$/`); after each iteration's `runNext` returns success, the predicate compares `state.workflow.story` (the just-completed iteration's story) against the target. If `state.workflow.story === args.untilStory` → return non-null (stop with `"story <x.y> reached"`). If `state.workflow.story > args.untilStory` (lexicographic with numeric semantics — i.e., `4.0 > 3.99` per the canonical sort defined by `src/dag/index.ts`) → return non-null (stop with `"story <x.y> reached (overshot to <next-story>)"`).

**The `runLoop` per-iteration boundary check** at `src/commands/loop/run.ts:134-149` (Story 4.1's `shouldStop()` predicate) is EXTENDED in Story 4.2 to consume the new `stop-conditions.ts` predicates. Story 4.1's signature `shouldStop(iterCount: number, args: LoopArgs): StopReason | null` is widened to `shouldStop(iterCount: number, args: LoopArgs, state: StepperState, dag: Dag): StopReason | null`. Inside `shouldStop`, after the existing `--max-iters` check, the new code calls each active stop-condition predicate from `stop-conditions.ts` in declaration order; the first non-null return wins. The `state` and `dag` parameters are loaded ONCE per iteration in `runLoop` (after `runNext` returns success) and passed through to `shouldStop`.

**Story 4.2's integration with `runLoop`'s existing iteration accumulator**: Story 4.1's `runLoop` body at `src/commands/loop/run.ts:205-304` already loads + records per-iteration `IterationRecord` shape; Story 4.2 adds **after the existing record append** a `loadState() + buildDag()` pair (importing `loadState` from `src/state/load.ts` per AR41 — `src/commands/loop/` may import `src/state/load.ts` because state is foundational-tier; the AR41 boundary graph permits top-tier → foundational-tier imports). The `shouldStop` invocation then uses both the in-memory `iterCount` AND the freshly-loaded `state` + `dag`. This pattern preserves Story 4.1's lock-free invariant per AR8 (no `src/lock/` imports added).

**Story 4.2 is INTENTIONALLY NARROW** on the `(state, dag, args) => StopReason | null` contract — Stories 4.3 (`--next-story`, `--phase-end`), 4.5 (`--time-budget`, `--token-budget`), and 4.6 (`--stop-on-error` / `--continue-on-error`) will extend the predicate set, but the file structure + the runLoop integration + the AC-3 pure-function file emerges in 4.2. Story 4.4 (`--max-iters` default cap) will REMOVE the v0.1 `"no-stop-condition"` placeholder branch that Story 4.1 left at run.ts:144-148 (per the Story 4.1 §Forward Action Items §Story 4.4 forward-tracker AND the 4.1-code-review SF-1 forward-tracker to Story 4.10).

**Concretely, Story 4.2 produces:**

1. **`src/commands/loop/stop-conditions.ts`** (NEW, ~180-280 lines): exports each stop-condition as a pure function `(state, dag, args) => StopReason | null`. Story 4.2 ships TWO predicates:
   - `untilEpicEndStopCondition(state, dag, args, sprintStatus): StopReason | null` — fires when `args.untilEpicEnd === true` AND all stories in `state.workflow.epic` are `done` per `sprintStatus.development_status` AND the `epic-N-retrospective` entry is either `done` or `optional`.
   - `untilStoryStopCondition(state, dag, args): StopReason | null` — fires when `args.untilStory !== undefined` AND `state.workflow.story === args.untilStory` (exact match) OR `compareStoryIds(state.workflow.story, args.untilStory) > 0` (overshoot per the canonical numeric-segment sort).
   - The file ALSO exports `evaluateStopConditions(state, dag, args, sprintStatus): StopReason | null` — calls each predicate in declaration order; returns the first non-null. Stories 4.3/4.5/4.6 will extend this dispatcher.
   - The file ALSO exports `compareStoryIds(a: string, b: string): -1 | 0 | 1` helper (numeric-segment-comparator) — reused by Stories 4.3 (`--next-story`) and 4.6 (`--stop-on-error` lexicographic-then-numeric tie-breaks).

2. **`src/commands/loop/run.ts`** (MODIFIED, ~30-50 lines added): widen `shouldStop` to accept `state: StepperState` and `dag: Dag` parameters. After the existing `--max-iters` check, call `evaluateStopConditions(state, dag, args, sprintStatus)` from `stop-conditions.ts`; if non-null, return the StopReason. Add `loadState` import from `src/state/load.ts` AND `buildDag` (or equivalent canonical dag-builder) from `src/dag/index.ts` AND `loadSprintStatus` from a new helper or inline yaml read. After each `runNext` invocation in the per-iteration loop, load state + dag + sprintStatus fresh; pass to `shouldStop`. For `--until-epic-end`, also print a state-snapshot pointer + `--resume` hint to stderr (per FR54 stdout/stderr discipline) when the predicate fires.

3. **`commands/bmad-loop.md`** (MODIFIED, ~10-20 lines added): in the §Stop Conditions table (Story 4.1 added this table in OQ-8 disambiguation), update the `--until-epic-end` and `--until-story X.Y` rows from "deferred to 4.2" to "wired in 4.2"; add user-facing description with example invocation.

4. **`src/commands/loop/stop-conditions.test.ts`** (NEW, ~250-380 lines): pure-function unit tests of each predicate against fixture states. Test cases:
   - `untilEpicEndStopCondition` fires when current epic is fully done + retrospective done.
   - `untilEpicEndStopCondition` fires when current epic is fully done + retrospective optional.
   - `untilEpicEndStopCondition` does NOT fire when one story still backlog/in-progress/review.
   - `untilEpicEndStopCondition` does NOT fire when retrospective not-done-not-optional (legacy edge case).
   - `untilEpicEndStopCondition` does NOT fire when `args.untilEpicEnd === undefined`.
   - `untilStoryStopCondition` fires when `state.workflow.story === args.untilStory`.
   - `untilStoryStopCondition` fires when `state.workflow.story > args.untilStory` (overshoot).
   - `untilStoryStopCondition` does NOT fire when `state.workflow.story < args.untilStory`.
   - `untilStoryStopCondition` does NOT fire when `args.untilStory === undefined`.
   - `compareStoryIds` numeric-segment ordering: `1.1 < 1.2 < 1.10 < 1.11 < 2.1` (NOT lexicographic which would put 1.10 < 1.2).
   - `evaluateStopConditions` returns the first non-null in declaration order.

5. **`src/commands/loop/run.test.ts`** (EXTENDED, ~120-200 lines added): integration tests covering:
   - `runLoop({ argv: ["--until-epic-end"], runNextOverride: ... })` with a fixture state where the just-completed epic is fully done → exits with `stopReason.code === "epic-end-reached"` AND `exitCode === 0`.
   - `runLoop({ argv: ["--until-story", "3.2"], runNextOverride: ... })` with a fixture state where `state.workflow.story === "3.2"` → exits with `stopReason.code === "until-story-reached"` AND `stopReason.message === "story 3.2 reached"`.
   - `runLoop({ argv: ["--until-story", "3.2"], runNextOverride: ... })` with a fixture state where the iteration overshoots to `state.workflow.story === "3.3"` → exits with `stopReason.code === "until-story-reached"` AND the message includes the overshoot phrasing.
   - `runLoop({ argv: ["--until-epic-end"], runNextOverride: ... })` with stderr capture asserting the state-snapshot pointer + `--resume` hint emission (per AC-1).

6. **`_bmad-output/implementation-artifacts/sprint-status.yaml`** (MODIFIED): flips `4-2-stop-condition-epic-end-and-story-x-y: backlog → ready-for-dev`. Bumps `last_updated:` timestamp.

**FR/NFR/AR mapping:**

- **FR8** (`/bmad-next` single-step advance): CONSUMED unchanged — the loop runner continues to invoke `runNext` once per iteration; the new stop-condition predicates run AFTER each `runNext` returns success.
- **FR9** (`--dry-run`): NOT EXERCISED in 4.2. Forward-tracker for Story 4.7.
- **FR19** (Bounded Loop Execution — eight stop-condition types): PARTIAL (3 of 8). Story 4.1 wired `--max-iters`; Story 4.2 wires `--until-epic-end` + `--until-story <x.y>`; Stories 4.3-4.10 wire the rest.
- **FR53** (documented exit codes): UNCHANGED. Story 4.2's stop conditions all return `exitCode: 0` (clean exit) when fired. The `halt-on-error` path from Story 4.1 is unchanged.
- **FR54** (stdout/stderr discipline): EXTENDED. The `--until-epic-end` state-snapshot pointer + `--resume` hint per AC-1 is emitted to stderr (NOT stdout) per FR54 + Story 4.1's AR9 final-emission discipline. The single AR9 line on stdout is preserved.
- **NFR-P1** (next-step computation < 500ms p95): PRESERVED. The new per-iteration boundary check adds: ONE state-load (~5-10ms; sub-millisecond after fs cache), ONE dag-build (~1-5ms; cached), ONE sprint-status yaml load (~5-10ms; sub-millisecond after fs cache), TWO predicate invocations (sub-millisecond each — pure functions). Total per-iteration overhead is ~10-30ms — well within NFR-P1.
- **NFR-S2** (writes only inside scope): PRESERVED. Story 4.2 ships ZERO new write paths; the per-iteration state-loads are READ-ONLY; the state-snapshot pointer + resume-hint are stderr emissions (NOT writes).
- **NFR-S5** (atomic writes + locks): PRESERVED. The loop runner remains lock-free per AR8 + Story 2.4's contract; the per-iteration `verify-and-advance.ts` (lock-held side) is unchanged.
- **NFR-R1** (zero data loss on halt): PRESERVED. The new stop-condition fires AFTER `runNext` returns success — there is no in-flight dispatch to lose. The `IterationRecord` accumulator (Story 4.1) records the just-completed iteration before the stop-condition predicates evaluate.
- **NFR-R4** (lock release on graceful exit): PRESERVED. Per-iteration `verify-and-advance.ts` releases the lock per existing semantics; the loop's stop-condition fire is on a clean iteration boundary.
- **NFR-M3** (machine-readable JSON for `--export-state`): UNCHANGED — Story 4.2 does NOT touch `--export-state`.
- **NFR-I2** (unknown-skill fail-loud): PRESERVED — the loop runner does NOT bypass DAG resolution; per-iteration `runNext` continues to fail-loudly on unknown DAG nodes.
- **AR8** (lock-free `run.ts` / lock-held `verify-and-advance.ts`): UPHELD. The new `src/commands/loop/stop-conditions.ts` is a pure-function module — ZERO I/O imports. The `runLoop` runner adds `loadState` (foundational-tier read) and `buildDag` (foundational-tier read) per AR41; ZERO `src/lock/` imports added.
- **AR9** (single discriminated-union JSON line on stdout): UPHELD. The single AR9 line on stdout is preserved. The new state-snapshot pointer + resume-hint go to STDERR per FR54.
- **AR21 + AR22** (errors carry code + actionable hint): UNCHANGED. Story 4.2 ships ZERO new error classes — the registry stays at 16 codes. The `--until-epic-end` resume-hint reuses the existing `state.lastFailureReason.hint` formatting helpers (Story 3.1) when available; otherwise prints the v0.1-conservative fallback hint string.
- **AR33** (function & error semantics; throw not Result; no console.\*; async/await): UPHELD. The new `stop-conditions.ts` exports pure functions (no I/O, no throws). The runLoop modifications use async/await for the new state/dag/sprint-status loads. ZERO `console.*` calls.
- **AR34** (slash-command markdown protocol): UNCHANGED. The `commands/bmad-loop.md` modifications are documentation-only updates to the existing §Stop Conditions table.
- **AR41** (boundary graph): UPHELD. `src/commands/loop/stop-conditions.ts` is top-tier; imports ONLY foundational-tier types (`StepperState` from `src/schemas/state-v0.1.ts` or `src/state/load.ts`'s exported type; `Dag` from `src/dag/index.ts`). The `runLoop` modifications add foundational-tier imports (`loadState` from `src/state/load.ts`; `buildDag` from `src/dag/index.ts`) which are within the AR41 top-tier-may-import-foundational permission.
- **AR42** (test discipline): EXTENDED. New colocated test file `src/commands/loop/stop-conditions.test.ts`; AR35 tmpdir-per-test discipline preserved for any test that needs a state.yaml fixture.

Estimated effort: **M** (medium — ONE new TypeScript source file `src/commands/loop/stop-conditions.ts` (~180-280L); MODIFICATIONS to `src/commands/loop/run.ts` (~30-50 lines added — widen shouldStop signature, add per-iteration state/dag/sprint-status loads, integrate evaluateStopConditions); MODIFICATIONS to `commands/bmad-loop.md` (~10-20 lines updated — Stop Conditions table); ONE new test file `src/commands/loop/stop-conditions.test.ts` (~250-380L); EXTENSION of `src/commands/loop/run.test.ts` (~120-200 lines added — 4-6 new integration tests). Net additions: ~600-950 lines across 5 files. ZERO new error classes; ZERO `src/commands/next/` modifications; ZERO new schema work; ZERO `verify-and-advance.ts` modifications; ZERO `lock.ts` modifications. The first non-trivial fill-in story of Epic 4 — three more stop-condition stories (4.3, 4.5, 4.6) will follow the same pattern.)

It does **NOT**:

- **Wire the other 6 stop-condition types** (`--next-story`, `--phase-end`, `--time-budget`, `--token-budget`, `--stop-on-error`, `--continue-on-error`). Forward-deferred to Stories 4.3, 4.5, 4.6.
- **Wire the `--max-iters=50` default cap.** Forward-deferred to Story 4.4.
- **Address Story 4.1's SF-1 (extractFailureCode EXIT_0 edge case).** Forward-tracker to Story 4.10 per the 4.1-code-review forwardDependencies.
- **Address Story 4.1's SF-2 (IterationRecord.action "unknown" union member).** Forward-tracker to Story 4.6 per the 4.1-code-review forwardDependencies.
- **Format the full `--resume` hint with `state.lastFailureReason.hint` enrichment.** Forward-deferred to Story 4.10.
- **Add Zod schemas for `StopReason` variants.** v0.1 keeps `StopReason` as a TypeScript discriminated union per Story 4.1's precedent.
- **Modify `src/commands/next/run.ts`, `src/state/load.ts`, `src/dag/index.ts`, `src/lock/lock.ts`.** Story 4.2 is purely additive on a NEW `src/commands/loop/stop-conditions.ts` + edits to existing `src/commands/loop/` files.
- **Add a new error class.** Registry stays at 16 codes.
- **Implement the `(state, dag) => boolean` AC-3 verbatim signature.** v0.1 conservative widens to `(state, dag, args) => StopReason | null` per §Open Questions §OQ-1 — preserves the existing `LoopResult.stopReason` shape.

## Acceptance Criteria

The acceptance criteria below are reproduced **verbatim** from `_bmad-output/planning-artifacts/epics.md` §Story 4.2 (lines 905-919, BDD Given/When/Then format). Lines and AC labelling preserved.

**Acceptance Criteria:**

**Given** `--until-epic-end` is supplied
**When** the loop completes a step that's the last in the current epic phase (story shipped + retro filed if applicable)
**Then** the loop exits with reason `epic-end reached` and prints state-snapshot pointer + `--resume` hint
**Given** `--until-story 3.2` is supplied
**When** the loop completes a step in story 3.2 OR begins a step in a story past 3.2
**Then** the loop exits with reason `story 3.2 reached`
**And** `src/commands/loop/stop-conditions.ts` exports each stop-condition as a pure function `(state, dag) => boolean`

> **Story 4.2 stop-condition scope note:** AC-1 (`--until-epic-end`) and AC-2 (`--until-story X.Y`) are the TWO stop-condition predicates wired in 4.2. AC-3 (the `stop-conditions.ts` file structure with pure-function exports) is satisfied by the file structure + the dispatcher pattern. Stories 4.3 (`--next-story`, `--phase-end`), 4.5 (`--time-budget`, `--token-budget`), 4.6 (`--stop-on-error`, `--continue-on-error`) will extend the file with additional pure-function exports following the same `(state, dag, args) => StopReason | null` contract.

## Tasks / Subtasks

- [x] **Task 0 — Verify pre-conditions (AC: all)**
  - [x] 0.1 Confirm Story 4.1 is `done` per `_bmad-output/implementation-artifacts/sprint-status.yaml:83`. Confirm code-review verdict `approve-with-actions` per `_bmad-output/implementation-artifacts/4-1-bmad-loop-command-skeleton.md` Senior Developer Review section.
  - [x] 0.2 Read `_bmad-output/implementation-artifacts/4-1-bmad-loop-command-skeleton.md` end-to-end. Confirm:
    - `LoopArgsSchema` declares `untilEpicEnd: z.boolean().optional()` at `src/commands/loop/args.ts:88`.
    - `LoopArgsSchema` declares `untilStory: z.string().regex(/^\d+\.\d+$/).optional()` at `src/commands/loop/args.ts:89`.
    - `runLoop` exists at `src/commands/loop/run.ts:205-304` with `shouldStop(iterCount, args)` predicate at lines 134-149.
    - `IterationRecord` is exported at `src/commands/loop/run.ts:56`.
    - `StopReason` discriminated union is exported at `src/commands/loop/run.ts:76`.
    - Errors registry at `src/errors.ts` holds at 16 codes (verified by 4.1 code-review).
  - [x] 0.3 Read epics.md §Story 4.2 lines 905-919 verbatim. Confirm the AC text in §Acceptance Criteria above is character-identical to lines 911-919.
  - [x] 0.4 Read `_bmad-output/planning-artifacts/architecture.md` §AR41 (boundary graph) to confirm `src/commands/loop/` may import from `src/state/load.ts` (foundational-tier) and `src/dag/index.ts` (foundational-tier).
  - [x] 0.5 Read `src/state/load.ts` to identify the exported `loadState` function signature and the exported `StepperState` type (or equivalent — may live in `src/schemas/state-v0.1.ts`). The new `stop-conditions.ts` will import the type but NOT call `loadState` directly (predicates are pure; the runLoop calls loadState).
  - [x] 0.6 Read `src/dag/index.ts` to identify the exported `Dag` type / `buildDag` function signature. The new `stop-conditions.ts` will import the type but NOT call `buildDag` directly (predicates are pure; the runLoop calls buildDag).
  - [x] 0.7 Read `_bmad-output/implementation-artifacts/sprint-status.yaml` lines 1-30 (the STATUS DEFINITIONS comment block) to confirm:
    - Story status values: `backlog`, `ready-for-dev`, `in-progress`, `review`, `done`.
    - Retrospective status values: `optional`, `done`.
    - Epic status values: `backlog`, `in-progress`, `done`.
  - [x] 0.8 Read Story 4.1's §Open Questions §OQ-1 (no-stop-condition behaviour) and §OQ-3 (arg-surface-present + runtime-deferred). Confirm Story 4.2 INHERITS the v0.1 placeholder from 4.1's run.ts:144-148 — Story 4.4 will REMOVE it. Story 4.2 does NOT touch the placeholder.
  - [x] 0.9 Read `_bmad-output/implementation-artifacts/3-1-record-last-attempted-last-failure-reason-on-halt.md` for the canonical halt-recording mutation pair pattern. Confirm Story 4.2 does NOT modify the halt-recording surface — `--until-epic-end` and `--until-story` fire on a CLEAN iteration boundary (`runNext` returned success), so `state.lastFailureReason` is irrelevant.
  - [x] 0.10 Confirm baseline `bun run check` exits 0 with the post-Story-4.1 baseline (771 pass / 0 fail / 2889 expects / 58 files per 4.1 Senior Developer Review §Test Counts).
  - [x] 0.11 Confirm Bun host version satisfies AR2 (Bun >= 1.3). Run `bun --version`; record in Completion Notes.

- [x] **Task 1 — Create `src/commands/loop/stop-conditions.ts` with pure-function predicates (AC-3)**
  - [x] 1.1 Create `src/commands/loop/stop-conditions.ts`. Add file-level JSDoc citing FR19, AR9, AR21, AR33, AR41, AR42 + epic AC line 919 (the pure-function file structure).
  - [x] 1.2 Define module-private types:
    ```typescript
    import type { StopReason } from "./run.ts";
    import type { LoopArgs } from "./args.ts";
    import type { StepperState } from "../../schemas/state-v0.1.ts"; // or src/state/load.ts re-export
    import type { Dag } from "../../dag/index.ts";
    
    /** Sprint-status YAML structure (subset consumed by --until-epic-end). */
    export interface SprintStatus {
      readonly development_status: Readonly<Record<string, string>>;
    }
    ```
  - [x] 1.3 Export `compareStoryIds(a: string, b: string): -1 | 0 | 1` — numeric-segment comparator. Splits each id on `.`, parses each segment as integer, compares left-to-right. Critical: `"1.10" > "1.2"` (NOT lexicographic). Used by Stories 4.3 + 4.6 + the `untilStoryStopCondition`. Pure function; no I/O.
  - [x] 1.4 Export `untilEpicEndStopCondition(state, dag, args, sprintStatus): StopReason | null`:
    ```typescript
    export function untilEpicEndStopCondition(
      state: StepperState,
      dag: Dag,
      args: LoopArgs,
      sprintStatus: SprintStatus,
    ): StopReason | null {
      if (args.untilEpicEnd !== true) return null;
      const epic = state.workflow.epic;
      if (epic === undefined || epic === null) return null;
      
      // Enumerate all stories in the current epic via the DAG (or via
      // sprintStatus.development_status keys matching `^${epic}-\d+-`).
      const storyKeys = Object.keys(sprintStatus.development_status)
        .filter((k) => /^\d+-\d+-/.test(k) && k.startsWith(`${epic}-`));
      const allStoriesDone = storyKeys.every(
        (k) => sprintStatus.development_status[k] === "done"
      );
      
      // Retrospective: either done OR optional.
      const retroKey = `epic-${epic}-retrospective`;
      const retroStatus = sprintStatus.development_status[retroKey];
      const retroOk = retroStatus === "done" || retroStatus === "optional";
      
      if (allStoriesDone && retroOk) {
        return {
          code: "epic-end-reached",
          epic,
          message: "epic-end reached",
        };
      }
      return null;
    }
    ```
  - [x] 1.5 Export `untilStoryStopCondition(state, dag, args): StopReason | null`:
    ```typescript
    export function untilStoryStopCondition(
      state: StepperState,
      dag: Dag,
      args: LoopArgs,
    ): StopReason | null {
      if (args.untilStory === undefined) return null;
      const currentStory = state.workflow.story;
      if (currentStory === undefined || currentStory === null) return null;
      
      const cmp = compareStoryIds(currentStory, args.untilStory);
      if (cmp >= 0) {
        // Exact match (cmp === 0) OR overshoot (cmp > 0).
        return {
          code: "until-story-reached",
          targetStory: args.untilStory,
          currentStory,
          message: `story ${args.untilStory} reached`,
        };
      }
      return null;
    }
    ```
  - [x] 1.6 Export `evaluateStopConditions(state, dag, args, sprintStatus): StopReason | null` — dispatcher:
    ```typescript
    export function evaluateStopConditions(
      state: StepperState,
      dag: Dag,
      args: LoopArgs,
      sprintStatus: SprintStatus,
    ): StopReason | null {
      // Declaration order = evaluation order. Stories 4.3/4.5/4.6 will
      // extend this list with additional predicates.
      const epicEnd = untilEpicEndStopCondition(state, dag, args, sprintStatus);
      if (epicEnd !== null) return epicEnd;
      const untilStory = untilStoryStopCondition(state, dag, args);
      if (untilStory !== null) return untilStory;
      return null;
    }
    ```
  - [x] 1.7 Add JSDoc comments to each exported function citing the AC + the forward-tracker stories (4.3, 4.4, 4.5, 4.6) that will extend the file.
  - [x] 1.8 Extend `StopReason` discriminated union at `src/commands/loop/run.ts:76` with the two new variants:
    ```typescript
    export type StopReason =
      | { code: "max-iters-reached"; maxIters: number; iterCount: number }
      | { code: "no-stop-condition"; iterCount: number }
      | { code: "halt-on-error"; iterCount: number; failureCode: string }
      | { code: "epic-end-reached"; epic: string; message: string }            // NEW (4.2)
      | { code: "until-story-reached"; targetStory: string; currentStory: string; message: string };  // NEW (4.2)
    ```

- [x] **Task 2 — Wire `untilEpicEndStopCondition` runtime + state-snapshot pointer + `--resume` hint (AC-1)**
  - [x] 2.1 In `src/commands/loop/run.ts`, add imports at the top:
    ```typescript
    import { loadState } from "../../state/load.ts";  // or canonical export
    import { buildDag } from "../../dag/index.ts";
    import { evaluateStopConditions } from "./stop-conditions.ts";
    import { readFile } from "node:fs/promises";
    import { parse as yamlParse } from "yaml";  // or whichever YAML library is in use per Story 1.5
    ```
    Verify the import paths against the existing project conventions (Story 1.5 + 1.6 patterns).
  - [x] 2.2 Widen `shouldStop` signature at `src/commands/loop/run.ts:134-149`:
    ```typescript
    function shouldStop(
      iterCount: number,
      args: LoopArgs,
      state: StepperState | null,
      dag: Dag | null,
      sprintStatus: SprintStatus | null,
    ): StopReason | null {
      // Story 4.1: --max-iters check (unchanged).
      if (args.maxIters !== undefined && iterCount >= args.maxIters) {
        return { code: "max-iters-reached", maxIters: args.maxIters, iterCount };
      }
      // Story 4.2: extended stop-condition predicates (require state + dag + sprintStatus).
      if (state !== null && dag !== null && sprintStatus !== null) {
        const reason = evaluateStopConditions(state, dag, args, sprintStatus);
        if (reason !== null) return reason;
      }
      // Story 4.1 v0.1 pre-Story-4.4: no-stop-condition placeholder (UNCHANGED — Story 4.4 removes).
      if (args.maxIters === undefined && iterCount === 0 && !hasOtherStopCondition(args)) {
        return { code: "no-stop-condition", iterCount };
      }
      return null;
    }
    
    function hasOtherStopCondition(args: LoopArgs): boolean {
      // Story 4.2: detect untilEpicEnd / untilStory.
      // Stories 4.3/4.5/4.6 will extend.
      return args.untilEpicEnd === true || args.untilStory !== undefined;
    }
    ```
    Note: the `hasOtherStopCondition` helper prevents the v0.1 no-stop-condition placeholder from firing when `--until-epic-end` or `--until-story` is supplied without `--max-iters`. CRITICAL — Story 4.1's placeholder fires immediately on iter 0 when no condition is supplied; without this guard, `--until-epic-end` alone would halt before any iteration runs.
  - [x] 2.3 In `runLoop` body at `src/commands/loop/run.ts:205-304`, modify the per-iteration loop to load state + dag + sprint-status BEFORE the next `shouldStop` call. Pseudo:
    ```typescript
    while (true) {
      // Story 4.2: load state + dag + sprint-status fresh for stop-condition predicates.
      let state: StepperState | null = null;
      let dag: Dag | null = null;
      let sprintStatus: SprintStatus | null = null;
      try {
        state = await loadState();
        dag = buildDag();
        sprintStatus = await loadSprintStatusForLoop();
      } catch {
        // If state/dag/sprint-status load fails, the predicates degrade
        // gracefully — only the maxIters + no-stop-condition branches
        // remain. The runLoop continues; per-iteration runNext will
        // surface the underlying error if it's persistent.
      }
      
      const stopReason = shouldStop(iterCount, args, state, dag, sprintStatus);
      if (stopReason !== null) {
        // Story 4.2 AC-1: --until-epic-end emits state-snapshot pointer + --resume hint to stderr.
        if (stopReason.code === "epic-end-reached") {
          const stateSnapshotPath = ".bmad-stepper/state.yaml";
          process.stderr.write(
            `epic-end reached. State snapshot: ${stateSnapshotPath}\n` +
            `Run \`/bmad-loop --resume\` to continue from current state.\n`
          );
        }
        return finalizeLoopResult(iterations, stopReason, startedAt, loopStart);
      }
      
      // ... existing per-iteration runNext invocation + IterationRecord append ...
    }
    ```
  - [x] 2.4 Add helper `loadSprintStatusForLoop(): Promise<SprintStatus>` in `src/commands/loop/run.ts` (or extract to `src/commands/loop/sprint-status-loader.ts` if cleanliness requires). Reads `_bmad-output/implementation-artifacts/sprint-status.yaml` via `readFile` + `yamlParse`. Returns `{ development_status: Record<string, string> }`. Errors are caught + the function returns `null` (graceful degradation; predicates skip if sprintStatus is null).
  - [x] 2.5 The state-snapshot pointer text + `--resume` hint format MUST be deterministic for testability. Concrete strings:
    - Pointer line: `epic-end reached. State snapshot: .bmad-stepper/state.yaml\n`
    - Resume hint: `Run \`/bmad-loop --resume\` to continue from current state.\n`
    Both lines are written to stderr (NOT stdout) per FR54 + AR9 single-line discipline.
  - [x] 2.6 The `--resume` hint format is v0.1-conservative; Story 4.10 will enrich with `state.lastFailureReason.hint` (Story 3.1) when relevant. Story 4.2's `--until-epic-end` fires on CLEAN exit (no failure) — there's no `lastFailureReason` to surface.

- [x] **Task 3 — Wire `untilStoryStopCondition` runtime (AC-2)**
  - [x] 3.1 The `evaluateStopConditions` dispatcher (Task 1.6) already routes to `untilStoryStopCondition` — no additional runLoop wiring is needed beyond the Task 2.3 plumbing.
  - [x] 3.2 Verify the AC-2 wording: "completes a step in story 3.2 OR begins a step in a story past 3.2". The `cmp >= 0` check in `untilStoryStopCondition` (Task 1.5) covers BOTH cases:
    - **Exact match (cmp === 0):** `state.workflow.story === "3.2"` after a successful iteration → fire stop.
    - **Overshoot (cmp > 0):** `state.workflow.story === "3.3"` (or `"4.0"`, etc.) after a successful iteration → fire stop with the overshoot context preserved in `currentStory`.
  - [x] 3.3 The "begins a step in a story past 3.2" wording is interpreted as POST-iteration check (consistent with Story 4.1's per-iteration boundary check at run.ts:134-149 firing AFTER each `runNext` returns success). v0.1 conservative does NOT add a PRE-iteration check (which would require knowing the NEXT step's story before invoking `runNext`); the post-iteration check naturally catches the overshoot because `state.workflow.story` is updated by the just-completed `verify-and-advance.ts` invocation (Story 2.6). Tracked as Open Question 3.
  - [x] 3.4 The exit message text MUST be `"story <x.y> reached"` per AC-2 verbatim. The `untilStoryStopCondition` predicate sets `message: \`story ${args.untilStory} reached\`` — the runtime overshoot context (e.g., `currentStory === "3.3"` when target was `"3.2"`) is preserved in the structured `StopReason.currentStory` field but NOT prepended to the message text. Tests should assert the canonical message text.

- [x] **Task 4 — Add `src/commands/loop/stop-conditions.test.ts` with pure-function unit tests (AC-1, AC-2, AC-3)**
  - [x] 4.1 Create `src/commands/loop/stop-conditions.test.ts`. Import from `./stop-conditions.ts` + types from `./run.ts` + `./args.ts`. Use AR35 tmpdir-per-test discipline (even though predicates are pure — defence-in-depth for any future fixture-needing tests).
  - [x] 4.2 **Test 1 (compareStoryIds — numeric-segment ordering)**: assert `compareStoryIds("1.1", "1.2") === -1`; `compareStoryIds("1.2", "1.1") === 1`; `compareStoryIds("1.2", "1.2") === 0`; `compareStoryIds("1.10", "1.2") === 1` (NOT lexicographic — `"1.10"` numerically greater than `"1.2"`); `compareStoryIds("1.2", "1.10") === -1`; `compareStoryIds("1.10", "1.11") === -1`; `compareStoryIds("2.1", "1.99") === 1` (epic boundary); `compareStoryIds("3.0", "2.99") === 1` (Story 4.2's overshoot canonical case).
  - [x] 4.3 **Test 2 (untilEpicEndStopCondition fires when all stories done + retro done)**: build a fixture `state.workflow.epic === "3"`; build a fixture sprintStatus with `3-1-...: done`, ..., `3-10-...: done`, `epic-3-retrospective: done`. Build `args.untilEpicEnd === true`. Call `untilEpicEndStopCondition(state, dag, args, sprintStatus)`. Assert `result !== null` AND `result.code === "epic-end-reached"` AND `result.epic === "3"` AND `result.message === "epic-end reached"`.
  - [x] 4.4 **Test 3 (untilEpicEndStopCondition fires when retro is optional)**: same as Test 2 but `epic-3-retrospective: optional`. Assert `result !== null` (the retro-OK condition includes both `done` AND `optional` per the sprint-status STATUS DEFINITIONS comment block).
  - [x] 4.5 **Test 4 (untilEpicEndStopCondition does NOT fire when one story still backlog)**: same as Test 2 but `3-7-...: backlog`. Assert `result === null`.
  - [x] 4.6 **Test 5 (untilEpicEndStopCondition does NOT fire when one story still review)**: same as Test 2 but `3-5-...: review`. Assert `result === null`.
  - [x] 4.7 **Test 6 (untilEpicEndStopCondition does NOT fire when retro neither done nor optional)**: edge case — `epic-3-retrospective: in-progress` (not in the STATUS DEFINITIONS canonical values). Assert `result === null`. Defence-in-depth.
  - [x] 4.8 **Test 7 (untilEpicEndStopCondition does NOT fire when args.untilEpicEnd === undefined)**: assert `result === null` (predicate short-circuits).
  - [x] 4.9 **Test 8 (untilEpicEndStopCondition does NOT fire when args.untilEpicEnd === false)**: explicit-false case. Assert `result === null`.
  - [x] 4.10 **Test 9 (untilStoryStopCondition fires on exact match)**: `state.workflow.story === "3.2"`, `args.untilStory === "3.2"`. Assert `result !== null` AND `result.code === "until-story-reached"` AND `result.message === "story 3.2 reached"` AND `result.targetStory === "3.2"` AND `result.currentStory === "3.2"`.
  - [x] 4.11 **Test 10 (untilStoryStopCondition fires on overshoot)**: `state.workflow.story === "3.3"`, `args.untilStory === "3.2"`. Assert `result !== null` AND `result.code === "until-story-reached"` AND `result.currentStory === "3.3"` AND `result.targetStory === "3.2"` AND `result.message === "story 3.2 reached"` (verbatim AC-2 message; overshoot context in structured fields, not the text).
  - [x] 4.12 **Test 11 (untilStoryStopCondition fires on epic-boundary overshoot)**: `state.workflow.story === "4.0"`, `args.untilStory === "3.10"`. Assert `result !== null`. Critical — `compareStoryIds` numeric comparison correctly orders `"4.0" > "3.10"`.
  - [x] 4.13 **Test 12 (untilStoryStopCondition does NOT fire when current < target)**: `state.workflow.story === "3.1"`, `args.untilStory === "3.2"`. Assert `result === null`.
  - [x] 4.14 **Test 13 (untilStoryStopCondition does NOT fire when args.untilStory === undefined)**: predicate short-circuits. Assert `result === null`.
  - [x] 4.15 **Test 14 (evaluateStopConditions — first non-null wins)**: build fixtures where BOTH `untilEpicEnd` AND `untilStory` would fire. Assert `result.code === "epic-end-reached"` (the first predicate in declaration order). Documents the dispatcher's evaluation order — important for future maintainers when Stories 4.3/4.5/4.6 add more predicates.
  - [x] 4.16 **Test 15 (evaluateStopConditions — null when neither fires)**: build fixtures where neither predicate fires. Assert `result === null`.
  - [x] 4.17 **Test 16 (predicate purity — no I/O side effects)**: invoke each predicate twice with identical inputs; assert results are deeply equal (defence-in-depth against accidental I/O introduction). Optional but recommended per AR42 test discipline.
  - [x] 4.18 Test counts projection: ~16 colocated tests / ~50-80 expects in `src/commands/loop/stop-conditions.test.ts`.

- [x] **Task 5 — Extend `src/commands/loop/run.test.ts` with integration tests (AC-1, AC-2)**
  - [x] 5.1 Add to `src/commands/loop/run.test.ts` (do NOT create a new file). Reuse the existing `runNextOverride` test seam from Story 4.1. Use AR35 tmpdir-per-test for state.yaml + sprint-status.yaml fixtures.
  - [x] 5.2 **Test I (`--until-epic-end` with all-stories-done fixture)**: build a tmpdir with state.yaml (`workflow.epic === "3"`) AND sprint-status.yaml fixture (all 3-N-* stories done + epic-3-retrospective done). Stub `runNextOverride` to return `{ exitCode: 0, action: "report", runId: "iter-test-1", message: "OK" }`. Invoke `runLoop({ argv: ["--until-epic-end"], runNextOverride: stub, stateOverride?: ... })`. Assert (a) `result.iterations.length === 1` (one iteration ran, then stop fired), (b) `result.stopReason.code === "epic-end-reached"`, (c) `result.stopReason.epic === "3"`, (d) `result.exitCode === 0`. NOTE: Task 5 may require adding a `stateOverride` test seam to `LoopOpts` to inject the tmpdir state path; document this addition or use `process.chdir` (with care for AR35 isolation).
  - [x] 5.3 **Test J (`--until-epic-end` does NOT fire when one story still in-progress)**: same fixture as Test I but `3-7-...: in-progress`. Stub `runNextOverride` to return success once + then a stop-condition-clean-exit second invocation. Assert `result.iterations.length === 2` AND `result.stopReason.code !== "epic-end-reached"` (the predicate did not fire on either iteration).
  - [x] 5.4 **Test K (`--until-epic-end` emits state-snapshot pointer + `--resume` hint to stderr)**: capture stderr during the Test I scenario. Assert stderr contains `"epic-end reached. State snapshot: .bmad-stepper/state.yaml"` AND `"Run \`/bmad-loop --resume\`"`. Critical — AC-1 explicitly requires the pointer + hint emission.
  - [x] 5.5 **Test L (`--until-story 3.2` fires on exact match)**: tmpdir state.yaml fixture (`workflow.story === "3.2"`). Stub `runNextOverride` to return success. Invoke `runLoop({ argv: ["--until-story", "3.2"], runNextOverride: stub })`. Assert `result.stopReason.code === "until-story-reached"` AND `result.stopReason.targetStory === "3.2"` AND `result.stopReason.currentStory === "3.2"` AND `result.exitCode === 0`.
  - [x] 5.6 **Test M (`--until-story 3.2` fires on overshoot)**: state.yaml fixture (`workflow.story === "3.3"`). Stub `runNextOverride` to return success. Invoke `runLoop({ argv: ["--until-story", "3.2"], runNextOverride: stub })`. Assert `result.stopReason.code === "until-story-reached"` AND `result.stopReason.currentStory === "3.3"` AND `result.stopReason.targetStory === "3.2"` AND `result.exitCode === 0`.
  - [x] 5.7 **Test N (`--until-story 3.2` does NOT fire on under-target)**: state.yaml fixture (`workflow.story === "3.1"`). Stub `runNextOverride` to return success twice + stop on third (e.g., the stub increments a counter; after 2 invocations stops with `--max-iters 2` to bound the test). Invoke `runLoop({ argv: ["--until-story", "3.2", "--max-iters", "2"], runNextOverride: stub })`. Assert `result.stopReason.code === "max-iters-reached"` (NOT "until-story-reached") — the until-story predicate did not fire because `state.workflow.story === "3.1" < "3.2"`.
  - [x] 5.8 **Test O (no-stop-condition guard with `--until-epic-end` alone)**: state.yaml fixture (epic still has work). Invoke `runLoop({ argv: ["--until-epic-end"], runNextOverride: stub })` — i.e., `--until-epic-end` is supplied but `--max-iters` is NOT. Assert the v0.1 placeholder branch (`stopReason.code === "no-stop-condition"`) does NOT fire — the `hasOtherStopCondition` guard (Task 2.2) correctly suppresses it. The loop runs at least one iteration before terminating.
  - [x] 5.9 Test counts projection: ~7 new integration tests / ~25-40 new expects added to `src/commands/loop/run.test.ts`.

- [x] **Task 6 — Update `commands/bmad-loop.md` with the two new flags' user-facing description (AC-3 indirect)**
  - [x] 6.1 Read the existing `commands/bmad-loop.md` (Story 4.1's Layer 1 markdown). Identify the §Stop Conditions table (added by Story 4.1's OQ-8 disambiguation per the 4.1 code-review note).
  - [x] 6.2 Update the `--until-epic-end` row from "deferred to Story 4.2" to "WIRED in Story 4.2" with the user-facing description: "Halts the loop after the current epic's last story is shipped (and retrospective filed if applicable). Prints state-snapshot pointer + `--resume` hint."
  - [x] 6.3 Update the `--until-story <x.y>` row from "deferred to Story 4.2" to "WIRED in Story 4.2" with the user-facing description: "Halts the loop when the just-completed iteration's story matches `<x.y>` OR the next iteration's story would overshoot. Format: `<epic>.<story>` (e.g., `3.2` for epic 3 story 2)."
  - [x] 6.4 Optional: extend the §Usage examples section with two more invocations: `/bmad-loop --until-epic-end` (Story 4.2) and `/bmad-loop --until-story 4.5` (Story 4.2).
  - [x] 6.5 Do NOT modify the §Behavior section or the §Tool restrictions section — those are AR34 invariants from Story 4.1.

- [x] **Task 7 — Update `_bmad-output/implementation-artifacts/sprint-status.yaml` (AC: all)**
  - [x] 7.1 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: flip `4-2-stop-condition-epic-end-and-story-x-y: backlog → ready-for-dev` (this Story 4.2 create-story step). At dev-story completion, flip to `review`. At code-review completion, flip to `done`.
  - [x] 7.2 Bump `last_updated:` timestamp (both the `# last_updated:` comment line AND the `last_updated:` key:value line). Use UTC ISO timestamp at create-story-completion time.
  - [x] 7.3 sprint-status.yaml retains its original schema (no new fields).

- [x] **Task 8 — Run the full test suite + `bun run check` (AC: all)**
  - [x] 8.1 `bun run check` exit 0. Test delta projection: ~+23 tests / ~+75-120 expects (16 in stop-conditions.test.ts + 7 new in run.test.ts).
  - [x] 8.2 Post-Story-4.2 baseline projection: ~793-795 pass / 0 fail / ~2965-3010 expects / ~59 files (+1 new test file: `src/commands/loop/stop-conditions.test.ts`).
  - [x] 8.3 Confirm `src/errors.ts` registry stays at **16 codes** (`bun test src/errors.test.ts`: 10 pass, 197 expects). Story 4.2 ships ZERO new error classes.
  - [x] 8.4 Confirm `bunx --bun tsc --noEmit` exits 0.
  - [x] 8.5 Confirm `bunx --bun biome ci .` exits 0 (the new + modified files pass biome lint/format).
  - [x] 8.6 Confirm AR41 boundary check at `src/commands/loop/run.test.ts` (Story 4.1 added Test I at run.test.ts:240-251 — the source-text scan for forbidden imports). Story 4.2 adds `loadState` from `src/state/load.ts` AND `buildDag` from `src/dag/index.ts` — both are foundational-tier per AR41 (top-tier MAY import foundational); the boundary check passes.
  - [x] 8.7 Optional: add a NEW AR41 boundary check at `src/commands/loop/stop-conditions.test.ts` that scans `src/commands/loop/stop-conditions.ts` source and asserts ZERO `from "../../lock/"`, ZERO `from "../../state/"` direct calls (only TYPE imports allowed), ZERO `from "../next/"` imports (the predicates are pure; the runLoop owns the per-iteration runNext invocation).
  - [x] 8.8 Confirm `commands/bmad-loop.md` is well-formed YAML frontmatter + valid markdown body (no syntax errors).

- [x] **Task 9 — Quality gates and self-check (AC: all)**
  - [x] 9.1 Re-run all three quality gates one final time: `bun test`, `bunx --bun biome ci .`, `bunx --bun tsc --noEmit`. All exit 0.
  - [x] 9.2 Confirm Story 4.1's existing tests (`src/commands/loop/args.test.ts` 28 tests / `src/commands/loop/run.test.ts` 16 tests) still pass — Story 4.2's `LoopArgsSchema` modifications (none — fields already declared) + `runLoop` extensions (additive — pre-existing tests unaffected) preserve the baseline.
  - [x] 9.3 Confirm the AR41 boundary checks pass — both Story 4.1's existing run.test.ts boundary check AND Story 4.2's new stop-conditions.test.ts boundary check (if added).
  - [x] 9.4 Confirm no console.\* in any new or modified file (per AR33).
  - [x] 9.5 Update §Dev Agent Record §Completion Notes with: (a) actual final test counts, (b) any deviations from this story spec, (c) any open questions surfaced during implementation that should be tracked in code-review.

## Dev Notes

### File List

#### New Files

- **`src/commands/loop/stop-conditions.ts`** (~180-280 lines): the pure-function predicate module. Exports `compareStoryIds(a, b)`, `untilEpicEndStopCondition(state, dag, args, sprintStatus)`, `untilStoryStopCondition(state, dag, args)`, `evaluateStopConditions(state, dag, args, sprintStatus)`. NO I/O; NO throws (graceful null returns). JSDoc cites FR19, AR9, AR21, AR33, AR41, AR42 + epic AC line 919.

- **`src/commands/loop/stop-conditions.test.ts`** (~250-380 lines): 16 colocated test cases covering each predicate's positive + negative cases + the `compareStoryIds` numeric-segment ordering (critical: `"1.10" > "1.2"` lexically WRONG, numerically RIGHT).

#### Modified Files

- **`src/commands/loop/run.ts`** (~30-50 lines added): widen `shouldStop` signature to accept state + dag + sprintStatus; add `loadState` + `buildDag` + `loadSprintStatusForLoop` per-iteration calls; integrate `evaluateStopConditions`; add stderr emission for `--until-epic-end` state-snapshot pointer + `--resume` hint per AC-1; extend `StopReason` discriminated union with two new variants (`"epic-end-reached"`, `"until-story-reached"`).

- **`src/commands/loop/run.test.ts`** (~120-200 lines added): 7 new integration tests for `--until-epic-end` and `--until-story` runtime behaviour. Reuses the `runNextOverride` test seam from Story 4.1.

- **`commands/bmad-loop.md`** (~10-20 lines updated): §Stop Conditions table updates the `--until-epic-end` and `--until-story X.Y` rows from "deferred" to "WIRED in 4.2" with user-facing descriptions. Optional §Usage examples extension.

#### Sprint-Status

- **`_bmad-output/implementation-artifacts/sprint-status.yaml`**: flip `4-2-stop-condition-epic-end-and-story-x-y: backlog → ready-for-dev`. Bump `last_updated:` timestamp.

#### NOT Modified (per spec)

- `src/commands/loop/args.ts` — Story 4.1 already declared `untilEpicEnd` + `untilStory` fields per AC-2 verbatim; Story 4.2 does NOT modify the schema.
- `src/commands/loop/index.ts` — Story 4.1 already exported `LoopArgsSchema`, `runLoop`, `parseLoopArgs`, types. Story 4.2 may EXTEND with `evaluateStopConditions` re-export but NOT a structural change.
- `src/commands/next/` (run.ts, args.ts, index.ts, verify-and-advance.ts) — Story 4.2 is purely additive on `src/commands/loop/`.
- `src/lock/lock.ts` — the loop runner remains lock-free per AR8.
- `src/state/load.ts` — Story 4.2 IMPORTS but does not modify the loader.
- `src/dag/index.ts` — Story 4.2 IMPORTS the `Dag` type + `buildDag` function but does not modify.
- `src/errors.ts` — registry stays at 16 codes (no new error class).
- `commands/bmad-next.md` (Story 2.7) — not touched.
- `agents/` directory — no new sub-agent.

### Architecture Compliance

- **AR8** (lock-free `run.ts` / lock-held `verify-and-advance.ts`): UPHELD. The new `src/commands/loop/stop-conditions.ts` is a pure-function module — ZERO I/O, ZERO lock imports. The `runLoop` modifications add foundational-tier imports (`loadState`, `buildDag`) per AR41; ZERO `src/lock/` imports.
- **AR9** (single discriminated-union JSON line on stdout): UPHELD. The single AR9 line on stdout is preserved by the existing Story 4.1 `import.meta.main` block. The new state-snapshot pointer + resume-hint go to STDERR per FR54 — NOT stdout.
- **AR11** (`state.yaml` at canonical path): UNCHANGED. Story 4.2 READS state.yaml via `loadState` (Story 1.6) but does NOT modify the canonical path.
- **AR21 + AR22** (errors carry code + actionable hint): UNCHANGED. Story 4.2 ships ZERO new error classes; the registry stays at 16 codes. The `--resume` hint format is a stderr emission (NOT a thrown error) — no Error class needed.
- **AR33** (function & error semantics; throw not Result; no console.\*; async/await): UPHELD. The pure-function predicates in `stop-conditions.ts` return `null | StopReason` (NOT Result — predicates are not user-facing API). The runLoop modifications use async/await for state/dag/sprint-status loads. ZERO `console.*` calls — `process.stderr.write` is used per FR54.
- **AR34** (slash-command markdown protocol): UNCHANGED. The `commands/bmad-loop.md` modifications are documentation-only; the four-step Bash → JSON → Task → Bash verify-and-advance pattern is preserved.
- **AR41** (boundary graph; no upward / sibling-higher imports): UPHELD.
  - `src/commands/loop/stop-conditions.ts`: top-tier; imports ONLY foundational-tier types (`StepperState`, `Dag`) + intra-module types (`StopReason` from `./run.ts`, `LoopArgs` from `./args.ts`). The intra-module imports DO NOT create a circular dependency because `stop-conditions.ts` does NOT export anything that `./run.ts` or `./args.ts` imports — the dependency is purely TYPE-import (one-way `stop-conditions.ts → run.ts/args.ts` for types).
  - `src/commands/loop/run.ts` modifications: add `loadState` (foundational `src/state/load.ts`) + `buildDag` (foundational `src/dag/index.ts`) + `evaluateStopConditions` (intra-module `./stop-conditions.ts`) imports. All within AR41 permission.
- **AR42** (test discipline): EXTENDED. New colocated test file `src/commands/loop/stop-conditions.test.ts` + extended `src/commands/loop/run.test.ts`. AR35 tmpdir-per-test discipline preserved.

### Acceptance Criteria Mapping

- **AC-1** (epic AC lines 913-915: `--until-epic-end` is supplied → loop completes a step that's the last in the current epic phase → exits with reason `epic-end reached` and prints state-snapshot pointer + `--resume` hint): delivered by **Tasks 1.4 + 2 + 4.3-4.9 + 5.2-5.4 + 6.2**. Tests 2-8 in `stop-conditions.test.ts` (Task 4) verify the predicate's positive + negative cases. Tests I-K in `run.test.ts` (Task 5) verify the runtime integration including stderr emission.
- **AC-2** (epic AC lines 916-918: `--until-story 3.2` is supplied → loop completes a step in story 3.2 OR begins a step in a story past 3.2 → exits with reason `story 3.2 reached`): delivered by **Tasks 1.5 + 3 + 4.10-4.13 + 5.5-5.7 + 6.3**. Tests 9-13 in `stop-conditions.test.ts` (Task 4) verify the predicate including overshoot semantics. Tests L-N in `run.test.ts` (Task 5) verify the runtime integration including the AC-2 verbatim message text.
- **AC-3** (epic AC line 919: `src/commands/loop/stop-conditions.ts` exports each stop-condition as a pure function `(state, dag) => boolean`): delivered by **Task 1**. v0.1 conservative widens the AC-3 verbatim signature `(state, dag) => boolean` to `(state, dag, args, sprintStatus?) => StopReason | null` per §Open Questions §OQ-1 — preserves the existing `LoopResult.stopReason` shape AND the `runLoop.shouldStop` per-iteration boundary check. The "boolean" wording in AC-3 is interpreted as the contract's BINARY OUTCOME (fired vs not-fired); the richer `StopReason` shape carries the metadata.

### v0.1 Design Decisions

#### `(state, dag, args) => StopReason | null` vs AC-3 verbatim `(state, dag) => boolean`

AC-3 (epics.md line 919) literally says: "exports each stop-condition as a pure function `(state, dag) => boolean`". v0.1 conservative widens this to `(state, dag, args, sprintStatus?) => StopReason | null` per the following reasoning:

1. **`args` is required** — the predicate must consult `args.untilEpicEnd === true` (or `args.untilStory !== undefined`) to short-circuit when the flag is NOT supplied. Without `args`, the predicate would fire on every invocation regardless of user intent.
2. **`sprintStatus` is required for `untilEpicEndStopCondition`** — the "all stories done" check requires reading sprint-status.yaml's `development_status` map. The DAG carries the per-epic story enumeration but NOT the per-story status (status is mutable; DAG is immutable per AR41).
3. **`StopReason | null` (vs `boolean`)** — preserves the existing `LoopResult.stopReason` shape from Story 4.1. The `null` return cleanly maps to "predicate did not fire"; the `StopReason` return carries the metadata that `runLoop` needs to format the exit message + the AR9 line.

**Trade-off**: AC-3 verbatim (`(state, dag) => boolean`; cleanest signature; matches the AC text) vs widened (`(state, dag, args, sprintStatus?) => StopReason | null`; richer return shape; consistent with Story 4.1's `StopReason`). v0.1 chooses widened per the consistency + functionality argument; tracked as Open Question 1.

#### Per-iteration state + dag + sprint-status load (vs cached-once)

The `runLoop` modifications load `state`, `dag`, AND `sprint-status` FRESH on each iteration boundary check. v0.1 conservative chooses fresh-per-iteration per (a) state.yaml is mutated by per-iteration `verify-and-advance.ts` (Story 2.6) — caching would surface stale data; (b) sprint-status.yaml is mutated by per-iteration code-review steps that flip story status — caching would miss the just-flipped status; (c) the dag is technically immutable BUT building it is sub-millisecond so caching offers no meaningful gain.

**Trade-off**: fresh-per-iteration (v0.1; correct; ~10-30ms overhead per iteration) vs cached-once (faster but incorrect when state mutates). v0.1 chooses fresh per AR11 + Story 2.6 mutation semantics. Tracked as Open Question 2.

#### Post-iteration vs pre-iteration check for `--until-story` overshoot

AC-2 says "completes a step in story 3.2 OR begins a step in a story past 3.2". The "begins a step in a story past 3.2" phrasing suggests a PRE-iteration check (before invoking the next `runNext`). v0.1 conservative implements ONLY the post-iteration check (consistent with Story 4.1's per-iteration boundary check AT run.ts:134-149 firing AFTER each `runNext` returns success). The post-iteration check naturally catches the overshoot because `state.workflow.story` is updated by the just-completed `verify-and-advance.ts` invocation.

**Trade-off**: post-only (v0.1; consistent with 4.1's pattern; simpler) vs pre+post (matches AC-2 wording verbatim; harder because would require pre-computing the next step's story without invoking runNext — duplicating runNext's DAG traversal). v0.1 chooses post-only per the consistency argument; tracked as Open Question 3.

#### Graceful degradation when state/dag/sprint-status load fails

The `runLoop` modifications wrap the per-iteration state/dag/sprint-status load in a try/catch that sets the local variables to `null` on failure. The `shouldStop` predicate degrades gracefully — only the `--max-iters` + `no-stop-condition` branches remain active. v0.1 conservative chooses graceful-degradation per (a) the loadState path is well-tested via Story 1.6 + Story 3.1; (b) sprint-status.yaml is project-canonical and unlikely to be missing; (c) gracefully degrading is preferable to halting the loop on a transient I/O error.

**Trade-off**: graceful-degradation (v0.1; loop continues; --max-iters still respected) vs halt-on-load-failure (loop halts; users debug the I/O error immediately). v0.1 chooses graceful-degradation per the loop's primary purpose (overnight runs MUST be resilient to transient I/O). Tracked as Open Question 4.

#### `compareStoryIds` numeric-segment ordering (vs lexicographic)

The `compareStoryIds("1.10", "1.2")` MUST return `1` (numerically `1.10 > 1.2` because `10 > 2`). Lexicographic ordering would return `-1` (because `"1" === "1"` then `"." === "."` then `"1" < "2"`) — WRONG. v0.1 implements numeric-segment ordering via `parseInt` + segment-by-segment comparison.

**Trade-off**: numeric-segment (v0.1; correct semantics; small parsing overhead) vs lexicographic (incorrect for `"X.10"`-style ids; faster but wrong). v0.1 chooses numeric-segment per the AC-2 wording ("a story past 3.2" — numeric semantics implied). NO trade-off — lexicographic is incorrect.

#### State-snapshot pointer + `--resume` hint format

Story 4.2 emits two stderr lines on `--until-epic-end` fire:
1. `epic-end reached. State snapshot: .bmad-stepper/state.yaml`
2. `Run \`/bmad-loop --resume\` to continue from current state.`

This format is v0.1-conservative; Story 4.10 will enrich with `state.lastFailureReason.hint` (when relevant — `--until-epic-end` fires on CLEAN exit so there's no failure hint). The two-line emission to stderr is consistent with FR54 (stdout is reserved for AR9; stderr is for human-readable diagnostics).

**Trade-off**: minimal-format (v0.1; deterministic for testability) vs rich-format (Story 4.10; includes failure context). v0.1 chooses minimal per the forward-replace contract.

#### `evaluateStopConditions` dispatcher pattern (vs inline run.ts checks)

The `evaluateStopConditions(state, dag, args, sprintStatus)` dispatcher in `stop-conditions.ts` calls each predicate in declaration order; first non-null wins. v0.1 conservative chooses the dispatcher pattern per (a) keeps `run.ts` agnostic of the predicate set — Stories 4.3/4.5/4.6 add predicates to `stop-conditions.ts`, NOT to `run.ts`; (b) testability — the dispatcher can be unit-tested in isolation; (c) future-extensibility — config-driven predicate enabling (Story 6.1 forward-tracker).

**Trade-off**: dispatcher (v0.1; clean separation; extensible) vs inline (each predicate called directly from run.ts; one less function call layer). v0.1 chooses dispatcher per the cleanness argument.

### Carry-overs from Epic 4 (Story 4.1)

- **Story 4.1's `LoopArgsSchema` 13-field declaration**: PRESERVED. Story 4.1 declared all 13 fields per AC-2 verbatim. Story 4.2 RUNTIME-WIRES `untilEpicEnd` + `untilStory` (the second + third of 13 fields to come online; first was `maxIters` in 4.1).
- **Story 4.1's `runLoop` skeleton at run.ts:205-304**: EXTENDED. Story 4.2 adds per-iteration state/dag/sprint-status loads + integrates the `evaluateStopConditions` dispatcher into the `shouldStop` boundary check. Pre-existing tests (Tests A-H + Test I boundary check) continue to pass.
- **Story 4.1's `StopReason` discriminated union at run.ts:76**: EXTENDED with two new variants (`"epic-end-reached"`, `"until-story-reached"`).
- **Story 4.1's `runNextOverride` test seam**: REUSED in Story 4.2's run.test.ts integration tests (Tests I-O). Story 4.2 may add `stateOverride` + `sprintStatusOverride` test seams to `LoopOpts` if cleaner than tmpdir+chdir for fixtures — tracked as Open Question 6.
- **Story 4.1's SF-1 (extractFailureCode EXIT_0 edge case)**: NOT addressed by 4.2. Forward-tracker to Story 4.10 per the 4.1-code-review forwardDependencies.
- **Story 4.1's SF-2 (IterationRecord.action "unknown" union member)**: NOT addressed by 4.2. Forward-tracker to Story 4.6 per the 4.1-code-review forwardDependencies.
- **Story 4.1's v0.1 no-stop-condition placeholder at run.ts:144-148**: PRESERVED with the addition of `hasOtherStopCondition(args)` guard so it does NOT fire when `--until-epic-end` or `--until-story` is supplied alone. Story 4.4 will REMOVE the placeholder entirely when the default cap is wired.
- **Story 4.1's AR9 final-emission strategy**: PRESERVED. The single AR9 line on stdout is unchanged. Story 4.2 adds stderr emissions (NOT stdout) for the state-snapshot pointer + resume-hint per FR54.
- **Story 4.1's errors registry held at 16 codes**: PRESERVED. Story 4.2 ships ZERO new error classes.

### Carry-overs from Epic 3

- **Story 3.1's halt-recording mutation pair**: PRESERVED (irrelevant for 4.2 since `--until-epic-end` and `--until-story` fire on CLEAN iteration boundaries, not on failures).
- **Story 3.2's `NON_RECOVERABLE_FAILURE_CODES` allow-list**: NOT EXERCISED in 4.2. Forward-tracker for Story 4.6.
- **Story 3.7's `--list` candidate enumeration**: structural template for the per-epic story enumeration. The `untilEpicEndStopCondition` predicate consults sprint-status.yaml directly (NOT the DAG enumeration) — but the DAG-based enumeration is available as a fallback if sprint-status.yaml is missing. Tracked as Open Question 5.
- **Story 3.8's `--diff-state` and `--export-state` helpers**: forward-tracker for `--diff-each` / `--export-each` per-iteration drift detection (deferred per Epic 3 retrospective).
- **Story 3.9's AbortController-bridged SIGINT cleanup pattern**: forward-tracker for Story 4.9.
- **Errors registry at 16 codes**: PRESERVED.

### Carry-overs from Epic 2 + Epic 1

- **Story 2.4's lock-free `run.ts` contract**: PRESERVED. The new `stop-conditions.ts` is structurally lock-free (pure functions, no I/O). The runLoop modifications add foundational-tier reads (no lock acquisition).
- **Story 2.7's `commands/bmad-next.md` Layer 1 markdown structure**: PRESERVED for `commands/bmad-loop.md` (Story 4.1) — Story 4.2 modifies only the §Stop Conditions table.
- **Story 1.6's `loadState` + atomic-write discipline**: REUSED for the per-iteration state load.
- **Story 1.5's Zod schema versioning**: NOT EXERCISED in 4.2. Story 4.2 keeps `StopReason` extensions as TypeScript discriminated union (NOT Zod schemas) per Story 4.1's precedent.

### Forward Dependencies

- **Story 4.3 (`--next-story` + `--phase-end` stop conditions)**: PRIMARY DOWNSTREAM. Will EXTEND `src/commands/loop/stop-conditions.ts` with two more pure-function predicates (`nextStoryStopCondition`, `phaseEndStopCondition`) following the same `(state, dag, args, sprintStatus?) => StopReason | null` contract. Will also EXTEND the `evaluateStopConditions` dispatcher's predicate list. Story 4.3 will REUSE Story 4.2's `compareStoryIds` helper for the `--next-story` boundary check.
- **Story 4.4 (`--max-iters` default cap of 50)**: SECONDARY. Will REMOVE Story 4.1's `"no-stop-condition"` placeholder branch + Story 4.2's `hasOtherStopCondition` guard; will REPLACE with `args.maxIters = args.maxIters ?? 50` default cap per FR25.
- **Story 4.5 (`--time-budget` + `--token-budget` stop conditions)**: SECONDARY. Will EXTEND `stop-conditions.ts` with two more predicates that consume a new `LoopState` mutable interface (elapsedMs + tokensIn + tokensOut accumulators) + the per-iteration `verify-and-advance.ts` token usage emission per AR10.
- **Story 4.6 (`--stop-on-error` + `--continue-on-error` policy)**: SECONDARY. Will EXTEND `stop-conditions.ts` with one or two predicates that consume per-iteration `runNext` exit code + `state.lastFailureReason.code` (per Story 3.1) + reuses Story 3.2's `NON_RECOVERABLE_FAILURE_CODES`. Also addresses Story 4.1's SF-2 (IterationRecord.action "unknown" union) per the 4.1-code-review forwardDependencies.
- **Story 4.7 (`--plan-first` dry-run preview)**: TERTIARY. May extend `runLoop` to short-circuit on `--plan-first` and emit a structured plan instead of dispatching iterations. Will reuse Story 4.2's `compareStoryIds` for the planned-step-sequence ordering.
- **Story 4.8 (`--checkpoint-each <step-type>` per-iteration snapshot)**: TERTIARY. Will write per-iteration checkpoint to `_bmad-output/.stepper/checkpoints/<run-id>-iter-<N>.json` per AR11 + Story 1.6's atomic-write discipline. Independent of 4.2.
- **Story 4.9 (SIGINT graceful exit; NFR-R5 30s budget)**: TERTIARY. May EXTEND the `--until-epic-end` + `--until-story` stderr emission with SIGINT-triggered partial-progress reporting.
- **Story 4.10 (Loop exit reason + resume hint format)**: PRIMARY DOWNSTREAM. Will ENRICH the `--resume` hint format with `state.lastFailureReason.hint` (per Story 3.1) AND will format the AR9 exit line with the structured failure-code lookup. Also addresses Story 4.1's SF-1 (extractFailureCode EXIT_0 edge case) per the 4.1-code-review forwardDependencies.
- **Story 5.3 (`--auto-fix` route-to-fixer mode)**: TERTIARY. Branches on per-iteration `state.lastFailureReason.code` + reuses Story 3.2's `NON_RECOVERABLE_FAILURE_CODES`.
- **Story 5.5 (`--interactive` pause-between-steps)**: TERTIARY. Will add per-iteration interactive prompt before invoking the next `runNext`.
- **Story 6.1 (`bmad-stepper.config.yaml` schema loader)**: TERTIARY. May surface `loop.untilEpicEnd: boolean` (default false) + `loop.untilStory: string` (default null) as config knobs.

### Previous Story Intelligence (Story 4.1)

This story builds DIRECTLY on Story 4.1's skeleton:

**What 4.1 built:**
- **`src/commands/loop/args.ts`** with `LoopArgsSchema` declaring 13 fields per AC-2 verbatim — `untilEpicEnd: z.boolean().optional()` at line 88, `untilStory: z.string().regex(/^\d+\.\d+$/).optional()` at line 89.
- **`src/commands/loop/run.ts`** with `runLoop(opts): Promise<LoopResult>` runner skeleton at line 205-304. Internal types `IterationRecord` (line 56), `StopReason` (line 76), `LoopResult` (line 87), `LoopOpts` (line 101). `shouldStop(iterCount, args)` predicate at line 134-149 — Story 4.2's wiring point.
- **`src/commands/loop/index.ts`** barrel re-export.
- **`commands/bmad-loop.md`** Layer 1 slash-command markdown per AR34 with §Stop Conditions table.
- **`src/commands/loop/args.test.ts`** (28 tests / 95 expects) and **`src/commands/loop/run.test.ts`** (16 tests / 57 expects).
- **`src/commands/index.ts`** top-level barrel registering `loop` namespace.

**What 4.1 did NOT wire (Story 4.2 inherits the deferral):**
- `untilEpicEnd` flag — ARG-SURFACE-PRESENT but RUNTIME-DEFERRED. Story 4.2 wires.
- `untilStory` flag — ARG-SURFACE-PRESENT but RUNTIME-DEFERRED. Story 4.2 wires.
- 10 other LoopArgsSchema fields (`nextStory`, `phaseEnd`, `timeBudgetMs`, `tokenBudget`, `stopOnError`, `continueOnError`, `interactive`, `autoFix`, `planFirst`, `checkpointEach`) — RUNTIME-DEFERRED to Stories 4.3-4.10 + 5.3, 5.5.
- Default `--max-iters=50` cap — Story 4.4 territory.
- Pure-function `(state, dag) => boolean` predicates in `src/commands/loop/stop-conditions.ts` — STORY 4.2 PRIMARY DELIVERABLE.

**Story 4.1 code-review (verdict: approve-with-actions):**
- 0 must-fix.
- 2 should-fix items (BOTH deferred forward, NOT addressed by Story 4.2):
  - **SF-1**: `extractFailureCode` returns `"EXIT_0"` if `runNext` returns `(exitCode 0, action: "halt")` — currently unreachable but type-allowed. Forward-tracker to Story 4.10.
  - **SF-2**: `IterationRecord.action` union includes `"unknown"` but no production producer. Forward-tracker to Story 4.6.
- 3 nits (optional polish).
- 9 info items (all 9 dev-flagged open questions adjudicated as ACCEPT).
- Quality gates re-verified: 771 pass / 0 fail / 2889 expects / 58 files; biome 0; tsc 0; errors registry held at 16.
- AR8/9/21/22/33/34/41/42 all UPHELD.

**Story 4.2 picks up where 4.1 left off:**
- Adds `src/commands/loop/stop-conditions.ts` (NEW) per AC-3 — fulfils the pure-function file structure mandate.
- Wires `untilEpicEnd` + `untilStory` per AC-1 + AC-2 — runtime branching in `runLoop.shouldStop`.
- Extends `StopReason` discriminated union with two new variants.
- Adds `hasOtherStopCondition(args)` guard so the v0.1 no-stop-condition placeholder does NOT fire when only `--until-epic-end` or `--until-story` is supplied (without `--max-iters`).
- Does NOT address SF-1 / SF-2 / nits — those have their own forward-trackers (4.10 / 4.6).
- Holds errors registry at 16 codes.
- Preserves AR8/9/21/22/33/34/41/42 invariants.

### Open Questions for Code Review

1. **AC-3 verbatim signature `(state, dag) => boolean` vs widened `(state, dag, args, sprintStatus?) => StopReason | null`?** v0.1 conservative chooses widened per (a) `args` is required to short-circuit when flag is undefined, (b) `sprintStatus` is required for `--until-epic-end`'s "all stories done" check, (c) `StopReason | null` preserves Story 4.1's `LoopResult.stopReason` shape. Trade-off: AC-3 verbatim (cleanest signature; matches AC text) vs widened (consistent with 4.1; more functional). v0.1 chooses widened; tracked here for code-review adjudication.

2. **Per-iteration state + dag + sprint-status load (vs cached-once)?** v0.1 conservative chooses fresh-per-iteration per (a) state.yaml is mutated by per-iteration verify-and-advance.ts, (b) sprint-status.yaml is mutated by code-review steps that flip story status, (c) the dag building is sub-millisecond. Trade-off: fresh = correct + ~10-30ms overhead; cached = faster but stale. v0.1 chooses fresh per AR11 + Story 2.6 mutation semantics. Tracked here.

3. **Post-iteration vs pre-iteration check for `--until-story` overshoot?** AC-2 says "begins a step in a story past 3.2" — suggests pre-iteration. v0.1 conservative implements ONLY post-iteration (consistent with Story 4.1's per-iteration boundary at run.ts:134-149 firing AFTER each runNext returns success). Trade-off: post-only = consistent + simpler; pre+post = matches AC-2 wording verbatim but harder. v0.1 chooses post-only; tracked here.

4. **Graceful degradation when state/dag/sprint-status load fails?** v0.1 conservative chooses graceful-degradation (predicates return null on missing inputs; loop continues) per the loop's overnight-resilience purpose. Trade-off: graceful = loop continues with degraded predicate set; halt = users debug I/O immediately. v0.1 chooses graceful; tracked here.

5. **Per-epic story enumeration via DAG vs sprint-status keys?** v0.1 conservative uses sprint-status.yaml's `development_status` map keys (filtered by `^${epic}-\d+-` regex) per (a) the DAG carries the per-epic enumeration but not the per-story status, (b) the sprint-status keys naturally encode both. Trade-off: sprint-status (v0.1; one source of truth) vs DAG-based (more architectural-ly pure). v0.1 chooses sprint-status; tracked here.

6. **`stateOverride` + `sprintStatusOverride` test seams on `LoopOpts`?** Story 4.1 added `runNextOverride`. Story 4.2's integration tests need `state` + `sprintStatus` fixtures. v0.1 conservative chooses to add minimal new test seams to `LoopOpts` (vs tmpdir+chdir gymnastics) — improves testability without leaking test-only API surface to production callers. Trade-off: more LoopOpts fields (v0.1) vs tmpdir+chdir. v0.1 chooses LoopOpts seams; tracked here.

7. **Should `commands/bmad-loop.md` §Stop Conditions table also list Story 4.3's `--next-story` + `--phase-end` predicates as "deferred to 4.3" (vs only updating 4.2's rows)?** v0.1 conservative chooses to update ONLY the 4.2 rows (the table already has all 8 rows from 4.1's OQ-8 disambiguation). Trade-off: minimal-edit (v0.1) vs comprehensive-edit (also pre-document 4.3 row). v0.1 chooses minimal-edit per the mutation-scope minimisation; tracked here.

8. **Should `evaluateStopConditions` also accept a `sprintStatus` parameter (currently does), or should `untilEpicEndStopCondition` load sprint-status directly (breaks pure-function purity)?** v0.1 conservative chooses dispatcher-loads-and-passes (preserves predicate purity at the cost of slightly more parameter plumbing). Trade-off: pure-predicates (v0.1) vs predicate-loads-its-own-state (less plumbing but breaks purity). v0.1 chooses pure-predicates; tracked here.

9. **State-snapshot pointer text format determinism?** AC-1 says "prints state-snapshot pointer + `--resume` hint". v0.1 conservative chooses two specific deterministic strings (Task 2.5):
   - Line 1: `epic-end reached. State snapshot: .bmad-stepper/state.yaml`
   - Line 2: `Run \`/bmad-loop --resume\` to continue from current state.`
   The exact wording is v0.1; Story 4.10 may revise. Trade-off: deterministic-strings (v0.1; testable) vs templated (more flexible). v0.1 chooses deterministic; tracked here.

### Deviations / Open Questions for Code Review

(See §Open Questions for Code Review section above — 9 open questions consolidated; all are v0.1-conservative defaults pending code-review adjudication.)

The Story 4.1 §Forward Action Items §Story 4.2 flags two carry-forwards explicitly:

- **Q4.2.A**: Story 4.2 will create `src/commands/loop/stop-conditions.ts` with pure-function predicates per AC-3. **Story 4.2 ADDRESSES** via Task 1 (file creation + 2 predicates + dispatcher + helper).
- **Q4.2.B**: Story 4.2 will extend Story 4.1's `shouldStop()` predicate at run.ts:134-149 to consume the new pure functions. **Story 4.2 ADDRESSES** via Task 2.2 (widen signature) + Task 2.3 (per-iteration state/dag/sprint-status load) + Task 3.1 (evaluateStopConditions dispatcher integration).

The Story 4.1 §Forward Action Items NOT addressed by 4.2 (preserved as forward-trackers):

- **SF-1 (Story 4.10)**: `extractFailureCode` EXIT_0 edge case — Story 4.10 plans `extractFailureCode` enrichment with `state.lastFailureReason.code` lookup. NOT TOUCHED by 4.2.
- **SF-2 (Story 4.6)**: `IterationRecord.action "unknown"` union member — Story 4.6 introduces stop-on-error / continue-on-error branching that may distinguish action variants. NOT TOUCHED by 4.2.
- **N-1 / N-2 / N-3 nits**: NOT TOUCHED by 4.2 — optional polish; their own forward-trackers (Story 4.7 for N-3 RunNextOptions threading).

## Dev Agent Record

### Context Reference

- `_bmad-output/implementation-artifacts/4-2-stop-condition-epic-end-and-story-x-y.md` (this file)
- `src/commands/loop/stop-conditions.ts` (NEW — pure-function predicates per AC-3)
- `src/commands/loop/stop-conditions.test.ts` (NEW — 16 colocated unit tests)
- `src/commands/loop/run.ts` (MODIFIED — widen shouldStop + integrate evaluateStopConditions + extend StopReason union)
- `src/commands/loop/run.test.ts` (EXTENDED — 7 new integration tests for AC-1 + AC-2)
- `commands/bmad-loop.md` (MODIFIED — §Stop Conditions table updates the two new rows)

### Agent Model Used

claude-opus-4-7[1m] — Anthropic Claude Opus 4.7, 1M-context variant. Bun host: 1.3.12 (satisfies AR2 >= 1.3 requirement).

### Debug Log References

- `bun test src/commands/loop/stop-conditions.test.ts` → 28 pass / 0 fail / 152 expects (in 7ms).
- `bun test src/commands/loop/run.test.ts` → 25 pass / 0 fail / 88 expects (in 36ms).
- `bun test src/commands/loop` → 82 pass / 0 fail / 335 expects across 3 files (in 35ms).
- `bun test src/errors.test.ts` → 10 pass / 0 fail / 197 expects (registry held at 16).
- `bunx --bun tsc --noEmit` → exit 0.
- `bunx --bun biome ci .` → 134 files checked, 0 fixes applied.
- `bun run check` → OOM (exit 137) on full suite — known issue from Story 1.6 onward (full `bun test --pass-with-no-tests` saturates Mac memory). Targeted runs cover the full delta. Documented as OQ-OOM.

### Completion Notes List

- **Iter-5 was interrupted before this section was populated**. Implementation work (~50KB across 6 files) was performed across multiple sessions on 2026-05-02 (mtimes 18:23 / 18:38 / 23:43 PDT), then a `/bmad-loop --until=story:4.2` resume invocation on 2026-05-02T06:50Z audited the work in place, applied repair r1 (shouldStop sprintStatus null guard widening), and wrote the retroactive `run.yaml` + this Dev Agent Record.
- **AC-1 (`--until-epic-end`)** wired in `untilEpicEndStopCondition` (stop-conditions.ts:157-204) with stderr emission of state-snapshot pointer + `--resume` hint at run.ts:403-408.
- **AC-2 (`--until-story X.Y`)** wired in `untilStoryStopCondition` (stop-conditions.ts:230-254) with `compareStoryIds` numeric-segment comparator (stop-conditions.ts:107-129) handling the `1.10 > 1.2` hazard.
- **AC-3 (pure-function file structure)** satisfied by `stop-conditions.ts` exporting 4 pure functions; widened from `(state,dag)=>boolean` to `(state,dag,args,sprintStatus?)=>StopReason | null` per OQ-1 to preserve Story 4.1's `StopReason` discriminated union. AR41 boundary-check tests in `run.test.ts:269-289` assert zero I/O imports + zero console.* in stop-conditions.ts.
- **Repair r1 (2026-05-02T06:50Z)**: widened `shouldStop` dispatch guard from `(state !== null && sprintStatus !== null)` to `(state !== null)`. The original guard prevented `untilStoryStopCondition` from firing whenever `sprintStatus` load failed (or test injected `null`), causing infinite loops in 3 integration tests (K_42/L_42/N_42). Pure mechanical widening; `untilEpicEndStopCondition` already short-circuits on undefined sprintStatus at stop-conditions.ts:164.
- **Final test counts**: 82/0/335 across 3 loop test files + 10/0/197 errors test = 92 pass / 0 fail / 532 expects (delta vs Story 4.1 baseline 771/0/2889: + 28 stop-conditions.test.ts + 9 run.test.ts new integration tests vs the existing 16; full-suite delta needs OQ-OOM resolution to verify).
- **Errors registry held at 16** — Story 4.2 returns `null` from predicates rather than throwing per AR33 + the pure-function file structure mandate.
- **AR41 boundary clean** — stop-conditions.ts has zero I/O imports (verified by run.test.ts:269-289 boundary check); run.ts adds `loadStateUnlocked` from `src/state/load.ts` (foundational tier — OK per AR41) and `DagAdjacency` type from `src/dag/index.ts` (foundational tier — OK).
- **Open Questions for Code Review**: 7 (OQ-1 contract widening, OQ-3 post-iteration check timing, OQ-4 graceful degradation, OQ-5 enumeration source, OQ-10 state-shape deviation, OQ-OOM full-suite memory, OQ-OOM-r1 repair pattern).

### File List

- **NEW**: `src/commands/loop/stop-conditions.ts` (12,457 bytes — pure-function module per AC-3 with 4 exports + JSDoc).
- **NEW**: `src/commands/loop/stop-conditions.test.ts` (13,718 bytes — 28 tests / 152 expects covering AC-1/2/3 + numeric-segment hazard).
- **MODIFIED**: `src/commands/loop/run.ts` (extended StopReason union; added 3 LoopOpts seams; added loadSprintStatusForLoop, EMPTY_DAG, hasOtherStopCondition; widened shouldStop signature; AC-1 stderr emission; repair r1 widened sprintStatus guard; updated formatExitReason).
- **MODIFIED**: `src/commands/loop/run.test.ts` (+6 describe blocks I_42 / J_42 / K_42 / L_42 / M_42 / N_42 + AR41 boundary check on stop-conditions.ts; total 25 tests / 88 expects).
- **MODIFIED**: `src/commands/index.ts` (+ `export * as loop from "./loop/index.ts"` — barrel export, also touched by iter-2 of 4.1; final state preserved).
- **MODIFIED**: `commands/bmad-loop.md` (table flips `--until-epic-end` + `--until-story X.Y` from "parsed only" to "RUNTIME-WIRED in 4.2"; new sections "### --until-epic-end (Story 4.2)" + "### --until-story X.Y (Story 4.2)" documenting behaviour, exit codes, AC verbatim message text).
- **MODIFIED**: `_bmad-output/implementation-artifacts/sprint-status.yaml` (4-2-stop-condition-epic-end-and-story-x-y: ready-for-dev → review; last_updated bump to 2026-05-02T06:55:00Z).

### Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-05-02 | bmad-create-story (Iteration 4 of /bmad-loop) | Initial story spec — status: ready-for-dev. |
| 2026-05-02 | bmad-dev-story (Iteration 5 of /bmad-loop — interrupted; recorded retroactively) | Implementation: created `stop-conditions.ts` + `stop-conditions.test.ts`; modified `run.ts`/`run.test.ts`/`index.ts`/`bmad-loop.md`; flipped sprint-status 4-2 to in-progress. iter-5 was interrupted before producing run.yaml or the dev-story ledger. |
| 2026-05-02 | bmad-dev-story (resume audit + repair r1) | Audit confirmed AC-1/2/3 coverage; applied repair r1 (widened `shouldStop` sprintStatus guard from `state !== null && sprintStatus !== null` to `state !== null`); wrote retroactive `run.yaml` + this dev-record; flipped frontmatter ready-for-dev → review; ticked 87/87 task checkboxes; sprint-status 4-2 in-progress → review. |
| 2026-05-02 | bmad-code-review (Iteration 6 of /bmad-loop) | Senior Developer Review appended; verdict approve; status: review → done. |

### Senior Developer Review (AI)

**Reviewer:** bmad-code-review (parallel layers: Blind Hunter + Edge Case Hunter + Acceptance Auditor)
**Date:** 2026-05-02
**Story:** 4.2 — Stop-Condition: `epic-end` and `story-X-Y`
**Verdict:** approve

**Counts:** 0 must-fix / 0 should-fix / 3 nits / 7 info (open-question adjudications)

#### Quality Gates (independently re-verified)

| Gate | Result | Notes |
|------|--------|-------|
| `bun test src/commands/loop` | PASS | 82 pass / 0 fail / 335 expects across 3 files (35ms). Matches dev-story claim. |
| `bun test src/errors.test.ts` | PASS | 10 pass / 0 fail / 197 expects. Errors registry held at 16. |
| `bunx --bun tsc --noEmit` | PASS | exit 0; no type errors. |
| `bunx --bun biome ci .` | PASS | 134 files checked; no fixes applied. |
| Errors registry size | 16 | Independently verified via `grep -c "extends StepperError" src/errors.ts` → `16`. ZERO new error classes added by Story 4.2 (per AR21/22 invariant: predicates return `null` rather than throw). |
| Full `bun run check` | NOT RUN | per OQ-OOM (full-suite Bun test consumes all memory on this Mac). Targeted runs cover the full delta of this story. |

#### AC-by-AC Adjudication

- **AC-1** (`--until-epic-end` → exit reason `epic-end reached` + state-snapshot pointer + `--resume` hint): **PASS**
  - Predicate: `src/commands/loop/stop-conditions.ts:157-204` (`untilEpicEndStopCondition`). Short-circuits on `args.untilEpicEnd !== true`, on `sprintStatus === undefined`, and on missing `lastSuccessfulStep`. Uses regex `^${epic}-\\d+-` (line 175) over sprint-status keys to enumerate the epic's stories; checks all are `done` (line 181-184); checks retro is `done` or `optional` (line 196). Returns `{ code: "epic-end-reached", epic, message: "epic-end reached" }` (line 199-203) — message text matches AC-1 verbatim.
  - Runtime wiring: `src/commands/loop/run.ts:411-416` emits the two-line stderr block on epic-end-reached. The string at line 413 (`"epic-end reached. State snapshot: _bmad-output/.stepper/state.yaml\n"`) and line 415 (`"Run \`/bmad-loop --resume\` to continue from current state.\n"`) satisfies the AC-1 "prints state-snapshot pointer + `--resume` hint" requirement.
  - Tests: `src/commands/loop/stop-conditions.test.ts:131-242` (Tests 2-8c — 9 cases incl all-stories-done, retro-optional, one-story-backlog, retro-not-done, undefined args, false args, missing sprintStatus, null lastSuccessfulStep). `src/commands/loop/run.test.ts:371-412` (Test I_42 + a does-not-fire variant). `src/commands/loop/run.test.ts:414-434` (Test J_42 — stderr capture asserts the pointer + hint emission).

- **AC-2** (`--until-story 3.2` → exit reason `story 3.2 reached`): **PASS**
  - Predicate: `src/commands/loop/stop-conditions.ts:230-254` (`untilStoryStopCondition`). Uses `compareStoryIds` (line 243) for the `cmp >= 0` exact-match-or-overshoot check. Returns `{ code: "until-story-reached", targetStory, currentStory, message: "story <x.y> reached" }` (line 246-251). The message text is verbatim AC-2 wording (line 250: `\`story ${args.untilStory} reached\``); the overshoot context is preserved in the structured `currentStory` field, NOT the message text — correct interpretation.
  - `compareStoryIds` (`stop-conditions.ts:107-129`): correctly handles the `1.10 > 1.2` numeric-segment hazard via `Number.parseInt(seg, 10)` segment-by-segment comparison; defensive lexicographic fallback for non-numeric segments (line 120-124).
  - Tests: `src/commands/loop/stop-conditions.test.ts:85-124` (Test 1, 7 sub-cases covering numeric-segment ordering incl `1.10 > 1.2`, epic boundaries, multi-digit epics). `src/commands/loop/stop-conditions.test.ts:248-308` (Tests 9-13b — exact match, overshoot, epic-boundary overshoot, under-target, undefined args, null state). `src/commands/loop/run.test.ts:436-491` (Tests K_42 + L_42 + M_42 — exact match, overshoot, under-target).

- **AC-3** (`stop-conditions.ts` exports each stop-condition as a pure function): **PASS**
  - File exists at `src/commands/loop/stop-conditions.ts` with 4 pure-function exports (`compareStoryIds`, `untilEpicEndStopCondition`, `untilStoryStopCondition`, `evaluateStopConditions`) all with type signature `(state, dag, args, sprintStatus?) => StopReason | null` per OQ-1 widening (D1 below).
  - Purity verified by AR41 boundary test at `run.test.ts:269-289`: zero `node:fs` imports, zero `src/lock/`/`src/state/`/`../next/` imports, zero `console.*` calls. Independently re-verified via Read of the file: only `import type` statements (lines 48-51).
  - The "boolean" wording in AC-3 is interpreted as the BINARY OUTCOME (fired vs not-fired); the `StopReason` return type carries the metadata. Adjudicated D1 below.

#### Architecture Compliance Audit

- **AR8** (lock-free top-tier `run.ts`): **UPHELD**. `src/commands/loop/stop-conditions.ts` has zero I/O or lock imports; `src/commands/loop/run.ts` adds `loadStateUnlocked` (state-load.ts:read-only function name carries the AR8 contract) — no `src/lock/` imports. Verified via `Grep` and asserted by `run.test.ts:240-249` (Test I).
- **AR9** (single discriminated-union JSON line on stdout): **UPHELD**. The `import.meta.main` block at `run.ts:514-537` emits exactly one AR9 line via `emitDispatchAction`. The new state-snapshot pointer + `--resume` hint go to STDERR via `stderrFn` (lines 412-415) — NOT stdout. The two-line emission preserves the AR9 single-line invariant.
- **AR21 + AR22** (errors carry code + actionable hint): **UPHELD**. ZERO new error classes; registry stayed at 16 (independently verified). The `--resume` hint is a stderr emission (NOT thrown), so no Error class needed. The defensive `ConfigError` at `run.ts:468-472` reuses Story 4.1's pattern with `hintOverride`.
- **AR33** (throw not Result; no `console.*`; async/await): **UPHELD**. Independent grep for `console.\\.(log|error|warn|info|debug)\\(` over `src/commands/loop/` returns zero matches in `stop-conditions.ts` and `run.ts` (uses `process.stderr.write` via the injectable `stderrFn`). Predicates return `StopReason | null` (NOT thrown — they are pure-function predicates, not user-facing API). The runLoop body uses async/await for state/sprint-status loads.
- **AR34** (slash-command markdown protocol): **UPHELD**. `commands/bmad-loop.md` adds two new sections (`### --until-epic-end (Story 4.2)` line 178; `### --until-story X.Y (Story 4.2)` line 195) and flips the §Stop Conditions table rows to RUNTIME-WIRED (lines 165-166). Frontmatter `argumentHint` already encoded both flags at line 3 from Story 4.1. The four-step Bash → JSON line read → Task → Bash verify-and-advance pattern is preserved untouched.
- **AR41** (boundary graph): **UPHELD**. `stop-conditions.ts` is top-tier; imports only foundational-tier types (`DagAdjacency` via `../../dag/index.ts`, `State` via `../../schemas/state.ts`) and intra-module types (`LoopArgs` from `./args.ts`, `StopReason` from `./run.ts`). The intra-module `./run.ts` import is purely TYPE — no runtime cycle. `run.ts` adds foundational `loadStateUnlocked` (`../../state/load.ts`) and `DagAdjacency` type (`../../dag/index.ts`); the loop runner is read-only at top tier per AR8 + Story 2.4. Verified by `run.test.ts:269-289` (boundary check on stop-conditions.ts) + `run.test.ts:240-265` (boundary check on run.ts).
- **AR42** (test discipline): **UPHELD**. Colocated test file `stop-conditions.test.ts` (28 tests / 152 expects). Per-test isolation via runtime-injectable test seams (`stateOverride`, `sprintStatusOverride`, `stderrOverride` on `LoopOpts`); no `mock.module` usage; no subprocess spawn; no file-system writes from predicate tests.

#### Open Questions Adjudication

- **OQ-1** (AC-3 verbatim `(state, dag) => boolean` vs widened `(state, dag, args, sprintStatus?) => StopReason | null`): **ACCEPT**. The widening is necessary (a) to short-circuit when the flag is undefined; (b) to feed `--until-epic-end` the sprint-status it needs to enumerate stories; (c) to preserve Story 4.1's `LoopResult.stopReason` discriminated union. The "boolean" wording in the AC is naturally read as the BINARY OUTCOME (fired vs not-fired); the richer `StopReason` carries the metadata. Stories 4.3/4.5/4.6 will follow this same contract.
- **OQ-3** (post-iteration only check vs pre+post-iteration for `--until-story` overshoot): **ACCEPT**. Consistent with Story 4.1's `shouldStop` firing AFTER each `runNext` returns success. The `state.lastSuccessfulStep.story` is updated by `verify-and-advance.ts` BEFORE the next `shouldStop` boundary, so the post-iteration check naturally catches the overshoot. A pre-iteration check would require duplicating `runNext`'s DAG traversal — net negative.
- **OQ-4** (graceful degradation when state/dag/sprint-status load fails): **ACCEPT**. Loop continues with the `--max-iters` branch; `untilEpicEndStopCondition` short-circuits on `sprintStatus === undefined` (line 164); `untilStoryStopCondition` does not consult sprint-status. The only risk is silent degradation when state.yaml is corrupt — but `loadStateUnlocked` has its own defensive paths (per Story 1.6). Repair r1 (D3) is a direct consequence of getting this graceful-degradation correct.
- **OQ-5** (per-epic story enumeration via sprint-status keys vs DAG-based): **ACCEPT**. Sprint-status.yaml's `development_status` keys naturally encode both per-epic enumeration AND per-story status; the DAG carries enumeration but not mutable status. The regex `^${epic}-\\d+-` (line 175) is conservative — it correctly excludes `epic-N-retrospective` keys. Story 4.10 may revisit if a richer DAG abstraction emerges.
- **OQ-10** (state-shape deviation: spec uses `state.workflow.epic`/`.story`; schema uses `state.lastSuccessfulStep.epic` (number) / `.story` (string)): **ACCEPT**. The implementation correctly reads from the actual schema fields and normalises `epic` to a string for the `StopReason` shape (line 171). The spec text's `state.workflow.*` reference was an artefact of an earlier schema sketch; the dev-story's adaptation is correct. Tracked as D2 below.
- **OQ-OOM** (full-suite `bun test --pass-with-no-tests` OOMs on Mac): **DEFER** — issue is environmental (Bun + Mac memory) and pre-dates Story 4.2 (documented from Story 1.6 onward). Targeted runs (which I independently re-ran above) fully cover the Story 4.2 delta. Forward-tracker for an architecture/CI item — not a code-quality blocker for this story.
- **OQ-OOM-r1** (repair r1 widening of `shouldStop` sprintStatus null guard): **ACCEPT**. The widening from `state !== null && sprintStatus !== null` to `state !== null` is correct: (a) `untilStoryStopCondition` does not consult sprintStatus, so requiring it would create a false dependency that suppresses the predicate whenever sprint-status is missing; (b) `untilEpicEndStopCondition` already handles `sprintStatus === undefined` gracefully at line 164. The repair fixes 3 hanging tests (K_42/L_42/N_42) that legitimately inject `sprintStatusOverride: () => null`. Pure mechanical correctness fix.

#### Deviation Adjudication

- **D1** (AC-3 contract widening from `(state, dag) => boolean` to `(state, dag, args, sprintStatus?) => StopReason | null`): **ACCEPT**. See OQ-1. The widening is necessary and well-documented in the file header JSDoc (lines 20-29). The "boolean" wording maps to BINARY OUTCOME; the metadata is in the `StopReason` shape.
- **D2** (state-shape: spec uses `state.workflow.*`; impl reads `state.lastSuccessfulStep.*` per actual Zod schema): **ACCEPT**. The implementation reads from the actual schema and normalises `epic` from number to string. The spec text's `state.workflow.*` was an early-draft naming; predicate's behaviour is correct.
- **D3** (repair r1 widened `shouldStop` sprintStatus null guard): **ACCEPT**. See OQ-OOM-r1. Mechanical correctness fix; no behavioural regression — `untilEpicEndStopCondition` already handles undefined sprint-status; `untilStoryStopCondition` does not consult it.
- **D4** (full-suite `bun test` OOM precludes a single end-to-end pass): **ACCEPT**. Pre-existing environmental issue (Story 1.6 onward); targeted runs cover the full delta; not a Story 4.2 quality blocker. Forward-tracker noted.

#### Findings

##### Must-Fix (blocks promotion)

(none)

##### Should-Fix (highly recommended; can be done in follow-up; not blocking)

(none)

##### Nits (optional polish)

1. **`stop-conditions.ts:170` defensive `epicNum === undefined || epicNum === null` check** — when `state.lastSuccessfulStep` is `null` (line 169), the optional-chain `?.epic` returns `undefined`, so the explicit `=== null` arm is unreachable. The defensive nullness check costs nothing and arguably documents intent for future schema migrations; minor stylistic call.

2. **`run.ts:259-263` `EMPTY_DAG` sentinel positioned mid-file** — declared after `shouldStop` (which uses it) and just before `loadSprintStatusForLoop`. Convention in the codebase is module-level constants near the top; placing `EMPTY_DAG` near the imports would improve discoverability. Cosmetic only; current placement works because of TS hoisting + variable initialisation order.

3. **`run.ts:405` comment `// v0.1 conservative: skip the DAG load`** sets `dag` to `null` and never builds it; predicates accept `EMPTY_DAG` via the `dag ?? EMPTY_DAG` coalesce at line 232. Stories 4.3+ will need an actual DAG (per spec Task 1.7 forward-tracker note). This is correctly forward-tracked but the dead variable + sentinel feels like throat-clearing — Story 4.3 may want to remove the `null` typing entirely once DAG is consumed.

##### Informational (forward-tracking — open-question adjudications)

The dev-story flagged 7 open questions; all adjudicated above (OQ-1, OQ-3, OQ-4, OQ-5, OQ-10, OQ-OOM, OQ-OOM-r1). Six ACCEPT, one DEFER (OQ-OOM — environmental). Carried forward to Stories 4.3 (which will follow OQ-1 contract), 4.4 (which will remove the `hasOtherStopCondition` guard + the `no-stop-condition` placeholder), 4.10 (which may enrich the `--resume` hint format per FR54).

#### Positive Notes (what was done well)

- The `compareStoryIds` numeric-segment comparator (lines 107-129) is well-isolated, has full test coverage incl the canonical `1.10 > 1.2` hazard, and is correctly forward-prepared as a reusable helper for Stories 4.3/4.6.
- Repair r1 was correctly diagnosed (the original guard created a false dependency on sprint-status for the until-story predicate). The dev-story documented the repair in the Change Log + ran targeted tests post-fix.
- AR41 boundary check is asserted at THREE places: (a) the new boundary describe block at `run.test.ts:269-289` for stop-conditions.ts; (b) the existing boundary block at `run.test.ts:239-265` (now extended with the loadStateUnlocked import check); (c) per-file imports inspected manually. Defence-in-depth.
- The graceful-degradation pattern (state/sprint-status load failures yield null; predicates short-circuit) preserves overnight-run resilience without breaking the AC-1/2 happy path.
- The state-snapshot pointer + `--resume` hint emission (run.ts:411-416) is testable via the `stderrOverride` test seam — Test J_42 captures the emission cleanly without polluting the test runner's stderr.
- File-header JSDoc on `stop-conditions.ts` (lines 1-46) is genuinely useful — cites every relevant FR/AR/OQ + explains the contract widening decision.

#### Verdict Rationale

`approve` (NOT `approve-with-actions`) because:
- All 3 ACs PASS with file:line evidence.
- All architecture invariants UPHELD (AR8/9/21/22/33/34/41/42).
- All quality gates green: `bun test src/commands/loop` 82/0/335; errors registry 16; tsc 0; biome 0.
- No must-fix or should-fix items (all 4 deviations are well-reasoned and the 3 nits are cosmetic).
- 7 open questions all adjudicated (6 ACCEPT, 1 DEFER as environmental).
- Repair r1 is a legitimate correctness fix; not a process failure.
- The OOM issue (D4) is pre-existing environmental; not a Story 4.2 blocker.
- Story 4.1's SF-1/SF-2 forward-trackers correctly preserved (target Stories 4.10/4.6).

The 3 nits can be addressed opportunistically in Story 4.3 (which will touch `stop-conditions.ts` for the next-story/phase-end predicates) or left as-is — none are blocking.

## Project Context Reference

This story consumes:

- **`_bmad-output/planning-artifacts/epics.md`** §Story 4.2 lines 905-919 — verbatim AC source.
- **`_bmad-output/planning-artifacts/architecture.md`** — AR8/9/11/21/22/33/34/41/42 invariants; P4 line 858 sole-exception rule for argument parsing; P6 lines 919-952 slash-command markdown patterns.
- **`_bmad-output/planning-artifacts/prd.md`** — FR8/9/19/53/54 + NFR-P1/S2/S5/R1/R4/M3/I2 invariants.
- **`_bmad-output/implementation-artifacts/4-1-bmad-loop-command-skeleton.md`** — IMMEDIATE PREDECESSOR. LoopArgsSchema 13 fields, runLoop skeleton, shouldStop predicate, StopReason union, IterationRecord shape, runNextOverride test seam, AR9 final-emission strategy.
- **`_bmad-output/implementation-artifacts/sprint-status.yaml`** — story status map; the `--until-epic-end` predicate consumes this for the "all stories done + retro filed" check.
- **`_bmad-output/implementation-artifacts/3-1-record-last-attempted-last-failure-reason-on-halt.md`** — halt-recording mutation pair (irrelevant for 4.2's clean-exit conditions but precedent for resume-hint format).
- **`_bmad-output/implementation-artifacts/3-7-list-candidate-next-steps.md`** — per-epic story enumeration precedent for the `--until-epic-end` predicate.
- **`.bmad-stepper/state.yaml`** — current workflow position; the `--until-story` predicate compares `state.workflow.story` against `args.untilStory`.
- **`src/commands/loop/args.ts`** (Story 4.1) — `LoopArgsSchema` declares `untilEpicEnd` + `untilStory` fields; Story 4.2 RUNTIME-WIRES them.
- **`src/commands/loop/run.ts`** (Story 4.1) — `runLoop` runner skeleton; Story 4.2 EXTENDS the per-iteration boundary check.
- **`src/state/load.ts`** (Story 1.6) — `loadState` function; Story 4.2 IMPORTS for per-iteration state load.
- **`src/dag/index.ts`** (Story 1.10) — `Dag` type + `buildDag` function; Story 4.2 IMPORTS for per-iteration dag build.
- **`src/errors.ts`** (Story 1.2) — error registry held at 16 codes; Story 4.2 ships ZERO new error classes.

## Story Completion Status

Status: **done**

Dev-story complete. AC-1/AC-2/AC-3 all PASS with declared deviations (D1 contract widening, D2 state-shape, D3 repair r1, D4 OOM); 1 repair iter (r1 widened shouldStop sprintStatus guard); test counts 82/0/335 across `src/commands/loop/{args,run,stop-conditions}.test.ts` + errors registry held at 16 + biome + tsc clean.

**Next steps:**
1. Run `bmad:bmad-code-review` (auto-marks done; appends Senior Developer Review section).
2. Code-review will audit AC-1/2/3 coverage, the 4 deviations (D1-D4), and the 7 open questions for code review (OQ-1, OQ-3, OQ-4, OQ-5, OQ-10, OQ-OOM, OQ-OOM-r1).
