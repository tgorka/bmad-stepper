---
status: done
story_id: '2.1'
story_key: 2-1-verifier-configuration-registry
epic: '2'
title: Verifier Configuration & Registry
created: '2026-05-01'
last_updated: '2026-04-30'
priority: M
estimated_effort: M
fr_coverage:
  - FR17
  - FR38
nfr_coverage:
  - NFR-M3
  - NFR-S6
  - NFR-R1
  - NFR-S1
ar_coverage:
  - AR21
  - AR22
  - AR33
  - AR41
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/implementation-artifacts/epic-1-retrospective.md
  - _bmad-output/implementation-artifacts/1-2-errors-module-registry-ci-gate.md
  - _bmad-output/implementation-artifacts/1-3-logger-path-helpers-atomic-write.md
  - _bmad-output/implementation-artifacts/1-5-schemas-migrations-skeleton.md
  - _bmad-output/implementation-artifacts/1-6-state-subsystem-load-save-recompute-skeleton.md
  - _bmad-output/implementation-artifacts/1-10-dag-seed-three-tier-registry.md
  - _bmad-output/implementation-artifacts/1-11-persona-resolution.md
  - _bmad-output/implementation-artifacts/1-12-bmad-next-doctor-command.md
  - src/errors.ts
  - src/io/log.ts
  - src/io/paths.ts
  - src/io/atomic-write.ts
  - src/schemas/verifier-result.ts
  - src/schemas/verifier-result.test.ts
---

# Story 2.1: Verifier Configuration & Registry

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper contributor,
I want every BMAD step to declare a verifier config (required files, frontmatter sections, optional Zod schema, optional custom check),
So that "verifier-before-promote" is reusable across all step types and project config can override per step.

## Context Summary

This story is the **opening story of Epic 2 (Single-Step Advance with Sub-Agent Dispatch)** and lands the **`src/verifiers/` higher-tier module** that operationalises **architecture §D9 + FR17 + FR38**. Until now Epic 1 shipped foundational primitives (`errors.ts`, `io/{log,paths,atomic-write}.ts`), the lock + state + schemas + migrations subsystem, snapshot + BMAD detection, the DAG builder, the persona resolver, and the `/bmad-next --doctor` integration command. None of those modules know how to *check whether a sub-agent's artifact is acceptable* — that responsibility lives in the verifier registry that this story creates. Story 2.1 fills the gap by introducing a per-step `VerifierConfig` shape, a registry mapping step name to that shape, default configurations for the seven canonical BMAD step types (`prd`, `architecture`, `story-create`, `dev-story`, `code-review`, `retro`, plus a `default.ts` baseline + `analyst-research`), and a `runVerifier(runId)` orchestrator that executes each check and writes `staging/<run-id>/verifier-result.json` per the existing `VerifierResultV1Schema` (Story 1.5).

Concretely, this story produces:

1. **`src/verifiers/index.ts`** — public barrel re-exporting the registry, default configs, `runVerifier`, and the `VerifierConfig` / `VerifierError` types. Mirrors the Story 1.10 `src/dag/index.ts` and Story 1.11 `src/personas/index.ts` barrel-pattern.
2. **`src/verifiers/types.ts`** — the public `VerifierConfig` shape per architecture §D9 (lines 482-487): `requiredFiles: string[]` (glob patterns relative to staging output), `requiredFrontmatterSections: string[]` (top-level keys that must exist in YAML frontmatter), `schema: ZodSchema | null` (optional Zod schema for the artifact body), `custom?: (artifact: ArtifactRef) => Result<void, VerifierError>` (deterministic-stateless custom check). Also defines `ArtifactRef` (path-handle for the staged file), `VerifierError` (concrete error class registered in `src/errors.ts`), and `Result<T, E>` (re-exported from `src/commands/next/args.ts`).
3. **`src/verifiers/registry.ts`** — the registry mapping `stepName: string → VerifierConfig`. Hand-curated map of seven step-type entries (`prd`, `architecture`, `story-create`, `dev-story`, `code-review`, `retro`, `analyst-research`) plus a `default` baseline that the registry falls back to for any unregistered step. Public surface: `getVerifierConfig(stepName: string): VerifierConfig` (returns the per-step config OR the default).
4. **`src/verifiers/defaults.ts`** — the seven per-step configs + the baseline default. Each config is a plain `VerifierConfig` literal with conservative `requiredFiles` (e.g., `["**/*.md"]` for prose artifacts), `requiredFrontmatterSections` (e.g., `["title", "status"]`), `schema: null` (deferred per architecture §D9 + Story 1.5 — the body schemas are not part of v0.1), and **no** `custom` checks (deferred to dev iteration follow-ups).
5. **`src/verifiers/run-verifier.ts`** — the `runVerifier(runId, opts?)` orchestrator. Algorithm:
   1. Resolve `staging/<runId>/dispatch-spec.json` (Story 2.2 forward-dep — for v0.1 the orchestrator accepts the step name directly via `opts.stepName` until 2.2 lands).
   2. Look up the verifier config via `getVerifierConfig(stepName)`.
   3. For each declared check (`required-files`, `frontmatter`, `schema`, `custom`), run it against the artifact at `staging/<runId>/outputs/`.
   4. Collect results into a `VerifierResultV1` (per Story 1.5 schema) and write atomically to `staging/<runId>/verifier-result.json` via `src/io/atomic-write.ts`.
   5. Return the structured `VerifierResultV1` to the caller (Story 2.6 `verify-and-advance.ts` is the canonical consumer; v0.1 returns it for Story 2.6 to dispatch the failure-UX engine).
6. **`src/verifiers/checks/required-files.ts`, `frontmatter.ts`, `schema.ts`, `custom.ts`** — one file per check function. Each is a pure-async function `(artifact: ArtifactRef, config: VerifierConfig) => Promise<{ name: string; status: "pass" | "fail" | "skip"; detail: string }>`.
7. **Test files** — `src/verifiers/registry.test.ts` (registry coverage + default fallback), `src/verifiers/defaults.test.ts` (each per-step config is shape-valid), `src/verifiers/run-verifier.test.ts` (orchestrator integration tests using tmpdir per AR35), and per-check tests under `src/verifiers/checks/*.test.ts`.

Optional `src/errors.ts` extension: this story may add a single `VerifierConfigError` class (exit code 2, configuration error) for the case where a project config overrides a verifier with a malformed shape. Per the **`hintOverride?` constructor pattern** (Story 1.10 `UnknownBmadSkillError` + Story 1.11 `ConfigError`), the new class — if added — would carry a default registry hint plus an optional 3rd-arg override for AC-verbatim hint substitution. **Recommended**: defer this until a real call site needs it (Story 6.5 per-step verifier override). The errors registry currently sits at 16 codes and Story 2.1 does **not** require an extension to satisfy the AC.

This story is the **first higher-tier module** of the project — `src/verifiers/` per architecture lines 1287-1289 sits between mid-tier (`migrations/`, `state/`, `bmad-detect/`, `personas/`, `dag/`, `transcript/`, `telemetry/`, `upgrade/`) and top-tier (`commands/`). It does **NOT**:

- Implement the **promote** step. Per architecture line 1178, `src/dispatch/promote.ts` is a separate Story 2.6 deliverable that consumes `verifier-result.json` (`status === "pass"`) and atomically copies the artifact from `staging/<runId>/outputs/` to its canonical location. Story 2.1 ships **only the verifier**, not the promote.
- Implement the **per-step config override** (FR38 second half). The architecture §D9 specifies "Project config (`bmad-stepper.config.yaml` `verifiers:`) overrides plugin defaults." That override resolution lives in **Story 6.5 (verifiers per-step config override)**. Story 2.1 ships **only the plugin defaults** (the registry); the project-config-aware resolver lands in 6.5.
- Implement the **failure-UX engine**. Per architecture §D9 (lines 492-499), the four failure modes (`retry`, `skip`, `route-to-fixer`, `escalate`) live in `src/failure-ux/` and consume the `VerifierResultV1` shape from this story. That's **Epic 5** (Stories 5.1-5.4).
- Implement the **dispatch-spec generator** that produces `staging/<runId>/dispatch-spec.json`. That is **Story 2.2**. Story 2.1's `runVerifier` accepts the step name directly via `opts.stepName` for v0.1 testability; Story 2.6 wires the `dispatch-spec.json` lookup at runner-tier.
- Modify any prior mid-tier module. The composition of (`bmad-detect/` skill enumeration → `dag/` step name → verifier config) lives at the runner tier (`src/commands/next/verify-and-advance.ts`, Story 2.6). Per AR41 boundary discipline (architecture lines 1287-1289), `src/verifiers/` is a higher-tier module that imports only from foundational (`errors.ts`, `io/`, `schemas/`) and mid-tier modules — **NOT from sibling higher-tier modules** (`dispatch/`, `failure-ux/`).
- Add an LLM-as-judge verifier strategy. Per PRD §12 (deferred-decision) and architecture §1727, the LLM-as-judge `judge:` field is a post-v0.1 extension; v0.1 ships **conservative deterministic checks only** (file-existence, frontmatter, optional Zod schema, optional deterministic custom function).

It DOES land:

- The exact AR41-conformant placement of `src/verifiers/` as a **higher-tier** module. Per architecture lines 1287-1289, higher-tier modules depend on foundational + mid-tier modules. `src/verifiers/` allowed imports: `../errors.ts`, `../io/{log,paths,atomic-write}.ts`, `../schemas/verifier-result.ts` (foundational); `../dag/index.ts` (mid-tier, OPTIONAL — only if `runVerifier` needs to resolve step names through the DAG; v0.1 accepts the step name directly), `../personas/index.ts` (mid-tier, OPTIONAL — same rationale). **Forbidden**: `../dispatch/`, `../failure-ux/` (sibling higher-tier — composition belongs at runner tier per AR41 mid-to-mid ban applied by analogy to higher-to-higher).
- The `VerifierConfig` shape verbatim from architecture §D9 lines 482-487. The `requiredFiles` glob pattern semantics, the `requiredFrontmatterSections` top-level-key check, the `schema` Zod-schema-or-null fallback, and the `custom?` deterministic-stateless contract.
- The seven canonical default configs (`prd`, `architecture`, `story-create`, `dev-story`, `code-review`, `retro`, `analyst-research`) per architecture §D9 (line 1163 directory listing) + AC-1 spec text.
- The `runVerifier(runId, opts)` orchestrator that writes `staging/<runId>/verifier-result.json` validated against `src/schemas/verifier-result.ts`'s `VerifierResultV1Schema` (Story 1.5 — already shipped). The schema's `status: "pass" | "fail" | "skip"` enum and `checks[]` array shape are honored verbatim.
- The deterministic-stateless contract for `custom?` checks per AC + architecture §D9 line 490: "Custom checks (the `custom` field) run last and have access to the file's content; they are intentionally limited to deterministic, stateless work — no Claude calls." NFR-S1 (no main-thread network) is preserved by design (custom checks may not call `fetch`, `Bun.spawn` of network tools, or any I/O outside the staging dir).
- Test-first enforcement per Stories 1.2 / 1.4 / 1.5 / 1.6 / 1.7 / 1.8 / 1.9 / 1.10 / 1.11: every new file ships with colocated `*.test.ts`. AR35 tmpdir-per-test pattern for any test that touches the filesystem.

This delivers **AR21** (errors carry `code` + `actionableHint` — the `runVerifier` throws `VerifierFailureError` with `failureDetail` populated; the existing registry entry from Story 1.2 is consumed verbatim), **AR22** (single-line `Run/See/Try/Check`-prefixed hint — `VerifierFailureError`'s registry hint already complies: `See _bmad-output/.stepper/runs/<ts>-<step>.log for the verifier output; try /bmad-next --resume after fixing the underlying issue.`), **AR33** (function & error semantics — `runVerifier` is `async`; throws `StepperError` subclasses; uses `Result<T, E>` only inside `custom?` callbacks per architecture line 858 sole-exception clause; no `console.*`), **AR41** (module boundary — `src/verifiers/` is higher-tier; allowed imports: foundational + mid-tier; FORBIDDEN: sibling higher-tier `dispatch/` + `failure-ux/`). It operationalises **FR17** (verifier before promote — primary), **FR38** (verifiers per step — partial; full project-config override is Story 6.5), **NFR-M3** (validated schemas — `verifier-result.json` is Zod-validated via Story 1.5 schema), **NFR-S6** (no execution of sub-agent output — verifier reads but never executes the artifact body; `custom?` is the project's own code, not the sub-agent's), **NFR-R1** (zero data loss — `verifier-result.json` is atomically written via Story 1.3's `atomicWrite` with `.bak` rotation), **NFR-S1** (no main-thread network — verifier is filesystem-only).

## Acceptance Criteria

The acceptance criteria below are reproduced **verbatim** from `_bmad-output/planning-artifacts/epics.md` §Story 2.1 (lines 584-595, BDD Given/When/Then format). Lines and AC labelling preserved.

**Given** `src/verifiers/index.ts` with the verifier registry mapping step name to `VerifierConfig`
**When** a per-step config is registered (e.g., `src/verifiers/prd.ts`, `architecture.ts`, `story-create.ts`, `dev-story.ts`, `code-review.ts`, `retro.ts`, plus `default.ts` baseline)
**Then** the verifier object has `requiredFiles: string[]`, `requiredFrontmatterSections: string[]`, `schema: ZodSchema | null`, optional `custom?: (artifact) => Result<void, VerifierError>`
**Given** a sub-agent has produced an artifact at `staging/<run-id>/outputs/`
**When** `runVerifier(runId)` runs
**Then** it executes each check and writes `staging/<run-id>/verifier-result.json` (per AR17 + AR26 schema)
**Given** a check fails
**When** runVerifier completes
**Then** the result has `status: "fail"` with structured `checks[]` reporting which check failed and why
**And** custom checks are deterministic and stateless (no Claude API calls, no network)

## Tasks / Subtasks

- [x] **Task 0 — Verify pre-conditions (AC: all)**
  - [x] 0.1 Confirm `src/errors.ts` registry stays at 16 codes (post-Story 1.13). Confirm `VerifierFailureError` exists at `src/errors.ts` lines 171-176 with `code: "VERIFIER_FAILURE"`, `exitCode: 1`, hint `See _bmad-output/.stepper/runs/<ts>-<step>.log for the verifier output; try /bmad-next --resume after fixing the underlying issue.`. Verify `bun test src/errors.test.ts` exits 0 (10 pass / 197 expects). **Story 2.1 SHOULD NOT modify `src/errors.ts`** unless a NEW error class is genuinely required (recommended: defer to Story 6.5).
  - [x] 0.2 Confirm `src/io/log.ts` exports `info`, `warn`, `error`, `json` per Story 1.3. Story 2.1 imports `info` (for verifier-progress logging via stderr) and `error` (for the actionable-hint emit on failure paths). Per AR/FR54, `info` writes to **stderr**.
  - [x] 0.3 Confirm `src/io/paths.ts` exports the canonical staging path helpers and `assertWithinScope()` per Story 1.3 + Story 1.5. Verifier writes only to `staging/<runId>/verifier-result.json` — inside scope.
  - [x] 0.4 Confirm `src/io/atomic-write.ts` exports `atomicWrite(path, contents)` per Story 1.3. Story 2.1 uses this to write `verifier-result.json` atomically with `.bak` rotation (NFR-R1).
  - [x] 0.5 Confirm `src/schemas/verifier-result.ts` exports `VerifierResultV1Schema`, `VerifierResultV1`, `VerifierResult`, `VerifierResultLatestSchema` per Story 1.5. Story 2.1 imports `VerifierResultV1Schema` to validate the result before writing (defence-in-depth) and `VerifierResult` as the return type of `runVerifier`.
  - [x] 0.6 Read epics.md Story 2.1 §lines 578-595 verbatim. Confirm the AC text in §Acceptance Criteria above is character-identical (re-verify on first dev pass).
  - [x] 0.7 Read architecture.md §D9 (lines 477-499) for the `VerifierConfig` shape; §P5 (lines 901-915) for the verifier output JSON shape; §directory-listing line 1163 for the `src/verifiers/` directory layout; §AR41 lines 1287-1289 for the higher-tier boundary.
  - [x] 0.8 Read prd.md FR17 (line 690 — verifier before promote) and FR38 (line 720 — `verifiers:` per step block).
  - [x] 0.9 Confirm baseline `bun run check` exits 0 with **311 pass / 0 fail / 1161 expect() / 32 files** per Story 1.13 final.
  - [x] 0.10 Confirm Bun host version satisfies AR2 (Bun >= 1.3). Run `bun --version`; record in Completion Notes.

- [x] **Task 1 — Create `src/verifiers/` directory + `src/verifiers/index.ts` barrel (AC-1, AC-2)**
  - [x] 1.1 Create directory `src/verifiers/`. Per AR41 (architecture lines 1287-1289), this is a **higher-tier** module. Allowed imports for any file under `src/verifiers/`: foundational (`../errors.ts`, `../io/log.ts`, `../io/paths.ts`, `../io/atomic-write.ts`, `../schemas/verifier-result.ts`); mid-tier (`../dag/index.ts` OPTIONAL, `../personas/index.ts` OPTIONAL); Bun stdlib (`Bun.file`, `Bun.write`, `Bun.YAML`); Node stdlib (`node:fs/promises`, `node:path`, `node:os`); external libraries (`zod` only). **FORBIDDEN**: sibling higher-tier modules (`../dispatch/`, `../failure-ux/`); `node:child_process`; any new external runtime dep beyond `zod`. JSDoc on every file MUST cite AR41 + the architecture line for the boundary graph.
  - [x] 1.2 Create `src/verifiers/index.ts` — public barrel:
    ```typescript
    /**
     * src/verifiers/index.ts — public barrel for the verifier module
     * (FR17, FR38, NFR-M3, NFR-S6, NFR-R1, NFR-S1, AR21, AR22, AR33, AR41).
     *
     * Story 2.1 ships the verifier registry + default per-step configs +
     * the runVerifier orchestrator. Per AR41 (architecture lines 1287-1289),
     * src/verifiers/ is HIGHER-TIER: depends on foundational + mid-tier;
     * never on sibling higher-tier modules (dispatch/, failure-ux/).
     */
    export type { VerifierConfig, ArtifactRef, VerifierError } from "./types.ts";
    export { getVerifierConfig, verifierRegistry } from "./registry.ts";
    export { defaultVerifiers } from "./defaults.ts";
    export { runVerifier } from "./run-verifier.ts";
    export type { RunVerifierOptions, RunVerifierResult } from "./run-verifier.ts";
    ```
  - [x] 1.3 No test file is needed for `index.ts` (pure re-export). Story 1.10 / 1.11 precedent.

- [x] **Task 2 — Implement `src/verifiers/types.ts` — Public type surface (AC-1)**
  - [x] 2.1 Create `src/verifiers/types.ts`. Module purpose: define the `VerifierConfig` shape verbatim per architecture §D9 lines 482-487; define `ArtifactRef`, `VerifierError`, `Result<T, E>` (the AR33 sole-exception type for `custom?` callbacks).
  - [x] 2.2 Public types:
    ```typescript
    import type { ZodSchema } from "zod";

    /**
     * Reference handle to a sub-agent artifact under staging/<runId>/outputs/.
     * Carries the absolute path + the resolved step name. Custom checks
     * receive this and may read the file content via Bun.file(artifact.path).
     */
    export interface ArtifactRef {
      readonly path: string;       // absolute filesystem path
      readonly stepName: string;   // resolved BMAD step name (e.g., "dev-story")
      readonly runId: string;      // dispatch run id (architecture §P5)
    }

    /**
     * Custom-check error shape per architecture §D9 line 486.
     * Wraps a single failure detail; the orchestrator collects these into
     * the `checks[]` array of the final VerifierResultV1.
     */
    export interface VerifierError {
      readonly check: string;      // check name (e.g., "frontmatter")
      readonly detail: string;     // human-readable failure detail
    }

    /**
     * Result type used ONLY by custom?: (architecture line 858 sole-exception
     * to AR33 throw-everywhere discipline; mirrors src/commands/next/args.ts).
     */
    export type Result<T, E> =
      | { readonly ok: true; readonly value: T }
      | { readonly ok: false; readonly error: E };

    /**
     * Per-step verifier configuration shape — verbatim from architecture
     * §D9 lines 482-487. Plugin defaults live in src/verifiers/defaults.ts;
     * project config override resolution is Story 6.5 (FR38).
     */
    export interface VerifierConfig {
      readonly requiredFiles: readonly string[];               // glob patterns relative to staging/<runId>/outputs/
      readonly requiredFrontmatterSections: readonly string[]; // top-level YAML frontmatter keys that must exist
      readonly schema: ZodSchema | null;                       // optional Zod schema for the artifact body
      readonly custom?: (artifact: ArtifactRef) => Promise<Result<void, VerifierError>> | Result<void, VerifierError>;
    }
    ```
  - [x] 2.3 Add JSDoc per Story 1.6/1.7/1.10/1.11 conventions. Cite architecture §D9 lines 482-487 (the canonical shape), §P5 lines 901-915 (the verifier-result JSON contract), §line 858 (the AR33 sole-exception for `Result<T, E>`).

- [x] **Task 3 — Implement `src/verifiers/defaults.ts` — Default per-step configs (AC-1)**
  - [x] 3.1 Create `src/verifiers/defaults.ts`. Module purpose: declare the seven per-step configs + the `default` baseline. Each config is a plain `VerifierConfig` literal — no logic, no IO at module load.
  - [x] 3.2 Per-step entries (per AC-1 verbatim list + architecture line 1163 directory listing):
    - `default` — baseline: `{ requiredFiles: [], requiredFrontmatterSections: [], schema: null }`. The fallback for any unregistered step.
    - `prd` — `{ requiredFiles: ["**/*.md"], requiredFrontmatterSections: ["title", "status"], schema: null }`. PRD artifact is a markdown file with frontmatter `title` + `status`.
    - `architecture` — same shape as `prd`.
    - `story-create` — `{ requiredFiles: ["**/*.md"], requiredFrontmatterSections: ["title", "status", "story_id"], schema: null }`. Story file requires `story_id` in addition to `title`+`status`.
    - `dev-story` — `{ requiredFiles: ["**/*.md"], requiredFrontmatterSections: ["title", "status"], schema: null }`. Dev iteration appends to the existing story file; no new frontmatter required.
    - `code-review` — `{ requiredFiles: ["**/*.md"], requiredFrontmatterSections: ["title", "status"], schema: null }`. Review notes appended to the story file.
    - `retro` — `{ requiredFiles: ["**/*.md"], requiredFrontmatterSections: ["status", "epic"], schema: null }`. Retrospective requires `epic` frontmatter (per Story 1.13 + epic-1-retrospective.md shape).
    - `analyst-research` — `{ requiredFiles: ["**/*.md"], requiredFrontmatterSections: ["title"], schema: null }`. Research artifact requires only `title`.
  - [x] 3.3 Export the map:
    ```typescript
    export const defaultVerifiers: Readonly<Record<string, VerifierConfig>> = {
      default: { ... },
      prd: { ... },
      architecture: { ... },
      "story-create": { ... },
      "dev-story": { ... },
      "code-review": { ... },
      retro: { ... },
      "analyst-research": { ... },
    } as const;
    ```
  - [x] 3.4 Add JSDoc per conventions. Cite architecture §D9 + AC-1 verbatim list. Document the **conservative v0.1 strategy** per architecture §1727 (LLM-as-judge `judge:` field is a deferred post-v0.1 extension; v0.1 ships only deterministic checks). Document the empty `schema: null` fields as **deferred** to per-artifact schema stories (Story 6.x).

- [x] **Task 4 — Implement `src/verifiers/registry.ts` — Registry + lookup (AC-1, AC-2)**
  - [x] 4.1 Create `src/verifiers/registry.ts`. Module purpose: expose `verifierRegistry` (the `defaultVerifiers` map) and the `getVerifierConfig(stepName)` lookup that falls back to `default` for any unregistered step.
  - [x] 4.2 Public surface:
    ```typescript
    import { defaultVerifiers } from "./defaults.ts";
    import type { VerifierConfig } from "./types.ts";

    /**
     * Public registry — the plugin defaults map. Project-config override
     * resolution lands in Story 6.5 (FR38 second half); v0.1 ships
     * registry === defaults.
     */
    export const verifierRegistry: Readonly<Record<string, VerifierConfig>> = defaultVerifiers;

    /**
     * Look up the verifier config for a step name; falls back to the
     * `default` baseline if the step is not registered.
     */
    export function getVerifierConfig(stepName: string): VerifierConfig {
      const config = verifierRegistry[stepName];
      if (config) return config;
      const baseline = verifierRegistry["default"];
      if (!baseline) {
        throw new Error("verifier registry is missing the `default` baseline (architecture §D9 invariant)");
      }
      return baseline;
    }
    ```
  - [x] 4.3 Add JSDoc per conventions. Cite architecture §D9 (registry concept) + Story 6.5 forward-dep (project-config override).

- [x] **Task 5 — Implement `src/verifiers/checks/required-files.ts` — Glob-pattern file existence check (AC-3, AC-4)**
  - [x] 5.1 Create `src/verifiers/checks/required-files.ts`. Module purpose: implement the `required-files` check — for each glob in `config.requiredFiles`, assert at least one matching file exists under `staging/<runId>/outputs/`. Returns `{ name: "required-files", status: "pass" | "fail", detail: string }`.
  - [x] 5.2 Algorithm:
    1. For each pattern in `config.requiredFiles`: use `Bun.Glob(pattern).scan({ cwd: artifact.outputsDir })` to enumerate matches.
    2. If any pattern yields zero matches: `status: "fail"` with `detail: "No file matched pattern <pattern>"`.
    3. All patterns matched: `status: "pass"` with `detail: ""`.
    4. Empty `requiredFiles` array: `status: "skip"` with `detail: "No required files declared"`.
  - [x] 5.3 No external IO beyond filesystem reads. NFR-S1 preserved.

- [x] **Task 6 — Implement `src/verifiers/checks/frontmatter.ts` — YAML frontmatter check (AC-3, AC-4)**
  - [x] 6.1 Create `src/verifiers/checks/frontmatter.ts`. Module purpose: parse the markdown artifact's YAML frontmatter (the `---` ... `---` block at the file head) and assert each key in `config.requiredFrontmatterSections` is present.
  - [x] 6.2 Algorithm:
    1. Read the artifact via `Bun.file(artifact.path).text()`.
    2. Extract the frontmatter block: match `/^---\n([\s\S]*?)\n---/`.
    3. Parse the block via `Bun.YAML.parse(block)`.
    4. For each key in `config.requiredFrontmatterSections`: assert `parsed[key] !== undefined && parsed[key] !== null && parsed[key] !== ""`.
    5. Pass: `{ name: "frontmatter", status: "pass", detail: "" }`. Fail: `{ name: "frontmatter", status: "fail", detail: "Missing frontmatter key: <key>" }` (lists the FIRST missing key for v0.1; future enhancement could list all).
    6. Empty `requiredFrontmatterSections`: `status: "skip"` with `detail: "No required frontmatter sections declared"`.
    7. Frontmatter block absent or malformed YAML: `status: "fail"` with `detail: "Frontmatter block is missing or malformed YAML"`.

- [x] **Task 7 — Implement `src/verifiers/checks/schema.ts` — Optional Zod schema check (AC-3, AC-4)**
  - [x] 7.1 Create `src/verifiers/checks/schema.ts`. Module purpose: when `config.schema !== null`, parse the artifact body via the provided Zod schema. v0.1 default configs all have `schema: null`, so this check returns `status: "skip"` for every default; the implementation is in place for Story 6.x per-artifact schemas.
  - [x] 7.2 Algorithm:
    1. If `config.schema === null`: `{ name: "schema", status: "skip", detail: "No body schema declared" }`. Done.
    2. Otherwise: read the artifact body (after the frontmatter block). For markdown artifacts this is the prose; for JSON artifacts this is the parsed JSON.
    3. `config.schema.safeParse(body)`. On success: `{ name: "schema", status: "pass", detail: "" }`. On failure: `{ name: "schema", status: "fail", detail: <Zod error formatted message> }`.

- [x] **Task 8 — Implement `src/verifiers/checks/custom.ts` — Custom callback runner (AC-3, AC-4, AC-5)**
  - [x] 8.1 Create `src/verifiers/checks/custom.ts`. Module purpose: when `config.custom` is provided, invoke it with the `ArtifactRef` and translate the `Result<void, VerifierError>` into the check result.
  - [x] 8.2 Algorithm:
    1. If `config.custom === undefined`: `{ name: "custom", status: "skip", detail: "No custom check declared" }`. Done.
    2. Invoke `await config.custom(artifact)` (the callback may be sync or async per the type signature).
    3. On `result.ok === true`: `{ name: "custom", status: "pass", detail: "" }`.
    4. On `result.ok === false`: `{ name: "custom", status: "fail", detail: result.error.detail }`.
    5. **AC-5 contract enforcement**: the custom callback is the project's own code (not the sub-agent's); the verifier MUST NOT execute the artifact body. NFR-S6 (no execution of sub-agent output) is preserved by the type signature alone — the callback receives an `ArtifactRef` (path), not the parsed artifact body.
    6. **AC-5 deterministic-stateless contract**: per architecture §D9 line 490, custom checks are intentionally limited to deterministic, stateless work — no Claude calls, no network, no `Bun.spawn` of network tools. v0.1 enforces this **by convention and JSDoc**, NOT by runtime sandboxing (the JS engine cannot prevent it). A future polish PR (Story 6.5) could add a runtime guard via `--no-network-on-main` integration test (NFR-S1) extended to scan custom callbacks for `fetch(`/`http.`/`https.`/`net.` references at lint time.

- [x] **Task 9 — Implement `src/verifiers/run-verifier.ts` — Orchestrator (AC-2, AC-3, AC-4)**
  - [x] 9.1 Create `src/verifiers/run-verifier.ts`. Module purpose: the public `runVerifier(runId, opts?)` orchestrator that:
    1. Resolves the staging directory `staging/<runId>/`.
    2. Looks up the verifier config via `getVerifierConfig(opts.stepName)` (v0.1 — Story 2.2 will replace this with a `dispatch-spec.json` lookup).
    3. Constructs the `ArtifactRef` (resolves the artifact path under `staging/<runId>/outputs/`).
    4. Runs all four checks (`required-files`, `frontmatter`, `schema`, `custom`).
    5. Aggregates results into a `VerifierResultV1` shape.
    6. Atomically writes the result to `staging/<runId>/verifier-result.json` via `src/io/atomic-write.ts` (NFR-R1).
    7. Returns the structured `VerifierResultV1` to the caller (Story 2.6 consumer).
  - [x] 9.2 Public surface:
    ```typescript
    export interface RunVerifierOptions {
      readonly stepName: string;                    // BMAD step name (e.g., "dev-story") — v0.1 explicit; Story 2.2 reads from dispatch-spec.json
      readonly stagingRoot?: string;                // overrides staging dir root (test escape hatch); defaults to STAGING_PATH from src/io/paths.ts
      readonly artifactFilename?: string;           // explicit artifact filename under outputs/ (default: "<step>.md" or first match of requiredFiles[0])
    }

    export interface RunVerifierResult extends VerifierResult {
      readonly resultPath: string;                  // absolute path to the written verifier-result.json
    }

    export async function runVerifier(
      runId: string,
      opts: RunVerifierOptions,
    ): Promise<RunVerifierResult>;
    ```
  - [x] 9.3 Algorithm step 1 — **Resolve options**: `stagingRoot` defaults to `STAGING_PATH` from `src/io/paths.ts` (or a tmpdir override for tests); `outputsDir = path.join(stagingRoot, runId, "outputs")`; `resultPath = path.join(stagingRoot, runId, "verifier-result.json")`.
  - [x] 9.4 Algorithm step 2 — **Look up config** via `getVerifierConfig(opts.stepName)` from `./registry.ts`.
  - [x] 9.5 Algorithm step 3 — **Construct ArtifactRef**: resolve the primary artifact path (defaults to `outputs/<stepName>.md` OR the first match of `config.requiredFiles[0]` if it's a literal filename).
  - [x] 9.6 Algorithm step 4 — **Run checks** in order: `required-files`, `frontmatter`, `schema`, `custom`. Collect each `{ name, status, detail }` into a `checks[]` array.
  - [x] 9.7 Algorithm step 5 — **Aggregate status**: if any check is `"fail"`, the overall `status: "fail"` (AC-4); if all are `"pass"` or `"skip"`, overall `status: "pass"`. The `promotedTo` field is `null` (Story 2.6 dispatch/promote.ts populates this after atomic copy).
  - [x] 9.8 Algorithm step 6 — **Validate + write**: construct the `VerifierResultV1` literal, call `VerifierResultV1Schema.parse(result)` for defence-in-depth (per Story 1.5 schema-validation pattern), then `await atomicWrite(resultPath, JSON.stringify(result, null, 2))` to write atomically with `.bak` rotation.
  - [x] 9.9 Algorithm step 7 — **Return** `{ ...result, resultPath }`.
  - [x] 9.10 Error handling: if the staging directory does not exist, throw `VerifierFailureError` (existing class from Story 1.2 registry) with message `staging/<runId>/ does not exist`. Per AR21, the error carries the registry's `actionableHint`. The `runVerifier` itself does NOT throw on AC-4 failure paths — those are reported via `status: "fail"` in the returned struct (the failure-UX engine in Story 5.x decides what to do with the failure).

- [x] **Task 10 — Implement test files (AC: all)**
  - [x] 10.1 Create `src/verifiers/registry.test.ts`. Tests:
    - registry contains all 8 entries (default + 7 step types).
    - `getVerifierConfig("dev-story")` returns the dev-story config verbatim.
    - `getVerifierConfig("unknown-step")` returns the `default` baseline (fallback path).
    - `defaultVerifiers.default` satisfies the `VerifierConfig` shape.
  - [x] 10.2 Create `src/verifiers/defaults.test.ts`. Tests:
    - Each per-step config is shape-valid (no `undefined` required fields; arrays are arrays; schema is null).
    - Per-step `requiredFrontmatterSections` lists are non-empty for `prd`, `architecture`, `story-create`, `dev-story`, `code-review`, `retro` (frontmatter discipline is mandatory for these step types).
    - The `default` baseline has empty `requiredFiles` and empty `requiredFrontmatterSections` (true fallback).
  - [x] 10.3 Create `src/verifiers/run-verifier.test.ts`. Per AR35, use Bun's built-in test runner; spin up tmpdirs per test via `node:fs/promises mkdtemp(path.join(os.tmpdir(), "stepper-verifier-"))`. Tests:
    - **AC-2 happy path**: write a fixture artifact at `<tmpdir>/staging/run-1/outputs/dev-story.md` with valid frontmatter (`title:`, `status:`); call `runVerifier("run-1", { stepName: "dev-story", stagingRoot: <tmpdir>/staging })`. Assert `result.status === "pass"`, `result.checks.length === 4` (`required-files: pass`, `frontmatter: pass`, `schema: skip`, `custom: skip`), `verifier-result.json` exists at `<tmpdir>/staging/run-1/verifier-result.json` and parses against `VerifierResultV1Schema`.
    - **AC-3 fail path**: write a fixture artifact missing the `status` frontmatter key. Call `runVerifier`. Assert `result.status === "fail"` and `result.checks.find(c => c.name === "frontmatter").status === "fail"` and the `detail` includes "Missing frontmatter key: status".
    - **AC-4 schema check**: register a temporary verifier config with a non-null Zod schema; assert the schema check runs and passes/fails appropriately. (May skip if registry override is not implemented in v0.1; the schema check is exercised via direct call to `checks/schema.ts` instead.)
    - **AC-5 custom deterministic**: register a temporary config with a `custom?` callback that returns `{ ok: true, value: undefined }`; assert it runs and returns `pass`. Register a callback that returns `{ ok: false, error: { check: "custom", detail: "boom" } }`; assert it returns `fail` with detail "boom".
    - **NFR-R1 atomic write**: assert that `verifier-result.json` is written via `atomicWrite` (the file appears AFTER the atomic rename — partial writes are not observable). Verified by inspecting `verifier-result.json.bak` rotation if a second `runVerifier` call overwrites it.
  - [x] 10.4 Create `src/verifiers/checks/required-files.test.ts`, `src/verifiers/checks/frontmatter.test.ts`, `src/verifiers/checks/schema.test.ts`, `src/verifiers/checks/custom.test.ts`. Each file contains 2-3 unit tests covering pass / fail / skip paths.

- [x] **Task 11 — Quality gates (AC: all)**
  - [x] 11.1 Run `bun run check` — expect 0 fail, baseline 311 + ~25-35 new tests passing (~340 total). Record in Completion Notes.
  - [x] 11.2 Run `bun run lint` (Biome) — expect 0 errors, 0 warnings. Confirm `src/verifiers/**/*.ts` adheres to project Biome config.
  - [x] 11.3 Run `bun run typecheck` (`tsc --noEmit`) — expect 0 errors. The `VerifierConfig`, `ArtifactRef`, `VerifierError`, `Result<T, E>`, `RunVerifierOptions`, `RunVerifierResult` types MUST type-check cleanly.
  - [x] 11.4 Run AR41 import-boundary check (manual grep, until automated CI gate lands) — expect zero violations from `src/verifiers/**/*.ts`. Banned imports for the higher-tier verifier module: `../dispatch/`, `../failure-ux/`, `node:child_process`, any new external runtime dep beyond `zod`.
  - [x] 11.5 Confirm `src/errors.ts` registry stays at 16 codes. Story 2.1 USES `VerifierFailureError` (existing class) but does NOT extend the registry.
  - [x] 11.6 Confirm `bun run check` exits 0 on a clean checkout (`git stash && bun run check && git stash pop`).
  - [x] 11.7 **Manual smoke (recommended)**: write a fixture artifact at `/tmp/staging-smoke/run-1/outputs/dev-story.md`, call `runVerifier("run-1", { stepName: "dev-story", stagingRoot: "/tmp/staging-smoke" })` from a bun REPL or a one-off `bun run` script, verify the `verifier-result.json` is written and validates.

- [x] **Task 12 — Update story status + sprint status (AC: all)**
  - [x] 12.1 Update story file frontmatter: `status: ready-for-dev` → `status: review` (after dev completes; the bmad-create-story persona starts at `ready-for-dev`).
  - [x] 12.2 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: `2-1-verifier-configuration-registry: ready-for-dev` → `in-progress` → eventually `review` → `done` per Stepper's status transitions. (`epic-2: backlog → in-progress` is performed by bmad-create-story per sprint-status comments — see this story's create-story task record.)
  - [x] 12.3 Append a Change Log entry per the template at the bottom of this file.

## Dev Notes

### Architecture compliance

- **§D9 (lines 477-499) — Per-step verifier configuration**: `VerifierConfig` shape is verbatim from lines 482-487. Resolution priority (lines 490): "Project config (`bmad-stepper.config.yaml` `verifiers:`) overrides plugin defaults" — Story 2.1 ships **only the plugin defaults**; the project-config-aware override is Story 6.5. The four failure-UX modes (lines 492-499) are consumed BY the verifier output but live in `src/failure-ux/` (Epic 5).
- **§P5 (lines 901-915) — Verifier output JSON shape**: the canonical `verifier-result.json` shape is reproduced in `src/schemas/verifier-result.ts` (Story 1.5 — already shipped). Story 2.1's `runVerifier` writes a literal validated against `VerifierResultV1Schema` and returns the typed `VerifierResult`.
- **§directory-listing (line 1163) — `src/verifiers/`**: the architecture-prescribed directory layout lists `src/verifiers/` with `index.ts`, `default.ts`, `analyst-research.ts`, `prd.ts`, `architecture.ts`, `story-create.ts`, `dev-story.ts`, `code-review.ts`, `retro.ts`. Story 2.1 ships these under `src/verifiers/defaults.ts` (single file containing all default configs) instead of one-file-per-step — this preserves the architecture-listed step coverage while reducing file count for v0.1. The architecture's per-step file split can land in Story 6.5 if project-config overrides require per-step granularity.
- **§AR41 (lines 1287-1289) — Higher-tier boundary**: `src/verifiers/` is **higher-tier**. Allowed imports: foundational (`../errors.ts`, `../io/`, `../schemas/`); mid-tier (`../dag/index.ts`, `../personas/index.ts` — both OPTIONAL in v0.1). FORBIDDEN: sibling higher-tier (`../dispatch/`, `../failure-ux/`); top-tier (`../commands/`); `node:child_process`; any new external runtime dep beyond `zod`. The composition of (verifier + dispatch + failure-ux) belongs at the runner tier (`src/commands/next/verify-and-advance.ts`, Story 2.6).
- **§line 858 — `Result<T, E>` sole exception to AR33**: per architecture's "Sole exception" clause, the CLI argument parser returns `Result<Args, ParseError>`. Story 2.1 extends this exception by analogy to the `custom?` callback signature: project authors writing custom verifiers may return `Result<void, VerifierError>` to surface failure detail without throwing. This is documented in the `VerifierConfig.custom` JSDoc and in `types.ts` Result-type JSDoc.
- **§line 1727 — LLM-as-judge `judge:` field deferred post-v0.1**: the architecture explicitly rejects an LLM-as-judge field for v0.1; v0.1 ships **conservative deterministic checks only**. `defaults.ts` JSDoc cites this design decision.
- **AR21, AR22**: existing `VerifierFailureError` (registry index — Story 1.2) carries `code: "VERIFIER_FAILURE"`, `exitCode: 1`, hint `See _bmad-output/.stepper/runs/<ts>-<step>.log for the verifier output; try /bmad-next --resume after fixing the underlying issue.`. Story 2.1 throws this class from `runVerifier` ONLY for orchestration-level failures (e.g., staging directory missing); per-check failures are reported via `status: "fail"` in the returned struct, NOT as thrown errors (the failure-UX engine in Story 5.x decides what to do).
- **AR33 — function & error semantics**: `runVerifier` is `async`; throws `StepperError` subclasses for orchestration-level failures (NEVER for per-check failures); uses `Result<T, E>` only inside `custom?` callbacks per architecture line 858; no `console.*`; uses `info` / `error` from `src/io/log.ts` for logging.

### Verifier shape design rationale (per epic-1-retrospective forward action item)

Per epic-1-retrospective.md §Forward Action Items for Epic 2 line 101: "Story 2.1: Design `VerifierConfig` shape; consider `hintOverride?` pattern continuity for verifier-specific error hints." The shape decisions:

- **`requiredFiles: readonly string[]`**: glob patterns relative to `staging/<runId>/outputs/`. Bun's `Bun.Glob(pattern).scan({ cwd })` is the canonical implementation. Stories 1.10's seed-v6.x.ts pattern (hand-curated literals) is the precedent for declaring the per-step lists in `defaults.ts`.
- **`requiredFrontmatterSections: readonly string[]`**: top-level YAML frontmatter keys. Parses via `Bun.YAML.parse()` (architecture §D3 — already in use throughout the codebase). Per-key existence check; depth-1 only (no dotted-path lookup) — sufficient for v0.1.
- **`schema: ZodSchema | null`**: Zod schema for the artifact body. v0.1 default configs all set `schema: null` — the Zod schemas for per-artifact bodies (e.g., `dev-story` body must contain `## Acceptance Criteria`) are deferred to Story 6.x. The implementation in `checks/schema.ts` is in place so Story 6.x can register schemas without modifying the runner.
- **`custom?: (artifact) => Promise<Result<void, VerifierError>> | Result<void, VerifierError>`**: optional deterministic-stateless callback. v0.1 default configs do NOT register any custom callbacks (deferred to Story 6.5 project-config overrides). The signature accepts both sync and async callbacks for caller convenience. The return type is `Result<void, VerifierError>` per architecture §D9 line 486.
- **`hintOverride?` pattern decision**: per epic-1-retrospective forward action, Story 2.1 considered adding a `VerifierConfigError` class with the `hintOverride?` constructor pattern (Story 1.10 / 1.11 precedent). **Decision: defer** — the registry currently sits at 16 codes; no v0.1 throw site requires a verifier-specific hint that the existing `ConfigError` (Story 1.11 — `Add a verifier override for <step> in bmad-stepper.config.yaml under the verifiers: block.`) cannot deliver. If Story 6.5 introduces a verifier-config override resolver that needs an AC-verbatim hint, that is the natural call site for adding a new class with `hintOverride?`. Tracked as a non-blocking forward-dep.

### Logging discipline (AR/FR54)

Per architecture line 1396 (NFR-S1) + `src/io/log.ts` (Story 1.3): all verifier-progress logging goes to **stderr** via `info()` / `warn()` / `error()`. **stdout stays empty** — Story 2.4's `run.ts` reserves stdout for the JSON-line dispatch protocol; verifier output (`verifier-result.json`) is written to disk, NOT to stdout. The `runVerifier` orchestrator does NOT print directly; it returns the structured result and writes the JSON file. The caller (Story 2.6 `verify-and-advance.ts`) decides what to log.

### Atomic write discipline (NFR-R1, NFR-S5)

Per Story 1.3's `src/io/atomic-write.ts` contract: writes go to `path.tmp` first, then `fs.rename(path.tmp, path)`, with `.bak` rotation kept for one cycle. Story 2.1's `runVerifier` MUST use `atomicWrite` (NOT `Bun.write` directly) for `verifier-result.json` so the file is never observable in a partial state. The `.bak` rotation is preserved automatically — if `verifier-result.json` exists from a prior run (e.g., a retry), the old file becomes `verifier-result.json.bak` and the new file replaces it atomically.

### Test pattern (AR35)

Per Story 1.3 / 1.4 / 1.5 / 1.6 / 1.8 / 1.9 / 1.10 / 1.11 / 1.12 precedent:
- Use Bun's built-in test runner (`bun test`).
- Spin up a tmpdir per test via `node:fs/promises mkdtemp(path.join(os.tmpdir(), "stepper-verifier-"))`.
- Clean up via `afterEach rm({ recursive: true })`.
- NEVER hard-code `/tmp/...` paths.
- For `runVerifier()` integration tests, call the testable export directly and inspect the returned `RunVerifierResult` struct + the on-disk `verifier-result.json`.

### Forward-dep notes

- **Story 2.2 — Dispatch spec generator**: writes `staging/<runId>/dispatch-spec.json`. Story 2.6's `verify-and-advance.ts` will read the dispatch-spec to extract the `step` field, then call `runVerifier(runId, { stepName: dispatchSpec.step })`. v0.1 Story 2.1's orchestrator accepts the step name explicitly via `opts.stepName` so testing doesn't require a dispatch-spec fixture — Story 2.6 can either keep the explicit param or extend `runVerifier` to read from `dispatch-spec.json` directly.
- **Story 2.3 — Generic sub-agent runner**: produces the artifact at `staging/<runId>/outputs/`. Story 2.1's verifier reads from this directory; the artifact filename convention (`<stepName>.md` OR the step's primary output file) is documented in the dispatch-spec contract (Story 2.2).
- **Story 2.6 — `verify-and-advance.ts`**: the canonical consumer of `runVerifier`. Story 2.6 calls `runVerifier(runId, { stepName })`, inspects `result.status`, and dispatches to the failure-UX engine on `"fail"` (Epic 5) or to `src/dispatch/promote.ts` on `"pass"` (Story 2.6's own deliverable).
- **Story 5.1-5.4 — Failure-UX modes**: consume the `VerifierResultV1` shape from this story. The four modes (`retry`, `skip`, `route-to-fixer`, `escalate`) all read `result.status === "fail"` + `result.checks[]` to decide remediation.
- **Story 6.5 — Verifiers per-step config override**: extends Story 2.1's registry with project-config layer resolution. Reads `bmad-stepper.config.yaml` `verifiers:` block (per FR38), validates against a `VerifiersConfigSchema` (extends `src/schemas/config.ts`), and returns the merged config from `getVerifierConfig`. Story 6.5 may also introduce a `VerifierConfigError` with `hintOverride?` for AC-verbatim hint substitution.

### AR41 boundary (higher-tier)

`src/verifiers/` is the FIRST higher-tier module of the project. Per architecture lines 1287-1289, higher-tier modules depend on foundational + mid-tier; never on sibling higher-tier modules.

**Allowed imports** for `src/verifiers/**/*.ts`:
- `../errors.ts` (foundational; for `VerifierFailureError` orchestration-level throws).
- `../io/log.ts` (foundational; for `info` / `error` writers — stderr discipline).
- `../io/paths.ts` (foundational; for `STAGING_PATH` canonical staging directory + `assertWithinScope` for write-target validation).
- `../io/atomic-write.ts` (foundational; for `atomicWrite` — NFR-R1 atomic JSON write).
- `../schemas/verifier-result.ts` (foundational; for `VerifierResultV1Schema`, `VerifierResult` types).
- `../dag/index.ts` (mid-tier; OPTIONAL — only if `runVerifier` ever needs to validate the step name against the DAG; v0.1 accepts it directly).
- `../personas/index.ts` (mid-tier; OPTIONAL — same rationale; v0.1 doesn't need persona resolution at verify-time).
- Bun stdlib: `Bun.file`, `Bun.write`, `Bun.YAML`, `Bun.Glob`.
- Node stdlib: `node:fs/promises`, `node:path`, `node:os`.
- External libraries: `zod` (for the `VerifierConfig.schema` field type).

**FORBIDDEN imports** for `src/verifiers/**/*.ts`:
- `../dispatch/**` (sibling higher-tier — composition lives at runner tier per AR41).
- `../failure-ux/**` (sibling higher-tier — same).
- `../commands/**` (top-tier — verifiers cannot import from commands).
- `node:child_process` — use `Bun.spawn` if a subprocess is ever required (v0.1 doesn't need any).
- Any new external runtime dep beyond `zod`.

The architecture's import-boundary CI check excludes `*.test.ts` files from cross-module restrictions; the test files MAY import freely (e.g., `defaults.test.ts` may import test fixtures from anywhere).

## Previous Story Intelligence

This is iteration 1 of Epic 2 — the **opening story** of the second epic. Lessons learned from Stories 1.1–1.13 directly applicable to Story 2.1:

### Story 1.1 — Bun host scaffold

- Bun 1.3.12 is the minimum supported runtime (AR2). Story 2.1's tests use `Bun.write`, `Bun.file`, `Bun.YAML`, `Bun.Glob`, and Bun's built-in test runner. No `bun add` is required (zero new deps — `zod` is already pinned per Story 1.1).
- `package.json` `scripts` block exposes `check`, `lint`, `typecheck`, `test`. Story 2.1 must keep these passing.

### Story 1.2 — Errors module + registry CI gate

- The 16-entry registry contains `VerifierFailureError` (`code: "VERIFIER_FAILURE"`, `exitCode: 1`). Story 2.1 USES this class for orchestration-level throws (e.g., staging dir missing); does NOT extend the registry.
- The `errors.test.ts` registry CI gate enforces the AR22 "Run/See/Try/Check"-prefixed actionable-hint discipline. Story 2.1's runner surfaces `error.actionableHint` verbatim; no string mutation.
- The `hintOverride?` constructor pattern (Stories 1.10 `UnknownBmadSkillError` + 1.11 `ConfigError`) is the precedent for adding per-instance hint overrides without registry bloat. **Story 2.1 deliberately defers** adding a `VerifierConfigError` with this pattern — no v0.1 throw site requires it. Story 6.5 (per-step verifier config override) is the natural call site.

### Story 1.3 — Logger + path helpers + atomic write

- `src/io/log.ts` exports `info`, `warn`, `error`, `json`. Story 2.1 imports `info` (for verifier-progress logging) and `error` (for orchestration-level failures). Per architecture line 1396 (NFR-S1) and FR54, all three write to **stderr**.
- `src/io/paths.ts` exports `STAGING_PATH` (the canonical `_bmad-output/.stepper/staging/` directory) and `assertWithinScope()`. Verifier writes only inside `staging/<runId>/` — within scope.
- `src/io/atomic-write.ts` exports `atomicWrite(path, contents)`. Story 2.1 uses this for `verifier-result.json` (NFR-R1 zero data loss).

### Story 1.4 — File lock with heartbeat

- `src/lock/lock.ts` is a mid-tier sibling. Per architecture line 1672 + AR41, the verifier itself is **not** a lock-acquiring runner — Story 2.6's `verify-and-advance.ts` is the lock-acquiring caller. Story 2.1's `runVerifier` is **lock-agnostic**: it can be called with or without a held lock; it does not acquire one itself. The lock semantics live at the runner tier.

### Story 1.5 — Schemas + migrations skeleton

- `src/schemas/verifier-result.ts` exports `VerifierResultV1Schema`, `VerifierResultV1`, `VerifierResult`, `VerifierResultLatestSchema`. Story 2.1 imports `VerifierResultV1Schema` for defence-in-depth validation before atomic write, and `VerifierResult` as the return type.
- Story 1.5's canonical fixture (`canonicalVerifierResultV1Fixture` in `verifier-result.test.ts`) is `{ schemaVersion: 1, status: "pass", checks: [], promotedTo: null }`. Story 2.1's `runVerifier` produces an analogous shape with populated `checks[]` (one entry per check function).
- The `status` enum is `"pass" | "fail" | "skip"` — Story 2.1's check functions return one of these three statuses per check. The orchestrator aggregates into the overall `status: "pass" | "fail"` (no aggregate `"skip"` — if all checks skip, the overall is `"pass"` per v0.1 conservative semantics).

### Story 1.6 — State subsystem load/save/recompute skeleton

- `src/state/load.ts` and `src/state/save.ts` are mid-tier siblings. Story 2.1's `runVerifier` does NOT touch `state.yaml` — state advance is Story 2.6's deliverable. The verifier writes only `verifier-result.json` under `staging/<runId>/`.

### Story 1.7 — CLI argument parser

- Story 1.7's `Result<T, E>` type pattern (architecture line 858 sole exception to AR33) is reused by Story 2.1's `VerifierConfig.custom?` callback signature. The custom callback returns `Result<void, VerifierError>` to surface failure detail without throwing — same shape, same precedent.
- Story 1.7's hand-rolled tokenizer + Zod schema + `.strict()` rejection pattern is NOT used by Story 2.1 (no CLI surface — verifier is invoked programmatically by Story 2.6).

### Story 1.8 — Snapshot branch+sha detection

- `src/snapshot/` is mid-tier; not touched by Story 2.1. Story 2.6's `verify-and-advance.ts` may invoke snapshot capture before verification (architecture §D10 checkpoint mechanism); Story 2.1 doesn't.

### Story 1.9 — BMAD detection

- `src/bmad-detect/` is mid-tier; not touched by Story 2.1. The verifier reads artifacts from `staging/<runId>/outputs/`, not from the BMAD plugin directory.

### Story 1.10 — DAG seed + three-tier registry

- `src/dag/index.ts` is mid-tier; v0.1 Story 2.1 does NOT import from it (the step name is provided directly via `opts.stepName`). If a future polish PR wants to validate the step name against the DAG, the import is allowed by AR41 (higher-tier may import mid-tier).
- Story 1.10's hand-curated seed-v6.x.ts pattern (literal entries for 38 BMAD skills) is the **precedent** for Story 2.1's `defaults.ts` (literal per-step VerifierConfig entries for 7 step types + 1 baseline).
- Story 1.10's `UnknownBmadSkillError` with `hintOverride?` pattern is the precedent considered (and deferred) for Story 2.1's potential `VerifierConfigError`.
- Story 1.10's `tarjan.ts → sort.ts` rename carry-over is independent of Story 2.1; will land in Story 3.6/3.7.

### Story 1.11 — Persona resolution

- `src/personas/index.ts` is mid-tier; v0.1 Story 2.1 does NOT import from it (verification doesn't need persona resolution). If a future polish PR adds a `personaCheck` custom verifier (e.g., assert the artifact's frontmatter `persona:` field matches the dispatched persona), the import is allowed by AR41.
- Story 1.11's `ConfigError` with `hintOverride?` constructor pattern is the SECOND precedent for the deferred `VerifierConfigError` (the canonical pattern for AC-verbatim hint substitution without registry bloat).
- Story 1.11's `defaults.ts` pattern (one file containing all default persona mappings) is the **direct precedent** for Story 2.1's `defaults.ts` (one file containing all default verifier configs). Both files are pure data with zero IO at module load.
- Story 1.11's reviewer NIT-1 (`export type ResolvedPersona`) carry-over does NOT block Story 2.1.

### Story 1.12 — `/bmad-next --doctor` Command

- Story 1.12 was the **first integration command** (top-tier) — Story 2.1 is the **first higher-tier module**. Both follow the AR41 boundary discipline; Story 2.1 has tighter import restrictions (no sibling higher-tier imports) than Story 1.12 (top-tier may import everything).
- Story 1.12's `Bun.file(path).size === 0` pre-check pattern (dev-002 deviation) is NOT directly applicable to Story 2.1 — verifier reads markdown/JSON artifacts where size is not a meaningful pre-check; the frontmatter check handles malformed/empty files via the YAML parse error path.
- Story 1.12's spawn-with-cwd marketplace test pattern (dev-003) is NOT directly applicable to Story 2.1 — verifier is invoked programmatically, not via spawn. (Story 2.8's smoke test will use the spawn-with-cwd pattern when validating the full `/bmad-next` happy path including verification.)
- Story 1.12's composer-at-runner pattern (the doctor runner composes mid-tier modules) is the **direct precedent** for Story 2.6 (`verify-and-advance.ts` composes Story 2.1's verifier + Story 2.6's promote + Epic 5's failure-ux). Story 2.1 itself stays pure (no composition); the composition belongs at the runner tier.
- Story 1.12's `countProjectOverrides` inline YAML extractor (info I3 carry-over) — independent of Story 2.1; will land in Story 6.1's config-yaml schema loader.
- Story 1.12's persona-resolvability check (info I1 deferred) — independent of Story 2.1; will land in Story 3.6 `--explain --reasoning-trace`.

### Story 1.13 — Quick-Start Documentation

- Story 1.13 shipped zero `*.ts` deltas (documentation-only). Story 2.1 ships TS code; its README documentation is deferred to Epic 6 (Story 6.10 marketplace release). Story 2.1's JSDoc on every file IS the canonical source-tree documentation.

### Epic 1 Retrospective forward action items applied

Per `_bmad-output/implementation-artifacts/epic-1-retrospective.md` §Forward Action Items for Epic 2:

- **Story 2.1 forward action (line 101)**: "Design `VerifierConfig` shape; consider `hintOverride?` pattern continuity for verifier-specific error hints." — **APPLIED** in §Verifier shape design rationale + §Previous Story Intelligence (1.10, 1.11). Decision: ship the architecture §D9 shape verbatim; defer `hintOverride?` extension until Story 6.5 throw site requires it.
- **Recommended planning sequence (line 110-115)**:
  - "Front-load Story 2.4 (lock-free `run.ts`) early" — Story 2.1 is sequenced FIRST per epics.md ordering; Story 2.4 lands later in Epic 2.
  - "Story 2.2 (dispatch spec generator) must precede Story 2.3 (generic sub-agent runner)" — independent of 2.1.
  - "Allocate review iteration budget for Story 2.6 (verify-and-advance) — first lock-acquiring runner" — Story 2.1 ships the verifier; Story 2.6 is the lock-acquiring composer.
  - "Review Story 1.12's marketplace smoke test pattern before Story 2.8" — independent of 2.1.
- **Apply tighter scoping for stories above 600 lines (line 165)** — Story 2.1's spec targets ~400-500 lines (this file). Below the 600-line threshold; on-budget.

## Forward Dependencies

Stories that consume Story 2.1's `src/verifiers/` module surface:

- **Story 2.2 — Dispatch spec generator**: writes `staging/<runId>/dispatch-spec.json` containing the `step` field. Story 2.6 reads this and passes `dispatchSpec.step` as `opts.stepName` to `runVerifier`.
- **Story 2.6 — `verify-and-advance.ts` with state-hash check** [PRIMARY CONSUMER]: the canonical caller of `runVerifier(runId, { stepName })`. Inspects `result.status`, dispatches to failure-UX on `"fail"` or to `src/dispatch/promote.ts` on `"pass"`. First lock-acquiring runner.
- **Story 2.7 — Slash command for `/bmad-next` (Layer 1 markdown)**: the markdown body invokes `bun run src/commands/next/verify-and-advance.ts` which calls `runVerifier`. Indirect consumer.
- **Story 2.8 — Smoke test for `/bmad-next` happy path**: the smoke test asserts that `staging/<runId>/verifier-result.json` exists with `status: "pass"` after the full happy-path flow.
- **Story 5.1 — Retry failure mode**: consumes `VerifierResultV1` from Story 2.1; reads `result.status === "fail"` + `result.checks[]` to decide retry.
- **Story 5.2 — Skip failure mode (`--skip` flag)**: consumes `VerifierResultV1` to surface the failed check name in the skip log.
- **Story 5.3 — Route-to-fixer failure mode (`--auto-fix` flag)**: consumes `VerifierResultV1` to construct the fixer sub-agent's CONTEXT section (the failure detail).
- **Story 5.4 — Escalate failure mode**: consumes `VerifierResultV1` to construct the actionable-error report on halt.
- **Story 6.5 — Verifiers per-step config override** [SECOND PRIMARY EXTENSION]: extends Story 2.1's `getVerifierConfig` with project-config layer resolution. Reads `bmad-stepper.config.yaml` `verifiers:` block per FR38 (the second half of FR38 deferred from Story 2.1). May introduce `VerifierConfigError` with `hintOverride?` constructor pattern.

## Project Structure Notes

`src/verifiers/` joins the higher-tier module set per architecture lines 1287-1289. After Story 2.1, the higher-tier set will contain:

- `src/verifiers/` — Story 2.1 (this story).
- `src/dispatch/` — Story 2.2 + Story 2.6 (sibling higher-tier; introduced in subsequent stories).
- `src/failure-ux/` — Epic 5 (sibling higher-tier; introduced in Stories 5.1-5.4).

Per AR41 (mid-to-mid ban applied by analogy to higher-to-higher), these three modules MUST NOT import from each other. Composition belongs at the runner tier (`src/commands/next/verify-and-advance.ts`).

Story 2.1's deliverable file count:
- New source files (8): `index.ts`, `types.ts`, `defaults.ts`, `registry.ts`, `run-verifier.ts`, `checks/required-files.ts`, `checks/frontmatter.ts`, `checks/schema.ts`, `checks/custom.ts`.
- New test files (6): `registry.test.ts`, `defaults.test.ts`, `run-verifier.test.ts`, `checks/required-files.test.ts`, `checks/frontmatter.test.ts`, `checks/schema.test.ts`, `checks/custom.test.ts`.
- Modified files (0): no pre-existing files touched (errors registry stays at 16; `src/schemas/verifier-result.ts` already exists from Story 1.5).

Estimated baseline progression: 311 (Story 1.13 final) → ~340-345 (Story 2.1 + ~25-35 new tests).

## References

- `_bmad-output/planning-artifacts/architecture.md` §D9 lines 477-499 (`VerifierConfig` shape + resolution priority + failure-UX modes — primary)
- `_bmad-output/planning-artifacts/architecture.md` §P5 lines 901-915 (`verifier-result.json` shape + promotion contract)
- `_bmad-output/planning-artifacts/architecture.md` §line 858 (`Result<T, E>` sole exception to AR33 throw discipline)
- `_bmad-output/planning-artifacts/architecture.md` §line 1163 (`src/verifiers/` directory layout — D9, FR17, FR38)
- `_bmad-output/planning-artifacts/architecture.md` §lines 1287-1289 (AR41 higher-tier boundary)
- `_bmad-output/planning-artifacts/architecture.md` §line 1347 (FR17 mapping — `src/verifiers/`, `src/dispatch/promote.ts`, `src/schemas/verifier-result.ts`)
- `_bmad-output/planning-artifacts/architecture.md` §line 1368 (FR38 mapping — `src/schemas/config.ts`, `src/verifiers/index.ts`)
- `_bmad-output/planning-artifacts/architecture.md` §line 1727 (LLM-as-judge `judge:` field deferred post-v0.1)
- `_bmad-output/planning-artifacts/prd.md` FR17 line 690 (verifier before promote)
- `_bmad-output/planning-artifacts/prd.md` FR38 line 720 (verifiers per step `verifiers:` block)
- `_bmad-output/planning-artifacts/epics.md` Story 2.1 lines 578-595 (AC verbatim source)
- `_bmad-output/implementation-artifacts/epic-1-retrospective.md` §Forward Action Items for Epic 2 line 101 (Story 2.1 design notes)
- `src/errors.ts` lines 171-176 (`VerifierFailureError` registry entry — Story 1.2)
- `src/schemas/verifier-result.ts` (Story 1.5 — already shipped)
- `src/schemas/verifier-result.test.ts` (canonical fixture — Story 1.5)
- `src/io/log.ts`, `src/io/paths.ts`, `src/io/atomic-write.ts` (Story 1.3 foundational primitives)
- `_bmad-output/implementation-artifacts/1-12-bmad-next-doctor-command.md` (template structure precedent)
- `_bmad-output/implementation-artifacts/1-11-persona-resolution.md` (`defaults.ts` + `index.ts` barrel pattern precedent)
- `_bmad-output/implementation-artifacts/1-10-dag-seed-three-tier-registry.md` (hand-curated literal-entries pattern + `hintOverride?` precedent)

## Dev Agent Record

### Context Reference

- _bmad-output/planning-artifacts/architecture.md §D9 lines 477-499 (VerifierConfig shape)
- _bmad-output/planning-artifacts/architecture.md §P5 lines 901-915 (verifier-result.json shape)
- _bmad-output/planning-artifacts/architecture.md §lines 1287-1289 (AR41 higher-tier boundary)
- _bmad-output/planning-artifacts/architecture.md §line 858 (Result<T,E> sole-exception)
- _bmad-output/planning-artifacts/architecture.md §line 1727 (LLM-as-judge deferred post-v0.1)
- _bmad-output/planning-artifacts/prd.md FR17 line 690 (verifier before promote)
- _bmad-output/planning-artifacts/prd.md FR38 line 720 (verifiers per step block)
- _bmad-output/implementation-artifacts/1-11-persona-resolution.md (defaults.ts pattern precedent)
- src/errors.ts (VerifierFailureError verbatim)
- src/io/log.ts, src/io/atomic-write.ts (foundational primitives)
- src/schemas/verifier-result.ts (Story 1.5 — VerifierResultV1Schema)

### Agent Model Used

claude-opus-4-7[1m]

### Debug Log References

- Bun host version: 1.3.12 (satisfies AR2 Bun >= 1.3).
- Baseline `bun run check`: 311 pass / 0 fail / 1161 expects / 32 files (Story 1.13 final).
- Final `bun run check`: 354 pass / 0 fail / 1379 expects / 35 files.
- Test delta: +43 (target was 25-35; the per-check unit tests + orchestrator integration tests + custom-callback edge cases pushed higher than the planning estimate).
- `bunx tsc --noEmit` exit 0 after registry.test.ts type fix (`expect(...).toEqual(... as VerifierConfig)` to handle `Record<string, T>` index-returns-T|undefined under tsc strict mode; Bun's runtime expect accepts both shapes but tsc's overload resolution rejects the union).
- `bunx biome ci .` exit 0 after auto-applied formatter rewrites + import organize + useLiteralKeys (Biome-preferred `verifierRegistry.default` over `verifierRegistry["default"]` where the key is a valid identifier).
- `bun test src/errors.test.ts`: 10 pass / 197 expects (registry stable at 16 codes; no new error class added — `VerifierConfigError` deferred to Story 6.5 per planning).
- AR41 boundary check (manual grep `from "\.\.?/(dispatch|failure-ux|commands|bmad-detect|dag|personas|state|snapshot)/"` against `src/verifiers/`): zero violations. `node:child_process`: zero usages.

### Completion Notes

- **Architecture deviation: file layout** — the user prompt's allowed-mutation-paths set consolidated the 4 per-check files (`checks/required-files.ts`, `frontmatter.ts`, `schema.ts`, `custom.ts`) plus the orchestrator (`run-verifier.ts`) into a single `src/verifiers/checks.ts` file (5 source files instead of 9). The story spec proposed a `src/verifiers/checks/` subdirectory + per-check files; the dispatched plan opted for a flatter layout. Rationale: 8 file count limit per the user prompt; lower module count for the first higher-tier module; identical public surface via the `index.ts` barrel. Story 6.5 may refactor into per-check files if project-config overrides require finer per-file granularity (no observable behavior change).
- **Architecture deviation: stagingRoot is REQUIRED** — the story spec implied `stagingRoot` defaults to `STAGING_PATH` from `src/io/paths.ts`. That constant does NOT yet exist (Story 1.3 shipped `STEPPER_INTERNAL_ROOT` + `BMAD_OUTPUT_ROOT` only; `STAGING_PATH` is a Story 2.2 forward-dep alongside the dispatch-spec generator). For v0.1, `runVerifier` throws `VerifierFailureError` if `stagingRoot` is omitted — the canonical `STAGING_PATH` default lands in Story 2.2.
- **Errors registry remained at 16 codes** (verified via `bun test src/errors.test.ts`). `VerifierFailureError` (existing class from Story 1.2) is the orchestration-level throw site; no `VerifierConfigError` added — deferred to Story 6.5 per epic-1-retrospective forward action item.
- **AR41 boundary verified** — `src/verifiers/**/*.ts` import only from foundational (`../errors.ts`, `../io/log.ts`, `../io/atomic-write.ts`, `../schemas/verifier-result.ts`), Bun stdlib (`Bun.file`, `Bun.YAML`, `Bun.Glob`), Node stdlib (`node:fs/promises`, `node:path`, `node:os`), `zod`, `bun:test`, and intra-module siblings. NO sibling higher-tier (`../dispatch/`, `../failure-ux/`); NO mid-tier (`../bmad-detect/`, `../dag/`, `../personas/`, `../state/`, `../snapshot/`); NO top-tier (`../commands/`); NO `node:child_process`.
- **AR35 tmpdir pattern honored** — every test that touches the filesystem uses `mkdtemp(path.join(os.tmpdir(), "stepper-verifier-..."))`. Cleanup via `fs.rm(tmp, { recursive: true, force: true })` in `afterEach`. NEVER hard-code `/tmp/...`.
- **AC-5 deterministic-stateless contract** — enforced by JSDoc + the `ArtifactRef` (path-handle, NOT parsed body) signature. Runtime sandboxing (lint-time `fetch(`/`http.`/`https.` scan) is a Story 6.5 polish PR per the story spec.
- **Defence-in-depth Zod validation** — `VerifierResultV1Schema.parse(result)` runs before atomic-write; per Story 1.5 schema-validation pattern.
- **NFR-R1 atomic write + .bak rotation** — verified in test 23 (`runVerifier` invoked twice, `verifier-result.json.bak` exists with prior content).
- **NFR-S1 no main-thread network** — no `fetch`, no network imports.
- **NFR-S6 no execution of sub-agent output** — verifier reads via `Bun.file().text()`; never `eval`s, `require()`s, or `import`s the artifact.

### File List

**New source files (5):**
- src/verifiers/index.ts (public barrel)
- src/verifiers/types.ts (VerifierConfig, ArtifactRef, VerifierError, Result, CheckResult)
- src/verifiers/registry.ts (verifierRegistry, getVerifierConfig)
- src/verifiers/defaults.ts (8-entry defaultVerifiers map)
- src/verifiers/checks.ts (4 check functions + runVerifier orchestrator)

**New test files (3):**
- src/verifiers/registry.test.ts (12 tests)
- src/verifiers/defaults.test.ts (10 tests)
- src/verifiers/checks.test.ts (21 tests — per-check + orchestrator)

**Modified files (0)** — no pre-existing source files touched. Errors registry unchanged (16 codes).

**Test count progression:** 311 (baseline) → 354 (final) → +43 tests (target 25-35; over-shot due to per-check unit-test depth and orchestration edge cases).

## Senior Developer Review (AI)

**Reviewer:** senior-code-reviewer (model `claude-opus-4-7[1m]`)
**Date:** 2026-04-30
**Loop:** iteration 9 of `/bmad-loop --until=epic:2` (loopId `2026-05-01T031243Z-bmad-loop`, runId `2026-05-01T043814Z-bmad-next`)
**Outcome:** **approve**

### Summary

First higher-tier module of the project (`src/verifiers/`) lands cleanly. AR41 boundary discipline is exemplary: every import resolved against the rule. AC verbatim coverage is complete; the four built-in checks plus orchestrator behave per architecture §D9. Defence-in-depth Zod validation pre-write is in place. NFR-R1 atomic write + `.bak` rotation verified by test 23. NFR-S6 preserved by signature alone (`ArtifactRef` is a path-handle; never the parsed body). Errors registry remains at 16 codes — Story 2.1 is consumer-only as planned. All four quality gates pass.

### Findings

- **Must-fix:** 0
- **Should-fix:** 0
- **Nits:** 0
- **Info:**
  - **info-1**: `src/verifiers/checks.ts:111-127` — `checkRequiredFiles` reports only the FIRST missing pattern; future polish (per JSDoc line 95) could enumerate all missing patterns for richer remediation hints. Non-blocking; current behavior matches AC-3 ("which check failed and why").
  - **info-2**: `src/verifiers/checks.ts:262-265` — `JSON.parse(body)` swallows the `SyntaxError` silently; intentional fallback to raw-string for prose schemas. Acceptable with the JSDoc explanation at lines 256-260.
  - **info-3**: `src/verifiers/checks.ts:421-496` — `runVerifier` runs the four checks sequentially. Consider `Promise.all` parallelization in a Story 6.x polish PR (each check is independent IO). Non-blocking for v0.1.
  - **info-4**: `src/verifiers/checks.ts:466-469` — orchestrator hard-codes the four-check sequence. If the registry ever needs to register additional check kinds (e.g., `judge:` LLM-as-judge in post-v0.1), the loop would need to become data-driven. Non-blocking for v0.1 (matches §D9 + §line 1727 deferral).

### AC Verdicts (verbatim from epics.md lines 578-595)

| AC | Verdict | Evidence |
|---|---|---|
| AC-1 (registry maps stepName → VerifierConfig with `requiredFiles`/`requiredFrontmatterSections`/`schema`/`custom?`) | PASS | `src/verifiers/types.ts:92-111` (shape verbatim per architecture §D9 lines 482-487); `src/verifiers/defaults.ts:56-97` (8-entry map: default + 7 step types); `src/verifiers/registry.ts:37-38` (`verifierRegistry === defaultVerifiers`). Test coverage: `registry.test.ts:24-37` (8 entries), `defaults.test.ts:23-52` (shape conformance). |
| AC-2 (`runVerifier(runId)` writes `staging/<run-id>/verifier-result.json` per AR17 + AR26 schema) | PASS | `src/verifiers/checks.ts:421-496` (orchestrator); `:491` (defence-in-depth `VerifierResultV1Schema.parse`); `:493` (`atomicWrite`). Test 19 (`checks.test.ts:415-446`) verifies the resultPath + on-disk schema validation. |
| AC-3 (built-in checks: file-exists, schema, frontmatter, custom callback) | PASS | `src/verifiers/checks.ts:99-129` (`checkRequiredFiles`), `:152-212` (`checkFrontmatter`), `:232-278` (`checkSchema`), `:307-337` (`checkCustom`). All four exported from `index.ts:23-28`. |
| AC-4 (`status: "fail"` with structured `checks[]` reporting which check failed and why) | PASS | `src/verifiers/checks.ts:471-486` (aggregate status + checks array assembly); `:484` (`detail` rendered into output). Test 20 (`checks.test.ts:449-462`) verifies failure-path render with `Missing frontmatter key: status` detail. |
| AC-5 (custom checks deterministic + stateless: no Claude API, no network) | PASS | Enforced by signature: `VerifierConfig.custom?` receives `ArtifactRef` (path-handle, NOT body) per `types.ts:108-110`. NFR-S1 verified — zero `fetch`/`http`/`https` usages outside JSDoc references. Test 25 (`checks.test.ts:521-555`) exercises determinism (two invocations with identical input → identical result). |

### AR Compliance

| AR | Verdict | Evidence |
|---|---|---|
| AR21 | PASS | `VerifierFailureError` consumed verbatim from Story 1.2 registry (`errors.ts:171-176`); orchestration-level throws at `checks.ts:426-430` and `:447-451` with code + actionableHint inherited from registry. |
| AR22 | PASS | Registry hint single-line `See ... ; try ...` per `errors.ts:174-175`; not modified. |
| AR33 | PASS | `runVerifier` is `async`; throws `StepperError` subclasses for orchestration failures only; uses `Result<T, E>` only inside `VerifierConfig.custom?` callbacks (architecture line 858 sole-exception); per-check failures returned as `CheckResult.status: "fail"`, NOT thrown (per AC-3 + AC-4); zero `console.*` (uses `io/log.ts:info`). |
| AR41 (CRITICAL) | PASS — ZERO violations | Walked every import in `src/verifiers/{index,types,registry,defaults,checks}.ts` + test files. Allowed: `../errors.ts`, `../io/atomic-write.ts`, `../io/log.ts`, `../schemas/verifier-result.ts`, `node:fs/promises`, `node:path`, `node:os`, `zod`, `bun:test`, intra-module siblings. FORBIDDEN: zero usages of `../dispatch/`, `../failure-ux/`, `../commands/`, `../bmad-detect/`, `../dag/`, `../personas/`, `../state/`, `../snapshot/`, `node:child_process`, new external runtime deps. |

### FR/NFR Verdicts

| FR/NFR | Verdict | Evidence |
|---|---|---|
| FR17 (verifier registry exists) | PASS | `src/verifiers/registry.ts:37-38` + `getVerifierConfig` lookup at `:57-69`. |
| FR38 (verifier configuration loadable) | PASS (partial) | Plugin defaults shipped; per-architecture plan, project-config override resolution defers to Story 6.5 — explicitly documented at `defaults.ts:11-13` and story §Context Summary. |
| NFR-M3 (Zod parse defence-in-depth) | PASS | `checks.ts:491` (`VerifierResultV1Schema.parse(result)` pre-write). |
| NFR-R1 (atomic write + .bak rotation) | PASS | `checks.ts:493` (`atomicWrite`). Test 23 (`checks.test.ts:494-519`) verifies `.bak` rotation on second call. |
| NFR-S1 (no main-thread network) | PASS | Zero `fetch`/`http`/`https` outside JSDoc references (verified via grep). |
| NFR-S6 (no execution of sub-agent output) | PASS | `Bun.file().text()` reads only at `checks.ts:165` and `:245`; never `eval`/`require`/`import` of artifact content. `ArtifactRef` signature receives path, not parsed body. |

### Errors Registry

`src/errors.ts` UNCHANGED: 16 concrete `StepperError` subclasses (verified via grep `extends StepperError` count = 16). Story 2.1 is consumer-only (uses `VerifierFailureError` from Story 1.2). `VerifierConfigError` correctly deferred to Story 6.5 per epic-1 retrospective.

### Test Quality

- AR35 honored: `checks.test.ts:62` uses `mkdtemp(path.join(os.tmpdir(), "stepper-verifier-"))`; cleanup in `afterEach` (`:65-70`). No hard-coded `/tmp` paths anywhere in `src/verifiers/`.
- 43 tests across 3 files (12 + 10 + 21 = 43; matches dev report).
- Coverage: registry surface + 8-entry default map + per-step expectations + all four built-in checks (skip/pass/fail × 4) + orchestrator happy-path + failure-path + orchestration failures (missing stagingRoot, missing staging dir) + atomic-write `.bak` rotation + AC-5 determinism.

### Quality Gate Results

| Gate | Result |
|---|---|
| `bun test` | exit 0 — **354 pass / 0 fail / 1379 expect / 35 files** |
| `bun run check` | exit 0 (same as above) |
| `bunx tsc --noEmit` | exit 0 |
| `bunx biome ci` | exit 0 — 86 files clean, no fixes applied |

### Deviation Adjudication

- **dev-001 (file layout: 5 source files vs spec's 9)** — **ACCEPTED**. Public surface preserved exactly via `index.ts` barrel (re-exports `runVerifier`, `verifierRegistry`, `getVerifierConfig`, `defaultVerifiers`, plus all four `check*` functions). Consolidation is consistent with Story 1.11's `personas/defaults.ts` precedent. Behavior is identical; per-file split can land in Story 6.5 if project-config overrides demand finer granularity. Architecture §line 1163 directory listing was illustrative, not normative.
- **dev-002 (`stagingRoot` REQUIRED in v0.1)** — **ACCEPTED**. Sound forward-dep handling: the `STAGING_PATH` constant lands in Story 2.2 alongside the dispatch-spec generator. The orchestrator throws `VerifierFailureError` (not a plain `Error`) when `stagingRoot` is missing — preserves AR21 + AR33 discipline. Carry-over to Story 2.2 documented; test 21 (`checks.test.ts:466-476`) verifies the throw shape.
- **dev-003 (43 tests vs target 25-35)** — **ACCEPTED**. Final count 354 sits within the planning-projected 335-355 range cited at story line 545. Over-shoot driven by depth (per-check skip/pass/fail × 4 + edge cases for malformed YAML, empty-string truthy check, file-not-found, custom sync-throw vs async-reject). Higher coverage strengthens the first higher-tier module; no test bloat or duplication observed.

### Sprint-Status Final State

- `2-1-verifier-configuration-registry`: `review` → `done`
- `last_updated`: refreshed to `2026-04-30T05:00:00Z` (review timestamp)

### Carry-Overs to Future Stories

- **Story 2.2**: introduce `STAGING_PATH` constant in `src/io/paths.ts` so `runVerifier`'s `stagingRoot` option can default rather than being REQUIRED. Add a dispatch-spec.json reader so `runVerifier` resolves the step name from `staging/<runId>/dispatch-spec.json` instead of `opts.stepName`.
- **Story 2.6**: wire `verify-and-advance.ts` composer to call `runVerifier` and then `src/dispatch/promote.ts` on `status === "pass"` (the `promotedTo` field is currently always `null` from the verifier; populated post-promote).
- **Story 6.5**: project-config-aware override resolution (FR38 second half) — extend `verifierRegistry` to layer `bmad-stepper.config.yaml` `verifiers:` block over `defaultVerifiers`. Add `VerifierConfigError` (with `hintOverride?` per Story 1.10/1.11 precedent) at the override-validation throw site. Optional: per-check files split (one file per built-in check) if project-config overrides need finer-grained registration. Optional: runtime sandboxing for `custom?` callbacks (lint-time `fetch(`/`http.`/`https.` scan).
- **Story 6.x**: per-artifact body Zod schemas — every default config currently sets `schema: null`; the `checkSchema` runner is in place to consume them when introduced.
- **Polish (any future)**: `checkRequiredFiles` could enumerate ALL missing patterns rather than only the first; `runVerifier` could parallelize the four checks via `Promise.all`.

## Change Log

- **2026-05-01 (created)**: Story file created (status `ready-for-dev`) — bmad-create-story persona, model `claude-opus-4-7[1m]`, loop iteration 7 of `/bmad-loop --until=epic:2` (loopId `2026-05-01T031243Z-bmad-loop`, runId `2026-05-01T041326Z-bmad-next`). FIRST epic-2 story. Drafted from epics.md §Story 2.1 lines 578-595 (AC verbatim), architecture.md §D9 lines 477-499 (VerifierConfig shape), §P5 lines 901-915 (verifier-result.json shape), §line 1163 directory layout, §lines 1287-1289 AR41 higher-tier boundary, §line 1727 LLM-as-judge deferred, prd.md FR17 line 690, FR38 line 720, epic-1-retrospective.md §Forward Action Items line 101 (Story 2.1 design notes). Mirrors Story 1.11/1.12 template structure. Files planned: 8 new sources (`src/verifiers/{index,types,defaults,registry,run-verifier}.ts` + `src/verifiers/checks/{required-files,frontmatter,schema,custom}.ts`); 6-7 new test files; 0 modified files. FIRST higher-tier module — depends on foundational + mid-tier; FORBIDDEN sibling higher-tier (`dispatch/`, `failure-ux/`). Errors registry stays at 16; `VerifierConfigError` + `hintOverride?` extension deferred to Story 6.5 per epic-1-retrospective forward action.
- **2026-05-01 (dev)**: Story dev iteration completed — bmad-dev-story persona (Amelia), model `claude-opus-4-7[1m]`, loop iteration 8 of `/bmad-loop --until=epic:2` (loopId `2026-05-01T031243Z-bmad-loop`, runId `2026-05-01T042459Z-bmad-next`). Status `ready-for-dev` → `review`. Implemented 5 source files + 3 test files (8 total per user-prompt allowed-mutation paths — consolidated `checks/` subdirectory into a single `checks.ts` file containing the 4 check functions + the `runVerifier` orchestrator). 43 new tests (target 25-35; over-shot due to per-check edge-case depth). Test counts: 311 → 354 (+43). Quality gates: `bun run check` exit 0; `bunx tsc --noEmit` exit 0; `bunx biome ci` exit 0. Errors registry stable at 16 codes (no `VerifierConfigError` added — deferred to Story 6.5 per planning). AR41 boundary verified: zero forbidden imports. Architecture deviations documented in Completion Notes (file layout: 5 src files vs spec's 9; `stagingRoot` REQUIRED for v0.1 since `STAGING_PATH` constant is a Story 2.2 forward-dep). Carry-overs to Story 2.2: `STAGING_PATH` constant in `src/io/paths.ts`; dispatch-spec.json reader to replace `opts.stepName`. Carry-over to Story 2.6: `verify-and-advance.ts` composer wiring `runVerifier` + `src/dispatch/promote.ts`.
- **2026-04-30 (review)**: Story code-review iteration completed — senior-code-reviewer persona, model `claude-opus-4-7[1m]`, loop iteration 9 of `/bmad-loop --until=epic:2` (loopId `2026-05-01T031243Z-bmad-loop`, runId `2026-05-01T043814Z-bmad-next`). Status `review` → `done`. Outcome: **approve** (0 must-fix, 0 should-fix, 0 nits, 4 info-level non-blocking notes). All 5 ACs PASS. AR41 boundary CRITICAL verdict: zero violations across every import in `src/verifiers/`. AR21/AR22/AR33 PASS. FR17/FR38 PASS (FR38 partial as planned — project-config override deferred to Story 6.5). NFR-M3/NFR-R1/NFR-S1/NFR-S6 PASS. Errors registry confirmed at 16 codes (consumer-only). Quality gates: `bun test` 354 pass / 0 fail / 1379 expect / 35 files; `bun run check` exit 0; `bunx tsc --noEmit` exit 0; `bunx biome ci` exit 0 (86 files clean). All 3 dev deviations adjudicated ACCEPTED (file layout consolidation; `stagingRoot` REQUIRED v0.1; +43 tests within 335-355 range). Carry-overs: Story 2.2 (`STAGING_PATH` constant + dispatch-spec.json reader); Story 2.6 (`verify-and-advance.ts` composer); Story 6.5 (project-config override + `VerifierConfigError`); Story 6.x (per-artifact body schemas). Senior Developer Review section appended with full findings, AC/AR/FR/NFR verdicts, deviation adjudication, and carry-overs.
