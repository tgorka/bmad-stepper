---
status: done
story_id: '3.1'
story_key: 3-1-record-last-attempted-last-failure-reason-on-halt
epic: '3'
title: Record `last_attempted` / `last_failure_reason` on Halt
created: '2026-04-30'
last_updated: '2026-04-30'
priority: M
estimated_effort: M
fr_coverage:
  - FR1
  - FR5
  - FR27
  - FR32
  - FR33
  - FR43
  - FR44
  - FR53
  - FR54
nfr_coverage:
  - NFR-R1
  - NFR-R4
  - NFR-S2
  - NFR-S5
  - NFR-M3
ar_coverage:
  - AR8
  - AR9
  - AR11
  - AR12
  - AR21
  - AR22
  - AR25
  - AR26
  - AR33
  - AR41
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/implementation-artifacts/epic-2-retrospective.md
  - _bmad-output/implementation-artifacts/2-1-verifier-configuration-registry.md
  - _bmad-output/implementation-artifacts/2-4-lock-free-run-ts-for-bmad-next.md
  - _bmad-output/implementation-artifacts/2-5-markdown-transcript-json-run-log-writers.md
  - _bmad-output/implementation-artifacts/2-6-verify-and-advance-ts-with-state-hash-check.md
  - _bmad-output/implementation-artifacts/1-5-schemas-migrations-skeleton.md
  - _bmad-output/implementation-artifacts/1-6-state-subsystem-load-save-recompute-skeleton.md
  - src/errors.ts
  - src/io/log.ts
  - src/io/paths.ts
  - src/lock/lock.ts
  - src/state/load.ts
  - src/state/save.ts
  - src/state/recompute.ts
  - src/schemas/state.ts
  - src/schemas/dispatch-spec.ts
  - src/schemas/dispatch-protocol.ts
  - src/dispatch/index.ts
  - src/dispatch/promote.ts
  - src/runs/index.ts
  - src/verifiers/index.ts
  - src/commands/next/run.ts
  - src/commands/next/verify-and-advance.ts
  - src/commands/next/args.ts
  - src/commands/next/index.ts
---

# Story 3.1: Record `last_attempted` / `last_failure_reason` on Halt

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper user,
I want every halt to record the last attempted step and failure reason atomically to `state.yaml`,
So that `--resume` always picks up cleanly and post-hoc analysis has the failure context.

## Context Summary

This is the **FIRST story of Epic 3 (Resume, Inspection & State Export)** and lands the canonical `state.lastAttempted` write-on-dispatch + `state.lastFailureReason` write-on-halt mutations that **every other Epic 3 story consumes**. Per the just-closed epic-2-retrospective forward action item §line 191 + recommended planning sequence §line 204, Story 3.1 is **front-loaded** because the `--resume` flag (Story 3.2), `--diff-state` / `--export-state` (Story 3.8), `--explain` (Story 3.6), `--list` (Story 3.7), and the bounded-loop runner (Stories 4.x — `state.lastFailureReason` is the resume hint surfaced when a loop iteration halts) ALL read from the two state fields this story populates.

**The schema fields ALREADY EXIST.** `src/schemas/state.ts:37-54` (Story 1.5 schema-skeleton work) declares both `lastAttempted: { step, epic, story, attemptedAt }` and `lastFailureReason: { code, message, hint, runId }` as optional + nullable on `StateV1Schema`. Architecture §P3 lines 759-764 documents the canonical YAML shape. **No schema bump (V1 → V2) is required.** Story 3.1 is purely a **mutation-site wiring** story: the writes are added to `src/commands/next/run.ts` (set `lastAttempted` BEFORE the AR9 `action: "dispatch"` emit) and `src/commands/next/verify-and-advance.ts` (set `lastFailureReason` on every halt path; clear both fields on success — Story 2.6 already clears `lastAttempted` on success per `verify-and-advance.ts:530`, but does NOT yet clear `lastFailureReason`, and does NOT yet write `lastFailureReason` on its halt branches).

The pre-existing schema declaration **decisively determines the V1-extend strategy**. The architecture's two-field shape (`lastAttempted: { step, epic, story, attemptedAt }` + `lastFailureReason: { code, message, hint, runId }`) is wire-compatible with v1 reads from prior versions: an old `state.yaml` written before Story 3.1 simply has both fields `undefined` / `null`, which is exactly what Zod's `.nullable().optional()` accepts. **Forward-compat preserved**: a `state.yaml` written by Story 3.1 is read by Story 1.5's `StateV1Schema.parse()` without modification.

Story 2.6 (Story 2.6 dev-001 + Story 2.6 line 530) **partially anticipated** this story: on success it clears `lastAttempted: null` AND keeps `lastFailureReason` untouched (carries forward whatever was in `stateBefore`). Story 3.1 closes the wiring gap by:
- **WRITING `lastAttempted`** in `run.ts` BEFORE the dispatch (so the field is populated the moment Layer 1's `Bash` invocation completes — even if the sub-agent crashes mid-Task or the user kills the process). Per architecture lines 759-763 + epic AC line 731, the field is `{ step, epic, story, attemptedAt }`.
- **WRITING `lastFailureReason`** in `verify-and-advance.ts`'s halt branches (verifier failure, state-hash mismatch, sub-agent timeout via Story 2.6's outer try/catch, lock contention, stop-condition trigger). Per architecture line 764 + epic AC line 731, the field is `{ code, message, hint, runId }` populated from the thrown `StepperError`.
- **CLEARING `lastFailureReason`** in `verify-and-advance.ts`'s success branch (Story 2.6 currently leaves `lastFailureReason` untouched on success — Story 3.1 sets it to `null` so a successful step erases prior failure context per AC line 735 — "lastSuccessfulStep advances, lastAttempted clears, lastFailureReason clears").

**Key process-boundary nuance**: per architecture §line 1672 (Coherence Validation Correction 1), `run.ts` is **lock-free** and `verify-and-advance.ts` is **lock-acquiring**. `state.yaml` writes require `saveState(state, lockHandle)` per Story 1.6 NFR-S5 architectural enforcement. **`run.ts` cannot write `state.yaml` directly** — it would need to acquire the lock, breaking the lock-free contract Story 2.4 + the architecture established. Story 3.1's design therefore splits the `lastAttempted` write across two layers:

1. **`run.ts`** EMITS the planned `lastAttempted` payload as a NEW field on the AR9 dispatch action (`{ action: "dispatch", runId, agent, lastAttempted: {...}, exitCode }`). This payload is captured by Layer 1's slash-command markdown (`commands/bmad-next.md`), which then forwards it to `verify-and-advance.ts` as a positional argument: `bun run src/commands/next/verify-and-advance.ts -- --run-id <id> --tokens-in <n> --tokens-out <n> --last-attempted-json '{...}'`. Story 2.6's `parseVerifyAndAdvanceArgs` is extended to accept the new flag.
2. **`verify-and-advance.ts`** WRITES `lastAttempted` into `state.yaml` under the held lock. On the success path it clears `lastAttempted: null` (Story 2.6 already does this — Story 3.1 keeps the existing line at `verify-and-advance.ts:530`). On the halt path it WRITES `lastAttempted` to the value parsed from `--last-attempted-json` AND populates `lastFailureReason` from the thrown `StepperError`'s `(code, message, actionableHint, runId)` projection.

This split avoids a `run.ts` lock acquisition while still capturing the `lastAttempted` field "atomically" — the dispatch emit, the sub-agent invocation, the verify-and-advance lock-held write, and the state.yaml mutation are all on the same Layer-1 slash-command call chain. **There is one exception**: if `run.ts` itself halts BEFORE emitting (e.g., DAG construction fails with `UnknownBmadSkillError`), there is no `lastAttempted` to record because no step was ever attempted. The slash-command markdown Story 2.7 handles this case by branching on `action: "halt"` and skipping the `verify-and-advance` invocation entirely; `state.yaml` is unchanged on `run.ts` halts (the failure surfaces via stderr + the exit code).

**The integration test surface** per AC line 736 verifies the recording on each of: `VERIFIER_FAILURE`, `BRANCH_SWITCH`, `BMAD_INCOMPATIBLE`, `TIMEOUT`, `BUDGET_EXCEEDED`. The first two and last two of these halts originate from inside `verify-and-advance.ts`'s try/catch (verifier branch + Story 1.8 branch-detection + budget exceeded). `BMAD_INCOMPATIBLE` originates from `run.ts`'s startup BMAD-detection check; the integration test for `BMAD_INCOMPATIBLE` simulates the `verify-and-advance.ts` post-fact recording (Layer 1 captures the BMAD_INCOMPATIBLE halt from `run.ts`'s emit and re-runs `verify-and-advance.ts` with the failure context — but in v0.1 this code path is uncommon because `run.ts` halts before any dispatch occurs; the test asserts that `verify-and-advance.ts` is NEVER invoked on a `run.ts` halt and `state.yaml` remains unchanged in that scenario).

Concretely, this story produces:

1. **`src/commands/next/run.ts`** (MODIFIED) — extends the AR9 emit shape to include `lastAttempted: { step, epic, story, attemptedAt }` on the `action: "dispatch"` line. The field is populated from the resolved step (`nextStep.name`), the dispatch-spec's `epic` + `story` (already computed), and `nowIso ?? new Date().toISOString()` for `attemptedAt`. **No lock acquired** — the field is computed in memory and emitted via the existing `emitDispatchAction` path. The schema bump is a `DispatchActionV1Schema` extension (additive — the `lastAttempted` field is optional).

2. **`src/schemas/dispatch-protocol.ts`** (MODIFIED) — extends the `DispatchActionV1Schema` discriminated union's `dispatch` variant with an optional `lastAttempted: { step, epic, story, attemptedAt }` field. The field is OPTIONAL (additive); existing callers that emit without the field continue to validate. Story 1.5 schema-skeleton style is preserved.

3. **`src/commands/next/args.ts`** (MODIFIED) — extends `parseVerifyAndAdvanceArgs` (Story 2.6 deliverable) to accept the new `--last-attempted-json '<payload>'` flag. The payload is parsed via `JSON.parse` + Zod-validated against the `LastAttemptedSchema` (a NEW Zod schema declared in `src/schemas/state.ts` — extracted from the inline `lastAttempted` field in `StateV1Schema` for reuse).

4. **`src/schemas/state.ts`** (MODIFIED) — extracts the inline `lastAttempted` and `lastFailureReason` field shapes into NAMED schemas (`LastAttemptedSchema`, `LastFailureReasonSchema`) for re-use by `args.ts` (parse the `--last-attempted-json` payload) and `verify-and-advance.ts` (construct the `lastFailureReason` literal). The existing `StateV1Schema` references the named schemas via `.nullable().optional()` wrappers — wire-compatible with the existing inline declarations. **No schema bump** (V1-extend, additive only).

5. **`src/commands/next/verify-and-advance.ts`** (MODIFIED) — extends the success path to clear `lastFailureReason: null` (Story 2.6 currently leaves it untouched). Extends the halt path (the existing outer try/catch's `instanceof StepperError` branch) to populate `state.lastAttempted` (from the `args.lastAttemptedJson` payload) AND `state.lastFailureReason: { code: err.code, message: err.message, hint: err.actionableHint, runId: args.runId }`. Adds a NEW step (between the existing catch block and the existing finally block) that calls `saveState(stateOnHalt, handle)` to persist the halt context BEFORE the lock release. The save is **best-effort** within an inner try/catch — failures warn to stderr but do not mask the original outcome.

6. **`src/commands/next/verify-and-advance.test.ts`** (MODIFIED) — appends ~10-15 NEW test cases covering AC-1 (`lastAttempted` populated on every halt path: VERIFIER_FAILURE, STATE_CHANGED_DURING_DISPATCH, sub-agent timeout simulation via mock, lock contention simulation, BUDGET_EXCEEDED simulation), AC-2 (`lastSuccessfulStep` unchanged on halt — points at previous success), AC-3 (success path clears all three fields: advances `lastSuccessfulStep`, clears `lastAttempted`, clears `lastFailureReason`), AC-4 (the AC-line-736 integration test exercising 5 halt codes).

7. **`src/commands/next/run.test.ts`** (MODIFIED) — appends ~5-8 NEW test cases covering: AR9 `dispatch` emit includes `lastAttempted` field with correct shape; `--dry-run` emit does NOT include `lastAttempted` (the field is dispatch-specific); the field is populated from `dispatchSpec.epic` + `dispatchSpec.story` + `nextStep.name` + `nowIso`.

8. **`src/integration/halt-records-state.test.ts`** (NEW) — first integration test under `src/integration/` for Story 3.1 (joins Story 2.8's `no-write-outside-scope.test.ts`). Exercises the full halt → state-write → resume-readability cycle for the 5 AC-line-736 failure codes. Verifies that after each halt: (a) `state.yaml` has the expected `lastAttempted` shape, (b) `state.lastFailureReason.code` matches the expected `StepperErrorCode`, (c) `state.lastSuccessfulStep` is unchanged from before the failed attempt, (d) re-loading the state via `loadStateUnlocked` succeeds (no schema-validation regression).

This story exercises:
- **AR12** (read-modify-write under held lock — `verify-and-advance.ts` already does this; Story 3.1 just extends the mutation set within the same `acquire() → loadStateUnlocked → mutate → saveState(state, handle) → release()` envelope).
- **AR9** (the dispatch action's payload — Story 3.1 extends the `dispatch` variant with the optional `lastAttempted` field; defence-in-depth Zod parse via `DispatchActionV1Schema.parse()` already in place).
- **AR21 + AR22** (the `lastFailureReason` payload reuses the thrown `StepperError`'s `code` + `message` + `actionableHint` — same source-of-truth as the AR9 halt action's `message` field).
- **AR25 + AR26** (Story 2.5's transcript writers already include `stateBefore` + `stateAfter` fields; Story 3.1's `state.lastAttempted` + `state.lastFailureReason` writes flow through the existing transcript serialization without further changes — the transcript markdown's "## State delta" section will now show the `lastAttempted` and `lastFailureReason` deltas).
- **AR41** (top-tier import boundary — Story 3.1 modifies existing top-tier composers `run.ts` + `verify-and-advance.ts` AND extends mid-tier `args.ts` + foundational `schemas/state.ts` + `schemas/dispatch-protocol.ts`; no new sibling-higher imports introduced).

Estimated effort: **M** (medium — modifies 6 existing files, adds 1 NEW integration test file. No new modules. No schema-version bump. Per-test surface is bounded — the integration test file is the largest new deliverable at ~200-300 lines. Below the L threshold of Story 2.6's 1351-line file).

It does **NOT**:

- **Implement `--resume`** (Story 3.2). Story 3.1 ships the WRITE-side wiring (`lastAttempted` + `lastFailureReason` populated on halt). Story 3.2 ships the READ-side consumption (`/bmad-next --resume` reads `state.lastAttempted` + `state.lastFailureReason` to construct the resume-context dispatch-spec). Story 3.1's tests verify the fields are written; Story 3.2's tests verify they are read.
- **Bump the state schema to V2.** The schema fields (`lastAttempted` + `lastFailureReason`) ALREADY EXIST on `StateV1Schema` per Story 1.5 schema-skeleton work; the architecture §P3 lines 759-764 documents them as v1 canonical fields. Story 3.1 is V1-extend (additive only — extracts the inline declarations into named schemas for re-use, no field shape changes). A future Story 6.x DispatchSpecV2 / StateV2 schema bump may introduce the `stateHash` field per Story 2.6 dev-001 carry-over; Story 3.1 is independent of that bump.
- **Implement the failure-UX modes** (Stories 5.1-5.4). On `lastFailureReason.code === "VERIFIER_FAILURE"`, Story 3.1 v0.1 records the failure to `state.yaml` and halts — there is NO retry / skip / route-to-fixer / escalate behavior at the runner tier. The four failure-UX modes live in Epic 5; Story 3.1's `lastFailureReason` is the canonical input that Stories 5.1-5.4 consume to decide which mode to apply.
- **Add an actionable resume hint to the AR9 halt line.** The halt action's `message` already carries the thrown error's `actionableHint` per AR21 + AR22. Story 3.1 does NOT alter the halt-line shape; only the persisted `state.yaml` content. The hint surfacing for `--resume` (e.g., "lastFailureReason.hint says: Run /bmad-next --resume after fixing X") is owned by Story 3.2.
- **Implement the `--diff-state` divergence detection between `state.yaml.lastAttempted` and recomputed state.** Story 3.8 owns `--diff-state`; Story 3.1's `lastAttempted` write is a pure cache field that `recomputeState` (Story 1.6 minimum-viable skeleton) does NOT touch — Story 1.6 v0.1 sets `lastAttempted: null` on every recompute (the field is INTENT, not ARTIFACT — there's no on-disk source of truth for "last attempted but not yet completed"; only the state.yaml itself). Story 3.8 may add a divergence-warning when `recomputed.lastSuccessfulStep` advances past `cached.lastAttempted` (indicating the cached attempt was actually completed externally).
- **Add a transcript-section for `lastFailureReason`.** Story 2.5's transcript already includes the failure context in the `## Errors` section + the AR21 + AR22 hint in the `## Outcome` section. Story 3.1's `lastFailureReason` write to `state.yaml` is the persistent surface; the transcript is the per-run forensic surface. They share the same source-of-truth (the thrown `StepperError`).
- **Modify `recomputeState`** (Story 1.6). The recompute heuristic does NOT cross-reference `lastAttempted` (which is forward-looking — "what's pending") with completion artifacts (which are backward-looking — "what's done"). Story 1.6's recompute v0.1 sets `lastAttempted: null` on every recompute; Story 3.1 does NOT change this. The architecture §P3 line 759-763 specifies `lastAttempted` is set during a dispatch + cleared on success, NEVER recomputed from artifacts.
- **Add new error classes.** The existing 16-code registry covers all 5 AC-line-736 halt codes (`VERIFIER_FAILURE`, `BRANCH_SWITCH`, `BMAD_INCOMPATIBLE`, `TIMEOUT`, `BUDGET_EXCEEDED`). Registry stays at **16 codes**. The state's `lastFailureReason.code` field is `z.string()` (not the closed enum) — see Story 1.5 schema decision; this leaves room for v0.1.x error class additions without a state schema bump.
- **Add a Layer 1 markdown change.** `commands/bmad-next.md` already invokes `verify-and-advance.ts` with the runId + token counts. Story 3.1 extends the markdown to forward `--last-attempted-json '<payload>'` from the captured AR9 dispatch line. The change is a **single line** in `commands/bmad-next.md` (capture `dispatchAction.lastAttempted` from the JSON line; pass as flag). This minor markdown edit is Story 3.1's only Layer 1 change.

It DOES land:

- The architecturally-prescribed `state.lastAttempted` write-on-dispatch + `state.lastFailureReason` write-on-halt mutations per FR5 + FR33 + epic AC lines 727-735.
- The 5-code integration test surface per AC line 736 (`VERIFIER_FAILURE`, `BRANCH_SWITCH`, `BMAD_INCOMPATIBLE`, `TIMEOUT`, `BUDGET_EXCEEDED`).
- The `LastAttemptedSchema` + `LastFailureReasonSchema` named extractions in `src/schemas/state.ts` for re-use by `args.ts` + `verify-and-advance.ts`.
- The `--last-attempted-json` flag surface in `parseVerifyAndAdvanceArgs` (extends Story 2.6's argv parser).
- The `lastAttempted` field on `DispatchActionV1Schema`'s `dispatch` variant (extends Story 2.2 + Story 1.5 schema).
- The single-line Layer 1 markdown extension in `commands/bmad-next.md` (forward the `lastAttempted` payload to `verify-and-advance.ts`).
- The first-integration-test joining `src/integration/no-write-outside-scope.test.ts` (Story 2.8) with Story 3.1's `halt-records-state.test.ts`.

## Acceptance Criteria

The acceptance criteria below are reproduced **verbatim** from `_bmad-output/planning-artifacts/epics.md` §Story 3.1 (lines 727-736, BDD Given/When/Then format). Lines and AC labelling preserved.

**Given** `src/state/save.ts` updates
**When** any command halts (verifier failure, sub-agent timeout, lock contention, stop-condition trigger)
**Then** `state.yaml` is atomically updated with `lastAttempted: { step, epic, story, attemptedAt }` and `lastFailureReason: { code, message, hint, runId }` (or `null` on clean exit)
**And** `lastSuccessfulStep` is cleared to point at the previous success (unchanged from before the failed attempt)
**Given** a successful step
**When** verify-and-advance commits
**Then** `lastSuccessfulStep` advances, `lastAttempted` clears, `lastFailureReason` clears
**And** integration test verifies the recording on each of: VERIFIER_FAILURE, BRANCH_SWITCH, BMAD_INCOMPATIBLE, TIMEOUT, BUDGET_EXCEEDED

## Tasks / Subtasks

- [ ] **Task 0 — Verify pre-conditions (AC: all)**
  - [ ] 0.1 Confirm Story 2.6 (`src/commands/next/verify-and-advance.ts`) is `done` per `_bmad-output/implementation-artifacts/sprint-status.yaml` (`2-6-verify-and-advance-ts-with-state-hash-check: done`). Confirm Story 2.4 (`src/commands/next/run.ts`) is `done`. Confirm Story 2.7 (`commands/bmad-next.md`) is `done`. Confirm Story 2.8 (`src/integration/no-write-outside-scope.test.ts`) is `done`. Confirm Story 1.5 (`src/schemas/state.ts`) is `done`. Confirm Story 1.6 (`src/state/load.ts` + `src/state/save.ts`) is `done`.
  - [ ] 0.2 Confirm `src/schemas/state.ts:37-54` already declares `lastAttempted: z.object({ step, epic, story, attemptedAt }).nullable().optional()` AND `lastFailureReason: z.object({ code, message, hint, runId }).nullable().optional()` per Story 1.5 schema-skeleton work + architecture §P3 lines 759-764. Verify by reading `src/schemas/state.ts` lines 37-54 verbatim. Confirm NO schema-version bump (V1 → V2) is required.
  - [ ] 0.3 Confirm `src/errors.ts` exports `StepperError` (abstract), `LockContentionError`, `BranchSwitchError`, `BmadIncompatibleError`, `VerifierFailureError`, `TimeoutError`, `BudgetExceededError`, `StateChangedDuringDispatchError`, `ConfigError`. Verify by reading `src/errors.ts` lines 47-247. Confirm registry stays at **16 codes** (no new error class needed).
  - [ ] 0.4 Confirm `src/commands/next/verify-and-advance.ts:530` already clears `lastAttempted: null` on the success path (`stateAfter = { ...stateBefore, lastAttempted: null, lastSuccessfulStep: { ... } }`). Story 3.1 EXTENDS this with `lastFailureReason: null` and ADDS the halt-path mutations.
  - [ ] 0.5 Confirm `src/commands/next/run.ts` emits `action: "dispatch"` with shape `{ action: "dispatch", runId, agent, exitCode }` per `src/schemas/dispatch-protocol.ts`. Story 3.1 EXTENDS the shape with optional `lastAttempted: {...}`. Verify by reading `src/commands/next/run.ts:760-766` + `src/schemas/dispatch-protocol.ts` (the discriminated-union `dispatch` variant).
  - [ ] 0.6 Confirm `src/commands/next/args.ts` exports `parseVerifyAndAdvanceArgs` per Story 2.6. Read the current shape (epic line 694 step 5 — accepts `--run-id`, `--tokens-in`, `--tokens-out`). Story 3.1 EXTENDS to accept `--last-attempted-json '<payload>'`.
  - [ ] 0.7 Confirm `src/state/save.ts` exports `saveState(state, lockHandle, opts?)` with REQUIRED `LockHandle` parameter per Story 1.6 NFR-S5 architectural enforcement. Verify by reading `src/state/save.ts:68-91`. Confirm Story 3.1's halt-path save uses the existing `handle` from the `acquire()` call already in `verify-and-advance.ts:459`.
  - [ ] 0.8 Confirm `src/lock/lock.ts` exports `acquire`, `LockHandle`, `LockOptions`. Story 3.1 does NOT add new lock acquisitions — it extends the existing `verify-and-advance.ts` lock-held envelope.
  - [ ] 0.9 Confirm `src/dispatch/index.ts` re-exports `emitDispatchAction` from `./emit.ts`. Story 3.1 does NOT modify the emit path (the AR9 line still goes through the existing defence-in-depth Zod parse).
  - [ ] 0.10 Confirm `commands/bmad-next.md` body (Story 2.7) reads `dispatchAction.runId` and forwards via `bun run src/commands/next/verify-and-advance.ts -- --run-id <id> --tokens-in <n> --tokens-out <n>`. Story 3.1 EXTENDS the markdown body with `--last-attempted-json '<payload>'` (single-line addition; jq-style payload extraction from the captured AR9 line).
  - [ ] 0.11 Read epics.md §Story 3.1 lines 721-736 verbatim. Confirm the AC text in §Acceptance Criteria above is character-identical.
  - [ ] 0.12 Read architecture.md §P3 lines 745-771 (canonical state.yaml YAML shape — `lastAttempted` + `lastFailureReason`). Read §line 1107 (`verify-and-advance.ts` directory listing). Read §line 1363 (FR33 → `src/state/save.ts` + `src/schemas/state.ts`). Read §line 1672 (lock-free `run.ts` / lock-held `verify-and-advance.ts` boundary).
  - [ ] 0.13 Read prd.md §FR1 line 681 (compute next step zero-config); §FR5 line 678 (state.yaml updates); §FR27 line 706 (`--resume` consumes `lastAttempted`); §FR32 line 715 (actionable error on halt); §FR33 line 712 (record `last_attempted` etc.); §FR43 line 728 (markdown transcript per step); §FR44 line 729 (JSON run log per step); §FR53 line 744 (exit codes 0-5); §FR54 line 745 (stdout/stderr discipline). Read NFR-R1 (zero data loss on halt); NFR-R4 (clean halt on stale lock); NFR-S2 (writes only inside scope); NFR-S5 (atomic tmp+rename + .bak rotation); NFR-M3 (every public schema validated by Zod).
  - [ ] 0.14 Read epic-2-retrospective.md §Forward Action Items (lines 187-208) — confirm Story 3.1 is correctly identified as the FRONT-LOAD candidate per recommended sequence §line 204 ("every other Epic 3 story consumes this state field"). Note Story 2.6 v0.1 sets `lastAttempted: null` on success per ratification carry-over; Story 3.1 lands the recording on halt paths.
  - [ ] 0.15 Read Story 2.6's `src/commands/next/verify-and-advance.ts:418-640` (the `runVerifyAndAdvance` function in full). Identify the ALREADY-PRESENT `lastAttempted: null` clear at line 530. Identify the catch block at lines 545-571 (`StepperError` translation to `action: "halt"`). Story 3.1 INSERTS a new state-save call between the catch block's `outcomeError = err` assignment and the `actionResult = { action: "halt", ... }` assignment.
  - [ ] 0.16 Confirm baseline `bun run check` exits 0 with **526 pass / 0 fail / 1881 expects / 47 files** per Story 2.8 final.
  - [ ] 0.17 Confirm Bun host version satisfies AR2 (Bun >= 1.3). Run `bun --version`; record in Completion Notes.

- [ ] **Task 1 — Plan the named-schema extraction (`LastAttemptedSchema`, `LastFailureReasonSchema`) in `src/schemas/state.ts` (AC-1)**
  - [ ] 1.1 Sketch the extraction:
    ```typescript
    export const LastAttemptedSchema = z.object({
      step: z.string(),
      epic: z.number(),
      story: z.string(),
      attemptedAt: z.string(),
    });

    export const LastFailureReasonSchema = z.object({
      code: z.string(),
      message: z.string(),
      hint: z.string(),
      runId: z.string(),
    });

    export type LastAttempted = z.infer<typeof LastAttemptedSchema>;
    export type LastFailureReason = z.infer<typeof LastFailureReasonSchema>;
    ```
  - [ ] 1.2 Update `StateV1Schema` to reference the named schemas (additive — wire-compatible with the existing inline declarations):
    ```typescript
    export const StateV1Schema = z.object({
      // ... existing fields ...
      lastAttempted: LastAttemptedSchema.nullable().optional(),
      lastFailureReason: LastFailureReasonSchema.nullable().optional(),
      // ... existing fields ...
    });
    ```
  - [ ] 1.3 Document in JSDoc that the extraction is **purely re-use refactoring** — the wire shape is byte-identical to the inline declarations; existing on-disk `state.yaml` files validate against the extracted schemas without migration.
  - [ ] 1.4 NO schema-version bump (V1 stays as V1; the extraction is additive — new exports, no field shape changes). Document in JSDoc.

- [ ] **Task 2 — Implement the named-schema extraction in `src/schemas/state.ts` (AC-1)**
  - [ ] 2.1 Edit `src/schemas/state.ts` to insert the `LastAttemptedSchema` and `LastFailureReasonSchema` constants BEFORE the `StateV1Schema` declaration. Add corresponding type exports.
  - [ ] 2.2 Replace the inline `lastAttempted: z.object({...}).nullable().optional()` with `lastAttempted: LastAttemptedSchema.nullable().optional()`. Same for `lastFailureReason`.
  - [ ] 2.3 Verify the post-edit `StateV1Schema.parse(...)` accepts the same shapes the pre-edit schema accepted. Run `bun test src/schemas/` to confirm no regression.

- [ ] **Task 3 — Plan the `DispatchActionV1Schema` extension (AR9 lastAttempted carry) (AC-1)**
  - [ ] 3.1 Read `src/schemas/dispatch-protocol.ts` to understand the current discriminated-union shape (`action: "dispatch" | "report" | "halt"`).
  - [ ] 3.2 Sketch the extension on the `dispatch` variant:
    ```typescript
    // EXISTING dispatch variant:
    z.object({
      action: z.literal("dispatch"),
      runId: z.string(),
      agent: z.string(),
      exitCode: z.literal(0),
    }),
    // EXTENDED dispatch variant (additive — lastAttempted is OPTIONAL):
    z.object({
      action: z.literal("dispatch"),
      runId: z.string(),
      agent: z.string(),
      lastAttempted: LastAttemptedSchema.optional(),
      exitCode: z.literal(0),
    }),
    ```
  - [ ] 3.3 Import `LastAttemptedSchema` from `../schemas/state.ts` (foundational-tier sibling import — same-tier OK per AR41).
  - [ ] 3.4 Document the additive nature: existing `emitDispatchAction(...)` callers that pass `{ action: "dispatch", runId, agent, exitCode }` continue to validate; new callers may include `lastAttempted` as an optional field.

- [ ] **Task 4 — Implement the `DispatchActionV1Schema` extension (AC-1)**
  - [ ] 4.1 Edit `src/schemas/dispatch-protocol.ts` to add the optional `lastAttempted: LastAttemptedSchema.optional()` field to the `dispatch` variant of the discriminated union.
  - [ ] 4.2 Add the import for `LastAttemptedSchema` from `./state.ts`.
  - [ ] 4.3 Verify the post-edit `DispatchActionV1Schema.parse(...)` accepts:
    - `{ action: "dispatch", runId: "x", agent: "y", exitCode: 0 }` (existing shape, no `lastAttempted`).
    - `{ action: "dispatch", runId: "x", agent: "y", exitCode: 0, lastAttempted: { step: "z", epic: 1, story: "1.1", attemptedAt: "..." } }` (extended shape).
  - [ ] 4.4 Run `bun test src/schemas/` to confirm no regression. Run `bun test src/dispatch/emit.test.ts` to confirm the existing emitter tests continue to pass.

- [ ] **Task 5 — Plan the `parseVerifyAndAdvanceArgs` extension (`--last-attempted-json` flag) (AC-1)**
  - [ ] 5.1 Read `src/commands/next/args.ts` to understand the current `parseVerifyAndAdvanceArgs` shape (Story 2.6 deliverable). Confirm the existing flags: `--run-id <id>`, `--tokens-in <n>`, `--tokens-out <n>`.
  - [ ] 5.2 Sketch the extended `VerifyAndAdvanceArgs` interface:
    ```typescript
    export interface VerifyAndAdvanceArgs {
      readonly runId: string;
      readonly tokensIn: number;
      readonly tokensOut: number;
      /** Optional — populated by Layer 1 from the AR9 dispatch line. NULL on first dispatch. */
      readonly lastAttempted?: LastAttempted;
    }
    ```
  - [ ] 5.3 Sketch the parser extension:
    ```typescript
    // In parseVerifyAndAdvanceArgs:
    } else if (arg === "--last-attempted-json") {
      const payload = argv[++i];
      if (payload === undefined) {
        return {
          ok: false,
          error: { code: "MISSING_VALUE", hint: "Pass --last-attempted-json '<JSON>' (got no value)." },
        };
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(payload);
      } catch (err) {
        return {
          ok: false,
          error: { code: "INVALID_JSON", hint: `Pass --last-attempted-json '<JSON>'; payload was not valid JSON: ${err instanceof Error ? err.message : String(err)}.` },
        };
      }
      const result = LastAttemptedSchema.safeParse(parsed);
      if (!result.success) {
        return {
          ok: false,
          error: { code: "INVALID_LAST_ATTEMPTED", hint: `Pass --last-attempted-json '<JSON>' matching { step, epic, story, attemptedAt }; got: ${result.error.message}.` },
        };
      }
      lastAttempted = result.data;
    }
    ```
  - [ ] 5.4 The flag is OPTIONAL — `parseVerifyAndAdvanceArgs` does NOT fail if `--last-attempted-json` is absent (Layer 1 may legitimately invoke `verify-and-advance.ts` after a clean dispatch where the field was not yet captured by an older bmad-next.md body — graceful degradation).
  - [ ] 5.5 Document the AR22 hint prefix discipline: the new error hints use `Pass` (not `Run`/`See`/`Try`/`Check`). Per Story 2.2 Nit-1 + Story 2.4 AR22 PARTIAL precedent, `Pass` is an established `hintOverride` verb (carry-over to Story 6.x for verb ratification — Story 3.1 maintains the precedent).

- [ ] **Task 6 — Implement the `parseVerifyAndAdvanceArgs` extension (AC-1)**
  - [ ] 6.1 Edit `src/commands/next/args.ts` to extend `VerifyAndAdvanceArgs` with the optional `lastAttempted?: LastAttempted` field.
  - [ ] 6.2 Add the `LastAttempted` import from `../../schemas/state.ts` (foundational-tier import — OK per AR41).
  - [ ] 6.3 Add the `--last-attempted-json` flag handler to the tokenizer per Task 5.3 sketch.
  - [ ] 6.4 Update the `VerifyAndAdvanceArgsSchema` Zod schema (if present per Story 2.6 Task 4.2) to include `lastAttempted: LastAttemptedSchema.optional()`. Re-export `LastAttemptedSchema` if not already exported.
  - [ ] 6.5 Add 4-5 NEW test cases to `src/commands/next/args.test.ts`:
    - Happy path: `--run-id x --tokens-in 0 --tokens-out 0 --last-attempted-json '{"step":"y","epic":1,"story":"1.1","attemptedAt":"2026-04-30T00:00:00Z"}'` → `{ ok: true, value: { runId: "x", tokensIn: 0, tokensOut: 0, lastAttempted: {...} } }`.
    - Optional: `--run-id x --tokens-in 0 --tokens-out 0` (no `--last-attempted-json`) → `{ ok: true, value: { ..., lastAttempted: undefined } }`.
    - Missing value: `--run-id x --tokens-in 0 --tokens-out 0 --last-attempted-json` (no payload) → `{ ok: false, error: { code: "MISSING_VALUE", hint: "Pass --last-attempted-json '<JSON>'..." } }`.
    - Invalid JSON: `--run-id x --tokens-in 0 --tokens-out 0 --last-attempted-json '{not json}'` → `{ ok: false, error: { code: "INVALID_JSON", ... } }`.
    - Schema mismatch: `--run-id x --tokens-in 0 --tokens-out 0 --last-attempted-json '{"step":"y"}'` (missing required fields) → `{ ok: false, error: { code: "INVALID_LAST_ATTEMPTED", ... } }`.
  - [ ] 6.6 Update `src/commands/next/index.ts` barrel: re-export `VerifyAndAdvanceArgs` (already done by Story 2.6) — no additional barrel change needed (the type extension is additive on the existing export).

- [ ] **Task 7 — Plan the `run.ts` AR9 emit extension (`lastAttempted` payload) (AC-1)**
  - [ ] 7.1 Read `src/commands/next/run.ts:760-770` (the `action: "dispatch"` emit at the bottom of the happy path). Identify the existing literal:
    ```typescript
    const action: DispatchActionV1 = {
      action: "dispatch",
      runId: result.runId,
      agent: STEP_RUNNER_AGENT,
      exitCode: 0,
    };
    return { exitCode: 0, action };
    ```
  - [ ] 7.2 Extend the literal with the `lastAttempted` field. The values come from already-resolved variables in scope:
    - `step: nextStep.name` (from `pickNextStep` at line 719).
    - `epic`: derived from `dispatchSpec.epic` (from `result` returned by `buildDispatchSpec`). The result already carries `runId` and `stagingDir` — Story 3.1 may need to extend the `BuildDispatchSpecResult` shape to expose `epic` and `story`, OR may compute them from `state` + `nextStep.name` (the dispatch-spec's `epic`/`story` fields are already populated in `buildDispatchSpec`).
    - `story`: same source as `epic`.
    - `attemptedAt: opts?.nowIso ?? new Date().toISOString()` (matches the timestamp Story 2.6 uses for state mutation per `verify-and-advance.ts:508`).
  - [ ] 7.3 Investigate the `BuildDispatchSpecResult` shape from Story 2.2 — confirm whether `epic` and `story` are exposed. If not, extend `BuildDispatchSpecResult` to include them (additive; existing callers continue to work). The dispatch-spec on disk already carries these fields per Story 1.5 + Story 2.2's `DispatchSpecV1Schema`.
  - [ ] 7.4 Document the timestamp discipline: `attemptedAt` uses the `opts?.nowIso` injection point (test-deterministic) OR `new Date().toISOString()` (production). Story 2.6's `completedAt` follows the same pattern at line 508.

- [ ] **Task 8 — Implement the `run.ts` AR9 emit extension (AC-1)**
  - [ ] 8.1 Edit `src/commands/next/run.ts` to extend the `action: "dispatch"` literal at lines 761-766 with the optional `lastAttempted` field per Task 7.2 sketch.
  - [ ] 8.2 If `BuildDispatchSpecResult` does NOT expose `epic` and `story`, edit `src/dispatch/generate-spec.ts` to extend the result shape with these fields (additive; existing callers continue to work). Add the corresponding test cases in `src/dispatch/generate-spec.test.ts`.
  - [ ] 8.3 Wire the `lastAttempted` value:
    ```typescript
    const action: DispatchActionV1 = {
      action: "dispatch",
      runId: result.runId,
      agent: STEP_RUNNER_AGENT,
      lastAttempted: {
        step: nextStep.name,
        epic: result.epic,
        story: result.story,
        attemptedAt: opts?.nowIso ?? new Date().toISOString(),
      },
      exitCode: 0,
    };
    ```
  - [ ] 8.4 Add 5-8 NEW test cases to `src/commands/next/run.test.ts`:
    - AR9 dispatch emit includes `lastAttempted` field with correct shape (`step` matches `nextStep.name`; `epic` matches `dispatchSpec.epic`; `story` matches `dispatchSpec.story`; `attemptedAt` is a valid ISO 8601 string).
    - Test-injected `nowIso` is honored — `lastAttempted.attemptedAt === opts.nowIso`.
    - `--dry-run` emit (`action: "report"`) does NOT include `lastAttempted` (the field is dispatch-specific; per `src/schemas/dispatch-protocol.ts` discriminated union it only lives on the `dispatch` variant).
    - The defence-in-depth Zod parse via `DispatchActionV1Schema.parse()` validates the extended shape (test the emit path end-to-end).
    - Halt path (e.g., `enforceMutuallyExclusiveFlags` throw) does NOT emit `lastAttempted` (the halt action is a different variant of the discriminated union).
  - [ ] 8.5 Update the existing `run.test.ts` tests that assert on the `action` shape — confirm they continue to pass with the additive extension. May need to soften `toEqual({...})` assertions to `toMatchObject({...})` if the existing tests use strict shape equality (additive fields would break strict-equal).

- [ ] **Task 9 — Plan the `verify-and-advance.ts` halt-path state-save extension (AC-1, AC-2)**
  - [ ] 9.1 Read `src/commands/next/verify-and-advance.ts:545-571` (the catch block + `outcomeError = err` assignment + `actionResult = { action: "halt", ... }` assignment). Identify the EXACT insertion point for the new state-save call.
  - [ ] 9.2 Sketch the new state-save logic (executed AFTER `outcomeError = err` and BEFORE `actionResult = ...`):
    ```typescript
    } catch (err) {
      if (err instanceof StepperError) {
        outcomeError = err;

        // Story 3.1: persist halt context to state.yaml under the held lock.
        // Best-effort — failure to save the halt context must NOT mask the
        // original outcome (the original error is still surfaced via the
        // halt action's message).
        if (handle !== undefined && stateBefore !== undefined) {
          try {
            const stateOnHalt: State = {
              ...stateBefore,
              // lastSuccessfulStep is UNCHANGED — points at previous success
              // per AC line 732 ("lastSuccessfulStep is cleared to point at
              // the previous success (unchanged from before the failed
              // attempt)").
              lastAttempted: args.lastAttempted ?? null,
              lastFailureReason: {
                code: err.code,
                message: err.message,
                hint: err.actionableHint,
                runId: args.runId,
              },
            };
            await saveState(stateOnHalt, handle, { statePath: opts?.statePath });
          } catch (saveErr) {
            log.warn(
              `verify-and-advance: failed to persist halt context to state.yaml (non-fatal): ${saveErr instanceof Error ? saveErr.message : String(saveErr)}`,
            );
          }
        }

        const code = err.exitCode;
        // ... existing actionResult literal ...
      } else {
        // ... existing non-StepperError path ...
      }
    }
    ```
  - [ ] 9.3 Sketch the success-path extension at line 530:
    ```typescript
    stateAfter = {
      ...stateBefore,
      lastSuccessfulStep: { ... },
      lastAttempted: null,
      lastFailureReason: null,  // NEW — Story 3.1 clears the failure context on success per AC line 735
      runHistory: [...],
    };
    ```
  - [ ] 9.4 Document the lock-held discipline: the new save call uses the EXISTING `handle` from `acquire(opts?.lockOptions)` at line 459 — no new lock acquisition. Per AR12 + Story 1.6 NFR-S5, `saveState(state, handle, ...)` is the canonical single write point.
  - [ ] 9.5 Document the best-effort discipline: the new save call is wrapped in its own try/catch with `log.warn(...)` — the original error (which surfaces via `actionResult.message`) is NEVER masked. This mirrors Story 2.6's transcript-write best-effort pattern at lines 608-612.
  - [ ] 9.6 Document the `args.lastAttempted ?? null` semantics: if Layer 1 did NOT pass `--last-attempted-json` (e.g., older bmad-next.md body, or programmatic invocation without the flag), `state.lastAttempted` is set to `null` (the field's nullable optional default). The integration test at Task 13 covers both with-and-without `--last-attempted-json` cases.
  - [ ] 9.7 Document the `handle !== undefined && stateBefore !== undefined` guard: the new save can only run AFTER `acquire()` succeeded AND `loadStateUnlocked` succeeded. Halts before either step (lock-contention; corrupt state) do NOT have enough context to save — they propagate via the existing catch path; `state.yaml` is unchanged on those paths.

- [ ] **Task 10 — Implement the `verify-and-advance.ts` halt-path state-save (AC-1, AC-2)**
  - [ ] 10.1 Edit `src/commands/next/verify-and-advance.ts` to extend the success-path state mutation at line 530 with `lastFailureReason: null`.
  - [ ] 10.2 Edit `src/commands/next/verify-and-advance.ts` to insert the halt-path state-save call per Task 9.2 sketch. Insert AFTER `outcomeError = err` and BEFORE the `code` extraction.
  - [ ] 10.3 Verify the new save call uses the EXISTING `handle` variable (line 459). Verify the new save call uses the EXISTING `args.lastAttempted` field (added by Task 6 to `parseVerifyAndAdvanceArgs`).
  - [ ] 10.4 Verify the new save call wraps in a NESTED try/catch with `log.warn(...)` on failure. The OUTER catch's existing flow (set `actionResult`, set `exitCode`) MUST continue regardless of the inner save outcome.
  - [ ] 10.5 Run `bun test src/commands/next/verify-and-advance.test.ts` (Story 2.6 colocated tests) to confirm no regression on the existing test surface.

- [ ] **Task 11 — Add `verify-and-advance.test.ts` halt-path coverage (AC-1, AC-2, AC-4)**
  - [ ] 11.1 Append to `src/commands/next/verify-and-advance.test.ts` a new `describe` block: `"Story 3.1: lastAttempted + lastFailureReason on halt"`.
  - [ ] 11.2 Test case A: **VERIFIER_FAILURE halt records lastAttempted + lastFailureReason** — write a fixture dispatch-spec under `staging/<runId>/`; mock `runVerifier` to return `{ status: "fail", checks: [...] }`; invoke `runVerifyAndAdvance` with `--last-attempted-json '<payload>'`; assert (a) result.exitCode === 1, (b) `state.yaml` has `lastAttempted` matching the JSON payload, (c) `state.yaml` has `lastFailureReason.code === "VERIFIER_FAILURE"`, (d) `state.yaml.lastSuccessfulStep` is unchanged from `stateBefore.lastSuccessfulStep`.
  - [ ] 11.3 Test case B: **STATE_CHANGED_DURING_DISPATCH halt records lastAttempted + lastFailureReason** — write a dispatch-spec for `(epic: 1, story: "1.1")`; seed `state.yaml` with `lastAttempted: { epic: 2, story: "2.1", ...}` (state has advanced); invoke; assert (a) result.exitCode === 1, (b) `state.lastFailureReason.code === "STATE_CHANGED_DURING_DISPATCH"`.
  - [ ] 11.4 Test case C: **TIMEOUT halt records lastAttempted + lastFailureReason** — mock `runVerifier` to throw `new TimeoutError(...)`; assert (a) result.exitCode === 1, (b) `state.lastFailureReason.code === "TIMEOUT"`, (c) `state.lastFailureReason.hint === TimeoutError.actionableHint` (matches `src/errors.ts:202-203`).
  - [ ] 11.5 Test case D: **BUDGET_EXCEEDED halt records lastAttempted + lastFailureReason** — mock `runVerifier` to throw `new BudgetExceededError(...)`; assert (a) result.exitCode === 5, (b) `state.lastFailureReason.code === "BUDGET_EXCEEDED"`.
  - [ ] 11.6 Test case E: **Success path clears all three fields** — mock `runVerifier` to return `{ status: "pass" }`; mock `promote` to succeed; assert (a) result.exitCode === 0, (b) `state.lastSuccessfulStep` advances, (c) `state.lastAttempted === null`, (d) `state.lastFailureReason === null`.
  - [ ] 11.7 Test case F: **Halt without --last-attempted-json sets lastAttempted to null** — invoke without the new flag; assert `state.lastAttempted === null` AND `state.lastFailureReason !== null` (graceful degradation per Task 5.4).
  - [ ] 11.8 Test case G: **Best-effort state-save failure does not mask original error** — mock `saveState` to throw on the halt-path call; assert (a) the original verifier-failure halt is still surfaced via `result.action.message`, (b) the warn log includes "failed to persist halt context to state.yaml (non-fatal)".
  - [ ] 11.9 Test case H: **Lock-contention halt does NOT write state.yaml** — simulate `acquire()` throwing `LockContentionError`; assert (a) result.exitCode === 4, (b) `state.yaml` is byte-identical to the pre-test seed (no halt-context write occurred — `handle === undefined` guards the save).
  - [ ] 11.10 Test case I: **CorruptStateError halt does NOT write state.yaml** — make `loadStateUnlocked` throw `CorruptStateError`; assert (a) result.exitCode === 1, (b) `state.yaml` is unchanged (`stateBefore === undefined` guards the save).
  - [ ] 11.11 Test case J: **State-save lock-handle parameter is the existing handle** — spy on `saveState` calls; assert the second invocation (halt-path save) receives the SAME `handle` object as the first invocation (success-path save in a different test) OR (since these are different test runs) — assert at least the function is called with a non-null first-positional `LockHandle`.
  - [ ] 11.12 Each test follows AR35 tmpdir-per-test discipline: `mkdtemp(path.join(os.tmpdir(), "stepper-3-1-..."))` in `beforeEach`; `fs.rm(tmp, {recursive: true, force: true})` in `afterEach`.
  - [ ] 11.13 Each test passes `opts?.statePath`, `opts?.stagingRoot`, `opts?.canonicalRoot`, `opts?.runsRoot`, `opts?.lockOptions` to isolate from production paths.

- [ ] **Task 12 — Update `commands/bmad-next.md` to forward `--last-attempted-json` (AC-1, AC-4)**
  - [ ] 12.1 Read `commands/bmad-next.md` (Story 2.7 deliverable) to identify the `verify-and-advance.ts` invocation. The current line is approximately:
    ```bash
    bun run src/commands/next/verify-and-advance.ts -- --run-id <id> --tokens-in <n> --tokens-out <n>
    ```
  - [ ] 12.2 Extend with the `--last-attempted-json` flag, populating from the captured AR9 dispatch action's `lastAttempted` field via `jq -c '.lastAttempted'`. Sketch:
    ```bash
    LAST_ATTEMPTED_JSON=$(echo "$dispatchActionLine" | jq -c '.lastAttempted // empty')
    if [ -n "$LAST_ATTEMPTED_JSON" ]; then
      bun run src/commands/next/verify-and-advance.ts -- --run-id "$runId" --tokens-in "$tokensIn" --tokens-out "$tokensOut" --last-attempted-json "$LAST_ATTEMPTED_JSON"
    else
      bun run src/commands/next/verify-and-advance.ts -- --run-id "$runId" --tokens-in "$tokensIn" --tokens-out "$tokensOut"
    fi
    ```
    The exact bash + jq syntax should match Story 2.7's existing patterns; the markdown body's "shell sketch" form may differ (Layer 1 markdown is interpreted, not literal bash).
  - [ ] 12.3 Verify `commands/bmad-next.md`'s frontmatter `allowed-tools` already includes `Bash` (no change needed). Per Story 2.7, the `tool restrictions` line declares `Bash limited to bun run <plugin-root>/...` — the new invocation is within that scope.
  - [ ] 12.4 Single-line markdown change. NO functional logic change — the body still does `Bash → AR9 → Task → Bash → summary`; only the second `Bash` invocation gets the additional flag.
  - [ ] 12.5 If Story 2.7's markdown body uses a placeholder for the `verify-and-advance.ts` invocation that conditionally includes flags based on the captured JSON, simply extend the placeholder list with `lastAttempted`. The exact form depends on Story 2.7's chosen syntax.

- [ ] **Task 13 — Add `src/integration/halt-records-state.test.ts` (AC-4 — 5-code integration coverage)**
  - [ ] 13.1 Create `src/integration/halt-records-state.test.ts` (NEW). This is the CANONICAL Story 3.1 integration test joining Story 2.8's `no-write-outside-scope.test.ts` in the `src/integration/` directory.
  - [ ] 13.2 Module purpose JSDoc:
    ```typescript
    /**
     * src/integration/halt-records-state.test.ts — Story 3.1 integration test
     * verifying that every halt path persists `lastAttempted` + `lastFailureReason`
     * to `state.yaml` per FR5 + FR33 + epic AC line 736 (5-code coverage).
     *
     * Halt codes verified (epic AC line 736):
     *   - VERIFIER_FAILURE — verifier rejects the artifact
     *   - BRANCH_SWITCH — Story 1.8 branch detection (simulated via state.lastSnapshot mismatch)
     *   - BMAD_INCOMPATIBLE — Story 1.9 BMAD-version detection (simulated via mocked detect)
     *   - TIMEOUT — sub-agent timeout (simulated via mocked runVerifier throw)
     *   - BUDGET_EXCEEDED — token budget exceeded (simulated via mocked runVerifier throw)
     *
     * Per AR35: tmpdir-per-test isolation; tests rely on injected paths only.
     * Per Story 2.8 precedent: integration tests under src/integration/ exercise
     * cross-tier flows that colocated tests cannot easily cover.
     */
    ```
  - [ ] 13.3 Test fixtures — for each halt code, the test case constructs:
    - A pre-test state.yaml with a known `lastSuccessfulStep` (e.g., `{ step: "bmad-create-prd", epic: 1, story: "1.1", completedAt: "2026-04-29T00:00:00Z" }`) and `lastAttempted: null`, `lastFailureReason: null`.
    - A dispatch-spec under `staging/<runId>/dispatch-spec.json` matching the seeded state's `(epic, story)` projection (so the state-hash check passes — except for the BRANCH_SWITCH case which deliberately mismatches).
    - A sub-agent output under `staging/<runId>/outputs/<step>.md` (for the verifier-failure test, the file is malformed; for other tests, the file is well-formed but a downstream component throws).
  - [ ] 13.4 Test case 1: **VERIFIER_FAILURE** — mock `runVerifier` to return `{ status: "fail", checks: [{ name: "schema", status: "fail", detail: "missing required section" }] }`. Invoke `runVerifyAndAdvance({ argv: ["--run-id", runId, "--tokens-in", "100", "--tokens-out", "50", "--last-attempted-json", JSON.stringify(lastAttempted)] })`. Assert: result.exitCode === 1; loaded `state.yaml.lastFailureReason.code === "VERIFIER_FAILURE"`; loaded `state.yaml.lastAttempted` matches the input payload; loaded `state.yaml.lastSuccessfulStep` unchanged.
  - [ ] 13.5 Test case 2: **BRANCH_SWITCH** — directly throw `BranchSwitchError` from a mocked component (or simulate via the existing branch-detection check if Story 1.8's surface is reachable from `verify-and-advance.ts`). v0.1 Story 3.1 may simulate via mocked dispatch — the spirit of the AC is that ANY thrown `StepperError` produces the canonical halt-state-record. Document the v0.1 simulation strategy in the test JSDoc.
  - [ ] 13.6 Test case 3: **BMAD_INCOMPATIBLE** — same simulation pattern as BRANCH_SWITCH. The error class throws from `verify-and-advance.ts`'s component-mock. Assert `state.lastFailureReason.code === "BMAD_INCOMPATIBLE"`.
  - [ ] 13.7 Test case 4: **TIMEOUT** — mock `runVerifier` to throw `new TimeoutError("verifier execution exceeded 300000ms")`. Assert `state.lastFailureReason.code === "TIMEOUT"`; `state.lastFailureReason.hint` matches `TimeoutError`'s registry default.
  - [ ] 13.8 Test case 5: **BUDGET_EXCEEDED** — mock `runVerifier` to throw `new BudgetExceededError("token budget exceeded")`. Assert `state.lastFailureReason.code === "BUDGET_EXCEEDED"`; result.exitCode === 5 (per `BudgetExceededError.exitCode = 5`).
  - [ ] 13.9 For each test: assert (a) `state.yaml` is re-loadable via `loadStateUnlocked` without schema-validation regression, (b) `state.yaml` is byte-stable across two reads (no .bak rotation issue), (c) the AR9 halt action's `message` matches the thrown `StepperError.actionableHint` (cross-validation with `state.lastFailureReason.hint`).
  - [ ] 13.10 Each test follows AR35 tmpdir-per-test discipline: `mkdtemp(path.join(os.tmpdir(), "stepper-integration-3-1-..."))` in `beforeEach`; `fs.rm(tmp, {recursive: true, force: true})` in `afterEach`. Each test injects `statePath`, `stagingRoot`, `canonicalRoot`, `runsRoot`, `lockOptions` into `runVerifyAndAdvance` to isolate from production paths.
  - [ ] 13.11 Document the integration-test purpose in the file header: this test exercises the END-TO-END halt → state-write contract for the 5 AC-line-736 codes; the colocated `verify-and-advance.test.ts` tests cover the per-code unit behavior with mocking.

- [ ] **Task 14 — Verify the named-schema extraction is wire-compatible (AC-1)**
  - [ ] 14.1 Add a test case to `src/schemas/state.test.ts` (or create the file if not present) that asserts:
    - `StateV1Schema.parse({ schemaVersion: 1, project: { name: "x", bmadVersion: "y" }, lastAttempted: null, lastFailureReason: null, ... })` succeeds.
    - `StateV1Schema.parse({ schemaVersion: 1, project: { name: "x", bmadVersion: "y" } })` succeeds (both fields omitted — `.nullable().optional()` accepts).
    - `StateV1Schema.parse({ schemaVersion: 1, project: { name: "x", bmadVersion: "y" }, lastAttempted: { step: "z", epic: 1, story: "1.1", attemptedAt: "2026-04-30T00:00:00Z" } })` succeeds.
    - `LastAttemptedSchema.parse({ step: "z", epic: 1, story: "1.1", attemptedAt: "2026-04-30T00:00:00Z" })` succeeds.
    - `LastFailureReasonSchema.parse({ code: "VERIFIER_FAILURE", message: "x", hint: "y", runId: "z" })` succeeds.
  - [ ] 14.2 Run `bun test src/schemas/` to confirm the existing tests + the new tests pass. Confirm the on-disk state.yaml fixtures (if any) under `tests/fixtures/` continue to validate.

- [ ] **Task 15 — Run the full test suite + `bun run check` (AC: all)**
  - [ ] 15.1 Run `bun run check` (the canonical CI gate). Expected baseline pre-Story-3.1 was **526 pass / 0 fail / 1881 expects / 47 files** per Story 2.8 final. Story 3.1 adds:
    - +5 args.test.ts (Task 6.5).
    - +5-8 run.test.ts (Task 8.4).
    - +10-12 verify-and-advance.test.ts (Task 11).
    - +5 schemas/state.test.ts (Task 14).
    - +5 integration/halt-records-state.test.ts (Task 13).
    - **Estimated total Story 3.1 test delta: +30-35 tests; +1 new file (`integration/halt-records-state.test.ts`).**
  - [ ] 15.2 Expected post-Story-3.1 baseline: **~556-561 pass / 0 fail / ~2000 expects / 48 files**. Confirm `bun run check` exits 0.
  - [ ] 15.3 Confirm `src/errors.ts` registry stays at **16 codes** (no new error class added per Task 0.3 + Story 3.1 Context Summary).
  - [ ] 15.4 Run `bun test src/integration/` to confirm both `no-write-outside-scope.test.ts` (Story 2.8) and `halt-records-state.test.ts` (Story 3.1) pass.
  - [ ] 15.5 Run `bun test src/smoke/` to confirm Story 2.8's `next.test.ts` end-to-end smoke continues to pass with the AR9 emit extension. The smoke may need to be updated if it asserts on the EXACT shape of `dispatchAction` (the additive `lastAttempted` field would break strict shape equality).

- [ ] **Task 16 — Update sprint-status.yaml + record completion (AC: all)**
  - [ ] 16.1 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`:
    - Flip `epic-3: backlog` → `epic-3: in-progress` (auto-transition trigger per sprint-status.yaml line 16: "Epic transitions to 'in-progress' automatically when first story is created").
    - Flip `3-1-record-last-attempted-last-failure-reason-on-halt: backlog` → `3-1-record-last-attempted-last-failure-reason-on-halt: ready-for-dev` (the standard backlog → ready-for-dev transition per sprint-status.yaml line 22).
    - Update `last_updated: '2026-04-30'`.
  - [ ] 16.2 Update the story file's frontmatter status from `ready-for-dev` (initial) to `done` AT THE END of the dev-story workflow (NOT at create-story time). Story 3.1 create-story produces the spec at status `ready-for-dev`; the bmad-dev-story workflow updates to `in-progress` then `review`; the bmad-code-review workflow updates to `done`.
  - [ ] 16.3 Verify sprint-status.yaml passes its existing schema check (no new schema fields added).

## Dev Notes

### File List

#### Modified Files

- **`src/schemas/state.ts`** (~70 → ~85 lines): extracts `LastAttemptedSchema` + `LastFailureReasonSchema` named exports; references them via `.nullable().optional()` on `StateV1Schema`. **Wire-compatible** with existing on-disk state.yaml files. Adds 2 new exported schemas + 2 new exported types. NO schema-version bump (V1 stays as V1; the extraction is additive).
- **`src/schemas/dispatch-protocol.ts`** (~50 → ~58 lines): extends the `dispatch` variant of `DispatchActionV1Schema` with optional `lastAttempted: LastAttemptedSchema.optional()`. Imports `LastAttemptedSchema` from `./state.ts` (foundational-tier sibling import OK per AR41).
- **`src/commands/next/args.ts`** (existing — extended ~30 lines): extends `parseVerifyAndAdvanceArgs` with `--last-attempted-json` flag handler; extends `VerifyAndAdvanceArgs` interface with optional `lastAttempted?: LastAttempted` field; extends `VerifyAndAdvanceArgsSchema` Zod schema (if present per Story 2.6) with the new field. Imports `LastAttemptedSchema` + `LastAttempted` from `../../schemas/state.ts`.
- **`src/commands/next/run.ts`** (~850 → ~860 lines): extends the `action: "dispatch"` literal at lines 761-766 with optional `lastAttempted` field populated from `nextStep.name`, `dispatchSpec.epic`, `dispatchSpec.story`, `opts?.nowIso ?? new Date().toISOString()`. May extend the `BuildDispatchSpecResult` shape if `epic` + `story` are not already exposed.
- **`src/commands/next/verify-and-advance.ts`** (~813 → ~860 lines): inserts halt-path state-save call AFTER `outcomeError = err` and BEFORE the `code` extraction in the catch block at lines 545-571. Extends success-path mutation at line 530 with `lastFailureReason: null`. Wraps the new save call in an inner try/catch with `log.warn(...)` per best-effort discipline.
- **`commands/bmad-next.md`** (Story 2.7 — extended ~5 lines): forwards `--last-attempted-json '<payload>'` from the captured AR9 dispatch action to `verify-and-advance.ts`. Single-line addition (or 5-line conditional block depending on Story 2.7's chosen markdown sketch syntax).
- **`src/dispatch/generate-spec.ts`** (potentially modified, ~5 lines): extends `BuildDispatchSpecResult` shape to expose `epic` + `story` fields if not already present per Task 8.2. Additive — existing callers continue to work.
- **`src/commands/next/args.test.ts`** (Story 2.6 — extended ~30 lines): adds 4-5 new test cases for the `--last-attempted-json` flag (Task 6.5).
- **`src/commands/next/run.test.ts`** (Story 2.4 — extended ~50 lines): adds 5-8 new test cases for the AR9 emit extension (Task 8.4).
- **`src/commands/next/verify-and-advance.test.ts`** (Story 2.6 — extended ~150 lines): adds 10-12 new test cases for the halt-path state-save (Task 11).
- **`src/dispatch/generate-spec.test.ts`** (potentially extended, ~10 lines): adds test cases for the `BuildDispatchSpecResult` shape extension if applicable.
- **`src/schemas/state.test.ts`** (potentially NEW or extended, ~30 lines): tests the named-schema extraction is wire-compatible (Task 14).

#### New Files

- **`src/integration/halt-records-state.test.ts`** (NEW, ~250-300 lines): the canonical Story 3.1 integration test joining Story 2.8's `no-write-outside-scope.test.ts` in `src/integration/`. Exercises the 5-code halt → state-write coverage per AC line 736.

#### Sprint-Status

- **`_bmad-output/implementation-artifacts/sprint-status.yaml`**: flip `3-1-record-last-attempted-last-failure-reason-on-halt: backlog → ready-for-dev`; auto-transition `epic-3: backlog → in-progress`.

### Architecture Compliance

- **AR8** (lock-free `run.ts` / lock-held `verify-and-advance.ts`): UNCHANGED. Story 3.1's `lastAttempted` write splits across the two layers per process-boundary discipline — `run.ts` emits the field on the AR9 line (no lock); `verify-and-advance.ts` writes to `state.yaml` under the existing `acquire() → ... → release()` envelope.
- **AR9** (single discriminated-union JSON line on stdout): EXTENDED. The `dispatch` variant's optional `lastAttempted` field is additive; defence-in-depth Zod parse via `DispatchActionV1Schema.parse()` already in place. ONE line per `bun run` invocation (unchanged).
- **AR11** (state save semantics): UNCHANGED. The new save call uses the existing `saveState(state, handle, opts?)` API.
- **AR12** (read-modify-write under held lock): EXTENDED. The new halt-path save is the SECOND save call within the existing lock-held envelope (the first is the success-path save at line 536). Both run under the same `handle`. The new save may replace the success-path save (the catch path is mutually exclusive with the success path) — the lock is held continuously from `acquire()` at line 459 to `handle.release()` in the finally block.
- **AR21 + AR22** (errors carry `code` + `actionableHint`; single-line `Run/See/Try/Check` hints): UNCHANGED for production error registry. Story 3.1 reuses the EXISTING `StepperError.actionableHint` getter to populate `state.lastFailureReason.hint` — no new hints introduced. The new `parseVerifyAndAdvanceArgs` flag-error hints use `Pass` per Story 2.2 + Story 2.4 AR22 PARTIAL precedent (carry-over to Story 6.x).
- **AR25 + AR26** (markdown transcript + JSON run log per step): UNCHANGED. Story 2.5's transcript writers already serialize `stateBefore` + `stateAfter`; the new `lastAttempted` + `lastFailureReason` deltas flow through without further changes.
- **AR33** (function & error semantics; no `console.*`): UNCHANGED. The new `log.warn(...)` calls go through `src/io/log.ts`'s `warn` writer.
- **AR41** (boundary graph; no upward / sibling-higher imports): UNCHANGED. Story 3.1 modifies existing top-tier composers (`run.ts` + `verify-and-advance.ts`); extends mid-tier `args.ts` + foundational `schemas/state.ts` + `schemas/dispatch-protocol.ts`. NO new sibling-higher imports introduced. The new schema imports (`LastAttemptedSchema` from `./state.ts` in `dispatch-protocol.ts`) are foundational-tier sibling imports — explicitly allowed per architecture lines 1287-1289.

### Acceptance Criteria Mapping

- **AC-1** ("`state.yaml` is atomically updated with `lastAttempted` and `lastFailureReason` (or `null` on clean exit)"): delivered by Tasks 9-10 (verify-and-advance halt-path save + success-path clear) + Tasks 5-6 (parseVerifyAndAdvanceArgs `--last-attempted-json` flag) + Tasks 7-8 (run.ts AR9 emit extension) + Task 12 (Layer 1 markdown forward).
- **AC-2** ("`lastSuccessfulStep` is cleared to point at the previous success (unchanged from before the failed attempt)"): delivered by Task 9.2 (the new state literal preserves `stateBefore.lastSuccessfulStep` unchanged).
- **AC-3** ("`lastSuccessfulStep` advances, `lastAttempted` clears, `lastFailureReason` clears"): delivered by Task 10.1 (success-path mutation extension at line 530).
- **AC-4** ("integration test verifies the recording on each of: VERIFIER_FAILURE, BRANCH_SWITCH, BMAD_INCOMPATIBLE, TIMEOUT, BUDGET_EXCEEDED"): delivered by Task 13 (`src/integration/halt-records-state.test.ts`).

### v0.1 Design Decisions

#### V1-extend strategy (no V2 schema bump)

The schema fields ALREADY EXIST. `src/schemas/state.ts:37-54` declares both `lastAttempted` and `lastFailureReason` as optional + nullable on `StateV1Schema` per Story 1.5 schema-skeleton work. Architecture §P3 lines 759-764 documents the canonical YAML shape. **No V1 → V2 bump is required.** The named-schema extraction (`LastAttemptedSchema` + `LastFailureReasonSchema`) is purely a re-use refactoring; the wire shape is byte-identical.

#### Layer-2 lock-free write contract preserved

Per architecture §line 1672, `run.ts` is read-only and lock-free. Story 3.1 extends `run.ts` to EMIT the planned `lastAttempted` payload on the AR9 line (no lock acquisition), then forwards via `commands/bmad-next.md` to `verify-and-advance.ts` which WRITES it to `state.yaml` under the held lock. The lock-free / lock-held boundary is preserved.

#### Best-effort halt-path save (does not mask original error)

The new halt-path save is wrapped in an inner try/catch with `log.warn(...)`. If the save fails (e.g., disk full, EACCES), the original `StepperError` is still surfaced via the AR9 halt action's `message` field. This mirrors Story 2.6's transcript-write best-effort pattern at lines 608-612.

#### Optional `--last-attempted-json` flag (graceful degradation)

`parseVerifyAndAdvanceArgs` does NOT fail if `--last-attempted-json` is absent. Layer 1 may legitimately invoke `verify-and-advance.ts` after a clean dispatch where the field was not yet captured by an older `bmad-next.md` body. In this case, `state.lastAttempted` is set to `null` on halt (the field's nullable optional default).

#### Reuse `StepperError.actionableHint` for `lastFailureReason.hint`

The thrown error's `actionableHint` getter is the canonical source-of-truth for the hint. Story 3.1 does NOT introduce a separate hint string — `state.lastFailureReason.hint = err.actionableHint`. This guarantees the persisted hint matches the AR9 halt action's `message` (cross-validation in Task 13.9).

### Carry-overs from Epic 2 Retrospective

- **Story 2.6 dev-001** (state-hash uses Option A — epic+story tuple comparison): UNCHANGED by Story 3.1. Story 3.1 does NOT alter the state-hash logic; only the post-comparison halt-path save.
- **Story 2.5 dev-001** (directory rename `src/transcript/` → `src/runs/`): RESPECTED. Story 3.1's transcript references use `src/runs/` per the established convention (no architecture-doc cross-reference patches needed by Story 3.1).
- **Story 2.6 dev-002** (`runVerifier` `stagingRoot` REQUIRED): UNCHANGED by Story 3.1. The polish PR is deferred to Story 6.x.
- **Story 2.6 dev-003** (`derivePhaseFromStep` 17-entry hardcoded lookup table): UNCHANGED. Story 3.1 does NOT alter the phase derivation.
- **Story 2.6 dev-004** (lock-contention test skips when `mock.module` poisons the registry): RESPECTED. Story 3.1's new tests use the SAME workaround (feature-check `typeof handle.release === "function"` and skip cleanly) when the lock-contention test case (Task 11.9) runs under a `mock.module` precedent that poisons the global registry. Carry-over to Story 6.x for `mock.restore()` cleanup.
- **Story 2.4 + Story 2.6 AR22 PARTIAL** (`Add` / `Pass` / `Configure` `hintOverride` verbs slip through registry CI gate): EXTENDED by Story 3.1's new `Pass` verbs in `parseVerifyAndAdvanceArgs` (Task 5.5). Carry-over to Story 6.x for verb ratification or registry CI gate extension.
- **Story 2.8 dev-001** (smoke asserts on `## State delta` heading instead of story-spec's `## State Before` / `## State After`): RESPECTED. Story 3.1 does NOT alter the transcript markdown heading; the new `lastAttempted` + `lastFailureReason` deltas flow through the existing `## State delta` section.
- **Story 2.8 dev-002** (cold-start state.yaml UX friction): UNCHANGED by Story 3.1. The new tests inject a seed state.yaml (per Story 2.8's precedent at `run.test.ts:52-64`).

### Forward Dependencies

- **Story 3.2 (`--resume` flag)**: PRIMARY CONSUMER. Reads `state.lastAttempted` to construct the resume-context dispatch-spec; reads `state.lastFailureReason.hint` to surface in the resume prompt. Story 3.1 ships the WRITE-side; Story 3.2 ships the READ-side.
- **Story 3.6 (`--explain` reasoning trace)**: SECONDARY CONSUMER. The reasoning trace includes "last attempted: <step> at <attemptedAt>; last failure: <code> — <message>" when `state.lastAttempted` and `state.lastFailureReason` are present.
- **Story 3.7 (`--list` candidate next-steps)**: SECONDARY CONSUMER. The candidate list may surface "RESUMABLE: <step>" for the candidate matching `state.lastAttempted.step`.
- **Story 3.8 (`--diff-state` and `--export-state`)**: PRIMARY CONSUMER. The `--export-state` JSON includes `lastAttempted` and `lastFailureReason` per architecture line 850 ("contains `currentPhase`, `activeEpic`, `lastSuccessfulStep`, `lastAttempted`, `lastFailureReason`, ..."). The `--diff-state` may surface a divergence-warning when `recomputed.lastSuccessfulStep` advances past `cached.lastAttempted` (indicating the cached attempt was actually completed externally).
- **Stories 4.x (loop runner)**: CONSUMER. The loop runner's `--resume` hint at exit-time references `state.lastFailureReason.hint`. The loop's state-on-halt write is the SAME canonical Story 3.1 path (the loop-runner's halt branches all flow through `verify-and-advance.ts`'s catch block per architecture line 1672).
- **Stories 5.1-5.4 (failure-UX modes)**: PRIMARY CONSUMER. The four modes (retry / skip / route-to-fixer / escalate) all branch on `state.lastFailureReason.code`:
  - `retry`: re-invoke `runVerifyAndAdvance` with the same dispatch-spec (Story 5.1).
  - `skip`: mark the step as skipped + advance to the next (Story 5.2).
  - `route-to-fixer`: dispatch `agents/bmad-step-fixer.md` with the failure context (Story 5.3).
  - `escalate`: halt + surface the failure to the user (Story 5.4 — already the default Story 3.1 v0.1 behavior).
- **Story 6.5 (per-step verifier override)**: INDEPENDENT. Story 6.5's verifier-config override does NOT alter Story 3.1's state-write semantics; it changes the verifier-result shape.
- **Story 6.x architecture-doc patch**: A future architecture-doc patch may align prose at lines 1212-1217 / 1373-1374 / 1393 / 1478 with the shipped `src/runs/` directory (Story 2.5 dev-001). Story 3.1 does NOT introduce new architecture-doc divergences.

### Previous Story Intelligence

This story builds on:

- **Story 1.5 (Schemas + Migrations Skeleton)** — declared `lastAttempted` + `lastFailureReason` on `StateV1Schema` as optional + nullable. Story 3.1 EXTRACTS the inline declarations into named schemas (additive refactoring; wire-compatible).
- **Story 1.6 (State Subsystem — `loadState` / `saveState` / `recomputeState`)** — established the lock-held write contract via `saveState(state, lockHandle, opts?)`. Story 3.1's halt-path save uses the EXISTING `handle` from `acquire()`.
- **Story 2.2 (Dispatch Spec Generator)** — established `BuildDispatchSpecResult` shape. Story 3.1 may extend the shape to expose `epic` + `story` (Task 8.2).
- **Story 2.4 (`run.ts` lock-free runner)** — established the AR9 emit pattern. Story 3.1 EXTENDS the `dispatch` variant with optional `lastAttempted`.
- **Story 2.5 (`src/runs/` transcript writers)** — established the transcript serialization. Story 3.1's new fields flow through unchanged.
- **Story 2.6 (`verify-and-advance.ts` with state-hash check)** — established the lock-acquiring runner pattern. Story 3.1 EXTENDS the success-path mutation at line 530 + INSERTS a halt-path state-save call in the catch block at lines 545-571.
- **Story 2.7 (`commands/bmad-next.md` Layer 1 orchestrator)** — established the Bash → AR9 → Task → Bash → summary chain. Story 3.1 EXTENDS the second Bash invocation with `--last-attempted-json '<payload>'`.
- **Story 2.8 (smoke + NFR-S2 integration test)** — established `src/integration/` as the canonical directory for cross-tier integration tests. Story 3.1 ADDS `src/integration/halt-records-state.test.ts` joining Story 2.8's `no-write-outside-scope.test.ts`.

Story 3.1 does NOT consume from:
- Stories 1.7-1.13 (CLI parser, snapshot detection, BMAD detection, DAG seed, persona resolution, doctor command, quick-start docs) — these are independent prerequisites for `run.ts` + `verify-and-advance.ts` but their public APIs are not touched by Story 3.1.
- Story 2.1 (Verifier Configuration & Registry) — `runVerifier` is invoked by Story 2.6's existing call site; Story 3.1 does NOT alter the verifier surface.
- Story 2.3 (`bmad-step-runner.md` Layer 3 sub-agent) — the sub-agent prompt is unchanged.

## Dev Agent Record

### Context Reference

- `_bmad-output/implementation-artifacts/3-1-record-last-attempted-last-failure-reason-on-halt.md` (this file)
- `src/schemas/state.ts` (extracted LastAttemptedSchema + LastFailureReasonSchema)
- `src/schemas/dispatch-protocol.ts` (extended dispatch variant with optional lastAttempted)
- `src/commands/next/args.ts` (extended parseVerifyAndAdvanceArgs with --last-attempted-json)
- `src/commands/next/run.ts` (extended AR9 emit with lastAttempted payload)
- `src/commands/next/verify-and-advance.ts` (added halt-path saveState + clear lastFailureReason on success)

### Agent Model Used

Opus 4.7 (1M context) — bmad-dev-story sub-agent for Story 3.1

### Debug Log References

None — implementation completed without debug log entries beyond standard test runner output.

### Completion Notes List

- Story 3.1 implementation completed end-to-end per the run.yaml `declaredMutationScope.allowedPaths`.
- **Errors registry stays at 16 codes** (no new error class introduced).
- **Two-layer boundary preserved**: `run.ts` is lock-FREE — emits AR9 with optional `lastAttempted` field via `emitDispatchAction`; `verify-and-advance.ts` is lock-HELD — writes `state.lastAttempted` + `state.lastFailureReason` under the existing `acquire() → ... → release()` envelope.
- **Best-effort halt-path save**: the new save call is wrapped in an inner try/catch with `log.warn(...)` per the architecture's NFR-R1 carry-over discipline; the original `StepperError` is never masked.
- **Graceful degradation**: `--last-attempted-json` flag is OPTIONAL — when absent, `state.lastAttempted` is set to `null` on halt (older bmad-next.md bodies still work).
- **dev-001**: One existing Story 2.6 happy-path test (`AC-3 + AC-5 state-hash mismatch (TOCTOU)`) asserted `state.yaml NOT modified` on halt. Story 3.1 changes this contract — halt now writes state. The test was updated to assert structural fields instead of mtime equality. This is an EXPECTED test-surface ratification per Story 3.1's AC line 731.
- **dev-002**: The integration test at `src/integration/halt-records-state.test.ts` uses **subprocess spawn** (Bun.spawn) for each halt-code injection because `mock.module` persists globally for the test runner process per Story 2.6 dev-004 (`mock.restore()` does NOT undo module mocks). Spawning a fresh Bun process per halt-code test isolates the verifier-mock from sibling test files (`verify-and-advance.test.ts`'s happy-path tests). v0.1 carry-over to Story 6.x for native `mock.restore()` support.
- **dev-003**: Two `failureReason?.hint as string` type assertions added in `verify-and-advance.test.ts` and `halt-records-state.test.ts` to satisfy strict TS `toBe(string)` overload — the Zod-validated `hint` field is non-optional in the schema, but the optional-chained access produces `string | undefined`. Acceptable widening; the actual runtime values are always strings (verified by `expect(typeof ...).toBe("string")` immediately above).

### Test Counts (final)

- Pre-Story 3.1 baseline: **526 pass / 0 fail / 1881 expects / 47 files**.
- Post-Story 3.1: **563 pass / 0 fail / 2064 expects / 48 files**.
- Delta: **+37 pass / +183 expects / +1 file** (estimate per spec was +30-35; actual landed at +37).
- Per-file additions:
  - `src/schemas/state.test.ts`: +7 tests (LastAttempted/LastFailureReason extraction + StateV1Schema wire-compat).
  - `src/schemas/dispatch-protocol.test.ts`: +4 tests (dispatch variant lastAttempted optional + round-trip).
  - `src/commands/next/args.test.ts`: +5 tests (--last-attempted-json happy + missing + invalid JSON + schema mismatch + optional).
  - `src/commands/next/run.test.ts`: +6 tests (AR9 dispatch lastAttempted shape + nowIso injection + epic+story carry + dry-run/halt exclusion + schema round-trip).
  - `src/commands/next/verify-and-advance.test.ts`: +8 tests (Story 3.1 halt-path matrix: VERIFIER_FAILURE / TOCTOU / no-flag / success-clears / lock-contention-skip / corrupt-state-skip / hint cross-validation / re-load).
  - `src/integration/halt-records-state.test.ts`: NEW file with +7 tests (5-code halt matrix per epic AC line 736 + 2 cross-cutting invariants).

### File List

#### Modified Files

- `src/schemas/state.ts` — added `LastAttemptedSchema`, `LastFailureReasonSchema`, `LastAttempted`, `LastFailureReason` named exports; `StateV1Schema` now references them via `.nullable().optional()` (wire-compatible).
- `src/schemas/dispatch-protocol.ts` — added optional `lastAttempted: LastAttemptedSchema.optional()` to the `dispatch` variant of `DispatchActionV1Schema`.
- `src/commands/next/args.ts` — extended `VerifyAndAdvanceArgsSchema` + `parseVerifyAndAdvanceArgs` with the optional `--last-attempted-json '<JSON>'` flag handler.
- `src/commands/next/run.ts` — extended the AR9 dispatch emit at lines 760-770 with the populated `lastAttempted` payload (no lock acquired).
- `src/commands/next/verify-and-advance.ts` — extended success-path mutation with `lastFailureReason: null`; inserted halt-path state-save call inside the `StepperError` catch branch (best-effort with inner try/catch).
- `commands/bmad-next.md` — extended Step 5 documentation to forward `--last-attempted-json '<payload>'`; extended dispatch variant schema description.
- `src/schemas/state.test.ts` — added 7 tests covering the named extraction.
- `src/schemas/dispatch-protocol.test.ts` — added 4 tests covering the dispatch variant extension.
- `src/commands/next/args.test.ts` — added 5 tests covering the new flag.
- `src/commands/next/run.test.ts` — added 6 tests covering the AR9 emit extension.
- `src/commands/next/verify-and-advance.test.ts` — added 8 tests covering the halt-path matrix; updated the existing TOCTOU test's mtime assertion to a structural assertion (Story 3.1 changes the halt contract).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — flipped `3-1-record-last-attempted-last-failure-reason-on-halt: ready-for-dev → review`.

#### New Files

- `src/integration/halt-records-state.test.ts` — Story 3.1's canonical integration test (subprocess-spawn isolation per dev-002).

## Senior Developer Review (AI)

**Reviewer:** Opus 4.7 (1M context) — bmad-code-review sub-agent
**Date:** 2026-04-30
**Run:** `.bmad-stepper/runs/2026-05-01T095600Z-bmad-next` (loop iteration 24 of `2026-05-01T053000Z-bmad-loop`)

### Verdict: **APPROVE-WITH-FOLLOWUP** → flip `review` → `done`

Story 3.1 (FIRST Epic 3 story) lands the canonical `state.lastAttempted` write-on-dispatch + `state.lastFailureReason` write-on-halt mutations cleanly. Implementation is faithful to the architecture's lock-free / lock-held boundary discipline (AR8); the V1-extend strategy avoids a schema bump per the pre-existing Story 1.5 declaration; and the integration test surface delivers the full 5-code AC line 736 matrix via subprocess-spawn isolation.

### Findings counts
- **Blocking:** 0
- **High:** 0
- **Medium:** 0
- **Low / Info:** 3 (all already documented as Story 3.1 deviations or carry-overs to Story 6.x)

### Verdicts per Acceptance Criterion + Architectural Requirement

| Item | Verdict | Evidence |
|------|---------|----------|
| **AC-1** (state.lastAttempted + state.lastFailureReason on halt) | PASS | `verify-and-advance.ts:577-597` — under held lock, builds `stateOnHalt` with `args.lastAttempted ?? null` and `lastFailureReason: { code, message, hint, runId }`; `args.ts:491-536` parses `--last-attempted-json` via `LastAttemptedSchema.safeParse`; `bmad-next.md:154-170` Step 5 forwards the captured payload. |
| **AC-2** (lastSuccessfulStep unchanged on halt) | PASS | `verify-and-advance.ts:579-588` — `stateOnHalt = { ...stateBefore, lastAttempted, lastFailureReason }` preserves `stateBefore.lastSuccessfulStep` verbatim. Asserted in `verify-and-advance.test.ts:1097-1103` and `halt-records-state.test.ts:278-283`. |
| **AC-3** (success clears all three fields) | PASS | `verify-and-advance.ts:522-537` — `stateAfter` advances `lastSuccessfulStep`, sets `lastAttempted: null`, sets `lastFailureReason: null` (Story 3.1 closes the gap Story 2.6 left at line 530). Asserted in `verify-and-advance.test.ts:1226-1291`. |
| **AC-4** (5-code integration test) | PASS | `src/integration/halt-records-state.test.ts:301-401` — covers VERIFIER_FAILURE, BRANCH_SWITCH, BMAD_INCOMPATIBLE, TIMEOUT, BUDGET_EXCEEDED via subprocess-spawn driver mocking `runVerifier` to throw the named StepperError. Cross-cutting invariants (byte-stable read; schema re-load) at lines 405-436. |
| **AR8** (lock-free / lock-held boundary preserved) | PASS | `run.ts` imports never touch `../../lock/` (verified — only `loadStateUnlocked`, no `acquire/saveState`). The new `lastAttempted` payload is computed in memory and emitted on the AR9 line. `verify-and-advance.ts:577-591` uses the EXISTING `handle` from line 459's `acquire()` — no second lock acquisition. Boundary is the process boundary between the two `bun run` invocations. |
| **AR9** (DispatchActionV1Schema additive extension) | PASS | `dispatch-protocol.ts:46-70` — `dispatch` variant now carries `lastAttempted: LastAttemptedSchema.optional()`. Existing 4-field shape `{ action, runId, agent, exitCode }` continues to validate. Defence-in-depth `emitDispatchAction` parse unchanged. |
| **AR21 / AR22** (errors carry code + AR22 actionable hint) | PASS | `lastFailureReason.hint` reuses `err.actionableHint` (canonical source-of-truth shared with the AR9 halt action's `message`). Cross-validated in `halt-records-state.test.ts:273-275` (`expect(haltMessage).toBe(failureReason?.hint as string)`). New parse-error hints in `args.ts:413-528` use `Pass` verb — carry-over to Story 6.x AR22 verb ratification. |
| **AR41** (no new forbidden imports) | PASS | `dispatch-protocol.ts:44` introduces a foundational-tier sibling import (`./state.ts`) — explicitly allowed per architecture lines 1287-1289. No new upward / sibling-higher imports in `run.ts`, `verify-and-advance.ts`, or `args.ts`. Run.ts boundary clean: `acquire(`, `loadState(`, `saveState(` appear only in JSDoc comments (lines 21, 551). |
| **FR1 / FR5 / FR27 / FR32 / FR33 / FR43 / FR44 / FR53 / FR54** | PASS | FR5 + FR33 directly delivered. FR27 (`--resume` consumer) ready to read the persisted fields. FR32 actionable hint preserved. FR43/44 transcript/run-log unchanged (state delta now includes the new fields). FR53/54 exit-code + stdout discipline unchanged. |
| **NFR-R1 / R4 / S2 / S5 / M3** | PASS | NFR-R1 (zero data loss on halt): halt-path save persists context atomically. NFR-S5: write goes through existing `saveState → atomicWrite` envelope (tmp+rename+.bak). Best-effort inner try/catch (lines 592-596) preserves NFR-R1 even when save itself fails. NFR-M3: every payload Zod-validated at parse + write. NFR-S2/R4: scope unchanged. |

### Deviation adjudication (3 deviations, 0 new)

- **dev-001 (TOCTOU mtime → structural assertion):** **ACCEPT.** Story 3.1 changes the halt contract (state.yaml IS now modified on halt per AC line 731). The Story 2.6 test at `verify-and-advance.test.ts:361-382` was correctly ratified to assert `lastFailureReason.code === "STATE_CHANGED_DURING_DISPATCH"` and `lastSuccessfulStep` unchanged, instead of mtime equality. The replacement assertion is more semantically meaningful than the prior mtime check. No regression risk.
- **dev-002 (subprocess spawn instead of mock.module):** **ACCEPT WITH FOLLOWUP.** Driven by Story 2.6 dev-004 (Bun's `mock.module` lacks `mock.restore()` and persists across files). Subprocess isolation in `halt-records-state.test.ts:163-242` is the correct workaround — sibling test files retain clean module registry. Performance cost (5 spawns) is acceptable for integration tier. **Carry-over to Story 6.x** for native `mock.restore()` once Bun ships it (already tracked).
- **dev-003 (2x `as string` TS assertions):** **ACCEPT (cosmetic).** Locations: `verify-and-advance.test.ts:1108`, `:1452`, and `halt-records-state.test.ts:275`. The optional-chained `failureReason?.hint` produces `string | undefined` for the strict `toBe(string)` overload, but every assertion is preceded by `expect(typeof failureReason?.hint).toBe("string")` (line 272 in halt-records-state). Type-safe at runtime; widening is an acceptable test-code expedient. Note: I count **3** `as string` assertions on `failureReason?.hint` (the dev-notes say "two" — minor count discrepancy, no impact on verdict).

### Quality gate reproduction

| Gate | Expected | Observed | Status |
|------|----------|----------|--------|
| `bun run check` | 563 pass / 0 fail / 2064 expects / 48 files | **563 / 0 / 2064 / 48 (1.97s)** | PASS |
| `bunx tsc --noEmit` | exit 0 | exit 0 (no output) | PASS |
| AR41 boundary | no new sibling-higher imports in `run.ts` / `verify-and-advance.ts` / `args.ts` | No `acquire/loadState/saveState` calls in `run.ts` (only JSDoc mentions); `dispatch-protocol.ts → state.ts` is sibling-foundational (allowed per architecture lines 1287-1289) | PASS |
| Lock-free / lock-held boundary | `run.ts` lock-free; `verify-and-advance.ts` single `acquire()` | `run.ts` imports clean; `verify-and-advance.ts:459` single acquire; `:577-591` halt-path save uses existing handle; `:678` releaseLockBestEffort in finally | PASS |

### Carry-overs

**For Stories 3.2-3.10 (Epic 3 consumers of Story 3.1's writes):**
- Story 3.2 (`--resume`) is unblocked; reads `state.lastAttempted` + `state.lastFailureReason.hint` to construct the resume-context dispatch-spec. Recoverable codes per architecture (excludes `BMAD_INCOMPATIBLE`, `BMAD_NOT_INSTALLED`).
- Stories 3.6/3.7 (`--explain` / `--list`): SECONDARY consumers — surface "RESUMABLE: <step>" using `lastAttempted.step`.
- Story 3.8 (`--diff-state` / `--export-state`): includes the new fields in the JSON export per architecture line 850.
- Stories 4.x (loop runner) + 5.1-5.4 (failure-UX modes): branch on `state.lastFailureReason.code`.

**For Story 6.x (carry-overs):**
- **AR22 verb ratification** — `args.ts:413-528` introduces 6 new `Pass` verbs (also ratified in Story 2.4/2.6 PARTIAL). Either extend the registry CI gate or add `Pass` to the canonical Run/See/Try/Check verb set.
- **Bun native `mock.restore()`** — would let `halt-records-state.test.ts` use in-process mocking instead of subprocess spawn, removing dev-002 entirely.
- **Architecture-doc patch** — `commands/bmad-next.md` Step 5 now passes `--last-attempted-json '<payload>'`; the architecture's Layer 1 sequence diagram (lines 1443-1485) does not yet mention this flag. Minor doc-prose update.
- **DispatchSpecV2 with `phase` field** — would replace the conservative `derivePhaseFromStep` 17-entry lookup table in `verify-and-advance.ts:128-146` (also Story 2.6 dev-003 carry-over).
- **State schema `code` field tightening** — currently `z.string()` per Story 1.5 to allow new error codes without bump; could become an enum once the 16-code registry is frozen.

### Sprint-status flip + task record path

- Story status: `review` → `done`
- Sprint-status `3-1-record-last-attempted-last-failure-reason-on-halt`: `review` → `done`
- Task record: `.bmad-stepper/runs/2026-05-01T095600Z-bmad-next/tasks/t1-code-review.yaml` (within declaredMutationScope)

## Change Log

| Date       | Author                | Change                                       |
| ---------- | --------------------- | -------------------------------------------- |
| 2026-04-30 | bmad-create-story | Initial story file created from epics.md §3.1 |
| 2026-04-30 | bmad-dev-story    | Implementation completed; status → review     |
