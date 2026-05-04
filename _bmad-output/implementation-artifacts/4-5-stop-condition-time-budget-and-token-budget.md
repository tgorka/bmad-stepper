---
status: done
story_id: '4.5'
story_key: 4-5-stop-condition-time-budget-and-token-budget
epic: '4'
title: 'Stop-Condition: `time-budget` and `token-budget`'
created: '2026-05-03'
last_updated: '2026-05-03T14:00:00Z'
priority: H
estimated_effort: M
fr_coverage:
  - FR8
  - FR9
  - FR19
  - FR23
  - FR53
  - FR54
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
  - AR10
  - AR21
  - AR22
  - AR33
  - AR34
  - AR41
  - AR42
deps:
  - 4-4-stop-condition-max-iters-and-default-cap   # PRIMARY: default-cap inverted-check at run.ts:399-407 must EXTEND with `&& args.timeBudgetMs === undefined && args.tokenBudget === undefined`; forward-tracker explicit per 4.4 SDR I-1
  - 4-3-stop-condition-next-story-and-phase-end    # PATTERN: LoopContext deferred-baseline + per-iteration stateFn pattern; LoopMetrics analogous shape; deferred-baseline three-call pattern (I-3 forward tracker)
  - 4-2-stop-condition-epic-end-and-story-x-y      # PATTERN: stop-conditions.ts file structure + StopReason discriminated union extension + evaluateStopConditions dispatcher pattern + AR9 message-format precedent
  - 4-1-bmad-loop-command-skeleton                 # SKELETON: LoopArgsSchema declares timeBudgetMs + tokenBudget at args.ts:97-98 (parsed-only since 4.1); IterationRecord shape (durationMs, action, exitCode); formatExitReason structure
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/implementation-artifacts/4-4-stop-condition-max-iters-and-default-cap.md
  - _bmad-output/implementation-artifacts/4-3-stop-condition-next-story-and-phase-end.md
  - _bmad-output/implementation-artifacts/4-2-stop-condition-epic-end-and-story-x-y.md
  - _bmad-output/implementation-artifacts/4-1-bmad-loop-command-skeleton.md
  - _bmad-output/implementation-artifacts/sprint-status.yaml
  - _bmad-output/implementation-artifacts/3-1-record-last-attempted-last-failure-reason-on-halt.md
  - .bmad-stepper/state.yaml
  - .bmad-stepper/runs/2026-05-03T093130Z-bmad-next/tasks/t1-code-review.yaml
  - src/commands/loop/args.ts
  - src/commands/loop/run.ts
  - src/commands/loop/run.test.ts
  - src/commands/loop/stop-conditions.ts
  - src/commands/loop/stop-conditions.test.ts
  - src/commands/loop/index.ts
  - src/commands/next/run.ts
  - src/commands/next/verify-and-advance.ts
  - src/commands/next/args.ts
  - src/schemas/state.ts
  - src/schemas/dispatch-protocol.ts
  - src/errors.ts
  - commands/bmad-loop.md
---

# Story 4.5: Stop-Condition: `time-budget` and `token-budget`

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper user,
I want `--time-budget <ms>` and `--token-budget <tokens>` to halt the loop when wall-clock or API-token budgets are exhausted,
So that overnight runs have a hard ceiling.

## Context Summary

This is the **fifth story of Epic 4 (Bounded Loop with Eight Stop Conditions)** and it lands the **fifth + sixth runtime-wired stop-condition flags** of the eight-flag bounded-loop surface. Stories 4.1-4.4 have wired five flags so far (`--max-iters` explicit + default-cap, `--until-epic-end`, `--until-story X.Y`, `--next-story`, `--phase-end`). Story 4.5 adds TWO more (`--time-budget MS`, `--token-budget N`) following the same architectural patterns: pure-function predicates in `src/commands/loop/stop-conditions.ts`, a new variant on the `StopReason` discriminated union per predicate, dispatcher integration in `evaluateStopConditions`, and runtime plumbing in `runLoop` to feed each predicate the inputs it needs (analogous to Story 4.3's `LoopContext` baseline capture).

**Story 4.5's scope is TWO acceptance criteria** (AC-1 `--time-budget`: 80% stderr warning + 100% halt with verbatim message `time-budget (2h) reached, partial work committed`; AC-2 `--token-budget`: 80% warning + 100% halt with exit reason that includes actual usage stats per AR10) and **two stop-condition flags** (`--time-budget MS`, `--token-budget N`). Both flags were already declared in `LoopArgsSchema` at `src/commands/loop/args.ts:97-98` per Story 4.1 (RUNTIME-DEFERRED); Story 4.5 wires them at runtime. Net deliverables: **ONE new exported interface (LoopMetrics); FIVE modified files (4 source + 1 markdown); ZERO new error classes (registry holds at 16); ZERO state schema changes; ZERO new I/O imports; ZERO `console.*` calls**.

**`--time-budget MS` semantics per AC-1 verbatim** (epics.md lines 964-966): elapsed wall-clock approaches budget → at 80% emit stderr warning, at 100% halt cleanly with reason `time-budget (2h) reached, partial work committed`. Implementation: `Bun.nanoseconds()` snapshot at loop entry (in `LoopMetrics.startedAtNs`); per-iteration check `elapsedMs = (Bun.nanoseconds() - startedAtNs) / 1_000_000`. The 80%-warning trigger fires AT MOST ONCE per loop run (latch `LoopMetrics.warned80Time`). The 100%-halt fires when `elapsedMs >= timeBudgetMs`. The unit suffix (`Xh` / `Xm` / `Xs` / `Xms`) is computed by `formatTimeBudget(ms)` helper — when `timeBudgetMs === 7_200_000` the unit is `2h`, when `3_600_000` it's `1h`, etc.

**`--token-budget N` semantics per AC-2 verbatim** (epics.md lines 967-970): cumulative `tokensIn + tokensOut` (read from each `verify-and-advance.ts` invocation per AR10) approaches budget → at 80% warning, at 100% halt with exit reason that includes actual usage stats. **Token-flow source** per AR10 (architecture lines 1661+1677): Task tool response → Layer 1 markdown → `--tokens-in/--tokens-out` flags → `verify-and-advance.ts` writes `runHistory[].tokensIn / tokensOut` on state.yaml → Story 4.5 loop runner reads via `loadStateUnlocked` per-iteration (the latest entry's tokens are added to the accumulator). Two complementary integration points:

1. **Production**: per-iteration `state.yaml` read via the existing `stateFn` (Story 4.2). Read latest `runHistory[]` entry; defensive typeof guards because the entry is `z.unknown()` per Story 1.5 schema.
2. **Test seam**: NEW `tokensPerIter: () => { tokensIn, tokensOut }` on `LoopOpts` for direct injection without state.yaml round-trip.

The accumulator: `LoopMetrics: { startedAtNs, tokensIn, tokensOut, warned80Time, warned80Token }` (all `readonly` per Story 4.3 OQ-9 immutable-struct pattern). Predicates remain pure-function — the 80%-warning emissions happen INSIDE `runLoop` (using the existing `stderrFn` from Story 4.2) per the two-step pattern: predicate fires → `runLoop` emits stderr warning OR halts. This keeps AR9 stdout-line discipline clean (stderr warnings are FR54-permitted; the AR9 stdout line is reserved for the final halt-summary).

**`evaluateStopConditions` dispatcher extension**: signature widens with optional `loopMetrics?: LoopMetrics` parameter (analogous to Story 4.3's `loopContext`). Declaration order: epic-end → until-story → next-story → phase-end → time-budget → token-budget. Budget predicates AFTER 4.2/4.3 predicates so explicit user-facing flags win over budget exhaustion when both fire on the same iteration.

**`StopReason` discriminated union extension**: TWO new variants:
- `{ code: "time-budget-reached"; budgetMs: number; elapsedMs: number; message: string }` — `message` carries AC-1 byte-identical text.
- `{ code: "token-budget-reached"; budget: number; tokensIn: number; tokensOut: number; message: string }` — `message` carries AC-2 text with actual usage stats (e.g., `token-budget (200000) reached, used 175000 tokensIn + 30000 tokensOut`).

**Default-cap inverted-check extension** (per Story 4.4 SDR forward action item I-1): the predicate at `run.ts:399-407` MUST extend with `&& args.timeBudgetMs === undefined && args.tokenBudget === undefined` clauses so explicit `--time-budget` / `--token-budget` (without `--max-iters`) does NOT trigger the default cap. JSDoc forward-tracker at run.ts:391-395 already enumerates these clauses.

**EMPTY_DAG sentinel cleanup decision** (per Story 4.4 SDR I-1 + N-2): Story 4.5 KEEPS the sentinel because the time/token budget predicates do NOT consume the DAG; promoting DAG to always-build incurs ~5-10ms per loop entry for budget-only paths. **N-1 cosmetic nit** (defensive null check at stop-conditions.ts:208): Story 4.5 INHERITS unchanged — modifications to stop-conditions.ts are purely additive (new predicates appended). Both nits documented in §Forward Action Items.

**Story 4.5 is INTENTIONALLY NARROW**: stories 4.6 (`--stop-on-error` / `--continue-on-error`) and 4.7 (`--plan-first`) will continue to extend the bounded-loop runner. Story 4.5 does NOT touch error policies, `verify-and-advance.ts`, or `parseLoopArgs` (timeBudgetMs/tokenBudget already declared per Story 4.1).

**Concretely, Story 4.5 produces:**

1. **`src/commands/loop/stop-conditions.ts`** (MODIFIED, ~+150-220 lines): adds TWO new pure-function predicates `timeBudgetStopCondition` + `tokenBudgetStopCondition` following the `(state, dag, args, sprintStatus?, loopContext?, loopMetrics?) => StopReason | null` contract; adds `LoopMetrics` exported interface; adds `formatTimeBudget(ms): string` pure helper; extends `evaluateStopConditions` + `StopConditionFn` signatures with `loopMetrics?` parameter; extends dispatcher with two new arms (declaration order: epic-end → until-story → next-story → phase-end → time-budget → token-budget).

2. **`src/commands/loop/run.ts`** (MODIFIED, ~+100-150 lines): extends `StopReason` union with `time-budget-reached` + `token-budget-reached` variants; EXTENDS default-cap inverted-check at run.ts:399-407 with `&& args.timeBudgetMs === undefined && args.tokenBudget === undefined`; initialises `loopMetrics: LoopMetrics` at loop entry; threads `loopMetrics` through `shouldStop` → `evaluateStopConditions`; per-iteration updates accumulator (reads latest `state.runHistory[]` entry's tokens via existing `stateFn` OR via new optional `tokensPerIter` test seam); checks 80%-warning latches per-iteration and emits stderr via existing `stderrFn`; extends `formatExitReason` with two new cases (delegating to predicate's `message` field).

3. **`src/commands/loop/stop-conditions.test.ts`** (MODIFIED, ~+12-18 new tests / ~+200-300 lines): pure-function unit tests for each new predicate (TB1-TB6 + KB1-KB6) covering exact-match / overshoot / under-budget / undefined-args / undefined-metrics / message-format byte-identical paths; `formatTimeBudget` cascade tests; `evaluateStopConditions` priority + purity tests.

4. **`src/commands/loop/run.test.ts`** (MODIFIED, ~+8-12 new tests + 1 sweep / ~+200-300 lines): integration tests TB_45_1-4 (time-budget firing, 80%-warning stderr, message format byte-identical, no-default-cap), KB_45_1-5 (token-budget firing via `tokensPerIter` seam, 80%-warning, message-includes-usage-stats, no-default-cap, production-flow via state.yaml read), SWEEP_45 (AC-1 + AC-2 sweep — 2 sub-tests).

5. **`commands/bmad-loop.md`** (MODIFIED, ~+30-50 lines): §Stop Conditions table flips both rows to `RUNTIME-WIRED in 4.5`; new sub-sections `### --time-budget MS (Story 4.5)` + `### --token-budget N (Story 4.5)`; updated intro paragraph (Story version map); FR53 exit-code mapping extended with new variants; "When NEITHER" paragraph extended with both flags.

6. **`_bmad-output/implementation-artifacts/sprint-status.yaml`** (MODIFIED): flips `4-5-stop-condition-time-budget-and-token-budget: backlog → ready-for-dev`. Bumps `last_updated:` at BOTH the comment block top AND the live YAML field.

**FR/NFR/AR mapping:**

- **FR8** (single-step advance): UNCHANGED. **FR9** (dry-run): UNCHANGED. **FR19** (8 stop-conditions): EXTENDED — Stories 4.1-4.4 wired 5; Story 4.5 wires 2 more (7 of 8). **FR23** (cap wall-clock/token/iter): WIRED HERE for the wall-clock + token caps. **FR53** (exit codes): EXTENDED — `0` clean-exit list adds two new variants. **FR54** (stdout/stderr discipline): EXTENDED — TWO new stderr emissions (80%-warnings); single AR9 stdout line preserved.
- **NFR-P1** (<500ms p95): PRESERVED — predicates are pure-function checks (sub-millisecond). **NFR-S2/S5/R1/R4/M3**: PRESERVED.
- **AR8** (lock-free top-tier): UPHELD — `loadStateUnlocked` is read-only. **AR9** (single AR9 line): UPHELD — 80%-warnings go to STDERR. **AR10** (token-flow): WIRED HERE for FIRST loop-runner consumer. **AR21+22** (errors): UNCHANGED — registry stays at 16. **AR33** (no console.*): UPHELD. **AR34** (slash-command markdown): UNCHANGED — markdown updates are doc-only. **AR41** (boundary graph): UPHELD — ZERO new imports. **AR42** (test discipline): EXTENDED — colocated tests; tmpdir-per-test preserved.

Estimated effort: **M** (medium — ONE new exported interface; FOUR modified source files (~+250-370 net lines); TWO modified test files (~+400-600 net lines); ONE modified markdown file (~+30-50 net lines); ZERO new error classes; ZERO new I/O imports).

It does **NOT**:

- **Wire the remaining stop-condition types** (`--stop-on-error`, `--continue-on-error`, `--plan-first`, `--checkpoint-each`) — deferred to Stories 4.6-4.10.
- **Address Story 4.1 SF-1 (extractFailureCode EXIT_0)** — forward-tracker to 4.10. **SF-2 (IterationRecord.action "unknown")** — forward-tracker to 4.6.
- **Address N-1 / N-2 nits** (cosmetic; preserved per the additive-modification rule).
- **Modify `verify-and-advance.ts` or `next/args.ts`** — Story 4.5 only CONSUMES the existing `runHistory[].tokensIn / tokensOut` fields.
- **Make `--time-budget` / `--token-budget` accept zero or negative values** — Zod schema constraints from Story 4.1 unchanged.
- **Add a new error class** — registry stays at 16.

## Acceptance Criteria

The acceptance criteria below are reproduced **verbatim** from `_bmad-output/planning-artifacts/epics.md` §Story 4.5 (lines 956-970, BDD Given/When/Then format). Lines and AC labelling preserved.

**Acceptance Criteria:**

**Given** `--time-budget 7200000` (2 hours) is supplied
**When** elapsed wall-clock time approaches the budget
**Then** at 80% the loop emits a stderr warning, at 100% the loop halts cleanly with reason `time-budget (2h) reached, partial work committed`
**Given** `--token-budget 200000` is supplied
**When** the cumulative `tokensIn + tokensOut` (read from each `verify-and-advance.ts` invocation per AR10) approaches the budget
**Then** at 80% a warning is emitted, at 100% the loop halts
**And** the exit reason includes the actual usage stats

> **Story 4.5 stop-condition scope note:** AC-1 covers `--time-budget MS` (80%-stderr-warning + 100%-halt with verbatim message format `time-budget (Xh) reached, partial work committed`); AC-2 covers `--token-budget N` (analogous 80%-warning + 100%-halt + actual usage stats in the exit message). Both predicates are pure-function additions to `src/commands/loop/stop-conditions.ts`; the 80%-warning is emitted by `runLoop` (test seam: `stderrOverride`) — predicates remain pure-function `null | StopReason`-returning per the Story 4.2/4.3 contract. Stories 4.6 (`--stop-on-error`, `--continue-on-error`) and 4.7 (`--plan-first`) will continue to extend the bounded-loop runner.

## Tasks / Subtasks

- [x] **Task 0 — Verify pre-conditions (AC: all)**
  - [x] 0.1 Confirm Story 4.4 is `done` per `_bmad-output/implementation-artifacts/sprint-status.yaml:86`. Confirm code-review verdict `approve` per `_bmad-output/implementation-artifacts/4-4-stop-condition-max-iters-and-default-cap.md` Senior Developer Review section (verdict line 705, counts in §Quality gates: 0 must-fix / 0 should-fix / 2 nits inherited from 4.2/4.3 / 7 info).
  - [x] 0.2 Read `_bmad-output/implementation-artifacts/4-4-stop-condition-max-iters-and-default-cap.md` end-to-end. Confirm:
    - `src/commands/loop/run.ts:399-407` defines the default-cap inverted-check (now 5-clause: `args.maxIters === undefined && args.untilEpicEnd !== true && args.untilStory === undefined && args.nextStory !== true && args.phaseEnd !== true`).
    - JSDoc forward-tracker at `run.ts:391-395` enumerates Stories 4.5/4.6/4.7 future-flag clauses verbatim.
    - `src/commands/loop/run.ts:99-120` defines `StopReason` discriminated union with 6 variants (`max-iters-reached`, `halt-on-error`, `epic-end-reached`, `until-story-reached`, `next-story-reached`, `phase-end-reached`).
    - `src/commands/loop/run.ts:639-659` defines `formatExitReason` switch with 6 cases.
    - `src/commands/loop/stop-conditions.ts:444-477` defines `evaluateStopConditions` dispatcher with 4 predicates wired (epic-end, until-story, next-story, phase-end).
    - `src/commands/loop/args.ts:97-98` declares `timeBudgetMs: z.number().int().positive().optional()` and `tokenBudget: z.number().int().positive().optional()`.
    - Errors registry at `src/errors.ts` holds at 16 codes.
  - [x] 0.3 Read epics.md §Story 4.5 lines 956-970 verbatim. Confirm the AC text in §Acceptance Criteria above is character-identical to lines 962-970.
  - [x] 0.4 Read `src/commands/loop/run.test.ts` to confirm the existing Test E (default-cap with `argv=[]` → 50 iters), Test X_44, Test Y_44, Test Z_44, Test AA_44 (Sweep-44) all pass per the Story 4.4 baseline (~126 pass / 0 fail / ~432 expects).
  - [x] 0.5 Read `_bmad-output/planning-artifacts/prd.md` §FR23 (line 699) verbatim: "Users can cap the loop's wall-clock time, API token spend, or iteration count (`--time-budget`, `--token-budget`, `--max-iters`)." Confirm. Read PRD lines 596-597 for the warning/halt pattern: "`--token-budget` cap: when the cap is approached, the loop emits a warning at 80% and halts at 100%. `--time-budget` cap: same warning/halt pattern." Confirm.
  - [x] 0.6 Read `_bmad-output/implementation-artifacts/sprint-status.yaml` and confirm `4-5-stop-condition-time-budget-and-token-budget: backlog` is the current value at line 87 (Story 4.5 will flip to `ready-for-dev`).
  - [x] 0.7 Read Story 4.4's §Forward Action Items (lines 845-848) to confirm the EXPLICIT extension mandate for Story 4.5: "EXTEND the default-cap inverted-check stanza at run.ts:399-407 with `&& args.timeBudgetMs === undefined && args.tokenBudget === undefined` clauses. EXTEND `evaluateStopConditions` with two more predicates consuming a new `LoopMetrics` interface." Confirm.
  - [x] 0.8 Read `_bmad-output/planning-artifacts/architecture.md` lines 1661 + 1677 — AR10 token-flow contract: "Slash-command markdown captures Task response token counts and forwards them as flags. Loop runner aggregates for `--token-budget` enforcement." Confirm Story 4.5 is the FIRST loop-runner consumer of this flow.
  - [x] 0.9 Confirm `src/commands/next/verify-and-advance.ts` writes `runHistory[].tokensIn / tokensOut` per Story 2.6 (line 510-521 — `RunHistoryEntry { runId, step, epic, story, verifierStatus, promotedTo, durationMs, tokensIn, tokensOut, ts }`). Story 4.5 reads the LATEST entry's `tokensIn/tokensOut` fields per-iteration.
  - [x] 0.10 Confirm baseline `bun test src/commands/loop` exits 0 with the post-Story-4.4 baseline (~126 pass / 0 fail / ~432 expects across 3 files per Story 4.4 §Quality gates).
  - [x] 0.11 Confirm Bun host version satisfies AR2 (Bun >= 1.3). Run `bun --version`; record in Completion Notes.
  - [x] 0.12 Confirm `src/errors.ts` registry holds at 16 codes (`bun test src/errors.test.ts` → 10 pass / 0 fail / 197 expects).

- [x] **Task 1 — Address Story 4.4 forward action items: extend default-cap inverted-check (AC: implicit prerequisite)**
  - [x] 1.1 At `src/commands/loop/run.ts:399-407`, EXTEND the default-cap inverted-check predicate with the two new clauses:
    ```typescript
    if (
      args.maxIters === undefined &&
      args.untilEpicEnd !== true &&
      args.untilStory === undefined &&
      args.nextStory !== true &&
      args.phaseEnd !== true &&
      args.timeBudgetMs === undefined &&
      args.tokenBudget === undefined
    ) {
      args = { ...args, maxIters: 50 };
    }
    ```
    Reasoning: per Story 4.4 SDR I-1 + spec §Forward Action Items, the default-cap MUST short-circuit when `--time-budget` or `--token-budget` is supplied (those flags ALONE control the loop's lifetime; the default 50-iter cap should NOT kick in).
  - [x] 1.2 Update the JSDoc forward-tracker comment at `run.ts:391-395` to remove the `4.5: && args.timeBudgetMs === undefined && args.tokenBudget === undefined` line (now wired by this Task) and keep the remaining lines for 4.6 + 4.7. The JSDoc must accurately reflect the as-of-Story-4.5 state.
  - [x] 1.3 Decide on EMPTY_DAG sentinel cleanup (per Story 4.4 SDR I-1 forward action item). v0.1 conservative: KEEP the sentinel because the time/token budget predicates do NOT consume the DAG; promoting DAG to always-build incurs unnecessary cost (~5-10ms per loop entry) for budget-only paths. Document the decision in Open Questions.
  - [x] 1.4 Document the inheritance of N-1 (defensive null check at stop-conditions.ts:208) — Story 4.5 INHERITS unchanged; the modification to stop-conditions.ts is purely additive (new predicates appended). Document in §Forward Action Items.

- [x] **Task 2 — Define `LoopMetrics` interface + `formatTimeBudget` helper (AC-1, AC-2)**
  - [x] 2.1 In `src/commands/loop/stop-conditions.ts`, ADD the new `LoopMetrics` exported interface after the existing `LoopContext` interface (around line 87):
    ```typescript
    /**
     * Loop-level runtime metrics captured by `runLoop` for the budget
     * predicates (Story 4.5). The `runLoop` initialises this struct at
     * loop entry and updates it after each successful iteration. Pure
     * predicates (`timeBudgetStopCondition`, `tokenBudgetStopCondition`)
     * READ this struct to decide whether to halt; they do NOT mutate it.
     *
     * Fields:
     *   - startedAtNs: `Bun.nanoseconds()` snapshot at loop entry; subtract
     *                  to derive `elapsedMs` per-iteration.
     *   - tokensIn / tokensOut: cumulative token counts read from
     *                  `state.runHistory[].tokensIn / tokensOut` per AR10.
     *   - warned80Time / warned80Token: latches set true after the 80%-
     *                  warning is emitted to stderr; prevents repeated
     *                  emissions on subsequent iterations.
     *
     * Fields are `readonly` per Story 4.3 §Open Question 9 precedent
     * (immutable struct; the runLoop creates a new object via spread when
     * updating fields).
     */
    export interface LoopMetrics {
      readonly startedAtNs: number;
      readonly tokensIn: number;
      readonly tokensOut: number;
      readonly warned80Time: boolean;
      readonly warned80Token: boolean;
    }
    ```
  - [x] 2.2 ADD the small pure-function helper `formatTimeBudget(ms: number): string` near the top of `stop-conditions.ts` (before the predicates):
    ```typescript
    /**
     * Format an integer milliseconds value as the canonical
     * human-readable unit per AC-1 (`Xh` / `Xm` / `Xs` / `Xms`). Used by
     * `timeBudgetStopCondition` to produce the AC-1 byte-identical
     * exit-message text `time-budget (Xh) reached, partial work committed`.
     *
     * Rules:
     *   - ms >= 3_600_000 AND ms % 3_600_000 === 0 → `${ms / 3_600_000}h`
     *   - ms >= 60_000   AND ms % 60_000 === 0    → `${ms / 60_000}m`
     *   - ms >= 1_000    AND ms % 1_000 === 0     → `${ms / 1_000}s`
     *   - otherwise                                → `${ms}ms`
     *
     * Pure function; no I/O; no throws. Used ONLY by
     * `timeBudgetStopCondition` for message-text composition.
     *
     * Examples:
     *   formatTimeBudget(7_200_000) === "2h"
     *   formatTimeBudget(3_600_000) === "1h"
     *   formatTimeBudget(60_000)    === "1m"
     *   formatTimeBudget(500)       === "500ms"
     *   formatTimeBudget(0)         === "0ms"
     */
    export function formatTimeBudget(ms: number): string {
      if (ms >= 3_600_000 && ms % 3_600_000 === 0) return `${ms / 3_600_000}h`;
      if (ms >= 60_000 && ms % 60_000 === 0) return `${ms / 60_000}m`;
      if (ms >= 1_000 && ms % 1_000 === 0) return `${ms / 1_000}s`;
      return `${ms}ms`;
    }
    ```
  - [x] 2.3 Tracked as Open Question 1: edge-case behaviour for non-integer-multiple `timeBudgetMs` (e.g., `--time-budget 5400000` = 1.5h — rule cascades to `90m` → `5400s` → `5400000ms`). v0.1 conservative ALWAYS produces the highest unit that exactly divides; no fractional support. AC-1 example uses `7_200_000` which exactly equals `2h`; non-exact cases will produce smaller units.
  - [x] 2.4 Update `StopConditionFn` type alias to include the new `loopMetrics?: LoopMetrics` parameter. The full new signature:
    ```typescript
    export type StopConditionFn = (
      state: State,
      dag: Dag,
      args: LoopArgs,
      sprintStatus?: SprintStatus,
      loopContext?: LoopContext,
      loopMetrics?: LoopMetrics,
    ) => StopReason | null;
    ```

- [x] **Task 3 — Define `StopReason` extension + `formatExitReason` cases (AC-1, AC-2)**
  - [x] 3.1 At `src/commands/loop/run.ts:99-120`, EXTEND the `StopReason` discriminated union with two new variants:
    ```typescript
    | {
        code: "time-budget-reached";
        budgetMs: number;
        elapsedMs: number;
        message: string;
      }
    | {
        code: "token-budget-reached";
        budget: number;
        tokensIn: number;
        tokensOut: number;
        message: string;
      }
    ```
    The structured `budgetMs` / `budget` fields carry the original input value; `elapsedMs` / `tokensIn` / `tokensOut` carry the actual usage at halt time. The `message` field carries the AR9 exit text (delegated to from `formatExitReason`).
  - [x] 3.2 Update the JSDoc above the union (lines 82-98) to add references to the new variants. New text:
    > "Story 4.5 (`--time-budget`, `--token-budget`) extends with TWO MORE variants (`time-budget-reached`, `token-budget-reached`) emitted by the new pure-function predicates `timeBudgetStopCondition` + `tokenBudgetStopCondition` (see `./stop-conditions.ts`). Story 4.6 (`--stop-on-error`, `--continue-on-error`) will extend further following the same shape."
  - [x] 3.3 At `src/commands/loop/run.ts:639-659`, EXTEND `formatExitReason` switch with two new cases:
    ```typescript
    case "time-budget-reached":
      // AC-1 verbatim: "time-budget (Xh) reached, partial work committed"
      // (epics.md line 966). The message is composed by the predicate via
      // formatTimeBudget(args.timeBudgetMs); we delegate to the predicate's
      // message field for AC-byte-identical text.
      return stopReason.message;
    case "token-budget-reached":
      // AC-2: "the exit reason includes the actual usage stats" — the
      // predicate composes the message using budget + tokensIn + tokensOut.
      return stopReason.message;
    ```
  - [x] 3.4 Update the JSDoc above `formatExitReason` (lines 624-637) to reference the new variants.
  - [x] 3.5 Update the EXIT-CODE MAPPING JSDoc at `run.ts:29-33` — the `0` exit code now also includes `time-budget-reached` and `token-budget-reached`.

- [x] **Task 4 — Implement `timeBudgetStopCondition` predicate (AC-1)**
  - [x] 4.1 In `src/commands/loop/stop-conditions.ts`, ADD the new `timeBudgetStopCondition` pure-function predicate AFTER `phaseEndStopCondition` (around line 419) and BEFORE `evaluateStopConditions`:
    ```typescript
    /**
     * Fires when `args.timeBudgetMs !== undefined` AND
     * `loopMetrics.elapsedMs >= args.timeBudgetMs` — i.e., the wall-clock
     * elapsed time has reached or exceeded the budget.
     *
     * Returns a `StopReason` of code `"time-budget-reached"` carrying the
     * `budgetMs` (`args.timeBudgetMs`) + the `elapsedMs` (actual elapsed)
     * + the verbatim AC-1 message text
     * `"time-budget (Xh) reached, partial work committed"` where `Xh` is
     * the canonical formatted unit per `formatTimeBudget`.
     *
     * Pure function; no I/O; no throws. Reads `loopMetrics.elapsedMs`
     * (computed by `runLoop` from `Bun.nanoseconds() - startedAtNs`).
     *
     * Edge cases (all return `null`):
     *   - `args.timeBudgetMs === undefined` (flag absent).
     *   - `loopMetrics === undefined` (predicate called without metrics).
     *   - `loopMetrics.elapsedMs < args.timeBudgetMs` (under budget).
     *
     * The 80%-warning (per AC-1 wording "at 80% the loop emits a stderr
     * warning") is emitted by `runLoop` (NOT by this predicate); the
     * predicate signals only the 100% halt. The two-step pattern keeps
     * the predicate pure-function and the warning side-effect localised
     * to the runner.
     */
    export function timeBudgetStopCondition(
      _state: State,
      _dag: Dag,
      args: LoopArgs,
      _sprintStatus: SprintStatus | undefined,
      _loopContext: LoopContext | undefined,
      loopMetrics: LoopMetrics | undefined,
    ): StopReason | null {
      if (args.timeBudgetMs === undefined) return null;
      if (loopMetrics === undefined) return null;
      const elapsedMs =
        (Bun.nanoseconds() - loopMetrics.startedAtNs) / 1_000_000;
      if (elapsedMs < args.timeBudgetMs) return null;
      const unit = formatTimeBudget(args.timeBudgetMs);
      return {
        code: "time-budget-reached",
        budgetMs: args.timeBudgetMs,
        elapsedMs,
        message: `time-budget (${unit}) reached, partial work committed`,
      };
    }
    ```
    Note: the predicate computes `elapsedMs` from `Bun.nanoseconds()` directly (NOT from a stored `loopMetrics.elapsedMs` field) — `Bun.nanoseconds()` is sub-microsecond and the predicate stays pure (no mutation of `loopMetrics`). The `LoopMetrics` struct only stores `startedAtNs` for time; the elapsed computation happens at the predicate-call site. Tracked as Open Question 2.
  - [x] 4.2 Add unit tests for `timeBudgetStopCondition` in `stop-conditions.test.ts` (Tasks 6.x below).
  - [x] 4.3 Verify the message format `time-budget (2h) reached, partial work committed` is byte-identical to AC-1 (epics.md line 966) — character-by-character match including the comma and lowercase `partial work committed`.

- [x] **Task 5 — Implement `tokenBudgetStopCondition` predicate (AC-2)**
  - [x] 5.1 In `src/commands/loop/stop-conditions.ts`, ADD the new `tokenBudgetStopCondition` pure-function predicate AFTER `timeBudgetStopCondition`:
    ```typescript
    /**
     * Fires when `args.tokenBudget !== undefined` AND
     * `loopMetrics.tokensIn + loopMetrics.tokensOut >= args.tokenBudget`
     * — i.e., the cumulative token usage has reached or exceeded the
     * budget.
     *
     * Returns a `StopReason` of code `"token-budget-reached"` carrying:
     *   - `budget` (`args.tokenBudget`)
     *   - `tokensIn` (cumulative input tokens at halt time)
     *   - `tokensOut` (cumulative output tokens at halt time)
     *   - `message`: AC-2 exit text WITH actual usage stats (per AC-2
     *     "the exit reason includes the actual usage stats") —
     *     `"token-budget (N) reached, used X tokensIn + Y tokensOut"`.
     *
     * Pure function; no I/O; no throws. The token accumulator is updated
     * by `runLoop` after each successful iteration by reading the latest
     * `state.runHistory[]` entry's `tokensIn / tokensOut` fields per AR10.
     *
     * Edge cases (all return `null`):
     *   - `args.tokenBudget === undefined` (flag absent).
     *   - `loopMetrics === undefined` (predicate called without metrics).
     *   - `tokensIn + tokensOut < args.tokenBudget` (under budget).
     *
     * The 80%-warning (per AC-2 wording "at 80% a warning is emitted")
     * is emitted by `runLoop` (NOT by this predicate); the predicate
     * signals only the 100% halt.
     */
    export function tokenBudgetStopCondition(
      _state: State,
      _dag: Dag,
      args: LoopArgs,
      _sprintStatus: SprintStatus | undefined,
      _loopContext: LoopContext | undefined,
      loopMetrics: LoopMetrics | undefined,
    ): StopReason | null {
      if (args.tokenBudget === undefined) return null;
      if (loopMetrics === undefined) return null;
      const total = loopMetrics.tokensIn + loopMetrics.tokensOut;
      if (total < args.tokenBudget) return null;
      return {
        code: "token-budget-reached",
        budget: args.tokenBudget,
        tokensIn: loopMetrics.tokensIn,
        tokensOut: loopMetrics.tokensOut,
        message: `token-budget (${args.tokenBudget}) reached, used ${loopMetrics.tokensIn} tokensIn + ${loopMetrics.tokensOut} tokensOut`,
      };
    }
    ```
  - [x] 5.2 Add unit tests for `tokenBudgetStopCondition` in `stop-conditions.test.ts` (Tasks 6.x below).
  - [x] 5.3 Verify the message format includes the structured budget + tokensIn + tokensOut as suffix per AC-2 "exit reason includes the actual usage stats" — Open Question 3 documents the exact format choice (cf. AC-2's wording is interpretive; v0.1 conservative chose `token-budget (N) reached, used X tokensIn + Y tokensOut`).

- [x] **Task 6 — Wire predicates into `evaluateStopConditions` dispatcher (AC-1, AC-2)**
  - [x] 6.1 In `src/commands/loop/stop-conditions.ts:444-477`, EXTEND the `evaluateStopConditions` function with two new dispatcher arms (after the `phase` arm and before the `return null`):
    ```typescript
    const timeBudget = timeBudgetStopCondition(
      state,
      dag,
      args,
      sprintStatus,
      loopContext,
      loopMetrics,
    );
    if (timeBudget !== null) return timeBudget;

    const tokenBudget = tokenBudgetStopCondition(
      state,
      dag,
      args,
      sprintStatus,
      loopContext,
      loopMetrics,
    );
    if (tokenBudget !== null) return tokenBudget;
    ```
  - [x] 6.2 EXTEND the `evaluateStopConditions` function signature with the new `loopMetrics?: LoopMetrics` parameter (last position):
    ```typescript
    export function evaluateStopConditions(
      state: State,
      dag: Dag,
      args: LoopArgs,
      sprintStatus?: SprintStatus,
      loopContext?: LoopContext,
      loopMetrics?: LoopMetrics,
    ): StopReason | null { ... }
    ```
  - [x] 6.3 Update the JSDoc on `evaluateStopConditions` (around line 421-443) to reference the new declaration order: `1. untilEpicEnd → 2. untilStory → 3. nextStory → 4. phaseEnd → 5. timeBudget → 6. tokenBudget`. Note: when MULTIPLE predicates would fire on the same iteration, the dispatcher returns the FIRST non-null in declaration order. The Story 4.5 placement (after Stories 4.2/4.3 predicates) gives the explicit user-facing predicates priority over budget exhaustion. Tracked as Open Question 4.

- [x] **Task 7 — Wire `LoopMetrics` initialiser + 80%-warning emission in `runLoop` (AC-1, AC-2)**
  - [x] 7.1 At `src/commands/loop/run.ts`, IMPORT the new `LoopMetrics` interface from `./stop-conditions.ts` (extend the existing import):
    ```typescript
    import {
      evaluateStopConditions,
      type LoopContext,
      type LoopMetrics,
      type SprintStatus,
    } from "./stop-conditions.ts";
    ```
  - [x] 7.2 At `runLoop` body (before the `while (true)` loop, around line 488), INITIALISE `loopMetrics`:
    ```typescript
    // Story 4.5: initialise the LoopMetrics accumulator at loop entry.
    // The runner UPDATES this struct after each successful iteration
    // (token accumulation from state.runHistory[]; the 80%-warning
    // latches flip when the predicates would emit warnings).
    let loopMetrics: LoopMetrics = {
      startedAtNs: loopStartNs,
      tokensIn: 0,
      tokensOut: 0,
      warned80Time: false,
      warned80Token: false,
    };
    ```
    Note: reuses the existing `loopStartNs` from line 448 (`Bun.nanoseconds()` at loop entry) — no double-clock-read.
  - [x] 7.3 At the per-iteration loop body, AFTER each successful iteration's `runNext` returns (i.e., after `iterations.push(record)` at run.ts:543), READ tokens from the latest `state.runHistory[]` entry and update `loopMetrics`:
    ```typescript
    // Story 4.5: token accumulation from state.runHistory[] per AR10.
    // The verify-and-advance.ts (Layer 2) writes tokensIn/tokensOut to
    // runHistory[]; we read the LATEST entry per-iteration. v0.1
    // conservative: defensive typeof guards because runHistory[] is
    // schema-typed as z.unknown() per Story 1.5.
    let iterTokensIn = 0;
    let iterTokensOut = 0;
    if (opts?.tokensPerIter !== undefined) {
      // Test-injection seam: bypass state.yaml round-trip.
      const tokens = opts.tokensPerIter();
      iterTokensIn = tokens.tokensIn;
      iterTokensOut = tokens.tokensOut;
    } else {
      // Production path: read latest runHistory entry from state.yaml.
      const postState = await stateFn();
      const history = postState?.runHistory ?? [];
      const latest = history[history.length - 1];
      if (
        latest !== undefined &&
        latest !== null &&
        typeof latest === "object"
      ) {
        const entry = latest as { tokensIn?: unknown; tokensOut?: unknown };
        if (typeof entry.tokensIn === "number") iterTokensIn = entry.tokensIn;
        if (typeof entry.tokensOut === "number")
          iterTokensOut = entry.tokensOut;
      }
    }
    loopMetrics = {
      ...loopMetrics,
      tokensIn: loopMetrics.tokensIn + iterTokensIn,
      tokensOut: loopMetrics.tokensOut + iterTokensOut,
    };
    ```
  - [x] 7.4 IMMEDIATELY AFTER updating `loopMetrics`, CHECK the 80%-warning thresholds and emit stderr warnings + flip latches:
    ```typescript
    // Story 4.5: 80%-warning emission for time/token budgets. The
    // emission happens AFTER the iteration completes (so the predicates
    // see the just-completed iteration's metrics on the NEXT iteration's
    // pre-iter check) and BEFORE the next shouldStop call. The latches
    // (warned80Time, warned80Token) ensure each warning fires AT MOST
    // ONCE per loop run.
    if (
      args.timeBudgetMs !== undefined &&
      !loopMetrics.warned80Time
    ) {
      const elapsedMs = (Bun.nanoseconds() - loopMetrics.startedAtNs) / 1_000_000;
      if (elapsedMs >= args.timeBudgetMs * 0.8) {
        stderrFn(
          `Warning: time-budget at 80% (elapsed ${Math.round(elapsedMs)}ms of ${args.timeBudgetMs}ms budget).\n`,
        );
        loopMetrics = { ...loopMetrics, warned80Time: true };
      }
    }
    if (
      args.tokenBudget !== undefined &&
      !loopMetrics.warned80Token
    ) {
      const totalTokens = loopMetrics.tokensIn + loopMetrics.tokensOut;
      if (totalTokens >= args.tokenBudget * 0.8) {
        stderrFn(
          `Warning: token-budget at 80% (used ${totalTokens} of ${args.tokenBudget} tokens).\n`,
        );
        loopMetrics = { ...loopMetrics, warned80Token: true };
      }
    }
    ```
  - [x] 7.5 EXTEND `LoopOpts` with a new optional `tokensPerIter` test seam (around line 196):
    ```typescript
    /**
     * Story 4.5 test-injection seam: directly inject per-iteration
     * token counts without round-tripping through `state.yaml`. When
     * supplied, the runner uses these values; otherwise it reads from
     * the latest `state.runHistory[]` entry. Production code passes
     * nothing.
     */
    readonly tokensPerIter?: () => { tokensIn: number; tokensOut: number };
    ```
  - [x] 7.6 EXTEND the `shouldStop` invocation at run.ts:505-512 to thread `loopMetrics`:
    ```typescript
    const reason = shouldStop(
      iterCount,
      args,
      state,
      dag,
      sprintStatus,
      loopContext,
      loopMetrics,
    );
    ```
  - [x] 7.7 EXTEND `shouldStop` function signature (around line 221-228) with the new `loopMetrics?: LoopMetrics` parameter and thread it to `evaluateStopConditions`:
    ```typescript
    function shouldStop(
      iterCount: number,
      args: LoopArgs,
      state: State | null,
      dag: DagAdjacency | null,
      sprintStatus: SprintStatus | null,
      loopContext: LoopContext | null,
      loopMetrics: LoopMetrics | null,
    ): StopReason | null {
      // ...existing max-iters branch...
      if (state !== null) {
        const reason = evaluateStopConditions(
          state,
          dag ?? EMPTY_DAG,
          args,
          sprintStatus ?? undefined,
          loopContext ?? undefined,
          loopMetrics ?? undefined,
        );
        if (reason !== null) return reason;
      }
      return null;
    }
    ```
  - [x] 7.8 Update the JSDoc on `shouldStop` (around lines 200-220) to reference the new `loopMetrics` parameter and the Story 4.5 budget predicates.

- [x] **Task 8 — Test predicates in `stop-conditions.test.ts` (AC-1, AC-2)**
  - [x] 8.1 ADD test fixture helper `makeLoopMetricsFixture(overrides)` near the top of `stop-conditions.test.ts` to build a `LoopMetrics` struct with sensible defaults; the helper accepts partial overrides for each test case.
  - [x] 8.2 ADD describe block `timeBudgetStopCondition (Story 4.5 AC-1, Tests TB1-TB6)` with at least 5-6 sub-tests:
    - TB1: fires when `elapsedMs === args.timeBudgetMs` (exact match boundary).
    - TB2: fires when `elapsedMs > args.timeBudgetMs` (overshoot).
    - TB3: does NOT fire when `elapsedMs < args.timeBudgetMs` (under budget).
    - TB4: does NOT fire when `args.timeBudgetMs === undefined`.
    - TB5: does NOT fire when `loopMetrics === undefined`.
    - TB6: AC-1 verbatim message format check — when `args.timeBudgetMs === 7_200_000`, the returned `stopReason.message === "time-budget (2h) reached, partial work committed"` byte-identical.
  - [x] 8.3 ADD describe block `tokenBudgetStopCondition (Story 4.5 AC-2, Tests KB1-KB6)`:
    - KB1: fires when `tokensIn + tokensOut === args.tokenBudget` (exact match).
    - KB2: fires when `tokensIn + tokensOut > args.tokenBudget` (overshoot).
    - KB3: does NOT fire when sum is under budget.
    - KB4: does NOT fire when `args.tokenBudget === undefined`.
    - KB5: does NOT fire when `loopMetrics === undefined`.
    - KB6: AC-2 message format verification — when `args.tokenBudget === 200_000`, `tokensIn === 175_000`, `tokensOut === 30_000`, the returned `stopReason.message === "token-budget (200000) reached, used 175000 tokensIn + 30000 tokensOut"` byte-identical.
  - [x] 8.4 ADD describe block `formatTimeBudget (Story 4.5)`:
    - Test the cascade of unit choices: `7_200_000 → "2h"`, `3_600_000 → "1h"`, `1_800_000 → "30m"` (1.5h cascades down to 30 min), `60_000 → "1m"`, `1_000 → "1s"`, `500 → "500ms"`, `0 → "0ms"`.
    - Edge case: `5_400_000` (1.5h non-exact-hour) → `"90m"` (cascades to minutes which DOES divide exactly).
  - [x] 8.5 EXTEND `evaluateStopConditions` priority test (Tests EVAL_43_*) with a new sub-test asserting that when BOTH `--until-epic-end` AND `--time-budget` would fire, `epic-end-reached` wins (Story 4.2/4.3 predicates have priority per declaration order).
  - [x] 8.6 EXTEND `predicate purity` test (Test 17 / new Test 18) to cover the two new predicates — invoke each twice; results deeply equal.
  - [x] 8.7 Test counts projection: ~+12-18 new tests on `stop-conditions.test.ts`; ~+30-50 new expects.

- [x] **Task 9 — Test runtime integration in `run.test.ts` (AC-1, AC-2)**
  - [x] 9.1 ADD test fixture helper `tokensStub(perIter: { in: number; out: number })` that returns a `tokensPerIter`-compatible function for the test seam.
  - [x] 9.2 ADD describe block `runLoop — Test TB_45_1 (Story 4.5 AC-1: --time-budget fires at 100%)`:
    ```typescript
    it("--time-budget 100 halts after ~100ms with time-budget-reached", async () => {
      let count = 0;
      const slowStub = async () => {
        count++;
        // Use Bun.sleep to advance real wall-clock time by ~50ms per iter.
        await Bun.sleep(50);
        return successResult(`tb-iter-${count}`);
      };
      const result = await runLoop({
        argv: ["--time-budget", "100"],
        runNextOverride: slowStub,
        stateOverride: () => null,
        sprintStatusOverride: () => null,
        stderrOverride: () => {},
      });
      expect(result.stopReason.code).toBe("time-budget-reached");
      if (result.stopReason.code !== "time-budget-reached") return;
      expect(result.stopReason.budgetMs).toBe(100);
      expect(result.stopReason.elapsedMs).toBeGreaterThanOrEqual(100);
      expect(result.iterations.length).toBeLessThanOrEqual(3);
    });
    ```
    Note: tests use REAL wall-clock via `Bun.sleep` because mocking `Bun.nanoseconds()` is brittle. The test bound is loose (`≤ 3 iters`) to absorb scheduling variance. Tracked as Open Question 5.
  - [x] 9.3 ADD describe block `runLoop — Test TB_45_2 (Story 4.5 AC-1: 80%-warning to stderr)`:
    - `--time-budget 100`; capture stderr via `stderrOverride`; assert at least one stderr emission contains "time-budget" and "80%" BEFORE the time-budget-reached halt fires.
  - [x] 9.4 ADD describe block `runLoop — Test TB_45_3 (Story 4.5 AC-1: exit message format)`:
    - assert `result.stopReason.message` matches `/^time-budget \(\d+(h|m|s|ms)\) reached, partial work committed$/`.
  - [x] 9.5 ADD describe block `runLoop — Test TB_45_4 (Story 4.5: --time-budget alone does NOT inject default cap)`:
    - `runLoop({ argv: ["--time-budget", "100"] })` with a fast `runNextOverride` that exits within 50ms — assert the loop exits via `time-budget-reached` (NOT `max-iters-reached` with `maxIters === 50`).
  - [x] 9.6 ADD describe block `runLoop — Test KB_45_1 (Story 4.5 AC-2: --token-budget fires at 100%)`:
    ```typescript
    it("--token-budget 100 with tokensPerIter 50/50 halts after 1 iter", async () => {
      const { stub } = countingStub(successResult());
      const result = await runLoop({
        argv: ["--token-budget", "100"],
        runNextOverride: stub,
        tokensPerIter: () => ({ tokensIn: 50, tokensOut: 50 }),
        stateOverride: () => null,
        sprintStatusOverride: () => null,
        stderrOverride: () => {},
      });
      expect(result.stopReason.code).toBe("token-budget-reached");
      if (result.stopReason.code !== "token-budget-reached") return;
      expect(result.stopReason.budget).toBe(100);
      expect(result.stopReason.tokensIn).toBe(50);
      expect(result.stopReason.tokensOut).toBe(50);
      expect(result.iterations.length).toBe(1);
    });
    ```
  - [x] 9.7 ADD describe block `runLoop — Test KB_45_2 (Story 4.5 AC-2: 80%-warning to stderr)`:
    - `--token-budget 100`; `tokensPerIter` returns `{ tokensIn: 40, tokensOut: 40 }` (80 cumulative — exactly at 80%); capture stderr; assert exactly ONE warning emission contains "token-budget" and "80%"; subsequent iter (40+40=120 cumulative) overshoots to halt with token-budget-reached.
  - [x] 9.8 ADD describe block `runLoop — Test KB_45_3 (Story 4.5 AC-2: exit message includes usage stats)`:
    - assert `result.stopReason.message` matches `/^token-budget \(\d+\) reached, used \d+ tokensIn \+ \d+ tokensOut$/` and the structured fields agree.
  - [x] 9.9 ADD describe block `runLoop — Test KB_45_4 (Story 4.5: --token-budget alone does NOT inject default cap)`:
    - similar to TB_45_4 for token-budget alone.
  - [x] 9.10 ADD describe block `runLoop — Test KB_45_5 (Story 4.5: production-style flow reads tokens from state.yaml)`:
    - `stateOverride` returns a state with `runHistory[]` entries having `tokensIn/tokensOut` (mimicking what `verify-and-advance.ts` writes); use NO `tokensPerIter` seam; the loop reads tokens from `runHistory` and accumulates; after enough iters the token-budget-reached halt fires.
  - [x] 9.11 ADD describe block `runLoop — Test SWEEP_45 (Story 4.5: AC-1 + AC-2 sweep)`:
    - ONE describe block, 2 sub-tests:
      - Sweep-45-A: `--time-budget` fires (uses `Bun.sleep`).
      - Sweep-45-B: `--token-budget` fires (uses `tokensPerIter`).
    - Each sub-test exercises ONE flag in its own scenario; satisfies the integration-test rubric for both ACs.
  - [x] 9.12 UPDATE the top-of-file comment block at lines 1-27 to reflect Story 4.5's coverage delta:
    - Add: "AC-1 (Tests TB_45_1-4 + Sweep-45-A): `--time-budget MS` 80%-warning + 100%-halt with `time-budget (Xh) reached, partial work committed` exit message."
    - Add: "AC-2 (Tests KB_45_1-5 + Sweep-45-B): `--token-budget N` 80%-warning + 100%-halt with usage stats in exit message."
  - [x] 9.13 Test counts projection: net delta is ~+8-12 new describe blocks; ~+30-50 new expects on `run.test.ts`. Net: ~46 → ~56 tests; ~432 → ~480 expects.

- [x] **Task 10 — Update `commands/bmad-loop.md` (AC-1, AC-2 indirect)**
  - [x] 10.1 In the §Stop Conditions table (lines 168-182), flip the `--time-budget MS` and `--token-budget N` rows from `parsed only` → `RUNTIME-WIRED in 4.5`.
  - [x] 10.2 Update the intro paragraph (lines 13-17): was "Stories 4.5+ will wire the remaining flags (--time-budget, --token-budget, ...)" → REPLACE with "Story 4.5 wired the two budget flags; Stories 4.6+ will wire the remaining flags (--stop-on-error, --continue-on-error, --plan-first)".
  - [x] 10.3 INSERT a new sub-section `### --time-budget MS (Story 4.5)` AFTER `### --phase-end (Story 4.3)` (around line 279). Content covers: behaviour summary (80%-warning + 100%-halt; `Bun.nanoseconds()` source); usage example (`/bmad-loop --time-budget 7200000`); exit message format `time-budget (Xh) reached, partial work committed`; exit code `0`; positive-integer-only constraint per Zod schema.
  - [x] 10.4 INSERT a new sub-section `### --token-budget N (Story 4.5)` AFTER `### --time-budget MS (Story 4.5)`. Content covers: behaviour summary (80%-warning + 100%-halt); token-flow per AR10 (Task → Layer 1 → verify-and-advance.ts → runHistory[] → loop runner accumulator); usage example (`/bmad-loop --token-budget 200000`); exit message format `token-budget (N) reached, used X tokensIn + Y tokensOut`; exit code `0`; positive-integer-only constraint.
  - [x] 10.5 Update §FR53 exit-code mapping (lines 94-98) — `0` clean-exit list adds `time-budget-reached` and `token-budget-reached` variants.
  - [x] 10.6 Update §Behavior bullet (lines 70-73) — add `time-budget-reached` and `token-budget-reached` to the StopReason variant list.
  - [x] 10.7 Update "When NEITHER --max-iters nor any other stop condition is supplied" paragraph (lines 280-286) to extend the explicit-conditions enumeration with `--time-budget MS` and `--token-budget N`.
  - [x] 10.8 Verify §argumentHint (line 3) already includes `[--time-budget MS] [--token-budget N]` (declared per Story 4.1); no change.

- [x] **Task 11 — Update `_bmad-output/implementation-artifacts/sprint-status.yaml` (AC: all)**
  - [x] 11.1 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: flip `4-5-stop-condition-time-budget-and-token-budget: backlog → ready-for-dev` (this Story 4.5 create-story step). At dev-story completion, flip to `review`. At code-review completion, flip to `done`.
  - [x] 11.2 Bump `last_updated:` timestamp at BOTH the `# last_updated:` comment line (line 2) AND the `last_updated:` key:value line (line 38). Use `2026-05-03T09:46:00Z` (UTC ISO timestamp at create-story step).
  - [x] 11.3 sprint-status.yaml retains its original schema (no new fields). DO NOT touch any other story status.

- [x] **Task 12 — Run the full test suite + quality gates (AC: all)**
  - [x] 12.1 `bun test src/commands/loop` exit 0. Test delta projection: ~+12-18 new tests / ~+30-50 new expects on `stop-conditions.test.ts`; ~+8-12 new tests / ~+30-50 new expects on `run.test.ts`.
  - [x] 12.2 Post-Story-4.5 baseline projection: ~145-160 pass / 0 fail / ~510-580 expects across 3 loop test files.
  - [x] 12.3 Confirm `src/errors.ts` registry stays at **16 codes** (`bun test src/errors.test.ts`: 10 pass, 197 expects). Story 4.5 ships ZERO new error classes.
  - [x] 12.4 Confirm `bunx --bun tsc --noEmit` exits 0. Pay attention to the new `LoopMetrics` interface export and the extended `StopConditionFn` signature — TypeScript may surface mismatches if any predicate signatures drift.
  - [x] 12.5 Confirm `bunx --bun biome ci .` exits 0 (the modified files pass biome lint/format).
  - [x] 12.6 Confirm AR41 boundary checks at `src/commands/loop/run.test.ts:248-285` STILL PASS — Story 4.5 ships ZERO new imports.
  - [x] 12.7 Confirm `commands/bmad-loop.md` is well-formed YAML frontmatter + valid markdown body (no syntax errors). Run a markdown linter check if available.
  - [x] 12.8 Verify the 80%-warning emission test (TB_45_2 + KB_45_2) does not introduce stdout pollution — capture stderr via `stderrOverride`; assert stdout has only the AR9 final line (or none for unit-test paths).
  - [x] 12.9 Verify the `tokensPerIter` test seam works without affecting production paths — production code (no `tokensPerIter` opt) reads from `state.yaml` per Task 7.3.

- [x] **Task 13 — Final self-check (AC: all)**
  - [x] 13.1 Re-run all three quality gates one final time: `bun test src/commands/loop`, `bunx --bun biome ci .`, `bunx --bun tsc --noEmit`. All exit 0.
  - [x] 13.2 Confirm Story 4.2's existing tests STILL pass — Story 4.5 EXTENDS `stop-conditions.ts` and `evaluateStopConditions` but the existing 4 predicates are unchanged.
  - [x] 13.3 Confirm Story 4.3's existing tests STILL pass — Story 4.5 does NOT modify `nextStoryStopCondition`, `phaseEndStopCondition`, or `LoopContext`. The dispatcher signature widens but back-compatible (new param is optional).
  - [x] 13.4 Confirm Story 4.4's existing tests STILL pass — the default-cap inverted-check predicate is EXTENDED (not modified); `argv=[]` still produces 50 iters; `--max-iters 10` still exits with `max-iters (10) reached`.
  - [x] 13.5 Confirm the AR41 boundary checks pass.
  - [x] 13.6 Confirm no `console.*` in any new or modified file (per AR33).
  - [x] 13.7 Update §Dev Agent Record §Completion Notes with: (a) actual final test counts, (b) any deviations from this story spec, (c) any open questions surfaced during implementation that should be tracked in code-review.

## Dev Notes

### Architecture invariants enforced

- **AR8** (lock-free top-tier `run.ts`; lock-held `verify-and-advance.ts`): UPHELD. The Story 4.5 token-flow integration via `loadStateUnlocked` is read-only; ZERO new lock acquisitions in `run.ts`.
- **AR9** (single discriminated-union JSON line on stdout): UPHELD. Story 4.5 ADDS two variants to StopReason; the `formatExitReason` function emits the AC-1/AC-2 byte-identical exit messages. The single AR9 stdout line per command invocation is preserved. The 80%-warnings go to STDERR per FR54 — NOT stdout.
- **AR10** (token counts threaded via verify-and-advance): WIRED HERE for the FIRST loop-runner consumer. The chain: Task tool → Layer 1 markdown → `--tokens-in/--tokens-out` flags → `verify-and-advance.ts` → `runHistory[].tokensIn/tokensOut` → `runLoop` reads via `loadStateUnlocked`.
- **AR21 + AR22** (errors carry code + actionable hint): UNCHANGED. Story 4.5 ships ZERO new error classes — registry stays at 16 codes.
- **AR33** (function & error semantics; throw not Result; no console.\*; async/await): UPHELD. The two new predicates are pure functions returning `null | StopReason`; the 80%-warning emissions use `stderrFn` (existing test seam from Story 4.2); ZERO `console.*` calls; the `LoopMetrics` accumulator is a pure-record struct.
- **AR34** (slash-command markdown protocol): UNCHANGED. The `commands/bmad-loop.md` modifications are documentation-only — table flips + new sub-sections + paragraph rewrites.
- **AR41** (boundary graph): UPHELD. Story 4.5 ships ZERO new imports — the `Bun.nanoseconds()` API is built-in (no import needed); the `loadStateUnlocked` import already exists at run.ts:50.
- **AR42** (test discipline): EXTENDED. Existing colocated test files extended; AR35 tmpdir-per-test discipline preserved.

### Code paths to extend

Story 4.5's modification points (file:line refs against the current Story 4.4 baseline):

- **`stop-conditions.ts`**: INSERT `LoopMetrics` interface after `LoopContext` (line 87 area); INSERT `formatTimeBudget` helper above predicates (after `compareStoryIds`); EXTEND `StopConditionFn` type (line 112 area) with `loopMetrics?` parameter; INSERT `timeBudgetStopCondition` + `tokenBudgetStopCondition` predicates after `phaseEndStopCondition` (around line 419); EXTEND `evaluateStopConditions` (line 444-477) signature + dispatch arms.
- **`run.ts`**: EXTEND import (line 53-57) to add `type LoopMetrics`; EXTEND `StopReason` union (line 99-120) with two variants; EXTEND `LoopOpts` (line 196 area) with `tokensPerIter`; EXTEND `shouldStop` signature (line 221-228) + invocation (line 505-512); UPDATE JSDoc forward-tracker (line 391-395); EXTEND default-cap inverted-check (line 399-407); INSERT `loopMetrics` initialiser before `while` loop (around line 488); INSERT token accumulation + 80%-warning emission after `iterations.push` (around line 543); EXTEND `formatExitReason` switch (line 639-659); UPDATE EXIT-CODE MAPPING JSDoc (line 29-33).
- **`stop-conditions.test.ts`**: INSERT describe blocks for new predicates + helper + dispatcher priority + purity (end of file).
- **`run.test.ts`**: UPDATE top-of-file comment (line 1-27); INSERT describe blocks for Tests TB_45_*, KB_45_*, SWEEP_45 (end of file).
- **`commands/bmad-loop.md`**: UPDATE intro (line 13-17); UPDATE Behavior bullet (line 70-73); UPDATE FR53 mapping (line 94-98); FLIP `--time-budget MS` + `--token-budget N` rows in Stop Conditions table (line 168-182); INSERT new sub-sections `### --time-budget MS (Story 4.5)` + `### --token-budget N (Story 4.5)` after `### --phase-end (Story 4.3)` (after line 279); UPDATE "When NEITHER" paragraph (line 280-286).

### `LoopMetrics` design contract

`LoopMetrics` mirrors `LoopContext` (Story 4.3) in shape: a small immutable struct that `runLoop` initialises at loop entry and updates per-iteration via spread (the runner replaces the entire struct). Field semantics:

- `startedAtNs` (Bun.nanoseconds() snapshot — monotonic clock; resistant to system-clock adjustments; reuses `loopStartNs` from Story 4.1's `durationMs` computation).
- `tokensIn` / `tokensOut` (cumulative sums; start at 0; grow monotonically; no decrement support per OQ-10).
- `warned80Time` / `warned80Token` (per-loop-run latches; once set, prevent repeated 80%-warning emissions; tracked as OQ-6).

### Token-flow source per AR10

The architecture-mandated chain (architecture line 1661+1677):

1. Task tool's response carries `usage.input_tokens` / `usage.output_tokens` (Claude API contract).
2. Layer 1's slash-command markdown captures these (per `commands/bmad-next.md`).
3. `bun run src/commands/next/verify-and-advance.ts -- --run-id <id> --tokens-in <n> --tokens-out <n>` — Layer 1 invokes verify-and-advance with the captured tokens.
4. `verify-and-advance.ts:507-521` writes them into `state.runHistory[].{tokensIn, tokensOut}` (per Story 2.6).
5. Story 4.5 loop runner reads `state.runHistory[]` after each iteration via `loadStateUnlocked`.

The v0.1 SKELETON loop runner per Story 4.1 / 4.4 does NOT yet wire the per-iteration Task→verify-and-advance flow IN-PROCESS — production-path token reads work via the existing `stateFn` per Story 4.2 (the just-completed iteration's `verify-and-advance.ts` writes a `runHistory[]` entry, then the loop runner re-reads). For TEST PATHS, the new `tokensPerIter` seam bypasses the state.yaml round-trip. Tracked as Open Question 7.

### Deferred-baseline pattern (Story 4.3 forward-tracker I-3)

Story 4.3's pattern has THREE per-iteration `stateFn` calls: (1) loop-entry baseline, (2) pre-iter shouldStop check, (3) post-iter deferred-baseline update. Story 4.5 ADDS a fourth: (4) post-iter token accumulation. v0.1 conservative ALLOWS the 4-call pattern — calls (3) and (4) COULD merge (both post-iter) but the deferred-baseline + token-accumulator logic are conceptually distinct. Tracked as Open Questions 8 + 9.

### AC-1 byte-identical message format

`formatTimeBudget(args.timeBudgetMs)` produces the unit suffix via cascade (h → m → s → ms; first that exactly divides). Examples:
- `7_200_000 → "2h"` → `time-budget (2h) reached, partial work committed` (AC-1 verbatim).
- `5_400_000 → "90m"` (1.5h cascades to minutes).
- `1_500 → "1500ms"` (sub-second).

"partial work committed" is byte-identical to AC-1 wording — lowercase, no trailing period (FR54 single-line).

### AC-2 exit message includes usage stats

AC-2 says "the exit reason includes the actual usage stats" — interpretive. v0.1 chose `token-budget (N) reached, used X tokensIn + Y tokensOut` for: (1) self-describing labels (NOT positional integers); (2) sum-evident (reader can verify `X + Y` against `N`). Alternatives considered + rejected: `used Z total` (loses in/out split per "stats" plural); `(N=N, in=X, out=Y, total=X+Y)` (verbose; non-natural). Tracked as Open Question 3.

### Errors registry + Story 4.6+ forward-trackers

ZERO new error classes (registry holds at 16). The new predicates are pure-function checks; 80%-warning emissions use existing `stderrFn`. Forward-trackers:

- **Story 4.6**: EXTEND default-cap inverted-check with `&& args.stopOnError !== true && args.continueOnError !== true`; EXTEND halt-on-error short-circuit (run.ts:578-587) to gate on `args.continueOnError`; address Story 4.1 SF-2 (`IterationRecord.action "unknown"`).
- **Story 4.7**: May add `&& args.planFirst !== true` clause; plan-first DRY-RUN never enters iteration body.
- **Story 4.10**: ENRICH `formatExitReason` cases for the two new variants with `--resume` hint format using `state.lastFailureReason.hint`.

### Test-suite impact + per-iteration timing test pattern

Post-Story-4.4 baseline: 126 / 0 / 432 across 3 files. Story 4.5 adds ~+12-18 tests on `stop-conditions.test.ts` (5-6 sub-tests per predicate + dispatcher/purity) + ~+8-12 tests on `run.test.ts` (TB_45_1-4, KB_45_1-5, SWEEP_45). Net post-4.5: ~146-160 / 0 / ~510-580.

Tests TB_45_1-3 use `Bun.sleep(50)` inside the `runNextOverride` stub to advance real wall-clock time (not mocked). Rationale: mocking `Bun.nanoseconds()` is brittle; `Bun.sleep` is fast (~50ms/iter; total test < 500ms); loose bound `≤ 3 iters` absorbs scheduler variance. Tracked as Open Question 5.

### N-1 cosmetic nit inheritance

Story 4.2's defensive null check at `stop-conditions.ts:208` (unreachable `=== null` arm given optional-chain returns `undefined`) — Story 4.5 INHERITS unchanged because the file modification is purely additive (predicates appended; helpers added before predicates; line 208's `untilEpicEndStopCondition` untouched). Forward-tracker for opportunistic cleanup.

## Open Questions for Code Review

1. **`formatTimeBudget` cascade for non-exact inputs** (e.g., `5400000` = 1.5h cascades to `"90m"`). v0.1 cascade vs round-up (`"2h"` misleading) vs decimal (`"1.5h"` non-AC-exemplary). v0.1 chooses cascade.

2. **`timeBudgetStopCondition` reads `Bun.nanoseconds()` directly inside the predicate vs. accepting `elapsedMs` on `LoopMetrics`**: v0.1 reads inside predicate (no stale-value risk; simpler runner). Trade-off: predicate-side (v0.1) vs runner-side (more consistent with token accumulator).

3. **AC-2 message format `token-budget (N) reached, used X tokensIn + Y tokensOut`**: AC-2 wording is interpretive. v0.1 chose self-describing labelled form (vs positional `(N=N, in=X, out=Y)` or minimal `at Z tokens`). Tracked here.

4. **Dispatcher priority — budget predicates AFTER 4.2/4.3 predicates**: explicit user-facing flags win over budget exhaustion when both fire on same iteration. Trade-off: budget-after (v0.1) vs budget-before ("halt no matter what" use case).

5. **Real wall-clock vs mocked time in TB_45_* tests**: v0.1 uses `Bun.sleep(50)` with loose bounds. Mocking `Bun.nanoseconds()` is brittle.

6. **80%-warning latches — ONCE-PER-RUN vs repeated each iteration**: v0.1 once-per-run (clean signal; no spam). Latches reset on a new `runLoop` invocation since `LoopMetrics` is initialised fresh.

7. **`tokensPerIter` test seam vs production state.yaml read**: v0.1 dual-path (production reads state, tests inject directly). Single-path would force tests to construct full `runHistory[]` arrays.

8. **Per-iteration `stateFn` call count grows from 3 (Story 4.3) to 4 (this story adds token accumulation)**: v0.1 does NOT merge; deferred-baseline and token-accumulator are conceptually distinct.

9. **`LoopMetrics`-cached state read pattern**: COULD avoid repeated `stateFn` reads. v0.1 defers — production reads are sub-3ms; test seams bypass I/O.

10. **Token accumulator does NOT support decrement**: v0.1 monotonic-only. Decrement support would add complexity for an unverified use case.

11. **`--time-budget` AND `--token-budget` both supplied — which wins?**: v0.1 declaration order (time before token in dispatcher). `time-budget-reached` wins when both fire on same iteration.

12. **`runHistory[]` schema is `z.unknown()`**: Story 4.5 reads tokens defensively via typeof guards. Strict-schema alternative would force Story 6.x schema bump.

## Forward Action Items

- **Story 4.6 (`--stop-on-error` / `--continue-on-error` policy)**: EXTEND the default-cap inverted-check stanza at `run.ts:399-407` with `&& args.stopOnError !== true && args.continueOnError !== true` clauses. EXTEND the halt-on-error short-circuit at `run.ts:578-587` to gate on `args.continueOnError`. Address Story 4.1 SF-2 (IterationRecord.action "unknown" union member).
- **Story 4.7 (`--plan-first` dry-run preview)**: Decide whether `--plan-first` requires `&& args.planFirst !== true` clause in the default-cap inverted check OR whether plan-first should skip the injection entirely (since plan-first is a DRY-RUN; the loop body never executes).
- **Story 4.10 (Loop exit reason + resume hint format)**: ENRICH the `formatExitReason` cases for `time-budget-reached` and `token-budget-reached` (both Story 4.5 deliverables) with `--resume` hint format using `state.lastFailureReason.hint` (per Story 3.1). Story 4.5's variants are integration points.
- **N-1 cosmetic nit (inherited from Story 4.2/4.3/4.4)**: defensive `epicNum === undefined || epicNum === null` check at `stop-conditions.ts:208` has unreachable `=== null` arm. Cosmetic; preserved in 4.5 because the modification is additive (line 208 untouched). Forward-tracker for opportunistic cleanup.
- **N-2 cosmetic nit (inherited from Story 4.2/4.3/4.4)**: `EMPTY_DAG` sentinel at `run.ts:277-281` positioned mid-file. KEPT in 4.5 because the time/token budget predicates do NOT consume the DAG; promoting DAG to always-build incurs unnecessary cost. Cleanup deferred to a future story that has a substantive reason to always-build the DAG.
- **D3 forward-tracker (per-iteration state caching)**: Story 4.5 introduces a 4th per-iteration `stateFn` call (for token accumulation) — the deferred-baseline pattern from Story 4.3 already had 3. Future story may merge calls or introduce a `LoopMetrics`-cached state fingerprint. Tracked as Open Question 8 + 9.
- **Story 6.x (schema tightening)**: `state.runHistory[]` is currently `z.unknown()` per Story 1.5. Story 4.5 reads defensively via typeof guards. A future schema bump may tighten the entry shape to declare `tokensIn`, `tokensOut`, `step`, etc. fields explicitly.

## References

- `_bmad-output/planning-artifacts/epics.md` lines 956-970 — AC verbatim source.
- `_bmad-output/planning-artifacts/prd.md` line 699 (FR23) + lines 596-597 (80%-warning + 100%-halt pattern) + line 582-583 (stop-condition table — "Clean exit, partial work committed").
- `_bmad-output/planning-artifacts/architecture.md` lines 1661 + 1677 (AR10 token-flow contract) + §AR8/9/21/22/33/34/41/42 invariants.
- `_bmad-output/implementation-artifacts/4-4-stop-condition-max-iters-and-default-cap.md` — predecessor (status done; verdict approve); SDR I-1 mandates Story 4.5 extension of default-cap inverted-check + LoopMetrics interface.
- `_bmad-output/implementation-artifacts/4-3-stop-condition-next-story-and-phase-end.md` — `LoopContext` template; deferred-baseline pattern; opt-in DAG load template.
- `_bmad-output/implementation-artifacts/4-2-stop-condition-epic-end-and-story-x-y.md` — `stop-conditions.ts` module structure + `evaluateStopConditions` dispatcher.
- `_bmad-output/implementation-artifacts/4-1-bmad-loop-command-skeleton.md` — `LoopArgsSchema` `timeBudgetMs` + `tokenBudget` declarations (parsed-only); `IterationRecord` shape.
- `src/commands/loop/run.ts` (687 lines), `src/commands/loop/stop-conditions.ts` (478), `src/commands/loop/run.test.ts` (1003), `src/commands/loop/stop-conditions.test.ts` (718), `commands/bmad-loop.md` (365) — files to modify.
- `src/commands/loop/args.ts` (308) — UNCHANGED (timeBudgetMs + tokenBudget already declared per 4.1).
- `src/commands/next/verify-and-advance.ts:510-521` — `RunHistoryEntry { runId, step, epic, story, verifierStatus, promotedTo, durationMs, tokensIn, tokensOut, ts }` — Story 4.5 reads the LATEST entry's tokens.
- `src/commands/next/args.ts:336-352` — `VerifyAndAdvanceArgsSchema` defines the tokens flag inputs flowing from Layer 1.
- `src/schemas/state.ts:117-118` — `runHistory: z.array(z.unknown()).max(100).default([])` — defensive typeof guards required.
- `src/errors.ts` — registry held at 16; ZERO new classes in Story 4.5.
- `.bmad-stepper/runs/2026-05-03T093130Z-bmad-next/tasks/t1-code-review.yaml` — Story 4.4 SDR I-1 mandates Story 4.5's extension.

## Dev Agent Record

### Context Reference

Inputs (full list in §References + frontmatter `inputDocuments`).

### Agent Model Used

claude-opus-4-7[1m].

### Debug Log References

- Iter 5 of /bmad-loop run `2026-05-03T090459Z-bmad-loop` was opened at
  2026-05-03T10:10:36Z but interrupted before any task output was
  produced. The new /bmad-loop session resumed it (`resumedAt:
  2026-05-03T14:00:00Z`) — task records carry over the same run id
  `2026-05-03T101036Z-bmad-next`.
- Story spec contradiction discovered + repaired: Task 7.6/7.7 preserved
  the `if (state !== null) { evaluateStopConditions(...) }` guard, but
  Tests TB_45_*/SWEEP_45-A in Task 9 use `stateOverride: () => null`.
  Budget predicates do NOT consume `_state` (underscore-prefixed) so the
  fix was to invoke them directly in `shouldStop` outside the
  state-guarded path with an `EMPTY_STATE` sentinel (analogous to
  Story 4.2's `EMPTY_DAG` sentinel). Tracked as deviation §dev-1 below.
- LoopMetrics fixture for predicate unit tests required
  `startedAtNs: -1e15` (a far-past sentinel) to force `elapsedMs >>
  budgetMs` boundary tests; `startedAtNs: 0` (Bun.nanoseconds is
  process-uptime in ns) only generates a few ms of elapsed at test time
  which is insufficient for budget=3_600_000ms tests.

### Completion Notes List

- **Tasks 0-13: COMPLETE.** All 14 tasks / ~103 subtasks marked done.
- **Quality gates (final values):**
  - `bun test src/commands/loop` — **163 pass / 0 fail / 500 expects**
    across 3 files (baseline 126/0/432 → +37 tests / +68 expects).
  - Full regression `bun test` — **890 pass / 0 fail / 3237 expects**
    across 59 files (baseline 853/0/3169 → +37 / +68; **zero
    regressions** on existing 4.1-4.4 / pre-Epic-4 tests).
  - `bun test src/errors.test.ts` — **10 pass / 0 fail / 197 expects**;
    error registry holds at **16 codes** (zero new error classes added).
  - `bunx --bun tsc --noEmit` — clean exit 0.
  - `bunx --bun biome ci .` — clean exit 0; 134 files checked.
- **AR41 boundary check**: PASS — Story 4.5 ships ZERO new imports.
  `Bun.nanoseconds()` is built-in (no import); the only new symbols
  come from the same `./stop-conditions.ts` import group already in
  use (`LoopMetrics` + `timeBudgetStopCondition` +
  `tokenBudgetStopCondition`).
- **AC-1 byte-identical message** verified: TB6 unit test asserts
  `formatTimeBudget(7_200_000)` → `"2h"` and the predicate's
  `stopReason.message === "time-budget (2h) reached, partial work
  committed"` (epics.md line 966 verbatim).
- **AC-2 message format** verified: KB6 unit test asserts
  `tokenBudgetStopCondition({ tokenBudget: 200_000, ... })` produces
  `"token-budget (200000) reached, used 175000 tokensIn + 30000
  tokensOut"` byte-identical (per OQ-3 v0.1 self-describing labelled
  form).
- **Open Questions for code-review (12 from spec + 1 NEW):**
  - **NEW dev-1** (deviation): `shouldStop` calls budget predicates
    directly (not via dispatcher) when `state === null`, using an
    `EMPTY_STATE` sentinel. Story spec Task 7.7 had budget predicate
    dispatch inside the `if (state !== null)` block which would fail
    when tests pass `stateOverride: () => null`. Recommend reviewer
    adjudicate whether to (a) keep the EMPTY_STATE sentinel pattern
    as-is (additive, minimal change), (b) refactor
    `evaluateStopConditions` to accept `state: State | null` and have
    each predicate that needs state short-circuit on null, or (c)
    update test fixtures to construct minimal non-null states.
    v0.1 chose (a) for minimal blast radius.
  - The 12 OQs from §Open Questions for Code Review carry forward
    unchanged.
- **Forward action items inherited unchanged** (4 items from §Forward
  Action Items): N-1 (defensive null check at stop-conditions.ts:208),
  N-2 (EMPTY_DAG sentinel), D3 (per-iteration state caching), Story 6.x
  schema tightening for `runHistory[]`.
- **Bun host**: 1.3.12 (satisfies AR2 Bun >= 1.3).

### File List

**Modified** (planned):

- `src/commands/loop/stop-conditions.ts` — `LoopMetrics` interface + `formatTimeBudget` helper + `timeBudgetStopCondition` + `tokenBudgetStopCondition` predicates; `evaluateStopConditions` + `StopConditionFn` signatures extended; ~+150-220 net lines.
- `src/commands/loop/run.ts` — `StopReason` union + 2 variants; `LoopOpts` + `tokensPerIter`; `shouldStop` + `loopMetrics` thread; default-cap inverted-check extended; `loopMetrics` initialiser + per-iter token accumulation + 80%-warning emission; `formatExitReason` extended; ~+100-150 net lines.
- `src/commands/loop/stop-conditions.test.ts` — TB1-TB6 + KB1-KB6 + `formatTimeBudget` + dispatcher priority + purity tests; ~+200-300 net lines.
- `src/commands/loop/run.test.ts` — Tests TB_45_1-4 + KB_45_1-5 + SWEEP_45; top-of-file comment update; ~+200-300 net lines.
- `commands/bmad-loop.md` — table flips + new sub-sections + paragraph rewrites; ~+30-50 net lines.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — flip 4-5 ready-for-dev → review; bump last_updated.
- `_bmad-output/implementation-artifacts/4-5-stop-condition-time-budget-and-token-budget.md` — frontmatter status; checkboxes; Dev Agent Record + Change Log populated.

**Unchanged**: `src/commands/loop/args.ts`, `src/commands/loop/index.ts`, `src/commands/next/run.ts`, `src/commands/next/verify-and-advance.ts`, `src/commands/next/args.ts`, `src/schemas/state.ts`, `src/errors.ts`.

## Senior Developer Review (AI)

**Reviewer:** bmad-code-review (iter 6 of /bmad-loop run `2026-05-03T143000Z-bmad-next`, loop `2026-05-03T090459Z-bmad-loop`)
**Review date:** 2026-05-03
**Verdict:** ✅ **approve**
**Counts:** 0 must-fix / 0 should-fix / 2 nits inherited (N-1, N-2 from 4.2/4.3/4.4) / 8 info forward-trackers

### AC verification (file:line evidence)

| AC | Verdict | Evidence |
|----|---------|----------|
| **AC-1** `--time-budget` 80%-warning + 100%-halt with `time-budget (Xh) reached, partial work committed` | ✅ PASS | Predicate: `src/commands/loop/stop-conditions.ts:495-511` (timeBudgetStopCondition); message format: `:509` (`time-budget (${unit}) reached, partial work committed`); 80%-warning emission: `src/commands/loop/run.ts:686-693` via `stderrFn`; tests: TB1-TB6 (`stop-conditions.test.ts:884-959`), TB_45_1-4 + Sweep-45-A (`run.test.ts:993-1118` + `:1228+`); TB6 asserts byte-identical AC-1 message at `:947`. |
| **AC-2** `--token-budget` 80%-warning + 100%-halt + exit reason includes usage stats | ✅ PASS | Predicate: `stop-conditions.ts:565-585` (tokenBudgetStopCondition); message format: `:583` (`token-budget (N) reached, used X tokensIn + Y tokensOut`); 80%-warning emission: `run.ts:694-704` via `stderrFn`; tests: KB1-KB6 (`stop-conditions.test.ts:962-1067`), KB_45_1-5 + Sweep-45-B (`run.test.ts:1119-1227` + `:1240+`); KB6 asserts byte-identical text at `:1053`. |

### AR upheld checklist

| AR | Status | Evidence |
|----|--------|----------|
| **AR8** lock-free top-tier | UPHELD | run.ts only adds `loadStateUnlocked` reads (already imported); no `src/lock/` import. |
| **AR9** single AR9 line per command | UPHELD | 80%-warnings go to **stderr** (`stderrFn` at run.ts:686, 695), not stdout. The AR9 stdout line is still emitted only by `import.meta.main` block (run.ts:738+). |
| **AR10** token-flow | WIRED — Story 4.5 is the FIRST loop-runner consumer per architecture.md lines 1661+1677. Production path: run.ts:660-679 reads `state.runHistory[].{tokensIn,tokensOut}` via `stateFn` defensive typeof guards; test seam: `tokensPerIter` at LoopOpts (run.ts:213-222). |
| **AR21+22** errors | UNCHANGED | Registry holds at 16 codes; zero new error classes; verified by `bun test src/errors.test.ts` 10/0/197. |
| **AR33** no console.*; throw-not-Result | UPHELD | grep "console\\." in run.ts/stop-conditions.ts → only doc-comment references; predicates return `null \| StopReason` (no throws). |
| **AR34** slash-command markdown | UPDATED | `commands/bmad-loop.md` table flips + 2 new sub-sections + intro/Behavior/FR53/"When NEITHER" updates — documentation-only per AR34. |
| **AR41** boundary graph | UPHELD | ZERO new imports — `Bun.nanoseconds()` is built-in (no import); the 2 new imported symbols (`LoopMetrics`, `timeBudgetStopCondition`, `tokenBudgetStopCondition`) come from the same `./stop-conditions.ts` import group already in baseline. Module-set unchanged. |
| **AR42** test discipline | EXTENDED | Colocated tests; tmpdir-per-test preserved; +37 tests / +68 expects across 2 test files. |

### Quality gates (independently re-verified)

- `bun test src/commands/loop` → **163 pass / 0 fail / 500 expects** across 3 files.
- Full regression `bun test` → **890 pass / 0 fail / 3237 expects** across 59 files (zero regressions).
- `bun test src/errors.test.ts` → **10 pass / 0 fail / 197 expects**; registry **16 codes**.
- `bunx --bun tsc --noEmit` → exit 0 (clean).
- `bunx --bun biome ci .` → exit 0 (134 files; clean).

### Open Questions adjudication (12 spec OQs + 1 dev-1 deviation = 13 total)

| OQ | Topic | Decision | Rationale |
|----|-------|----------|-----------|
| 1 | `formatTimeBudget` cascade for non-exact inputs | **ACCEPT** | Cascade is unambiguous + deterministic + AC-1 exemplar matches exactly. |
| 2 | `Bun.nanoseconds()` inside predicate vs runner | **ACCEPT** | Predicate-side keeps LoopMetrics immutable; sub-microsecond cost is acceptable per NFR-P1. |
| 3 | AC-2 message format `(N) reached, used X tokensIn + Y tokensOut` | **ACCEPT** | Self-describing labels resist misinterpretation; KB6 test enforces byte-identical text. |
| 4 | Dispatcher priority budget-after | **ACCEPT** | Explicit user-facing flags should win over implicit budget exhaustion when both fire. EVAL_45_1 enforces. |
| 5 | Real wall-clock vs mocked time in TB tests | **ACCEPT** | `Bun.sleep(50)` with loose `≤5 iters` bound; total test ~250ms; mocking `Bun.nanoseconds()` is brittle. |
| 6 | 80%-warning latches once-per-run | **ACCEPT** | Avoids spam; KB_45_2 test asserts exactly 1 warning emission. |
| 7 | `tokensPerIter` test seam vs production state.yaml | **ACCEPT** | Dual-path is consistent with project's test-seam preference (Story 1.6 + Epic 3 retro). KB_45_5 covers production reading path. |
| 8 | 4 stateFn calls per iter (was 3 in 4.3) | **DEFER** | Forward-tracker D3; production reads <3ms; test seams bypass I/O entirely. |
| 9 | LoopMetrics-cached state read pattern | **DEFER** | Same as OQ-8; let a future story with substantive caching motivation drive the refactor. |
| 10 | Token accumulator monotonic-only | **ACCEPT** | Decrement support solves no current use case; Story 6.x can revisit if needed. |
| 11 | `--time-budget` AND `--token-budget` both supplied | **ACCEPT** | Time-before-token in declaration order; EVAL_45_2 test enforces. |
| 12 | `runHistory[]` schema is `z.unknown()` | **ACCEPT** | Defensive typeof guards in run.ts:670-678 are correct; Story 6.x schema bump is separate concern. |
| **dev-1** | `EMPTY_STATE` sentinel for budget predicates when state is null | **ACCEPT** | Minimal blast radius; analogous to Story 4.2 EMPTY_DAG sentinel; alternative refactors (predicate signature widening to `state: State \| null`) deferred to forward-tracker. Documented inline at run.ts:303-318. |

### Forward action items (for Story 4.6/4.7/4.10/6.x)

| Item | Target story | Action |
|------|--------------|--------|
| N-1 (defensive null check at stop-conditions.ts:208) | opportunistic cleanup | INHERITED from 4.2/4.3/4.4 unchanged |
| N-2 (EMPTY_DAG sentinel mid-file) | future story | INHERITED unchanged |
| D3 (per-iteration state caching, 4 calls now per iter) | future story | NEW forward-tracker |
| dev-1 alternative refactor (`state: State \| null` in evaluateStopConditions) | Story 4.6+ if more state-optional predicates emerge | NEW forward-tracker |
| Story 4.6 default-cap inverted-check extension | 4.6 | EXTEND with `&& args.stopOnError !== true && args.continueOnError !== true` |
| Story 4.7 default-cap clause | 4.7 | EXTEND with `&& args.planFirst !== true` |
| Story 4.10 `formatExitReason` enrichment | 4.10 | Add `--resume` hint to time/token-budget cases |
| Story 6.x runHistory[] schema tightening | 6.x | Replace `z.unknown()` with structured entry type |

### Notes for the user

- The dev-1 deviation is benign (additive code, existing pattern), but worth a glance: see run.ts:303-318 (`EMPTY_STATE` sentinel and the `else if (loopMetrics !== null)` branch in `shouldStop`).
- The 80%-warning latches reset only on a NEW `runLoop` invocation (LoopMetrics is initialised fresh per call). If the user's overnight runs span multiple `/bmad-loop` invocations chained via `--resume`, each will emit its own 80%-warning. This is by design (per OQ-6).
- AC-2's "exit reason includes the actual usage stats" is interpretive; chosen format includes both the budget (N) and the in/out split (X+Y) so readers can verify the sum themselves. KB6 enforces byte-identical text against this choice.

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-05-03 | bmad-create-story (Iteration 4 of /bmad-loop run 2026-05-03T094229Z-bmad-next, loop 2026-05-03T090459Z-bmad-loop) | Initial story spec — status: ready-for-dev. |
| 2026-05-03 | bmad-dev-story (Iteration 5 of /bmad-loop run 2026-05-03T101036Z-bmad-next, loop 2026-05-03T090459Z-bmad-loop, RESUMED) | Implementation: `LoopMetrics` interface + `formatTimeBudget` helper + `timeBudgetStopCondition` + `tokenBudgetStopCondition` predicates; `evaluateStopConditions` extended; `StopReason` extended with 2 variants; default-cap inverted-check extended with `--time-budget` + `--token-budget` clauses; `runLoop` initialises + accumulates `LoopMetrics` per-iter; 80%-warnings emitted to stderr via `stderrFn`; new `tokensPerIter` test seam; `formatExitReason` extended. Quality gates: 163/0/500 loop tests, 890/0/3237 full regression, tsc clean, biome clean. Status: in-progress → review. |
| 2026-05-03 | bmad-code-review (Iteration 6 of /bmad-loop run 2026-05-03T143000Z-bmad-next, loop 2026-05-03T090459Z-bmad-loop) | Senior Developer Review: verdict **approve** (0 must-fix / 0 should-fix / 2 nits inherited / 8 info forward-trackers); AC-1 + AC-2 PASS with file:line evidence; AR8/9/10/21/22/33/34/41/42 UPHELD or EXTENDED; quality gates re-verified independently (163/0/500 loop, 890/0/3237 full, errors registry 16, tsc 0, biome 0); 12 spec OQs + 1 dev-1 deviation adjudicated (11 ACCEPT + 2 DEFER + 0 REJECT); 8 forward-trackers recorded for 4.6/4.7/4.10/6.x. Status: review → done. |
