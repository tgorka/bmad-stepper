---
status: done
artifact_type: retrospective
epic: '2'
epic_title: Single-Step Advance with Sub-Agent Dispatch
created: '2026-05-01'
last_updated: '2026-05-01'
storiesCompleted: 8
storiesRange: '2.1 through 2.8'
loopId: 2026-05-01T053000Z-bmad-loop
runId: 2026-05-01T091500Z-bmad-next
loopIteration: 21
persona: bmad-retrospective
---

# Epic 2 Retrospective: Single-Step Advance with Sub-Agent Dispatch

## Summary

Epic 2 wires the dispatch-then-verify loop end-to-end and ships the canonical `/bmad-next` slash command. After Epic 1 closed the foundational primitives (errors registry, lock + state + schemas + migrations + DAG + personas + doctor command), Epic 2 lands every remaining piece needed to advance one BMAD step from a slash command invocation: the higher-tier verifier registry (Story 2.1), the higher-tier dispatch-spec generator + AR9 stdout emitter + orphan-staging cleanup (Story 2.2), the canonical Layer 3 sub-agent definition `bmad-step-runner.md` (Story 2.3), the lock-free pre-dispatch runner `run.ts` (Story 2.4), the markdown transcript + JSON run-log writers (Story 2.5 — shipped as `src/runs/` per dev-001 directory rename), the lock-acquiring post-dispatch runner `verify-and-advance.ts` with state-hash TOCTOU check + atomic promote (Story 2.6 + new `src/dispatch/promote.ts`), the Layer 1 `commands/bmad-next.md` orchestrator that composes Bash → AR9 → Task → Bash → summary (Story 2.7), and the canonical end-to-end smoke test in `src/smoke/next.test.ts` plus the NFR-S2 enforcement smoke in `src/integration/no-write-outside-scope.test.ts` (Story 2.8). All three layers (Layer 1 markdown, Layer 2 TypeScript, Layer 3 sub-agent) are now exercised by an automated regression-coverage smoke. The errors registry held at 16 codes throughout the epic.

## Sprint Metrics

| Metric                                      | Value                                                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Stories completed                           | 8 (2.1 → 2.8) — all `done`                                                                                  |
| Test-suite growth (epic start → end)        | 311 (epic-1 baseline) → **526 pass / 0 fail / 1881 expect() / 47 files**                                     |
| Per-story baseline progression              | 311 → 354 (2.1) → 409 (2.2) → 409 (2.3 markdown-only) → 441 (2.4) → 475 (2.5) → 523 (2.6) → 523 (2.7 markdown-only) → 526 (2.8) |
| Net Epic 2 test growth                      | **+215 tests / +720 expects / +15 files** vs. epic-1 final (311 / 1161 / 32) — but +117 tests / +393 expects / +12 files since Story 2.2 baseline (when first higher-tier module landed) |
| New higher-tier modules                     | 3 (`src/verifiers/`, `src/dispatch/`, `src/runs/`) — all AR41 sibling-independent                            |
| New top-tier composers                      | 1 verify-and-advance runner (`src/commands/next/verify-and-advance.ts`) + Story 2.4's lock-free runner (`src/commands/next/run.ts`) |
| New schemas (foundational)                  | 1 (`src/schemas/dispatch-protocol.ts`) — discriminated union for AR9 stdout                                  |
| New Layer 3 sub-agent                       | 1 (`agents/bmad-step-runner.md`)                                                                            |
| New Layer 1 markdown                        | 1 body replaced (`commands/bmad-next.md` placeholder → 270-line orchestrator)                                |
| New `src/smoke/` directory                  | First canonical occupant `src/smoke/next.test.ts` (Story 2.8)                                                |
| Errors registry stability                   | **16 codes throughout** — Story 2.6 wired the FIRST throw site for the pre-registered `StateChangedDuringDispatchError` (slot 9); no new class registrations |
| Repair iterations total                     | **0** across 8 stories (zero re-dispatches; every story landed in dev → review → done in one pass)           |
| Code-review outcomes                        | **6 APPROVE** (2.1, 2.3, 2.4, 2.5, 2.7, 2.8) + **2 APPROVE-WITH-ACTIONS** (2.2, 2.6) — 0 changes-requested  |
| Loop iterations consumed (Epic 2)           | **21 iterations** in `/bmad-loop` (loopId `2026-05-01T053000Z-bmad-loop`); iters 1-20 covered Stories 2.1-2.8 + interstitial tasks; iter 21 is this retrospective |
| `bun run check` release-blocker gate        | Exit 0 every story; final 526 pass / 0 fail / 1881 expect() / 47 files / ~1790 ms                            |
| Documented dev deviations                   | 19 across 8 stories (3 of 19 directory/architecture-doc patches; remainder design-time deferrals)            |

## Stories Completed

| #   | Story                                                | FR / NFR / AR Coverage                                                       | New Source Files                                                                                  | Test Δ                                  | Review                       | Repairs |
| --- | ---------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------- | ---------------------------- | ------- |
| 2.1 | Verifier Configuration & Registry                    | FR17, FR38; NFR-M3, NFR-S6, NFR-R1, NFR-S1; AR21, AR22, AR33, AR41           | `src/verifiers/{index,types,registry,defaults,checks}.ts` (5 src) + 3 tests (43 cases)           | +43 tests / +218 expects / +3 files     | approve (0/0/0/4 info)       | 0       |
| 2.2 | Dispatch Spec Generator                              | FR16, FR18, FR54; NFR-P3, NFR-S4, NFR-S6, NFR-R1, NFR-S1, NFR-M3; AR7, AR9, AR21, AR22, AR33, AR41 | `src/dispatch/{index,types,generate-spec,emit,staging-cleanup}.ts` (5 src) + `src/schemas/dispatch-protocol.ts` (NEW schema) + 4 tests; `src/io/paths.ts` extended (`STAGING_PATH`) | +55 tests / +109 expects / +4 files     | approve-with-actions (0/0/1/3) | 0       |
| 2.3 | Generic Sub-Agent (`bmad-step-runner.md`)            | FR16, FR17; NFR-S4, NFR-S6, NFR-S2; AR7, AR16, AR41                          | `agents/bmad-step-runner.md` (Layer 3, ~155 lines) + `tests/fixtures/bmad-step-runner/` (3 fixture files) | 0 (markdown-only)                       | approve (0/0/0/2 info)       | 0       |
| 2.4 | Lock-Free `run.ts` for `/bmad-next`                  | FR1, FR8-FR16, FR18, FR53, FR54; NFR-P1, NFR-P3, NFR-S1, NFR-S4, NFR-S5, NFR-R1, NFR-R4, NFR-M3; AR7, AR8, AR9, AR21, AR22, AR33, AR41 | `src/commands/next/run.ts` (~700 lines) + `run.test.ts` (27 tests); 3 modified files (next/index barrel, dispatch/generate-spec extended w/ contextRefs+requiredSections, dispatch/generate-spec.test.ts +5) | +32 tests / +86 expects / +1 file       | approve (0/0/0/4 info)       | 0       |
| 2.5 | Markdown Transcript + JSON Run-Log Writers           | FR18, FR32, FR43, FR44, FR46, FR54; NFR-P4, NFR-S2, NFR-S5, NFR-R1, NFR-Sc4, NFR-M3; AR21, AR22, AR25, AR26, AR33, AR41 | `src/runs/{index,types,build-run-log,render-markdown,write-step}.ts` (5 src) + 3 tests (34 cases) — **dev-001 directory rename `src/transcript/` → `src/runs/`** | +34 tests / +102 expects / +3 files     | approve (0/0/0/3 info)       | 0       |
| 2.6 | `verify-and-advance.ts` with State-Hash Check        | FR1, FR5, FR16, FR17, FR18, FR32, FR43, FR44, FR46, FR53, FR54; NFR-P3, NFR-P4, NFR-S1, NFR-S2, NFR-S4, NFR-S5, NFR-R1, NFR-R4, NFR-M3; AR8, AR9, AR11, AR12, AR21, AR22, AR25, AR26, AR33, AR41 | `src/commands/next/verify-and-advance.ts` (~622 lines) + `src/dispatch/promote.ts` (~210 lines) + 2 tests (20 + 15 = 35 cases); 4 modified files (dispatch/index barrel, next/index barrel, args.ts +199 lines for `parseVerifyAndAdvanceArgs`, args.test.ts +15 cases) | +48 tests / +164 expects / +2 files     | approve-with-actions (0/0/1/3) | 0       |
| 2.7 | Slash Command for `/bmad-next` (Layer 1 Markdown)    | FR1, FR16, FR17, FR18, FR32, FR46, FR53, FR54; NFR-S2, NFR-S4, NFR-R1, NFR-R4; AR7, AR8, AR9, AR16, AR21, AR22, AR41 | `commands/bmad-next.md` body REPLACED (11-line placeholder → 270 lines) — frontmatter preserved with one minor edit (drop "(placeholder)" suffix) | 0 (markdown-only)                       | approve (0/0/0/0)            | 0       |
| 2.8 | Smoke Test for `/bmad-next` Happy Path               | FR1, FR16, FR17, FR18, FR53, FR54; NFR-S2, NFR-S5, NFR-R1, NFR-I5, NFR-M1; AR8, AR9, AR25, AR26, AR33, AR35, AR41 | `src/smoke/next.test.ts` (FIRST occupant of `src/smoke/`; 2 tests, 377 lines) + `src/integration/no-write-outside-scope.test.ts` (1 test, 252 lines) + `tests/fixtures/minimal-bmad-project/{_bmad/config.yaml, README.md}` | +3 tests / +41 expects / +2 files       | approve (0/0/0/0)            | 0       |

## Test Growth

```
Story 1.13 final (epic-1 close):  311 pass / 0 fail / 1161 expect() /  32 files
Story 2.1 (verifier registry):    354 pass / 0 fail / 1379 expect() /  35 files  (+43 tests / +218 expects / +3 files)
Story 2.2 (dispatch generator):   409 pass / 0 fail / 1488 expect() /  39 files  (+55 tests / +109 expects / +4 files)
Story 2.3 (sub-agent — markdown): 409 pass / 0 fail / 1488 expect() /  39 files  (no delta)
Story 2.4 (lock-free run.ts):     441 pass / 0 fail / 1574 expect() /  40 files  (+32 tests / +86 expects / +1 file)
Story 2.5 (transcript writers):   475 pass / 0 fail / 1676 expect() /  43 files  (+34 tests / +102 expects / +3 files)
Story 2.6 (verify-and-advance):   523 pass / 0 fail / 1840 expect() /  45 files  (+48 tests / +164 expects / +2 files)
Story 2.7 (Layer 1 — markdown):   523 pass / 0 fail / 1840 expect() /  45 files  (no delta)
Story 2.8 (smoke + NFR-S2):       526 pass / 0 fail / 1881 expect() /  47 files  (+3 tests / +41 expects / +2 files)

Net Epic 2 growth (since Story 2.2 baseline): +117 tests / +393 expects / +12 files.
Net Epic 2 growth (since epic-1 close):       +215 tests / +720 expects / +15 files.
```

Per-story patterns:
- Stories 2.3 + 2.7 are markdown-only and ship zero TS deltas (matches Story 1.13 precedent for documentation-only).
- Stories 2.4 + 2.6 are L-effort runner-tier integrations and produced the largest single-story test deltas (+32 and +48 respectively).
- Story 2.8 is a test-only deliverable but adds only 3 tests because each test is a heavy `Bun.spawn` end-to-end exercise (not a unit case).

## Source Files Added

### Foundational tier (1 new file)
- `src/schemas/dispatch-protocol.ts` (Story 2.2) — discriminated union Zod schema for AR9 stdout JSON line (`action: "dispatch" | "report" | "halt"`). NEW schema slot per architecture line 1676 deferred-from-step-06.

### Foundational tier extension (1 modified file)
- `src/io/paths.ts` (Story 2.2) — added `STAGING_PATH` constant per Story 2.1 dev-002 carry-over.

### Mid-tier (3 modules — observability)
- `src/runs/{index,types,build-run-log,render-markdown,write-step}.ts` (Story 2.5) — markdown transcript + JSON run-log writer pair. **Directory renamed from `src/transcript/` per Story 2.5 dev-001** (architecture-doc references at lines 1212-1217 + 1373-1374 + 1393 + 1478 are stale; carry-over for architecture-doc patch).

### Higher-tier (3 modules — composition surfaces)
- `src/verifiers/{index,types,registry,defaults,checks}.ts` (Story 2.1) — verifier registry + 8 default per-step configs (`prd`, `architecture`, `story-create`, `dev-story`, `code-review`, `retro`, `analyst-research` + `default` baseline) + `runVerifier(runId, opts)` orchestrator. **First higher-tier module of the project.**
- `src/dispatch/{index,types,generate-spec,emit,staging-cleanup}.ts` (Story 2.2) — dispatch-spec generator + AR9 stdout emitter + orphan-staging cleanup. **Second higher-tier module.**
- `src/dispatch/promote.ts` + `src/dispatch/promote.test.ts` (Story 2.6) — atomic copy + completion-marker writer per architecture §line 1178 (Story 2.2 deferral closure).

### Top-tier (2 new runners)
- `src/commands/next/run.ts` (Story 2.4) + `run.test.ts` (27 tests) — lock-free pre-dispatch runner. **First end-to-end runner of the project** composing parseNextArgs + cleanStagingOrphans + loadStateUnlocked + build + resolvePersona + buildDispatchSpec + emitDispatchAction.
- `src/commands/next/verify-and-advance.ts` (Story 2.6) + `verify-and-advance.test.ts` (20 tests) — lock-acquiring post-dispatch runner. **First lock-acquiring runner of the project**; **first canonical caller of `writeStepTranscript`**; **first throw site of `StateChangedDuringDispatchError`** (registry slot 9 was reserved during Story 1.5).
- `src/commands/next/args.ts` extended (+199 lines for `parseVerifyAndAdvanceArgs`).

### Layer 3 (1 sub-agent definition)
- `agents/bmad-step-runner.md` (Story 2.3) — canonical generic sub-agent for v0.1. **First Layer 3 deliverable.** Frontmatter `name: bmad-step-runner` binds to Story 2.2's `emitDispatchAction({agent: "bmad-step-runner", ...})` literal and Story 2.4's `STEP_RUNNER_AGENT` constant.

### Layer 1 (1 markdown body replaced)
- `commands/bmad-next.md` (Story 2.7) — Layer 1 orchestrator body REPLACED (11-line placeholder → 270-line canonical orchestrator covering Bash → AR9 parse → Task dispatch → token capture → Bash → summary).

### Integration / smoke / fixtures (Story 2.8)
- `src/smoke/next.test.ts` — first canonical occupant of `src/smoke/` per architecture §line 1249 (377 lines, 2 tests).
- `src/integration/no-write-outside-scope.test.ts` — canonical NFR-S2 enforcement smoke per architecture §line 1245 + §line 1396 (252 lines, 1 test).
- `tests/fixtures/minimal-bmad-project/_bmad/config.yaml` + `README.md` — minimal pre-baked fixture (only `bmm.project_name` + README; everything else materialized at test time per AC line 711).
- `tests/fixtures/bmad-step-runner/dispatch-spec.json` + `inputs/topic.md` + `README.md` (Story 2.3) — Layer 3 manual smoke fixture (dev-iteration scaffolding; Story 2.8 is the canonical CI gate).

## Errors Registry Status

**16 codes throughout Epic 2** — held stable since Story 1.5.

The pre-registered `StateChangedDuringDispatchError` (slot 9, registered during Story 1.5 schema-skeleton work per architecture Critical Gap Resolution 3 line 1674) finally got its first throw site in Story 2.6's `compareStateHashes` TOCTOU check at `src/commands/next/verify-and-advance.ts:471`. No new error class registration across the epic. Two evaluations of `hintOverride?` extensions were deferred:
- Story 2.1: `VerifierConfigError` for project-config override resolver — deferred to Story 6.5 (per epic-1-retrospective forward action item).
- Story 2.6: state-hash mismatch hint — uses registry-default verbatim per AC-3; no override needed.

The `errors.test.ts` registry CI gate (10 tests / 197 expects) trivially passed at every story.

## Review Outcomes

| Outcome                          | Count | Stories                                                                  |
| -------------------------------- | ----- | ------------------------------------------------------------------------ |
| Clean **APPROVE** (0 findings)   | 6     | 2.1, 2.3, 2.4, 2.5, 2.7, 2.8                                             |
| **APPROVE-WITH-ACTIONS** (≥1)    | 2     | 2.2 (1 nit + 3 info), 2.6 (1 nit + 3 info)                                |
| Changes-requested                | 0     | (none)                                                                   |

All 8 stories landed `review → done` on the first review pass. The two approve-with-actions outcomes both stem from the same precedent — empty/error hint strings using verbs other than the four canonical `Run/See/Try/Check` (`Add`, `Pass`, `Configure`) — which slips through the `errors.test.ts` registry CI gate because that gate only validates registry-default `actionableHint` strings, NOT per-instance `hintOverride` strings. Carry-over to Story 6.x (extend the registry CI gate to exercise `hintOverride` paths OR ratify additional canonical verbs).

## Repair Iterations

**Zero repair iterations across all 8 Epic 2 stories.** Every story progressed `bmad-create-story → bmad-dev-story → bmad-code-review → done` in a single dispatch sequence per story. The bmad-create-story → bmad-dev-story handoff produced reviewable artifacts on the first dev pass for every story, and bmad-code-review never required a re-dispatch.

This is a meaningful improvement vs. Epic 1's 2 repair iterations (Stories 1.5 default-`schemaVersion`-injection; Story 1.10 AC-2 fixture-cycle through seed). Plausible drivers:
- Tighter story specs (dev notes explicitly call out forward-deps + carry-overs + dev-001-style deferrals up front).
- Strictly-additive scope discipline carried through every story.
- Composer-at-runner pattern internalized (mid-tier modules stayed pure; runner-tier composition surfaces emerged at Story 2.4 / 2.6 cleanly).

## Documented Deviations

19 dev-time deviations across 8 stories — every one adjudicated `accept` or `accept-with-followup` at code-review. None blocked promotion. Categorized:

### Architecture-doc / directory naming patches (3)
- **Story 2.5 dev-001** (HIGH RIPPLE): directory rename `src/transcript/` → `src/runs/` per dispatch-time `declaredMutationScope.allowedPaths`. Public surface contract preserved verbatim. Carry-over for Stories 2.6 / 2.8 / 3.8 / 3.9 / 3.10 / 5.x / 6.7 / 6.8 import-path substitution and an architecture-doc cross-reference patch (lines 1212-1217 + 1373-1374 + 1393 + 1478). Story 2.6 + Story 2.8 already absorbed the rename without issue.
- **Story 2.1 dev-001** (file layout): consolidated `src/verifiers/checks/` subdirectory into a single `src/verifiers/checks.ts` (5 src files vs spec's 9). Public surface preserved via `index.ts` barrel.
- **Story 2.3 Info-1** (story-spec internal annotation drift): story-spec line 394 described Story 2.2's `taskSpec.constraints.allowedTools` v0.1 default as 4 tools; the actual `src/dispatch/generate-spec.ts:178` default is 5. No code change required; flagged for spec-text update if regenerated.

### v0.1 conservative simplifications deferred to Story 6.x (8)
- **Story 2.1 dev-002** + **Story 2.6 dev-002**: `runVerifier` takes REQUIRED `stagingRoot`; the polish PR that lets it default via `STAGING_PATH` + read `dispatch-spec.json` directly is deferred to Story 6.x.
- **Story 2.2 dev-001** + **Story 2.4 dev-003**: `phase` field NOT in `DispatchSpecV1Schema`; passed as optional input on `BuildDispatchSpecInput` and lands in human-readable `taskSpec.task` text only. Deferred to Story 6.x DispatchSpecV2 schema bump.
- **Story 2.6 dev-001**: state-hash uses **Option A** (epic+story tuple comparison) instead of architecture-line-1673 SHA-256 spec. Carry-forward to Story 6.x DispatchSpecV2 (`stateHash` field). Story 2.4 dev-003 is the same carry-forward (write-side computation).
- **Story 2.6 dev-003**: `derivePhaseFromStep` uses a 17-entry hardcoded lookup table; canonical resolution lives in DAG but runner-tier deliberately avoids transitive coupling. Closes once Story 6.x DispatchSpecV2 adds `phase` to dispatch-spec.
- **Story 2.6 dev-004**: lock-contention test in `verify-and-advance.test.ts` skips when Story 2.4's `mock.module` has poisoned the global module registry (Bun's `mock.module` is process-global). Workaround: feature-check `typeof handle.release === "function"`. Followup: Story 2.4 should call `mock.restore()` in `afterEach` OR Story 6.x should refactor the lock module to context-object DI.
- **Story 2.4 dev-002**: next-step computation uses simple two-mode model (entry-points OR after[]-includes-lastStep) instead of full transitive completion. Carry-forward to Stories 3.6/3.7 (`--explain` / `--list`).

### Defence-in-depth refinements (1)
- **Story 2.5 dev-002**: explicit `assertWithinScope(runsRoot)` between schema-parse and `fs.mkdir` (so canonical `ScopeViolationError` surfaces before EACCES would mask it). Sound architectural improvement; accepted without followup.

### Test-strategy deviations (5)
- **Story 2.5 dev-003** + **Story 2.3 (multiple)**: skipped manual smoke tasks where colocated tests provide equivalent coverage (avoids tmpdir pollution).
- **Story 2.8 dev-001**: smoke asserts on `## State delta` heading instead of story-spec's `## State Before` / `## State After` — the actual emitter at `src/runs/render-markdown.ts:109-110` emits a single `## State delta` section. Smoke must assert on actual emitter output. Carry-over: optional Story 6.x renderer-config mode if downstream tooling depends on the legacy heading.
- **Story 2.8 dev-002**: smoke seeds minimal cold-start `state.yaml` in `beforeEach` (per `run.test.ts:52-64` precedent) because `loadStateUnlocked` throws `CorruptStateError` when state is missing. The fixture itself remains state-free per AC line 711 (only `_bmad/config.yaml` pre-baked); the seed lives in the tmpdir copy only. Surfaces a v0.1 cold-start UX friction (carry-over to Story 6.x: auto-bootstrap state on first invocation OR explicit `/bmad-init` slash command).
- **Story 2.8 dev-003**: NFR-S2 walk filters Bun spawn-time HOME-cache prefixes (`Library/Caches/bun/`, `.bun/`, `.cache/`) as infrastructure noise from the `HOME: tmp` override (consistent with `doctor-marketplace.test.ts:95` precedent for `~/.claude` isolation).
- **Story 2.3 (AR35 Layer 3 deviation)**: Layer 3 sub-agent cannot be exercised by `bun test` (no live Claude API); manual fixture + Story 2.8 end-to-end smoke jointly satisfy AC-4.

### AR22 hint-prefix overrides (2 — same pattern, two stories)
- **Story 2.2 Nit-1** + **Story 2.4 AR22 PARTIAL**: `hintOverride?` strings using `Add` / `Pass` / `Configure` instead of the four canonical `Run/See/Try/Check` verbs. Aligned with Story 1.11 precedent (`Add a persona for...`). Slips through `errors.test.ts` registry CI gate because the gate only validates registry-default hints, not per-instance overrides. Carry-over to Story 6.x (extend gate OR ratify additional verbs).

## Loop Iterations Consumed

**21 iterations** in `/bmad-loop` (loopId `2026-05-01T053000Z-bmad-loop`). Approximate distribution:
- Iters 1-2: Story 2.1 dev-story + code-review (created in epic-1 closure loop).
- Iters 3-4: Story 2.3 (FIRST in this loop's epic-2 cohort — Story 2.2 was created in epic-1 closure).
- Iters 5-6: Story 2.2 dev-story + code-review.
- Iters 6-9: Story 2.4 create-story + dev-story + code-review.
- Iters 9-11: Story 2.5 create-story + dev-story + code-review.
- Iters 12-14: Story 2.6 create-story + dev-story + code-review.
- Iters 15-17: Story 2.7 create-story + dev-story + code-review.
- Iters 18-20: Story 2.8 create-story + dev-story + code-review.
- **Iter 21 (this retro)**: epic-2-retrospective.

No sub-agent stream-idle interruptions and no abandon-on-reentry sequences (vs. Epic 1's 1 such incident on Story 1.9 create-story). The orchestrator drove the full epic from clean checkpoint to complete `epic-2: done` without intervention.

## Forward Action Items for Epic 3

Recommended planning notes for the next epic. Order reflects dependency / risk surfacing.

| Story | Title                                                | Pre-work / Notes                                                                                                                                            |
| ----- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1   | Record `last_attempted` / `last_failure_reason` on Halt | Enhances Story 2.6's halt branches with the canonical `lastAttempted` + `lastFailureReason` fields per FR5. Story 2.6 v0.1 sets `lastAttempted: null` on success per epic-3 ratification; 3.1 lands the recording on halt paths. |
| 3.2   | `--resume` flag                                       | Re-uses Story 2.6's `runVerifyAndAdvance` runner; resume context constructed from `state.lastAttempted` (3.1's deliverable). FIRST consumer of the new state field. |
| 3.3   | `--dry-run` flag                                      | Story 2.4 already ships a v0.1 `--dry-run` stub (writes the spec but emits `action: "report"` instead of `action: "dispatch"`). Story 3.3 may ratify or extend the v0.1 implementation. |
| 3.4   | `--step <id>` and `--scope` flags                     | Story 2.4 already ships `--step` (verified by Story 2.8 smoke). `--scope` (cross-cuts epic + story) is the NEW surface; closes Story 2.4 Info-2 (`args.epic` + `args.story` no-ops). |
| 3.5   | `--persona` override + `--include-optional` / `--no-optional` | Story 2.4 already ships `--persona` + the `--include-optional` / `--no-optional` mutual-exclusion check. Story 3.5 may ratify or extend.                  |
| 3.6   | `--explain` reasoning trace                           | Story 2.4 ships a v0.1 stub (`action: "report"` with current-next-step prefix + Story 3.6 deferral hint). Story 3.6 lands the full reasoning trace + closes Story 1.10 N1 carry-over (`tarjan.ts → sort.ts` rename). |
| 3.7   | `--list` candidate next-steps                         | Story 2.4 ships a v0.1 enumeration; Story 3.7 enhances with full preconditions output + transitive-completion model (closes Story 2.4 dev-002).             |
| 3.8   | `--diff-state` and `--export-state`                   | Story 2.4 ships v0.1 stubs. Both consume Story 2.5's JSON run-log files as canonical state-history source. **CRITICAL: import path `src/runs/`, NOT architecture-doc's `src/transcript/`** (per Story 2.5 dev-001). |
| 3.9   | `--watch` live transcript tail                        | Story 2.4 ships a v0.1 `halt` stub. NEW deliverable: `src/runs/watch.ts` (NOT `src/transcript/watch.ts` — per Story 2.5 dev-001 directory rename). Architecture-doc reference at line 1213 is stale. |
| 3.10  | Non-locking read flags                                | Story 2.4 ships `--export-state` v0.1 stub. May be a hardening/audit pass over the entire `--*` flag set after 3.1-3.9 land.                              |

**Recommended planning sequence:**

1. **Front-load Story 3.1** (`last_attempted` field on halt) — every other Epic 3 story consumes this state field. Story 2.6 v0.1 sets `lastAttempted: null` on success per the epic-3 ratification carry-over.
2. **Sequence Story 3.2 (`--resume`) immediately after 3.1** — resume context constructed from `state.lastAttempted`.
3. **Allocate review iteration budget for Story 3.6 + 3.7** — both replace Story 2.4's deferred-stubs and require careful AR22 hint propagation.
4. **Substitute `src/runs/` for `src/transcript/` in Stories 3.8 / 3.9 / 3.10 specs** before drafting (Story 2.5 dev-001 directory rename).
5. **Consider an architecture-doc patch PR before Epic 3 starts** to align prose at lines 1212-1217 + 1373-1374 + 1393 + 1478 with the shipped `src/runs/` directory (or ratify `src/transcript/` as an alias). Reduces friction for every Epic 3 dev-story.

**Cross-epic carry-overs that surface in Epic 3:**

- Story 6.x carry-overs from Epic 2 are independent of Epic 3 (DispatchSpecV2 schema bump for `stateHash` + `phase`; `runVerifier` polish; cold-start state initialization; markdown-section renaming; `mock.module` cleanup; AR22 verb ratification or registry CI gate extension).
- Stories 5.* (failure-UX modes) consume Story 2.6's `VerifierResult` shape; they land in Epic 5, not Epic 3.

## Lessons Learned

### What worked well

- **Strictly-additive scope across every story.** Stories 2.1, 2.3, 2.5, 2.7, 2.8 each shipped only new files (zero existing-file modifications outside the explicit barrel/extension carry-over closures in 2.2 + 2.4 + 2.6). Each story's `git diff --stat` matched the pre-declared mutation scope exactly.
- **AR41 boundary discipline: 100% across 8 stories.** Higher-tier modules (`src/verifiers/`, `src/dispatch/`, `src/runs/`) never imported from sibling higher-tier modules. Top-tier composers (`src/commands/next/run.ts`, `src/commands/next/verify-and-advance.ts`) owned the cross-tier wiring. The composer-at-runner pattern proven in Story 1.12's doctor extended cleanly.
- **Errors registry stability: 16 codes throughout the entire epic.** No new error class registrations. The pre-registered `StateChangedDuringDispatchError` (slot 9 from Story 1.5) finally got its first throw site in Story 2.6 — exactly as the architecture intended. No `hintOverride?` extensions needed at any new throw site.
- **Lock-free contract verified at compile-time AND runtime.** Story 2.4's `runNext` provably never imports from `src/lock/` (Grep + AR41 boundary check) AND provably never invokes `acquire()` at runtime (mock-spy assertion). Story 2.6's complementary lock-acquiring runner verified via the inverse pattern: `acquire()` called exactly once, `release()` in finally on every exit path.
- **Triple-binding integrity (AR9 emit ↔ frontmatter `name:` ↔ Task argument) closed end-to-end.** Story 2.2's `agent: "bmad-step-runner"` literal at `emit.ts:48` ↔ Story 2.3's `name: bmad-step-runner` at `agents/bmad-step-runner.md:2` ↔ Story 2.4's `STEP_RUNNER_AGENT = "bmad-step-runner"` constant ↔ Story 2.7's body reads `<jsonLine.agent>` at runtime (not hardcoded) ↔ Story 2.8 asserts `dispatchAction.agent === "bmad-step-runner"`. Five-way coupling, all coherent.
- **Zero repair iterations across 8 stories.** Tighter story specs (with explicit forward-dep + carry-over + dev-001-style deferral discipline up front) produced reviewable dev-pass artifacts every time. Improvement over Epic 1's 2 repairs.
- **First-attempt clean APPROVE for 6 of 8 stories.** Approve-with-actions outcomes (2.2 + 2.6) both reduced to a single shared nit (AR22 verb-prefix on `hintOverride` strings) — same pattern, deferred to Story 6.x.
- **Mock-Task substitution as a Layer-2-only smoke pattern.** Story 2.8's smoke writes the expected sub-agent artifact directly to `staging/<runId>/outputs/<step>.md` (the architecture-prescribed pattern per §line 1265 — Layer 2 forbidden from `Task`). The verifier doesn't know whether a real Layer 3 sub-agent or a test mock produced the file. This is the canonical pattern Stories 4.1 / 5.1-5.4 / 4.2-4.6 will reuse.
- **Minimal-fixture composition style (architectural preference per §line 1550).** Story 2.8's `tests/fixtures/minimal-bmad-project/` ships ONLY `_bmad/config.yaml` + `README.md`; everything under `_bmad-output/` materializes at test time. Contrasts with Story 2.3's heavy `tests/fixtures/bmad-step-runner/` (heavy fixture is the exception, sanctioned for Layer-3-isolation testing).
- **Defence-in-depth Zod parsing at every schema boundary.** `DispatchSpecV1Schema.parse()` BEFORE atomic-write of `dispatch-spec.json` (Story 2.2); `DispatchActionV1Schema.parse()` BEFORE stdout JSON-line emit (Story 2.2); `VerifierResultV1Schema.parse()` BEFORE atomic-write of `verifier-result.json` (Story 2.1); `RunLogV1Schema.parse()` BEFORE atomic-write of run-log JSON (Story 2.5). Schema drift caught before hitting disk.

### What could improve

- **Story 2.5 directory rename (`src/transcript/` → `src/runs/`) created a multi-story carry-over.** The dispatch-time `declaredMutationScope.allowedPaths` chose `src/runs/` instead of the story-spec's `src/transcript/`. The rename was sound (no source contract changed; public surface preserved verbatim) but architecture-doc references at four locations are now stale. Stories 2.6 and 2.8 absorbed the substitution without issue, but Stories 3.8 / 3.9 / 3.10 / 5.x / 6.7 / 6.8 will all need import-path substitution. **Recommendation**: an architecture-doc patch PR before Epic 3 starts to align prose with shipping artifact (or ratify `src/transcript/` as an alias).
- **Story 2.6 `mock.module` global state interference** between Story 2.4's lock-free invariant test (`mock.module("../../lock/lock.ts", ...)`) and Story 2.6's lock-contention test. Workaround landed (feature-check `typeof handle.release === "function"` and skip cleanly), but the canonical fix is `mock.restore()` in Story 2.4's `afterEach`. Carry-over to Story 6.x.
- **Long story files (5 of 8 stories > 700 lines).** Stories 2.4 (1119L), 2.6 (1351L), 2.8 (957L), 2.5 (951L), 2.7 (901L), 2.2 (972L), 2.3 (687L), 2.1 (725L). Each story's deliberate exception is documented inline (first L-effort runner, first lock-acquiring runner, etc.), but the epic-1-retrospective < 600-line guidance was effectively suspended for Epic 2. Story 2.6 at 1351 lines is now the project's longest story file.
- **Cold-start state.yaml UX friction surfaced in Story 2.8 dev-002.** A brand-new project has no `state.yaml`; the runner halts with `"Run /bmad-next --recompute-state to rebuild the cache from project files."`. The hint is actionable per AR22, but a future `/bmad-init` (or auto-bootstrap on first `/bmad-next`) would smooth onboarding. Tracked as a Story 6.x carry-over.
- **AR22 verb-prefix `hintOverride` strings (`Add` / `Pass` / `Configure`) slip through the registry CI gate.** Aligned with Story 1.11 precedent. The fix is a Story 6.x extension to `errors.test.ts` to also exercise per-instance `hintOverride` paths OR ratification of additional canonical verbs. Surfaced in Stories 2.2, 2.4 reviews.
- **Story 2.1 `runVerifier` `stagingRoot` REQUIRED in v0.1** (since `STAGING_PATH` constant landed only in Story 2.2). Story 2.6 inherited the explicit-stagingRoot pattern as `dev-002` carry-forward. Resolved cleanly but added boilerplate at the runner-tier composition site.
- **Phase enum mismatch between DAG (5 phases) and DispatchSpec (2 phases).** Story 2.2's `dagPhaseToDispatchPhase` collapses `analysis | planning | solutioning → "planning"`; `implementation | retro → "implementation"`. Story 2.4 + Story 2.6 both work around this. Closes once Story 6.x DispatchSpecV2 ratifies the `phase` field at the schema layer.
- **State-hash design uses Option A (epic+story tuple) instead of architecture-line-1673 SHA-256 spec.** Sound v0.1 simplification (DispatchSpecV1 doesn't carry `stateHash`); the SPIRIT of the AC is honored. Carry-forward to Story 6.x DispatchSpecV2.

### Patterns to repeat

- **Forward-dep + carry-over discipline up front in story specs.** Every Epic 2 story's Dev Notes section enumerated forward-deps, carry-overs, and dev-001-style deferrals BEFORE the dev pass. Reviewers had to adjudicate `accept` vs `accept-with-followup` vs `reject`, but never had to discover undocumented deviations.
- **Defence-in-depth Zod parsing at every schema boundary.** Adopted everywhere; no schema drift in epic-2.
- **Composer-at-runner pattern (top-tier owns wiring; mid-tier + higher-tier stay independent).** Stories 2.4 + 2.6 are the canonical examples.
- **`STAGING_PATH` + `assertWithinScope` as the canonical scope-discipline pair.** Defence-in-depth: pre-mkdir scope check + transitive `atomicWrite` re-check. Story 2.5 dev-002 surfaced and ratified the pre-mkdir order.
- **Triple-binding integrity (literal at AR9 emit ↔ literal at frontmatter `name:` ↔ runtime read at Task invocation argument).** Five-way coupling kept coherent across Stories 2.2, 2.3, 2.4, 2.7, 2.8.
- **Mock-Task substitution for Layer-2-only smoke tests.** Architecturally prescribed pattern per §line 1265; Story 2.8 lands the canonical example. Stories 4.1 / 5.1-5.4 / 4.2-4.6 will reuse.

### Patterns to avoid

- **Choosing dispatch-time `declaredMutationScope.allowedPaths` that diverge from the story spec's directory layout.** Story 2.5's `src/transcript/` → `src/runs/` rename was sound but cascades through 7+ downstream story specs. **Recommendation**: when the dispatch-time mutation scope diverges from the story spec, either (a) document the rename precedent in the story spec FIRST, or (b) re-issue the dispatch with the spec-aligned path.
- **Hardcoding step name lookups at the runner tier.** Story 2.6's `derivePhaseFromStep` 17-entry table works in v0.1 but couples to seed-v6.x.ts naming. The canonical resolution lives in the DAG; runner-tier should consume `dispatchSpec.phase` once Story 6.x ratifies the field.
- **Long story files (>700 lines).** While each L-effort story justifies its scope inline, the `< 600` line guidance is increasingly aspirational. Consider tighter story splits in Epic 3 + 4 (e.g., split a runner into `runner.ts` story + `runner.test.ts` story when both individually exceed 400 lines).
- **Skipping `mock.restore()` after `mock.module` test patches.** Bun's `mock.module` is process-global; subsequent tests in the same `bun test` run inherit the mock. Story 2.6 dev-004 surfaced this. Always pair `mock.module` with `mock.restore()` in `afterEach`.

## Architecture Compliance Notes

| Constraint                                              | Status across 8 stories                                                                                                                                                                            |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AR41** (boundary graph; no upward / sibling-higher imports) | **CLEAN** — verified by Grep + colocated AR41 boundary tests at every story. `src/verifiers/`, `src/dispatch/`, `src/runs/` never import from each other. Top-tier composers own cross-tier wiring. |
| **AR8** (lock-free `run.ts` / lock-held `verify-and-advance.ts`) | **VERIFIED at compile-time AND runtime.** Story 2.4 import-grep CLEAN for `../../lock/`; runtime `mock.module` spy on `acquire` shows zero calls. Story 2.6 inverse: `acquire()` called exactly once, `release()` in finally on every exit path. **Process boundary** between the two runners established cleanly via Story 2.7's two separate `Bash` invokes. |
| **AR9** (single discriminated-union JSON line on stdout) | **VERIFIED.** Story 2.2's `emit.ts` is the SECOND project-wide caller of `json()` (after Story 1.3's `--export-state`). Defence-in-depth: `DispatchActionV1Schema.parse()` BEFORE every stdout write. Story 2.8 smoke asserts exactly ONE non-empty stdout line per Bash invoke (`bun run src/commands/next/run.ts --dry-run 2>/dev/null \| wc -l = 1` confirmed empirically).  |
| **AR21** (errors carry `code` + `actionableHint`)        | **CLEAN** — every throw site uses a registered `StepperError` subclass; never plain `Error` (sole sanctioned exception: `Result<T, E>` for `VerifierConfig.custom?` callbacks per architecture line 858). The pre-registered `StateChangedDuringDispatchError` got its first throw site in Story 2.6 without a registry change. |
| **AR22** (single-line `Run/See/Try/Check` hints)         | **PASS for registry defaults; PARTIAL for `hintOverride?` strings** — `Add` / `Pass` / `Configure` overrides slip through the gate. Carry-over to Story 6.x.                                       |
| **AR33** (function & error semantics; no `console.*`)    | **CLEAN** — Biome `noConsole` rule satisfied across 8 stories. `process.exit` only in `import.meta.main` blocks. `info` / `warn` / `error` for stderr; `json` for stdout (only via `emitDispatchAction`'s defence-in-depth path). |
| **FR54** (stdout/stderr discipline)                      | **DELIVERED + ENFORCED.** Story 2.2's `emit.ts` is the second project-wide stdout writer (after Story 1.3's `--export-state`). Story 2.4's `runNext` does NOT touch stdout itself; only the `import.meta.main` block emits via `emitDispatchAction`. Story 2.6's `runVerifyAndAdvance` follows the same pattern. Story 2.8 asserts the contract end-to-end. |
| **AR7** (6-section task spec — PERSONA, CONTEXT, TASK, OUTPUT FORMAT, SUCCESS CRITERIA, CONSTRAINTS) | **DELIVERED + DOCUMENTED.** Story 2.2's `buildDispatchSpec` produces the 6-section `taskSpec` literal verbatim. Story 2.3's `agents/bmad-step-runner.md` body walks the contract in section order with verbatim `taskSpec.*` field references. Story 2.4 populates `taskSpec.context[]` + `taskSpec.outputFormat.requiredSections` per Story 2.2 senior dev info-3 carry-over. |
| **AR16** (multi-persona steps dispatch sub-agents sequentially in v0.1) | **PASS — single-persona v0.1.** Story 2.4's `pickFirstPersona` picks first element + emits stderr warn for arrays. Story 2.6 reads `dispatchSpec.taskSpec.persona` (already pre-resolved). Sequential multi-persona dispatch deferred to Stories 4.1 + 5.* (loop-runner tier). |
| **AR11 + AR12** (state save semantics — read-modify-write under held lock; `saveState(state, handle)` REQUIRED) | **VERIFIED in Story 2.6.** First lock-acquiring runner of the project. `acquire()` → `loadStateUnlocked` (under held lock) → mutate → `saveState(state, handle)` → `release()` in finally. Story 1.6's REQUIRED-LockHandle parameter prevented compile-time bypass attempts. |
| **AR25 + AR26** (markdown transcript + JSON run log per step) | **DELIVERED.** Story 2.5 ships the writer pair (markdown 7-section per AR25 + JSON 17-field per AR26 + `RunLogV1Schema` defence-in-depth). Story 2.6 is the FIRST canonical caller (in `finally` block — runs on every exit path: pass, fail, halt). Story 2.8 asserts both files exist + JSON validates against `RunLogV1Schema`.  |
| **AR35** (test-tmpdir-per-test discipline)               | **HONORED 100%.** Every test that touches the filesystem uses `mkdtemp(path.join(os.tmpdir(), "stepper-..."))`. Cleanup via `fs.rm(tmp, {recursive: true, force: true})` in `afterEach`. NEVER hard-coded `/tmp/...`. Story 2.3 documented Layer-3 deviation (manual fixture + Story 2.8 end-to-end smoke jointly satisfy AC-4 — Layer 3 cannot be exercised by `bun test`). |
| **NFR-S1** (no main-thread network)                      | **CLEAN** — programmatic test in `run.test.ts` and `verify-and-advance.test.ts` greps for `fetch(`, `Bun.fetch`, `node:http`, `node:https`, `node:net` literals; ZERO matches. Story 2.5's writer is filesystem-only by construction. |
| **NFR-S2** (writes only inside scope)                    | **DELIVERED + DEFENCE-IN-DEPTH.** Story 2.5 dev-002 inserted explicit `assertWithinScope(runsRoot)` between schema-parse and `fs.mkdir` (so canonical `ScopeViolationError` surfaces before EACCES would mask it). `atomicWrite` re-checks per Story 1.3 contract. Story 2.8's `src/integration/no-write-outside-scope.test.ts` is the canonical CI gate (recursive walk + path-prefix assertion after the full pipeline). |
| **NFR-S4** (sub-agent isolation enforces declared scope) | **4-LAYER DEFENCE-IN-DEPTH.** (a) Story 2.3's `allowed-tools` runtime restriction; (b) Story 2.3's prompt body explicit scope limit; (c) Story 2.2's `taskSpec.constraints.scopeLimits` reminder ("Only files inside `staging/${runId}/` may be written."); (d) Story 2.1's verifier check + Story 2.6's confirmation no out-of-staging writes occurred. |
| **NFR-S5** (atomic tmp+rename + .bak rotation)           | **DELIVERED.** `dispatch-spec.json`, `verifier-result.json`, run-log JSON + markdown, `state.yaml`, canonical artifact (via promote.ts) — all written via Story 1.3's `atomicWrite`. `.bak` rotation kept for one cycle. Verified in colocated tests at every site. |
| **NFR-R1** (zero data loss on halt)                      | **DELIVERED.** Atomic-write contract guarantees halt mid-write leaves either the prior or new file (never partial). Transcript pair written in Story 2.6's `finally` block on every exit path (pass, fail, halt). |
| **NFR-R4** (clean halt on stale lock)                    | **DELIVERED in Story 2.6.** `acquire()` lock-contention path → `LockContentionError` → outer try/catch translates to `action: "halt"` with `exitCode: 4` per FR53. UNREACHABLE in Story 2.4 (lock-free runner). |
| **NFR-M3** (every public schema validated by Zod)        | **DELIVERED.** Defence-in-depth Zod parse before every disk write. Schema drift caught BEFORE hitting disk at every site.                                                                          |
| **NFR-P3** (sub-agent dispatch overhead < 200ms p95)     | **PASS** (qualitative) — `buildDispatchSpec` per-call cost is two `mkdir({recursive:true})` + atomic-write of a small JSON literal. Production assertion lives in Story 4.x long-run integration test. |
| **NFR-P4** (transcript streaming zero observable latency) | **PASS at writer site (silence verified); long-run latency assertion deferred to Story 4.x.** Writer is silent on stdout/stderr (zero `process.stdout.write` / `process.stderr.write` calls during execution; zero `from "../io/log"` imports across `src/runs/*.ts`). |
| **FR1** (compute next step zero-config)                  | **DELIVERED in Story 2.4.** `pickNextStep` selection rules: explicit `--step`; fresh project → entry-points with empty `after[]`; post-first-step → nodes whose `after[]` includes `lastStepName`. Story 2.8 smoke confirms end-to-end. |
| **FR16** (sub-agent dispatch with budget+timeout)        | **DELIVERED.** `dispatchSpec.budget.contextTokens: 60_000`, `timeoutMs: 300_000` defaults; per-step + per-project overrides deferred to Stories 6.3 / 6.4.                                            |
| **FR17** (verifier on every sub-agent output)            | **DELIVERED in Stories 2.1 + 2.6.** Story 2.6 invokes `runVerifier` BEFORE atomic promote; `status: "pass"` → promote + state advance; `status: "fail"` → halt + transcript write + lock release. |
| **FR18** (one human-readable line per step)              | **DELIVERED in Story 2.6.** Success-line format `"✓ <step> → <canonical-path> (tokens: in=<n> out=<n>, <ms>ms)"` per architecture §line 1478. Story 2.8 asserts the verbatim shape end-to-end. |
| **FR53** (exit codes 0-5)                                | **DELIVERED.** Story 2.4: 0 (success), 2 (config error), 3 (BMAD detection), 5 (scope violation). Story 2.6: 0, 1 (state-changed-during-dispatch), 2, 4 (lock contention), 5. Code 3 unreachable in 2.6; code 4 unreachable in 2.4.   |

---

**Epic 2 closure milestone:** All 8 required stories `done`; epic status `done`; optional retrospective (this document) `done`. Epic 3 (CLI flags, persona overrides, observability extensions) is the next epic. The dispatch-then-verify loop, the AR9 stdout protocol, the lock-free / lock-held process-boundary handoff, the canonical Layer 1 ↔ Layer 2 ↔ Layer 3 orchestration, and the canonical end-to-end smoke test are now all in place. `/bmad-loop` may now be re-invoked with stop conditions targeting Epic 3.
