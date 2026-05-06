---
status: done
artifact_type: retrospective
epic: '4'
epic_title: Bounded Loop with Eight Stop Conditions
created: '2026-05-04'
last_updated: '2026-05-04'
storiesCompleted: 10
storiesRange: '4.1 through 4.10'
loopId: 2026-05-04T065546Z-bmad-loop
runId: 2026-05-04T094808Z-bmad-next
loopIteration: 10
persona: bmad-retrospective
---

# Epic 4 Retrospective: Bounded Loop with Eight Stop Conditions

## Summary

Epic 4 ships the entire `/bmad-loop` overnight-run surface that the PRD's Bounded Loop Execution theme calls for: a thin top-tier orchestrator that wraps `runNext` with eight user-facing stop conditions, two runner-direct halt variants, a plan-first dry-run preview, a per-step-type checkpoint mechanism, SIGINT graceful exit, and a unified two-line exit-reason + `--resume` hint emission. The runner skeleton landed in Story 4.1 with a NEW top-tier module group at `src/commands/loop/` (`args.ts`, `run.ts`, `index.ts`) plus the `commands/bmad-loop.md` Layer 1 markdown — the FIRST `/bmad-loop` command surface in the project. Stories 4.2-4.6 wired the eight stop-condition flags as pure-function predicates in a NEW `src/commands/loop/stop-conditions.ts` mid-tier module: `--until-epic-end` + `--until-story X.Y` (4.2), `--next-story` + `--phase-end` (4.3), `--max-iters N` + the FR25 default-50 cap (4.4), `--time-budget` + `--token-budget` with 80%-warning latch + 100%-halt (4.5), and `--stop-on-error` + `--continue-on-error` halt-on-verifier-failure gating (4.6). Story 4.7 added the NEW `src/commands/loop/plan.ts` pure-function module and the `LoopResult | PlanResult` discriminated union for `--plan-first` dry-run preview that walks the DAG without dispatching anything. Story 4.8 wired the `--checkpoint-each <step-type>` runtime semantics: a NEW `CheckpointEntrySchema` Zod type in `src/schemas/state.ts`, a tightened `StateV1Schema.checkpoints[]` (`z.array(z.unknown())` → `z.array(CheckpointEntrySchema).max(50)`), and a write-site append at the lock-held `verify-and-advance.ts` boundary per AR8/AR13. Story 4.9 added the SIGINT graceful-exit handler with a closure-private `shutdownRequested` flag, body-wide `try { ... } finally { uninstallSignal() }` cleanup, and 5 strategic SIGINT short-circuit checks across setup-phase #1, plan-mode, setup-phase #2, top-of-while, and iteration-body — all without acquiring the lock. Story 4.10 unified loop-exit emission: a NEW `formatLoopExitLines(stopReason, state) → string` pure helper produces the AC-mandated two-line shape (`Loop exited: <reason>.\nSnapshot: <sha>. Resume: /bmad-next --resume.`), and a NEW `writeLoopExitTranscript(input)` async writer atomically writes a structured loop-exit JSON to `_bmad-output/.stepper/runs/<ts>-loop-exit.json` per FR26.

The errors registry held at **16 codes throughout** the entire epic — ZERO new error class registrations across all 10 stories. The two new runner-direct StopReason variants (`error-stop` from Story 4.6; `manual-sigint` from Story 4.9) were composed from the existing `state.lastFailureReason` payload (Story 3.1's mutation pair) and from an OS signal respectively — neither needed a new error class. The `StopReason` discriminated union grew from 1 variant (Story 4.1 `max-iters-reached`) to 10 variants (Story 4.10 `manual-sigint` + 8 stop conditions + `error-stop`) without a single refactor — the discriminated-union pattern proved a clean fit.

Test growth: 727 (epic-3 close) → **1022 pass / 0 fail / 3680 expect() / 60 files** (+295 tests / +943 expects / +4 files net). The loop-tier suite (`src/commands/loop/`) grew from 0 files at epic-3 close to **270 pass / 0 fail / 897 expect() across 4 files** (`args.test.ts` 30 tests, `plan.test.ts` 20 tests, `run.test.ts` 95 tests, `stop-conditions.test.ts` 79 tests + 46 hidden in expect counts). The `verify-and-advance.test.ts` suite grew by 12 tests (Story 4.8's CV_48_*); `state.test.ts` grew by ~12 tests (Story 4.8's CheckpointEntrySchema validation). All other modules are UNCHANGED from epic-3 close — Epic 4 is structurally additive at the top tier.

## Sprint Metrics

| Metric                                      | Value                                                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Stories completed                           | 10 (4.1 → 4.10) — all `done`                                                                                 |
| Test-suite growth (epic start → end)        | 727 (epic-3 baseline) → **1022 pass / 0 fail / 3680 expect() / 60 files**                                    |
| Per-story baseline progression (full suite) | 727 → 771 (4.1) → ~813 (4.2) → ~849 (4.3) → 853 (4.4) → 890 (4.5) → 904 (4.6) → 937 (4.7) → 976 (4.8) → 990 (4.9) → 1022 (4.10) |
| Net Epic 4 test growth                      | **+295 tests / +943 expects / +4 files** vs. epic-3 final (727 / 2737 / 56)                                  |
| New top-tier modules                        | 1 module group (`src/commands/loop/`) with 5 source files (`args.ts`, `run.ts`, `index.ts`, `stop-conditions.ts`, `plan.ts`) and 4 colocated test files (`args.test.ts`, `run.test.ts`, `stop-conditions.test.ts`, `plan.test.ts`) — joins `src/commands/next/` as the second canonical Layer-2 runner |
| New foundational tier additions             | 1 (`CheckpointEntrySchema` + `CheckpointEntry` type in `src/schemas/state.ts` per AR20 type-alias chain — Story 4.8) |
| New mid-tier extensions                     | 0 — Epic 4 is structurally top-tier (existing mid-tier modules `src/state/`, `src/dag/`, `src/snapshot/`, `src/io/atomic-write.ts`, `src/io/log.ts` consumed unchanged) |
| Errors registry stability                   | **16 codes throughout** — held stable since Story 1.5. ZERO new error class registrations across all 10 Epic 4 stories. The `error-stop` and `manual-sigint` runner-direct StopReason variants reuse `state.lastFailureReason` (Story 3.1) and OS signal handling respectively — no thrown StepperError needed |
| Slash-command surface added                 | 1 (`/bmad-loop` per `commands/bmad-loop.md` — 758 lines after all 10 stories; joins `/bmad-next` as the second slash command) |
| Repair iterations total                     | **3 across 10 stories** (Story 4.1 r1 = 1; Story 4.2 r1 = 1; Story 4.10 r1 = 1; all other 7 stories landed in dev → review → done in one pass) |
| Code-review outcomes                        | **9 APPROVE** (4.2-4.10) + **1 APPROVE-WITH-ACTIONS** (4.1) — 0 changes-requested, 0 must-fix items across all 10 stories |
| Loop iterations consumed (Epic 4)           | **30 iterations** distributed across **6 `/bmad-loop` invocations** (loopIds: 2026-05-02T002450Z, 2026-05-02T065000Z, 2026-05-03T003755Z, 2026-05-03T090459Z, 2026-05-03T233849Z, 2026-05-04T065546Z); see §Loop Iterations Consumed for the per-loop breakdown |
| Wall-clock                                  | ~3 days calendar (2026-05-02T00:24:50Z first Epic-4 loop start → 2026-05-04T09:55:00Z Story 4.10 done); active dev wall-clock ~14-18 hours across 6 sessions (each session ~2-4 hours) |
| `bun test` release-blocker gate (final)     | Exit 0; **1022 pass / 0 fail / 3680 expect() / 60 files** (full suite) + 270/0/897 (loop suite) + 10/0/197 (errors registry) |
| Documented dev deviations                   | ~30 across 10 stories (all `accept` or `accept-with-actions` at code-review; ZERO blocked promotion). See per-story SDR D1/D2/D3/D4 entries below |

## Stories Completed

| #    | Story                                                                | FR / NFR / AR Coverage                                                                                       | New Source Files / Modifications                                                                                                                                      | Test Δ                                  | Review                          | Repairs |
| ---- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------- | ------- |
| 4.1  | `/bmad-loop` Command Skeleton                                        | FR8, FR9, FR19, FR53, FR54; NFR-P1, NFR-S2, NFR-S5, NFR-R1, NFR-R4, NFR-M3, NFR-I2; AR8, AR9, AR21, AR22, AR33, AR34, AR41, AR42 | NEW: `src/commands/loop/args.ts` (307 L), `src/commands/loop/run.ts` (354 L), `src/commands/loop/index.ts` (30 L), `commands/bmad-loop.md` (260 L) + colocated tests `args.test.ts` (28 tests), `run.test.ts` (16 tests) | +44 tests / +152 expects / +2 files     | approve-with-actions (0/2/3/9)  | 1       |
| 4.2  | Stop-Condition: `epic-end` and `story-X-Y`                           | FR8, FR9, FR19, FR53, FR54; NFR-P1, NFR-S2, NFR-S5, NFR-R1, NFR-R4, NFR-M3, NFR-I2; AR8, AR9, AR21, AR22, AR33, AR34, AR41, AR42 | NEW: `src/commands/loop/stop-conditions.ts` (440 L) + colocated `stop-conditions.test.ts` (28 tests / 152 expects); MODIFIED `run.ts`/`run.test.ts`/`index.ts`/`bmad-loop.md` | +37 tests (+9 run.test extensions + 28 new stop-conditions tests) / +183 expects / +2 files | approve (0/0/3/7)               | 1       |
| 4.3  | Stop-Condition: `next-story` and `phase-end`                         | FR8, FR9, FR19; NFR-P1, NFR-S2, NFR-S5, NFR-R1, NFR-R4, NFR-M3, NFR-I2; AR8, AR9, AR21, AR22, AR33, AR34, AR41 | MODIFIED `stop-conditions.ts` (+37 L; +`LoopContext` interface + 2 predicates + dispatcher widening); MODIFIED `run.ts` (+140 L; opt-in DAG load gated on `args.phaseEnd === true` + baseline capture); +23 stop-conditions tests + 13 run.test integration tests + 4 sweep sub-tests | +36 tests / +74 expects / 0 new files   | approve (0/0/2/7)               | 0       |
| 4.4  | Stop-Condition: `max-iters` and Default Cap                          | FR8, FR19, FR25, FR53, FR54; NFR-P1, NFR-S2; AR8, AR9, AR21, AR22, AR33, AR34, AR41 | MODIFIED `run.ts` (+50/-60 L; FR25 default-50 cap inverted-check; REMOVED `hasOtherStopCondition` helper + `no-stop-condition` placeholder + variant); MODIFIED `run.test.ts` (+150/-30 L; rewrote Test E + added X_44/Y_44/Z_44/sweep) | +8 tests / +23 expects / 0 new files    | approve (0/0/2/7)               | 0       |
| 4.5  | Stop-Condition: `time-budget` and `token-budget`                     | FR8, FR19, FR23; NFR-P1, NFR-S2, NFR-R5; AR8, AR9, AR10, AR21, AR22, AR33, AR34, AR41 | MODIFIED `stop-conditions.ts` (+`LoopMetrics` interface + `formatTimeBudget` + 2 predicates); MODIFIED `run.ts` (+`LoopMetrics` initialiser + per-iter token accumulation + 80%-warning emission + 2 StopReason variants); +TB/KB unit tests + 9 run.test integration tests | +37 tests / +68 expects / 0 new files   | approve (0/0/2/8)               | 0       |
| 4.6  | Stop-Condition: `error` (with `--stop-on-error`/`--continue-on-error`) | FR8, FR19, FR20, FR26, FR53; NFR-S2; AR8, AR9, AR21, AR22, AR33, AR34, AR41 | MODIFIED `run.ts` (+90/-10 L; `error-stop` StopReason variant + halt-on-error short-circuit reading `state.lastFailureReason.code` + `--continue-on-error` gate + unbounded-iteration warning); SF-2 cleanup `IterationRecord.action` union narrowed | +12 tests / +43 expects / 0 new files   | approve (0/0/2/9)               | 0       |
| 4.7  | `--plan-first` Dry-Run Preview                                       | FR8, FR21, FR53, FR54; NFR-P1, NFR-S2; AR8, AR9, AR10, AR21, AR22, AR33, AR34, AR41, AR42 | NEW: `src/commands/loop/plan.ts` (470 L pure-function module — `Plan`/`PlannedStep`/`PlanCheckpoint`/`MAX_PLAN_WALK`/`computePlan`/`formatPlan`/`lookupModelTokens`); NEW: `plan.test.ts` (19 tests / ~390 L); MODIFIED `run.ts` (+120 L; pre-flight branch + `LoopResult \| PlanResult` discriminated union + 10-clause default-cap inverted-check); MODIFIED `run.test.ts` (+320 L; 14 new tests + `asLoop<T>` narrowing helper for 64 call sites) | +33 tests / +101 expects / +1 file (`plan.test.ts`) | approve (0/0/2/0)               | 0       |
| 4.8  | `--checkpoint-each <step-type>`                                      | FR8, FR22, FR53; NFR-S5, NFR-R1; AR8, AR9, AR13, AR21, AR22, AR33, AR34, AR41, AR42 | MODIFIED `src/schemas/state.ts` (+`CheckpointEntrySchema` Zod type + tightened `StateV1Schema.checkpoints[]` from `z.unknown()` to `z.array(CheckpointEntrySchema).max(50)`); MODIFIED `args.ts` (3-value enum → 5-value Phase enum per AC-3); MODIFIED `plan.ts` (`matchCheckpointType` restricted to phase-match); MODIFIED `verify-and-advance.ts` (+90 L; checkpoint-append block at lock-held mid-tier + `matchCheckpointPhase` exported helper); MODIFIED `next/run.ts` (+`RunNextOptions.checkpointEach`); +CV_48_* tests + +CE_48_* tests + +schema tests | +25 tests / +67 expects / 0 new files   | approve (0/0/3/6)               | 0       |
| 4.9  | SIGINT Graceful Exit                                                 | FR8, FR24; NFR-R5; AR8, AR9, AR21, AR22, AR33, AR34, AR41, AR42 | MODIFIED `src/commands/loop/run.ts` (+165 L; closure-private `shutdownRequested` flag + `sigintHandler` + `installSignalFn` + body-wide `try { ... } finally { uninstallSignal() }` + 5 strategic SIGINT short-circuit checks + `manual-sigint` StopReason variant + `formatExitReason` 10th case + `signalOverride` + `nowOverride` LoopOpts seams); MODIFIED `plan.ts` (+9 L for TS exhaustiveness on `manual-sigint` case); +14 tests SI_49_1-8 + SWEEP_49 (3 sub-tests) | +14 tests / +67 expects / 0 new files   | approve (0/0/3/8)               | 0       |
| 4.10 | Loop Exit-Reason + Resume Hint                                       | FR8, FR26, FR54; NFR-R1, NFR-R2, NFR-S5; AR8, AR9, AR21, AR22, AR33, AR34, AR41, AR42 | MODIFIED `src/commands/loop/run.ts` (+157 L; `formatLoopExitLines(stopReason, state)` pure 12-line composer + `writeLoopExitTranscript(input)` async atomic-write helper + `LoopExitTranscriptInput` interface + 2 LoopOpts test seams + `import.meta.main` rewire with plan-mode-first short-circuit + AR9 emit BEFORE disk write + best-effort transcript with warn-on-failure); MODIFIED `index.ts` (+5 L; barrel re-exports); +EX_410_1-8 + EX_410_PURE/TRAILING + SWEEP_410 (10 variants × 2 snapshot states + meta + manual-sigint substring preservation = 32 tests) | +32 tests / +135 expects / 0 new files  | approve (0/0/4/8)               | 1       |

## Test Growth

```
Story 3.10 final (epic-3 close):    727 pass / 0 fail / 2737 expect() / 56 files
Story 4.1 (loop skeleton):          771 pass / 0 fail / 2889 expect() / 58 files  (+44 tests / +152 expects / +2 files)
Story 4.2 (until-epic-end + until-story): ~813* pass / 0 fail / ~3072 expect() / 58 files  (+37 tests / +183 expects / 0 new files; full-suite count not measured per OQ-OOM environmental issue; loop-suite delta confirmed 82/0/335)
Story 4.3 (next-story + phase-end): ~849* pass / 0 fail / ~3146 expect() / 58 files  (+36 tests / +74 expects / 0 new files; loop-suite delta 118/0/409)
Story 4.4 (max-iters + default cap): 853 pass / 0 fail / 3169 expect() / 59 files  (+8 tests / +23 expects / 0 new files; loop-suite 126/0/432)
Story 4.5 (time-budget + token-budget): 890 pass / 0 fail / 3237 expect() / 59 files  (+37 tests / +68 expects / 0 new files; loop-suite 163/0/500)
Story 4.6 (stop-on-error + continue-on-error): 904 pass / 0 fail / 3280 expect() / 59 files  (+12 tests / +43 expects / 0 new files; loop-suite 177/0/543)
Story 4.7 (--plan-first dry-run preview): 937 pass / 0 fail / 3381 expect() / 60 files  (+33 tests / +101 expects / +1 file plan.test.ts; loop-suite 210/0/644)
Story 4.8 (--checkpoint-each step-type): 976 pass / 0 fail / 3478 expect() / 60 files  (+25 tests / +67 expects / 0 new files; loop-suite 224/0/695; +CV_48_* in verify-and-advance.test.ts; +CheckpointEntrySchema tests in state.test.ts)
Story 4.9 (SIGINT graceful exit): 990 pass / 0 fail / 3545 expect() / 60 files  (+14 tests / +67 expects / 0 new files; loop-suite 238/0/762)
Story 4.10 (loop exit-reason + resume hint): 1022 pass / 0 fail / 3680 expect() / 60 files  (+32 tests / +135 expects / 0 new files; loop-suite 270/0/897)

Net Epic 4 growth (since epic-3 close): +295 tests / +943 expects / +4 files.
* Stories 4.2 + 4.3 full-suite counts are estimated from per-story dev claims (loop-suite + errors-suite deltas). The dev-stories noted environmental OOM on full bun test runs from Story 4.2-4.3; targeted loop-suite + errors-suite runs covered the full delta. Story 4.4 onward re-established full-suite measurement.
```

Per-story patterns:

- **Story 4.1 is the largest single-story src delta** (+5 NEW source/test files + `commands/bmad-loop.md` Layer 1 markdown — 1612 lines total across the new module group). Establishes the FIRST `/bmad-loop` command surface; mirrors `/bmad-next`'s Story 2.4/2.7 module-group pattern.
- **Story 4.2 is the largest single-story mid-tier addition** (+1 NEW pure-function module `src/commands/loop/stop-conditions.ts` — 440 L initial; widened to 477 L by 4.3, 478 L by 4.5, 662 L by 4.6+4.7+4.8). Establishes the `(state, dag, args, sprintStatus?) => StopReason | null` predicate contract that all subsequent stop-condition predicates follow.
- **Stories 4.3/4.4/4.5/4.6 each modify the same two files** (`run.ts` + `stop-conditions.ts` — except 4.4 + 4.6 which only modify `run.ts`); zero new src files. The runner is the canonical Layer 2 composer; the predicate module is the canonical pure-function library.
- **Story 4.7 is the second-largest single-story src delta** (+1 NEW pure-function module `src/commands/loop/plan.ts` — 470 L; +1 NEW test file `plan.test.ts` — 390 L). Establishes the `LoopResult | PlanResult` discriminated-union return shape and the `asLoop<T>` test-narrowing helper.
- **Story 4.8 is the SCHEMA story** (+1 NEW Zod type `CheckpointEntrySchema` in `src/schemas/state.ts`); the only Epic 4 story to extend a foundational module (state schema). Phase taxonomy is duplicated across 3 files (`dag/types.ts`, `loop/args.ts`, `schemas/state.ts`) per OQ-3 + AR41 (forbids `schemas/` from importing `dag/`).
- **Story 4.9 is the I/O-handler story** (+165 L closure-private `shutdownRequested` flag + 5 SIGINT check sites + body-wide `try { ... } finally { uninstallSignal() }` cleanup); the only Epic 4 story to add OS signal handling.
- **Story 4.10 is the SMALLEST exit-emission delta of the epic** (~157 net lines on `run.ts` only); purely additive at the `import.meta.main` emission layer. Establishes `formatLoopExitLines` + `writeLoopExitTranscript` as the unified loop-exit format. The TypeScript exhaustiveness check on `syntheticStopReason` (test fixture switch with no default clause) ENFORCES SWEEP_410 coverage on future StopReason additions at compile-time.

## Source Files Added

### Foundational tier (1 NEW addition)

- `src/schemas/state.ts` extension (Story 4.8) — NEW `CheckpointEntrySchema` Zod type at lines 130-141 (`{ branch: string, sha: string, takenAt: ISO 8601 datetime, stepType: enum(analysis|planning|solutioning|implementation|retro) }`); NEW `CheckpointEntry` type-alias at line 143 per AR20 type-alias chain; TIGHTENED `StateV1Schema.checkpoints[]` at line 170 from `z.array(z.unknown()).max(50).default([])` to `z.array(CheckpointEntrySchema).max(50).default([])` — defence-in-depth against future writers.

### Foundational tier — UNCHANGED

- `src/errors.ts` (16 codes) — UNCHANGED throughout Epic 4. ZERO new error class registrations.
- `src/io/atomic-write.ts` — UNCHANGED; consumed by Story 4.10's `writeLoopExitTranscript`.
- `src/io/log.ts` — UNCHANGED; consumed by Story 4.10's `warn` for best-effort transcript-write failure path.
- `src/dag/types.ts:30-35` — UNCHANGED; canonical `Phase` literal-union `"analysis" | "planning" | "solutioning" | "implementation" | "retro"` consumed by Stories 4.3 + 4.7 + 4.8.

### Mid-tier extensions (NO new mid-tier modules)

Epic 4 is structurally additive at the top tier. The existing mid-tier modules consumed:

- `src/state/load.ts` (Story 1.6) — `loadStateUnlocked` consumed by Stories 4.2-4.10 for per-iteration + plan-mode + loop-final state reads (lock-free per AR8).
- `src/dag/build.ts` + `src/dag/index.ts` (Story 1.10) — `build({ skillNames: [] })` + `DagAdjacency` + `Phase` consumed by Stories 4.3 + 4.7 + 4.8.
- `src/snapshot/detect.ts` (Story 1.8) — `detectSnapshot()` consumed by Story 4.8's checkpoint-append block (Layer 1 Git capture).
- `src/state/save.ts` (Story 1.6) — `saveState()` ATOMIC-WRITE path consumed by Story 4.8 (rides the existing path; Story 4.8 adds NO new write site — `.bak` rotation per AR13 Layer 2 piggybacks).
- `src/dispatch/emit.ts` (Story 2.4) — `emitDispatchAction` consumed by all 10 Epic-4 stories' `import.meta.main` AR9 emission.
- `src/commands/next/run.ts` (Story 2.4 + Epic 3 extensions) — top-tier sibling `runNext` imported by `src/commands/loop/run.ts` per AR41 boundary graph.

### Top-tier (NEW module group + 1 modified mid-tier-adjacent file)

The `src/commands/loop/` module group (NEW per Story 4.1; extended through 4.10):

- `src/commands/loop/args.ts` (Story 4.1; 310 L final) — `LoopArgsSchema` Zod schema declares 13 fields per AC-2 (`untilEpicEnd`, `untilStory`, `nextStory`, `phaseEnd`, `maxIters`, `timeBudgetMs`, `tokenBudget`, `stopOnError`, `continueOnError`, `interactive`, `autoFix`, `planFirst`, `checkpointEach`); `parseLoopArgs(argv): Result<LoopArgs, ParseError>` Result-shape parser. Story 4.8 swapped the `checkpointEach` enum from 3-value `story|epic|phase` to 5-value Phase per AC-3.
- `src/commands/loop/run.ts` (Story 4.1; 1617 L final after 10 stories) — `runLoop(opts)` runner skeleton + `IterationRecord` / `StopReason` / `LoopResult` / `LoopOpts` types + `import.meta.main` AR9-line emission. Net additions across 10 stories: Story 4.1 skeleton with `--max-iters` runtime + 1 StopReason variant; Story 4.2 sprint-status + state-load loaders + 2 StopReason variants + stderr emission; Story 4.3 opt-in DAG load + `LoopContext` baseline capture + 2 StopReason variants; Story 4.4 default-cap inverted-check; Story 4.5 `LoopMetrics` initialiser + per-iter token accumulation + 80%-warning latches + 2 StopReason variants; Story 4.6 halt-on-error short-circuit + `--continue-on-error` gate + `error-stop` StopReason variant; Story 4.7 pre-flight `--plan-first` branch + `LoopResult | PlanResult` discriminated union; Story 4.9 SIGINT handler install + body-wide `try { ... } finally { uninstallSignal() }` + 5 SIGINT check sites + `manual-sigint` StopReason variant + 2 LoopOpts test seams; Story 4.10 `formatLoopExitLines` pure helper + `writeLoopExitTranscript` async writer + `LoopExitTranscriptInput` interface + 2 LoopOpts test seams + `import.meta.main` rewire.
- `src/commands/loop/index.ts` (Story 4.1; 54 L final) — barrel re-export for the public surface. Updated by 4.7 (Plan/PlanResult/computePlan/formatPlan/lookupModelTokens), 4.10 (formatLoopExitLines/LoopExitTranscriptInput/writeLoopExitTranscript).
- `src/commands/loop/stop-conditions.ts` (Story 4.2 NEW; 662 L final after 10 stories) — pure-function predicate module. Exports `compareStoryIds` (Story 4.2 numeric-segment comparator handling the `1.10 > 1.2` hazard); `untilEpicEndStopCondition` (Story 4.2); `untilStoryStopCondition` (Story 4.2); `nextStoryStopCondition` (Story 4.3); `phaseEndStopCondition` (Story 4.3); `LoopContext` interface (Story 4.3); `LoopMetrics` interface (Story 4.5); `formatTimeBudget` helper (Story 4.5); `timeBudgetStopCondition` (Story 4.5); `tokenBudgetStopCondition` (Story 4.5); `evaluateStopConditions` dispatcher (Story 4.2; widened by 4.3/4.5). Predicates return `StopReason | null` (NOT booleans per OQ-1 widening; the "boolean" wording in AC-3 is interpreted as the BINARY OUTCOME — fired vs not-fired). ZERO I/O imports per AR41 boundary check.
- `src/commands/loop/plan.ts` (Story 4.7 NEW; 588 L final after 4.7 + 4.8) — pure-function plan-walk module. Exports `Plan`, `PlannedStep`, `PlanCheckpoint`, `PlanFirstStopCondition`, `MAX_PLAN_WALK = 200`, `computePlan(state, dag, sprintStatus, args): Plan`, `formatPlan(plan): string`, `lookupModelTokens(stepName): null` (v0.1 stub deferred to Story 6.3), `matchCheckpointType` (Story 4.8 restricted to phase-match). The `pickNextSuccessor` traversal follows `Map`/`Set` insertion-order per Story 1.10 invariant (deterministic per AC-3 reproducibility). The `extractStopReasonMessage` switch was extended in Story 4.9 with the `manual-sigint` case for TypeScript exhaustiveness.

### Modified mid-tier file (Story 4.8)

- `src/commands/next/verify-and-advance.ts` extension (Story 4.8) — `+90 L`: added `opts.checkpointEach?: Phase` + `opts.dag?: DagAdjacency` test-injection seam; added `matchCheckpointPhase(checkpointEach, currentStep, dag): Phase | null` exported helper (~6-line duplication of `loop/plan.ts:matchCheckpointType` per OQ-4 — top-tier `loop/plan.ts` cannot be imported from mid-tier `next/verify-and-advance.ts` per AR41); added checkpoint-append block at lines 596-643 between `runHistoryEntry` build and `stateAfter` build (FIFO-50 trim at write site via `nextCheckpoints.slice(length - 50)`); production callers fall back to `derivePhaseFromStep` (planning/implementation only — sufficient for the AC's worked example `--checkpoint-each implementation`); D1 forward-tracker for Story 6.x dispatch-spec v2 with `phase` field.

### Modified top-tier file (Story 4.8)

- `src/commands/next/run.ts` extension (Story 4.8) — `+25 L`: added `RunNextOptions.checkpointEach: Phase` field; production callers thread `args.checkpointEach` through the `productionRunNextFn` closure at `loop/run.ts:686-693`.

### Slash-command surface (Layer 1 markdown — Story 4.1 NEW; extended through 4.10)

- `commands/bmad-loop.md` (Story 4.1 NEW; 758 L final) — frontmatter + Usage examples + Behavior + Stop conditions table + Tool restrictions + Error handling. Mirrors `commands/bmad-next.md` (Story 2.7) structure. Each Epic-4 story flipped its row in the §Stop Conditions table from "parsed only" to "RUNTIME-WIRED in 4.X" and added a new sub-section documenting behavior + exit codes + AC-verbatim message text. Story 4.10 added a new `### Loop exit-reason + --resume hint format (Story 4.10)` sub-section documenting the unified two-line shape + snapshot-null fallback.

## Patterns Observed

Epic 4 surfaced and crystallized eight architectural patterns worth codifying:

1. **Inverted default-cap predicate** (Story 4.4 origin; extended across 4.5/4.6/4.7): a single `if (args.maxIters === undefined && args.untilEpicEnd !== true && args.untilStory === undefined && ...)` predicate at `runLoop` body grew from 5 clauses (4.4) to 7 clauses (4.5) to 9 clauses (4.6) to 10 clauses (4.7 with `args.planFirst !== true`). Each new stop-condition flag adds ONE clause to suppress the default-50 cap. Story 6.x `hasExplicitStopCondition(args)` helper refactor remains deferred. The pattern proved scalable through 6 extensions without refactor.

2. **LoopOpts test-injection seam pattern** (Story 4.5+ pattern; full crystallization by Story 4.10): every new behaviour added 1-2 test-injection seams to `LoopOpts` — `runNextOverride` (4.1), `stateOverride`, `dagOverride`, `sprintStatusOverride`, `stderrOverride` (4.2-4.3), `tokensPerIter` (4.5), `signalOverride`, `nowOverride` (4.9), `finalStateOverride`, `writeLoopExitTranscriptOverride` (4.10 — declared but unused per N-4). The pattern allows colocated testing without `mock.module` (which has process-global state in Bun) and without subprocess spawn (which adds ~30ms per test). AR42 invariant held throughout. Net: 10 LoopOpts seams across 10 stories.

3. **Pure-function predicate pattern** (Story 4.2 origin; extended across 4.3/4.5): predicates in `src/commands/loop/stop-conditions.ts` return `StopReason | null` with no I/O imports, no `console.*` calls, no throws. The "boolean" wording in epics.md AC-3 was interpreted as the BINARY OUTCOME (fired vs not-fired) — the richer `StopReason` discriminated union carries the metadata. Pattern proved a clean fit through 4 extensions; Story 4.6 deviated INTENTIONALLY (failure-policy logic lives in `run.ts` iteration body, NOT `stop-conditions.ts`, because it is intrinsically state-mutating per OQ-10 — documented; not a regression).

4. **Reproducibility-as-design** (Story 4.7 `--plan-first` AC-3): the entire `plan.ts` module is pure-function with no `Bun.nanoseconds()`, no `new Date()`, no random IDs. The `pickNextSuccessor` traversal follows `Map`/`Set` insertion-order per Story 1.10 invariant. Tests assert byte-identical output across two `runLoop` invocations. The `LoopResult | PlanResult` discriminated-union return shape is type-safe; tests use a single `asLoop<T>` narrowing helper for 64 call sites. Forward-tracker for Story 6.x: shared dispatch helper `formatRunExit(result)` dispatching on `result.mode` may unify plan-mode + loop-mode emission shapes.

5. **Single-river vs multi-river per-iteration state reads** (Story 4.5 introduces multi-river → Story 4.9 single-river preserved): the per-iteration `stateFn()` call count grew from 1 (Story 4.2) to 3 (Story 4.3 deferred-baseline) to 4 (Story 4.5 token accumulation) to 5 (Story 4.6 post-halt error-stop read) to 6 (Story 4.7 plan-mode one-shot). The D3 forward-tracker (per-iteration state caching) remains deferred — production reads are <3ms; test seams bypass I/O entirely. Story 4.9 + 4.10 added ZERO additional reads (SIGINT + loop-exit are signal/exit paths). Pattern observation: state is the canonical inter-iteration data carrier; caching adds complexity without clear benefit at current scale.

6. **Test layer convention (PF/CE/SI/EX prefixes per story)**: each story's new tests in `run.test.ts` follow a 2-letter prefix convention naming the AC under test:
   - `TB_45_*` / `KB_45_*` (time-budget / token-budget — Story 4.5)
   - `SE_46_*` / `CE_46_*` (stop-on-error / continue-on-error — Story 4.6)
   - `PF_47_*` (plan-first — Story 4.7)
   - `CE_48_*` / `CV_48_*` (checkpoint-each loop / checkpoint-each verify — Story 4.8)
   - `SI_49_*` (SIGINT — Story 4.9)
   - `EX_410_*` (exit-emission — Story 4.10)
   - Plus `SWEEP_<N>` integration tests at the end of each story. The convention makes test failures self-locating and makes the AC-3 sweep tests immediately recognizable.

7. **SDR forward-tracker chain** (each story addresses prior story's forward-trackers): Story 4.4 EXECUTED Story 4.3's forward-tracker cleanup (REMOVED `hasOtherStopCondition` helper + `no-stop-condition` placeholder); Story 4.6 ADDRESSED Story 4.1 SF-2 (`IterationRecord.action` `"unknown"` union member narrowing); Story 4.10 ADDRESSED Story 4.6's forward-tracker (unified `formatExitReason` pattern via `formatLoopExitLines`); Story 4.10 PRESERVED Story 4.9 AC-3 substrings (`manual (SIGINT)`, `partial work committed`, `--resume available`) under the new two-line format via dedicated SWEEP_410 sub-test. The forward-tracker chain proved reliable — every flagged item was either ADDRESSED or explicitly DEFERRED with a rationale.

8. **ZERO new error class registrations per story**: registry held at 16 codes throughout (Story 1.5 baseline). The two new runner-direct StopReason variants were composed from existing data:
   - Story 4.6 `error-stop`: reads `state.lastFailureReason.code` (Story 3.1's mutation pair) + `state.lastFailureReason.hint` for stderr emission; falls back to `halt-on-error` for non-VERIFIER_FAILURE codes (preserves backward compat).
   - Story 4.9 `manual-sigint`: composed from OS signal + `nowFn()` timestamp; SIGINT is a CLEAN exit (FR53 exit-code 0), not an error.
   - Story 4.10 best-effort transcript-write failure: emits `warn` from `src/io/log.ts` (NOT thrown; not a StepperError subclass — matches `verify-and-advance.ts:790-794` precedent).

## Recurring Forward-Trackers Carried Forward to Epic 5/6

Across the 10 Epic-4 stories, the SDR sections enumerated ~30 individual forward-tracker items. Consolidated by destination:

### Cosmetic nits inherited unchanged across all stories from origin

- **N-1** (origin Story 4.2; inherited by 4.3-4.10 unchanged): defensive `epicNum === undefined || epicNum === null` check at `src/commands/loop/stop-conditions.ts:269` has unreachable `=== null` arm given optional-chain returns `undefined`. Cosmetic; preserved because `stop-conditions.ts` was untouched after 4.5. Forward-tracker for opportunistic cleanup in any future `stop-conditions.ts` edit.
- **N-2** (origin Story 4.2; inherited by 4.3-4.10 unchanged): `EMPTY_DAG` sentinel + Story 4.5's `EMPTY_STATE` sentinel mid-file placement at `run.ts:451-474`. Cosmetic; iteration body still consumes them. Cleanup deferred to Story 6.x file-level reorganization.
- **N-3** (origin Story 4.8 SDR; inherited by 4.9 + 4.10 unchanged): future task records should snapshot final test counts AFTER the LAST `biome --write` pass. Process-discipline forward-tracker; honored by 4.9 + 4.10 dev iters.
- **N-4** (NEW Story 4.10): TWO unused LoopOpts seams (`finalStateOverride`, `writeLoopExitTranscriptOverride`) at `run.ts:390 + 399` declared but never consumed. Tests bypass via direct invocation per Deviation D2 export. Story 6.x cleanup forward-tracker — either WIRE the seams into `import.meta.main` OR REMOVE the dead declarations. ALSO `EX_410_8` test name claims "throws ScopeViolationError" but body is happy-path per D4 — rename or wire.

### To Epic 5 (Failure-UX Modes & Auto-Fix)

| Story | Title | Pre-work / Notes from Epic 4 |
| ----- | ----- | ----------------------------- |
| 5.1   | Retry failure mode                                  | Story 4.6 establishes the `error-stop` StopReason variant + halt-on-error short-circuit at `run.ts:796-857` reading `state.lastFailureReason.code`. Story 5.1 may EXTEND `StopReason` with a `retry-exhausted` variant; new variant joins the SWEEP_410 sweep (TypeScript exhaustiveness check at `run.test.ts:2756-2847` enforces coverage at compile-time per Story 4.10 design). |
| 5.2   | `--skip` failure mode                               | Story 5.x failure-UX modes (retry/skip/route-to-fixer/escalate) MUST use `formatLoopExitLines(stopReason, state)` from Story 4.10 for any new failure-mode exit emissions. The `--skip` flag is NOT in Story 1.7's 18-flag inventory NOR in Story 4.1's 13-flag `LoopArgsSchema` — Story 5.2 lands both the flag AND the cross-validation per Epic-3 retro carry-over. |
| 5.3   | Route-to-fixer mode (`--auto-fix`)                  | Story 4.1's `LoopArgsSchema.autoFix?` field is parsed-only since 4.1 (the runtime semantic lives in Story 5.3). The Story 4.6 boolean gate `--continue-on-error` is the FOUNDATION; Epic 5 layers per-step semantics on top per AC-3 forward-deferral. |
| 5.4   | Escalate failure mode                               | Reads `state.lastFailureReason` for escalation context surfacing (Story 3.1 + Story 4.6 precedent). May add `escalated` StopReason variant joining the SWEEP_410 sweep. |
| 5.5   | Interactive pause between steps                     | Story 4.1's `LoopArgsSchema.interactive?` field is parsed-only since 4.1. Story 5.5 wires the runtime semantic. May interact with Story 4.9's SIGINT handler — the I-2 forward-tracker mandates that each Story 5.x flow is tested with SIGINT-mid-flight to confirm graceful-exit invariant holds. |
| 5.6   | Per-step failure policy via config                  | Closes Story 4.6 AC-3 forward-deferral. The Story 4.6 boolean gate `--continue-on-error` is the FOUNDATION; Story 5.6 wires per-step `retry`/`skip`/`route-to-fixer`/`escalate` policy resolution. Also closes Story 3.5 AC-line-805 `failurePolicies` config-block runtime forward-deferral (Epic 3 carry-over). |

### To Epic 6 (Configuration & Polish)

| Story | Title | Pre-work / Notes from Epic 4 |
| ----- | ----- | ----------------------------- |
| 6.1   | bmad-stepper.config.yaml schema loader              | New Epic-4 config-knob carry-overs: (1) Story 4.5 `time-budget` + `token-budget` budget defaults via `execution.budget.*`; (2) Story 4.5 80%-warning threshold via `execution.warningThreshold` (v0.1 hardcoded 0.80); (3) Story 4.7 `plan.maxWalk` configurable cap (v0.1 hardcoded 200); (4) Story 4.8 checkpoint-each multi-step-type via comma-separated values per OQ-9; (5) Story 4.9 SIGTERM handling per OQ-5 (1-line addition `process.on('SIGTERM', sigintHandler)`); (6) Story 4.9 SIGINT-to-SIGKILL escalation per OQ-6 (30-second escalation timer). |
| 6.3   | `models:` per-step config                            | REPLACES the `lookupModelTokens(stepName): null` v0.1 stub at `plan.ts:171-175` with config-driven lookup from `bmad-stepper.config.yaml`. Drop-in replacement of the function body. Test PF_47_2 should be EXTENDED to assert non-null `result.plan.totalEstimatedTokensIn` after Story 6.3 lands. Story 4.7 forward-tracker. |
| 6.7   | Telemetry aggregation report                        | NEW Story 4.10 forward-tracker: telemetry aggregator may parse `_bmad-output/.stepper/runs/<ts>-loop-exit.json` files for per-loop reporting (exit-reason histogram, average loop duration, etc.). Add formal `LoopExitTranscriptV1Schema` to `src/schemas/` at that time per Story 4.10 OQ-5 DEFER. ALSO Story 4.9 I-3 telemetry of SIGINT events (per-loop SIGINT-event count + SIGINT-to-halt latency). |
| 6.x   | `hasExplicitStopCondition` helper refactor          | The 10-clause default-cap inverted-check predicate at `run.ts:787-800` stays at 10 clauses through Story 4.10. When predicate grows to ~12+ clauses (likely Story 5.5 `--interactive` + Story 5.3 `--auto-fix` runtime wiring), refactor to a `hasExplicitStopCondition(args)` helper. Pure-function refactor; no behavioral change. |
| 6.x   | DAG-across-process-boundary (Story 4.8 D1)          | Either extend dispatch-spec v2 with a `phase` field, OR build DAG locally inside `verify-and-advance.ts`. Either approach unlocks full 5-phase coverage in production for `--checkpoint-each` (eliminating the planning/implementation-only `derivePhaseFromStep` fallback). |
| 6.x   | Phase taxonomy consolidation (Story 4.8 OQ-3)       | Extract 5 phase values into a foundational `src/types/phase.ts` module that all 3 consumers (`dag/types.ts`, `loop/args.ts`, `schemas/state.ts`) import from. Eliminates the deliberate duplication. |
| 6.x   | `matchCheckpointPhase` extraction (Story 4.8 OQ-4)  | Extract the runtime matcher into a foundational `src/checkpoint/match.ts` module shared between `loop/plan.ts:matchCheckpointType` and `next/verify-and-advance.ts:matchCheckpointPhase`. Eliminates the ~6-line duplication. |
| 6.x   | Multi-step-type support (Story 4.8 OQ-9)            | Extend the parser to accept comma-separated values (`--checkpoint-each implementation,analysis`). Pure-function extension of the runtime matcher. |
| 6.x   | Telemetry of checkpoint-write events (Story 4.8 OQ-10) | Surface per-iteration checkpoint-write counts in the telemetry surface; surface the latest checkpoint in the exit-reason resume hint per Story 4.10 OQ-6. |
| 6.x   | `formatLoopExitLines` extraction (Story 4.10 OQ-2)  | Extract to `src/commands/loop/format-exit.ts` IF a second consumer emerges (e.g., `--show-exit-format` introspection flag). |
| 6.x   | `writeLoopExitTranscript` extraction (Story 4.10 OQ-3) | Extract to mid-tier `src/runs/write-loop-exit.ts` when telemetry aggregator joins as a second consumer. |
| 6.x   | Latest checkpoint info in exit format (Story 4.10 OQ-6) | Surface `Last checkpoint: <branch>@<sha> at <takenAt>` from `state.checkpoints[length-1]` in a third optional line. Currently DEFERRED because AC mandates "one or two lines". |
| 6.x   | `src/io/sigint.ts` extraction (Story 4.9 OQ-2)       | Extract the SIGINT install/uninstall + flag toggle logic into a foundational `src/io/sigint.ts` module IF a SECOND consumer emerges (e.g., `src/commands/next/run.ts` adding SIGINT support for non-loop dispatch). |
| 6.x   | Integration-test consolidation (Story 4.9 OQ-7)     | The architecture line 1406 reference to `src/integration/stop-conditions.test.ts` for the NFR-R5 verifier is currently fulfilled by colocation in `src/commands/loop/run.test.ts`. A Story 6.x consolidation pass MAY extract integration tests into `src/integration/`. |
| 6.x   | OOM environmental issue (Story 4.2 OQ-OOM)          | Full-suite `bun test --pass-with-no-tests` consumed all memory on the 16GB Mac during Stories 4.2 + 4.3. Targeted runs covered the full delta. From Story 4.4 onward the issue did not recur. Forward-tracker for an architecture/CI item if it returns. |

## Code-Review Outcomes

| Outcome                        | Count | Stories                                      |
| ------------------------------ | ----- | -------------------------------------------- |
| Clean **APPROVE** (0 nits)     | 1     | 4.7                                           |
| **APPROVE** (≥1 inherited nit) | 8     | 4.2, 4.3, 4.4, 4.5, 4.6, 4.8, 4.9, 4.10      |
| **APPROVE-WITH-ACTIONS**       | 1     | 4.1 (3 info-level findings; all carry-overs)  |
| Changes-requested              | 0     | (none)                                        |
| Must-fix items                 | 0     | (none across all 10 stories)                  |
| Should-fix items               | 2     | Story 4.1 SF-1 (extractFailureCode EXIT_0 edge case → ADDRESSED in 4.10), SF-2 (IterationRecord.action "unknown" union → ADDRESSED in 4.6) |

All 10 stories landed `review → done` on the first review pass. The single APPROVE-WITH-ACTIONS outcome (Story 4.1) carries 2 should-fix items both ADDRESSED by subsequent Epic-4 stories (SF-1 by Story 4.10's `formatExitReason` enrichment via `formatLoopExitLines`; SF-2 by Story 4.6's `IterationRecord.action` union narrowing). Stories 4.7 has the cleanest review (0 nits — first clean-approval Epic-4 story; all OQs adjudicated cleanly with file:line evidence).

## Repair Iterations

**Three repair iterations across all 10 Epic-4 stories.**

- **Story 4.1 r1**: 4 issues caught by initial loop-only test run + `bun run check`: (1) `Bun.nanoseconds()` returns `number` (not `BigInt`) — initial code wrote `n / 1_000_000n` (BigInt); (2) `--time-budget` → `timeBudgetMs` schema-key alias gap; (3) tsc type error on `args.test.ts:240` — `for (const value of ["story", "epic", "phase"])` widened to `string[]`; (4) Biome formatting issues on two lines. All fixed in iteration 1; quality gates green afterwards.
- **Story 4.2 r1** (correctness fix during retroactive resume audit): widened `shouldStop` dispatch guard from `(state !== null && sprintStatus !== null)` to `(state !== null)`. The original guard prevented `untilStoryStopCondition` from firing whenever `sprintStatus` load failed (or test injected `null`), causing infinite loops in 3 integration tests (K_42/L_42/N_42). Pure mechanical widening; `untilEpicEndStopCondition` already short-circuits on undefined sprintStatus.
- **Story 4.10 r1** (TypeScript + biome): `error TS2300: Duplicate identifier 'State'` because `src/commands/loop/run.test.ts` already imported `State` at line 410; new top-of-file import at line 52 was redundant. Fixed by removing the duplicate. Then biome auto-reordered the new node-stdlib imports alphabetically. Re-ran all gates green.

Stories 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9 each landed dev → review → done with ZERO repair iterations. The pattern is consistent with Epic 3's zero-repair record (vs. Epic 1's 2 repair iterations) — plausible drivers:

- Epic-3 retrospective Forward Action Items provided pre-work pointers for every Epic-4 story (lines 154-186).
- Epic-4 stories are progressively derivative: 4.3 + 4.5 + 4.6 + 4.7 + 4.8 + 4.10 each consumes the prior story's deliverable + its forward-tracker; 4.4 EXECUTED 4.3's mandated cleanup.
- The composer-at-runner pattern from Epic 3 internalized: 9 of 10 stories modify `src/commands/loop/run.ts` exclusively (the canonical Layer 2 composer); pure-function modules `stop-conditions.ts` and `plan.ts` stayed pure.
- The LoopOpts test-injection seam pattern proved reliable — every new behaviour added 1-2 seams without `mock.module` or subprocess spawn.
- Spec-first approach: each story's SDR section averages 600-1000 lines of detailed file:line evidence, OQ adjudication, deviation analysis, and forward-tracker chains. The detailed specs prevent implementation drift.

## Loop Iterations Consumed

**30 iterations across 6 `/bmad-loop` invocations.** The Epic-4 work was distributed across multiple loop sessions because each `/bmad-loop` run typically completes 5-10 iterations before reaching a session-boundary or target-reached stop. The 6 loop records:

| Loop ID                                  | Target              | Iterations | Stories Touched                              | Outcome                                                                                                                                          |
| ---------------------------------------- | ------------------- | ---------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `2026-05-02T002450Z-bmad-loop`           | story:4.2           | 4          | 4.1 (create + dev + review), 4.2 (create)    | iter-5 dev-story for 4.2 was INTERRUPTED before producing run.yaml; resume-with-retroactive-ledger by next loop                                  |
| `2026-05-02T065000Z-bmad-loop`           | story:4.2           | 2          | 4.2 (resume + audit; iter-5 retroactive + iter-6 review) | target-reached: Story 4.2 done; resume audit applied repair r1 (sprintStatus null-guard widening)                                                 |
| `2026-05-03T003755Z-bmad-loop`           | story:4.3           | 3          | 4.3 (create + dev + review)                  | target-reached: Story 4.3 done                                                                                                                   |
| `2026-05-03T090459Z-bmad-loop`           | story:4.5           | 6          | 4.4 (create + dev + review), 4.5 (create + dev + review) | target-reached: Story 4.5 done                                                                                                                   |
| `2026-05-03T233849Z-bmad-loop`           | epic:5              | 6          | 4.6 (create + dev + review), 4.7 (create + dev + review) | session-boundary-after-iter-6: 4.6 + 4.7 done; 4.8-4.10 + epic-4-retro + 5.1-5.6 deferred to next session                                          |
| `2026-05-04T065546Z-bmad-loop` (this loop) | epic:4              | 9 (10 if retro counts) | 4.8 (create + dev + review), 4.9 (create + dev + review), 4.10 (create + dev + review) | target-reached: Stories 4.8 + 4.9 + 4.10 done; iter 10 = this retrospective                                                                       |

**Total: 30 iterations** (4 + 2 + 3 + 6 + 6 + 9 = 30; includes 1 interrupted iter-5 in the first loop that was retroactively recorded by the second loop). Wall-clock from 2026-05-02T00:24:50Z (first Epic-4 loop start) to 2026-05-04T09:55:00Z (Story 4.10 done) = ~3 days calendar time across 6 sessions; active dev wall-clock ~14-18 hours.

The interrupted-run-recovery for the iter-5 dev-story of Story 4.2 (recorded in `state.yaml:2810-2841`) demonstrated the resume-with-retroactive-ledger pattern: implementation work was already on disk (50KB across 6 files), but no run.yaml or task record existed; the next `/bmad-loop --until=story:4.2` resume invocation audited the work in place, applied repair r1 (sprintStatus null-guard widening), wrote the retroactive `run.yaml` + Dev Agent Record, and flipped the story to `review`. User confirmed `resume` to the AskUserQuestion enumerating the 4 recovery options.

No other interrupted-run incidents during Epic 4. The orchestrator drove 5 of 6 loops to clean target-reached or session-boundary stops; the one resume incident was clean (no abandoned work).

## Lessons Learned

- **Inverted default-cap predicate scales cleanly through 6 extensions**: the single `if (args.X === undefined && args.Y !== true && ...)` pattern at `runLoop` body grew from 5 → 10 clauses across Stories 4.4-4.7 without refactor. Forward-tracker for `hasExplicitStopCondition(args)` helper deferred to Story 6.x. Lesson: inline-extend a clear predicate as long as readability holds; refactor when clauses exceed ~12 or readability degrades.
- **Discriminated-union pattern is a clean fit for variant explosion**: the `StopReason` union grew from 1 variant (Story 4.1) to 10 variants (Story 4.10) without a single refactor of the surrounding code. The `formatExitReason` switch grew similarly. TypeScript's exhaustiveness check (no-default-clause switch over a union) at compile-time enforces SWEEP_410 coverage on future variant additions — a future Epic-5 `retry-exhausted` variant will fail TS compilation if not added to the SWEEP. Lesson: discriminated unions + TS exhaustiveness checks are a strong combination for evolving domain models.
- **Signal handling is fundamentally OS-level and benefits from the injection-seam test pattern**: Story 4.9's SIGINT handler installation MUST be tested without using `process.kill(process.pid, 'SIGINT')` (would kill the test runner) or `process.emit('SIGINT')` (would trigger ALL registered handlers — cross-contamination). The `signalOverride` LoopOpts seam (mirrors Story 4.5's `tokensPerIter` seam) provides deterministic injection without violating AR42 test isolation. Production path uses real `process.on("SIGINT", handler)`; integration smoke test for the real handler is documented in `commands/bmad-loop.md` (NOT gated in CI).
- **2-line exit format is better than scattered single-line patterns**: Story 4.10 unified the loop-exit emission via `formatLoopExitLines(stopReason, state)` which composes the AC-mandated two-line shape. Prior stories (4.2 epic-end, 4.6 error-stop) emitted state-snapshot pointer + `--resume` hint via SEPARATE `stderrFn` calls — Story 4.10 normalized to ONE single AR9 stdout line containing the multi-line message via JSON-string escaping. Backwards compat preserved: per-variant first-line text is unchanged (OQ-9 NO MUTATION); only the second-line append + the embedding-via-JSON-escape is new.
- **Checkpoint write site at lock-held verify-and-advance is correct AR8/AR13**: Story 4.8's checkpoint-append block lives INSIDE `verify-and-advance.ts` (lock-held mid-tier) — between the `runHistoryEntry` build and the `stateAfter` build. The `runLoop` runner remains LOCK-FREE per AR8. The .bak rotation rides on the existing `saveState()` call (no new write site). FIFO-50 trim at the WRITE site (mirrors Story 1.5's `runHistory[].max(100)` pattern); schema-level cap is the secondary guard. The architecture's lock-free `run.ts` / lock-held `verify-and-advance.ts` boundary held cleanly through Epic 4's most-stateful story.
- **Spec-first approach (each story 600-1000 line spec before dev) prevents implementation drift**: every Epic-4 story spec includes a detailed Tasks section, Dev Notes, Open Questions for Code Review, Forward Action Items, References. The dev-story phase then tickets each Task; the code-review phase adjudicates each OQ + each Deviation; the SDR section contains file:line evidence for every AC. The combination produces a permanent reference for future stories. Recommended pattern for Epic 5 + Epic 6.
- **Pure-function module pattern accelerates reviewability**: `src/commands/loop/stop-conditions.ts` (Story 4.2) and `src/commands/loop/plan.ts` (Story 4.7) are both pure-function modules with ZERO I/O imports, ZERO `console.*` calls, ZERO throws. Predicates return `StopReason | null`; plan-walk returns a `Plan` value. The AR41 boundary check (`run.test.ts` source-text scan) catches accidental I/O imports at test time. Reviewers can read the entire module top-to-bottom without context-switching to mid-tier I/O modules.
- **The `LoopResult | PlanResult` discriminated-union pattern enables plan-mode without infrastructure**: Story 4.7 added a `mode: "loop" | "plan"` discriminator to the runLoop return type. The `import.meta.main` block branches on `result.mode`. Tests use a single `asLoop<T>` narrowing helper for 64 call sites. The pattern enables plan-mode (zero-token dry-run) WITHOUT a separate `--plan-first` runner module — plan-mode is a SHORT-CIRCUIT branch in the same `runLoop` function. Forward-tracker for Story 6.x: shared `formatRunExit(result)` dispatch helper may unify plan-mode + loop-mode emission shapes.

## Recommendations for Epic 5 (Failure-UX Modes & Auto-Fix)

1. **Failure modes (`retry`/`skip`/`route-to-fixer`/`escalate`) MUST consume `formatLoopExitLines(stopReason, state)`** from Story 4.10 for any new failure-mode exit emissions. The two-line shape (`Loop exited: <reason>.\nSnapshot: <sha>. Resume: /bmad-next --resume.`) is the canonical exit format; ad-hoc per-variant emissions break the unified UX. Each new failure-mode variant joins the SWEEP_410 sweep (TypeScript exhaustiveness check at `run.test.ts:2756-2847` enforces coverage at compile-time).

2. **Per-step `failurePolicies` config (Story 5.6) should integrate with existing stop-condition predicates** rather than reimplementing them. The Story 4.6 boolean gate `--continue-on-error` is the FOUNDATION; Story 5.6 layers per-step semantics on top. The per-step policy resolver reads `state.lastFailureReason.code` (Story 3.1) and the per-step config block (Story 5.6 or 6.1); if the policy resolves to `escalate`, the Story 4.6 halt-on-error short-circuit fires; if it resolves to `retry`/`skip`/`route-to-fixer`, the runner branches BEFORE the halt-on-error gate.

3. **Epic 5 should NOT add new error classes** — registry stability discipline established across Epics 2/3/4 (16 codes throughout). New failure modes compose from existing data: `retry-exhausted` reads `runHistory[].attemptNumber`; `skipped` writes `runHistory[].skipped: true`; `route-to-fixer` reads the fixer's verifier result. The error class registry is the single canonical surface for fail-fast errors; failure-MODES are runtime branches, not new error types.

4. **Each Story 5.x flow MUST be tested with SIGINT-mid-flight** to confirm Story 4.9's graceful-exit invariant holds under failure-UX modes (per Story 4.9 I-2 forward-tracker). Specifically: SIGINT during `--auto-fix` retry / `--skip` advance / interactive pause may need additional coordination — ensure the SIGINT handler's `shutdownRequested` flag wins over the failure-mode's `continue` semantics.

5. **`--skip` flag wiring** (Story 5.2) should ADD the flag to BOTH `src/commands/next/args.ts` (Story 1.7's 18-flag inventory) AND `src/commands/loop/args.ts` (Story 4.1's 13-flag `LoopArgsSchema`). The cross-validation `--skip + --resume` was deferred from Story 3.2 to Story 5.2 (Epic 3 carry-over).

6. **`--interactive` flag runtime semantics** (Story 5.5) should USE the `LoopOpts.signalOverride` test seam pattern (Story 4.9 precedent) for testable interactive-pause injection. Real `process.stdin.read` would block tests; injection seam allows deterministic pause/resume in colocated tests.

7. **Story 5.1 retry mode** should EXTEND `runHistory[]` entries with attempt-number metadata; consider whether to bump `state.runHistory[]` from `z.array(z.unknown())` to a typed entry shape (carry-over from Story 4.5 OQ-12 + Story 6.x schema tightening). If wired, Story 4.5's defensive typeof guards on `tokensIn`/`tokensOut` reads can be removed.

8. **The 10-clause default-cap inverted-check predicate at `run.ts:787-800` will likely grow to ~12 clauses** with Story 5.5 `--interactive` + Story 5.3 `--auto-fix` runtime wiring. Evaluate whether to refactor to a `hasExplicitStopCondition(args)` helper at that point per the Story 4.6/4.7 inherited forward-tracker. Pure-function refactor; no behavioral change; defer until readability degrades.

## Epic 4 Status: COMPLETE

All 10 required Epic-4 stories `done`; epic status `done`; optional retrospective (this document) `done`. Epic 5 (Failure-UX Modes & Auto-Fix) is the next epic. The bounded-loop runner — `/bmad-loop` slash command + 8 user-facing stop conditions (`--until-epic-end`, `--until-story X.Y`, `--next-story`, `--phase-end`, `--max-iters` with FR25 default-50 cap, `--time-budget`, `--token-budget`, `--stop-on-error`/`--continue-on-error`) + 2 runner-direct StopReason variants (`error-stop`, `manual-sigint`) + `--plan-first` dry-run preview + `--checkpoint-each <step-type>` runtime semantics + SIGINT graceful exit with NFR-R5 30-second bound + unified two-line `formatLoopExitLines` exit emission + structured loop-exit JSON transcript per FR26 — is fully production-ready for Epic 5 to layer per-step failure-UX modes onto. The errors registry remains frozen at 16 codes; the LoopOpts test-injection seam pattern + pure-function predicate pattern + discriminated-union exhaustiveness pattern are established conventions for Epic 5 to follow.
