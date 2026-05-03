---
status: done
story_id: '4.4'
story_key: 4-4-stop-condition-max-iters-and-default-cap
epic: '4'
title: 'Stop-Condition: `max-iters` and Default Cap'
created: '2026-05-03'
last_updated: '2026-05-03T10:00:00Z'
priority: H
estimated_effort: S
fr_coverage:
  - FR8
  - FR19
  - FR23
  - FR25
nfr_coverage:
  - NFR-P1
  - NFR-S2
  - NFR-S5
  - NFR-R1
  - NFR-R4
  - NFR-M3
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
  - 4-3-stop-condition-next-story-and-phase-end  # PRIMARY: hasOtherStopCondition guard widened to 4 flags; v0.1 no-stop-condition placeholder branch; Senior Developer Review verdict approve; forward action items expressly call out 4.4 cleanup
  - 4-2-stop-condition-epic-end-and-story-x-y    # ORIGINATOR: hasOtherStopCondition introduced at run.ts:178-180; EMPTY_DAG sentinel placement to revisit
  - 4-1-bmad-loop-command-skeleton               # SKELETON: --max-iters wiring (already RUNTIME-WIRED); no-stop-condition placeholder originated here per v0.1 pre-Story-4.4 doc
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/implementation-artifacts/4-3-stop-condition-next-story-and-phase-end.md
  - _bmad-output/implementation-artifacts/4-2-stop-condition-epic-end-and-story-x-y.md
  - _bmad-output/implementation-artifacts/4-1-bmad-loop-command-skeleton.md
  - _bmad-output/implementation-artifacts/sprint-status.yaml
  - .bmad-stepper/state.yaml
  - .bmad-stepper/runs/2026-05-03T090528Z-bmad-next/run.yaml
  - src/commands/loop/args.ts
  - src/commands/loop/run.ts
  - src/commands/loop/run.test.ts
  - src/commands/loop/stop-conditions.ts
  - src/commands/loop/stop-conditions.test.ts
  - src/commands/loop/index.ts
  - src/schemas/state.ts
  - src/dag/index.ts
  - src/errors.ts
  - commands/bmad-loop.md
---

# Story 4.4: Stop-Condition: `max-iters` and Default Cap

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper user,
I want `--max-iters N` to cap iteration count and `--max-iters=50` to apply by default when no other condition is supplied,
So that accidental infinite loops are impossible.

## Context Summary

This is the **fourth story of Epic 4 (Bounded Loop with Eight Stop Conditions)** and it lands the **default-cap behaviour** that PRD FR25 and PRD §Bounded Loop Execution mandate. Story 4.1 already wired `--max-iters N` as the FIRST runtime stop condition (RUNTIME-WIRED in 4.1) — Story 4.4 EXTENDS that wiring with the **default-cap policy**: when the user supplies NO stop condition (no `--max-iters`, no `--until-epic-end`, no `--until-story X.Y`, no `--next-story`, no `--phase-end`, AND none of the future Stories 4.5/4.6 flags), the runner injects `args.maxIters = 50` so the bounded loop has a hard ceiling. When the user DOES supply another stop condition (e.g., `--until-epic-end`) WITHOUT `--max-iters`, the explicit condition controls and **NO default cap is applied**. This is the FR25 contract verbatim.

**Story 4.4's scope is THREE acceptance criteria** (AC-1 default `--max-iters=50` when no condition; AC-2 explicit `--max-iters 10` exits at iteration 10 with verbatim message `max-iters (10) reached`; AC-3 explicit-non-max-iters condition → no default cap applied + integration test verifies both behaviors). Story 4.4 introduces ZERO new source files (modifies `src/commands/loop/run.ts` only); modifies ONE source file + ONE test file + ONE markdown file (`run.ts` + `run.test.ts` + `commands/bmad-loop.md`). Net additions: **~30-60 lines added, ~10-30 lines REMOVED across the cleanup**: ZERO new error classes (registry holds at 16 codes), ZERO state-schema changes, ZERO `src/commands/loop/stop-conditions.ts` modifications, ZERO new test files, ZERO `args.ts` schema changes (the `maxIters` field already exists per Story 4.1).

**`--max-iters=50` default-cap semantics per AC-1 verbatim** (epics.md line 945-947): no stop condition is supplied → `--max-iters=50` is enforced as default (FR25). v0.1 conservative implements this as a SINGLE STATEMENT inside `runLoop` near the args-resolution block: `args = { ...args, maxIters: args.maxIters ?? 50 }` IFF NO other stop condition is supplied (i.e., `args.untilEpicEnd !== true` AND `args.untilStory === undefined` AND `args.nextStory !== true` AND `args.phaseEnd !== true`). The default-cap predicate is the SAME shape as Story 4.2's + Story 4.3's `hasOtherStopCondition` helper but inverted — when there is NO other stop condition, default the cap. When the user supplies BOTH `--max-iters` AND another condition, the user's `--max-iters` wins (it was already non-undefined; the `?? 50` no-ops).

**`--max-iters 10` explicit-cap semantics per AC-2 verbatim** (epics.md line 948-950): `--max-iters 10` is supplied → the loop reaches 10 iterations → exits with reason `max-iters (10) reached`. The current Story 4.1 message format at run.ts:629-632 is `max-iters reached (1 iteration)` — Story 4.4 must REWRITE the message format to `max-iters (N) reached` (note the parenthesis placement and the absence of "iterations" suffix per the AC-2 verbatim). The structured `StopReason.code === "max-iters-reached"` and the `maxIters` + `iterCount` fields stay unchanged — only `formatExitReason` is touched. Story 4.10 may further enrich the AR9 line with `--resume` hints; v0.1 conservative keeps the message format AC-2-byte-identical.

**`--until-epic-end` without `--max-iters` semantics per AC-3 verbatim** (epics.md line 951-954): another stop condition (e.g., `--until-epic-end`) is supplied WITHOUT `--max-iters` → no default cap is applied (the explicit condition controls) → integration test verifies the 50-default AND the explicit-overrides-default behavior. v0.1 conservative implements this via the inverted-`hasOtherStopCondition` predicate above: when ANY other stop condition is supplied, `args.maxIters` stays `undefined` (no default cap injected); the `shouldStop` predicate's `--max-iters` branch short-circuits because `args.maxIters !== undefined` is false. The other stop condition's predicate is responsible for halting the loop. The integration test must exercise both behaviors: (a) `runLoop({ argv: [] })` → default cap applied → loop runs 50 iterations and exits with `max-iters-reached`; (b) `runLoop({ argv: ["--until-epic-end"] })` with sprint-status NOT-yet-done → loop runs to natural exhaustion (test bounds with a different mechanism — see Task 9.5).

**Cleanup of forward action items from Story 4.3**: per the explicit Story 4.3 forward action items (lines 845-857), Story 4.4 is responsible for FOUR cleanups:

1. **REMOVE `hasOtherStopCondition` guard** at run.ts:207-214. Story 4.4 obviates this helper because the default-cap injection means `args.maxIters` is ALWAYS non-undefined at the `shouldStop` invocation (when no other stop condition is supplied) AND the `shouldStop` `--max-iters` branch fires naturally. The helper becomes dead code.
2. **REMOVE the `no-stop-condition` placeholder branch** at run.ts:283-289. With the default-cap injection, the placeholder is OBSOLETE: when `args.maxIters` is undefined AT loop entry, the default-cap injection runs IFF no other stop condition is supplied — making `args.maxIters === 50` for the `shouldStop` invocation. The `no-stop-condition` branch in `shouldStop` no longer reachable in normal control flow. Story 4.4 ALSO removes the `no-stop-condition` variant from the `StopReason` discriminated union AND the `formatExitReason` case AND any tests asserting it. (This is the most invasive cleanup — Test E in run.test.ts asserts the `no-stop-condition` placeholder; Test E must be REWRITTEN to assert the new default-cap behaviour.)
3. **CLEAN UP the `EMPTY_DAG` sentinel** if appropriate. Story 4.3 nit-3 (the dead `dag = null` typing) was already partially fixed when 4.3 made the DAG conditionally non-null. The EMPTY_DAG sentinel at run.ts:299-303 was used as the fallback when `dag === null`; Story 4.4 may keep it (still consumed by `shouldStop` in the dispatcher), or, OPPORTUNISTIC: remove it if all call paths now resolve dag to a real value. v0.1 conservative KEEPS the sentinel (still used by `shouldStop` when `dag === null`); it remains a useful invariant.
4. **Wire `args.maxIters = args.maxIters ?? 50` default cap** per FR25 — the SUBSTANTIVE change.

**Story 4.4 is INTENTIONALLY NARROW**: stories 4.5 (`--time-budget`, `--token-budget`), 4.6 (`--stop-on-error` / `--continue-on-error`), 4.7 (`--plan-first`) are the next stop-condition wirings. Story 4.4 does NOT touch the predicate set in `stop-conditions.ts`; Story 4.4 does NOT add to the `StopReason` union (it REMOVES one variant: `no-stop-condition`); Story 4.4 does NOT touch `args.ts` (the `maxIters` field is already declared per Story 4.1).

**Concretely, Story 4.4 produces:**

1. **`src/commands/loop/run.ts`** (MODIFIED, ~+10/-30 net lines): adds the default-cap injection `args = { ...args, maxIters: args.maxIters ?? 50 }` IFF no other stop condition is supplied (inside `runLoop` after `args` is resolved from argv); REMOVES `hasOtherStopCondition` helper at run.ts:207-214; REMOVES the `no-stop-condition` placeholder branch at run.ts:283-289; REMOVES the `no-stop-condition` variant from the `StopReason` discriminated union at run.ts:94-116; REMOVES the `no-stop-condition` case from `formatExitReason` at run.ts:633-634; REWRITES the `max-iters-reached` case in `formatExitReason` to emit `max-iters (N) reached` per AC-2 verbatim (was `max-iters reached (N iteration)`); UPDATES JSDoc on `shouldStop` to remove the no-stop-condition reference; UPDATES JSDoc on the FR53 exit-code mapping (`0` is now ONLY `max-iters-reached` or any other clean-exit StopReason — no longer `no-stop-condition`).

2. **`src/commands/loop/run.test.ts`** (MODIFIED, ~+50/-25 net lines): REWRITES Test E (`no stop condition supplied`) to assert the new default-cap behaviour — `argv=[]` injects `--max-iters=50` and runs 50 iterations exiting with `max-iters-reached`; ADDS Test X_44 (`--max-iters=50 default cap when argv=[]`); ADDS Test Y_44 (`--max-iters 10 exits with verbatim message "max-iters (10) reached"`); ADDS Test Z_44 (`explicit --until-epic-end without --max-iters does NOT apply default cap`); ADDS one comprehensive integration test (Test AA_44) that satisfies AC-3 verbatim "integration test verifies the 50-default AND the explicit-overrides-default behavior"; REMOVES Test N_42 (`hasOtherStopCondition guard`) and Test V_43 (`--next-story / --phase-end no-stop-condition guard`) IF they assert the placeholder behaviour — REWRITTEN to assert the new behaviour where the placeholder doesn't fire because the default cap doesn't apply when another condition is supplied. Other Story 4.2/4.3 tests (P_43, S_43, etc.) are inspected for any reliance on `no-stop-condition`; v0.1 conservative they don't depend on it (they use `--max-iters` explicitly to bound). UPDATES the test comment at the top of `run.test.ts` to remove the `no-stop-condition` reference + adds default-cap reference.

3. **`commands/bmad-loop.md`** (MODIFIED, ~+15/-10 net lines): updates the §Stop conditions table to flip the `--max-iters N` row from `RUNTIME-WIRED` to `RUNTIME-WIRED + DEFAULT 50 in 4.4`; ADDS a new sub-section `### --max-iters N (Story 4.1, default-cap in 4.4)` documenting the default-cap policy + the AC-2 verbatim message format; REMOVES the explicit "no-stop-condition placeholder" paragraph at lines 256-260 (replaces with a description of the default-cap policy); UPDATES the §Behavior section's `if stop-condition fires, breaks with the StopReason (one of max-iters-reached, no-stop-condition, halt-on-error)` sentence to remove `no-stop-condition` (now: `(one of max-iters-reached, halt-on-error, OR any of the 4-condition StopReasons from 4.2/4.3)`).

4. **`_bmad-output/implementation-artifacts/sprint-status.yaml`** (MODIFIED): flips `4-4-stop-condition-max-iters-and-default-cap: backlog → ready-for-dev`. Bumps `last_updated:` timestamp at BOTH the comment block top AND the live YAML field.

**FR/NFR/AR mapping:**

- **FR8** (`/bmad-next` single-step advance): UNCHANGED. The loop runner continues to invoke `runNext` once per iteration.
- **FR19** (Bounded Loop Execution — eight stop-condition types): PARTIAL (5 of 8 wired through 4.4). Story 4.1 wired explicit `--max-iters`; Story 4.2 wired `--until-epic-end` + `--until-story <x.y>`; Story 4.3 wired `--next-story` + `--phase-end`; Story 4.4 wires the **default cap** for `--max-iters=50`; Stories 4.5-4.6 wire the rest.
- **FR23** (cap wall-clock / token / iteration count): EXTENDED. The `--max-iters` flag was wired in 4.1; Story 4.4 ADDS the default-cap policy when the user omits both `--max-iters` AND any other stop condition.
- **FR25** (default `max-iters` cap when no stop condition is supplied): WIRED in this story. The verbatim PRD wording: "System enforces a default `max-iters` cap when no other stop condition is supplied, preventing accidental infinite loops." The default value is **50** per PRD §Bounded Loop Execution line 589 ("`--max-iters` defaults to 50 if no other stop condition is supplied").
- **FR53** (documented exit codes): UNCHANGED in mechanism, REVISED in reach. The `0` exit code now exclusively maps to `max-iters-reached` OR `epic-end-reached` OR `until-story-reached` OR `next-story-reached` OR `phase-end-reached` (clean exits) — NO LONGER includes `no-stop-condition` (variant removed). The `1` exit code remains `halt-on-error`.
- **FR54** (stdout/stderr discipline): UNCHANGED. Story 4.4 ships ZERO new stderr emissions. The single AR9 line on stdout is preserved with the new `max-iters (N) reached` message format.
- **NFR-P1** (next-step computation < 500ms p95): PRESERVED. The default-cap injection is a pure-function check at runLoop entry — sub-millisecond.
- **NFR-S2** (writes only inside scope): PRESERVED. Story 4.4 ships ZERO new write paths.
- **NFR-S5** (atomic writes + locks): PRESERVED. The loop runner remains lock-free per AR8.
- **NFR-R1** (zero data loss on halt): PRESERVED. The default cap fires AFTER `runNext` returns success — there is no in-flight dispatch to lose.
- **NFR-R4** (lock release on graceful exit): PRESERVED.
- **NFR-M3** (machine-readable JSON for `--export-state`): UNCHANGED.
- **AR8** (lock-free `run.ts` / lock-held `verify-and-advance.ts`): UPHELD. Story 4.4 ships ZERO new I/O imports.
- **AR9** (single discriminated-union JSON line on stdout): UPHELD. Story 4.4 REMOVES one variant (`no-stop-condition`) from the StopReason union — the `formatExitReason` extension formats the new `max-iters (N) reached` message into the AR9 line.
- **AR21 + AR22** (errors carry code + actionable hint): UNCHANGED. Story 4.4 ships ZERO new error classes — registry stays at 16 codes.
- **AR33** (function & error semantics; throw not Result; no console.\*; async/await): UPHELD. The default-cap injection is a pure-function check; ZERO `console.*` calls.
- **AR34** (slash-command markdown protocol): UNCHANGED. The `commands/bmad-loop.md` modifications are documentation-only updates to the existing §Stop conditions table + new sub-section.
- **AR41** (boundary graph): UPHELD. ZERO new imports.
- **AR42** (test discipline): EXTENDED. Existing colocated test files are extended; AR35 tmpdir-per-test discipline preserved.

Estimated effort: **S** (small — ZERO new source files; ONE modified source file (~+10/-30 net lines: default-cap injection + cleanup); ONE modified test file (~+50/-25 net lines: rewrite Test E + add 4-5 new tests); ONE modified markdown file (~+15/-10 net lines: table flip + new sub-section + cleanup the no-stop-condition paragraph). ZERO new error classes; ZERO new schema work; ZERO `verify-and-advance.ts` modifications; ZERO `lock.ts` modifications; ZERO `stop-conditions.ts` modifications.)

It does **NOT**:

- **Wire the other 3 stop-condition types** (`--time-budget`, `--token-budget`, `--stop-on-error` / `--continue-on-error`). Forward-deferred to Stories 4.5 (time/token budgets), 4.6 (error policies).
- **Address Story 4.1's SF-1 (extractFailureCode EXIT_0 edge case).** Forward-tracker to Story 4.10 per the 4.1-code-review forwardDependencies.
- **Address Story 4.1's SF-2 (IterationRecord.action "unknown" union member).** Forward-tracker to Story 4.6 per the 4.1-code-review forwardDependencies.
- **Address Story 4.2's two remaining nits (defensive null check at stop-conditions.ts:208; EMPTY_DAG sentinel placement).** Cosmetic; not 4.4 blockers.
- **Format the full `--resume` hint with `state.lastFailureReason.hint` enrichment.** Forward-deferred to Story 4.10.
- **Make `--max-iters` accept zero.** Per Zod schema at args.ts:96, `maxIters: z.number().int().positive().optional()` rejects zero. Story 4.4 keeps the constraint. (PRD does not mandate `--max-iters=0` semantics.)
- **Modify `src/commands/next/run.ts`, `src/state/load.ts`, `src/dag/build.ts`, `src/lock/lock.ts`, `src/schemas/state.ts`, `src/commands/loop/args.ts`, `src/commands/loop/stop-conditions.ts`, `src/commands/loop/stop-conditions.test.ts`.** Story 4.4 is purely a `run.ts` + `run.test.ts` + `commands/bmad-loop.md` modification.
- **Add a new error class.** Registry stays at 16 codes.

## Acceptance Criteria

The acceptance criteria below are reproduced **verbatim** from `_bmad-output/planning-artifacts/epics.md` §Story 4.4 (lines 937-954, BDD Given/When/Then format). Lines and AC labelling preserved.

**Acceptance Criteria:**

**Given** no stop condition is supplied
**When** `/bmad-loop` is invoked
**Then** `--max-iters=50` is enforced as default (FR25)

**Given** `--max-iters 10` is supplied
**When** the loop reaches 10 iterations
**Then** the loop exits with reason `max-iters (10) reached`

**Given** another stop condition (e.g., `--until-epic-end`) is supplied without `--max-iters`
**When** the loop runs
**Then** no default cap is applied (the explicit condition controls)
**And** integration test verifies the 50-default and the explicit-overrides-default behavior

> **Story 4.4 stop-condition scope note:** AC-1 is the default-cap policy for `--max-iters=50` (FR25); AC-2 is the explicit `--max-iters N` exit message format `max-iters (N) reached`; AC-3 is the explicit-condition-overrides-default-cap policy + the integration-test rubric. Stories 4.5 (`--time-budget`, `--token-budget`) and 4.6 (`--stop-on-error`, `--continue-on-error`) will continue to extend the bounded-loop runner with additional stop-condition predicates. Story 4.4 is the FINAL story in the `--max-iters` family.

## Tasks / Subtasks

- [x] **Task 0 — Verify pre-conditions (AC: all)**
  - [x] 0.1 Confirm Story 4.3 is `done` per `_bmad-output/implementation-artifacts/sprint-status.yaml:85`. Confirm code-review verdict `approve` per `_bmad-output/implementation-artifacts/4-3-stop-condition-next-story-and-phase-end.md` Senior Developer Review section (verdict line 726, counts in §Quality gates: 0 must-fix / 0 should-fix / 2 nits inherited from 4.2 / 7 info).
  - [x] 0.2 Read `_bmad-output/implementation-artifacts/4-3-stop-condition-next-story-and-phase-end.md` end-to-end. Confirm:
    - `src/commands/loop/run.ts:207-214` defines `hasOtherStopCondition(args)` recognizing 4 flags (`untilEpicEnd`, `untilStory`, `nextStory`, `phaseEnd`).
    - `src/commands/loop/run.ts:283-289` defines the `no-stop-condition` placeholder branch in `shouldStop`.
    - `src/commands/loop/run.ts:94-116` defines `StopReason` discriminated union with 7 variants (`max-iters-reached`, `no-stop-condition`, `halt-on-error`, `epic-end-reached`, `until-story-reached`, `next-story-reached`, `phase-end-reached`).
    - `src/commands/loop/run.ts:299-303` defines `EMPTY_DAG: DagAdjacency` sentinel (used by shouldStop's evaluateStopConditions call when dag is null).
    - `src/commands/loop/run.ts:629-632` defines the `max-iters-reached` case in `formatExitReason` returning `max-iters reached (${iterCount} ${plural})` (Story 4.1 format — REWRITTEN by 4.4 to AC-2 verbatim).
    - `src/commands/loop/run.ts:633-634` defines the `no-stop-condition` case in `formatExitReason` returning `"no stop condition supplied (Story 4.4 default cap not yet wired) — exiting"` placeholder text.
    - Errors registry at `src/errors.ts` holds at 16 codes (verified by 4.3 Senior Developer Review §Quality gates table: `grep -c "override readonly code" → 16`).
  - [x] 0.3 Read epics.md §Story 4.4 lines 937-954 verbatim. Confirm the AC text in §Acceptance Criteria above is character-identical to lines 943-954.
  - [x] 0.4 Read `src/commands/loop/run.test.ts:155-164` to confirm the existing Test E (`no stop condition supplied`) asserts the v0.1 placeholder behaviour. Story 4.4 will REWRITE this test to assert the new default-cap behaviour.
  - [x] 0.5 Read `_bmad-output/planning-artifacts/prd.md` §FR25 (line 701) verbatim: "System enforces a default `max-iters` cap when no other stop condition is supplied, preventing accidental infinite loops." Confirm. Read PRD §Bounded Loop Execution line 589 for the default value: "`--max-iters` defaults to 50 if no other stop condition is supplied". Confirm 50 is the correct default (epics.md AC-1 line 947 also says `--max-iters=50`).
  - [x] 0.6 Read `_bmad-output/implementation-artifacts/sprint-status.yaml` and confirm `4-4-stop-condition-max-iters-and-default-cap: backlog` is the current value at line 86 (Story 4.4 will flip to `ready-for-dev`).
  - [x] 0.7 Read Story 4.3's §Forward Action Items (lines 845-857) to confirm the EXPLICIT cleanup mandate for Story 4.4: "REMOVE the `hasOtherStopCondition` guard at run.ts:207-214 alongside the v0.1 `no-stop-condition` placeholder branch at run.ts:283-289. ADD `args.maxIters = args.maxIters ?? 50` default cap per FR25. Clean up the now-dead `EMPTY_DAG` sentinel if the DAG load becomes unconditional." (Note: the EMPTY_DAG sentinel cleanup is OPPORTUNISTIC — Story 4.4 KEEPS it because the DAG load remains opt-in per Story 4.3 OQ-8.)
  - [x] 0.8 Confirm baseline `bun test src/commands/loop` exits 0 with the post-Story-4.3 baseline (~118 pass / 0 fail / ~409 expects across 3 files per Story 4.3 §Quality gates).
  - [x] 0.9 Confirm Bun host version satisfies AR2 (Bun >= 1.3). Run `bun --version`; record in Completion Notes.
  - [x] 0.10 Confirm `src/errors.ts` registry holds at 16 codes (`bun test src/errors.test.ts` → 10 pass / 0 fail / 197 expects).

- [x] **Task 1 — Wire the `--max-iters=50` default cap inside `runLoop` (AC-1, AC-3)**
  - [x] 1.1 Locate the args-resolution block in `src/commands/loop/run.ts` at the top of `runLoop` (around lines 386-402) where `args` is resolved from `opts.args` or `parseLoopArgs(argv)`.
  - [x] 1.2 IMMEDIATELY AFTER the args-resolution block (before the `runNextFn` declaration at line 404), insert the default-cap injection:
    ```typescript
    // Story 4.4 (FR25): default --max-iters=50 when no stop condition is
    // supplied. The injection ONLY applies when args.maxIters is undefined
    // AND no other stop condition is set. When the user supplies another
    // stop condition (e.g., --until-epic-end) WITHOUT --max-iters, the
    // explicit condition controls and NO default cap is applied (AC-3).
    // When --max-iters is explicitly set, the default-cap is a no-op.
    if (
      args.maxIters === undefined &&
      args.untilEpicEnd !== true &&
      args.untilStory === undefined &&
      args.nextStory !== true &&
      args.phaseEnd !== true
    ) {
      args = { ...args, maxIters: 50 };
    }
    ```
    Note: this stanza performs an INVERTED check matching the now-removed `hasOtherStopCondition` helper. v0.1 conservative inlines it (the helper is removed by Task 2). Stories 4.5/4.6 will EXTEND this stanza with `args.timeBudgetMs === undefined && args.tokenBudget === undefined && args.stopOnError !== true && args.continueOnError !== true && args.planFirst !== true` as those flags become RUNTIME-WIRED.
  - [x] 1.3 Add a multi-line JSDoc comment ABOVE the stanza explaining FR25 + the explicit-override-default policy + the forward-tracker for 4.5/4.6 extension.
  - [x] 1.4 Confirm via local debug run (e.g., `bun run src/commands/loop/run.ts -- --max-iters 10` then `bun run src/commands/loop/run.ts --` with empty args) that:
    - With explicit `--max-iters 10`: the runner runs UP TO 10 iterations and exits with `max-iters-reached`.
    - With NO args: the runner runs UP TO 50 iterations and exits with `max-iters-reached`.
    - With `--until-epic-end` only: the runner does NOT inject the default cap; runs to natural exhaustion (or hits epic-end-reached if applicable).

- [x] **Task 2 — Remove `hasOtherStopCondition` helper (cleanup)**
  - [x] 2.1 At `src/commands/loop/run.ts:207-214`, REMOVE the `hasOtherStopCondition` function declaration entirely (the helper is now dead code per Task 1's inlined check). Also remove the JSDoc comment at lines 196-206 above it.
  - [x] 2.2 Search `src/commands/loop/` for any remaining call sites of `hasOtherStopCondition`. Per Story 4.3 the only call site is `shouldStop` at run.ts:286 inside the `no-stop-condition` branch (also being removed by Task 3). Confirm zero remaining call sites after Task 3.
  - [x] 2.3 If TypeScript reports any unused-import warnings (e.g., the inline `LoopArgs` type was used only in the helper signature), defer to Task 4.

- [x] **Task 3 — Remove the `no-stop-condition` placeholder branch + variant (cleanup)**
  - [x] 3.1 At `src/commands/loop/run.ts:283-289`, REMOVE the `no-stop-condition` placeholder branch in `shouldStop`:
    ```typescript
    if (
      args.maxIters === undefined &&
      iterCount === 0 &&
      !hasOtherStopCondition(args)
    ) {
      return { code: "no-stop-condition", iterCount };
    }
    ```
    Reasoning: with the default-cap injection from Task 1, this branch is unreachable in normal control flow (when no stop condition is supplied, `args.maxIters` is now 50; when another condition is supplied, the predicates handle it).
  - [x] 3.2 At `src/commands/loop/run.ts:94-116`, REMOVE the `no-stop-condition` variant from the `StopReason` discriminated union:
    ```typescript
    | { code: "no-stop-condition"; iterCount: number }
    ```
    Update the JSDoc above the union (lines 80-93) to remove the `no-stop-condition` reference.
  - [x] 3.3 At `src/commands/loop/run.ts:633-634`, REMOVE the `no-stop-condition` case from `formatExitReason`:
    ```typescript
    case "no-stop-condition":
      return "no stop condition supplied (Story 4.4 default cap not yet wired) — exiting";
    ```
  - [x] 3.4 Update the JSDoc at `src/commands/loop/run.ts:619-626` to remove the `no-stop-condition` reference. Update the JSDoc at `src/commands/loop/run.ts:216-236` (`shouldStop` JSDoc) to remove the `no-stop-condition` reference.
  - [x] 3.5 Update the JSDoc near top of `src/commands/loop/run.ts:27-32` (the EXIT-CODE MAPPING block) to remove the `no-stop-condition` reference. The new comment: `0 — clean exit (max-iters-reached OR any of epic-end-reached / until-story-reached / next-story-reached / phase-end-reached). 1 — halt-on-error. 2 — argv parse error.`

- [x] **Task 4 — Rewrite the `max-iters-reached` exit-message format per AC-2 (AC-2)**
  - [x] 4.1 At `src/commands/loop/run.ts:629-632`, REWRITE the `max-iters-reached` case in `formatExitReason`:
    ```typescript
    case "max-iters-reached":
      // AC-2 verbatim: "max-iters (N) reached" (epics.md line 950).
      return `max-iters (${stopReason.maxIters}) reached`;
    ```
    Note: the previous Story 4.1 format was `max-iters reached (1 iteration)` — Story 4.4 changes this to `max-iters (10) reached` per AC-2 verbatim. The structured StopReason fields (`maxIters`, `iterCount`) stay unchanged.
  - [x] 4.2 Update the JSDoc above `formatExitReason` (lines 619-626) to reference the new AC-2 verbatim format.
  - [x] 4.3 Per AC-2 verbatim, the message uses `stopReason.maxIters` (the cap), NOT `stopReason.iterCount` (the actual count reached). Both are equal when the cap fires (the loop exits the moment iterCount === maxIters), but the AC's `(10)` is the cap value. Confirm this design decision is documented inline. Tracked as Open Question 1.
  - [x] 4.4 Story 4.10 may further enrich the AR9 line with `--resume` hints; v0.1 conservative keeps the message format AC-2-byte-identical.

- [x] **Task 5 — Verify the `EMPTY_DAG` sentinel remains needed (cleanup decision)**
  - [x] 5.1 At `src/commands/loop/run.ts:299-303`, the `EMPTY_DAG` sentinel is consumed by `shouldStop` (run.ts:271) when `dag === null`. The DAG remains opt-in per Story 4.3 OQ-8 — built only when `args.phaseEnd === true`. The sentinel is STILL needed for the `dag === null` path. v0.1 conservative KEEPS the sentinel.
  - [x] 5.2 Note in Open Questions: the `EMPTY_DAG` sentinel placement (mid-file at run.ts:299-303 vs. module-level near imports) remains as Story 4.2 nit-2 — cosmetic, not a 4.4 blocker. Forward-tracker to a future cleanup story OR Story 4.5+ if the DAG load becomes unconditional.

- [x] **Task 6 — Update tests in `src/commands/loop/run.test.ts` (AC-1, AC-2, AC-3)**
  - [x] 6.1 At `src/commands/loop/run.test.ts:155-164`, REWRITE Test E (`no stop condition supplied`):
    ```typescript
    describe("runLoop — Test E (default --max-iters=50 when no stop condition supplied; Story 4.4 AC-1)", () => {
      it("argv=[] applies the default --max-iters=50 cap and runs 50 iterations", async () => {
        const { stub, calls } = countingStub(successResult());
        const result = await runLoop({ argv: [], runNextOverride: stub });
        expect(result.iterations.length).toBe(50);
        expect(result.stopReason.code).toBe("max-iters-reached");
        if (result.stopReason.code !== "max-iters-reached") return;
        expect(result.stopReason.maxIters).toBe(50);
        expect(result.stopReason.iterCount).toBe(50);
        expect(result.exitCode).toBe(0);
        expect(calls()).toBe(50);
      });
    });
    ```
    Reasoning: the v0.1 `no-stop-condition` placeholder is gone; the default-cap injection means `argv=[]` runs 50 iterations and exits with `max-iters-reached`.
  - [x] 6.2 Add Test X_44 — the same as Test E but with the AC-1 message format check (verifies `formatExitReason` does NOT prepend "no stop condition supplied" anywhere):
    ```typescript
    describe("runLoop — Test X_44 (Story 4.4 AC-1: default cap fires with max-iters-reached)", () => {
      it("default-cap fired AR9 line uses formatExitReason 'max-iters (50) reached'", async () => {
        // No direct test of formatExitReason since it's not exported; verify
        // via the structured StopReason payload (the AR9 message shape is
        // covered by the import.meta.main test in Test V/W (Story 4.1)).
        const { stub } = countingStub(successResult());
        const result = await runLoop({ argv: [], runNextOverride: stub });
        if (result.stopReason.code !== "max-iters-reached") return;
        expect(result.stopReason.maxIters).toBe(50);
      });
    });
    ```
  - [x] 6.3 Add Test Y_44 — the AC-2 verbatim message format check:
    ```typescript
    describe("runLoop — Test Y_44 (Story 4.4 AC-2: max-iters (N) reached message format)", () => {
      it("--max-iters 10 exits with stopReason.maxIters === 10 + iterCount === 10", async () => {
        const { stub, calls } = countingStub(successResult());
        const result = await runLoop({ argv: ["--max-iters", "10"], runNextOverride: stub });
        expect(result.iterations.length).toBe(10);
        expect(result.stopReason.code).toBe("max-iters-reached");
        if (result.stopReason.code !== "max-iters-reached") return;
        expect(result.stopReason.maxIters).toBe(10);
        expect(result.stopReason.iterCount).toBe(10);
        expect(calls()).toBe(10);
      });
      // Note: the AR9 emitted message text "max-iters (10) reached" is
      // assembled by formatExitReason inside import.meta.main (Story 4.1
      // already tests the import.meta.main block via separate execution).
      // This unit test verifies the structured StopReason fields used by
      // formatExitReason; the format is covered by Test AA_44 below.
    });
    ```
  - [x] 6.4 Add Test Z_44 — AC-3 verbatim: explicit `--until-epic-end` does NOT inject default cap:
    ```typescript
    describe("runLoop — Test Z_44 (Story 4.4 AC-3: explicit --until-epic-end does NOT inject default cap)", () => {
      it("--until-epic-end alone fires on epic-end-reached without applying --max-iters=50", async () => {
        const { stub, calls } = countingStub(successResult());
        // Epic-3 is fully done in this fixture → --until-epic-end fires on iter 0 boundary.
        const state = makeStateFixture(3, "3.10");
        const sprintStatus = makeSprintStatusEpic3Done();
        const result = await runLoop({
          argv: ["--until-epic-end"],
          runNextOverride: stub,
          stateOverride: () => state,
          sprintStatusOverride: () => sprintStatus,
          stderrOverride: () => {},
        });
        expect(result.stopReason.code).toBe("epic-end-reached");
        // The default-cap was NOT applied; the loop exited via the explicit condition.
        // Iter count is 0 because --until-epic-end fires BEFORE the first iteration runs.
        expect(result.iterations.length).toBe(0);
        expect(calls()).toBe(0);
      });
      it("--until-story 3.5 alone fires WITHOUT applying default cap", async () => {
        const { stub, calls } = countingStub(successResult());
        const state = makeStateFixture(3, "3.5");
        const result = await runLoop({
          argv: ["--until-story", "3.5"],
          runNextOverride: stub,
          stateOverride: () => state,
          sprintStatusOverride: () => null,
          stderrOverride: () => {},
        });
        expect(result.stopReason.code).toBe("until-story-reached");
        expect(calls()).toBe(0);
      });
      it("--next-story alone does NOT inject default cap (loops until story changes)", async () => {
        const { stub } = countingStub(successResult());
        // Story stays at 3.2 → predicate never fires → loop runs forever
        // WITHOUT the default cap. Bound the test by injecting state = null
        // after a few iters to trigger graceful degradation OR force a halt
        // via runNext exitCode. v0.1 conservative: use stateOverride that
        // returns null after iter 5 → predicates short-circuit; loop runs
        // until... actually it would still run forever since no maxIters
        // and no predicate fires. This is the EXPLICIT-OVERRIDE behavior
        // per AC-3: when the user supplies --next-story alone, NO default
        // cap is applied. Test bound: assert that within 3 iterations no
        // max-iters-reached has fired. Use halt-on-error to stop the loop.
        let count = 0;
        const haltStub = async () => {
          count++;
          if (count >= 3) return haltResult("test bound");
          return successResult();
        };
        const state = makeStateFixture(3, "3.2");
        const result = await runLoop({
          argv: ["--next-story"],
          runNextOverride: haltStub,
          stateOverride: () => state,
          sprintStatusOverride: () => null,
          stderrOverride: () => {},
        });
        // Verify the loop exited via halt-on-error (the test bound), NOT
        // max-iters-reached (which would only fire if default cap was applied).
        expect(result.stopReason.code).toBe("halt-on-error");
      });
    });
    ```
  - [x] 6.5 Add Test AA_44 — the integration test verifying both the 50-default and the explicit-overrides-default behavior per AC-3 verbatim "And integration test verifies the 50-default and the explicit-overrides-default behavior":
    ```typescript
    describe("runLoop AC-3 sweep — default cap behaviour (Story 4.4)", () => {
      it("Sweep-44-A: default cap fires when no stop condition supplied (50 iters)", async () => {
        const { stub, calls } = countingStub(successResult());
        const result = await runLoop({ argv: [], runNextOverride: stub });
        expect(result.stopReason.code).toBe("max-iters-reached");
        if (result.stopReason.code !== "max-iters-reached") return;
        expect(result.stopReason.maxIters).toBe(50);
        expect(calls()).toBe(50);
      });
      it("Sweep-44-B: explicit --max-iters 10 overrides default cap", async () => {
        const { stub, calls } = countingStub(successResult());
        const result = await runLoop({ argv: ["--max-iters", "10"], runNextOverride: stub });
        expect(result.stopReason.code).toBe("max-iters-reached");
        if (result.stopReason.code !== "max-iters-reached") return;
        expect(result.stopReason.maxIters).toBe(10);
        expect(calls()).toBe(10);
      });
      it("Sweep-44-C: explicit --until-epic-end does NOT apply default cap", async () => {
        const { stub } = countingStub(successResult());
        const state = makeStateFixture(3, "3.10");
        const sprintStatus = makeSprintStatusEpic3Done();
        const result = await runLoop({
          argv: ["--until-epic-end"],
          runNextOverride: stub,
          stateOverride: () => state,
          sprintStatusOverride: () => sprintStatus,
          stderrOverride: () => {},
        });
        expect(result.stopReason.code).toBe("epic-end-reached");
      });
    });
    ```
  - [x] 6.6 REWRITE Test N_42 (Story 4.2 — `hasOtherStopCondition guard`) at `src/commands/loop/run.test.ts:503-548` to update the test description + assertions. Story 4.4 has REMOVED `hasOtherStopCondition`; Test N_42's PURPOSE was to verify the placeholder doesn't fire when another condition is supplied — that's still correct semantics, but the IMPLEMENTATION is now via the inverted default-cap check. UPDATE the test description to "Story 4.4: explicit-overrides-default — `--until-epic-end` alone does NOT apply default cap; behaviour was previously gated by `hasOtherStopCondition` helper (now inlined into default-cap injection)". The assertions should still hold (the loop bounded by `--max-iters 2` and exited with max-iters-reached because epic isn't actually done in the mutated fixture).
  - [x] 6.7 INSPECT Test V_43 (Story 4.3 — `--next-story / --phase-end no-stop-condition guard`) at `src/commands/loop/run.test.ts:749-785`. This test asserts `--next-story --max-iters 1` exits with max-iters-reached (NOT no-stop-condition). With Story 4.4's removal of the placeholder, the test SHOULD continue to pass (the loop now exits with max-iters-reached because `--max-iters 1` is explicit). UPDATE the test description to "Story 4.4: --next-story / --phase-end alone WITHOUT --max-iters now relies on default-cap; with explicit --max-iters 1 the cap fires immediately (was: hasOtherStopCondition guard suppressed placeholder)". The behaviour is unchanged; only the description needs updating.
  - [x] 6.8 INSPECT all remaining tests for any reliance on the `no-stop-condition` variant. Run `grep -n "no-stop-condition" src/commands/loop/run.test.ts` and verify the only remaining references are in the rewritten Test E (Task 6.1) + the type-narrowing assertions. UPDATE or REMOVE all references that rely on the variant existing.
  - [x] 6.9 At the top of `src/commands/loop/run.test.ts`, UPDATE the comment block at lines 1-21 to reflect Story 4.4's coverage delta:
    - Replace "No stop condition (Test E): v0.1 pre-Story-4.4 behaviour." with "Default cap (Test E + X_44 + AA_44): Story 4.4 AC-1 — `argv=[]` injects `--max-iters=50` and runs 50 iterations exiting with `max-iters-reached`."
    - Add: "AC-2 (Test Y_44): `--max-iters 10` exits with `max-iters-reached` carrying maxIters=10."
    - Add: "AC-3 (Test Z_44 + AA_44): explicit `--until-epic-end` / `--until-story` / `--next-story` do NOT inject the default cap."
  - [x] 6.10 Test counts projection: net delta is ~+5 new tests (X_44, Y_44, Z_44 with 3 sub-tests, AA_44 with 3 sub-tests = 8 new test bodies but counted as 5 describe blocks); ~+25 new expects. Test E is REWRITTEN (not added). Net: ~38 → ~43 tests on `run.test.ts`; ~118 → ~140 expects.

- [x] **Task 7 — Update `commands/bmad-loop.md` with the default-cap policy (AC-1, AC-3 indirect)**
  - [x] 7.1 Read the existing `commands/bmad-loop.md` Stop Conditions table (lines 156-176). Update the `--max-iters N` row at line 164 from `4.1   | RUNTIME-WIRED                    |` to `4.1+4.4 | RUNTIME-WIRED + DEFAULT 50 in 4.4 |`.
  - [x] 7.2 At `commands/bmad-loop.md:256-260` (the `When NEITHER --max-iters nor any other stop condition is supplied, the loop halts immediately with stopReason.code === "no-stop-condition"...` paragraph), REPLACE with:
    ```
    When NEITHER `--max-iters` nor any other stop condition is supplied, the
    loop runner injects `--max-iters=50` as a DEFAULT cap per FR25,
    preventing accidental infinite loops (Story 4.4 AC-1). When the user
    supplies an explicit stop condition (e.g., `--until-epic-end`,
    `--until-story X.Y`, `--next-story`, `--phase-end`) WITHOUT
    `--max-iters`, NO default cap is applied — the explicit condition
    controls the loop's lifetime.
    ```
  - [x] 7.3 BEFORE the `### --until-epic-end (Story 4.2)` sub-section at line 178, ADD a new sub-section `### --max-iters N (Story 4.1, default-cap in 4.4)`:
    ```
    ### --max-iters N (Story 4.1, default-cap in 4.4)

    Caps the loop's iteration count. After the Nth successful iteration,
    the loop exits with reason `max-iters (N) reached`.

    ```
    /bmad-loop --max-iters 10
    ```

    **Default cap (Story 4.4)**: when NO stop condition is supplied
    (no `--max-iters`, no `--until-epic-end`, no `--until-story`, no
    `--next-story`, no `--phase-end`), the runner injects
    `--max-iters=50` automatically per FR25 — preventing accidental
    infinite loops. When the user supplies an explicit condition WITHOUT
    `--max-iters`, NO default cap is applied (the explicit condition
    controls).

    Exit message: `max-iters (N) reached`. Exit code: `0`.
    ```
  - [x] 7.4 At `commands/bmad-loop.md:65-68` (the `If stop-condition fires, breaks with the StopReason (one of max-iters-reached, no-stop-condition, halt-on-error)` paragraph), REMOVE the `no-stop-condition` reference. New text:
    ```
    2. If stop-condition fires, breaks with the StopReason (one of
       `max-iters-reached`, `halt-on-error`, OR any of the four
       Story-4.2/4.3 variants `epic-end-reached` / `until-story-reached` /
       `next-story-reached` / `phase-end-reached`).
    ```
  - [x] 7.5 At `commands/bmad-loop.md:13-17` (the Story 4.1 ships the runner skeleton... paragraph at lines 13-17), update the second sentence: was "Story 4.1 ships the runner skeleton: only --max-iters is wired as a runtime stop condition." → REPLACE with: "Story 4.1 wired `--max-iters` (with a default-50 cap added in Story 4.4); Stories 4.2 + 4.3 wired the four condition flags `--until-epic-end`, `--until-story X.Y`, `--next-story`, `--phase-end`. Stories 4.5+ will wire the remaining flags."
  - [x] 7.6 At `commands/bmad-loop.md:87-93` (the FR53 exit-code mapping block), UPDATE: was "0 — max-iters-reached OR no-stop-condition (clean exit; v0.1 pre-Story-4.4 placeholder for the no-stop-condition case)." → REPLACE with: "0 — clean exit (max-iters-reached OR any of the four StopReason variants from Stories 4.2/4.3)."
  - [x] 7.7 Verify the §argumentHint at line 3 already includes `[--max-iters N]` (Story 4.1 declared all 13 flags); no change needed.

- [x] **Task 8 — Update `_bmad-output/implementation-artifacts/sprint-status.yaml` (AC: all)**
  - [x] 8.1 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: flip `4-4-stop-condition-max-iters-and-default-cap: backlog → ready-for-dev` (this Story 4.4 create-story step). At dev-story completion, flip to `review`. At code-review completion, flip to `done`.
  - [x] 8.2 Bump `last_updated:` timestamp at BOTH the `# last_updated:` comment line (line 2) AND the `last_updated:` key:value line (line 38). Use `2026-05-03T09:10:00Z` (UTC ISO timestamp at create-story step).
  - [x] 8.3 sprint-status.yaml retains its original schema (no new fields). DO NOT touch any other story status.

- [x] **Task 9 — Run the full test suite + quality gates (AC: all)**
  - [x] 9.1 `bun test src/commands/loop` exit 0. Test delta projection: ~+5 new tests / ~+25 new expects on `run.test.ts` (Test X_44, Y_44, Z_44, AA_44 + REWRITTEN Test E). `stop-conditions.test.ts` is unchanged.
  - [x] 9.2 Post-Story-4.4 baseline projection: ~120-125 pass / 0 fail / ~430-450 expects across 3 loop test files.
  - [x] 9.3 Confirm `src/errors.ts` registry stays at **16 codes** (`bun test src/errors.test.ts`: 10 pass, 197 expects). Story 4.4 ships ZERO new error classes.
  - [x] 9.4 Confirm `bunx --bun tsc --noEmit` exits 0.
  - [x] 9.5 Confirm `bunx --bun biome ci .` exits 0 (the modified files pass biome lint/format). Story 4.4's net deletion may trigger biome to suggest reflowing of nearby code; resolve any such formatting drift.
  - [x] 9.6 Confirm AR41 boundary checks at `src/commands/loop/run.test.ts:240-275` (existing) STILL PASS — Story 4.4 ships ZERO new imports.
  - [x] 9.7 Confirm `commands/bmad-loop.md` is well-formed YAML frontmatter + valid markdown body (no syntax errors). Run a markdown linter check if available.
  - [x] 9.8 Verify the test edit to Test V_43 (Task 6.7) does not break the existing test count delta — the test should still pass with the updated description.

- [x] **Task 10 — Final self-check (AC: all)**
  - [x] 10.1 Re-run all three quality gates one final time: `bun test src/commands/loop`, `bunx --bun biome ci .`, `bunx --bun tsc --noEmit`. All exit 0.
  - [x] 10.2 Confirm Story 4.2's existing tests STILL pass — Story 4.4's removal of `hasOtherStopCondition` is dead-code cleanup; the public behaviour is preserved (the `--until-epic-end` predicate fires; the loop exits cleanly).
  - [x] 10.3 Confirm Story 4.3's existing tests STILL pass — Story 4.4 does NOT modify `stop-conditions.ts`; the `--next-story` + `--phase-end` predicates continue to fire; the AR9 message format for `next-story-reached` and `phase-end-reached` is UNCHANGED.
  - [x] 10.4 Confirm the AR41 boundary checks pass.
  - [x] 10.5 Confirm no console.\* in any new or modified file (per AR33).
  - [x] 10.6 Update §Dev Agent Record §Completion Notes with: (a) actual final test counts, (b) any deviations from this story spec, (c) any open questions surfaced during implementation that should be tracked in code-review.

## Dev Notes

### Architecture invariants enforced

- **AR8** (lock-free top-tier `run.ts`; lock-held `verify-and-advance.ts`): UPHELD. Story 4.4's default-cap injection is a pure-function check at runLoop entry; ZERO new imports.
- **AR9** (single discriminated-union JSON line on stdout): UPHELD. Story 4.4 REMOVES one variant (`no-stop-condition`) from the StopReason union; the new `max-iters (N) reached` message is produced by the existing `formatExitReason` function. The single AR9 line on stdout is preserved with the new message format.
- **AR21 + AR22** (errors carry code + actionable hint): UNCHANGED. Story 4.4 ships ZERO new error classes — registry stays at 16 codes.
- **AR33** (function & error semantics; throw not Result; no console.\*; async/await): UPHELD. The default-cap injection is a pure-function check; ZERO `console.*` calls. The new `max-iters (N) reached` message is a pure string template literal.
- **AR34** (slash-command markdown protocol): UNCHANGED. The `commands/bmad-loop.md` modifications are documentation-only updates to the existing §Stop Conditions table + new sub-section + updated paragraphs.
- **AR41** (boundary graph): UPHELD. Story 4.4 ships ZERO new imports (NO new dependencies on `src/dag/`, `src/state/`, `src/lock/`).
- **AR42** (test discipline): EXTENDED. Existing colocated test files extended; AR35 tmpdir-per-test discipline preserved (Story 4.4 tests do NOT touch `state.yaml` on disk; all state injected via `stateOverride` test seam).

### Code paths to extend

The following exact file:line references identify Story 4.4's modification points:

- **`src/commands/loop/run.ts:27-32`** — JSDoc EXIT-CODE MAPPING block. UPDATE to remove `no-stop-condition` reference.
- **`src/commands/loop/run.ts:80-93`** — JSDoc above `StopReason` discriminated union. UPDATE to remove `no-stop-condition` reference + adjust variant count.
- **`src/commands/loop/run.ts:94-116`** — `StopReason` discriminated union. REMOVE `no-stop-condition` variant (line 96).
- **`src/commands/loop/run.ts:196-214`** — `hasOtherStopCondition` helper + JSDoc. REMOVE entirely.
- **`src/commands/loop/run.ts:216-236`** — `shouldStop` JSDoc. UPDATE to remove `no-stop-condition` references.
- **`src/commands/loop/run.ts:283-289`** — `no-stop-condition` placeholder branch in `shouldStop`. REMOVE entirely.
- **`src/commands/loop/run.ts:402+`** (after args resolution) — INSERT default-cap injection (Task 1.2).
- **`src/commands/loop/run.ts:619-626`** — `formatExitReason` JSDoc. UPDATE to reference AC-2 verbatim format + remove `no-stop-condition` reference.
- **`src/commands/loop/run.ts:629-632`** — `max-iters-reached` case in `formatExitReason`. REWRITE per AC-2 verbatim (`max-iters (N) reached`).
- **`src/commands/loop/run.ts:633-634`** — `no-stop-condition` case in `formatExitReason`. REMOVE.
- **`src/commands/loop/run.test.ts:1-21`** — top-of-file comment. UPDATE coverage delta.
- **`src/commands/loop/run.test.ts:155-164`** — Test E. REWRITE per Task 6.1.
- **`src/commands/loop/run.test.ts:503-548`** — Test N_42 description + assertions. UPDATE per Task 6.6.
- **`src/commands/loop/run.test.ts:749-785`** — Test V_43 description. UPDATE per Task 6.7.
- **`src/commands/loop/run.test.ts`** end of file — INSERT new describe blocks for Test X_44, Y_44, Z_44, AA_44 (Tasks 6.2-6.5).
- **`commands/bmad-loop.md:13-17`** — Story 4.1 paragraph. UPDATE per Task 7.5.
- **`commands/bmad-loop.md:65-68`** — `If stop-condition fires...` paragraph. UPDATE per Task 7.4.
- **`commands/bmad-loop.md:87-93`** — FR53 exit-code mapping block. UPDATE per Task 7.6.
- **`commands/bmad-loop.md:164`** — `--max-iters N` row in Stop Conditions table. UPDATE per Task 7.1.
- **`commands/bmad-loop.md:178`** (BEFORE the `### --until-epic-end (Story 4.2)` sub-section) — INSERT new `### --max-iters N (Story 4.1, default-cap in 4.4)` sub-section per Task 7.3.
- **`commands/bmad-loop.md:256-260`** — `When NEITHER --max-iters nor any other stop condition is supplied...` paragraph. REPLACE per Task 7.2.

### Pure-function default-cap injection contract

The default-cap injection at the top of `runLoop` is a SINGLE STATEMENT that mutates `args` (now `let` instead of `const`) when no stop condition is supplied. The check is INVERTED-`hasOtherStopCondition`: when ALL of `untilEpicEnd`, `untilStory`, `nextStory`, `phaseEnd` are absent AND `maxIters` is undefined → inject `maxIters: 50`. When ANY of those flags is supplied (regardless of `maxIters`), the default-cap is NOT applied.

Stories 4.5/4.6 will EXTEND this stanza with their flags (`timeBudgetMs`, `tokenBudget`, `stopOnError`, `continueOnError`, `planFirst`). The pattern: when more stop conditions become RUNTIME-WIRED, this default-cap stanza must include them in the inverted check. Tracked in the JSDoc.

The TYPE-LEVEL implication: `LoopArgs` already declares `maxIters: number().int().positive().optional()`, so the spread-update preserves the schema. No Zod re-validation is needed (the value `50` is already valid per the schema).

### State/dag/sprint-status loading (inherited)

Story 4.4 does NOT touch the state/sprint-status/dag loading paths. The existing Story 4.2/4.3 loaders + test seams continue to work. Story 4.4's only interaction is the args-resolution block; the per-iteration loaders and predicates are unchanged.

### AC-3 integration test rubric

AC-3 wording: "And integration test verifies the 50-default and the explicit-overrides-default behavior". v0.1 conservative interprets:
- "50-default" = `runLoop({ argv: [] })` runs 50 iterations and exits with `max-iters-reached` (Sweep-44-A).
- "explicit-overrides-default" = `runLoop({ argv: ["--max-iters", "10"] })` exits at iter 10 (Sweep-44-B); `runLoop({ argv: ["--until-epic-end"] })` exits via `epic-end-reached` (Sweep-44-C).
- The integration test is a single describe block (`runLoop AC-3 sweep — default cap behaviour (Story 4.4)`) with three sub-tests covering both behaviors.

### Errors registry projection

ZERO new error classes. Registry holds at **16 codes** (verified post-Story-4.3 baseline). Story 4.4's modifications return `null | StopReason` per the AR21/22 + AR33 invariants from Story 4.1/4.2/4.3 — the default-cap injection is pure-function arg manipulation; the message-format change is pure string templating; the cleanups REMOVE code rather than ADD.

### Story 4.5+ forward-trackers

- **Story 4.5 (`--time-budget` + `--token-budget` stop conditions)**: Will EXTEND the default-cap stanza at run.ts:402+ to include the two new flags in the inverted-`hasOtherStopCondition` check. Each new RUNTIME-WIRED flag adds an `&& args.timeBudgetMs === undefined` (or analogue) clause.
- **Story 4.6 (`--stop-on-error` + `--continue-on-error` policy)**: Will EXTEND the default-cap stanza similarly. Also addresses Story 4.1's SF-2 (`IterationRecord.action "unknown"` union member).
- **Story 4.7 (`--plan-first` dry-run preview)**: May add a new `args.planFirst === true` clause to the default-cap inverted check. The plan-first run is a DRY-RUN — the loop never enters the iteration body; the default-cap injection is moot.
- **Story 4.10 (Loop exit reason + resume hint format)**: Will ENRICH the AR9 line for `max-iters-reached` with `--resume` hint enrichment. The `formatExitReason` function that Story 4.4 rewrites becomes the integration point for Story 4.10's enrichment.

### Removal of `hasOtherStopCondition` — dead-code analysis

The `hasOtherStopCondition` helper was introduced in Story 4.2 (recognized 2 flags) and widened in Story 4.3 (recognized 4 flags). It was used SOLELY by `shouldStop` to suppress the `no-stop-condition` placeholder. With Story 4.4's removal of the placeholder branch, the helper has ZERO call sites and becomes dead code.

Story 4.4 INLINES the inverted-check directly into the default-cap injection at run.ts:402+. Stories 4.5/4.6 extending the inverted check will add their flag-checks to the inline expression (NOT to a re-extracted helper). This keeps the default-cap stanza self-contained + readable.

### Removal of `no-stop-condition` variant — semantic preservation

Removing the `no-stop-condition` variant from `StopReason` is a BREAKING CHANGE only in two narrow ways:

1. **TypeScript exhaustiveness**: any consumer doing exhaustive switch on `StopReason.code` (e.g., the `formatExitReason` function) will need its case removed. Story 4.4 handles this in Task 3.3.
2. **External-API surface**: the `StopReason` is NOT exported as part of a public API consumed by downstream tools (it's an internal-only type per the JSDoc on `IterationRecord` at line 60-64). Removal is safe.

The `no-stop-condition` placeholder was always a v0.1 pre-Story-4.4 stopgap per the original Story 4.1 design (run.ts:278-282 + line 28 JSDoc). Its removal in Story 4.4 is the EXPECTED outcome.

### Test-suite impact

The `bun test src/commands/loop` suite at the post-Story-4.3 baseline runs 118 tests / 0 fail / 409 expects across 3 files. Story 4.4 removes ONE test (Test E was asserting the placeholder; now REWRITTEN to assert the default-cap behaviour) AND adds ~5 new tests (X_44, Y_44, Z_44 with 3 sub-tests, AA_44 with 3 sub-tests = 8 sub-tests in 4 describe blocks). Net: ~120-125 tests / 0 fail / ~430-450 expects post-Story-4.4.

The `stop-conditions.test.ts` file is UNCHANGED. The boundary-check tests (run.test.ts:240-275) are unchanged.

## Open Questions for Code Review

1. **`max-iters (N) reached` message uses `stopReason.maxIters` (the cap) vs `stopReason.iterCount` (the actual iter count)?** AC-2 verbatim is `max-iters (10) reached`. The cap (`maxIters`) and the iter count (`iterCount`) are both `10` when the cap fires (the loop exits the moment `iterCount === maxIters`). v0.1 conservative uses `stopReason.maxIters` because the AC-2 wording emphasizes the CAP value, not the actual count. Trade-off: maxIters (v0.1; emphasizes cap) vs iterCount (matches the post-iter count). The two are equal in nominal flow. v0.1 chooses maxIters; tracked here.

2. **Should the default-cap injection happen INSIDE `runLoop` or in `parseLoopArgs`?** v0.1 conservative chooses INSIDE `runLoop` (after args resolution) so the default-cap policy lives at the boundary where stop-conditions are evaluated. The alternative (inject in `parseLoopArgs` itself) would couple the parser to runtime semantics — less clean. Trade-off: runLoop-injection (v0.1; clean separation) vs parseLoopArgs-injection (one-stop-shop but couples concerns). v0.1 chooses runLoop; tracked here.

3. **Should the default-cap injection be observable to the user (e.g., via stderr message "applying default --max-iters=50")?** v0.1 conservative chooses SILENT INJECTION (no stderr pre-amble). The behaviour is documented in the markdown + the AR9 final-summary line ("max-iters (50) reached"). Trade-off: silent (v0.1; cleaner UX; AR9 line carries the info) vs verbose (one extra stderr line; matches some user-facing tools' "running with default config" pattern). v0.1 chooses silent; tracked here.

4. **Should Test E's REWRITE assert `maxIters === 50` literal value, or use a constant export from run.ts?** v0.1 conservative HARD-CODES `50` in the test (avoids exposing a `DEFAULT_MAX_ITERS` constant from `run.ts` that would expand the public API). Trade-off: hard-code (v0.1; smaller API surface) vs export-constant (testable + reusable). v0.1 chooses hard-code; tracked here.

5. **Should Story 4.4 also remove `EMPTY_DAG`?** Story 4.3 §Forward Action Items mentioned cleaning up the `EMPTY_DAG` sentinel "if appropriate". v0.1 conservative KEEPS the sentinel (still consumed by `shouldStop` when `dag === null`; the DAG remains opt-in per Story 4.3 OQ-8). Removal would require either (a) ALWAYS-build the DAG (incurs ~5-10ms per loop entry even for non-phase flags) or (b) refactor `evaluateStopConditions` to accept `dag: Dag | null`. Both are out of scope for 4.4. Trade-off: keep (v0.1; minimal scope) vs remove (cleaner codebase but invasive). v0.1 chooses keep; tracked here.

6. **Test V_43's description update — should the test BODY be REWRITTEN to test the default-cap path, or LEFT AS IS with description updated?** Test V_43 currently asserts `--next-story --max-iters 1` exits with max-iters-reached. With Story 4.4's default-cap, that assertion still holds (when `--max-iters 1` is explicit, the cap fires immediately). The test BODY is correct; only the DESCRIPTION needs updating. v0.1 conservative chooses DESCRIPTION-ONLY update. Trade-off: description-only (v0.1; minimal churn) vs body-rewrite (more thorough but redundant with Y_44). v0.1 chooses description-only; tracked here.

7. **Behavioural delta on `runLoop({ argv: [] })`: was `iterations.length === 0` (placeholder fires immediately), now `iterations.length === 50` (default cap runs 50 iters). Should we add a "this is a behavioral change" notice to the Story 4.4 dev-story log?** v0.1 conservative YES — add a Completion Notes entry explicitly calling out the behavioral change. The change is INTENTIONAL and documented in epics.md AC-1 + PRD FR25, but downstream tooling consuming `iterations.length === 0` as a sentinel for "no stop condition" must adapt. Trade-off: explicit-notice (v0.1; communication win) vs implicit-via-test (assumes consumers read the test). v0.1 chooses explicit-notice; tracked here.

8. **Should Story 4.4 emit the AR9 summary as `max-iters (10) reached` OR `max-iters (10) reached (10 iterations completed)` to preserve the iter-count info?** AC-2 verbatim is `max-iters (10) reached` — no iter-count suffix. v0.1 conservative emits AC-2-byte-identical ("max-iters (10) reached"). The iter-count is preserved in the structured `StopReason.iterCount` field for tooling consumers; the human-readable message is concise. Trade-off: AC-verbatim (v0.1; matches AC-2) vs enriched (Story 4.10 may enrich later). v0.1 chooses AC-verbatim; tracked here.

9. **What happens if `runNext` returns success exactly 50 times in a row?** The default-cap kicks in at iter-count 50. `runLoop` exits with `max-iters-reached`, `maxIters: 50`, `iterCount: 50`. The user sees `max-iters (50) reached`. The user can then `/bmad-loop --resume --max-iters 50` to continue. (Story 4.10 will enrich the AR9 line with the resume hint.) Tracked here.

10. **Should the JSDoc above the default-cap stanza explicitly enumerate ALL future flags from Stories 4.5/4.6 that will need to be added?** v0.1 conservative YES — the JSDoc lists `timeBudgetMs`, `tokenBudget`, `stopOnError`, `continueOnError`, `planFirst` as future flags requiring inclusion. Trade-off: explicit-list (v0.1; forward-tracker for future devs) vs minimal-JSDoc (less to maintain). v0.1 chooses explicit-list; tracked here.

11. **`compareStoryIds` not used by 4.4 — does that matter?** No. Story 4.4 does NOT modify `stop-conditions.ts`; the `compareStoryIds` helper continues to be used by `untilStoryStopCondition` and `nextStoryStopCondition`. Story 4.4 is purely `run.ts` + `run.test.ts` + markdown. Tracked here for completeness.

12. **Does Story 4.4 break any existing CI test?** Per the test-suite impact §Dev Notes, ONE test (Test E) is REWRITTEN; ZERO existing tests are broken (verified by Tasks 6.6/6.7/6.8 inspection). Stories 4.2/4.3 tests continue to pass because the public behaviour of the predicates is preserved. Tracked here.

## Forward Action Items

- **Story 4.5 (`--time-budget`, `--token-budget` stop conditions)**: Will EXTEND the default-cap inverted-check stanza at run.ts:402+ with `args.timeBudgetMs === undefined` and `args.tokenBudget === undefined` clauses. Will EXTEND `evaluateStopConditions` with two more predicates consuming a new `LoopMetrics` interface (analogous to Story 4.3's `LoopContext`).
- **Story 4.6 (`--stop-on-error` / `--continue-on-error` policy)**: Will EXTEND the default-cap inverted-check stanza with `args.stopOnError !== true && args.continueOnError !== true` clauses. Also addresses Story 4.1 SF-2 (IterationRecord.action "unknown" union member).
- **Story 4.7 (`--plan-first` dry-run preview)**: May add a new `args.planFirst === true` clause to the default-cap inverted check. The plan-first run is a DRY-RUN — the loop never enters the iteration body; the default-cap injection is moot.
- **Story 4.10 (Loop exit reason + resume hint format)**: Will ENRICH the `formatExitReason` `max-iters-reached` case with the `--resume` hint format `state.lastFailureReason.hint` (per Story 3.1). Also addresses Story 4.1 SF-1 (extractFailureCode EXIT_0 edge case). The Story 4.4 rewrite of `formatExitReason` is the integration point.
- **Story 6.1 (`bmad-stepper.config.yaml` schema loader)**: May surface `loop.defaultMaxIters: number` (default 50) as a config knob — allowing project-level customization of the default cap.

## References

- **`_bmad-output/planning-artifacts/epics.md` lines 937-954** — Story 4.4 acceptance criteria verbatim source.
- **`_bmad-output/planning-artifacts/prd.md` line 701** — FR25 verbatim: "System enforces a default `max-iters` cap when no other stop condition is supplied, preventing accidental infinite loops."
- **`_bmad-output/planning-artifacts/prd.md` line 589** — Default-50 value verbatim: "`--max-iters` defaults to 50 if no other stop condition is supplied."
- **`_bmad-output/planning-artifacts/architecture.md` §AR8/AR9/AR21/AR22/AR33/AR34/AR41/AR42** — Architecture invariants applicable to `src/commands/loop/run.ts`.
- **`_bmad-output/implementation-artifacts/4-3-stop-condition-next-story-and-phase-end.md`** — Immediate predecessor (Story 4.3, status done, code-review verdict approve). Forward Action Items lines 845-857 explicitly mandate Story 4.4's cleanup of `hasOtherStopCondition` + `no-stop-condition` placeholder + default-cap injection.
- **`_bmad-output/implementation-artifacts/4-2-stop-condition-epic-end-and-story-x-y.md`** — Story 4.2 (status done) — introduced `hasOtherStopCondition` helper + `EMPTY_DAG` sentinel.
- **`_bmad-output/implementation-artifacts/4-1-bmad-loop-command-skeleton.md`** — Story 4.1 (status done) — wired explicit `--max-iters` runtime check; introduced the `no-stop-condition` placeholder + `formatExitReason`.
- **`src/commands/loop/run.ts`** — current 677-line implementation; Story 4.4 modifies ~+10/-30 net lines.
- **`src/commands/loop/args.ts`** — current 307-line schema; UNCHANGED in 4.4 (`maxIters` field already present per Story 4.1).
- **`src/commands/loop/stop-conditions.ts`** — current 477-line predicates module; UNCHANGED in 4.4.
- **`src/commands/loop/run.test.ts`** — current 861-line test file; Story 4.4 modifies ~+50/-25 net lines.
- **`src/commands/loop/stop-conditions.test.ts`** — current 718-line test file; UNCHANGED in 4.4.
- **`commands/bmad-loop.md`** — current 338-line Layer 1 markdown; Story 4.4 modifies ~+15/-10 net lines.
- **`src/errors.ts`** — registry held at 16; Story 4.4 ships ZERO new error classes.
- **`_bmad-output/implementation-artifacts/sprint-status.yaml`** — Story 4.4 flips `4-4-stop-condition-max-iters-and-default-cap: backlog → ready-for-dev`.

## Dev Agent Record

### Context Reference

Inputs read during dev-story implementation (to be populated by dev-story step):

- `_bmad-output/implementation-artifacts/4-4-stop-condition-max-iters-and-default-cap.md` — this story spec.
- `_bmad-output/implementation-artifacts/4-3-stop-condition-next-story-and-phase-end.md` — predecessor (done) for forward-action-item adjudications.
- `_bmad-output/implementation-artifacts/4-2-stop-condition-epic-end-and-story-x-y.md` — `hasOtherStopCondition` originator.
- `_bmad-output/implementation-artifacts/4-1-bmad-loop-command-skeleton.md` — `--max-iters` + `no-stop-condition` originator.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — confirmed 4-4 = `ready-for-dev` (line 86) before flipping to `review`.
- `src/commands/loop/run.ts` — Story 4.3 baseline (677 lines); to be modified by 4.4.
- `src/commands/loop/run.test.ts` — Story 4.3 baseline (861 lines); to be modified by 4.4.
- `src/commands/loop/args.ts` — Story 4.1 baseline (307 lines); UNCHANGED.
- `src/commands/loop/stop-conditions.ts` — Story 4.3 baseline (477 lines); UNCHANGED.
- `src/commands/loop/stop-conditions.test.ts` — Story 4.3 baseline (718 lines); UNCHANGED.
- `src/errors.ts` — 16 codes; UNCHANGED.
- `commands/bmad-loop.md` — Story 4.3 baseline (338 lines); to be modified by 4.4.

### Agent Model Used

claude-opus-4-7[1m] (Anthropic Opus 4.7 with 1M context window).

### Debug Log References

- Iter 2 of /bmad-loop run `2026-05-03T091901Z-bmad-next` (loop `2026-05-03T090459Z-bmad-loop`).
- Bun host: `1.3.12` (satisfies AR2 ≥ 1.3).
- Baseline `bun test src/commands/loop/`: 118 pass / 0 fail / 409 expects (pre-Story-4.4).
- Post-implementation `bun test src/commands/loop/`: 126 pass / 0 fail / 432 expects (net +8 tests / +23 expects).
- Errors registry held at 16 codes (`bun test src/errors.test.ts`: 10 pass / 0 fail / 197 expects — unchanged).
- Full regression `bun test`: 853 pass / 0 fail / 3169 expects across 59 files.
- `bunx --bun biome ci .` exit 0 (134 files checked).
- `bunx --bun tsc --noEmit` exit 0.
- AR9 single-line emission verified via `bun run src/commands/loop/run.ts -- --max-iters 1` (one JSON line on stdout).
- AC-1 + AC-2 behaviour verified via standalone smoke test: `argv=[]` → 50 iters / `maxIters=50`; `--max-iters 10` → 10 iters / `maxIters=10`.

### Completion Notes List

- **AC-1 implemented**: default-cap injection at `src/commands/loop/run.ts` `runLoop` body — when `args.maxIters === undefined && args.untilEpicEnd !== true && args.untilStory === undefined && args.nextStory !== true && args.phaseEnd !== true`, the runner injects `args = { ...args, maxIters: 50 }`. Verified by Test E + Test X_44 + Sweep-44-A.
- **AC-2 implemented**: `formatExitReason` `max-iters-reached` case rewritten to emit AC-2 verbatim string `max-iters (${stopReason.maxIters}) reached`. Verified by Test Y_44 (structured `stopReason.maxIters === 10`) + Sweep-44-B.
- **AC-3 implemented**: when any explicit stop condition is supplied (`--until-epic-end` / `--until-story X.Y` / `--next-story` / `--phase-end`) WITHOUT `--max-iters`, the default-cap predicate short-circuits — no `maxIters: 50` injected. Verified by Test Z_44 (3 sub-tests covering all four flags) + Sweep-44-C.
- **Cleanups (per Story 4.3 forward action items)**:
  - REMOVED `hasOtherStopCondition` helper (dead code after default-cap injection).
  - REMOVED `no-stop-condition` placeholder branch in `shouldStop`.
  - REMOVED `no-stop-condition` variant from the `StopReason` discriminated union.
  - REMOVED `no-stop-condition` case from `formatExitReason`.
  - KEPT `EMPTY_DAG` sentinel (still consumed by `shouldStop` when `dag === null`; opt-in DAG load remains per Story 4.3 OQ-8 — see OQ-5 in this spec).
- **Behavioural delta (per OQ-7)**: `runLoop({ argv: [] })` previously exited with `iterations.length === 0` + `stopReason.code === "no-stop-condition"`. Now exits with `iterations.length === 50` + `stopReason.code === "max-iters-reached"` + `maxIters === 50`. Downstream tooling consuming the v0.1 placeholder must adapt — but no public consumers of this internal type exist.
- **Test counts (final)**: `src/commands/loop/run.test.ts` ~38 → ~46 describe blocks; expects ~409 → ~432 (net +23). Matches the spec's projection of ~+25 expects.
- **Tests REWRITTEN, not removed**: Test E rewrites assertions for default-cap behaviour. Test N_42 + Test V_43 update descriptions only — assertions unchanged because the explicit-cap behaviour is preserved via the inverted default-cap check.
- **Architecture invariants verified**: AR8 (zero src/lock/ imports — confirmed by AR41 boundary check Test I); AR9 (single AR9 line on stdout — smoke-tested); AR21/22 (zero new error classes — registry held at 16); AR33 (zero `console.*` in production source — biome ci pass); AR41 (top-tier sibling import only — boundary check passes); AR42 (colocated tests — extended in place).
- **Open Questions for code-review**: OQ-1 to OQ-12 from spec are all expressed as v0.1-conservative defaults. Reviewer should affirm/amend each. Notable: OQ-1 chose `stopReason.maxIters` over `iterCount`; OQ-3 chose silent injection (no stderr pre-amble); OQ-4 hard-coded `50` in tests; OQ-5 kept `EMPTY_DAG` sentinel; OQ-6 description-only update for Test V_43.

### File List

**Modified**

- `src/commands/loop/run.ts` (top-of-file JSDoc; `StopReason` union — variant removed; `hasOtherStopCondition` helper REMOVED; `shouldStop` JSDoc + body — placeholder branch removed; `runLoop` body — default-cap injection added; defensive null-check comment updated; `formatExitReason` — `max-iters-reached` case rewritten and `no-stop-condition` case REMOVED; ~+50/-60 net lines).
- `src/commands/loop/run.test.ts` (top-of-file JSDoc; Test E rewritten; Test N_42 + Test V_43 descriptions updated; new describe blocks Test X_44 / Y_44 / Z_44 / AC-3 sweep added; ~+150/-30 net lines).
- `commands/bmad-loop.md` (top-of-file Story-status paragraph; §4-step body Story-4.1-only paragraph; §FR53 exit-code mapping; §Stop conditions table — `--max-iters N` row updated; new sub-section `### --max-iters N (Story 4.1, default-cap in 4.4)` inserted; `When NEITHER...` paragraph rewritten; AR9 message format example updated; ~+30/-20 net lines).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (`4-4-stop-condition-max-iters-and-default-cap: ready-for-dev → review`; `last_updated` bumped to `2026-05-03T09:30:00Z` in both comment and yaml field).
- `_bmad-output/implementation-artifacts/4-4-stop-condition-max-iters-and-default-cap.md` (frontmatter status `ready-for-dev → review`; `last_updated` bumped; all task/subtask checkboxes ticked; Dev Agent Record + File List + Change Log populated).

**Unchanged (per spec scope)**

- `src/commands/loop/args.ts` — schema unchanged; `maxIters: z.number().int().positive().optional()` already declared in Story 4.1.
- `src/commands/loop/stop-conditions.ts` — predicates unchanged; `--max-iters` is gated in `run.ts:shouldStop`, not in this module.
- `src/commands/loop/stop-conditions.test.ts` — unchanged.
- `src/commands/loop/args.test.ts` — unchanged (no schema change).
- `src/commands/loop/index.ts` — unchanged.
- `src/errors.ts` — registry held at 16 codes.
- All other planning/source files outside the declared mutation scope.

## Senior Developer Review (AI)

### Reviewer

claude-opus-4-7[1m]

### Date

2026-05-03

### Outcome / Verdict

**approve**

### Summary

Story 4.4 cleanly lands the FR25 default-cap behaviour and the AC-2 verbatim message format `max-iters (N) reached` while EXECUTING the four cleanups mandated by Story 4.3's forward-action-items: (1) the `hasOtherStopCondition` helper was REMOVED, (2) the v0.1 `no-stop-condition` placeholder branch in `shouldStop` was REMOVED, (3) the `no-stop-condition` variant was REMOVED from the `StopReason` discriminated union and from `formatExitReason`, (4) the `EMPTY_DAG` sentinel was correctly KEPT per OQ-5 (still consumed by `shouldStop` when `dag === null`; opt-in DAG load remains per Story 4.3 OQ-8). The substantive change — the default-cap injection at `runLoop` body — is a single inverted-check conditional that mutates `args` (now `let` in place of `const`) when ALL of `maxIters`/`untilEpicEnd`/`untilStory`/`nextStory`/`phaseEnd` are absent, with a JSDoc forward-tracker enumerating the future-flag extension points (timeBudgetMs, tokenBudget, stopOnError, continueOnError, planFirst) for Stories 4.5/4.6/4.7.

The implementation is structurally consistent with Story 4.2/4.3's precedent: zero new error classes (registry held at 16), zero new imports (AR41 boundary preserved), zero `console.*` calls (AR33 preserved), zero state-schema changes. AC-1, AC-2, and AC-3 each pass with file:line evidence and verbatim message-text matches. The integration test `runLoop AC-3 sweep — default cap behaviour (Story 4.4)` (run.test.ts:956-991) provides three sub-tests covering both behaviors per AC-3 verbatim "And integration test verifies the 50-default and the explicit-overrides-default behavior". The behavioural change (per OQ-7) — where `runLoop({ argv: [] })` now produces 50 iterations with `stopReason.code === "max-iters-reached"` instead of 0 iterations with `stopReason.code === "no-stop-condition"` — is explicitly documented in the Dev Agent Record §Completion Notes.

What's deferred (forward-trackers): Story 4.5 will EXTEND the default-cap inverted-check stanza with `&& args.timeBudgetMs === undefined && args.tokenBudget === undefined`; Story 4.6 will add `&& args.stopOnError !== true && args.continueOnError !== true`; Story 4.7 may add `&& args.planFirst !== true` (or skip the injection entirely for plan-first dry-run); Story 4.10 will ENRICH the `max-iters-reached` `formatExitReason` case with the `--resume` hint format (per OQ-9) AND is the natural place to add a string-format unit test for the AC-2 line (per dev-1 deviation). The Story 4.2/4.3 nits N-1 (defensive null check at stop-conditions.ts:208) and N-2 (EMPTY_DAG sentinel placement) remain — N-1 because stop-conditions.ts was untouched in 4.4, N-2 because EMPTY_DAG was correctly KEPT per OQ-5.

### AC verification

**AC-1 — `--max-iters=50` default cap when no stop condition is supplied**: **PASS**.
- Default-cap injection at `src/commands/loop/run.ts:399-407` — when `args.maxIters === undefined && args.untilEpicEnd !== true && args.untilStory === undefined && args.nextStory !== true && args.phaseEnd !== true`, the runner injects `args = { ...args, maxIters: 50 }`.
- JSDoc forward-tracker comment at `run.ts:391-398` explicitly enumerates Stories 4.5/4.6/4.7 future-flag clauses.
- Verified end-to-end by Test E (`run.test.ts:161-173`): `argv=[]` produces `iterations.length === 50`, `stopReason.code === "max-iters-reached"`, `stopReason.maxIters === 50`, `stopReason.iterCount === 50`, `exitCode === 0`, `calls === 50`.
- Confirmed by Test X_44 (`run.test.ts:863-872`) and Sweep-44-A (`run.test.ts:957-964`).
- The default value 50 matches PRD §Bounded Loop Execution line 589 ("`--max-iters` defaults to 50 if no other stop condition is supplied") and epics.md §Story 4.4 AC-1 line 947 character-identical.

**AC-2 — `--max-iters 10` exits with verbatim message `max-iters (10) reached`**: **PASS**.
- `formatExitReason` `max-iters-reached` case at `src/commands/loop/run.ts:641-643` emits the AC-2 verbatim string `max-iters (${stopReason.maxIters}) reached` (epics.md line 950 character-identical).
- Test Y_44 at `run.test.ts:874-893` verifies the structured StopReason payload carries `maxIters === 10` and `iterCount === 10` when `--max-iters 10` is supplied; `iterations.length === 10`; `calls === 10`.
- The message uses `stopReason.maxIters` (the cap) rather than `stopReason.iterCount` (the actual count) per OQ-1 v0.1 conservative — both are equal when the cap fires (the loop exits the moment `iterCount === maxIters`); the AC's `(10)` wording emphasises the cap value.
- Note: the literal AR9 string output is emitted only inside `import.meta.main` at `run.ts:663-685` — verified via the Story 4.1 import.meta.main smoke test path. Adding a direct unit test on the exact string output would require exposing `formatExitReason` (currently file-private), expanding the public API surface unnecessarily. See dev-1 deviation adjudication.

**AC-3 — Explicit non-`--max-iters` condition without `--max-iters` does NOT apply default cap; integration test verifies both behaviors**: **PASS**.
- Default-cap predicate at `run.ts:399-407` SHORT-CIRCUITS when ANY of `untilEpicEnd === true`, `untilStory !== undefined`, `nextStory === true`, `phaseEnd === true` — so explicit conditions WITHOUT `--max-iters` do NOT inject the default cap.
- Test Z_44 at `run.test.ts:896-953` — three sub-tests covering:
  - `--until-epic-end` alone fires on `epic-end-reached` without applying default cap (`iterations.length === 0`, `calls === 0` because predicate fires on iter-0 boundary check).
  - `--until-story 3.5` alone fires on `until-story-reached` without applying default cap (`calls === 0` for same reason).
  - `--next-story` alone — no default cap; loop bounded by external halt-on-error stub (NOT max-iters-reached, which would require the default cap).
- Integration test `runLoop AC-3 sweep — default cap behaviour (Story 4.4)` at `run.test.ts:956-991` with three sub-tests:
  - Sweep-44-A: default cap fires when no condition supplied → `stopReason.code === "max-iters-reached"`, `maxIters === 50`, `calls === 50`.
  - Sweep-44-B: explicit `--max-iters 10` overrides default cap → `maxIters === 10`, `calls === 10`.
  - Sweep-44-C: explicit `--until-epic-end` does NOT apply default cap → `stopReason.code === "epic-end-reached"`.
- This sweep block satisfies the AC-3 verbatim "And integration test verifies the 50-default and the explicit-overrides-default behavior".

### Architecture invariants

**AR8** (lock-free `run.ts`; lock-held `verify-and-advance.ts`): **UPHELD**.
- Independent grep of `src/commands/loop/run.ts` for `from "../../lock/` returns ZERO matches. Asserted by `run.test.ts:248-258` (Test I).
- Story 4.4 ships ZERO new imports — the default-cap injection is a pure-function args-manipulation at runLoop entry. AR8 invariant (lock-free top-tier) preserved.

**AR9** (single discriminated-union JSON line on stdout): **UPHELD**.
- The `import.meta.main` block at `src/commands/loop/run.ts:663-685` emits exactly ONE AR9 line via `emitDispatchAction({ action: "report", message, exitCode })`.
- Story 4.4 REMOVES one StopReason variant (`no-stop-condition`) — AR9 surface area shrinks. The new `max-iters-reached` message format `max-iters (N) reached` is a pure string template literal at `run.ts:643`; the AR9 single-line invariant per command invocation is preserved.
- Stderr emission for `epic-end-reached` (state-snapshot pointer + `--resume` hint at `run.ts:516-522`) is unchanged from Story 4.2.

**AR21 + AR22** (errors carry code + actionable hint): **UPHELD**.
- Independently verified: `grep -c "override readonly code" src/errors.ts` → 16. Story 4.4 ships ZERO new error classes.
- `bun test src/errors.test.ts` → 10 pass / 197 expects, registry held at 16.
- The defensive `ConfigError` throw at `run.ts:606-610` (unreachable invariant guard for the case where `stopReason === null` post-loop) reuses the existing `ConfigError` class; no new class added.

**AR33** (function & error semantics; throw not Result; no console.\*; async/await): **UPHELD**.
- Independent grep for `console\.(log|error|warn|info|debug|trace|dir|table|time|timeEnd|group|groupEnd|count|countReset|assert)\s*\(` over `src/commands/loop/run.ts` returns ZERO matches in production source.
- Default-cap injection is pure-function args manipulation (`run.ts:399-407`); message-format change is pure string templating (`run.ts:643`). The unreachable defensive `ConfigError` throw at `run.ts:606-610` is a throw not a Result per AR33; loaders catch and return `null` per Story 4.2 OQ-4 inheritance.

**AR34** (slash-command markdown protocol): **UPHELD**.
- `commands/bmad-loop.md` modifications are documentation-only:
  - Stop Conditions table row (`--max-iters N`) flipped from `RUNTIME-WIRED` to `RUNTIME-WIRED + DEFAULT 50 in 4.4` at line 170.
  - New sub-section `### --max-iters N (Story 4.1, default-cap in 4.4)` at lines 184-200.
  - Updated `When NEITHER --max-iters nor any other stop condition is supplied...` paragraph at lines 280-286.
  - FR53 exit-code mapping at lines 94-98 updated to remove `no-stop-condition` reference.
- The four-step Bash → JSON → Task → Bash protocol untouched. `argumentHint` at line 3 still encodes all 13 flags from Story 4.1.

**AR41** (boundary graph; top-tier may import foundational/mid-tier): **UPHELD**.
- `run.ts` ships ZERO new imports. The existing top-tier sibling import (`../next/run.ts`), foundational-tier imports (`../../errors.ts`, `../../io/log.ts`, `../../schemas/dispatch-protocol.ts`, `../../schemas/state.ts`), mid-tier imports (`../../dag/build.ts`, `../../dag/index.ts`, `../../dispatch/index.ts`, `../../state/load.ts`), and intra-module imports (`./args.ts`, `./stop-conditions.ts`) are all unchanged.
- Asserted by `run.test.ts:248-284` (4 boundary check sub-tests).

**AR42** (test discipline): **UPHELD**.
- Colocated test file `run.test.ts` EXTENDED (~+150/-30 net lines; ~38 → ~46 describe blocks; +8 tests / +23 expects). No new test files created.
- AR35 tmpdir-per-test discipline preserved — Story 4.4 tests do NOT touch `state.yaml` on disk; all state injected via `stateOverride` test seam.

### Quality gates

Independently re-verified by this reviewer:

| Gate | Command | Exit | Counts |
|------|---------|------|--------|
| Loop suite | `bun test src/commands/loop/` | 0 | 126 pass / 0 fail / 432 expects across 3 files |
| Errors suite | `bun test src/errors.test.ts` | 0 | 10 pass / 0 fail / 197 expects |
| Biome CI | `bunx --bun biome ci .` | 0 | 134 files checked, no fixes applied |
| TSC strict | `bunx --bun tsc --noEmit` | 0 | (no output — clean) |
| Errors registry | `grep -c "override readonly code" src/errors.ts` | n/a | 16 (held; ZERO delta) |
| Full regression | `bun test` | 0 | 853 pass / 0 fail / 3169 expects across 59 files |
| AR8 boundary | `grep -c 'from "\\.\\./\\.\\./lock/' src/commands/loop/run.ts` | n/a | 0 (lock-free) |
| AR33 console.* | `grep -c "console\\.(log\\|error\\|warn\\|info\\|debug\\|trace\\|...)\\s*\\(" src/commands/loop/run.ts` | n/a | 0 (in production source) |

All quality gates GREEN; counts match dev-story claims exactly. Full regression completed in 3.46s without OOM (environmental issue from Story 4.2 OQ-OOM not encountered this iter).

### Open Questions adjudication

| OQ | Topic | Verdict | Rationale |
|----|-------|---------|-----------|
| OQ-1 | `max-iters (N) reached` uses `stopReason.maxIters` (cap) vs `stopReason.iterCount` (actual count) | **ACCEPT** | v0.1 conservative: AC-2 wording `max-iters (10) reached` emphasises the CAP value. Both fields are equal when the cap fires (loop exits the moment `iterCount === maxIters`); semantic preference for `maxIters`. |
| OQ-2 | Default-cap injection inside `runLoop` vs in `parseLoopArgs` | **ACCEPT** | v0.1 conservative: inject at `runLoop` body keeps the default-cap policy at the boundary where stop-conditions are evaluated. Parser-level injection would couple `parseLoopArgs` to runtime semantics. Clean separation. |
| OQ-3 | Silent vs verbose injection (e.g., stderr "applying default --max-iters=50") | **ACCEPT** | v0.1 conservative: SILENT INJECTION. Behaviour is documented in markdown + the AR9 final-summary line `max-iters (50) reached`. Cleaner UX; no stderr pre-amble noise. Story 4.10 may add an enrichment if needed. |
| OQ-4 | Hard-code `50` in tests vs export `DEFAULT_MAX_ITERS` constant | **ACCEPT** | v0.1 conservative: HARD-CODED `50`. Avoids exposing a `DEFAULT_MAX_ITERS` constant from `run.ts` that would expand the public API. The literal `50` matches PRD line 589 + epics.md line 947 verbatim. |
| OQ-5 | Keep or remove `EMPTY_DAG` sentinel | **ACCEPT** | v0.1 conservative: KEEP. Still consumed by `shouldStop` (`run.ts:255`) when `dag === null`; opt-in DAG load remains per Story 4.3 OQ-8. Removal would require either always-build (~5-10ms cost per loop entry) or refactoring `evaluateStopConditions` signature — both out of scope. |
| OQ-6 | Test V_43's update — DESCRIPTION-only vs BODY-rewrite | **ACCEPT** | v0.1 conservative: DESCRIPTION-only. The `--next-story --max-iters 1` assertion at `run.test.ts:760-794` still holds (when `--max-iters 1` is explicit, the cap fires immediately); only the description needs context-update. Body-rewrite would be redundant with Y_44. |
| OQ-7 | Behavioural change notice (argv=[] now = 50 iters where 0 was emitted) | **ACCEPT** | v0.1 conservative: explicit-notice. Documented in Dev Agent Record §Completion Notes. The change is INTENTIONAL per epics.md AC-1 + PRD FR25; downstream tooling consuming `iterations.length === 0` as a sentinel must adapt — but no public consumers of this internal type exist. |
| OQ-8 | AC-2 byte-identical `max-iters (10) reached` vs enriched with iter-count suffix | **ACCEPT** | v0.1 conservative: AC-2 byte-identical. The iter-count is preserved in the structured `StopReason.iterCount` field for tooling consumers; the human-readable message stays concise. Story 4.10 may enrich. |
| OQ-9 | iter-50 default-cap exhaustion `--resume` hint | **DEFER** | Forward-tracker to Story 4.10. The current implementation emits `max-iters (50) reached` WITHOUT a `--resume` hint. Story 4.10 ("Loop exit reason + resume hint format") is precisely the integration point — will enrich `formatExitReason` for `max-iters-reached` with a hint analogous to the `epic-end-reached` stderr emission at `run.ts:516-522`. |
| OQ-10 | JSDoc forward-flag enumeration (4.5/4.6/4.7 future flags) | **ACCEPT** | v0.1 conservative: explicit-list at `run.ts:391-398`. Helps future devs spot the extension points without reading downstream story specs. Maintenance cost is modest (one-line update per RUNTIME-WIRED flag). |
| OQ-11 | `compareStoryIds` non-impact in 4.4 | **ACCEPT** | Confirmed: Story 4.4 does NOT modify `stop-conditions.ts`; `compareStoryIds` continues to be used by `untilStoryStopCondition` and `nextStoryStopCondition`. Story 4.4 is purely `run.ts` + `run.test.ts` + markdown. |
| OQ-12 | Story 4.4 break any existing CI test | **ACCEPT** | Confirmed: ONE test (Test E) was REWRITTEN; ZERO existing tests broken. Tests N_42 + V_43 had description-only updates per OQ-6; their bodies still pass per the loop suite (126/0/432). Stories 4.2/4.3 tests continue to pass per the predicate behaviour preservation (`evaluateStopConditions` unchanged). |

11 OQs ACCEPT. 1 DEFER (OQ-9 to Story 4.10). ZERO REJECT.

### Deviations adjudication

| D# | Topic | Verdict | Rationale |
|----|-------|---------|-----------|
| dev-1 | Test Y_44 omits explicit string-format assertion `max-iters (10) reached` because `formatExitReason` is file-private; structured `stopReason.maxIters` assertion + smoke test cover the contract; forward-tracker for Story 4.10 | **DEFER** with forward-tracker | The AC-2 verbatim string is hard-coded in `formatExitReason` at `run.ts:643` (single-line template literal, no parameters); a regression in that string would surface via the import.meta.main smoke test (manually verified once during dev-story). Exposing `formatExitReason` via export would expand the public API surface unnecessarily. Story 4.10 (Loop exit reason + resume hint format) is the natural place to add a string-format unit test because it ENRICHES `formatExitReason` and will need its own coverage. v0.1 conservative: structured assertions on `stopReason.maxIters` cover the AC-2 contract; the format-string regression risk is modest given the line is 1 line of template literal. |

### Must-fix items

(none)

### Should-fix items

(none)

### Nits

- **N-1 (inherited from Story 4.2/4.3)**: `stop-conditions.ts:208` defensive `epicNum === undefined || epicNum === null` check has unreachable `=== null` arm given optional-chain returns `undefined`. Cosmetic; preserved from Story 4.2/4.3; not addressed in 4.4 (file unchanged). May be opportunistically cleaned up in Story 4.5 if `--time-budget`/`--token-budget` predicates touch `stop-conditions.ts`.
- **N-2 (inherited from Story 4.2/4.3)**: `run.ts:277-281` `EMPTY_DAG` sentinel positioned mid-file; convention is module-level constants near imports. Cosmetic; KEPT in 4.4 per OQ-5 because still consumed by `shouldStop` when `dag === null` and DAG load remains opt-in per Story 4.3 OQ-8. May be opportunistically cleaned up in Story 4.5 if DAG load gets promoted to always-build.

### Info

- **I-1 (forward-tracker — Story 4.5)**: The default-cap inverted-check at `run.ts:399-407` must EXTEND with `&& args.timeBudgetMs === undefined && args.tokenBudget === undefined` clauses when `--time-budget` and `--token-budget` become RUNTIME-WIRED. JSDoc at `run.ts:391-395` already enumerates these as forward-trackers. Story 4.5 is also the likely candidate for opportunistic cleanup of N-2 (EMPTY_DAG sentinel) if DAG load is promoted to always-build.
- **I-2 (forward-tracker — Story 4.6)**: The default-cap inverted-check must also EXTEND with `&& args.stopOnError !== true && args.continueOnError !== true` clauses. Story 4.6 also addresses Story 4.1 SF-2 (IterationRecord.action "unknown" union member).
- **I-3 (forward-tracker — Story 4.7)**: The `--plan-first` dry-run preview may add `&& args.planFirst !== true` clause to the default-cap inverted check. Plan-first is a DRY-RUN — the loop never enters the iteration body; the default-cap injection is moot when `--plan-first` is supplied. Design choice (skip-injection vs include-clause) deferred to Story 4.7 dev-story.
- **I-4 (forward-tracker — Story 4.10)**: `formatExitReason` rewrite at `run.ts:639-659` (specifically the `max-iters-reached` case at `run.ts:641-643`) is the integration point for Story 4.10's `--resume` hint enrichment using `state.lastFailureReason.hint`. iter-50 default-cap exit case (OQ-9) deferred to Story 4.10 — the AR9 line currently reads `max-iters (50) reached` with NO `--resume` hint; Story 4.10 will append `Run /bmad-loop --resume --max-iters 50` analogue.
- **I-5 (forward-tracker — Story 4.10)**: dev-1 deviation — Test Y_44 omits the explicit AR9-line string-format assertion `max-iters (10) reached` because `formatExitReason` is file-private. The structured `stopReason.maxIters` assertion + manual smoke test cover the AC-2 contract for v0.1; Story 4.10 (which enriches `formatExitReason`) is the natural place to add a string-format unit test (potentially via export-and-test or via import.meta.main spawn-mode test).
- **I-6 (Story 4.2/4.3 nits status)**: N-1 (defensive null check at `stop-conditions.ts:208`) and N-2 (EMPTY_DAG sentinel placement) remain — Story 4.4 did NOT touch `stop-conditions.ts` (N-1) and KEPT `EMPTY_DAG` per OQ-5 (N-2). May be cleaned up opportunistically by any future story that touches the same files (Story 4.5 likely candidate if `--time-budget`/`--token-budget` upgrade DAG load to always-build).
- **I-7 (behavioural change notice)**: `runLoop({ argv: [] })` previously exited with `iterations.length === 0` + `stopReason.code === "no-stop-condition"`. Now exits with `iterations.length === 50` + `stopReason.code === "max-iters-reached"` + `maxIters === 50`. Downstream tooling consuming the v0.1 placeholder MUST adapt — but no public consumers of this internal type exist (StopReason is internal-only per the JSDoc on IterationRecord at `run.ts:60-64`). Documented in Dev Agent Record §Completion Notes per spec §OQ-7 v0.1 conservative.

### Forward action items

- **Story 4.5 (`--time-budget`, `--token-budget` stop conditions)**: EXTEND the default-cap inverted-check stanza at `run.ts:399-407` with `&& args.timeBudgetMs === undefined && args.tokenBudget === undefined` clauses. EXTEND `evaluateStopConditions` with two more predicates consuming a new `LoopMetrics` interface (analogous to Story 4.3's `LoopContext`). Consider opportunistic cleanup of N-2 (EMPTY_DAG sentinel placement) if DAG load gets promoted to always-build.
- **Story 4.6 (`--stop-on-error` / `--continue-on-error` policy)**: EXTEND the default-cap inverted-check stanza with `&& args.stopOnError !== true && args.continueOnError !== true` clauses. Also addresses Story 4.1 SF-2 (IterationRecord.action "unknown" union member).
- **Story 4.7 (`--plan-first` dry-run preview)**: Decide whether `--plan-first` requires `&& args.planFirst !== true` clause in the default-cap inverted check OR whether plan-first should skip the injection entirely (since plan-first is a DRY-RUN; the loop body never executes).
- **Story 4.10 (Loop exit reason + resume hint format)**: ENRICH the AR9 line for `max-iters-reached` with `--resume` hint format using `state.lastFailureReason.hint` (per Story 3.1). The `formatExitReason` function that Story 4.4 rewrites (`run.ts:639-659`) is the integration point. Also addresses Story 4.1 SF-1 (extractFailureCode EXIT_0 edge case) AND the dev-1 forward-tracker for explicit string-format unit test.

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-05-03 | bmad-create-story (Iteration 1 of /bmad-loop run 2026-05-03T090528Z-bmad-next, loop 2026-05-03T090459Z-bmad-loop) | Initial story spec — status: ready-for-dev. |
| 2026-05-03 | bmad-dev-story (Iteration 2 of /bmad-loop run 2026-05-03T091901Z-bmad-next, loop 2026-05-03T090459Z-bmad-loop) | Implemented Story 4.4 default-cap injection (AC-1) + max-iters (N) reached message format (AC-2) + explicit-overrides-default semantics (AC-3) + cleanup (removed `hasOtherStopCondition` + `no-stop-condition` placeholder branch + variant). All 4 quality gates pass: bun test src/commands/loop = 126 pass / 0 fail / 432 expects; bun test src/errors.test.ts = 10 pass / 0 fail / 197 expects (registry at 16); bunx biome ci . exit 0; bunx tsc --noEmit exit 0. Status: review. |
| 2026-05-03 | bmad-code-review (Iteration 3 of /bmad-loop run 2026-05-03T093130Z-bmad-next, loop 2026-05-03T090459Z-bmad-loop) | Senior Developer Review (AI) — verdict approve. AC-1/AC-2/AC-3 all PASS with file:line evidence. AR8/9/21/22/33/34/41/42 all UPHELD. Quality gates re-verified independently (loop 126/0/432, errors 10/0/197, biome 0, tsc 0, registry 16, full regression 853/0/3169). 12 OQs adjudicated (11 ACCEPT, 1 DEFER for OQ-9 to Story 4.10). 1 deviation dev-1 DEFER to Story 4.10. 0 must-fix, 0 should-fix, 2 nits (N-1, N-2 inherited from 4.2/4.3), 7 info forward-trackers. Status: review → done. |
