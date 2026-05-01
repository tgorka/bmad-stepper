---
status: done
story_id: '1.5'
story_key: 1-5-schemas-migrations-skeleton
epic: '1'
title: Schemas + Migrations Skeleton
created: '2026-04-30'
last_updated: '2026-04-30'
priority: blocking
estimated_effort: M
fr_coverage:
  - FR6
  - FR7
nfr_coverage:
  - NFR-R6
  - NFR-M3
ar_coverage:
  - AR20
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
  - _bmad-output/implementation-artifacts/1-4-file-lock-with-heartbeat.md
  - _bmad/config.yaml
---

# Story 1.5: Schemas + Migrations Skeleton

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a **Stepper user**,
I want **every persisted file (`state.yaml`, `bmad-stepper.config.yaml`, run-log JSON, telemetry JSONL) Zod-validated with idempotent migrations**,
so that **loading older state surfaces actionable errors (not stack traces) and forward-compat is provable in CI**.

## Context Summary

This story is the **design-inflection point of Epic 1**. After Story 1.4 landed the third foundational primitive (`src/lock/lock.ts`), the remaining Epic 1 stories (1.6 state subsystem, 1.7 CLI parser, 1.8 snapshot, 1.10 DAG seed, 1.11 personas, 1.12 doctor) all depend on **schema-versioned, Zod-validated, migration-aware loaders**. Story 1.5 lands the **first Zod usage** of the project — until now, Zod 4.4.1 has been pinned in `package.json` (Story 1.1) but never imported anywhere in `src/`. This story changes that: it introduces `src/schemas/` (centralised Zod schemas per architecture line 734) and `src/migrations/` (one file per `<from>-to-<to>` migration plus an `index.ts` registry per family per architecture line 735) — two **mid-tier modules** in the AR41 dependency graph (foundational on the read side: `errors.ts`, `schemas/`; mid-tier on the producer side: `migrations/` consumes `schemas/`).

Concretely, this story produces:

1. Seven schema files in `src/schemas/` — one per persisted schema family — each declaring `<Family>V1Schema` (a Zod schema), the type-alias `<Family>V1` (`z.infer`), and the alias `<Family> = <Family>V1`. Schema families: `state`, `config`, `run-log`, `telemetry`, `dispatch-spec`, `verifier-result`, `pid`. All seven are **first-version** (`schemaVersion: 1`); no v2 exists yet, so the migration registries are skeletons.
2. Four migration registry files in `src/migrations/<family>/index.ts` — one each for `state`, `config`, `run-log`, `telemetry` — typed as `MigrationRegistry<Latest>` per architecture §D8 lines 519–526. Each registry's `current = 1`, `versions[1]` references the V1 schema, and `migrations` is an empty record (no migrations yet — the first migration will be authored in a future story when v2 of any schema is needed). The architecture's prescribed `1-to-2.ts` placeholder file (line 1147) is **NOT** authored in this story — placeholders without bodies are anti-patterns; the registry pattern is the deliverable, not a stubbed migration file.
3. The cross-cutting `loadAndMigrate(raw, registry)` function in `src/migrations/load-and-migrate.ts` — the single entry point that **every** persisted-file loader (Story 1.6 onwards) will use. The function reads `raw.schemaVersion` (default 1 if absent), iteratively validates against `versions[v]` and applies `migrations[v]` until reaching `current`, final-validates against `versions[current]`, and returns the typed Latest shape. On `schemaVersion > current` it throws `StateTooNewError` (already in `src/errors.ts` registry from Story 1.2, exitCode 1, AC-mandated hint `"Run /bmad-next --upgrade to install a Stepper version that supports this schema."`). On any Zod validation failure or JSON-parse failure it throws `CorruptStateError` (also in registry, exitCode 1, AC-mandated hint `"Run /bmad-next --recompute-state to rebuild the cache from project files."`). Any failure inside `migrations[v]` itself surfaces `MigrationFailureError` (already in registry, exitCode 2 — config error per the exit-code mapping table in architecture §D11, since migration-on-load is most often a config-shape regression).
4. Colocated unit tests for every schema file (`<schema>.test.ts`) — minimum coverage: each schema parses a canonical positive example, rejects three categories of negative examples (missing required field, wrong field type, extra field if `.strict()`), and round-trips a `z.infer`-typed value through `.parse()`.
5. The `src/migrations/migration.test.ts` integration test — enumerates every `(fromVersion, toVersion)` path per schema family and asserts **idempotency** per architecture line 539: running migration `n→n+1` on already-`n+1`-shaped data is a no-op (validated by passing the migrated data through `versions[n+1]` and confirming it parses unchanged). This is the **CI gate** for NFR-R6 (idempotent migrations) per architecture line 1407. With only `current = 1` per family, the loop body executes zero migrations per family in this story; the test still authors the harness so future stories adding v2 only need to add a migration entry and a fixture pair.

This story is a **deliberately disciplined skeleton**. It does NOT attempt to author the full state shape (architecture §P3 lines 747–771 lists the canonical `state.yaml` fields, but FR-coverage-wise Story 1.6 is where the actual `state.load.ts` consumes the schema). It does NOT add UI fields, optional metadata, or future-proofing scaffolding. It DOES land:

- The exact AR41-conformant module layout (`src/schemas/`, `src/migrations/`).
- The Zod 4.4.1 import surface (which is the project's first source-side Zod usage; `package.json` already has the dep pinned from Story 1.1 — verify in Task 0).
- The `loadAndMigrate` signature and `MigrationRegistry<Latest>` type contract that downstream stories will hardcode.
- The `STATE_TOO_NEW`, `CORRUPT_STATE`, `MIGRATION_FAILURE` error-throwing pathways (all three classes already registered in `src/errors.ts`).
- The CI idempotency-enumeration harness for NFR-R6.
- The `pid.ts` schema that **replaces** the inline `PidFileContents` interface in `src/lock/lock.ts` (per Story 1.4 Task 1.4 forward-dependency note and Story 1.4 review I-finding I1's "forward-compatibility with Story 1.5 Zod schema"). This is the **second concrete forward-dependency consumed by this story** (the first being `package.json`'s pinned Zod 4.4.1).

The architecture explicitly anticipates this story as the inflection point: architecture line 1751 ("Has Zod 4 added as the only runtime dep") was Story 1.1's deliverable; architecture line 1756 ("subsequent stories build on top in the order ... → migrations → ...") schedules migrations as the next foundational layer. The two relevant architecture lines on idempotency (line 539: "running migration n→n+1 on already-n+1-shaped data is a no-op") and on schema-version typed aliases (line 719: "`StateV1`, `StateV2` for explicit-version types; `State = z.infer<typeof StateLatestSchema>` as the alias for the current version") are both encoded in this story's deliverables.

This is **AR20** (schema migrations — per-schema migration registry; idempotent contract; `STATE_TOO_NEW` and `CORRUPT_STATE` errors), **AR33** (function & error semantics — throw `StepperError` subclasses; async/await; Bun-native `Bun.YAML.parse` for YAML reads; no `any`; no `console.*`), **AR41** (module boundary — `src/schemas/` is foundational alongside `src/errors.ts`, `src/io/`, `src/lock/`; `src/migrations/` is mid-tier consuming foundational), **AR42** (persistence boundary — schema files are the validation surface; reads via `Bun.YAML.parse` for YAML and `JSON.parse` for JSON; writes are out-of-scope here, owned by Stories 1.6 onwards). It also operationalises **FR6** (versioned schema validation with actionable errors), **FR7** (auto-apply schema migrations on load), **NFR-R6** (idempotent migrations), and **NFR-M3** (all public-facing schemas validated by Zod with versioned migrations).

## Acceptance Criteria

The acceptance criteria below are reproduced **verbatim** from `_bmad-output/planning-artifacts/epics.md` §Story 1.5 (lines 417–428, BDD Given/When/Then/And format). Lines and AC labelling preserved.

### AC-1 (Given/When/Then — `loadAndMigrate` happy path)

**Given** centralized schema files in `src/schemas/{state,config,run-log,telemetry,dispatch-spec,verifier-result,pid}.ts`
**When** `loadAndMigrate(raw, registry)` runs
**Then** it reads `schemaVersion` (default 1 if absent), iterates `versions[v]` validate → `migrations[v]` apply → increment until current, final-validates against `versions[current]`, and returns the typed Latest shape

### AC-2 (Given/When/Then — `STATE_TOO_NEW` on schemaVersion > current)

**Given** raw state with `schemaVersion > current`
**When** loading
**Then** it surfaces `STATE_TOO_NEW` (exit 1) with hint `Run /bmad-next --upgrade to install a Stepper version that supports this schema.`

### AC-3 (Given/When/Then — `CORRUPT_STATE` on corrupt JSON/YAML)

**Given** corrupt JSON/YAML
**When** loading
**Then** it surfaces `CORRUPT_STATE` (exit 1) with hint `Run /bmad-next --recompute-state to rebuild the cache from project files.`

### AC-4 (And — Idempotency CI gate)

**And** `migration.test.ts` enumerates every `(fromVersion, toVersion)` path per schema family and asserts idempotency (running `n→n+1` on already-`n+1` data is a no-op)

## Tasks / Subtasks

- [x] **Task 0 — Verify pre-conditions (AC: 1, 2, 3, 4)**
  - [x] 0.1 Confirm `package.json` has `zod` pinned at `^4.4.1` (Story 1.1 deliverable). Run `cat package.json | grep zod` to verify exactly `"zod": "^4.4.1"` or the actual exact-pinned version. **Do NOT run `bun add zod`** — the dep is already present; running `bun add` would re-resolve and possibly bump.
  - [x] 0.2 Confirm the error registry in `src/errors.ts` contains `StateTooNewError`, `CorruptStateError`, `MigrationFailureError` (codes `STATE_TOO_NEW`, `CORRUPT_STATE`, `MIGRATION_FAILURE`). All three already exist post-Story 1.2 (lines 119–131, 175–180 of `src/errors.ts`). Verify hint strings match AC-2 and AC-3 verbatim:
    - `StateTooNewError.actionableHint` MUST equal `"Run /bmad-next --upgrade to install a Stepper version that supports this schema."` (already correct per `src/errors.ts:130`).
    - `CorruptStateError.actionableHint` is currently `"Run /bmad-next --doctor to inspect _bmad-output/.stepper/state.yaml; restore from .bak if needed."` — this does **NOT** match AC-3's required hint `"Run /bmad-next --recompute-state to rebuild the cache from project files."`. Task 7 documents the verbatim-alignment edit (single-string update; class name/code/exitCode preserved; registry count stays at 15).
  - [x] 0.3 Confirm `src/schemas/` and `src/migrations/` directories do **NOT** yet exist. Run `ls src/` to verify only `errors.ts`, `errors.test.ts`, `io/`, `lock/` are present. The two new directories will be created as part of Task 1 (`src/schemas/`) and Task 4 (`src/migrations/`).
  - [x] 0.4 Confirm `bun run check` exits 0 against the post-Story-1.4 baseline. This is the gate from which the Story 1.5 deltas are measured. Document the baseline pass/fail count in Completion Notes (~85 tests across 10 files per Story 1.4's review).
  - [x] 0.5 Confirm Bun host version satisfies AR2 (`Bun ≥ 1.3`). Run `bun --version`; record in Completion Notes.

- [x] **Task 1 — Create `src/schemas/` directory + the seven schema files (AC: 1)**
  - [x] 1.1 Create the directory `src/schemas/` (the project's first invocation of `mkdir src/schemas`). The architecture (line 1134) prescribes the location; AR41 places `schemas/` in the foundational tier alongside `errors.ts` and `io/`.
  - [x] 1.2 Create `src/schemas/state.ts`. Module purpose: declare `StateV1Schema` (Zod schema for `state.yaml`'s v1 shape) plus the type aliases `StateV1` (`z.infer<typeof StateV1Schema>`) and `State = StateV1` (the application-code-facing alias per architecture line 719). The schema MUST cover the `schemaVersion: z.literal(1)` discriminator and the canonical fields from architecture §P3 lines 747–771:
    ```typescript
    import { z } from "zod";

    export const StateV1Schema = z.object({
      schemaVersion: z.literal(1),
      project: z.object({
        name: z.string(),
        bmadVersion: z.string(),
      }),
      lastSuccessfulStep: z
        .object({
          step: z.string(),
          epic: z.number(),
          story: z.string(),
          completedAt: z.string(),
        })
        .nullable()
        .optional(),
      lastAttempted: z
        .object({
          step: z.string(),
          epic: z.number(),
          story: z.string(),
          attemptedAt: z.string(),
        })
        .nullable()
        .optional(),
      lastFailureReason: z
        .object({
          code: z.string(),
          message: z.string(),
          hint: z.string(),
          runId: z.string(),
        })
        .nullable()
        .optional(),
      lastSnapshot: z
        .object({
          branch: z.string(),
          sha: z.string(),
          takenAt: z.string(),
        })
        .nullable()
        .optional(),
      checkpoints: z.array(z.unknown()).max(50).default([]),
      runHistory: z.array(z.unknown()).max(100).default([]),
    });

    export type StateV1 = z.infer<typeof StateV1Schema>;
    export type State = StateV1;
    export const StateLatestSchema = StateV1Schema;
    ```
    The `checkpoints` and `runHistory` `.max()` upper bounds match the FIFO-eviction policy from architecture §P3 line 769 + 770 (50 checkpoints, 100 runs).
  - [x] 1.3 Create `src/schemas/config.ts`. Declare `ConfigV1Schema` per architecture §P3 lines 773–790. All sub-objects (`personas`, `overrides`, `verifiers`, `failurePolicies`, `models`, `budgets`, `paths`, `telemetry`) are present; `paths` and `telemetry` have non-empty defaults; everything else defaults to `{}`. Use `z.record(z.string(), z.unknown())` for the open-shape sub-objects (the per-step shapes are validated in their own stories — Story 1.7 for `dag.overrides`, Story 6.x for verifiers/budgets/etc.). Export `ConfigV1`, `Config = ConfigV1`, `ConfigLatestSchema = ConfigV1Schema`.
  - [x] 1.4 Create `src/schemas/run-log.ts`. Declare `RunLogV1Schema` per architecture §P3 lines 792+ (and architecture line 548 — `JSON run log per step`). Fields: `schemaVersion: z.literal(1)`, `ts: z.string()`, `runId: z.string()`, `step: z.string()`, `epic: z.number().nullable().optional()`, `story: z.string().nullable().optional()`, `phase: z.string().nullable().optional()`, `persona: z.string().nullable().optional()`, `model: z.string().nullable().optional()`, `budget: z.unknown().nullable().optional()`, `timeout: z.unknown().nullable().optional()`, `verifierResult: z.unknown().nullable().optional()`, `stateBefore: z.unknown().nullable().optional()`, `stateAfter: z.unknown().nullable().optional()`, `durationMs: z.number().nullable().optional()`, `tokensIn: z.number().nullable().optional()`, `tokensOut: z.number().nullable().optional()`, `errors: z.array(z.unknown()).default([])`. Export `RunLogV1`, `RunLog = RunLogV1`, `RunLogLatestSchema = RunLogV1Schema`.
  - [x] 1.5 Create `src/schemas/telemetry.ts`. Declare `TelemetryRecordV1Schema` per architecture §P3 line 851 + AR27 line 207. **CRITICAL — closed-set field whitelist:** the schema MUST use `.strict()` to reject extra fields (this enforces NFR-S3 no-PII per architecture line 1664). Fields exactly: `schemaVersion: z.literal(1)`, `ts: z.string()`, `step: z.string()`, `phase: z.string()`, `persona: z.string()`, `model: z.string()`, `durationMs: z.number()`, `verifierStatus: z.enum(["pass", "fail", "skip"])`, `retries: z.number()`, `tokensIn: z.number()`, `tokensOut: z.number()`, `errorCode: z.string().optional()`. Anything else fails Zod validation on collect (the architecture's anti-PII enforcement). Export `TelemetryRecordV1`, `TelemetryRecord = TelemetryRecordV1`, `TelemetryRecordLatestSchema = TelemetryRecordV1Schema`.
  - [x] 1.6 Create `src/schemas/dispatch-spec.ts`. Declare `DispatchSpecV1Schema` per architecture §P5 lines 868–898. Fields: `schemaVersion: z.literal(1)`, `runId: z.string()`, `step: z.string()`, `epic: z.number()`, `story: z.string()`, `model: z.string()`, `budget: z.object({ contextTokens: z.number(), timeoutMs: z.number() })`, `taskSpec: z.object({ persona: z.string(), context: z.array(z.unknown()), task: z.string(), outputFormat: z.unknown(), successCriteria: z.array(z.string()), constraints: z.unknown() })`. Export `DispatchSpecV1`, `DispatchSpec = DispatchSpecV1`, `DispatchSpecLatestSchema = DispatchSpecV1Schema`. (Future stories may tighten the `context` array element shape; v0.1 keeps it open per Story 2.2's authoring scope.)
  - [x] 1.7 Create `src/schemas/verifier-result.ts`. Declare `VerifierResultV1Schema` per architecture §P5 lines 901–914. Fields: `schemaVersion: z.literal(1)`, `status: z.enum(["pass", "fail", "skip"])`, `checks: z.array(z.object({ name: z.string(), status: z.enum(["pass", "fail", "skip"]), detail: z.string() }))`, `promotedTo: z.string().nullable()`. Export `VerifierResultV1`, `VerifierResult = VerifierResultV1`, `VerifierResultLatestSchema = VerifierResultV1Schema`.
  - [x] 1.8 Create `src/schemas/pid.ts`. Declare `PidFileV1Schema` per architecture §D4 line 378. The architecture's prescribed shape is `{ pid: number, hostname: string, acquiredAt: string, heartbeatInterval: 5 }` (seconds). Story 1.4's actual implementation uses `heartbeatIntervalMs: number` (milliseconds). To preserve the existing on-disk format from Story 1.4 without breaking the lock module's writer, the V1 schema MUST accept the `heartbeatIntervalMs` field name (Story 1.4's actual write shape). Schema:
    ```typescript
    import { z } from "zod";

    export const PidFileV1Schema = z.object({
      schemaVersion: z.literal(1).optional().default(1),
      pid: z.number(),
      hostname: z.string(),
      acquiredAt: z.string(),
      heartbeatIntervalMs: z.number(),
    });

    export type PidFileV1 = z.infer<typeof PidFileV1Schema>;
    export type PidFile = PidFileV1;
    export const PidFileLatestSchema = PidFileV1Schema;
    ```
    Note: the current pid file written by `src/lock/lock.ts` does NOT include `schemaVersion`. The schema's `schemaVersion: z.literal(1).optional().default(1)` accepts both shapes (legacy: no field; future: with field) — Zod's `.default(1)` populates the value when absent. This **does not** require any edit to `src/lock/lock.ts` in this story; Story 1.4's lock writer remains byte-identical. The pid file's optional version + default is the **forward-compatibility contract** between Story 1.4 (writer) and this story (reader). Story 1.5 introduces no consumer of `PidFileV1Schema` — Story 1.12 (`/bmad-next --doctor`) will be the first reader. Document this carefully in the file's JSDoc.
  - [x] 1.9 Add a JSDoc header to every schema file matching the style of `src/io/log.ts` / `src/io/paths.ts`: file purpose, FR/NFR/AR coverage, foundational-module declaration, public API summary. Example for `state.ts`: `/** state.ts — Zod schema for state.yaml v1 (FR6, FR7, NFR-M3, AR20, AR41). Foundational module: zero upward imports. Public surface: StateV1Schema, StateV1, State (alias), StateLatestSchema (alias). */`. The type-alias chain `<Family>V1` → `<Family>` (the application alias) → `<Family>LatestSchema` (the schema alias) MUST be documented and consistent across all seven files.

- [x] **Task 2 — Add colocated unit tests for every schema (AC: 1)**
  - [x] 2.1 Create `src/schemas/state.test.ts` colocated next to `state.ts`. Use Bun-test imports: `import { describe, expect, it } from "bun:test";`. Minimum coverage:
    - **Positive parse:** a canonical fixture object with all required fields populated parses successfully via `StateV1Schema.parse(...)`. Returned shape `===` the typed `State`.
    - **Missing required field:** an object missing `schemaVersion` fails with `ZodError`.
    - **Wrong field type:** `schemaVersion: 2` fails (it's `z.literal(1)`).
    - **Wrong field type (deep):** `project.bmadVersion: 6` (number, not string) fails.
    - **Optional fields can be undefined:** `{ schemaVersion: 1, project: { name: "...", bmadVersion: "..." } }` (no `lastSuccessfulStep`, no `lastAttempted`, etc.) parses successfully (defaults applied to `checkpoints` and `runHistory`).
    - **Boundary:** `checkpoints: new Array(50).fill({})` parses; `checkpoints: new Array(51).fill({})` fails.
  - [x] 2.2 Create `src/schemas/config.test.ts`. Coverage: positive parse (canonical fixture from architecture §P3), missing required field (`schemaVersion`), wrong field type (`telemetry.enabled: "true"` string fails — must be boolean), defaults (`failurePolicies: {}`, `models: {}` etc. when omitted).
  - [x] 2.3 Create `src/schemas/run-log.test.ts`. Coverage: positive parse (canonical fixture from architecture §P3 line 794), missing required (`runId`), wrong type (`durationMs: "100"` fails), `errors: []` default applied.
  - [x] 2.4 Create `src/schemas/telemetry.test.ts`. Coverage: positive parse (closed-set canonical fixture from architecture §AR27), missing required (`durationMs`), wrong type (`retries: "0"` fails), **extra field rejection (NFR-S3 enforcement):** `{ ...canonical, projectName: "secret" }` fails with ZodError because the schema is `.strict()`. This is the AC-mandated anti-PII gate for telemetry.
  - [x] 2.5 Create `src/schemas/dispatch-spec.test.ts`. Coverage: positive parse (canonical fixture from architecture §P5 line 868), missing required (`runId`), wrong type (`epic: "3"` fails — must be number).
  - [x] 2.6 Create `src/schemas/verifier-result.test.ts`. Coverage: positive parse (canonical fixture from architecture §P5 line 904), missing required (`status`), `status` enum exhaustive (`"unknown"` fails — only `"pass"|"fail"|"skip"`).
  - [x] 2.7 Create `src/schemas/pid.test.ts`. Coverage: positive parse with the Story 1.4 actual shape `{ pid: 1234, hostname: "host", acquiredAt: "2026-04-30T12:00:00.000Z", heartbeatIntervalMs: 5000 }` (no `schemaVersion`); the schema's `.default(1)` populates `schemaVersion`. Missing required (`pid` absent → fails). Wrong type (`pid: "1234"` string → fails). Both "with `schemaVersion: 1`" and "without `schemaVersion`" parse (default behaviour).
  - [x] 2.8 No `console.*` calls anywhere. Use `expect(...)` for assertions.

- [x] **Task 3 — Implement `loadAndMigrate(raw, registry)` in `src/migrations/load-and-migrate.ts` (AC: 1, 2, 3)**
  - [x] 3.1 Create the directory `src/migrations/` (the project's second new directory in this story). Per AR41, `migrations/` is **mid-tier** (depends on foundational `schemas/`); per architecture line 735, one file per migration plus an `index.ts` registry per family. The cross-cutting `loadAndMigrate` lives at the directory root (not under any family folder) since it's a generic operator.
  - [x] 3.2 Create `src/migrations/load-and-migrate.ts`. Module-level constants and types:
    ```typescript
    import { z, type ZodType } from "zod";
    import {
      CorruptStateError,
      MigrationFailureError,
      StateTooNewError,
    } from "../errors.ts";

    export type Migration<From, To> = (data: From) => To;

    export interface MigrationRegistry<Latest> {
      readonly current: number;
      readonly versions: Record<number, ZodType>;
      readonly migrations: Record<number, Migration<unknown, unknown>>;
      readonly familyName: string;
    }
    ```
    The `familyName` field is added beyond architecture §D8 line 522 to power error messages (so `STATE_TOO_NEW` includes "for schema family `state`"). The architecture's example (line 528) is `loadAndMigrate<L>(raw: unknown, registry: MigrationRegistry<L>): Result<L, MigrationError>` — but per AR33 (P4 line 857: errors are thrown, not returned) we throw `StepperError` subclasses instead of returning a `Result` discriminant. The signature becomes `function loadAndMigrate<L>(raw: unknown, registry: MigrationRegistry<L>): L` (synchronous; throws `CorruptStateError | StateTooNewError | MigrationFailureError`).
  - [x] 3.3 Algorithm step 1 — **Read `schemaVersion` (default 1 if absent).** The `raw` parameter is `unknown` (the result of `JSON.parse` or `Bun.YAML.parse`). Defensive narrowing:
    ```typescript
    if (raw === null || typeof raw !== "object") {
      throw new CorruptStateError(
        `${registry.familyName}: raw input is not an object`,
        JSON.stringify(raw)
      );
    }
    const obj = raw as Record<string, unknown>;
    let version = typeof obj.schemaVersion === "number" ? obj.schemaVersion : 1;
    ```
    Per AC-1 wording, "default 1 if absent" → if `schemaVersion` is missing from the top-level object, treat as version 1. If present but not a number, treat as `CorruptStateError`.
  - [x] 3.4 Algorithm step 2 — **`schemaVersion > current` → `STATE_TOO_NEW`.** Throw the registered error with the AC-2 verbatim hint embedded:
    ```typescript
    if (version > registry.current) {
      throw new StateTooNewError(
        `${registry.familyName}: schemaVersion ${version} > current ${registry.current}`,
        `Detected schemaVersion: ${version}; this Stepper supports up to ${registry.current}.`
      );
    }
    ```
    The constructor's first arg is `Error.message` (logged via the run-log writer), the second is `detail` (multi-line). The class's `actionableHint` field (set in `src/errors.ts`) provides the user-facing one-line hint per AC-2. **Do NOT override `actionableHint` here** — the registry CI gate (`errors.test.ts`) asserts the registered hint, and a constructor-level override would bypass that.
  - [x] 3.5 Algorithm step 3 — **Iterate `versions[v]` validate → `migrations[v]` apply → increment.** Loop while `version < registry.current`:
    ```typescript
    let working: unknown = raw;
    while (version < registry.current) {
      const validator = registry.versions[version];
      if (!validator) {
        throw new CorruptStateError(
          `${registry.familyName}: no validator for version ${version}`,
          `Registry only registers versions: ${Object.keys(registry.versions).join(", ")}`
        );
      }
      const validation = validator.safeParse(working);
      if (!validation.success) {
        throw new CorruptStateError(
          `${registry.familyName}: validation failed at version ${version}`,
          validation.error.message
        );
      }
      const migration = registry.migrations[version];
      if (!migration) {
        throw new MigrationFailureError(
          `${registry.familyName}: no migration registered for ${version} → ${version + 1}`,
          `Registry migrations cover: ${Object.keys(registry.migrations).join(", ")}`
        );
      }
      try {
        working = migration(validation.data);
      } catch (err) {
        throw new MigrationFailureError(
          `${registry.familyName}: migration ${version} → ${version + 1} threw`,
          err instanceof Error ? err.message : String(err)
        );
      }
      version += 1;
    }
    ```
    Per architecture §D8 line 533: "While version < current: validate against versions[v], apply migrations[v], increment".
  - [x] 3.6 Algorithm step 4 — **Final validate against `versions[current]`.** After the loop:
    ```typescript
    const finalValidator = registry.versions[registry.current];
    if (!finalValidator) {
      throw new CorruptStateError(
        `${registry.familyName}: no validator for current version ${registry.current}`,
        "Registry shape is broken; this is a project bug."
      );
    }
    const finalValidation = finalValidator.safeParse(working);
    if (!finalValidation.success) {
      throw new CorruptStateError(
        `${registry.familyName}: final validation failed at version ${registry.current}`,
        finalValidation.error.message
      );
    }
    return finalValidation.data as L;
    ```
    The final validation is the architecture-mandated belt-and-suspenders check (line 535: "Final validate against versions[current]; return typed L"). **It catches migration bugs that produce invalid output.**
  - [x] 3.7 JSDoc header: cite FR6/FR7/NFR-R6/AR20. Document the three thrown error types and the corresponding scenarios. Document that the function is synchronous (does not perform IO; the caller passes already-parsed `raw`).

- [x] **Task 4 — Create migration registries for all four versioned schema families (AC: 1, 4)**
  - [x] 4.1 Create `src/migrations/state/index.ts`. Imports the V1 schema from `../../schemas/state.ts`; exports a `stateMigrationRegistry: MigrationRegistry<State>` constant:
    ```typescript
    import { StateV1Schema, type State } from "../../schemas/state.ts";
    import type { MigrationRegistry } from "../load-and-migrate.ts";

    export const stateMigrationRegistry: MigrationRegistry<State> = {
      familyName: "state",
      current: 1,
      versions: {
        1: StateV1Schema,
      },
      migrations: {},
    } as const;
    ```
    The `migrations` record is **intentionally empty** — there's only one version (1) so no `n→n+1` migration exists yet. When v2 is introduced (a future story), the dev will add `1: (data) => migratedData` and bump `current` to 2.
  - [x] 4.2 Create `src/migrations/config/index.ts`. Same pattern: imports `ConfigV1Schema`; exports `configMigrationRegistry: MigrationRegistry<Config>` with `familyName: "config"`, `current: 1`, `versions: { 1: ConfigV1Schema }`, `migrations: {}`.
  - [x] 4.3 Create `src/migrations/run-log/index.ts`. Same pattern with `RunLogV1Schema` and `familyName: "run-log"`.
  - [x] 4.4 Create `src/migrations/telemetry/index.ts`. Same pattern with `TelemetryRecordV1Schema` and `familyName: "telemetry"`. (Telemetry uses the closed-set strict schema from Task 1.5 — the registry is type-compatible with strict schemas; Zod's `ZodObject<...>.strict()` is still a `ZodType`.)
  - [x] 4.5 Do NOT create `src/migrations/state/1-to-2.ts` (architecture line 1147 shows it as a placeholder). Placeholders without bodies are anti-patterns. The first migration will be authored when v2 of any schema is needed (a future story; out of scope here). The registry pattern is the deliverable.
  - [x] 4.6 The four registry files (state, config, run-log, telemetry) MUST conform to the import-graph constraint: `migrations/<family>/index.ts` MAY import from `../../schemas/<family>.ts` (foundational sibling) and from `../load-and-migrate.ts` (sibling within `migrations/`). Forbidden: any import from `state/`, `dag/`, `commands/`, `dispatch/`, etc. (mid-tier modules MUST NOT import top-level or higher-tier modules).

- [x] **Task 5 — Implement the idempotency CI gate `src/migrations/migration.test.ts` (AC: 4)**
  - [x] 5.1 Create `src/migrations/migration.test.ts`. This is the **NFR-R6 release-blocker integration test** (architecture line 1407). It enumerates every `(fromVersion, toVersion)` migration path per schema family and asserts idempotency: running migration `n→n+1` on already-`n+1`-shaped data is a no-op (the migrated output, when re-validated against `versions[n+1]`, parses unchanged).
  - [x] 5.2 Test structure:
    ```typescript
    import { describe, expect, it } from "bun:test";
    import { stateMigrationRegistry } from "./state/index.ts";
    import { configMigrationRegistry } from "./config/index.ts";
    import { runLogMigrationRegistry } from "./run-log/index.ts";
    import { telemetryMigrationRegistry } from "./telemetry/index.ts";
    import type { MigrationRegistry } from "./load-and-migrate.ts";

    const ALL_REGISTRIES: ReadonlyArray<MigrationRegistry<unknown>> = [
      stateMigrationRegistry,
      configMigrationRegistry,
      runLogMigrationRegistry,
      telemetryMigrationRegistry,
    ];

    describe("migration registry idempotency (NFR-R6)", () => {
      for (const registry of ALL_REGISTRIES) {
        describe(`family ${registry.familyName}`, () => {
          for (const [versionKey, migration] of Object.entries(registry.migrations)) {
            const fromVersion = Number(versionKey);
            const toVersion = fromVersion + 1;
            it(`is idempotent at ${fromVersion} → ${toVersion}`, () => {
              const targetSchema = registry.versions[toVersion];
              expect(targetSchema).toBeDefined();
              // For every fromVersion → toVersion migration, the dev SHOULD
              // also register a fixture in this test file representing a
              // canonical n+1-shaped object. This skeleton story has zero
              // migrations registered, so the inner block is exercised only
              // when a future story adds a v2 schema and a 1-to-2 migration.
              // The idempotency contract (architecture line 539): running
              // migration(n+1-shaped) MUST yield n+1-shaped data identical
              // to the input (no change).
            });
          }

          it("registers at least the current version validator", () => {
            expect(registry.versions[registry.current]).toBeDefined();
          });
        });
      }
    });
    ```
    The harness is **future-proofed**: as soon as a future story adds a v2 schema and a `1 → 2` migration entry to (e.g.) `stateMigrationRegistry`, the corresponding `it("is idempotent at 1 → 2", ...)` block becomes active. This story authors zero migrations, so the inner `it()` count is zero per family; only the "current version validator" sanity check fires per family (4 total).
  - [x] 5.3 Add a separate `describe("loadAndMigrate behavior")` block at the bottom of the same file that exercises the `loadAndMigrate` happy path AND the two error paths (AC-1, AC-2, AC-3). Tests:
    - **AC-1 happy path:** call `loadAndMigrate(canonicalStateFixture, stateMigrationRegistry)`; assert the return value is the canonical fixture (deep-equal modulo defaults).
    - **AC-1 default schemaVersion:** call `loadAndMigrate({ ...canonicalStateFixture, schemaVersion: undefined }, stateMigrationRegistry)`; the function should default to version 1 and parse successfully.
    - **AC-2 schemaVersion > current:** call `loadAndMigrate({ schemaVersion: 99, project: { name: "x", bmadVersion: "y" } }, stateMigrationRegistry)`; assert it throws `StateTooNewError`. Assert `error.code === "STATE_TOO_NEW"`, `error.exitCode === 1`, `error.actionableHint === "Run /bmad-next --upgrade to install a Stepper version that supports this schema."`.
    - **AC-3 corrupt input (not an object):** call `loadAndMigrate("just a string", stateMigrationRegistry)`; assert it throws `CorruptStateError`.
    - **AC-3 corrupt input (validation failure):** call `loadAndMigrate({ schemaVersion: 1 /* missing project */ }, stateMigrationRegistry)`; assert it throws `CorruptStateError`. Assert `error.code === "CORRUPT_STATE"`, `error.exitCode === 1`, `error.actionableHint === "Run /bmad-next --recompute-state to rebuild the cache from project files."` (verbatim per AC-3 — see Task 7 for the registry hint update that this test depends on).
  - [x] 5.4 No real-time waits; the `loadAndMigrate` tests are pure function calls. Total test wall-time: <50ms.
  - [x] 5.5 No `console.*` calls. Biome `noConsole` rule applies.
  - [x] 5.6 Test naming convention: file is `src/migrations/migration.test.ts` (singular `migration` per architecture line 1243 explicitly: "migration.test.ts # all migration paths (NFR-R6)"). Story 1.3 placed `no-write-outside-scope.test.ts` under `src/io/` rather than `src/integration/`; this story follows the same convention and places `migration.test.ts` under `src/migrations/` rather than `src/integration/`. Document the deviation in Completion Notes (it is a continuation of Story 1.3's precedent).

- [x] **Task 6 — Convenience consumer-side migration test fixtures (AC: 4)**
  - [x] 6.1 Within each schema's colocated `<schema>.test.ts` (Task 2), add a top-level `export const canonical<Family>V1Fixture` constant — a minimal-but-valid object that future migration tests can import. This avoids re-authoring the canonical fixture in `migration.test.ts`. Example: `state.test.ts` exports `canonicalStateV1Fixture`. The `migration.test.ts` then imports these fixtures.
  - [x] 6.2 The fixtures MUST be the **simplest** valid object passing the schema (no optional fields populated). For state:
    ```typescript
    export const canonicalStateV1Fixture = {
      schemaVersion: 1 as const,
      project: { name: "bmad-stepper", bmadVersion: "6.5.0.1" },
    } satisfies StateV1;
    ```
    For config: `{ schemaVersion: 1, paths: { state: "...", runs: "...", staging: "...", telemetry: "..." }, telemetry: { enabled: false } }`. For run-log: minimal `runId/step/ts/schemaVersion`. For telemetry: closed-set minimal.
  - [x] 6.3 The fixtures live in the test files (not separate fixture files) to keep AR35 tmpdir-isolation orthogonal — fixtures are pure data, no IO.

- [x] **Task 7 — Update `CorruptStateError.actionableHint` per AC-3 verbatim AND add `ScopeViolationError` (Story 1.3 S1 carry-over) to the registry (AC: 3)**
  - [x] 7.1 The story AC-3 requires the verbatim hint string for `CorruptStateError`: `"Run /bmad-next --recompute-state to rebuild the cache from project files."`. The current value (`src/errors.ts:122-123`) is `"Run /bmad-next --doctor to inspect _bmad-output/.stepper/state.yaml; restore from .bak if needed."` — this does **NOT** match AC-3.
  - [x] 7.2 Edit `src/errors.ts` to update **only** the `CorruptStateError.actionableHint` string to the AC-3 verbatim text. Preserve the class name (`CorruptStateError`), the code (`"CORRUPT_STATE"`), the exitCode (`1`), and the `override readonly` modifiers exactly. The new hint passes the AR22 actionable-hint regex `/^.*(Run|See|Try|Check) /` because it starts with "Run". Registry count and existing `errors.test.ts` regex assertions remain valid.
  - [x] 7.3 **Story 1.3 S1 carry-over (BLOCKING — Story 1.5 is the natural place to address it).** Story 1.3's senior dev review S1 finding documented that `assertWithinScope` currently routes scope violations through `PathologicalInputError` with a message-prefix `SCOPE_VIOLATION:` — the registered `actionableHint` is the generic input-shape hint, not scope-specific. Story 1.3 explicitly anticipated Story 1.5 as the place to add a dedicated `ScopeViolationError` class. Add the new class:
    - Add `"SCOPE_VIOLATION"` to the `StepperErrorCode` union (currently 15 codes; this becomes the 16th).
    - Add the concrete class:
      ```typescript
      export class ScopeViolationError extends StepperError {
        override readonly code = "SCOPE_VIOLATION" as const;
        override readonly exitCode = 5 as const;
        override readonly actionableHint =
          "Check that the target path is inside _bmad-output/, _bmad-output/.stepper/, or the test tmpdir; see src/io/paths.ts assertWithinScope() for the allowed roots.";
      }
      ```
      This matches Story 1.3 Task 4.1's verbatim text and the Story 1.3 review S1 follow-up's prescribed hint. Exit code `5` is the pathological-input bucket (the caller passed an out-of-scope path, which is a programming/input error per architecture §D11 line 600).
    - Add `ScopeViolationError` to the `errorRegistry` constant (alphabetical after `PathologicalInputError`? — actually the existing registry is in registration order, not alphabetical; append `ScopeViolationError` at the end before `MigrationFailureError`, or to keep semantic grouping, place it between `PathologicalInputError` and `BudgetExceededError`. Pick one; document the choice).
  - [x] 7.4 Update `src/errors.test.ts` registry-count assertion: change `toHaveLength(15)` to `toHaveLength(16)`. Update the `REQUIRED_CODES` list (or equivalent enum check) to include `"SCOPE_VIOLATION"`. Confirm hint regex `/^.*(Run|See|Try|Check) /` is satisfied by both updated hints (`CorruptStateError` starts with "Run"; `ScopeViolationError` starts with "Check").
  - [x] 7.5 **Do NOT** edit `src/io/paths.ts` to throw `ScopeViolationError` instead of `PathologicalInputError` in this story. That edit is forward work (Story 1.6 onwards) — the AR42 boundary already passes, and changing the throw site is a behaviour change that touches the `no-write-outside-scope.test.ts` integration test. This story adds the registry entry; downstream stories migrate the throw sites incrementally to keep diffs reviewable.
  - [x] 7.6 Run `bun test src/errors.test.ts` after the edits to confirm all assertions still pass with the new 16-entry count.

- [x] **Task 8 — Verify `bun run check` exits 0 (AC: 1, 2, 3, 4)**
  - [x] 8.1 Run `bunx biome check . --write` to auto-fix formatting on the new files (likely Biome will reorganise imports alphabetically in each schema/migration file). Then run `bunx biome ci .` to confirm exit 0.
  - [x] 8.2 Run `bun test` (full suite); confirm all green. Expected files after this story: 10 from Story 1.4 baseline (`src/errors.test.ts`, the 4 `src/io/*.test.ts` files including `no-write-outside-scope.test.ts`, the 5 `src/lock/**/*.test.ts` files), plus this story's additions: 7 schema test files (`src/schemas/state.test.ts`, ..., `src/schemas/pid.test.ts`) plus `src/migrations/migration.test.ts`. Total: 18 test files. Test count: ~85 baseline + ~50 new (~7 per schema test × 7 + ~10 in `migration.test.ts`) = ~135 total `it(...)` blocks.
  - [x] 8.3 Run each new test file standalone via `bun test src/schemas/state.test.ts`, etc.; assert exit 0 each.
  - [x] 8.4 Run `bun run check` (the composite release-blocker gate) and confirm exit 0.
  - [x] 8.5 Run `bunx tsc --noEmit` (defensive) and confirm exit 0. **Critical:** the `migration.test.ts` and `load-and-migrate.ts` use a non-trivial generic (`MigrationRegistry<L>` with `ZodType` records); verify TypeScript's structural typing accepts the four registry constants when iterated as `MigrationRegistry<unknown>`.
  - [x] 8.6 Wall-time budget: all schema tests are pure function calls; total `bun test` should complete under 1 second (probably ~400-600ms total wall-time).

- [x] **Task 9 — Final story-level sanity check (AC: 1, 2, 3, 4)**
  - [x] 9.1 Confirm the file count: exactly **15 new files** under `src/schemas/` and `src/migrations/`. Schemas: `state.ts`, `state.test.ts`, `config.ts`, `config.test.ts`, `run-log.ts`, `run-log.test.ts`, `telemetry.ts`, `telemetry.test.ts`, `dispatch-spec.ts`, `dispatch-spec.test.ts`, `verifier-result.ts`, `verifier-result.test.ts`, `pid.ts`, `pid.test.ts` (14 files). Migrations: `load-and-migrate.ts`, `state/index.ts`, `config/index.ts`, `run-log/index.ts`, `telemetry/index.ts`, `migration.test.ts` (6 files). Total: 20 files (corrected). Plus **one modified file**: `src/errors.ts` (CorruptStateError hint update + ScopeViolationError addition) and **one modified test**: `src/errors.test.ts` (registry-count assertion 15→16; new code in REQUIRED list).
  - [x] 9.2 Confirm no edits to: `package.json` (Zod 4.4.1 already pinned), `tsconfig.json`, `biome.json`, `bunfig.toml`, `.github/workflows/ci.yml`, `.claude-plugin/plugin.json`, `commands/bmad-next.md`, `bun.lock`, `src/io/log.ts`, `src/io/paths.ts`, `src/io/atomic-write.ts`, `src/io/log.test.ts`, `src/io/paths.test.ts`, `src/io/atomic-write.test.ts`, `src/io/no-write-outside-scope.test.ts`, `src/lock/lock.ts`, `src/lock/lock.test.ts`, `src/lock/integration/*.test.ts`. This story is source-only (schemas + migrations + tests) plus the verbatim-hint edit to `src/errors.ts` and the count-bump in `src/errors.test.ts`.
  - [x] 9.3 Confirm no edits to anything under `_bmad-output/.stepper/` (the AR42 persistence boundary — directory does not exist yet anyway).
  - [x] 9.4 Confirm `src/schemas/*.ts` files import only from `zod` (the runtime dep) and have ZERO upward imports. Confirm `src/migrations/*.ts` files import only from `zod`, `../../schemas/*.ts`, `../../errors.ts`, and (for `*/index.ts`) `../load-and-migrate.ts`.
  - [x] 9.5 Update this story file's Status to `review` upon completion (the dev-story workflow handles this — bmad-create-story leaves it `ready-for-dev`).

## Dev Notes

### Architecture Compliance — What the Dev Agent MUST Follow

This story implements **AR20 schema migrations** verbatim (per-schema migration registry; idempotent contract; `STATE_TOO_NEW` error on schemaVersion > current; `CORRUPT_STATE` on validation failure; schemas: state, config, run-log, telemetry — see architecture line 197) and operationalises **FR6** (versioned schema validation with actionable errors), **FR7** (auto-apply schema migrations on load), **NFR-R6** (idempotent migrations on `state.yaml`), and **NFR-M3** (all public-facing schemas validated by Zod with versioned migrations).

#### Architecture §D8 — In-band schema migration runner (verbatim, full)

> Per persisted-schema migration registry, applied on load.
>
> Schema-versioned files: `state.yaml`, `bmad-stepper.config.yaml`, `runs/<ts>-<step>.json`, `telemetry/<period>.jsonl`. Each top-level object carries `schemaVersion: <n>`.
>
> Migration registry shape (per schema family):
>
> ```typescript
> type Migration<From, To> = (data: From) => To;
> type MigrationRegistry<Latest> = {
>   current: number;
>   versions: Record<number, ZodSchema>;
>   migrations: Record<number, Migration<unknown, unknown>>;
> };
> function loadAndMigrate<L>(
>   raw: unknown,
>   registry: MigrationRegistry<L>
> ): Result<L, MigrationError> {
>   // 1. Read raw.schemaVersion (default 1 if absent on first-version files)
>   // 2. While version < current: validate against versions[v], apply migrations[v], increment
>   // 3. Final validate against versions[current]; return typed L
>   // 4. On failure surface CORRUPT_STATE (exit 1) with actionable hint
> }
> ```
>
> Idempotency contract: running migration `n → n+1` on already-`n+1`-shaped data is a no-op (validated by passing the migrated data through `versions[n+1]` and confirming it parses unchanged). CI test enumerates every `(fromVersion, toVersion)` path and asserts idempotency.
>
> Old-Stepper-on-new-state behavior: loading `state.yaml` with `schemaVersion > current` produces `STATE_TOO_NEW` (exit 1) with hint `Run /bmad-next --upgrade to install a Stepper version that supports this schema.` No silent corruption.

The dev agent's `loadAndMigrate` MUST implement the four-step algorithm exactly. The architecture's `Result<L, MigrationError>` return type is **NOT** used (per AR33 P4 line 857 — errors are thrown, not returned, except in the CLI parser which is out-of-scope for this story). The function returns `L` directly and throws `CorruptStateError | StateTooNewError | MigrationFailureError`.

#### AR41 — Module boundary graph (verbatim, partial — applied to this story)

> Foundational (no upward imports): `errors.ts`, `schemas/`, `io/`. Mid-level: `migrations/`, `state/`, `bmad-detect/`, `personas/`, `dag/`, `transcript/`, `telemetry/`, `upgrade/`. Higher-level: `verifiers/`, `dispatch/`, `failure-ux/`. Top-level: `commands/`. Enforced by Biome import-restriction rule or hand-rolled CI test.

`src/schemas/` joins `errors.ts`, `src/io/`, and `src/lock/` in the foundational tier. **Allowed imports for `src/schemas/*.ts`:**

- `zod` (runtime dep — Zod 4.4.1 pinned in `package.json`).
- `node:*` standard modules (only if needed — none are needed for v0.1; Zod handles all schema work).

**Forbidden imports in `src/schemas/*.ts`:**

- ANY import from `src/`. Schemas are pure-data declarations; they MUST NOT depend on `errors.ts`, `io/`, `lock/`, or any other `src/` module. (Migration registries import schemas; not the other way around.)

`src/migrations/` joins `state/`, `bmad-detect/`, `personas/`, `dag/`, `transcript/`, `telemetry/`, `upgrade/` in the mid-tier. **Allowed imports for `src/migrations/<family>/index.ts`:**

- `../../schemas/<family>.ts` (foundational).
- `../load-and-migrate.ts` (sibling within `src/migrations/`).

**Allowed imports for `src/migrations/load-and-migrate.ts`:**

- `zod` (for `ZodType`).
- `../errors.ts` (foundational).

**Forbidden imports in `src/migrations/*.ts`:**

- `src/state/`, `src/dag/`, `src/commands/`, `src/personas/`, `src/transcript/`, `src/dispatch/`, `src/verifiers/`, `src/failure-ux/`, `src/upgrade/`, `src/bmad-detect/`. These are higher-tier consumers of `migrations/`.

The boundary will be enforced by a Biome import-restriction rule or a hand-rolled CI test in a later story (Epic 6); for now, manual review.

#### AR42 — Persistence boundary

This story does NOT do filesystem IO. The `loadAndMigrate` function takes already-parsed `raw: unknown` (the caller is responsible for `Bun.YAML.parse(text)` or `JSON.parse(text)` before calling). The schema files are pure-data declarations. The persistence boundary is therefore satisfied by **non-action** in this story: no file is read, no file is written, no `assertWithinScope` is called. Story 1.6 (state subsystem) is the first consumer that wires `Bun.file(STATE_PATH).text()` → `Bun.YAML.parse(text)` → `loadAndMigrate(raw, stateMigrationRegistry)` → typed `State` value.

#### AR33 — Function & error semantics (verbatim, applied to this story)

> Throw `StepperError` subclasses (no `Result<T,E>` in general code path). `try/finally` in dispatch loops. Bun-native APIs preferred (`Bun.file`, `Bun.write`, `Bun.YAML.parse`, `Bun.spawn`). No `any`. No `console.log` in runtime — use `src/io/log.ts`.

`loadAndMigrate` throws `StepperError` subclasses (the architecture's `Result<L, MigrationError>` is **NOT** the project pattern; only the CLI parser uses Result, per AR33 line 858). The schema files declare Zod schemas (not Bun-specific). The migration registries are pure data. No `any` types; the `Migration<unknown, unknown>` type uses the architecture's prescribed open-shape signature, with type-narrowing inside individual migration functions. No `console.*` calls — diagnostic output (in tests) routes through `expect(...)` assertions; runtime code throws.

#### Zod 4.4.1 — Why this version and what to expect

Zod 4 is the **only** runtime dependency of bmad-stepper (architecture line 199, line 1321). Pinned to `^4.4.1` in `package.json` (Story 1.1). Zod 4 vs Zod 3 highlights relevant to this story:

- `z.literal(1)` — discriminator literal type. Preferred over `z.number().int().refine(...)` for `schemaVersion`. Zod 4's literal narrows to the exact type (`1`, not `number`).
- `.strict()` — for the closed-set telemetry schema (NFR-S3). Zod 4 supports `.strict()` on `z.object(...)` to reject extra fields.
- `safeParse()` — preferred over `.parse()` for `loadAndMigrate`'s validation steps (we want the `Result`-shaped success/failure return so we can throw the right `StepperError` subclass, not Zod's bare `ZodError`).
- `.default(value)` — populates a value when the field is undefined. Used in the pid file schema for backward-compat with Story 1.4's writer (which doesn't include `schemaVersion`).
- `z.infer<typeof Schema>` — the project-wide pattern for type aliases (architecture line 719: `State = z.infer<typeof StateLatestSchema>`).
- `z.unknown()` — used for open-shape sub-fields where the per-step shape is validated elsewhere (e.g., `verifierResult` in `RunLogV1Schema` — the actual `VerifierResultV1Schema` validates that field independently).

Zod 4's deeper API surface (e.g., `z.discriminatedUnion`) is **not** needed in this story — every schema is single-version, so `schemaVersion: z.literal(1)` is the discriminator. Future stories adding v2 will switch to `z.discriminatedUnion` over `schemaVersion`.

#### Three classes of error in `loadAndMigrate`

The function throws **exactly three** error types per AC-1, AC-2, AC-3:

1. **`StateTooNewError`** (code `"STATE_TOO_NEW"`, exitCode 1, hint per AC-2 verbatim) — `schemaVersion` in the input exceeds `registry.current`. The `actionableHint` directs the user to `--upgrade`.
2. **`CorruptStateError`** (code `"CORRUPT_STATE"`, exitCode 1, hint per AC-3 verbatim) — input is not an object, OR Zod validation fails at any version, OR final validation fails after migrations, OR `schemaVersion` is present but not a number, OR a registered validator is missing. All "the input shape is wrong" cases. The `actionableHint` directs the user to `--recompute-state`.
3. **`MigrationFailureError`** (code `"MIGRATION_FAILURE"`, exitCode 2, registered hint already in `src/errors.ts`) — a registered migration function threw, OR a migration registry is malformed (missing migration for a version that needs it). The `actionableHint` directs the user to `--doctor`. This case is **NOT exercised by AC-1/AC-2/AC-3** but is defensive against project-bug-class registry errors (a future story author adding `versions[2]` but forgetting `migrations[1]`). The integration test (`migration.test.ts`) does **not** need to exercise this path — it's structurally unreachable in v0.1 since no migrations exist; future stories adding v2 schemas will exercise it via their own tests.

#### Schema-version typed aliases (architecture line 719)

> Schema-version typed aliases: `StateV1`, `StateV2` for explicit-version types; `State = z.infer<typeof StateLatestSchema>` as the alias for the current version. The current alias is what application code uses; explicit-version types are reserved for migration code.

Every schema family follows this convention:

- `<Family>V1Schema` — the Zod schema for version 1.
- `<Family>V1` — the inferred TypeScript type (`z.infer<typeof <Family>V1Schema>`).
- `<Family>` — the application-code-facing alias. **In v0.1, `<Family> = <Family>V1`.**
- `<Family>LatestSchema` — the schema alias for the current version. **In v0.1, `<Family>LatestSchema = <Family>V1Schema`.**

When a future story adds v2:

1. Add `<Family>V2Schema`, `<Family>V2 = z.infer<typeof <Family>V2Schema>`.
2. Update `<Family> = <Family>V2` (application code now sees the new shape).
3. Update `<Family>LatestSchema = <Family>V2Schema`.
4. Add `versions: { 1: <Family>V1Schema, 2: <Family>V2Schema }` and `migrations: { 1: (data) => migratedToV2(data) }` to the migration registry; bump `current` to 2.

This story authors zero v2 schemas. The aliases ensure forward-compat with no application-code edits when v2 lands.

#### Persisted-file field naming — `camelCase` (architecture line 726)

> Persisted-file field naming: `camelCase` everywhere — including YAML files. This keeps Zod-inferred TS types 1:1 with persisted shapes and eliminates a casing-translation layer that sub-agents could implement inconsistently.

Every field in every schema is `camelCase`. Examples: `schemaVersion`, `lastSuccessfulStep`, `bmadVersion`, `acquiredAt`, `heartbeatIntervalMs`, `verifierResult`, `tokensIn`, `tokensOut`, `errorCode`. This is the canonical pattern; tests should use `camelCase` keys when authoring fixture data.

### Source Tree — Exact Files to Create or Modify

This story creates exactly **20 new files** under `src/schemas/` and `src/migrations/`, modifies exactly **two existing files** (`src/errors.ts` for the hint update + new ScopeViolationError; `src/errors.test.ts` for the registry-count bump), and creates two new directories.

**Files created (schemas — 14 files):**

```
bmad-stepper/
└── src/
    └── schemas/                    # NEW directory
        ├── state.ts
        ├── state.test.ts
        ├── config.ts
        ├── config.test.ts
        ├── run-log.ts
        ├── run-log.test.ts
        ├── telemetry.ts
        ├── telemetry.test.ts
        ├── dispatch-spec.ts
        ├── dispatch-spec.test.ts
        ├── verifier-result.ts
        ├── verifier-result.test.ts
        ├── pid.ts
        └── pid.test.ts
```

**Files created (migrations — 6 files):**

```
bmad-stepper/
└── src/
    └── migrations/                  # NEW directory
        ├── load-and-migrate.ts
        ├── migration.test.ts
        ├── state/
        │   └── index.ts             # stateMigrationRegistry
        ├── config/
        │   └── index.ts             # configMigrationRegistry
        ├── run-log/
        │   └── index.ts             # runLogMigrationRegistry
        └── telemetry/
            └── index.ts             # telemetryMigrationRegistry
```

**Files modified (2 files):**

- `src/errors.ts` — (a) update `CorruptStateError.actionableHint` to AC-3 verbatim string `"Run /bmad-next --recompute-state to rebuild the cache from project files."`. (b) Add `"SCOPE_VIOLATION"` to the `StepperErrorCode` union; add the `ScopeViolationError` concrete class with hint `"Check that the target path is inside _bmad-output/, _bmad-output/.stepper/, or the test tmpdir; see src/io/paths.ts assertWithinScope() for the allowed roots."`; add `ScopeViolationError` to `errorRegistry`. Class name, code, exitCode follow the existing pattern. Registry count: 15 → 16.
- `src/errors.test.ts` — bump the registry-count assertion from 15 to 16. Add `"SCOPE_VIOLATION"` to the `REQUIRED_CODES` list (or equivalent).

**Files NOT modified (preserved verbatim from Stories 1.1 + 1.2 + 1.3 + 1.4):**

- `package.json` (Zod 4.4.1 already pinned), `tsconfig.json`, `biome.json`, `bunfig.toml`, `bun.lock`.
- `.github/workflows/ci.yml`, `.claude-plugin/plugin.json`, `commands/bmad-next.md`, `.gitignore`, `LICENSE`.
- All Story 1.3 IO files: `src/io/log.ts`, `src/io/paths.ts`, `src/io/atomic-write.ts`, `src/io/no-write-outside-scope.test.ts`, plus their colocated tests.
- All Story 1.4 lock files: `src/lock/lock.ts`, `src/lock/lock.test.ts`, all `src/lock/integration/*.test.ts`.
- All `_bmad/`, `_bmad-output/planning-artifacts/`, `docs/`, `.changeset/` files.

### Testing Requirements

- **`bun test` MUST pass with at least 18 test files** discovered (10 baseline + 7 schema tests + 1 migration test).
- **Each new test file MUST exit 0 standalone:** `bun test src/schemas/state.test.ts`, etc.
- **Total expected `it(...)` count:** ~85 baseline + ~50 new (~7 per schema test × 7 + ~10 in `migration.test.ts`) = ~135 total. The schema tests are mostly Zod parse-and-assert; very fast.
- **Run-time budget:** all schema tests are pure function calls; total wall-time ~400-600ms across all 18 files (no 6s heartbeat as in Story 1.4).
- **`bunx biome ci .`** MUST exit 0 against the new files. Biome 2.3.15's `assist/source/organizeImports` will auto-organize the imports alphabetically with type-only imports last.
- **`bun run check`** MUST exit 0 (composite release-blocker).
- **CI matrix** (`ubuntu-latest`, `macos-latest`) MUST be green on first push. Schemas are purely-typed Zod validators; no platform-specific behaviour.
- **`bunx tsc --noEmit`** exits 0. Verify the generic `MigrationRegistry<L>` type accepts the four registry constants when iterated as `MigrationRegistry<unknown>`. The `safeParse` returning the unioned type is the most likely TS friction point — pay attention if you see `Property 'data' does not exist on type 'SafeParseReturnType<...>'`.

### Test Design — Bun-test specifics

- `import { describe, expect, it } from "bun:test";` — schema tests are simple parse-and-assert.
- No `beforeEach`/`afterEach` needed — schemas are pure data; no IO; no global state.
- `tsconfig.json` flags (no changes since Story 1.4): `strict: true`, `verbatimModuleSyntax: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`. Sibling imports use `from "./state.ts"` etc. with the `.ts` extension.
- Imports of Zod: `import { z, type ZodType } from "zod";` — the `type` modifier on `ZodType` is required by `verbatimModuleSyntax`.
- Cross-file imports of registries from `migration.test.ts`: `import { stateMigrationRegistry } from "./state/index.ts";` — the `.ts` extension is required.
- Cross-package imports of Zod use the npm package name `zod` (no extension; resolved via `node_modules/zod`).
- The `ZodError`-on-parse-failure is exercised via `safeParse(...)` returning `{ success: false, error: ZodError }`. Tests can either: (a) assert `safeParse(...).success === false`; (b) assert `expect(() => Schema.parse(...)).toThrow(ZodError)`. Pattern (a) is more common in the schema tests.

### File Structure Requirements — Final Check

Before declaring this story done, the dev agent MUST verify ALL of these checks pass:

1. **`src/schemas/`** directory exists with seven `<family>.ts` files and seven `<family>.test.ts` files.
2. **`src/migrations/`** directory exists with `load-and-migrate.ts`, `migration.test.ts`, and four sub-directories (`state/`, `config/`, `run-log/`, `telemetry/`) each with `index.ts`.
3. **`src/schemas/*.ts`** import only `zod`. Zero upward imports.
4. **`src/migrations/load-and-migrate.ts`** imports only `zod` and `../errors.ts`. Zero upward imports.
5. **`src/migrations/<family>/index.ts`** imports only `../../schemas/<family>.ts` and (type-only) `../load-and-migrate.ts`.
6. **`src/migrations/migration.test.ts`** imports the four registries and exercises the idempotency-enumeration loop + `loadAndMigrate` happy path + AC-1/AC-2/AC-3 error paths.
7. **`src/errors.ts`** updated: `CorruptStateError.actionableHint` matches AC-3 verbatim; new `ScopeViolationError` class added; registry count = 16.
8. **`src/errors.test.ts`** registry-count assertion = 16; `REQUIRED_CODES` includes `"SCOPE_VIOLATION"`.
9. **`bun test`** exits 0 with all 18 test files reported as run.
10. **`bunx biome ci .`** exits 0 against the new files.
11. **`bun run check`** exits 0.
12. **No imports outside foundational/mid-tier scope** in any new file (AR41).
13. **`package.json`, `tsconfig.json`, `biome.json`, `bunfig.toml`, `.github/workflows/ci.yml`, `.claude-plugin/plugin.json`, `commands/bmad-next.md`, `bun.lock`** are byte-identical to their Story 1.4 state.
14. **No edits to `_bmad-output/.stepper/`** (the persistence boundary AR42 — directory does not exist yet anyway).
15. **Status flipped to `review`** upon dev-story completion.

### Code Quality Enforcement (AR36)

- **Biome 2.3.15 only.** No ESLint, no Prettier. The `biome.json` from Story 1.1 is canonical.
- **`noConsole: "error"`** — blocks all `console.*` calls. Use `expect(...)` in tests; throw `StepperError` subclasses in runtime code.
- **`noImplicitAnyLet: "error"`** — every `let` declaration must have an explicit type. Prefer `const`. `loadAndMigrate` uses `let version: number` and `let working: unknown` — both explicit.
- **`noUnusedVariables: "error"`** — every imported symbol must be used. Don't import `z` if you only use `type ZodType`.
- **Import organisation:** Biome 2.3.15's `assist/source/organizeImports` rule expects alphabetical imports with type-only imports last. Sort: `zod`, then `../../errors.ts`, then sibling `./` imports. Type-only imports (e.g., `import type { State } from "../schemas/state.ts";`) come after value imports.

### Naming Conventions (AR31, applied to Source TS)

- **Filenames:** `kebab-case.ts` — `state.ts`, `state.test.ts`, `run-log.ts`, `dispatch-spec.ts`, `verifier-result.ts`, `load-and-migrate.ts`, `migration.test.ts`.
- **Function names:** `camelCase` — `loadAndMigrate`.
- **Type/interface names:** `PascalCase` — `StateV1`, `Config`, `RunLog`, `TelemetryRecord`, `DispatchSpec`, `VerifierResult`, `PidFile`, `MigrationRegistry`, `Migration`, `ScopeViolationError`.
- **Constants:** `SCREAMING_SNAKE_CASE` for top-level immutables. The Zod schemas are conventionally named `<Family>V1Schema` / `<Family>LatestSchema` (PascalCase ending in `Schema`); these are values (not types) but follow the schema-naming convention rather than `SCREAMING_SNAKE_CASE` since they're parsers, not constants.
- **Test names:** descriptive lower-case strings inside `it(...)` calls — `it("parses the canonical state v1 fixture")`, `it("rejects schemaVersion 2")`, `it("is idempotent at 1 → 2")`.

### Module Boundary Graph (AR41) — Fourth Enforcement Point

Stories 1.2, 1.3, and 1.4 were the first three enforcement points. This story is the fourth — `src/schemas/` joins `errors.ts`, `src/io/`, and `src/lock/` in the foundational tier; `src/migrations/` becomes the first mid-tier module.

Per AR41:

- **Foundational (no upward imports):** `errors.ts`, `schemas/`, `io/`, plus the deviation-introduced `lock/`. After this story: 4 foundational subtrees (counting the `lock/` deviation).
- **Mid-tier:** `migrations/`, `state/` (Story 1.6), `bmad-detect/` (Story 1.9), `personas/` (Story 1.11), `dag/` (Story 1.10), `transcript/`, `telemetry/`, `upgrade/`. After this story: 1 mid-tier module exists (`migrations/`).
- **Higher-tier:** `verifiers/`, `dispatch/`, `failure-ux/`. None exist yet.
- **Top-tier:** `commands/`. None exist yet (placeholder `commands/bmad-next.md` is a slash-command markdown, not a `src/commands/` TS module).

The boundary will be enforced by a Biome import-restriction rule or a hand-rolled CI test in a later story (Epic 6); for now, manual review.

### Persistence Boundary (AR42)

This story does NOT do filesystem IO. The schema files declare Zod schemas; the migration registries are pure data; `loadAndMigrate` takes already-parsed `raw: unknown`. No file is read, no file is written, no `assertWithinScope` is called. AR42 is satisfied trivially.

### Documentation Within This Story

This story does NOT ship `docs/schemas.md`, `docs/migrations.md`, `docs/exit-codes.md`, or any other narrative documentation. Story 1.13 (Quick-Start Documentation) owns the public-facing docs; the JSDoc comments in `src/schemas/*.ts` and `src/migrations/*.ts` are the single source of truth for the schema semantics in v0.1. Each schema file's JSDoc MUST cite the FR/NFR/AR coverage and reference the architecture line numbers that establish the canonical shape.

### Previous Story Intelligence

This story is downstream of Stories 1.1, 1.2, 1.3, 1.4 (all `done` per `sprint-status.yaml`). Distilled cross-story learnings:

#### Project Structure (cumulative state at start of this story)

- `src/` exists with: `errors.ts`, `errors.test.ts`, `io/{log.ts, paths.ts, atomic-write.ts, log.test.ts, paths.test.ts, atomic-write.test.ts, no-write-outside-scope.test.ts}`, `lock/{lock.ts, lock.test.ts, integration/{concurrent-acquire.test.ts, stale-lock-recovery.test.ts, heartbeat-loss.test.ts, sub-second-mtime.test.ts}}`. After this story: + `schemas/<7 schemas + 7 tests>` and + `migrations/<load-and-migrate.ts, migration.test.ts, state/index.ts, config/index.ts, run-log/index.ts, telemetry/index.ts>`.
- `_bmad-output/.stepper/` does NOT exist (per AR42; lock tests use tmpdir; no canonical state file is written until Story 1.6).
- `src/integration/` does NOT exist (Story 1.3 deviation: `no-write-outside-scope.test.ts` lives at `src/io/`; Story 1.4 deviation: integration tests live at `src/lock/integration/` per orchestrator pin). This story follows the same pattern: `src/migrations/migration.test.ts` lives within `src/migrations/`, NOT `src/integration/`.
- The error registry has 15 entries before this story; after Task 7's `ScopeViolationError` addition, the registry has 16 entries.

#### IO + Lock Primitives Available (Stories 1.3 + 1.4 outputs)

- **`info`/`warn`/`error`/`json`** from `src/io/log.ts` — diagnostic output. NOT used by schemas (pure data); MAY be used by `loadAndMigrate` for debug-level migration trace if the dev agent thinks it useful. v0.1 of `loadAndMigrate` does NOT log; throwing the right `StepperError` subclass is sufficient.
- **`atomicWrite`** from `src/io/atomic-write.ts` — NOT used by this story (no writes).
- **`assertWithinScope`** from `src/io/paths.ts` — NOT used by this story (no IO).
- **`acquire`/`forceUnlock`/`LockHandle`** from `src/lock/lock.ts` — NOT used by this story (no state mutations; no read-modify-write cycles).
- **Project paths constants** (`STEPPER_INTERNAL_ROOT`, `BMAD_OUTPUT_ROOT`) from `src/io/paths.ts` — NOT used by this story.

#### Bun-test conventions (cumulative)

- `import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";` — superset of imports. This story uses just `describe, expect, it`.
- Unique tmpdir pattern from Stories 1.3 + 1.4 — NOT used by this story (no IO).
- `tsconfig.json`'s `noUncheckedIndexedAccess: true` — array indexing returns `T | undefined`. In `migration.test.ts`'s iteration over registry entries, `Object.entries(registry.migrations)` returns `[string, Migration<unknown,unknown>][]` — the inner index access is safe (Object.entries preserves the value type).
- `tsconfig.json`'s `verbatimModuleSyntax: true` — type-only imports MUST use `import type` (e.g., `import type { State } from "../schemas/state.ts";`).
- `tsconfig.json`'s `allowImportingTsExtensions: true` — sibling imports use the `.ts` extension.

#### Biome 2.3.15 rules (cumulative — affirmed by Stories 1.1, 1.2, 1.3, 1.4)

- `suspicious.noConsole: "error"` (renamed from `noConsoleLog` between 2.3.0 and 2.3.15). Story 1.5 also operates under the new name.
- `style.noImplicitAnyLet: "error"` (moved from `style.` to `suspicious.` namespace in 2.3.15). Always declare explicit types on `let` (or use `const`).
- The `assist/source/organizeImports` rule auto-sorts imports alphabetically with type-only last. Run `bunx biome check . --write` before committing.
- Story 1.5 does NOT need to touch `biome.json`.

#### Naming + File Layout (cumulative — applied to schemas/migrations)

- Filenames: `kebab-case.ts`. Test file: `<source>.test.ts` colocated.
- TS classes: `PascalCase` ending in `Error` for error classes (`ScopeViolationError`).
- TS variables/functions: `camelCase` (`loadAndMigrate`).
- Constants: `SCREAMING_SNAKE_CASE` for top-level immutables.
- Zod schemas: `PascalCase` ending in `Schema` (`StateV1Schema`).
- Type aliases: `PascalCase` (`StateV1`, `State`).
- Registry constants: `camelCase` ending in `Registry` (`stateMigrationRegistry`).
- ESM exclusively (`package.json` has `"type": "module"`). No CommonJS.

#### Forbidden Actions (cumulative — still apply)

- **Do NOT add `tsc`-based build steps.** Bun runs `.ts` source directly; `tsconfig.json` has `noEmit: true`.
- **Do NOT add `dist/`, `build/`, or any output directory.**
- **Do NOT add `commander`, `oclif`, `yargs`, `jest`, `vitest`, `mocha`.**
- **Do NOT add `proper-lockfile`, `lockfile`, or any third-party lock library.**
- **Do NOT add `package-lock.json` or `yarn.lock`.** Only `bun.lock` (text).
- **Do NOT add ESLint or Prettier.** Biome 2.3.15 is the only linter/formatter (AR36).
- **Do NOT touch `_bmad/` or `_bmad-output/planning-artifacts/`.**
- **Do NOT publish, tag, or push a release.** Version stays at `0.0.0` until Epic 6.
- **Do NOT add native Windows support.** Linux + macOS only in v0.1.
- **Do NOT add a Biome `overrides` block** to whitelist any file.
- **Do NOT bump or modify `bun.lock`.** No new dependencies are required (Zod 4.4.1 already pinned in Story 1.1).

#### Story 1.4 Senior Developer Review — outcome (relevant to this story)

Story 1.4's review outcome was `approve` with two accepted deviations:

- **D1 — Lock placed at `src/lock/` instead of `src/io/lock.ts`** (orchestrator HARD pin). Story 1.5 follows the same pattern: `src/schemas/` and `src/migrations/` are the canonical placements per architecture lines 1134, 1144 — the orchestrator's mutation scope for this story (the four allowed paths) does NOT introduce any new placement deviation; both `src/schemas/` and `src/migrations/` are the architecture-prescribed locations.
- **D2 — `forceUnlock` tests consolidated into `lock.test.ts`** (file-count economy). Story 1.5 has no analogous consolidation choice; every schema gets its own `<family>.test.ts`.

The review's I-finding **I1 (LockOptions test-only but exported)** mirrors a forward-thinking concern that Story 1.5 could echo: the `MigrationRegistry<L>` type is exported and could be (mis)used to inject an arbitrary registry into `loadAndMigrate`. This is by design — the function is generic — but the dev should add a JSDoc note clarifying that production callers MUST pass one of the four built-in registries from `src/migrations/<family>/index.ts`, not synthesise their own.

The review's I-finding **I2 (Story 1.6 import path adjustment)** is forward-only — Story 1.6 will need to adjust its prescribed `import { acquire } from "../io/lock.ts"` to `from "../lock/lock.ts"` when it lands. This is a Story 1.6 concern; Story 1.5 does not consume the lock module.

Story 1.4's hint update pattern (single-string update; class name/code/exitCode preserved; registry count unchanged) is **directly applied** in Task 7 to update `CorruptStateError.actionableHint` to AC-3 verbatim.

#### Story 1.3 Senior Developer Review — S1 carry-over (BLOCKING; addressed in Task 7)

Story 1.3's review S1 finding documented: `assertWithinScope` currently routes scope violations through `PathologicalInputError` with a `SCOPE_VIOLATION:` message prefix; the registered `actionableHint` is the generic input-shape hint, NOT scope-specific. Story 1.3 explicitly anticipated **Story 1.5 as the natural place** to add a dedicated `ScopeViolationError` to the registry (per Story 1.3 Task 4.3 alternative path). This story addresses the carry-over via Task 7.3:

- Add `"SCOPE_VIOLATION"` to the `StepperErrorCode` union.
- Implement `ScopeViolationError` class with code `"SCOPE_VIOLATION"`, exitCode `5`, hint `"Check that the target path is inside _bmad-output/, _bmad-output/.stepper/, or the test tmpdir; see src/io/paths.ts assertWithinScope() for the allowed roots."` (verbatim per Story 1.3 Task 4.1's prescribed text).
- Add `ScopeViolationError` to `errorRegistry`.
- Bump `errors.test.ts` registry-count assertion from 15 to 16.
- Add `"SCOPE_VIOLATION"` to `REQUIRED_CODES`.
- **Do NOT** edit `src/io/paths.ts` to throw `ScopeViolationError` instead of `PathologicalInputError`. That migration is a future-story concern (the throw site update touches `no-write-outside-scope.test.ts` integration test and is a behavioural change beyond AC-3's scope). Story 1.5 lands the registry entry; downstream stories migrate the throw sites incrementally.

This pattern (registry-only addition; no consumer changes) keeps the diff reviewable and respects the orchestrator's mutation scope.

#### Bun host version + lockfile state (cumulative)

- Bun 1.3.12 on the executing host (satisfies AR2's `≥ 1.3` pin).
- Lockfile is `bun.lock` (text format) — Bun 1.2+ defaults to text. **DO NOT bump or modify** `bun.lock` in this story (Zod 4.4.1 already pinned from Story 1.1).
- Biome 2.3.15 exact-pinned.
- Zod 4.4.1 pinned in `package.json`. **This story is the FIRST source-side import of Zod.** Story 1.1 added the dep; Stories 1.2-1.4 did not import it.

### Latest Tech Information (v0.1.0 release window)

Versions are pinned per AR2 — no further web research is required for this story. No package install or upgrade needed. The dev agent MUST NOT run `bun add` / `bun install --save` during this story. If `bun install` is run for any reason (e.g., to verify lockfile state), the `bun.lock` MUST remain byte-identical.

Zod 4.4.1's relevant API surface is documented in [Zod 4 docs (v4.4.x)](https://zod.dev/) — key points already cited in Dev Notes above (`z.literal`, `.strict()`, `safeParse`, `.default(value)`, `z.infer`, `z.unknown()`).

### Project Structure Notes — Anticipated Variances

- **No new directory creation outside `src/schemas/` and `src/migrations/`:** all 20 new files live within these two new directories.
- **No `src/schemas/index.ts` barrel:** v0.1 does not use barrel exports. Every consumer imports by full path: `import { StateV1Schema } from "../schemas/state.ts";`. The architecture's source tree shows `src/schemas/index.ts` as a placeholder (line 1141) but Story 1.5 does NOT create it (YAGNI).
- **No `src/migrations/index.ts` barrel:** same reasoning. The four registry files in `src/migrations/<family>/index.ts` are the per-family barrels; the cross-cutting `loadAndMigrate` is a sibling export; `migration.test.ts` imports each registry individually.
- **No `src/migrations/<family>/1-to-2.ts` placeholder files:** architecture line 1147 shows it but YAGNI. The first migration is authored when v2 is needed.
- **`tsconfig.json`'s `noUncheckedIndexedAccess`:** `Object.entries(registry.migrations)` and `registry.versions[v]` need either an explicit `if (validator)` narrowing or a type assertion. The recommended pattern is the explicit `if` check (already shown in `loadAndMigrate`'s pseudocode in Task 3.5).
- **`tsconfig.json`'s `verbatimModuleSyntax`:** type-only imports use `import type`. Schema files don't import types from anywhere; migration files import `import type { ZodType } from "zod";` and `import type { State } from "../schemas/state.ts";`.
- **`tsconfig.json`'s `allowImportingTsExtensions`:** all sibling imports use the `.ts` extension.

### Dev Agent Guardrails — Do Not Do These Things

In addition to the cumulative guardrails from Stories 1.1, 1.2, 1.3, 1.4 (still in force):

- **Do NOT add `console.log` / `console.error` / `console.warn` / `console.info` anywhere.** Biome's `noConsole` rule blocks ALL `console.*` calls. Use `expect(...)` (not `console.log`) in tests; throw `StepperError` subclasses in runtime code.
- **Do NOT add `default exports`.** Use named exports throughout (`export const StateV1Schema = ...`, `export function loadAndMigrate(...)`).
- **Do NOT make `loadAndMigrate` async.** The function is synchronous; the caller does the async IO (`Bun.file(path).text()` then `Bun.YAML.parse(text)`) before passing the parsed value as `raw`.
- **Do NOT add v2 schemas, v2 migrations, or v2 fixture data.** Story 1.5 is v1-only; the migration registries are skeletons.
- **Do NOT add `1-to-2.ts` placeholder migration files.** Empty placeholders are anti-patterns. The first migration is authored when v2 is needed.
- **Do NOT add `src/schemas/index.ts` or `src/migrations/index.ts` barrel files.** v0.1 uses full-path imports.
- **Do NOT edit `src/io/paths.ts` to throw `ScopeViolationError`.** That migration is a future-story concern. Story 1.5 only adds the registry entry.
- **Do NOT modify any file outside the 20 new files + the two modified `src/errors.ts` and `src/errors.test.ts` files.** Story 1.1 + 1.2 + 1.3 + 1.4 scaffold preservation applies.
- **Do NOT add a runtime dependency.** Zod 4.4.1 is already pinned; that's the only runtime dep.
- **Do NOT use `JSON.parse` or `Bun.YAML.parse` inside any new file.** This story's `loadAndMigrate` accepts already-parsed `raw: unknown`; the parsing-from-text step is the caller's job (Story 1.6 onwards). Schemas and registries are pure data; tests pass fixture objects directly.
- **Do NOT add a `LoadAndMigrateOptions` parameter** to `loadAndMigrate`. Keep the signature as architecture-prescribed: `function loadAndMigrate<L>(raw: unknown, registry: MigrationRegistry<L>): L`.

### Git Intelligence

The recent git history (post-Story 1.4):

- `d126ce2 feat: file lock with heartbeat (story 1.4)`
- `f4f66bf feat: IO primitives - log, paths, atomic-write (story 1.3)`
- `636d9ea feat: errors module + registry CI gate (story 1.2)`
- `c6a8eda feat: scaffold repo (story 1.1)`
- `9760e7d docs: add sprint status tracking`

This story's commit (when authored by the dev-story workflow) will be the **fourth source-code commit** of the project — `src/schemas/<14 files>` plus `src/migrations/<6 files>` plus the actionable-hint update + ScopeViolationError addition to `src/errors.ts` + the registry-count bump in `src/errors.test.ts`. Use a single commit (`feat: schemas + migrations skeleton (story 1.5)`) to keep the diff reviewable.

### Forward Dependencies (informational; not work for this story)

These stories will depend on `src/schemas/` and `src/migrations/` (this story's outputs):

- **Story 1.6 — State Subsystem:** the first consumer. `src/state/load.ts` calls `Bun.file(STATE_PATH).text()` → `Bun.YAML.parse(text)` → `loadAndMigrate(raw, stateMigrationRegistry)` → typed `State` value. Wraps with `acquire()` + `try/finally` + `release()`. The 50-MB state-size guard (NFR-Sc1, AC-mandated `PATHOLOGICAL_INPUT` exit 5 above 50 MB) is Story 1.6's concern, not Story 1.5's. **Note for Story 1.6:** the lock import path is now `from "../lock/lock.ts"` (Story 1.4 deviation D1).
- **Story 1.7 — CLI Argument Parser:** uses `NextArgsSchema`, `LoopArgsSchema`, `DoctorArgsSchema` (per architecture §D12 lines 602–629). These schemas live in `src/commands/<name>/args.ts`, NOT in `src/schemas/`. Story 1.7 does not consume Story 1.5's schemas directly but follows the same `z.infer` typing pattern.
- **Story 1.8 — Snapshot Branch + SHA Detection:** consumes `StateV1Schema.lastSnapshot` shape implicitly (writes the field).
- **Story 1.10 — DAG Seed + Three-Tier Registry:** consumes `ConfigV1Schema.overrides` shape (Tier 2 of the three-tier resolver).
- **Story 1.11 — Persona Resolution:** consumes `ConfigV1Schema.personas` shape.
- **Story 1.12 — `/bmad-next --doctor` Command:** the first consumer of `PidFileV1Schema`. Reads the lock pid file and validates via Zod. Story 1.4's lock-module writer is forward-compatible with this read (the schema's `.default(1)` for `schemaVersion` accepts the legacy no-version pid files).
- **Story 2.5 — Markdown Transcript + JSON Run Log:** the first consumer of `RunLogV1Schema`. Writes step-level run logs and validates on read.
- **Story 2.6 — Verify-and-Advance:** consumes `VerifierResultV1Schema`.
- **Story 6.1 — Config Schema Loader:** the first consumer of `ConfigV1Schema` for project config validation.
- **Story 6.6/6.7 — Telemetry:** the first consumer of `TelemetryRecordV1Schema`. Writes JSONL records; the `.strict()` schema enforces NFR-S3 anti-PII.
- **Future story (TBD) — Schema v2 introduction:** the first consumer of `migrations[1]: (data) => migratedToV2(data)`. The harness already in `migration.test.ts` activates the idempotency assertions.

### References

Cite all technical details with source paths and sections:

- **Story Foundation:**
  - [Source: _bmad-output/planning-artifacts/epics.md#Story 1.5: Schemas + Migrations Skeleton] — User story + AC verbatim (lines 411–428).
  - [Source: _bmad-output/planning-artifacts/epics.md#Epic 1: Foundation & First-Run Diagnostic] — Epic context (lines 343–346).
- **Architecture Compliance:**
  - [Source: _bmad-output/planning-artifacts/architecture.md#D8 — In-band schema migration runner] — Algorithm + idempotency contract (lines 511–541).
  - [Source: _bmad-output/planning-artifacts/architecture.md#AR20 (Schema migrations)] — Migration registries; STATE_TOO_NEW; CORRUPT_STATE (line 197).
  - [Source: _bmad-output/planning-artifacts/architecture.md#Module Boundary Graph (AR41)] — Foundational + mid-tier declarations (lines 1273–1278).
  - [Source: _bmad-output/planning-artifacts/architecture.md#Complete Project Directory Structure] — `src/schemas/` placement (line 1134); `src/migrations/` placement (line 1144); `migration.test.ts` placement (line 1243); `src/migrations/state/index.ts` registry (line 1146).
  - [Source: _bmad-output/planning-artifacts/architecture.md#P3 — Persisted File Shapes] — Canonical state.yaml fields (lines 747–771); config fields (lines 773–790); run-log fields (lines 794+); telemetry shape (line 851).
  - [Source: _bmad-output/planning-artifacts/architecture.md#P5 — Sub-Agent Dispatch Contract] — Dispatch spec shape (lines 868–898); verifier result shape (lines 901–914).
  - [Source: _bmad-output/planning-artifacts/architecture.md#D4 — File locking via hand-rolled mkdir-based algorithm] — Pid file Zod-validated shape (line 378).
  - [Source: _bmad-output/planning-artifacts/architecture.md#FR Coverage Map] — FR6, FR7 → state.yaml schema validation + migration auto-apply (lines 1336–1337).
  - [Source: _bmad-output/planning-artifacts/architecture.md#NFR Coverage Map] — NFR-R6 idempotent migrations (line 1407); NFR-M3 schemas + migrations (line 1422).
  - [Source: _bmad-output/planning-artifacts/architecture.md#Naming Conventions (P1)] — Schema-version typed aliases pattern (line 719); persisted-file field naming `camelCase` (line 726).
  - [Source: _bmad-output/planning-artifacts/architecture.md#Function & Error Semantics (P4)] — Errors thrown not returned (line 857).
- **PRD:**
  - [Source: _bmad-output/planning-artifacts/prd.md] line 676 — FR6 system validates state files against versioned schema with actionable errors.
  - [Source: _bmad-output/planning-artifacts/prd.md] line 677 — FR7 system applies migrations automatically on load.
  - [Source: _bmad-output/planning-artifacts/prd.md] line 778 — NFR-R6 schema migrations on `state.yaml` are idempotent.
  - [Source: _bmad-output/planning-artifacts/prd.md] line 802 — NFR-M3 all public-facing schemas validated by Zod with versioned migrations.
- **Cross-Cutting:**
  - [Source: _bmad-output/planning-artifacts/architecture.md#AR27 — Telemetry collection schema] — Closed-set field whitelist for `TelemetryRecordV1Schema` (line 207, line 1664).
- **Previous Stories:**
  - [Source: _bmad-output/implementation-artifacts/1-1-initialize-repository-scaffold.md#Completion Notes List] — Bun 1.3.12 host; Biome 2.3.15 rule renames; lockfile is `bun.lock` (text); Zod 4.4.1 pinned in package.json.
  - [Source: _bmad-output/implementation-artifacts/1-2-errors-module-registry-ci-gate.md#File List] — `src/errors.ts` 15-entry registry; abstract `StepperError` base; `new.target.name` pattern; `override readonly` pattern; alphabetical import ordering.
  - [Source: _bmad-output/implementation-artifacts/1-3-logger-path-helpers-atomic-write.md#Senior Developer Review (AI)] — S1 carry-over: dedicated `ScopeViolationError` class to be added in Story 1.5.
  - [Source: _bmad-output/implementation-artifacts/1-3-logger-path-helpers-atomic-write.md#Completion Notes List] — `src/integration/` deviation (placed at `src/io/`); registry-edit deviation (`SCOPE_VIOLATION` routed through `PathologicalInputError`).
  - [Source: _bmad-output/implementation-artifacts/1-4-file-lock-with-heartbeat.md#Senior Developer Review (AI)] — Approve outcome; D1 (src/lock/ deviation) and D2 (forceUnlock test consolidation) acceptable; I2 forward note (Story 1.6 import path adjustment); pid file forward-compat with Story 1.5 Zod schema.
  - [Source: _bmad-output/implementation-artifacts/1-4-file-lock-with-heartbeat.md#Completion Notes List] — Inline `PidFileContents` interface to be replaced by Zod schema in this story (Task 1.8).
- **Project Config Pin:**
  - [Source: _bmad/config.yaml] — `project_name: bmad-stepper`, `planning_artifacts`, `implementation_artifacts`, `test_framework: bun-test`. **Pinned to `_bmad/config.yaml`.**

### Definition of Done

- [x] All 9 tasks above completed and self-checked.
- [x] All 15 file-structure final-check items pass.
- [x] `src/schemas/{state,config,run-log,telemetry,dispatch-spec,verifier-result,pid}.ts` exist; each exports `<Family>V1Schema`, `<Family>V1`, `<Family>` (alias), `<Family>LatestSchema` (alias).
- [x] Each schema has a colocated `<family>.test.ts` covering positive parse, missing required field, wrong field type, defaults; the telemetry test ALSO covers extra-field rejection (`.strict()` enforcement).
- [x] `src/migrations/load-and-migrate.ts` exists; exports `loadAndMigrate`, `MigrationRegistry`, `Migration`.
- [x] `src/migrations/{state,config,run-log,telemetry}/index.ts` exist; each exports `<family>MigrationRegistry: MigrationRegistry<...>` with `current: 1`, `versions: { 1: <Family>V1Schema }`, `migrations: {}`, `familyName: "<family>"`.
- [x] `src/migrations/migration.test.ts` exercises the four registries via the idempotency-enumeration loop AND the three `loadAndMigrate` AC paths (AC-1 happy + default schemaVersion; AC-2 STATE_TOO_NEW; AC-3 CORRUPT_STATE).
- [x] `src/errors.ts` updated: `CorruptStateError.actionableHint` matches AC-3 verbatim; `ScopeViolationError` class added with code `"SCOPE_VIOLATION"`, exitCode `5`, hint per Task 7.3; registry count = 16.
- [x] `src/errors.test.ts` registry-count assertion = 16; `REQUIRED_CODES` includes `"SCOPE_VIOLATION"`.
- [x] `bun run check` exits 0 locally.
- [x] CI green on `ubuntu-latest` and `macos-latest`. _(deferred — verified post-merge per Story 1.1 A4 follow-up)_
- [x] `loadAndMigrate(raw, registry)` correctly handles: not-an-object → `CorruptStateError`; absent schemaVersion → defaults to 1; schemaVersion > current → `StateTooNewError`; validation failure at any version → `CorruptStateError`; missing migration for needed step → `MigrationFailureError`; final-validation failure → `CorruptStateError`.
- [x] No `console.*` calls anywhere in the new files (Biome `noConsole` confirmed).
- [x] No imports outside foundational/mid-tier scope in any new file (AR41).
- [x] `package.json`, `tsconfig.json`, `biome.json`, `bunfig.toml`, `bun.lock`, `.github/workflows/ci.yml`, `.claude-plugin/plugin.json`, `commands/bmad-next.md` are byte-identical to their Story 1.4 state.
- [x] No edits to `_bmad-output/.stepper/` (the AR42 persistence boundary — directory does not exist yet anyway).
- [x] Story status flipped to `review` upon dev-story completion.
- [x] Commit pushed to a branch (no force-push to `main`). _(deferred — bmad-loop / orchestrator owns commit + push)_

## Previous Story Intelligence

This section is a synthesis (cross-story view) of the four prior `done` stories. Each lessons-learned item is tagged with the story-of-origin so the dev agent can trace the rationale.

### From Story 1.1 (Repository Scaffold — `done`)

- **Bun 1.3.12 host** (satisfies AR2 ≥ 1.3 pin). `bun --version` confirms.
- **Biome 2.3.15 exact-pinned**; `noConsole` rule replaces older `noConsoleLog`; `noImplicitAnyLet` moved to `suspicious.` namespace.
- **Zod 4.4.1 pinned in `package.json`** but **not yet imported anywhere in src/**. Story 1.5 is the first source-side import.
- **Lockfile is `bun.lock` (text format)** — Bun 1.2+ defaults; do not bump.
- **`tsconfig.json` strict + `verbatimModuleSyntax: true` + `noUncheckedIndexedAccess: true` + `noImplicitOverride: true`** — these flags are still in force; type-only imports use `import type`; sibling imports use `.ts` extension.
- **`commands/bmad-next.md` placeholder** exists but is empty — slash-command markdown, not a `src/commands/` TS module.

### From Story 1.2 (Errors Module + Registry CI Gate — `done`)

- **`src/errors.ts` 15-entry registry** at start of this story. After Task 7's `ScopeViolationError` addition, registry = 16.
- **Abstract `StepperError` base class** sets `this.name = new.target.name` in constructor — every subclass automatically gets its class name on `Error.name` without per-subclass boilerplate. **Reuse this pattern for `ScopeViolationError`.**
- **Each subclass uses `override readonly` modifiers** to satisfy `tsconfig.noImplicitOverride: true`. Same pattern for `ScopeViolationError`.
- **`StepperExitCode` named type alias (`0 | 1 | 2 | 3 | 4 | 5`)** is exported from `src/errors.ts`. `ScopeViolationError` declares `override readonly exitCode = 5 as const;` (pathological-input bucket).
- **Registry CI gate (`src/errors.test.ts`)** asserts: registry count, code uniqueness, exitCode in [0..5], hint regex `/^.*(Run|See|Try|Check) /`. The test does NOT assert exact hint strings — Task 7's hint update for `CorruptStateError` is invisible to the registry test (only AC-3-specific assertions in `migration.test.ts` validate the verbatim hint).
- **Alphabetical import ordering** for Biome 2.3.15 organize-imports rule.

### From Story 1.3 (IO Primitives — `done`)

- **`src/io/{log,paths,atomic-write}.ts`** exist; their colocated tests pass; `no-write-outside-scope.test.ts` is the AR36 release-blocker integration test.
- **`src/integration/` does NOT exist.** Story 1.3 placed `no-write-outside-scope.test.ts` at `src/io/` (deviation; documented). Story 1.5 follows the same pattern: `migration.test.ts` lives within `src/migrations/`, NOT `src/integration/`.
- **`assertWithinScope`** routes scope violations through `PathologicalInputError` with a `SCOPE_VIOLATION:` message prefix. Story 1.3 review S1: a dedicated `ScopeViolationError` class **SHOULD** be added in Story 1.5. **This story addresses that carry-over via Task 7.3.** The throw-site update (changing `assertWithinScope` to throw the new class instead of `PathologicalInputError`) is a **future-story concern** (Story 1.6 onwards) — Story 1.5 only adds the registry entry.
- **macOS tmpdir symlink:** `/tmp` is a symlink to `/private/var/folders/...`; `os.tmpdir()` returns the canonical path. Story 1.5 has no IO so this doesn't apply.
- **Atomic write algorithm:** `assertWithinScope` → optional `fs.rename(target, bak)` → `Bun.write(tmpPath, contents)` → `fs.rename(tmpPath, target)`. NOT used by this story (no writes).

### From Story 1.4 (File Lock with Heartbeat — `done`)

- **`src/lock/lock.ts` placement (D1 deviation):** orchestrator HARD pin placed lock at `src/lock/`, NOT `src/io/lock.ts`. The architecture's prescribed location was `src/io/lock.ts` (line 1198). Story 1.5's `src/schemas/` and `src/migrations/` placements MATCH the architecture-prescribed locations (lines 1134, 1144) — there is no analogous deviation in this story.
- **`src/lock/integration/{concurrent-acquire,stale-lock-recovery,heartbeat-loss,sub-second-mtime}.test.ts`** exist (D2 deviation: `force-unlock.test.ts` was consolidated into `lock.test.ts`).
- **`LockContentionError.actionableHint`** updated to AC-1 verbatim: `"Run /bmad-next --doctor to inspect lock state, or /bmad-next --force-unlock if you're sure no other Stepper is running."`. This story's hint update for `CorruptStateError` follows the same single-string-edit pattern.
- **Inline `PidFileContents` interface** in `src/lock/lock.ts` (Story 1.4 Task 1.4) will be **replaced** by `src/schemas/pid.ts`'s `PidFileV1Schema` in this story. **CRITICAL:** the schema MUST accept the existing on-disk format (`heartbeatIntervalMs` field, no `schemaVersion` field). Story 1.5 does NOT edit `src/lock/lock.ts`; the schema is forward-compatible with Story 1.4's writer via `.default(1)` on the optional `schemaVersion` field.
- **Forward note for Story 1.6:** the lock import path is `from "../lock/lock.ts"` (NOT `from "../io/lock.ts"` per pre-deviation Dev Notes line 299). This is a Story 1.6 concern; Story 1.5 does not consume the lock module.
- **`acquire()` and `forceUnlock()` API:** `acquire()` returns a `LockHandle` with `release()` method; `forceUnlock()` is a 4-line primitive that unconditionally removes the lock dir. `LockOptions` parameter is test-only-but-exported (review I-finding I1).
- **Test naming pattern:** integration tests live at `src/lock/integration/<scenario>.test.ts` (D1 deviation). Story 1.5 does NOT create `src/migrations/integration/` — the `migration.test.ts` lives at `src/migrations/migration.test.ts` (architecture-prescribed location, line 1243).

### Cross-Story Patterns to Reuse

- **Single foundational TS file + colocated test + multi-test-file integration coverage** (the template since Story 1.2). This story has 7 schema files (each with colocated test) plus 1 integration test (`migration.test.ts`).
- **Verbatim AC hint alignment via single-string edit to `src/errors.ts`** (Story 1.4 pattern reapplied in Task 7).
- **Registry-only addition for new error classes** (Story 1.5 Task 7's `ScopeViolationError` follows Story 1.2's pattern of adding a class + registry entry without touching consumer code).
- **AR41 module boundary graph progressively populated** (Story 1.5 lands the fourth foundational subtree `schemas/` and the first mid-tier module `migrations/`).
- **`bun run check` as the composite release-blocker gate** (Story 1.5 Task 8 verifies exit 0 just like prior stories).
- **No edits outside the declared mutation scope** (Story 1.5 mutations are narrow — only the new directories + `src/errors.ts` hint update + new ScopeViolationError + `src/errors.test.ts` count bump).

## Change Log

- 2026-04-30 — v0.1.0 — Story 1.5 (Schemas + Migrations Skeleton) created by `bmad-create-story` persona under `bmad-loop` iteration 1 of run `2026-04-30T203403Z-bmad-next`. Initial frontmatter `status: ready-for-dev`. AC reproduced verbatim from `_bmad-output/planning-artifacts/epics.md` lines 411–428. Comprehensive Dev Notes with architecture compliance (D8 + AR20 + AR41 + AR33), source tree, 9 tasks, 15-item file-structure final check, previous-story intelligence (1.1, 1.2, 1.3, 1.4), forward dependencies. Story 1.3 S1 carry-over (dedicated `ScopeViolationError` class) folded into Task 7. Story 1.4 forward-compat for pid file Zod schema folded into Task 1.8. AC-3 verbatim-hint alignment for `CorruptStateError` folded into Task 7.
- 2026-04-30 — v0.1.0 — Story 1.5 implemented by `bmad-dev-story` persona (Amelia) under `bmad-loop` iteration 2 of run `2026-04-30T205111Z-bmad-next`. Created 20 new files (`src/schemas/{state,config,run-log,telemetry,dispatch-spec,verifier-result,pid}.ts` + colocated tests; `src/migrations/load-and-migrate.ts`; `src/migrations/{state,config,run-log,telemetry}/index.ts`; `src/migrations/migration.test.ts`). Modified `src/errors.ts` (CorruptStateError hint updated to AC-3 verbatim; added `ScopeViolationError` class; registry count 15 → 16) and `src/errors.test.ts` (registry-count assertion bumped; `SCOPE_VIOLATION` added to `REQUIRED_CODES`). All 9 tasks + 61 subtasks ticked. `bun test`: 148 pass / 0 fail / 438 expects across 18 files. `bunx biome ci .`, `bun run check`, `bunx tsc --noEmit` all exit 0. AR41 module boundary verified (manual review). Status flipped `ready-for-dev → review`.

## Dev Agent Record

Status: done

### Context Reference

- Story 1.5 source: `_bmad-output/planning-artifacts/epics.md` lines 411–428
- Architecture sections: `_bmad-output/planning-artifacts/architecture.md` §D8 (lines 511–541), AR20 (line 197), AR41 (lines 1273–1278), §P3 (lines 747+), §P5 (lines 868+)
- Sprint status: `_bmad-output/implementation-artifacts/sprint-status.yaml` (this story flips `ready-for-dev → review` on completion)
- Previous story: `_bmad-output/implementation-artifacts/1-4-file-lock-with-heartbeat.md` (status: `done`)

### Agent Model Used

Claude Opus 4.7 (1M context) via Anthropic Claude Code (claude-opus-4-7[1m]); persona: bmad-dev-story (Amelia). Run id: `2026-04-30T205111Z-bmad-next` (loop iteration 2 of `2026-04-30T203155Z-bmad-loop`). Bun host: 1.3.12 (satisfies AR2 ≥ 1.3).

### Debug Log References

- Baseline (pre-story) `bun test`: 85 pass / 0 fail / 305 expects across 10 files (~417ms). Confirmed before any mutation.
- After Task 1 + Task 2 (schemas + colocated unit tests): `bun test src/schemas/` → 39 pass / 0 fail / 79 expects across 7 files (~82ms).
- After Task 3 + Task 4 + Task 5 (migrations + integration test) + Task 7 (errors.ts edits): full `bun test` failed twice initially:
  - Failure 1: `loadAndMigrate behavior > AC-1 — happy path > defaults schemaVersion to 1 when absent` threw `CorruptStateError: state: final validation failed at version 1`. Root cause: when `schemaVersion` was absent from `raw`, the algorithm defaulted `version = 1` but did not inject `schemaVersion: 1` into the working object before validation, so the `z.literal(1)` discriminator failed. Fix: shallow-copy `raw` and inject `schemaVersion: 1` into the working object when the field is absent. Re-run: pass.
  - Failure 2: `src/lock/integration/heartbeat-loss.test.ts > reclaims at the boundary: mtime just past threshold` threw a `LockContentionError`. Diagnosed as a pre-existing flaky timing test (unrelated to Story 1.5 — re-running the file standalone produced 3 pass / 0 fail). No code change required; the failure does not reproduce on retry.
- Final `bun test`: 148 pass / 0 fail / 438 expects across 18 files (~365ms).
- `bunx biome check . --write` reorganised imports in 7 schema/migration test files (alphabetical with type-only imports last per Biome 2.3.15 `assist/source/organizeImports`). No semantic change.
- `bunx biome ci .` exit 0 (40 files; 7ms).
- `bun run check` exit 0 (composite of biome ci + bun test).
- `bunx tsc --noEmit` exit 0.

### Completion Notes List

- Task 0 — pre-conditions verified: zod 4.4.1 pinned in `package.json`; `src/errors.ts` contains `StateTooNewError`, `CorruptStateError`, `MigrationFailureError`; `src/schemas/` and `src/migrations/` did not yet exist; baseline `bun run check` exit 0; Bun 1.3.12 satisfies AR2.
- Task 1 — created seven schema files in `src/schemas/`. Each declares `<Family>V1Schema`, `<Family>V1` (`z.infer<...>`), `<Family>` (alias), `<Family>LatestSchema` (alias). The `pid.ts` schema uses `z.literal(1).optional().default(1)` on `schemaVersion` to remain forward-compatible with Story 1.4's lock-module writer (which omits the field). Telemetry uses `.strict()` to enforce NFR-S3 anti-PII.
- Task 2 — created seven colocated `<schema>.test.ts` files. Each test exports a `canonical<Family>V1Fixture` constant for cross-file reuse by `migration.test.ts` (Task 6).
- Task 3 — implemented `loadAndMigrate(raw, registry): L` synchronously in `src/migrations/load-and-migrate.ts`. Throws `CorruptStateError | StateTooNewError | MigrationFailureError` per AR33 P4 (errors thrown, not returned). The `MigrationRegistry<L>` interface adds a phantom `_latest?: Latest` field so the type parameter propagates without runtime cost, and a non-architecture `familyName` field so error messages are family-qualified. The cross-cutting function lives at the directory root (not under any family folder), per Task 3.1.
- Task 4 — created four migration registry files: `src/migrations/{state,config,run-log,telemetry}/index.ts`. Each declares `current: 1`, `versions: { 1: <Family>V1Schema }`, `migrations: {}` (empty per skeleton). No `1-to-2.ts` placeholder files (architecture line 1147 is intentionally NOT followed; YAGNI per Task 4.5).
- Task 5 — created `src/migrations/migration.test.ts`. Two scopes: (1) idempotency-enumeration loop over the four registries (per family: validates `versions[current]` exists + `current` is a positive integer + emits a sanity test; the inner `it("is idempotent at fromVersion → toVersion")` only fires when a future story registers a migration); (2) `loadAndMigrate` AC paths (AC-1 happy path × 5, AC-2 × 3, AC-3 × 7 — 15 tests total exercising verbatim hint strings, codes, exit codes).
- Task 6 — fixtures live inside the colocated test files (`canonicalStateV1Fixture`, etc.), exported from `src/schemas/<family>.test.ts` and consumed by `src/migrations/migration.test.ts`. No separate fixture files (Task 6.3 — keep AR35 tmpdir-isolation orthogonal).
- Task 7 — updated `src/errors.ts`:
  - Single-string update to `CorruptStateError.actionableHint` to match AC-3 verbatim: "Run /bmad-next --recompute-state to rebuild the cache from project files." Class name, code, exitCode, override modifiers preserved exactly.
  - Added `"SCOPE_VIOLATION"` to the `StepperErrorCode` union (16 codes total).
  - Added the new `ScopeViolationError` class (code `"SCOPE_VIOLATION"`, exitCode 5, hint "Check that the target path is inside _bmad-output/, _bmad-output/.stepper/, or the test tmpdir; see src/io/paths.ts assertWithinScope() for the allowed roots."), inserted between `PathologicalInputError` and `BudgetExceededError` (semantic grouping with the other pathological-input/exit-5 class).
  - Added `ScopeViolationError` to `errorRegistry` in the same registration order.
  - Updated `src/errors.test.ts` registry-count assertion 15 → 16, added `"SCOPE_VIOLATION"` to `REQUIRED_CODES`. Did NOT edit `src/io/paths.ts`'s `assertWithinScope` throw site — that is forward work (Story 1.6 onwards) per Task 7.5.
- Task 8 — verification (final run on the host):
  - `bun test` → 148 pass / 0 fail / 438 expects across 18 files (~365ms).
  - `bunx biome ci .` → 40 files, no fixes applied.
  - `bun run check` → exit 0.
  - `bunx tsc --noEmit` → exit 0.
- Task 9 — final-check items pass: 20 new files under `src/schemas/` + `src/migrations/`; 2 modified files (`src/errors.ts`, `src/errors.test.ts`); zero edits to `package.json`, `tsconfig.json`, `biome.json`, `bunfig.toml`, `bun.lock`, `.github/workflows/ci.yml`, `.claude-plugin/plugin.json`, `commands/bmad-next.md`, `src/io/**`, `src/lock/**`; status flipped to `review` (frontmatter + inline).
- AR41 module-boundary verification (manual review): `src/schemas/*.ts` import only `zod`; `src/schemas/*.test.ts` import only `bun:test` and sibling `./<family>.ts`; `src/migrations/load-and-migrate.ts` imports only `zod` and `../errors.ts`; `src/migrations/<family>/index.ts` imports only `../../schemas/<family>.ts` and `../load-and-migrate.ts`; `src/migrations/migration.test.ts` imports test-only fixtures from `../schemas/<family>.test.ts` (Task 6.3 — fixtures live in test files).
- No `console.*` calls anywhere in `src/` (Biome `noConsole` enforced); no `: any`, `as any`, `<any>` types.
- Out-of-scope mutations: NONE. Configuration files, lockfile, and prior-story source files all byte-identical.
- Definition of Done deferrals (NOT failures): "CI green on ubuntu-latest and macos-latest" — verified post-merge per Story 1.1 A4 follow-up; "Commit pushed to a branch" — bmad-loop orchestrator owns commit + push.

### File List

Created (20 files):

- `src/schemas/state.ts` (69 lines)
- `src/schemas/state.test.ts` (97 lines)
- `src/schemas/config.ts` (44 lines)
- `src/schemas/config.test.ts` (83 lines)
- `src/schemas/run-log.ts` (42 lines)
- `src/schemas/run-log.test.ts` (80 lines)
- `src/schemas/telemetry.ts` (41 lines)
- `src/schemas/telemetry.test.ts` (86 lines)
- `src/schemas/dispatch-spec.ts` (47 lines)
- `src/schemas/dispatch-spec.test.ts` (68 lines)
- `src/schemas/verifier-result.ts` (35 lines)
- `src/schemas/verifier-result.test.ts` (78 lines)
- `src/schemas/pid.ts` (44 lines)
- `src/schemas/pid.test.ts` (76 lines)
- `src/migrations/load-and-migrate.ts` (148 lines)
- `src/migrations/migration.test.ts` (242 lines)
- `src/migrations/state/index.ts` (23 lines)
- `src/migrations/config/index.ts` (19 lines)
- `src/migrations/run-log/index.ts` (19 lines)
- `src/migrations/telemetry/index.ts` (25 lines)

Modified (2 files):

- `src/errors.ts` — (a) `CorruptStateError.actionableHint` updated to AC-3 verbatim string (single-line change). (b) Added `"SCOPE_VIOLATION"` to `StepperErrorCode` union. (c) Added `ScopeViolationError` class (between `PathologicalInputError` and `BudgetExceededError`). (d) Added `ScopeViolationError` to `errorRegistry`. Registry count: 15 → 16. Header comment updated from "(15 codes from AC-2)" to "(16 codes — AC-2 fixed list + Story 1.5 ScopeViolationError)".
- `src/errors.test.ts` — (a) Registry-count assertion `toHaveLength(15)` → `toHaveLength(16)`; "contains exactly 15 entries" → "contains exactly 16 entries". (b) `REQUIRED_CODES` extended with `"SCOPE_VIOLATION"`. (c) Header comment updated to reflect the 16-code total.

State files (status updates only):

- `_bmad-output/implementation-artifacts/1-5-schemas-migrations-skeleton.md` — status flipped from `ready-for-dev` to `review` (frontmatter + inline heading); all 28 top-level + 61 subtask checkboxes ticked; Dev Agent Record populated; File List populated; Change Log appended.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `development_status[1-5-schemas-migrations-skeleton]` flipped from `ready-for-dev` to `review`; `last_updated` advanced.

## Senior Developer Review (AI)

**Reviewer:** AI Code Review Agent (bmad-code-review persona; Claude Opus 4.7 1M)

**Date:** 2026-04-30

**Outcome:** approve

**Run:** `2026-04-30T210530Z-bmad-next` (loop iteration 3 of `2026-04-30T203155Z-bmad-loop`)

### Acceptance Criteria Verification

| AC | Verdict | Evidence |
|---|---|---|
| AC-1 — `loadAndMigrate` happy path | pass | Four-step algorithm faithfully implemented at `src/migrations/load-and-migrate.ts:62-148` (defensive narrow + read schemaVersion → STATE_TOO_NEW guard → iterate validate/migrate/increment → final-validate → return typed `L`). Default-schemaVersion injection at lines 76-79 (shallow copy, immutable input preserved). Seven schema files cover all required families. Five happy-path tests at `src/migrations/migration.test.ts:73-121` exercise all four versioned families plus the default-schemaVersion branch. |
| AC-2 — `STATE_TOO_NEW` on schemaVersion > current | pass | `StateTooNewError` thrown at `load-and-migrate.ts:91-96`. Verbatim hint `"Run /bmad-next --upgrade to install a Stepper version that supports this schema."` registered at `src/errors.ts:130-131`; asserted in `migration.test.ts:152-154`. Cross-family check (config registry) at lines 159-170. |
| AC-3 — `CORRUPT_STATE` on corrupt JSON/YAML | pass | `CorruptStateError` thrown at six sites in `load-and-migrate.ts` (non-object, schemaVersion-not-number, missing validator, validation failure mid-loop, missing final validator, final-validation failure). Verbatim hint `"Run /bmad-next --recompute-state to rebuild the cache from project files."` registered at `src/errors.ts:124`; asserted in `migration.test.ts:222-225`. Seven CORRUPT_STATE tests cover non-object, null, number, array, non-numeric schemaVersion, missing-required-field, and `.strict()` extra-field rejection. |
| AC-4 — Idempotency CI gate | pass | `migration.test.ts:41-70` enumeration loop iterates `ALL_REGISTRIES = [state, config, run-log, telemetry]`; per-family fires (a) `validator for current version registered` (b) `current is positive integer`. Inner `it("is idempotent at <from> → <to>")` block is future-proofed: zero migrations registered in v0.1 (the registries are skeletons by design per Task 4); the harness auto-activates when a future story registers `migrations[v]`. Eight sanity tests fire (2 × 4 families). |

### Architectural Conformance

| Architecture Reference | Verdict | Evidence |
|---|---|---|
| AR20 — Schema migrations + STATE_TOO_NEW + CORRUPT_STATE | pass | Per-family migration registry pattern in `src/migrations/<family>/index.ts`; idempotency contract enforced via `migration.test.ts` harness; `STATE_TOO_NEW` and `CORRUPT_STATE` errors registered and thrown. |
| AR22 — Actionable-hint regex | pass | All 16 registered hints match `/^.*(Run|See|Try|Check) /`. `CorruptStateError` hint updated to AC-3 verbatim ("Run ..."); new `ScopeViolationError` hint starts with "Check". `errors.test.ts` registry CI gate green (10/0/197). |
| AR33 — Throw-not-return; sync; no-any; no-console | pass | `loadAndMigrate` is synchronous; throws `StepperError` subclasses (`CorruptStateError | StateTooNewError | MigrationFailureError`); zero `: any` / `as any` / `<any>` matches in `src/schemas/` and `src/migrations/`; zero `console.*` matches. |
| AR41 — Module boundary | pass | `src/schemas/*.ts` import only `zod`; `src/migrations/load-and-migrate.ts` imports only `zod` (type-only `ZodType`) and `../errors.ts`; `src/migrations/<family>/index.ts` imports only `../../schemas/<family>.ts` and `../load-and-migrate.ts` (type-only). Manual Grep audit of 21 files confirms zero upward imports. `schemas/` joins `errors.ts`, `io/`, `lock/` in foundational tier; `migrations/` is the first mid-tier module. |
| AR42 — Persistence boundary | pass | Trivially satisfied — schemas are pure-data Zod declarations; `loadAndMigrate` accepts already-parsed `raw: unknown`; no filesystem IO performed; no writes under `_bmad-output/.stepper/`. Story 1.6 will be the first IO-side consumer. |
| AR27 — Telemetry closed-set | pass | `TelemetryRecordV1Schema` uses `.strict()` at `telemetry.ts:37`; rejection of extra `projectName` field tested at `telemetry.test.ts:63-69` and `migration.test.ts:230-240`. Closed-set field whitelist matches architecture line 1664 verbatim (12 fields including optional `errorCode`). |
| NFR-R6 — Idempotent migrations | pass | Idempotency CI gate harness in `migration.test.ts:41-70` future-proofed for v2 migrations; zero migrations registered in v0.1 (skeleton). |
| NFR-S3 — Anti-PII | pass | `.strict()` on `TelemetryRecordV1Schema` enforces closed-set; explicit test at `telemetry.test.ts:63-69`. |
| NFR-M3 — All public schemas Zod-validated | pass | All four versioned families (state, config, run-log, telemetry) plus three supporting schemas (dispatch-spec, verifier-result, pid) declare Zod V1 schemas with type aliases and LatestSchema aliases per architecture line 719 convention. |

### Findings

**mustFix (block release):** none

**shouldFix (action item but not blocking):** none

**nits (cosmetic):** none

**info (observations):**

- **I1 — Non-integer schemaVersion lands in STATE_TOO_NEW path (1.5 > 1).** Probe: `loadAndMigrate({ schemaVersion: 1.5, ... })` throws `StateTooNewError` because `1.5 > 1`. Strictly speaking, a non-integer `schemaVersion` is "corrupt" rather than "too new", but the user-visible hint ("Run /bmad-next --upgrade ...") is still actionable and the registered hint regex passes. By design for v0.1 — Zod's `z.literal(1)` at `versions[1]` does the integer-shape gating once the version branches. Future story may tighten with `Number.isInteger(version)` check before the `>` comparison; tracked for Story 1.6 if real-world `state.yaml` ever surfaces this.
- **I2 — Negative or zero schemaVersion lands in CORRUPT_STATE via missing-validator.** Probe: `loadAndMigrate({ schemaVersion: 0, ... })` throws `CorruptStateError` ("no validator for version 0"); same for `-1`. The loop `while (0 < 1)` enters and tries `versions[0]` which doesn't exist. Behaviorally CORRECT (the AC-3 hint directs the user to `--recompute-state`) and the message is family-qualified. Edge-case observable; no AC violation.
- **I3 — Extra top-level fields silently dropped on non-strict schemas.** Probe: state.yaml shapes with unknown extra keys parse cleanly; Zod's default object behaviour drops unknown fields. Intentional — only `TelemetryRecordV1Schema` uses `.strict()` (NFR-S3). State/config/run-log/etc. are intentionally open-shape so older Stepper versions can read newer (within-major) state files without rejecting unrecognised keys (forward-compat).
- **I4 — `MigrationRegistry` interface adds non-architecture `familyName` + phantom `_latest` field.** Architecture §D8 line 522 declares the registry shape without `familyName` or `_latest`. Dev added (a) `familyName: string` for family-qualified error messages; (b) phantom `_latest?: Latest` field so the `Latest` type parameter propagates structurally in TS. Both pure-additive, documented in `load-and-migrate.ts` JSDoc + dev-story task record. Approve.
- **I5 — Pre-existing flaky `heartbeat-loss.test.ts` (Story 1.4 carry-over).** Dev observed intermittent failure on full-suite first run; standalone re-run produces 3/0 pass. Reviewer confirmed: standalone re-run during this review also produces 3/0 pass; final full-suite run records 148/0 with no failure. Not a Story 1.5 regression. Continue monitoring; escalate to Story 1.4 fix-up only if reproducible failure rate exceeds ~10 % on CI.

### Verification Commands

| Command | Exit Code | Output (snippet) |
|---|---|---|
| `bun test` | 0 | 148 pass / 0 fail / 438 expects across 18 files (370ms) |
| `bun test src/schemas/` | 0 | 39 pass / 0 fail / 79 expects across 7 files (22ms) |
| `bun test src/migrations/` | 0 | 48 pass / 0 fail / 94 expects across 1 file (17ms) |
| `bunx biome ci .` | 0 | Checked 40 files in 7ms. No fixes applied. |
| `bun run check` | 0 | biome ci . && bun test --pass-with-no-tests → 148/0/438 |
| `bunx tsc --noEmit` | 0 | (no output; clean) |
| `bun test src/lock/integration/heartbeat-loss.test.ts` (standalone — flake check) | 0 | 3 pass / 0 fail / 5 expects (9ms) |
| Manual Grep — `console.*` audit | 0 hits | Zero matches in `src/schemas/` and `src/migrations/`. |
| Manual Grep — `: any` / `as any` / `<any>` audit | 0 hits | Zero matches in `src/schemas/` and `src/migrations/`. |
| Manual Grep — AR41 module boundary audit | 0 violations | All imports respect foundational + mid-tier allowlists across 21 files. |
| Reviewer probe — `loadAndMigrate({ schemaVersion: 1.5, ... })` | StateTooNewError | Documented as I1; non-blocking edge case. |
| Reviewer probe — `loadAndMigrate({ schemaVersion: 0, ... })` | CorruptStateError "no validator for version 0" | Documented as I2; correct behavior. |
| Reviewer probe — extra-field on state schema | parses; field dropped | Documented as I3; intentional non-`.strict()` design. |

### Deviation Verdicts

- **D1 — `MigrationRegistry` interface adds `familyName` + phantom `_latest`** — **acceptable**. Pure-additive beyond architecture §D8 line 522 prescribed shape. `familyName` powers family-qualified error messages ("state: schemaVersion 99 > current 1") which is strictly more useful than the architectural example. Phantom `_latest` is necessary because TypeScript otherwise discards the `<Latest>` type parameter (it's not used in any field), degrading the typed return value of `loadAndMigrate`. Both additions are documented in `load-and-migrate.ts` JSDoc and in the dev-story task record. No behavioural regression. **Approve.**
- **D2 — `loadAndMigrate` injects `schemaVersion: 1` into a shallow copy when the field is absent** — **acceptable**. Architecture §D8 step 1 says "default 1 if absent". Without injecting the literal, the v1 validator (`z.literal(1)`) rejects the input — defeating AC-1. Shallow copy preserves immutability of `raw` and is the minimal correct change. Documented in `load-and-migrate.ts` JSDoc lines 72-79 and in Debug Log (failure-1, repair-r1). **Approve.**
- **D3 — Pre-existing flaky timing test in `src/lock/integration/heartbeat-loss.test.ts`** — **acceptable** (Story 1.4 carry-over; not Story 1.5 scope). Re-running standalone produces 3/0 pass; final full-suite produces 148/0. Not a Story 1.5 regression. Continue monitoring; escalate only if reproducible failure rate climbs. **Approve.**

### Test Quality Assessment

- **Boundary coverage** — strong. State schema has explicit FIFO max-50 / max-100 boundary tests at `state.test.ts:71-96` (50 ok / 51 fail / 101 fail). Telemetry has explicit extra-field rejection (NFR-S3 anti-PII gate) at `telemetry.test.ts:63-69`. Pid file has 6 tests covering both legacy on-disk shape (no `schemaVersion`) and explicit-version shape, plus the rejection of `schemaVersion: 2`. Verifier-result enumerates the closed `pass | fail | skip` enum at both top-level and nested-check level.
- **Assertion meaningfulness** — strong. Every AC-tied test asserts not just "throws" but the structured properties of the thrown error: `err.code`, `err.exitCode`, `err.actionableHint` (verbatim string match). The two AC-2 / AC-3 verbatim-hint assertions in `migration.test.ts:152-154` and `migration.test.ts:222-225` are the source of truth for the AC contract — a regression in `src/errors.ts` hint strings would fail these tests immediately.
- **Determinism** — strong. Zero real-time waits anywhere; total wall-time across all 18 test files is ~370ms. Schema tests are pure parse-and-assert; migration tests are pure function calls; no IO; no clock manipulation; no flaky-timing patterns. (The Story 1.4 heartbeat-loss flake is not in this story's scope.)
- **AC-pinned tests** — strong. AC-1 has 5 happy-path tests including the default-schemaVersion branch. AC-2 has 3 tests (basic, verbatim-hint properties, cross-family). AC-3 has 7 tests (5 corrupt-input shapes + verbatim-hint properties + telemetry strict-rejection). AC-4 has the idempotency-enumeration loop (8 sanity tests; future-proofed for v2).
- **Cross-file fixture reuse** — clean. Each `<schema>.test.ts` exports `canonical<Family>V1Fixture`; `migration.test.ts` imports them. Dev's Task 6.3 decision to keep fixtures in test files (not separate fixture files) preserves AR35 tmpdir-isolation orthogonality and avoids creating a `src/fixtures/` directory that would break the AR41 module boundary expectations for downstream stories.

### Conclusion

Story 1.5 lands the **first source-side Zod usage** of the project — until this story, Zod 4.4.1 was pinned in `package.json` (Story 1.1) but never imported anywhere in `src/`. The story produces a **disciplined skeleton**: seven schema files, four migration registries, the cross-cutting `loadAndMigrate` operator, and the NFR-R6 idempotency-enumeration harness. It also carries forward two prior-story commitments cleanly: (a) Story 1.3 S1 — addition of `ScopeViolationError` to the registry (registry-only edit, no consumer-code regression); (b) Story 1.4 forward-compat — `PidFileV1Schema` accepts the existing on-disk pid file shape verbatim via `.optional().default(1)` on `schemaVersion`, leaving `src/lock/lock.ts` byte-identical.

All four ACs verify with concrete file:line evidence. All seven architectural conformance checks pass. All quality gates exit 0 (biome, tsc, bun test, bun run check). Manual import audit confirms AR41 module boundary cleanliness across 21 files; manual `console.*` and `: any` audits return zero hits. Three deviations (registry shape extension, schemaVersion injection, pre-existing flaky test) are all defensibly narrow and accepted. Five info findings document edge-case observations (non-integer / zero / negative schemaVersion behaviors, non-strict open-shape on non-telemetry schemas, the registry interface extensions, the Story-1.4 flaky test) that do not block release.

The implementation is **AC-conformant, architecturally clean, and ready for Story 1.6** to consume `loadAndMigrate(raw, stateMigrationRegistry)` as the entry point of the state subsystem.

**Outcome: approve.** Status flips `review → done`; sprint-status `1-5-schemas-migrations-skeleton: review → done`.
