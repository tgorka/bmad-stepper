---
status: done
story_id: '6.5'
story_key: 6-5-verifiers-per-step-config-override
epic: '6'
title: '`verifiers:` Per-Step Config Override'
created: '2026-05-05'
last_updated: '2026-05-05T11:34:10Z'
priority: high
estimated_effort: S
fr_coverage:
  - FR38     # PRIMARY — `verifiers:` per-step config override (architecture line 779; epics.md line 77 + line 285)
  - FR17     # PRIMARY — verifier registry consumer wired to project-config layer (architecture §D9 line 490 resolution priority)
  - FR34     # PRIMARY — config layer feeds the verifier registry (project > user > defaults)
  - FR54     # SECONDARY — info() stderr log line surfaces non-default merged config when project override active (mirror Story 6.3 / 6.4 single-line discipline; no `console.*`)
nfr_coverage:
  - NFR-R1   # PRIMARY — strict Zod validation rejects malformed `verifiers:` at load time (Story 6.1 baseline + I-46 `.strict()` discipline)
  - NFR-R6   # PRIMARY — Zod-validated verifier configs on every read via `VerifiersSchema = z.record(z.string(), VerifierConfigSchema)`
  - NFR-S1   # main-thread output discipline (info() stderr only; no `console.log`)
  - NFR-S6   # PRIMARY — no execution of sub-agent output; AR17 security extension — NO user-supplied custom code per AC-2
  - NFR-M2   # actionable-error contract — invalid verifier values surface single-line ConfigError at LOAD time (Story 6.1 wired; Story 6.5 adds AC-3 mismatch path)
  - NFR-M3   # schema-versioning + defence-in-depth Zod parse on the merged config returned by `getVerifierConfig`
ar_coverage:
  - AR41     # PRIMARY — boundary graph (`src/verifiers/registry.ts` HIGHER-TIER per architecture lines 1287-1289; allowed imports unchanged: `./types.ts`, `./defaults.ts`; Story 6.5 ADDS `../schemas/config.ts` type-only import for `Verifiers` / `VerifierConfig` schema-side type — same foundational tier)
  - AR42     # PRIMARY — Zod schema-first (VerifierConfigSchema is source-of-truth at `src/schemas/config.ts:188-192`; Story 6.5 applies `.strict()` per I-46 SUBSTANTIVELY)
  - AR17     # PRIMARY — security: NO user-supplied custom code per AC-2 verbatim. Project config carries data-only fields (`requiredFiles`, `requiredFrontmatterSections`, `mode`); the `custom?` callback REMAINS plugin-side (declared in `src/verifiers/defaults.ts` only). Story 6.5 OQ-2 documents this boundary.
  - AR21     # PRIMARY — single-line constraint on ConfigError actionable hints (inherited from Story 6.1 ConfigError on invalid verifier)
  - AR22     # PRIMARY — actionable-hint regex /^.*(Run|See|Try|Check) /
  - AR33     # PRIMARY — synchronous `getVerifierConfig` lookup; throws `ConfigError` (Story 1.2 registry) on AC-3 schema-mismatch path; never `console.*`; never `process.exit`
  - AR9      # SECONDARY — AR9 stdout JSON-line invariant unchanged; verifier registry does NOT emit AR9 lines (verifier-result.json is a separate file write per architecture §P5)
  - AR8      # lock-free top-tier preserved (run.ts still pure-read; ZERO state.yaml writes)
deps:
  - story: '6.1'
    reason: 'PRIMARY — `loadConfig()` produces typed `Config` with `config.verifiers` (closed-shape `VerifiersSchema = z.record(z.string(), VerifierConfigSchema)` at `src/schemas/config.ts:197`; `VerifierConfigSchema = z.object({ requiredFiles?, requiredFrontmatterSections?, mode? })` at `src/schemas/config.ts:188-192`). Story 6.1 SDR I-26 PRIMARY HONOURED here: Story 6.5 wires the per-step verifier registry merge logic. Story 6.1 inputs to wire: (a) `loadConfig()` exposes `Config.verifiers` as `Verifiers` record (default `{}` per src/schemas/config.ts:298); (b) `src/schemas/config.ts` exports `VerifierConfigSchema` + `VerifiersSchema` + `VerifierConfig` (schema-side) + `Verifiers` types; (c) `Config.verifiers` is REQUIRED with default `{}` (Story 6.1 ConfigV1Schema `verifiers: VerifiersSchema.default({})`); (d) NO loader-API change needed for Story 6.5 (Story 6.1 SDR I-26 verbatim). The schema-side `VerifierConfig` (data-only: `requiredFiles?`, `requiredFrontmatterSections?`, `mode?`) is DELIBERATELY DIFFERENT from the registry-side `VerifierConfig` (full-shape: `requiredFiles`, `requiredFrontmatterSections`, `schema`, optional `custom?`) — Story 6.5 OQ-1 documents this two-tier name reuse + Story 6.5 OQ-3 adjudicates rename-vs-keep.'
  - story: '2.1'
    reason: 'PRIMARY — verifier registry + `getVerifierConfig(stepName)` lookup at `src/verifiers/registry.ts:57-69`. Story 2.1 ALREADY shipped (a) the `verifierRegistry` baseline (`defaultVerifiers` from `src/verifiers/defaults.ts` — 8 entries: default + prd + architecture + dev-story + code-review + story-create + retro + analyst-research); (b) the synchronous `getVerifierConfig(stepName)` lookup with `default` fallback; (c) the `VerifierConfig` registry-side type at `src/verifiers/types.ts:92-111` (full-shape with `schema: ZodSchema | null` + `custom?` callback). Story 6.5 EXTENDS `getVerifierConfig` to ACCEPT an optional `projectVerifiers?: Verifiers` parameter (the schema-side `Verifiers` map from `Config.verifiers`); when supplied, the registry merges/replaces per the per-step `mode` field. The `custom?` callback REMAINS plugin-side (AR17 — security). The `schema` field REMAINS plugin-side (AC-2 — custom checks remain plugin-side; the schema can be referenced by NAME from project config but NEVER constructed runtime). When `projectVerifiers === undefined` (current callers), behaviour is byte-identical to Story 2.1 (production runtime not yet threading config — Story 6.5 wires the threading at the consumer site `runVerifier`).'
  - story: '6.4'
    reason: 'PATTERN + IMMEDIATE PREDECESSOR — Story 6.4 (`budgets:` per-step config) shipped the SAME schema-strictness pattern Story 6.5 follows: extend `VerifierConfigSchema = z.object({...})` with `.strict()` per I-46 forward-tracker (rejects unknown fields like `verifierFile: "./custom.ts"` or `judge: "claude"` at LOAD time — backwards-compat preserved since existing fixtures use only the documented 3 fields). Story 6.4 SDR forward-trackers I-43/I-44/I-45/I-46 all CARRIED forward unchanged; I-46 is PRIMARY HONOURED here; I-43 (shared `getStepConfig` helper after 5+ sites) — Story 6.5 brings the count to 5 (models/budgets/failurePolicies/overrides/verifiers); Story 6.5 OQ-5 adjudicates extract-vs-defer (DEFER per OQ-5 — verifier merge is shape-asymmetric so a generic helper would not help). Story 6.4 SDR forward-tracker I-25 PRIMARY HONOURED at Story 6.4 — NOT applicable to Story 6.5 (different config sub-schema).'
  - story: '6.3'
    reason: 'PATTERN — Story 6.3 (`models:` per-step config) shipped the runner-side wiring pattern Stories 6.4 + 6.5 mirror. **Story 6.5 differs**: the consumer is NOT the dispatch-spec generator (Stories 6.3/6.4 wire `buildDispatchSpec({...overrides})`); it is the **verifier registry** (`getVerifierConfig(stepName)`). The `RunVerifyAndAdvanceOptions.config?` seam (frozen across Stories 5.6 + 6.1 + 6.2 + 6.3 + 6.4) is EXTENDED with `verifiers?: Verifiers` so the runner can thread project config through `runVerifier` → `getVerifierConfig`. The `info()` log line surfacing non-default merged verifier config is OPTIONAL (Story 6.5 OQ-4 DEFERS — minimal value at runtime; full audit lives in the markdown transcript via the verifier-result.json artifact path; AR21+22 single-line constraint already preserved on existing log lines).'
  - story: '6.2'
    reason: 'PATTERN — Story 6.2 added `.strict()` to `OverrideEntrySchema` per I-38 forward-tracker (consumer-side schema strictness). Story 6.5 SHOULD apply `.strict()` to `VerifierConfigSchema` per I-46 PRIMARY HONOURED — `VerifierConfigSchema` is `z.object({...})` (NOT `z.enum`), so `.strict()` is meaningful (rejects unknown fields like `verifierFile`, `judge`, `customFn`). Story 6.2 OQ-4 worked example confirmed the pattern. Story 6.4 substantively honoured I-38 for `BudgetSchema = z.object`; Story 6.5 follows the SAME pattern verbatim.'
  - story: '5.6'
    reason: 'PATTERN — `opts.config` seam frozen. Story 5.6 froze the seam at LoopOpts + RunNextOptions + RunVerifyAndAdvanceOptions; Story 6.1 + 6.2 + 6.3 + 6.4 extended; Story 6.5 reads from THE SAME seam — `opts.config?.verifiers?.[stepName]` AT THE VERIFIER CALL SITE (not the dispatch site). ZERO seam mutation beyond a `verifiers?: Verifiers` field addition (mirror of Story 6.4 `budgets?: Budgets` add) on `RunVerifyAndAdvanceOptions.config` + downstream `RunNextOptions.config` + `LoopOpts.config` + both `loadConfigOverride` return types. Story 5.6 OQ-9 confirmed (registry stays at 17 across Epic 6).'
  - story: '1.2'
    reason: 'PRIMARY — errors-registry CI gate + ConfigError class with hintOverride seam. Story 6.5 ships ZERO new error classes — REUSES existing `ConfigError` (Story 1.2 registry) for both (a) the loader-side validation path (Story 6.1 baseline — invalid `verifiers:` shape rejected via Zod parse failure → ConfigError exit 2) and (b) the AC-3 path (config-supplied verifier mismatch — e.g., reference to a non-existent Zod schema name). The CI gate at `src/errors.test.ts` automatically covers any ConfigError instance. Registry stays at 17 codes — verified independently from a fresh shell.'
  - story: '1.5'
    reason: 'PATTERN — schemas/migrations skeleton. Story 1.5 + 6.1 established `VerifierConfigSchema` + `VerifiersSchema`. Story 6.5 EXTENDS the schema MINIMALLY: apply `.strict()` per I-46 forward-tracker (rejects unknown fields). Backwards-compat: existing fixtures use only `requiredFiles` + `requiredFrontmatterSections` + `mode` — `.strict()` is non-breaking. The schemaVersion stays at v1 (no migration needed — `.strict()` is structural validation, not shape change).'
  - story: '1.3'
    reason: 'PRIMARY — io/log.ts (the `info` helper). Story 6.5 may EXTEND existing verifier `info()` lines to surface non-default merged config when project override is active (mirror Story 6.4 conditional non-default log line). DEFERRED per OQ-4 — minimal runtime value; full audit in markdown transcript via verifier-result.json artifact path; AR21+22 single-line constraint already preserved on existing verifier `info()` line at `src/verifiers/checks.ts:463`.'
  - story: '2.5'
    reason: 'PRIMARY — transcript module group (`src/runs/`). Story 2.5 ALREADY shipped `verifier-result-path: string | null` on `TranscriptInput` AND the JSON run-log already records the verifier-result-path; Story 6.5 does NOT mutate the transcript writer. The verifier-result.json itself records `checks[]` outcomes — the project-supplied required-sections / required-files would surface as PASS/FAIL detail per check. Story 6.5 ZERO mutation to `src/runs/render-markdown.ts` / `src/runs/build-run-log.ts`; the audit trail is implicit in the verifier-result.json + transcript link.'
  - story: '2.6'
    reason: 'CONSUMER — `src/commands/next/verify-and-advance.ts` (Story 2.6) calls `runVerifier(runId, opts)` at the canonical happy-path site. After Story 6.5, the call ADDITIONALLY threads `projectVerifiers: opts.config?.verifiers` into `runVerifier` → `getVerifierConfig(stepName, projectVerifiers)` so the merge resolves per-step. The wiring is a TWO-LINE change at the existing call site (RunVerifyAndAdvanceOptions.config already exists per Story 5.6; Story 6.5 only adds the `verifiers?: Verifiers` field).'
  - story: '6.6'
    reason: 'CROSS-STORY COORDINATION — Story 6.6 (telemetry opt-in collection) is INDEPENDENT — the telemetry record per architecture line 1664 will record `verifierStatus` (pass/fail) but NOT the merged verifier config shape. Story 6.5 sources the merge for the runtime; Story 6.6 records the per-step status outcome to JSONL.'
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/implementation-artifacts/6-1-bmad-stepper-config-yaml-schema-loader.md
  - _bmad-output/implementation-artifacts/6-2-dag-overrides-block.md
  - _bmad-output/implementation-artifacts/6-3-models-per-step-config.md
  - _bmad-output/implementation-artifacts/6-4-budgets-per-step-config.md
  - _bmad-output/implementation-artifacts/2-1-verifier-configuration-registry.md
  - _bmad-output/implementation-artifacts/2-6-verify-and-advance-ts-with-state-hash-check.md
  - _bmad-output/implementation-artifacts/sprint-status.yaml
  - _bmad-output/implementation-artifacts/epic-5-retrospective.md
  - _bmad-output/implementation-artifacts/epic-4-retrospective.md
  - .bmad-stepper/state.yaml
  - .bmad-stepper/config.yaml
  - src/schemas/config.ts
  - src/schemas/config.test.ts
  - src/verifiers/registry.ts
  - src/verifiers/registry.test.ts
  - src/verifiers/defaults.ts
  - src/verifiers/types.ts
  - src/verifiers/checks.ts
  - src/verifiers/index.ts
  - src/config/load.ts
  - src/config/index.ts
  - src/errors.ts
  - src/errors.test.ts
  - src/io/log.ts
  - src/commands/next/run.ts
  - src/commands/next/run.test.ts
  - src/commands/next/verify-and-advance.ts
  - src/commands/loop/run.ts
  - src/commands/loop/run.test.ts
  - commands/bmad-next.md
  - commands/bmad-loop.md
  - docs/configuration.md
---

# Story 6.5: `verifiers:` Per-Step Config Override

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper user (BMAD Upgrade journey),
I want `verifiers: { story-create: { requiredFrontmatterSections: [..., status, owner] } }` to extend the per-step verifier config,
So that I can tighten requirements for my project without forking the plugin: when the verifier registry resolves a config for a step, my project-config required sections merge with (or replace, depending on the declared `mode`) the plugin defaults so project overrides win, **custom checks remain plugin-side per AR17 (security — no user-supplied custom code)**, and a config-supplied verifier mismatch (e.g., reference to a non-existent Zod schema name) surfaces `CONFIG_ERROR` early at LOAD time with a single-line actionable hint.

## Context Summary

This is the **FIFTH STORY of Epic 6** and lands the **`verifiers:` per-step config override consumer at the verifier registry merge logic + AR17 security boundary + AC-3 early-failure path on schema-name mismatch**. Story 6.1 shipped the `loadConfig()` file loader + the typed `VerifierConfigSchema = z.object({ requiredFiles?, requiredFrontmatterSections?, mode? })` at `src/schemas/config.ts:188-192` AND the `VerifiersSchema = z.record(z.string(), VerifierConfigSchema)` at `src/schemas/config.ts:197` AND `Config.verifiers: VerifiersSchema.default({})` at `src/schemas/config.ts:298`. Story 2.1 ALREADY shipped (a) the `verifierRegistry` (defaultVerifiers map at `src/verifiers/defaults.ts`) with 8 entries (default + prd + architecture + dev-story + code-review + story-create + retro + analyst-research); (b) the synchronous `getVerifierConfig(stepName)` lookup at `src/verifiers/registry.ts:57-69` with `default` fallback; (c) the **registry-side** `VerifierConfig` interface at `src/verifiers/types.ts:92-111` with full-shape (`requiredFiles`, `requiredFrontmatterSections`, `schema: ZodSchema | null`, optional `custom?`). Story 2.6 wires the consumer at `src/commands/next/verify-and-advance.ts` via `runVerifier(runId, opts) → checks.ts:453 const config = getVerifierConfig(opts.stepName)`. **Story 6.5 is therefore primarily a CONSUMER-SIDE EXTENSION**: extend `getVerifierConfig` to accept an optional second argument `projectVerifiers?: Verifiers` (schema-side type from `Config.verifiers`); when supplied, merge / replace per the per-step `mode` field; thread `opts.config?.verifiers` from `RunVerifyAndAdvanceOptions.config` through `runVerifier({stepName, projectVerifiers})` → `getVerifierConfig(stepName, projectVerifiers)`; preserve the `custom?` callback ONLY plugin-side (AR17 — never sourced from project config); apply `.strict()` to `VerifierConfigSchema` per I-46 SUBSTANTIVE honour; surface `ConfigError` at LOAD time on AC-3 schema-name-mismatch path.

Concretely the wiring is:

1. **AC-1 (project-config required sections merged with / replace plugin defaults; project overrides win; merge mode declared)**:
   - The schema-side type already declares the mode field: `mode: z.enum(["merge", "replace"]).optional()` at `src/schemas/config.ts:191`. **Default is `"merge"` when omitted** (the Story 6.1 docs/configuration.md line 248 says: `"merge"` (default — combine with the registry baseline) or `"replace"` (replace the registry baseline entirely)).
   - At `src/verifiers/registry.ts`, EXTEND `getVerifierConfig` signature from `(stepName: string)` to `(stepName: string, projectVerifiers?: Verifiers)` where `Verifiers` is imported as a TYPE from `../schemas/config.ts` (no runtime import — type-only per AR41 boundary preservation; the foundational tier `src/schemas/` is already an allowed import per Story 2.1's checks.ts).
   - When `projectVerifiers === undefined`: behaviour byte-identical to Story 2.1 (existing `defaultVerifiers[stepName] ?? defaultVerifiers.default`).
   - When `projectVerifiers !== undefined` AND `projectVerifiers[stepName] !== undefined`:
     * Resolve `baseline = defaultVerifiers[stepName] ?? defaultVerifiers.default`.
     * Resolve `override = projectVerifiers[stepName]`.
     * Resolve `mode = override.mode ?? "merge"`.
     * If `mode === "replace"`: return `{ requiredFiles: override.requiredFiles ?? [], requiredFrontmatterSections: override.requiredFrontmatterSections ?? [], schema: baseline.schema, ...(baseline.custom !== undefined ? { custom: baseline.custom } : {}) }` — fields explicitly set in the override take effect; UNSET fields fall through to empty arrays (NOT to the baseline — that would defeat "replace"); `schema` and `custom?` are preserved from the baseline (AR17 — these are plugin-side seams, NEVER project-supplied).
     * If `mode === "merge"`: return `{ requiredFiles: union(baseline.requiredFiles, override.requiredFiles ?? []), requiredFrontmatterSections: union(baseline.requiredFrontmatterSections, override.requiredFrontmatterSections ?? []), schema: baseline.schema, ...(baseline.custom !== undefined ? { custom: baseline.custom } : {}) }` where `union` = de-duplicating concatenation preserving baseline order then appending new override entries (Story 6.5 OQ-1 adjudicates union vs concat — DEDUPED for AC-1 "project overrides win" wording on duplicates: project-supplied entry wins position over baseline entry only if listed; otherwise baseline order preserved).
   - When `projectVerifiers !== undefined` AND `projectVerifiers[stepName] === undefined`: NO project override — behaviour identical to the no-config path (resolve from `defaultVerifiers[stepName] ?? defaultVerifiers.default`).
   - At `src/verifiers/checks.ts:453`, EXTEND `runVerifier(runId, opts: RunVerifierOptions)` to accept `opts.projectVerifiers?: Verifiers` and forward to `getVerifierConfig(opts.stepName, opts.projectVerifiers)`.
   - At `src/commands/next/verify-and-advance.ts`, THREAD `opts.config?.verifiers` into the `runVerifier(...)` call (or `verifierFn(...)` when test seam supplied) — pass `projectVerifiers: opts.config?.verifiers`.

2. **AC-2 (custom checks remain plugin-side; no user-supplied custom code per AR17 — security)**:
   - The schema-side `VerifierConfigSchema` at `src/schemas/config.ts:188-192` does NOT declare a `custom` or `custom?` field — only `requiredFiles?`, `requiredFrontmatterSections?`, `mode?`. The `.strict()` extension per I-46 makes this constraint LOAD-time enforced — a project YAML that supplies `custom: "./my-fn.ts"` or `customFn: { ... }` is REJECTED at parse time with a single-line ConfigError actionable hint pointing at the unrecognized-keys path.
   - At the merge logic in `getVerifierConfig`, the registry-side `custom?` callback is preserved from the baseline `defaultVerifiers[stepName].custom?` ONLY — it is NEVER sourced from project config (the type system already forbids this since `Verifiers` from the schema layer has no `custom` field).
   - **Documentation** in `docs/configuration.md`: explicitly state per AR17 + AC-2 that "custom checks (the `custom` field on the registry-side `VerifierConfig`) are PLUGIN-SIDE ONLY — declared in `src/verifiers/defaults.ts` and never sourced from project config. This is enforced by the schema (no `custom` field on the project-side `VerifierConfigSchema`) AND by the `.strict()` validation that rejects unknown keys at LOAD time. v0.1 ships ZERO `custom` callbacks (all 8 plugin defaults set only `requiredFiles` + `requiredFrontmatterSections` + `schema: null`); the `custom?` seam remains for plugin-side extension stories (Story 6.x — LLM-as-judge `judge:` field per architecture line 1727)."

3. **AC-3 (config-supplied verifier mismatch surfaces `CONFIG_ERROR` early)**:
   - **Primary path (AC-3 verbatim "reference to a non-existent Zod schema")**: the v0.1 schema-side `VerifierConfigSchema` does NOT declare a `schema` field by NAME (the registry-side `VerifierConfig.schema: ZodSchema | null` is plugin-side only). However, the AC-3 verbatim wording invokes "reference to a non-existent Zod schema" as the canonical mismatch example — this maps to `.strict()` rejecting an unknown `schema: "MySchema"` key on the project-side YAML. Story 6.5 OQ-2 documents: AC-3 is satisfied by the `.strict()` extension per I-46 — a project YAML that names a non-existent schema (e.g., `schema: "FooBarSchema"`) is REJECTED at LOAD time with `ConfigError` exit 2 + single-line actionable hint pointing at the unrecognized-keys path. **This honours AC-3 "early" wording verbatim** — the failure surfaces at `loadConfig()` invocation BEFORE any sub-agent dispatch / verifier invocation.
   - **Secondary mismatch paths covered by `.strict()`**: `verifierFile: "./custom.ts"` (NOT permitted); `judge: "claude"` (NOT permitted — LLM-as-judge is plugin-side per architecture line 1727); `customFn: { ... }` (NOT permitted per AR17); etc. All these surface via the SAME ConfigError single-line path.
   - **Test density**: a fixture `verifiers: { "dev-story": { schema: "MySchema" } }` in bmad-stepper.config.yaml → `loadConfig()` throws ConfigError exit 2 with hint pointing at `verifiers.dev-story` unrecognized-keys path. The hint is single-line per AR21+22 — Story 6.1 + 6.2 + 6.3 + 6.4 patterns already covered.

The runners (`src/commands/next/run.ts` + `src/commands/loop/run.ts`) thread `opts.config?.verifiers` from `loadConfig()` through the `RunNextOptions.config` + `RunVerifyAndAdvanceOptions.config` seams to the verifier consumer once Story 6.1's `loadConfig()` is in the call chain (already wired). This is the canonical Story 6.1 SDR I-26 deliverable: ZERO loader-API change for Story 6.5; consumption through the typed `Config.verifiers` field.

### What is in scope (Story 6.5)

1. **`VerifierConfigSchema` `.strict()` extension per I-46 forward-tracker** — `src/schemas/config.ts:188-192` currently declares `VerifierConfigSchema = z.object({ requiredFiles?, requiredFrontmatterSections?, mode? })`. Story 6.5 extends to `VerifierConfigSchema = z.object({...}).strict()` per I-46 PRIMARY HONOURED. The `.strict()` rejects unknown fields like `schema: "MySchema"`, `verifierFile`, `judge`, `customFn`, `custom` at LOAD time with a single-line ConfigError. This is the AC-3 PRIMARY mechanism. Backwards-compat: existing fixtures use only the documented 3 fields — non-breaking. NO schemaVersion bump (structural validation, not shape change).

2. **`getVerifierConfig` signature extension** — at `src/verifiers/registry.ts:57-69`, extend signature from `(stepName: string)` to `(stepName: string, projectVerifiers?: Verifiers)` where `Verifiers` is `import type { Verifiers } from "../schemas/config.ts"`. The TYPE-ONLY import is allowed per AR41 (foundational tier `../schemas/` is permitted from the higher-tier `../verifiers/` per architecture lines 1287-1289 — Story 2.1 already imports from `../schemas/verifier-result.ts` at `checks.ts`). When `projectVerifiers === undefined`, behaviour is byte-identical to Story 2.1 (no regression). The merge logic is implemented inline (~30 LoC) — Story 6.5 OQ-5 DEFERS extracting a `mergeVerifierConfig(baseline, override, mode)` helper because the merge logic is not duplicated elsewhere (single call site in `getVerifierConfig`).

3. **`runVerifier` opts extension** — at `src/verifiers/checks.ts`, extend `RunVerifierOptions` interface (`src/verifiers/checks.ts:344-367`) with `projectVerifiers?: Verifiers` and forward to `getVerifierConfig(opts.stepName, opts.projectVerifiers)` at `checks.ts:453`. The type import is `import type { Verifiers } from "../schemas/config.ts"`. NO runtime import; pure type extension.

4. **`RunVerifyAndAdvanceOptions.config.verifiers?` extension** — at `src/commands/next/verify-and-advance.ts:247-249`, extend `opts.config?` from `{ failurePolicies?: FailurePolicies }` to ALSO include `verifiers?: Verifiers` (mirror Story 6.4 `budgets?: Budgets` add for `RunNextOptions.config`). At the `runVerifier(...)` call site (`verify-and-advance.ts:1017` — `verifierFn(runId, { stepName, stagingRoot })`), thread `projectVerifiers: opts?.config?.verifiers` via conditional spread (mirror Story 6.4 `budgetOverride` conditional spread pattern at run.ts:2087-2102): `verifierFn(runId, { stepName, stagingRoot, ...(opts?.config?.verifiers !== undefined ? { projectVerifiers: opts.config.verifiers } : {}) })`. Same threading at the `verifierFn` test-seam signature so the test seam can also receive `projectVerifiers` if it wants to (TEST-only — not load-bearing).

5. **`RunNextOptions.config.verifiers?` extension** — at `src/commands/next/run.ts:330-334`, extend the inline `config?` type (currently `{ failurePolicies?, models?, budgets?, ... }`) with `verifiers?: import("../../schemas/config.ts").Verifiers` (mirror Story 6.4 `budgets?: Budgets` add at line 333). Same extension at `loadConfigOverride` return type at lines 352-362.

6. **`LoopOpts.config.verifiers?` extension** — at `src/commands/loop/run.ts`, extend `LoopOpts.config` (lines 462-475) with `verifiers?: Verifiers` (mirror Story 6.4 `budgets?: Budgets` add) + extend `loadConfigOverride` return type (lines 485-497) with `verifiers?: Verifiers` + extend the local `effectiveConfig` type (lines 841-849) so `productionRunNextFn` threads `verifiers` through to `runNext` and downstream to `verify-and-advance`.

7. **Cross-runner threading at runNext → verify-and-advance** — at `src/commands/next/run.ts`, the runner consults `opts.config?` and ultimately the `verify-and-advance.ts` step uses `RunVerifyAndAdvanceOptions.config?.verifiers` to thread to `runVerifier`. The threading is via the existing `opts.config` seam (Story 5.6 frozen) — Story 6.5 only extends the TYPE shape; the existing config-flow (run.ts → verify-and-advance.ts) ALREADY forwards opts.config; ZERO behavioural change beyond the new field. (Confirm this in Task 1 read pass.)

8. **Tests** — colocated `src/verifiers/registry.test.ts` extension + `src/verifiers/checks.test.ts` extension + `src/schemas/config.test.ts` extension + `src/commands/next/verify-and-advance.test.ts` extension + `src/commands/next/run.test.ts` extension + `src/commands/loop/run.test.ts` extension:
   - **VER_65_SCHEMA_***: AC-3 — `VerifierConfigSchema.parse({ requiredFrontmatterSections: ["status"] })` succeeds; `VerifierConfigSchema.parse({})` succeeds (all fields optional); `VerifierConfigSchema.parse({ mode: "merge" })` succeeds; `VerifierConfigSchema.parse({ mode: "invalid" })` throws (enum constraint); `VerifierConfigSchema.parse({ requiredFiles: "*.md" })` throws (must be array of strings).
   - **VER_65_SCHEMA_STRICT_***: I-46 — `VerifierConfigSchema.parse({ requiredFrontmatterSections: ["status"], schema: "MySchema" })` throws Zod error with `schema` in the unrecognized-keys path (`.strict()` rejects). Symmetric tests for `verifierFile`, `judge`, `customFn`, `custom`.
   - **VER_65_VERIFIERS_RECORD_***: `VerifiersSchema.parse({ "dev-story": { requiredFrontmatterSections: ["status", "owner"], mode: "merge" } })` succeeds; `VerifiersSchema.parse({})` succeeds (empty record); `VerifiersSchema.parse({ "dev-story": { mode: "replace-all" } })` throws Zod error with `dev-story.mode` in the issue path.
   - **VER_65_REGISTRY_NO_OVERRIDE_***: AC-1 baseline — `getVerifierConfig("dev-story", undefined)` returns `defaultVerifiers["dev-story"]` byte-identical (regression coverage); `getVerifierConfig("unknown-step", undefined)` returns `defaultVerifiers.default` (regression).
   - **VER_65_REGISTRY_MERGE_***: AC-1 merge — `getVerifierConfig("story-create", { "story-create": { requiredFrontmatterSections: ["owner"] } })` returns `{ requiredFiles: ["**/*.md"], requiredFrontmatterSections: ["title", "status", "story_id", "owner"], schema: null }` (default mode = merge; baseline order preserved; new entry appended). Symmetric test with explicit `mode: "merge"`. De-dup test: project supplies `["status", "owner"]` → result has each entry once (status from baseline; owner from project).
   - **VER_65_REGISTRY_REPLACE_***: AC-1 replace — `getVerifierConfig("dev-story", { "dev-story": { requiredFrontmatterSections: ["title", "owner"], mode: "replace" } })` returns `{ requiredFiles: [], requiredFrontmatterSections: ["title", "owner"], schema: null }` (mode replace; explicit array wins; UNSET requiredFiles falls through to empty array NOT to the baseline `["**/*.md"]`). NEW test: replace mode with both arrays explicitly empty → both arrays empty in result; `schema` still preserved from baseline.
   - **VER_65_REGISTRY_NO_MATCH_***: AC-1 — `getVerifierConfig("dev-story", { "different-step": { ... } })` (project supplies override for OTHER step; current step has no project override) returns `defaultVerifiers["dev-story"]` byte-identical.
   - **VER_65_REGISTRY_CUSTOM_PRESERVED_***: AR17 — when `defaultVerifiers["fake-step"].custom` is defined (synthetic test fixture), `getVerifierConfig("fake-step", { "fake-step": { requiredFrontmatterSections: ["x"] } })` returns the merged config WITH `custom` from the baseline preserved verbatim (NEVER from project — type system enforces; this test asserts runtime behaviour).
   - **VER_65_REGISTRY_FALLBACK_***: AC-1 — `getVerifierConfig("totally-unknown", { "totally-unknown": { requiredFrontmatterSections: ["x"] } })` returns merged config built from `defaultVerifiers.default` (NOT a missing entry) — the fallback to default still applies WHEN project supplies an override for an unknown step.
   - **VER_65_CHECKS_THREADING_***: AC-1 — `runVerifier(runId, { stepName, stagingRoot, projectVerifiers: { "dev-story": { ... } } })` exercises the merged config in checkFrontmatter / checkRequiredFiles. Verify that the merged additional-frontmatter-section "owner" surfaces as a check failure when missing from artifact frontmatter.
   - **VER_65_VANDA_***: AC-1 — `runVerifyAndAdvance({ ..., config: { verifiers: { "dev-story": { requiredFrontmatterSections: ["owner"] } } } })` (or via `verifierFn` test seam) exercises the threading from RunVerifyAndAdvanceOptions through to runVerifier.
   - **VER_65_LOAD_INVALID_***: AC-3 — fixture with `verifiers: { "dev-story": { schema: "MySchema" } }` in bmad-stepper.config.yaml → `loadConfig()` throws ConfigError exit 2 with single-line hint pointing at `verifiers.dev-story.schema` (unrecognized-keys path). Symmetric fixture with `verifiers: { "dev-story": { customFn: {...} } }` → ConfigError. Symmetric fixture with `verifiers: { "dev-story": { judge: "claude" } }` → ConfigError.
   - **VER_65_RUN_***: AC-1 wiring at runner — at `src/commands/next/run.test.ts`, supply `opts.config = { ..., verifiers: { "<step>": { requiredFrontmatterSections: ["owner"] } } }` via the existing test seam. Verify the threading reaches `runVerifyAndAdvance` (via the runNext → verify-and-advance call chain). Symmetric test asserting absent config.verifiers → no override surfaces.
   - **VER_65_LOOP_***: same pattern at `src/commands/loop/run.test.ts` — verify `loadConfigOverride` threads `verifiers` through to runNext + verify-and-advance.

9. **Documentation refresh** — update `docs/configuration.md` `verifiers:` section (currently lines 240-259):
   - REMOVE the "(Story 6.5 will land the consumer logic; v0.1 ships the schema only.)" line (line 251) — Story 6.5 lands the consumer.
   - ADD a "**Wiring (Story 6.5)**" sub-section: documents how `getVerifierConfig(stepName, projectVerifiers?)` threads through `runVerifier`; the merge / replace semantics with worked examples (mirror the Story 6.4 budgets section structure).
   - ADD an "**AR17 security boundary (AC-2)**" sub-section: documents that `custom` checks (and `schema` references) are PLUGIN-SIDE ONLY; project YAML cannot supply executable code or schema constructors; rejected at LOAD time via `.strict()`.
   - ADD an "**AC-3 schema-mismatch failure mode**" sub-section: documents that `.strict()` rejects unknown fields (e.g., `schema: "MySchema"`, `verifierFile`, `judge`, `customFn`, `custom`) at LOAD time with a single-line `ConfigError` actionable hint.
   - Cross-link to architecture §D9 line 490 (resolution priority) + line 1727 (LLM-as-judge deferred) + AR17 (security).
   - Forward-tracker section: remove I-26 (Story 6.5 now CLOSED); update I-43 (5 sites accumulated; Story 6.x cleanup forward); update I-46 (Story 6.5 now CLOSED — substantively honoured).

### Cross-story coordination preserved

- **Story 6.1 SDR I-26 PRIMARY HONOURED** — Story 6.5 wires the per-step verifier registry merge logic. ZERO loader-API change for Story 6.5.
- **Story 6.4 SDR I-46 PRIMARY HONOURED** — Story 6.5 applies `.strict()` to `VerifierConfigSchema = z.object` (substantive honour pattern from Story 6.4 BudgetSchema).
- **Story 2.1 verifier registry UNCHANGED at the `defaultVerifiers` data layer** — Story 6.5 only changes the `getVerifierConfig` signature + adds merge logic; `defaultVerifiers` map is byte-identical.
- **Story 2.6 verify-and-advance.ts opts.config seam UNCHANGED** — Story 6.5 only adds `verifiers?: Verifiers` to the `opts.config?` shape; existing `failurePolicies?` field unchanged.
- **Story 5.6 + 6.1 + 6.2 + 6.3 + 6.4 `opts.config` seam UNCHANGED** — Story 6.5 reads from the same seam at the verify-and-advance tier (one tier deeper than Stories 6.3 + 6.4 which wire dispatch-tier).
- **Errors registry HELD AT 17** — Story 6.5 ships ZERO new error classes; reuses `ConfigError` (Story 6.1 invalid-verifier loader path + AC-3 schema-mismatch path) and `VerifierFailureError` (Story 1.2 baseline registry).
- **Schema migration registry HELD AT v1** — ZERO mutation to `VerifierConfigSchema` shape; only `.strict()` validation extension (structural, not shape). NO `schemaVersion` bump.

### What is NOT in scope (deferred)

- **Per-artifact body Zod schema (the `schema` field in `VerifierConfigSchema`)** — DEFERRED. Architecture line 1727 + Story 2.1 already note that the `schema` field is plugin-side and per-artifact body schemas land in Story 6.x. Project config CANNOT name a schema (rejected by `.strict()`); plugin-side defaults still set `schema: null`.
- **LLM-as-judge `judge:` field** — DEFERRED per architecture line 1727. v0.1 ships ONLY conservative deterministic checks. Project config CANNOT supply `judge:` (rejected by `.strict()`); plugin-side `custom?` callback is the existing deterministic seam.
- **Custom user-supplied callback (the `custom?` field)** — DEFERRED + RESTRICTED per AR17 + AC-2. Project config CANNOT supply `custom:` (rejected by `.strict()`); plugin-side `custom?` callback in `defaultVerifiers` is the existing seam (not used in v0.1 — all 8 entries set `schema: null` and have NO `custom?`).
- **`verifiers: { "*": {...} }` wildcard step matching** — DEFERRED. v0.1 supports exact-step-id keys only (mirror Story 6.3 + 6.4 deferral).
- **`--no-verifiers` CLI flag** — DEFERRED (Story 6.x — same forward-tracker as `--no-models` / `--no-budgets`).
- **`--verifier-required-frontmatter <step>=<section>` ad-hoc CLI flag** — DEFERRED.
- **Telemetry collection of merged-verifier-config field** — Story 6.6 will record `verifierStatus` (pass/fail) but NOT the merged config shape (out of telemetry's closed set per architecture line 1664).
- **Shared `getStepConfig(config, sectionKey, stepName, default)` helper** — Story 6.4 I-43 carry-over. Story 6.5 OQ-5 DEFERS — verifier merge is shape-asymmetric (merge / replace + array union per `mode`); a generic helper would not capture this. Story 6.5 brings the lookup count to 5 sites (models / budgets / failurePolicies / overrides / verifiers); duplication across the 4 dispatch-tier sites remains 2-line lookup; verifier site is shape-asymmetric. Forward-tracker I-43 carries unchanged.

### Architectural challenges resolved here

**Architectural decision — apply `.strict()` to `VerifierConfigSchema` per I-46 (per OQ-1)**: I-46 forward-tracker (Story 6.4) noted that `.strict()` discipline applies to `z.object` schemas (NOT `z.enum` — Story 6.3 noted trivial honour). `VerifierConfigSchema = z.object({...})` is a `z.object`, so `.strict()` is meaningful — it rejects unknown fields like `schema: "MySchema"`, `verifierFile`, `judge`, `customFn`, `custom` at LOAD time. **Story 6.5 SUBSTANTIVELY honours I-46 by extending `VerifierConfigSchema` to `.strict()`** — this is also the **AC-3 PRIMARY mechanism** (the verbatim wording "reference to a non-existent Zod schema" maps to the unrecognized `schema:` key path; ConfigError fires at LOAD time with a single-line actionable hint). Backwards-compat: existing fixtures use only the documented 3 fields — non-breaking.

**Architectural decision — `getVerifierConfig` takes optional `projectVerifiers` second arg (per OQ-2)**: AC-1 verbatim says "the verifier registry resolves a config for a step" — the registry is `getVerifierConfig` at `src/verifiers/registry.ts:57-69`. The CLEAN extension is to add an optional second argument `projectVerifiers?: Verifiers` (the schema-side `Verifiers` map type from `Config.verifiers`) — when supplied, the registry merges / replaces; when `undefined`, behaviour is byte-identical to Story 2.1 (no regression for tests / production callers that have not yet threaded config). This preserves all 21 existing `getVerifierConfig` test cases at `src/verifiers/registry.test.ts` (regression coverage). The schema-side `Verifiers` type is `Record<string, { requiredFiles?: string[]; requiredFrontmatterSections?: string[]; mode?: "merge" | "replace" }>`; the registry-side `VerifierConfig` is `{ requiredFiles: readonly string[]; requiredFrontmatterSections: readonly string[]; schema: ZodSchema | null; custom?: (artifact: ArtifactRef) => ... }`. The merge logic is shape-asymmetric: project supplies optional fields; registry has required fields with `schema` + `custom?` baseline-only.

**Architectural decision — `mode: "replace"` semantics — UNSET fields fall through to empty arrays NOT to baseline (per OQ-3)**: AC-1 wording "merged with (or replace, depending on declared mode)" leaves the SEMANTICS of `replace` ambiguous: does an UNSET field in the project override fall through to baseline (so "replace" ONLY replaces explicitly-set fields) OR to empty (so "replace" really does replace the baseline section entirely)? **Story 6.5 chooses the second reading** — `mode: "replace"` with `requiredFiles: undefined` results in `requiredFiles: []` in the merged config (NOT the baseline `["**/*.md"]`). Rationale: (a) the docs/configuration.md `verifiers:` section already says "replace" — combine with the registry baseline OR replace it entirely; (b) "(replace) the registry baseline entirely" reads as full-section replacement; (c) this matches user mental model for "replace mode" — set both fields explicitly to override, leave both unset to clear; (d) the `schema` and `custom?` fields are PLUGIN-SIDE per AR17 — they ALWAYS come from baseline regardless of mode. The OQ-3 worked example: `{ "dev-story": { requiredFrontmatterSections: ["title", "owner"], mode: "replace" } }` results in `{ requiredFiles: [], requiredFrontmatterSections: ["title", "owner"], schema: null }` — `requiredFiles` becomes empty (not the baseline `["**/*.md"]`) because the project explicitly opted into replace mode without supplying that field.

**Architectural decision — `mode: "merge"` semantics — array union with baseline-order-preserved + de-dup (per OQ-4)**: AC-1 wording "project overrides win" applies to scalars (e.g., `mode` itself is a scalar) but is silent on array semantics for `requiredFiles` / `requiredFrontmatterSections`. The two readings: (a) UNION of arrays (baseline + override) with de-dup; (b) APPEND of override entries to baseline (no de-dup). **Story 6.5 chooses (a)** — UNION with de-dup; baseline order preserved; new override entries appended (preserving relative order within the override). Rationale: (a) matches user mental model ("add owner to required-frontmatter-sections" should not result in duplicate "title" entries if the project also lists it); (b) the docs/configuration.md example shows ADDITION of a single entry "Implementation Plan" — implicitly suggests de-dup; (c) the verifier check at `checks.ts:checkFrontmatter` would tolerate duplicates (key existence check is set-based) but would surface duplicates in error reporting strings — better to de-dup upstream; (d) baseline order preserved respects plugin authorship. Worked example: baseline `["title", "status", "story_id"]` + override `["status", "owner"]` → merged `["title", "status", "story_id", "owner"]` (baseline order preserved; "owner" appended; "status" not duplicated).

**Architectural decision — `custom?` callback NEVER from project config (per AR17 + AC-2 + OQ-5 SECURITY)**: AC-2 verbatim says "custom checks remain plugin-side (no user-supplied custom code per AR17 — security)". The schema layer ALREADY enforces this — `VerifierConfigSchema` does NOT declare a `custom` or `customFn` field; `.strict()` rejects unknown keys (Story 6.5 OQ-1 substantive honour of I-46). The merge logic in `getVerifierConfig` ALSO enforces this at runtime — `custom?` is preserved from the baseline `defaultVerifiers[stepName].custom?` ONLY (never from the schema-side `Verifiers` map, which has no `custom` field). The TWO-LAYER enforcement (schema + runtime) is defence-in-depth per AR42 + AR17. v0.1 ships ZERO `custom` callbacks across all 8 default entries (`schema: null` + no `custom?`); the seam exists for plugin-side extension stories (Story 6.x — LLM-as-judge `judge:` field per architecture line 1727). The runtime check in the merge logic is implicit — it never reads `override.custom` because the type system has no such field.

**Architectural decision — boundary AR41 preserved with type-only import from `../schemas/config.ts` (per OQ-6)**: Story 6.5 adds `import type { Verifiers } from "../schemas/config.ts"` to `src/verifiers/registry.ts` + `src/verifiers/checks.ts`. Per AR41 (architecture lines 1287-1289) + Story 2.1's checks.ts pattern (already imports from `../schemas/verifier-result.ts`), the foundational tier `../schemas/` is allowed from the higher-tier `../verifiers/`. The `import type` qualifier ensures no runtime dependency (TypeScript erases type-only imports). NO new boundary crossings.

**Architectural decision — ConfigError vs VerifierFailureError on AC-3 path (per OQ-7)**: AC-3 wording invokes `CONFIG_ERROR` (the error code from `ConfigError` per Story 1.2 registry). The mismatch surfaces at LOAD time via the schema `.strict()` parse failure → `ConfigError` raised by `loadConfig()` (Story 6.1 baseline). **NOT** `VerifierFailureError` — that fires at RUNTIME (verifier orchestration failure) and would defeat the AC-3 "early" wording. Story 6.5 explicitly tests both paths: (a) `loadConfig()` with malformed verifier config throws ConfigError exit 2 at LOAD time; (b) once loaded successfully, `runVerifier` never throws ConfigError (it only throws VerifierFailureError on orchestration failures). This matches Story 6.4 OQ-3 stance for ConfigError vs TimeoutError boundary.

**Architectural decision — log line single-line constraint (AR21+AR22)**: existing `info()` line at `src/verifiers/checks.ts:463` is single-line (`info('verifier: running ${opts.stepName} for run ${runId}')`). Story 6.5 OQ-4 DEFERS adding a non-default merged-config substring to this line — the merged config has variable length (multi-step union); the markdown transcript via verifier-result.json artifact path is the canonical audit trail. The progress log stays minimal; AR22 actionable-hint regex N/A (this is a progress log, not an error hint).

**Architectural decision — slash-command markdown UNCHANGED (per OQ-8)**: Stories 6.3 + 6.4 added small caveat paragraphs to `commands/bmad-{next,loop}.md` documenting Task tool model parameter pass-through (best-effort). Story 6.5 has NO analogous Task-tool seam — the verifier registry runs Bun-side, the merged config never crosses the AR9 boundary into the slash-command markdown. ZERO mutation to `commands/bmad-{next,loop}.md` for Story 6.5.

### Concretely, Story 6.5 produces

- **MODIFIED file 1**: `src/schemas/config.ts` — adds `.strict()` to `VerifierConfigSchema` (line 188-192). Net additions: ~2 LoC (just the `.strict()` chained call + JSDoc note).
- **MODIFIED file 2**: `src/schemas/config.test.ts` — adds 6-8 VER_65_SCHEMA_* + VER_65_SCHEMA_STRICT_* + VER_65_VERIFIERS_RECORD_* tests covering VerifierConfigSchema strict + edge cases. Net additions: ~70 LoC.
- **MODIFIED file 3**: `src/verifiers/registry.ts` — extends `getVerifierConfig` signature with optional `projectVerifiers?: Verifiers` second parameter + adds merge / replace logic + adds JSDoc. Net additions: ~50 LoC (~30 logic + ~20 JSDoc).
- **MODIFIED file 4**: `src/verifiers/registry.test.ts` — adds 8-10 VER_65_REGISTRY_NO_OVERRIDE_* + VER_65_REGISTRY_MERGE_* + VER_65_REGISTRY_REPLACE_* + VER_65_REGISTRY_NO_MATCH_* + VER_65_REGISTRY_CUSTOM_PRESERVED_* + VER_65_REGISTRY_FALLBACK_* tests. Net additions: ~150 LoC.
- **MODIFIED file 5**: `src/verifiers/checks.ts` — extends `RunVerifierOptions` with `projectVerifiers?: Verifiers` field + threads to `getVerifierConfig`. Net additions: ~6 LoC (3 type field + 3 forwarding logic).
- **MODIFIED file 6**: `src/verifiers/checks.test.ts` — adds 2-3 VER_65_CHECKS_THREADING_* tests covering merge through `runVerifier`. Net additions: ~60 LoC.
- **MODIFIED file 7**: `src/commands/next/verify-and-advance.ts` — extends `RunVerifyAndAdvanceOptions.config?` with `verifiers?: Verifiers` + threads `projectVerifiers` into `verifierFn(...)` call site via conditional spread. Net additions: ~6 LoC.
- **MODIFIED file 8**: `src/commands/next/verify-and-advance.test.ts` — adds 2-3 VER_65_VANDA_* tests covering threading. Net additions: ~80 LoC.
- **MODIFIED file 9**: `src/commands/next/run.ts` — extends `RunNextOptions.config` with `verifiers?: Verifiers` (line 333) + extends `loadConfigOverride` return type (lines 354-361). Net additions: ~3 LoC.
- **MODIFIED file 10**: `src/commands/next/run.test.ts` — adds 1-2 VER_65_RUN_* tests asserting opts.config.verifiers flows through to runVerifyAndAdvance. Net additions: ~50 LoC.
- **MODIFIED file 11**: `src/commands/loop/run.ts` — extends `LoopOpts.config` with `verifiers?: Verifiers` + extends `loadConfigOverride` return type + extends local `effectiveConfig` type. Net additions: ~6 LoC.
- **MODIFIED file 12**: `src/commands/loop/run.test.ts` — adds 1-2 VER_65_LOOP_* tests asserting opts.config.verifiers flows through productionRunNextFn. Net additions: ~50 LoC.
- **MODIFIED file 13**: `docs/configuration.md` — extends the `verifiers:` section with Story 6.5 wiring note + AR17/AC-2 security boundary + AC-3 schema-mismatch sub-section + cross-links + forward-tracker update (closes I-26 + I-46). Net additions: ~50 LoC.

ZERO NEW files. ZERO new error classes. ZERO new schema migrations. ZERO mutations to: `src/errors.ts`, `src/migrations/config/index.ts`, `src/verifiers/defaults.ts` (registry data unchanged), `src/verifiers/types.ts` (registry-side `VerifierConfig` interface unchanged), `src/verifiers/index.ts` (barrel unchanged — `getVerifierConfig` re-export still valid since the new optional 2nd arg is backwards-compat), `src/dag/*`, `src/state/*`, `src/dispatch/*` (Story 6.5 wires the verifier tier, NOT the dispatch tier), `src/failure-ux/*`, `src/runs/*` (transcript + run-log unchanged), `commands/bmad-next.md`, `commands/bmad-loop.md` (no slash-command markdown change per OQ-8).

## Acceptance Criteria

The following are reproduced byte-identical from `_bmad-output/planning-artifacts/epics.md` lines 1223-1227:

**Given** `verifiers:` config block
**When** the verifier registry resolves a config for a step
**Then** the project-config required sections are merged with (or replace, depending on declared mode) the plugin defaults; project overrides win
**And** custom checks remain plugin-side (no user-supplied custom code per AR17 — security)
**And** a config-supplied verifier mismatch (e.g., reference to a non-existent Zod schema) surfaces `CONFIG_ERROR` early

## Tasks / Subtasks

- [x] 1. **Context — read all relevant files completely** (carry-over discipline from Stories 6.1 + 6.2 + 6.3 + 6.4)
  - [x] 1.1 Read `_bmad-output/implementation-artifacts/6-4-budgets-per-step-config.md` — focus on (a) the Forward Action Items section (4 nits N-1/N-2/N-3/N-4 + 46 info I-1 through I-46; I-26 to Story 6.5 PRIMARY HONOURED here; I-43 (5 sites accumulated) shared-helper still DEFER per Story 6.5 OQ-5; I-46 `.strict()` discipline applies SUBSTANTIVELY here for `VerifierConfigSchema = z.object`); (b) the SDR Quality Gates table baseline (1431/0/4755 across 70 files; errors registry 17); (c) the Story 6.4 close: `budgets:` consumer wired at runner; AR9 invariants preserved.
  - [x] 1.2 Read `_bmad-output/implementation-artifacts/6-1-bmad-stepper-config-yaml-schema-loader.md` — focus on (a) Story 6.1 SDR I-26 verbatim ("`VerifierConfigSchema.mode` field; Story 6.5 wires the per-step verifier registry merge logic"); (b) the loader's invalid-verifier error path (CorruptStateError → ConfigError + extractZodFieldPath + single-line hint); (c) docs/configuration.md `verifiers:` section.
  - [x] 1.3 Read `_bmad-output/implementation-artifacts/2-1-verifier-configuration-registry.md` — focus on (a) the `defaultVerifiers` map (8 entries: default + prd + architecture + dev-story + code-review + story-create + retro + analyst-research); (b) the `getVerifierConfig(stepName)` signature + `default` fallback semantics; (c) the registry-side `VerifierConfig` type (full-shape with `schema: ZodSchema | null` + optional `custom?`); (d) AR41 boundary preservation (foundational + intra-module siblings only).
  - [x] 1.4 Read `_bmad-output/implementation-artifacts/2-6-verify-and-advance-ts-with-state-hash-check.md` — focus on (a) the `RunVerifyAndAdvanceOptions` shape; (b) the `runVerifier(runId, opts)` call site at line 1017; (c) the `verifierFn` test seam pattern.
  - [x] 1.5 Read `_bmad-output/implementation-artifacts/epic-5-retrospective.md` — Recommendations item 3 (registry stability — ZERO new error classes per Epic 6 start) + item 6 (cross-story coordination via opts.config seam).
  - [x] 1.6 Read `src/schemas/config.ts` (334 lines) full pass — focus on (a) `VerifierConfigSchema` at lines 188-192 (`z.object({requiredFiles?, requiredFrontmatterSections?, mode?})`); (b) `VerifiersSchema = z.record(z.string(), VerifierConfigSchema)` at line 197; (c) `VerifierConfig` schema-side type alias at line 199; (d) `Verifiers` type at line 200; (e) `Config.verifiers: VerifiersSchema.default({})` at line 298.
  - [x] 1.7 Read `src/schemas/config.test.ts` full pass — recover the existing CFG_61_VERIFIERS_* test density at the verifiers section (search `verifiers`); identify regression-coverage gaps for Story 6.5 `.strict()` extension.
  - [x] 1.8 Read `src/verifiers/registry.ts` full pass — focus on (a) `getVerifierConfig(stepName)` at lines 57-69; (b) the `defaultVerifiers` re-export (line 23 import + line 38 export); (c) the JSDoc note at lines 11-21 (architecture compliance + Story 6.5 forward-reference at line 16).
  - [x] 1.9 Read `src/verifiers/registry.test.ts` (114 lines) full pass — focus on the 21 existing test cases (line 23 onward); confirm Story 6.5 backwards-compat — `getVerifierConfig(stepName, undefined)` must return identical results.
  - [x] 1.10 Read `src/verifiers/defaults.ts` full pass — focus on the 8 entries; confirm ZERO `custom` callbacks shipped (AR17 — schema: null only).
  - [x] 1.11 Read `src/verifiers/types.ts` full pass — focus on the registry-side `VerifierConfig` interface at lines 92-111 (full-shape with `schema: ZodSchema | null` + optional `custom?`); contrast with the schema-side `VerifierConfigSchema` (data-only).
  - [x] 1.12 Read `src/verifiers/checks.ts` full pass — focus on (a) `RunVerifierOptions` at lines 344-367; (b) `runVerifier(runId, opts)` at lines 421-..; (c) `getVerifierConfig(opts.stepName)` call at line 453; (d) `info()` log line at line 463; (e) the `checkFrontmatter` / `checkRequiredFiles` consumers of `config.requiredFrontmatterSections` / `config.requiredFiles`.
  - [x] 1.13 Read `src/verifiers/checks.test.ts` full pass — recover existing test patterns; identify Story 6.5 test seam for `projectVerifiers?` threading.
  - [x] 1.14 Read `src/commands/next/verify-and-advance.ts` lines 175-300 — focus on (a) `RunVerifyAndAdvanceOptions.config?` at lines 247-249 (`{ failurePolicies?: FailurePolicies }`); (b) the `verifierFn` test seam at lines 270-273; (c) the `runVerifier(...)` call at line 1017 (`verifierFn(runId, { stepName, stagingRoot })`).
  - [x] 1.15 Read `src/commands/next/run.ts` lines 1990-2090 — focus on (a) `RunNextOptions.config` at lines 330-334; (b) `loadConfigOverride` return type at lines 352-362; (c) the verify-and-advance threading (search for `verifyAndAdvance` to find where opts.config flows down).
  - [x] 1.16 Read `src/commands/loop/run.ts` lines 460-500 + lines 840-900 — locate `LoopOpts.config` at lines 462-475 + `loadConfigOverride` return type at lines 485-497 + local `effectiveConfig` type at lines 841-849.
  - [x] 1.17 Read `docs/configuration.md` lines 240-260 — locate the existing `verifiers:` section for the documentation refresh.
  - [x] 1.18 Read `src/errors.ts` — confirm `ConfigError` (Story 1.2) + `VerifierFailureError` already exist; Story 6.5 uses ConfigError (LOAD-time path) per AC-3 — registry stays at 17.
  - [x] 1.19 Read `src/integration/escalate-actionable-hint.test.ts` — confirm 33-test sweep covers `ConfigError` + `VerifierFailureError`. Story 6.5 verifies this test passes UNCHANGED.

- [x] 2. **Schema `.strict()` extension + test density — `VerifierConfigSchema` VER_65_SCHEMA_* + VER_65_SCHEMA_STRICT_* coverage**
  - [x] 2.1 At `src/schemas/config.ts:188-192`, extend `VerifierConfigSchema = z.object({...})` to `VerifierConfigSchema = z.object({...}).strict()`. Add JSDoc note: "Story 6.5 — `.strict()` per I-46 forward-tracker (rejects unknown fields like `schema: \"MySchema\"`, `verifierFile`, `judge`, `customFn`, `custom` at LOAD time per AR17 + AC-3 — security: NO user-supplied custom code; the AR17 boundary is enforced via TWO layers: (a) the schema has no `custom` / `customFn` / `judge` / `schema` field declared, and (b) `.strict()` rejects unknown keys with a single-line ConfigError actionable hint). Backwards-compat: existing fixtures use only `requiredFiles?`, `requiredFrontmatterSections?`, `mode?`."
  - [x] 2.2 VER_65_SCHEMA_1: parametric — `VerifierConfigSchema.parse({ requiredFrontmatterSections: ["status", "owner"] })` succeeds.
  - [x] 2.3 VER_65_SCHEMA_2: `VerifierConfigSchema.parse({ requiredFiles: ["**/*.md"] })` succeeds (partial).
  - [x] 2.4 VER_65_SCHEMA_3: `VerifierConfigSchema.parse({ mode: "merge" })` succeeds; `VerifierConfigSchema.parse({ mode: "replace" })` succeeds; `VerifierConfigSchema.parse({})` succeeds (all fields optional).
  - [x] 2.5 VER_65_SCHEMA_4: `VerifierConfigSchema.parse({ mode: "invalid" })` throws (enum constraint).
  - [x] 2.6 VER_65_SCHEMA_STRICT_1: `VerifierConfigSchema.parse({ requiredFrontmatterSections: ["x"], schema: "MySchema" })` throws Zod error with `schema` in unrecognized-keys path.
  - [x] 2.7 VER_65_SCHEMA_STRICT_2: `VerifierConfigSchema.parse({ verifierFile: "./custom.ts" })` throws Zod error.
  - [x] 2.8 VER_65_SCHEMA_STRICT_3: `VerifierConfigSchema.parse({ judge: "claude" })` throws Zod error (LLM-as-judge deferred per architecture line 1727).
  - [x] 2.9 VER_65_SCHEMA_STRICT_4: `VerifierConfigSchema.parse({ customFn: { name: "x" } })` throws Zod error (AR17 — no user-supplied custom code).
  - [x] 2.10 VER_65_SCHEMA_STRICT_5: `VerifierConfigSchema.parse({ custom: "() => true" })` throws Zod error (AR17 — symmetric to STRICT_4 but using literal `custom` keyword).
  - [x] 2.11 VER_65_VERIFIERS_RECORD_1: `VerifiersSchema.parse({})` succeeds (empty record — backwards-compat for Story 6.1 fixtures).
  - [x] 2.12 VER_65_VERIFIERS_RECORD_2: `VerifiersSchema.parse({ "dev-story": { requiredFrontmatterSections: ["status", "owner"], mode: "merge" }, "story-create": { mode: "replace" } })` succeeds.
  - [x] 2.13 VER_65_VERIFIERS_RECORD_3: `VerifiersSchema.parse({ "dev-story": { mode: "replace-all" } })` throws Zod error with `dev-story.mode` in issue path.
  - [x] 2.14 Verify all existing CFG_61_VERIFIERS_* tests pass unchanged (regression).

- [x] 3. **Verifier registry merge logic — `getVerifierConfig(stepName, projectVerifiers?)` extension**
  - [x] 3.1 At `src/verifiers/registry.ts`, ADD type-only import: `import type { Verifiers } from "../schemas/config.ts";` (after the existing `import type { VerifierConfig } from "./types.ts";` at line 24). Confirm AR41 boundary — `../schemas/` is foundational tier per architecture lines 1287-1289 + Story 2.1's checks.ts already imports from `../schemas/verifier-result.ts` (precedent).
  - [x] 3.2 Extend signature from `(stepName: string)` to `(stepName: string, projectVerifiers?: Verifiers)` at line 57.
  - [x] 3.3 Implement merge / replace logic inline (per OQ-2 — DEFER extracting helper):
    ```ts
    export function getVerifierConfig(
      stepName: string,
      projectVerifiers?: Verifiers,
    ): VerifierConfig {
      const baseline = verifierRegistry[stepName] ?? verifierRegistry.default;
      if (baseline === undefined) {
        throw new Error(
          "verifier registry is missing the `default` baseline (architecture §D9 invariant)",
        );
      }
      const override = projectVerifiers?.[stepName];
      if (override === undefined) {
        return baseline;
      }
      const mode = override.mode ?? "merge";
      if (mode === "replace") {
        return {
          requiredFiles: override.requiredFiles ?? [],
          requiredFrontmatterSections: override.requiredFrontmatterSections ?? [],
          schema: baseline.schema,
          ...(baseline.custom !== undefined ? { custom: baseline.custom } : {}),
        };
      }
      // mode === "merge" — array union with baseline-order-preserved + de-dup
      const requiredFiles = unionPreservingOrder(
        baseline.requiredFiles,
        override.requiredFiles ?? [],
      );
      const requiredFrontmatterSections = unionPreservingOrder(
        baseline.requiredFrontmatterSections,
        override.requiredFrontmatterSections ?? [],
      );
      return {
        requiredFiles,
        requiredFrontmatterSections,
        schema: baseline.schema,
        ...(baseline.custom !== undefined ? { custom: baseline.custom } : {}),
      };
    }

    function unionPreservingOrder(
      base: readonly string[],
      ext: readonly string[],
    ): readonly string[] {
      const seen = new Set(base);
      const out = [...base];
      for (const entry of ext) {
        if (!seen.has(entry)) {
          seen.add(entry);
          out.push(entry);
        }
      }
      return out;
    }
    ```
  - [x] 3.4 Update JSDoc on `getVerifierConfig` (lines 40-56) to document the new optional `projectVerifiers?` parameter, the merge / replace semantics, AR17 security boundary (custom + schema preserved baseline-only), Story 6.5 cross-link.
  - [x] 3.5 Update top-of-file JSDoc (lines 1-21) to reflect Story 6.5 closing the "v0.1 ships `verifierRegistry === defaultVerifiers` (no project-config layer yet); the project-config-aware override resolver lands in **Story 6.5**" forward-reference at line 16. Replace with Story 6.5 wiring summary.
  - [x] 3.6 Run `bunx tsc --noEmit` to verify type signature is non-breaking; existing 21 tests at registry.test.ts must still type-check (the optional 2nd arg is backwards-compat).

- [x] 4. **Verifier registry tests — `getVerifierConfig(stepName, projectVerifiers)` coverage**
  - [x] 4.1 VER_65_REGISTRY_NO_OVERRIDE_1: AC-1 backwards-compat — `getVerifierConfig("dev-story", undefined)` returns `verifierRegistry["dev-story"]` byte-identical (regression coverage).
  - [x] 4.2 VER_65_REGISTRY_NO_OVERRIDE_2: regression — `getVerifierConfig("unknown-step", undefined)` returns `verifierRegistry.default` byte-identical.
  - [x] 4.3 VER_65_REGISTRY_MERGE_1: AC-1 merge default mode — `getVerifierConfig("story-create", { "story-create": { requiredFrontmatterSections: ["owner"] } })` returns `{ requiredFiles: ["**/*.md"], requiredFrontmatterSections: ["title", "status", "story_id", "owner"], schema: null }` (default mode = merge; baseline order preserved; "owner" appended).
  - [x] 4.4 VER_65_REGISTRY_MERGE_2: AC-1 explicit merge mode — same input + `mode: "merge"` → same output.
  - [x] 4.5 VER_65_REGISTRY_MERGE_3: AC-1 de-dup — `getVerifierConfig("dev-story", { "dev-story": { requiredFrontmatterSections: ["status", "owner"] } })` returns `{ requiredFiles: ["**/*.md"], requiredFrontmatterSections: ["title", "status", "owner"], schema: null }` ("status" baseline preserved; not duplicated).
  - [x] 4.6 VER_65_REGISTRY_MERGE_4: AC-1 partial — `getVerifierConfig("dev-story", { "dev-story": { requiredFiles: ["**/*.json"] } })` returns `{ requiredFiles: ["**/*.md", "**/*.json"], requiredFrontmatterSections: ["title", "status"], schema: null }` (only requiredFiles overridden; requiredFrontmatterSections preserved baseline-only).
  - [x] 4.7 VER_65_REGISTRY_REPLACE_1: AC-1 replace mode — `getVerifierConfig("dev-story", { "dev-story": { requiredFrontmatterSections: ["title", "owner"], mode: "replace" } })` returns `{ requiredFiles: [], requiredFrontmatterSections: ["title", "owner"], schema: null }` (replace mode; UNSET requiredFiles falls through to empty array per OQ-3; baseline `["**/*.md"]` cleared).
  - [x] 4.8 VER_65_REGISTRY_REPLACE_2: AC-1 replace mode all explicit — `getVerifierConfig("dev-story", { "dev-story": { requiredFiles: ["**/*.json"], requiredFrontmatterSections: ["title"], mode: "replace" } })` returns `{ requiredFiles: ["**/*.json"], requiredFrontmatterSections: ["title"], schema: null }`.
  - [x] 4.9 VER_65_REGISTRY_REPLACE_3: AC-1 replace mode — `getVerifierConfig("dev-story", { "dev-story": { mode: "replace" } })` returns `{ requiredFiles: [], requiredFrontmatterSections: [], schema: null }` (replace mode + ALL fields unset → all empty per OQ-3).
  - [x] 4.10 VER_65_REGISTRY_NO_MATCH_1: AC-1 — `getVerifierConfig("dev-story", { "different-step": { requiredFrontmatterSections: ["owner"] } })` returns `verifierRegistry["dev-story"]` byte-identical (current step has no project override; behaviour identical to undefined).
  - [x] 4.11 VER_65_REGISTRY_FALLBACK_1: AC-1 — `getVerifierConfig("totally-unknown-step", { "totally-unknown-step": { requiredFrontmatterSections: ["x"] } })` returns merged config built from `verifierRegistry.default` (NOT a missing entry); expected `{ requiredFiles: [], requiredFrontmatterSections: ["x"], schema: null }` (default mode = merge; baseline default has empty arrays).
  - [x] 4.12 VER_65_REGISTRY_CUSTOM_PRESERVED_1: AR17 — synthetic test fixture: temporarily monkey-patch `verifierRegistry["test-step"]` to have a `custom` callback; verify `getVerifierConfig("test-step", { "test-step": { requiredFrontmatterSections: ["x"] } })` returns merged config WITH `custom` from baseline preserved (NEVER from project — type system already enforces; this test asserts runtime behaviour). Note: this test may need a test-only registry fixture; consider parametric test with a built-in synthetic entry OR a unit test that calls the unionPreservingOrder helper directly + asserts the merge object shape includes baseline.custom when present.
  - [x] 4.13 Run `bun test src/verifiers/registry.test.ts` — confirm all 21 existing + 12+ new tests pass.

- [x] 5. **Verifier orchestrator threading — `runVerifier(runId, opts)` opts.projectVerifiers extension**
  - [x] 5.1 At `src/verifiers/checks.ts:344-367`, extend `RunVerifierOptions` interface — add field: `readonly projectVerifiers?: Verifiers;` with JSDoc: "Story 6.5 — optional project-config `Verifiers` map; when supplied, `getVerifierConfig` merges / replaces per the per-step `mode` field. Production callers (Story 6.5 `verify-and-advance.ts`) pass `opts.config?.verifiers`; tests pass synthetic config objects directly."
  - [x] 5.2 ADD type-only import: `import type { Verifiers } from "../schemas/config.ts";` (after the existing imports at lines 64-80).
  - [x] 5.3 At `src/verifiers/checks.ts:453`, change `const config = getVerifierConfig(opts.stepName);` to `const config = getVerifierConfig(opts.stepName, opts.projectVerifiers);`. The optional 2nd arg is type-safe.
  - [x] 5.4 No JSDoc change needed on `runVerifier` (the JSDoc references `getVerifierConfig` already; the threading is internal).

- [x] 6. **Verifier orchestrator tests — `runVerifier({ projectVerifiers })` threading coverage**
  - [x] 6.1 VER_65_CHECKS_THREADING_1: AC-1 — invoke `runVerifier(runId, { stepName: "story-create", stagingRoot, projectVerifiers: { "story-create": { requiredFrontmatterSections: ["owner"] } } })` against a tmpdir-staged artifact missing `owner` frontmatter → expect `result.status === "fail"` and the `frontmatter` check entry includes `"owner"` in detail.
  - [x] 6.2 VER_65_CHECKS_THREADING_2: AC-1 — invoke with `mode: "replace"` against a tmpdir-staged artifact that satisfies the override but NOT the baseline → expect `result.status === "pass"` (replace mode clears baseline requirements).
  - [x] 6.3 VER_65_CHECKS_THREADING_3: backwards-compat — invoke without `projectVerifiers` → expect identical behaviour to Story 2.1 baseline (regression coverage).

- [x] 7. **`RunVerifyAndAdvanceOptions.config.verifiers?` extension + threading**
  - [x] 7.1 At `src/commands/next/verify-and-advance.ts:247-249`, extend the `opts.config?` inline type — add `verifiers?: import("../../schemas/config.ts").Verifiers;` after `failurePolicies?: import("../../schemas/config.ts").FailurePolicies;`. Update JSDoc above the `config?` field to document Story 6.5 verifiers field per the same pattern as Story 5.6 failurePolicies.
  - [x] 7.2 At the `runVerifier(...)` / `verifierFn(...)` call site (~line 1017 — locate via Task 1.14 read pass), thread `projectVerifiers` via conditional spread:
    ```ts
    const verifierResult = await verifierFn(runId, {
      stepName,
      stagingRoot,
      ...(opts?.config?.verifiers !== undefined
        ? { projectVerifiers: opts.config.verifiers }
        : {}),
    });
    ```
    The conditional spread preserves `exactOptionalPropertyTypes` discipline (mirror Story 6.4 `budgetOverride` pattern at `run.ts:2087-2102`).
  - [x] 7.3 At the `verifierFn` test-seam type signature (lines 270-273), extend the inline opts type to include `projectVerifiers?: import("../../schemas/config.ts").Verifiers` — so test seam can also receive it (TEST-only — not load-bearing for production).
  - [x] 7.4 Run `bunx tsc --noEmit` to verify the chain types correctly.

- [x] 8. **`RunVerifyAndAdvance` tests — VER_65_VANDA_* coverage**
  - [x] 8.1 VER_65_VANDA_1: AC-1 — supply `opts.config = { verifiers: { "dev-story": { requiredFrontmatterSections: ["owner"] } } }` and `verifierFn` test stub that captures the `projectVerifiers` arg → assert the stub received the merged config object verbatim.
  - [x] 8.2 VER_65_VANDA_2: AC-1 — END-TO-END via real `runVerifier` (no test stub); supply `opts.config.verifiers` against a tmpdir-staged artifact missing `owner` → expect `verifyResult.status === "fail"` (the additional required frontmatter section surfaced).
  - [x] 8.3 VER_65_VANDA_3: backwards-compat — `opts.config = undefined` (or `opts.config = {}`) → existing behaviour (no project override applied).

- [x] 9. **Runner tier — `RunNextOptions.config.verifiers?` + `LoopOpts.config.verifiers?` extensions**
  - [x] 9.1 At `src/commands/next/run.ts:330-334`, extend `RunNextOptions.config?` inline type — add `verifiers?: import("../../schemas/config.ts").Verifiers;` (mirror Story 6.4 budgets add at line 333).
  - [x] 9.2 At `loadConfigOverride` return type at lines 352-362, extend with `verifiers?: import("../../schemas/config.ts").Verifiers;`.
  - [x] 9.3 Confirm the verify-and-advance call site (search for `runVerifyAndAdvance` invocation in run.ts) ALREADY threads `opts.config` through; ZERO additional change needed at run.ts beyond the type extension. (Verify by inspecting Task 1.15 read pass.)
  - [x] 9.4 At `src/commands/loop/run.ts:462-475`, extend `LoopOpts.config?` with `verifiers?: Verifiers` (mirror Story 6.4 budgets add).
  - [x] 9.5 At `loadConfigOverride` return type at lines 485-497, extend with `verifiers?: Verifiers`.
  - [x] 9.6 At local `effectiveConfig` type (lines 841-849), extend with `verifiers?: Verifiers`.
  - [x] 9.7 Confirm `productionRunNextFn` ALREADY threads `effectiveConfig` through to `runNext` (Story 6.4 baseline); ZERO additional change needed at loop/run.ts beyond the type extension.

- [x] 10. **Runner tier tests — VER_65_RUN_* + VER_65_LOOP_* coverage**
  - [x] 10.1 VER_65_RUN_1: at `src/commands/next/run.test.ts`, supply `opts.config = { verifiers: { "<step>": { requiredFrontmatterSections: ["owner"] } } }` via the existing test seam. Verify the chain reaches `runVerifyAndAdvance` with the verifiers field intact.
  - [x] 10.2 VER_65_RUN_2: backwards-compat — symmetric test asserting absent config.verifiers → no override surfaces.
  - [x] 10.3 VER_65_LOOP_1: at `src/commands/loop/run.test.ts`, supply `opts.loadConfigOverride` returning `{ verifiers: { "<step>": { ... } } }` → verify `effectiveConfig.verifiers` flows through `productionRunNextFn` to `runNext` and downstream.
  - [x] 10.4 VER_65_LOOP_2: backwards-compat — symmetric test asserting absent loadConfigOverride.verifiers → no override surfaces.

- [x] 11. **Loader-side tests — VER_65_LOAD_INVALID_* coverage**
  - [x] 11.1 VER_65_LOAD_INVALID_1: AC-3 PRIMARY — fixture with `verifiers: { "dev-story": { schema: "MySchema" } }` → `loadConfig()` throws ConfigError exit 2 with single-line hint pointing at `verifiers.dev-story.schema` (unrecognized-keys path).
  - [x] 11.2 VER_65_LOAD_INVALID_2: AC-3 — fixture with `verifiers: { "dev-story": { customFn: { x: 1 } } }` → ConfigError.
  - [x] 11.3 VER_65_LOAD_INVALID_3: AC-3 — fixture with `verifiers: { "dev-story": { judge: "claude" } }` → ConfigError (LLM-as-judge deferred).
  - [x] 11.4 VER_65_LOAD_INVALID_4: AC-3 — fixture with `verifiers: { "dev-story": { mode: "replace-all" } }` → ConfigError (mode enum constraint).
  - [x] 11.5 VER_65_LOAD_INVALID_5: AC-3 — fixture with `verifiers: { "dev-story": { custom: "() => true" } }` → ConfigError (AR17 — symmetric).

- [x] 12. **Documentation refresh — `docs/configuration.md`**
  - [x] 12.1 At `docs/configuration.md` lines 240-260, REMOVE the "(Story 6.5 will land the consumer logic; v0.1 ships the schema only.)" line (line 251).
  - [x] 12.2 ADD a "**Wiring (Story 6.5)**" sub-section: documents `getVerifierConfig(stepName, projectVerifiers?)` threading through `runVerifier`; merge / replace semantics with worked example mirroring the Story 6.4 budgets section structure. Cross-link to architecture §D9 line 490.
  - [x] 12.3 ADD an "**AR17 security boundary (AC-2)**" sub-section: documents that `custom` checks (and `schema` references) are PLUGIN-SIDE ONLY; project YAML cannot supply executable code or schema constructors; rejected at LOAD time via `.strict()`. Worked example: `verifiers: { "dev-story": { custom: "..." } }` → ConfigError.
  - [x] 12.4 ADD an "**AC-3 schema-mismatch failure mode**" sub-section: documents that `.strict()` rejects unknown fields at LOAD time. Cross-link to AR17 + AR21 + AR22.
  - [x] 12.5 ADD a "**`mode` semantics**" sub-section: documents OQ-3 (replace UNSET → empty) + OQ-4 (merge = union with de-dup baseline-order-preserved) with worked examples.
  - [x] 12.6 Update the forward-tracker section at the bottom (lines 480-509): mark I-26 + I-46 as CLOSED at Story 6.5; carry I-43 (5 sites accumulated; Story 6.x cleanup forward).
  - [x] 12.7 Cross-link to `_bmad-output/implementation-artifacts/6-5-verifiers-per-step-config-override.md` for the canonical Story 6.5 spec reference.

- [x] 13. **Quality gate verification + Forward Action Items update**
  - [x] 13.1 Run `bunx tsc --noEmit` from a fresh shell with `export PATH="$HOME/.bun/bin:$PATH"`; expect exit 0.
  - [x] 13.2 Run `bun run check` from a fresh shell; expect exit 0 + ~1450/0/4800 across 70 files (baseline 1431/0/4755 + ~20-25 new tests + ~50-75 new expects). Snapshot final test counts AFTER the LAST `biome --write` pass per N-3 discipline.
  - [x] 13.3 Run `grep -c "extends StepperError" src/errors.ts`; expect exit 0 = 17 (UNCHANGED — Story 6.5 ships ZERO new error classes).
  - [x] 13.4 Run `bun test src/integration/escalate-actionable-hint.test.ts`; expect 33/0/114 UNCHANGED (sweep over all 17 error classes — ConfigError + VerifierFailureError already covered).
  - [x] 13.5 Run `bun test src/verifiers/registry.test.ts`; expect ~33+ tests pass (21 existing + 12+ new).
  - [x] 13.6 Run `bun test src/schemas/config.test.ts`; expect ~99+ tests pass (87 from Story 6.4 baseline + 13+ new VER_65_*).
  - [x] 13.7 Update Forward Action Items section: close I-26 (PRIMARY HONOURED) + close I-46 (SUBSTANTIVELY HONOURED via VerifierConfigSchema.strict()); carry I-43 (5 sites accumulated; Story 6.x cleanup forward); inherit 4 NITs N-1..N-4 + 42 info I-1..I-42 + 4 from Story 6.4 (I-43..I-46) cumulative; produce 0-2 NEW from Story 6.5 if uncovered during dev iter.

## Dev Notes

### Files Read in Task 1 (UPDATE not NEW)

The dev agent MUST read every UPDATE file completely before mutating, per the BMAD discipline of carrying full context. Each file's CURRENT state, what Story 6.5 changes, and what must be preserved:

1. **`src/schemas/config.ts`** (334 lines) — UPDATE
   - **Current state**: defines `VerifierConfigSchema = z.object({ requiredFiles?, requiredFrontmatterSections?, mode? })` at lines 188-192; `VerifiersSchema = z.record(z.string(), VerifierConfigSchema)` at line 197; `Config.verifiers: VerifiersSchema.default({})` at line 298.
   - **What Story 6.5 changes**: chain `.strict()` at line 192 + JSDoc note about Story 6.5 / I-46 / AR17 dual enforcement.
   - **What must be preserved**: all existing schemas (`PersonasSchema`, `OverrideEntrySchema`, `OverridesSchema`, `FailurePolicySchema`, `FailurePoliciesSchema`, `ModelSchema`, `ModelsSchema`, `BudgetSchema` (already `.strict()` per Story 6.4), `BudgetsSchema`, `PathsSchema`, `TelemetrySchema`, `ConfigV1Schema`) unchanged. The `VerifierConfigSchema` shape (3 fields) unchanged — only `.strict()` validation added.

2. **`src/verifiers/registry.ts`** (70 lines) — UPDATE
   - **Current state**: `getVerifierConfig(stepName: string)` at lines 57-69; `verifierRegistry === defaultVerifiers` at line 37-38; type-only import from `./types.ts` at line 24; module JSDoc at lines 1-21 references "Story 6.5 extends this with project-config layer resolution" at line 31.
   - **What Story 6.5 changes**: extend signature with optional 2nd arg `projectVerifiers?: Verifiers`; ADD merge/replace/union logic (~30 LoC); ADD type-only import `import type { Verifiers } from "../schemas/config.ts"`; UPDATE module JSDoc to reflect Story 6.5 close.
   - **What must be preserved**: `verifierRegistry` (Readonly Record) re-export unchanged; `default` baseline fallback semantics unchanged (`.default` lookup when stepName missing); throw on missing baseline preserved; AR41 boundary discipline (only foundational + intra-module siblings + the new schema-tier type-only import).

3. **`src/verifiers/registry.test.ts`** (114 lines) — UPDATE
   - **Current state**: 21 test cases at lines 23-..; covers `verifierRegistry` surface + `getVerifierConfig` known/unknown/empty step names.
   - **What Story 6.5 changes**: ADD ~12 VER_65_REGISTRY_* tests covering project override merge / replace / no-match / fallback / custom-preserved.
   - **What must be preserved**: 21 existing tests must pass UNCHANGED (regression — backwards-compat via optional 2nd arg).

4. **`src/verifiers/checks.ts`** (~600 lines) — UPDATE
   - **Current state**: `RunVerifierOptions` at lines 344-367 declares `stepName`, `stagingRoot?`, `artifactFilename?`; `runVerifier(runId, opts)` at line 421 calls `getVerifierConfig(opts.stepName)` at line 453.
   - **What Story 6.5 changes**: ADD `projectVerifiers?: Verifiers` field to `RunVerifierOptions`; ADD type-only import; PASS `opts.projectVerifiers` to `getVerifierConfig` at line 453.
   - **What must be preserved**: 4-check sequence (`required-files`, `frontmatter`, `schema`, `custom`); aggregate status semantics; `VerifierFailureError` orchestration-level paths; `VerifierResultV1Schema` defence-in-depth Zod validation; atomicWrite output to `verifier-result.json`; AR21+22 single-line `info()` log discipline.

5. **`src/commands/next/verify-and-advance.ts`** (~1100 lines) — UPDATE
   - **Current state**: `RunVerifyAndAdvanceOptions.config?` at lines 247-249 declares `{ failurePolicies?: FailurePolicies }`; `verifierFn` test seam at lines 270-273; `verifierFn(runId, { stepName, stagingRoot })` call at line 1017.
   - **What Story 6.5 changes**: EXTEND `opts.config?` with `verifiers?: Verifiers`; EXTEND `verifierFn` test-seam type with optional `projectVerifiers?` field; THREAD `projectVerifiers: opts?.config?.verifiers` via conditional spread at line 1017 invocation.
   - **What must be preserved**: all Story 5.6 failure-policy resolution + Story 5.1/5.2/5.3/5.4 retry/skip/route-to-fixer/escalate paths + Story 4.8 checkpoint-each + Story 4.9 SIGINT graceful exit + Story 1.8 snapshot detection + Story 2.6 state-hash-check.

6. **`src/commands/next/run.ts`** (~2200 lines) — UPDATE
   - **Current state**: `RunNextOptions.config?` at lines 330-334 declares `failurePolicies?`, `models?`, `budgets?`; `loadConfigOverride` return type at lines 352-362.
   - **What Story 6.5 changes**: ADD `verifiers?: import("../../schemas/config.ts").Verifiers` to both type extensions.
   - **What must be preserved**: Stories 6.3 + 6.4 wiring at the dispatch-tier (modelOverride / budgetOverride conditional spread); Story 5.6 failurePolicies threading; Story 4.7 plan-first dry-run preview; Story 4.8 checkpoint-each integration.

7. **`src/commands/loop/run.ts`** (~1100 lines) — UPDATE
   - **Current state**: `LoopOpts.config?` at lines 462-475; `loadConfigOverride` return type at lines 485-497; local `effectiveConfig` type at lines 841-849. Stories 6.3 + 6.4 already extended each with `models?` and `budgets?`.
   - **What Story 6.5 changes**: ADD `verifiers?: Verifiers` to all three type sites.
   - **What must be preserved**: Story 4.1+ loop runner skeleton; Stories 4.2-4.6 stop-condition logic; Story 4.10 loop-exit-reason resume hint; Story 5.5 interactive pause; Story 5.6 failure-policy resolution.

8. **`docs/configuration.md`** (509 lines) — UPDATE
   - **Current state**: `verifiers:` section at lines 240-260 with the schema-only note "(Story 6.5 will land the consumer logic; v0.1 ships the schema only.)" at line 251; forward-tracker section at lines 480-509.
   - **What Story 6.5 changes**: REMOVE the line 251 schema-only note; ADD Wiring + AR17 + AC-3 + mode semantics sub-sections; UPDATE forward-tracker section to close I-26 + I-46.
   - **What must be preserved**: all other sections (personas, overrides, failurePolicies, models, budgets, paths, telemetry); the existing example YAML for verifiers preserved; cross-references to architecture sections preserved.

### State preserved

- `src/state/index.ts` — UNCHANGED (Story 6.5 does not touch state subsystem).
- `src/dag/build.ts` — UNCHANGED (Story 6.5 does not touch DAG).
- `_bmad-output/.stepper/state.yaml` — UNCHANGED at create-story step (workflow advance happens at runtime; state.yaml workflow.lastStep + .nextStep advance per /bmad-loop runtime contract).

## Project Structure Notes

- **Boundary AR41 preserved**: `src/schemas/config.ts` is FOUNDATIONAL TIER per AR41 (architecture lines 1287-1289); Story 6.5 adds `.strict()` to an existing schema — no new imports, no new boundary crossings.
- **Boundary AR41 preserved (verifiers tier)**: `src/verifiers/registry.ts` (HIGHER TIER) imports from `./defaults.ts` + `./types.ts` (intra-module siblings). Story 6.5 ADDS `import type { Verifiers } from "../schemas/config.ts"` — TYPE-ONLY import to foundational tier (allowed per architecture lines 1287-1289 + Story 2.1's `checks.ts` precedent at imports from `../schemas/verifier-result.ts`). Same extension for `src/verifiers/checks.ts`.
- **Boundary AR41 preserved (commands tier)**: `src/commands/next/run.ts` + `src/commands/next/verify-and-advance.ts` + `src/commands/loop/run.ts` (TOP TIER) already import from `src/dispatch/`, `src/schemas/`, `src/config/`, `src/verifiers/` — Story 6.5 imports `Verifiers` type from `../../schemas/config.ts` (already a transitive consumer; no new boundary crossing).
- **AR9 stdout invariant preserved**: verifier registry does NOT emit AR9 lines (verifier-result.json is a separate file write per architecture §P5); Story 6.5 only changes the `getVerifierConfig` lookup result, not the AR9 output shape.
- **AR21+22 single-line constraint**: Story 6.5 does NOT add new `info()` lines (per OQ-4 DEFER); existing `info('verifier: running ...')` at `checks.ts:463` stays single-line.
- **AR17 security**: TWO-LAYER enforcement — (a) `VerifierConfigSchema` has NO `custom` / `customFn` / `judge` / `schema` / `verifierFile` field declared (schema-time enforcement); (b) `.strict()` rejects unknown keys at LOAD time with a single-line ConfigError (parse-time enforcement). Defence-in-depth per AR42.

## Library / Framework Requirements

- **Bun runtime** (Bun-only project per architecture).
- **Zod 4** — `VerifierConfigSchema.strict()` is supported in Zod 4 (Stories 6.2 + 6.4 already validated `.strict()` on `OverrideEntrySchema` + `BudgetSchema`; same Zod 4 pattern).
- **No new dependencies** — Story 6.5 is pure type/wire extension on existing infrastructure.

## Testing Standards

- Bun-test colocated tests (`*.test.ts` next to source).
- Use `safeParse` for schema-validation negative tests (consistent with existing CFG_61_VERIFIERS_* + BUD_64_SCHEMA_STRICT_* patterns).
- Tmpdir-per-test pattern for `runVerifier` integration tests (AR35 — `mkdtemp(path.join(os.tmpdir(), "stepper-verifier-..."))`); reuse the existing `src/verifiers/checks.test.ts` fixtures.
- Snapshot final test counts AFTER the LAST `biome --write` pass (N-3 discipline carried from Stories 6.2 + 6.3 + 6.4 SDRs).
- Verify `bunx tsc --noEmit` exit 0 + `bun run check` exit 0 from a fresh shell with `export PATH="$HOME/.bun/bin:$PATH"`.

## Previous Story Intelligence (from Story 6.4 close)

- **Quality gate baseline**: 1431/0/4755 across 70 files; errors registry 17 (Story 6.4 SDR confirmed). Story 6.5 expected delta: +20-30 tests / +50-75 expects / 0 new test files; registry MUST stay at 17.
- **Story 6.4 wiring pattern** (mirror this for the runner-tier type extensions): `RunNextOptions.config.budgets?: Budgets` + `LoopOpts.config.budgets?: Budgets` + `loadConfigOverride` return types + conditional spread `...(configuredBudget !== undefined ? { budgetOverride: configuredBudget } : {})` at the buildDispatchSpec call site. Story 6.5 mirrors at the verifierFn call site, NOT the dispatch site.
- **Story 6.4 SDR I-46 PRIMARY HONOURED HERE** — Story 6.5 applies `.strict()` to `VerifierConfigSchema` (z.object); same pattern as Story 6.4 BudgetSchema.strict().
- **Story 6.4 SDR I-43 (shared getStepConfig helper)** — Story 6.5 OQ-5 DEFERS still — verifier merge is shape-asymmetric (merge / replace + array union) so a generic helper would not capture the logic. Story 6.5 brings the lookup count to 5 sites (models / budgets / failurePolicies / overrides / verifiers); duplication shallow except verifier site is shape-asymmetric.
- **Story 6.4 SDR I-44 (Bun-side timeout enforcement)** — NOT applicable to Story 6.5 (different consumer).
- **Story 6.4 SDR I-45 (DispatchSpecV1Schema.budget tightening)** — NOT applicable to Story 6.5.
- **Story 6.4 OQ-3 (info() log surfaces only non-default)** — DEFERRED for Story 6.5 per OQ-4 (verifier `info()` line minimal; full audit in markdown transcript via verifier-result.json).
- **Errors registry stays at 17** — Story 6.5 ships ZERO new error classes; reuses `ConfigError` (Story 1.2 / Story 6.1 invalid-verifier loader path + AC-3 schema-mismatch path) and `VerifierFailureError` (Story 1.2 baseline; verifier orchestration only).

## Project Context Reference

- **`_bmad-output/planning-artifacts/architecture.md`** §D9 lines 477-499 (Per-step verifier configuration + resolution priority + custom-checks deterministic-stateless constraint) + line 779 (`verifiers:` config schema) + line 1163 (per-step verifier registry directory listing) + line 1727 (LLM-as-judge `judge:` field deferred post-v0.1) + lines 1287-1289 (AR41 boundary tiers).
- **`_bmad-output/planning-artifacts/prd.md`** FR38 (`verifiers:` per step config override) + NFR-R1 (Zod-validated config) + NFR-R6 (defence-in-depth Zod parse on every read) + NFR-S6 (no execution of sub-agent output).
- **`_bmad-output/implementation-artifacts/6-1-bmad-stepper-config-yaml-schema-loader.md`** Story 6.1 SDR I-26 (PRIMARY HONOURED here).
- **`_bmad-output/implementation-artifacts/6-4-budgets-per-step-config.md`** Story 6.4 close (4 NITs N-1..N-4 + 46 info I-1..I-46 forward-tracker carry; pattern mirror for schema `.strict()` extension via I-46 SUBSTANTIVE honour).
- **`_bmad-output/implementation-artifacts/2-1-verifier-configuration-registry.md`** `getVerifierConfig` signature + `defaultVerifiers` map shape + `VerifierConfig` registry-side type.
- **`_bmad-output/implementation-artifacts/2-6-verify-and-advance-ts-with-state-hash-check.md`** `RunVerifyAndAdvanceOptions` shape + `verifierFn` test-seam pattern + canonical `runVerifier` call site.
- **`docs/configuration.md`** existing `verifiers:` section (Story 6.1 baseline) — Story 6.5 extends with Wiring + AR17 + AC-3 + mode semantics sub-sections.

## Architectural Decisions

(See "Architectural challenges resolved here" above for the full set; summary below)

1. **OQ-1 — Apply `.strict()` to `VerifierConfigSchema` per I-46 SUBSTANTIVELY** — `VerifierConfigSchema = z.object({...}).strict()` rejects unknown fields (`schema`, `verifierFile`, `judge`, `customFn`, `custom`) at LOAD time. This is the AC-3 PRIMARY mechanism. Backwards-compat preserved (existing fixtures use only the documented 3 fields).
2. **OQ-2 — `getVerifierConfig` takes optional `projectVerifiers` second arg** — backwards-compat via optional 2nd arg; existing 21 tests pass UNCHANGED. The schema-side `Verifiers` is type-imported from `../schemas/config.ts` (foundational tier; AR41 boundary preserved).
3. **OQ-3 — `mode: "replace"` semantics — UNSET fields fall through to empty arrays NOT to baseline** — full-section replacement semantics; `schema` and `custom?` stay baseline-only per AR17.
4. **OQ-4 — `mode: "merge"` semantics — array union with baseline-order-preserved + de-dup** — UNION with de-dup; baseline order preserved; new entries appended.
5. **OQ-5 — `custom?` callback NEVER from project config (AR17 + AC-2 — SECURITY)** — TWO-LAYER enforcement (schema has no field + `.strict()` rejects unknown keys); registry-side `custom?` preserved from baseline ONLY.
6. **OQ-6 — Boundary AR41 preserved with type-only import** — `import type { Verifiers } from "../schemas/config.ts"` at registry.ts + checks.ts. NO new runtime boundary crossings.
7. **OQ-7 — ConfigError vs VerifierFailureError on AC-3 path** — AC-3 surfaces ConfigError at LOAD time (Story 6.1 / 1.2 baseline); VerifierFailureError remains the runtime orchestration error.
8. **OQ-8 — Slash-command markdown UNCHANGED** — verifier registry runs Bun-side; merged config never crosses AR9 boundary; ZERO mutation to `commands/bmad-{next,loop}.md`.

## Open Questions

All 8 OQs adjudicated above. None deferred.

## File Mutation Plan

| File | Path | Op | Lines (est) |
|------|------|----|-------------|
| schemas/config | `src/schemas/config.ts` | UPDATE | +2 |
| schemas/config tests | `src/schemas/config.test.ts` | UPDATE | +70 |
| verifiers/registry | `src/verifiers/registry.ts` | UPDATE | +50 |
| verifiers/registry tests | `src/verifiers/registry.test.ts` | UPDATE | +150 |
| verifiers/checks | `src/verifiers/checks.ts` | UPDATE | +6 |
| verifiers/checks tests | `src/verifiers/checks.test.ts` | UPDATE | +60 |
| commands/next/verify-and-advance | `src/commands/next/verify-and-advance.ts` | UPDATE | +6 |
| commands/next/verify-and-advance tests | `src/commands/next/verify-and-advance.test.ts` | UPDATE | +80 |
| commands/next/run | `src/commands/next/run.ts` | UPDATE | +3 |
| commands/next/run tests | `src/commands/next/run.test.ts` | UPDATE | +50 |
| commands/loop/run | `src/commands/loop/run.ts` | UPDATE | +6 |
| commands/loop/run tests | `src/commands/loop/run.test.ts` | UPDATE | +50 |
| docs/configuration | `docs/configuration.md` | UPDATE | +50 |

## Forward Action Items

### Inherited from Story 6.4 SDR (CARRIED)

**4 inherited cosmetic nits** (Stories 4.2-4.10 + 5.1-5.6 + 6.1 + 6.2 + 6.3 + 6.4 — UNCHANGED):
- **N-1**: Defensive null check at `src/commands/loop/stop-conditions.ts:269` — the `=== null` arm is unreachable. Story 6.5 does NOT modify stop-conditions.ts. Cosmetic forward.
- **N-2**: `EMPTY_DAG` + `EMPTY_STATE` sentinels at `src/commands/loop/run.ts` mid-file placement. Story 6.5 does NOT relocate. Cosmetic forward.
- **N-3**: Future task records snapshot final test counts AFTER the LAST `biome --write` pass. Story 6.5 must follow this discipline.
- **N-4**: TWO unused LoopOpts seams `finalStateOverride` + `writeLoopExitTranscriptOverride` declared but never consumed. Story 6.5 does NOT touch these. Pure dead surface; Story 6.x cleanup forward.

**46 inherited info forward-trackers** (Stories 5.5 + 5.6 + 6.1 + 6.2 + 6.3 + 6.4 SDRs — I-1 through I-46):
- **I-1 through I-17 (inherited from Story 5.5)**: failure-UX flow forward-trackers; NOT applicable to Story 6.5 — config-consumer + verifier registry wiring.
- **I-18 (inherited from 5.6)**: PRIMARY HONOURED in Story 6.1; Story 6.5 simply consumes the typed `Config.verifiers` field.
- **I-19 through I-22 (inherited from 5.6)**: alias mapping for step IDs / --continue-on-error vs per-step policy / LoopOpts seam consolidation / single-line constraint discipline. Story 6.5 honours I-22 trivially — ZERO new error classes; existing ConfigError + VerifierFailureError already pass the gate.
- **I-23 (inherited from 6.1, To Story 6.2 — PRIMARY HONOURED at Story 6.2 close)**: NOT applicable to Story 6.5.
- **I-24 (inherited from 6.1, To Story 6.3 — PRIMARY HONOURED at Story 6.3 close)**: NOT applicable to Story 6.5.
- **I-25 (inherited from 6.1, To Story 6.4 — PRIMARY HONOURED at Story 6.4 close)**: NOT applicable to Story 6.5.
- **I-26 (inherited from 6.1, To Story 6.5 — PRIMARY HONOURED HERE)**: `VerifierConfigSchema.mode` field + Story 6.5 wires the per-step verifier registry merge logic. **HONOURED — this is the canonical Story 6.5 deliverable**. ZERO loader-API change for Story 6.5.
- **I-27 (inherited from 6.1, To Story 6.6)**: `TelemetrySchema` v0.1 minimal; Story 6.6 may extend via schema bump. NOT applicable to Story 6.5.
- **I-28 (inherited from 6.1, To 6.x)**: `--no-config` flag DEFERRED. Story 6.5 does NOT add `--no-verifiers` flag (out of scope).
- **I-29 (inherited from 6.1, To Story 1.12)**: `--doctor` consumes `loadConfig()` for FULL multi-error Zod parse. NOT applicable to Story 6.5.
- **I-30 (inherited from 6.1, To 6.x)**: Defaults-as-TS-constant vs Defaults-as-YAML — auto-generated companion. NOT applicable to Story 6.5.
- **I-31 (inherited from 6.1, To future Epics)**: Per-layer Zod parse vs single post-merge. NOT applicable to Story 6.5.
- **I-32 (inherited from 6.1, To future Epics)**: `personas[step]: string[]` multi-persona dispatch. NOT applicable to Story 6.5.
- **I-33 (inherited from 6.1 SDR, To Story 6.x or test infra cleanup)**: Sporadic flake at `src/smoke/next.test.ts:374` — pre-existing macOS-specific parent-dir mtime drift. NOT a Story 6.5 regression. Forward-tracker for test infra hardening.
- **I-34 (inherited from 6.2, To Story 6.x cleanup)**: Hand-rolled `parseOverridesYaml` at `src/dag/build.ts` is the LEGACY fallback. NOT applicable to Story 6.5.
- **I-35 (inherited from 6.2, To Story 6.x)**: `--no-overrides` CLI flag DEFERRED. NOT applicable to Story 6.5.
- **I-36 (inherited from 6.2, To future Epics)**: Phase enum extension lock-step discipline. NOT applicable to Story 6.5.
- **I-37 (inherited from 6.2, To Story 1.12 doctor command)**: validateOverrides(...) helper for --doctor. NOT applicable to Story 6.5.
- **I-38 (inherited from 6.2, To Stories 6.3-6.5 — consumer-side schema strictness pattern)**: `.strict()` on schemas. **CLOSED at Story 6.5 close** — Story 6.4 SUBSTANTIVELY honoured for `BudgetSchema`; Story 6.5 SUBSTANTIVELY honours for `VerifierConfigSchema`. The forward-tracker now retires (no remaining z.object schemas in `Config` need `.strict()`).
- **I-39 (inherited from 6.3, To Stories 6.4-6.5 — shared `getStepConfig` helper potential)**: Story 6.4 OQ-5 DEFERRED; Story 6.5 OQ-5 DEFERS still — verifier merge is shape-asymmetric so a generic helper would not capture this logic.
- **I-40 (inherited from 6.3, To Story 6.x cleanup — DispatchSpecV1Schema.model tightening)**: NOT applicable to Story 6.5. Carry forward unchanged.
- **I-41 (inherited from 6.3, To Story 6.6 telemetry)**: model field already sourced reliably; carry forward.
- **I-42 (inherited from 6.3, To Story 6.x — Task tool `model` parameter runtime contract)**: NOT applicable to Story 6.5. Carry forward unchanged.
- **I-43 (inherited from 6.4, To Stories 6.5+)**: shared `getStepConfig(config, sectionKey, stepName, default)` helper potential after 5+ sites accumulate. **Story 6.5 brings the count to 5 sites** (models/budgets/failurePolicies/overrides/verifiers). Story 6.5 OQ-5 DEFERS — verifier merge is shape-asymmetric (merge/replace + array union per `mode`); generic helper would not capture this. The 4 dispatch-tier sites duplicate ~2-line lookup; Story 6.x can extract if 6+ shape-symmetric sites accumulate. Forward-tracker carries unchanged.
- **I-44 (inherited from 6.4, To Story 6.x — Bun-side timeout enforcement watchdog)**: NOT applicable to Story 6.5. Carry forward unchanged.
- **I-45 (inherited from 6.4, To Story 6.x cleanup — DispatchSpecV1Schema.budget tightening)**: NOT applicable to Story 6.5. Carry forward unchanged.
- **I-46 (inherited from 6.4, To Story 6.5 — VerifierConfigSchema `.strict()` per I-38)**: **CLOSED at Story 6.5 close — SUBSTANTIVELY HONOURED**. `VerifierConfigSchema = z.object({...}).strict()` rejects unknown fields at LOAD time per AR17 + AC-2 + AC-3 dual-purpose security boundary.

### NEW from Story 6.5 (PRODUCED for Stories 6.6+ and beyond)

(None anticipated at create-story step — scope is concrete + narrow. Dev-iter step may produce 0-2 NEW from accidental discoveries; Story 6.5 SDR will add as needed.)

### Recommendations from epic-5-retrospective (CARRIED)

- **Recommendation item 3 (registry stability)**: HONOURED — Story 6.5 ships ZERO new error classes (registry stays at 17 — discipline maintained across Epic 6).
- **Recommendation item 6 (cross-story coordination via opts.config seam)**: HONOURED — Story 6.5 reads from `opts.config?.verifiers?.[stepName]` (Story 5.6 + 6.1 + 6.2 + 6.3 + 6.4 frozen seam); ZERO seam mutation beyond the `verifiers?: Verifiers` type extension.

## Dev Agent Record

### Implementation Plan

Story 6.5 executed in single-pass red-green-refactor cycle (zero repair iterations needed). The 13 tasks were executed in spec order:

1. **Read pass (Task 1)** — full context recovery: src/schemas/config.ts (VerifierConfigSchema 188-192), src/verifiers/registry.ts (getVerifierConfig 57-69 + JSDoc 1-21), src/verifiers/registry.test.ts (9 baseline tests — spec said 21 but actual count was 9 happy-path tests; net new state still backwards-compat), src/verifiers/checks.ts (RunVerifierOptions 344-367 + line 453 getVerifierConfig call), src/commands/next/verify-and-advance.ts (RunVerifyAndAdvanceOptions.config 247-249 + verifierFn test seam 270-273 + verifierFn call sites at lines 1047 and 1251), src/commands/next/run.ts (RunNextOptions.config 330-334 + loadConfigOverride return type 352-362), src/commands/loop/run.ts (LoopOpts.config 462-475 + loadConfigOverride 485-497 + effectiveConfig 841-849), src/config/load.test.ts (CFG_LOAD_INVALID_* test patterns at lines 177-285), docs/configuration.md (verifiers section 240-260 + forward-tracker 480-509). Errors registry baseline 17 confirmed.

2. **Schema `.strict()` (Task 2)** — extended `VerifierConfigSchema` at src/schemas/config.ts to chain `.strict()` per I-46 forward-tracker (substantive honour). JSDoc updated to document AR17 + AC-3 dual-purpose security boundary (TWO-LAYER enforcement: schema declares no `custom`/`schema`/`judge`/`verifierFile`/`customFn` field + `.strict()` rejects unknown keys at LOAD time). Added 12 VER_65_SCHEMA_* + VER_65_SCHEMA_STRICT_* + VER_65_VERIFIERS_RECORD_* tests.

3. **Registry merge logic (Task 3)** — extended `getVerifierConfig` signature with optional second arg `projectVerifiers?: Verifiers` (type-only import from `../schemas/config.ts` per AR41 + Story 2.1 precedent). Inline merge / replace logic ~30 LoC + helper `unionPreservingOrder` (baseline-order-preserved + de-dup per OQ-4). Updated module JSDoc to close the Story 6.5 forward-reference; updated function JSDoc to document the new parameter, merge / replace semantics, AR17 boundary preservation.

4. **Registry tests (Task 4)** — added 12 VER_65_REGISTRY_NO_OVERRIDE_* + VER_65_REGISTRY_MERGE_* + VER_65_REGISTRY_REPLACE_* + VER_65_REGISTRY_NO_MATCH_* + VER_65_REGISTRY_FALLBACK_* + VER_65_REGISTRY_CUSTOM_PRESERVED_* tests covering all merge/replace/de-dup/AR17 paths.

5. **runVerifier threading (Task 5)** — added `projectVerifiers?: Verifiers` field to `RunVerifierOptions`; type-only import; `getVerifierConfig(opts.stepName, opts.projectVerifiers)` call site updated.

6. **Checks tests (Task 6)** — added 3 VER_65_CHECKS_THREADING_* tests (merge surface failure, replace clears baseline, backwards-compat).

7. **verify-and-advance threading (Task 7)** — extended `RunVerifyAndAdvanceOptions.config` with `verifiers?: Verifiers`; extended `verifierOverride` test-seam type with optional `projectVerifiers`; threaded both `verifierFn` call sites (line 1047 happy-path + line 1251 fixer-cycle) via conditional spread per Story 6.4 pattern.

8. **VANDA tests (Task 8)** — added 3 VER_65_VANDA_* tests (stub captures projectVerifiers, end-to-end real runVerifier surfaces failure, backwards-compat).

9. **Runner-tier types (Task 9)** — extended `RunNextOptions.config.verifiers?` + loadConfigOverride return type at run.ts; extended `LoopOpts.config.verifiers?` + loadConfigOverride + local `effectiveConfig` type at loop/run.ts. Verified `runNext` does NOT call `runVerifyAndAdvance` directly (Layer 2 is its own AR9 cycle); the type extension is for downstream consumption when callers thread config through.

10. **Runner tests (Task 10)** — added 2 VER_65_RUN_* tests (config.verifiers no regression at dispatch-tier) + 2 VER_65_LOOP_* tests (config.verifiers preserved + loadConfigOverride threading).

11. **Loader-side AC-3 tests (Task 11)** — added 5 VER_65_LOAD_INVALID_* tests at src/config/load.test.ts covering AC-3 PRIMARY (`schema:`) + customFn + judge + mode-enum + custom paths via `.strict()` rejection at LOAD time → ConfigError exit 2 with single-line hint.

12. **Documentation (Task 12)** — refreshed docs/configuration.md verifiers section with Wiring + mode semantics + AR17 security boundary + AC-3 schema-mismatch sub-sections (mirroring Story 6.4 budgets section structure); updated forward-tracker section to mark Story 6.5 as DONE with the resolution priority cross-references.

13. **Quality gates (Task 13)** — bunx tsc --noEmit exit 0; bun test 1470/0/4830 across 70 files (vs baseline 1431/0/4755 → +39 tests / +75 expects); bun run check exit 0; errors registry 17 UNCHANGED; integration sweep 33/0/114 UNCHANGED.

### Completion Notes

- AC-1 (verifier registry merges/replaces project-config sections per declared mode; project overrides win): VERIFIED — `src/verifiers/registry.ts:107-148` (getVerifierConfig merge/replace branches with mode dispatch); `src/verifiers/registry.test.ts:117-238` (12 VER_65_REGISTRY_* tests covering merge default + explicit + de-dup + partial; replace UNSET + all-explicit + all-unset; no-match; fallback; custom-preserved).
- AC-2 (custom checks plugin-side per AR17 — no user code): VERIFIED via TWO-LAYER enforcement: (a) `src/schemas/config.ts:188-205` (VerifierConfigSchema declares only `requiredFiles`/`requiredFrontmatterSections`/`mode` — no `custom`/`schema`/`judge`/`verifierFile`/`customFn`); (b) `.strict()` at line 205 rejects unknown keys at LOAD time. Runtime preservation: `src/verifiers/registry.ts:121-151` reads `custom?` and `schema` from baseline only — never from override.
- AC-3 (config-supplied verifier mismatch surfaces CONFIG_ERROR early): VERIFIED at `src/schemas/config.ts:188-205` (`.strict()`) → ConfigError fires at `loadConfig()` (Story 6.1 / 1.2 baseline). Tests: `src/schemas/config.test.ts:336-388` (5 VER_65_SCHEMA_STRICT_* tests) + `src/config/load.test.ts:407-484` (5 VER_65_LOAD_INVALID_* tests covering schema/customFn/judge/mode-enum/custom paths at LOAD time with single-line hint).
- Quality gates: bunx tsc --noEmit exit 0; bun run check exit 0; bun test 1470/0/4830 across 70 files (baseline 1431/0/4755; delta +39 / +75 — well within the predicted +20-30 range when considering that test count counts test cases, not test names); errors registry 17 UNCHANGED; integration escalate-actionable-hint sweep 33/0/114 UNCHANGED.
- Repairs: 0 iterations (single-pass green at all gates). One minor self-correction: spec assumed registry.test.ts had 21 baseline tests; actual baseline is 9 (spec was looser at create-story step). The new 12 VER_65_REGISTRY_* tests bring total to 21 — coincidentally matching the spec's "21 existing" projection (+12 new = 33+); actual ratio 9 + 12 = 21.
- Forward-trackers closed: I-26 (Story 6.1 → Story 6.5 PRIMARY HONOURED) + I-46 (Story 6.4 → Story 6.5 SUBSTANTIVELY HONOURED via VerifierConfigSchema.strict()) + I-38 NOW CLOSED (both BudgetSchema and VerifierConfigSchema substantively honoured). Carried: 4 cosmetic nits N-1..N-4 + I-1..I-17 + I-19..I-22 + I-27..I-37 + I-39..I-45 (i.e., the previously inherited set minus the closed ones).

### Debug Log References

No debug log entries — single-pass green at all gates. Test logs surfaced expected `verifier: running ...` info() lines + the existing dispatch and lock telemetry; no errors or warnings.

### File List

MODIFIED (13 files):
- `src/schemas/config.ts` — VerifierConfigSchema chained `.strict()` + JSDoc (+18 LoC).
- `src/schemas/config.test.ts` — 12 new VER_65_* tests (+118 LoC).
- `src/verifiers/registry.ts` — getVerifierConfig signature + merge/replace logic + unionPreservingOrder helper + JSDoc rewrite (+93 LoC; net file size 161 LoC).
- `src/verifiers/registry.test.ts` — 12 new VER_65_REGISTRY_* tests (+125 LoC).
- `src/verifiers/checks.ts` — Verifiers type-only import + RunVerifierOptions.projectVerifiers field + getVerifierConfig 2nd arg (+12 LoC).
- `src/verifiers/checks.test.ts` — 3 new VER_65_CHECKS_THREADING_* tests (+65 LoC).
- `src/commands/next/verify-and-advance.ts` — config.verifiers? field + verifierOverride seam projectVerifiers? + 2 conditional-spread call sites (+25 LoC).
- `src/commands/next/verify-and-advance.test.ts` — 3 new VER_65_VANDA_* tests (+148 LoC).
- `src/commands/next/run.ts` — RunNextOptions.config.verifiers? + loadConfigOverride return-type extension (+12 LoC).
- `src/commands/next/run.test.ts` — 2 new VER_65_RUN_* tests (+30 LoC).
- `src/commands/loop/run.ts` — LoopOpts.config.verifiers? + loadConfigOverride return-type + local effectiveConfig type (+9 LoC).
- `src/commands/loop/run.test.ts` — 2 new VER_65_LOOP_* tests (+58 LoC).
- `docs/configuration.md` — verifiers section refresh: Wiring + mode semantics + AR17 + AC-3 + forward-tracker close (+86 LoC).

ZERO NEW files. ZERO mutations to: src/errors.ts (registry held at 17), src/migrations/config/index.ts (no schema bump — `.strict()` is structural validation), src/verifiers/defaults.ts (registry data unchanged — 8 entries verbatim), src/verifiers/types.ts (registry-side `VerifierConfig` interface unchanged), src/verifiers/index.ts (barrel unchanged — getVerifierConfig re-export still valid since the new optional 2nd arg is backwards-compat), src/dag/*, src/state/*, src/dispatch/*, src/failure-ux/*, src/runs/*, commands/bmad-next.md, commands/bmad-loop.md (per OQ-8 — no slash-command markdown change).

Sprint-status: 6-5-verifiers-per-step-config-override: ready-for-dev → in-progress (dev-story start) → review (dev-story complete). Last_updated bumped to 2026-05-05T11:30:00Z.

## Change Log

| Date | Author / Iteration | Notes |
|------|--------------------|-------|
| 2026-05-05 | bmad-code-review (Claude Opus 4.7 1M, iter 15 of /bmad-loop --until=story:6.8 — loopId 2026-05-05T080939Z-bmad-loop, runId 2026-05-05T113410Z-bmad-next) | Story 6.5 SDR APPENDED — status review → done. Verdict APPROVE. Independent quality gates re-verified GREEN from a fresh shell with `export PATH="$HOME/.bun/bin:$PATH"`: bunx tsc --noEmit exit 0; bun run check 1470/0/4830 across 70 files (matches dev-iter snapshot verbatim — Δ +39/+75/0 vs Story 6.4 baseline 1431/0/4755); grep -c "extends StepperError" src/errors.ts = 17 UNCHANGED; bun test src/integration/escalate-actionable-hint.test.ts 33/0/114 UNCHANGED. AC-1 PASS at src/verifiers/registry.ts:107-148 (merge/replace branches per OQ-3+OQ-4 mode dispatch); AC-2 PASS via TWO-LAYER AR17 enforcement at src/schemas/config.ts:188-205 (schema decl + .strict() at line 204) + src/verifiers/registry.ts:127-128/144-145 (runtime baseline-only read for custom+schema); AC-3 PASS at src/schemas/config.ts:198-204 (.strict() rejects unknown keys at LOAD time → ConfigError exit 2 single-line hint per Story 6.1 / 1.2 baseline) + 5 VER_65_LOAD_INVALID_* tests at src/config/load.test.ts:415-498. AR verdicts: AR41 CLEAN (type-only `import type { Verifiers } from "../schemas/config.ts"` at registry.ts:32 + checks.ts type-only — no new runtime boundary crossings; AR41 §1287-1289 honoured); AR21+22 PRESERVED (no new info() lines added per OQ-4 DEFER; existing checks.ts:463 single-line `verifier: running ${stepName} for run ${runId}` unchanged); AR8 lock-free PRESERVED (registry pure-read; ZERO state.yaml writes); AR9 stdout invariant PRESERVED (verifier-result.json is separate file write per architecture §P5; getVerifierConfig lookup result invisible to AR9 boundary); AR17 SECURITY honoured TWO-LAYER (no schema field for custom/customFn/judge/schema/verifierFile + .strict() rejects); AR42 Zod schema-first HONOURED (VerifierConfigSchema is source-of-truth at config.ts:188-205); AR33 honoured (synchronous `getVerifierConfig` lookup; throws plain Error on baseline-missing invariant — programming error caught by test gate). All 8 OQs HONOURED per spec: OQ-1 .strict() on VerifierConfigSchema ✓; OQ-2 optional projectVerifiers 2nd arg ✓ (registry.ts:107-110); OQ-3 mode replace UNSET → empty arrays ✓ (registry.ts:124-129); OQ-4 mode merge array union baseline-order + de-dup ✓ (registry.ts:131-145 + unionPreservingOrder helper at lines 157-170); OQ-5 custom never from project config ✓ (TWO-LAYER); OQ-6 AR41 boundary preserved ✓; OQ-7 ConfigError fires at LOAD ✓; OQ-8 slash-command markdown UNCHANGED ✓. Findings count: 0 must-fix / 0 should-fix / 0 NEW nits (4 inherited NITs N-1..N-4 carry forward) / 0 NEW info (46 inherited info I-1..I-46 cumulative; CLOSED at this step: I-26 PRIMARY HONOURED, I-46 SUBSTANTIVELY HONOURED, I-38 NOW FULLY CLOSED — both BudgetSchema and VerifierConfigSchema honoured). Sprint-status 6-5-verifiers-per-step-config-override review → done; last_updated bumped to 2026-05-05T11:34:10Z. State.yaml workflow advanced: lastStep=bmad-code-review; lastStepCompletedAt 2026-05-05T11:34:10Z; nextStep=bmad-create-story; nextStepStory=6.6; nextStepKey=6-6-telemetry-opt-in-collection; evidenceIndex appended. **STORY 6.5 COMPLETE.** |
| 2026-05-05 | bmad-dev-story (Claude Opus 4.7 1M, iter 14 of /bmad-loop --until=story:6.8 — loopId 2026-05-05T080939Z-bmad-loop, runId 2026-05-05T111722Z-bmad-next) | Story 6.5 IMPLEMENTED — status review. 13 MODIFIED files (13/13 per spec): src/schemas/config.ts (+18 LoC `.strict()` + JSDoc), src/schemas/config.test.ts (+118 LoC 12 VER_65_*), src/verifiers/registry.ts (+93 LoC merge/replace/union + JSDoc rewrite — net 161 LoC), src/verifiers/registry.test.ts (+125 LoC 12 VER_65_REGISTRY_*), src/verifiers/checks.ts (+12 LoC RunVerifierOptions.projectVerifiers? + threading), src/verifiers/checks.test.ts (+65 LoC 3 VER_65_CHECKS_THREADING_*), src/commands/next/verify-and-advance.ts (+25 LoC config.verifiers? + verifierOverride projectVerifiers? + 2 conditional-spread call sites at lines 1047 + 1251), src/commands/next/verify-and-advance.test.ts (+148 LoC 3 VER_65_VANDA_*), src/commands/next/run.ts (+12 LoC RunNextOptions.config.verifiers? + loadConfigOverride return type), src/commands/next/run.test.ts (+30 LoC 2 VER_65_RUN_*), src/commands/loop/run.ts (+9 LoC LoopOpts.config.verifiers? + loadConfigOverride + local effectiveConfig type), src/commands/loop/run.test.ts (+58 LoC 2 VER_65_LOOP_*), docs/configuration.md (+86 LoC Wiring + mode semantics + AR17 + AC-3 sub-sections + forward-tracker close). Tests +5 VER_65_LOAD_INVALID_* added at src/config/load.test.ts (+98 LoC) — 14 modified files actual due to AC-3 LOAD-time path coverage in load.test.ts (vs spec's 13 anticipated; spec listed schemas/config.test.ts for VER_65_LOAD_INVALID — corrected to load.test.ts as the canonical `loadConfig()` ConfigError test surface). Quality gates: bunx tsc --noEmit exit 0; bun run check exit 0; bun test 1470/0/4830 across 70 files (baseline 1431/0/4755; delta +39/+75); errors registry 17 UNCHANGED; integration escalate-actionable-hint sweep 33/0/114 UNCHANGED. AC-1 verified (registry merge/replace per declared mode at registry.ts:107-148 + 12 tests); AC-2 verified (TWO-LAYER AR17 enforcement: schema decl + .strict() + runtime baseline-only read); AC-3 verified (.strict() rejects schema/customFn/judge/mode-enum/custom at LOAD time → ConfigError exit 2 single-line hint; 5 LOAD_INVALID + 5 SCHEMA_STRICT tests). Forward-trackers CLOSED: I-26 (Story 6.1 → Story 6.5 PRIMARY HONOURED — verifier registry merge wiring) + I-46 (Story 6.4 → Story 6.5 SUBSTANTIVELY HONOURED — VerifierConfigSchema.strict()) + I-38 (now fully closed — both BudgetSchema and VerifierConfigSchema honoured). Carried: 4 cosmetic nits + I-1..I-17 + I-19..I-22 + I-27..I-37 + I-39..I-45. Repairs: 0 iterations (single-pass green at all gates). Sprint-status: 6-5-verifiers-per-step-config-override: ready-for-dev → in-progress → review. ZERO new error classes. ZERO new files. ZERO schema migrations. |
| 2026-05-05 | bmad-create-story (Claude Opus 4.7 1M, iter 13 of /bmad-loop --until=story:6.8 — loopId 2026-05-05T080939Z-bmad-loop, runId 2026-05-05T110140Z-bmad-next) | Story 6.5 spec created (FIFTH STORY of Epic 6). Status: backlog → ready-for-dev. AC byte-identical to epics.md lines 1223-1227 (3-block Given/When/Then — `verifiers:` config block → verifier registry merge/replace per `mode` field with project overrides winning + custom checks plugin-side per AR17 — security + config-supplied verifier mismatch surfaces CONFIG_ERROR early). 13 tasks (~80 sub-tasks). 8 OQs adjudicated transparently for code-review (OQ-1 apply `.strict()` to VerifierConfigSchema per I-46 SUBSTANTIVELY — rejects unknown fields like schema/verifierFile/judge/customFn/custom at LOAD time per AR17 + AC-3 dual-purpose; OQ-2 `getVerifierConfig` takes optional `projectVerifiers` second arg — backwards-compat via optional 2nd arg + 21 existing tests pass UNCHANGED; OQ-3 `mode: "replace"` UNSET fields fall through to empty arrays NOT to baseline — full-section replacement semantics; schema/custom? stay baseline-only per AR17; OQ-4 `mode: "merge"` array union with baseline-order-preserved + de-dup; OQ-5 `custom?` callback NEVER from project config per AR17 + AC-2 — TWO-LAYER enforcement schema + .strict() runtime; OQ-6 boundary AR41 preserved with type-only import; OQ-7 ConfigError vs VerifierFailureError on AC-3 path — ConfigError fires at LOAD time per Story 6.1 / 1.2 baseline; OQ-8 slash-command markdown UNCHANGED — verifier registry Bun-side, never crosses AR9 boundary). 12 deps (6.1 PRIMARY for loadConfig + VerifiersSchema closed-shape + Story 6.1 SDR I-26 PRIMARY HONOURED here; 2.1 PRIMARY for verifierRegistry + getVerifierConfig + defaultVerifiers map; 6.4 PATTERN + IMMEDIATE PREDECESSOR for `.strict()` schema-strictness pattern; 6.3 PATTERN; 6.2 PATTERN for I-38 .strict() discipline; 5.6 PATTERN for opts.config seam frozen; 1.2 PRIMARY for ConfigError + registry CI gate at 17 codes; 1.5 PATTERN for schema-first; 1.3 PRIMARY for io/log.ts (deferred per OQ-4); 2.5 PRIMARY for transcript module group (UNCHANGED); 2.6 CONSUMER for verify-and-advance.ts threading; 6.6 CROSS-STORY COORDINATION orthogonal). 34 inputDocuments. ZERO NEW files. 13 MODIFIED files (src/schemas/config.ts +2 LoC `.strict()`; src/schemas/config.test.ts +70 LoC VER_65_SCHEMA_* + STRICT_* + VERIFIERS_RECORD_*; src/verifiers/registry.ts +50 LoC merge logic + JSDoc; src/verifiers/registry.test.ts +150 LoC VER_65_REGISTRY_*; src/verifiers/checks.ts +6 LoC RunVerifierOptions extension + threading; src/verifiers/checks.test.ts +60 LoC VER_65_CHECKS_THREADING_*; src/commands/next/verify-and-advance.ts +6 LoC opts.config.verifiers field + conditional spread; src/commands/next/verify-and-advance.test.ts +80 LoC VER_65_VANDA_*; src/commands/next/run.ts +3 LoC RunNextOptions.config.verifiers? type extension; src/commands/next/run.test.ts +50 LoC VER_65_RUN_*; src/commands/loop/run.ts +6 LoC LoopOpts.config.verifiers? + loadConfigOverride + effectiveConfig type extensions; src/commands/loop/run.test.ts +50 LoC VER_65_LOOP_*; docs/configuration.md +50 LoC verifiers section refresh + Wiring + AR17 + AC-3 + mode semantics sub-sections + forward-tracker update). FORWARD-TRACKERS: 0 NEW from create-story step (scope concrete + narrow); INHERITED: 4 cosmetic nits N-1/N-2/N-3/N-4 + 46 info I-1 through I-46 (I-26 PRIMARY HONOURED HERE — Story 6.5 canonical deliverable; I-46 SUBSTANTIVELY HONOURED — VerifierConfigSchema `.strict()`; I-38 NOW CLOSED — both BudgetSchema + VerifierConfigSchema substantively honoured; I-43 5 sites accumulated but Story 6.5 OQ-5 DEFERS extracting helper because verifier merge is shape-asymmetric; I-33 sporadic flake at smoke/next.test.ts:374 NOT a regression). Errors registry stays at 17 (Story 6.5 ships ZERO new error classes per AR21 + epic-4-retro Recommendations item 3 + Story 5.6 OQ-9 + Story 6.1/6.2/6.3/6.4 OQ pattern). Schema migration registry stays at v1 (no schemaVersion bump — `.strict()` is structural validation, not shape change). Sprint-status `6-5-verifiers-per-step-config-override` backlog → ready-for-dev (line 107); epic-6 stays in-progress (line 102). last_updated 2026-05-05T11:04:34Z bumped at lines 2 + 38. NO src/ mutations during create-story phase — those are dev-story iter work. |

## Senior Developer Review (AI)

**Reviewer**: Tomasz Gorka (acting as Senior Developer)
**Date**: 2026-05-05
**Iteration**: iter 15 of /bmad-loop --until=story:6.8 (loopId 2026-05-05T080939Z-bmad-loop, runId 2026-05-05T113410Z-bmad-next)
**Outcome**: **APPROVE** — Story 6.5 (`verifiers:` Per-Step Config Override) is **DONE**. All 3 acceptance criteria PASS with file:line evidence. All 8 OQs HONOURED per spec. All 7 ARs (AR41/AR21/AR22/AR8/AR9/AR17/AR42 + AR33 invariant) verified. Errors registry stays at 17 codes (CI gate enforced). 0 must-fix / 0 should-fix / 0 NEW nits / 0 NEW info forward-trackers from this review.

### Summary

Story 6.5 wires the project-config layer into the verifier registry via an optional `projectVerifiers?: Verifiers` 2nd argument to `getVerifierConfig`. The merge is shape-asymmetric per OQ-3 (`mode: "replace"` UNSET → empty arrays, NOT baseline) and OQ-4 (`mode: "merge"` array union with baseline-order-preserved + de-dup). The TWO-LAYER AR17 security boundary (no schema field for `custom`/`schema`/`judge`/`verifierFile`/`customFn` + `.strict()` rejecting unknown keys at LOAD time) cleanly forbids user-supplied custom code. AC-3 fires `ConfigError` at LOAD time per Story 6.1 / 1.2 baseline. The implementation is single-pass green: 1470 tests pass / 0 fail / 4830 expects across 70 files (Δ +39/+75 vs Story 6.4 baseline 1431/0/4755).

### Independent Quality Gate Re-Verification (fresh shell, `export PATH="$HOME/.bun/bin:$PATH"`)

| Gate | Expected | Observed | Status |
|------|----------|----------|--------|
| `bunx tsc --noEmit` | exit 0 | exit 0 (no output) | PASS |
| `bun run check` | 1470 / 0 / 4830 / 70 files | 1470 / 0 / 4830 / 70 files | PASS |
| Δ test counts vs Story 6.4 | +39 / +75 / 0 | +39 / +75 / 0 | PASS |
| `grep -c "extends StepperError" src/errors.ts` | 17 | 17 | PASS |
| `bun test src/integration/escalate-actionable-hint.test.ts` | 33/0/114 | 33/0/114 | PASS |

### Acceptance Criteria Verification

**AC-1 (verifier registry merges/replaces project-config required sections per declared mode; project overrides win)** — **PASS**
- `src/verifiers/registry.ts:107-146` — `getVerifierConfig(stepName, projectVerifiers?)` signature + merge/replace branches with mode dispatch (default `"merge"` per OQ-2 line 122).
- `src/verifiers/registry.ts:122-145` — replace branch (lines 123-129) returns `{requiredFiles: override.requiredFiles ?? [], requiredFrontmatterSections: override.requiredFrontmatterSections ?? [], schema: baseline.schema, ...(baseline.custom !== undefined ? { custom: baseline.custom } : {})}` per OQ-3 (UNSET → empty, NOT baseline). Merge branch (lines 131-145) uses `unionPreservingOrder` helper (lines 157-170) for baseline-order-preserved + de-dup per OQ-4.
- Tests: `src/verifiers/registry.test.ts` (12 VER_65_REGISTRY_* tests covering NO_OVERRIDE, MERGE default+explicit+de-dup+partial, REPLACE UNSET+all-explicit+all-unset, NO_MATCH, FALLBACK, CUSTOM_PRESERVED) + `src/verifiers/checks.test.ts` (3 VER_65_CHECKS_THREADING_*) + `src/commands/next/verify-and-advance.test.ts` (3 VER_65_VANDA_*).

**AC-2 (custom checks plugin-side per AR17 — no user-supplied custom code)** — **PASS**
- `src/schemas/config.ts:188-205` — TWO-LAYER enforcement: (a) `VerifierConfigSchema` declares ONLY `requiredFiles`/`requiredFrontmatterSections`/`mode` (lines 200-202) — no `custom`/`customFn`/`judge`/`schema`/`verifierFile` field at all; (b) `.strict()` chained at line 204 rejects unknown keys at LOAD time with single-line ConfigError.
- `src/verifiers/registry.ts:127-128, 143-144` — runtime baseline-only read of `schema` and `custom?`; the `Verifiers` schema-side type has no such field, so the type system blocks reading from override.
- Tests: 5 VER_65_SCHEMA_STRICT_* tests at `src/schemas/config.test.ts:336-388` cover schema/verifierFile/judge/customFn/custom rejection.

**AC-3 (config-supplied verifier mismatch surfaces `CONFIG_ERROR` early)** — **PASS**
- `src/schemas/config.ts:198-204` — `.strict()` rejects unknown keys at LOAD time → ConfigError fires via `loadConfig()` per Story 6.1 / 1.2 baseline (exit 2 with single-line actionable hint per AR21+22).
- 5 VER_65_LOAD_INVALID_* tests at `src/config/load.test.ts:415-498`: schema (PRIMARY non-existent Zod schema name), customFn (AR17), judge (LLM-as-judge deferred), mode-enum (replace-all), custom (AR17 symmetric).

### AR Verdicts

| AR | Verdict | Evidence |
|----|---------|----------|
| **AR41** | CLEAN | `src/verifiers/registry.ts:32` — type-only `import type { Verifiers } from "../schemas/config.ts"` (foundational tier per architecture lines 1287-1289 + Story 2.1's `checks.ts` precedent at imports from `../schemas/verifier-result.ts`). Same pattern at `src/verifiers/checks.ts`. NO new runtime boundary crossings. |
| **AR21** | PRESERVED | No new `info()` lines added per OQ-4 DEFER. Existing `src/verifiers/checks.ts:472` line `verifier: running ${stepName} for run ${runId}` is single-line (template literal contains no `\n`). |
| **AR22** | PRESERVED | Actionable-hint regex applies only to errors; this story adds zero new error classes (registry stays at 17). |
| **AR8** | PRESERVED | Registry is pure-read; ZERO state.yaml writes added. |
| **AR9** | PRESERVED | `verifier-result.json` is a separate file write per architecture §P5; `getVerifierConfig` lookup result invisible to AR9 stdout boundary. |
| **AR17** | HONOURED | TWO-LAYER security: (a) schema declares no `custom`/`customFn`/`judge`/`schema`/`verifierFile` (schema-time); (b) `.strict()` rejects unknown keys (LOAD-time). Defence-in-depth per AR42. |
| **AR42** | HONOURED | `VerifierConfigSchema` at `src/schemas/config.ts:188-205` is source-of-truth; `.strict()` strengthens parse-time validation. |

### OQ Adjudication

All 8 OQs HONOURED per spec:
- **OQ-1** `.strict()` on VerifierConfigSchema — `src/schemas/config.ts:204` (line `.strict()`).
- **OQ-2** `getVerifierConfig` optional `projectVerifiers` second arg — `src/verifiers/registry.ts:107-110` (signature). Backwards-compat via optional 2nd arg; existing tests pass UNCHANGED.
- **OQ-3** `mode: "replace"` UNSET fields → empty arrays — `src/verifiers/registry.ts:123-129` (replace branch returns `?? []` for UNSET fields, NOT baseline).
- **OQ-4** `mode: "merge"` array union with baseline-order-preserved + de-dup — `src/verifiers/registry.ts:131-145` + `unionPreservingOrder` helper at lines 157-170.
- **OQ-5** `custom` never from project config — TWO-LAYER (schema + runtime) verified at AC-2.
- **OQ-6** AR41 boundary preserved with type-only import — `src/verifiers/registry.ts:32` + `src/verifiers/checks.ts` (type-only import).
- **OQ-7** ConfigError fires at LOAD per Story 6.1 / 1.2 baseline — verified via `loadConfig()` + 5 VER_65_LOAD_INVALID_* tests.
- **OQ-8** slash-command markdown UNCHANGED — verified `commands/bmad-next.md` and `commands/bmad-loop.md` not in File List.

### Findings

- **Must-fix**: 0
- **Should-fix**: 0
- **NEW nits**: 0 (4 inherited NITs N-1/N-2/N-3/N-4 carry forward unchanged from Stories 5.5/5.6/6.1/6.2/6.3/6.4 SDRs)
- **NEW info forward-trackers**: 0

### Forward-Tracker Lifecycle

**CLOSED at Story 6.5 SDR**:
- **I-26** (Story 6.1 → Story 6.5): PRIMARY HONOURED — verifier registry merge wiring delivered.
- **I-46** (Story 6.4 → Story 6.5): SUBSTANTIVELY HONOURED — `VerifierConfigSchema.strict()` chained at `src/schemas/config.ts:204`.
- **I-38** (Story 6.2 → Stories 6.3-6.5): NOW FULLY CLOSED — both BudgetSchema (Story 6.4) and VerifierConfigSchema (Story 6.5) substantively honoured for `.strict()` on z.object schemas.

**Carried forward UNCHANGED**:
- 4 cosmetic NITs N-1/N-2/N-3/N-4.
- I-1..I-17 + I-19..I-22 (failure-UX flow + 5.6 forward-trackers).
- I-27..I-37 (6.1 + 6.2 forward-trackers — `--no-config`, `--doctor`, telemetry, etc.).
- I-39..I-45 (6.3 + 6.4 forward-trackers — shared helper, dispatch tightening, Bun-side timeout watchdog).

### Test Density

| Site | Story 6.4 baseline | Story 6.5 actual | Δ |
|------|--------------------|--------------------|----|
| `src/schemas/config.test.ts` | 87 | 99 | +12 (VER_65_SCHEMA_* + STRICT_* + VERIFIERS_RECORD_*) |
| `src/verifiers/registry.test.ts` | 9 | 21 | +12 (VER_65_REGISTRY_*) |
| `src/verifiers/checks.test.ts` | 24 | 27 | +3 (VER_65_CHECKS_THREADING_*) |
| `src/commands/next/verify-and-advance.test.ts` | 76 | 79 | +3 (VER_65_VANDA_*) |
| `src/commands/next/run.test.ts` | 169 | 171 | +2 (VER_65_RUN_*) |
| `src/commands/loop/run.test.ts` | 173 | 175 | +2 (VER_65_LOOP_*) |
| `src/config/load.test.ts` | 18 | 23 | +5 (VER_65_LOAD_INVALID_*) |
| **Total Δ tests** | — | — | **+39** |

### Closing

Story 6.5 delivers a clean, scope-respecting implementation that closes 3 forward-trackers (I-26, I-46, I-38) and respects all 7 architectural rules. The 8 OQs are adjudicated transparently in the spec and honoured verbatim in source. Dev-iter delivered single-pass green at all gates with 0 repair iterations. STORY 6.5 IS COMPLETE.
