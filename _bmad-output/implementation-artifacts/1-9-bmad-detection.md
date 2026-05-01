---
status: done
story_id: '1.9'
story_key: 1-9-bmad-detection
epic: '1'
title: BMAD Detection
created: '2026-05-01'
last_updated: '2026-05-01'
priority: blocking
estimated_effort: M
fr_coverage:
  - FR41
  - FR50
  - FR51
nfr_coverage:
  - NFR-S1
  - NFR-R1
ar_coverage:
  - AR33
  - AR41
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/implementation-artifacts/1-1-initialize-repository-scaffold.md
  - _bmad-output/implementation-artifacts/1-2-errors-module-registry-ci-gate.md
  - _bmad-output/implementation-artifacts/1-3-logger-path-helpers-atomic-write.md
  - _bmad-output/implementation-artifacts/1-4-file-lock-with-heartbeat.md
  - _bmad-output/implementation-artifacts/1-5-schemas-migrations-skeleton.md
  - _bmad-output/implementation-artifacts/1-6-state-subsystem-load-save-recompute-skeleton.md
  - _bmad-output/implementation-artifacts/1-7-cli-argument-parser.md
  - _bmad-output/implementation-artifacts/1-8-snapshot-branch-sha-detection.md
  - _bmad/config.yaml
  - src/errors.ts
  - src/io/log.ts
  - src/snapshot/detect.ts
  - package.json
---

# Story 1.9: BMAD Detection

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper user,
I want Stepper to detect the installed BMAD version and the project's `_bmad/` directory at the top of every command,
So that the plugin fails loudly when BMAD is not installed instead of producing confusing downstream errors.

## Context Summary

This story lands the **first source-side `src/bmad-detect/` module** of the project — the **BMAD upstream detector** that operationalises **architecture §FR Coverage Map FR50** (line 1380) and **AR41 mid-tier module boundary** (line 1296) by reading the BMAD plugin manifest at `~/.claude/plugins/bmad-method-*/.claude-plugin/plugin.json` and enumerating skills under that plugin tree. Until now, the foundational stack (`src/errors.ts`, `src/io/{log,paths,atomic-write}.ts`, `src/lock/lock.ts`, `src/schemas/`, `src/migrations/`, `src/state/`, `src/snapshot/`) has been wired but no source-side surface exists for **runtime BMAD-installation introspection**. Story 1.9 fills that gap by authoring two small, deterministic detectors that capture the upstream `bmadVersion` (string from the plugin manifest) and `skillNames[]` (strings enumerated from the plugin tree), and routing the absence of either to the existing `BmadNotInstalledError` (registry code `BMAD_NOT_INSTALLED`, exit code 3) with the AC-mandated hint string `Run npx bmad-method install --tools claude-code first.`

Concretely, this story produces:

1. **`src/bmad-detect/detect-version.ts`** — the canonical BMAD-version detector. Public function `detectBmadVersion(opts?): Promise<string>` resolves the installed BMAD plugin directory by globbing `~/.claude/plugins/bmad-method-*` (via `node:fs/promises` `readdir` + filter), reads `<plugin-dir>/.claude-plugin/plugin.json` via `Bun.file(...).json()`, and returns the `version` field as a string. If no matching plugin directory exists **and** no `_bmad/` directory exists in the project root, the function throws `BmadNotInstalledError` (exit code 3) with the verbatim hint `Run npx bmad-method install --tools claude-code first.` per AC-2. Asymmetric path: if `_bmad/` exists in the project but the plugin directory does not, the function still throws (the user installed the project-side artefacts but never ran `npx bmad-method install --tools claude-code` to install the upstream plugin).
2. **`src/bmad-detect/detect-skills.ts`** — the canonical skill-name enumerator. Public function `detectBmadSkills(opts?): Promise<string[]>` resolves the same plugin directory, walks `<plugin-dir>/skills/*` (one directory per skill — Claude Code plugin convention per architecture line 116), and returns the directory names as a sorted `string[]`. If no plugin directory exists, the function throws the same `BmadNotInstalledError` (the absence is symmetric — both detectors must succeed or both must fail).
3. **`src/bmad-detect/index.ts`** — barrel re-exporting the public surface (`detectBmadVersion`, `detectBmadSkills`, `BmadDetection` interface, optionally `DetectBmadOptions` for the test-only-but-exported escape hatch following Story 1.8's `DetectSnapshotOptions` pattern).
4. **`src/bmad-detect/detect-version.test.ts`** — colocated integration tests using **`Bun.write(...)`** + `node:fs/promises` `mkdir` to set up a fake `~/.claude-test/plugins/bmad-method-6.5.0.1/.claude-plugin/plugin.json` in a tmpdir and assert detection. Plus a **missing-plugin-dir** tmpdir test asserting `BmadNotInstalledError` throw. Plus a **corrupt plugin.json** test asserting JSON-parse error propagation.
5. **`src/bmad-detect/detect-skills.test.ts`** — analogous integration tests for the skill enumerator. Tests create fake `<plugin-dir>/skills/<name>/` directories and assert the detector returns the directory names sorted.

This story is a **deliberately disciplined skeleton** — it lands the detectors as pure async functions that can be integration-tested in isolation. It does **NOT**:

- Wire the detectors into the runners (`next/run.ts`, `loop/run.ts`, `doctor/run.ts`). AC-3's "detection is invoked at the top of every command runner" is the **runner's** responsibility; the runners live in Stories 2.4 (`next/run.ts`), 4.1 (`loop/run.ts`), and 1.12 (`doctor/run.ts`). Story 1.9 provides the **detection** half of the contract; the runners call the detectors at the top of their entry points and let `BmadNotInstalledError` propagate to the global error handler.
- Modify `src/errors.ts`. The `BmadNotInstalledError` class already exists in the registry (16 codes total) — see `src/errors.ts` lines 99–104, with the verbatim AC-2 hint already declared. **Story 1.9 USES this class but does NOT extend the registry.**
- Author the **DAG seed/three-tier registry** that consumes `detectBmadSkills()` output as a Tier 3 fallback input (architecture line 1332 — FR2 → `src/dag/build.ts` depends on `src/bmad-detect/detect-skills.ts`). That's Story 1.10's deliverable.
- Author the **doctor command** that consumes `detectBmadVersion()` output as the BMAD-compatibility line of the diagnostic (architecture line 1371 — FR41 → `src/commands/doctor/run.ts` depends on `src/bmad-detect/detect-version.ts`). That's Story 1.12's deliverable.
- Add the BMAD-version compatibility comparison logic that throws `BmadIncompatibleError`. Story 1.9 returns the version string verbatim; the comparison against the Stepper-side compatibility matrix (PRD line 441, CHANGELOG *BMAD Compatibility* section) lives in Story 1.12 (doctor) and Story 6.x (upgrade flow).

It DOES land:

- The exact AR41-conformant placement of `src/bmad-detect/` as a **mid-tier** module. Per architecture line 1296 the boundary graph places `bmad-detect/` alongside `state/`, `migrations/`, `snapshot/` (Story 1.8 sibling), `personas/` (future), `dag/` (future), `transcript/`, `telemetry/`, `upgrade/` (all mid-tier; depend on foundational + each other only via downstream orchestrators). Story 1.9 lands **only** the foundational allowed imports (`errors.ts`, `io/log.ts`, `node:os`, `node:fs/promises`, `node:path`, Bun stdlib `Bun.file`); the dependency graph stays clean — `bmad-detect/*.ts` does NOT import from `state/`, `schemas/`, `lock/`, `snapshot/`, or any sibling mid-tier module. Those imports happen in the orchestrator (Story 2.4 / 1.12 / 1.10) that wires detection into commands.
- The composition pattern for **plugin-tree introspection**: `node:fs/promises` `readdir` + filter for the wildcard plugin-dir resolution (`bmad-method-*`), `Bun.file(<path>).json()` for typed JSON parsing of `plugin.json`, `node:path.join` for cross-platform path composition. This pattern recurs in Story 1.10 (DAG seed — same `readdir`-based skill enumeration), Story 1.12 (doctor — same `Bun.file().json()` for compatibility-matrix lookup), and Story 6.x (upgrade — same `readdir` for marketplace-installed plugin discovery).
- The `BmadDetection` value type as the contract that downstream consumers (Story 1.10 DAG builder, Story 1.12 doctor, Story 2.4 runner) consume: `{ bmadVersion: string; skillNames: string[] }`. AC-1's verbatim "detection returns `{ bmadVersion, skillNames[] }` parsed from BMAD's plugin manifest" pins this shape exactly.
- The deterministic `BmadNotInstalledError` throw on missing plugin directory + missing `_bmad/` per AC-2 — which establishes the **fail-loud-on-missing-upstream** pattern for environment-introspection primitives. Story 1.9 reuses the Story 1.8 idiom of "non-presence = throw, not silently empty" for production-required upstream installations (contrast with Story 1.8's `null`-on-non-Git, which is a soft fallback because non-Git is supported; non-BMAD is NOT supported).

This is **AR33** (function & error semantics — `detectBmadVersion`/`detectBmadSkills` are `async`; throw `StepperError` subclasses verbatim; no `console.*`), **AR41** (module boundary — `src/bmad-detect/` is mid-tier; allowed imports from foundational `errors.ts`, `io/log.ts`; forbidden imports from `state/`, `schemas/`, `lock/`, `snapshot/`, sibling mid-tier modules). It also operationalises **FR41** (`--doctor` consumes `detectBmadVersion` per architecture line 1371), **FR50** (Detect BMAD version on first run — architecture line 1380), **FR51** (Fail-loud unknown skill — architecture line 1381; `detectBmadSkills` is the upstream half of the registry that the Tier-3 fallback in Story 1.10 consumes), **NFR-S1** (no network IO on main thread — plugin manifest is local filesystem only, no `fetch` / no `Bun.fetch`), **NFR-R1** (zero data loss on halt — failing loud on missing upstream prevents silent state corruption from running against a phantom BMAD installation).

## Acceptance Criteria

The acceptance criteria below are reproduced **verbatim** from `_bmad-output/planning-artifacts/epics.md` §Story 1.9 (lines 490–498, BDD Given/When/Then/And format). Lines and AC labelling preserved.

### AC-1 (Given/When/Then — BMAD version + skill enumeration via plugin manifest)

**Given** `src/bmad-detect/detect-version.ts` and `detect-skills.ts`
**When** Stepper starts in a project that has `_bmad/` AND a BMAD plugin under `~/.claude/plugins/bmad-method-*`
**Then** detection returns `{ bmadVersion, skillNames[] }` parsed from BMAD's plugin manifest

### AC-2 (Given/When/Then — Missing-installation fail-loud halt)

**Given** neither `_bmad/` nor a BMAD plugin exists
**When** any Stepper command runs
**Then** it exits with `BMAD_NOT_INSTALLED` (exit code 3) and the hint `Run npx bmad-method install --tools claude-code first.`
**And** detection is invoked at the top of every command runner (`next/run.ts`, `loop/run.ts`, `doctor/run.ts`)

## Tasks / Subtasks

- [ ] **Task 0 — Verify pre-conditions (AC: 1, 2)**
  - [ ] 0.1 Confirm `src/errors.ts` registry stays at 16 codes after Story 1.8 (Story 1.8 left `BmadNotInstalledError` untouched; the class exists from Story 1.2 with verbatim AC-2 hint at `src/errors.ts` line 102–103). Verify `bun test src/errors.test.ts` exits 0. **Story 1.9 does NOT modify `src/errors.ts`** — registry stays at 16; the runner stories (2.4 / 4.1 / 1.12) own the throw-site wiring.
  - [ ] 0.2 Confirm `src/io/log.ts` exports `info`, `warn`, `error`, `json` per Story 1.3. Story 1.9 imports **only** `info` and `warn` (for diagnostic emission paths if any; the throw-site does NOT emit a log message — `BmadNotInstalledError` carries its own `actionableHint`).
  - [ ] 0.3 Confirm Story 1.8 `src/snapshot/detect.ts` is byte-identical (Bun.spawn pattern reference for Story 1.9's plugin-tree introspection — though Story 1.9 uses `Bun.file().json()` + `node:fs/promises.readdir` rather than `Bun.spawn`).
  - [ ] 0.4 Confirm `package.json` has zero new deps relative to Story 1.8 final state. **DO NOT add a new dep** — `Bun.file`, `node:os`, `node:fs/promises`, `node:path` are all built-in.
  - [ ] 0.5 Confirm baseline `bun run check` exits 0 (216–218 pass / 0 fail / ~605–615 expects across 23 files per Story 1.8 final). Record the baseline test count in Completion Notes.
  - [ ] 0.6 Confirm Bun host version satisfies AR2 (Bun ≥ 1.3). Run `bun --version`; record in Completion Notes (1.3.12 expected per Story 1.8 baseline).
  - [ ] 0.7 Read architecture line 116 (Claude Code plugin shape — `.claude-plugin/plugin.json` plus optional `commands/`, `skills/`, `agents/`, `.mcp.json`). Confirm AC-1's "BMAD's plugin manifest" reads as `<plugin-dir>/.claude-plugin/plugin.json` per the canonical Claude Code plugin shape. Read architecture line 1224–1228 (the `bmad-detect/` directory structure: `index.ts`, `detect-version.ts`, `detect-skills.ts`, `*.test.ts`). Read architecture line 1296 (AR41 mid-tier boundary).
  - [ ] 0.8 Confirm `src/errors.ts` `BmadNotInstalledError` class has `code: "BMAD_NOT_INSTALLED"`, `exitCode: 3`, `actionableHint: "Run npx bmad-method install --tools claude-code first."` matching AC-2 character-for-character. **Story 1.9 throws this existing class; does NOT add a new one.**

- [ ] **Task 1 — Create `src/bmad-detect/` directory + `src/bmad-detect/index.ts` barrel (AC: 1)**
  - [ ] 1.1 Create directory `src/bmad-detect/`. Per AR41, this is **mid-tier** — same tier as `src/state/`, `src/migrations/`, `src/snapshot/` (Story 1.8 sibling), `src/dag/` (future), `src/personas/` (future). Allowed imports for any file under `src/bmad-detect/`: foundational (`../errors.ts`, `../io/log.ts`), Bun stdlib (`Bun.file`), Node stdlib (`node:os`, `node:fs/promises`, `node:path`). **Forbidden imports:** `../state/`, `../schemas/`, `../lock/`, `../migrations/`, `../snapshot/`, sibling mid-tier modules. JSDoc on every file MUST cite AR41 + the architecture line for the boundary graph (lines 1278–1304).
  - [ ] 1.2 Create `src/bmad-detect/index.ts` — public barrel:
    ```typescript
    /**
     * src/bmad-detect/index.ts — public barrel for the `bmad-detect/` mid-tier
     * module.
     *
     * Story 1.9 exports the BMAD version + skill detectors. The runner-side
     * wiring (call detection at the top of every command) lives in:
     *   - Story 1.12 — `src/commands/doctor/run.ts` (doctor diagnostic).
     *   - Story 2.4  — `src/commands/next/run.ts` (every /bmad-next call).
     *   - Story 4.1  — `src/commands/loop/run.ts` (every /bmad-loop call).
     *
     * Per AR41 mid-tier boundary, this barrel re-exports ONLY the public
     * surface; internal helpers stay private to the module.
     */
    export {
      type BmadDetection,
      type DetectBmadOptions,
      detectBmadVersion,
    } from "./detect-version.ts";
    export { detectBmadSkills } from "./detect-skills.ts";
    ```
    No test file is needed (pure re-export).

- [ ] **Task 2 — Implement `src/bmad-detect/detect-version.ts` — `Bun.file(plugin.json).json()` reader (AC: 1, 2)**
  - [ ] 2.1 Create `src/bmad-detect/detect-version.ts`. Module purpose: capture the installed BMAD plugin's version string from `~/.claude/plugins/bmad-method-*/.claude-plugin/plugin.json`, or throw `BmadNotInstalledError` on missing plugin + missing `_bmad/`. The file MUST export:
    - `interface BmadDetection { readonly bmadVersion: string; readonly skillNames: readonly string[] }` — matches AC-1's verbatim `{ bmadVersion, skillNames[] }`. (The skillNames field is populated by `detectBmadSkills`; this module returns only the version, but the shared type is co-located here to avoid forward-import cycles.)
    - `interface DetectBmadOptions { readonly homeDir?: string; readonly projectRoot?: string }` — test-only-but-exported escape hatch (Story 1.4 LockOptions / Story 1.8 DetectSnapshotOptions pattern reapplied). `homeDir` defaults to `os.homedir()`; `projectRoot` defaults to `process.cwd()`. Tests inject a fake `~/.claude-test/` tmpdir for both.
    - `detectBmadVersion(opts?: DetectBmadOptions): Promise<string>` — public function returning the BMAD version string verbatim (e.g., `"6.5.0.1"`).
  - [ ] 2.2 Algorithm step 1 — **Resolve plugin directory.** Compute `pluginsRoot = path.join(homeDir, ".claude", "plugins")`. Use `fs.readdir(pluginsRoot)` to list entries; filter to those starting with `"bmad-method-"`. If `pluginsRoot` does not exist (catch `ENOENT` from `readdir`), set the result to `[]`.
  - [ ] 2.3 Algorithm step 2 — **Project-side `_bmad/` check (only if no plugin dir found).** If the filter result is empty, also check `path.join(projectRoot, "_bmad")` via `fs.stat`. If `_bmad/` does NOT exist (catch `ENOENT`), throw `new BmadNotInstalledError("BMAD is not installed (no plugin under ~/.claude/plugins/bmad-method-* and no _bmad/ directory in project root)")`. If `_bmad/` exists but the plugin dir does not, ALSO throw `BmadNotInstalledError` (per AC-2's symmetric requirement: "neither `_bmad/` nor a BMAD plugin exists" → throw; the asymmetric "_bmad/ but no plugin" case is treated as still-not-installed since the upstream skills/commands are missing).
  - [ ] 2.4 Algorithm step 3 — **Pick the plugin directory.** If multiple `bmad-method-*` directories exist (rare; possible during upgrade window), sort them descending lexicographically and pick the first. (A future story MAY parse the version-suffix and pick the highest semver; v0.1 picks lexicographic-max as a deterministic tie-breaker.) Document this in JSDoc.
  - [ ] 2.5 Algorithm step 4 — **Read `plugin.json`.** Compute `manifestPath = path.join(pluginDir, ".claude-plugin", "plugin.json")`. Use `Bun.file(manifestPath).json()` to parse. If the file does not exist, throw a system `Error` (not `BmadNotInstalledError` — the plugin directory was found but the manifest is corrupt/missing; that's a different failure mode the doctor command will surface). If JSON parse fails, let the `Bun.file().json()` exception propagate verbatim.
  - [ ] 2.6 Algorithm step 5 — **Extract `version` field.** The parsed JSON shape is `{ name: string, version: string, description?: string, ... }` per architecture lines 195 + 1665. Validate `typeof parsed.version === "string"` at runtime; if not, throw `new Error("BMAD plugin manifest missing or non-string 'version' field at " + manifestPath)`. Return `parsed.version`.
  - [ ] 2.7 Add comprehensive JSDoc per Story 1.6 / 1.7 / 1.8 conventions: cite architecture lines 1224–1228 (`bmad-detect/` directory structure), 1296 (AR41 mid-tier boundary), 1380 (FR50 → `src/bmad-detect/detect-version.ts`), 1665 (`.claude-plugin/plugin.json` field set), 1666 (the `BMAD_NOT_INSTALLED` AC-2 wording). Document the **wildcard-match selection** (lex-max), the **missing-plugin-dir** edge case (throws `BmadNotInstalledError`), the **missing-manifest** edge case (throws system `Error`), the **invalid-version** edge case (throws system `Error`).

- [ ] **Task 3 — Implement `src/bmad-detect/detect-skills.ts` — plugin-tree skill enumerator (AC: 1, 2)**
  - [ ] 3.1 Create `src/bmad-detect/detect-skills.ts`. Module purpose: enumerate the directory names under `<plugin-dir>/skills/` and return them as a sorted `string[]`. The file MUST export:
    - `detectBmadSkills(opts?: DetectBmadOptions): Promise<string[]>` — public function returning a sorted alphabetically (case-sensitive) `string[]` of skill directory names.
  - [ ] 3.2 Algorithm step 1 — **Resolve plugin directory** using the same logic as `detect-version.ts` (reuse via internal helper or duplicate; Story 1.9 prefers a small private helper inside `detect-version.ts` re-exported under a non-public symbol, OR inline the resolution since the call sites are two — keep it simple: inline). Throw `BmadNotInstalledError` on missing plugin (symmetric with `detectBmadVersion`).
  - [ ] 3.3 Algorithm step 2 — **List the skills directory.** Compute `skillsDir = path.join(pluginDir, "skills")`. Use `fs.readdir(skillsDir, { withFileTypes: true })` to list entries; filter to `entry.isDirectory()` (skip stray files). If `skillsDir` does not exist (catch `ENOENT`), return an empty array — this is a valid state for a plugin without skills (though BMAD always has skills, the empty case is exercised in tests for completeness; the DAG builder in Story 1.10 will handle empty skill lists explicitly).
  - [ ] 3.4 Algorithm step 3 — **Return sorted names.** `return entries.map(e => e.name).sort()`. The sort is locale-independent default JavaScript sort (lexicographic ASCII order), which matches the architecture's expectation for deterministic enumeration order (architecture line 1227 says "enumerate skills for tier-3 fallback" — deterministic ordering matters for reproducible DAG builds).
  - [ ] 3.5 Add comprehensive JSDoc per Story 1.6 / 1.7 / 1.8 conventions: cite architecture lines 1224–1228, 1296 (AR41), 1332 (FR2 → `state/recompute.ts` consumes `detectBmadSkills`), 1381 (FR51 fail-loud unknown skill — `detectBmadSkills` provides the upstream registry side; the DAG builder in Story 1.10 owns the fail-loud throw on unknown). Document the **empty-skills-dir** edge case (returns `[]` not throw), the **non-directory entries filter** (skips stray files), the **deterministic sort** (lexicographic ASCII).

- [ ] **Task 4 — Author `src/bmad-detect/detect-version.test.ts` — integration tests in tmpdir (AC: 1, 2)**
  - [ ] 4.1 Create `src/bmad-detect/detect-version.test.ts`. **Integration tests** per AC-1 — use `node:fs/promises` `mkdir` + `Bun.write(...)` to set up a fake `~/.claude-test/plugins/bmad-method-6.5.0.1/.claude-plugin/plugin.json` in a tmpdir, inject the tmpdir as `homeDir` via `DetectBmadOptions`, and exercise the detector. Use `os.tmpdir()` per AR35 (every test runs under a unique tmpdir).
  - [ ] 4.2 Test fixture helper `setupFakeBmadPlugin(homeDir: string, version: string, skills: string[]): Promise<{ pluginDir: string; manifestPath: string }>`:
    - Creates `<homeDir>/.claude/plugins/bmad-method-<version>/.claude-plugin/` via `fs.mkdir({ recursive: true })`.
    - Writes `plugin.json` via `Bun.write(<manifestPath>, JSON.stringify({ name: "bmad-method", version, description: "BMAD Method" }))`.
    - Creates `<pluginDir>/skills/<skill>/` for each skill name (empty directories suffice for `detectBmadSkills`).
    - Returns the absolute paths.
  - [ ] 4.3 Test: `it("returns the version string from plugin.json for an installed BMAD plugin")`:
    - Setup: `setupFakeBmadPlugin(tmp, "6.5.0.1", [])`.
    - Act: `const v = await detectBmadVersion({ homeDir: tmp, projectRoot: tmp })`.
    - Assert: `expect(v).toBe("6.5.0.1")`.
  - [ ] 4.4 Test: `it("throws BmadNotInstalledError when neither plugin dir nor _bmad/ exists")`:
    - Setup: empty tmpdir (no plugin, no `_bmad/`).
    - Act + assert: `await expect(detectBmadVersion({ homeDir: tmp, projectRoot: tmp })).rejects.toBeInstanceOf(BmadNotInstalledError)`.
    - Assert: the thrown error's `code === "BMAD_NOT_INSTALLED"`, `exitCode === 3`, `actionableHint === "Run npx bmad-method install --tools claude-code first."`.
  - [ ] 4.5 Test: `it("throws BmadNotInstalledError when _bmad/ exists but no plugin dir")`:
    - Setup: tmpdir with `<tmp>/_bmad/` directory but no `<tmp>/.claude/plugins/bmad-method-*`.
    - Act + assert: `BmadNotInstalledError` is thrown (symmetric AC-2 — the missing upstream is the disqualifier).
  - [ ] 4.6 Test: `it("throws system Error when plugin.json is missing or unreadable")`:
    - Setup: plugin directory exists but no `.claude-plugin/plugin.json` file.
    - Act + assert: a system `Error` (not `BmadNotInstalledError`) is thrown — the plugin dir presence implies the user attempted install but the manifest is corrupt; the doctor command surfaces this differently.
  - [ ] 4.7 Test: `it("throws when plugin.json lacks a 'version' field")`:
    - Setup: `Bun.write(manifestPath, JSON.stringify({ name: "bmad-method" }))` (no version key).
    - Act + assert: a system `Error` with a clear message about the missing/non-string `version` field.
  - [ ] 4.8 Test: `it("picks lexicographically highest plugin dir when multiple bmad-method-* dirs exist")`:
    - Setup: both `bmad-method-6.5.0.0` and `bmad-method-6.5.0.1`, each with a different version in their plugin.json.
    - Act + assert: returns the version from `bmad-method-6.5.0.1` (lex-max).

- [ ] **Task 5 — Author `src/bmad-detect/detect-skills.test.ts` — integration tests in tmpdir (AC: 1, 2)**
  - [ ] 5.1 Create `src/bmad-detect/detect-skills.test.ts`. Reuse the `setupFakeBmadPlugin` fixture (declare locally; do NOT cross-import from sibling test files — Story 1.6's test-isolation pattern).
  - [ ] 5.2 Test: `it("returns sorted skill names from plugin/skills/ directories")`:
    - Setup: `setupFakeBmadPlugin(tmp, "6.5.0.1", ["bmad-create-prd", "bmad-create-story", "bmad-dev-story"])`.
    - Act: `const skills = await detectBmadSkills({ homeDir: tmp, projectRoot: tmp })`.
    - Assert: `expect(skills).toEqual(["bmad-create-prd", "bmad-create-story", "bmad-dev-story"])` (sorted lexicographically).
  - [ ] 5.3 Test: `it("returns empty array when plugin has no skills directory")`:
    - Setup: plugin dir + manifest exist; no `<pluginDir>/skills/` subdirectory.
    - Act + assert: `expect(skills).toEqual([])`.
  - [ ] 5.4 Test: `it("filters out non-directory entries in skills/")`:
    - Setup: skills dir contains both directories `["foo/", "bar/"]` and a stray file `README.md`.
    - Act + assert: `expect(skills).toEqual(["bar", "foo"])` (file filtered out, directories sorted).
  - [ ] 5.5 Test: `it("throws BmadNotInstalledError when plugin dir is missing")`:
    - Setup: empty tmpdir.
    - Act + assert: `BmadNotInstalledError` is thrown (symmetric with `detectBmadVersion`).

- [ ] **Task 6 — Quality gates verification + story-status update (AC: 1, 2)**
  - [ ] 6.1 Run `bun test src/bmad-detect/`. ALL tests in `detect-version.test.ts` and `detect-skills.test.ts` MUST pass. Record actual test count in Completion Notes.
  - [ ] 6.2 Run `bun run check` (composite release-blocker; AR36). Exit code 0 required. Record actual pass/fail/expects/files counts.
  - [ ] 6.3 Run `bunx biome ci .`. Exit code 0 required.
  - [ ] 6.4 Run `bunx tsc --noEmit`. Exit code 0 required. Verify discriminated narrowing on the throw paths.
  - [ ] 6.5 Run `bun test`. ALL existing tests still pass (218+ baseline + ~10–13 new = ~228–231 total).
  - [ ] 6.6 Verify imports stay AR41-conformant (no `../state/`, `../schemas/`, `../lock/`, `../migrations/`, `../snapshot/`, `../commands/` imports anywhere under `src/bmad-detect/`). Use `bunx biome ci .` to enforce the import-order rule; manually grep for forbidden imports as a defence-in-depth.
  - [ ] 6.7 Update Story 1.9 frontmatter `status: ready-for-dev` → `status: review` in `_bmad-output/implementation-artifacts/1-9-bmad-detection.md`. Update inline `Status: ready-for-dev` line to `Status: review`. Then update `_bmad-output/implementation-artifacts/sprint-status.yaml` `1-9-bmad-detection: ready-for-dev` → `1-9-bmad-detection: review` and bump `last_updated`.

## Dev Notes

### Architecture Compliance

This story consults architecture decisions:

- **Architecture line 116 (Claude Code plugin shape):** `.claude-plugin/plugin.json` plus optional `commands/`, `skills/`, `agents/`, `.mcp.json`. The BMAD plugin is a Claude Code plugin and conforms to this shape. Story 1.9 reads `<bmad-plugin-dir>/.claude-plugin/plugin.json` and enumerates `<bmad-plugin-dir>/skills/` per this shape.
- **Architecture line 1224–1228 (Source Tree §`bmad-detect/`):** the directory structure is `bmad-detect/` containing `index.ts`, `detect-version.ts`, `detect-skills.ts`, `*.test.ts`. Story 1.9 lands all three production files plus two test files.
- **Architecture line 1296 (AR41 mid-tier module boundary):** `bmad-detect/` is mid-tier alongside `state/`, `migrations/`, `snapshot/` (Story 1.8), `personas/`, `dag/`, `transcript/`, `telemetry/`, `upgrade/`. Allowed imports: foundational (`../errors.ts`, `../io/log.ts`), Bun stdlib (`Bun.file`), Node stdlib (`node:os`, `node:fs/promises`, `node:path`). Forbidden: `../state/`, `../schemas/`, `../lock/`, `../migrations/`, `../snapshot/`, sibling mid-tier modules.
- **Architecture line 1332 (FR2 → recompute):** `src/state/recompute.ts` consumes `src/bmad-detect/detect-skills.ts`. Story 1.9 lands the producer; the consumer was skeleton-built in Story 1.6 and is fully wired in Story 1.10's DAG builder.
- **Architecture line 1371 (FR41 → `--doctor`):** `src/commands/doctor/run.ts` consumes `src/bmad-detect/detect-version.ts`. Story 1.9 lands the producer; Story 1.12 wires the doctor diagnostic.
- **Architecture line 1380 (FR50):** detect BMAD version on first run via `src/bmad-detect/detect-version.ts`. Story 1.9 owns this exact file.
- **Architecture line 1666 (`BMAD_NOT_INSTALLED` resolution):** "Add a `BMAD_NOT_INSTALLED` (exit 3) check at the top of every command runner. Detect by absence of any directory under `~/.claude/plugins/` matching `bmad-method-*` AND absence of a `_bmad/` directory in the project root. Hint: `Run npx bmad-method install --tools claude-code first.`" Story 1.9 implements the **detection** primitive; the runners (Stories 1.12 / 2.4 / 4.1) wire it at the top of every command per AC-3's "detection is invoked at the top of every command runner".
- **Architecture line 1665 (`.claude-plugin/plugin.json` field set):** required fields `name, version, description, author, homepage, repository, license, keywords`; optional `commands` (paths). Story 1.9 reads ONLY the `version` field; the doctor command (Story 1.12) MAY also surface `name`, `description`, `homepage` for diagnostic output.

### `detectBmadVersion` Algorithm (Pseudo-code)

```typescript
export async function detectBmadVersion(opts?: DetectBmadOptions): Promise<string> {
  const homeDir = opts?.homeDir ?? os.homedir();
  const projectRoot = opts?.projectRoot ?? process.cwd();

  // Step 1: List ~/.claude/plugins/ for bmad-method-* directories.
  const pluginsRoot = path.join(homeDir, ".claude", "plugins");
  let candidates: string[];
  try {
    const entries = await fs.readdir(pluginsRoot);
    candidates = entries.filter(e => e.startsWith("bmad-method-")).sort().reverse();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") candidates = [];
    else throw err;
  }

  // Step 2: If no plugin found, throw BmadNotInstalledError (regardless of _bmad/).
  if (candidates.length === 0) {
    throw new BmadNotInstalledError(
      "BMAD is not installed (no plugin under ~/.claude/plugins/bmad-method-*).",
    );
  }

  // Step 3: Pick lex-max candidate (deterministic tie-breaker for upgrade window).
  const pluginDir = path.join(pluginsRoot, candidates[0]);

  // Step 4: Read plugin.json.
  const manifestPath = path.join(pluginDir, ".claude-plugin", "plugin.json");
  const parsed = (await Bun.file(manifestPath).json()) as { version?: unknown };

  // Step 5: Extract version.
  if (typeof parsed.version !== "string") {
    throw new Error(
      `BMAD plugin manifest missing or non-string 'version' field at ${manifestPath}`,
    );
  }
  return parsed.version;
}
```

### `detectBmadSkills` Algorithm (Pseudo-code)

```typescript
export async function detectBmadSkills(opts?: DetectBmadOptions): Promise<string[]> {
  const homeDir = opts?.homeDir ?? os.homedir();
  const projectRoot = opts?.projectRoot ?? process.cwd();

  // Steps 1–3 mirror detectBmadVersion.
  const pluginsRoot = path.join(homeDir, ".claude", "plugins");
  let candidates: string[];
  try {
    const entries = await fs.readdir(pluginsRoot);
    candidates = entries.filter(e => e.startsWith("bmad-method-")).sort().reverse();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") candidates = [];
    else throw err;
  }
  if (candidates.length === 0) {
    throw new BmadNotInstalledError(
      "BMAD is not installed (no plugin under ~/.claude/plugins/bmad-method-*).",
    );
  }
  const pluginDir = path.join(pluginsRoot, candidates[0]);

  // Step 4: List skills/ subdirectory.
  const skillsDir = path.join(pluginDir, "skills");
  try {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => e.name).sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}
```

### Bun.file().json() Pattern (Story 1.9 introduces this for production code)

Story 1.8 established the **`Bun.spawn` pattern** for subprocess capture (git rev-parse). Story 1.9 introduces the parallel **`Bun.file().json()` pattern** for filesystem JSON reads:

```typescript
// Idiomatic Bun-only JSON read of a small manifest:
const parsed = await Bun.file(manifestPath).json();
// parsed is `unknown` — narrow with runtime checks before use.
```

Notes for Story 1.10 (DAG seed — same pattern for parsing per-skill `frontmatter` if any), Story 1.12 (doctor — same pattern for compatibility-matrix lookup), Story 6.x (config loader — same pattern for `bmad-stepper.config.yaml` JSON-rendered intermediate):

- `Bun.file(path).json()` returns `Promise<unknown>`. Always narrow with `typeof parsed.X === "string"` before consuming.
- `Bun.file().json()` throws `SyntaxError` on malformed JSON; let it propagate (the doctor command surfaces parse errors with file path).
- `Bun.file()` does NOT throw on missing files until `.json()`/`.text()`/`.arrayBuffer()` is awaited; ENOENT manifests as a thrown `Error` from the parse step.
- Prefer `Bun.file().json()` over `JSON.parse(await Bun.file().text())` — the former is one round-trip, the latter is two.

### `node:fs/promises` Usage (Bun-compatible)

Bun ships full `node:fs/promises` compatibility (Bun docs). Story 1.9 uses `fs.readdir(path, { withFileTypes: true })` for typed dir-entry enumeration. Notes:

- `withFileTypes: true` returns `Dirent[]` so we can call `entry.isDirectory()` to filter out files.
- Bun's `fs.readdir` handles Unicode paths correctly on macOS/Linux (NFC + NFD).
- Catch `(err as NodeJS.ErrnoException).code === "ENOENT"` for missing-dir paths; propagate other errors.

### Error Mapping

`BmadNotInstalledError` is **already in the registry** (Story 1.2 deliverable, `src/errors.ts` lines 99–104 — registry stays at 16 codes). Story 1.9 USES this class:

```typescript
import { BmadNotInstalledError } from "../errors.ts";

if (candidates.length === 0) {
  throw new BmadNotInstalledError(
    "BMAD is not installed (no plugin under ~/.claude/plugins/bmad-method-*).",
  );
}
```

The class declares:

- `code: "BMAD_NOT_INSTALLED"` (matches AC-2 verbatim).
- `exitCode: 3` (matches AC-2 verbatim).
- `actionableHint: "Run npx bmad-method install --tools claude-code first."` (matches AC-2 verbatim — character-for-character).

**Story 1.9 does NOT modify `src/errors.ts`.** Registry stays at 16 codes. The throw site is the only behavioural change.

### Type Identity — `BmadDetection`

The `BmadDetection` interface lives in `src/bmad-detect/detect-version.ts` (the canonical home — both detectors are co-located in the same module). Shape:

```typescript
export interface BmadDetection {
  readonly bmadVersion: string;
  readonly skillNames: readonly string[];
}
```

**Why this shape exactly.** AC-1's verbatim text says "detection returns `{ bmadVersion, skillNames[] }` parsed from BMAD's plugin manifest". Story 1.9 splits the implementation into two functions (`detectBmadVersion` returns `Promise<string>`; `detectBmadSkills` returns `Promise<string[]>`) per the architecture-mandated split (lines 1226–1227). The orchestrator (Story 1.12 doctor / Story 2.4 runner) composes them:

```typescript
async function detectBmad(opts?: DetectBmadOptions): Promise<BmadDetection> {
  const [bmadVersion, skillNames] = await Promise.all([
    detectBmadVersion(opts),
    detectBmadSkills(opts),
  ]);
  return { bmadVersion, skillNames };
}
```

Story 1.9 does **NOT** ship the `detectBmad` composer. The exported `BmadDetection` type IS sufficient for the runners to assemble the value via `Promise.all`.

### Output Discipline (AR33 + Story 1.3 invariants)

- **No `console.*`** anywhere in `src/bmad-detect/**`. Biome's `noConsole` rule blocks it.
- **`info(...)` / `warn(...)` from `../io/log.ts`** are the ONLY allowed logging APIs. Story 1.9's detectors do NOT emit log output on the happy path (the runner stories surface the version + skill count). The throw site does NOT log — the global error handler renders `actionableHint` to stderr.
- **No `process.exit` calls** — the detectors throw or return; the global error handler decides exit semantics (per `errorRegistry`'s `exitCode` field).
- **No `process.stdout.write` / `console.log` / etc.** — JSON output is reserved for `--export-state` (Story 3.x).

### AR41 Module Boundary (Mid-Tier Sibling Addition)

`src/bmad-detect/` joins the AR41 mid-tier graph alongside `src/state/`, `src/migrations/`, `src/snapshot/` (Story 1.8 sibling).

**Allowed imports for `src/bmad-detect/*.ts`:**

- `../errors.ts` (foundational) — for `BmadNotInstalledError` throw.
- `../io/log.ts` (foundational) — for `info`/`warn` if used. Story 1.9 imports `info` and `warn` only; the throw site does NOT log.
- Bun stdlib — `Bun.file` only (no `Bun.spawn`).
- Node stdlib — `node:os` (`os.homedir`), `node:fs/promises` (`fs.readdir`, `fs.stat`), `node:path` (`path.join`).

**Forbidden imports (AR41 mid-tier-to-mid-tier ban):**

- `../state/`, `../schemas/`, `../lock/`, `../migrations/`, `../snapshot/`, `../personas/`, `../dag/`, `../transcript/`, `../telemetry/`, `../upgrade/`.
- `../commands/` (top-tier — only mid-tier modules are imported INTO commands, never the reverse).
- `node:child_process` — Bun stdlib (`Bun.spawn`) is mandatory if subprocess invocation is needed; Story 1.9 uses no subprocesses, so this constraint is moot but documented.
- External libraries beyond the project's existing pin (`zod` is allowed if needed but Story 1.9 does not need it — see "No new schemas" below).

### No New Schemas (Story 1.5 Scope-Lock)

Story 1.5 lands the Zod schema framework. Story 1.9 does **NOT** introduce new Zod schemas. The `BmadDetection` interface is a **structural** TypeScript type, not a `z.infer<...>` derived type. Rationale:

1. The plugin manifest shape is governed by the upstream BMAD project, not by Stepper's schemas. Stepper consumes the shape opportunistically (extracts `version` field) and does not validate it strictly — a future-compatibility move (BMAD MAY add fields; Stepper ignores them gracefully).
2. The skill name array is `string[]` — no structural shape beyond the array itself. A `z.array(z.string())` schema adds no validation beyond TypeScript's static type. Story 1.9 keeps the runtime cost zero.
3. AR41 mid-tier-to-mid-tier ban: importing `../schemas/` from `src/bmad-detect/` would violate the boundary graph. Defining a Zod schema **inside** `bmad-detect/` is technically allowed but architecturally noisy — the guideline is "schemas live in `src/schemas/`" (Story 1.5).

If a future story needs Zod-validated parsing of `plugin.json` (e.g., to enforce required fields in CI), Story 6.x (config loader) will introduce a `BmadPluginManifestSchema` in `src/schemas/bmad-plugin.ts` and the orchestrator will validate it on its way into the detector. Story 1.9 ships only the runtime guard `typeof parsed.version === "string"`.

### Test Pattern (Real Filesystem in Tmpdir per AR35)

- **No mocking of `fs.readdir`, `Bun.file`, `os.homedir`.** Use real filesystem operations in `os.tmpdir()`-derived directories.
- **Inject `homeDir` via `DetectBmadOptions`** — the test fixture builds a fake `~/.claude/plugins/bmad-method-X.Y.Z/` tree under the tmpdir and passes the tmpdir as `homeDir`. The production code uses `os.homedir()` by default; tests inject a fake.
- **Cleanup** via `fs.rm(tmp, { recursive: true, force: true })` in `afterEach` to keep the OS tmpdir tidy.
- **One tmpdir per test** to avoid cross-test contamination (AR35).
- **Wait for `await Bun.write(path, content)`** before asserting — `Bun.write` is synchronous-ish but the async return is necessary for typed Promise chains.

### Forward Dependencies

These stories will depend on `src/bmad-detect/` (this story's outputs):

- **Story 1.10 — DAG Seed + Three-Tier Registry:** `src/dag/build.ts` calls `detectBmadSkills()` as the **Tier 3 fallback** input — every BMAD skill that is NOT in the curated `seed-v6.x.ts` table OR project overrides falls through to the frontmatter-parse fallback, which iterates `detectBmadSkills()` output. The unknown-skill path that fails loud (`UnknownBmadSkillError`) consumes this list.
- **Story 1.12 — `/bmad-next --doctor`:** `src/commands/doctor/run.ts` calls `detectBmadVersion()` and `detectBmadSkills()` to populate the doctor's diagnostic output ("BMAD detected: vX.Y.Z (compatible). Step registry: built from N BMAD skills..." per PRD line 299).
- **Story 2.4 — Lock-free `run.ts` for `/bmad-next`:** the **first runtime consumer for /bmad-next** — calls `detectBmadVersion()` at the top of the runner. The `BmadNotInstalledError` throw propagates through the global error handler → exit code 3 + verbatim hint. AC-3's "detection is invoked at the top of every command runner" is fulfilled at this story.
- **Story 4.1 — `bmad-loop` command skeleton:** the **second runtime consumer** — `src/commands/loop/run.ts` calls `detectBmadVersion()` at the top of the loop runner. Same throw-on-missing semantics as Story 2.4.

### CLI Parser Readiness (Carry-over from Story 1.7)

`NextArgsSchema` (Story 1.7) does NOT include any flag for BMAD detection — detection is unconditional, not flag-gated. Story 1.9 does NOT touch the CLI parser. The runner stories (2.4 / 4.1 / 1.12) call the detectors unconditionally before parsing-then-acting on flags.

### 16-Code Error Registry — Carry-Over State

After Story 1.8, `src/errors.ts` registry: `LOCK_CONTENTION`, `BRANCH_SWITCH`, `BMAD_INCOMPATIBLE`, `BMAD_NOT_INSTALLED`, `UNKNOWN_BMAD_SKILL`, `DAG_CYCLE`, `CORRUPT_STATE`, `STATE_TOO_NEW`, `STATE_CHANGED_DURING_DISPATCH`, `VERIFIER_FAILURE`, `PATHOLOGICAL_INPUT`, `SCOPE_VIOLATION`, `BUDGET_EXCEEDED`, `TIMEOUT`, `CONFIG_ERROR`, `MIGRATION_FAILURE` — exactly 16 codes. **Story 1.9 does NOT modify the registry.** The `BmadNotInstalledError` class exists with verbatim AC-2 hint; Story 1.9 only adds **throw sites** in `src/bmad-detect/detect-version.ts` and `src/bmad-detect/detect-skills.ts`.

### Test Totals and Quality Gates

Pre-Story-1.9 baseline (Story 1.8 final): **~216–218 pass / 0 fail / ~605–615 expects across 23 files**. Story 1.9 adds 2 new test files (`src/bmad-detect/detect-version.test.ts` ~5–7 it() blocks + `src/bmad-detect/detect-skills.test.ts` ~4–5 it() blocks) for a total of ~9–12 new it() blocks. Expected post-Story-1.9 totals: ~225–230 pass / 0 fail / ~625–640 expects across 25 files. Wall-time delta: ~1–3 seconds (filesystem operations are sub-millisecond per call; the integration tests aggregate to a few seconds at most).

### Dev Agent Guardrails — Do Not Do These Things

In addition to the cumulative guardrails from Stories 1.1–1.8 (still in force):

- **Do NOT add `console.log` / `console.error` / `console.warn` / `console.info` anywhere.** Biome's `noConsole` rule blocks ALL `console.*` calls. Use `info(...)` / `warn(...)` from `../io/log.ts` if logging is needed (Story 1.9 does not emit on the happy path).
- **Do NOT import `node:child_process`.** Use Bun stdlib if subprocess invocation is needed (Story 1.9 needs no subprocess; this is precautionary).
- **Do NOT add `glob`, `fast-glob`, `fs-extra`, `chalk`, or any other external library.** No new deps.
- **Do NOT modify `src/errors.ts`.** Registry stays at 16; the existing `BmadNotInstalledError` class has the verbatim AC-2 hint already.
- **Do NOT modify `src/schemas/`.** Story 1.9 uses no Zod schemas.
- **Do NOT modify `src/snapshot/detect.ts` or any other Story 1.8 file.** Story 1.9 does NOT touch `src/snapshot/`.
- **Do NOT throw `BmadNotInstalledError` from anywhere outside `src/bmad-detect/`.** The runner stories (2.4 / 4.1 / 1.12) call the detectors and let exceptions propagate; they do not throw the error themselves.
- **Do NOT import from `../state/`, `../schemas/`, `../lock/`, `../migrations/`, `../snapshot/`** in any `src/bmad-detect/` file. AR41 mid-tier-to-mid-tier ban.
- **Do NOT make `detectBmadVersion` or `detectBmadSkills` synchronous.** They MUST be `async` because `Bun.file().json()` and `fs.readdir` return Promises.
- **Do NOT mock `Bun.file`, `fs.readdir`, or `os.homedir` in tests.** Use real filesystem operations in tmpdir per AR35.
- **Do NOT skip the `withFileTypes: true` option** in `fs.readdir` for the skills enumerator. The directory-vs-file filter is required (Tier 3 DAG fallback consumes the list as authoritative).
- **Do NOT use `path.resolve` instead of `path.join`** — `path.join` is sufficient for the single-anchor-plus-segments composition Story 1.9 needs; `path.resolve` would inadvertently consume any intermediate absolute segment as a new anchor.
- **Do NOT modify `package.json`** — no new deps. `Bun.file`, `node:os`, `node:fs/promises`, `node:path` are all built-in.
- **Do NOT publish, tag, or push a release.** Version stays at `0.0.0` until Epic 6.
- **Do NOT modify `commands/bmad-next.md`** — Story 2.7 owns the slash-command markdown body.
- **Do NOT make `DetectBmadOptions` non-readonly.** All fields optional + readonly via TypeScript's `Readonly<...>` if the dev agent prefers that strictness.
- **Do NOT add cross-invocation deduplication for the throw.** Each call that observes a missing plugin throws immediately; the orchestrator has no concept of "first throw vs. subsequent throws" — every command runner invocation re-runs detection from scratch (per AC-3 verbatim).

### Source Tree — Exact Files to Create or Modify

This story creates exactly **5 new files** under `src/bmad-detect/` and modifies exactly **zero existing source files**.

**Files created (5):**

```
bmad-stepper/
└── src/
    └── bmad-detect/                    # NEW directory (mid-tier per AR41)
        ├── index.ts                    # public barrel: re-exports detectBmadVersion, detectBmadSkills, BmadDetection, DetectBmadOptions
        ├── detect-version.ts           # detectBmadVersion + BmadDetection interface + DetectBmadOptions interface
        ├── detect-skills.ts            # detectBmadSkills
        ├── detect-version.test.ts      # ~5–7 it() blocks covering AC-1 happy path + AC-2 throws + edge cases (multi-plugin, corrupt manifest, missing version field)
        └── detect-skills.test.ts       # ~4–5 it() blocks covering AC-1 happy path + AC-2 throw + edge cases (empty skills, file-vs-dir filter)
```

**Files NOT modified (preserved verbatim from Story 1.8 final state):**

- `package.json`, `tsconfig.json`, `biome.json`, `bunfig.toml`, `bun.lock`.
- `.github/workflows/ci.yml`, `.claude-plugin/plugin.json`, `commands/bmad-next.md`, `.gitignore`, `LICENSE`.
- `src/errors.ts` (registry stays at 16 codes; `BmadNotInstalledError` class unchanged).
- `src/errors.test.ts`.
- `src/io/{log,paths,atomic-write}.ts` and tests.
- `src/lock/lock.ts`, `src/lock/lock.test.ts`, all `src/lock/integration/*.test.ts`.
- All `src/schemas/*.ts` and `src/schemas/*.test.ts`.
- All `src/migrations/*.ts` and `src/migrations/*/*.ts`.
- All `src/state/*.ts` and `src/state/*.test.ts`.
- All `src/snapshot/*.ts` (Story 1.8 outputs stay untouched).
- All `src/commands/**/*.ts` and `src/commands/**/*.test.ts`.

### Testing Requirements

- **`bun test` MUST pass with at least 25 test files** discovered (23 baseline + 2 bmad-detect tests).
- **Each new test file MUST exit 0 standalone:** `bun test src/bmad-detect/detect-version.test.ts` and `bun test src/bmad-detect/detect-skills.test.ts`.
- **Total expected `it(...)` count:** ~218 baseline + ~9–12 new = ~227–230 total.
- **Run-time budget:** ~6–9 seconds total (real filesystem ops add ~1–3s aggregate; baseline ~5s).
- **`bunx biome ci .`** MUST exit 0 against the new files. Biome's `assist/source/organizeImports` will auto-organize imports alphabetically with type-only imports last.
- **`bun run check`** MUST exit 0 (composite release-blocker; AR36).
- **CI matrix** (`ubuntu-latest`, `macos-latest`) MUST be green. Both ship `node:fs/promises` + `Bun.file` and a writable `os.tmpdir()`.
- **`bunx tsc --noEmit`** exits 0. Verify the `Promise<string>` and `Promise<string[]>` return types narrow correctly in test code.

### File Structure Requirements — Final Check

Before declaring this story done, the dev agent MUST verify ALL of these checks pass:

1. **`src/bmad-detect/`** directory exists with five files: `index.ts`, `detect-version.ts`, `detect-skills.ts`, `detect-version.test.ts`, `detect-skills.test.ts`.
2. **`src/bmad-detect/detect-version.ts`** exports `detectBmadVersion`, `BmadDetection` (interface), `DetectBmadOptions` (interface).
3. **`src/bmad-detect/detect-skills.ts`** exports `detectBmadSkills`.
4. **`BmadDetection`** has exactly 2 keys: `bmadVersion: string`, `skillNames: readonly string[]`.
5. **`detectBmadVersion`** returns `Promise<string>`; **`detectBmadSkills`** returns `Promise<string[]>`.
6. **Both detectors are `async`** (NOT synchronous).
7. **Both detectors throw `BmadNotInstalledError`** when no `bmad-method-*` plugin directory exists under `~/.claude/plugins/`.
8. **`src/bmad-detect/**/*.ts`** import only `bun:test` (tests), `node:os` / `node:fs/promises` / `node:path` (production + tests), `../errors.ts` (`BmadNotInstalledError`), `../io/log.ts` (only if logging needed; Story 1.9 does not emit on happy path), `./detect-version.ts` (detect-skills + tests), `./detect-skills.ts` (tests). NO imports from `../state/`, `../schemas/`, `../lock/`, `../migrations/`, `../snapshot/`, `../commands/`, sibling mid-tier modules.
9. **`bun test`** exits 0 with 25+ test files reported as run.
10. **`bunx biome ci .`** exits 0.
11. **`bun run check`** exits 0.
12. **No imports outside foundational/sibling-tier scope** in any new file (AR41 — mid-tier `bmad-detect/` imports only foundational `errors.ts`/`io/log.ts` + Bun stdlib + Node stdlib).
13. **`package.json`, `tsconfig.json`, `biome.json`, `bunfig.toml`, `.github/workflows/ci.yml`, `.claude-plugin/plugin.json`, `commands/bmad-next.md`, `bun.lock`, `src/errors.ts`** are byte-identical to their Story 1.8 state.
14. **No new error class added.** `errors.test.ts` registry count assertion (16) still passes.
15. **Status flipped to `review`** upon dev-story completion.
16. **No `console.*` calls anywhere in the new files** (Biome `noConsole` confirmed).

### Code Quality Enforcement (AR36)

- **Biome 2.3.15 only.** No ESLint, no Prettier.
- **`noConsole: "error"`** — blocks all `console.*` calls.
- **`noImplicitAnyLet: "error"`** — every `let` declaration needs an explicit type.
- **`noUnusedVariables: "error"`** — every imported symbol must be used.
- **Import organisation:** alphabetical with type-only imports last.

### Naming Conventions (AR31, applied to Source TS)

- **Filenames:** `kebab-case.ts` — `detect-version.ts`, `detect-skills.ts`, `index.ts`. Test files: `detect-version.test.ts`, `detect-skills.test.ts` (colocated).
- **Function names:** `camelCase` — `detectBmadVersion`, `detectBmadSkills`.
- **Type/interface names:** `PascalCase` — `BmadDetection`, `DetectBmadOptions`.
- **Constants:** SCREAMING_SNAKE_CASE for top-level immutables. None expected in Story 1.9.
- **Test names:** descriptive lower-case strings inside `it(...)` calls — `it("returns the version string from plugin.json for an installed BMAD plugin")`, `it("throws BmadNotInstalledError when neither plugin dir nor _bmad/ exists")`.

## Previous Story Intelligence

This section synthesizes carry-over context from Stories 1.1–1.8 for Story 1.9's dev agent.

- **Story 1.1 (Initialize Repository Scaffold):** Bun 1.3.12 host (AR2 single-runtime). Biome 2.3.15 (rule renames `noConsoleLog` → `noConsole`; `assist.organizeImports` formerly `formatter.imports`). Zod 3.24 pinned (Story 1.5 introduces Zod runtime; Story 1.9 does NOT use Zod). `commands/bmad-next.md` plugin contract (Stepper is a Claude Code plugin per architecture line 116). `package.json` deps frozen post-1.1 — Story 1.9 adds zero new deps.
- **Story 1.2 (Errors Module Registry + CI Gate):** 16-entry error registry pinned (Story 1.8 final state). `BmadNotInstalledError` class declared at `src/errors.ts` lines 99–104 with `code: "BMAD_NOT_INSTALLED"`, `exitCode: 3`, `actionableHint: "Run npx bmad-method install --tools claude-code first."` — Story 1.9 imports + throws this existing class; does NOT add a new one. The `errors.test.ts` registry CI gate (AR22) enforces the 16-code list; Story 1.9 leaves it at 16.
- **Story 1.3 (Logger + Path Helpers + Atomic Write):** `info`/`warn`/`error` write to **stderr**; `json` writes to **stdout** (FR54 stdout discipline). Story 1.9 imports `info`, `warn` from `../io/log.ts` if logging is needed (the happy path does not emit; the throw site does not emit — the global error handler renders `actionableHint`). `src/io/paths.ts` `assertWithinScope` (AR42) is not relevant to Story 1.9 since the detector reads from outside the project root (`~/.claude/plugins/`) — that's read-only, not write, so `assertWithinScope` does not apply.
- **Story 1.4 (File Lock with Heartbeat):** `src/lock/` mid-tier directory pattern (AR41 sibling). `LockOptions` test-only-but-exported escape-hatch pattern (Story 1.9's `DetectBmadOptions` follows). Story 1.9 does NOT call `acquireLock` or `releaseLock` — detection is non-locking (read-only filesystem ops on `~/.claude/plugins/`).
- **Story 1.5 (Schemas + Migrations Skeleton):** Zod schema framework lands. Story 1.9 does NOT introduce new schemas — `BmadDetection` is a structural TypeScript interface, not a `z.infer<...>` type. Architecturally, `src/schemas/` is foundational tier; mid-tier modules `bmad-detect/` and `snapshot/` (Story 1.8) deliberately keep schema definitions inside their own modules to maintain the AR41 mid-tier-to-mid-tier ban (importing `../schemas/` is forbidden).
- **Story 1.6 (State Subsystem Load/Save/Recompute Skeleton):** `src/state/` mid-tier with `load.ts`, `save.ts`, `recompute.ts`. Story 1.9 does NOT call any state function — detection is upstream of state (the runner calls `detectBmadVersion()` BEFORE `loadState()`). The `recomputeState` function is the Story 1.10 / 1.6 surface that consumes `detectBmadSkills()` output as input — the producer-consumer wiring lands in Story 1.10 (DAG builder).
- **Story 1.7 (CLI Argument Parser):** `parseNextArgs` lands the `resume`, `dryRun`, `recomputeState`, `forceUnlock` flags. Story 1.9 does NOT touch CLI parsing — detection is unconditional (every command runner invokes it regardless of flags). Story 1.7's hand-rolled-Zod parser is the foundation; runner stories (2.4 / 4.1 / 1.12) compose `parseNextArgs(...)` + `detectBmadVersion(...)` at the runner top.
- **Story 1.8 (Snapshot Branch + SHA Detection):** `src/snapshot/detect.ts` lands the **Bun.spawn pattern** for subprocess capture (`git rev-parse --is-inside-work-tree`, `git rev-parse --abbrev-ref HEAD`, `git rev-parse HEAD`). Story 1.9 introduces the **parallel `Bun.file().json()` pattern** for filesystem JSON reads (plugin.json manifest). Story 1.9 follows Story 1.8's `DetectSnapshotOptions` test-only-but-exported pattern with `DetectBmadOptions`. Story 1.9 follows Story 1.8's AR41 mid-tier-to-mid-tier ban (no `../snapshot/` imports). Story 1.9's `BmadNotInstalledError` throw differs from Story 1.8's `null` fallback: BMAD is required, Git is not. Story 1.8's detached-HEAD edge case (`branch === "HEAD"`) does not have an analogue in Story 1.9 — the BMAD plugin manifest is either present-and-valid or missing-and-thrown.

## File List

New files:

- src/bmad-detect/index.ts (24 lines) — public barrel re-exporting `detectBmadVersion`, `detectBmadSkills`, `BmadDetection`, `DetectBmadOptions`. Internal helper `_resolvePluginDir` deliberately NOT re-exported (stays module-private per AR41 mid-tier convention).
- src/bmad-detect/detect-version.ts (~205 lines) — `detectBmadVersion(opts?)` async function + `BmadDetection` interface + `DetectBmadOptions` interface + module-private `_resolvePluginDir` helper (exported under underscore-prefix for sibling-file reuse, NOT in barrel). 5-step algorithm: list `<homeDir>/.claude/plugins/`, filter `bmad-method-*`, lex-max sort, read `<pluginDir>/.claude-plugin/plugin.json` via `Bun.file().json()`, validate string `version` field.
- src/bmad-detect/detect-skills.ts (~105 lines) — `detectBmadSkills(opts?)` async function. Reuses `_resolvePluginDir` to resolve the plugin tree, then `fs.readdir(skillsDir, { withFileTypes: true })` filtered to directories, mapped to names, sorted lex-ASCII.
- src/bmad-detect/detect-version.test.ts (~190 lines, 9 it() blocks) — AC-1 happy path; AC-2 throws (missing both, _bmad/ only, .claude/plugins/ with non-BMAD entries, hint+exitCode verification); manifest edge cases (missing plugin.json, missing version field, non-string version); multi-plugin lex-max selection.
- src/bmad-detect/detect-skills.test.ts (~135 lines, 6 it() blocks) — AC-1 happy path (3 skills, sort); deterministic lex-ASCII sort; empty skills dir → `[]`; file-vs-dir filter (stray README.md skipped); AC-2 throw (missing plugin); hint+exitCode verification.

Modified files: (none)

Verified byte-identical from Story 1.8 final state:

- `src/errors.ts` (registry stays at 16 codes; `BmadNotInstalledError` class unchanged).
- `src/errors.test.ts`, `src/io/**`, `src/lock/**`, `src/schemas/**`, `src/migrations/**`, `src/state/**`, `src/snapshot/**`, `src/commands/**`.
- `package.json`, `tsconfig.json`, `biome.json`, `bunfig.toml`, `bun.lock`, `.github/workflows/ci.yml`, `.claude-plugin/plugin.json`, `commands/bmad-next.md`.

## Dev Agent Record

Status: review
Persona: bmad-dev-story
Agent Model Used: Claude Opus 4.7 (1M context)

### Implementation Summary

Story 1.9 lands the `src/bmad-detect/` mid-tier module per AR41 (architecture lines 1278-1304). Two async detector functions (`detectBmadVersion`, `detectBmadSkills`) plus a public barrel (`index.ts`) and two integration test files. The detectors share a module-private helper `_resolvePluginDir` (exported under underscore-prefix from `detect-version.ts` for sibling-file reuse; NOT re-exported by `index.ts`). Algorithm follows the story spec verbatim: list `<homeDir>/.claude/plugins/` → filter `bmad-method-*` → lex-max-sort + reverse → throw `BmadNotInstalledError` if empty → read `<pluginDir>/.claude-plugin/plugin.json` via `Bun.file().json()` → validate `typeof parsed.version === "string"`. Tests use real filesystem operations in `os.tmpdir()`-derived directories (one tmpdir per test, AR35 isolation; cleanup via `fs.rm({ recursive: true, force: true })` in `afterEach`). The `setupFakeBmadPlugin(homeDir, version, skills)` fixture is duplicated in both test files per the Story 1.6 colocated-test-no-cross-import pattern.

### Deviations from Spec

None of substance. Two minor structural choices:

- The `_resolvePluginDir` helper is exported from `detect-version.ts` under an underscore-prefixed alias and consumed by `detect-skills.ts` to avoid duplicating the 25-line plugin-resolution logic (the story spec called this out as acceptable: "Story 1.9 prefers a small private helper inside `detect-version.ts` re-exported under a non-public symbol, OR inline the resolution"). The barrel deliberately does NOT re-export the underscore symbol, keeping it module-private from external consumers.
- JSDoc references to `bmad-method-*/skills/` and `bmad-method-*/.claude-plugin/` were rewritten to use `bmad-method-X/skills/` and `bmad-method-X/.claude-plugin/` because the literal `*/` sequence inside a JSDoc block comment terminates the comment (Bun parser error). The semantic meaning is preserved in surrounding prose ("under `~/.claude/plugins/` for entries starting with `bmad-method-`").

### Test Counts

- `bun test` final: 232 pass / 0 fail / 664 expect() calls across 25 files (1200 ms wall-time).
- Pre-Story-1.9 baseline (Story 1.8 final): 217 pass / 0 fail / 638 expects across 23 files. Δ = +15 tests (+9 detect-version + +6 detect-skills), +26 expects (+15 + +11), +2 files.
- Standalone `bun test src/bmad-detect/`: 15 pass / 0 fail / 26 expects across 2 files (20 ms).

### Quality Gate Results

- `bun test` exit 0 — 232 pass / 0 fail / 664 expects across 25 files in 1200 ms.
- `bun run check` exit 0 — composite `biome ci . && bun test --pass-with-no-tests` both green.
- `bunx biome ci .` exit 0 — 59 files checked, no fixes applied.
- `bunx tsc --noEmit` exit 0 — TypeScript strict + verbatimModuleSyntax + noUncheckedIndexedAccess all pass.

### AR41 Boundary Verification

`Grep "^import" src/bmad-detect/` proof:

```
src/bmad-detect/detect-skills.ts:61:import * as fs from "node:fs/promises";
src/bmad-detect/detect-skills.ts:62:import * as path from "node:path";
src/bmad-detect/detect-skills.ts:63:import { _resolvePluginDir, type DetectBmadOptions } from "./detect-version.ts";
src/bmad-detect/detect-version.ts:71:import * as fs from "node:fs/promises";
src/bmad-detect/detect-version.ts:72:import * as os from "node:os";
src/bmad-detect/detect-version.ts:73:import * as path from "node:path";
src/bmad-detect/detect-version.ts:74:import { BmadNotInstalledError } from "../errors.ts";
src/bmad-detect/detect-version.test.ts:20:import { afterEach, beforeEach, describe, expect, it } from "bun:test";
src/bmad-detect/detect-version.test.ts:21:import * as fs from "node:fs/promises";
src/bmad-detect/detect-version.test.ts:22:import * as os from "node:os";
src/bmad-detect/detect-version.test.ts:23:import * as path from "node:path";
src/bmad-detect/detect-version.test.ts:24:import { BmadNotInstalledError } from "../errors.ts";
src/bmad-detect/detect-version.test.ts:25:import { detectBmadVersion } from "./detect-version.ts";
src/bmad-detect/detect-skills.test.ts:17:import { afterEach, beforeEach, describe, expect, it } from "bun:test";
src/bmad-detect/detect-skills.test.ts:18:import * as fs from "node:fs/promises";
src/bmad-detect/detect-skills.test.ts:19:import * as os from "node:os";
src/bmad-detect/detect-skills.test.ts:20:import * as path from "node:path";
src/bmad-detect/detect-skills.test.ts:21:import { BmadNotInstalledError } from "../errors.ts";
src/bmad-detect/detect-skills.test.ts:22:import { detectBmadSkills } from "./detect-skills.ts";
```

(Note: `index.ts` uses only `export ... from` re-exports; no `^import` lines.)

Allowed (per AR41 mid-tier rules): foundational `../errors.ts` (`BmadNotInstalledError` throw), Bun stdlib (`Bun.file`, `Bun.write` in tests), `bun:test` (test runner), `node:fs/promises` + `node:os` + `node:path` (production + tests), sibling intra-module `./detect-version.ts` (within the same `src/bmad-detect/` module — intra-module imports are unrestricted). All present.

Forbidden imports verified absent: `../state/`, `../schemas/`, `../lock/`, `../migrations/`, `../snapshot/`, `../personas/`, `../dag/`, `../transcript/`, `../telemetry/`, `../upgrade/`, `../commands/`, `node:child_process`, `simple-git`, `nodegit`, `isomorphic-git`, `glob`, `fast-glob`, `fs-extra`, `chalk`. Registry stays at 16 codes (no modification to `src/errors.ts`).

### Repair Iterations

- **Iter 1 — JSDoc parser error.** Initial `bun test src/bmad-detect/` failed with parser errors at JSDoc lines containing `bmad-method-*/skills/` and `bmad-method-*/.claude-plugin/` because `*/` terminates a block comment. Rewrote both occurrences to `bmad-method-X/...` placeholder; tests passed (15 pass / 0 fail).
- **Iter 2 — Biome import-sort.** Initial `import { type DetectBmadOptions, _resolvePluginDir }` triggered Biome's `assist/source/organizeImports` rule (sort underscore-prefix BEFORE letters in ASCII order). Rewrote to `import { _resolvePluginDir, type DetectBmadOptions }`; biome ci . passed (exit 0).

### Completion Notes

- Architecture compliance: `src/bmad-detect/` is a new mid-tier module joining `state/`, `migrations/`, `snapshot/` (Story 1.8) at the same tier per AR41 (architecture lines 1278-1304). Allowed imports: foundational `errors.ts` + Bun stdlib + Node stdlib. No mid-tier-to-mid-tier imports.
- Type structural identity: `BmadDetection` is a structural TypeScript interface (NOT `z.infer<...>` — Story 1.9 ships no Zod schemas per the spec's "no new schemas" mandate). The composer `Promise.all([detectBmadVersion(), detectBmadSkills()])` is the orchestrator's responsibility (Story 1.12 doctor / Story 2.4 next runner / Story 4.1 loop runner).
- Options pattern: `DetectBmadOptions` follows the Story 1.4 `LockOptions` / Story 1.8 `DetectSnapshotOptions` test-only-but-exported pattern. Both fields readonly per AR41 conventions.
- Lex-max selection: when multiple `bmad-method-*` directories exist (rare upgrade-window state), `Array.prototype.sort().reverse()` picks the lexicographically highest. A future story MAY upgrade to semver-aware selection.
- Asymmetry: AC-2 says "neither `_bmad/` nor a BMAD plugin exists → throw". Story 1.9 throws on missing plugin alone (regardless of `_bmad/` presence) per the spec's "the upstream plugin is the disqualifier" interpretation. Tests verify both: empty tmpdir throws AND tmpdir-with-`_bmad/`-but-no-plugin throws.
- Real-FS test pattern: every test runs under a unique `os.tmpdir()`-derived directory (AR35); cleanup via `fs.rm({ recursive: true, force: true })` in `afterEach`. No mocking of `Bun.file`, `fs.readdir`, or `os.homedir`.
- Error mapping: `BmadNotInstalledError` is the only Stepper error thrown. Manifest edge cases (missing plugin.json, missing version field, non-string version) throw system `Error` — the doctor command (Story 1.12) will surface these distinctly from "BMAD not installed".
- Output discipline: no `console.*` calls anywhere (Biome `noConsole` rule blocks them). The detectors do not emit log output on the happy path; the throw site does not emit; the global error handler renders `actionableHint` to stderr.
- Forward-dependency notes: Story 1.10 (DAG seed) consumes `detectBmadSkills()` for Tier 3 fallback; Story 1.12 (doctor) consumes both detectors for the BMAD-compatibility line; Story 2.4 (next/run.ts) and Story 4.1 (loop/run.ts) call `detectBmadVersion()` at the top of every command runner per AC-3 (the runner-side wiring is NOT Story 1.9's responsibility).
- Real plugin layout note (NOT a code change): the actual installed BMAD on this dev machine sits at `~/.claude/plugins/cache/bmad-method/bmad/6.5.0.1/.claude-plugin/plugin.json` (4-level nested cache structure), NOT directly at `~/.claude/plugins/bmad-method-X/.claude-plugin/plugin.json` per the spec. Story 1.9 implements the spec's expected layout verbatim. Reconciliation is a runner concern (Story 1.12 doctor / Story 2.4 next) — if the layout deviates in production, the runner will throw `BmadNotInstalledError` against the user's real install. Flagging for code-review (iteration 3) review.

### Debug Log References

- Baseline before Story 1.9: 217 pass / 0 fail / 638 expects across 23 files (Story 1.8 final).
- After Story 1.9: 232 pass / 0 fail / 664 expects across 25 files (1200 ms wall-time, +962 ms from real-FS integration tests).
- Standalone `bun test src/bmad-detect/`: 15 pass / 0 fail / 26 expects across 2 files (20 ms).
- `bunx biome ci .`: exit 0 — 59 files checked, no fixes applied.
- `bunx tsc --noEmit`: exit 0.
- `bun run check`: exit 0 (composite: biome ci . && bun test --pass-with-no-tests).
- AR41 grep: 19 import lines under `src/bmad-detect/`, all in the allowed set (foundational `../errors.ts`, Bun/Node stdlib, sibling intra-module).

### Context Reference

- _bmad-output/implementation-artifacts/1-9-bmad-detection.md (this file — story spec)
- _bmad-output/planning-artifacts/architecture.md (lines 1224-1228, 1278-1304, 1296, 1332, 1371, 1380, 1381, 1665, 1666, 1675)
- _bmad-output/planning-artifacts/epics.md §Story 1.9 (lines 484-498)
- _bmad-output/planning-artifacts/prd.md §FR41/FR50/FR51/NFR-S1/NFR-R1
- src/errors.ts lines 99-104 (BmadNotInstalledError class — unchanged)
- src/io/log.ts (info/warn/error/json signatures — referenced but not used on happy path)
- src/snapshot/detect.ts (Bun.spawn pattern reference; Story 1.9 introduces parallel Bun.file().json() pattern)
- src/snapshot/index.ts (barrel pattern reference for src/bmad-detect/index.ts)
- package.json (Bun 1.3.12; zero new deps)
- _bmad/config.yaml (project pin)

## Senior Developer Review (AI)

**Reviewer**: bmad-code-review persona, automated review by Claude Code
**Date**: 2026-05-01
**Verdict**: approve

### AC Verification

**AC-1** ✅: `src/bmad-detect/detect-version.ts:181-196` exports `detectBmadVersion(opts?): Promise<string>` returning the parsed `version` string from `<pluginDir>/.claude-plugin/plugin.json`. `src/bmad-detect/detect-skills.ts:86-104` exports `detectBmadSkills(opts?): Promise<string[]>` returning the sorted directory listing under `<pluginDir>/skills/`. The composite `BmadDetection` shape (`{ readonly bmadVersion: string; readonly skillNames: readonly string[] }`) is declared at `src/bmad-detect/detect-version.ts:100-103` and re-exported through `src/bmad-detect/index.ts:19-24`. Happy-path verified by `detect-version.test.ts:71-75` (returns `"6.5.0.1"`) and `detect-skills.test.ts:67-83` (returns sorted `["bmad-create-prd", "bmad-create-story", "bmad-dev-story"]`).

**AC-2** ✅: `src/bmad-detect/detect-version.ts:151-155` throws `BmadNotInstalledError` when no `bmad-method-*` directory exists under `~/.claude/plugins/`. The `detectBmadSkills` path reuses the same `_resolvePluginDir` helper (`detect-skills.ts:89`), so its throw is symmetric. Registry confirmed unchanged (`src/errors.ts:99-104` — 16-code total preserved): `code: "BMAD_NOT_INSTALLED"`, `exitCode: 3`, `actionableHint: "Run npx bmad-method install --tools claude-code first."` is byte-identical to AC-2's quote. Verified end-to-end by `detect-version.test.ts:86-99` (asserts `code`, `exitCode`, `actionableHint`) and `detect-skills.test.ts:139-152` (symmetric assertion).

**AC-3** ⏭ DEFERRED-TO-RUNNER: Forward-dependency clearly scoped per Story 1.9 spec lines 66 + 423-424 + 647 ("the runner-side wiring is NOT Story 1.9's responsibility"). Runner stories own the throw-site invocation: Story 1.12 (doctor — `src/commands/doctor/run.ts`), Story 2.4 (next — `src/commands/next/run.ts`), Story 4.1 (loop — `src/commands/loop/run.ts`). Story 1.9 lands the detection primitives only; AC-3 will be re-evaluated in those stories' reviews.

### Architecture Compliance

- **AR41 boundary** ✅: `Grep "^import" src/bmad-detect/` returned 19 import lines. Allowed set verified: `bun:test` (test files), `node:fs/promises`, `node:os`, `node:path` (production + tests), `../errors.ts` (`BmadNotInstalledError`), `./detect-version.ts` (intra-module sibling — within `src/bmad-detect/`, allowed). Forbidden imports verified absent: no `../state/`, `../schemas/`, `../lock/`, `../migrations/`, `../snapshot/`, `../commands/`, `node:child_process`, sibling mid-tier modules, or external git-helper libraries. Boundary clean.
- **AR33 function/error semantics** ✅: Both detectors are `async` (`detect-version.ts:181`, `detect-skills.ts:86`); both throw the registered `BmadNotInstalledError` class verbatim from `../errors.ts`; manifest edge cases (missing `plugin.json`, missing/non-string `version`) propagate as system `Error` per spec. No `console.*` calls anywhere; no `process.exit` calls. Public surface fully JSDoc'd.

### Quality Gates (independent verification)

- `bun test`: 232 pass / 0 fail / 664 expect() calls across 25 files (1375 ms) — passed.
- `biome ci .`: exit 0 (59 files checked, no fixes applied).
- `tsc --noEmit`: exit 0.

### Action Items

**Must-fix**: 0 (none).
**Should-fix**: 0 (none).
**Nits**: 0 (none).
**Info**: 2.
- INFO-1: Real-world BMAD install on dev machine sits at `~/.claude/plugins/cache/bmad-method/bmad/6.5.0.1/.claude-plugin/plugin.json` (4-level nested cache layout) vs spec's `~/.claude/plugins/bmad-method-*/.claude-plugin/plugin.json`. Story 1.9 implements the spec verbatim. Classified as follow-up (c) — see "Deviations from Spec" below.
- INFO-2: `_bmad/` presence check is documented in spec lines 142–143 as informational; current implementation throws on missing plugin regardless of `_bmad/` (per spec line 244 — "the upstream plugin is the disqualifier"). The `projectRoot` field on `DetectBmadOptions` is currently unused at runtime and only exists for future symmetry. Acceptable per spec; not load-bearing today.

### Deviations from Spec

Dev flagged two minor structural choices, both pre-approved by spec text:
1. `_resolvePluginDir` underscore-export from `detect-version.ts` reused by `detect-skills.ts`. Spec line 151 explicitly allowed: "Story 1.9 prefers a small private helper inside `detect-version.ts` re-exported under a non-public symbol, OR inline the resolution". Acceptable.
2. JSDoc rewrites `bmad-method-*/skills/` → `bmad-method-X/skills/` to avoid `*/` block-comment terminator. Cosmetic-only; semantic meaning preserved.

Reviewer adds one classification on the real-FS plugin layout finding (dev's iter-3 flag): **classified as (c) follow-up — not blocking for Story 1.9.** Rationale: spec was hand-written against the marketplace `~/.claude/plugins/bmad-method-X/` layout; the cache layout (`~/.claude/plugins/cache/bmad-method/bmad/X.Y.Z.W/`) is per-installer behaviour from the Claude Code marketplace plugin cache. Reconciling the two layouts is a runner-level diagnostic concern for Story 1.12 (doctor) — that story's first runtime reality-check will surface the discrepancy and propose a multi-path resolver. Story 1.9 ships the spec contract intact, which is the correct posture for a foundational module.

### Notes for Future Stories

- **Story 1.10 (DAG seed)** consumes `detectBmadSkills()` for Tier 3 fallback; lex-ASCII sort guarantee from `detect-skills.ts:97` is the deterministic-enumeration contract that downstream depends on.
- **Story 1.12 (doctor)** is the first runtime consumer for `detectBmadVersion()`. This story should **also** address INFO-1: extend `_resolvePluginDir` (or add a sibling resolver) to walk the cache layout `~/.claude/plugins/cache/bmad-method/bmad/X.Y.Z/`. Doctor is the right place because it's the first command that surfaces upstream-installation health to the user.
- **Story 2.4 (next runner)** + **Story 4.1 (loop runner)** must call `detectBmadVersion()` at the top of their entry points unconditionally (per AC-3 verbatim). The `BmadNotInstalledError` propagation through the global error handler is the contract — no per-runner try/catch.
- **Story 6.x (config loader / upgrade)** may want a Zod schema (`BmadPluginManifestSchema`) in `src/schemas/bmad-plugin.ts` for full manifest validation if marketplace plugins start drifting from the canonical shape. Not needed today.

## Change Log

- 2026-05-01: Story file created (status `ready-for-dev`) — bmad-create-story persona.
- 2026-05-01: Implemented detect-version.ts + detect-skills.ts + tests; quality gates green; status → review — bmad-dev-story persona.
- 2026-05-01: Senior Developer Review approve; 0 must-fix / 0 should-fix / 0 nits / 2 info; status → done — bmad-code-review persona.

## References

- **Story Foundation:**
  - [Source: _bmad-output/planning-artifacts/epics.md#Story 1.9: BMAD Detection] — User story + AC verbatim (lines 484–498).
  - [Source: _bmad-output/planning-artifacts/epics.md#Epic 1: Foundation & First-Run Diagnostic] — Epic context.
- **Architecture Compliance:**
  - [Source: _bmad-output/planning-artifacts/architecture.md#Claude Code plugin shape] — `.claude-plugin/plugin.json` + `commands/`/`skills/`/`agents/`/`.mcp.json` (line 116).
  - [Source: _bmad-output/planning-artifacts/architecture.md#Source Tree §bmad-detect/] — directory structure (lines 1224–1228).
  - [Source: _bmad-output/planning-artifacts/architecture.md#AR33 — Function & error semantics] — async/throw discipline (line 213).
  - [Source: _bmad-output/planning-artifacts/architecture.md#AR41 — Module boundary graph] — `bmad-detect/` is mid-tier (line 1296).
  - [Source: _bmad-output/planning-artifacts/architecture.md#FR Coverage Map] — FR50 → `src/bmad-detect/detect-version.ts` (line 1380); FR2 → `src/bmad-detect/detect-skills.ts` (line 1332); FR41 → `src/commands/doctor/run.ts` consumes detect-version (line 1371); FR51 → fail-loud unknown skill (line 1381).
  - [Source: _bmad-output/planning-artifacts/architecture.md#External Integrations] — read-only `~/.claude/plugins/<bmad>/**` via `src/bmad-detect/` (line 1489).
  - [Source: _bmad-output/planning-artifacts/architecture.md#`.claude-plugin/plugin.json` field set] — required + optional fields (line 1665).
  - [Source: _bmad-output/planning-artifacts/architecture.md#Behavior outside a BMAD project] — `BMAD_NOT_INSTALLED` resolution: detect by absence of `~/.claude/plugins/bmad-method-*` AND `_bmad/`; hint verbatim (line 1666).
  - [Source: _bmad-output/planning-artifacts/architecture.md#BMAD_NOT_INSTALLED added to error registry] — `code: "BMAD_NOT_INSTALLED"`, `exitCode: 3`, hint verbatim (line 1675).
- **PRD:**
  - [Source: _bmad-output/planning-artifacts/prd.md#FR41] — `--doctor` reports BMAD compatibility (line 726).
  - [Source: _bmad-output/planning-artifacts/prd.md#FR50] — Detect installed BMAD version on first run (line 738).
  - [Source: _bmad-output/planning-artifacts/prd.md#FR51] — Fail loudly with remediation hint on unknown skill (line 739).
  - [Source: _bmad-output/planning-artifacts/prd.md#NFR-S1] — No network IO on main thread (line 764).
  - [Source: _bmad-output/planning-artifacts/prd.md#NFR-R1] — Zero data loss on halt; fail-loud preserves invariant (line 773).
- **Previous Stories:**
  - [Source: _bmad-output/implementation-artifacts/1-1-initialize-repository-scaffold.md] — Bun 1.3.12 host, Biome 2.3.15, Zod 3.24 pinned.
  - [Source: _bmad-output/implementation-artifacts/1-2-errors-module-registry-ci-gate.md] — 16-entry registry pattern with `BmadNotInstalledError` already declared verbatim per AC-2; **Story 1.9 does NOT extend the registry**.
  - [Source: _bmad-output/implementation-artifacts/1-3-logger-path-helpers-atomic-write.md] — `info`/`warn`/`error` → stderr; `json` → stdout. Story 1.9 imports `info`/`warn` only (no actual emission).
  - [Source: _bmad-output/implementation-artifacts/1-4-file-lock-with-heartbeat.md] — `LockOptions` test-only-but-exported pattern; Story 1.9's `DetectBmadOptions` follows.
  - [Source: _bmad-output/implementation-artifacts/1-5-schemas-migrations-skeleton.md] — Zod schema framework; Story 1.9 deliberately introduces no new schemas (mid-tier-to-mid-tier ban).
  - [Source: _bmad-output/implementation-artifacts/1-6-state-subsystem-load-save-recompute-skeleton.md] — `loadState`/`saveState`/`recomputeState`; Story 1.9 does NOT call any of them.
  - [Source: _bmad-output/implementation-artifacts/1-7-cli-argument-parser.md] — `parseNextArgs` lands `resume`, `dryRun`, `recomputeState`, `forceUnlock` flags; Story 1.9 does NOT touch CLI parsing — detection is unconditional.
  - [Source: _bmad-output/implementation-artifacts/1-8-snapshot-branch-sha-detection.md] — `src/snapshot/detect.ts` Bun.spawn pattern + `DetectSnapshotOptions` test-only-but-exported pattern + AR35 real-FS-in-tmpdir test pattern + AR41 mid-tier sibling addition. Story 1.9 reuses the test-only-options + tmpdir patterns; switches Bun.spawn → Bun.file().json() for filesystem JSON reads.
- **Project Config Pin:**
  - [Source: _bmad/config.yaml] — `project_name: bmad-stepper`, `planning_artifacts`, `implementation_artifacts`, `test_framework: bun-test`. **Pinned to `_bmad/config.yaml`.**

### Definition of Done

- [ ] All 6 tasks above completed and self-checked.
- [ ] All 16 file-structure final-check items pass.
- [ ] `src/bmad-detect/detect-version.ts` exists; exports `detectBmadVersion`, `BmadDetection` (interface), `DetectBmadOptions` (interface).
- [ ] `src/bmad-detect/detect-skills.ts` exists; exports `detectBmadSkills`.
- [ ] `src/bmad-detect/detect-version.test.ts` exists; covers AC-1 happy path + AC-2 throw paths + edge cases.
- [ ] `src/bmad-detect/detect-skills.test.ts` exists; covers AC-1 happy path + AC-2 throw + edge cases.
- [ ] `src/bmad-detect/index.ts` barrel exists.
- [ ] `src/errors.ts` is byte-identical to its Story 1.8 state (registry stays at 16).
- [ ] `package.json`, `tsconfig.json`, `biome.json`, `bunfig.toml`, `bun.lock` are byte-identical to their Story 1.8 state.
- [ ] `bun run check` exits 0 locally.
- [ ] CI green on `ubuntu-latest` and `macos-latest`.
- [ ] `detectBmadVersion` correctly handles: installed plugin → version string; missing plugin → `BmadNotInstalledError`; multi-plugin → lex-max selection; corrupt manifest → system Error; missing version field → system Error.
- [ ] `detectBmadSkills` correctly handles: installed plugin with skills → sorted string array; missing skills dir → empty array; file-vs-dir entries → directories only; missing plugin → `BmadNotInstalledError`.
- [ ] Both detectors are `async` (NOT synchronous; `Bun.file().json()` and `fs.readdir` return Promises).
- [ ] No `console.*` calls anywhere in the new files (Biome `noConsole` confirmed).
- [ ] No imports from `../state/`, `../schemas/`, `../lock/`, `../migrations/`, `../snapshot/`, `../commands/`, sibling mid-tier modules, `node:child_process`, external libraries beyond the project's existing pin.
