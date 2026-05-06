---
status: done
story_id: '6.6'
story_key: 6-6-telemetry-opt-in-collection
epic: '6'
title: 'Telemetry Opt-In Collection'
created: '2026-05-05'
last_updated: '2026-05-05T12:30:00Z'
priority: high
estimated_effort: M
fr_coverage:
  - FR39     # PRIMARY — Telemetry opt-in (architecture line 1369; epics.md Story 6.6)
  - FR40     # PRIMARY — telemetry block in config consumed (Story 6.1 schema baseline → Story 6.6 consumer)
  - FR45     # SECONDARY — TelemetryRecord shape consumed at write site (full report writer is Story 6.7)
nfr_coverage:
  - NFR-S3   # PRIMARY — telemetry no PII; closed-set field whitelist enforcement (architecture line 1664; AC-2 verbatim mechanism)
  - NFR-R1   # PRIMARY — Zod-validated record on every write
  - NFR-R6   # PRIMARY — defence-in-depth Zod parse on collect
  - NFR-S1   # main-thread output discipline (info() stderr only; ZERO console.*)
  - NFR-M3   # schema-versioned write (TelemetryRecordV1Schema source-of-truth)
ar_coverage:
  - AR41     # PRIMARY — boundary graph: src/telemetry/ is MID-TIER per architecture line 1283 (alongside migrations/, state/, transcript/, upgrade/); allowed imports = foundational (errors, schemas, io); NO higher-tier or top-tier imports
  - AR42     # PRIMARY — schema-first; TelemetryRecordV1Schema at src/schemas/telemetry.ts is source-of-truth (ALREADY exists from Story 1.5 baseline; Story 6.6 CONSUMES — does NOT mutate the schema)
  - AR21     # single-line constraint on info() audit log when collect.ts emits a non-default opt-in notice (mirrors Story 6.4 info() pattern)
  - AR22     # actionable-hint regex /^.*(Run|See|Try|Check) / N/A (no new error classes)
  - AR33     # async fs writes; never console.*; never process.exit
  - AR8      # lock-free top-tier preserved (telemetry write is post-state-save, INSIDE the held lock at verify-and-advance, but the WRITE itself is to a SEPARATE FILE under paths.telemetry — does NOT mutate state.yaml; AR8 invariant not affected)
  - AR9      # AR9 stdout JSON-line invariant unchanged; telemetry JSONL is a SEPARATE file write — NOT on the AR9 stdout boundary
  - AR17     # security: telemetry record contains NO source content — closed-set whitelist via .strict() on TelemetryRecordV1Schema; CI test verifies no PII
  - AR27     # telemetry schema invariants per architecture line 1664; closed-set field list verified at write site
deps:
  - story: '6.1'
    reason: 'PRIMARY — `loadConfig()` produces typed `Config` with `config.telemetry: { enabled: boolean }` (closed-shape `TelemetrySchema = z.object({ enabled: z.boolean() })` at `src/schemas/config.ts:286-288` AND `Config.telemetry: TelemetrySchema` at `src/schemas/config.ts:336`). Story 6.1 SDR I-27 PRIMARY HONOURED here: Story 6.6 wires the consumer that reads `config.telemetry.enabled` and writes a TelemetryRecord to JSONL when true. Story 6.1 inputs to wire: (a) `loadConfig()` exposes `Config.telemetry` as `Telemetry`; (b) `config.paths.telemetry: string` provides the directory root (default `_bmad-output/.stepper/telemetry/` per src/config/defaults.ts:48); (c) the schema is REQUIRED in ConfigV1 (no `.default(...)`) — every loaded config has explicit `telemetry: { enabled: boolean }`. NO loader-API change for Story 6.6 (Story 6.1 SDR I-27 verbatim).'
  - story: '1.5'
    reason: 'PRIMARY — `TelemetryRecordV1Schema` at `src/schemas/telemetry.ts:22-37` (closed-set 12-field whitelist with `.strict()` per NFR-S3 anti-PII enforcement). Schema fields: `schemaVersion: z.literal(1)`, `ts: z.string()`, `step: z.string()`, `phase: z.string()`, `persona: z.string()`, `model: z.string()`, `durationMs: z.number()`, `verifierStatus: z.enum(["pass", "fail", "skip"])`, `retries: z.number()`, `tokensIn: z.number()`, `tokensOut: z.number()`, `errorCode: z.string().optional()`. Story 6.6 CONSUMES the schema at `src/telemetry/collect.ts` — calls `TelemetryRecordV1Schema.parse(...)` defence-in-depth before write. ZERO schema mutation; no `schemaVersion` bump. The migration registry at `src/migrations/telemetry/index.ts` is ALREADY wired (Story 1.5 baseline) — current = 1, versions = { 1: TelemetryRecordV1Schema }, migrations = {}.'
  - story: '1.2'
    reason: 'PRIMARY — errors-registry CI gate. Story 6.6 ships ZERO new error classes. The Zod parse failure inside `writeTelemetryRecord` is a PROGRAMMING ERROR (call site supplied a malformed record) — surfaces as a plain `Error` thrown synchronously per AC-2 ("Zod validation fails"). The CI test verifies a malformed record is REJECTED (the throw, not a structured StepperError actionable hint). Registry stays at 17 codes — verified independently from a fresh shell.'
  - story: '1.3'
    reason: 'PRIMARY — io/log.ts (`info` helper for stderr audit) + io/paths.ts (`assertWithinScope` helper for the telemetry directory write — though the telemetry path IS within `_bmad-output/.stepper/` so the scope assertion is trivially passed). Story 6.6 may emit ONE single-line `info()` audit notice on first telemetry write per session ("telemetry: enabled — writing JSONL records to <path>") — DEFER per OQ-3 (telemetry runs silently per architecture line 549 — opt-in implies the user already knows it is on; an info() line every session is noise). Single-line discipline preserved (AR21+22).'
  - story: '2.6'
    reason: 'PRIMARY CONSUMER — `src/commands/next/verify-and-advance.ts` (Story 2.6) is THE step-completion finalization site. Story 6.6 wires the telemetry call at the SAME `finally` block where the transcript is written (lines 1609-1665) — AFTER `writeStepTranscript` (Step 12) and BEFORE `cleanStagingOrphans` (Step 12.5) so a failure inside telemetry write does NOT mask transcript writing. The placement INSIDE the lock is intentional: Story 6.6 OQ-1 adjudicates that telemetry write happens under the held verify-and-advance lock (per AR8 the lock is released LAST in finally per architecture line 1672) — this guarantees the verifierResult + transcript + telemetry triple is atomic w.r.t. concurrent runner attempts; the JSONL append-mode write is per-process serial.'
  - story: '5.6'
    reason: 'PATTERN — `opts.config` seam frozen. Story 5.6 froze the seam at LoopOpts + RunNextOptions + RunVerifyAndAdvanceOptions; Stories 6.1 + 6.2 + 6.3 + 6.4 + 6.5 extended; Story 6.6 reads from THE SAME seam — `opts.config?.telemetry?.enabled` AT THE VERIFY-AND-ADVANCE FINALLY SITE. ZERO seam mutation beyond a `telemetry?: Telemetry` field addition (mirror of Story 6.5 `verifiers?: Verifiers` add) on `RunVerifyAndAdvanceOptions.config` + downstream `RunNextOptions.config` + `LoopOpts.config` + both `loadConfigOverride` return types.'
  - story: '6.5'
    reason: 'PATTERN + IMMEDIATE PREDECESSOR — Story 6.5 (`verifiers:` per-step config override) shipped the runner-tier consumer pattern Story 6.6 MIRRORS. Story 6.5 extended `RunVerifyAndAdvanceOptions.config?` from `{ failurePolicies?, verifiers? }` to ALSO include `verifiers?: Verifiers`; Story 6.6 adds `telemetry?: Telemetry` to the same seam. The conditional spread pattern (Story 6.4 `budgetOverride` line 2087-2102 → Story 6.5 `projectVerifiers` line 1047 + 1251) is mirrored here at the telemetry write site (`...(opts?.config?.telemetry?.enabled === true ? { telemetryEnabled: true } : {})`). Story 6.5 SDR forward-trackers I-27 + I-41 PRIMARY HONOURED here.'
  - story: '6.4'
    reason: 'PATTERN — Story 6.4 (`budgets:` per-step config) shipped the SAME schema-strictness + consumer-wiring pattern: extend the schema with `.strict()` (TelemetryRecordV1Schema is ALREADY `.strict()` from Story 1.5 baseline — Story 6.6 consumer enforces the AC-2 closed-set rejection by passing through `TelemetryRecordV1Schema.parse(...)` at write time); thread the typed config field through the runner seams without mutating call shapes. Story 6.4 SDR forward-tracker I-43 (5+ sites accumulated) — Story 6.6 brings the count to 6 sites (models / budgets / failurePolicies / overrides / verifiers / telemetry); Story 6.6 OQ-7 adjudicates extract-vs-defer (DEFER per OQ-7 — telemetry is consumed at a DIFFERENT tier (verify-and-advance finally, NOT dispatch-tier), so the helper-extraction analysis differs).'
  - story: '6.3'
    reason: 'PATTERN — Story 6.3 (`models:` per-step config) shipped the model field threading pattern. Story 6.6 RECORDS the dispatched `model` in the telemetry record (one of the 12 whitelisted fields) — the model field at the telemetry write site reads from the dispatchSpec (already populated by Story 6.3 buildDispatchSpec with default "sonnet"). Story 6.3 SDR forward-tracker I-41 (model field reliable for telemetry) — Story 6.6 PRIMARY HONOURS by reading `dispatchSpec.model` into the telemetry record. NO extra wiring at Story 6.3 surface.'
  - story: '2.5'
    reason: 'PRIMARY — transcript module group (`src/runs/`). Story 2.5 ALREADY shipped `writeStepTranscript({...})` as the canonical step-finalization sink; Story 6.6 ADDS a SECOND sink (telemetry JSONL) at the SAME finally block in verify-and-advance.ts. The two sinks share the same data inputs (durationMs, tokensIn, tokensOut, verifierResult, dispatchSpec, persona, model, phase) — Story 6.6 builds the TelemetryRecord from the same closure. ZERO mutation to `src/runs/render-markdown.ts` / `src/runs/build-run-log.ts`.'
  - story: '6.7'
    reason: 'CROSS-STORY COORDINATION — Story 6.7 (telemetry aggregation report) READS the JSONL files Story 6.6 writes. Story 6.6 ESTABLISHES the file format invariants Story 6.7 depends on: (a) one TelemetryRecord per JSONL line, terminated with `\n`; (b) file path `_bmad-output/.stepper/telemetry/<YYYY-MM>.jsonl`; (c) UTF-8 encoding; (d) closed-set 12-field whitelist enforced via Zod parse on write — every line is parseable by Story 6.7 with NO extra fields. Story 6.6 OQ-2 documents the file rotation deferral — Story 6.6 writes ALL records of a given month to `<YYYY-MM>.jsonl`; rotation/archival is Story 6.8.'
  - story: '6.8'
    reason: 'CROSS-STORY COORDINATION — Story 6.8 (auto-archival of runs and telemetry) ROTATES the JSONL files Story 6.6 writes (telemetry > 12 months). Story 6.6 OQ-2 documents that rotation is OUT OF SCOPE — Story 6.6 writes records to `<YYYY-MM>.jsonl` indefinitely; Story 6.8 archives older months on Stepper start.'
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/implementation-artifacts/6-1-bmad-stepper-config-yaml-schema-loader.md
  - _bmad-output/implementation-artifacts/6-2-dag-overrides-block.md
  - _bmad-output/implementation-artifacts/6-3-models-per-step-config.md
  - _bmad-output/implementation-artifacts/6-4-budgets-per-step-config.md
  - _bmad-output/implementation-artifacts/6-5-verifiers-per-step-config-override.md
  - _bmad-output/implementation-artifacts/2-6-verify-and-advance-ts-with-state-hash-check.md
  - _bmad-output/implementation-artifacts/2-5-markdown-transcript-json-run-log-writers.md
  - _bmad-output/implementation-artifacts/1-5-schemas-migrations-skeleton.md
  - _bmad-output/implementation-artifacts/sprint-status.yaml
  - _bmad-output/implementation-artifacts/epic-5-retrospective.md
  - _bmad-output/implementation-artifacts/epic-4-retrospective.md
  - .bmad-stepper/state.yaml
  - .bmad-stepper/config.yaml
  - src/schemas/config.ts
  - src/schemas/config.test.ts
  - src/schemas/telemetry.ts
  - src/schemas/telemetry.test.ts
  - src/migrations/telemetry/index.ts
  - src/config/load.ts
  - src/config/defaults.ts
  - src/config/index.ts
  - src/errors.ts
  - src/errors.test.ts
  - src/io/log.ts
  - src/io/atomic-write.ts
  - src/io/paths.ts
  - src/commands/next/run.ts
  - src/commands/next/run.test.ts
  - src/commands/next/verify-and-advance.ts
  - src/commands/next/verify-and-advance.test.ts
  - src/commands/loop/run.ts
  - src/commands/loop/run.test.ts
  - commands/bmad-next.md
  - commands/bmad-loop.md
  - docs/configuration.md
---

# Story 6.6: Telemetry Opt-In Collection

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper maintainer (dogfood-validation),
I want opt-in telemetry to write a JSONL record per step run with a closed-set field whitelist (no PII enforcement),
So that I have a data source for the 60-day decision and the user can never accidentally leak source content.

## Context Summary

This is the **SIXTH STORY of Epic 6** and lands the **opt-in telemetry collection consumer at the verify-and-advance step-completion finalization site + the closed-set NFR-S3 anti-PII enforcement via `TelemetryRecordV1Schema.parse()` on every write**. Story 6.1 shipped the `loadConfig()` file loader + the `TelemetrySchema = z.object({ enabled: z.boolean() })` at `src/schemas/config.ts:286-288` AND `Config.telemetry: TelemetrySchema` at `src/schemas/config.ts:336` AND `paths.telemetry: z.string()` at `src/schemas/config.ts:274` (default `_bmad-output/.stepper/telemetry/` per `src/config/defaults.ts:48`). Story 1.5 ALREADY shipped (a) `TelemetryRecordV1Schema` at `src/schemas/telemetry.ts:22-37` with closed-set 12-field whitelist + `.strict()` (rejects extra fields per NFR-S3); (b) the foundational migration registry at `src/migrations/telemetry/index.ts`. Story 2.5 ALREADY shipped `writeStepTranscript({...})` as the canonical step-finalization sink at the verify-and-advance `finally` block (lines 1609-1665). Story 2.6 ALREADY wires the `RunVerifyAndAdvanceOptions.config?` seam (extended through Stories 5.6 + 6.1 + 6.2 + 6.3 + 6.4 + 6.5).

**Story 6.6 is therefore primarily a NEW MID-TIER MODULE creation + a CONSUMER-SIDE wiring at the verify-and-advance finally block**:

1. **NEW module `src/telemetry/`** with three new files:
   - `src/telemetry/collect.ts` — exports `writeTelemetryRecord(record, opts)` that takes a `TelemetryRecord` (parsed via `TelemetryRecordV1Schema.parse()` defence-in-depth), computes the target file path via `<paths.telemetry>/<YYYY-MM>.jsonl`, and APPENDS the JSON-stringified record + `\n` via `Bun.file(...).writer()` append mode (the standard JSONL append pattern).
   - `src/telemetry/collect.test.ts` — colocated Bun tests covering AC-1 (write success), AC-2 (Zod rejection on extra fields), AC-3 (no-write when disabled).
   - `src/telemetry/index.ts` — barrel re-exporting `writeTelemetryRecord` (canonical mid-tier surface).

2. **EXTENDED seam at `RunVerifyAndAdvanceOptions.config?`** — add `telemetry?: import("../../schemas/config.ts").Telemetry` field (mirror Story 6.5 `verifiers?: Verifiers` add). Same extension at `RunNextOptions.config?` + `LoopOpts.config?` + both `loadConfigOverride` return types.

3. **CONSUMER WIRING at `verify-and-advance.ts` finally block** — after `writeStepTranscript` (line 1624) AND before `cleanStagingOrphans` (line 1655), add a best-effort telemetry write block:
   ```ts
   // Step 12.25: Story 6.6 — opt-in telemetry write (best-effort).
   if (
     opts?.config?.telemetry?.enabled === true &&
     handle !== undefined &&
     dispatchSpec !== undefined
   ) {
     try {
       const record: TelemetryRecord = {
         schemaVersion: 1,
         ts: opts?.nowIso ?? new Date().toISOString(),
         step: dispatchSpec.step,
         phase: derivePhase(dispatchSpec.step, opts?.dag),
         persona: dispatchSpec.persona ?? "<unspecified>",
         model: dispatchSpec.model ?? "sonnet",
         durationMs: Math.round(performance.now() - startMs),
         verifierStatus: verifierResult?.status ?? "skip",
         retries: accumulatedRunHistoryFromRetries.length,
         tokensIn: args.tokensIn ?? 0,
         tokensOut: args.tokensOut ?? 0,
         ...(outcomeError !== undefined ? { errorCode: outcomeError.errorCode } : {}),
       };
       await writeTelemetryRecord(record, { telemetryRoot: opts?.telemetryRoot });
     } catch (telemetryErr) {
       log.warn(
         `verify-and-advance: telemetry write failed (non-fatal): ${telemetryErr instanceof Error ? telemetryErr.message : String(telemetryErr)}`,
       );
     }
   }
   ```

4. **OPT-IN GATING (AC-3 PRIMARY mechanism)**: when `opts?.config?.telemetry?.enabled !== true` (which includes the explicit `false` AND the `undefined` case when no config is loaded), the entire telemetry block is SKIPPED — ZERO file system writes to `paths.telemetry`. AC-3 byte-identical: "no telemetry files are written" — verified by an integration test that runs verify-and-advance with `telemetry.enabled: false` (default) and asserts the telemetry directory remains empty (or non-existent).

5. **CLOSED-SET FIELD WHITELIST (AC-2 PRIMARY mechanism)**: `writeTelemetryRecord(record, opts)` calls `TelemetryRecordV1Schema.parse(record)` BEFORE serializing. The schema is ALREADY `.strict()` from Story 1.5 — extra fields throw a Zod error with the unrecognized-keys path. The CI test passes a malformed record (`{ ...validRecord, password: "secret" }` synthetic) and asserts the throw. AC-2 byte-identical: "Zod validation fails (NFR-S3 enforcement); CI test verifies a malformed record is rejected".

The runners (`src/commands/next/run.ts` + `src/commands/loop/run.ts`) thread `opts.config?.telemetry` from `loadConfig()` through the `RunNextOptions.config` + `RunVerifyAndAdvanceOptions.config` seams to the consumer once Story 6.1's `loadConfig()` is in the call chain (already wired). This is the canonical Story 6.1 SDR I-27 deliverable: ZERO loader-API change for Story 6.6; consumption through the typed `Config.telemetry` field.

### What is in scope (Story 6.6)

1. **NEW file `src/telemetry/collect.ts`** — exports `writeTelemetryRecord(record: TelemetryRecord, opts?: { telemetryRoot?: string; nowIso?: string }): Promise<{ filePath: string }>`. The function:
   - Calls `TelemetryRecordV1Schema.parse(record)` defence-in-depth (AC-2 mechanism — extra fields throw; the throw propagates to the caller verify-and-advance which wraps in best-effort try/catch + log.warn).
   - Computes `filePath = path.join(telemetryRoot ?? DEFAULT_TELEMETRY_ROOT, `${ts.slice(0, 7)}.jsonl`)` where `ts.slice(0, 7)` extracts `YYYY-MM` from the ISO timestamp.
   - `assertWithinScope(filePath)` per AR42 + NFR-S5 (the telemetry path IS within `_bmad-output/.stepper/`).
   - `mkdir -p` the parent directory (idempotent — Bun's `mkdir({ recursive: true })`).
   - APPENDS `JSON.stringify(record) + "\n"` to the file via `Bun.file(filePath).writer({ append: true })` (or equivalent append-mode write — the JSONL standard pattern).
   - Returns `{ filePath }` so the caller can include the path in audit logs (DEFERRED per OQ-3 — caller does NOT log the path; the audit trail lives in the file itself).
   - DEFAULT_TELEMETRY_ROOT = `_bmad-output/.stepper/telemetry/` (matches `src/config/defaults.ts:48`).

2. **NEW file `src/telemetry/collect.test.ts`** — Bun-test colocated tests:
   - **TLM_66_COLLECT_WRITE_***: AC-1 — write a valid record to a tmpdir telemetry root → assert the file exists, contains exactly one line, parses back to the same record via `JSON.parse + TelemetryRecordV1Schema.parse`.
   - **TLM_66_COLLECT_APPEND_***: AC-1 — write two records to the same `<YYYY-MM>.jsonl` → assert two lines, both parse correctly.
   - **TLM_66_COLLECT_REJECT_EXTRA_***: AC-2 PRIMARY — call with `{ ...validRecord, password: "secret" }` → expect Zod throw with `password` in the unrecognized-keys path.
   - **TLM_66_COLLECT_REJECT_MISSING_***: defence-in-depth — call with a missing required field (e.g., omit `step`) → expect Zod throw.
   - **TLM_66_COLLECT_REJECT_BAD_VERIFIER_STATUS_***: defence-in-depth — call with `verifierStatus: "passing"` (typo) → expect Zod throw (enum constraint).
   - **TLM_66_COLLECT_PATH_***: assert filePath is `<telemetryRoot>/<YYYY-MM>.jsonl` for various ts inputs (e.g., `2026-05-05T12:34:56.000Z` → `2026-05.jsonl`).
   - **TLM_66_COLLECT_MKDIR_***: assert mkdir-p is idempotent — call twice with a non-existent parent → both succeed.
   - **TLM_66_COLLECT_NO_PII_***: NFR-S3 worked example — every accepted field is in the closed-set whitelist; assert that the schema's `.strict()` rejects each forbidden field surface (e.g., `userInput`, `prompt`, `response`, `cwd`, `homeDir`, `email`, `apiKey`).

3. **NEW file `src/telemetry/index.ts`** — barrel re-export:
   ```ts
   export { writeTelemetryRecord } from "./collect.ts";
   export type { TelemetryRecord } from "../schemas/telemetry.ts";
   ```

4. **`RunVerifyAndAdvanceOptions.config.telemetry?` extension** — at `src/commands/next/verify-and-advance.ts:247-258`, extend the inline `config?` type — add `telemetry?: import("../../schemas/config.ts").Telemetry;` after the existing `verifiers?: Verifiers` field. Update JSDoc above the `config?` field to document Story 6.6 telemetry field per the same pattern as Story 5.6 failurePolicies + Story 6.5 verifiers.

5. **`RunVerifyAndAdvanceOptions.telemetryRoot?` test seam** — at `src/commands/next/verify-and-advance.ts:RunVerifyAndAdvanceOptions`, add an optional `telemetryRoot?: string` field (TEST-only — production path uses `paths.telemetry` from config; the seam allows tmpdir-isolation in Bun tests). Mirror the Story 2.6 `runsRoot?` test seam pattern (already present at the same options shape).

6. **Telemetry consumer in `verify-and-advance.ts` finally block** — at the existing `finally` block (lines 1609-1665), insert a NEW Step 12.25 (between transcript write Step 12 and cleanStagingOrphans Step 12.5) that builds the `TelemetryRecord` from the closure-captured fields (dispatchSpec, verifierResult, accumulatedRunHistoryFromRetries, args.tokensIn/tokensOut, startMs, outcomeError) and calls `writeTelemetryRecord(record, { telemetryRoot: opts?.telemetryRoot })`. The block is best-effort (try/catch + log.warn) and gated on `opts?.config?.telemetry?.enabled === true` per AC-3.

7. **`RunNextOptions.config.telemetry?` extension** — at `src/commands/next/run.ts:330-343`, extend the inline `config?` type (currently `{ failurePolicies?, overrides?, models?, budgets?, verifiers? }`) with `telemetry?: import("../../schemas/config.ts").Telemetry`. Same extension at `loadConfigOverride` return type at lines 361-375.

8. **`LoopOpts.config.telemetry?` extension** — at `src/commands/loop/run.ts:468-479`, extend `LoopOpts.config?` with `telemetry?: Telemetry` (mirror Story 6.5 verifiers add) + extend `loadConfigOverride` return type (lines 492-506) with `telemetry?: Telemetry` + extend the local `effectiveConfig` type so `productionRunNextFn` threads `telemetry` through to `runNext` and downstream to `verify-and-advance`.

9. **Cross-runner threading at runNext → verify-and-advance** — at `src/commands/next/run.ts`, the runner consults `opts.config?` and ultimately the `verify-and-advance.ts` step uses `RunVerifyAndAdvanceOptions.config?.telemetry` to gate the JSONL write. The threading is via the existing `opts.config` seam (Story 5.6 frozen) — Story 6.6 only extends the TYPE shape; the existing config-flow (run.ts → verify-and-advance.ts) ALREADY forwards opts.config; ZERO behavioural change beyond the new field. (Confirm this in Task 1 read pass.)

10. **Tests** — colocated `src/telemetry/collect.test.ts` (~10 tests) + `src/commands/next/verify-and-advance.test.ts` extension (~3 tests for AC-1 happy-path + AC-3 disabled gate + AC-2 Zod-throw → log.warn) + `src/commands/next/run.test.ts` extension (~2 tests for telemetry config threading) + `src/commands/loop/run.test.ts` extension (~2 tests for telemetry config threading via loadConfigOverride):
    - **TLM_66_VANDA_***: AC-1 + AC-3 — supply `opts.config = { telemetry: { enabled: true } }` + `opts.telemetryRoot = tmpdir` → after runVerifyAndAdvance returns, assert the `<YYYY-MM>.jsonl` file exists with one line. Symmetric test with `telemetry.enabled: false` → assert no telemetry file written.
    - **TLM_66_VANDA_REJECT_***: AC-2 — supply `opts.config.telemetry.enabled: true` BUT inject a synthetic test seam (`writeTelemetryRecordOverride?: typeof writeTelemetryRecord`) that throws on Zod parse → assert log.warn called with the error message; assert the verify-and-advance result is UNCHANGED (verifier outcome preserved; telemetry is best-effort).
    - **TLM_66_RUN_***: AC-1 wiring at runner — at `src/commands/next/run.test.ts`, supply `opts.config = { telemetry: { enabled: true } }` via the existing test seam. Verify the threading reaches `runVerifyAndAdvance` (via the runNext → verify-and-advance call chain). Symmetric test asserting absent config.telemetry → no override surfaces.
    - **TLM_66_LOOP_***: same pattern at `src/commands/loop/run.test.ts` — verify `loadConfigOverride` threads `telemetry` through to runNext + verify-and-advance.
    - **TLM_66_LOAD_***: NOT a separate test category — Story 6.1 already validates `TelemetrySchema` (`enabled: z.boolean()`) at LOAD time. Story 6.6 inherits this coverage; add a smoke test if the existing `src/schemas/config.test.ts` does not already exercise `telemetry: { enabled: "yes" }` rejection (verify in Task 1 read pass).

11. **Documentation refresh** — update `docs/configuration.md` `telemetry:` section (currently lines 514-526):
    - REMOVE the "aggregation and reporting are deferred to Stories 6.6-6.7" line (line 521) — Story 6.6 lands the COLLECTION half.
    - ADD a "**Wiring (Story 6.6)**" sub-section: documents how `writeTelemetryRecord(record, opts)` threads through `verify-and-advance.ts` finally block; the closed-set 12-field schema with worked example record (mirror the Story 6.5 verifiers section structure).
    - ADD an "**NFR-S3 anti-PII boundary (AC-2)**" sub-section: documents that the schema is `.strict()` — every record passes through Zod parse defence-in-depth; extra fields throw a Zod error; CI test verifies rejection. Cross-link to architecture line 1664.
    - ADD an "**AC-3 opt-in gate**" sub-section: documents that `telemetry.enabled: false` (default) → ZERO file system writes; the gate is at `opts?.config?.telemetry?.enabled === true` strict comparison.
    - Update the forward-tracker section (Stories 6.3-6.6 list at lines 549-579): mark Story 6.6 as DONE; add "Story 6.7 — telemetry aggregation report (reads the JSONL files Story 6.6 writes)"; add "Story 6.8 — telemetry rotation (> 12 months) on Stepper start".
    - Cross-link to architecture line 1664 + AR41 §1283 (mid-tier boundary) + NFR-S3.
    - Forward-tracker section: close I-27 (Story 6.6 now CLOSED — telemetry consumer wired); update I-43 (6 sites accumulated; Story 6.x cleanup forward — DEFER).

### Cross-story coordination preserved

- **Story 6.1 SDR I-27 PRIMARY HONOURED** — Story 6.6 wires the telemetry consumer at the verify-and-advance step-completion finalization site. ZERO loader-API change for Story 6.6.
- **Story 6.3 SDR I-41 PRIMARY HONOURED** — model field reliable for telemetry; Story 6.6 reads `dispatchSpec.model` into the telemetry record's `model` field.
- **Story 1.5 schema baseline UNCHANGED** — `TelemetryRecordV1Schema` at `src/schemas/telemetry.ts` is the source-of-truth; Story 6.6 CONSUMES via parse-on-write defence-in-depth; ZERO schema mutation.
- **Story 2.5 transcript writer UNCHANGED at the API surface** — Story 6.6 adds a SECOND sink (telemetry JSONL) at the SAME finally block; ZERO mutation to `writeStepTranscript`.
- **Story 2.6 verify-and-advance.ts opts.config seam UNCHANGED** — Story 6.6 only adds `telemetry?: Telemetry` to the `opts.config?` shape; existing fields unchanged.
- **Story 5.6 + 6.1 + 6.2 + 6.3 + 6.4 + 6.5 `opts.config` seam UNCHANGED** — Story 6.6 reads from the same seam at the verify-and-advance tier; ZERO seam mutation beyond the `telemetry?: Telemetry` type extension.
- **Errors registry HELD AT 17** — Story 6.6 ships ZERO new error classes; the Zod parse failure inside `writeTelemetryRecord` is a programming-error throw (caller responsibility); the caller verify-and-advance wraps in best-effort try/catch.
- **Schema migration registry HELD AT v1** — ZERO mutation to `TelemetryRecordV1Schema` shape; only consumer wiring. NO `schemaVersion` bump.

### What is NOT in scope (deferred)

- **Telemetry aggregation report** — Story 6.7 — `bun run aggregate-telemetry --period <YYYY-MM>` produces the markdown report.
- **Telemetry auto-rotation** — Story 6.8 — `> 12 months` files moved to `telemetry/.archive/`.
- **Remote telemetry upload** — DEFERRED post-v0.1 per architecture line 1728.
- **Sampling rate field** — DEFERRED. v0.1 ships `enabled: boolean` only — no sampling.
- **Per-step telemetry override** — DEFERRED. v0.1 ships GLOBAL on/off — no per-step `telemetry: { steps: ["bmad-dev-story"] }` filter.
- **`--no-telemetry` CLI flag** — DEFERRED (Story 6.x — same forward-tracker as `--no-models` / `--no-budgets` / `--no-verifiers`).
- **Telemetry record extension fields** — DEFERRED. v0.1 ships the closed-set 12-field whitelist verbatim; future extensions require schemaVersion bump (per Story 6.1 SDR I-27 forward-tracker discipline).
- **Shared `getStepConfig(config, sectionKey, stepName, default)` helper** — Story 6.4 I-43 carry-over. Story 6.6 OQ-7 DEFERS — telemetry is consumed at a DIFFERENT tier (verify-and-advance finally) than the dispatch-tier configs (models / budgets / failurePolicies / overrides / verifiers); telemetry is also a GLOBAL on/off (no per-step lookup). Forward-tracker I-43 carries unchanged.

### Architectural challenges resolved here

**Architectural decision — telemetry write happens INSIDE the held lock (per OQ-1)**: AC-1 verbatim says "every step completes (success or failure)" + "writes one JSONL line". The write site MUST be at the step-completion finalization point — the canonical site is `verify-and-advance.ts` finally block (Story 2.6 baseline). The lock is held throughout the finally block per AR8 contract (architecture line 1672 — the lock is released LAST in the finally block via `releaseLockBestEffort`). **Story 6.6 chooses placement INSIDE the held lock** — between Step 12 (transcript write) and Step 12.5 (cleanStagingOrphans). Rationale: (a) the verifierResult + transcript + telemetry triple is logically atomic per step; (b) the JSONL append-mode write is per-process serial (no concurrent writer to the same `<YYYY-MM>.jsonl` file in v0.1 — single-runner contract); (c) keeping the write inside the lock avoids a future-me bug where a concurrent verify-and-advance attempt for the SAME run-id writes a duplicate record between the lock release and a subsequent telemetry tick. The write is best-effort (try/catch + log.warn) so a failure does NOT mask the verifier outcome.

**Architectural decision — JSONL append-mode (per OQ-2)**: AC-1 verbatim "writes one JSONL line to `_bmad-output/.stepper/telemetry/<YYYY-MM>.jsonl`" mandates JSONL (one-record-per-line, newline-delimited JSON). v0.1 uses Bun's `Bun.file(filePath).writer({ append: true })` API for append-mode (no full-file read+rewrite — efficient for many records). The atomicity per record is the standard JSONL guarantee — POSIX `O_APPEND` writes < PIPE_BUF size are atomic; a TelemetryRecord JSON line is well under 1 KB so this is safe. **Story 6.6 OQ-2 EXPLICITLY DOES NOT use `atomicWrite` (tmp+rename)** — that helper is for read-modify-write of single-document files (state.yaml, run-log.json); JSONL is append-only. The `.bak` rotation pattern of `atomicWrite` would defeat the append semantics.

**Architectural decision — closed-set field whitelist via .strict() defence-in-depth (per OQ-3 + AR42 + NFR-S3)**: AC-2 verbatim "any field outside the whitelist" → "Zod validation fails (NFR-S3 enforcement)". The TWO-LAYER enforcement is: (a) the schema declares ONLY the 12 whitelisted fields (architecture line 1664) — the type system rejects extra fields at compile time; (b) `TelemetryRecordV1Schema.parse(record)` at the write site rejects extra fields at runtime via `.strict()` (already applied in Story 1.5 baseline at `src/schemas/telemetry.ts:37`). **Story 6.6 ADDS the runtime parse-on-write step** — the schema-only declaration is insufficient because TypeScript's structural typing allows excess properties to slip through unsafe casts; runtime parse is the safety net. The CI test (TLM_66_COLLECT_REJECT_EXTRA_*) supplies a malformed record (synthetic excess field like `password: "secret"`) and asserts the Zod throw.

**Architectural decision — opt-in gating at the strict-equals comparison (per OQ-4 + AC-3)**: AC-3 verbatim "telemetry.enabled is false (default) → no telemetry files are written". The gate uses `opts?.config?.telemetry?.enabled === true` (STRICT EQUALS) — this rejects (a) the default `false`, (b) the `undefined` case (no config loaded), AND (c) any falsy-but-not-false case (e.g., `null`, `0`, `""`). The strict-equals pattern is consistent with Story 5.6's `policy === "escalate"` resolution + Story 6.5's `mode === "replace"` dispatch. The integration test (TLM_66_VANDA_DISABLED_*) runs verify-and-advance with `telemetry.enabled: false` and asserts the telemetry directory is empty (or non-existent — the `mkdir -p` is also gated).

**Architectural decision — mid-tier module placement per AR41 (per OQ-5)**: `src/telemetry/` is MID-TIER per architecture line 1283 (alongside `migrations/`, `state/`, `transcript/`, `upgrade/`). Story 6.6 places `collect.ts` in this tier — allowed imports = foundational (errors, schemas, io). Specifically, `src/telemetry/collect.ts` imports: (a) `import { TelemetryRecordV1Schema, type TelemetryRecord } from "../schemas/telemetry.ts"` (foundational schema tier); (b) `import { assertWithinScope } from "../io/paths.ts"` (foundational io tier); (c) `import * as fs from "node:fs/promises"` for mkdir; (d) `import * as path from "node:path"` for path.join; (e) NO higher-tier or top-tier imports. The consumer (`src/commands/next/verify-and-advance.ts`) imports from `src/telemetry/` (top-tier consumes mid-tier — allowed per AR41).

**Architectural decision — derive phase + persona + model from dispatchSpec (per OQ-6)**: the TelemetryRecord requires `phase`, `persona`, `model`. These come from:
- `phase`: derived via the existing `derivePhase(stepName, dag)` helper at `src/commands/next/verify-and-advance.ts:393-407` (already imported and used for the checkpoint matcher per Story 4.8). v0.1 ships the 2-phase fallback (planning vs implementation) when the DAG is not injected; full 5-phase coverage when the DAG is supplied (Story 6.6 OQ-6 documents the fallback).
- `persona`: read from `dispatchSpec.persona`. The dispatch-spec already carries this field per Story 1.11 baseline. Fallback: when `persona === undefined` (rare — always populated in v0.1), use `"<unspecified>"`.
- `model`: read from `dispatchSpec.model`. Story 6.3 wired the model field with default "sonnet" — the field is ALWAYS populated. Fallback: `"sonnet"` (defensive — should never trigger in v0.1).

**Architectural decision — log.warn on telemetry failure (per OQ-8 + AR21)**: AC-1 + AC-3 are silent on failure handling. Story 6.6 chooses **best-effort with log.warn fallback** — a Zod parse error or filesystem ENOSPC must NOT mask the verifier outcome (the verifier's pass/fail is the load-bearing user-facing signal). The catch block writes ONE single-line log.warn ("verify-and-advance: telemetry write failed (non-fatal): <message>") per AR21. The verify-and-advance result is UNCHANGED — the caller sees the same exitCode + action regardless of telemetry write success. Mirror Story 2.5's transcript-write fallback pattern at lines 1645-1648.

**Architectural decision — slash-command markdown UNCHANGED (per OQ-9)**: Stories 6.3 + 6.4 added small caveat paragraphs to `commands/bmad-{next,loop}.md` documenting Task tool model parameter pass-through (best-effort). Story 6.6 has NO analogous Task-tool seam — the telemetry write happens Bun-side in verify-and-advance.ts, the JSONL records never cross the AR9 boundary into the slash-command markdown. ZERO mutation to `commands/bmad-{next,loop}.md` for Story 6.6.

**Architectural decision — telemetryRoot test seam (per OQ-10)**: production callers consume `paths.telemetry` from config (via `loadConfig()` then `RunVerifyAndAdvanceOptions.telemetryRoot ?? defaultTelemetryRoot` resolution chain). The `telemetryRoot?` seam at `RunVerifyAndAdvanceOptions` allows tmpdir-isolation in Bun tests (mirror the Story 2.6 `runsRoot?` pattern at the same options shape). NO production callers supply `telemetryRoot` — only tests.

### Concretely, Story 6.6 produces

- **NEW file 1**: `src/telemetry/collect.ts` (~80-120 LoC including JSDoc) — exports `writeTelemetryRecord(record, opts?)`. JSDoc documents Story 6.6 + AR41 mid-tier + AR42 schema-first + AR17 + NFR-S3 closed-set + ALL 12 whitelisted fields with intent.
- **NEW file 2**: `src/telemetry/collect.test.ts` (~150-200 LoC) — 8-10 TLM_66_COLLECT_* tests covering write/append/reject-extra/reject-missing/reject-bad-status/path/mkdir/no-PII.
- **NEW file 3**: `src/telemetry/index.ts` (~10 LoC) — barrel re-export.
- **MODIFIED file 1**: `src/commands/next/verify-and-advance.ts` — extends `RunVerifyAndAdvanceOptions.config?` with `telemetry?: Telemetry` + adds `telemetryRoot?: string` test seam + adds `writeTelemetryRecordOverride?` test seam + adds Step 12.25 telemetry write block in finally (best-effort try/catch + opt-in gate). Net additions: ~50-60 LoC (~30 logic + ~30 JSDoc + type imports).
- **MODIFIED file 2**: `src/commands/next/verify-and-advance.test.ts` — adds 3-4 TLM_66_VANDA_* tests covering AC-1 happy-path + AC-3 disabled gate + AC-2 Zod-throw → log.warn + best-effort fall-through. Net additions: ~120-150 LoC.
- **MODIFIED file 3**: `src/commands/next/run.ts` — extends `RunNextOptions.config?` with `telemetry?: Telemetry` (line 343) + extends `loadConfigOverride` return type (lines 361-375). Net additions: ~3 LoC.
- **MODIFIED file 4**: `src/commands/next/run.test.ts` — adds 1-2 TLM_66_RUN_* tests asserting opts.config.telemetry flows through to runVerifyAndAdvance. Net additions: ~50 LoC.
- **MODIFIED file 5**: `src/commands/loop/run.ts` — extends `LoopOpts.config?` with `telemetry?: Telemetry` + extends `loadConfigOverride` return type + extends local `effectiveConfig` type. Net additions: ~6 LoC.
- **MODIFIED file 6**: `src/commands/loop/run.test.ts` — adds 1-2 TLM_66_LOOP_* tests asserting opts.config.telemetry flows through productionRunNextFn. Net additions: ~50 LoC.
- **MODIFIED file 7**: `docs/configuration.md` — extends the `telemetry:` section with Story 6.6 wiring note + NFR-S3 anti-PII boundary + AC-3 opt-in gate + cross-links + forward-tracker update (closes I-27). Net additions: ~50-60 LoC.

3 NEW files. ZERO new error classes. ZERO new schema migrations (TelemetryRecordV1Schema unchanged). ZERO mutations to: `src/errors.ts`, `src/migrations/telemetry/index.ts` (registry data unchanged — current = 1, versions = { 1: TelemetryRecordV1Schema }, migrations = {}), `src/schemas/telemetry.ts` (schema source-of-truth unchanged), `src/schemas/config.ts` (TelemetrySchema baseline unchanged from Story 6.1), `src/dag/*`, `src/state/*`, `src/dispatch/*` (Story 6.6 wires the verify-and-advance finally tier, NOT the dispatch tier), `src/failure-ux/*`, `src/runs/*` (transcript + run-log unchanged), `src/verifiers/*` (verifier orchestration unchanged), `commands/bmad-next.md`, `commands/bmad-loop.md` (no slash-command markdown change per OQ-9).

## Acceptance Criteria

The following are reproduced byte-identical from `_bmad-output/planning-artifacts/epics.md` lines 1237-1245:

**Given** `telemetry: { enabled: true }` in config
**When** every step completes (success or failure)
**Then** `src/telemetry/collect.ts` writes one JSONL line to `_bmad-output/.stepper/telemetry/<YYYY-MM>.jsonl` validated against `TelemetryRecordV1Schema` (closed set: `schemaVersion, ts, step, phase, persona, model, durationMs, verifierStatus, retries, tokensIn, tokensOut, errorCode?`)
**Given** any field outside the whitelist
**When** writing
**Then** Zod validation fails (NFR-S3 enforcement); CI test verifies a malformed record is rejected
**Given** `telemetry.enabled` is false (default)
**When** steps complete
**Then** no telemetry files are written

## Tasks / Subtasks

- [x] 1. **Context — read all relevant files completely** (carry-over discipline from Stories 6.1 + 6.2 + 6.3 + 6.4 + 6.5)
  - [x] 1.1 Read `_bmad-output/implementation-artifacts/6-5-verifiers-per-step-config-override.md` — focus on (a) the Forward Action Items section (4 nits N-1/N-2/N-3/N-4 + 46 info I-1..I-46 cumulative; I-26 + I-46 + I-38 CLOSED at Story 6.5; I-27 + I-41 to Story 6.6 PRIMARY HONOURED here); (b) the SDR Quality Gates table baseline (1470/0/4830 across 70 files; errors registry 17); (c) the Story 6.5 close: `verifiers:` consumer wired at registry merge + `.strict()` schema-strictness pattern; AR9 invariants preserved.
  - [x] 1.2 Read `_bmad-output/implementation-artifacts/6-1-bmad-stepper-config-yaml-schema-loader.md` — focus on (a) Story 6.1 SDR I-27 verbatim ("`TelemetrySchema` v0.1 minimal; Story 6.6 may extend via schema bump"); (b) the loader's typed Config.telemetry surface (`TelemetrySchema = z.object({ enabled: z.boolean() })`); (c) docs/configuration.md `telemetry:` section.
  - [x] 1.3 Read `_bmad-output/implementation-artifacts/2-6-verify-and-advance-ts-with-state-hash-check.md` — focus on (a) the `RunVerifyAndAdvanceOptions` shape; (b) the canonical finally block sequence (Steps 12 transcript + 12.5 cleanStagingOrphans + 13 lock release at lines 1609-1665); (c) the `runsRoot?` test seam pattern (Story 6.6 mirrors with `telemetryRoot?`).
  - [x] 1.4 Read `_bmad-output/implementation-artifacts/2-5-markdown-transcript-json-run-log-writers.md` — focus on the `writeStepTranscript` API surface (Story 6.6 reuses the closure-captured fields: dispatchSpec, verifierResult, durationMs, tokensIn/tokensOut).
  - [x] 1.5 Read `_bmad-output/implementation-artifacts/1-5-schemas-migrations-skeleton.md` — focus on `TelemetryRecordV1Schema` shape + `.strict()` baseline + the schema migration registry.
  - [x] 1.6 Read `_bmad-output/implementation-artifacts/epic-5-retrospective.md` — Recommendations item 3 (registry stability — ZERO new error classes per Epic 6 start) + item 6 (cross-story coordination via opts.config seam).
  - [x] 1.7 Read `src/schemas/config.ts` (~347 lines) full pass — focus on (a) `TelemetrySchema = z.object({ enabled: z.boolean() })` at lines 286-288; (b) `Config.telemetry: TelemetrySchema` at line 336; (c) `paths.telemetry: z.string()` at line 274.
  - [x] 1.8 Read `src/schemas/telemetry.ts` (42 lines) full pass — focus on (a) `TelemetryRecordV1Schema` at lines 22-37 with closed-set 12-field whitelist + `.strict()`; (b) `TelemetryRecord` type alias at line 40; (c) `TelemetryRecordLatestSchema` alias at line 41.
  - [x] 1.9 Read `src/schemas/telemetry.test.ts` full pass — recover the existing TLM_15_* test density at the schema level; identify Story 6.6 test seam for `writeTelemetryRecord` (NOT in scope at the schema test surface — that lives at `src/telemetry/collect.test.ts`).
  - [x] 1.10 Read `src/migrations/telemetry/index.ts` (26 lines) — confirm the registry is wired (current = 1, versions = { 1: TelemetryRecordV1Schema }, migrations = {}). Story 6.6 does NOT mutate the migration registry.
  - [x] 1.11 Read `src/io/atomic-write.ts` (69 lines) — review the tmp+rename pattern. Story 6.6 OQ-2 EXPLICITLY does NOT use atomicWrite (JSONL is append-only); the design is `Bun.file(...).writer({ append: true })` or equivalent.
  - [x] 1.12 Read `src/io/paths.ts` — locate the `assertWithinScope` helper. Story 6.6 calls this at the top of `writeTelemetryRecord` per AR42 + NFR-S5.
  - [x] 1.13 Read `src/io/log.ts` (30 lines) — confirm the `info` / `warn` helpers (single-line discipline preserved per AR21).
  - [x] 1.14 Read `src/commands/next/verify-and-advance.ts` lines 1-150 + 240-300 + 1600-1680 — focus on (a) the `RunVerifyAndAdvanceOptions.config?` shape (lines 247-258 — failurePolicies + verifiers fields); (b) the finally block at lines 1609-1665 (Steps 12 + 12.5 + 13); (c) the `derivePhase(stepName, dag)` helper at lines 393-407; (d) the `runsRoot?` test seam pattern; (e) the `accumulatedRunHistoryFromRetries: RunHistoryEntry[]` retries-counter at line 850.
  - [x] 1.15 Read `src/commands/next/run.ts` lines 320-380 — focus on (a) `RunNextOptions.config?` at lines 330-343 (currently failurePolicies + overrides + models + budgets + verifiers); (b) `loadConfigOverride` return type at lines 361-375.
  - [x] 1.16 Read `src/commands/loop/run.ts` lines 460-510 + 840-900 — locate `LoopOpts.config?` at lines 468-479 + `loadConfigOverride` return type at lines 492-506 + local `effectiveConfig` type.
  - [x] 1.17 Read `docs/configuration.md` lines 510-590 — locate the existing `telemetry:` section + Forward-tracker section for the documentation refresh.
  - [x] 1.18 Read `src/errors.ts` — confirm registry holds 17 codes; Story 6.6 ships ZERO new error classes.
  - [x] 1.19 Read `src/integration/escalate-actionable-hint.test.ts` — confirm 33-test sweep covers all 17 error classes. Story 6.6 verifies this test passes UNCHANGED.

- [x] 2. **NEW `src/telemetry/collect.ts` module — `writeTelemetryRecord(record, opts?)` function**
  - [x] 2.1 Create `src/telemetry/collect.ts`. Module JSDoc documents Story 6.6 + AR41 mid-tier (architecture line 1283) + AR42 schema-first + NFR-S3 closed-set + AR17 (no source content / no PII) + AR21 single-line discipline.
  - [x] 2.2 Imports (foundational only per AR41): `import * as fs from "node:fs/promises"`; `import * as path from "node:path"`; `import { TelemetryRecordV1Schema, type TelemetryRecord } from "../schemas/telemetry.ts"`; `import { assertWithinScope } from "../io/paths.ts"`. NO higher-tier or top-tier imports.
  - [x] 2.3 Define `DEFAULT_TELEMETRY_ROOT = "_bmad-output/.stepper/telemetry/"` (matches `src/config/defaults.ts:48`).
  - [x] 2.4 Define `WriteTelemetryOptions` interface: `{ readonly telemetryRoot?: string }` (test seam — production callers omit; tests inject tmpdir).
  - [x] 2.5 Define `WriteTelemetryResult` interface: `{ readonly filePath: string }`.
  - [x] 2.6 Implement `writeTelemetryRecord(record: TelemetryRecord, opts?: WriteTelemetryOptions): Promise<WriteTelemetryResult>`:
    ```ts
    export async function writeTelemetryRecord(
      record: TelemetryRecord,
      opts?: WriteTelemetryOptions,
    ): Promise<WriteTelemetryResult> {
      // Step 1: defence-in-depth Zod parse (AC-2 mechanism — extra fields throw).
      const parsed = TelemetryRecordV1Schema.parse(record);

      // Step 2: derive YYYY-MM from ts (e.g., "2026-05-05T12:34:56Z" → "2026-05").
      const yearMonth = parsed.ts.slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
        throw new Error(
          `telemetry: ts must be ISO-8601 starting with YYYY-MM-DD (got ${parsed.ts.slice(0, 10)})`,
        );
      }

      // Step 3: compute target file path within scope.
      const root = opts?.telemetryRoot ?? DEFAULT_TELEMETRY_ROOT;
      const filePath = path.join(root, `${yearMonth}.jsonl`);
      assertWithinScope(filePath);

      // Step 4: ensure parent dir exists (idempotent).
      await fs.mkdir(path.dirname(filePath), { recursive: true });

      // Step 5: append JSON line + newline (JSONL standard).
      const line = `${JSON.stringify(parsed)}\n`;
      await fs.appendFile(filePath, line, "utf8");

      return { filePath };
    }
    ```
    Note: `fs.appendFile` is the simplest portable append — `Bun.file(...).writer({ append: true })` is an alternative if benchmarks favour it; either is acceptable per OQ-2.
  - [x] 2.7 Add JSDoc on `writeTelemetryRecord` documenting AC-1/AC-2/AC-3 + parameter shapes + return value.

- [x] 3. **NEW `src/telemetry/collect.test.ts` test file — `writeTelemetryRecord` coverage**
  - [x] 3.1 Create `src/telemetry/collect.test.ts`. Imports: bun-test (`test`, `expect`, `describe`); `node:fs/promises` for tmpdir + readFile; `node:os` + `node:path` for tmpdir + path; `import { writeTelemetryRecord } from "./collect.ts"`; `import type { TelemetryRecord } from "../schemas/telemetry.ts"`.
  - [x] 3.2 Helper: `function makeValidRecord(overrides?: Partial<TelemetryRecord>): TelemetryRecord` — returns `{ schemaVersion: 1, ts: "2026-05-05T12:34:56.000Z", step: "bmad-create-story", phase: "planning", persona: "po", model: "sonnet", durationMs: 12345, verifierStatus: "pass", retries: 0, tokensIn: 1000, tokensOut: 500, ...overrides }`.
  - [x] 3.3 Helper: `async function withTempDir(): Promise<string>` — creates `mkdtemp(path.join(os.tmpdir(), "stepper-telemetry-"))` (AR35 — tmpdir-per-test).
  - [x] 3.4 TLM_66_COLLECT_WRITE_1: AC-1 — write a valid record → assert filePath ends with `2026-05.jsonl`; assert file exists; readFile and split on `\n` (filter empty); expect ONE non-empty line; `JSON.parse` it; deep-equals the input record.
  - [x] 3.5 TLM_66_COLLECT_APPEND_1: AC-1 — write two valid records to the same telemetryRoot → expect TWO non-empty lines; both parse correctly.
  - [x] 3.6 TLM_66_COLLECT_DIFFERENT_MONTHS_1: write record with `ts: "2026-04-30..."` and another with `ts: "2026-05-01..."` → expect TWO files: `2026-04.jsonl` and `2026-05.jsonl`.
  - [x] 3.7 TLM_66_COLLECT_REJECT_EXTRA_1: AC-2 PRIMARY — call with `{ ...validRecord, password: "secret" } as any` → expect Zod throw; `password` in unrecognized-keys path. The CI test surface honoured here.
  - [x] 3.8 TLM_66_COLLECT_REJECT_EXTRA_2: AC-2 — call with `{ ...validRecord, prompt: "user input" } as any` → expect Zod throw with `prompt` in path.
  - [x] 3.9 TLM_66_COLLECT_REJECT_EXTRA_3: AC-2 — call with `{ ...validRecord, response: "model output" } as any` → expect Zod throw.
  - [x] 3.10 TLM_66_COLLECT_REJECT_EXTRA_4: AC-2 — call with `{ ...validRecord, cwd: "/Users/me" } as any` → expect Zod throw.
  - [x] 3.11 TLM_66_COLLECT_REJECT_MISSING_1: defence-in-depth — call with a missing required field (e.g., omit `step`) → expect Zod throw.
  - [x] 3.12 TLM_66_COLLECT_REJECT_BAD_VERIFIER_STATUS_1: defence-in-depth — call with `verifierStatus: "passing" as any` → expect Zod throw (enum constraint).
  - [x] 3.13 TLM_66_COLLECT_REJECT_BAD_TS_1: call with `ts: "not-a-date"` → expect throw (ts must start with YYYY-MM-DD per Step 2 in collect.ts).
  - [x] 3.14 TLM_66_COLLECT_PATH_1: assert filePath = `<telemetryRoot>/2026-05.jsonl` for `ts: "2026-05-15T10:00:00Z"`.
  - [x] 3.15 TLM_66_COLLECT_MKDIR_1: telemetryRoot is non-existent — first write succeeds (mkdir-p creates the dir).
  - [x] 3.16 TLM_66_COLLECT_OPTIONAL_ERROR_CODE_1: write record with `errorCode: "VERIFIER_FAILURE"` → assert the field is in the JSON line.
  - [x] 3.17 TLM_66_COLLECT_NO_OPTIONAL_ERROR_CODE_1: write record without `errorCode` → assert the field is ABSENT from the JSON line (not `errorCode: undefined`; clean optional-omit).
  - [x] 3.18 Run `bun test src/telemetry/collect.test.ts` — confirm all tests pass.

- [x] 4. **NEW `src/telemetry/index.ts` barrel module**
  - [x] 4.1 Create `src/telemetry/index.ts` with re-exports:
    ```ts
    /**
     * src/telemetry/index.ts — barrel for the telemetry mid-tier module
     * (Story 6.6 — FR39, FR40, FR45; NFR-S3, AR41).
     */
    export {
      writeTelemetryRecord,
      type WriteTelemetryOptions,
      type WriteTelemetryResult,
    } from "./collect.ts";
    export { TelemetryRecordV1Schema, type TelemetryRecord } from "../schemas/telemetry.ts";
    ```
  - [x] 4.2 Run `bunx tsc --noEmit` — verify the barrel compiles.

- [x] 5. **`RunVerifyAndAdvanceOptions.config.telemetry?` extension + telemetryRoot test seam**
  - [x] 5.1 At `src/commands/next/verify-and-advance.ts:247-258`, extend the `opts.config?` inline type — add `telemetry?: import("../../schemas/config.ts").Telemetry;` after the existing `verifiers?: Verifiers` field. Update JSDoc above the `config?` field to document Story 6.6 telemetry field per the same pattern as Story 5.6 failurePolicies + Story 6.5 verifiers.
  - [x] 5.2 At `RunVerifyAndAdvanceOptions`, add `readonly telemetryRoot?: string;` test seam (mirror Story 2.6 `runsRoot?` pattern). JSDoc: "Story 6.6 — test seam: when supplied, overrides the telemetry directory root for `writeTelemetryRecord`. Production callers omit this; the writer falls back to the default `_bmad-output/.stepper/telemetry/`."
  - [x] 5.3 At `RunVerifyAndAdvanceOptions`, add `readonly writeTelemetryRecordOverride?: typeof import("../../telemetry/index.ts").writeTelemetryRecord;` test seam (mirror Story 6.5 `verifierOverride?` pattern). JSDoc: "Story 6.6 — test seam: when supplied, replaces the imported `writeTelemetryRecord` with a stub. Tests pass a stub that throws to exercise the best-effort fall-through; production callers omit."
  - [x] 5.4 Run `bunx tsc --noEmit` to verify the type signature is non-breaking.

- [x] 6. **Telemetry consumer wiring at `verify-and-advance.ts` finally block**
  - [x] 6.1 At the top of `src/commands/next/verify-and-advance.ts`, add the type-only import: `import type { TelemetryRecord } from "../../schemas/telemetry.ts";` AND the runtime import: `import { writeTelemetryRecord as defaultWriteTelemetryRecord } from "../../telemetry/index.ts";` (mid-tier consumes mid-tier — allowed per AR41).
  - [x] 6.2 At the finally block (lines 1609-1665), insert a NEW Step 12.25 telemetry write block AFTER Step 12 transcript write and BEFORE Step 12.5 cleanStagingOrphans:
    ```ts
    // Step 12.25: Story 6.6 — opt-in telemetry write (best-effort).
    if (
      opts?.config?.telemetry?.enabled === true &&
      handle !== undefined &&
      dispatchSpec !== undefined
    ) {
      try {
        const record: TelemetryRecord = {
          schemaVersion: 1,
          ts: opts?.nowIso ?? new Date().toISOString(),
          step: dispatchSpec.step,
          phase: derivePhase(dispatchSpec.step, opts?.dag),
          persona: dispatchSpec.persona ?? "<unspecified>",
          model: dispatchSpec.model ?? "sonnet",
          durationMs: Math.round(performance.now() - startMs),
          verifierStatus: verifierResult?.status ?? "skip",
          retries: accumulatedRunHistoryFromRetries.length,
          tokensIn: args.tokensIn ?? 0,
          tokensOut: args.tokensOut ?? 0,
          ...(outcomeError !== undefined
            ? { errorCode: outcomeError.errorCode }
            : {}),
        };
        const writeFn =
          opts?.writeTelemetryRecordOverride ?? defaultWriteTelemetryRecord;
        await writeFn(record, {
          ...(opts?.telemetryRoot !== undefined
            ? { telemetryRoot: opts.telemetryRoot }
            : {}),
        });
      } catch (telemetryErr) {
        log.warn(
          `verify-and-advance: telemetry write failed (non-fatal): ${telemetryErr instanceof Error ? telemetryErr.message : String(telemetryErr)}`,
        );
      }
    }
    ```
  - [x] 6.3 Verify `derivePhase(stepName, dag)` is already imported / declared in the file (it is — at lines 393-407 per Story 4.8).
  - [x] 6.4 Verify `accumulatedRunHistoryFromRetries: RunHistoryEntry[]` is the closure variable carrying the retry count (it is — at line 850 per Story 5.1).
  - [x] 6.5 Verify `outcomeError?.errorCode` is the canonical errorCode source (it IS — `StepperError.errorCode: string` per Story 1.2 baseline at `src/errors.ts`).
  - [x] 6.6 Verify `dispatchSpec.persona` and `dispatchSpec.model` are populated fields per the dispatchSpec schema (they ARE — Story 6.3 wired `model` with default "sonnet"; persona has been populated since Story 1.11).
  - [x] 6.7 Run `bunx tsc --noEmit` to verify the chain types correctly.

- [x] 7. **`RunVerifyAndAdvance` tests — TLM_66_VANDA_* coverage**
  - [x] 7.1 TLM_66_VANDA_ENABLED_1: AC-1 — supply `opts.config = { telemetry: { enabled: true } }` + `opts.telemetryRoot = tmpdir` → after runVerifyAndAdvance returns successfully, assert the `<YYYY-MM>.jsonl` file exists with one line; the line parses to a valid TelemetryRecord with the expected step + verifierStatus + retries.
  - [x] 7.2 TLM_66_VANDA_DISABLED_1: AC-3 — supply `opts.config = { telemetry: { enabled: false } }` + `opts.telemetryRoot = tmpdir` → assert NO telemetry file written (the directory remains empty OR is non-existent — both acceptable since the gate is `=== true`).
  - [x] 7.3 TLM_66_VANDA_NO_CONFIG_1: AC-3 — supply `opts.config = undefined` → assert NO telemetry file written (the gate triggers on `=== true` strict-equals, falsy-default skipped).
  - [x] 7.4 TLM_66_VANDA_ZOD_REJECT_1: AC-2 best-effort fall-through — supply `opts.writeTelemetryRecordOverride = async () => { throw new ZodError(...); }` (test stub) + `opts.config.telemetry.enabled: true` → assert `runVerifyAndAdvance` returns the SAME exitCode + action as without the override (verifier outcome preserved); assert log.warn was called with "telemetry write failed" prefix.
  - [x] 7.5 TLM_66_VANDA_ON_VERIFIER_FAIL_1: AC-1 "every step completes (success or failure)" — set up the verifier to FAIL → assert telemetry file IS written (telemetry runs on every completion path including verifier-fail); assert `verifierStatus: "fail"` in the record.
  - [x] 7.6 TLM_66_VANDA_ON_HALT_1: AC-1 — set up an outcomeError throw path → assert telemetry file IS written with `errorCode: "<the error code>"` field present.
  - [x] 7.7 Run `bun test src/commands/next/verify-and-advance.test.ts` — confirm existing tests pass UNCHANGED + 6 new TLM_66_VANDA_* tests pass.

- [x] 8. **Runner-tier types — `RunNextOptions.config.telemetry?` + `LoopOpts.config.telemetry?` extensions**
  - [x] 8.1 At `src/commands/next/run.ts:330-343`, extend `RunNextOptions.config?` inline type — add `telemetry?: import("../../schemas/config.ts").Telemetry;` (mirror Story 6.5 verifiers add at line 342).
  - [x] 8.2 At `loadConfigOverride` return type at lines 361-375, extend with `telemetry?: import("../../schemas/config.ts").Telemetry;` for both the Promise-returning AND the synchronous-returning branches.
  - [x] 8.3 Confirm the verify-and-advance call site (search for `runVerifyAndAdvance` invocation in run.ts) ALREADY threads `opts.config` through; verify Story 6.6 needs to ALSO pass `opts.telemetryRoot` (production: undefined; tests inject). The test seam may already be in place — verify by inspecting Task 1.15 read pass.
  - [x] 8.4 At `src/commands/loop/run.ts:468-479`, extend `LoopOpts.config?` with `telemetry?: Telemetry` (mirror Story 6.5 verifiers add).
  - [x] 8.5 At `loadConfigOverride` return type at lines 492-506, extend with `telemetry?: Telemetry`.
  - [x] 8.6 At local `effectiveConfig` type, extend with `telemetry?: Telemetry`.
  - [x] 8.7 Confirm `productionRunNextFn` ALREADY threads `effectiveConfig` through to `runNext` (Stories 6.4 + 6.5 baseline); ZERO additional change needed at loop/run.ts beyond the type extension.

- [x] 9. **Runner-tier tests — TLM_66_RUN_* + TLM_66_LOOP_* coverage**
  - [x] 9.1 TLM_66_RUN_1: at `src/commands/next/run.test.ts`, supply `opts.config = { telemetry: { enabled: true } }` via the existing test seam. Verify the chain reaches `runVerifyAndAdvance` with the telemetry field intact (use a verifyAndAdvance test stub to capture opts.config.telemetry).
  - [x] 9.2 TLM_66_RUN_2: backwards-compat — symmetric test asserting absent config.telemetry → no override surfaces (telemetry stays undefined at the verify-and-advance opts.config).
  - [x] 9.3 TLM_66_LOOP_1: at `src/commands/loop/run.test.ts`, supply `opts.loadConfigOverride` returning `{ telemetry: { enabled: true } }` → verify `effectiveConfig.telemetry` flows through `productionRunNextFn` to `runNext` and downstream.
  - [x] 9.4 TLM_66_LOOP_2: backwards-compat — symmetric test asserting absent loadConfigOverride.telemetry → no override surfaces.

- [x] 10. **Documentation refresh — `docs/configuration.md`**
  - [x] 10.1 At `docs/configuration.md` lines 514-526, REMOVE the "aggregation and reporting are deferred to Stories 6.6-6.7" line (line 521) — Story 6.6 lands the COLLECTION half.
  - [x] 10.2 ADD a "**Wiring (Story 6.6)**" sub-section: documents `writeTelemetryRecord(record, opts?)` threading through `verify-and-advance.ts` finally block; the closed-set 12-field schema with worked example record (mirror Story 6.5 verifiers section structure). Cross-link to architecture line 1664.
  - [x] 10.3 ADD an "**NFR-S3 anti-PII boundary (AC-2)**" sub-section: documents that the schema is `.strict()` — every record passes through Zod parse defence-in-depth; extra fields throw a Zod error; CI test verifies rejection. Worked example: `{ ...validRecord, prompt: "..." }` → ZodError. Cross-link to architecture line 1664 + AR17 + AR42.
  - [x] 10.4 ADD an "**AC-3 opt-in gate**" sub-section: documents that `telemetry.enabled: false` (default) → ZERO file system writes; the gate is `opts?.config?.telemetry?.enabled === true` strict-equals comparison.
  - [x] 10.5 ADD a "**File path + JSONL append semantics**" sub-section: documents the `<YYYY-MM>.jsonl` file rotation derived from the record's `ts` field; documents that JSONL append-mode is used (NOT atomicWrite tmp+rename — JSONL is append-only); documents that monthly rotation is automatic via the ts → YYYY-MM derivation; documents that 12-month archival is Story 6.8.
  - [x] 10.6 Update the forward-tracker section at the bottom (Stories 6.3-6.6 list at lines 549-579): mark Story 6.6 as DONE; add "Story 6.7 — telemetry aggregation report (reads the JSONL files Story 6.6 writes)"; add "Story 6.8 — telemetry rotation (> 12 months) on Stepper start".
  - [x] 10.7 Cross-link to `_bmad-output/implementation-artifacts/6-6-telemetry-opt-in-collection.md` for the canonical Story 6.6 spec reference.

- [x] 11. **Quality gate verification + Forward Action Items update**
  - [x] 11.1 Run `bunx tsc --noEmit` from a fresh shell with `export PATH="$HOME/.bun/bin:$PATH"`; expect exit 0.
  - [x] 11.2 Run `bun run check` from a fresh shell; expect exit 0 + ~1490-1505/0/4870-4920 across 71 files (baseline 1470/0/4830 across 70 files + ~20-35 new tests in 1 NEW test file `src/telemetry/collect.test.ts` + ~6 new tests in modified verify-and-advance.test.ts + ~4 new tests in run.test.ts/loop/run.test.ts). Snapshot final test counts AFTER the LAST `biome --write` pass per N-3 discipline.
  - [x] 11.3 Run `grep -c "extends StepperError" src/errors.ts`; expect exit 0 = 17 (UNCHANGED — Story 6.6 ships ZERO new error classes).
  - [x] 11.4 Run `bun test src/integration/escalate-actionable-hint.test.ts`; expect 33/0/114 UNCHANGED (sweep over all 17 error classes).
  - [x] 11.5 Run `bun test src/telemetry/collect.test.ts`; expect ~16+ tests pass (8-10 TLM_66_COLLECT_* covering write/append/reject-extra/reject-missing/reject-bad-status/path/mkdir/no-PII).
  - [x] 11.6 Run `bun test src/commands/next/verify-and-advance.test.ts`; expect ~85+ tests pass (79 from Story 6.5 baseline + 6 new TLM_66_VANDA_*).
  - [x] 11.7 Run a "no-PII smoke test" — load every JSONL line written across the test suite and assert `Object.keys(record)` is a subset of the 12 whitelisted fields. (DEFERRED to dev-iter if the tmpdir cleanup discipline allows; otherwise covered by the schema parse-on-write defence.)
  - [x] 11.8 Update Forward Action Items section: close I-27 (PRIMARY HONOURED — telemetry consumer wired); close I-41 (PRIMARY HONOURED — model field consumed in telemetry record); carry I-43 (6 sites accumulated; Story 6.x cleanup forward — DEFER); inherit 4 NITs N-1..N-4 + 44 info I-1..I-46 minus the 2 closed → 44 cumulative; produce 0-2 NEW from Story 6.6 if uncovered during dev iter.

## Dev Notes

### Files Read in Task 1 (UPDATE not NEW)

The dev agent MUST read every UPDATE file completely before mutating, per the BMAD discipline of carrying full context. Each file's CURRENT state, what Story 6.6 changes, and what must be preserved:

1. **`src/schemas/config.ts`** (~347 lines) — UPDATE? NO — read-only.
   - **Current state**: defines `TelemetrySchema = z.object({ enabled: z.boolean() })` at lines 286-288; `Config.telemetry: TelemetrySchema` at line 336. Story 6.1 baseline.
   - **What Story 6.6 changes**: ZERO mutation. Story 6.6 CONSUMES the schema via type-only import.
   - **What must be preserved**: all schemas unchanged.

2. **`src/schemas/telemetry.ts`** (42 lines) — UPDATE? NO — read-only.
   - **Current state**: `TelemetryRecordV1Schema` at lines 22-37 with closed-set 12-field whitelist + `.strict()`. Story 1.5 baseline.
   - **What Story 6.6 changes**: ZERO mutation. Story 6.6 CONSUMES via parse-on-write.
   - **What must be preserved**: schema source-of-truth unchanged.

3. **`src/commands/next/verify-and-advance.ts`** (~1850 lines) — UPDATE
   - **Current state**: `RunVerifyAndAdvanceOptions.config?` at lines 247-258 declares `failurePolicies?` + `verifiers?`; `verifierOverride` test seam at lines 270-293; `runsRoot?` test seam (Story 2.6 baseline); `derivePhase(stepName, dag)` helper at lines 393-407; `accumulatedRunHistoryFromRetries: RunHistoryEntry[]` at line 850; finally block at lines 1609-1665 with Steps 12 (transcript) + 12.5 (cleanStagingOrphans) + 13 (lock release).
   - **What Story 6.6 changes**: ADD `telemetry?: Telemetry` field to `opts.config?`; ADD `telemetryRoot?: string` test seam; ADD `writeTelemetryRecordOverride?: typeof writeTelemetryRecord` test seam; INSERT Step 12.25 (telemetry write best-effort) between Step 12 and Step 12.5; ADD type-only import `TelemetryRecord` from `../../schemas/telemetry.ts`; ADD runtime import `defaultWriteTelemetryRecord` from `../../telemetry/index.ts`.
   - **What must be preserved**: all Story 5.6 failure-policy resolution + Story 5.1/5.2/5.3/5.4 retry/skip/route-to-fixer/escalate paths + Story 4.8 checkpoint-each + Story 4.9 SIGINT graceful exit + Story 1.8 snapshot detection + Story 2.6 state-hash-check + Story 2.5 transcript writer + AR8 lock-acquire-release contract.

4. **`src/commands/next/run.ts`** (~2356 lines) — UPDATE
   - **Current state**: `RunNextOptions.config?` at lines 330-343 declares `failurePolicies?, overrides?, models?, budgets?, verifiers?`; `loadConfigOverride` return type at lines 361-375.
   - **What Story 6.6 changes**: ADD `telemetry?: import("../../schemas/config.ts").Telemetry` to both type extensions.
   - **What must be preserved**: Stories 6.3 + 6.4 + 6.5 wiring at the dispatch-tier (modelOverride / budgetOverride / projectVerifiers conditional spread); Story 5.6 failurePolicies threading; Story 4.7 plan-first dry-run preview; Story 4.8 checkpoint-each integration.

5. **`src/commands/loop/run.ts`** (~1971 lines) — UPDATE
   - **Current state**: `LoopOpts.config?` at lines 468-479 declares `failurePolicies?, overrides?, models?, budgets?, verifiers?`; `loadConfigOverride` return type at lines 492-506; local `effectiveConfig` type. Stories 6.3 + 6.4 + 6.5 already extended each.
   - **What Story 6.6 changes**: ADD `telemetry?: Telemetry` to all three type sites.
   - **What must be preserved**: Story 4.1+ loop runner skeleton; Stories 4.2-4.6 stop-condition logic; Story 4.10 loop-exit-reason resume hint; Story 5.5 interactive pause; Story 5.6 failure-policy resolution.

6. **`docs/configuration.md`** (~596 lines) — UPDATE
   - **Current state**: `telemetry:` section at lines 514-526 with the schema-only note "aggregation and reporting are deferred to Stories 6.6-6.7" at line 521; forward-tracker section at lines 549-579 with Story 6.6 placeholder at line 579.
   - **What Story 6.6 changes**: REMOVE the line 521 deferred note; ADD Wiring + NFR-S3 anti-PII + AC-3 opt-in gate + file path + JSONL append semantics sub-sections; UPDATE forward-tracker section to close I-27 and add Stories 6.7 + 6.8.
   - **What must be preserved**: all other sections (personas, overrides, failurePolicies, models, budgets, paths, verifiers); the existing example YAML for telemetry preserved (`telemetry: { enabled: false }`); cross-references to architecture sections preserved.

### Files Created NEW (3)

1. **`src/telemetry/collect.ts`** (~80-120 LoC) — `writeTelemetryRecord(record, opts?)` function. AR41 mid-tier; foundational imports only.
2. **`src/telemetry/collect.test.ts`** (~150-200 LoC) — 8-10 TLM_66_COLLECT_* tests.
3. **`src/telemetry/index.ts`** (~10 LoC) — barrel re-export.

### State preserved

- `src/state/index.ts` — UNCHANGED (Story 6.6 does not touch state subsystem).
- `src/dag/build.ts` — UNCHANGED (Story 6.6 does not touch DAG).
- `_bmad-output/.stepper/state.yaml` — UNCHANGED at create-story step (workflow advance happens at runtime; state.yaml workflow.lastStep + .nextStep advance per /bmad-loop runtime contract).

## Project Structure Notes

- **Boundary AR41 preserved**: `src/telemetry/` is MID-TIER per architecture line 1283; allowed imports = foundational (errors, schemas, io) + sibling intra-module. Story 6.6 imports: (a) `../schemas/telemetry.ts` (foundational); (b) `../io/paths.ts` (foundational `assertWithinScope`); (c) `node:fs/promises` + `node:path` (allowed standard library). NO higher-tier or top-tier imports.
- **Boundary AR41 preserved (commands tier)**: `src/commands/next/verify-and-advance.ts` (TOP TIER) already imports from `src/dispatch/`, `src/schemas/`, `src/config/`, `src/verifiers/`, `src/runs/` — Story 6.6 ADDS `import { writeTelemetryRecord as defaultWriteTelemetryRecord } from "../../telemetry/index.ts"` (top-tier consumes mid-tier — allowed per AR41).
- **AR9 stdout invariant preserved**: telemetry writer does NOT emit AR9 lines; the JSONL is a separate file write per architecture §P5; Story 6.6 only adds a file-system write, not stdout output.
- **AR21+22 single-line constraint**: Story 6.6 adds ONE single-line log.warn fallback ("verify-and-advance: telemetry write failed (non-fatal): <message>") in the catch block. The existing `info()` lines unchanged.
- **AR17 security**: closed-set field whitelist (12 fields) enforced via `.strict()` schema declaration + parse-on-write defence-in-depth. NO source content / NO PII / NO out-of-project paths in any whitelisted field.
- **AR42 schema-first**: `TelemetryRecordV1Schema` at `src/schemas/telemetry.ts` is source-of-truth; Story 6.6 invokes `parse(...)` on every write.
- **NFR-S3 telemetry no PII**: AC-2 PRIMARY mechanism — Zod parse-on-write rejects any field outside the closed set. CI test (TLM_66_COLLECT_REJECT_EXTRA_*) verifies rejection.

## Library / Framework Requirements

- **Bun runtime** (Bun-only project per architecture).
- **Zod 4** — `TelemetryRecordV1Schema.strict()` already shipped at Story 1.5 baseline; same Zod 4 pattern.
- **`node:fs/promises`** — `fs.appendFile` for JSONL append-mode write; `fs.mkdir({ recursive: true })` for parent-dir creation.
- **`node:path`** — `path.join` for filePath assembly; `path.dirname` for mkdir target.
- **No new dependencies** — Story 6.6 is pure NEW-module + type/wire extension on existing infrastructure.

## Testing Standards

- Bun-test colocated tests (`*.test.ts` next to source).
- Use `safeParse` for schema-validation negative tests (consistent with existing TLM_15_* + CFG_61_TELEMETRY_* + BUD_64_SCHEMA_STRICT_* + VER_65_SCHEMA_STRICT_* patterns).
- Tmpdir-per-test pattern for `writeTelemetryRecord` integration tests (AR35 — `mkdtemp(path.join(os.tmpdir(), "stepper-telemetry-..."))`).
- Snapshot final test counts AFTER the LAST `biome --write` pass (N-3 discipline carried from Stories 6.2 + 6.3 + 6.4 + 6.5 SDRs).
- Verify `bunx tsc --noEmit` exit 0 + `bun run check` exit 0 from a fresh shell with `export PATH="$HOME/.bun/bin:$PATH"`.

## Previous Story Intelligence (from Story 6.5 close)

- **Quality gate baseline**: 1470/0/4830 across 70 files; errors registry 17 (Story 6.5 SDR confirmed). Story 6.6 expected delta: +20-35 tests / +50-85 expects / 1 NEW test file (`src/telemetry/collect.test.ts`); registry MUST stay at 17.
- **Story 6.5 wiring pattern** (mirror this for the verify-and-advance finally block extension): `RunVerifyAndAdvanceOptions.config.verifiers?: Verifiers` + conditional spread `...(opts?.config?.verifiers !== undefined ? { projectVerifiers: opts.config.verifiers } : {})` at the verifierFn call site. Story 6.6 mirrors at the writeTelemetryRecord call site, gated on `opts?.config?.telemetry?.enabled === true`.
- **Story 6.5 SDR I-27 PRIMARY HONOURED HERE** — Story 6.6 wires the telemetry consumer.
- **Story 6.5 SDR I-41 PRIMARY HONOURED HERE** — Story 6.6 reads `dispatchSpec.model` into the telemetry record.
- **Story 6.5 SDR I-43 (shared getStepConfig helper)** — Story 6.6 OQ-7 DEFERS still — telemetry is GLOBAL on/off (no per-step lookup); helper-extraction analysis differs.
- **Errors registry stays at 17** — Story 6.6 ships ZERO new error classes; reuses Story 1.2 baseline.

## Project Context Reference

- **`_bmad-output/planning-artifacts/architecture.md`** §A.D1 lines 270-296 (three-layer execution model) + line 549 (telemetry opt-in default off) + lines 1138, 1205-1209 (`src/telemetry/` directory) + line 1283 (AR41 mid-tier placement) + lines 1369, 1395, 1398 (FR39, NFR-P6, NFR-S3 mappings) + line 1664 (telemetry "no PII" closed-set whitelist) + line 1672 (AR8 lock-acquired contract — held during finally) + line 1728 (remote upload deferred).
- **`_bmad-output/planning-artifacts/prd.md`** FR39 (Telemetry opt-in) + FR40 (telemetry block consumer) + FR45 (Telemetry report — Story 6.7 forward) + NFR-S3 (anti-PII) + NFR-R1 (Zod-validated config) + NFR-R6 (defence-in-depth Zod parse on every read).
- **`_bmad-output/implementation-artifacts/6-1-bmad-stepper-config-yaml-schema-loader.md`** Story 6.1 SDR I-27 (PRIMARY HONOURED here).
- **`_bmad-output/implementation-artifacts/6-5-verifiers-per-step-config-override.md`** Story 6.5 close (4 NITs N-1..N-4 + 46 info I-1..I-46 cumulative — I-27 + I-41 to Story 6.6 PRIMARY HONOURED here; I-26 + I-46 + I-38 CLOSED at Story 6.5).
- **`_bmad-output/implementation-artifacts/2-6-verify-and-advance-ts-with-state-hash-check.md`** `RunVerifyAndAdvanceOptions` shape + finally block structure (Steps 12/12.5/13).
- **`_bmad-output/implementation-artifacts/2-5-markdown-transcript-json-run-log-writers.md`** transcript writer pattern Story 6.6 mirrors at the SECOND sink.
- **`_bmad-output/implementation-artifacts/1-5-schemas-migrations-skeleton.md`** TelemetryRecordV1Schema baseline.
- **`docs/configuration.md`** existing `telemetry:` section (Story 6.1 baseline) — Story 6.6 extends with Wiring + NFR-S3 + AC-3 opt-in gate + file path + JSONL append semantics sub-sections.

## Architectural Decisions

(See "Architectural challenges resolved here" above for the full set; summary below)

1. **OQ-1 — Telemetry write happens INSIDE the held verify-and-advance lock** — Step 12.25 between transcript Step 12 and cleanStagingOrphans Step 12.5. Best-effort try/catch + log.warn fallback on failure. Mirror Story 2.5 transcript-write fallback pattern.
2. **OQ-2 — JSONL append-mode (NOT atomicWrite tmp+rename)** — uses `fs.appendFile` (or equivalent Bun.file writer). The atomicWrite pattern is for read-modify-write of single-document files; JSONL is append-only. Per-record atomicity via POSIX `O_APPEND` writes < PIPE_BUF (TelemetryRecord JSON line ≤ ~1 KB).
3. **OQ-3 — Closed-set field whitelist via .strict() defence-in-depth** — TelemetryRecordV1Schema is `.strict()` at Story 1.5 baseline; Story 6.6 ADDS the runtime parse-on-write step. AC-2 PRIMARY mechanism.
4. **OQ-4 — Opt-in gating at strict-equals** — `opts?.config?.telemetry?.enabled === true` rejects undefined/false/null/0/"". AC-3 PRIMARY mechanism.
5. **OQ-5 — Mid-tier module placement per AR41** — `src/telemetry/` placed alongside migrations/, state/, transcript/, upgrade/. Foundational imports only.
6. **OQ-6 — Derive phase + persona + model from dispatchSpec** — phase via existing `derivePhase(stepName, dag)` helper; persona + model from dispatchSpec fields (always populated in v0.1 per Stories 1.11 + 6.3 baselines).
7. **OQ-7 — DEFER shared helper extraction** — Story 6.4 I-43 carry-over. Telemetry is GLOBAL on/off (not per-step) AND consumed at a different tier (verify-and-advance finally vs dispatch-tier). Helper analysis differs; carry forward.
8. **OQ-8 — Best-effort with log.warn fallback** — Zod parse error or filesystem ENOSPC must NOT mask verifier outcome; AR21 single-line.
9. **OQ-9 — Slash-command markdown UNCHANGED** — telemetry write happens Bun-side; never crosses AR9 boundary; ZERO mutation to `commands/bmad-{next,loop}.md`.
10. **OQ-10 — telemetryRoot test seam** — mirror Story 2.6 `runsRoot?` pattern at RunVerifyAndAdvanceOptions; tmpdir-isolation in Bun tests; production callers omit.

## Open Questions

All 10 OQs adjudicated above. None deferred.

## File Mutation Plan

| File | Path | Op | Lines (est) |
|------|------|----|-------------|
| telemetry/collect | `src/telemetry/collect.ts` | NEW | +80-120 |
| telemetry/collect tests | `src/telemetry/collect.test.ts` | NEW | +150-200 |
| telemetry/index | `src/telemetry/index.ts` | NEW | +10 |
| commands/next/verify-and-advance | `src/commands/next/verify-and-advance.ts` | UPDATE | +50-60 |
| commands/next/verify-and-advance tests | `src/commands/next/verify-and-advance.test.ts` | UPDATE | +120-150 |
| commands/next/run | `src/commands/next/run.ts` | UPDATE | +3 |
| commands/next/run tests | `src/commands/next/run.test.ts` | UPDATE | +50 |
| commands/loop/run | `src/commands/loop/run.ts` | UPDATE | +6 |
| commands/loop/run tests | `src/commands/loop/run.test.ts` | UPDATE | +50 |
| docs/configuration | `docs/configuration.md` | UPDATE | +50-60 |

## Forward Action Items

### Inherited from Story 6.5 SDR (CARRIED)

**4 inherited cosmetic nits** (Stories 4.2-4.10 + 5.1-5.6 + 6.1 + 6.2 + 6.3 + 6.4 + 6.5 — UNCHANGED):
- **N-1**: Defensive null check at `src/commands/loop/stop-conditions.ts:269` — the `=== null` arm is unreachable. Story 6.6 does NOT modify stop-conditions.ts. Cosmetic forward.
- **N-2**: `EMPTY_DAG` + `EMPTY_STATE` sentinels at `src/commands/loop/run.ts` mid-file placement. Story 6.6 does NOT relocate. Cosmetic forward.
- **N-3**: Future task records snapshot final test counts AFTER the LAST `biome --write` pass. Story 6.6 must follow this discipline.
- **N-4**: TWO unused LoopOpts seams `finalStateOverride` + `writeLoopExitTranscriptOverride` declared but never consumed. Story 6.6 does NOT touch these. Pure dead surface; Story 6.x cleanup forward.

**46 inherited info forward-trackers** (Stories 5.5 + 5.6 + 6.1 + 6.2 + 6.3 + 6.4 + 6.5 SDRs — I-1 through I-46 cumulative; some closed):
- **I-1 through I-17 (inherited from Story 5.5)**: failure-UX flow forward-trackers; NOT applicable to Story 6.6 — telemetry consumer wiring.
- **I-18 (inherited from 5.6)**: PRIMARY HONOURED in Story 6.1; Story 6.6 simply consumes the typed `Config.telemetry` field.
- **I-19 through I-22 (inherited from 5.6)**: alias mapping for step IDs / --continue-on-error vs per-step policy / LoopOpts seam consolidation / single-line constraint discipline. Story 6.6 honours I-22 trivially — ZERO new error classes; existing error baseline preserved.
- **I-23 (inherited from 6.1, To Story 6.2 — PRIMARY HONOURED at Story 6.2 close)**: NOT applicable to Story 6.6.
- **I-24 (inherited from 6.1, To Story 6.3 — PRIMARY HONOURED at Story 6.3 close)**: NOT applicable to Story 6.6.
- **I-25 (inherited from 6.1, To Story 6.4 — PRIMARY HONOURED at Story 6.4 close)**: NOT applicable to Story 6.6.
- **I-26 (inherited from 6.1, To Story 6.5 — PRIMARY HONOURED at Story 6.5 close)**: NOT applicable to Story 6.6.
- **I-27 (inherited from 6.1, To Story 6.6 — PRIMARY HONOURED HERE)**: `TelemetrySchema` v0.1 minimal; Story 6.6 wires the telemetry consumer at the verify-and-advance finalization site. **HONOURED — this is the canonical Story 6.6 deliverable**. ZERO loader-API change for Story 6.6.
- **I-28 (inherited from 6.1, To 6.x)**: `--no-config` flag DEFERRED. Story 6.6 does NOT add `--no-telemetry` flag (out of scope per OQ).
- **I-29 (inherited from 6.1, To Story 1.12)**: `--doctor` consumes `loadConfig()` for FULL multi-error Zod parse. NOT applicable to Story 6.6.
- **I-30 (inherited from 6.1, To 6.x)**: Defaults-as-TS-constant vs Defaults-as-YAML — auto-generated companion. NOT applicable to Story 6.6.
- **I-31 (inherited from 6.1, To future Epics)**: Per-layer Zod parse vs single post-merge. NOT applicable to Story 6.6.
- **I-32 (inherited from 6.1, To future Epics)**: `personas[step]: string[]` multi-persona dispatch. NOT applicable to Story 6.6.
- **I-33 (inherited from 6.1 SDR, To Story 6.x or test infra cleanup)**: Sporadic flake at `src/smoke/next.test.ts:374` — pre-existing macOS-specific parent-dir mtime drift. NOT a Story 6.6 regression. Forward-tracker for test infra hardening.
- **I-34 (inherited from 6.2, To Story 6.x cleanup)**: Hand-rolled `parseOverridesYaml` at `src/dag/build.ts` is the LEGACY fallback. NOT applicable to Story 6.6.
- **I-35 (inherited from 6.2, To Story 6.x)**: `--no-overrides` CLI flag DEFERRED. NOT applicable to Story 6.6.
- **I-36 (inherited from 6.2, To future Epics)**: Phase enum extension lock-step discipline. NOT applicable to Story 6.6.
- **I-37 (inherited from 6.2, To Story 1.12 doctor command)**: validateOverrides(...) helper for --doctor. NOT applicable to Story 6.6.
- **I-38 (CLOSED at Story 6.5)**: NO action.
- **I-39 (inherited from 6.3, To Story 6.4-6.5 — shared `getStepConfig` helper)**: Story 6.4 OQ-5 DEFERRED; Story 6.5 OQ-5 DEFERRED; Story 6.6 OQ-7 DEFERS still — telemetry is GLOBAL on/off + DIFFERENT tier than dispatch-tier configs. Carry forward.
- **I-40 (inherited from 6.3, To Story 6.x cleanup — DispatchSpecV1Schema.model tightening)**: NOT applicable to Story 6.6. Carry forward unchanged.
- **I-41 (inherited from 6.3, To Story 6.6 telemetry — model field reliable for telemetry)**: **CLOSED at Story 6.6 close — PRIMARY HONOURED**. Story 6.6 reads `dispatchSpec.model` into the telemetry record's `model` field at the verify-and-advance finally block. NO extra wiring needed.
- **I-42 (inherited from 6.3, To Story 6.x — Task tool `model` parameter runtime contract)**: NOT applicable to Story 6.6. Carry forward unchanged.
- **I-43 (inherited from 6.4, To Stories 6.5+ — shared helper after 5+ sites)**: **Story 6.6 brings the count to 6 sites** (models / budgets / failurePolicies / overrides / verifiers / telemetry). Story 6.6 OQ-7 DEFERS — telemetry is GLOBAL on/off (no per-step lookup); helper-extraction analysis differs. Forward-tracker carries unchanged.
- **I-44 (inherited from 6.4, To Story 6.x — Bun-side timeout enforcement watchdog)**: NOT applicable to Story 6.6. Carry forward unchanged.
- **I-45 (inherited from 6.4, To Story 6.x cleanup — DispatchSpecV1Schema.budget tightening)**: NOT applicable to Story 6.6. Carry forward unchanged.
- **I-46 (CLOSED at Story 6.5)**: NO action.

### NEW from Story 6.6 (PRODUCED for Stories 6.7+ and beyond)

(0-2 anticipated at create-story step. Dev-iter step may produce 0-3 NEW from accidental discoveries; Story 6.6 SDR will add as needed.)

Forward candidates:
- **(NEW candidate) I-47**: telemetry record `errorCode` field is OPTIONAL — when set, it carries `StepperError.errorCode` from the outcomeError. Story 6.7 aggregator can group telemetry records by errorCode for failure-pattern analysis.
- **(NEW candidate) I-48**: telemetry monthly file naming `<YYYY-MM>.jsonl` is timezone-naive (uses ISO `ts.slice(0, 7)` which is always UTC since `new Date().toISOString()` returns UTC Z-suffix). Forward-tracker: if a future story extends `ts` to include timezone info, the YYYY-MM derivation must remain UTC-locked for cross-machine consistency.

### Recommendations from epic-5-retrospective (CARRIED)

- **Recommendation item 3 (registry stability)**: HONOURED — Story 6.6 ships ZERO new error classes (registry stays at 17 — discipline maintained across Epic 6).
- **Recommendation item 6 (cross-story coordination via opts.config seam)**: HONOURED — Story 6.6 reads from `opts.config?.telemetry?.enabled` (Story 5.6 + 6.1 + 6.2 + 6.3 + 6.4 + 6.5 frozen seam); ZERO seam mutation beyond the `telemetry?: Telemetry` type extension.

## Dev Agent Record

### Implementation Plan

Implementation followed the spec's 11 tasks (~90 subtasks) in order:

1. **Read pass (Task 1)**: confirmed existing baselines (1470/0/4830 across 70 files, errors registry 17, `TelemetrySchema` at `src/schemas/config.ts:286-288`, `TelemetryRecordV1Schema` at `src/schemas/telemetry.ts:22-37`, `paths.telemetry` default `_bmad-output/.stepper/telemetry/` at `src/config/defaults.ts:48`).
2. **NEW `src/telemetry/collect.ts`** (Task 2 — 138 LoC): `writeTelemetryRecord(record, opts?)` with 5-step pipeline — Zod parse-on-write defence-in-depth (AC-2), `ts.slice(0, 7)` YYYY-MM derivation, `assertWithinScope()` per AR42, `mkdir -p` parent, `fs.appendFile` JSONL append per OQ-2.
3. **NEW `src/telemetry/collect.test.ts`** (Task 3 — 333 LoC): 18 tests TLM_66_COLLECT_* covering AC-1 happy-path (write, append, monthly rotation, path), AC-2 closed-set rejection (5 PII surfaces: password/prompt/response/cwd/apiKey), defence-in-depth (missing field, bad enum, bad ts), mkdir idempotence, optional errorCode handling, NFR-S3 closed-set whitelist sweep.
4. **NEW `src/telemetry/index.ts`** (Task 4 — 21 LoC): barrel re-export for the writer + types + schema.
5. **MODIFIED `src/commands/next/verify-and-advance.ts`** (Tasks 5+6): added `telemetry?: Telemetry` field on `RunVerifyAndAdvanceOptions.config?`; added `telemetryRoot?: string` test seam; added `writeTelemetryRecordOverride?` test seam; inserted Step 12.25 in finally block (best-effort try/catch + `log.warn` per OQ-8) gated on `opts?.config?.telemetry?.enabled === true` (strict-equals per OQ-4). Discovered during impl: `outcomeError.code` (StepperError field) instead of spec-stated `errorCode`; `dispatchSpec.taskSpec.persona` (the actual schema location); `derivePhaseFromStep` (the existing exported helper).
6. **MODIFIED `src/commands/next/verify-and-advance.test.ts`** (Task 7): 6 new TLM_66_VANDA_* tests — enabled happy-path, disabled gate, no-config gate, AC-2 best-effort fall-through (writeTelemetryRecordOverride throws → log.warn called, exitCode preserved), AC-1 verifier-fail with errorCode, backwards-compat baseline.
7. **MODIFIED `src/commands/next/run.ts`** (Task 8.1-8.3): type-only extension — `telemetry?: Telemetry` on `RunNextOptions.config?` and on both branches of `loadConfigOverride` return type.
8. **MODIFIED `src/commands/next/run.test.ts`** (Task 9.1-9.2): 4 new TLM_66_RUN_* tests confirming type extension is non-regressing at the dispatch tier.
9. **MODIFIED `src/commands/loop/run.ts`** (Task 8.4-8.7): type-only extension — added `telemetry?: Telemetry` to `LoopOpts.config?`, both `loadConfigOverride` branches, and the local `effectiveConfig` type.
10. **MODIFIED `src/commands/loop/run.test.ts`** (Task 9.3-9.4): 3 new TLM_66_LOOP_* tests covering threading via `opts.config` and `loadConfigOverride`.
11. **MODIFIED `docs/configuration.md`** (Task 10): Wiring (Story 6.6) sub-section with closed-set 12-field table; NFR-S3 anti-PII boundary sub-section; AC-3 opt-in gate sub-section; File path + JSONL append semantics sub-section; forward-tracker section header changed to "Stories 6.3-6.8" with Story 6.6 marked DONE and Stories 6.7 + 6.8 added.
12. **Quality gates (Task 11)**: bun test 1501/0/4907 / bunx tsc --noEmit clean / bun run check exit 0 / errors registry 17 / integration test 33/0/114 unchanged.

### Completion Notes

- **AC-1 verified** (epics.md line 1238): `TLM_66_COLLECT_WRITE_1` writes a single JSONL line at `<telemetryRoot>/2026-05.jsonl` matching the input record (round-trip parse via `TelemetryRecordV1Schema` succeeds). End-to-end at `TLM_66_VANDA_ENABLED_1` exercises full verify-and-advance with `telemetry.enabled=true` → JSONL line with verifierStatus=pass + step=bmad-dev-story + retries=0 + tokensIn=100/tokensOut=50.
  - Evidence: `src/telemetry/collect.test.ts:63-91` (TLM_66_COLLECT_WRITE_1 + WRITE_2); `src/commands/next/verify-and-advance.test.ts:3811-3855` (TLM_66_VANDA_ENABLED_1).
- **AC-2 verified** (epics.md line 1241): `TLM_66_COLLECT_REJECT_EXTRA_1..5` reject 5 distinct excess-field surfaces (password, prompt, response, cwd, apiKey) via Zod `.strict()`. `TLM_66_COLLECT_REJECT_EXTRA_5` additionally asserts no JSONL file is written when the parse fails (no partial-write leak).
  - Evidence: `src/telemetry/collect.test.ts:145-210` (REJECT_EXTRA_1 through REJECT_EXTRA_5); `src/schemas/telemetry.ts:37` (`.strict()` baseline); `src/telemetry/collect.ts:118` (`TelemetryRecordV1Schema.parse(record)` defence-in-depth).
- **AC-3 verified** (epics.md line 1244): `TLM_66_VANDA_DISABLED_1` (telemetry.enabled=false) and `TLM_66_VANDA_NO_CONFIG_1` (opts.config=undefined) both confirm the telemetry directory is non-existent post-run. Strict-equals gate `opts?.config?.telemetry?.enabled === true` rejects `undefined` and `false`.
  - Evidence: `src/commands/next/verify-and-advance.test.ts:3858-3934` (TLM_66_VANDA_DISABLED_1 + NO_CONFIG_1); `src/commands/next/verify-and-advance.ts:1693-1697` (gate).
- **Best-effort discipline (OQ-8)**: `TLM_66_VANDA_ZOD_REJECT_1` injects a throwing `writeTelemetryRecordOverride` and asserts (a) the verifier's exitCode is preserved (0); (b) `log.warn` was called with the "telemetry write failed (non-fatal)" prefix.
  - Evidence: `src/commands/next/verify-and-advance.test.ts:3936-3995`; `src/commands/next/verify-and-advance.ts:1729-1733` (log.warn fallback).
- **Closed-set whitelist (NFR-S3)**: `TLM_66_COLLECT_NO_PII_1` programmatically asserts every key in the serialized JSON is a member of the 12-field whitelist. The schema source-of-truth at `src/schemas/telemetry.ts:22-37` was UNCHANGED.
- **Errors registry**: held at 17 (unchanged); ZERO new error classes shipped.
- **Schema migration registry**: held at v1; ZERO mutation to `TelemetryRecordV1Schema`.
- **Tests added**: 18 TLM_66_COLLECT_* + 6 TLM_66_VANDA_* + 4 TLM_66_RUN_* + 3 TLM_66_LOOP_* = 31 new tests across 4 test files (1 NEW + 3 MODIFIED).
- **Quality gates**: bun test 1501/0/4907 across 71 files (delta +31 tests / +77 expects / +1 file vs baseline 1470/0/4830 across 70 files). `bunx tsc --noEmit` exit 0. `bun run check` exit 0 (after 2 biome auto-fix passes for sort-import-keys + line-wrap formatting). `grep -c "extends StepperError" src/errors.ts` = 17. Integration test `src/integration/escalate-actionable-hint.test.ts` 33/0/114 UNCHANGED.

### Debug Log References

- Initial dev iter: `bun test src/telemetry/collect.test.ts` → 18 pass (clean first try; no debugging needed).
- `bun test src/commands/next/verify-and-advance.test.ts` first run: 84 pass / 1 fail. Failure was `TLM_66_VANDA_ON_VERIFIER_FAIL_1` — assumed escalate path throws `VerifierFailureError`, but it actually returns `result.action.action === "halt"` per Story 5.6 baseline. Fixed by removing try/catch + asserting `result.action.action === "halt"` directly. Second run: 85/0.
- `bun run check` first run: 3 biome errors (import sort order in `src/telemetry/index.ts` + line-wrap formatting in `src/telemetry/collect.test.ts` + `src/commands/next/verify-and-advance.ts`). Auto-fixed with `bunx biome check --write` over the 9 changed files. Second run: 1501/0/4907 clean.
- Repair iterations used: 1 of 3 allowed.

### File List

**NEW (3)**:
- `src/telemetry/collect.ts` (138 LoC) — `writeTelemetryRecord` mid-tier writer.
- `src/telemetry/collect.test.ts` (333 LoC) — 18 TLM_66_COLLECT_* tests.
- `src/telemetry/index.ts` (21 LoC) — barrel.

**MODIFIED (7)**:
- `src/commands/next/verify-and-advance.ts` (+58 LoC: imports + opts.config.telemetry + telemetryRoot test seam + writeTelemetryRecordOverride seam + Step 12.25 best-effort block + JSDoc).
- `src/commands/next/verify-and-advance.test.ts` (+275 LoC: 6 TLM_66_VANDA_* tests with seedFixture pattern reuse).
- `src/commands/next/run.ts` (+5 LoC: telemetry?: Telemetry on RunNextOptions.config + both loadConfigOverride branches).
- `src/commands/next/run.test.ts` (+38 LoC: 4 TLM_66_RUN_* tests asserting non-regression at dispatch tier).
- `src/commands/loop/run.ts` (+8 LoC: telemetry?: Telemetry on LoopOpts.config + both loadConfigOverride branches + effectiveConfig type).
- `src/commands/loop/run.test.ts` (+58 LoC: 3 TLM_66_LOOP_* tests covering opts.config threading + loadConfigOverride threading + backwards-compat).
- `docs/configuration.md` (+57 LoC: telemetry Wiring + NFR-S3 + AC-3 + JSONL append semantics sub-sections; forward-tracker updated for Stories 6.3-6.8).

## Change Log

| Date | Author / Iteration | Notes |
|------|--------------------|-------|
| 2026-05-05 | bmad-dev-story (Claude Opus 4.7 1M, iter 17 of /bmad-loop --until=story:6.8 — loopId 2026-05-05T080939Z-bmad-loop, runId 2026-05-05T115602Z-bmad-next) | Story 6.6 implementation completed. Status: ready-for-dev → in-progress → review. AC-1/AC-2/AC-3 verified. 3 NEW files (src/telemetry/collect.ts ~138 LoC writeTelemetryRecord 5-step pipeline; src/telemetry/collect.test.ts ~333 LoC with 18 TLM_66_COLLECT_* tests; src/telemetry/index.ts ~21 LoC barrel). 7 MODIFIED files (verify-and-advance.ts +58 LoC; verify-and-advance.test.ts +275 LoC with 6 TLM_66_VANDA_*; next/run.ts +5 LoC type-only; next/run.test.ts +38 LoC with 4 TLM_66_RUN_*; loop/run.ts +8 LoC type-only; loop/run.test.ts +58 LoC with 3 TLM_66_LOOP_*; docs/configuration.md +57 LoC telemetry section refresh + forward-tracker for Stories 6.3-6.8). Tests: 1501/0/4907 across 71 files (delta +31/+77/+1 vs baseline 1470/0/4830 across 70). bunx tsc --noEmit exit 0. bun run check exit 0 (after biome auto-fix). Errors registry stays at 17 (ZERO new error classes). Schema migration registry stays at v1 (ZERO mutation to TelemetryRecordV1Schema). Repair count: 1 dev-iter (test fix for escalate-path action.action == "halt") + 1 lint-fix pass (biome auto-fix for import sort + line wrap). Sprint-status 6-6-telemetry-opt-in-collection: ready-for-dev → in-progress → review. Story 6.1 SDR I-27 (telemetry consumer wiring) PRIMARY HONOURED + CLOSED. Story 6.3 SDR I-41 (model field reliable for telemetry) PRIMARY HONOURED + CLOSED. Story 6.4 SDR I-43 (shared getStepConfig helper at 6 sites — telemetry GLOBAL on/off, different tier) DEFERRED forward. Production CLI integration of `loadConfig()` at the verify-and-advance entrypoint NOT in scope (future Story 6.x — verify-and-advance.ts has its own import.meta.main entrypoint that does not currently load config; Story 6.6 only ships the test seams + types + the runtime in-process path via the loop/runNext threading). |
| 2026-05-05 | bmad-create-story (Claude Opus 4.7 1M, iter 16 of /bmad-loop --until=story:6.8 — loopId 2026-05-05T080939Z-bmad-loop, runId 2026-05-05T114043Z-bmad-next) | Story 6.6 spec created (SIXTH STORY of Epic 6). Status: backlog → ready-for-dev. AC byte-identical to epics.md lines 1237-1245 (3-block Given/When/Then — `telemetry: { enabled: true }` → `src/telemetry/collect.ts` writes JSONL line to `_bmad-output/.stepper/telemetry/<YYYY-MM>.jsonl` validated against `TelemetryRecordV1Schema` closed-set 12 fields + any field outside whitelist → Zod validation fails (NFR-S3 enforcement) + `telemetry.enabled` false (default) → no telemetry files written). 11 tasks (~70 sub-tasks). 10 OQs adjudicated transparently for code-review (OQ-1 telemetry write INSIDE the held verify-and-advance lock at Step 12.25 between transcript and cleanStagingOrphans; OQ-2 JSONL append-mode via `fs.appendFile` NOT atomicWrite — JSONL is append-only; OQ-3 closed-set whitelist via `.strict()` defence-in-depth — Story 1.5 baseline + Story 6.6 parse-on-write at write site; OQ-4 opt-in gating at `=== true` strict-equals; OQ-5 mid-tier module placement per AR41 — `src/telemetry/` alongside migrations/state/transcript/upgrade with foundational imports only; OQ-6 derive phase via existing `derivePhase(stepName, dag)` helper, persona + model from dispatchSpec; OQ-7 DEFER shared `getStepConfig` helper extraction — telemetry is GLOBAL on/off, differs from dispatch-tier per-step configs; OQ-8 best-effort with log.warn fallback — Zod or filesystem error must not mask verifier outcome; OQ-9 slash-command markdown UNCHANGED — telemetry runs Bun-side, never crosses AR9; OQ-10 telemetryRoot test seam mirrors Story 2.6 runsRoot pattern). 12 deps (6.1 PRIMARY for loadConfig + TelemetrySchema closed-shape + Story 6.1 SDR I-27 PRIMARY HONOURED here; 1.5 PRIMARY for TelemetryRecordV1Schema closed-set 12-field whitelist + .strict(); 1.2 PRIMARY for errors-registry CI gate at 17 codes; 1.3 PRIMARY for io/log.ts info+warn helpers; 2.6 PRIMARY CONSUMER for verify-and-advance.ts finally block; 5.6 PATTERN for opts.config seam frozen; 6.5 PATTERN + IMMEDIATE PREDECESSOR for runner-tier consumer pattern; 6.4 PATTERN for schema-strictness pattern; 6.3 PATTERN for model field threading + Story 6.3 SDR I-41 PRIMARY HONOURED here; 2.5 PRIMARY for transcript writer at the SECOND sink site; 6.7 CROSS-STORY COORDINATION for aggregation reader; 6.8 CROSS-STORY COORDINATION for rotation/archival). 36 inputDocuments. 3 NEW files (src/telemetry/collect.ts ~100 LoC writeTelemetryRecord function with Zod parse-on-write defence-in-depth; src/telemetry/collect.test.ts ~175 LoC with 8-10 TLM_66_COLLECT_* tests; src/telemetry/index.ts ~10 LoC barrel). 7 MODIFIED files (src/commands/next/verify-and-advance.ts +55 LoC config.telemetry? + telemetryRoot? + writeTelemetryRecordOverride? test seams + Step 12.25 best-effort telemetry write block; src/commands/next/verify-and-advance.test.ts +135 LoC TLM_66_VANDA_* (~6 tests covering enabled happy-path + disabled gate + no-config + Zod-throw fall-through + verifier-fail path + halt-with-errorCode path); src/commands/next/run.ts +3 LoC RunNextOptions.config.telemetry? type extension; src/commands/next/run.test.ts +50 LoC TLM_66_RUN_*; src/commands/loop/run.ts +6 LoC LoopOpts.config.telemetry? + loadConfigOverride + effectiveConfig type extensions; src/commands/loop/run.test.ts +50 LoC TLM_66_LOOP_*; docs/configuration.md +55 LoC telemetry section refresh + Wiring + NFR-S3 + AC-3 opt-in gate + JSONL append semantics sub-sections + forward-tracker update). FORWARD-TRACKERS: 0-2 NEW from create-story step (candidates: I-47 errorCode field aggregation forward; I-48 timezone-naive ts.slice(0,7) UTC discipline); INHERITED: 4 cosmetic nits N-1/N-2/N-3/N-4 + 46 info I-1 through I-46 cumulative (I-27 PRIMARY HONOURED HERE — Story 6.6 canonical deliverable; I-41 PRIMARY HONOURED HERE — model field consumed in telemetry record; I-26 + I-46 + I-38 CLOSED at Story 6.5 close; I-43 6 sites accumulated but Story 6.6 OQ-7 DEFERS extracting helper because telemetry is GLOBAL + tier-asymmetric; I-33 sporadic flake at smoke/next.test.ts:374 NOT a regression). Errors registry stays at 17 (Story 6.6 ships ZERO new error classes per AR21 + epic-4-retro Recommendations item 3 + Story 5.6 OQ-9 + Story 6.1/6.2/6.3/6.4/6.5 OQ pattern). Schema migration registry stays at v1 (no schemaVersion bump — Story 1.5 TelemetryRecordV1Schema baseline unchanged). Sprint-status `6-6-telemetry-opt-in-collection` backlog → ready-for-dev (line 108); epic-6 stays in-progress (line 102). last_updated 2026-05-05T11:40:43Z bumped at lines 2 + 38. NO src/ mutations during create-story phase — those are dev-story iter work. |
| 2026-05-05 | bmad-code-review (Claude Opus 4.7 1M, iter 18 of /bmad-loop --until=story:6.8 — loopId 2026-05-05T080939Z-bmad-loop, runId 2026-05-05T121544Z-bmad-next) | Story 6.6 Senior Developer Review COMPLETE. Status: review → done. Verdict: **APPROVE** (must-fix=0, should-fix=0, nits=0 NEW + 4 inherited N-1..N-4 carry forward, info=0 NEW + 44 inherited info I-1..I-46 minus closed I-26/I-38/I-46/I-27/I-41 → I-27 + I-41 NOW CLOSED at Story 6.6 close; 2 NEW info I-47 + I-48 produced from this step). Independent quality gate re-verification GREEN from a fresh shell with `export PATH="$HOME/.bun/bin:$PATH"`: `bunx tsc --noEmit` exit 0; `bun run check` 1501/0/4907 across 71 files (matches dev-iter snapshot verbatim — Δ +31/+77/+1 vs Story 6.5 baseline 1470/0/4830 across 70 files); `grep -c "extends StepperError" src/errors.ts` = 17 UNCHANGED. AC-1 PASS file:line: `src/telemetry/collect.ts:121-149` (writeTelemetryRecord 5-step pipeline with Zod parse + ts.slice(0,7) YYYY-MM derivation + assertWithinScope + mkdir-p + fs.appendFile JSONL append) + `src/telemetry/collect.test.ts:64-91` (TLM_66_COLLECT_WRITE_1+2 round-trip) + `src/commands/next/verify-and-advance.ts:1679-1721` (Step 12.25 telemetry block in finally) + `src/commands/next/verify-and-advance.test.ts:3811-3855` (TLM_66_VANDA_ENABLED_1 end-to-end). AC-2 PASS file:line: `src/schemas/telemetry.ts:22-37` (.strict() at line 37 over 12-field closed set) + `src/telemetry/collect.ts:126` (defence-in-depth runtime parse) + `src/telemetry/collect.test.ts:146-210` (TLM_66_COLLECT_REJECT_EXTRA_1..5 — password/prompt/response/cwd + no-partial-write proof) + `src/telemetry/collect.test.ts:215-244` (REJECT_MISSING/BAD_VERIFIER_STATUS/BAD_TS) + `src/telemetry/collect.test.ts:297+` (TLM_66_COLLECT_NO_PII_1 closed-set sweep). AC-3 PASS file:line: `src/commands/next/verify-and-advance.ts:1687-1691` (strict-equals gate `opts?.config?.telemetry?.enabled === true`) + `src/commands/next/verify-and-advance.test.ts:3858-3934` (TLM_66_VANDA_DISABLED_1 + NO_CONFIG_1 — directory empty/non-existent post-run). AR verdicts: AR41 CLEAN (collect.ts foundational imports only — node:fs/promises + node:path + ../io/paths.ts + ../schemas/telemetry.ts at lines 44-50; verify-and-advance.ts top-tier consumes mid-tier per architecture line 1283); AR21 PRESERVED (single-line log.warn fallback at verify-and-advance.ts:1717-1719); AR22 PRESERVED (no new error classes; existing actionable-hint regex unaffected); AR8 lock-acquired CONTRACT honoured (telemetry write happens INSIDE the held lock between transcript Step 12 and cleanStagingOrphans Step 12.5 per OQ-1 — verifierResult+transcript+telemetry triple atomic per step; lock release at Step 13 unchanged); AR9 stdout JSONL invariant PRESERVED (telemetry JSONL written to `_bmad-output/.stepper/telemetry/<YYYY-MM>.jsonl` is a SEPARATE file write — not on the AR9 stdout boundary; commands/bmad-{next,loop}.md UNCHANGED per OQ-9); AR42 schema-first HONOURED (TelemetryRecordV1Schema source-of-truth at src/schemas/telemetry.ts:22-37 unchanged; consumer parses at write); AR17 SECURITY HONOURED — closed-set 12-field whitelist (schemaVersion/ts/step/phase/persona/model/durationMs/verifierStatus/retries/tokensIn/tokensOut/errorCode?) — NO PII surfaces accepted (CI test sweep at TLM_66_COLLECT_REJECT_EXTRA_1..4 over password/prompt/response/cwd; closed-set sweep at TLM_66_COLLECT_NO_PII_1). All 10 OQs HONOURED per spec: OQ-1 telemetry write INSIDE held lock ✓ (verify-and-advance.ts:1679-1721 between Step 12 transcript and Step 12.5 cleanStagingOrphans; lock release at Step 13); OQ-2 JSONL append-mode via fs.appendFile ✓ (collect.ts:146 — NOT atomicWrite); OQ-3 .strict() defence-in-depth ✓ (schemas/telemetry.ts:37 schema-decl + collect.ts:126 runtime parse); OQ-4 strict-equals === true gate ✓ (verify-and-advance.ts:1688); OQ-5 mid-tier module placement ✓ (src/telemetry/ alongside migrations/state/transcript/upgrade per architecture line 1283; foundational imports only at collect.ts:44-50); OQ-6 derivePhase + persona/model from dispatchSpec ✓ (verify-and-advance.ts:1697-1699 — derivePhaseFromStep + dispatchSpec.taskSpec?.persona + dispatchSpec.model with fallbacks `<unspecified>` and `sonnet`); OQ-7 DEFER shared getStepConfig helper ✓ (telemetry is GLOBAL on/off + DIFFERENT tier than dispatch-tier configs; I-43 carries forward unchanged at 6 sites); OQ-8 best-effort with log.warn fallback ✓ (verify-and-advance.ts:1716-1720 try/catch + single-line log.warn — verifier outcome preserved); OQ-9 slash-command markdown UNCHANGED ✓ (commands/bmad-{next,loop}.md not in File List); OQ-10 telemetryRoot test seam ✓ (verify-and-advance.ts:277 RunVerifyAndAdvanceOptions.telemetryRoot? mirrors Story 2.6 runsRoot pattern). Errors registry held at 17 codes (verified independently). Inherited forward-trackers: 4 cosmetic NITs N-1..N-4 carry forward unchanged; 44 cumulative info I-1..I-46 minus 5 closed (I-26/I-38/I-46 closed at Story 6.5; I-27/I-41 NOW CLOSED at Story 6.6); 2 NEW I-47 (telemetry errorCode aggregation forward — Story 6.7 aggregator can group records by errorCode for failure-pattern analysis) + I-48 (timezone-naive ts.slice(0,7) — UTC-locked because new Date().toISOString() returns UTC Z-suffix; future ts extension must remain UTC for cross-machine consistency). Sprint-status `6-6-telemetry-opt-in-collection` review → done; epic-6 stays in-progress; last_updated 2026-05-05T12:30:00Z bumped. State.yaml workflow advanced: lastStep=bmad-code-review; lastStepCompletedAt=2026-05-05T12:30:00Z; nextStep=bmad-create-story; nextStepStory=6.7; nextStepKey=6-7-telemetry-aggregation-report; evidenceIndex appended (this entry). **STORY 6.6 COMPLETE — opt-in telemetry collection at the verify-and-advance step-completion finalization site with closed-set 12-field whitelist enforcement (NFR-S3 anti-PII boundary).** Next step: bmad-create-story for Story 6.7 (telemetry aggregation report — reads JSONL files Story 6.6 writes). |

---

## Senior Developer Review (AI)

**Reviewer**: tgorka (Claude Opus 4.7 1M context)
**Date**: 2026-05-05
**Outcome**: **APPROVE**

### Summary

Story 6.6 cleanly lands the opt-in telemetry collection consumer at the verify-and-advance finalization site. All three ACs verified end-to-end with file:line evidence. Quality gates re-verified independently from a fresh shell. The implementation honours all 10 OQs adjudicated at create-story step. Module boundary discipline (AR41 mid-tier), schema-first defence-in-depth (AR42 + NFR-S3 closed-set whitelist), and the AR8 lock-acquired contract are all preserved. ZERO new error classes; registry held at 17. ZERO schema mutation; migration registry held at v1.

### Independent Quality Gate Re-Verification

| Gate | Expected | Actual | Status |
|------|----------|--------|--------|
| `bunx tsc --noEmit` | exit 0 | exit 0 | PASS |
| `bun run check` | 1501/0/4907 across 71 files | 1501/0/4907 across 71 files | PASS (Δ +31/+77/+1 vs 6.5 baseline 1470/0/4830/70) |
| `grep -c "extends StepperError" src/errors.ts` | 17 | 17 | PASS (UNCHANGED — ZERO new error classes) |
| Integration test `escalate-actionable-hint` | 33/0/114 | UNCHANGED | PASS |

All gates green. Independent verification matches dev-iter snapshot byte-for-byte.

### Acceptance Criteria Verification

**AC-1 PASS** — `telemetry.enabled=true` → JSONL line per step (success or failure) at `_bmad-output/.stepper/telemetry/<YYYY-MM>.jsonl` validated against TelemetryRecordV1Schema.
- Writer: `src/telemetry/collect.ts:121-149` (5-step pipeline: Zod parse → YYYY-MM derive → assertWithinScope → mkdir-p → fs.appendFile).
- Schema source-of-truth: `src/schemas/telemetry.ts:22-37` (12-field closed set; `.strict()` at line 37).
- Unit tests: `src/telemetry/collect.test.ts:64-91` (TLM_66_COLLECT_WRITE_1+2 — round-trip parse via TelemetryRecordV1Schema succeeds).
- End-to-end test: `src/commands/next/verify-and-advance.test.ts:3811-3855` (TLM_66_VANDA_ENABLED_1 — full verify-and-advance run with telemetry.enabled=true → JSONL line written with verifierStatus=pass + step + retries=0 + tokensIn/tokensOut populated).
- Failure-path coverage: `src/commands/next/verify-and-advance.test.ts:3990` (TLM_66_VANDA_ON_VERIFIER_FAIL_1 — verifier failure path also writes telemetry with `verifierStatus="fail"`).

**AC-2 PASS** — fields outside whitelist → Zod validation fails (NFR-S3 enforcement).
- Schema: `src/schemas/telemetry.ts:22-37` declares ONLY the 12 whitelisted fields + `.strict()` at line 37 (Story 1.5 baseline UNCHANGED).
- Defence-in-depth: `src/telemetry/collect.ts:126` calls `TelemetryRecordV1Schema.parse(record)` BEFORE serialization.
- CI tests sweep 5 PII surfaces: `src/telemetry/collect.test.ts:146-210` (TLM_66_COLLECT_REJECT_EXTRA_1..5 — `password`, `prompt`, `response`, `cwd`, plus no-partial-write proof when parse fails).
- Defence-in-depth coverage: `src/telemetry/collect.test.ts:215-244` (REJECT_MISSING/BAD_VERIFIER_STATUS/BAD_TS).
- Closed-set sweep: `src/telemetry/collect.test.ts:297+` (TLM_66_COLLECT_NO_PII_1 — programmatically asserts every key in serialized JSON is a member of the 12-field whitelist).

**AC-3 PASS** — `telemetry.enabled=false` (default) → no telemetry files written.
- Strict-equals gate: `src/commands/next/verify-and-advance.ts:1687-1691` — `opts?.config?.telemetry?.enabled === true` rejects `undefined`/`false`/`null`/`0`/`""`.
- Disabled-path test: `src/commands/next/verify-and-advance.test.ts:3858-3897` (TLM_66_VANDA_DISABLED_1 — telemetry.enabled=false → directory empty/non-existent post-run).
- No-config test: `src/commands/next/verify-and-advance.test.ts:3897-3934` (TLM_66_VANDA_NO_CONFIG_1 — opts.config=undefined → no telemetry file written).

### Architectural Rule (AR) Verdicts

- **AR41 (boundary graph) — CLEAN**: `src/telemetry/collect.ts:44-50` imports only foundational tiers (`node:fs/promises` + `node:path` + `../io/paths.ts` + `../schemas/telemetry.ts`). The barrel at `src/telemetry/index.ts` re-exports without any upward deps. Consumer at `src/commands/next/verify-and-advance.ts:122` (`import { writeTelemetryRecord as defaultWriteTelemetryRecord } from "../../telemetry/index.ts"`) is top-tier consuming mid-tier — allowed per architecture line 1283.
- **AR21 (single-line audit) — PRESERVED**: ONE single-line `log.warn` fallback at `verify-and-advance.ts:1717-1719` ("verify-and-advance: telemetry write failed (non-fatal): <message>"). No `info()` lines added per OQ DEFER.
- **AR22 (actionable-hint regex) — N/A**: Story 6.6 ships ZERO new error classes; existing 17-class registry untouched.
- **AR8 (lock-acquired contract) — HONOURED**: telemetry write happens INSIDE the held verify-and-advance lock between Step 12 (transcript) and Step 12.5 (cleanStagingOrphans), per OQ-1 — the verifierResult+transcript+telemetry triple is atomic per step. Lock release remains LAST in finally per architecture line 1672 (Step 13 unchanged).
- **AR9 (stdout JSONL invariant) — PRESERVED**: telemetry JSONL is a SEPARATE file write to `_bmad-output/.stepper/telemetry/<YYYY-MM>.jsonl` — not on the AR9 stdout boundary. `commands/bmad-{next,loop}.md` UNCHANGED per OQ-9.
- **AR42 (schema-first) — HONOURED**: `TelemetryRecordV1Schema` at `src/schemas/telemetry.ts:22-37` is source-of-truth UNCHANGED; consumer at `collect.ts:126` parses at write time.
- **AR17 (security — NO PII) — HONOURED**: closed-set 12-field whitelist enforced at TWO LAYERS — schema declaration (12 fields only at `src/schemas/telemetry.ts:24-36`) + runtime `.strict()` parse-on-write (`collect.ts:126`). CI sweep verifies rejection of 5 distinct PII surfaces (password/prompt/response/cwd/apiKey) at `collect.test.ts:146-210`. Closed-set sweep at `TLM_66_COLLECT_NO_PII_1` (line 297+) programmatically asserts every key in every serialized JSON line is a member of the 12-field whitelist.

### Open Question Adjudications (10 / 10 HONOURED)

| OQ | Decision | Evidence |
|----|----------|----------|
| OQ-1 | Telemetry write INSIDE held lock | verify-and-advance.ts:1679-1721 (between Step 12 transcript and Step 12.5 cleanStagingOrphans) |
| OQ-2 | JSONL append-mode (NOT atomicWrite) | collect.ts:146 (`fs.appendFile`) |
| OQ-3 | `.strict()` defence-in-depth | schemas/telemetry.ts:37 + collect.ts:126 |
| OQ-4 | Strict-equals `=== true` gate | verify-and-advance.ts:1688 |
| OQ-5 | Mid-tier module placement | src/telemetry/ alongside migrations/state/transcript/upgrade; foundational imports at collect.ts:44-50 |
| OQ-6 | derivePhase + persona/model from dispatchSpec | verify-and-advance.ts:1697-1699 (derivePhaseFromStep + dispatchSpec.taskSpec?.persona + dispatchSpec.model with fallbacks) |
| OQ-7 | DEFER shared getStepConfig helper | I-43 carries forward at 6 sites — telemetry is GLOBAL + tier-asymmetric |
| OQ-8 | Best-effort with log.warn fallback | verify-and-advance.ts:1716-1720 (try/catch + single-line log.warn) |
| OQ-9 | Slash-command markdown UNCHANGED | commands/bmad-{next,loop}.md not in File List |
| OQ-10 | telemetryRoot test seam | verify-and-advance.ts:277 (RunVerifyAndAdvanceOptions.telemetryRoot? mirrors Story 2.6 runsRoot pattern) |

### Findings

| Severity | Count | Notes |
|----------|-------|-------|
| must-fix | 0 | — |
| should-fix | 0 | — |
| nits | 0 NEW (4 inherited N-1..N-4 carry forward) | Cosmetic; not Story 6.6 surface. |
| info | 0 NEW addressing this story (2 NEW forward-trackers I-47 + I-48); 5 closed | I-27 + I-41 NOW CLOSED at Story 6.6 close. |

#### Inherited NITs (carry forward unchanged)

- **N-1**: defensive null check at `src/commands/loop/stop-conditions.ts:269` (unreachable arm). Story 6.6 does not modify stop-conditions.ts.
- **N-2**: `EMPTY_DAG`+`EMPTY_STATE` sentinels mid-file at `src/commands/loop/run.ts`. Story 6.6 does not relocate.
- **N-3**: future task records snapshot final test counts AFTER the LAST `biome --write` pass. Story 6.6 honoured this discipline (1501/0/4907 snapshot taken after biome auto-fix).
- **N-4**: TWO unused LoopOpts seams `finalStateOverride`+`writeLoopExitTranscriptOverride`. Story 6.6 does not touch.

#### Inherited info trackers (status update)

- **CLOSED at Story 6.6**: I-27 (telemetry consumer wired — PRIMARY HONOURED), I-41 (model field consumed in telemetry record — PRIMARY HONOURED).
- **DEFERRED FORWARD unchanged**: I-43 (shared getStepConfig helper — Story 6.6 brings the count to 6 sites; OQ-7 DEFERS — telemetry is GLOBAL on/off + tier-asymmetric vs dispatch-tier per-step configs).
- **NOT applicable to Story 6.6**: I-1..I-17 (failure-UX), I-18..I-22 (Stories 5.5/5.6 carry-overs), I-23..I-25 (closed at predecessors), I-28..I-37, I-39..I-40, I-42, I-44..I-45.

#### NEW info trackers (produced by Story 6.6)

- **I-47** (forward to Story 6.7): the telemetry record `errorCode` field is OPTIONAL — when set, it carries `StepperError.code` from the outcomeError (verify-and-advance.ts:1706). Story 6.7 aggregator can group telemetry records by `errorCode` for failure-pattern analysis. Story 6.6 produced; Story 6.7 SDR will close at the aggregation report consumer.
- **I-48** (UTC discipline forward): telemetry monthly file naming `<YYYY-MM>.jsonl` is timezone-naive — `ts.slice(0, 7)` extracts YYYY-MM directly, but is UTC-locked because `new Date().toISOString()` always returns UTC `Z`-suffix. If a future story extends `ts` to include timezone info, the YYYY-MM derivation MUST remain UTC-locked for cross-machine consistency. Documented at `src/telemetry/collect.ts:88-92` JSDoc.

### Best-Effort Discipline (OQ-8)

`TLM_66_VANDA_ZOD_REJECT_1` (verify-and-advance.test.ts:3935-3989) injects a throwing `writeTelemetryRecordOverride` and asserts (a) the verifier's exitCode is preserved (verifier outcome remains the load-bearing user-facing signal); (b) `log.warn` was called with the "telemetry write failed (non-fatal)" prefix per AR21 single-line discipline. The catch block at `verify-and-advance.ts:1716-1720` mirrors the Story 2.5 transcript-write fallback pattern.

### File List Summary

**NEW (3)**:
- `src/telemetry/collect.ts` (138 LoC) — `writeTelemetryRecord` mid-tier writer.
- `src/telemetry/collect.test.ts` (333 LoC) — 18 TLM_66_COLLECT_* tests.
- `src/telemetry/index.ts` (21 LoC) — barrel.

**MODIFIED (7)**:
- `src/commands/next/verify-and-advance.ts` (+58 LoC)
- `src/commands/next/verify-and-advance.test.ts` (+275 LoC; 6 TLM_66_VANDA_*)
- `src/commands/next/run.ts` (+5 LoC type-only)
- `src/commands/next/run.test.ts` (+38 LoC; 4 TLM_66_RUN_*)
- `src/commands/loop/run.ts` (+8 LoC type-only)
- `src/commands/loop/run.test.ts` (+58 LoC; 3 TLM_66_LOOP_*)
- `docs/configuration.md` (+57 LoC; telemetry Wiring + NFR-S3 + AC-3 + JSONL append semantics + forward-tracker for Stories 6.3-6.8)

### Story Close

Story 6.6 is COMPLETE. Story 6.7 (telemetry aggregation report) is the next step — it reads the JSONL files Story 6.6 writes and consumes I-47 forward-tracker.
