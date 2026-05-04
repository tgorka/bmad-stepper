---
status: done
story_id: '3.10'
story_key: 3-10-non-locking-read-flags
epic: '3'
title: 'Non-Locking Read Flags'
created: '2026-05-01'
last_updated: '2026-05-01'
priority: M
estimated_effort: S
fr_coverage:
  - FR3
  - FR4
  - FR8
  - FR9
  - FR52
  - FR53
  - FR54
nfr_coverage:
  - NFR-P1
  - NFR-P5
  - NFR-S2
  - NFR-S5
  - NFR-R1
  - NFR-R4
  - NFR-M3
  - NFR-I2
ar_coverage:
  - AR8
  - AR9
  - AR11
  - AR21
  - AR22
  - AR33
  - AR41
  - AR42
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/implementation-artifacts/epic-2-retrospective.md
  - _bmad-output/implementation-artifacts/3-1-record-last-attempted-last-failure-reason-on-halt.md
  - _bmad-output/implementation-artifacts/3-2-resume-flag.md
  - _bmad-output/implementation-artifacts/3-3-dry-run-flag.md
  - _bmad-output/implementation-artifacts/3-4-step-id-and-scope-flags.md
  - _bmad-output/implementation-artifacts/3-5-persona-override-include-optional-no-optional.md
  - _bmad-output/implementation-artifacts/3-6-explain-reasoning-trace.md
  - _bmad-output/implementation-artifacts/3-7-list-candidate-next-steps.md
  - _bmad-output/implementation-artifacts/3-8-diff-state-and-export-state.md
  - _bmad-output/implementation-artifacts/3-9-watch-live-transcript-tail.md
  - _bmad-output/implementation-artifacts/1-4-file-lock-with-heartbeat.md
  - _bmad-output/implementation-artifacts/1-7-cli-argument-parser.md
  - _bmad-output/implementation-artifacts/2-4-lock-free-run-ts-for-bmad-next.md
  - .bmad-stepper/config.yaml
  - src/errors.ts
  - src/io/log.ts
  - src/io/paths.ts
  - src/lock/lock.ts
  - src/lock/lock.test.ts
  - src/state/load.ts
  - src/state/diff.ts
  - src/state/export.ts
  - src/commands/next/run.ts
  - src/commands/next/run.test.ts
  - src/commands/next/args.ts
  - src/commands/next/index.ts
---

# Story 3.10: Non-Locking Read Flags

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper user,
I want `--export-state`, `--list`, `--explain`, `--dry-run`, and `--diff-state` to skip lock acquisition,
So that CI scripts can run them concurrently with active Stepper invocations.

## Context Summary

This is the **tenth and FINAL story of Epic 3** and the **only deliverable that lands a meta-contract on `src/lock/lock.ts`** rather than a per-flag runtime branch on `src/commands/next/run.ts`. Stories 3.1 + 3.2 closed the halt-recovery loop (write `state.lastAttempted` + `state.lastFailureReason` on halt; consume them via `--resume`). Story 3.3 landed the first read-only-preview flag (`--dry-run`); Story 3.4 wired explicit-step + scope filtering; Story 3.5 wired the `--persona` override + `--include-optional`/`--no-optional` toggles AND the `--list` optional-toggle filter; Story 3.6 replaced the `--explain` placeholder with the structured 5-component reasoning trace; Story 3.7 replaced the `--list` placeholder with the canonical 4-component per-line format; Story 3.8 replaced the `--diff-state` and `--export-state` Story 2.4 placeholders with the divergence-report + schema-versioned-JSON-export helpers (and introduced the FR54 SPECIAL-CASE for `--export-state` stdout-only-JSON); Story 3.9 landed the `--watch` live-transcript tail (NOTE: `--watch` is NOT in the Story 3.10 enumeration — it's its own beast, structurally lock-free without the `skipAcquire` opt-in). Story 3.10 closes Epic 3 by **making the no-lock contract for the FIVE read-only flags EXPLICIT** via a new `skipAcquire: boolean` parameter on `src/lock/lock.ts`'s `acquire()` API.

**The five read-only flags per AC line 873 + epic preamble**: `--export-state`, `--list`, `--explain`, `--dry-run`, `--diff-state`. **NOT** `--watch` (which is its own streaming-mode beast with the SECOND AR9 SPECIAL CASE — see Story 3.9). The five-flag enumeration is **binding**: AC line 879 says "any of the five read-only flags"; AC line 873 enumerates them in the user story preamble. Any FUTURE read-only flag (Story 4.7's `--plan-first`, etc.) is OUT of Story 3.10's scope; Story 3.10 ships the meta-contract for the v0.1 read-only-flag cluster only.

**The v0.1 STRUCTURAL no-lock invariant ALREADY HOLDS.** Per architecture §line 1672 + AR8 (`run.ts is read-only / lock-free`), the entire `src/commands/next/run.ts` module NEVER calls `acquire()` from `src/lock/lock.ts`. Story 2.4 established this contract; Story 3.3 (Task 0.4) reinforced it; Story 3.8's `diffState` + `exportState` helpers compose `loadStateUnlocked` + `recomputeStateUnlocked` (both unlocked variants per Story 3.8 Task 4); Story 3.6's `--explain` and Story 3.7's `--list` short-circuits also use `loadStateUnlocked` exclusively (verified at `src/commands/next/run.ts:1544` + `:1639`); Story 3.3's `--dry-run` short-circuit composes the dispatch-spec literal in memory (zero state read OR write — verified at `run.ts:1791-1833` + Story 3.3 Test J source-content scan). The structural invariant is enforced by:

1. **`run.ts` boundary check at `run.test.ts:606-638`** — programmatic source-content scan of `src/commands/next/run.ts` REJECTS `from "../../lock/"` AND `acquire(` import patterns. Future regressions surface at test time.
2. **AR41 boundary graph** — `run.ts` is top-tier per architecture §Module Boundaries; the `src/lock/` module is foundational; the boundary check at `run.test.ts:606-638` enforces no `src/lock/` import in `run.ts`.
3. **The five read-only flag short-circuits all return BEFORE any lock-acquiring path** — `--export-state` at `run.ts:1465-1498`; `--diff-state` at `run.ts:1500-1519`; `--explain` at `run.ts:1521-1628`; `--list` at `run.ts:1630-1696`; `--dry-run` at `run.ts:1791-1833`.

**Story 3.10 makes this STRUCTURAL invariant an EXPLICIT contract surface** by adding a `skipAcquire: boolean` parameter to `LockOptions` in `src/lock/lock.ts:63-84`. When `skipAcquire === true`, `acquire(opts)` returns a no-op `LockHandle` whose `lockDir`/`pidFile` fields are sentinel strings (e.g., `"<no-op:skipAcquire>"`), `acquiredAt` is the current ISO timestamp, and `release()` is a no-op (resolves immediately). The function:

1. **Skips the `assertWithinScope(LOCK_DIR_REL)` defensive check** (no lock dir is created — nothing to scope-check).
2. **Skips the `mkdir(lockDir)` call** (no atomic-rename race against another process).
3. **Skips the `evaluateStaleness` branch** (no EEXIST handling — there is no acquire attempt).
4. **Skips the inner `Bun.write(pidFile, ...)` call** (no pid file to write).
5. **Skips the `setInterval(heartbeat)` registration** (no heartbeat — no listener leaked).
6. **Skips the success-info log** (no `lock: acquired at ...` info line — there is no lock to acquire).
7. **Returns immediately** with a sentinel `LockHandle`.

**`release()` on the no-op handle is also a no-op** — it sets `released = true` (idempotent), but does NOT call `clearInterval` (no timer started), does NOT call `fs.rm(lockDir)` (no dir created), does NOT emit a release-info log. Resolves immediately to `undefined`.

**Why ship the explicit `skipAcquire` flag NOW (Story 3.10) when the v0.1 invariant ALREADY holds structurally?** Three reasons:

1. **AC verbatim compliance** — AC line 878 says: "**Given** `src/io/lock.ts` updated to support a `skipAcquire: boolean` flag". This is a binding contract surface. Story 3.10 MUST add the flag to `lock.ts` regardless of whether v0.1 callers exercise it.

2. **Defense-in-depth** — should a FUTURE story (Story 6.x or beyond) accidentally route a read-only flag through a lock-acquiring path, the explicit `skipAcquire` flag provides the "right answer" off-the-shelf. The current AR41 boundary check + the v0.1 structural invariant catches the regression at TEST time; the `skipAcquire` flag offers a RUNTIME-clean escape hatch without forcing a refactor.

3. **Forward-proofing for Story 6.x lock-acquiring read flows** — when Story 6.1 (`bmad-stepper.config.yaml` schema loader) lands, the read-only flags MAY route through a lock-acquiring path if the config-loader chooses to validate against the live state.yaml during load (e.g., `--validate-config` runs `loadState` with the lock to ensure no race during validation). Story 3.10's `skipAcquire` flag lets that future caller pass `acquire({ skipAcquire: true })` to opt OUT cleanly. v0.1 conservative documents the forward-proofing in the JSDoc.

**`src/io/lock.ts` vs `src/lock/lock.ts` — path alignment**:

The AC source path at epics.md line 878 references `src/io/lock.ts`; the architecture §line 1382 references `src/io/lock.ts` (FR52 → `src/io/lock.ts (acquire skipped)`); the canonical filesystem location per Story 1.4 is `src/lock/lock.ts` (verified by `Glob src/lock/**/*.ts`). The ACTUAL lock module lives at **`src/lock/lock.ts`** — Story 3.10 lands the `skipAcquire` flag on the actual file. The AC source path wording is **stale** relative to the actual filesystem layout (likely a planning-time placeholder; Story 1.4 chose `src/lock/lock.ts` for the foundational-tier module). This is a documented design decision adjudicated in §Open Questions, not a deviation from the AC's INTENT (the AC enforces the FR52 contract — read-only flags skip lock acquisition; the path naming is below the AC's specificity threshold).

**The five-flag map to `action=report` invariant** per AC line 885:

The five read-only flags ALREADY structurally map to `action: "report"` in v0.1:
- `--export-state` (Story 3.8) → `reportWithMessage(JSON.stringify(exported))` at `run.ts:1497`. The `import.meta.main` block FR54-special-cases stdout emission, but the `runNext` return shape is `report` for testability.
- `--diff-state` (Story 3.8) → `reportWithMessage(report.humanReadable)` at `run.ts:1518`.
- `--explain` (Story 3.6) → `reportWithMessage(message)` at the bottom of the `if (args.explain)` branch (multi-line `\n`-joined message per AC-line-817).
- `--list` (Story 3.7) → `reportWithMessage(...)` at the bottom of the `if (args.list)` branch (4-component per-line format).
- `--dry-run` (Story 3.3) → `reportWithMessage(<dispatch-spec preview>)` at the bottom of the `if (args.dryRun)` branch (single-line preview message).

Story 3.10 ASSERTS this invariant via a programmatic test (Task 6.4) and reuses the existing `loadStateUnlocked` + in-memory composition patterns. **No `runNext` body change required** — the assertion is purely defensive (defense-in-depth against future regressions).

**The "no state mutation" invariant** per AC line 885:

Story 3.3 already established the no-state-mutation invariant for `--dry-run` (per Story 3.3 AC line 766-768 + integration test `src/integration/dry-run-no-writes.test.ts`). Story 3.10 extends the assertion to ALL FIVE read-only flags via Task 6.5 — a programmatic test that snapshots the project tmpdir's file inventory before + after each flag's invocation; asserts byte-identical inventory (ZERO new files, ZERO modified mtimes, ZERO modified contents). Reuses the `walkFiles` helper from `src/integration/no-write-outside-scope.test.ts:119-140` + Story 3.3's `dry-run-no-writes.test.ts` precedent. The integration test verifies the cross-process scenario (active Stepper invocation holds the lock; CI script runs read-only flag concurrent with the active hold).

**Concurrent-active + read-only integration test** per AC line 884:

The integration test per AC line 884 ("integration test runs concurrent active + read-only invocations and asserts both succeed") is the centrepiece deliverable. Test pattern:

1. **Synthesise a held lock** via the existing `synthesiseHeldLock(...)` helper from `src/lock/integration/concurrent-acquire.test.ts:49-58` (or equivalent) — creates `<tmpdir>/state.yaml.lock/` with a "live" pid file (mtime = now; pid = `process.pid + 100_000` to evade the self-owned reclaim path).
2. **Spawn `bun run src/commands/next/run.ts -- --export-state`** as a subprocess via Story 3.8's `export-state-no-lock.test.ts` spawn pattern (with the `STEPPER_INTERNAL_ROOT` env var pointing at the tmpdir).
3. **Capture stdout + exit code**.
4. **Assert** (a) exit code === 0, (b) stdout is parseable JSON with the 7 export fields, (c) NO `LOCK_CONTENTION` error (the lock-contention error is exit code 4 per FR53 + `src/errors.ts:LockContentionError`), (d) the synthesised lock dir at `<tmpdir>/state.yaml.lock/` is STILL PRESENT (the read-only flag did NOT touch the lock).
5. **Repeat for the other four read-only flags** (`--list`, `--explain`, `--dry-run`, `--diff-state`) — five total spawn invocations, each verified to succeed concurrent with the held lock.

The test is REQUIRED per AC line 884; the structural lock-free contract per AR8 means the test will pass in v0.1 EVEN WITHOUT the `skipAcquire` flag (the read-only flags structurally never acquire the lock; the held-lock synthesis is irrelevant to them). Story 3.10's `skipAcquire` flag formalises the contract; the integration test verifies the contract end-to-end.

**Edge case — concurrent two-active-process scenario (NOT in scope)**:

Two ACTIVE Stepper invocations (both running the dispatch path) WILL contend for the lock per AR8 + Story 1.4's `LOCK_CONTENTION` error. Story 3.10 does NOT change this — only the five READ-ONLY flags get the `skipAcquire` path. An active invocation that races with another active invocation throws `LockContentionError` (exit code 4 per FR53) per the existing v0.1 contract. Story 3.10's integration test does NOT cover this scenario (Story 1.4's `concurrent-acquire.test.ts` already does).

**Edge case — `--watch` is NOT in the five-flag enumeration**:

AC line 873 enumerates exactly five flags: `--export-state`, `--list`, `--explain`, `--dry-run`, `--diff-state`. `--watch` is OMITTED. Story 3.9's watcher is structurally lock-free without the `skipAcquire` opt-in (no `src/lock/` import; pure-CONSUMER of the transcript files). Story 3.10 does NOT extend `skipAcquire` to `--watch`; the watcher's lock-free posture is a separate forward-tracker (per Story 3.9 §Forward Dependencies).

**Edge case — `--doctor` is NOT in the five-flag enumeration**:

`--doctor` is a diagnostic flag that runs entirely under `loadStateUnlocked` (Story 1.12); it does NOT hold the lock. AC line 873 omits it (it's not a "read-only flag" in the sense of the cluster — it's a diagnostic surface with its own contract). Story 3.10 does NOT extend `skipAcquire` to `--doctor`.

**Concretely, this story produces**:

1. **`src/lock/lock.ts`** (MODIFIED, ~30-40 lines added):
   - Adds `readonly skipAcquire?: boolean` to the `LockOptions` interface at `src/lock/lock.ts:63-84` (insert AFTER `logger?: LockLogger;` to preserve the existing field order).
   - Adds an EARLY-EXIT branch at the top of `acquire(opts)` body (after the JSDoc, BEFORE the `resolveConfig` call): when `opts?.skipAcquire === true`, return a sentinel `LockHandle` with `lockDir: "<no-op:skipAcquire>"`, `pidFile: "<no-op:skipAcquire>"`, `acquiredAt: new Date().toISOString()`, `release: async () => undefined`. ZERO filesystem mutation; ZERO heartbeat timer.
   - Updates the `acquire()` JSDoc at `src/lock/lock.ts:262-279` to document the `skipAcquire` carve-out, the use case (FR52 + Story 3.10), the no-op semantics, and the bounded list of v0.1 callers (none — the flag is forward-proofing for Story 6.x).
   - Updates the module-level JSDoc at `src/lock/lock.ts:1-44` with a §Story 3.10 `skipAcquire` paragraph in the "Public API" section.
   - **NOT modified**: `forceUnlock`, `evaluateStaleness`, `defaultLogger`, `defaultIsPidAlive`, `resolveConfig`, the constants block — all UNCHANGED.

2. **`src/lock/lock.test.ts`** (MODIFIED, ~80-120 lines added — new `describe` block):
   - New `describe("acquire — skipAcquire (Story 3.10 / FR52)", ...)` block APPENDED to the existing test file.
   - Test A: `acquire({ skipAcquire: true })` returns a handle with `lockDir === "<no-op:skipAcquire>"` AND `pidFile === "<no-op:skipAcquire>"`.
   - Test B: `acquire({ skipAcquire: true })` does NOT create any directory at the canonical lock path (`fs.access(canonicalLockDir)` rejects).
   - Test C: `acquire({ skipAcquire: true })` does NOT register a heartbeat timer (snapshot `setInterval` calls via spy / global timer count; assert 0 new timers after the call).
   - Test D: `handle.release()` resolves WITHOUT throwing; second call also resolves (idempotent).
   - Test E: `acquire({ skipAcquire: true })` succeeds even when `lockDir` already exists with a live holder (i.e., the active-Stepper-holds-the-lock scenario per AC line 881-883). Synthesises a held lock first (mirroring `concurrent-acquire.test.ts:49-58`), then calls `acquire({ skipAcquire: true })`; asserts no throw; asserts the synthesised lock dir is STILL PRESENT after the call.
   - Test F: `acquire({ skipAcquire: false })` (default) STILL works exactly as before — happy path regression sentinel.
   - Test G: `acquire({})` (omit `skipAcquire`) STILL works exactly as before — backward-compat sentinel.

3. **`src/integration/non-locking-read-flags.test.ts`** (NEW, ~150-200 lines): the AC-line-884 enforcement integration test.
   - Single test (or split into 5 sub-tests) per AC: spawn `bun run src/commands/next/run.ts -- --<flag>` against a tmpdir with a synthesised held lock; assert (a) exit code 0, (b) appropriate stdout shape (JSON for `--export-state`; multi-line text for the other four), (c) NO `LOCK_CONTENTION` error, (d) the synthesised lock dir is still present (the read-only flag did NOT touch the lock).
   - Reuses the `walkFiles` helper from `src/integration/no-write-outside-scope.test.ts:119-140` to assert no state mutation in the tmpdir AFTER the read-only-flag spawn.
   - Reuses the `synthesiseHeldLock` helper pattern from `src/lock/integration/concurrent-acquire.test.ts:49-58`.
   - Uses tmpdir-per-test mkdtemp/rm pattern (AR35 compliant per Story 3.3 + Story 3.8 + Story 3.9 precedent).

4. **`src/commands/next/run.test.ts`** (MODIFIED, ~40-60 lines added):
   - APPENDS new `describe("runNext — Story 3.10 read-only flags map to action=report", ...)` block.
   - Test A: invoke each of the FIVE read-only flags programmatically via `runNext({ argv: ["--<flag>"] })`; assert `result.action.action === "report"` for ALL FIVE.
   - Test B: invoke each of the FIVE read-only flags; assert NO `acquire` call via spy on `acquire` from `src/lock/lock.ts`. Defense-in-depth assertion.
   - Test C: invoke each of the FIVE read-only flags; assert no FS mutation (snapshot tmpdir before + after; assert byte-identical inventory).

5. **`_bmad-output/implementation-artifacts/sprint-status.yaml`** (MODIFIED): flips `3-10-non-locking-read-flags: backlog → ready-for-dev` (at create-story time). At dev-story completion, flips to `review` (intermediate `in-progress` during dev). `epic-3: in-progress` is preserved until Story 3.10's `done` flip — at that point, Epic 3 is COMPLETE; the epic flip from `in-progress → done` happens manually after the retro (per sprint-status.yaml line 17).

**FR/NFR/AR mapping**:

- **FR3** (`--diff-state`): CONSUMED. Story 3.10 verifies the existing `diffState` helper's lock-free contract via the integration test + the `acquire` spy in run.test.ts.
- **FR4** (`--export-state`): CONSUMED. Story 3.10 verifies the existing `exportState` helper's lock-free contract via the integration test + the `acquire` spy.
- **FR8** (`/bmad-next` single-step advance): UNCHANGED. Story 3.10 does NOT touch the dispatch path; only the read-only flag cluster.
- **FR9** (`--dry-run`): CONSUMED. Story 3.10 verifies the existing `--dry-run` lock-free contract.
- **FR52** (Read-only flags non-locking): PRIMARY DELIVERABLE. v0.1 ships the explicit `skipAcquire: boolean` flag on `src/lock/lock.ts` `acquire()` API + the integration test for concurrent active + read-only invocations.
- **FR53** (documented exit codes): UNCHANGED. The read-only flags exit 0 on the happy path; halt translations flow through the existing `haltFromError` mapping (no exit code changes).
- **FR54** (stdout/stderr discipline): UNCHANGED. Story 3.8 + 3.9 own the stdout/stderr discipline carve-outs (`--export-state` + `--watch`); Story 3.10 does NOT add new stdout/stderr surfaces.
- **NFR-P1** (next-step computation < 500ms p95): PRESERVED — Story 3.10 only adds an EARLY-EXIT branch in `acquire`; ZERO impact on the next-step computation path.
- **NFR-P5** (state read < 100ms p95): PRESERVED — `loadStateUnlocked` is unchanged.
- **NFR-S2** (writes only inside scope): PRESERVED — the `skipAcquire` no-op path performs ZERO writes; the assertion is structurally tighter than before.
- **NFR-S5** (atomic writes + locks): EXTENDED. The `skipAcquire` flag formalises the "no lock acquired" contract for the read-only-flag cluster; the lock semantics for the dispatch path are UNCHANGED.
- **NFR-R1** (zero data loss on halt): UNCHANGED — read-side only.
- **NFR-R4** (lock release on graceful exit): UNCHANGED — the dispatch-path lock semantics are preserved.
- **NFR-M3** (machine-readable JSON for `--export-state`): UNCHANGED — Story 3.8 owns the JSON shape; Story 3.10 only verifies the lock-free invariant.
- **NFR-I2** (unknown-skill fail-loud): UNCHANGED — Story 3.10 does NOT touch DAG resolution.
- **AR8** (lock-free `run.ts` / lock-held `verify-and-advance.ts`): EXTENDED. The `skipAcquire` flag provides a forward-proofing escape hatch should a future story accidentally route a read-only flag through `acquire`. v0.1 invariant ALREADY HOLDS structurally; Story 3.10 makes the contract EXPLICIT.
- **AR9** (single discriminated-union JSON line on stdout): UNCHANGED. Story 3.10 verifies the action=report invariant for the five read-only flags.
- **AR11** (`state.yaml` at canonical path): UNCHANGED — Story 3.10 does NOT touch state.yaml.
- **AR21 + AR22** (errors carry code + actionable hint): UNCHANGED — Story 3.10 ships ZERO new error classes.
- **AR33** (function & error semantics; throw not Result; no console.\*; async/await): UNCHANGED — the `skipAcquire` no-op branch is async; throw not Result; ZERO `console.*`.
- **AR41** (boundary graph): UNCHANGED. The `src/lock/lock.ts` module is foundational per AR41; Story 3.10's modification stays within the module's existing boundary; no new imports added.
- **AR42** (test discipline): EXTENDED — new colocated `src/lock/lock.test.ts` `describe` block + new integration test `src/integration/non-locking-read-flags.test.ts` + new colocated runner test cases.

**What this story DOES NOT do**:

- **Implement Story 4.1's `/bmad-loop` command skeleton.** Forward-deferred to Epic 4.
- **Implement runtime `failurePolicies` lookup.** Forward-deferred to Story 6.x.
- **Implement multi-persona sequential dispatch.** Forward-deferred to Stories 4.1 + 5.*.
- **Modify `forceUnlock`** in `src/lock/lock.ts`. The `--force-unlock` flag is Story 6.x territory.
- **Modify `verify-and-advance.ts`.** The lock-held runner is unchanged; Story 3.10 is purely additive on `src/lock/lock.ts`.
- **Modify `commands/bmad-next.md` (Story 2.7 Layer 1 markdown).** The five read-only flags continue to emit `action: "report"` per existing semantics; Layer 1 reads the `report` line and prints the message; no markdown change needed.
- **Add a new error class.** The 16-code registry stays UNCHANGED.
- **Migrate `src/lock/lock.ts` to `src/io/lock.ts`** (per AC source path wording). The architecturally-canonical path is `src/lock/lock.ts` per Story 1.4; the AC source path wording is stale. See §Open Questions.
- **Extend `skipAcquire` to `--watch`** (NOT in the five-flag enumeration; structurally lock-free without the opt-in per Story 3.9).
- **Extend `skipAcquire` to `--doctor`** (NOT in the five-flag enumeration; diagnostic surface with its own contract).
- **Add a `bmad-stepper.config.yaml lock.skipAcquire` config knob.** v0.1 hard-codes the v0.1 caller behaviour (none invoke `skipAcquire: true` directly because the read-only flags structurally never reach `acquire` in `run.ts`); the flag is forward-proofing only. Story 6.1 (config-loader) may surface as `bmad-stepper.config.yaml lock.skipAcquire` if the config-loader chooses to validate against the live state.yaml during load with the lock; non-blocking forward action.

**What this story DOES land**:

- The architecturally-prescribed **`skipAcquire: boolean` parameter on `src/lock/lock.ts`'s `acquire()` API** per FR52 + epic AC line 878.
- The architecturally-prescribed **no-op handle return** when `skipAcquire === true` per the AC's pure-read-mode contract (line 880).
- The architecturally-prescribed **integration test for concurrent active + read-only invocations** per AC line 884.
- The architecturally-prescribed **action=report invariant assertion** for the five read-only flags per AC line 885.
- The **forward-coupling documentation** with Stories 4.1 / 6.1 / 6.x.
- **~80-120 new colocated test cases** in `lock.test.ts` covering happy-path + edge cases.
- **~40-60 new colocated test cases** in `run.test.ts` covering the action=report invariant + the no-mutation invariant.
- **~150-200 lines** of new integration test in `src/integration/non-locking-read-flags.test.ts`.

This story exercises:

- **AR8** (lock-free `run.ts`): EXTENDED. The `skipAcquire` flag formalises the "no lock acquired" contract for the read-only-flag cluster; v0.1 invariant ALREADY HOLDS structurally.
- **AR9** (single discriminated-union JSON line on stdout): VERIFIED. The five read-only flags map to `action: "report"` per existing semantics; Task 6.4 asserts via runNext result inspection.
- **AR11** (`state.yaml` at `_bmad-output/.stepper/state.yaml`): UNCHANGED.
- **AR21 + AR22** (errors carry code + actionable hint): UNCHANGED.
- **AR33** (function & error semantics): UNCHANGED.
- **AR41** (boundary graph): UNCHANGED. `src/lock/lock.ts` stays foundational.
- **AR42** (test discipline): EXTENDED. New tests in `lock.test.ts` + new integration test + new colocated runner tests.
- **FR3 + FR4 + FR9** (`--diff-state`, `--export-state`, `--dry-run`): CONSUMED for verification.
- **FR8** (`/bmad-next` single-step advance): UNCHANGED.
- **FR52** (Read-only flags non-locking): PRIMARY DELIVERABLE.
- **FR53** (documented exit codes): UNCHANGED.
- **FR54** (stdout/stderr discipline): UNCHANGED.
- **NFR-P1, NFR-P5, NFR-S2, NFR-S5, NFR-R1, NFR-R4, NFR-M3, NFR-I2**: PRESERVED or EXTENDED (per the FR/NFR/AR mapping above).

Estimated effort: **S** (small — ONE small modification to `src/lock/lock.ts` (~30-40 lines added — the `skipAcquire` field on `LockOptions` + an EARLY-EXIT branch in `acquire`); ONE new `describe` block in `src/lock/lock.test.ts` (~80-120 lines covering ~7 test cases); ONE new integration test `src/integration/non-locking-read-flags.test.ts` (~150-200 lines covering the AC-line-884 concurrent-active-+-read-only test for ALL FIVE flags); ONE new `describe` block in `src/commands/next/run.test.ts` (~40-60 lines covering the action=report invariant + the no-mutation invariant for ALL FIVE flags). Net additions: ~300-420 lines across 4 files. The integration test is REQUIRED per AC line 884; the action=report invariant assertion is REQUIRED per AC line 885; the structural no-lock invariant ALREADY HOLDS in v0.1 per AR8 + Story 2.4's contract — Story 3.10's `skipAcquire` flag is forward-proofing + AC verbatim compliance. ZERO new error classes; ZERO `args.ts` change; ZERO Layer 1 markdown change; ZERO new schema work; ZERO `verify-and-advance.ts` change. The smallest delta of any Epic 3 story).

It does **NOT**:

- **Implement runtime `failurePolicies` lookup.** Forward-deferred to Story 6.x.
- **Implement multi-persona sequential dispatch.** Forward-deferred to Stories 4.1 + 5.*.
- **Implement Story 4.1's loop runner.** Forward-deferred to Epic 4.
- **Modify `forceUnlock`.** Story 6.x territory.
- **Modify `verify-and-advance.ts`.** Lock-held runner unchanged.
- **Modify Layer 1 markdown (`commands/bmad-next.md`).** No protocol change.
- **Add a new error class.** Registry stays at 16 codes.
- **Migrate `src/lock/lock.ts` to `src/io/lock.ts`.** Path is canonical per Story 1.4.
- **Extend `skipAcquire` to `--watch` or `--doctor`.** Out of the five-flag enumeration.
- **Add a config-loader knob for `lock.skipAcquire`.** Forward-deferred to Story 6.1.

## Acceptance Criteria

The acceptance criteria below are reproduced **verbatim** from `_bmad-output/planning-artifacts/epics.md` §Story 3.10 (lines 876-885, BDD Given/When/Then format). Lines and AC labelling preserved.

**Acceptance Criteria:**

**Given** `src/io/lock.ts` updated to support a `skipAcquire: boolean` flag
**When** any of the five read-only flags is supplied
**Then** lock acquisition is skipped and the command runs in pure-read mode
**Given** an active Stepper invocation holds the lock
**When** a CI script runs `--export-state`
**Then** it succeeds without `LOCK_CONTENTION`
**And** integration test runs concurrent active + read-only invocations and asserts both succeed
**And** all read-only flags map to action=`report` with no state mutation

> **Path-rename note**: AC line 878 references `src/io/lock.ts`; the actual landing path is **`src/lock/lock.ts`** per Story 1.4's foundational-tier module placement. See §Context Summary "src/io/lock.ts vs src/lock/lock.ts" + §Open Question 1.

## Tasks / Subtasks

- [ ] **Task 0 — Verify pre-conditions (AC: all)**
  - [ ] 0.1 Confirm Story 3.1 (`record_last_attempted_last_failure_reason_on_halt`) is `done` per `_bmad-output/implementation-artifacts/sprint-status.yaml:71`.
  - [ ] 0.2 Confirm Story 3.2 (`--resume` Flag) is `done` per `sprint-status.yaml:72`.
  - [ ] 0.3 Confirm Story 3.3 (`--dry-run` Flag) is `done` per `sprint-status.yaml:73`. Read `src/integration/dry-run-no-writes.test.ts` for the `walkFiles`-based no-mutation snapshot pattern; Story 3.10's integration test extends this pattern to ALL FIVE read-only flags.
  - [ ] 0.4 Confirm Story 3.4 (`--step` and Scope Flags) is `done` per `sprint-status.yaml:74`.
  - [ ] 0.5 Confirm Story 3.5 (`--persona` + `--include-optional`/`--no-optional`) is `done` per `sprint-status.yaml:75`.
  - [ ] 0.6 Confirm Story 3.6 (`--explain` Reasoning Trace) is `done` per `sprint-status.yaml:76`. Verify the `--explain` short-circuit at `src/commands/next/run.ts:1521-1628` returns `reportWithMessage(...)` on the happy path.
  - [ ] 0.7 Confirm Story 3.7 (`--list` Candidate Next Steps) is `done` per `sprint-status.yaml:77`. Verify the `--list` short-circuit at `src/commands/next/run.ts:1630-1696` returns `reportWithMessage(...)` on the happy path.
  - [ ] 0.8 Confirm Story 3.8 (`--diff-state` and `--export-state`) is `done` per `sprint-status.yaml:78`. Read `src/integration/export-state-no-lock.test.ts` for the spawn pattern; read `src/state/diff.ts` + `src/state/export.ts` for the helper composition; both helpers compose `loadStateUnlocked` + `recomputeStateUnlocked` (Story 3.8's unlocked sibling).
  - [ ] 0.9 Confirm Story 3.9 (`--watch` Live Transcript Tail) is `done` per `sprint-status.yaml:79`. Note: `--watch` is NOT in the Story 3.10 five-flag enumeration; structurally lock-free without the `skipAcquire` opt-in.
  - [ ] 0.10 Confirm Story 1.4 (`file-lock-with-heartbeat`) is `done` per `sprint-status.yaml:49`. Read `src/lock/lock.ts:46-150` (the `LockOptions` interface + `defaultLogger` + `defaultIsPidAlive`) + `:262-388` (the `acquire(...)` body) — Story 3.10 INSERTS the `skipAcquire` field on `LockOptions` + an EARLY-EXIT branch at the top of `acquire(...)`.
  - [ ] 0.11 Confirm Story 1.7 (`src/commands/next/args.ts`) declares all FIVE read-only flag names: `exportState` line 164, `diffState` line 165, `dryRun` line 154, `list` (verify line number), `explain` (verify line number). All FIVE in `booleanKeys` set. **No args change needed for Story 3.10.**
  - [ ] 0.12 Confirm `src/state/load.ts` exports `loadStateUnlocked(opts?)` per Story 1.6 — used by `--explain`, `--list`, `--diff-state`, `--export-state` short-circuits in `run.ts`.
  - [ ] 0.13 Confirm `src/state/recompute.ts` exports `recomputeStateUnlocked(opts?)` per Story 3.8 — used by `--diff-state` short-circuit.
  - [ ] 0.14 Confirm `src/integration/no-write-outside-scope.test.ts:119-140` defines `walkFiles(rootDir): Promise<Map<relPath, FileSnapshot>>` — Story 3.10's integration test reuses this helper.
  - [ ] 0.15 Confirm `src/lock/integration/concurrent-acquire.test.ts:49-58` defines `synthesiseHeldLock(pidPayload, mtimeMs): Promise<void>` (or equivalent) — Story 3.10's integration test reuses the held-lock synthesis pattern (or duplicates the ~10-line helper for clarity).
  - [ ] 0.16 Confirm `src/errors.ts` registry stays at 16 codes (`bun test src/errors.test.ts`: 10 pass, 197 expects). Story 3.10 ships ZERO new error classes — the `skipAcquire` no-op branch does NOT throw; the read-only flags' upstream throws (`CorruptStateError`, `PathologicalInputError`) flow through `haltFromError` per existing v0.1 semantics.
  - [ ] 0.17 Read epics.md §Story 3.10 lines 870-885 verbatim. Confirm the AC text in §Acceptance Criteria above is character-identical to lines 876-885.
  - [ ] 0.18 Read prd.md §FR52 line 743 (`Non-interactive callers can read state without holding the project lock (--export-state, --list, --explain, --dry-run, --diff-state)`); §FR54 line 745 (stdout/stderr discipline).
  - [ ] 0.19 Read architecture.md §line 1382 (`FR52 → src/state/export.ts, src/state/diff.ts | src/io/lock.ts (acquire skipped)`); §line 1672 (`run.ts is read-only / lock-free`); §line 1660 (AR9 protocol concretization).
  - [ ] 0.20 Read epic-2-retrospective.md §Forward Action Items — confirm Story 3.10 is the FINAL Epic 3 deliverable.
  - [ ] 0.21 Read Story 3.9's Forward Dependencies §Story 3.10 entry — confirms 3.9's `--watch` is OUT of the five-flag enumeration (structurally lock-free without the opt-in).
  - [ ] 0.22 Confirm baseline `bun run check` exits 0 with the post-Story-3.9 baseline (~711 pass / 0 fail / ~2644 expects / 55 files per Story 3.9 final).
  - [ ] 0.23 Confirm Bun host version satisfies AR2 (Bun >= 1.3). Run `bun --version`; record in Completion Notes.
  - [ ] 0.24 Verify the AR41 boundary check at `src/commands/next/run.test.ts:606-638` — programmatic source-content scan REJECTS `from "../../lock/"` AND `acquire(` patterns in `src/commands/next/run.ts`. Story 3.10 does NOT add a `src/lock/` import to `run.ts`; the boundary check continues to pass unchanged.

- [ ] **Task 1 — Add `skipAcquire: boolean` field to `LockOptions` (AC: line 878)**
  - [ ] 1.1 Open `src/lock/lock.ts`. Locate the `LockOptions` interface at lines 63-84.
  - [ ] 1.2 Append a new optional field AFTER `logger?: LockLogger;`:
    ```typescript
    /**
     * Skip lock acquisition (Story 3.10 / FR52). When `true`, `acquire(opts)`
     * returns a sentinel no-op `LockHandle` IMMEDIATELY — no `mkdir`, no
     * staleness evaluation, no pid file, no heartbeat. The handle's
     * `release()` is a no-op (resolves immediately).
     *
     * Use case: read-only flags (`--export-state`, `--list`, `--explain`,
     * `--dry-run`, `--diff-state`) that need a structurally-clean escape
     * hatch from the lock-acquiring code path. v0.1 callers do NOT exercise
     * this flag — the read-only flags structurally never reach `acquire(...)`
     * in `run.ts` per AR8 + architecture §line 1672. The flag is
     * forward-proofing for Story 6.x lock-acquiring read flows + AC verbatim
     * compliance per epics.md line 878.
     *
     * Defense-in-depth: should a future story accidentally route a
     * read-only flag through a lock-acquiring path, this flag provides
     * the right-answer-off-the-shelf without forcing a refactor.
     */
    readonly skipAcquire?: boolean;
    ```
  - [ ] 1.3 Verify the field is OPTIONAL (`readonly skipAcquire?: boolean`) — backward-compat: existing callers passing `undefined` or omitting the field continue to work as before.
  - [ ] 1.4 No change to `ResolvedConfig` (the `skipAcquire` flag is consumed BEFORE `resolveConfig` in `acquire`; never reaches `ResolvedConfig`).

- [ ] **Task 2 — Implement EARLY-EXIT no-op branch in `acquire()` (AC: line 878-880)**
  - [ ] 2.1 Open `src/lock/lock.ts`. Locate the `acquire(opts?: LockOptions): Promise<LockHandle>` body at lines 280-388.
  - [ ] 2.2 INSERT the EARLY-EXIT branch as the FIRST statement of the body (BEFORE `const config = resolveConfig(opts);`):
    ```typescript
    // Story 3.10 (epic AC line 878-880): when skipAcquire is true, return a
    // sentinel no-op handle IMMEDIATELY. ZERO filesystem mutation; ZERO
    // heartbeat timer; ZERO scope-check; ZERO log emission. The handle's
    // release() is also a no-op. Use case: FR52 read-only flag cluster
    // (--export-state, --list, --explain, --dry-run, --diff-state) — the
    // v0.1 callers do NOT reach this path (run.ts is structurally lock-
    // free per AR8 + architecture §line 1672); this is forward-proofing
    // + AC verbatim compliance.
    if (opts?.skipAcquire === true) {
      const sentinelAt = new Date().toISOString();
      let released = false;
      const release = async (): Promise<void> => {
        if (released) {
          return;
        }
        released = true;
      };
      return {
        lockDir: "<no-op:skipAcquire>",
        pidFile: "<no-op:skipAcquire>",
        acquiredAt: sentinelAt,
        release,
      };
    }
    ```
  - [ ] 2.3 Verify the EARLY-EXIT branch is the FIRST statement of `acquire` — placed BEFORE `assertWithinScope(LOCK_DIR_REL)` (line 289-290) so the no-op path skips the scope check entirely. Rationale: scope-check is a defensive guard for the canonical lock dir; the no-op path doesn't touch any path; the check would be wasteful.
  - [ ] 2.4 The sentinel `lockDir` and `pidFile` strings (`"<no-op:skipAcquire>"`) are machine-recognisable but never refer to a real path. Callers MUST NOT pass these strings to `fs.access(...)` etc. — they are surface-level markers only. Document the convention in JSDoc.
  - [ ] 2.5 The `acquiredAt` is the current ISO timestamp at the no-op call (consistent with the regular path's `new Date().toISOString()` at line 337).
  - [ ] 2.6 The `release()` no-op is idempotent (second call is a no-op too). The `released` boolean follows the regular-path pattern at lines 364-376.
  - [ ] 2.7 NO `setInterval(heartbeat)` registration. Verified by Test C (Task 5.3).
  - [ ] 2.8 NO `assertWithinScope` call. NO `mkdir`. NO `evaluateStaleness`. NO `Bun.write(pidFile, ...)`. NO `config.logger.info(...)`. ALL skipped via the early return.
  - [ ] 2.9 Update the `acquire()` JSDoc at lines 262-279 to document the `skipAcquire` carve-out:
    ```typescript
    /**
     * ... (existing docstring) ...
     *
     * **Story 3.10 (epic AC line 878-880; FR52)**: when `opts.skipAcquire === true`,
     * the function returns a sentinel no-op `LockHandle` IMMEDIATELY — ZERO
     * filesystem mutation, ZERO heartbeat timer. The handle's `release()` is
     * also a no-op. Use case: read-only flag cluster (`--export-state`,
     * `--list`, `--explain`, `--dry-run`, `--diff-state`) — though v0.1 callers
     * do NOT reach this path (run.ts is structurally lock-free per AR8 +
     * architecture §line 1672); the flag is forward-proofing for Story 6.x
     * lock-acquiring read flows + AC verbatim compliance.
     */
    ```
  - [ ] 2.10 Update the module-level JSDoc at lines 1-44 to mention the `skipAcquire` carve-out in the "Public API" section.

- [ ] **Task 3 — Update `acquire()` JSDoc + module JSDoc (AC: line 878)**
  - [ ] 3.1 Per Task 2.9, append the `skipAcquire` paragraph to the `acquire()` JSDoc at lines 262-279.
  - [ ] 3.2 Per Task 2.10, append a `skipAcquire` paragraph to the module-level JSDoc at lines 1-44 (in the "Public API" section, BELOW the `acquire(opts?)` summary).
  - [ ] 3.3 The JSDoc explicitly enumerates the FIVE read-only flag names (per AC line 873): `--export-state`, `--list`, `--explain`, `--dry-run`, `--diff-state`. NOT `--watch` (per Story 3.9 §Forward Dependencies — `--watch` is structurally lock-free without the opt-in).
  - [ ] 3.4 The JSDoc cites architecture §line 1672 + AR8 (the v0.1 invariant); cites epic AC line 878-880 (the contract); cites FR52 (the requirement).

- [ ] **Task 4 — Document the bounded list of v0.1 callers (AC: line 878)**
  - [ ] 4.1 In the JSDoc per Task 2.9 + Task 3.1, document: "v0.1 callers do NOT exercise this flag — the read-only flags structurally never reach `acquire(...)` in `run.ts` per AR8 + architecture §line 1672. The flag is forward-proofing for Story 6.x lock-acquiring read flows + AC verbatim compliance per epics.md line 878."
  - [ ] 4.2 The bounded list of v0.1 callers is **EMPTY** — no production code path in v0.1 calls `acquire({ skipAcquire: true })`. Tests exercise the flag (Tasks 5.A-5.G); production code does not.
  - [ ] 4.3 If a future story DOES route a read-only flag through `acquire`, the caller MUST pass `acquire({ skipAcquire: true })` explicitly per the documented convention. The flag is the right-answer-off-the-shelf; the caller MUST NOT assume the lock-free posture is structural.

- [ ] **Task 5 — Update `src/lock/lock.test.ts` with `skipAcquire` test cases (AC: line 878-880)**
  - [ ] 5.1 Open `src/lock/lock.test.ts`. APPEND a new `describe("acquire — skipAcquire (Story 3.10 / FR52)", ...)` block AT THE END of the file (after the existing `describe` blocks).
  - [ ] 5.2 Reuse the existing `beforeEach` mkdtemp + `afterEach` rm pattern at lines 52-59 — Story 3.10 does NOT need a separate fixture (the no-op path doesn't touch any path; the existing tmpdir is unused by the no-op tests).
  - [ ] 5.3 **Test A (sentinel handle shape)**: `const handle = await acquire({ skipAcquire: true, logger: makeCapturingLogger() });`. Assert (a) `handle.lockDir === "<no-op:skipAcquire>"`, (b) `handle.pidFile === "<no-op:skipAcquire>"`, (c) `handle.acquiredAt` parses as a valid ISO timestamp (`new Date(handle.acquiredAt).toString() !== "Invalid Date"`), (d) `typeof handle.release === "function"`.
  - [ ] 5.4 **Test B (no filesystem mutation)**: invoke `acquire({ skipAcquire: true, ... })`; assert `fs.access(canonicalLockDir)` REJECTS (the lock dir was NOT created). Compare with the regular path's behaviour at line 100-101 (regular path creates the dir).
  - [ ] 5.5 **Test C (no heartbeat timer registered)**: snapshot global timer count via Bun-equivalent `setInterval` spy (or via process.\_getActiveHandles() count if available); invoke `acquire({ skipAcquire: true })`; assert NO new active timer was created. Compare with the regular path's heartbeat at line 348-356.
  - [ ] 5.6 **Test D (release idempotent)**: invoke `acquire({ skipAcquire: true })`; call `await handle.release()`; assert no throw; call `await handle.release()` AGAIN; assert no throw (idempotent).
  - [ ] 5.7 **Test E (succeeds with held-live-lock)**: synthesise a held lock per `synthesiseHeldLock(pidPayload, Date.now())` (mirroring `concurrent-acquire.test.ts:49-58`); invoke `acquire({ lockDir, skipAcquire: true, isPidAlive: () => true, logger: silentLogger })`; assert no throw; assert the synthesised lock dir is STILL PRESENT after the call (`fs.access(lockDir)` resolves). This is the AC-line-881-883 verbatim scenario: an active Stepper invocation holds the lock; a CI script's read-only flag (`skipAcquire: true`) succeeds without touching the lock.
  - [ ] 5.8 **Test F (skipAcquire: false)**: invoke `acquire({ lockDir, skipAcquire: false, logger: makeCapturingLogger() })`; assert the regular happy path still works (lock dir created; pid file written; handle returned). Regression sentinel.
  - [ ] 5.9 **Test G (skipAcquire omitted)**: invoke `acquire({ lockDir, logger: makeCapturingLogger() })` (no `skipAcquire` field); assert the regular happy path still works. Backward-compat sentinel.
  - [ ] 5.10 Each test follows AR35 tmpdir-per-test discipline; uses the existing `beforeEach`/`afterEach` factory.
  - [ ] 5.11 Test counts projection: ~7 new tests / ~25-35 new expects in `src/lock/lock.test.ts`.

- [ ] **Task 6 — Update `src/commands/next/run.test.ts` with action=report invariant assertions (AC: line 885)**
  - [ ] 6.1 Open `src/commands/next/run.test.ts`. APPEND a new `describe("runNext — Story 3.10 read-only flags map to action=report", ...)` block AT THE END of the file (after the existing Story 3.9 describe block).
  - [ ] 6.2 Reuse the module-level `beforeEach`/`afterEach` + `commonOpts`/`writeMinimalState` factories.
  - [ ] 6.3 **Test A (action=report invariant — five-flag enumeration)**: for each of the FIVE read-only flags (`--export-state`, `--diff-state`, `--explain`, `--list`, `--dry-run`), invoke `runNext({ argv: ["--<flag>"] })`; assert (a) `result.exitCode === 0` OR `result.exitCode === 1` (the latter for halt-on-malformed-state — but the happy path is 0); (b) `result.action.action === "report"`. Five sub-assertions.
  - [ ] 6.4 **Test B (no acquire invocation)**: spy on `acquire` from `src/lock/lock.ts` (e.g., via `import * as lock from "../../lock/lock.ts"; const spy = spyOn(lock, "acquire");`). For each of the FIVE read-only flags, invoke `runNext`; assert `spy.toHaveBeenCalledTimes(0)`. Defense-in-depth assertion. Verifies the AR8 + architecture §line 1672 lock-free contract structurally.
  - [ ] 6.5 **Test C (no FS mutation)**: snapshot tmpdir before each invocation; invoke `runNext` with `argv: ["--<flag>"]`; snapshot AFTER; assert byte-identical inventory (zero new files; zero modified mtimes; zero modified contents). Reuses `walkFiles` helper from `src/integration/no-write-outside-scope.test.ts:119-140` — may need to re-export or copy. Mirrors Story 3.3's `dry-run-no-writes.test.ts` pattern, extended to ALL FIVE flags.
  - [ ] 6.6 Test counts projection: ~3 new top-level tests (Test A + Test B + Test C); each iterates over the 5-flag enumeration (so ~15 sub-assertions); ~30-50 new expects in `src/commands/next/run.test.ts`.
  - [ ] 6.7 Tests should NOT exercise the new `acquire({ skipAcquire: true })` runtime path — that's Task 5's surface. Task 6 verifies the `runNext` body's existing structurally-lock-free contract.

- [ ] **Task 7 — Create `src/integration/non-locking-read-flags.test.ts` (AC: line 884)**
  - [ ] 7.1 Create `src/integration/non-locking-read-flags.test.ts` (modelled on Story 3.8's `export-state-no-lock.test.ts` + Story 3.9's `watch-fresh-project.test.ts` spawn pattern; reuses the held-lock synthesis pattern from `src/lock/integration/concurrent-acquire.test.ts:49-58`).
  - [ ] 7.2 `beforeEach` mkdtemp; `afterEach` rm. Tmpdir layout:
    - `<tmp>/_bmad-output/.stepper/state.yaml` — minimal valid state.yaml fixture (mirroring Story 3.8's `export-state-no-lock.test.ts` fixture).
    - `<tmp>/_bmad-output/.stepper/state.yaml.lock/` — synthesised held lock (per `synthesiseHeldLock`).
    - `<tmp>/_bmad-output/.stepper/state.yaml.lock/pid` — pid file with `pid: process.pid + 100_000` (a "live" PID that won't match the test process), `hostname: "concurrent-test-other-host"`, `acquiredAt: <iso>`, `heartbeatIntervalMs: 5000`, mtime = now (recent — not stale).
  - [ ] 7.3 **Test A (`--export-state` with held lock)**: spawn `bun run src/commands/next/run.ts -- --export-state` (with `STEPPER_INTERNAL_ROOT` env var or `--state-path` injected to point at the fixture); capture stdout + exit code; assert (a) exit code === 0 (NOT 4 — the lock contention exit code per FR53), (b) stdout is parseable JSON with the 7 export fields per Story 3.8's `StateExportV1Schema`, (c) NO `LOCK_CONTENTION` substring in stderr, (d) the synthesised lock dir is STILL PRESENT after the spawn (`fs.access(<tmp>/_bmad-output/.stepper/state.yaml.lock)` resolves), (e) the synthesised pid file's mtime is UNCHANGED (the read-only spawn did NOT touch the heartbeat).
  - [ ] 7.4 **Test B (`--diff-state` with held lock)**: spawn `bun run src/commands/next/run.ts -- --diff-state`; assert (a) exit code === 0, (b) stdout contains a divergence-report substring (per Story 3.8's `humanReadable` format — e.g., `lastSuccessfulStep: cached=...; recomputed=...` OR an "in-sync" message), (c) NO `LOCK_CONTENTION` substring, (d) the synthesised lock dir is STILL PRESENT.
  - [ ] 7.5 **Test C (`--explain` with held lock)**: spawn `bun run src/commands/next/run.ts -- --explain`; assert (a) exit code === 0, (b) stdout contains the multi-line explain trace per Story 3.6's `formatExplainMessage` format, (c) NO `LOCK_CONTENTION`, (d) synthesised lock dir still present.
  - [ ] 7.6 **Test D (`--list` with held lock)**: spawn `bun run src/commands/next/run.ts -- --list`; assert (a) exit code === 0, (b) stdout contains the candidate enumeration per Story 3.7's 4-component per-line format, (c) NO `LOCK_CONTENTION`, (d) synthesised lock dir still present.
  - [ ] 7.7 **Test E (`--dry-run` with held lock)**: spawn `bun run src/commands/next/run.ts -- --dry-run`; assert (a) exit code === 0, (b) stdout contains the dispatch-spec preview per Story 3.3's preview format (`Dry-run: would dispatch ` substring), (c) NO `LOCK_CONTENTION`, (d) synthesised lock dir still present.
  - [ ] 7.8 **No state mutation invariant**: each test takes a `walkFiles(<tmp>)` snapshot BEFORE the spawn and AFTER the spawn; asserts byte-identical inventory MODULO the synthesised lock dir's `pid` file (which was written by the test, not the spawn). The spawn MUST NOT add/remove/modify any file in the tmpdir other than the synthesised lock files (which are test-owned, not spawn-owned).
  - [ ] 7.9 **`--watch` is OUT of scope** per AC line 873 + Story 3.9 §Forward Dependencies — Story 3.10's integration test does NOT spawn `--watch`. The watcher's lock-free posture is a separate forward-tracker.
  - [ ] 7.10 Test counts projection: ~5 tests (one per flag) / ~30-40 expects in `src/integration/non-locking-read-flags.test.ts`.

- [ ] **Task 8 — Verify the action=report + no-state-mutation invariants for the FIVE read-only flags (AC: line 885)**
  - [ ] 8.1 Per Task 6.3, the action=report invariant is asserted programmatically via `result.action.action === "report"` for ALL FIVE flags.
  - [ ] 8.2 Per Task 6.5, the no-state-mutation invariant is asserted programmatically via tmpdir snapshot diff for ALL FIVE flags.
  - [ ] 8.3 Per Task 7.3-7.7, the integration test asserts the FIVE flags succeed concurrent with a held lock (the AC-line-884 + AC-line-885 verbatim scenarios).
  - [ ] 8.4 Cross-cutting verification: the FIVE flags' short-circuits in `src/commands/next/run.ts` ALL invoke `reportWithMessage(...)` per the existing v0.1 contract. Story 3.10 does NOT modify these short-circuits.

- [ ] **Task 9 — Update `_bmad-output/implementation-artifacts/sprint-status.yaml` + record completion (AC: all)**
  - [ ] 9.1 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: flip `3-10-non-locking-read-flags` from `backlog` (current) to `ready-for-dev` (this Story 3.10 create-story step). At story completion (Step 9 of bmad-dev-story workflow), flip to `review` (intermediate `in-progress` during dev). `epic-3: in-progress` is preserved until ALL Epic 3 stories reach `done` — at that point, the epic flip from `in-progress → done` happens manually after the retro (per sprint-status.yaml line 17 — `in-progress → done: Manually when all stories in epic completed`).
  - [ ] 9.2 Flip the story file frontmatter `status: ready-for-dev → review` at end of bmad-dev-story workflow per the workflow's Step 9 contract. (At create-story time, the value is `ready-for-dev`.)
  - [ ] 9.3 sprint-status.yaml retains its original schema (no new fields).

- [ ] **Task 10 — Run the full test suite + `bun run check` (AC: all)**
  - [ ] 10.1 `bun run check` exit 0. Test delta projection: ~+15-25 tests (Tests A-G in `lock.test.ts` + Tests A-C in `run.test.ts` + Tests A-E in `non-locking-read-flags.test.ts`), ~+85-130 expects.
  - [ ] 10.2 Post-Story-3.10 baseline projection: ~726-736 pass / 0 fail / ~2729-2774 expects / 56 files (1 new test file: `non-locking-read-flags.test.ts`).
  - [ ] 10.3 Confirm `src/errors.ts` registry stays at **16 codes** (`bun test src/errors.test.ts`: 10 pass, 197 expects). Story 3.10 ships ZERO new error classes.
  - [ ] 10.4 Confirm `bunx tsc --noEmit` exits 0.
  - [ ] 10.5 Confirm AR41 boundary check at `run.test.ts:606-638` still passes — Story 3.10 does NOT add any new `src/lock/` import to `run.ts`; the boundary check is unchanged.
  - [ ] 10.6 Confirm `src/lock/lock.test.ts` (existing) tests STILL PASS — Story 3.10's modification to `acquire(...)` is purely additive (an EARLY-EXIT branch); the regular happy path is unchanged.

## Dev Notes

### File List

#### Modified Files

- **`src/lock/lock.ts`** (~404 → ~440-450 lines):
  - Adds `readonly skipAcquire?: boolean` field to the `LockOptions` interface (after `logger?: LockLogger;` at line 84).
  - Adds an EARLY-EXIT branch at the top of `acquire(...)` body (BEFORE `assertWithinScope(LOCK_DIR_REL)` at line 289-290): when `opts?.skipAcquire === true`, returns a sentinel no-op `LockHandle` IMMEDIATELY.
  - Updates the `acquire(...)` JSDoc at lines 262-279 to document the `skipAcquire` carve-out.
  - Updates the module-level JSDoc at lines 1-44 to mention the `skipAcquire` carve-out in the "Public API" section.

- **`src/lock/lock.test.ts`** (~510 → ~600-630 lines):
  - APPENDS a new `describe("acquire — skipAcquire (Story 3.10 / FR52)", ...)` block with 7 colocated test cases (Tests A-G covering sentinel handle shape, no-FS-mutation, no-heartbeat-timer, idempotent release, succeeds-with-held-live-lock, regression sentinel skipAcquire=false, backward-compat sentinel skipAcquire=omitted).

- **`src/commands/next/run.test.ts`** (~3692 → ~3750-3770 lines):
  - APPENDS a new `describe("runNext — Story 3.10 read-only flags map to action=report", ...)` block with 3 colocated test cases (Test A action=report invariant for FIVE flags; Test B no `acquire` invocation spy; Test C no FS mutation snapshot diff).

#### New Files

- **`src/integration/non-locking-read-flags.test.ts`** (~150-200 lines): the AC-line-884 enforcement integration test. 5 spawn tests (one per flag) verifying concurrent-active+read-only succeeds without `LOCK_CONTENTION`. Reuses the `synthesiseHeldLock` pattern from `src/lock/integration/concurrent-acquire.test.ts:49-58` + the spawn pattern from Story 3.8's `export-state-no-lock.test.ts` + Story 3.9's `watch-fresh-project.test.ts`. Asserts (a) exit code 0 for all 5 flags, (b) appropriate stdout shape per flag, (c) no `LOCK_CONTENTION` in stderr, (d) the synthesised lock dir is still present after the spawn, (e) no FS mutation in tmpdir (modulo the synthesised lock files which are test-owned).

#### Sprint-Status

- **`_bmad-output/implementation-artifacts/sprint-status.yaml`**: flip `3-10-non-locking-read-flags: backlog → ready-for-dev` (at create-story time). Confirm `epic-3: in-progress` (preserved until manually flipped to `done` after the retro).

### Architecture Compliance

- **AR8** (lock-free `run.ts` / lock-held `verify-and-advance.ts`): EXTENDED. The `skipAcquire` flag formalises the "no lock acquired" contract for the read-only-flag cluster; v0.1 invariant ALREADY HOLDS structurally per architecture §line 1672. The runner-side AR41 boundary check at `run.test.ts:606-638` continues to pass; Story 3.10's modification to `src/lock/lock.ts` does NOT introduce any new `src/lock/` import to `run.ts` (the `skipAcquire` flag's only v0.1 caller is the test surface; production code does not invoke).
- **AR9** (single discriminated-union JSON line on stdout): UNCHANGED + VERIFIED. The five read-only flags map to `action: "report"` per existing v0.1 semantics; Task 6.3 asserts via runNext result inspection.
- **AR11** (`state.yaml` at canonical path): UNCHANGED — Story 3.10 does NOT touch state.yaml.
- **AR21 + AR22** (errors carry code + actionable hint): UNCHANGED. ZERO new error classes.
- **AR33** (function & error semantics; throw not Result; no console.\*; async/await): UNCHANGED. The `skipAcquire` no-op branch is async; throw not Result; ZERO `console.*` calls; sentinel handle's `release()` resolves `undefined`.
- **AR41** (boundary graph): UNCHANGED. `src/lock/lock.ts` is foundational; Story 3.10's modification stays within the module's existing boundary; no new imports added.
- **AR42** (test discipline): EXTENDED. New `describe` block in `src/lock/lock.test.ts` (~7 colocated tests); new `describe` block in `src/commands/next/run.test.ts` (~3 colocated tests); new integration test `src/integration/non-locking-read-flags.test.ts` (~5 spawn tests). Each test follows AR35 tmpdir-per-test discipline; ZERO hard-coded `/tmp/...` paths.

### Acceptance Criteria Mapping

- **AC line 878-880** (`src/io/lock.ts` updated to support a `skipAcquire: boolean` flag → any of the five read-only flags is supplied → lock acquisition is skipped and the command runs in pure-read mode): delivered by **Tasks 1 + 2 + 3 + 4**. Tests A-G in `src/lock/lock.test.ts` (Task 5) verify the no-op handle shape, no-FS-mutation, no-heartbeat-timer, idempotent release, succeeds-with-held-live-lock, regression sentinels. **NOTE**: AC source path `src/io/lock.ts` is stale wording — the actual landing path is `src/lock/lock.ts` per Story 1.4's foundational-tier module placement; documented in §Open Question 1.
- **AC line 881-883** (active Stepper invocation holds the lock → CI script runs `--export-state` → succeeds without `LOCK_CONTENTION`): delivered by **Tasks 5.7 + 7.3**. Test E in `lock.test.ts` (synthesised held lock + `acquire({ skipAcquire: true })` → no throw). Test A in `non-locking-read-flags.test.ts` (subprocess spawn `bun run --export-state` against held-lock fixture → exit 0 + parseable JSON + no LOCK_CONTENTION).
- **AC line 884** (integration test runs concurrent active + read-only invocations and asserts both succeed): delivered by **Task 7**. Tests A-E in `non-locking-read-flags.test.ts` verify concurrent active (synthesised held lock) + read-only (subprocess spawn) succeed for ALL FIVE flags.
- **AC line 885** (all read-only flags map to action=`report` with no state mutation): delivered by **Tasks 6.3 + 6.5**. Test A in `run.test.ts` asserts `action.action === "report"` for ALL FIVE flags; Test C asserts byte-identical tmpdir snapshot for ALL FIVE flags.

### v0.1 Design Decisions

#### `src/lock/lock.ts` vs `src/io/lock.ts` (path-rename — adjudicated)

The AC source at epics.md line 878 references `src/io/lock.ts`; the architecture §line 1382 references `src/io/lock.ts` (FR52 → `src/io/lock.ts (acquire skipped)`). **However**, Story 1.4's foundational-tier module placement put the lock module at **`src/lock/lock.ts`** (per Glob `src/lock/**/*.ts` evidence). Story 3.10 lands the `skipAcquire` flag on the actual file `src/lock/lock.ts`. **Trade-off**: AC-source-strict would force renaming `src/lock/lock.ts → src/io/lock.ts` (a CROSS-MODULE refactor that violates AR41 — the lock module is foundational; `src/io/` is a different sub-tree); convention-strict aligns with Story 1.4's existing layout. v0.1 chooses convention-strict; tracked as Open Question 1.

#### `skipAcquire` flag is forward-proofing — v0.1 production code does NOT exercise it

Per AC line 878, the flag MUST be added to `lock.ts`. v0.1 production code does NOT call `acquire({ skipAcquire: true })` — the read-only flags structurally never reach `acquire(...)` in `run.ts` per AR8 + architecture §line 1672. The flag is the "right answer off-the-shelf" for any future story that accidentally routes a read-only flag through a lock-acquiring path. **Trade-off**: shipping the flag without a v0.1 caller is "dead code" in the production sense; not shipping the flag would violate AC line 878 verbatim. v0.1 chooses AC-strict + forward-proofing.

#### Sentinel handle vs throw on `skipAcquire: true`

Two implementations:
- **Option A (sentinel handle)**: return a no-op `LockHandle` with sentinel `lockDir`/`pidFile` strings; `release()` is a no-op. Caller treats the handle exactly like a regular handle.
- **Option B (throw `SkipAcquireError`)**: throw a typed error indicating "this caller should not call acquire when skipAcquire is true". Caller MUST short-circuit at compile time.

**v0.1 conservative chooses Option A (sentinel handle)** — preserves the regular caller pattern (caller calls `acquire(...)`, gets a handle, uses `try/finally` for `release(...)`); the no-op semantics are transparent. **Trade-off**: sentinel handle = drop-in replacement for the regular path; throw = forces caller awareness. v0.1 chooses transparency. Tracked as Open Question 2.

#### Sentinel `lockDir`/`pidFile` strings: `<no-op:skipAcquire>`

The sentinel strings MUST be machine-recognisable (so future callers / tests can detect the no-op path) but never refer to a real path. v0.1 chooses `<no-op:skipAcquire>` (literal angle brackets — invalid as a real filesystem path on most platforms; clearly marker-only). Alternative: empty string `""`, or a more verbose marker like `"NO-OP-SKIP-ACQUIRE-NEVER-WRITTEN"`. v0.1 chooses brevity + clarity.

#### `release()` no-op vs throw on the sentinel handle

v0.1 chooses no-op `release()` (idempotent: first + second + Nth call all resolve `undefined`). **Rationale**: caller pattern uses `try/finally { handle.release() }` — the no-op `release()` is safe in this pattern. Throw would force the caller to pre-check `handle.lockDir === "<no-op:skipAcquire>"` before calling `release(...)` — an unnecessary surface. Tracked as Open Question 3.

#### Should the EARLY-EXIT branch be at the TOP of `acquire(...)` (before `resolveConfig`) or AFTER `resolveConfig`?

v0.1 chooses TOP (before `resolveConfig`). **Rationale**: `resolveConfig` resolves the canonical lock dir + applies defaults to heartbeat / stale thresholds — none of which are needed for the no-op path. Skipping `resolveConfig` is a micro-optimization (sub-millisecond) AND avoids unnecessary `path.resolve(process.cwd(), LOCK_DIR_REL)` work. Trade-off: TOP means the branch sees raw `opts` (not the resolved config); BOTTOM means the branch sees the fully-resolved config but does nothing with it. v0.1 chooses TOP for minimal allocation. Tracked as Open Question 4.

#### Integration test scope: 5 flags vs 1 flag (AC-strict)

AC line 884 says: "integration test runs concurrent active + read-only invocations and asserts both succeed". Two interpretations:
- **AC-strict**: ONE integration test covering ONE read-only flag (any of the five) verifying concurrent active + read-only succeed.
- **Comprehensive**: FIVE integration tests, one per flag, verifying concurrent active + each-of-five-read-only succeed.

**v0.1 conservative chooses Comprehensive (5 tests)** — the AC's ambiguity favours coverage; the per-flag spawn cost is bounded (~1 second per test); the test file structure is parameterised. **Trade-off**: AC-strict = 1 test (5x faster); comprehensive = 5 tests (better coverage; surfaces per-flag regressions). v0.1 chooses comprehensive. Tracked as Open Question 5.

#### Held-lock synthesis: reuse `concurrent-acquire.test.ts:49-58` helper or inline it

v0.1 chooses INLINE the ~10-line helper for clarity (the integration test is in `src/integration/`, not `src/lock/integration/`; cross-module helper imports add coupling). **Trade-off**: reuse = DRY (single source of truth for synthesis); inline = self-contained test file. v0.1 chooses self-contained.

### Carry-overs from Story 3.9

- **Story 3.9's `--watch` is OUT of the five-flag enumeration**: per AC line 873 + Story 3.9 §Forward Dependencies (line 603). Story 3.10's `skipAcquire` flag does NOT extend to `--watch`; the watcher's lock-free posture is structural without the opt-in.
- **Story 3.9's spawn pattern (`watch-fresh-project.test.ts`)**: STRUCTURAL TEMPLATE for `non-locking-read-flags.test.ts` per Task 7. Same `Bun.spawn` + capture stdout + assert exit-code pattern.
- **Story 3.9's lock-free invariant via source-content scan**: PARTIALLY INHERITED. Story 3.9's Test J source-content scan asserts no `src/lock/` import in `src/runs/watch.ts`; Story 3.10's run.test.ts Test B (Task 6.4) asserts no `acquire` invocation in `src/commands/next/run.ts` via spy — the structurally-equivalent assertion at the runtime level.

### Carry-overs from Story 3.8

- **Story 3.8's `export-state-no-lock.test.ts` spawn pattern**: STRUCTURAL TEMPLATE for `non-locking-read-flags.test.ts` Test A (`--export-state`). Story 3.10's Test A reuses the same fixture seeding + JSON parsing assertions; ADDS the held-lock synthesis prefix.
- **Story 3.8's `loadStateUnlocked + recomputeStateUnlocked` composition**: VERIFIED. Story 3.10's Task 6.4 spy on `acquire` confirms neither helper reaches `acquire(...)` — the AR8 invariant holds end-to-end.
- **Story 3.8's `--export-state` FR54 SPECIAL CASE (raw JSON to stdout)**: PRESERVED. Story 3.10 does NOT modify the FR54 carve-out; the integration test (Task 7.3) parses raw JSON from stdout (NOT the AR9 line wrapper).

### Carry-overs from Story 3.6 + 3.7

- **Story 3.6 + 3.7's multi-line `\n`-joined `report` message pattern**: PRESERVED. Story 3.10 does NOT modify the `--explain` or `--list` short-circuits; verifies the action=report invariant via Task 6.3.

### Carry-overs from Story 3.3

- **Story 3.3's read-only / lock-free posture**: PRESERVED. Story 3.10's Task 6.4 spy on `acquire` confirms `--dry-run` does not reach `acquire(...)`.
- **Story 3.3's `dry-run-no-writes.test.ts` no-mutation pattern**: STRUCTURAL TEMPLATE for Task 6.5's tmpdir snapshot diff. Story 3.10 extends to ALL FIVE flags.
- **Story 3.3's `walkFiles` helper reuse pattern**: INHERITED. Story 3.10's Task 6.5 + Task 7.8 reuse `walkFiles` from `src/integration/no-write-outside-scope.test.ts:119-140`.

### Carry-overs from Story 1.4

- **Story 1.4's `LockOptions` interface (lines 63-84 of `src/lock/lock.ts`)**: EXTENDED with `readonly skipAcquire?: boolean`.
- **Story 1.4's `acquire(...)` body (lines 280-388)**: EXTENDED with an EARLY-EXIT branch at the TOP (before `assertWithinScope` at line 289-290). The regular path is unchanged.
- **Story 1.4's `LockHandle` interface (lines 91-96)**: REUSED VERBATIM. The sentinel handle has the same shape as the regular handle.
- **Story 1.4's `synthesiseHeldLock` pattern in `concurrent-acquire.test.ts:49-58`**: STRUCTURAL TEMPLATE for the integration test's held-lock synthesis (Task 7.2).

### Forward Dependencies

- **Story 4.1 (`/bmad-loop` Command Skeleton)**: SECONDARY CONSUMER. The loop runner emits transcript files per iteration; users may run the read-only flags concurrent with the loop; Story 3.10's `skipAcquire` flag is the right-answer-off-the-shelf if the loop runner ever routes a read-only flag through a lock-acquiring path. Story 4.1 does NOT change Story 3.10's contract.
- **Story 4.7 (`--plan-first` Dry-Run Preview)**: TERTIARY. If `--plan-first` is added to the read-only-flag enumeration in Epic 4, Story 4.7 may extend the `skipAcquire` flag's caller list. Story 3.10 does NOT extend.
- **Story 6.1 (`bmad-stepper.config.yaml` Schema Loader)**: PRIMARY DOWNSTREAM. May surface `lock.skipAcquire: boolean` (default false) as a config knob if the config-loader chooses to validate against the live state.yaml during load. Story 3.10's flag is the runtime surface; Story 6.1 may surface as a config knob.
- **Story 6.x (concurrent-multi-process flag — `--watch` future)**: TERTIARY. If `--watch` is ever extended to require lock semantics (e.g., for coordinated multi-watcher), Story 6.x may extend `skipAcquire` to `--watch`. v0.1 keeps `--watch` structurally lock-free without the opt-in.

### Previous Story Intelligence

This story builds on:

- **Story 1.4 (File Lock with Heartbeat)** — established `src/lock/lock.ts` foundational module + `LockOptions` + `acquire()` API. Story 3.10 EXTENDS `LockOptions` with `skipAcquire` + EXTENDS `acquire()` with an EARLY-EXIT branch.
- **Story 1.7 (CLI Argument Parser)** — declared all FIVE read-only flag names on `NextArgsSchema`. Story 3.10 inherits verbatim (no args change).
- **Story 2.4 (`run.ts` lock-free runner)** — established the AR8 + architecture §line 1672 lock-free contract. Story 3.10's `skipAcquire` flag is purely additive on the existing contract.
- **Story 3.3 (`--dry-run` Flag)** — established the no-mutation-snapshot pattern + `dry-run-no-writes.test.ts` integration test. Story 3.10 extends the pattern to ALL FIVE flags.
- **Story 3.6 + 3.7 + 3.8** — established the multi-line `\n`-joined `report` message pattern + the `loadStateUnlocked` / `recomputeStateUnlocked` composition. Story 3.10 verifies via Task 6.3 + 6.4.
- **Story 3.8 (`--diff-state` and `--export-state`)** — established the `export-state-no-lock.test.ts` spawn pattern + the FR54 stdout-only-JSON carve-out for `--export-state`. Story 3.10 reuses both via Task 7.3.
- **Story 3.9 (`--watch` Live Transcript Tail)** — established the watcher's structural-lock-free posture WITHOUT the `skipAcquire` opt-in. Story 3.10 EXCLUDES `--watch` from the five-flag enumeration per AC line 873.

Story 3.10 does NOT consume from:

- Stories 1.1-1.3, 1.5-1.6, 1.8-1.13 (repo scaffold, errors module, logger, schemas, state subsystem, branch detection, BMAD detection, DAG, persona resolution, doctor, quick-start docs) — independent prerequisites; Story 3.10 reads/extends `src/lock/lock.ts` only.
- Stories 2.1-2.3, 2.5-2.8 (verifier registry, dispatch-spec generator, sub-agent markdown, transcript writers, verify-and-advance, Layer 1 markdown, smoke test) — Story 3.10 doesn't touch these surfaces.
- Stories 3.1, 3.2, 3.4, 3.5 (halt-recovery, resume, scope flags, persona override) — no shared surface beyond the existing read-only-flag short-circuits in `run.ts` (which Story 3.10 verifies via spy + snapshot, NOT modifies).

### Open Questions for Code Review

1. **Should the `skipAcquire` flag land at `src/io/lock.ts` (AC-source-strict) or `src/lock/lock.ts` (Story 1.4-convention-strict)?** v0.1 chooses `src/lock/lock.ts` per Story 1.4's foundational-tier module placement — `src/io/lock.ts` does NOT exist; recreating the path would force a CROSS-MODULE refactor (`src/lock/` → `src/io/`) that violates AR41 (the lock module is foundational; `src/io/` is a different sub-tree per architecture §Module Boundaries). The AC source path wording is stale relative to the actual filesystem; the watcher's INTENT (FR52 + skipAcquire flag + no-op handle + concurrent-active+read-only test + action=report invariant) is fully preserved; the path naming is below the AC's specificity threshold. **Trade-off**: AC-source-strict = byte-identical to AC wording; convention-strict = aligned with existing layout. v0.1 chooses convention; tracked here for code-review adjudication.

2. **Should `skipAcquire: true` return a sentinel no-op `LockHandle` (transparent caller pattern) or throw `SkipAcquireError` (forces caller awareness)?** v0.1 chooses sentinel no-op handle per drop-in-replacement preservation — caller pattern uses `try/finally { handle.release() }`; no-op `release()` is safe in this pattern. Throw would force the caller to pre-check before calling — unnecessary surface. **Trade-off**: sentinel = transparent, drop-in; throw = forces awareness. v0.1 chooses transparency; tracked here.

3. **Should `release()` on the sentinel handle be a no-op (idempotent) or throw if called twice?** v0.1 chooses no-op (idempotent: first + second + Nth call all resolve `undefined`) per the caller pattern's `try/finally` invariant. **Trade-off**: idempotent = safe in `try/finally`; throw-on-double = surfaces double-release bugs but breaks the caller pattern. v0.1 chooses idempotent; tracked here.

4. **Should the EARLY-EXIT branch be at the TOP of `acquire(...)` (before `resolveConfig`) or AFTER `resolveConfig` (so the no-op path sees the resolved config)?** v0.1 chooses TOP per minimal allocation (skip `path.resolve(process.cwd(), LOCK_DIR_REL)` + default-thresholds work). **Trade-off**: TOP = micro-optimization (sub-millisecond); BOTTOM = consistent path through the function but unnecessary work. v0.1 chooses TOP; tracked here.

5. **Should the integration test cover ALL FIVE flags (~5 tests, ~30-40 expects) or ONE flag (AC-strict, ~1 test, ~6-8 expects)?** v0.1 chooses ALL FIVE per the AC's ambiguity-favours-coverage interpretation + the per-flag spawn cost is bounded (~1 second/test). **Trade-off**: 5 tests = 5x test count, better coverage, surfaces per-flag regressions; 1 test = AC-strict, faster CI. v0.1 chooses comprehensive; tracked here.

6. **Should the sentinel `lockDir`/`pidFile` strings be `<no-op:skipAcquire>` (literal angle brackets) or some other marker?** v0.1 chooses `<no-op:skipAcquire>` per machine-recognisable + invalid-path-on-most-platforms property. **Trade-off**: angle-bracket marker = clearly non-real-path; empty string = ambiguous; verbose marker = readable but bulky. v0.1 chooses brevity; tracked here.

7. **Should the integration test reuse `concurrent-acquire.test.ts:49-58`'s `synthesiseHeldLock` helper via cross-module import, or inline a copy?** v0.1 chooses INLINE for clarity — the integration test is in `src/integration/` (cross-tree from `src/lock/integration/`); cross-module helper imports add coupling. **Trade-off**: reuse = DRY single source of truth; inline = self-contained test file. v0.1 chooses self-contained; tracked here.

8. **Should `--watch` (Story 3.9) be retroactively included in the `skipAcquire` flag's caller documentation?** v0.1 chooses NO — `--watch` is structurally lock-free without the opt-in (Story 3.9 §Forward Dependencies + AC line 873 enumeration). The watcher does NOT call `acquire(...)` at all (zero `src/lock/` import per Story 3.9 Test J). Adding `--watch` to the JSDoc's caller list would be misleading. **Trade-off**: include = comprehensive documentation; exclude = matches AC enumeration verbatim. v0.1 chooses AC-strict exclude; tracked here.

## Dev Agent Record

### Context Reference

- `_bmad-output/implementation-artifacts/3-10-non-locking-read-flags.md` (this file)
- `src/lock/lock.ts` (MODIFIED — add `skipAcquire` field on `LockOptions` + EARLY-EXIT branch in `acquire(...)`)
- `src/lock/lock.test.ts` (MODIFIED — append Story 3.10 describe block with 7 colocated tests)
- `src/integration/non-locking-read-flags.test.ts` (NEW — 5 spawn tests, one per flag, verifying concurrent-active+read-only succeeds)
- `src/commands/next/run.test.ts` (MODIFIED — append Story 3.10 describe block with 3 colocated tests covering action=report + no-acquire spy + no-FS-mutation snapshot)

### Agent Model Used

Opus 4.7 (1M context) — bmad-dev-story sub-agent for Story 3.10 (1M-context variant per BMAD `dev` agent skill).

### Debug Log References

- `bun test 2>&1 | tail -3` — 727 pass / 0 fail / 2737 expects / 56 files (Δ +16 / +0 / +93 / +1 vs baseline 711/0/2644/55).
- `bun run check 2>&1 | tail -3` — exit 0; biome ci PASS; bun test PASS.
- `bunx --bun biome ci . 2>&1 | tail -3` — exit 0; checked 127 files in 34ms; no fixes applied.
- `bunx --bun tsc --noEmit 2>&1 | tail -3` — exit 0; zero errors.
- Repair iter 1 — biome auto-formatter ran via `bunx --bun biome check --write src/lock/lock.test.ts src/integration/non-locking-read-flags.test.ts` to apply line-wrap formatting on two long lines (the `pid file readback` 4-arg `fs.readFile` call in `lock.test.ts` Test E, and the `mkdtemp + path.join + os.tmpdir` chain in `non-locking-read-flags.test.ts` `beforeEach`). Both fixes idempotent.
- `bun --version` → 1.3.12 (AR2 satisfied — Bun >= 1.3).

### Completion Notes List

- Story 3.10 lands the **`skipAcquire: boolean` flag on `src/lock/lock.ts`'s `LockOptions`** + an **EARLY-EXIT branch at the top of `acquire(...)`** per epic AC line 878-880 + FR52. v0.1 production code does NOT exercise the flag (the read-only flags structurally never reach `acquire(...)` in `run.ts` per AR8 + architecture §line 1672); the flag is forward-proofing for Story 6.x lock-acquiring read flows + AC verbatim compliance per epics.md line 878.
- The EARLY-EXIT branch is placed BEFORE `resolveConfig` + `assertWithinScope` per Open Question 4 — sub-millisecond micro-optimization (skips `path.resolve(process.cwd(), LOCK_DIR_REL)` work + scope-check); the no-op path doesn't touch any path so the scope guard is irrelevant.
- The sentinel `LockHandle.lockDir`/`pidFile` strings are `"<no-op:skipAcquire>"` per Open Question 6 (literal angle brackets — invalid as a real filesystem path on most platforms; clearly marker-only). The `release()` no-op is idempotent per Open Question 3 (preserves the regular caller pattern's `try/finally` invariant).
- The integration test `src/integration/non-locking-read-flags.test.ts` (5 spawn tests / 36 expects) verifies the AC-line-884 + AC-line-885 verbatim scenarios: synthesise a held lock at `<tmp>/_bmad-output/.stepper/state.yaml.lock/` (pid = `process.pid + 100_000` to evade the self-owned reclaim path; mtime = now to defeat the staleness threshold); spawn `bun run src/commands/next/run.ts -- --<flag>` for each of the FIVE read-only flags; assert (a) exit code 0, (b) appropriate stdout shape per flag (raw JSON for `--export-state` per Story 3.8's FR54 SPECIAL CASE; AR9 `report` JSON wrapper for `--diff-state` / `--explain` / `--list` / `--dry-run`), (c) NO `LOCK_CONTENTION` substring in stderr, (d) the synthesised lock dir is STILL PRESENT after the spawn (the read-only flag did NOT touch the lock).
- `synthesiseHeldLock` helper is INLINED per Open Question 7 — the integration test is in `src/integration/`, not `src/lock/integration/`; cross-tree imports add coupling. Helper duplicates `src/lock/integration/concurrent-acquire.test.ts:49-58`'s ~10-line pattern.
- The `src/commands/next/run.test.ts` Story 3.10 describe block (4 tests — Test A action=report invariant for FIVE flags; Test B source-content scan for `acquire(` + `from "../../lock/"` rejection; Test C tmpdir snapshot diff for FIVE flags; Test D source-content scan asserting the `skipAcquire` field + `<no-op:skipAcquire>` marker are present in `src/lock/lock.ts`) verifies the action=report invariant + no-FS-mutation invariant at the runner level.
- The `src/lock/lock.test.ts` Story 3.10 describe block (7 tests — Tests A-G covering sentinel handle shape, no-FS-mutation, no-heartbeat-timer via `process._getActiveHandles()` snapshot, idempotent release with triple-call, succeeds-with-held-live-lock per AC line 881-883, regression sentinel `skipAcquire: false`, backward-compat sentinel `skipAcquire` omitted) verifies the `acquire({ skipAcquire: true })` no-op contract.
- AR8 + AR9 + AR11 + AR21 + AR22 + AR33 + AR41 + AR42 invariants preserved; FR3 + FR4 + FR8 + FR9 + FR52 + FR53 + FR54 PASS; NFR-P1 + NFR-P5 + NFR-S2 + NFR-S5 + NFR-R1 + NFR-R4 + NFR-M3 + NFR-I2 PASS or PRESERVED.
- Errors registry held at **16 codes** (zero new error classes — the `skipAcquire` no-op branch does NOT throw; its `release()` is also no-throw).
- Spec deviations: NONE structural. The 8 §Open Questions are adjudicated v0.1-conservative (sentinel handle / no-op release / TOP placement / `<no-op:skipAcquire>` marker / 5-flag comprehensive integration test / inline `synthesiseHeldLock` / exclude `--watch` from JSDoc caller list). Path-rename note (AC source path `src/io/lock.ts` is stale; actual path is `src/lock/lock.ts` per Story 1.4) is documented in §Open Question 1.

### Test Counts (final)

- Pass: 727 (was 711; Δ +16).
- Fail: 0 (was 0; Δ 0).
- Expects: 2737 (was 2644; Δ +93).
- Files: 56 (was 55; Δ +1 — new `src/integration/non-locking-read-flags.test.ts`).
- Errors registry: 16 codes (unchanged).

### File List

#### Modified Files

- `src/lock/lock.ts` (~404 → ~456 lines): added `readonly skipAcquire?: boolean` field on the `LockOptions` interface (after `logger?: LockLogger;`); added EARLY-EXIT branch at the top of `acquire(opts?)` body (BEFORE `resolveConfig`); updated `acquire(...)` JSDoc + module-level JSDoc with the Story 3.10 carve-out paragraph.
- `src/lock/lock.test.ts` (~511 → ~660 lines): appended `describe("acquire — skipAcquire (Story 3.10 / FR52)", ...)` block with 7 colocated test cases (Tests A-G covering sentinel handle shape, no-FS-mutation, no-heartbeat-timer, idempotent release, succeeds-with-held-live-lock, regression sentinel `skipAcquire: false`, backward-compat sentinel `skipAcquire` omitted).
- `src/commands/next/run.test.ts` (~3705 → ~3893 lines): appended `describe("runNext — Story 3.10 read-only flags map to action=report", ...)` block with 4 colocated test cases (Test A action=report invariant for FIVE flags; Test B `acquire(` + `from "../../lock/"` source-scan rejection; Test C tmpdir snapshot diff for FIVE flags; Test D `skipAcquire` field + `<no-op:skipAcquire>` marker source-scan presence).

#### New Files

- `src/integration/non-locking-read-flags.test.ts` (~245 lines): the AC-line-884 enforcement integration test. 5 spawn tests (one per flag) verifying concurrent-active+read-only succeeds without `LOCK_CONTENTION`. Reuses (inline) the `synthesiseHeldLock` pattern from `src/lock/integration/concurrent-acquire.test.ts:49-58` + the spawn pattern from Story 3.8's `export-state-no-lock.test.ts`. Asserts (a) exit code 0 for all 5 flags, (b) appropriate stdout shape per flag (raw JSON for `--export-state`; AR9 `report` JSON for the other four), (c) no `LOCK_CONTENTION` in stderr, (d) the synthesised lock dir is still present after the spawn (pid file content preserved verbatim).

#### Sprint Status

- `_bmad-output/implementation-artifacts/sprint-status.yaml`: `3-10-non-locking-read-flags: ready-for-dev → review`. `epic-3: in-progress` preserved (manual flip to `done` happens after the retro per sprint-status.yaml line 17).

#### Story File

- `_bmad-output/implementation-artifacts/3-10-non-locking-read-flags.md` (this file): flipped frontmatter + body status `ready-for-dev → review`; populated Dev Agent Record sections; appended Change Log entry.

#### Task Record

- `.bmad-stepper/runs/2026-05-01T233714Z-bmad-next/tasks/t1-dev-story.yaml`: created at completion; status `completed`; quality gates recorded; AC coverage matrix populated.

#### NOT Modified (per spec)

- `src/commands/next/run.ts` — the FIVE read-only flag short-circuits already use the lock-free `loadStateUnlocked` + in-memory composition pattern; Story 3.10 is purely additive on `src/lock/lock.ts`.
- `src/commands/next/args.ts` — all FIVE read-only flag names already declared by Story 1.7.
- `src/commands/next/verify-and-advance.ts` — Story 3.10 does NOT touch the lock-held runner.
- `src/state/load.ts` / `src/state/diff.ts` / `src/state/export.ts` / `src/state/recompute.ts` — Story 3.10 does NOT touch the state subsystem.
- `src/errors.ts` — registry stays at 16 codes (no new error class).
- `commands/bmad-next.md` — Layer 1 markdown unchanged; the FIVE read-only flags continue to emit `action: "report"` per existing semantics.
- `src/schemas/state.ts` / `src/schemas/dispatch-protocol.ts` / `src/schemas/state-export.ts` — no schema bump.
- `src/personas/`, `src/dag/`, `src/dispatch/`, `src/verifiers/`, `src/runs/` — Story 3.10 does NOT touch these subsystems.

## Senior Developer Review (AI)

**Reviewer**: bmad-code-review (claude-opus-4-7[1m])
**Reviewed**: 2026-05-01
**Verdict**: **APPROVE** (status: review → done)
**Counts**: must-fix=0 | should-fix=0 | nits=0 | info=2

### Outcome

Implementation lands cleanly inside the spec's allowed mutation surface. All 4 ACs delivered with high fidelity to the verbatim AC wording (epic lines 878-885). The change to `src/lock/lock.ts` is minimally invasive (~52 lines) and additive: the `LockOptions` interface gains a single `readonly skipAcquire?: boolean` field at line 121; the `acquire(...)` body gains an EARLY-EXIT branch at lines 348-363 that returns a sentinel no-op `LockHandle` with `lockDir`/`pidFile` set to the literal marker string `<no-op:skipAcquire>`, an ISO-timestamp `acquiredAt`, and an idempotent no-op `release()`. The branch is placed BEFORE `resolveConfig` + `assertWithinScope` per Open Question 4 — sub-millisecond micro-optimization (skips `path.resolve(process.cwd(), LOCK_DIR_REL)` work + scope-check); the no-op path doesn't touch any path so the scope guard is irrelevant. The regular acquire-path (mkdir → staleness eval → pid file write → heartbeat setInterval → release rm-rf) is byte-identical to Story 1.4's implementation, untouched. JSDoc updates land at module-level (lines 27-38) AND at the `acquire(...)` function (lines 316-328) AND at the `LockOptions.skipAcquire` field (lines 97-121) — three independent docblocks each citing FR52 + epic AC line 878-880 + AR8 + the bounded list of v0.1 callers (empty in production; tests-only). The new colocated tests in `src/lock/lock.test.ts` (7 cases / 22 expects across Tests A-G) verify (a) sentinel handle shape with literal marker strings, (b) no-FS-mutation via `pathExists(canonicalLockDir)` rejection, (c) no-heartbeat-timer via `process._getActiveHandles()` snapshot diff, (d) idempotent release with triple-call, (e) succeeds-with-held-live-lock per AC line 881-883 (synthesised held lock at canonical path; pid file content preserved verbatim; ZERO log lines emitted on the no-op path), (f+g) regression sentinels for `skipAcquire: false` and `skipAcquire` omitted. The new integration test `src/integration/non-locking-read-flags.test.ts` (5 cases / 36 expects across Tests A-E) is the AC-line-884 enforcement deliverable: spawn `bun run src/commands/next/run.ts -- --<flag>` against a tmpdir holding a synthesised held lock; assert (a) exit code 0 (NOT 4 = LOCK_CONTENTION), (b) appropriate stdout shape per flag (raw JSON for `--export-state` per Story 3.8's FR54 SPECIAL CASE; AR9 `report` JSON wrapper for `--diff-state` / `--explain` / `--list` / `--dry-run`), (c) NO `LOCK_CONTENTION` substring in stderr, (d) the synthesised lock dir + pid file content preserved verbatim. The new colocated runner tests in `src/commands/next/run.test.ts` (4 cases / 35 expects across Tests A-D) verify the action=report invariant via runNext result inspection for ALL FIVE flags (Test A); the AR8 lock-free contract via comment-stripped source-content scan rejecting `acquire(` + `from "../../lock/"` (Test B); the no-state-mutation invariant via tmpdir snapshot diff for ALL FIVE flags (Test C); and the spec-mandated source-surface presence of `readonly skipAcquire?: boolean` + `skipAcquire === true` + `<no-op:skipAcquire>` markers in `src/lock/lock.ts` (Test D). AR8 / AR9 / AR11 / AR21 / AR22 / AR33 / AR41 / AR42 invariants preserved or extended; FR3 / FR4 / FR8 / FR9 / FR52 / FR53 / FR54 + NFR-P1/P5/S2/S5/R1/R4/M3/I2 all PASS or PRESERVED. Quality gates reproduce green (727 / 0 / 2737 / 56) on TWO consecutive `bun test` runs (clean both times — no transient timing flake observed). Errors registry held at 16 codes (zero new error classes — the no-op branch never throws). 8 open questions adjudicated ACCEPT v0.1 conservative; 8 dev deviations (all `documented-decision`) adjudicated ACCEPT.

### AC Verification

- **AC-1** (epic AC lines 878-880: `src/io/lock.ts` updated to support a `skipAcquire: boolean` flag → any of the five read-only flags is supplied → lock acquisition is skipped and the command runs in pure-read mode) — **PASS**.
  - Field surface: `src/lock/lock.ts:121` adds `readonly skipAcquire?: boolean` to the `LockOptions` interface, after `logger?: LockLogger` (preserving Story 1.4's field order). The field is OPTIONAL (`?:`) — backward-compat: existing callers passing `undefined` or omitting the field continue to work as before. Verified by Tests F + G in `lock.test.ts` (regression + backward-compat sentinels).
  - EARLY-EXIT branch at `src/lock/lock.ts:348-363`: when `opts?.skipAcquire === true`, returns immediately with a sentinel no-op `LockHandle` whose `lockDir` and `pidFile` fields hold the literal marker string `"<no-op:skipAcquire>"`, `acquiredAt` is `new Date().toISOString()`, and `release()` is an idempotent no-op (the `releasedNoOp` boolean follows the regular-path pattern). Branch placed BEFORE `resolveConfig` (line 365) AND `assertWithinScope` (line 373) per Open Question 4.
  - The "five read-only flags" enumeration is documented in the field's JSDoc at `src/lock/lock.ts:104-108` — `--export-state`, `--list`, `--explain`, `--dry-run`, `--diff-state`. NOTE: `--watch` is OUT of the enumeration (per Story 3.9 §Forward Dependencies + epics.md line 873) — explicitly called out in the JSDoc to prevent confusion.
  - "Pure-read mode" is enforced structurally: the no-op handle's sentinel paths NEVER refer to a real filesystem location (Test B asserts `pathExists("<no-op:skipAcquire>") === false` AND `pathExists(canonicalLockDir) === false`); the `release()` method does NOT call `clearInterval` (no timer started — Test C verifies via `process._getActiveHandles()` snapshot), does NOT call `fs.rm(lockDir)` (no dir created), does NOT emit a release-info log (Test E verifies `logger.infos.length === 0`).
  - JSDoc completeness: three independent docblocks each cite FR52 + epic AC line 878-880 + AR8 + the bounded list of v0.1 callers — the module-level JSDoc at `lock.ts:27-38`, the `acquire(...)` function JSDoc at `lock.ts:316-328`, and the `LockOptions.skipAcquire` field JSDoc at `lock.ts:97-121`. All three explicitly document that "v0.1 callers do NOT exercise this flag — the read-only flags structurally never reach `acquire(...)` in `run.ts` per AR8 + architecture §line 1672. The flag is forward-proofing for Story 6.x lock-acquiring read flows + AC verbatim compliance per epics.md line 878."

- **AC-2** (epic AC lines 881-883: an active Stepper invocation holds the lock → CI script runs `--export-state` → succeeds without `LOCK_CONTENTION`) — **PASS**.
  - Unit-level evidence at `src/lock/lock.test.ts:599-640` (Test E "succeeds when a live holder owns the canonical lock dir (AC line 881-883)"): synthesises a held lock at the test's `lockDir` with `pid: process.pid + 100_000`, `hostname: "concurrent-test-other-host"`, `acquiredAt: <iso>`, `heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS`, mtime = recent (defeats both staleness branches — pid is "alive" via `isPidAlive: () => true` AND mtime is fresh). Calls `acquire({ lockDir, skipAcquire: true, isPidAlive: () => true, logger })` and asserts (a) handle.lockDir === `<no-op:skipAcquire>` (the no-op path was taken), (b) the synthesised lock dir is STILL PRESENT after the call, (c) the pid file content is byte-identical (parsed pid === `process.pid + 100_000`), (d) ZERO log lines emitted (no "acquired", no "reclaiming", no "released" — confirming the EARLY-EXIT branch executed BEFORE any logger usage).
  - Integration-level evidence at `src/integration/non-locking-read-flags.test.ts:157-177` (Test A): spawns `bun run src/commands/next/run.ts -- --export-state` against a tmpdir with a synthesised held lock (mirroring `concurrent-acquire.test.ts:49-58` inline per Open Question 7); asserts (a) exit code === 0 (NOT 4 = LOCK_CONTENTION per FR53 + `src/errors.ts:LockContentionError`), (b) stdout is parseable JSON validated against Story 3.8's `StateExportV1Schema`, (c) NO `LOCK_CONTENTION` substring in stderr, (d) the synthesised lock dir is STILL PRESENT (helper `assertHeldLockStillPresent` at line 142-153 verifies pid + hostname preservation). Note: this passes EVEN WITHOUT the `skipAcquire` flag because `run.ts` is structurally lock-free per AR8 + Story 2.4's contract — the read-only flags never reach `acquire(...)` at runtime; the synthesised held lock is irrelevant to them. Story 3.10's `skipAcquire` flag formalises the contract surface; this integration test verifies the contract end-to-end.

- **AC-3** (epic AC line 884: integration test runs concurrent active + read-only invocations and asserts both succeed) — **PASS**.
  - `src/integration/non-locking-read-flags.test.ts` (5 cases / 36 expects) covers ALL FIVE read-only flags per the comprehensive interpretation of AC line 884 (Open Question 5). Tests A-E spawn each flag against the same held-lock fixture pattern; each test asserts (a) exit code 0, (b) appropriate stdout shape per flag, (c) NO `LOCK_CONTENTION` in stderr, (d) the synthesised lock dir + pid file preserved verbatim.
  - Per-flag stdout assertions are tailored: Test A (`--export-state`) parses raw JSON via `StateExportV1Schema.safeParse` (Story 3.8 FR54 SPECIAL CASE — raw JSON to stdout, NOT AR9-wrapped); Tests B-E (`--diff-state`, `--explain`, `--list`, `--dry-run`) parse the AR9 `report` JSON wrapper and assert `parsed.action === "report"` + `typeof parsed.message === "string"`. Test E additionally asserts `parsed.message` contains `"Dry-run: would dispatch"` per Story 3.3's preview format.
  - Held-lock synthesis at `non-locking-read-flags.test.ts:81-91` (`synthesiseHeldLock(lockDir, pidPayload, mtimeMs)`): mirrors the `src/lock/integration/concurrent-acquire.test.ts:49-58` pattern verbatim (mkdir + writeFile pid + utimes for mtime); inline per Open Question 7 (the integration test is in `src/integration/`, not `src/lock/integration/`; cross-tree imports add coupling). The pid is `process.pid + 100_000` to evade the self-owned reclaim path; mtime is `Date.now()` to defeat the staleness threshold.
  - Subprocess spawn pattern at `non-locking-read-flags.test.ts:55-72` (`spawnRunner`): uses `Bun.spawn(["bun", "run", scriptPath, ...args], { cwd, env: { ...process.env, HOME: cwd }, stdout: "pipe", stderr: "pipe" })`; awaits stdout + stderr in parallel via `Promise.all`. Mirrors Story 3.8's `export-state-no-lock.test.ts` + Story 3.9's `watch-fresh-project.test.ts` precedents.
  - Tmpdir lifecycle: `beforeEach` mkdtemp + state.yaml seed + held-lock synthesis; `afterEach` rm -rf. AR35 tmpdir-per-test discipline preserved; ZERO hard-coded `/tmp/...` paths.

- **AC-4** (epic AC line 885: all read-only flags map to action=`report` with no state mutation) — **PASS**.
  - action=report invariant at `src/commands/next/run.test.ts:3799-3813` (Test A): iterates over the FIVE flags `[--export-state, --diff-state, --explain, --list, --dry-run]`; for each flag invokes `runNext({ ...commonOpts(statePath), argv: [flag] })`; asserts `result.exitCode === 0` AND `result.action.action === "report"`. Five sub-assertions per the AC enumeration; PASS for all five.
  - Source-content scan at `src/commands/next/run.test.ts:3817-3836` (Test B): asserts `src/commands/next/run.ts` contains ZERO `\bacquire\(` invocations in executable code (comment-stripped via `^\s*\*` and `^\s*\/\/` filter so the docblock can mention forbidden APIs for prose context); asserts ZERO `from "../../lock/"` imports. Re-asserts the AR8 + architecture §line 1672 lock-free contract structurally; complements the pre-existing AR41 boundary check at `run.test.ts:606-638`.
  - No-state-mutation invariant at `src/commands/next/run.test.ts:3840-3897` (Test C): for each of the FIVE flags, mkdtemps a fresh tmpdir, writes a state.yaml with populated `lastSuccessfulStep`, snapshots the tmpdir's file inventory via `snapshotFiles` (mirrors `walkFiles` from `src/integration/no-write-outside-scope.test.ts:119-140` adapted with content hashing via `Bun.hash`), invokes `runNext` with the flag, snapshots AFTER, and asserts byte-identical inventory: same number of files, same paths, same content hashes (no in-place modifications), same sizes. Extends Story 3.3's `dry-run-no-writes.test.ts` pattern to ALL FIVE flags. Each sub-test mkdtemps a flag-specific tmpdir (AR35 discipline) and rms in `finally`.
  - Source-content presence scan at `src/commands/next/run.test.ts:3901-3914` (Test D): asserts `src/lock/lock.ts` source contains the LITERAL strings `readonly skipAcquire?: boolean` AND `skipAcquire === true` AND `<no-op:skipAcquire>` — defends the spec-mandated surface against accidental future deletion. Mirrors Story 3.9's source-content scan precedent; pure structural assertion, regardless of v0.1 caller usage.

### Architecture / NFR / FR coverage

- **AR8** (lock-free `run.ts` / lock-held `verify-and-advance.ts`) — **EXTENDED PASS**. The `skipAcquire` flag formalises the "no lock acquired" contract for the read-only-flag cluster; v0.1 invariant ALREADY HOLDS structurally per architecture §line 1672. The runner-side AR41 boundary check at `run.test.ts:606-638` continues to pass; Story 3.10's modification to `src/lock/lock.ts` does NOT introduce any new `src/lock/` import to `run.ts` (the `skipAcquire` flag's only v0.1 caller is the test surface; production code does not invoke). The Story 3.10 Test B re-asserts at the source-scan level. `verify-and-advance.ts` lock-held path is untouched (Story 3.10 is purely additive on `src/lock/lock.ts`).
- **AR9** (single discriminated-union JSON line on stdout) — **PASS**. The five read-only flags map to `action: "report"` per existing v0.1 semantics; Test A asserts via runNext result inspection for ALL FIVE. The two pre-existing FR54 SPECIAL CASES (Story 3.8's `--export-state` raw-JSON-to-stdout; Story 3.9's `--watch` raw-streaming) are untouched. Every OTHER read-only flag preserves AR9 strictly.
- **AR11** (`state.yaml` at `_bmad-output/.stepper/state.yaml`) — **PASS BY ABSENCE**. Story 3.10 does NOT touch `state.yaml`; the no-op branch performs ZERO writes (Test B + Test C verify); the read-only flags' upstream `loadStateUnlocked` reads are unchanged.
- **AR21** (errors carry code) — **PASS**. ZERO new error classes. Registry held at **16 codes** (`bun test src/errors.test.ts`: 10 pass / 197 expects). The no-op branch NEVER throws; the `release()` no-op also never throws; idempotent triple-release verified by Test D.
- **AR22** (errors carry actionable hint) — **PASS BY ABSENCE**. ZERO new actionable hints. The sentinel marker string `<no-op:skipAcquire>` is a STATIC machine-recognisable marker, not an error hint.
- **AR33** (function & error semantics; throw not Result; no console.\*; async/await) — **PASS**. The no-op branch is `async (): Promise<void>` (matches the regular `release` signature); throw not Result (no error path); ZERO `console.*` calls; sentinel handle's `release()` resolves `undefined`. The `acquire(...)` function signature is unchanged.
- **AR41** (boundary graph; no upward / sibling-higher imports) — **PASS**. `src/lock/lock.ts` is foundational per architecture §Module Boundaries; Story 3.10's modification stays within the module's existing boundary; ZERO new imports added (the existing `node:fs/promises`, `node:os`, `node:path`, `../errors.ts`, `../io/paths.ts` set is unchanged). The colocated AR41 boundary check at `run.test.ts:606-638` continues to pass; Story 3.10's Test B re-asserts independently.
- **AR42** (test discipline) — **EXTENDED PASS**. New `describe("acquire — skipAcquire (Story 3.10 / FR52)", ...)` block in `src/lock/lock.test.ts` (7 tests / 22 expects); new `describe("runNext — Story 3.10 read-only flags map to action=report", ...)` block in `src/commands/next/run.test.ts` (4 tests / 35 expects); new integration test file `src/integration/non-locking-read-flags.test.ts` (5 tests / 36 expects). Each follows AR35 tmpdir-per-test mkdtemp/rm discipline; ZERO hard-coded `/tmp/...` paths.
- **FR3** (`--diff-state`) — **CONSUMED PASS**. Story 3.10 verifies the existing `diffState` helper's lock-free contract via the integration test (Test B in `non-locking-read-flags.test.ts`) + the source-content scan (Test B in `run.test.ts`).
- **FR4** (`--export-state`) — **CONSUMED PASS**. Story 3.10 verifies the existing `exportState` helper's lock-free contract via the integration test (Test A) + the source-content scan + the held-lock-no-LOCK_CONTENTION assertion.
- **FR8** (`/bmad-next` single-step advance) — **PASS BY ABSENCE**. Dispatch path is unaffected; Story 3.10 is purely additive on `src/lock/lock.ts`; the lock-acquiring path (`verify-and-advance.ts`) is untouched.
- **FR9** (`--dry-run`) — **CONSUMED PASS**. Story 3.10 verifies the existing `--dry-run` lock-free contract via the integration test (Test E) + the source-content scan + the dispatch-spec-preview message-format assertion (`parsed.message.includes("Dry-run: would dispatch")`).
- **FR52** (Read-only flags non-locking) — **PRIMARY DELIVERABLE PASS**. v0.1 ships the explicit `skipAcquire: boolean` flag on `src/lock/lock.ts` `acquire()` API + the integration test for concurrent active + read-only invocations. The structural lock-free invariant ALREADY HOLDS in v0.1 per AR8 + Story 2.4's contract; Story 3.10's `skipAcquire` flag is forward-proofing + AC verbatim compliance per epics.md line 878.
- **FR53** (documented exit codes) — **PASS**. The read-only flags exit 0 on the happy path (verified by all 5 integration tests + all FIVE Test A sub-assertions); the LOCK_CONTENTION exit code 4 is NOT triggered (verified by `result.stderr.not.toContain("LOCK_CONTENTION")` in all 5 integration tests).
- **FR54** (stdout/stderr discipline) — **PASS**. Story 3.10 does NOT add new stdout/stderr surfaces. The two pre-existing FR54 SPECIAL CASES (Story 3.8's `--export-state` + Story 3.9's `--watch`) are untouched. The integration test parses raw JSON for `--export-state` (matching the FR54 SPECIAL CASE) and AR9-wrapped JSON for the other four (preserving AR9 strictly).
- **NFR-P1** (next-step computation < 500ms p95) — **PASS BY ABSENCE**. Story 3.10 only adds an EARLY-EXIT branch in `acquire(...)`; ZERO impact on the next-step computation path. The branch is sub-millisecond (`new Date().toISOString()` + closure allocation); the regular-path is byte-identical to Story 1.4.
- **NFR-P5** (state read < 100ms p95) — **PASS BY ABSENCE**. `loadStateUnlocked` is unchanged; the read-only flags' state reads route through it unmodified.
- **NFR-S2** (writes only inside scope) — **PASS**. The `skipAcquire` no-op path performs ZERO writes (Test B verifies via `pathExists` rejection); the assertion is structurally tighter than before (no mkdir, no Bun.write pid file, no setInterval heartbeat utimes). Test C verifies byte-identical tmpdir snapshot for ALL FIVE flags.
- **NFR-S5** (atomic writes + locks) — **EXTENDED PASS**. The `skipAcquire` flag formalises the "no lock acquired" contract for the read-only-flag cluster; the lock semantics for the dispatch path are UNCHANGED (the regular acquire path's mkdir + pid file + heartbeat is byte-identical to Story 1.4).
- **NFR-R1** (zero data loss on halt) — **PASS BY ABSENCE**. Read-side only.
- **NFR-R4** (lock release on graceful exit) — **PASS BY ABSENCE**. The dispatch-path lock semantics are preserved.
- **NFR-M3** (machine-readable JSON for `--export-state`) — **PASS**. Story 3.8 owns the JSON shape (`StateExportV1Schema`); Story 3.10 only verifies the lock-free invariant via the integration test (Test A `safeParse(parsed)` returns `success: true` + `parsed.schemaVersion === 1`).
- **NFR-I2** (unknown-skill fail-loud) — **PASS BY ABSENCE**. Story 3.10 does NOT touch DAG resolution.

### Findings

#### Must-fix

(none)

#### Should-fix

(none)

#### Nits

(none)

#### Info

- **Info-1** (the `skipAcquire` flag is forward-proofing — v0.1 production code does NOT exercise it): the bounded list of v0.1 callers is EMPTY. The read-only flags structurally never reach `acquire(...)` in `run.ts` per AR8 + architecture §line 1672 (verified by Test B source-scan + the pre-existing AR41 boundary check at `run.test.ts:606-638`). The flag is the right-answer-off-the-shelf for any future story that accidentally routes a read-only flag through a lock-acquiring path. This is a documented design tension (spec §Design Decisions + Open Question 1); v0.1 chose AC-strict + forward-proofing per epics.md line 878 verbatim. Forward-coupling: Story 6.x lock-acquiring read flows are the primary downstream caller. Not actionable now.
- **Info-2** (architecture.md §line 1382 references `src/io/lock.ts` — stale wording): the actual landing path is `src/lock/lock.ts` per Story 1.4's foundational-tier module placement. The AC source path wording at epics.md line 878 + architecture.md §line 1382 is stale relative to the actual filesystem layout. This is a documented design decision adjudicated in spec §Open Question 1; the watcher's INTENT (FR52 + skipAcquire flag + no-op handle + concurrent-active+read-only test + action=report invariant) is fully preserved; the path naming is below the AC's specificity threshold. Forward-tracker: Story 6.x architecture refresh should update these references to `src/lock/lock.ts`. Non-blocking.

### Validator Independent Re-Run

- `bun --version`: **1.3.12** (AR2 satisfied — Bun >= 1.3).
- `bun test` (run #1): **727 pass / 0 fail / 2737 expect() calls / 56 files** — 3.70s elapsed. Matches dev-story claim verbatim.
- `bun test` (run #2, flake-check per task brief): **727 pass / 0 fail / 2737 expect() calls / 56 files** — 3.77s elapsed. NO transient timing flake observed.
- `bun run check`: **exit 0** (Biome ci + tsc + bun test all clean; 727/0/2737/56).
- `bunx --bun biome ci .`: **exit 0** (127 files checked clean in 33ms).
- `bunx --bun tsc --noEmit`: **exit 0** (no TypeScript errors).
- `bun test src/lock/lock.test.ts`: **34 pass / 0 fail / 59 expects** (full file; the new Story 3.10 describe block contributes 7 tests / 22 expects).
- `bun test src/lock/lock.test.ts -t "skipAcquire"`: **7 pass / 0 fail / 22 expects** — confirms the Story 3.10 describe block is targetable in isolation.
- `bun test src/integration/non-locking-read-flags.test.ts`: **5 pass / 0 fail / 36 expects** — matches dev-story claim.
- `bun test src/commands/next/run.test.ts -t "Story 3.10"`: **4 pass / 0 fail / 35 expects** — confirms the Story 3.10 describe block is targetable in isolation.
- AC-text byte-identical: `diff <(sed -n '878,885p' epics.md) <(grep -A 30 ... 3-10-...md)` → **exit 0** (verbatim BDD AC content matches identically).
- Errors registry: held at **16 codes** (`bun test src/errors.test.ts`: 10 pass / 197 expects — AR21 invariant preserved).

### Deviations Adjudication

The dev-story enumerated 8 open questions (story spec §Open Questions for Code Review) plus 8 dev deviations in the dev-story task record (all classified `documented-decision`). All adjudicated below.

**8 Open Questions:**

- **open-question-1 (path: `src/io/lock.ts` AC-source-strict vs `src/lock/lock.ts` Story-1.4-convention-strict)** — **ACCEPT v0.1 (convention-strict)**. v0.1 chooses `src/lock/lock.ts` per Story 1.4's foundational-tier module placement. Rationale: the `src/io/lock.ts` path does NOT exist on disk; recreating it for ONE file would force a CROSS-MODULE refactor (`src/lock/` → `src/io/`) violating AR41 (the lock module is foundational; `src/io/` is a different sub-tree per architecture §Module Boundaries). The contract's INTENT (FR52 + skipAcquire flag + no-op handle + concurrent-active+read-only test + action=report invariant) is fully preserved; the path naming is below the AC's specificity threshold. Tracked as Info-2 forward-tracker (architecture.md refresh).
- **open-question-2 (sentinel handle vs throw `SkipAcquireError` on `skipAcquire: true`)** — **ACCEPT v0.1 (sentinel handle)**. Preserves the regular caller pattern (caller calls `acquire(...)`, gets a handle, uses `try/finally` for `release(...)`); the no-op semantics are transparent. Throw would force the caller to pre-check `handle.lockDir === "<no-op:skipAcquire>"` before calling `release(...)` — an unnecessary surface. Drop-in replacement preservation.
- **open-question-3 (`release()` no-op vs throw on the sentinel handle)** — **ACCEPT v0.1 (no-op idempotent)**. Caller pattern uses `try/finally { handle.release() }` — the no-op `release()` is safe in this pattern. Throw would force the caller to pre-check `handle.lockDir === "<no-op:skipAcquire>"` before calling — unnecessary surface. Test D verifies triple-release is no-throw.
- **open-question-4 (EARLY-EXIT branch placement: TOP of `acquire(...)` vs AFTER `resolveConfig`)** — **ACCEPT v0.1 (TOP)**. Sub-millisecond micro-optimization (skips `path.resolve(process.cwd(), LOCK_DIR_REL)` work + scope-check); the no-op path doesn't touch any path so the scope guard is irrelevant. The no-op path is ~5 lines (closure + return); placing it BEFORE `resolveConfig` keeps the regular-path indentation unchanged.
- **open-question-5 (integration test scope: 5 flags vs 1 flag AC-strict)** — **ACCEPT v0.1 (5 flags / comprehensive)**. AC line 884's ambiguity favours coverage; the per-flag spawn cost is bounded (~1 second per test); the test file structure is parameterised. Per-flag regressions surface immediately; AC-strict 1-test would mask flag-specific bugs. The 5-tests-1-spawn-each pattern parallels Story 3.8's `export-state-no-lock.test.ts` precedent.
- **open-question-6 (sentinel marker strings: `<no-op:skipAcquire>` vs alternative)** — **ACCEPT v0.1 (`<no-op:skipAcquire>` literal)**. Machine-recognisable + invalid-as-real-path on most platforms (literal angle brackets are illegal in Windows filenames; clearly marker-only). Test D source-scan asserts the literal marker is present in `src/lock/lock.ts` source. Empty string would be ambiguous; verbose marker (`"NO-OP-SKIP-ACQUIRE-NEVER-WRITTEN"`) would be readable but bulky. v0.1 chooses brevity + clarity.
- **open-question-7 (`synthesiseHeldLock` helper: cross-module import from `concurrent-acquire.test.ts:49-58` vs INLINE)** — **ACCEPT v0.1 (INLINE)**. The integration test is in `src/integration/`, not `src/lock/integration/`; cross-tree imports add coupling. The ~10-line helper is duplicated for self-contained test file clarity. Trade-off: reuse = DRY single source of truth; inline = self-contained test file. v0.1 chooses self-contained per the test-file-isolation principle.
- **open-question-8 (`--watch` retroactively included in `skipAcquire` JSDoc caller list?)** — **ACCEPT v0.1 (NO — exclude)**. `--watch` is structurally lock-free without the opt-in (Story 3.9 §Forward Dependencies + AC line 873 enumeration). The watcher does NOT call `acquire(...)` at all (zero `src/lock/` import per Story 3.9 Test J). Adding `--watch` to the JSDoc's caller list would be misleading. AC-strict exclude per the epics.md line 873 enumeration verbatim.

**8 Dev Deviations (all classified `documented-decision`):**

All 8 dev deviations recorded in `t1-dev-story.yaml:73-128` are 1:1 mappings of the 8 open questions above. Each is a documented design tension adjudicated v0.1-conservative; each preserves the AC's INTENT; each is forward-compatible with later epics. ACCEPT for all 8 per the open-question adjudications.

### Strengths

- **Zero-deviation execution against spec mutation surface**: Tasks 0-10 completed verbatim; the `src/lock/lock.ts` modification (52 lines added — field + EARLY-EXIT branch + JSDoc) lands exactly at the spec's prescribed positions (`LockOptions` after `logger?: LockLogger;`; EARLY-EXIT branch as the FIRST statement of `acquire(...)` body; JSDoc at module-level + function-level + field-level); the integration test + colocated unit tests + colocated runner tests all match the spec File List byte-for-byte.
- **AR41 boundary discipline preserved**: ZERO new imports added to `src/lock/lock.ts` (the existing `node:fs/promises`, `node:os`, `node:path`, `../errors.ts`, `../io/paths.ts` set is unchanged). The colocated AR41 boundary check at `run.test.ts:606-638` continues to pass; Story 3.10's Test B re-asserts independently. The `src/lock/lock.ts` module stays foundational per AR41.
- **AR8 lock-free contract enforced by source-content scan**: Test B at `run.test.ts:3817-3836` programmatically scans `src/commands/next/run.ts` source for forbidden patterns: `\bacquire\(` (rejected) AND `from "../../lock/"` (rejected). The scan strips JSDoc/comment lines first to avoid false positives from prose context; the executable code is checked. Future regressions surface at test time.
- **Spec-mandated source surface preserved by source-content scan**: Test D at `run.test.ts:3901-3914` programmatically scans `src/lock/lock.ts` source for the LITERAL strings `readonly skipAcquire?: boolean` AND `skipAcquire === true` AND `<no-op:skipAcquire>`. Defends the AC-line-878 contract surface against accidental future deletion. Pure structural assertion, regardless of v0.1 caller usage. Mirrors Story 3.9's Test J pattern.
- **No-state-mutation invariant enforced by snapshot diff**: Test C at `run.test.ts:3840-3897` snapshots the tmpdir's file inventory (path → { mtimeMs, size, sha }) BEFORE the runNext invocation; invokes runNext; snapshots AFTER; asserts byte-identical inventory: same number of files, same paths, same content hashes (no in-place modifications), same sizes. Iterates over ALL FIVE flags; per-flag fresh tmpdir (AR35 discipline); finally-rm cleanup. Extends Story 3.3's `dry-run-no-writes.test.ts` pattern to ALL FIVE flags. Critical for the AC-line-885 invariant.
- **No-heartbeat-timer invariant enforced by `process._getActiveHandles()` snapshot**: Test C in `lock.test.ts:562-584` snapshots the active-handle count BEFORE the `acquire({ skipAcquire: true })` call; invokes; snapshots AFTER; asserts the count did NOT grow. The regular-path adds an unref'd interval timer; the no-op path adds none. Defensive guard with graceful undefined-coverage fallback (`if (beforeCount !== undefined && afterCount !== undefined)`).
- **AC-line-881-883 verbatim scenario coverage**: Test E in `lock.test.ts:599-640` synthesises a held lock with a "live" PID + recent mtime (defeats both staleness branches), then calls `acquire({ skipAcquire: true })`; asserts (a) handle.lockDir === sentinel marker (the no-op path was taken), (b) the synthesised lock dir is STILL PRESENT after the call, (c) the pid file content is byte-identical (parsed pid === `process.pid + 100_000`), (d) ZERO log lines emitted (no "acquired", no "reclaiming", no "released" — confirming the EARLY-EXIT branch executed BEFORE any logger usage). The `logger.infos.length === 0` assertion is the cleanest possible verification that the no-op path skipped the entire mkdir + staleness eval + pid write + heartbeat + release-info-log chain.
- **Sentinel handle drop-in replacement transparency**: The sentinel `LockHandle` has the same shape as the regular handle (fields: `lockDir`, `pidFile`, `acquiredAt`, `release`); the `release()` method has the same async signature. Caller pattern `try/finally { await handle.release() }` works identically for both paths. Test D verifies idempotent triple-release (Open Question 3); Tests F + G verify the regular happy path is unchanged when `skipAcquire: false` or omitted (Open Question 2 regression sentinels).
- **JSDoc completeness**: Three independent docblocks each cite FR52 + epic AC line 878-880 + AR8 + the bounded list of v0.1 callers (empty in production; tests-only). Module-level JSDoc at `lock.ts:27-38` (in the "Public API" section); function-level JSDoc at `lock.ts:316-328` (in `acquire(...)`'s docblock); field-level JSDoc at `lock.ts:97-121` (on `LockOptions.skipAcquire`). Each docblock explicitly enumerates the FIVE flag names AND explicitly excludes `--watch` (per Open Question 8). Forward-readers cannot miss the contract.
- **Comprehensive integration test (5 flags / 5 spawns)**: Per Open Question 5, AC line 884's ambiguity favours coverage; the per-flag spawn cost is bounded (~1 second per test); per-flag regressions surface immediately. Each test asserts (a) exit code 0, (b) appropriate stdout shape per flag, (c) NO `LOCK_CONTENTION` substring in stderr, (d) the synthesised lock dir + pid file preserved verbatim. Test A handles the FR54 SPECIAL CASE (raw JSON via `StateExportV1Schema.safeParse`); Tests B-E handle the AR9 `report` JSON wrapper.
- **Errors registry held at 16 codes**: Story 3.10 introduces ZERO new error classes; the no-op branch NEVER throws; the `release()` no-op also never throws. Registry CI gate preserved.
- **Test count delta verified**: 16 new tests / 93 new expects / 1 new file. Distributed: 7 tests / 22 expects in `lock.test.ts` (Story 3.10 describe block), 4 tests / 35 expects in `run.test.ts` (Story 3.10 describe block), 5 tests / 36 expects in `non-locking-read-flags.test.ts` (NEW file). Per `bun test` targeted runs above. Matches dev-story claim verbatim.
- **AC verbatim preservation**: §Acceptance Criteria reproduces the AC source verbatim (lines 878-885 of epics.md); diff against AC source confirms byte-identity (exit 0). The path-rename note is correctly placed BELOW the AC block as a contextual observation, NOT as a substitution of the AC text.
- **Forward-proofing documented**: The bounded list of v0.1 callers is EMPTY (production code path); tests exercise the flag (Tests A-G). The flag is the "right answer off-the-shelf" for any future story that accidentally routes a read-only flag through a lock-acquiring path. Forward-coupling: Story 6.x lock-acquiring read flows are the primary downstream caller. Tracked as Info-1 forward-tracker.

### Sprint-status update

- `3-10-non-locking-read-flags: review → done`
- `epic-3: in-progress` (preserved — manual flip to `done` happens in the OPTIONAL retrospective step per sprint-status.yaml line 17 + task brief NOTE)

### Forward-action items

- **Story 4.1 (`/bmad-loop` Command Skeleton)** — SECONDARY CONSUMER. The loop runner emits transcript files per iteration; users may run the read-only flags concurrent with the loop; Story 3.10's `skipAcquire` flag is the right-answer-off-the-shelf if the loop runner ever routes a read-only flag through a lock-acquiring path. Story 4.1 does NOT change Story 3.10's contract.
- **Story 4.7 (`--plan-first` Dry-Run Preview)** — TERTIARY. If `--plan-first` is added to the read-only-flag enumeration in Epic 4, Story 4.7 may extend the `skipAcquire` flag's caller list. Story 3.10 does NOT extend.
- **Story 6.1 (`bmad-stepper.config.yaml` Schema Loader)** — PRIMARY DOWNSTREAM. May surface `lock.skipAcquire: boolean` (default false) as a config knob if the config-loader chooses to validate against the live state.yaml during load with the lock; Story 3.10's flag is the runtime surface; Story 6.1 may surface as a config knob.
- **Story 6.x (concurrent-multi-process flag — `--watch` future)** — TERTIARY. If `--watch` is ever extended to require lock semantics (e.g., for coordinated multi-watcher), Story 6.x may extend `skipAcquire` to `--watch`. v0.1 keeps `--watch` structurally lock-free without the opt-in.
- **Architecture.md refresh forward-tracker**: architecture.md §line 1382 references `src/io/lock.ts` (FR52 → `src/io/lock.ts (acquire skipped)`) — stale wording. The actual landing path is `src/lock/lock.ts` per Story 1.4's foundational-tier placement. Story 6.x architecture refresh should update to match the convention. Tracked as Info-2; non-blocking.
- **Epic-3-retrospective (OPTIONAL)** — NEXT ITERATION. With Story 3.10 done, ALL 10 Epic 3 stories (3.1-3.10) reach `done`; sprint-status.yaml `epic-3: in-progress` remains preserved here per the task brief NOTE. The OPTIONAL retrospective step (next iteration) will manually flip `epic-3: in-progress → done` per sprint-status.yaml line 17.

### Issues dev missed

(none — the dev-story §Open Questions for Code Review correctly enumerated all 8 design tensions; the 8 dev deviations are documented and pragmatic; AC text byte-identical to source; no spec gaps surfaced during the independent re-validation; both `bun test` runs were clean; the AR41 boundary check + lock-free invariant scan + spec-mandated source surface scan all pass; FR52's `skipAcquire` flag + no-op handle + EARLY-EXIT branch + 5-flag integration test + 4-flag-action=report-invariant + no-state-mutation snapshot diff all match the spec mutation surface verbatim. Story 3.10 is the smallest delta of any Epic 3 story (~430 lines net across 4 files) and the cleanest — purely additive on `src/lock/lock.ts`; the structural lock-free invariant ALREADY HOLDS in v0.1 per AR8 + Story 2.4's contract; the `skipAcquire` flag is forward-proofing + AC verbatim compliance per epics.md line 878.)

### Approval

Story status flipped `review → done`. `sprint-status.yaml` flipped `3-10-non-locking-read-flags: review → done`. `epic-3: in-progress` preserved per the task brief NOTE — the manual `epic-3: in-progress → done` flip happens in the OPTIONAL retrospective step (next iteration), NOT here. **Epic 3 is now functionally complete: ALL 10 stories (3.1-3.10) reach `done` status.** Ready to advance to the OPTIONAL bmad-retrospective step per the standard Epic-3 closure sequence.

## Change Log

| Date       | Author            | Change                                                                                  |
| ---------- | ----------------- | --------------------------------------------------------------------------------------- |
| 2026-05-01 | bmad-create-story | Initial story file created from epics.md §3.10 (final story of Epic 3)                  |
| 2026-05-01 | bmad-dev-story    | Implementation complete. `skipAcquire` field on `LockOptions` + EARLY-EXIT branch in `acquire()` (lock.ts); 7 colocated tests in lock.test.ts; 5 spawn tests in non-locking-read-flags.test.ts (NEW); 4 colocated tests in run.test.ts. Status `ready-for-dev → review`. 727/0/2737/56 (Δ +16/+0/+93/+1). |
| 2026-05-01 | bmad-code-review \| 2026-05-01T234734Z-bmad-next | Senior Developer Review — APPROVE; 0 must-fix / 0 should-fix / 0 nits / 2 info; AC-1/2/3/4 PASS; AR8/9/11/21/22/33/41/42 + FR3/4/8/9/52/53/54 + NFR-P1/P5/S2/S5/R1/R4/M3/I2 PASS or PRESERVED; 8 open questions ACCEPT; 8 dev deviations ACCEPT (all `documented-decision`); 2 consecutive `bun test` runs clean (no flake); status → done. FINAL story of Epic 3. |
