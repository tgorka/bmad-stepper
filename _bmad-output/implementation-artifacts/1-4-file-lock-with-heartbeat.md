---
status: done
story_id: '1.4'
story_key: 1-4-file-lock-with-heartbeat
epic: '1'
title: File Lock with Heartbeat
created: '2026-04-30'
last_updated: '2026-04-30'
priority: blocking
estimated_effort: M
fr_coverage:
  - FR15
  - FR24
  - FR55
nfr_coverage:
  - NFR-R1
  - NFR-R4
  - NFR-S2
  - NFR-S5
ar_coverage:
  - AR33
  - AR41
  - AR42
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/implementation-artifacts/1-1-initialize-repository-scaffold.md
  - _bmad-output/implementation-artifacts/1-2-errors-module-registry-ci-gate.md
  - _bmad-output/implementation-artifacts/1-3-logger-path-helpers-atomic-write.md
  - _bmad/config.yaml
---

# Story 1.4: File Lock with Heartbeat

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a **Stepper user**,
I want **exclusive per-project locking with a PID + heartbeat so concurrent invocations are detected, stale locks are reclaimed, and `--force-unlock` is the documented remediation**,
so that **branch switches, killed processes, and concurrent terminals never corrupt state**.

## Context Summary

This story lands the **third foundational IO primitive** of the project, joining `src/io/log.ts`, `src/io/paths.ts`, and `src/io/atomic-write.ts` (all from Story 1.3, status `done`). It implements the **mkdir-based exclusive file lock** with **5-second heartbeat**, **30-second stale-lock detection**, **`kill(pid, 0)` liveness probing**, and **`--force-unlock` remediation** — the canonical algorithm from architecture §D4 (lines 371–387). The lock is the gate that keeps two concurrent Stepper processes (one per project root) from racing on `state.yaml`; it is also the substrate that Story 1.6's state save/load uses for read-modify-write cycles, that Story 1.12's `--doctor` inspects, and that Story 2.6's `verify-and-advance.ts` acquires (`run.ts` is read-only and lock-free per architecture line 1672).

This is the project's **first concurrency primitive**. Until Story 1.4, every test runs under a unique tmpdir with no cross-process coordination (AR35). From Story 1.4 onwards, **every state-mutating operation MUST acquire `_bmad-output/.stepper/state.yaml.lock/` before reading state and release it in a `try/finally`** — failure to do so risks the state-corruption class of bugs the lock is designed to prevent. Story 1.6 (state subsystem) is the first consumer; Story 2.4 (`run.ts`) is explicitly NOT a consumer (lock-free per coherence-validation correction 1).

The lock subsystem also operationalises **NFR-R4** ("Stepper halts cleanly on a stale lock with a human-readable message and a remediation command (`--force-unlock` after PID-heartbeat detection)" — PRD line 776) and **FR24** (graceful exit on SIGINT releases the lock — `try/finally` is the substrate). The `LockContentionError` (code `LOCK_CONTENTION`, exitCode 4) already exists in the central registry from Story 1.2 — this story's `acquire()` throws it on contention, with the verbatim AC hint string. **One non-trivial gotcha:** the existing `LockContentionError.actionableHint` (set in Story 1.2 to `"Run /bmad-next --force-unlock if you are sure no other Stepper process is running."`) does **not** match Story 1.4 AC's required hint verbatim. Task 6 below documents the required edit to `src/errors.ts` to align the hint with the AC's exact text. The edit is small (single string change) and does not change the registered code, exit code, or class name; the existing 15-entry registry count and `errors.test.ts` regex assertions remain valid.

The lock is **not** a configuration-language primitive — there is no `bmad-stepper.config.yaml` knob to disable it, no `--no-lock` CLI flag (read-only flags like `--export-state`, `--list`, `--explain`, `--dry-run`, `--diff-state` per FR52 / Epic 3 Story 3.10 are non-locking-by-design — they call `compute()`-style code paths that never `acquire()` in the first place; this is enforced in their own stories). The lock is **mandatory** for any code path that writes state. It is the substrate that makes Stepper safe to run from concurrent terminals.

This is **AR33** (function & error semantics — `try/finally` for cleanup; `Bun.spawn` for subprocess testing; throw `StepperError` subclasses), **AR41** (module boundary — `src/io/lock.ts` is foundational alongside `errors.ts`, `schemas/`, and the existing `src/io/{log, paths, atomic-write}.ts`), **AR42** (persistence boundary — the lock dir lives at exactly `_bmad-output/.stepper/state.yaml.lock/`, no other path; lock writes go through `assertWithinScope`). It also operationalises architecture §D4 (the lock algorithm itself), §D10 line 403 (the `.bak` rotation invariant — though `.bak` rotation belongs to atomic-write, not lock; only mentioned here because the lock's pid file is written via `Bun.write` and does NOT rotate `.bak` — it's metadata, not canonical state), and §P4 (function & error semantics — async/await throughout, no callbacks).

## Acceptance Criteria

The acceptance criteria below are reproduced **verbatim** from `_bmad-output/planning-artifacts/epics.md` §Story 1.4 (lines 400–409, BDD Given/When/Then/And format). Lines and AC labelling preserved.

### AC-1 (Given/When/Then — mkdir-based algorithm + LOCK_CONTENTION on second acquire)

**Given** the mkdir-based algorithm: `mkdir(state.yaml.lock)` for acquire (EEXIST = contention), 5-second `mtime` heartbeat on the inner `pid` file, 30-second stale threshold, `kill(pid, 0)` for liveness check, `rm -rf` for release in `try/finally`
**When** a second Stepper process tries to acquire while the first holds the lock
**Then** the second exits with `LOCK_CONTENTION` (exit code 4) and the hint `Run /bmad-next --doctor to inspect lock state, or /bmad-next --force-unlock if you're sure no other Stepper is running.`

### AC-2 (Given/When/Then — Stale-lock recovery via PID-not-alive)

**Given** the first process is killed with `kill -9` (no graceful release)
**When** more than 30 seconds pass without heartbeat update and the second process retries
**Then** the second detects the stale lock via PID-not-alive, removes it, and acquires successfully

### AC-3 (And — `--force-unlock` UX)

**And** `--force-unlock` removes the lock dir unconditionally after a `Are you sure no other Stepper is running?` prompt

### AC-4 (And — Integration test coverage)

**And** integration tests cover: concurrent acquire, stale-lock recovery, suspended-process heartbeat-loss, `--force-unlock` UX, sub-second-`mtime` filesystem fallback to 60-second threshold

## Tasks / Subtasks

- [x] **Task 1 — Implement `src/io/lock.ts` skeleton (AC: 1, 2)**
  - [x] 1.1 Create `src/io/lock.ts`. The module exports an `acquire()` async function returning a `LockHandle` and a separate `forceUnlock()` async function (Task 5). The module boundary is foundational per AR41 — same tier as `paths.ts` / `atomic-write.ts`. Allowed imports: `node:fs/promises` (for `mkdir`, `rm`, `utimes`, `stat`, `writeFile`), `node:os` (for `os.hostname()`), `./paths.ts` (for `STEPPER_INTERNAL_ROOT` and `assertWithinScope`), `../errors.ts` (for `LockContentionError`). No upward imports.
  - [x] 1.2 Define module-level constants:
    ```typescript
    export const LOCK_DIR_REL = "_bmad-output/.stepper/state.yaml.lock";
    export const PID_FILE_NAME = "pid";
    export const HEARTBEAT_INTERVAL_MS = 5_000;
    export const STALE_THRESHOLD_MS = 30_000;
    export const STALE_THRESHOLD_FALLBACK_MS = 60_000;
    ```
    `LOCK_DIR_REL` is project-relative; the lock helper computes the absolute path via `path.resolve(process.cwd(), LOCK_DIR_REL)` at acquire time. Architecture §D4 line 344 mandates exactly this path.
  - [x] 1.3 Define a `LockHandle` shape returned by `acquire()`:
    ```typescript
    export interface LockHandle {
      readonly lockDir: string;
      readonly pidFile: string;
      readonly acquiredAt: string; // ISO 8601 UTC
      release(): Promise<void>;
    }
    ```
    The `release()` method is the canonical way to drop the lock (it stops the heartbeat timer and `rm -rf`s the lock dir). `try/finally` callers in Story 1.6 onwards will call `release()` from the `finally` block.
  - [x] 1.4 Define a private internal type for the pid file contents (Story 1.5 will move this to `src/schemas/pid.ts` with full Zod validation; for v0.1 of the lock module, declare an inline TypeScript shape):
    ```typescript
    interface PidFileContents {
      pid: number;
      hostname: string;
      acquiredAt: string;
      heartbeatIntervalMs: number;
    }
    ```
    The architecture (line 378) declares the field name `heartbeatInterval: 5` (seconds); for the v0.1 file format we use `heartbeatIntervalMs: 5000` (milliseconds, explicit unit) and let Story 1.5's Zod schema reconcile both representations. Add a JSDoc note in `lock.ts` explaining the choice.
  - [x] 1.5 No top-level side effects. The module exports functions; running the module body MUST NOT touch the filesystem (per AR41 — foundational modules are pure on import).
  - [x] 1.6 Add a JSDoc header comment matching the style of `paths.ts` / `atomic-write.ts` — file purpose, NFR/AR coverage, foundational-module declaration, public API summary.

- [x] **Task 2 — Implement `acquire()` (AC: 1, 2)**
  - [x] 2.1 Add `export async function acquire(): Promise<LockHandle>` to `src/io/lock.ts`. The function signature takes no arguments — the lock dir path is the single canonical `_bmad-output/.stepper/state.yaml.lock/` per AR42; future stories MAY add an optional `{ projectRoot?: string }` parameter for testing, but v0.1 reads `process.cwd()` directly (consistent with `paths.ts` Story 1.3 pattern).
  - [x] 2.2 Algorithm step 1 — **Try to mkdir.** Use `await fs.mkdir(absoluteLockDir, { recursive: false })`. The `recursive: false` flag is load-bearing — if the lock dir already exists, mkdir throws `EEXIST` instead of silently succeeding. This is the atomic-acquire primitive per architecture §D4 line 377.
  - [x] 2.3 Algorithm step 2 — **On EEXIST, evaluate staleness then retry-or-throw.** Catch the EEXIST and call a private `evaluateStaleness()` helper (Task 3). Three outcomes:
    1. **Stale (PID dead OR mtime older than `STALE_THRESHOLD_MS`):** `await fs.rm(absoluteLockDir, { recursive: true, force: true })` then loop back to step 1 (re-attempt mkdir). Log via `info()` from `src/io/log.ts` that a stale lock was reclaimed (one-line, actionable).
    2. **Live (PID alive AND mtime recent):** throw `new LockContentionError("LOCK_CONTENTION: another Stepper process holds the lock", JSON.stringify(currentPidContents))`. The first arg is the `Error.message`; the second is the `detail` field consumed by the run-log writer (Story 2.5).
    3. **Indeterminate (pid file unreadable, malformed JSON):** treat as STALE per architecture §D4's "graceful degradation" stance; log a warning. Tests should cover this case (synthesise a malformed `pid` file under tmpdir).
  - [x] 2.4 Algorithm step 3 — **Write the pid file.** After successful mkdir, build the `PidFileContents` payload:
    ```typescript
    const payload: PidFileContents = {
      pid: process.pid,
      hostname: os.hostname(),
      acquiredAt: new Date().toISOString(),
      heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
    };
    ```
    Write via `await Bun.write(pidFilePath, JSON.stringify(payload, null, 2))`. The pid file is metadata (not state) — **do NOT route through `atomicWrite()`** because (a) the `.bak` rotation is not needed (the file exists for the lifetime of the lock), (b) the atomic step is the parent `mkdir`, not the inner write, and (c) `atomicWrite()` calls `assertWithinScope` which already passes for `_bmad-output/.stepper/...`. Use `Bun.write` directly per AR33's "Bun-native APIs preferred".
  - [x] 2.5 Algorithm step 4 — **Start the heartbeat timer.** Use `setInterval(() => fs.utimes(pidFilePath, new Date(), new Date()).catch(() => {}), HEARTBEAT_INTERVAL_MS)`. Capture the timer handle on the `LockHandle` (private, not exposed via interface) so `release()` can `clearInterval(handle)`. The `.catch(() => {})` is best-effort — a transient `utimes` failure (e.g., disk full) does not crash the heartbeat loop; the next interval will re-try, and if the lock truly cannot be heartbeat-updated, the OTHER process's stale detection will reclaim it after 30s. Log via `warn()` (one-line) on each `utimes` failure so the user can see filesystem trouble. (Consider: an `unref()` on the timer handle so it does not hold the event loop open if the user calls `process.exit()` from elsewhere — the architecture's "graceful exit on SIGINT" pattern (FR24) handles this case explicitly via `process.on('SIGINT', release)` in higher-level callers.)
  - [x] 2.6 Algorithm step 5 — **Construct and return the `LockHandle`.** Wire `release()` to `(a)` `clearInterval(timer)`, `(b)` `await fs.rm(absoluteLockDir, { recursive: true, force: true })`, `(c)` log a one-line release message. Wrap the `release()` body in its own `try/finally` so `clearInterval` always runs even if the `rm` fails (which would be unusual — the lock dir was just created by us).
  - [x] 2.7 Type-safety note: `process.pid` is `number` (per `@types/node`). `os.hostname()` returns `string`. `new Date().toISOString()` returns ISO-8601 in `Z` (UTC) form — that's the format AR43 implicitly endorses for filesystem-safe timestamps.

- [x] **Task 3 — Implement `evaluateStaleness()` private helper (AC: 1, 2)**
  - [x] 3.1 Define a private (non-exported) `async function evaluateStaleness(lockDir: string): Promise<{ stale: boolean; reason: string; pidContents?: PidFileContents }>` helper inside `src/io/lock.ts`.
  - [x] 3.2 Inputs: the absolute path to the existing lock directory. Outputs: a discriminated result indicating staleness + reason for diagnostics.
  - [x] 3.3 Logic:
    1. **Read the pid file:** `const pidPath = path.join(lockDir, PID_FILE_NAME);` then `const raw = await fs.readFile(pidPath, "utf8")`. If this throws ENOENT (no inner pid file — corrupted lock state), return `{ stale: true, reason: "pid file missing" }`.
    2. **Parse the JSON:** `const parsed: unknown = JSON.parse(raw)`. If parsing throws (malformed JSON), return `{ stale: true, reason: "pid file malformed" }`. Cast/narrow to `PidFileContents` inline (TypeScript runtime check via `typeof parsed.pid === "number"` etc.). v0.1 does not Zod-validate the pid file inline; Story 1.5 will replace this with a `PidFileSchema` import.
    3. **Stat the pid file for `mtime`:** `const stat = await fs.stat(pidPath); const mtimeAge = Date.now() - stat.mtimeMs`.
    4. **Sub-second mtime fallback:** if `stat.mtimeMs % 1000 === 0` (the filesystem rounds mtime to whole seconds — typical of older NFS or FAT-family filesystems), the architecture (§D4 line 387) says to **warn and fall back to a 60-second stale threshold**. Return `{ stale: mtimeAge > STALE_THRESHOLD_FALLBACK_MS, reason: ... }` after `warn("filesystem lacks sub-second mtime; using 60s stale threshold")`. (The 1.0 modulus check is a cheap heuristic — a filesystem with sub-second mtime will almost always show non-zero milliseconds for a freshly-utimed file.)
    5. **Check liveness via `kill(pid, 0)`:** Node's `process.kill(pid, 0)` returns `true` (or doesn't throw) if the PID is alive. It throws ESRCH if the PID does not exist. Wrap in `try { process.kill(parsed.pid, 0); pidAlive = true; } catch (e) { pidAlive = (e as NodeJS.ErrnoException).code !== "ESRCH"; }`. EPERM means the PID exists but belongs to another user — treat as alive (don't reclaim). ESRCH is the only "definitely dead" signal.
    6. **Combine:** `const stale = !pidAlive || mtimeAge > thresholdMs`. The OR is intentional — a process that's been suspended (SIGSTOP) for >30s has a still-alive PID but a stale mtime; we reclaim. A process that died gracefully and didn't update mtime within the heartbeat interval but whose PID has been recycled to another live process — extremely rare but possible — the OR catches it via the mtime check; we reclaim, the (other) process is unaffected.
  - [x] 3.4 Edge case — **same hostname + same pid as us:** if `parsed.pid === process.pid && parsed.hostname === os.hostname()`, this is bizarre (we're trying to acquire a lock we already hold). Treat as `{ stale: true, reason: "self-owned lock found at acquire time (likely orphaned by prior process crash)" }`. Log via `warn()`.
  - [x] 3.5 Edge case — **pid file with unexpected schema:** treat as STALE (graceful degradation). The dev agent SHOULD NOT call `process.exit()` from inside `evaluateStaleness` — the consumer (`acquire()`) decides what to do.

- [x] **Task 4 — Implement `release()` and the heartbeat lifecycle (AC: 1, 2)**
  - [x] 4.1 The `release()` method on `LockHandle` is described in Task 2.6. It is the public API; the heartbeat timer state is private (closure-captured inside `acquire()`).
  - [x] 4.2 Idempotence — calling `release()` twice must not throw on the second call. Track a `released: boolean` flag on the handle (closure variable); the second call short-circuits and returns immediately.
  - [x] 4.3 The release sequence:
    1. If already released → return.
    2. Set `released = true` immediately (prevents re-entry via re-throw).
    3. `clearInterval(heartbeatTimer)` — the timer is a `Timer` object (Bun) / `Timeout` object (Node); both accept `clearInterval`.
    4. `await fs.rm(lockDir, { recursive: true, force: true })`. The `force: true` flag swallows ENOENT (the lock dir is already gone — e.g., another process force-unlocked us; rare but defensive).
    5. `info(...)` — one-line "lock released at <path>".
  - [x] 4.4 If the `rm` step throws a non-ENOENT error (e.g., permission denied — extremely rare since we created the dir), let it propagate. The caller's `try/finally` decides what to do; usually the higher-level caller wraps in another `try/catch` to surface a `LockContentionError` or a generic `StepperError`.
  - [x] 4.5 SIGINT integration — out-of-scope for this story. The lock module exposes `release()`; the SIGINT-graceful-exit story (Epic 4 Story 4.9) wires `process.on('SIGINT', () => handle.release())`. Document this dependency in the JSDoc.

- [x] **Task 5 — Implement `forceUnlock()` for `--force-unlock` UX (AC: 3)**
  - [x] 5.1 Add `export async function forceUnlock(): Promise<void>` to `src/io/lock.ts`. The function does NOT take a `confirm` argument — the prompt is the responsibility of the CLI layer (Story 1.7's argument parser / Story 1.12's `--force-unlock` handler in `commands/`). This module is foundational; it does not own user dialogue.
  - [x] 5.2 Behaviour:
    1. Compute `absoluteLockDir = path.resolve(process.cwd(), LOCK_DIR_REL)`.
    2. `assertWithinScope(LOCK_DIR_REL)` — defensive sanity check that the path is inside allowed roots. Should always pass given the canonical path; we call it anyway to maintain the AR42 invariant.
    3. `await fs.rm(absoluteLockDir, { recursive: true, force: true })` — unconditional removal. `force: true` swallows ENOENT (no-op when no lock exists).
    4. Log via `info("lock dir removed (force-unlock)")` — one-line.
  - [x] 5.3 The function MUST NOT prompt the user. The prompt `"Are you sure no other Stepper is running?"` is the higher-level CLI's responsibility (Story 1.12 — `commands/bmad-next.md` or `src/commands/next/run.ts` — depending on where the `--force-unlock` flag is wired). Document this boundary clearly: this module exposes the unconditional removal primitive; the prompt is layered on top.
  - [x] 5.4 The function MUST NOT throw on a missing lock dir (ENOENT) — `force: true` makes `rm` idempotent. If the user runs `--force-unlock` twice or runs it when no lock exists, both calls succeed silently.

- [x] **Task 6 — Align `LockContentionError.actionableHint` with AC-1 verbatim (AC: 1)**
  - [x] 6.1 The story AC-1 requires the verbatim hint string: `Run /bmad-next --doctor to inspect lock state, or /bmad-next --force-unlock if you're sure no other Stepper is running.`
  - [x] 6.2 The current `LockContentionError.actionableHint` (set in Story 1.2 `src/errors.ts` line 80–81) is `"Run /bmad-next --force-unlock if you are sure no other Stepper process is running."` — this does NOT match AC-1 verbatim (missing `--doctor` clause; `you are` vs `you're`; trailing word differs).
  - [x] 6.3 Edit `src/errors.ts` to update ONLY the `LockContentionError.actionableHint` string to the AC-1 verbatim text. Preserve the class name (`LockContentionError`), the code (`"LOCK_CONTENTION"`), the exitCode (`4`), and the `override readonly` modifiers exactly. The registry count stays at 15.
  - [x] 6.4 The new hint passes the AR22 actionable-hint regex `/^.*(Run|See|Try|Check) /` — it starts with "Run". The existing `errors.test.ts` regex assertion remains valid; no test edit needed.
  - [x] 6.5 No edit to `src/errors.test.ts` is required. The test asserts the registry count, code uniqueness, exitCode domain, and actionableHint regex — none of which depend on the exact hint string. Do not bump `toHaveLength(15)`.
  - [x] 6.6 Run `bun test src/errors.test.ts` after the edit to confirm all assertions still pass.

- [x] **Task 7 — Implement colocated unit tests at `src/io/lock.test.ts` (AC: 1, 2, 3)**
  - [x] 7.1 Create `src/io/lock.test.ts` colocated next to `src/io/lock.ts`. Use Bun-test imports: `import { afterEach, beforeEach, describe, expect, it } from "bun:test";`.
  - [x] 7.2 Use a unique tmpdir per test per AR35: `const projectRoot = os.mkdtempSync(path.join(os.tmpdir(), "stepper-lock-"))`. Mirror the lock layout under `projectRoot/_bmad-output/.stepper/state.yaml.lock/`. Use `process.chdir(projectRoot)` in `beforeEach` and `process.chdir(originalCwd)` in `afterEach` so `acquire()`'s `process.cwd()` reads the test root. Cleanup via `fs.rm(projectRoot, { recursive: true, force: true })`. **CAUTION:** Bun's test runner runs tests in parallel within a file by default; `process.chdir` is process-global. Use `describe.serial` (or a single top-level `describe` with sequential tests) to prevent races. Bun-test 1.3.x supports `it.todo`, `it.only`, `it.skip` and the standard sync execution within a `describe`; if `describe.serial` is unavailable, structure tests so each one chdirs in its own setup and chdirs back in its own teardown.
  - [x] 7.3 Test cases (minimum):
    - **First acquire success:** `const handle = await acquire(); expect(fs.existsSync(handle.lockDir)).toBe(true); expect(fs.existsSync(handle.pidFile)).toBe(true); await handle.release();`
    - **Pid file contents:** read the pid file after `acquire()`; assert `JSON.parse(...)` yields `{ pid: process.pid, hostname: os.hostname(), acquiredAt: <ISO 8601 string>, heartbeatIntervalMs: 5000 }`.
    - **Release removes the lock dir:** `await handle.release(); expect(fs.existsSync(handle.lockDir)).toBe(false)`.
    - **Idempotent release:** `await handle.release(); await handle.release()` — second call must not throw.
    - **Concurrent acquire fails:** acquire once; calling `acquire()` again from the same process should throw `LockContentionError` with `code === "LOCK_CONTENTION"` and `exitCode === 4` (cross-process is covered in Task 8).
    - **Stale lock recovery (mtime-based):** synthesise a lock dir with a pid file whose mtime is artificially set to 60s ago via `fs.utimes(pidFile, oldDate, oldDate)`; pid contents claim PID 1 (alive but irrelevant — the mtime branch should win); call `acquire()`; assert it succeeds (lock reclaimed). Verify the original lock dir was reclaimed (new pid file written with our PID).
    - **Stale lock recovery (PID-not-alive):** synthesise a lock dir with a pid file claiming PID `999999999` (effectively guaranteed-dead); set mtime to recent; call `acquire()`; assert success. Verify the new pid file claims our PID.
    - **Sub-second mtime fallback:** synthesise a pid file whose `stat.mtimeMs % 1000 === 0` (i.e., set mtime to a whole-second value); set the `mtimeAge` to 35s (between the 30s default and 60s fallback); call `acquire()`; assert it does NOT reclaim (the fallback threshold of 60s applies). Then advance the synthesised mtime to 70s ago; call `acquire()`; assert it reclaims.
    - **Malformed pid file:** synthesise a lock dir containing a `pid` file with non-JSON content (e.g., `"this is not json"`); call `acquire()`; assert it reclaims (graceful-degradation path from Task 3.3 step 2).
    - **Force-unlock removes the lock:** `await acquire()` (don't release); `await forceUnlock()`; assert the lock dir is gone. Then `await acquire()` should succeed (verifying `forceUnlock` made the lock dir genuinely available).
    - **Force-unlock on no lock:** `await forceUnlock()` with no prior `acquire()` — must not throw (idempotent).
  - [x] 7.4 Heartbeat verification (smoke):
    - Acquire the lock; record `stat.mtimeMs` of the pid file; await `setTimeout(() => ..., 6000)` (slightly over one heartbeat interval); record `stat.mtimeMs` again; assert it advanced. Use Bun's `setTimeout` (it returns a `Timer`); be mindful this is a long test (6s+) — mark with `it.timeout(15000)` if needed.
  - [x] 7.5 No `console.*` calls anywhere in the test (Biome `noConsole` rule). Use `expect(...)` for assertions; route any debug output through the `info()` import from `./log.ts` (which goes to stderr — Bun's test runner captures stderr per test).
  - [x] 7.6 Use `nodeJSError.code` narrowing for ENOENT / ESRCH assertions where applicable.

- [x] **Task 8 — Implement integration tests (AC: 4)**
  - [x] 8.1 Create the integration tests in `src/io/` (NOT `src/integration/` — Story 1.3 placed `no-write-outside-scope.test.ts` at `src/io/no-write-outside-scope.test.ts` per the dev's deviation; this story follows the same convention to keep IO-related integration tests colocated). The architecture's prescribed locations were `src/integration/concurrent-acquire.test.ts` and `src/integration/stale-lock.test.ts` (lines 1240–1241), but the project's existing pattern is `src/io/<descriptive-name>.test.ts` for cross-process IO tests.
  - [x] 8.2 Create `src/io/concurrent-acquire.test.ts` (AR36 release-blocker — tests AC-1's contention path):
    - Use Bun's `Bun.spawn` to launch a child process that acquires the lock and holds it for 5s. Use the same project tmpdir setup as Task 7 (chdir into a unique tmpdir in `beforeEach`; `cleanup` in `afterEach`).
    - The child process's entry point is a small TypeScript script written to a tmp file that imports `acquire` from `<projectRoot>/src/io/lock.ts` (use absolute path), calls it, sleeps 5s via `await Bun.sleep(5000)`, then releases. Pass the project tmpdir as a `cwd` option to `Bun.spawn` so the child's `process.cwd()` matches.
    - **Alternative (simpler) approach:** instead of spawning a real child, create the lock dir + pid file manually with the parent's PID (i.e., still alive) and recent mtime. Then call `acquire()` from the test process — this exercises the EEXIST + live-PID branch from `evaluateStaleness()` (Task 3.3 step 5–6). This is simpler than `Bun.spawn` and exercises the same code path; the cost is that it tests `acquire()`'s response to a third-party-held lock, not actual concurrent processes. Document the choice in the test file's top-level comment.
    - Either way: assert the second `acquire()` call (from the test process) throws `LockContentionError` with `exitCode === 4` and the AC-1 verbatim hint string.
  - [x] 8.3 Create `src/io/stale-lock.test.ts` (AR36 release-blocker — tests AC-2's recovery path):
    - **Variant 1 (kill -9 simulation):** create a lock dir with a pid file claiming a guaranteed-dead PID (e.g., `9999999`) and a recent mtime; call `acquire()`; assert success (PID-not-alive branch reclaims). Verify the pid file post-acquire claims our PID.
    - **Variant 2 (suspended-process simulation, mtime-based):** create a lock dir with a pid file claiming our own PID (so the liveness check passes — we're alive) but with mtime set to 35s ago; call `acquire()`; assert success (mtime-stale branch reclaims). This simulates the suspended-process heartbeat-loss scenario from AC-4.
    - **Variant 3 (sub-second-mtime filesystem fallback):** create a lock dir with a pid file whose mtime is exactly a whole-second value (e.g., `new Date(Math.floor(Date.now()/1000)*1000)`); set the apparent age to 35s (between 30s default and 60s fallback); call `acquire()`; assert it does NOT reclaim. Then advance the synthesised mtime so the apparent age is 70s; call `acquire()`; assert it reclaims. Test asserts the warning was emitted (capture via `spyOn(process.stderr, "write")`).
  - [x] 8.4 Create `src/io/force-unlock.test.ts` (AR36 release-blocker — tests AC-3's UX):
    - **Variant 1 (force-unlock removes the lock):** acquire the lock; call `forceUnlock()`; assert the lock dir is gone.
    - **Variant 2 (force-unlock + new acquire):** acquire; force-unlock; new acquire; assert success (the lock dir was genuinely freed).
    - **Variant 3 (force-unlock on no lock is idempotent):** call `forceUnlock()` without prior acquire; assert no throw, no error.
    - **Note:** the prompt `"Are you sure no other Stepper is running?"` is NOT exercised here — that lives in the CLI layer (Story 1.12). The integration test verifies the underlying primitive only.
  - [x] 8.5 All three integration tests follow the AR35 unique-tmpdir pattern; no test touches the real `_bmad-output/.stepper/`.
  - [x] 8.6 No `console.*` calls (Biome `noConsole` rule).

- [x] **Task 9 — Verify `bun run check` exits 0 (AC: 1, 2, 3, 4)**
  - [x] 9.1 Run `bunx biome check . --write` to auto-fix any formatting; then `bunx biome ci .` to confirm exit 0. The new files `src/io/lock.ts`, `src/io/lock.test.ts`, `src/io/concurrent-acquire.test.ts`, `src/io/stale-lock.test.ts`, `src/io/force-unlock.test.ts`, plus the edited `src/errors.ts`, MUST all pass Biome 2.3.15 lint + format.
  - [x] 9.2 Run `bun test` (full suite); confirm all green. Expected files after this story: `src/errors.test.ts` (Story 1.2), `src/io/log.test.ts`, `src/io/paths.test.ts`, `src/io/atomic-write.test.ts`, `src/io/no-write-outside-scope.test.ts` (all Story 1.3), plus `src/io/lock.test.ts`, `src/io/concurrent-acquire.test.ts`, `src/io/stale-lock.test.ts`, `src/io/force-unlock.test.ts` (this story). 9 test files total.
  - [x] 9.3 Run each new test file standalone via `bun test src/io/lock.test.ts` etc.; assert exit 0 each.
  - [x] 9.4 Run `bun run check` (the composite release-blocker gate) and confirm exit 0.
  - [x] 9.5 Run `bunx tsc --noEmit` (defensive) and confirm exit 0.
  - [x] 9.6 Wall-time budget: the heartbeat-verification test (Task 7.4) takes ~6s. The total `bun test` should still complete in under 30s on macOS/Linux.

- [x] **Task 10 — Final story-level sanity check (AC: 1, 2, 3, 4)**
  - [x] 10.1 Confirm the file count: exactly **five** new files under `src/io/` (`lock.ts`, `lock.test.ts`, `concurrent-acquire.test.ts`, `stale-lock.test.ts`, `force-unlock.test.ts`). Plus **one modified file** (`src/errors.ts`) for the actionable hint update.
  - [x] 10.2 Confirm no edits to: `package.json`, `tsconfig.json`, `biome.json`, `bunfig.toml`, `.github/workflows/ci.yml`, `.claude-plugin/plugin.json`, `commands/bmad-next.md`, `bun.lock`, `src/io/log.ts`, `src/io/paths.ts`, `src/io/atomic-write.ts`, `src/io/no-write-outside-scope.test.ts`, `src/errors.test.ts`. This story is source-only (lock module + tests) plus the verbatim-hint edit to `src/errors.ts`.
  - [x] 10.3 Confirm no edits to anything under `_bmad-output/.stepper/` (the persistence boundary AR42 — `_bmad-output/.stepper/` does not exist yet anyway, but assert intent).
  - [x] 10.4 Confirm `src/io/lock.ts` has zero imports from non-foundational modules. Allowed: `node:fs/promises`, `node:os`, `node:path`, `./paths.ts`, `../errors.ts`. Forbidden: any import from `src/state/`, `src/dag/`, `src/commands/`, `src/schemas/`, `src/migrations/`, etc.
  - [x] 10.5 Update this story file's Status to `review` upon completion (the dev-story workflow handles this — bmad-create-story leaves it `ready-for-dev`).

## Dev Notes

### Architecture Compliance — What the Dev Agent MUST Follow

This story implements the **D4 lock decision** verbatim (architecture lines 371–387) and operationalises **NFR-R4** (clean halt on stale lock with `--force-unlock` remediation, PRD line 776), **FR15** (concurrent invocations detected and remediated), **FR24** (graceful exit on SIGINT releases the lock — substrate only; the SIGINT handler itself is Epic 4 Story 4.9), **NFR-S2** (writes only inside scope — lock dir is at exactly `_bmad-output/.stepper/state.yaml.lock/` per AR42), **NFR-S5** (atomic writes for shared state — the `mkdir` is the atomic acquire primitive), **NFR-R1** (zero data loss on halt — `try/finally` release path).

#### AR41 — Module boundary graph (verbatim, partial)

> Foundational (no upward imports): `errors.ts`, `schemas/`, `io/`. Mid-level: `migrations/`, `state/`, `bmad-detect/`, `personas/`, `dag/`, `transcript/`, `telemetry/`, `upgrade/`. Higher-level: `verifiers/`, `dispatch/`, `failure-ux/`. Top-level: `commands/`. Enforced by Biome import-restriction rule or hand-rolled CI test.

`src/io/lock.ts` joins `log.ts`, `paths.ts`, and `atomic-write.ts` in the foundational tier. **Allowed imports:**

- `node:fs/promises` for `fs.mkdir`, `fs.rm`, `fs.utimes`, `fs.stat`, `fs.readFile`, `fs.writeFile` (justified per AR43 — side-effect-free standard module; same justification as Story 1.3's `atomic-write.ts`).
- `node:os` for `os.hostname()` (the pid file's `hostname` field per architecture §D4 line 378).
- `node:path` for `path.resolve`, `path.join` (filesystem-safe path manipulation).
- `./paths.ts` (sibling foundational): `STEPPER_INTERNAL_ROOT`, `assertWithinScope`.
- `../errors.ts` (sibling foundational): `LockContentionError`. The same cross-foundational pattern Story 1.3 used for `paths.ts` importing `PathologicalInputError`.
- Bun globals: `Bun.write` (no import line needed); `process.pid`, `process.cwd()`, `process.kill()`, `process.stdout`, `process.stderr` (no import line needed).

**Forbidden imports in `src/io/lock.ts`:**

- `src/state/`, `src/dag/`, `src/commands/`, `src/schemas/`, `src/migrations/`, `src/personas/`, `src/transcript/`, `src/telemetry/`, `src/upgrade/`, `src/bmad-detect/`, `src/verifiers/`, `src/dispatch/`, `src/failure-ux/`. These are all consumers of `io/`, not producers.

The boundary will be enforced by a Biome import-restriction rule or a hand-rolled CI test in a later story (Epic 6); for now, manual review.

#### AR42 — Persistence boundary (verbatim)

> Reads allowed from `_bmad-output/.stepper/**`, `_bmad-output/**`, `_bmad/**`, `docs/**`, `bmad-stepper.config.yaml`, `~/.claude/plugins/<bmad>/**`. Writes only to `_bmad-output/.stepper/**` and `_bmad-output/**` (artifact promotion). NEVER to `_bmad/**` or `~/.claude/plugins/<bmad>/**`. Lock only at `_bmad-output/.stepper/state.yaml.lock/`.

The lock dir is `_bmad-output/.stepper/state.yaml.lock/` — exactly that path, no other. Hardcoded as `LOCK_DIR_REL` in `src/io/lock.ts`. Defensive `assertWithinScope()` calls at the top of `acquire()` and `forceUnlock()` keep the AR42 invariant enforceable.

#### AR33 — Function & error semantics (verbatim, partial)

> Throw `StepperError` subclasses (no `Result<T,E>` in general code path). `try/finally` in dispatch loops. Bun-native APIs preferred (`Bun.file`, `Bun.write`, `Bun.YAML.parse`, `Bun.spawn`). No `any`. No `console.log` in runtime — use `src/io/log.ts`.

The lock module's contention path throws `LockContentionError` (already in the registry from Story 1.2 — see Task 6 for the hint update). The `release()` method is wrapped in `try/finally` semantics by callers (Story 1.6 onwards). `Bun.write` is used for the pid file (Task 2.4) per the Bun-native preference. No `any` types — `evaluateStaleness()` parses pid file JSON with explicit narrowing. No `console.*` calls — `info`/`warn`/`error` from `./log.ts` are the sanctioned APIs.

#### Architecture §D4 — File locking (verbatim, full)

> 1. **Acquire:** `mkdir(state.yaml.lock)`. If it succeeds, we have the lock. If it fails with `EEXIST`, the lock is held — read the `pid` file inside, evaluate staleness (heartbeat `mtime`), retry with backoff or fail with `LOCK_CONTENTION` (exit code 4).
> 2. **Heartbeat:** while holding the lock, every 5 seconds, update `mtime` of `state.yaml.lock/pid` (e.g., `utimes` syscall). The pid file contains JSON validated by Zod: `{ pid: number, hostname: string, acquiredAt: string, heartbeatInterval: 5 }`.
> 3. **Stale detection:** if `mtime` is more than 30 seconds old, the lock is considered stale. The PID is checked: if the process is alive, treat the lock as live (race window — abort and ask user). If the PID is not alive (`kill(pid, 0)` returns ESRCH), the lock is removed and re-acquired.
> 4. **Release:** `rm -rf state.yaml.lock` (atomic dir removal). Always wrapped in `try/finally`.
> 5. **Force unlock:** `--force-unlock` flag removes the lock dir unconditionally (after warning user). Maps to NFR-R4.
> **Why mkdir over `O_EXCL` or fcntl/flock:** mkdir is atomic on every filesystem including NFS; `O_EXCL` is broken on NFS; `flock`/`fcontl` are POSIX-only and have edge cases on shared FS.

This story implements steps 1, 2, 3, 4, 5 in `src/io/lock.ts`. The Zod validation of the pid file (step 2's "validated by Zod") is deferred to Story 1.5 — for v0.1 of the lock module, an inline TypeScript narrowing is sufficient. The dev agent SHOULD note this in the JSDoc and ensure the inline shape is structurally compatible with what Story 1.5 will define in `src/schemas/pid.ts`.

The "retry with backoff" phrasing in step 1 — for v0.1 of the lock module, **there is no backoff loop**. The dev agent's `acquire()` does at most ONE retry (after reclaiming a stale lock). If the second `mkdir` also throws EEXIST (i.e., another process raced us to acquire after we just reclaimed), the third attempt throws `LockContentionError` immediately. This matches PRD's "documented exit codes" simplicity stance — Stepper does not run a backoff loop; it fails fast with an actionable hint.

#### Sub-second mtime filesystem fallback (architecture §D4 line 387, AC-4)

The architecture mentions: "behavior on filesystems lacking sub-second `mtime` (warn and fall back to 60-second stale threshold)." Older filesystems (FAT32, some NFS configurations) round mtime to whole seconds. If our heartbeat (which fires every 5s and updates mtime) lands on a filesystem with whole-second mtime, the resolution is too coarse to detect a 30s-stale lock reliably (because mtime-age can drift by ±1s per round-trip). The fallback: if `stat.mtimeMs % 1000 === 0` (heuristic for "filesystem rounds to whole seconds"), use a 60-second stale threshold instead. This trades responsiveness for correctness on the older filesystems.

The dev agent SHOULD log a one-line warning when the fallback triggers (Task 3.3 step 4): `"filesystem lacks sub-second mtime; using 60s stale threshold"`. The user is rare in v0.1 (most modern Linux/macOS filesystems are sub-second-mtime-capable) but the warning surfaces the diagnostic.

**Edge case the dev agent should not over-engineer:** the heuristic `mtimeMs % 1000 === 0` is imperfect — a sub-second-mtime filesystem MIGHT happen to produce a whole-second value once in a while if the `utimes` call lands on a millisecond boundary. The trade-off: a single false positive triggers a one-line warning and uses a 60s threshold for that particular check, which is harmless. False negatives (whole-second filesystem appearing as sub-second) are eliminated by the always-correct stricter 30s default. v0.1 accepts this asymmetric trade-off.

#### Story 1.6 will consume `src/io/lock.ts` (forward dependency)

Story 1.6 (state subsystem) is the first consumer. Its skeleton will follow:

```typescript
import { acquire } from "../io/lock.ts";
// ...
async function saveState(state: State): Promise<void> {
  const handle = await acquire();
  try {
    // read-modify-write of state.yaml here
    await atomicWrite(STATE_PATH, yamlSerialise(state));
  } finally {
    await handle.release();
  }
}
```

The dev agent should confirm the public API of `src/io/lock.ts` matches this consumption pattern: `acquire()` returns a `LockHandle` with a `release()` method; the `try/finally` around the body is the canonical usage.

### Source Tree — Exact Files to Create or Modify

This story creates exactly **five new files** under `src/io/` and modifies exactly **one existing file** (`src/errors.ts`) for the actionable-hint alignment.

**Files created:**

```
bmad-stepper/
└── src/
    └── io/
        ├── lock.ts                          # mkdir-based lock + heartbeat (D4, FR R4)
        ├── lock.test.ts                     # acquire/release/staleness unit tests
        ├── concurrent-acquire.test.ts       # contention path integration test
        ├── stale-lock.test.ts               # PID-dead + suspended-mtime + sub-second fallback
        └── force-unlock.test.ts             # --force-unlock primitive UX
```

**Files modified:**

- `src/errors.ts` — update `LockContentionError.actionableHint` to the AC-1 verbatim string `"Run /bmad-next --doctor to inspect lock state, or /bmad-next --force-unlock if you're sure no other Stepper is running."` (no other changes; class name, code, exitCode preserved).

**Files NOT modified (preserved verbatim from Stories 1.1 + 1.2 + 1.3):**

- `package.json`, `tsconfig.json`, `biome.json`, `bunfig.toml`, `bun.lock`.
- `.github/workflows/ci.yml`, `.claude-plugin/plugin.json`, `commands/bmad-next.md`.
- `.gitignore`, `LICENSE`.
- All `_bmad/`, `_bmad-output/planning-artifacts/`, `docs/`, `.changeset/` files.
- All Story 1.3 IO files: `src/io/log.ts`, `src/io/paths.ts`, `src/io/atomic-write.ts`, `src/io/no-write-outside-scope.test.ts`, plus their colocated tests.
- `src/errors.test.ts` (the registry-count assertion stays at 15).

### Testing Requirements

- **`bun test` MUST pass with at least 9 test files** discovered.
- **Each new test file MUST exit 0 standalone:** `bun test src/io/lock.test.ts`, etc.
- **Total expected test count:** Story 1.3's 5 files contributed ~44 tests; this story adds ~10–15 unit tests in `lock.test.ts` and ~3 each in the three integration tests. Aim for ~60–65 total it(...) blocks across the project after Story 1.4 lands.
- **Run-time budget:** the heartbeat-verification test (Task 7.4) takes ~6s; the rest are sub-second. Total `bun test` should complete in under 30s on macOS/Linux.
- **`bunx biome ci .`** MUST exit 0 against the new files.
- **`bun run check`** MUST exit 0 (composite release-blocker).
- **CI matrix** (`ubuntu-latest`, `macos-latest` per Story 1.1 `ci.yml`) MUST be green on first push. The lock module relies on POSIX `mkdir`, `utimes`, `kill(pid, 0)` semantics — both Linux and macOS provide these; Windows is out of scope per AR43.
- **Process-global state caveat:** `process.chdir` (Task 7.2) is process-global. Bun's test runner runs tests within a file sequentially by default (Bun docs: "Tests within a file run in order"); cross-file parallelism is fine because each file gets its own process-wide chdir baseline. If the dev agent observes test races, fall back to passing an explicit `projectRoot` argument to `acquire()` (an additive non-breaking change to the API — the signature becomes `acquire({ projectRoot?: string } = {})` with default `process.cwd()`). Document the choice in Completion Notes.

### Test Design — Bun-test specifics

- The Bun test runner is invoked via `bun test`. Default test discovery globs `**/*.test.ts` — all four new test files (`lock.test.ts`, `concurrent-acquire.test.ts`, `stale-lock.test.ts`, `force-unlock.test.ts`) are picked up automatically.
- Imports use the `bun:test` namespace: `import { afterEach, beforeEach, describe, expect, it } from "bun:test";`. This story adds heavy use of `beforeEach`/`afterEach` (for tmpdir + chdir setup/teardown) and conditional `spyOn` (for warning-emission assertions in the sub-second-mtime fallback test).
- `tsconfig.json` flags (no changes since Story 1.3): `strict: true`, `verbatimModuleSyntax: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`. Sibling imports use `from "./lock.ts"` etc. with the `.ts` extension.
- Bun's `Bun.spawn` is the canonical subprocess primitive — used in the optional concurrent-acquire test variant 1 (Task 8.2). The simpler variant 2 (synthesise a held lock with a live PID) avoids subprocess complexity at the cost of less fidelity to the cross-process scenario; either is acceptable for v0.1.
- `process.kill(pid, 0)` is the Bun-supported liveness probe. Its return value is `true` (or no throw) on success; on dead PID it throws `Error` with `(err as NodeJS.ErrnoException).code === "ESRCH"`. EPERM means "exists but inaccessible" — treat as alive for safety.

### File Structure Requirements — Final Check

Before declaring this story done, the dev agent MUST verify ALL of these checks pass:

1. **`src/io/lock.ts`** exists; exports `acquire`, `forceUnlock`, `LockHandle`, plus the constants `LOCK_DIR_REL`, `PID_FILE_NAME`, `HEARTBEAT_INTERVAL_MS`, `STALE_THRESHOLD_MS`, `STALE_THRESHOLD_FALLBACK_MS`.
2. **`src/io/lock.test.ts`** exists colocated; covers acquire, release, idempotent-release, contention-from-same-process, stale-mtime, stale-pid, sub-second-mtime-fallback, malformed-pid-file, force-unlock primitive.
3. **`src/io/concurrent-acquire.test.ts`** exists; tests the EEXIST + live-PID branch (AC-1's contention path).
4. **`src/io/stale-lock.test.ts`** exists; tests the PID-not-alive, suspended-process-mtime, and sub-second-mtime-fallback recovery paths (AC-2 + AC-4).
5. **`src/io/force-unlock.test.ts`** exists; tests `forceUnlock()` removal, idempotence, and acquire-after-force-unlock (AC-3 primitive).
6. **`src/errors.ts`** updated `LockContentionError.actionableHint` to AC-1 verbatim.
7. **`src/errors.test.ts`** is unchanged (registry count stays at 15).
8. **`bun test` exits 0** with all 9 test files reported as run.
9. **`bunx biome ci .` exits 0** against the new files.
10. **`bun run check` exits 0** (the release-blocker gate).
11. **No imports outside foundational scope** in `src/io/lock.ts` (AR41).
12. **`package.json`, `tsconfig.json`, `biome.json`, `bunfig.toml`, `.github/workflows/ci.yml`, `.claude-plugin/plugin.json`, `commands/bmad-next.md`** are byte-identical to their Story 1.3 state.
13. **No edits to `_bmad-output/.stepper/`** (the persistence boundary AR42 — the directory does not exist yet anyway).
14. **Status flipped to `review`** upon dev-story completion (handled by dev-story workflow).

### Code Quality Enforcement (AR36)

- **Biome 2.3.15 only.** No ESLint, no Prettier. The `biome.json` from Story 1.1 is canonical.
- **`noConsole: "error"`** — blocks all `console.*` calls everywhere. Use `info`/`warn`/`error` from `src/io/log.ts` (Story 1.3) for diagnostic output. Use `expect(...)` (not `console.log`) in tests.
- **`noImplicitAnyLet: "error"`** — every `let` declaration must have an explicit type. Prefer `const`. Particularly relevant in `evaluateStaleness()` where the dev agent might be tempted to write `let pidAlive` — declare the type explicitly: `let pidAlive: boolean = false;` (or restructure to `const pidAlive = ...` via an immediately-invoked-pattern expression).
- **`noUnusedVariables: "error"`** — every imported symbol must be used. Don't import `os.userInfo` if you don't call it.
- **`noShadowRestrictedNames`** — avoid `let path = ...` if you've already imported `* as path from "node:path"`. Use `lockPath` / `pidPath` parameter names. Same caveat as Story 1.3's `atomic-write.ts` (the dev agent there used `targetPath`).
- **Import organisation:** Biome 2.3.15's `assist/source/organizeImports` rule expects alphabetical imports with type-only imports last. Sort: `node:fs/promises`, `node:os`, `node:path`, then `./paths.ts`, then `../errors.ts`. Type-only imports (e.g., `import type { ... }`) come after value imports.

### Naming Conventions (AR31, applied to Source TS)

- **Filenames:** `kebab-case.ts` — `lock.ts`, `lock.test.ts`, `concurrent-acquire.test.ts`, `stale-lock.test.ts`, `force-unlock.test.ts`.
- **Function names:** `camelCase` — `acquire`, `forceUnlock`, `evaluateStaleness`, `release`.
- **Type/interface names:** `PascalCase` — `LockHandle`, `PidFileContents`.
- **Constants:** `SCREAMING_SNAKE_CASE` — `LOCK_DIR_REL`, `PID_FILE_NAME`, `HEARTBEAT_INTERVAL_MS`, `STALE_THRESHOLD_MS`, `STALE_THRESHOLD_FALLBACK_MS`.
- **Test names:** descriptive lower-case strings inside `it(...)` calls — `it("acquires the lock and writes a pid file with the current PID")`, `it("reclaims a stale lock when the PID is dead")`.

### Module Boundary Graph (AR41) — Third Enforcement Point

Stories 1.2 and 1.3 were the first two enforcement points. This story is the third — `src/io/lock.ts` joins `errors.ts`, `log.ts`, `paths.ts`, and `atomic-write.ts` in the foundational tier.

`src/io/lock.ts` MAY import from `./paths.ts` (sibling within `src/io/`) and from `../errors.ts` (sibling foundational). It MAY import `node:fs/promises`, `node:os`, `node:path` (justified per AR43 — side-effect-free standard modules). It MUST NOT import from any non-foundational module.

The integration test files (`concurrent-acquire.test.ts`, `stale-lock.test.ts`, `force-unlock.test.ts`) MAY import from `bun:test`, `node:fs/promises`, `node:os`, `node:path`, `node:child_process` (if needed for `spawn`-based tests), and from the modules under test (`./lock.ts`, `../errors.ts`). Integration tests are explicitly cross-module per AR32.

### Persistence Boundary (AR42)

`_bmad-output/.stepper/` does not exist yet. The dev agent MUST NOT create it during this story. The lock tests run inside a unique tmpdir (via `os.mkdtempSync`) and never touch the real `_bmad-output/.stepper/` (per AR35). Tests use `process.chdir` to redirect `process.cwd()` so `acquire()`'s relative-path resolution lands in the tmpdir.

The `LOCK_DIR_REL` constant is `"_bmad-output/.stepper/state.yaml.lock"` — exactly the canonical path from architecture line 344. Hardcoded; not configurable; not parameterisable in v0.1. (Future stories MAY add an optional `{ projectRoot?: string }` parameter to `acquire()` for testing — see Testing Requirements above.)

### Documentation Within This Story

This story does NOT ship `docs/locking.md`, `docs/exit-codes.md`, or any other narrative documentation. Story 1.13 (Quick-Start Documentation) owns the public-facing docs; the JSDoc comments in `src/io/lock.ts` are the single source of truth for the lock semantics in v0.1.

The updated `LockContentionError.actionableHint` (Task 6 — `"Run /bmad-next --doctor to inspect lock state, or /bmad-next --force-unlock if you're sure no other Stepper is running."`) is the user-facing description of the contention path; `docs/exit-codes.md` (Story 1.13) will be a tabular projection.

### Previous Story Intelligence (from Story 1.3 — `done` status)

Story 1.3 landed `src/io/log.ts`, `src/io/paths.ts`, `src/io/atomic-write.ts`, plus `src/io/no-write-outside-scope.test.ts`, plus colocated tests for each. Status: `done` per `sprint-status.yaml`. Key learnings the dev agent should fold into this story's execution:

#### Project Structure (from 1.3 File List section)

- `src/io/` directory exists with: `log.ts`, `paths.ts`, `atomic-write.ts`, `no-write-outside-scope.test.ts`, plus colocated tests. Story 1.4's `lock.ts` and its four test files join this directory.
- `src/integration/` does **NOT** exist. Story 1.3 deviated from the architecture's prescribed `src/integration/` location and placed `no-write-outside-scope.test.ts` at `src/io/no-write-outside-scope.test.ts`. This story follows the same convention — `concurrent-acquire.test.ts`, `stale-lock.test.ts`, and `force-unlock.test.ts` go under `src/io/`, NOT `src/integration/`. Document the deviation in Completion Notes; cite Story 1.3's precedent.
- The error registry has exactly 15 entries (`LockContentionError` through `MigrationFailureError`). Story 1.3's `assertWithinScope` deliberately did NOT add a 16th `SCOPE_VIOLATION` entry — instead it routes scope violations through `PathologicalInputError` with a `"SCOPE_VIOLATION:"` message prefix. This story preserves the 15-entry count; the only edit to `src/errors.ts` is the actionable-hint update for `LockContentionError`.
- The abstract `StepperError` base class sets `this.name = new.target.name` in its constructor. Reuse Story 1.2's pattern when constructing `LockContentionError` instances — the `name` field will be `"LockContentionError"` automatically.

#### IO Primitives Available (Story 1.3 outputs)

- **`info(message: string): void`** — writes `${message}\n` to stderr. Use for one-line operational logs (e.g., "lock acquired at /path/to/state.yaml.lock", "stale lock reclaimed").
- **`warn(message: string): void`** — same as `info` but semantically a warning. Use for filesystem-fallback notices (sub-second mtime warning, transient utimes failure).
- **`error(message: string): void`** — same routing; semantically an error. Use sparingly — the AR33 / FR46 pattern is to throw a `StepperError` subclass instead, and let the top-level handler call `error(stepperError.actionableHint)` exactly once.
- **`json(payload: unknown): void`** — writes JSON to stdout. NOT used by the lock module (lock is a runtime concern, not a `--export-state` concern). Listed for completeness.
- **`atomicWrite(targetPath: string, contents: string | Uint8Array): Promise<void>`** — tmp+rename + `.bak` rotation. **NOT used by the lock module** because (a) the pid file is metadata, not canonical state; (b) `.bak` rotation isn't needed for a per-lock-lifetime file; (c) the atomic step is the parent `mkdir`. The lock writes the pid file via `Bun.write` directly (Task 2.4).
- **`assertWithinScope(targetPath: string): void`** — throws `PathologicalInputError` (with `"SCOPE_VIOLATION:"` message prefix) if the path is outside `_bmad-output/.stepper/**`, `_bmad-output/**`, or `os.tmpdir()`. **Used by the lock module** in `acquire()` and `forceUnlock()` for the defensive sanity check (Task 5.2 step 2).
- **`STEPPER_INTERNAL_ROOT`**, **`BMAD_OUTPUT_ROOT`** — exported constants for path construction. Use `STEPPER_INTERNAL_ROOT + "/state.yaml.lock"` to construct the lock path consistently with the rest of the project.

#### Bun-test conventions established in Story 1.3

- `import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";` — the Story 1.3 test pattern. This story uses the same set plus possibly nothing additional. (Bun-test does NOT export `describe.serial`; tests within a file run sequentially by default.)
- `os.mkdtempSync(path.join(os.tmpdir(), "stepper-<topic>-"))` — the canonical unique-tmpdir pattern from Story 1.3's `atomic-write.test.ts` and `no-write-outside-scope.test.ts`. Use `"stepper-lock-"` prefix for this story.
- Cleanup via `await fs.rm(dir, { recursive: true, force: true })` in `afterEach`. The `force: true` swallows ENOENT.
- `tsconfig.json`'s `noUncheckedIndexedAccess: true` — array indexing returns `T | undefined`. Prefer `for (const x of xs)` over `xs[0]` indexed access.
- `tsconfig.json`'s `verbatimModuleSyntax: true` — type-only imports MUST use `import type` (e.g., `import type { LockHandle } from "./lock.ts";`). Mixed-imports allow `import { acquire, type LockHandle } from "./lock.ts";`.
- `tsconfig.json`'s `allowImportingTsExtensions: true` — sibling imports use the `.ts` extension. Do NOT use extensionless imports.

#### Biome 2.3.15 rule renames (CRITICAL — reaffirmed in 1.3)

- `suspicious.noConsoleLog` was **renamed** to `suspicious.noConsole` between Biome 2.3.0 and 2.3.15. The architecture §P8 canonical config (line 978) uses the old name; the project's `biome.json` (Story 1.1) uses the new name. Story 1.3's Completion Notes restated this; Story 1.4 also operates under the new name.
- `style.noImplicitAnyLet` was **moved** to `suspicious.noImplicitAnyLet` in Biome 2.3.15. Story 1.1's `biome.json` reflects this. Always declare explicit types on `let` (or use `const`).
- Story 1.3 did NOT need to touch `biome.json` and neither does Story 1.4.

#### Naming + File Layout (from 1.3 dev guardrails — still apply)

- Filenames: `kebab-case.ts`. Test file: `<source>.test.ts` colocated.
- TS classes: `PascalCase` ending in `Error` for error classes (`LockContentionError` — already exists; this story does NOT add new error classes).
- TS variables/functions: `camelCase` (`acquire`, `forceUnlock`, `evaluateStaleness`).
- Constants and string-literal codes: `SCREAMING_SNAKE_CASE` (`LOCK_DIR_REL`, `HEARTBEAT_INTERVAL_MS`).
- No `I`-prefixed interfaces.
- ESM exclusively (`package.json` has `"type": "module"`). No CommonJS.

#### Forbidden Actions (from 1.3 dev guardrails — still apply)

- **Do NOT add `tsc`-based build steps.** Bun runs `.ts` source directly; `tsconfig.json` has `noEmit: true`.
- **Do NOT add `dist/`, `build/`, or any output directory.** Source = release.
- **Do NOT add `commander`, `oclif`, `yargs`, `jest`, `vitest`, `mocha`.**
- **Do NOT add `proper-lockfile`, `lockfile`, or any third-party lock library.** Architecture §D4 line 385 explicitly forbids the dependency: "Why no `proper-lockfile` dep: ... the algorithm itself is ~80 lines of TS. Keeping the runtime-deps surface to Bun stdlib + Zod is a PRD constraint."
- **Do NOT add `package-lock.json` or `yarn.lock`.** Only `bun.lock` (text) is the lockfile.
- **Do NOT add ESLint or Prettier.** Biome 2.3.15 is the only linter/formatter (AR36).
- **Do NOT touch `_bmad/` or `_bmad-output/planning-artifacts/`.** Those are managed by other tooling.
- **Do NOT publish, tag, or push a release.** Version stays at `0.0.0` until Epic 6.
- **Do NOT add native Windows support.** Linux + macOS only in v0.1.

#### Story 1.3 Senior Developer Review — outcome

Story 1.3's review outcome was `approve` (the dev applied a deviation re: error-registry edits — routing through existing `PathologicalInputError` instead of adding `ScopeViolationError` — which the reviewer endorsed as "preserves registry CI gate count and is structurally equivalent"). The pattern (single foundational TS file + colocated test + multiple integration test files for cross-process scenarios) is the template for this story too.

#### Bun host version + lockfile state (from 1.1 + 1.2 + 1.3)

- Bun 1.3.12 on the executing host (satisfies AR2's `≥ 1.3` pin).
- Lockfile is `bun.lock` (text format) — Bun 1.2+ defaults to text. **DO NOT bump or modify** `bun.lock` in this story (no new dependencies required — `node:fs/promises`, `node:os`, `node:path` are standard library).
- Biome 2.3.15 exact-pinned. Zod 4.4.1 also pinned but **NOT used in this story** — `src/io/` is below the schema layer (AR41); Zod is introduced in Story 1.5.

### Latest Tech Information (v0.1.0 release window)

Versions are pinned per AR2 — no further web research is required for this story. No package install or upgrade needed. The dev agent MUST NOT run `bun add` / `bun install --save` during this story. If `bun install` is run for any reason (e.g., to verify lockfile state), the `bun.lock` MUST remain byte-identical.

### Project Structure Notes — Anticipated Variances

- **No new directory creation:** all five new files live under the existing `src/io/`. No `src/integration/` directory is created (Story 1.3's deviation continues).
- **No `src/io/index.ts` barrel:** v0.1 does not use barrel exports. Every consumer imports by full path: `import { acquire } from "../io/lock.ts";`. The architecture's source tree shows `src/io/index.ts` as a placeholder (line 1197) but Story 1.4 does NOT create it (YAGNI).
- **No `src/schemas/pid.ts`:** Story 1.5 will create it. For v0.1 of the lock module, the pid file shape is an inline TypeScript interface (Task 1.4); when Story 1.5 lands, the lock module will import from `src/schemas/pid.ts` and validate via Zod.
- **No `src/io/snapshot.ts`:** Story 1.8 will create it. The `lastSnapshot` branch+sha capture (architecture §D10 layer 1) is orthogonal to locking.
- **`tsconfig.json`'s `noUncheckedIndexedAccess`:** array indexing returns `T | undefined`. In tests, prefer `for (const x of xs)` or `instances.entries()` patterns over `xs[0]` indexed access.
- **`tsconfig.json`'s `verbatimModuleSyntax`:** type-only imports MUST use `import type` (e.g., `import type { LockHandle } from "./lock.ts";`).
- **`tsconfig.json`'s `allowImportingTsExtensions`:** all sibling imports use the `.ts` extension. Do NOT use extensionless imports.

### Dev Agent Guardrails — Do Not Do These Things

In addition to the Story 1.3 guardrails (still in force):

- **Do NOT add `console.log` / `console.error` / `console.warn` / `console.info` anywhere.** Biome's `noConsole` rule blocks ALL `console.*` calls. Use `info`/`warn`/`error` from `src/io/log.ts` for any diagnostic output. Use `expect(...)` (not `console.log`) in tests.
- **Do NOT shadow the `path` module name.** `import * as path from "node:path";` then use `lockPath` / `pidPath` / etc. as parameter names. `let path = ...` shadows the import (and is also blocked by Biome's `noShadowRestrictedNames`).
- **Do NOT use `node:fs` (sync).** Use `node:fs/promises` for `fs.mkdir`, `fs.rm`, `fs.utimes`, `fs.stat`, `fs.readFile`. Bun's runtime supports both, but the architecture's bias is async/await throughout (P4: "Async style: always `async/await`"). The one allowed sync exception is `os.mkdtempSync` in tests (Story 1.3 precedent — synchronous tmpdir creation in `beforeEach` is idiomatic).
- **Do NOT use `Bun.write` for the canonical state.yaml** — that's Story 1.6's concern. This story writes only the inner pid file, which is metadata, not canonical state.
- **Do NOT bypass `assertWithinScope` in `acquire()` or `forceUnlock()`.** Even though the path is hardcoded and always inside `_bmad-output/.stepper/`, the defensive sanity check enforces AR42 explicitly.
- **Do NOT add a Biome `overrides` block** to whitelist any file. The new files all comply with `noConsole: "error"` because they use `info`/`warn`/`error` from `src/io/log.ts` (which uses `process.stdout.write` / `process.stderr.write` directly, not `console.*`).
- **Do NOT modify any file outside the five new files + the actionable-hint edit to `src/errors.ts`.** Story 1.1 + 1.2 + 1.3 scaffold preservation applies.
- **Do NOT add a third-party lock library.** Architecture §D4 line 385 explicitly forbids the dependency.
- **Do NOT introduce a runtime dep on `node:util`, `node:assert`, `node:child_process` outside test files, etc.** `node:fs/promises`, `node:os`, `node:path` are the only allowed `node:*` modules in `src/io/lock.ts`; everything else needs explicit justification per AR43. Test files MAY use `node:child_process` if they choose Bun.spawn alternatives but MUST justify in JSDoc.
- **Do NOT release the lock from outside the `LockHandle.release()` method.** The handle is the single source of truth for ownership; raw `fs.rm(lockDir)` calls outside `release()` (or `forceUnlock()`) are forbidden.
- **Do NOT skip the heartbeat timer setup in `acquire()`.** The 5s heartbeat is required by AC-1; without it, every acquired lock would appear stale to the next `acquire()` after 30s.
- **Do NOT poll `mkdir` in a tight loop.** v0.1 has no backoff; one retry after stale-reclaim, then throw `LockContentionError`.

### Git Intelligence

The recent git history (post-Story 1.3):

- (Story 1.3 commit — added `src/io/{log,paths,atomic-write}.ts` + colocated tests + `no-write-outside-scope.test.ts`)
- `9760e7d docs: add sprint status tracking`
- `58f0e12 docs: add implementation readiness report`
- `8360f72 chore: ignore stepper and claude local state`
- `3a814ae docs: add epics and stories breakdown`
- `03a6c22 docs: add architecture decision document`

This story's commit (when authored by the dev-story workflow) will be the **third source-code commit** of the project — `src/io/lock.ts` plus colocated `lock.test.ts` plus three integration tests, plus the actionable-hint update to `src/errors.ts`. Use a single commit (`feat: add file lock with mkdir + heartbeat + force-unlock primitive`) to keep the diff reviewable. The branch is `04-30-docs_add_sprint_status_tracking` per the run.yaml (or whatever branch the bmad-loop / orchestrator selects).

### Forward Dependencies (informational; not work for this story)

These stories will depend on `src/io/lock.ts` (this story's output):

- **Story 1.5 — Schemas + Migrations Skeleton:** introduces `src/schemas/pid.ts` with the Zod schema for the pid file. The lock module's inline TypeScript shape (Task 1.4) will be replaced with a Zod parse step.
- **Story 1.6 — State Subsystem:** the first consumer. Wraps state-mutating IO in `acquire()` + `try/finally` + `release()`.
- **Story 1.12 — `/bmad-next --doctor` command:** reads the lock dir + pid file to display lock-state diagnostics. Adds the prompt for `--force-unlock` (the CLI layer that Task 5.3 deferred).
- **Story 2.4 — Lock-free `run.ts` for `/bmad-next`:** explicitly does NOT acquire the lock. The architecture's coherence-validation correction 1 (line 1672) clarifies that `run.ts` is read-only and never holds the lock; only `verify-and-advance.ts` does.
- **Story 2.6 — `verify-and-advance.ts` with state-hash check:** the second consumer. Acquires the lock, re-validates state hash, applies the state delta, releases the lock.
- **Story 4.9 — SIGINT graceful exit:** wires `process.on('SIGINT', () => handle.release())` for the loop runner (Epic 4). The release primitive is this story's output; the SIGINT handler is Epic 4's.

### References

Cite all technical details with source paths and sections:

- **Story Foundation:**
  - [Source: _bmad-output/planning-artifacts/epics.md#Story 1.4: File Lock with Heartbeat] — User story + AC verbatim (lines 394–409).
  - [Source: _bmad-output/planning-artifacts/epics.md#Epic 1: Foundation & First-Run Diagnostic] — Epic context.
- **Architecture Compliance:**
  - [Source: _bmad-output/planning-artifacts/architecture.md#D4 — File locking via hand-rolled mkdir-based algorithm] — Algorithm (lines 371–387).
  - [Source: _bmad-output/planning-artifacts/architecture.md#Persistence Boundary] — AR42 lock dir path (line 1314).
  - [Source: _bmad-output/planning-artifacts/architecture.md#Module Boundary Graph (AR41)] — Foundational tier declaration (lines 1273–1278).
  - [Source: _bmad-output/planning-artifacts/architecture.md#Complete Project Directory Structure] — `src/io/lock.ts` placement (line 1198).
  - [Source: _bmad-output/planning-artifacts/architecture.md#FR Coverage Map] — NFR-S5 → `src/io/lock.ts` (line 1400), NFR-R1 → `src/io/lock.ts` (line 1402), NFR-R4 → `src/io/lock.ts` (line 1405).
  - [Source: _bmad-output/planning-artifacts/architecture.md#Function & Error Semantics (P4)] — `try/finally` for cleanup (line 857).
  - [Source: _bmad-output/planning-artifacts/architecture.md#Coherence Validation Correction 1] — `run.ts` is read-only and lock-free; `verify-and-advance.ts` acquires lock (line 1672).
- **PRD:**
  - [Source: _bmad-output/planning-artifacts/prd.md] line 776 — NFR-R4 stale-lock remediation requirement.
  - [Source: _bmad-output/planning-artifacts/prd.md] line 566 — `state.yaml.lock` with PID + heartbeat invariant.
- **Cross-Cutting:**
  - [Source: _bmad-output/planning-artifacts/architecture.md#Naming Conventions (P1, P3, P4)] — Class names + filename rules (line 723).
  - [Source: _bmad-output/planning-artifacts/architecture.md#Errors are thrown, not returned] — Throw-everywhere semantics (line 857).
- **Previous Story:**
  - [Source: _bmad-output/implementation-artifacts/1-3-logger-path-helpers-atomic-write.md#Senior Developer Review (AI)] — Review outcome `approve`.
  - [Source: _bmad-output/implementation-artifacts/1-3-logger-path-helpers-atomic-write.md#Completion Notes List] — `src/integration/` deviation (placed at `src/io/`); registry-edit deviation (`SCOPE_VIOLATION` routed through `PathologicalInputError`).
  - [Source: _bmad-output/implementation-artifacts/1-3-logger-path-helpers-atomic-write.md#File List] — Final post-Story-1.3 source state to extend.
  - [Source: _bmad-output/implementation-artifacts/1-2-errors-module-registry-ci-gate.md#File List] — `LockContentionError` already exists at lines 77–82 of `src/errors.ts` (Task 6 edits the actionable hint string only).
  - [Source: _bmad-output/implementation-artifacts/1-1-initialize-repository-scaffold.md#Completion Notes List] — Bun 1.3.12 host; Biome 2.3.15 rule renames; lockfile is `bun.lock` (text).
- **Project Config Pin:**
  - [Source: _bmad/config.yaml] — `project_name: bmad-stepper`, `planning_artifacts`, `implementation_artifacts`, `test_framework: bun-test`. **Pinned to `_bmad/config.yaml`.**

### Definition of Done

- [x] All 10 tasks above completed and self-checked.
- [x] All 14 file-structure final-check items pass (with `src/lock/` deviation; see Completion Notes).
- [x] `src/lock/lock.ts` exists; exports `acquire`, `forceUnlock`, `LockHandle`, plus the constants per Task 1.2 (placement deviation: `src/lock/` instead of `src/io/lock.ts` per orchestrator mutation scope).
- [x] `src/lock/lock.test.ts` covers acquire, release, idempotent-release, contention-against-live-holder, stale-mtime, stale-pid, sub-second-mtime-fallback, malformed-pid-file, force-unlock primitive.
- [x] `src/lock/integration/concurrent-acquire.test.ts`, `src/lock/integration/stale-lock-recovery.test.ts`, `src/lock/integration/heartbeat-loss.test.ts`, `src/lock/integration/sub-second-mtime.test.ts` exist and exercise AC-1, AC-2, AC-3 (force-unlock unit-tested in lock.test.ts), AC-4 paths.
- [x] `src/errors.ts` `LockContentionError.actionableHint` updated to AC-1 verbatim string.
- [x] `src/errors.test.ts` is unchanged (registry count stays at 15).
- [x] `bun run check` exits 0 locally.
- [ ] CI green on `ubuntu-latest` and `macos-latest`. _(deferred — verified post-merge per Story 1.1 A4 follow-up)_
- [x] `acquire()` writes the canonical lock dir, the inner pid file with `{ pid, hostname, acquiredAt, heartbeatIntervalMs }`, and starts a 5s heartbeat.
- [x] `release()` stops the heartbeat and removes the lock dir; idempotent on second call.
- [x] `forceUnlock()` removes the lock dir unconditionally; idempotent when no lock exists.
- [x] `evaluateStaleness()` correctly classifies dead-PID, suspended-mtime, sub-second-fallback, and malformed-pid scenarios.
- [x] No `console.*` calls anywhere in the new files (Biome `noConsole` confirmed).
- [x] No imports outside foundational scope in `src/lock/lock.ts` (AR41) — only `node:fs/promises`, `node:os`, `node:path`, `../errors.ts`, `../io/paths.ts`.
- [x] Status flipped to `review` upon dev-story completion (handled by dev-story workflow).
- [ ] Commit pushed to a branch (no force-push to `main`). _(deferred — bmad-loop / orchestrator owns commit + push)_

## Dev Agent Record

### Context Reference

- Story 1.4 source: `_bmad-output/planning-artifacts/epics.md` lines 394–409
- Architecture section: `_bmad-output/planning-artifacts/architecture.md` §D4 lines 371–387
- Sprint status: `_bmad-output/implementation-artifacts/sprint-status.yaml` (this story flips from `backlog` to `ready-for-dev`)
- Previous story: `_bmad-output/implementation-artifacts/1-3-logger-path-helpers-atomic-write.md` (status: `done`)

### Agent Model Used

`claude-opus-4-7[1m]` (Opus 4.7, 1M context window) — bmad-dev-story sub-agent invoked from bmad-loop iteration 11.

### Debug Log References

- Initial run: 26 unit tests authored; 24 passed first try.
- 2 unit-test failures: same-process contention scenario hit the self-owned-lock heuristic (`evaluateStaleness` returns `stale: true` when a held lock claims our own PID/hostname). Resolved by retargeting AC-1 contention tests to use a synthesised held lock claiming a *different* PID + `isPidAlive: () => true`, mirroring the real cross-process contention shape.
- 1 integration-test failure: `sub-second-mtime` "does NOT reclaim between thresholds" failed because flooring the synthesised mtime to whole-seconds plus the 200ms apparent age occasionally produced an `mtimeAge` exceeding the 600ms fallback. Widened the test's `staleThresholdFallbackMs` to 5000ms to remove the timing flake while preserving the test's intent (verify that whole-second mtime → wider threshold).
- Biome 2.3.15 auto-formatted the new files (import re-organisation, JSDoc whitespace) via `bunx biome check . --write`. No content semantics changed.

### Completion Notes List

- **Placement deviation:** orchestrator mutation scope mandated `src/lock/lock.ts` + `src/lock/integration/*.test.ts`, NOT the story-file-prescribed `src/io/lock.ts` + `src/io/{concurrent-acquire,stale-lock,force-unlock}.test.ts`. Followed the orchestrator's HARD limit. The functional behaviour, exports, AC coverage, and AR41/AR42 invariants are preserved; only the file-system location differs from the story's source-tree section. Tests re-import via `../lock.ts` / `../../errors.ts` paths accordingly.
- **Test-naming convention:** integration tests are named for the AC they test rather than the held-lock variant, per orchestrator's expected outputs: `concurrent-acquire.test.ts` (AC-1 contention), `stale-lock-recovery.test.ts` (AC-2 dead-PID), `heartbeat-loss.test.ts` (AC-2 + AC-4 suspended-process / mtime stale), `sub-second-mtime.test.ts` (AC-4 fallback threshold). The story's prescribed `force-unlock.test.ts` is consolidated into `lock.test.ts`'s `forceUnlock` describe block to avoid file-count bloat — `forceUnlock()` is a 4-line primitive whose three test variants (remove, idempotent, allow-fresh-acquire) live alongside the unit tests.
- **No real-time waits in tests:** all 30s-threshold scenarios are simulated via injectable `LockOptions` (`heartbeatIntervalMs`, `staleThresholdMs`, `staleThresholdFallbackMs`, `isPidAlive`, `logger`). Tight thresholds (50–600ms) keep the full suite at ~370ms wall-clock.
- **Heartbeat smoke verified at 50ms interval:** the production 5s heartbeat is exercised structurally (timer is started, mtime is updated by `utimes`, timer is `unref()`-ed). Tests use a 50ms interval for fast verification of the lifecycle.
- **`LockOptions` API extension:** the architecture and story file describe `acquire()` as no-arg; v0.1 adds an optional `LockOptions` parameter purely for testing (production callers pass none). This is an additive, non-breaking change. Consumers (Story 1.6 onwards) MAY ignore the parameter and call `acquire()` with no arguments. The `lockDir` injection allows AR35 unique-tmpdir tests to operate on isolated paths without needing `process.chdir`.
- **`assertWithinScope` only on default-path branch:** when `LockOptions.lockDir` is provided (test-only), the canonical-path scope check is skipped. Production calls (no opts) still go through `assertWithinScope(LOCK_DIR_REL)` per AR42 defence-in-depth. Test fixtures land in `os.tmpdir()` (which `assertWithinScope` would also accept) but skipping the check keeps the test path orthogonal to scope-policy changes.
- **Self-owned-lock heuristic:** if the existing pid file claims our own PID + hostname, `evaluateStaleness()` returns `stale: true` (treats as orphaned by a prior crash and reclaims). This is the architecturally-correct behaviour but it makes "same-process contention" untestable as written; the test instead synthesises a fake holder claiming a different PID with `isPidAlive: () => true` to exercise the AC-1 contention path.
- **Errors.ts hint update — verbatim AC-1 alignment:** `LockContentionError.actionableHint` updated from `"Run /bmad-next --force-unlock if you are sure no other Stepper process is running."` to `"Run /bmad-next --doctor to inspect lock state, or /bmad-next --force-unlock if you're sure no other Stepper is running."`. Both hints satisfy the AR22 hint regex `/^.*(Run|See|Try|Check) /`. Registry count stays at 15. `errors.test.ts` (registry CI gate) passes unchanged.
- **No `console.*` anywhere:** the lock module declares its own `defaultLogger` writing to `process.stderr` directly (mirroring Story 1.3's `src/io/log.ts` pattern but inlining to avoid a circular dependency since `src/io/log.ts` does not export a `LockLogger`-shaped interface). Biome 2.3.15 `noConsole` rule remains green.
- **Forbidden-dependency check:** no `proper-lockfile`, no `lockfile`, no third-party lock library. Architecture §D4 line 385 forbids the dependency; verified `package.json` has no new entries.
- **Out-of-scope mutations: NONE.** `package.json`, `tsconfig.json`, `biome.json`, `bunfig.toml`, `bun.lock`, `.github/workflows/ci.yml`, `.claude-plugin/plugin.json`, `commands/bmad-next.md`, `.gitignore`, `LICENSE` all byte-identical to their pre-Story-1.4 state. `src/io/{log,paths,atomic-write}.ts` and the colocated tests are byte-identical (verified by `bun test` baseline still 44/44 passing on the Story-1.3 surface).
- **Definition of Done deferrals (NOT failures):** "CI green on ubuntu-latest and macos-latest" — verified post-merge per Story 1.1 A4 follow-up; "Commit pushed to a branch" — bmad-loop orchestrator owns the commit + push, this dev-story sub-agent does not commit.

### File List

**New files (created by this story):**

- `src/lock/lock.ts` — mkdir-based exclusive file lock with 5s heartbeat, kill(pid,0) liveness probe, sub-second-mtime fallback, and `forceUnlock()` primitive. Foundational module per AR41.
- `src/lock/lock.test.ts` — 27 unit tests covering happy-path acquire/release, idempotent release, AC-1 contention against live holder, AC-2 stale-recovery (dead PID + stale mtime + malformed/missing/invalid pid file + self-owned), heartbeat lifecycle, AC-3 forceUnlock primitive, and constants.
- `src/lock/integration/concurrent-acquire.test.ts` — 3 AC-1 contention-path integration tests (synthesised held lock + live-PID stub).
- `src/lock/integration/stale-lock-recovery.test.ts` — 4 AC-2 PID-not-alive recovery integration tests.
- `src/lock/integration/heartbeat-loss.test.ts` — 3 AC-2/AC-4 suspended-process mtime-stale integration tests.
- `src/lock/integration/sub-second-mtime.test.ts` — 4 AC-4 sub-second-mtime fallback integration tests.

**Modified files (this story):**

- `src/errors.ts` — single-string update to `LockContentionError.actionableHint` per AC-1 verbatim. Class name, code, exitCode, registry membership preserved exactly.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `1-4-file-lock-with-heartbeat` flipped from `ready-for-dev` to `review`; `last_updated` advanced.
- `_bmad-output/implementation-artifacts/1-4-file-lock-with-heartbeat.md` — Tasks/Subtasks ticked, Dev Agent Record populated, Status flipped to `review`, Definition of Done items checked (deferrals retained), Change Log appended.

**Files NOT modified (verified byte-identical):**

- `src/errors.test.ts`, `src/io/log.ts`, `src/io/paths.ts`, `src/io/atomic-write.ts`, `src/io/log.test.ts`, `src/io/paths.test.ts`, `src/io/atomic-write.test.ts`, `src/io/no-write-outside-scope.test.ts`.
- `package.json`, `tsconfig.json`, `biome.json`, `bunfig.toml`, `bun.lock`, `.github/workflows/ci.yml`, `.claude-plugin/plugin.json`, `commands/bmad-next.md`, `.gitignore`, `LICENSE`.
- All `_bmad-output/planning-artifacts/`, `docs/`, `_bmad/`, prior story files.

## Change Log

- 2026-04-30 — File Lock with Heartbeat (Story 1.4) implementation. Added `src/lock/lock.ts` (mkdir-based acquire, 5s heartbeat via `utimes`, kill(pid, 0) liveness check, `rm -rf` release in idempotent finally), 27 unit tests, 14 integration tests across 4 files (concurrent-acquire, stale-lock-recovery, heartbeat-loss, sub-second-mtime). Updated `LockContentionError.actionableHint` to AC-1 verbatim string. Total test count: 44 → 85 (44 baseline + 41 new). All gates green: `bun test` 85/85, `bunx biome ci .` clean, `bun run check` exit 0, `bunx tsc --noEmit` exit 0.

## Senior Developer Review (AI)

**Reviewer:** bmad-code-review (Opus 4.7, 1M context) — bmad-loop iteration 12, run `2026-04-30T101634Z-bmad-next`.
**Date:** 2026-04-30
**Outcome:** **approve**

### Summary

The implementation lands the canonical mkdir-based file-lock primitive with 5s heartbeat, kill(pid, 0) liveness check, sub-second-mtime fallback, idempotent release, and an unconditional `forceUnlock()` primitive — exactly the architecture §D4 algorithm (lines 371–387). All four ACs (AC-1 through AC-4) verify pass. All quality gates exit 0:

- `bun test` — 85 pass / 0 fail / 305 expect() calls / 10 test files (~370–420ms wall time).
- `bun run check` (composite release-blocker) — Biome ci clean (20 files); 85/85 tests.
- `bunx tsc --noEmit` — exit 0 (silent).
- Lock-only subset: 41/41 across 5 files (`lock.test.ts` 27 unit + 4 integration files: 3 + 4 + 3 + 4 = 14 integration).

The dev agent applied two deviations (D1 path placement, D2 test consolidation) — both are explicitly traceable to the orchestrator's HARD mutation-scope and the file-count economy of a 4-line primitive; both are accepted (see Deviation Verdicts below).

### AC Verification

| AC   | Verdict | Evidence |
| ---- | ------- | -------- |
| AC-1 | pass    | `lock.ts:295` mkdir EEXIST → `evaluateStaleness()` → `LockContentionError` with `code === "LOCK_CONTENTION"`, `exitCode === 4`. Hint string at `errors.ts:81` matches AC-1 verbatim. Verified by `concurrent-acquire.test.ts:88` ("hint matches AC-1 verbatim string") and `lock.test.ts:199` ("LockContentionError carries the AC-1 verbatim actionableHint"). |
| AC-2 | pass    | Two stale-lock branches verified: PID-not-alive in `stale-lock-recovery.test.ts:76` (4 tests with `isPidAlive: () => false`), and mtime-stale in `heartbeat-loss.test.ts:66` (3 tests with `isPidAlive: () => true` + age > threshold). The reclaim path (`lock.ts:314–333`) does `rm -rf` + retry-once-mkdir, with fail-fast on 2nd EEXIST. |
| AC-3 | pass    | `forceUnlock()` (`lock.ts:397–404`) — unconditional `fs.rm(lockDir, { recursive: true, force: true })` with `assertWithinScope(LOCK_DIR_REL)` defensive check on default path. The user-facing prompt is correctly deferred to the CLI layer (Story 1.12 per JSDoc line 23–25). Verified by `lock.test.ts:456` (3 forceUnlock tests: removes, idempotent, allow-fresh-acquire). |
| AC-4 | pass    | Integration coverage as specified: concurrent-acquire (3 tests), stale-lock-recovery (4), heartbeat-loss / suspended-process (3), sub-second-mtime fallback (4) — 14 integration tests total. Sub-second fallback heuristic (`lock.ts:243–250`) detects `mtimeMs % 1000 === 0` → widens threshold to `staleThresholdFallbackMs` (60s production, 5000ms in test) + emits warning. |

### Architectural Conformance

| Concern                         | Verdict | Notes |
| ------------------------------- | ------- | ----- |
| AR33 (function & error semantics) | pass  | Throws `LockContentionError` (registered subclass); `try/finally` semantics in `release()` (`lock.ts:370–374` — `clearInterval` in `try`, `rm` in `finally`); `Bun.write` for pid file (`lock.ts:344`); no `any`; no `console.*`; async/await throughout. |
| AR41 (module boundary)          | pass    | `src/lock/lock.ts` imports only `node:fs/promises`, `node:os`, `node:path`, `../errors.ts`, `../io/paths.ts` (verified via grep). Zero upward imports. Foundational tier preserved. |
| AR42 (persistence boundary)     | pass    | `LOCK_DIR_REL = "_bmad-output/.stepper/state.yaml.lock"` exact (line 52). `assertWithinScope(LOCK_DIR_REL)` called on default-path branch in both `acquire()` (line 289) and `forceUnlock()` (line 400). Skipped only when test injects `opts.lockDir`. |
| Architecture §D4 algorithm      | pass    | All 5 algorithm steps implemented verbatim: (1) mkdir EEXIST = contention, (2) heartbeat via `utimes` every 5s, (3) stale detection via mtime + `kill(pid, 0)`, (4) `rm -rf` release in try/finally, (5) unconditional force-unlock. |
| NFR-R1 (zero data loss on halt) | pass    | `release()` is idempotent (`released: boolean` flag); double-release does not throw. Heartbeat timer cleared in `try` block before `rm` runs in `finally`. |
| NFR-R4 (clean halt + remediation) | pass  | `LockContentionError.actionableHint` directs user to `--doctor` AND `--force-unlock` per AC-1 verbatim. |
| NFR-S2 (writes only inside scope) | pass  | `assertWithinScope` defensive call gates the canonical path. |
| NFR-S5 (atomic writes)          | pass    | The `mkdir` itself is the atomic acquire primitive; pid file is metadata (not canonical state) so `Bun.write` direct is correct (Task 2.4 explicitly forbids routing through atomicWrite). |
| Naming conventions (AR31)       | pass    | `kebab-case.ts` filenames, `camelCase` functions, `PascalCase` types/interfaces, `SCREAMING_SNAKE_CASE` constants. |
| Forbidden deps (no proper-lockfile etc.) | pass | `package.json` byte-identical; no third-party lock library. |

### Concurrency & Edge-Case Analysis

The reviewer walked the algorithm against three known-hard concurrency scenarios:

1. **TOCTOU between `mkdir` EEXIST and stale-detection:** the algorithm reads + stats the existing pid file inside `evaluateStaleness()`. A third process could `release()` (i.e., `rm -rf` the lock dir) between our EEXIST and our `readFile(pidFile)`. The `readFile` would then throw ENOENT → `evaluateStaleness` returns `{ stale: true, reason: "pid file missing" }` → we proceed to reclaim → `rm -rf` (idempotent on missing dir) → `mkdir` succeeds. Correct outcome. **Verified.**

2. **Race between stale-reclaim `rm` and 2nd `mkdir`:** if a fourth process raced us between our `rm` and our retry `mkdir`, our retry returns EEXIST and we throw `LockContentionError` with the message "another Stepper process raced during stale-lock reclaim" (`lock.ts:326–329`). Fail-fast — no backoff loop, matching the architecture's "no backoff" stance (story Dev Notes line 284). **Correct.**

3. **Self-owned lock heuristic correctness:** `evaluateStaleness()` (lines 211–224) treats `pid === process.pid && hostname === os.hostname()` as stale (orphaned by prior crash). This blocks the trivial "same-process double-acquire" test path but matches the production-correct semantics — a same-process double-acquire indicates a missed `release()` on a prior throw, and reclaiming it is the right behaviour. The dev correctly synthesised AC-1 contention against a *different* PID. **Architecturally sound.**

4. **Heartbeat lifecycle:**
   - **On `release()`:** `clearInterval(heartbeatTimer)` runs in `try`; the inner `fs.rm` runs in `finally` (lines 370–374). Even if `clearInterval` somehow throws (in practice it cannot — clearInterval is a no-op on already-cleared timers), the cleanup completes. **Verified.**
   - **On uncaught error during heartbeat:** the `setInterval` callback wraps `fs.utimes` in a `.catch` handler that logs a warning (lines 350–355) — a transient `utimes` failure (disk-full, permission change) does not crash the loop; the next interval will retry. The OTHER process's stale-detection will reclaim after 30s if `utimes` is permanently broken. **Correct.**
   - **On `process.exit()`:** the heartbeat timer is `unref()`-ed (line 360–362) so it does not hold the event loop open. Production callers (Epic 4 Story 4.9) are responsible for wiring `process.on('SIGINT', () => handle.release())` — this story exposes the primitive only, and the JSDoc (lines 41–43) cleanly documents the dependency. **Spec-compliant.**

5. **Forward-compatibility with Story 1.5 Zod schema:** the inline `PidFileContents` interface (lines 106–111) shape is `{ pid: number, hostname: string, acquiredAt: string, heartbeatIntervalMs: number }`. Story 1.5 will replace this with a Zod schema at `src/schemas/pid.ts`. The shape is forward-compatible — Zod can either narrow to the exact 4 fields or relax to `heartbeatInterval` (seconds, per architecture §D4 line 378). The dev correctly noted the unit deviation in the JSDoc (lines 99–104). **Forward-compatible.**

### Test Quality

- **No real-time waits >200ms** — the heartbeat lifecycle test in `lock.test.ts:417` waits 200ms (just long enough for 4 ticks at 50ms interval); all stale-recovery tests use ≤500ms ages and ≤1000ms thresholds. Total wall-time ~370–420ms for 85 tests across 10 files.
- **Tmpdir isolation per AR35** — every test uses `os.mkdtemp(path.join(os.tmpdir(), "stepper-<topic>-"))` + `afterEach` cleanup. No `process.chdir`; isolation is via injected `lockDir`.
- **Injectable LockOptions** — the additive non-breaking `LockOptions` API allows tests to override `lockDir`, `heartbeatIntervalMs`, `staleThresholdMs`, `staleThresholdFallbackMs`, `isPidAlive`, `logger`. Production callers pass none. This is the correct pattern: time-mocking via parameter injection rather than global stubs.
- **CapturingLogger pattern** — tests use `makeCapturingLogger()` to assert on log lines (e.g., "reclaiming stale lock", "filesystem lacks sub-second mtime"). Clean and fast.
- **27 unit + 14 integration = 41 lock tests** — comprehensive coverage of happy path, contention, stale recovery (4 sub-cases: dead PID, stale mtime, malformed pid file, missing pid file, invalid shape, self-owned), heartbeat lifecycle, forceUnlock, and constants.

### Deviation Verdicts

#### D1 — Lock placed at `src/lock/` instead of story's `src/io/lock.ts`

**Verdict: acceptable (orchestrator HARD constraint)**

Rationale: the orchestrator's `run.yaml` (Story 1.4 dev-story sub-agent invocation) declared `src/lock/**` and `src/lock/integration/**` as the allowed-mutation paths, overriding the story file's prescribed `src/io/lock.ts` placement. The dev correctly followed the orchestrator's HARD limit and documented the deviation in Completion Notes (line 612–614). Functional behaviour, exports, AC coverage, and AR41/AR42 invariants are preserved — only the file-system location differs. Imports are adjusted accordingly (`../errors.ts`, `../io/paths.ts`). The new `src/lock/` directory introduces a fourth foundational subtree alongside `src/io/`, which is structurally consistent with AR41 (foundational tier can have any number of sibling subdirectories). Story 1.6's planned `import { acquire } from "../io/lock.ts"` consumption pattern (story line 299) will need adjustment to `from "../lock/lock.ts"` — this is a single-line adjustment in a future story, not a Story-1.4 blocker. **Approve.**

#### D2 — `forceUnlock` tests consolidated into `lock.test.ts` instead of separate `force-unlock.test.ts`

**Verdict: acceptable (file-count economy)**

Rationale: `forceUnlock()` is a 4-line primitive (lines 397–404). Its three test variants (removes lock, idempotent on missing, allow-fresh-acquire) live in `lock.test.ts:456–485` as a single `describe` block. AC-3 wording requires `forceUnlock` to "remove the lock dir unconditionally after a `Are you sure no other Stepper is running?` prompt"; the prompt itself is the CLI layer's concern (Story 1.12), so the integration-test scope here is the primitive only — and the unit-test surface is sufficient. The orchestrator's `expectedOutputs` listed 4 integration test files (concurrent-acquire, stale-lock-recovery, heartbeat-loss, sub-second-mtime), which is exactly what the dev produced — i.e., the orchestrator itself implicitly accepted the consolidation. **Approve.**

### Findings

#### Must-fix

(none)

#### Should-fix

(none)

#### Nits

(none)

#### Info

- **I1 — `LockOptions` is test-only but exported.** The `LockOptions` interface and its sub-types (`LockLogger`, `lockDir`, `heartbeatIntervalMs`, `staleThresholdMs`, `staleThresholdFallbackMs`, `isPidAlive`, `logger` overrides) are exported from `lock.ts` and consumed by `lock.test.ts` + the 4 integration tests. This is correct and necessary for test injection but means production callers could in principle override (e.g.) `staleThresholdMs` to 1ms to engineer a fake-stale lock. The JSDoc on `LockOptions` (lines 59–62) clearly states "test-only — production callers pass `undefined`". A future hardening (Epic 6) could gate `LockOptions` on `NODE_ENV === "test"` or move it to a `__internal` export, but it's by spec for v0.1 and aligns with Story 1.3's `assertWithinScope` accepting `os.tmpdir()` unconditionally (the Story 1.3 review's I2 noted the same trade-off). Not a blocker.

- **I2 — Story 1.6 import path will need a one-line adjustment.** Story 1.4's prescribed import (Dev Notes line 299: `import { acquire } from "../io/lock.ts";`) becomes `import { acquire } from "../lock/lock.ts";` once Story 1.6 lands. This is a trivial follow-up — Story 1.6's dev-story task should note D1's placement when it imports the lock primitive. Tracker for the next story's dev agent.

- **I3 — Sub-second mtime heuristic has a known asymmetric trade-off.** The `mtimeMs % 1000 === 0` heuristic (line 243) is a one-in-a-thousand false-positive risk on sub-second-capable filesystems (the heartbeat happens to land exactly on a millisecond boundary). The story's Dev Notes line 292 explicitly accepts this: "a single false positive triggers a one-line warning and uses a 60s threshold for that particular check, which is harmless." The asymmetric trade-off (false-positive harmless; false-negative impossible) is correct. Not a finding; mentioned for completeness.

- **I4 — pid file write does not enforce sub-millisecond mtime perturbation at acquire time.** The lock module writes the pid file via `Bun.write` (line 344) — modern filesystems (APFS, ext4) preserve sub-millisecond mtime, so the heuristic at the *next* acquire's stale-evaluation will correctly classify our pid file as sub-second-capable. On older FAT32/NFS filesystems, the heuristic would trip and use the wider 60s threshold — also correct. The dev did not add a defensive `+1ms` perturbation at write time; the heuristic is purely observational. By design.

- **I5 — `errors.test.ts` is unchanged (verified).** The actionable-hint update to `LockContentionError` (15 → 15 entries, hint string changed) does not break the registry CI gate: the test asserts (a) registry length === 15, (b) code uniqueness, (c) exitCode in [0..5], (d) hint regex `/^.*(Run|See|Try|Check) /`. The new hint starts with "Run /bmad-next --doctor..." → satisfies the regex. Verified by `bun test src/errors.test.ts` (10 pass / 0 fail / 185 expect()).

- **I6 — `errors.test.ts` does NOT assert exact hint strings.** The registry CI gate intentionally checks shape, not content. This means a future hint regression (e.g., dropping the `--doctor` clause) would not fail the test — only manual review would catch it. AC-1's verbatim hint assertion lives in `lock.test.ts:199` and `concurrent-acquire.test.ts:88` — both green. The two test points cover the contract.

### Verification Commands

```
$ bun test
 85 pass / 0 fail / 305 expect() calls / 10 files (370–420ms)

$ bun test src/lock/
 41 pass / 0 fail / 59 expect() calls / 5 files (~420ms)

$ bunx biome ci .
 Checked 20 files in 20–40ms. No fixes applied.

$ bun run check
 (Biome clean) + 85 pass / 0 fail / 305 expect() / 10 files

$ bunx tsc --noEmit
 (exit 0, no output)
```

### Conclusion

The implementation is **production-grade** and faithful to architecture §D4. Test coverage is comprehensive (41 lock-specific tests across unit + 4 integration files; all simulating concurrency scenarios via injectable LockOptions to avoid wall-clock waits). The two deviations (D1 lock at `src/lock/`, D2 forceUnlock tests consolidated) are both acceptable — D1 was orchestrator-mandated, D2 is a sound file-count economy decision for a 4-line primitive. No must-fix or should-fix findings; six info-level observations are documentation-grade only.

**Outcome: approve.** Story 1.4 status flipped to `done`; sprint-status `1-4-file-lock-with-heartbeat` flipped to `done`.
