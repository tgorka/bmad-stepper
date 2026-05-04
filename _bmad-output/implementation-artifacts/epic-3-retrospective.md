---
status: done
artifact_type: retrospective
epic: '3'
epic_title: Resume, Inspection & State Export
created: '2026-05-01'
last_updated: '2026-05-01'
storiesCompleted: 10
storiesRange: '3.1 through 3.10'
loopId: 2026-05-01T165239Z-bmad-loop
runId: 2026-05-01T235750Z-bmad-next
loopIteration: 25
persona: bmad-retrospective
---

# Epic 3 Retrospective: Resume, Inspection & State Export

## Summary

Epic 3 ships the entire transparency surface that makes Stepper trustable: every CLI flag promised by the PRD's "Resume, Inspection & State Export" theme is now wired end-to-end, replacing the v0.1 deferred-stubs Story 2.4 left behind. After Epic 2 closed the dispatch-then-verify loop and the canonical `/bmad-next` slash command, Epic 3 lands the canonical halt-recording mutation pair (Story 3.1: `state.lastAttempted` write-on-dispatch + `state.lastFailureReason` write-on-halt — the FIRST Epic 3 deliverable consumed by every other story), the recoverable `/bmad-next --resume` re-dispatch path with cached failure context (Story 3.2 — first consumer of 3.1's writes), the side-effect-free `/bmad-next --dry-run` preview (Story 3.3 — triple-signal SHA-256 + mtime + size byte-identity assertion), the manual-targeting `/bmad-next --step <id> + --epic/--story/--phase` scope flags with ignore-warning composition (Story 3.4 — closes Story 2.4 Info-2), the persona-override + optional-toggle pair `--persona` / `--include-optional` / `--no-optional` (Story 3.5 — pure JSDoc-tightening contract-validation story; AC-line-805 `failurePolicies` deferred to Story 6.x), the multi-line `--explain` reasoning trace with new `resolvePersonaWithTier` 5-tier label sibling helper (Story 3.6 — replaces the Story 2.4 placeholder; introduces 8 helpers; the FIRST Epic 3 mid-tier extension), the canonical `<step-name> — <phase> — preconditions: [<met>/<unmet>] — optional: <yes/no>` enumeration via `--list` with NFR-Sc1 100k-node perf test (Story 3.7 — passes 800ms budget for 100 epics × 1000 stories), the dual `--diff-state` + `--export-state` helpers with NEW `src/state/diff.ts`, `src/state/export.ts`, `src/schemas/state-export.ts`, `src/version.ts`, and `recomputeStateUnlocked` sibling export (Story 3.8 — establishes the FIRST FR54 SPECIAL CASE precedent for `--export-state` raw-JSON-to-stdout AND the AR9 + FR54 reconciliation pattern), the live transcript-tail `--watch` with Bun-streams polling + AbortController-bridged SIGINT cleanup (Story 3.9 — establishes the SECOND FR54 SPECIAL CASE precedent for raw streaming; NEW `src/runs/watch.ts` mid-tier module), and the formal `skipAcquire: boolean` lock-free contract surface on `src/lock/lock.ts` (Story 3.10 — closes Epic 3 with explicit forward-proofing + 5-flag concurrent-active+read-only integration test). The errors registry held at **16 codes throughout** the entire epic. Test growth: 526 (epic-2 close) → **727 pass / 0 fail / 2737 expect() / 56 files** (+201 tests / +856 expects / +9 files).

## Sprint Metrics

| Metric                                      | Value                                                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Stories completed                           | 10 (3.1 → 3.10) — all `done`                                                                                |
| Test-suite growth (epic start → end)        | 526 (epic-2 baseline) → **727 pass / 0 fail / 2737 expect() / 56 files**                                     |
| Per-story baseline progression              | 526 → 563 (3.1) → 577 (3.2) → 589 (3.3) → 608 (3.4) → 625 (3.5) → 648 (3.6) → 662 (3.7) → 693 (3.8) → 711 (3.9) → 727 (3.10) |
| Net Epic 3 test growth                      | **+201 tests / +856 expects / +9 files** vs. epic-2 final (526 / 1881 / 47)                                  |
| New mid-tier modules                        | 1 (`src/runs/watch.ts` — Story 3.9 NEW; AR41 sibling-independent)                                           |
| New mid-tier sibling files                  | 4 (`src/state/diff.ts` + `src/state/export.ts` — Story 3.8; `src/state/recompute.ts +recomputeStateUnlocked` sibling export — additive)                                          |
| New foundational modules                    | 2 (`src/schemas/state-export.ts` — Story 3.8 with `StateExportV1Schema` + type-alias chain per AR20; `src/version.ts` — Story 3.8 with `STEPPER_VERSION = "0.1.0"` constant) |
| New integration tests                       | 4 (`src/integration/dry-run-no-writes.test.ts` — Story 3.3; `src/integration/export-state-no-lock.test.ts` — Story 3.8; `src/integration/watch-fresh-project.test.ts` — Story 3.9; `src/integration/non-locking-read-flags.test.ts` — Story 3.10) — joins Story 2.8's NFR-S2 enforcement smoke + Story 3.1's `halt-records-state.test.ts` |
| New colocated test files                    | 4 (`src/state/diff.test.ts`, `src/state/export.test.ts`, `src/schemas/state-export.test.ts`, `src/runs/watch.test.ts`) |
| Errors registry stability                   | **16 codes throughout** — held stable since Story 1.5; ZERO new error class registrations across all 10 Epic 3 stories. Story 3.1 wired the FIRST canonical halt-recording mutation; Stories 3.2-3.10 introduced ZERO new throws (all pre-existing `ConfigError`, `LockContentionError`, etc. reused) |
| FR54 SPECIAL CASES introduced               | **2** (Story 3.8 `--export-state` raw-JSON-to-stdout per architecture §line 524 + §line 862; Story 3.9 `--watch` raw-streaming-to-stdout). Both bypass AR9 wrapper at `import.meta.main`; `runNext` return shape preserved as `report` for testability. Every OTHER read-only flag (`--diff-state`, `--explain`, `--list`, `--dry-run`) preserves AR9 strictly |
| Repair iterations total                     | **0** across 10 stories (zero re-dispatches; every story landed in dev → review → done in one pass)         |
| Code-review outcomes                        | **9 APPROVE** (3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10) + **1 APPROVE-WITH-FOLLOWUP** (3.1) — 0 changes-requested |
| Loop iterations consumed (Epic 3)           | **25 iterations** in `/bmad-loop` (loopId `2026-05-01T165239Z-bmad-loop`); iters 1-24 covered Stories 3.1-3.10 + interstitial create-story / dev-story / code-review tasks; iter 25 is this retrospective |
| Wall-clock                                  | ~7 hours (16:52 UTC start → 23:55 UTC end on 2026-05-01)                                                    |
| `bun run check` release-blocker gate        | Exit 0 every story; final 727 pass / 0 fail / 2737 expect() / 56 files                                       |
| Documented dev deviations                   | ~30 across 10 stories (all `accept` or `accept-with-followup` at code-review; ZERO blocked promotion)        |

## Stories Completed

| #    | Story                                                | FR / NFR / AR Coverage                                                       | New Source Files / Modifications                                                                            | Test Δ                                  | Review                       | Repairs |
| ---- | ---------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------- | ---------------------------- | ------- |
| 3.1  | Record `last_attempted` / `last_failure_reason` on Halt | FR1, FR5, FR27, FR32, FR33, FR43, FR44, FR53, FR54; NFR-R1, NFR-R4, NFR-S2, NFR-S5, NFR-M3; AR8, AR9, AR11, AR12, AR21, AR22, AR25, AR26, AR33, AR41 | 4 modified (`src/commands/next/run.ts`, `verify-and-advance.ts`, `args.ts`, `src/schemas/dispatch-protocol.ts`) + `src/schemas/state.ts` (`LastAttemptedSchema` + `LastFailureReasonSchema` extracted) + `src/integration/halt-records-state.test.ts` (NEW; 5-code matrix) | +37 tests / +183 expects / +1 file       | approve-with-followup (0/0/0/3) | 0       |
| 3.2  | `--resume` Flag                                       | FR1, FR5, FR16, FR18, FR27, FR32, FR33, FR53, FR54; NFR-R1, NFR-R2, NFR-S2, NFR-S5, NFR-M3; AR8, AR9, AR11, AR21, AR22, AR33, AR41 | `src/commands/next/run.ts` modified (`resolveResumeTarget` helper at lines 608-682; `NON_RECOVERABLE_FAILURE_CODES` literal); 14 new tests; FIRST consumer of 3.1's `state.lastAttempted` + `state.lastFailureReason` reads | +14 tests / +54 expects / 0 new files    | approve (0/0/0/0)            | 0       |
| 3.3  | `--dry-run` Flag                                      | FR1, FR8, FR9, FR18, FR52, FR53, FR54; NFR-P1, NFR-S2, NFR-S5, NFR-M3, NFR-R4; AR8, AR9, AR21, AR22, AR33, AR41 | `src/commands/next/run.ts` modified (in-memory dispatch-spec preview at lines 985-1000; `cleanStagingOrphans` gated on `!args.dryRun` at line 769) + `src/integration/dry-run-no-writes.test.ts` (NEW; triple-signal SHA-256 + mtime + size assertion) | +12 tests / +54 expects / +1 file        | approve (0/0/0/2)            | 0       |
| 3.4  | `--step <id>` and Scope Flags                         | FR1, FR8, FR10, FR11, FR53, FR54; NFR-S2, NFR-S5, NFR-M3, NFR-R4; AR8, AR9, AR21, AR22, AR33, AR41 | `src/commands/next/run.ts` modified (`isPreconditionMet` helper at lines 434-439; explicit `--step` precondition check; `--epic` / `--story` runner-tier projection from `state.lastAttempted ?? lastSuccessfulStep`; once-per-invocation scope-warn elision) + 21 new tests | +19 tests / +51 expects / 0 new files    | approve (0/0/0/2)            | 0       |
| 3.5  | `--persona` Override + `--include-optional`/`--no-optional` | FR8, FR12, FR15, FR53, FR54; NFR-S2, NFR-S5, NFR-M3, NFR-R1, NFR-I2; AR8, AR9, AR16, AR21, AR22, AR33, AR41 | `src/commands/next/run.ts` modified (4 JSDoc-tightening sites for `--persona` override + optional-toggle filter; ZERO behavioural change at insertion sites — pure contract-validation story) + 17 new tests | +17 tests / +58 expects / 0 new files    | approve (0/0/0/2)            | 0       |
| 3.6  | `--explain` Reasoning Trace                           | FR8, FR12, FR13, FR15, FR53, FR54; NFR-S2, NFR-S5, NFR-M3, NFR-R1, NFR-I2; AR8, AR9, AR21, AR22, AR33, AR41 | `src/commands/next/run.ts` modified (replaces Story 2.4 placeholder; 8 new helpers `buildPredecessorChain`, `unmetPrereqsForCandidate`, `computeAlternatives`, `formatAlternativesLines`, `isProjectAllDone`, `formatPersonaLine`, `formatReasoningSummary`, `formatExplainMessage`) + `src/personas/resolve.ts` modified (`resolvePersonaWithTier` sibling helper + 5 tier-label string constants — strictly additive, zero modification to `resolvePersona`); 23 new tests | +23 tests / +93 expects / 0 new files    | approve (0/0/0/2)            | 0       |
| 3.7  | `--list` Candidate Next Steps                         | FR8, FR14, FR52, FR53, FR54; NFR-P1, NFR-Sc1, NFR-S2, NFR-S5, NFR-R1, NFR-I2; AR8, AR9, AR21, AR22, AR33, AR41 | `src/commands/next/run.ts` modified (`formatCandidateLine(node, state)` helper at lines 1064-1073 — colocated with Story 3.6's `formatAlternativesLines` cluster; replaces Story 2.4 placeholder; `--phase` filter EXTENDED to `--list` per `pickNextStep` consistency); 14 new tests including NFR-Sc1 100k-node perf test (< 800ms safety margin) | +14 tests / +82 expects / 0 new files    | approve (0/0/0/2)            | 0       |
| 3.8  | `--diff-state` and `--export-state`                   | FR3, FR4, FR8, FR52, FR53, FR54; NFR-P1, NFR-P5, NFR-S2, NFR-S5, NFR-R1, NFR-R3, NFR-M3, NFR-I2; AR8, AR9, AR11, AR20, AR21, AR22, AR33, AR41, AR42 | NEW `src/state/diff.ts` (~180L, mid-tier) + NEW `src/state/export.ts` (~115L, mid-tier) + NEW `src/schemas/state-export.ts` (`StateExportV1Schema` + type-alias chain per AR20) + NEW `src/version.ts` (`STEPPER_VERSION = "0.1.0"`) + `src/state/recompute.ts` modified (additive `recomputeStateUnlocked` sibling export — ZERO new imports per AR41) + 24 colocated tests + 2 integration tests + 7 colocated runner tests; FR54 SPECIAL CASE for `--export-state` raw-JSON-to-stdout established | +31 tests / +118 expects / +6 files      | approve (0/0/0/2)            | 0       |
| 3.9  | `--watch` Live Transcript Tail                        | FR8, FR42, FR43, FR44, FR52, FR53, FR54; NFR-P1, NFR-P4, NFR-S2, NFR-S5, NFR-R1, NFR-R5, NFR-I2; AR2, AR8, AR9, AR11, AR21, AR22, AR25, AR26, AR33, AR41, AR42 | NEW `src/runs/watch.ts` (~441L, mid-tier; `findMostRecentRunLog` + `tailLineByLine` + `readSliceAsLines` + AbortController-bridged SIGINT cleanup; uses `Bun.file().slice().stream()` + `TextDecoderStream`; ZERO `node:child_process` / `node:tty` / external-binary deps) + `src/runs/index.ts` modified (barrel re-exports `watchMostRecentRunLog` + types) + 12 colocated unit tests + 2 integration tests + 5 colocated runner tests; FR54 SECOND SPECIAL CASE for `--watch` raw-streaming-to-stdout established (mirrors Story 3.8 precedent) | +18 tests / +70 expects / +2 files       | approve (0/0/0/2)            | 0       |
| 3.10 | Non-Locking Read Flags                                | FR3, FR4, FR8, FR9, FR52, FR53, FR54; NFR-P1, NFR-P5, NFR-S2, NFR-S5, NFR-R1, NFR-R4, NFR-M3, NFR-I2; AR8, AR9, AR11, AR21, AR22, AR33, AR41, AR42 | `src/lock/lock.ts` modified (`LockOptions.skipAcquire?: boolean` field + EARLY-EXIT branch in `acquire(...)` returning sentinel no-op `LockHandle` with `<no-op:skipAcquire>` marker strings + 3 JSDoc docblocks; ~52 lines added; ZERO new imports per AR41) + `src/integration/non-locking-read-flags.test.ts` (NEW; 5-flag concurrent-active+read-only integration test) + 16 new tests across `lock.test.ts` + `run.test.ts` + the new integration test | +16 tests / +93 expects / +1 file        | approve (0/0/0/2)            | 0       |

## Test Growth

```
Story 2.8 final (epic-2 close):    526 pass / 0 fail / 1881 expect() /  47 files
Story 3.1 (halt recording):        563 pass / 0 fail / 2064 expect() /  48 files  (+37 tests / +183 expects / +1 file)
Story 3.2 (--resume):              577 pass / 0 fail / 2118 expect() /  48 files  (+14 tests / +54 expects / 0 new files)
Story 3.3 (--dry-run):             589 pass / 0 fail / 2172 expect() /  49 files  (+12 tests / +54 expects / +1 file)
Story 3.4 (--step + scope):        608 pass / 0 fail / 2223 expect() /  49 files  (+19 tests / +51 expects / 0 new files)
Story 3.5 (--persona + opt):       625 pass / 0 fail / 2281 expect() /  49 files  (+17 tests / +58 expects / 0 new files)
Story 3.6 (--explain):             648 pass / 0 fail / 2374 expect() /  49 files  (+23 tests / +93 expects / 0 new files)
Story 3.7 (--list):                662 pass / 0 fail / 2456 expect() /  49 files  (+14 tests / +82 expects / 0 new files)
Story 3.8 (--diff/--export):       693 pass / 0 fail / 2574 expect() /  53 files  (+31 tests / +118 expects / +4 files)
Story 3.9 (--watch):               711 pass / 0 fail / 2644 expect() /  55 files  (+18 tests / +70 expects / +2 files)
Story 3.10 (skipAcquire):          727 pass / 0 fail / 2737 expect() /  56 files  (+16 tests / +93 expects / +1 file)

Net Epic 3 growth (since epic-2 close): +201 tests / +856 expects / +9 files.
```

Per-story patterns:
- Story 3.5 is a JSDoc-tightening contract-validation story (zero behavioural change at insertion sites; 17 new tests assert the contract); zero new src files.
- Stories 3.4/3.5/3.6/3.7 each modify only `src/commands/next/run.ts` (the runner-tier orchestrator) plus colocated `run.test.ts`; zero new mid-tier files. The runner is the canonical Layer 2 composer.
- Story 3.8 is the largest single-story src delta (+6 new files: 2 mid-tier helpers + 1 foundational schema + 1 version constant + 2 colocated tests). Establishes the FR54 SPECIAL CASE pattern and the AR20 type-alias-chain for new schema modules.
- Story 3.9 is the second-largest mid-tier delta (+2 files: `src/runs/watch.ts` + colocated test). The first NEW Epic 3 mid-tier MODULE (3.8 was sibling files within existing `src/state/` + `src/schemas/`).
- Story 3.10 is the SMALLEST delta of the epic (~430 lines net across 4 files; purely additive on `src/lock/lock.ts`); the structural lock-free invariant ALREADY held in v0.1 per AR8 + Story 2.4's contract; the `skipAcquire` flag is forward-proofing + AC verbatim compliance.

## Source Files Added

### Foundational tier (2 NEW files)
- `src/schemas/state-export.ts` (Story 3.8) — `StateExportV1Schema` + `StateExportV1` + `StateExport` (alias) + `StateExportLatestSchema` (alias) follows the AR20 type-alias-chain pattern from `src/schemas/state.ts`. v2 migration is a Story 6.x concern.
- `src/version.ts` (Story 3.8) — `STEPPER_VERSION = "0.1.0" as const` single-source-of-truth constant. Story 6.10 may auto-derive from `package.json` via build-time generator.

### Foundational tier extension (1 modified file)
- `src/lock/lock.ts` (Story 3.10) — `LockOptions.skipAcquire?: boolean` field + EARLY-EXIT branch in `acquire(...)` returning sentinel no-op `LockHandle` with `<no-op:skipAcquire>` marker strings; ~52 lines added; ZERO new imports.

### Mid-tier (3 NEW sibling files in existing modules; 1 NEW module)
- `src/state/diff.ts` (Story 3.8; ~180L) — `diffState({ statePath, projectRoot, bmadVersion, ... }): Promise<DiffReport>` composes `loadStateUnlocked + recomputeStateUnlocked + computeDivergences + formatHumanReadable`. v0.1 4-field comparator (`lastSuccessfulStep`, `project.name`, `project.bmadVersion`, `runHistory.length`).
- `src/state/export.ts` (Story 3.8; ~115L) — `exportState({ statePath, dagNodePhase, ... }): Promise<StateExportV1>` projects 7 named fields per AC-line-850 + defence-in-depth `StateExportV1Schema.parse(...)` before return.
- `src/state/recompute.ts` extended (Story 3.8) — additive `recomputeStateUnlocked` sibling export; re-uses internal helpers (`scanArtifacts`, `extractFrontmatter`, `readArtifactRecord`); skips `acquire(...)` AND `saveState(...)`. **Zero new imports** added — additive only.
- `src/runs/watch.ts` (Story 3.9; ~441L) — NEW mid-tier module; `watchMostRecentRunLog({ runsRoot?, pollMs?, signal? }): Promise<WatchResult>` composed of `findMostRecentRunLog` + `tailLineByLine` + `readSliceAsLines` + AbortController-bridged SIGINT cleanup. Uses `Bun.file().slice().stream()` + `TextDecoderStream` for line-by-line UTF-8 decode; LF-only line splitting (Story 2.5 writer convention); ZERO `node:child_process` / `node:tty` / external-binary dependencies.

### Top-tier extensions (1 modified file across 8 stories)
- `src/commands/next/run.ts` extensively modified across Stories 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10 — the canonical Layer 2 runner-tier composer. Net additions:
  - Story 3.1: AR9 `dispatch` emit shape extended to include optional `lastAttempted: { step, epic, story, attemptedAt }`.
  - Story 3.2: `resolveResumeTarget` helper at lines 608-682 + `NON_RECOVERABLE_FAILURE_CODES` literal at lines 153-156.
  - Story 3.3: `--dry-run` in-memory dispatch-spec preview at lines 985-1000 + `cleanStagingOrphans` gated on `!args.dryRun` at line 769.
  - Story 3.4: `isPreconditionMet` helper at lines 434-439 + explicit `--step` precondition check + `--epic` / `--story` runner-tier projection + once-per-invocation scope-warn elision.
  - Story 3.5: 4 JSDoc-tightening sites (`--persona` override branch + optional-toggle filter); ZERO behavioural change.
  - Story 3.6: 8 new explain helpers (`buildPredecessorChain`, `unmetPrereqsForCandidate`, `computeAlternatives`, `formatAlternativesLines`, `isProjectAllDone`, `formatPersonaLine`, `formatReasoningSummary`, `formatExplainMessage`) replacing Story 2.4 placeholder.
  - Story 3.7: `formatCandidateLine(node, state)` helper at lines 1064-1073 + `--phase` filter EXTENDED to `--list` candidate-collection loop; replaces Story 2.4 placeholder.
  - Story 3.8: `--diff-state` and `--export-state` runner short-circuits + `wasExportStateRequested(argv)` helper (FR54 SPECIAL CASE detect for raw-JSON-to-stdout bypass).
  - Story 3.9: `--watch` runner short-circuit at "Step 5b" between `--doctor` (Step 5) and `--export-state` (Step 6 first branch) + `wasWatchRequested(argv)` helper (FR54 SECOND SPECIAL CASE detect for raw-streaming-to-stdout bypass).
  - Story 3.10: ZERO new top-tier modifications — Story 3.10 is purely additive on `src/lock/lock.ts`; the structural lock-free invariant ALREADY held.
- `src/personas/resolve.ts` extended (Story 3.6) — additive `resolvePersonaWithTier` sibling helper at lines 645-718 + 5 tier-label string constants (TIER_LABEL_OVERRIDE through TIER_LABEL_MODULE_CONFIG). ZERO modification to `resolvePersona` (Story 1.11 deliverable); strictly additive.
- `src/runs/index.ts` extended (Story 3.9) — barrel re-exports `watchMostRecentRunLog` + types.

### Integration / smoke / fixtures
- `src/integration/halt-records-state.test.ts` (Story 3.1; 5-code matrix) — first integration test under `src/integration/` for Story 3.1; covers VERIFIER_FAILURE, BRANCH_SWITCH, BMAD_INCOMPATIBLE, TIMEOUT, BUDGET_EXCEEDED via subprocess-spawn driver mocking `runVerifier` to throw the named StepperError.
- `src/integration/dry-run-no-writes.test.ts` (Story 3.3) — triple-signal SHA-256 + mtime + size byte-identity assertion via subprocess spawn (256 lines).
- `src/integration/export-state-no-lock.test.ts` (Story 3.8) — `--export-state | jq '.currentPhase'` workflow asserted in-process via `JSON.parse(stdout.trim())` (Open Question 6 ACCEPT v0.1; portability over `jq` runtime dep).
- `src/integration/watch-fresh-project.test.ts` (Story 3.9) — `bun run src/commands/next/run.ts -- --watch` against an empty tmpdir; asserts byte-identical stdout match to AC-line-867 verbatim hint, exit 0, FR54 carve-out (stdout body fails `JSON.parse`), FR52 lock-free invariant via `fs.access(lockPath)` rejection.
- `src/integration/non-locking-read-flags.test.ts` (Story 3.10) — 5-flag concurrent-active+read-only integration test; spawns each read-only flag against a tmpdir holding a synthesised held lock; asserts exit 0, NO `LOCK_CONTENTION` substring in stderr, the synthesised lock dir + pid file preserved verbatim.

## Errors Registry Status

**16 codes throughout Epic 3** — held stable since Story 1.5.

ZERO new error class registrations across all 10 stories. Story 3.1 wired the FIRST canonical halt-recording mutation pair (`state.lastAttempted` write-on-dispatch + `state.lastFailureReason` write-on-halt) but introduced no new error class — the halt-path `lastFailureReason` is constructed from the EXISTING thrown `StepperError`'s `(code, message, actionableHint, runId)` projection. Stories 3.2-3.10 reused pre-existing `ConfigError`, `LockContentionError`, `BranchSwitchError`, `BmadIncompatibleError`, `VerifierFailureError`, `TimeoutError`, `BudgetExceededError`, `StateChangedDuringDispatchError` for all halt-path translations.

The `errors.test.ts` registry CI gate (10 tests / 197 expects) trivially passed at every story.

## Review Outcomes

| Outcome                          | Count | Stories                                                                  |
| -------------------------------- | ----- | ------------------------------------------------------------------------ |
| Clean **APPROVE** (0 findings)   | 1     | 3.2                                                                       |
| **APPROVE** (≥1 info, no nits)   | 8     | 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10                                  |
| **APPROVE-WITH-FOLLOWUP** (≥1)   | 1     | 3.1 (3 info; all carry-overs to Story 6.x or already-tracked)             |
| Changes-requested                | 0     | (none)                                                                   |

All 10 stories landed `review → done` on the first review pass. The single APPROVE-WITH-FOLLOWUP outcome (Story 3.1) carries 3 info-level findings: (1) TOCTOU mtime → structural assertion ratification; (2) subprocess spawn instead of `mock.module` due to Bun's process-global mock state (Story 6.x carry-over for native `mock.restore()`); (3) cosmetic `as string` TS assertions on `failureReason?.hint` (3 occurrences vs spec's "two" — minor count discrepancy, no impact). All three are acceptable v0.1-conservative posture. Stories 3.3-3.10 each earned APPROVE with 2 info-level findings (typically: forward-deferral notes for Story 6.x telemetry-driven schema enhancements + AR9 SPECIAL CASE documentation references).

## Repair Iterations

**Zero repair iterations across all 10 Epic 3 stories.** Every story progressed `bmad-create-story → bmad-dev-story → bmad-code-review → done` in a single dispatch sequence per story. The bmad-create-story → bmad-dev-story handoff produced reviewable artifacts on the first dev pass for every story, and bmad-code-review never required a re-dispatch.

This matches Epic 2's zero-repair record (vs. Epic 1's 2 repair iterations). Plausible drivers:
- Epic-2-retrospective Forward Action Items provided pre-work pointers for every Epic 3 story (lines 187-208).
- Epic-3 stories were progressively derivative: 3.2 consumes 3.1's deliverable; 3.6/3.7 share helpers; 3.8/3.9/3.10 establish the FR54 SPECIAL CASE pattern + skipAcquire pattern.
- The `src/runs/` directory rename (Story 2.5 dev-001) was already absorbed cleanly by Stories 3.8 / 3.9 / 3.10 without architecture-doc patching — substituted at story-spec drafting time per epic-2-retrospective recommendation §line 207.
- Composer-at-runner pattern internalized: 8 of 10 stories modify `src/commands/next/run.ts` exclusively (the canonical Layer 2 composer); mid-tier modules stayed pure; new schema + module additions (Stories 3.6, 3.8, 3.9) were strictly additive.

## Forward Action Items for Epic 4 / 5 / 6

Recommended carry-overs for the next epics. Order reflects dependency / risk surfacing.

### For Epic 4 (Bounded `/bmad-loop`)

| Story | Title                                                | Pre-work / Notes                                                                                                                                            |
| ----- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1   | `/bmad-loop` Command Skeleton                        | Epic 3 secondary-consumer surface area is now stable: loop runner may invoke `runNext` with `--explain` per iteration (Story 3.6); may invoke `--diff-state` per iteration to detect drift (Story 3.8); may invoke `--list` per iteration to surface candidate set (Story 3.7). Story 4.1 may add `--explain-each` / `--diff-each` / `--list-each` flags. |
| 4.5   | Stop condition `--time-budget` and `--token-budget` | Reads `state.lastFailureReason.code === BUDGET_EXCEEDED` as resume-hint (Story 3.1's deliverable). |
| 4.6   | Stop condition `--error` with `--stop-on-error`/`--continue-on-error` | Branches on `state.lastFailureReason.code` + uses Story 3.2's recoverable-codes allow-list (`NON_RECOVERABLE_FAILURE_CODES` at `run.ts:153-156`). |
| 4.7   | `--plan-first` Dry-Run Preview                       | Reuses Story 3.3's `--dry-run` runner branch + Story 3.6's `--explain` helpers. May extend `skipAcquire` flag's caller list (Story 3.10 carry-over). |
| 4.9   | SIGINT Graceful Exit                                  | NFR-R5 30s budget for in-flight sub-agent + state write. Story 3.9's watcher's sub-millisecond cleanup pattern is unrelated; the loop runner's NFR-R5 is its own surface. |
| 4.10  | Loop Exit Reason + Resume Hint                        | Reads `state.lastFailureReason.hint` (Story 3.1's deliverable) for the resume-hint surfaced on loop halt. |

### For Epic 5 (Failure-UX Modes)

| Story | Title                                                | Pre-work / Notes                                                                                                                                            |
| ----- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1   | Retry failure mode                                   | Reads `state.lastAttempted` (Story 3.1) + branches on `state.lastFailureReason.code`. May extend Story 3.2's `--resume` to support `--retry`. |
| 5.2   | `--skip` failure mode                                | AC line 754 deferral: Story 3.2 documented `--resume + --skip` cross-validation as deferred to Story 5.2. The flag is NOT in Story 1.7's 18-flag inventory; Story 5.2 lands both the flag AND the cross-validation. |
| 5.3   | Route-to-fixer mode (`--auto-fix`)                   | Branches on Story 3.1's `state.lastFailureReason.code` + reuses Story 3.2's recoverable-codes allow-list. |
| 5.4   | Escalate failure mode                                | Reads `state.lastFailureReason` for escalation context surfacing. |
| 5.6   | Per-step failure policy via config (actionable errors) | Closes Story 3.5's AC-line-805 `failurePolicies` runtime forward-deferral. The `failurePolicies` config block exists at architecture §line 780; Story 5.6 wires the runtime. |

### For Epic 6 (Configuration & Polish)

| Story | Title                                                | Pre-work / Notes                                                                                                                                            |
| ----- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6.1   | bmad-stepper.config.yaml schema loader              | Closes multiple Epic 3 carry-overs: (1) Story 3.5 default optional-toggle reconciliation with `.bmad-stepper/config.yaml execution.optionalSteps: include`; (2) Story 3.6 `execution.explainAlternativesCap` config knob; (3) Story 3.7 `execution.listPerfBudgetMs` + `messages.listEmptyHint` config knobs; (4) Story 3.9 `watch.pollMs` + `watch.selector` config knobs; (5) Story 3.10 `lock.skipAcquire` config knob (if validate-on-load needs lock semantics). |
| 6.x   | DispatchSpecV2 schema bump                           | Carry-over from Epic 2 + extended by Epic 3: (a) `phase` field (closes Story 2.2 dev-001 + 2.4 dev-003); (b) `stateHash` field (closes 2.4 dev-003 + 2.6 dev-001 Option A simplification); (c) v2 migration when `state.completedSteps[]` lands per multiple Epic 3 forward-trackers. |
| 6.x   | `state.completedSteps[]` schema extension            | PRIMARY ARCHITECTURAL EXTENSION surfaced by Epic 3. The richer `<met>/<unmet>` count via set-membership (Story 3.7 Info-1); the multi-element predecessor chain (Story 3.6 Info-2); the 4-field diff comparator extending to 7-10 fields (Story 3.8 Info-1); the multi-prerequisite synthesis-step precondition rule (Story 3.4 Info-1). The line formats stay the same; the COUNTER backends evolve. |
| 6.x   | Bun native `mock.restore()`                          | Story 3.1 dev-002: `halt-records-state.test.ts` uses subprocess-spawn isolation due to Bun's process-global `mock.module`. Native `mock.restore()` would let the test use in-process mocking; removes dev-002 entirely. Carry-over from Epic 2 (Story 2.6 dev-004). |
| 6.x   | AR22 verb ratification (`Pass` / `Add` / `Configure`) | Story 3.1 introduces 6 new `Pass` verbs in `args.ts:413-528`; aligned with Story 2.4 / 2.6 PARTIAL precedent. Carry-over from Epic 2; either extend `errors.test.ts` registry CI gate to validate `hintOverride` strings OR ratify the additional canonical verbs. |
| 6.x   | Architecture-doc refresh                             | Stale references identified: (1) `src/transcript/watch.ts` at architecture.md §line 1216 + §line 1372 (stories 2.5 + 3.9 use `src/runs/watch.ts`); (2) `src/io/lock.ts` at §line 1382 (Story 1.4 + 3.10 use `src/lock/lock.ts`); (3) `commands/bmad-next.md` Step 5 forwards `--last-attempted-json` (Story 3.1 carry-over from §lines 1443-1485 sequence diagram). Non-blocking. |
| 6.x   | DAG epic/story attribution                           | Story 3.4 + Story 3.7 forward-trackers: when DAG nodes gain `epic` / `story` attribution, the `--epic` / `--story` runner-tier projection becomes a true DAG-node-attribution filter; Story 3.7 `--list + --epic/--story` silent-bypass becomes a true filter. No test-shape change. |
| 6.8   | Auto-archival of runs and telemetry                  | Story 3.9 forward-tracker: 90-day archive rotation may move transcript files mid-watch; v0.1 watcher detects via ENOENT + exits gracefully (Test I + Open Question 6). Story 6.8 may extend with auto-follow-rotated-file semantics. |
| 6.10  | Marketplace release                                  | Story 3.8 forward-tracker: `STEPPER_VERSION` constant in `src/version.ts` is the single source of truth; Story 6.10 may auto-derive from `package.json` via build-time generator. |

**Recommended planning sequence for Epic 4:**
1. Front-load Story 4.1 (`/bmad-loop` command skeleton) — it composes Story 3.2's `--resume` recoverable-codes allow-list + Story 3.6's `--explain` helpers + Story 3.7's `--list` enumeration in a single iteration. Multi-Epic-3-deliverable consumer.
2. Sequence Story 4.6 (stop-condition `--error` with `--stop-on-error`/`--continue-on-error`) before Story 4.5 (time/token budgets) — the failure-code branching surface needs to land before the budget surface.
3. Allocate review iteration budget for Story 4.9 (SIGINT graceful exit) — first NFR-R5 enforcement at the loop runner; high-risk first integration with the in-flight sub-agent + state write race.

## Open Questions Carried Forward

Epic 3 stories enumerated **~70 open questions** across all 10 dev-stories; ALL adjudicated `accept` or `accept-with-followup` at code-review. None blocked promotion. Consolidated by destination story:

### To Epic 4 (4.x)

- **Q4.1** (Story 3.6): Loop runner may invoke `runNext --explain` per iteration; Story 4.1 may add `--explain-each` flag.
- **Q4.1** (Story 3.7): Loop runner may invoke `runNext --list` per iteration; Story 4.1 may add `--list-each` flag.
- **Q4.7** (Story 3.10): If `--plan-first` is added to read-only-flag enumeration in Epic 4, Story 4.7 may extend `skipAcquire` caller list.
- **Q4.9** (Story 3.9): NFR-R5 30s budget at loop runner; Story 3.9's watcher's sub-millisecond cleanup is structurally separate but precedent-relevant for AbortController bridge pattern.

### To Epic 5 (5.x)

- **Q5.2** (Story 3.2): `--resume + --skip` cross-validation deferred (the `--skip` flag is NOT yet in Story 1.7's 18-flag inventory).
- **Q5.x** (Story 3.1): Multi-element `lastFailureReason` history (current schema is single-most-recent only; stack-style history a Story 6.x telemetry-driven enhancement, but consumed by Story 5.x failure-UX modes).

### To Epic 6 (6.x)

- **Q6.1** (Story 3.5 Info-1): Default optional-toggle semantics divergence from `.bmad-stepper/config.yaml execution.optionalSteps: include` — runner does NOT consume project config in v0.1.
- **Q6.1** (Story 3.5 Info-2): `failurePolicies` runtime forward-deferred (architecture §line 780 declares the block; v0.1 runtime does NOT branch on it).
- **Q6.1** (Story 3.6 OQ-2): Alternatives list cap configurable via `bmad-stepper.config.yaml execution.explainAlternativesCap` (v0.1 hardcoded 5).
- **Q6.1** (Story 3.7 OQ-3, OQ-8): Empty-candidate-set hint configurable via `messages.listEmptyHint`; perf budget configurable via `execution.listPerfBudgetMs`.
- **Q6.1** (Story 3.9 OQ-4): Poll interval `watch.pollMs` (v0.1 hardcoded 250ms).
- **Q6.x** (Story 3.4 Info-1, 3.6 Info-2, 3.7 Info-1, 3.8 Info-1): `state.completedSteps[]` schema extension — multi-prerequisite precondition rule, multi-element predecessor chain, set-membership-based `<met>/<unmet>` count, richer diff comparator. The line formats stay the same; the COUNTER backends evolve.
- **Q6.x** (Story 3.4 Info-2, 3.7 OQ-2): Per-step DAG epic/story attribution; the `--epic` / `--story` filter becomes true DAG-node-attribution.
- **Q6.x** (Story 3.6 OQ-7): Reasoning sentence include phase reference (v0.1 omits — it's implicit in the step name + alternatives section).
- **Q6.x** (Story 3.8 Info-1): `runHistory.length` count-only diff is v0.1 conservative; element-level diff (per-entry step + attemptedAt) deferred to telemetry-driven schema enhancement.
- **Q6.x** (Story 3.8 OQ-7): Export include `runHistory` or `checkpoints` arrays (v0.1 minimum-viable per AC-line-850 7-field contract).
- **Q6.x** (Story 3.8 OQ-8): `bmadVersion: "unknown"` translated to `null` (v0.1 preserve verbatim per FR4 wording; CI scripts detect literal `"unknown"`).
- **Q6.x** (Story 3.9 OQ-3): Polling vs `node:fs/promises#watch` FS watcher (v0.1 polling for cross-platform determinism).
- **Q6.x** (Story 3.9 OQ-7): mtime + filename-descending tiebreaker for most-recent selection (v0.1 BOTH; FAT32 mtime resolution).
- **Q6.x** (Story 3.10 Info-1): `skipAcquire` flag is forward-proofing — v0.1 production code does NOT exercise it. Forward-coupling to Story 6.x lock-acquiring read flows.
- **Q6.10** (Story 3.8): `STEPPER_VERSION` auto-derive from `package.json` via build-time generator.

### Architecture-doc patches (forward-tracker)

- **Q6.x** (Story 3.9 dev-deviation-1): `src/transcript/watch.ts` references at architecture.md §line 1216 + §line 1372 — stale (Stories 2.5 + 3.9 use `src/runs/watch.ts`).
- **Q6.x** (Story 3.10 OQ-1): `src/io/lock.ts` references at architecture.md §line 1382 — stale (Stories 1.4 + 3.10 use `src/lock/lock.ts`).
- **Q6.x** (Story 3.1 carry-over): `commands/bmad-next.md` Step 5 forwards `--last-attempted-json '<payload>'` — not yet in architecture.md §lines 1443-1485 sequence diagram.

## Architectural Observations

Epic 3 surfaced four major architectural patterns worth codifying:

### 1. Story 2.4 placeholder pattern (consumed cleanly by Stories 3.6 + 3.7 + 3.8)

Story 2.4's `runNext` shipped v0.1 placeholder branches for every Epic 3 flag (`--explain`, `--list`, `--diff-state`, `--export-state`, `--watch`, `--dry-run`). Each placeholder emitted `action: "report"` with a deferral hint ("This flag will be wired in Story 3.x"). Stories 3.3-3.9 each REPLACED the corresponding placeholder with the canonical implementation. The pattern worked: every Epic 3 story landed a complete user-facing surface vs. the placeholder; the deferral hint format was preserved (no AR9 schema drift); the runner's overall control-flow shape (Bash → Step computation → flag short-circuits → fall-through to dispatch) was unchanged. **Recommendation**: Repeat the placeholder pattern for Epic 4's `/bmad-loop` and Epic 5's failure-UX modes — Story 4.1 should ship `--retry` / `--skip` / `--auto-fix` placeholders for Story 5.x consumers.

### 2. AR9 + FR54 SPECIAL CASE precedents (Stories 3.8 + 3.9)

Two flags ESCAPE the AR9 single-JSON-line discipline at the process boundary:
- **Story 3.8 `--export-state`**: emits raw JSON body to stdout via `process.stdout.write` per architecture §line 524 + §line 862. The `--export-state | jq '.currentPhase'` workflow is the AC line 852 contract; AR9-wrapping would force a 2-step `jq` pipeline.
- **Story 3.9 `--watch`**: emits raw transcript content via `process.stdout.write` from inside the tail loop. The streaming-mode requirement is structurally incompatible with the single-JSON-line AR9 invariant; pre-buffering the entire transcript until SIGINT defeats the streaming intent.

In BOTH cases, the `runNext` return value still uses the `report` shape for testability — tests inspect `result.action.message` and `JSON.parse` it. Only the process-level emission at `import.meta.main` differs. The carve-out is bounded — every OTHER flag (`--diff-state`, `--explain`, `--list`, `--dry-run`) preserves AR9 strictly. Each FR54 SPECIAL CASE is documented in 3-4 separate JSDoc blocks and adjudicated as Open Question 1-2 ACCEPT v0.1.

**Pattern crystallized**: process-level emission is a SEPARATE concern from runtime return-shape testability. Future streaming-mode flags (e.g., Story 4.x `--watch-loop`, Story 6.x `--telemetry-tail`) should reuse the precedent: preserve `runNext` return shape; bypass `emitDispatchAction` at `import.meta.main`; document inline + in module JSDoc + in story-spec Open Questions.

### 3. Lock-free invariant via structural design preserved + made explicit by Story 3.10's `skipAcquire`

The architecture's lock-free `run.ts` / lock-held `verify-and-advance.ts` boundary (architecture §line 1672) was established by Story 2.4 STRUCTURALLY — the runner never imports `src/lock/`; the AR41 boundary check at `run.test.ts:606-638` enforces. Story 3.10's `LockOptions.skipAcquire?: boolean` flag adds the **explicit contract surface** for cases where read-only flags ever route through a lock-acquiring path. The bounded list of v0.1 callers is EMPTY in production (the structural invariant already holds; the read-only flags structurally never reach `acquire(...)`). The flag is forward-proofing + AC verbatim compliance per epics.md line 878.

This is a useful architectural pattern: **structural invariants** (e.g., AR41 boundary; lock-free `run.ts`) are enforced by tests today, but become brittle as the codebase grows. **Explicit contract surfaces** (e.g., `skipAcquire` flag) provide the right-answer-off-the-shelf for any future story that accidentally routes a read-only flag through a lock-acquiring path. The combination is stronger than either alone: the test catches the regression today; the contract guides the refactor tomorrow.

### 4. Persona-resolution tier expansion in Story 3.6

Story 3.6 added a new sibling helper `resolvePersonaWithTier` to `src/personas/resolve.ts` — strictly additive (zero modification to `resolvePersona` from Story 1.11). The helper returns `{ persona: string | string[]; tier: ResolvedTier }` where `ResolvedTier` enumerates 5 levels: TIER_LABEL_OVERRIDE (Tier 0 — `--persona` flag), TIER_LABEL_FRONTMATTER (Tier 1), TIER_LABEL_PROJECT_CONFIG (Tier 2), TIER_LABEL_DEFAULTS (Tier 3), TIER_LABEL_MODULE_CONFIG (Tier 4). The tier metadata feeds Story 3.6's `--explain` reasoning trace's `Resolved persona: <name> (resolved via Tier <N>: <source>)` component.

The original 4-tier resolver (Story 1.11) returned just the persona name; the explain trace needed source-of-truth labels. Rather than modify `resolvePersona`'s return shape (which would cascade across Stories 2.2 / 2.4 / 4.1 / 5.* / 6.x), Story 3.6 added the sibling helper. The cost is ~60 lines of cascade orchestration duplication; the benefit is zero risk of breaking the existing dispatch path. **Recommendation**: Story 6.1 (config-loader) may promote `resolvePersona` to delegate to `resolvePersonaWithTier` and discard the tier metadata, eliminating the duplication — but only when the config-loader's full surface is in place to guard the regression risk.

## Loop Iterations Consumed

**25 iterations** in `/bmad-loop` (loopId `2026-05-01T165239Z-bmad-loop`). Wall-clock from 16:52 UTC start to ~23:55 UTC end on 2026-05-01 = ~7 hours. Approximate distribution:

- **Iters 1-2 (16:52-19:09 UTC)**: Story 3.1 create-story + dev-story.
- **Iters 3-4**: Story 3.1 code-review + flip to done; Story 3.2 create-story.
- **Iters 5-6**: Story 3.2 dev-story + code-review.
- **Iters 7-9**: Story 3.3 create-story + dev-story + code-review.
- **Iters 10-11**: Story 3.4 create-story + dev-story (combined into longer dev pass).
- **Iter 12**: Story 3.4 code-review + Story 3.5 create-story.
- **Iters 13-14**: Story 3.5 dev-story + code-review.
- **Iters 15-16**: Story 3.6 create-story + dev-story + code-review (compressed).
- **Iters 17-18**: Story 3.7 create-story + dev-story + code-review.
- **Iters 19-21**: Story 3.8 create-story + dev-story + code-review (largest single-story src delta — +6 new files).
- **Iters 22-23**: Story 3.9 create-story + dev-story + code-review.
- **Iter 24**: Story 3.10 create-story + dev-story + code-review (smallest delta — purely additive on `src/lock/lock.ts`).
- **Iter 25 (this retro)**: epic-3-retrospective.

No sub-agent stream-idle interruptions and no abandon-on-reentry sequences (matches Epic 2's clean record vs. Epic 1's 1 such incident on Story 1.9 create-story). The orchestrator drove the full epic from clean checkpoint (state.yaml `nextStepKey: 3-1-record-...`) to complete `epic-3: done` without intervention.

**Flake/repair budget consumed**: Story 3.3 review noted a transient first-run test flake (588/1) under cross-tool concurrency (`bun test` parallel-launched alongside `bun run check` and biome ci on the same host); 5 subsequent consecutive full-suite runs passed cleanly at 589/0/2172. Adjudicated as INFRASTRUCTURE FLAKE, not Story 3.3 regression. No retries / no re-dispatches. Story 3.9 review noted a potential timing flake on first `bun test` run; DID NOT REPRODUCE on TWO consecutive flake-check runs (711/0/2644/55 stable both times).

## Sprint-Status Update

After this retrospective lands, `_bmad-output/implementation-artifacts/sprint-status.yaml` reflects the following Epic 3 closure:

- All 10 stories `done`: `3-1-record-last-attempted-last-failure-reason-on-halt`, `3-2-resume-flag`, `3-3-dry-run-flag`, `3-4-step-id-and-scope-flags`, `3-5-persona-override-include-optional-no-optional`, `3-6-explain-reasoning-trace`, `3-7-list-candidate-next-steps`, `3-8-diff-state-and-export-state`, `3-9-watch-live-transcript-tail`, `3-10-non-locking-read-flags`.
- `epic-3: in-progress → done`.
- `epic-3-retrospective: optional → done`.
- Epic 4 (`epic-4: backlog`) is the next epic; loop `/bmad-loop --until=epic:4` should now satisfy its stop condition.

---

**Epic 3 closure milestone:** All 10 required stories `done`; epic status `done`; optional retrospective (this document) `done`. Epic 4 (Bounded `/bmad-loop` Command) is the next epic. The transparency surface — halt recording, resume, dry-run, step-targeting + scope filters, persona override + optional toggles, explain reasoning trace, candidate enumeration, state diff + export, live transcript tail, and the explicit `skipAcquire` lock-free contract surface — is now fully in place. The Story 2.4 placeholder branches are all REPLACED with canonical implementations. The errors registry remains frozen at 16 codes; the `/bmad-loop` may now be re-invoked with stop conditions targeting Epic 4.
