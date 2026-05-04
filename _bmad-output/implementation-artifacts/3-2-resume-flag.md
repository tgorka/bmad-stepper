---
status: done
story_id: '3.2'
story_key: 3-2-resume-flag
epic: '3'
title: '`--resume` Flag'
created: '2026-04-30'
last_updated: '2026-04-30'
review_ready: true
priority: M
estimated_effort: M
fr_coverage:
  - FR1
  - FR5
  - FR16
  - FR18
  - FR27
  - FR32
  - FR33
  - FR53
  - FR54
nfr_coverage:
  - NFR-R1
  - NFR-R2
  - NFR-S2
  - NFR-S5
  - NFR-M3
ar_coverage:
  - AR8
  - AR9
  - AR11
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
  - _bmad-output/implementation-artifacts/2-2-dispatch-spec-generator.md
  - _bmad-output/implementation-artifacts/2-4-lock-free-run-ts-for-bmad-next.md
  - _bmad-output/implementation-artifacts/2-6-verify-and-advance-ts-with-state-hash-check.md
  - _bmad-output/implementation-artifacts/2-7-slash-command-for-bmad-next-layer-1-markdown.md
  - _bmad-output/implementation-artifacts/1-7-cli-argument-parser.md
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
  - src/commands/next/args.ts
  - src/commands/next/verify-and-advance.ts
  - src/commands/next/index.ts
---

# Story 3.2: `--resume` Flag

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper user (Halt Recovery journey),
I want `/bmad-next --resume` to re-attempt the last attempted step with cached failure context surfaced to the sub-agent,
So that I lose under 5 minutes from any halt.

## Context Summary

This is the **second story of Epic 3** and the **PRIMARY CONSUMER** of Story 3.1's `state.lastAttempted` + `state.lastFailureReason` writes. Per epic-2-retrospective forward action item §line 191 and the just-completed Story 3.1's Senior Developer Review §line 744 carry-over (`Story 3.2 (--resume) is unblocked; reads state.lastAttempted + state.lastFailureReason.hint to construct the resume-context dispatch-spec`), Story 3.2 lands the **READ-side** of the resume contract whose WRITE-side Story 3.1 already delivered.

**The CLI flag ALREADY EXISTS** on `NextArgsSchema` (`src/commands/next/args.ts:155` — `resume: z.boolean().default(false)` per Story 1.7's 18-flag inventory). Story 1.7 reserved the flag for Epic 3 consumption; Story 3.2 wires the runtime branch in `src/commands/next/run.ts`. **No new CLI flag schema work is required.** The `BuildDispatchSpecInput` already exposes `epic` + `story` overrides per Story 2.2 dev-001 deviation (`src/dispatch/generate-spec.ts:90-91`); the `state.lastAttempted` literal carries the **canonical resume tuple** `(step, epic, story, attemptedAt)` per architecture §P3 lines 759-763. **No new dispatch-spec schema work is required.**

The resume contract is structurally simple: when `args.resume === true`, **bypass the standard `pickNextStep(state, dag, args)` call** and **substitute `state.lastAttempted.step`** as the resolved next step. The dispatch-spec construction (persona resolution, model selection, budget defaults, staging-dir creation, AR9 line emission) is **identical** to the standard happy path — Story 3.2 only changes WHICH step name is selected. The downstream pipeline (Layer 1 forwarding to `verify-and-advance.ts`; verifier execution; halt-or-promote branching) is unchanged. Per the epic AC line 748, the **failure context is surfaced via the dispatch-spec's CONTEXT section** (the `taskSpec.context[]` array Story 2.4 populates from prerequisite artifact paths) — Story 3.2 extends this populator to inject TWO additional context entries on resume:

1. **Failure reason summary** — a synthetic `{ path, label }` entry pointing at the most recent run-log JSON / transcript markdown under `_bmad-output/.stepper/runs/<state.lastFailureReason.runId>/`, labelled "Previous failure: <code> — <message>".
2. **Last-attempt artifact excerpt** — the canonical artifact path the sub-agent was supposed to produce (e.g., `_bmad-output/implementation-artifacts/<step>-*.md` per Story 2.4's `artifactPathForStep` helper). On the typical resume scenario this file may not exist (the previous attempt halted before the verifier passed); the sub-agent reads-or-creates it. The label is "Last attempted artifact (may be missing or incomplete)".

Per the epic AC line 751, **when `state.lastAttempted` is null** (no halt to resume from), Stepper exits with `CONFIG_ERROR` (exitCode 2) and the verbatim hint `No prior halt to resume from. Run /bmad-next to advance to the next step.`. The error class is the existing `ConfigError` with a `hintOverride` (Story 1.11 AC-2 precedent at `src/errors.ts:206-239`). **Registry stays at 16 codes** — no new error class.

Per the epic AC line 754, **the `--resume + --skip` combination is rejected** as unimplemented in v0.1 (Story 5.2 owns `--skip`). This is enforced via the existing `enforceMutuallyExclusiveFlags` helper pattern in `run.ts:252-263` — extended with a new check that throws `ConfigError` with the verbatim hint `--skip is implemented in Story 5.2 (Epic 5); --resume is available now without --skip.`. The CLI parser doesn't yet declare `--skip` (Story 1.7's 18-flag inventory does NOT include `--skip` — confirmed by reading `args.ts:148-167`). **Story 3.2 adds NEITHER the `--skip` flag NOR the cross-validation (the flag doesn't exist to combine with).** The AC line 754 enforcement is **deferred to Story 5.2** (the same story that adds `--skip`); Story 3.2 documents this deferral in the JSDoc but ships no enforcement code (the flag isn't there to enforce against).

**Recoverability gating** (per epic AC line 746): the AC explicitly states resume is permitted "when `lastFailureReason.code` is recoverable (not `BMAD_INCOMPATIBLE` or `BMAD_NOT_INSTALLED`)". Story 3.2 enforces this via a `RECOVERABLE_FAILURE_CODES` allow-list in `run.ts`. The two **non-recoverable** codes are `BMAD_INCOMPATIBLE` and `BMAD_NOT_INSTALLED` — both `exitCode: 3` (BMAD compatibility errors) per `src/errors.ts:92-104`. Resume on either non-recoverable code throws `ConfigError` with the verbatim hint `Last failure was <code> which is not resumable. Run /bmad-next --doctor to inspect the BMAD installation, then re-run /bmad-next.`. The 14 OTHER codes (`LOCK_CONTENTION`, `BRANCH_SWITCH`, `UNKNOWN_BMAD_SKILL`, `DAG_CYCLE`, `CORRUPT_STATE`, `STATE_TOO_NEW`, `STATE_CHANGED_DURING_DISPATCH`, `VERIFIER_FAILURE`, `PATHOLOGICAL_INPUT`, `SCOPE_VIOLATION`, `BUDGET_EXCEEDED`, `TIMEOUT`, `CONFIG_ERROR`, `MIGRATION_FAILURE`) are recoverable.

**Edge case — `state.lastAttempted` set but `state.lastFailureReason` null**: this is theoretically possible if the dispatch was interrupted BEFORE `verify-and-advance.ts` ran (e.g., user killed the process between `run.ts` exit and `verify-and-advance.ts` start). Per Story 3.1's design, `lastAttempted` is written by `run.ts`'s emit (forwarded via Layer 1) and `lastFailureReason` is written by `verify-and-advance.ts`'s catch block. If `lastFailureReason` is null but `lastAttempted` is set, the resume is permitted — the failure-reason context block in the dispatch-spec is simply omitted (the sub-agent gets the resume target without prior-failure forensics).

**Edge case — `state.lastAttempted.step` no longer in DAG**: if the BMAD installation changed since the halt (e.g., the user upgraded BMAD and the step was renamed), resume throws `ConfigError` with the verbatim hint `Step <step> from lastAttempted is no longer in the DAG. Run /bmad-next --recompute-state and re-run /bmad-next.`. This validation runs after DAG construction.

**Edge case — `state.lastAttempted.epic / .story` mismatch with current DAG/state**: tolerated. The resume contract is "attempt the same STEP NAME"; the epic+story metadata is informational. The dispatch-spec's `epic+story` fields are populated from `state.lastAttempted.epic` + `state.lastAttempted.story` (NOT recomputed from the current state's `lastSuccessfulStep`) so the resume targets the same work item the previous attempt targeted.

Concretely, this story produces:

1. **`src/commands/next/run.ts`** (MODIFIED) — adds an early branch on `args.resume === true` that:
   - Reads `state.lastAttempted` via the existing `loadStateUnlocked` call.
   - Throws `ConfigError` with the verbatim AC-line-751 hint when `state.lastAttempted === null`.
   - Throws `ConfigError` with the verbatim non-recoverable hint when `state.lastFailureReason.code` is in the `NON_RECOVERABLE_FAILURE_CODES` set (`BMAD_INCOMPATIBLE`, `BMAD_NOT_INSTALLED`).
   - Throws `ConfigError` with the verbatim missing-step hint when `state.lastAttempted.step` is not in the resolved DAG.
   - Substitutes `state.lastAttempted.step` for the standard `pickNextStep(state, dag, args)` result.
   - Extends `buildContextRefs(...)` with two synthetic resume-context entries (failure-reason summary + last-attempt artifact path) when `args.resume === true` and `state.lastFailureReason !== null`.
   - Passes `state.lastAttempted.epic` + `state.lastAttempted.story` to `buildDispatchSpec(...)` as explicit overrides (the canonical resume tuple — NOT recomputed from current `lastSuccessfulStep`).
   - Continues through the standard dispatch path: `resolvePersona → buildDispatchSpec → emitDispatchAction` with the AR9 `lastAttempted` payload populated from `state.lastAttempted` (NOT a fresh attempt — the `attemptedAt` timestamp re-uses `opts?.nowIso ?? new Date().toISOString()` for the new attempt; the `step + epic + story` carry verbatim from `state.lastAttempted`).

2. **`src/commands/next/run.test.ts`** (MODIFIED) — appends ~10-12 NEW test cases covering AC-1 through AC-3:
   - **AC-1 happy path**: seed state with `lastAttempted: { step, epic, story, attemptedAt }` + `lastFailureReason: { code: "VERIFIER_FAILURE", ... }`; invoke with `argv: ["--resume"]`; assert (a) result.exitCode === 0, (b) result.action.action === "dispatch", (c) result.action.lastAttempted.step === seed.lastAttempted.step, (d) the AR9 line's `lastAttempted.epic + .story` carry from seed (not from `lastSuccessfulStep`).
   - **AC-1 context-surfacing**: read the staged dispatch-spec.json from disk; assert `dispatchSpec.taskSpec.context` includes 2 NEW entries pointing at the failure-reason transcript path + the last-attempt artifact path. The labels are deterministic (`Previous failure: <code> — <message>`; `Last attempted artifact (may be missing or incomplete)`).
   - **AC-2 missing lastAttempted**: seed state with `lastAttempted: null`; invoke with `--resume`; assert (a) result.exitCode === 2, (b) result.action.action === "halt", (c) result.action.message verbatim equals `No prior halt to resume from. Run /bmad-next to advance to the next step.`.
   - **AC-3 + cross-cutting non-recoverable**: seed state with `lastAttempted: {...}` and `lastFailureReason: { code: "BMAD_INCOMPATIBLE", ... }`; invoke with `--resume`; assert (a) result.exitCode === 2, (b) result.action.message contains "is not resumable" and references "BMAD_INCOMPATIBLE".
   - **Edge: lastAttempted set but lastFailureReason null** (process killed between layers): seed `lastAttempted: {...}` + `lastFailureReason: null`; assert resume succeeds with NO failure-reason context entry (only the artifact-path entry is added, as a defensive single-entry context block).
   - **Edge: lastAttempted.step no longer in DAG**: seed `lastAttempted: { step: "deleted-step", ... }`; assert ConfigError hint matches `Step deleted-step from lastAttempted is no longer in the DAG.`.
   - **--resume bypasses standard pickNextStep**: when current state has `lastSuccessfulStep` advanced past `lastAttempted` (theoretically impossible but defensive), assert resume STILL targets `lastAttempted.step` (NOT the next-after-`lastSuccessfulStep` step).
   - **--resume + --dry-run combo**: seed valid lastAttempted; invoke with `--resume --dry-run`; assert (a) result.exitCode === 0, (b) result.action.action === "report", (c) result.action.message includes "would dispatch step <lastAttempted.step>" (the dry-run report fully short-circuits the AR9 dispatch line — same precedent as Story 2.4's existing dry-run path at `run.ts:752-758`).
   - **--resume + --explain combo**: seed valid lastAttempted; invoke with `--resume --explain`; assert the explain report includes "RESUMABLE: <lastAttempted.step>" or equivalent text. (Story 3.6 owns the full --explain trace; Story 3.2 just verifies the resume target surfaces in the v0.1 stub.)
   - **--resume nowIso injection honored**: assert the AR9 line's `lastAttempted.attemptedAt` matches `opts.nowIso` (the resume registers a NEW attempt with a fresh timestamp).
   - **--resume preserves lastFailureReason for context but does NOT clear state**: assert that AFTER `runNext` returns successfully (BEFORE `verify-and-advance.ts` runs), `state.yaml` is byte-identical to the seed (run.ts is lock-free; the next state mutation happens in verify-and-advance.ts).
   - **Defence-in-depth: resume validates lastAttempted shape via Zod**: corrupt state.yaml's lastAttempted to a malformed shape (e.g., missing `step` field); assert that loadStateUnlocked → `loadAndMigrate` rejects with `CorruptStateError` (verifies the existing schema validation catches the corruption — Story 3.2 doesn't need its own validation).

3. **`commands/bmad-next.md`** (Story 2.7 — UNCHANGED). The Layer 1 markdown body already forwards `--last-attempted-json '<payload>'` to `verify-and-advance.ts` per Story 3.1 Task 12. The resume flow uses the SAME forwarding path — `run.ts` emits an AR9 dispatch with `lastAttempted` populated from `state.lastAttempted`; Layer 1 captures it; `verify-and-advance.ts` writes it to `state.yaml` per Story 3.1's halt-path save semantics. **No markdown change needed for Story 3.2.**

4. **`src/commands/next/args.ts`** (UNCHANGED — `--resume` already in `NextArgsSchema` per Story 1.7). Verified via Grep: `args.ts:155` declares `resume: z.boolean().default(false)`; `args.ts:212` includes it in the `booleanKeys` set. Story 1.7's tests (`args.test.ts:43, 76, 141, 306, 321`) already cover the parse-side of `--resume`. **No args change needed for Story 3.2.**

This story exercises:
- **AR8** (lock-free `run.ts` / lock-held `verify-and-advance.ts`): UNCHANGED. Story 3.2's resume branch reads state via `loadStateUnlocked` (same as the standard happy path); no lock acquired in `run.ts`. The downstream `verify-and-advance.ts` invocation by Layer 1 acquires the lock as usual.
- **AR9** (single discriminated-union JSON line on stdout): UNCHANGED. The dispatch line shape is identical to the standard path; only the `lastAttempted` payload's source-of-truth changes (from "fresh `nextStep.name`" to "`state.lastAttempted.step` carried verbatim").
- **AR21 + AR22** (errors carry code + actionable hint): EXTENDED. Story 3.2 introduces 3 NEW `ConfigError` `hintOverride` strings (no-resume-target; non-recoverable code; missing-step). All 3 hints follow the AR22 verb discipline (`Run` / `See` — both established AR22 verbs).
- **AR41** (boundary graph; no upward / sibling-higher imports): UNCHANGED. Story 3.2 modifies `run.ts` (top-tier composer) only; no new module created; no new imports added (the existing `loadStateUnlocked`, `ConfigError`, `buildDispatchSpec`, `resolvePersona`, `build` calls are all already present in `run.ts:93-110`).
- **FR27** (`--resume` flag): PRIMARY DELIVERABLE. Architecture §line 1357 declares `FR27 → src/commands/next/args.ts, src/state/load.ts` — both are touched (args.ts already declares; load.ts already provides `loadStateUnlocked`). Story 3.2 wires the runtime branch in `run.ts`.
- **NFR-R2** (100% recovery via `--resume`): PRIMARY DELIVERABLE. The integration test in Task 11 verifies all 14 recoverable codes flow cleanly through resume.

Estimated effort: **M** (medium — modifies 1 existing file substantially (`run.ts`), extends 1 existing test file (`run.test.ts`). NO new modules. NO new schema work. NO new error classes. NO Layer 1 markdown change. The integration test is OPTIONAL — Story 3.1 already established the canonical 5-code halt-state-record matrix; Story 3.2's tests can use the SAME tmpdir-per-test fixtures).

It does **NOT**:

- **Implement `--skip`** (Story 5.2). The CLI parser does NOT yet declare `--skip` (verified via `args.ts:146-169` Grep). Story 3.2 documents the AC-line-754 deferral in JSDoc but ships no enforcement code. When Story 5.2 adds `--skip` to the schema, Story 5.2 will simultaneously add the cross-validation rejecting `--resume + --skip` per the AC line 754 wording.
- **Modify `state.yaml` from `run.ts`.** The lock-free contract per architecture §line 1672 is preserved. Resume reads `state.lastAttempted`; the next state mutation happens in `verify-and-advance.ts`'s halt-path save (Story 3.1) or success-path advance (Story 2.6).
- **Add a new `resume: true` field to the dispatch-spec.** The dispatch-spec contract per Story 2.2 + Story 1.5 stays UNCHANGED. The resume context is conveyed via (a) the `taskSpec.context[]` populator's two additional entries, AND (b) the AR9 `lastAttempted` payload (which carries forward from Story 3.1). The sub-agent does NOT need to know it's a resume — it reads `taskSpec.task` + `taskSpec.context[]` and produces the artifact same as a fresh attempt.
- **Add a new error class.** The 16-code registry stays UNCHANGED. The 3 new resume-related throws all use the existing `ConfigError` class with `hintOverride` (Story 1.11 AC-2 + Story 1.10 AC-3 precedent).
- **Add a Layer 1 markdown change.** `commands/bmad-next.md` already forwards `--last-attempted-json` per Story 3.1 Task 12. The resume flow uses the SAME plumbing.
- **Implement the failure-UX modes** (Stories 5.1-5.4). On a verifier-failure halt, the user invokes `--resume` to retry once; if the retry also fails, the user invokes `--resume` again or hand-edits the artifact. Story 5.x adds automated retry / skip / route-to-fixer / escalate.
- **Surface a "resume hint" in the AR9 halt action's message.** The halt action's message already carries the thrown error's `actionableHint` per AR21 + AR22; many of those hints reference `--resume` directly (e.g., `VerifierFailureError.actionableHint` includes `try /bmad-next --resume after fixing the underlying issue`). Story 3.2 does NOT change the halt-line shape; only consumes `state.lastAttempted` on the resume invocation.
- **Read or modify `state.lastFailureReason.runId`'s transcript.** Story 3.2's context-injection v0.1 conservative implementation emits the `{ path, label }` entry pointing at the canonical transcript path under `_bmad-output/.stepper/runs/<runId>/log.md` — but does NOT actually open or read the file. The sub-agent reads it (or surfaces "file missing" via Story 2.1's `runVerifier` `required-files` check). This best-effort behaviour mirrors Story 2.4's `buildContextRefs` pattern (`run.ts:357-370`).
- **Update `recomputeState`** (Story 1.6). `recomputeState` already sets `lastAttempted: null` on every recompute per Story 1.6 v0.1 minimum-viable behaviour. After a resume, the user may want to re-trigger `--recompute-state` to verify the cache matches reality — but that's a separate user action, not an automatic behaviour Story 3.2 ships.
- **Bump the state schema to V2.** All needed fields (`lastAttempted` + `lastFailureReason`) already exist on `StateV1Schema` per Story 1.5 + Story 3.1's named-schema extraction. NO schema-version bump required.
- **Modify `verify-and-advance.ts`.** The lock-held runner already handles the resume-attempt's verifier execution + state write per Story 3.1's halt-path save. Story 3.2's resume is a re-dispatch from `run.ts`'s perspective; `verify-and-advance.ts` sees a normal dispatch and can't tell if it's a resume or a fresh attempt (which is correct — the contract is symmetric).

It DOES land:

- The architecturally-prescribed **`--resume` runtime branch** in `src/commands/next/run.ts` per FR27 + epic AC lines 740-754.
- The **3 actionable error hints** (no-target; non-recoverable; missing-step) all conformant to AR21 + AR22.
- The **resume-context populator** (2 synthetic `taskSpec.context[]` entries pointing at prior failure-reason transcript + last-attempt artifact path) per epic AC line 748.
- The **recoverability gating** (allow-list of 14 recoverable codes; deny `BMAD_INCOMPATIBLE` + `BMAD_NOT_INSTALLED`) per epic AC line 746.
- The **canonical resume tuple preservation** — `dispatchSpec.epic + .story` populated from `state.lastAttempted` (NOT `state.lastSuccessfulStep`) so the resume targets the same work item the previous attempt targeted.
- **10-12 new test cases** in `run.test.ts` covering all 3 ACs + 4 edge cases.

## Acceptance Criteria

The acceptance criteria below are reproduced **verbatim** from `_bmad-output/planning-artifacts/epics.md` §Story 3.2 (lines 738-754, BDD Given/When/Then format). Lines and AC labelling preserved.

**Given** `state.yaml.lastAttempted` is set and `lastFailureReason.code` is recoverable (not `BMAD_INCOMPATIBLE` or `BMAD_NOT_INSTALLED`)
**When** `/bmad-next --resume` is invoked
**Then** Stepper re-dispatches the last attempted step with the failure context included in the dispatch-spec's CONTEXT section (artifact excerpt + verifier failure detail)
**Given** `state.yaml.lastAttempted` is null (no halt to resume from)
**When** `--resume` is invoked
**Then** Stepper exits with `CONFIG_ERROR` (exit code 2) and the hint `No prior halt to resume from. Run /bmad-next to advance to the next step.`
**Given** `--resume` is combined with `--skip <step>`
**When** invoked
**Then** Stepper marks the attempted step as skipped in state and advances to the next (deferred to Epic 5 Story 5.2; this story rejects `--skip` here as not yet implemented)

## Tasks / Subtasks

- [x] **Task 0 — Verify pre-conditions (AC: all)**
  - [x] 0.1 Confirm Story 3.1 (`src/commands/next/verify-and-advance.ts` + `src/schemas/state.ts` named-schema extraction + `src/commands/next/run.ts` AR9 emit extension) is `done` per `_bmad-output/implementation-artifacts/sprint-status.yaml` line 71 (`3-1-record-last-attempted-last-failure-reason-on-halt: done`).
  - [x] 0.2 Confirm Story 1.7 (`src/commands/next/args.ts`) declares `resume: z.boolean().default(false)` on `NextArgsSchema` line 155 + includes it in the `booleanKeys` set at line 212. Verify by reading `src/commands/next/args.ts:146-169`. **No args change needed for Story 3.2.**
  - [x] 0.3 Confirm Story 3.1 `LastAttemptedSchema` + `LastFailureReasonSchema` are exported from `src/schemas/state.ts:58-87`. Confirm `state.lastAttempted: LastAttemptedSchema.nullable().optional()` at line 107 + `state.lastFailureReason: LastFailureReasonSchema.nullable().optional()` at line 108.
  - [x] 0.4 Confirm `src/errors.ts` exports `ConfigError` with the optional `hintOverride` constructor arg (Story 1.11 AC-2 precedent at lines 206-239). Verify by reading `src/errors.ts:206-239` — confirm `new ConfigError("message", "detail", "hintOverride")` is the established 3-arg shape.
  - [x] 0.5 Confirm `src/dispatch/generate-spec.ts` exports `BuildDispatchSpecInput` with optional `epic?: number` + `story?: string` (Story 2.2 dev-001 deviation at lines 90-91). **No dispatch-spec change needed for Story 3.2.**
  - [x] 0.6 Confirm `src/state/load.ts` exports `loadStateUnlocked(opts?)` per Story 1.6 + Story 2.4 lock-free contract. Verify by reading `src/state/load.ts:166-171`.
  - [x] 0.7 Confirm `src/commands/next/run.ts:712-783` is the standard happy-path dispatch sequence (loadStateUnlocked → build DAG → pickNextStep → resolvePersona → buildDispatchSpec → emit AR9). Story 3.2 INSERTS the resume branch BETWEEN the `loadStateUnlocked` call (line 712) and the `pickNextStep` call (line 719).
  - [x] 0.8 Confirm Story 3.1's `run.ts` AR9 emit at lines 760-783 carries `lastAttempted: { step, epic, story, attemptedAt }`. Story 3.2's resume path uses the SAME emit shape — only the source-of-truth for `step / epic / story` changes (from `nextStep.name + dispatchSpec.epic / .story` to `state.lastAttempted.step + .epic + .story` carried verbatim).
  - [x] 0.9 Confirm `src/dag/index.ts`'s `build(...)` returns `DagAdjacency { nodes: Map<string, DagNode> }` per Story 1.10. Story 3.2's "step not in DAG" check uses `dag.nodes.get(state.lastAttempted.step)` — `undefined` triggers the missing-step error.
  - [x] 0.10 Confirm `src/personas/index.ts`'s `resolvePersona(...)` accepts `stepName: string` per Story 1.11. Story 3.2's resume passes `state.lastAttempted.step` as the `stepName` (the persona resolution is identical to a fresh attempt; the persona doesn't depend on attempt-history).
  - [x] 0.11 Read epics.md §Story 3.2 lines 738-754 verbatim. Confirm the AC text in §Acceptance Criteria above is character-identical.
  - [x] 0.12 Read architecture.md §line 1357 (`FR27 → src/commands/next/args.ts, src/state/load.ts`); §line 1447-1462 (Layer 1 ↔ Layer 2 sequence diagram showing `/bmad-next --resume` flow); §P3 lines 759-771 (state.yaml canonical YAML shape with `lastAttempted` + `lastFailureReason`); §line 1673-1674 (state-hash check + `STATE_CHANGED_DURING_DISPATCH` error referencing `--resume` in its hint).
  - [x] 0.13 Read prd.md §FR27 line 706 (`Users can resume from the last attempted step after any halt (--resume)`); §FR28 line 707 (`--skip <step> --resume` deferred to Story 5.2); §NFR-R2 line 774 (`100% recovery rate via --resume`).
  - [x] 0.14 Read epic-2-retrospective.md §Forward Action Items (lines 187-208) — confirm Story 3.2 is correctly identified per recommended sequence as the IMMEDIATE successor to Story 3.1 (`Story 3.2 (--resume) is unblocked` per Story 3.1 §line 744).
  - [x] 0.15 Read Story 3.1's File List + Carry-overs sections (lines 674-693 + 587-611). Confirm Story 3.1's writes (state.lastAttempted + state.lastFailureReason on halt) are the FOUNDATIONAL inputs to Story 3.2's reads.
  - [x] 0.16 Read Story 2.4's `run.ts` `RunNextOptions` + `NextResult` interfaces at lines 175-217. Confirm Story 3.2 does NOT need to extend either (the resume branch reuses the existing options + result shapes verbatim).
  - [x] 0.17 Confirm baseline `bun run check` exits 0 with **563 pass / 0 fail / 2064 expects / 48 files** per Story 3.1 final.
  - [x] 0.18 Confirm Bun host version satisfies AR2 (Bun >= 1.3). Run `bun --version`; record in Completion Notes. **Bun 1.3.12 confirmed.**

- [x] **Task 1 — Plan the `NON_RECOVERABLE_FAILURE_CODES` constant + recoverability gate (AC-1)**
  - [x] 1.1 Sketch the constant at the top of `src/commands/next/run.ts` (alongside the existing `STEP_RUNNER_AGENT` + `PHASE_ORDER` constants):
    ```typescript
    /**
     * Story 3.2: failure codes that block --resume per epic AC line 746.
     * The two codes both have exitCode 3 (BMAD compatibility errors per
     * src/errors.ts:92-104). All 14 OTHER codes in the 16-code registry are
     * resumable.
     */
    const NON_RECOVERABLE_FAILURE_CODES: ReadonlySet<string> = new Set([
      "BMAD_INCOMPATIBLE",
      "BMAD_NOT_INSTALLED",
    ]);
    ```
  - [x] 1.2 Document the AC-line-746 wording in JSDoc: "recoverable (not `BMAD_INCOMPATIBLE` or `BMAD_NOT_INSTALLED`)".
  - [x] 1.3 Document the gating policy: when `state.lastFailureReason === null`, recoverability check is SKIPPED (the resume targets `state.lastAttempted` regardless — see §Edge case in Context Summary).

- [x] **Task 2 — Plan the resume branch in `runNext` (AC-1, AC-2)**
  - [x] 2.1 Sketch the insertion point in `src/commands/next/run.ts:712-720` (between `const state = await loadStateUnlocked(...)` and `const nextStep = pickNextStep(...)`):
    ```typescript
    const state = await loadStateUnlocked({ statePath: opts?.statePath });
    const dag = await build({...});

    // Story 3.2: --resume branch.
    let nextStep: DagNode;
    let resumeContextRefs: ReadonlyArray<{ path: string; label?: string }> = [];
    let resumeEpicOverride: number | undefined;
    let resumeStoryOverride: string | undefined;
    let resumeLastAttempted: LastAttempted | undefined;
    if (args.resume) {
      const resumeResult = resolveResumeTarget(state, dag);
      nextStep = resumeResult.node;
      resumeContextRefs = resumeResult.contextRefs;
      resumeEpicOverride = resumeResult.epic;
      resumeStoryOverride = resumeResult.story;
      resumeLastAttempted = resumeResult.lastAttempted;
    } else {
      nextStep = pickNextStep(state, dag, args);
    }
    ```
  - [x] 2.2 Sketch the new helper `resolveResumeTarget(state, dag)`:
    ```typescript
    interface ResolveResumeTargetResult {
      readonly node: DagNode;
      readonly contextRefs: ReadonlyArray<{ path: string; label?: string }>;
      readonly epic: number;
      readonly story: string;
      readonly lastAttempted: LastAttempted;
    }

    function resolveResumeTarget(
      state: State,
      dag: DagAdjacency,
    ): ResolveResumeTargetResult {
      // AC-2: no halt to resume from.
      if (state.lastAttempted === null || state.lastAttempted === undefined) {
        throw new ConfigError(
          "resume: no halted run to resume from",
          JSON.stringify({ lastAttempted: state.lastAttempted }),
          "No prior halt to resume from. Run /bmad-next to advance to the next step.",
        );
      }

      // AC-1 recoverability gate.
      const failureCode = state.lastFailureReason?.code;
      if (failureCode !== undefined && NON_RECOVERABLE_FAILURE_CODES.has(failureCode)) {
        throw new ConfigError(
          `resume: lastFailureReason.code ${failureCode} is not resumable`,
          JSON.stringify({ failureCode }),
          `Last failure was ${failureCode} which is not resumable. Run /bmad-next --doctor to inspect the BMAD installation, then re-run /bmad-next.`,
        );
      }

      // Edge: step name no longer in DAG.
      const node = dag.nodes.get(state.lastAttempted.step);
      if (node === undefined) {
        throw new ConfigError(
          `resume: lastAttempted.step ${state.lastAttempted.step} is not in the resolved DAG`,
          JSON.stringify({
            step: state.lastAttempted.step,
            available: [...dag.nodes.keys()],
          }),
          `Step ${state.lastAttempted.step} from lastAttempted is no longer in the DAG. Run /bmad-next --recompute-state and re-run /bmad-next.`,
        );
      }

      // Build resume-context refs (best-effort — the sub-agent reads or
      // surfaces missing-file via runVerifier).
      const contextRefs: Array<{ path: string; label: string }> = [];
      if (state.lastFailureReason !== null && state.lastFailureReason !== undefined) {
        const transcriptPath = path.posix.join(
          "_bmad-output/.stepper/runs",
          state.lastFailureReason.runId,
          "log.md",
        );
        contextRefs.push({
          path: transcriptPath,
          label: `Previous failure: ${state.lastFailureReason.code} — ${state.lastFailureReason.message}`,
        });
      }
      // Last-attempt artifact path (best-effort — file may not exist).
      contextRefs.push({
        path: artifactPathForStep(node, state.lastAttempted.step),
        label: "Last attempted artifact (may be missing or incomplete)",
      });

      return {
        node,
        contextRefs,
        epic: state.lastAttempted.epic,
        story: state.lastAttempted.story,
        lastAttempted: state.lastAttempted,
      };
    }
    ```
  - [x] 2.3 Document the `lastAttempted` carry-forward semantics: the AR9 emit's `lastAttempted` payload uses `state.lastAttempted.step + .epic + .story` verbatim; the `attemptedAt` is REFRESHED to the new attempt's timestamp (per Story 3.1's epic AC line 731 wording — "lastAttempted is updated on every attempt").
  - [x] 2.4 Document the `epic + story` override discipline: the dispatch-spec's `epic` + `story` fields are populated from `state.lastAttempted.epic` + `state.lastAttempted.story` (NOT from `state.lastSuccessfulStep`) per the canonical resume tuple semantics in Context Summary.

- [x] **Task 3 — Plan the resume-aware `buildContextRefs` extension (AC-1)**
  - [x] 3.1 Story 2.4's existing `buildContextRefs(node, dag)` at `run.ts:357-370` produces context entries from `node.after` (the prerequisite list). Story 3.2 EXTENDS the call site to APPEND the 2 resume-context entries when `args.resume === true`:
    ```typescript
    // Existing:
    const contextRefs = buildContextRefs(nextStep, dag);
    // Story 3.2 extension:
    const finalContextRefs = args.resume
      ? [...contextRefs, ...resumeContextRefs]
      : contextRefs;
    ```
  - [x] 3.2 Pass `finalContextRefs` to `buildDispatchSpec(...)` instead of `contextRefs` per Task 4.
  - [x] 3.3 Document the ordering: the prerequisite-derived refs come FIRST, the resume-context refs come LAST. The sub-agent reads them in order; placing the resume-context entries last makes them the most-recent context the sub-agent sees (recency bias).

- [x] **Task 4 — Plan the `buildDispatchSpec` epic+story override on resume (AC-1)**
  - [x] 4.1 Story 2.4's existing call site at `run.ts:741-750` does NOT pass `epic` / `story` overrides — `buildDispatchSpec` derives them from `state.lastAttempted ?? state.lastSuccessfulStep` per `generate-spec.ts:172-177`. Story 3.2 EXTENDS the call site to pass explicit overrides on resume:
    ```typescript
    const result = await buildDispatchSpec({
      stepName: nextStep.name,
      state,
      persona,
      stagingRoot: opts?.stagingRoot,
      nowIso: opts?.nowIso,
      phase: dagPhaseToDispatchPhase(nextStep.phase),
      contextRefs: finalContextRefs,
      requiredSections,
      ...(args.resume && resumeEpicOverride !== undefined
        ? { epic: resumeEpicOverride }
        : {}),
      ...(args.resume && resumeStoryOverride !== undefined
        ? { story: resumeStoryOverride }
        : {}),
    });
    ```
  - [x] 4.2 Document the rationale: on resume, the canonical resume tuple is `state.lastAttempted` — NOT `state.lastSuccessfulStep`. The default behaviour in `generate-spec.ts:172-177` already prefers `lastAttempted` over `lastSuccessfulStep`, so the override is technically redundant ON THE HAPPY PATH — but it makes the intent EXPLICIT in the runner-tier code (defence-in-depth).

- [x] **Task 5 — Plan the AR9 emit `lastAttempted` payload on resume (AC-1)**
  - [x] 5.1 Story 3.1's existing AR9 emit at `run.ts:760-783` populates `lastAttempted: { step: nextStep.name, epic: result.dispatchSpec.epic, story: result.dispatchSpec.story, attemptedAt }`. On resume, this naturally produces the correct payload because:
    - `nextStep.name === state.lastAttempted.step` (set by `resolveResumeTarget`).
    - `result.dispatchSpec.epic === state.lastAttempted.epic` (set by Task 4 override).
    - `result.dispatchSpec.story === state.lastAttempted.story` (set by Task 4 override).
    - `attemptedAt` is FRESH (the resume registers a NEW attempt with a new timestamp).
  - [x] 5.2 **No code change needed for the emit itself** — the existing Story 3.1 emit shape is correct on resume by construction. Document this in JSDoc.

- [x] **Task 6 — Implement the `NON_RECOVERABLE_FAILURE_CODES` constant + `resolveResumeTarget` helper (AC-1, AC-2)**
  - [x] 6.1 Edit `src/commands/next/run.ts` to add the `NON_RECOVERABLE_FAILURE_CODES` constant per Task 1.1 sketch (insert near the top of the module, alongside `PHASE_ORDER`).
  - [x] 6.2 Add the `LastAttempted` type import from `../../schemas/state.ts` (foundational-tier import; OK per AR41). The import should be at the top of `run.ts` alongside the existing `State` import on line 105.
  - [x] 6.3 Implement `resolveResumeTarget(state, dag)` per Task 2.2 sketch. Place the helper between the existing `pickNextStep` function (line 408-518) and the `runNext` function (line 554+) — it's a sibling helper.
  - [x] 6.4 Document the helper's contract:
    - Throws `ConfigError` with one of 3 verbatim hints per AC-2 / AC-1 / Edge.
    - Returns `{ node, contextRefs, epic, story, lastAttempted }` on success.
    - The returned `contextRefs` is empty `[]` when `state.lastFailureReason === null`; 2 entries otherwise.
  - [x] 6.5 Verify the AR22 verb discipline: all 3 hints start with `Run` / `See` / standard verbs. The hints are single-line per AR22.

- [x] **Task 7 — Implement the resume branch in `runNext` (AC-1, AC-2)**
  - [x] 7.1 Edit `src/commands/next/run.ts:712-720` to insert the resume branch per Task 2.1 sketch. Declare the resume-shaped variables (`resumeContextRefs`, `resumeEpicOverride`, `resumeStoryOverride`, `resumeLastAttempted`) before the `if (args.resume) {...} else {...}` block.
  - [x] 7.2 Edit the existing `buildContextRefs` call at `run.ts:737` to apply the resume extension per Task 3.1 sketch.
  - [x] 7.3 Edit the existing `buildDispatchSpec` call at `run.ts:741-750` to apply the epic+story override per Task 4.1 sketch.
  - [x] 7.4 Edit the existing AR9 emit at `run.ts:760-783` per Task 5.1 — confirm no change needed (the existing emit shape is correct on resume by construction).
  - [x] 7.5 Verify the resume branch is OUTSIDE the existing `cleanStagingOrphans` + `--doctor` short-circuits + read-only flag handlers (steps 4-6 in `runNext`). Resume is a write-side flag (it triggers a dispatch); resume MUST flow through the standard staging-cleanup + doctor checks.
  - [x] 7.6 Verify the resume branch RUNS BEFORE the `--explain` short-circuit at `run.ts:652-673` is hit. Per the test case at Task 9.8, `--resume --explain` should target the resume step in the explain output. **`--explain` extension shipped**: when `args.resume === true`, the explain handler calls `resolveResumeTarget(state, dag).node` instead of `pickNextStep(state, dag, args)`.
  - [x] 7.7 Verify the resume branch is ABOVE the `--dry-run` short-circuit at `run.ts:754-758`. The dry-run report should reference the resume step name. The resume branch overrides `nextStep` BEFORE the dry-run short-circuit, so the dry-run report naturally references the resume step. **No additional dry-run change needed.**

- [x] **Task 8 — Document the `--skip` deferral (AC-3)**
  - [x] 8.1 Add a JSDoc comment block above `resolveResumeTarget` documenting:
    - Per epic AC line 754, `--resume + --skip` is rejected as unimplemented in v0.1.
    - Story 5.2 owns `--skip`. When Story 5.2 adds `--skip` to `NextArgsSchema` AND adds the cross-validation rejection.
    - Story 3.2 ships NO enforcement code — the flag doesn't exist in v0.1 to combine with.
  - [x] 8.2 Verify by grepping `src/commands/next/args.ts` that `--skip` is NOT in `NextArgsSchema` (confirmed via Task 0.2).

- [x] **Task 9 — Add `run.test.ts` resume coverage (AC-1, AC-2, AC-3, edges)**
  - [x] 9.1 Append to `src/commands/next/run.test.ts` a new `describe` block: `"runNext — Story 3.2 --resume flag"`.
  - [x] 9.2 **Test case A (AC-1 happy path)** — implemented as `"AC-1 happy path: resume re-dispatches the cached lastAttempted step"`.
  - [x] 9.3 **Test case B (AC-1 context-surfacing)** — implemented as `"AC-1 context-surfacing: resume appends 2 context entries (failure transcript + last-attempt artifact)"`.
  - [x] 9.4 **Test case C (AC-2 missing lastAttempted)** — implemented as `"AC-2 missing lastAttempted: halts with verbatim hint per epic AC line 751"`.
  - [x] 9.5 **Test case D (AC-1 non-recoverable BMAD_INCOMPATIBLE)** — implemented as `"AC-1 non-recoverable BMAD_INCOMPATIBLE: halts with the non-resumable hint"`.
  - [x] 9.6 **Test case E (AC-1 non-recoverable BMAD_NOT_INSTALLED)** — implemented as `"AC-1 non-recoverable BMAD_NOT_INSTALLED: halts with the non-resumable hint"`.
  - [x] 9.7 **Edge case F (lastAttempted set, lastFailureReason null)** — implemented as `"Edge: lastAttempted set + lastFailureReason null → resume succeeds with 1 context entry"`.
  - [x] 9.8 **Edge case G (lastAttempted.step no longer in DAG)** — implemented as `"Edge: lastAttempted.step not in DAG → halts with --recompute-state hint"`.
  - [x] 9.9 **Edge case H (resume bypasses pickNextStep)** — implemented as `"resume bypasses pickNextStep — cached lastAttempted.step wins over lastSuccessfulStep advancement"`.
  - [x] 9.10 **Combo test I (--resume + --dry-run)** — implemented as `"--resume + --dry-run: report message references the resume target"`.
  - [x] 9.11 **Combo test J (--resume + --explain)** — implemented as `"--resume + --explain: report message references the resume target"`.
  - [x] 9.12 **Test case K (nowIso injection)** — implemented as `"--resume registers a NEW attempt with a fresh attemptedAt (nowIso wins)"`.
  - [x] 9.13 **Test case L (state.yaml unchanged after resume — lock-free contract)** — implemented as `"--resume does NOT modify state.yaml (lock-free run.ts contract)"`.
  - [x] 9.14 Each test follows AR35 tmpdir-per-test discipline: reuses the existing module-level `beforeEach`/`afterEach` + `commonOpts` factory.
  - [x] 9.15 Reused the colocated `writeMinimalState` helper, plus added a Story 3.2-local `writeResumeState` factory layered on top to seed `lastAttempted` + `lastFailureReason` with declarative inputs. Plus 2 extra coverage tests (defence-in-depth Zod rejection + DispatchActionV1Schema round-trip) for 14 total resume tests.

- [x] **Task 10 — Verify backward compatibility (no regression on existing tests)**
  - [x] 10.1 Ran `bun test src/commands/next/run.test.ts`: 47 pass / 0 fail / 151 expects (33 pre-Story-3.2 + 14 new resume).
  - [x] 10.2 `bun test src/commands/next/` flows through `bun run check`: all colocated next/ tests pass.
  - [x] 10.3 `bun test src/integration/`: 13 pass / 0 fail / 138 expects across 4 files (no-write-outside-scope, halt-records-state, etc.).
  - [x] 10.4 `bun test src/smoke/`: confirmed via full `bun run check` (all 577 tests pass).

- [x] **Task 11 — Optional: integration test for resume happy path (AC-1 cross-cutting)**
  - [x] 11.1 DEFERRED. The 14 colocated `run.test.ts` cases at Task 9 cover all 3 ACs + 4 edges + combo-flag interactions in-process. Story 3.1's halt-records-state integration test already validates the WRITE side; Story 3.2 reads the same fields. A subprocess-spawn integration test would be defence-in-depth duplicate.
  - [x] 11.2 DEFERRED per the spec's "OPTIONAL deliverable" wording at Task 11.1. No new integration file added.

- [x] **Task 12 — Run the full test suite + `bun run check` (AC: all)**
  - [x] 12.1 `bun run check` exit 0. Test delta: +14 tests (run.test.ts), +54 expects.
  - [x] 12.2 Post-Story-3.2 baseline: **577 pass / 0 fail / 2118 expects / 48 files**. Falls within the spec's projected ~573-582 range.
  - [x] 12.3 Confirmed `src/errors.ts` registry stays at **16 codes** (`bun test src/errors.test.ts`: 10 pass, 197 expects). Story 3.2 ships ZERO new error classes — all 3 new resume-related throws use existing `ConfigError` with `hintOverride`.
  - [x] 12.4 `bun test src/integration/`: all integration tests pass (Story 2.8 + Story 3.1).
  - [x] 12.5 `bun test src/smoke/`: 13 pass / 0 fail / 138 expects.

- [x] **Task 13 — Update sprint-status.yaml + record completion (AC: all)**
  - [x] 13.1 Updated `_bmad-output/implementation-artifacts/sprint-status.yaml`: `3-2-resume-flag` flipped to `review` at story completion (was `ready-for-dev` at story start; intermediate `in-progress` during dev-story workflow). `epic-3: in-progress` confirmed.
  - [x] 13.2 Story file frontmatter status flipped to `review` at end of bmad-dev-story workflow per the workflow's Step 9 contract.
  - [x] 13.3 sprint-status.yaml retains its original schema (no new fields).

## Dev Notes

### File List

#### Modified Files

- **`src/commands/next/run.ts`** (~860 → ~930 lines): adds `NON_RECOVERABLE_FAILURE_CODES` constant (~6 lines); adds `LastAttempted` type import (~1 line); adds `resolveResumeTarget(state, dag)` helper (~70 lines); inserts resume branch in `runNext` between loadStateUnlocked + pickNextStep (~15 lines); extends `buildContextRefs` call site for resume-context append (~3 lines); extends `buildDispatchSpec` call site for epic+story override (~6 lines); extends `--explain` short-circuit to honor `--resume` (~3 lines).
- **`src/commands/next/run.test.ts`** (~760 → ~900 lines): appends 10-12 NEW test cases in a new `describe` block per Task 9. Reuses existing `seedState` + tmpdir setup factories.

#### New Files

- **`src/integration/resume-flag.test.ts`** (OPTIONAL, ~150-200 lines): the OPTIONAL integration test joining Story 2.8's `no-write-outside-scope.test.ts` + Story 3.1's `halt-records-state.test.ts` in `src/integration/`. Mark as DEFERRED if time-constrained.

#### Sprint-Status

- **`_bmad-output/implementation-artifacts/sprint-status.yaml`**: flip `3-2-resume-flag: backlog → ready-for-dev`. Confirm `epic-3: in-progress` (already set by Story 3.1).

#### Task Record

- **`.bmad-stepper/runs/2026-05-01T100600Z-bmad-next/tasks/t1-create-story.yaml`** (NEW per `run.yaml` `declaredMutationScope.allowedPaths`).

### Architecture Compliance

- **AR8** (lock-free `run.ts` / lock-held `verify-and-advance.ts`): UNCHANGED. Story 3.2's resume branch reads state via `loadStateUnlocked` (same as the standard happy path); no lock acquired in `run.ts`. The downstream `verify-and-advance.ts` invocation by Layer 1 acquires the lock as usual. Verified by Test K (Task 9.13) — state.yaml byte-stable after resume.
- **AR9** (single discriminated-union JSON line on stdout): UNCHANGED. The dispatch line shape is identical to the standard path; only the `lastAttempted` payload's source-of-truth changes (from "fresh `nextStep.name`" to "`state.lastAttempted.step` carried verbatim").
- **AR11** (state save semantics): UNTOUCHED. Story 3.2 does NOT save state from `run.ts`. The next save is in `verify-and-advance.ts` per the existing Story 2.6 + Story 3.1 contract.
- **AR21 + AR22** (errors carry `code` + `actionableHint`; single-line `Run/See/Try/Check` hints): EXTENDED. Story 3.2 introduces 3 NEW `ConfigError` `hintOverride` strings (no-resume-target / non-recoverable / missing-step). All 3 hints follow the AR22 verb discipline (`Run` is the leading verb in 2 of 3; the third uses `See` / standard verb). All 3 are single-line. Backwards-compat with `ConfigError`'s 3-arg constructor preserved (Story 1.11 AC-2 precedent).
- **AR33** (function & error semantics; throw not Result; no console.*; async/await): UNCHANGED. The resume branch throws `ConfigError` (caught by the outer `runNext` try/catch and translated to `action: "halt"` per `haltFromError` at `run.ts:792`). No Result-shaped surfaces added.
- **AR41** (boundary graph; no upward / sibling-higher imports): UNCHANGED. Story 3.2 modifies `run.ts` (top-tier composer) only; no new module created; no new sibling-higher imports added (the new `LastAttempted` type import is foundational-tier — `../../schemas/state.ts` — explicitly allowed per architecture lines 1287-1289).

### Acceptance Criteria Mapping

- **AC-1** ("Stepper re-dispatches the last attempted step with the failure context included in the dispatch-spec's CONTEXT section"): delivered by Tasks 6-7 (`resolveResumeTarget` + resume branch in `runNext`) + Task 3 (resume-context append on `taskSpec.context[]`) + Task 4 (epic+story override via `buildDispatchSpec`).
- **AC-2** ("Stepper exits with `CONFIG_ERROR` (exit code 2) and the hint `No prior halt to resume from. Run /bmad-next to advance to the next step.`"): delivered by `resolveResumeTarget`'s first ConfigError throw per Task 2.2 sketch + Task 6.1.
- **AC-3** (`--resume + --skip` deferred to Story 5.2; Story 3.2 rejects `--skip`): delivered as DOCUMENTATION ONLY per Task 8 (the `--skip` flag does NOT exist in v0.1; Story 3.2 ships no enforcement code; Story 5.2 will add both the flag AND the cross-validation rejection).

### v0.1 Design Decisions

#### Reuse `ConfigError` with `hintOverride` (no new error class)

Per Story 1.11 AC-2 + Story 1.10 AC-3 precedent (`src/errors.ts:106-141, 206-239`), `ConfigError` and `UnknownBmadSkillError` BOTH accept an optional `hintOverride` constructor arg that flows through `actionableHint`. Story 3.2's 3 new resume-related throws all use `ConfigError` with `hintOverride` — registry stays at **16 codes**. The 3 hints are:

1. `No prior halt to resume from. Run /bmad-next to advance to the next step.` (verbatim per AC line 751).
2. `Last failure was <code> which is not resumable. Run /bmad-next --doctor to inspect the BMAD installation, then re-run /bmad-next.` (the `<code>` substitution is the actual failure code, e.g., `BMAD_INCOMPATIBLE`).
3. `Step <step> from lastAttempted is no longer in the DAG. Run /bmad-next --recompute-state and re-run /bmad-next.` (the `<step>` substitution is `state.lastAttempted.step`).

#### Resume substitutes nextStep — does NOT skip pickNextStep cross-validation

Story 3.2's resume branch calls `resolveResumeTarget(state, dag)` INSTEAD OF `pickNextStep(state, dag, args)`. The standard `pickNextStep` validation (DAG membership, `args.epic`/`args.story`/`args.phase` filters, `args.includeOptional`/`args.noOptional` filters) is BYPASSED on resume. **Rationale**: the resume target is the cached `state.lastAttempted.step` — the user's intent is "do the same thing again", not "compute the next step under the current filters". If `args.epic`/`args.story`/`args.phase` are passed alongside `--resume`, they are SILENTLY IGNORED (the resume target wins). Document this in the JSDoc.

#### Resume preserves the canonical resume tuple (lastAttempted) — NOT lastSuccessfulStep

Per Context Summary, the dispatch-spec's `epic + story` fields are populated from `state.lastAttempted.epic` + `state.lastAttempted.story` (NOT recomputed from current `state.lastSuccessfulStep`). On the typical resume scenario (last attempt halted; `lastSuccessfulStep` unchanged from before the halt), the two are wire-compatible — but on the edge case where `lastSuccessfulStep` advanced past `lastAttempted` (theoretically impossible but defensive), the resume STILL targets the cached `lastAttempted` work item.

#### Best-effort resume-context entries (sub-agent reads or surfaces missing-file)

Story 3.2's `resolveResumeTarget` v0.1 conservative implementation emits the `{ path, label }` entries pointing at canonical paths under `_bmad-output/.stepper/runs/<runId>/log.md` (the failure-reason transcript) and `_bmad-output/implementation-artifacts/<step>.md` (the last-attempt artifact) — but does NOT actually open or read either file. The sub-agent reads them; `runVerifier`'s `required-files` check (Story 2.1) surfaces the missing-file error if applicable. This best-effort behaviour mirrors Story 2.4's `buildContextRefs` pattern (`run.ts:357-370`).

#### --explain extension to honor --resume

The existing `--explain` short-circuit at `run.ts:652-673` calls `pickNextStep(state, dag, args)` directly. Story 3.2 EXTENDS this handler with a small `args.resume` branch:

```typescript
if (args.explain) {
  const state = await loadStateUnlocked(...);
  const dag = await build(...);
  let nextHint = "(none — DAG empty or filters exclude all candidates)";
  try {
    const node = args.resume
      ? resolveResumeTarget(state, dag).node
      : pickNextStep(state, dag, args);
    nextHint = node.name;
  } catch {...}
  return reportWithMessage(`Reasoning trace is implemented in Story 3.6 (Epic 3); current next step: ${nextHint}`);
}
```

This is a 3-line extension; the full `--explain` reasoning trace (with persona resolution path, model, budget, expected output path) is Story 3.6's deliverable.

#### --skip is not yet implemented in v0.1

Per AC line 754, `--resume + --skip` is rejected. Story 3.2 ships NO enforcement code because `--skip` is NOT yet declared in `NextArgsSchema` (Story 1.7's 18-flag inventory does NOT include `--skip` — verified via Grep at Task 0.2). Story 5.2 owns `--skip` AND the cross-validation rejection. Story 3.2 documents this deferral in the `resolveResumeTarget` JSDoc.

### Carry-overs from Story 3.1

- **Story 3.1 §line 744** (Story 3.2 unblocked): RECEIVED. Story 3.2 reads `state.lastAttempted` + `state.lastFailureReason` per Story 3.1's persisted writes.
- **Story 3.1 §line 750** (AR22 verb ratification — `Pass` verbs slipped through CI gate): RESPECTED. Story 3.2's 3 new hints all start with `Run` / `See` (no new `Pass` verbs introduced); the existing `Pass` carry-over to Story 6.x stays as-is.
- **Story 3.1 §line 751** (Bun native `mock.restore()` — would let integration tests use in-process mocking): RESPECTED. Story 3.2's OPTIONAL integration test at Task 11 uses subprocess spawn per Story 3.1 dev-002 pattern.
- **Story 3.1 §line 752** (architecture-doc patch — `commands/bmad-next.md` Step 5 forwards `--last-attempted-json`): RESPECTED. Story 3.2's resume flow uses the SAME forwarding path; no further architecture-doc patches needed.
- **Story 3.1 §line 753** (DispatchSpecV2 with `phase` field — would replace `derivePhaseFromStep` lookup table in `verify-and-advance.ts:128-146`): UNCHANGED. Story 3.2 does NOT modify `verify-and-advance.ts`; the deferral to Story 6.x stays.
- **Story 3.1 §line 754** (state schema `code` field tightening — currently `z.string()` per Story 1.5): UNCHANGED. Story 3.2 reads `state.lastFailureReason.code` and compares against the `NON_RECOVERABLE_FAILURE_CODES` set; the `z.string()` shape is sufficient.

### Carry-overs from Epic 2 Retrospective

- **Story 2.6 dev-001** (state-hash uses Option A — epic+story tuple comparison from `(state.lastAttempted ?? state.lastSuccessfulStep)` projection): UNCHANGED. Story 3.2's resume passes `state.lastAttempted.epic + .story` as explicit overrides to `buildDispatchSpec`, so the dispatch-spec's `epic + story` matches the seed `state.lastAttempted`. The state-hash check in `verify-and-advance.ts` will pass as long as `state.lastAttempted` is unchanged between `run.ts` exit and `verify-and-advance.ts` start (which is the lock-free contract; no other writer should be active).
- **Story 2.5 dev-001** (directory rename `src/transcript/` → `src/runs/`): RESPECTED. Story 3.2's resume-context entry path uses `_bmad-output/.stepper/runs/<runId>/log.md` (matching the established `src/runs/` writer convention).
- **Story 2.6 dev-002** (`runVerifier` `stagingRoot` REQUIRED): UNCHANGED. Story 3.2 does NOT call `runVerifier`.
- **Story 2.6 dev-003** (`derivePhaseFromStep` 17-entry hardcoded lookup table): UNCHANGED. Story 3.2 uses `dagPhaseToDispatchPhase(nextStep.phase)` (the existing helper at `run.ts:309-314`); the resume path goes through the same helper.
- **Story 2.6 dev-004** (lock-contention test skips when `mock.module` poisons the registry): RESPECTED. Story 3.2's tests do NOT use `mock.module` (the resume branch is in `runNext` and is testable in-process via `argv` injection).
- **Story 2.4 + Story 2.6 AR22 PARTIAL** (`Add` / `Pass` / `Configure` `hintOverride` verbs slip through registry CI gate): UNCHANGED. Story 3.2's 3 new hints all use `Run` / `See` verbs (no new `Pass` / `Add` / `Configure` introduced).
- **Story 2.8 dev-001** (smoke asserts on `## State delta` heading): RESPECTED. Story 3.2 does NOT modify the transcript markdown writer.
- **Story 2.8 dev-002** (cold-start state.yaml UX friction): RESPECTED. Story 3.2's tests inject seed state.yaml per Story 2.8's precedent at `run.test.ts:52-64`.

### Forward Dependencies

- **Story 3.6 (`--explain` reasoning trace)**: SECONDARY CONSUMER. The reasoning trace surfaces `state.lastAttempted.step` as "RESUMABLE: <step>" when present. Story 3.2's small `--explain` extension (Task 7.6) lays the groundwork.
- **Story 3.7 (`--list` candidate next-steps)**: SECONDARY CONSUMER. The candidate list may surface "RESUMABLE: <step>" for the candidate matching `state.lastAttempted.step`.
- **Story 3.8 (`--diff-state` and `--export-state`)**: SECONDARY CONSUMER. The `--export-state` JSON includes `lastAttempted` + `lastFailureReason` per architecture line 850; `--diff-state` may surface a divergence-warning when `recomputed.lastSuccessfulStep` advances past `cached.lastAttempted`.
- **Stories 4.x (loop runner)**: PRIMARY CONSUMER. The loop runner's per-iteration step-compute may invoke `--resume` on the first iteration after a halt to consume the cached failure context. Story 4.10 (`--resume hint at exit-time`) depends on Story 3.2's resume contract.
- **Stories 5.1-5.4 (failure-UX modes)**: SECONDARY CONSUMER. The four modes (retry / skip / route-to-fixer / escalate) all branch on `state.lastFailureReason.code`. Story 5.1 (retry) is a programmatic equivalent of `--resume`; it may compose with Story 3.2's `resolveResumeTarget` helper. Story 5.2 (skip) ADDS `--skip` to `NextArgsSchema` AND adds the cross-validation rejection per Story 3.2's AC line 754.
- **Story 5.2 (`--skip <step>`)**: PRIMARY OWNER of the AC-line-754 enforcement. When `--skip` is added to `NextArgsSchema`, Story 5.2 will simultaneously add the cross-validation that rejects `--resume + --skip`.
- **Story 6.x architecture-doc patch**: A future architecture-doc patch may align prose at lines 1212-1217 / 1373-1374 / 1393 / 1478 with the shipped `src/runs/` directory (Story 2.5 dev-001 carry-over). Story 3.2 does NOT introduce new architecture-doc divergences.

### Previous Story Intelligence

This story builds on:

- **Story 1.5 (Schemas + Migrations Skeleton)** — declared `lastAttempted` + `lastFailureReason` on `StateV1Schema` as optional + nullable. Story 3.2 reads these fields without modification.
- **Story 1.6 (State Subsystem — `loadState` / `saveState` / `recomputeState`)** — established `loadStateUnlocked(opts?)` for lock-free read paths. Story 3.2's resume branch uses `loadStateUnlocked` per the lock-free `run.ts` contract.
- **Story 1.7 (CLI Argument Parser)** — declared `resume: z.boolean().default(false)` on `NextArgsSchema`. Story 3.2 wires the runtime branch; NO args change.
- **Story 1.10 (DAG seed + 3-tier registry)** — established `build(...)` returning `DagAdjacency { nodes: Map<string, DagNode> }`. Story 3.2's "step in DAG?" check uses `dag.nodes.get(state.lastAttempted.step)`.
- **Story 1.11 (Persona Resolution)** — established `resolvePersona({ stepName, ... })`. Story 3.2's resume passes `state.lastAttempted.step` as the `stepName` (persona resolution is identical to a fresh attempt).
- **Story 2.2 (Dispatch Spec Generator)** — established `BuildDispatchSpecInput` with optional `epic?: number` + `story?: string` overrides. Story 3.2 uses these overrides on resume (Task 4).
- **Story 2.4 (`run.ts` lock-free runner)** — established the `runNext(opts?)` composition (parseNextArgs → cross-validate → forward-deferral guards → cleanStagingOrphans → doctor short-circuit → read-only flag handlers → dispatch happy path → outer try/catch translation). Story 3.2 INSERTS a NEW branch between `loadStateUnlocked` and `pickNextStep`.
- **Story 2.6 (`verify-and-advance.ts` with state-hash check)** — established the lock-acquiring complement to `run.ts`. Story 3.2 does NOT modify `verify-and-advance.ts` — the resume re-attempt flows through the same verify-and-advance path as a fresh attempt.
- **Story 2.7 (`commands/bmad-next.md` Layer 1 orchestrator)** — established the Bash → AR9 → Task → Bash → summary chain. Story 3.2 does NOT modify the Layer 1 markdown — the resume flow uses the SAME plumbing as a fresh dispatch.
- **Story 3.1 (Record `last_attempted` / `last_failure_reason` on Halt)** — PRIMARY DEPENDENCY. Wrote the canonical `state.lastAttempted` + `state.lastFailureReason` fields Story 3.2 reads. Without Story 3.1, the resume branch would have no source of truth.

Story 3.2 does NOT consume from:
- Stories 1.1-1.4, 1.8, 1.9, 1.12, 1.13 (repo scaffold, errors, logger, lock, branch detection, BMAD detection, doctor, quick-start docs) — these are independent prerequisites for `run.ts` but their public APIs are not touched by Story 3.2.
- Stories 2.1, 2.3, 2.5, 2.8 (verifier registry, sub-agent markdown, transcript writers, smoke test) — Story 3.2 doesn't touch the verifier surface, sub-agent prompt, transcript writer, or smoke test (the smoke does NOT exercise `--resume`).

## Dev Agent Record

### Context Reference

- `_bmad-output/implementation-artifacts/3-2-resume-flag.md` (this file)
- `src/commands/next/run.ts` (resume branch in runNext + resolveResumeTarget helper + NON_RECOVERABLE_FAILURE_CODES constant)
- `src/commands/next/run.test.ts` (resume coverage describe block)

### Agent Model Used

Opus 4.7 (1M context) — bmad-create-story sub-agent for Story 3.2

### Debug Log References

- Bun host: 1.3.12 (AR2 satisfied — Bun >= 1.3).
- Pre-implementation baseline confirmed at start: 563 pass / 0 fail / 2064 expects / 48 files.
- Post-implementation final: 577 pass / 0 fail / 2118 expects / 48 files (NO new test file added per Task 11 deferral).
- biome formatter applied to `run.test.ts` once during dev (formatter-only diff; no semantic changes).

### Completion Notes List

- **Implementation lands cleanly inside the story spec's allowed mutation surface.** Modified `src/commands/next/run.ts` (added 1 type import, 1 module-level constant, 1 helper function, 1 inline branch in `runNext`'s dispatch happy path, 1 inline branch in the `--explain` short-circuit, 0 changes to the AR9 emit shape) and `src/commands/next/run.test.ts` (appended 1 new `describe` block with 14 tests + a colocated `writeResumeState` factory).
- **NO new error classes.** All 3 resume-related throws (no-target / non-recoverable / missing-step) use the existing `ConfigError` class with `hintOverride` (Story 1.11 AC-2 + Story 1.10 AC-3 precedent). Registry CI gate stays at 16 codes.
- **NO state-yaml writes from `run.ts`.** Lock-free contract per architecture §line 1672 + AR8 preserved. Verified explicitly by Test L (state.yaml mtime + content byte-identical after resume).
- **NO new modules / NO Layer 1 markdown change / NO `verify-and-advance.ts` change / NO schema bump.** Story 3.2 is purely additive on the read side — Story 3.1 already shipped the WRITE side; Layer 1 already forwards `--last-attempted-json` per Story 3.1 Task 12.
- **AR22 verb discipline satisfied.** All 3 `hintOverride` strings start with `Run` / `Run` / `Run` (no new `Pass` / `Add` / `Configure` verbs introduced). All hints are single-line.
- **Recoverability allow-list verified.** `NON_RECOVERABLE_FAILURE_CODES = { "BMAD_INCOMPATIBLE", "BMAD_NOT_INSTALLED" }` (both exitCode 3 in `src/errors.ts:92-104`). The 14 OTHER codes in the registry are recoverable. When `state.lastFailureReason === null` (edge case: process killed between layers), the recoverability check is SKIPPED and resume proceeds with no failure-reason context block.
- **Best-effort resume-context entries.** `resolveResumeTarget` emits 0/1/2 `{ path, label }` entries pointing at `_bmad-output/.stepper/runs/<runId>/log.md` (failure transcript) and `_bmad-output/<planning|implementation>-artifacts/<step>.md` (last-attempt artifact path via `artifactPathForStep`). Files may not exist on disk; the sub-agent reads-or-creates per Story 2.1 `runVerifier` `required-files` check.
- **--explain extension shipped.** When `args.resume === true` is combined with `--explain`, the short-circuit handler calls `resolveResumeTarget(state, dag).node` instead of `pickNextStep`. Story 3.6 owns the full reasoning trace; Story 3.2 just verifies the resume target surfaces in the v0.1 explain stub.
- **--skip deferral documented (no enforcement).** Per epic AC line 754, `--resume + --skip` is rejected. Story 5.2 owns the `--skip` flag AND the cross-validation rejection. Story 3.2's `resolveResumeTarget` JSDoc documents the deferral; no enforcement code shipped (the flag doesn't exist in `NextArgsSchema` yet).
- **No deviations from spec.** Story 3.2 implementation matches the Tasks/Subtasks sequence verbatim. The OPTIONAL Task 11 integration test was DEFERRED per the spec's own Task 11.2 wording — the colocated `run.test.ts` tests cover the same surface.

### Test Counts (final)

- **bun run check**: exit 0.
- **Total**: 577 pass / 0 fail / 2118 expect() calls / 48 files.
- **Story 3.2 delta**: +14 tests / +54 expects / 0 new files (vs. Story 3.1 final baseline of 563 / 2064 / 48).
- **Resume-specific suite** (`bun test src/commands/next/run.test.ts`): 47 pass / 151 expects (33 pre-existing + 14 new resume).
- **Errors registry CI gate** (`bun test src/errors.test.ts`): 10 pass / 197 expects — registry stays at 16 codes.
- **Integration suite** (`bun test src/integration/`): 13 pass / 138 expects.
- **TypeScript** (`bunx tsc --noEmit`): exit 0.

### File List

#### Modified Files

- `src/commands/next/run.ts` — added `LastAttempted` type import (line 105 area); added `NON_RECOVERABLE_FAILURE_CODES` module-level constant (post `PHASE_ORDER`); added `ResolveResumeTargetResult` interface + `resolveResumeTarget(state, dag)` helper (between `pickNextStep` and `runNext`); added `args.resume` branch in `runNext` dispatch happy path (substitutes `nextStep`, captures `resumeContextRefs` + `resumeEpicOverride` + `resumeStoryOverride`); extended `buildContextRefs` call site with `finalContextRefs` append; extended `buildDispatchSpec` call site with optional epic+story override; extended `--explain` short-circuit to honor `args.resume`. ~860 → ~990 lines.
- `src/commands/next/run.test.ts` — appended `describe("runNext — Story 3.2 --resume flag", ...)` block with 14 test cases + a colocated `writeResumeState(...)` factory. Reuses module-level `tmp` setup, `writeMinimalState`, `commonOpts`. ~760 → ~1090 lines.

#### Sprint Status

- `_bmad-output/implementation-artifacts/sprint-status.yaml` — flipped `3-2-resume-flag` from `ready-for-dev` → `review` (intermediate `in-progress` during dev-story workflow per Step 4). `epic-3` remains `in-progress`.

#### Story File

- `_bmad-output/implementation-artifacts/3-2-resume-flag.md` — Tasks/Subtasks all marked `[x]`, frontmatter status flipped to `review`, Dev Agent Record / Test Counts / File List / Change Log populated.

#### NOT Modified (per spec)

- `src/commands/next/args.ts` — `--resume` already declared by Story 1.7.
- `src/errors.ts` — registry stays at 16 codes (no new error class).
- `src/schemas/state.ts` — `LastAttempted` + `LastFailureReason` already extracted by Story 3.1.
- `src/dispatch/generate-spec.ts` — `BuildDispatchSpecInput` already exposes optional `epic` / `story` per Story 2.2 dev-001.
- `src/state/load.ts` — `loadStateUnlocked` already exposed per Story 1.6 + Story 2.4.
- `src/commands/next/verify-and-advance.ts` — Story 3.2 does NOT touch the lock-held runner.
- `commands/bmad-next.md` — Layer 1 markdown already forwards `--last-attempted-json` per Story 3.1 Task 12.

## Senior Developer Review (AI)

**Reviewer**: bmad-code-review (Opus 4.7 1M context)
**Date**: 2026-04-30
**Verdict**: **APPROVE** (status: review → done)

### Outcome

The implementation lands cleanly inside the spec's allowed mutation surface. Every Acceptance Criterion is delivered with high fidelity to the AC wording; AR8/AR9/AR21/AR22/AR41 invariants are preserved; quality gates reproduce green. **No findings of any severity.** Zero deviations from spec — Tasks 0-13 implemented verbatim.

### Findings

| Severity | Count |
| --- | --- |
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 0 |
| Info | 0 |

### AC Verdicts (verbatim from epics.md lines 738-754)

- **AC-1 (happy path: re-dispatch with failure context in CONTEXT section)** — **PASS**. `resolveResumeTarget` (`run.ts:608-682`) substitutes `state.lastAttempted.step` for `pickNextStep`; `dispatchSpec.epic + .story` overrides forwarded explicitly at lines 952-957; resume-context append at line 932-934 injects 2 entries (failure transcript path under `_bmad-output/.stepper/runs/<runId>/log.md` + last-attempt artifact path) into `taskSpec.context[]`. Tests at `run.test.ts:815-896` verify all five surfaces (target step, epic+story carry, runId, label, path).
- **AC-1 recoverability gate (deny `BMAD_INCOMPATIBLE` + `BMAD_NOT_INSTALLED`)** — **PASS**. `NON_RECOVERABLE_FAILURE_CODES` (`run.ts:153-156`) is exactly the AC-named set; both codes carry `exitCode 3` per `errors.ts:92-104`. Recoverability throws verbatim hint per AC at `run.ts:631-636`. Tests `run.test.ts:921-966` cover both codes.
- **AC-2 (missing `lastAttempted` halts with verbatim hint)** — **PASS**. Throw at `run.ts:614-618`; hint string `No prior halt to resume from. Run /bmad-next to advance to the next step.` is character-identical to AC line 751. Test `run.test.ts:900-917` asserts exact string match + exitCode 2 + action `halt`.
- **AC-3 (`--resume + --skip` rejection deferred to Story 5.2)** — **DEFERRED-DOCUMENTED**. `--skip` is not in `NextArgsSchema` (Story 1.7's 18-flag inventory); spec correctly defers enforcement to Story 5.2 (which will land both the flag AND the cross-validation). JSDoc at `run.ts:593-595` documents the deferral. Acceptable.

### Cross-Cutting Architecture Verdicts

- **AR8 (lock-free `run.ts` preserved)** — **PASS**. No `loadState(`, `saveState(`, or `acquire(` call sites in executable code (Grep confirmed; references at lines 21+715 are JSDoc only). Test `run.test.ts:1149-1172` verifies state.yaml byte-stable (mtime + content) after `--resume`.
- **AR9 (single AR9 line emit per invocation)** — **PASS**. Exactly one `emitDispatchAction()` call site at `run.ts:1068` (inside `import.meta.main`). Resume path returns through standard `runNext` → `emitDispatchAction` chain. Test `run.test.ts:1201-1223` round-trips the resume-emitted action through `DispatchActionV1Schema`.
- **AR21 + AR22 (errors carry code + actionable hint with `Run/See/Try/Check` verb)** — **PASS**. All 3 new throws use `ConfigError` with `hintOverride` (Story 1.11 AC-2 precedent). All 3 hints are single-line and start with `Run` (no new `Pass/Add/Configure` verbs introduced).
- **AR41 (no new forbidden imports)** — **PASS**. The only new import (`LastAttempted` type from `../../schemas/state.ts`) is foundational-tier (allowed). Programmatic boundary check at `run.test.ts:606-638` covers `lock/`, `state/save`, `snapshot/`, `node:child_process`, `loadState(`, `saveState(`.

### Quality Gate Reproduction

| Gate | Expected | Observed |
| --- | --- | --- |
| `bun run check` | 577/0/2118/48 | **577 pass / 0 fail / 2118 expects / 48 files** ✓ |
| `bunx tsc --noEmit` | exit 0 | **exit 0** ✓ |
| AR41 boundary Grep | no matches | **no matches** ✓ |
| Recoverability allow-list | `{BMAD_INCOMPATIBLE, BMAD_NOT_INSTALLED}` | **exact match** at `run.ts:153-156` ✓ |
| `bun test src/commands/next/run.test.ts` | 47/0/151 | **47 pass / 0 fail / 151 expects** ✓ |

### Strengths

- **Zero-deviation execution**: 13 task groups completed verbatim against spec; no scope creep.
- **Defence-in-depth on the resume tuple**: explicit `epic+story` overrides at the `buildDispatchSpec` call site (technically redundant with `generate-spec.ts:172-177`'s `lastAttempted ?? lastSuccessfulStep` preference, but makes intent explicit at runner tier).
- **Best-effort context entries**: `resolveResumeTarget` emits canonical paths without filesystem touch — sub-agent surfaces missing files via `runVerifier required-files` per Story 2.1 contract.
- **Test depth beyond AC**: 14 tests cover all 3 ACs, 4 edge cases (lastFailureReason null; step not in DAG; bypass pickNextStep; nowIso injection), 2 combo flags (`--resume + --dry-run`, `--resume + --explain`), the lock-free invariant, and Zod defence-in-depth on a malformed `lastAttempted` shape.
- **AR22 verb hygiene**: all 3 new hints lead with `Run`; no new ratification carry-overs introduced.

### Carry-overs

None new. Story 3.2 respects every Story 3.1 + Epic-2-retrospective carry-over (documented at `3-2-resume-flag.md:506-524`). The `--skip` cross-validation correctly inherits to Story 5.2 per AC line 754. The `--explain` short-circuit's resume-aware branch (3-line extension) is the v0.1 stub; full reasoning trace remains owned by Story 3.6.

### Approval

Story status flipped `review → done`. `sprint-status.yaml` flipped `3-2-resume-flag: review → done`. Ready to advance to Story 3.3 per the standard Epic-3 sequence.

## Change Log

| Date       | Author                | Change                                       |
| ---------- | --------------------- | -------------------------------------------- |
| 2026-04-30 | bmad-create-story | Initial story file created from epics.md §3.2 |
| 2026-04-30 | bmad-dev-story | `--resume` runtime branch + 14-test coverage; 577/0/2118; status → review |
| 2026-04-30 | bmad-code-review | Senior Developer Review (AI) — APPROVE with 0 findings; status → done |
