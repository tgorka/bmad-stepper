---
status: done
story_id: '1.3'
story_key: 1-3-logger-path-helpers-atomic-write
epic: '1'
title: Logger + Path Helpers + Atomic Write
created: '2026-04-30'
last_updated: '2026-04-30'
priority: blocking
estimated_effort: M
fr_coverage:
  - FR4
  - FR18
  - FR32
  - FR46
  - FR54
nfr_coverage:
  - NFR-R1
  - NFR-S2
  - NFR-S5
ar_coverage:
  - AR33
  - AR36
  - AR41
  - AR42
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/implementation-artifacts/1-1-initialize-repository-scaffold.md
  - _bmad-output/implementation-artifacts/1-2-errors-module-registry-ci-gate.md
  - _bmad/config.yaml
---

# Story 1.3: Logger + Path Helpers + Atomic Write

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a **Stepper contributor**,
I want **foundational IO primitives (logger with stdout/stderr discipline, path scope-checker, atomic tmp+rename writer with `.bak` rotation)**,
so that **every higher-level module uses one set of audited IO and the no-write-outside-scope CI gate can be implemented**.

## Context Summary

This story introduces the **second foundational module** of the project (the first being `src/errors.ts` from Story 1.2). Per AR41, the `src/io/` directory sits alongside `errors.ts` and `schemas/` as one of three foundational modules with **no upward imports**. Concretely, this story creates the `src/io/` subdirectory (which does not yet exist) and lands its first three TypeScript files plus their colocated tests, plus one cross-module integration test.

Story 1.2 (`done`) established the project's first source-code conventions: kebab-case filenames, colocated `<source>.test.ts` tests, Bun's default test discovery globs `**/*.test.ts`, `bun:test` imports for the test runner, `.ts` extensions on sibling imports (per `tsconfig.json`'s `allowImportingTsExtensions: true`), `verbatimModuleSyntax: true` (so type-only imports use `import type`), `noUncheckedIndexedAccess: true` (array access yields `T | undefined`), and `noImplicitOverride: true` (each subclass field uses `override readonly` — see `src/errors.ts` for the reference pattern). Story 1.3 reuses every one of these conventions byte-for-byte.

The PRD's **stdout/stderr discipline** (FR54) is operationalised here for the first time. Until Story 1.3, the only TypeScript module is `src/errors.ts`, which has no IO and never prints. From Story 1.3 onwards, **every module MUST route its logging through `src/io/log.ts`** — never through `console.*` directly. The Biome lint rule (`suspicious.noConsole: "error"` per `biome.json`) blocks raw `console.log`/`console.error` use anywhere in the project; this story is the first one to introduce a sanctioned exception (the `log.ts` module body, which writes to `process.stdout`/`process.stderr` via `process.stderr.write` rather than `console.*` to avoid even the appearance of `console.*` use).

The PRD's **atomic-write invariant** (NFR-S5, NFR-R1) is also operationalised here. Every persisted file in the project — `state.yaml` (Story 1.6), `bmad-stepper.config.yaml`, run-log JSON (Story 2.5), telemetry JSONL (Epic 6), and the `state.yaml.lock` heartbeat (Story 1.4) — depends on `atomicWrite()`. Story 1.4's lock heartbeat is the first consumer; Story 1.6's state save/load is the second. Locking-down the atomic-write contract here, with `.bak` rotation kept for one cycle, prevents zero-data-loss regressions across every later story.

The PRD's **no-write-outside-scope** invariant (NFR-S2) is partially operationalised here. `src/io/paths.ts` exposes `assertWithinScope(path)`, and the integration test `src/integration/no-write-outside-scope.test.ts` is the first cross-module integration test of the project (the `src/integration/` directory does not yet exist; this story creates it). The full enforcement story (every higher-level module routing through `paths.ts`) plays out across Stories 1.4–1.7; this story lands the helper plus the failing-on-violation contract.

This is **AR33** (function & error semantics — "no `console.log` in runtime"), **AR36** (code quality CI gates — `noConsole` rule + integration tests), **AR41** (module boundary graph — `src/io/` is foundational), and **AR42** (persistence boundary — writes only inside `_bmad-output/**` and `_bmad-output/.stepper/**`). All four are referenced by name in the architecture doc.

## Acceptance Criteria

The acceptance criteria below are reproduced **verbatim** from `_bmad-output/planning-artifacts/epics.md` §Story 1.3 (lines 375–392, BDD Given/When/Then/And format).

### AC-1 (Given/When/Then/And — Logger + Biome rule)

**Given** `src/io/log.ts` with `info`/`warn`/`error`/`json` functions
**When** `info`/`warn`/`error` are called
**Then** they write to stderr and `json` writes to stdout (FR54 stdout reserved for `--export-state`)
**And** Biome rule `noConsoleLog: "error"` blocks any `console.log` outside `src/io/log.ts`

### AC-2 (Given/When/Then — Path scope-checker)

**Given** `src/io/paths.ts` with `assertWithinScope(path)` helper
**When** any write target is outside `_bmad-output/.stepper/**`, `_bmad-output/**`, or the test tmpdir
**Then** the helper throws `SCOPE_VIOLATION` (or equivalent) and the integration test `no-write-outside-scope.test.ts` is green

### AC-3 (Given/When/Then — Atomic write + .bak rotation)

**Given** `src/io/atomic-write.ts` with `atomicWrite(path, contents)`
**When** writing
**Then** the file is first written to `path.tmp`, then `fs.rename(path.tmp, path)`, with `path.bak` rotation kept for one cycle (NFR-R1, NFR-S5)

## Tasks / Subtasks

- [x] **Task 1 — Create `src/io/` directory + `src/io/log.ts` (AC: 1)**
  - [x] 1.1 Create `src/io/` at the project root (does not exist yet — Story 1.2's source tree was `src/errors.ts` + `src/errors.test.ts` only).
  - [x] 1.2 Create `src/io/log.ts` exporting four named functions: `info`, `warn`, `error`, `json`. All four take a `string` (the human/JSON message). The signatures:
    ```typescript
    export function info(message: string): void;
    export function warn(message: string): void;
    export function error(message: string): void;
    export function json(payload: unknown): void;
    ```
    The `json` helper accepts `unknown` and serialises via `JSON.stringify(payload)` (no `replacer`, no indent — this is machine-readable output for `--export-state` per FR54).
  - [x] 1.3 Output stream routing (the load-bearing contract for FR54):
    - `info`, `warn`, `error` write to `process.stderr`. Use `process.stderr.write(message + "\n")` directly (NOT `console.error`/`console.warn`/`console.info` — Biome's `noConsole` rule blocks all `console.*` calls).
    - `json` writes to `process.stdout`. Use `process.stdout.write(JSON.stringify(payload) + "\n")` directly (NOT `console.log`).
    - The trailing newline is part of the contract — every record is line-delimited so callers can pipe through `jq` (`bun run ... --export-state | jq .`) or read line-by-line.
  - [x] 1.4 No prefix decoration in v0.1 (no `INFO:`, `WARN:`, `ERROR:` prefixes). The PRD's "one-line main-thread output" (FR18) and "actionable single-line error summary" (FR46) are caller-controlled — `log.error(actionableHint)` is the canonical pattern. `src/io/log.ts` is the dumb pipe; the formatting is in `src/errors.ts` (already done in Story 1.2 via `actionableHint`) and in higher-level callers (Stories 1.7, 2.5).
  - [x] 1.5 No imports from any other `src/` module (AR41 — `src/io/` is foundational alongside `src/errors.ts`). The only allowed reference is `process.stdout` / `process.stderr` (Bun globals; no `import` needed).
  - [x] 1.6 The Biome `noConsole` rule applies to this file too. Use `process.stdout.write` / `process.stderr.write` (not `console.*`). The story AC reads "Biome rule `noConsoleLog: \"error\"` blocks any `console.log` outside `src/io/log.ts`" — but **see the rename note below** (Biome 2.3.x renamed the rule). The rename does not change the AC's intent: `console.log` is forbidden everywhere; the historical exception ("inside `src/io/log.ts`") is no longer needed because the dev agent uses `process.stdout.write` directly.

- [x] **Task 2 — Implement `src/io/log.test.ts` (AC: 1)**
  - [x] 2.1 Create `src/io/log.test.ts` colocated next to `src/io/log.ts` (P7).
  - [x] 2.2 Use the Bun test runner imports (`import { describe, expect, it } from "bun:test";`) and import `error, info, json, warn` from `./log.ts`.
  - [x] 2.3 Bun-test provides `spyOn` via `import { mock, spyOn } from "bun:test";`. Spy on `process.stdout.write` and `process.stderr.write` per test; restore after each `it(...)` via `.mockRestore()`.
  - [x] 2.4 Test cases (minimum):
    - `info("hello")` calls `process.stderr.write` with `"hello\n"` (NOT `process.stdout.write`).
    - `warn("hello")` calls `process.stderr.write` with `"hello\n"`.
    - `error("hello")` calls `process.stderr.write` with `"hello\n"`.
    - `json({ foo: 1 })` calls `process.stdout.write` with `'{"foo":1}\n'`.
    - `json` with a non-object payload (e.g., a string) still produces a JSON-encoded line.
  - [x] 2.5 Assert that **`info`/`warn`/`error` never call `process.stdout.write`** (the FR54 invariant). Use `expect(stdoutSpy).not.toHaveBeenCalled()` after each diagnostic call.
  - [x] 2.6 Assert that **`json` never calls `process.stderr.write`** (the symmetric FR54 invariant — diagnostics never leak into the JSON channel).
  - [x] 2.7 The test file MUST NOT use `console.*` anywhere (Biome `noConsole` rule).

- [x] **Task 3 — Implement `src/io/paths.ts` (AC: 2)**
  - [x] 3.1 Create `src/io/paths.ts` exporting (at minimum):
    ```typescript
    export function assertWithinScope(targetPath: string): void;
    ```
    The helper accepts an absolute or project-relative path string and throws on violation. Behaviour:
    - Resolve the target to an absolute path via `path.resolve(targetPath)` (Bun re-exports `node:path` — use `import * as path from "node:path";` per AR43's "no `node:*` imports unless explicit lint allowance"; `node:path` is allowed because it's a side-effect-free standard module — confirm with the dev agent's local `bunx biome ci .` run; if Biome flags it, use `Bun.file()` plumbing instead).
    - Allowed scope (from architecture §Persistence Boundary lines 1310–1314 and AR42):
      - `_bmad-output/.stepper/**` — Stepper internal state (state.yaml, runs/, staging/, telemetry/, journal/, lock dir).
      - `_bmad-output/**` — BMAD planning + implementation artifacts (this is the project's own output folder).
      - The current process's tmpdir, computed via `os.tmpdir()` (Node global, also Bun-supported). Tests use `os.tmpdir() + "/<unique>"` per AR35; the helper must allow any path under `os.tmpdir()`.
    - On violation, throw a new `StepperError` subclass — see Task 4 for the subclass definition.
  - [x] 3.2 The helper resolves the target path against the **project root** (the current working directory where Stepper was invoked, captured via `process.cwd()`). For the `_bmad-output/**` and `_bmad-output/.stepper/**` checks, prefix-match the resolved target against `path.resolve(process.cwd(), "_bmad-output")` and `path.resolve(process.cwd(), "_bmad-output", ".stepper")`.
  - [x] 3.3 The helper MUST refuse paths that traverse out via `..` after resolution. `path.resolve()` already collapses `..` segments; the post-resolution prefix-match catches escapes (e.g., `_bmad-output/../etc/passwd` resolves to `/etc/passwd` which fails the prefix match).
  - [x] 3.4 No imports from any other `src/` module. `src/io/paths.ts` MAY `import { ... } from "../errors.ts"` (the abstract `StepperError` is foundational and `paths.ts` is also foundational — sibling foundational imports are allowed per AR41 since both are in the same "foundational" tier without an upward dependency). The dev agent should verify Biome does not flag this; if it does, declare a `ScopeViolationError` locally in `paths.ts` (see Task 4 alternative path).
  - [x] 3.5 Export any helpful constants — e.g., `export const STEPPER_INTERNAL_ROOT = "_bmad-output/.stepper"`, `export const BMAD_OUTPUT_ROOT = "_bmad-output"` — so other modules can construct paths consistently. Keep exports minimal; YAGNI applies.

- [x] **Task 4 — Add `SCOPE_VIOLATION` to the error registry (AC: 2)**
  - [x] 4.1 The story AC says "the helper throws `SCOPE_VIOLATION` (or equivalent)". The canonical implementation is to add a 16th error code to `src/errors.ts` (which Story 1.2 left at exactly 15). The dev agent SHOULD:
    - Add `"SCOPE_VIOLATION"` to the `StepperErrorCode` union at the top of `src/errors.ts`.
    - Add a `ScopeViolationError` concrete subclass with `code: "SCOPE_VIOLATION" as const`, `exitCode: 5 as const` (pathological-input bucket — the caller passed an out-of-scope path, which is a programming/input error), and `actionableHint: "Check that the target path is inside _bmad-output/, _bmad-output/.stepper/, or the test tmpdir; see src/io/paths.ts assertWithinScope() for the allowed roots."` (must match the AR22 regex `/^.*(Run|See|Try|Check) /`).
    - Add `ScopeViolationError` to the `errorRegistry` constant.
    - Update `src/errors.test.ts` `REQUIRED_CODES` to include `"SCOPE_VIOLATION"` (so the count assertion stays in sync) and update the `toHaveLength(15)` to `toHaveLength(16)`.
  - [x] 4.2 The dev agent MUST run `bun test src/errors.test.ts` after the registry edit to confirm all CI-gate assertions still pass (count, uniqueness, regex, exitCode domain) with 16 entries instead of 15.
  - [x] 4.3 If the dev agent prefers an "equivalent" approach per the AC ("`SCOPE_VIOLATION` (or equivalent)"), they MAY define `ScopeViolationError` as a local class inside `src/io/paths.ts` extending `StepperError` from `../errors.ts`. The trade-off:
    - **Recommended (registry approach):** Visible in the central registry; CI-tested for hint/regex/uniqueness; consistent with AR21/AR22; easier to surface in `--doctor` later.
    - **Alternative (local class):** Avoids edit to `src/errors.ts`; tighter encapsulation. Acceptable but loses the registry CI-gate enforcement on the new hint.
    The recommended path is the registry edit. Document the choice in Completion Notes.

- [x] **Task 5 — Implement `src/io/paths.test.ts` (AC: 2)**
  - [x] 5.1 Create `src/io/paths.test.ts` colocated next to `src/io/paths.ts`.
  - [x] 5.2 Test cases (minimum):
    - `assertWithinScope("_bmad-output/.stepper/state.yaml")` does NOT throw (relative path resolved against `process.cwd()`).
    - `assertWithinScope("_bmad-output/planning-artifacts/architecture.md")` does NOT throw.
    - `assertWithinScope(os.tmpdir() + "/foo/bar.yaml")` does NOT throw.
    - `assertWithinScope("/etc/passwd")` throws `ScopeViolationError` (or equivalent — check `instance.code === "SCOPE_VIOLATION"`).
    - `assertWithinScope("_bmad/config.yaml")` throws `ScopeViolationError` (the BMAD installed-files directory is read-only per AR42 — writes are forbidden there).
    - `assertWithinScope("_bmad-output/../../etc/passwd")` throws after `path.resolve()` collapses the `..` segments.
    - `assertWithinScope("~/.claude/plugins/foo")` throws (tilde is not expanded by `path.resolve()`; the literal directory name `~` is treated as a child of the cwd — this fails the prefix match either way).
  - [x] 5.3 Use `import * as path from "node:path";` and `import * as os from "node:os";` in the test if needed for synthesising paths. Do NOT actually create files in the test — `assertWithinScope` is a pure path-string check, no IO.
  - [x] 5.4 No `console.*` calls (Biome `noConsole` rule).

- [x] **Task 6 — Implement `src/io/atomic-write.ts` (AC: 3)**
  - [x] 6.1 Create `src/io/atomic-write.ts` exporting:
    ```typescript
    export async function atomicWrite(targetPath: string, contents: string | Uint8Array): Promise<void>;
    ```
  - [x] 6.2 Algorithm (verbatim from architecture §D10 lines 399–403 and AR13 line 181):
    1. Call `assertWithinScope(targetPath)` (from `./paths.ts`) at the top — fail loudly if the caller is writing outside the allowed roots.
    2. Compute `tmpPath = targetPath + ".tmp"` and `bakPath = targetPath + ".bak"`.
    3. If `targetPath` exists, rename it to `bakPath` via `await fs.rename(targetPath, bakPath)`. This implements the **`.bak` rotation kept for one cycle** invariant from AC-3 — the new `.bak` overwrites the old `.bak`, and the old `targetPath` becomes the new `.bak`.
    4. Write `contents` to `tmpPath` via `await Bun.write(tmpPath, contents)` (Bun-native, per AR33).
    5. Rename `tmpPath` → `targetPath` via `await fs.rename(tmpPath, targetPath)`. **This is the atomic step** — `fs.rename` on POSIX is atomic within a single filesystem.
    6. Do NOT delete `bakPath` — leave it for one cycle as the safety buffer (architecture line 403). The next call to `atomicWrite` for the same path will overwrite it.
  - [x] 6.3 Imports allowed:
    - `import * as fs from "node:fs/promises";` — for `fs.rename` (Bun does not have a built-in `Bun.rename`; `node:fs/promises.rename` is the canonical API and `node:*` is allowed when explicitly justified per AR43).
    - `import { assertWithinScope } from "./paths.ts";` — sibling import within `src/io/`.
    - **No** import of `Bun` (it's a global; no `import` line needed for `Bun.write`).
  - [x] 6.4 Error handling:
    - If `fs.rename(targetPath, bakPath)` fails because `targetPath` does not exist (ENOENT), swallow the error silently — first-write case (no prior file to back up).
    - If `Bun.write(tmpPath, contents)` fails (e.g., disk full), allow the error to propagate. The caller (Story 1.4 lock heartbeat, Story 1.6 state save) is responsible for catching and converting to a `StepperError` subclass.
    - If `fs.rename(tmpPath, targetPath)` fails after the tmp write, allow the error to propagate. The `.bak` is still on disk so the previous good state is recoverable.
    - The dev agent MAY (recommended): wrap the algorithm in a `try/catch` that **deletes the partial `.tmp` file on failure** to avoid stale tmp accumulation. Use `await fs.unlink(tmpPath).catch(() => {})` in the catch block (best-effort cleanup; ignore secondary failures).
  - [x] 6.5 No imports from any other `src/` module beyond `./paths.ts` (AR41).
  - [x] 6.6 Function signature note: the AC says `atomicWrite(path, contents)` — use `targetPath` as the parameter name (`path` shadows the imported `node:path` module). This is a Biome `noShadowRestrictedNames` / readability concern.

- [x] **Task 7 — Implement `src/io/atomic-write.test.ts` (AC: 3)**
  - [x] 7.1 Create `src/io/atomic-write.test.ts` colocated next to `src/io/atomic-write.ts`.
  - [x] 7.2 Use unique tmpdir per test per AR35: `import * as os from "node:os";` then `os.mkdtempSync(path.join(os.tmpdir(), "stepper-atomic-write-"))`. Cleanup in `afterEach` via `fs.rm(dir, { recursive: true, force: true })`.
  - [x] 7.3 Test cases (minimum):
    - **First write to a non-existing path:** `atomicWrite("<tmpdir>/foo.yaml", "contents")` produces `<tmpdir>/foo.yaml` with the expected contents and **no** `<tmpdir>/foo.yaml.bak` (no prior file to back up).
    - **Second write to an existing path:** the first write produces `foo.yaml`; the second write of `"new contents"` produces `foo.yaml` (with `"new contents"`) AND `foo.yaml.bak` (with the original `"contents"`).
    - **Third write to an existing path:** the second `.bak` overwrites the first one (one-cycle-back retention only) — the third write produces `foo.yaml` (third contents), `foo.yaml.bak` (second contents — the just-replaced version).
    - **No `.tmp` file remains** after any successful write — `fs.access("<tmpdir>/foo.yaml.tmp")` should reject with ENOENT.
    - **Scope-violation behaviour:** `atomicWrite("/etc/passwd", "evil")` throws `ScopeViolationError` (delegated to `assertWithinScope`).
    - **Atomicity smoke test:** read `<tmpdir>/foo.yaml` immediately after `await atomicWrite(...)` resolves; the contents are the new contents (not partial). This is a smoke test for the rename being atomic, not a strict concurrency proof.
    - **Binary contents:** `atomicWrite("<tmpdir>/foo.bin", new Uint8Array([1, 2, 3, 4]))` round-trips the bytes via `Bun.file(path).bytes()`.
  - [x] 7.4 No `console.*` calls (Biome `noConsole` rule).
  - [x] 7.5 Tests touch the filesystem; per AR35 they use a unique tmpdir per `it(...)` block (or per `describe`) and clean up in `afterEach`. They MUST NOT touch `_bmad-output/` from the test.

- [x] **Task 8 — Create `src/integration/no-write-outside-scope.test.ts` (AC: 2)**
  - [x] 8.1 Create `src/integration/` (directory does not yet exist — this story is the first to land it).
  - [x] 8.2 Create `src/integration/no-write-outside-scope.test.ts`. This is the project's first cross-module integration test. Per AR32 / P7, integration tests live under `src/integration/<flow>.test.ts`.
  - [x] 8.3 Test cases (minimum, matching AC-2's "the integration test `no-write-outside-scope.test.ts` is green"):
    - **Allowed scope — `_bmad-output/.stepper/`:** spawn a unique tmpdir as a faux project root. `chdir` to it (or use `process.cwd()` overrides via Bun's `Bun.spawn` with `cwd:` for a child-process invocation). Inside, create `_bmad-output/.stepper/` and call `atomicWrite("_bmad-output/.stepper/state.yaml", "schemaVersion: 1\n")`. The write succeeds; the file exists at the expected path.
    - **Allowed scope — `_bmad-output/`:** same setup, `atomicWrite("_bmad-output/foo.md", "...")` succeeds.
    - **Allowed scope — tmpdir itself:** `atomicWrite(<tmpdir>/foo.txt, "...")` succeeds (tests already use tmpdir per AR35).
    - **Forbidden scope — outside the project root:** `atomicWrite("/tmp/etc-passwd-attempt", "evil")` is allowed only if `/tmp/...` is under `os.tmpdir()` — which it is on most macOS and Linux. To trigger a violation deterministically, use `atomicWrite("/etc/some-target-that-does-not-exist", "...")` (which is outside both the project root and `os.tmpdir()`). The test asserts a `ScopeViolationError` is thrown.
    - **Forbidden scope — `_bmad/`:** `atomicWrite("_bmad/config.yaml", "evil override")` throws `ScopeViolationError` (the BMAD installed-files directory is read-only per AR42).
    - **Forbidden scope — `~/.claude/plugins/`:** `atomicWrite("~/.claude/plugins/x.json", "...")` throws (tilde is not expanded; the path has no allowed root prefix anyway).
  - [x] 8.4 The integration test MAY also do an end-to-end check: `fs.readdir` the tmpdir (the faux project root) **after** the test runs and assert no files were written outside the expected paths. This is the "fs.access to verify nothing was written outside" pattern from architecture §P8 line 1007. The simple version is sufficient for v0.1; the full pattern lands in Epic 6.
  - [x] 8.5 No `console.*` calls.
  - [x] 8.6 Use a unique tmpdir per `it(...)` block; cleanup in `afterEach`. Per AR35, **never** touch `_bmad-output/` from the test runtime — the `_bmad-output/.stepper/` test runs inside the tmpdir, not the real project's `_bmad-output/`.

- [x] **Task 9 — Verify `bun run check` exit 0 (AC: 1, 2, 3)**
  - [x] 9.1 Run `bunx biome ci .` and confirm exit 0. The new `src/io/log.ts`, `src/io/paths.ts`, `src/io/atomic-write.ts`, the three colocated tests, the integration test, and the updated `src/errors.ts` / `src/errors.test.ts` MUST all pass Biome 2.3.15 linting.
  - [x] 9.2 Run `bun test` and confirm: at least 5 test files reported (`src/errors.test.ts` from Story 1.2 + `src/io/log.test.ts` + `src/io/paths.test.ts` + `src/io/atomic-write.test.ts` + `src/integration/no-write-outside-scope.test.ts` from this story), all green, exit 0.
  - [x] 9.3 Run `bun test src/io/log.test.ts`, `bun test src/io/paths.test.ts`, `bun test src/io/atomic-write.test.ts`, and `bun test src/integration/no-write-outside-scope.test.ts` as single-file invocations and confirm each exits 0.
  - [x] 9.4 Run `bun run check` (the composite release-blocker gate) and confirm exit 0.
  - [x] 9.5 Run `bunx tsc --noEmit` (defensive, not a release-blocker command but useful given strict tsconfig). Confirm exit 0.

- [x] **Task 10 — Final story-level sanity check (AC: 1, 2, 3)**
  - [x] 10.1 Confirm the file count: exactly **eight** new files under `src/` (`src/io/log.ts`, `src/io/log.test.ts`, `src/io/paths.ts`, `src/io/paths.test.ts`, `src/io/atomic-write.ts`, `src/io/atomic-write.test.ts`, `src/integration/no-write-outside-scope.test.ts`, plus the `src/io/` and `src/integration/` directories themselves). The Story 1.2 files (`src/errors.ts`, `src/errors.test.ts`) are MODIFIED to add `SCOPE_VIOLATION` (per Task 4.1) but no other Story 1.2 files are touched.
  - [x] 10.2 Confirm no edits to: `package.json`, `tsconfig.json`, `biome.json`, `bunfig.toml`, `.github/workflows/ci.yml`, `.claude-plugin/plugin.json`, `commands/bmad-next.md`, `bun.lock`. This story is source-only plus the registry edit to `src/errors.ts`.
  - [x] 10.3 Confirm no edits to anything under `_bmad-output/.stepper/` (the persistence boundary AR42 — `_bmad-output/.stepper/` does not exist yet anyway, but assert intent).
  - [x] 10.4 Confirm `src/io/*.ts` files have **zero imports from non-foundational modules**. Allowed: `node:fs/promises`, `node:path`, `node:os` (with explicit justification per AR43). Allowed: `../errors.ts` (sibling foundational). Forbidden: any import from `src/state/`, `src/dag/`, `src/commands/`, `src/schemas/`, etc.
  - [x] 10.5 Update this story file's Status to `review` upon completion (the dev-story workflow handles this — bmad-create-story leaves it `ready-for-dev`).

## Dev Notes

### Architecture Compliance — What the Dev Agent MUST Follow

This story implements **AR33** (function & error semantics — "no `console.log` in runtime"), **AR36** (code quality CI gates — `noConsole` rule + integration tests), **AR41** (module boundary graph — `src/io/` is foundational), and **AR42** (persistence boundary — writes only inside allowed roots). It also operationalises **FR54** (stdout/stderr discipline), **FR18** (one-line main-thread output — log.ts is the substrate), **FR46** (single-line error summary — same), **NFR-S2** (writes only inside scope), **NFR-S5** (atomic writes), **NFR-R1** (zero data loss on halt — `.bak` rotation).

#### AR33 — Function & error semantics (verbatim, partial)

> Throw `StepperError` subclasses (no `Result<T,E>` in general code path). [...] Bun-native APIs preferred (`Bun.file`, `Bun.write`, `Bun.YAML.parse`, `Bun.spawn`). No `any`. No `console.log` in runtime — use `src/io/log.ts`.

This is the load-bearing requirement for Tasks 1–2. **Every call to print to stdout/stderr in the project MUST go through `src/io/log.ts`** from this story onwards. The errors module (Story 1.2) already complies by carrying `actionableHint` strings that callers pass to `log.error()`.

#### AR41 — Module boundary graph (verbatim, partial)

> Foundational (no upward imports): `errors.ts`, `schemas/`, `io/`. Mid-level: `migrations/`, `state/`, `bmad-detect/`, `personas/`, `dag/`, `transcript/`, `telemetry/`, `upgrade/`. Higher-level: `verifiers/`, `dispatch/`, `failure-ux/`. Top-level: `commands/`. Enforced by Biome import-restriction rule or hand-rolled CI test.

`src/io/log.ts`, `src/io/paths.ts`, and `src/io/atomic-write.ts` are foundational. Allowed imports:
- Standard library (`node:fs/promises`, `node:path`, `node:os`) — with explicit justification per AR43.
- Bun globals (`Bun.write`, `Bun.file`, `process.stdout`, `process.stderr`).
- Sibling foundational modules: `src/io/atomic-write.ts` MAY import from `src/io/paths.ts` (same tier, no upward dependency). `src/io/paths.ts` and `src/io/atomic-write.ts` MAY import the abstract `StepperError` from `../errors.ts` (cross-foundational, both no-upward-import — since `errors.ts` does NOT import from `src/io/`, the dependency is acyclic).

**Forbidden imports in `src/io/`:**
- `src/state/`, `src/dag/`, `src/commands/`, `src/schemas/`, `src/migrations/`, `src/personas/`, `src/transcript/`, `src/telemetry/`, `src/upgrade/`, `src/bmad-detect/`, `src/verifiers/`, `src/dispatch/`, `src/failure-ux/`. These are all consumers of `io/`, not producers.

The boundary will be enforced by a Biome import-restriction rule or a hand-rolled CI test in a later story (Epic 6); for now, manual review.

#### AR42 — Persistence boundary (verbatim)

> Reads allowed from `_bmad-output/.stepper/**`, `_bmad-output/**`, `_bmad/**`, `docs/**`, `bmad-stepper.config.yaml`, `~/.claude/plugins/<bmad>/**`. Writes only to `_bmad-output/.stepper/**` and `_bmad-output/**` (artifact promotion). NEVER to `_bmad/**` or `~/.claude/plugins/<bmad>/**`. Lock only at `_bmad-output/.stepper/state.yaml.lock/`.

`src/io/paths.ts`'s `assertWithinScope()` enforces the WRITE side of this boundary. Reads are NOT validated by this helper (callers in later stories will read freely from `_bmad/`, `docs/`, etc.); only writes are scope-checked. The story AC-2 mentions `_bmad-output/.stepper/**`, `_bmad-output/**`, and the test tmpdir — these are the three allowed write roots, and all three MUST be encoded in `assertWithinScope`.

The integration test `src/integration/no-write-outside-scope.test.ts` (Task 8) is the AR42 + NFR-S2 CI gate. It is a **release blocker** per AR36.

#### AR36 — Code quality CI gates (verbatim, partial)

> Biome 2.3 only (no ESLint/Prettier); `biome.json` enforces strict (incl. `noConsoleLog`, `noImplicitAnyLet`). CI gate `bun run check = biome ci . && bun test` is a release blocker. Three integration-test gates: errors-registry, no-write-outside-scope (NFR-S2), no-network-on-main (NFR-S1).

This story lands the **second** of the three integration-test gates: `no-write-outside-scope.test.ts`. The first (errors-registry) was Story 1.2; the third (no-network-on-main) is Story 1.7 / Epic 6.

#### Biome rule rename — `noConsoleLog` → `noConsole` (CRITICAL)

The story's AC-1 says: "Biome rule `noConsoleLog: \"error\"` blocks any `console.log` outside `src/io/log.ts`."

In Story 1.1 the dev agent established that **Biome 2.3.x renamed `suspicious.noConsoleLog` to `suspicious.noConsole`** (the new rule blocks ALL `console.*` calls, not just `console.log`). The current `biome.json` (preserved verbatim from Story 1.1) declares:

```json
"suspicious": { "noConsole": "error", ... }
```

The dev agent MUST treat the AC's `noConsoleLog` reference as historical — the **current and authoritative rule name is `noConsole`** in Biome 2.3.15. The AC's intent is unchanged: `console.log` (and `console.error`, `console.warn`, `console.info`, `console.debug`, etc.) are blocked everywhere. The historical exception "outside `src/io/log.ts`" is no longer needed because `src/io/log.ts` itself uses `process.stdout.write` / `process.stderr.write`, NOT `console.*`.

**Practical implication:** the dev agent does NOT need to add a Biome `overrides` block to whitelist `src/io/log.ts` — there is nothing to whitelist. `console.*` is forbidden everywhere. `process.stdout.write` and `process.stderr.write` are the sanctioned APIs in `src/io/log.ts`.

This rename rationale should be repeated by the dev agent in their Completion Notes List, citing both Story 1.1's original observation and Story 1.2's reaffirmation.

### Source Tree — Exact Files to Create or Modify

This story creates exactly **seven new files** under `src/` (across two new subdirectories `src/io/` and `src/integration/`) and modifies exactly **two existing files** (`src/errors.ts`, `src/errors.test.ts`) to add `SCOPE_VIOLATION` to the registry.

**Files created:**

```
bmad-stepper/
└── src/
    ├── io/
    │   ├── log.ts                 # info/warn/error → stderr; json → stdout (FR54)
    │   ├── log.test.ts            # routing assertions for the four functions
    │   ├── paths.ts               # assertWithinScope(path) + scope-root constants
    │   ├── paths.test.ts          # scope-allow + scope-violation assertions
    │   ├── atomic-write.ts        # tmp+rename + .bak rotation (NFR-R1, NFR-S5)
    │   └── atomic-write.test.ts   # first-write, second-write, .bak rotation, scope check
    └── integration/
        └── no-write-outside-scope.test.ts   # NFR-S2 CI gate (AR36 release blocker)
```

**Files modified (registry edit per Task 4.1):**

- `src/errors.ts` — add `SCOPE_VIOLATION` to `StepperErrorCode`, add `ScopeViolationError` subclass, add to `errorRegistry`.
- `src/errors.test.ts` — add `SCOPE_VIOLATION` to `REQUIRED_CODES`, change `toHaveLength(15)` to `toHaveLength(16)`.

**Files NOT modified (preserved verbatim from Stories 1.1 + 1.2):**

- `package.json`, `tsconfig.json`, `biome.json`, `bunfig.toml`, `bun.lock`.
- `.github/workflows/ci.yml`, `.claude-plugin/plugin.json`, `commands/bmad-next.md`.
- `.gitignore`, `LICENSE`.
- All `_bmad/`, `_bmad-output/planning-artifacts/`, `docs/`, `.changeset/` files.

### Testing Requirements

- **`bun test` MUST pass with at least 5 test files** discovered: `src/errors.test.ts` (Story 1.2), `src/io/log.test.ts`, `src/io/paths.test.ts`, `src/io/atomic-write.test.ts`, `src/integration/no-write-outside-scope.test.ts`.
- **Each test file MUST exit 0 standalone:** `bun test src/io/log.test.ts`, etc.
- **Total test count:** `src/errors.test.ts` runs ~10 it(...) blocks (per Story 1.2 dev record); this story adds at least 5+5+7+6 = ~23 more. Aim for ~33 total it(...) blocks across the project after Story 1.3 lands.
- **Run-time budget:** all unit tests pure in-memory or tmpdir; aim for <1s wall time per file; integration test may take longer due to FS but should be <2s.
- **`bunx biome ci .`** MUST exit 0 against the new files. The dev agent MUST run `bunx biome check . --write` first if there are any auto-fixable issues, then re-run `biome ci` to confirm clean.
- **`bun run check`** MUST exit 0 (composite release-blocker).
- **CI matrix** (`ubuntu-latest`, `macos-latest` per Story 1.1 `ci.yml`) MUST be green on first push. The atomic-write test in particular relies on POSIX `fs.rename` semantics — both Linux and macOS provide this; Windows is out of scope per AR43.

### Test Design — Bun-test specifics

- The Bun test runner is invoked via `bun test`. Default test discovery globs `**/*.test.ts` — all five test files are picked up automatically.
- Imports use the `bun:test` namespace: `import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";`. Story 1.2 used `describe, expect, it`; this story adds `afterEach`/`beforeEach` (for tmpdir cleanup) and `spyOn` (for stream-routing assertions).
- `tsconfig.json` has `allowImportingTsExtensions: true` and `verbatimModuleSyntax: true`; sibling imports use `from "./errors.ts"` etc. with the `.ts` extension.
- `tsconfig.json` has `noEmit: true` — Bun runs `.ts` source directly; no transpile.
- `tsconfig.json` has `noUncheckedIndexedAccess: true` — array index returns `T | undefined`; prefer `for (const x of xs)` over `xs[0]` indexed access.
- `tsconfig.json` has `noImplicitOverride: true` — every overridden field/method on a subclass must use the `override` modifier (relevant for `ScopeViolationError` per Task 4.1 — same pattern as the 15 existing subclasses).

### File Structure Requirements — Final Check

Before declaring this story done, the dev agent MUST verify ALL of these checks pass:

1. **`src/io/log.ts`** exists; exports `info`, `warn`, `error`, `json` named functions.
2. **`src/io/log.test.ts`** exists colocated; uses `spyOn` against `process.stdout.write` and `process.stderr.write`.
3. **`src/io/paths.ts`** exists; exports `assertWithinScope` (and possibly scope-root constants).
4. **`src/io/paths.test.ts`** exists colocated; covers allow + violation cases.
5. **`src/io/atomic-write.ts`** exists; exports `atomicWrite` async function.
6. **`src/io/atomic-write.test.ts`** exists colocated; covers first-write, second-write, third-write, scope-check, binary contents.
7. **`src/integration/no-write-outside-scope.test.ts`** exists; tests both allowed and forbidden roots.
8. **`src/errors.ts`** updated to include `SCOPE_VIOLATION` code and `ScopeViolationError` class.
9. **`src/errors.test.ts`** updated to assert `toHaveLength(16)` and the 16-code list.
10. **`bun test` exits 0** with all test files reported as run.
11. **`bunx biome ci .` exits 0** against the new files.
12. **`bun run check` exits 0** (the release-blocker gate).
13. **No imports outside foundational scope** in `src/io/*.ts` (AR41).
14. **`package.json`, `tsconfig.json`, `biome.json`, `bunfig.toml`, `.github/workflows/ci.yml`, `.claude-plugin/plugin.json`** are byte-identical to their Story 1.2 state.
15. **Status flipped to `review`** upon dev-story completion (handled by dev-story workflow).

### Code Quality Enforcement (AR36)

- **Biome 2.3.15 only.** No ESLint, no Prettier. The `biome.json` from Story 1.1 is canonical.
- **`noConsole: "error"`** — blocks all `console.*` calls everywhere. Use `process.stderr.write` / `process.stdout.write` in `src/io/log.ts` (the sanctioned IO module) and `expect(...)` in tests.
- **`noImplicitAnyLet: "error"`** (under `suspicious` in 2.3.15) — every `let` declaration must have an explicit type. Prefer `const`.
- **`noUnusedVariables: "error"`** — every imported symbol must be used. Don't import `mock` if you don't call `mock(...)`.
- **`noShadowRestrictedNames` / shadowing concerns** — avoid `let path = ...` if you've already imported `* as path from "node:path"`. Use `targetPath` parameter names instead (Task 6.6).
- **Import organisation:** Biome 2.3.15's `assist/source/organizeImports` rule expects alphabetical imports with type-only imports last. The Story 1.2 dev agent hit this on `src/errors.test.ts` and reordered. Same convention applies here.

### Naming Conventions (AR31, applied to Source TS)

- **Filenames:** `kebab-case.ts` — `log.ts`, `paths.ts`, `atomic-write.ts`, `no-write-outside-scope.test.ts`.
- **Function names:** `camelCase` — `assertWithinScope`, `atomicWrite`, `info`, `warn`, `error`, `json`.
- **Class names:** `PascalCase` ending in `Error` — `ScopeViolationError`.
- **Type names:** `PascalCase` — `StepperErrorCode` (extending the existing union with `SCOPE_VIOLATION`).
- **Constants:** `SCREAMING_SNAKE_CASE` — `STEPPER_INTERNAL_ROOT`, `BMAD_OUTPUT_ROOT` (if exported from `paths.ts`).
- **Error code string literals:** `SCREAMING_SNAKE_CASE` — `"SCOPE_VIOLATION"`.

### Module Boundary Graph (AR41) — Second Enforcement Point

Story 1.2 was the first enforcement point (`src/errors.ts` = foundational, zero imports). This story is the second — `src/io/` joins `src/errors.ts` in the foundational tier. Every later module (Stories 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12, 1.13, all of Epic 2, etc.) will import FROM `src/io/` but never write code that introduces a circular import back to `src/io/`.

`src/io/log.ts` MUST import nothing from any `src/` module. The only references are Bun globals (`process.stdout`, `process.stderr`).

`src/io/paths.ts` MAY import from `../errors.ts` (sibling foundational, see Task 4.1). It MAY import `node:path` and `node:os` (justified per AR43 — they're side-effect-free standard modules). Nothing else.

`src/io/atomic-write.ts` MAY import from `./paths.ts` (sibling within `src/io/`) and from `node:fs/promises` (for `fs.rename`). Nothing else.

The integration test `src/integration/no-write-outside-scope.test.ts` MAY import from `bun:test`, `node:fs/promises`, `node:os`, `node:path`, and from any `src/` module under test (`../io/atomic-write.ts`, `../io/paths.ts`, `../errors.ts`). Integration tests are explicitly cross-module per AR32.

### Persistence Boundary (AR42)

`_bmad-output/.stepper/` does not exist yet. The dev agent MUST NOT create it during this story. The atomic-write tests run inside a unique tmpdir (via `os.mkdtempSync`) and never touch the real `_bmad-output/.stepper/` (per AR35).

The `assertWithinScope` helper encodes `_bmad-output/.stepper/**`, `_bmad-output/**`, and `os.tmpdir()` as the three allowed write roots — these match AC-2 verbatim and AR42 with the test-tmpdir extension for testing flow.

### Documentation Within This Story

This story does NOT ship `docs/exit-codes.md`, `docs/io-conventions.md`, or any other narrative documentation. Story 1.13 (Quick-Start Documentation) owns the public-facing docs; the JSDoc comments in `src/io/log.ts`, `src/io/paths.ts`, and `src/io/atomic-write.ts` are the single source of truth for the IO conventions in v0.1.

The new `ScopeViolationError`'s `actionableHint` (Task 4.1 — `"Check that the target path is inside _bmad-output/, _bmad-output/.stepper/, or the test tmpdir; see src/io/paths.ts assertWithinScope() for the allowed roots."`) is the user-facing description of the boundary; `docs/exit-codes.md` (Story 1.13) will be a tabular projection.

### Previous Story Intelligence (from Story 1.2 — `done` status)

Story 1.2 landed `src/errors.ts` and `src/errors.test.ts` and is `done` per `sprint-status.yaml`. Key learnings the dev agent should fold into this story's execution:

#### Project Structure (from 1.2 File List section)

- `src/` directory now exists at the project root with `errors.ts` + `errors.test.ts`.
- The error registry has exactly 15 entries (Task 4.1 of THIS story will bump it to 16).
- The abstract `StepperError` base class sets `this.name = new.target.name` in its constructor — every subclass automatically gets its class name on `Error.name` without per-subclass boilerplate. Reuse this pattern for `ScopeViolationError`.
- Each subclass uses `override readonly code = "..." as const;` to satisfy `tsconfig.noImplicitOverride: true`. Same pattern for `ScopeViolationError`.
- The `StepperExitCode` named type alias (`0 | 1 | 2 | 3 | 4 | 5`) is exported from `src/errors.ts`. `ScopeViolationError` declares `override readonly exitCode = 5 as const;` (pathological-input bucket).
- `src/errors.test.ts` builds instances from `errorRegistry` via `Object.values(errorRegistry).map((Ctor) => new Ctor("test message"))`. Same pattern applies post-edit (the test enumerates 16 entries).

#### Bun-test conventions established in Story 1.2

- `import { describe, expect, it } from "bun:test";` is the canonical test import pattern.
- `tsconfig.json` flags (no changes since Story 1.1):
  - `strict: true`, `verbatimModuleSyntax: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`.
- Imports use `.ts` extension on sibling files (`from "./errors.ts"`).
- Test glob is `**/*.test.ts` — Bun discovers all five test files this story adds automatically.
- The `--pass-with-no-tests` flag is preserved in `package.json` `scripts.test` and `scripts.check`. After this story, the flag is even more redundant (5+ test files exist) but DO NOT remove it (Story 1.1 + 1.2 guardrail).

#### Biome 2.3.15 rule renames (CRITICAL — reaffirmed in 1.2)

- `suspicious.noConsoleLog` was **renamed** to `suspicious.noConsole` between Biome 2.3.0 and 2.3.15. The architecture §P8 canonical config (line 978) uses the old name; the project's `biome.json` (Story 1.1) uses the new name. Story 1.2's Completion Notes restated this; Story 1.3 also operates under the new name.
- `style.noImplicitAnyLet` was **moved** to `suspicious.noImplicitAnyLet` in Biome 2.3.15. Story 1.1's `biome.json` reflects this. Always declare explicit types on `let` (or use `const`).
- Story 1.2 did NOT need to touch `biome.json` and neither does Story 1.3. The canonical config is preserved verbatim.

#### Naming + File Layout (from 1.2 dev guardrails — still apply)

- Filenames: `kebab-case.ts`. Test file: `<source>.test.ts` colocated.
- TS classes: `PascalCase` ending in `Error` for error classes (`ScopeViolationError`).
- TS variables/functions: `camelCase` (`assertWithinScope`, `atomicWrite`).
- Constants and string-literal codes: `SCREAMING_SNAKE_CASE` (`SCOPE_VIOLATION`, `STEPPER_INTERNAL_ROOT`).
- No `I`-prefixed interfaces.
- ESM exclusively (`package.json` has `"type": "module"`). No CommonJS.

#### Forbidden Actions (from 1.2 dev guardrails — still apply)

- **Do NOT add `tsc`-based build steps.** Bun runs `.ts` source directly; `tsconfig.json` has `noEmit: true`.
- **Do NOT add `dist/`, `build/`, or any output directory.** Source = release.
- **Do NOT add `commander`, `oclif`, `yargs`, `jest`, `vitest`, `mocha`.**
- **Do NOT add `package-lock.json` or `yarn.lock`.** Only `bun.lock` (text) is the lockfile.
- **Do NOT add ESLint or Prettier.** Biome 2.3.15 is the only linter/formatter (AR36).
- **Do NOT touch `_bmad/` or `_bmad-output/planning-artifacts/`.** Those are managed by other tooling.
- **Do NOT publish, tag, or push a release.** Version stays at `0.0.0` until Epic 6.
- **Do NOT add native Windows support.** Linux + macOS only in v0.1.

#### Story 1.2 Senior Developer Review — outcome

Story 1.2's review outcome was `approve` (no must-fix, no should-fix, no nits). The implementation pattern (single-file foundational module + colocated test + registry CI gate) is the template for `src/io/` — but `src/io/` is a directory, not a single file, because the IO concerns are orthogonal (logger vs paths vs atomic write). Three modules (`log.ts`, `paths.ts`, `atomic-write.ts`) instead of one mega-module.

#### Bun host version + lockfile state (from 1.1 + 1.2)

- Bun 1.3.12 on the executing host (satisfies AR2's `≥ 1.3` pin).
- Lockfile is `bun.lock` (text format) — Bun 1.2+ defaults to text. **DO NOT bump or modify** `bun.lock` in this story (no new dependencies required — `node:fs/promises`, `node:path`, `node:os` are standard library).
- Biome 2.3.15 exact-pinned (`-E` flag in Story 1.1 Task 3). Zod 4.4.1 also pinned but **NOT used in this story** — `src/io/` is below the schema layer (AR41).

### Latest Tech Information (v0.1.0 release window)

Versions are pinned per AR2 — no further web research is required for this story. No package install or upgrade needed. The dev agent MUST NOT run `bun add` / `bun install --save` during this story. If `bun install` is run for any reason (e.g., to verify lockfile state), the `bun.lock` MUST remain byte-identical.

### Project Structure Notes — Anticipated Variances

- **`src/io/` directory creation:** does not exist after Story 1.2. The dev agent creates it implicitly when writing `src/io/log.ts` (Bun.write creates intermediate directories). Same for `src/integration/`.
- **No `src/io/index.ts` barrel:** v0.1 does not use barrel exports. Every module is imported by full path: `import { atomicWrite } from "../io/atomic-write.ts";`. The architecture's source tree shows `src/io/index.ts` as a placeholder (line 1197) but Story 1.3 does NOT create it (YAGNI; later stories will add it if/when needed).
- **No `src/io/lock.ts` or `src/io/snapshot.ts`:** Stories 1.4 (file lock) and 1.8 (snapshot) own those. This story creates ONLY `log.ts`, `paths.ts`, and `atomic-write.ts`.
- **`tsconfig.json`'s `noUncheckedIndexedAccess`:** array indexing returns `T | undefined`. In tests, prefer `for (const x of xs)` or `instances.entries()` patterns over `xs[0]` indexed access.
- **`tsconfig.json`'s `verbatimModuleSyntax`:** type-only imports MUST use `import type` (e.g., `import type { StepperErrorCode } from "../errors.ts";`). Mixed-imports allow `import { foo, type Bar } from "...";` syntax.
- **`tsconfig.json`'s `allowImportingTsExtensions`:** all sibling imports use the `.ts` extension. Do NOT use extensionless imports.

### Dev Agent Guardrails — Do Not Do These Things

In addition to the Story 1.2 guardrails (still in force):

- **Do NOT add `console.log` / `console.error` / `console.warn` / `console.info` anywhere.** Biome's `noConsole` rule blocks ALL `console.*` calls. Use `process.stdout.write` / `process.stderr.write` in `src/io/log.ts`. Use `expect(...)` (not `console.log`) in tests.
- **Do NOT shadow the `path` module name.** `import * as path from "node:path";` then use `targetPath` as the parameter name. `let path = ...` shadows the import (and is also blocked by Biome's `noShadowRestrictedNames`).
- **Do NOT use `node:fs` (sync).** Use `node:fs/promises` for `fs.rename`. Bun's runtime supports both, but the architecture's bias is async/await throughout (P4: "Async style: always `async/await`").
- **Do NOT use `Bun.write` to write the canonical path directly** — write to the `.tmp` first, then rename. The atomic invariant (NFR-S5) requires the rename step.
- **Do NOT delete `path.bak` after a successful write.** The one-cycle retention (architecture line 403) is the safety buffer. The next call to `atomicWrite` for the same path will overwrite the `.bak`; that's by design.
- **Do NOT bypass `assertWithinScope` in `atomicWrite`.** Every call to `atomicWrite` MUST start with `assertWithinScope(targetPath)` — this is the AC-2 + AC-3 contract.
- **Do NOT add a Biome `overrides` block** to whitelist any file. The new files (and the existing `src/io/log.ts`) all comply with `noConsole: "error"` because they use `process.stdout.write` / `process.stderr.write`.
- **Do NOT modify any file outside the seven new files + the two registry edits to `src/errors.ts` / `src/errors.test.ts`.** Story 1.1 + 1.2 scaffold preservation applies.
- **Do NOT skip the test for binary contents in atomic-write.** Story 1.6's state save uses YAML (string), but Story 2.5's run-log writer may use binary chunks for streaming — round-trip the bytes via `Bun.file(path).bytes()` to confirm.
- **Do NOT introduce a runtime dep on `node:util`, `node:assert`, etc.** `node:fs/promises`, `node:path`, `node:os` are the only allowed `node:*` modules; everything else needs explicit justification per AR43.

### Git Intelligence

The recent git history (post-Story 1.2):

- (Story 1.2 commit — first source-code commit, includes `src/errors.ts` + `src/errors.test.ts`)
- `9760e7d docs: add sprint status tracking`
- `58f0e12 docs: add implementation readiness report`
- `8360f72 chore: ignore stepper and claude local state`
- `3a814ae docs: add epics and stories breakdown`
- `03a6c22 docs: add architecture decision document`

This story's commit (when authored by the dev-story workflow) will be the **second source-code commit** of the project — `src/io/log.ts`, `src/io/paths.ts`, `src/io/atomic-write.ts`, plus colocated tests, plus integration test, plus the registry edit. Use a single commit (`feat: add io primitives — logger, path scope-checker, atomic write`) to keep the diff reviewable. The branch is `04-30-docs_add_sprint_status_tracking` per the run.yaml — the dev-story or bmad-loop workflow may rename the branch on first source-code commit.

### References

Cite all technical details with source paths and sections:

- **Story Foundation:**
  - [Source: _bmad-output/planning-artifacts/epics.md#Story 1.3: Logger + Path Helpers + Atomic Write] — User story + AC verbatim (lines 375–392).
  - [Source: _bmad-output/planning-artifacts/epics.md#Epic 1: Foundation & First-Run Diagnostic] — Epic context.
  - [Source: _bmad-output/planning-artifacts/epics.md#Additional Requirements] — AR33, AR36, AR41, AR42 declarations (lines 219, 222, 236–237).
- **Architecture Compliance:**
  - [Source: _bmad-output/planning-artifacts/architecture.md#P4 Function & Error Semantics] — `console.log` forbidden; logger at `src/io/log.ts` (line 862).
  - [Source: _bmad-output/planning-artifacts/architecture.md#D10 Snapshot/checkpoint mechanism] — Atomic tmp+rename + `.bak` rotation algorithm (lines 391–407).
  - [Source: _bmad-output/planning-artifacts/architecture.md#P8 Code Quality Enforcement] — Biome rules + integration-test gates (lines 967–1009).
  - [Source: _bmad-output/planning-artifacts/architecture.md#No-write-outside-scope CI gate] — Integration-test contract for NFR-S2 (line 1007).
  - [Source: _bmad-output/planning-artifacts/architecture.md#Complete Project Directory Structure] — `src/io/{log.ts, paths.ts, atomic-write.ts}` placement (lines 1196–1203).
  - [Source: _bmad-output/planning-artifacts/architecture.md#Module Boundary Graph (AR41)] — Foundational tier declaration (lines 1273–1278).
  - [Source: _bmad-output/planning-artifacts/architecture.md#Persistence Boundary] — AR42 allowed read/write roots (lines 1306–1314).
  - [Source: _bmad-output/planning-artifacts/architecture.md#FR Coverage Map] — FR54 → `src/io/log.ts` (line 1384), NFR-S2 → `src/io/paths.ts` (line 1397), NFR-S5 → `src/io/atomic-write.ts` (line 1400), NFR-R1 → `src/io/atomic-write.ts` (line 1402).
- **Cross-Cutting:**
  - [Source: _bmad-output/planning-artifacts/architecture.md#Naming Conventions (P1, P3, P4)] — Class names + filename rules (line 723).
  - [Source: _bmad-output/planning-artifacts/architecture.md#Errors are thrown, not returned] — Throw-everywhere semantics (line 857).
  - [Source: _bmad-output/planning-artifacts/architecture.md#Enforcement Guidelines] — Throw `StepperError` subclasses, never raw `Error` (P4, line 1015).
- **Previous Story:**
  - [Source: _bmad-output/implementation-artifacts/1-2-errors-module-registry-ci-gate.md#Senior Developer Review (AI)] — Review outcome `approve`.
  - [Source: _bmad-output/implementation-artifacts/1-2-errors-module-registry-ci-gate.md#Completion Notes List] — `new.target.name` pattern; `override readonly` pattern; alphabetical import ordering for Biome 2.3.15 organize-imports.
  - [Source: _bmad-output/implementation-artifacts/1-2-errors-module-registry-ci-gate.md#File List] — Final post-Story-1.2 source state to extend.
  - [Source: _bmad-output/implementation-artifacts/1-1-initialize-repository-scaffold.md#Completion Notes List] — Bun 1.3.12 host; Biome 2.3.15 rule renames (`noConsoleLog` → `noConsole`); `--pass-with-no-tests` flag; lockfile is `bun.lock` (text).
- **Project Config Pin:**
  - [Source: _bmad/config.yaml] — `project_name: bmad-stepper`, `planning_artifacts`, `implementation_artifacts`, `test_framework: bun-test`. **Pinned to `_bmad/config.yaml` (NOT `_bmad/bmm/config.yaml`).**

### Definition of Done

- [x] All 10 tasks above completed and self-checked.
- [x] All 15 file-structure final-check items pass.
- [x] `src/io/log.ts`, `src/io/paths.ts`, `src/io/atomic-write.ts` exist and pass Biome ci + bun test.
- [x] `src/io/no-write-outside-scope.test.ts` exists and passes. _(Deviation from story Task 8.2: file lives at `src/io/no-write-outside-scope.test.ts` per the dev-task instructions, NOT `src/integration/`. Same content, different parent dir.)_
- [ ] ~~`src/errors.ts` + `src/errors.test.ts` updated to add `SCOPE_VIOLATION` (16 entries total).~~ _(Deviation from story Task 4.1: per the dev-task instructions, `src/errors.ts` and `src/errors.test.ts` are explicitly OUT of mutation scope for this story. The story's own AC-2 says "the helper throws `SCOPE_VIOLATION` (or equivalent)" and offers a registry-edit path AS WELL AS an "equivalent" alternative; the dev-task constrained us to the latter. Implementation routes `assertWithinScope` violations through the existing registered `PathologicalInputError` (code `PATHOLOGICAL_INPUT`, exitCode 5 — pathological-input bucket). The thrown error's `message` field carries the literal string `SCOPE_VIOLATION:` prefix so callers can still grep on it; the registered code remains 15 entries. A future story can add a dedicated `ScopeViolationError` to the registry without source changes outside `paths.ts`.)_
- [x] `bun run check` exits 0 locally.
- [ ] CI green on `ubuntu-latest` and `macos-latest`. _(deferred — verified post-merge per Story 1.1 A4 follow-up)_
- [x] `info`/`warn`/`error` route to stderr; `json` routes to stdout. Verified via `spyOn` in `log.test.ts`.
- [x] `assertWithinScope` allows `_bmad-output/.stepper/**`, `_bmad-output/**`, `os.tmpdir()`. Throws `PathologicalInputError` (with `SCOPE_VIOLATION:` message prefix) otherwise.
- [x] `atomicWrite` rotates `.bak` for one cycle; first-write skips `.bak`; second-write creates `.bak`; third-write overwrites `.bak`.
- [x] No `console.*` calls anywhere in the new files (Biome `noConsole` confirmed).
- [x] No imports outside foundational scope in `src/io/*.ts` (AR41).
- [x] Status flipped to `review` upon dev-story completion (handled by dev-story workflow).
- [ ] Commit pushed to a branch (no force-push to `main`). _(deferred — bmad-loop / orchestrator owns commit + push)_

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m] (Opus 4.7, 1M context). Persona `bmad-dev-story` invoked
under `/bmad-loop --until epic:1` iteration 8 of the implementation phase.

### Debug Log References

```
$ bun --version
1.3.12

$ bun test
bun test v1.3.12 (700fc117)
 44 pass
 0 fail
 246 expect() calls
Ran 44 tests across 5 files. [88.00ms]

$ bun test src/io/log.test.ts
 6 pass / 0 fail / 18 expect() calls / 1 file

$ bun test src/io/paths.test.ts
 10 pass / 0 fail / 13 expect() calls / 1 file

$ bun test src/io/atomic-write.test.ts
 10 pass / 0 fail / 22 expect() calls / 1 file

$ bun test src/io/no-write-outside-scope.test.ts
 8 pass / 0 fail / 8 expect() calls / 1 file

$ bunx biome ci .
Checked 14 files in 4ms. No fixes applied.

$ bun run check
$ biome ci . && bun test --pass-with-no-tests
Checked 14 files in 5ms. No fixes applied.
bun test v1.3.12 (700fc117)
 44 pass / 0 fail / 246 expect() calls / 5 files

$ bunx tsc --noEmit
exit: 0
```

Biome auto-format pass (`bunx biome check --write .`) reformatted two test
files (`src/io/paths.test.ts`, `src/io/no-write-outside-scope.test.ts`) on
first run; `bunx biome ci .` clean afterwards. No source-of-truth changes.

### Completion Notes List

- **Mutation-scope deviation from story Task 4.1.** The story file (lines
  136–145, Task 4.1) recommended a registry edit to `src/errors.ts` to add a
  16th `SCOPE_VIOLATION` code + `ScopeViolationError` subclass, and a matching
  edit to `src/errors.test.ts` (assert `toHaveLength(16)`). The dev-task
  instructions for this iteration (the agent prompt under `/bmad-next`)
  explicitly DECLARED `src/errors.ts` and `src/errors.test.ts` OUT of mutation
  scope and DIRECTED the dev agent to "use the appropriate error class from
  `src/errors.ts` — likely `PathologicalInputError`". The dev-task instruction
  takes precedence; the AC-2 wording ("`SCOPE_VIOLATION` (or equivalent)") +
  story Task 4.3 ("alternative path") expressly anticipate this choice. Net
  result: `src/io/paths.ts` throws `PathologicalInputError` with message text
  prefixed with `SCOPE_VIOLATION:` so the literal string remains greppable for
  later instrumentation. All AC-2 + AC-3 invariants behave identically; only
  the registered error code differs from `SCOPE_VIOLATION` (now
  `PATHOLOGICAL_INPUT`).

- **Mutation-scope deviation from story Task 8.** The story (lines 198–210,
  Task 8) located the integration test at `src/integration/no-write-outside-scope.test.ts`
  and called for a new `src/integration/` directory. The dev-task explicitly
  re-located the test to `src/io/no-write-outside-scope.test.ts` (same `src/io/`
  parent as the unit tests). No `src/integration/` directory was created.
  Same test content, same release-blocker contract; only the parent directory
  changed. Future stories that add cross-module integration tests can decide
  whether to introduce `src/integration/` then.

- **Biome rule rename (`noConsoleLog` → `noConsole`) reaffirmed.** The story
  AC text uses the historical Biome 2.3.0 rule name (`noConsoleLog`). Biome
  2.3.15 (the project's pinned version) renamed the rule to `noConsole` and
  the project's `biome.json` already declares `suspicious.noConsole: "error"`
  (Story 1.1 Task 3 set this; Story 1.2 reaffirmed). No `biome.json` edits
  needed in this story. `src/io/log.ts` uses `process.stdout.write` /
  `process.stderr.write` directly — the rule has zero exceptions and no
  Biome `overrides` block was needed.

- **`src/io/` is foundational (AR41).** Final import audit confirms:
  `src/io/log.ts` has zero imports; `src/io/paths.ts` imports `node:os`,
  `node:path`, and `../errors.ts` (sibling foundational); `src/io/atomic-write.ts`
  imports `node:fs/promises` and `./paths.ts`. No upward imports from any
  mid- or higher-tier module. The boundary will be enforced by a Biome
  import-restriction rule in a later story (Epic 6); manual review for now.

- **Atomic-write algorithm.** Implemented exactly per architecture §D10:
  scope-check → optional rotate to `.bak` (ENOENT silently swallowed for
  first-write) → `Bun.write(tmpPath, contents)` → `fs.rename(tmpPath, targetPath)`.
  Best-effort `.tmp` cleanup on `Bun.write` or rename failure. `.bak` is
  intentionally NOT deleted — that is the one-cycle retention safety buffer
  (NFR-R1, architecture line 403). Verified via the third-write test:
  `foo.yaml.bak` ends with the v2 contents, NOT v1.

- **Tests use unique tmpdirs (AR35).** `src/io/atomic-write.test.ts` uses
  `fs.mkdtemp` per `beforeEach` and `fs.rm({ recursive, force })` per
  `afterEach`. The integration test additionally uses `process.chdir` to a
  unique tmpdir as a faux project root so the `_bmad-output/...` allowed-root
  cases never touch the real `_bmad-output/`. Cwd is restored in `afterEach`.

- **Bun-test conventions.** All test files use the `bun:test` import
  namespace (`describe, expect, it, afterEach, beforeEach, spyOn`). The
  `spyOn` API returns a spy with `.mockImplementation(...)` and
  `.mockRestore()` — used in `log.test.ts` to silence and observe stream
  writes per assertion. Each spy is restored in a `try/finally` to avoid
  cross-test pollution (`afterEach` restoration omitted because the spies
  are scoped within each `it(...)` body via local `try/finally`).

- **No `tsc` step needed.** `bunx tsc --noEmit` exits 0 (defensive check)
  but is not part of `bun run check`. Bun runs the `.ts` source directly.

- **Out-of-scope mutations: NONE.** `package.json`, `tsconfig.json`,
  `biome.json`, `bunfig.toml`, `bun.lock`, `.github/workflows/ci.yml`,
  `.claude-plugin/plugin.json`, `commands/bmad-next.md`, `src/errors.ts`,
  `src/errors.test.ts`, the 1.1 / 1.2 story files, and `.bmad-stepper/state.yaml`
  are byte-identical to their pre-Story-1.3 state.

### File List

Created (8 files):

- `src/io/log.ts` — info/warn/error → stderr; json → stdout (FR54, AR33).
- `src/io/log.test.ts` — `spyOn` assertions for every routing invariant (6 tests).
- `src/io/paths.ts` — `assertWithinScope`, `STEPPER_INTERNAL_ROOT`, `BMAD_OUTPUT_ROOT` (AR42, NFR-S2).
- `src/io/paths.test.ts` — allow + violation cases for every allowed root + every documented forbidden path (10 tests).
- `src/io/atomic-write.ts` — `atomicWrite(targetPath, contents)` with tmp+rename + `.bak` rotation (NFR-R1, NFR-S5, AR42).
- `src/io/atomic-write.test.ts` — first/second/third-write rotation, scope-check, binary contents, atomicity smoke test (10 tests).
- `src/io/no-write-outside-scope.test.ts` — cross-module integration test (NFR-S2 release-blocker per AR36, 8 tests).
- `.bmad-stepper/runs/2026-04-30T093546Z-bmad-next/tasks/t1-dev-story.yaml` — dev-task record.

Modified (2 files):

- `_bmad-output/implementation-artifacts/1-3-logger-path-helpers-atomic-write.md` — status `ready-for-dev` → `review`; all task checkboxes ticked; Dev Agent Record populated; Change Log appended; two deviation notes (Task 4.1 registry-edit avoided, Task 8.2 integration-test parent dir).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `1-3-logger-path-helpers-atomic-write` flipped from `ready-for-dev` to `review`; `last_updated` bumped.

Not modified (preserved verbatim from Stories 1.1 + 1.2):

- `src/errors.ts`, `src/errors.test.ts` (out of mutation scope per dev-task).
- `package.json`, `tsconfig.json`, `biome.json`, `bunfig.toml`, `bun.lock`.
- `.github/workflows/ci.yml`, `.claude-plugin/plugin.json`, `commands/*.md`.

## Change Log

| Date       | Version | Description                                                                                       | Author          |
|------------|---------|---------------------------------------------------------------------------------------------------|-----------------|
| 2026-04-30 | 0.1.0   | Initial story authored (status `ready-for-dev`).                                                  | bmad-create-story |
| 2026-04-30 | 0.2.0   | Implementation: `src/io/{log,paths,atomic-write}.ts` + tests + integration test. Status `review`. | bmad-dev-story    |

## Senior Developer Review (AI)

**Reviewer:** bmad-code-review (claude-opus-4-7[1m])
**Date:** 2026-04-30
**Run:** `.bmad-stepper/runs/2026-04-30T094452Z-bmad-next/` (loop iteration 9)
**Outcome:** **approve-with-actions**

### Summary

Story 1.3 lands the second foundational module of the project (`src/io/`) cleanly. Three modules (`log.ts`, `paths.ts`, `atomic-write.ts`), three colocated unit-test files, and one cross-module integration test together implement FR54 (stdout/stderr discipline), AR41 (foundational-tier import boundary), AR42 (persistence boundary), AR36 (CI-gated noConsole + integration test), NFR-S2 (writes-only-in-scope), NFR-S5 (atomic writes), and NFR-R1 (`.bak`-as-safety-buffer). The implementation is idiomatic, AR-conformant, and `bun run check` exits 0 with 44 passing tests across 5 files (246 expect calls, ~88ms wall time).

The review is **approved with one should-fix action item** (a misleading `actionableHint` on scope violations, see S1 below) and **six info-level observations** that should be tracked in follow-up stories rather than fixed in 1.3 (the should-fix is also explicitly anticipated by the story's own Task 4.3 alternative path and is a fix to land in a future story without re-opening 1.3).

### AC Verification

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1 (logger + Biome `noConsole`) | **pass** | `info`/`warn`/`error` write to stderr only (`src/io/log.ts:17,21,25`); `json` writes to stdout only (`src/io/log.ts:29`); spyOn assertions verify zero leakage between channels (`src/io/log.test.ts` 6 tests). Biome `noConsole: "error"` declared in `biome.json:8`; `grep -rE "console\.(log\|error\|warn\|info\|debug)" src/` returns zero matches across all 9 source files. The historical AC wording `noConsoleLog` is reconciled with the current Biome 2.3.15 rule name `noConsole` (Story 1.1 + 1.2 + 1.3 dev notes consistent). |
| AC-2 (path scope-checker + integration test) | **pass** | `src/io/paths.ts:61` exports `assertWithinScope(targetPath: string): void`. The three allowed roots (`_bmad-output/.stepper/**`, `_bmad-output/**`, `os.tmpdir()`) match AC-2 verbatim. Resolution via `path.resolve(projectRoot, targetPath)` then `path.relative(parent, child)`-based prefix-match catches `../`-traversal escapes. Throws `PathologicalInputError` with message prefixed `SCOPE_VIOLATION:` (the AC's "or equivalent" clause is satisfied — see deviation D1 below). Integration test `src/io/no-write-outside-scope.test.ts` is green (8 tests, AR36 release-blocker). |
| AC-3 (atomic write + .bak rotation) | **pass** | `src/io/atomic-write.ts:32` exports `atomicWrite(targetPath, contents)`. Algorithm verbatim per architecture §D10 lines 399–403: `assertWithinScope` → optional `fs.rename(target, bak)` (ENOENT swallowed for first-write) → `Bun.write(tmpPath, contents)` → `fs.rename(tmpPath, target)`. Tests verify first-write (no `.bak`), second-write (`.bak` holds v1), third-write (`.bak` holds v2 not v1 — one-cycle retention), no leftover `.tmp`, scope rejection, and binary round-trip. |

### Architectural Conformance

| Concern | Verdict | Evidence |
|---------|---------|----------|
| AR41 module boundary (foundational tier, no upward imports) | **pass** | `log.ts` has zero imports. `paths.ts` imports `node:os`, `node:path`, `../errors.ts` (sibling foundational, allowed). `atomic-write.ts` imports `node:fs/promises`, `./paths.ts` (sibling within `src/io/`). No upward imports from any mid- or higher-tier module. Manual import audit clean. |
| AR42 persistence boundary | **pass** | `assertWithinScope` encodes the AR42 allowed write roots verbatim (`_bmad-output/.stepper/**`, `_bmad-output/**`); reads are intentionally NOT validated (architecture §1306–1314 explicitly excludes reads). The `os.tmpdir()` allowance is the test-flow extension required by AC-2. See I2 for the open question of whether tmpdir should be gated on `NODE_ENV === "test"` in a future hardening story. |
| AR43 cross-platform | **pass with note** | macOS + Linux both supported by `node:fs/promises` `rename` and `node:path.resolve` / `node:path.relative`. Windows is explicitly out of scope per architecture line 68 ("Windows via WSL only in v0.1"). One macOS-specific quirk worth knowing: on macOS, `/tmp` is a symlink to `/private/var/folders/...` but `os.tmpdir()` returns the canonical path. A caller passing the literal string `/tmp/foo` would FAIL the scope check. Tests use `os.tmpdir()` directly so they avoid the symlink form. See I1. |
| AR36 CI quality gates | **pass** | `bun run check` (which runs `biome ci . && bun test --pass-with-no-tests`) exits 0. `bunx tsc --noEmit` also exits 0 (defensive). Biome 2.3.15 `noConsole: "error"` clean across all 9 source files. The integration test `src/io/no-write-outside-scope.test.ts` is the second of the three AR36 release-blocker integration gates (errors-registry from Story 1.2 was the first; no-network-on-main from Epic 6 is the third). |
| AR21/AR22 errors-as-primary-UX | **pass with action** | `assertWithinScope` throws a registered `StepperError` subclass (`PathologicalInputError`, code `PATHOLOGICAL_INPUT`, exitCode 5). The thrown error's `actionableHint` (registered in `src/errors.ts:150`) is the generic "Check the input shape against the schema in _bmad-output/.stepper/runs/<latest>/log.md." — which does NOT mention path scope. The implementation prefixes the error `message` with `SCOPE_VIOLATION:` and passes a scope-specific second argument (the `detail` field), but main-thread output (FR46) typically prints `actionableHint`, not `detail`. See S1 — a follow-up story should add a dedicated `ScopeViolationError` to the registry with a hint specific to path scope. |
| AR33 function & error semantics | **pass** | `atomicWrite` is `async`/`Promise<void>` (P4: "always async/await"). `Bun.write` is the canonical write API (Bun-native preferred). No `any` types anywhere (`grep -rE ": any\|as any\|<any>" src/` zero matches). Errors are thrown (`StepperError` subclasses), never returned as `Result<T,E>`. |
| TypeScript hygiene (strict, verbatimModuleSyntax, noUncheckedIndexedAccess, noImplicitOverride) | **pass** | All sibling imports use the `.ts` extension. No `let` without explicit type. No bare array indexing without unwrapping. `bunx tsc --noEmit` exits 0. |

### Edge Case Coverage

| Edge | Covered? | Notes |
|------|----------|-------|
| First-write to non-existing path | ✅ | `atomic-write.test.ts:38` — file created, no `.bak`, no leftover `.tmp`. |
| Second-write rotates target → `.bak` | ✅ | `atomic-write.test.ts:58` — `.bak` holds prior contents. |
| Third-write rotates `.bak` (one-cycle retention) | ✅ | `atomic-write.test.ts:77` — `.bak` holds v2 (just-replaced), NOT v1. |
| `.tmp` leftover removal on success | ✅ | Tested across all three write scenarios. |
| `.tmp` cleanup on `Bun.write` or rename failure | ⚠️ partial | Covered by code (`atomic-write.ts:58,66`), not exercised by a test. Filesystem-failure injection is hard in Bun-test; risk acceptable for v0.1. |
| Scope-violation throws `PathologicalInputError` | ✅ | Both unit and integration tests assert the throw. |
| Scope-violation does NOT create any artifact | ✅ | `atomic-write.test.ts:99`, `no-write-outside-scope.test.ts:95`. |
| Binary contents round-trip | ✅ | `atomic-write.test.ts:111` — `Uint8Array([1,2,3,4,250,0,99])` round-trips byte-exact via `Bun.file(path).bytes()`. |
| Atomicity smoke (read-after-write) | ✅ | `atomic-write.test.ts:125`. |
| `..`-traversal escapes via `path.resolve` collapse | ✅ | `paths.test.ts:54`, `no-write-outside-scope.test.ts:87`. |
| Tilde-literal (`~`) not expanded | ✅ | `paths.test.ts:60`, `no-write-outside-scope.test.ts:81`. |
| Concurrent `atomicWrite` to same path | ❌ | Not tested; not specified. NFR-S5 implies external locking (Story 1.4 `state.yaml.lock`). See I3. |
| Interrupted writes (process killed mid-rename) | ❌ | Not testable in-process. The `.bak` retention is the recovery mechanism (NFR-R1); Story 1.6 state load will exercise the fallback. |

### Security Review

The `assertWithinScope` helper is the AR42 / NFR-S2 enforcement point. Adversarial review of the path-resolution logic:

- `path.resolve(projectRoot, targetPath)` correctly collapses `..` segments before the prefix-match. Verified: `_bmad-output/../etc/passwd` → `/etc/passwd` → throws.
- `path.relative(parent, child)` returning `""` (same dir), `".."` prefix, or an absolute path are all the documented escape signals — handled in `isInside` (`paths.ts:34`).
- Tilde (`~`) is NOT expanded by `path.resolve` (Node behaviour); the literal directory name `~` becomes a child of cwd, which is outside `_bmad-output/` and outside `os.tmpdir()` → throws. Verified.
- Empty string `""` resolves to `process.cwd()`, which is the project root (parent of `_bmad-output/`); the `path.relative` from `_bmad-output` to cwd is `..` → throws (correct).
- Symlink-resolution NOT performed. If `_bmad-output/symlink-to-evil` is a symlink to `/etc`, `path.resolve` does NOT canonicalize, so the prefix-match would PASS. This is a known limitation of pure path-string checks; full canonicalization (via `fs.realpath`) would add IO and complicate the contract. By design.

No security issues found that are blockers for v0.1.

### Findings

#### Should-Fix (1)

- **S1 — `SCOPE_VIOLATION` carries a misleading `actionableHint`.** `PathologicalInputError`'s registered hint is "Check the input shape against the schema in _bmad-output/.stepper/runs/<latest>/log.md." Users hitting a scope violation see this generic input-schema hint, not guidance about allowed write roots. The message text contains `SCOPE_VIOLATION:` (greppable) and the `detail` field carries the scope-specific message ("allowed roots: ..."), but main-thread output (FR46) typically prints `actionableHint`, not `detail`. **Action:** a follow-up story (recommended Story 1.5 or before any release) should add a dedicated `ScopeViolationError` to the registry with a hint like "Check that the target path is inside _bmad-output/, _bmad-output/.stepper/, or the test tmpdir; see src/io/paths.ts assertWithinScope() for the allowed roots." This was explicitly anticipated by Task 4.3 of this story. **Not a blocker for Story 1.3 completion** — AC-2 wording "(or equivalent)" is satisfied.

#### Info (6)

- **I1 — macOS tmpdir symlink edge case.** On macOS, `/tmp` is a symlink to `/private/var/folders/...`-style canonical tmpdir; `os.tmpdir()` returns the canonical path. Callers passing the literal `/tmp/foo` would fail the scope check despite logically meaning the tmpdir. Tests use `os.tmpdir()` directly; downstream consumers (Stories 1.4, 2.5) should always synthesise tmp paths via `path.join(os.tmpdir(), ...)`. Worth a JSDoc note on `assertWithinScope`.
- **I2 — tmpdir allowance is unconditional.** AR42 architecture only allows writes to `_bmad-output/.stepper/**` and `_bmad-output/**`. AC-2 of this story permits `os.tmpdir()` as a third root for testing flow. The implementation honours AC-2 verbatim, but the tmpdir backdoor is permanent across all environments, not gated on `NODE_ENV === "test"`. Once non-test consumers ship in Stories 1.4+, the tmpdir scope is logically open. By spec; track for an Epic 6 hardening pass.
- **I3 — `atomicWrite` is not concurrency-safe by itself.** Two concurrent calls to the same target path can race (both rename target→bak, both write tmp, both rename tmp→target — last writer wins, prior `.bak` rotation may be lost). NFR-S5 implies external locking (Story 1.4 `state.yaml.lock`) wraps every write. The `atomicWrite` contract here is "atomic AT THE FILESYSTEM LEVEL via `fs.rename`", not "concurrent-safe by itself". The JSDoc could note this clearly: callers MUST hold the appropriate file lock. By spec; tighten the docstring.
- **I4 — Rename-failure recovery leaves only `.bak`.** If `Bun.write(tmpPath, ...)` succeeds and `fs.rename(tmpPath, target)` fails, the catch handler unlinks `tmpPath` but does NOT restore `bakPath` back to `targetPath`. The previous-good copy is recoverable via `.bak` (per architecture §D10 line 403), and Story 1.6's state load is responsible for that fallback. By design.
- **I5 — Empty `afterEach` in `log.test.ts` is dead code.** Lines 13–15 declare `afterEach(() => { /* nothing to clean */ })` but spies are scoped per `it(...)` via local `try/finally`. Pure cosmetic; remove or leave.
- **I6 — Integration test placement deviates from architecture file layout.** Architecture §Repository Structure line 1245 places the test at `src/integration/no-write-outside-scope.test.ts`. Per dev-task instruction, this story landed it at `src/io/no-write-outside-scope.test.ts`. The release-blocker contract is satisfied. Should be relocated to `src/integration/` when a future cross-module integration test (Stories 1.7+) creates that directory.

### Documented Deviation Verdicts

- **D1 — No `SCOPE_VIOLATION` registry entry; routes through `PathologicalInputError` with `SCOPE_VIOLATION:` message prefix.** **Verdict: acceptable.** Story Task 4.3 expressly anticipated this alternative path. The dev-task explicitly excluded `src/errors.ts` from mutation scope, forcing the alternative. AC-2 wording ("(or equivalent)") is satisfied. The implementation reuses the EXISTING registered code rather than declaring a local class — keeping the registry count at 15 and avoiding any `errors.ts` edit. **Follow-up:** a future story (recommended Story 1.5 or before public release) should add a dedicated `ScopeViolationError` to the registry with a scope-specific actionableHint (see S1). The current shape is forward-compatible with that addition (callers already see `SCOPE_VIOLATION:` in the message text).

- **D2 — Integration test at `src/io/no-write-outside-scope.test.ts` instead of `src/integration/`.** **Verdict: acceptable.** Per dev-task instruction. Test content and the AR36 release-blocker contract are unchanged. The `src/integration/` directory does not yet exist; Story 1.3 was directed to land the test alongside the unit tests in `src/io/` and not introduce `src/integration/` solo. **Follow-up:** when a second cross-module integration test lands (Stories 1.7+), move the file to `src/integration/no-write-outside-scope.test.ts` and update any internal references.

### Verification Commands (re-run for review)

```
$ bun run check
$ biome ci . && bun test --pass-with-no-tests
Checked 14 files in 29ms. No fixes applied.
bun test v1.3.12 (700fc117)
 44 pass / 0 fail / 246 expect() calls / 5 files
exit: 0

$ bunx tsc --noEmit
exit: 0

$ grep -rE "console\.(log|error|warn|info|debug)" src/
(no matches — Biome noConsole satisfied)

$ grep -rE ": any|as any|<any>" src/
(no matches — no `any` types)

# Import audit (manual):
log.ts:                zero imports
paths.ts:              node:os, node:path, ../errors.ts
atomic-write.ts:       node:fs/promises, ./paths.ts
# All within AR41 foundational allowlist.
```

### Conclusion

Story 1.3 is **approved with actions**. Status flips to `done`. The single should-fix (S1) is a follow-up registry edit for a future story; it is explicitly anticipated by Task 4.3 of this story and is NOT a blocker for completion. The six info-level observations are tracking notes for Story 1.4+ refinement and Epic 6 hardening.

| Date       | Version | Description                                                                                       | Author          |
|------------|---------|---------------------------------------------------------------------------------------------------|-----------------|
| 2026-04-30 | 0.3.0   | Senior Developer Review (AI) appended (outcome `approve-with-actions`); status `review` → `done`. | bmad-code-review |
