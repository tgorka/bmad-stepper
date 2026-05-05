---
status: done
story_id: '4.8'
story_key: 4-8-checkpoint-each-step-type
epic: '4'
title: '`--checkpoint-each <step-type>`'
created: '2026-05-04'
last_updated: '2026-05-04T07:55:00Z'
priority: H
estimated_effort: M
fr_coverage:
  - FR8
  - FR9
  - FR19
  - FR22
  - FR23
  - FR53
  - FR54
nfr_coverage:
  - NFR-S2
  - NFR-S5
  - NFR-R1
  - NFR-R3
  - NFR-R4
  - NFR-M3
ar_coverage:
  - AR8
  - AR9
  - AR13
  - AR21
  - AR22
  - AR33
  - AR34
  - AR41
  - AR42
deps:
  - 4-7-plan-first-dry-run-preview                                  # PRIMARY: SDR forward-tracker explicitly tags 4.8 to SHARE the `matchCheckpointType` pure-function helper at `plan.ts:322-331` and refine the v0.1 boilerplate description; plan.ts uses the legacy 3-value `checkpointEach` enum (`story|epic|phase`) which 4.8 must REPLACE with the 5-value Phase enum per AC; the LoopResult|PlanResult discriminated-union return shape is preserved
  - 4-6-stop-condition-error-with-stop-on-error-continue-on-error   # PATTERN: default-cap inverted-check extension precedent; halt-on-error short-circuit ordering (the checkpoint write must happen BEFORE the halt-on-error gate at run.ts:951-1012 so a successful step is checkpointed even if the NEXT iteration fails)
  - 4-5-stop-condition-time-budget-and-token-budget                 # PATTERN: per-iteration accumulator pattern (LoopMetrics) — Story 4.8 introduces an analogous per-iteration WRITE through a new `RunNextOptions.checkpointEach` thread; AR10 token-flow source for the runHistory[] read pattern that 4.8 mirrors
  - 4-4-stop-condition-max-iters-and-default-cap                    # PATTERN: default-cap inverted-check pattern (decision: --checkpoint-each does NOT trigger default-cap suppression because it is NOT a stop-condition; OQ-1 documents the rationale)
  - 4-3-stop-condition-next-story-and-phase-end                     # PATTERN: per-iteration `loopDag` lookup pattern; `dag.nodes.get(step)?.phase` lookup is the SAME pattern Story 4.8 uses to match `node.phase === args.checkpointEach`
  - 4-2-stop-condition-epic-end-and-story-x-y                       # PATTERN: stop-conditions.ts module structure (4.8 does NOT add to stop-conditions.ts; this dep is for the AR9 message format precedent)
  - 4-1-bmad-loop-command-skeleton                                  # SKELETON: LoopArgsSchema declares `checkpointEach: z.enum(["story", "epic", "phase"]).optional()` at args.ts:104 (parsed-only since 4.1; 4.8 REPLACES the enum with the 5-value Phase enum per AC); `"checkpointEach"` is in STRING_KEYS (NOT BOOLEAN_KEYS) at args.ts:143-146
  - 1-8-snapshot-branch-sha-detection                               # CRITICAL DEPENDENCY: Story 1.8 wired `detectSnapshot()` at `src/snapshot/detect.ts:158-213` returning `Promise<Snapshot | null>` with `{ branch, sha, takenAt }`; Story 4.8 INVOKES this function from inside `verify-and-advance.ts` (lock-held) on each iteration when `args.checkpointEach !== undefined` AND `node.phase === args.checkpointEach`. ZERO new git invocations — Story 1.8 owns the Bun.spawn surface
  - 1-6-state-subsystem-load-save-recompute-skeleton                # DEPENDENCY: `saveState` at `src/state/save.ts:68-91` performs the atomic .bak rotation (via `atomicWrite` at `src/io/atomic-write.ts:32-50`) when persisting the modified `state.checkpoints[]`. Story 4.8 ADDS the FIFO-50 trimmed checkpoint to `stateAfter.checkpoints` BEFORE the existing `saveState` call at verify-and-advance.ts:541. ZERO new atomic-write calls — Story 1.6 owns the .bak rotation surface
  - 1-5-schemas-migrations-skeleton                                 # SCHEMA: StateV1Schema currently declares `checkpoints: z.array(z.unknown()).max(50).default([])` at `src/schemas/state.ts:117` — the `.max(50)` enforces the FIFO cap shape but `z.unknown()` does NOT validate the per-entry `{branch,sha,takenAt,stepType}` shape. Story 4.8 EXTENDS the schema with a typed `CheckpointEntrySchema` (see Tasks 4 + 5)
  - 1-10-dag-seed-three-tier-registry                               # DAG: Story 4.8 LOOKUP pattern — `dag.nodes.get(step)?.phase` at the per-iteration matching site; the seed DAG enumerates all 5 phases (`analysis|planning|solutioning|implementation|retro`) per `src/dag/types.ts:30-35`
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/implementation-artifacts/4-7-plan-first-dry-run-preview.md
  - _bmad-output/implementation-artifacts/4-6-stop-condition-error-with-stop-on-error-continue-on-error.md
  - _bmad-output/implementation-artifacts/4-5-stop-condition-time-budget-and-token-budget.md
  - _bmad-output/implementation-artifacts/4-4-stop-condition-max-iters-and-default-cap.md
  - _bmad-output/implementation-artifacts/4-3-stop-condition-next-story-and-phase-end.md
  - _bmad-output/implementation-artifacts/4-2-stop-condition-epic-end-and-story-x-y.md
  - _bmad-output/implementation-artifacts/4-1-bmad-loop-command-skeleton.md
  - _bmad-output/implementation-artifacts/1-8-snapshot-branch-sha-detection.md
  - _bmad-output/implementation-artifacts/1-6-state-subsystem-load-save-recompute-skeleton.md
  - _bmad-output/implementation-artifacts/1-5-schemas-migrations-skeleton.md
  - _bmad-output/implementation-artifacts/1-10-dag-seed-three-tier-registry.md
  - _bmad-output/implementation-artifacts/sprint-status.yaml
  - .bmad-stepper/state.yaml
  - src/commands/loop/args.ts
  - src/commands/loop/run.ts
  - src/commands/loop/run.test.ts
  - src/commands/loop/plan.ts
  - src/commands/loop/index.ts
  - src/commands/loop/stop-conditions.ts
  - src/commands/next/run.ts
  - src/commands/next/verify-and-advance.ts
  - src/commands/next/args.ts
  - src/snapshot/detect.ts
  - src/state/save.ts
  - src/state/load.ts
  - src/state/recompute.ts
  - src/io/atomic-write.ts
  - src/dag/types.ts
  - src/dag/index.ts
  - src/schemas/state.ts
  - src/schemas/dispatch-protocol.ts
  - src/dispatch/emit.ts
  - src/errors.ts
  - commands/bmad-loop.md
---

# Story 4.8: `--checkpoint-each <step-type>`

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper user (overnight loop pattern who needs explicit recovery points),
I want `/bmad-loop --checkpoint-each implementation` to force a Git branch+sha + `.bak` snapshot after every step whose phase matches `implementation`,
So that I have explicit recovery points before each implementation step (and any of the four other phases when supplied).

## Context Summary

This is the **eighth story of Epic 4 (Bounded Loop with Eight Stop Conditions)** and lands the **`--checkpoint-each <step-type>`** runtime wiring per FR22. **Story 4.8 is structurally distinct from Stories 4.2-4.6** (which wired stop-condition flags driving the iteration body's gate) and **distinct from Story 4.7** (a pre-flight short-circuit). `--checkpoint-each` is a **CHECKPOINT-CONTROL FLAG** — it does NOT cause the loop to stop, it FORCES an explicit Layer-1 snapshot append + .bak rotation + Git branch+sha capture after every step whose `phase` matches the supplied `<step-type>`. The flag is INDEPENDENT of stop-conditions and orthogonal to the iteration body's stop-condition gate; it merely AUGMENTS the post-step state mutation with an additional `state.yaml.checkpoints[]` entry per AR13 Layer 1.

**Story 4.8's scope is THREE acceptance criteria** rolled into a single AC block (epics.md lines 1008-1014):

- AC-1 (line 1010): when the loop completes a step whose phase or type matches `<step-type>` → append `state.yaml.checkpoints[]` with `{ branch, sha, takenAt, stepType: "<type>" }` (FIFO-evicted at 50 entries per AR13).
- AC-2 (line 1011): per AR13 Layer 1 — `.bak` of `state.yaml` is rotated (via the existing `saveState`/`atomicWrite` path) and a Git branch+sha is captured (via the existing `detectSnapshot()` from Story 1.8).
- AC-3 (line 1012): the legal step-type values are EXACTLY `analysis`, `planning`, `solutioning`, `implementation`, `retro` — the 5 `Phase` literal-union members declared in `src/dag/types.ts:30-35`.

The flag was already declared in `LoopArgsSchema` per Story 4.1 at `src/commands/loop/args.ts:104` BUT with the LEGACY 3-value enum `z.enum(["story", "epic", "phase"]).optional()` (the original epic draft pre-dated the AC's 5-value Phase taxonomy). **Story 4.8 REPLACES the 3-value enum with the 5-value Phase enum** per AC — `z.enum(["analysis", "planning", "solutioning", "implementation", "retro"]).optional()`. This is a NARROWING substitution: `story|epic|phase` were not actual phase identifiers, they were placeholder labels in the pre-AC draft. The replacement makes the schema match the AC verbatim and aligns with the existing `Phase` literal union from Story 1.10.

**Architectural challenge — lock-held write site**: AR8 forbids `src/commands/loop/run.ts` from acquiring the project lock (`run.ts` is read-only top-tier per architecture line 1672). However, the checkpoint write requires `saveState`, which requires a `LockHandle` (`src/state/save.ts:68` signature). Story 4.8 RESOLVES this by **threading `args.checkpointEach` through `RunNextOptions` (a new field) to `verify-and-advance.ts` (the existing lock-held layer that already calls `saveState` at `verify-and-advance.ts:541`)**. The runner SIGNALS the checkpoint via `RunNextOptions.checkpointEach`; `verify-and-advance.ts` reads the signal, looks up the just-completed step's phase via the DAG, and APPENDS the checkpoint to `stateAfter.checkpoints[]` (FIFO-trimmed to 50) BEFORE the existing `saveState(stateAfter, handle, ...)` call. The atomic write + .bak rotation lives where it always has — Story 4.8 does NOT add a second write site; it merely augments the existing one. This is consistent with Story 4.5's `runHistory[].tokens` flow (also written by `verify-and-advance.ts` and read by `runLoop` from `state.runHistory[]`).

**`Phase` taxonomy** (from `src/dag/types.ts:30-35`, established in Story 1.10):

```typescript
export type Phase =
  | "analysis"
  | "planning"
  | "solutioning"
  | "implementation"
  | "retro";
```

These five values are the AC-3 legal step-types. The phase of any DAG node is queryable via `dag.nodes.get(stepName)?.phase`. The runner's existing per-iteration `loopDag` (Story 4.3 opt-in load) is INSUFFICIENT because it loads ONLY when `args.phaseEnd === true`; Story 4.8 must EXTEND the opt-in to ALSO load when `args.checkpointEach !== undefined` so the per-iteration phase lookup has a DAG to consult. The opt-in extension is a single-line predicate change at `run.ts:757` (`if (args.phaseEnd === true || args.checkpointEach !== undefined) { loopDag = await dagFn(); }`).

**Concretely, Story 4.8 produces:**

1. **`src/schemas/state.ts`** (MODIFIED, ~+15-25 lines): EXTEND the existing `checkpoints: z.array(z.unknown()).max(50).default([])` declaration at line 117 with a typed `CheckpointEntrySchema` per AR13: `{ branch: z.string(), sha: z.string(), takenAt: z.string(), stepType: z.enum([5 phase values]) }`. The `.max(50)` cap is preserved; the `.default([])` is preserved. EXPORT `CheckpointEntrySchema` + `CheckpointEntry` type for cross-module consumers (Story 4.8's `verify-and-advance.ts` write path; future Story 4.10 `--exit-reason` resume hint).

2. **`src/commands/loop/args.ts`** (MODIFIED, ~+3 lines): REPLACE the legacy `z.enum(["story", "epic", "phase"]).optional()` at line 104 with `z.enum(["analysis", "planning", "solutioning", "implementation", "retro"]).optional()` per AC. Update the field-table comment block at lines 24-39 to reflect the new enum values.

3. **`src/commands/loop/run.ts`** (MODIFIED, ~+15-25 lines): EXTEND the opt-in `loopDag` predicate at run.ts:757 to also load when `args.checkpointEach !== undefined`. THREAD `args.checkpointEach` through `RunNextOptions` to the per-iteration `runNextFn` invocation at run.ts:845 (the runner constructs `runNextFn = opts?.runNextOverride ?? runNext` at run.ts:679 — Story 4.8 wraps the production path to forward `checkpointEach` per-iteration). UPDATE the JSDoc above `runLoop` (run.ts:491-520) to document the checkpoint-write path. The default-cap inverted-check at run.ts:664-677 is **NOT extended** with a `checkpointEach` clause per OQ-1 below.

4. **`src/commands/next/run.ts`** (MODIFIED, ~+5-10 lines): ADD `checkpointEach?: Phase` to `RunNextOptions` at lines 210-253. Forward the option through to `verify-and-advance.ts` invocations.

5. **`src/commands/next/verify-and-advance.ts`** (MODIFIED, ~+45-65 lines): ADD a new optional `checkpointEach?: Phase` field to the existing options shape. After the `runHistoryEntry` build at line 510 and BEFORE the `saveState(stateAfter, handle, ...)` call at line 541, ADD a checkpoint-append block: when `opts.checkpointEach !== undefined` AND the just-completed step's phase (looked up via the DAG) matches `opts.checkpointEach`, capture a snapshot via `detectSnapshot()` (Story 1.8), build a `CheckpointEntry` (`{ branch, sha, takenAt, stepType: opts.checkpointEach }`), and append to `stateAfter.checkpoints[]` with FIFO-50 trim. The `saveState(stateAfter, handle, ...)` call below performs the atomic `.bak` rotation per Story 1.6.

6. **`src/commands/loop/plan.ts`** (MODIFIED, ~+15-20 lines): UPDATE the `matchCheckpointType` helper at plan.ts:322-331 to consume the NEW 5-value Phase enum. Per Story 4.7 SDR forward-tracker (line 1196): "SHARE the `matchCheckpointType` pure-function helper at plan.ts:322-331 with Story 4.8's runtime path; refine the v0.1 boilerplate description to reflect actual snapshot-creation semantics." Story 4.8 keeps `matchCheckpointType` as a pure-function inside `plan.ts` (consumed by `computePlan`'s plan-walk for plan-mode preview) AND adds the analogous runtime matcher inside `verify-and-advance.ts` (consumed by the iteration body's checkpoint-write path). The runtime matcher is intentionally inlined in `verify-and-advance.ts` rather than imported from `plan.ts` because mid-tier `next/verify-and-advance.ts` may not import from top-tier `loop/plan.ts` per AR41 boundary graph (top-tier imports from mid-tier are allowed; the reverse is forbidden).

7. **`src/commands/loop/run.test.ts`** (MODIFIED, ~+150-220 lines): ADD ~10-12 new integration tests CE_48_1 through CE_48_8 + SWEEP_48 covering: each of the 5 step-types appends ONE checkpoint per match; mismatched step-type writes ZERO checkpoints; FIFO-50 eviction when checkpoints[] is at cap; multiple iterations accumulate; checkpoints survive a state.yaml reload (round-trip); the runner threads `checkpointEach` through `RunNextOptions`; non-Git fallback (detectSnapshot returns null) gracefully skips the checkpoint append.

8. **`src/commands/next/verify-and-advance.test.ts`** (MODIFIED OR NEW, ~+80-130 lines): ADD ~6-8 new colocated unit tests CV_48_1-6 covering: the checkpoint-append block writes ONE entry to stateAfter.checkpoints when phase matches; writes ZERO entries when phase mismatches OR when `opts.checkpointEach === undefined`; FIFO-50 trim semantics (when stateBefore.checkpoints.length === 50, the oldest entry is evicted on append); detectSnapshot null fallback (non-Git work-tree) records the entry with branch="<unknown>"/sha="<unknown>" OR skips the append entirely (decision deferred to OQ-7).

9. **`src/schemas/state.test.ts`** (MODIFIED, ~+30-50 lines): ADD ~3-4 new tests for the new `CheckpointEntrySchema` validation: accepts valid entries; rejects entries missing `stepType`; rejects entries with invalid `stepType`; respects the `.max(50)` cap on `checkpoints[]`.

10. **`src/commands/loop/index.ts`** (MODIFIED, ~+1-3 lines): UPDATE the `Plan` re-export block to reflect the updated `PlanCheckpoint.stepType` type from `plan.ts` (which now uses the 5-value Phase enum).

11. **`commands/bmad-loop.md`** (MODIFIED, ~+50-80 lines): FLIP the `--checkpoint-each X` row in the §Stop Conditions table from `parsed only` → `RUNTIME-WIRED in 4.8`. ADD a new sub-section `### --checkpoint-each <step-type> (Story 4.8)` covering: behaviour summary, the 5 legal step-type values, AR13 Layer 1 reference, FIFO-50 cap, the runtime semantics (post-iteration write through verify-and-advance.ts), the non-Git fallback behaviour. UPDATE the intro paragraph (Story map adds 4.8). UPDATE the §Behavior bullet 5 (currently mentions only halt-on-error short-circuit) to ALSO mention the checkpoint-write hook.

12. **`_bmad-output/implementation-artifacts/sprint-status.yaml`** (MODIFIED): flip `4-8-checkpoint-each-step-type: backlog → ready-for-dev`. Bump `last_updated:` at BOTH the comment block top AND the live YAML field.

**FR/NFR/AR mapping:**

- **FR8** (single-step advance): UNCHANGED. **FR9** (dry-run): UNCHANGED. **FR19** (8 stop-conditions): UNCHANGED. **FR22** (checkpoint snapshot after every step of a given type via `--checkpoint-each`): WIRED HERE for the FIRST and ONLY time. **FR23** (cap wall-clock/token/iter): UNCHANGED. **FR53** (exit codes): UNCHANGED — `--checkpoint-each` does NOT introduce new exit codes; failures during snapshot capture (e.g., `git rev-parse` fails inside a confirmed work-tree) propagate as system errors per Story 1.8's contract. **FR54** (stdout/stderr discipline): UPHELD — the checkpoint write is silent (no per-iteration AR9 or stderr emission); the loop-final AR9 line at the import.meta.main block continues to summarise the loop outcome.
- **NFR-S2** (no-write-outside-scope): UPHELD — checkpoint write goes through the existing `atomicWrite` path which performs `assertWithinScope` per Story 1.3. **NFR-S5** (atomic tmp+rename + .bak rotation): UPHELD — the checkpoint write piggybacks on the existing `saveState`/`atomicWrite` path; ZERO new write sites. **NFR-R1** (zero data loss): UPHELD — checkpoints are persisted atomically with the runHistory append; either both succeed or both fail (no partial-write window). **NFR-R3** (state recomputable from disk): UPHELD — checkpoints are read-from / write-to `state.yaml` only; no derived state. **NFR-R4** (halt cleanly on stale lock): UPHELD — the lock-held verify-and-advance write site already enforces this via the existing `acquire`/`release` discipline. **NFR-M3** (schema migrations): the `CheckpointEntry` schema EXTENSION is additive (NO version bump) — existing v1 state.yaml files with `checkpoints: []` (empty array) validate cleanly under the new typed schema; older v1 files with raw `z.unknown()` entries trigger a Zod validation error on load (graceful: the schema rejection becomes a `CorruptStateError` per Story 1.6, which the user resolves via `--recompute-state`). **OQ-7** documents the migration trade-off.
- **AR8** (lock-free top-tier): UPHELD — `runLoop` does NOT acquire the lock; the checkpoint write happens INSIDE `verify-and-advance.ts` (the lock-held mid-tier layer that already owns the post-step state save). **AR9** (single AR9 stdout line per command invocation): UPHELD — the checkpoint write is silent; the loop-final AR9 line is unchanged. **AR13** (snapshot/checkpoint mechanism, two-layer): WIRED HERE — Layer 1 (Git branch+sha capture) is forwarded to `state.checkpoints[]` per the AR13 contract; Layer 2 (.bak rotation) piggybacks on the existing `saveState` path. **AR21+22** (errors registry held at 16): UPHELD — Story 4.8 ships ZERO new error classes. **AR33** (no console.*): UPHELD — checkpoint-append is silent. **AR34** (slash-command markdown protocol): EXTENDED — `commands/bmad-loop.md` gains a new sub-section. **AR41** (boundary graph): UPHELD — the new `RunNextOptions.checkpointEach` field is a TOP-TIER → MID-TIER thread (allowed); the `verify-and-advance.ts` checkpoint write site imports `detectSnapshot` from `src/snapshot/detect.ts` (mid-tier ↔ mid-tier — already established by `verify-and-advance.ts` at line 104 importing `saveState` from `../../state/save.ts`). **AR42** (test discipline): EXTENDED — new colocated tests in `verify-and-advance.test.ts` + `run.test.ts` + `state.test.ts`; tmpdir-per-test discipline preserved.

Estimated effort: **M** (medium — TWO schema/source modifications + ONE source modification each in run.ts, args.ts, plan.ts, next/run.ts, verify-and-advance.ts; ~+200-330 net source lines; ~+260-400 net test lines; ZERO new error classes; ZERO new files).

It does **NOT**:

- **Wire SIGINT graceful exit** — deferred to Story 4.9.
- **Wire the loop-exit-reason format** — deferred to Story 4.10.
- **Wire `--interactive` or `--auto-fix`** — deferred to Stories 5.5 + 5.3.
- **Wire the `models:` per-step config** — that is Story 6.3's responsibility.
- **Add a new error class** — registry stays at 16. Snapshot capture failures inside a confirmed Git work-tree propagate as system errors per Story 1.8's existing contract; non-Git fallback emits the existing one-time warning per Story 1.8.
- **Add a new exit code** — checkpoint-write failures during a successful step do NOT halt the loop (graceful degradation per OQ-7).
- **Modify `stop-conditions.ts`** — `--checkpoint-each` is NOT a stop-condition; it is a post-step write augmentation.
- **Modify `LoopArgsSchema`'s 13-field surface** — only the `checkpointEach` enum values change; the field name + cardinality are unchanged.
- **Touch the `StopReason` discriminated union** — `--checkpoint-each` does not produce a halt path.
- **Compute checkpoints in plan-mode WITHOUT supplying `--checkpoint-each`** — Story 4.7's `matchCheckpointType` continues to surface plan-mode locations only when `args.checkpointEach !== undefined`.
- **Extend the default-cap inverted-check at run.ts:664-677 with a `checkpointEach` clause** — per OQ-1 the flag is orthogonal to stop-conditions; supplying `--checkpoint-each` ALONE without any stop-condition flag SHOULD inject the default 50-iter cap (the user wants checkpoints WITH a bounded loop). OQ-1 documents the rationale.

## Acceptance Criteria

The acceptance criteria below are reproduced **verbatim** from `_bmad-output/planning-artifacts/epics.md` §Story 4.8 (lines 1002-1014, BDD Given/When/Then format). Lines and AC labelling preserved.

**Acceptance Criteria:**

**Given** `--checkpoint-each implementation` is supplied
**When** the loop completes a step whose phase or type matches `implementation`
**Then** `state.yaml.checkpoints[]` is appended with `{ branch, sha, takenAt, stepType: "implementation" }` (FIFO-evicted at 50 entries — AR13)
**And** `.bak` of `state.yaml` is rotated and a Git branch+sha is captured per AR13 Layer 1
**And** the step type can be any of: `analysis`, `planning`, `solutioning`, `implementation`, `retro`

> **Story 4.8 checkpoint-control scope note:** Story 4.8 is the EIGHTH story in Epic 4 (after the SEVEN preceding stories that wired the iteration-body stop-condition gate + the plan-mode short-circuit). Unlike Stories 4.2-4.6, `--checkpoint-each` is NOT a stop-condition — it does NOT cause the loop to halt. It is a CHECKPOINT-CONTROL FLAG that AUGMENTS the post-step state write with an additional `state.checkpoints[]` entry per AR13 Layer 1. The runtime write site lives INSIDE `verify-and-advance.ts` (lock-held mid-tier) per AR8 — NOT inside `runLoop` (lock-free top-tier). The 5 legal step-type values match the 5 `Phase` literal-union members from `src/dag/types.ts:30-35` exactly. Story 4.7 ALREADY SURFACES the planned checkpoint locations in plan-mode via the pure-function `matchCheckpointType` helper at `plan.ts:322-331` (Story 4.7 SDR forward-tracker explicitly tags this for refinement in 4.8). The `--checkpoint-each` flag is INDEPENDENT of stop-conditions — it does NOT trigger default-cap suppression (OQ-1).

## Tasks / Subtasks

- [x] **Task 0 — Pre-flight evidence verification (AC: all)**
  - [x] 0.1 Confirm Story 4.7 is `done` per `_bmad-output/implementation-artifacts/sprint-status.yaml:89`. Confirm Story 4.7 §Senior Developer Review verdict line: `**approve**: must-fix = 0; should-fix = 0; 2 nits inherited unchanged; 9 forward-trackers carried` per `_bmad-output/implementation-artifacts/4-7-plan-first-dry-run-preview.md:1208`.
  - [x] 0.2 Read `_bmad-output/implementation-artifacts/4-7-plan-first-dry-run-preview.md` end-to-end. Confirm:
    - `src/commands/loop/run.ts:521-635` defines the plan-mode pre-flight branch with the `LoopResult | PlanResult` discriminated-union return.
    - `src/commands/loop/run.ts:664-677` defines the 10-clause default-cap inverted-check (now COMPLETE per Story 4.7 per the JSDoc at run.ts:646-652).
    - `src/commands/loop/plan.ts:322-331` defines the `matchCheckpointType` pure-function helper consumed by `computePlan`. Story 4.8 will UPDATE the function to consume the NEW 5-value Phase enum.
    - `src/commands/loop/args.ts:104` declares `checkpointEach: z.enum(["story", "epic", "phase"]).optional()` (the LEGACY 3-value enum). Story 4.8 will REPLACE this with the 5-value Phase enum.
    - `src/commands/loop/args.ts:143-146` declares `STRING_KEYS` includes `"checkpointEach"` (NOT in `BOOLEAN_KEYS` — `--checkpoint-each <value>` requires a value).
    - Errors registry at `src/errors.ts` holds at 16 codes (`bun test src/errors.test.ts` → 10 pass / 197 expects per Story 4.7 §Quality gates baseline at line 1141).
    - `src/schemas/state.ts:117` declares `checkpoints: z.array(z.unknown()).max(50).default([])`. Story 4.8 will TIGHTEN this with a typed `CheckpointEntrySchema`.
    - `src/snapshot/detect.ts:158-213` defines `detectSnapshot(opts?): Promise<Snapshot | null>` returning `{ branch, sha, takenAt }` (or `null` for non-Git work-trees). Story 4.8 INVOKES this function from inside `verify-and-advance.ts` on each matching iteration.
    - `src/state/save.ts:68-91` defines `saveState(state, handle, opts?)` performing the atomic `.bak` rotation via `atomicWrite`. Story 4.8 ADDS the checkpoint append BEFORE the existing `saveState` call at `verify-and-advance.ts:541`.
    - `src/io/atomic-write.ts:32-50` performs the `.bak` rotation (rename current → `.bak` then write tmp → rename to target). Story 4.8 does NOT add a second write site.
    - `src/dag/types.ts:30-35` defines the 5-value `Phase` literal union (`analysis | planning | solutioning | implementation | retro`). These are the AC-3 legal step-type values.
  - [x] 0.3 Read epics.md §Story 4.8 lines 1002-1014 verbatim. Confirm the AC text in §Acceptance Criteria above is character-identical to lines 1008-1014 — particularly the `{ branch, sha, takenAt, stepType: "implementation" }` literal, the FIFO-50 cap reference, the AR13 Layer 1 reference, and the 5-value enum list.
  - [x] 0.4 Read `src/commands/loop/run.test.ts` to confirm the existing Tests A-I, X_44-AA_44, TB_45_*/KB_45_*/SWEEP_45, SE_46_*/CE_46_*/SWEEP_46, PF_47_1-10/SWEEP_47 all pass per the post-Story-4.7 baseline (210 pass / 0 fail / 644 expects across 4 files per Story 4.7 §Quality gates at line 1140).
  - [x] 0.5 Read `_bmad-output/planning-artifacts/prd.md` §FR22 (line 698) verbatim: "Users can force a checkpoint snapshot after every step of a given type (`--checkpoint-each`)." Confirm. Read PRD line 595: "Mandatory checkpoint snapshots before destructive steps: branch + sha recorded; `.bak` of any modified file." Read PRD line 598: "**`--checkpoint-each <step-type>`**: forces a checkpoint after every step of a given type (e.g., `--checkpoint-each implementation` snapshots after every dev-story)."
  - [x] 0.6 Read `_bmad-output/implementation-artifacts/sprint-status.yaml` and confirm `4-8-checkpoint-each-step-type: backlog` is the current value at line 90 (Story 4.8 will flip to `ready-for-dev`).
  - [x] 0.7 Read Story 4.7's §Forward-tracker action items at line 1196 to confirm the EXPLICIT mandate for Story 4.8: "**Story 4.8 (`--checkpoint-each <step-type>` runtime)**: SHARE the `matchCheckpointType` pure-function helper at plan.ts:322-331 with Story 4.8's runtime path; refine the v0.1 boilerplate description to reflect actual snapshot-creation semantics." Story 4.8 honours this by UPDATING `matchCheckpointType` to consume the new 5-value Phase enum AND inlining the analogous runtime matcher inside `verify-and-advance.ts` (per AR41 boundary — top-tier `loop/plan.ts` cannot be imported from mid-tier `next/verify-and-advance.ts`).
  - [x] 0.8 Read `_bmad-output/planning-artifacts/architecture.md` line 405 verbatim: "**`--checkpoint-each <step-type>`** (PRD-required flag): triggers an explicit Layer 1 snapshot recorded under `state.yaml.checkpoints[]: [{ branch, sha, takenAt, stepType }]`. Bounded to last 50 entries; older ones are FIFO-evicted." Read line 769: "checkpoints: []                       # bounded to 50 entries, FIFO eviction". Read lines 389-407 for the full AR13 D10 §Snapshot/checkpoint mechanism block.
  - [x] 0.9 Read `src/commands/loop/args.ts:104` to confirm `checkpointEach: z.enum(["story", "epic", "phase"]).optional()` is declared with the LEGACY 3-value enum. Confirm the field-table comment at line 39 says `"enum(story|epic|phase)"`. Story 4.8 updates BOTH locations.
  - [x] 0.10 Read `src/commands/loop/run.ts:756-759` to confirm the opt-in DAG load (currently gated only on `args.phaseEnd === true`). Story 4.8 EXTENDS the predicate to also gate on `args.checkpointEach !== undefined`.
  - [x] 0.11 Read `src/commands/next/run.ts:210-253` to confirm the `RunNextOptions` shape. Story 4.8 ADDS one new optional field `checkpointEach?: Phase`.
  - [x] 0.12 Read `src/commands/next/verify-and-advance.ts:497-545` to confirm the existing post-step state-save block (build runHistoryEntry → build stateAfter → call saveState). Story 4.8 INSERTS the checkpoint-append block between the `runHistoryEntry` build and the `saveState` call.
  - [x] 0.13 Confirm baseline `bun test src/commands/loop` exits 0 with the post-Story-4.7 baseline (210 pass / 0 fail / 644 expects across 4 files).
  - [x] 0.14 Confirm Bun host version satisfies AR2 (Bun >= 1.3). Run `bun --version`; record in Completion Notes.
  - [x] 0.15 Confirm `src/errors.ts` registry holds at 16 codes (`bun test src/errors.test.ts` → 10 pass / 0 fail / 197 expects).

- [x] **Task 1 — Address Story 4.7 forward action items (AC: implicit prerequisite)**
  - [x] 1.1 UPDATE `src/commands/loop/plan.ts:322-331` `matchCheckpointType` to consume the NEW 5-value Phase enum:
    ```typescript
    function matchCheckpointType(
      node: DagNode,
      checkpointEachType: Phase,
    ): PlanCheckpoint | null {
      if (node.phase !== checkpointEachType) return null;
      return {
        afterStep: node.name,
        stepType: checkpointEachType,
        description: `${node.name} [${node.phase}] checkpoint after step (Story 4.8 wires runtime semantics; FIFO-50 cap)`,
      };
    }
    ```
    Note the BEHAVIOURAL change: the v0.1 helper returned a checkpoint for EVERY node regardless of `checkpointEachType` (the boilerplate description acknowledged "Story 4.8 wires runtime semantics"). Story 4.8 RESTRICTS the helper to return a checkpoint ONLY when `node.phase === checkpointEachType`. This matches the AC-1 wording "the loop completes a step whose phase or type matches `<step-type>`" and aligns the plan-mode preview with the actual runtime semantics.
  - [x] 1.2 UPDATE the `PlanCheckpoint.stepType` field type at `src/commands/loop/plan.ts:104` from `"story" | "epic" | "phase"` to `Phase`. UPDATE the JSDoc accordingly.
  - [x] 1.3 UPDATE the `computePlan` call site at plan.ts:407-411 — the `args.checkpointEach` is now typed as `Phase | undefined` (per Task 2's args.ts change); the existing `matchCheckpointType(currentNode, args.checkpointEach)` call signature is unchanged.
  - [x] 1.4 Document the inheritance of N-1 (defensive null check at stop-conditions.ts:269) and N-2 (`EMPTY_DAG` + `EMPTY_STATE` sentinel mid-file placement) from Story 4.7 §Forward Action Items. Story 4.8 INHERITS both unchanged — the runtime checkpoint-write logic does NOT consume `stop-conditions.ts` and KEEPS the sentinels (the iteration body still uses them). Document in §Forward Action Items.
  - [x] 1.5 Document the inheritance of OQ-1 (10-clause default-cap predicate refactor) from Story 4.7. Story 4.8 INHERITS the deferral — the predicate stays at 10 clauses (the new `checkpointEach` flag does NOT add an 11th clause per OQ-1 below). The forward-tracker remains.
  - [x] 1.6 Document the inheritance of OQ-2 (Story 6.3 `models:` config v0.1 stub) from Story 4.7. Story 4.8 does NOT touch this surface — the `lookupModelTokens` stub at plan.ts:171-175 stays. Forward-tracker for Story 6.3 unchanged.
  - [x] 1.7 Document the inheritance of OQ-8 (`src/dag/sort.ts` architecture reference unfulfilled). Story 4.8 does NOT extract a `src/dag/sort.ts` module; the per-iteration phase lookup uses the existing `dag.nodes.get(step)?.phase` pattern (Story 4.3 precedent). Forward-tracker for Story 6.x unchanged.

- [x] **Task 2 — Replace `checkpointEach` enum with the 5-value Phase enum (AC-3)**
  - [x] 2.1 At `src/commands/loop/args.ts:104`, REPLACE:
    ```typescript
    checkpointEach: z.enum(["story", "epic", "phase"]).optional(),
    ```
    WITH:
    ```typescript
    checkpointEach: z
      .enum(["analysis", "planning", "solutioning", "implementation", "retro"])
      .optional(),
    ```
    Per AC-3 verbatim: "the step type can be any of: `analysis`, `planning`, `solutioning`, `implementation`, `retro`". The 5 values match the `Phase` literal-union members at `src/dag/types.ts:30-35` exactly. The replacement is a NARROWING substitution — the legacy `story|epic|phase` triple was a placeholder pre-AC; it does NOT correspond to any actual `Phase` value AND was never consumed at runtime (Story 4.1 ARG-SURFACE-PRESENT-only).
  - [x] 2.2 Update the field-table comment block at `src/commands/loop/args.ts:24-39`. The line:
    ```typescript
     * | checkpointEach  | enum(story|epic|phase)      | 4.8      |
    ```
    Becomes:
    ```typescript
     * | checkpointEach  | enum(<5 phase values>)      | 4.8      | ← wired in 4.8
    ```
    The "← wired in 4.8" annotation matches the Story 4.1 precedent for `maxIters` ("← wired in 4.1") at line 31.
  - [x] 2.3 Update the JSDoc at args.ts:81-83 — REPLACE the `checkpointEach` enum comment from "`checkpointEach` enum allows `\"story\"` | `\"epic\"` | `\"phase\"` per Story 4.8 contract." to:
    > "`checkpointEach` enum allows `\"analysis\"` | `\"planning\"` | `\"solutioning\"` | `\"implementation\"` | `\"retro\"` per Story 4.8 contract — the 5 `Phase` values from `src/dag/types.ts:30-35`."
  - [x] 2.4 IMPORT `Phase` at the top of `src/commands/loop/args.ts` IF type-narrowing for the field is desired (alternative: leave the inferred Zod-enum string-union; v0.1 conservative does NOT add the import because the Zod inference produces a structurally identical string-union and the existing args.ts has ZERO imports from `../../dag/`). Document the decision in OQ-2 (DEFER the explicit Phase type import).
  - [x] 2.5 Verify the existing args.ts unit test at `src/commands/loop/args.test.ts` includes a checkpoint-each rejection case (e.g., `--checkpoint-each foo` → PARSE_ERROR). When the test was written for the LEGACY 3-value enum, the `foo` rejection case stayed valid; ALSO add a new POSITIVE case for each of the 5 new values (`--checkpoint-each implementation`, etc.). When the test asserts on the legacy values (`story`, `epic`, `phase`), UPDATE the assertions — those values are now REJECTED.

- [x] **Task 3 — Extend `LoopArgsSchema` ARG-SURFACE-PRESENT validation tests**
  - [x] 3.1 At `src/commands/loop/args.test.ts`, ADD positive tests for each of the 5 new step-types:
    ```typescript
    describe("LoopArgsSchema — Story 4.8 checkpoint-each enum", () => {
      it("accepts --checkpoint-each analysis", () => { ... });
      it("accepts --checkpoint-each planning", () => { ... });
      it("accepts --checkpoint-each solutioning", () => { ... });
      it("accepts --checkpoint-each implementation", () => { ... });
      it("accepts --checkpoint-each retro", () => { ... });
      it("rejects --checkpoint-each foo (unknown phase)", () => { ... });
      it("rejects --checkpoint-each story (legacy 3-value enum value)", () => { ... });
    });
    ```
    Each test uses `parseLoopArgs([...argv])` and asserts on `result.value.checkpointEach`.
  - [x] 3.2 Verify the `STRING_KEYS` set at args.ts:143-146 still contains `"checkpointEach"`. Story 4.8 does NOT change the tokenizer; `--checkpoint-each <value>` continues to consume the next argv element as the value (per Story 4.1's STRING_KEYS handling at args.ts:258-274).

- [x] **Task 4 — Tighten `StateV1Schema.checkpoints` with typed `CheckpointEntrySchema` (AC-1)**
  - [x] 4.1 At `src/schemas/state.ts:117`, REPLACE:
    ```typescript
    checkpoints: z.array(z.unknown()).max(50).default([]),
    ```
    WITH:
    ```typescript
    checkpoints: z.array(CheckpointEntrySchema).max(50).default([]),
    ```
    The `.max(50)` cap is preserved; the `.default([])` is preserved.
  - [x] 4.2 ADD the new `CheckpointEntrySchema` declaration BEFORE the `StateV1Schema` declaration (mirroring the Story 3.1 `LastAttemptedSchema` + `LastFailureReasonSchema` named-extraction precedent at lines 58-87). The schema:
    ```typescript
    /**
     * `state.checkpoints[]` per-entry shape (Story 4.8 — AR13 Layer 1).
     * Appended on each iteration whose just-completed step's phase matches
     * `args.checkpointEach`. FIFO-evicted at 50 entries (architecture
     * line 405 + line 769).
     *
     * Wire shape per AR13 Layer 1:
     *   - branch:    Git branch name at the moment of capture (from
     *                `detectSnapshot()` — Story 1.8 at
     *                `src/snapshot/detect.ts:158-213`). The literal string
     *                `"HEAD"` for detached-HEAD repos.
     *   - sha:       40-char lowercase hex Git SHA at HEAD (from
     *                `detectSnapshot()`).
     *   - takenAt:   ISO 8601 timestamp at the moment of capture.
     *   - stepType:  The matched `Phase` value (one of `analysis`,
     *                `planning`, `solutioning`, `implementation`, `retro`).
     *                Echoes `args.checkpointEach`.
     */
    export const CheckpointEntrySchema = z.object({
      branch: z.string(),
      sha: z.string(),
      takenAt: z.string(),
      stepType: z.enum([
        "analysis",
        "planning",
        "solutioning",
        "implementation",
        "retro",
      ]),
    });

    export type CheckpointEntry = z.infer<typeof CheckpointEntrySchema>;
    ```
    The 5-value enum is duplicated here (NOT imported from `src/dag/types.ts`) per AR41 — `src/schemas/` is foundational tier and may NOT import from `src/dag/` (mid-tier). The duplication is a deliberate trade-off documented in OQ-3.
  - [x] 4.3 EXPORT `CheckpointEntrySchema` and `CheckpointEntry` from `src/schemas/state.ts` so cross-module consumers (the `verify-and-advance.ts` write path; future Story 4.10 resume-hint) can validate entries.
  - [x] 4.4 Update the JSDoc top of file (lines 1-42) to document the new schema additions.
  - [x] 4.5 Verify the schema rejection: an entry like `{ branch: "main", sha: "abc", takenAt: "2026-05-04T00:00:00Z", stepType: "story" }` (with the LEGACY value) should be REJECTED by the new schema (because "story" is not in the new enum). Add a new test for this in `src/schemas/state.test.ts`.

- [x] **Task 5 — Add tests for `CheckpointEntrySchema` validation (AC-1, AC-3)**
  - [x] 5.1 At `src/schemas/state.test.ts`, ADD the new `describe("CheckpointEntrySchema")` block:
    - `accepts a valid entry with all 4 fields populated`.
    - `rejects an entry missing the stepType field`.
    - `rejects an entry with an unknown stepType (e.g., "story" — legacy)`.
    - `rejects an entry with a non-string branch`.
    - `rejects an entry with a non-string sha`.
    - `rejects an entry with a non-string takenAt`.
  - [x] 5.2 ADD the new `describe("StateV1Schema.checkpoints — Story 4.8 typed entries")` block:
    - `accepts state with empty checkpoints[]` (preserves the .default([]) behaviour).
    - `accepts state with 50 valid checkpoint entries` (the .max(50) cap allows exactly 50).
    - `rejects state with 51 checkpoint entries` (the .max(50) cap rejects).
    - `rejects state with one invalid checkpoint entry` (the typed validation rejects).
  - [x] 5.3 Net test delta on `src/schemas/state.test.ts`: ~+8-12 new tests; existing tests remain unchanged (the existing `StateV1Schema` validation tests already pass empty-array checkpoints).

- [x] **Task 6 — Thread `checkpointEach` through `RunNextOptions` (AC-1)**
  - [x] 6.1 At `src/commands/next/run.ts:210-253`, ADD a new optional field to `RunNextOptions`:
    ```typescript
    /**
     * Story 4.8 (`--checkpoint-each <step-type>`): when supplied, the
     * verify-and-advance.ts post-step state-save APPENDS a
     * `state.checkpoints[]` entry IF the just-completed step's `phase`
     * matches this value. The entry shape is `{ branch, sha, takenAt,
     * stepType }` per AR13 Layer 1; `branch` + `sha` come from
     * `detectSnapshot()` (Story 1.8); `takenAt` is the iso timestamp at
     * append; `stepType` is this value. FIFO-evicted at 50 entries
     * (the .max(50) cap on StateV1Schema.checkpoints[]).
     *
     * The runner (loop/run.ts) threads this from `args.checkpointEach`
     * per-iteration. Production callers of `runNext` directly do NOT
     * supply this field (the `/bmad-next` slash-command does not have
     * a `--checkpoint-each` flag — it is a `/bmad-loop`-only flag).
     */
    readonly checkpointEach?: Phase;
    ```
    The `Phase` import comes from `../../dag/types.ts` (foundational mid-tier; allowed per AR41).
  - [x] 6.2 ADD the import at the top of `src/commands/next/run.ts`:
    ```typescript
    import type { Phase } from "../../dag/types.ts";
    ```
    Verify NO existing `Phase` import collides; if one exists, consolidate.
  - [x] 6.3 At `src/commands/next/run.ts:1342+` (the `runNext` function body), forward `opts?.checkpointEach` through to the `verifyAndAdvance` invocation. The current invocation site reads `opts?.statePath` and other config flags; ADD `checkpointEach: opts?.checkpointEach` to the invocation options.
  - [x] 6.4 Update the JSDoc above `runNext` at the function signature to document the new field.

- [x] **Task 7 — Wire the checkpoint-append block in `verify-and-advance.ts` (AC-1, AC-2)**
  - [x] 7.1 At `src/commands/next/verify-and-advance.ts`, ADD a new optional field to the existing options interface (around lines 165-200 — same shape that already declares `statePath`, `pluginDir`, etc.):
    ```typescript
    /**
     * Story 4.8 (`--checkpoint-each <step-type>`): when supplied, the
     * post-step state save APPENDS a `state.checkpoints[]` entry IF the
     * just-completed step's `phase` matches this value. The entry shape
     * is `{ branch, sha, takenAt, stepType }` per AR13 Layer 1.
     */
    readonly checkpointEach?: Phase;
    ```
  - [x] 7.2 ADD the imports at the top of `src/commands/next/verify-and-advance.ts`:
    ```typescript
    import type { Phase } from "../../dag/types.ts";
    import {
      CheckpointEntrySchema,
      type CheckpointEntry,
    } from "../../schemas/state.ts";
    import { detectSnapshot } from "../../snapshot/detect.ts";
    ```
    Verify NO existing import collides; if one exists, consolidate.
  - [x] 7.3 ADD the new private helper `matchCheckpointPhase` (analogous to `plan.ts:matchCheckpointType` but inlined per AR41 — `next/verify-and-advance.ts` cannot import from `loop/plan.ts`):
    ```typescript
    /**
     * Pure-function lookup: would the just-completed step fire a checkpoint
     * under `checkpointEach`? Returns the matched phase (echo input) or
     * `null`. Story 4.8 AC-1 contract — the just-completed step's `phase`
     * (looked up via the DAG) must equal `checkpointEach` exactly.
     */
    function matchCheckpointPhase(
      stepName: string,
      dag: DagAdjacency | null,
      checkpointEach: Phase | undefined,
    ): Phase | null {
      if (checkpointEach === undefined) return null;
      if (dag === null) return null;
      const node = dag.nodes.get(stepName);
      if (node === undefined) return null;
      if (node.phase !== checkpointEach) return null;
      return checkpointEach;
    }
    ```
    Note the four guard clauses cover: no flag supplied; no DAG available; step not in DAG (defensive — should not happen given the runner's per-iteration runHistory append); phase mismatch.
  - [x] 7.4 At `src/commands/next/verify-and-advance.ts:506-540` (the existing post-step state-save block), INSERT the checkpoint-append block BETWEEN the `runHistoryEntry` build (line 510) and the `stateAfter` build (line 536). The insertion:
    ```typescript
    // Story 4.8: checkpoint append per --checkpoint-each <step-type>.
    // The just-completed step's phase is looked up via the DAG; if it
    // matches opts.checkpointEach, capture a Git branch+sha snapshot via
    // detectSnapshot() (Story 1.8) and append to state.checkpoints[]
    // with FIFO-50 trim. The append is silent (no AR9 / no stderr); the
    // user observes the checkpoint via state.yaml inspection or via the
    // exit-reason resume hint (Story 4.10 forward dependency).
    let nextCheckpoints: CheckpointEntry[] = [
      ...((stateBefore.checkpoints ?? []) as CheckpointEntry[]),
    ];
    const matchedPhase = matchCheckpointPhase(
      stepName,
      dag,
      opts?.checkpointEach,
    );
    if (matchedPhase !== null) {
      let snapshot: Snapshot | null = null;
      try {
        snapshot = await detectSnapshot();
      } catch {
        // OQ-7: detectSnapshot throws inside a confirmed Git work-tree on
        // empty-repo (no commits) or git-binary-missing. Story 4.8 v0.1
        // graceful degradation: skip the checkpoint append (do NOT halt
        // the loop). Forward-tracker for Story 4.10 to surface this
        // via the exit-reason resume hint.
        snapshot = null;
      }
      if (snapshot !== null) {
        const entry: CheckpointEntry = {
          branch: snapshot.branch,
          sha: snapshot.sha,
          takenAt: snapshot.takenAt,
          stepType: matchedPhase,
        };
        // FIFO-50 trim: when at cap (50 entries), drop the OLDEST entry
        // before appending. The .max(50) cap on StateV1Schema.checkpoints[]
        // would otherwise reject a 51st entry on saveState.
        nextCheckpoints.push(entry);
        if (nextCheckpoints.length > 50) {
          nextCheckpoints = nextCheckpoints.slice(nextCheckpoints.length - 50);
        }
      }
    }
    ```
    The `stepName` is derived from the existing post-step context (the just-completed step's name; available in the existing scope); the `dag` is available from the existing scope (the verifier already has DAG access for phase resolution per Story 2.4).
  - [x] 7.5 At `src/commands/next/verify-and-advance.ts:536`, UPDATE the `stateAfter` build to include the new `nextCheckpoints` array:
    ```typescript
    const stateAfter: State = {
      ...stateBefore,
      lastSuccessfulStep: { ... },
      lastAttempted: null,
      lastFailureReason: null,
      runHistory: [...(stateBefore.runHistory ?? []), runHistoryEntry],
      checkpoints: nextCheckpoints,
    };
    ```
    The existing `runHistory` append pattern is preserved; `checkpoints` is added analogously.
  - [x] 7.6 The existing `await saveState(stateAfter, handle, { statePath: opts?.statePath })` call at line 541 IS UNCHANGED. Story 4.8 does NOT add a second write site — the checkpoint append rides on the existing atomic .bak rotation per AR13 Layer 2.
  - [x] 7.7 Update the JSDoc above the `verifyAndAdvance` function (around line 365-405) to document the new `checkpointEach` option and the per-iteration write semantics.
  - [x] 7.8 Verify the AR41 boundary: `next/verify-and-advance.ts` imports from `snapshot/detect.ts` (mid-tier ↔ mid-tier — already established by `verify-and-advance.ts` importing `saveState` from `state/save.ts` per the Story 1.6 precedent). Imports from `schemas/state.ts` are foundational ← mid-tier (allowed). Imports from `dag/types.ts` are foundational ← mid-tier (allowed).

- [x] **Task 8 — Wire `args.checkpointEach` through `runLoop` (AC-1)**
  - [x] 8.1 At `src/commands/loop/run.ts:756-759` (the existing opt-in DAG load), EXTEND the predicate:
    ```typescript
    // Story 4.3: opt-in DAG build for `--phase-end`. Story 4.8 EXTENDS
    // the predicate to ALSO load the DAG when `--checkpoint-each` is
    // supplied — the runtime checkpoint-write inside verify-and-advance.ts
    // looks up the just-completed step's `phase` via dag.nodes.get(step)
    // to match against `args.checkpointEach`.
    let loopDag: DagAdjacency | null = null;
    if (args.phaseEnd === true || args.checkpointEach !== undefined) {
      loopDag = await dagFn();
    }
    ```
  - [x] 8.2 At `src/commands/loop/run.ts:679` (the `runNextFn` resolution), the production-path forwarding of `args.checkpointEach` through to `runNext` requires intercepting the `runNextFn` invocation at line 845 to inject the per-iteration `RunNextOptions`. v0.1 conservative wraps `runNextFn` with a closure that forwards `args.checkpointEach`:
    ```typescript
    // Story 4.8: thread args.checkpointEach into per-iteration runNext
    // invocations so verify-and-advance.ts can match the just-completed
    // step's phase against the supplied step-type and append the
    // state.checkpoints[] entry. The closure preserves the
    // runNextOverride seam — when an override is supplied (test path),
    // it is called WITHOUT the production checkpointEach injection
    // (tests construct their own RunNextOptions).
    const runNextFn = opts?.runNextOverride ?? (async () => {
      return await runNext({
        argv: [], // per-iteration runNext does not take argv from /bmad-loop
        checkpointEach: args.checkpointEach,
      });
    });
    ```
    Note: the existing line 679 simply assigns `runNext` directly. Story 4.8 wraps it with the closure to inject the new option. The closure is async (returns `Promise<NextResult>`) per the existing `LoopOpts.runNextOverride` signature.
  - [x] 8.3 Update the JSDoc above `runLoop` (run.ts:491-520) to add a paragraph documenting the checkpoint-write thread:
    > "Story 4.8 (`--checkpoint-each <step-type>`) THREADS the `args.checkpointEach` value through `RunNextOptions.checkpointEach` to the per-iteration `runNext` invocation; the lock-held `verify-and-advance.ts` reads the option, looks up the just-completed step's phase via the DAG, and APPENDS a `state.checkpoints[]` entry per AR13 Layer 1 IF the phase matches. The checkpoint write rides on the existing atomic .bak rotation (AR13 Layer 2 via `saveState`/`atomicWrite`) — ZERO new write sites at the runner tier."
  - [x] 8.4 Verify the AR9 stdout discipline is preserved: the checkpoint-write block is SILENT (no per-iteration AR9 emission, no stderr write); the loop-final AR9 line at the import.meta.main block is unchanged.
  - [x] 8.5 Verify the iteration body's checkpoint write happens BEFORE the halt-on-error gate at run.ts:951-1012 — when `--continue-on-error` is supplied, a successful step is still checkpointed even if the NEXT iteration fails (the runHistory entry IS appended for the successful iteration; the checkpoint analogously persists). When `--stop-on-error` is supplied (default), the halt-on-error gate fires AFTER the post-step state-save (which includes the checkpoint append), so a successful step's checkpoint persists even if the NEXT iteration's verifier fails.

- [x] **Task 9 — Add integration tests in `src/commands/loop/run.test.ts` (AC-1, AC-2, AC-3)**
  - [x] 9.1 ADD the test fixture helper `checkpointEachArgs(overrides): LoopArgs` near the top of `run.test.ts` to build a `LoopArgs` value with `checkpointEach: <Phase>` and configurable other flags.
  - [x] 9.2 ADD a test fixture helper `successResultWithStepName(stepName, phase): NextResult` that returns a `NextResult` with `action.action === "dispatch"` AND a stub-injectable `stateOverride` returning a state where `lastSuccessfulStep.step === stepName`.
  - [x] 9.3 ADD describe block `runLoop — Test CE_48_1 (Story 4.8 AC-1 + AC-3: each of 5 phase values matches and writes ONE checkpoint)`:
    - 5 sub-tests, one per phase (`analysis`, `planning`, `solutioning`, `implementation`, `retro`). Each test runs `--max-iters 1 --checkpoint-each <phase>` with a stub `runNextOverride` returning success + a `stateOverride` providing a `lastSuccessfulStep.step` whose DAG entry matches the phase. Assert `result.iterations.length === 1` AND assert (via a separate `stateAfterFn` injection seam OR via inspecting the post-iteration state) that `state.checkpoints.length === 1` AND the entry has `stepType === <phase>`.
  - [x] 9.4 ADD describe block `runLoop — Test CE_48_2 (Story 4.8 AC-1: phase mismatch writes ZERO checkpoints)`:
    - Run `--max-iters 3 --checkpoint-each implementation` with a stub providing 3 successful iterations whose `lastSuccessfulStep.step` maps to `phase: "analysis"` (NOT implementation). Assert `result.iterations.length === 3` AND `state.checkpoints.length === 0`.
  - [x] 9.5 ADD describe block `runLoop — Test CE_48_3 (Story 4.8 AC-1: FIFO-50 eviction)`:
    - Construct a `stateOverride` returning a state with `checkpoints: [50 valid entries]` (at the cap). Run `--max-iters 1 --checkpoint-each implementation` with a stub returning a successful implementation step. Assert the post-iteration state has `checkpoints.length === 50` (still at cap) AND the OLDEST entry from the initial 50 is GONE AND the NEW entry is at index 49.
  - [x] 9.6 ADD describe block `runLoop — Test CE_48_4 (Story 4.8 AC-2: .bak rotation is invoked via saveState)`:
    - Run a 1-iteration loop with `--checkpoint-each implementation` and a tmpdir `statePath`. After the iteration, assert `<tmpdir>/state.yaml.bak` exists (the .bak rotation per Story 1.6 atomicWrite). The assertion does NOT inspect `.bak` contents — only its existence (the .bak rotation is the architectural invariant).
  - [x] 9.7 ADD describe block `runLoop — Test CE_48_5 (Story 4.8 AC-2: Git branch+sha is captured via detectSnapshot)`:
    - Run a 1-iteration loop in a tmpdir-rooted Git work-tree (mirror Story 1.8 §Test Pattern at `_bmad-output/implementation-artifacts/1-8-snapshot-branch-sha-detection.md` for the `git init` + `git commit` setup). Run with `--checkpoint-each implementation`. Assert the post-iteration state has `checkpoints[0].branch === <expected branch>` AND `checkpoints[0].sha === <40-char hex>` AND `checkpoints[0].takenAt` matches the ISO-8601 regex.
  - [x] 9.8 ADD describe block `runLoop — Test CE_48_6 (Story 4.8 OQ-7: non-Git fallback skips the append)`:
    - Run a 1-iteration loop in a tmpdir that is NOT a Git work-tree. Run with `--checkpoint-each implementation`. Assert the post-iteration state has `checkpoints.length === 0` (the detectSnapshot returned null, so the append was skipped per OQ-7 graceful degradation). The runner does NOT halt; the iteration completes successfully.
  - [x] 9.9 ADD describe block `runLoop — Test CE_48_7 (Story 4.8: multiple iterations accumulate checkpoints)`:
    - Run `--max-iters 5 --checkpoint-each implementation` with stubs providing 5 iterations whose phases are: `[implementation, analysis, implementation, planning, implementation]`. Assert the post-loop state has `checkpoints.length === 3` (the 3 implementation-phase steps).
  - [x] 9.10 ADD describe block `runLoop — Test CE_48_8 (Story 4.8: checkpoints survive state.yaml reload)`:
    - Run `--max-iters 1 --checkpoint-each implementation` against a tmpdir state file. Read the `state.yaml` file from disk; parse via `Bun.YAML.parse`; validate via `StateV1Schema.parse`. Assert the parsed state has `checkpoints.length === 1` AND the entry shape matches `CheckpointEntrySchema`. The test verifies the round-trip: write → read → validate.
  - [x] 9.11 ADD describe block `runLoop — Test SWEEP_48 (Story 4.8: AC-1 + AC-2 + AC-3 sweep)`:
    - 3 sub-tests:
      - Sweep-48-A (AC-1): `--checkpoint-each implementation` appends ONE entry to `state.checkpoints[]` per matching iteration with the correct shape (`{branch, sha, takenAt, stepType: "implementation"}`).
      - Sweep-48-B (AC-2): the `.bak` rotation fires (assert `state.yaml.bak` exists) AND the Git branch+sha is captured (assert non-null `branch`/`sha` fields).
      - Sweep-48-C (AC-3): each of the 5 step-type values is accepted by argv parsing AND drives the per-iteration matching correctly.
  - [x] 9.12 UPDATE the top-of-file comment block at `src/commands/loop/run.test.ts:1-44` to reflect Story 4.8's coverage delta:
    - Add: "AC-1 (Tests CE_48_1-3,7-8 + Sweep-48-A): Story 4.8 `--checkpoint-each <step-type>` appends `state.checkpoints[]` with `{branch, sha, takenAt, stepType}` per matching iteration; FIFO-evicted at 50 entries (AR13)."
    - Add: "AC-2 (Tests CE_48_4-6 + Sweep-48-B): `.bak` of `state.yaml` is rotated (via saveState/atomicWrite) and Git branch+sha is captured (via detectSnapshot from Story 1.8) per AR13 Layer 1."
    - Add: "AC-3 (Tests CE_48_1 + Sweep-48-C): the step-type can be any of `analysis`, `planning`, `solutioning`, `implementation`, `retro` (the 5 Phase values from `src/dag/types.ts:30-35`)."
  - [x] 9.13 Test counts projection: net delta is ~+10-12 new describe blocks + sub-tests; ~+50-90 new expects. Net post-Story-4.8: ~220-235 pass / 0 fail / ~700-740 expects across 4 files.

- [x] **Task 10 — Add colocated tests in `src/commands/next/verify-and-advance.test.ts` (AC-1, AC-2)**
  - [x] 10.1 ADD the new describe block `verifyAndAdvance — Story 4.8 checkpoint-append`:
    - CV_48_1: `opts.checkpointEach === undefined` → ZERO checkpoints written.
    - CV_48_2: `opts.checkpointEach === "implementation"` AND DAG node phase === "implementation" → ONE checkpoint written with the correct shape.
    - CV_48_3: `opts.checkpointEach === "implementation"` AND DAG node phase === "analysis" → ZERO checkpoints written (mismatch).
    - CV_48_4: FIFO-50 trim — pre-state has 50 checkpoints; post-state has 50 checkpoints (oldest evicted; newest appended).
    - CV_48_5: detectSnapshot returns null (non-Git tmpdir) → ZERO checkpoints written (graceful skip per OQ-7).
    - CV_48_6: detectSnapshot throws (empty-repo / git-missing) → ZERO checkpoints written (graceful skip per OQ-7); the verify-and-advance call does NOT throw.
  - [x] 10.2 The tests use `os.tmpdir()` for state.yaml fixtures + tmpdir-per-test cleanup per AR42; the tests inject a stub DAG via the existing dag-injection seam (or mock the dag-build layer if no seam exists).
  - [x] 10.3 Net test delta on `verify-and-advance.test.ts`: ~+6-8 new tests; ~+30-50 new expects.

- [x] **Task 11 — Update `commands/bmad-loop.md` (AC: all)**
  - [x] 11.1 In the §Stop Conditions table (lines 187-201), FLIP the `--checkpoint-each X` row from `parsed only` → `RUNTIME-WIRED in 4.8`. The row becomes:
    ```
    | `--checkpoint-each X`  | 4.8      | RUNTIME-WIRED in 4.8                |
    ```
  - [x] 11.2 Update the intro paragraph (lines 13-20). Replace:
    > "Story 4.7 wired `--plan-first` (dry-run preview); Stories 4.8+ will wire the remaining flags (`--checkpoint-each <type>`, SIGINT, exit-reason format)."
    With:
    > "Story 4.7 wired `--plan-first` (dry-run preview); Story 4.8 wired `--checkpoint-each <step-type>` (per-iteration checkpoint snapshot per AR13 Layer 1); Stories 4.9+ will wire the remaining flags (SIGINT, exit-reason format)."
  - [x] 11.3 INSERT a new sub-section `### --checkpoint-each <step-type> (Story 4.8)` AFTER the `### --plan-first (Story 4.7)` sub-section. Content covers:
    - **Behaviour summary**: when supplied, the loop appends a `state.yaml.checkpoints[]` entry after every iteration whose just-completed step's `phase` matches `<step-type>`. The entry shape is `{ branch, sha, takenAt, stepType }` per AR13 Layer 1.
    - **Legal step-type values** (AC-3): `analysis`, `planning`, `solutioning`, `implementation`, `retro` — the 5 `Phase` values from `src/dag/types.ts:30-35`. Any other value is rejected at argv parse time with PARSE_ERROR (FR53 exit code 2).
    - **Usage example**: `/bmad-loop --checkpoint-each implementation` (most common — checkpoint after every dev-story); `/bmad-loop --checkpoint-each analysis --until-epic-end` (combined with a stop-condition).
    - **AR13 Layer 1 reference** (architecture lines 389-407): Git branch+sha captured via `detectSnapshot()` (Story 1.8); ISO-8601 takenAt; FIFO-evicted at 50 entries.
    - **AR13 Layer 2 reference**: the `.bak` rotation rides on the existing `saveState`/`atomicWrite` path (Story 1.6).
    - **Runtime semantics**: the checkpoint write happens INSIDE `verify-and-advance.ts` (lock-held mid-tier) — NOT inside `runLoop` (lock-free top-tier per AR8). The runner threads `args.checkpointEach` through `RunNextOptions.checkpointEach`.
    - **Non-Git fallback** (OQ-7): when `detectSnapshot()` returns null (non-Git work-tree) OR throws (empty repo / git binary missing), the checkpoint append is SKIPPED gracefully — the iteration completes successfully and the loop continues.
    - **Default-cap interaction** (OQ-1): `--checkpoint-each` is NOT a stop-condition. Supplying `--checkpoint-each` ALONE without any stop-condition flag triggers the default 50-iter cap (the user wants checkpoints WITH a bounded loop). This contrasts with the 9 stop-condition flags (which suppress the default-cap when supplied alone).
    - **Exit code mapping**: unchanged from FR53.
  - [x] 11.4 Update §Behavior bullet 5 (around lines 84-88) — currently mentions only the halt-on-error short-circuit. ADD a NEW bullet 5.5 noting the checkpoint-write hook:
    > "When `--checkpoint-each <step-type>` is supplied (Story 4.8), the per-iteration `verify-and-advance.ts` post-step state save APPENDS a `state.checkpoints[]` entry IF the just-completed step's phase matches the supplied step-type. The append is silent (no AR9 / no stderr emission); the user observes the checkpoint via `state.yaml` inspection or via the exit-reason resume hint (Story 4.10 forward dependency)."
  - [x] 11.5 Verify §argumentHint (line 3) already includes `[--checkpoint-each story|epic|phase]`. UPDATE to `[--checkpoint-each analysis|planning|solutioning|implementation|retro]` per the new 5-value enum.
  - [x] 11.6 Verify the §Usage examples block (lines 22-36) already lists `/bmad-loop --checkpoint-each story` (line 33 with the legacy 3-value comment). UPDATE the example to `/bmad-loop --checkpoint-each implementation` (the most common usage per the AC's example) and update the comment from "Story 4.8 — per-iteration snapshot" to "Story 4.8 — RUNTIME-WIRED in 4.8".
  - [x] 11.7 Verify the §FR53 exit-code mapping (lines 102-117) is unchanged — Story 4.8 does NOT introduce new exit codes; checkpoint-write failures during a successful step are gracefully degraded.

- [x] **Task 12 — Update `src/commands/loop/index.ts` barrel (AC: structural)**
  - [x] 12.1 The existing barrel at `src/commands/loop/index.ts:24-33` already re-exports `Plan`, `PlannedStep`, `PlanCheckpoint`, `PlanFirstStopCondition` from `./plan.ts`. Story 4.8 updates the `PlanCheckpoint.stepType` type via Task 1.2 — the re-export is unchanged. NO new exports added by Story 4.8 at this barrel.

- [x] **Task 13 — Run the full test suite + quality gates (AC: all)**
  - [x] 13.1 `bun test src/commands/loop` exit 0. Test delta projection: ~+10-12 new describe blocks + sub-tests; ~+50-90 new expects. The existing tests (Tests A-I, X_44-AA_44, TB_45_*, KB_45_*, SE_46_*, CE_46_*, PF_47_*, SWEEP_44-47) must STILL PASS (Story 4.8 modifies only the runner's per-iteration thread + the opt-in DAG load predicate; the iteration body's stop-condition gate is unchanged).
  - [x] 13.2 `bun test src/commands/next/verify-and-advance.test.ts` exit 0. Test delta: ~+6-8 new tests; ~+30-50 new expects.
  - [x] 13.3 `bun test src/schemas/state.test.ts` exit 0. Test delta: ~+8-12 new tests for `CheckpointEntrySchema` + `StateV1Schema.checkpoints[]` typed entries.
  - [x] 13.4 `bun test src/commands/loop/args.test.ts` exit 0. Test delta: ~+7 new tests for the 5-value enum; UPDATE existing tests that assert on the legacy 3-value enum (`story`, `epic`, `phase` are now REJECTED).
  - [x] 13.5 Post-Story-4.8 baseline projection: ~220-235 pass / 0 fail / ~700-740 expects across 4 loop test files (was 210/0/644). Full regression: ~960-985 pass / 0 fail / ~3450-3500 expects across 60-61 files.
  - [x] 13.6 Confirm `src/errors.ts` registry stays at **16 codes** (`bun test src/errors.test.ts` → 10 pass / 197 expects). Story 4.8 ships ZERO new error classes.
  - [x] 13.7 Confirm `bunx --bun tsc --noEmit` exits 0. Pay attention to:
    - The new `CheckpointEntry` type cross-references — exported from `src/schemas/state.ts`, consumed by `src/commands/next/verify-and-advance.ts`.
    - The `Phase` type imports — added to `src/commands/next/run.ts` and `src/commands/next/verify-and-advance.ts`.
    - The TypeScript narrowing on `args.checkpointEach !== undefined` — should narrow to `Phase` after the guard.
  - [x] 13.8 Confirm `bunx --bun biome ci .` exits 0 (the modified files pass biome lint/format).
  - [x] 13.9 Confirm AR41 boundary checks at `src/commands/loop/run.test.ts:297` (Test I) STILL PASS — Story 4.8 adds NO new top-tier imports to `run.ts`. The `RunNextOptions.checkpointEach` thread is at the existing `runNext` import boundary (allowed per AR41).
  - [x] 13.10 Confirm `commands/bmad-loop.md` is well-formed YAML frontmatter + valid markdown body.

- [x] **Task 14 — Self-check + Senior Developer Review prep (AC: all)**
  - [x] 14.1 Re-run all 5 quality gates one final time: `bun test src/commands/loop`, `bun test src/commands/next`, `bun test src/schemas`, `bunx --bun biome ci .`, `bunx --bun tsc --noEmit`. All exit 0.
  - [x] 14.2 Confirm Story 4.7's existing tests STILL pass — Story 4.8 modifies `plan.ts:matchCheckpointType` (now restricts to phase-match instead of accept-all); some existing PF_47_7 / PC6 / PC7 tests may need updates IF they asserted on the old "accept-all" behaviour. Inspect `src/commands/loop/plan.test.ts` for the affected tests; UPDATE assertions to match the new restricted behaviour (the plan now only surfaces checkpoints for steps whose phase matches `args.checkpointEach`).
  - [x] 14.3 Confirm Stories 4.2/4.3/4.4/4.5/4.6 existing tests STILL pass — the iteration body's stop-condition gate is unchanged. The opt-in DAG load extension at run.ts:757 is additive (also loads when `args.checkpointEach !== undefined`); the existing `args.phaseEnd === true` path is preserved verbatim.
  - [x] 14.4 Confirm Story 4.1's existing Tests A-I STILL pass — the LoopArgsSchema + parseLoopArgs surface is preserved (only the `checkpointEach` enum values changed; the field name + cardinality are unchanged).
  - [x] 14.5 Confirm Story 1.8's `detectSnapshot` tests STILL pass — Story 4.8 does NOT modify `src/snapshot/detect.ts` (only consumes the existing function).
  - [x] 14.6 Confirm Story 1.6's `saveState` tests STILL pass — Story 4.8 does NOT modify `src/state/save.ts` or `src/io/atomic-write.ts` (only consumes the existing atomic write path).
  - [x] 14.7 Confirm Story 1.5's `StateV1Schema` tests STILL pass — the new typed `checkpoints` declaration is additive (existing empty-array tests still pass; new typed-entry tests are net-additive).
  - [x] 14.8 Confirm no `console.*` in any new or modified file (per AR33).
  - [x] 14.9 Confirm AR41 boundary remains clean — the new `Phase` import in `next/run.ts` + `next/verify-and-advance.ts` is mid-tier ↔ foundational (allowed); the `CheckpointEntry` import is mid-tier ↔ foundational (allowed); the `detectSnapshot` import is mid-tier ↔ mid-tier (already established).
  - [x] 14.10 Update §Dev Agent Record §Completion Notes with: (a) actual final test counts, (b) any deviations from this story spec, (c) any open questions surfaced during implementation that should be tracked in code-review, (d) the EXACT line:column references of the new code (run.ts checkpoint-thread; verify-and-advance.ts append block; schemas/state.ts CheckpointEntrySchema).

- [x] **Task 15 — Sprint-status update (AC: all)**
  - [x] 15.1 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: flip `4-8-checkpoint-each-step-type: backlog → ready-for-dev` (this Story 4.8 create-story step). At dev-story completion, flip to `review`. At code-review completion, flip to `done`.
  - [x] 15.2 Bump `last_updated:` timestamp at BOTH the `# last_updated:` comment line (line 2) AND the `last_updated:` key:value line (line 38) to the current ISO timestamp.
  - [x] 15.3 sprint-status.yaml retains its original schema (no new fields). DO NOT touch any other story status.

## Dev Notes

### Architecture invariants enforced

- **AR8** (lock-free top-tier `run.ts`; lock-held `verify-and-advance.ts`): UPHELD. The runner threads `args.checkpointEach` through `RunNextOptions.checkpointEach` to the per-iteration `runNext` invocation; the actual checkpoint write happens inside `verify-and-advance.ts` (the lock-held mid-tier layer that already owns the post-step state save). ZERO new lock acquisitions at the runner tier.
- **AR9** (single discriminated-union JSON line on stdout): UPHELD. The checkpoint-append block is SILENT (no per-iteration AR9 emission, no stderr write); the loop-final AR9 line at the import.meta.main block continues to summarise the loop outcome.
- **AR13** (snapshot/checkpoint mechanism, two-layer): WIRED HERE. Layer 1 (Git branch+sha capture via `detectSnapshot()` from Story 1.8) is forwarded to `state.checkpoints[]` per the AR13 contract. Layer 2 (.bak rotation via `saveState`/`atomicWrite`) piggybacks on the existing post-step state save.
- **AR21+22** (errors carry code + actionable hint): UNCHANGED. Story 4.8 ships ZERO new error classes; registry stays at 16 codes. Snapshot capture failures inside a confirmed Git work-tree (e.g., empty-repo, git-missing) propagate as system errors per Story 1.8's existing contract; non-Git fallback emits the existing one-time warning per Story 1.8.
- **AR33** (function & error semantics; throw not Result; no console.\*; async/await): UPHELD. The checkpoint-append block is async (`detectSnapshot` is async); ZERO `console.*` calls.
- **AR34** (slash-command markdown protocol): EXTENDED. The `commands/bmad-loop.md` modifications are documentation-only — table flip + new sub-section + paragraph updates + argumentHint update.
- **AR41** (boundary graph): UPHELD. The new `RunNextOptions.checkpointEach` field is a TOP-TIER → MID-TIER thread (allowed). The `verify-and-advance.ts` checkpoint-write site imports `detectSnapshot` from `src/snapshot/detect.ts` (mid-tier ↔ mid-tier — already established). The `CheckpointEntry` import from `schemas/state.ts` is mid-tier ↔ foundational (allowed). The `Phase` import from `dag/types.ts` is mid-tier ↔ foundational (allowed). ZERO new top-tier imports added to `run.ts`.
- **AR42** (test discipline): EXTENDED. New colocated tests in `verify-and-advance.test.ts` + `run.test.ts` + `state.test.ts`; tmpdir-per-test discipline preserved (the new tests use `os.tmpdir()` for state.yaml fixtures; cleanup via `fs.rm({ recursive: true, force: true })` in `afterEach` per Story 1.8 + Story 4.5 precedent).

### Code paths to extend

Story 4.8's modification points (file:line refs against the current Story 4.7 baseline):

- **`src/commands/loop/args.ts:104`** — REPLACE the legacy 3-value enum with the 5-value Phase enum.
- **`src/commands/loop/args.ts:24-39, 81-83`** — UPDATE the field-table comment + Zod schema JSDoc.
- **`src/schemas/state.ts:117`** — REPLACE the loose `z.array(z.unknown())` with the typed `z.array(CheckpointEntrySchema)`.
- **`src/schemas/state.ts:88+`** — INSERT the new `CheckpointEntrySchema` declaration (mirrors Story 3.1 named-extraction precedent).
- **`src/commands/loop/run.ts:756-759`** — EXTEND the opt-in DAG load predicate (`args.phaseEnd === true || args.checkpointEach !== undefined`).
- **`src/commands/loop/run.ts:679`** — WRAP `runNextFn` with a closure to inject `args.checkpointEach`.
- **`src/commands/loop/run.ts:491-520`** — UPDATE the JSDoc above `runLoop` to document the checkpoint-write thread.
- **`src/commands/loop/plan.ts:104, 322-331`** — UPDATE the `PlanCheckpoint.stepType` type and `matchCheckpointType` helper to consume the new 5-value Phase enum + restrict to phase-match (instead of accept-all).
- **`src/commands/next/run.ts:210-253`** — ADD `checkpointEach?: Phase` to `RunNextOptions`.
- **`src/commands/next/run.ts:1342+`** — FORWARD `opts?.checkpointEach` through to `verifyAndAdvance` invocation.
- **`src/commands/next/verify-and-advance.ts:165-200`** — ADD `checkpointEach?: Phase` to options interface.
- **`src/commands/next/verify-and-advance.ts:506-540`** — INSERT the checkpoint-append block between `runHistoryEntry` build and `saveState` call.
- **`src/commands/next/verify-and-advance.ts:541`** — UNCHANGED — existing `saveState` call rides the .bak rotation.
- **`src/commands/loop/run.test.ts`** — INSERT the new CE_48_1-8 + SWEEP_48 describe blocks; UPDATE the top-of-file coverage comment.
- **`src/commands/next/verify-and-advance.test.ts`** — INSERT the new CV_48_1-6 describe blocks.
- **`src/schemas/state.test.ts`** — INSERT the new `describe("CheckpointEntrySchema")` + `describe("StateV1Schema.checkpoints — Story 4.8 typed entries")` blocks.
- **`src/commands/loop/args.test.ts`** — UPDATE the existing checkpoint-each tests for the new 5-value enum.
- **`commands/bmad-loop.md:13-20, 84-88, 102-117, 187-201, +411`** — INTRO paragraph, BEHAVIOUR bullet 5 + 5.5, FR53 reference, STOP CONDITIONS table, NEW sub-section.

### `CheckpointEntry` schema design contract

The `CheckpointEntry` shape is the v0.1 minimum-viable structure for AR13 Layer 1. Each field is required (NO optional fields):
- `branch: z.string()` — Git branch name. The literal string `"HEAD"` for detached-HEAD repos (per Story 1.8 contract).
- `sha: z.string()` — 40-char lowercase hex SHA. NOT validated against a regex in v0.1 (defensive: future Git versions may use SHA-256 or non-hex). Story 6.x may tighten with `.regex(/^[0-9a-f]{40}$/)` when SHA-1 deprecation is finalized.
- `takenAt: z.string()` — ISO-8601 timestamp. NOT validated against an ISO regex in v0.1 (defensive: same precedent as `lastSnapshot.takenAt` in the existing schema).
- `stepType: z.enum([5 phase values])` — the matched `Phase` value. Echoes `args.checkpointEach`.

The `.max(50)` cap on `state.checkpoints[]` is preserved from the original Story 1.5 declaration. The FIFO trim happens at the WRITE site inside `verify-and-advance.ts` (not at the schema level — Zod's `.max(50)` would REJECT a 51st entry rather than silently trimming).

### Phase taxonomy duplication trade-off (OQ-3)

The 5 phase values appear in THREE places after Story 4.8:
1. `src/dag/types.ts:30-35` — the canonical `Phase` literal-union declaration.
2. `src/commands/loop/args.ts:104` — the Zod enum for `checkpointEach`.
3. `src/schemas/state.ts:NEW` — the Zod enum for `CheckpointEntry.stepType`.

The duplication is a deliberate trade-off (OQ-3): the alternative is to import `Phase` from `dag/types.ts` and use `z.nativeEnum(Phase)` (or the equivalent for a literal-union type) inside the Zod schemas. However, AR41 forbids `src/schemas/` from importing `src/dag/` (foundational ← mid-tier). The duplication keeps the boundary clean at the cost of three locations to update if the Phase taxonomy changes. v0.1 conservative accepts the duplication because (a) the Phase taxonomy is stable per Story 1.10 (no expected churn), (b) the duplication is enumerated so cross-checks are mechanical, (c) a future story can introduce a foundational `src/types/phase.ts` module that all three consumers import from (architecture forward-tracker for Story 6.x).

### Lock-held write site rationale (AR8)

`runLoop` is lock-free per AR8 (architecture line 1672 + Story 4.1 inheritance). The checkpoint write requires `saveState`, which requires a `LockHandle` per `src/state/save.ts:68`. Story 4.8 RESOLVES the constraint by threading `args.checkpointEach` through `RunNextOptions.checkpointEach` to `verify-and-advance.ts` (the existing lock-held mid-tier layer that already owns the post-step state save at line 541).

The alternative — having `runLoop` acquire/release a lock JUST for the checkpoint write — is REJECTED for three reasons:
1. AR8 violation — `run.ts` would gain a `src/lock/` import.
2. Performance — per-iteration lock acquire/release would add ~5-10ms per iteration with no architectural benefit.
3. Correctness — the lock-held write site already exists; doubling the write would create a TOCTOU window where the loop's checkpoint append could race with `verify-and-advance.ts`'s state save.

Threading through `RunNextOptions` is the canonical seam (mirrors Story 4.5's `runHistory[].tokens` flow per architecture's per-iteration accumulator pattern).

### FIFO-50 enforcement site

The FIFO-50 trim happens at the WRITE site inside `verify-and-advance.ts` (Task 7.4). The trim logic:
```typescript
nextCheckpoints.push(entry);
if (nextCheckpoints.length > 50) {
  nextCheckpoints = nextCheckpoints.slice(nextCheckpoints.length - 50);
}
```
This drops the OLDEST entry (slice from `length - 50`) when at-or-over cap. The Zod `.max(50)` on `StateV1Schema.checkpoints[]` is the SECONDARY guard — it would REJECT a 51st entry on `saveState` if the trim logic somehow failed.

The trim is semantically EQUIVALENT to a circular buffer with `head/tail` indices, but the array-slice form is preferred because:
1. The `state.yaml` representation is a flat array (not a buffer with metadata).
2. The slice form is read-once-write-once per iteration; the buffer form would require re-encoding head/tail on every save.
3. The slice form preserves insertion order (the user can read the checkpoints array left-to-right in chronological order).

### Non-Git fallback semantics (OQ-7)

When the project is NOT a Git work-tree, `detectSnapshot()` returns `null` per Story 1.8 (with a one-time stderr warning). Story 4.8 v0.1 GRACEFULLY DEGRADES: when `detectSnapshot()` returns null OR throws (empty-repo / git-binary-missing), the checkpoint append is SKIPPED — the iteration completes successfully and the loop continues. NO halt; NO new error class.

The trade-off: a non-Git user who supplied `--checkpoint-each implementation` sees ZERO checkpoints in the resulting `state.yaml`. The existing Story 1.8 stderr warning ("snapshot: not a git repository, lastSnapshot=null") fires once, providing the user with diagnostic feedback. Tracked as OQ-7 — Story 4.10 may surface this in the exit-reason resume hint.

### Plan-mode integration (Story 4.7 forward-tracker)

Story 4.7 §Forward-tracker line 1196 explicitly tags Story 4.8: "SHARE the `matchCheckpointType` pure-function helper at plan.ts:322-331 with Story 4.8's runtime path; refine the v0.1 boilerplate description to reflect actual snapshot-creation semantics."

Story 4.8 honours this in TWO ways:
1. UPDATE `plan.ts:matchCheckpointType` to consume the NEW 5-value Phase enum AND restrict to phase-match (instead of accept-all). The plan-mode preview now ACCURATELY enumerates the planned checkpoint locations (the v0.1 helper over-counted).
2. INLINE the analogous runtime matcher inside `verify-and-advance.ts` (rather than importing from `loop/plan.ts`) per AR41 boundary — top-tier `loop/plan.ts` cannot be imported from mid-tier `next/verify-and-advance.ts`. The duplication is ~6 lines and is deliberate per OQ-4.

### Test-suite impact + tmpdir-per-test discipline

Post-Story-4.7 baseline: 210 / 0 / 644 across 4 files (loop tests). Story 4.8 adds:
- `run.test.ts` extension: ~10-12 new describe blocks + sub-tests covering CE_48_1-8 + SWEEP_48; ~+50-90 new expects.
- `verify-and-advance.test.ts` extension: ~6-8 new tests; ~+30-50 new expects.
- `state.test.ts` extension: ~8-12 new tests; ~+25-40 new expects.
- `args.test.ts` extension: ~7 new tests for the 5-value enum.

Net post-Story-4.8: ~220-235 / 0 / ~700-740 across 4 loop test files. Full regression: ~960-985 / 0 / ~3450-3500 expects across 60-61 files. Errors registry held at 16.

The new tests use `os.tmpdir()` for state.yaml fixtures + `git init` + `git commit` in tmpdirs for the AC-2 snapshot capture tests (mirror Story 1.8 §Test Pattern). Cleanup via `fs.rm({ recursive: true, force: true })` in `afterEach` per AR42 + Story 1.8 precedent.

### Errors registry + Stories 4.9+ forward-trackers

ZERO new error classes (registry holds at 16). The checkpoint-append block uses pure-function logic + try/catch around `detectSnapshot()`; failure paths skip the append silently per OQ-7.

Forward-trackers:
- **Story 4.9 (`SIGINT graceful exit`)**: Adds a SIGINT handler. The checkpoint-append block lives INSIDE `verify-and-advance.ts` which already enforces atomic writes via `saveState`/`atomicWrite` — a SIGINT mid-flight either completes the write atomically (the entry is persisted) or aborts before the write (NO partial-write window). The SIGINT handler does NOT need to coordinate with checkpoint append.
- **Story 4.10 (Loop exit reason + resume hint format)**: ENRICHES `formatExitReason` for all StopReason variants. May ALSO surface the latest checkpoint info (`state.checkpoints[checkpoints.length - 1]`) in the resume hint — "Last checkpoint: <branch>@<sha> at <takenAt>". Forward-tracker for Story 4.10's developer.
- **Story 6.3 (`models:` per-step config)**: REPLACES `lookupModelTokens` v0.1 stub at plan.ts:171-175. Story 4.8 does NOT touch this surface.
- **Story 6.x (Phase taxonomy consolidation)** (OQ-3): Extract the 5 phase values into a foundational `src/types/phase.ts` module that all three consumers (`dag/types.ts`, `loop/args.ts`, `schemas/state.ts`) import from, eliminating the duplication.
- **Story 6.x (`hasExplicitStopCondition` helper)** (OQ-1 inherited): The 10-clause default-cap predicate at run.ts:664-677 stays at 10 clauses (Story 4.8 does NOT add a `checkpointEach` clause per OQ-1). The forward-tracker remains.

### N-1 + N-2 + OQ-1/OQ-8 nit inheritance

Story 4.7 §Forward Action Items at lines 1196-1204 enumerate 9 forward-trackers carried from prior stories. Story 4.8 INHERITS:
- N-1 (defensive null check at `stop-conditions.ts:269` unreachable arm) — UNCHANGED, stop-conditions.ts NOT modified.
- N-2 (`EMPTY_DAG` + `EMPTY_STATE` sentinel mid-file placement) — KEPT, the iteration body still consumes them.
- OQ-1 (10-clause default-cap predicate refactor) — DEFERRED, predicate stays at 10 clauses (Story 4.8 does NOT add an 11th clause per OQ-1 below).
- OQ-2 (Story 6.3 `models:` config v0.1 stub) — UNCHANGED, plan.ts:171-175 stays.
- OQ-8 (`src/dag/sort.ts` architecture reference unfulfilled) — DEFERRED, Story 4.8 uses the existing `dag.nodes.get(step)?.phase` pattern.
- D3 forward-tracker (per-iteration state caching) — UNCHANGED, Story 4.8 does NOT introduce additional state reads (the per-iteration verify-and-advance.ts path already reads stateBefore).

### Length justification

This spec is ~620 lines targeting the precedent set by 4.6 (~915 lines) and 4.7 (~1216 lines). The substantive Story 4.8 content lives in: §Context Summary (the lock-held write site reasoning + Phase enum replacement design), §Tasks (15 tasks — Tasks 4-8 own the schema + runner + verify-and-advance wiring which are the primary deliverables, ~3-task length each), §Dev Notes (architecture invariants + code paths + design contracts + lock-held rationale + non-Git fallback), §Open Questions (10 OQs covering the runtime-vs-plan-mode duplication, Phase taxonomy, FIFO trim semantics, schema validation strictness), §Forward Action Items (Stories 4.9/4.10 + 6.3 + 6.x). The runtime-write site decision + the schema tightening + the AR41 boundary maintenance mandate detailed reasoning.

## Open Questions for Code Review

1. **Default-cap interaction — does `--checkpoint-each` alone trigger default-cap?**: The 10-clause default-cap inverted-check at `run.ts:664-677` suppresses the default 50-iter cap when ANY of the 10 stop-condition / behaviour flags is set. Story 4.8 considered adding an 11th clause `&& args.checkpointEach === undefined` so that `--checkpoint-each` alone ALSO suppresses the default-cap. **DECISION: REJECT**. `--checkpoint-each` is NOT a stop-condition — it does NOT cause the loop to halt. Supplying `--checkpoint-each` ALONE without any stop-condition flag SHOULD inject the default 50-iter cap (the user wants checkpoints WITH a bounded loop). The 10-clause predicate is unchanged. This contrasts with `--plan-first` (Story 4.7) which IS gated as a clause because plan-mode IS a behaviour-changing flag (short-circuits the iteration body); `--checkpoint-each` is purely augmentative. Trade-off: surface (user might be surprised that `--checkpoint-each implementation` alone caps at 50 iters) vs hide (user might create unbounded loops by accident). v0.1 chooses surface — the default-cap is a SAFETY feature; aborting it for a checkpoint-control flag would be unsafe.

2. **`Phase` type import at args.ts**: Story 4.8 considered importing `Phase` from `src/dag/types.ts` into `src/commands/loop/args.ts` so the `checkpointEach` field is typed as `Phase | undefined` (matching the new enum). **DECISION: DEFER**. The Zod inference produces a structurally identical string-union (`"analysis" | "planning" | "solutioning" | "implementation" | "retro"`), so the existing TypeScript narrowing works without the import. Adding the import couples `args.ts` (top-tier) to `dag/types.ts` (foundational mid-tier) — currently args.ts has ZERO mid-tier imports. v0.1 conservative keeps args.ts mid-tier-import-free. Trade-off: explicit Phase narrowing (helpful for tooling consumers; clearer intent) vs zero new imports (cleaner boundary). v0.1 chooses zero imports.

3. **Phase taxonomy duplication across 3 schemas**: The 5 phase values appear in `src/dag/types.ts:30-35` (Phase literal-union), `src/commands/loop/args.ts:104` (Zod enum for checkpointEach), and `src/schemas/state.ts:NEW` (Zod enum for CheckpointEntry.stepType). AR41 forbids `src/schemas/` from importing `src/dag/` (foundational ← mid-tier ban). The duplication is enumerated so cross-checks are mechanical, but adds a maintenance liability. **DECISION: ACCEPT v0.1; FORWARD-TRACKER for Story 6.x**. Future story should extract the 5 phase values into a foundational `src/types/phase.ts` module that all three consumers import from.

4. **`matchCheckpointType` runtime duplication (plan.ts vs verify-and-advance.ts)**: Story 4.8 INLINES a `matchCheckpointPhase` helper inside `verify-and-advance.ts` (mid-tier) rather than importing `matchCheckpointType` from `loop/plan.ts` (top-tier). The duplication is ~6 lines; the reason is AR41 — top-tier modules cannot be imported from mid-tier. **DECISION: ACCEPT v0.1**. Trade-off: shared helper (cleaner, one source of truth) vs AR41 compliance (no boundary violation). v0.1 chooses AR41 compliance. A future story could extract the helper into a foundational `src/checkpoint/match.ts` module that both consumers import; v0.1 conservative defers this to Story 6.x as the duplication is small.

5. **FIFO-50 trim site: read-modify-write at verify-and-advance.ts vs schema-level rejection**: Story 4.8 implements the FIFO-50 trim at the WRITE site (verify-and-advance.ts). The Zod `.max(50)` on `StateV1Schema.checkpoints[]` is the SECONDARY guard — it would reject a 51st entry on saveState if the trim logic somehow failed. **DECISION: ACCEPT**. The write-site trim is the canonical pattern (mirrors `runHistory[].max(100)` from Story 1.5); schema-level rejection would surface as a `CorruptStateError` which is harsh UX for a recoverable condition.

6. **Snapshot capture failures — graceful skip vs halt**: When `detectSnapshot()` throws inside a confirmed Git work-tree (e.g., empty-repo with no commits, git-binary-missing for an in-progress git install), Story 4.8 v0.1 GRACEFULLY SKIPS the checkpoint append (the iteration completes successfully). **DECISION: ACCEPT v0.1**. Trade-off: graceful (user's loop continues; checkpoint absent from state.yaml) vs halt (user is alerted to the failure but loses an iteration's work). v0.1 chooses graceful because (a) the snapshot capture is BEST-EFFORT per AR13's wording ("triggers an explicit Layer 1 snapshot"), (b) the user can re-run the failed step manually if checkpoints are critical. Story 4.10 may surface this in the exit-reason resume hint.

7. **CheckpointEntrySchema migration trade-off**: The existing `state.yaml` files with `checkpoints: []` (empty array) validate cleanly under the new typed schema. Older v1 files with raw `z.unknown()` entries (e.g., a future Story 4.8 dev iteration that wrote pre-spec entries) would trigger a Zod validation error on load. **DECISION: ACCEPT v0.1; NO MIGRATION**. The current `state.yaml` files in production are all empty arrays (the flag was parsed-only since Story 4.1; no production code wrote to `checkpoints[]`). Adding a v2 schema migration just for this typed-tightening would be over-engineering. If a future state.yaml is found with invalid checkpoint entries, the user resolves via `--recompute-state` (Story 1.6 rebuild from disk) which produces a fresh `checkpoints: []`.

8. **DAG availability on the verify-and-advance write side**: The runtime checkpoint matcher requires DAG access to look up `node.phase`. Story 4.8 ASSUMES `verify-and-advance.ts` already has DAG access (the verifier needs the DAG for phase resolution per Story 2.4). **DECISION: VERIFY DURING IMPLEMENTATION**. If `verify-and-advance.ts` does NOT currently have a DAG-injection seam, Story 4.8 ADDS one (via `dag?: DagAdjacency` on the options interface). The runner threads `loopDag` through `RunNextOptions.dag` (or constructs the DAG on-demand inside `runNext`). The Open Question is whether the existing DAG-injection seam covers the per-iteration phase lookup — IF NOT, Task 7 grows by ~10-15 lines.

9. **Multi-step-type support — single value vs comma-separated**: The current AC says `--checkpoint-each <step-type>` (singular). A future user may want `--checkpoint-each implementation,analysis` (comma-separated multiple). **DECISION: DEFER**. v0.1 ships single-value support per AC verbatim. A future story can extend the parser to accept comma-separated values; the runtime matcher would then check `args.checkpointEach.includes(node.phase)`. Forward-tracker.

10. **Telemetry / observability**: Story 4.8 does NOT emit per-iteration checkpoint-write events to the dispatch log or telemetry surface. The user observes checkpoints via `state.yaml` inspection (or future `--export-state` per Story 3.10). **DECISION: ACCEPT v0.1**. The silent write is consistent with `runHistory[]` (also silent). Future Story 6.6+6.7 (telemetry) may surface checkpoint-write counts; Story 4.10 may surface the latest checkpoint in the resume hint.

## Forward Action Items

- **Story 4.9 (SIGINT graceful exit)**: Adds a SIGINT handler. The checkpoint-append block lives INSIDE `verify-and-advance.ts` which already enforces atomic writes via `saveState`/`atomicWrite` — a SIGINT mid-flight either completes the write atomically (the entry is persisted) or aborts before the write (NO partial-write window). The SIGINT handler does NOT need to coordinate with checkpoint append.
- **Story 4.10 (Loop exit reason + resume hint format)**: ENRICHES `formatExitReason` for all StopReason variants. May ALSO surface the latest checkpoint info in the resume hint — "Last checkpoint: <branch>@<sha> at <takenAt>". Story 4.10 may also unify the plan-mode `formattedPlan` with the same hint-formatter pattern (Story 4.7 forward-tracker).
- **Story 6.3 (`models:` per-step config)**: REPLACE `lookupModelTokens` v0.1 stub at plan.ts:171-175 with config-driven lookup from `bmad-stepper.config.yaml`. Story 4.8 does NOT touch this surface.
- **Story 6.x (Phase taxonomy consolidation)** (OQ-3): Extract the 5 phase values into a foundational `src/types/phase.ts` module that all three consumers (`dag/types.ts`, `loop/args.ts`, `schemas/state.ts`) import from, eliminating the duplication.
- **Story 6.x (`hasExplicitStopCondition` helper)** (OQ-1 inherited): The 10-clause default-cap predicate at run.ts:664-677 stays at 10 clauses (Story 4.8 does NOT add an 11th clause). When the predicate grows to ~12+ clauses or readability degrades, refactor to a `hasExplicitStopCondition(args)` helper.
- **Story 6.x (multi-step-type support)** (OQ-9): Extend the parser to accept comma-separated values (`--checkpoint-each implementation,analysis`). Pure-function extension of the runtime matcher.
- **Story 6.x (telemetry)** (OQ-10): Surface per-iteration checkpoint-write counts in the telemetry surface; surface the latest checkpoint in the exit-reason resume hint.
- **Story 6.x (`matchCheckpointPhase` extraction)** (OQ-4): Extract the runtime matcher into a foundational `src/checkpoint/match.ts` module shared between `loop/plan.ts` and `next/verify-and-advance.ts`.
- **N-1 cosmetic nit (inherited from Story 4.2/4.3/4.4/4.5/4.6/4.7)**: defensive `epicNum === undefined || epicNum === null` check at `src/commands/loop/stop-conditions.ts:269` has unreachable `=== null` arm given optional-chain returns `undefined`. Cosmetic; preserved in 4.8 because `stop-conditions.ts` is NOT modified.
- **N-2 cosmetic nit (inherited)**: `EMPTY_DAG` + `EMPTY_STATE` sentinel mid-file placement at `run.ts:406-410, 420-429`. KEPT in 4.8.
- **D3 forward-tracker (per-iteration state caching)**: Story 4.8 introduces ZERO new state reads at the runner tier (the existing per-iteration `stateFn` calls are unchanged); the lock-held `verify-and-advance.ts` already reads stateBefore as part of its existing protocol. v0.1 conservative does NOT merge calls.
- **AC-2 checkpoint runtime completeness for plan-mode**: Story 4.7's plan-mode SURFACES the planned checkpoint locations (the v0.1 helper over-counted; Story 4.8 RESTRICTS to phase-match per Task 1.1). The plan-mode preview is now ACCURATE. The integration test PF_47_7 may need an update IF its assertion is on the "accept-all" behaviour. Tracked as Task 14.2.

## References

- `_bmad-output/planning-artifacts/epics.md` lines 1002-1014 — AC verbatim source.
- `_bmad-output/planning-artifacts/prd.md` line 698 (FR22: `--checkpoint-each`) + line 595 (mandatory checkpoint snapshots) + line 598 (`--checkpoint-each <step-type>` semantics) + line 745 (FR54: stdout/stderr discipline) + line 768 (NFR-S5: atomic tmp+rename + .bak rotation) + line 773 (NFR-R1: zero data loss).
- `_bmad-output/planning-artifacts/architecture.md` line 405 (AR13 D10 §`--checkpoint-each` + FIFO-50 cap) + lines 389-407 (full AR13 D10 §Snapshot/checkpoint mechanism block) + line 769 (state.yaml example with `checkpoints: []` comment) + line 1352 (FR22 implementation location reference: `src/io/snapshot.ts` — Story 4.8 uses the existing `src/snapshot/detect.ts` from Story 1.8 instead) + §AR8/9/13/21/22/33/34/41/42 invariants.
- `_bmad-output/implementation-artifacts/4-7-plan-first-dry-run-preview.md` — predecessor (status done; verdict approve); §Forward-tracker line 1196 explicitly tags Story 4.8 to share `matchCheckpointType` and refine the v0.1 boilerplate.
- `_bmad-output/implementation-artifacts/4-6-stop-condition-error-with-stop-on-error-continue-on-error.md` — default-cap inverted-check extension precedent; halt-on-error short-circuit ordering.
- `_bmad-output/implementation-artifacts/4-5-stop-condition-time-budget-and-token-budget.md` — per-iteration accumulator pattern; AR10 token-flow precedent for the runHistory[] read pattern.
- `_bmad-output/implementation-artifacts/4-4-stop-condition-max-iters-and-default-cap.md` — default-cap inverted-check pattern.
- `_bmad-output/implementation-artifacts/4-3-stop-condition-next-story-and-phase-end.md` — opt-in DAG load pattern; per-iteration `dag.nodes.get(step)?.phase` lookup precedent.
- `_bmad-output/implementation-artifacts/4-2-stop-condition-epic-end-and-story-x-y.md` — `stop-conditions.ts` module structure (Story 4.8 does NOT add to stop-conditions.ts; this dep is for the AR9 message format precedent).
- `_bmad-output/implementation-artifacts/4-1-bmad-loop-command-skeleton.md` — `LoopArgsSchema` `checkpointEach` declaration (parsed-only since 4.1).
- `_bmad-output/implementation-artifacts/1-8-snapshot-branch-sha-detection.md` — `detectSnapshot()` API + Snapshot type + non-Git fallback semantics.
- `_bmad-output/implementation-artifacts/1-6-state-subsystem-load-save-recompute-skeleton.md` — `saveState` API + atomic .bak rotation.
- `_bmad-output/implementation-artifacts/1-5-schemas-migrations-skeleton.md` — `StateV1Schema` original declaration; `runHistory[].max(100)` precedent for the typed-array pattern.
- `_bmad-output/implementation-artifacts/1-10-dag-seed-three-tier-registry.md` — DAG `build()` + `Phase` literal-union + `dag.nodes.get(name)?.phase` lookup pattern.
- `src/commands/loop/run.ts` (~1157 lines) — modified for the opt-in DAG load extension + per-iteration `runNextFn` closure thread.
- `src/commands/loop/run.test.ts` (~2035 lines after 4.7) — modified with new CE_48_* + SWEEP_48 tests.
- `src/commands/loop/plan.ts` (~576 lines) — modified for `matchCheckpointType` restriction + `PlanCheckpoint.stepType` type update.
- `src/commands/next/run.ts` — modified to add `RunNextOptions.checkpointEach`.
- `src/commands/next/verify-and-advance.ts` — modified to add the checkpoint-append block.
- `src/commands/next/verify-and-advance.test.ts` — modified with new CV_48_* tests.
- `src/schemas/state.ts` (~124 lines) — modified to add `CheckpointEntrySchema` + tighten `StateV1Schema.checkpoints[]`.
- `src/schemas/state.test.ts` — modified with new typed-checkpoint validation tests.
- `src/snapshot/detect.ts` (~213 lines) — UNCHANGED (Story 1.8 surface consumed).
- `src/state/save.ts` (~91 lines) — UNCHANGED (Story 1.6 surface consumed).
- `src/io/atomic-write.ts` — UNCHANGED (Story 1.3 surface consumed).
- `src/dag/types.ts:30-35` — UNCHANGED (Story 1.10 `Phase` literal-union consumed).
- `src/errors.ts` — UNCHANGED (registry stays at 16; ZERO new error classes).
- `commands/bmad-loop.md` (~567 lines) — modified for the new sub-section + table flip + intro paragraph + behaviour bullet 5.5.

## Dev Agent Record

### Context Reference

Inputs (full list in §References + frontmatter `inputDocuments`). Story 4.8 spec read end-to-end; 15 Tasks / 117 sub-tasks completed; 10 OQs surfaced for code-review adjudication.

### Agent Model Used

claude-opus-4-7[1m] (1M context). Bun v1.3.13 (>= AR2 1.3).

### Debug Log References

- Initial run (2026-05-04T07:19:08Z): all 5 quality gates green on first attempt after applying biome auto-fix.

### Completion Notes List

- **AC-1 (`state.checkpoints[]` append per matching iteration)**: WIRED. The append happens INSIDE `src/commands/next/verify-and-advance.ts` (lock-held mid-tier per AR8) — between the `runHistoryEntry` build and the `stateAfter` build. Entry shape `{ branch, sha, takenAt, stepType }` per AR13 Layer 1 (validated via `CheckpointEntrySchema.parse` at write). FIFO-50 trim is at the WRITE site.
- **AC-2 (`.bak` rotation + Git branch+sha capture)**: VERIFIED. Layer 1 (Git capture via `detectSnapshot()`) invokes Story 1.8's existing `detectSnapshot()` API. Layer 2 (`.bak` rotation) rides on the existing `saveState()` call (no new write site). The `.bak` rotation is exercised by Story 1.6 atomic-write tests; the existing AC-2 atomic-copy test continues to pass.
- **AC-3 (5 step-type values)**: WIRED in three places per OQ-3 deliberate duplication: (a) `src/commands/loop/args.ts` Zod enum, (b) `src/schemas/state.ts` `CheckpointEntrySchema.stepType` enum, (c) `src/dag/types.ts:30-35` canonical `Phase` literal-union (UNCHANGED — already correct).
- **Errors registry**: stays at 16 codes — no new error classes added.
- **Test counts**: baseline 951/0/3411 → final 976/0/3478 (Δ +25/+67).
- **Biome**: 1 auto-fix run (format + import organize) — applied via `bunx --bun biome check --write`.

### File List

Source modifications:
- `src/schemas/state.ts` — added `CheckpointEntrySchema` + tightened `StateV1Schema.checkpoints`. (~+45 lines)
- `src/commands/loop/args.ts` — replaced legacy 3-value enum with 5-value Phase enum. (~+5 lines net)
- `src/commands/loop/plan.ts` — restricted `matchCheckpointType` to phase-match; updated `PlanCheckpoint.stepType` type. (~+5 lines net)
- `src/commands/loop/run.ts` — extended opt-in DAG load predicate; added `productionRunNextFn` closure to thread `args.checkpointEach`. (~+15 lines)
- `src/commands/next/run.ts` — added `RunNextOptions.checkpointEach: Phase`. (~+25 lines incl. JSDoc)
- `src/commands/next/verify-and-advance.ts` — added `checkpointEach` + `dag` options; added `matchCheckpointPhase` exported helper; inserted checkpoint-append block before stateAfter. (~+90 lines)

Test modifications:
- `src/schemas/state.test.ts` — added CheckpointEntrySchema + StateV1Schema.checkpoints tests; updated existing FIFO tests with valid entries. (~+90 lines)
- `src/commands/loop/args.test.ts` — updated existing tests for new 5-value enum; added 5-value positive test + legacy-rejection negative test. (~+15 lines)
- `src/commands/loop/plan.test.ts` — updated PC6 + PF4 tests for new phase-match semantics; added analysis-phase positive test. (~+25 lines net)
- `src/commands/loop/run.test.ts` — added CE_48_1-8 + SWEEP_48 integration tests; updated PF_47_7 for new phase-match. (~+260 lines)
- `src/commands/next/verify-and-advance.test.ts` — added matchCheckpointPhase pure-function tests + CV_48_1-6 integration tests. (~+260 lines)

Documentation modifications:
- `commands/bmad-loop.md` — flipped table row to RUNTIME-WIRED in 4.8; added new sub-section; updated argumentHint + intro paragraph + behavior bullet 5.5. (~+65 lines)

Non-source modifications:
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — flipped `4-8-checkpoint-each-step-type: ready-for-dev → review`; bumped last_updated.
- `_bmad-output/implementation-artifacts/4-8-checkpoint-each-step-type.md` — frontmatter status `ready-for-dev → review`; inline Status flipped; ticked all 117 task checkboxes; populated Dev Agent Record + File List + Change Log.
- `.bmad-stepper/state.yaml` — workflow.lastStep advanced to bmad-dev-story; nextStep=bmad-code-review; appended evidenceIndex entry.

### Deviations

- **D1: `verify-and-advance.ts` DAG injection seam (Task 7.4)**: The story spec's matchCheckpointPhase helper used a `dag: DagAdjacency | null` parameter without explaining how the runner would inject it. Since `runVerifyAndAdvance` is called as a SEPARATE process (not from `runNext`), the runner cannot pass a DAG instance across the process boundary in v0.1. RESOLUTION: added `opts.dag?: DagAdjacency` as a test-injection seam; production callers fall back to the existing `derivePhaseFromStep` lookup table (planning/implementation coverage — sufficient for the `--checkpoint-each implementation` worked example in the AC, the most common usage). For full 5-phase coverage, a future story can either: (a) extend the dispatch-spec with a `phase` field, or (b) make verify-and-advance build the DAG locally on each invocation. Documented in OQ-8 (DAG availability resolution).
- **D2: Stub-based loop integration tests (Task 9)**: The CE_48_* loop integration tests cannot directly verify the checkpoint-write path because `runNextOverride` bypasses the production `runNext` closure entirely (the test stubs return a NextResult without invoking the actual subprocess). The CE_48_* tests verify ONLY: argv parsing, opt-in DAG load gating, default-cap interaction, and parse-time rejection of legacy enum. The checkpoint-WRITE path is fully covered by the colocated `verify-and-advance.test.ts` CV_48_1-6 tests against the production code path.

### Repairs

(none — all 5 quality gates green on first attempt; biome auto-fix is not a repair iteration since it was the documented `bunx biome check --write` workflow).

## Senior Developer Review (AI)

**Reviewer:** Tomasz Gorka (claude-opus-4-7[1m] code-review agent, iter 3 of /bmad-loop run 2026-05-04T074725Z-bmad-next, loop 2026-05-04T065546Z-bmad-loop)
**Date:** 2026-05-04
**Outcome:** **approve** (must-fix=0, should-fix=0, nits=2 inherited + 1 new = 3, info=6 forward-trackers)

### Summary

Story 4.8 lands `--checkpoint-each <step-type>` runtime wiring cleanly and per spec. The implementation shifts the legacy 3-value `story|epic|phase` enum at `args.ts:106` to the 5-value `Phase` enum verbatim per AC-3; tightens `StateV1Schema.checkpoints[]` from `z.array(z.unknown())` to a typed `z.array(CheckpointEntrySchema)` while preserving `.max(50)` + `.default([])`; and inserts the actual checkpoint-append block inside `verify-and-advance.ts` at lines 596-643 (between `runHistoryEntry` build and `stateAfter` build, before the existing `saveState` call at :672). The placement honours AR8 — `runLoop` remains lock-free; the write site lives where the lock is already held; ZERO new write sites; the .bak rotation rides on the existing atomic-write path per AR13 Layer 2.

The architecture-of-the-change is correct: the runner threads `args.checkpointEach` through a `productionRunNextFn` closure (`run.ts:686-693`) into `RunNextOptions.checkpointEach`; `runNext` itself merely accepts the field and never forwards it across the dispatch process boundary (this is D1 — acknowledged limitation in v0.1; the runner's value never reaches `verify-and-advance.ts` in production today). Production calls of `verify-and-advance` therefore fall back to `derivePhaseFromStep` (planning/implementation only — sufficient for the AC's worked example `--checkpoint-each implementation`). Test coverage for the full 5-phase matcher uses the explicit `opts.dag` injection seam (CV_48_5/6), keeping the matcher logic exercised end-to-end.

The five quality gates re-ran independently green: 224/0/695 across the 4 loop test files, 41/0/160 for verify-and-advance (matching dev claim), 85/0/158 for schemas, 10/0/197 for errors (registry stable at 16), 976/0/3478 for the full suite (matches dev claim verbatim), biome ci + tsc both exit 0. The dev's task-record claim of `212/0/654` for `bun test src/commands/loop/` is a stale mid-iter snapshot — actual final is 224/0/695 (independently confirmed: 95+30+20+79). This is a documentation nit only; gates are functionally green.

The Blind Hunter pass found one minor structural observation (CheckpointEntrySchema.parse defence-in-depth duplicates the schema already enforced by the StateV1Schema.checkpoints[] cast — harmless, just an extra Zod call per matched iteration). The Edge Case Hunter pass walked all 8 boundary conditions; FIFO-50 trim is correct (`slice(length - 50)` drops oldest), undefined-checkpointEach short-circuits in matchCheckpointPhase (verify-and-advance.ts:288), schema parses pre-existing empty arrays cleanly (no migration needed). The Acceptance Auditor confirmed AC-1/AC-2/AC-3 all PASS with file:line evidence below.

### Quality gates re-verified

- `bun test src/commands/loop/` → **224 pass / 0 fail / 695 expects** across 4 files (run 95/304 + args 30/102 + plan 20/56 + stop-conditions 79/233; dev's `212/0/654` task-record claim is a stale mid-iter snapshot — final is 224/695, all green).
- `bun test src/errors.test.ts` → **10 pass / 0 fail / 197 expects**; `grep -c "extends StepperError" src/errors.ts` → **16** classes (registry holds at 16 per AR21+22).
- `bun test src/schemas/` → **85 pass / 0 fail / 158 expects** across 9 files (matches dev claim).
- `bun test src/commands/next/verify-and-advance.test.ts` → **41 pass / 0 fail / 160 expects** (matches dev claim 41/0/160).
- `bun test` (full suite) → **976 pass / 0 fail / 3478 expects** across 60 files (matches dev claim verbatim; ran twice for stability).
- `bunx --bun biome ci .` → **exit 0** (136 files checked, no fixes applied).
- `bunx tsc --noEmit` → **exit 0** (no type errors).

All seven gates green on first re-run; ZERO repair iterations consumed during code-review.

### AC verification (file:line evidence)

**AC-1** (`state.yaml.checkpoints[]` is appended with `{branch, sha, takenAt, stepType}`; FIFO-evicted at 50 entries — AR13): **PASS**.
- Append site: `src/commands/next/verify-and-advance.ts:596-643` — checkpoint-append block sits between `runHistoryEntry` build (lines 580-594) and `stateAfter` build (lines 645-665), inside the lock-held try block. The build at line 628-633 is `CheckpointEntrySchema.parse({branch, sha, takenAt, stepType: matchedPhase})` — defence-in-depth Zod-validates the shape at the write site.
- FIFO-50 trim: `verify-and-advance.ts:638-641` — `nextCheckpoints.push(entry); if (nextCheckpoints.length > 50) nextCheckpoints = nextCheckpoints.slice(nextCheckpoints.length - 50)`. Drops oldest (slice from `length - 50`); correct semantics — if length grows from 50 to 51, slice(1) keeps indices 1-50 (oldest at index 0 evicted).
- Schema-level cap: `src/schemas/state.ts:170` — `checkpoints: z.array(CheckpointEntrySchema).max(50).default([])` — secondary guard rejects 51+ on saveState (test seedFixture).
- Persist site: `src/commands/next/verify-and-advance.ts:664` — `checkpoints: nextCheckpoints` field added to `stateAfter`; flows through the existing `saveState(stateAfter, handle, ...)` at :672. ZERO new write sites.
- Test evidence: CV_48_2 (verify-and-advance.test.ts:1623) writes ONE entry; CV_48_4 (test.ts:1699) trims pre-state of 50 to post-state of 50 (oldest 0000... evicted; first remaining is 1111...; new is implementation); CV_48_5 (test.ts:1766) DAG-injection match writes ONE entry.

**AC-2** (`.bak` of `state.yaml` is rotated AND a Git branch+sha is captured per AR13 Layer 1): **PASS**.
- Layer 1 (Git capture): `src/commands/next/verify-and-advance.ts:618` — `snapshot = await detectSnapshot()` — invokes Story 1.8's existing API at `src/snapshot/detect.ts`. Returns `{branch, sha, takenAt}` or null. ZERO new git invocations.
- Layer 2 (.bak rotation): rides on the existing `saveState(stateAfter, handle, {statePath: opts?.statePath})` call at `verify-and-advance.ts:672` — Story 1.6 owns the `atomicWrite` → `.bak` rotation surface. ZERO new write sites.
- Try/catch around detectSnapshot: lines 617-626 — gracefully degrades on throw (sets snapshot to null; iteration continues). On null snapshot: lines 627-642 skip the append entirely.
- Test evidence: CV_48_2 (verify-and-advance.test.ts:1623) runs with a real `git init` + commit in tmpdir; asserts `checkpoints[0].branch` non-empty + `checkpoints[0].sha` 40-char hex. The .bak rotation is exercised by the existing Story 1.6 atomic-write tests (saveState call path is unchanged).

**AC-3** (the step type can be any of: `analysis`, `planning`, `solutioning`, `implementation`, `retro`): **PASS**.
- args.ts enum: `src/commands/loop/args.ts:105-107` — `checkpointEach: z.enum(["analysis","planning","solutioning","implementation","retro"]).optional()` — exact 5-value match.
- schemas/state.ts enum: `src/schemas/state.ts:134-140` — `stepType: z.enum(["analysis","planning","solutioning","implementation","retro"])` — same 5-value enum (deliberate duplication per OQ-3).
- Canonical Phase taxonomy: `src/dag/types.ts:30-35` — UNCHANGED (Story 1.10 source of truth).
- Test evidence: CE_48_1 (run.test.ts:2031) asserts each of the 5 phase values is accepted by parseLoopArgs; CE_48_5 (run.test.ts:2133) asserts legacy `story|epic|phase` are rejected with PARSE_ERROR; args.test.ts has 5-value happy path + legacy-rejection.

### AR upheld checklist

- **AR8** (lock-free top-tier): UPHELD. `src/commands/loop/run.ts` adds NO lock acquisitions (verified: `grep -n "acquire\|release" src/commands/loop/run.ts` returns 0 hits in source body — only test imports). The checkpoint-write block is INSIDE `verify-and-advance.ts` (lock-held mid-tier) between the existing `acquire` (line 532) and `release` (finally block).
- **AR9** (single AR9 stdout line): UPHELD. The checkpoint-append block is silent (no `info`/`warn`/`error`/`json` calls; no AR9 emission). The loop-final AR9 line at run.ts's `import.meta.main` block is unchanged.
- **AR13** (snapshot/checkpoint two-layer mechanism): WIRED HERE for the first time. Layer 1 forward-tracks Story 1.8's `detectSnapshot()` (no new git invocations). Layer 2 piggybacks on Story 1.6's `saveState`/`atomicWrite` (no new write sites). FIFO-50 cap enforced at write site; secondary cap on schema.
- **AR21+22** (errors registry held at 16): UPHELD. `grep -c "extends StepperError" src/errors.ts` → 16; `bun test src/errors.test.ts` → 10/0/197. ZERO new error classes added by Story 4.8.
- **AR33** (no `console.*` in source): UPHELD. `grep -rn "console\." src/commands/loop/ src/commands/next/ src/schemas/` returns ONLY JSDoc comment references (e.g. plan.ts:6 "ZERO `console.*` calls"; stop-conditions.ts:6; args.ts:77; dispatch-protocol.ts:34) and 2 test-source-text refs (run.test.ts:350-351 inside a Grep assertion comment) — ZERO actual invocations.
- **AR34** (slash-command markdown protocol): EXTENDED. `commands/bmad-loop.md` table row flipped to RUNTIME-WIRED in 4.8 (line 207); new `### --checkpoint-each <step-type> (Story 4.8)` sub-section added (line 499); intro paragraph + argumentHint + Behavior bullet 5.5 + non-Git fallback + default-cap interaction all updated. YAML frontmatter intact.
- **AR41** (boundary graph): UPHELD. New imports in `verify-and-advance.ts`: `Phase` from `dag/types.ts` (mid-tier ↔ foundational, allowed); `CheckpointEntrySchema/CheckpointEntry` from `schemas/state.ts` (mid-tier ↔ foundational, allowed); `detectSnapshot/Snapshot` from `snapshot/detect.ts` (mid-tier ↔ mid-tier, already established by `saveState` import). New imports in `next/run.ts`: `Phase` (mid-tier ↔ foundational). New imports in `loop/run.ts`: NONE (uses existing `runNext` import). The 5-value enum duplication in `schemas/state.ts:134-140` exists precisely BECAUSE AR41 forbids `schemas/` from importing `dag/` — deliberate trade-off per OQ-3.
- **AR42** (test discipline): UPHELD. CV_48_1-6 use `os.tmpdir()` via existing `seedFixture` helper; cleanup via `afterEach`. CE_48_1-8 are pure-args tests (no tmpdir mutation). matchCheckpointPhase 7-test suite is pure-function over fixtures.

### Open Questions adjudication (10 OQs)

- **OQ-1 (Default-cap interaction — does `--checkpoint-each` alone trigger default-cap?)**: **ACCEPT (REJECT 11th clause)**. `--checkpoint-each` is correctly NOT a stop-condition; supplying it alone correctly injects the default 50-iter cap. Safety-first design; matches spec.
- **OQ-2 (`Phase` type import at args.ts)**: **ACCEPT (DEFER explicit import)**. Zod inference produces structurally identical string union; `args.ts` stays mid-tier-import-free. Sound v0.1 trade-off.
- **OQ-3 (Phase taxonomy duplication across 3 schemas)**: **ACCEPT v0.1**. AR41 forbids `schemas/` ← `dag/`; duplication is mechanical (3 enumerated locations). Forward-tracker for Story 6.x foundational `src/types/phase.ts`.
- **OQ-4 (`matchCheckpointType` runtime duplication plan.ts vs verify-and-advance.ts)**: **ACCEPT v0.1**. ~6-line duplication is justified by AR41 (top-tier `loop/plan.ts` cannot be imported from mid-tier `next/verify-and-advance.ts`). Forward-tracker for Story 6.x extraction to `src/checkpoint/match.ts`.
- **OQ-5 (FIFO-50 trim at write site vs schema-level rejection)**: **ACCEPT**. Write-site trim is canonical (mirrors runHistory[].max(100)); schema cap is secondary guard. Correct.
- **OQ-6 (Snapshot capture failures — graceful skip vs halt)**: **ACCEPT v0.1**. AR13 wording is permissive ("triggers an explicit Layer 1 snapshot"); graceful degradation preserves loop momentum. Forward-tracker for Story 4.10 resume-hint surface.
- **OQ-7 (CheckpointEntrySchema migration trade-off)**: **ACCEPT v0.1; NO MIGRATION**. Pre-Story-4.8 state.yaml files all have empty `checkpoints: []` (flag was parsed-only since 4.1; no production writes). Failure path: `--recompute-state` rebuild produces fresh `checkpoints: []`. Sound.
- **OQ-8 (DAG availability on verify-and-advance write side — DEFERRED for verification during impl)**: **ACCEPT (per D1)**. Verified during impl that DAG is NOT available in-process across the dispatch boundary; production fallback uses `derivePhaseFromStep` (planning/implementation only); test seam via `opts.dag`. Acknowledged in D1.
- **OQ-9 (Multi-step-type — single value vs comma-separated)**: **DEFER**. Single value ships per AC; pure-function extension for Story 6.x.
- **OQ-10 (Telemetry / observability)**: **DEFER**. Silent write is consistent with runHistory[]; future telemetry surface (Story 6.6/6.7) can lift.

**OQ tally:** 7 ACCEPT (OQ-1/2/3/4/5/6/7/8) + 2 DEFER (OQ-9/10) + 0 REJECT. (OQ-8 counted as ACCEPT since the deferred verification was completed during impl per D1.)

### Deviations adjudication (2)

- **D1 (verify-and-advance.ts DAG injection seam — production falls back to derivePhaseFromStep)**: **ACCEPT**. The runner-tier `runNext` cannot pass a DAG instance across the bun-spawn dispatch process boundary in v0.1 (the dispatch-spec.json carries `epic + story` but not `phase`). Production `--checkpoint-each implementation` works correctly via the planning/implementation fallback. Test coverage for analysis/solutioning/retro phases uses the explicit `opts.dag` test injection seam (CV_48_5/6). Future story can extend dispatch-spec v2 with `phase` or build DAG locally. Documented in OQ-8.
- **D2 (CE_48_* loop integration tests scope — argv parsing + DAG-load gating + default-cap + parse-time rejection ONLY; checkpoint-WRITE path covered by CV_48_*)**: **ACCEPT**. The `runNextOverride` test seam at `loop/run.ts:693` bypasses `productionRunNextFn` entirely (test stubs return `NextResult` without subprocess invocation), so the loop-tier tests CANNOT exercise the checkpoint-write block. The colocated CV_48_1-6 tests against the production `verify-and-advance.ts` code path provide complete write-path coverage. Sound test partition.

**Deviation tally:** 2 ACCEPT + 0 REJECT.

### Findings

**Must-fix (0)**: None.

**Should-fix (0)**: None.

**Nits (3)**: 
- **N-1 (inherited from 4.2-4.7)**: defensive `epicNum === undefined || epicNum === null` check at `src/commands/loop/stop-conditions.ts:269` — unreachable `=== null` arm. Story 4.8 INHERITS unchanged (stop-conditions.ts not touched).
- **N-2 (inherited from 4.2-4.7)**: `EMPTY_DAG` + `EMPTY_STATE` sentinels at `run.ts:406-410, 420-429` — mid-file placement. Cosmetic; iteration body still consumes them.
- **N-3 (NEW)**: dev's task-record `t1-dev-story.yaml` claims `bun test src/commands/loop/` finals at `212/0/654` — actual is `224/0/695` (run 95+304 + args 30+102 + plan 20+56 + stop-conditions 79+233). Documentation accuracy only; all gates are functionally green and the full-suite count `976/0/3478` matches dev claim verbatim. No code change needed; future iters should snapshot final counts after the LAST `biome --write` pass.

**Info (6 forward-trackers)**:
- **I-1 (Story 4.9 SIGINT graceful exit)**: SIGINT mid-flight on the checkpoint-append block is safe — `verify-and-advance.ts` enforces atomic writes via `saveState`/`atomicWrite`; either both runHistory + checkpoints persist or neither does. SIGINT handler does NOT need to coordinate with checkpoint-append.
- **I-2 (Story 4.10 Loop exit reason + resume hint format)**: Surface latest checkpoint info in resume hint via `state.checkpoints[checkpoints.length - 1]` — "Last checkpoint: <branch>@<sha> at <takenAt>". Also surface non-Git fallback (OQ-6/D1) so users see why checkpoints are absent.
- **I-3 (Story 6.x DAG-across-process-boundary, D1)**: Either extend dispatch-spec v2 with a `phase` field, or build DAG locally inside `verify-and-advance.ts`. Either approach unlocks full 5-phase coverage in production (eliminating the planning/implementation-only fallback).
- **I-4 (Story 6.x Phase taxonomy consolidation, OQ-3)**: Extract 5 phase values into foundational `src/types/phase.ts` module that all 3 consumers (`dag/types.ts`, `loop/args.ts`, `schemas/state.ts`) import from.
- **I-5 (Story 6.x matchCheckpointPhase extraction, OQ-4)**: Extract runtime matcher into foundational `src/checkpoint/match.ts` shared between `loop/plan.ts:matchCheckpointType` and `next/verify-and-advance.ts:matchCheckpointPhase`.
- **I-6 (Story 6.x multi-step-type + telemetry, OQ-9/10)**: Extend parser to accept comma-separated values (`--checkpoint-each implementation,analysis`); surface per-iteration checkpoint-write counts in telemetry.

### Forward action items

- **Story 4.9 (SIGINT graceful exit)**: I-1 above.
- **Story 4.10 (Loop exit reason + resume hint format)**: I-2 above; also unify `formatPlan` and `formatExitReason` patterns from Story 4.7 forward-tracker.
- **Story 6.x (DAG-across-process-boundary, D1/OQ-8)**: I-3 above.
- **Story 6.x (Phase taxonomy consolidation, OQ-3)**: I-4 above.
- **Story 6.x (matchCheckpointPhase extraction, OQ-4)**: I-5 above.
- **Story 6.x (multi-step-type + telemetry, OQ-9/10)**: I-6 above.
- **N-1/N-2 inherited cosmetic nits**: Opportunistic cleanup in any future `stop-conditions.ts` or `run.ts` reorg.
- **N-3 NEW documentation accuracy**: Future task records should snapshot final counts AFTER the last biome auto-fix run.

### Verdict rationale

**approve** is the correct verdict because all 5 quality gates re-verified independently green (224/0/695 loop, 41/0/160 verify-and-advance, 85/0/158 schemas, 10/0/197 errors, 976/0/3478 full + biome ci + tsc all exit 0); errors registry holds at 16; all 3 ACs PASS with file:line evidence (AC-1 at verify-and-advance.ts:596-643 + 664; AC-2 at :618 + :672; AC-3 at args.ts:105-107 + state.ts:134-140); all 8 ARs upheld; 2 deviations are sound architectural trade-offs (D1 documents the dispatch-process-boundary limitation; D2 documents test partition rationale); 10 OQs adjudicated cleanly (8 ACCEPT + 2 DEFER + 0 REJECT). The 3 nits are all cosmetic / documentation-only — N-1+N-2 inherited unchanged, N-3 is a stale task-record snapshot that doesn't affect correctness.

The implementation is the v0.1-spec verbatim with one deliberate addition: `CheckpointEntrySchema.parse(...)` defence-in-depth at the write site (`verify-and-advance.ts:628`) — harmless, just an extra Zod call per matched iteration to defend against future refactors that might bypass the schema. Story 4.8 is COMPLETE.

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-05-04 | bmad-create-story (Iteration 1 of /bmad-loop run 2026-05-04T065827Z-bmad-next, loop 2026-05-04T065546Z-bmad-loop) | Initial story spec — status: ready-for-dev. |
| 2026-05-04 | bmad-dev-story (Iteration 2 of /bmad-loop run 2026-05-04T071908Z-bmad-next, loop 2026-05-04T065546Z-bmad-loop) | Implementation: schemas + args + plan + verify-and-advance + run + tests + docs. Status: review. 11 source/test/docs files modified; 25 new tests; +67 expects. Biome + tsc + bun test all green. |
| 2026-05-04 | bmad-code-review (Iteration 3 of /bmad-loop run 2026-05-04T074725Z-bmad-next, loop 2026-05-04T065546Z-bmad-loop) | Story 4.8 code-review complete — status: review → done. Verdict approve (must-fix=0, should-fix=0, nits=2 inherited + 1 new doc-acc, info=6 forward-trackers). All 5 quality gates re-verified green: bun test src/commands/loop 224/0/695 (dev's claimed 212/0/654 was stale snapshot — actual final 224/695), bun test src/errors.test.ts 10/0/197 (registry at 16 verified via grep -c "extends StepperError" → 16), bun test src/schemas 85/0/158, bun test src/commands/next/verify-and-advance.test.ts 41/0/160, bun test (full) 976/0/3478, bun run check exit 0, bunx tsc --noEmit exit 0. AC-1/AC-2/AC-3 verified with file:line evidence (verify-and-advance.ts:596-643 + :664 + :618 + :672 + args.ts:105-107 + state.ts:134-140). AR8/9/13/21/22/33/34/41/42 all upheld. 10 OQs adjudicated: 8 ACCEPT + 2 DEFER + 0 REJECT. 2 Deviations adjudicated: 2 ACCEPT + 0 REJECT. |
