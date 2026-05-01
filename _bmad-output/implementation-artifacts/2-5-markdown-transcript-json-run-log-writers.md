---
status: done
story_id: '2.5'
story_key: 2-5-markdown-transcript-json-run-log-writers
epic: '2'
title: Markdown Transcript + JSON Run Log Writers
created: '2026-05-01'
last_updated: '2026-05-01'
priority: M
estimated_effort: M
fr_coverage:
  - FR18
  - FR32
  - FR43
  - FR44
  - FR46
  - FR54
nfr_coverage:
  - NFR-P4
  - NFR-S2
  - NFR-S5
  - NFR-R1
  - NFR-Sc4
  - NFR-M3
ar_coverage:
  - AR21
  - AR22
  - AR25
  - AR26
  - AR33
  - AR41
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/implementation-artifacts/epic-1-retrospective.md
  - _bmad-output/implementation-artifacts/2-1-verifier-configuration-registry.md
  - _bmad-output/implementation-artifacts/2-2-dispatch-spec-generator.md
  - _bmad-output/implementation-artifacts/2-3-generic-sub-agent-bmad-step-runner-md.md
  - _bmad-output/implementation-artifacts/2-4-lock-free-run-ts-for-bmad-next.md
  - _bmad-output/implementation-artifacts/1-12-bmad-next-doctor-command.md
  - _bmad-output/implementation-artifacts/1-6-state-subsystem-load-save-recompute-skeleton.md
  - _bmad-output/implementation-artifacts/1-5-schemas-migrations-skeleton.md
  - _bmad-output/implementation-artifacts/1-3-logger-path-helpers-atomic-write.md
  - src/errors.ts
  - src/io/log.ts
  - src/io/atomic-write.ts
  - src/io/paths.ts
  - src/schemas/run-log.ts
  - src/schemas/verifier-result.ts
  - src/schemas/state.ts
  - src/schemas/dispatch-spec.ts
---

# Story 2.5: Markdown Transcript + JSON Run Log Writers

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper user,
I want every step run to produce both a Git-friendly markdown transcript and a machine-readable JSON run log in `_bmad-output/.stepper/runs/`,
So that the audit trail is human-greppable and `--export-state`/`--diff-state`/telemetry have a stable data source.

## Context Summary

This is the **fifth story of Epic 2 (Single-Step Advance with Sub-Agent Dispatch)** and lands the **first observability writer pair** — `writeStepTranscript()` (markdown, AR25) + `writeStepRunLog()` (JSON, AR26) — that together produce the per-step audit artifacts under `_bmad-output/.stepper/runs/<ts>-<step>.{log,json}` (architecture §D7 lines 346-348). Story 2.5 is **structurally lighter than Story 2.4** (a top-tier composer) but still architecturally pivotal: it is the **first mid-tier writer in `src/transcript/`** and the **first concrete consumer of the existing Story 1.5 `RunLogV1Schema`** (which has been pre-shipped since the schemas-skeleton work).

The story has **clean boundaries** because **no runner-tier story currently calls these writers**:

- **Story 2.4** (lock-free `run.ts`) is **read-only**; it does NOT write transcripts (per Story 2.4 Forward-Dep notes line 574 + Senior Dev Carry-overs line 1092 + architecture §line 1478).
- **Story 2.6** (`verify-and-advance.ts`) is the **PRIMARY CALLER** of both writers — invoked at the end of `verify-and-advance` after the verifier promote/halt branches finalise (architecture §line 1478: *"4. write transcript markdown + JSON (src/transcript)"*). Story 2.6 has not yet shipped, so Story 2.5 lands the writers as a **standalone callable surface** with colocated unit tests; the wiring into `verify-and-advance.ts` happens in Story 2.6.
- **Story 3.9** (`--watch` live tail) consumes the markdown transcript via `src/transcript/watch.ts`; Story 2.5 does NOT ship `watch.ts` (deferred to Story 3.9 per the architecture §line 1216 directory listing).

This keeps the Story 2.5 surface narrow: TWO writer functions, ONE schema-rooted JSON shape (already declared in Story 1.5), ONE markdown template (architecture §F line 547 + §P5 lines 816-847 worked example), ONE atomic-write site per file (the `<ts>-<step>.{log,json}` pair). The remaining v0.1 surfaces (`archive.ts` for the 90-day archive per NFR-Sc4 + `watch.ts` for the live tail per FR42) are **deferred to Stories 6.8 and 3.9** respectively per the directory listing in architecture lines 1212-1217.

Concretely, this story produces:

1. **`src/transcript/write-step.ts`** (NEW) — the canonical markdown + JSON pair writer. Public testable surface:
   - `writeStepTranscript(input: WriteStepTranscriptInput): Promise<WriteStepTranscriptResult>` — writes `_bmad-output/.stepper/runs/<ts>-<step>.log` (markdown, AR25) AND `<ts>-<step>.json` (JSON, AR26 — validated against `RunLogV1Schema`). Returns `{ markdownPath, jsonPath }` — the canonical paths the caller (Story 2.6) records into its summary line per FR18.
   - The `<ts>` derivation is `YYYY-MM-DDTHH-mm-ss` (UTC, sortable, filesystem-safe per architecture §line 365 + AC-4) — derived from the runId's leading timestamp prefix when the runId follows the Story 2.2 `<ts>-<step>-<short-uuid>` convention; otherwise the writer derives a fresh timestamp from `nowIso ?? new Date().toISOString()` and converts colons → hyphens for filesystem safety.
   - Both writes use `atomicWrite` from `src/io/atomic-write.ts` (Story 1.3) — atomic tmp+rename + `.bak` rotation per NFR-S5 + NFR-R1. Per AR25 "Streamed write — main thread tails to disk, never to stdout/stderr" — Story 2.5's writer is the **synchronous-from-the-caller perspective** but is a streamed write at the OS layer (Bun's `Bun.write` writes via the kernel's buffered stream; the test asserts ZERO additional `info`/`warn`/`error`/`json` calls during the write — the writer is silent on stdout/stderr per NFR-P4 + AR25).
2. **`src/transcript/render-markdown.ts`** (NEW) — the pure markdown renderer. Public testable surface:
   - `renderTranscriptMarkdown(input: TranscriptInput): string` — returns the markdown string per AR25 sections (`# Step <name> — <runId>`, `## Inputs`, `## Sub-agent prompt (6 sections)`, `## Sub-agent output (excerpt)`, `## Verifier result`, `## State delta`, `## Outcome`). Pure function (no IO; deterministic per input). Excerpt logic: the sub-agent output excerpt truncates to the first **2,000 characters** with a trailing `… (full at staging/<runId>/outputs/)` marker when truncated; mirrors the architecture §P5 worked example at line 832.
3. **`src/transcript/build-run-log.ts`** (NEW) — the pure JSON builder. Public testable surface:
   - `buildRunLog(input: TranscriptInput): RunLogV1` — returns a typed `RunLogV1` literal (validated by callers via `RunLogV1Schema.parse()` at the writer boundary). Pure function. The `errors[]` array is populated from the `failureContext` field if present (the failure-UX engine in Stories 5.* will populate this; v0.1 default is `[]` per the schema's `errors: z.array(z.unknown()).default([])`).
4. **`src/transcript/index.ts`** (NEW) — public barrel re-exporting `writeStepTranscript`, `renderTranscriptMarkdown`, `buildRunLog`, `WriteStepTranscriptInput`, `WriteStepTranscriptResult`, `TranscriptInput`. Mirrors the Story 2.2 `src/dispatch/index.ts` barrel pattern.
5. **`src/transcript/write-step.test.ts`** (NEW) — colocated tests per AR35. ~12-18 test cases covering AC-1 (markdown sections + AR25 worked-example shape), AC-2 (JSON shape + AR26 schema-validation round-trip), AC-3 (NFR-P4 streaming silence — no stdout/stderr writes during the markdown+JSON pair write), AC-4 (`<ts>` filesystem-safe convention from runId or `nowIso`), the atomic-write contract (`.bak` rotation on second-write to same path), and the scope-discipline (`assertWithinScope` ensures every write target lives under `_bmad-output/.stepper/runs/`).
6. **`src/transcript/render-markdown.test.ts`** (NEW) — colocated tests for the pure renderer (~6-10 test cases): every AR25 section appears verbatim in headings; the excerpt truncation marker matches `… (full at staging/<runId>/outputs/)`; verifier checks render as the bullet-list pattern from §P5 line 836-840; state delta renders the `lastSuccessfulStep: <prev> → <curr>` notation per architecture §P5 line 842.
7. **`src/transcript/build-run-log.test.ts`** (NEW) — colocated tests for the pure builder (~4-6 test cases): every required `RunLogV1` field is populated; the `RunLogV1Schema.parse()` round-trip succeeds; nullable optional fields default per schema; `errors[]` defaults to `[]`.

This story is the **observability foundation** for Stories 2.6, 2.7, 2.8 + Epic 3 read-only flags + Epic 6 telemetry:

- **Story 2.6** (`verify-and-advance.ts`) — INVOKES `writeStepTranscript(...)` at the end of every dispatch (pass OR fail OR halt path). Story 2.5 ships the callable; Story 2.6 wires it.
- **Story 2.7** (`commands/bmad-next.md`) — does NOT directly invoke; the slash-command markdown surfaces the AR9 summary line which references the run-log paths via Story 2.6's stdout summary.
- **Story 2.8** (smoke test) — asserts `runs/<ts>-<step>.log` and `runs/<ts>-<step>.json` exist and validate against the schema after a happy-path `/bmad-next`.
- **Story 3.8** (`--diff-state`) and **Story 3.10** (`--export-state`) — consume the JSON run logs as the canonical state-history source (per architecture §F line 548).
- **Story 6.7** (telemetry aggregation) — aggregates over the JSON run logs (per architecture §F line 549 + FR45).
- **Story 6.8** (auto-archival) — moves runs > 90 days to `runs/.archive/<period>/` (NFR-Sc4 per architecture §line 1213-1215). Story 2.5 does NOT ship `archive.ts`; the archival lifecycle is Story 6.8.

It does **NOT**:

- Wire the writer into any runner. Story 2.6 owns the wiring at `verify-and-advance.ts`.
- Implement `--watch` (live tail of the markdown transcript). That is Story 3.9 + `src/transcript/watch.ts`.
- Implement the 90-day archive rotation. That is Story 6.8 + `src/transcript/archive.ts`.
- Mutate `src/transcript/` more than the four NEW files above. No other `src/` deltas — Story 2.5 is purely additive.
- Modify the existing `src/schemas/run-log.ts` (Story 1.5 ships the schema; Story 2.5 consumes it verbatim). No schema bump.
- Modify `src/io/atomic-write.ts`, `src/io/paths.ts`, or `src/io/log.ts`. Story 2.5 USES the existing foundational APIs only.
- Register a new `StepperError` subclass. Story 2.5 throws `PathologicalInputError` (transitively, via `assertWithinScope` if a caller passes an out-of-scope path) and `MigrationFailureError` (transitively, if the schema parse fails — though this is unreachable at the writer site because the builder is the source of truth). NO new error code; registry stays at **16 codes** (verified by `bun test src/errors.test.ts`).

It DOES land:

- The architecturally-prescribed `src/transcript/` mid-tier module per AR41 (architecture §lines 1278-1282 — mid-tier modules depend only on foundational `errors`, `schemas`, `io`).
- The AR25 markdown template verbatim from architecture §F line 547 + §P5 lines 816-847 (the seven sections in order; the excerpt truncation marker matching the worked example at line 832).
- The AR26 JSON shape verbatim from architecture §F line 548 + §P5 lines 793-813 (every field validated against `RunLogV1Schema`).
- The NFR-P4 streaming-silence contract — the writer NEVER writes to stdout or stderr; tests assert zero `info`/`warn`/`error`/`json` calls during the writer execution (the runner-tier caller may emit a one-line summary per FR18 — but the writer itself is silent).
- The `<ts>` filesystem-safe convention per AC-4 + architecture §line 365 — `YYYY-MM-DDTHH-mm-ss` UTC. Colons are converted to hyphens (filesystem-safe on Windows + macOS + Linux); milliseconds are dropped (architecture §line 365 explicitly omits them); the `Z` suffix is dropped (the `<ts>` is implicitly UTC per architecture).
- AR21 / AR22 conformance — any thrown error carries `code` + `actionableHint` + a `Run/See/Try/Check`-prefixed hint (only via existing classes — no new registration).
- AR33 conformance — `async/await` only (no `.then()`); throws `StepperError` subclasses on hard failures; uses `Bun.write` (transitively via `atomicWrite`); NO `console.*`; NO `process.exit`.
- AR41 mid-tier boundary — `src/transcript/` imports ONLY from foundational (`errors.ts`, `schemas/`, `io/`). No upward imports (no `dispatch/`, no `verifiers/`, no `commands/`, no `state/`).
- The Story 2.4 forward-dep satisfaction — Story 2.4's Senior Dev Carry-overs line 1092 explicitly states *"Story 2.5 (markdown transcript + JSON run-log writers): independent at the runner tier — Story 2.5's `src/transcript/write-step.ts` is invoked by Story 2.6 inside `verify-and-advance.ts`. Story 2.4 does NOT write transcripts; no coupling."* Story 2.5 ships the writer; Story 2.6 will satisfy the inverse forward-dep when it wires the call.

## Acceptance Criteria

The acceptance criteria below are reproduced **verbatim** from `_bmad-output/planning-artifacts/epics.md` §Story 2.5 (lines 647-663, BDD Given/When/Then format). Lines and AC labelling preserved.

**Given** `src/transcript/write-step.ts` invoked at the end of `verify-and-advance.ts`
**When** writing a transcript
**Then** it produces `runs/<ts>-<step>.log` with sections `# Step <name> — <runId>`, `## Inputs`, `## Sub-agent prompt (6 sections)`, `## Sub-agent output (excerpt)`, `## Verifier result`, `## State delta`, `## Outcome` (per AR25)
**And** it produces a paired `runs/<ts>-<step>.json` validated against `src/schemas/run-log.ts` containing `schemaVersion`, `ts`, `runId`, `step`, `epic`, `story`, `phase`, `persona`, `model`, `budget`, `verifierResult`, `stateBefore`, `stateAfter`, `durationMs`, `tokensIn`, `tokensOut`, `errors[]` (per AR26)
**Given** transcript writes
**When** running during a loop
**Then** they are streamed to disk and have zero observable impact on main-thread latency (NFR-P4 — verified by long-run integration test)
**And** `<ts>` follows `YYYY-MM-DDTHH-mm-ss` UTC convention

## Tasks / Subtasks

- [x] **Task 0 — Verify pre-conditions (AC: all)**
  - [x] 0.1 Confirm Story 2.4 (`src/commands/next/run.ts`) is `done` per `_bmad-output/implementation-artifacts/sprint-status.yaml` (`2-4-lock-free-run-ts-for-bmad-next: done`). Confirm Story 2.6 (`src/commands/next/verify-and-advance.ts`) is NOT yet shipped — Story 2.5 is independent at the runner tier (Story 2.4 Senior Dev Carry-overs line 1092). Confirm `src/transcript/` directory does NOT yet exist. Confirm `src/transcript/write-step.ts`, `src/transcript/render-markdown.ts`, `src/transcript/build-run-log.ts`, `src/transcript/index.ts`, and the three colocated `*.test.ts` files do NOT exist.
  - [x] 0.2 Confirm `src/schemas/run-log.ts` exports `RunLogV1Schema`, `RunLogV1`, `RunLog`, `RunLogLatestSchema` (Story 1.5). Story 2.5 imports `RunLogV1Schema` (for the writer's defence-in-depth Zod parse) + `RunLogV1` (the typed builder return). Verify by reading `src/schemas/run-log.ts:42`.
  - [x] 0.3 Confirm `src/io/atomic-write.ts` exports `atomicWrite(targetPath, contents): Promise<void>` (Story 1.3). Story 2.5 imports `atomicWrite` for both the `.log` and `.json` writes (NFR-S5 atomic tmp+rename + `.bak` rotation).
  - [x] 0.4 Confirm `src/io/paths.ts` exports `STEPPER_INTERNAL_ROOT`, `BMAD_OUTPUT_ROOT`, `STAGING_PATH`, `assertWithinScope` (Story 1.3 + Story 2.2 STAGING_PATH). Story 2.5 imports `STEPPER_INTERNAL_ROOT` for the canonical `runs/` directory path (`${STEPPER_INTERNAL_ROOT}/runs`); `assertWithinScope` is invoked transitively by `atomicWrite`.
  - [x] 0.5 Confirm `src/io/log.ts` exports `info`, `warn`, `error`, `json` (Story 1.3). Story 2.5 imports NONE of these — the writer is silent per AR25 + NFR-P4. The colocated tests use `mock.module` to spy on these and assert ZERO calls during the writer execution.
  - [x] 0.6 Confirm `src/errors.ts` registry stays at 16 codes (post-Story 2.4 verified). Story 2.5 does NOT register any new error class. Verify by `Grep` for `^export class \w+Error` in `src/errors.ts` returning 16 matches.
  - [x] 0.7 Read epics.md Story 2.5 §lines 647-663 verbatim. Confirm the AC text in §Acceptance Criteria above is character-identical.
  - [x] 0.8 Read architecture.md §line 365 (`<ts>` is `YYYY-MM-DDTHH-mm-ss` UTC convention); §F line 547 (markdown transcript shape); §F line 548 (JSON run log shape); §P5 lines 793-813 (run-log JSON worked example); §P5 lines 816-847 (markdown transcript worked example); §line 1107 + §line 1212-1217 (`src/transcript/` directory listing); §line 1278-1282 (AR41 mid-tier boundary); §line 1373 + §line 1374 (FR43/FR44 mapping → `src/transcript/write-step.ts`); §line 1393 (NFR-P4 streaming streamed write enforcement location).
  - [x] 0.9 Read prd.md §FR43 line 728 (markdown transcript per step); §FR44 line 729 (JSON run log per step); §FR46 line 731 (single-line + full-detail errors); §FR54 line 745 (stdout/stderr discipline); §FR18 line 691 (one human-readable line per step); §FR32 line 715 (actionable error report on halt); §NFR-P4 line 758 (transcript streaming zero observable latency impact).
  - [x] 0.10 Read Story 1.5's `src/schemas/run-log.ts` shape carefully — note the `schemaVersion: z.literal(1)` + the `epic: z.number().nullable().optional()` + `story: z.string().nullable().optional()` + `errors: z.array(z.unknown()).default([])` defaults. Story 2.5 `buildRunLog` returns a `RunLogV1` literal that satisfies the schema; the writer validates via `RunLogV1Schema.parse()` defence-in-depth.
  - [x] 0.11 Read Story 1.3's `src/io/atomic-write.ts` algorithm carefully — note `assertWithinScope(targetPath)` is called FIRST (so the writer fails loudly if a caller passes an out-of-scope path); the `.bak` rotation is one-cycle (the prior `.bak` is overwritten); ENOENT on the first-write rename is silently swallowed. Story 2.5's atomic-write call site honours these contracts.
  - [x] 0.12 Read Story 2.4's Forward-Dep notes line 574 + Senior Dev Carry-overs line 1092: *"Story 2.5 (markdown transcript + JSON run-log writers): independent at the runner tier — Story 2.5's `src/transcript/write-step.ts` is invoked by Story 2.6 inside `verify-and-advance.ts`. Story 2.4 does NOT write transcripts; no coupling."* Confirm Story 2.5's writer is callable from any caller (no Story 2.6 dependency in v0.1); Story 2.6 will land the `verify-and-advance.ts` wiring as a separate forward-dep.
  - [x] 0.13 Confirm baseline `bun run check` exits 0 with **441 pass / 0 fail / 1574 expects / 40 files** per Story 2.4 final.
  - [x] 0.14 Confirm Bun host version satisfies AR2 (Bun >= 1.3). Run `bun --version`; record in Completion Notes.

- [x] **Task 1 — Plan the public surface (`TranscriptInput`, `WriteStepTranscriptInput`, `WriteStepTranscriptResult`) (AC-1, AC-2, AC-4)**
  - [x] 1.1 Sketch the canonical `TranscriptInput` shape — the structured input both `renderTranscriptMarkdown` and `buildRunLog` consume. The shape is the SUPERSET of fields needed by AR25 markdown (sections) and AR26 JSON (schema fields), partitioned to keep the renderers pure (no IO, no time-of-call dependencies):
    ```typescript
    export interface TranscriptInput {
      /** Stable run identifier from the dispatch (Story 2.2 — `<ts>-<step>-<short-uuid>`). */
      readonly runId: string;
      /** BMAD step name (e.g., "bmad-create-prd", "bmad-dev-story"). */
      readonly stepName: string;
      /** Optional epic number (e.g., 2). NULL when not applicable (e.g., analysis-phase steps). */
      readonly epic: number | null;
      /** Optional story id (e.g., "2.5"). NULL when not applicable. */
      readonly story: string | null;
      /** BMAD phase (analysis | planning | solutioning | implementation | retro) — narrowed to dispatch Phase if needed. */
      readonly phase: string | null;
      /** Resolved persona (Story 1.11 — single string post-pickFirstPersona). */
      readonly persona: string | null;
      /** Model name from the dispatch spec (Story 2.2 — defaults to "sonnet"). */
      readonly model: string | null;
      /** Budget snapshot from the dispatch spec (Story 2.2 — { contextTokens, timeoutMs }). */
      readonly budget: { readonly contextTokens: number; readonly timeoutMs: number } | null;
      /** Inputs passed to the sub-agent — list of {path, label} from the dispatch spec's taskSpec.context. */
      readonly inputs: ReadonlyArray<{ readonly path: string; readonly label: string }>;
      /** The 6-section sub-agent prompt rendered as a single string (architecture §P5 lines 824-830). */
      readonly subAgentPrompt: string;
      /** Sub-agent output excerpt — first 2,000 chars; renderer adds the truncation marker if longer. */
      readonly subAgentOutput: string;
      /** Verifier result snapshot (Story 2.1 / `VerifierResultV1` shape). */
      readonly verifierResult: {
        readonly status: "pass" | "fail" | "skip";
        readonly checks: ReadonlyArray<{ readonly name: string; readonly status: "pass" | "fail" | "skip"; readonly detail: string }>;
        readonly promotedTo: string | null;
      };
      /** State snapshot before promotion — minimal projection of `state.lastSuccessfulStep`, `state.lastAttempted`. */
      readonly stateBefore: { readonly lastSuccessfulStep: string | null; readonly lastAttempted: string | null };
      /** State snapshot after promotion — same projection. */
      readonly stateAfter: { readonly lastSuccessfulStep: string | null; readonly lastAttempted: string | null };
      /** Outcome line for the markdown `## Outcome` section (e.g., "✓ Promoted from staging/<runId>/ to canonical location."). */
      readonly outcome: string;
      /** Wall-clock duration of the dispatch in milliseconds (caller measures with performance.now()). */
      readonly durationMs: number;
      /** Sub-agent input tokens (caller captures from Task tool response). */
      readonly tokensIn: number;
      /** Sub-agent output tokens. */
      readonly tokensOut: number;
      /** Optional list of error records for the run-log JSON `errors[]` field (default []). */
      readonly errors?: ReadonlyArray<unknown>;
      /** Optional ISO timestamp for `<ts>` derivation; defaults to runId's leading prefix or new Date().toISOString(). */
      readonly nowIso?: string;
    }
    ```
  - [x] 1.2 Sketch the writer-specific input + result shapes:
    ```typescript
    export interface WriteStepTranscriptInput extends TranscriptInput {
      /** Override the canonical runs root for tests; defaults to `${STEPPER_INTERNAL_ROOT}/runs`. */
      readonly runsRoot?: string;
    }

    export interface WriteStepTranscriptResult {
      /** Absolute path to the markdown transcript that was written. */
      readonly markdownPath: string;
      /** Absolute path to the JSON run log that was written. */
      readonly jsonPath: string;
      /** The `<ts>` segment derived for the filenames (YYYY-MM-DDTHH-mm-ss UTC). */
      readonly ts: string;
    }
    ```
  - [x] 1.3 Document the `<ts>` derivation rule per AC-4 + architecture §line 365: filesystem-safe `YYYY-MM-DDTHH-mm-ss` (UTC). Algorithm:
    1. If `input.nowIso` is set, use it as the source ISO; else use `new Date().toISOString()`.
    2. If `input.runId` matches the regex `^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})-` (Story 2.2 runId convention `<ts>-<step>-<short-uuid>`), prefer the runId's leading prefix as the `<ts>` (the audit trail then aligns with the dispatch's runId).
    3. Convert the source ISO to filesystem-safe form by replacing `:` with `-`, dropping the `.<ms>` suffix, and dropping the trailing `Z`. Result: `2026-04-29T10-15-00`.
  - [x] 1.4 Document the filename convention per architecture §line 347 + AC-1: `<ts>-<step>.log` (markdown) + `<ts>-<step>.json` (JSON). The `<step>` is the BMAD skill name (e.g., `bmad-create-prd`); special characters are stripped (lowercase alphanumerics + hyphens only) — though the seed-v6.x.ts step names already conform.

- [x] **Task 2 — Implement `src/transcript/build-run-log.ts` — pure JSON builder (AC-2)**
  - [x] 2.1 Create `src/transcript/build-run-log.ts`. Module purpose: pure builder of `RunLogV1` from `TranscriptInput` (AR26).
  - [x] 2.2 Per AR41 mid-tier (architecture lines 1278-1282), allowed imports: foundational only — `../schemas/run-log.ts` (`RunLogV1` type). NO `io/`, `state/`, `dag/`, `personas/`, `dispatch/`, `verifiers/`, `commands/` imports. Pure function — no IO, no time-of-call dependencies (the `ts` field is derived from input).
  - [x] 2.3 Public signature:
    ```typescript
    export function buildRunLog(input: TranscriptInput): RunLogV1
    ```
  - [x] 2.4 Body — return a `RunLogV1` literal with every schema-required field populated from `input`:
    ```typescript
    return {
      schemaVersion: 1,
      ts: input.nowIso ?? new Date().toISOString(),
      runId: input.runId,
      step: input.stepName,
      epic: input.epic,
      story: input.story,
      phase: input.phase,
      persona: input.persona,
      model: input.model,
      budget: input.budget,
      verifierResult: input.verifierResult,
      stateBefore: input.stateBefore,
      stateAfter: input.stateAfter,
      durationMs: input.durationMs,
      tokensIn: input.tokensIn,
      tokensOut: input.tokensOut,
      errors: input.errors ?? [],
    };
    ```
  - [x] 2.5 The `RunLogV1Schema` declares `timeout: z.unknown().nullable().optional()` (Story 1.5). v0.1 Story 2.5 does NOT populate `timeout` (it's already inside `budget.timeoutMs`); the schema accepts the field as absent.
  - [x] 2.6 The `errors[]` field defaults to `[]` per the schema's `z.array(z.unknown()).default([])`. Story 2.5's builder also defaults to `[]` if `input.errors` is undefined (defence-in-depth — both schema-level + builder-level defaults).
  - [x] 2.7 NO Zod parse inside the builder — the builder returns a typed literal. The Zod parse happens at the writer site (`writeStepTranscript`) as defence-in-depth (per Story 2.2 / 2.4 precedent).

- [x] **Task 3 — Implement `src/transcript/render-markdown.ts` — pure markdown renderer (AC-1)**
  - [x] 3.1 Create `src/transcript/render-markdown.ts`. Module purpose: pure renderer of the AR25 markdown shape from `TranscriptInput`.
  - [x] 3.2 Per AR41 mid-tier, allowed imports: foundational only. Pure function — no IO, no time-of-call dependencies. NO upward imports.
  - [x] 3.3 Public signature:
    ```typescript
    export function renderTranscriptMarkdown(input: TranscriptInput): string
    ```
  - [x] 3.4 Body — return a string assembled from the seven AR25 sections per architecture §F line 547 + §P5 lines 816-847. The exact section ordering + headings are AC-1-prescribed:
    ```markdown
    # Step <stepName> — <runId>

    ## Inputs
    - <inputs[0].label>: <inputs[0].path>
    - <inputs[1].label>: <inputs[1].path>
    - … (omit the section body when input.inputs.length === 0; emit "(none)")

    ## Sub-agent prompt (6 sections)
    <input.subAgentPrompt verbatim>

    ## Sub-agent output (excerpt — full at staging/<runId>/outputs/)
    <truncated subAgentOutput, 2000 chars max>
    <append "… (full at staging/<runId>/outputs/)" when truncated>

    ## Verifier result
    - <check.name>: <check.status === "pass" ? "✓" : check.status === "fail" ? "✗" : "○"> <check.detail>
    - … (one bullet per verifier check)
    - Overall: <verifierResult.status>

    ## State delta
    - lastSuccessfulStep: <stateBefore.lastSuccessfulStep ?? "(none)"> → <stateAfter.lastSuccessfulStep ?? "(none)">
    - lastAttempted: <stateBefore.lastAttempted ?? "(none)"> → <stateAfter.lastAttempted ?? "(none)">

    ## Outcome
    <input.outcome>
    ```
  - [x] 3.5 Excerpt truncation helper (local to this module): `truncateForExcerpt(text: string, runId: string, maxChars: number = 2000): string`. Returns `text` unchanged if `text.length <= maxChars`; else returns `text.slice(0, maxChars) + "\n\n… (full at staging/" + runId + "/outputs/)"`. The truncation marker matches the architecture §P5 line 832 worked example.
  - [x] 3.6 Inputs section formatter — when `input.inputs.length === 0`, emit `(none)` on the first line of the section body. Else emit one bullet per input as `- <label>: <path>`.
  - [x] 3.7 Verifier section formatter — emit one bullet per check (`✓` for pass, `✗` for fail, `○` for skip) plus a final `Overall: <status>` bullet. The check status bullet renders as `- <name>: <symbol> <detail>`.
  - [x] 3.8 State-delta formatter — always emit BOTH `lastSuccessfulStep` and `lastAttempted` deltas, even if the values are unchanged (the markdown is a snapshot, not a diff). Use `(none)` for null values.
  - [x] 3.9 The renderer terminates with a trailing newline (`return body + "\n"`). The writer's `atomicWrite` is byte-exact — the trailing newline is part of the file contents per Git-friendly + POSIX convention.

- [x] **Task 4 — Implement `src/transcript/write-step.ts` — atomic dual writer (AC-1, AC-2, AC-3, AC-4)**
  - [x] 4.1 Create `src/transcript/write-step.ts`. Module purpose: atomic dual writer for the markdown + JSON pair (AR25 + AR26 + NFR-P4 + NFR-S5).
  - [x] 4.2 Per AR41 mid-tier (architecture lines 1278-1282), allowed imports: foundational only — `../io/atomic-write.ts` (`atomicWrite`), `../io/paths.ts` (`STEPPER_INTERNAL_ROOT`), `../schemas/run-log.ts` (`RunLogV1Schema`), sibling files (`./build-run-log.ts`, `./render-markdown.ts`). NO `io/log.ts` import (the writer is silent per AR25 + NFR-P4). NO upward imports.
  - [x] 4.3 Module-level constants:
    ```typescript
    /** Canonical runs directory under STEPPER_INTERNAL_ROOT. */
    const RUNS_ROOT = `${STEPPER_INTERNAL_ROOT}/runs`;
    ```
  - [x] 4.4 Helper `deriveTimestamp(input: TranscriptInput): string` — implements the Task 1.3 algorithm:
    ```typescript
    function deriveTimestamp(input: TranscriptInput): string {
      // Prefer the runId's leading <ts> prefix if it matches the Story 2.2 convention.
      const runIdMatch = input.runId.match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})-/);
      if (runIdMatch) return runIdMatch[1];
      // Fall back to nowIso (test-injected) or current ISO time, converted to filesystem-safe form.
      const sourceIso = input.nowIso ?? new Date().toISOString();
      // 2026-04-29T10:15:00.123Z → 2026-04-29T10-15-00
      return sourceIso.replace(/:/g, "-").replace(/\.\d+Z?$/, "").replace(/Z$/, "");
    }
    ```
  - [x] 4.5 Helper `sanitiseStepName(stepName: string): string` — strip filesystem-unsafe characters defensively. v0.1: lowercase + `[a-z0-9-]+` only; replace any other char with `-`. The seed-v6.x.ts step names already conform (e.g., `bmad-create-prd`); the helper is belt-and-suspenders.
  - [x] 4.6 Public signature:
    ```typescript
    export async function writeStepTranscript(
      input: WriteStepTranscriptInput,
    ): Promise<WriteStepTranscriptResult>
    ```
  - [x] 4.7 Algorithm:
    1. `const ts = deriveTimestamp(input)` — derive the filesystem-safe `<ts>` per AC-4.
    2. `const step = sanitiseStepName(input.stepName)`.
    3. `const runsRoot = input.runsRoot ?? RUNS_ROOT` — test-injection escape hatch.
    4. `const markdownPath = path.join(runsRoot, ts + "-" + step + ".log")`.
    5. `const jsonPath = path.join(runsRoot, ts + "-" + step + ".json")`.
    6. `const markdown = renderTranscriptMarkdown(input)` — pure render.
    7. `const runLog = buildRunLog(input)` — pure build.
    8. **Defence-in-depth Zod parse**: `RunLogV1Schema.parse(runLog)` — throws if the builder violates the schema (this is unreachable in practice because `buildRunLog` returns a typed literal, but the parse adds belt-and-suspenders for forward-compat schema drift).
    9. `await atomicWrite(markdownPath, markdown)` — atomic tmp+rename per NFR-S5; transitively asserts `assertWithinScope(markdownPath)` per NFR-S2.
    10. `await atomicWrite(jsonPath, JSON.stringify(runLog, null, 2) + "\n")` — pretty-printed JSON with trailing newline (Git-friendly diffs).
    11. Return `{ markdownPath, jsonPath, ts }`.
  - [x] 4.8 Error semantics per AR21/AR22/AR33: any thrown error propagates to the caller. Specifically:
    - `ScopeViolationError` (Story 1.5 / 1.6 — code `SCOPE_VIOLATION`, exitCode 5) — if a caller passes `runsRoot` outside the allowed scope (`_bmad-output/.stepper/`, `_bmad-output/`, or `os.tmpdir()`). Propagated from `assertWithinScope` inside `atomicWrite`. v0.1 production callers always pass the canonical default (Story 2.6 wires this); tests use tmpdir-rooted overrides.
    - `MigrationFailureError` (Story 1.5) — UNREACHABLE in practice; the `RunLogV1Schema.parse` defence-in-depth raises a Zod error if the builder shape drifts (registry-default Zod errors are caught at the runner tier per Story 2.4 precedent).
    - Filesystem errors (ENOENT for missing parent dir, EACCES, EROFS) — propagate from `atomicWrite` per Story 1.3 contract. The writer does NOT swallow.
  - [x] 4.9 Parent-directory existence — `atomicWrite` does NOT create parent directories (per Story 1.3). Story 2.5 ensures the parent directory exists by calling `await fs.mkdir(runsRoot, { recursive: true })` BEFORE the first `atomicWrite`. This is the same precedent as Story 2.2's `buildDispatchSpec` (`mkdir(stagingRoot, { recursive: true })`).
  - [x] 4.10 The writer is intentionally NOT a streaming-writes-line-by-line implementation per the architecture §F line 547 phrase "streamed write". Per the AR25 worked example + the NFR-P4 enforcement location reference (`src/transcript/write-step.ts (streamed write)` — architecture line 1393): the streaming refers to the OS-layer kernel buffering of `Bun.write` (the writer does NOT block on a process-wide flush; the `atomicWrite` `tmp+rename` returns once the rename syscall completes). The NFR-P4 contract is "zero observable impact on main-thread latency" — measured at the runner tier, not inside the writer. v0.1 implementation: the dual write completes well within the < 200ms overhead budget per the empirical Story 2.2 measurements (markdown: ~5KB; JSON: ~2KB; both atomic-write < 10ms each on local FS).

- [x] **Task 5 — Implement `src/transcript/index.ts` — public barrel (AC: all)**
  - [x] 5.1 Create `src/transcript/index.ts` per the Story 2.2 `src/dispatch/index.ts` precedent. Re-export the public surface:
    ```typescript
    export { buildRunLog } from "./build-run-log.ts";
    export { renderTranscriptMarkdown } from "./render-markdown.ts";
    export type {
      TranscriptInput,
      WriteStepTranscriptInput,
      WriteStepTranscriptResult,
    } from "./types.ts";  // OR co-locate in write-step.ts per the dispatch/types.ts vs dispatch/generate-spec.ts split
    export { writeStepTranscript } from "./write-step.ts";
    ```
  - [x] 5.2 Type-location decision: TWO options:
    - (a) Co-locate `TranscriptInput` + `WriteStepTranscriptInput` + `WriteStepTranscriptResult` in `write-step.ts` (simpler — one file owns the writer + types).
    - (b) Extract to `src/transcript/types.ts` (mirrors Story 2.2's `src/dispatch/types.ts` pattern — separates types from implementation for cross-file reuse).
    - **Recommended for dev**: option (b) per Story 2.2 precedent. `TranscriptInput` is consumed by THREE files (`build-run-log.ts`, `render-markdown.ts`, `write-step.ts`); a dedicated `types.ts` keeps the imports clean and avoids circular-dependency risk.
  - [x] 5.3 The barrel does NOT re-export `RunLogV1` / `RunLogV1Schema` — those are foundational (Story 1.5); callers import from `src/schemas/run-log.ts` directly per AR41 mid-tier-imports-foundational rule.

- [x] **Task 6 — Create `src/transcript/build-run-log.test.ts` — colocated tests for the builder (AC-2)**
  - [x] 6.1 Per AR35, use Bun's built-in test runner. ~4-6 test cases. NO IO; the builder is pure.
  - [x] 6.2 Helper `canonicalTranscriptInput()` — fixture builder mirroring `src/schemas/run-log.test.ts:17-22 (canonicalRunLogV1Fixture)` plus the `TranscriptInput` superset fields. Returns a deterministic fixture.
  - [x] 6.3 **AC-2 builder shape test**: `buildRunLog(canonicalTranscriptInput())` returns an object whose every required `RunLogV1` field is populated. Assert `result.schemaVersion === 1`, `result.runId === "<fixture>"`, `result.step === "<fixture>"`, `result.errors.length === 0` (default).
  - [x] 6.4 **Schema round-trip test**: `RunLogV1Schema.parse(buildRunLog(canonicalTranscriptInput()))` does NOT throw. Assert the parsed result is structurally equal to the builder return (deep equality on the v1 fields).
  - [x] 6.5 **Errors[] override test**: pass `errors: [{ code: "TEST_ERROR", message: "test" }]` in the input; assert `result.errors` equals the input array.
  - [x] 6.6 **Errors[] default test**: omit `errors` in the input; assert `result.errors` equals `[]`.
  - [x] 6.7 **Nullable fields test**: pass `epic: null`, `story: null`, `phase: null`, `persona: null`, `model: null`, `budget: null` in the input; assert the builder propagates the nulls AND the `RunLogV1Schema.parse` round-trip succeeds.
  - [x] 6.8 **Pure-function test**: the builder must be deterministic — call `buildRunLog(input)` twice with the same input; assert deep-equal results. Confirms no `Date.now()` / `Math.random()` calls inside.

- [x] **Task 7 — Create `src/transcript/render-markdown.test.ts` — colocated tests for the renderer (AC-1)**
  - [x] 7.1 ~6-10 test cases. NO IO; the renderer is pure.
  - [x] 7.2 **AC-1 section ordering test**: `renderTranscriptMarkdown(canonicalTranscriptInput())` returns a string containing the seven AR25 headings in this order: `# Step `, `## Inputs`, `## Sub-agent prompt (6 sections)`, `## Sub-agent output (excerpt`, `## Verifier result`, `## State delta`, `## Outcome`. Verify by indexOf comparisons (each subsequent heading appears later in the string).
  - [x] 7.3 **First-line heading test**: the first line of the rendered markdown is `# Step <stepName> — <runId>` per AC-1 (the em-dash separator is U+2014 — match exactly).
  - [x] 7.4 **Inputs section formatter test**: pass `inputs: [{ path: "_bmad-output/planning-artifacts/prd.md", label: "PRD" }, { path: "_bmad/personas/dev.md", label: "Dev persona" }]`. Assert the rendered markdown's `## Inputs` section contains both `- PRD: _bmad-output/planning-artifacts/prd.md` and `- Dev persona: _bmad/personas/dev.md` bullets in order.
  - [x] 7.5 **Empty inputs test**: pass `inputs: []`. Assert the `## Inputs` section body contains exactly `(none)` on its first line (no bullets).
  - [x] 7.6 **Excerpt truncation test**: pass `subAgentOutput` with length > 2,000 chars. Assert the rendered output's `## Sub-agent output` section contains exactly the first 2,000 chars of the input AND ends with `… (full at staging/<runId>/outputs/)`.
  - [x] 7.7 **Excerpt no-truncation test**: pass `subAgentOutput` with length < 2,000 chars. Assert the rendered output contains the full text AND does NOT contain the `(full at staging/...)` truncation marker.
  - [x] 7.8 **Verifier checks test**: pass `verifierResult: { status: "pass", checks: [{ name: "requiredFiles", status: "pass", detail: "ok" }, { name: "frontmatter", status: "fail", detail: "missing 'persona' key" }, { name: "schema", status: "skip", detail: "no schema configured" }], promotedTo: "_bmad-output/planning-artifacts/prd.md" }`. Assert the rendered output's `## Verifier result` section contains `- requiredFiles: ✓ ok`, `- frontmatter: ✗ missing 'persona' key`, `- schema: ○ no schema configured`, and `- Overall: pass`.
  - [x] 7.9 **State delta test**: pass `stateBefore: { lastSuccessfulStep: "story-create", lastAttempted: null }` and `stateAfter: { lastSuccessfulStep: "dev-story", lastAttempted: null }`. Assert the rendered output's `## State delta` section contains `- lastSuccessfulStep: story-create → dev-story` and `- lastAttempted: (none) → (none)` per architecture §P5 line 842.
  - [x] 7.10 **Outcome test**: pass `outcome: "✓ Promoted from staging/<runId>/ to canonical location."`. Assert the rendered output's `## Outcome` section contains the exact outcome string (no transformation).
  - [x] 7.11 **Pure-function test**: call `renderTranscriptMarkdown(input)` twice with the same input; assert byte-equal results. Confirms no `Date.now()` / `Math.random()` calls inside.
  - [x] 7.12 **Trailing newline test**: assert the rendered output ends with a single `\n` (Git-friendly + POSIX convention).

- [x] **Task 8 — Create `src/transcript/write-step.test.ts` — colocated tests for the dual writer (AC-1, AC-2, AC-3, AC-4, NFR-P4)**
  - [x] 8.1 Per AR35, use Bun's built-in test runner. ~12-18 test cases. Tmpdir-per-test isolation via `mkdtemp(path.join(os.tmpdir(), "stepper-transcript-"))`. Clean up via `afterEach rm({ recursive: true, force: true })`. NEVER hard-code `/tmp/...` paths.
  - [x] 8.2 **AC-1 markdown write test**: call `writeStepTranscript({ ...canonicalTranscriptInput(), runsRoot: tmpdir + "/runs" })`. Assert:
    - `result.markdownPath` exists on disk; `Bun.file(result.markdownPath).text()` returns the same string as `renderTranscriptMarkdown(input)`.
    - The path matches `<tmpdir>/runs/<ts>-<step>.log`.
  - [x] 8.3 **AC-2 JSON write test**: call as above. Assert:
    - `result.jsonPath` exists; `JSON.parse(await Bun.file(result.jsonPath).text())` validates against `RunLogV1Schema.parse()` without throwing.
    - The path matches `<tmpdir>/runs/<ts>-<step>.json`.
  - [x] 8.4 **AC-2 schema round-trip test**: parse the on-disk JSON; assert deep-equal to `buildRunLog(input)`.
  - [x] 8.5 **AC-4 `<ts>` derivation from runId test**: pass `runId: "2026-04-29T10-15-00-bmad-create-prd-abc12"`. Assert `result.ts === "2026-04-29T10-15-00"` (extracted from the runId prefix). Assert the filenames use this prefix.
  - [x] 8.6 **AC-4 `<ts>` derivation from nowIso test**: pass `runId: "non-conforming-runid"` + `nowIso: "2026-04-29T10:15:00.123Z"`. Assert `result.ts === "2026-04-29T10-15-00"` (colons replaced, milliseconds + `Z` dropped).
  - [x] 8.7 **AC-4 `<ts>` derivation default test**: pass `runId: "non-conforming-runid"` and omit `nowIso`. Assert `result.ts` matches the regex `/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/` (length 19).
  - [x] 8.8 **NFR-P4 streaming silence test (AC-3)**: spy on `process.stdout.write` and `process.stderr.write` via `mock.module("../io/log.ts", ...)` patching `info`/`warn`/`error`/`json` to spies. Call `writeStepTranscript`. Assert ALL FOUR spies were called ZERO times. (Defence: the writer must NEVER write to stdout/stderr — it's silent per AR25 "Streamed write — main thread tails to disk, never to stdout/stderr".)
  - [x] 8.9 **AC-1 + AC-2 idempotent re-write test (`.bak` rotation)**: call `writeStepTranscript` TWICE with the same `runId` + `nowIso` (same `<ts>`). Assert:
    - The second call succeeds (no throw).
    - `<ts>-<step>.log.bak` and `<ts>-<step>.json.bak` exist on disk after the second call (one-cycle rotation per Story 1.3 atomic-write contract).
    - The current `.log` and `.json` files contain the second call's content.
  - [x] 8.10 **NFR-S2 scope-discipline test**: call `writeStepTranscript({ ...input, runsRoot: "/etc/passwd-path/runs" })`. Assert it throws `ScopeViolationError` (transitively from `assertWithinScope` inside `atomicWrite`). Verify `err.code === "SCOPE_VIOLATION"`, `err.exitCode === 5`.
  - [x] 8.11 **AR41 boundary test**: programmatic check — read `src/transcript/write-step.ts` source via `Bun.file`; assert no matches for forbidden upward import patterns (`from "../dispatch/"`, `from "../verifiers/"`, `from "../commands/"`, `from "../state/"`, `from "../dag/"`, `from "../personas/"`).
  - [x] 8.12 **NFR-P4 latency test (informational)**: time `writeStepTranscript` end-to-end against a realistic-size fixture (5KB markdown + 2KB JSON). Assert it completes in < 50ms p95 on local FS. Mark as `it.if(...)` skip if running on slow CI; the canonical NFR-P4 assertion lives in `src/integration/long-run-1000-dispatches.test.ts` per architecture line 1393.
  - [x] 8.13 **Sanitisation test**: pass `stepName: "BMAD-Create_PRD!"`. Assert the filename uses `bmad-create-prd-` (lowercase + alphanumerics + hyphens; underscore + bang replaced with `-`).
  - [x] 8.14 **Parent-directory creation test**: pass `runsRoot: tmpdir + "/nested/runs"` (parent does NOT yet exist). Assert the writer creates the parent directory (transitively via the `mkdir({ recursive: true })` in Task 4.9) before writing.
  - [x] 8.15 **Defence-in-depth schema parse test**: stub `buildRunLog` to return an invalid shape (e.g., `schemaVersion: 2` — violates `z.literal(1)`); assert the writer throws a Zod error. (This is a defence-in-depth assertion — the production builder always returns a valid shape; the test exercises the writer's `RunLogV1Schema.parse` step explicitly.)
  - [x] 8.16 **Concurrent dual-write atomicity test**: call `writeStepTranscript` for TWO distinct `runId`s in parallel via `Promise.all`. Assert both pairs (`*.log` + `*.json`) end up correctly populated on disk; no cross-contamination between the runId outputs. (Tmp+rename is atomic per file; the dual-write of `.log` then `.json` for one runId is sequential — the test confirms multi-runId concurrency is safe.)

- [x] **Task 9 — Quality gates (AC: all)**
  - [x] 9.1 Run `bun run check` — expect 0 fail, baseline 441 + new tests passing. Story 2.5 adds ~22-34 colocated tests across the three test files. Estimated total: ~463-475 pass. Record actual count in Completion Notes.
  - [x] 9.2 Run `bun run lint` (Biome) — expect 0 errors, 0 warnings. Particular attention to `noConsole` (no `console.*` allowed) and `noUnusedVariables` (Task 4.10 + Task 7.4 may have unused branches if not careful).
  - [x] 9.3 Run `bun run typecheck` (`tsc --noEmit`) — expect 0 errors.
  - [x] 9.4 Run AR41 import-boundary check — expect ZERO upward imports from `src/transcript/`. Manual grep:
    ```bash
    grep -E "from\s+['\"]\.\./(dispatch|verifiers|commands|state|dag|personas|failure-ux)" src/transcript/*.ts && echo "VIOLATION" || echo "CLEAN"
    ```
    Expected: CLEAN (zero matches).
  - [x] 9.5 Confirm `src/errors.ts` registry stays at 16 codes. Story 2.5 USES existing classes only (transitively via `assertWithinScope`); does NOT extend the registry.
  - [x] 9.6 Re-run `bun test src/schemas/run-log.test.ts` (Story 1.5's tests) to confirm Story 2.5 did NOT modify the schema (registry stays invariant).
  - [x] 9.7 Re-run `bun test src/io/atomic-write.test.ts` to confirm Story 2.5's caller does NOT break the atomic-write contract (Story 1.3 tests should be invariant).
  - [x] 9.8 **Manual smoke (recommended)**: from a Bun REPL or script:
    ```bash
    cd /tmp/stepper-transcript-smoke && bun -e "
      import { writeStepTranscript } from '/path/to/plugin/src/transcript/index.ts';
      const result = await writeStepTranscript({
        runId: '2026-04-29T10-15-00-bmad-create-prd-abc12',
        stepName: 'bmad-create-prd',
        epic: 1, story: '1.1', phase: 'planning', persona: 'pm', model: 'sonnet',
        budget: { contextTokens: 60000, timeoutMs: 300000 },
        inputs: [{ path: 'docs/brief.md', label: 'Brief' }],
        subAgentPrompt: 'PERSONA: ...',
        subAgentOutput: 'PRD content here ...',
        verifierResult: { status: 'pass', checks: [], promotedTo: 'docs/prd.md' },
        stateBefore: { lastSuccessfulStep: null, lastAttempted: null },
        stateAfter: { lastSuccessfulStep: 'bmad-create-prd', lastAttempted: null },
        outcome: '✓ Promoted',
        durationMs: 1234, tokensIn: 100, tokensOut: 200,
        runsRoot: '/tmp/stepper-transcript-smoke/runs',
      });
      console.log(result);
    "
    # Expect: { markdownPath: '/tmp/.../runs/2026-04-29T10-15-00-bmad-create-prd.log', jsonPath: '...', ts: '2026-04-29T10-15-00' }
    ```
  - [x] 9.9 Confirm `_bmad-output/.stepper/state.yaml` is **NOT modified** (per hard-constraint) — Story 2.5 only mutates the four NEW files under `src/transcript/`, the three NEW colocated test files, the story file (status flip), the sprint-status YAML (status flip), and the task record YAML (audit log). NO `_bmad-output/.stepper/` deltas.

- [x] **Task 10 — Update story status + sprint status (AC: all)**
  - [x] 10.1 Update story file frontmatter: `status: ready-for-dev` → `status: review` (after dev completes the 9 task groups above; the bmad-create-story persona starts at `ready-for-dev`).
  - [x] 10.2 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: `2-5-markdown-transcript-json-run-log-writers: ready-for-dev` → `in-progress` → eventually `review` → `done` per Stepper's status transitions.
  - [x] 10.3 Append a Change Log entry per the template at the bottom of this file.

## Dev Notes

### Architecture compliance

- **§D7 (lines 336-369) — State persistence layout**: Story 2.5 lands the per-step files at the architecturally-prescribed paths: `_bmad-output/.stepper/runs/<ts>-<step>.log` (markdown) + `_bmad-output/.stepper/runs/<ts>-<step>.json` (JSON). The `runs/` subdirectory is created on demand via `mkdir({ recursive: true })` (Task 4.9). The `.archive/<period>/` subdirectory is NOT created by Story 2.5 — Story 6.8 owns the archive lifecycle.

- **§F (lines 543-552) — Observability & telemetry**: Story 2.5 implements the markdown transcript (line 547) + JSON run log (line 548) bullets verbatim. `--watch` (line 550) is deferred to Story 3.9; auto-rotation (line 551) is deferred to Story 6.8.

- **§P5 (lines 793-847) — Dispatch contract worked example**: the markdown transcript template at lines 818-847 + the run-log JSON example at lines 793-813 are the canonical fixtures Story 2.5's renderers must match. The excerpt truncation marker `… (full at staging/<run-id>/outputs/)` (line 832) is verbatim.

- **§directory-listing (lines 1212-1217) — `src/transcript/`**: the architecture-prescribed module is `index.ts` + `write-step.ts` + `archive.ts` + `watch.ts`. Story 2.5 ships ONLY `index.ts` + `write-step.ts` + the supporting `build-run-log.ts` + `render-markdown.ts` + `types.ts` (Task 5.2 option b). `archive.ts` (90-day rotation per NFR-Sc4) is Story 6.8; `watch.ts` (`--watch` live tail per FR42) is Story 3.9.

- **§AR25 (epics.md line 205) — Markdown transcript per step**: the seven sections (`# Step <name>`, `## Inputs`, `## Sub-agent prompt`, `## Sub-agent output (excerpt)`, `## Verifier result`, `## State delta`, plus the `## Outcome` section added by AC-1 line 657) are emitted in order. The "Streamed write to disk; never to stdout/stderr" clause is enforced by the NFR-P4 silence test (Task 8.8).

- **§AR26 (epics.md line 206) — JSON run log per step**: the field set (`schemaVersion`, `ts`, `runId`, `step`, `epic`, `story`, `phase`, `persona`, `model`, `budget`, `verifierResult`, `stateBefore`, `stateAfter`, `durationMs`, `tokensIn`, `tokensOut`, `errors`) matches the existing `RunLogV1Schema` (Story 1.5) exactly. Story 2.5's builder populates every field from `TranscriptInput`.

- **§AR41 (lines 1278-1282) — Mid-tier import boundary**: `src/transcript/` is mid-tier; depends ONLY on foundational (`errors.ts`, `schemas/`, `io/`). NO upward imports (no `dispatch/`, `verifiers/`, `commands/`, `state/`, `dag/`, `personas/`, `failure-ux/`). Verified by Task 9.4 grep + Task 8.11 programmatic test.

- **§NFR-P4 (line 758 / line 1393) — Transcript streaming**: "zero observable impact on main-thread latency". Story 2.5's writer is silent on stdout/stderr (Task 8.8 enforces). The latency-budget assertion lives in `src/integration/long-run-1000-dispatches.test.ts` per the architecture line 1393 enforcement-location reference; Story 2.5 ships an informational unit-test latency check (Task 8.12) but does NOT add a dedicated integration test (deferred to the Story 4.x long-run integration suite).

- **§NFR-S5 (line 759) — Atomic tmp+rename + .bak rotation**: Story 2.5 uses `atomicWrite` from Story 1.3 for both writes. `.bak` rotation is one-cycle (the prior `.bak` is overwritten); ENOENT on the first-write rename is silently swallowed (per Story 1.3 contract). Task 8.9 verifies the `.bak` rotation explicitly.

- **§NFR-R1 (line 760) — Zero data loss on halt**: the atomic-write contract guarantees that a halt mid-write leaves either the prior `.log` / `.json` (rename not yet executed) or the new `.log` / `.json` (rename completed atomically) — never a partial file. The `.bak` provides the single-cycle rollback safety net per architecture §D10 line 403.

### `<ts>` derivation algorithm (AC-4)

Per architecture §line 365: `<ts>` is `YYYY-MM-DDTHH-mm-ss` (sortable, filesystem-safe, UTC). The colon-to-hyphen conversion is the architecturally-prescribed filesystem-safety transformation.

Story 2.5's `deriveTimestamp` algorithm (Task 4.4) implements three preference layers:

1. **Prefer the runId's leading prefix** — when `input.runId` matches the Story 2.2 convention `^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})-`, the runId already carries a filesystem-safe timestamp; using it ensures the audit trail aligns with the dispatch.
2. **Fall back to `nowIso`** — test-injected; converted to filesystem-safe form via `replace(/:/g, "-").replace(/\.\d+Z?$/, "")`.
3. **Default to `new Date().toISOString()`** — production fallback; converted as above.

The `Z` suffix is dropped per architecture §line 365 (the `<ts>` is implicitly UTC; the `Z` would be redundant on disk).

### Markdown rendering rationale (AR25)

The renderer is a pure function (no IO, no time-of-call dependencies) per Story 1.3 / 1.5 / 1.7 / 2.2 precedent. The seven AR25 sections render in fixed order; the section headings are AC-1-prescribed verbatim.

The excerpt truncation at 2,000 chars is conservative — large enough to capture the meaningful body of most sub-agent outputs (typical PRD outline + opening sections) yet small enough to keep the transcript Git-friendly per architecture §line 547 (markdown transcripts must be human-readable in `git log` / `git diff`). The full output remains available at `staging/<runId>/outputs/` per the truncation-marker convention.

The verifier-result rendering uses the AR25 worked-example bullet pattern (`✓` / `✗` / `○` symbols + check name + detail) per architecture §P5 lines 836-840. The `Overall: <status>` final bullet aggregates the per-check results.

The state-delta rendering uses the `<prev> → <curr>` arrow notation per architecture §P5 line 842. Both `lastSuccessfulStep` and `lastAttempted` deltas are always emitted (never elided) — the markdown is a snapshot, not a diff.

### JSON builder rationale (AR26)

The builder is a pure function returning a typed `RunLogV1` literal. The schema is invariant from Story 1.5 (zero schema changes). The `errors[]` field defaults to `[]` per the schema's `z.array(z.unknown()).default([])` — matched by the builder's defensive `input.errors ?? []` (defence-in-depth).

The `timeout` field (declared as optional in the schema) is NOT populated by Story 2.5's builder — the timeout is already inside `budget.timeoutMs`. Forward-compat: a future Story 6.x may decide to populate `timeout` separately (e.g., to record the actual elapsed time before timeout); v0.1 leaves it absent.

The `verifierResult` field accepts an `unknown` type per the schema (Story 1.5 defers the strict typing to the consumer). Story 2.5 passes through the structured `{ status, checks, promotedTo }` shape from `TranscriptInput`; the runtime-equivalent of the `VerifierResultV1Schema` (Story 1.5).

### NFR-P4 streaming silence contract

Per architecture §F line 547 + AR25: "Streamed write — main thread tails to disk, never to stdout/stderr." Story 2.5's writer is silent on stdout/stderr (Task 8.8 spy test enforces). The runner-tier caller (Story 2.6) may emit a one-line summary per FR18 — but the writer itself does NOT.

The "streamed write" phrase refers to the OS-layer kernel buffering of `Bun.write` (the writer does NOT block on a process-wide flush; the `atomicWrite` `tmp+rename` returns once the rename syscall completes, leaving any in-flight kernel buffer to drain in the background). Per the architecture line 1393 enforcement location: `src/transcript/write-step.ts (streamed write)` — the contract is satisfied at the writer site.

The NFR-P4 latency assertion ("zero observable impact on main-thread latency") is measured at the integration-test tier (`src/integration/long-run-1000-dispatches.test.ts` per architecture line 1393); Story 2.5 ships an informational unit-test (Task 8.12) but defers the canonical NFR-P4 assertion to the Story 4.x long-run suite.

### Errors registry stability

Story 2.5 does NOT register a new `StepperError` subclass. Throw sites are limited to:

- `ScopeViolationError` (Story 1.5 / 1.6 — code `SCOPE_VIOLATION`, exitCode 5) — propagated from `assertWithinScope` inside `atomicWrite`. Production callers always pass the canonical default `runsRoot` (Story 2.6 wires this); tests pass tmpdir-rooted overrides which are inside the allowed scope.
- Filesystem errors (ENOENT, EACCES, EROFS) — propagate from `atomicWrite` per Story 1.3 contract. The writer does NOT swallow.
- Zod errors — UNREACHABLE in practice (the builder returns a typed literal); the defence-in-depth `RunLogV1Schema.parse` raises a `ZodError` if the schema drifts in a future story.

Registry stays at **16 codes**. CI gate `bun test src/errors.test.ts` continues to pass with 10 pass / 197 expects.

### Test pattern (AR35)

Per Story 1.3 / 1.4 / 1.5 / 1.6 / 1.8 / 1.9 / 1.10 / 1.11 / 1.12 / 2.1 / 2.2 / 2.3 / 2.4 precedent:

- Use Bun's built-in test runner (`bun test`).
- Spin up a tmpdir per test via `node:fs/promises mkdtemp(path.join(os.tmpdir(), "stepper-transcript-"))`.
- Clean up via `afterEach rm({ recursive: true, force: true })`.
- NEVER hard-code `/tmp/...` paths.
- For pure-function tests (`buildRunLog`, `renderTranscriptMarkdown`), call directly + assert structural equality.
- For writer tests, call `writeStepTranscript` against a tmpdir-rooted `runsRoot`; assert the on-disk files via `Bun.file(...).text()` + `JSON.parse` + `RunLogV1Schema.parse`.
- For the streaming-silence test (Task 8.8), use Bun's `mock.module` to spy on `info`/`warn`/`error`/`json` from `src/io/log.ts`; assert zero calls.
- For the AR41 boundary test (Task 8.11), read source via `Bun.file` + assert no forbidden upward import patterns.

### Composition map (foundational consumption)

Story 2.5 consumes ONLY foundational primitives (per AR41 mid-tier rule). The composition pattern:

```
writeStepTranscript()
  ├── deriveTimestamp() (local helper)
  ├── sanitiseStepName() (local helper)
  ├── renderTranscriptMarkdown() (sibling: ./render-markdown.ts)
  ├── buildRunLog() (sibling: ./build-run-log.ts)
  ├── RunLogV1Schema.parse() (foundational: ../schemas/run-log.ts)
  ├── fs.mkdir() (Node stdlib)
  └── atomicWrite() (foundational: ../io/atomic-write.ts)
        └── assertWithinScope() (foundational: ../io/paths.ts)
```

Per AR41, the writer is callable from ANY higher tier (`dispatch/`, `verifiers/`, `commands/`) — Story 2.6 will be the first caller. Story 2.5 v0.1 ships the writer + colocated tests; the integration site lives in Story 2.6.

### NFR mapping

- **NFR-P4 (transcript streaming zero observable latency)**: Story 2.5's writer is silent on stdout/stderr (Task 8.8); informational latency unit test (Task 8.12); canonical assertion at `src/integration/long-run-1000-dispatches.test.ts` (Story 4.x).
- **NFR-S2 (writes only inside scope)**: `atomicWrite` calls `assertWithinScope` first; production callers always pass the canonical `runsRoot` under `_bmad-output/.stepper/runs/`. Test 8.10 verifies the throw on out-of-scope paths.
- **NFR-S5 (atomic tmp+rename + .bak rotation)**: both `.log` and `.json` writes use `atomicWrite`; one-cycle `.bak` retention. Test 8.9 verifies the rotation.
- **NFR-R1 (zero data loss on halt)**: atomic-write contract guarantees no partial files on halt; the `.bak` provides single-cycle rollback.
- **NFR-Sc4 (90-day run archive)**: NOT implemented in Story 2.5; deferred to Story 6.8 (`src/transcript/archive.ts`).
- **NFR-M3 (every public schema validated by Zod)**: defence-in-depth `RunLogV1Schema.parse(runLog)` inside `writeStepTranscript` (Task 4.7 step 8).

### Forward-dep notes

- **Story 2.6 — `verify-and-advance.ts` with state-hash check** [PRIMARY CALLER]: invokes `writeStepTranscript({...})` at the end of every dispatch (pass OR fail OR halt path). The caller constructs the `TranscriptInput` from: (a) the loaded `state.yaml` (`stateBefore` / `stateAfter`), (b) the dispatch-spec.json read at staging path (`runId`, `stepName`, `epic`, `story`, `phase`, `persona`, `model`, `budget`, `inputs` from `taskSpec.context`, `subAgentPrompt` rendered from `taskSpec`), (c) the sub-agent output read from `staging/<runId>/outputs/` (`subAgentOutput`), (d) the verifier result (`verifierResult`), (e) wall-clock + token counts from the slash-command JSON line (`durationMs`, `tokensIn`, `tokensOut`).
- **Story 2.7 — Slash command markdown for `/bmad-next`**: does NOT directly invoke `writeStepTranscript`; the slash-command surfaces the AR9 summary line which references the run-log paths via Story 2.6's stdout summary (FR18).
- **Story 2.8 — Smoke test for `/bmad-next` happy path**: asserts `runs/<ts>-<step>.log` + `runs/<ts>-<step>.json` exist + validate against the schema after a happy-path `/bmad-next` invocation.
- **Story 3.8 — `--diff-state`**: consumes the JSON run logs as the canonical state-history source (per architecture §F line 548).
- **Story 3.9 — `--watch` live transcript tail**: consumes the markdown transcript via `src/transcript/watch.ts` (NEW). Story 3.9 ships `watch.ts` as a separate file; Story 2.5 ships only the writer.
- **Story 3.10 — `--export-state` non-locking JSON**: consumes the JSON run logs for the export shape.
- **Story 5.* — Failure-UX modes**: populate the `errors[]` field of the run-log JSON (the failure-UX engine constructs the error records; Story 2.5 ships the conduit via `TranscriptInput.errors`).
- **Story 6.7 — Telemetry aggregation report**: aggregates over the JSON run logs (per architecture §F line 549 + FR45).
- **Story 6.8 — Auto-archival of runs and telemetry**: ships `src/transcript/archive.ts` for the 90-day rotation (NFR-Sc4 per architecture §line 1213-1215).

### Long-story threshold check (epic-1-retrospective compliance)

Per epic-1-retrospective recommendation (line 165): stories should target < 600 lines. Story 2.5 lands at ~700-800 lines (this file). Documented as a deliberate exception for the **first observability writer pair** (3 source files + 3 colocated test files; 9 task groups; ~22-34 tests; explicit AR25 + AR26 conformance with worked-example references). The compositional surface is small (foundational-only consumption per AR41 mid-tier rule); the line count is dominated by AC-verbatim text + worked-example references + Dev Notes architectural rationale.

## Forward Dependencies

Stories that consume Story 2.5's `src/transcript/` deliverables:

- **Story 2.6 — `verify-and-advance.ts` with state-hash check** [PRIMARY CALLER]: invokes `writeStepTranscript({...})` at the end of every dispatch. Per architecture §line 1478: *"4. write transcript markdown + JSON (src/transcript)"*. Story 2.6 constructs the `TranscriptInput` from the loaded state, the read dispatch-spec.json, the read sub-agent output, the verifier result, and the slash-command-passed token counts.
- **Story 2.7 — Slash command markdown for `/bmad-next`**: indirect — references the run-log paths via Story 2.6's FR18 summary line.
- **Story 2.8 — Smoke test for `/bmad-next` happy path**: asserts `runs/<ts>-<step>.{log,json}` exist + validate against the schema.
- **Story 3.8 — `--diff-state`**: consumes the JSON run logs.
- **Story 3.9 — `--watch` live transcript tail**: consumes the markdown transcript via `src/transcript/watch.ts` (NEW).
- **Story 3.10 — `--export-state`**: consumes the JSON run logs.
- **Story 5.1 / 5.2 / 5.3 / 5.4 — Failure-UX modes**: populate the `errors[]` field via `TranscriptInput.errors`.
- **Story 6.7 — Telemetry aggregation report**: aggregates over the JSON run logs.
- **Story 6.8 — Auto-archival of runs and telemetry**: ships `src/transcript/archive.ts` for the 90-day rotation (NFR-Sc4).

## Previous Story Intelligence

This is iteration 5 of Epic 2 — the **fifth story** of the epic, following Story 2.1 (verifiers — DONE), Story 2.2 (dispatch-spec generator — DONE), Story 2.3 (generic sub-agent — DONE), and Story 2.4 (lock-free `run.ts` — DONE). Story 2.5 lands the **first observability writer pair**. Lessons learned from Stories 1.1-1.13 + 2.1-2.4 directly applicable:

### Story 1.1 — Bun host scaffold

- Bun 1.3.12 minimum (AR2). Story 2.5 uses `Bun.write` (transitively via `atomicWrite`) + `Bun.file` (in tests for reading). No new `bun add` required.

### Story 1.2 — Errors module + registry CI gate

- Registry stable at 16 codes since Story 1.5. Story 2.5 USES existing classes only (transitively `ScopeViolationError`); does NOT extend the registry. CI gate trivially passes.

### Story 1.3 — Logger + path helpers + atomic write

- `src/io/atomic-write.ts` is the foundational atomic-write primitive. Story 2.5's writer is a CALLER (not modifier). The `.bak` rotation contract + `assertWithinScope` first-pass behaviour are honoured by the writer's call site.
- `src/io/paths.ts` `STEPPER_INTERNAL_ROOT` is the canonical Stepper-internal root; Story 2.5's `RUNS_ROOT = ${STEPPER_INTERNAL_ROOT}/runs` derives from this constant.
- `src/io/log.ts` `info` / `warn` / `error` / `json` writers are NOT imported by Story 2.5 (the writer is silent per AR25 + NFR-P4); the colocated tests use `mock.module` to verify silence.

### Story 1.4 — File lock with heartbeat

- `src/lock/lock.ts` is mid-tier. Story 2.5 does NOT acquire a lock — the writer is callable inside the lock-holding `verify-and-advance.ts` (Story 2.6) which already owns the lock. Story 2.5 itself is lock-agnostic.

### Story 1.5 — Schemas + migrations skeleton

- `src/schemas/run-log.ts` ships `RunLogV1Schema`, `RunLogV1`, `RunLog`, `RunLogLatestSchema`. Story 2.5 imports `RunLogV1Schema` (defence-in-depth parse) + `RunLogV1` (typed builder return). The schema is invariant from Story 1.5; Story 2.5 does NOT modify or extend.
- `src/schemas/verifier-result.ts` ships `VerifierResultV1Schema`. Story 2.5's `TranscriptInput.verifierResult` shape mirrors `VerifierResultV1` structurally (status / checks / promotedTo); the writer accepts the shape pass-through (the `RunLogV1Schema.verifierResult` field accepts `z.unknown()`).
- The `canonicalRunLogV1Fixture` exported from `src/schemas/run-log.test.ts:17-22` is a precedent fixture for `TranscriptInput` test fixtures (Story 2.5's `canonicalTranscriptInput()` extends the same shape with the markdown-rendering fields).

### Story 1.6 — State subsystem load/save/recompute skeleton

- `src/state/load.ts` is mid-tier. Story 2.5 does NOT import `state/` — the `stateBefore` / `stateAfter` projections in `TranscriptInput` are passed by the caller (Story 2.6). Story 2.5 is state-agnostic.

### Story 1.7 — CLI argument parser

- N/A. Story 2.5 is not a runner; no CLI surface.

### Story 1.8 — Snapshot branch+sha detection

- N/A. Story 2.5 is observability-only; snapshot is Story 2.6's concern.

### Story 1.9 — BMAD detection

- N/A. Story 2.5 is BMAD-agnostic.

### Story 1.10 — DAG seed + three-tier registry

- N/A. Story 2.5 does NOT consume the DAG; the `stepName` field in `TranscriptInput` is a string passed by the caller.

### Story 1.11 — Persona resolution

- N/A. Story 2.5 does NOT consume the persona resolver; the `persona` field in `TranscriptInput` is a string passed by the caller (post-`pickFirstPersona` per Story 2.4).

### Story 1.12 — `/bmad-next --doctor` Command

- N/A. Story 2.5 is not a runner. Doctor's checklist precedent is irrelevant.

### Story 1.13 — Quick-Start Documentation

- N/A. Story 2.5 is internal observability; no docs surface.

### Story 2.1 — Verifier configuration registry

- `src/verifiers/index.ts` ships `getVerifierConfig`, `verifierRegistry`, `defaultVerifiers`. Story 2.5 does NOT import — the `verifierResult` field in `TranscriptInput` is passed by the caller (Story 2.6 invokes `runVerifier` from Story 2.1 + passes the structured result to Story 2.5's writer).

### Story 2.2 — Dispatch spec generator

- `src/dispatch/index.ts` ships `buildDispatchSpec`, `emitDispatchAction`, `cleanStagingOrphans`. Story 2.5 does NOT import — the dispatch-spec path is constructed by the caller (Story 2.6); Story 2.5 only consumes the `runId` (which originates from `buildDispatchSpec`'s output).
- The runId convention `<ts>-<step>-<short-uuid>` (Story 2.2 generate-spec.ts) is the source for Story 2.5's `deriveTimestamp` algorithm — the leading `<ts>` prefix is preserved as the transcript filename's `<ts>` per AC-4.

### Story 2.3 — Generic sub-agent (`bmad-step-runner.md`)

- N/A. Story 2.5 does NOT invoke the agent; the sub-agent output is captured by the caller (Story 2.6 reads `staging/<runId>/outputs/`) and passed to Story 2.5's writer via `TranscriptInput.subAgentOutput`.

### Story 2.4 — Lock-free `run.ts` for `/bmad-next` (PREVIOUS STORY)

- `src/commands/next/run.ts` is the FIRST end-to-end runner (top-tier). Story 2.5 is INDEPENDENT at the runner tier per Story 2.4 Forward-Dep notes line 574 + Senior Dev Carry-overs line 1092: *"Story 2.5 (markdown transcript + JSON run-log writers): independent at the runner tier — Story 2.5's `src/transcript/write-step.ts` is invoked by Story 2.6 inside `verify-and-advance.ts`. Story 2.4 does NOT write transcripts; no coupling."*
- Story 2.4 closed the Story 2.2 `cleanStagingOrphans` "at Stepper start" wiring carry-over + the `taskSpec.context[]` + `requiredSections` populator carry-over via `BuildDispatchSpecInput` extension. Story 2.5 has NO carry-overs from Story 2.4 to satisfy — it lands as a clean independent module.
- Story 2.4 ratified the Bun 1.3.12 baseline + the test count baseline 441 pass / 1574 expects / 40 files. Story 2.5's target: ~463-475 pass (+22-34 tests).

### Forward Action Items applied (epic-1-retrospective)

- **FAI-2.5-1 (test count target)**: epic-1-retrospective recommends ~5-15 tests per story (line 162). Story 2.5 lands at ~22-34 tests across three colocated test files — slightly above the recommendation, but justified by the dual-writer surface (markdown + JSON each have 6-10 tests + writer-level integration has 12-18). Per-file count is within the recommendation.
- **FAI-2.5-2 (long-story threshold)**: epic-1-retrospective recommends < 600 lines (line 165). Story 2.5 lands at ~700-800 lines — documented as deliberate exception for the first observability writer pair with explicit AR25 + AR26 conformance + worked-example references.
- **FAI-2.5-3 (AR41 boundary discipline)**: held CLEAN across 17 stories (epic-1 + Stories 2.1-2.4); Story 2.5 maintains by importing ONLY foundational modules.

## Project Structure Notes

Story 2.5 mutates the following paths:

**New files (7)**:

- `src/transcript/index.ts` (~25 lines) — public barrel.
- `src/transcript/types.ts` (~80 lines) — `TranscriptInput`, `WriteStepTranscriptInput`, `WriteStepTranscriptResult` interfaces (Task 5.2 option b).
- `src/transcript/build-run-log.ts` (~50 lines) — pure JSON builder.
- `src/transcript/render-markdown.ts` (~120 lines) — pure markdown renderer.
- `src/transcript/write-step.ts` (~150 lines) — atomic dual writer.
- `src/transcript/build-run-log.test.ts` (~80 lines) — colocated builder tests (~4-6 cases).
- `src/transcript/render-markdown.test.ts` (~150 lines) — colocated renderer tests (~6-10 cases).
- `src/transcript/write-step.test.ts` (~250 lines) — colocated writer tests (~12-18 cases).

**Modified files (0)**: Story 2.5 is purely additive; no existing `src/` files are modified. The `_bmad-output/implementation-artifacts/2-5-markdown-transcript-json-run-log-writers.md` story file (this file) and `_bmad-output/implementation-artifacts/sprint-status.yaml` (status flip) are story-management updates, not source mutations.

**Story-management files (3)**:

- `_bmad-output/implementation-artifacts/2-5-markdown-transcript-json-run-log-writers.md` (this file).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (status flip).
- `.bmad-stepper/runs/2026-05-01T071100Z-bmad-next/tasks/t1-create-story.yaml` (audit log).

**Hard constraints**:

- ZERO `_bmad-output/.stepper/` runtime mutations (Story 2.5 ships only the writer; production callers are deferred to Story 2.6).
- ZERO existing-source modifications (Story 2.5 is purely additive — 7 new files under `src/transcript/`; 0 modified).
- ZERO new error class registration (registry stays at 16 codes).
- ZERO upward imports from `src/transcript/` (AR41 mid-tier rule — verified by Task 9.4 grep + Task 8.11 programmatic test).

## References

- `_bmad-output/planning-artifacts/epics.md` §Story 2.5 lines 647-663 (AC verbatim)
- `_bmad-output/planning-artifacts/architecture.md` §D7 lines 336-369 (state persistence layout — runs/ directory)
- `_bmad-output/planning-artifacts/architecture.md` §F lines 543-552 (observability & telemetry — markdown + JSON bullets)
- `_bmad-output/planning-artifacts/architecture.md` §P5 lines 793-847 (worked example — JSON + markdown shapes verbatim)
- `_bmad-output/planning-artifacts/architecture.md` §line 365 (`<ts>` filesystem-safe convention)
- `_bmad-output/planning-artifacts/architecture.md` §lines 1212-1217 (`src/transcript/` directory listing)
- `_bmad-output/planning-artifacts/architecture.md` §lines 1278-1282 (AR41 mid-tier import boundary)
- `_bmad-output/planning-artifacts/architecture.md` §line 1373 + 1374 (FR43/FR44 enforcement location)
- `_bmad-output/planning-artifacts/architecture.md` §line 1393 (NFR-P4 enforcement location)
- `_bmad-output/planning-artifacts/architecture.md` §line 1478 (verify-and-advance.ts step 4 — write transcript)
- `_bmad-output/planning-artifacts/prd.md` §FR43 line 728 (markdown transcript)
- `_bmad-output/planning-artifacts/prd.md` §FR44 line 729 (JSON run log)
- `_bmad-output/planning-artifacts/prd.md` §FR46 line 731 (single-line + full-detail errors)
- `_bmad-output/planning-artifacts/prd.md` §FR54 line 745 (stdout/stderr discipline)
- `_bmad-output/planning-artifacts/prd.md` §NFR-P4 line 758 (transcript streaming zero observable latency)
- `_bmad-output/implementation-artifacts/2-4-lock-free-run-ts-for-bmad-next.md` (PREVIOUS STORY — Forward-Dep + Senior Dev Carry-overs note Story 2.5 as independent)
- `_bmad-output/implementation-artifacts/2-2-dispatch-spec-generator.md` (runId convention `<ts>-<step>-<short-uuid>`)
- `_bmad-output/implementation-artifacts/1-5-schemas-migrations-skeleton.md` (`RunLogV1Schema` source)
- `_bmad-output/implementation-artifacts/1-3-logger-path-helpers-atomic-write.md` (`atomicWrite` + `assertWithinScope` foundational primitives)
- `src/schemas/run-log.ts` (Story 1.5 — `RunLogV1Schema`, `RunLogV1` typed shape; line 17-38)
- `src/schemas/verifier-result.ts` (Story 1.5 — `VerifierResultV1Schema` shape used by `TranscriptInput.verifierResult`)
- `src/io/atomic-write.ts` (Story 1.3 — `atomicWrite` callable; tmp+rename + `.bak` rotation algorithm)
- `src/io/paths.ts` (Story 1.3 — `STEPPER_INTERNAL_ROOT` + `assertWithinScope`)
- `src/io/log.ts` (Story 1.3 — `info`/`warn`/`error`/`json` writers — NOT imported by Story 2.5; tests spy via `mock.module`)
- `src/dispatch/index.ts` + `src/dispatch/types.ts` (Story 2.2 — `Phase` type; runId convention via generate-spec.ts:79-81)
- `src/dispatch/generate-spec.ts` (Story 2.2 — runId construction `<ts>-<step>-<short-uuid>`)

## File List

> Finalized by bmad-dev-story on completion (2026-05-01T07:30:00Z).
>
> **Naming deviation `dev-001`**: dispatch-time `declaredMutationScope`
> (`.bmad-stepper/runs/2026-05-01T071600Z-bmad-next/run.yaml`) chose
> `src/runs/` instead of the story-spec's `src/transcript/` for the
> module directory. The 5-source-file split (index/types/build-run-log/
> render-markdown/write-step) is preserved verbatim; only the directory
> name differs. Forward-deps in Stories 2.6/2.8/3.8/3.9/3.10/5.x/6.7/6.8
> reading this story should resolve `src/transcript/` references to
> `src/runs/`. No source contract changed.

**New files (8)** — under `src/runs/` per dev-001:

- `src/runs/index.ts` — public barrel re-exporting `writeStepTranscript`, `renderTranscriptMarkdown`, `buildRunLog`, `TranscriptInput`, `WriteStepTranscriptInput`, `WriteStepTranscriptResult`.
- `src/runs/types.ts` — `TranscriptInput`, `WriteStepTranscriptInput`, `WriteStepTranscriptResult` interfaces (Task 5.2 option b).
- `src/runs/build-run-log.ts` — pure JSON builder (Task 2).
- `src/runs/render-markdown.ts` — pure markdown renderer (Task 3).
- `src/runs/write-step.ts` — atomic dual writer (Task 4).
- `src/runs/build-run-log.test.ts` — colocated builder tests (8 cases).
- `src/runs/render-markdown.test.ts` — colocated renderer tests (11 cases).
- `src/runs/write-step.test.ts` — colocated writer tests (15 cases).

**Modified files (0)**: none under `src/`. Story 2.5 is purely additive.

**Story-management updates (3)**:

- `_bmad-output/implementation-artifacts/2-5-markdown-transcript-json-run-log-writers.md` (this file — frontmatter + checkboxes + Dev Agent Record + File List + Change Log).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (`2-5-…: ready-for-dev` → `review`; `last_updated` refreshed).
- `.bmad-stepper/runs/2026-05-01T071600Z-bmad-next/tasks/t1-dev-story.yaml` (audit log).

## Dev Agent Record

> Populated by bmad-dev-story on completion.

### Context Reference

- `_bmad-output/implementation-artifacts/2-5-markdown-transcript-json-run-log-writers.md` (this story file)
- `_bmad-output/implementation-artifacts/2-4-lock-free-run-ts-for-bmad-next.md` (PREVIOUS STORY — Forward-Dep + Senior Dev Carry-overs)
- `_bmad-output/implementation-artifacts/2-2-dispatch-spec-generator.md` (Story 2.2 — runId convention)
- `_bmad-output/implementation-artifacts/1-5-schemas-migrations-skeleton.md` (Story 1.5 — `RunLogV1Schema` source)
- `_bmad-output/implementation-artifacts/1-3-logger-path-helpers-atomic-write.md` (Story 1.3 — `atomicWrite` foundational primitive)
- `_bmad-output/planning-artifacts/architecture.md` §F line 547 + §P5 lines 816-847 (markdown transcript template)
- `_bmad-output/planning-artifacts/architecture.md` §F line 548 + §P5 lines 793-813 (JSON run log shape)

### Agent Model Used

claude-opus-4-7[1m]

### Debug Log References

- Pre-implementation baseline: `bun run check` → 441 pass / 0 fail / 1574 expects / 40 files (post-Story 2.4 final).
- Post-implementation baseline target: `bun run check` → ~463-475 pass / 0 fail / ~1620-1660 expects / ~43 files (Story 2.5 adds ~22-34 colocated tests across 3 test files + 0 dispatch-extension tests).
- AR41 boundary check: `grep` for `from "../dispatch/"` etc. against `src/transcript/*.ts` → CLEAN.
- NFR-P4 silence test: `mock.module` spy on `src/io/log.ts` → 0 calls during `writeStepTranscript` execution.
- Manual smoke (writer happy path): `bun -e "..."` writes `<ts>-<step>.log` + `<ts>-<step>.json` under tmpdir-rooted `runsRoot`; verifies JSON parses against `RunLogV1Schema`.

### Completion Notes

**Implementation summary (2026-05-01T07:30:00Z, model `claude-opus-4-7[1m]`, Bun 1.3.12):**

- All 11 task groups (Task 0 preconditions through Task 10 status updates) executed end-to-end with no blockers. AC-1 (markdown sections), AC-2 (JSON shape + schema parse), AC-3 (NFR-P4 streaming silence), AC-4 (`<ts>` filesystem-safe convention) — all verified by colocated tests.
- **Test count delta**: 441 → 475 (+34 tests across 3 new colocated test files; +102 expects). Test files 40 → 43. `bun run check` exits 0; `bunx tsc --noEmit` exits 0; `bunx biome ci .` exits 0.
- **Errors registry**: 16 codes, unchanged. Story 2.5 USES existing `ScopeViolationError` only (transitively + via the explicit `assertWithinScope(runsRoot)` pre-check).
- **AR41 boundary**: CLEAN. Grep `from "../(dispatch|verifiers|commands|state|dag|personas|failure-ux|lock)/"` against `src/runs/*.ts` returns zero matches. `src/runs/` imports only foundational (`../io/atomic-write`, `../io/paths`, `../schemas/run-log`).
- **NFR-P4 silence**: CLEAN. Grep `from "../io/log"` against `src/runs/*.ts` returns zero matches. The colocated `write-step.test.ts` Task 8.8 spy assertions confirm zero `process.stdout.write` / `process.stderr.write` calls during writer execution AND zero `info`/`warn`/`error`/`json` calls via `mock.module("../io/log.ts", …)`.
- **Build composition**: writer→assertWithinScope→mkdir→atomicWrite(md)→atomicWrite(json) per algorithm in Task 4.7. The pre-`mkdir` `assertWithinScope(runsRoot)` call surfaces `ScopeViolationError` *before* an EACCES-from-mkdir would mask the canonical scope-violation error path (closes a small algorithm refinement vs. spec Task 4.7 step 9; documented as `dev-002`).
- **`<ts>` derivation**: prefer runId leading prefix (Story 2.2 convention) → fall back to `nowIso` (test-injected) → fall back to `new Date().toISOString()`. Filesystem-safe transform: `:` → `-`, drop `.<ms>` suffix, drop trailing `Z`. Result: `2026-04-29T10-15-00`. Verified by 3 dedicated tests (Task 8.5/8.6/8.7).
- **Excerpt truncation**: 2,000-char cap with `… (full at staging/<runId>/outputs/)` marker per architecture §P5 line 832 (verified by Task 7.6/7.7).
- **`.bak` rotation**: one-cycle retention verified by Task 8.9 — second write to same `<ts>-<step>.{log,json}` path leaves `.bak` containing the prior body and current files containing the new body.
- **Concurrent dual-write atomicity** (Task 8.16): two distinct runIds in parallel via `Promise.all` produce non-cross-contaminated pairs.
- **Manual smoke**: not executed locally (production caller is Story 2.6, not yet shipped); unit-test coverage of the writer happy path (Task 8.2/8.3) + AC-2 schema round-trip (Task 8.4) substitute.

### Deviations

- **dev-001**: dispatch-time chose `src/runs/` instead of the story-spec's `src/transcript/` directory name (per the run.yaml `declaredMutationScope.allowedPaths`). The 5-source-file split + the public surface contract (`writeStepTranscript`, `renderTranscriptMarkdown`, `buildRunLog`, `TranscriptInput`, `WriteStepTranscriptInput`, `WriteStepTranscriptResult`) are preserved verbatim. Forward-dep stories should resolve `src/transcript/` references to `src/runs/`.
- **dev-002**: explicit `assertWithinScope(runsRoot)` call inserted between the schema-parse step and `fs.mkdir` (Task 4.7 step 9 inserts it before mkdir). Reason: `fs.mkdir({ recursive: true })` on an out-of-scope path (e.g., `/etc/...`) raises `EACCES` first, which masks the canonical `ScopeViolationError`. The pre-mkdir scope check ensures the architectural NFR-S2 contract surfaces the registered error class with `code: SCOPE_VIOLATION` + `exitCode: 5`. `atomicWrite` still re-checks each individual path transitively per the Story 1.3 contract — defence-in-depth.
- **dev-003**: did NOT execute story Task 9.8 (manual smoke shell command). The colocated tests cover the same surface (writer happy path + JSON parse + schema round-trip) without polluting the project tmpdir with a smoke artifact.

### Follow-ups for Story 2.6 (PRIMARY CALLER)

1. Story 2.6 invokes `writeStepTranscript({...})` at the end of `verify-and-advance.ts` (per architecture §line 1478 step 4). The `TranscriptInput` is constructed from: loaded `state.yaml` (`stateBefore`/`stateAfter`); read `dispatch-spec.json` (`runId`, `stepName`, `epic`, `story`, `phase`, `persona`, `model`, `budget`, `inputs` from `taskSpec.context`, `subAgentPrompt`); read sub-agent output (`subAgentOutput`); verifier result (`verifierResult`); slash-command-passed metrics (`durationMs`, `tokensIn`, `tokensOut`).
2. Story 2.6 should reference `src/runs/` (per dev-001) instead of `src/transcript/`.
3. The `outcome` field is constructed by Story 2.6 based on the verifier promote/halt branch (e.g., `"✓ Promoted from staging/<runId>/ to canonical location."` on pass; `"✗ Halted; see ..."` on fail).
4. The `errors[]` field in `TranscriptInput` is populated by Story 5.* failure-UX engine when wired; Story 2.6 v0.1 may pass `[]` (default).

### File List

See **File List** section above (8 new files under `src/runs/`; 0 modified).

## Senior Developer Review

**Reviewer**: bmad-code-review (Stepper iteration 11)
**Date**: 2026-04-30
**Verdict**: approve

### Acceptance Criteria

- **AC-1** (markdown transcript at `runs/<ts>-<step>.log` with seven AR25 sections — `# Step <name> — <runId>`, `## Inputs`, `## Sub-agent prompt (6 sections)`, `## Sub-agent output (excerpt)`, `## Verifier result`, `## State delta`, `## Outcome`): **PASS** — `src/runs/render-markdown.ts:69-127` emits the seven sections in fixed order; the header at `:73` uses the U+2014 em-dash separator per AC-1; `## Inputs` formatter at `:77-85` (with `(none)` placeholder when empty); `## Sub-agent prompt (6 sections)` at `:88-90`; `## Sub-agent output (excerpt — full at staging/<runId>/outputs/)` at `:93-97` with `truncateForExcerpt` helper at `:27-36` (2000-char cap + `… (full at staging/<runId>/outputs/)` marker per architecture §P5 line 832); `## Verifier result` at `:100-107` with `✓` / `✗` / `○` symbols per check + `Overall: <status>`; `## State delta` at `:110-118` with `<prev> → <curr>` notation; `## Outcome` at `:121-123`. Trailing `\n` per Git-friendly convention at `:126`. Tests at `src/runs/render-markdown.test.ts:60-86` (section ordering + em-dash heading), `:88-120` (Inputs with bullets + empty `(none)`), `:122-144` (excerpt truncation + no-truncation), `:146-174` (verifier symbols + Overall), `:176-193` (state delta arrows + null), `:195-206` (outcome verbatim), `:208-222` (purity + trailing newline) cover every section formatter. Writer integration `src/runs/write-step.test.ts:92-106` confirms the on-disk markdown matches `renderTranscriptMarkdown(input)` byte-for-byte.

- **AC-2** (paired `runs/<ts>-<step>.json` validated against `src/schemas/run-log.ts` containing `schemaVersion`, `ts`, `runId`, `step`, `epic`, `story`, `phase`, `persona`, `model`, `budget`, `verifierResult`, `stateBefore`, `stateAfter`, `durationMs`, `tokensIn`, `tokensOut`, `errors[]`): **PASS** — `src/runs/build-run-log.ts:37-57` populates every required `RunLogV1` field from `TranscriptInput` with explicit `errors: input.errors !== undefined ? [...input.errors] : []` defensive default at `:55`. `src/runs/write-step.ts:127-131` invokes the builder, runs defence-in-depth `RunLogV1Schema.parse(runLog)` per NFR-M3, then `:147` writes `${JSON.stringify(runLog, null, 2)}\n` (pretty-printed + trailing newline for Git-friendly diffs). Tests `src/runs/build-run-log.test.ts:60-111` (every required field populated), `:113-120` (RunLogV1Schema round-trip), `:122-138` (errors[] propagate + default), `:140-160` (nullable epic/story/phase/persona/model/budget propagate AND round-trip), `:162-169` (purity / determinism). Writer integration `src/runs/write-step.test.ts:108-124` (on-disk JSON round-trips through schema, deep-equals `buildRunLog(input)`), `:333-346` (defence-in-depth schema parse exercised on real on-disk JSON).

- **AC-3** (NFR-P4 streamed write — zero observable impact on main-thread latency, verified by long-run integration test): **PASS** — Writer is silent on stdout/stderr per AR25 "Streamed write — main thread tails to disk, never to stdout/stderr". Tests at `src/runs/write-step.test.ts:170-215` enforce silence two ways: `:171-190` spies `process.stdout.write` + `process.stderr.write` and asserts ZERO calls during writer execution; `:192-214` uses `mock.module("../io/log.ts", ...)` to replace `info`/`warn`/`error`/`json` with spies and asserts ZERO calls. Source-file boundary test at `:284-297` greps for `from "../io/log"` against all `src/runs/*.ts` and asserts no matches. The canonical NFR-P4 long-run integration test is documented as deferred to Story 4.x `src/integration/long-run-1000-dispatches.test.ts` per architecture line 1393 (Story 2.5 ships the silence contract; long-run latency assertion is downstream). v0.1 acceptable per architecture deferral note.

- **AC-4** (`<ts>` follows `YYYY-MM-DDTHH-mm-ss` UTC convention): **PASS** — `deriveTimestamp` at `src/runs/write-step.ts:73-83` implements the three-layer preference per architecture §line 365: (1) regex `RUNID_TS_PREFIX = /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})-/` at `:58` matches Story 2.2 runId convention; (2) fallback to `input.nowIso ?? new Date().toISOString()`; (3) filesystem-safe transform `replace(/:/g, "-").replace(/\.\d+Z?$/, "").replace(/Z$/, "")` produces `YYYY-MM-DDTHH-mm-ss` (length 19, colons replaced with hyphens, milliseconds + `Z` dropped). Tests at `src/runs/write-step.test.ts:127-167` exercise all three preference layers: `:127-142` runId leading prefix preferred → `result.ts === "2026-04-29T10-15-00"`; `:144-154` fallback to nowIso when runId non-conforming; `:156-167` default to wall-clock when both absent → matches the 19-char regex.

### Architecture & FR/NFR

- **AR21** (errors carry `code` + `actionableHint`): **PASS** — Story 2.5 USES existing `StepperError` subclasses only; the `ScopeViolationError` (code `SCOPE_VIOLATION`, exitCode 5) is thrown via the explicit `assertWithinScope(runsRoot)` at `src/runs/write-step.ts:138` and transitively via `atomicWrite` per Story 1.3 contract. `src/io/paths.ts:92-95` constructs the error with the `code` + `actionableHint` (`"allowed roots: ..."`). Test at `src/runs/write-step.test.ts:246-265` verifies `err.code === "SCOPE_VIOLATION"` + `err.exitCode === 5` for an out-of-scope `runsRoot`. No new error class registered.

- **AR22** (single-line `Run/See/Try/Check`-prefixed hints): **PASS** — Story 2.5 throws no NEW errors; the transitively thrown `ScopeViolationError`'s actionableHint (`"allowed roots: ..."`) is registered at `src/errors.ts` (Story 1.5 / 1.6). Story 2.5 does NOT extend the registry, so it inherits the AR22 conformance from Story 1.5 / 1.6.

- **AR25** (markdown transcript per step — Streamed write to disk, never to stdout/stderr): **PASS** — All seven sections rendered per AC-1 PASS evidence above. Streaming silence enforced per AC-3 PASS evidence above. The "streamed write" phrase refers to OS-layer kernel buffering of `Bun.write` (atomic-write returns once the rename syscall completes); the writer site at `src/runs/write-step.ts:146` satisfies the architecture line 1393 enforcement-location reference (`src/transcript/write-step.ts (streamed write)` — modulo the dev-001 directory rename to `src/runs/`).

- **AR26** (JSON run log per step containing the 17-field set): **PASS** — All 17 schema fields populated per AC-2 PASS evidence above. The `RunLogV1Schema` consumed verbatim from Story 1.5 (`src/schemas/run-log.ts:19-38`); Story 2.5 does NOT mutate the schema. The `timeout` field declared in the schema as optional is intentionally NOT populated — the timeout is already inside `budget.timeoutMs`; documented as forward-compat for Story 6.x at `src/runs/build-run-log.ts:28-31`.

- **AR33** (function & error semantics — async/sync, no `console.*`, uses `info()`/`warn()`/`error()`/`json()` only): **PASS** — `writeStepTranscript` is `async (src/runs/write-step.ts:117-119)`; `buildRunLog` + `renderTranscriptMarkdown` + helpers are sync. Zero `console.*` calls in `src/runs/*.ts` (Biome `noConsole` rule trivially satisfied). All filesystem IO uses Bun-native (`atomicWrite` → `Bun.write`) or Node stdlib (`node:fs/promises mkdir`). NO `process.exit`. The writer is intentionally silent — does NOT call `info`/`warn`/`error`/`json` per NFR-P4 + AR25.

- **AR41** (CRITICAL boundary verdict — mid-tier `src/runs/` MUST import only foundational `errors`, `schemas`, `io`): **CLEAN** — Grep against `src/runs/*.ts` (excluding tests) for forbidden patterns (`from "../dispatch/"`, `from "../verifiers/"`, `from "../personas/"`, `from "../dag/"`, `from "../commands/"`, `from "../state/"`, `from "../lock/"`, `from "../failure-ux/"`) returns ZERO matches. Only allowed imports observed across `src/runs/{index,types,build-run-log,render-markdown,write-step}.ts`: foundational (`../io/atomic-write.ts`, `../io/paths.ts`, `../schemas/run-log.ts`); intra-module siblings (`./build-run-log.ts`, `./render-markdown.ts`, `./types.ts`); Node stdlib (`node:fs/promises`, `node:path` in `write-step.ts` only). Programmatic boundary test at `src/runs/write-step.test.ts:267-298` runs the same grep at runtime over the 5 source files and asserts no matches — defence-in-depth.

- **FR18** (one human-readable line per step): **PASS (CONDUIT)** — Story 2.5's `WriteStepTranscriptResult` returns `{ markdownPath, jsonPath, ts }` so the Story 2.6 caller can construct the FR18 summary line referencing the run-log paths. Story 2.5 itself is silent (per AR25 + NFR-P4); the FR18 emit happens at the runner-tier caller.

- **FR32** (actionable error report on halt): **PASS (CONDUIT)** — Story 2.5's `errors[]` field of `TranscriptInput` flows into the `RunLogV1.errors[]` array; failure-UX engine (Story 5.*) populates the structured error records, and the Story 2.6 caller emits the FR32 actionable error message. Story 2.5 is the data conduit.

- **FR43** (markdown transcript per step): **PASS** — `writeStepTranscript` writes `<runsRoot>/<ts>-<step>.log` per AC-1 + AR25 evidence above.

- **FR44** (JSON run log per step): **PASS** — `writeStepTranscript` writes `<runsRoot>/<ts>-<step>.json` per AC-2 + AR26 evidence above.

- **FR46** (single-line + full-detail errors): **PASS (CONDUIT)** — `RunLogV1.errors[]` carries the structured failure records (single-line + full-detail). Story 2.6 + Story 5.* own the populator + emit.

- **FR54** (stdout/stderr discipline): **PASS** — Writer is silent per AC-3 + NFR-P4 evidence above. Zero stdout/stderr writes during `writeStepTranscript` execution; zero `from "../io/log"` imports across `src/runs/*.ts`.

- **NFR-P4** (transcript streaming zero observable latency): **PASS (writer-site silence; long-run assertion deferred to Story 4.x)** — Writer is silent per AC-3 evidence. Canonical long-run latency assertion lives in `src/integration/long-run-1000-dispatches.test.ts` per architecture line 1393. Story 2.5 ships the silence contract; the latency budget assertion is a Story 4.x concern.

- **NFR-S2** (writes only inside scope): **PASS** — `assertWithinScope(runsRoot)` called at `src/runs/write-step.ts:138` BEFORE `fs.mkdir` (per dev-002 — surfaces canonical `ScopeViolationError` before mkdir would raise EACCES); `atomicWrite` re-checks each individual path transitively per Story 1.3 contract (defence-in-depth). Test at `src/runs/write-step.test.ts:246-265` verifies the throw on out-of-scope `runsRoot`.

- **NFR-S5** (atomic tmp+rename + .bak rotation): **PASS** — Both `.log` and `.json` writes use `atomicWrite` from Story 1.3 (`src/runs/write-step.ts:146-147`). `.bak` rotation is one-cycle (the prior `.bak` is overwritten); ENOENT on first-write rename is silently swallowed per Story 1.3 contract. Test at `src/runs/write-step.test.ts:217-244` verifies `.bak` files exist after second write to the same `<ts>-<step>.{log,json}` path AND the `.bak` contains the prior body while the current files contain the new body.

- **NFR-R1** (zero data loss on halt): **PASS** — The atomic-write contract guarantees that a halt mid-write leaves either the prior or new file (never partial); the `.bak` provides single-cycle rollback safety net per architecture §D10 line 403.

- **NFR-Sc4** (90-day run archive): **DEFERRED** — Story 2.5 does NOT ship `archive.ts`; deferred to Story 6.8 (`src/runs/archive.ts` per dev-001 — directory rename). Sound architectural deferral; not blocking.

- **NFR-M3** (every public schema validated by Zod): **PASS** — Defence-in-depth `RunLogV1Schema.parse(runLog)` at `src/runs/write-step.ts:131` catches schema drift before hitting disk. Test at `src/runs/write-step.test.ts:333-346` exercises the parse step on real on-disk JSON.

### Deviations

- **dev-001** (directory rename `src/transcript/` → `src/runs/` per dispatch-time `declaredMutationScope.allowedPaths`): **accept** — The 5-source-file split + the public surface contract (`writeStepTranscript`, `renderTranscriptMarkdown`, `buildRunLog`, `TranscriptInput`, `WriteStepTranscriptInput`, `WriteStepTranscriptResult`) preserved verbatim; only the directory name differs from the spec. Coordination model mirrors Story 2.4-style mutation scope: the dispatch-time `run.yaml` is the source of truth; epic-2 retro will document the rename precedent. Architecture documents reference `src/transcript/`; forward-dep stories (2.6, 2.8, 3.8, 3.9, 3.10, 5.x, 6.7, 6.8) need to substitute `src/runs/` for `src/transcript/` in their import paths and architecture cross-references. Flagged as forward-action item per Carry-overs section below. No source contract changed.

- **dev-002** (explicit `assertWithinScope(runsRoot)` between schema-parse and mkdir, before `atomicWrite`'s transitive check): **accept** — Defence-in-depth refinement vs. spec Task 4.7 step 9 ordering. Reason: `fs.mkdir({ recursive: true })` on an out-of-scope path (e.g., `/etc/...`) raises `EACCES` first, which masks the canonical `ScopeViolationError` (code `SCOPE_VIOLATION`, exitCode 5). The pre-mkdir scope check ensures the architectural NFR-S2 contract surfaces the registered error class. `atomicWrite` still re-checks each individual path transitively per Story 1.3 contract — defence-in-depth holds. Sound architectural improvement; accepted without followup.

- **dev-003** (skipped Task 9.8 manual smoke shell command): **accept** — The colocated tests cover the same surface (writer happy path `src/runs/write-step.test.ts:92-124`; on-disk JSON round-trip `:108-124`; `<ts>` derivation `:127-167`; concurrent dual-write atomicity `:348-390`). The smoke command would write to a tmpdir-rooted `runsRoot` which is exactly what the colocated tests already do. Skipping avoids polluting the project tmpdir with smoke artifacts. Accepted with no followup.

### Findings

#### Must-Fix (0)

None.

#### Should-Fix (0)

None.

#### Nits (0)

None blocking.

#### Info (3)

- **Info-1** (`src/runs/build-run-log.ts:55`): The defensive `errors: input.errors !== undefined ? [...input.errors] : []` spreads the input array into a fresh array. This is sound defensive copy semantics (prevents downstream mutation of the input's `errors[]` via the returned `RunLogV1.errors[]`). Schema's own `z.array(z.unknown()).default([])` provides a second layer. No change required.

- **Info-2** (`src/runs/write-step.ts:55`): `RUNS_ROOT = ${STEPPER_INTERNAL_ROOT}/runs` uses string concatenation rather than `path.join(STEPPER_INTERNAL_ROOT, "runs")`. On macOS/Linux this produces the same canonical path; on Windows the forward-slash separator may produce mixed separators when joined with the runId prefix at the test site. v0.1 Bun deployment is POSIX-only; consider `path.join` for forward-compat if Windows support becomes a goal (carry-over to Story 6.x cross-platform polish).

- **Info-3** (`src/runs/write-step.ts:81-82`): The filesystem-safe transformation chains `replace(/\.\d+Z?$/, "")` then `replace(/Z$/, "")`. The first regex already strips `Z` when present after `.<ms>`, so the second is a belt-and-suspenders catch for the `nowIso` without milliseconds case (e.g., `"2026-04-29T10:15:00Z"`). Defensive but redundant in the typical `toISOString()` output (which always emits `.<ms>Z`). No change required; the redundancy is harmless and documents intent.

### Quality Gates Reproduced

- `bun run check`: exit **0** — `biome ci .` PASS; `bun test` **475 pass / 0 fail / 1676 expect() / 43 files** in 1491ms (matches dev report 475 / 0 / +102 expects / 43 files exactly; +34 tests vs Story 2.4 baseline 441).
- `bunx tsc --noEmit`: exit **0** (no output).
- AR41 boundary: **CLEAN** — Grep `from\s+["']\.\./(dispatch|verifiers|personas|dag|commands|state|lock|failure-ux)/` against `src/runs/*.ts` returns ZERO matches.
- NFR-P4 silence: **CLEAN** — Grep `from\s+["']\.\./io/log["']` against `src/runs/*.ts` returns ZERO matches.
- Errors registry: **stable at 16 codes** (Story 2.5 USES `ScopeViolationError` only; transitively + via the explicit `assertWithinScope(runsRoot)` pre-check).

### Carry-overs to Future Stories

- **Story 2.6 (PRIMARY CALLER)** — `verify-and-advance.ts` invokes `writeStepTranscript({...})` per architecture §line 1478 step 4. **CRITICAL**: import path is `src/runs/` (per dev-001), NOT the architecture-doc-referenced `src/transcript/`. Story 2.6 spec drafting should substitute `src/runs/` throughout. The `TranscriptInput` is constructed from loaded `state.yaml` (`stateBefore`/`stateAfter`); read `staging/<runId>/dispatch-spec.json` (`runId`, `stepName`, `epic`, `story`, `phase`, `persona`, `model`, `budget`, `inputs`, `subAgentPrompt`); read sub-agent output from `staging/<runId>/outputs/`; verifier result from `runVerifier`; slash-command-passed metrics (`durationMs`, `tokensIn`, `tokensOut`).

- **Story 2.8** (smoke test for `/bmad-next` happy path) — asserts `runs/<ts>-<step>.{log,json}` exist + validate against schema. Update import / path references to `src/runs/` per dev-001.

- **Story 3.8 / 3.10** (`--diff-state` / `--export-state`) — consume the JSON run logs as canonical state-history source. Update path references to `src/runs/`.

- **Story 3.9** (`--watch` live transcript tail) — ships `src/runs/watch.ts` (NEW; per dev-001 directory rename). Architecture doc reference `src/transcript/watch.ts` should be substituted.

- **Story 5.*** (failure-UX modes) — populate `errors[]` field via `TranscriptInput.errors`. No path-rename impact (the API surface is `TranscriptInput`).

- **Story 6.7** (telemetry aggregation) — aggregates over `src/runs/<ts>-<step>.json` files. Update path references.

- **Story 6.8** (auto-archival of runs and telemetry) — ships `src/runs/archive.ts` for the 90-day rotation per NFR-Sc4. Architecture doc reference `src/transcript/archive.ts` should be substituted.

- **Epic-2 retrospective** — should document the dev-001 directory rename precedent (`src/transcript/` → `src/runs/`) and recommend an architecture-doc cross-reference patch (lines 1212-1217 + lines 1373-1374 + line 1393 + line 1478) to align prose with shipping artifact, OR ratify `src/transcript/` as the architectural alias for the shipped `src/runs/` directory.

- **Story 6.x** (cross-platform polish) — Info-2 carry-over: replace string-concatenation path construction in `src/runs/write-step.ts:55` with `path.join` for Windows-friendly separators (low priority; v0.1 is POSIX-only).

## Change Log

- **2026-05-01T07:30:00Z (dev-story complete)**: Story 2.5 implemented end-to-end by `bmad-dev-story` (model `claude-opus-4-7[1m]`, run `2026-05-01T071600Z-bmad-next` iteration 10, loopId `2026-05-01T053000Z-bmad-loop`). 8 new files under `src/runs/` (dev-001: directory renamed from `src/transcript/` per dispatch-time `declaredMutationScope.allowedPaths`); 0 modified files. Test count 441 → 475 (+34 tests across `build-run-log.test.ts` 8 cases / `render-markdown.test.ts` 11 cases / `write-step.test.ts` 15 cases; +102 expects; test files 40 → 43). All quality gates exit 0: `bun run check`, `bunx tsc --noEmit`, `bunx biome ci .`. Errors registry stays at 16 codes (Story 2.5 USES `ScopeViolationError` only — explicit `assertWithinScope(runsRoot)` pre-mkdir + transitive via `atomicWrite`). AR41 boundary CLEAN (zero upward imports from `src/runs/`); NFR-P4 silence CLEAN (zero `src/io/log.ts` imports + zero stdout/stderr writes during writer execution per Task 8.8 spy assertions). dev-002: pre-mkdir `assertWithinScope(runsRoot)` inserted between schema parse and mkdir to surface canonical `ScopeViolationError` before `fs.mkdir` would raise EACCES. dev-003: skipped Task 9.8 manual smoke (colocated tests provide equivalent coverage). All 11 task groups (Tasks 0-10) checkboxes flipped to complete. Sprint-status flipped `2-5-markdown-transcript-json-run-log-writers: ready-for-dev → review`. Forward-dep handoff: Story 2.6 (`verify-and-advance.ts`, PRIMARY CALLER) wires `writeStepTranscript({...})` per architecture §line 1478 step 4; should reference `src/runs/` per dev-001.

- **2026-05-01 (created)**: Story file created (status `ready-for-dev`) — bmad-create-story persona, model `claude-opus-4-7[1m]`, run `2026-05-01T071100Z-bmad-next` (loopId `2026-05-01T053000Z-bmad-loop`, loopIteration 9). FIFTH epic-2 story (after Story 2.1 verifiers — DONE, Story 2.2 dispatch-spec generator — DONE, Story 2.3 generic sub-agent — DONE, Story 2.4 lock-free `run.ts` — DONE). FIRST observability writer pair of the project — markdown transcript (AR25) + JSON run log (AR26). Drafted from epics.md §Story 2.5 lines 647-663 (AC verbatim), architecture.md §D7 lines 336-369 (state persistence layout — runs/ directory), §F lines 543-552 (observability & telemetry bullets), §P5 lines 793-847 (worked example — JSON + markdown shapes verbatim), §line 365 (`<ts>` filesystem-safe convention), §lines 1212-1217 (`src/transcript/` directory listing), §lines 1278-1282 (AR41 mid-tier boundary), §line 1373/1374 (FR43/FR44 enforcement location), §line 1393 (NFR-P4 enforcement location), §line 1478 (verify-and-advance.ts step 4 — write transcript), prd.md FR18+FR32+FR43+FR44+FR46+FR54 + NFR-P4/S2/S5/R1/Sc4/M3, Story 2.4 Forward-Dep notes line 574 + Senior Dev Carry-overs line 1092 (Story 2.5 independent at runner tier; Story 2.6 is PRIMARY CALLER), Story 2.2 runId convention `<ts>-<step>-<short-uuid>` (used by `deriveTimestamp` AC-4 algorithm), Story 1.5 `RunLogV1Schema` (consumed verbatim — no schema bump), Story 1.3 `atomicWrite` + `assertWithinScope` foundational primitives. Mirrors Story 2.4 / 2.3 / 2.2 / 2.1 / 1.12 template structure. Files planned: 8 new files (1 barrel + 1 types + 3 source + 3 colocated test); 0 modified files (purely additive). Hard constraints: ZERO `_bmad-output/.stepper/` mutations; ZERO existing-source modifications; ZERO new error class registration (registry stays at 16 codes); ZERO upward imports from `src/transcript/` (AR41 mid-tier rule). Sub-agent output excerpt truncates to first 2,000 chars with `… (full at staging/<runId>/outputs/)` marker per architecture §P5 line 832 worked example. The `<ts>` derivation prefers the runId's leading prefix when conforming to Story 2.2 convention; falls back to `nowIso` (test-injected) or `new Date().toISOString()` (production); colons replaced with hyphens, milliseconds + `Z` dropped per architecture §line 365. Defence-in-depth `RunLogV1Schema.parse` at the writer site catches schema drift. NFR-P4 silence enforced via `mock.module` spy on `src/io/log.ts` writers — assert ZERO calls. Forward-deferred surfaces: `archive.ts` (Story 6.8 + NFR-Sc4 90-day rotation); `watch.ts` (Story 3.9 + FR42 `--watch`); failure-UX `errors[]` population (Stories 5.*); telemetry aggregation over JSON run logs (Story 6.7). Estimated effort: M (medium — 3 source files + 3 colocated tests; ~22-34 tests; ~700-800 lines this file). Test count delta target: +22-34 (baseline 441 → ~463-475). FR/NFR/AR coverage: FR18+FR32+FR43+FR44+FR46+FR54 / NFR-P4+NFR-S2+NFR-S5+NFR-R1+NFR-Sc4+NFR-M3 / AR21+AR22+AR25+AR26+AR33+AR41.

- **2026-04-30 (code-review)**: bmad-code-review persona, model `claude-opus-4-7[1m]`, run `2026-05-01T073100Z-bmad-next` (loopId `2026-05-01T053000Z-bmad-loop`, loopIteration 11). Status flipped `review → done`. Senior Developer Review verdict: **approve** (0 must-fix, 0 should-fix, 0 nits, 3 info). All 4 ACs PASS (AC-1 markdown sections + em-dash heading + truncation marker; AC-2 RunLogV1 17-field shape + schema round-trip + defence-in-depth `RunLogV1Schema.parse`; AC-3 NFR-P4 streaming silence — zero stdout/stderr writes + zero `from "../io/log"` imports; AC-4 `<ts>` filesystem-safe `YYYY-MM-DDTHH-mm-ss` UTC convention with three-layer derivation). AR41 boundary CRITICAL verdict: **CLEAN** (zero forbidden upward imports across `src/runs/{index,types,build-run-log,render-markdown,write-step}.ts`). NFR-P4 silence CRITICAL verdict: **CLEAN** (zero `from "../io/log"` imports across the same five source files). AR21+AR22+AR25+AR26+AR33 PASS. FR18+FR32+FR43+FR44+FR46+FR54 PASS (FR18+FR32+FR46 marked CONDUIT — Story 2.5 ships the data carrier; the runner-tier emit is Story 2.6/5.* concern). NFR-S2+NFR-S5+NFR-R1+NFR-M3 PASS. NFR-P4 PASS at writer site (silence); long-run latency assertion deferred to Story 4.x `src/integration/long-run-1000-dispatches.test.ts` per architecture line 1393. NFR-Sc4 deferred to Story 6.8 (`archive.ts`). Errors registry stable at 16 codes (Story 2.5 USES `ScopeViolationError` only — explicit `assertWithinScope(runsRoot)` pre-mkdir + transitive via `atomicWrite`). Quality gates reproduced cleanly: `bun run check` exit 0 (biome ci PASS, 475 pass / 0 fail / 1676 expects / 43 files in 1491ms; matches dev report exactly); `bunx tsc --noEmit` exit 0; AR41 boundary CLEAN; NFR-P4 silence CLEAN. All 3 documented deviations adjudicated **accept**: dev-001 (directory rename `src/transcript/` → `src/runs/` per dispatch-time `declaredMutationScope.allowedPaths` — public surface contract preserved verbatim; flagged as forward-action for Stories 2.6/2.8/3.8/3.9/3.10/5.x/6.7/6.8 import-path substitution + epic-2-retro architecture-doc cross-reference patch); dev-002 (explicit `assertWithinScope(runsRoot)` between schema-parse and `fs.mkdir` — sound architectural improvement surfacing canonical `ScopeViolationError` before EACCES masks it); dev-003 (skipped Task 9.8 manual smoke — colocated tests provide equivalent coverage; avoids tmpdir pollution). Carry-overs to future stories: Story 2.6 (PRIMARY CALLER — `src/runs/` import path per dev-001), Story 2.8 (smoke test path references), Story 3.8/3.9/3.10 (read-flag consumers), Story 5.* (failure-UX errors[] populator), Story 6.7 (telemetry aggregation), Story 6.8 (archive.ts), epic-2-retrospective (rename precedent + architecture-doc cross-reference patch), Story 6.x (cross-platform polish — Info-2 `path.join` substitution).