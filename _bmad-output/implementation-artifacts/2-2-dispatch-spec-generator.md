---
status: ready-for-dev
story_id: '2.2'
story_key: 2-2-dispatch-spec-generator
epic: '2'
title: Dispatch Spec Generator
created: '2026-05-01'
last_updated: '2026-05-01'
priority: M
estimated_effort: M
fr_coverage:
  - FR16
  - FR18
  - FR54
nfr_coverage:
  - NFR-P3
  - NFR-S4
  - NFR-S6
  - NFR-R1
  - NFR-S1
  - NFR-M3
ar_coverage:
  - AR7
  - AR9
  - AR21
  - AR22
  - AR33
  - AR41
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/implementation-artifacts/epic-1-retrospective.md
  - _bmad-output/implementation-artifacts/2-1-verifier-configuration-registry.md
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
  - src/personas/index.ts
  - src/personas/defaults.ts
  - src/verifiers/index.ts
  - src/schemas/dispatch-spec.ts
  - src/schemas/dispatch-spec.test.ts
---

# Story 2.2: Dispatch Spec Generator

Status: ready-for-dev

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper user,
I want every dispatch to produce a typed `dispatch-spec.json` containing the 6-section task spec, model, budget, timeout,
So that the slash-command markdown can construct the Task invocation deterministically and the run is fully captured for audit.

## Context Summary

This is the **second story of Epic 2 (Single-Step Advance with Sub-Agent Dispatch)** and lands the **`src/dispatch/` higher-tier module** that operationalises **architecture §A (D2 — Sub-agent dispatch via Task tool)**, **§P5 (Sub-Agent Dispatch Contract)**, **AR7 (6-section task spec)**, **AR9 (`run.ts` JSON-line stdout protocol)**, **FR16 (sub-agent dispatch with budget+timeout)**, **FR18 (one human-readable line per step)** and **FR54 (stdout/stderr discipline)**. Story 2.1 (just completed) shipped `src/verifiers/` — the **first** higher-tier module — which validates artifacts AFTER they land in the staging directory. Story 2.2 ships `src/dispatch/` — the **second** higher-tier module — which **creates** the staging directory + writes the `dispatch-spec.json` BEFORE the sub-agent is invoked. Together these two modules close the **dispatch → verify → promote** loop that the runner-tier composer (Story 2.6 `verify-and-advance.ts`) will orchestrate.

Concretely, this story produces:

1. **`src/dispatch/index.ts`** — public barrel re-exporting `buildDispatchSpec`, `emitJsonLine`, `cleanStagingOrphans`, `DispatchSpecInput` types, and the `DispatchAction` JSON-line protocol shape. Mirrors Story 1.10 `src/dag/index.ts`, Story 1.11 `src/personas/index.ts`, and Story 2.1 `src/verifiers/index.ts` barrel pattern.
2. **`src/dispatch/types.ts`** — `DispatchSpecInput` (the function-call input shape: `stepName, state, persona, modelOverride?, budgetOverride?`); `DispatchAction` (the JSON-line stdout protocol shape: `{ action: "dispatch" | "report" | "halt", runId?, agent?, message?, exitCode }` per AR9 + architecture line 1660); `BudgetOverride` (`{ contextTokens?: number; timeoutMs?: number }`); `Phase` ("planning" | "implementation"). Re-exports `DispatchSpecV1` / `DispatchSpec` from `src/schemas/dispatch-spec.ts` for caller convenience.
3. **`src/dispatch/generate-spec.ts`** — the canonical `buildDispatchSpec(input): Promise<{ runId, dispatchSpec, stagingDir, dispatchSpecPath }>` function. Algorithm:
   1. Generate the run ID via `Date.now()` + monotonic counter + 5-char nanoid (e.g., `2026-04-29T10-15-00-dev-story-abc12`) per architecture §P5 line 871 example.
   2. Resolve the staging directory `STAGING_PATH/<runId>/` (the new `STAGING_PATH` constant is added to `src/io/paths.ts` in this story per Story 2.1 dev-002 carry-over).
   3. Create the directory tree: `staging/<runId>/{inputs/, outputs/}` via `mkdir(..., { recursive: true })`.
   4. Construct the `DispatchSpecV1` literal: `{ schemaVersion: 1, runId, step, epic, story, model: modelOverride ?? "sonnet", budget: { contextTokens: 60000, timeoutMs: 300000, ...budgetOverride }, taskSpec: { persona, context: [], task, outputFormat: {...}, successCriteria: [...], constraints: {...} } }`.
   5. Validate the literal via `DispatchSpecV1Schema.parse()` (defence-in-depth per Story 1.5 + Story 2.1 pattern).
   6. Atomically write to `staging/<runId>/dispatch-spec.json` via `atomicWrite()` from `src/io/atomic-write.ts` (NFR-R1 + .bak rotation).
   7. Return the populated `{ runId, dispatchSpec, stagingDir, dispatchSpecPath }` for the caller (Story 2.4 `run.ts`).
4. **`src/dispatch/emit.ts`** — the JSON-line stdout writer per AR9. Public `emitDispatchAction(action: DispatchAction): void` invokes `json(action)` from `src/io/log.ts` (Story 1.3) which already routes JSON to stdout. The body validates the action against the `DispatchActionSchema` (Zod, defined inline OR in a new `src/schemas/dispatch-protocol.ts` — see Task notes for the deferred-decision). v0.1 emits one line per `run.ts` invocation; the schema enforces the AR9 shape strictly so Layer 1 markdown can `JSON.parse` deterministically.
5. **`src/dispatch/staging-cleanup.ts`** — the orphan staging cleanup per AC line 609. `cleanStagingOrphans(opts?: { now?: Date; ageThresholdMs?: number; stagingRoot?: string }): Promise<{ removedCount: number; removedDirs: string[] }>`. Algorithm:
   1. Resolve `stagingRoot` (defaults to `STAGING_PATH`).
   2. If staging root does not exist: `return { removedCount: 0, removedDirs: [] }` (no-op).
   3. List immediate subdirs (each is a `<runId>/`).
   4. For each, check `mtime` of the directory; if `(now - mtime) > ageThresholdMs` (default 24h) AND no `completion-marker.json` is present: `await fs.rm(dir, { recursive: true })`.
   5. Return the count + paths of removed dirs.
6. **`src/io/paths.ts`** extension — add `STAGING_PATH` constant per Story 2.1 dev-002 carry-over: `export const STAGING_PATH = path.join(STEPPER_INTERNAL_ROOT, "staging");` (resolves to `_bmad-output/.stepper/staging`). Story 2.1's `runVerifier` will continue to accept `stagingRoot` as a test-escape-hatch override; the new constant gives it a default. A separate Story 2.6 polish PR may then remove the REQUIRED-stagingRoot deviation noted in Story 2.1 dev-002.
7. **`src/schemas/dispatch-protocol.ts`** (NEW schema file) — Zod schema for the AR9 stdout protocol per architecture line 1676. Public surface: `DispatchActionV1Schema`, `DispatchActionV1`, `DispatchAction`, `DispatchActionLatestSchema`. Discriminated union over `action: "dispatch" | "report" | "halt"`. The slash-command markdown (Story 2.7) reads `bun run`'s stdout one line at a time and parses with this schema; mismatched action shapes throw at the markdown layer. (NOTE: this is a new foundational `src/schemas/` file; Story 1.5 declared `dispatch-spec.ts` but NOT `dispatch-protocol.ts` — the latter was deferred per architecture line 1676 to "a new schema file added to step-06's tree". Story 2.2 introduces it because the dispatch generator emits the action line.)
8. **Test files** — `src/dispatch/generate-spec.test.ts` (orchestrator integration tests using tmpdir per AR35), `src/dispatch/emit.test.ts` (stdout discipline + JSON-line shape conformance), `src/dispatch/staging-cleanup.test.ts` (orphan detection + age threshold + completion-marker preservation), `src/schemas/dispatch-protocol.test.ts` (Zod schema coverage matching Story 1.5 schema-test patterns).

This story is the **second higher-tier module** of the project — `src/dispatch/` per architecture line 1175 sits alongside `src/verifiers/` (Story 2.1 — first higher-tier) and `src/failure-ux/` (Epic 5 — third higher-tier). It does **NOT**:

- Implement the **promote step**. Per architecture line 1178, `src/dispatch/promote.ts` is a separate Story 2.6 deliverable that consumes `verifier-result.json` (`status === "pass"`) and atomically copies the artifact from `staging/<runId>/outputs/` to its canonical location. Story 2.2 ships **only** `generate-spec.ts` + `emit.ts` + `staging-cleanup.ts` (the three pre-and-post-dispatch concerns); the promote step lives at the post-verify edge in Story 2.6.
- Implement the **runner** (`src/commands/next/run.ts`) that calls `buildDispatchSpec`. That is **Story 2.4** (lock-free `run.ts` for `/bmad-next`). Story 2.2's `buildDispatchSpec` is the **callable surface** that 2.4 will compose.
- Implement the **verifier dispatch-spec.json reader**. Story 2.1's `runVerifier` currently accepts `opts.stepName` explicitly (Story 2.1 dev-002 forward-dep); a polish PR (likely Story 2.6) will refactor `runVerifier` to read `staging/<runId>/dispatch-spec.json` directly and extract `dispatchSpec.step`. Story 2.2 makes that polish trivial — the spec is now reliably present.
- Implement the **multi-persona sequential dispatch** (architecture §AR16 — multi-persona steps dispatch sub-agents sequentially in v0.1). Story 2.2 ships the `buildDispatchSpec` for ONE persona; the sequential loop over a `string[]` persona resolves at the runner tier (Story 2.4 `run.ts`).
- Modify any prior **mid-tier** module. The composition of (`personas/` resolver → `buildDispatchSpec` → `staging/<runId>/`) lives at the runner tier (`src/commands/next/run.ts`, Story 2.4). Per AR41 boundary discipline (architecture lines 1287-1289), `src/dispatch/` is a higher-tier module that imports from foundational + mid-tier — **NOT from sibling higher-tier modules** (`verifiers/`, `failure-ux/`).
- Add **parallel sub-agent dispatch**. Per PRD §17 + architecture §line 1726, parallel dispatch is a deferred post-v0.1 growth feature. v0.1 ships sequential.

It DOES land:

- The exact AR41-conformant placement of `src/dispatch/` as a **higher-tier** sibling to `src/verifiers/`. Per architecture lines 1287-1289, higher-tier modules depend on foundational + mid-level; never on sibling higher-tier.
- The `DispatchSpecV1Schema`-validated `dispatch-spec.json` (existing Story 1.5 schema, used here for the FIRST time as a Zod-parse callsite).
- The `DispatchActionSchema` for AR9 stdout-line protocol — NEW foundational `src/schemas/dispatch-protocol.ts` (per architecture line 1676 deferred-to-step-06 schema).
- The `STAGING_PATH` constant in `src/io/paths.ts` (resolves the Story 2.1 dev-002 forward-dep — `runVerifier`'s `stagingRoot` becomes optional in a follow-up PR).
- The orphan staging cleanup (24h age threshold + `completion-marker.json` preservation) per AC + architecture §P5 promotion-contract line 917.
- Test-first enforcement per Stories 1.2 / 1.4 / 1.5 / 1.6 / 1.7 / 1.8 / 1.9 / 1.10 / 1.11 / 2.1: every new file ships with colocated `*.test.ts`. AR35 tmpdir-per-test pattern for any test that touches the filesystem.
- AR21 / AR22 (errors carry `code` + `actionableHint` + single-line `Run/See/Try/Check`-prefixed hint) — `buildDispatchSpec` throws `ConfigError` (existing class from Story 1.11 with `hintOverride?` pattern) when `stepName` does not resolve OR when the schema validation fails. NO new error class is added; the registry stays at 16 codes.
- AR33 (function & error semantics) — `buildDispatchSpec` is `async`; throws `StepperError` subclasses on hard failures; no `console.*`; uses `info()` / `error()` from `src/io/log.ts`; the `emit.ts` writer uses `json()` from `src/io/log.ts` (the only module-wide stdout writer, per architecture line 862 + Story 1.3).
- FR54 stdout discipline (per epic-1-retrospective forward action item for Story 2.2 + architecture line 862) — `emit.ts` is the SECOND stdout writer in the project (the FIRST was Story 1.3's `json()` helper). Story 2.2 reserves stdout for AR9 dispatch-action JSON lines + Story 1.3's `--export-state` JSON; all other diagnostics route to stderr. The stdout-only discipline is a hard contract — Layer 1 markdown reads `bun run`'s stdout LINE-BY-LINE.

## Acceptance Criteria

The acceptance criteria below are reproduced **verbatim** from `_bmad-output/planning-artifacts/epics.md` §Story 2.2 (lines 597-610, BDD Given/When/Then format). Lines and AC labelling preserved.

**Given** `src/dispatch/generate-spec.ts` with `buildDispatchSpec(stepName, state, persona, modelOverride?, budgetOverride?)`
**When** invoked for a known step
**Then** it writes to `staging/<run-id>/dispatch-spec.json` validated against `src/schemas/dispatch-spec.ts` containing: `runId`, `step`, `epic`, `story`, `phase`, `model` (default `sonnet`), `budget: { contextTokens: 60000, timeoutMs: 300000 }`, `taskSpec: { persona, context[], task, outputFormat, successCriteria[], constraints }`
**And** the staging directory tree is created: `staging/<run-id>/{inputs/, outputs/, dispatch-spec.json}`
**And** orphan staging dirs (older than 24h with no completion marker) are cleaned up at Stepper start (`src/dispatch/staging-cleanup.ts`)
**And** the schema is shared with the slash-command markdown which reads exactly one JSON line on `run.ts` stdout

## Tasks / Subtasks

- [ ] **Task 0 — Verify pre-conditions (AC: all)**
  - [ ] 0.1 Confirm `src/errors.ts` registry stays at 16 codes (post-Story 2.1 verified). Story 2.2 USES existing classes (`ConfigError` for stepName-resolution failure with `hintOverride?` per Story 1.11 pattern; `MigrationFailureError` if dispatch-spec migration ever needs surfacing — NOT expected in v0.1). **Story 2.2 SHOULD NOT modify `src/errors.ts`** unless a NEW error class is genuinely required (none expected — the existing 16-code registry covers every Story 2.2 throw site).
  - [ ] 0.2 Confirm `src/io/log.ts` exports `info`, `warn`, `error`, `json` per Story 1.3. Story 2.2 imports `info` (for dispatch-progress logging via stderr) and `json` (for the AR9 stdout JSON-line emit). Per architecture line 862 + FR54, `json` writes to stdout; everything else to stderr.
  - [ ] 0.3 Confirm `src/io/paths.ts` exports `STEPPER_INTERNAL_ROOT`, `BMAD_OUTPUT_ROOT`, `assertWithinScope()` per Story 1.3 + Story 1.5. **Story 2.2 ADDS** the new `STAGING_PATH` constant per Story 2.1 dev-002 carry-over (the constant resolves to `path.join(STEPPER_INTERNAL_ROOT, "staging")` ≡ `_bmad-output/.stepper/staging`).
  - [ ] 0.4 Confirm `src/io/atomic-write.ts` exports `atomicWrite(path, contents)` per Story 1.3. Story 2.2 uses this to write `dispatch-spec.json` atomically (NFR-R1 + .bak rotation).
  - [ ] 0.5 Confirm `src/schemas/dispatch-spec.ts` exports `DispatchSpecV1Schema`, `DispatchSpecV1`, `DispatchSpec`, `DispatchSpecLatestSchema` per Story 1.5. Story 2.2 imports `DispatchSpecV1Schema` (for defence-in-depth validation pre-write) and `DispatchSpecV1` (return type).
  - [ ] 0.6 Confirm `src/personas/index.ts` exports `resolvePersona`, `DEFAULT_PERSONAS`, `ResolveInput`, `ResolveOptions` per Story 1.11. Story 2.2 does NOT import from `src/personas/` directly — the `persona` arg is supplied by the caller (Story 2.4 `run.ts`) which already calls `resolvePersona`.
  - [ ] 0.7 Confirm `src/verifiers/index.ts` (Story 2.1 — first higher-tier sibling) is present. Story 2.2 does NOT import from `src/verifiers/` (sibling higher-tier — FORBIDDEN per AR41); the composition of (`buildDispatchSpec` → sub-agent → `runVerifier`) lives at runner tier (Story 2.6).
  - [ ] 0.8 Read epics.md Story 2.2 §lines 597-610 verbatim. Confirm the AC text in §Acceptance Criteria above is character-identical (re-verify on first dev pass).
  - [ ] 0.9 Read architecture.md §A.D2 lines 297-336 (sub-agent dispatch via Task tool); §P5 lines 864-917 (full dispatch-spec.json contract with the canonical example); §directory-listing line 1175 (`src/dispatch/` directory layout); §AR41 lines 1287-1289 (higher-tier boundary); §line 1660 (AR9 JSON-line stdout protocol); §line 1676 (`src/schemas/dispatch-protocol.ts` deferred-from-step-06 schema).
  - [ ] 0.10 Read prd.md FR16 line 689 (dispatch with budget+timeout); FR18 line 691 (one human-readable line per step); FR54 line 745 (stdout/stderr discipline); §Sub-Agent Dispatch Contract line 530-552 (the 6-section task spec).
  - [ ] 0.11 Read epic-1-retrospective.md §Forward Action Items for Epic 2 line 102: "Story 2.2: JSON-line protocol design; stdout-only discipline (FR54 / AR9). Schema lives at `src/schemas/dispatch-spec.ts` (already shipped in Story 1.5)." — note that the dispatch-spec schema exists; the AR9 dispatch-action protocol schema (`dispatch-protocol.ts`) is NEW in Story 2.2.
  - [ ] 0.12 Read Story 2.1 §Carry-Overs to Future Stories line 715: "Story 2.2: introduce STAGING_PATH constant in src/io/paths.ts so runVerifier's stagingRoot option can default rather than being REQUIRED. Add a dispatch-spec.json reader so runVerifier resolves the step name from staging/<runId>/dispatch-spec.json instead of opts.stepName." — Story 2.2 owns the **STAGING_PATH constant** (this story); the **runVerifier dispatch-spec.json reader** is a Story 2.6 polish PR (NOT this story).
  - [ ] 0.13 Confirm baseline `bun run check` exits 0 with **354 pass / 0 fail / 1379 expect / 35 files** per Story 2.1 final.
  - [ ] 0.14 Confirm Bun host version satisfies AR2 (Bun >= 1.3). Run `bun --version`; record in Completion Notes.

- [ ] **Task 1 — Add `STAGING_PATH` constant to `src/io/paths.ts` (AC-2 staging directory; resolves Story 2.1 dev-002 carry-over)**
  - [ ] 1.1 Edit `src/io/paths.ts`. Append after `BMAD_OUTPUT_ROOT`:
    ```typescript
    /**
     * Canonical staging directory root for sub-agent dispatch
     * (architecture §P5 lines 864-917; Story 2.2 introduces this constant
     * to resolve Story 2.1 dev-002 forward-dep — runVerifier's stagingRoot
     * option can default to STAGING_PATH instead of being REQUIRED).
     *
     * Resolves to `_bmad-output/.stepper/staging` (under STEPPER_INTERNAL_ROOT).
     * Each sub-agent dispatch creates `STAGING_PATH/<runId>/{inputs/, outputs/, dispatch-spec.json}`.
     */
    export const STAGING_PATH = `${STEPPER_INTERNAL_ROOT}/staging`;
    ```
  - [ ] 1.2 Confirm `STAGING_PATH` resolves through `assertWithinScope` — the constant prefixes `STEPPER_INTERNAL_ROOT` so any write target under `STAGING_PATH/<runId>/` IS inside the allowed scope. NO `assertWithinScope` change needed.
  - [ ] 1.3 No `paths.test.ts` extension required for the constant alone (it's a simple string literal); the test will be exercised indirectly by `generate-spec.test.ts` which passes a tmpdir override.

- [ ] **Task 2 — Create `src/schemas/dispatch-protocol.ts` — NEW Zod schema for AR9 stdout JSON-line protocol (AC-5)**
  - [ ] 2.1 Create `src/schemas/dispatch-protocol.ts`. Module purpose: declare the AR9 dispatch-action protocol shape (architecture line 1660 + 1676). Discriminated union over `action: "dispatch" | "report" | "halt"`.
  - [ ] 2.2 Public surface:
    ```typescript
    /**
     * src/schemas/dispatch-protocol.ts — Zod schema for the AR9 stdout
     * JSON-line dispatch-action protocol (FR54, AR9, AR41).
     *
     * Foundational module per AR41: zero upward imports; only depends on `zod`.
     *
     * Architecture line 1660 + line 1676: `run.ts` emits exactly ONE JSON line
     * on stdout per invocation; Layer 1's slash-command markdown reads that line
     * and branches via `action`. Other modes (`--dry-run`, `--explain`,
     * `--list`) use `action: "report"` and pass content via `message`.
     */

    import { z } from "zod";

    export const DispatchActionV1Schema = z.discriminatedUnion("action", [
      z.object({
        action: z.literal("dispatch"),
        runId: z.string(),
        agent: z.string(),
        exitCode: z.literal(0),
      }),
      z.object({
        action: z.literal("report"),
        message: z.string(),
        exitCode: z.number().int().min(0),
      }),
      z.object({
        action: z.literal("halt"),
        message: z.string(),
        exitCode: z.number().int().min(1),
      }),
    ]);

    export type DispatchActionV1 = z.infer<typeof DispatchActionV1Schema>;
    export type DispatchAction = DispatchActionV1;
    export const DispatchActionLatestSchema = DispatchActionV1Schema;
    ```
  - [ ] 2.3 Add JSDoc per Story 1.5 schema-file conventions (cite architecture lines + AR9 + FR54).

- [ ] **Task 3 — Create `src/dispatch/` directory + `src/dispatch/index.ts` barrel (AC-1, AC-2)**
  - [ ] 3.1 Create directory `src/dispatch/`. Per AR41 (architecture lines 1287-1289), this is a **higher-tier** module (sibling of `src/verifiers/`). Allowed imports for any file under `src/dispatch/`: foundational (`../errors.ts`, `../io/log.ts`, `../io/paths.ts`, `../io/atomic-write.ts`, `../schemas/dispatch-spec.ts`, `../schemas/dispatch-protocol.ts`); mid-tier (`../personas/index.ts` OPTIONAL — NOT used in v0.1 since the caller supplies the resolved persona; `../dag/index.ts` OPTIONAL — NOT used in v0.1 since the caller supplies the resolved step); Bun stdlib (`Bun.file`, `Bun.write`, `Bun.YAML`, `Bun.spawn`); Node stdlib (`node:fs/promises`, `node:path`, `node:os`, `node:crypto` for `randomUUID`); external libraries (`zod` only). **FORBIDDEN**: sibling higher-tier modules (`../verifiers/`, `../failure-ux/`); `node:child_process`; any new external runtime dep beyond `zod`. JSDoc on every file MUST cite AR41 + the architecture line for the boundary graph.
  - [ ] 3.2 Create `src/dispatch/index.ts` — public barrel:
    ```typescript
    /**
     * src/dispatch/index.ts — Public barrel for the dispatch module
     * (FR16, FR18, FR54, NFR-P3, NFR-S4, NFR-S6, NFR-R1, NFR-S1, NFR-M3,
     *  AR7, AR9, AR21, AR22, AR33, AR41).
     *
     * **HIGHER-TIER module per AR41** (architecture lines 1287-1289).
     * Sibling of `src/verifiers/` (Story 2.1) and `src/failure-ux/` (Epic 5).
     * Depends on foundational + (optionally) mid-tier modules; NEVER on
     * sibling higher-tier modules.
     *
     * Story 2.2 ships:
     *   - buildDispatchSpec(): writes staging/<runId>/dispatch-spec.json.
     *   - emitDispatchAction(): writes one JSON line to stdout per AR9.
     *   - cleanStagingOrphans(): removes orphan staging dirs > 24h on start.
     *
     * Composition of (resolvePersona() → buildDispatchSpec → emitDispatchAction)
     * lives at runner tier (Story 2.4 src/commands/next/run.ts).
     * The promote.ts post-verify step is a separate Story 2.6 deliverable.
     */

    export { buildDispatchSpec } from "./generate-spec.ts";
    export type { BuildDispatchSpecInput, BuildDispatchSpecResult } from "./generate-spec.ts";
    export { emitDispatchAction } from "./emit.ts";
    export { cleanStagingOrphans } from "./staging-cleanup.ts";
    export type { CleanStagingOrphansOptions, CleanStagingOrphansResult } from "./staging-cleanup.ts";
    export type { DispatchSpecInput, BudgetOverride, Phase } from "./types.ts";
    ```
  - [ ] 3.3 No test file needed for `index.ts` (pure re-export). Story 1.10 / 1.11 / 2.1 precedent.

- [ ] **Task 4 — Implement `src/dispatch/types.ts` — Public type surface (AC-1)**
  - [ ] 4.1 Create `src/dispatch/types.ts`. Module purpose: declare the function-call input shape (`BuildDispatchSpecInput`), the AR9 dispatch-action shape re-exports, and the budget-override / phase types.
  - [ ] 4.2 Public types:
    ```typescript
    /**
     * src/dispatch/types.ts — Public type surface for the dispatch module.
     * Re-exports the canonical DispatchSpec / DispatchAction shapes from the
     * foundational schemas; declares dispatch-specific input types.
     */

    import type { DispatchSpecV1 } from "../schemas/dispatch-spec.ts";
    import type { DispatchActionV1 } from "../schemas/dispatch-protocol.ts";
    import type { State } from "../schemas/state.ts";

    /**
     * Phase of the BMAD workflow. Per architecture §A.D5 lines 167-168 +
     * Story 1.10 DAG seed: planning phase produces analysis/PRD/architecture
     * artifacts; implementation phase produces stories + dev iterations.
     */
    export type Phase = "planning" | "implementation";

    /**
     * Optional per-step budget override (FR37). Caller may override the
     * default 60k context tokens / 300s timeout per step; missing fields
     * fall through to the architecture-§P5 defaults.
     */
    export interface BudgetOverride {
      readonly contextTokens?: number;
      readonly timeoutMs?: number;
    }

    /**
     * Input shape for buildDispatchSpec(). The signature mirrors AC-1's
     * verbatim function listing: stepName, state, persona, modelOverride?,
     * budgetOverride?. The phase and (epic, story) are extracted from state
     * via the existing State shape (Story 1.5 + Story 1.6).
     */
    export interface DispatchSpecInput {
      readonly stepName: string;
      readonly state: State;
      readonly persona: string;
      readonly modelOverride?: string;
      readonly budgetOverride?: BudgetOverride;
    }

    /** Re-exports for caller convenience. */
    export type { DispatchSpecV1, DispatchActionV1 };
    ```
  - [ ] 4.3 Add JSDoc per Story 1.6 / 1.7 / 1.10 / 1.11 / 2.1 conventions (cite architecture §P5 + AR9 + AC-1).

- [ ] **Task 5 — Implement `src/dispatch/generate-spec.ts` — `buildDispatchSpec()` (AC-1, AC-2, AC-3)**
  - [ ] 5.1 Create `src/dispatch/generate-spec.ts`. Module purpose: the canonical `buildDispatchSpec()` orchestrator.
  - [ ] 5.2 Public surface:
    ```typescript
    export interface BuildDispatchSpecInput extends DispatchSpecInput {
      readonly stagingRoot?: string;        // tmpdir override for tests; defaults to STAGING_PATH
      readonly nowIso?: string;             // injectable timestamp for deterministic test runs
    }

    export interface BuildDispatchSpecResult {
      readonly runId: string;
      readonly dispatchSpec: DispatchSpecV1;
      readonly stagingDir: string;          // absolute path to staging/<runId>/
      readonly dispatchSpecPath: string;    // absolute path to dispatch-spec.json
    }

    export async function buildDispatchSpec(
      input: BuildDispatchSpecInput,
    ): Promise<BuildDispatchSpecResult>;
    ```
  - [ ] 5.3 Algorithm step 1 — **Resolve options**: `stagingRoot` defaults to `STAGING_PATH` from `src/io/paths.ts`; `now = input.nowIso ?? new Date().toISOString()`. Generate `runId` per architecture §P5 line 871 example: `<YYYY-MM-DDTHH-mm-ss>-<stepName>-<5-char-random>` (e.g., `2026-04-29T10-15-00-dev-story-abc12`). Use `node:crypto.randomUUID().slice(0,5)` for the entropy suffix; replace `:` with `-` in the timestamp portion.
  - [ ] 5.4 Algorithm step 2 — **Resolve epic / story / phase from state**: the `State` shape (Story 1.5 + 1.6) carries the current epic + story + phase via `state.lastSuccessfulStep` / `state.lastAttempted` plus the dag-determined next-step's frontmatter. For v0.1, accept these fields as direct lookups: `epic = Number(input.state?.lastAttempted?.epic ?? input.state?.lastSuccessfulStep?.epic ?? 0)`, `story = String(input.state?.lastAttempted?.story ?? input.state?.lastSuccessfulStep?.story ?? "0.0")`, `phase = (input.state?.lastAttempted?.phase ?? input.state?.lastSuccessfulStep?.phase ?? "implementation") as Phase`. **Defensive default `phase: "implementation"`** when the field is absent (state pre-load default per Story 1.6).
    - **Note for dev**: the State shape at Story 2.2 time may not yet expose epic/story/phase directly; Story 1.6 stub returned a minimal `{ schemaVersion, lastSuccessfulStep, runHistory }`. Dev should consult `src/schemas/state.ts` and `src/state/load.ts` to confirm the actual shape; if not yet present, **accept these fields as v0.1 OPTIONAL inputs on `BuildDispatchSpecInput`** (`epic?: number; story?: string; phase?: Phase`) with the same defensive defaults. Document the deviation in dev Completion Notes if taken.
  - [ ] 5.5 Algorithm step 3 — **Construct staging directory tree**: `stagingDir = path.join(stagingRoot, runId)`; `await fs.mkdir(path.join(stagingDir, "inputs"), { recursive: true })`; `await fs.mkdir(path.join(stagingDir, "outputs"), { recursive: true })`. Per AC-2 second clause "the staging directory tree is created: `staging/<run-id>/{inputs/, outputs/, dispatch-spec.json}`" — the `inputs/` + `outputs/` dirs are explicit; `dispatch-spec.json` is the file written in step 6.
  - [ ] 5.6 Algorithm step 4 — **Construct DispatchSpecV1 literal**:
    ```typescript
    const dispatchSpec: DispatchSpecV1 = {
      schemaVersion: 1,
      runId,
      step: input.stepName,
      epic,
      story,
      model: input.modelOverride ?? "sonnet",
      budget: {
        contextTokens: input.budgetOverride?.contextTokens ?? 60000,
        timeoutMs: input.budgetOverride?.timeoutMs ?? 300000,
      },
      taskSpec: {
        persona: input.persona,
        context: [],                       // v0.1 EMPTY; populated by caller (Story 2.4 run.ts)
        task: `Execute BMAD step ${input.stepName} per the dispatch-spec contract.`,
        outputFormat: {
          fileLocation: `staging/${runId}/outputs/${input.stepName}.md`,
          requiredSections: [],
        },
        successCriteria: [`Artifact at staging/${runId}/outputs/${input.stepName}.md exists and passes verifier.`],
        constraints: {
          allowedTools: ["Read", "Write", "Edit", "Grep", "Bash"],
          scopeLimits: `Only files inside staging/${runId}/ may be written.`,
        },
      },
    };
    ```
    **Note on `phase` field in AC-1**: AC-1 lists `phase` as a `dispatch-spec.json` field BUT the existing Story 1.5 `DispatchSpecV1Schema` does NOT declare `phase`. Two options:
    1. **Defer phase to a Story 6.x schema bump** (`DispatchSpecV2Schema` adds optional `phase`), document carry-over in Completion Notes. Story 2.2 ships v1 unchanged. Risk: minor AC drift — phase is mentioned in AC text but not enforced by the schema.
    2. **Extend `DispatchSpecV1Schema` to add `phase: z.enum(["planning","implementation"]).optional()`**, update `dispatch-spec.test.ts` fixture, document the schema delta. Risk: `src/schemas/dispatch-spec.ts` is a foundational module; schema drift would touch Story 1.5's perimeter.
    - **Recommended for dev**: option 1 (defer). Story 2.2 keeps the schema verbatim from Story 1.5; the `phase` field is included in `BuildDispatchSpecResult.dispatchSpec` as a carry-only field IF the State shape exposes it (the current `DispatchSpecV1Schema` IS extensible via `.extend()` at runner-tier composition). Document in dev Completion Notes; raise a forward-dep to Story 6.x or Story 2.6 to ratify the schema bump.
  - [ ] 5.7 Algorithm step 5 — **Validate + write**: call `DispatchSpecV1Schema.parse(dispatchSpec)` for defence-in-depth (per Story 1.5 / 2.1 pattern); then `await atomicWrite(dispatchSpecPath, JSON.stringify(dispatchSpec, null, 2))` to write atomically with `.bak` rotation.
  - [ ] 5.8 Algorithm step 6 — **Return** `{ runId, dispatchSpec, stagingDir, dispatchSpecPath }` for the caller (Story 2.4 `run.ts`).
  - [ ] 5.9 Error handling: if `input.stepName` is empty / whitespace, throw `ConfigError` (existing class from Story 1.11 — `code: "CONFIG_ERROR"`, `exitCode: 2`) with `hintOverride: "Add the step name to the bmad-stepper.config.yaml steps: block."`. If `stagingRoot` resolves outside scope, `assertWithinScope` (transitively via `atomicWrite`) throws `ScopeViolationError`. If `DispatchSpecV1Schema.parse` fails, propagate the Zod error wrapped in a `ConfigError` with `hintOverride: "Run /bmad-next --doctor to diagnose the malformed state.yaml or step registry."`.

- [ ] **Task 6 — Implement `src/dispatch/emit.ts` — `emitDispatchAction()` JSON-line stdout writer (AC-5; FR54; AR9)**
  - [ ] 6.1 Create `src/dispatch/emit.ts`. Module purpose: write exactly ONE JSON line to stdout per `bun run` invocation. Layer 1 (slash-command markdown) reads that line and branches via `action`.
  - [ ] 6.2 Public surface:
    ```typescript
    import { json } from "../io/log.ts";
    import { DispatchActionV1Schema, type DispatchActionV1 } from "../schemas/dispatch-protocol.ts";

    /**
     * Writes one AR9-compliant JSON line to stdout. Validates the action
     * against the discriminated-union schema first; on validation failure
     * throws a ConfigError (caller bug — should NEVER happen at runtime).
     *
     * Per FR54 + architecture line 862, json() routes to stdout (line-delimited);
     * info()/warn()/error() route to stderr. This is the SECOND stdout writer
     * in the project (the FIRST was Story 1.3's `--export-state` JSON path).
     */
    export function emitDispatchAction(action: DispatchActionV1): void {
      const validated = DispatchActionV1Schema.parse(action);
      json(validated);
    }
    ```
  - [ ] 6.3 Add JSDoc per conventions. Cite AR9 + architecture line 1460 + FR54 + Story 1.3 `json()` discipline.

- [ ] **Task 7 — Implement `src/dispatch/staging-cleanup.ts` — `cleanStagingOrphans()` (AC-4)**
  - [ ] 7.1 Create `src/dispatch/staging-cleanup.ts`. Module purpose: at Stepper start (or any caller-driven invocation), enumerate `STAGING_PATH/`'s immediate subdirs and remove any whose `mtime` is older than 24h AND that lack a `completion-marker.json` file.
  - [ ] 7.2 Public surface:
    ```typescript
    export interface CleanStagingOrphansOptions {
      readonly now?: Date;                           // injectable for tests
      readonly ageThresholdMs?: number;              // default 24h = 86_400_000
      readonly stagingRoot?: string;                 // tmpdir override for tests; defaults to STAGING_PATH
      readonly completionMarkerName?: string;        // default "completion-marker.json"
    }

    export interface CleanStagingOrphansResult {
      readonly removedCount: number;
      readonly removedDirs: readonly string[];       // absolute paths
    }

    export async function cleanStagingOrphans(
      opts?: CleanStagingOrphansOptions,
    ): Promise<CleanStagingOrphansResult>;
    ```
  - [ ] 7.3 Algorithm:
    1. Resolve `stagingRoot = opts?.stagingRoot ?? STAGING_PATH`.
    2. If `stagingRoot` does not exist (`fs.access` rejects): return `{ removedCount: 0, removedDirs: [] }` (no-op).
    3. List immediate subdirs via `fs.readdir(stagingRoot, { withFileTypes: true })`; filter to `dirent.isDirectory()`.
    4. For each subdir, `fs.stat()` → check `mtimeMs`; compute `ageMs = (opts?.now ?? new Date()).getTime() - stat.mtimeMs`.
    5. If `ageMs > (opts?.ageThresholdMs ?? 86_400_000)` AND `fs.access(path.join(subdir, opts?.completionMarkerName ?? "completion-marker.json"))` rejects (marker absent): `await fs.rm(subdir, { recursive: true, force: true })`. Otherwise: skip (still in-flight or completed).
    6. Return `{ removedCount, removedDirs }`.
  - [ ] 7.4 NFR-S1: filesystem reads + writes only, zero network. NFR-R1: no atomic-write needed (we're DELETING; the stagingRoot itself is never overwritten).
  - [ ] 7.5 Caller note: `cleanStagingOrphans()` is a Story 2.4 / 2.6 runner-tier composition; Story 2.2 ships ONLY the function. The architecture's "at Stepper start" wording (AC-4) implies the runner-tier (Story 2.4 `run.ts` or Story 2.6 `verify-and-advance.ts`) calls it once per `bun run` invocation; Story 2.2 does NOT wire that call.

- [ ] **Task 8 — Implement test files (AC: all)**
  - [ ] 8.1 Create `src/schemas/dispatch-protocol.test.ts`. Tests (mirror Story 1.5 schema-test patterns):
    - Each of the three union variants (`dispatch`, `report`, `halt`) parses a fixture successfully.
    - Each variant rejects mismatched/missing fields (e.g., `dispatch` requires `runId`+`agent`+`exitCode:0`; `halt` requires `exitCode >= 1`).
    - The discriminated union correctly switches on the `action` field.
    - Round-trip: `JSON.stringify(parsed)` → `JSON.parse` → `schema.parse` produces an identical literal.
  - [ ] 8.2 Create `src/dispatch/generate-spec.test.ts`. Per AR35, use Bun's built-in test runner; spin up tmpdirs per test via `mkdtemp(path.join(os.tmpdir(), "stepper-dispatch-"))`. Tests:
    - **AC-1 happy path**: call `buildDispatchSpec({ stepName: "dev-story", state: <fixture>, persona: "dev", stagingRoot: <tmpdir> })`. Assert `result.runId` matches the architecture §P5 line 871 format; assert `result.stagingDir` exists; assert `result.dispatchSpecPath` exists; assert `JSON.parse(await Bun.file(result.dispatchSpecPath).text())` validates against `DispatchSpecV1Schema`; assert `staging/<runId>/inputs/` and `staging/<runId>/outputs/` directories were created (via `fs.access`).
    - **AC-1 model override**: call with `modelOverride: "opus"`; assert the written spec has `model: "opus"`.
    - **AC-1 budget override**: call with `budgetOverride: { contextTokens: 100000, timeoutMs: 600000 }`; assert the written spec has the overridden budget; assert missing-field budget overrides fall through to defaults (e.g., `{ contextTokens: 100000 }` only — `timeoutMs` defaults to 300000).
    - **AC-2 staging directory tree**: assert `staging/<runId>/` contains `inputs/`, `outputs/`, and `dispatch-spec.json` (no other files).
    - **AC-3 schema validation defence-in-depth**: monkey-patch a malformed input (e.g., `stepName: ""`) and assert `ConfigError` is thrown with the AC-verbatim hint substituted via `hintOverride`. Use `expect.toThrow()` against the `ConfigError` class.
    - **NFR-R1 atomic write**: assert that `dispatch-spec.json` is written via `atomicWrite` (the file appears AFTER the atomic rename). Verified by inspecting `dispatch-spec.json.bak` rotation if a second `buildDispatchSpec` call with the same runId overwrites it (NOTE: the runId is timestamp+random; collisions are vanishingly unlikely — for the test, manually overwrite the file to simulate the second call).
    - **NFR-S1 no main-thread network**: import `Grep` of `fetch(`, `http.`, `https.`, `net.` against `src/dispatch/**/*.ts` (excluding `*.test.ts`); assert zero matches.
  - [ ] 8.3 Create `src/dispatch/emit.test.ts`. Tests:
    - **AC-5 stdout discipline**: spy on `process.stdout.write` (e.g., `mock.method(process.stdout, "write")`); call `emitDispatchAction({ action: "dispatch", runId: "test", agent: "bmad-step-runner", exitCode: 0 })`; assert exactly ONE call to `process.stdout.write` with the JSON line + trailing newline.
    - **AC-5 schema validation pre-emit**: pass a malformed action (e.g., `{ action: "dispatch", exitCode: 1 }` — dispatch requires `exitCode: 0`); assert `ZodError` thrown.
    - **All three action variants**: verify the JSON-line shape for `dispatch`, `report`, and `halt` (each rendered via `JSON.stringify`).
  - [ ] 8.4 Create `src/dispatch/staging-cleanup.test.ts`. Tests:
    - **AC-4 happy path**: create 3 fixture staging dirs in tmpdir; set `mtime` of dir 1 to 25h ago, dir 2 to 23h ago, dir 3 to 25h ago WITH a `completion-marker.json`; call `cleanStagingOrphans({ stagingRoot, now })`; assert `removedCount === 1` (only dir 1 — dir 2 too young, dir 3 has marker).
    - **AC-4 no-op when stagingRoot absent**: call with a non-existent `stagingRoot`; assert `removedCount === 0`, `removedDirs === []`, no throw.
    - **AC-4 custom age threshold**: pass `ageThresholdMs: 1000` (1s); assert dirs older than 1s are removed.
    - **AC-4 completion-marker preservation**: even at 25h, dirs WITH `completion-marker.json` are NOT removed.

- [ ] **Task 9 — Quality gates (AC: all)**
  - [ ] 9.1 Run `bun run check` — expect 0 fail, baseline 354 + ~20-30 new tests passing (~375-385 total). Record in Completion Notes.
  - [ ] 9.2 Run `bun run lint` (Biome) — expect 0 errors, 0 warnings.
  - [ ] 9.3 Run `bun run typecheck` (`tsc --noEmit`) — expect 0 errors.
  - [ ] 9.4 Run AR41 import-boundary check (manual grep, until automated CI gate lands) — expect zero violations from `src/dispatch/**/*.ts`. Banned imports for the higher-tier dispatch module: `../verifiers/`, `../failure-ux/`, `../commands/`, `node:child_process`, any new external runtime dep beyond `zod`.
  - [ ] 9.5 Confirm `src/errors.ts` registry stays at 16 codes. Story 2.2 USES `ConfigError` (existing class with `hintOverride?` from Story 1.11) but does NOT extend the registry.
  - [ ] 9.6 Confirm `src/io/paths.ts` exports the new `STAGING_PATH` constant. Re-run `bun test src/io/` to confirm the existing `paths.test.ts` still passes.
  - [ ] 9.7 Re-run `bun test src/verifiers/` (Story 2.1's tests) to confirm the new `STAGING_PATH` constant did NOT break Story 2.1. (It should not — Story 2.1 accepts `stagingRoot` as a REQUIRED option per dev-002 deviation; the new constant is OPTIONAL backwards-compat.)
  - [ ] 9.8 **Manual smoke (recommended)**: from a Bun REPL, call `buildDispatchSpec({ stepName: "dev-story", state: <minimal fixture>, persona: "dev", stagingRoot: "/tmp/dispatch-smoke" })`; verify `dispatch-spec.json` is written and validates.
  - [ ] 9.9 **Manual smoke for emit**: from a Bun REPL, call `emitDispatchAction({ action: "dispatch", runId: "test", agent: "bmad-step-runner", exitCode: 0 })`; verify ONE JSON line printed to stdout.

- [ ] **Task 10 — Update story status + sprint status (AC: all)**
  - [ ] 10.1 Update story file frontmatter: `status: ready-for-dev` → `status: review` (after dev completes; the bmad-create-story persona starts at `ready-for-dev`).
  - [ ] 10.2 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: `2-2-dispatch-spec-generator: ready-for-dev` → `in-progress` → eventually `review` → `done` per Stepper's status transitions.
  - [ ] 10.3 Append a Change Log entry per the template at the bottom of this file.

## Dev Notes

### Architecture compliance

- **§A.D2 (lines 297-336) — Sub-agent dispatch via Task tool**: the dispatch interface is Claude Code's standard `Task` tool against agents in `agents/`. `buildDispatchSpec` produces the JSON spec that the slash-command markdown (Story 2.7) reads to construct the `Task` invocation deterministically. Story 2.2's `dispatch-spec.json` is the **input contract** to Layer 3 (the sub-agent).
- **§P5 (lines 864-917) — Sub-Agent Dispatch Contract**: the canonical `dispatch-spec.json` shape lives in `src/schemas/dispatch-spec.ts` (Story 1.5 — already shipped). Story 2.2's `buildDispatchSpec` produces a literal validated against `DispatchSpecV1Schema` and writes it via `atomicWrite`. The architecture example at lines 868-898 is the reference shape; Story 2.2 produces the same shape with v0.1-conservative defaults (empty `context[]`, generic `task` text, generic `successCriteria[]`, AR-mandated `constraints.allowedTools` + `constraints.scopeLimits`).
- **§directory-listing (line 1175) — `src/dispatch/`**: the architecture-prescribed directory layout lists `src/dispatch/` with `index.ts`, `generate-spec.ts`, `promote.ts`, `staging-cleanup.ts`. Story 2.2 ships `index.ts` + `generate-spec.ts` + `staging-cleanup.ts` + new `emit.ts` + `types.ts` (5 files); `promote.ts` is a Story 2.6 deliverable per architecture §line 1178 + Story 2.1 carry-over.
- **§AR41 (lines 1287-1289) — Higher-tier boundary**: `src/dispatch/` is **higher-tier** (sibling of `src/verifiers/` shipped in Story 2.1). Allowed imports: foundational (`../errors.ts`, `../io/`, `../schemas/`); mid-tier (`../personas/`, `../dag/` — both OPTIONAL in v0.1; the caller supplies the resolved persona + step). FORBIDDEN: sibling higher-tier (`../verifiers/`, `../failure-ux/`); top-tier (`../commands/`); `node:child_process`; any new external runtime dep beyond `zod`. The composition of (`personas/` resolver → `buildDispatchSpec` → emit JSON line) lives at the runner tier (`src/commands/next/run.ts`, Story 2.4).
- **§line 1660 — AR9 (`run.ts` JSON-line stdout protocol)**: `run.ts` emits exactly one JSON line on stdout per invocation. Schema in `src/schemas/dispatch-protocol.ts` (NEW — Story 2.2 introduces this file). Layer 1's slash-command markdown reads the single line and branches accordingly. Other modes (`--dry-run`, `--explain`, `--list`) use `action: "report"` and pass content via `message`.
- **§line 1676 — `src/schemas/dispatch-protocol.ts` deferred-from-step-06**: the architecture explicitly notes "a new schema file added to step-06's tree". Story 2.2 introduces it because the dispatch generator emits the action line; the schema is the strict contract enforced by `emitDispatchAction()`.
- **AR7 — 6-section task spec**: PERSONA, CONTEXT, TASK, OUTPUT FORMAT, SUCCESS CRITERIA, CONSTRAINTS. Story 2.2's `buildDispatchSpec` produces the literal with all six sections populated; the `taskSpec` field of `DispatchSpecV1Schema` is the canonical shape (see `src/schemas/dispatch-spec.ts:35-43`).
- **AR9 — JSON-line protocol**: discriminated union over `action: "dispatch" | "report" | "halt"`. Story 2.2's `emit.ts` enforces the AR9 shape via Zod parse; the slash-command markdown reads `bun run`'s stdout line-by-line.
- **AR21, AR22**: `buildDispatchSpec` throws `ConfigError` (existing class from Story 1.11) for stepName-resolution failures + schema-validation failures. The `hintOverride?` constructor pattern (Stories 1.10 + 1.11 precedent) provides AC-verbatim hint substitution without registering a new class.
- **AR33 — function & error semantics**: `buildDispatchSpec` is `async`; `emitDispatchAction` is sync (mirrors `json()` from Story 1.3); `cleanStagingOrphans` is `async`. All three throw `StepperError` subclasses for hard failures; per-orphan cleanup failures are logged via `info()` but do NOT propagate (no-op-on-error per the cleanup contract).

### JSON-line stdout protocol design (per epic-1-retrospective forward action)

Per epic-1-retrospective.md §Forward Action Items for Epic 2 line 102: "Story 2.2: JSON-line protocol design; stdout-only discipline (FR54 / AR9). Schema lives at `src/schemas/dispatch-spec.ts` (already shipped in Story 1.5)." The protocol decisions:

- **Single line, single shape**: per AR9 + architecture line 1660, `run.ts` emits EXACTLY ONE JSON line per invocation. Layer 1 reads that line and branches; never multi-line, never streaming.
- **Discriminated union over `action`**: three values — `"dispatch"`, `"report"`, `"halt"`. Each variant has a different required-field set:
  - `dispatch`: `{ runId, agent, exitCode: 0 }`. Layer 1 invokes `Task` against `agent` with the spec at `staging/<runId>/dispatch-spec.json`.
  - `report`: `{ message, exitCode >= 0 }`. Layer 1 prints `message` to the user. Used by `--dry-run`, `--explain`, `--list`.
  - `halt`: `{ message, exitCode >= 1 }`. Layer 1 prints `message` (the actionable hint) and exits with the non-zero code. Used by failure paths.
- **stdout-only discipline (FR54)**: per architecture line 862 + Story 1.3, `info()` / `warn()` / `error()` route to **stderr**; `json()` (the canonical stdout writer) routes to **stdout**. Story 2.2's `emit.ts` is the SECOND module-wide stdout writer (after `--export-state` JSON in Story 1.3); together they reserve stdout for two clean channels: (a) the AR9 dispatch-action protocol (Story 2.2), (b) the `--export-state` JSON (Story 1.3). All other diagnostics MUST route to stderr — verified by integration tests in Story 2.4 (`run.ts` smoke test asserts `stdout` contains exactly one line; everything else lands on stderr).
- **Schema location**: per architecture line 1676, the schema lives at `src/schemas/dispatch-protocol.ts` (NEW in Story 2.2). The Story 1.5 `src/schemas/dispatch-spec.ts` was the JSON file written by `generate-spec.ts`; the AR9 stdout-line protocol is a separate schema file.

### `phase` field deferral (AC drift note)

AC-1 lists `phase` as a `dispatch-spec.json` field BUT the existing Story 1.5 `DispatchSpecV1Schema` (`src/schemas/dispatch-spec.ts:24-43`) does NOT declare `phase`. Story 2.2 ships the schema **verbatim from Story 1.5**; `phase` is documented in the spec's `task` field human-readable text (e.g., `"Execute BMAD step <stepName> in phase <phase>."`) but NOT a strict schema field. Two forward paths:

1. **Schema bump in Story 6.x** (recommended): introduce `DispatchSpecV2Schema` with optional `phase: z.enum(["planning","implementation"])`. Migration path follows Story 1.5's family-registry pattern.
2. **In-place extension to V1Schema**: extend Story 1.5's `DispatchSpecV1Schema` to add `phase: z.enum([...]).optional()`. Risk: minor schema drift in Story 1.5's ratified schema — should be a deliberate Story 6.x ratification, not a Story 2.2 sneak-in.

Document this carry-over in dev Completion Notes; raise to Story 6.x for ratification.

### Logging discipline (AR/FR54)

Per architecture line 862 + Story 1.3 `src/io/log.ts`:
- `info()` / `warn()` / `error()` → **stderr** (line-delimited human-readable).
- `json()` → **stdout** (line-delimited JSON; reserved for AR9 dispatch-action + `--export-state`).

Story 2.2's `emit.ts` calls `json()` (stdout). `generate-spec.ts` calls `info()` for "Built dispatch spec for step <name> at <path>" progress (stderr). `staging-cleanup.ts` calls `info()` for "Removed orphan staging dir <path>" (stderr). NEVER `console.*` (Biome rule + AR33).

### Atomic write discipline (NFR-R1, NFR-S5)

Per Story 1.3's `src/io/atomic-write.ts` contract: writes go to `path.tmp` first, then `fs.rename(path.tmp, path)`, with `.bak` rotation kept for one cycle. Story 2.2's `generate-spec.ts` MUST use `atomicWrite` (NOT `Bun.write` directly) for `dispatch-spec.json` so the file is never observable in a partial state. The `.bak` rotation is preserved automatically — if `dispatch-spec.json` exists from a prior collision (vanishingly unlikely given timestamp+random runId), the old file becomes `dispatch-spec.json.bak` and the new file replaces it atomically.

### Test pattern (AR35)

Per Story 1.3 / 1.4 / 1.5 / 1.6 / 1.8 / 1.9 / 1.10 / 1.11 / 1.12 / 2.1 precedent:
- Use Bun's built-in test runner (`bun test`).
- Spin up a tmpdir per test via `node:fs/promises mkdtemp(path.join(os.tmpdir(), "stepper-dispatch-"))`.
- Clean up via `afterEach rm({ recursive: true })`.
- NEVER hard-code `/tmp/...` paths.
- For `buildDispatchSpec()` integration tests, call the testable export directly and inspect the returned `BuildDispatchSpecResult` struct + the on-disk `dispatch-spec.json`.
- For `emitDispatchAction()` stdout tests, spy on `process.stdout.write` via `mock.method` (Bun test API) and assert exactly one call with the JSON-line shape.

### Forward-dep notes

- **Story 2.3 — Generic sub-agent (`bmad-step-runner.md`)**: PRIMARY READER of `dispatch-spec.json`. The sub-agent's prompt body says "read `staging/<run-id>/dispatch-spec.json` and follow the 6-section contract." Story 2.2's spec contract IS the API the sub-agent reads. The `taskSpec.constraints.scopeLimits` field (`Only files inside staging/<run-id>/ may be written.`) is the architectural NFR-S4 enforcement at the prompt layer.
- **Story 2.4 — Lock-free `run.ts`**: PRIMARY CALLER. `run.ts` composes `loadStateUnlocked()` + `buildDag()` + `computeNextStep()` + `resolvePersona()` + `buildDispatchSpec()` + `emitDispatchAction({ action: "dispatch", runId, agent: "bmad-step-runner", exitCode: 0 })`. Story 2.2 provides the `buildDispatchSpec` + `emitDispatchAction` exports; Story 2.4 wires them together. Story 2.4 is also the canonical caller of `cleanStagingOrphans()` "at Stepper start" per AC-4.
- **Story 2.6 — `verify-and-advance.ts` with state-hash check**: SECONDARY READER of `dispatch-spec.json`. The verify-and-advance runner reads the spec to extract `dispatchSpec.step` (passed as `opts.stepName` to `runVerifier` from Story 2.1). This RESOLVES Story 2.1 dev-002 forward-dep (currently `runVerifier` REQUIRES `stagingRoot` + `stepName`; Story 2.6 reads them from the spec). Story 2.6 also reads `dispatchSpec.runId` to compute the state-hash snapshot for the TOCTOU check (per epics.md Story 2.6 AC: "computes a stable hash over `(lastSuccessfulStep, lastAttempted)`, and compares to the snapshot stored in `staging/<run-id>/dispatch-spec.json` at dispatch-time"). **Note**: this implies Story 2.6 either (a) ratifies a `DispatchSpecV2Schema` adding a `stateHash` field, OR (b) writes the state-hash to a sibling file (`staging/<run-id>/state-hash.json`). Story 2.2 does NOT pre-empt this decision; the v0.1 spec ships without `stateHash`.
- **Story 2.7 — Slash command markdown**: reads `bun run`'s stdout one line at a time and parses with `DispatchActionV1Schema`. The slash-command body says "if `action === "dispatch"`, invoke `Task` against `staging/<run-id>/dispatch-spec.json`." Story 2.7 is the SECONDARY READER of the dispatch-protocol schema.
- **Story 2.8 — Smoke test**: asserts the full happy-path: `bun run src/commands/next/run.ts` → reads stdout JSON line → matches `action: "dispatch"` → reads `dispatch-spec.json` → asserts the spec validates → simulates sub-agent (writes a fixture artifact to `staging/<runId>/outputs/`) → `bun run src/commands/next/verify-and-advance.ts` → asserts `staging/<runId>/verifier-result.json` contains `status: "pass"`.
- **Story 4.1 — `/bmad-loop` skeleton**: WILL CONSUME the dispatch-spec contract for sub-loop iterations. Each loop iteration invokes `run.ts` (Story 2.4) which calls `buildDispatchSpec` (Story 2.2). The runId per iteration is unique; the staging cleanup runs once per loop start.
- **Story 5.* — Failure-UX modes**: each mode (retry / skip / route-to-fixer / escalate) will read the dispatch-spec via `staging/<runId>/dispatch-spec.json` to construct context for the retry prompt OR to emit the actionable-error report. The `failure-ux` higher-tier module (Epic 5) is a SIBLING of `dispatch/` — composition lives at runner tier per AR41.
- **Story 6.x — `phase` field schema bump**: AC-1 mentions `phase` but Story 1.5 `DispatchSpecV1Schema` does not declare it. Story 6.x (or Story 2.6) ratifies a schema bump to add the field.

### AR41 boundary (higher-tier)

`src/dispatch/` is the SECOND higher-tier module of the project (after `src/verifiers/` from Story 2.1). Per architecture lines 1287-1289, higher-tier modules depend on foundational + mid-level; never on sibling higher-tier.

**Allowed imports** for `src/dispatch/**/*.ts`:
- `../errors.ts` (foundational; for `ConfigError` + `MigrationFailureError` orchestration-level throws — both existing classes, NO registry extension).
- `../io/log.ts` (foundational; for `info` / `error` / `json` writers — stderr/stdout discipline).
- `../io/paths.ts` (foundational; for `STAGING_PATH` canonical staging directory + `assertWithinScope` for write-target validation; the `STAGING_PATH` constant is ADDED in Story 2.2 Task 1).
- `../io/atomic-write.ts` (foundational; for `atomicWrite` — NFR-R1 atomic JSON write).
- `../schemas/dispatch-spec.ts` (foundational; for `DispatchSpecV1Schema`, `DispatchSpecV1`, `DispatchSpec` types).
- `../schemas/dispatch-protocol.ts` (foundational; NEW in Story 2.2 — for `DispatchActionV1Schema`, `DispatchActionV1`, `DispatchAction` types).
- `../schemas/state.ts` (foundational; for `State` type used in `DispatchSpecInput`).
- `../personas/index.ts` (mid-tier; OPTIONAL — NOT used in v0.1; the caller supplies the resolved persona).
- `../dag/index.ts` (mid-tier; OPTIONAL — NOT used in v0.1; the caller supplies the resolved step).
- Bun stdlib: `Bun.file`, `Bun.write`, `Bun.YAML`.
- Node stdlib: `node:fs/promises`, `node:path`, `node:os`, `node:crypto` (for `randomUUID`).
- External libraries: `zod` (for the schema validation calls).

**FORBIDDEN imports** for `src/dispatch/**/*.ts`:
- `../verifiers/**` (sibling higher-tier — composition lives at runner tier per AR41).
- `../failure-ux/**` (sibling higher-tier — same).
- `../commands/**` (top-tier — dispatch cannot import from commands).
- `node:child_process` — use `Bun.spawn` if a subprocess is ever required (v0.1 doesn't need any).
- Any new external runtime dep beyond `zod`.

The architecture's import-boundary CI check excludes `*.test.ts` files from cross-module restrictions; the test files MAY import freely (e.g., `generate-spec.test.ts` may import test fixtures from anywhere).

### `src/io/paths.ts` modification (Story 2.1 dev-002 carry-over)

Story 2.1 dev-002 deferred the `STAGING_PATH` constant to Story 2.2. Per the deviation note in Story 2.1 §Carry-Overs to Future Stories line 715 + the senior reviewer's adjudication line 705: "Sound forward-dep handling: the `STAGING_PATH` constant lands in Story 2.2 alongside the dispatch-spec generator." Story 2.2 Task 1 adds the constant; the `runVerifier` `stagingRoot` REQUIRED → OPTIONAL conversion is a **separate Story 2.6 polish PR** (NOT this story — Story 2.2 keeps Story 2.1's behavior unchanged so no test regressions surface in the verifier suite).

### Errors registry stability

Story 2.2 USES existing classes only:
- `ConfigError` (Story 1.11) — for stepName-resolution failures + schema-parse failures. The `hintOverride?` 3rd-arg constructor pattern provides AC-verbatim hint substitution.
- `ScopeViolationError` (Story 1.5) — propagates transitively from `assertWithinScope` (called inside `atomicWrite`).
- `MigrationFailureError` (Story 1.5) — only if a future Story 6.x schema migration is needed; v0.1 does NOT trigger this path.

NO new error class is added. The registry stays at **16 codes**. The CI gate `bun test src/errors.test.ts` (10 pass / 197 expects) is preserved.

## Previous Story Intelligence

This is iteration 2 of Epic 2 — the **second story** of the epic, following Story 2.1 (verifier registry). Lessons learned from Stories 1.1–1.13 + Story 2.1 directly applicable to Story 2.2:

### Story 1.1 — Bun host scaffold

- Bun 1.3.12 is the minimum supported runtime (AR2). Story 2.2's tests use `Bun.write`, `Bun.file`, `mock.method` (for stdout spying), and Bun's built-in test runner. No `bun add` required (zero new deps — `zod` is already pinned).
- `package.json` `scripts` block exposes `check`, `lint`, `typecheck`, `test`. Story 2.2 must keep these passing.

### Story 1.2 — Errors module + registry CI gate

- The 16-entry registry is stable; Story 2.2 uses `ConfigError` (with `hintOverride?` from Story 1.11) for orchestration-level throws. Does NOT extend the registry.
- The `errors.test.ts` registry CI gate enforces AR22 hint discipline. Story 2.2's runner surfaces `error.actionableHint` verbatim; no string mutation.
- The `hintOverride?` constructor pattern (Stories 1.10 `UnknownBmadSkillError` + 1.11 `ConfigError`) is the precedent for per-instance hint overrides. Story 2.2 uses Story 1.11's `ConfigError` with `hintOverride: "Add the step name to the bmad-stepper.config.yaml steps: block."` for stepName-empty failure.

### Story 1.3 — Logger + path helpers + atomic write

- `src/io/log.ts` exports `info`, `warn`, `error`, `json`. Per architecture line 862 + FR54: `info`/`warn`/`error` → **stderr**; `json` → **stdout**. Story 2.2's `emit.ts` is the SECOND module-wide caller of `json()` (the first was Story 1.3's `--export-state` JSON helper). Together they reserve stdout for two clean channels.
- `src/io/paths.ts` exports `STEPPER_INTERNAL_ROOT`, `BMAD_OUTPUT_ROOT`, `assertWithinScope()`. Story 2.2 ADDS `STAGING_PATH` (resolves Story 2.1 dev-002 forward-dep). The constant is `path.join(STEPPER_INTERNAL_ROOT, "staging")` — under the existing scope, so `assertWithinScope` accepts any write target under `STAGING_PATH/<runId>/`.
- `src/io/atomic-write.ts` exports `atomicWrite(path, contents)`. Story 2.2 uses this for `dispatch-spec.json` (NFR-R1 zero data loss + .bak rotation).

### Story 1.4 — File lock with heartbeat

- `src/lock/lock.ts` is a mid-tier sibling. Per architecture line 1672 + AR41, the dispatch-spec generator is **NOT** a lock-acquiring runner — Story 2.6's `verify-and-advance.ts` is the lock-acquiring caller. Story 2.2's `buildDispatchSpec` is **lock-agnostic**: it can be called with or without a held lock; per architecture §line 1672 + AR8 (lock-free `run.ts`, lock in `verify-and-advance.ts`), Story 2.4's `run.ts` calls `buildDispatchSpec` WITHOUT holding a lock — this is the architecturally critical lock-free path.

### Story 1.5 — Schemas + migrations skeleton

- `src/schemas/dispatch-spec.ts` exports `DispatchSpecV1Schema`, `DispatchSpecV1`, `DispatchSpec`, `DispatchSpecLatestSchema`. Story 2.2 imports `DispatchSpecV1Schema` for defence-in-depth validation pre-write, and `DispatchSpecV1` as the spec literal type.
- Story 1.5's canonical fixture (`canonicalDispatchSpecV1Fixture` in `dispatch-spec.test.ts`) — the architectural §P5 example at lines 868-898 — is the reference shape. Story 2.2's `buildDispatchSpec` produces an analogous shape with v0.1-conservative defaults.
- The `phase` field is mentioned in AC-1 BUT NOT declared in the Story 1.5 `DispatchSpecV1Schema`. Story 2.2 documents this as a deferred-to-Story-6.x ratification (carry-over).
- Story 1.5's pattern of migration registries (`src/migrations/<family>/index.ts`) extends to dispatch-spec when `DispatchSpecV2Schema` lands — currently no migration is needed.
- **NEW in Story 2.2**: `src/schemas/dispatch-protocol.ts` — declares the AR9 stdout-line protocol shape per architecture §line 1676 (deferred-from-step-06).

### Story 1.6 — State subsystem load/save/recompute skeleton

- `src/state/load.ts` and `src/state/save.ts` are mid-tier siblings. Story 2.2's `buildDispatchSpec` does NOT touch `state.yaml` directly — the `state` parameter is the already-loaded `State` shape, supplied by the caller (Story 2.4 `run.ts` calls `loadStateUnlocked()` from Story 1.6). Story 2.2 reads `state.lastAttempted` / `state.lastSuccessfulStep` for epic/story/phase resolution if those fields are exposed in the v0.1 State shape; if NOT, Story 2.2 accepts these fields as optional inputs on `BuildDispatchSpecInput` (defensive backwards-compat).
- The `loadStateUnlocked()` function from Story 1.6 is the canonical Story 2.4 entry point (lock-free read-modify-write); Story 2.2's generator does NOT call it — the runner does.

### Story 1.7 — CLI argument parser

- Story 1.7's `Result<T, E>` pattern is NOT used by Story 2.2 (no CLI surface — `buildDispatchSpec` is invoked programmatically by Story 2.4's `run.ts`).
- Story 1.7's hand-rolled tokenizer + Zod schema + `.strict()` rejection pattern is NOT applicable.

### Story 1.8 — Snapshot branch+sha detection

- `src/snapshot/` is mid-tier; not directly touched by Story 2.2. Story 2.6's `verify-and-advance.ts` may invoke snapshot capture before verification (architecture §D10 checkpoint mechanism); Story 2.2 doesn't.

### Story 1.9 — BMAD detection

- `src/bmad-detect/` is mid-tier; not touched by Story 2.2. The dispatch generator does NOT need to detect BMAD installation — Story 1.10's DAG builder + Story 1.11's persona resolver have already validated upstream.

### Story 1.10 — DAG seed + three-tier registry

- `src/dag/index.ts` is mid-tier; v0.1 Story 2.2 does NOT import from it (the step name is provided directly via `input.stepName`). The caller (Story 2.4 `run.ts`) is responsible for resolving `stepName` via `computeNextStep(state, dag)` BEFORE calling `buildDispatchSpec`.
- Story 1.10's hand-curated seed-v6.x.ts pattern (literal entries for 38 BMAD skills) is the **upstream** of the step name flow; Story 2.2's `buildDispatchSpec` consumes the resolved step name, never the DAG.
- Story 1.10's `tarjan.ts → sort.ts` rename carry-over is independent of Story 2.2.

### Story 1.11 — Persona resolution

- `src/personas/index.ts` exports `resolvePersona`, `DEFAULT_PERSONAS`, `ResolveInput`, `ResolveOptions`. Per AR41, Story 2.2's `src/dispatch/` MAY import from `src/personas/` (mid-tier) — but in v0.1 it does NOT. The caller (Story 2.4 `run.ts`) calls `resolvePersona()` and supplies the resolved string (or string[] — multi-persona) to `buildDispatchSpec`. **Multi-persona handling**: per AR16 + architecture line 187, multi-persona steps dispatch sub-agents sequentially; Story 2.2 ships the per-persona `buildDispatchSpec`. The sequential loop over `string[]` is a Story 2.4 runner concern.
- Story 1.11's `ConfigError` with `hintOverride?` constructor pattern is the **direct precedent** for Story 2.2's `buildDispatchSpec` throw sites (stepName-empty + Zod-parse failure both throw `ConfigError` with `hintOverride`).
- Story 1.11's `defaults.ts` pattern (one file, all defaults) is NOT directly applicable — Story 2.2 does NOT ship a defaults map; the dispatch spec's defaults (`model: "sonnet"`, `contextTokens: 60000`, `timeoutMs: 300000`) are inline literals in `generate-spec.ts`.
- Story 1.11's reviewer NIT-1 (`export type ResolvedPersona`) carry-over does NOT block Story 2.2.

### Story 1.12 — `/bmad-next --doctor` Command

- Story 1.12 was the **first integration command** (top-tier). Story 2.2 is a higher-tier module — same AR41 boundary discipline as Story 2.1 (sibling higher-tier `verifiers/` and `failure-ux/` are FORBIDDEN imports).
- Story 1.12's composer-at-runner pattern is the **direct precedent** for Story 2.4 (`run.ts` composes Story 2.2's `buildDispatchSpec` + Story 1.11's `resolvePersona` + Story 1.10's `computeNextStep` + Story 1.6's `loadStateUnlocked`). Story 2.2 itself stays pure (no composition).
- Story 1.12's `Bun.file(path).size === 0` pre-check pattern (dev-002 deviation) is NOT applicable to Story 2.2.
- Story 1.12's spawn-with-cwd marketplace test pattern (dev-003) is NOT directly applicable to Story 2.2; Story 2.8 (smoke test) will use that pattern when validating the full `/bmad-next` happy path.
- Story 1.12's `countProjectOverrides` inline YAML extractor (info I3 carry-over) — independent of Story 2.2; will land in Story 6.1.
- Story 1.12's persona-resolvability check (info I1 deferred) — independent of Story 2.2; will land in Story 3.6.

### Story 1.13 — Quick-Start Documentation

- Story 1.13 shipped zero `*.ts` deltas (documentation-only). Story 2.2 ships TS code; its README documentation is deferred to Epic 6 (Story 6.10 marketplace release). Story 2.2's JSDoc on every file IS the canonical source-tree documentation.

### Story 2.1 — Verifier configuration registry (PREVIOUS STORY)

- Story 2.1 shipped `src/verifiers/` — the FIRST higher-tier module. Story 2.2 ships `src/dispatch/` — the SECOND. AR41 boundary discipline holds: sibling higher-tier (`verifiers/` ↔ `dispatch/`) FORBIDDEN.
- Story 2.1's pattern of (`index.ts` barrel + `types.ts` + per-concern source files + colocated tests) is the direct template for Story 2.2's file layout. Story 2.2's structure: `index.ts` (barrel), `types.ts` (public types), `generate-spec.ts` (orchestrator), `emit.ts` (stdout writer), `staging-cleanup.ts` (orphan cleanup).
- Story 2.1 dev-002 carry-over: `STAGING_PATH` constant in `src/io/paths.ts`. **OWNED BY STORY 2.2** (Task 1) — adds the constant; the `runVerifier` `stagingRoot` REQUIRED → OPTIONAL conversion is deferred to Story 2.6 polish PR.
- Story 2.1's defence-in-depth Zod validation pre-atomic-write pattern (`VerifierResultV1Schema.parse(result)` before `atomicWrite`) is the **direct precedent** for Story 2.2's `DispatchSpecV1Schema.parse(dispatchSpec)` before `atomicWrite`.
- Story 2.1's NFR-R1 atomic-write `.bak` rotation test pattern (test 23 in `checks.test.ts`) is the precedent for Story 2.2's `dispatch-spec.json` `.bak` rotation test in `generate-spec.test.ts`.
- Story 2.1's review outcome: **APPROVE** (0 must-fix, 0 should-fix, 0 nits, 4 info-level non-blocking notes). Story 2.2 should target the same approval profile by following the established patterns + applying the deferred-decision discipline (e.g., `phase` field deferral documented in Completion Notes, NOT silently extended).
- Story 2.1's test count delta: +43 tests (target 25-35; over-shot due to per-check unit-test depth). Story 2.2 targets +20-30 tests (`generate-spec.test.ts` ~10-15, `emit.test.ts` ~5-7, `staging-cleanup.test.ts` ~6-8, `dispatch-protocol.test.ts` ~5-8 — total ~25-38).
- Story 2.1's senior reviewer noted info-3: "`runVerifier` runs the four checks sequentially. Consider `Promise.all` parallelization in a Story 6.x polish PR." Story 2.2 has no parallelization opportunity — `buildDispatchSpec` is sequential by construction (mkdir + atomic write are dependent steps).

### Forward Action Items applied (epic-1-retrospective)

Per `_bmad-output/implementation-artifacts/epic-1-retrospective.md` §Forward Action Items for Epic 2:

- **Story 2.2 forward action (line 102)**: "JSON-line protocol design; stdout-only discipline (FR54 / AR9). Schema lives at `src/schemas/dispatch-spec.ts` (already shipped in Story 1.5)." — **APPLIED**:
  - JSON-line protocol design: §JSON-line stdout protocol design + Task 2 (`dispatch-protocol.ts` schema) + Task 6 (`emit.ts`).
  - stdout-only discipline (FR54 / AR9): documented in §Logging discipline + §JSON-line stdout protocol design + Task 6.
  - Schema location: the dispatch-SPEC schema lives at `src/schemas/dispatch-spec.ts` (Story 1.5, used here); the dispatch-PROTOCOL schema (AR9 stdout line) is NEW at `src/schemas/dispatch-protocol.ts` (Story 2.2 introduces — per architecture line 1676 deferred-from-step-06).
- **Recommended planning sequence (line 110-115)**:
  - "Story 2.2 (dispatch spec generator) must precede Story 2.3 (generic sub-agent runner)" — **HONORED**: Story 2.2 ships before Story 2.3; the dispatch-spec contract IS the API the sub-agent reads.
  - "Front-load Story 2.4 (lock-free `run.ts`) early" — DEFERRED to subsequent loop iterations; Story 2.2 provides the `buildDispatchSpec` callable for Story 2.4 to compose.
  - "Allocate review iteration budget for Story 2.6 (verify-and-advance)" — independent; Story 2.6 follows.
- **Apply tighter scoping for stories above 600 lines (line 165)** — Story 2.2 targets ~480-520 lines (this file). Below the 600-line threshold; on-budget.

## Forward Dependencies

Stories that consume Story 2.2's `src/dispatch/` module surface:

- **Story 2.3 — Generic sub-agent (`bmad-step-runner.md`)** [PRIMARY READER]: the sub-agent's prompt body says "read `staging/<run-id>/dispatch-spec.json` and follow the 6-section contract." The dispatch-spec IS the API the sub-agent reads. Story 2.3 also defines the `agents/bmad-step-runner.md` description that Layer 1 invokes via `Task`.
- **Story 2.4 — Lock-free `run.ts`** [PRIMARY CALLER]: composes `loadStateUnlocked()` (Story 1.6) + `buildDag()` (Story 1.10) + `computeNextStep()` (Story 1.10) + `resolvePersona()` (Story 1.11) + `buildDispatchSpec()` (Story 2.2) + `emitDispatchAction()` (Story 2.2). Story 2.4 is also the canonical caller of `cleanStagingOrphans()` "at Stepper start" (AC-4).
- **Story 2.6 — `verify-and-advance.ts`** [SECONDARY READER]: reads `staging/<runId>/dispatch-spec.json` to extract `dispatchSpec.step` (passed as `opts.stepName` to `runVerifier` from Story 2.1) and `dispatchSpec.runId` for the state-hash TOCTOU snapshot. RESOLVES Story 2.1 dev-002 forward-dep. Optionally ratifies a `DispatchSpecV2Schema` adding a `stateHash` field (or writes to a sibling `staging/<runId>/state-hash.json`).
- **Story 2.7 — Slash command markdown for `/bmad-next`**: reads `bun run`'s stdout one line at a time via the `dispatch-protocol.ts` schema. Branches via `action`: `dispatch` → invoke `Task`; `report` → print `message`; `halt` → print `message` + exit non-zero.
- **Story 2.8 — Smoke test**: asserts the full happy-path dispatch-and-verify flow.
- **Story 4.1 — `/bmad-loop` command skeleton**: each loop iteration invokes `run.ts` (Story 2.4) which calls `buildDispatchSpec`. The runId per iteration is unique; the staging cleanup runs once per loop start.
- **Story 5.1-5.4 — Failure-UX modes**: each mode reads the dispatch-spec via `staging/<runId>/dispatch-spec.json` to construct context for the retry/fixer prompt OR the actionable-error report on halt.
- **Story 6.x — `phase` field schema bump**: ratifies `DispatchSpecV2Schema` adding `phase: z.enum(["planning","implementation"]).optional()`; Story 2.2 documents this as deferred (AC-1 lists `phase` but Story 1.5 schema does not declare it).
- **Story 6.5 — `verifiers:` per-step config override**: independent of Story 2.2; consumes `dispatchSpec.step` only via Story 2.6 reader.

## Project Structure Notes

`src/dispatch/` joins the higher-tier module set per architecture lines 1287-1289. After Story 2.2, the higher-tier set will contain:

- `src/verifiers/` — Story 2.1 (FIRST higher-tier).
- `src/dispatch/` — Story 2.2 (this story; SECOND higher-tier).
- `src/failure-ux/` — Epic 5 (THIRD higher-tier; introduced in Stories 5.1-5.4).

Per AR41 (mid-to-mid ban applied by analogy to higher-to-higher), these three modules MUST NOT import from each other. Composition belongs at the runner tier (`src/commands/next/run.ts` Story 2.4 + `verify-and-advance.ts` Story 2.6).

Story 2.2's deliverable file count:
- New source files (5): `src/dispatch/index.ts`, `src/dispatch/types.ts`, `src/dispatch/generate-spec.ts`, `src/dispatch/emit.ts`, `src/dispatch/staging-cleanup.ts`.
- New schema file (1): `src/schemas/dispatch-protocol.ts` (foundational; per architecture §line 1676 deferred-from-step-06).
- New test files (4): `src/dispatch/generate-spec.test.ts`, `src/dispatch/emit.test.ts`, `src/dispatch/staging-cleanup.test.ts`, `src/schemas/dispatch-protocol.test.ts`.
- Modified files (1): `src/io/paths.ts` (adds `STAGING_PATH` constant per Story 2.1 dev-002 carry-over).

Estimated baseline progression: 354 (Story 2.1 final) → ~375-385 (Story 2.2 + ~20-30 new tests).

## References

- `_bmad-output/planning-artifacts/architecture.md` §A.D2 lines 297-336 (sub-agent dispatch via Task tool)
- `_bmad-output/planning-artifacts/architecture.md` §P5 lines 864-917 (`dispatch-spec.json` shape + verifier output + promotion contract)
- `_bmad-output/planning-artifacts/architecture.md` §line 862 (no `console.log`; `src/io/log.ts` discipline)
- `_bmad-output/planning-artifacts/architecture.md` §line 1175 (`src/dispatch/` directory layout — D2, FR16)
- `_bmad-output/planning-artifacts/architecture.md` §lines 1287-1289 (AR41 higher-tier boundary)
- `_bmad-output/planning-artifacts/architecture.md` §line 1346 (FR16 mapping — `src/dispatch/generate-spec.ts`)
- `_bmad-output/planning-artifacts/architecture.md` §line 1399 (NFR-S4 — `CONSTRAINTS` section enforcement)
- `_bmad-output/planning-artifacts/architecture.md` §line 1460 (AR9 stdout JSON-line emit)
- `_bmad-output/planning-artifacts/architecture.md` §line 1660 (AR9 protocol concretization — exit-code constraints)
- `_bmad-output/planning-artifacts/architecture.md` §line 1676 (`src/schemas/dispatch-protocol.ts` deferred-from-step-06 — NEW in Story 2.2)
- `_bmad-output/planning-artifacts/architecture.md` §line 1726 (parallel sub-agent dispatch deferred post-v0.1)
- `_bmad-output/planning-artifacts/prd.md` FR16 line 689 (sub-agent dispatch with budget+timeout)
- `_bmad-output/planning-artifacts/prd.md` FR18 line 691 (one human-readable line per step)
- `_bmad-output/planning-artifacts/prd.md` FR54 line 745 (stdout/stderr discipline)
- `_bmad-output/planning-artifacts/prd.md` §Sub-Agent Dispatch Contract lines 530-552 (the 6-section task spec)
- `_bmad-output/planning-artifacts/epics.md` Story 2.2 lines 597-610 (AC verbatim source)
- `_bmad-output/implementation-artifacts/epic-1-retrospective.md` §Forward Action Items for Epic 2 line 102 (Story 2.2 design notes)
- `_bmad-output/implementation-artifacts/2-1-verifier-configuration-registry.md` §Carry-Overs to Future Stories line 715 (`STAGING_PATH` carry-over)
- `_bmad-output/implementation-artifacts/2-1-verifier-configuration-registry.md` §Senior Developer Review (template structure precedent for second higher-tier module)
- `src/errors.ts` (Story 1.2 — `ConfigError`, `ScopeViolationError` consumed verbatim; registry stable at 16)
- `src/io/log.ts` (Story 1.3 — `info`, `warn`, `error`, `json` writers — stderr/stdout discipline)
- `src/io/paths.ts` (Story 1.3 + Story 1.5 — `STEPPER_INTERNAL_ROOT`, `BMAD_OUTPUT_ROOT`, `assertWithinScope`; Story 2.2 ADDS `STAGING_PATH`)
- `src/io/atomic-write.ts` (Story 1.3 — `atomicWrite` with `.bak` rotation)
- `src/schemas/dispatch-spec.ts` (Story 1.5 — `DispatchSpecV1Schema`, used here for the FIRST time at a Zod-parse callsite)
- `src/schemas/dispatch-spec.test.ts` (Story 1.5 — canonical fixture)
- `src/personas/index.ts` (Story 1.11 — `resolvePersona`, `DEFAULT_PERSONAS`; mid-tier surface; OPTIONAL Story 2.2 import — NOT used in v0.1)
- `src/verifiers/index.ts` (Story 2.1 — FIRST higher-tier sibling; FORBIDDEN import from Story 2.2)

## Dev Agent Record

### Context Reference

- _bmad-output/planning-artifacts/architecture.md §A.D2 lines 297-336 (sub-agent dispatch via Task tool)
- _bmad-output/planning-artifacts/architecture.md §P5 lines 864-917 (dispatch-spec.json + verifier-result.json shapes)
- _bmad-output/planning-artifacts/architecture.md §lines 1287-1289 (AR41 higher-tier boundary)
- _bmad-output/planning-artifacts/architecture.md §line 1660 (AR9 stdout JSON-line protocol concretization)
- _bmad-output/planning-artifacts/architecture.md §line 1676 (src/schemas/dispatch-protocol.ts deferred-from-step-06 — NEW in Story 2.2)
- _bmad-output/planning-artifacts/prd.md FR16 line 689 (sub-agent dispatch with budget+timeout)
- _bmad-output/planning-artifacts/prd.md FR54 line 745 (stdout/stderr discipline)
- _bmad-output/implementation-artifacts/2-1-verifier-configuration-registry.md (template structure + STAGING_PATH carry-over)
- _bmad-output/implementation-artifacts/epic-1-retrospective.md §Forward Action Items line 102 (JSON-line protocol + stdout discipline)
- src/errors.ts (ConfigError + hintOverride? pattern)
- src/io/log.ts, src/io/paths.ts, src/io/atomic-write.ts (foundational primitives)
- src/schemas/dispatch-spec.ts (Story 1.5 — DispatchSpecV1Schema)

### Agent Model Used

claude-opus-4-7[1m]

### Debug Log References

(populated by dev iteration)

### Completion Notes

(populated by dev iteration)

### File List

(populated by dev iteration)

## Senior Developer Review (AI)

(populated by code-review iteration)

## Change Log

- **2026-05-01 (created)**: Story file created (status `ready-for-dev`) — bmad-create-story persona, model `claude-opus-4-7[1m]`, loop iteration 10 (FINAL) of `/bmad-loop --until=epic:2` (loopId `2026-05-01T031243Z-bmad-loop`, runId `2026-05-01T044326Z-bmad-next`). SECOND epic-2 story (after Story 2.1 verifiers — DONE). Drafted from epics.md §Story 2.2 lines 597-610 (AC verbatim), architecture.md §A.D2 lines 297-336 (sub-agent dispatch interface), §P5 lines 864-917 (dispatch-spec.json contract), §line 1175 directory layout, §lines 1287-1289 AR41 higher-tier boundary, §line 1660 AR9 stdout protocol, §line 1676 dispatch-protocol.ts schema deferred-from-step-06, prd.md FR16 line 689 + FR18 line 691 + FR54 line 745, §Sub-Agent Dispatch Contract lines 530-552, epic-1-retrospective.md §Forward Action Items for Epic 2 line 102 (JSON-line protocol design + stdout-only discipline), Story 2.1 §Carry-Overs to Future Stories line 715 (STAGING_PATH owned by Story 2.2). Mirrors Story 2.1 / 1.11 / 1.12 template structure. Files planned: 5 new sources (`src/dispatch/{index,types,generate-spec,emit,staging-cleanup}.ts`); 1 new schema (`src/schemas/dispatch-protocol.ts`); 4 new tests; 1 modified file (`src/io/paths.ts` adds STAGING_PATH constant per Story 2.1 dev-002 carry-over). SECOND higher-tier module (after `src/verifiers/`) — depends on foundational + (optional) mid-tier; FORBIDDEN sibling higher-tier (`verifiers/`, `failure-ux/`). Errors registry stays at 16; uses existing `ConfigError` (with `hintOverride?` from Story 1.11) for stepName-resolution + Zod-parse failures. The dispatch-spec.json `phase` field (AC-1 mention) is deferred to a Story 6.x schema bump (Story 1.5 `DispatchSpecV1Schema` does not declare it). Story 2.2 dev-story + code-review require subsequent loop invocations (loop hits max-steps-reached after this iteration).
