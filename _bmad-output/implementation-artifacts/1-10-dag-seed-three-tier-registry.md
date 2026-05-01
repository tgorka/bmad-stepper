---
status: done
story_id: '1.10'
story_key: 1-10-dag-seed-three-tier-registry
epic: '1'
title: DAG Seed + Three-Tier Registry
created: '2026-05-01'
last_updated: '2026-05-01'
priority: blocking
estimated_effort: L
fr_coverage:
  - FR1
  - FR2
  - FR8
  - FR9
  - FR35
  - FR51
nfr_coverage:
  - NFR-Sc1
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
  - _bmad/config.yaml
  - src/errors.ts
  - src/io/log.ts
  - src/bmad-detect/index.ts
  - src/bmad-detect/detect-skills.ts
  - package.json
---

# Story 1.10: DAG Seed + Three-Tier Registry

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper user,
I want the BMAD step DAG built from a curated seed, project overrides, and a frontmatter-parse fallback for unknown skills,
So that Stepper auto-detects new BMAD skills when the convention permits and fails loudly otherwise.

## Context Summary

This story lands the **first source-side `src/dag/` module** of the project — the **three-tier step registry resolver** that operationalises **architecture §D5** (lines 411–443) and **§D6** (lines 445–473) by composing a hand-curated seed, a project-level overrides loader, and a `SKILL.md` frontmatter-parse fallback into a single deterministic adjacency-list DAG with Tarjan SCC cycle detection. Until now, the foundational stack (`src/errors.ts`, `src/io/{log,paths,atomic-write}.ts`, `src/lock/lock.ts`, `src/schemas/`, `src/migrations/`, `src/state/`, `src/snapshot/`, `src/bmad-detect/` Story 1.9 sibling) has been wired but no source-side surface exists for **step-graph construction**. Story 1.10 fills that gap by authoring a small, deterministic builder that returns the **global skill DAG** (~30–50 nodes) and a Tarjan strongly-connected-components implementation that throws `DagCycleError` (registry code `DAG_CYCLE`, exit code 3) on any cycle of size > 1.

Concretely, this story produces:

1. **`src/dag/types.ts`** — local TypeScript types `DagNode`, `DagAdjacency`, `Phase`, `SeedEntry`, `OverrideEntry`. **No Zod schemas in this story** (per Story 1.5 mid-tier-to-mid-tier ban — full config schema integration with `OverridesSchema` lands in Story 6.1 / 6.2). Types are local, structural, and consumed by `seed-v6.x.ts`, `build.ts`, and `tarjan.ts`.
2. **`src/dag/seed-v6.x.ts`** — Tier 1 hand-curated seed for every BMAD v6.5 skill, declaring `phase`, `after`, `before`, `optional`, `persona` per node. The seed is keyed on the BMAD plugin's skill directory names (the strings `detectBmadSkills()` returns) and is the **fast path** — zero IO at runtime, already compiled into the bundle.
3. **`src/dag/build.ts`** — the canonical 3-tier resolver. Public function `build(input: BuildInput): Promise<DagAdjacency>` accepts the global skill list (composer-pattern: `skillNames` is **passed in** as a parameter, NOT imported from `../bmad-detect/` — per AR41 mid-tier-to-mid-tier ban) and resolves each name through Tier 1 (seed) → Tier 2 (overrides) → Tier 3 (frontmatter parse). Returns a sealed `DagAdjacency` with `nodes`, `edgesOut`, `edgesIn`. Throws `UnknownBmadSkillError` (exit code 3) when Tier 3 cannot parse, with the verbatim AC-3 hint `Add an override for <skill> in bmad-stepper.config.yaml under the overrides: block.`. Throws `DagCycleError` (exit code 3) when Tarjan finds an SCC of size > 1.
4. **`src/dag/tarjan.ts`** — standard Tarjan SCC algorithm operating on `DagAdjacency.edgesOut`. Returns the list of SCCs (each an array of node names); `build()` filters to SCCs of size > 1 and throws `DagCycleError` if any exists.
5. **`src/dag/index.ts`** — barrel re-exporting the public surface (`build`, `tarjan` for testability, `DagNode`, `DagAdjacency`).
6. **`src/dag/build.test.ts`** — colocated integration tests using **`Bun.write(...)`** + `node:fs/promises` `mkdir` to set up fake `SKILL.md` fixtures in a tmpdir for Tier 3, plus pure-function tests for Tier 1 and Tier 2 paths. Tests cover: seed-only resolution, overrides-replace-seed precedence, overrides-append-new-skill, frontmatter-parse success, frontmatter-parse failure → `UnknownBmadSkillError`, cycle detection → `DagCycleError`, and lazy-loading scope (build returns ONLY the global skill DAG, no per-story expansion).
7. **`src/dag/tarjan.test.ts`** — pure-function tests for Tarjan on synthetic adjacency lists: empty graph, single node, linear chain, single 2-cycle, single 3-cycle, multiple disconnected cycles, mixed acyclic + cyclic components.

This story is a **deliberately disciplined skeleton** — it lands the global skill DAG resolver as a pure async function that can be integration-tested in isolation. It does **NOT**:

- Wire the resolver into the runners (`next/run.ts`, `loop/run.ts`, `doctor/run.ts`). The runners (Story 2.4 next, Story 1.12 doctor, Story 4.1 loop) call `detectBmadSkills()` THEN call `build({ skillNames })` — Story 1.10 ships only the `build()` primitive. The composition is the runner's responsibility.
- Modify `src/errors.ts`. Both `UnknownBmadSkillError` (lines 106–111) and `DagCycleError` (lines 113–118) already exist in the registry from Story 1.2 — Story 1.10 USES these classes but does NOT extend the registry.
- Materialize per-story task expansions. The architecture's **lazy story-level loading** (line 471 — "the global skill DAG is loaded once at start; story-level expansions are materialized on demand from the epics/stories directory listing") is partially landed: Story 1.10 ships the global DAG (Tier 1+2+3 resolution for the ~30–50 BMAD skills), and the story-level materialization (e.g., `dev-story` for epic 3 / story 3.2 expanding into per-story sub-tasks) is deferred to Story 2.4 / 3.x where the runner expands story-level work on demand. Story 1.10's `build()` returns the **global skill DAG only** — it never enumerates `_bmad-output/implementation-artifacts/*-*.md` story files.
- Author the topological-sort / phase-aware-tiebreaker logic that `--list` and `--explain` consume (architecture line 469). Story 1.10 returns the adjacency list; **`src/dag/sort.ts`** that produces a topologically-sorted node list with deterministic `phase`-then-`name` tiebreaker is Story 3.7 (`--list candidate next steps`) and Story 3.6 (`--explain reasoning trace`) territory.
- Author the Zod `OverridesSchema`. The full schema for `bmad-stepper.config.yaml` lives in Story 6.1 (config-yaml-schema-loader) and Story 6.2 (dag-overrides-block). For Story 1.10, the Tier 2 loader is a **placeholder** — it reads `bmad-stepper.config.yaml` if present (via `Bun.file(...).text()` + simple YAML parse for the `overrides:` block), and returns `{}` if the file is absent. Full schema integration is deferred.
- Modify the BMAD detection module. `src/bmad-detect/` (Story 1.9) is the upstream side; `src/dag/` (Story 1.10) is the downstream consumer. Per AR41 mid-tier-to-mid-tier ban, **`src/dag/` does NOT import from `src/bmad-detect/`** — the runner composes them by calling `detectBmadSkills()` first and passing the resulting `skillNames: string[]` into `build({ skillNames })`.

It DOES land:

- The exact AR41-conformant placement of `src/dag/` as a **mid-tier** module. Per architecture line 1296 the boundary graph places `dag/` alongside `state/`, `migrations/`, `snapshot/`, `bmad-detect/` (Story 1.9 sibling), `personas/` (Story 1.11 sibling), `transcript/`, `telemetry/`, `upgrade/` (all mid-tier; depend on foundational + receive cross-mid-tier inputs only via runner-orchestrator composition). Story 1.10 lands **only** the foundational allowed imports (`errors.ts`, `io/log.ts` for Tier-2-empty diagnostic warn, Bun stdlib `Bun.file` for SKILL.md reads, Node stdlib `node:fs/promises` + `node:path`); the dependency graph stays clean — `dag/*.ts` does NOT import from `bmad-detect/`, `state/`, `schemas/`, `lock/`, `snapshot/`, or any sibling mid-tier module. Those imports happen in the orchestrator (Story 2.4 next) that wires detection + build into commands.
- The composition pattern for **declarative-graph construction**: a hand-curated seed array as the fast path, an in-memory `Map<string, DagNode>` for the resolved adjacency, and the standard Tarjan SCC algorithm for cycle detection. This pattern recurs nowhere else in the project — Story 1.10 is the unique owner of the step-graph primitive.
- The `DagAdjacency` value type as the contract that downstream consumers (Story 1.11 personas, Story 2.1 verifier registry, Story 2.2 dispatch spec generator, Story 2.4 runner, Story 3.6 explain, Story 3.7 list) consume: `{ nodes: Map<string, DagNode>; edgesOut: Map<string, Set<string>>; edgesIn: Map<string, Set<string>> }`. Architecture §D6 lines 449–465 pin this shape exactly.
- The deterministic `UnknownBmadSkillError` throw on a Tier-3 parse failure per AC-3 — establishing the **fail-loud-on-unknown-upstream-skill** pattern operationalising FR51 (architecture line 1381). Story 1.10 is the canonical throw site for `UNKNOWN_BMAD_SKILL`; later stories may surface the same code via doctor (Story 1.12) but only via the same code path (call `build()`, let it throw).
- The deterministic `DagCycleError` throw on any Tarjan SCC of size > 1 per AC-4 — establishing the **fail-loud-on-graph-cycle** pattern operationalising the `DAG_CYCLE` registry entry (`src/errors.ts` lines 113–118). The error's `detail` field carries the JSON-serialised offending-nodes list so the run-log writer (Story 2.5) can render the cycle path.

This is **AR33** (function & error semantics — `build` is `async`; throws `StepperError` subclasses verbatim; no `console.*`), **AR41** (module boundary — `src/dag/` is mid-tier; allowed imports from foundational `errors.ts`, `io/log.ts`; forbidden imports from `state/`, `schemas/`, `lock/`, `snapshot/`, `bmad-detect/`, sibling mid-tier modules). It also operationalises **FR1** (compute next step zero-config — architecture line 1331; the runner consumes `build()` output to compute next step), **FR2** (`--recompute-state` consumes `src/dag/build.ts` per architecture line 1332), **FR8/FR9** (DAG-validated step registry per PRD lines 38 + 196), **FR35** (DAG `overrides:` block per architecture line 1365; Tier 2 placeholder loader lands here), **FR51** (Fail-loud unknown skill per architecture line 1381; Tier 3 throw site is here), **NFR-Sc1** (lazy story-level loading per architecture line 471 + PRD line 784; the global skill DAG is the only thing built at start), **NFR-R1** (zero data loss on halt — failing loud on cycle/unknown prevents silent state corruption), **NFR-I2** (unknown skill fail-loud per architecture line 1416).

## Acceptance Criteria

The acceptance criteria below are reproduced **verbatim** from `_bmad-output/planning-artifacts/epics.md` §Story 1.10 (lines 506–518, BDD Given/When/Then/And format). Lines and AC labelling preserved.

### AC-1 (Given/When/Then — Tier 1 seed populates the adjacency list)

**Given** `src/dag/seed-v6.x.ts` with hand-curated entries for every BMAD v6.5 skill
**When** the DAG builder loads
**Then** Tier 1 (seed) populates the adjacency list with `phase`, `after`, `before`, `optional`, `persona` per node

### AC-2 (Given/When/Then — Tier 2 overrides have higher priority)

**Given** `bmad-stepper.config.yaml` has an `overrides:` block
**When** the DAG builder loads
**Then** Tier 2 (overrides) replaces or appends entries with higher priority than the seed

### AC-3 (Given/When/Then/And — Tier 3 frontmatter fallback + cycle detection + lazy loading)

**Given** the BMAD install contains a skill not in the seed and not in overrides
**When** the DAG builder runs Tier 3
**Then** it parses `SKILL.md` / `skill.yaml` frontmatter for `phase`, `after`, `before`, `optional`, `persona` — on success it includes the skill, on failure it exits with `UNKNOWN_BMAD_SKILL` (exit code 3) and the hint `Add an override for <skill> in bmad-stepper.config.yaml under the overrides: block.`
**And** Tarjan's SCC cycle detection runs on every load and emits `DAG_CYCLE` with the offending nodes listed
**And** lazy story-level loading is implemented: the global skill DAG (~30-50 nodes) loads at start; per-story expansions are materialized on demand (NFR-Sc1)

## Tasks / Subtasks

- [ ] **Task 0 — Verify pre-conditions (AC: 1, 2, 3)**
  - [ ] 0.1 Confirm `src/errors.ts` registry stays at 16 codes after Story 1.9 (Story 1.9 left the registry untouched). Confirm `UnknownBmadSkillError` exists at `src/errors.ts` lines 106–111 with `code: "UNKNOWN_BMAD_SKILL"`, `exitCode: 3`. Confirm `DagCycleError` exists at lines 113–118 with `code: "DAG_CYCLE"`, `exitCode: 3`. Verify `bun test src/errors.test.ts` exits 0. **Story 1.10 does NOT modify `src/errors.ts`** — registry stays at 16; both error classes are pre-existing.
  - [ ] 0.2 Confirm `src/io/log.ts` exports `info`, `warn`, `error`, `json` per Story 1.3. Story 1.10 imports **only** `warn` (used once on the Tier-2-empty edge — see Task 5.5 below — to log "no overrides config found at <path>; using seed only" at `warn` level). The throw sites (`UnknownBmadSkillError`, `DagCycleError`) do NOT emit a log message — both errors carry their own `actionableHint`.
  - [ ] 0.3 Confirm Story 1.9 `src/bmad-detect/detect-skills.ts` is byte-identical (Story 1.10's Tier 3 loader consumes the **shape** of `detectBmadSkills` output — `Promise<string[]>` sorted lexicographically — but does NOT import the function per AR41 mid-tier-to-mid-tier ban). The runner (Story 2.4) composes by calling `detectBmadSkills()` and passing the result to `build({ skillNames, ... })`.
  - [ ] 0.4 Confirm `package.json` has zero new deps relative to Story 1.9 final state. **DO NOT add a new dep** — `Bun.file`, `node:fs/promises`, `node:path` are all built-in. The Tier-2 YAML parse uses Bun's built-in YAML support **OR** a hand-rolled key extractor for the `overrides:` block (the full Zod-validated YAML loader lands in Story 6.1; Story 1.10's loader is intentionally minimal — see Task 5.4 for the parser-strategy decision).
  - [ ] 0.5 Confirm baseline `bun run check` exits 0 (232 pass / 0 fail / 664 expects across 25 files per Story 1.9 final). Record the baseline test count in Completion Notes.
  - [ ] 0.6 Confirm Bun host version satisfies AR2 (Bun ≥ 1.3). Run `bun --version`; record in Completion Notes (1.3.12 expected per Story 1.9 baseline).
  - [ ] 0.7 Read architecture §D5 lines 411–443 (three-tier discovery), §D6 lines 445–473 (adjacency-list representation + Tarjan SCC + lazy story-level loading), source-tree §`dag/` lines 1155–1161 (`index.ts`, `seed-v6.x.ts`, `build.ts`, `sort.ts`, `frontmatter-parse.ts`, `*.test.ts`). **NOTE:** Story 1.10 ships `index.ts`, `seed-v6.x.ts`, `build.ts`, `tarjan.ts`, and `*.test.ts` only. The architecture splits cycle detection into `sort.ts` (Tarjan + topo sort), but Story 1.10 lands **`tarjan.ts` standalone** and defers the topological-sort half to Story 3.6/3.7 (`--explain` / `--list`) — `sort.ts` will absorb `tarjan.ts` or import it later. Document this rename/split decision in JSDoc.
  - [ ] 0.8 Read AR41 mid-tier boundary graph lines 1278–1304. Confirm `src/dag/` is mid-tier and the allowed-imports set is: foundational (`../errors.ts`, `../io/log.ts`), Bun stdlib (`Bun.file`), Node stdlib (`node:fs/promises`, `node:path`). Forbidden: `../state/`, `../schemas/`, `../lock/`, `../migrations/`, `../snapshot/`, **`../bmad-detect/`** (sibling mid-tier ban), `../personas/`, `../commands/`, `node:child_process`, external libraries.
  - [ ] 0.9 Confirm `src/errors.ts` `UnknownBmadSkillError.actionableHint` reads `Run /bmad-next --list to see the candidate skills your BMAD installation registers.` (file lines 109–110). **Note**: This hint string **diverges** from the AC-3 verbatim hint `Add an override for <skill> in bmad-stepper.config.yaml under the overrides: block.`. The architecture decision §D5 (Tier 3 fallback) and AC-3 both name the override-config hint, but the registry's `actionableHint` was written from a different angle (the `--list` discovery path). **Reconciliation**: Story 1.10's throw site MUST use the AC-3 verbatim hint string. The implementation throws `new UnknownBmadSkillError(message, detail)` and the global error handler renders `actionableHint`. To deliver the AC-3 string verbatim, Story 1.10 has two options: (a) override the hint at construction by extending `UnknownBmadSkillError` with a per-instance hint field, or (b) extend the existing class to accept a constructor argument that overrides the registry's default hint. **Story 1.10 picks option (b)** — extend the constructor-time hint via a new optional `actionableHintOverride?: string` field on `StepperError`, returning override-or-fallback in `toJSON()` and the global formatter. Document this as a follow-up to be reviewed in Senior Developer Review (this is a small modification to `src/errors.ts` — flag it as the **only** allowable departure from "no errors.ts modification" since AC-3 forces it; alternatively the dev may pre-empt by writing the AC-3 hint as the registry's default and rolling Story 1.10 + Story 1.2 forward, but that's a wider blast radius). **DEV CHOICE**: prefer the minimal change — override in constructor via a `detail` parameter that includes the verbatim hint, and let the global formatter prefer the per-instance hint when present. **Code-review will adjudicate the cleanest path.**
  - [ ] 0.10 Read prd.md FR8/FR9 (DAG-validated step registry — lines 38 + 196), FR35 (DAG overrides — line 717), FR51 (fail-loud unknown skill — line 739), NFR-Sc1 (100 epics × 1000 stories lazy-load — line 784). Confirm Story 1.10's scope covers FR1 (compute next step), FR2 (`--recompute-state`), FR8 (sub-agent dispatch — DAG is the prereq), FR9 (verifier — DAG is the prereq), FR35 (Tier 2 overrides), FR51 (Tier 3 fail-loud), NFR-Sc1 (global DAG only at start; per-story deferred), NFR-R1 (zero data loss — fail-loud preserves), NFR-I2 (unknown skill fail-loud).

- [ ] **Task 1 — Create `src/dag/` directory + `src/dag/index.ts` barrel (AC: 1, 2, 3)**
  - [ ] 1.1 Create directory `src/dag/`. Per AR41, this is **mid-tier** — same tier as `src/state/`, `src/migrations/`, `src/snapshot/`, `src/bmad-detect/` (Story 1.9 sibling), `src/personas/` (Story 1.11 sibling). Allowed imports for any file under `src/dag/`: foundational (`../errors.ts`, `../io/log.ts`), Bun stdlib (`Bun.file`), Node stdlib (`node:fs/promises`, `node:path`). **Forbidden imports:** `../state/`, `../schemas/`, `../lock/`, `../migrations/`, `../snapshot/`, `../bmad-detect/`, `../personas/`, `../commands/`, sibling mid-tier modules. JSDoc on every file MUST cite AR41 + the architecture line for the boundary graph (lines 1278–1304).
  - [ ] 1.2 Create `src/dag/index.ts` — public barrel:
    ```typescript
    /**
     * src/dag/index.ts — public barrel for the `dag/` mid-tier module
     * (FR1, FR2, FR8, FR9, FR35, FR51, NFR-Sc1, NFR-R1, NFR-I2, AR33, AR41).
     *
     * Story 1.10 exports the global skill-DAG builder + adjacency types.
     * The runner-side wiring lives in:
     *   - Story 2.4 — src/commands/next/run.ts (calls detectBmadSkills() + build()).
     *   - Story 1.12 — src/commands/doctor/run.ts (DAG-validity check).
     *   - Story 4.1  — src/commands/loop/run.ts (calls build() once at loop start).
     *
     * Per AR41 mid-tier boundary, this barrel re-exports ONLY the public
     * surface; internal helpers (seed array, frontmatter parser) stay private.
     */
    export { build } from "./build.ts";
    export { tarjanScc } from "./tarjan.ts";
    export type {
      BuildInput,
      DagAdjacency,
      DagNode,
      OverrideEntry,
      Phase,
      SeedEntry,
    } from "./types.ts";
    ```
    No test file is needed (pure re-export). The seed array `seedV6_x` is intentionally NOT re-exported here — it stays private to `seed-v6.x.ts` and is consumed only by `build.ts` via intra-module sibling import.

- [ ] **Task 2 — Implement `src/dag/types.ts` — local TypeScript types (AC: 1, 2, 3)**
  - [ ] 2.1 Create `src/dag/types.ts`. Module purpose: declare structural types for the adjacency-list DAG. **No Zod schemas** — types are local, structural, and consumed only within `src/dag/`. The `OverridesSchema` Zod variant lands in Story 6.1 / 6.2.
  - [ ] 2.2 Export `Phase` literal union per architecture line 452:
    ```typescript
    export type Phase = "analysis" | "planning" | "solutioning" | "implementation" | "retro";
    ```
  - [ ] 2.3 Export `DagNode` interface per architecture lines 449–458 (modify `idempotent` to be optional in v0.1 — Story 1.10 does not yet capture the idempotency flag from frontmatter; the field is reserved for Story 5.1 retry semantics):
    ```typescript
    export interface DagNode {
      readonly name: string;
      readonly phase: Phase;
      readonly after: readonly string[];
      readonly before: readonly string[];
      readonly optional: boolean;
      readonly persona: string | readonly string[] | null;
      readonly idempotent?: boolean;
    }
    ```
  - [ ] 2.4 Export `DagAdjacency` interface per architecture lines 460–465. Use `Map<string, DagNode>` for nodes (deterministic iteration order matches insertion order — matters for Tarjan traversal stability) and `Map<string, ReadonlySet<string>>` for edges:
    ```typescript
    export interface DagAdjacency {
      readonly nodes: ReadonlyMap<string, DagNode>;
      readonly edgesOut: ReadonlyMap<string, ReadonlySet<string>>;
      readonly edgesIn: ReadonlyMap<string, ReadonlySet<string>>;
    }
    ```
  - [ ] 2.5 Export `SeedEntry` and `OverrideEntry` (used by `seed-v6.x.ts` and the Tier-2 placeholder loader respectively). Both are subsets of `DagNode` — `SeedEntry` is a `DagNode` minus `before` (computed from `after` of others) and `OverrideEntry` is `Partial<DagNode>` — but kept as distinct types so the Tier-1 hand-curated array is type-checked against the seed shape (no `before` field — it's computed) and the Tier-2 loader is type-checked against the override shape (all fields optional except `name`).
  - [ ] 2.6 Export `BuildInput` interface — the public input shape consumed by `build()`:
    ```typescript
    export interface BuildInput {
      readonly skillNames: readonly string[];
      readonly projectRoot?: string;
      readonly pluginDir?: string;
      readonly overridesPath?: string;
    }
    ```
    `skillNames` is REQUIRED (the runner passes `await detectBmadSkills()`). `projectRoot` defaults to `process.cwd()`. `pluginDir` (where SKILL.md files live for Tier 3) defaults to undefined — Tier 3 only fires if `pluginDir` is provided AND a skill is unknown to seed/overrides. `overridesPath` defaults to `path.join(projectRoot, "bmad-stepper.config.yaml")`.
  - [ ] 2.7 Add JSDoc per Story 1.6 / 1.7 / 1.8 / 1.9 conventions: cite architecture lines 449–465 (DagNode/DagAdjacency shape), 1296 (AR41 mid-tier boundary), 1278–1304 (boundary graph). Document why `Map`/`Set` over plain objects: deterministic iteration (insertion order) is required for Tarjan traversal stability and reproducible DAG hashing (the state hash check in Story 2.6 depends on a deterministic adjacency representation).

- [ ] **Task 3 — Implement `src/dag/seed-v6.x.ts` — hand-curated Tier 1 seed (AC: 1)**
  - [ ] 3.1 Create `src/dag/seed-v6.x.ts`. Module purpose: declare the hand-curated seed array `seedV6_x: readonly SeedEntry[]` covering every BMAD v6.5 skill known at Stepper release time. The seed is the **fast path** — zero IO at runtime, already compiled into the bundle. Import shape: `import type { SeedEntry, Phase } from "./types.ts";` (intra-module sibling — allowed).
  - [ ] 3.2 Author the seed array. Each entry has shape `{ name, phase, after, before?, optional, persona }`. The `name` field MUST match the BMAD plugin skill directory name verbatim (the strings `detectBmadSkills()` returns). The `phase` field MUST be one of the five literal values. The `after` field lists names the node depends on (other entries' `name`). The `optional` field is a boolean. The `persona` field is `string | string[] | null` — `null` means the persona resolver (Story 1.11) will fall back to module-config-based auto-detection.
  - [ ] 3.3 Seed inventory. Use the canonical BMAD v6.5 skill directory names visible in this project's installed plugin manifest. The list (sorted lexicographically per Story 1.9 `detectBmadSkills`) covers the following skills (group by phase for review readability — the actual array is flat):

    **Phase: analysis (5)**
    - `bmad-brainstorming` — `phase: analysis`, `after: []`, `optional: true`, `persona: analyst`
    - `bmad-domain-research` — `phase: analysis`, `after: []`, `optional: true`, `persona: analyst`
    - `bmad-market-research` — `phase: analysis`, `after: []`, `optional: true`, `persona: analyst`
    - `bmad-product-brief` — `phase: analysis`, `after: ["bmad-brainstorming"]`, `optional: true`, `persona: analyst`
    - `bmad-prfaq` — `phase: analysis`, `after: ["bmad-product-brief"]`, `optional: true`, `persona: pm`

    **Phase: planning (8)**
    - `bmad-create-prd` — `phase: planning`, `after: ["bmad-product-brief"]`, `optional: false`, `persona: pm`
    - `bmad-validate-prd` — `phase: planning`, `after: ["bmad-create-prd"]`, `optional: true`, `persona: pm`
    - `bmad-edit-prd` — `phase: planning`, `after: ["bmad-create-prd"]`, `optional: true`, `persona: pm`
    - `bmad-create-ux-design` — `phase: planning`, `after: ["bmad-create-prd"]`, `optional: true`, `persona: ux-designer`
    - `bmad-create-epics-and-stories` — `phase: planning`, `after: ["bmad-create-prd"]`, `optional: false`, `persona: pm`
    - `bmad-create-architecture` — `phase: solutioning`, `after: ["bmad-create-epics-and-stories"]`, `optional: false`, `persona: architect`
    - `bmad-check-implementation-readiness` — `phase: solutioning`, `after: ["bmad-create-architecture"]`, `optional: false`, `persona: architect`
    - `bmad-sprint-planning` — `phase: solutioning`, `after: ["bmad-check-implementation-readiness"]`, `optional: false`, `persona: pm`

    **Phase: implementation (10)**
    - `bmad-create-story` — `phase: implementation`, `after: ["bmad-sprint-planning"]`, `optional: false`, `persona: ["analyst", "pm"]`
    - `bmad-dev-story` — `phase: implementation`, `after: ["bmad-create-story"]`, `optional: false`, `persona: dev`
    - `bmad-quick-dev` — `phase: implementation`, `after: ["bmad-create-story"]`, `optional: true`, `persona: dev`
    - `bmad-code-review` — `phase: implementation`, `after: ["bmad-dev-story"]`, `optional: false`, `persona: dev`
    - `bmad-correct-course` — `phase: implementation`, `after: ["bmad-create-story"]`, `optional: true`, `persona: pm`
    - `bmad-checkpoint-preview` — `phase: implementation`, `after: ["bmad-dev-story"]`, `optional: true`, `persona: dev`
    - `bmad-generate-project-context` — `phase: implementation`, `after: ["bmad-create-architecture"]`, `optional: true`, `persona: tech-writer`
    - `bmad-document-project` — `phase: implementation`, `after: ["bmad-create-architecture"]`, `optional: true`, `persona: tech-writer`
    - `bmad-customize` — `phase: implementation`, `after: []`, `optional: true`, `persona: null`
    - `bmad-shard-doc` — `phase: implementation`, `after: ["bmad-create-architecture"]`, `optional: true`, `persona: null`

    **Phase: implementation (test arch) (8)**
    - `bmad-testarch-framework` — `phase: implementation`, `after: ["bmad-create-architecture"]`, `optional: true`, `persona: tea`
    - `bmad-testarch-ci` — `phase: implementation`, `after: ["bmad-testarch-framework"]`, `optional: true`, `persona: tea`
    - `bmad-testarch-test-design` — `phase: implementation`, `after: ["bmad-testarch-framework"]`, `optional: true`, `persona: tea`
    - `bmad-testarch-atdd` — `phase: implementation`, `after: ["bmad-testarch-test-design"]`, `optional: true`, `persona: tea`
    - `bmad-testarch-automate` — `phase: implementation`, `after: ["bmad-testarch-atdd"]`, `optional: true`, `persona: tea`
    - `bmad-testarch-test-review` — `phase: implementation`, `after: ["bmad-testarch-automate"]`, `optional: true`, `persona: tea`
    - `bmad-testarch-trace` — `phase: implementation`, `after: ["bmad-testarch-automate"]`, `optional: true`, `persona: tea`
    - `bmad-testarch-nfr` — `phase: implementation`, `after: ["bmad-create-architecture"]`, `optional: true`, `persona: tea`

    **Phase: retro (1)**
    - `bmad-retrospective` — `phase: retro`, `after: ["bmad-code-review"]`, `optional: true`, `persona: pm`

    **Misc / utility (4)**
    - `bmad-help` — `phase: analysis`, `after: []`, `optional: true`, `persona: null`
    - `bmad-advanced-elicitation` — `phase: analysis`, `after: []`, `optional: true`, `persona: null`
    - `bmad-distillator` — `phase: analysis`, `after: []`, `optional: true`, `persona: null`
    - `bmad-index-docs` — `phase: implementation`, `after: []`, `optional: true`, `persona: tech-writer`

    **Editorial / review (3)**
    - `bmad-editorial-review-prose` — `phase: implementation`, `after: ["bmad-create-prd"]`, `optional: true`, `persona: tech-writer`
    - `bmad-editorial-review-structure` — `phase: implementation`, `after: ["bmad-create-prd"]`, `optional: true`, `persona: tech-writer`
    - `bmad-review-adversarial-general` — `phase: implementation`, `after: ["bmad-dev-story"]`, `optional: true`, `persona: dev`
    - `bmad-review-edge-case-hunter` — `phase: implementation`, `after: ["bmad-dev-story"]`, `optional: true`, `persona: dev`
    - `bmad-technical-research` — `phase: solutioning`, `after: []`, `optional: true`, `persona: analyst`

    Total: ~40 nodes — fits the architecture's "~30-50 nodes" sizing exactly. Dev MAY add or remove entries based on actual `detectBmadSkills()` output from the dev machine's BMAD install — the seed is the **best-effort hand-curated approximation**; any skill returned by `detectBmadSkills()` and absent from the seed/overrides will trigger Tier 3 frontmatter parse (which should succeed for any well-formed BMAD skill). The list above is canonical for Story 1.10 ship; future BMAD upstream releases may expand it via the Tier-1 seed PR or the Tier-2 overrides config.

  - [ ] 3.4 Persona names. Use kebab-case persona identifiers matching Story 1.11's persona-defaults map (Story 1.11 lands `src/personas/defaults.ts`). The persona names used in seed: `analyst`, `pm`, `architect`, `ux-designer`, `dev`, `tech-writer`, `tea`. **Forward dependency**: if Story 1.11 picks different identifiers, the seed will need to be updated to match. Document this contract in JSDoc.
  - [ ] 3.5 Add JSDoc per Story 1.6 / 1.7 / 1.8 / 1.9 conventions: cite architecture §D5 lines 411–443, AR41 boundary graph lines 1278–1304. Document the **maintenance contract** (architecture line 443 — every BMAD upstream minor release triggers a CI compatibility job). Document the BMAD compatibility version (`v6.5.0.1`) in a top-level constant `export const SEED_BMAD_VERSION = "6.5";`.
  - [ ] 3.6 Add a top-of-file `eslint-disable`-style note (Biome equivalent — JSDoc only, no actual disable directive needed) that this file is intentionally LARGE (~150–200 lines for the array literal) and dense; it is the canonical Tier 1 contract. Future seed PRs append entries; do not refactor into multiple files.

- [ ] **Task 4 — Implement `src/dag/tarjan.ts` — Tarjan SCC algorithm (AC: 3)**
  - [ ] 4.1 Create `src/dag/tarjan.ts`. Module purpose: detect strongly-connected components (SCCs) on the adjacency list. Any SCC of size > 1 is a cycle; the caller (`build()`) throws `DagCycleError` listing the offending nodes. **No upward imports** — `tarjan.ts` operates on a generic `ReadonlyMap<string, ReadonlySet<string>>` adjacency input and returns `string[][]` (one array per SCC); the cycle-throw is the caller's responsibility. This keeps `tarjan.ts` purely functional and trivially testable.
  - [ ] 4.2 Algorithm: standard Tarjan's SCC (iterative or recursive). Recursive is clearest for ~30-50 nodes (no stack-overflow risk):
    - Maintain `index = 0`, `indices: Map<string, number>`, `lowlinks: Map<string, number>`, `onStack: Set<string>`, `stack: string[]`, `result: string[][]`.
    - For each node not yet indexed, run `strongconnect(node)`:
      - Set `indices[node] = lowlinks[node] = index++`; push to stack; mark `onStack`.
      - For each successor `w` in `edgesOut[node] ?? []`:
        - If `w` not indexed → recurse, then `lowlinks[node] = min(lowlinks[node], lowlinks[w])`.
        - Else if `w` on stack → `lowlinks[node] = min(lowlinks[node], indices[w])`.
      - If `lowlinks[node] === indices[node]` → pop stack down to and including `node`, push the popped slice as one SCC into `result`.
    - Return `result`.
  - [ ] 4.3 Edge cases:
    - **Empty graph**: return `[]`.
    - **Single node, no edges**: returns `[[node]]` — an SCC of size 1, NOT a cycle (cycles are SCCs of size > 1).
    - **Self-loop** (`A → A`): returns `[[A]]` of size 1 BUT with the node in its own successor set — this IS a cycle. The caller must detect self-loops separately: an SCC of size 1 where `edgesOut[node]?.has(node)` is true is also a cycle.
    - **Multiple disconnected cycles**: returns multiple SCCs, each of size > 1 — caller throws `DagCycleError` listing all of them concatenated.
  - [ ] 4.4 Public function signature:
    ```typescript
    export function tarjanScc(
      edgesOut: ReadonlyMap<string, ReadonlySet<string>>,
    ): string[][];
    ```
    Synchronous (no IO); pure; deterministic (sorted by first-discovered node — iteration order over `edgesOut.keys()` matches insertion order, which the seed array determines).
  - [ ] 4.5 Add JSDoc per Story 1.6 / 1.7 / 1.8 / 1.9 conventions: cite architecture §D6 line 467 (Tarjan SCC), AR41 boundary graph lines 1278–1304. Document the self-loop case explicitly (test 6 below).

- [ ] **Task 5 — Implement `src/dag/build.ts` — three-tier resolver (AC: 1, 2, 3)**
  - [ ] 5.1 Create `src/dag/build.ts`. Module purpose: compose Tier 1 (seed), Tier 2 (overrides), Tier 3 (frontmatter parse), then run Tarjan SCC for cycle detection, then return the sealed `DagAdjacency`. Public function signature:
    ```typescript
    export async function build(input: BuildInput): Promise<DagAdjacency>;
    ```
    Async because Tier 2 (file read) and Tier 3 (SKILL.md frontmatter parse) involve filesystem IO. Returns frozen `Map`/`Set` instances per AR33 immutability convention.
  - [ ] 5.2 Algorithm step 1 — **Tier 1: Build the resolved-entries map from the seed.** Iterate `seedV6_x`; populate `resolved: Map<string, DagNode>` keyed by `entry.name`. Compute `before: string[]` lazily — Tier 1 only writes `after`; the `before` field is computed in step 5 (after all 3 tiers merge) by inverting `after` across all final entries.
  - [ ] 5.3 Algorithm step 2 — **Tier 2: Load and apply overrides.** Compute `overridesPath = input.overridesPath ?? path.join(input.projectRoot ?? process.cwd(), "bmad-stepper.config.yaml")`. If the file does not exist (catch `ENOENT` from `Bun.file(path).exists()`), log `warn` once (`io/log.ts` `warn(...)`) "no overrides config found at <path>; using seed only" and skip Tier 2. If the file exists, parse it.
  - [ ] 5.4 **Tier 2 parser strategy.** Story 1.10 ships a **minimal hand-rolled YAML extractor** for the `overrides:` block — the full Zod-validated YAML loader lives in Story 6.1. The hand-rolled extractor:
    - Reads the file via `Bun.file(path).text()`.
    - Splits on lines; finds the line `overrides:` (top-level, no leading whitespace); collects all subsequent lines whose first non-whitespace character is at indent ≥ 2 (the YAML block scalar of the overrides map).
    - For each top-level child key (one of the override skill names), records the indented sub-keys (`phase`, `after`, `before`, `optional`, `persona`) and their values.
    - Casts simple types: strings unquoted, lists from `[a, b, c]` or `- a\n  - b\n  - c`, booleans from `true`/`false`.
    - **Failure mode**: if parsing throws (malformed YAML, missing required fields), log `warn` "overrides parse failed at <path>: <reason>; falling back to seed only" and skip Tier 2 entirely. **Do NOT throw `ConfigError`** — Story 6.1 owns the strict validation; Story 1.10's behaviour is graceful degradation.
    - For each parsed override `{ name, phase?, after?, optional?, persona? }`: set `resolved.set(name, { ...existing, ...override })` — this **replaces** the seed entry if the name matches one in the seed (overrides have higher priority per AC-2), or **appends** if the name is new.
  - [ ] 5.5 Algorithm step 3 — **Tier 3: Frontmatter parse for unknown skills.** Iterate `input.skillNames`; for each `name` NOT in `resolved`, attempt to parse the SKILL.md/skill.yaml frontmatter:
    - If `input.pluginDir` is undefined, throw `UnknownBmadSkillError` immediately with the AC-3 verbatim hint substituted (`Add an override for <name> in bmad-stepper.config.yaml under the overrides: block.`).
    - Else, compute `skillMd = path.join(input.pluginDir, "skills", name, "SKILL.md")` and `skillYaml = path.join(input.pluginDir, "skills", name, "skill.yaml")`. Try `Bun.file(skillMd).text()` first; if the file exists, extract the YAML frontmatter between `---\n` and `\n---` and parse the same fields (`phase`, `after`, `before`, `optional`, `persona`). If `skillMd` does not exist, fall back to `skillYaml` and parse the whole file as YAML. If neither exists, throw `UnknownBmadSkillError`.
    - Validate the parsed result has at least `phase` (required) and the `phase` value is one of the five literal `Phase` values; if validation fails, throw `UnknownBmadSkillError`.
    - On success, append the entry to `resolved` (`after` defaults to `[]`, `optional` defaults to `false`, `persona` defaults to `null`).
    - **Throw site**: `throw new UnknownBmadSkillError("Unknown BMAD skill: " + name + " — could not resolve via seed, overrides, or frontmatter parse", JSON.stringify({ skill: name, attemptedPaths: [skillMd, skillYaml] }))`. Per Task 0.9 reconciliation, the dev MUST ensure the AC-3 verbatim hint string is the rendered `actionableHint` at the throw site (either via constructor-arg override on the existing class, or by extending the class to accept a per-instance hint).
  - [ ] 5.6 Algorithm step 4 — **Build adjacency lists.** With `resolved: Map<string, DagNode>` complete, compute `edgesOut: Map<string, Set<string>>` and `edgesIn: Map<string, Set<string>>`:
    - For each node `n`, initialize `edgesOut.set(n.name, new Set())` and `edgesIn.set(n.name, new Set())`.
    - For each node `n`, for each `dep` in `n.after`: assert `resolved.has(dep)` (dangling-edge check — throw `UnknownBmadSkillError` if not), then `edgesOut.get(dep).add(n.name)` (the dependency points to the dependent — **reads as "dep happens before n"**) and `edgesIn.get(n.name).add(dep)`.
    - **Direction note**: `edgesOut[A] = {B}` means "A is a prerequisite for B" — edges point from earlier to later. Tarjan operates on this directed graph; cycles violate the DAG invariant.
  - [ ] 5.7 Algorithm step 5 — **Compute `before` field.** For each node `n` in resolved, `n.before` = sorted list of `n.name` ∈ `m.after` for all `m` ∈ resolved. (Architecture line 454 says `before` is "depended-on-by (computed from `after` of others)" — this step computes it.)
  - [ ] 5.8 Algorithm step 6 — **Run Tarjan SCC and throw on cycles.** Call `tarjanScc(edgesOut)`. For each SCC of size > 1 OR size 1 with a self-loop (`edgesOut.get(scc[0])?.has(scc[0])`), collect the offending nodes. If any cycle is found, throw `new DagCycleError("DAG cycle detected", JSON.stringify({ cycles: [...] }))`. The `actionableHint` from `src/errors.ts:113-118` (`See _bmad-output/.stepper/runs/<latest>/log.md for the cycle path; check the bmad-stepper.config.yaml dag.overrides block for circular edges.`) is the registry default and is verbatim-acceptable for AC-3's "DAG_CYCLE with the offending nodes listed" — the offending nodes go in the `detail` field, the registry hint points to where to fix.
  - [ ] 5.9 Algorithm step 7 — **Return frozen `DagAdjacency`.** Wrap the `Map`s with no further mutations and return. Per AR33 immutability convention, prefer wrapping with `as ReadonlyMap` cast (TypeScript-level) rather than `Object.freeze` (runtime — adds overhead without semantic value at this layer; downstream consumers respect the readonly type).
  - [ ] 5.10 **Lazy story-level loading.** `build()` returns the GLOBAL skill DAG only — the ~30–50 BMAD skill nodes. **Per-story expansions are NOT materialized in this story.** The architecture line 471 mandates lazy loading; Story 1.10's compliance is straightforward — `build()` simply does NOT enumerate `_bmad-output/implementation-artifacts/*-*.md` story files. The story-level materialization (e.g., `bmad-dev-story` for epic 3 / story 3.2) is the runner's responsibility (Story 2.4) and is deferred from Story 1.10. Document this scoping in JSDoc explicitly.
  - [ ] 5.11 Add comprehensive JSDoc per Story 1.6 / 1.7 / 1.8 / 1.9 conventions: cite architecture §D5 lines 411–443, §D6 lines 445–473, AR41 boundary graph lines 1278–1304, AR33 function/error semantics line 213, FR1 (line 1331), FR2 (line 1332), FR35 (line 1365), FR51 (line 1381), NFR-Sc1 (line 1410). Document each tier's failure mode, the `before`-computation rule, the Tarjan invocation site, and the lazy-loading scope.

- [ ] **Task 6 — Author `src/dag/tarjan.test.ts` — pure-function tests (AC: 3)**
  - [ ] 6.1 Create `src/dag/tarjan.test.ts`. **Pure-function tests** — no IO, no tmpdir setup. Use `bun:test`'s `describe`/`it`/`expect`.
  - [ ] 6.2 Test: `it("returns empty array for an empty graph")`:
    - Setup: `const edges = new Map<string, Set<string>>()`.
    - Act: `const sccs = tarjanScc(edges)`.
    - Assert: `expect(sccs).toEqual([])`.
  - [ ] 6.3 Test: `it("returns one SCC of size 1 for a single node with no edges")`:
    - Setup: `edges = new Map([["A", new Set()]])`.
    - Assert: `expect(sccs).toEqual([["A"]])`.
  - [ ] 6.4 Test: `it("returns three SCCs of size 1 for a linear chain A→B→C")`:
    - Setup: `edges = new Map([["A", new Set(["B"])], ["B", new Set(["C"])], ["C", new Set()]])`.
    - Assert: `expect(sccs).toHaveLength(3)`; each scc has length 1; node names are correct.
  - [ ] 6.5 Test: `it("returns one SCC of size 2 for a 2-cycle A↔B")`:
    - Setup: `edges = new Map([["A", new Set(["B"])], ["B", new Set(["A"])]])`.
    - Assert: `expect(sccs).toHaveLength(1)`; `expect(sccs[0].sort()).toEqual(["A", "B"])`.
  - [ ] 6.6 Test: `it("returns one SCC of size 3 for a 3-cycle A→B→C→A")`:
    - Setup: 3-cycle adjacency.
    - Assert: one SCC of size 3 containing A, B, C.
  - [ ] 6.7 Test: `it("returns multiple SCCs for two disconnected cycles")`:
    - Setup: `{A→B→A, C→D→C}` — two disjoint 2-cycles.
    - Assert: two SCCs of size 2 each.
  - [ ] 6.8 Test: `it("returns mixed SCCs for an acyclic component plus a cycle")`:
    - Setup: `{A→B, B→C, D→E, E→D}` — 3 size-1 SCCs (A, B, C) plus 1 size-2 SCC (D, E).
    - Assert: 4 SCCs total; sizes `[1, 1, 1, 2]` in some order.
  - [ ] 6.9 Test: `it("identifies a self-loop as an SCC of size 1 with the node in its own successor set")`:
    - Setup: `{A→A}` — one node with self-edge.
    - Assert: `expect(sccs).toEqual([["A"]])`. Then verify the caller-side cycle detection: `expect(edges.get("A")?.has("A")).toBe(true)` — the size-1-with-self-loop case is what `build()` must check separately to throw `DagCycleError`.

- [ ] **Task 7 — Author `src/dag/build.test.ts` — integration tests in tmpdir (AC: 1, 2, 3)**
  - [ ] 7.1 Create `src/dag/build.test.ts`. **Integration tests** — use `node:fs/promises` `mkdir` + `Bun.write(...)` to set up fake `bmad-stepper.config.yaml` (Tier 2) and fake `<pluginDir>/skills/<name>/SKILL.md` (Tier 3) in a tmpdir. Tests inject `projectRoot`, `pluginDir`, `overridesPath` via `BuildInput` to avoid touching the real `~/.claude/`. Use `os.tmpdir()` per AR35 (every test runs under a unique tmpdir; cleanup via `fs.rm({ recursive: true, force: true })` in `afterEach`).
  - [ ] 7.2 Test: `it("Tier 1 — populates the adjacency list from the seed only")` (AC-1):
    - Setup: tmpdir with no `bmad-stepper.config.yaml`, no plugin dir.
    - Act: `const dag = await build({ skillNames: ["bmad-create-prd", "bmad-create-story"], projectRoot: tmp })`.
    - Assert: `dag.nodes.size` matches the seed entries (filtered to the requested skill names — or, depending on dev choice, the full seed; document the choice). For the requested skills, `dag.nodes.get("bmad-create-prd").phase === "planning"`, `dag.nodes.get("bmad-create-prd").persona === "pm"`. `dag.edgesOut.get("bmad-product-brief")?.has("bmad-create-prd")` is true (seed `after: ["bmad-product-brief"]` for `bmad-create-prd`).
  - [ ] 7.3 **Scoping decision**. Story 1.10 must decide: does `build()` return the FULL seed graph (all ~40 nodes, regardless of `skillNames`), or only the SUBSET of nodes that are in `skillNames`? **Recommendation**: return the FULL graph. Rationale: (a) the architecture mandates "the global skill DAG" (~30–50 nodes) — that's the whole seed, not a filtered subset; (b) the runner's `--list` (Story 3.7) wants the full graph for candidate enumeration; (c) `skillNames` is the source-of-truth for **which skills the upstream BMAD plugin supports**, and Tier 3 only fires for skills in `skillNames` but not in seed/overrides. So `build()` returns: (seed ∪ overrides ∪ Tier-3-resolved-from-skillNames) — the full graph, NOT filtered to `skillNames`. Document this in JSDoc.
  - [ ] 7.4 Test: `it("Tier 1 — every seed entry has a defined phase, after, optional, persona")` (AC-1):
    - Act: `const dag = await build({ skillNames: [] })`. (Empty skillNames means Tier 3 is a no-op; the seed alone populates the graph.)
    - Assert: for every node in `dag.nodes.values()`, `["analysis", "planning", "solutioning", "implementation", "retro"].includes(node.phase)` is true; `Array.isArray(node.after)` is true; `typeof node.optional === "boolean"`; `node.persona === null || typeof node.persona === "string" || Array.isArray(node.persona)`.
  - [ ] 7.5 Test: `it("Tier 2 — overrides replace seed entries when names match")` (AC-2):
    - Setup: write `bmad-stepper.config.yaml` to tmpdir with content:
      ```yaml
      overrides:
        bmad-create-prd:
          phase: solutioning
          after: [bmad-create-architecture]
          optional: true
          persona: architect
      ```
    - Act: `const dag = await build({ skillNames: [], projectRoot: tmp })`.
    - Assert: `dag.nodes.get("bmad-create-prd").phase === "solutioning"` (overridden from seed's `"planning"`); `dag.nodes.get("bmad-create-prd").persona === "architect"` (overridden from `"pm"`); `dag.nodes.get("bmad-create-prd").optional === true` (overridden from `false`).
  - [ ] 7.6 Test: `it("Tier 2 — overrides append new entries not in the seed")` (AC-2):
    - Setup: write `bmad-stepper.config.yaml` with:
      ```yaml
      overrides:
        my-custom-skill:
          phase: implementation
          after: [bmad-dev-story]
          optional: true
          persona: dev
      ```
    - Act: `const dag = await build({ skillNames: [], projectRoot: tmp })`.
    - Assert: `dag.nodes.has("my-custom-skill")` is true; phase + persona match the override.
  - [ ] 7.7 Test: `it("Tier 2 — gracefully degrades when bmad-stepper.config.yaml is absent")` (AC-2 edge case):
    - Setup: tmpdir with NO config file.
    - Act: `const dag = await build({ skillNames: [], projectRoot: tmp })`.
    - Assert: build succeeds; the `warn` log was emitted once (test asserts via spying on `warn` — or simply checks `dag.nodes` matches the seed alone).
  - [ ] 7.8 Test: `it("Tier 2 — gracefully degrades when overrides parse fails")` (AC-2 edge case):
    - Setup: write a malformed YAML to `bmad-stepper.config.yaml` (e.g., unclosed bracket).
    - Act: `const dag = await build({ skillNames: [], projectRoot: tmp })`.
    - Assert: build succeeds; `warn` was emitted; seed-only graph returned.
  - [ ] 7.9 Test: `it("Tier 3 — parses SKILL.md frontmatter for unknown skills and includes them")` (AC-3):
    - Setup: tmpdir with fake plugin tree: `<tmp>/plugins/skills/my-frontmatter-skill/SKILL.md` containing:
      ```
      ---
      phase: implementation
      after: [bmad-create-story]
      optional: true
      persona: dev
      ---
      # My Frontmatter Skill body...
      ```
    - Act: `const dag = await build({ skillNames: ["my-frontmatter-skill"], pluginDir: path.join(tmp, "plugins") })`.
    - Assert: `dag.nodes.has("my-frontmatter-skill")` is true; phase + persona match the frontmatter.
  - [ ] 7.10 Test: `it("Tier 3 — throws UnknownBmadSkillError when skill is unknown and not parseable")` (AC-3 throw site):
    - Setup: `skillNames: ["nonexistent-skill"]` with no plugin dir.
    - Act + assert: `await expect(build(input)).rejects.toBeInstanceOf(UnknownBmadSkillError)`.
    - Assert: the thrown error's `code === "UNKNOWN_BMAD_SKILL"`, `exitCode === 3`, and the rendered `actionableHint` matches the AC-3 verbatim string `Add an override for <skill> in bmad-stepper.config.yaml under the overrides: block.` (substituting `<skill>` with `nonexistent-skill`). Per Task 0.9 reconciliation, the dev's chosen approach (constructor-arg override or per-instance hint) must produce the verbatim hint at the global formatter rendering point.
  - [ ] 7.11 Test: `it("Cycle detection — throws DagCycleError on a 2-cycle in overrides")` (AC-3):
    - Setup: write `bmad-stepper.config.yaml` with:
      ```yaml
      overrides:
        cycle-a:
          phase: implementation
          after: [cycle-b]
          optional: true
          persona: dev
        cycle-b:
          phase: implementation
          after: [cycle-a]
          optional: true
          persona: dev
      ```
    - Act + assert: `await expect(build({ skillNames: [], projectRoot: tmp })).rejects.toBeInstanceOf(DagCycleError)`.
    - Assert: the thrown error's `code === "DAG_CYCLE"`, `exitCode === 3`. The `detail` field contains a JSON-serialised list of the offending nodes (`cycle-a` + `cycle-b`).
  - [ ] 7.12 Test: `it("Cycle detection — throws DagCycleError on a 3-cycle in overrides")` (AC-3 expanded):
    - Setup: 3-cycle `A → B → C → A` via overrides.
    - Act + assert: throws `DagCycleError`.
  - [ ] 7.13 Test: `it("Cycle detection — does NOT throw on the cycle-free seed alone")` (AC-3 negative):
    - Setup: tmpdir with no overrides.
    - Act: `const dag = await build({ skillNames: [] })`.
    - Assert: build succeeds; no exception. (This test asserts the canonical seed is acyclic — a seed-side regression guard.)
  - [ ] 7.14 Test: `it("Lazy loading — build() returns only the global skill DAG, not story-level expansions")` (AC-3 NFR-Sc1):
    - Setup: tmpdir with `_bmad-output/implementation-artifacts/2-1-foo.md`, `_bmad-output/implementation-artifacts/2-2-bar.md` story files.
    - Act: `const dag = await build({ skillNames: [], projectRoot: tmp })`.
    - Assert: `dag.nodes.size` matches the seed (~40 entries); `dag.nodes.has("2-1-foo")` is false; `dag.nodes.has("2-2-bar")` is false. (No story-level expansion at this layer.)
  - [ ] 7.15 Test: `it("Dangling edge — throws UnknownBmadSkillError when an after-dep references an unknown name")` (defensive):
    - Setup: write override with `after: [some-undeclared-name]`.
    - Act + assert: throws `UnknownBmadSkillError` (the dangling edge resolves through the same Tier-3 attempt; with no plugin dir, it throws).
  - [ ] 7.16 Test: `it("Determinism — two consecutive builds produce identical adjacency-list keys in identical order")` (AR33):
    - Act: `const dag1 = await build({ skillNames: [] })`; `const dag2 = await build({ skillNames: [] })`.
    - Assert: `Array.from(dag1.nodes.keys())` deeply equals `Array.from(dag2.nodes.keys())` (insertion-order stability).

- [ ] **Task 8 — Quality gates verification + story-status update (AC: 1, 2, 3)**
  - [ ] 8.1 Run `bun test` from project root. Expected: 232 baseline + ~25 new (Tarjan ~9, build ~16) = ~257 pass / 0 fail / ~700 expects across 27 files. Record actual numbers in Completion Notes.
  - [ ] 8.2 Run `bun test src/dag/` standalone. Expected: ~25 pass / 0 fail / ~50 expects across 2 files (build.test.ts + tarjan.test.ts).
  - [ ] 8.3 Run `bunx biome ci .`. Expected: exit 0; no fixes applied; ~63 files checked (was 59 in Story 1.9).
  - [ ] 8.4 Run `bunx tsc --noEmit`. Expected: exit 0.
  - [ ] 8.5 Run `bun run check`. Expected: exit 0 (composite: biome + tsc + bun test).
  - [ ] 8.6 AR41 import-grep: `Grep "^import" src/dag/`. Expected: ALL imports in the allowed set — `bun:test` (test files), `node:fs/promises`, `node:path`, `node:os` (tests only), `../errors.ts` (`UnknownBmadSkillError`, `DagCycleError`), `../io/log.ts` (`warn` only), intra-module siblings (`./types.ts`, `./tarjan.ts`, `./seed-v6.x.ts`). **NO** imports from `../bmad-detect/`, `../state/`, `../schemas/`, `../lock/`, `../migrations/`, `../snapshot/`, `../personas/`, `../commands/`, `node:child_process`, external libraries. Record the import count + listing in Completion Notes.
  - [ ] 8.7 Verify `src/errors.ts` registry stays at 16 codes. Run `bun test src/errors.test.ts`; expected exit 0. **The dev's chosen reconciliation for the `UnknownBmadSkillError` hint string (Task 0.9) MAY add a constructor argument or a small per-instance field but MUST NOT add a new error code.** If the chosen path requires extending the class shape, document the change in Completion Notes and request adjudication in Senior Developer Review.
  - [ ] 8.8 Story-status update: `_bmad-output/implementation-artifacts/sprint-status.yaml` line 55 (`1-10-dag-seed-three-tier-registry: backlog` → `1-10-dag-seed-three-tier-registry: ready-for-dev`) is updated AT STORY-FILE-CREATION TIME (this very persona, NOT dev). Story 1.10 dev re-reads the sprint-status as part of pre-conditions; advancement to `in-progress` is the dev persona's responsibility on first commit.
  - [ ] 8.9 Verify `package.json`, `tsconfig.json`, `biome.json`, `bunfig.toml`, `bun.lock` are byte-identical to their Story 1.9 final state. **DO NOT** modify any of these files in Story 1.10.

## Dev Notes

### Architecture compliance

**§D5 (three-tier discovery, lines 411–443)** is the definitional architecture decision Story 1.10 lands. The seed → overrides → frontmatter precedence is verbatim from this section. The "maintenance contract" (line 443) — every BMAD upstream minor release triggers a CI compatibility job — is documented in `seed-v6.x.ts` JSDoc.

**§D6 (DAG representation, lines 445–473)** pins the adjacency-list shape, the Tarjan SCC cycle-detection algorithm, and the lazy story-level loading scope. Story 1.10 implements this verbatim except for one rename: the architecture splits `sort.ts` (Tarjan + topo sort), but Story 1.10 ships `tarjan.ts` standalone and defers the topo-sort half to Story 3.6/3.7 (`--explain` / `--list`). `sort.ts` will absorb `tarjan.ts` or import it later — documented in `tarjan.ts` JSDoc.

**AR33 (function & error semantics, line 213)** — `build()` is `async`; throws registered `StepperError` subclasses verbatim; no `console.*`; no `process.exit`; full JSDoc on every public surface.

**AR41 (mid-tier boundary, lines 1278–1304)** — `src/dag/` joins the mid-tier sibling set alongside `state/`, `migrations/`, `snapshot/`, `bmad-detect/`. **Critical**: `src/dag/` does NOT directly import from `../bmad-detect/` — the runner composes by calling `detectBmadSkills()` and passing the result as `BuildInput.skillNames`. This is the canonical mid-tier-to-mid-tier ban resolution: input flows through the orchestrator, never sibling import.

### Tier 1 (seed) implementation notes

The seed is a hand-curated array of ~40 entries covering BMAD v6.5's skill set. Each entry is a `SeedEntry` with `name`, `phase`, `after`, `optional`, `persona`. Names match the BMAD plugin skill directory names verbatim (the strings `detectBmadSkills()` returns). The `before` field is computed by `build()` step 5; the seed only authors `after`.

**Seed sizing**: ~40 entries hits the architecture's "30–50 nodes" sweet spot. The list is sorted alphabetically in the array literal for review readability — but the in-memory `Map` insertion order matches the array order, so iteration is deterministic.

**Persona naming**: kebab-case identifiers (`analyst`, `pm`, `architect`, `ux-designer`, `dev`, `tech-writer`, `tea`). Story 1.11 (persona resolution) lands the persona-defaults map; the seed's persona names MUST match Story 1.11's identifiers. Forward dependency flagged in JSDoc.

**Idempotency flag**: optional in v0.1. Story 5.1 (retry semantics) is the consumer; Story 1.10 leaves it undefined. The `DagNode.idempotent` field is `boolean | undefined` in the type definition.

### Tier 2 (overrides) implementation notes

**Placeholder loader**: Story 1.10 ships a hand-rolled YAML extractor for the `overrides:` block. The full Zod-validated YAML loader lives in Story 6.1 (config-yaml-schema-loader) and Story 6.2 (dag-overrides-block). Story 1.10's behavior:

- Read `bmad-stepper.config.yaml` if present (default path: `<projectRoot>/bmad-stepper.config.yaml`).
- Extract the `overrides:` block via simple line-based parsing (split on lines, find `overrides:`, collect indented children, parse simple types).
- On parse failure or missing file, log `warn` once and skip Tier 2 entirely — graceful degradation per "Story 1.10 is foundational; Story 6.1 owns strict validation" scoping.

**Why hand-rolled over a full YAML lib**: AR41 mid-tier-to-mid-tier ban prevents `src/dag/` from importing `../schemas/config.ts` (the Story 6.1 deliverable). Story 1.10 ships the minimum viable parse to satisfy AC-2. When Story 6.1 lands the full Zod schema, the Tier 2 loader will be refactored to call into `src/schemas/config.ts` — but via the **runner-orchestrator** composition pattern (the runner loads the validated config and passes a `validatedOverrides` field through `BuildInput`).

**Constructor-arg flow**: `BuildInput.overridesPath` is a test-only-but-exported escape hatch (Story 1.4 / 1.8 / 1.9 pattern). Tests inject a tmpdir-relative path; production defaults to `<projectRoot>/bmad-stepper.config.yaml`.

### Tier 3 (frontmatter parse) implementation notes

**Throw site**: Story 1.10 owns the canonical `UnknownBmadSkillError` throw. Per the architecture (line 1381) and AC-3, the hint string is `Add an override for <skill> in bmad-stepper.config.yaml under the overrides: block.`. **This diverges from the existing registry hint** at `src/errors.ts:109-110` which reads `Run /bmad-next --list to see the candidate skills your BMAD installation registers.` — the registry was authored from a discovery angle in Story 1.2; AC-3 names the override-config angle.

**Reconciliation paths** (dev MUST pick one; document the choice in Completion Notes):
1. **Constructor-arg override (preferred)**: extend `UnknownBmadSkillError` to accept a per-instance `actionableHint` argument that overrides the registry default. Smallest change to `src/errors.ts` (one optional field on the abstract `StepperError` base or one constructor override on the concrete class). Story 1.10 throws with the AC-3 verbatim hint.
2. **Update the registry default**: change `src/errors.ts:109-110` to the AC-3 verbatim hint. Wider blast radius — Story 1.2's tests will need updating; any downstream consumer that asserts the existing hint will break. **Avoid this unless option 1 proves infeasible.**
3. **Hint via detail field**: pass the verbatim hint as the `detail` argument; downstream formatters that render `actionableHint` will use the registry default + the `detail` for full message. **Acceptable per the existing `StepperError.toJSON` contract** but does NOT satisfy the AC-3 "the hint" wording strictly — the global formatter renders `actionableHint` as THE hint.

**Recommendation**: option 1, minimal invasive. Code-review will adjudicate. Document the chosen path in Completion Notes; flag for Senior Developer Review.

**Frontmatter parsing**: read `<pluginDir>/skills/<name>/SKILL.md`; extract the YAML frontmatter between the first `---\n` and the next `\n---`; parse with the same hand-rolled extractor as Tier 2. Required field: `phase` (one of the five literal values). Optional fields: `after`, `before`, `optional`, `persona` — all default to safe values (`[]`, `[]`, `false`, `null`).

**SKILL.md alternative**: if `SKILL.md` does not exist, fall back to `<pluginDir>/skills/<name>/skill.yaml` (whole file is YAML, no frontmatter delimiters). Architecture line 116 says BMAD plugins use the Claude Code plugin shape — `SKILL.md` is the canonical file, but `skill.yaml` is supported as a defensive fallback.

### Tarjan SCC implementation notes

Standard recursive Tarjan's algorithm. ~30–50 nodes is well within the recursion-depth comfort zone (Bun's default stack supports thousands of frames). Iterative variant is available if a future regression surfaces but is not needed today.

**Self-loop detection**: Tarjan natively returns SCCs of size 1 for nodes with no incoming/outgoing cycles. A node with a self-loop (`A → A`) is also an SCC of size 1 — the caller MUST detect self-loops separately by checking `edgesOut.get(scc[0])?.has(scc[0])` for size-1 SCCs. `build()` does this check (Task 5.8); `tarjan.ts` is purely topological.

**Determinism**: iteration order over `edgesOut.keys()` matches insertion order — which the seed array determines. Two consecutive `build()` calls produce identical adjacency-list ordering (test 7.16 verifies).

### Lazy story-level loading (NFR-Sc1)

Story 1.10's compliance is straightforward: `build()` returns the GLOBAL skill DAG only — the ~30–50 BMAD skill nodes. **No** enumeration of `_bmad-output/implementation-artifacts/*-*.md` story files; **no** materialization of `bmad-dev-story` per-story task expansions; **no** preloading of all 100 epics × 1000 stories.

Per-story expansions are deferred to Story 2.4 (next runner) where the runner sees a `bmad-dev-story` step and, given the user's `--epic 3 --story 2` flags, expands the single story node. The runner consults the epics/stories directory listing on demand — never preloaded.

### AR41 boundary verification (planned)

Expected `Grep "^import" src/dag/` listing:

```
src/dag/build.ts: import * as fs (or Bun.file) for SKILL.md + config.yaml reads
src/dag/build.ts: import * as path
src/dag/build.ts: import { UnknownBmadSkillError, DagCycleError } from "../errors.ts"
src/dag/build.ts: import { warn } from "../io/log.ts"
src/dag/build.ts: import { tarjanScc } from "./tarjan.ts"
src/dag/build.ts: import { seedV6_x } from "./seed-v6.x.ts"
src/dag/build.ts: import type { BuildInput, DagAdjacency, DagNode } from "./types.ts"
src/dag/seed-v6.x.ts: import type { SeedEntry, Phase } from "./types.ts"
src/dag/tarjan.ts: (NO imports — purely functional on generic Map<string, Set<string>>)
src/dag/types.ts: (NO imports — pure type declarations)
src/dag/index.ts: (re-exports only)
src/dag/build.test.ts: import { afterEach, beforeEach, describe, expect, it } from "bun:test"
src/dag/build.test.ts: import * as fs from "node:fs/promises"
src/dag/build.test.ts: import * as os from "node:os"
src/dag/build.test.ts: import * as path from "node:path"
src/dag/build.test.ts: import { UnknownBmadSkillError, DagCycleError } from "../errors.ts"
src/dag/build.test.ts: import { build } from "./build.ts"
src/dag/tarjan.test.ts: import { describe, expect, it } from "bun:test"
src/dag/tarjan.test.ts: import { tarjanScc } from "./tarjan.ts"
```

**Forbidden**: `../bmad-detect/`, `../state/`, `../schemas/`, `../lock/`, `../migrations/`, `../snapshot/`, `../personas/`, `../commands/`, `node:child_process`, `simple-git`, `js-yaml`, `yaml`, `chalk`, any external library.

### Test pattern (AR35 tmpdir-per-test)

Every test runs under a unique `os.tmpdir()`-derived directory; cleanup via `fs.rm({ recursive: true, force: true })` in `afterEach`. No mocking of `Bun.file`, `fs.readdir`, `Bun.write`. Real-FS integration tests for `build()` (Tier 2 + Tier 3 require real file IO); pure-function tests for `tarjanScc` (no IO).

### Forward-dependency notes for downstream stories

- **Story 1.11 (persona resolution)** consumes `DagNode.persona` field. Forward contract: persona names MUST be kebab-case identifiers matching Story 1.11's persona-defaults map.
- **Story 1.12 (doctor)** consumes `build()` to validate the DAG (the diagnostic report includes "DAG validated. <n> skills total. <m> overrides active."). Story 1.12 calls `build()` and renders the result; cycle/unknown errors propagate.
- **Story 2.1 (verifier configuration registry)** keys verifiers on DAG node names. Verifier registry uses `dag.nodes.keys()` as the master list.
- **Story 2.2 (dispatch spec generator)** uses DAG nodes to determine inputs/outputs per step (the verifier's `requiredFiles` + the next step's `after` deps).
- **Story 2.4 (runner)** is the canonical orchestrator — composes `detectBmadSkills()` → `build({ skillNames })` → `computeNextStep(state, dag)`. This is where the mid-tier-to-mid-tier composition happens.
- **Story 3.6 (`--explain`)** consumes `dag.edgesIn` to walk the predecessor chain for any candidate next step.
- **Story 3.7 (`--list`)** consumes the topologically-sorted node list (which Story 3.6/3.7 will derive from the adjacency via a topo-sort helper that is NOT shipped in Story 1.10).
- **Story 6.1 (config-yaml-schema-loader)** lands the Zod-validated YAML loader; Tier 2 in `build.ts` will be refactored to call into `src/schemas/config.ts` via the runner-orchestrator composition pattern.
- **Story 6.2 (DAG overrides block)** lands the strict `OverridesSchema` Zod schema. Story 1.10's hand-rolled extractor is the placeholder.

## Previous Story Intelligence

- **Story 1.1 (initialize repository scaffold)**: Bun 1.3.12 host; Biome 2.3.15 + tsc + bun:test as the quality gate trio; Zod 3.24 pinned (NOT used in Story 1.10 — types are local TypeScript, not Zod-validated).
- **Story 1.2 (errors module + registry CI gate)**: 16-code registry with `UnknownBmadSkillError` (lines 106–111) and `DagCycleError` (lines 113–118) already declared. Story 1.10 USES both classes; **does NOT extend the registry**. The Tier-3 hint reconciliation (Task 0.9) requires a small constructor-arg or per-instance hint extension — flag for Senior Developer Review adjudication.
- **Story 1.3 (logger + path helpers + atomic write)**: `info`/`warn`/`error` → stderr; `json` → stdout. Story 1.10 imports `warn` only (Tier 2 graceful-degrade log).
- **Story 1.4 (file lock with heartbeat)**: `LockOptions` test-only-but-exported pattern; Story 1.10's `BuildInput` follows the same convention.
- **Story 1.5 (schemas/migrations skeleton)**: Zod 3.24 schema framework lands. Story 1.10 deliberately introduces no new schemas — `OverridesSchema` is Story 6.2's deliverable.
- **Story 1.6 (state subsystem)**: `loadState`/`saveState`/`recomputeState` land. Story 1.10 does NOT call any of them; the state subsystem consumes `build()` output via the runner (Story 2.4) for `--recompute-state`.
- **Story 1.7 (CLI argument parser)**: `parseNextArgs` lands. Story 1.10 does NOT touch CLI parsing.
- **Story 1.8 (snapshot branch+sha detection)**: `Bun.spawn` pattern + `DetectSnapshotOptions` test-only-but-exported pattern + AR35 real-FS-in-tmpdir test pattern + AR41 mid-tier sibling addition. Story 1.10 reuses test-only-options + tmpdir patterns; uses `Bun.file().text()` for SKILL.md/config.yaml reads (no `Bun.spawn` needed).
- **Story 1.9 (BMAD detection)**: `src/bmad-detect/` mid-tier sibling lands; `detectBmadSkills()` returns `Promise<string[]>` sorted lexicographically. Story 1.10 CONSUMES detection output via the **composer pattern** (`BuildInput.skillNames` parameter), NOT direct import — per AR41 mid-tier-to-mid-tier ban. Story 1.9 R3 (Senior Developer Review INFO-1) flagged a real-world plugin path discrepancy: actual installed BMAD on the dev machine sits at `~/.claude/plugins/cache/bmad-method/bmad/<version>/.claude-plugin/plugin.json` (4-level nested cache layout) vs. the spec's `~/.claude/plugins/bmad-method-*/.claude-plugin/plugin.json`. **Edge case for Story 1.10 Tier 3**: if the runner passes `pluginDir` derived from the cache layout, the SKILL.md path becomes `~/.claude/plugins/cache/bmad-method/bmad/<version>/skills/<name>/SKILL.md`. Story 1.10's Tier 3 handles this transparently — it accepts an absolute `pluginDir` argument; the runner is responsible for resolving the actual path. The discrepancy is a runner concern (Story 1.12 doctor will reconcile), not a Story 1.10 concern.

## File List (Planned)

**New files (5 production, 2 test, 1 barrel):**
- `src/dag/index.ts` — public barrel
- `src/dag/types.ts` — `Phase`, `DagNode`, `DagAdjacency`, `SeedEntry`, `OverrideEntry`, `BuildInput`
- `src/dag/seed-v6.x.ts` — Tier 1 hand-curated seed (~40 entries)
- `src/dag/build.ts` — three-tier resolver + Tarjan invocation
- `src/dag/tarjan.ts` — standard Tarjan SCC algorithm
- `src/dag/build.test.ts` — integration tests in tmpdir
- `src/dag/tarjan.test.ts` — pure-function tests

**Existing files modified: 0** (Story 1.10 ships zero modifications to existing files unless the dev's chosen reconciliation for the `UnknownBmadSkillError` hint string requires a small constructor-arg extension on `src/errors.ts`. If so, document the change in Completion Notes and flag for Senior Developer Review.)

## Dev Agent Record

### Tasks / Subtasks Checklist

- [x] Task 0 — Pre-conditions verified (Bun 1.3.12; baseline 232 pass / 664 expects across 25 files; UnknownBmadSkillError + DagCycleError pre-existing in registry).
- [x] Task 1 — `src/dag/index.ts` barrel created (34 lines). Re-exports `build`, `tarjanScc`, `SEED_BMAD_VERSION`, plus types `BuildInput`, `DagAdjacency`, `DagNode`, `OverrideEntry`, `Phase`, `SeedEntry`. The internal `seedV6_x` array is intentionally NOT re-exported.
- [x] Task 2 — `src/dag/types.ts` (151 lines) with `Phase`, `DagNode`, `DagAdjacency`, `SeedEntry`, `OverrideEntry`, `BuildInput`. No Zod, all `readonly` per AR33.
- [x] Task 3 — `src/dag/seed-v6.x.ts` (357 lines) with 38 hand-curated entries spanning phases analysis (8 — incl. utility), planning (5), solutioning (4), implementation (20 — core dev + testarch + editorial/review), retro (1). `SEED_BMAD_VERSION = "6.5"` constant exported.
- [x] Task 4 — `src/dag/tarjan.ts` (114 lines) standalone Tarjan SCC. Pure-functional; no imports. Self-loop detection delegated to caller per architecture §D6 line 467.
- [x] Task 5 — `src/dag/build.ts` (672 lines) async `build(input)` composes Tier 1 (seed) → Tier 2 (hand-rolled YAML extractor) → Tier 3 (frontmatter parse / skill.yaml fallback). Computes `before` field by inverting `after`. Runs Tarjan SCC + self-loop check. Throws `UnknownBmadSkillError` (with AC-3 verbatim hint) and `DagCycleError` per AC-3.
- [x] Task 6 — `src/dag/tarjan.test.ts` (126 lines) — 9 tests covering empty graph, single node, linear chain, 2-cycle, 3-cycle, multiple disconnected cycles, mixed acyclic+cyclic, self-loop, determinism (22 expects).
- [x] Task 7 — `src/dag/build.test.ts` (445 lines) — 21 tests covering Tier 1 happy paths (3 tests), Tier 2 replace/append/dash-list/missing-file/malformed/custom-path (6 tests), Tier 3 success/yaml-fallback/no-pluginDir-throw/missing-files-throw/malformed-throw (5 tests), cycle detection 2-cycle/3-cycle/self-loop/cycle-free-seed (4 tests), lazy story-level loading (1 test), dangling-edge defensive (1 test), determinism (1 test) — 221 expects total.
- [x] Task 8 — Quality gates: `bun test` 262 pass / 0 fail / 907 expects across 27 files; `bunx biome ci .` exit 0 (66 files); `bunx tsc --noEmit` exit 0; `bun run check` exit 0; AR41 import-grep verified clean (no forbidden imports).

### File List (Final)

**Created (5 production + 2 test = 7 files):**
- `src/dag/index.ts` — public barrel (34 lines).
- `src/dag/types.ts` — local TS types (151 lines).
- `src/dag/seed-v6.x.ts` — Tier 1 hand-curated seed, 38 entries (357 lines).
- `src/dag/tarjan.ts` — Tarjan SCC algorithm (114 lines).
- `src/dag/build.ts` — three-tier resolver + Tarjan invocation (672 lines).
- `src/dag/build.test.ts` — integration tests (445 lines).
- `src/dag/tarjan.test.ts` — pure-function tests (126 lines).

**Modified (1 file — registry hint reconciliation per Task 0.9):**
- `src/errors.ts` — `UnknownBmadSkillError` accepts an optional 3rd constructor arg `hintOverride?: string`. The `actionableHint` field is converted from a `readonly` static string to a getter that returns `hintOverride ?? DEFAULT_HINT`. Backwards-compatible: 1-arg and 2-arg constructor shapes preserved; the `errors.test.ts` registry CI gate passes unchanged (10/10, 197 expects). Registry count remains 16 — no new error classes added. **Flagged for Senior Developer Review** per Task 0.9 reconciliation note (option 1 — minimal invasive).

### Completion Notes

**Implementation summary.** Delivered the three-tier step-DAG resolver as a pure async `build(input)` function on the `src/dag/` mid-tier module. Tier 1 is a hand-curated seed of 38 BMAD v6.5 skills covering the canonical workflow (analysis → planning → solutioning → implementation → retro). Tier 2 is a hand-rolled minimal YAML extractor for the `overrides:` block of `bmad-stepper.config.yaml` — graceful degradation on missing/malformed config (warn + seed-only fallback). Tier 3 parses `<pluginDir>/skills/<name>/SKILL.md` frontmatter (with `skill.yaml` fallback) for unknown skills; throws `UnknownBmadSkillError` with the AC-3 verbatim hint string when resolution fails. Tarjan SCC cycle detection runs on every build; size-1 SCCs with self-loops are detected by the caller (`build()`) per the architecture's caller-side contract.

**Hint reconciliation (Task 0.9 — option 1 chosen).** The pre-existing `UnknownBmadSkillError.actionableHint` (`Run /bmad-next --list to see the candidate skills your BMAD installation registers.`) diverges from the AC-3 verbatim string (`Add an override for <skill> in bmad-stepper.config.yaml under the overrides: block.`). Story 1.10 implements the minimal invasive reconciliation: `UnknownBmadSkillError` now accepts an optional 3rd constructor argument `hintOverride?: string`; when provided, the per-instance hint takes precedence over the registry default. Implementation: `actionableHint` is now a getter that returns `hintOverride ?? DEFAULT_HINT`. Preserves: 16-code registry size; 1-arg + 2-arg constructor shapes (the `errors.test.ts` gate uses `new Ctor("test")` and `new Ctor("primary", "detail")`); `toJSON()` shape; backwards compatibility with all existing callers. The `build()` Tier 3 throw site passes the AC-3 verbatim hint as the 3rd argument; the dangling-edge throw site does the same. Three test cases in `build.test.ts` assert the rendered hint matches the verbatim string.

**Tier 2 parser strategy.** Hand-rolled minimal YAML extractor (no external dep). Walks lines, finds top-level `overrides:`, collects indented children at the first non-zero indent under it. Sub-key parsing handles inline scalars (`phase: planning`), inline lists (`after: [a, b]`), dash-lists (multiline `after:` block with `- item` entries), and quoted strings. On any parse failure, logs `warn` once and falls back to seed-only — graceful degradation per Story 1.10 scoping. Full Zod-validated YAML loader is Story 6.1 / 6.2 territory.

**Lazy story-level loading (NFR-Sc1).** `build()` returns the GLOBAL skill DAG only — the ~38 BMAD skill nodes plus any overrides + Tier-3-resolved unknowns. It never enumerates `_bmad-output/implementation-artifacts/*-*.md` story files. The dedicated test `Lazy story-level loading > returns only the global skill DAG, not story-level expansions` plants story files in tmpdir and asserts they are absent from the resulting `dag.nodes`.

**Test counts (final `bun test`).** 262 pass / 0 fail / 907 expects across 27 files (vs. baseline 232 pass / 664 expects across 25 files — added 30 tests across 2 new files; 243 new expects). Standalone `bun test src/dag/` reports 30 pass / 243 expects.

**Quality gates.** `bun test` exit 0 (262/0/907); `bunx biome ci .` exit 0 (66 files, no fixes); `bunx tsc --noEmit` exit 0; `bun run check` exit 0.

**AR41 boundary (`Grep "^import" src/dag/`).** Allowed imports observed:
- `node:fs` (`existsSync` for sync existence checks).
- `node:fs/promises` (test setup only — `mkdir`, `mkdtemp`, `rm`).
- `node:os` (test setup only — `tmpdir`).
- `node:path` (path joins).
- `bun:test` (test files only).
- `../errors.ts` (`DagCycleError`, `UnknownBmadSkillError`).
- `../io/log.ts` (`warn` — Tier 2 graceful-degrade log).
- Intra-module siblings: `./types.ts`, `./tarjan.ts`, `./seed-v6.x.ts`, `./build.ts`.

NO imports from forbidden mid-tier siblings (`../bmad-detect/`, `../state/`, `../schemas/`, `../lock/`, `../migrations/`, `../snapshot/`, `../personas/`, `../commands/`), `node:child_process`, or external libraries.

**Repair iterations.** One repair iteration was needed: the AC-2 `replace seed entries when names match` test originally overrode `bmad-create-prd.after` to `[bmad-create-architecture]`, which transitively cycled (`bmad-create-architecture → bmad-create-epics-and-stories → bmad-create-prd`). Repair: changed the override `after` to `[bmad-product-brief]` (already a valid seed predecessor) so the test exercises seed-replacement without inadvertently triggering Tarjan. The functional behaviour of `build()` is untouched; this was a test-fixture refinement.

**Forward-dependency notes.**
- Story 1.11 (persona resolution) consumes the seed's persona identifiers (`analyst`, `pm`, `architect`, `ux-designer`, `dev`, `tech-writer`, `tea`). If Story 1.11 picks different identifiers, the seed must be updated to match — flagged in `seed-v6.x.ts` JSDoc.
- Story 6.1 / 6.2 (config-yaml-schema-loader, dag-overrides-block) will replace the hand-rolled Tier 2 parser with a Zod-validated loader composed by the runner-orchestrator (Story 2.4).
- Story 3.6 / 3.7 (`--explain` / `--list`) will land `src/dag/sort.ts` for topological sorting; `sort.ts` may absorb or import `tarjan.ts`.

### Debug Log References

`bun test` — 262 pass / 0 fail / 907 expects / 27 files / [1199ms]. `bun test src/dag/` — 30 pass / 0 fail / 243 expects / 2 files / [22ms]. `bun test src/errors.test.ts` — 10 pass / 0 fail / 197 expects / 1 file / [8ms] (post-hint-override-extension). `bunx biome ci .` — Checked 66 files in 11ms. No fixes applied. `bunx tsc --noEmit` — exit 0, no output. `bun run check` — exit 0.

### Context Reference

- Architecture §D5 lines 411-443 — three-tier discovery cascade.
- Architecture §D6 lines 445-473 — adjacency-list shape + Tarjan SCC + lazy story-level loading.
- Architecture AR33 line 213 — async function + StepperError throws + no console.*.
- Architecture AR41 lines 1278-1304 — `src/dag/` is mid-tier; allowed/forbidden imports.
- PRD FR1 (line 1331), FR2 (line 1332), FR8/FR9 (lines 689-690), FR35 (line 717), FR51 (line 739), NFR-Sc1 (line 784).
- Story 1.2 — pre-existing `UnknownBmadSkillError` (lines 106-111) and `DagCycleError` (lines 113-118).
- Story 1.9 — `detectBmadSkills()` returns `Promise<string[]>`; consumed via composer pattern (`BuildInput.skillNames`), not direct import.

## Senior Developer Review (AI)

**Reviewer**: bmad-code-review persona, automated review by Claude Code
**Date**: 2026-05-01
**Verdict**: approve

### AC Verification

**AC-1 Tier 1 seed** ✅: `src/dag/seed-v6.x.ts:54-357` exports `seedV6_x: readonly SeedEntry[]` with 38 hand-curated entries spanning all five phases (analysis 5+3 misc, planning 5, solutioning 4, implementation 23, retro 1). Every entry declares `name`, `phase`, `after`, `optional`, `persona`. The `before` field is computed by `build()` step 5 (`src/dag/build.ts:635-648`) as the inverse of `after`, satisfying the verbatim AC-1 requirement of "phase, after, before, optional, persona per node". `SEED_BMAD_VERSION = "6.5"` exported at `seed-v6.x.ts:46`. Build test at `build.test.ts:39-92` confirms population, types, and the inverted `before` field.

**AC-2 Tier 2 overrides** ✅: `src/dag/build.ts:519-594` parses `bmad-stepper.config.yaml` via the hand-rolled `parseOverridesYaml` (`build.ts:174-329`). Override priority is correct — replaces seed entries when names match (`build.ts:543-565`), appends when names are new (`build.ts:566-584`). Graceful degradation on missing/malformed config logs `warn` once and falls through to seed-only (`build.ts:586-594`). Tests at `build.test.ts:95-193` cover replace, append, dash-list `after`, missing-config degradation, parse-failure degradation, and a custom `overridesPath` argument.

**AC-3 Tier 3 + Tarjan + lazy** ✅:
- *Tier 3 frontmatter parse + verbatim hint*: `tier3FrontmatterParse` (`build.ts:451-501`) tries SKILL.md frontmatter first, falls back to skill.yaml. On any failure (missing files, missing frontmatter, missing required `phase`), throws `UnknownBmadSkillError` with the AC-3 verbatim hint via `ac3UnknownSkillHint(skillName)` at `build.ts:87-89`, producing exactly `Add an override for <skill> in bmad-stepper.config.yaml under the overrides: block.`. Tests `build.test.ts:251-307` assert hint string match verbatim.
- *Tarjan SCC cycle detection*: `tarjanScc` (`tarjan.ts:61-114`) is the standard recursive Tarjan with index/lowlink/onStack/stack — invoked at `build.ts:651`. Self-loop check at `build.ts:656-661`. Tests `tarjan.test.ts:12-126` cover empty graph, single node, linear chain, 2-cycle, 3-cycle, multi-disconnected, mixed acyclic+cyclic, and self-loop. Build-side cycle tests `build.test.ts:310-395` confirm DagCycleError throw with `cycles[]` JSON detail.
- *Lazy story-level loading*: `build.test.ts:397-408` plants `_bmad-output/implementation-artifacts/2-1-foo.md` and `2-2-bar.md` and confirms `dag.nodes` does NOT enumerate them. `build()` returns the global skill DAG only (~38 nodes), per architecture line 471.
- *Dangling-edge defensive check*: `build.ts:619-631` throws `UnknownBmadSkillError` when an override's `after:` references a name absent from the resolved set — covered at `build.test.ts:410-436`.

### Architecture Compliance

- **AR41 boundary** ✅: Grep `^import` over `src/dag/` shows only allowed imports — `node:fs`, `node:fs/promises`, `node:os`, `node:path`, `bun:test`, `../errors.ts`, `../io/log.ts`, and intra-module siblings (`./types.ts`, `./build.ts`, `./tarjan.ts`, `./seed-v6.x.ts`). Confirmed NO import from `../bmad-detect/`, `../state/`, `../schemas/`, `../lock/`, `../migrations/`, `../snapshot/`, `../personas/`, `../commands/`, `node:child_process`, or external libs. The mid-tier-to-mid-tier ban is honored — composer pattern wires `detectBmadSkills()` → `build({ skillNames })` at the runner layer (Story 2.4 forward).
- **AR33 function/error semantics** ✅: `build()` is `async` returning `Promise<DagAdjacency>`; `tarjanScc()` is sync. All throws are registered `StepperError` subclasses (`UnknownBmadSkillError`, `DagCycleError`). No `console.*` (Biome `noConsole` enforces). Readonly fields throughout the type definitions (`types.ts:60-151`).

### Quality Gates (independent verification)

- `bun test`: 262 pass / 0 fail / 907 expects across 27 files in 1255ms.
- `bunx biome ci .`: exit 0 — checked 66 files in 25ms, no fixes applied.
- `bunx tsc --noEmit`: exit 0 (silent).

### Deviation Adjudication

**src/errors.ts modification** (UnknownBmadSkillError +`hintOverride?: string` constructor arg): Classified as **(a) acceptable**. The registry stays at exactly 16 codes (`errors.test.ts:50-52` still asserts `toHaveLength(16)` and passes). The constructor extension is backward-compatible — Story 1.2 callers using `new UnknownBmadSkillError(message)` or `new UnknownBmadSkillError(message, detail)` still get the registry default hint via the `hintOverride ?? DEFAULT_HINT` getter at `errors.ts:138-140`. Story 1.10 `build()` uses the 3rd arg to deliver the AC-3 verbatim string. The JSDoc at `errors.ts:109-128` clearly documents the rationale and backwards-compat guarantee. The alternative (rewriting the registry default) would have a wider blast radius and shift Story 1.2's hint semantics.

**Hand-rolled YAML parser**: Acceptable as forward-deferred to 6.1/6.2. `build.ts:174-329` is intentionally narrow — handles `overrides:` block, two indent levels, inline + dash-list `after`, basic scalar coercion, graceful warn-and-skip on parse error. JSDoc at `build.ts:46-54` explicitly scopes this as a placeholder; Story 6.1 (config-yaml-schema-loader) and Story 6.2 (dag-overrides-block) will land the strict Zod-validated loader. No new external deps.

**tarjan.ts vs sort.ts split**: Acceptable. Architecture lines 1155-1161 name the future file `sort.ts` (Tarjan + topological sort). Story 1.10 ships standalone `tarjan.ts` (cycle detection only) and defers the topo-sort half to Story 3.6/3.7 (`--explain` / `--list`). The split is documented in JSDoc at `tarjan.ts:43-47`. `sort.ts` will absorb or import `tarjan.ts` later.

### Action Items

**Must-fix**: 0
**Should-fix**: 0
**Nits**: 1
- Consider renaming `tarjan.ts` to `sort.ts` when Story 3.6/3.7 lands the topological-sort half, per architecture lines 1155-1161. Already documented in JSDoc; track with a follow-up forward note.

**Info**: 2
- The 38-entry seed assumes specific persona identifiers (`analyst`, `pm`, `architect`, `ux-designer`, `dev`, `tech-writer`, `tea`). Story 1.11 must keep these identifiers stable in `src/personas/defaults.ts`, or this seed will need a coordinated update — flagged in `seed-v6.x.ts:24-28`.
- The `idempotent` field on `DagNode` is optional and not yet captured by Tier 1 or Tier 3 parsers. Story 5.1 (retry semantics) will populate it.

### Notes for Future Stories

- **Story 1.11 (persona resolution)**: Will consume `DagNode.persona` (string | string[] | null) and resolve against `src/personas/defaults.ts`. Persona identifiers must match the seed convention.
- **Story 1.12 (doctor)**: Will call `build()` to validate the DAG and surface `SEED_BMAD_VERSION` as the BMAD compatibility version.
- **Story 2.4 (next runner)**: Composer pattern — `detectBmadSkills()` → `build({ skillNames, projectRoot, pluginDir })`. Tier 3 only fires for skill names absent from seed/overrides; pass `pluginDir` when frontmatter parse must succeed.
- **Story 3.6 / 3.7**: Will land `src/dag/sort.ts` (topological sort with phase tiebreaker). May absorb or import `tarjan.ts`.
- **Story 6.1 / 6.2**: Will replace the hand-rolled YAML extractor in `build.ts` with the Zod-validated `OverridesSchema` loader. The current `parseOverridesYaml` is a stable placeholder — its API contract (returns `ReadonlyMap<string, OverrideEntry>`) should be preserved during the swap.

## Change Log

- 2026-05-01: Story file created (status `ready-for-dev`) — bmad-create-story persona.
- 2026-05-01: Implemented src/dag/ (5 source + 2 test files); 3-tier resolver + Tarjan SCC; status → review — bmad-dev-story persona.
- 2026-05-01: Senior Developer Review approve; 0 must-fix, 0 should-fix, 1 nit, 2 info; status → done — bmad-code-review persona.

## References

- **Story Foundation:**
  - [Source: _bmad-output/planning-artifacts/epics.md#Story 1.10: DAG Seed + Three-Tier Registry] — User story + AC verbatim (lines 500–518).
  - [Source: _bmad-output/planning-artifacts/epics.md#Epic 1: Foundation & First-Run Diagnostic] — Epic context.
- **Architecture Compliance:**
  - [Source: _bmad-output/planning-artifacts/architecture.md#D5 — Three-tier step registry discovery] — seed/overrides/frontmatter precedence (lines 411–443).
  - [Source: _bmad-output/planning-artifacts/architecture.md#D6 — DAG representation as adjacency list with Tarjan SCC] — DagNode/DagAdjacency shape, Tarjan, lazy story-level loading (lines 445–473).
  - [Source: _bmad-output/planning-artifacts/architecture.md#Source Tree §dag/] — directory structure (lines 1155–1161).
  - [Source: _bmad-output/planning-artifacts/architecture.md#AR33 — Function & error semantics] — async/throw discipline (line 213).
  - [Source: _bmad-output/planning-artifacts/architecture.md#AR41 — Module boundary graph] — `dag/` is mid-tier (line 1296); allowed/forbidden imports (lines 1278–1304).
  - [Source: _bmad-output/planning-artifacts/architecture.md#FR Coverage Map] — FR1 → `src/dag/build.ts` (line 1331); FR2 → `src/dag/build.ts` (line 1332); FR35 → `src/dag/build.ts` Tier 2 (line 1365); FR51 → `src/dag/build.ts` Tier 3 fail (line 1381); NFR-Sc1 → lazy load (line 1410); NFR-I2 → unknown skill fail-loud (line 1416).
- **PRD:**
  - [Source: _bmad-output/planning-artifacts/prd.md#FR8] — Sub-agent dispatch (DAG prereq) (line 689).
  - [Source: _bmad-output/planning-artifacts/prd.md#FR9] — Sub-agent verifier (DAG prereq) (line 690).
  - [Source: _bmad-output/planning-artifacts/prd.md#FR35] — DAG overrides block (line 717).
  - [Source: _bmad-output/planning-artifacts/prd.md#FR51] — Fail loudly with remediation hint (line 739).
  - [Source: _bmad-output/planning-artifacts/prd.md#NFR-Sc1] — 100 epics × 1000 stories lazy-load (line 784).
- **Previous Stories:**
  - [Source: _bmad-output/implementation-artifacts/1-1-initialize-repository-scaffold.md] — Bun 1.3.12 host, Biome 2.3.15, Zod 3.24 pinned.
  - [Source: _bmad-output/implementation-artifacts/1-2-errors-module-registry-ci-gate.md] — 16-code registry with `UnknownBmadSkillError` and `DagCycleError` already declared. Story 1.10 USES both; does NOT extend the registry.
  - [Source: _bmad-output/implementation-artifacts/1-3-logger-path-helpers-atomic-write.md] — `info`/`warn`/`error` → stderr; `json` → stdout. Story 1.10 imports `warn` only.
  - [Source: _bmad-output/implementation-artifacts/1-4-file-lock-with-heartbeat.md] — `LockOptions` test-only-but-exported pattern.
  - [Source: _bmad-output/implementation-artifacts/1-5-schemas-migrations-skeleton.md] — Zod schema framework. Story 1.10 introduces no new schemas.
  - [Source: _bmad-output/implementation-artifacts/1-6-state-subsystem-load-save-recompute-skeleton.md] — `loadState`/`saveState`/`recomputeState`. Story 1.10 does NOT call any.
  - [Source: _bmad-output/implementation-artifacts/1-7-cli-argument-parser.md] — `parseNextArgs`. Story 1.10 does NOT touch CLI parsing.
  - [Source: _bmad-output/implementation-artifacts/1-8-snapshot-branch-sha-detection.md] — `Bun.spawn` pattern + AR35 tmpdir test pattern. Story 1.10 reuses tmpdir tests; uses `Bun.file().text()` for filesystem reads.
  - [Source: _bmad-output/implementation-artifacts/1-9-bmad-detection.md] — `src/bmad-detect/` mid-tier sibling; `detectBmadSkills()` returns `Promise<string[]>`. Story 1.10 CONSUMES via composer pattern (`BuildInput.skillNames` parameter), NOT direct import.
- **Project Config Pin:**
  - [Source: _bmad/config.yaml] — `project_name: bmad-stepper`, `planning_artifacts`, `implementation_artifacts`, `test_framework: bun-test`. **Pinned to `_bmad/config.yaml`.**

### Definition of Done

- [ ] All 8 tasks above completed and self-checked.
- [ ] `src/dag/index.ts` exists; barrel re-exports only public surface.
- [ ] `src/dag/types.ts` exists; exports `Phase`, `DagNode`, `DagAdjacency`, `SeedEntry`, `OverrideEntry`, `BuildInput`.
- [ ] `src/dag/seed-v6.x.ts` exists; exports `seedV6_x: readonly SeedEntry[]` covering ~40 BMAD v6.5 skills + `SEED_BMAD_VERSION = "6.5"`.
- [ ] `src/dag/build.ts` exists; exports `build(input: BuildInput): Promise<DagAdjacency>`.
- [ ] `src/dag/tarjan.ts` exists; exports `tarjanScc(edgesOut): string[][]`.
- [ ] `src/dag/build.test.ts` exists; covers AC-1 (Tier 1 seed) + AC-2 (Tier 2 overrides + degradation) + AC-3 (Tier 3 + cycle + lazy loading) + edge cases.
- [ ] `src/dag/tarjan.test.ts` exists; covers empty graph, single node, linear chain, 2-cycle, 3-cycle, multi-cycle, mixed, self-loop edge cases.
- [ ] `src/errors.ts` registry stays at 16 codes (any constructor-arg extension is documented in Completion Notes and flagged for Senior Developer Review).
- [ ] `package.json`, `tsconfig.json`, `biome.json`, `bunfig.toml`, `bun.lock` are byte-identical to their Story 1.9 final state.
- [ ] `bun run check` exits 0 locally.
- [ ] CI green on `ubuntu-latest` and `macos-latest`.
- [ ] `build()` correctly handles: seed-only resolution (Tier 1); overrides replace existing (Tier 2 priority); overrides append new (Tier 2 extension); SKILL.md frontmatter parse success (Tier 3); SKILL.md/skill.yaml absent → throw `UnknownBmadSkillError` (Tier 3 fail-loud); SKILL.md unparseable frontmatter → throw `UnknownBmadSkillError`; cycle in seed/overrides/Tier-3 → throw `DagCycleError`; dangling-edge in `after` → throw `UnknownBmadSkillError`; lazy loading (no story-level expansion); deterministic adjacency-list ordering across consecutive builds.
- [ ] `tarjanScc` correctly handles: empty graph; single node; linear chain; 2-cycle; 3-cycle; multiple disconnected cycles; mixed acyclic + cyclic components; self-loop (size-1 SCC with self-edge — caller-side check).
- [ ] No `console.*` calls anywhere in the new files (Biome `noConsole` confirmed).
- [ ] No imports from `../bmad-detect/`, `../state/`, `../schemas/`, `../lock/`, `../migrations/`, `../snapshot/`, `../personas/`, `../commands/`, `node:child_process`, external libraries beyond the project's existing pin.
- [ ] AC-1 verified by `build.test.ts` Tier 1 happy-path test (Task 7.2 / 7.4).
- [ ] AC-2 verified by `build.test.ts` Tier 2 replace + append + degradation tests (Task 7.5 / 7.6 / 7.7 / 7.8).
- [ ] AC-3 verified by `build.test.ts` Tier 3 success + Tier 3 throw + cycle detection + lazy-loading tests (Task 7.9 / 7.10 / 7.11 / 7.12 / 7.13 / 7.14).
