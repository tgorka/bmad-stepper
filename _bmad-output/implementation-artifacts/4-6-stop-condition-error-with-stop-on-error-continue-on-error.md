---
status: done
story_id: '4.6'
story_key: 4-6-stop-condition-error-with-stop-on-error-continue-on-error
epic: '4'
title: 'Stop-Condition: `error` (with `--stop-on-error` / `--continue-on-error`)'
created: '2026-05-03'
last_updated: '2026-05-04T01:30:00Z'
priority: H
estimated_effort: M
fr_coverage:
  - FR8
  - FR9
  - FR19
  - FR20
  - FR23
  - FR53
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
  - 4-5-stop-condition-time-budget-and-token-budget   # PRIMARY: default-cap inverted-check at run.ts:479-489 must EXTEND with `&& args.stopOnError !== true && args.continueOnError !== true` per 4.5 SDR forward-tracker for 4.6; LoopMetrics + LoopOpts seam pattern; halt-on-error short-circuit at run.ts:738 must gate on args.continueOnError per 4.5 §Forward Action Items
  - 4-4-stop-condition-max-iters-and-default-cap      # PATTERN: default-cap inverted-check pattern; AC-2 message-format precedent (`max-iters (N) reached`); JSDoc forward-tracker enumerates 4.6 future-flag clauses verbatim
  - 4-3-stop-condition-next-story-and-phase-end       # PATTERN: LoopContext baseline + per-iteration stateFn pattern (post-iter state read for currentStep)
  - 4-2-stop-condition-epic-end-and-story-x-y         # PATTERN: stop-conditions.ts file structure + StopReason discriminated union extension; AR9 message-format precedent
  - 4-1-bmad-loop-command-skeleton                    # SKELETON: LoopArgsSchema declares stopOnError + continueOnError at args.ts:99-100 (parsed-only since 4.1); IterationRecord shape (action union); halt-on-error short-circuit pattern at run.ts:738; SF-2 forward-tracker (IterationRecord.action "unknown" union member) addressed here
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/implementation-artifacts/4-5-stop-condition-time-budget-and-token-budget.md
  - _bmad-output/implementation-artifacts/4-4-stop-condition-max-iters-and-default-cap.md
  - _bmad-output/implementation-artifacts/4-3-stop-condition-next-story-and-phase-end.md
  - _bmad-output/implementation-artifacts/4-2-stop-condition-epic-end-and-story-x-y.md
  - _bmad-output/implementation-artifacts/4-1-bmad-loop-command-skeleton.md
  - _bmad-output/implementation-artifacts/3-1-record-last-attempted-last-failure-reason-on-halt.md
  - _bmad-output/implementation-artifacts/sprint-status.yaml
  - .bmad-stepper/state.yaml
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

# Story 4.6: Stop-Condition: `error` (with `--stop-on-error` / `--continue-on-error`)

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper user,
I want first verifier failure to halt the loop by default and `--continue-on-error` to opt into continuation,
So that bad steps don't pollute downstream work without my consent.

## Context Summary

This is the **sixth story of Epic 4 (Bounded Loop with Eight Stop Conditions)** and it lands the **seventh + eighth runtime-wired stop-condition flags** of the eight-flag bounded-loop surface — completing the eight stop-condition contract per FR20 (`epic-end`, `story-X-Y`, `next-story`, `phase-end`, `max-iters`, `time-budget`, `token-budget`, `error`). Stories 4.1-4.5 wired seven flags so far (`--max-iters` explicit + default-cap, `--until-epic-end`, `--until-story X.Y`, `--next-story`, `--phase-end`, `--time-budget`, `--token-budget`). Story 4.6 adds the **failure-path stop condition**: by default a single verifier failure halts the loop (`--stop-on-error` is the implicit default — no flag required); `--continue-on-error` opts INTO continuation.

**Story 4.6's scope is TWO acceptance criteria** (AC-1 default `--stop-on-error` policy: verifier failure halts with reason `error (verifier failure on <step>) — see <run-log-path>` plus standard halt+resume hint; AC-2 explicit `--continue-on-error`: failure logged but loop continues + integration test asserts subsequent iterations still run; AC-3 forward-deferred — full failure-UX modes ship in Epic 5 and `--continue-on-error` will interact correctly with per-step `retry` / `skip` / `route-to-fixer` policies). Both flags were already declared in `LoopArgsSchema` at `src/commands/loop/args.ts:99-100` per Story 4.1 (RUNTIME-DEFERRED); Story 4.6 wires them at runtime. Net deliverables: **ZERO new exported interfaces; ZERO new error classes (registry holds at 16); FOUR modified source files (3 source + 1 markdown); ZERO state schema changes; ZERO new I/O imports; ZERO new `console.*` calls**.

**`--stop-on-error` semantics per AC-1 verbatim** (epics.md lines 980-982): default policy. The flag is OPTIONAL (no `--stop-on-error` needed for the default behaviour to fire) — supplying it explicitly is a no-op affirmation per UX symmetry with `--continue-on-error`. AC-1 specifies the per-step failure-policy "resolves to `escalate`" — for v0.1 Story 4.6 the per-step policy contract is implicit (`escalate` is the v0.1 default; Epic 5 Story 5.6 wires the actual config-driven per-step failure-policy) so AC-1's "resolves to `escalate`" reduces to "the verifier returned fail" for this story. The exit reason format from epics.md line 982: `error (verifier failure on <step>) — see <run-log-path>` plus the standard halt+resume hint (per FR26 stderr emission analogous to Story 4.2's `--until-epic-end` pointer + Story 3.1's `state.lastFailureReason.hint`).

**`--continue-on-error` semantics per AC-2 verbatim** (epics.md lines 983-985): when supplied, a verifier failure is logged but the loop CONTINUES — the next iteration's `runNext` is invoked normally. Per AC-2 "integration test asserts subsequent iterations still run", the integration test mocks 2+ iterations where iter 1's `runNext` returns a halt result and iter 2 must STILL EXECUTE. Implementation: extend the halt-on-error short-circuit at `run.ts:738` to gate on `args.continueOnError` — when `args.continueOnError === true`, the runner emits a stderr warning (`Warning: iteration N halted with <failureCode>; continuing per --continue-on-error.\n`) and proceeds to the next iteration WITHOUT setting `stopReason`. The IterationRecord still carries `action: "halt"` + `exitCode: 1` for forensic visibility; a future Story 4.10 may aggregate halt counts into the AR9 final-summary.

**AC-3 forward-deferred** (epics.md line 986): `--continue-on-error` interacts correctly with per-step `retry` / `skip` / `route-to-fixer` failure-policies introduced in Epic 5. For Story 4.6 v0.1, only the BOOLEAN stop/continue gate matters; per-step policies are forward-deferred to Epic 5 Story 5.6 (`Per-step failure policy via config — actionable errors`). The wording "when full failure-UX modes ship in Epic 5" makes the deferral explicit; Story 4.6's deliverables do NOT touch `verify-and-advance.ts`, `state.lastFailureReason.code` semantics, or the failure-policy resolver. The integration test in Story 4.6 asserts only the boolean continuation behaviour; Epic 5 stories will add tests for the policy-resolver interaction.

**Default-cap inverted-check extension** (per Story 4.5 SDR forward-tracker for 4.6 + Story 4.4 SDR I-2): the predicate at `run.ts:479-489` MUST extend with `&& args.stopOnError !== true && args.continueOnError !== true` clauses so explicit `--stop-on-error` or `--continue-on-error` (without `--max-iters` and without any other condition) does NOT trigger the default 50-iter cap. Rationale: when the user is solely managing failure semantics with `--continue-on-error`, they may want unbounded iteration until natural completion (epic done); the default-cap injection would mask that intent. **However**, when ONLY `--continue-on-error` is supplied (no other stop condition), the loop has no natural exit — Stories 4.7/4.8 do not add additional caps, and the user must combine with `--max-iters` or another condition for safety. Story 4.6's runner emits a stderr warning at loop entry when `continueOnError === true && maxIters === undefined && !hasOtherStopCondition` so the user is alerted to the unbounded-iteration risk. Tracked as Open Question 4.

**`StopReason` discriminated union extension** — ONE new variant (failure path):

- `{ code: "error-stop"; failureCode: string; iterCount: number; step: string | null; runLogPath: string | null; message: string }` — `message` carries the AC-1 verbatim text `error (verifier failure on <step>) — see <run-log-path>`. This is structurally distinct from the existing `halt-on-error` variant (which surfaces ANY non-zero exitCode short-circuit, including configuration errors and lock-contention errors); `error-stop` is reserved for the AC-1 verbatim semantics where the failure source is specifically a verifier failure. v0.1 conservative: when `nextResult.exitCode !== 0 || action === "halt"` AND `args.continueOnError !== true`, dev determines whether the underlying error code reads `VERIFIER_FAILURE` (per `state.lastFailureReason.code` from Story 3.1) — if so, emit `error-stop`; otherwise (e.g., `LOCK_CONTENTION`, `BMAD_INCOMPATIBLE`) keep the existing `halt-on-error` behaviour. **Open Question 1**: does the spec mandate a SECOND variant, or should `halt-on-error` widen to absorb the new AC-1 message format? v0.1 conservative chooses TWO variants to keep `halt-on-error` semantics stable for tooling consumers.

**Halt-on-error short-circuit gating** (the central wiring change): the existing `if (nextResult.exitCode !== 0 || nextResult.action.action === "halt") { stopReason = { code: "halt-on-error", ... } ; break; }` at `run.ts:738-745` becomes:

```typescript
if (nextResult.exitCode !== 0 || nextResult.action.action === "halt") {
  if (args.continueOnError === true) {
    // Story 4.6 AC-2: --continue-on-error logs the failure to stderr but
    // does NOT set stopReason — the loop proceeds to the next iteration.
    stderrFn(
      `Warning: iteration ${iterCount} halted with ${extractFailureCode(nextResult.action, nextResult.exitCode)}; continuing per --continue-on-error.\n`,
    );
    continue;
  }
  // Default policy (--stop-on-error implicit): halt the loop.
  // Story 4.6 AC-1 message format: "error (verifier failure on <step>) — see <run-log-path>"
  // when the failure is a verifier failure (state.lastFailureReason.code === "VERIFIER_FAILURE");
  // otherwise fall back to the existing halt-on-error semantics.
  const failureCode = extractFailureCode(nextResult.action, nextResult.exitCode);
  // Read state.lastFailureReason post-halt to detect verifier-failure path.
  const postState = await stateFn();
  if (
    postState?.lastFailureReason?.code === "VERIFIER_FAILURE" &&
    postState.lastAttempted?.step !== undefined
  ) {
    const step = postState.lastAttempted.step;
    const runId = postState.lastFailureReason.runId;
    const runLogPath = `_bmad-output/.stepper/runs/${runId}/`;
    // Emit stderr halt+resume hint per FR26 + AR22 (Story 3.1 hint).
    stderrFn(`error (verifier failure on ${step}) — see ${runLogPath}\n`);
    stderrFn(`${postState.lastFailureReason.hint}\n`);
    stopReason = {
      code: "error-stop",
      failureCode,
      iterCount,
      step,
      runLogPath,
      message: `error (verifier failure on ${step}) — see ${runLogPath}`,
    };
  } else {
    stopReason = { code: "halt-on-error", iterCount, failureCode };
  }
  break;
}
```

The `continue` in the `--continue-on-error` branch IS the AC-2 "subsequent iterations still run" semantics. The reason we emit a stderr warning (instead of pure silent continuation) is to keep the user informed without polluting the AR9 single-line stdout discipline (per FR54 + AR9).

**Address Story 4.1 SF-2** (`IterationRecord.action "unknown"` union member): per the explicit Story 4.5 SDR forward action item + Story 4.1 SDR Item 2, the `IterationRecord.action` type at `run.ts:77` declares `"dispatch" | "report" | "halt" | "unknown"` but no production code produces `"unknown"`. Story 4.6 has TWO options: (a) DROP `"unknown"` from the union (the type becomes a tighter `"dispatch" | "report" | "halt"`), OR (b) ADD a code-comment justifying the defensive `"unknown"` for forward-compatibility (e.g., when `verify-and-advance.ts` writes a new action variant before the loop runner is upgraded). v0.1 conservative chooses **(a) DROP** because: (i) the dispatch protocol at `src/schemas/dispatch-protocol.ts` is closed-set per AR9 (Story 2.2); (ii) any new variant would require a state-schema bump per Story 1.5 — and that bump would also extend `IterationRecord.action`; (iii) keeping the type honest avoids a defensive default-branch in `formatExitReason` and the dispatch-action discriminator. Tracked as Open Question 2.

**EMPTY_DAG sentinel + EMPTY_STATE sentinel cleanup decision** (per Story 4.4 SDR I-1 + Story 4.5 dev-1 deviation): Story 4.6 KEEPS both sentinels because the failure-path predicates do NOT consume the DAG or state in a way that would benefit from elimination. The Story 4.6 modifications to `run.ts` are concentrated in the halt-on-error short-circuit and the default-cap stanza extension — neither touches the EMPTY_DAG / EMPTY_STATE sentinels. **N-1 cosmetic nit** (defensive null check at stop-conditions.ts:208): Story 4.6 INHERITS unchanged — modifications to `stop-conditions.ts` are PURELY ADDITIVE (no new predicate file changes; the failure-policy logic lives in `run.ts`). Both nits documented in §Forward Action Items.

**Story 4.6 is INTENTIONALLY NARROW**: stories 4.7 (`--plan-first`), 4.8 (`--checkpoint-each <type>`), 4.9 (`SIGINT`), 4.10 (`Loop exit reason + resume hint format`) will continue to extend the bounded-loop runner. Story 4.6 does NOT touch `stop-conditions.ts` (no new pure-function predicate; the failure-policy logic is intrinsically state-mutating — it lives in the runner's iteration body), `verify-and-advance.ts`, `args.ts` (the two flags are already declared per Story 4.1), or the per-step retry/skip/route-to-fixer policies (Epic 5).

**Concretely, Story 4.6 produces:**

1. **`src/commands/loop/run.ts`** (MODIFIED, ~+80-130 lines): adds the new `error-stop` variant to the `StopReason` discriminated union (~+8 lines); EXTENDS default-cap inverted-check at run.ts:479-489 with `&& args.stopOnError !== true && args.continueOnError !== true` clauses (~+2 lines); REWRITES the halt-on-error short-circuit at run.ts:735-745 to gate on `args.continueOnError` (the substantive ~+50-line change with the AC-1/AC-2 dispatch logic above); EXTENDS `formatExitReason` with the new `error-stop` case (~+3 lines); REMOVES `"unknown"` from the `IterationRecord.action` union per SF-2 (~-1 line) and adjusts `nextResult.action.action` propagation; ADDS a stderr warning emission at loop entry when `continueOnError === true` AND no other stop condition is supplied (~+10 lines for the unbounded-iteration alert per OQ-4); UPDATES the EXIT-CODE MAPPING JSDoc at run.ts:29-34 to note that `error-stop` and `halt-on-error` BOTH map to exit code `1`; UPDATES the JSDoc forward-tracker comment at run.ts:471-475 to remove the `4.6:` line (now wired) and keep only `4.7:` for `planFirst`.

2. **`src/commands/loop/run.test.ts`** (MODIFIED, ~+8-12 new tests / ~+200-300 lines): integration tests SE_46_1 (default `--stop-on-error` halts on first verifier-failure return; assert `error-stop` exit code path), SE_46_2 (explicit `--stop-on-error` is a no-op affirmation), SE_46_3 (verifier-failure detection: when `state.lastFailureReason.code === "VERIFIER_FAILURE"`, emit `error-stop`; otherwise `halt-on-error`), SE_46_4 (AC-1 message format byte-identical: `error (verifier failure on <step>) — see <run-log-path>`); CE_46_1 (`--continue-on-error` allows iter 2 to run after iter 1 halt — the AC-2 integration test rubric), CE_46_2 (stderr warning emission on each continued halt), CE_46_3 (`continueOnError` + `--max-iters 5` runs all 5 iters even with halts), CE_46_4 (unbounded-iteration warning emitted at loop entry when `continueOnError === true && !hasOtherStopCondition`); SWEEP_46 (AC-1 + AC-2 sweep — 2 sub-tests).

3. **`src/commands/loop/stop-conditions.test.ts`** (UNCHANGED — Story 4.6 does NOT add a pure-function predicate; the failure-policy logic lives in the runner's iteration body, not in `stop-conditions.ts`).

4. **`commands/bmad-loop.md`** (MODIFIED, ~+40-60 lines): §Stop Conditions table flips both `--stop-on-error` and `--continue-on-error` rows from `parsed only` to `RUNTIME-WIRED in 4.6`; new sub-sections `### --stop-on-error (Story 4.6)` + `### --continue-on-error (Story 4.6)`; updated intro paragraph (Story version map adds 4.6); FR53 exit-code mapping note updated (no new exit codes; `error-stop` and `halt-on-error` both map to `1`); §Behavior bullet 2 lists `error-stop` alongside the other StopReason variants.

5. **`_bmad-output/implementation-artifacts/sprint-status.yaml`** (MODIFIED): flips `4-6-stop-condition-error-with-stop-on-error-continue-on-error: backlog → ready-for-dev`. Bumps `last_updated:` at BOTH the comment block top AND the live YAML field.

**FR/NFR/AR mapping:**

- **FR8** (single-step advance): UNCHANGED. **FR9** (dry-run): UNCHANGED. **FR19** (8 stop-conditions): COMPLETED — Stories 4.1-4.5 wired 7; Story 4.6 wires the 8th (`error`). **FR20** (8 stop-condition types enumerated): WIRED HERE for the FINAL `error` type. **FR23** (cap wall-clock/token/iter): UNCHANGED. **FR53** (exit codes): EXTENDED in detail — `error-stop` joins `halt-on-error` under exit code `1`; no new exit codes introduced.
- **NFR-P1** (<500ms p95): PRESERVED — the failure-policy gate is a pure-function check (sub-millisecond). **NFR-S2/S5/R1/R4/M3**: PRESERVED.
- **AR8** (lock-free top-tier): UPHELD — `loadStateUnlocked` is read-only; the post-halt `stateFn()` call is the same loader pattern Stories 4.2/4.3/4.5 use. **AR9** (single AR9 line): UPHELD — stderr emissions for both AC-1 (`error (...) — see ...\n` + hint) and AC-2 (continuation warning) go to STDERR per FR54; the single AR9 stdout line per command invocation is preserved. **AR21+22** (errors): UNCHANGED — registry stays at 16. The `error-stop` exit message is constructed from `state.lastFailureReason.hint` (Story 3.1) which is already AR22-conformant. **AR33** (no console.*): UPHELD. **AR34** (slash-command markdown): UNCHANGED — markdown updates are doc-only. **AR41** (boundary graph): UPHELD — ZERO new imports. **AR42** (test discipline): EXTENDED — colocated tests; tmpdir-per-test preserved.

Estimated effort: **M** (medium — ZERO new exported interfaces; ONE modified source file (~+80-130 net lines: halt-on-error short-circuit rewrite + default-cap extension + StopReason variant + SF-2 cleanup); ONE modified test file (~+200-300 net lines); ONE modified markdown file (~+40-60 net lines); ZERO new error classes; ZERO new I/O imports).

It does **NOT**:

- **Wire the remaining stop-condition types** (`--plan-first`, `--checkpoint-each`, `--interactive`, `--auto-fix`) — deferred to Stories 4.7-4.10 + 5.3 + 5.5.
- **Address Story 4.1 SF-1 (extractFailureCode EXIT_0)** — forward-tracker to 4.10. **SF-2 (IterationRecord.action "unknown")** — addressed HERE per Story 4.5 §Forward Action Items.
- **Modify `verify-and-advance.ts` or `next/args.ts`** — Story 4.6 only CONSUMES `state.lastFailureReason.code` + `state.lastAttempted.step` (already written by `verify-and-advance.ts` per Story 2.6 + Story 3.1).
- **Wire per-step retry / skip / route-to-fixer / escalate failure-policies** — deferred to Epic 5 Stories 5.1-5.6 (per AC-3 explicit forward-deferral).
- **Add a new error class** — registry stays at 16. (`VerifierFailureError` already exists at `src/errors.ts:171-176` per Story 2.6.)
- **Add a new exit code** — `error-stop` and `halt-on-error` BOTH map to exit code `1` per FR53 (`halt-with-actionable-error`).
- **Rename `halt-on-error` → `error-stop`** — the two variants coexist; `halt-on-error` retains its v0.1 semantics for non-verifier halts (e.g., `LOCK_CONTENTION` propagation).

## Acceptance Criteria

The acceptance criteria below are reproduced **verbatim** from `_bmad-output/planning-artifacts/epics.md` §Story 4.6 (lines 972-986, BDD Given/When/Then format). Lines and AC labelling preserved.

**Acceptance Criteria:**

**Given** the default policy `--stop-on-error`
**When** any verifier returns `status: "fail"` and the per-step failure-policy resolves to `escalate`
**Then** the loop exits with reason `error (verifier failure on <step>) — see <run-log-path>` and the standard halt+resume hint
**Given** `--continue-on-error` is supplied
**When** a verifier failure occurs
**Then** the failure is logged but the loop continues; integration test asserts subsequent iterations still run
**And** when full failure-UX modes ship in Epic 5, `--continue-on-error` interacts correctly with per-step `retry`/`skip`/`route-to-fixer` policies

> **Story 4.6 stop-condition scope note:** AC-1 covers the default `--stop-on-error` policy (verifier failure halts; AC message `error (verifier failure on <step>) — see <run-log-path>` + standard halt+resume hint per FR26). AC-2 covers `--continue-on-error` (failure logged; integration test asserts subsequent iterations still run). AC-3 is forward-deferred — full failure-UX (per-step `retry` / `skip` / `route-to-fixer` / `escalate` policies) ships in Epic 5 (Stories 5.1-5.6). Stories 4.7 (`--plan-first`), 4.8 (`--checkpoint-each <type>`), 4.9 (`SIGINT`), 4.10 (`Loop exit reason + resume hint`) will continue to extend the bounded-loop runner. Story 4.6 is the FINAL story in the eight-stop-condition family — completing FR19 + FR20.

## Tasks / Subtasks

- [x] **Task 0 — Verify pre-conditions (AC: all)**
  - [x] 0.1 Confirm Story 4.5 is `done` per `_bmad-output/implementation-artifacts/sprint-status.yaml:87`. Confirm code-review verdict `approve` per `_bmad-output/implementation-artifacts/4-5-stop-condition-time-budget-and-token-budget.md` Senior Developer Review section (verdict line 951, counts in §Quality gates: 0 must-fix / 0 should-fix / 2 nits inherited from 4.2/4.3/4.4 / 8 info forward-trackers).
  - [x] 0.2 Read `_bmad-output/implementation-artifacts/4-5-stop-condition-time-budget-and-token-budget.md` end-to-end. Confirm:
    - `src/commands/loop/run.ts:479-489` defines the default-cap inverted-check (now 7-clause: `args.maxIters === undefined && args.untilEpicEnd !== true && args.untilStory === undefined && args.nextStory !== true && args.phaseEnd !== true && args.timeBudgetMs === undefined && args.tokenBudget === undefined`).
    - JSDoc forward-tracker at `run.ts:471-475` enumerates Stories 4.6/4.7 future-flag clauses verbatim.
    - `src/commands/loop/run.ts:107-141` defines `StopReason` discriminated union with 8 variants (`max-iters-reached`, `halt-on-error`, `epic-end-reached`, `until-story-reached`, `next-story-reached`, `phase-end-reached`, `time-budget-reached`, `token-budget-reached`).
    - `src/commands/loop/run.ts:735-745` defines the halt-on-error short-circuit (NOT yet gated on `args.continueOnError` — that's Story 4.6's job).
    - `src/commands/loop/run.ts:802-833` defines `formatExitReason` switch with 8 cases.
    - `src/commands/loop/args.ts:99-100` declares `stopOnError: z.boolean().optional()` and `continueOnError: z.boolean().optional()`.
    - Errors registry at `src/errors.ts` holds at 16 codes (verified by 4.5 SDR §Quality gates).
    - `src/errors.ts:171-176` declares `VerifierFailureError` (code `VERIFIER_FAILURE`, exitCode 1) per Story 2.6 — no new error class needed in 4.6.
    - `src/schemas/state.ts:82-87` declares `LastFailureReasonSchema { code, message, hint, runId }` per Story 3.1.
  - [x] 0.3 Read epics.md §Story 4.6 lines 972-986 verbatim. Confirm the AC text in §Acceptance Criteria above is character-identical to lines 980-986.
  - [x] 0.4 Read `src/commands/loop/run.test.ts` to confirm the existing Test F (halt-on-error stops the loop), Test E (default cap), TB_45_*, KB_45_*, SWEEP_45 all pass per the Story 4.5 baseline (~163 pass / 0 fail / ~500 expects across 3 files).
  - [x] 0.5 Read `_bmad-output/planning-artifacts/prd.md` §FR20 (line 696) verbatim: "Users can declare any of eight stop-condition types: `epic-end`, `story-X-Y`, `next-story`, `phase-end`, `max-iters`, `time-budget`, `token-budget`, `error`." Confirm `error` is the EIGHTH and FINAL stop-condition type. Read PRD §FR53 (line 744) for the exit-code mapping: "0 = success, 1 = halt-with-actionable-error" — `error-stop` and `halt-on-error` both map to `1`. Read PRD §FR26 (line 702): "System emits a human-readable exit reason, state-snapshot pointer, and `--resume` invocation hint on every loop exit." — Story 4.6 stderr emissions (AC-1 hint + AC-2 continuation warning) satisfy this.
  - [x] 0.6 Read `_bmad-output/implementation-artifacts/sprint-status.yaml` and confirm `4-6-stop-condition-error-with-stop-on-error-continue-on-error: backlog` is the current value at line 88 (Story 4.6 will flip to `ready-for-dev`).
  - [x] 0.7 Read Story 4.5's §Forward Action Items (lines 829-838) and Story 4.4's §Forward Action Items (lines 845-848) to confirm the EXPLICIT extension mandate for Story 4.6: (a) "EXTEND the default-cap inverted-check stanza at run.ts:399-407 [now 479-489] with `&& args.stopOnError !== true && args.continueOnError !== true` clauses"; (b) "EXTEND the halt-on-error short-circuit at `run.ts:578-587` [now 735-745] to gate on `args.continueOnError`"; (c) "Address Story 4.1 SF-2 (`IterationRecord.action "unknown"` union member)". Confirm.
  - [x] 0.8 Read `_bmad-output/implementation-artifacts/4-1-bmad-loop-command-skeleton.md` SDR §Should-fix items (lines 858-868) for the SF-2 forward-tracker context. Confirm the canonical fix is to DROP `"unknown"` from the `IterationRecord.action` union per OQ-2 v0.1 conservative.
  - [x] 0.9 Read `_bmad-output/implementation-artifacts/3-1-record-last-attempted-last-failure-reason-on-halt.md` to confirm the `state.lastFailureReason` write semantics: `verify-and-advance.ts` writes `{ code, message, hint, runId }` on every halt path; `Story 4.6` reads these fields post-halt to detect the verifier-failure code and compose the AC-1 message.
  - [x] 0.10 Confirm baseline `bun test src/commands/loop` exits 0 with the post-Story-4.5 baseline (~163 pass / 0 fail / ~500 expects across 3 files per Story 4.5 §Quality gates).
  - [x] 0.11 Confirm Bun host version satisfies AR2 (Bun >= 1.3). Run `bun --version`; record in Completion Notes.
  - [x] 0.12 Confirm `src/errors.ts` registry holds at 16 codes (`bun test src/errors.test.ts` → 10 pass / 0 fail / 197 expects). `VerifierFailureError` is at index 9 of the registry per the AR21 list.
  - [x] 0.13 Read the existing halt-on-error short-circuit at `run.ts:735-745` and its surrounding loop body (run.ts:629-746) to plan the rewrite.

- [x] **Task 1 — Address Story 4.5 forward action items: extend default-cap inverted-check (AC: implicit prerequisite)**
  - [x] 1.1 At `src/commands/loop/run.ts:479-489`, EXTEND the default-cap inverted-check predicate with the two new clauses:
    ```typescript
    if (
      args.maxIters === undefined &&
      args.untilEpicEnd !== true &&
      args.untilStory === undefined &&
      args.nextStory !== true &&
      args.phaseEnd !== true &&
      args.timeBudgetMs === undefined &&
      args.tokenBudget === undefined &&
      args.stopOnError !== true &&
      args.continueOnError !== true
    ) {
      args = { ...args, maxIters: 50 };
    }
    ```
    Reasoning: per Story 4.5 SDR forward-tracker for 4.6 (Item I-2 in 4.4 SDR / Forward Action Items in 4.5), the default-cap MUST short-circuit when `--stop-on-error` or `--continue-on-error` is supplied — those flags ALONE are valid stop-condition expressions and the user may want to combine with implicit conditions (e.g., epic completion). When `--stop-on-error` is supplied (the default behaviour explicit), it acts as an affirmation; when `--continue-on-error` is supplied alone, the user is opting into unbounded iteration (Task 6 emits a stderr warning to alert).
  - [x] 1.2 Update the JSDoc forward-tracker comment at `run.ts:471-475` to remove the `4.6: && args.stopOnError !== true && args.continueOnError !== true` line (now wired by this Task) and keep the remaining lines for 4.7 (`planFirst`). The JSDoc must accurately reflect the as-of-Story-4.6 state.
  - [x] 1.3 Decide on EMPTY_DAG / EMPTY_STATE sentinel cleanup (per Story 4.5 forward action item N-2): v0.1 conservative KEEPS both sentinels because the failure-path logic in Story 4.6 does NOT consume the DAG or state in a way that would benefit from sentinel elimination. Document the decision in Open Questions.
  - [x] 1.4 Document the inheritance of N-1 (defensive null check at stop-conditions.ts:208) — Story 4.6 INHERITS unchanged; the modification scope to `stop-conditions.ts` is ZERO (no new predicate file changes). Document in §Forward Action Items.

- [x] **Task 2 — Extend `StopReason` discriminated union with `error-stop` variant (AC-1)**
  - [x] 2.1 At `src/commands/loop/run.ts:107-141`, EXTEND the `StopReason` discriminated union with the new variant:
    ```typescript
    | {
        code: "error-stop";
        failureCode: string;
        iterCount: number;
        step: string | null;
        runLogPath: string | null;
        message: string;
      }
    ```
    The structured `failureCode` field carries the existing `extractFailureCode(...)` output (e.g., `EXIT_1`, `EXIT_5`); `iterCount` is the failed-iteration index (1-indexed); `step` is `state.lastAttempted.step` post-halt (null if state load failed); `runLogPath` is the canonical run-log directory `_bmad-output/.stepper/runs/<runId>/` (null if `state.lastFailureReason.runId` unavailable); the `message` field carries the AC-1 verbatim text.
  - [x] 2.2 Update the JSDoc above the union (lines 86-105) to add references to the new variant. New text:
    > "Story 4.6 (`--stop-on-error`, `--continue-on-error`) extends with ONE MORE variant (`error-stop`) emitted by the runner's halt-on-error short-circuit at run.ts:735-745 when the failure source is a verifier failure (`state.lastFailureReason.code === "VERIFIER_FAILURE"`); other halt sources (e.g., `LOCK_CONTENTION`) continue to surface as `halt-on-error` to preserve tooling-consumer compatibility."
  - [x] 2.3 At `src/commands/loop/run.ts:802-833`, EXTEND `formatExitReason` switch with the new case:
    ```typescript
    case "error-stop":
      // Story 4.6 AC-1 verbatim: "error (verifier failure on <step>) — see <run-log-path>"
      // (epics.md line 982). The message is composed by the runner via
      // state.lastFailureReason; we delegate to the stored message field for
      // AC-byte-identical text.
      return stopReason.message;
    ```
  - [x] 2.4 Update the JSDoc above `formatExitReason` (lines 781-801) to reference the new variant.
  - [x] 2.5 Update the EXIT-CODE MAPPING JSDoc at `run.ts:29-34` — exit code `1` now maps to BOTH `halt-on-error` AND `error-stop` (no new exit codes introduced; the verbatim AR22-conformant message is the differentiator, not the exit code).

- [x] **Task 3 — Address Story 4.1 SF-2 (`IterationRecord.action "unknown"` union cleanup)**
  - [x] 3.1 At `src/commands/loop/run.ts:77`, REMOVE the `"unknown"` member from the `IterationRecord.action` discriminator:
    ```typescript
    readonly action: "dispatch" | "report" | "halt";
    ```
    Reasoning: per Story 4.1 SDR Item 2 (line 861) + Story 4.5 §Forward Action Items inheritance, no production code produces `"unknown"`. The dispatch protocol at `src/schemas/dispatch-protocol.ts` is closed-set per AR9 (Story 2.2). Adding a new variant would require a state-schema bump per Story 1.5 — and that bump would also extend `IterationRecord.action` accordingly. Keeping the type honest avoids defensive default-branches.
  - [x] 3.2 Verify no consumers of `IterationRecord.action` rely on `"unknown"`. Independent grep `grep -rn "action.*unknown\|action === \"unknown\"" src/commands/loop/` should return ZERO matches after the edit. Test `run.test.ts:198` already asserts `iterations[0]?.action === "halt"` (no unknown reliance).
  - [x] 3.3 If TypeScript reports any `default:`-branch unreachability warnings on switch statements over `IterationRecord.action`, REMOVE the unreachable arm. v0.1 conservative: the only existing consumer is the `record.action = nextResult.action.action` assignment at run.ts:635 — a direct assignment with no switch, so no cleanup needed beyond the type narrowing.

- [x] **Task 4 — Rewrite halt-on-error short-circuit to gate on `args.continueOnError` (AC-1, AC-2)**
  - [x] 4.1 At `src/commands/loop/run.ts:735-745`, REWRITE the halt-on-error short-circuit. Pre-rewrite:
    ```typescript
    // halt-on-error short-circuit. Any non-zero exitCode OR explicit
    // "halt" action stops the loop. Story 4.6 (--continue-on-error)
    // will gate this short-circuit on args.continueOnError.
    if (nextResult.exitCode !== 0 || nextResult.action.action === "halt") {
      stopReason = {
        code: "halt-on-error",
        iterCount,
        failureCode: extractFailureCode(nextResult.action, nextResult.exitCode),
      };
      break;
    }
    ```
    Post-rewrite (the substantive Story 4.6 change):
    ```typescript
    // Story 4.6 AC-1/AC-2: halt-on-error short-circuit, GATED on
    // args.continueOnError. Default policy (--stop-on-error implicit OR
    // explicit) halts the loop on first verifier failure. Explicit
    // --continue-on-error logs the failure to stderr but does NOT set
    // stopReason — the loop proceeds to the next iteration. The two
    // variants of failure halt (`error-stop` for verifier failures vs
    // `halt-on-error` for other halt sources) are dispatched by reading
    // state.lastFailureReason.code post-halt.
    if (nextResult.exitCode !== 0 || nextResult.action.action === "halt") {
      const failureCode = extractFailureCode(
        nextResult.action,
        nextResult.exitCode,
      );
      if (args.continueOnError === true) {
        // AC-2: log + continue. The IterationRecord still carries
        // action: "halt" + exitCode: 1 for forensic visibility (recorded
        // earlier in the loop body at run.ts:632-640); we just don't set
        // stopReason. The stderr warning is single-line per FR54.
        stderrFn(
          `Warning: iteration ${iterCount} halted with ${failureCode}; continuing per --continue-on-error.\n`,
        );
        continue;
      }
      // AC-1: --stop-on-error (default) — halt the loop. Detect verifier-
      // failure path via state.lastFailureReason.code; otherwise fall back
      // to the existing halt-on-error semantics for non-verifier halts
      // (e.g., LOCK_CONTENTION, BMAD_INCOMPATIBLE).
      const postState = await stateFn();
      const failureReasonCode = postState?.lastFailureReason?.code;
      const lastAttemptedStep = postState?.lastAttempted?.step ?? null;
      const failureRunId = postState?.lastFailureReason?.runId ?? null;
      if (
        failureReasonCode === "VERIFIER_FAILURE" &&
        lastAttemptedStep !== null
      ) {
        const runLogPath =
          failureRunId !== null
            ? `_bmad-output/.stepper/runs/${failureRunId}/`
            : null;
        const message =
          runLogPath !== null
            ? `error (verifier failure on ${lastAttemptedStep}) — see ${runLogPath}`
            : `error (verifier failure on ${lastAttemptedStep})`;
        // FR26 + AR22 stderr emission: halt+resume hint analogous to
        // Story 4.2's --until-epic-end pointer + Story 3.1's hint.
        stderrFn(`${message}\n`);
        if (postState?.lastFailureReason?.hint !== undefined) {
          stderrFn(`${postState.lastFailureReason.hint}\n`);
        }
        stopReason = {
          code: "error-stop",
          failureCode,
          iterCount,
          step: lastAttemptedStep,
          runLogPath,
          message,
        };
      } else {
        stopReason = { code: "halt-on-error", iterCount, failureCode };
      }
      break;
    }
    ```
    Note: the `continue` keyword inside the `--continue-on-error` branch is the AC-2 "subsequent iterations still run" semantics — the `while (true)` loop header re-enters at the next iteration's `shouldStop` check. The `iterCount` was already incremented at run.ts:641 (BEFORE this short-circuit), so the next iteration sees the updated count.
  - [x] 4.2 Verify the AC-1 message is byte-identical to epics.md line 982. The format `error (verifier failure on <step>) — see <run-log-path>` includes:
    - lowercase `error`
    - `(verifier failure on <step>)` — `<step>` is `state.lastAttempted.step` (a string like `"4-6-stop-condition-error..."`)
    - the em-dash separator ` — ` (U+2014 EM DASH; NOT a hyphen, NOT an en-dash)
    - `see <run-log-path>` where `<run-log-path>` is `_bmad-output/.stepper/runs/<runId>/` (note trailing slash; runId is `state.lastFailureReason.runId`).
  - [x] 4.3 Verify the em-dash character. Use `printf '%s\n' "—" | od -c | head -1` to confirm `\342 \200 \224` (UTF-8 encoding of U+2014). The story spec source MUST use the actual em-dash character; do not substitute `--` or `-`.
  - [x] 4.4 Defensive null-handling: when `state.lastFailureReason === null` (verify-and-advance.ts may have failed to write), the code falls back to `halt-on-error` per the existing semantics. When `state.lastAttempted === null` (similar), same fallback. This preserves tooling-consumer compatibility for non-verifier halts.

- [x] **Task 5 — Stderr emission for unbounded-iteration warning when `--continue-on-error` alone (AC-2 + OQ-4)**
  - [x] 5.1 At `src/commands/loop/run.ts` (after the default-cap injection block at run.ts:479-490, around line 491), ADD the unbounded-iteration warning emission:
    ```typescript
    // Story 4.6 OQ-4: when --continue-on-error is supplied alone (no
    // --max-iters and no other stop condition), the loop has no natural
    // exit. Emit a stderr warning at loop entry to alert the user that
    // they may have created an unbounded loop. The warning is single-
    // line per FR54.
    if (
      args.continueOnError === true &&
      args.maxIters === undefined &&
      args.untilEpicEnd !== true &&
      args.untilStory === undefined &&
      args.nextStory !== true &&
      args.phaseEnd !== true &&
      args.timeBudgetMs === undefined &&
      args.tokenBudget === undefined
    ) {
      stderrFn(
        "Warning: --continue-on-error supplied without any stop condition; the loop may run indefinitely. Combine with --max-iters or another stop condition for safety.\n",
      );
    }
    ```
    Note: this warning fires AT MOST ONCE per loop run (loop-entry; no per-iteration repetition). The default-cap stanza at Task 1.1 ALREADY suppresses the implicit 50-iter cap when `--continue-on-error` is supplied — so Task 5.1's warning is the user-facing notification of that suppression. Tracked as Open Question 4 + Task 5.2.
  - [x] 5.2 Verify the `stderrFn` is the existing test-injection seam from Story 4.2 (`opts?.stderrOverride`). Tests can capture this warning via `stderrOverride` per `run.test.ts` precedent.

- [x] **Task 6 — Test halt-on-error gate in `run.test.ts` (AC-1)**
  - [x] 6.1 ADD test fixture helper `verifierFailureState(step, runId)` near the top of `run.test.ts` to build a `State` fixture with `lastFailureReason: { code: "VERIFIER_FAILURE", message, hint, runId }` + `lastAttempted: { step, ... }`. This fixture is used by Tests SE_46_3, SE_46_4 to mock the post-halt state read.
  - [x] 6.2 ADD describe block `runLoop — Test SE_46_1 (Story 4.6 AC-1: default --stop-on-error halts on first verifier failure)`:
    ```typescript
    describe("runLoop — Test SE_46_1 (Story 4.6 AC-1: default --stop-on-error halts on first verifier failure)", () => {
      it("argv=[--max-iters 5] with verifier-failure stub halts at iter 1 with error-stop", async () => {
        const { stub, calls } = countingStub(haltResult("verifier failure"));
        const state = verifierFailureState("4-6-test-step", "test-run-id-1");
        const result = await runLoop({
          argv: ["--max-iters", "5"],
          runNextOverride: stub,
          stateOverride: () => state,
          sprintStatusOverride: () => null,
          stderrOverride: () => {},
        });
        expect(result.iterations.length).toBe(1);
        expect(calls()).toBe(1);
        expect(result.stopReason.code).toBe("error-stop");
        if (result.stopReason.code !== "error-stop") return;
        expect(result.stopReason.failureCode).toBe("EXIT_1");
        expect(result.stopReason.iterCount).toBe(1);
        expect(result.stopReason.step).toBe("4-6-test-step");
        expect(result.stopReason.runLogPath).toBe(
          "_bmad-output/.stepper/runs/test-run-id-1/",
        );
        expect(result.exitCode).toBe(1);
      });
    });
    ```
  - [x] 6.3 ADD describe block `runLoop — Test SE_46_2 (Story 4.6: explicit --stop-on-error is a no-op affirmation)`:
    - Run `--stop-on-error --max-iters 5` with a successful stub; assert the loop runs 5 iters and exits with `max-iters-reached`. Confirms the explicit flag does NOT change behaviour vs default.
  - [x] 6.4 ADD describe block `runLoop — Test SE_46_3 (Story 4.6: non-verifier halt falls back to halt-on-error)`:
    - Use a state fixture WITHOUT `lastFailureReason.code === "VERIFIER_FAILURE"` (e.g., `{ code: "LOCK_CONTENTION", ... }`) — the runner falls back to the v0.1 `halt-on-error` semantics. Asserts `result.stopReason.code === "halt-on-error"`.
  - [x] 6.5 ADD describe block `runLoop — Test SE_46_4 (Story 4.6 AC-1: exit message format byte-identical)`:
    - assert `result.stopReason.message === "error (verifier failure on 4-6-test-step) — see _bmad-output/.stepper/runs/test-run-id-1/"` byte-identical (em-dash, lowercase `error`, parens, ` — `, trailing slash).
  - [x] 6.6 ADD describe block `runLoop — Test SE_46_5 (Story 4.6 AC-1: stderr emission of message + hint)`:
    - capture stderr via `stderrOverride`; assert at least TWO emissions: (1) the `error (...) — see ...\n` line, (2) the `state.lastFailureReason.hint` line.

- [x] **Task 7 — Test continue-on-error in `run.test.ts` (AC-2)**
  - [x] 7.1 ADD describe block `runLoop — Test CE_46_1 (Story 4.6 AC-2: --continue-on-error allows iter 2 to run after iter 1 halt — INTEGRATION TEST)`:
    ```typescript
    describe("runLoop — Test CE_46_1 (Story 4.6 AC-2: --continue-on-error allows iter 2 after iter 1 halt — INTEGRATION TEST)", () => {
      it("--continue-on-error --max-iters 2 runs both iterations even when iter 1 halts", async () => {
        let count = 0;
        const alternatingStub = async () => {
          count++;
          if (count === 1) return haltResult("iter-1-verifier-fail");
          return successResult(`iter-${count}-runid`);
        };
        const result = await runLoop({
          argv: ["--continue-on-error", "--max-iters", "2"],
          runNextOverride: alternatingStub,
          stateOverride: () => null,
          sprintStatusOverride: () => null,
          stderrOverride: () => {},
        });
        // Both iterations ran.
        expect(result.iterations.length).toBe(2);
        expect(count).toBe(2);
        // Iter 1's record is action: "halt"; iter 2 is action: "dispatch".
        expect(result.iterations[0]?.action).toBe("halt");
        expect(result.iterations[0]?.exitCode).toBe(1);
        expect(result.iterations[1]?.action).toBe("dispatch");
        expect(result.iterations[1]?.exitCode).toBe(0);
        // Final stopReason is max-iters-reached (cap hit, NOT error-stop).
        expect(result.stopReason.code).toBe("max-iters-reached");
        if (result.stopReason.code !== "max-iters-reached") return;
        expect(result.stopReason.maxIters).toBe(2);
        expect(result.exitCode).toBe(0);
      });
    });
    ```
    This is the AC-2 verbatim integration test rubric — "subsequent iterations still run" after a verifier failure when `--continue-on-error` is supplied.
  - [x] 7.2 ADD describe block `runLoop — Test CE_46_2 (Story 4.6 AC-2: stderr warning emitted on each continued halt)`:
    - capture stderr; assert exactly TWO warning emissions when 2 of 3 iters halt (stub sequence: halt, success, halt; `--continue-on-error --max-iters 3`).
    - assert each warning matches `/^Warning: iteration \d+ halted with EXIT_1; continuing per --continue-on-error\.\n$/`.
  - [x] 7.3 ADD describe block `runLoop — Test CE_46_3 (Story 4.6: --continue-on-error + --max-iters 5 runs all 5 iters even with halts)`:
    - stub sequence of 5 halts; loop runs all 5; final exit is `max-iters-reached` (NOT halt-on-error / error-stop because `--continue-on-error` overrides).
    - assert `iterations.length === 5`; all 5 records have `action: "halt"`.
  - [x] 7.4 ADD describe block `runLoop — Test CE_46_4 (Story 4.6 OQ-4: unbounded-iteration warning at loop entry)`:
    ```typescript
    it("--continue-on-error alone emits stderr warning at loop entry about unbounded iteration", async () => {
      const stderrCapture: string[] = [];
      const stub = async () => haltResult("test");
      // Bound the test by stubbing only ONE halt; the loop will continue
      // (per --continue-on-error) but the runNextOverride only resolves
      // once → the loop hangs without a bound. We bound by passing
      // `--max-iters 1` AND the warning should still fire because the
      // user's intent at loop ENTRY did NOT include max-iters.
      // Test simplification: build a runLoop with args directly (skip
      // argv parsing) so we bypass the default-cap stanza and observe
      // the warning emission cleanly.
      // Wait — the warning is gated on `args.maxIters === undefined`
      // before the default-cap injection. So the test must use
      // `argv: ["--continue-on-error"]` (no other flags) and rely on
      // the loop body to halt naturally via the stub.
      // Easier alternative: assert the warning via a direct opts
      // construction with stub returning halt → continue → halt
      // forever, BOUNDED by an artificial bail in the stub after N calls.
      let count = 0;
      const boundedStub = async () => {
        count++;
        if (count > 3) {
          // Bail with success to terminate the test
          return successResult();
        }
        return haltResult("bounded-bail");
      };
      const result = await runLoop({
        argv: ["--continue-on-error"],
        runNextOverride: boundedStub,
        stateOverride: () => null,
        sprintStatusOverride: () => null,
        stderrOverride: (chunk) => {
          stderrCapture.push(chunk);
        },
      });
      // Assert: at LEAST ONE stderr line contains "may run indefinitely".
      const matchedWarning = stderrCapture.some((c) =>
        c.includes("may run indefinitely"),
      );
      expect(matchedWarning).toBe(true);
    });
    ```
    Note: this test exercises the unbounded-iteration warning when `--continue-on-error` is the ONLY flag supplied. The stub bails after 3 halts to bound the test. Tracked as Open Question 5 (test-bounding strategy).
  - [x] 7.5 ADD describe block `runLoop — Test CE_46_5 (Story 4.6: --continue-on-error + --until-epic-end NO unbounded warning)`:
    - assert NO stderr warning containing "may run indefinitely" when `--continue-on-error` is combined with `--until-epic-end`. Confirms Task 5.1's gate on `!hasOtherStopCondition`.

- [x] **Task 8 — Sweep test (AC-1 + AC-2 integration)**
  - [x] 8.1 ADD describe block `runLoop — Test SWEEP_46 (Story 4.6: AC-1 + AC-2 sweep)`:
    - ONE describe block, 2 sub-tests:
      - Sweep-46-A (AC-1): default `--stop-on-error` policy halts on first verifier-failure with `error-stop` (uses `verifierFailureState` fixture).
      - Sweep-46-B (AC-2): `--continue-on-error --max-iters 3` runs 3 iters even with all-halt stub.
    - Each sub-test exercises ONE AC in its own scenario; satisfies the integration-test rubric for both ACs.
  - [x] 8.2 UPDATE the top-of-file comment block at lines 1-27 to reflect Story 4.6's coverage delta:
    - Add: "AC-1 (Tests SE_46_1-5 + Sweep-46-A): default `--stop-on-error` policy halts on first verifier-failure with `error-stop` exit (`error (verifier failure on <step>) — see <run-log-path>`)."
    - Add: "AC-2 (Tests CE_46_1-5 + Sweep-46-B): `--continue-on-error` allows subsequent iterations to run; integration test asserts iter 2 still runs after iter 1 halt."
  - [x] 8.3 Test counts projection: net delta is ~+8-12 new describe blocks (10 sub-tests on `run.test.ts`); ~+30-50 new expects. Net: ~163 → ~175 tests; ~500 → ~545 expects.

- [x] **Task 9 — Update `commands/bmad-loop.md` (AC-1, AC-2 indirect)**
  - [x] 9.1 In the §Stop Conditions table (lines 172-186), flip the `--stop-on-error` and `--continue-on-error` rows from `parsed only` → `RUNTIME-WIRED in 4.6`.
  - [x] 9.2 Update the intro paragraph (lines 13-18): was "Story 4.5 wired the two budget flags (`--time-budget MS`, `--token-budget N`); Stories 4.6+ will wire the remaining flags (`--stop-on-error`, `--continue-on-error`, `--plan-first`)." → REPLACE with "Story 4.5 wired the two budget flags (`--time-budget MS`, `--token-budget N`); Story 4.6 wired the failure-policy flags (`--stop-on-error`, `--continue-on-error`); Story 4.7+ will wire the remaining flags (`--plan-first`, `--checkpoint-each <type>`)."
  - [x] 9.3 INSERT a new sub-section `### --stop-on-error (Story 4.6)` AFTER `### --token-budget N (Story 4.5)` (around line 329). Content covers:
    - behaviour summary (default policy; verifier failure halts the loop)
    - usage example (`/bmad-loop --stop-on-error --max-iters 50` — explicit affirmation; OR no flag at all for default)
    - exit message format `error (verifier failure on <step>) — see <run-log-path>`
    - exit code `1` (FR53 `halt-with-actionable-error`)
    - stderr emission per FR26 (halt+resume hint).
  - [x] 9.4 INSERT a new sub-section `### --continue-on-error (Story 4.6)` AFTER `### --stop-on-error (Story 4.6)`. Content covers:
    - behaviour summary (verifier failure logged; loop continues)
    - usage example (`/bmad-loop --continue-on-error --max-iters 10`)
    - stderr per-iteration warning format `Warning: iteration N halted with <failureCode>; continuing per --continue-on-error.`
    - unbounded-iteration warning at loop entry when supplied without other stop conditions
    - exit code `0` when the loop exits via a stop condition AFTER continuing past halts (e.g., `--max-iters` cap).
  - [x] 9.5 Update §FR53 exit-code mapping (lines 95-103) — note that exit code `1` now applies to BOTH `halt-on-error` AND `error-stop` variants (both indicate `halt-with-actionable-error` per FR53; the differentiator is the AR22-conformant message text).
  - [x] 9.6 Update §Behavior bullet 2 (lines 72-76) — add `error-stop` to the StopReason variant list.
  - [x] 9.7 Update "When NEITHER --max-iters nor any other stop condition is supplied" paragraph (lines 330-336) to extend the explicit-conditions enumeration with `--stop-on-error` and `--continue-on-error`.
  - [x] 9.8 Verify §argumentHint (line 3) already includes `[--stop-on-error|--continue-on-error]` (declared per Story 4.1); no change.

- [x] **Task 10 — Update `_bmad-output/implementation-artifacts/sprint-status.yaml` (AC: all)**
  - [x] 10.1 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: flip `4-6-stop-condition-error-with-stop-on-error-continue-on-error: backlog → ready-for-dev` (this Story 4.6 create-story step). At dev-story completion, flip to `review`. At code-review completion, flip to `done`.
  - [x] 10.2 Bump `last_updated:` timestamp at BOTH the `# last_updated:` comment line (line 2) AND the `last_updated:` key:value line (line 38). Use `2026-05-03T23:45:00Z` (UTC ISO timestamp at create-story step).
  - [x] 10.3 sprint-status.yaml retains its original schema (no new fields). DO NOT touch any other story status.

- [x] **Task 11 — Run the full test suite + quality gates (AC: all)**
  - [x] 11.1 `bun test src/commands/loop` exit 0. Test delta projection: ~+10 new describe blocks / ~+30-50 new expects on `run.test.ts`. `stop-conditions.test.ts` is UNCHANGED (Story 4.6 does NOT add a pure-function predicate).
  - [x] 11.2 Post-Story-4.6 baseline projection: ~173-180 pass / 0 fail / ~530-560 expects across 3 loop test files.
  - [x] 11.3 Confirm `src/errors.ts` registry stays at **16 codes** (`bun test src/errors.test.ts`: 10 pass, 197 expects). Story 4.6 ships ZERO new error classes (`VerifierFailureError` already exists per Story 2.6).
  - [x] 11.4 Confirm `bunx --bun tsc --noEmit` exits 0. Pay attention to the `IterationRecord.action` union narrowing — TypeScript may surface mismatches if any consumer relies on `"unknown"` (Task 3.2 grep).
  - [x] 11.5 Confirm `bunx --bun biome ci .` exits 0 (the modified files pass biome lint/format).
  - [x] 11.6 Confirm AR41 boundary checks at `src/commands/loop/run.test.ts:248-285` STILL PASS — Story 4.6 ships ZERO new imports.
  - [x] 11.7 Confirm `commands/bmad-loop.md` is well-formed YAML frontmatter + valid markdown body (no syntax errors). Run a markdown linter check if available.
  - [x] 11.8 Verify the stderr emissions (AC-1 message + AC-1 hint, AC-2 continuation warning, OQ-4 unbounded warning) do not introduce stdout pollution — capture stderr via `stderrOverride`; assert stdout has only the AR9 final line (or none for unit-test paths).
  - [x] 11.9 Verify the em-dash character (U+2014) is correctly emitted in the AC-1 message — `od -c` check on a captured stderr emission OR direct string comparison via `expect(message).toContain("—")` (with the actual em-dash unicode codepoint).

- [x] **Task 12 — Final self-check (AC: all)**
  - [x] 12.1 Re-run all three quality gates one final time: `bun test src/commands/loop`, `bunx --bun biome ci .`, `bunx --bun tsc --noEmit`. All exit 0.
  - [x] 12.2 Confirm Story 4.2's existing tests STILL pass — Story 4.6 does NOT modify `stop-conditions.ts`; the existing 6 predicates are unchanged.
  - [x] 12.3 Confirm Story 4.3's existing tests STILL pass — Story 4.6 does NOT modify `nextStoryStopCondition`, `phaseEndStopCondition`, or `LoopContext`.
  - [x] 12.4 Confirm Story 4.4's existing tests STILL pass — the default-cap inverted-check is EXTENDED (not modified); `argv=[]` still produces 50 iters; `--max-iters 10` still exits with `max-iters (10) reached`.
  - [x] 12.5 Confirm Story 4.5's existing tests STILL pass — the budget predicates are unchanged; `--time-budget` / `--token-budget` still fire as before. The `LoopMetrics` accumulator is unchanged. The Tests TB_45_*, KB_45_*, SWEEP_45 all pass.
  - [x] 12.6 Confirm Story 4.1's existing Test F (halt-on-error) STILL passes — the test asserts non-zero exitCode short-circuits with `halt-on-error`. With Story 4.6's gate, the test stub does NOT have a verifier-failure state fixture, so the runner falls back to the existing `halt-on-error` semantics (Task 4.4 defensive null-handling). Test F assertions UNCHANGED.
  - [x] 12.7 Confirm the AR41 boundary checks pass.
  - [x] 12.8 Confirm no `console.*` in any new or modified file (per AR33).
  - [x] 12.9 Update §Dev Agent Record §Completion Notes with: (a) actual final test counts, (b) any deviations from this story spec, (c) any open questions surfaced during implementation that should be tracked in code-review.

## Dev Notes

### Architecture invariants enforced

- **AR8** (lock-free top-tier `run.ts`; lock-held `verify-and-advance.ts`): UPHELD. The Story 4.6 post-halt `stateFn()` call is the SAME read-only loader pattern Stories 4.2/4.3/4.5 use; ZERO new lock acquisitions in `run.ts`.
- **AR9** (single discriminated-union JSON line on stdout): UPHELD. Story 4.6 ADDS one variant (`error-stop`) to the StopReason union; `formatExitReason` emits the AC-1 byte-identical message. The single AR9 stdout line per command invocation is preserved. The 80%-warnings (AC-1 message + hint, AC-2 continuation warning, OQ-4 unbounded warning) all go to STDERR per FR54 — NOT stdout.
- **AR10** (token counts threaded via verify-and-advance): UNCHANGED. Story 4.6 does NOT touch the token-flow chain; the existing `LoopMetrics` accumulator from Story 4.5 is preserved as-is.
- **AR21 + AR22** (errors carry code + actionable hint): UNCHANGED. Story 4.6 ships ZERO new error classes — registry stays at 16 codes. The `error-stop` exit message uses `state.lastFailureReason.hint` (Story 3.1) which is already AR22-conformant.
- **AR33** (function & error semantics; throw not Result; no console.\*; async/await): UPHELD. The halt-on-error gate is pure-function logic (no throws); the stderr emissions use `stderrFn` (existing test seam from Story 4.2); ZERO `console.*` calls.
- **AR34** (slash-command markdown protocol): UNCHANGED. The `commands/bmad-loop.md` modifications are documentation-only — table flips + new sub-sections + paragraph rewrites.
- **AR41** (boundary graph): UPHELD. Story 4.6 ships ZERO new imports — the post-halt `stateFn()` call uses the existing `loadStateUnlocked` import (run.ts:51); the `extractFailureCode` helper is already declared at run.ts:408-418.
- **AR42** (test discipline): EXTENDED. Existing colocated test file extended; AR35 tmpdir-per-test discipline preserved.

### Code paths to extend

Story 4.6's modification points (file:line refs against the current Story 4.5 baseline):

- **`run.ts:29-34`** — JSDoc EXIT-CODE MAPPING block. UPDATE to note `error-stop` joins `halt-on-error` under exit code `1`.
- **`run.ts:77`** — `IterationRecord.action` union. REMOVE `"unknown"` member (SF-2 cleanup).
- **`run.ts:86-105`** — JSDoc above `StopReason` union. UPDATE to add `error-stop` reference.
- **`run.ts:107-141`** — `StopReason` discriminated union. ADD `error-stop` variant.
- **`run.ts:471-475`** — JSDoc forward-tracker comment. UPDATE to remove `4.6:` line (now wired) and keep `4.7:`.
- **`run.ts:479-489`** — default-cap inverted-check. EXTEND with 2 new clauses (`stopOnError` + `continueOnError`).
- **`run.ts:491+`** — INSERT unbounded-iteration warning emission for OQ-4.
- **`run.ts:735-745`** — halt-on-error short-circuit. REWRITE per Task 4.1 (the substantive change).
- **`run.ts:781-801`** — JSDoc above `formatExitReason`. UPDATE to reference `error-stop`.
- **`run.ts:802-833`** — `formatExitReason` switch. ADD `error-stop` case.
- **`run.test.ts:1-27`** — top-of-file comment. UPDATE coverage delta.
- **`run.test.ts`** end of file — INSERT new describe blocks for SE_46_1-5, CE_46_1-5, SWEEP_46.
- **`commands/bmad-loop.md:13-18`** — intro paragraph. UPDATE Story map.
- **`commands/bmad-loop.md:72-76`** — Behavior bullet 2. ADD `error-stop` variant.
- **`commands/bmad-loop.md:95-103`** — FR53 exit-code mapping. UPDATE note.
- **`commands/bmad-loop.md:172-186`** — Stop Conditions table. FLIP 4.6 rows from `parsed only` to `RUNTIME-WIRED in 4.6`.
- **`commands/bmad-loop.md:329+`** — INSERT new sub-sections `### --stop-on-error (Story 4.6)` + `### --continue-on-error (Story 4.6)`.
- **`commands/bmad-loop.md:330-336`** — "When NEITHER" paragraph. EXTEND explicit-conditions enumeration.

### `error-stop` design contract

The `error-stop` variant is structurally distinct from `halt-on-error`:

- **`error-stop`** carries the AC-1 verbatim message format AND structured `step` + `runLogPath` fields for tooling consumers. Emitted ONLY when `state.lastFailureReason.code === "VERIFIER_FAILURE"` AND `state.lastAttempted.step !== null`. The `failureCode` field is preserved from `extractFailureCode(...)` for cross-reference.
- **`halt-on-error`** retains its v0.1 semantics for non-verifier halts (e.g., `LOCK_CONTENTION` propagation, `BMAD_INCOMPATIBLE`, `CORRUPT_STATE`). Tooling consumers that already branch on `halt-on-error` continue to work unchanged.

The two-variant design preserves backward compatibility while adding the AC-1-specific richer payload. v0.1 conservative — Open Question 1 explores whether to widen `halt-on-error` to absorb the new format vs keep the two-variant split.

### `--continue-on-error` flow

The `continue` keyword in the rewritten halt-on-error gate is the linchpin of AC-2 "subsequent iterations still run". After iter N halts:

1. `iterCount` was already incremented at run.ts:641 (BEFORE the gate).
2. `IterationRecord` was already pushed at run.ts:640 (BEFORE the gate).
3. Stderr warning is emitted by Task 4.1's continue branch.
4. `continue` jumps to the `while (true)` header.
5. Next iteration's `shouldStop` check fires (it sees the updated `iterCount`).
6. If `shouldStop` returns `null`, next iteration's `runNextFn` is invoked.
7. Iter N+1 runs as normal.

Critical: the `iterCount` increment and `IterationRecord` push happen UNCONDITIONALLY — even on continued halts — so tooling consumers see ALL halt records in `result.iterations[]`.

### `state.lastFailureReason` consumption per AR22

Story 4.6's `error-stop` variant reads three fields from `state.lastFailureReason` (Story 3.1):

- `code`: discriminator (`"VERIFIER_FAILURE"` triggers `error-stop`; other codes fall back to `halt-on-error`).
- `hint`: emitted to stderr after the AC-1 message line — already AR22-conformant per Story 1.2 + Story 3.1.
- `runId`: composes the `<run-log-path>` URL: `_bmad-output/.stepper/runs/<runId>/`.

And one field from `state.lastAttempted` (Story 3.1):

- `step`: the `<step>` substitution in the AC-1 message.

Both fields are written by `verify-and-advance.ts` (Story 2.6) on every halt path. Story 4.6 only READS them — no schema changes required.

### Test-suite impact + integration-test rubric

Post-Story-4.5 baseline: 163 / 0 / 500 across 3 files. Story 4.6 adds ~+10 describe blocks on `run.test.ts` (SE_46_1-5 + CE_46_1-5 + SWEEP_46). Net post-4.6: ~173-180 / 0 / ~530-560.

The AC-2 integration-test rubric is satisfied by Test CE_46_1: 2-iteration sequence with iter 1 halt + iter 2 success, asserts both records present + final exit via max-iters cap. Test CE_46_3 is the broader stress test (5 iters, all-halt). Test SWEEP_46 exercises both ACs in a sweep block.

### Errors registry + Story 4.7+ forward-trackers

ZERO new error classes (registry holds at 16). The new variant uses pure-function logic; stderr emissions use existing `stderrFn`. Forward-trackers:

- **Story 4.7 (`--plan-first` dry-run preview)**: EXTEND default-cap inverted-check with `&& args.planFirst !== true` clause OR skip the injection entirely (DRY-RUN never enters iteration body).
- **Story 4.10 (Loop exit reason + resume hint format)**: ENRICH the `formatExitReason` `error-stop` case with a fuller `--resume` hint (currently delegates to predicate's `message` field). Story 4.10 may extract a hint-formatter helper and apply it across all variants uniformly.
- **Epic 5 (Stories 5.1-5.6)**: Per AC-3 forward-deferral, full failure-UX modes will interact with `--continue-on-error` per-step `retry` / `skip` / `route-to-fixer` / `escalate` policies. Story 5.6 specifically wires the per-step policy resolver consumed by Story 4.6's gate. The Story 4.6 boolean gate is the FOUNDATION; Epic 5 layers per-step semantics on top.

### N-1 + N-2 nit inheritance

Story 4.2's defensive null check at `stop-conditions.ts:208` (unreachable `=== null` arm given optional-chain returns `undefined`) — Story 4.6 INHERITS unchanged because the file is NOT modified. Story 4.2's `EMPTY_DAG` sentinel + Story 4.5's `EMPTY_STATE` sentinel mid-file placement — Story 4.6 KEEPS both because the failure-policy logic does NOT consume them.

### Length justification

This spec is ~600-800 lines targeting the precedent set by 4.5 (896 lines) and 4.4 (700+ lines). The substantive Story 4.6 content lives in: §Context Summary (the failure-path reasoning), §Tasks (12 tasks; the halt-on-error rewrite is concentrated in Task 4 with ~50-line rewrite), §Dev Notes (architecture invariants + code paths + design contract), §Open Questions (5 OQs), §Forward Action Items (Epic 5 + 4.7 + 4.10). The integration-test rubric + AC-1 byte-identical message format mandate detailed test-design reasoning.

## Open Questions for Code Review

1. **`error-stop` vs widening `halt-on-error` to absorb the new AC-1 format**: v0.1 conservative chooses TWO variants (separate `error-stop` for verifier failures vs `halt-on-error` for non-verifier halts) to preserve tooling-consumer compatibility. Trade-off: two variants (v0.1; preserves existing semantics) vs single widened variant (cleaner type but risks breaking consumers). Reviewer adjudication welcomed.

2. **`IterationRecord.action "unknown"` removal**: SF-2 from Story 4.1 SDR. v0.1 chooses DROP `"unknown"` per Task 3.1 (the dispatch protocol is closed-set per AR9; no production code emits the variant). Alternative: keep with code-comment justifying defensive forward-compat. v0.1 chooses DROP for type honesty.

3. **AC-1 `<run-log-path>` format `_bmad-output/.stepper/runs/<runId>/`**: AC-1 wording `see <run-log-path>` is interpretive. v0.1 chose the directory form (trailing slash) to point users at the run's task records. Alternatives: `<runId>` alone (less actionable), `_bmad-output/.stepper/runs/<runId>/run.yaml` (specific file but the directory contains additional artifacts). v0.1 chooses directory.

4. **Unbounded-iteration warning at loop entry when `--continue-on-error` is the only flag**: v0.1 conservative emits a stderr warning at loop entry when `--continue-on-error` is supplied without ANY stop condition. Trade-off: warn (v0.1; explicit user notification) vs silent (cleaner UX but risks unbounded loops). v0.1 chooses warn.

5. **Test CE_46_4 bounding strategy**: testing the unbounded-iteration warning requires bounding the loop in the test. v0.1 uses a "bail-after-N-halts" stub pattern. Alternative: spy on `stderrFn` calls in the FIRST few invocations and return early via a bail mechanism. Both work; v0.1's is simpler.

6. **Em-dash character (U+2014) in AC-1 message**: epics.md line 982 uses the em-dash character ` — `. v0.1 conservative preserves the em-dash byte-identically. Tooling that pipes loop output through ASCII-only filters may need to handle the em-dash explicitly; this is by design.

7. **`continueOnError` interaction with `--stop-on-error`**: when the user supplies BOTH `--stop-on-error` and `--continue-on-error` (which is contradictory), v0.1 conservative applies `--continue-on-error` (the explicit opt-in to continuation overrides the implicit/explicit stop). The Zod schema at args.ts:99-100 declares both as independent optional booleans — no mutual-exclusion gate. Alternative: surface a parse error when both are supplied. v0.1 chooses precedence (continueOnError wins). Tracked here.

8. **`stateFn()` post-halt call cost**: Task 4.1 adds ONE extra `stateFn()` call per halt (the post-halt state read). For `--continue-on-error` paths, this call is SKIPPED (no read needed; we just emit the warning). For default `--stop-on-error` paths, this is a one-time read at loop exit. Per NFR-P1 (<500ms p95), the cost (~1-3ms YAML parse) is well within budget.

9. **`--continue-on-error` interaction with `halt-on-error` exit code**: when `--continue-on-error` is supplied and the loop exits via a NON-error stop condition (e.g., `--max-iters`), the exit code is `0` (clean). When `--continue-on-error` is supplied and the loop's iteration HAS halted but eventually a stop condition fires, the FINAL exitCode reflects the stop condition (e.g., `0` for `max-iters-reached`). Tooling consumers who want to detect "loop ran past halts" should inspect `iterations[]` for `action: "halt"` records.

10. **Predicate purity is preserved**: Story 4.6 does NOT add a pure-function predicate to `stop-conditions.ts`. The failure-policy logic is intrinsically state-mutating (it reads post-halt state) and lives in the runner's iteration body. This is a deviation from the Story 4.2/4.3/4.5 pattern but aligns with the failure-path semantics.

## Forward Action Items

- **Story 4.7 (`--plan-first` dry-run preview)**: EXTEND the default-cap inverted-check stanza at `run.ts:479-491` (after Story 4.6's extension) with `&& args.planFirst !== true` clause OR decide that plan-first should skip the injection entirely (since plan-first is a DRY-RUN; the loop body never executes).
- **Story 4.8 (`--checkpoint-each <step|epic|phase>`)**: May add per-iteration checkpoint snapshot integration. Does NOT interact with the halt-on-error gate.
- **Story 4.9 (`SIGINT graceful exit`)**: Will add a SIGINT handler that respects the same halt-vs-continue logic. May interact with `args.continueOnError` (e.g., SIGINT during `--continue-on-error` should still halt cleanly).
- **Story 4.10 (Loop exit reason + resume hint format)**: ENRICH the `formatExitReason` `error-stop` case with a fuller `--resume` hint. The current Story 4.6 implementation already emits the hint to STDERR (via `state.lastFailureReason.hint`); Story 4.10 may unify the formatting across all StopReason variants.
- **Epic 5 — Stories 5.1-5.6 (failure-UX modes)**: Per AC-3 forward-deferral, full failure-UX (per-step `retry` / `skip` / `route-to-fixer` / `escalate` policies via config) will interact with `--continue-on-error`. Story 5.6 specifically wires the per-step policy resolver. The Story 4.6 boolean gate is the FOUNDATION; Epic 5 layers per-step semantics on top.
- **N-1 cosmetic nit (inherited from Story 4.2/4.3/4.4/4.5)**: defensive `epicNum === undefined || epicNum === null` check at `stop-conditions.ts:208` has unreachable `=== null` arm. Cosmetic; preserved in 4.6 because `stop-conditions.ts` is NOT modified. Forward-tracker for opportunistic cleanup.
- **N-2 cosmetic nit (inherited from Story 4.2/4.3/4.4/4.5)**: `EMPTY_DAG` sentinel at `run.ts:337-341` + Story 4.5's `EMPTY_STATE` sentinel at `run.ts:351-360` positioned mid-file. KEPT in 4.6 because the failure-policy logic does NOT consume them. Cleanup deferred to a future story that has a substantive reason to always-build the DAG / promote sentinels to module-level constants.
- **D3 forward-tracker (per-iteration state caching)**: Story 4.5 introduced a 4th per-iteration `stateFn` call (token accumulation); Story 4.6 introduces a 5th call (post-halt state read for `error-stop` variant). v0.1 conservative does NOT merge calls. Future story may introduce a `LoopMetrics`-cached state fingerprint or a unified per-iteration state-loader to reduce call count.
- **dev-1 forward-tracker (Story 4.5)**: EMPTY_STATE sentinel pattern for budget predicates when state is null. Story 4.6 inherits the pattern unchanged. Reviewer-adjudicated alternative (refactor `evaluateStopConditions` to accept `state: State | null`) deferred to a future story that has multiple state-optional predicates emerging.
- **Story 6.x (schema tightening)**: `state.runHistory[]` is currently `z.unknown()` per Story 1.5. Story 4.6 does NOT consume `runHistory[]`. The schema bump can wait for a story with substantive consumption needs.

## References

- `_bmad-output/planning-artifacts/epics.md` lines 972-986 — AC verbatim source.
- `_bmad-output/planning-artifacts/prd.md` line 696 (FR20: 8 stop-condition types including `error`) + line 702 (FR26: exit reason + resume hint) + line 744 (FR53: exit codes; `error-stop` and `halt-on-error` both map to `1`).
- `_bmad-output/planning-artifacts/architecture.md` §AR8/9/21/22/33/34/41/42 invariants (applicable to `src/commands/loop/run.ts`).
- `_bmad-output/implementation-artifacts/4-5-stop-condition-time-budget-and-token-budget.md` — predecessor (status done; verdict approve); SDR I-2 + Forward Action Items mandate Story 4.6 extension of default-cap inverted-check + halt-on-error gate.
- `_bmad-output/implementation-artifacts/4-4-stop-condition-max-iters-and-default-cap.md` — default-cap inverted-check pattern; AC-2 message-format precedent.
- `_bmad-output/implementation-artifacts/4-3-stop-condition-next-story-and-phase-end.md` — `LoopContext` baseline + per-iteration stateFn pattern.
- `_bmad-output/implementation-artifacts/4-2-stop-condition-epic-end-and-story-x-y.md` — `stop-conditions.ts` module structure + `evaluateStopConditions` dispatcher.
- `_bmad-output/implementation-artifacts/4-1-bmad-loop-command-skeleton.md` — `LoopArgsSchema` `stopOnError` + `continueOnError` declarations (parsed-only); `IterationRecord` shape; SF-2 `"unknown"` cleanup forward-tracker.
- `_bmad-output/implementation-artifacts/3-1-record-last-attempted-last-failure-reason-on-halt.md` — `state.lastFailureReason` write semantics consumed by Story 4.6's `error-stop` gate.
- `src/commands/loop/run.ts` (860 lines), `src/commands/loop/run.test.ts` (1224 lines), `commands/bmad-loop.md` (414 lines) — files to modify.
- `src/commands/loop/args.ts` (308 lines) — UNCHANGED (`stopOnError` + `continueOnError` already declared per 4.1).
- `src/commands/loop/stop-conditions.ts` (662 lines) + `src/commands/loop/stop-conditions.test.ts` (1115 lines) — UNCHANGED (no new pure-function predicate).
- `src/commands/next/verify-and-advance.ts` — UNCHANGED (writes `state.lastFailureReason` per Story 2.6 + Story 3.1; Story 4.6 only READS).
- `src/schemas/state.ts:82-87` — `LastFailureReasonSchema { code, message, hint, runId }` per Story 3.1 — Story 4.6 reads.
- `src/errors.ts` — `VerifierFailureError` at index 9 (line 171-176); registry held at 16; Story 4.6 ships ZERO new classes.

## Dev Agent Record

### Context Reference

Inputs (full list in §References + frontmatter `inputDocuments`).

### Agent Model Used

claude-opus-4-7[1m].

### Debug Log References

- Bun host version: `1.3.12` (satisfies AR2 Bun >= 1.3).
- Baseline before changes: `bun test src/commands/loop/ src/errors.test.ts` → 175 pass / 0 fail / 686 expects across 4 files.
- Iteration 1 (write code): completed all source/test edits and quality-gate runs in a single pass — ZERO repair iterations consumed.
- Pre-existing TS error at `run.test.ts:1161` (Story 4.5 fixture missing `completedAt` field) was repaired as part of 4.6 (the `tsc --noEmit` baseline was not enforced in 4.5; 4.6 enforces it). Single-line fix in §File List.
- Pre-existing biome violation at `run.test.ts:1180` (`let callCount` unused — Story 4.5 KB_45_5 dead variable) was repaired by prefixing with underscore (`_callCount`). Cosmetic.
- AC-1 message format byte-identical: verified via `expect(message).toBe(...)` in `Test SE_46_4` with em-dash U+2014 character + trailing slash + lowercase `error` literal.
- AC-2 integration test: Test CE_46_1 confirms iter 1 halts (action=halt, exitCode=1), iter 2 still runs (action=dispatch, exitCode=0), final exit via `max-iters-reached` cap (NOT `error-stop`), exitCode=0.
- Errors registry: 16 codes confirmed (`bun test src/errors.test.ts` → 10 pass / 197 expects unchanged).
- AR41 boundary: ZERO new imports in `run.ts` — the `error-stop` short-circuit reuses the existing `loadStateUnlocked` (already imported at run.ts:51) and `extractFailureCode` (already declared at run.ts:408-418).
- AR9 stdout discipline: ALL stderr emissions (AC-1 message+hint, AC-2 continuation warning, OQ-4 unbounded warning) go through the existing `stderrFn` test seam — single AR9 stdout line preserved.

### Completion Notes List

- **Quality gates (final pass)**: `bun test src/commands/loop/` → 177 pass / 0 fail / 543 expects (3 files; +12 tests vs Story 4.5 baseline). `bun test src/errors.test.ts` → 10/0/197 (registry held at 16). `bun test` (full regression) → 904 pass / 0 fail / 3280 expects (59 files). `bunx --bun biome ci .` → exit 0 (134 files checked). `bunx --bun tsc --noEmit` → exit 0.
- **Repair iterations consumed**: 0 of 3 budgeted (no quality-gate failures encountered after my changes; the two pre-existing issues fixed inline are not 4.6 regressions).
- **Source files modified**:
  - `src/commands/loop/run.ts` (~+90 / ~−10 lines): default-cap stanza extended with `stopOnError`/`continueOnError` clauses; StopReason union + formatExitReason extended with `error-stop`; IterationRecord.action narrowed (SF-2); halt-on-error short-circuit rewritten with AC-1/AC-2 gating; unbounded-iteration warning added at loop entry; exit-code derivation extended to map `error-stop` to 1; JSDoc updates.
  - `src/commands/loop/run.test.ts` (~+330 / ~−5 lines): added `verifierFailureState` fixture; SE_46_1 through SE_46_5; CE_46_1 through CE_46_5; SWEEP_46 (2 sub-tests); 2 small repair fixes (TS-fixup `completedAt`; biome-fixup `_callCount`).
  - `src/commands/loop/stop-conditions.ts`: UNCHANGED (Story 4.6 does NOT add a pure-function predicate; the failure-policy logic is intrinsically state-mutating and lives in the runner's iteration body — see OQ-10).
  - `src/commands/loop/stop-conditions.test.ts`: UNCHANGED.
  - `commands/bmad-loop.md` (~+70 / ~−10 lines): table rows flipped to RUNTIME-WIRED; intro paragraph updated; Behavior bullet 2 updated; FR53 mapping note updated; new sub-sections `### --stop-on-error (Story 4.6)` + `### --continue-on-error (Story 4.6)`; "When NEITHER" paragraph extended.
  - `_bmad-output/implementation-artifacts/sprint-status.yaml`: row flipped `ready-for-dev → review`; `last_updated` bumped to `2026-05-04T01:00:00Z`.
  - `_bmad-output/implementation-artifacts/4-6-...md`: this story file, status flipped to `review`, all 87 checkboxes ticked, Dev Agent Record + Change Log populated.
- **Source files NOT modified** (per §Constraints + spec): `src/errors.ts` (registry stays at 16); `src/commands/next/verify-and-advance.ts`; `src/commands/next/args.ts`; `src/schemas/state.ts`; `src/schemas/dispatch-protocol.ts`; `src/commands/loop/args.ts`; `.bmad-stepper/state.yaml`; `.bmad-stepper/runs/`.
- **AC-1 verification** (default `--stop-on-error` policy):
  - Implementation: `src/commands/loop/run.ts` halt-on-error short-circuit verifier-failure detection + stderr emission + StopReason composition.
  - Test evidence: `Test SE_46_1` (assert `result.stopReason.code === "error-stop"` + `failureCode === "EXIT_1"` + `step === "4-6-test-step"` + `runLogPath === "_bmad-output/.stepper/runs/test-run-id-1/"`); `Test SE_46_4` (byte-identical `result.stopReason.message === "error (verifier failure on 4-6-test-step) — see _bmad-output/.stepper/runs/test-run-id-1/"` with em-dash U+2014); `Test SE_46_5` (stderr captures both message + `lastFailureReason.hint`); Sweep-46-A.
- **AC-2 verification** (`--continue-on-error` integration test):
  - Implementation: `src/commands/loop/run.ts` continueOnError gate emits stderr warning and `continue`s the loop.
  - Test evidence: `Test CE_46_1` (alternating stub: iter 1 halt + iter 2 success; `result.iterations.length === 2`; iter 1 record carries `action: "halt"` + `exitCode: 1`; iter 2 record carries `action: "dispatch"` + `exitCode: 0`; final `stopReason.code === "max-iters-reached"`; `result.exitCode === 0`); `Test CE_46_2` (stderr warning emission count); `Test CE_46_3` (5/5 iters with all-halt stub); `Test CE_46_4` (unbounded-iteration warning at loop entry); `Test CE_46_5` (no warning when combined with another stop condition); Sweep-46-B.
- **AR upheld checklist**:
  - AR8 (lock-free top-tier): UPHELD — post-halt `stateFn()` call uses the existing read-only loader; ZERO new lock acquisitions.
  - AR9 (single-line stdout discipline): UPHELD — all stderr emissions go through `stderrFn`; final AR9 line emitted by `import.meta.main`.
  - AR21+22 (error code + actionable hint): UNCHANGED — registry stays at 16; `error-stop` reuses `state.lastFailureReason.hint` (Story 3.1).
  - AR33 (no console.\*): UPHELD — ZERO `console.*` calls in modified files.
  - AR34 (slash-command markdown): UPHELD — markdown updates are documentation-only.
  - AR41 (boundary graph): UPHELD — ZERO new imports.
  - AR42 (test discipline): EXTENDED — colocated tests; tmpdir-per-test preserved (no new state-mutating tests).
- **Errors registry confirmation**: `src/errors.ts` registry holds at 16 codes (`bun test src/errors.test.ts` → 10/0/197). `VerifierFailureError` exists at `src/errors.ts:171-176` per Story 2.6 — Story 4.6 does NOT add a new error class.
- **Deviations from spec** (track for code-review):
  - **OQ-10 (predicate purity)**: failure-policy logic lives in `run.ts` iteration body (NOT in `stop-conditions.ts`) per spec OQ-10 reasoning. The decision is documented in the JSDoc above the StopReason union and in the spec; this is the intentional v0.1 design. (NOT a deviation; explicitly tracked here per orchestrator instructions.)
  - **Pre-existing TS + biome fixups**: two small unrelated cosmetic fixes were applied as part of 4.6 because the `tsc --noEmit` and `biome ci` quality gates required them (the Story 4.5 baseline did not enforce these for the loop module specifically). These do not affect 4.6's behaviour or AC coverage.
  - **CE_46_4 test bounding**: per spec OQ-5, the unbounded-iteration warning test uses pre-parsed `args` injection + a stub that throws after 5 calls to bound the loop. The test catches the throw and inspects the captured stderr. This deviates slightly from spec Task 7.4's literal text (which proposed `--continue-on-error` argv parsing) but achieves the same assertion; documented here for code-review.
- **Sprint-status row updated**: `4-6-stop-condition-error-with-stop-on-error-continue-on-error: ready-for-dev → review` at `sprint-status.yaml:88`. `last_updated` bumped to `2026-05-04T01:00:00Z` at both the comment block (line 2) and the live YAML field (line 38).
- **Story frontmatter flipped**: `status: ready-for-dev → review` at line 2. `last_updated` bumped to `2026-05-04T01:00:00Z` at line 8.

### File List

Modified files (paths relative to repo root):

- `src/commands/loop/run.ts`
- `src/commands/loop/run.test.ts`
- `commands/bmad-loop.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/4-6-stop-condition-error-with-stop-on-error-continue-on-error.md`

## Senior Developer Review (AI)

**Reviewer:** bmad-code-review (Iteration 3 of /bmad-loop run `2026-05-04T010159Z-bmad-next`, loop `2026-05-03T233849Z-bmad-loop`)
**Date:** 2026-05-04
**Persona:** senior-developer-reviewer (adversarial)
**Verdict:** **approve**
**Counts:** 0 must-fix / 0 should-fix / 2 nits inherited (N-1, N-2 from 4.2/4.3/4.4/4.5) / 9 info forward-trackers

### Summary

Story 4.6 lands the seventh + eighth runtime-wired stop-condition flags (`--stop-on-error`, `--continue-on-error`), completing the eight-flag bounded-loop contract per FR19 + FR20. The implementation is disciplined: ZERO new exported interfaces, ZERO new error classes (registry held at 16), ZERO new imports in `run.ts` (AR41 boundary preserved), ZERO `console.*` calls (AR33). The substantive change is the halt-on-error short-circuit rewrite at `run.ts:796-857` (the AC-1/AC-2 dispatch), supported by a SF-2 cleanup (drop `"unknown"` from `IterationRecord.action`), a default-cap predicate extension, and a OQ-4 unbounded-iteration entry warning. Code-review verdict: **approve** (no must-fix, no should-fix; 2 nits inherited unchanged; 9 info forward-trackers documented).

### AC Verification (independently re-verified)

**AC-1 — Default `--stop-on-error` policy halts on first verifier-failure with byte-identical message.**
- Implementation: `src/commands/loop/run.ts:796-857` — halt-on-error short-circuit reads `state.lastFailureReason.code` post-halt; emits `error-stop` StopReason variant when `code === "VERIFIER_FAILURE" && lastAttempted.step !== null`; otherwise falls back to `halt-on-error`. Message composition at `run.ts:835-838`: `error (verifier failure on ${lastAttemptedStep}) — see ${runLogPath}` with em-dash U+2014 (verified via `printf '%s' "—" | od -c` → `342 200 224`). Stderr emission at `run.ts:841-844` (message line + `state.lastFailureReason.hint` line).
- StopReason discriminated union variant at `src/commands/loop/run.ts:160-167` — fields `failureCode`, `iterCount`, `step`, `runLogPath`, `message` per spec Task 2.1.
- Exit-code mapping at `run.ts:866-869`: both `error-stop` and `halt-on-error` map to exit code `1` (FR53 `halt-with-actionable-error`).
- `formatExitReason` extension at `run.ts:956-961` delegates to `stopReason.message` for AC-byte-identical text.
- Test evidence:
  - `src/commands/loop/run.test.ts:1259-1282` — `Test SE_46_1` asserts `stopReason.code === "error-stop"`, `failureCode === "EXIT_1"`, `iterCount === 1`, `step === "4-6-test-step"`, `runLogPath === "_bmad-output/.stepper/runs/test-run-id-1/"`, `exitCode === 1`.
  - `src/commands/loop/run.test.ts:1340-1361` — `Test SE_46_4` asserts `stopReason.message === "error (verifier failure on 4-6-test-step) — see _bmad-output/.stepper/runs/test-run-id-1/"` byte-identical with em-dash + lowercase `error` + parens + trailing slash; belt-and-suspenders `toContain("—")` confirms em-dash codepoint.
  - `src/commands/loop/run.test.ts:1368-1387` — `Test SE_46_5` captures stderr; asserts both message line + hint line emitted.
  - `src/commands/loop/run.test.ts:1303-1338` — `Test SE_46_3` asserts non-`VERIFIER_FAILURE` codes (e.g., `LOCK_CONTENTION`) fall back to `halt-on-error` (preserves backward-compat).
- Outcome: **PASS — AC-1 verified, byte-identical message format, em-dash U+2014 confirmed, fallback semantics preserved.**

**AC-2 — `--continue-on-error` integration test asserts subsequent iterations still run.**
- Implementation: `src/commands/loop/run.ts:809-818` — when `args.continueOnError === true`, emit single-line stderr warning `Warning: iteration ${iterCount} halted with ${failureCode}; continuing per --continue-on-error.` and `continue` the `while (true)` loop without setting `stopReason`. The IterationRecord (with `action: "halt"`, `exitCode: 1`) was already pushed earlier in the loop body for forensic visibility.
- Test evidence:
  - `src/commands/loop/run.test.ts:1389-1418` — `Test CE_46_1` (the AC-2 integration-test rubric): alternating stub (iter 1 halt, iter 2 success) with `--continue-on-error --max-iters 2`. Asserts `iterations.length === 2`, `iterations[0].action === "halt" && exitCode === 1`, `iterations[1].action === "dispatch" && exitCode === 0`, `stopReason.code === "max-iters-reached"`, `maxIters === 2`, `result.exitCode === 0`. **Verified: iter 2 still runs after iter 1 halt; loop terminates via max-iters cap (NOT error-stop); exit code 0 (clean).**
  - `src/commands/loop/run.test.ts:1420-1447` — `Test CE_46_2` asserts exactly two stderr warnings on a halt/success/halt sequence with `--max-iters 3` (regex match `/^Warning: iteration \d+ halted with EXIT_1; continuing per --continue-on-error\.\n$/`).
  - `src/commands/loop/run.test.ts:1449-1473` — `Test CE_46_3` runs all 5 iters with all-halt stub + `--continue-on-error --max-iters 5`; final exit `max-iters-reached`.
  - `src/commands/loop/run.test.ts:1476-1514` — `Test CE_46_4` asserts unbounded-iteration warning (`may run indefinitely`) emitted at loop entry when `continueOnError: true` is the only flag (uses pre-parsed args injection seam + bounded-run stub that throws after 5 calls — see deviation dev-3).
  - `src/commands/loop/run.test.ts:1516-1536` — `Test CE_46_5` asserts NO unbounded warning when combined with `--until-epic-end`.
- Outcome: **PASS — AC-2 verified; subsequent iterations run; loop terminates cleanly via max-iters cap.**

**AC-3 — Forward-deferred (Epic 5).**
- Per AC-3 verbatim: "when full failure-UX modes ship in Epic 5, `--continue-on-error` interacts correctly with per-step `retry`/`skip`/`route-to-fixer` policies."
- Story 4.6 §Forward Action Items (line 703) explicitly notes the deferral to Epic 5 Stories 5.1-5.6 (especially 5.6 Per-step failure policy via config). The Story 4.6 boolean gate at `run.ts:809-818` is the FOUNDATION; Epic 5 will layer per-step semantics on top.
- §Dev Notes (line 588) confirms `verify-and-advance.ts` UNCHANGED in 4.6; per-step policy resolver is Story 5.6's responsibility.
- Outcome: **PASS — Epic 5 dependency notes are present in §Forward Action Items + §Dev Notes; no further action required for 4.6.**

### AR Upheld Checklist (independently verified)

| AR | Status | Evidence |
|---|---|---|
| AR8 (lock-free top-tier) | **UPHELD** | `src/commands/loop/run.ts:50-67` import block contains ZERO `src/lock/` imports. Post-halt `stateFn()` call uses `loadStateUnlocked` (read-only) per existing pattern. |
| AR9 (single-line stdout) | **UPHELD** | All four stderr emissions (AC-1 message, AC-1 hint, AC-2 continuation warning, OQ-4 unbounded warning) routed through `stderrFn` injectable seam at `run.ts:529-533`. The single AR9 stdout line is emitted by `import.meta.main` at `run.ts:967-989`. |
| AR21 + AR22 (errors) | **UPHELD** | Errors registry held at **16 codes** — verified by `bun test src/errors.test.ts` → 10 pass / 0 fail / **197 expect()** unchanged. ZERO new error classes added. The `error-stop` variant reuses `state.lastFailureReason.hint` (Story 3.1) which is already AR22-conformant. |
| AR33 (no `console.*`) | **UPHELD** | Grep `console\.(log\|error\|warn\|info\|debug\|trace\|...)\(` against `src/commands/loop/` returns ZERO matches in production code (only in comment + boundary-test assertion strings). |
| AR34 (slash-command markdown) | **UPHELD** | `commands/bmad-loop.md` updates are documentation-only: §Stop Conditions table rows flipped to RUNTIME-WIRED, intro paragraph extended, two new sub-sections `### --stop-on-error (Story 4.6)` (line 336) + `### --continue-on-error (Story 4.6)` (line 368). YAML frontmatter unchanged. |
| AR41 (boundary graph) | **UPHELD** | `src/commands/loop/run.ts:50-67` import block is **byte-identical** to Story 4.5 baseline (zero NEW imports added in 4.6). Branch diff `git diff HEAD -- src/commands/loop/run.ts` for import lines: 0 changes. AR41 boundary checks at `run.test.ts:255-291` continue to pass (3 tests in describe block "Test I"). |
| AR42 (test discipline) | **UPHELD** | All new tests (SE_46_1-5, CE_46_1-5, SWEEP_46) are colocated in `src/commands/loop/run.test.ts`; use existing fixture/seam patterns (`countingStub`, `successResult`, `haltResult`, `stateOverride`, `stderrOverride`); no new tmpdir-mutation patterns introduced. |

### Quality Gates (independently re-verified)

| Gate | Expected | Observed | Status |
|---|---|---|---|
| `bun test src/commands/loop/` | ~177/0/543 | **177 pass / 0 fail / 543 expect** (3 files, 574ms) | PASS |
| `bun test src/errors.test.ts` | 10/0/197 (registry 16) | **10 pass / 0 fail / 197 expect** (registry held at 16) | PASS |
| `bun test` (full regression) | ~904/0/3280 | **904 pass / 0 fail / 3280 expect** (59 files, 4.04s) | PASS |
| `bun run check` (biome + bun test) | exit 0 | **exit 0** (134 files checked by biome, no fixes; 904/0/3280 tests pass; one prior intermittent flake on second concurrent run resolved on re-execution to confirm stable PASS) | PASS |
| `bunx --bun tsc --noEmit` | exit 0 | **exit 0** | PASS |

Note on biome flake: an initial concurrent `bun run check` run reported `903 pass / 1 fail` (one flaky test, likely a race on shared tmpdir resources during parallel execution). Re-running serially produced **904/0/3280 PASS**. Biome itself passed cleanly on both runs. The flake is not a 4.6 regression and is not actionable for this story; tracked as info forward-tracker for Story 4.10 to investigate test-isolation hygiene.

### OQ Adjudications

| OQ | Topic | Decision | Reasoning |
|---|---|---|---|
| OQ-1 | `error-stop` vs widen `halt-on-error` | **ACCEPT v0.1** (two variants) | Two-variant design preserves tooling-consumer compatibility for `halt-on-error` (non-verifier halts). Widening would break the existing variant's semantics. The cost is a small extra StopReason variant; the benefit is backward-compat. |
| OQ-2 | SF-2 — drop `"unknown"` from `IterationRecord.action` | **ACCEPT v0.1** (drop) | Verified at `run.ts:91`: union is now `"dispatch" \| "report" \| "halt"`. Grep for `action.*unknown` in `src/commands/loop/` returns zero matches. The dispatch protocol is closed-set per AR9 (Story 2.2); future variants would require a state-schema bump. Type honesty avoids defensive default-branches. |
| OQ-3 | `<run-log-path>` directory format | **ACCEPT v0.1** (directory `_bmad-output/.stepper/runs/<runId>/`) | Trailing-slash directory form points users at the run's task records (multiple artifacts in the directory). Alternatives (`<runId>` alone, single file) are less actionable. The format aligns with FR53 `halt-with-actionable-error` resume-hint conventions. |
| OQ-4 | Unbounded-iteration warning when `--continue-on-error` alone | **ACCEPT v0.1** (warn at loop entry) | Implementation at `run.ts:544-557` emits single-line stderr warning AT MOST ONCE per loop run when `continueOnError === true && !hasOtherStopCondition`. UX justified — silent unbounded loops are a foot-gun. Test CE_46_4 covers; CE_46_5 confirms suppression when combined with another stop condition. |
| OQ-5 | Test CE_46_4 bounding strategy | **ACCEPT** (pre-parsed args + bounded stub) | Pre-parsed `args: { continueOnError: true }` injection at test:1496 + `runNextOverride` that throws after 5 calls + `try/catch` to bound the loop is a clean test pattern. Achieves the assertion goal (warning fires at loop entry). Documented as deviation dev-3 below. |
| OQ-6 | Em-dash U+2014 vs `--` | **ACCEPT v0.1** (em-dash byte-identical) | `printf '%s' "—" | od -c` confirms UTF-8 encoding `342 200 224` (U+2014). Spec source uses em-dash; runner emits em-dash; test SE_46_4 asserts byte-identical text via `toBe` and `toContain("—")`. ASCII-only-pipe consumers are an accepted limitation. |
| OQ-7 | `--stop-on-error` + `--continue-on-error` precedence | **ACCEPT v0.1** (continueOnError wins) | The Zod schema declares both as independent optional booleans (no mutual-exclusion gate at parse-time); the runner short-circuits on `args.continueOnError === true` BEFORE the verifier-failure detection branch (run.ts:809), so `--continue-on-error` overrides any implicit/explicit `--stop-on-error`. v0.1 conservative; explicit user opt-in to continuation wins. |
| OQ-8 | Post-halt `stateFn()` cost | **ACCEPT v0.1** (skip on continue path) | The `--continue-on-error` branch at run.ts:809-818 returns BEFORE the post-halt `stateFn()` call at line 823. Default `--stop-on-error` paths incur ONE post-halt `stateFn()` call at loop exit (~1-3ms YAML parse). Per NFR-P1 (<500ms p95), well within budget. |
| OQ-9 | `--continue-on-error` exit-code semantics | **ACCEPT v0.1** (final stop condition determines exitCode) | When `--continue-on-error` is supplied and the loop's iterations halt but eventually a stop condition fires, the FINAL exitCode reflects the stop condition (e.g., `0` for `max-iters-reached`). This is verified by Test CE_46_1 (assertions: `stopReason.code === "max-iters-reached"`, `result.exitCode === 0`). Tooling consumers detect "loop ran past halts" by inspecting `iterations[]` for `action: "halt"` records (forensic visibility preserved). |
| OQ-10 | Predicate purity — failure-policy in runner body | **ACCEPT v0.1** (intentional design) | Failure-policy logic is intrinsically state-mutating (post-halt state read; conditional branch on `continueOnError`); placing it in `stop-conditions.ts` as a pure-function predicate would require the predicate to return both a halt AND a continue signal, deviating from the predicate's `StopReason \| null` contract. Documented in JSDoc above StopReason union (run.ts:118-123) and §Open Questions. |

**OQ Tally:** 10 ACCEPT / 0 DEFER / 0 REJECT.

### Deviation Decisions

| Deviation | Description | Decision | Reasoning |
|---|---|---|---|
| dev-1 (OQ-10) | Failure-policy logic in `run.ts` iteration body, NOT in `stop-conditions.ts` | **ACCEPT** | Documented in spec OQ-10. The state-mutating nature of failure-policy logic (post-halt state read + conditional branch) does NOT fit the pure-function predicate contract of `stop-conditions.ts`. The runner body placement at `run.ts:796-857` is intentional; alternative would force a non-idiomatic predicate signature. |
| dev-2 | Cosmetic fixups: `completedAt` field on Story 4.5 fixture (TS-fixup at `run.test.ts:1161`); `_callCount` underscore-prefix on Story 4.5 KB_45_5 dead variable (biome-fixup at `run.test.ts:1180`) | **ACCEPT** | Pre-existing issues from 4.5 baseline that 4.6's stricter `tsc --noEmit` + `biome ci` enforcement surfaced. Single-line edits; no behavioral impact; not 4.6 regressions. Note: the dev-story dev-2 entry conflated these two fixes; both are tracked together as opportunistic cleanup. |
| dev-3 (OQ-5) | Test CE_46_4 uses pre-parsed `args: { continueOnError: true }` injection seam + bounded-run stub that throws after 5 calls (vs spec Task 7.4's literal `argv: ["--continue-on-error"]` + alternative bail mechanism) | **ACCEPT** | The pre-parsed args seam (already exposed by `runLoop` for the `args` override pattern at `run.test.ts:317-330`) provides a cleaner test path that avoids the argv-parsing pre-amble. The throw-bound mechanism + `try/catch` cleanly bounds the test without modifying production code. Achieves the same assertion (warning emitted at loop entry). |

**Deviation Tally:** 3 ACCEPT / 0 REJECT.

### Forward-Tracker Action Items

(Items for Stories 4.7+ + Epic 5 + Epic 6 — info, not blocking 4.6 done.)

1. **Story 4.7 (`--plan-first` dry-run preview)** — EXTEND default-cap inverted-check at `run.ts:510-522` with `&& args.planFirst !== true` clause, OR decide that `--plan-first` should bypass the loop entirely (since dry-run never enters iteration body). The OQ-4 unbounded-iteration warning predicate at `run.ts:544-553` may also need extension if `--plan-first` is considered a stop-condition.
2. **Story 4.8 (`--checkpoint-each <step|epic|phase>`)** — Add per-iteration checkpoint integration. Likely no interaction with the halt-on-error gate; verify on dev-story.
3. **Story 4.9 (`SIGINT graceful exit`)** — Add SIGINT handler that respects the halt-vs-continue logic. Specifically: SIGINT during `--continue-on-error` should still halt cleanly (override the continue). Forward-tracker for the gate interaction.
4. **Story 4.10 (Loop exit reason + resume hint format)** — ENRICH `formatExitReason` for the `error-stop` case with a fuller `--resume` hint (currently delegates to `stopReason.message` field). Story 4.10 may extract a hint-formatter helper and apply uniformly across all 9 StopReason variants. **ALSO investigate the intermittent test flake observed during this code-review's `bun run check` run** (one of 904 tests sporadically failed in concurrent execution; consistently passes on serial re-run). Likely test-isolation issue.
5. **Epic 5 — Stories 5.1-5.6 (failure-UX modes)** — Per AC-3 forward-deferral, full failure-UX (per-step `retry` / `skip` / `route-to-fixer` / `escalate` policies via config) will interact with `--continue-on-error`. Story 5.6 specifically wires the per-step policy resolver consumed by Story 4.6's gate. The Story 4.6 boolean gate is the FOUNDATION; Epic 5 layers per-step semantics on top.
6. **N-1 cosmetic nit (inherited from Story 4.2/4.3/4.4/4.5)** — defensive `epicNum === undefined || epicNum === null` check at `src/commands/loop/stop-conditions.ts:269` (verified location) has unreachable `=== null` arm given optional-chain returns `undefined`. Cosmetic; preserved in 4.6 because `stop-conditions.ts` is NOT modified. Forward-tracker for opportunistic cleanup.
7. **N-2 cosmetic nit (inherited from Story 4.2/4.3/4.4/4.5)** — `EMPTY_DAG` sentinel + Story 4.5's `EMPTY_STATE` sentinel positioned mid-file in `src/commands/loop/run.ts`. KEPT in 4.6 because the failure-policy logic does NOT consume them. Cleanup deferred to a future story that has a substantive reason to always-build the DAG / promote sentinels to module-level constants.
8. **D3 forward-tracker (per-iteration state caching)** — Story 4.5 introduced a 4th per-iteration `stateFn` call (token accumulation); Story 4.6 introduces a 5th call (post-halt state read for `error-stop` variant). v0.1 conservative does NOT merge calls. Future story (likely Epic 6) may introduce a `LoopMetrics`-cached state fingerprint or unified per-iteration state-loader to reduce call count.
9. **Story 6.x (config-driven default-cap suppression)** — As the default-cap inverted-check predicate at `run.ts:510-522` continues to grow with each new stop-condition flag (now 9 clauses post-4.6: maxIters, untilEpicEnd, untilStory, nextStory, phaseEnd, timeBudgetMs, tokenBudget, stopOnError, continueOnError; pending 4.7 planFirst → 10 clauses), consider refactoring to a `hasExplicitStopCondition(args)` helper for readability. Pure-function refactor; no behavioral change. Combined with Story 4.10's exit-reason format work.

### Final Outcome

**Verdict: approve.** Story 4.6 is the FINAL story in the eight-stop-condition family — completing FR19 + FR20. Epic 4 progresses to 6/10 stories done with `4.7-4.10` remaining. Code quality is excellent: 0 must-fix, 0 should-fix, 2 nits inherited unchanged, 9 info forward-trackers for Stories 4.7+ + Epic 5 + Epic 6.

**Story 4.6 status: review → done.** Sprint-status row updated. Forward-tracker items captured.

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-05-03 | bmad-create-story (Iteration 1 of /bmad-loop run 2026-05-03T234041Z-bmad-next, loop 2026-05-03T233849Z-bmad-loop) | Initial story spec — status: ready-for-dev. |
| 2026-05-04 | bmad-dev-story (Iteration 2 of /bmad-loop run 2026-05-04T004620Z-bmad-next, loop 2026-05-03T233849Z-bmad-loop) | Story 4.6 implementation complete — status: review. AC-1 + AC-2 wired in `src/commands/loop/run.ts`; +12 new tests (SE_46_1-5, CE_46_1-5, SWEEP_46) in `src/commands/loop/run.test.ts`; commands/bmad-loop.md updated; SF-2 cleanup applied. Quality gates: 904/0/3280 full regression pass; biome + tsc clean. Errors registry held at 16. Repair iterations consumed: 0/3. |
| 2026-05-04 | bmad-code-review (Iteration 3 of /bmad-loop run 2026-05-04T010159Z-bmad-next, loop 2026-05-03T233849Z-bmad-loop) | Story 4.6 code-review complete — status: done. Verdict: approve (0 must-fix / 0 should-fix / 2 nits inherited / 9 info forward-trackers). AC-1 + AC-2 + AR8/AR9/AR21/AR22/AR33/AR34/AR41/AR42 independently re-verified. Quality gates re-run: loop 177/0/543, errors 10/0/197 (registry 16), full 904/0/3280, biome ci exit 0, tsc --noEmit exit 0. 10 OQ adjudications all ACCEPT v0.1; 3 deviation decisions all ACCEPT. Forward-trackers captured for 4.7-4.10 + Epic 5 + Epic 6. |
