---
status: done
story_id: '2.6'
story_key: 2-6-verify-and-advance-ts-with-state-hash-check
epic: '2'
title: '`verify-and-advance.ts` with State-Hash Check'
created: '2026-05-01'
last_updated: '2026-05-01T08:00:00Z'
priority: M
estimated_effort: L
fr_coverage:
  - FR1
  - FR5
  - FR16
  - FR17
  - FR18
  - FR32
  - FR43
  - FR44
  - FR46
  - FR53
  - FR54
nfr_coverage:
  - NFR-P3
  - NFR-P4
  - NFR-S1
  - NFR-S2
  - NFR-S4
  - NFR-S5
  - NFR-R1
  - NFR-R4
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
  - _bmad-output/implementation-artifacts/epic-1-retrospective.md
  - _bmad-output/implementation-artifacts/2-1-verifier-configuration-registry.md
  - _bmad-output/implementation-artifacts/2-2-dispatch-spec-generator.md
  - _bmad-output/implementation-artifacts/2-3-generic-sub-agent-bmad-step-runner-md.md
  - _bmad-output/implementation-artifacts/2-4-lock-free-run-ts-for-bmad-next.md
  - _bmad-output/implementation-artifacts/2-5-markdown-transcript-json-run-log-writers.md
  - _bmad-output/implementation-artifacts/1-12-bmad-next-doctor-command.md
  - _bmad-output/implementation-artifacts/1-6-state-subsystem-load-save-recompute-skeleton.md
  - _bmad-output/implementation-artifacts/1-5-schemas-migrations-skeleton.md
  - _bmad-output/implementation-artifacts/1-4-file-lock-with-heartbeat.md
  - _bmad-output/implementation-artifacts/1-3-logger-path-helpers-atomic-write.md
  - src/errors.ts
  - src/io/log.ts
  - src/io/paths.ts
  - src/io/atomic-write.ts
  - src/lock/lock.ts
  - src/state/load.ts
  - src/state/save.ts
  - src/schemas/state.ts
  - src/schemas/dispatch-spec.ts
  - src/schemas/dispatch-protocol.ts
  - src/schemas/verifier-result.ts
  - src/schemas/run-log.ts
  - src/dispatch/index.ts
  - src/dispatch/generate-spec.ts
  - src/dispatch/staging-cleanup.ts
  - src/verifiers/index.ts
  - src/verifiers/checks.ts
  - src/runs/index.ts
  - src/runs/types.ts
  - src/runs/write-step.ts
  - src/commands/next/run.ts
  - src/commands/next/index.ts
  - src/commands/doctor/run.ts
---

# Story 2.6: `verify-and-advance.ts` with State-Hash Check

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper user,
I want the post-dispatch step (verifier + atomic promote + state advance) to acquire the lock and re-validate state-hash before commit,
So that TOCTOU between dispatch-time and verify-time cannot corrupt state.

## Context Summary

This is the **sixth story of Epic 2 (Single-Step Advance with Sub-Agent Dispatch)** and lands the **POST-DISPATCH LOCK-HOLDING RUNNER** — `src/commands/next/verify-and-advance.ts` — that complements Story 2.4's lock-free pre-dispatch runner. Together Stories 2.4 + 2.6 close the **dispatch-then-verify loop** that the architecture's Coherence Validation Correction 1 (architecture line 1672 + AR8) prescribes:

- **Story 2.4 (DONE)** — `src/commands/next/run.ts` is **read-only and lock-free**. It reads state via `loadStateUnlocked`, builds the dispatch spec under `staging/<runId>/dispatch-spec.json`, emits the AR9 stdout JSON line `{ "action": "dispatch", "runId": "...", "agent": "bmad-step-runner", "exitCode": 0 }`, and exits — releasing the process so Layer 1's slash-command markdown can dispatch the (5+ minute) sub-agent via Task **without holding the project lock**.
- **Story 2.6 (this story)** — `src/commands/next/verify-and-advance.ts` is the **lock-acquiring complement**. After Layer 1 receives the sub-agent's output and captures token counts, it invokes `bun run src/commands/next/verify-and-advance.ts -- --run-id <id> --tokens-in <n> --tokens-out <n>` (architecture line 1471 + Critical Gap Resolution 6 line 1677). This second process:
  1. Acquires the project lock via Story 1.4's `acquire()` (architecture line 1474).
  2. Reads `state.yaml` via Story 1.6's `loadState` (under the held lock).
  3. Re-computes a stable hash over `(lastSuccessfulStep, lastAttempted)` and compares it against the snapshot persisted at dispatch-time (architecture line 1673 — TOCTOU detection).
  4. On hash match + verifier pass: promotes the artifact from `staging/<runId>/outputs/` to its canonical location via the new `src/dispatch/promote.ts` (Story 2.2 deferred deliverable per architecture line 1178).
  5. Atomically updates `state.yaml` via Story 1.6's `saveState(state, lockHandle)` — appends to `runHistory[]`, advances `lastSuccessfulStep`, clears `lastAttempted`.
  6. Writes the markdown transcript + JSON run log via Story 2.5's `writeStepTranscript` (architecture line 1478 + dev-001 directory rename: import path is `src/runs/`, NOT `src/transcript/`).
  7. Releases the lock in `finally` per AR8 + architecture line 1479.
  8. Emits the AR9 summary stdout JSON line per FR18.

This story is **structurally pivotal** in three ways:

- It is the **FIRST lock-acquiring runner** of the project. Story 1.12 (`/bmad-next --doctor`) was the first integration command but operates lock-free on read-only inputs. Story 2.4 (`run.ts`) is the lock-free pre-dispatch composer. Story 2.6 introduces the lock-held write surface — every state-mutating command that follows (Story 4.1's `/bmad-loop` commit phase, Story 5.*'s failure-UX engine writes) inherits the `acquire() → try { … } finally { release() }` pattern Story 2.6 establishes.
- It is the **FIRST consumer of the existing `StateChangedDuringDispatchError` registry entry**. Per `src/errors.ts:164-169`, the error class is **already registered** (16-code registry stable since Story 1.5; the slot was reserved by architecture Critical Gap Resolution 3 line 1674 alongside the lock-free / state-hash decisions). Story 2.6 wires the **first throw site** for this code; the registry stays at 16 entries.
- It is the **FIRST canonical caller of Story 2.5's `writeStepTranscript`** (per Story 2.5's Forward Dependencies "PRIMARY CALLER" + Story 2.4's Senior Dev Carry-overs line 1092). Story 2.5 ships the writer as a standalone callable surface; Story 2.6 wires the call inside the `finally` block (transcript writes happen on EVERY exit path — pass, fail, halt — so the audit trail is complete regardless of outcome).

Concretely, this story produces:

1. **`src/commands/next/verify-and-advance.ts`** (NEW) — the canonical lock-acquiring runner. Public testable surface: `runVerifyAndAdvance(opts: RunVerifyAndAdvanceOptions): Promise<VerifyAndAdvanceResult>` returning `{ exitCode, action }` where `action` is the AR9 `DispatchActionV1`. The orchestrator: (a) parses argv via a thin `parseVerifyAndAdvanceArgs` helper that requires `--run-id <id>` plus token counts; (b) acquires the lock via `acquire()` (Story 1.4); (c) reads state via `loadState({ lockOptions: ... })` — Story 1.6's locked variant accepts the lock options and re-uses the same lockDir, but per Story 1.6's contract `loadState` itself acquires + releases the lock on its own; the orchestrator instead uses `loadStateUnlocked` AFTER `acquire()` to avoid double-locking; (d) reads the dispatch-spec via `Bun.file(staging/<runId>/dispatch-spec.json).json()` + Zod-parses with `DispatchSpecV1Schema`; (e) computes the state-hash, compares; (f) on mismatch throws `StateChangedDuringDispatchError`; (g) on match, runs `runVerifier` (Story 2.1); (h) on verifier pass: invokes `promote()` (NEW — `src/dispatch/promote.ts`); appends to `runHistory[]`; advances `state.lastSuccessfulStep`; clears `state.lastAttempted`; calls `saveState(state, handle)`; (i) reads the sub-agent output from `staging/<runId>/outputs/` to compose the `TranscriptInput`; calls `writeStepTranscript` (Story 2.5); (j) releases the lock in `finally`; (k) emits the AR9 line + exits.
2. **`src/commands/next/verify-and-advance.test.ts`** (NEW) — colocated tests per AR35. Tmpdir-per-test isolation. ~14-20 test cases covering AC-1 (state-hash match → verifier pass → promote → state advance), AC-2 (state-hash match + verifier pass → atomic copy + .bak rotation + tokens recorded + lock release), AC-3 (state-hash mismatch → STATE_CHANGED_DURING_DISPATCH error + exit 1 + hint verbatim), AC-4 (transcript + run log written via Story 2.5 writers), AC-5 (integration test exercises the TOCTOU mismatch path), the lock-acquired invariant (mock-spy on `acquire` confirms exactly ONE call per `runVerifyAndAdvance`), the lock-release-on-error invariant (an error mid-flow STILL calls `handle.release()` per `try/finally`), and the AR41 boundary check (top-tier import boundary).
3. **`src/dispatch/promote.ts`** (NEW) — the **Story 2.2 deferred deliverable** (architecture line 1178 + Story 2.2 deferral note line 93). Public surface: `promote(input: PromoteInput): Promise<PromoteResult>` performs an **atomic copy** of the artifact from `staging/<runId>/outputs/<step>.<ext>` to its canonical location under `_bmad-output/<phase>-artifacts/<step>.<ext>`. Uses `atomicWrite` (Story 1.3) for byte-identical destination + `.bak` rotation (NFR-S5). Returns `{ promotedTo, sourcePath, bytes }` — the canonical path the caller (Story 2.6) records into the `verifier-result.json` `promotedTo` field (per architecture §P5 line 913 + Story 2.1 v0.1 default that always sets `promotedTo: null`). Promotion writes a `staging/<runId>/completion-marker.json` (Story 2.2 cleanup contract — `cleanStagingOrphans` retains staging dirs that have a marker per `staging-cleanup.ts:42`); the marker carries `{ promotedAt, promotedTo, runId, step }` for the 24-hour retention semantics per architecture §P5 line 917.
4. **`src/dispatch/promote.test.ts`** (NEW) — colocated tests for `promote()` (~6-10 cases): atomic copy succeeds (byte-identical destination); `.bak` rotation occurs on overwrite; missing source artifact throws `VerifierFailureError` with hint; out-of-scope destination throws `ScopeViolationError`; completion-marker.json is written; the `<phase>-artifacts/<step>.<ext>` path mapping is correct for both `planning-artifacts` (PRD/architecture/UX/research/brainstorming) and `implementation-artifacts` (story-create/dev-story/code-review/retro).
5. **`src/dispatch/index.ts`** (MODIFIED) — extends the existing barrel to add `promote`, `PromoteInput`, `PromoteResult` from `./promote.ts`. +3 lines. Per Story 2.2's architecture compliance pattern (`./types.ts` + `./generate-spec.ts` + `./emit.ts` + `./staging-cleanup.ts` re-exports already present).
6. **`src/commands/next/index.ts`** (MODIFIED) — extends the Story 1.7 + Story 2.4 barrel to add `runVerifyAndAdvance`, `RunVerifyAndAdvanceOptions`, `VerifyAndAdvanceResult` from `./verify-and-advance.ts`. +3 lines.
7. **`src/commands/next/args.ts`** (MODIFIED) — extends the Story 1.7 args parser to support a NEW `parseVerifyAndAdvanceArgs(argv): Result<VerifyAndAdvanceArgs, ParseError>` function that requires `--run-id <id>`, `--tokens-in <n>`, `--tokens-out <n>` (epic line 694 step 5). The existing `parseNextArgs` is invariant (Story 2.7's slash-command markdown invokes it for `run.ts` and `parseVerifyAndAdvanceArgs` for `verify-and-advance.ts`). +30-50 lines.
8. **`src/commands/next/args.test.ts`** (MODIFIED) — adds 3-5 new tests for `parseVerifyAndAdvanceArgs` (happy path; missing `--run-id`; non-numeric tokens; trailing/leading whitespace tolerance).

This story exercises the **FULL** AR8 + AR41 + AR9 + AR12 + AR25 + AR26 contracts in a single end-to-end runner — the highest composition surface of any story to date (mid-tier `state/`, `lock/`, `runs/`; higher-tier `dispatch/`, `verifiers/`; top-tier sibling `next/run.ts` for sibling-runner pattern reuse). Estimated effort: **L** (large — second runner-tier integration story; new `promote.ts` module; AR12 lock-handle propagation; first `StateChangedDuringDispatchError` throw site; first canonical `writeStepTranscript` caller).

It does **NOT**:

- Implement Layer 1 markdown (`commands/bmad-next.md` body). Story 2.7 owns the slash-command body that wires `Bash → JSON-line → Task → Bash → summary`. Story 2.6 ships only the Layer 2 entrypoint that Layer 1 invokes via `bun run`.
- Implement the **end-to-end happy-path smoke test**. That is **Story 2.8** — runs the full `/bmad-next` from slash command to state advance. Story 2.6 ships colocated tests + an integration TOCTOU test (AC-5); the canonical end-to-end exercise lives in Story 2.8.
- Implement the **failure-UX engine** (Stories 5.1-5.4). On verifier `status: "fail"`, Story 2.6 v0.1 emits `action: "halt"` with `VerifierFailureError.actionableHint` ("See _bmad-output/.stepper/runs/<ts>-<step>.log for the verifier output; try /bmad-next --resume after fixing the underlying issue.") AND writes the transcript + run log to capture the failure for forensics. The structured failure-UX modes (retry / skip / route-to-fixer / escalate) live in Epic 5; Story 2.6 v0.1 simply halts.
- Implement the **`--resume` semantics** (Story 3.2). Story 2.6 reads `state.lastAttempted` defensively but does NOT re-dispatch on resume; the `--resume` flag is owned by Story 3.2 + Story 2.4's `run.ts` (which constructs the resume-context dispatch-spec).
- Implement the **`STATE_CHANGED_DURING_DISPATCH` registry registration**. The class is **ALREADY REGISTERED** at `src/errors.ts:164-169` (architecture Critical Gap Resolution 3 line 1674 — the slot was reserved during Story 1.5's schema-skeleton work; registry stayed at 16 codes through every Epic-1 story). Story 2.6 wires the **first throw site**; the registry CI gate (`src/errors.test.ts`) already covers the class. **Registry stays at 16 codes.**
- Implement the **state-hash snapshot WRITE-side**. Per Story 2.4's dev-001 carry-over (carry-forward to Story 2.6) + Story 2.2 §line 500 architecture-compliance note: the dispatch-spec.json `stateHash` field is NOT yet declared in Story 1.5's `DispatchSpecV1Schema`. Story 2.6 has TWO design options:
  - **Option A (Story 2.6 v0.1, recommended)**: compute the hash from the dispatch-spec contents + the state at dispatch-time IS the state captured implicitly via `(state.lastSuccessfulStep, state.lastAttempted)` at the moment the dispatch-spec was written. Story 2.4 already writes the dispatch-spec with the runner-tier-resolved fields (`epic`, `story`, `step`, `runId`); Story 2.6 reads the dispatch-spec, reads CURRENT state, hashes both `(currentLastSuccessfulStep, currentLastAttempted)` and `(dispatchSpec.epic, dispatchSpec.story)` — IF the dispatch-spec's epic/story diverges from current state, the user's state advanced during dispatch (TOCTOU). This is the **AC-1-conformant** v0.1 approach: the hash compares the dispatch-spec's projection of state vs the current state.
  - **Option B (deferred to Story 6.x)**: ratify a `DispatchSpecV2Schema` that adds an explicit `stateHash: string` field. Story 2.4 would compute the hash at dispatch-time and persist; Story 2.6 would compare. Cleaner contract but requires schema bump.
  - **Selected for v0.1**: Option A. The architecture line 1673 specification reads "re-computes a stable hash over `(lastSuccessfulStep, lastAttempted)` and compares to the snapshot stored in `staging/<run-id>/dispatch-spec.json`" — but the v1 schema has neither `stateHash` nor `lastSuccessfulStep` / `lastAttempted` fields. Story 2.6 v0.1 implements the SPIRIT of the AC by hashing `(state.lastSuccessfulStep, state.lastAttempted)` at verify-time and comparing against the dispatch-spec's `(dispatchSpec.epic, dispatchSpec.story)` projection — divergence indicates state advanced during dispatch. A future Story 6.x DispatchSpecV2 schema bump may add the explicit `stateHash` field; Story 2.6 v0.1 ships without the schema bump.
- Add **`--watch`** integration (Story 3.9). The transcript is written to disk, but `--watch` (live tail) is Story 3.9's `src/runs/watch.ts` consumer.
- Add **archive rotation**. NFR-Sc4 90-day archive is Story 6.8 + `src/runs/archive.ts`.
- Add **telemetry collection**. FR45 telemetry aggregation is Story 6.7 + `src/telemetry/`. Story 2.6 ships only the per-step run-log JSON; the aggregation lives in Story 6.7.

It DOES land:

- The architecturally-prescribed `src/commands/next/verify-and-advance.ts` per architecture §line 1107 directory listing + §line 1471-1481 sequence.
- The lock-acquiring runner pattern per AR8 + architecture line 1672 (Coherence Validation Correction 1) — the **lock-held write surface** complementing Story 2.4's lock-free read surface.
- The state-hash TOCTOU check per architecture line 1673 (Coherence Validation Correction 2) — the **first throw site** for `StateChangedDuringDispatchError`.
- The `src/dispatch/promote.ts` per architecture §line 1178 directory listing + Story 2.2 deferral note line 93 — the canonical post-verify atomic-copy surface.
- The `writeStepTranscript` wiring per architecture §line 1478 + Story 2.5 PRIMARY CALLER carry-over — the **first canonical caller** of Story 2.5's writer, executed in the `finally` block so the audit trail is complete on every exit path.
- The `runVerifier` (Story 2.1) wiring per architecture §line 1475 + Story 2.1 PRIMARY CONSUMER carry-over — the **first canonical caller** of Story 2.1's verifier from the runner tier.
- The Story 2.1 dev-002 carry-over closure (`runVerifier` `stagingRoot` REQUIRED → optional) — Story 2.6 either (a) keeps `stagingRoot` as `STAGING_PATH` default + passes explicit `stepName` per the v0.1 contract, OR (b) extends `runVerifier` to read `staging/<runId>/dispatch-spec.json` directly (the deferred Story 2.6 polish PR per Story 2.1 line 715). v0.1 Story 2.6 chooses **(a)** — the polish PR (option (b)) is lower-priority and can be a follow-up Story 6.x.
- The token-count threading per architecture Critical Gap Resolution 6 line 1677 + epic spec line 694 step 5 — `verify-and-advance.ts` receives `--tokens-in <n> --tokens-out <n>` from Layer 1's slash-command markdown (Story 2.7 wires the capture); writes them into both the run-log JSON `tokensIn`/`tokensOut` fields (Story 2.5 surface) AND a new `runHistory[]` entry on `state.yaml` per FR5 + AR12.
- The AR9 `action: "report"` summary per FR18 — `verify-and-advance.ts` emits ONE JSON line on stdout describing the final outcome (`promoted to <path>` on pass; halt-with-hint on fail / mismatch).
- AR12 read-modify-write under held lock — `state.yaml` is read AFTER `acquire()` and written via `saveState(state, handle)` (Story 1.6's API enforces this architecturally — calling `saveState` without a `LockHandle` is uncompilable).
- AR25 markdown transcript + AR26 JSON run log — written via Story 2.5's `writeStepTranscript` on every exit path (`finally` block placement).
- AR41 top-tier import boundary — `src/commands/next/verify-and-advance.ts` may import from EVERY tier (foundational + mid-tier + higher-tier + top-tier siblings). Forbidden: `node:child_process` (use `Bun.spawn` if ever needed; v0.1 doesn't); any new external runtime dep beyond `zod` (transitively pulled).

## Acceptance Criteria

The acceptance criteria below are reproduced **verbatim** from `_bmad-output/planning-artifacts/epics.md` §Story 2.6 (lines 664-682, BDD Given/When/Then format). Lines and AC labelling preserved.

**Given** `src/commands/next/verify-and-advance.ts` invoked with `--run-id <id> --tokens-in <n> --tokens-out <n>`
**When** invoked
**Then** it acquires `state.yaml.lock`, reads `state.yaml`, computes a stable hash over `(lastSuccessfulStep, lastAttempted)`, and compares to the snapshot stored in `staging/<run-id>/dispatch-spec.json` at dispatch-time
**Given** the hashes match
**When** verifier passes
**Then** the artifact is promoted from `staging/<run-id>/outputs/` to its canonical location (atomic copy + atomic state.yaml update with `.bak` rotation), tokens are recorded into `runHistory[]`, lock is released in `finally`
**Given** the hashes mismatch
**When** verify-and-advance runs
**Then** it exits with `STATE_CHANGED_DURING_DISPATCH` (exit code 1) and the hint `Run /bmad-next --diff-state to see what changed and /bmad-next --resume to retry from the current state.`
**And** transcript + run log are written via Story 2.5 writers
**And** integration test exercises the TOCTOU mismatch path

## Tasks / Subtasks

- [x] **Task 0 — Verify pre-conditions (AC: all)**
  - [x] 0.1 Confirm Story 2.5 (`src/runs/`) is `done` per `_bmad-output/implementation-artifacts/sprint-status.yaml` (`2-5-markdown-transcript-json-run-log-writers: done`). Confirm Story 2.4 (`src/commands/next/run.ts`) is `done`. Confirm Story 2.3 (`agents/bmad-step-runner.md`) is `done`. Confirm Story 2.2 (`src/dispatch/`) is `done`. Confirm Story 2.1 (`src/verifiers/`) is `done`. Confirm `src/commands/next/verify-and-advance.ts` does NOT yet exist. Confirm `src/commands/next/verify-and-advance.test.ts` does NOT yet exist. Confirm `src/dispatch/promote.ts` does NOT yet exist.
  - [x] 0.2 Confirm `src/errors.ts` registry stays at **16 codes** with `StateChangedDuringDispatchError` ALREADY REGISTERED at `src/errors.ts:164-169` (architecture Critical Gap Resolution 3 line 1674 — the slot was reserved during Story 1.5's schema-skeleton work). Story 2.6 wires the **first throw site** for this code; the registry CI gate (`src/errors.test.ts`) already covers the class. Verify by `Grep` for `^export class StateChangedDuringDispatchError` in `src/errors.ts`.
  - [x] 0.3 Confirm `src/lock/lock.ts` exports `acquire(opts?: LockOptions): Promise<LockHandle>` AND `LockOptions`, `LockHandle`. Story 2.6 imports `acquire` ONLY (calls `await acquire()` once at the top of `runVerifyAndAdvance`; releases via `handle.release()` in the `finally` block).
  - [x] 0.4 Confirm `src/state/load.ts` exports `loadStateUnlocked` and `loadState`. Story 2.6 acquires the lock manually then uses `loadStateUnlocked` to AVOID double-locking (calling `loadState` after `acquire()` would attempt to acquire a second time and throw `LockContentionError`). Verify by reading `src/state/load.ts:166`.
  - [x] 0.5 Confirm `src/state/save.ts` exports `saveState(state, lockHandle, opts?): Promise<void>` per Story 1.6. The `lockHandle` is REQUIRED in the TypeScript signature — calling `saveState` without it is uncompilable (NFR-S5 architectural enforcement). Story 2.6 passes the `handle` from `acquire()` directly. Verify by reading `src/state/save.ts:68-91`.
  - [x] 0.6 Confirm `src/dispatch/index.ts` exports `buildDispatchSpec`, `emitDispatchAction`, `cleanStagingOrphans`. Story 2.6 imports `cleanStagingOrphans` (per Story 2.2 §Tasks 7.5 — Story 2.6 may also call it; the function is idempotent). Story 2.6 also imports `emitDispatchAction` for the AR9 summary line. Story 2.6 ADDS `promote` + `PromoteInput` + `PromoteResult` exports to this barrel via Task 9.
  - [x] 0.7 Confirm `src/verifiers/index.ts` exports `runVerifier`, `RunVerifierOptions`, `RunVerifierResult`. Story 2.6 imports `runVerifier` and calls it with `{ stepName: dispatchSpec.step, stagingRoot: opts?.stagingRoot }` per Story 2.1 dev-002 v0.1 contract.
  - [x] 0.8 Confirm `src/runs/index.ts` exports `writeStepTranscript`, `WriteStepTranscriptInput`, `WriteStepTranscriptResult`, `TranscriptInput` (per Story 2.5 dev-001 directory rename — `src/runs/` NOT `src/transcript/`). Story 2.6 imports `writeStepTranscript` and calls it in the `finally` block with the constructed `TranscriptInput`.
  - [x] 0.9 Confirm `src/schemas/dispatch-spec.ts` exports `DispatchSpecV1Schema`, `DispatchSpecV1`. Story 2.6 imports `DispatchSpecV1Schema` for defence-in-depth Zod parse on the read-from-disk dispatch-spec.
  - [x] 0.10 Confirm `src/schemas/dispatch-protocol.ts` exports `DispatchActionV1Schema`, `DispatchActionV1`. Story 2.6 imports `DispatchActionV1` for the typed AR9 emit shape (transitively via `emitDispatchAction`).
  - [x] 0.11 Confirm `src/schemas/state.ts` exports `State`, `StateV1Schema`, `RunHistoryEntry` (or equivalent — verify the field name). Story 2.6 reads + writes `state.runHistory[]` per FR5 + epic AC line 677 ("tokens are recorded into `runHistory[]`").
  - [x] 0.12 Confirm `src/io/atomic-write.ts` exports `atomicWrite(path, contents): Promise<void>`. Story 2.6 (transitively via `promote.ts`) uses `atomicWrite` for the canonical-path destination + `.bak` rotation per NFR-S5.
  - [x] 0.13 Confirm `src/io/paths.ts` exports `STAGING_PATH`, `BMAD_OUTPUT_ROOT`, `STEPPER_INTERNAL_ROOT`, `assertWithinScope`. Story 2.6's `promote.ts` uses `BMAD_OUTPUT_ROOT` for the canonical-artifact destination root.
  - [x] 0.14 Confirm `src/io/log.ts` exports `info`, `warn`, `error`, `json`. Story 2.6 uses `info`/`warn`/`error` for stderr diagnostics; `json` is invoked transitively via `emitDispatchAction` for the AR9 stdout line.
  - [x] 0.15 Confirm `src/commands/next/args.ts` exports `parseNextArgs(argv): Result<NextArgs, ParseError>` (Story 1.7) AND the `Result<T, E>` + `ParseError` types. Story 2.6 EXTENDS `args.ts` to add `parseVerifyAndAdvanceArgs(argv): Result<VerifyAndAdvanceArgs, ParseError>` per Task 4 — the existing `parseNextArgs` is invariant (Story 2.7 wires both functions to Layer 1 markdown).
  - [x] 0.16 Confirm `src/commands/next/run.ts` exports `runNext`, `RunNextOptions`, `NextResult` (Story 2.4). Story 2.6 does NOT import `runNext` directly — but Task 4 mirrors `RunNextOptions`'s test-injection-escape-hatch shape for `RunVerifyAndAdvanceOptions` (deterministic tmpdir tests).
  - [x] 0.17 Read epics.md Story 2.6 §lines 664-682 verbatim. Confirm the AC text in §Acceptance Criteria above is character-identical.
  - [x] 0.18 Read architecture.md §line 1107 (`verify-and-advance.ts` directory listing); §line 1178 (`promote.ts` directory listing); §lines 1471-1481 (Layer 2 verify-and-advance.ts sequence: acquire → runVerifier → promote+advanceState → write transcript → release → emit summary → exit); §line 1294-1302 (AR41 top-tier import boundary); §line 1672 (Coherence Validation Correction 1 — lock-free run.ts / lock-held verify-and-advance); §line 1673 (Coherence Validation Correction 2 — state-hash check); §line 1674 (Critical Gap Resolution 3 — STATE_CHANGED_DURING_DISPATCH registered); §line 1677 (Critical Gap Resolution 6 — token counts threaded via positional flags); §line 1478 (verify-and-advance.ts step 4 — write transcript markdown + JSON via src/transcript/ — modulo Story 2.5 dev-001 rename to src/runs/).
  - [x] 0.19 Read prd.md §FR1 line 681 (compute next step zero-config); §FR5 line 678 (state.yaml updates with runHistory[]); §FR16 line 689 (sub-agent dispatch with budget+timeout); §FR17 line 690 (verifier on every sub-agent output); §FR18 line 691 (one human-readable line per step); §FR32 line 715 (actionable error on halt); §FR43 line 728 (markdown transcript per step); §FR44 line 729 (JSON run log per step); §FR46 line 731 (single-line + full-detail errors); §FR53 line 744 (exit codes 0-5); §FR54 line 745 (stdout/stderr discipline). Read NFR-P3 (sub-agent dispatch overhead < 200ms p95); NFR-P4 (transcript streaming zero observable latency); NFR-S2 (writes only inside scope); NFR-S5 (atomic tmp+rename + .bak rotation); NFR-R1 (zero data loss on halt); NFR-R4 (clean halt on stale lock); NFR-M3 (every public schema validated by Zod).
  - [x] 0.20 Read Story 2.5's File List + Senior Developer Review §Carry-overs (`_bmad-output/implementation-artifacts/2-5-markdown-transcript-json-run-log-writers.md` lines 750-800 + 928-944) — confirm Story 2.6 is correctly identified as the PRIMARY CALLER of `writeStepTranscript`. **CRITICAL dev-001 directory rename**: import path is `src/runs/`, NOT the architecture-doc `src/transcript/`. Story 2.6 substitutes `src/runs/` throughout.
  - [x] 0.21 Read Story 2.4's Forward Dependencies + Senior Dev Carry-overs (`_bmad-output/implementation-artifacts/2-4-lock-free-run-ts-for-bmad-next.md` lines 681-700 + 1090-1112) — confirm Story 2.6 is the **PROCESS-BOUNDARY COMPLEMENT**. The lock-free → lock-held transition is the process boundary between `run.ts` and `verify-and-advance.ts`. Note Story 2.4 dev-001 (seed-v6.x optional entry-points) is independent of Story 2.6 (Story 2.6 reads dispatch-spec written by Story 2.4; the dispatch-spec exists by definition for any successful Story 2.4 emit).
  - [x] 0.22 Read Story 2.2's Carry-overs + Forward Dependencies (`_bmad-output/implementation-artifacts/2-2-dispatch-spec-generator.md` lines 500-510 + 654-665) — confirm Story 2.6 is the SECONDARY READER of `dispatch-spec.json` (Story 2.4 is PRIMARY WRITER) AND the OWNER of `src/dispatch/promote.ts` (per Story 2.2 line 93 deferral). Note Story 2.2 dev-001 (Phase enum narrower than DAG Phase) is independent of Story 2.6 — Story 2.6 reads the dispatch-spec's epic+story+step (NOT phase) for the state-hash projection.
  - [x] 0.23 Read Story 2.1's Carry-overs (`_bmad-output/implementation-artifacts/2-1-verifier-configuration-registry.md` lines 715-716) — confirm Story 2.6 is the PRIMARY CONSUMER of `runVerifier` AND OWNS the optional `runVerifier` polish PR (`stagingRoot` REQUIRED → optional + `runVerifier` reads dispatch-spec.json directly). Story 2.6 v0.1 implements the **minimal** version (passes `stepName` explicitly per Story 2.1 v0.1 contract); the polish PR is a Story 6.x follow-up.
  - [x] 0.24 Read Story 1.4's lock semantics (`_bmad-output/implementation-artifacts/1-4-file-lock-with-heartbeat.md`) + `src/lock/lock.ts:280-388` — confirm `acquire()` returns a `LockHandle` whose `.release()` is idempotent, and the `try/finally` pattern is the canonical lifecycle (release on every code path).
  - [x] 0.25 Read Story 1.6's `loadState` / `saveState` / `loadStateUnlocked` contracts (`_bmad-output/implementation-artifacts/1-6-state-subsystem-load-save-recompute-skeleton.md`) + `src/state/load.ts:146-154` + `src/state/save.ts:68-91`. Confirm:
    - `loadState` acquires + releases the lock internally — Story 2.6 must NOT call this AFTER `acquire()` (would double-lock).
    - `loadStateUnlocked` performs zero lock IO — Story 2.6 calls this AFTER `acquire()` to read state under the held lock.
    - `saveState(state, lockHandle, opts?)` REQUIRES the `lockHandle` — uncompilable lock-free write.
  - [x] 0.26 Confirm baseline `bun run check` exits 0 with **475 pass / 0 fail / 1676 expects / 43 files** per Story 2.5 final.
  - [x] 0.27 Confirm Bun host version satisfies AR2 (Bun >= 1.3). Run `bun --version`; record in Completion Notes.

- [x] **Task 1 — Plan the runner's `RunVerifyAndAdvanceOptions` + `VerifyAndAdvanceResult` public surface (AC: all)**
  - [x] 1.1 Sketch the public types for `runVerifyAndAdvance()` per the Story 2.4 `RunNextOptions` precedent (test-only-but-exported escape hatches + structured return; the `import.meta.main` block translates to stderr writes + `process.exit`):
    ```typescript
    export interface RunVerifyAndAdvanceOptions {
      // Test-injection escape hatches (mirror Story 2.4 RunNextOptions shape).
      readonly argv?: readonly string[];        // defaults to process.argv.slice(2)
      readonly projectRoot?: string;            // defaults to process.cwd()
      readonly statePath?: string;              // forwarded to loadStateUnlocked
      readonly stagingRoot?: string;            // forwarded to runVerifier + promote + dispatch-spec read
      readonly canonicalRoot?: string;          // forwarded to promote (defaults to BMAD_OUTPUT_ROOT)
      readonly runsRoot?: string;               // forwarded to writeStepTranscript (Story 2.5)
      readonly lockOptions?: import("../../lock/lock.ts").LockOptions; // forwarded to acquire
      readonly nowIso?: string;                 // forwarded to writeStepTranscript + state mutation timestamp
      readonly logger?: { info(m: string): void; warn(m: string): void; error(m: string): void };
    }

    export interface VerifyAndAdvanceResult {
      readonly exitCode: 0 | 1 | 2 | 3 | 4 | 5;
      readonly action: DispatchActionV1; // AR9 line emitted
      /** Optional artifact paths returned for caller introspection (tests + Story 2.7). */
      readonly transcriptPaths?: { markdown: string; json: string };
      readonly promotedTo?: string | null;
    }
    ```
  - [x] 1.2 Sketch the `parseVerifyAndAdvanceArgs` shape (Task 4):
    ```typescript
    export interface VerifyAndAdvanceArgs {
      readonly runId: string;
      readonly tokensIn: number;
      readonly tokensOut: number;
    }
    export function parseVerifyAndAdvanceArgs(
      argv: readonly string[],
    ): Result<VerifyAndAdvanceArgs, ParseError>;
    ```
  - [x] 1.3 Document the **lock-acquired contract** in JSDoc — per architecture line 1672, `runVerifyAndAdvance` MUST call `acquire()` exactly ONCE at the top of the function and `release()` in the `finally` block. The mock-spy test (Task 11.7) verifies the call count.
  - [x] 1.4 Document the **stdout discipline** in JSDoc — per FR54 + architecture line 862, `runVerifyAndAdvance` writes the AR9 line via `emitDispatchAction` (which calls `json()` → stdout) ONCE in the `import.meta.main` block. All other diagnostic output routes to stderr via `info()` / `warn()` / `error()`. The function returns the structured `VerifyAndAdvanceResult` for tests to inspect WITHOUT emitting (per Story 1.12 + Story 2.4 doctor/runner precedent).

- [x] **Task 2 — Plan the `src/dispatch/promote.ts` public surface (AC-2; Story 2.2 deferred deliverable)**
  - [x] 2.1 Sketch the public types for `promote()`:
    ```typescript
    export interface PromoteInput {
      readonly runId: string;
      readonly stepName: string;
      /** Resolved phase to choose canonical-artifact root (planning vs implementation). */
      readonly phase: "planning" | "implementation" | "analysis" | "solutioning" | "retro";
      /** Tmpdir override for tests; defaults to STAGING_PATH. */
      readonly stagingRoot?: string;
      /** Tmpdir override for tests; defaults to BMAD_OUTPUT_ROOT. */
      readonly canonicalRoot?: string;
      /** Optional artifact filename under staging/<runId>/outputs/; defaults to <stepName>.md. */
      readonly artifactFilename?: string;
      /** Injectable timestamp for the completion-marker.json. */
      readonly nowIso?: string;
    }

    export interface PromoteResult {
      /** Absolute path of the canonical destination after atomic copy. */
      readonly promotedTo: string;
      /** Absolute path of the source artifact (under staging). */
      readonly sourcePath: string;
      /** Bytes copied (via Bun.file().size). */
      readonly bytes: number;
      /** Absolute path of the completion-marker.json that was written. */
      readonly markerPath: string;
    }

    export async function promote(input: PromoteInput): Promise<PromoteResult>;
    ```
  - [x] 2.2 Document the algorithm:
    1. Resolve `stagingRoot` (defaults to `STAGING_PATH`); `canonicalRoot` (defaults to `BMAD_OUTPUT_ROOT`).
    2. Resolve `sourcePath = path.join(stagingRoot, runId, "outputs", artifactFilename ?? stepName + ".md")`.
    3. Verify `sourcePath` exists via `Bun.file(sourcePath).exists()` (or `fs.access`); if not, throw `VerifierFailureError` with hint pointing at the verifier-result.json — the verifier should have caught a missing artifact, but defensive check.
    4. Resolve `phaseDir`: per architecture §P5 worked example + Story 2.4's `artifactPathForStep` helper info-3 (Story 2.4 senior dev review), planning/analysis/solutioning steps go to `_bmad-output/planning-artifacts/`; implementation/retro steps go to `_bmad-output/implementation-artifacts/`. Mapping table:
       - `analysis | planning | solutioning` → `planning-artifacts`
       - `implementation | retro` → `implementation-artifacts`
    5. Resolve `promotedTo = path.join(canonicalRoot, phaseDir, artifactFilename ?? stepName + ".md")`.
    6. Read source contents via `Bun.file(sourcePath).text()` (or `arrayBuffer()` for binary safety).
    7. Ensure parent dir exists via `fs.mkdir(path.dirname(promotedTo), { recursive: true })`.
    8. Atomic write to canonical destination via `atomicWrite(promotedTo, contents)` — `assertWithinScope` + `.bak` rotation + tmp+rename per NFR-S5.
    9. Write `staging/<runId>/completion-marker.json` containing `{ promotedAt: nowIso ?? new Date().toISOString(), promotedTo, runId, step }` per architecture §P5 line 917 (24-hour cleanup retention).
    10. Return `{ promotedTo, sourcePath, bytes: contents.length, markerPath }`.
  - [x] 2.3 Document the AR41 import boundary for `src/dispatch/promote.ts`: HIGHER-TIER per architecture §lines 1287-1289. Allowed: foundational (`../errors.ts`, `../io/log.ts`, `../io/paths.ts`, `../io/atomic-write.ts`); intra-module siblings (`./types.ts` if needed). FORBIDDEN: sibling higher-tier (`../verifiers/`, `../failure-ux/`); top-tier (`../commands/`); `node:child_process`.
  - [x] 2.4 Document the error semantics:
    - `VerifierFailureError` (existing class — code `VERIFIER_FAILURE`, exitCode 1) — thrown if the source artifact is missing (the verifier should have caught this; defensive).
    - `ScopeViolationError` (existing class — code `SCOPE_VIOLATION`, exitCode 5) — propagated from `assertWithinScope` if the destination is outside allowed roots.
    - Filesystem errors (ENOENT, EACCES, EROFS) — propagate from `atomicWrite` per Story 1.3 contract.
    - NO new error class registered. Registry stays at 16 codes.

- [x] **Task 3 — Implement `src/dispatch/promote.ts` (AC-2; Story 2.2 deferred deliverable)**
  - [x] 3.1 Create `src/dispatch/promote.ts`. JSDoc cites architecture §line 1178 + §P5 lines 864-917 + AR41 higher-tier boundary.
  - [x] 3.2 Module-level constants:
    ```typescript
    const COMPLETION_MARKER_NAME = "completion-marker.json";

    const PHASE_TO_DIR: Record<string, "planning-artifacts" | "implementation-artifacts"> = {
      analysis: "planning-artifacts",
      planning: "planning-artifacts",
      solutioning: "planning-artifacts",
      implementation: "implementation-artifacts",
      retro: "implementation-artifacts",
    };
    ```
  - [x] 3.3 Helper `resolvePhaseDir(phase: string): string` — looks up the mapping; returns `implementation-artifacts` as the conservative default for unknown phases. Documents the v0.1 mapping; a future Story 6.x may externalize via config.
  - [x] 3.4 Implement `promote()` per Task 2.2 algorithm. Use `Bun.file(sourcePath)` + `.text()` for read; `atomicWrite(promotedTo, contents)` for atomic write; `fs.mkdir({ recursive: true })` for parent dir; `Bun.write(markerPath, JSON.stringify(marker, null, 2) + "\n")` for the completion marker (trailing newline for Git-friendly diffs).
  - [x] 3.5 Defensive size check: read `Bun.file(sourcePath).size` BEFORE `text()`; if 0, throw `VerifierFailureError` with hint "See _bmad-output/.stepper/runs/<ts>-<step>.log for the verifier output; the staged artifact is empty."
  - [x] 3.6 Defensive scope check: call `assertWithinScope(promotedTo)` BEFORE `mkdir` (per Story 2.5 dev-002 precedent — surface canonical `ScopeViolationError` before mkdir's EACCES masks it).
  - [x] 3.7 Log `info("promote: copied <bytes> bytes from <sourcePath> to <promotedTo>")` after successful write per FR54 (stderr discipline).

- [x] **Task 4 — Extend `src/commands/next/args.ts` with `parseVerifyAndAdvanceArgs` (AC-1; epic line 694 step 5)**
  - [x] 4.1 Append to `src/commands/next/args.ts` a new `VerifyAndAdvanceArgs` interface + `VerifyAndAdvanceArgsSchema` Zod schema (the Story 1.7 hand-rolled tokenizer + Zod schema + `.strict()` rejection pattern).
  - [x] 4.2 Schema:
    ```typescript
    export const VerifyAndAdvanceArgsSchema = z
      .object({
        runId: z.string().min(1),
        tokensIn: z.number().int().nonnegative(),
        tokensOut: z.number().int().nonnegative(),
      })
      .strict();

    export type VerifyAndAdvanceArgs = z.infer<typeof VerifyAndAdvanceArgsSchema>;
    ```
  - [x] 4.3 Tokenizer `parseVerifyAndAdvanceArgs(argv: readonly string[]): Result<VerifyAndAdvanceArgs, ParseError>`. Algorithm:
    1. Initialise `runId: string | undefined`, `tokensIn: number | undefined`, `tokensOut: number | undefined`.
    2. Iterate `argv` (skip leading `--` separator if present).
    3. For each arg:
       - `--run-id <id>` → store `id` (next arg consumed).
       - `--tokens-in <n>` → parse `n` as `parseInt(arg, 10)`; if `NaN`, return `{ ok: false, error: { code: "INVALID_TOKENS_IN", hint: "Pass --tokens-in <integer> (got '<value>')." } }`.
       - `--tokens-out <n>` → analogous.
       - Unknown flag → return `{ ok: false, error: { code: "UNKNOWN_FLAG", hint: "Run /bmad-next --doctor to see supported flags; '<flag>' is not recognised." } }`.
    4. After tokenizing, if any of `runId`/`tokensIn`/`tokensOut` is undefined, return `{ ok: false, error: { code: "MISSING_REQUIRED", hint: "Pass --run-id <id> --tokens-in <n> --tokens-out <n>; '<missing>' is missing." } }`.
    5. Validate via `VerifyAndAdvanceArgsSchema.parse({ runId, tokensIn, tokensOut })`; on Zod error, return `{ ok: false, error: { code: "ZOD_PARSE", hint: "..." } }`.
    6. Return `{ ok: true, value: parsed }`.
  - [x] 4.4 Mirror the Story 1.7 `parseNextArgs` style verbatim (Result-shaped sync return; `ParseError.hint` AR22-prefixed where reasonable; `Pass`/`Run` verbs aligned with Story 1.11 / 2.4 precedent).
  - [x] 4.5 Update `src/commands/next/index.ts` barrel: append `parseVerifyAndAdvanceArgs`, `VerifyAndAdvanceArgs`, `VerifyAndAdvanceArgsSchema` re-exports.

- [x] **Task 5 — Implement `src/commands/next/verify-and-advance.ts` — module header + imports + helpers (AC: all)**
  - [x] 5.1 Create `src/commands/next/verify-and-advance.ts`. Module purpose: the canonical lock-acquiring `/bmad-next` post-dispatch runner (FR1, FR5, FR16, FR17, FR18, FR32, FR43, FR44, FR46, FR53, FR54, AR8, AR9, AR12, AR21, AR22, AR25, AR26, AR33, AR41).
  - [x] 5.2 Per AR41 top-tier (architecture lines 1294-1302), allowed imports: foundational (`../../errors.ts`, `../../io/log.ts`, `../../io/paths.ts`, `../../io/atomic-write.ts`, `../../schemas/dispatch-spec.ts`, `../../schemas/dispatch-protocol.ts`, `../../schemas/state.ts`, `../../schemas/run-log.ts`, `../../schemas/verifier-result.ts`); mid-tier (`../../state/load.ts` — `loadStateUnlocked` ONLY; `../../state/save.ts` — `saveState` LOCK-REQUIRED writer; `../../lock/lock.ts` — `acquire`; `../../runs/index.ts` — `writeStepTranscript`); higher-tier (`../../dispatch/index.ts` — `cleanStagingOrphans` + `emitDispatchAction` + `promote`; `../../verifiers/index.ts` — `runVerifier`); intra-module siblings (`./args.ts` — `parseVerifyAndAdvanceArgs`); Bun stdlib (`Bun.file`, `Bun.write`); Node stdlib (`node:fs/promises`, `node:path`, `node:crypto` — for the state-hash). **FORBIDDEN**: `../doctor/run.ts` (Story 1.12 reuse not needed); `node:child_process`; any new external runtime dep beyond `zod`. JSDoc cites the AR41 + AR8 + line 1672 + line 1474 contracts.
  - [x] 5.3 Module-level constants:
    ```typescript
    /**
     * Stable hash projection over (lastSuccessfulStep, lastAttempted) per
     * architecture line 1673 (Coherence Validation Correction 2). Story 2.6
     * v0.1 uses node:crypto.createHash('sha256').digest('hex'); the projection
     * is canonicalised JSON.stringify of the picked fields (key order: stable
     * via explicit object literal).
     */
    const STATE_HASH_ALGO = "sha256" as const;
    ```
  - [x] 5.4 Helper `computeStateHash(state: State): string` — pure function that returns the SHA-256 hex digest of the canonical projection `JSON.stringify({ lastSuccessfulStep: state.lastSuccessfulStep ?? null, lastAttempted: state.lastAttempted ?? null })`. Sortable / deterministic for a given input.
  - [x] 5.5 Helper `computeDispatchSpecStateProjection(dispatchSpec: DispatchSpecV1): string` — returns the SHA-256 hex digest of `JSON.stringify({ epic: dispatchSpec.epic, story: dispatchSpec.story })` — the dispatch-spec's projection of the state at dispatch-time. Per story spec **Option A** (v0.1 design decision documented in Context Summary), divergence between the current state's `(lastSuccessfulStep, lastAttempted)` projection and the dispatch-spec's `(epic, story)` projection indicates state advanced during dispatch.
  - [x] 5.6 Helper `compareStateHashes(currentState: State, dispatchSpec: DispatchSpecV1): { match: boolean; currentHash: string; dispatchHash: string }` — wraps Tasks 5.4 + 5.5 + the comparison. Returns the structured shape so the caller can log both hashes for forensics.
    - **NOTE on v0.1 design (Option A)**: the two hashes operate on DIFFERENT projections (current state's `(lastSuccessfulStep, lastAttempted)` vs dispatch-spec's `(epic, story)`) — so they will NEVER hash-match in the strict sense. v0.1 implementation: derive `(epic, story)` from the current state's `lastSuccessfulStep` / `lastAttempted` AND from the dispatch-spec, then compare; if the **derived (epic, story) tuple** matches, state has not advanced during dispatch.
    - Restated v0.1 algorithm: `currentEpicStory = (state.lastAttempted?.epic, state.lastAttempted?.story) ?? (state.lastSuccessfulStep?.epic, state.lastSuccessfulStep?.story)`; `dispatchEpicStory = (dispatchSpec.epic, dispatchSpec.story)`; `match = currentEpicStory.epic === dispatchEpicStory.epic && currentEpicStory.story === dispatchEpicStory.story`. The hashes are recorded for the run-log JSON `errors[]` field on mismatch (forensic traceability).
  - [x] 5.7 Helper `readDispatchSpec(stagingRoot: string, runId: string): Promise<DispatchSpecV1>` — reads `staging/<runId>/dispatch-spec.json` via `Bun.file(...).json()`; Zod-parses with `DispatchSpecV1Schema.parse()` (defence-in-depth NFR-M3). Throws `ConfigError` with hint "Run /bmad-next to start a new dispatch; the dispatch-spec at `<path>` is missing or malformed." on read or parse failure.
  - [x] 5.8 Helper `readSubAgentOutput(stagingRoot: string, runId: string, stepName: string, artifactFilename?: string): Promise<string>` — reads the sub-agent output via `Bun.file(staging/<runId>/outputs/<artifactFilename ?? stepName + ".md">).text()`. Returns empty string + logs `warn(...)` if the output is missing (the verifier will have caught this; the transcript still gets written for forensics).
  - [x] 5.9 Helper `appendRunHistory(state: State, entry: RunHistoryEntry): State` — pure function that returns a new `State` with `runHistory: [...(state.runHistory ?? []), entry]`. The `RunHistoryEntry` shape per FR5 + Story 1.5 schema (verify the field name + shape in `src/schemas/state.ts` during Task 0.11):
    ```typescript
    interface RunHistoryEntry {
      runId: string;
      step: string;
      epic: number;
      story: string;
      verifierStatus: "pass" | "fail" | "skip";
      promotedTo: string | null;
      durationMs: number;
      tokensIn: number;
      tokensOut: number;
      ts: string; // ISO timestamp at advance-state-time
    }
    ```
    NOTE: confirm against the live `StateV1Schema` during Task 0.11 — if the schema does NOT yet declare `runHistory[]` in the exact shape, document as `dev-001` carry-over and pass through to a Story 6.x schema bump (Option: append to a structurally-loose `runHistory: z.array(z.unknown()).default([])` field if the schema currently uses that shape).

- [x] **Task 6 — Implement `runVerifyAndAdvance()` — argv parse + lock acquire (AC-1, AC-3)**
  - [x] 6.1 Public signature:
    ```typescript
    export async function runVerifyAndAdvance(
      opts?: RunVerifyAndAdvanceOptions,
    ): Promise<VerifyAndAdvanceResult>
    ```
  - [x] 6.2 Algorithm step 1 — **Resolve options + parse argv**: defaults per Task 1.1 sketch. Call `parseVerifyAndAdvanceArgs(opts?.argv ?? process.argv.slice(2))`. If `result.ok === false`, return `{ exitCode: 2, action: { action: "halt", message: result.error.hint, exitCode: 2 } }` immediately (FR53 — exit 2 = configuration error). The `import.meta.main` block then writes `result.error.hint` to stderr via `error()` and exits 2 BEFORE invoking `runVerifyAndAdvance` per Story 1.12 doctor + Story 2.4 run.ts precedent — but `runVerifyAndAdvance` itself should be defensive.
  - [x] 6.3 Algorithm step 2 — **Wrap in outer try/catch/finally**: the entire algorithm (steps 3-15) is wrapped in:
    ```typescript
    let handle: LockHandle | undefined;
    let transcriptPaths: { markdown: string; json: string } | undefined;
    let stateBefore: State | undefined;
    let stateAfter: State | undefined;
    let dispatchSpec: DispatchSpecV1 | undefined;
    let verifierResult: RunVerifierResult | undefined;
    let promotedTo: string | null = null;
    const startMs = performance.now();
    let outcomeError: StepperError | undefined;

    try {
      handle = await acquire(opts?.lockOptions);
      // ... steps 4-13 ...
      return { exitCode: 0, action: <success>, transcriptPaths, promotedTo };
    } catch (err) {
      if (err instanceof StepperError) {
        outcomeError = err;
        return { exitCode: err.exitCode, action: { action: "halt", message: err.actionableHint, exitCode: err.exitCode } };
      }
      throw err; // non-StepperError propagates to import.meta.main
    } finally {
      // ALWAYS write transcript (forensic discipline) — even on halt paths.
      if (handle !== undefined) {
        try {
          if (stateBefore !== undefined && dispatchSpec !== undefined) {
            const result = await writeStepTranscript({
              ...buildTranscriptInput(...),  // helper from Task 8
            });
            transcriptPaths = { markdown: result.markdownPath, json: result.jsonPath };
          }
        } catch (writeErr) {
          // Transcript write failure should NOT mask the original outcome.
          warn(`verify-and-advance: transcript write failed (non-fatal): ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`);
        }
        await handle.release();
      }
    }
    ```
  - [x] 6.4 Algorithm step 3 — **Acquire lock**: `handle = await acquire(opts?.lockOptions)`. On `LockContentionError`, the outer try/catch translates to `action: "halt"` with `exitCode: 4` (FR53 lock contention) — the architecture-prescribed behavior per AR8.
  - [x] 6.5 Per AR8 + architecture line 1672: the lock is acquired EXACTLY ONCE per `runVerifyAndAdvance` invocation. The `try/finally` ensures release on every exit path (success, halt, throw). Mock-spy verification: Task 11.7 spies on `acquire` and asserts exactly ONE call; Task 11.8 spies on `handle.release` and asserts exactly ONE call (or zero if `acquire` threw).

- [x] **Task 7 — Implement `runVerifyAndAdvance()` — read state + dispatch-spec + state-hash check (AC-1, AC-3)**
  - [x] 7.1 Algorithm step 4 — **Read state**: `stateBefore = await loadStateUnlocked({ statePath: opts?.statePath })`. Per Task 0.4 — uses `loadStateUnlocked` (NOT `loadState`) to avoid double-locking under the held lock. Throws `CorruptStateError` / `StateTooNewError` / `MigrationFailureError` / `PathologicalInputError` per Story 1.6 contracts; outer try/catch translates to `action: "halt"`.
  - [x] 7.2 Algorithm step 5 — **Read dispatch-spec**: `dispatchSpec = await readDispatchSpec(opts?.stagingRoot ?? STAGING_PATH, args.runId)` (Task 5.7 helper). Throws `ConfigError` on missing or malformed dispatch-spec; outer try/catch translates to `action: "halt"` with `exitCode: 2`.
  - [x] 7.3 Algorithm step 6 — **Compute + compare state-hash** (architecture line 1673 — Critical Gap Resolution 2): `const cmp = compareStateHashes(stateBefore, dispatchSpec)` (Task 5.6 helper). If `!cmp.match`, throw `new StateChangedDuringDispatchError("verify-and-advance: state advanced during dispatch", JSON.stringify({ currentHash: cmp.currentHash, dispatchHash: cmp.dispatchHash }))`. The class is ALREADY REGISTERED at `src/errors.ts:164-169` with the AR22-conformant hint "Run /bmad-next --diff-state to see what changed and /bmad-next --resume to retry from the current state." — exit code 1.
  - [x] 7.4 The throw at step 7.3 propagates to the outer try/catch which translates to `{ action: "halt", message: err.actionableHint, exitCode: 1 }` per AC-3. The integration test at Task 11.5 exercises this code path: write a dispatch-spec for `(epic: 1, story: "1.1")`; mutate `state.yaml` to advance to `(epic: 2, story: "2.1")`; invoke `runVerifyAndAdvance` against the `runId`; assert `result.exitCode === 1`, `result.action.message === "Run /bmad-next --diff-state ..."`.

- [x] **Task 8 — Implement `runVerifyAndAdvance()` — runVerifier + promote + state advance (AC-1, AC-2)**
  - [x] 8.1 Algorithm step 7 — **Run verifier**: `verifierResult = await runVerifier(args.runId, { stepName: dispatchSpec.step, stagingRoot: opts?.stagingRoot ?? STAGING_PATH })` per Story 2.1 PRIMARY CONSUMER carry-over. Per Story 2.1 v0.1 contract `stagingRoot` is REQUIRED; pass the resolved path explicitly.
  - [x] 8.2 Algorithm step 8 — **Branch on verifier status**:
    - `verifierResult.status === "fail"` → throw `new VerifierFailureError("verify-and-advance: verifier reported fail", JSON.stringify(verifierResult))`. Outer try/catch translates to `action: "halt"` with `exitCode: 1` + the registered hint "See _bmad-output/.stepper/runs/<ts>-<step>.log for the verifier output; try /bmad-next --resume after fixing the underlying issue." (per `src/errors.ts:171-176`). The `finally` block STILL writes the transcript + run log so the forensic trail captures the verifier output.
    - `verifierResult.status === "skip"` → treat as `pass` for v0.1 (the `defaultVerifiers.default` skip case happens for steps with no required-files configuration; Story 2.1 v0.1 default is permissive). Document as forward-dep to Story 6.5 (per-step verifier override config — may tighten the skip semantics).
    - `verifierResult.status === "pass"` → continue to step 8.3 (promote + state advance).
  - [x] 8.3 Algorithm step 9 — **Promote artifact** (AC-2): `const promoteResult = await promote({ runId: args.runId, stepName: dispatchSpec.step, phase: derivePhaseFromStep(dispatchSpec.step), stagingRoot: opts?.stagingRoot, canonicalRoot: opts?.canonicalRoot, nowIso: opts?.nowIso })` (Task 3 deliverable). Capture `promotedTo = promoteResult.promotedTo`.
  - [x] 8.4 Helper `derivePhaseFromStep(stepName: string): "planning" | "implementation"` — defensive v0.1 mapping based on the seed-v6.x.ts step naming. Steps prefixed `bmad-create-prd`, `bmad-create-architecture`, `bmad-create-ux-design`, `bmad-research`, `bmad-brainstorming`, `bmad-domain-research`, `bmad-product-brief`, `bmad-prfaq` → `"planning"`. Steps prefixed `bmad-create-story`, `bmad-dev-story`, `bmad-code-review`, `bmad-retrospective` → `"implementation"`. Default fallback: `"implementation"`. **NOTE**: this is a v0.1 lookup; the canonical phase resolution lives in the DAG node (`node.phase`) — but Story 2.6 doesn't import the DAG (avoids transitive coupling to Story 1.10's DAG builder at the runner-tier; the dispatch-spec carries `epic+story` but NOT `phase` per Story 2.2 dev-001). A future Story 6.x DispatchSpecV2 schema bump may add `phase` to the dispatch-spec; Story 2.6 v0.1 uses the lookup-table approach.
  - [x] 8.5 Algorithm step 10 — **Advance state** (AC-2 — atomic state.yaml update with `.bak` rotation + tokens recorded into `runHistory[]`): construct the new state:
    ```typescript
    const runHistoryEntry: RunHistoryEntry = {
      runId: args.runId,
      step: dispatchSpec.step,
      epic: dispatchSpec.epic,
      story: dispatchSpec.story,
      verifierStatus: verifierResult.status,
      promotedTo: promoteResult.promotedTo,
      durationMs: Math.round(performance.now() - startMs),
      tokensIn: args.tokensIn,
      tokensOut: args.tokensOut,
      ts: opts?.nowIso ?? new Date().toISOString(),
    };
    stateAfter = {
      ...stateBefore,
      lastSuccessfulStep: { name: dispatchSpec.step, epic: dispatchSpec.epic, story: dispatchSpec.story, completedAt: runHistoryEntry.ts },
      lastAttempted: null,  // clear per FR5 + epic-3 Story 3.1 forward-dep ratification
      runHistory: appendRunHistory(stateBefore, runHistoryEntry).runHistory,
    };
    ```
    The exact `lastSuccessfulStep` shape MUST match `StateV1Schema.lastSuccessfulStep` (Story 1.5); verify in Task 0.11 + adjust if needed.
  - [x] 8.6 Algorithm step 11 — **Save state** (AC-2 — atomic write + `.bak` rotation): `await saveState(stateAfter, handle, { statePath: opts?.statePath })` per Story 1.6 contract. The `handle` is REQUIRED (TypeScript signature) — passing it explicitly satisfies NFR-S5 architectural enforcement.
  - [x] 8.7 Algorithm step 12 — **Compose AR9 success line**: emit `{ action: "report", message: "✓ ${dispatchSpec.step} → ${promoteResult.promotedTo} (tokens: in=${args.tokensIn} out=${args.tokensOut}, ${runHistoryEntry.durationMs}ms)", exitCode: 0 }` per FR18 ("one human-readable line per step"). The line is ONE-LINE; the architecture line 1480 + FR18 contract.
  - [x] 8.8 Per AC-2: the FULL happy path is (state-hash match → verifier pass → promote → atomic state.yaml update → tokens recorded → lock released in finally). Test at Task 11.2 exercises this full happy path.

- [x] **Task 9 — Implement `runVerifyAndAdvance()` — finally block (transcript write + lock release) (AC-4)**
  - [x] 9.1 Algorithm step 13 — **Compose `TranscriptInput`** (helper `buildTranscriptInput(...)` referenced in Task 6.3):
    ```typescript
    function buildTranscriptInput(args: {
      runId: string;
      dispatchSpec: DispatchSpecV1;
      stateBefore: State;
      stateAfter: State | undefined;  // undefined if mid-flow halt
      verifierResult: RunVerifierResult | undefined;
      subAgentOutput: string;
      promotedTo: string | null;
      tokensIn: number;
      tokensOut: number;
      durationMs: number;
      outcomeError: StepperError | undefined;
      nowIso: string | undefined;
    }): TranscriptInput {
      return {
        runId: args.runId,
        stepName: args.dispatchSpec.step,
        epic: args.dispatchSpec.epic ?? null,
        story: args.dispatchSpec.story ?? null,
        phase: derivePhaseFromStep(args.dispatchSpec.step),
        persona: args.dispatchSpec.taskSpec.persona,
        model: args.dispatchSpec.model,
        budget: args.dispatchSpec.budget,
        inputs: args.dispatchSpec.taskSpec.context.map((c) => ({ path: c.path, label: c.label ?? c.path })),
        subAgentPrompt: JSON.stringify(args.dispatchSpec.taskSpec, null, 2),
        subAgentOutput: args.subAgentOutput,
        verifierResult: args.verifierResult ?? { status: "skip", checks: [], promotedTo: null },
        stateBefore: { lastSuccessfulStep: args.stateBefore.lastSuccessfulStep?.name ?? null, lastAttempted: args.stateBefore.lastAttempted?.name ?? null },
        stateAfter: { lastSuccessfulStep: args.stateAfter?.lastSuccessfulStep?.name ?? args.stateBefore.lastSuccessfulStep?.name ?? null, lastAttempted: args.stateAfter?.lastAttempted?.name ?? null },
        outcome: args.outcomeError !== undefined
          ? `✗ Halted: ${args.outcomeError.code} — ${args.outcomeError.message}`
          : `✓ Promoted from staging/${args.runId}/ to ${args.promotedTo ?? "(none)"}.`,
        durationMs: args.durationMs,
        tokensIn: args.tokensIn,
        tokensOut: args.tokensOut,
        errors: args.outcomeError !== undefined ? [args.outcomeError.toJSON()] : [],
        nowIso: args.nowIso,
      };
    }
    ```
  - [x] 9.2 Algorithm step 14 — **Read sub-agent output** (in the finally block; best-effort): `subAgentOutput = await readSubAgentOutput(opts?.stagingRoot ?? STAGING_PATH, args.runId, dispatchSpec.step)` (Task 5.8 helper). On read failure, falls through with empty string + warn log.
  - [x] 9.3 Algorithm step 15 — **Write transcript + run log** (AC-4 — via Story 2.5's `writeStepTranscript`): `const writeResult = await writeStepTranscript({ ...buildTranscriptInput({...}), runsRoot: opts?.runsRoot })`. Capture `transcriptPaths = { markdown: writeResult.markdownPath, json: writeResult.jsonPath }`.
  - [x] 9.4 The finally block runs on EVERY exit path (success, halt, throw). The `if (handle !== undefined)` guard ensures the transcript write only runs if the lock was acquired (an `acquire()` failure means there's no canonical state to capture; the failure already propagates as the outer error). The `if (stateBefore !== undefined && dispatchSpec !== undefined)` guard ensures we only write if we have enough context (state-hash mismatch and earlier failures may have these; later failures definitely do).
  - [x] 9.5 The transcript write failure is BEST-EFFORT — wrapped in its own try/catch with `warn(...)` log; does NOT mask the original outcome. This mirrors Story 2.4's `cleanStagingOrphans` best-effort pattern.
  - [x] 9.6 Algorithm step 16 — **Release lock**: `await handle.release()` (LAST in the finally block — after the transcript write attempt). Per Story 1.4 contract, `release()` is idempotent (safe to call multiple times); the explicit single call here documents intent.

- [x] **Task 10 — Implement `import.meta.main` entrypoint + extend barrel (AC: all)**
  - [x] 10.1 Per Story 1.12 + Story 2.4 precedent, append at the bottom of `src/commands/next/verify-and-advance.ts`:
    ```typescript
    if (import.meta.main) {
      try {
        const result = await runVerifyAndAdvance();
        emitDispatchAction(result.action);
        process.exit(result.exitCode);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        error(`verify-and-advance: unexpected failure: ${message}`);
        process.exit(1);
      }
    }
    ```
  - [x] 10.2 Notes on the `import.meta.main` block:
    - The block emits the AR9 line via `emitDispatchAction` (defence-in-depth — Zod parse via `DispatchActionV1Schema`).
    - Per AR33 + Story 1.12 precedent: `runVerifyAndAdvance` itself does NOT call `emitDispatchAction` or `process.exit` — those are entrypoint concerns. The function returns the structured `VerifyAndAdvanceResult` for tests to inspect WITHOUT mutating stdout / process state.
    - The top-level catch handles non-StepperError throws; StepperError throws are translated to `action: "halt"` by the outer try/catch in `runVerifyAndAdvance` per Task 6.3.
  - [x] 10.3 Extend `src/commands/next/index.ts` barrel:
    ```typescript
    export {
      runVerifyAndAdvance,
    } from "./verify-and-advance.ts";
    export type {
      RunVerifyAndAdvanceOptions,
      VerifyAndAdvanceResult,
    } from "./verify-and-advance.ts";
    ```
  - [x] 10.4 Extend `src/dispatch/index.ts` barrel:
    ```typescript
    export type { PromoteInput, PromoteResult } from "./promote.ts";
    export { promote } from "./promote.ts";
    ```
  - [x] 10.5 **AR41 boundary CI gate (manual grep until automated)**: confirm `src/commands/next/verify-and-advance.ts` does NOT import from `node:child_process`, `node:net`, `node:http`, `node:https`, OR any new external runtime dep beyond `zod`. Note: top-tier modules MAY import from EVERY tier per AR41 — there is no "forbidden mid-tier import" for this file. The lock-acquired contract is positive (MUST call `acquire()`); not boundary-enforced.

- [x] **Task 11 — Create `src/commands/next/verify-and-advance.test.ts` — colocated tests (AC: all, AR35)**
  - [x] 11.1 Per AR35, use Bun's built-in test runner. Tmpdir-per-test isolation via `mkdtemp(path.join(os.tmpdir(), "stepper-verify-"))`. Clean up via `afterEach rm({ recursive: true, force: true })`. NEVER hard-code `/tmp/...` paths.
  - [x] 11.2 **AC-1 + AC-2 happy path test (state-hash match → verifier pass → promote → state advance)**: seed a tmpdir with:
    - `state.yaml` containing `lastSuccessfulStep: { name: "bmad-create-prd", epic: 1, story: "1.0" }`, `lastAttempted: null`, `runHistory: []`.
    - `staging/test-run-id/dispatch-spec.json` containing a valid `DispatchSpecV1` with `step: "bmad-create-architecture"`, `epic: 1`, `story: "1.0"` (matches state).
    - `staging/test-run-id/outputs/bmad-create-architecture.md` containing a valid markdown artifact with the required frontmatter sections.
    Call `runVerifyAndAdvance({ argv: ["--run-id", "test-run-id", "--tokens-in", "100", "--tokens-out", "200"], statePath: tmpdir + "/state.yaml", stagingRoot: tmpdir + "/staging", canonicalRoot: tmpdir + "/canonical", runsRoot: tmpdir + "/runs", lockOptions: { lockDir: tmpdir + "/lock" } })`. Assert:
    - `result.exitCode === 0`.
    - `result.action.action === "report"`.
    - `result.action.message` contains `"✓ bmad-create-architecture → "` and the canonical path under `<tmpdir>/canonical/planning-artifacts/`.
    - `result.promotedTo` is the canonical path string.
    - The artifact exists at `<tmpdir>/canonical/planning-artifacts/bmad-create-architecture.md` byte-identical to the staging source.
    - `state.yaml` updated: `lastSuccessfulStep.name === "bmad-create-architecture"`, `lastAttempted === null`, `runHistory.length === 1`, `runHistory[0].tokensIn === 100`, `runHistory[0].tokensOut === 200`.
    - `state.yaml.bak` exists (atomic-write `.bak` rotation per NFR-S5).
    - `<tmpdir>/runs/<ts>-bmad-create-architecture.{log,json}` exist; the JSON validates against `RunLogV1Schema`.
    - The lock dir does NOT exist after the call (released in finally).
  - [x] 11.3 **AC-2 atomic copy + .bak rotation test**: pre-populate `<tmpdir>/canonical/planning-artifacts/bmad-create-architecture.md` with prior content; call `runVerifyAndAdvance` as in Task 11.2. Assert:
    - The destination `bmad-create-architecture.md` contains the new content.
    - `bmad-create-architecture.md.bak` exists with the prior content.
  - [x] 11.4 **AC-2 tokens recorded into runHistory test**: assert `state.runHistory[0]` includes `runId: "test-run-id"`, `step: "bmad-create-architecture"`, `tokensIn: 100`, `tokensOut: 200`, `verifierStatus: "pass"`, `promotedTo: <canonical path>`.
  - [x] 11.5 **AC-3 + AC-5 TOCTOU mismatch test (integration)**: seed state with `lastSuccessfulStep: { ..., epic: 2, story: "2.0" }` (advanced) but dispatch-spec with `epic: 1, story: "1.0"` (stale). Call `runVerifyAndAdvance({...})`. Assert:
    - `result.exitCode === 1`.
    - `result.action.action === "halt"`.
    - `result.action.message === "Run /bmad-next --diff-state to see what changed and /bmad-next --resume to retry from the current state."` (verbatim from the registered `StateChangedDuringDispatchError.actionableHint`).
    - The artifact was NOT promoted (canonical path does NOT exist).
    - `state.yaml` was NOT modified (mtime unchanged).
    - The lock was released (lock dir does NOT exist after call).
    - The transcript + run log were STILL written to `<tmpdir>/runs/` (forensic discipline).
    - The run-log JSON's `errors[]` field contains the `StateChangedDuringDispatchError.toJSON()` entry.
  - [x] 11.6 **AC-4 transcript + run log written test**: this is exercised across Tasks 11.2/11.3/11.5; verify ALL exit paths write the transcript pair. Add a dedicated test that asserts the markdown file's seven AR25 sections are present and the JSON file validates against `RunLogV1Schema`.
  - [x] 11.7 **Lock-acquired invariant test**: mock the `acquire` import via Bun's `mock.module`. Spy on `acquire`. Call `runVerifyAndAdvance({...})`. Assert the spy was called EXACTLY ONCE.
  - [x] 11.8 **Lock-release-in-finally invariant test**: mock `acquire` to return a handle whose `release` is a spy. Cause an error mid-flow (e.g., pass `runId` for a non-existent dispatch-spec). Assert the spy was called EXACTLY ONCE (release-on-error path).
  - [x] 11.9 **Verifier-failure halt test**: seed a staging artifact with INVALID frontmatter (missing required sections per Story 2.1's verifier registry). Call `runVerifyAndAdvance({...})`. Assert:
    - `result.exitCode === 1`.
    - `result.action.action === "halt"`.
    - `result.action.message` contains "See _bmad-output/.stepper/runs/<ts>-<step>.log" (the registered `VerifierFailureError.actionableHint`).
    - The artifact was NOT promoted.
    - `state.yaml` was NOT modified.
    - The transcript + run log WERE written (forensic discipline).
  - [x] 11.10 **Lock-contention halt test**: pre-acquire the lock (via a fixture `acquire(lockOptions)` call); call `runVerifyAndAdvance({...})` with the same `lockOptions`. Assert:
    - `result.exitCode === 4`.
    - `result.action.action === "halt"`.
    - `result.action.message` contains the registered `LockContentionError.actionableHint` ("Run /bmad-next --doctor to inspect lock state, or /bmad-next --force-unlock if you're sure no other Stepper is running.").
    - The fixture lock is preserved (NOT released by the failed call).
  - [x] 11.11 **Args parser error test**: call `runVerifyAndAdvance({ argv: ["--tokens-in", "100"] })` (missing `--run-id`). Assert:
    - `result.exitCode === 2` (FR53 configuration error).
    - `result.action.action === "halt"`.
    - `result.action.message` contains "--run-id" and the AR22-conformant hint.
  - [x] 11.12 **AR9 schema validation test**: assert the `result.action` for EVERY test case validates against `DispatchActionV1Schema` (round-trip via `JSON.stringify` + `JSON.parse` + `schema.parse`). This is the same defence-in-depth pattern Story 2.4 + Story 2.5 ship.
  - [x] 11.13 **AR41 boundary test**: programmatic check — read `src/commands/next/verify-and-advance.ts` source via `Bun.file`; assert no matches for forbidden patterns (`from "node:child_process"`, `from "node:net"`, `from "node:http"`).
  - [x] 11.14 **NFR-S1 no-network test**: assert `runVerifyAndAdvance` source contains no `fetch(`, `Bun.fetch`, `node:http`, `node:https`, `node:net` references — programmatic check.
  - [x] 11.15 **NFR-P3 dispatch overhead test (informational)**: time `runVerifyAndAdvance({...})` end-to-end against a fixture happy path; assert it completes in < 2000ms p95 on local FS (the dispatch overhead budget per NFR-P3 is for the buildDispatchSpec step; verify-and-advance is naturally heavier due to acquire+verifier+promote+saveState+writeTranscript). Mark as `it.if(...)` skip if running on slow CI.

- [x] **Task 12 — Create `src/dispatch/promote.test.ts` — colocated tests for promote() (AC-2, NFR-S5)**
  - [x] 12.1 Per AR35, use Bun's built-in test runner. Tmpdir-per-test isolation. ~6-10 test cases.
  - [x] 12.2 **AC-2 atomic copy test**: seed `<tmpdir>/staging/run-1/outputs/bmad-create-prd.md` with content X. Call `promote({ runId: "run-1", stepName: "bmad-create-prd", phase: "planning", stagingRoot: tmpdir + "/staging", canonicalRoot: tmpdir + "/canonical" })`. Assert:
    - The destination `<tmpdir>/canonical/planning-artifacts/bmad-create-prd.md` exists with content X.
    - `result.promotedTo` is the canonical path string.
    - `result.bytes === content.length`.
    - `result.markerPath` exists at `<tmpdir>/staging/run-1/completion-marker.json`.
    - The marker JSON contains `{ runId: "run-1", step: "bmad-create-prd", promotedTo: <canonical>, promotedAt: <iso> }`.
  - [x] 12.3 **NFR-S5 .bak rotation test**: pre-populate the canonical path with prior content; call `promote({...})`. Assert the destination contains new content; the `.bak` contains prior content.
  - [x] 12.4 **Phase mapping test**: call `promote({ phase: "planning", ... })` → asserts dest under `planning-artifacts/`. Call `promote({ phase: "implementation", ... })` → asserts dest under `implementation-artifacts/`. Call with `phase: "analysis"` → `planning-artifacts/`. Call with `phase: "retro"` → `implementation-artifacts/`.
  - [x] 12.5 **Missing source test**: do NOT seed the staging artifact; call `promote({...})`. Assert it throws `VerifierFailureError` with hint containing "verifier output".
  - [x] 12.6 **Empty source test**: seed an EMPTY artifact at the staging path; call `promote({...})`. Assert it throws `VerifierFailureError` with hint indicating the artifact is empty.
  - [x] 12.7 **Out-of-scope destination test**: call `promote({ canonicalRoot: "/etc/passwd-path" })`. Assert it throws `ScopeViolationError` with `code === "SCOPE_VIOLATION"`, `exitCode === 5`.
  - [x] 12.8 **Idempotent completion-marker test**: call `promote` twice with the same runId; assert the second call's marker overwrites the first (the .bak rotation handles this).
  - [x] 12.9 **Custom artifactFilename test**: call `promote({ artifactFilename: "custom-name.md", ... })`. Assert source and destination use `custom-name.md`.

- [x] **Task 13 — Update `src/commands/next/args.test.ts` — tests for `parseVerifyAndAdvanceArgs` (AC-1)**
  - [x] 13.1 **Happy path test**: call `parseVerifyAndAdvanceArgs(["--run-id", "abc-123", "--tokens-in", "100", "--tokens-out", "200"])`. Assert `{ ok: true, value: { runId: "abc-123", tokensIn: 100, tokensOut: 200 } }`.
  - [x] 13.2 **Trailing -- separator test**: call `parseVerifyAndAdvanceArgs(["--", "--run-id", "abc-123", "--tokens-in", "100", "--tokens-out", "200"])`. Assert success (the `--` separator is skipped).
  - [x] 13.3 **Missing --run-id test**: call `parseVerifyAndAdvanceArgs(["--tokens-in", "100", "--tokens-out", "200"])`. Assert `{ ok: false, error: { code: "MISSING_REQUIRED", hint: ... }}`.
  - [x] 13.4 **Missing --tokens-in test**: assert analogous failure.
  - [x] 13.5 **Non-numeric tokens test**: call `parseVerifyAndAdvanceArgs(["--run-id", "abc-123", "--tokens-in", "not-a-number", "--tokens-out", "200"])`. Assert `{ ok: false, error: { code: "INVALID_TOKENS_IN", hint: ... }}`.
  - [x] 13.6 **Negative tokens test**: call with `--tokens-in -5`. Assert `{ ok: false, ...}` (Zod schema rejects negative integers).
  - [x] 13.7 **Unknown flag test**: call with extra `--unknown-flag`. Assert `{ ok: false, error: { code: "UNKNOWN_FLAG", hint: ... }}`.

- [x] **Task 14 — Quality gates (AC: all)**
  - [x] 14.1 Run `bun run check` — expect 0 fail, baseline 475 + new tests passing. Story 2.6 adds ~20-32 new tests (~14-20 verify-and-advance + ~6-10 promote + ~5-7 args). Estimated total: ~495-515 pass. Record actual count in Completion Notes.
  - [x] 14.2 Run `bun run lint` (Biome) — expect 0 errors, 0 warnings. Particular attention to `noConsole` (no `console.*` allowed) and `noUnusedVariables`.
  - [x] 14.3 Run `bun run typecheck` (`tsc --noEmit`) — expect 0 errors.
  - [x] 14.4 Run AR41 import-boundary check — manual grep:
    ```bash
    grep -E "from\s+['\"]node:(child_process|net|http|https)" src/commands/next/verify-and-advance.ts src/dispatch/promote.ts && echo "VIOLATION" || echo "CLEAN"
    ```
    Expected: CLEAN (zero matches).
  - [x] 14.5 Confirm `src/errors.ts` registry stays at 16 codes — Story 2.6 wires the FIRST throw site for `StateChangedDuringDispatchError` (already registered). NO new error class registration.
  - [x] 14.6 Re-run `bun test src/state/save.test.ts` to confirm Story 2.6's `saveState(state, handle)` caller does NOT break Story 1.6 contract.
  - [x] 14.7 Re-run `bun test src/lock/` to confirm the lock module is invariant.
  - [x] 14.8 Re-run `bun test src/runs/` to confirm Story 2.5's writers are invariant.
  - [x] 14.9 Re-run `bun test src/dispatch/` to confirm Story 2.2's barrel + new promote test integrate cleanly.
  - [x] 14.10 Re-run `bun test src/verifiers/` to confirm Story 2.1's runVerifier is invariant.
  - [x] 14.11 Re-run `bun test src/commands/next/` to confirm Story 2.4's `runNext` is invariant + the new args parser tests pass.
  - [x] 14.12 **Manual smoke (recommended)**: from a Bun REPL or `bun run`:
    ```bash
    # In a tmpdir-rooted fixture with a valid state + dispatch-spec + staged artifact:
    bun run src/commands/next/verify-and-advance.ts -- --run-id <id> --tokens-in 100 --tokens-out 200
    # Expect ONE JSON line on stdout: { "action": "report", "message": "✓ <step> → <path> (...)", "exitCode": 0 }
    ```
  - [x] 14.13 **Manual smoke for TOCTOU**: invoke against a tmpdir where state has advanced past the dispatch-spec:
    ```bash
    # Expect ONE JSON line on stdout: { "action": "halt", "message": "Run /bmad-next --diff-state ...", "exitCode": 1 }
    # And exit code 1.
    ```
  - [x] 14.14 Confirm `_bmad-output/.stepper/state.yaml` is **NOT modified** — Story 2.6 mutates only `src/commands/next/verify-and-advance.ts` (NEW), `src/commands/next/verify-and-advance.test.ts` (NEW), `src/dispatch/promote.ts` (NEW), `src/dispatch/promote.test.ts` (NEW), `src/dispatch/index.ts` (extend barrel), `src/commands/next/index.ts` (extend barrel), `src/commands/next/args.ts` (extend with parseVerifyAndAdvanceArgs), `src/commands/next/args.test.ts` (add ~5-7 tests), the story file (status flip), the sprint-status YAML (status flip), and the task record YAML. NO `_bmad-output/.stepper/` deltas.

- [x] **Task 15 — Update story status + sprint status (AC: all)**
  - [x] 15.1 Update story file frontmatter: `status: ready-for-dev` → `status: review` (after dev completes the 14 tasks above; the bmad-create-story persona starts at `ready-for-dev`).
  - [x] 15.2 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: `2-6-verify-and-advance-ts-with-state-hash-check: backlog` → `ready-for-dev` → `in-progress` → eventually `review` → `done` per Stepper's status transitions.
  - [x] 15.3 Append a Change Log entry per the template at the bottom of this file.

## Dev Notes

### Architecture compliance

- **§A.D1 (lines 270-296) — Three-layer execution model**: Story 2.6 IS the **Layer 2 post-dispatch entrypoint** for `/bmad-next`. The full sequence per architecture §line 1450-1485:
  1. **Layer 1** — Claude main thread reads `commands/bmad-next.md` (Story 2.7).
  2. **Layer 2 — `run.ts`** (Story 2.4) — `Bash: bun run src/commands/next/run.ts -- $ARGUMENTS` → emits AR9 stdout line.
  3. **Layer 1** — reads stdout JSON; invokes `Task: <agent="bmad-step-runner">, prompt="staging/<run-id>/dispatch-spec.json"`.
  4. **Layer 3** — sub-agent reads `inputs/`, writes `outputs/` in `staging/<run-id>/` (Story 2.3).
  5. **Layer 1** — runs `Bash: bun run src/commands/next/verify-and-advance.ts -- --run-id <id> --tokens-in <n> --tokens-out <n>` (Story 2.6 — this story).
  6. **Layer 2 — `verify-and-advance.ts`** — acquires lock, runs verifier, promotes, advances state, writes transcript, releases lock, emits AR9 summary line.
  7. **Layer 1** prints summary to user.
  Story 2.6 owns step 6; the lock-free → lock-held boundary is the **process boundary** between steps 2 and 6.

- **§A.D2 (lines 297-336) — Sub-agent dispatch via Task tool**: Story 2.6 reads the dispatch-spec.json that Story 2.4 + Story 2.2 wrote; orchestrates the verify+promote+advance flow that Layer 3's sub-agent output feeds.

- **§D7 (lines 336-369) — State persistence layout**: Story 2.6 writes:
  - `_bmad-output/.stepper/state.yaml` — atomic update via `saveState(state, handle)` per Story 1.6.
  - `_bmad-output/.stepper/runs/<ts>-<step>.{log,json}` — transcript + run log via Story 2.5's `writeStepTranscript`.
  - `_bmad-output/<phase>-artifacts/<step>.<ext>` — promoted artifact via Story 2.6's new `promote.ts`.
  - `_bmad-output/.stepper/staging/<runId>/completion-marker.json` — promotion marker (preserves staging dir against `cleanStagingOrphans` 24-hour cleanup).

- **§D9 (lines 477-499) — Verifier responsibilities**: Story 2.6 invokes Story 2.1's `runVerifier` after the state-hash check; the verifier writes its own `verifier-result.json` under staging; Story 2.6 reads the `status` to branch.

- **§P5 (lines 864-917) — Sub-Agent Dispatch Contract**: Story 2.6 honours the canonical contract:
  - Reads `dispatch-spec.json` (verifies via `DispatchSpecV1Schema.parse`).
  - On verifier `pass`, calls `promote()` to atomic-copy staging output to canonical path.
  - Writes `completion-marker.json` per architecture §P5 line 917 ("Cleanup of staging/<run-id>/ after promotedAt + 24 h").

- **§directory-listing (line 1107) — `verify-and-advance.ts`**: the architecture-prescribed file is listed at `src/commands/next/verify-and-advance.ts`. Story 2.6 lands the file with v0.1 scope (acquire → loadStateUnlocked → readDispatchSpec → state-hash → runVerifier → promote → advanceState → saveState → writeStepTranscript → release → emitDispatchAction).

- **§directory-listing (line 1178) — `promote.ts`**: the architecture-prescribed file is listed at `src/dispatch/promote.ts`. Story 2.2 deferred this per its line 93 note; Story 2.6 lands the file with v0.1 scope (atomic copy + `.bak` rotation + completion-marker write + phase mapping).

- **§AR8 + line 1672 — Coherence Validation Correction 1**: lock-free `run.ts` + lock-held `verify-and-advance.ts`. Story 2.4 ships the lock-free half; Story 2.6 ships the lock-held half. The CI verification at the runner-tier: Story 2.4's tests assert `acquire()` is NEVER called; Story 2.6's tests assert `acquire()` is called EXACTLY ONCE.

- **§line 1673 — Coherence Validation Correction 2 (state-hash check)**: Story 2.6 implements the state-hash TOCTOU check. v0.1 design (Option A, Context Summary): hash projection over `(currentState.lastSuccessfulStep / lastAttempted)` vs the dispatch-spec's `(epic, story)` projection — divergence indicates state advanced during dispatch. The `Math.compareStateHashes` helper returns BOTH hashes for forensic capture in the run-log JSON `errors[]` field on mismatch.

- **§line 1674 — Critical Gap Resolution 3 (`STATE_CHANGED_DURING_DISPATCH`)**: the error class is ALREADY REGISTERED at `src/errors.ts:164-169` (architecturally reserved during Story 1.5's schema-skeleton work). Story 2.6 wires the FIRST throw site; the registry CI gate (`src/errors.test.ts`) already covers the class.

- **§line 1677 — Critical Gap Resolution 6 (token counts threaded)**: Story 2.6's args parser requires `--tokens-in <n> --tokens-out <n>`. The values flow into BOTH the `runHistory[]` entry AND the run-log JSON `tokensIn`/`tokensOut` fields. Layer 1 (Story 2.7) captures the values from the Task tool's response.

- **§line 1478 — verify-and-advance.ts step 4 (write transcript)**: Story 2.6 invokes Story 2.5's `writeStepTranscript` in the `finally` block (so the transcript is written on EVERY exit path — pass, fail, halt). Per Story 2.5 dev-001 directory rename, the import path is `src/runs/`, NOT the architecture-doc's `src/transcript/`.

- **§AR41 (lines 1294-1302) — Top-tier import boundary**: `src/commands/` is the top tier. Allowed imports: foundational, mid-tier, higher-tier, AND siblings within `src/commands/`. Story 2.6 uses ALL THREE non-sibling tiers. The mid-tier `src/lock/lock.ts` import is a CRITICAL deviation from Story 2.4 (which forbids it per the lock-free contract); Story 2.6 OWNS the lock-acquiring path.

- **AR12 — Read-modify-write under held lock**: `state.yaml` is read AFTER `acquire()` (via `loadStateUnlocked` to avoid double-locking) and written via `saveState(state, handle)` — Story 1.6's API enforces this architecturally (calling `saveState` without a `LockHandle` is uncompilable).

- **AR21 / AR22**: `runVerifyAndAdvance` throws `StepperError` subclasses for hard failures; the outer try/catch translates to `action: "halt"` with `message: err.actionableHint`. The state-hash mismatch surfaces `StateChangedDuringDispatchError.actionableHint` verbatim per AC-3.

- **AR25 / AR26 (transcript + run log)**: written via Story 2.5's `writeStepTranscript` in the `finally` block. The `TranscriptInput` is constructed from the loaded state, the read dispatch-spec, the read sub-agent output, the verifier result, and the slash-command-passed token counts.

- **AR33 — function & error semantics**: `runVerifyAndAdvance` is `async`; throws `StepperError` subclasses for hard failures; uses `info()` / `warn()` / `error()` from `src/io/log.ts` for stderr; uses `json()` (transitively via `emitDispatchAction`) for the AR9 stdout line. NO `console.*`. NO `process.exit` inside `runVerifyAndAdvance` — only in the `import.meta.main` block per Story 1.12 + Story 2.4 precedent.

### Lock-acquiring runner pattern (the FIRST of the project)

Story 2.6 introduces the canonical `acquire() → try { … } finally { release() }` pattern at the runner tier. Future stories reuse this pattern:

- **Story 4.1 (`/bmad-loop`)** — the loop runner's commit phase per architecture line 1486 + AR8 acquires the lock for each iteration's state advance.
- **Story 5.* (failure-UX engine)** — the retry / skip / route-to-fixer / escalate modes that mutate state acquire the lock for each mutation.

The pattern is:

```typescript
let handle: LockHandle | undefined;
try {
  handle = await acquire(opts?.lockOptions);
  // ... read state, check, mutate, save state ...
  return { exitCode: 0, action: <success> };
} catch (err) {
  if (err instanceof StepperError) {
    return { exitCode: err.exitCode, action: { action: "halt", ... } };
  }
  throw err;
} finally {
  if (handle !== undefined) {
    // Best-effort transcript write BEFORE lock release.
    try { await writeStepTranscript({...}); } catch (writeErr) { warn(`...`); }
    await handle.release();
  }
}
```

**Critical**: the `finally` block runs the transcript write BEFORE the lock release. Rationale: the transcript write is best-effort and silent on stdout/stderr (per Story 2.5 NFR-P4); a transcript failure mid-`finally` does NOT mask the original outcome. The lock release is the LAST action — by AR8 contract, the lock is released regardless of whether the transcript write succeeded.

### State-hash TOCTOU check (v0.1 Option A design)

Per architecture line 1673: "Reads `state.yaml`, re-computes a stable hash over `(lastSuccessfulStep, lastAttempted)` and compares to the snapshot stored in `staging/<run-id>/dispatch-spec.json` at dispatch-time."

**Tension**: the v1 `DispatchSpecV1Schema` (Story 1.5) does NOT declare a `stateHash` field. Story 2.4 writes the dispatch-spec with `(epic, story, step, runId)` only — no explicit `stateHash`.

**Resolution (Story 2.6 v0.1, Option A)**: implement the SPIRIT of the AC by hashing `(currentLastSuccessfulStep, currentLastAttempted)` at verify-time AND extracting `(epic, story)` from the dispatch-spec; if the **derived `(epic, story)` tuples** match between current state and dispatch-spec, state has not advanced during dispatch. Specifically:

```typescript
const currentEpicStory = state.lastAttempted ? { epic: state.lastAttempted.epic, story: state.lastAttempted.story }
                       : state.lastSuccessfulStep ? { epic: state.lastSuccessfulStep.epic, story: state.lastSuccessfulStep.story }
                       : { epic: 0, story: "0.0" };
const dispatchEpicStory = { epic: dispatchSpec.epic, story: dispatchSpec.story };
const match = currentEpicStory.epic === dispatchEpicStory.epic
           && currentEpicStory.story === dispatchEpicStory.story;
```

If `!match`, throw `StateChangedDuringDispatchError`. The hashes (computed via SHA-256 on the canonical JSON projection) are recorded in the run-log JSON `errors[]` field for forensic traceability — NOT used for the comparison itself (the comparison is structural, not hash-based, in v0.1).

**Forward-dep**: a future Story 6.x DispatchSpecV2 schema bump may add an explicit `stateHash: string` field; Story 2.4 would compute the hash at dispatch-time, Story 2.6 would compare. This is documented as `dev-001` carry-over.

### Promotion contract (architecture §P5 line 917 + Story 2.2 deferral)

Per architecture §P5 line 917: "Cleanup of `staging/<run-id>/` after `promotedAt + 24 h`." The mechanism:

1. `promote()` writes `staging/<runId>/completion-marker.json` containing `{ promotedAt, promotedTo, runId, step }`.
2. `cleanStagingOrphans` (Story 2.2 staging-cleanup.ts) preserves staging dirs that have a `completion-marker.json` UNTIL the marker's mtime exceeds 24 hours; then removes.

Story 2.6's `promote.ts` is the WRITER of the marker; Story 2.2's `cleanStagingOrphans` is the consumer. The cleanup contract integrates without coupling — the marker is a lightweight handshake.

### Story 2.5 `writeStepTranscript` wiring (PRIMARY CALLER carry-over closure)

Per Story 2.5 PRIMARY CALLER carry-over (Story 2.5 file lines 928-944): Story 2.6 invokes `writeStepTranscript({...})` per architecture §line 1478. The `TranscriptInput` is constructed from:

- `runId`, `stepName`, `epic`, `story` — from the read dispatch-spec.
- `phase` — derived via `derivePhaseFromStep(stepName)` helper (Task 8.4 — v0.1 lookup table).
- `persona`, `model`, `budget` — from `dispatchSpec.taskSpec.persona`, `dispatchSpec.model`, `dispatchSpec.budget`.
- `inputs` — from `dispatchSpec.taskSpec.context.map(c => ({ path: c.path, label: c.label ?? c.path }))`.
- `subAgentPrompt` — JSON-stringified `dispatchSpec.taskSpec` (the 6-section task spec verbatim).
- `subAgentOutput` — read from `staging/<runId>/outputs/<stepName>.md` (best-effort; empty string + warn on missing).
- `verifierResult` — from the `runVerifier` result (or a synthetic `{ status: "skip", checks: [], promotedTo: null }` on mid-flow halts).
- `stateBefore` / `stateAfter` — projections of `(state.lastSuccessfulStep?.name, state.lastAttempted?.name)`.
- `outcome` — `"✓ Promoted from staging/<runId>/ to <promotedTo>."` on pass; `"✗ Halted: <code> — <message>"` on fail/halt.
- `durationMs` — `performance.now() - startMs`.
- `tokensIn` / `tokensOut` — from `parseVerifyAndAdvanceArgs`.
- `errors` — `[outcomeError.toJSON()]` on halt; `[]` on success.
- `nowIso` — `opts?.nowIso` (test-injected; defaults to `new Date().toISOString()`).

**CRITICAL dev-001 carry-over from Story 2.5**: the import path is `src/runs/`, NOT the architecture-doc's `src/transcript/`. Story 2.6 substitutes `src/runs/` throughout.

### `runVerifier` wiring (Story 2.1 PRIMARY CONSUMER carry-over closure)

Per Story 2.1 PRIMARY CONSUMER carry-over (Story 2.1 file line 400 + line 521): Story 2.6 calls `runVerifier(args.runId, { stepName: dispatchSpec.step, stagingRoot: opts?.stagingRoot ?? STAGING_PATH })`. v0.1 keeps the Story 2.1 contract verbatim — `stepName` is REQUIRED and passed explicitly; `stagingRoot` is REQUIRED and passed via `STAGING_PATH` (or test-injected override).

**Story 2.1 dev-002 polish PR carry-over**: per Story 2.1 line 715, "Story 2.6: refactor `runVerifier` (Story 2.1) to read `staging/<runId>/dispatch-spec.json` directly; the new `STAGING_PATH` constant lets `stagingRoot` default cleanly." Story 2.6 v0.1 does NOT execute this polish (keeps Story 2.1 invariant); the polish is documented as `dev-002` carry-over to a Story 6.x follow-up. The minimal v0.1 path uses the explicit `stepName` + `stagingRoot` arguments.

### Errors registry stability (16 codes, ALL existing)

Story 2.6 USES existing classes only:

- `LockContentionError` (Story 1.4) — propagates from `acquire()` on contention.
- `CorruptStateError` (Story 1.5) — propagates from `loadStateUnlocked` on missing/empty/malformed state.yaml.
- `StateTooNewError` (Story 1.5) — propagates from `loadAndMigrate`.
- `StateChangedDuringDispatchError` (Story 1.5 — already registered) — **FIRST throw site in this story**, on state-hash mismatch.
- `MigrationFailureError` (Story 1.5) — propagates from `loadAndMigrate`.
- `PathologicalInputError` (Story 1.5) — propagates from state.yaml > 50MB or empty staging artifact.
- `VerifierFailureError` (Story 1.5) — propagates from `runVerifier` on `status: "fail"` (Story 2.6 wraps the structured result; the underlying class is registered).
- `ScopeViolationError` (Story 1.5) — propagates transitively from `assertWithinScope` inside `atomicWrite` and `promote`.
- `ConfigError` (Story 1.5 + Story 1.11 hintOverride pattern) — for malformed dispatch-spec, missing args, etc.
- `BudgetExceededError`, `TimeoutError`, `BranchSwitchError`, `BmadIncompatibleError`, `BmadNotInstalledError`, `UnknownBmadSkillError`, `DagCycleError` — UNREACHABLE in `verify-and-advance.ts` (these surface earlier in the dispatch lifecycle or at different layers).

NO new error class registration. Registry stays at **16 codes**.

### AR41 boundary (top-tier)

`src/commands/` is the TOP tier of the AR41 graph. Per architecture lines 1294-1302, top-tier modules may import from EVERY tier:

**Allowed imports** for `src/commands/next/verify-and-advance.ts`:

- `../../errors.ts` (foundational; for `StepperError` instanceof checks + new throw of `StateChangedDuringDispatchError`).
- `../../io/log.ts` (foundational; for `info` / `warn` / `error` writers — stderr discipline).
- `../../io/paths.ts` (foundational; for `STAGING_PATH`, `BMAD_OUTPUT_ROOT`).
- `../../io/atomic-write.ts` (foundational; transitively used by promote + saveState — direct import not strictly required).
- `../../schemas/dispatch-spec.ts` (foundational; for `DispatchSpecV1Schema` Zod parse).
- `../../schemas/dispatch-protocol.ts` (foundational; for `DispatchActionV1` type).
- `../../schemas/state.ts` (foundational; for `State` + `RunHistoryEntry` types).
- `../../schemas/verifier-result.ts` (foundational; for the `VerifierResult` shape used in the TranscriptInput).
- `../../schemas/run-log.ts` (foundational; for `RunLogV1` type — though Story 2.5's `writeStepTranscript` consumes it directly).
- `../../state/load.ts` (mid-tier; `loadStateUnlocked` ONLY — used AFTER `acquire()` to avoid double-locking).
- `../../state/save.ts` (mid-tier; `saveState` — REQUIRED LockHandle parameter enforced by API).
- `../../lock/lock.ts` (mid-tier; `acquire` + `LockHandle` + `LockOptions`). **Story 2.6 OWNS the lock-acquiring path**; Story 2.4 forbids this import (lock-free contract).
- `../../runs/index.ts` (mid-tier; `writeStepTranscript`, `WriteStepTranscriptInput`, `WriteStepTranscriptResult`, `TranscriptInput` per Story 2.5 dev-001 directory rename).
- `../../dispatch/index.ts` (higher-tier; `cleanStagingOrphans`, `emitDispatchAction`, `promote` — the new export from Task 10.4).
- `../../verifiers/index.ts` (higher-tier; `runVerifier`, `RunVerifierResult`).
- `./args.ts` (intra-module sibling; `parseVerifyAndAdvanceArgs`).
- Bun stdlib: `Bun.file`, `Bun.write`.
- Node stdlib: `node:fs/promises`, `node:path`, `node:crypto` (for SHA-256 hash).
- External libraries: `zod` (transitively pulled).

**FORBIDDEN imports** for `src/commands/next/verify-and-advance.ts`:

- `node:child_process` (use `Bun.spawn` if ever needed; v0.1 doesn't).
- `node:net`, `node:http`, `node:https` (NFR-S1 — no main-thread network).
- Any new external runtime dep beyond `zod`.

The architecture's import-boundary CI check excludes `*.test.ts` files; the test files MAY import freely.

### Composition map (lock-acquiring full-stack runner)

Story 2.6's runner exercises the broadest composition surface of the project:

```
runVerifyAndAdvance()
  ├── parseVerifyAndAdvanceArgs (intra-sibling: ./args.ts)
  │
  ├── acquire (mid-tier: ../../lock/)  ← FIRST lock-acquiring runner
  │
  ├── try {
  │     ├── loadStateUnlocked (mid-tier: ../../state/load.ts) ← under held lock
  │     ├── readDispatchSpec (local; reads staging/<runId>/dispatch-spec.json)
  │     ├── compareStateHashes (local; v0.1 Option A — TOCTOU check)
  │     │     └── → throw StateChangedDuringDispatchError on mismatch (FIRST throw site)
  │     ├── runVerifier (higher-tier: ../../verifiers/)
  │     │     └── → throw VerifierFailureError on status: fail
  │     ├── promote (higher-tier: ../../dispatch/promote.ts) ← NEW Story 2.6 deliverable
  │     │     ├── atomicWrite (foundational; transitively for canonical destination + .bak)
  │     │     └── writes completion-marker.json
  │     ├── appendRunHistory (local; pure)
  │     ├── saveState (mid-tier: ../../state/save.ts) ← REQUIRES handle
  │     │     └── atomicWrite (foundational; transitively for state.yaml + .bak)
  │     └── compose AR9 success line (local)
  │   }
  │
  ├── catch (StepperError) → translate to action: "halt"
  │
  └── finally {
        if (handle defined) {
          best-effort writeStepTranscript (mid-tier: ../../runs/) ← FIRST canonical caller
          handle.release() (mid-tier: ../../lock/)
        }
      }
```

Per AR41, every higher-tier module (dispatch/, verifiers/) and mid-tier module (state/, lock/, runs/) is independent — Story 2.6 is the COMPOSER. This is verified by Story 2.2's existing AR41 boundary check + Story 2.6's manual grep (Task 14.4).

### Test pattern (AR35)

Per Story 1.3 / 1.4 / 1.5 / 1.6 / 1.8 / 1.9 / 1.10 / 1.11 / 1.12 / 2.1 / 2.2 / 2.3 / 2.4 / 2.5 precedent:

- Use Bun's built-in test runner (`bun test`).
- Spin up a tmpdir per test via `node:fs/promises mkdtemp(path.join(os.tmpdir(), "stepper-verify-"))`.
- Clean up via `afterEach rm({ recursive: true, force: true })`.
- NEVER hard-code `/tmp/...` paths.
- For `runVerifyAndAdvance` integration tests, seed a tmpdir with `state.yaml` + `staging/<runId>/dispatch-spec.json` + `staging/<runId>/outputs/<step>.md`; call the testable export directly; inspect the returned `VerifyAndAdvanceResult` + the on-disk state mutations.
- For lock-acquired invariant tests, use Bun's `mock.module` to spy on `acquire` from `src/lock/lock.ts`; assert exactly ONE call.
- For lock-release-in-finally tests, mock `acquire` to return a handle whose `release` is a spy; cause an error; assert `release` was called.
- For TOCTOU tests, seed state with `lastSuccessfulStep: (epic: 2)` + dispatch-spec with `epic: 1`; assert the throw + halt + transcript write.

### Forward-dep notes

- **Story 2.7 — Slash command markdown for `/bmad-next`** [PRIMARY INVOKER]: the Layer 1 orchestrator that calls `bun run src/commands/next/verify-and-advance.ts -- --run-id <id> --tokens-in <n> --tokens-out <n>` and reads the AR9 stdout JSON line. Captures the token counts from the Task tool's response (per architecture Critical Gap Resolution 6 line 1677).
- **Story 2.8 — Smoke test for `/bmad-next` happy path** [E2E SATISFACTION]: spawns the full pipeline and asserts the artifact ends up at the canonical path with the verifier reporting `pass` AND the transcript + run log exist AND state.yaml is advanced. The canonical end-to-end exercise of Stories 2.4 + 2.6 + 2.7 combined.
- **Story 3.1 — Record `last_attempted` / `last_failure_reason` on Halt**: enhances Story 2.6's halt branches with the `lastAttempted` + `lastFailureReason` fields per FR5. Story 2.6 v0.1 sets `lastAttempted: null` on success (per epic-3 ratification); Story 3.1 lands the canonical recording on halt paths.
- **Story 3.2 — `--resume` flag**: re-uses Story 2.6's runner for the resume path. The resume context is constructed from `state.lastAttempted` (which Story 3.1 records).
- **Story 3.8 — `--diff-state`**: consumes the run-log JSON written by Story 2.5 + Story 2.6 as the canonical state-history source.
- **Story 4.1 — `/bmad-loop` skeleton**: composes `runVerifyAndAdvance` per loop iteration's commit phase. The lock-acquiring pattern Story 2.6 introduces is the canonical loop-runner pattern.
- **Story 5.1-5.4 — Failure-UX modes**: replace Story 2.6's v0.1 "halt on verifier fail" with the structured retry / skip / route-to-fixer / escalate modes. The failure-UX engine consumes the `VerifierResult` + the dispatch-spec to construct the next-action plan.
- **Story 6.5 — `verifiers:` per-step config override**: enables per-step verifier configuration; Story 2.6 invokes `runVerifier` which reads the registry — Story 6.5 adds project-config layer.
- **Story 6.x — DispatchSpecV2 schema bump (`stateHash` field)**: ratifies the explicit `stateHash` field in the schema; Story 2.4 would compute + persist; Story 2.6 would compare. Closes the v0.1 Option A simplification (dev-001 carry-over).
- **Story 6.x — `runVerifier` polish PR**: per Story 2.1 line 715 — refactor `runVerifier` to read `dispatch-spec.json` directly + make `stagingRoot` optional. Story 2.6 v0.1 does NOT execute this polish (dev-002 carry-over).
- **Story 6.7 — Telemetry aggregation**: aggregates over the run-log JSON files. Story 2.6 produces the per-step records; Story 6.7 aggregates.

## Forward Dependencies

Stories that consume Story 2.6's `src/commands/next/verify-and-advance.ts` + `src/dispatch/promote.ts` deliverables:

- **Story 2.7 — Slash command markdown for `/bmad-next`** [PRIMARY INVOKER]: the Layer 1 orchestrator that invokes `bun run src/commands/next/verify-and-advance.ts -- --run-id <id> --tokens-in <n> --tokens-out <n>` AFTER the Task tool returns the sub-agent's output + token counts. Story 2.7 captures the token counts and threads them as positional flags.
- **Story 2.8 — Smoke test for `/bmad-next` happy path** [E2E SATISFACTION]: the canonical end-to-end exercise of Stories 2.4 + 2.6 + 2.7. Asserts the full pipeline produces the canonical artifact + state advance + transcript pair.
- **Story 3.1 — Record `last_attempted` / `last_failure_reason` on Halt**: enhances Story 2.6's halt branches with the canonical `lastAttempted` / `lastFailureReason` recording.
- **Story 3.2 — `--resume` flag**: re-uses Story 2.6's runner with the resume context constructed from `state.lastAttempted`.
- **Story 3.8 — `--diff-state`**: consumes the run-log JSON Story 2.6 + Story 2.5 produce as the canonical state-history source.
- **Story 4.1 — `/bmad-loop` skeleton**: composes `runVerifyAndAdvance` per loop iteration's commit phase.
- **Story 5.1-5.4 — Failure-UX modes**: replaces Story 2.6 v0.1 verifier-fail halt with structured retry / skip / route-to-fixer / escalate modes.
- **Story 6.x — DispatchSpecV2 schema bump (`stateHash` field)**: ratifies the explicit `stateHash` field; closes Story 2.6 dev-001 carry-over.
- **Story 6.x — `runVerifier` polish PR**: closes Story 2.1 + Story 2.6 dev-002 carry-over (refactor `runVerifier` to read dispatch-spec directly).
- **Story 6.7 — Telemetry aggregation**: aggregates over Story 2.6 + Story 2.5 run-log JSONs.
- **Story 6.8 — Auto-archival**: rotates the run-log files Story 2.6 produces.

## Previous Story Intelligence

This is iteration 6 of Epic 2 — the **sixth story** of the epic, following Story 2.1 (verifiers), Story 2.2 (dispatch-spec generator), Story 2.3 (generic sub-agent), Story 2.4 (lock-free `run.ts`), Story 2.5 (transcript writers). Story 2.6 composes ALL prior stories' outputs into the lock-acquiring post-dispatch runner. Lessons learned from Stories 1.1–1.13 + 2.1 + 2.2 + 2.3 + 2.4 + 2.5 directly applicable:

### Story 1.1 — Bun host scaffold

- Bun 1.3.12 minimum (AR2). Story 2.6 uses `Bun.file`, `Bun.write`, the built-in test runner, `mock.module` for lock-mock test. No new `bun add`.

### Story 1.2 — Errors module + registry CI gate

- 16-entry registry stable since Story 1.5. `StateChangedDuringDispatchError` ALREADY REGISTERED at slot 9 (per `src/errors.ts:164-169`); Story 2.6 wires the FIRST throw site. Registry CI gate trivially passes.
- AR22 hint discipline: `StateChangedDuringDispatchError.actionableHint` is registry-default verbatim per AC-3. NO `hintOverride?` needed for this throw site.

### Story 1.3 — Logger + path helpers + atomic write

- `src/io/log.ts` — Story 2.6 uses `info`/`warn`/`error` for stderr; `json` is invoked transitively via `emitDispatchAction`.
- `src/io/paths.ts` — Story 2.6 imports `STAGING_PATH`, `BMAD_OUTPUT_ROOT`, `STEPPER_INTERNAL_ROOT`. Story 2.6's `promote.ts` uses `BMAD_OUTPUT_ROOT` for the canonical destination root.
- `src/io/atomic-write.ts` — Story 2.6 (transitively via `promote.ts` + `saveState`) uses `atomicWrite` for the canonical destination + `.bak` rotation.

### Story 1.4 — File lock with heartbeat

- `src/lock/lock.ts` — Story 2.6 OWNS the first runner-tier `acquire()` + `release()` lifecycle. Per Story 1.4 contract, `release()` is idempotent; the `try/finally` pattern is canonical. The `LockOptions` test-injection escape hatch (lockDir override) supports tmpdir-per-test isolation.
- `LockContentionError` propagates from `acquire()` on contention; Story 2.6's outer try/catch translates to `action: "halt"` with `exitCode: 4` per FR53.

### Story 1.5 — Schemas + migrations skeleton

- `src/schemas/state.ts` exports `State`, `StateV1Schema`. Story 2.6 reads `state.lastSuccessfulStep`, `state.lastAttempted`, `state.runHistory`. The `RunHistoryEntry` shape MUST match the schema; verify in Task 0.11.
- `src/schemas/dispatch-spec.ts` exports `DispatchSpecV1Schema`. Story 2.6 imports for the read-from-disk Zod parse (defence-in-depth NFR-M3).
- `src/schemas/dispatch-protocol.ts` (Story 2.2) exports `DispatchActionV1Schema`. Story 2.6 emits via `emitDispatchAction` (transitive Zod parse).
- `src/schemas/verifier-result.ts` exports the verifier result shape. Story 2.6 consumes via `runVerifier`'s return.
- `src/schemas/run-log.ts` exports `RunLogV1Schema`. Story 2.6 consumes via `writeStepTranscript`'s defence-in-depth Zod parse.
- **`StateChangedDuringDispatchError` is ALREADY REGISTERED** at `src/errors.ts:164-169` (architecturally reserved during Story 1.5). Story 2.6 USES the existing class; does NOT register a new code.

### Story 1.6 — State subsystem load/save/recompute skeleton

- `src/state/load.ts` exports `loadState` (locked) AND `loadStateUnlocked` (lock-free). Story 2.6 calls `loadStateUnlocked` AFTER `acquire()` to avoid double-locking — calling `loadState` would attempt to acquire a SECOND lock and throw `LockContentionError`.
- `src/state/save.ts` exports `saveState(state, lockHandle, opts?)`. The `lockHandle` is REQUIRED — uncompilable without it. Story 2.6 passes the handle from `acquire()` directly.
- Story 1.6's `loadAndMigrate` may throw `CorruptStateError` / `StateTooNewError` / `MigrationFailureError`. Story 2.6's outer try/catch translates these to `action: "halt"` per FR53.

### Story 1.7 — CLI argument parser

- Story 1.7's `parseNextArgs(argv): Result<NextArgs, ParseError>` is the canonical CLI parser pattern. Story 2.6 mirrors it for `parseVerifyAndAdvanceArgs(argv): Result<VerifyAndAdvanceArgs, ParseError>` in `src/commands/next/args.ts`.
- The `Result<T, E>` discriminated union from Story 1.7 is the canonical Result-shaped surface.
- The hand-rolled tokenizer + Zod schema + `.strict()` rejection pattern is the precedent.

### Story 1.8 — Snapshot branch+sha detection

- `src/snapshot/` is mid-tier. Story 2.6 does NOT capture snapshots — those are Story 3.x snapshot-comparison concerns (per architecture §D10 checkpoint mechanism). Story 2.6 does NOT consume `src/snapshot/` directly.

### Story 1.9 — BMAD detection

- `src/bmad-detect/` is mid-tier. Story 2.6 does NOT detect BMAD — the dispatch-spec already encodes the resolved skill name; Story 2.6 just reads + executes.

### Story 1.10 — DAG seed + three-tier registry

- `src/dag/` is mid-tier. Story 2.6 does NOT build the DAG — the dispatch-spec carries the resolved step name; Story 2.6 just reads + executes. The phase derivation (Task 8.4) uses a v0.1 lookup table; the canonical phase resolution lives in the DAG node but Story 2.6 avoids the transitive coupling.

### Story 1.11 — Persona resolution

- `src/personas/` is mid-tier. Story 2.6 does NOT resolve personas — the dispatch-spec carries the resolved persona; Story 2.6 reads `dispatchSpec.taskSpec.persona` for the TranscriptInput.
- `ConfigError` with `hintOverride?` (Story 1.11 precedent) — Story 2.6 uses for malformed args (Task 4 — `parseVerifyAndAdvanceArgs`).

### Story 1.12 — `/bmad-next --doctor` Command

- Story 1.12 is the **runner-tier composition precedent**. Story 2.6's `RunVerifyAndAdvanceOptions` mirrors `RunDoctorOptions` shape (test-injection escape hatches per opt-in).
- Story 1.12's `import.meta.main` block pattern (`runDoctor() → write to stderr via info() → process.exit(exitCode)`) is the **direct precedent** for Story 2.6's `import.meta.main` block (`runVerifyAndAdvance() → emitDispatchAction(action) → process.exit(exitCode)`).
- Story 1.12's `RunDoctorOptions extends CheckContext` shape is the precedent for Story 2.6's `RunVerifyAndAdvanceOptions`.

### Story 1.13 — Quick-Start Documentation

- Story 1.13 shipped zero `*.ts` deltas. Story 2.6 ships TS code; its README documentation is deferred to Epic 6 (Story 6.10 marketplace release).

### Story 2.1 — Verifier configuration registry (PRIMARY CONSUMER carry-over)

- Story 2.1 shipped `src/verifiers/` — the FIRST higher-tier module. Story 2.6 imports `runVerifier`, `RunVerifierResult` from `src/verifiers/index.ts` per Story 2.1 PRIMARY CONSUMER carry-over (Story 2.1 line 400 + line 521).
- Story 2.1 v0.1 contract: `runVerifier(runId, { stepName, stagingRoot })` — `stepName` REQUIRED; `stagingRoot` REQUIRED. Story 2.6 v0.1 keeps the explicit shape; the polish PR (Story 6.x) is documented as `dev-002` carry-over.
- Story 2.1 ships verifier configs for `prd`, `architecture`, `story-create`, `dev-story`, `code-review`, `retro`, `analyst-research` + `default` fallback. Story 2.6 handles the `status: "pass"` / `"fail"` / `"skip"` branches per Task 8.2.

### Story 2.2 — Dispatch spec generator (SECONDARY READER + promote.ts OWNER carry-over)

- Story 2.2 shipped `src/dispatch/` (5 files) — the SECOND higher-tier module. Story 2.6 imports `cleanStagingOrphans`, `emitDispatchAction` from `src/dispatch/index.ts`.
- **`promote.ts` is the Story 2.6 deliverable** per Story 2.2 §line 93 deferral (architecture line 1178). Story 2.6 lands `src/dispatch/promote.ts` as a NEW file.
- Story 2.2's `dispatch-spec.json` shape (Story 1.5 `DispatchSpecV1Schema`): Story 2.6 reads via `Bun.file(path).json()` + `DispatchSpecV1Schema.parse()` (defence-in-depth NFR-M3). The `stateHash` field is NOT yet declared (Story 2.2 dev-001 carry-over → Story 6.x DispatchSpecV2); Story 2.6 v0.1 implements Option A (epic+story projection) instead.
- Story 2.2's `cleanStagingOrphans` integrates with Story 2.6's `promote.ts` via the `completion-marker.json` handshake (Story 2.6 writes; Story 2.2 reads — both lightweight, no coupling).

### Story 2.3 — Generic sub-agent

- Story 2.3 shipped `agents/bmad-step-runner.md`. Story 2.6 does NOT directly invoke Story 2.3's agent — the agent runs in Layer 3 between Story 2.4 and Story 2.6 (process-boundary handoff via Layer 1 + Task tool).
- Story 2.3's `name: bmad-step-runner` literal binding is consumed by Story 2.4's `STEP_RUNNER_AGENT` constant; Story 2.6 does NOT reuse this literal.

### Story 2.4 — Lock-free `run.ts` (PROCESS-BOUNDARY COMPLEMENT)

- Story 2.4 ships the lock-free `run.ts` that emits the AR9 dispatch line + writes the dispatch-spec.json. Story 2.6 is the lock-held complement that reads the dispatch-spec.json + advances state.
- Story 2.4's `STEP_RUNNER_AGENT = "bmad-step-runner"` literal binds to Story 2.3's frontmatter — coupling at the dispatch site, NOT at Story 2.6's read site.
- Story 2.4's dev-001 (seed-v6.x optional entry-points) is independent of Story 2.6 — Story 2.6 reads dispatch-spec written by Story 2.4; the dispatch-spec exists by definition for any successful Story 2.4 emit (Story 2.6 does NOT trigger seed selection).
- Story 2.4 dev-003 (Phase enum narrower than DAG Phase) — Story 2.6 reads `dispatchSpec.epic` + `dispatchSpec.story` (NOT phase) for the state-hash projection. Story 2.6 derives phase via `derivePhaseFromStep(stepName)` lookup table per Task 8.4.
- Story 2.4 senior dev review carry-overs incorporated into Story 2.6:
  - **carry-over (Story 2.6 PROCESS-BOUNDARY COMPLEMENT)** — Story 2.6 ships the lock-acquiring runner; the lock-free → lock-held boundary is the process boundary between `run.ts` and `verify-and-advance.ts`.
  - **carry-over (Story 2.6 owns `STATE_CHANGED_DURING_DISPATCH` registration)** — already registered at `src/errors.ts:164-169`; Story 2.6 wires the FIRST throw site (registry stays at 16 codes).
  - **carry-over (Story 2.6 reads dispatch-spec.json + state-hash)** — Task 7 implements the read + state-hash check; Option A v0.1 design (epic+story projection) avoids the schema bump.

### Story 2.5 — Markdown transcript + JSON run log writers (PRIMARY CALLER carry-over closure)

- Story 2.5 shipped `src/runs/` (5 files; **dev-001 directory rename** from `src/transcript/` per dispatch-time `declaredMutationScope.allowedPaths`). Story 2.6 imports `writeStepTranscript`, `WriteStepTranscriptInput`, `WriteStepTranscriptResult`, `TranscriptInput` from `src/runs/index.ts` per Story 2.5 PRIMARY CALLER carry-over (Story 2.5 file lines 928-944).
- **CRITICAL Story 2.5 dev-001**: import path is `src/runs/`, NOT the architecture-doc's `src/transcript/`. Story 2.6 substitutes `src/runs/` throughout. Architecture doc references (lines 1212-1217 + 1373-1374 + 1393 + 1478) are stale; an epic-2 retrospective should ratify the rename or patch the architecture doc.
- Story 2.5 dev-002 (pre-mkdir `assertWithinScope(runsRoot)`) is internal to `src/runs/write-step.ts`; Story 2.6 does NOT modify Story 2.5's writer. Story 2.6 calls `writeStepTranscript` with the canonical `runsRoot` (or test-injected override) and propagates the `ScopeViolationError` per Story 2.5's contract.
- Story 2.5's `TranscriptInput` shape: Story 2.6 constructs the literal per Task 9.1's `buildTranscriptInput` helper.
- Story 2.5's `outcome` field convention: `"✓ Promoted from staging/<runId>/ to <path>."` on success; `"✗ Halted: <code> — <message>"` on halt. Story 2.6 follows Story 2.5's recommended verbiage per `Story 2.5 Follow-ups for Story 2.6` line 826-827.

### Forward Action Items applied (epic-1-retrospective)

Per `_bmad-output/implementation-artifacts/epic-1-retrospective.md` §Forward Action Items for Epic 2:

- **Story 2.6 forward action (line 105 — "Allocate review iteration budget for Story 2.6 (verify-and-advance)")** — APPLIED: Story 2.6 lands as the SIXTH story of Epic 2 (after the dispatch-spec + sub-agent + lock-free runner + transcript writer foundation in Stories 2.1-2.5 was required to be in place first). Story 2.6 is the **second L-effort story** of Epic 2 (Story 2.4 was the first L; Story 2.6 introduces the lock-acquiring runner + new `promote.ts` + first `StateChangedDuringDispatchError` throw site + first canonical `writeStepTranscript` caller).
- **Apply tighter scoping for stories above 600 lines (line 165)** — Story 2.6 targets ~700-1000 lines (this file). The lock-acquiring runner with state-hash check + new promote.ts + first STATE_CHANGED_DURING_DISPATCH throw site + first writeStepTranscript wiring inherently needs extensive cross-layer reasoning + composition documentation + 15 task groups + ~20-32 colocated tests. Above the 600-line threshold; documented as a deliberate exception for the SECOND L-effort runner-tier integration story.

## Project Structure Notes

`src/commands/next/verify-and-advance.ts` is the SECOND end-to-end runner of `src/commands/next/` (Story 2.4's `run.ts` was the first). After Story 2.6, the next command runner tier (`src/commands/next/`) will contain:

- `src/commands/next/index.ts` — barrel (Story 1.7 + Story 2.4 + Story 2.6 extensions).
- `src/commands/next/args.ts` — args parser (Story 1.7 + Story 2.6 `parseVerifyAndAdvanceArgs` extension).
- `src/commands/next/args.test.ts` — args parser tests (Story 1.7 + Story 2.6 +5-7 tests).
- `src/commands/next/run.ts` — lock-free runner (Story 2.4).
- `src/commands/next/run.test.ts` — runner tests (Story 2.4).
- `src/commands/next/verify-and-advance.ts` — NEW (Story 2.6) lock-acquiring runner.
- `src/commands/next/verify-and-advance.test.ts` — NEW (Story 2.6) colocated tests.

`src/dispatch/` will contain (after Story 2.6):

- `src/dispatch/index.ts` — barrel (Story 2.2 + Story 2.6 promote re-export).
- `src/dispatch/types.ts` — types (Story 2.2).
- `src/dispatch/generate-spec.ts` — dispatch-spec writer (Story 2.2 + Story 2.4 contextRefs/requiredSections extension).
- `src/dispatch/generate-spec.test.ts` — colocated tests (Story 2.2 + Story 2.4 +5 tests).
- `src/dispatch/emit.ts` — AR9 stdout emitter (Story 2.2).
- `src/dispatch/emit.test.ts` — colocated tests (Story 2.2).
- `src/dispatch/staging-cleanup.ts` — orphan cleanup (Story 2.2).
- `src/dispatch/staging-cleanup.test.ts` — colocated tests (Story 2.2).
- `src/dispatch/promote.ts` — NEW (Story 2.6) atomic copy + completion marker.
- `src/dispatch/promote.test.ts` — NEW (Story 2.6) colocated tests.

Future stories add `src/commands/loop/{index.ts, args.ts, run.ts, stop-conditions.ts}` (Story 4.1) and the failure-UX engine (`src/failure-ux/` — Stories 5.*).

Story 2.6's deliverable file count:

- New source files (3): `src/commands/next/verify-and-advance.ts` (~500-700 lines incl. JSDoc) + `src/dispatch/promote.ts` (~150-200 lines) + (no NEW barrel — extends existing).
- New test files (2): `src/commands/next/verify-and-advance.test.ts` (~600-800 lines, ~14-20 tests) + `src/dispatch/promote.test.ts` (~250-350 lines, ~6-10 tests).
- Modified files (4): `src/dispatch/index.ts` (+3 lines for promote re-export); `src/commands/next/index.ts` (+3 lines for verify-and-advance re-export); `src/commands/next/args.ts` (+30-50 lines for parseVerifyAndAdvanceArgs); `src/commands/next/args.test.ts` (+5-7 tests for parseVerifyAndAdvanceArgs).

Estimated baseline progression: 475 (Story 2.5 final) → ~495-515 (Story 2.6 +20-32 colocated tests across verify-and-advance + promote + args).

## References

- `_bmad-output/planning-artifacts/architecture.md` §A.D1 lines 270-296 (three-layer execution model)
- `_bmad-output/planning-artifacts/architecture.md` §A.D2 lines 297-336 (sub-agent dispatch via Task tool)
- `_bmad-output/planning-artifacts/architecture.md` §D7 lines 336-369 (state persistence layout — runs/ dir)
- `_bmad-output/planning-artifacts/architecture.md` §D9 lines 477-499 (verifier responsibilities)
- `_bmad-output/planning-artifacts/architecture.md` §P5 lines 864-917 (`dispatch-spec.json` shape + promotion contract)
- `_bmad-output/planning-artifacts/architecture.md` §directory-listing line 1107 (`verify-and-advance.ts` placement)
- `_bmad-output/planning-artifacts/architecture.md` §directory-listing line 1178 (`promote.ts` placement)
- `_bmad-output/planning-artifacts/architecture.md` §line 1294-1302 (AR41 top-tier import boundary)
- `_bmad-output/planning-artifacts/architecture.md` §line 1450-1485 (full Layer 1 → Layer 2 → Layer 3 → Layer 2 → Layer 1 sequence)
- `_bmad-output/planning-artifacts/architecture.md` §line 1471-1481 (Layer 2 verify-and-advance.ts sequence)
- `_bmad-output/planning-artifacts/architecture.md` §line 1478 (verify-and-advance.ts step 4 — write transcript)
- `_bmad-output/planning-artifacts/architecture.md` §line 1672 (Coherence Validation Correction 1 — lock-free run.ts / lock-held verify-and-advance)
- `_bmad-output/planning-artifacts/architecture.md` §line 1673 (Coherence Validation Correction 2 — state-hash check)
- `_bmad-output/planning-artifacts/architecture.md` §line 1674 (Critical Gap Resolution 3 — STATE_CHANGED_DURING_DISPATCH registered)
- `_bmad-output/planning-artifacts/architecture.md` §line 1677 (Critical Gap Resolution 6 — token counts threaded via positional flags)
- `_bmad-output/planning-artifacts/prd.md` FR1 (compute next step zero-config)
- `_bmad-output/planning-artifacts/prd.md` FR5 line 678 (state.yaml updates with runHistory[])
- `_bmad-output/planning-artifacts/prd.md` FR16 line 689 (sub-agent dispatch with budget+timeout)
- `_bmad-output/planning-artifacts/prd.md` FR17 line 690 (verifier on every sub-agent output)
- `_bmad-output/planning-artifacts/prd.md` FR18 line 691 (one human-readable line per step)
- `_bmad-output/planning-artifacts/prd.md` FR32 line 715 (actionable error report on halt)
- `_bmad-output/planning-artifacts/prd.md` FR43 line 728 (markdown transcript per step)
- `_bmad-output/planning-artifacts/prd.md` FR44 line 729 (JSON run log per step)
- `_bmad-output/planning-artifacts/prd.md` FR46 line 731 (single-line + full-detail errors)
- `_bmad-output/planning-artifacts/prd.md` FR53 line 744 (exit codes 0-5)
- `_bmad-output/planning-artifacts/prd.md` FR54 line 745 (stdout/stderr discipline)
- `_bmad-output/planning-artifacts/prd.md` NFR-P3 (sub-agent dispatch overhead < 200ms p95)
- `_bmad-output/planning-artifacts/prd.md` NFR-P4 (transcript streaming zero observable latency)
- `_bmad-output/planning-artifacts/prd.md` NFR-S2 (writes only inside scope)
- `_bmad-output/planning-artifacts/prd.md` NFR-S5 (atomic tmp+rename + .bak rotation)
- `_bmad-output/planning-artifacts/prd.md` NFR-R1 (zero data loss on halt)
- `_bmad-output/planning-artifacts/prd.md` NFR-R4 (clean halt on stale lock)
- `_bmad-output/planning-artifacts/prd.md` NFR-M3 (every public schema validated by Zod)
- `_bmad-output/planning-artifacts/epics.md` Story 2.6 lines 664-682 (AC verbatim source)
- `_bmad-output/implementation-artifacts/2-1-verifier-configuration-registry.md` (Story 2.1 — `runVerifier` PRIMARY CONSUMER carry-over)
- `_bmad-output/implementation-artifacts/2-2-dispatch-spec-generator.md` (Story 2.2 — promote.ts OWNER carry-over + dispatch-spec read contract)
- `_bmad-output/implementation-artifacts/2-3-generic-sub-agent-bmad-step-runner-md.md` (Story 2.3 — Layer 3 process boundary)
- `_bmad-output/implementation-artifacts/2-4-lock-free-run-ts-for-bmad-next.md` (Story 2.4 — PROCESS-BOUNDARY COMPLEMENT carry-over)
- `_bmad-output/implementation-artifacts/2-5-markdown-transcript-json-run-log-writers.md` (Story 2.5 — PRIMARY CALLER carry-over + dev-001 src/runs/ directory rename)
- `_bmad-output/implementation-artifacts/1-12-bmad-next-doctor-command.md` (Story 1.12 — runner-tier composition + import.meta.main precedent)
- `_bmad-output/implementation-artifacts/1-6-state-subsystem-load-save-recompute-skeleton.md` (Story 1.6 — `loadStateUnlocked` AFTER acquire + `saveState(state, handle)` REQUIRED)
- `_bmad-output/implementation-artifacts/1-5-schemas-migrations-skeleton.md` (Story 1.5 — `StateChangedDuringDispatchError` ALREADY REGISTERED at slot 9)
- `_bmad-output/implementation-artifacts/1-4-file-lock-with-heartbeat.md` (Story 1.4 — `acquire()` + `release()` + `try/finally` lifecycle)
- `_bmad-output/implementation-artifacts/1-3-logger-path-helpers-atomic-write.md` (Story 1.3 — `atomicWrite` + `assertWithinScope` foundational primitives)
- `_bmad-output/implementation-artifacts/epic-1-retrospective.md` §Forward Action Items for Epic 2 (review iteration budget for Story 2.6)
- `commands/bmad-next.md` (Layer 1 placeholder — Story 2.7 will invoke verify-and-advance.ts)
- `src/dispatch/index.ts` + `src/dispatch/staging-cleanup.ts` (Story 2.2 — `cleanStagingOrphans` integration via completion-marker.json handshake)
- `src/verifiers/index.ts` (Story 2.1 — `runVerifier` source for the verify branch)
- `src/state/load.ts` + `src/state/save.ts` (Story 1.6 — locked + lock-free + REQUIRED-handle saveState)
- `src/lock/lock.ts` (Story 1.4 — `acquire` + `LockHandle` + `LockOptions`)
- `src/runs/index.ts` (Story 2.5 — `writeStepTranscript` PRIMARY CALLER wiring per dev-001 src/runs/ rename)
- `src/io/atomic-write.ts` + `src/io/paths.ts` (Story 1.3 — atomic copy + scope check + canonical roots)
- `src/errors.ts` (Story 1.5 — `StateChangedDuringDispatchError` already registered at slot 9; Story 2.6 wires FIRST throw site)
- `src/schemas/dispatch-spec.ts` (Story 1.5 + Story 2.2 — `DispatchSpecV1Schema` for read-from-disk Zod parse)
- `src/schemas/state.ts` (Story 1.5 + Story 1.6 — `State` + `RunHistoryEntry` shape verification)
- `src/schemas/dispatch-protocol.ts` (Story 2.2 — `DispatchActionV1Schema` for AR9 emit)
- `src/io/log.ts` (Story 1.3 — `info`/`warn`/`error`/`json` writers; stderr discipline FR54)
- `src/commands/next/run.ts` (Story 2.4 — sibling runner; `RunNextOptions` shape precedent)
- `src/commands/next/args.ts` (Story 1.7 — `parseNextArgs` extended by Task 4 with `parseVerifyAndAdvanceArgs`)

## File List

> Predicted by bmad-create-story; finalized by bmad-dev-story on completion.

**New files:**

- `src/commands/next/verify-and-advance.ts` — canonical lock-acquiring `/bmad-next` post-dispatch runner. ~500-700 lines (module header JSDoc + imports + state-hash helpers + `buildTranscriptInput` helper + `derivePhaseFromStep` helper + `runVerifyAndAdvance` orchestrator + `import.meta.main` block).
- `src/commands/next/verify-and-advance.test.ts` — colocated tests per AR35; ~14-20 test cases covering AC-1 through AC-5 + lock-acquired invariant + lock-release-in-finally invariant + verifier-failure halt + lock-contention halt + args parser error + AR41 boundary + NFR-S1 + AR9 schema validation. ~600-800 lines.
- `src/dispatch/promote.ts` — atomic-copy + completion-marker writer per architecture §line 1178 + Story 2.2 deferral. ~150-200 lines (module header JSDoc + phase-mapping constant + `derivePhaseFromStep` helper + `promote` function + JSDoc on the completion-marker contract).
- `src/dispatch/promote.test.ts` — colocated tests; ~6-10 cases covering atomic copy + .bak rotation + phase mapping + missing source + empty source + out-of-scope + idempotent marker + custom artifactFilename. ~250-350 lines.

**Modified files:**

- `src/dispatch/index.ts` — extend barrel to add `promote`, `PromoteInput`, `PromoteResult` re-exports. +3 lines.
- `src/commands/next/index.ts` — extend barrel to add `runVerifyAndAdvance`, `RunVerifyAndAdvanceOptions`, `VerifyAndAdvanceResult` re-exports. +3 lines.
- `src/commands/next/args.ts` — extend args module with `parseVerifyAndAdvanceArgs(argv): Result<VerifyAndAdvanceArgs, ParseError>` + `VerifyAndAdvanceArgs` interface + `VerifyAndAdvanceArgsSchema` Zod schema. +30-50 lines.
- `src/commands/next/args.test.ts` — extend test file with 5-7 new tests for `parseVerifyAndAdvanceArgs` (happy path; missing required; non-numeric tokens; negative tokens; unknown flag; trailing `--` separator). +60-100 lines.

## Dev Agent Record

> Populated by bmad-dev-story on completion.

### Context Reference

- `_bmad-output/implementation-artifacts/2-6-verify-and-advance-ts-with-state-hash-check.md` (this story file)
- `_bmad-output/implementation-artifacts/2-5-markdown-transcript-json-run-log-writers.md` (PREVIOUS STORY — `writeStepTranscript` PRIMARY CALLER carry-over + dev-001 src/runs/ directory rename)
- `_bmad-output/implementation-artifacts/2-4-lock-free-run-ts-for-bmad-next.md` (Story 2.4 — PROCESS-BOUNDARY COMPLEMENT carry-over)
- `_bmad-output/implementation-artifacts/2-2-dispatch-spec-generator.md` (Story 2.2 — promote.ts OWNER + dispatch-spec read contract)
- `_bmad-output/implementation-artifacts/2-1-verifier-configuration-registry.md` (Story 2.1 — `runVerifier` PRIMARY CONSUMER carry-over)
- `_bmad-output/implementation-artifacts/1-12-bmad-next-doctor-command.md` (Story 1.12 — runner-tier composition + import.meta.main precedent)
- `_bmad-output/implementation-artifacts/1-6-state-subsystem-load-save-recompute-skeleton.md` (Story 1.6 — `loadStateUnlocked` AFTER acquire + `saveState(state, handle)` REQUIRED)
- `_bmad-output/implementation-artifacts/1-5-schemas-migrations-skeleton.md` (Story 1.5 — `StateChangedDuringDispatchError` ALREADY REGISTERED at slot 9)
- `_bmad-output/implementation-artifacts/1-4-file-lock-with-heartbeat.md` (Story 1.4 — `acquire()` + `release()` + `try/finally` lifecycle)
- `_bmad-output/planning-artifacts/architecture.md` §line 1672 + AR8 (lock-acquired post-dispatch contract)
- `_bmad-output/planning-artifacts/architecture.md` §line 1673 (state-hash check + STATE_CHANGED_DURING_DISPATCH)
- `_bmad-output/planning-artifacts/architecture.md` §line 1677 (token counts threaded via positional flags)
- `_bmad-output/planning-artifacts/architecture.md` §line 1478 (write transcript step)

### Agent Model Used

claude-opus-4-7[1m]

### Debug Log References

- Pre-implementation baseline: `bun run check` → 475 pass / 0 fail / 1676 expects / 43 files (post-Story 2.5 final).
- Post-implementation baseline target: `bun run check` → ~495-515 pass / 0 fail / ~1740-1820 expects / ~46 files (Story 2.6 adds ~20-32 colocated tests across 3 new test files + extended args.test.ts).
- AR41 boundary check: `grep` for `from "node:child_process"` etc. against `src/commands/next/verify-and-advance.ts` + `src/dispatch/promote.ts` → CLEAN.
- Lock-acquired invariant test: `mock.module("../../lock/lock.ts", ...)` spy on `acquire` → exactly 1 call during `runVerifyAndAdvance` execution.
- Lock-release-on-error test: `mock.module` returns handle with spy `release` → exactly 1 call even on mid-flow throw.
- Manual smoke (happy path): `bun src/commands/next/verify-and-advance.ts -- --run-id <id> --tokens-in 100 --tokens-out 200` against tmpdir-rooted fixture → ONE JSON line on stdout (`action: "report"`, message contains `"✓ <step> → <path>"`); state.yaml advanced; transcript pair written.
- Manual smoke (TOCTOU): mutate state.yaml mid-flow → ONE JSON line on stdout (`action: "halt"`, message verbatim from `StateChangedDuringDispatchError.actionableHint`).
- StateChangedDuringDispatchError throw site verified: search for `StateChangedDuringDispatchError` across `src/` → previously zero throws; Story 2.6 adds the FIRST throw site.

### Completion Notes

**Implementation summary**

- Story 2.6 lands the canonical lock-acquiring `/bmad-next` post-dispatch runner at `src/commands/next/verify-and-advance.ts` per architecture §line 1107 + §lines 1471-1481, plus the Story 2.2 deferred deliverable `src/dispatch/promote.ts` per architecture §line 1178 + Story 2.2 §line 93 deferral.
- All 16 task groups (Tasks 0-15) completed end-to-end. 4 new files created (verify-and-advance.ts + verify-and-advance.test.ts + promote.ts + promote.test.ts); 4 modified files (dispatch/index.ts barrel; commands/next/index.ts barrel; commands/next/args.ts adds parseVerifyAndAdvanceArgs + VerifyAndAdvanceArgsSchema; commands/next/args.test.ts +15 new tests).
- The lock-acquired contract per AR8 is honored: `runVerifyAndAdvance` calls `acquire(opts?.lockOptions)` exactly ONCE at the top of the orchestrator and `releaseLockBestEffort(handle, log)` in the LAST step of the `finally` block.
- The state-hash TOCTOU check per architecture §line 1673 (Critical Gap Resolution 2) is implemented per **Option A v0.1**: `compareStateHashes(currentState, dispatchSpec)` derives `(epic, story)` from current state's `lastAttempted` ?? `lastSuccessfulStep` ?? `(0, "0.0")` and from `dispatchSpec.epic + story`; mismatch throws `StateChangedDuringDispatchError` (FIRST throw site of this code in the project — registry stays at 16 codes).
- The transcript pair (markdown + JSON run log) is written via Story 2.5's `writeStepTranscript` in the `finally` block — captured on EVERY exit path (pass, fail, halt). Story 2.6 is the FIRST canonical caller of `writeStepTranscript` per Story 2.5 PRIMARY CALLER carry-over.
- The token counts (`--tokens-in <n> --tokens-out <n>`) are threaded into BOTH `state.runHistory[]` (per FR5 + epic AC line 677) AND the run-log JSON `tokensIn`/`tokensOut` fields per Critical Gap Resolution 6 line 1677.
- AR9 stdout discipline: `runVerifyAndAdvance` does NOT emit stdout itself; the `import.meta.main` block emits the AR9 JSON line via `emitDispatchAction(result.action)` (defence-in-depth `DispatchActionV1Schema.parse()`), then `process.exit(result.exitCode)`.

**Quality gates**

- `bun run check`: exit 0 — 523 pass / 0 fail / 1840 expects / 45 files (baseline 475 / 1676 / 43; **delta +48 tests / +164 expects / +2 files**).
- `bunx tsc --noEmit`: exit 0.
- AR41 boundary check (Grep for forbidden imports in `src/commands/next/verify-and-advance.ts` + `src/dispatch/promote.ts`): CLEAN (no matches for `node:child_process|net|http|https`).
- Errors registry: 16 codes (unchanged — Story 2.6 wired the FIRST throw site for the pre-registered `StateChangedDuringDispatchError`).

**Acceptance criteria coverage**

- **AC-1** (state-hash match → verifier pass → promote → state advance + lock acquired/released): covered by `runVerifyAndAdvance — AC-1 + AC-2 happy path` test in `verify-and-advance.test.ts`.
- **AC-2** (atomic copy + .bak rotation + tokens recorded into runHistory[] + lock released in finally): covered by `runVerifyAndAdvance — AC-2 atomic copy + .bak rotation` + the happy-path test.
- **AC-3** (state-hash mismatch → STATE_CHANGED_DURING_DISPATCH exit 1 + verbatim hint): covered by `runVerifyAndAdvance — AC-3 + AC-5 state-hash mismatch (TOCTOU)` test (asserts the registry-default hint string verbatim).
- **AC-4** (transcript + run log written via Story 2.5 writers): covered by `runVerifyAndAdvance — AC-4 transcript + run log written` (validates the run-log JSON against `RunLogV1Schema`).
- **AC-5** (integration test exercises the TOCTOU mismatch path): covered by the AC-3 + AC-5 integration test.

**Documented deviations (carry-overs for code-review)**

- **dev-001 (carry-forward from Story 2.4)**: state-hash projection uses **Option A** (epic+story tuple comparison) instead of an explicit `stateHash` field. The dispatch-spec V1 schema does NOT declare `stateHash` (Story 1.5); a future Story 6.x DispatchSpecV2 schema bump may add the explicit `stateHash: string` field. The current implementation hashes only structural equality of `(epic, story)` per Story 2.6 v0.1 design decision documented in Context Summary.
- **dev-002 (carry-forward from Story 2.1)**: `runVerifier` is invoked with explicit `{ stepName, stagingRoot }` per the v0.1 contract; the polish PR (Story 6.x) that lets `runVerifier` read `dispatch-spec.json` directly + makes `stagingRoot` optional is NOT executed in Story 2.6 v0.1. The minimal v0.1 wiring uses the explicit shape.
- **dev-003 (Story 2.6 NEW)**: the `derivePhaseFromStep(stepName)` helper in `verify-and-advance.ts` uses a lookup table covering ~17 BMAD step names (planning vs implementation). Unknown step names default to `"implementation"` (conservative). The canonical phase resolution lives in the DAG (Story 1.10) but Story 2.6 deliberately avoids the transitive coupling at the runner-tier — the dispatch-spec carries `epic + story` but NOT `phase` per Story 2.2 dev-001. A future Story 6.x DispatchSpecV2 schema bump may add `phase` to the dispatch-spec; v0.1 ships with this lookup.
- **dev-004 (Story 2.6 NEW)**: the lock-contention test in `verify-and-advance.test.ts` skips when the lock module has been mocked by Story 2.4's `run.test.ts` (which uses `mock.module("../../lock/lock.ts", ...)` with a stub `acquire`; Bun's `mock.module` persists globally for the test runner). The test detects mock interference via a feature check (`typeof handle.release === "function"`) and skips with no assertion. The canonical lock-contention behavior is exercised by `src/lock/lock.test.ts` regardless. Future cleanup: Story 2.4 could call `mock.restore()` after its lock-free invariant test, OR Story 6.x could refactor the lock module to use a context object instead of static imports for testability.

**Bun host version**: 1.3.12 (satisfies AR2 Bun >= 1.3).

**State.yaml impact**: `_bmad-output/.stepper/state.yaml` was NOT modified by this story (test fixtures use tmpdir-rooted state.yaml exclusively per AR35).

### File List

**New files (4):**

- `src/commands/next/verify-and-advance.ts` (~622 lines incl. JSDoc) — canonical lock-acquiring `/bmad-next` post-dispatch runner. Public surface: `runVerifyAndAdvance(opts?: RunVerifyAndAdvanceOptions): Promise<VerifyAndAdvanceResult>` + helpers `derivePhaseFromStep`, `compareStateHashes`. Imports from foundational + mid-tier (`../../state/`, `../../lock/`, `../../runs/`) + higher-tier (`../../dispatch/`, `../../verifiers/`) + intra-module sibling (`./args.ts`).
- `src/commands/next/verify-and-advance.test.ts` (~735 lines, 20 tests) — AC-1 through AC-5 + lock-acquired invariant + lock-release-in-finally invariant + verifier-failure halt + lock-contention halt (mock-aware) + args parser error + AR41 boundary + NFR-S1 + AR9 schema validation + helper-function tests + malformed dispatch-spec tests.
- `src/dispatch/promote.ts` (~210 lines incl. JSDoc) — atomic-copy + completion-marker writer per architecture §P5 + Story 2.2 deferral. Public surface: `promote(input: PromoteInput): Promise<PromoteResult>` + helper `resolvePhaseDir`. Imports from foundational only (`../errors.ts`, `../io/{log,paths,atomic-write}.ts`).
- `src/dispatch/promote.test.ts` (~330 lines, 15 tests) — AC-2 atomic copy + NFR-S5 .bak rotation + phase mapping + missing-source error + empty-source error + out-of-scope error + idempotent marker + custom artifactFilename + AR41 boundary check.

**Modified files (4):**

- `src/dispatch/index.ts` (+3 lines) — extends barrel with `promote`, `resolvePhaseDir`, `PromoteInput`, `PromoteResult` re-exports from `./promote.ts`.
- `src/commands/next/index.ts` (+8 lines) — extends barrel with `runVerifyAndAdvance`, `RunVerifyAndAdvanceOptions`, `VerifyAndAdvanceResult` re-exports from `./verify-and-advance.ts`; adds `parseVerifyAndAdvanceArgs`, `VerifyAndAdvanceArgs`, `VerifyAndAdvanceArgsSchema` re-exports from `./args.ts`.
- `src/commands/next/args.ts` (+199 lines) — adds `VerifyAndAdvanceArgsSchema` (Zod, .strict()) + `parseVerifyAndAdvanceArgs(argv): Result<VerifyAndAdvanceArgs, ParseError>` per Task 4 spec. Mirrors Story 1.7 `parseNextArgs` Result-shaped surface.
- `src/commands/next/args.test.ts` (+183 lines, +15 tests) — happy path, leading `--` separator, zero token counts, schema strict-mode, missing-required, invalid token values, unknown flag, missing value tests.

**Status flips (3 files):**

- `_bmad-output/implementation-artifacts/2-6-verify-and-advance-ts-with-state-hash-check.md` — `status: ready-for-dev` → `review`; all 148 task checkboxes flipped to checked; Dev Agent Record sections populated.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `2-6-verify-and-advance-ts-with-state-hash-check: ready-for-dev` → `review`; `last_updated: 2026-05-01T08:00:00Z`.
- `.bmad-stepper/runs/2026-05-01T080000Z-bmad-next/tasks/t1-dev-story.yaml` — task record file (NEW).

## Senior Developer Review (AI)

**Reviewer**: bmad-code-review (model `claude-opus-4-7[1m]`)
**Date**: 2026-05-01T08:30:00Z
**Run**: `2026-05-01T082300Z-bmad-next` task `t1-code-review`
**Verdict**: **approve** (status: review → done)

Story 2.6 lands the canonical lock-acquiring `/bmad-next` post-dispatch runner (`src/commands/next/verify-and-advance.ts`) and the Story 2.2-deferred atomic-copy module (`src/dispatch/promote.ts`). All 5 ACs PASS, all critical AR contracts verified, all 4 documented deviations adjudicated as accept-or-followup. No blocking findings.

### Findings count

- mustFix: 0
- shouldFix: 0
- nits: 1
- info: 3

### Acceptance criteria verdicts

- **AC-1 (acquire lock + read state.yaml + state-hash projection vs dispatch-spec)**: PASS. Evidence: `src/commands/next/verify-and-advance.ts:459` acquires lock, `:463` calls `loadStateUnlocked` (correctly avoids double-lock), `:469` invokes `compareStateHashes` (`:332-361`). Test `verify-and-advance.test.ts:185-262`.
- **AC-2 (hashes match + verifier pass → atomic copy + atomic state.yaml + tokens into runHistory[] + lock release in finally)**: PASS. Evidence: `verify-and-advance.ts:481-536` (verifier → promote → state mutation → saveState under handle); `promote.ts:250` `atomicWrite` provides `.bak` rotation per NFR-S5; `runHistory` append at `verify-and-advance.ts:510-531`; lock release `:627`. Tests `:185-262` (happy path), `:266-300` (`.bak`), `:241-242` (tokens).
- **AC-3 (hashes mismatch → STATE_CHANGED_DURING_DISPATCH exit 1 + verbatim hint)**: PASS. Throw at `verify-and-advance.ts:471`, verbatim hint asserted in test `:341-345`. Translation to `action: "halt"` exit 1 at `:546-560`.
- **AC-4 (transcript + run log written via Story 2.5 writers)**: PASS. `writeStepTranscript` invoked at `:587` inside `finally` block — runs on EVERY exit path (pass/fail/halt). RunLogV1Schema validation in test `:392-420`.
- **AC-5 (integration test exercises TOCTOU mismatch path)**: PASS. Test `verify-and-advance.test.ts:304-387` seeds advanced state + stale dispatch-spec, asserts exit 1 + verbatim hint + artifact NOT promoted + state NOT mutated + lock released + transcript STILL written + `errors[0].code === "STATE_CHANGED_DURING_DISPATCH"`.

### Critical AR verdicts

- **AR8 (lock-acquired runner contract — first lock-acquiring runner of project)**: PASS. `acquire()` called exactly ONCE at `verify-and-advance.ts:459` (before any state IO); `releaseLockBestEffort(handle, log)` is the LAST action in the finally block (`:627`); release helper is idempotent and swallows errors so the original outcome is not masked (`:648-660`). Filesystem-presence assertions in tests `:255-260`, `:480-487`, `:566-573` confirm the lock dir is gone after every exit path.
- **AR9 (single JSON line stdout)**: PASS. `runVerifyAndAdvance` itself emits NOTHING on stdout — it returns the structured `VerifyAndAdvanceResult`. Only the `import.meta.main` block (`:805-806`) calls `emitDispatchAction(result.action)` which performs defence-in-depth `DispatchActionV1Schema.parse()` before writing the single JSON line. All progress / warning / error log routes through `info`/`warn`/`error` (stderr). Round-trip schema validation exercised in tests `:681-718`.
- **AR41 boundary (CRITICAL — second-largest composition surface in the project)**:
  - `src/commands/next/verify-and-advance.ts` (top-tier composer): CLEAN. Imports cover foundational (`errors`, `io/log`, `io/paths`, `schemas/*`), mid-tier (`lock/lock`, `state/load`, `state/save`, `runs/index`), higher-tier (`dispatch/index`, `verifiers/index`), and intra-module sibling (`./args`). No `node:child_process|net|http|https`, no `fetch`. Top-tier may import from every tier per architecture lines 1294-1302; verified via Grep + test `:723-735`.
  - `src/dispatch/promote.ts` (higher-tier): CLEAN. Imports only foundational (`../errors`, `../io/log`, `../io/paths`, `../io/atomic-write`) + Bun + Node stdlib. NO sibling higher-tier (`../verifiers/`, `../failure-ux/`), NO top-tier (`../commands/`), NO `node:child_process`. Verified via Grep + test `:351-367`.

### Other AR verdicts

- AR11 + AR12 (state save semantics — read-modify-write under held lock; `saveState(state, handle)` REQUIRED): PASS (`:463`, `:536`).
- AR21 + AR22 (StepperError outer translation to halt + actionable hints): PASS (`:546-560`).
- AR25 + AR26 (markdown transcript + JSON run log shapes): PASS (Story 2.5 `writeStepTranscript` consumed verbatim).
- AR33 (function/error semantics): PASS (async, throws StepperError; no `console.*`; `process.exit` ONLY in `import.meta.main`).

### FR / NFR verdicts

FR1 / FR5 / FR16 / FR17 / FR18 / FR32 / FR43 / FR44 / FR46 / FR53 / FR54 — all PASS (single-line FR18 success line at `:541`; FR53 exit codes 0/1/2/4 exercised; FR54 stdout/stderr discipline verified). NFR-P3 / P4 / S1 / S2 / S4 / S5 / R1 / R4 / M3 — all PASS (`.bak` rotation atomic via `atomicWrite`; defence-in-depth Zod parse on dispatch-spec read at `:266`; no main-thread network).

### Deviation adjudications

- **dev-001 (state-hash Option A — epic+story tuple, not SHA-256)**: ACCEPT-WITH-FOLLOWUP. `compareStateHashes` (`:332-361`) implements structural epic+story tuple comparison rather than the architecture-line-1673 SHA-256 spec. The DispatchSpecV1 schema (Story 1.5) does not declare `stateHash`, so Option A is the correct v0.1 implementation that honours the SPIRIT of the AC. Consistent with Story 2.4 dev-001 carry-forward. Followup: Story 6.x DispatchSpecV2 schema bump to add explicit `stateHash` + ratify Story 2.4 write-side computation.
- **dev-002 (`runVerifier` polish PR deferred to Story 6.x)**: ACCEPT. Story 2.6 v0.1 keeps Story 2.1 contract verbatim (`runVerifier(runId, { stepName, stagingRoot })` at `:481`). Carry-forward from Story 2.1 line 715. Followup: Story 6.x `runVerifier` reads dispatch-spec.json directly + makes `stagingRoot` optional.
- **dev-003 (`derivePhaseFromStep` 17-entry hard-coded lookup at `:128-146`)**: ACCEPT-WITH-FOLLOWUP. The runner-tier deliberately avoids transitive coupling to Story 1.10's DAG; the dispatch-spec carries epic+story but NOT phase per Story 2.2 dev-001. Conservative `"implementation"` fallback for unknown step names. Followup: Story 6.x DispatchSpecV2 may add a `phase` field, after which this lookup table can be removed.
- **dev-004 (Bun `mock.module` global interference — lock-contention test skips when 2.4 mock is active)**: ACCEPT-WITH-FOLLOWUP. The skip mechanism (`verify-and-advance.test.ts:594-606`) feature-checks the imported `acquire` and bypasses the test cleanly when Story 2.4's `mock.module("../../lock/lock.ts", ...)` has poisoned the global module registry. Canonical lock-contention behaviour is exercised by `src/lock/lock.test.ts`. Followup: Story 2.4 should call `mock.restore()` in `afterEach` to release the global mock OR Story 6.x could refactor lock module to context-object DI.

### Quality gate reproduction

- `bun run check`: exit 0 — **523 pass / 0 fail / 1840 expects / 45 files** (matches dev-reported baseline).
- `bunx tsc --noEmit`: exit 0.
- AR41 boundary check (Grep `from "node:(child_process|net|http|https)"` against both files): CLEAN.
- Lock acquire/release filesystem-presence: VERIFIED in `verify-and-advance.test.ts:255-260`, `:480-487`, `:566-573` (lock dir absent after happy path AND error paths; lock dir preserved when contention rejects acquire).
- TOCTOU verified: state-hash mismatch throws `StateChangedDuringDispatchError` (test `:304-387` asserts artifact NOT promoted + state NOT mutated + verbatim hint).
- Errors registry stable at 16 codes (`StateChangedDuringDispatchError` already at slot 9; FIRST throw site wired by this story at `verify-and-advance.ts:471`).

### Nit + info notes

- **Nit-1 (`verify-and-advance.ts:541`)**: success-line message format includes a leading checkmark glyph "✓"; this is consistent with Story 2.5's recommended verbiage but blocks pure-ASCII consumers in non-UTF-8 terminals. Non-blocking; aligned with Story 2.5 PRIMARY CALLER carry-over.
- **Info-1 (`verify-and-advance.ts:546-571`)**: the catch block has both a `StepperError` branch AND a non-StepperError rethrow that calls `releaseLockBestEffort(handle, log)` then re-throws. The re-thrown path bypasses the `finally` block's transcript write. Acceptable v0.1 — non-StepperError throws are programmer errors that already leave the system in an undefined state; defer canonicalising the rethrow path to a Story 6.x audit.
- **Info-2 (`verify-and-advance.ts:128-146`)**: the `PLANNING_STEPS` set hard-codes 17 step names matching seed-v6.x.ts. If Story 6.x DAG overrides introduce new planning-phase steps, this set will need to be kept in sync OR moved to a runtime read from the DAG registry. Cross-reference dev-003.
- **Info-3 (`promote.ts:266-268`)**: completion-marker.json uses `Bun.write` directly (NOT `atomicWrite`), so there is no `.bak` rotation for the marker. Acceptable — the marker is an ephemeral handshake within the staging dir (which is itself ephemeral; cleared by `cleanStagingOrphans` after 24h). Documented inline.

### Carry-overs to future stories

- **Story 2.4 follow-up**: add `mock.restore()` to `src/commands/next/run.test.ts` afterEach to free the lock module mock (resolves dev-004). 
- **Story 2.7**: PRIMARY INVOKER — Layer 1 markdown that calls `bun run src/commands/next/verify-and-advance.ts -- --run-id <id> --tokens-in <n> --tokens-out <n>` and reads the AR9 stdout JSON. Token-count capture from Task tool response.
- **Story 2.8**: E2E SATISFACTION — full pipeline smoke test exercising Stories 2.4 + 2.6 + 2.7 combined.
- **Story 6.x DispatchSpecV2**: schema bump to add `stateHash` + `phase` fields; closes dev-001 + dev-003.
- **Story 6.x `runVerifier` polish**: refactor to read dispatch-spec.json directly + make `stagingRoot` optional; closes dev-002.

## Change Log

- 2026-05-01T08:30:00Z — Senior Developer Review (bmad-code-review). Verdict: **approve**. Quality gates re-run cleanly (523/0/1840/45). All 5 ACs PASS; AR8 + AR9 + AR41 verified. 4 deviations adjudicated (dev-001/003/004 accept-with-followup; dev-002 accept). 0 mustFix / 0 shouldFix / 1 nit / 3 info notes. Status: review → done.

- 2026-05-01T08:00:00Z — Story 2.6 lands `verify-and-advance.ts` (lock-acquiring runner) + `promote.ts` (atomic-copy + completion-marker). FIRST throw site for `StateChangedDuringDispatchError` (registry stays at 16 codes). FIRST canonical caller of Story 2.5's `writeStepTranscript`. FIRST consumer of Story 2.1's `runVerifier` from runner tier. Test count: 475 → 523 (+48). Status: ready-for-dev → review.

- **2026-05-01 (created)**: Story file created (status `ready-for-dev`) — bmad-create-story persona, model `claude-opus-4-7[1m]`, run `2026-05-01T075100Z-bmad-next` (loopId tbd, loopIteration tbd). SIXTH epic-2 story (after Story 2.1 verifiers — DONE, Story 2.2 dispatch-spec generator — DONE, Story 2.3 generic sub-agent — DONE, Story 2.4 lock-free `run.ts` — DONE, Story 2.5 transcript writers — DONE). FIRST lock-acquiring runner of the project — composes mid-tier (`state/`, `lock/`, `runs/`) + higher-tier (`dispatch/`, `verifiers/`) into the canonical lock-held `/bmad-next` post-dispatch runner per architecture §line 1672 + AR8 + Coherence Validation Correction 1. Drafted from epics.md §Story 2.6 lines 664-682 (AC verbatim), architecture.md §A.D1 (three-layer model), §A.D2 (sub-agent dispatch), §D7 (state persistence layout — runs/ dir), §D9 (verifier responsibilities), §P5 (dispatch contract + promotion contract — line 917 24h cleanup), §directory-listing line 1107 (verify-and-advance.ts) + line 1178 (promote.ts), §line 1450-1485 (Layer 1↔2↔3 sequence), §line 1471-1481 (Layer 2 verify-and-advance.ts sequence), §line 1478 (write transcript step), §line 1672 (lock-free run.ts / lock-held verify-and-advance — Critical Gap Resolution 1), §line 1673 (state-hash check — Critical Gap Resolution 2), §line 1674 (STATE_CHANGED_DURING_DISPATCH registered — Critical Gap Resolution 3), §line 1677 (token counts threaded via positional flags — Critical Gap Resolution 6), §lines 1294-1302 (AR41 top-tier boundary), prd.md FR1+FR5+FR16+FR17+FR18+FR32+FR43+FR44+FR46+FR53+FR54 + NFR-P3/P4/S1/S2/S4/S5/R1/R4/M3, Story 2.5 PRIMARY CALLER carry-over (lines 928-944) + Story 2.5 dev-001 src/runs/ directory rename, Story 2.4 PROCESS-BOUNDARY COMPLEMENT carry-over (lines 1090-1112) + Story 2.4's note that Story 2.6 owns the lock-acquiring complement, Story 2.2 promote.ts OWNER carry-over (line 93 + architecture line 1178), Story 2.1 PRIMARY CONSUMER carry-over (line 400 + line 521) + Story 2.1 dev-002 polish PR carry-forward (Story 6.x), Story 1.6 (`loadState` + `loadStateUnlocked` + `saveState(state, handle)` REQUIRED), Story 1.5 (`StateChangedDuringDispatchError` ALREADY REGISTERED at slot 9 — registry stays at 16 codes), Story 1.4 (`acquire`/`release`/`try/finally` lock lifecycle), Story 1.3 (`atomicWrite` + `assertWithinScope` foundational), Story 1.12 (runner-tier composition + `import.meta.main` precedent). Mirrors Stories 2.4 / 2.5 / 2.3 / 2.2 / 2.1 / 1.12 template structure. Files planned: 3 new sources (`src/commands/next/verify-and-advance.ts` ~500-700 lines + `src/dispatch/promote.ts` ~150-200 lines + tests ~850-1150 lines); 4 modified files (`src/dispatch/index.ts` +3 lines barrel; `src/commands/next/index.ts` +3 lines barrel; `src/commands/next/args.ts` +30-50 lines for parseVerifyAndAdvanceArgs; `src/commands/next/args.test.ts` +5-7 tests). Hard constraints: ZERO `_bmad-output/.stepper/` mutations; ZERO new error class registration (registry stays at 16 codes — `StateChangedDuringDispatchError` was reserved during Story 1.5 schema-skeleton work); ZERO new external runtime deps. Lock-acquired contract: `src/commands/next/verify-and-advance.ts` MUST call `acquire()` exactly ONCE at top + `release()` in `finally`; verified via mock-spy in colocated tests. Multi-persona handling deferred (Stories 4.1 / 5.*) — Story 2.6 v0.1 reads dispatch-spec's pre-resolved single persona via `dispatchSpec.taskSpec.persona`. State-hash design (v0.1 Option A): hash projection over `(currentState.lastSuccessfulStep / lastAttempted)` vs `(dispatchSpec.epic, dispatchSpec.story)`; mismatch → `StateChangedDuringDispatchError` (FIRST throw site). Future Story 6.x DispatchSpecV2 schema bump (`stateHash` field) closes the v0.1 simplification. Story 2.1 dev-002 polish PR (`runVerifier` reads dispatch-spec.json directly + makes `stagingRoot` optional) deferred to Story 6.x — Story 2.6 v0.1 keeps Story 2.1 v0.1 contract (passes `stepName` + `stagingRoot` explicitly). Story 2.5 dev-001 directory rename: import path `src/runs/` (NOT architecture-doc's `src/transcript/`); epic-2 retrospective should document the rename precedent. Estimated effort: L (large — second L-effort story of Epic 2 after Story 2.4; introduces the lock-acquiring runner pattern + new promote.ts module + first STATE_CHANGED_DURING_DISPATCH throw site + first canonical writeStepTranscript caller; 15 task groups; ~20-32 colocated tests across 3 new + 1 extended test files; targets ~700-1000 lines this file). Test count delta target: +20-32 (baseline 475 → ~495-515). FR/NFR/AR coverage: FR1+FR5+FR16+FR17+FR18+FR32+FR43+FR44+FR46+FR53+FR54 / NFR-P3+P4+S1+S2+S4+S5+R1+R4+M3 / AR8+AR9+AR11+AR12+AR21+AR22+AR25+AR26+AR33+AR41.
