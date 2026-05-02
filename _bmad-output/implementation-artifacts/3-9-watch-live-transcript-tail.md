---
status: done
story_id: '3.9'
story_key: 3-9-watch-live-transcript-tail
epic: '3'
title: '`--watch` Live Transcript Tail'
created: '2026-05-01'
last_updated: '2026-05-01'
priority: M
estimated_effort: M
fr_coverage:
  - FR8
  - FR42
  - FR43
  - FR44
  - FR52
  - FR53
  - FR54
nfr_coverage:
  - NFR-P1
  - NFR-P4
  - NFR-S2
  - NFR-S5
  - NFR-R1
  - NFR-R5
  - NFR-I2
ar_coverage:
  - AR2
  - AR8
  - AR9
  - AR11
  - AR21
  - AR22
  - AR25
  - AR26
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
  - _bmad-output/implementation-artifacts/2-4-lock-free-run-ts-for-bmad-next.md
  - _bmad-output/implementation-artifacts/2-5-markdown-transcript-json-run-log-writers.md
  - _bmad-output/implementation-artifacts/1-7-cli-argument-parser.md
  - .bmad-stepper/config.yaml
  - src/errors.ts
  - src/io/log.ts
  - src/io/paths.ts
  - src/runs/build-run-log.ts
  - src/runs/render-markdown.ts
  - src/runs/write-step.ts
  - src/runs/index.ts
  - src/commands/next/run.ts
  - src/commands/next/run.test.ts
  - src/commands/next/args.ts
---

# Story 3.9: `--watch` Live Transcript Tail

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper user,
I want `/bmad-next --watch` to tail the most recent transcript log,
So that I can monitor a long-running step or loop without `tail -f`.

## Context Summary

This is the **ninth story of Epic 3** and the **first deliverable that lands a STREAMING-mode read-only flag** — `src/runs/watch.ts` (FR42 — `--watch`). Stories 3.1 + 3.2 closed the halt-recovery loop (write `state.lastAttempted` + `state.lastFailureReason` on halt; consume them via `--resume`). Story 3.3 landed the first read-only-preview flag (`--dry-run`); Story 3.4 wired explicit-step + scope filtering and introduced the `isPreconditionMet(node, state)` helper; Story 3.5 wired the `--persona` override + `--include-optional`/`--no-optional` toggles AND the `--list` optional-toggle filter; Story 3.6 replaced the `--explain` placeholder with the structured 5-component reasoning trace; Story 3.7 replaced the `--list` placeholder with the canonical 4-component per-line format; Story 3.8 replaced the `--diff-state` and `--export-state` Story 2.4 placeholders with the divergence-report + schema-versioned-JSON-export helpers (and introduced the FR54 SPECIAL-CASE for `--export-state` stdout-only-JSON). Story 3.9 turns its attention to **the live-tail observability surface (FR42)** — replacing the Story 2.4 forward-deferral guard at `src/commands/next/run.ts:1336-1340` with the proper Bun-stream-based line-by-line tail until SIGINT.

**Architectural path-rename deviation: `src/transcript/` → `src/runs/`.** The AC source at epics.md line 862 references `src/transcript/watch.ts`; the architecture §line 1216 + §line 1372 lists the canonical home as `src/transcript/watch.ts`. **However**, Story 2.5 (markdown transcript + JSON run-log writers) RENAMED the `src/transcript/` directory to `src/runs/` (per state.yaml evidence — `src/runs/{build-run-log,render-markdown,write-step,index,types}.ts` with no `src/transcript/` directory present). Story 3.9 lands the new module at **`src/runs/watch.ts`** to align with the established Story 2.5 convention. The AC source path wording is **stale** relative to the ACTUAL filesystem layout; this is a documented design decision adjudicated in §Open Questions, not a deviation from the AC's INTENT (the AC enforces the FR42 contract — line-by-line tail with Bun streams + SIGINT graceful exit + fresh-project hint; the path naming is below the AC's specificity threshold).

**Finding the most recent run log** per AC line 862 (`src/transcript/watch.ts` finds the most recent `runs/<ts>-<step>.log`):

The transcript writer per Story 2.5 emits files at `<runsRoot>/<ts>-<step>.log` (architecture §line 547 + AR25). The directory is `_bmad-output/.stepper/runs/` per `STEPPER_INTERNAL_ROOT` in `src/io/paths.ts:14` + `src/runs/write-step.ts:55`. The `<ts>` prefix follows `YYYY-MM-DDTHH-mm-ss` UTC format (filesystem-safe per `write-step.ts:60-83` — `:` replaced with `-`, `.<ms>` and trailing `Z` stripped). The "most recent" candidate is selected by **modification time** (mtime) descending, then by filename descending as a tiebreaker. The algorithm:

1. Read directory `_bmad-output/.stepper/runs/`.
2. Filter entries matching the `*.log` extension (skip `*.json` siblings, skip `*.bak` rotations from atomicWrite, skip directories).
3. For each candidate, `fs.stat(path)` to fetch the `mtimeMs` field.
4. Sort by `mtimeMs` descending (most recent first); break ties by filename descending (`<ts>-<step>.log` filenames sort lexically by timestamp, so the descending sort yields the most recent timestamp).
5. Pick `candidates[0]`.

**Bun stream APIs** per AC line 868 (`tail uses Bun's stream APIs (no external tail dep)`):

The Bun runtime provides `Bun.file(path).stream()` returning a `ReadableStream<Uint8Array>` (Bun v1.0+; AR2 satisfied — Bun >= 1.3 confirmed during Story 1.13 + 3.8 baseline). For the live-tail mode, the watcher must:

1. **Open initial position** — read the file's current size via `fs.stat(path)` and remember the byte offset.
2. **Emit existing content** — read from offset 0 to current size; pipe through `TextDecoderStream` (UTF-8 decode); split on `\n`; for each line, `process.stdout.write(line + "\n")`.
3. **Poll for appends** — every ~250ms (configurable; v0.1 default), `fs.stat(path)` to detect file-size growth.
4. **On growth detected** — open a `Bun.file(path).slice(prevOffset, currSize).stream()`; pipe through `TextDecoderStream`; split on `\n`; emit each line; advance the offset.
5. **Buffer partial lines** — a write may arrive mid-line; the watcher must buffer the trailing partial line until a `\n` arrives.

Alternative implementation per AC line 864 ("line-by-line stream"): instead of polling, use Bun's `Bun.spawn` with `node:fs/promises#watch` (file-system watcher) to receive notifications on file change. **v0.1 conservative chooses the polling approach** — `node:fs/promises#watch` has cross-platform inconsistencies (macOS uses FSEvents, Linux uses inotify; Bun's coverage of edge cases like file-rotation is incomplete); a 250ms poll delivers acceptable freshness with deterministic behaviour across all 3 platforms (Linux, macOS, win32 — though Stepper targets Linux + macOS only per NFR-I5). The poll interval is hard-coded for v0.1; Story 6.x may surface a `bmad-stepper.config.yaml watch.pollMs` knob.

**SIGINT handler** per AC line 864 ("until SIGINT"):

The watcher registers `process.on('SIGINT', () => cleanup())` BEFORE entering the poll loop. The cleanup handler:

1. Cancels the poll interval (`clearInterval(handle)`).
2. Closes any open `ReadableStream` reader (`reader.releaseLock()` + `stream.cancel()`).
3. Emits a final newline to stdout (cosmetic — separates the tail from the user's shell prompt).
4. Calls `process.exit(0)` (graceful SIGINT exit per NFR-R5 — note: NFR-R5's 30s budget is for the loop runner Story 4.9; for the watcher, the cleanup is sub-millisecond — no in-flight writes to flush).

**Fresh-project case** per AC line 866-867 (`there are no run logs yet (fresh project)`):

The watcher's directory scan returns `candidates.length === 0` when:
- The `_bmad-output/.stepper/runs/` directory does not exist (no runs ever).
- The directory exists but contains zero `*.log` files (e.g. only `*.json` siblings from a partial write that aborted between markdown + JSON — write-step.ts writes markdown FIRST, so this is rare; or only `*.bak` rotations from atomic-write churn).

In this case, the watcher MUST emit the verbatim hint string per AC line 867: `No run logs yet. Start a step with /bmad-next.` and exit with code 0 (success). The hint goes to stdout (the user's terminal expects the message there, NOT stderr). Distinct from a halt (`action: "halt"` exit code 1) — the empty-runs state is a **valid success state** (the user simply hasn't run a step yet; there's nothing to tail).

**AR9 wrapper question** for `--watch`:

The AR9 protocol per architecture §line 1660 enforces a single discriminated-union JSON line on stdout per `bun run` invocation. The `--watch` mode is **structurally incompatible with AR9**: it streams an indefinite number of lines (one per transcript line) until SIGINT. Two implementation options:

- **Option A (AR9-strict)**: emit a single AR9 `report` action whose `message` carries the streamed content as a multi-line string. **Rejected**: this requires buffering the ENTIRE transcript in memory until SIGINT; defeats the streaming intent; breaks the AR9 single-line invariant (the multi-line `message` would be JSON-escaped but the line-by-line freshness is lost).
- **Option B (FR54-friendly streaming)**: BYPASS the AR9 wrapper entirely; stream raw text lines to stdout directly via `process.stdout.write(line + "\n")` per transcript line. The runner returns NO action object; the `import.meta.main` block detects `args.watch === true` and SKIPS `emitDispatchAction`; the watch loop runs to completion (until SIGINT) and exits 0. **Chosen**: matches Story 3.8's `--export-state` SPECIAL-CASE precedent (FR54 carve-out per architecture §line 524 + §line 862 — "the `--export-state` JSON output goes to stdout; the logger helper at `src/io/log.ts` writes to the proper output stream"); the `--watch` carve-out is the streaming-mode parallel.

**Story 3.9 chooses Option B** — bypass AR9 entirely; stream raw stdout. The `runNext` function returns a SPECIAL `NextResult` shape `{ exitCode: 0, action: { action: "report", message: "<watch session ended>" }}` ONLY for testability (when called programmatically); the real `import.meta.main` execution NEVER reaches the `emitDispatchAction` call because the `runNext` body itself loops on the watcher (and process.exit's directly from the SIGINT handler). The behavior parallels the FR54 carve-out for `--export-state`; documented in `run.ts` JSDoc + the new `src/runs/watch.ts` JSDoc + §Open Question 1.

**FR/NFR/AR mapping**:

- **FR42** (`--watch` live tail): PRIMARY DELIVERABLE. v0.1 ships line-by-line tail of the most recent `runs/<ts>-<step>.log` until SIGINT.
- **FR43 + FR44** (transcript + run-log paths): CONSUMED. The watcher reads from `_bmad-output/.stepper/runs/<ts>-<step>.log` produced by Story 2.5's writers; Story 3.9 NEVER mutates the transcript files.
- **FR52** (read-only flags non-locking): SATISFIED-BY-AR8. The watcher is structurally lock-free; no `loadStateUnlocked` even (the watcher reads ONLY transcript files, never `state.yaml`); ZERO `src/lock/` import.
- **FR53** (documented exit codes): EXTENDED. Watch returns exit code 0 on graceful SIGINT exit OR fresh-project empty-runs case.
- **FR54** (stdout/stderr discipline): EXTENDED with SPECIAL CASE. The `--watch` mode bypasses the AR9 wrapper; raw transcript content streams to stdout directly. Diagnostics (e.g., poll-interval-changed warnings in v0.1.x) route to stderr.
- **NFR-P4** (transcript streaming has zero observable impact on main-thread latency): PRESERVED. The watcher is a SEPARATE `bun run` invocation (no shared event loop with the dispatch path); the poll is debounced (~250ms); zero contention.
- **NFR-R5** (SIGINT graceful exit): SATISFIED. The watcher cleans up sub-millisecond; the 30s NFR-R5 budget is for the loop runner Story 4.9 (in-flight sub-agent + state write).
- **AR2** (Bun >= 1.3): SATISFIED. `Bun.file().stream()` available since Bun 1.0; Story 3.9 uses ZERO new Bun APIs beyond the established baseline.
- **AR8** (lock-free `run.ts`): UNCHANGED. The watcher path is structurally lock-free.
- **AR9** (single discriminated-union JSON line on stdout): EXTENDED with SECOND SPECIAL CASE (after Story 3.8's `--export-state`). Documented in `run.ts` + watch.ts JSDoc + §Open Question 1.
- **AR11** (`state.yaml` at canonical path): UNCHANGED — the watcher does NOT read `state.yaml`.
- **AR21 + AR22** (errors carry code + actionable hint): UNCHANGED. ZERO new error classes. Filesystem errors (ENOENT on a deleted run-log mid-watch) flow through the cleanup handler with a stderr warn; the existing `error()` helper from `src/io/log.ts` is reused.
- **AR25** (markdown transcript per step): CONSUMED. The watcher reads the markdown transcript verbatim; ZERO mutations.
- **AR26** (JSON run-log per step): NOT CONSUMED. The watcher targets `*.log` files only; `*.json` siblings are skipped.
- **AR33** (function & error semantics; throw not Result; no console.\*; async/await): EXTENDED. The watcher is async; throw not Result; stdout writes use `process.stdout.write` (canonical primitive per architecture §line 862); ZERO `console.*` calls.
- **AR41** (boundary graph): EXTENDED. The new `src/runs/watch.ts` is mid-tier; imports `node:fs/promises` (stdlib) + `Bun.file` (runtime) + foundational siblings (no upward imports, no top-tier imports). The `src/commands/next/run.ts` runner (top-tier) imports the new mid-tier sibling — same direction allowed.
- **AR42** (test discipline): EXTENDED. New colocated `src/runs/watch.test.ts` + integration test at `src/integration/watch-fresh-project.test.ts`.

**What this story DOES NOT do**:

- **Implement Story 3.10's `skipAcquire` flag** for the read-only-flag cluster. Story 3.10 owns the explicit `--export-state` / `--list` / `--explain` / `--dry-run` / `--diff-state` lock-skipping logic. **Note**: `--watch` is NOT in Story 3.10's enumeration (epics.md line 873); it stays structurally lock-free without a `skipAcquire` opt-in. Forward-coupling is documented in §Forward Dependencies.
- **Implement concurrent multi-watcher support** (v6.x). Two simultaneous `--watch` invocations against the same transcript file are safe (read-only access; the OS allows multiple readers); v0.1 does NOT track watcher PIDs, does NOT coordinate across watchers, does NOT synchronise the line emission. Two watchers see the same content; the user is responsible for avoiding terminal-stream confusion.
- **Implement file-rotation handling** (Story 6.8 — auto-archival of runs >90 days). When the transcript file is moved/archived mid-watch, the v0.1 watcher detects via `fs.stat(...)` ENOENT and exits with a "transcript rotated" stderr warn + exit code 0. Story 6.8 may extend with auto-follow-rotated-file semantics.
- **Implement `--watch` selector flags** (`--watch=<step-name>`, `--watch=<run-id>`, etc.). v0.1 ALWAYS picks the most recent `*.log`; Story 6.x may add selectors via `bmad-stepper.config.yaml watch.selector`.
- **Implement the loop runner SIGINT contract** (Story 4.9 — NFR-R5 30s graceful exit budget for the loop runner with in-flight sub-agent + state write). The watcher's cleanup is sub-millisecond; not in scope.
- **Implement `--watch` JSON-mode** (`--watch --json`). v0.1 emits the markdown transcript content verbatim (the *.log file is markdown). The `*.json` sibling is the JSON run-log per AR26; emitting it line-by-line makes no semantic sense (it's a single JSON object, not a stream); v0.1 does not surface a JSON-mode flag.
- **Implement `--watch` highlighting / colorisation**. v0.1 emits raw stdout; the user's terminal handles ANSI passthrough if the transcript already contains it (the markdown transcript is plain text per Story 2.5; no ANSI codes are emitted by the writer).
- **Modify Story 2.5's transcript writers**. The watcher is a pure CONSUMER; no changes to `write-step.ts` / `render-markdown.ts` / `build-run-log.ts`.

Concretely, this story produces:

1. **`src/runs/watch.ts`** (NEW, ~150-180 lines): the `watchMostRecentRunLog({ runsRoot?, pollMs?, signal? }): Promise<WatchResult>` helper. `WatchResult` is a structural type `{ filePath: string | null; status: "watched" | "no-runs" }`. The function:
   - Resolves `runsRoot` (default: `_bmad-output/.stepper/runs/`).
   - Scans for `*.log` files; sorts by mtime descending.
   - On empty: emits `No run logs yet. Start a step with /bmad-next.` to stdout, returns `{ filePath: null, status: "no-runs" }`.
   - On non-empty: opens the most recent file, emits existing content, polls for appends until SIGINT.
   - SIGINT handler cleans up + exits 0.
   - Pure / async; no I/O writes; lock-free.

2. **`src/runs/watch.test.ts`** (NEW, ~200-280 lines): ~10 colocated test cases:
   - Test A: empty-runs case — emits the verbatim hint + exits.
   - Test B: single-file present — opens, emits existing content, polls.
   - Test C: most-recent-by-mtime selection (multiple files with different mtimes; assert the latest is chosen).
   - Test D: tie-breaker by filename descending (multiple files with equal mtimes; assert the lexically-greatest filename is chosen).
   - Test E: append-detection — write to the file mid-watch; assert the appended bytes are emitted.
   - Test F: partial-line buffering — append `"abc"` (no `\n`); assert nothing emitted; append `"def\n"`; assert `"abcdef"` emitted as a single line.
   - Test G: SIGINT cleanup — register SIGINT handler; raise SIGINT; assert cleanup runs + process exit 0.
   - Test H: skip non-`*.log` entries — `*.json` siblings + `*.bak` rotations + directories ignored.
   - Test I: file deletion mid-watch — `fs.stat(...)` throws ENOENT; cleanup + stderr warn + exit 0.
   - Test J: lock-free invariant — programmatic source-content scan rejects `from "../lock/"`, `acquire(`, `loadState(`, `loadStateUnlocked(`, `recomputeState(` patterns.

3. **`src/integration/watch-fresh-project.test.ts`** (NEW, ~80-120 lines): the AC-line-866-867 enforcement test. Spawns `bun run src/commands/next/run.ts -- --watch` against an empty tmpdir (no `_bmad-output/.stepper/runs/`); captures stdout; asserts it equals exactly `No run logs yet. Start a step with /bmad-next.\n`; asserts exit code 0; asserts no FS writes (no transcript files created).

4. **`src/commands/next/run.ts`** (MODIFIED, ~30-line replacement): replaces the Story 2.4 forward-deferral guard at lines 1336-1340 with a call into `watchMostRecentRunLog(...)`. The `--watch` short-circuit must move from the "Step 3: forward-deferral guards" section (currently ~`run.ts:1329-1347`) into a new position after `--doctor` but before the `--export-state` branch (or at the top of "Step 6: read-only flag handling"). The runner returns a SPECIAL `NextResult` (action: report with watch-summary message) for testability; the `import.meta.main` block bypasses `emitDispatchAction` when `args.watch === true`. The watcher itself emits raw stdout from inside its loop; the `runNext` return is reached only AFTER the watcher's SIGINT handler triggers `process.exit(0)` — the return value is for tests calling `runNext({ argv: ["--watch"], abortSignal: someSignal })` programmatically.

5. **`src/commands/next/run.test.ts`** (MODIFIED, ~80 added lines): 3-4 new colocated test cases covering the runner short-circuit:
   - Test A: `--watch` short-circuit invokes `watchMostRecentRunLog`; the runner returns `action: "report"` with a watch-summary message (testability path).
   - Test B: route order — `--watch + --diff-state` → `--watch` wins (route order: doctor → watch → export → diff → explain → list → dry-run); programmatically driven via abortSignal to terminate the watch.
   - Test C: lock-free invariant — `--watch` invocation does NOT call `acquire`; spy on `acquire` from `src/io/lock.ts`.

6. **`_bmad-output/implementation-artifacts/sprint-status.yaml`** (MODIFIED): flips `3-9-watch-live-transcript-tail: backlog → ready-for-dev` (at create-story time). At dev-story completion, flips to `review` (intermediate `in-progress` during dev).

**What this story DOES land**:

- The architecturally-prescribed **`src/runs/watch.ts`** module per FR42 + epic AC line 862 + architecture §line 1216 (modulo the path-rename: `src/transcript/watch.ts` → `src/runs/watch.ts` per Story 2.5's directory rename — see §Open Question 2).
- The architecturally-prescribed **Bun-stream-based line-by-line tail** per AC line 868 (`tail uses Bun's stream APIs (no external tail dep)`).
- The architecturally-prescribed **fresh-project hint** per AC line 867 (verbatim string `No run logs yet. Start a step with /bmad-next.`).
- The architecturally-prescribed **SIGINT graceful exit** per AC line 864 (`tailed (line-by-line stream) until SIGINT`).
- The architecturally-prescribed **`src/commands/next/run.ts` short-circuit replacement** at lines 1336-1340 — replaces the Story 2.4 forward-deferral guard with a call into the new helper.
- The architecturally-prescribed **AR9 SPECIAL-CASE bypass** per FR42 + FR54 (parallel to Story 3.8's `--export-state`).
- The **integration test for fresh-project case** per AC line 866-867.
- **~10 new colocated unit-test cases** in `watch.test.ts` covering happy-path + edge cases + SIGINT timing.
- The **forward-coupling documentation** with Stories 3.10 / 4.9 / 6.8 / 6.x.

This story exercises:

- **AR8** (lock-free `run.ts` / lock-held `verify-and-advance.ts`): UNCHANGED. The watcher is structurally lock-free; `run.ts` is unchanged in lock posture.
- **AR9** (single discriminated-union JSON line on stdout): EXTENDED with a SECOND SPECIAL CASE (after Story 3.8's `--export-state`). `--watch` BYPASSES the AR9 wrapper entirely; raw transcript content streams to stdout. Documented in `run.ts` JSDoc + the new `src/runs/watch.ts` JSDoc.
- **AR11** (`state.yaml` at `_bmad-output/.stepper/state.yaml`): UNCHANGED. The watcher does NOT read `state.yaml`.
- **AR21 + AR22** (errors carry code + actionable hint): UNCHANGED. ZERO new error classes.
- **AR25** (markdown transcript per step): CONSUMED. The watcher reads the markdown transcript file verbatim.
- **AR26** (JSON run-log per step): NOT CONSUMED. The watcher targets `*.log` only.
- **AR33** (function & error semantics; throw not Result; no console.\*; async/await): EXTENDED. The watcher is async; throw not Result; no console.* (the watch's stdout emission uses `process.stdout.write` per architecture §line 862).
- **AR41** (boundary graph; no upward / sibling-higher imports): UNCHANGED + EXTENDED. The new `src/runs/watch.ts` is a mid-tier module; imports `node:fs/promises` (stdlib) + `Bun.file` (runtime) + `STEPPER_INTERNAL_ROOT` from `src/io/paths.ts` (foundational sibling). The new `src/integration/watch-fresh-project.test.ts` spawns the runner subprocess; structurally agnostic to AR41.
- **AR42** (test discipline): EXTENDED. New unit tests in `src/runs/watch.test.ts` + integration test in `src/integration/watch-fresh-project.test.ts`. Each test file has its colocated `*.test.ts` per AR42.
- **FR8** (`/bmad-next` single-step advance): UNCHANGED. The dispatch path is unaffected; `--watch` is a read-only short-circuit (technically a streaming-mode short-circuit).
- **FR42** (`--watch` live tail): PRIMARY DELIVERABLE. v0.1 ships the most-recent-by-mtime tail per AC line 862-868.
- **FR43 + FR44** (transcript paths): CONSUMED. The watcher reads `_bmad-output/.stepper/runs/<ts>-<step>.log` per Story 2.5's writer paths.
- **FR52** (read-only flags non-locking): SATISFIED-BY-AR8. The watcher is structurally lock-free.
- **FR53** (documented exit codes): EXTENDED. Watch returns exit code 0 (graceful) on SIGINT or empty-runs; the runner's halt path is unchanged.
- **FR54** (stdout/stderr discipline): EXTENDED. The `--watch` raw stdout stream goes to stdout (same as the `*.log` content); diagnostics route to stderr via the existing `info`/`warn`/`error` helpers.
- **NFR-P1** (next-step computation < 500ms p95): PRESERVED (the watcher is not on the next-step computation path).
- **NFR-P4** (transcript streaming has zero observable impact on main-thread latency): PRESERVED. The watcher is a SEPARATE `bun run` invocation; no shared event loop.
- **NFR-S2** (writes only inside scope): UNCHANGED. The watcher is read-only; ZERO write surface.
- **NFR-S5** (atomic writes + locks): UNCHANGED. Read-only paths.
- **NFR-R1** (zero data loss on halt): UNCHANGED. Read-side only.
- **NFR-R5** (SIGINT graceful within 30s): SATISFIED FOR WATCHER (sub-millisecond cleanup); the 30s budget is for the loop runner Story 4.9.
- **NFR-I2** (unknown-skill fail-loud): UNCHANGED. The watcher does not invoke any DAG / skill resolution.

Estimated effort: **M** (medium — ONE new core module `src/runs/watch.ts` (~150-180 lines); ONE new integration test `src/integration/watch-fresh-project.test.ts` (~100 lines); ONE replacement of the Story 2.4 forward-deferral guard in `src/commands/next/run.ts` (~30-line replacement, including moving the short-circuit position from the guards block to the read-only-flag block); ONE special-case `import.meta.main` branch for `--watch` bypass (~10 lines added); TWO new test files (`watch.test.ts` + `watch-fresh-project.test.ts`) totalling ~300-400 lines + ~80 added lines to `run.test.ts`. Net additions: ~600-700 lines across 5 files. The integration test is REQUIRED per AC line 866-867; the SIGINT handler requires careful timing (Test G + integration test); the AR9 single-line-on-stdout invariant has a SECOND SPECIAL CASE for `--watch` per FR42 + FR54 — design care needed; the Bun stream + line-buffer is novel to the codebase but stays inside Bun's standard ReadableStream + TextDecoderStream APIs).

It does **NOT**:

- **Implement runtime `failurePolicies` lookup.** Forward-deferred to Story 6.x.
- **Implement multi-persona sequential dispatch.** Forward-deferred to Stories 4.1 + 5.*.
- **Implement Story 3.10's `skipAcquire` flag** for read-only-flag cluster (`--watch` is NOT in 3.10's enumeration; structurally lock-free without opt-in).
- **Implement concurrent multi-watcher support** (v6.x).
- **Implement file-rotation auto-follow** (Story 6.8 — 90-day archive rotation).
- **Implement `--watch` selector flags** (`--watch=<step>` etc.).
- **Implement loop-runner SIGINT contract** (Story 4.9 — 30s budget for in-flight writes).
- **Modify Story 2.5's transcript writers.** Pure CONSUMER.
- **Add a new dispatch-protocol field.** The `--watch` SPECIAL CASE bypasses the AR9 wrapper entirely; no schema extension.
- **Add a config-loader knob for poll-ms.** v0.1 hard-codes 250ms; Story 6.1 (config-loader) may add `bmad-stepper.config.yaml watch.pollMs`.

## Acceptance Criteria

The acceptance criteria below are reproduced **verbatim** from `_bmad-output/planning-artifacts/epics.md` §Story 3.9 (lines 860-868, BDD Given/When/Then format). Lines and AC labelling preserved.

**Acceptance Criteria:**

**Given** `src/transcript/watch.ts` finds the most recent `runs/<ts>-<step>.log`
**When** `--watch` is supplied
**Then** the file is tailed (line-by-line stream) until SIGINT
**Given** there are no run logs yet (fresh project)
**When** `--watch` runs
**Then** it prints `No run logs yet. Start a step with /bmad-next.` and exits 0
**And** tail uses Bun's stream APIs (no external `tail` dep)

> **Path-rename note**: AC line 862 references `src/transcript/watch.ts`; the actual landing path is **`src/runs/watch.ts`** per Story 2.5's directory rename (`src/transcript/` → `src/runs/`). See §Context Summary "Architectural path-rename deviation" + §Open Question 2.

## Tasks / Subtasks

- [ ] **Task 0 — Verify pre-conditions (AC: all)**
  - [ ] 0.1 Confirm Story 3.1 (`record_last_attempted_last_failure_reason_on_halt`) is `done` per `_bmad-output/implementation-artifacts/sprint-status.yaml:71`.
  - [ ] 0.2 Confirm Story 3.2 (`--resume` Flag) is `done` per `sprint-status.yaml:72`.
  - [ ] 0.3 Confirm Story 3.3 (`--dry-run` Flag) is `done` per `sprint-status.yaml:73`.
  - [ ] 0.4 Confirm Story 3.4 (`--step` and Scope Flags) is `done` per `sprint-status.yaml:74`.
  - [ ] 0.5 Confirm Story 3.5 (`--persona` + `--include-optional`/`--no-optional`) is `done` per `sprint-status.yaml:75`.
  - [ ] 0.6 Confirm Story 3.6 (`--explain` Reasoning Trace) is `done` per `sprint-status.yaml:76`.
  - [ ] 0.7 Confirm Story 3.7 (`--list` Candidate Next Steps) is `done` per `sprint-status.yaml:77`.
  - [ ] 0.8 Confirm Story 3.8 (`--diff-state` and `--export-state`) is `done` per `sprint-status.yaml:78`.
  - [ ] 0.9 Confirm Story 2.5 (`markdown-transcript-json-run-log-writers`) is `done` per `sprint-status.yaml:64`; read `src/runs/write-step.ts:54-55` (the `RUNS_ROOT` constant `${STEPPER_INTERNAL_ROOT}/runs`); read `src/runs/write-step.ts:73-83` (the `deriveTimestamp` helper that produces the `<ts>-<step>.log` filename).
  - [ ] 0.10 Confirm `src/io/paths.ts:14` declares `STEPPER_INTERNAL_ROOT = "_bmad-output/.stepper"`. The watcher defaults to `${STEPPER_INTERNAL_ROOT}/runs` per Story 2.5's `RUNS_ROOT` constant.
  - [ ] 0.11 Confirm Story 1.7 (`src/commands/next/args.ts`) declares `watch: z.boolean().default(false)` at line 166 + lists `"watch"` in the `booleanKeys` set at line 222. **No args change needed for Story 3.9.**
  - [ ] 0.12 Confirm Story 2.4's existing `--watch` placeholder lives at `src/commands/next/run.ts:1336-1340` (forward-deferral guard returning `haltWithHint(1, "Run /bmad-next --doctor instead; --watch is implemented in Story 3.9 (Epic 3).")`). **Story 3.9 REPLACES the placeholder** with a call into the new `watchMostRecentRunLog(...)` helper. **Note**: the placeholder is structured as a `haltWithHint` (exit code 1) — Story 3.9 reroutes to a streaming-mode call with eventual exit code 0; the placement of the short-circuit moves from "Step 3: forward-deferral guards" to a new position (between `--doctor` at Step 5 and `--export-state` at the top of Step 6).
  - [ ] 0.13 Confirm `src/runs/index.ts` exports the public surface from Story 2.5. Story 3.9 may extend the barrel to re-export `watchMostRecentRunLog` (consistent with the Story 2.5 barrel pattern).
  - [ ] 0.14 Confirm `src/errors.ts` registry stays at 16 codes (`bun test src/errors.test.ts`: 10 pass, 197 expects). Story 3.9 ships ZERO new error classes — filesystem errors flow through the existing translation pipeline.
  - [ ] 0.15 Read epics.md §Story 3.9 lines 854-868 verbatim. Confirm the AC text in §Acceptance Criteria above is character-identical to lines 860-868.
  - [ ] 0.16 Read prd.md §FR42 line 727 (`Users can stream the live transcript of a running loop (--watch)`); §FR43 line 728 + §FR44 line 729 (transcript paths under `_bmad-output/.stepper/runs/`); §FR54 line 745 (stdout/stderr discipline).
  - [ ] 0.17 Read architecture.md §line 547 (markdown transcript per step at `runs/<ts>-<step>.log`); §line 550 (`--watch` — `bun run watch-runs` tails the most recent transcript log as text); §line 1216 (`watch.ts # --watch tail`); §line 1372 (FR42 → `src/transcript/watch.ts`); §line 1672 (`run.ts` is read-only / lock-free); §line 1660 (AR9 protocol concretization); §line 524 (FR54 stdout/stderr discipline); §line 862 (no `console.log`).
  - [ ] 0.18 Read epic-2-retrospective.md §Forward Action Items — confirm Story 3.9 is in the recommended sequence (AFTER Story 3.8, BEFORE Story 3.10).
  - [ ] 0.19 Read Story 3.8's Forward Dependencies §Story 3.9 entry (line 619) — confirms 3.8 + 3.9 are sibling read-only diagnostic flags with no shared surface beyond the `report`-action output pattern (and Story 3.9 inherits Story 3.8's AR9 SPECIAL-CASE precedent).
  - [ ] 0.20 Confirm baseline `bun run check` exits 0 with the post-Story-3.8 baseline (~693 pass / 0 fail / ~2574 expects / 53 files per Story 3.8 final).
  - [ ] 0.21 Confirm Bun host version satisfies AR2 (Bun >= 1.3). Run `bun --version`; record in Completion Notes.
  - [ ] 0.22 Read Story 2.5's `src/runs/write-step.ts:54-150` to confirm the markdown transcript path generation: `<runsRoot>/<ts>-<step>.log` with `<ts>` per the filesystem-safe transformation (`YYYY-MM-DDTHH-mm-ss`). The watcher consumes these paths verbatim.

- [ ] **Task 1 — Create `src/runs/watch.ts` module skeleton (AC: line 862)**
  - [ ] 1.1 Module shape (mid-tier per AR41; FR42, FR43, FR54, NFR-P4, AR8, AR11, AR25, AR33). JSDoc explains the most-recent-by-mtime selection contract; the module composes `findMostRecentRunLog + tailLineByLine + sigintHandler`.
  - [ ] 1.2 Public exports:
    ```typescript
    export interface WatchOptions {
      readonly runsRoot?: string;
      readonly pollMs?: number;
      readonly signal?: AbortSignal;
    }
    export interface WatchResult {
      readonly filePath: string | null;
      readonly status: "watched" | "no-runs";
    }
    export async function watchMostRecentRunLog(
      opts?: WatchOptions,
    ): Promise<WatchResult>;
    ```
  - [ ] 1.3 Default `runsRoot` resolves to `${STEPPER_INTERNAL_ROOT}/runs` (mirrors Story 2.5's `write-step.ts:55` constant); imports `STEPPER_INTERNAL_ROOT` from `../io/paths.ts` (foundational sibling per AR41).
  - [ ] 1.4 Default `pollMs` resolves to `250` (250ms — v0.1 conservative; Story 6.1 may surface as config knob).
  - [ ] 1.5 Optional `signal: AbortSignal` for testability — when supplied, the watcher's poll loop cancels on signal abort (the SIGINT handler internally drives this for the production path; tests pass `AbortController.signal` to drive deterministic cleanup).

- [ ] **Task 2 — Implement `findMostRecentRunLog` helper (AC: line 862)**
  - [ ] 2.1 Internal `async function findMostRecentRunLog(runsRoot: string): Promise<string | null>`:
    1. `try { await fs.stat(runsRoot); }` — if ENOENT, return null (the directory does not exist; fresh-project case).
    2. `const entries = await fs.readdir(runsRoot, { withFileTypes: true });`
    3. Filter: `entry.isFile() && entry.name.endsWith(".log") && !entry.name.endsWith(".bak")`. The `.log` suffix matches Story 2.5's writer path; the `.bak` exclusion catches atomicWrite's rotation siblings.
    4. For each candidate, `fs.stat(path.join(runsRoot, entry.name))` to fetch `mtimeMs`.
    5. Sort: `(a, b) => b.mtimeMs - a.mtimeMs || b.name.localeCompare(a.name)` — primary descending by mtime; tiebreaker descending by filename (lexically-greatest filename wins when mtimes equal).
    6. Return `candidates[0]?.fullPath ?? null`.
  - [ ] 2.2 The `.bak` exclusion handles Story 1.3's atomicWrite rotation: every transcript write produces a `.log` + a `.log.bak` rotation; the watcher must NEVER tail the `.bak` (it's a stale snapshot). The regex `/^.+\.log$/` would match `*.log.bak` (since `.log.bak` ends with `.bak`, NOT `.log`); the `endsWith(".log")` filter is precise.
  - [ ] 2.3 The `.json` sibling exclusion: Story 2.5 writes `<ts>-<step>.json` alongside `<ts>-<step>.log`; the `.json` files are JSON run-logs (single-object, not stream-friendly); `endsWith(".log")` filter excludes them naturally.
  - [ ] 2.4 The `.tmp` exclusion: atomicWrite uses `<target>.tmp` during the tmp+rename cycle; mid-write tmp files would be transiently visible. The `endsWith(".log")` filter excludes `.log.tmp`; safe.
  - [ ] 2.5 Edge case — directory entries: `entry.isFile()` filter excludes subdirectories (e.g., a future `runs/archive/` directory per Story 6.8); safe.

- [ ] **Task 3 — Implement Bun stream + TextDecoderStream + line buffer (AC: line 864, 868)**
  - [ ] 3.1 Internal `async function tailLineByLine(filePath: string, opts: { pollMs: number; signal?: AbortSignal }): Promise<void>`:
    1. **Initial read**: `const stat = await fs.stat(filePath); let offset = 0; const initialSize = stat.size;` Read from offset 0 to initialSize via `Bun.file(filePath).slice(0, initialSize).stream()`; pipe through `TextDecoderStream`; split on `\n`; emit each complete line via `process.stdout.write(line + "\n")`. Buffer trailing partial line (no terminating `\n`) into `partialLine: string`. Set `offset = initialSize`.
    2. **Poll loop**: `while (!opts.signal?.aborted) { await new Promise(r => setTimeout(r, opts.pollMs)); ... }`. In each iteration: `const stat = await fs.stat(filePath).catch(() => null);` — on null (ENOENT — file deleted/rotated), break + cleanup. On stat OK: if `stat.size > offset`, read `Bun.file(filePath).slice(offset, stat.size).stream()`, append to `partialLine`, split on `\n`, emit complete lines, retain trailing partial. Set `offset = stat.size`.
    3. **Cleanup**: emit final newline; release any open ReadableStream readers.
  - [ ] 3.2 The Bun stream reader pattern — Bun's `Bun.file(path).slice(start, end).stream()` returns a `ReadableStream<Uint8Array>`; pipe through `new TextDecoderStream()` for UTF-8 decode; iterate via `for await (const chunk of stream) { ... }`.
  - [ ] 3.3 Line splitter — accumulate decoded chunks in `buffer: string`; iterate `buffer.indexOf("\n")`; for each newline, split + emit; retain remaining unfinished line.
  - [ ] 3.4 v0.1 conservative: NO `\r\n` (CRLF) handling (the Story 2.5 writer emits LF-only per `write-step.ts:147`); CRLF support is forward-deferred to v6.x cross-platform tests.
  - [ ] 3.5 v0.1 conservative: NO encoding sniffing (UTF-8 only — Story 2.5's writer emits UTF-8); the markdown transcript is structurally UTF-8 per AR25.

- [ ] **Task 4 — Implement SIGINT handler + graceful cleanup (AC: line 864)**
  - [ ] 4.1 Inside `watchMostRecentRunLog(...)`, register the SIGINT handler BEFORE entering the poll loop:
    ```typescript
    const controller = new AbortController();
    const onSigint = () => {
      controller.abort();
    };
    process.on("SIGINT", onSigint);
    try {
      await tailLineByLine(filePath, { pollMs, signal: controller.signal });
    } finally {
      process.off("SIGINT", onSigint);
    }
    ```
  - [ ] 4.2 The `controller.abort()` flips `controller.signal.aborted` → `true`; the poll loop checks `opts.signal?.aborted` per iteration; the first abort exits the loop cleanly.
  - [ ] 4.3 The `finally` block removes the listener — preserves listener-cleanliness for downstream callers (tests calling `watchMostRecentRunLog` programmatically with `AbortController.signal` should NOT see leaked listeners).
  - [ ] 4.4 v0.1 conservative — graceful cleanup is sub-millisecond (no in-flight state writes; the poll is pure-read); the NFR-R5 30s budget for the loop runner Story 4.9 is irrelevant here.
  - [ ] 4.5 The runner-side `import.meta.main` block does NOT need a separate SIGINT handler — Bun runtime delivers SIGINT to the process; the listener inside `watchMostRecentRunLog` handles it; after the function returns (due to abort), the runner emits exit 0.
  - [ ] 4.6 Test G in `watch.test.ts` (Task 6.7) drives the SIGINT path via `AbortController.signal` — programmatically equivalent to a real SIGINT delivery; deterministic for tests.

- [ ] **Task 5 — Implement fresh-project edge case (AC: line 866-867)**
  - [ ] 5.1 At the top of `watchMostRecentRunLog(...)`:
    ```typescript
    const filePath = await findMostRecentRunLog(runsRoot);
    if (filePath === null) {
      process.stdout.write(
        "No run logs yet. Start a step with /bmad-next.\n",
      );
      return { filePath: null, status: "no-runs" };
    }
    ```
  - [ ] 5.2 The hint string is byte-identical to AC line 867 — `No run logs yet. Start a step with /bmad-next.` — followed by a single trailing newline (`\n`) per terminal-output convention.
  - [ ] 5.3 The exit code is implicitly 0 — the runner-side short-circuit returns `{ exitCode: 0, action: { action: "report", message: "no runs to watch (fresh project)" } }`; the `import.meta.main` block bypasses `emitDispatchAction` for `--watch` (Task 7.4) — the hint goes to stdout DIRECTLY.
  - [ ] 5.4 Edge case — directory exists but contains zero `*.log` files (e.g., only `*.json` siblings from a partial write that aborted between markdown + JSON writes; or only `*.bak` rotations). Same code path: `findMostRecentRunLog` returns null; the fresh-project hint emits.
  - [ ] 5.5 Edge case — directory exists with `*.log` files but ALL are zero-bytes. Not the fresh-project case (there ARE log files, just empty); the watcher proceeds with the most recent zero-bytes file; the initial read emits zero lines; the poll loop awaits the first append. Distinct from the fresh-project case.

- [ ] **Task 6 — Tests for `src/runs/watch.ts` (~10 cases) (AC: lines 862-868)**
  - [ ] 6.1 Create `src/runs/watch.test.ts` (mid-tier colocated test file per AR42). Each test uses `beforeEach` mkdtemp + `afterEach` rm pattern (Story 2.5 + Story 3.3 precedent).
  - [ ] 6.2 **Test A (empty-runs case — emits verbatim hint)**: tmpdir without any `_bmad-output/.stepper/runs/`; capture stdout; invoke `watchMostRecentRunLog({ runsRoot: tmp+"/runs" })`; assert `result.status === "no-runs"`; assert `result.filePath === null`; assert stdout contains `No run logs yet. Start a step with /bmad-next.\n` (exact byte match).
  - [ ] 6.3 **Test B (single file — opens, emits, polls)**: seed `tmp/runs/2026-05-01T120000-step.log` with content `"line1\nline2\n"`; capture stdout; invoke `watchMostRecentRunLog({ runsRoot: tmp+"/runs", signal: controller.signal })`; abort after 100ms; assert stdout contains `"line1\nline2\n"`.
  - [ ] 6.4 **Test C (most-recent-by-mtime selection)**: seed 3 files with different mtimes (set via `fs.utimes(...)` after write):
    - `2026-05-01T100000-old.log` mtime = T-3000ms
    - `2026-05-01T110000-mid.log` mtime = T-2000ms
    - `2026-05-01T120000-new.log` mtime = T-1000ms
    Each with distinct content `"old\n"` / `"mid\n"` / `"new\n"`; invoke `watchMostRecentRunLog`; assert stdout starts with `"new\n"` (the latest-mtime file content).
  - [ ] 6.5 **Test D (tie-breaker by filename descending)**: seed 2 files with EQUAL mtimes:
    - `2026-05-01T100000-aaa.log` mtime = T-1000ms
    - `2026-05-01T100000-zzz.log` mtime = T-1000ms (same mtime via fs.utimes)
    Each with distinct content; invoke; assert stdout starts with the `zzz` file's content (lexically-greatest filename wins).
  - [ ] 6.6 **Test E (append-detection)**: seed `tmp/runs/<ts>-step.log` with `"initial\n"`; spawn the watcher in the background (resolved Promise); 50ms later, append `"appended\n"` via `fs.appendFile`; abort after 200ms total; assert stdout contains BOTH `"initial\n"` and `"appended\n"` in order.
  - [ ] 6.7 **Test F (partial-line buffering)**: seed `tmp/runs/<ts>-step.log` with empty content; spawn watcher; 30ms later, append `"abc"` (no newline); 60ms later, append `"def\n"`; abort at 200ms; assert stdout contains exactly `"abcdef\n"` (single combined line, not `"abc\n"` then `"def\n"`).
  - [ ] 6.8 **Test G (SIGINT cleanup via AbortController)**: seed a single log file; spawn watcher with `AbortController`; assert the SIGINT listener IS registered (`process.listenerCount("SIGINT")` increments by 1); call `controller.abort()`; assert the function resolves cleanly within 300ms (well under NFR-R5's 30s budget); assert the SIGINT listener IS removed (`process.listenerCount("SIGINT")` returns to baseline).
  - [ ] 6.9 **Test H (skip non-`*.log` entries)**: seed:
    - `tmp/runs/<ts>-step.log` (ACTIVE)
    - `tmp/runs/<ts>-step.json` (sibling)
    - `tmp/runs/<ts>-step.log.bak` (rotation)
    - `tmp/runs/archive/` (directory)
    Invoke; assert the `*.log` is selected (not `.json` / `.bak` / directory).
  - [ ] 6.10 **Test I (file deletion mid-watch)**: seed log file; spawn watcher; 50ms later, `fs.unlink(filePath)`; assert watcher exits gracefully (does NOT throw; returns or aborts cleanly); assert exit-time stderr emit (e.g., `info("watch: transcript rotated/deleted; exiting")`); assert no thrown error reaches the test's awaiter.
  - [ ] 6.11 **Test J (lock-free invariant via source-content scan)**: programmatic source-content scan of `src/runs/watch.ts`; reject patterns: `from "../lock/"`, `acquire(`, `loadState(`, `loadStateUnlocked(`, `recomputeState(`, `recomputeStateUnlocked(`. Mirrors the Story 3.8 Test G pattern.
  - [ ] 6.12 Each test follows AR35 tmpdir-per-test discipline; uses a colocated `beforeEach`/`afterEach` factory.

- [ ] **Task 7 — Replace the Story 2.4 placeholder in `src/commands/next/run.ts` (AC: line 862-868)**
  - [ ] 7.1 Identify the insertion site at `src/commands/next/run.ts:1336-1340`. The current placeholder is a forward-deferral guard inside "Step 3: forward-deferral guards" returning `haltWithHint(1, "Run /bmad-next --doctor instead; --watch is implemented in Story 3.9 (Epic 3).")`. Story 3.9 REPLACES the guard with a streaming-mode call.
  - [ ] 7.2 **Reposition the short-circuit**: move the `args.watch` branch OUT of "Step 3: forward-deferral guards" (which is hard-halt territory) and INTO a new position AFTER `--doctor` (Step 5) and BEFORE `--export-state` (Step 6 first branch). The route comment at `run.ts:1400-1402` updates to: `// --doctor → --watch → --export-state → --diff-state → --explain → --list → --dry-run → fall-through to dispatch path.` Document the route change in the JSDoc.
  - [ ] 7.3 The `--watch` short-circuit body:
    ```typescript
    if (args.watch) {
      // Story 3.9 (epic AC lines 862-868): replace the Story 2.4 forward-
      // deferral guard with the most-recent-transcript live tail per FR42.
      //
      // SPECIAL CASE per FR42 + FR54 + architecture §line 524 + §line 862:
      // BYPASS the AR9 wrapper; raw transcript content streams to stdout.
      // The runner returns a structural `report` action for testability;
      // the `import.meta.main` block detects `args.watch === true` and
      // SKIPS `emitDispatchAction`. The watcher itself emits raw lines
      // via `process.stdout.write` from inside its loop.
      const watchResult = await watchMostRecentRunLog({
        ...(opts?.runsRoot !== undefined ? { runsRoot: opts.runsRoot } : {}),
        ...(opts?.watchPollMs !== undefined ? { pollMs: opts.watchPollMs } : {}),
        ...(opts?.watchSignal !== undefined ? { signal: opts.watchSignal } : {}),
      });
      const message =
        watchResult.status === "no-runs"
          ? "no runs to watch (fresh project)"
          : `watch session ended (${watchResult.filePath})`;
      return reportWithMessage(message);
    }
    ```
  - [ ] 7.4 **`import.meta.main` block special-case for `--watch`**: AFTER `runNext()` returns, check whether `args.watch === true` (or scan `process.argv` for `--watch`); if so, **DO NOT** call `emitDispatchAction(result.action)` — the watcher already emitted its content via raw stdout writes. Just `process.exit(result.exitCode)`. Add a `wasWatchRequested(argv): boolean` argv-scan helper near `wasExportStateRequested` at run.ts:~1928. Mirrors Story 3.8 Task 6.4 pattern.
  - [ ] 7.5 AR9 invariants: every OTHER flag preserves AR9 strictly. `--watch` is the SECOND documented SPECIAL CASE (after Story 3.8's `--export-state`). Document the carve-out in `run.ts` JSDoc + `src/runs/watch.ts` JSDoc. The `runNext` return value still uses the `report` shape for testability.
  - [ ] 7.6 Read-only / lock-free posture: the `--watch` branch does NOT call `loadStateUnlocked`, does NOT call any `src/lock/` API, does NOT touch `state.yaml`. ZERO state interaction; ZERO lock acquisition. The structurally-lock-free contract per architecture §line 1672 + AR8 is preserved.
  - [ ] 7.7 Route-order precedence: `--watch + --diff-state` → `--watch` wins (the route order places `--watch` before `--export-state`/`--diff-state` per Task 7.2). `--watch + --doctor` → `--doctor` wins (the route order places `--doctor` BEFORE `--watch`). `--watch + --explain` / `--watch + --list` / `--watch + --dry-run` → `--watch` wins. `--watch + --export-state` → `--watch` wins. Tests verify all combos in Task 8.

- [ ] **Task 8 — Run.ts colocated tests (AC: line 862-868)**
  - [ ] 8.1 Edit `src/commands/next/run.test.ts` to APPEND a new `describe` block: `"runNext — Story 3.9 --watch live transcript tail"`. Reuse module-level `beforeEach`/`afterEach` + `commonOpts`/`writeMinimalState` factories.
  - [ ] 8.2 **Test case A (`--watch` short-circuit invokes `watchMostRecentRunLog`)** — seed an empty `runs/` directory; invoke `runNext` with `argv: ["--watch"]`; assert (a) `result.exitCode === 0`, (b) `result.action.action === "report"`, (c) `result.action.message` contains `"no runs to watch"` OR `"watch session ended"`.
  - [ ] 8.3 **Test case B (route order — `--watch + --diff-state` → watch wins)** — seed a single log file + valid state; invoke with `argv: ["--watch", "--diff-state"]` AND a watchSignal that aborts after 100ms; assert `result.action.message` is the watch-summary message (NOT the `--diff-state` divergence report).
  - [ ] 8.4 **Test case C (route order — `--doctor + --watch` → doctor wins)** — invoke with `argv: ["--doctor", "--watch"]`; assert `result.action.message` is the doctor diagnostic (NOT the watch-summary); the `--doctor` short-circuit at `run.ts:1380-1396` fires FIRST.
  - [ ] 8.5 **Test case D (no-lock invariant)** — spy on `acquire` from `src/io/lock.ts`; invoke with `argv: ["--watch"]` (with abortSignal to terminate cleanly); assert `acquire` was NEVER called.

- [ ] **Task 9 — Integration test for fresh-project case (AC: line 866-867)**
  - [ ] 9.1 Create `src/integration/watch-fresh-project.test.ts` (modelled on Story 3.3's `dry-run-no-writes.test.ts` + Story 3.8's `export-state-no-lock.test.ts` spawn pattern). `beforeEach` mkdtemp; `afterEach` rm. Single test (or 2 if covering empty-dir + missing-dir distinctly).
  - [ ] 9.2 Spawn `bun run src/commands/next/run.ts -- --watch` against an empty tmpdir (no `_bmad-output/.stepper/runs/` directory); capture stdout; assert (a) stdout equals exactly `No run logs yet. Start a step with /bmad-next.\n` (byte-identical), (b) exit code === 0, (c) no FS writes (no transcript files / no `state.yaml.tmp` / no lock files).
  - [ ] 9.3 (Optional second test) Spawn against a tmpdir with `_bmad-output/.stepper/runs/` existing but EMPTY; assert same stdout + exit code.
  - [ ] 9.4 FR52 invariant: assert no lock dir at `tmp/_bmad-output/.stepper/state.yaml.lock` (the `--watch` path is structurally lock-free; the integration test enforces structurally).
  - [ ] 9.5 FR54 invariant: assert stdout content is the verbatim hint string (raw — NOT wrapped in AR9 JSON). The test's `JSON.parse(stdout)` would FAIL (the hint is plain text); this is the SECOND documented FR54 carve-out (after Story 3.8's `--export-state`).
  - [ ] 9.6 Forward-defer to v6.x: SIGINT integration test against a populated transcript with append events. v0.1 Story 3.9's integration test asserts only the fresh-project edge per AC line 866-867; the SIGINT timing test lives in `src/runs/watch.test.ts` Test G (colocated, deterministic via AbortController).

- [ ] **Task 10 — SIGINT timing test (AC: line 864)**
  - [ ] 10.1 Test G in `src/runs/watch.test.ts` (Task 6.7) covers the SIGINT path via AbortController.signal. The test:
    1. Captures the baseline `process.listenerCount("SIGINT")`.
    2. Seeds a single log file.
    3. Spawns the watcher with `AbortController.signal`.
    4. Asserts `process.listenerCount("SIGINT")` increments by 1 inside the watcher's poll loop.
    5. Calls `controller.abort()`.
    6. Awaits the watcher's promise; assert it resolves within 300ms (well under NFR-R5's 30s budget — the watcher cleanup is sub-millisecond).
    7. Asserts `process.listenerCount("SIGINT")` returns to baseline (the listener was removed in the `finally` block per Task 4.3).
  - [ ] 10.2 v0.1 conservative: drives via AbortController for deterministic test timing. Real SIGINT delivery via `process.kill(process.pid, "SIGINT")` is FORBIDDEN in tests (would kill the test runner); the AbortController-bridged path is functionally equivalent for v0.1.
  - [ ] 10.3 Forward-defer: a sibling integration test invoking the spawned subprocess + `process.kill(child.pid, "SIGINT")` is a v6.x deliverable for end-to-end SIGINT validation; v0.1 stays at the AbortController-bridged unit test.

- [ ] **Task 11 — Update sprint-status.yaml + record completion (AC: all)**
  - [ ] 11.1 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: flip `3-9-watch-live-transcript-tail` from `backlog` (current) to `ready-for-dev` (this Story 3.9 create-story step). At story completion (Step 9 of bmad-dev-story workflow), flip to `review` (intermediate `in-progress` during dev). `epic-3: in-progress` is preserved.
  - [ ] 11.2 Flip the story file frontmatter `status: ready-for-dev → review` at end of bmad-dev-story workflow per the workflow's Step 9 contract. (At create-story time, the value is `ready-for-dev`.)
  - [ ] 11.3 sprint-status.yaml retains its original schema (no new fields).

- [ ] **Task 12 — Run the full test suite + `bun run check` (AC: all)**
  - [ ] 12.1 `bun run check` exit 0. Test delta projection: ~+13-15 tests (Tests A-J in `watch.test.ts` + Tests A-D in `run.test.ts` + 1-2 integration tests), ~+30-50 expects.
  - [ ] 12.2 Post-Story-3.9 baseline projection: ~706-708 pass / 0 fail / ~2604-2624 expects / 55 files (2 new test files: `watch.test.ts`, `watch-fresh-project.test.ts`).
  - [ ] 12.3 Confirm `src/errors.ts` registry stays at **16 codes** (`bun test src/errors.test.ts`: 10 pass, 197 expects). Story 3.9 ships ZERO new error classes.
  - [ ] 12.4 Confirm `bunx tsc --noEmit` exits 0.
  - [ ] 12.5 Confirm AR41 boundary check at `run.test.ts:606-638` still passes — Story 3.9 adds ONE new mid-tier sibling import `import { watchMostRecentRunLog } from "../../runs/watch.ts";` (mid-tier sibling; allowed per AR41); the boundary check passes after a targeted update.

## Dev Notes

### File List

#### Modified Files

- **`src/commands/next/run.ts`** (~1971 → ~2010-2030 lines):
  - Removes the Story 2.4 `--watch` forward-deferral guard at `run.ts:1336-1340`.
  - Adds a NEW `--watch` short-circuit at the top of "Step 6: read-only flag handling" (BEFORE `--export-state`, AFTER `--doctor`) per Task 7.2-7.3.
  - Adds 1 new top-of-file mid-tier import: `import { watchMostRecentRunLog } from "../../runs/watch.ts";`.
  - Adds the `import.meta.main` block special-case for `--watch` (~10 lines) per Task 7.4 + a new `wasWatchRequested(argv): boolean` argv-scan helper.
  - Updates the route-order JSDoc at `run.ts:1400-1402` to reflect the new ordering: `--doctor → --watch → --export-state → --diff-state → --explain → --list → --dry-run → fall-through to dispatch path`.

- **`src/commands/next/run.test.ts`** (~3530 → ~3610-3640 lines):
  - APPENDS a new `describe("runNext — Story 3.9 --watch live transcript tail", ...)` block with 3-4 colocated test cases per Task 8.
  - May UPDATE the AR41 boundary check at lines 606-638 to enumerate the new mid-tier import (`../../runs/watch.ts`).
  - Pre-existing tests asserting the Story 2.4 placeholder hint string `"--watch is implemented in Story 3.9"` may need UPDATING to assert the Story 3.9 actual outputs. (Note: the Story 2.4 placeholder is structured as a `haltWithHint(1, "...")`; the test was likely added in Story 1.7 or 2.4; check `run.test.ts` for the specific test case asserting the placeholder string.)

- **`src/runs/index.ts`** (MAY MODIFY, +~3 lines): re-export `watchMostRecentRunLog` + `WatchOptions` + `WatchResult` from the existing barrel (mirrors Story 2.5's barrel pattern). Optional — the runner imports the function directly from `../runs/watch.ts`; the barrel re-export is for downstream consumer convenience.

#### New Files

- **`src/runs/watch.ts`** (~150-180 lines): the `watchMostRecentRunLog({...}): Promise<WatchResult>` helper per Task 1-5. Mid-tier module per AR41. Composes `findMostRecentRunLog + tailLineByLine + sigintHandler`. Pure / async; no I/O writes; lock-free.
- **`src/runs/watch.test.ts`** (~200-280 lines): 10 colocated test cases per Task 6.
- **`src/integration/watch-fresh-project.test.ts`** (~80-120 lines): the AC-line-866-867 enforcement test per Task 9.

#### Sprint-Status

- **`_bmad-output/implementation-artifacts/sprint-status.yaml`**: flip `3-9-watch-live-transcript-tail: backlog → ready-for-dev` (at create-story time). Confirm `epic-3: in-progress` (already set by Story 3.1).

### Architecture Compliance

- **AR8** (lock-free `run.ts` / lock-held `verify-and-advance.ts`): UNCHANGED. The watcher is structurally lock-free; `run.ts` is unchanged in lock posture.
- **AR9** (single discriminated-union JSON line on stdout): EXTENDED with a SECOND SPECIAL CASE (after Story 3.8's `--export-state`). `--watch` BYPASSES the AR9 wrapper entirely; raw transcript content streams to stdout. Documented in `run.ts` JSDoc + the new `src/runs/watch.ts` JSDoc.
- **AR11** (`state.yaml` at canonical path): UNCHANGED — the watcher does NOT read `state.yaml`.
- **AR21 + AR22** (errors carry code + actionable hint): UNCHANGED. ZERO new error classes.
- **AR25** (markdown transcript per step): CONSUMED. The watcher reads the markdown transcript verbatim; ZERO mutations.
- **AR26** (JSON run-log per step): NOT CONSUMED. The watcher targets `*.log` files only.
- **AR33** (function & error semantics; throw not Result; no console.\*; async/await): EXTENDED. The watcher is async; throw not Result; stdout writes use `process.stdout.write` (canonical primitive per architecture §line 862); ZERO `console.*` calls.
- **AR41** (boundary graph): UNCHANGED + EXTENDED. The new `src/runs/watch.ts` is mid-tier; imports `node:fs/promises` (stdlib) + `Bun.file` (runtime) + `STEPPER_INTERNAL_ROOT` from `src/io/paths.ts` (foundational sibling). The runner-side AR41 boundary check at `run.test.ts:606-638` continues to pass; Story 3.9's mid-tier sibling import (`../../runs/watch.ts`) is explicitly allowed.
- **AR42** (test discipline): EXTENDED. New colocated `src/runs/watch.test.ts` + integration test `src/integration/watch-fresh-project.test.ts`. Each new module has its colocated `*.test.ts` per AR42.

### Acceptance Criteria Mapping

- **AC line 862-864** (`src/transcript/watch.ts` finds the most recent `runs/<ts>-<step>.log` → `--watch` runs → file is tailed line-by-line until SIGINT): delivered by **Tasks 1 + 2 + 3 + 4 + 7**. Test cases B-G in `watch.test.ts` (Task 6) + Test case A in `run.test.ts` (Task 8.2) verify each component. **NOTE**: AC source path `src/transcript/watch.ts` is stale wording — the actual landing path is `src/runs/watch.ts` per Story 2.5's directory rename; documented in §Open Question 2.
- **AC line 866-867** (no run logs yet → emits `No run logs yet. Start a step with /bmad-next.` and exits 0): delivered by **Task 5**. Test case A in `watch.test.ts` (Task 6.2) + the integration test (Task 9.2) verify byte-identity.
- **AC line 868** (tail uses Bun's stream APIs (no external `tail` dep)): delivered by **Task 3**. The watcher uses `Bun.file().stream()` + `TextDecoderStream` + line-buffer; ZERO `child_process.spawn("tail")`-style invocations; ZERO `node:tty` or external-binary dependencies. Verified by source-content scan in Test J (Task 6.11).

### v0.1 Design Decisions

#### `src/runs/watch.ts` vs `src/transcript/watch.ts` (path-rename)

The AC source at epics.md line 862 references `src/transcript/watch.ts`; the architecture §line 1216 + §line 1372 lists the canonical home as `src/transcript/watch.ts`. **However**, Story 2.5 RENAMED the `src/transcript/` directory to `src/runs/` (per state.yaml evidence — `src/runs/{build-run-log,render-markdown,write-step,index,types}.ts` with no `src/transcript/` directory present in the filesystem). Story 3.9 lands the new module at **`src/runs/watch.ts`** to align with the established Story 2.5 convention. **Trade-off**: AC-source-strict would force re-creating `src/transcript/` as a sibling-only-for-`watch.ts` directory (path-fragmented); convention-strict aligns with Story 2.5's existing layout. v0.1 chooses convention-strict; tracked as Open Question 2.

#### `--watch` BYPASSES AR9 wrapper (FR54 carve-out — SECOND SPECIAL CASE)

Per FR42 + FR54 + architecture §line 524 + §line 862, the `--watch` raw transcript stream goes to stdout DIRECTLY (NOT wrapped in the AR9 line). Mirrors Story 3.8's `--export-state` SPECIAL CASE precedent — AR9 is preserved STRICTLY for every flag EXCEPT `--export-state` (Story 3.8) AND `--watch` (Story 3.9). **Rationale**: the streaming-mode requirement is structurally incompatible with the single-JSON-line AR9 invariant; the `--watch` content is line-by-line text (the markdown transcript verbatim), not a discriminated-union action object; pre-buffering the entire transcript until SIGINT defeats the streaming intent. The carve-out is bounded — every OTHER read-only flag preserves AR9. v0.1 documents the carve-out in `run.ts` JSDoc + `src/runs/watch.ts` JSDoc + §Open Question 1.

The `runNext` function STILL returns `{ action: "report", message: "<watch summary>", exitCode: 0 }` for testability (tests inspect `result.action.message`); only the process-level emit is special-cased.

#### Polling vs `node:fs/promises#watch` for append detection

Two options for detecting transcript appends:
- **Option A (polling)**: `setInterval(async () => { const stat = await fs.stat(...); if (stat.size > offset) { ... } }, 250);`
- **Option B (FS watcher)**: `for await (const event of watch(filePath)) { ... }` — Bun's wrapper around inotify/FSEvents.

**v0.1 conservative chooses Option A (polling)** — `node:fs/promises#watch` has cross-platform inconsistencies (macOS uses FSEvents, Linux uses inotify; Bun's coverage of edge cases like file-rotation is incomplete); a 250ms poll delivers acceptable freshness with deterministic behaviour across all 3 platforms. **Trade-off**: polling has a fixed 250ms latency floor; FS watcher could deliver sub-10ms freshness. v0.1 chooses determinism; Story 6.x may switch to FS watcher with platform-specific fallbacks. Tracked as Open Question 3.

#### Hard-coded poll interval (250ms) vs config knob

v0.1 hard-codes `pollMs: 250` (250ms). **Rationale**: deterministic for tests; matches typical transcript-write cadence (Story 2.5's writer is invoked once per step — minutes apart, not milliseconds; 250ms poll is overkill for the typical case but bounds latency for high-frequency tail scenarios). Story 6.1 (config-loader) may surface as `bmad-stepper.config.yaml watch.pollMs` — forward-compatible. Tracked as Open Question 4.

#### Most-recent selection: mtime descending + filename-descending tiebreaker

Per AC line 862 ("the most recent `runs/<ts>-<step>.log`"). Two interpretations:
- **By mtime**: filesystem modification time (the file most recently written/touched).
- **By filename `<ts>` prefix**: the lexically-greatest filename (assuming the `<ts>-<step>.log` convention from Story 2.5).

**v0.1 conservative chooses BOTH (mtime primary, filename tiebreaker)** — the typical case has matching mtime + filename order (Story 2.5 writes files in `<ts>` order); the tiebreaker handles edge cases where multiple files were written in the same wall-clock second. **Trade-off**: pure-mtime selection misses cases where a file's mtime was reset (e.g., `git checkout` of a tracked file); pure-filename misses cases where the `<ts>` prefix was absent (test fixtures). v0.1 chooses the union for robustness; Story 6.x may surface as `bmad-stepper.config.yaml watch.selector`.

#### SIGINT handler via `AbortController` (testability)

Per AR33 + Test G testability requirement. Two options:
- **Option A (raw `process.on('SIGINT', ...)`)**: register the listener directly; the test triggers via `process.kill(process.pid, 'SIGINT')`. **Rejected**: `process.kill(process.pid, 'SIGINT')` would kill the test runner (Bun's default SIGINT handler).
- **Option B (`AbortController.signal` bridged from `process.on('SIGINT', () => controller.abort())`)**: register a SIGINT listener that flips the AbortController; the watcher checks `signal.aborted` per poll iteration. Tests pass an AbortController directly via the `signal` option; production wiring uses the bridged listener.

**v0.1 conservative chooses Option B (bridged AbortController)** — testability + cleanness (AbortController is the modern signal-cancellation primitive); the bridge is ~3 lines of code; tests drive deterministically without process-level signal machinery. Tracked as Open Question 5.

#### Fresh-project hint exit code: 0 (success) vs 2 (no-op)

Per AC line 867 ("exits 0"). The fresh-project case is a VALID success state (the user simply hasn't run a step yet); not a configuration error (which would be exit code 2). v0.1 conservative emits exit code 0 + the friendly hint; the user understands the state without parsing exit codes. **Trade-off**: exit code 2 would let CI scripts distinguish "no transcripts" from "watch ran successfully"; exit code 0 makes `--watch` always exit 0 (modulo SIGINT-with-error edge cases). v0.1 chooses 0 per AC strict.

#### File deletion mid-watch: graceful exit 0 vs halt with error

Per Test I (Task 6.10). Two options:
- **Option A (graceful exit 0)**: detect ENOENT on `fs.stat(...)`; emit a stderr warn; exit 0.
- **Option B (halt with TRANSCRIPT_DELETED error)**: throw a new `TranscriptDeletedError`; the runner translates to `action: "halt"` exit code 1.

**v0.1 conservative chooses Option A (graceful exit 0)** — the file-rotation case (Story 6.8 archive cycle) is a legitimate operational state, not a user-facing error; exit 0 with a stderr warn lets CI scripts continue without distinguishing the case from normal SIGINT. Story 6.8 may revisit. Tracked as Open Question 6.

### Carry-overs from Story 3.8

- **Story 3.8's AR9 SPECIAL-CASE precedent**: Story 3.9 inherits the bypass-AR9-for-streaming-modes pattern. The `--export-state` carve-out (Story 3.8) and the `--watch` carve-out (Story 3.9) are the TWO documented exceptions; every other flag preserves AR9 strictly.
- **Story 3.8's `wasExportStateRequested` argv-scan helper**: STRUCTURAL TEMPLATE for `wasWatchRequested` per Task 7.4. Same pattern: substring match for the flag name; runs in the `import.meta.main` block to decide whether to bypass `emitDispatchAction`.
- **Story 3.8's read-only / lock-free posture**: PRESERVED. Story 3.9's helper is purely additive; no lock; no state writes.
- **Story 3.8's integration-test pattern (`export-state-no-lock.test.ts`)**: STRUCTURAL TEMPLATE for `watch-fresh-project.test.ts` per Task 9. Same spawn + capture stdout + assert exit-code pattern.

### Carry-overs from Story 3.7

- **Story 3.7's `report` action multi-line `message` pattern**: NOT INHERITED. Story 3.9's `--watch` raw stdout stream BYPASSES the `report` action entirely (the testability path returns a single-line summary in `message`, but the production process emit is raw stdout). The pattern divergence is documented in §Open Question 1.
- **Story 3.7's deterministic sort discipline**: PARTIALLY INHERITED. The `findMostRecentRunLog` helper sorts candidates deterministically (mtime descending, filename descending tiebreaker); same pattern as Story 3.7's `--list` candidate ordering.

### Carry-overs from Story 3.3

- **Story 3.3's read-only / lock-free posture**: RESPECTED. Story 3.9's helper is structurally lock-free.
- **Story 3.3's `dry-run-no-writes.test.ts` pattern**: REUSED. Story 3.9's `watch-fresh-project.test.ts` mirrors the spawn + capture + assert structure.

### Carry-overs from Story 2.5

- **Story 2.5's `RUNS_ROOT` constant** (`${STEPPER_INTERNAL_ROOT}/runs`): REUSED VERBATIM. Story 3.9's `findMostRecentRunLog` defaults `runsRoot` to the same path. The watcher reads the markdown transcript files written by Story 2.5's `writeStepTranscript`.
- **Story 2.5's `<ts>-<step>.log` filename convention**: CONSUMED. The watcher's filename-descending tiebreaker assumes the convention; safe per Story 2.5's `deriveTimestamp` + `sanitiseStepName` helpers.
- **Story 2.5's directory rename `src/transcript/` → `src/runs/`**: INHERITED. Story 3.9's new module lands at `src/runs/watch.ts` (NOT `src/transcript/watch.ts`); see §Open Question 2.

### Carry-overs from Story 2.4

- **Story 2.4's placeholder `--watch` forward-deferral guard**: REPLACED. Story 3.9 swaps in the new helper invocation + repositions the short-circuit from "Step 3: forward-deferral guards" to a new position between `--doctor` and `--export-state`.
- **Story 2.4's read-only-flag route order**: EXTENDED. New ordering: `--doctor → --watch → --export-state → --diff-state → --explain → --list → --dry-run → fall-through to dispatch path`.

### Carry-overs from Story 1.7

- **Story 1.7's `watch: z.boolean().default(false)` declaration** at `args.ts:166` + listing in `booleanKeys` set at `args.ts:222`: REUSED. **No args change needed for Story 3.9.**

### Forward Dependencies

- **Story 3.10 (`--non-locking-read-flags`)**: TANGENTIAL. Story 3.10's `skipAcquire: boolean` flag wiring on `src/io/lock.ts`'s `acquire()` API enumerates `--export-state`, `--list`, `--explain`, `--dry-run`, `--diff-state` as the FIVE read-only flags that skip lock acquisition. **Note**: `--watch` is NOT in 3.10's enumeration (epics.md line 873) — it's structurally lock-free without an opt-in. Forward-coupling is documentation-only.
- **Story 4.1 (`/bmad-loop` Command Skeleton)**: SECONDARY CONSUMER. The loop runner emits transcript files per iteration; users may run `/bmad-next --watch` in a separate terminal to monitor the loop's progress. Story 4.1 does NOT change the watcher's contract.
- **Story 4.9 (SIGINT Graceful Exit)**: PRIMARY DOWNSTREAM. Story 4.9 wires the loop runner's NFR-R5 30s budget for in-flight sub-agent + state write. Story 3.9's watcher's sub-millisecond cleanup is unrelated; the watcher's SIGINT handler is purely about closing the readstream + removing the listener.
- **Story 6.1 (`bmad-stepper.config.yaml` Schema Loader)**: SECONDARY CONSUMER. May surface `watch.pollMs` (default 250) + `watch.selector` (default `most-recent`) as config knobs.
- **Story 6.8 (Auto-archival of runs and telemetry)**: PRIMARY DOWNSTREAM. Story 6.8's 90-day archive rotation may move transcript files mid-watch; the v0.1 watcher detects via ENOENT + exits gracefully (Test I + §Open Question 6). Story 6.8 may extend with auto-follow-rotated-file semantics.
- **Story 6.x (concurrent multi-watcher coordination)**: TERTIARY. Two simultaneous `--watch` invocations against the same transcript file are safe in v0.1 (read-only access; OS allows multiple readers); v6.x may add coordinated-tail semantics.

### Previous Story Intelligence

This story builds on:

- **Story 1.7 (CLI Argument Parser)** — declared `watch: z.boolean().default(false)` on `NextArgsSchema`. Story 3.9 inherits verbatim.
- **Story 2.4 (`run.ts` lock-free runner)** — established the `--watch` forward-deferral guard at `run.ts:1336-1340`. Story 3.9 REPLACES + REPOSITIONS the short-circuit.
- **Story 2.5 (markdown transcript + JSON run-log writers)** — established the `_bmad-output/.stepper/runs/<ts>-<step>.log` writer paths. Story 3.9's watcher consumes these paths verbatim.
- **Story 3.3 (`--dry-run` Flag)** — established read-only / lock-free posture for diagnostic flags + the integration-test `dry-run-no-writes.test.ts` spawn pattern. Story 3.9 inherits both.
- **Story 3.6 (`--explain` Reasoning Trace)** — established the multi-line `\n`-joined `message` pattern. NOT INHERITED — Story 3.9's stream-mode bypass diverges.
- **Story 3.7 (`--list` Candidate Next Steps)** — established the deterministic-sort discipline. Story 3.9's `findMostRecentRunLog` sort follows the same pattern.
- **Story 3.8 (`--diff-state` and `--export-state`)** — established the AR9 SPECIAL-CASE precedent for the `--export-state` raw stdout JSON emission. Story 3.9 follows the same pattern for `--watch` raw stdout streaming. Story 3.8 also established the `wasExportStateRequested` argv-scan helper which Story 3.9 mirrors as `wasWatchRequested`.

Story 3.9 does NOT consume from:

- Stories 1.1-1.6, 1.8-1.13 (repo scaffold, errors module, logger, lock, schemas, state subsystem, branch detection, BMAD detection, DAG, persona resolution, doctor, quick-start docs) — independent prerequisites.
- Stories 2.1, 2.2, 2.3, 2.6, 2.7, 2.8 (verifier registry, dispatch-spec generator, sub-agent markdown, verify-and-advance, Layer 1 markdown, smoke test) — Story 3.9 doesn't touch these surfaces.
- Stories 3.1, 3.2, 3.4, 3.5 (halt-recovery, resume, scope flags, persona override) — no shared surface.

### Open Questions for Code Review

1. **Should `--watch` BYPASS the AR9 wrapper entirely (FR42-streaming-friendly) or use a streaming-mode AR9 variant (AR9-strict)?** v0.1 chooses BYPASS per FR42 + FR54 + architecture §line 524 + §line 862; the stream-mode is structurally incompatible with single-JSON-line AR9. The carve-out is the SECOND documented exception (after Story 3.8's `--export-state`); every OTHER flag preserves AR9 strictly. **Trade-off**: BYPASS = matches the streaming intent + low-latency line emission; AR9-strict = uniform but forces buffering until SIGINT (defeats streaming). v0.1 chooses BYPASS; documented in `run.ts` JSDoc + `src/runs/watch.ts` JSDoc.

2. **Should the new module land at `src/transcript/watch.ts` (AC-source-strict) or `src/runs/watch.ts` (Story 2.5-convention-strict)?** v0.1 chooses `src/runs/watch.ts` per Story 2.5's directory rename — `src/transcript/` does NOT exist; recreating it for ONE file would fragment the layout. The AC source path wording is stale relative to the actual filesystem; the watcher's INTENT (FR42 + line-by-line tail + SIGINT + fresh-project hint + Bun streams) is preserved. **Trade-off**: AC-source-strict = byte-identical to AC wording; convention-strict = aligned with existing layout. v0.1 chooses convention; tracked here for code-review adjudication.

3. **Should append detection use polling (250ms) or `node:fs/promises#watch` (FS watcher)?** v0.1 chooses polling per cross-platform determinism + Bun coverage edge cases. **Trade-off**: polling = 250ms latency floor; FS watcher = sub-10ms freshness but inconsistent across macOS/Linux. v0.1 chooses determinism; Story 6.x may switch.

4. **Should the poll interval be hard-coded (250ms) or surfaced as a config knob?** v0.1 hard-codes per simplicity. Story 6.1 (config-loader) may surface as `bmad-stepper.config.yaml watch.pollMs`. **Trade-off**: hard-coded = simpler test fixtures; config knob = user customisation. v0.1 chooses simplicity; tracked here for code-review adjudication.

5. **Should the SIGINT handler use raw `process.on('SIGINT', ...)` or AbortController.signal bridged from a SIGINT listener?** v0.1 chooses the bridged AbortController per testability (raw SIGINT delivery via `process.kill(...)` would kill the test runner). **Trade-off**: bridged = clean testability + modern primitive; raw = direct. v0.1 chooses bridged; tracked here.

6. **Should file deletion mid-watch be a graceful exit 0 or a halt with `TRANSCRIPT_DELETED` error code?** v0.1 chooses graceful exit 0 + stderr warn — the file-rotation case (Story 6.8 archive cycle) is a legitimate operational state. **Trade-off**: graceful = aligns with Story 6.8 forward-compat; halt = surfaces as user-facing error. v0.1 chooses graceful; tracked here.

7. **Should the most-recent selection use mtime descending only, or mtime + filename-descending tiebreaker?** v0.1 chooses BOTH (mtime primary, filename tiebreaker) for robustness. **Trade-off**: mtime-only = simpler; mtime+tiebreaker = handles same-second writes. v0.1 chooses robust; tracked here.

8. **Should the `--watch` short-circuit be repositioned from "Step 3: forward-deferral guards" to a new position between `--doctor` and `--export-state`?** v0.1 chooses repositioning per Task 7.2 — the previous Story 2.4 placement was a hard-halt; Story 3.9 needs a streaming-mode position. The new ordering: `--doctor → --watch → --export-state → --diff-state → --explain → --list → --dry-run → fall-through to dispatch path`. **Trade-off**: repositioning = correct routing; original-position = preserves Story 2.4's structure (but the structure was a placeholder). v0.1 chooses repositioning; tracked here.

## Dev Agent Record

### Context Reference

- `_bmad-output/implementation-artifacts/3-9-watch-live-transcript-tail.md` (this file)
- `src/runs/watch.ts` (NEW — watcher helper)
- `src/runs/watch.test.ts` (NEW — colocated unit tests)
- `src/integration/watch-fresh-project.test.ts` (NEW — integration test)
- `src/runs/index.ts` (MAY MODIFY — barrel re-export)
- `src/commands/next/run.ts` (MODIFIED — replace + reposition `--watch` short-circuit at lines 1336-1340; add `import.meta.main` special-case for `--watch`)
- `src/commands/next/run.test.ts` (MODIFIED — append Story 3.9 describe block)

### Agent Model Used

Opus 4.7 (1M context) — bmad-dev-story sub-agent for Story 3.9 (1M-context variant per BMAD `dev` agent skill).

### Debug Log References

- `bun test 2>&1 | tail -3` — 711 pass / 0 fail / 2644 expects / 55 files (Δ +18 / +0 / +70 / +2 vs baseline 693/0/2574/53).
- `bun run check 2>&1 | tail -3` — exit 0; biome ci PASS; bun test PASS.
- `bunx --bun biome ci . 2>&1 | tail -3` — exit 0; checked 126 files in 34ms; no fixes applied.
- `bunx --bun tsc --noEmit 2>&1 | tail -3` — exit 0; zero errors.
- Repair iter 1 — biome auto-formatter ran via `bunx --bun biome check --write` to fix imports order in `src/commands/next/run.ts` and `findMostRecentRunLog` line-wrap in `src/runs/watch.ts`. Both fixes idempotent.
- `bun --version` → 1.3.12 (AR2 satisfied — Bun >= 1.3).

### Completion Notes List

- Story 3.9 lands the FIRST streaming-mode read-only flag of the project (every prior Epic 3 read-only flag emits a SINGLE-LINE AR9 JSON action). Establishes the SECOND documented FR54 carve-out (after Story 3.8's `--export-state`); both are bounded exceptions to AR9's single-line invariant.
- New module `src/runs/watch.ts` (~378 lines, mid-tier per AR41) exports `watchMostRecentRunLog({ runsRoot?, pollMs?, signal? }): Promise<WatchResult>` with `WatchResult = { filePath: string | null; status: "watched" | "no-runs" }`. Composes `findMostRecentRunLog + tailLineByLine + sigintBridge`.
- `findMostRecentRunLog` selects by mtime descending with filename descending tiebreaker (Test C + Test D verify both branches). Filters to `*.log` only — `endsWith(".log")` excludes `.json` siblings + `.bak` rotations + `.tmp` mid-write files naturally (Test H verifies).
- `tailLineByLine` uses `Bun.file(p).slice(start, end).stream()` piped through `TextDecoderStream`; LF-only line splitting (Story 2.5's writer emits LF per `write-step.ts:147`); 250ms poll interval. Buffers partial lines (`partialLine` accumulator); Test F verifies buffering of `"abc"` (no newline) → `"def\n"` → emits combined `"abcdef\n"`.
- SIGINT handler bridges to AbortController per spec §Open Question 5 — testability via real abort signal in tests; production wiring registers `process.on("SIGINT", () => controller.abort())` in `watchMostRecentRunLog`. Test G verifies listener registration + removal (`process.listenerCount("SIGINT")` increments by 1, returns to baseline after cleanup).
- File deletion mid-watch (Test I) detected via `fs.stat()` ENOENT → stderr warn + graceful exit per §Open Question 6 (Story 6.8 forward-compat for the 90-day archive rotation case).
- AR9 SPECIAL CASE for `--watch`: bypass `emitDispatchAction`. The runner's `import.meta.main` block detects `--watch` in argv via `wasWatchRequested(argv)` (mirrors Story 3.8's `wasExportStateRequested`). The `runNext` function returns the structural `report` action (with summary message) for testability; raw transcript lines stream to stdout from inside the watcher's tail loop.
- Repositioned `--watch` short-circuit: was in Step 3 forward-deferral guards (`haltWithHint` exitCode 1); now Step 5b between `--doctor` (Step 5) and `--export-state` (Step 6 first branch). Route order documented in JSDoc: `--doctor → --watch → --export-state → --diff-state → --explain → --list → --dry-run → fall-through to dispatch path`. Verified by Story 3.9 Test C (`--watch + --diff-state` → watch wins) + Test D (`--doctor + --watch` → doctor wins).
- Lock-free invariant verified by Test J source-content scan (rejects `from "../lock/"`, `acquire(`, `loadState(`, `loadStateUnlocked(`, `saveState(`, `recomputeState(`, `recomputeStateUnlocked(` patterns) + run.test.ts Story 3.9 Test E re-assertion at the runner level. The watcher does NOT touch state.yaml; pure CONSUMER of Story 2.5's transcript files.
- Errors registry stays at 16 codes (zero new error classes — Story 3.9 ENOENT mid-watch flows through the existing error helper as a stderr warn).

### Test Counts (final)

- Pass: 711 (was 693; Δ +18).
- Fail: 0 (was 0; Δ 0).
- Expects: 2644 (was 2574; Δ +70).
- Files: 55 (was 53; Δ +2 — new `src/runs/watch.test.ts` + `src/integration/watch-fresh-project.test.ts`).
- Errors registry: 16 codes (unchanged).

### File List

#### Modified Files

- `src/commands/next/run.ts` (~1971 → ~2022 lines): added `import { watchMostRecentRunLog } from "../../runs/watch.ts"` (mid-tier sibling); extended `RunNextOptions` with `watchRunsRoot` / `watchPollMs` / `watchSignal` test-injection escape hatches; removed `--watch` forward-deferral guard from Step 3; added new Step 5b `--watch` short-circuit between `--doctor` (Step 5) and `--export-state` (Step 6); added `wasWatchRequested(argv)` argv-scan helper; updated `import.meta.main` block to bypass `emitDispatchAction` when `--watch` was requested; updated module-level JSDoc + `runNext` JSDoc to reflect new route order + AR9 SPECIAL CASE.
- `src/commands/next/run.test.ts` (~3568 → ~3692 lines): removed the now-stale `--watch halts with exitCode 1 + Story 3.9 hint` test (Story 2.4 placeholder); appended new `describe("runNext — Story 3.9 --watch live transcript tail", ...)` block with 5 colocated test cases (Tests A-E covering empty-runs report path, populated abort-driven exit, `--watch + --diff-state` route order, `--doctor + --watch` route order, lock-free invariant source scan).
- `src/runs/index.ts` (+2 lines): added `export { watchMostRecentRunLog } from "./watch.ts"` and `export type { WatchOptions, WatchResult } from "./watch.ts"` to the barrel.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: flipped `3-9-watch-live-transcript-tail: ready-for-dev → review`; bumped `last_updated`.
- `_bmad-output/implementation-artifacts/3-9-watch-live-transcript-tail.md` (this file): flipped frontmatter + body status `ready-for-dev → review`; populated Dev Agent Record sections; appended Change Log entry.

#### New Files

- `src/runs/watch.ts` (~378 lines): the `watchMostRecentRunLog({...}): Promise<WatchResult>` helper. Mid-tier per AR41. Composes `findMostRecentRunLog + tailLineByLine + sigintBridge`. Pure async; no I/O writes; lock-free.
- `src/runs/watch.test.ts` (~440 lines): 12 colocated test cases (slightly above the spec's ~10-test target) covering Tests A-J per Task 6 spec — empty-runs verbatim hint, single-file open + emit + poll, mtime selection, filename tiebreaker, append-detection, partial-line buffering, SIGINT cleanup via AbortController, skip-non-`*.log` entries, file deletion mid-watch, lock-free source scan, no-external-tail-dep source scan. Uses tmpdir-per-test mkdtemp/rm pattern; `captureStdout` + `captureStderr` helpers monkey-patch the streams for capture.
- `src/integration/watch-fresh-project.test.ts` (~123 lines): 2 integration tests per AC line 866-867 — spawns `bun run src/commands/next/run.ts -- --watch` against an empty tmpdir; asserts stdout is byte-identical to `No run logs yet. Start a step with /bmad-next.\n`; asserts exit code 0; asserts FR52 lock-free (no lock dir/file written) + NFR-S2 (no transcript files created); asserts FR54 carve-out (stdout is plain text, NOT AR9 JSON-wrapped). Second test covers the empty-runsRoot subcase (`runs/` dir exists but contains zero `*.log` files).

#### Sprint Status

- `_bmad-output/implementation-artifacts/sprint-status.yaml`: `3-9-watch-live-transcript-tail` → `review`. `epic-3: in-progress` preserved.

#### Story File

- `_bmad-output/implementation-artifacts/3-9-watch-live-transcript-tail.md`: `status: review` (frontmatter + body); Dev Agent Record sections populated.

#### Task Record

- `.bmad-stepper/runs/2026-05-01T230121Z-bmad-next/tasks/t1-dev-story.yaml`: created at completion; status `completed`; quality gates recorded; AC coverage matrix populated.

#### NOT Modified (per spec)

- `src/commands/next/args.ts` — `--watch` already declared by Story 1.7 line 166.
- `src/commands/next/verify-and-advance.ts` — Story 3.9 does NOT touch the lock-held runner.
- `src/runs/build-run-log.ts`, `src/runs/render-markdown.ts`, `src/runs/write-step.ts` — Story 2.5's writers; Story 3.9 is a pure CONSUMER.
- `src/dag/types.ts` / `src/dag/build.ts` / `src/dag/seed-v6.x.ts` — DAG types/builds unchanged; the watcher does not invoke any DAG resolution.
- `src/errors.ts` — registry stays at 16 codes (no new error class).
- `src/dispatch/generate-spec.ts` / `src/dispatch/index.ts` — dispatch-spec construction unchanged; `--watch` short-circuits BEFORE the dispatch path.
- `src/state/load.ts` / `src/state/diff.ts` / `src/state/export.ts` — state subsystem unchanged; the watcher does NOT read `state.yaml`.
- `commands/bmad-next.md` — Layer 1 markdown unchanged; `--watch` raw stdout streaming is handled in `run.ts`'s `import.meta.main` block.
- `src/schemas/state.ts` / `src/schemas/dispatch-protocol.ts` — no schema bump.
- `src/personas/` — Story 3.9 does NOT invoke persona resolution.

## Senior Developer Review (AI)

**Reviewer**: bmad-code-review (claude-opus-4-7[1m])
**Reviewed**: 2026-05-01
**Verdict**: **APPROVE** (status: review → done)
**Counts**: must-fix=0 | should-fix=0 | nits=0 | info=2

### Outcome

Implementation lands cleanly inside the spec's allowed mutation surface. All 3 ACs delivered with high fidelity to the verbatim AC wording (epic lines 862-868). The Story 2.4 forward-deferral guard at `src/commands/next/run.ts:1336-1340` is replaced + repositioned to a new "Step 5b" between `--doctor` (Step 5) and `--export-state` (Step 6 first branch). The new `src/runs/watch.ts` (~441 lines, mid-tier per AR41) exports `watchMostRecentRunLog({ runsRoot?, pollMs?, signal? }): Promise<WatchResult>` composed of `findMostRecentRunLog` + `tailLineByLine` + `readSliceAsLines` + a SIGINT-bridged AbortController. The watcher uses `Bun.file(p).slice(start, end).stream()` piped through `TextDecoderStream` for line-by-line UTF-8 decode + LF-only line splitting; ZERO `child_process.spawn("tail")`-style invocations; ZERO `node:tty` or external-binary dependencies. The fresh-project hint `No run logs yet. Start a step with /bmad-next.\n` is byte-identical to AC-line-867. The `--watch` SPECIAL CASE per FR42 + FR54 + architecture §line 524 + §line 862 BYPASSES the AR9 wrapper entirely; raw transcript content streams to stdout via `process.stdout.write` from inside the tail loop; the `import.meta.main` block detects `--watch` via the new `wasWatchRequested(argv)` helper (mirrors Story 3.8's `wasExportStateRequested`) and SKIPS `emitDispatchAction`. The `runNext` return value still uses the `report` shape for testability — Tests A-D in `run.test.ts:3589-3690` inspect `result.action.message` directly. AR8 / AR9 (with bounded SECOND SPECIAL CASE) / AR11 / AR21 / AR22 / AR25 / AR26 / AR33 / AR41 / AR42 invariants preserved; FR8 / FR42 / FR43 / FR44 / FR52 / FR53 / FR54 + NFR-P1/P4/S2/S5/R1/R5/I2 all PASS. Quality gates reproduce green (711 / 0 / 2644 / 55) on TWO consecutive `bun test` runs (no transient timing flake observed during independent re-validation — the dev-story §Repair iter 0 destructuring bug was non-flake-related). 8 open questions adjudicated ACCEPT v0.1 conservative; 2 dev deviations adjudicated ACCEPT; the noted potential timing flake did NOT reproduce.

### AC Verification

- **AC-1** (epic AC lines 862-864: `src/transcript/watch.ts` finds the most recent `runs/<ts>-<step>.log` → `--watch` is supplied → file is tailed line-by-line stream until SIGINT) — **PASS**.
  - `findMostRecentRunLog` at `src/runs/watch.ts:180-223` walks `runsRoot`, filters `entry.isFile() && entry.name.endsWith(".log")` (excludes `.json` siblings, `.bak` rotations, `.tmp` mid-write files, directories naturally), stats each candidate for `mtimeMs`, sorts mtime descending with filename descending tiebreaker. Returns `null` on missing dir / empty / no candidates.
  - `tailLineByLine` at `src/runs/watch.ts:237-312` does the initial read [0, size) via `Bun.file().slice().stream()` + `TextDecoderStream`, emits each complete LF-terminated line via `process.stdout.write`, buffers trailing partial lines in a `partialLine: string` accumulator, then enters a 250ms-default poll loop. On size-growth: reads [oldOffset, newSize) and emits new lines. On `signal.aborted`: breaks loop sub-millisecond. On ENOENT mid-watch: stderr warn + graceful break.
  - SIGINT bridge at `src/runs/watch.ts:391-441` registers `process.on("SIGINT", () => internalController.abort())` BEFORE entering the loop; composes with caller-supplied `opts.signal` so EITHER source aborts the loop; `finally` block removes both listeners (test-runner-friendly via `process.off("SIGINT", onSigint)` and `opts.signal.removeEventListener("abort", onCallerAbort)`).
  - Tests B-G + I in `src/runs/watch.test.ts` (12 cases / 47 expects) verify single-file open + emit + poll, mtime-descending selection, filename-descending tiebreaker, append-detection, partial-line buffering, SIGINT cleanup with listener-count baseline restoration, and graceful ENOENT exit. Test G asserts `process.listenerCount("SIGINT")` increments by 1 inside the loop and returns to baseline after cleanup; cleanup elapsed `< 300ms` (well under NFR-R5's 30s budget).
  - Tests A-D at `src/commands/next/run.test.ts:3589-3690` verify the runner-level integration: empty-runs path returns `report` with `"no runs to watch"`; populated path returns `report` with `"watch session ended (...)"`; route-order combos (`--watch + --diff-state` → watch wins; `--doctor + --watch` → doctor wins).

- **AC-2** (epic AC lines 866-867: there are no run logs yet (fresh project) → `--watch` runs → prints `No run logs yet. Start a step with /bmad-next.` and exits 0) — **PASS**.
  - `FRESH_PROJECT_HINT` constant at `src/runs/watch.ts:108`: `"No run logs yet. Start a step with /bmad-next.\n"` — byte-identical to AC-line-867 plus a single trailing `\n` per terminal-output convention.
  - The fresh-project branch at `src/runs/watch.ts:399-402` emits the hint via `process.stdout.write(FRESH_PROJECT_HINT)` and returns `{ filePath: null, status: "no-runs" }` BEFORE the SIGINT bridge is wired (zero state interaction).
  - `runNext` at `src/commands/next/run.ts:1442-1458` invokes `watchMostRecentRunLog` and translates the `"no-runs"` status to `report.message = "no runs to watch (fresh project)"` with `exitCode: 0`. The `import.meta.main` block at `run.ts:2042-2065` detects `--watch` via `wasWatchRequested(argv)` and SKIPS `emitDispatchAction` so the AR9 summary line does NOT trail the verbatim hint.
  - Test A at `src/runs/watch.test.ts:104-114` asserts byte-identical match against the verbatim hint string (no leading/trailing whitespace; exact `\n`). Second sub-test at `:116-132` asserts the same hint when `runsRoot` exists but contains zero `*.log` files (only `.json` siblings + `.log.bak` rotations).
  - Integration test at `src/integration/watch-fresh-project.test.ts` (2 cases / 8 expects) spawns `bun run src/commands/next/run.ts -- --watch` against an empty tmpdir; asserts (a) byte-identical stdout match, (b) exit code === 0, (c) FR54 carve-out (the stdout body fails `JSON.parse` — it's plain text, NOT AR9-wrapped), (d) FR52 lock-free invariant via `fs.access(lockPath)` rejecting, (e) NFR-S2 no-write surface via `fs.access(runsRoot)` rejecting (no transcript files created).

- **AC-3** (epic AC line 868: tail uses Bun's stream APIs (no external `tail` dep)) — **PASS**.
  - `readSliceAsLines` at `src/runs/watch.ts:324-347` uses `Bun.file(filePath).slice(start, end).stream()` piped through `TextDecoderStream` (UTF-8 decode); LF-only line splitting per `buffer.indexOf("\n")` loop. Story 2.5's writer emits LF-only per `write-step.ts:147`, so v0.1 conservative LF-only is safe.
  - Imports verified at `src/runs/watch.ts:91-93`: `node:fs/promises` (stdlib `stat`/`readdir`/`utimes`), `node:path` (stdlib `join`), `STEPPER_INTERNAL_ROOT` (foundational sibling per AR41). ZERO `node:child_process` import; ZERO `node:tty` import; ZERO external-binary primitive.
  - Test J at `src/runs/watch.test.ts:475-493` programmatically scans the source: asserts `Bun.file(` AND `.stream()` patterns ARE present; asserts `from "node:child_process"` AND `spawn("tail"` AND `from "node:tty"` patterns are NOT present. The scan strips JSDoc/comment lines first so the docblock can mention forbidden APIs for prose context.

### Architecture / NFR / FR coverage

- **AR2** (Bun >= 1.3) — **PASS**. `bun --version` → 1.3.12; `Bun.file().stream()` + `TextDecoderStream` pattern uses standard Bun runtime APIs (Bun >= 1.0).
- **AR8** (lock-free `run.ts` / lock-held `verify-and-advance.ts`) — **PASS**. Watcher is structurally lock-free; `run.ts` is unchanged in lock posture; `verify-and-advance.ts` is never invoked on `--watch` paths. The pre-existing AR41 boundary check at `run.test.ts:606-638` continues to pass.
- **AR9** (single discriminated-union JSON line on stdout) — **PASS WITH DOCUMENTED SECOND SPECIAL CASE**. `--watch` BYPASSES the AR9 wrapper entirely; raw transcript content streams to stdout via `process.stdout.write` from inside the tail loop. The `import.meta.main` block detects `--watch` via `wasWatchRequested(argv)` and SKIPS `emitDispatchAction`. The `runNext` return value still uses the `report` shape for testability. Documented in `src/runs/watch.ts:21-29` JSDoc + `src/commands/next/run.ts:1429-1438` JSDoc + `run.ts:1990-2013` `wasWatchRequested` JSDoc + `run.ts:2046-2051` import.meta.main JSDoc + Story 3.9 §Open Question 1. This is the SECOND documented FR54 carve-out (after Story 3.8's `--export-state`); every OTHER flag (including `--diff-state` / `--explain` / `--list` / `--dry-run`) preserves AR9 strictly.
- **AR11** (`state.yaml` at `_bmad-output/.stepper/state.yaml`) — **PASS BY ABSENCE**. Watcher does NOT read `state.yaml`; ZERO state interaction. Verified by Test J source scan rejecting `loadState(`, `loadStateUnlocked(`, `recomputeState(`, `saveState(` patterns.
- **AR21** (errors carry code) — **PASS**. ZERO new error classes. Registry held at **16 codes** (`bun test src/errors.test.ts`: 10 pass / 197 expects). ENOENT mid-watch flows through a `process.stderr.write` warn (graceful exit per Open Question 6).
- **AR22** (errors carry actionable hint) — **PASS BY ABSENCE**. ZERO new actionable hints. The fresh-project hint is a STATIC informational string, not an error hint.
- **AR25** (markdown transcript per step at `runs/<ts>-<step>.log`) — **CONSUMED PASS**. Watcher reads the markdown transcript verbatim; ZERO mutations.
- **AR26** (JSON run-log per step at `runs/<ts>-<step>.json`) — **NOT CONSUMED PASS**. Watcher targets `*.log` files only; `*.json` siblings are filtered out by `endsWith(".log")` (Test H verifies).
- **AR33** (function & error semantics; throw not Result; no console.\*; async/await) — **PASS**. Watcher is async (`Promise<WatchResult>`); throw not Result (file-system errors caught + handled inline); ZERO `console.*` calls; stdout writes use `process.stdout.write` per architecture §line 862; stderr warns use `process.stderr.write`.
- **AR41** (boundary graph; no upward / sibling-higher imports) — **PASS**. The new `src/runs/watch.ts` is mid-tier; imports `node:fs/promises` (stdlib) + `node:path` (stdlib) + `STEPPER_INTERNAL_ROOT` from `src/io/paths.ts` (foundational sibling) + Bun runtime `Bun.file()`. ZERO upward imports (no `src/lock/`, `src/state/`, `src/dag/`, `src/personas/`, `src/dispatch/`, `src/verifiers/`, `src/failure-ux/`, `src/commands/`). The `src/commands/next/run.ts` runner (top-tier) imports the new mid-tier sibling at line 114 — same direction allowed. The colocated AR41 boundary check at `run.test.ts:606-638` continues to pass; Story 3.9's mid-tier sibling import (`../../runs/watch.ts`) is explicitly allowed. Test E at `run.test.ts:3694-3704` re-asserts at the runner level.
- **AR42** (test discipline) — **EXTENDED PASS**. New colocated `src/runs/watch.test.ts` (12 cases / 47 expects); new integration test `src/integration/watch-fresh-project.test.ts` (2 cases / 8 expects); 5 new colocated runner tests in `src/commands/next/run.test.ts:3558-3705` (Tests A-E). Each follows AR35 tmpdir-per-test mkdtemp/rm discipline; ZERO hard-coded `/tmp/...` paths.
- **FR8** (`/bmad-next` single-step advance) — **PASS BY ABSENCE**. Dispatch path is unaffected; `--watch` is a streaming-mode read-only short-circuit.
- **FR42** (`--watch` live tail) — **PRIMARY DELIVERABLE PASS**. v0.1 ships the most-recent-by-mtime tail per AC line 862-868.
- **FR43 + FR44** (transcript paths under `_bmad-output/.stepper/runs/`) — **CONSUMED PASS**. Default `runsRoot = ${STEPPER_INTERNAL_ROOT}/runs` matches Story 2.5's `RUNS_ROOT` constant verbatim; the watcher reads `<runsRoot>/<ts>-<step>.log` files verbatim.
- **FR52** (read-only flags non-locking) — **PASS**. Watcher is structurally lock-free; ZERO `src/lock/` import. Verified by Test J source-scan + integration test's `fs.access(lockPath)` rejection assertion.
- **FR53** (documented exit codes) — **PASS**. Watch returns exit code 0 on graceful SIGINT exit OR fresh-project empty-runs case.
- **FR54** (stdout/stderr discipline) — **PASS WITH DOCUMENTED SECOND SPECIAL CASE**. The `--watch` raw transcript stream goes to stdout DIRECTLY (NOT wrapped in AR9); diagnostics route to stderr via `process.stderr.write`. Mirrors Story 3.8's `--export-state` carve-out precedent.
- **NFR-P1** (next-step computation < 500ms p95) — **PASS BY ABSENCE**. Watcher is not on the next-step computation path.
- **NFR-P4** (transcript streaming non-blocking on main-thread latency) — **PASS**. Watcher is a SEPARATE `bun run` invocation; 250ms poll debounce; zero contention with the dispatch path.
- **NFR-S2** (writes only inside scope) — **PASS BY ABSENCE**. Watcher is read-only; ZERO write surface introduced. Integration test asserts `fs.access(runsRoot)` rejects (no transcript files created during fresh-project run).
- **NFR-S5** (atomic writes + locks) — **PASS BY ABSENCE**. Read-only paths; nothing to write atomically; no locks to acquire.
- **NFR-R1** (zero data loss on halt) — **PASS BY ABSENCE**. Read-side only.
- **NFR-R5** (SIGINT graceful within 30s) — **PASS**. Watcher cleanup is sub-millisecond; Test G asserts `< 300ms` budget for AbortController-bridged abort path. The 30s NFR-R5 budget is for the loop runner Story 4.9 (in-flight sub-agent + state write); not in scope here.
- **NFR-I2** (unknown-skill fail-loud) — **PASS BY ABSENCE**. Watcher does not invoke any DAG / skill resolution.

### Findings

#### Must-fix

(none)

#### Should-fix

(none)

#### Nits

(none)

#### Info

- **Info-1** (FR54 SECOND SPECIAL CASE is documented as a CARVE-OUT from AR9 — the watcher emits raw transcript content DIRECTLY on stdout BYPASSING `emitDispatchAction`): `src/commands/next/run.ts:2042-2065`. The contract is preserved at the `runNext` return level (still `action: "report"` for testability), only the process-level emission differs. The special-case is documented inline + in module JSDoc + in Story 3.9 §Open Question 1. Forward-compatible with future streaming-mode flags; the carve-out is bounded — only `--export-state` (Story 3.8) AND `--watch` (Story 3.9) bypass AR9; every OTHER read-only flag preserves AR9 strictly. Not actionable now.
- **Info-2** (250ms poll interval is hard-coded for v0.1; Story 6.1 may surface as `bmad-stepper.config.yaml watch.pollMs`): `src/runs/watch.ts:100` `DEFAULT_POLL_MS = 250`. Per Open Question 4, hard-coding is the v0.1 conservative choice for deterministic test fixtures; tests pass `pollMs: 25` to override for fast deterministic timing. Story 6.1 (config-loader) may surface as a config knob; forward-compatible. Not actionable now.

### Validator Independent Re-Run

- `bun --version`: **1.3.12** (AR2 satisfied — Bun >= 1.3).
- `bun test` (run #1): **711 pass / 0 fail / 2644 expect() calls / 55 files** — 3.84s elapsed. Matches dev-story claim verbatim.
- `bun test` (run #2, flake-check per task brief): **711 pass / 0 fail / 2644 expect() calls / 55 files** — 3.67s elapsed. NO transient timing flake observed; the dev-story §Repair iter 0 destructuring bug was non-flake-related (logic bug fixed before commit).
- `bun run check`: **exit 0** (Biome ci + tsc + bun test all clean).
- `bunx --bun biome ci .`: **exit 0** (126 files checked clean in 39ms).
- `bunx --bun tsc --noEmit`: **exit 0** (no TypeScript errors).
- `bun test src/runs/watch.test.ts`: **12 pass / 0 fail / 47 expect() calls** — matches dev-story claim.
- `bun test src/integration/watch-fresh-project.test.ts`: **2 pass / 0 fail / 8 expect() calls** — matches dev-story claim.
- AC-text byte-identical: `diff <(sed -n '862,868p' epics.md) <(sed -n ... 3-9-...md)` → **exit 0** (verbatim BDD AC content matches identically).
- Errors registry: held at **16 codes** (AR21 invariant preserved).
- Targeted biome ci on touched files: **exit 0** (5 files checked clean: `src/runs/watch.ts`, `src/runs/watch.test.ts`, `src/integration/watch-fresh-project.test.ts`, `src/commands/next/run.ts`, `src/runs/index.ts`).

### Deviations Adjudication

The dev-story enumerated 8 open questions (story spec §Open Questions for Code Review) plus 2 dev deviations in the dev-story task record + 1 noted potential timing flake in the task brief. All adjudicated below.

**8 Open Questions:**

- **open-question-1 (`--watch` BYPASS AR9 wrapper vs streaming-mode AR9 variant)** — **ACCEPT v0.1 conservative (BYPASS)**. v0.1 chooses BYPASS per FR42 + FR54 + architecture §line 524 + §line 862; the streaming-mode requirement is structurally incompatible with the single-JSON-line AR9 invariant; pre-buffering the entire transcript until SIGINT defeats the streaming intent. The carve-out is bounded — every OTHER flag preserves AR9 strictly. SECOND documented exception after Story 3.8's `--export-state`. Documented in `src/runs/watch.ts` JSDoc + `run.ts` JSDoc + Info-1.
- **open-question-2 (path: `src/transcript/watch.ts` AC-source-strict vs `src/runs/watch.ts` Story-2.5-convention-strict)** — **ACCEPT v0.1 (convention-strict)**. v0.1 chooses `src/runs/watch.ts` per Story 2.5's directory rename. Rationale: the `src/transcript/` directory does NOT exist on disk; recreating it for ONE file would fragment the layout and violate the established Story 2.5 convention. The watcher's INTENT (FR42 + line-by-line tail + SIGINT graceful exit + fresh-project hint + Bun streams + no-external-tail-dep) is fully preserved; the path naming is below the AC's specificity threshold. Documented as `dev-deviation-1` below + spec §Acceptance Criteria path-rename note.
- **open-question-3 (append detection: polling 250ms vs `node:fs/promises#watch` FS watcher)** — **ACCEPT v0.1 conservative (polling)**. Cross-platform determinism: macOS uses FSEvents, Linux uses inotify; Bun's coverage of edge cases like file-rotation is incomplete. 250ms latency floor is acceptable for v0.1 (transcript writes occur once per step — minutes apart, not milliseconds). Story 6.x may switch to FS watcher with platform-specific fallbacks.
- **open-question-4 (poll interval: hard-coded 250ms vs config knob)** — **ACCEPT v0.1 conservative (hard-coded)**. Simpler test fixtures; matches typical transcript-write cadence. Story 6.1 (config-loader) may surface as `bmad-stepper.config.yaml watch.pollMs`. Forward-compatible. Tracked as Info-2.
- **open-question-5 (SIGINT handler: raw `process.on('SIGINT', ...)` vs AbortController.signal bridged from a SIGINT listener)** — **ACCEPT v0.1 (bridged AbortController)**. Testability + cleanness: raw `process.kill(process.pid, 'SIGINT')` would kill the test runner; the bridged `AbortController` flow is structurally identical to a real SIGINT delivery. The `finally` block at `watch.ts:434-437` removes BOTH listeners (SIGINT + caller's AbortSignal listener) for test-runner-friendly cleanup. Test G asserts `process.listenerCount("SIGINT")` returns to baseline.
- **open-question-6 (file deletion mid-watch: graceful exit 0 vs halt with `TRANSCRIPT_DELETED` error)** — **ACCEPT v0.1 conservative (graceful exit 0)**. The file-rotation case (Story 6.8 archive cycle) is a legitimate operational state, not a user-facing error. Stderr warn `watch: transcript ${filePath} rotated/deleted; exiting` + graceful break per `watch.ts:280-285`. Test I verifies. Story 6.8 forward-compat.
- **open-question-7 (most-recent selection: mtime descending only vs mtime + filename-descending tiebreaker)** — **ACCEPT v0.1 conservative (BOTH — mtime primary, filename tiebreaker)**. Robustness: typical case has matching mtime + filename order (Story 2.5 writes files in `<ts>` order); tiebreaker handles edge cases where multiple files were written in the same wall-clock second (FAT32 mtime resolution = 2s). Tests C + D cover both branches.
- **open-question-8 (route order: reposition `--watch` from Step 3 forward-deferral guards to a new Step 5b between `--doctor` and `--export-state`)** — **ACCEPT v0.1 (reposition)**. The Story 2.4 placement was a hard-halt placeholder (`haltWithHint(1, ...)`); Story 3.9 needs a streaming-mode position. New ordering at `run.ts:1461-1463`: `--doctor → --watch → --export-state → --diff-state → --explain → --list → --dry-run → fall-through to dispatch path`. Test C + Test D verify (`--watch + --diff-state` → watch wins; `--doctor + --watch` → doctor wins).

**2 Dev Deviations:**

- **dev-deviation-1 (path-rename `src/transcript/` → `src/runs/`)** — **ACCEPT (documented-decision)**. Per Open Question 2 + spec §Acceptance Criteria path-rename note. Story 2.5's directory rename is the established convention. Architecture.md §line 1216 + §line 1372 wording is stale relative to the actual filesystem; the watcher's INTENT is preserved. Forward-tracker: Story 6.x (architecture.md refresh) may update the references; not blocking.
- **dev-deviation-2 (Test G uses `AbortController.signal` as SIGINT surrogate)** — **ACCEPT (documented-decision)**. Real `process.kill(process.pid, "SIGINT")` would kill the test runner. The bridged AbortController flow is structurally identical: the production SIGINT listener calls `controller.abort()`; tests directly call `controller.abort()`. Same code path. Per Open Question 5.

**1 Noted Potential Timing Flake:**

- **timing-flake-1 (task brief noted potential transient timing flake on first `bun test` run)** — **DID NOT REPRODUCE**. Independent re-validation ran `bun test` TWICE consecutively. Both runs produced identical green results: 711 pass / 0 fail / 2644 expects / 55 files. Run #1 elapsed 3.84s; run #2 elapsed 3.67s. The dev-story §Repair iter 0 destructuring bug (Test I `const { result, stdout, stderr }` mismatch with `captureStderr`'s `{ result, stderr }` return shape) was a logic bug fixed BEFORE the dev-story committed; the bug surfaced as a deterministic test failure, NOT a flake. Tests E (append-detection) + F (partial-line buffering) + I (file deletion mid-watch) are timing-sensitive: Test E writes initial content, waits 60ms for the watcher to consume + start polling, appends new content, waits 100ms for poll detection, then aborts; Test F writes empty seed, waits 30ms, appends `"abc"` (no newline), waits 60ms, appends `"def\n"`, waits 80ms for poll detection, then aborts; Test I writes initial content, waits 50ms for watcher to read, unlinks the file, waits 80ms for poll detection, aborts as belt-and-suspenders. The `pollMs: 25` test override + generous wait windows (60-100ms — 2-4× the poll interval) provide deterministic margins on typical CI hardware. NO retry/sleep loop in the implementation; clean abort semantics. If a future flake DOES surface (e.g., on slower CI runners), the recommended fix is widening the wait windows to 5-6× pollMs or wiring an explicit `await drain()` poll-cycle helper — non-blocking forward action.

### Strengths

- **Zero-deviation execution against spec mutation surface**: 12 task groups (Tasks 0-12) completed verbatim; the `src/runs/watch.ts` module lands at the architecturally-prescribed (Story 2.5-convention) path; the integration test + colocated unit tests + runner colocated tests all match the spec File List byte-for-byte.
- **AR41 mid-tier import discipline**: Watcher imports ONLY foundational siblings (`STEPPER_INTERNAL_ROOT` from `src/io/paths.ts`) + Node stdlib (`node:fs/promises`, `node:path`) + Bun runtime (`Bun.file`). ZERO upward imports (no `src/lock/`, `src/state/`, `src/dag/`, `src/dispatch/`, `src/verifiers/`, `src/personas/`, `src/failure-ux/`, `src/commands/`). The runner imports the watcher (top-tier → mid-tier; allowed). The `src/runs/index.ts` barrel at lines 23-24 re-exports `watchMostRecentRunLog` + types for downstream-consumer convenience.
- **AR9 + FR54 reconciliation via SECOND bounded SPECIAL CASE**: The `runNext` function preserves the `report` action shape for testability (tests inspect `result.action.message`); only the process-level emit at `import.meta.main` differs. The carve-out is bounded — every OTHER flag preserves AR9 strictly. Documented in 4 separate JSDoc blocks at `watch.ts:21-29`, `run.ts:1429-1438`, `run.ts:1990-2013`, `run.ts:2046-2051`.
- **Lock-free contract enforced by source-content scan**: Test J at `watch.test.ts:445-473` programmatically scans the source for forbidden patterns: `from "../lock/"`, `acquire(`, `loadState(`, `loadStateUnlocked(`, `recomputeState(`, `recomputeStateUnlocked(`, `saveState(`. The scan strips JSDoc/comment lines first to avoid false positives from prose context; the executable code is checked. Future regressions surface at test time.
- **No-external-tail-dep enforced by source-content scan**: Test J at `watch.test.ts:475-493` asserts `Bun.file(` AND `.stream()` patterns ARE present; rejects `from "node:child_process"` AND `spawn("tail"` AND `from "node:tty"` patterns. Cannot be defeated by a misimplementation.
- **SIGINT cleanup composability**: `watchMostRecentRunLog` registers a SIGINT listener BEFORE entering the loop; bridges to an internal `AbortController`; composes with caller-supplied `opts.signal`; `finally` block removes BOTH listeners (SIGINT + caller's AbortSignal listener). Test G verifies `process.listenerCount("SIGINT")` returns to baseline; `< 300ms` cleanup elapsed; well under NFR-R5's 30s budget.
- **Partial-line buffering correctness**: Test F at `watch.test.ts:272-309` covers the edge case where appended content does NOT terminate with `\n`. The watcher buffers `"abc"` in `partialLine`, then on the next `"def\n"` append produces a single combined line `"abcdef"` (NOT two interim lines `"abc"` + `"def"`). Test asserts `expect(stdout).toContain("abcdef\n")` AND `expect(stdout).not.toContain("abc\n")`. Critical for live-tail correctness when transcripts are written in non-line-aligned chunks.
- **Filesystem-rotation forward-compat (Story 6.8)**: ENOENT mid-watch is detected via `fs.stat()` catch + graceful break with stderr warn. Test I verifies. Story 6.8's 90-day archive rotation is a legitimate operational state; v0.1's exit-0 + warn flow lets CI scripts continue without distinguishing the case from normal SIGINT.
- **Filesystem-skip discipline**: `findMostRecentRunLog` filters `entry.isFile() && entry.name.endsWith(".log")` — excludes `.json` siblings (AR26 JSON run-log; not stream-friendly), `.log.bak` rotations (Story 1.3 atomicWrite), `.log.tmp` mid-write tmp files (atomicWrite tmp+rename cycle), AND directories (e.g., future Story 6.8 `runs/archive/`). Test H verifies all 4 negatives.
- **Mtime selection robustness**: Primary descending by mtime; tiebreaker descending by filename. Tests C + D cover both branches; same-second writes (FAT32 mtime resolution) handled deterministically.
- **AR9 SPECIAL-CASE precedent inheritance**: The `wasWatchRequested(argv)` argv-scan helper at `run.ts:2015-2022` mirrors Story 3.8's `wasExportStateRequested` precedent verbatim — same substring-match pattern; same `import.meta.main` placement; same false-positive impossibility (the runner only reaches the import.meta.main branch when `args.watch === true`, which agrees with the substring scan). Pure structural mirror.
- **Test coverage across all 3 ACs × 12 unit + 2 integration + 5 runner cases**: 12 colocated tests in `watch.test.ts` (47 expects) + 2 integration tests in `watch-fresh-project.test.ts` (8 expects) + 5 colocated runner tests in `run.test.ts:3589-3705` cover every AC sub-clause + edge case + invariant. The dev-story Repair iter 0 destructuring bug was caught + fixed BEFORE commit (deterministic logic bug, not a flake).
- **AC verbatim preservation**: §Acceptance Criteria reproduces the AC source verbatim (lines 862-868 of epics.md); diff against AC source confirms byte-identity (exit 0). The path-rename note is correctly placed BELOW the AC block as a contextual observation, NOT as a substitution of the AC text.
- **Errors registry held at 16 codes**: Story 3.9 introduces ZERO new error classes; ENOENT mid-watch flows through a `process.stderr.write` warn (not an error throw). Registry CI gate preserved.

### Sprint-status update

- `3-9-watch-live-transcript-tail: review → done`
- `epic-3: in-progress` (preserved — Story 3.10 still open)

### Forward-action items

- **Story 3.10 (`--non-locking-read-flags`)** — TANGENTIAL. Story 3.10's `skipAcquire: boolean` flag wiring on `src/io/lock.ts`'s `acquire()` API enumerates `--export-state`, `--list`, `--explain`, `--dry-run`, `--diff-state` as the FIVE read-only flags that skip lock acquisition. `--watch` is NOT in 3.10's enumeration (epics.md line 873) — it stays structurally lock-free without an opt-in. Forward-coupling is documentation-only.
- **Story 4.1 (`/bmad-loop` Command Skeleton)** — SECONDARY CONSUMER. The loop runner emits transcript files per iteration; users may run `/bmad-next --watch` in a separate terminal to monitor the loop's progress. Story 4.1 does NOT change the watcher's contract.
- **Story 4.9 (SIGINT Graceful Exit)** — TANGENTIAL. Story 4.9 wires the loop runner's NFR-R5 30s budget for in-flight sub-agent + state write. Story 3.9's watcher's sub-millisecond cleanup is unrelated; the watcher's SIGINT handler is purely about closing the readstream + removing the listener.
- **Story 6.1 (`bmad-stepper.config.yaml` Schema Loader)** — SECONDARY CONSUMER. May surface `watch.pollMs` (default 250) + `watch.selector` (default `most-recent`) as config knobs. Tracked as Info-2 forward-tracker.
- **Story 6.8 (Auto-archival of runs and telemetry)** — PRIMARY DOWNSTREAM. The 90-day archive rotation may move transcript files mid-watch; v0.1 watcher detects via ENOENT + exits gracefully (Test I + Open Question 6). Story 6.8 may extend with auto-follow-rotated-file semantics.
- **Story 6.x (concurrent multi-watcher coordination)** — TERTIARY. Two simultaneous `--watch` invocations against the same transcript file are safe in v0.1 (read-only access; OS allows multiple readers); v6.x may add coordinated-tail semantics if the multi-watcher UX becomes a pain point.
- **Architecture.md refresh forward-tracker**: Architecture.md §line 1216 + §line 1372 references `src/transcript/watch.ts` — stale wording. Story 6.x architecture refresh should update these to `src/runs/watch.ts` (per Story 2.5 + 3.9 convention). Non-blocking.
- **CRLF / encoding sniffing forward-tracker**: v0.1 is LF-only + UTF-8-only (Story 2.5 writer emits LF + UTF-8). If v6.x cross-platform tests reveal CRLF or non-UTF-8 transcripts, the line splitter at `readSliceAsLines` needs updating. Currently safe.
- **FS-watcher path forward-tracker**: v0.1 chose polling per Open Question 3. If 250ms latency floor becomes a UX pain point, Story 6.x may switch to `node:fs/promises#watch` with platform-specific fallbacks. Non-blocking.

### Issues dev missed

(none — the dev-story §Open Questions for Code Review correctly enumerated all 8 design tensions; the 2 dev deviations were documented and pragmatic; AC text byte-identical to source; no spec gaps surfaced during the independent re-validation; the noted potential timing flake DID NOT reproduce on TWO consecutive `bun test` runs; the AR41 boundary check + lock-free invariant scan + no-external-tail-dep scan all pass; FR42 + FR54 SECOND SPECIAL CASE is correctly bounded and documented; the `wasWatchRequested` helper mirrors the Story 3.8 precedent verbatim.)

### Approval

Story status flipped `review → done`. `sprint-status.yaml` flipped `3-9-watch-live-transcript-tail: review → done`. Ready to advance to Story 3.10 (`--non-locking-read-flags`) per the standard Epic-3 sequence.

## Change Log

| Date       | Author            | Change                                                                                                                                                                              |
| ---------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-01 | bmad-create-story | Initial story file created from epics.md §3.9                                                                                                                                       |
| 2026-05-01 | bmad-dev-story    | Implementation complete. New `src/runs/watch.ts` + 12 colocated tests + 2 integration tests. `--watch` short-circuit repositioned to Step 5b. Status `ready-for-dev → review`. 711/0/2644/55 (Δ +18/+0/+70/+2). |
| 2026-05-01 | bmad-code-review \| 2026-05-01T231728Z-bmad-next | Senior Developer Review — APPROVE; 0 must-fix / 0 should-fix / 0 nits / 2 info; AC-1/2/3 PASS; AR2/8/9/11/21/22/25/26/33/41/42 + FR8/42/43/44/52/53/54 + NFR-P1/P4/S2/S5/R1/R5/I2 PASS; 8 open questions ACCEPT; 2 dev deviations ACCEPT; 1 timing flake DID NOT REPRODUCE (2 consecutive runs clean); status → done |
