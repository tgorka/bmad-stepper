---
status: done
story_id: '1.11'
story_key: 1-11-persona-resolution
epic: '1'
title: Persona Resolution
created: '2026-05-01'
last_updated: '2026-05-01'
priority: blocking
estimated_effort: M
fr_coverage:
  - FR12
  - FR34
  - FR40
nfr_coverage:
  - NFR-R1
  - NFR-I2
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
  - _bmad-output/implementation-artifacts/1-9-bmad-detection.md
  - _bmad-output/implementation-artifacts/1-10-dag-seed-three-tier-registry.md
  - _bmad/config.yaml
  - src/errors.ts
  - src/io/log.ts
  - src/dag/types.ts
  - src/dag/seed-v6.x.ts
  - package.json
---

# Story 1.11: Persona Resolution

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper user,
I want every step's persona resolved through 4 tiers (frontmatter -> project config -> plugin defaults -> module-config auto-detect),
So that the dispatch spec's PERSONA section is always populated correctly without forcing me to declare it manually.

## Context Summary

This story lands the **first source-side `src/personas/` module** of the project — the **four-tier persona resolver** that operationalises **architecture §D13** (lines 631-642) by composing a frontmatter check, a project-config lookup, a hand-curated default map, and a module-config auto-detect into a single deterministic resolver. Until now, the foundational stack (`src/errors.ts`, `src/io/{log,paths,atomic-write}.ts`, `src/lock/lock.ts`, `src/schemas/`, `src/migrations/`, `src/state/`, `src/snapshot/`, `src/bmad-detect/`, `src/dag/` Story 1.10 sibling) has been wired but no source-side surface exists for **resolving the persona that owns a step**. Story 1.11 fills that gap by authoring a small, deterministic resolver that returns `string | string[]` for any step name and throws `ConfigError` (registry code `CONFIG_ERROR`, exit code 2) with a verbatim hint when no tier resolves.

Concretely, this story produces:

1. **`src/personas/index.ts`** — public barrel re-exporting `resolvePersona`, the resolved-persona return shape, and the `defaults` constant for inspection by tests and the doctor command (Story 1.12).
2. **`src/personas/defaults.ts`** — Tier 3 hand-curated default map. A `Record<string, string | readonly string[]>` keyed by the BMAD plugin skill directory name. Mirrors `src/dag/seed-v6.x.ts` `persona` field exactly (kebab-case identifiers: `analyst`, `pm`, `architect`, `ux-designer`, `dev`, `tech-writer`, `tea`). **Forward dependency contract**: any change to the seed's `persona` field MUST land in this file in the same PR; the seed does NOT directly import from `defaults.ts` per AR41 mid-tier-to-mid-tier ban — coordination is via TYPE-level mirroring documented in JSDoc.
3. **`src/personas/resolve.ts`** — the canonical 4-tier resolver. Public function `resolvePersona(input: ResolveInput): Promise<string | readonly string[]>` accepts the step name plus optional `pluginDir`, `projectRoot`, `bmadModuleDir`, `configPath` (composer-pattern: same precedent as `src/dag/build.ts`). Resolution order is: (1) read SKILL.md frontmatter `persona:` field at `<pluginDir>/skills/<step>/SKILL.md`; (2) read `bmad-stepper.config.yaml` `personas:` block; (3) lookup `defaults.ts`; (4) parse `_bmad/<module>/config.yaml` triggers. On none-resolve, throws `ConfigError` with the verbatim AC-2 hint `Add a persona for <step> in bmad-stepper.config.yaml under the personas: block.`.
4. **`src/personas/resolve.test.ts`** — colocated integration tests using **`Bun.write(...)`** + `node:fs/promises` `mkdir` to set up fake `SKILL.md` fixtures, fake `bmad-stepper.config.yaml`, and fake `_bmad/<module>/config.yaml` triggers in a tmpdir per AR35. Tests cover: each tier resolving in isolation; tier-precedence (Tier 1 wins over Tier 2 wins over Tier 3 wins over Tier 4); the throw on no-tier-resolves; the multi-persona array return shape; the verbatim error hint.
5. **`src/personas/defaults.test.ts`** — colocated pure-function tests asserting that `defaults` covers every name in `seedV6_x` (TYPE-level mirroring contract). Imports `seedV6_x` from `../dag/seed-v6.x.ts` only inside the test (AR41 cross-mid-tier import IS allowed in tests for cross-module assertions).

This story is a **deliberately disciplined skeleton** — it lands the persona resolver as a pure async function that can be integration-tested in isolation. It does **NOT**:

- Wire the resolver into the runners (`next/run.ts`, `loop/run.ts`, `doctor/run.ts`). The runners (Story 2.4 next, Story 1.12 doctor, Story 4.1 loop) call `build({ skillNames })` THEN call `resolvePersona({ step, ... })` for each candidate next step. Story 1.11 ships only the `resolvePersona()` primitive. The composition is the runner's responsibility.
- Modify `src/errors.ts`. The `ConfigError` class already exists in the registry from Story 1.2 (`src/errors.ts` lines 206-211, code `CONFIG_ERROR`, exit code 2). Story 1.11 USES this class but does NOT extend the registry.
- Implement multi-persona parallel dispatch. Per architecture line 640 + PRD §17, multi-persona steps in v0.1 dispatch sub-agents **sequentially**. Story 1.11 returns `string | readonly string[]` — the array shape signals to the runner (Story 2.3 sub-agent runner) that sequential dispatch is required. Parallel dispatch is deferred to a future epic.
- Author the Zod schema for `bmad-stepper.config.yaml`'s `personas:` block. The full config-yaml schema loader lands in Story 6.1; Story 1.11's Tier 2 loader is a **placeholder** — it reads `bmad-stepper.config.yaml` if present (via `Bun.file(...).text()` + simple YAML `personas:` block extractor mirroring Story 1.10's hand-rolled `overrides:` extractor strategy), and returns `{}` if the file is absent. Full schema integration is deferred.
- Modify `src/dag/`. The seed `persona` field stays as it is. Story 1.11's `defaults.ts` mirrors the seed identifier set EXACTLY in kebab-case but coordinates via TYPE-level mirroring (a comment in both files referencing the contract), NOT direct cross-module import per AR41 mid-tier-to-mid-tier ban.
- Modify `src/bmad-detect/`. Story 1.11 does NOT directly import the BMAD detector. If Tier 1 SKILL.md reads need the detected plugin path, the runner composer (Story 2.4) passes `pluginDir` as a parameter — same precedent as Story 1.10's `BuildInput.pluginDir`.

It DOES land:

- The exact AR41-conformant placement of `src/personas/` as a **mid-tier** module. Per architecture line 1282 the boundary graph places `personas/` alongside `state/`, `migrations/`, `snapshot/`, `bmad-detect/`, `dag/` (Story 1.10 sibling), `transcript/`, `telemetry/`, `upgrade/` (all mid-tier; depend on foundational + receive cross-mid-tier inputs only via runner-orchestrator composition). Story 1.11 lands **only** the foundational allowed imports (`../errors.ts`, `../io/log.ts`, Bun stdlib `Bun.file`, Node stdlib `node:fs/promises` + `node:path`); the dependency graph stays clean — `personas/*.ts` does NOT import from `bmad-detect/`, `state/`, `schemas/`, `lock/`, `snapshot/`, `dag/`, or any sibling mid-tier module. Those imports happen in the orchestrator (Story 2.4 next) that wires detection + DAG build + persona resolution into commands.
- The composition pattern for **declarative-priority resolution**: a four-tier cascade with explicit precedence and a verbatim fail-loud hint. This pattern is the canonical template for any future "lookup with fallbacks" resolver in the project.
- The `string | readonly string[]` return contract that downstream consumers (Story 2.2 dispatch spec generator, Story 2.3 sub-agent runner) consume to decide between single dispatch and sequential multi-persona dispatch. Architecture line 640 pins this shape exactly.
- The deterministic `ConfigError` throw on a no-tier-resolves outcome per AC-2 — establishing the **fail-loud-on-unconfigured-persona** pattern operationalising FR12 + FR40 (architecture line 642). Story 1.11 is the canonical throw site for `CONFIG_ERROR` in the persona resolution path; later stories may surface the same code via doctor (Story 1.12) but only via the same code path (call `resolvePersona()`, let it throw).

This is **AR33** (function & error semantics — `resolvePersona` is `async`; throws `StepperError` subclasses verbatim; no `console.*`), **AR41** (module boundary — `src/personas/` is mid-tier; allowed imports from foundational `errors.ts`, `io/log.ts`; forbidden imports from `state/`, `schemas/`, `lock/`, `snapshot/`, `bmad-detect/`, `dag/`, sibling mid-tier modules). It also operationalises **FR12** (`--persona` override per architecture line 1342; the override flag short-circuits the resolver, but the resolver is still the source of truth), **FR34** (project-level YAML config per PRD line 716), **FR40** (layered config resolution per PRD line 722), **NFR-R1** (zero data loss on halt — fail-loud preserves), **NFR-I2** (unknown skill fail-loud per architecture line 1416 — same posture extended to unconfigured persona).

## Acceptance Criteria

The acceptance criteria below are reproduced **verbatim** from `_bmad-output/planning-artifacts/epics.md` §Story 1.11 (lines 526-536, BDD Given/When/Then format). Lines and AC labelling preserved.

### AC-1 (Given/When/Then — 4-tier resolver order)

**Given** `src/personas/{defaults.ts, resolve.ts}` with the hand-curated default map for every seed skill
**When** `resolvePersona(stepName)` runs
**Then** it checks (1) the BMAD skill's `SKILL.md` frontmatter `persona:`, (2) `bmad-stepper.config.yaml` `personas:`, (3) `src/personas/defaults.ts`, (4) `_bmad/<module>/config.yaml` triggers — in that order

### AC-2 (Given/When/Then — fail-loud on no-tier-resolves)

**Given** none of the four tiers resolve
**When** `resolvePersona` runs
**Then** it throws `CONFIG_ERROR` (exit code 2) with the hint `Add a persona for <step> in bmad-stepper.config.yaml under the personas: block.`

### AC-3 (Given/When/Then — multi-persona sequential dispatch)

**Given** a step with multiple personas (e.g., `code-review` = `["dev", "tea"]`)
**When** dispatching
**Then** sub-agents run sequentially (parallel deferred per PRD §17)

## Tasks / Subtasks

- [ ] **Task 0 — Verify pre-conditions (AC: 1, 2, 3)**
  - [ ] 0.1 Confirm `src/errors.ts` registry stays at 16 codes after Story 1.10 (Story 1.10 left the registry untouched). Confirm `ConfigError` exists at `src/errors.ts` lines 206-211 with `code: "CONFIG_ERROR"`, `exitCode: 2`. Verify `bun test src/errors.test.ts` exits 0. **Story 1.11 does NOT modify `src/errors.ts`** — registry stays at 16; `ConfigError` is pre-existing.
  - [ ] 0.2 Confirm `src/io/log.ts` exports `info`, `warn`, `error`, `json` per Story 1.3. Story 1.11 imports **only** `warn` (used once on the Tier-2-empty edge — when `bmad-stepper.config.yaml` exists but has no `personas:` block — to log "no personas config block found at <path>; skipping Tier 2" at `warn` level). The throw site (`ConfigError`) does NOT emit a log message — the error carries its own `actionableHint`.
  - [ ] 0.3 Confirm Story 1.10 `src/dag/seed-v6.x.ts` is byte-identical (Story 1.11's `defaults.ts` mirrors the **shape** of seed `persona` fields — `string | readonly string[] | null` with kebab-case identifiers — but does NOT import the seed array per AR41 mid-tier-to-mid-tier ban for runtime imports; the seed is only imported inside `defaults.test.ts` for cross-module mirroring assertions).
  - [ ] 0.4 Confirm `package.json` has zero new deps relative to Story 1.10 final state. **DO NOT add a new dep** — `Bun.file`, `node:fs/promises`, `node:path` are all built-in. The Tier-2 YAML parse uses the same hand-rolled key-extractor strategy as Story 1.10's `overrides:` extractor (the full Zod-validated YAML loader lands in Story 6.1).
  - [ ] 0.5 Confirm baseline `bun run check` exits 0. Record the baseline test count in Completion Notes (expected ~245 pass / 0 fail / ~700 expects across ~26 files per Story 1.10 final).
  - [ ] 0.6 Confirm Bun host version satisfies AR2 (Bun >= 1.3). Run `bun --version`; record in Completion Notes (1.3.12 expected per Story 1.10 baseline).
  - [ ] 0.7 Read architecture §D13 lines 631-642 (4-tier resolution order, multi-persona sequential dispatch, fail-loud `CONFIG_ERROR`), source-tree §`personas/` lines 1190-1194 (`index.ts`, `defaults.ts`, `resolve.ts`, `*.test.ts`). Story 1.11 ships exactly these files.
  - [ ] 0.8 Read AR41 mid-tier boundary graph lines 1278-1304. Confirm `src/personas/` is mid-tier and the allowed-imports set is: foundational (`../errors.ts`, `../io/log.ts`), Bun stdlib (`Bun.file`), Node stdlib (`node:fs/promises`, `node:path`). Forbidden: `../state/`, `../schemas/`, `../lock/`, `../migrations/`, `../snapshot/`, `../bmad-detect/`, `../dag/` (sibling mid-tier ban, runtime), `../commands/`, `node:child_process`, external libraries.
  - [ ] 0.9 Read prd.md FR12 (line 685 — `--persona` override; Story 1.11 ships the resolver, the CLI flag wiring lands in Story 3.5), FR34 (line 716 — project YAML), FR40 (line 722 — layered resolution), NFR-R1 (line 773 — zero data loss), NFR-I2 (line 793 — fail-loud unknown skill; same posture extended to unconfigured persona).
  - [ ] 0.10 Read epics.md Story 1.11 §lines 520-536 verbatim. Confirm the AC text in §Acceptance Criteria above is character-identical.

- [ ] **Task 1 — Create `src/personas/` directory + `src/personas/index.ts` barrel (AC: 1, 2, 3)**
  - [ ] 1.1 Create directory `src/personas/`. Per AR41, this is **mid-tier** — same tier as `src/state/`, `src/migrations/`, `src/snapshot/`, `src/bmad-detect/`, `src/dag/` (Story 1.10 sibling). Allowed imports for any file under `src/personas/`: foundational (`../errors.ts`, `../io/log.ts`), Bun stdlib (`Bun.file`), Node stdlib (`node:fs/promises`, `node:path`). **Forbidden imports:** `../state/`, `../schemas/`, `../lock/`, `../migrations/`, `../snapshot/`, `../bmad-detect/`, `../dag/`, `../commands/`, sibling mid-tier modules. JSDoc on every file MUST cite AR41 + the architecture line for the boundary graph (lines 1278-1304).
  - [ ] 1.2 Create `src/personas/index.ts` — public barrel:
    ```typescript
    /**
     * src/personas/index.ts — public barrel for the `personas/` mid-tier
     * module (FR12, FR34, FR40, NFR-R1, NFR-I2, AR33, AR41).
     *
     * Story 1.11 exports the 4-tier persona resolver + the defaults map.
     * The runner-side wiring lives in:
     *   - Story 2.2 — src/dispatch/generate-spec.ts (PERSONA section).
     *   - Story 2.3 — src/dispatch/runner.ts (sequential multi-persona).
     *   - Story 2.4 — src/commands/next/run.ts (calls resolvePersona() per
     *                 candidate next step).
     *   - Story 1.12 — src/commands/doctor/run.ts (persona-resolvability
     *                  smoke check).
     *
     * Per AR41 mid-tier boundary, this barrel re-exports ONLY the public
     * surface; internal helpers (YAML extractor, frontmatter parser) stay
     * private to the implementation files.
     */
    export { resolvePersona } from "./resolve.ts";
    export { defaults } from "./defaults.ts";
    export type { ResolveInput, ResolvedPersona } from "./resolve.ts";
    ```
    No test file is needed (pure re-export).

- [ ] **Task 2 — Implement `src/personas/defaults.ts` — Tier 3 hand-curated map (AC: 1)**
  - [ ] 2.1 Create `src/personas/defaults.ts`. Module purpose: declare the hand-curated persona-default map keyed by BMAD plugin skill directory name. **No Zod schemas** — the type is a local `Record<string, string | readonly string[]>` (the `null` case from `seedV6_x` is OMITTED here; null seed entries fall through Tier 3 and resolve via Tier 4 module-config triggers or throw `ConfigError`).
  - [ ] 2.2 Author the defaults map. Each entry MUST mirror `src/dag/seed-v6.x.ts` `persona` field for the corresponding skill name in kebab-case. The full mirror set (45 seed entries → 45 defaults entries; null-persona seed entries are OMITTED from defaults so Tier 4 / Tier-fail can fire):

    **Phase: analysis (5)** — `bmad-brainstorming: "analyst"`, `bmad-domain-research: "analyst"`, `bmad-market-research: "analyst"`, `bmad-product-brief: "analyst"`, `bmad-prfaq: "pm"`.

    **Phase: planning (5)** — `bmad-create-prd: "pm"`, `bmad-validate-prd: "pm"`, `bmad-edit-prd: "pm"`, `bmad-create-ux-design: "ux-designer"`, `bmad-create-epics-and-stories: "pm"`.

    **Phase: solutioning (4)** — `bmad-create-architecture: "architect"`, `bmad-check-implementation-readiness: "architect"`, `bmad-sprint-planning: "pm"`, `bmad-technical-research: "analyst"`.

    **Phase: implementation — core dev chain (8)** — `bmad-create-story: ["analyst", "pm"]`, `bmad-dev-story: "dev"`, `bmad-quick-dev: "dev"`, `bmad-code-review: "dev"`, `bmad-correct-course: "pm"`, `bmad-checkpoint-preview: "dev"`, `bmad-generate-project-context: "tech-writer"`, `bmad-document-project: "tech-writer"`. **Note**: `bmad-customize` and `bmad-shard-doc` have `persona: null` in the seed → OMITTED from defaults (will fall through to Tier 4 or throw).

    **Phase: implementation — testarch (8)** — `bmad-testarch-framework: "tea"`, `bmad-testarch-ci: "tea"`, `bmad-testarch-test-design: "tea"`, `bmad-testarch-atdd: "tea"`, `bmad-testarch-automate: "tea"`, `bmad-testarch-test-review: "tea"`, `bmad-testarch-trace: "tea"`, `bmad-testarch-nfr: "tea"`.

    **Phase: implementation — editorial (5)** — `bmad-editorial-review-prose: "tech-writer"`, `bmad-editorial-review-structure: "tech-writer"`, `bmad-review-adversarial-general: "dev"`, `bmad-review-edge-case-hunter: "dev"`, `bmad-index-docs: "tech-writer"`.

    **Phase: retro (1)** — `bmad-retrospective: "pm"`.

    **Phase: utility (3) — null-persona seed entries** — `bmad-help`, `bmad-advanced-elicitation`, `bmad-distillator` are OMITTED (their seed `persona` is `null`).

    Total: ~36 entries (45 seed - 9 null-persona seed entries). The defaults map is the **fast path** — zero IO at runtime.
  - [ ] 2.3 Persona names. Use kebab-case persona identifiers matching `src/dag/seed-v6.x.ts`. The persona names used: `analyst`, `pm`, `architect`, `ux-designer`, `dev`, `tech-writer`, `tea`. **TYPE-level coordination contract**: `defaults.ts` and `seed-v6.x.ts` MUST be kept in sync; any change to either file's persona-identifier set MUST land in the same PR. Document this in JSDoc on both files.
  - [ ] 2.4 Export shape:
    ```typescript
    export const defaults: Record<string, string | readonly string[]> = {
      "bmad-brainstorming": "analyst",
      // ... 35 more entries
      "bmad-create-story": ["analyst", "pm"] as const,
      // ...
    };
    ```
    Use `as const` ONLY on the array entries — single-string entries do not need it. The object itself is NOT `as const` (would over-narrow the value type).
  - [ ] 2.5 Add JSDoc per Story 1.6 / 1.7 / 1.8 / 1.9 / 1.10 conventions: cite architecture §D13 lines 631-642 (4-tier resolution + multi-persona sequential dispatch), AR41 boundary graph lines 1278-1304, and the **TYPE-level mirroring contract** with `src/dag/seed-v6.x.ts`.

- [ ] **Task 3 — Implement `src/personas/resolve.ts` — 4-tier resolver (AC: 1, 2, 3)**
  - [ ] 3.1 Create `src/personas/resolve.ts`. Module purpose: compose Tier 1 (SKILL.md frontmatter), Tier 2 (`bmad-stepper.config.yaml` `personas:`), Tier 3 (`defaults.ts`), Tier 4 (`_bmad/<module>/config.yaml` triggers), then return the resolved persona OR throw `ConfigError`. Public function signatures:
    ```typescript
    export interface ResolveInput {
      readonly step: string;
      readonly pluginDir?: string;        // for Tier 1 SKILL.md read
      readonly projectRoot?: string;      // for Tier 2 + Tier 4
      readonly configPath?: string;       // override Tier 2 path (test escape hatch)
      readonly bmadModuleDir?: string;    // override Tier 4 root (test escape hatch)
    }

    export type ResolvedPersona = string | readonly string[];

    export async function resolvePersona(
      input: ResolveInput,
    ): Promise<ResolvedPersona>;
    ```
    Async because Tier 1, Tier 2, and Tier 4 involve filesystem IO. Tier 3 is the only synchronous tier (in-memory `defaults` lookup).
  - [ ] 3.2 Algorithm step 1 — **Tier 1: SKILL.md frontmatter.** If `input.pluginDir` is undefined, skip Tier 1. Otherwise, compute `skillMdPath = path.join(input.pluginDir, "skills", input.step, "SKILL.md")`. Use `Bun.file(skillMdPath).exists()` to check. If exists, read text via `Bun.file(skillMdPath).text()`; extract YAML frontmatter (the `---` ... `---` block at the top); look for a `persona:` key. If present, parse the value as `string | string[]` (handle inline array `[a, b]` syntax + flow-mapping). Return immediately on hit.
  - [ ] 3.3 Algorithm step 2 — **Tier 2: project config `personas:` block.** Compute `configPath = input.configPath ?? path.join(input.projectRoot ?? process.cwd(), "bmad-stepper.config.yaml")`. If the file does not exist (catch `ENOENT` from `Bun.file(path).exists()`), skip Tier 2 silently (no log). If exists, read text and find the top-level `personas:` block via the same hand-rolled YAML extractor strategy as Story 1.10's `overrides:` extractor. For each top-level child key under `personas:`, check if the key matches `input.step`. If yes, parse the value as `string | string[]` and return immediately.
  - [ ] 3.4 Algorithm step 3 — **Tier 3: defaults.** Lookup `defaults[input.step]`. If present, return immediately. Synchronous step (zero IO).
  - [ ] 3.5 Algorithm step 4 — **Tier 4: module-config triggers.** Compute `bmadDir = input.bmadModuleDir ?? path.join(input.projectRoot ?? process.cwd(), "_bmad")`. If the directory does not exist, skip Tier 4. Otherwise, list module subdirectories (each is a `<module>` like `bmm`, `tea`, `bmb`, `cis`). For each module, read `<bmadDir>/<module>/config.yaml` if it exists, look for a `triggers:` block (or equivalent — the BMAD module config schema is documented in `_bmad/config.yaml` examples). Match `input.step` against trigger patterns. If matched, return the persona associated with that module (BMAD modules have an implicit persona-by-module mapping: `bmm: "pm"`, `tea: "tea"`, `bmb: "dev"`, `cis: "analyst"`). **NOTE**: the exact trigger format is BMAD's contract; Story 1.11 implements a minimal pattern-matching layer that handles the common case (substring match on the step name in the module's primary trigger list). Document any ambiguity in JSDoc — the precise BMAD-module-trigger schema lands in Story 6.1.
  - [ ] 3.6 Algorithm step 5 — **No-tier-resolves throw.** If none of the four tiers returned, throw `new ConfigError(message, detail, hintOverride)` with:
    - `message`: `Persona not resolvable for step "${input.step}".`
    - `detail`: a structured note listing which tiers were checked (e.g., `Tier 1: pluginDir=undefined (skipped); Tier 2: no match in <configPath>; Tier 3: no entry in defaults; Tier 4: no module trigger match.`)
    - `hintOverride` (per-instance hint): `Add a persona for ${input.step} in bmad-stepper.config.yaml under the personas: block.` **VERBATIM per AC-2**.
  - [ ] 3.7 **`ConfigError` per-instance hint override**. The Story 1.10 reviewer addressed an analogous case for `UnknownBmadSkillError` by extending the constructor with an optional 3rd argument `hintOverride?: string` (see `src/errors.ts` lines 129-141). Story 1.11 has two options: (a) replicate that pattern by extending `ConfigError` with the same per-instance override, or (b) check whether the registry default `actionableHint` for `ConfigError` (line 209-210: `See bmad-stepper.config.yaml; run /bmad-next --doctor to validate the file against the schema.`) is acceptable and adjust the AC-2 verbatim string at the call site only via `error.detail`. **DEV CHOICE**: AC-2 mandates the verbatim hint `Add a persona for <step> in bmad-stepper.config.yaml under the personas: block.` — this string MUST flow through `actionableHint`, not `detail`, because the global error formatter (TBD Story 1.x or already in `src/errors.ts.toJSON()`) renders `actionableHint` in the user-visible output. Therefore extend `ConfigError` per the `UnknownBmadSkillError` precedent. Document this single error-class extension in Completion Notes; it is the **only** allowable Story 1.11 modification to `src/errors.ts`. Code-review will adjudicate.
  - [ ] 3.8 Add JSDoc per Story 1.6 / 1.7 / 1.8 / 1.9 / 1.10 conventions: cite architecture §D13 lines 631-642, AR41 boundary graph lines 1278-1304, and the multi-persona sequential dispatch contract (architecture line 640 + PRD §17 forward dependency to Story 2.3).

- [ ] **Task 4 — Implement `src/personas/resolve.test.ts` — 4-tier integration tests (AC: 1, 2, 3)**
  - [ ] 4.1 Create `src/personas/resolve.test.ts`. Per AR35 (test patterns), use Bun's built-in test runner; spin up a tmpdir per test via `node:fs/promises` `mkdtemp(path.join(os.tmpdir(), "stepper-personas-"))`; clean up via `afterEach` `rm({ recursive: true })`. NEVER hard-code `/tmp/...` paths.
  - [ ] 4.2 Test 1 — **Tier 1 hits**. Set up tmpdir with `<pluginDir>/skills/foo-step/SKILL.md` containing frontmatter `persona: alice`. Call `resolvePersona({ step: "foo-step", pluginDir })`. Expect `"alice"`.
  - [ ] 4.3 Test 2 — **Tier 1 array hits**. Same shape but `persona: [alice, bob]`. Expect `["alice", "bob"]`.
  - [ ] 4.4 Test 3 — **Tier 2 hits**. Set up tmpdir with `bmad-stepper.config.yaml` containing `personas:\n  foo-step: bob\n`. Call `resolvePersona({ step: "foo-step", projectRoot: tmpdir })`. Expect `"bob"`.
  - [ ] 4.5 Test 4 — **Tier 3 hits**. Call `resolvePersona({ step: "bmad-create-prd" })` with no tmpdir setup (no Tier 1, no Tier 2, no Tier 4). Expect `"pm"` (per `defaults.ts`).
  - [ ] 4.6 Test 5 — **Tier 3 array hits**. Call `resolvePersona({ step: "bmad-create-story" })`. Expect `["analyst", "pm"]`.
  - [ ] 4.7 Test 6 — **Tier 4 hits**. Set up tmpdir with `_bmad/bmm/config.yaml` containing a triggers block matching the step name. Call `resolvePersona({ step: "some-bmm-step", projectRoot: tmpdir })`. Expect the BMM module's persona (`"pm"`).
  - [ ] 4.8 Test 7 — **No-tier-resolves throws**. Call `resolvePersona({ step: "totally-unknown-step" })` with no tmpdir setup. Expect `ConfigError` thrown; `error.code === "CONFIG_ERROR"`; `error.exitCode === 2`; `error.actionableHint === "Add a persona for totally-unknown-step in bmad-stepper.config.yaml under the personas: block."` (verbatim per AC-2).
  - [ ] 4.9 Test 8 — **Tier precedence**. Set up tmpdir with all four tiers all configured for the same step (Tier 1: `frontmatter-persona`, Tier 2: `config-persona`, Tier 3: in-memory defaults entry, Tier 4: module config). Call `resolvePersona({ step, pluginDir, projectRoot, ... })`. Expect `"frontmatter-persona"` (Tier 1 wins).
  - [ ] 4.10 Test 9 — **Tier 2 wins over Tier 3**. Set up Tier 2 + Tier 3 only. Expect Tier 2.
  - [ ] 4.11 Test 10 — **Tier 3 wins over Tier 4**. Set up Tier 3 + Tier 4 only. Expect Tier 3.
  - [ ] 4.12 Test 11 — **Multi-persona sequential return shape (AC-3)**. Call `resolvePersona({ step: "bmad-create-story" })`. Expect `Array.isArray(result) === true`. Document in test JSDoc that this signals sequential dispatch to Story 2.3 — the runner inspects the array shape and dispatches sub-agents one-by-one. Story 1.11 ships only the resolver; the sequential dispatch lives in Story 2.3.
  - [ ] 4.13 Test 12 — **Tier 2 file absent gracefully skips**. Call `resolvePersona({ step: "bmad-create-prd", projectRoot: tmpdir })` with no `bmad-stepper.config.yaml` in tmpdir. Expect `"pm"` (Tier 3 fallback). No log emitted (Tier 2 missing-file is silent).
  - [ ] 4.14 Test 13 — **Tier 2 file present but `personas:` block absent emits `warn` once**. Set up `bmad-stepper.config.yaml` with `overrides:` block but no `personas:` block. Call `resolvePersona({ step: "bmad-create-prd", projectRoot: tmpdir })`. Expect `"pm"` (Tier 3 fallback) and a `warn` log entry (capture via the test's log spy from Story 1.3 patterns).

- [ ] **Task 5 — Implement `src/personas/defaults.test.ts` — TYPE-level mirroring assertion (AC: 1)**
  - [ ] 5.1 Create `src/personas/defaults.test.ts`. Module purpose: assert the **TYPE-level mirroring contract** between `defaults.ts` and `src/dag/seed-v6.x.ts`. This is the ONE place AR41 cross-mid-tier import IS allowed at runtime — but ONLY in tests (the test file's import does not affect production code's module graph; the AR41 import-restriction CI gate excludes `*.test.ts`).
  - [ ] 5.2 Test 1 — **Every non-null seed `persona` has a defaults entry**. Import `seedV6_x` from `../dag/seed-v6.x.ts`. For each entry where `entry.persona !== null`, assert `defaults[entry.name]` is defined and equals `entry.persona` (deep-equality for arrays).
  - [ ] 5.3 Test 2 — **Every defaults key exists in the seed**. For each key in `Object.keys(defaults)`, assert `seedV6_x.some(e => e.name === key)`.
  - [ ] 5.4 Test 3 — **Null-persona seed entries are absent from defaults**. For each entry where `entry.persona === null`, assert `defaults[entry.name]` is `undefined` (these fall through to Tier 4 or throw).

- [ ] **Task 6 — Quality gates (AC: 1, 2, 3)**
  - [ ] 6.1 Run `bun run check` — expect 0 fail, baseline + ~13 new tests passing (~258 total). Record in Completion Notes.
  - [ ] 6.2 Run `bun run lint` (Biome) — expect 0 errors, 0 warnings. Confirm `src/personas/*.ts` adheres to project Biome config.
  - [ ] 6.3 Run `bun run typecheck` (`tsc --noEmit`) — expect 0 errors. The `defaults` shape MUST type-check against the `Record<string, string | readonly string[]>` signature.
  - [ ] 6.4 Run AR41 import-boundary CI check (if landed in Story 1.x) — expect zero violations from `src/personas/*.ts`. The forbidden imports are: `../state/`, `../schemas/`, `../lock/`, `../migrations/`, `../snapshot/`, `../bmad-detect/`, `../dag/`, `../commands/`, sibling mid-tier modules (in production code; test files are exempt for cross-module assertions).
  - [ ] 6.5 Confirm `src/errors.ts` registry stays at 16 codes; no new entries. The optional `ConfigError` per-instance hint override (Task 3.7 above) is a backward-compatible constructor change — does NOT add a new registry entry.
  - [ ] 6.6 Confirm `bun run check` exits 0 on a clean checkout (i.e., `git stash && bun run check && git stash pop`) — the persona resolver must not depend on any uncommitted state.

- [ ] **Task 7 — Update story status + sprint status (AC: 1, 2, 3)**
  - [ ] 7.1 Update story file frontmatter: `status: ready-for-dev` → `status: review` (after dev completes; the bmad-create-story persona starts at `ready-for-dev`).
  - [ ] 7.2 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: `1-11-persona-resolution: ready-for-dev` → `1-11-persona-resolution: in-progress` → eventually `review` → `done` per Stepper's status transitions. (Story 1.11 starts at `ready-for-dev`; subsequent transitions are dev's responsibility.)
  - [ ] 7.3 Append a Change Log entry per the template at the bottom of this file.

## Dev Notes

### Architecture compliance

- **§D13 (lines 631-642) — 4-tier resolution order** is verbatim translated to AC-1; Story 1.11's `resolve.ts` IS this decision in code form. The order MUST be: SKILL.md frontmatter → project config → plugin defaults → module-config triggers. No tier-skipping on hit; first-hit wins; exhaustion throws `ConfigError`.
- **§D13 line 640 — Multi-persona sequential dispatch** dictates the `string | readonly string[]` return contract. Story 1.11 returns the array shape unchanged; the sequential dispatch logic lives in the Story 2.3 sub-agent runner, which inspects `Array.isArray(persona)` and dispatches sub-agents one-by-one. Parallel dispatch is deferred to a future epic per PRD §17.
- **§D13 line 642 — `CONFIG_ERROR` (exit 2) on no-tier-resolves** is the canonical fail-loud posture for unconfigured personas. The verbatim hint `Add a persona for <step> in bmad-stepper.config.yaml under the personas: block.` is mandated by AC-2.
- **AR33 (line 213) — function & error semantics**: `resolvePersona` is `async`; throws `StepperError` subclasses (`ConfigError`); no `console.*`; no `process.exit()`. The global error formatter in the runner (Story 2.4) catches and prints `actionableHint`.
- **AR41 (line 1296) — module boundary**: `src/personas/` is mid-tier. Allowed imports: `../errors.ts` (foundational; for `ConfigError` throw), `../io/log.ts` (foundational; for `warn` on Tier-2-empty edge), Bun stdlib (`Bun.file`), Node stdlib (`node:fs/promises`, `node:path`, `node:os` for tmpdir in tests only). FORBIDDEN: `../state/`, `../schemas/`, `../lock/`, `../migrations/`, `../snapshot/`, `../bmad-detect/`, `../dag/`, `../commands/`, sibling mid-tier modules.

### 4-tier resolver order (verbatim from architecture §D13 + Story 1.11 implementation notes)

- **Tier 1 — SKILL.md frontmatter `persona:`**. Read from `<pluginDir>/skills/<step>/SKILL.md` if `pluginDir` is provided. Parse the YAML frontmatter (the `---` ... `---` block at the top of the file) for a `persona:` key. Value is `string | string[]`. **Plugin path source**: `pluginDir` is passed in via `ResolveInput` — composer pattern (the runner Story 2.4 calls `detectBmadVersion()` from `src/bmad-detect/` first to resolve the plugin path, then passes that path to `resolvePersona()`). Per AR41 mid-tier-to-mid-tier ban, `src/personas/` does NOT directly import from `src/bmad-detect/`.
- **Tier 2 — `bmad-stepper.config.yaml` `personas:` block**. Read from `<projectRoot>/bmad-stepper.config.yaml` (or `input.configPath` if provided). Parse the top-level `personas:` map; lookup by step name. Value is `string | string[]`. **Story 6.1 introduces the full Zod-validated config-yaml loader**; for Story 1.11, use a lazy fallback similar to Story 1.10's hand-rolled `overrides:` extractor (line-based YAML key extractor; minimal but sufficient for v0.1).
- **Tier 3 — `src/personas/defaults.ts`**. Synchronous in-memory lookup. Hand-curated map covering every non-null-persona entry in `seedV6_x`. The defaults map is the **fast path** — zero IO at runtime, already compiled into the bundle.
- **Tier 4 — `_bmad/<module>/config.yaml` triggers**. Read from `<projectRoot>/_bmad/<module>/config.yaml` for each `<module>` directory present (typically `bmm`, `tea`, `bmb`, `cis`). Look for a `triggers:` block listing step-name patterns. If a step matches a module's trigger pattern, the module's persona (a fixed mapping: `bmm: "pm"`, `tea: "tea"`, `bmb: "dev"`, `cis: "analyst"`) is the resolved persona. **NOTE**: the exact trigger schema is BMAD's contract; Story 1.11's Tier 4 is a minimal pattern-match layer; the precise schema lands in Story 6.1.
- **On exhaustion** — throw `ConfigError` with the verbatim AC-2 hint. The throw is the canonical fail-loud posture for unconfigured personas; the runner (Story 2.4) catches and renders the hint to the user.

### Multi-persona sequential dispatch

The resolver's return type is `string | readonly string[]`. Single-persona steps return a string; multi-persona steps return an array. The Story 2.3 sub-agent runner inspects `Array.isArray(persona)` and:

- If `false`: dispatch ONE sub-agent with the persona-specific dispatch spec (Story 2.2).
- If `true`: dispatch sub-agents SEQUENTIALLY, one per persona, in array order. Each sub-agent's output is staged separately; the verifier (Story 2.6) runs after each. Failure of any sub-agent halts the step (no partial promotion).

**Parallel dispatch** is deferred per PRD §17 — the v0.1 product reaches feature-complete with sequential-only multi-persona dispatch. A future epic may revisit (e.g., parallel dispatch for read-only personas like `tech-writer` review steps).

### AR41 boundary

`src/personas/` joins the mid-tier sibling set (per architecture line 1282): `migrations/`, `state/`, `bmad-detect/`, `personas/`, `dag/`, `transcript/`, `telemetry/`, `upgrade/`. All depend only on foundational (`errors.ts`, `schemas/`, `io/`) and never on each other.

**Allowed imports** for `src/personas/*.ts`:
- `../errors.ts` (for `ConfigError` throw).
- `../io/log.ts` (for `warn` on Tier-2-empty edge).
- Bun stdlib: `Bun.file` (file existence check, text read).
- Node stdlib: `node:fs/promises` (directory listing for Tier 4), `node:path` (path joining).

**FORBIDDEN imports** for `src/personas/*.ts` (production code):
- `../dag/` (sibling mid-tier ban; persona identifiers are coordinated via TYPE-level mirroring in the JSDoc and a runtime test in `defaults.test.ts`).
- `../bmad-detect/` (sibling mid-tier ban; plugin path is passed in via `ResolveInput.pluginDir`).
- `../state/`, `../schemas/`, `../lock/`, `../migrations/`, `../snapshot/`, `../commands/`, sibling mid-tier modules.
- `node:child_process`, external libraries (no new deps).

**Test-only allowance**: `src/personas/defaults.test.ts` MAY import `seedV6_x` from `../dag/seed-v6.x.ts` to assert the TYPE-level mirroring contract. This is permitted because the AR41 CI check excludes `*.test.ts` files from the import-restriction graph (test files often need cross-module assertions).

### Persona identifiers — TYPE-level coordination with `src/dag/seed-v6.x.ts`

The kebab-case persona identifier set used in `src/personas/defaults.ts` MUST match the set used in `src/dag/seed-v6.x.ts` `persona` field. The contract:

- Identifiers used: `analyst`, `pm`, `architect`, `ux-designer`, `dev`, `tech-writer`, `tea`.
- Coordination mechanism: TYPE-level mirroring documented in JSDoc on both files. NO direct cross-module runtime import (per AR41).
- Verification: `src/personas/defaults.test.ts` imports `seedV6_x` (test-only allowance) and asserts every non-null-persona entry has a matching defaults entry.
- Maintenance: any change to persona identifiers in either file MUST land in the same PR.

This **TYPE-level mirroring** approach was flagged as INFO-1 in the Story 1.10 reviewer notes (forward-dep to Story 1.11). Story 1.11 lands the mirroring contract concretely.

### Test pattern (AR35)

Per Story 1.3 / 1.4 / 1.6 / 1.8 / 1.9 / 1.10 precedent:
- Use Bun's built-in test runner (`bun test`).
- Spin up a tmpdir per test via `node:fs/promises` `mkdtemp(path.join(os.tmpdir(), "stepper-personas-"))`.
- Clean up via `afterEach` `rm({ recursive: true })`.
- NEVER hard-code `/tmp/...` paths.
- Mock SKILL.md fixtures, mock `bmad-stepper.config.yaml`, mock `_bmad/<module>/config.yaml` files using `Bun.write(...)` + `mkdir({ recursive: true })`.
- Capture log output via the test's log spy pattern from Story 1.3 (`io/log.ts` exposes a test-mode capture hook).

### Forward-dep notes

- **Story 2.2** (dispatch spec generator): consumes `resolvePersona` output to populate the `PERSONA` section of the sub-agent task spec. The dispatch spec generator inspects `Array.isArray(persona)` to decide between single-line `PERSONA: <name>` and multi-line `PERSONA: <names...>` (sequential dispatch sentinel).
- **Story 2.3** (sub-agent runner): consumes `resolvePersona` output via the dispatch spec; on `Array.isArray(persona) === true`, dispatches sub-agents sequentially, one per persona, in array order.
- **Story 6.1** (config-yaml schema loader): introduces the full Zod-validated `bmad-stepper.config.yaml` loader. Story 6.1 will replace Story 1.11's hand-rolled Tier-2 extractor with the Zod-validated loader (one-line refactor in `resolve.ts`).
- **Story 6.3** (models per step): keys on the persona resolved here. The `models:` block in `bmad-stepper.config.yaml` allows pinning a specific Claude model per persona-per-step combination.
- **Story 3.5** (`--persona` override flag): the CLI flag short-circuits the resolver. Story 3.5 wires the flag into `src/commands/next/args.ts` + `src/commands/next/run.ts`; the runner skips `resolvePersona()` if `--persona <name>` is provided. Story 1.11's resolver remains the source of truth when no override is given.

## Previous Story Intelligence

This is iteration 11 of Epic 1. Lessons learned from Stories 1.1–1.10 directly applicable to Story 1.11:

### Story 1.1 — Bun host scaffold

- Bun 1.3.12 is the minimum supported runtime (AR2). Story 1.11's tests use `Bun.write`, `Bun.file`, and Bun's built-in test runner. No `bun add` is required (zero new deps).
- The `package.json` `scripts` block exposes `check`, `lint`, `typecheck`, `test`. Story 1.11 must keep these passing.

### Story 1.2 — Errors module + registry CI gate

- `ConfigError` is in the registry at `src/errors.ts` lines 206-211 with `code: "CONFIG_ERROR"`, `exitCode: 2`, and a default `actionableHint` of `See bmad-stepper.config.yaml; run /bmad-next --doctor to validate the file against the schema.`. Story 1.11 USES this class; AC-2 mandates a verbatim hint that DIVERGES from the registry default. Resolution: extend `ConfigError` with an optional 3rd constructor argument `hintOverride?: string` per the `UnknownBmadSkillError` precedent from Story 1.10 (lines 129-141). This is the ONLY allowable Story 1.11 modification to `src/errors.ts`.
- The registry CI gate (`src/errors.test.ts`) instantiates each subclass via `new Ctor("test message")` and `new Ctor("primary message", "extra detail line")` — the 3rd arg is optional and defaults to `undefined`, so adding it is backward-compatible.

### Story 1.3 — Logger + path helpers + atomic write

- `src/io/log.ts` exports `info`, `warn`, `error`, `json`. Story 1.11 imports ONLY `warn` (used once on the Tier-2-empty edge — file present but `personas:` block absent).
- Tests can capture log output via the test-mode log spy hook (per Story 1.3 pattern). Story 1.11's Tier-2-empty test uses this.

### Story 1.4 — File lock with heartbeat

- `src/lock/` is a mid-tier sibling of `src/personas/`. Per AR41, `src/personas/` does NOT import from `src/lock/`. Persona resolution does not require file locking (read-only operation).
- Composer pattern: `LockOptions` has a `lockDir` test escape hatch. Story 1.11's `ResolveInput` mirrors this with `configPath` + `bmadModuleDir` test escape hatches.

### Story 1.5 — Schemas + migrations skeleton

- `src/schemas/` is a foundational module. Story 1.11 does NOT introduce any Zod schemas. The `personas:` block schema is deferred to Story 6.1's full config-yaml schema loader.
- Story 1.11's local types (`ResolveInput`, `ResolvedPersona`) are structural TypeScript types only — no Zod, no runtime validation.

### Story 1.6 — State subsystem load/save/recompute skeleton

- `src/state/` is a mid-tier sibling. Per AR41, `src/personas/` does NOT import from `src/state/`. Persona resolution is stateless (no read or write of `state.yaml`).

### Story 1.7 — CLI argument parser

- `parseNextArgs` in `src/commands/next/args.ts` parses `--persona <name>` (FR12). Story 1.11 does NOT modify the parser; the flag wiring lands in Story 3.5. The parser exists but is currently unused for the persona override path.

### Story 1.8 — Snapshot branch+sha detection

- `src/snapshot/` is a mid-tier sibling using `Bun.spawn` for `git rev-parse`. Per AR41, `src/personas/` does NOT import from `src/snapshot/`. Story 1.11 does not need branch/sha detection.

### Story 1.9 — BMAD detection

- `src/bmad-detect/` is a mid-tier sibling. Per AR41, `src/personas/` does NOT directly import the BMAD detector. If Tier 1 SKILL.md reads need the detected plugin path, the runner composer (Story 2.4) calls `detectBmadVersion()` first and passes `pluginDir` as a parameter to `resolvePersona({ step, pluginDir, ... })`. Same composer-pattern precedent as Story 1.10's `BuildInput.pluginDir`.

### Story 1.10 — DAG seed + three-tier registry

- `src/dag/seed-v6.x.ts` exports `seedV6_x: readonly SeedEntry[]` with persona identifiers in kebab-case: `analyst`, `pm`, `architect`, `ux-designer`, `dev`, `tech-writer`, `tea` (plus `null` for utility skills). Story 1.11's `defaults.ts` MUST mirror these identifiers EXACTLY.
- **TYPE-level coordination, NOT direct import** per AR41 mid-tier-to-mid-tier ban. The mirroring contract is documented in JSDoc on both files; verification lives in `src/personas/defaults.test.ts` (test-only allowance for the cross-module import).
- Story 1.10's reviewer flagged this as **INFO-1** (forward-dep to Story 1.11). Story 1.11 lands the mirroring contract concretely.
- Story 1.10's hand-rolled `overrides:` YAML extractor in `src/dag/build.ts` is the pattern Story 1.11's `resolve.ts` should mirror for the `personas:` block — same line-based YAML key extractor, same test-tmpdir setup, same fail-on-missing-block behaviour.
- Story 1.10 also extended `UnknownBmadSkillError` with an optional 3rd constructor argument `hintOverride?: string` to deliver the AC-3 verbatim hint without rewriting the registry default. Story 1.11 replicates this pattern for `ConfigError` per Task 3.7 above.

## File List (Final)

### New files

- `src/personas/index.ts` — public barrel; re-exports `DEFAULT_PERSONAS`, `resolvePersona`, and types `ResolveInput`, `ResolveOptions`. 22 lines.
- `src/personas/defaults.ts` — Tier 3 hand-curated default map; 36 entries mirroring `seedV6_x` non-null-persona seed entries (kebab-case persona identifiers `analyst`, `pm`, `architect`, `ux-designer`, `dev`, `tech-writer`, `tea`). 87 lines.
- `src/personas/resolve.ts` — 4-tier resolver; public `resolvePersona(input: ResolveInput): Promise<string | readonly string[]>`. Hand-rolled `personas:` YAML extractor mirrors Story 1.10's `overrides:` extractor. 425 lines.
- `src/personas/resolve.test.ts` — colocated integration tests; tmpdir per AR35; 19 test cases (Tier 1/2/3/4 happy paths, tier-precedence ladder, no-tier-resolves throw with verbatim AC-2 hint, multi-persona array shape, graceful degradation, escape hatches). 286 lines.
- `src/personas/defaults.test.ts` — TYPE-level mirroring assertion against `seedV6_x` (test-only cross-module import per AR41 deviation). 5 test cases covering: non-empty record; every non-null seed entry mirrored; defaults keys exist as seed names; null-persona entries omitted; allowed kebab-case identifiers. 84 lines.

### Modified files

- `src/errors.ts` — extended `ConfigError` constructor with optional 3rd argument `hintOverride?: string` per the `UnknownBmadSkillError` precedent (lines 129-141 of pre-Story-1.11 file). Backward-compatible change: `actionableHint` converted from a static readonly field to a getter that returns `hintOverride ?? DEFAULT_HINT`. Registry stays at 16 codes (additive constructor change; no new entry). `errors.test.ts` registry CI gate passes 10/10 unchanged.

### Unchanged files (cited but not touched)

- `src/dag/seed-v6.x.ts`, `src/dag/types.ts`, `src/dag/build.ts`, `src/dag/index.ts` — Story 1.10 deliverables; Story 1.11 mirrors persona identifiers but does not modify these files.
- `src/io/log.ts`, `src/io/paths.ts`, `src/io/atomic-write.ts` — Story 1.3 foundational module; Story 1.11 imports only `warn` from `log.ts`.
- `src/bmad-detect/index.ts`, `src/bmad-detect/detect-skills.ts`, `src/bmad-detect/detect-version.ts` — Story 1.9 sibling; Story 1.11 does NOT import.
- `package.json` — zero new deps.

## Dev Agent Record

### Context Reference

- _bmad-output/planning-artifacts/architecture.md §D13 lines 631-642
- _bmad-output/planning-artifacts/architecture.md AR41 lines 1278-1304
- _bmad-output/planning-artifacts/prd.md FR12, FR34, FR40, NFR-R1, NFR-I2
- _bmad-output/implementation-artifacts/1-10-dag-seed-three-tier-registry.md (most recent)
- src/dag/seed-v6.x.ts (persona identifier source of truth)
- src/errors.ts lines 129-141 (UnknownBmadSkillError hint-override precedent)
- src/errors.ts lines 206-211 (ConfigError class — extended in Story 1.11)

### Agent Model Used

claude-opus-4-7[1m] (Opus 4.7 1M context) — bmad-dev-story persona.

### Debug Log References

- bun --version: 1.3.12
- bun test src/personas/: 24 pass, 0 fail, 184 expects across 2 files
- bun test src/errors.test.ts: 10 pass, 0 fail, 197 expects (registry CI gate, post-ConfigError extension — backwards compatible)
- bun test (full suite): 286 pass, 0 fail, 1091 expect() calls across 29 files (baseline 262 + 24 new persona tests = 286 — net +24)
- bunx biome ci .: 71 files checked, 0 errors after import-order fix on index.ts (DEFAULT_PERSONAS export then type ResolveInput/ResolveOptions then resolvePersona — Biome organize-imports order)
- bunx tsc --noEmit: exit 0, no output
- bun run check: exit 0

### Completion Notes

Implementation summary:

1. **`src/personas/defaults.ts` (Tier 3)** — hand-curated `Record<string, string | readonly string[]>` mirroring all 36 non-null-persona entries in `seedV6_x` (kebab-case identifiers from canonical set: `analyst`, `pm`, `architect`, `ux-designer`, `dev`, `tech-writer`, `tea`). Multi-persona entry `bmad-create-story: ["analyst", "pm"] as const`. Null-persona seed entries (`bmad-customize`, `bmad-shard-doc`, `bmad-help`, `bmad-advanced-elicitation`, `bmad-distillator`) deliberately OMITTED so Tier 4 / no-tier-resolves throw fires.

2. **`src/personas/resolve.ts` (4-tier resolver)** — `resolvePersona(input: ResolveInput): Promise<string | readonly string[]>`. Composes Tier 1 (`<pluginDir>/skills/<step>/SKILL.md` frontmatter `persona:`) → Tier 2 (`<projectRoot>/bmad-stepper.config.yaml` `personas:` block via hand-rolled YAML extractor mirroring Story 1.10's `overrides:` extractor) → Tier 3 (synchronous `DEFAULT_PERSONAS` lookup) → Tier 4 (`<projectRoot>/_bmad/<module>/config.yaml` triggers; module-to-persona mapping `bmm: pm, tea: tea, bmb: dev, cis: analyst`). On exhaustion, throws `ConfigError` with the verbatim AC-2 hint via the new `hintOverride?: string` constructor arg.

3. **`src/personas/index.ts` (barrel)** — public re-exports only: `DEFAULT_PERSONAS`, `resolvePersona`, types `ResolveInput`, `ResolveOptions`. Internal helpers (YAML extractor, frontmatter parser, per-tier helpers) stay private to `resolve.ts`. `ResolveOptions` is a type alias of `ResolveInput` for forward-compat naming flexibility.

4. **`src/errors.ts` (ConfigError extension)** — replicated Story 1.10's `UnknownBmadSkillError` per-instance hint-override pattern: optional 3rd ctor arg `hintOverride?: string`; private static `DEFAULT_HINT = "See bmad-stepper.config.yaml; run /bmad-next --doctor to validate the file against the schema."` (preserves Story 1.2 default verbatim); `actionableHint` converted from static readonly field to a getter returning `hintOverride ?? ConfigError.DEFAULT_HINT`. Backwards compatible: 1-arg + 2-arg constructor shapes preserved (errors.test.ts gate uses both — 10/10 still pass). Registry count unchanged at 16. Story 1.11 spec Task 3.7 explicitly authorises this single error-class extension.

5. **Tests** — 24 new passing tests across 2 files:
   - `src/personas/defaults.test.ts`: 5 tests, 80 expects. Asserts non-empty record; every non-null `seedV6_x[].persona` deep-equals `DEFAULT_PERSONAS[entry.name]`; every defaults key exists as a seed entry name; null-persona seed entries absent from defaults; identifiers belong to canonical kebab-case set.
   - `src/personas/resolve.test.ts`: 19 tests, 104 expects. Covers AC-1 (each tier in isolation, plus tier-precedence ladder Tier1>Tier2>Tier3>Tier4), AC-2 (no-tier-resolves throws ConfigError with verbatim hint, exit 2, structured detail), AC-3 (multi-persona array shape on bmad-create-story), graceful degradation (file absent, personas: block absent, _bmad/ absent), test escape hatches (configPath, dash-list, inline-array, skill.yaml fallback).

Repair iterations: ONE Biome import-order fix on `src/personas/index.ts` (organize-imports rule wanted DEFAULT_PERSONAS export, then type re-export, then runtime function re-export — adjusted post-first-run-of-biome-ci). No code-logic repairs; tests passed first run.

AR41 boundary verification: production files (`defaults.ts`, `resolve.ts`, `index.ts`) import only from `../errors.ts`, `../io/log.ts`, `node:fs`, `node:fs/promises`, `node:path`, and intra-module `./defaults.ts`. Zero imports from forbidden mid-tier siblings (`../bmad-detect/`, `../state/`, `../schemas/`, `../lock/`, `../migrations/`, `../snapshot/`, `../dag/`, `../commands/`), zero `node:child_process`, zero new external dependencies. Only `defaults.test.ts` imports `../dag/seed-v6.x.ts` for the TYPE-level mirroring assertion — explicit AR41 test-only cross-module exception per the story spec Task 5.1.

Quality gates (all exit 0):
- `bun test`: 286 pass / 0 fail / 1091 expect() calls / 29 files (baseline 262 → +24 net = 286)
- `bun run check`: exit 0 (biome ci . + bun test --pass-with-no-tests)
- `bunx biome ci .`: 71 files / 0 errors / 0 warnings
- `bunx tsc --noEmit`: exit 0 / no output

Deviations from story spec:
- (D1) **`src/errors.ts` extension** — Task 3.7 explicitly authorises the single ConfigError ctor extension; this is NOT an unauthorised mutation. Mirror of Story 1.10's UnknownBmadSkillError pattern. Registry stays at 16. Flagged for code-review acknowledgement.
- (D2) **Test count** — story spec Task 6.1 estimated "+13 new tests" (~258 total). Actual: +24 new (286 total). Higher granularity (split AC-1 into 11 tier-isolation + 3 tier-precedence + 3 graceful-degradation + 2 AC-2 fail-loud + multi-persona shape; split defaults into 5 mirroring assertions). All AC pass; no removed coverage.
- (D3) **`ResolvedPersona` type alias** — story spec planned `export type { ResolvedPersona }` but the resolver's return type is the inline shape `string | readonly string[]` — adding a `ResolvedPersona` alias would have been cosmetic. Instead exported `ResolveOptions` (alias of `ResolveInput`) for forward-compat naming flexibility per Task 1.2 barrel intent. Code-review may request renaming; cosmetic.
- (D4) **Tier 4 minimal pattern matcher** — per story Task 3.5 "the precise BMAD-module-trigger schema lands in Story 6.1; Story 1.11 implements a minimal pattern-matching layer that handles the common case". Implemented as a literal-match check against any non-blank line of the module config file (after stripping leading dash + quotes). Sufficient for v0.1; full schema is forward-dep.

Forward dependencies for code-review:
- Story 2.2 (dispatch spec generator) consumes `resolvePersona` output to populate the `PERSONA` section.
- Story 2.3 (sub-agent runner) inspects `Array.isArray(persona)` to choose single vs sequential dispatch.
- Story 6.1 (config-yaml schema loader) replaces the hand-rolled Tier 2 extractor with a Zod-validated loader (one-line refactor).
- Story 3.5 (`--persona` override) wires `parseNextArgs` to skip `resolvePersona()` when `--persona <name>` is supplied at the CLI; the resolver remains source of truth otherwise.

## Senior Developer Review (AI)

**Reviewer**: bmad-code-review persona (Opus 4.7 1M context)
**Review date**: 2026-05-01
**Outcome**: **APPROVE**

### Verdict

**APPROVE**. Story 1.11 ships a clean, deliberately disciplined 4-tier persona resolver that operationalises architecture §D13 (lines 631-642) verbatim. All three ACs are verified line-for-line against the implementation; quality gates exit zero (286 pass / 0 fail / 1091 expects across 29 files; biome 0 errors; tsc 0 errors); AR41 mid-tier boundary is honoured strictly (only foundational `../errors.ts`, `../io/log.ts`, Bun stdlib `Bun.file`, Node stdlib `node:fs`/`node:fs/promises`/`node:path`, and intra-module `./defaults.ts` imports in production files). The single deviation — extending `ConfigError` with an optional `hintOverride?: string` constructor arg — was explicitly authorised by the story spec (Task 3.7) and mirrors the Story 1.10 `UnknownBmadSkillError` precedent verbatim; registry stays at 16 codes; backward-compat with `errors.test.ts` registry CI gate confirmed (10/10 pass).

### Review Scope

- `_bmad-output/implementation-artifacts/1-11-persona-resolution.md` (PRIMARY)
- `src/personas/index.ts` (23 lines — barrel)
- `src/personas/defaults.ts` (94 lines — Tier 3 hand-curated map; 36 entries)
- `src/personas/resolve.ts` (586 lines — 4-tier resolver + helpers)
- `src/personas/resolve.test.ts` (329 lines — 19 integration tests)
- `src/personas/defaults.test.ts` (85 lines — 5 TYPE-coordination tests)
- `src/errors.ts` (extended `ConfigError` lines 206-239)
- `src/errors.test.ts` (registry CI gate: 10 pass / 197 expects)
- `src/dag/seed-v6.x.ts` (persona identifier source of truth)
- Quality gates: `bun test`, `bunx biome ci .`, `bunx tsc --noEmit`
- AR41 import boundary check via `grep -r "^import" src/personas/`

### AC Verification

**AC-1 (4-tier resolver order)** — VERIFIED. `resolve.ts` lines 545-569 compose Tier 1 (`tier1Frontmatter` lines 377-412 — reads `<pluginDir>/skills/<step>/SKILL.md` frontmatter, falls back to `skill.yaml`), Tier 2 (`tier2ProjectConfig` lines 421-445 — reads `<projectRoot>/bmad-stepper.config.yaml` `personas:` block via hand-rolled extractor mirroring Story 1.10's `overrides:` strategy), Tier 3 (`tier3Defaults` lines 450-452 — synchronous `DEFAULT_PERSONAS` lookup, zero IO), Tier 4 (`tier4ModuleConfig` lines 467-527 — walks `<bmadDir>/<module>/config.yaml` files, literal-line matcher, MODULE_PERSONAS implicit mapping `bmm: pm, tea: tea, bmb: dev, cis: analyst`). First-hit wins; later tiers are skipped. Tier order enforced by control flow (sequential `if (tierN !== null) return tierN;`). Tier-precedence ladder tests (resolve.test.ts lines 184-247) exercise Tier1>Tier2>Tier3>Tier4 explicitly.

**AC-2 (CONFIG_ERROR + verbatim hint)** — VERIFIED. Throw site at `resolve.ts` lines 572-584 instantiates `new ConfigError(message, detail, hintOverride)`. The hint string is computed by `ac2NoPersonaHint()` at lines 105-107 returning `` `Add a persona for ${stepName} in bmad-stepper.config.yaml under the personas: block.` `` — character-for-character match against AC-2. Registry confirms `code: "CONFIG_ERROR"`, `exitCode: 2`. Test `resolve.test.ts` lines 251-268 asserts `error.code === "CONFIG_ERROR"`, `error.exitCode === 2`, `error.actionableHint === "Add a persona for totally-unknown-step in bmad-stepper.config.yaml under the personas: block."` (verbatim).

**AC-3 (Multi-persona array — sequential dispatch contract)** — VERIFIED. Return type `string | readonly string[]` on lines 537-539 + `DEFAULT_PERSONAS["bmad-create-story"] = ["analyst", "pm"] as const` (defaults.ts line 61). Test `resolve.test.ts` lines 143-150 asserts `Array.isArray(result) === true` for `bmad-create-story`. JSDoc on `resolve.ts` lines 41-44 documents the sequential dispatch contract referencing architecture line 640 + PRD §17 (parallel deferred). Story spec File List §371-372 + Forward-dep notes §454-455 cite Story 2.3 sub-agent runner as the consumer.

### Architecture Compliance

- **AR33** (function & error semantics): `resolvePersona` is `async`; throws `ConfigError` (StepperError subclass) verbatim; no `console.*`, no `process.exit()`. The single `warn()` log on Tier-2-empty edge uses the foundational `src/io/log.ts` exporter. Confirmed.
- **AR41** (mid-tier boundary): production files (`index.ts`, `defaults.ts`, `resolve.ts`) import only from `../errors.ts`, `../io/log.ts`, `node:fs`, `node:fs/promises`, `node:path`, and intra-module `./defaults.ts`. Zero imports from forbidden mid-tier siblings (`../bmad-detect/`, `../state/`, `../schemas/`, `../lock/`, `../migrations/`, `../snapshot/`, `../dag/`, `../commands/`). Zero `node:child_process`. Zero new external deps. Test-only `defaults.test.ts:24` imports `seedV6_x` from `../dag/seed-v6.x.ts` — sanctioned by the AR41 cross-module test exception explicitly authorised in story spec Task 5.1.
- **§D13 lines 631-642**: 4-tier order, multi-persona sequential dispatch, fail-loud `CONFIG_ERROR` (exit 2) all verbatim translated to ACs and to code.
- **TYPE-level mirroring contract**: `defaults.test.ts` lines 33-50 asserts every non-null `seedV6_x[].persona` deep-equals `DEFAULT_PERSONAS[entry.name]`; lines 52-57 asserts every defaults key exists as a seed name; lines 59-65 asserts null-persona seed entries are absent from defaults; lines 67-83 asserts persona identifiers belong to the canonical kebab-case set (`analyst`, `pm`, `architect`, `ux-designer`, `dev`, `tech-writer`, `tea`).

### Quality Gates (Independent Verification)

- `bun test`: **286 pass / 0 fail / 1091 expect() calls / 29 files** (baseline 262 + 24 new persona tests = 286). Exit 0.
- `bunx biome ci .`: **71 files / 0 errors / 0 warnings**. Exit 0.
- `bunx tsc --noEmit`: **no output**. Exit 0.
- `bun test src/errors.test.ts`: **10 pass / 197 expects** (registry CI gate post-ConfigError extension; backward-compat preserved).

### AR41 Boundary Check

Production-file imports under `src/personas/`:
- `resolve.ts:47` — `node:fs` (existsSync) — Node stdlib, allowed.
- `resolve.ts:48` — `node:fs/promises` — Node stdlib, allowed.
- `resolve.ts:49` — `node:path` — Node stdlib, allowed.
- `resolve.ts:50` — `../errors.ts` — foundational, allowed.
- `resolve.ts:51` — `../io/log.ts` — foundational, allowed.
- `resolve.ts:52` — `./defaults.ts` — intra-module, allowed.
- `index.ts` (barrel) — re-exports from `./defaults.ts`, `./resolve.ts` — allowed.
- `defaults.ts` — zero imports (pure const declaration) — allowed.

Test-only AR41 cross-module exception:
- `defaults.test.ts:24` — `import { seedV6_x } from "../dag/seed-v6.x.ts";` — sanctioned by story spec Task 5.1 + architecture AR41 test-file exemption. The CI import-restriction graph excludes `*.test.ts`.

**No violations.**

### Deviation Adjudication

- **D1 — `src/errors.ts` `ConfigError` extension** (additive 3rd ctor arg `hintOverride?: string`; getter for `actionableHint`; private static `DEFAULT_HINT` preserves Story 1.2 verbatim). **Classification: (a) ACCEPTABLE.** Story spec Task 3.7 explicitly authorises this single extension. Mirrors Story 1.10 `UnknownBmadSkillError` precedent character-for-character. Backwards-compatible: `new Ctor("msg")` and `new Ctor("msg", "detail")` shapes preserved; `errors.test.ts` registry CI gate (10/10 pass) confirms. Registry stays at 16 codes — no new entry required. The pattern is now codified twice in the registry (`UnknownBmadSkillError`, `ConfigError`) and is the canonical template for any future per-instance hint override.
- **D2 — Test-only AR41 exception** (`defaults.test.ts` imports `seedV6_x`). **Classification: (a) ACCEPTABLE.** Sanctioned by story spec Task 5.1 + architecture AR41 test-file exemption. The TYPE-level mirroring assertion is the precise verification mechanism the spec calls for; without this import there's no runtime check that `defaults.ts` and `seed-v6.x.ts` stay in sync. Production-file boundary remains clean.
- **D3 — Tier 4 minimal pattern matcher** (literal-line match against module config files; precise BMAD-module-trigger schema deferred to Story 6.1). **Classification: (a) ACCEPTABLE.** Story spec Task 3.5 + Dev Notes §"Tier 4" + Forward-dep notes explicitly defer the precise schema to Story 6.1. The minimal matcher handles the common case (a `triggers:` dash-list naming step ids); JSDoc on `tier4ModuleConfig` (lines 454-466) cites the Story 6.1 forward dependency.
- **D4 — Test count** (story estimated +13 new tests; actual +24). **Classification: INFO-level only.** Higher granularity is a positive signal; no missing coverage. AC pass.
- **D5 — `ResolvedPersona` vs `ResolveOptions` type alias naming** (story spec planned `ResolvedPersona` export; implementation exports `ResolveOptions` instead). **Classification: nit.** Cosmetic; `ResolvedPersona` would have aliased the inline shape `string | readonly string[]`. The current `ResolveOptions = ResolveInput` alias provides forward-compat naming flexibility but doesn't surface the return-shape type alias. Consider adding `export type ResolvedPersona = string | readonly string[];` in a future polish PR for consistency with the spec's planned barrel surface; not blocking.

### Findings

- **No must-fix items.**
- **No should-fix items.**
- **1 nit (D5)**: Consider exporting `ResolvedPersona = string | readonly string[]` in `index.ts` for spec-planned barrel parity. Cosmetic.
- **1 info (D4)**: Test granularity exceeds story estimate (+24 vs +13 planned). Positive signal; no action needed.

### Action Items

- [ ] **NIT-1** (cosmetic, future polish): Add `export type ResolvedPersona = string | readonly string[];` to `src/personas/resolve.ts` and re-export from `src/personas/index.ts` for spec-planned barrel-surface parity. Non-blocking; can land in any subsequent persona-touching story.

### Notes for Future Stories

- **Story 2.2** (dispatch spec generator) consumes `resolvePersona` output to populate the `PERSONA` section of the sub-agent task spec. The `Array.isArray(persona)` check is the sentinel for multi-line `PERSONA: <names...>` rendering.
- **Story 2.3** (sub-agent runner) inspects `Array.isArray(persona)` to choose single vs sequential dispatch. v0.1 ships sequential-only per PRD §17; parallel deferred.
- **Story 2.4** (next runner orchestrator) is the composer that calls `detectBmadVersion()` from `src/bmad-detect/` first, then passes `pluginDir` to `resolvePersona({ stepName, pluginDir, projectRoot, ... })`. The mid-tier-to-mid-tier ban (AR41) is honoured because both modules are imported only in `src/commands/next/run.ts` (the runner-tier).
- **Story 6.1** (config-yaml schema loader) replaces the hand-rolled Tier 2 `parsePersonasYaml` extractor with a Zod-validated loader. Expected refactor: a one-line swap inside `tier2ProjectConfig`. The hand-rolled extractor's behaviour (returns `Map<string, string | readonly string[]>`; empty Map when block absent) is the contract Story 6.1 must preserve.
- **Story 3.5** (`--persona` override flag) wires `parseNextArgs` to skip `resolvePersona()` when `--persona <name>` is supplied; the resolver remains source of truth otherwise.
- **TYPE-level coordination contract maintenance**: any future change to `seedV6_x[].persona` MUST land in `src/personas/defaults.ts` in the same PR. The `defaults.test.ts` mirroring assertions (5 tests) are the runtime CI gate.

### Approval

Story 1.11 is **APPROVED**. Status flipped from `review` to `done`. Sprint status updated. Task record written.

## Change Log

- **2026-05-01**: Story file created (status `ready-for-dev`) — bmad-create-story persona. Drafted from epics.md §Story 1.11 lines 520-536, architecture.md §D13 lines 631-642, AR41 lines 1278-1304, prd.md FR12/FR34/FR40/NFR-R1/NFR-I2. Mirrors Story 1.10 template structure. Files planned: 5 new (`src/personas/{index,defaults,resolve}.ts` + 2 colocated tests); 1 modified (`src/errors.ts` `ConfigError` constructor extension per Story 1.10 precedent).
- **2026-05-01**: Implemented src/personas/ (3 source + 2 test files); 4-tier resolver; ConfigError +hintOverride extended (registry stays 16); status → review — bmad-dev-story persona.
- **2026-05-01**: Senior Developer Review appended; verdict APPROVE; 0 must-fix / 0 should-fix / 1 nit (cosmetic ResolvedPersona alias) / 1 info (test count +24 vs estimated +13); status → done — bmad-code-review persona.
