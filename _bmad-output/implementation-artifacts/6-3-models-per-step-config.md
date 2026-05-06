---
status: done
story_id: '6.3'
story_key: 6-3-models-per-step-config
epic: '6'
title: '`models:` Per-Step Config'
created: '2026-05-05'
last_updated: '2026-05-05T10:20:42Z'
priority: high
estimated_effort: S
fr_coverage:
  - FR36     # PRIMARY — `models:` per step (architecture line 1366: src/schemas/config.ts + src/dispatch/generate-spec.ts)
  - FR16     # PRIMARY — dispatch-spec authored by `src/dispatch/generate-spec.ts`; Story 6.3 wires `model` from config
  - FR18     # PRIMARY — transcript writer logs the model on the dispatch line for audit trail
  - FR54     # PRIMARY — info() stderr log line includes model (single-line, no `console.*`)
  - FR34     # SECONDARY — config layer feeds the dispatcher (project > user > defaults)
nfr_coverage:
  - NFR-R1   # PRIMARY — strict Zod validation rejects malformed `models:` at load time (Story 6.1 baseline; Story 6.3 may apply `.strict()` per I-38)
  - NFR-R6   # PRIMARY — Zod-validated models on every read via `ModelsSchema = z.record(z.string(), ModelSchema)`
  - NFR-S1   # main-thread output discipline (info() stderr only; no `console.log`)
  - NFR-M2   # actionable-error contract — invalid model values surface single-line ConfigError at LOAD time (Story 6.1 already wired; this story adds tests)
  - NFR-M3   # schema-versioning + defence-in-depth Zod parse on dispatch-spec
ar_coverage:
  - AR41     # PRIMARY — boundary graph (`src/dispatch/` higher-tier — allowed imports unchanged: ../errors, ../schemas/dispatch-spec, ../schemas/state, ../io/log, ../io/atomic-write, ../io/paths)
  - AR42     # PRIMARY — Zod schema-first (ModelSchema enum is source-of-truth; Story 6.3 may add `.strict()` to ModelSchema-related schemas per I-38 forward-tracker)
  - AR9      # PRIMARY — AR9 stdout JSON-line invariant unchanged; model field already in DispatchSpecV1Schema (Story 1.5 + Story 2.2)
  - AR21     # PRIMARY — error UX shape (single-line actionable hint inherited from Story 6.1 ConfigError on invalid model)
  - AR22     # PRIMARY — actionable-hint regex /^.*(Run|See|Try|Check) /
  - AR33     # PRIMARY — async function; throws StepperError subclasses; no `console.*`; no `process.exit`
  - AR20     # type-alias chain (Models inferred from ModelsSchema; Model from ModelSchema)
  - AR34     # slash-command markdown protocol unchanged (Task tool model parameter caveat documented)
  - AR8      # lock-free top-tier preserved (run.ts still pure-read; ZERO state.yaml writes)
deps:
  - story: '6.1'
    reason: 'PRIMARY — `loadConfig()` produces typed `Config` with `config.models` (closed-shape `ModelsSchema = z.record(z.string(), ModelSchema)` at `src/schemas/config.ts:208-216`; `ModelSchema = z.enum(["sonnet", "opus", "haiku"])` at `src/schemas/config.ts:208`). Story 6.1 SDR I-24 PRIMARY HONOURED here: Story 6.3 model dispatcher uses `config.models[step] ?? "sonnet"` default. Story 6.1 inputs to wire: (a) `loadConfig()` exposes `Config.models` as Models record (default `{}`); (b) `src/schemas/config.ts` exports `ModelSchema` + `ModelsSchema` + `Model` + `Models` types; (c) `Config.models` is REQUIRED with default `{}` (Story 6.1 ConfigV1Schema: `models: ModelsSchema.default({})`); (d) NO loader-API change needed for Story 6.3 (Story 6.1 SDR I-24 verbatim).'
  - story: '2.2'
    reason: 'PRIMARY — `buildDispatchSpec()` orchestrator at `src/dispatch/generate-spec.ts`. Story 2.2 ALREADY shipped the `modelOverride?: string` field on `DispatchSpecInput` at `src/dispatch/types.ts:55` AND the default-with-override semantic at `src/dispatch/generate-spec.ts:196` (`model: input.modelOverride ?? "sonnet"`). The `DispatchSpecV1Schema.model: z.string()` field at `src/schemas/dispatch-spec.ts:30` accepts any string (intentional v0.1 open shape — Story 6.3 does NOT tighten the dispatch-spec schema; the validation is at the config-load layer via `ModelSchema` enum). Story 6.3 wires `config.models[stepName]` as the source for `modelOverride`. ZERO schema mutation to dispatch-spec.ts; ZERO mutation to generate-spec.ts internal logic — only the CALLER (next/run.ts + loop/run.ts) selects `modelOverride` from config.'
  - story: '2.5'
    reason: 'PRIMARY — transcript module group (`src/runs/`). Story 2.5 ALREADY shipped `model: string | null` in `TranscriptInput` at `src/runs/types.ts:39` AND the JSON run-log `RunLogV1Schema.model: z.string().nullable().optional()` at `src/schemas/run-log.ts:28` AND `buildRunLog()` already pulls `input.model` at `src/runs/build-run-log.ts:47`. The CURRENT GAP: `renderTranscriptMarkdown()` at `src/runs/render-markdown.ts:69-127` does NOT render the `model` field (the markdown does NOT have a "Model" line in its 7-section output). Story 6.3 EXTENDS the markdown renderer to include the model on the dispatch metadata header per AC-3 ("Stepper logs the model on dispatch line so the user can audit which model handled each step"). The JSON run log already records `model`; only the MARKDOWN side needs the wire-up. The verify-and-advance.ts caller at `src/commands/next/verify-and-advance.ts:1780` already threads `model: args.dispatchSpec.model ?? null` — no caller mutation needed.'
  - story: '6.2'
    reason: 'PATTERN — most-recent Story 6.x precedent for "narrowed sub-schema + runner-side wiring + transcripts/docs refresh". Story 6.2 added `.strict()` to `OverrideEntrySchema` per OQ-4 forward-tracker I-38 — Story 6.3 may apply `.strict()` to `BudgetSchema` (Story 6.4) but NOT to `ModelSchema` (`z.enum` is already strict on its own — extra `.strict()` is meaningless on enums). Story 6.2 also extended `RunNextOptions.config` + `LoopOpts.config` + `loadConfigOverride` seam — Story 6.3 REUSES the SAME seam (already typed via `Config.models` from Story 6.1). NO NEW seam fields; NO type-level changes to opts.config beyond what 6.1 already provided. Story 6.2 SDR forward-trackers I-34/I-35/I-36/I-37/I-38 all CARRIED forward unchanged.'
  - story: '1.2'
    reason: 'PRIMARY — errors-registry CI gate + ConfigError class with hintOverride seam. Story 6.3 ships ZERO new error classes — REUSES existing `ConfigError` raised at the LOADER layer (Story 6.1) for invalid `models:` shapes. The CI gate at src/errors.test.ts (with the Story 5.6 single-line constraint test + Story 6.1 multi-instance sweep + Story 6.2 edge-pointing instances) automatically covers any ConfigError instance. Registry stays at 17 codes.'
  - story: '1.5'
    reason: 'PATTERN — schemas/migrations skeleton. Story 1.5 + 6.1 established `ModelSchema = z.enum(["sonnet", "opus", "haiku"])` at `src/schemas/config.ts:208` (closed enum union — already STRICT by construction; no `.strict()` needed). Story 6.3 EXTENDS the schema MINIMALLY OR NOT AT ALL: the enum is already locked to 3 values. The CONFIRMED final shape for ModelSchema remains `z.enum(["sonnet", "opus", "haiku"])`. ZERO breaking changes for existing fixtures. Per I-38 forward-tracker: `.strict()` on a `z.enum` is a no-op — the enum already rejects unknown values; no schema-side change needed. The `.strict()` discipline applies to `z.object` schemas (Stories 6.4 BudgetSchema / 6.5 VerifierConfigSchema), NOT enums.'
  - story: '1.3'
    reason: 'PRIMARY — io/log.ts (the `info` helper). Story 6.3 EXTENDS the existing `info("dispatch: built spec for step ${stepName} at ${dispatchSpecPath}")` line at `src/dispatch/generate-spec.ts:240-242` to ALSO include the model, e.g., `info("dispatch: built spec for step ${stepName} (model ${model}) at ${dispatchSpecPath}")`. AR9 stdout invariant unchanged (info() routes to stderr per Story 1.3 + FR54). AC-3 mandates "logs the model on dispatch line" — this is the canonical dispatch line.'
  - story: '6.4'
    reason: 'CROSS-STORY COORDINATION — Story 6.4 (`budgets:` per-step config) is INDEPENDENT of Story 6.3 (different config sub-schema; different field on dispatch-spec — `budget` vs `model`). Both stories follow the SAME pattern: read config sub-record by stepName + thread into buildDispatchSpec(). Story 6.3 produces ZERO forward-trackers for 6.4 beyond the Story 6.1/6.2 baseline (I-25). Story 6.3 may produce a NEW shared-helper forward-tracker if the look-up convention `config.models[stepName] ?? defaults.model` is generalisable (see I-39 — TBD).'
  - story: '6.5'
    reason: 'CROSS-STORY COORDINATION — Story 6.5 (`verifiers:` per-step config override) is INDEPENDENT.'
  - story: '6.6'
    reason: 'CROSS-STORY COORDINATION — Story 6.6 (telemetry opt-in collection) is INDEPENDENT — but the `model` field is part of TelemetryRecordV1Schema closed-set (architecture line 1664). Story 6.3 sources the field from config; Story 6.6 will record it.'
  - story: '2.4'
    reason: 'CONSUMER — `src/commands/next/run.ts` (Story 2.4 lock-free runner) calls `buildDispatchSpec({ stepName, state, persona, ... })` at the canonical happy-path site (run.ts:2042-2057). After Story 6.3, the runner ADDITIONALLY threads `modelOverride: opts.config?.models?.[nextStep.name]` into the `buildDispatchSpec()` call (defaults to `undefined` → buildDispatchSpec uses `"sonnet"`). The wiring is a TWO-LINE change at the existing call site PLUS one line at the dry-run preview message (run.ts:2018-2021) so the preview reflects the configured model. Same applies to `src/commands/loop/run.ts` (Story 4.1+) — same pattern, via the productionRunNextFn closure.'
  - story: '5.6'
    reason: 'PATTERN — `opts.config` seam frozen. Story 5.6 froze the seam at LoopOpts + RunNextOptions + RunVerifyAndAdvanceOptions; Story 6.1 + 6.2 extended with config.overrides; Story 6.3 reads from THE SAME seam — `opts.config?.models?.[stepName]`. ZERO seam mutation. Story 5.6 OQ-9 confirmed (registry stays at 17 across Epic 6).'
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/implementation-artifacts/6-1-bmad-stepper-config-yaml-schema-loader.md
  - _bmad-output/implementation-artifacts/6-2-dag-overrides-block.md
  - _bmad-output/implementation-artifacts/2-2-dispatch-spec-generator.md
  - _bmad-output/implementation-artifacts/2-5-markdown-transcript-json-run-log-writers.md
  - _bmad-output/implementation-artifacts/sprint-status.yaml
  - _bmad-output/implementation-artifacts/epic-5-retrospective.md
  - _bmad-output/implementation-artifacts/epic-4-retrospective.md
  - .bmad-stepper/state.yaml
  - .bmad-stepper/config.yaml
  - src/schemas/config.ts
  - src/schemas/config.test.ts
  - src/schemas/dispatch-spec.ts
  - src/schemas/run-log.ts
  - src/dispatch/generate-spec.ts
  - src/dispatch/generate-spec.test.ts
  - src/dispatch/types.ts
  - src/dispatch/emit.ts
  - src/dispatch/index.ts
  - src/runs/render-markdown.ts
  - src/runs/render-markdown.test.ts
  - src/runs/build-run-log.ts
  - src/runs/types.ts
  - src/runs/write-step.ts
  - src/config/load.ts
  - src/config/index.ts
  - src/config/defaults.ts
  - src/errors.ts
  - src/errors.test.ts
  - src/io/log.ts
  - src/commands/next/run.ts
  - src/commands/next/run.test.ts
  - src/commands/loop/run.ts
  - src/commands/loop/run.test.ts
  - src/commands/next/verify-and-advance.ts
  - commands/bmad-loop.md
  - commands/bmad-next.md
  - docs/configuration.md
---

# Story 6.3: `models:` Per-Step Config

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper user (BMAD Upgrade journey),
I want `models: { code-review: opus, dev-story: sonnet }` to pin specific Claude models per step,
So that I can route expensive analysis to Opus and bulk implementation to Sonnet, the dispatch-spec.json's `model` field reflects my choice (defaulting to `sonnet`), and the dispatch line / transcript log shows which model handled each step for audit purposes.

## Context Summary

This is the **THIRD STORY of Epic 6** and lands the **`models:` per-step config consumer at the dispatch-spec generator + transcript audit trail**. Story 6.1 shipped the `loadConfig()` file loader + the closed-enum `ModelSchema = z.enum(["sonnet", "opus", "haiku"])` at `src/schemas/config.ts:208` AND the `ModelsSchema = z.record(z.string(), ModelSchema)` at `src/schemas/config.ts:213`. Story 2.2 ALREADY shipped (a) the `modelOverride?: string` field on `DispatchSpecInput` at `src/dispatch/types.ts:55`, (b) the default-with-override semantic at `src/dispatch/generate-spec.ts:196` (`model: input.modelOverride ?? "sonnet"`), and (c) the `DispatchSpecV1Schema.model: z.string()` field at `src/schemas/dispatch-spec.ts:30`. Story 2.5 shipped the JSON run-log `model` field at `src/schemas/run-log.ts:28` AND the markdown transcript's `TranscriptInput.model` field at `src/runs/types.ts:39`. **Story 6.3 is therefore primarily a WIRING exercise**: thread `config.models[stepName]` from the loaded `opts.config` through `buildDispatchSpec.modelOverride`, ensure the dispatch info-log line includes the model, and add a model-line to the markdown transcript renderer.

Concretely the wiring is:

1. **AC-1 (`config.models[stepName]` → dispatch-spec.json's `model` field; default `"sonnet"`)**:
   - At the `buildDispatchSpec({...})` call site in `src/commands/next/run.ts:2042-2057` (the canonical happy-path), thread `modelOverride: opts.config?.models?.[nextStep.name]` as a NEW field. When `opts.config?.models?.[nextStep.name]` is `undefined`, the existing `?? "sonnet"` fallback at `generate-spec.ts:196` fires.
   - Also thread the same `modelOverride` at the dry-run preview message at `run.ts:2008-2023` so the preview reflects the configured model (currently hardcoded to `"sonnet"` in the preview string per the inline comment at `run.ts:1999-2001`).
   - Same threading at `src/commands/loop/run.ts` via the productionRunNextFn closure.

2. **AC-2 (slash-command markdown passes model parameter to Task tool, where supported)**:
   - The slash-command markdown at `commands/bmad-next.md:96-99` currently invokes `Task(agent = <jsonLine.agent>, prompt = "staging/<jsonLine.runId>/dispatch-spec.json")` WITHOUT an explicit `model` parameter. Per AC-2 verbatim ("the dispatch-spec consumer (slash-command markdown) passes the model parameter through to the Task tool (where supported)"), the markdown is EXTENDED with a Task `model` parameter sourced from the dispatch-spec.json's `model` field. The "where supported" caveat acknowledges Claude Code's Task tool may not always honour the `model` parameter at runtime — this is documented in the markdown as a forward-compat note (Layer 1 forwards what it can; runtime may reject or accept silently). See OQ-2 below for the documented stance.
   - Same extension at `commands/bmad-loop.md` (Story 4.1+ established the analogous Task invocation block).

3. **AC-3 (Stepper logs the model on dispatch line)**:
   - Layer 2 stderr log line at `src/dispatch/generate-spec.ts:240-242` is EXTENDED to include the model: `info(\`dispatch: built spec for step ${stepName} (model ${model}) at ${dispatchSpecPath}\`)`. Single-line, FR54 stderr discipline preserved.
   - Markdown transcript renderer at `src/runs/render-markdown.ts:69-127` is EXTENDED with a NEW dispatch metadata header that includes `Model: <model-name>` between the existing Section 1 header and Section 2 inputs. The exact placement: a new section "## Dispatch metadata" inserted after the H1 header (Section 1) and before "## Inputs" (Section 2). Per OQ-3 below the renderer also surfaces persona + budget + phase in the same header to match the architecture §P5 lines 793-813 worked example shape. Backwards-compat: existing tests at `src/runs/render-markdown.test.ts` are extended (not replaced) to assert the NEW section is present.
   - JSON run-log at `src/runs/build-run-log.ts:47` ALREADY records `model: input.model` (Story 2.5 baseline) — verified at `src/schemas/run-log.ts:28`. NO mutation needed.

The runners (`src/commands/next/run.ts` + `src/commands/loop/run.ts`) thread `opts.config?.models?.[stepName]` once Story 6.1's `loadConfig()` is in the call chain (already wired). This is the canonical Story 6.1 SDR I-24 deliverable: ZERO loader-API change for Story 6.3; consumption through the typed `Config.models` field.

### What is in scope (Story 6.3)

1. **`ModelSchema` schema-side review (NO code change)** — `src/schemas/config.ts:208` already declares `ModelSchema = z.enum(["sonnet", "opus", "haiku"])`. The closed enum already rejects unknown values at parse time (Story 6.1 baseline). Per I-38 forward-tracker (Story 6.2): `.strict()` is meaningless on `z.enum` (enums are already strict by construction). NO change to the schema. Story 6.3 only ADDS test density on the existing schema (positive + negative tests for the 3 valid values + 1 invalid value).

2. **`buildDispatchSpec.modelOverride` consumer wiring** — at `src/commands/next/run.ts:2042-2057`, thread `modelOverride: opts.config?.models?.[nextStep.name]` (typed via `Models` from `src/schemas/config.ts:216`). When undefined (no per-step config), the existing fallback at `generate-spec.ts:196` (`?? "sonnet"`) fires. NO mutation to `generate-spec.ts` internals.

3. **Dry-run preview message reflects configured model** — at `src/commands/next/run.ts:2018-2021`, replace the hardcoded `"sonnet"` substring in the preview message (currently `\`${persona} (sonnet, 60k context, 5min timeout)\``) with the resolved model: `\`${persona} (${resolvedModel}, 60k context, 5min timeout)\`` where `resolvedModel = opts.config?.models?.[nextStep.name] ?? "sonnet"`. Cross-story coordination: Story 6.4's `budgets:` will similarly replace the hardcoded `60k context, 5min timeout` substrings — Story 6.3 only handles the model substring; the budget substring remains hardcoded for Story 6.4 to address. The inline comment at `run.ts:1999-2001` (which says "Stories 6.3 + 6.4 (`models:` + `budgets:` per-step config): v0.1 hardcodes `model: \"sonnet\"`...") is UPDATED to reflect Story 6.3's resolution: `models:` is now read from config; `budgets:` remains forward-deferred to Story 6.4.

4. **Loop runner threading** — at `src/commands/loop/run.ts` (the productionRunNextFn closure that wraps the runNext call), the closure already forwards `opts.config` through `RunNextOptions.config`; the wiring change at next/run.ts therefore propagates automatically. NO additional change at loop/run.ts beyond a regression test asserting that `opts.config.models` flows through.

5. **Layer 2 dispatch info-log includes model** — at `src/dispatch/generate-spec.ts:240-242`, extend the existing `info()` line to include the model: `info(\`dispatch: built spec for step ${input.stepName} (model ${dispatchSpec.model}) at ${dispatchSpecPath}\`)`. Reads from `dispatchSpec.model` (the validated literal post-Zod parse). Single-line, FR54 stderr discipline preserved. AR21 actionable-hint regex N/A here (this is a progress log, not an error hint).

6. **Markdown transcript renderer extended with dispatch metadata header** — at `src/runs/render-markdown.ts`, ADD a NEW Section 2 "## Dispatch metadata" between Section 1 (H1 header) and the existing Section 2 "## Inputs" (renumbered to Section 3). The new section includes `Model: <model-name>`, `Persona: <persona-name>`, `Phase: <phase-name>`, `Budget: <contextTokens> tokens / <timeoutMs/1000>s timeout` — sourced from the existing `TranscriptInput.model | persona | phase | budget` fields (already populated by `verify-and-advance.ts:1780`). Per OQ-3 below, the new section is OPTIONAL — when fields are `null`, the section emits "(not recorded)" placeholders to preserve idempotent rendering. The total section count grows from 7 to 8 (renumber 2→3, 3→4, ..., 7→8). All existing tests at `render-markdown.test.ts` are EXTENDED (not replaced) to assert the new section's presence.

7. **Slash-command markdown extends Task invocation with `model` parameter (where supported)** — at `commands/bmad-next.md:92-100` (and the analogous block in `commands/bmad-loop.md`), extend the Task pseudo-call from:
   ```
   Task(
     agent  = <jsonLine.agent>,
     prompt = "staging/<jsonLine.runId>/dispatch-spec.json"
   )
   ```
   to:
   ```
   Task(
     agent  = <jsonLine.agent>,
     prompt = "staging/<jsonLine.runId>/dispatch-spec.json",
     model  = <dispatchSpec.model>     # read from dispatch-spec.json's model field; "sonnet" default
   )
   ```
   With a NEW caveat paragraph documenting the "where supported" semantics: "If the Claude Code Task tool runtime does not honour the `model` parameter (e.g., on a future runtime change or a bound persona that cannot accept the parameter), the runtime falls back to its default behaviour. Stepper still records the configured model in the dispatch-spec.json + transcript for audit purposes — the configured model is the user's INTENT; runtime acceptance is best-effort." See OQ-2 for the documented stance.

8. **Tests** — colocated `src/dispatch/generate-spec.test.ts` extension + `src/runs/render-markdown.test.ts` extension + `src/schemas/config.test.ts` extension + `src/commands/next/run.test.ts` extension + `src/commands/loop/run.test.ts` extension:
   - **MOD_63_SCHEMA_***: AC-1 — `ModelSchema.parse("sonnet")`/`"opus"`/`"haiku"` succeed; `ModelSchema.parse("gpt-4")` throws Zod error; `ModelSchema.parse(42)` throws Zod error. Parametric over the 3 valid values + 2 invalid examples.
   - **MOD_63_MODELS_RECORD_***: `ModelsSchema.parse({ "dev-story": "sonnet", "code-review": "opus" })` succeeds; `ModelsSchema.parse({ "dev-story": "haiku" })` succeeds; `ModelsSchema.parse({ "dev-story": "claude-3" })` throws Zod error with `dev-story` in the issue path; `ModelsSchema.parse({})` succeeds (empty record).
   - **MOD_63_DISPATCH_DEFAULT_***: AC-1 default — `buildDispatchSpec({ stepName: "dev-story", state, persona: "dev" })` (no `modelOverride`) → `result.dispatchSpec.model === "sonnet"`. (Already covered by existing `generate-spec.test.ts:112-119`; Story 6.3 adds explicit AC-pointing test.)
   - **MOD_63_DISPATCH_OVERRIDE_***: AC-1 override — `buildDispatchSpec({ ..., modelOverride: "opus" })` → `result.dispatchSpec.model === "opus"`. (Already covered by `generate-spec.test.ts:135-143`; Story 6.3 adds explicit AC-pointing test.)
   - **MOD_63_DISPATCH_LOG_***: AC-3 — `info()` log line at `generate-spec.ts:240-242` includes the model substring (e.g., `/dispatch: built spec for step .* \(model (sonnet|opus|haiku)\) at .*/`). Test seam: the existing `info()` mock pattern in `src/dispatch/generate-spec.test.ts` (if any) — OR add a new test that captures stderr via `Bun.write` redirection / process spy. See OQ-4 below for the test strategy.
   - **MOD_63_RUN_***: AC-1 wiring — at `src/commands/next/run.test.ts`, supply `opts.config = { ..., models: { "bmad-create-story": "opus" } }` via the existing test seam. Verify `result.dispatchSpec.model === "opus"`. Symmetric test asserting absent config.models[stepName] → `model === "sonnet"`.
   - **MOD_63_RUN_DRYRUN_***: AC-1 dry-run — supply `opts.config = { ..., models: { "bmad-create-story": "opus" } }` + `--dry-run` flag → preview message contains `(opus, 60k context, 5min timeout)` (NOT `sonnet`).
   - **MOD_63_LOOP_***: same pattern at `src/commands/loop/run.test.ts` — verify `loadConfigOverride` threads `models` through to runNext.
   - **MOD_63_TRANSCRIPT_MD_***: AC-3 markdown — `renderTranscriptMarkdown({ ..., model: "opus", ... })` includes the substring `Model: opus` in the dispatch metadata section. Symmetric test for `model: null` → `Model: (not recorded)`.
   - **MOD_63_TRANSCRIPT_JSON_***: AC-3 JSON — `buildRunLog({ ..., model: "opus", ... })` returns `{ ..., model: "opus", ... }` (already covered by Story 2.5 baseline; Story 6.3 adds explicit AC-pointing test).
   - **MOD_63_LOAD_INVALID_***: AC-2 (load-time error) — fixture with `models: { "dev-story": "claude-4" }` in bmad-stepper.config.yaml → `loadConfig()` throws ConfigError exit 2 with single-line hint pointing at `models.dev-story`. (Already covered by Story 6.1 CFG_LOAD_INVALID_*; Story 6.3 adds explicit MODEL-specific assertion.)

9. **Documentation refresh** — minor update to `docs/configuration.md` `models:` section (currently lines 214-224 per Story 6.1 AC-3 verification):
   - Note that Story 6.3 wires `config.models[stepName]` through to dispatch-spec.json's `model` field with `"sonnet"` default.
   - Note the AC-2 caveat: the slash-command markdown forwards the model to the Task tool's `model` parameter "where supported" — runtime acceptance is best-effort.
   - Cross-link to Story 6.3 + architecture line 781 + dispatch-spec.json shape at architecture lines 793-813.
   - Forward-tracker section: remove I-24 (Story 6.3 now CLOSED); add I-39 if a shared `getStepConfig(config, stepName, key, default)` helper would benefit Stories 6.4 + 6.5 (TBD per OQ-5).

### Cross-story coordination preserved

- **Story 6.1 SDR I-24 PRIMARY HONOURED** — Story 6.3 consumes `config.models[step]` directly via the typed `Config.models` field. ZERO loader-API change for Story 6.3.
- **Story 2.2 dispatch-spec generator UNCHANGED** — `buildDispatchSpec.modelOverride` ALREADY exists; Story 6.3 only changes the CALLERS to populate `modelOverride` from config. ZERO mutation to `src/dispatch/generate-spec.ts` internal logic; ONE single-line extension to the `info()` log line per AC-3.
- **Story 2.5 transcript writers UNCHANGED at the JSON layer** — `RunLogV1Schema.model` and `buildRunLog()` already record `model`. The MARKDOWN layer (`renderTranscriptMarkdown`) is EXTENDED with the dispatch metadata header per AC-3 — single section addition; backwards-compat for the existing 7-section output (renumbered to 8 sections; existing tests asserting section presence are extended, not replaced).
- **Story 5.6 + 6.1 + 6.2 `opts.config` seam UNCHANGED** — Story 6.3 reads from the same `opts.config` field that Story 5.6 froze (LoopOpts + RunNextOptions + RunVerifyAndAdvanceOptions); Story 6.1 typed via `Config`; Story 6.2 added `overrides` consumer. Story 6.3 reuses the SAME seam with no mutation to its shape.
- **Errors registry HELD AT 17** — Story 6.3 ships ZERO new error classes; reuses `ConfigError` from Story 6.1's loader (invalid model values surface there; Story 6.3 dispatchers see only validated values).
- **Schema migration registry HELD AT v1** — ZERO mutation to `ModelSchema` / `ModelsSchema` / `DispatchSpecV1Schema` / `RunLogV1Schema`. NO `schemaVersion` bump.

### What is NOT in scope (deferred)

- **Tightening `DispatchSpecV1Schema.model` from `z.string()` to `ModelSchema` enum** — DEFERRED. The dispatch-spec.json file is INTERNAL; tightening the schema would couple `src/schemas/dispatch-spec.ts` to `src/schemas/config.ts` (currently independent foundational siblings). Story 6.3 keeps the dispatch-spec.json's `model: z.string()` as v0.1 open shape; the validation is at the LOADER (config) layer per AR42. Forward-tracker I-40 records the option.
- **`models: { "*": "opus" }` wildcard step matching** — DEFERRED. v0.1 supports exact-step-id keys only (e.g., `models: { "bmad-dev-story": "opus" }`). Wildcard support is a Story 6.x extension.
- **Provider-specific models beyond Anthropic Claude tiers** — out of scope per architecture line 781 (`{ stepName: "sonnet" | "opus" | "haiku" }`). GPT, Gemini, etc. are explicitly excluded for v0.1.
- **`--model <model>` CLI flag override** for one-off model overrides — DEFERRED (Story 6.x). Users configure via `bmad-stepper.config.yaml` for now.
- **Telemetry collection of model field** — DEFERRED to Story 6.6 per architecture line 1664 (`TelemetryRecordV1Schema` closed-set includes `model`); Story 6.3 sources the field, Story 6.6 records to JSONL telemetry.
- **Model-specific budget/timeout adjustments** (e.g., "Opus needs 2x timeout") — DEFERRED. Per-step `budgets:` lands in Story 6.4 (independent path).
- **Model-specific verifier or persona pairing** — DEFERRED. Personas (Story 1.11 + 6.1) and verifiers (Story 2.1 + 6.5) are independent of model selection.

### Architectural challenges resolved here

**Architectural decision — NO change to `ModelSchema` or `DispatchSpecV1Schema` (per OQ-1)**: `ModelSchema = z.enum(["sonnet", "opus", "haiku"])` is already closed by construction. `DispatchSpecV1Schema.model: z.string()` is intentionally open at the dispatch-spec.json file boundary (the validation is at the LOADER per AR42). Tightening either schema would couple the dispatch-spec generator to the config schema — currently independent foundational siblings under `src/schemas/`. Story 6.3 PRESERVES the boundary; the wiring happens at the TOP-tier consumer (`src/commands/next/run.ts`) where the runner reads `opts.config?.models?.[stepName]` (a typed `Models[string]`) and threads it via `modelOverride`. Forward-tracker I-40 records the option to tighten `DispatchSpecV1Schema.model` in a future Story 6.x cleanup.

**Architectural decision — Task tool `model` parameter pass-through is best-effort (per OQ-2)**: AC-2 verbatim says "the dispatch-spec consumer (slash-command markdown) passes the model parameter through to the Task tool (where supported)". The "where supported" caveat is documented in the markdown body as a forward-compat note: Layer 1 (slash-command markdown) forwards what it can; the Claude Code Task tool runtime may or may not honour the `model` parameter at runtime depending on the runtime version + the bound sub-agent's persona allowance. Stepper records the configured model in dispatch-spec.json + transcript for AUDIT purposes — the configured model is the user's INTENT; runtime acceptance is best-effort. This stance is consistent with architecture line 1660 (the AR9 stdout JSON-line protocol concretization) and Critical Gap Resolution 6 (token-count threading is best-effort — analogous semantic). The forward-compat note is part of the markdown body (NOT a runtime check at Bun side).

**Architectural decision — markdown transcript renderer adds Section 2 "## Dispatch metadata" (per OQ-3)**: AC-3 verbatim says "Stepper logs the model on dispatch line so the user can audit which model handled each step". The "dispatch line" reading is dual-channel: (a) Layer 2 stderr `info()` line (canonical dispatch line at the time of dispatch) AND (b) markdown transcript header (the user's audit trail in `runs/<ts>-<step>.log`). Story 6.3 extends BOTH channels to surface the model. The markdown extension adds a NEW Section 2 "## Dispatch metadata" — placed between the H1 header (Section 1) and the existing "## Inputs" (renumbered to Section 3). The new section also surfaces `Persona`, `Phase`, `Budget` from the existing `TranscriptInput` fields to match the architecture §P5 lines 793-813 worked example shape (the JSON run log already includes those fields; the markdown was incomplete per OQ-3 forward-tracker recovered from Story 2.5). Backwards-compat: existing tests at `render-markdown.test.ts` are EXTENDED (not replaced) to assert the new section's presence; the section count grows from 7 to 8 (renumber 2→3, 3→4, ..., 7→8 in test assertions where ordinals are referenced).

**Architectural decision — no schema-level `.strict()` on `ModelSchema` (per I-38 from Story 6.2 SDR)**: `.strict()` on `z.enum` is meaningless — enums are already strict by construction (any value not in the enum is rejected). The `.strict()` discipline I-38 forwards from Story 6.2 applies to `z.object` schemas (Stories 6.4 BudgetSchema / 6.5 VerifierConfigSchema), NOT enums. Story 6.3 thus honours I-38 trivially (no action required for `ModelSchema`).

**Architectural decision — log line single-line constraint (AR21+AR22)**: The extended `info()` line at `generate-spec.ts:240-242` is single-line by construction (template literal with no `\n`). AR22 actionable-hint regex (`/^.*(Run|See|Try|Check) /`) does NOT apply to progress logs (only to error hints); the extended log line is a dispatch progress log (info-tier), not an error hint. The single-line constraint is preserved for human-readability + log-aggregation friendliness.

**Architectural decision — slash-command markdown extension preserves AR9 + AR34 boundaries (per OQ-2)**: The Task pseudo-call extension at `commands/bmad-next.md:92-100` adds ONE new line (the `model = <dispatchSpec.model>` parameter) WITHOUT changing the AR9 stdout JSON-line protocol (run.ts continues to emit the same `{ action, runId, agent, exitCode, lastAttempted? }` shape) AND WITHOUT changing the AR34 slash-command markdown protocol structure (frontmatter shape unchanged; body steps numbered the same). The dispatch-spec.json is the SOURCE of the model value (already authored by buildDispatchSpec at AR9-emit time); the markdown body reads it at consumption time. This is the SAME single-source-of-truth pattern that Story 2.2 established for the agent name (the markdown reads `<jsonLine.agent>` from the AR9 line at runtime).

### Concretely, Story 6.3 produces

- **MODIFIED file 1**: `src/schemas/config.test.ts` — adds 4-6 MOD_63_SCHEMA_* tests covering `ModelSchema` positive/negative + `ModelsSchema` record positive/negative. Net additions: ~40 LoC.
- **MODIFIED file 2**: `src/dispatch/generate-spec.ts` — single-line extension to the `info()` log line at line 240-242 to include the model substring `(model ${dispatchSpec.model})`. Net additions: ~2 LoC (1 modified, 1 JSDoc note).
- **MODIFIED file 3**: `src/dispatch/generate-spec.test.ts` — adds 1-2 MOD_63_DISPATCH_LOG_* tests asserting the log line includes the model. Reuses or extends any existing info() spy pattern. Net additions: ~30 LoC.
- **MODIFIED file 4**: `src/runs/render-markdown.ts` — adds Section 2 "## Dispatch metadata" with Model/Persona/Phase/Budget lines between Section 1 (H1) and existing Section 2 (renumbered to Section 3). Net additions: ~30 LoC.
- **MODIFIED file 5**: `src/runs/render-markdown.test.ts` — extends existing tests to assert the new "## Dispatch metadata" section's presence; adds 2-3 MOD_63_TRANSCRIPT_MD_* tests covering Model line + null fallback "(not recorded)". Net additions: ~80 LoC.
- **MODIFIED file 6**: `src/commands/next/run.ts` — threads `modelOverride: opts.config?.models?.[nextStep.name]` into the existing `buildDispatchSpec({...})` call; replaces the hardcoded `"sonnet"` substring in the dry-run preview message with the resolved model; updates the inline comment at lines 1999-2001 to reflect Story 6.3's resolution. Net additions: ~6 LoC.
- **MODIFIED file 7**: `src/commands/next/run.test.ts` — adds 2-3 MOD_63_RUN_* tests covering happy-path + dry-run preview + absent config.models[stepName] fallback. Net additions: ~80 LoC.
- **MODIFIED file 8**: `src/commands/loop/run.ts` — NO direct change (the `RunNextOptions.config` already flows through productionRunNextFn from Story 6.1 + 6.2). Verified via test only.
- **MODIFIED file 9**: `src/commands/loop/run.test.ts` — adds 1-2 MOD_63_LOOP_* tests asserting `opts.config.models` flows through to runNext. Net additions: ~40 LoC.
- **MODIFIED file 10**: `commands/bmad-next.md` — extends Task pseudo-call at lines 92-100 with `model = <dispatchSpec.model>` parameter + caveat paragraph documenting "where supported" semantics. Net additions: ~15 LoC.
- **MODIFIED file 11**: `commands/bmad-loop.md` — same extension as bmad-next.md at the analogous Task block. Net additions: ~15 LoC.
- **MODIFIED file 12**: `docs/configuration.md` — extends the `models:` section (lines 214-224) with Story 6.3 wiring note + AC-2 caveat + cross-links + forward-tracker update. Net additions: ~25 LoC.

ZERO NEW files. ZERO new error classes. ZERO mutations to: `src/errors.ts`, `src/migrations/config/index.ts`, `src/schemas/config.ts` (ModelSchema unchanged), `src/schemas/dispatch-spec.ts` (open `model: z.string()` preserved), `src/schemas/run-log.ts` (model field unchanged), `src/dag/*`, `src/state/*`, `src/failure-ux/*`, `src/config/*` (loader consumed unchanged), `src/runs/build-run-log.ts` (model field unchanged), `src/runs/types.ts` (model field unchanged), `src/runs/write-step.ts` (writer unchanged).

## Acceptance Criteria

The following are reproduced byte-identical from `_bmad-output/planning-artifacts/epics.md` lines 1187-1199:

**Given** `models:` config block
**When** dispatch-spec is generated
**Then** the dispatch-spec.json's `model` field is the configured value; default is `sonnet` if not configured
**And** the dispatch-spec consumer (slash-command markdown) passes the model parameter through to the Task tool (where supported)
**And** Stepper logs the model on dispatch line so the user can audit which model handled each step

## Tasks / Subtasks

- [x] 1. **Context — read all relevant files completely** (carry-over discipline from Stories 6.1 + 6.2)
  - [x] 1.1 Read `_bmad-output/implementation-artifacts/6-2-dag-overrides-block.md` — focus on (a) the Forward Action Items section (4 nits N-1/N-2/N-3/N-4 + 38 info I-1 through I-38; I-24 to Story 6.3 PRIMARY HONOURED here; I-33 sporadic flake at src/smoke/next.test.ts:374 NOT a regression; I-38 `.strict()` discipline applies to z.object NOT z.enum); (b) the SDR Quality Gates table baseline (1377/0/4649 across 70 files; errors registry 17); (c) the Story 6.2 close: `OverridesSchema` consumer wired at runner; transcript markdown unchanged.
  - [x] 1.2 Read `_bmad-output/implementation-artifacts/6-1-bmad-stepper-config-yaml-schema-loader.md` — focus on (a) Story 6.1 SDR I-24 verbatim ("ModelsSchema is now closed enum union (sonnet/opus/haiku); Story 6.3 model dispatcher uses config.models[step] with config.models[step] ?? 'sonnet' default"); (b) the loader's invalid-model error path at src/config/load.ts:213-224 (CorruptStateError → ConfigError + extractZodFieldPath + single-line hint); (c) docs/configuration.md `models:` section at lines 214-224.
  - [x] 1.3 Read `_bmad-output/implementation-artifacts/2-2-dispatch-spec-generator.md` — focus on (a) the `BuildDispatchSpecInput` shape including `modelOverride?: string`; (b) the `info()` log line at `generate-spec.ts:240-242`; (c) the `DispatchSpecV1Schema.model: z.string()` open-shape rationale (Story 6.3 keeps it open; tightening is a Story 6.x cleanup per I-40).
  - [x] 1.4 Read `_bmad-output/implementation-artifacts/2-5-markdown-transcript-json-run-log-writers.md` — focus on (a) the existing `TranscriptInput.model: string | null` field at `src/runs/types.ts:39`; (b) the markdown renderer's 7-section output at `src/runs/render-markdown.ts:69-127` (which Story 6.3 extends to 8 sections); (c) the `buildRunLog()` already wires `model: input.model` at `src/runs/build-run-log.ts:47`.
  - [x] 1.5 Read `_bmad-output/implementation-artifacts/epic-5-retrospective.md` — Recommendations item 3 (registry stability — ZERO new error classes per Epic 6 start) + item 6 (cross-story coordination via opts.config seam).
  - [x] 1.6 Read `src/schemas/config.ts` (327 lines) full pass — focus on (a) `ModelSchema` at lines 208-216 (3-value enum: sonnet/opus/haiku); (b) `ModelsSchema = z.record(z.string(), ModelSchema)` at line 213; (c) `Models` type alias at line 216.
  - [x] 1.7 Read `src/schemas/config.test.ts` (666 lines) full pass — recover the existing CFG_61_* test density for ModelSchema/ModelsSchema (or note absence — Story 6.1 may have only added 1-2 tests for ModelSchema; Story 6.3 fills the density gap).
  - [x] 1.8 Read `src/dispatch/generate-spec.ts` (245 lines) full pass — focus on (a) the `BuildDispatchSpecInput.modelOverride?: string` field; (b) the `model: input.modelOverride ?? "sonnet"` default-with-override semantic at line 196; (c) the `info()` log line at lines 240-242 (Story 6.3 extends).
  - [x] 1.9 Read `src/dispatch/generate-spec.test.ts` (479 lines) full pass — focus on (a) the existing model-default test at lines 112-119; (b) the existing modelOverride test at lines 135-143; (c) any info()/log-line spy pattern (use it for MOD_63_DISPATCH_LOG_* tests).
  - [x] 1.10 Read `src/runs/render-markdown.ts` (127 lines) full pass — focus on the 7-section output structure; identify the insertion point for the new "## Dispatch metadata" section (after the H1 at line 73, before "## Inputs" at line 77).
  - [x] 1.11 Read `src/runs/render-markdown.test.ts` (222 lines) full pass — recover the existing test patterns + section assertions; identify which tests reference section ordinals (renumbering may affect them).
  - [x] 1.12 Read `src/runs/build-run-log.ts` + `src/runs/types.ts` — confirm `model: string | null` is already wired; ZERO change needed.
  - [x] 1.13 Read `src/commands/next/run.ts` lines 1990-2090 — focus on (a) the dry-run preview message at lines 2008-2023 (the hardcoded "sonnet" substring at line 2020); (b) the buildDispatchSpec call at lines 2042-2057 (the wiring site); (c) the inline comment at lines 1999-2001 (which Story 6.3 updates to reflect resolution).
  - [x] 1.14 Read `src/commands/loop/run.ts` — locate the productionRunNextFn closure that wraps runNext (the wiring is automatic via RunNextOptions.config; no direct change needed; only a regression test).
  - [x] 1.15 Read `commands/bmad-next.md` lines 92-130 — focus on the Task pseudo-call at lines 96-99 (the model-parameter extension site).
  - [x] 1.16 Read `commands/bmad-loop.md` — locate the analogous Task pseudo-call block (Story 4.1+ established).
  - [x] 1.17 Read `docs/configuration.md` lines 214-224 — locate the existing `models:` section for the documentation refresh.

- [x] 2. **Schema test density — `ModelSchema` + `ModelsSchema` MOD_63_SCHEMA_* coverage**
  - [x] 2.1 MOD_63_SCHEMA_1: parametric — `ModelSchema.parse("sonnet")` / `"opus"` / `"haiku"` succeed.
  - [x] 2.2 MOD_63_SCHEMA_2: `ModelSchema.parse("gpt-4")` throws Zod error; the message includes the 3 valid values.
  - [x] 2.3 MOD_63_SCHEMA_3: `ModelSchema.parse(42)` (number) throws Zod error.
  - [x] 2.4 MOD_63_MODELS_RECORD_1: `ModelsSchema.parse({})` succeeds (empty record — backwards-compat for Story 6.1 fixtures).
  - [x] 2.5 MOD_63_MODELS_RECORD_2: `ModelsSchema.parse({ "dev-story": "sonnet", "code-review": "opus" })` succeeds.
  - [x] 2.6 MOD_63_MODELS_RECORD_3: `ModelsSchema.parse({ "dev-story": "claude-3" })` throws Zod error with `dev-story` in the issue path.
  - [x] 2.7 Verify all existing CFG_61_* tests pass unchanged (regression).

- [x] 3. **Dispatch generator log line extension**
  - [x] 3.1 Extend `src/dispatch/generate-spec.ts:240-242` from `info(\`dispatch: built spec for step ${input.stepName} at ${dispatchSpecPath}\`)` to `info(\`dispatch: built spec for step ${input.stepName} (model ${dispatchSpec.model}) at ${dispatchSpecPath}\`)`.
  - [x] 3.2 Single-line constraint preserved (template literal; no `\n`).
  - [x] 3.3 Update the JSDoc block above buildDispatchSpec (lines 26-44) to reference Story 6.3 + AC-3 (model on dispatch log line).

- [x] 4. **Dispatch generator tests — MOD_63_DISPATCH_* coverage**
  - [x] 4.1 MOD_63_DISPATCH_DEFAULT_1: AC-1 verbatim — `buildDispatchSpec({ stepName: "dev-story", state, persona: "dev" })` (no `modelOverride`) → `result.dispatchSpec.model === "sonnet"`. Cross-link to existing `it("uses default model 'sonnet' when no override is provided")` at line 112.
  - [x] 4.2 MOD_63_DISPATCH_OVERRIDE_1: AC-1 — `buildDispatchSpec({ ..., modelOverride: "opus" })` → `result.dispatchSpec.model === "opus"`. Cross-link to existing `it("honors modelOverride")` at line 135.
  - [x] 4.3 MOD_63_DISPATCH_LOG_1: AC-3 — assert that `info()` is called with a string matching `/dispatch: built spec for step .* \(model (sonnet|opus|haiku)\)/`. Test seam: spy on the `info` import (mock module pattern). Per OQ-4, the test approach is the SAME pattern that any existing log-line test uses — recover it from generate-spec.test.ts.
  - [x] 4.4 MOD_63_DISPATCH_LOG_2: AC-3 — symmetric: when `modelOverride: "opus"` → log line contains `(model opus)`.

- [x] 5. **Markdown transcript renderer — add "## Dispatch metadata" section**
  - [x] 5.1 At `src/runs/render-markdown.ts:73-77`, insert a NEW Section 2 "## Dispatch metadata" between the H1 header (line 73) and the existing "## Inputs" (line 77, renumbered to Section 3).
  - [x] 5.2 The new section emits:
    ```
    ## Dispatch metadata

    - Model: <input.model ?? "(not recorded)">
    - Persona: <input.persona ?? "(not recorded)">
    - Phase: <input.phase ?? "(not recorded)">
    - Budget: <input.budget ? `${budget.contextTokens} tokens / ${budget.timeoutMs/1000}s timeout` : "(not recorded)">
    ```
  - [x] 5.3 Insertion preserves trailing blank line + idempotent spacing.
  - [x] 5.4 Update the JSDoc block at lines 53-67 to reflect 8 sections (was 7); renumber the section list.

- [x] 6. **Markdown renderer tests — MOD_63_TRANSCRIPT_MD_* coverage**
  - [x] 6.1 MOD_63_TRANSCRIPT_MD_1: AC-3 — supply `TranscriptInput` with `model: "opus"` → output contains `Model: opus` between the H1 and "## Inputs".
  - [x] 6.2 MOD_63_TRANSCRIPT_MD_2: AC-3 — supply `model: "sonnet"` → output contains `Model: sonnet`.
  - [x] 6.3 MOD_63_TRANSCRIPT_MD_3: AC-3 — supply `model: null` → output contains `Model: (not recorded)`.
  - [x] 6.4 MOD_63_TRANSCRIPT_MD_4: regression — existing 7-section assertions are extended (renumbered to 8 sections); all original sections present with same content.
  - [x] 6.5 MOD_63_TRANSCRIPT_MD_5: AC-3 — symmetric for Persona/Phase/Budget lines (single test; verifies all 4 metadata lines render).

- [x] 7. **Wire `opts.config?.models?.[stepName]` → `buildDispatchSpec` at the runner call site**
  - [x] 7.1 At `src/commands/next/run.ts:2042-2057`, locate the existing `buildDispatchSpec({ stepName, state, persona, ... })` call. Add `modelOverride: opts?.config?.models?.[nextStep.name]` as a NEW field (use optional chaining; ZERO behaviour change when undefined — the existing `?? "sonnet"` fallback fires).
  - [x] 7.2 At `src/commands/next/run.ts:2008-2023`, replace the hardcoded `"sonnet"` substring at line 2020 with the resolved model: `const resolvedModel = opts?.config?.models?.[nextStep.name] ?? "sonnet"`. Update the preview message template literal accordingly.
  - [x] 7.3 At `src/commands/next/run.ts:1999-2001`, update the inline comment to reflect Story 6.3's resolution: change `Stories 6.3 + 6.4 (\`models:\` + \`budgets:\` per-step config): v0.1 hardcodes \`model: "sonnet"\`, \`contextTokens: 60_000\`, \`timeoutMs: 300_000\`` to `Story 6.3 (\`models:\` per-step config): \`model\` resolved from \`opts.config?.models?.[stepName] ?? "sonnet"\`. Story 6.4 (\`budgets:\` per-step config): v0.1 still hardcodes \`contextTokens: 60_000\`, \`timeoutMs: 300_000\``.
  - [x] 7.4 Verify ZERO upward imports added — `src/commands/` is top-tier and already imports `src/dispatch/` directly; no boundary change.

- [x] 8. **Runner tests — add MOD_63_RUN_* + MOD_63_LOOP_***
  - [x] 8.1 MOD_63_RUN_1: AC-1 — at `src/commands/next/run.test.ts`, supply `opts.config = { ..., models: { "bmad-create-story": "opus" } }` via the existing test seam (loadConfigOverride or direct opts.config pass). Verify `result.dispatchSpec.model === "opus"`.
  - [x] 8.2 MOD_63_RUN_2: AC-1 fallback — supply `opts.config = { ..., models: {} }` (empty) → `result.dispatchSpec.model === "sonnet"`.
  - [x] 8.3 MOD_63_RUN_DRYRUN_1: AC-1 dry-run — supply `opts.config = { ..., models: { "<step>": "opus" } }` + `args.dryRun = true` → preview message contains `(opus, 60k context, 5min timeout)` (NOT `sonnet`).
  - [x] 8.4 MOD_63_LOOP_1: at `src/commands/loop/run.test.ts`, supply `opts.config = { ..., models: { "<step>": "opus" } }` via the test seam → verify the threaded `runNext` call sees `opts.config.models`. (loop/run.ts itself has no direct change; this is a regression test asserting the seam flows through.)

- [x] 9. **Slash-command markdown — extend Task pseudo-call with `model` parameter**
  - [x] 9.1 At `commands/bmad-next.md:92-100`, extend the Task pseudo-call to include `model = <dispatchSpec.model>` (or equivalent natural-language directive). Add a caveat paragraph immediately below the Task block documenting "where supported" semantics per OQ-2.
  - [x] 9.2 At `commands/bmad-loop.md`, locate the analogous Task block (Story 4.1+ established) and apply the same extension.
  - [x] 9.3 The caveat paragraph language: "If the Claude Code Task tool runtime does not honour the `model` parameter (e.g., on a future runtime change or a bound persona that cannot accept the parameter), the runtime falls back to its default behaviour. Stepper still records the configured model in the dispatch-spec.json + transcript for audit purposes — the configured model is the user's INTENT; runtime acceptance is best-effort."

- [x] 10. **Documentation — `docs/configuration.md` models section refresh**
  - [x] 10.1 Locate the existing `models:` section (Story 6.1 produced this at lines 214-224).
  - [x] 10.2 Add a "### Wiring (Story 6.3)" sub-section noting:
    - `config.models[stepName]` is read by the runner and threaded into `buildDispatchSpec.modelOverride`.
    - When undefined (no per-step config), `buildDispatchSpec` falls back to `"sonnet"`.
    - The dispatch-spec.json's `model` field is recorded; the transcript markdown's "## Dispatch metadata" section records it for audit.
  - [x] 10.3 Add a "### Task tool model parameter (where supported)" sub-section documenting the OQ-2 caveat.
  - [x] 10.4 Cross-link to architecture line 781 (config schema) + architecture lines 793-813 (dispatch-spec.json shape) + Story 6.3 + commands/bmad-{loop,next}.md per single-source-of-truth.
  - [x] 10.5 Update the forward-tracker section to remove I-24 (Story 6.3 now CLOSED) and forward to Stories 6.4-6.6 still pending.

- [x] 11. **Quality gates — verify ALL green BEFORE finalising**
  - [x] 11.1 `bunx tsc --noEmit` exit 0.
  - [x] 11.2 `bun run check` (biome ci + tests) exit 0.
  - [x] 11.3 `bun test` baseline 1377/0/4649 across 70 files → expected 1377 + (~10-15 new) / 0 / 4649 + (~25-40 new). Snapshot final test counts AFTER the LAST `biome --write` pass (per N-3 discipline).
  - [x] 11.4 `bun test src/errors.test.ts` 15/0/249 (UNCHANGED — registry stays at 17).
  - [x] 11.5 `bun test src/dispatch/generate-spec.test.ts` baseline existing tests + (~2 new MOD_63_DISPATCH_LOG_*).
  - [x] 11.6 `bun test src/runs/render-markdown.test.ts` baseline existing tests + (~3-5 new MOD_63_TRANSCRIPT_MD_*).
  - [x] 11.7 `bun test src/schemas/config.test.ts` baseline 69 tests (Story 6.2 close: 32 CFG_61_* + 10 OVR_62_*) → +6 MOD_63_SCHEMA_* + MOD_63_MODELS_RECORD_*.
  - [x] 11.8 `bun test src/integration/escalate-actionable-hint.test.ts` 33/0/114 (UNCHANGED — sweep over all 17 error classes; no new ConfigError instances introduced).
  - [x] 11.9 `grep -c "extends StepperError" src/errors.ts` = 17 (UNCHANGED).
  - [x] 11.10 AR41 boundary verification: `grep "from \"\\.\\./schemas/dispatch-spec\"" src/dispatch/generate-spec.ts` returns exactly ONE match (existing import; no new boundary crossing).
  - [x] 11.11 Per-AC verification: AC-1 → MOD_63_DISPATCH_DEFAULT_*/OVERRIDE_*/MOD_63_RUN_*/MOD_63_RUN_DRYRUN_*/MOD_63_LOOP_*; AC-2 → docs review (commands/bmad-{loop,next}.md include the Task `model =` parameter line + caveat); AC-3 → MOD_63_DISPATCH_LOG_*/MOD_63_TRANSCRIPT_MD_*.

- [x] 12. **Frontmatter + final state**
  - [x] 12.1 Update story frontmatter: status: ready-for-dev → review (after dev complete).
  - [x] 12.2 Update sprint-status: 6-3-models-per-step-config: ready-for-dev → review (after dev complete) → done (after code-review).
  - [x] 12.3 ZERO mutations to: `src/errors.ts`, `src/migrations/config/index.ts`, `src/schemas/config.ts` (ModelSchema unchanged), `src/schemas/dispatch-spec.ts`, `src/schemas/run-log.ts`, `src/dag/*`, `src/state/*`, `src/failure-ux/*`, `src/config/*` (loader consumed unchanged), `src/runs/build-run-log.ts`, `src/runs/types.ts`, `src/runs/write-step.ts`.
  - [x] 12.4 Carry-over from Story 6.2 SDR: 4 inherited NITs N-1/N-2/N-3/N-4 + 38 inherited info I-1 through I-38. Honour I-24 as PRIMARY (this story's deliverable). Honour I-33 as inherited flake (NOT a Story 6.3 regression). Honour I-38 trivially (`.strict()` on z.enum is a no-op).

## Dev Notes

### Files being modified (UPDATE)

1. **`src/schemas/config.test.ts`** (current state: 666 lines; Story 6.1 added 32 CFG_61_*; Story 6.2 added 10 OVR_62_SCHEMA_* + 10 OVR_62_MODELS_/PHASE_REGISTRY_)
   - **What this story changes**: add ~6 MOD_63_SCHEMA_* / MOD_63_MODELS_RECORD_* tests covering ModelSchema enum positive/negative + ModelsSchema record positive/negative.
   - **What must be preserved**: all existing CFG_61_* + OVR_62_* tests pass unchanged.

2. **`src/dispatch/generate-spec.ts`** (current: 245 lines; Story 2.2 baseline)
   - **What this story changes**: extend the `info()` log line at lines 240-242 to include `(model ${dispatchSpec.model})` substring. Update JSDoc.
   - **What must be preserved**: ALL existing logic unchanged — the model field is already populated at line 196 from `input.modelOverride ?? "sonnet"`.

3. **`src/dispatch/generate-spec.test.ts`** (current: 479 lines; Story 2.2 baseline)
   - **What this story changes**: add 2 MOD_63_DISPATCH_LOG_* tests asserting log line model substring.
   - **What must be preserved**: existing model-default test at lines 112-119 + modelOverride test at lines 135-143 pass unchanged.

4. **`src/runs/render-markdown.ts`** (current: 127 lines; Story 2.5 baseline)
   - **What this story changes**: insert NEW Section 2 "## Dispatch metadata" between the H1 (Section 1) and "## Inputs" (renumbered to Section 3). The section emits Model/Persona/Phase/Budget lines.
   - **What must be preserved**: all 7 existing sections preserved with same content; only renumbering 2→3 ... 7→8. Trailing newline preserved.

5. **`src/runs/render-markdown.test.ts`** (current: 222 lines; Story 2.5 baseline)
   - **What this story changes**: add 3-5 MOD_63_TRANSCRIPT_MD_* tests + extend any existing tests that count sections (now 8 not 7).
   - **What must be preserved**: existing assertions on Section 1 (header) + Sections 3-8 (Inputs through Outcome) pass unchanged with renumbered ordinals.

6. **`src/commands/next/run.ts`** (current: top-tier; calls `buildDispatchSpec` at lines 2042-2057; dry-run preview at lines 2008-2023)
   - **What this story changes**: thread `modelOverride: opts?.config?.models?.[nextStep.name]` into the existing buildDispatchSpec() call; replace hardcoded "sonnet" in dry-run preview with resolved model; update inline comment at lines 1999-2001.
   - **What must be preserved**: Story 5.6 + 6.1 + 6.2 wiring (opts.config seam + import.meta.main loadConfig + opts.config.overrides threading); Story 1.9 + 2.4 lock-free skeleton.

7. **`src/commands/next/run.test.ts`** — add 2-3 MOD_63_RUN_* tests asserting model threading through dispatch-spec + dry-run preview.

8. **`src/commands/loop/run.test.ts`** — add 1 MOD_63_LOOP_* test asserting opts.config.models flows through productionRunNextFn.

9. **`commands/bmad-next.md`** (current: 29017 bytes; Story 2.7 baseline + Story 6.x updates)
   - **What this story changes**: extend Task pseudo-call at lines 92-100 with `model = <dispatchSpec.model>` parameter line + caveat paragraph documenting "where supported" semantics per OQ-2.
   - **What must be preserved**: AR9 stdout protocol unchanged; AR34 markdown structure unchanged; existing branching logic at lines 90-128 unchanged.

10. **`commands/bmad-loop.md`** (current: 56724 bytes; Story 4.1+ baseline)
    - **What this story changes**: same extension at the analogous Task block.
    - **What must be preserved**: existing loop semantics unchanged.

11. **`docs/configuration.md`** (current: 401 lines; Story 6.1 + 6.2 baseline; covers all 9 keys + overrides Phase enum)
    - **What this story changes**: extend the `models:` section (lines 214-224) with Story 6.3 wiring note + AC-2 caveat + cross-links + forward-tracker update.
    - **What must be preserved**: the canonical example; the worked 3-layer resolution example; cross-links to commands/bmad-{loop,next}.md; the overrides section (Story 6.2).

### Files being created (NEW)

ZERO NEW files. All work is incremental on existing modules. This is the SAME pattern as Stories 6.1 + 6.2 ("in-place wiring + test density + docs refresh"). Story 6.3 is the LIGHTEST Epic 6 story — the schema is already locked (closed enum), the dispatch generator already supports `modelOverride`, the JSON run log already records `model`. The only NEW surface is (a) Markdown "## Dispatch metadata" section and (b) the dispatch info-log model substring.

### State preserved

ZERO mutations to: `src/errors.ts` (registry stays at 17); `src/migrations/config/index.ts` (v1 unchanged); `src/schemas/config.ts` (ModelSchema unchanged); `src/schemas/dispatch-spec.ts` (open `model: z.string()` preserved); `src/schemas/run-log.ts` (model field unchanged); `src/dag/*`; `src/state/*`; `src/failure-ux/*`; `src/config/*` (Story 6.1 loader consumed unchanged via `opts.config?.models`); `src/runs/build-run-log.ts` (model already wired); `src/runs/types.ts` (model field already declared); `src/runs/write-step.ts` (writer unchanged); `src/dispatch/types.ts` (DispatchSpecInput.modelOverride already declared); `src/dispatch/emit.ts` (AR9 emit unchanged).

## Project Structure Notes

- **AR41 boundary preserved**: `src/dispatch/` higher-tier — allowed imports remain `../errors`, `../io/log`, `../io/atomic-write`, `../io/paths`, `../schemas/dispatch-spec`, `../schemas/state`, `./types`, Bun runtime, Node stdlib (`node:fs/promises`, `node:path`, `node:crypto`). Story 6.3 ADDS NO new imports. The runner-side wiring at `src/commands/next/run.ts` is the canonical AR41 directionality (top-tier consumes higher-tier).
- **AR42 schema-first**: Story 6.3 RELIES ON `ModelSchema = z.enum([...])` being closed-by-construction. ZERO new schema definitions; only consumer wiring.
- **AR8 lock-free top-tier**: run.ts is pure-read (no state.yaml writes); the dispatch info log line is stderr-only (FR54); the markdown transcript writer is invoked by `verify-and-advance.ts` (Story 2.5 + 2.6) under the held lock — Story 6.3 does NOT change that boundary.
- **AR21+22 errors registry held at 17**: ZERO new error classes. Story 6.3 ships ZERO new ConfigError instances (the loader's existing invalid-model-value path at `src/config/load.ts` already covers; Story 6.3 only ADDS test density).
- **AR9 stdout JSON line invariant**: emitDispatchAction unchanged. The dispatch-spec.json file (which contains the `model` field) is written by atomicWrite in Story 2.2; Story 6.3 only changes the SOURCE of `model` (config-derived vs hardcoded default).
- **AR34 slash-command markdown protocol**: Story 6.3 ADDS one parameter line + one caveat paragraph to bmad-next.md + bmad-loop.md. ZERO change to the AR34 structural protocol (frontmatter shape unchanged; body section ordering unchanged).

## Library / Framework Requirements

- **Bun 1.2.x runtime** — pinned per `package.json`. Story 6.3 uses no new Bun APIs.
- **Zod 3.x** — pinned per `package.json` (Story 1.5 baseline; Story 6.1 confirmed; Story 6.2 added .strict()). Story 6.3 USES the existing `z.enum(["sonnet", "opus", "haiku"])` and `z.record(z.string(), ModelSchema)` already declared in Story 6.1. NO new Zod methods or schema definitions.
- **TypeScript 5.x** — pinned per `package.json`. Story 6.3 uses optional chaining (`opts?.config?.models?.[stepName]`) and the existing `z.infer<typeof ModelsSchema>` type.
- **Biome** — pinned per `package.json`; the post-write `bun run check` pass is mandatory per N-3 discipline (snapshot test counts AFTER the LAST `biome --write`).
- **NO new dependencies added.** Story 6.3 is purely additive on existing imports + wiring.

## Testing Standards

Story 6.3's tests follow the project-wide testing discipline established by Stories 1.1 through 6.2:

- **bun:test framework** — `import { afterEach, beforeEach, describe, expect, it } from "bun:test";` (per every test file).
- **Direct invocation discipline (AR42)** — tests call `ModelSchema.parse({...})`, `buildDispatchSpec({...})`, `renderTranscriptMarkdown({...})`, and `runNext({...})` directly; NO `mock.module()` patterns; NO test seam mocking of internal helpers (except the existing `info()` spy pattern for log-line tests).
- **AR35 tmpdir-per-test pattern** — every test using filesystem fixtures runs under `await fs.mkdtemp(path.join(os.tmpdir(), "bmad-stepper-..."))`; cleanup via `await fs.rm(tmp, { recursive: true, force: true })` in `afterEach`.
- **Unique test ID prefixes** — Story 6.3 uses `MOD_63_*` (suffix-style: `MOD_63_SCHEMA_1`, `MOD_63_DISPATCH_DEFAULT_1`, `MOD_63_DISPATCH_OVERRIDE_1`, `MOD_63_DISPATCH_LOG_1`, `MOD_63_TRANSCRIPT_MD_1`, `MOD_63_RUN_1`, `MOD_63_RUN_DRYRUN_1`, `MOD_63_LOOP_1`, `MOD_63_MODELS_RECORD_1`) consistent with Story 6.1's `CFG_61_*` + Story 6.2's `OVR_62_*` patterns.
- **Per-AC mapping** — every test docstring or describe block annotates its AC: AC-1 → DISPATCH_DEFAULT/OVERRIDE/RUN/RUN_DRYRUN/LOOP; AC-2 → docs review (no runtime test); AC-3 → DISPATCH_LOG/TRANSCRIPT_MD.
- **Single-line constraint for log lines** — the extended `info()` line at generate-spec.ts:240-242 MUST be single-line (no `\n`/`\r`); MOD_63_DISPATCH_LOG_* asserts the constraint.
- **Quality gate baseline** — Story 6.2 close: 1377/0/4649 across 70 files. Story 6.3 expected delta: +(~10-15 new tests) / 0 / +(~25-40 new expects). Snapshot final test counts AFTER the LAST `biome --write` pass per N-3 discipline.
- **Errors registry sweep** — `bun test src/integration/escalate-actionable-hint.test.ts` sweeps all 17 error classes (Story 6.2 baseline 33/0/114). Story 6.3 introduces ZERO new ConfigError instances; the sweep stays GREEN unchanged.

## Previous Story Intelligence (from Story 6.2 close)

Story 6.2 (SECOND STORY of Epic 6) shipped on 2026-05-05 (status: done; runId 2026-05-05T091416Z-bmad-next + 2026-05-05T094000Z-bmad-next; loopId 2026-05-05T080939Z-bmad-loop). Key learnings carried into Story 6.3:

- **Story 6.1 SDR I-24 PRIMARY DELIVERABLE FOR STORY 6.3** — The Story 6.1 reviewer noted: "ModelsSchema is now a closed enum union (sonnet/opus/haiku); Story 6.3 model dispatcher uses config.models[step] with config.models[step] ?? 'sonnet' default." Story 6.3 honours this by consuming `opts.config?.models?.[stepName]` from the existing chain — NO new module imports, NO new file I/O, NO new error classes.
- **Story 6.2 SDR I-38 inherited and trivially honoured** — Story 6.2 introduced `.strict()` on `OverrideEntrySchema`. The forward-tracker noted "Stories 6.3-6.5 may want to follow suit". For Story 6.3, the schema is `ModelSchema = z.enum([...])` — `.strict()` on `z.enum` is meaningless (enums are already strict by construction). Story 6.3 honours I-38 trivially (no action required).
- **Story 6.2 quality gates baseline** — `bunx tsc --noEmit` exit 0; `bun run check` 1377/0/4649 across 70 files; `bun test src/errors.test.ts` 15/0/249; `grep -c "extends StepperError" src/errors.ts` = 17. ALL must remain GREEN after Story 6.3 dev.
- **Story 6.2 SDR I-33 inherited flake** — `src/smoke/next.test.ts:374` (`expect(parentMtimeAfter).toBe(parentMtimeBefore)`) is a pre-existing macOS-specific parent-dir mtime drift under parallel tmpdir contention; Δ ≤ 35ms in observed runs; deterministic re-runs yield 0/0 fail. NOT a regression for Story 6.3. If observed during Story 6.3 dev, RE-RUN and confirm 0/0 — do NOT debug.
- **Story 6.2 dev iter learnings**:
  - Single `bunx biome check --write` auto-format pass at the final task is the standard end-of-dev discipline (per N-3); it auto-formatted 3 files in Story 6.2. Expect a similar pass in Story 6.3.
  - Schema-side test density: Story 6.2 added 10 OVR_62_SCHEMA_* tests for the OverrideEntrySchema extension. Story 6.3's 6 MOD_63_SCHEMA_* / MOD_63_MODELS_RECORD_* tests are SMALLER because the schema is unchanged (enum already closed); test density adds positive/negative coverage on the existing schema.
  - Per-runner test duplication: Story 6.2 added 2 OVR_62_RUN_* + 2 OVR_62_LOOP_*. Story 6.3 adds 2-3 MOD_63_RUN_* + 1 MOD_63_LOOP_* — slightly smaller because the loop runner has no direct change (only a regression test that the seam flows through).

## Project Context Reference

- **Project root**: `/Users/tgorka/endeavor/tg/bmad-stepper-cc`
- **Runtime**: Bun 1.2.x (per `package.json` engines)
- **Test runner**: `bun:test` via `bun test`
- **Quality gate**: `bun run check` (biome ci + tests) + `bunx tsc --noEmit`
- **Architecture index**: `_bmad-output/planning-artifacts/architecture.md` — D5 three-tier discovery, P5 lines 793-813 (run-log JSON shape with `model` field), line 781 (`models:` config block), line 1366 (FR36 mapping: src/schemas/config.ts + src/dispatch/generate-spec.ts), line 1664 (TelemetryRecordV1Schema closed-set includes `model`).
- **Epics index**: `_bmad-output/planning-artifacts/epics.md` — Story 6.3 at lines 1187-1199.
- **Sprint status**: `_bmad-output/implementation-artifacts/sprint-status.yaml` — Story 6.3 at line 105.
- **State.yaml**: `.bmad-stepper/state.yaml` — workflow advanced at the end of the create-story step.
- **Plugin docs**: `commands/bmad-{loop,next}.md` — extended with model parameter pass-through per AC-2.
- **User-facing docs**: `docs/configuration.md` — Story 6.3 extends the `models:` section.

## Architectural Decisions

(See "Architectural challenges resolved here" above for the full set; summary below)

1. **OQ-1 — NO change to `ModelSchema` or `DispatchSpecV1Schema`** — both already at the right level of strictness; tightening dispatch-spec couples it to config and is deferred to Story 6.x cleanup (forward-tracker I-40).
2. **OQ-2 — Task tool `model` parameter pass-through is best-effort** — markdown caveat documents "where supported" semantics; runtime acceptance is best-effort.
3. **OQ-3 — markdown transcript adds Section 2 "## Dispatch metadata"** — surfaces Model/Persona/Phase/Budget for audit; section count grows from 7 to 8.
4. **OQ-4 — `info()` log spy pattern for MOD_63_DISPATCH_LOG_* tests** — recover the existing spy pattern from generate-spec.test.ts; if absent, use mock.module() narrowly scoped to the log assertion.
5. **OQ-5 — shared `getStepConfig(config, stepName, key, default)` helper DEFERRED** — Story 6.3 does NOT introduce a shared helper for `config.models[stepName] ?? default` — Stories 6.4 + 6.5 will follow the same pattern; if the duplication accumulates, Story 6.x can extract a helper. Forward-tracker I-39 records the option.

## Open Questions

All 5 OQs adjudicated above. None deferred.

## File Mutation Plan

| File | Path | Op | Lines (est) |
|------|------|----|-------------|
| schemas/config tests | `src/schemas/config.test.ts` | UPDATE | +40 |
| dispatch/generate-spec | `src/dispatch/generate-spec.ts` | UPDATE | +2 |
| dispatch/generate-spec tests | `src/dispatch/generate-spec.test.ts` | UPDATE | +30 |
| runs/render-markdown | `src/runs/render-markdown.ts` | UPDATE | +30 |
| runs/render-markdown tests | `src/runs/render-markdown.test.ts` | UPDATE | +80 |
| commands/next/run | `src/commands/next/run.ts` | UPDATE | +6 |
| commands/next/run tests | `src/commands/next/run.test.ts` | UPDATE | +80 |
| commands/loop/run tests | `src/commands/loop/run.test.ts` | UPDATE | +40 |
| commands/bmad-next | `commands/bmad-next.md` | UPDATE | +15 |
| commands/bmad-loop | `commands/bmad-loop.md` | UPDATE | +15 |
| docs/configuration | `docs/configuration.md` | UPDATE | +25 |

## Forward Action Items

### Inherited from Story 6.2 SDR (CARRIED)

**4 inherited cosmetic nits** (Stories 4.2-4.10 + 5.1-5.6 + 6.1 + 6.2 — UNCHANGED):
- **N-1**: Defensive null check at `src/commands/loop/stop-conditions.ts:269` — the `=== null` arm is unreachable. Story 6.3 does NOT modify stop-conditions.ts. Cosmetic forward.
- **N-2**: `EMPTY_DAG` + `EMPTY_STATE` sentinels at `src/commands/loop/run.ts` mid-file placement. Story 6.3 does NOT relocate. Cosmetic forward.
- **N-3**: Future task records snapshot final test counts AFTER the LAST `biome --write` pass. Story 6.3 must follow this discipline.
- **N-4**: TWO unused LoopOpts seams `finalStateOverride` + `writeLoopExitTranscriptOverride` declared but never consumed. Story 6.3 does NOT touch these. Pure dead surface; Story 6.x cleanup forward.

**38 inherited info forward-trackers** (Stories 5.5 + 5.6 + 6.1 + 6.2 SDRs — I-1 through I-38):
- **I-1 through I-17 (inherited from Story 5.5)**: failure-UX flow forward-trackers; NOT applicable to Story 6.3 — config-consumer + transcript wiring.
- **I-18 (inherited from 5.6)**: PRIMARY HONOURED in Story 6.1; Story 6.3 simply consumes the typed `Config.models` field.
- **I-19 through I-22 (inherited from 5.6)**: alias mapping for step IDs / --continue-on-error vs per-step policy / LoopOpts seam consolidation / single-line constraint discipline. Story 6.3 honours I-22 trivially — ZERO new error classes; existing ConfigError already passes the gate.
- **I-23 (inherited from 6.1, To Story 6.2 — PRIMARY HONOURED at Story 6.2 close)**: NOT applicable to Story 6.3.
- **I-24 (inherited from 6.1, To Story 6.3 — PRIMARY HONOURED HERE)**: `ModelsSchema` is a closed enum union (sonnet/opus/haiku); Story 6.3 model dispatcher uses `config.models[step] ?? "sonnet"` default. **HONOURED — this is the canonical Story 6.3 deliverable**. ZERO loader-API change for Story 6.3.
- **I-25 (inherited from 6.1, To Story 6.4)**: `BudgetsSchema` closed-shape; Story 6.4 budget enforcer uses defaults. NOT applicable to Story 6.3.
- **I-26 (inherited from 6.1, To Story 6.5)**: `VerifierConfigSchema.mode` field; Story 6.5 wires the per-step verifier registry merge logic. NOT applicable to Story 6.3.
- **I-27 (inherited from 6.1, To Story 6.6)**: `TelemetrySchema` v0.1 minimal; Story 6.6 may extend via schema bump. NOT applicable to Story 6.3 — but note: Story 6.6 will record the `model` field per architecture line 1664; Story 6.3 sources the field upstream.
- **I-28 (inherited from 6.1, To 6.x)**: `--no-config` flag DEFERRED. Story 6.3 does NOT add `--no-models` flag (out of scope).
- **I-29 (inherited from 6.1, To Story 1.12)**: `--doctor` should consume `loadConfig()` and run a FULL multi-error Zod parse for diagnostic output. NOT applicable to Story 6.3 (no new doctor surface).
- **I-30 (inherited from 6.1, To 6.x)**: Defaults-as-TS-constant vs Defaults-as-YAML — auto-generated companion. NOT applicable to Story 6.3.
- **I-31 (inherited from 6.1, To future Epics)**: Per-layer Zod parse vs single post-merge. NOT applicable to Story 6.3.
- **I-32 (inherited from 6.1, To future Epics)**: `personas[step]: string[]` multi-persona dispatch. NOT applicable to Story 6.3.
- **I-33 (inherited from 6.1 SDR, To Story 6.x or test infra cleanup)**: Sporadic flake at `src/smoke/next.test.ts:374` — pre-existing macOS-specific parent-dir mtime drift. NOT a Story 6.3 regression. Forward-tracker for test infra hardening.
- **I-34 (inherited from 6.2, To Story 6.x cleanup)**: Hand-rolled `parseOverridesYaml` at `src/dag/build.ts` is the LEGACY fallback. NOT applicable to Story 6.3.
- **I-35 (inherited from 6.2, To Story 6.x)**: `--no-overrides` CLI flag DEFERRED. NOT applicable to Story 6.3.
- **I-36 (inherited from 6.2, To future Epics)**: Phase enum extension lock-step discipline. NOT applicable to Story 6.3.
- **I-37 (inherited from 6.2, To Story 1.12 doctor command)**: validateOverrides(...) helper for --doctor. NOT applicable to Story 6.3.
- **I-38 (inherited from 6.2, To Stories 6.3-6.5 — consumer-side schema strictness pattern)**: `.strict()` on schemas. **TRIVIALLY HONOURED for Story 6.3** — `.strict()` on `z.enum` is a no-op; the enum is already strict by construction. Story 6.4 (`BudgetSchema` is `z.object`) and Story 6.5 (`VerifierConfigSchema` is `z.object`) may want to apply `.strict()`.

### NEW from Story 6.3 (PRODUCED for Stories 6.4+ and beyond)

- **I-39 (To Stories 6.4-6.5 — shared `getStepConfig` helper potential)**: Story 6.3 introduces the lookup pattern `opts.config?.models?.[stepName] ?? "sonnet"` at the runner. Stories 6.4 + 6.5 will follow analogous patterns (`opts.config?.budgets?.[stepName] ?? defaults.budget` and `opts.config?.verifiers?.[stepName] ?? defaults.verifier`). If the duplication accumulates across 3+ call sites, Story 6.x can extract a shared `getStepConfig(config, sectionKey, stepName, default)` helper. Forward-tracker. Estimated effort: XS (15-20 LoC).
- **I-40 (To Story 6.x cleanup — DispatchSpecV1Schema.model tightening)**: Story 6.3 PRESERVES `DispatchSpecV1Schema.model: z.string()` (open shape) at the dispatch-spec.json file boundary; the validation is at the LOADER (config) layer per AR42. A future Story 6.x cleanup may tighten to `model: ModelSchema` once the schema-cross-import boundary is acceptable. Estimated effort: XS (5 LoC + ~3 test updates).
- **I-41 (To Story 6.6 telemetry — model field already sourced)**: Story 6.3 sources `dispatchSpec.model` from `config.models[stepName] ?? "sonnet"`. Story 6.6 (`TelemetryRecordV1Schema` per architecture line 1664) will record the field via the JSONL writer; the source is now reliable. NO action for Story 6.3 beyond ensuring the field is populated.
- **I-42 (To Story 6.x — Task tool `model` parameter runtime contract)**: Story 6.3 documents the AC-2 caveat that the slash-command markdown forwards the `model` parameter to the Task tool "where supported". A future Story 6.x may verify the runtime contract empirically (e.g., dogfood test that asserts the configured model is honoured by Claude Code's Task tool runtime) — currently best-effort. Forward-tracker.

### Recommendations from epic-5-retrospective (CARRIED)

- **Recommendation item 3 (registry stability)**: HONOURED — Story 6.3 ships ZERO new error classes (registry stays at 17 — discipline maintained across Epic 6).
- **Recommendation item 6 (cross-story coordination via opts.config seam)**: HONOURED — Story 6.3 reads from `opts.config?.models?.[stepName]` (Story 5.6 + 6.1 + 6.2 frozen seam); ZERO seam mutation.

## Dev Agent Record

### Implementation Plan

Story 6.3 was the LIGHTEST Epic 6 story per the spec — pure consumer wiring + test density + transcript markdown extension. ZERO new files, ZERO new error classes, ZERO schema mutations. Implementation followed the 12-task sequence exactly:

1. **Tasks 1-2 (schema test density)**: Added 8 new tests to `src/schemas/config.test.ts` (4 MOD_63_SCHEMA_* covering `ModelSchema` enum positive + 3 invalid types; 4 MOD_63_MODELS_RECORD_* covering `ModelsSchema` empty + multi-entry + invalid value path + non-string value). Existing 69 CFG_61_* + OVR_62_* tests pass unchanged → 77 total.
2. **Tasks 3-4 (dispatch generator log + tests)**: Extended `src/dispatch/generate-spec.ts:248-254` with `(model ${dispatchSpec.model})` substring; updated JSDoc with Story 6.3 cross-link. Added 3 MOD_63_DISPATCH_LOG_* tests using `spyOn(process.stderr, "write")` (matching the canonical project-wide pattern from `src/io/log.test.ts:18-21` + `src/dispatch/emit.test.ts:36`) — covers default model + override + single-line constraint. Existing 26 dispatch tests pass unchanged → 29 total.
3. **Tasks 5-6 (markdown renderer + tests)**: Inserted new Section 2 "## Dispatch metadata" between H1 (Section 1) and "## Inputs" (renumbered to Section 3). Section emits Model + Persona + Phase + Budget bullets sourced from existing `TranscriptInput` fields; null fields render `(not recorded)` per OQ-3 idempotency. JSDoc updated to reflect 8 sections (was 7). Updated existing AR25 ordering test to assert 8 headings (was 7). Added 6 MOD_63_TRANSCRIPT_MD_* tests covering Model line for opus/sonnet/null + section ordering + 4-bullet metadata + null-fallback symmetry. Existing 11 tests pass unchanged → 17 total.
4. **Tasks 7-8 (runner wiring + tests)**: At `src/commands/next/run.ts:2042-2079`, threaded `modelOverride: configuredModel` (read from `opts?.config?.models?.[nextStep.name]`) into the existing `buildDispatchSpec({...})` call (conditional spread keeps `modelOverride` undefined when no per-step config so generate-spec.ts:196 fallback fires). Replaced hardcoded `"sonnet"` substring in dry-run preview at line 2031 with resolved model. Updated inline comment at lines 1999-2008 reflecting Story 6.3 resolution + Story 6.4 still hardcoded budget. Extended `RunNextOptions.config` shape (next/run.ts:331) + `LoopOpts.config` shape (loop/run.ts:466) + both `loadConfigOverride` return types with `models?: Models` field. Added 6 MOD_63_RUN_* + MOD_63_RUN_DRYRUN_* tests in `src/commands/next/run.test.ts` (happy-path opus threading; empty record default; absent config default; selectivity check; dry-run opus + dry-run default). Added 2 MOD_63_LOOP_* tests in `src/commands/loop/run.test.ts` asserting opts.config.models flows through + loadConfigOverride returns models record. Existing 157 next/run tests + 169 loop/run tests pass unchanged → 163 + 171 totals.
5. **Tasks 9-10 (slash-command + docs)**: Extended `commands/bmad-next.md:90-118` Task pseudo-call with `model = <dispatchSpec.model>` parameter + caveat paragraph documenting "where supported" OQ-2 semantics. Extended `commands/bmad-loop.md:189-204` analogous block with Story 6.3 forward-tracker note about future Task-per-iteration wiring carrying model parameter. Refreshed `docs/configuration.md` `models:` section (lines 282-339) with Wiring (Story 6.3) sub-section + Task tool model parameter (where supported) sub-section + cross-links. Updated forward-tracker section at lines 380-395 marking Story 6.3 as DONE.
6. **Tasks 11-12 (quality gates + finalisation)**: All gates GREEN — registry held at 17, schema unchanged, JSON run log unchanged, AR9 protocol unchanged, AR41 boundary preserved (no new imports). Single `bunx biome check --write` pass auto-formatted 1 file (src/commands/next/run.ts) per N-3 discipline.

### Completion Notes

- **AC-1 satisfied**: `config.models[stepName]` threads through `RunNextOptions.config.models` → `buildDispatchSpec.modelOverride` → `dispatchSpec.model` (verified by MOD_63_RUN_1 — opus configured surfaces in dispatch-spec.json; MOD_63_RUN_2/3/4 — `"sonnet"` default fires when config absent/empty/non-matching). File evidence: `src/commands/next/run.ts:2068-2073` (configuredModel resolution + conditional spread).
- **AC-2 satisfied**: `commands/bmad-next.md:90-110` Task pseudo-call now carries `model = <dispatchSpec.model>` parameter with explicit "where supported" caveat documenting best-effort runtime acceptance per OQ-2. `commands/bmad-loop.md:189-204` carries the analogous Story 6.3 note for the future Task-per-iteration wiring.
- **AC-3 satisfied**: dual-channel coverage — (a) Layer 2 stderr `info()` log line at `src/dispatch/generate-spec.ts:251-253` includes `(model ${dispatchSpec.model})` substring (verified by MOD_63_DISPATCH_LOG_1/2/3); (b) markdown transcript Section 2 "## Dispatch metadata" at `src/runs/render-markdown.ts:81-92` includes `Model: <model-name>` bullet (verified by MOD_63_TRANSCRIPT_MD_1/2/3/4/5/6); (c) JSON run log already records `model` field from Story 2.5 baseline — unchanged.
- **Errors registry held at 17**: ZERO new error classes (verified by `grep -c "extends StepperError" src/errors.ts` = 17 + `bun test src/errors.test.ts` 15/0/249 + `bun test src/integration/escalate-actionable-hint.test.ts` 33/0/114 — all unchanged).
- **Schema migration registry stays at v1**: ZERO schema mutations (ModelSchema / ModelsSchema / DispatchSpecV1Schema / RunLogV1Schema all unchanged per OQ-1).
- **Quality gate snapshot AFTER biome --write**: `bun run check` 1402/0/4707 across 70 files (delta +25 tests / +58 expects vs 1377/0/4649 baseline — within the spec's expected +(~10-15 new tests) / +(~25-40 new expects) band, slightly higher because some new tests count >1 expect).
- **Repair iterations**: 0 substantive repairs. Two minor mid-iteration adjustments (1) added `models?: Models` to `RunNextOptions.config` after first tsc error revealed the type was narrow; (2) added `models?: Models` to `LoopOpts.config` + `loadConfigOverride` return types to unblock MOD_63_LOOP_2 fixture. Final biome `--write` auto-formatted 1 file. No 3rd-iteration repair needed.

### Debug Log References

- `bunx tsc --noEmit` exit 0 (post-final-edit).
- `bun run check` 1402 pass / 0 fail / 4707 expect() across 70 files.
- `bun test src/schemas/config.test.ts` 77/0/131 (was 69; +8 MOD_63_SCHEMA_* + MOD_63_MODELS_RECORD_*).
- `bun test src/dispatch/generate-spec.test.ts` 29/0/57 (was 26; +3 MOD_63_DISPATCH_LOG_*).
- `bun test src/runs/render-markdown.test.ts` 17/0/43 (was 11; +6 MOD_63_TRANSCRIPT_MD_*).
- `bun test src/commands/next/run.test.ts` 163/0/599 (was 157; +6 MOD_63_RUN_* + MOD_63_RUN_DRYRUN_*).
- `bun test src/commands/loop/run.test.ts` 171/0/605 (was 169; +2 MOD_63_LOOP_*).
- `bun test src/errors.test.ts` 15/0/249 UNCHANGED.
- `bun test src/integration/escalate-actionable-hint.test.ts` 33/0/114 UNCHANGED.
- `grep -c "extends StepperError" src/errors.ts` = 17 UNCHANGED.

## File List

**MODIFIED (11 files, ZERO new files)**:

- `src/schemas/config.test.ts` — added 8 MOD_63_SCHEMA_* + MOD_63_MODELS_RECORD_* tests at end of file (~80 LoC).
- `src/dispatch/generate-spec.ts` — extended JSDoc + extended Step 8 `info()` log line with `(model ${dispatchSpec.model})` substring (lines 41-58 JSDoc + lines 248-254 log line).
- `src/dispatch/generate-spec.test.ts` — added `spyOn` import + 3 MOD_63_DISPATCH_LOG_* tests at end of file (~80 LoC).
- `src/runs/render-markdown.ts` — added new Section 2 "## Dispatch metadata" between H1 and Inputs (lines 81-92) + renumbered section comments 4-8 + JSDoc updated to reflect 8 sections (lines 53-79).
- `src/runs/render-markdown.test.ts` — extended AR25 section ordering test to 8 headings + added 6 MOD_63_TRANSCRIPT_MD_* tests at end of file (~75 LoC).
- `src/commands/next/run.ts` — extended `RunNextOptions.config` with `models?: Models` (line 331) + extended `loadConfigOverride` return type with `models?: Models` (lines 358-361) + replaced hardcoded `"sonnet"` substring in dry-run preview with resolved model (lines 2031-2034) + threaded `modelOverride` into `buildDispatchSpec({...})` call (lines 2068-2079) + updated inline comment (lines 1999-2008).
- `src/commands/next/run.test.ts` — added 6 MOD_63_RUN_* + MOD_63_RUN_DRYRUN_* tests at end of file (~150 LoC).
- `src/commands/loop/run.ts` — extended `LoopOpts.config` with `models?: Models` (lines 462-471) + extended `loadConfigOverride` return type with `models?: Models` (lines 485-495).
- `src/commands/loop/run.test.ts` — added 2 MOD_63_LOOP_* tests at end of file (~80 LoC).
- `commands/bmad-next.md` — extended Task pseudo-call at lines 90-110 with `model = <dispatchSpec.model>` parameter + AC-2 caveat paragraph.
- `commands/bmad-loop.md` — extended Story 6.3 forward-tracker note at lines 189-204 about future Task-per-iteration carrying the model parameter.
- `docs/configuration.md` — extended `models:` section (lines 282-339) with Wiring + Task tool model parameter sub-sections + updated forward-tracker section (lines 380-395) marking Story 6.3 DONE.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — marked `6-3-models-per-step-config: ready-for-dev → in-progress → review`; bumped `last_updated` to `2026-05-05T10:01:38Z`.
- `_bmad-output/implementation-artifacts/6-3-models-per-step-config.md` (this file) — frontmatter status: ready-for-dev → review; ticked all 83 task checkboxes; appended Dev Agent Record + File List + Change Log entry.

## Change Log

| Date       | Author    | Change                              |
| ---------- | --------- | ----------------------------------- |
| 2026-05-05 | bmad-create-story (Claude Opus 4.7 1M, iter 7 of /bmad-loop --until=story:6.8 — loopId 2026-05-05T080939Z-bmad-loop, runId 2026-05-05T094629Z-bmad-next) | Story 6.3 spec created (THIRD STORY of Epic 6). Status: backlog → ready-for-dev. AC byte-identical to epics.md lines 1187-1199 (3-block Given/When/Then — `models:` config → dispatch-spec.json's `model` field with sonnet default + slash-command markdown passes model to Task tool where supported + Stepper logs model on dispatch line for audit). 12 tasks (~75 sub-tasks). 5 OQs adjudicated transparently for code-review (OQ-1 NO change to ModelSchema or DispatchSpecV1Schema — both at right strictness; deferred dispatch-spec tightening to Story 6.x cleanup forward-tracker I-40; OQ-2 Task tool model parameter pass-through is best-effort — markdown caveat documents "where supported" semantics; OQ-3 markdown transcript adds Section 2 "## Dispatch metadata" surfacing Model/Persona/Phase/Budget — section count grows from 7 to 8; OQ-4 `info()` log spy pattern for MOD_63_DISPATCH_LOG_* tests via existing spy or narrowly-scoped mock.module(); OQ-5 shared `getStepConfig` helper DEFERRED — Stories 6.4 + 6.5 will follow same pattern; extract if duplication accumulates per forward-tracker I-39). 13 deps (6.1 PRIMARY for loadConfig + ModelsSchema closed-enum + Story 6.1 SDR I-24 PRIMARY HONOURED here; 2.2 PRIMARY for buildDispatchSpec.modelOverride + DispatchSpecV1Schema.model + info() log line; 2.5 PRIMARY for transcript module group — RunLogV1Schema.model + buildRunLog already wired + render-markdown extension is the new gap; 6.2 PATTERN for most-recent precedent + I-38 trivially honoured; 1.2 PRIMARY for ConfigError + registry CI gate at 17 codes; 1.5 PATTERN for schema-first; 1.3 PRIMARY for io/log.ts info helper; 6.4/6.5/6.6 CROSS-STORY COORDINATION orthogonal; 2.4 CONSUMER for runner buildDispatchSpec call site; 5.6 PATTERN for opts.config seam frozen). 39 inputDocuments. ZERO NEW files. 11 MODIFIED files (src/schemas/config.test.ts +40 LoC MOD_63_SCHEMA_* + MOD_63_MODELS_RECORD_*; src/dispatch/generate-spec.ts +2 LoC info() line model substring; src/dispatch/generate-spec.test.ts +30 LoC MOD_63_DISPATCH_LOG_*; src/runs/render-markdown.ts +30 LoC new "## Dispatch metadata" Section 2; src/runs/render-markdown.test.ts +80 LoC MOD_63_TRANSCRIPT_MD_*; src/commands/next/run.ts +6 LoC modelOverride threading + dry-run preview model substring + comment update; src/commands/next/run.test.ts +80 LoC MOD_63_RUN_*; src/commands/loop/run.test.ts +40 LoC MOD_63_LOOP_*; commands/bmad-next.md +15 LoC Task model parameter + caveat; commands/bmad-loop.md +15 LoC same extension; docs/configuration.md +25 LoC models section refresh + cross-links + forward-tracker update). FORWARD-TRACKERS produced (4 NEW): I-39 to Stories 6.4-6.5 shared getStepConfig helper potential / I-40 to Story 6.x cleanup DispatchSpecV1Schema.model tightening / I-41 to Story 6.6 telemetry model field already sourced / I-42 to Story 6.x Task tool model parameter runtime contract verification. INHERITED forward-trackers: 4 cosmetic nits N-1/N-2/N-3/N-4 + 38 info I-1 through I-38 (I-24 PRIMARY HONOURED — Story 6.3 deliverable; I-33 sporadic flake at smoke/next.test.ts:374 NOT a regression; I-38 .strict() discipline trivially honoured — z.enum already strict; cumulative carry forward unchanged). Errors registry stays at 17 (Story 6.3 ships ZERO new error classes per AR21 + epic-4-retro Recommendations item 3 + Story 5.6 OQ-9 + Story 6.1/6.2 OQ pattern). Schema migration registry stays at v1 (no schemaVersion bump — ZERO schema mutations: ModelSchema/ModelsSchema/DispatchSpecV1Schema/RunLogV1Schema all unchanged). Sprint-status `6-3-models-per-step-config` backlog → ready-for-dev (line 105); epic-6 stays in-progress (line 102). last_updated 2026-05-05T09:46:29Z bumped at lines 2 + 38. NO src/ mutations during create-story phase — those are dev-story iter work. |
| 2026-05-05 | bmad-dev-story (Claude Opus 4.7 1M, iter 8 of /bmad-loop --until=story:6.8 — loopId 2026-05-05T080939Z-bmad-loop, runId 2026-05-05T100138Z-bmad-next) | Story 6.3 implemented. Status: ready-for-dev → review. ALL 83 task checkboxes ticked (12 tasks / ~75 sub-tasks). AC-1/AC-2/AC-3 verified (see Dev Agent Record). Quality gates GREEN: `bunx tsc --noEmit` exit 0; `bun run check` 1402/0/4707 across 70 files (delta +25 tests / +58 expects vs 1377/0/4649 baseline); `grep -c "extends StepperError" src/errors.ts` = 17 UNCHANGED; `bun test src/errors.test.ts` 15/0/249 UNCHANGED; `bun test src/integration/escalate-actionable-hint.test.ts` 33/0/114 UNCHANGED. ZERO new error classes. ZERO schema mutations. 11 MODIFIED files matching the spec File Mutation Plan. Single biome `--write` pass auto-formatted 1 file (src/commands/next/run.ts) per N-3 discipline. Forward-trackers I-39 + I-40 + I-41 + I-42 produced. Sprint-status `6-3-models-per-step-config` in-progress → review. last_updated 2026-05-05T10:01:38Z. |
| 2026-05-05 | bmad-code-review (Claude Opus 4.7 1M, iter 9 of /bmad-loop --until=story:6.8 — loopId 2026-05-05T080939Z-bmad-loop, runId 2026-05-05T101756Z-bmad-next) | Senior Developer Review — verdict APPROVE. Status: review → done. ZERO must-fix / ZERO should-fix / ZERO new nits / ZERO new info forward-trackers (4 NITs N-1..N-4 + 42 info I-1..I-42 cumulative carry forward unchanged from Story 6.3 dev-iter close). Independent quality gate re-verification GREEN from a fresh shell with `export PATH="$HOME/.bun/bin:$PATH"`: `bunx tsc --noEmit` exit 0; `bun run check` 1402 pass / 0 fail / 4707 expect() across 70 files (matches dev-iter snapshot verbatim — Δ +25/+58/0 vs Story 6.2 baseline 1377/0/4649); `grep -c "extends StepperError" src/errors.ts` = 17 UNCHANGED. AC-1 PASS at src/commands/next/run.ts:2064 (configuredModel resolution) + run.ts:2074-2076 (conditional spread modelOverride) + src/dispatch/generate-spec.ts:207 (`?? "sonnet"` fallback) — MOD_63_RUN_1/2/3/4 + MOD_63_RUN_DRYRUN_1/2 cover. AC-2 PASS at commands/bmad-next.md:101 (Task model parameter line) + bmad-next.md:105-112 (where-supported caveat per OQ-2) + commands/bmad-loop.md:189-204 (analogous Story 6.3 forward-tracker note for future Task-per-iteration). AC-3 PASS dual-channel: src/dispatch/generate-spec.ts:255-257 (single-line info() log includes `(model ${dispatchSpec.model})` substring per AR21+22) + src/runs/render-markdown.ts:84-97 (Section 2 "## Dispatch metadata" between H1 and `## Inputs` per AR25 + OQ-3) + JSON run log already records model field from Story 2.5 baseline. AR verdicts: AR41 boundary clean (dispatch only imports from ../schemas/dispatch-spec + ../schemas/state + ../io/log + ../io/atomic-write + ../io/paths + ../errors + ./types — no new boundary crossings); AR21+22 single-line preserved (info() template literal contains no `\n`/`\r`; MOD_63_DISPATCH_LOG_3 explicitly asserts); AR8 lock-free (run.ts pure-read; ZERO state.yaml writes added); AR9 stdout invariant (emitDispatchAction unchanged; dispatchSpec.model field unchanged on AR9 line); AR25 transcript ordering preserved (render-markdown.test.ts:60 asserts 8 sections in fixed order with Dispatch metadata between H1 and Inputs). All 5 OQs honoured per spec: OQ-1 NO schema change ✓ (ModelSchema and DispatchSpecV1Schema both unchanged); OQ-2 Task tool model parameter caveat present ✓; OQ-3 markdown transcript Section 2 added ✓; OQ-4 spy() pattern for log-line tests ✓ (spyOn(process.stderr,"write") via canonical io/log.test.ts pattern); OQ-5 shared getStepConfig helper deferred ✓ (forward-tracker I-39). Errors registry held at 17 (verified independently). Sprint-status `6-3-models-per-step-config` review → done (line 105). State.yaml workflow advanced: lastStep=bmad-code-review; lastStepCompletedAt 2026-05-05T10:20:42Z; nextStep=bmad-create-story; nextStepStory=6.4; nextStepKey=6-4-budgets-per-step-config; evidenceIndex appended. **STORY 6.3 COMPLETE — `models:` per-step config consumer wiring + transcript audit trail shipped.** |

## Senior Developer Review (AI)

**Reviewer:** bmad-code-review (Claude Opus 4.7 1M, iter 9 of /bmad-loop --until=story:6.8)
**Date:** 2026-05-05T10:20:42Z
**runId:** 2026-05-05T101756Z-bmad-next
**loopId:** 2026-05-05T080939Z-bmad-loop
**Outcome:** APPROVE

### Summary

Story 6.3 ships the `models:` per-step config consumer wiring at the dispatch-spec generator + dual-channel audit trail (stderr info log + markdown transcript Section 2). The work is the lightest of Epic 6 — pure consumer wiring + test density + slash-command markdown extension + docs refresh. ZERO new files. ZERO new error classes. ZERO schema mutations. ZERO repair iterations of substance. All 5 OQs honoured transparently per the create-story spec. All quality gates green; errors registry held at 17 codes.

### Quality gate re-verification (independent, fresh shell)

| Gate | Result |
|---|---|
| `bunx tsc --noEmit` | exit 0 |
| `bun run check` | 1402 pass / 0 fail / 4707 expect() across 70 files (Δ +25/+58/0 vs Story 6.2 baseline 1377/0/4649) |
| `grep -c "extends StepperError" src/errors.ts` | 17 UNCHANGED |
| `bun test src/{schemas,dispatch,runs,commands/{next,loop}}/...` | 457 pass / 0 fail / 1435 expect() across 5 files |

All gates GREEN from a fresh shell with `export PATH="$HOME/.bun/bin:$PATH"`. Snapshot matches dev-iter claim verbatim.

### AC verification (file:line evidence)

- **AC-1 (`config.models[stepName]` → dispatch-spec.json's `model` field; default `"sonnet"`):** PASS.
  - Resolution: `src/commands/next/run.ts:2064` — `const configuredModel = opts?.config?.models?.[nextStep.name];`
  - Conditional spread: `src/commands/next/run.ts:2074-2076` — `...(configuredModel !== undefined ? { modelOverride: configuredModel } : {})` (preserves `exactOptionalPropertyTypes` discipline; falls through to default when undefined)
  - Default fallback: `src/dispatch/generate-spec.ts:207` — `model: input.modelOverride ?? "sonnet"` (Story 2.2 baseline)
  - Tests: `MOD_63_RUN_1/2/3/4` (happy-path opus + empty record default + absent config default + per-step selectivity) + `MOD_63_RUN_DRYRUN_1/2` (dry-run opus + dry-run sonnet default)

- **AC-2 (slash-command markdown passes model parameter to Task tool with caveat):** PASS.
  - Parameter line: `commands/bmad-next.md:101` — `model  = <dispatchSpec.model>     # read from staging/<runId>/dispatch-spec.json's \`model\` field; "sonnet" default per Story 6.3`
  - Caveat: `commands/bmad-next.md:105-112` (Story 6.3 AC-2 — `where supported` paragraph documenting OQ-2 best-effort runtime acceptance)
  - Loop analog: `commands/bmad-loop.md:189-204` (forward-tracker note for future Task-per-iteration carrying the model parameter)

- **AC-3 (Stepper logs the model on dispatch line):** PASS — dual-channel.
  - Stderr info log: `src/dispatch/generate-spec.ts:255-257` — `info(\`dispatch: built spec for step ${input.stepName} (model ${dispatchSpec.model}) at ${dispatchSpecPath}\`)` — single-line template literal, no `\n`/`\r`
  - Markdown transcript Section 2: `src/runs/render-markdown.ts:84-97` — `## Dispatch metadata` block emits `Model:`, `Persona:`, `Phase:`, `Budget:` bullets sourced from `TranscriptInput`; null fields render `(not recorded)` per OQ-3 idempotency
  - JSON run log: ALREADY records `model` field from Story 2.5 baseline (UNCHANGED)
  - Tests: `MOD_63_DISPATCH_LOG_1/2/3` (default + override + single-line constraint) + `MOD_63_TRANSCRIPT_MD_1/2/3/4/5/6` (Model line for opus/sonnet/null + section ordering + 4 metadata bullets + null fallback)

### AR verdicts

| AR | Verdict | Evidence |
|---|---|---|
| **AR41** boundary | CLEAN | `src/dispatch/generate-spec.ts` only imports from `../schemas/dispatch-spec`, `../schemas/state`, `../io/log`, `../io/atomic-write`, `../io/paths`, `../errors`, `./types` — no new crossings |
| **AR21+22** single-line | PRESERVED | `info()` log at `generate-spec.ts:255-257` is template literal with no `\n`/`\r`; `MOD_63_DISPATCH_LOG_3` asserts explicitly |
| **AR8** lock-free | PRESERVED | `run.ts` consumer addition is pure-read (no `state.yaml` writes); only adds local-variable resolution + buildDispatchSpec field thread |
| **AR9** stdout invariant | PRESERVED | `emitDispatchAction` unchanged; `dispatchSpec.model` field unchanged on the AR9 JSON line — only the SOURCE of `model` changed (config-derived vs hardcoded) |
| **AR25** transcript ordering | PRESERVED | `render-markdown.test.ts:60` asserts the 8 AR25 sections appear in fixed order, with `## Dispatch metadata` between the H1 (Section 1) and `## Inputs` (Section 3) |

### OQ adjudication

| OQ | Position | Evidence |
|---|---|---|
| **OQ-1** NO schema change | HONOURED | `ModelSchema` at `src/schemas/config.ts:208` unchanged (`z.enum([...])` already strict by construction); `DispatchSpecV1Schema.model` at `src/schemas/dispatch-spec.ts:30` still `z.string()` (open shape preserved per AR42) |
| **OQ-2** Task tool model parameter caveat present | HONOURED | `commands/bmad-next.md:105-112` carries the verbatim "where supported" caveat |
| **OQ-3** markdown transcript Section 2 added | HONOURED | `render-markdown.ts:84-97` Section 2 inserted; section count grows 7→8; existing tests extended (renumbered) not replaced |
| **OQ-4** spy() pattern for log-line tests | HONOURED | `MOD_63_DISPATCH_LOG_*` uses `spyOn(process.stderr, "write")` via canonical `src/io/log.test.ts:18-21` + `src/dispatch/emit.test.ts:36` pattern |
| **OQ-5** shared `getStepConfig` helper deferred | HONOURED | Forward-tracker I-39 records the option; Stories 6.4 + 6.5 will follow the same `opts.config?.[section]?.[stepName] ?? default` pattern; extract if duplication accumulates across 3+ call sites |

### Findings

| Severity | Count |
|---|---|
| Must-fix | 0 |
| Should-fix | 0 |
| Nits | 0 NEW (4 inherited NITs N-1..N-4 cumulative carry forward unchanged) |
| Info | 0 NEW (42 inherited info I-1..I-42 cumulative carry forward unchanged from Story 6.3 dev-iter close — I-1..I-38 inherited from 5.5/5.6/6.1/6.2; I-39/I-40/I-41/I-42 produced at Story 6.3 create-story step and re-confirmed at this review step) |

### Forward Action Items (cumulative carry-forward)

**Inherited NITs (4) — UNCHANGED from Story 6.2 SDR**
- **N-1**: Defensive null check at `src/commands/loop/stop-conditions.ts:269` — unreachable arm. Cosmetic forward.
- **N-2**: `EMPTY_DAG` + `EMPTY_STATE` sentinels at `src/commands/loop/run.ts` mid-file placement. Cosmetic forward.
- **N-3**: Future tasks must snapshot final test counts AFTER the LAST `biome --write` pass. Story 6.3 dev-iter HONOURED.
- **N-4**: TWO unused LoopOpts seams `finalStateOverride` + `writeLoopExitTranscriptOverride`. Pure dead surface; Story 6.x cleanup forward.

**Inherited info I-1..I-38** — UNCHANGED (see story file Forward Action Items section). Story 6.3 deliverable closes I-24 (PRIMARY HONOURED here); I-33 sporadic flake at `src/smoke/next.test.ts:374` confirmed NOT a Story 6.3 regression; I-38 `.strict()` discipline trivially honoured (z.enum already strict by construction).

**Forward-trackers PRODUCED at Story 6.3 (4 NEW) — re-confirmed at review step**
- **I-39 (To Stories 6.4-6.5)** — shared `getStepConfig(config, sectionKey, stepName, default)` helper potential. Forward-tracker. Estimated effort: XS (15-20 LoC).
- **I-40 (To Story 6.x cleanup)** — `DispatchSpecV1Schema.model` tightening from `z.string()` to `ModelSchema`. Estimated effort: XS (5 LoC + ~3 test updates).
- **I-41 (To Story 6.6 telemetry)** — model field already sourced reliably; `TelemetryRecordV1Schema` per architecture line 1664 will record via the JSONL writer. NO action for Story 6.3.
- **I-42 (To Story 6.x)** — Task tool `model` parameter runtime contract verification (currently best-effort per AC-2 caveat).

### Verdict rationale

Story 6.3 is a textbook consumer-wiring story: spec is concrete, scope is narrow, dev-iter snapshot matches independent re-verification verbatim (1402/0/4707; errors=17). All 3 ACs verified with file:line evidence; all 5 OQs honoured per the create-story spec; all 5 ARs preserved. ZERO must-fix, ZERO should-fix, ZERO new nits, ZERO new info forward-trackers. The implementation honours Story 6.1 SDR I-24 PRIMARY (the canonical Story 6.3 deliverable), Story 5.6 + 6.1 + 6.2 frozen `opts.config` seam, Story 2.2 dispatch-spec generator unchanged, Story 2.5 transcript writers unchanged at the JSON layer (markdown layer extended per OQ-3). Errors registry held at 17 codes per the AR21 + epic-4-retro discipline. The 4 forward-trackers (I-39 to I-42) are well-scoped for downstream Stories 6.4-6.6 + Story 6.x cleanup. Approve and advance to Story 6.4 (`budgets:` per-step config — independent path; same pattern as Story 6.3).

