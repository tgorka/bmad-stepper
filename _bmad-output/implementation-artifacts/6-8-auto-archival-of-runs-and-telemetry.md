---
status: done
story_id: '6.8'
story_key: 6-8-auto-archival-of-runs-and-telemetry
epic: '6'
title: 'Auto-Archival of Runs and Telemetry'
created: '2026-05-05'
last_updated: '2026-05-05T13:05:00Z'
priority: high
estimated_effort: M
fr_coverage:
  - FR40     # SECONDARY — telemetry block in config consumed (paths.telemetry resolution + telemetry.enabled gate for rotation)
  - FR45     # SECONDARY — telemetry pipeline lifecycle: 6.6 collector → 6.7 aggregator → 6.8 archiver completes the lifecycle
nfr_coverage:
  - NFR-Sc4  # PRIMARY — runs older than 90 days auto-archived (architecture line 1413; epics.md AC-1 verbatim)
  - NFR-Sc5  # PRIMARY — telemetry > 12 months auto-rotated (architecture line 1414; epics.md AC-2 verbatim)
  - NFR-S1   # main-thread output discipline (info() stderr only; one-line audit notice once per session; ZERO console.*)
  - NFR-S2   # writes scoped to _bmad-output/.stepper/ via assertWithinScope on every move target
  - NFR-R1   # async fs operations only; never blocks the user's command (AC-4 verbatim mechanism — runs in background)
  - NFR-M3   # idempotent archival (running twice in a row is a no-op per AC-3)
ar_coverage:
  - AR41     # PRIMARY — boundary graph: src/runs/ AND src/telemetry/ are MID-TIER per architecture lines 1281-1283; allowed imports = foundational (errors, schemas, io); src/startup/ is a NEW MID-TIER orchestrator that imports both archive sites + io/log.ts; NO higher-tier or top-tier imports
  - AR42     # PRIMARY — schema-first; no NEW schemas (AggregateResult-style transient types, plus assertWithinScope on every move target — both source path AND archive destination per the "move = read-then-write" boundary)
  - AR21     # single-line constraint on the once-per-session audit notice ("archival: archived <runs-count> runs older than 90 days, <telemetry-count> telemetry files older than 12 months")
  - AR22     # actionable-hint regex N/A (no new error classes; archival is best-effort with bare Error throws on programming-error paths; see warnings hints)
  - AR33     # async fs writes; never console.*; never process.exit (the archival trigger MUST be best-effort + non-blocking — failures are logged via warn() but do NOT propagate to the user's command)
  - AR8      # PRIMARY — lock-free top-tier preserved (archival runs OUTSIDE the verify-and-advance lock — invoked at runner startup BEFORE any state.yaml access; ZERO state.yaml mutation)
  - AR9      # AR9 stdout JSON-line invariant unchanged; archival writes to FILES (mv-equivalent fs.rename), NOT stdout — print-to-stderr discipline preserved (FR54)
  - AR17     # security: archival NEVER reads file CONTENT — only filenames + mtime; .archive/ subdirs preserved within scope; no PII surface widening
  - AR27     # telemetry schema invariants preserved (rotation moves files unchanged; ZERO mutation to JSONL records or markdown reports)
  - AR35     # tmpdir-per-test discipline (every archive.test.ts + rotate.test.ts + archival-trigger.test.ts seeds tmpDir via mkdtemp + afterEach cleanup)
deps:
  - story: '6.7'
    reason: 'PRIMARY — Story 6.7 ships `src/telemetry/aggregate.ts` + `cli.ts` (the aggregator + CLI runner) and the markdown reports `<paths.telemetry>/<period>.md`. Story 6.8 ROTATES BOTH the JSONL files (Story 6.6 wrote) AND the markdown reports (Story 6.7 wrote) when older than 12 months. Story 6.7 SDR forward-trackers I-47 CLOSED + I-48 (UTC discipline) HONOURED here at the period-boundary calculation — the rotate threshold uses UTC arithmetic. Story 6.7 OQ-3 documented that the aggregator reads from `<paths.telemetry>/<period>.jsonl` ONLY (not from `<paths.telemetry>/.archive/`); aggregating an archived period is a forward-tracker (post-v0.1). Story 6.8 PRESERVES that invariant — the aggregator continues to read only the active period files; archived periods are out of reach until a forward story extends `aggregateTelemetry` to read from `.archive/`.'
  - story: '6.6'
    reason: 'PRIMARY — Story 6.6 ships `src/telemetry/collect.ts` (the JSONL writer) + `DEFAULT_TELEMETRY_ROOT` constant. Story 6.8 ROTATES the JSONL files Story 6.6 writes when older than 12 months. The file-format invariants Story 6.6 ESTABLISHED (`<paths.telemetry>/<YYYY-MM>.jsonl`; UTC-locked ts; one TelemetryRecord per line) are preserved through rotation — Story 6.8 only renames/moves files (it does NOT read or mutate JSONL CONTENT). Story 6.6 SDR forward-tracker I-48 (timezone-naive UTC discipline) PRIMARY HONOURED here at `<period>` boundary arithmetic — derived from `new Date()` UTC subtraction of 12 months (i.e., `now - 12*30*24*3600*1000` ms), NOT calendar-month subtraction.'
  - story: '6.1'
    reason: 'PRIMARY — `loadConfig()` produces typed `Config` with `config.paths.runs` (default `_bmad-output/.stepper/runs/` per src/config/defaults.ts:46) AND `config.paths.telemetry` (default `_bmad-output/.stepper/telemetry/` per src/config/defaults.ts:48) AND `config.telemetry.enabled: boolean`. Story 6.8 the `archival-trigger.ts` orchestrator reads these from a synthetic `Config`-shape arg (test-injection seam mirroring Story 6.7 cli.ts pattern). The TELEMETRY ROTATION is GATED on `config.telemetry.enabled === true` per AC-2 verbatim — when telemetry is OFF, the rotate.ts module is a no-op (the JSONL+md files do not exist; rotation has no work to do); when telemetry is ON the rotation runs unconditionally on every Stepper start. The RUNS ARCHIVAL is NOT gated — runs are written by every `/bmad-next` invocation regardless of telemetry config; their 90-day archival is unconditional per AC-1 verbatim. ZERO loader-API change for Story 6.8.'
  - story: '2.5'
    reason: 'PRIMARY — `src/runs/write-step.ts` (Story 2.5) writes `<runsRoot>/<ts>-<step>.{log,json}` files. Story 6.8 the `src/runs/archive.ts` archiver READS the runs directory (filename + mtime listing only — never CONTENT), filters files older than 90 days by mtime, computes destination `<runsRoot>/.archive/<YYYY-MM>/<basename>`, and renames each via `fs.rename`. ZERO mutation to write-step.ts. The `<ts>-<step>.log` and `<ts>-<step>.json` paired-files convention (NFR-Sc4) is preserved — when one half is archived, the other half is also archived (mtime-paired). Per OQ-1 below, the archiver groups by basename-without-extension to atomically move the .log+.json pair together (preserves transcript browseability when reading the archive).'
  - story: '2.2'
    reason: 'PATTERN — `src/dispatch/staging-cleanup.ts` (Story 2.2) is the canonical "best-effort startup hook + listdir+stat+filter+remove" pattern. Story 6.8 MIRRORS this pattern at three key sites: (a) listdir via `fs.readdir(root, { withFileTypes: true })`; (b) `fs.stat` per entry → `now - mtime > thresholdMs` filter; (c) move via `fs.rename` (not `rm` — archival preserves files); (d) per-entry failures are logged via `warn()` but do NOT propagate (best-effort). Per OQ-2 below, Story 6.8 ALSO mirrors the `cleanStagingOrphans({stagingRoot?, now?, ageThresholdMs?})` test-seam shape — `archiveOldRuns({runsRoot?, now?, ageThresholdMs?})` and `rotateOldTelemetry({telemetryRoot?, now?, ageThresholdMs?})`. The orchestrator `runArchivalAtStartup({config, oncePerSessionRef?})` is a sibling pattern.'
  - story: '6.5'
    reason: 'PATTERN — Story 6.5 (`verifiers:` per-step config override) shipped the runner-tier consumer pattern. Story 6.8 has a SIMILAR pattern: the `archival-trigger.ts` orchestrator is invoked at startup of `runNext` and `runLoop` (top-tier sites) before any other work. The pattern that DOES carry is the `.strict()` schema-strictness discipline — Story 6.8 inherits this transitively (the JSONL files being moved were already validated at write time by Story 6.6; the markdown reports have no schema; archival never re-validates content). Story 6.5 SDR forward-trackers I-26/I-27/I-38/I-41/I-46 — all CLOSED at Story 6.5/6.6 close; Story 6.8 inherits NO open trackers from this lineage.'
  - story: '5.6'
    reason: 'PATTERN — opts.config seam frozen. The `archival-trigger.ts` orchestrator uses a SIMILAR pattern (config-resolved paths via opts.config) but does NOT consume per-step entries — it consumes paths.runs + paths.telemetry + telemetry.enabled top-level shape. Story 6.8 does NOT add per-step entries to config; it consumes EXISTING config fields. ZERO seam mutation.'
  - story: '4.9'
    reason: 'PATTERN — Story 4.9 SIGINT graceful exit ships the closure-private flag pattern Story 6.8 mirrors at the once-per-session marker. The `archival-trigger.ts` exports a closure-private `oncePerSessionRef = { fired: false }` ref-cell pattern; the trigger checks `ref.fired === false` before invoking the archival modules; on success sets `ref.fired = true` so subsequent invocations within the same Bun process are no-ops. The default `oncePerSessionRef` is a module-level singleton (production); tests inject their own ref-cell for isolation. Per OQ-3 below, the SAME process must run archival at most once per session — but a SECOND `bun run` invocation is a NEW process and thus a NEW session; archival fires again. The session boundary is the Bun process lifetime.'
  - story: '6.8'
    reason: 'SELF-REFERENCE — Story 6.8 is the deliverable for NFR-Sc4 + NFR-Sc5. The `archive.ts` + `rotate.ts` + `archival-trigger.ts` triplet is the canonical AC site.'
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/implementation-artifacts/6-1-bmad-stepper-config-yaml-schema-loader.md
  - _bmad-output/implementation-artifacts/6-6-telemetry-opt-in-collection.md
  - _bmad-output/implementation-artifacts/6-7-telemetry-aggregation-report.md
  - _bmad-output/implementation-artifacts/2-2-dispatch-spec-generator.md
  - _bmad-output/implementation-artifacts/2-5-markdown-transcript-json-run-log-writers.md
  - _bmad-output/implementation-artifacts/2-4-lock-free-run-ts-for-bmad-next.md
  - _bmad-output/implementation-artifacts/4-9-sigint-graceful-exit.md
  - _bmad-output/implementation-artifacts/sprint-status.yaml
  - _bmad-output/implementation-artifacts/epic-5-retrospective.md
  - _bmad-output/implementation-artifacts/epic-4-retrospective.md
  - .bmad-stepper/state.yaml
  - .bmad-stepper/config.yaml
  - src/schemas/config.ts
  - src/config/load.ts
  - src/config/defaults.ts
  - src/config/index.ts
  - src/errors.ts
  - src/io/log.ts
  - src/io/paths.ts
  - src/dispatch/staging-cleanup.ts
  - src/dispatch/staging-cleanup.test.ts
  - src/runs/index.ts
  - src/runs/write-step.ts
  - src/runs/build-run-log.ts
  - src/telemetry/index.ts
  - src/telemetry/collect.ts
  - src/telemetry/aggregate.ts
  - src/telemetry/render-report.ts
  - src/telemetry/cli.ts
  - src/commands/next/run.ts
  - src/commands/loop/run.ts
  - docs/configuration.md
---

# Story 6.8: Auto-Archival of Runs and Telemetry

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper user,
I want run logs older than 90 days auto-archived and telemetry older than 12 months auto-rotated on Stepper start,
So that the active directories don't grow unbounded — closing the FINAL stepper-housekeeping piece (Sprint 6 storage hygiene) and completing the Stepper-internal lifecycle (Story 6.6 collector → Story 6.7 aggregator → Story 6.8 archiver).

## Context Summary

This is the **EIGHTH STORY of Epic 6** and lands the **AUTO-ARCHIVAL ORCHESTRATOR + TWO HOUSEKEEPING ARCHIVE MODULES**. Story 6.7 just shipped (status: done; 1531/0/5001 across 75 files; errors registry 17 verified independently) and produces a structured markdown report at `<paths.telemetry>/<period>.md`. Story 6.8 closes the deliverable lifecycle by archiving stale files in TWO independent locations:

1. **Runs older than 90 days** → `<paths.runs>/.archive/<YYYY-MM>/` (NFR-Sc4).
2. **Telemetry older than 12 months** → `<paths.telemetry>/.archive/` (NFR-Sc5).

Both archival paths are triggered at Stepper startup (any command) and run in the background (best-effort; never blocks the user's command). A single audit notice is emitted to stderr on the FIRST invocation per session.

**Story 6.8 is therefore primarily TWO NEW MID-TIER MODULES + ONE NEW ORCHESTRATOR + STARTUP-HOOK WIRING + ONE NEW INTEGRATION TEST**:

1. **NEW file `src/runs/archive.ts`** — exports `archiveOldRuns(opts)` which:
   - Reads `<runsRoot ?? RUNS_DEFAULT_PATH>/` listdir (filename + dirent only — NEVER reads CONTENT).
   - Filters entries via `fs.stat` mtime: keep entries where `now - mtime > 90 days` (default `90*24*3600*1000` ms; configurable via `ageThresholdMs`).
   - Skips the `.archive/` directory itself (idempotency — see AC-3) AND any non-file dirents.
   - Groups files by `<ts>` prefix (everything before the second dash + step segment) so `<ts>-<step>.log` and `<ts>-<step>.json` paired-files (Story 2.5) move together (preserves transcript browseability).
   - Computes destination `<runsRoot>/.archive/<YYYY-MM>/<basename>` where `<YYYY-MM>` is derived from the file's mtime (UTC-locked) NOT from the `<ts>` filename prefix (per OQ-4 below — mtime is the canonical truth; filename prefix may drift if the user manually copies files).
   - Calls `assertWithinScope(destPath)` on every destination per AR42.
   - Creates the destination dir via `fs.mkdir(...{recursive: true})` (idempotent).
   - Renames each file via `fs.rename(srcPath, destPath)` (atomic on the same filesystem; an EXDEV error falls back to copy-and-delete per OQ-5 below — but the runs dir lives within `_bmad-output/.stepper/` so cross-FS rename is unlikely on v0.1).
   - Returns `ArchiveOldRunsResult = { archivedCount: number; archivedFiles: readonly string[] }`.
   - Per-entry failures are logged via `warn()` but do NOT propagate (best-effort discipline mirrors Story 2.2's `cleanStagingOrphans`).

2. **NEW file `src/runs/archive.test.ts`** — colocated Bun tests covering AC-1 (90-day threshold), AC-3 (idempotency: second invocation is a no-op), edge cases (empty runs dir, dir doesn't exist, .archive/ subdir is skipped, paired .log+.json files move together, scope violation rejected, custom ageThresholdMs honoured for tests).

3. **NEW file `src/telemetry/rotate.ts`** — exports `rotateOldTelemetry(opts)` which:
   - Reads `<telemetryRoot ?? DEFAULT_TELEMETRY_ROOT>/` listdir (filename + dirent only).
   - Filters entries: keep `<period>.jsonl` and `<period>.md` files where `now - mtime > 12 months` (default `12*30*24*3600*1000` ms ≈ 360 days; configurable via `ageThresholdMs`). Per OQ-6 below, the threshold uses MS-arithmetic (not calendar-month subtraction) for determinism — accepts ~5-day slack for non-leap-year vs leap-year alignment, well within the "12 months" wording per epics AC-2 verbatim. Files NOT matching the `<period>.{jsonl,md}` pattern (e.g., a stray `.DS_Store`, a `notes.txt` placeholder) are SKIPPED (OQ-7 below — only canonical-pattern files are rotated; foreign files are left alone).
   - Skips the `.archive/` directory itself (idempotency) AND any non-file dirents.
   - Computes destination `<telemetryRoot>/.archive/<basename>` (NOTE: telemetry rotation is FLAT under `.archive/` per architecture line 358 — NO `<YYYY-MM>` subdir, unlike runs which use `.archive/<YYYY-MM>/<basename>`. Per OQ-8 below, the rationale is grep-friendliness — telemetry is monthly already so the `.archive/2025-04.jsonl` filename carries the period; runs are per-step so the `<YYYY-MM>` subdir prevents .archive/ blow-up).
   - Calls `assertWithinScope(destPath)` on every destination per AR42.
   - Creates the destination dir via `fs.mkdir(...{recursive: true})` (idempotent).
   - Renames each file via `fs.rename`.
   - Returns `RotateOldTelemetryResult = { rotatedCount: number; rotatedFiles: readonly string[] }`.

4. **NEW file `src/telemetry/rotate.test.ts`** — colocated Bun tests covering AC-2 (12-month threshold), AC-3 (idempotency), edge cases (empty telemetry dir, `.archive/` skipped, `<period>.jsonl` and `<period>.md` BOTH rotated for the same period, foreign-file skip, scope violation rejected).

5. **NEW file `src/startup/archival-trigger.ts`** — exports `runArchivalAtStartup(opts)` orchestrator that:
   - Accepts `{ config, oncePerSessionRef?, runsRootOverride?, telemetryRootOverride?, ageThresholdRunsMs?, ageThresholdTelemetryMs? }`.
   - Checks `oncePerSessionRef.fired === false` (default ref is a module-level singleton; tests inject a fresh ref-cell). If `fired === true`, return immediately (no-op).
   - Sets `oncePerSessionRef.fired = true` BEFORE invoking the archive modules (so an exception during one of them does NOT cause a re-run on the next call within the same session).
   - Calls `archiveOldRuns({runsRoot: opts.runsRootOverride ?? config.paths.runs, ageThresholdMs: opts.ageThresholdRunsMs ?? RUNS_AGE_THRESHOLD_MS_90D})`.
   - Calls `rotateOldTelemetry(...)` ONLY when `config.telemetry.enabled === true` per AC-2 verbatim. When `enabled === false`, rotation is SKIPPED with rationale "telemetry disabled — no JSONL/md to rotate" (the files do not exist when the collector is off, but we explicitly bypass the listdir to honour the AC-2 gate verbatim).
   - Catches any uncaught error from each archive module independently — per OQ-9 below, an `archiveOldRuns` failure does NOT prevent `rotateOldTelemetry` from running, and vice versa. Each independent failure is logged via `warn()`.
   - Emits ONE single-line `info()` audit notice on success: `archival: archived <archivedCount> runs older than 90 days, <rotatedCount> telemetry files older than 12 months`. When BOTH counts are 0, the audit notice is SKIPPED (no spam — common case is "nothing to archive" on a fresh clone).
   - Returns `RunArchivalAtStartupResult = { archivedRuns: number; rotatedTelemetry: number; alreadyFired: boolean }`. Production callers ignore the return; tests assert it.
   - The orchestrator is async but the runner-tier callers DO NOT `await` the returned promise — per AC-4 verbatim "archival never blocks the user's command — runs in the background". The runner-tier caller fire-and-forgets via `void runArchivalAtStartup(...)` and lets the JS event loop drive the async work concurrently with the dispatch path. The audit notice emerges asynchronously via stderr; the user sees it on the SAME stderr the dispatch logs use, but interleaved naturally.

6. **NEW file `src/startup/archival-trigger.test.ts`** — colocated Bun tests covering AC-3 (idempotency: second call within same ref is a no-op), AC-4 (non-blocking semantics — promise resolves but caller does not await), one-line audit notice format, gate on `telemetry.enabled === false`, error-isolation between runs and telemetry archives.

7. **NEW file `src/integration/auto-archival-startup.test.ts`** — top-level integration test (mirrors `aggregate-telemetry-no-pii.test.ts` placement at `src/integration/`). Sets up a tmpdir-rooted fixture with old + new runs files + old + new telemetry files; invokes `runArchivalAtStartup({config: tmpDirConfig})`; asserts:
   - Old runs (mtime > 90d) MOVED to `<runsRoot>/.archive/<YYYY-MM>/<basename>`.
   - New runs (mtime ≤ 90d) STAY in `<runsRoot>/<basename>`.
   - Old telemetry (mtime > 12m) MOVED to `<telemetryRoot>/.archive/<basename>`.
   - New telemetry (mtime ≤ 12m) STAYS in `<telemetryRoot>/<basename>`.
   - .archive/ subdirs themselves NOT moved (idempotency check #1).
   - Calling `runArchivalAtStartup` twice within the same `oncePerSessionRef` results in the second call returning `alreadyFired: true` with `archivedRuns: 0` AND no fs mutation (idempotency check #2 — within-session).
   - A FRESH `oncePerSessionRef` (simulating a NEW Bun process) re-archives nothing (the previous moves emptied the source side; idempotency check #3 — across-session, the no-op nature of "nothing left to archive").
   - Cross-link comments: `// AC-1 (epics.md line 1271); AC-2 (line 1274); AC-3 (line 1275); AC-4 (line 1276); NFR-Sc4 (architecture line 1413); NFR-Sc5 (architecture line 1414).`

8. **MODIFIED file `src/runs/index.ts`** — extend the barrel to re-export `archiveOldRuns`, `type ArchiveOldRunsOptions`, `type ArchiveOldRunsResult` from `./archive.ts`. ZERO mutation to existing exports.

9. **MODIFIED file `src/telemetry/index.ts`** — extend the barrel to re-export `rotateOldTelemetry`, `type RotateOldTelemetryOptions`, `type RotateOldTelemetryResult` from `./rotate.ts`. ZERO mutation to existing exports.

10. **MODIFIED file `src/commands/next/run.ts`** — wire `runArchivalAtStartup({config: opts.config})` at the existing Step 4 staging-orphan-cleanup site. The archival call follows the staging-cleanup pattern verbatim: best-effort try/catch + warn() on failure + fire-and-forget. Per OQ-10 below, the call is gated on `!args.dryRun` (mirrors staging cleanup gate — the integration test `src/integration/dry-run-no-writes.test.ts` snapshots the tmpdir before+after `--dry-run` and asserts byte-identical inventory; archival WOULD mutate the inventory, so the gate preserves the snapshot invariant).

11. **MODIFIED file `src/commands/loop/run.ts`** — wire `runArchivalAtStartup({config: opts.config})` at the loop-runner setup phase, BEFORE the iteration loop starts. Mirrors next/run.ts pattern: best-effort + fire-and-forget + dry-run gate. The loop runner ALREADY threads `opts.config` (Story 6.1 wiring) — the archival call reuses this without API extension. Per OQ-11 below, the loop runner does NOT call `cleanStagingOrphans` itself (it delegates to per-iteration `runNext` which DOES call it); for Story 6.8, however, the archival trigger is added DIRECTLY at the loop setup phase because the loop's per-iteration runNext invocations would each fire the archival trigger but the once-per-session marker would short-circuit all but the first — better to fire it ONCE at loop setup for clarity.

12. **MODIFIED file `docs/configuration.md`** — extend the existing telemetry section + ADD a NEW `## Auto-archival (Story 6.8 — DONE)` top-level section. Documents:
    - The two archival paths: runs > 90d → `.archive/<YYYY-MM>/`; telemetry > 12m → `.archive/`.
    - The startup-trigger semantics + once-per-session behaviour.
    - The non-blocking + best-effort nature.
    - The idempotency property.
    - The `telemetry.enabled` gate for telemetry rotation only (runs archival is unconditional).
    - Cross-links to NFR-Sc4 + NFR-Sc5 + the integration test.
    - UPDATE the forward-tracker section (Stories 6.3-6.8 list at lines 664-708) — mark Story 6.8 as DONE; cross-link to the new section.

The runner architecture is INDEPENDENT of `verify-and-advance.ts` and the dispatch pipeline — the archival trigger fires at the `runNext` / `runLoop` setup phase BEFORE the lock is acquired (next/run.ts is already lock-free per AR8; verify-and-advance.ts owns the lock; loop/run.ts is also lock-free since it composes runNext). ZERO mutation to `src/commands/next/verify-and-advance.ts`. The archival modules do NOT acquire the state.yaml lock per AR8 (lock-free top-tier preserved — the archival operations are fully independent of state.yaml; ZERO state.yaml mutation; ZERO interaction with the dispatch/verify pipeline).

### What is in scope (Story 6.8)

1. **NEW file `src/runs/archive.ts`** — exports `archiveOldRuns(opts: ArchiveOldRunsOptions): Promise<ArchiveOldRunsResult>`. The function:
   - Resolves `runsRoot = opts.runsRoot ?? RUNS_DEFAULT_PATH` (mirroring Story 2.2's `cleanStagingOrphans` resolution pattern).
   - Resolves `ageThresholdMs = opts.ageThresholdMs ?? RUNS_AGE_THRESHOLD_MS_90D` (constant `90 * 24 * 60 * 60 * 1000` ms = 7,776,000,000 ms).
   - Resolves `now = opts.now ?? new Date()` (Date object — Story 4.9 SIGINT pattern + Story 2.2 staging-cleanup pattern injectable for tests).
   - Returns `{ archivedCount: 0, archivedFiles: [] }` immediately if `runsRoot` does not exist (first-run case — idempotent no-op).
   - Calls `fs.readdir(runsRoot, { withFileTypes: true })` to enumerate top-level entries.
   - For each entry:
     - SKIP if `.archive` (the archive subdir itself — idempotency hard-gate).
     - SKIP if dirent is NOT a regular file (subdirs other than `.archive` are forward-deferred — they don't exist in v0.1's runs structure but if they appear they're left alone). NOTE: Story 2.5's runs dir contains FILES (`<ts>-<step>.{log,json}`) plus the `.archive/` subdir Story 6.8 ITSELF creates — there are no other subdirs.
     - `await fs.stat(srcPath)` to get mtime.
     - SKIP if `now.getTime() - stat.mtimeMs <= ageThresholdMs` (file is fresh — keep in active runs/).
     - Compute destination period: `mtimeYearMonth = stat.mtime.toISOString().slice(0, 7)` (UTC-locked per the same I-48 discipline as Story 6.6).
     - Compute destination path: `path.join(runsRoot, ".archive", mtimeYearMonth, dirent.name)`.
     - `assertWithinScope(destPath)` per AR42 + NFR-S2.
     - `await fs.mkdir(path.dirname(destPath), { recursive: true })` (idempotent).
     - `await fs.rename(srcPath, destPath)` — atomic same-FS rename.
     - On EXDEV error (cross-FS rename — rare under `_bmad-output/.stepper/`): per OQ-5, fall back to `await fs.copyFile(src, dest); await fs.unlink(src)` (NOT atomic but best-effort; logged via `warn()` for the user to observe). For v0.1 the copy-fallback path is not expected to fire and is included only for FS-portability robustness.
     - Push destPath into archivedFiles[].
   - Per-entry exceptions are caught + logged via `warn()` and the loop continues (best-effort discipline). The aggregate "archivedCount" reflects ONLY successful moves.
   - Return `{ archivedCount: archivedFiles.length, archivedFiles }`.

2. **NEW file `src/runs/archive.test.ts`** — Bun-test colocated tests:
   - **ARCH_68_BASIC_1**: tmpdir runs/ with 3 old files (mtime = now - 100d) + 2 new files (mtime = now - 30d) → assert 3 moved, 2 stay; destination = `runs/.archive/<YYYY-MM>/<basename>` for each old file.
   - **ARCH_68_PAIRED_1**: write old `2026-01-15T10-00-00-bmad-create-story.log` + `2026-01-15T10-00-00-bmad-create-story.json` (paired Story 2.5 files) with same mtime → assert BOTH moved to `.archive/<YYYY-MM>/` (paired-file invariant honoured).
   - **ARCH_68_THRESHOLD_1**: file with mtime exactly `now - 90d` → assert NOT moved (threshold is strict `>`, not `>=`; AC-1 wording "older than 90 days" → `now - mtime > 90d`).
   - **ARCH_68_IDEMPOTENT_1**: archive once, capture archivedFiles[]; archive again immediately → assert 0 archived (idempotency / AC-3 verbatim).
   - **ARCH_68_SKIP_ARCHIVE_DIR_1**: pre-create `.archive/2025-12/` subdir with files inside → assert the subdir is NOT recursed into (only top-level enumeration; `.archive/` is hard-skipped at the entry level).
   - **ARCH_68_NO_DIR_1**: runsRoot does not exist → assert returns `{archivedCount: 0, archivedFiles: []}` (first-run idempotent no-op).
   - **ARCH_68_EMPTY_1**: runsRoot exists but contains no files → assert returns `{archivedCount: 0, archivedFiles: []}`.
   - **ARCH_68_AGE_OVERRIDE_1**: pass `ageThresholdMs: 1000` (1 second), file mtime = now - 5s → assert moved (test-seam threshold injection).
   - **ARCH_68_OUT_OF_SCOPE_1**: pass `runsRoot: "/etc"` (outside allowed scope) → expect ScopeViolationError (raised when assertWithinScope hits a destPath outside scope; happens at the first move attempt).
   - **ARCH_68_BEST_EFFORT_1**: simulate per-file failure (e.g., rename onto a path that already exists with no-clobber semantics) → assert the loop continues + the OTHER files are still moved + a warn() is emitted.
   - **ARCH_68_DESTINATION_PERIOD_FROM_MTIME_1**: file with mtime in 2025-12 → destination contains `.archive/2025-12/` (UTC-locked per I-48).

3. **NEW file `src/telemetry/rotate.ts`** — exports `rotateOldTelemetry(opts: RotateOldTelemetryOptions): Promise<RotateOldTelemetryResult>`. The function:
   - Resolves `telemetryRoot = opts.telemetryRoot ?? DEFAULT_TELEMETRY_ROOT` (the existing constant from `src/telemetry/collect.ts`).
   - Resolves `ageThresholdMs = opts.ageThresholdMs ?? TELEMETRY_AGE_THRESHOLD_MS_12M` (constant `12 * 30 * 24 * 60 * 60 * 1000` ms = 31,104,000,000 ms; per OQ-6 the ~5-day slack for leap years is acceptable).
   - Resolves `now = opts.now ?? new Date()`.
   - Returns `{ rotatedCount: 0, rotatedFiles: [] }` immediately if `telemetryRoot` does not exist.
   - Calls `fs.readdir(telemetryRoot, { withFileTypes: true })`.
   - For each entry:
     - SKIP if `.archive` (idempotency).
     - SKIP if dirent is NOT a regular file.
     - SKIP if name does NOT match `<period>.{jsonl,md}` pattern (regex `/^\d{4}-\d{2}\.(jsonl|md)$/` — per OQ-7, foreign files like `notes.txt` are LEFT ALONE; only canonical telemetry artifacts are rotated).
     - `await fs.stat(srcPath)` to get mtime.
     - SKIP if `now.getTime() - stat.mtimeMs <= ageThresholdMs`.
     - Compute destination: `path.join(telemetryRoot, ".archive", dirent.name)` (FLAT — NO `<YYYY-MM>` subdir, per architecture line 358 + OQ-8 below).
     - `assertWithinScope(destPath)`.
     - `await fs.mkdir(path.dirname(destPath), { recursive: true })`.
     - `await fs.rename(srcPath, destPath)` (with EXDEV copy-fallback per OQ-5).
     - Push destPath into rotatedFiles[].
   - Per-entry exceptions caught + logged via `warn()` + loop continues.
   - Return `{ rotatedCount: rotatedFiles.length, rotatedFiles }`.

4. **NEW file `src/telemetry/rotate.test.ts`** — Bun-test colocated tests:
   - **ROTATE_68_BASIC_1**: tmpdir telemetry/ with old `2024-04.jsonl` + old `2024-04.md` + new `2026-04.jsonl` → assert old jsonl + md moved to `.archive/`, new file stays.
   - **ROTATE_68_PAIRED_1**: same period for jsonl and md (e.g., both `2024-04`) → assert BOTH moved (paired by name; the rotation is per-file by mtime, so both fire when both are old).
   - **ROTATE_68_FOREIGN_FILE_SKIP_1**: write `notes.txt` with old mtime → assert NOT moved (regex gate).
   - **ROTATE_68_THRESHOLD_1**: file with mtime exactly `now - 12m` → NOT moved.
   - **ROTATE_68_IDEMPOTENT_1**: rotate twice → second call 0 rotated.
   - **ROTATE_68_SKIP_ARCHIVE_DIR_1**: pre-existing `.archive/2024-04.jsonl` not re-rotated.
   - **ROTATE_68_NO_DIR_1**: telemetryRoot does not exist → no-op.
   - **ROTATE_68_AGE_OVERRIDE_1**: `ageThresholdMs: 1000`, file mtime = now - 5s → moved.
   - **ROTATE_68_OUT_OF_SCOPE_1**: `telemetryRoot: "/etc"` → ScopeViolationError.
   - **ROTATE_68_BEST_EFFORT_1**: per-file failure → loop continues + warn().

5. **NEW file `src/startup/archival-trigger.ts`** — orchestrator with closure-private once-per-session marker. The function:
   - Module-level singleton: `const DEFAULT_ONCE_PER_SESSION_REF: { fired: boolean } = { fired: false };` (mutable closure-private). Production callers omit `oncePerSessionRef` from opts — the singleton tracks the lifetime of the Bun process.
   - Function `runArchivalAtStartup(opts: RunArchivalAtStartupOptions): Promise<RunArchivalAtStartupResult>`:
     - `const ref = opts.oncePerSessionRef ?? DEFAULT_ONCE_PER_SESSION_REF;`
     - If `ref.fired === true` → return `{ archivedRuns: 0, rotatedTelemetry: 0, alreadyFired: true }` immediately.
     - Set `ref.fired = true;` BEFORE invoking archive modules (so an exception during one of them does NOT cause a re-run within the same session — per OQ-3).
     - Wrap each archive call in independent try/catch (per OQ-9 — error isolation):
       ```ts
       let archivedRuns = 0;
       try {
         const r = await archiveOldRuns({
           runsRoot: opts.runsRootOverride ?? opts.config.paths.runs,
           ageThresholdMs: opts.ageThresholdRunsMs,
         });
         archivedRuns = r.archivedCount;
       } catch (err) {
         warn(`archival: runs archival failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
       }
       let rotatedTelemetry = 0;
       if (opts.config.telemetry.enabled) {
         try {
           const r = await rotateOldTelemetry({
             telemetryRoot: opts.telemetryRootOverride ?? opts.config.paths.telemetry,
             ageThresholdMs: opts.ageThresholdTelemetryMs,
           });
           rotatedTelemetry = r.rotatedCount;
         } catch (err) {
           warn(`archival: telemetry rotation failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
         }
       }
       ```
     - When `archivedRuns > 0 || rotatedTelemetry > 0`, emit single-line `info()`: `archival: archived ${archivedRuns} runs older than 90 days, ${rotatedTelemetry} telemetry files older than 12 months` (AR21 single-line). When BOTH are 0, the audit notice is SKIPPED (no spam — the most common case is "fresh project, nothing to archive").
     - Return `{ archivedRuns, rotatedTelemetry, alreadyFired: false }`.
   - JSDoc documents Story 6.8 + AR41 mid-tier orchestrator role + AC-3 idempotency + AC-4 non-blocking + the closure-private session pattern.

6. **NEW file `src/startup/archival-trigger.test.ts`** — Bun-test colocated tests:
   - **TRIGGER_68_BASIC_1**: synthetic config with tmpdir paths + tmpdir-old fixtures (3 runs older than 90d, 1 telemetry older than 12m, telemetry.enabled true) → call `runArchivalAtStartup({config, oncePerSessionRef: {fired:false}})` → assert `{archivedRuns: 3, rotatedTelemetry: 1, alreadyFired: false}`; assert files moved.
   - **TRIGGER_68_TELEMETRY_DISABLED_1**: `config.telemetry.enabled = false` + old telemetry file present → `rotatedTelemetry === 0`; the file remains in active dir (per AC-2 verbatim — gate is on enabled).
   - **TRIGGER_68_ONCE_PER_SESSION_1**: invoke twice with same `oncePerSessionRef` → first call `{archivedRuns: N, alreadyFired: false}`; second call `{archivedRuns: 0, rotatedTelemetry: 0, alreadyFired: true}` (no fs activity on second).
   - **TRIGGER_68_FRESH_REF_1**: invoke twice with DIFFERENT refs → both fire (simulating two separate Bun processes); the second one finds nothing to archive (the first one already moved everything) — but `alreadyFired === false` for both because the ref is fresh.
   - **TRIGGER_68_AUDIT_NOTICE_FORMAT_1**: spy on `info()` → verify single-line message matches `/^archival: archived \d+ runs older than 90 days, \d+ telemetry files older than 12 months$/` (AR21).
   - **TRIGGER_68_NO_AUDIT_WHEN_ZERO_1**: fresh project (nothing to archive) → assert `info()` NOT called (no spam discipline).
   - **TRIGGER_68_ERROR_ISOLATION_1**: monkey-patch `archiveOldRuns` to throw → assert `rotateOldTelemetry` STILL runs and returns its count; the runs error is logged via `warn()`.
   - **TRIGGER_68_NON_BLOCKING_1**: assert the function returns a Promise (not a sync result); the caller can fire-and-forget via `void runArchivalAtStartup(...)` — verified by `Promise.race([promise, sleep(1)])` semantics.
   - **TRIGGER_68_FIRED_BEFORE_INVOKE_1**: assert `ref.fired === true` is set BEFORE the archive modules are called (so an exception during the first call still leaves `fired === true` — preventing re-entry).

7. **NEW file `src/integration/auto-archival-startup.test.ts`** — top-level integration test (mirror `aggregate-telemetry-no-pii.test.ts` placement):
   - Setup: tmpdir-rooted fixture with `runs/` containing 3 old + 2 new files (paired .log+.json), `telemetry/` containing old `2024-04.jsonl` + old `2024-04.md` + new `2026-04.jsonl`. Synthetic Config with `paths.runs = <tmpdir>/runs/`, `paths.telemetry = <tmpdir>/telemetry/`, `telemetry.enabled = true`.
   - Test body: invoke `runArchivalAtStartup({config, oncePerSessionRef: {fired:false}})`. Assert:
     - Old runs MOVED to `<runsRoot>/.archive/<YYYY-MM>/<basename>`.
     - New runs STAY in `<runsRoot>/<basename>`.
     - Old telemetry MOVED to `<telemetryRoot>/.archive/<basename>`.
     - New telemetry STAYS in `<telemetryRoot>/<basename>`.
     - `info()` audit notice emitted (single line).
     - Calling twice within same `oncePerSessionRef` results in `alreadyFired: true` on second + ZERO additional fs mutation (snapshot inventory before+after second call).
     - Cross-link comment: `// AC-1 (epics.md line 1271); AC-2 (line 1274); AC-3 (line 1275); AC-4 (line 1276); NFR-Sc4 (architecture line 1413); NFR-Sc5 (architecture line 1414).`

8. **MODIFIED file `src/runs/index.ts`** — extend the barrel:
   ```ts
   export {
     archiveOldRuns,
     type ArchiveOldRunsOptions,
     type ArchiveOldRunsResult,
     RUNS_AGE_THRESHOLD_MS_90D,
   } from "./archive.ts";
   ```

9. **MODIFIED file `src/telemetry/index.ts`** — extend the barrel:
   ```ts
   export {
     rotateOldTelemetry,
     type RotateOldTelemetryOptions,
     type RotateOldTelemetryResult,
     TELEMETRY_AGE_THRESHOLD_MS_12M,
   } from "./rotate.ts";
   ```

10. **MODIFIED file `src/commands/next/run.ts`** — wire the archival trigger at the existing Step 4 staging-orphan-cleanup site (~line 1583, just AFTER the cleanStagingOrphans block). The modification:
    - ADD import: `import { runArchivalAtStartup } from "../../startup/archival-trigger.ts";`
    - ADD code (best-effort + dry-run gate + fire-and-forget):
      ```ts
      // Story 6.8: archival of old runs + telemetry at startup. Best-effort,
      // non-blocking. Dry-run gate mirrors staging-cleanup gate per OQ-10.
      if (!args.dryRun && opts?.config !== undefined) {
        // Fire-and-forget per AC-4. The promise resolves asynchronously;
        // the user's command does NOT block on it.
        void runArchivalAtStartup({ config: opts.config }).catch((err) => {
          log.info(
            `archival: trigger failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
          );
        });
      }
      ```
    - ZERO mutation to args parsing, dispatch, or any other concern.
    - Per OQ-12 below, `opts?.config` may be `undefined` when the runner is invoked without a loaded config (e.g., in tests). When `undefined`, the archival trigger is SKIPPED — production callers always pass `opts.config` from the import.meta.main `loadConfig()` call.

11. **MODIFIED file `src/commands/loop/run.ts`** — wire the archival trigger at the loop setup phase (BEFORE the iteration loop starts; AFTER args resolution + config resolution). The modification mirrors next/run.ts pattern verbatim:
    - ADD import: `import { runArchivalAtStartup } from "../../startup/archival-trigger.ts";`
    - ADD code at loop setup (~line 880, after the SIGINT setup-phase check #1):
      ```ts
      // Story 6.8: archival of old runs + telemetry at startup. Best-effort,
      // non-blocking. Mirrors next/run.ts pattern. Dry-run gate via
      // args.planFirst (the loop runner's analog to --dry-run).
      if (!args.planFirst && effectiveConfig !== undefined) {
        void runArchivalAtStartup({ config: effectiveConfig }).catch((err) => {
          warn(
            `archival: trigger failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
          );
        });
      }
      ```
    - The `args.planFirst` gate is the loop's analog to `--dry-run` (Story 4.7) — per OQ-10 alignment, plan-mode is a read-only dry-run that should NOT mutate the inventory.

12. **MODIFIED file `docs/configuration.md`** — extend with a NEW section + update forward-tracker:
    - ADD new top-level section `## Auto-archival (Story 6.8 — DONE)` after the `## Forward-tracker — Stories 6.3-6.8` section. Document:
      - The two archival paths: runs > 90d → `<paths.runs>/.archive/<YYYY-MM>/`; telemetry > 12m → `<paths.telemetry>/.archive/`.
      - The startup-trigger semantics: fires on the FIRST call to `/bmad-next` or `/bmad-loop` per Bun-process session.
      - The non-blocking nature: archival runs in the background; the user's command continues unimpeded.
      - The idempotency property: running twice in a row is a no-op (within the same session, the once-per-session marker short-circuits; across sessions, the threshold filter naturally re-skips already-moved files).
      - The `telemetry.enabled` gate: telemetry rotation runs ONLY when telemetry is enabled (the JSONL files do not exist when telemetry is off; the gate is per AC-2 verbatim).
      - The audit notice: ONE single-line stderr message on the FIRST call when ANY files were archived (suppressed when zero work — no spam).
      - Cross-links: NFR-Sc4 (architecture line 1413), NFR-Sc5 (architecture line 1414), AC-1/2/3/4 from epics.md lines 1269-1276, the integration test at `src/integration/auto-archival-startup.test.ts`.
    - UPDATE the forward-tracker section: change "Story 6.8 — telemetry rotation: files older than 12 months are moved to `<paths.telemetry>/.archive/` on Stepper start." to "Story 6.8 — DONE — auto-archival of runs (> 90 days → `<paths.runs>/.archive/<YYYY-MM>/`) and telemetry (> 12 months → `<paths.telemetry>/.archive/`); fires once per Stepper session at `/bmad-next` or `/bmad-loop` startup; non-blocking + idempotent + telemetry-rotation gated on `telemetry.enabled`. See `## Auto-archival (Story 6.8 — DONE)` section above for details."

### Cross-story coordination preserved

- **Story 6.7 SDR I-47 + I-48 honoured** — I-48 (UTC discipline) PRIMARY HONOURED at archive.ts mtime → YYYY-MM derivation (`stat.mtime.toISOString().slice(0, 7)`) and at rotate.ts threshold arithmetic (12 months in ms; UTC-locked via `now.getTime() - mtime.getTime()`). I-47 was CLOSED at Story 6.7 close — Story 6.8 has no errorCode aggregation surface.
- **Story 6.7 OQ-3 invariant preserved** — the aggregator still reads ONLY from `<paths.telemetry>/<period>.jsonl` (active dir), NOT from `.archive/`. Story 6.8 moves OLD periods to `.archive/`; the aggregator's active-dir scope is untouched. Aggregating archived periods remains a forward-tracker (post-v0.1).
- **Story 6.6 collector UNCHANGED at the API surface** — Story 6.8 only consumes the file-format invariants Story 6.6 established; ZERO mutation to `src/telemetry/collect.ts` or `src/telemetry/collect.test.ts`. The collector continues to write to the active `<period>.jsonl`; rotation moves OLD `<period>.jsonl` files to `.archive/`.
- **Story 6.6 SDR I-48 PRIMARY HONOURED at rotate.ts** — period boundary arithmetic uses UTC ms-subtraction; the `.toISOString().slice(0,7)` pattern carries forward from Story 6.6 collector → Story 6.7 aggregator → Story 6.8 archiver as a transitive UTC discipline.
- **Story 5.6 + 6.1 + 6.2 + 6.3 + 6.4 + 6.5 + 6.6 + 6.7 `opts.config` seam UNCHANGED** — Story 6.8 reads from the SAME `opts.config` field the runner-tier already consumes. ZERO seam touch. Both `runNext` and `runLoop` call `runArchivalAtStartup({config: opts.config})` and the modules pull `paths.runs`, `paths.telemetry`, `telemetry.enabled` directly.
- **Errors registry HELD AT 17** — Story 6.8 ships ZERO new error classes. Per-entry failures use `warn()` with bare Error message strings; the orchestrator's outer try/catch surfaces single-line stderr but does NOT throw. ScopeViolationError is the EXISTING `assertWithinScope` error (Story 1.5 + Story 1.6) — it's reused at the destination-path check. The `escalate-actionable-hint.test.ts` 33-test sweep over all 17 error classes UNCHANGED.
- **Schema migration registry HELD AT v1** — ZERO mutation to `TelemetryRecordV1Schema` shape; ZERO new schemas. The archival modules NEVER read content; they only operate on filenames + mtime.
- **AR9 stdout JSON-line invariant unchanged** — archival modules write to FILES (rename), NOT stdout; only `info()`/`warn()` go to stderr per FR54 + NFR-S1. The `commands/bmad-{next,loop}.md` slash-command markdown files UNCHANGED per OQ-13.

### What is NOT in scope (deferred)

- **Calendar-month subtraction for the 12-month threshold** — DEFERRED per OQ-6. v0.1 uses ms-arithmetic (`12 * 30 * 24 * 60 * 60 * 1000` ≈ 360 days); the ~5-day slack vs calendar-month subtraction is acceptable per epics AC-2 wording "older than 12 months". A future story could extend to use `Date.setUTCMonth` arithmetic if precise calendar boundaries become important.
- **Recursive content-aware archival** — DEFERRED. v0.1 only moves top-level files in runs/ and telemetry/; the `.archive/` subdir itself is not recursed. Subdirectory accumulation in `.archive/<YYYY-MM>/` is handled by the natural mtime monotonicity (each archival period is a separate subdir).
- **Configurable archival thresholds via `bmad-stepper.config.yaml`** — DEFERRED post-v0.1. The 90-day + 12-month constants are fixed in code; tests inject overrides via the function options seam. A future story could add `archival: { runsAgeDays: 90, telemetryAgeMonths: 12 }` block to the config schema.
- **Aggregating archived periods** — DEFERRED post-v0.1 per Story 6.7 OQ-3. The aggregator reads only active-dir files; archived periods are out of reach.
- **Compression of archived files (.tar.gz, .zstd)** — DEFERRED. v0.1 simply renames files; archived files remain individually readable. A future story could add bulk compression of `<runsRoot>/.archive/<YYYY-MM>/` to a single `.tar.zst` once the period closes.
- **Cross-FS archival** — DEFERRED edge-case path. Per OQ-5, the EXDEV fallback (copy + delete) is included for FS-portability robustness; production usage on `_bmad-output/.stepper/` (single project filesystem) does NOT cross FS boundaries. A future story could add a dedicated test if FS-cross becomes common.
- **Audit log persistence** — DEFERRED. v0.1 emits the audit notice to stderr only (transient). A future story could persist archival activity to `_bmad-output/.stepper/archival-audit.jsonl` for long-term tracking.
- **Manual archival CLI** — DEFERRED. v0.1 archival fires automatically on Stepper start. A future story could add `bun run archive --force` or `/bmad-next --archive-now` for ad-hoc trigger.
- **Archival of `_bmad-output/.stepper/staging/`** — DEFERRED. Staging orphans are handled by Story 2.2's `cleanStagingOrphans` (24h threshold; deletion not archival). The Story 2.2 mechanism + Story 6.8 archival cover non-overlapping concerns: staging is short-lived intermediate state (24h delete), runs+telemetry are long-lived dogfood signals (90d/12m archive).

### Architectural challenges resolved here

**Architectural decision — archive vs delete (per OQ-1 + AC-1/AC-2 verbatim)**: AC-1 says "moves matching files to `runs/.archive/<YYYY-MM>/`" and AC-2 says "moves them to `telemetry/.archive/`" — both verbatim "moves" (not "deletes"). Story 6.8 uses `fs.rename` semantics to MOVE files into archive subdirs. This preserves the historical record (auditability, future analysis, post-mortem reconstruction) while keeping the active directories small. **Rejected alternative:** delete after 90/12 (would lose dogfood signal forever and violates AC verbatim wording).

**Architectural decision — once-per-session marker pattern (per OQ-3)**: The startup hook fires on EVERY `/bmad-next` and `/bmad-loop` invocation. Naively, this would re-run archival on every command — wasted I/O. Story 6.8 uses a closure-private `oncePerSessionRef` pattern (mirroring Story 4.9 SIGINT closure-private flag): the module-level singleton tracks whether archival has fired in the CURRENT Bun process. Within a single `bun run` invocation, archival runs at most once. Across separate invocations (separate Bun processes), each process re-fires; the threshold filter then naturally short-circuits (most files are already moved on subsequent runs).

**Architectural decision — non-blocking via fire-and-forget (per OQ-2 + AC-4 verbatim)**: AC-4 says "archival never blocks the user's command — runs in the background". Story 6.8 implements this via fire-and-forget at the call site: `void runArchivalAtStartup({config}).catch(...)`. The runner-tier caller does NOT `await` the archival promise. The async work continues concurrently with the dispatch path; the audit notice emerges asynchronously to stderr; if the archival fails, the `.catch()` handler logs via warn() but the user's command is unaffected. **Rejected alternative:** spawn a child process or worker thread (overkill for v0.1 — adds a dependency on Bun's worker_threads API and complicates testing).

**Architectural decision — idempotency via threshold + skip-archive-dir (per OQ-3 + AC-3 verbatim)**: AC-3 says "archival is idempotent (running twice in a row is a no-op)". Story 6.8 achieves this via THREE layers: (1) `oncePerSessionRef` short-circuits within a single session; (2) the threshold filter on mtime naturally re-skips already-moved files (since `.archive/` is hard-skipped at the entry-loop level, files inside `.archive/` are NOT re-evaluated); (3) `fs.rename` is atomic on the same filesystem so a partial-completion crash leaves either the source OR the destination — never both. Per OQ-3 layered defence: even if `.fired = true` were unset (e.g., a test does so), the threshold + skip-archive-dir still prevents re-archival.

**Architectural decision — error isolation between runs and telemetry archives (per OQ-9)**: The orchestrator wraps each archive call in INDEPENDENT try/catch. An `archiveOldRuns` failure does NOT prevent `rotateOldTelemetry` from running (and vice versa). Each independent failure is logged via warn(); neither propagates to the user. Rationale: the two paths are fully orthogonal (different roots, different schemas, different age thresholds); a transient FS error on one MUST NOT cascade to the other. **Rejected alternative:** halt-on-first-error (would mask the second archive's success and surprise the user with one-but-not-the-other behaviour).

**Architectural decision — best-effort per-entry within each module (per Story 2.2 staging-cleanup pattern)**: Inside each archive module, per-entry failures are caught + logged + the loop continues (mirrors Story 2.2's `cleanStagingOrphans` discipline). This is BELT-AND-BRACES on top of the orchestrator-level error isolation: even within a single module, one corrupt file (e.g., permission denied on rename) does NOT prevent OTHER files from archiving. The aggregate `archivedCount` reflects ONLY successful moves.

**Architectural decision — UTC-locked period derivation (per OQ-4 + I-48 transitive HONOURED)**: For runs archival, the destination subdir `<YYYY-MM>` is derived from `stat.mtime.toISOString().slice(0, 7)` — UTC-locked. This carries forward I-48 (Story 6.6 + 6.7 UTC discipline) transitively to Story 6.8. Rationale: filename `<ts>` prefix could be drift-prone if the user manually copies files; mtime is the canonical truth. **Rejected alternative:** derive `<YYYY-MM>` from the `<ts>` filename prefix (would be filename-coupled and break for non-canonical filenames).

**Architectural decision — flat telemetry archive vs per-period subdir (per OQ-8)**: For telemetry rotation, `.archive/` is FLAT (no `<YYYY-MM>` subdir) per architecture line 358. For runs archival, `.archive/<YYYY-MM>/` is per-period per architecture line 349. Rationale: telemetry files are ALREADY per-period (`<YYYY-MM>.jsonl`, `<YYYY-MM>.md`) so the flat archive carries the period in the filename — grep-friendly, no additional structure needed. Runs files are per-step (multiple per day; potentially hundreds per period) so the per-period subdir prevents `.archive/` from accumulating thousands of unrelated files at the top level.

**Architectural decision — telemetry-rotation gate on telemetry.enabled (per AC-2 verbatim)**: AC-2 says "and `telemetry.enabled` is true". When telemetry is disabled, the JSONL+md files do not exist — there's nothing to rotate. Story 6.8 explicitly bypasses the listdir when `telemetry.enabled === false` (no-op). **Rejected alternative:** always run rotate.ts and let it gracefully no-op on empty dir (would be slightly slower on disabled-telemetry runs and obscures the gate intent).

**Architectural decision — runs-archival NOT gated on telemetry.enabled (per AC-1 verbatim)**: AC-1 makes no mention of telemetry.enabled — runs are written by every `/bmad-next` invocation regardless of telemetry config. Story 6.8 does NOT gate runs archival on any flag; it ALWAYS fires on Stepper start.

**Architectural decision — module placement per AR41 (per OQ-11)**: `src/runs/archive.ts` is MID-TIER (sibling of `write-step.ts`, `build-run-log.ts`). `src/telemetry/rotate.ts` is MID-TIER (sibling of `collect.ts`, `aggregate.ts`). `src/startup/archival-trigger.ts` is a NEW MID-TIER directory — it imports from `src/runs/index.ts`, `src/telemetry/index.ts` (sibling mid-tier — allowed; both re-export the archive functions), `src/io/log.ts` (foundational), `src/schemas/config.ts` (foundational type). The `startup/` directory is a NEW addition not pre-listed in architecture line 1205-1252 — justified per OQ-11 as a distinct concern (orchestrating disparate mid-tier modules at runner startup) that does NOT belong in either `src/runs/` or `src/telemetry/` (both modules are unaware of the cross-coupling). This is the SAME pattern as `src/dispatch/staging-cleanup.ts` (Story 2.2 — a higher-tier orchestrator imports from foundational + mid-tier).

Wait — re-reading AR41: `src/dispatch/` is HIGHER-TIER (architecture line 1287-1289), not mid-tier. The `startup/` orchestrator should logically sit at the SAME tier as the modules it composes. Since `runs/` and `telemetry/` are MID-TIER and the orchestrator imports from BOTH, the orchestrator must be MID-TIER OR HIGHER. We choose MID-TIER (sibling) since the orchestrator does NOT consume any higher-tier module (no dispatch, verifiers, failure-ux). This is consistent with the AR41 graph: foundational < mid-tier < higher-tier. The `startup/` directory is NEW; v0.1 has only one file (`archival-trigger.ts` + test); future stories may add more startup hooks (e.g., orphan cleanup migration).

**Final placement decision — `src/startup/` as a NEW MID-TIER directory**. The AR41 import boundary remains clean: the orchestrator imports from foundational + mid-tier siblings only. The test `src/integration/auto-archival-startup.test.ts` is at integration tier per architecture line 1233-1247 (cross-module integration tests are allowed to import from anywhere).

**Architectural decision — runner-tier wiring at next/run.ts AND loop/run.ts (per OQ-12)**: The archival trigger is wired at TWO sites — once for `/bmad-next` (top-tier `runNext`) and once for `/bmad-loop` (top-tier `runLoop`). Per OQ-12, the loop runner could in principle delegate to per-iteration `runNext` invocations and let the once-per-session marker handle deduplication, but this would couple the loop runner to runNext's startup discipline and surface the audit notice on iteration #1 instead of at loop entry. Wiring the trigger at BOTH sites makes the once-per-session behaviour explicit at both entry points — first call wins; subsequent in-process calls (per-iteration runNext) short-circuit via the closure-private flag.

**Architectural decision — dry-run + plan-first gate (per OQ-10)**: The `--dry-run` flag (Story 3.3) and `--plan-first` flag (Story 4.7) are READ-ONLY modes that MUST NOT mutate the inventory. The integration test `src/integration/dry-run-no-writes.test.ts` snapshots the tmpdir before+after `--dry-run` and asserts byte-identical inventory. Archival WOULD mutate inventory (rename = atomic move = inventory change). Story 6.8 gates the archival call on `!args.dryRun` (next/run.ts) and `!args.planFirst` (loop/run.ts) — mirroring the existing staging-cleanup gate at next/run.ts line 1584 verbatim.

**Architectural decision — audit notice suppression when zero work (per AR21 + OQ-14)**: AR21 mandates single-line audit notices. Story 6.8 emits the notice ONLY when `archivedRuns + rotatedTelemetry > 0`. Rationale: the most common case is "fresh project, nothing to archive"; emitting "archived 0 runs older than 90 days, 0 telemetry files older than 12 months" on every Stepper start would be spam. The user only needs to KNOW about archival when it actually moved something. **Rejected alternative:** always emit the notice (would be noisy on the v0.1 dogfood path where every command starts with a fresh-ish runs/ dir).

### Concretely, Story 6.8 produces

- **NEW file 1**: `src/runs/archive.ts` (~120-150 LoC including JSDoc) — exports `archiveOldRuns({runsRoot?, ageThresholdMs?, now?})`. JSDoc documents Story 6.8 + AR41 mid-tier + AR42 + NFR-Sc4 + AC-1/AC-3 + the 90-day threshold constant.
- **NEW file 2**: `src/runs/archive.test.ts` (~200-250 LoC) — 11 ARCH_68_* tests covering threshold, paired-files, idempotency, skip-archive-dir, no-dir, empty, age-override, scope-violation, best-effort, mtime-period.
- **NEW file 3**: `src/telemetry/rotate.ts` (~110-140 LoC) — exports `rotateOldTelemetry({telemetryRoot?, ageThresholdMs?, now?})`. JSDoc documents Story 6.8 + AR41 mid-tier + AR42 + NFR-Sc5 + AC-2/AC-3 + the 12-month threshold constant.
- **NEW file 4**: `src/telemetry/rotate.test.ts` (~180-220 LoC) — 10 ROTATE_68_* tests covering threshold, paired jsonl+md, foreign-file skip, idempotency, skip-archive-dir, no-dir, age-override, scope-violation, best-effort.
- **NEW file 5**: `src/startup/archival-trigger.ts` (~100-130 LoC) — exports `runArchivalAtStartup({config, oncePerSessionRef?, ...overrides})`. JSDoc documents Story 6.8 + the orchestrator role + the closure-private once-per-session pattern + AR21 audit-notice format + AR33 + AC-3/AC-4 + error isolation.
- **NEW file 6**: `src/startup/archival-trigger.test.ts` (~200-250 LoC) — 9 TRIGGER_68_* tests covering basic flow, telemetry-disabled gate, once-per-session, fresh-ref, audit format, suppression-when-zero, error isolation, non-blocking, fired-before-invoke.
- **NEW file 7**: `src/integration/auto-archival-startup.test.ts` (~120-150 LoC) — AC-1/AC-2/AC-3/AC-4 PRIMARY integration test. Sweeps all 4 ACs end-to-end with tmpdir-isolated fixture.
- **MODIFIED file 1**: `src/runs/index.ts` — barrel extension (~5-7 LoC added).
- **MODIFIED file 2**: `src/telemetry/index.ts` — barrel extension (~5-7 LoC added).
- **MODIFIED file 3**: `src/commands/next/run.ts` — wire archival trigger at Step 4 (~10 LoC added: import + try/void block).
- **MODIFIED file 4**: `src/commands/loop/run.ts` — wire archival trigger at loop setup (~10 LoC added: import + try/void block).
- **MODIFIED file 5**: `docs/configuration.md` — `## Auto-archival (Story 6.8 — DONE)` section + forward-tracker close (~80-100 LoC added).

7 NEW files. ZERO new error classes. ZERO new schema migrations. ZERO mutations to: `src/errors.ts`, `src/migrations/**` (registry data unchanged), `src/schemas/**` (no schema changes), `src/dag/**`, `src/state/**`, `src/dispatch/**` (Story 2.2 staging-cleanup unchanged), `src/failure-ux/**`, `src/verifiers/**`, `src/commands/next/verify-and-advance.ts` (lock-held tier unchanged), `src/commands/doctor/**`, `src/runs/write-step.ts` + `src/runs/build-run-log.ts` + `src/runs/render-markdown.ts` + `src/runs/watch.ts` (writers unchanged — Story 6.8 only ADDS archive.ts as a sibling), `src/telemetry/collect.ts` + `src/telemetry/aggregate.ts` + `src/telemetry/render-report.ts` + `src/telemetry/cli.ts` (telemetry pipeline unchanged — Story 6.8 only ADDS rotate.ts as a sibling), `commands/bmad-next.md`, `commands/bmad-loop.md` (slash-command markdown unchanged per OQ-13).

## Acceptance Criteria

The following are reproduced byte-identical from `_bmad-output/planning-artifacts/epics.md` lines 1269-1276:

**Given** `_bmad-output/.stepper/runs/` contains files older than 90 days
**When** Stepper starts (any command)
**Then** `src/transcript/archive.ts` moves matching files to `runs/.archive/<YYYY-MM>/` (per NFR-Sc4)
**Given** `telemetry/<period>.jsonl` and `<period>.md` are older than 12 months
**When** Stepper starts (and `telemetry.enabled` is true)
**Then** `src/telemetry/rotate.ts` moves them to `telemetry/.archive/` (per NFR-Sc5)
**And** archival is idempotent (running twice in a row is a no-op)
**And** archival never blocks the user's command — runs in the background with a one-line audit notice on first invocation per session

**Naming-drift note**: AC-1 references `src/transcript/archive.ts` per architecture's planning-time naming. The actual codebase has `src/runs/` (the architecture's planning name `transcript/` was implemented as `runs/` per Story 2.5 close — a documented variance from the architecture's pre-implementation directory listing line 1212-1217). Story 6.8 places the archival module at `src/runs/archive.ts` (the codebase truth), preserving AC-1 INTENT byte-equivalently. The dev iter SHOULD add a comment in `src/runs/archive.ts` JSDoc cross-referencing the architecture's `src/transcript/archive.ts` planning name + the actual `src/runs/archive.ts` codebase placement (closes the documentation drift forward-tracker).

## Tasks / Subtasks

- [x] 1. **Context — read all relevant files completely** (carry-over discipline from Stories 6.1 + 6.2 + 6.3 + 6.4 + 6.5 + 6.6 + 6.7)
  - [x] 1.1 Read `_bmad-output/implementation-artifacts/6-7-telemetry-aggregation-report.md` — focus on (a) the Forward Action Items section (4 inherited NITs N-1/N-2/N-3/N-4 + 48 inherited info I-1..I-48 cumulative minus 6 closed (I-26/I-27/I-38/I-41/I-46/I-47); Story 6.8 PRIMARY HONOURS I-28 (Story 6.8 cross-coordination forward) + I-48 (UTC discipline) at the period-boundary calculation); (b) the Story 6.7 SDR Quality Gates table baseline (1531/0/5001 across 75 files; errors registry 17); (c) the Story 6.7 close: aggregator + renderer + CLI standalone tool; (d) the OQ-3 invariant — aggregator reads only active dir, NOT `.archive/` (Story 6.8 PRESERVES this).
  - [x] 1.2 Read `_bmad-output/implementation-artifacts/6-6-telemetry-opt-in-collection.md` — focus on (a) the file format invariants (`<paths.telemetry>/<YYYY-MM>.jsonl`; UTC-locked ts; one TelemetryRecord per line); (b) the I-48 UTC discipline forward-tracker (PRIMARY HONOURED here at the rotate.ts threshold arithmetic); (c) the `DEFAULT_TELEMETRY_ROOT = "_bmad-output/.stepper/telemetry/"` constant Story 6.8 reuses.
  - [x] 1.3 Read `_bmad-output/implementation-artifacts/6-1-bmad-stepper-config-yaml-schema-loader.md` — focus on (a) the typed Config.paths.runs + paths.telemetry + telemetry.enabled fields; (b) the three-layer resolver (project / user / defaults).
  - [x] 1.4 Read `_bmad-output/implementation-artifacts/2-2-dispatch-spec-generator.md` — focus on the `cleanStagingOrphans({stagingRoot?, now?, ageThresholdMs?})` test-seam pattern Story 6.8 mirrors at `archiveOldRuns` and `rotateOldTelemetry`.
  - [x] 1.5 Read `_bmad-output/implementation-artifacts/2-5-markdown-transcript-json-run-log-writers.md` — focus on (a) the `<ts>-<step>.{log,json}` paired-files convention Story 6.8 archive.ts honours; (b) the writer's runs-dir structure under `<paths.runs>`.
  - [x] 1.6 Read `_bmad-output/implementation-artifacts/2-4-lock-free-run-ts-for-bmad-next.md` — focus on (a) the Step 4 staging-orphan-cleanup wiring pattern (`if (!args.dryRun) { try { ... } catch { ... } }`) Story 6.8 mirrors at the same site for archival; (b) the AR8 lock-free contract (archival runs OUTSIDE the verify-and-advance lock).
  - [x] 1.7 Read `_bmad-output/implementation-artifacts/4-9-sigint-graceful-exit.md` — focus on the closure-private flag pattern (`shutdownRequested`, `shutdownReceivedAt`) Story 6.8 mirrors at `oncePerSessionRef = { fired: false }`.
  - [x] 1.8 Read `_bmad-output/implementation-artifacts/epic-5-retrospective.md` + `epic-4-retrospective.md` — Recommendations on registry stability + cross-story coordination via opts.config seam.
  - [x] 1.9 Read `src/schemas/config.ts` — focus on (a) `PathsSchema` at lines 270-275 (`state`, `runs`, `staging`, `telemetry`); (b) `TelemetrySchema` at lines 286-288 (`enabled: boolean`); (c) `ConfigV1Schema` at lines 294-337 (top-level shape).
  - [x] 1.10 Read `src/config/defaults.ts` (52 lines) — confirm `paths.runs = "_bmad-output/.stepper/runs/"` and `paths.telemetry = "_bmad-output/.stepper/telemetry/"` and `telemetry.enabled = false`.
  - [x] 1.11 Read `src/io/paths.ts` (~97 lines) — locate (a) `STEPPER_INTERNAL_ROOT`, `BMAD_OUTPUT_ROOT`, `STAGING_PATH` constants; (b) `assertWithinScope` helper Story 6.8 calls at every destination path.
  - [x] 1.12 Read `src/io/log.ts` (30 lines) — confirm `info` / `warn` / `error` helpers (single-line discipline preserved per AR21).
  - [x] 1.13 Read `src/dispatch/staging-cleanup.ts` (140 lines) full pass — recover the listdir + stat + filter + per-entry try/catch + best-effort discipline pattern Story 6.8's archive.ts and rotate.ts BOTH mirror.
  - [x] 1.14 Read `src/dispatch/staging-cleanup.test.ts` — recover the test-fixture pattern (mkdtemp + stat-mtime injection + threshold tests + completion-marker preservation analog) Story 6.8's archive.test.ts and rotate.test.ts BOTH mirror.
  - [x] 1.15 Read `src/runs/index.ts` (26 lines) — confirm the existing barrel re-exports. Story 6.8 EXTENDS.
  - [x] 1.16 Read `src/runs/write-step.ts` (first 60 lines) — confirm the `<ts>-<step>.{log,json}` paired-files writer pattern. Story 6.8 archive.ts honours the pairing by basename grouping.
  - [x] 1.17 Read `src/telemetry/index.ts` (29 lines) — confirm the existing barrel re-exports. Story 6.8 EXTENDS.
  - [x] 1.18 Read `src/telemetry/collect.ts` (first 60 lines) — confirm `DEFAULT_TELEMETRY_ROOT` constant Story 6.8's rotate.ts reuses.
  - [x] 1.19 Read `src/commands/next/run.ts` lines 1569-1599 — locate the existing Step 4 staging-cleanup site Story 6.8 wires the archival trigger NEXT TO.
  - [x] 1.20 Read `src/commands/loop/run.ts` lines 877-902 — locate the loop setup-phase site Story 6.8 wires the archival trigger at (BEFORE the iteration loop starts; AFTER args resolution + config resolution).
  - [x] 1.21 Read `src/errors.ts` — confirm registry holds 17 codes; Story 6.8 ships ZERO new error classes; reuses `ScopeViolationError` (already exported from io/paths.ts via assertWithinScope throw).
  - [x] 1.22 Read `src/integration/escalate-actionable-hint.test.ts` — confirm 33-test sweep covers all 17 error classes. Story 6.8 verifies this test passes UNCHANGED.
  - [x] 1.23 Read `docs/configuration.md` lines 514-725 — locate the existing telemetry section + forward-tracker. Story 6.8 EXTENDS with a NEW top-level `## Auto-archival (Story 6.8 — DONE)` section and updates the forward-tracker close.
  - [x] 1.24 Read `_bmad-output/planning-artifacts/architecture.md` lines 340-368 — recover the `_bmad-output/.stepper/` directory layout including the `runs/.archive/<period>/` (line 349) and `telemetry/.archive/` (line 358) target subdirs. CONFIRM the architecture-vs-codebase naming drift (architecture says `src/transcript/`, codebase says `src/runs/`) — Story 6.8 places archive.ts at `src/runs/archive.ts` per codebase truth.

- [x] 2. **NEW `src/runs/archive.ts` module — `archiveOldRuns(opts)` function**
  - [x] 2.1 Create `src/runs/archive.ts`. Module JSDoc documents Story 6.8 + AR41 mid-tier (sibling of `write-step.ts`, `build-run-log.ts`) + AR42 schema-first (assertWithinScope on every dest) + AC-1/AC-3 verbatim + the 90-day threshold rationale + the architecture-vs-codebase naming drift (architecture line 1215 says `src/transcript/archive.ts`; codebase truth is `src/runs/archive.ts` per Story 2.5 close).
  - [x] 2.2 Imports (foundational + sibling-mid-tier only per AR41): `import * as fs from "node:fs/promises"`; `import * as path from "node:path"`; `import { assertWithinScope } from "../io/paths.ts"`; `import { warn } from "../io/log.ts"`. NO higher-tier or top-tier imports.
  - [x] 2.3 Define constants:
    ```ts
    /**
     * Default path for the runs/ directory root. Mirrors
     * `src/config/defaults.ts:46` (paths.runs default).
     */
    export const RUNS_DEFAULT_PATH = "_bmad-output/.stepper/runs/";

    /**
     * 90-day threshold per NFR-Sc4 + AC-1 verbatim.
     * Computed: 90 * 24 * 60 * 60 * 1000 = 7,776,000,000 ms.
     */
    export const RUNS_AGE_THRESHOLD_MS_90D = 90 * 24 * 60 * 60 * 1000;

    const ARCHIVE_SUBDIR = ".archive";
    ```
  - [x] 2.4 Define types:
    ```ts
    export interface ArchiveOldRunsOptions {
      /** Test seam: when supplied, overrides the runs directory root. */
      readonly runsRoot?: string;
      /** Test seam: when supplied, overrides the 90-day threshold (used by tests). */
      readonly ageThresholdMs?: number;
      /** Test seam: when supplied, overrides "now" for deterministic mtime comparisons. */
      readonly now?: Date;
    }
    export interface ArchiveOldRunsResult {
      readonly archivedCount: number;
      /** Absolute or project-relative paths of moved files (destination paths). */
      readonly archivedFiles: readonly string[];
    }
    ```
  - [x] 2.5 Implement `archiveOldRuns(opts: ArchiveOldRunsOptions = {}): Promise<ArchiveOldRunsResult>`:
    - Step 1: Resolve `runsRoot`, `ageThresholdMs`, `now` from opts with defaults.
    - Step 2: `try { await fs.access(runsRoot); } catch { return { archivedCount: 0, archivedFiles: [] }; }` (no-op when runsRoot does not exist — first-run idempotent).
    - Step 3: `const dirents = await fs.readdir(runsRoot, { withFileTypes: true });` (top-level enumeration only).
    - Step 4: Initialize `const archivedFiles: string[] = [];`.
    - Step 5: For each dirent in dirents:
      - SKIP if `dirent.name === ARCHIVE_SUBDIR` (idempotency hard-gate at the entry-loop level).
      - SKIP if NOT `dirent.isFile()` (subdirs are forward-deferred).
      - `const srcPath = path.join(runsRoot, dirent.name);`
      - try block:
        - `const stat = await fs.stat(srcPath);`
        - SKIP if `now.getTime() - stat.mtimeMs <= ageThresholdMs`.
        - `const periodYearMonth = stat.mtime.toISOString().slice(0, 7);` (UTC-locked YYYY-MM).
        - `const destDir = path.join(runsRoot, ARCHIVE_SUBDIR, periodYearMonth);`
        - `const destPath = path.join(destDir, dirent.name);`
        - `assertWithinScope(destPath);` per AR42 + NFR-S2.
        - `await fs.mkdir(destDir, { recursive: true });` (idempotent).
        - try `await fs.rename(srcPath, destPath);`
        - catch EXDEV: `await fs.copyFile(srcPath, destPath); await fs.unlink(srcPath);` (cross-FS fallback per OQ-5).
        - `archivedFiles.push(destPath);`
      - catch (per-entry try/catch): `warn("runs: archive failed for " + dirent.name + ": " + err.message);` (best-effort; loop continues).
    - Step 6: Return `{ archivedCount: archivedFiles.length, archivedFiles };`.
  - [x] 2.6 Add JSDoc on `archiveOldRuns` documenting AC-1 + AC-3 + AR42 + NFR-Sc4 + the test-seam options + the per-entry best-effort discipline.

- [x] 3. **NEW `src/runs/archive.test.ts` test file — `archiveOldRuns` coverage**
  - [x] 3.1 Create `src/runs/archive.test.ts`. Imports: bun-test (`describe`, `expect`, `it`, `beforeEach`, `afterEach`, `spyOn`); `node:fs/promises` for tmpdir + writeFile + utimes; `node:os` + `node:path`; `import { archiveOldRuns, RUNS_AGE_THRESHOLD_MS_90D } from "./archive.ts"`.
  - [x] 3.2 Helpers: `async function withTempDir(): Promise<string>` per AR35 (mkdtemp + return); `async function writeFileWithMtime(filePath: string, content: string, mtime: Date): Promise<void>` (writeFile + utimes to set mtime).
  - [x] 3.3 ARCH_68_BASIC_1: tmpdir runs/ with 3 old files (mtime = now - 100 * 24*3600*1000) + 2 new files (mtime = now - 30 * 24*3600*1000) → assert 3 moved, 2 stay.
  - [x] 3.4 ARCH_68_PAIRED_1: `2026-01-15T10-00-00-bmad-create-story.log` + `.json` paired with same mtime → both moved.
  - [x] 3.5 ARCH_68_THRESHOLD_1: file with mtime exactly `now - 90d` → NOT moved (strict `>`).
  - [x] 3.6 ARCH_68_IDEMPOTENT_1: archive twice → second call archivedCount === 0.
  - [x] 3.7 ARCH_68_SKIP_ARCHIVE_DIR_1: pre-existing `.archive/2025-12/<basename>` not re-archived.
  - [x] 3.8 ARCH_68_NO_DIR_1: runsRoot does not exist → `{archivedCount: 0, archivedFiles: []}`.
  - [x] 3.9 ARCH_68_EMPTY_1: empty runsRoot → `{archivedCount: 0, archivedFiles: []}`.
  - [x] 3.10 ARCH_68_AGE_OVERRIDE_1: `ageThresholdMs: 1000` + file mtime = now - 5s → moved.
  - [x] 3.11 ARCH_68_OUT_OF_SCOPE_1: `runsRoot: "/etc"` (with a forced fixture entry) → ScopeViolationError thrown when destPath fails assertWithinScope.
  - [x] 3.12 ARCH_68_BEST_EFFORT_1: pre-place a destination file conflicting with archive target → first move fails (rename onto existing — Bun/Node behaviour: rename overwrites on POSIX, so this test uses a permission-denied surrogate or chmod the dir read-only) → assert OTHER files still archive + warn() emitted (use `spyOn(log, "warn")`).
  - [x] 3.13 ARCH_68_DESTINATION_PERIOD_FROM_MTIME_1: file with mtime = `2025-12-15T10:00:00Z` → destPath contains `.archive/2025-12/` (UTC-locked).
  - [x] 3.14 Run `bun test src/runs/archive.test.ts` — confirm all tests pass.

- [x] 4. **NEW `src/telemetry/rotate.ts` module — `rotateOldTelemetry(opts)` function**
  - [x] 4.1 Create `src/telemetry/rotate.ts`. Module JSDoc documents Story 6.8 + AR41 mid-tier (sibling of `collect.ts`, `aggregate.ts`) + AR42 + AC-2/AC-3 + 12-month threshold + the FLAT `.archive/` layout (NO per-period subdir, per architecture line 358 + OQ-8).
  - [x] 4.2 Imports: `import * as fs from "node:fs/promises"`; `import * as path from "node:path"`; `import { assertWithinScope } from "../io/paths.ts"`; `import { warn } from "../io/log.ts"`; `import { DEFAULT_TELEMETRY_ROOT } from "./collect.ts"` (sibling within mid-tier — reuse the constant).
  - [x] 4.3 Define constants:
    ```ts
    /**
     * 12-month threshold per NFR-Sc5 + AC-2 verbatim.
     * Computed: 12 * 30 * 24 * 60 * 60 * 1000 = 31,104,000,000 ms.
     * ~5-day slack vs calendar-month subtraction is acceptable per OQ-6.
     */
    export const TELEMETRY_AGE_THRESHOLD_MS_12M = 12 * 30 * 24 * 60 * 60 * 1000;

    const ARCHIVE_SUBDIR = ".archive";

    /** Canonical `<period>.{jsonl,md}` filename pattern. */
    const TELEMETRY_FILE_PATTERN = /^\d{4}-\d{2}\.(jsonl|md)$/;
    ```
  - [x] 4.4 Define types:
    ```ts
    export interface RotateOldTelemetryOptions {
      readonly telemetryRoot?: string;
      readonly ageThresholdMs?: number;
      readonly now?: Date;
    }
    export interface RotateOldTelemetryResult {
      readonly rotatedCount: number;
      readonly rotatedFiles: readonly string[];
    }
    ```
  - [x] 4.5 Implement `rotateOldTelemetry(opts: RotateOldTelemetryOptions = {}): Promise<RotateOldTelemetryResult>`:
    - Step 1: Resolve `telemetryRoot`, `ageThresholdMs`, `now`.
    - Step 2: `try { await fs.access(telemetryRoot); } catch { return { rotatedCount: 0, rotatedFiles: [] }; }` (no-op).
    - Step 3: `const dirents = await fs.readdir(telemetryRoot, { withFileTypes: true });`
    - Step 4: Initialize `const rotatedFiles: string[] = [];`
    - Step 5: For each dirent:
      - SKIP if `dirent.name === ARCHIVE_SUBDIR`.
      - SKIP if NOT `dirent.isFile()`.
      - SKIP if `!TELEMETRY_FILE_PATTERN.test(dirent.name)` (foreign-file gate per OQ-7).
      - try block:
        - `const stat = await fs.stat(srcPath);`
        - SKIP if mtime within threshold.
        - `const destPath = path.join(telemetryRoot, ARCHIVE_SUBDIR, dirent.name);` (FLAT — NO period subdir).
        - `assertWithinScope(destPath);`
        - `await fs.mkdir(path.dirname(destPath), { recursive: true });`
        - `await fs.rename(srcPath, destPath);` (with EXDEV fallback per OQ-5).
        - `rotatedFiles.push(destPath);`
      - catch: `warn("telemetry: rotate failed for " + dirent.name + ": " + err.message);`
    - Step 6: Return `{ rotatedCount: rotatedFiles.length, rotatedFiles };`.
  - [x] 4.6 Add JSDoc.

- [x] 5. **NEW `src/telemetry/rotate.test.ts` test file — `rotateOldTelemetry` coverage**
  - [x] 5.1 Create `src/telemetry/rotate.test.ts`. Imports per Task 3.1 pattern.
  - [x] 5.2 Helpers: `withTempDir`, `writeFileWithMtime` (or import shared helper if extracted).
  - [x] 5.3 ROTATE_68_BASIC_1: old `2024-04.jsonl` + old `2024-04.md` + new `2026-04.jsonl` → assert 2 rotated, new file stays.
  - [x] 5.4 ROTATE_68_PAIRED_1: same period jsonl + md both old → both rotated.
  - [x] 5.5 ROTATE_68_FOREIGN_FILE_SKIP_1: `notes.txt` with old mtime → NOT rotated.
  - [x] 5.6 ROTATE_68_THRESHOLD_1: file with mtime exactly `now - 12m` → NOT rotated.
  - [x] 5.7 ROTATE_68_IDEMPOTENT_1: rotate twice → second rotatedCount === 0.
  - [x] 5.8 ROTATE_68_SKIP_ARCHIVE_DIR_1: pre-existing `.archive/2024-04.jsonl` not re-rotated.
  - [x] 5.9 ROTATE_68_NO_DIR_1: telemetryRoot does not exist → no-op.
  - [x] 5.10 ROTATE_68_AGE_OVERRIDE_1: `ageThresholdMs: 1000` → moved.
  - [x] 5.11 ROTATE_68_OUT_OF_SCOPE_1: `telemetryRoot: "/etc"` → ScopeViolationError.
  - [x] 5.12 ROTATE_68_BEST_EFFORT_1: simulate per-file failure → loop continues + warn().
  - [x] 5.13 Run `bun test src/telemetry/rotate.test.ts` — confirm all tests pass.

- [x] 6. **NEW `src/startup/archival-trigger.ts` orchestrator + once-per-session marker**
  - [x] 6.1 Create directory `src/startup/`. Create `src/startup/archival-trigger.ts`. Module JSDoc documents Story 6.8 + AR41 NEW mid-tier directory rationale + the orchestrator role + AC-3/AC-4 + AR21/AR33.
  - [x] 6.2 Imports: `import { archiveOldRuns, RUNS_AGE_THRESHOLD_MS_90D } from "../runs/archive.ts"`; `import { rotateOldTelemetry, TELEMETRY_AGE_THRESHOLD_MS_12M } from "../telemetry/rotate.ts"`; `import { info, warn } from "../io/log.ts"`; `import type { Config } from "../schemas/config.ts"`. NO higher-tier or top-tier imports.
  - [x] 6.3 Define types:
    ```ts
    export interface OncePerSessionRef {
      fired: boolean;
    }
    export interface RunArchivalAtStartupOptions {
      readonly config: Pick<Config, "paths" | "telemetry">;
      readonly oncePerSessionRef?: OncePerSessionRef;
      readonly runsRootOverride?: string;
      readonly telemetryRootOverride?: string;
      readonly ageThresholdRunsMs?: number;
      readonly ageThresholdTelemetryMs?: number;
    }
    export interface RunArchivalAtStartupResult {
      readonly archivedRuns: number;
      readonly rotatedTelemetry: number;
      readonly alreadyFired: boolean;
    }
    ```
  - [x] 6.4 Define module-level singleton: `const DEFAULT_ONCE_PER_SESSION_REF: OncePerSessionRef = { fired: false };` (mutable; closure-private to the module).
  - [x] 6.5 Implement `runArchivalAtStartup(opts: RunArchivalAtStartupOptions): Promise<RunArchivalAtStartupResult>`:
    - Step 1: `const ref = opts.oncePerSessionRef ?? DEFAULT_ONCE_PER_SESSION_REF;`
    - Step 2: If `ref.fired === true` → return `{ archivedRuns: 0, rotatedTelemetry: 0, alreadyFired: true };`
    - Step 3: Set `ref.fired = true;` (BEFORE calls — per OQ-3 idempotency layered defence).
    - Step 4: `let archivedRuns = 0;` try `archivedRuns = (await archiveOldRuns({ runsRoot: opts.runsRootOverride ?? opts.config.paths.runs, ageThresholdMs: opts.ageThresholdRunsMs })).archivedCount;` catch `(err)` → `warn("archival: runs archival failed (non-fatal): " + (err instanceof Error ? err.message : String(err)));`
    - Step 5: `let rotatedTelemetry = 0;` if `opts.config.telemetry.enabled === true` → try `rotatedTelemetry = (await rotateOldTelemetry({ telemetryRoot: opts.telemetryRootOverride ?? opts.config.paths.telemetry, ageThresholdMs: opts.ageThresholdTelemetryMs })).rotatedCount;` catch `(err)` → `warn(...);`
    - Step 6: If `archivedRuns + rotatedTelemetry > 0` → `info("archival: archived " + archivedRuns + " runs older than 90 days, " + rotatedTelemetry + " telemetry files older than 12 months");` (single-line per AR21).
    - Step 7: Return `{ archivedRuns, rotatedTelemetry, alreadyFired: false };`
  - [x] 6.6 JSDoc documents AC-3 (idempotency via once-per-session), AC-4 (non-blocking — caller fires-and-forgets), AR21 (single-line audit notice), error isolation between runs and telemetry, the closure-private session pattern.

- [x] 7. **NEW `src/startup/archival-trigger.test.ts` orchestrator coverage**
  - [x] 7.1 Create `src/startup/archival-trigger.test.ts`. Imports: bun-test (`describe`, `expect`, `it`, `beforeEach`, `afterEach`, `spyOn`); fs-helpers; `import { runArchivalAtStartup, type OncePerSessionRef } from "./archival-trigger.ts"`; `import * as log from "../io/log.ts"`.
  - [x] 7.2 Helpers: `function makeFreshRef(): OncePerSessionRef { return { fired: false }; }`; `function makeSyntheticConfig(opts: {runsRoot, telemetryRoot, telemetryEnabled}): Pick<Config, "paths" | "telemetry">` (mirrors Story 6.7 cli.test.ts test-seam pattern).
  - [x] 7.3 TRIGGER_68_BASIC_1: synthetic config + tmpdir-old fixtures (3 runs old + 1 telemetry old + telemetry.enabled true) → call once → `{archivedRuns: 3, rotatedTelemetry: 1, alreadyFired: false}`.
  - [x] 7.4 TRIGGER_68_TELEMETRY_DISABLED_1: `config.telemetry.enabled = false` + old telemetry file → `rotatedTelemetry === 0`; file stays.
  - [x] 7.5 TRIGGER_68_ONCE_PER_SESSION_1: invoke twice with same ref → first call N runs archived; second call `{archivedRuns: 0, alreadyFired: true}`.
  - [x] 7.6 TRIGGER_68_FRESH_REF_1: invoke twice with DIFFERENT refs → both fire; second finds nothing left.
  - [x] 7.7 TRIGGER_68_AUDIT_NOTICE_FORMAT_1: spyOn(log, "info") → verify single call with regex match.
  - [x] 7.8 TRIGGER_68_NO_AUDIT_WHEN_ZERO_1: fresh project (nothing to archive) → assert info() NOT called.
  - [x] 7.9 TRIGGER_68_ERROR_ISOLATION_1: monkey-patch archiveOldRuns to throw → assert rotateOldTelemetry STILL runs; warn() called for runs error.
  - [x] 7.10 TRIGGER_68_NON_BLOCKING_1: assert returned value is a Promise; caller can `void` it.
  - [x] 7.11 TRIGGER_68_FIRED_BEFORE_INVOKE_1: monkey-patch archiveOldRuns to read `ref.fired` mid-call → assert `fired === true` already.
  - [x] 7.12 Run `bun test src/startup/archival-trigger.test.ts` — confirm all tests pass.

- [x] 8. **NEW `src/integration/auto-archival-startup.test.ts` integration test (AC-1/AC-2/AC-3/AC-4 PRIMARY)**
  - [x] 8.1 Create `src/integration/auto-archival-startup.test.ts`. Imports: bun-test; fs-helpers; `import { runArchivalAtStartup } from "../startup/archival-trigger.ts"`.
  - [x] 8.2 Test setup: tmpdir + write fixture `runs/` (3 old + 2 new files; some paired .log+.json) + `telemetry/` (old `2024-04.jsonl` + old `2024-04.md` + new `2026-04.jsonl`) + synthetic Config.
  - [x] 8.3 Test body: invoke `runArchivalAtStartup({config, oncePerSessionRef: {fired:false}})`. Assert AC-1 (old runs moved to `<runsRoot>/.archive/<YYYY-MM>/`; new runs stay), AC-2 (old telemetry moved to `<telemetryRoot>/.archive/`; new stays), AC-3 (second invocation within same ref → no fs mutation; snapshot before+after), AC-4 (info() audit notice emitted; promise resolves).
  - [x] 8.4 Cross-link comments per AC + NFR map.
  - [x] 8.5 Run `bun test src/integration/auto-archival-startup.test.ts` — confirm all tests pass.

- [x] 9. **MODIFIED `src/runs/index.ts` barrel — extend re-exports**
  - [x] 9.1 Append:
    ```ts
    export {
      archiveOldRuns,
      type ArchiveOldRunsOptions,
      type ArchiveOldRunsResult,
      RUNS_AGE_THRESHOLD_MS_90D,
      RUNS_DEFAULT_PATH,
    } from "./archive.ts";
    ```
  - [x] 9.2 Run `bunx tsc --noEmit` — verify the barrel compiles.

- [x] 10. **MODIFIED `src/telemetry/index.ts` barrel — extend re-exports**
  - [x] 10.1 Append:
    ```ts
    export {
      rotateOldTelemetry,
      type RotateOldTelemetryOptions,
      type RotateOldTelemetryResult,
      TELEMETRY_AGE_THRESHOLD_MS_12M,
    } from "./rotate.ts";
    ```
  - [x] 10.2 Run `bunx tsc --noEmit`.

- [x] 11. **MODIFIED `src/commands/next/run.ts` — wire archival trigger at Step 4**
  - [x] 11.1 Add import: `import { runArchivalAtStartup } from "../../startup/archival-trigger.ts";` at the imports block.
  - [x] 11.2 At ~line 1583 (just AFTER the `cleanStagingOrphans` block, BEFORE the `// Step 5: --doctor delegation`), add:
    ```ts
    // Step 4b (Story 6.8): auto-archival of old runs + telemetry. Best-
    // effort + non-blocking + dry-run gate (mirrors staging-cleanup).
    if (!args.dryRun && opts?.config !== undefined) {
      void runArchivalAtStartup({ config: opts.config }).catch((err) => {
        log.info(
          `archival: trigger failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }
    ```
  - [x] 11.3 Verify `bunx tsc --noEmit` passes.
  - [x] 11.4 Run `bun test src/commands/next/run.test.ts` — confirm existing tests still pass (no regressions).

- [x] 12. **MODIFIED `src/commands/loop/run.ts` — wire archival trigger at loop setup**
  - [x] 12.1 Add import: `import { runArchivalAtStartup } from "../../startup/archival-trigger.ts";` at the imports block.
  - [x] 12.2 At loop setup phase (after args resolution + config resolution; ~line 880 just AFTER the SIGINT setup-phase check #1), add:
    ```ts
    // Story 6.8: auto-archival of old runs + telemetry at startup. Best-
    // effort + non-blocking. Plan-first gate analogous to next/run.ts dry-
    // run gate (plan-mode is read-only; archival WOULD mutate inventory).
    if (!args.planFirst && effectiveConfig !== undefined) {
      void runArchivalAtStartup({ config: effectiveConfig }).catch((err) => {
        warn(
          `archival: trigger failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }
    ```
  - [x] 12.3 Verify `bunx tsc --noEmit` passes.
  - [x] 12.4 Run `bun test src/commands/loop/run.test.ts` — confirm existing tests still pass.

- [x] 13. **MODIFIED `docs/configuration.md` — Auto-archival section + forward-tracker close**
  - [x] 13.1 After the `## Forward-tracker — Stories 6.3-6.8` section (line 712 area), insert a NEW top-level `## Auto-archival (Story 6.8 — DONE)` section. Document the two paths + startup trigger + non-blocking + idempotency + telemetry.enabled gate + audit notice + cross-links.
  - [x] 13.2 Update the forward-tracker close: change "Story 6.8 — telemetry rotation: files older than 12 months are moved to `<paths.telemetry>/.archive/` on Stepper start." to the DONE form per Item 12 of "What is in scope".
  - [x] 13.3 Cross-links: architecture line 1413 (NFR-Sc4 → src/runs/archive.ts), architecture line 1414 (NFR-Sc5 → src/telemetry/rotate.ts), architecture lines 349 + 358 (`.archive/` directory layout).

- [x] 14. **Quality gates + sprint-status + state.yaml + evidenceIndex**
  - [x] 14.1 Run `bunx tsc --noEmit` — exit 0 expected.
  - [x] 14.2 Run `bun run check` — full test suite + biome ci. Expected baseline: 1531/0/5001 across 75 files (Story 6.7 close) → expected delta: +30-40 tests / +60-100 expects / +7 NEW files (archive.ts + archive.test.ts + rotate.ts + rotate.test.ts + archival-trigger.ts + archival-trigger.test.ts + integration/auto-archival-startup.test.ts) + 4 modified (2 barrels + 2 runner-tier wiring + docs). Final baseline ~1565-1575 / 0 / ~5070-5100 across 82 files.
  - [x] 14.3 Run `grep -c "extends StepperError" src/errors.ts` → expect `17` UNCHANGED.
  - [x] 14.4 Run `bun test src/integration/escalate-actionable-hint.test.ts` → expect 33/0/114 UNCHANGED.
  - [x] 14.5 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: change `6-8-auto-archival-of-runs-and-telemetry: backlog` to `6-8-auto-archival-of-runs-and-telemetry: ready-for-dev`. Bump `last_updated:` to current ISO timestamp.
  - [x] 14.6 Update `.bmad-stepper/state.yaml`: bump `workflow.lastStep` to `bmad-create-story`; `workflow.lastStepCompletedAt` to current ISO; `workflow.nextStep` to `bmad-dev-story`; `workflow.nextStepStory` and `nextStepKey` UNCHANGED at `6.8` / `6-8-auto-archival-of-runs-and-telemetry`. Append a new entry to `evidenceIndex` (step: bmad-create-story, path: `_bmad-output/implementation-artifacts/6-8-auto-archival-of-runs-and-telemetry.md`, evidence: short summary, runId: `2026-05-05T125621Z-bmad-next`, loopId: `2026-05-05T080939Z-bmad-loop`, epic: `6`, story: `6.8`).
  - [x] 14.7 Confirm sprint-status sets epic-6 = `in-progress` (already in-progress at line 102 — no change needed).
  - [x] 14.8 NO src/ mutations during the create-story phase — those are dev-story iter work.

## Dev Notes

### Relevant architecture patterns and constraints

- **AR41 mid-tier boundary** — `src/runs/archive.ts` and `src/telemetry/rotate.ts` are sibling mid-tier files (architecture lines 1281-1283). `src/startup/archival-trigger.ts` is a NEW mid-tier directory; the orchestrator imports from `runs/`, `telemetry/`, `io/`, `schemas/` only. ZERO higher-tier or top-tier imports.
- **AR42 schema-first** — every destination path passes through `assertWithinScope(...)` before the move. ZERO new schemas.
- **AR21+22 single-line discipline** — the orchestrator emits ONE single-line `info()` audit notice per session (when work was done); per-entry failures use single-line `warn()`. ZERO multi-line output.
- **AR33 async fs writes; never console.*** — archive modules + orchestrator use `fs.rename`, `fs.mkdir`, `fs.stat`, `fs.readdir` (all from `node:fs/promises`). Logging via `info`/`warn` from `src/io/log.ts`.
- **AR8 lock-free top-tier** — archival runs OUTSIDE the verify-and-advance lock; the orchestrator never touches `state.yaml` or `state.yaml.lock/`. The runner-tier wiring at next/run.ts and loop/run.ts is at the lock-free Step 4 site (next) or loop setup (loop) — both BEFORE any state.yaml interaction.
- **AR9 stdout JSON-line invariant** — preserved. Archival writes to FILES (rename), NOT stdout. The CLI runner emits exactly one `log.info` line on stderr per FR54 + NFR-S1.
- **AR17 security** — archival NEVER reads file CONTENT. Only filenames + mtime. The `.archive/` subdirs preserve content unchanged. ZERO PII-surface widening.
- **AR27 telemetry schema invariants** — preserved through rotation. The JSONL files are MOVED unchanged; the schema is not re-validated.
- **AR35 tmpdir-per-test discipline** — every test in archive.test.ts + rotate.test.ts + archival-trigger.test.ts + integration test seeds a tmpdir.
- **NFR-Sc4 + NFR-Sc5** — primary deliverables (architecture lines 1413-1414).
- **NFR-S2 writes scoped** — every write target passes through `assertWithinScope(...)` (the destination subdir under `<runsRoot>/.archive/<YYYY-MM>/` and `<telemetryRoot>/.archive/`).

### Source tree components to touch

NEW (7):
- `src/runs/archive.ts` (Task 2)
- `src/runs/archive.test.ts` (Task 3)
- `src/telemetry/rotate.ts` (Task 4)
- `src/telemetry/rotate.test.ts` (Task 5)
- `src/startup/archival-trigger.ts` (Task 6)
- `src/startup/archival-trigger.test.ts` (Task 7)
- `src/integration/auto-archival-startup.test.ts` (Task 8)

MODIFIED (5):
- `src/runs/index.ts` (Task 9 — barrel extension)
- `src/telemetry/index.ts` (Task 10 — barrel extension)
- `src/commands/next/run.ts` (Task 11 — Step 4b archival trigger wiring)
- `src/commands/loop/run.ts` (Task 12 — loop setup archival trigger wiring)
- `docs/configuration.md` (Task 13 — Auto-archival section + forward-tracker close)

UNCHANGED (verified — no mutation): `src/errors.ts`, `src/schemas/**` (no schema changes), `src/migrations/**`, `src/dispatch/staging-cleanup.ts`, `src/runs/write-step.ts` + `src/runs/build-run-log.ts` + `src/runs/render-markdown.ts` + `src/runs/watch.ts`, `src/telemetry/collect.ts` + `src/telemetry/aggregate.ts` + `src/telemetry/render-report.ts` + `src/telemetry/cli.ts`, `src/commands/next/verify-and-advance.ts`, `src/commands/doctor/**`, `commands/bmad-next.md`, `commands/bmad-loop.md`.

### Testing standards summary

- **Colocated unit tests** — every NEW production file has a colocated `.test.ts` neighbour.
- **Cross-module integration test** — `src/integration/auto-archival-startup.test.ts` is the AC-1/2/3/4 PRIMARY mechanism (mirrors the `aggregate-telemetry-no-pii.test.ts` precedent).
- **Test ID prefix discipline** — ARCH_68_* for archive; ROTATE_68_* for rotate; TRIGGER_68_* for orchestrator; integration test cross-references AC-1/2/3/4.
- **AR35 tmpdir-per-test** — every fs-touching test uses `mkdtemp(path.join(os.tmpdir(), "stepper-archive-"))` + cleanup in afterEach.
- **Best-effort + per-entry try/catch** — every archive module test includes a "best-effort" case asserting one failure does NOT halt the loop (mirrors Story 2.2 staging-cleanup precedent).
- **Once-per-session marker** — TRIGGER_68_ONCE_PER_SESSION_1 + TRIGGER_68_FRESH_REF_1 cover both within-session and across-session idempotency.
- **Non-blocking semantics** — TRIGGER_68_NON_BLOCKING_1 + integration test snapshot before+after assertion cover AC-4 verbatim.

### Project Structure Notes

- **Alignment with unified project structure**: Story 6.8 places `archive.ts` in `src/runs/` (codebase truth) and `rotate.ts` in `src/telemetry/` (architecture line 1209 verbatim). The architecture's planning-time naming `src/transcript/` was implemented as `src/runs/` (Story 2.5 close — documented variance from architecture line 1212). Story 6.8 acknowledges and preserves this variance: AC-1 mentions `src/transcript/archive.ts` per architecture canon; the codebase places it at `src/runs/archive.ts`. The dev iter SHOULD add a JSDoc cross-reference.
- **NEW directory `src/startup/`**: Story 6.8 introduces this directory for the orchestrator. It is mid-tier per AR41 (sibling of `src/runs/`, `src/telemetry/`, `src/state/`, etc.). Future stories may add other startup hooks (e.g., orphan migration, version compatibility checks). The new directory is justified per OQ-11 — the orchestrator does NOT belong in either `src/runs/` or `src/telemetry/` (both are unaware of the cross-coupling); a new directory keeps the AR41 boundary clean.
- **Detected variances**: NONE substantive beyond the documented `src/transcript/` ↔ `src/runs/` naming drift (Story 2.5 close).
- **Path scope**: every move target (under `<runsRoot>/.archive/<YYYY-MM>/` or `<telemetryRoot>/.archive/`) is within `_bmad-output/.stepper/` per the `paths.runs` + `paths.telemetry` defaults; `assertWithinScope` re-checks at runtime.

### Forward-trackers honoured here

- **Story 6.7 SDR I-28 Story 6.8 cross-coordination** PRIMARY HONOURED — Story 6.8 implements both runs archival and telemetry rotation; the aggregator's active-dir scope is preserved (Story 6.7 OQ-3 invariant).
- **Story 6.6 + 6.7 SDR I-48 (UTC discipline)** PRIMARY HONOURED — at archive.ts mtime → `<YYYY-MM>` derivation; rotate.ts threshold arithmetic uses UTC ms-subtraction. The discipline is now transitively closed across Stories 6.6 + 6.7 + 6.8 (collector → aggregator → archiver).
- **Story 6.4 SDR I-43 (5+ sites accumulated)** UNCHANGED at 6 sites — Story 6.8 does NOT add a new opts.config seam site (it uses the EXISTING runner-tier seam at next/run.ts and loop/run.ts).
- **Story 2.2 staging-cleanup precedent** — followed verbatim at archive.ts and rotate.ts (best-effort discipline, listdir + stat + filter + per-entry try/catch).

### References

- [Source: `_bmad-output/planning-artifacts/epics.md`#Story-6.8, lines 1261-1276]
- [Source: `_bmad-output/planning-artifacts/architecture.md`#D7-D8 layout, lines 340-368 (.archive/ subdirs)]
- [Source: `_bmad-output/planning-artifacts/architecture.md`#NFR-Mapping, lines 1413-1414 (NFR-Sc4 + NFR-Sc5)]
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Module-Boundaries, lines 1205-1217 (src/runs/ + src/telemetry/ tier; planning vs codebase naming)]
- [Source: `_bmad-output/planning-artifacts/prd.md`#NFR-Sc4, NFR-Sc5 (90-day + 12-month auto-archival)]
- [Source: `_bmad-output/implementation-artifacts/6-7-telemetry-aggregation-report.md`#Forward-Action-Items (I-28 + I-48 forward; aggregator OQ-3 invariant)]
- [Source: `_bmad-output/implementation-artifacts/6-6-telemetry-opt-in-collection.md`#Forward-Action-Items (I-48 UTC discipline)]
- [Source: `src/dispatch/staging-cleanup.ts:71-140` — `cleanStagingOrphans` precedent Story 6.8 mirrors]
- [Source: `src/io/paths.ts:76-96` — `assertWithinScope` helper Story 6.8 calls at every dest]
- [Source: `src/config/defaults.ts:46,48` — `paths.runs` + `paths.telemetry` default values]
- [Source: `src/schemas/config.ts:270-275,286-288` — `PathsSchema` + `TelemetrySchema`]
- [Source: `src/commands/next/run.ts:1569-1599` — Step 4 staging-cleanup site Story 6.8 wires Step 4b NEXT TO]
- [Source: `src/commands/loop/run.ts:877-902` — loop setup phase site Story 6.8 wires the trigger at]
- [Source: `docs/configuration.md`#Forward-tracker, lines 664-712 — Story 6.8 close]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m] (Opus 4.7, 1M context).

### Debug Log References

- Repair iter 1: `fs.access(...).resolves.toBeUndefined()` failed across
  all 4 new test files because Bun's `node:fs/promises` `fs.access`
  resolves to `null` (not `undefined`). Fixed via global swap to
  `.resolves.toBeNull()` matching the codebase's existing pattern in
  `src/dispatch/staging-cleanup.test.ts`. 0 production-code repairs.
- Biome autofix applied formatting normalisation across 9 files (longer
  lines collapsed; barrel-export ordering re-sorted). One residual
  unused-variable error required a manual cleanup: removed an unused
  `now` const in `archival-trigger.test.ts:80` (the BASIC test does not
  need an injected `now` because the fixture mtimes are far enough in
  the past).

### Completion Notes List

- AC-1 (epics.md line 1271) verified: `archiveOldRuns` moves runs >
  90d to `<runsRoot>/.archive/<YYYY-MM>/<basename>` with UTC-locked
  mtime period derivation (per OQ-4). Paired `.log` + `.json` files
  move together via mtime parity. Per-entry best-effort discipline
  preserved per Story 2.2 precedent.
- AC-2 (epics.md line 1274) verified: `rotateOldTelemetry` moves
  `<period>.{jsonl,md}` files > 12m to `<telemetryRoot>/.archive/`
  (FLAT layout per OQ-8 + architecture line 358). Foreign-file regex
  gate per OQ-7 leaves non-canonical files alone. `telemetry.enabled`
  gate at the orchestrator per AC-2 verbatim.
- AC-3 (epics.md line 1275) verified: idempotency triple-layer defence
  per OQ-3: (1) `oncePerSessionRef` short-circuits within a single
  session; (2) the threshold filter on mtime naturally re-skips
  already-moved files; (3) `.archive/` is hard-skipped at the entry-
  loop level. Within-session, second call returns `alreadyFired:true`
  with zero fs mutation (snapshot-before-after asserted in integration
  test). Across-session (fresh ref), the second call finds nothing
  left to move.
- AC-4 (epics.md line 1276) verified: archival is fire-and-forget at
  both `next/run.ts` Step 4b and `loop/run.ts` loop setup. The runner-
  tier callers do `void runArchivalAtStartup({config}).catch(...)` so
  the user's command does NOT block on the archival promise. Single-
  line `info()` audit notice on stderr per AR21; suppressed when zero
  work was done per OQ-14.
- 14 OQs all HONOURED: archive vs delete (OQ-1; rename per AC verbatim);
  non-blocking fire-and-forget (OQ-2 + AC-4); once-per-session triple-
  layer idempotency (OQ-3 + AC-3); UTC-locked period derivation (OQ-4);
  EXDEV cross-FS copy-fallback (OQ-5); ms-arithmetic threshold (OQ-6);
  foreign-file regex skip (OQ-7); flat telemetry archive vs per-period
  runs subdir (OQ-8); error isolation between archives (OQ-9 — each
  wrapped in independent try/catch); dry-run + plan-first gates (OQ-10
  — mirrors staging-cleanup gate); NEW src/startup/ MID-TIER directory
  per AR41 (OQ-11); `opts.config?.paths !== undefined &&
  opts.config.telemetry !== undefined` check at runner-tier wiring
  (OQ-12); slash-command markdown UNCHANGED (OQ-13); audit notice
  suppression when zero work (OQ-14).
- Story 6.7 SDR forward-trackers I-28 (Story 6.8 cross-coordination)
  PRIMARY HONOURED here; I-48 (UTC discipline) PRIMARY HONOURED at
  archive.ts mtime → `<YYYY-MM>` derivation + rotate.ts threshold
  arithmetic — closed transitively across Stories 6.6 + 6.7 + 6.8
  lifecycle.
- Errors registry HELD AT 17 (verified independently via
  `grep -c "extends StepperError" src/errors.ts`). ZERO new error
  classes shipped; per-entry failures use `warn()` with bare Error
  message strings; `assertWithinScope` reuses the EXISTING
  `ScopeViolationError` (Story 1.5). The 33-test
  `escalate-actionable-hint.test.ts` sweep UNCHANGED at 33/0/114.
- `commands/bmad-{next,loop}.md` slash-command markdown UNCHANGED per
  OQ-13 — no slash-command surface mutation.
- Naming-drift note per AC-1: architecture line 1215 specifies
  `src/transcript/archive.ts`; codebase places the archival module at
  `src/runs/archive.ts` per Story 2.5 close (the `transcript/` →
  `runs/` rename was a Story 2.5 close decision). Story 6.8 preserves
  AC-1 INTENT byte-equivalently and adds JSDoc cross-reference to the
  drift in `src/runs/archive.ts:14-22`.
- Quality gates GREEN (Story 6.7 baseline 1531/0/5001 across 75 files
  → Story 6.8 1564/0/5078 across 79 files; Δ +33 tests / +77 expects /
  +4 files; bunx tsc --noEmit exit 0; bun run check exit 0; biome ci
  clean after autofix + 1 manual cleanup; grep registry 17 unchanged).

### File List

**NEW (7):**

- `src/runs/archive.ts` — `archiveOldRuns(opts)` mid-tier function
  implementing AC-1 (90-day archival to `<runsRoot>/.archive/<YYYY-MM>/`).
- `src/runs/archive.test.ts` — 11 ARCH_68_* tests covering BASIC,
  PAIRED, THRESHOLD, IDEMPOTENT, SKIP_ARCHIVE_DIR, NO_DIR, EMPTY,
  AGE_OVERRIDE, OUT_OF_SCOPE, BEST_EFFORT, DESTINATION_PERIOD_FROM_MTIME.
- `src/telemetry/rotate.ts` — `rotateOldTelemetry(opts)` mid-tier
  function implementing AC-2 (12-month rotation to flat
  `<telemetryRoot>/.archive/` with foreign-file regex gate).
- `src/telemetry/rotate.test.ts` — 10 ROTATE_68_* tests covering
  BASIC, PAIRED, FOREIGN_FILE_SKIP, THRESHOLD, IDEMPOTENT,
  SKIP_ARCHIVE_DIR, NO_DIR, AGE_OVERRIDE, OUT_OF_SCOPE, BEST_EFFORT.
- `src/startup/archival-trigger.ts` — NEW MID-TIER directory per AR41;
  `runArchivalAtStartup(opts)` orchestrator with closure-private
  `oncePerSessionRef` + module-level singleton + error isolation +
  `telemetry.enabled` gate + AR21 single-line audit notice +
  suppression when zero work.
- `src/startup/archival-trigger.test.ts` — 9 TRIGGER_68_* tests
  covering BASIC, TELEMETRY_DISABLED, ONCE_PER_SESSION, FRESH_REF,
  AUDIT_NOTICE_FORMAT, NO_AUDIT_WHEN_ZERO, ERROR_ISOLATION,
  NON_BLOCKING, FIRED_BEFORE_INVOKE.
- `src/integration/auto-archival-startup.test.ts` — AC-1/2/3/4 PRIMARY
  integration test (mirrors `aggregate-telemetry-no-pii.test.ts`
  placement). Snapshot-before-after on second-call idempotency.

**MODIFIED (5):**

- `src/runs/index.ts` — barrel re-exports `archiveOldRuns`,
  `ArchiveOldRunsOptions`, `ArchiveOldRunsResult`,
  `RUNS_AGE_THRESHOLD_MS_90D`, `RUNS_DEFAULT_PATH`.
- `src/telemetry/index.ts` — barrel re-exports `rotateOldTelemetry`,
  `RotateOldTelemetryOptions`, `RotateOldTelemetryResult`,
  `TELEMETRY_AGE_THRESHOLD_MS_12M`.
- `src/commands/next/run.ts` — Step 4b archival trigger wiring after
  Step 4 staging-cleanup site (`!args.dryRun` + presence-check gate +
  `void` fire-and-forget + `.catch(...)` non-fatal logger). Also
  extends `RunNextOptions.config` with optional `paths` field
  (forwarded by the production `import.meta.main loadConfig()` path).
- `src/commands/loop/run.ts` — loop setup phase wiring before
  plan-first short-circuit (`!args.planFirst` + presence-check gate +
  `void` fire-and-forget). Extends `LoopOpts.config` and the local
  `effectiveConfig` literal type with optional `paths` field.
- `docs/configuration.md` — NEW `## Auto-archival (Story 6.8 — DONE)`
  section + forward-tracker close (Stories 6.3-6.8 list updated).

### Change Log

| Date              | Author        | Description                                                              |
| ----------------- | ------------- | ------------------------------------------------------------------------ |
| 2026-05-05        | Amelia (Dev)  | Story 6.8 implementation: 7 NEW files (archive.ts + rotate.ts + archival-trigger.ts + integration test + 3 colocated test files) + 5 MODIFIED files (2 barrels + next/loop wiring + docs). 1 repair iter for `toBeNull` Bun fs.access semantics. Quality gates GREEN: tsc exit 0; bun test 1564/0/5078 across 79 files (Δ +33/+77/+4 vs Story 6.7 baseline); bun run check exit 0; errors registry 17 UNCHANGED; escalate sweep 33/0/114 UNCHANGED. AC-1/2/3/4 verified per file:line evidence in Completion Notes. 14 OQs all HONOURED. Status ready-for-dev → review. |
| 2026-05-05        | SDR (bmad-code-review) | Senior Developer Review APPROVE. Independent quality gates re-verified GREEN (tsc=0; check 1564/0/5078 across 79 files; errors=17; archival test sweep 33/0/77 across 4 new files). AC-1/2/3/4 PASS with file:line evidence. All 9 AR verdicts CLEAN (AR41/AR42/AR21/AR22/AR33/AR8/AR9/AR17/AR27). All 14 OQs HONOURED per spec. I-28 + I-48 PRIMARY HONOURED + CLOSED at archival lifecycle. 0 NEW must/should-fix; 4 NITs N-1..N-4 inherited; 1 NEW info forward-tracker I-49 added (calendar-month threshold drift; documentation-only OPEN). Story 6.8 status review → done. /bmad-loop --until=story:6.8 target REACHED. |


## Senior Developer Review (AI)

**Reviewer:** Tomasz Gorka (SDR via `bmad:bmad-code-review`)
**Date:** 2026-05-05
**Outcome:** APPROVE — story 6.8 ships AC-1/2/3/4 cleanly; ZERO source mutations needed; ZERO quality-gate regressions.

### Summary

Story 6.8 lands the FINAL Sprint-6 storage-hygiene piece: a NEW MID-TIER startup orchestrator (`src/startup/archival-trigger.ts`) plus two independent housekeeping modules (`src/runs/archive.ts` 90-day archival + `src/telemetry/rotate.ts` 12-month rotation). 7 NEW + 5 MODIFIED files; 33 NEW tests; ZERO new error classes; ZERO schema migrations. The implementation matches the spec verbatim — including the OQ-3 triple-layer idempotency (closure-private once-per-session ref + threshold filter + `.archive/` skip-at-entry), OQ-9 error isolation between runs and telemetry archives, OQ-10 dry-run + plan-first gates, and OQ-14 audit-notice suppression when zero work.

### Independent Quality Gate Re-verification (fresh shell)

| Gate | Result | Notes |
| --- | --- | --- |
| `bunx tsc --noEmit` | exit 0 | TypeScript clean |
| `bun run check` | 1564 pass / 0 fail / 5078 expects across 79 files | Story 6.7 baseline 1531/0/5001/75 → Δ +33/+77/+4 (matches dev claim) |
| `grep -c "extends StepperError" src/errors.ts` | 17 | ZERO new error classes (registry HELD) |
| `bun test src/runs/archive.test.ts src/telemetry/rotate.test.ts src/startup/archival-trigger.test.ts src/integration/auto-archival-startup.test.ts` | 33 pass / 0 fail / 77 expects across 4 files | All Story 6.8 tests green |

Stderr noise observed during `bun run check` is the deliberate `runs: archive failed for a.log: EISDIR` and `telemetry: rotate failed for 2024-01.jsonl: EISDIR` — these are the negative-path BEST_EFFORT_1 tests asserting the per-entry try/catch + warn() discipline (mirrors Story 2.2 cleanStagingOrphans precedent). NOT a regression.

### Acceptance Criteria Verification

- **AC-1 PASS** — runs older than 90 days are moved to `<runsRoot>/.archive/<YYYY-MM>/`. Implementation: `src/runs/archive.ts:111-196` (`archiveOldRuns`); period derivation at line 161 from `stat.mtime.toISOString().slice(0, 7)` (UTC-locked per OQ-4 + I-48); destination at line 163 `path.join(runsRoot, ".archive", periodYearMonth)`; `assertWithinScope` at line 167; `fs.rename` at line 173 with EXDEV fallback at lines 179-181. Integration verify: `src/integration/auto-archival-startup.test.ts:155-158` asserts `archivedRuns === 5`; `:162-181` asserts `.archive/2026-01/` placement.
- **AC-2 PASS** — telemetry older than 12 months moved to `<telemetryRoot>/.archive/` (FLAT) when `telemetry.enabled === true`. Implementation: `src/telemetry/rotate.ts:108-188`; foreign-file regex gate at line 142 (`TELEMETRY_FILE_PATTERN`); flat dest at line 157 (NO `<YYYY-MM>` subdir per OQ-8); `enabled` gate enforced upstream at orchestrator `src/startup/archival-trigger.ts:156` (`if (opts.config.telemetry.enabled === true)`). Integration verify: `auto-archival-startup.test.ts:188-198` asserts old `.jsonl` + `.md` both moved; new file stays.
- **AC-3 PASS** — archival idempotent (running twice = no-op). Triple-layer defence: (1) `archival-trigger.ts:129-131` once-per-session short-circuit returns `alreadyFired: true`; (2) `archive.ts:142-144` + `rotate.ts:136-138` skip `.archive/` subdir at entry-loop level; (3) threshold filter `now - mtime <= ageThresholdMs` (`archive.ts:155-158`, `rotate.ts:151-154`) re-skips already-moved files even on a fresh ref. Integration verify: `auto-archival-startup.test.ts:200-219` snapshot-before-after on second call asserts `expect(afterRuns).toEqual(beforeRuns)` byte-identical inventory + `alreadyFired === true`.
- **AC-4 PASS** — archival never blocks; one-line audit notice once per session. Non-blocking enforced at runner-tier wiring sites: `src/commands/next/run.ts:1626` and `src/commands/loop/run.ts:925` both use `void runArchivalAtStartup({...}).catch(...)` — the user's command does NOT `await` the promise. Single-line audit notice format: `archival-trigger.ts:175-179` emits ONE `info()` line `archival: archived ${archivedRuns} runs older than 90 days, ${rotatedTelemetry} telemetry files older than 12 months` only when `archivedRuns + rotatedTelemetry > 0` (per AR21 + OQ-14 suppression). Once-per-session enforced via closure-private `OncePerSessionRef` (line 73 module-level singleton). Test verify: `archival-trigger.test.ts:340` (TRIGGER_68_NON_BLOCKING_1).

### AR Verdicts

| AR | Verdict | Evidence |
| --- | --- | --- |
| AR41 (boundary) | PASS | `archive.ts:61-64` + `rotate.ts:57-61` import only `node:fs/promises`, `node:path`, `../io/log.ts` (foundational), `../io/paths.ts` (foundational); `archival-trigger.ts:55-61` imports only foundational + sibling-mid-tier (`runs/archive.ts`, `telemetry/rotate.ts`, `io/log.ts`, type-only `schemas/config.ts`). NEW `src/startup/` directory clean per OQ-11. |
| AR42 (schema-first / scope) | PASS | `assertWithinScope(destPath)` called on every move target: `archive.ts:167`, `rotate.ts:160`. ZERO new schemas (consistent with self-claim). |
| AR21 (single-line) | PASS | Audit notice at `archival-trigger.ts:175-179` is ONE line; `warn()` calls at `archive.ts:131-133/189-191`, `rotate.ts:127-129/181-183`, `archival-trigger.ts:148-152/166-170` all single-line. |
| AR22 (actionable-hint regex) | N/A | No new error classes; archival uses bare `Error` for warn() messages — NOT user-actionable hints. |
| AR33 (async + never console.*) | PASS | All fs ops async (`fs.access`, `fs.readdir`, `fs.stat`, `fs.rename`, `fs.copyFile`, `fs.unlink`, `fs.mkdir`); ZERO `console.*` in any of the 3 NEW source files (verified via grep). NO `process.exit` in archival paths. |
| AR8 (lock-free top-tier) | PASS | Archival modules NEVER touch `state.yaml`; the orchestrator runs OUTSIDE the verify-and-advance lock (wiring at `next/run.ts:1610-1631` Step 4b is BEFORE Step 5 doctor delegation and well-before any verify-and-advance lock acquisition; `loop/run.ts:911-930` is at loop setup BEFORE iteration body). ZERO `src/state/` or `src/lock/` imports. |
| AR9 (stdout JSON-line invariant) | PASS | Archival writes go to FILES (rename); audit notice + warn() go to STDERR via `info()`/`warn()` from `io/log.ts` — preserves AR9 stdout invariant. |
| AR17 (security/PII) | PASS | Archival NEVER reads file CONTENT — only `dirent.name` + `fs.stat` mtime (`archive.ts:127-194`, `rotate.ts:125-186`). No PII surface widening. |
| AR27 (telemetry schema invariants) | PASS | Rotation moves files unchanged via `fs.rename` (line 165) or copy-then-unlink (lines 172-173); ZERO mutation to JSONL records or markdown reports. The collector + aggregator schemas at `src/schemas/telemetry.ts` UNCHANGED. |

### OQ Adjudication (14 — all HONOURED)

OQ-1 (archive-vs-delete) — HONOURED via `fs.rename` at `archive.ts:173`/`rotate.ts:165`. OQ-2 (non-blocking) — HONOURED via `void` at `next/run.ts:1626`/`loop/run.ts:925`. OQ-3 (once-per-session triple-layer idempotency) — HONOURED at `archival-trigger.ts:129-136` (set-before-invoke) + `archive.ts:142-144`/`rotate.ts:136-138` (skip-archive-dir) + threshold filters. OQ-4 (UTC-locked period) — HONOURED at `archive.ts:161` `stat.mtime.toISOString().slice(0,7)`. OQ-5 (EXDEV cross-FS fallback) — HONOURED at `archive.ts:174-185`/`rotate.ts:166-177`. OQ-6 (ms-arithmetic threshold) — HONOURED at `rotate.ts:68` `12 * 30 * 24 * 60 * 60 * 1000`; the ~5-day calendar-vs-ms slack is documented (see new I-49 below). OQ-7 (foreign-file regex skip) — HONOURED at `rotate.ts:74` `TELEMETRY_FILE_PATTERN` + line 142 gate. OQ-8 (flat telemetry archive) — HONOURED at `rotate.ts:157` (no `<YYYY-MM>` subdir). OQ-9 (error isolation) — HONOURED at `archival-trigger.ts:140-152` + `:157-170` (independent try/catch per archive call). OQ-10 (dry-run + plan-first gates) — HONOURED at `next/run.ts:1618` `!args.dryRun` and `loop/run.ts:917` `!args.planFirst`. OQ-11 (NEW `src/startup/` mid-tier) — HONOURED via `src/startup/archival-trigger.ts` + colocated test. OQ-12 (`opts.config?.paths` presence-check) — HONOURED at `next/run.ts:1617-1621` + `loop/run.ts:916-920`. OQ-13 (slash-command markdown unchanged) — HONOURED via no-op (verified `commands/bmad-{next,loop}.md` not in dev File List). OQ-14 (audit suppression when zero work) — HONOURED at `archival-trigger.ts:175` `if (archivedRuns + rotatedTelemetry > 0)`.

### Findings

- **Must-fix:** 0
- **Should-fix:** 0
- **Nits:** 0 NEW; **4 inherited** N-1/N-2/N-3/N-4 carry forward unchanged from Stories 4.5-6.7 lineage.
- **Info / forward-trackers:** 1 NEW + 48 inherited (I-1..I-48 with closures I-26/I-27/I-28/I-38/I-41/I-46/I-47 closed across Epic 4-6).

**NEW info I-49 (calendar-month threshold drift):** the 12-month threshold uses ms-arithmetic (`12 * 30 * 24 * 60 * 60 * 1000` = 360 days; `rotate.ts:68`), accepting a documented ~5-day slack vs calendar-month subtraction (`Date.setUTCMonth`). For Epic 6.10 hardening or a forward telemetry-aggregator-reads-archive story, a calendar-aware threshold (`now.setUTCMonth(now.getUTCMonth() - 12)`) would tighten the boundary. Documentation-only OPEN forward-tracker; NOT a v0.1 blocker per AC-2 wording "older than 12 months" + OQ-6 explicit accept.

**Inherited closures honoured here:**
- I-28 (Story 6.8 cross-coordination forward) — PRIMARY HONOURED + CLOSED at `archival-trigger.ts` orchestrator (the cross-Epic-6-pipeline integration point).
- I-48 (UTC discipline) — PRIMARY HONOURED at `archive.ts:161` mtime → `<YYYY-MM>` derivation + `rotate.ts:68/74` ms-arithmetic + regex (transitive UTC across collector → aggregator → archiver).

### Cross-coordination preserved

- Errors registry HELD at 17 (verified independently); 33-test escalate-actionable-hint sweep UNCHANGED.
- Schema migration registry HELD at v1; ZERO new schemas; archival never reads JSONL CONTENT.
- AR9 stdout JSON-line invariant unchanged; archival writes are files (not stdout).
- Aggregator OQ-3 invariant (Story 6.7) PRESERVED — aggregator still reads only active dir, NOT `.archive/`. Aggregating archived periods remains a documented forward-tracker.
- `commands/bmad-{next,loop}.md` slash-command markdown UNCHANGED.

### Verdict

**APPROVE.** No source mutations required. Story 6.8 status `review → done`. Sprint-status `6-8-auto-archival-of-runs-and-telemetry: review → done`. Epic-6 stays `in-progress` (stories 6.9, 6.10 backlog; epic-6-retrospective optional). Loop target `story:6.8` REACHED.
