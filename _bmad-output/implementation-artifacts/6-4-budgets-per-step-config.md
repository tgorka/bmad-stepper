---
status: done
story_id: '6.4'
story_key: 6-4-budgets-per-step-config
epic: '6'
title: '`budgets:` Per-Step Config'
created: '2026-05-05'
last_updated: '2026-05-05T10:54:09Z'
priority: high
estimated_effort: S
fr_coverage:
  - FR37     # PRIMARY — `budgets:` per step (architecture line 782: src/schemas/config.ts BudgetSchema + dispatch-spec budget block)
  - FR16     # PRIMARY — dispatch-spec authored by `src/dispatch/generate-spec.ts`; Story 6.4 wires `budget` from config
  - FR18     # PRIMARY — transcript writer surfaces `budget` on the dispatch metadata header (Story 6.3 baseline) + audits any non-default values
  - FR54     # PRIMARY — info() stderr log line includes budget context tokens + timeoutMs (single-line, no `console.*`)
  - FR34     # SECONDARY — config layer feeds the dispatcher (project > user > defaults)
nfr_coverage:
  - NFR-R1   # PRIMARY — strict Zod validation rejects malformed `budgets:` at load time (Story 6.1 baseline + I-38 `.strict()` discipline)
  - NFR-R6   # PRIMARY — Zod-validated budgets on every read via `BudgetsSchema = z.record(z.string(), BudgetSchema)`
  - NFR-S1   # main-thread output discipline (info() stderr only; no `console.log`)
  - NFR-M2   # actionable-error contract — invalid budget values surface single-line ConfigError at LOAD time (Story 6.1 already wired; this story adds tests)
  - NFR-M3   # schema-versioning + defence-in-depth Zod parse on dispatch-spec
ar_coverage:
  - AR41     # PRIMARY — boundary graph (`src/dispatch/` higher-tier — allowed imports unchanged: ../errors, ../schemas/dispatch-spec, ../schemas/state, ../io/log, ../io/atomic-write, ../io/paths)
  - AR42     # PRIMARY — Zod schema-first (BudgetSchema is source-of-truth; Story 6.4 may apply `.strict()` to BudgetSchema per I-38 forward-tracker)
  - AR9      # PRIMARY — AR9 stdout JSON-line invariant unchanged; budget block already in DispatchSpecV1Schema (Story 1.5 + Story 2.2)
  - AR21     # PRIMARY — error UX shape (single-line actionable hint inherited from Story 6.1 ConfigError on invalid budget)
  - AR22     # PRIMARY — actionable-hint regex /^.*(Run|See|Try|Check) /
  - AR33     # PRIMARY — async function; throws StepperError subclasses; no `console.*`; no `process.exit`
  - AR20     # type-alias chain (Budgets inferred from BudgetsSchema; Budget from BudgetSchema)
  - AR34     # slash-command markdown protocol unchanged (no Task-tool `budget` parameter — runtime cap is Bun-side via `verify-and-advance.ts` timeout enforcement)
  - AR8      # lock-free top-tier preserved (run.ts still pure-read; ZERO state.yaml writes)
  - AR25     # transcript ordering unchanged (Section 2 "## Dispatch metadata" already includes Budget bullet from Story 6.3)
deps:
  - story: '6.1'
    reason: 'PRIMARY — `loadConfig()` produces typed `Config` with `config.budgets` (closed-shape `BudgetsSchema = z.record(z.string(), BudgetSchema)` at `src/schemas/config.ts:234`; `BudgetSchema = z.object({ contextTokens: z.number().int().positive().optional(), timeoutMs: z.number().int().positive().optional() })` at `src/schemas/config.ts:226-229`). Story 6.1 SDR I-25 PRIMARY HONOURED here: Story 6.4 budget enforcer uses `config.budgets[step]` with `contextTokens ?? 60_000` / `timeoutMs ?? 300_000` defaults. Story 6.1 inputs to wire: (a) `loadConfig()` exposes `Config.budgets` as Budgets record (default `{}` per src/schemas/config.ts:308); (b) `src/schemas/config.ts` exports `BudgetSchema` + `BudgetsSchema` + `Budget` + `Budgets` types; (c) `Config.budgets` is REQUIRED with default `{}` (Story 6.1 ConfigV1Schema `budgets: BudgetsSchema.default({})`); (d) NO loader-API change needed for Story 6.4 (Story 6.1 SDR I-25 verbatim).'
  - story: '2.2'
    reason: 'PRIMARY — `buildDispatchSpec()` orchestrator at `src/dispatch/generate-spec.ts`. Story 2.2 ALREADY shipped (a) the `budgetOverride?: BudgetOverride` field on `DispatchSpecInput` at `src/dispatch/types.ts:55-56`, (b) the default-with-override semantic at `src/dispatch/generate-spec.ts:208-211` (`contextTokens: input.budgetOverride?.contextTokens ?? 60_000`, `timeoutMs: input.budgetOverride?.timeoutMs ?? 300_000`), and (c) the `DispatchSpecV1Schema.budget: { contextTokens: z.number(), timeoutMs: z.number() }` at `src/schemas/dispatch-spec.ts`. The defaults in generate-spec.ts:208-211 EXACTLY MATCH the AC-1 verbatim defaults (60000 / 300000). Story 6.4 wires `config.budgets[stepName]` as the source for `budgetOverride`. ZERO schema mutation to dispatch-spec.ts; ZERO mutation to generate-spec.ts internal logic — only the CALLER (next/run.ts + loop/run.ts) selects `budgetOverride` from config. The `BudgetOverride` interface at types.ts:38-41 is structurally compatible with the loader `Budget` type.'
  - story: '2.5'
    reason: 'PRIMARY — transcript module group (`src/runs/`). Story 2.5 ALREADY shipped `budget: { contextTokens: number; timeoutMs: number } | null` in `TranscriptInput` AND the JSON run-log already records the budget; the Story 6.3 markdown extension (Section 2 "## Dispatch metadata") ALREADY emits `Budget: ${contextTokens} tokens / ${timeoutMs/1000}s timeout` (or "(not recorded)" when null). Story 6.4 thus REUSES the Section 2 Budget bullet as-is — the only change is that the values now reflect configured per-step budgets when set (vs uniform 60_000 / 300_000 prior). NO mutation to render-markdown.ts beyond ensuring the test density covers per-step configured values.'
  - story: '6.2'
    reason: 'PATTERN — Story 6.2 added `.strict()` to `OverrideEntrySchema` per I-38 forward-tracker (consumer-side schema strictness). Story 6.4 SHOULD apply `.strict()` to `BudgetSchema` per I-38 PRIMARY HONOURED — `BudgetSchema` is `z.object({...})` (NOT `z.enum`), so `.strict()` is meaningful (rejects unknown fields like `costUsd` or `maxToolCalls`). Story 6.2 OQ-4 worked example confirmed the pattern. Story 6.2 SDR forward-trackers I-34/I-35/I-36/I-37/I-38 all CARRIED forward unchanged. Story 6.4 honours I-38 SUBSTANTIVELY (vs Story 6.3 trivial honour on z.enum).'
  - story: '6.3'
    reason: 'PATTERN + IMMEDIATE PREDECESSOR — Story 6.3 (`models:` per-step config) shipped the SAME runner-side wiring pattern that Story 6.4 follows verbatim: extend `RunNextOptions.config` + `LoopOpts.config` + both `loadConfigOverride` return types with `budgets?: Budgets` (mirror of Story 6.3 `models?: Models`); thread `opts.config?.budgets?.[stepName]` into `buildDispatchSpec({...budgetOverride})` via conditional spread (mirror Story 6.3 `modelOverride` conditional spread at next/run.ts:2074-2076); replace the hardcoded `60k context, 5min timeout` substrings in the dry-run preview message at next/run.ts:2037 with resolved values (mirror Story 6.3 resolved-model substring); update inline comment at next/run.ts:2008-2014 to reflect Story 6.4 resolution. Story 6.3 SDR forward-tracker I-39 (shared `getStepConfig` helper) becomes RELEVANT for Story 6.4 — at THIS story the helper deduplicates 3 of 4 sites (models/budgets/verifiers); Story 6.4 OQ-5 adjudicates extract-vs-defer. The Section 2 "## Dispatch metadata" header (Story 6.3 OQ-3 deliverable) ALREADY contains the Budget bullet — NO render-markdown mutation. Story 6.3 SDR forward-tracker I-25 (Story 6.4 cross-coordination) PRIMARY HONOURED here.'
  - story: '1.2'
    reason: 'PRIMARY — errors-registry CI gate + ConfigError class with hintOverride seam. Story 6.4 ships ZERO new error classes — REUSES existing `ConfigError` raised at the LOADER layer (Story 6.1) for invalid `budgets:` shapes. The CI gate at src/errors.test.ts (with the Story 5.6 single-line constraint test + Story 6.1 multi-instance sweep + Story 6.2 edge-pointing instances + Story 6.3 carry) automatically covers any ConfigError instance. Registry stays at 17 codes. AC-2 references `TIMEOUT` error — ALREADY EXISTS at `src/errors.ts:200-205` (`TimeoutError extends StepperError` with `code: "TIMEOUT"`, `exitCode: 1`, hint: "Run /bmad-next --resume to retry; check bmad-stepper.config.yaml timeouts to extend the per-step deadline."). Story 6.4 does NOT add the TIMEOUT class — verifier wiring of TimeoutError IS STILL OUT-OF-SCOPE for Bun-side enforcement (verifier surfaces TIMEOUT via `verify-and-advance.ts` only when an external runtime signals timeout — best-effort same as Story 6.3 OQ-2). The dispatch-spec.json carries the TIMEOUT BUDGET; the runtime (Claude Code Task tool — Layer 1 markdown caller) is responsible for enforcing the timeout cap and surfacing TimeoutError if the cap is exceeded.'
  - story: '1.5'
    reason: 'PATTERN — schemas/migrations skeleton. Story 1.5 + 6.1 established `BudgetSchema = z.object({ contextTokens: z.number().int().positive().optional(), timeoutMs: z.number().int().positive().optional() })` at `src/schemas/config.ts:226-229`. Story 6.4 EXTENDS the schema MINIMALLY: apply `.strict()` per I-38 forward-tracker (rejects unknown fields like `costUsd` or `maxToolCalls` at LOAD time). Backwards-compat: existing fixtures use only `contextTokens` + `timeoutMs` — `.strict()` is non-breaking. The schemaVersion stays at v1 (no migration needed — `.strict()` is structural validation, not shape change).'
  - story: '1.3'
    reason: 'PRIMARY — io/log.ts (the `info` helper). Story 6.4 EXTENDS the existing `info("dispatch: built spec for step ${stepName} (model ${dispatchSpec.model}) at ${dispatchSpecPath}")` line at `src/dispatch/generate-spec.ts:255-257` to ALSO include the budget context-tokens + timeoutMs whenever NON-DEFAULT (i.e., the user configured a per-step budget). The single-line constraint stays preserved (template literal; no `\n`/`\r` per AR21+22). When the budget is at defaults (60_000 / 300_000), the log line stays at the Story 6.3 shape (no budget substring) — minimises log noise for the common case. AC-3 mandates "budget changes are surfaced in the transcript log for audit" — the markdown transcript Section 2 already records EVERY budget value (Story 6.3 OQ-3 baseline); the stderr info() line surfaces ONLY non-default values to honour the AC-3 "changes" wording verbatim. See OQ-3 for the documented stance.'
  - story: '6.5'
    reason: 'CROSS-STORY COORDINATION — Story 6.5 (`verifiers:` per-step config override) is INDEPENDENT (different config sub-schema; different consumer — verifier registry merge logic NOT dispatch-spec field). Both Stories 6.4 + 6.5 share the same `opts.config?.[section]?.[stepName] ?? default` lookup pattern. Story 6.4 OQ-5 may extract a shared `getStepConfig(config, sectionKey, stepName, default)` helper if duplication accumulates. Story 6.5 will follow the same pattern.'
  - story: '6.6'
    reason: 'CROSS-STORY COORDINATION — Story 6.6 (telemetry opt-in collection) is INDEPENDENT — the telemetry record per architecture line 1664 will record `tokensIn` / `tokensOut` (actuals) but NOT the `contextTokens` budget (the cap). Story 6.4 sources the budget for the dispatch-spec; Story 6.6 records the actuals to JSONL.'
  - story: '2.4'
    reason: 'CONSUMER — `src/commands/next/run.ts` (Story 2.4 lock-free runner) calls `buildDispatchSpec({ stepName, state, persona, ..., modelOverride? })` at the canonical happy-path site (run.ts:2065-2083). After Story 6.4, the runner ADDITIONALLY threads `budgetOverride: opts.config?.budgets?.[nextStep.name]` into the `buildDispatchSpec()` call (defaults to `undefined` → buildDispatchSpec uses 60_000 / 300_000). The wiring is a TWO-LINE change at the existing call site PLUS one-or-two lines at the dry-run preview message (run.ts:2034-2038) so the preview reflects the configured budget. Same applies to `src/commands/loop/run.ts` (Story 4.1+) — same pattern, via the productionRunNextFn closure with `effectiveConfig` already threaded.'
  - story: '5.6'
    reason: 'PATTERN — `opts.config` seam frozen. Story 5.6 froze the seam at LoopOpts + RunNextOptions + RunVerifyAndAdvanceOptions; Story 6.1 + 6.2 + 6.3 extended; Story 6.4 reads from THE SAME seam — `opts.config?.budgets?.[stepName]`. ZERO seam mutation beyond a `budgets?: Budgets` field addition (mirror of Story 6.3 `models?: Models` add). Story 5.6 OQ-9 confirmed (registry stays at 17 across Epic 6).'
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/implementation-artifacts/6-1-bmad-stepper-config-yaml-schema-loader.md
  - _bmad-output/implementation-artifacts/6-2-dag-overrides-block.md
  - _bmad-output/implementation-artifacts/6-3-models-per-step-config.md
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

# Story 6.4: `budgets:` Per-Step Config

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper user (BMAD Upgrade journey),
I want `budgets: { dev-story: { contextTokens: 80000, timeoutMs: 600000 } }` to override default budget+timeout per step,
So that complex steps get more headroom and simple ones get tighter limits, the dispatch-spec.json's `budget.contextTokens` + `budget.timeoutMs` reflect my configured values (defaulting to 60000 / 300000), the verifier surfaces TIMEOUT errors when sub-agent calls exceed the configured timeoutMs cap, and the transcript audit trail records every budget value so I can audit per-step routing.

## Context Summary

This is the **FOURTH STORY of Epic 6** and lands the **`budgets:` per-step config consumer at the dispatch-spec generator + transcript audit trail + verifier TIMEOUT contract**. Story 6.1 shipped the `loadConfig()` file loader + the typed `BudgetSchema = z.object({ contextTokens: z.number().int().positive().optional(), timeoutMs: z.number().int().positive().optional() })` at `src/schemas/config.ts:226-229` AND the `BudgetsSchema = z.record(z.string(), BudgetSchema)` at `src/schemas/config.ts:234` AND `Config.budgets: BudgetsSchema.default({})` at `src/schemas/config.ts:308`. Story 2.2 ALREADY shipped (a) the `budgetOverride?: BudgetOverride` field on `DispatchSpecInput` at `src/dispatch/types.ts:55-56` (`BudgetOverride { contextTokens?: number; timeoutMs?: number }` at `src/dispatch/types.ts:38-41`), (b) the default-with-override semantic at `src/dispatch/generate-spec.ts:208-211` with EXACT defaults `contextTokens: input.budgetOverride?.contextTokens ?? 60_000` and `timeoutMs: input.budgetOverride?.timeoutMs ?? 300_000` — these defaults match AC-1 verbatim — and (c) the `DispatchSpecV1Schema.budget: { contextTokens: z.number(), timeoutMs: z.number() }` at `src/schemas/dispatch-spec.ts:30`. Story 2.5 shipped the JSON run-log + markdown transcript already records budget; Story 6.3 OQ-3 added the Section 2 "## Dispatch metadata" header that includes the `Budget: ${contextTokens} tokens / ${timeoutMs/1000}s timeout` bullet. **Story 6.4 is therefore primarily a WIRING exercise**: thread `config.budgets[stepName]` from the loaded `opts.config` through `buildDispatchSpec.budgetOverride`, ensure the dispatch info-log line surfaces NON-DEFAULT budget values, replace the hardcoded `60k context, 5min timeout` substring in the dry-run preview, and verify the verifier-side TIMEOUT contract (the dispatch-spec.json carries the cap; the runtime / Layer 1 enforces it; `TimeoutError` is the existing class — registry held at 17).

Concretely the wiring is:

1. **AC-1 (`config.budgets[stepName]` → dispatch-spec.json's `budget.contextTokens` + `budget.timeoutMs`; defaults 60000 / 300000)**:
   - At the `buildDispatchSpec({...})` call site in `src/commands/next/run.ts:2065-2083` (the canonical happy-path), thread `budgetOverride: opts.config?.budgets?.[nextStep.name]` as a NEW field via the SAME conditional-spread pattern Story 6.3 used for `modelOverride` (line 2074-2076). When `opts.config?.budgets?.[nextStep.name]` is `undefined`, the existing fallbacks at `generate-spec.ts:208-211` fire (60_000 / 300_000).
   - When `opts.config?.budgets?.[nextStep.name]` is `{ contextTokens: 80000 }` (only one field set), the OTHER field (timeoutMs) ALSO falls through to its default — `BudgetOverride` shape allows partial overrides, and `generate-spec.ts:208-211` independently coalesces each field. This satisfies AC-1 verbatim ("the spec's `budget.contextTokens` and `budget.timeoutMs` use the configured values; otherwise defaults are 60000 / 300000").
   - Also thread the same `budgetOverride` at the dry-run preview message at `run.ts:2034-2038` so the preview reflects the configured budget (currently hardcoded as `60k context, 5min timeout` per the inline comment at `run.ts:2012-2014`).
   - Same threading at `src/commands/loop/run.ts` via the productionRunNextFn closure (the `effectiveConfig` is already threaded; only the runner-tier seam needs the `budgets?: Budgets` type extension at `LoopOpts.config` + `loadConfigOverride` return types).

2. **AC-2 (verifier uses these budgets to time out long-running sub-agent calls; TIMEOUT error)**:
   - The `TimeoutError` class ALREADY EXISTS at `src/errors.ts:200-205` (`code: "TIMEOUT"`, `exitCode: 1`, hint: "Run /bmad-next --resume to retry; check bmad-stepper.config.yaml timeouts to extend the per-step deadline."). Errors registry stays at 17; ZERO new error classes.
   - The dispatch-spec.json's `budget.timeoutMs` is the CAP. Per AR9 + AR34 the Layer 1 (slash-command markdown) is the enforcer at runtime — it captures the configured cap from `staging/<runId>/dispatch-spec.json` and forwards to the Claude Code Task tool. If the Task tool runtime exceeds the cap, the runtime surfaces a TIMEOUT condition; Layer 1 forwards via `verify-and-advance.ts --error-code TIMEOUT --error-message <detail>` which constructs a `TimeoutError` and surfaces the actionable hint (single-line, AR21+22 gate covered).
   - **Story 6.4 does NOT add Bun-side timeout enforcement** — the runtime cap is best-effort, similar to Story 6.3 OQ-2 (Task tool model parameter is best-effort). Story 6.4 GUARANTEES: (a) the dispatch-spec.json records the configured cap; (b) the transcript records the cap (Section 2 Budget bullet); (c) `TimeoutError` is the canonical error surfaced when the runtime signals timeout; (d) the verifier integration test asserts that a configured cap below the expected sub-agent runtime triggers TIMEOUT — see OQ-2 for the test strategy.
   - The "verifier" reading of AC-2 is dual: (a) `verify-and-advance.ts` is the entry point that constructs a `TimeoutError` from a `--error-code TIMEOUT` CLI flag pass-through (Story 5.x failure-UX path); (b) the verifier registry (`src/verifiers/registry.ts`) does NOT directly time out sub-agent calls — it inspects post-hoc artifacts. The "verifier uses these budgets to time out long-running sub-agent calls" wording is best read as a system-level claim ("the budget threading works end-to-end so that exceeding the cap surfaces TIMEOUT"). See OQ-2 for the verbatim adjudication.

3. **AC-3 (budget changes surfaced in transcript log for audit)**:
   - **Markdown transcript** — Section 2 "## Dispatch metadata" already includes the `Budget: ${contextTokens} tokens / ${timeoutMs/1000}s timeout` bullet (Story 6.3 OQ-3 baseline). Story 6.4 ADDS test density confirming that a configured per-step budget surfaces correctly (e.g., `Budget: 80000 tokens / 600s timeout` when configured); existing tests cover the default (`Budget: 60000 tokens / 300s timeout`) and null fallback (`Budget: (not recorded)`). NO mutation to `src/runs/render-markdown.ts`.
   - **JSON run log** — `src/schemas/run-log.ts` ALREADY records `budget: { contextTokens, timeoutMs } | null` (Story 2.5 baseline). NO mutation needed.
   - **Layer 2 stderr `info()` log** — at `src/dispatch/generate-spec.ts:255-257`, EXTEND the existing line to ALSO surface NON-DEFAULT budget values whenever the configured budget differs from defaults, e.g., `info(\`dispatch: built spec for step ${stepName} (model ${model}, budget ${contextTokens}/${timeoutMs}ms) at ${dispatchSpecPath}\`)` when `contextTokens !== 60_000 OR timeoutMs !== 300_000`. When at defaults, the log line stays at the Story 6.3 shape (no budget substring) — minimises log noise for the common case. This honours AC-3's "budget changes" wording (changes vs defaults) verbatim. See OQ-3 for the documented stance.

The runners (`src/commands/next/run.ts` + `src/commands/loop/run.ts`) thread `opts.config?.budgets?.[stepName]` once Story 6.1's `loadConfig()` is in the call chain (already wired). This is the canonical Story 6.1 SDR I-25 deliverable: ZERO loader-API change for Story 6.4; consumption through the typed `Config.budgets` field.

### What is in scope (Story 6.4)

1. **`BudgetSchema` `.strict()` extension per I-38 forward-tracker** — `src/schemas/config.ts:226-229` currently declares `BudgetSchema = z.object({ contextTokens: z.number().int().positive().optional(), timeoutMs: z.number().int().positive().optional() })`. Story 6.4 extends to `BudgetSchema = z.object({...}).strict()` per I-38 PRIMARY HONOURED. The `.strict()` rejects unknown fields like `costUsd: 500` or `maxToolCalls: 10` at LOAD time with a single-line ConfigError. Backwards-compat: existing fixtures use only `contextTokens` + `timeoutMs` — non-breaking. NO schemaVersion bump (structural validation, not shape change).

2. **`buildDispatchSpec.budgetOverride` consumer wiring** — at `src/commands/next/run.ts:2065-2083`, thread `budgetOverride: opts.config?.budgets?.[nextStep.name]` (typed via `Budget` from `src/schemas/config.ts:236`) via conditional spread (mirror Story 6.3 modelOverride pattern at run.ts:2074-2076). When undefined (no per-step config), the existing fallbacks at `generate-spec.ts:208-211` (`?? 60_000` and `?? 300_000`) fire. NO mutation to `generate-spec.ts` internals.

3. **Dry-run preview message reflects configured budget** — at `src/commands/next/run.ts:2034-2038`, replace the hardcoded `60k context, 5min timeout` substrings in the preview message (currently `\`${persona} (${resolvedModel}, 60k context, 5min timeout)\``) with the resolved budget: `\`${persona} (${resolvedModel}, ${contextTokensK}k context, ${timeoutMins}min timeout)\`` where `contextTokensK = Math.round((opts.config?.budgets?.[nextStep.name]?.contextTokens ?? 60_000) / 1000)` and `timeoutMins = Math.round((opts.config?.budgets?.[nextStep.name]?.timeoutMs ?? 300_000) / 60_000)`. The dry-run preview surfaces what the actual dispatch will use. The inline comment at `run.ts:2012-2014` (which says "Story 6.4 (`budgets:` per-step config): v0.1 still hardcodes `contextTokens: 60_000`, `timeoutMs: 300_000` (matching `generate-spec.ts:196-200`); Story 6.4 will replace those.") is UPDATED to reflect Story 6.4's resolution: `budgets:` is now read from config; the dry-run preview surfaces the configured cap.

4. **Loop runner threading** — at `src/commands/loop/run.ts`, extend `LoopOpts.config` with `budgets?: Budgets` (mirror Story 6.3 `models?: Models` add at lines 462-471) + extend `loadConfigOverride` return types (lines 485-495) with `budgets?: Budgets`. The `effectiveConfig` already flows through to runNext via `productionRunNextFn` at lines 1050-1095; no further wiring needed beyond the type extensions.

5. **`RunNextOptions.config` extension** — at `src/commands/next/run.ts:330-334` (and `loadConfigOverride` at lines 352-362), extend the inline type with `budgets?: import("../../schemas/config.ts").Budgets` (mirror Story 6.3 `models?: Models` add at line 333).

6. **Layer 2 dispatch info-log surfaces non-default budget** — at `src/dispatch/generate-spec.ts:255-257`, EXTEND the existing `info()` line to include the budget context-tokens + timeoutMs SUBSTRING WHEN non-default (i.e., the configured budget differs from defaults). When at defaults (60_000 / 300_000), the line stays at the Story 6.3 shape (no budget substring); the markdown transcript Section 2 still records the values for full audit (AC-3 satisfied). Single-line preserved (template literal; no `\n`/`\r` per AR21+22). See OQ-3.

7. **Markdown transcript renderer test density (NO mutation)** — Section 2 "## Dispatch metadata" Budget bullet (Story 6.3 baseline) ALREADY emits `Budget: ${contextTokens} tokens / ${timeoutMs/1000}s timeout`. Story 6.4 adds tests covering configured per-step values (e.g., `Budget: 80000 tokens / 600s timeout`); regression coverage for the default case (`Budget: 60000 tokens / 300s timeout`) and null fallback (`Budget: (not recorded)`) already exists.

8. **Verifier TIMEOUT contract documented** — `src/errors.ts:200-205` `TimeoutError` already exists. Story 6.4 ADDS test density at `src/integration/escalate-actionable-hint.test.ts` (existing 33-test sweep over all 17 error classes) — already covers `TimeoutError` per the Story 1.2 + 5.6 baseline. NO mutation. Document the Bun-side enforcement boundary in `commands/bmad-next.md` + `docs/configuration.md`: Layer 1 (slash-command markdown) reads `dispatchSpec.budget.timeoutMs` from `staging/<runId>/dispatch-spec.json` and forwards to the runtime; runtime acceptance is best-effort (mirror Story 6.3 OQ-2 caveat language). See OQ-2.

9. **Tests** — colocated `src/dispatch/generate-spec.test.ts` extension + `src/runs/render-markdown.test.ts` extension + `src/schemas/config.test.ts` extension + `src/commands/next/run.test.ts` extension + `src/commands/loop/run.test.ts` extension:
   - **MOD_64_SCHEMA_***: AC-1 — `BudgetSchema.parse({ contextTokens: 80000, timeoutMs: 600000 })` succeeds; `BudgetSchema.parse({ contextTokens: 80000 })` succeeds (partial); `BudgetSchema.parse({})` succeeds (empty — both fields optional); `BudgetSchema.parse({ contextTokens: -1 })` throws (positive integer constraint); `BudgetSchema.parse({ contextTokens: 1.5 })` throws (int constraint); `BudgetSchema.parse({ timeoutMs: 0 })` throws (positive constraint). Existing CFG_61_BUDGET_* tests already cover these; Story 6.4 adds AC-pointing assertions + the NEW `.strict()` tests.
   - **MOD_64_SCHEMA_STRICT_***: I-38 — `BudgetSchema.parse({ contextTokens: 80000, costUsd: 500 })` throws Zod error with `costUsd` in the unrecognized-keys path (`.strict()` rejects unknown fields).
   - **MOD_64_BUDGETS_RECORD_***: `BudgetsSchema.parse({ "dev-story": { contextTokens: 80000, timeoutMs: 600000 } })` succeeds; `BudgetsSchema.parse({})` succeeds (empty record); `BudgetsSchema.parse({ "dev-story": { contextTokens: -1 } })` throws Zod error with `dev-story.contextTokens` in the issue path.
   - **MOD_64_DISPATCH_DEFAULT_***: AC-1 default — `buildDispatchSpec({ stepName: "dev-story", state, persona: "dev" })` (no `budgetOverride`) → `result.dispatchSpec.budget === { contextTokens: 60000, timeoutMs: 300000 }`. (Already covered by existing dispatch tests; Story 6.4 adds explicit AC-pointing test.)
   - **MOD_64_DISPATCH_OVERRIDE_***: AC-1 override — `buildDispatchSpec({ ..., budgetOverride: { contextTokens: 80000, timeoutMs: 600000 } })` → `result.dispatchSpec.budget === { contextTokens: 80000, timeoutMs: 600000 }`. AC-1 partial — `buildDispatchSpec({ ..., budgetOverride: { contextTokens: 80000 } })` → `result.dispatchSpec.budget === { contextTokens: 80000, timeoutMs: 300000 }` (partial override; timeoutMs falls through).
   - **MOD_64_DISPATCH_LOG_***: AC-3 — `info()` log line at `generate-spec.ts:255-257` includes the budget substring (e.g., `(model sonnet, budget 80000/600000ms)`) WHEN non-default. WHEN at defaults — the log line stays at the Story 6.3 shape (no budget substring). Test seam: `spyOn(process.stderr, "write")` — same canonical pattern as Story 6.3 MOD_63_DISPATCH_LOG_*.
   - **MOD_64_RUN_***: AC-1 wiring — at `src/commands/next/run.test.ts`, supply `opts.config = { ..., budgets: { "<step>": { contextTokens: 80000, timeoutMs: 600000 } } }` via the existing test seam. Verify `result.dispatchSpec.budget === { contextTokens: 80000, timeoutMs: 600000 }`. Symmetric test asserting absent config.budgets[stepName] → `budget === { contextTokens: 60000, timeoutMs: 300000 }`. Symmetric test for empty record + non-matching key.
   - **MOD_64_RUN_DRYRUN_***: AC-1 dry-run — supply `opts.config = { ..., budgets: { "<step>": { contextTokens: 80000, timeoutMs: 600000 } } }` + `--dry-run` flag → preview message contains `(sonnet, 80k context, 10min timeout)` (NOT `60k context, 5min timeout`).
   - **MOD_64_LOOP_***: same pattern at `src/commands/loop/run.test.ts` — verify `loadConfigOverride` threads `budgets` through to runNext.
   - **MOD_64_TRANSCRIPT_MD_***: AC-3 markdown — `renderTranscriptMarkdown({ ..., budget: { contextTokens: 80000, timeoutMs: 600000 } })` includes the substring `Budget: 80000 tokens / 600s timeout` in the dispatch metadata section. Cross-link to existing Story 6.3 MOD_63_TRANSCRIPT_MD_* tests.
   - **MOD_64_LOAD_INVALID_***: Schema validation — fixture with `budgets: { "dev-story": { contextTokens: -1 } }` in bmad-stepper.config.yaml → `loadConfig()` throws ConfigError exit 2 with single-line hint pointing at `budgets.dev-story.contextTokens`. Fixture with `budgets: { "dev-story": { costUsd: 500 } }` → `loadConfig()` throws ConfigError with `costUsd` in the unrecognized-keys path (`.strict()` per I-38).
   - **MOD_64_TIMEOUT_***: AC-2 verifier — exercise the existing `TimeoutError` actionable-hint sweep at `src/integration/escalate-actionable-hint.test.ts:33` (already covers `TimeoutError`). Story 6.4 adds a NEW MOD_64_TIMEOUT_1 test verifying that `TimeoutError` instances surface single-line hints + the dispatch-spec.json's `budget.timeoutMs` is captured upstream when --error-code TIMEOUT is forwarded by Layer 1. NO new TimeoutError instances are constructed in src/.

10. **Documentation refresh** — minor update to `docs/configuration.md` `budgets:` section:
    - Note that Story 6.4 wires `config.budgets[stepName]` through to dispatch-spec.json's `budget.contextTokens` + `budget.timeoutMs` with 60000 / 300000 defaults.
    - Note the AC-2 caveat: the slash-command markdown forwards the `timeoutMs` cap to the Task tool runtime "where supported" — runtime acceptance is best-effort (mirror Story 6.3 OQ-2 language).
    - Document the AC-3 transcript audit trail: every budget value surfaces in the markdown transcript Section 2 (Story 6.3 OQ-3 baseline); the stderr info() log surfaces ONLY non-default values.
    - Cross-link to Story 6.4 + architecture line 782 + dispatch-spec.json shape at architecture lines 793-813 + `TimeoutError` registry entry.
    - Forward-tracker section: remove I-25 (Story 6.4 now CLOSED); add I-43 if a shared helper is extracted (TBD per OQ-5).

### Cross-story coordination preserved

- **Story 6.1 SDR I-25 PRIMARY HONOURED** — Story 6.4 consumes `config.budgets[step]` directly via the typed `Config.budgets` field. ZERO loader-API change for Story 6.4.
- **Story 6.3 SDR I-25 PRIMARY HONOURED** — Story 6.4 mirrors Story 6.3's runner-side wiring pattern (conditional spread, dry-run preview replacement, type-extension on RunNextOptions/LoopOpts/loadConfigOverride). ZERO new pattern; pure copy-paste-adapt.
- **Story 2.2 dispatch-spec generator UNCHANGED** — `buildDispatchSpec.budgetOverride` ALREADY exists; Story 6.4 only changes the CALLERS to populate `budgetOverride` from config. ZERO mutation to `src/dispatch/generate-spec.ts` internal logic; ONE single-line extension to the `info()` log line per AC-3 (conditional non-default surfacing).
- **Story 2.5 transcript writers UNCHANGED at the JSON layer** — `RunLogV1Schema.budget` and `buildRunLog()` already record `budget`. The MARKDOWN layer Section 2 "## Dispatch metadata" Budget bullet (Story 6.3 baseline) already records every budget value — ZERO mutation; Story 6.4 only adds test density.
- **Story 5.6 + 6.1 + 6.2 + 6.3 `opts.config` seam UNCHANGED** — Story 6.4 reads from the same `opts.config` field; ZERO mutation to its shape beyond a `budgets?: Budgets` field addition (mirror of Story 6.3 `models?: Models` add).
- **Errors registry HELD AT 17** — Story 6.4 ships ZERO new error classes; reuses `ConfigError` (Story 6.1 invalid-budget loader path) and `TimeoutError` (Story 1.2 baseline registry).
- **Schema migration registry HELD AT v1** — ZERO mutation to `BudgetSchema` shape; only `.strict()` validation extension (structural, not shape). NO `schemaVersion` bump.

### What is NOT in scope (deferred)

- **Bun-side timeout enforcement** — Story 6.4 does NOT add a Bun-side `setTimeout` watchdog around the Task tool invocation. Per AR9 + AR34, Layer 1 (slash-command markdown) forwards the cap to the runtime; runtime acceptance is best-effort. A future Story 6.x may add Bun-side enforcement (e.g., a pre-flight `Promise.race([taskPromise, sleep(timeoutMs)])` wrapper). Forward-tracker I-44 records the option.
- **Per-model default budgets** (e.g., "Opus needs 2x timeout") — DEFERRED. Story 6.4 v0.1 supports per-step configured budgets only. Per-model defaults could land as Story 6.x.
- **Tightening `DispatchSpecV1Schema.budget` to a stricter zod shape** — DEFERRED. The dispatch-spec.json file is INTERNAL; tightening would couple `src/schemas/dispatch-spec.ts` to `src/schemas/config.ts`. Forward-tracker I-45 records the option (similar to Story 6.3 I-40 for `model`).
- **`budgets: { "*": {...} }` wildcard step matching** — DEFERRED. v0.1 supports exact-step-id keys only (e.g., `budgets: { "bmad-dev-story": {...} }`). Wildcard support is a Story 6.x extension.
- **`--budget-context-tokens <n>` / `--budget-timeout-ms <n>` CLI flag overrides** — DEFERRED (Story 6.x). Users configure via `bmad-stepper.config.yaml` for now.
- **Telemetry collection of budget field** — DEFERRED to Story 6.6 per architecture line 1664 (`TelemetryRecordV1Schema` closed-set includes `tokensIn` / `tokensOut` actuals; the `contextTokens` budget cap may or may not be recorded — Story 6.6 decides).
- **`--no-budgets` config-disable flag** — DEFERRED (Story 6.x — same forward-tracker as `--no-models` / `--no-overrides`).
- **Shared `getStepConfig(config, sectionKey, stepName, default)` helper** — Story 6.3 I-39 carry-over. Story 6.4 OQ-5 adjudicates extract-vs-defer based on whether duplication accumulates across 3+ call sites (config.models / config.budgets / config.failurePolicies — Story 5.6 / config.overrides — Story 6.2 / config.verifiers — Story 6.5).

### Architectural challenges resolved here

**Architectural decision — apply `.strict()` to `BudgetSchema` per I-38 (per OQ-1)**: I-38 forward-tracker (Story 6.2) noted that `.strict()` discipline applies to `z.object` schemas (NOT `z.enum` — Story 6.3 noted trivial honour). `BudgetSchema = z.object({...})` is a `z.object`, so `.strict()` is meaningful — it rejects unknown fields like `costUsd: 500` or `maxToolCalls: 10` at LOAD time. Story 6.4 SUBSTANTIVELY honours I-38 by extending `BudgetSchema` to `.strict()`. Backwards-compat: existing fixtures use only `contextTokens` + `timeoutMs` — non-breaking.

**Architectural decision — verifier TIMEOUT contract is best-effort (per OQ-2)**: AC-2 verbatim says "the verifier uses these budgets to time out long-running sub-agent calls (TIMEOUT error)". The "verifier" reading is dual: (a) `verify-and-advance.ts` is the entry point that constructs a `TimeoutError` from a `--error-code TIMEOUT` CLI flag pass-through (Story 5.x failure-UX path); (b) the verifier registry (`src/verifiers/registry.ts`) does NOT directly time out sub-agent calls — it inspects post-hoc artifacts. The dispatch-spec.json's `budget.timeoutMs` is the CAP carried through to Layer 1; the runtime (Claude Code Task tool) is responsible for enforcing the cap and surfacing TIMEOUT. This is the SAME best-effort stance Story 6.3 OQ-2 took for the `model` parameter pass-through. Stepper guarantees: (a) the dispatch-spec.json records the cap; (b) the transcript records the cap; (c) `TimeoutError` is the canonical error class (already at registry — registry stays at 17). The "verifier uses these budgets" wording is best read as a system-level claim ("the budget threading works end-to-end so that exceeding the cap surfaces TIMEOUT"). The Bun-side enforcement option is forward-tracker I-44.

**Architectural decision — `info()` log surfaces only NON-DEFAULT budget values (per OQ-3)**: AC-3 verbatim says "budget changes are surfaced in the transcript log for audit". The "changes" wording is dual: (a) the markdown transcript Section 2 records EVERY budget value (Story 6.3 OQ-3 baseline) — full audit; (b) the stderr info() log line surfaces ONLY non-default values to minimise log noise for the common case (60_000 / 300_000). When the configured budget DIFFERS from defaults, the log line surfaces `(... budget ${contextTokens}/${timeoutMs}ms)` substring. When at defaults, the log line stays at the Story 6.3 shape. The combined audit trail satisfies AC-3 verbatim — "budget changes" surface in the stderr log; FULL budget values surface in the markdown transcript + JSON run log. Single-line constraint preserved (template literal; no `\n`/`\r`). AR22 actionable-hint regex N/A here (this is a progress log, not an error hint).

**Architectural decision — markdown transcript Section 2 unchanged (per OQ-4)**: Story 6.3 OQ-3 added Section 2 "## Dispatch metadata" with the Budget bullet (`Budget: ${contextTokens} tokens / ${timeoutMs/1000}s timeout` or "(not recorded)"). Story 6.4 REUSES the existing bullet AS-IS — ZERO mutation to `src/runs/render-markdown.ts`. The values now reflect configured per-step budgets when set; existing tests cover the default case + null fallback; Story 6.4 adds tests for configured non-default values.

**Architectural decision — log line single-line constraint (AR21+AR22)**: The extended `info()` line at `generate-spec.ts:255-257` is single-line by construction (template literal with no `\n`). AR22 actionable-hint regex (`/^.*(Run|See|Try|Check) /`) does NOT apply to progress logs (only to error hints); the extended log line is a dispatch progress log (info-tier), not an error hint. The single-line constraint is preserved for human-readability + log-aggregation friendliness.

**Architectural decision — slash-command markdown extension preserves AR9 + AR34 boundaries (per OQ-2)**: The Layer 1 slash-command markdown does NOT need an additional Task pseudo-call extension for `timeoutMs` (the Task tool does NOT accept a per-call `timeoutMs` parameter; runtime caps are tool-internal). Story 6.4 only DOCUMENTS the cap-pass-through stance (mirror Story 6.3 OQ-2 caveat language) — Layer 1 reads `dispatchSpec.budget.timeoutMs` from `staging/<runId>/dispatch-spec.json` for AUDIT (it's already in the markdown body's "## Inputs" reference). NO Task pseudo-call extension needed. The markdown body adds a small caveat paragraph documenting the best-effort runtime contract.

**Architectural decision — shared `getStepConfig` helper DEFERRED (per OQ-5)**: After Story 6.4, the lookup pattern `opts.config?.[section]?.[stepName] ?? default` appears at 4 sites: `config.models` (Story 6.3), `config.budgets` (Story 6.4), `config.failurePolicies` (Story 5.6), `config.overrides` (Story 6.2). Story 6.5 will add `config.verifiers` as the 5th site. Story 6.4 OQ-5 DEFERS the extraction — the duplication is shallow (2-line lookup each) and an extracted helper would add typing complexity (per-section default value types differ). Forward-tracker I-43 records the option for Story 6.5+ if the duplication accumulates further.

### Concretely, Story 6.4 produces

- **MODIFIED file 1**: `src/schemas/config.ts` — adds `.strict()` to `BudgetSchema` (line 226-229). Net additions: ~1-2 LoC (just the `.strict()` chained call + JSDoc note).
- **MODIFIED file 2**: `src/schemas/config.test.ts` — adds 4-6 MOD_64_SCHEMA_* + MOD_64_SCHEMA_STRICT_* + MOD_64_BUDGETS_RECORD_* tests covering BudgetSchema strict + edge cases. Net additions: ~50 LoC.
- **MODIFIED file 3**: `src/dispatch/generate-spec.ts` — extension to the `info()` log line at line 255-257 to include the budget substring `(... budget ${contextTokens}/${timeoutMs}ms)` WHEN non-default. Net additions: ~5-8 LoC (1 modified, 4-7 conditional + JSDoc note).
- **MODIFIED file 4**: `src/dispatch/generate-spec.test.ts` — adds 2-3 MOD_64_DISPATCH_DEFAULT_* + MOD_64_DISPATCH_OVERRIDE_* + MOD_64_DISPATCH_LOG_* tests. Net additions: ~50 LoC.
- **MODIFIED file 5**: `src/runs/render-markdown.test.ts` — adds 2-3 MOD_64_TRANSCRIPT_MD_* tests covering configured non-default budget values. Net additions: ~40 LoC.
- **MODIFIED file 6**: `src/commands/next/run.ts` — extends `RunNextOptions.config` with `budgets?: Budgets` (line 333) + extends `loadConfigOverride` return type (lines 354-361) + threads `budgetOverride: opts?.config?.budgets?.[nextStep.name]` into `buildDispatchSpec({...})` call (lines 2065-2083) + replaces hardcoded `60k context, 5min timeout` substring in dry-run preview at lines 2034-2038 + updates inline comment at lines 2008-2014. Net additions: ~12 LoC.
- **MODIFIED file 7**: `src/commands/next/run.test.ts` — adds 4-6 MOD_64_RUN_* + MOD_64_RUN_DRYRUN_* tests. Net additions: ~120 LoC.
- **MODIFIED file 8**: `src/commands/loop/run.ts` — extends `LoopOpts.config` with `budgets?: Budgets` (line 471) + extends `loadConfigOverride` return type (lines 489-495) with `budgets?: Budgets`. NO direct call-site change — `effectiveConfig` already flows through. Net additions: ~4 LoC.
- **MODIFIED file 9**: `src/commands/loop/run.test.ts` — adds 1-2 MOD_64_LOOP_* tests asserting opts.config.budgets flows through productionRunNextFn. Net additions: ~50 LoC.
- **MODIFIED file 10**: `commands/bmad-next.md` — adds a small caveat paragraph below the existing Step 3 dispatch case documenting AC-2 best-effort timeout contract (mirror Story 6.3 OQ-2 caveat language). Net additions: ~10 LoC.
- **MODIFIED file 11**: `commands/bmad-loop.md` — adds same caveat at the analogous block. Net additions: ~10 LoC.
- **MODIFIED file 12**: `docs/configuration.md` — extends the `budgets:` section with Story 6.4 wiring note + AC-2 caveat + AC-3 audit trail note + cross-links + forward-tracker update. Net additions: ~30 LoC.

ZERO NEW files. ZERO new error classes. ZERO new schema migrations. ZERO mutations to: `src/errors.ts`, `src/migrations/config/index.ts`, `src/schemas/dispatch-spec.ts` (open `budget` shape preserved), `src/schemas/run-log.ts` (budget field unchanged), `src/dag/*`, `src/state/*`, `src/failure-ux/*`, `src/config/*` (loader consumed unchanged), `src/runs/render-markdown.ts` (Section 2 Budget bullet unchanged from Story 6.3), `src/runs/build-run-log.ts` (budget field unchanged), `src/runs/types.ts` (budget field unchanged), `src/runs/write-step.ts` (writer unchanged).

## Acceptance Criteria

The following are reproduced byte-identical from `_bmad-output/planning-artifacts/epics.md` lines 1201-1213:

**Given** `budgets:` config block
**When** dispatch-spec is generated for a configured step
**Then** the spec's `budget.contextTokens` and `budget.timeoutMs` use the configured values; otherwise defaults are 60000 / 300000
**And** the verifier uses these budgets to time out long-running sub-agent calls (TIMEOUT error)
**And** budget changes are surfaced in the transcript log for audit

## Tasks / Subtasks

- [x] 1. **Context — read all relevant files completely** (carry-over discipline from Stories 6.1 + 6.2 + 6.3)
  - [x] 1.1 Read `_bmad-output/implementation-artifacts/6-3-models-per-step-config.md` — focus on (a) the Forward Action Items section (4 nits N-1/N-2/N-3/N-4 + 42 info I-1 through I-42; I-25 to Story 6.4 PRIMARY HONOURED here; I-33 sporadic flake at src/smoke/next.test.ts:374 NOT a regression; I-38 `.strict()` discipline applies SUBSTANTIVELY here for `BudgetSchema = z.object`; I-39 shared getStepConfig helper potential — Story 6.4 OQ-5 adjudicates); (b) the SDR Quality Gates table baseline (1402/0/4707 across 70 files; errors registry 17); (c) the Story 6.3 close: `models:` consumer wired at runner; transcript Section 2 added; AR9 invariants preserved.
  - [x] 1.2 Read `_bmad-output/implementation-artifacts/6-1-bmad-stepper-config-yaml-schema-loader.md` — focus on (a) Story 6.1 SDR I-25 verbatim ("BudgetsSchema is closed shape; Story 6.4 budget enforcer uses defaults"); (b) the loader's invalid-budget error path (CorruptStateError → ConfigError + extractZodFieldPath + single-line hint); (c) docs/configuration.md `budgets:` section.
  - [x] 1.3 Read `_bmad-output/implementation-artifacts/2-2-dispatch-spec-generator.md` — focus on (a) the `BuildDispatchSpecInput` shape including `budgetOverride?: BudgetOverride`; (b) the `info()` log line at `generate-spec.ts:240-242` (extended by Story 6.3 to lines 255-257); (c) the `DispatchSpecV1Schema.budget: { contextTokens, timeoutMs }` shape rationale.
  - [x] 1.4 Read `_bmad-output/implementation-artifacts/2-5-markdown-transcript-json-run-log-writers.md` — focus on (a) the existing `TranscriptInput.budget: { contextTokens, timeoutMs } | null` field; (b) the markdown renderer's Section 2 "## Dispatch metadata" Budget bullet (Story 6.3 baseline at render-markdown.ts:84-97); (c) the `buildRunLog()` already wires `budget: input.budget`.
  - [x] 1.5 Read `_bmad-output/implementation-artifacts/epic-5-retrospective.md` — Recommendations item 3 (registry stability — ZERO new error classes per Epic 6 start) + item 6 (cross-story coordination via opts.config seam).
  - [x] 1.6 Read `src/schemas/config.ts` (327 lines) full pass — focus on (a) `BudgetSchema` at lines 226-229 (`z.object({contextTokens, timeoutMs})`); (b) `BudgetsSchema = z.record(z.string(), BudgetSchema)` at line 234; (c) `Budgets` type alias at line 237; (d) `Config.budgets: BudgetsSchema.default({})` at line 308.
  - [x] 1.7 Read `src/schemas/config.test.ts` (738 lines) full pass — recover the existing CFG_61_BUDGET_* test density at lines 366-394; identify regression-coverage gaps for Story 6.4 `.strict()` extension.
  - [x] 1.8 Read `src/dispatch/generate-spec.ts` (260 lines) full pass — focus on (a) the `BuildDispatchSpecInput.budgetOverride?: BudgetOverride` field at types.ts:55-56; (b) the `contextTokens: input.budgetOverride?.contextTokens ?? 60_000` + `timeoutMs: input.budgetOverride?.timeoutMs ?? 300_000` defaults at lines 208-211; (c) the `info()` log line at lines 255-257 (Story 6.4 extends conditionally).
  - [x] 1.9 Read `src/dispatch/generate-spec.test.ts` (564 lines) full pass — focus on (a) the existing budget-default test (if any); (b) the existing budgetOverride test (if any); (c) the Story 6.3 MOD_63_DISPATCH_LOG_* spy() pattern at lines 480+ (reuse for MOD_64_DISPATCH_LOG_*).
  - [x] 1.10 Read `src/runs/render-markdown.ts` (150 lines) full pass — confirm Section 2 "## Dispatch metadata" Budget bullet at lines 84-97 emits `Budget: ${contextTokens} tokens / ${timeoutMs/1000}s timeout` correctly. ZERO mutation needed.
  - [x] 1.11 Read `src/runs/render-markdown.test.ts` (296 lines) full pass — recover the existing Story 6.3 MOD_63_TRANSCRIPT_MD_* tests for the Budget bullet; identify the test-density gap for configured non-default values (e.g., 80000 / 600000).
  - [x] 1.12 Read `src/runs/build-run-log.ts` + `src/runs/types.ts` — confirm `budget: { contextTokens, timeoutMs } | null` is already wired; ZERO change needed.
  - [x] 1.13 Read `src/commands/next/run.ts` lines 1990-2090 — focus on (a) the dry-run preview message at lines 2034-2038 (the hardcoded `60k context, 5min timeout` substring); (b) the buildDispatchSpec call at lines 2065-2083 (the wiring site — Story 6.3 modelOverride pattern at lines 2074-2076 to mirror); (c) the inline comment at lines 2008-2014 (which Story 6.4 updates to reflect resolution); (d) `RunNextOptions.config` at lines 330-334 (extend with `budgets?: Budgets`); (e) `loadConfigOverride` return type at lines 352-362 (extend with `budgets?: Budgets`).
  - [x] 1.14 Read `src/commands/loop/run.ts` lines 460-500 — locate `LoopOpts.config` at lines 468-472 (extend with `budgets?: Budgets`) + `loadConfigOverride` return type at lines 485-495 (extend with `budgets?: Budgets`). NO call-site change — `effectiveConfig` already flows through `productionRunNextFn` at lines 1050-1095.
  - [x] 1.15 Read `commands/bmad-next.md` lines 90-118 — focus on the Step 3 dispatch case (Story 6.3 OQ-2 caveat at lines 105-112). Story 6.4 ADDS a small caveat below documenting AC-2 best-effort timeout contract.
  - [x] 1.16 Read `commands/bmad-loop.md` — locate the analogous Step 3 dispatch block.
  - [x] 1.17 Read `docs/configuration.md` — locate the existing `budgets:` section for the documentation refresh + cross-link to architecture line 782.
  - [x] 1.18 Read `src/errors.ts` lines 195-205 — confirm `TimeoutError` class exists with `code: "TIMEOUT"`, `exitCode: 1`, single-line hint. Story 6.4 references this class but does NOT modify it.
  - [x] 1.19 Read `src/integration/escalate-actionable-hint.test.ts` — confirm 33-test sweep covers `TimeoutError`. Story 6.4 verifies this test passes UNCHANGED (33/0/114 baseline).

- [x] 2. **Schema `.strict()` extension + test density — `BudgetSchema` MOD_64_SCHEMA_* + MOD_64_SCHEMA_STRICT_* coverage**
  - [x] 2.1 At `src/schemas/config.ts:226-229`, extend `BudgetSchema = z.object({...})` to `BudgetSchema = z.object({...}).strict()`. Add JSDoc note: "Story 6.4 — `.strict()` per I-38 forward-tracker (rejects unknown fields like `costUsd` or `maxToolCalls` at LOAD time). Backwards-compat: existing fixtures use only `contextTokens` + `timeoutMs`."
  - [x] 2.2 MOD_64_SCHEMA_1: parametric — `BudgetSchema.parse({ contextTokens: 80000, timeoutMs: 600000 })` succeeds.
  - [x] 2.3 MOD_64_SCHEMA_2: `BudgetSchema.parse({ contextTokens: 80000 })` succeeds (partial; timeoutMs optional).
  - [x] 2.4 MOD_64_SCHEMA_3: `BudgetSchema.parse({})` succeeds (empty — both fields optional).
  - [x] 2.5 MOD_64_SCHEMA_STRICT_1: `BudgetSchema.parse({ contextTokens: 80000, costUsd: 500 })` throws Zod error with `costUsd` in unrecognized-keys path.
  - [x] 2.6 MOD_64_SCHEMA_STRICT_2: `BudgetSchema.parse({ contextTokens: 80000, maxToolCalls: 10 })` throws Zod error.
  - [x] 2.7 MOD_64_BUDGETS_RECORD_1: `BudgetsSchema.parse({})` succeeds (empty record — backwards-compat for Story 6.1 fixtures).
  - [x] 2.8 MOD_64_BUDGETS_RECORD_2: `BudgetsSchema.parse({ "dev-story": { contextTokens: 80000, timeoutMs: 600000 }, "code-review": { contextTokens: 100000 } })` succeeds.
  - [x] 2.9 MOD_64_BUDGETS_RECORD_3: `BudgetsSchema.parse({ "dev-story": { contextTokens: -1 } })` throws Zod error with `dev-story.contextTokens` in issue path.
  - [x] 2.10 Verify all existing CFG_61_BUDGET_* tests at lines 366-394 pass unchanged (regression).

- [x] 3. **Dispatch generator log line conditional extension**
  - [x] 3.1 Extend `src/dispatch/generate-spec.ts:255-257` from `info(\`dispatch: built spec for step ${input.stepName} (model ${dispatchSpec.model}) at ${dispatchSpecPath}\`)` to a conditional that ALSO includes the budget substring WHEN non-default:
    ```
    const isDefaultBudget = dispatchSpec.budget.contextTokens === 60_000 && dispatchSpec.budget.timeoutMs === 300_000;
    info(
      `dispatch: built spec for step ${input.stepName} (model ${dispatchSpec.model}` +
      (isDefaultBudget ? "" : `, budget ${dispatchSpec.budget.contextTokens}/${dispatchSpec.budget.timeoutMs}ms`) +
      `) at ${dispatchSpecPath}`,
    );
    ```
  - [x] 3.2 Single-line constraint preserved (template literal chained via `+` operators; no `\n`/`\r`).
  - [x] 3.3 Update the JSDoc block above buildDispatchSpec (lines 41-58 per Story 6.3 close) to reference Story 6.4 + AC-3 (budget changes on dispatch log line — non-default surface only).

- [x] 4. **Dispatch generator tests — MOD_64_DISPATCH_* coverage**
  - [x] 4.1 MOD_64_DISPATCH_DEFAULT_1: AC-1 verbatim — `buildDispatchSpec({ stepName: "dev-story", state, persona: "dev" })` (no `budgetOverride`) → `result.dispatchSpec.budget === { contextTokens: 60000, timeoutMs: 300000 }`. (Cross-link to existing dispatch-spec test if present.)
  - [x] 4.2 MOD_64_DISPATCH_OVERRIDE_1: AC-1 — `buildDispatchSpec({ ..., budgetOverride: { contextTokens: 80000, timeoutMs: 600000 } })` → `result.dispatchSpec.budget === { contextTokens: 80000, timeoutMs: 600000 }`.
  - [x] 4.3 MOD_64_DISPATCH_OVERRIDE_2: AC-1 partial — `buildDispatchSpec({ ..., budgetOverride: { contextTokens: 80000 } })` → `result.dispatchSpec.budget === { contextTokens: 80000, timeoutMs: 300000 }` (partial override; timeoutMs falls through to default).
  - [x] 4.4 MOD_64_DISPATCH_OVERRIDE_3: AC-1 partial — `buildDispatchSpec({ ..., budgetOverride: { timeoutMs: 600000 } })` → `result.dispatchSpec.budget === { contextTokens: 60000, timeoutMs: 600000 }` (partial override; contextTokens falls through to default).
  - [x] 4.5 MOD_64_DISPATCH_LOG_1: AC-3 — assert that `info()` is called with a string that does NOT contain `budget` substring when budget at defaults (60_000/300_000). Test seam: spy on `process.stderr.write` (Story 6.3 MOD_63_DISPATCH_LOG_* canonical pattern).
  - [x] 4.6 MOD_64_DISPATCH_LOG_2: AC-3 — assert that `info()` is called with a string matching `/dispatch: built spec for step .* \(model (sonnet|opus|haiku), budget 80000\/600000ms\)/` when `budgetOverride: { contextTokens: 80000, timeoutMs: 600000 }`.
  - [x] 4.7 MOD_64_DISPATCH_LOG_3: AR21+22 — assert that the `info()` log line is single-line (no `\n`/`\r` characters in any captured stderr write).

- [x] 5. **Markdown transcript renderer — test density only (NO ts mutation)**
  - [x] 5.1 Verify `src/runs/render-markdown.ts` Section 2 Budget bullet at lines 84-97 already emits `Budget: ${contextTokens} tokens / ${timeoutMs/1000}s timeout` correctly for ANY input. NO change.
  - [x] 5.2 MOD_64_TRANSCRIPT_MD_1: AC-3 — supply `TranscriptInput.budget = { contextTokens: 80000, timeoutMs: 600000 }` → output contains `Budget: 80000 tokens / 600s timeout`.
  - [x] 5.3 MOD_64_TRANSCRIPT_MD_2: AC-3 — supply `budget = { contextTokens: 100000, timeoutMs: 1200000 }` → output contains `Budget: 100000 tokens / 1200s timeout`.
  - [x] 5.4 MOD_64_TRANSCRIPT_MD_3: AC-3 regression — supply `budget = null` → output contains `Budget: (not recorded)` (existing Story 6.3 MOD_63_TRANSCRIPT_MD_3 covers — re-confirm no regression).

- [x] 6. **Wire `opts.config?.budgets?.[stepName]` → `buildDispatchSpec` at the runner call site**
  - [x] 6.1 At `src/commands/next/run.ts:330-334`, extend `RunNextOptions.config` inline type with `budgets?: import("../../schemas/config.ts").Budgets` (mirror Story 6.3 `models?: Models` add at line 333).
  - [x] 6.2 At `src/commands/next/run.ts:352-362`, extend `loadConfigOverride` return type with `budgets?: Budgets` (mirror Story 6.3 add at lines 356, 361).
  - [x] 6.3 At `src/commands/next/run.ts:2065-2083`, locate the existing `buildDispatchSpec({...})` call (Story 6.3 close threaded `modelOverride` via conditional spread at lines 2074-2076). Add MIRROR conditional spread BELOW it:
    ```
    const configuredBudget = opts?.config?.budgets?.[nextStep.name];
    // (in the buildDispatchSpec call)
    ...(configuredBudget !== undefined
      ? { budgetOverride: configuredBudget }
      : {}),
    ```
  - [x] 6.4 At `src/commands/next/run.ts:2034-2038`, replace the hardcoded `60k context, 5min timeout` substrings in the dry-run preview message:
    ```
    const resolvedBudget = opts?.config?.budgets?.[nextStep.name];
    const contextTokensK = Math.round((resolvedBudget?.contextTokens ?? 60_000) / 1000);
    const timeoutMins = Math.round((resolvedBudget?.timeoutMs ?? 300_000) / 60_000);
    const message =
      `Dry-run: would dispatch ${nextStep.name} (epic ${epic} / story ${story}) → ` +
      `${persona} (${resolvedModel}, ${contextTokensK}k context, ${timeoutMins}min timeout). ` +
      `Expected output: ${expectedOutput}`;
    ```
  - [x] 6.5 At `src/commands/next/run.ts:2008-2014`, update the inline comment to reflect Story 6.4's resolution: change `Story 6.4 (\`budgets:\` per-step config): v0.1 still hardcodes \`contextTokens: 60_000\`, \`timeoutMs: 300_000\` (matching \`generate-spec.ts:196-200\`); Story 6.4 will replace those.` to `Story 6.4 (\`budgets:\` per-step config): \`budget.contextTokens\` + \`budget.timeoutMs\` resolved from \`opts.config?.budgets?.[stepName]\` (default 60_000 / 300_000 per AC-1). The dry-run preview surfaces the configured cap.`
  - [x] 6.6 Verify ZERO upward imports added — `src/commands/` is top-tier and already imports `src/dispatch/` directly; no boundary change.

- [x] 7. **Loop runner type extension (no call-site change)**
  - [x] 7.1 At `src/commands/loop/run.ts:468-472`, extend `LoopOpts.config` with `budgets?: import("../../schemas/config.ts").Budgets` (mirror Story 6.3 add at line 471).
  - [x] 7.2 At `src/commands/loop/run.ts:485-495`, extend `loadConfigOverride` return type (both `Promise<{...}>` and direct `{...}`) with `budgets?: Budgets` (mirror Story 6.3 add at lines 489, 494).
  - [x] 7.3 NO change to the `productionRunNextFn` closure at lines 1050-1095 — `effectiveConfig` already flows through to runNext's `RunNextOptions.config` (which now includes `budgets?` via Task 6.1).

- [x] 8. **Runner tests — add MOD_64_RUN_* + MOD_64_LOOP_***
  - [x] 8.1 MOD_64_RUN_1: AC-1 — at `src/commands/next/run.test.ts`, supply `opts.config = { ..., budgets: { "<step>": { contextTokens: 80000, timeoutMs: 600000 } } }` via the existing test seam (loadConfigOverride or direct opts.config pass). Verify `result.dispatchSpec.budget === { contextTokens: 80000, timeoutMs: 600000 }`.
  - [x] 8.2 MOD_64_RUN_2: AC-1 fallback — supply `opts.config = { ..., budgets: {} }` (empty record) → `result.dispatchSpec.budget === { contextTokens: 60000, timeoutMs: 300000 }`.
  - [x] 8.3 MOD_64_RUN_3: AC-1 fallback — supply `opts.config = { ..., budgets: { "other-step": {...} } }` (non-matching key) → `result.dispatchSpec.budget === { contextTokens: 60000, timeoutMs: 300000 }`.
  - [x] 8.4 MOD_64_RUN_4: AC-1 partial — supply `opts.config = { ..., budgets: { "<step>": { contextTokens: 80000 } } }` → `result.dispatchSpec.budget === { contextTokens: 80000, timeoutMs: 300000 }`.
  - [x] 8.5 MOD_64_RUN_DRYRUN_1: AC-1 dry-run — supply `opts.config = { ..., budgets: { "<step>": { contextTokens: 80000, timeoutMs: 600000 } } }` + `args.dryRun = true` → preview message contains `(sonnet, 80k context, 10min timeout)` (NOT `60k context, 5min timeout`).
  - [x] 8.6 MOD_64_RUN_DRYRUN_2: AC-1 dry-run default — supply `opts.config = { ..., budgets: {} }` + `args.dryRun = true` → preview message contains `(sonnet, 60k context, 5min timeout)` (default values).
  - [x] 8.7 MOD_64_LOOP_1: at `src/commands/loop/run.test.ts`, supply `opts.config = { ..., budgets: { "<step>": { contextTokens: 80000 } } }` via the test seam → verify the threaded `runNext` call sees `opts.config.budgets`. (loop/run.ts itself has no direct call-site change; this is a regression test asserting the seam flows through.)
  - [x] 8.8 MOD_64_LOOP_2: at `src/commands/loop/run.test.ts`, exercise `loadConfigOverride` returning a config with `budgets: {...}` → verify the synthetic config flows to runNext via the productionRunNextFn closure.

- [x] 9. **Slash-command markdown — caveat paragraph for AC-2 best-effort timeout contract**
  - [x] 9.1 At `commands/bmad-next.md`, locate the Story 6.3 OQ-2 caveat block at lines 105-112. Add a NEW paragraph BELOW that documents Story 6.4 AC-2 timeout best-effort:
    ```
    Note (Story 6.4 AC-2 — `timeoutMs` cap is best-effort): The dispatch-spec.json's
    `budget.timeoutMs` is the configured per-step timeout cap (default 300000ms / 5min).
    The Claude Code Task tool runtime is responsible for enforcing the cap and surfacing
    a TIMEOUT condition if exceeded. Stepper records the cap in the dispatch-spec.json
    + transcript markdown + JSON run log for audit purposes — the configured cap is the
    user's INTENT; runtime enforcement is best-effort. If the runtime exceeds the cap,
    the slash-command markdown forwards `--error-code TIMEOUT` to verify-and-advance.ts
    which constructs `TimeoutError` (registry code TIMEOUT, exitCode 1, single-line
    hint). See `docs/configuration.md` `budgets:` section for configuration syntax.
    ```
  - [x] 9.2 At `commands/bmad-loop.md`, locate the analogous Step 3 dispatch block (Story 4.1+ established) and apply the same caveat extension.
  - [x] 9.3 NO Task pseudo-call extension — the Task tool does NOT accept a per-call `timeoutMs` parameter; runtime caps are tool-internal. Story 6.4 only documents the cap-pass-through stance.

- [x] 10. **Documentation — `docs/configuration.md` budgets section refresh**
  - [x] 10.1 Locate the existing `budgets:` section (Story 6.1 produced this).
  - [x] 10.2 Add a "### Wiring (Story 6.4)" sub-section noting:
    - `config.budgets[stepName]` is read by the runner and threaded into `buildDispatchSpec.budgetOverride`.
    - When undefined (no per-step config), `buildDispatchSpec` falls back to defaults (60000 / 300000) per AC-1.
    - Partial overrides are supported — e.g., `{ contextTokens: 80000 }` overrides only contextTokens; timeoutMs falls through to default.
    - The dispatch-spec.json's `budget.contextTokens` + `budget.timeoutMs` fields are recorded; the transcript markdown's "## Dispatch metadata" section records both values for audit.
  - [x] 10.3 Add a "### TIMEOUT contract (where supported)" sub-section documenting AC-2 best-effort runtime enforcement (mirror Story 6.3 OQ-2 caveat language for timeoutMs).
  - [x] 10.4 Add a "### Audit trail (AC-3)" sub-section documenting:
    - Every budget value surfaces in the markdown transcript Section 2 "## Dispatch metadata" (Story 6.3 OQ-3 baseline).
    - The stderr `info()` log line surfaces ONLY non-default budget values (Story 6.4 OQ-3 documented stance — minimises log noise for the common case).
    - The JSON run log (`<runId>.json`) records the budget on every dispatch (Story 2.5 baseline).
  - [x] 10.5 Cross-link to architecture line 782 (config schema) + architecture lines 793-813 (dispatch-spec.json shape) + Story 6.4 + commands/bmad-{loop,next}.md per single-source-of-truth + `TimeoutError` registry entry.
  - [x] 10.6 Update the forward-tracker section to remove I-25 (Story 6.4 now CLOSED) and forward to Stories 6.5-6.6 still pending.

- [x] 11. **Quality gates — verify ALL green BEFORE finalising**
  - [x] 11.1 `bunx tsc --noEmit` exit 0.
  - [x] 11.2 `bun run check` (biome ci + tests) exit 0.
  - [x] 11.3 `bun test` baseline 1402/0/4707 across 70 files → expected 1402 + (~10-15 new) / 0 / 4707 + (~25-40 new). Snapshot final test counts AFTER the LAST `biome --write` pass (per N-3 discipline).
  - [x] 11.4 `bun test src/errors.test.ts` 15/0/249 (UNCHANGED — registry stays at 17).
  - [x] 11.5 `bun test src/dispatch/generate-spec.test.ts` baseline 29 tests (Story 6.3 close: 29 with MOD_63_DISPATCH_LOG_*) → +3-5 new MOD_64_DISPATCH_*.
  - [x] 11.6 `bun test src/runs/render-markdown.test.ts` baseline 17 tests (Story 6.3 close) → +2-3 new MOD_64_TRANSCRIPT_MD_*.
  - [x] 11.7 `bun test src/schemas/config.test.ts` baseline 77 tests (Story 6.3 close: 77 with MOD_63_SCHEMA_* + MOD_63_MODELS_RECORD_*) → +6-9 new MOD_64_SCHEMA_* + MOD_64_SCHEMA_STRICT_* + MOD_64_BUDGETS_RECORD_*.
  - [x] 11.8 `bun test src/integration/escalate-actionable-hint.test.ts` 33/0/114 (UNCHANGED — sweep over all 17 error classes; no new ConfigError or TimeoutError instances introduced).
  - [x] 11.9 `grep -c "extends StepperError" src/errors.ts` = 17 (UNCHANGED).
  - [x] 11.10 AR41 boundary verification: `grep "from \"\\.\\./schemas/dispatch-spec\"" src/dispatch/generate-spec.ts` returns exactly ONE match (existing import; no new boundary crossing).
  - [x] 11.11 Per-AC verification: AC-1 → MOD_64_DISPATCH_DEFAULT_*/OVERRIDE_*/MOD_64_RUN_*/MOD_64_RUN_DRYRUN_*/MOD_64_LOOP_*; AC-2 → docs review (commands/bmad-{loop,next}.md include the Story 6.4 AC-2 caveat) + `bun test src/integration/escalate-actionable-hint.test.ts` covers TimeoutError; AC-3 → MOD_64_DISPATCH_LOG_*/MOD_64_TRANSCRIPT_MD_*.

- [x] 12. **Frontmatter + final state**
  - [x] 12.1 Update story frontmatter: status: ready-for-dev → review (after dev complete).
  - [x] 12.2 Update sprint-status: 6-4-budgets-per-step-config: ready-for-dev → review (after dev complete) → done (after code-review).
  - [x] 12.3 ZERO mutations to: `src/errors.ts`, `src/migrations/config/index.ts`, `src/schemas/dispatch-spec.ts`, `src/schemas/run-log.ts`, `src/dag/*`, `src/state/*`, `src/failure-ux/*`, `src/config/*` (loader consumed unchanged), `src/runs/render-markdown.ts` (Section 2 unchanged), `src/runs/build-run-log.ts`, `src/runs/types.ts`, `src/runs/write-step.ts`.
  - [x] 12.4 Carry-over from Story 6.3 SDR: 4 inherited NITs N-1/N-2/N-3/N-4 + 42 inherited info I-1 through I-42. Honour I-25 as PRIMARY (this story's deliverable). Honour I-33 as inherited flake (NOT a Story 6.4 regression). Honour I-38 SUBSTANTIVELY (`.strict()` applied to `BudgetSchema = z.object`).

## Dev Notes

### Files being modified (UPDATE)

1. **`src/schemas/config.ts`** (current: 327 lines; Story 6.1 baseline + Story 6.2 overrides; Story 6.3 left unchanged)
   - **What this story changes**: extend `BudgetSchema` (lines 226-229) with `.strict()` chained call per I-38 forward-tracker; add JSDoc note.
   - **What must be preserved**: all existing schemas (ModelSchema, ModelsSchema, OverrideEntrySchema, OverridesSchema, VerifierConfigSchema, VerifiersSchema, BudgetsSchema, PathsSchema, TelemetrySchema, ConfigV1Schema) unchanged. The `BudgetSchema` shape (contextTokens + timeoutMs) unchanged — only `.strict()` validation added.

2. **`src/schemas/config.test.ts`** (current: 738 lines; Story 6.1 added 32 CFG_61_*; Story 6.2 added 10 OVR_62_*; Story 6.3 added 8 MOD_63_*)
   - **What this story changes**: add ~6-9 MOD_64_SCHEMA_* / MOD_64_SCHEMA_STRICT_* / MOD_64_BUDGETS_RECORD_* tests covering BudgetSchema strict + edge cases.
   - **What must be preserved**: all existing CFG_61_* + OVR_62_* + MOD_63_* tests pass unchanged.

3. **`src/dispatch/generate-spec.ts`** (current: 260 lines; Story 2.2 baseline + Story 6.3 model substring)
   - **What this story changes**: extend the `info()` log line at lines 255-257 with conditional budget substring (when non-default). Update JSDoc.
   - **What must be preserved**: ALL existing logic unchanged — the budget field is already populated at lines 208-211 from `input.budgetOverride?.{contextTokens,timeoutMs} ?? {60_000,300_000}`. The `dispatchSpec.budget` field already in the AR9 dispatch-spec.json output.

4. **`src/dispatch/generate-spec.test.ts`** (current: 564 lines; Story 2.2 baseline + Story 6.3 MOD_63_DISPATCH_LOG_*)
   - **What this story changes**: add 3-5 MOD_64_DISPATCH_* tests covering default + override + partial + log line conditional surface.
   - **What must be preserved**: existing 29 tests (including Story 6.3 MOD_63_DISPATCH_LOG_*) pass unchanged.

5. **`src/runs/render-markdown.test.ts`** (current: 296 lines; Story 2.5 baseline + Story 6.3 MOD_63_TRANSCRIPT_MD_*)
   - **What this story changes**: add 2-3 MOD_64_TRANSCRIPT_MD_* tests covering configured non-default budget values.
   - **What must be preserved**: existing 17 tests (Section 2 Budget bullet from Story 6.3) pass unchanged. NO mutation to render-markdown.ts.

6. **`src/commands/next/run.ts`** (current: top-tier; Story 6.3 close threaded modelOverride at lines 2065-2083; dry-run preview at lines 2034-2038; inline comment at lines 2008-2014)
   - **What this story changes**: extend `RunNextOptions.config` + `loadConfigOverride` return types with `budgets?: Budgets` (mirror Story 6.3 model add); thread `budgetOverride: opts?.config?.budgets?.[nextStep.name]` into the existing buildDispatchSpec() call via conditional spread (mirror Story 6.3); replace hardcoded `60k context, 5min timeout` substrings in dry-run preview with resolved budget; update inline comment at lines 2008-2014.
   - **What must be preserved**: Story 5.6 + 6.1 + 6.2 + 6.3 wiring (opts.config seam + import.meta.main loadConfig + opts.config.overrides threading + opts.config.models threading); Story 1.9 + 2.4 lock-free skeleton.

7. **`src/commands/next/run.test.ts`** (current: 4422 lines; Story 6.3 added 6 MOD_63_RUN_* + MOD_63_RUN_DRYRUN_*)
   - **What this story changes**: add 6-8 MOD_64_RUN_* + MOD_64_RUN_DRYRUN_* tests asserting budget threading through dispatch-spec + dry-run preview.
   - **What must be preserved**: existing 163 tests pass unchanged.

8. **`src/commands/loop/run.ts`** (current: Story 6.3 close threaded models?: Models at LoopOpts.config + loadConfigOverride)
   - **What this story changes**: extend `LoopOpts.config` + `loadConfigOverride` return types with `budgets?: Budgets` (mirror Story 6.3 model add). NO call-site change — `effectiveConfig` already flows through `productionRunNextFn`.
   - **What must be preserved**: existing loop semantics + Story 6.3 model threading + Story 6.2 overrides threading + Story 5.6 failurePolicies threading.

9. **`src/commands/loop/run.test.ts`** (current: 3823 lines; Story 6.3 added 2 MOD_63_LOOP_*)
   - **What this story changes**: add 1-2 MOD_64_LOOP_* tests asserting opts.config.budgets flows through productionRunNextFn.
   - **What must be preserved**: existing 171 tests pass unchanged.

10. **`commands/bmad-next.md`** (current: 595 lines; Story 6.3 close added Task model parameter + caveat at lines 105-112)
    - **What this story changes**: add a small caveat paragraph below the Story 6.3 OQ-2 caveat documenting Story 6.4 AC-2 best-effort timeout contract.
    - **What must be preserved**: AR9 stdout protocol unchanged; AR34 markdown structure unchanged; existing Story 6.3 model parameter + caveat unchanged.

11. **`commands/bmad-loop.md`** (current: 1169 lines; Story 4.1+ baseline + Story 6.3 close)
    - **What this story changes**: same caveat extension at the analogous Step 3 block.
    - **What must be preserved**: existing loop semantics unchanged.

12. **`docs/configuration.md`** (current: 445 lines; Story 6.1 + 6.2 + 6.3 baseline)
    - **What this story changes**: extend the `budgets:` section with Story 6.4 wiring note + AC-2 caveat + AC-3 audit trail note + cross-links + forward-tracker update.
    - **What must be preserved**: the canonical example; the Story 6.3 `models:` section; the Story 6.2 overrides section; cross-links to commands/bmad-{loop,next}.md.

### Files being created (NEW)

ZERO NEW files. All work is incremental on existing modules. This is the SAME pattern as Stories 6.1 + 6.2 + 6.3 ("in-place wiring + test density + docs refresh"). Story 6.4 is similarly LIGHT (mirror of Story 6.3 — pure consumer wiring + schema `.strict()` extension + transcript test density). The only NEW surface is (a) `BudgetSchema.strict()` validation and (b) the conditional `info()` log budget substring + (c) the dry-run preview budget substring.

### State preserved

- `src/state/index.ts` — UNCHANGED (Story 6.4 does not touch state subsystem).
- `src/dag/build.ts` — UNCHANGED (Story 6.4 does not touch DAG).
- `_bmad-output/.stepper/state.yaml` — UNCHANGED at create-story step (workflow advance happens at runtime; state.yaml workflow.lastStep + .nextStep advance per /bmad-loop runtime contract).

## Project Structure Notes

- **Boundary AR41 preserved**: `src/schemas/config.ts` is FOUNDATIONAL TIER per AR41 (architecture lines 1287-1289); Story 6.4 adds `.strict()` to an existing schema — no new imports, no new boundary crossings.
- **Boundary AR41 preserved (dispatch tier)**: `src/dispatch/generate-spec.ts` (HIGHER TIER) imports from `../errors`, `../schemas/dispatch-spec`, `../schemas/state`, `../io/log`, `../io/atomic-write`, `../io/paths`, `./types` — Story 6.4 adds NO imports.
- **Boundary AR41 preserved (commands tier)**: `src/commands/next/run.ts` + `src/commands/loop/run.ts` (TOP TIER) already import from `src/dispatch/`, `src/schemas/`, `src/config/` — Story 6.4 imports `Budgets` type from `../../schemas/config.ts` (already a transitive consumer; no new boundary crossing).
- **AR9 stdout invariant preserved**: `emitDispatchAction` writes ONE JSON line; `dispatchSpec.budget` already in the line (Story 1.5 + 2.2 baseline); Story 6.4 only changes the SOURCE (config-derived vs hardcoded).
- **AR21+22 single-line constraint**: the conditional `info()` extension uses a template literal with concatenation — single-line by construction.

## Library / Framework Requirements

- **Bun runtime** (Bun-only project per architecture).
- **Zod 4** — `BudgetSchema.strict()` is supported in Zod 4 (Story 6.2 OQ-4 already validated `.strict()` on `OverrideEntrySchema`; same Zod 4 pattern).
- **No new dependencies** — Story 6.4 is pure type/wire extension on existing infrastructure.

## Testing Standards

- Bun-test colocated tests (`*.test.ts` next to source).
- Spy on `process.stderr.write` for log-line tests (Story 6.3 MOD_63_DISPATCH_LOG_* canonical pattern at `src/io/log.test.ts:18-21` + `src/dispatch/emit.test.ts:36`).
- Use `safeParse` for schema-validation negative tests (consistent with existing CFG_61_BUDGET_* at `src/schemas/config.test.ts:366-394`).
- Single-line constraint tested via regex match `/[\n\r]/` against captured stderr writes (Story 6.3 MOD_63_DISPATCH_LOG_3 pattern).
- Snapshot final test counts AFTER the LAST `biome --write` pass (N-3 discipline carried from Story 6.2 SDR).

## Previous Story Intelligence (from Story 6.3 close)

- **Quality gate baseline**: 1402/0/4707 across 70 files; errors registry 17 (Story 6.3 SDR confirmed).
- **Story 6.3 wiring pattern** (mirror this verbatim): `RunNextOptions.config.models?: Models` + `LoopOpts.config.models?: Models` + `loadConfigOverride` return types + conditional spread `...(configuredModel !== undefined ? { modelOverride: configuredModel } : {})` at the buildDispatchSpec call site + dry-run preview substring replacement + inline comment update.
- **Story 6.3 OQ-3 transcript Section 2** ALREADY emits Budget bullet — ZERO mutation to render-markdown.ts. Story 6.4 only adds test density.
- **Story 6.3 SDR I-25 PRIMARY HONOURED HERE** — Story 6.4 is the canonical I-25 deliverable.
- **Story 6.3 SDR I-38 SUBSTANTIVELY HONOURED HERE** — Story 6.4 applies `.strict()` to `BudgetSchema` (z.object); Story 6.3 trivially honoured for ModelSchema (z.enum already strict).
- **Story 6.3 SDR I-39 (shared getStepConfig helper)** — Story 6.4 OQ-5 adjudicates extract-vs-defer. DEFER per OQ-5 (duplication is shallow; per-section default value types differ).
- **Story 6.3 SDR I-40 (DispatchSpecV1Schema.model tightening)** — NOT applicable to Story 6.4. Forward to Story 6.x cleanup.
- **Story 6.3 SDR I-42 (Task tool model parameter runtime contract)** — RELATED to Story 6.4 AC-2 verifier TIMEOUT contract. Both are best-effort runtime contracts. Story 6.4 OQ-2 documents the same stance.
- **Errors registry stays at 17** — Story 6.4 ships ZERO new error classes; reuses `ConfigError` (Story 6.1 invalid-budget loader) and `TimeoutError` (Story 1.2 baseline).

## Project Context Reference

- **`_bmad-output/planning-artifacts/architecture.md`** line 782 (per-step `budgets:` config schema) + lines 793-813 (dispatch-spec.json shape with budget block) + line 1677 (token counts threaded through verify-and-advance — best-effort).
- **`_bmad-output/planning-artifacts/prd.md`** FR37 (per-step budget overrides) + NFR-R1 (Zod-validated config) + NFR-R6 (defence-in-depth Zod parse on every read).
- **`_bmad-output/implementation-artifacts/6-1-bmad-stepper-config-yaml-schema-loader.md`** Story 6.1 SDR I-25 (PRIMARY HONOURED here).
- **`_bmad-output/implementation-artifacts/6-3-models-per-step-config.md`** Story 6.3 close (4 NITs N-1..N-4 + 42 info I-1..I-42 forward-tracker carry; pattern mirror for runner-tier wiring).
- **`_bmad-output/implementation-artifacts/2-2-dispatch-spec-generator.md`** `BuildDispatchSpecInput.budgetOverride` shape + `BudgetOverride` interface.
- **`_bmad-output/implementation-artifacts/2-5-markdown-transcript-json-run-log-writers.md`** transcript `budget` field shape.
- **`commands/bmad-next.md`** + **`commands/bmad-loop.md`** Layer 1 slash-command markdown — AR9 + AR34 protocol references.
- **`docs/configuration.md`** existing `budgets:` section (Story 6.1 baseline) — Story 6.4 extends with wiring note + caveat + audit trail.

## Architectural Decisions

(See "Architectural challenges resolved here" above for the full set; summary below)

1. **OQ-1 — Apply `.strict()` to `BudgetSchema` per I-38 SUBSTANTIVELY** — `BudgetSchema = z.object({...}).strict()` rejects unknown fields (`costUsd`, `maxToolCalls`) at LOAD time. Backwards-compat preserved (existing fixtures use only contextTokens + timeoutMs).
2. **OQ-2 — Verifier TIMEOUT contract is best-effort** — dispatch-spec.json carries the cap; Layer 1 (slash-command markdown) forwards to runtime; Claude Code Task tool runtime enforces; `TimeoutError` is the canonical surface (registry stays at 17). Bun-side enforcement deferred to forward-tracker I-44.
3. **OQ-3 — `info()` log line surfaces ONLY non-default budget values** — full audit trail in markdown transcript Section 2 (Story 6.3 baseline) + JSON run log; stderr line minimises noise for the common 60_000/300_000 case. AC-3 "budget changes" wording honoured verbatim.
4. **OQ-4 — markdown transcript Section 2 unchanged** — Story 6.3 OQ-3 already added the Budget bullet; Story 6.4 only adds test density for configured non-default values. ZERO mutation to render-markdown.ts.
5. **OQ-5 — shared `getStepConfig` helper DEFERRED** — Story 6.4 keeps the inline `opts.config?.budgets?.[stepName]` lookup pattern (mirror Story 6.3). Story 6.5 may revisit. Forward-tracker I-43 records the option.

## Open Questions

All 5 OQs adjudicated above. None deferred.

## File Mutation Plan

| File | Path | Op | Lines (est) |
|------|------|----|-------------|
| schemas/config | `src/schemas/config.ts` | UPDATE | +2 |
| schemas/config tests | `src/schemas/config.test.ts` | UPDATE | +50 |
| dispatch/generate-spec | `src/dispatch/generate-spec.ts` | UPDATE | +6 |
| dispatch/generate-spec tests | `src/dispatch/generate-spec.test.ts` | UPDATE | +50 |
| runs/render-markdown tests | `src/runs/render-markdown.test.ts` | UPDATE | +40 |
| commands/next/run | `src/commands/next/run.ts` | UPDATE | +12 |
| commands/next/run tests | `src/commands/next/run.test.ts` | UPDATE | +120 |
| commands/loop/run | `src/commands/loop/run.ts` | UPDATE | +4 |
| commands/loop/run tests | `src/commands/loop/run.test.ts` | UPDATE | +50 |
| commands/bmad-next | `commands/bmad-next.md` | UPDATE | +10 |
| commands/bmad-loop | `commands/bmad-loop.md` | UPDATE | +10 |
| docs/configuration | `docs/configuration.md` | UPDATE | +30 |

## Forward Action Items

### Inherited from Story 6.3 SDR (CARRIED)

**4 inherited cosmetic nits** (Stories 4.2-4.10 + 5.1-5.6 + 6.1 + 6.2 + 6.3 — UNCHANGED):
- **N-1**: Defensive null check at `src/commands/loop/stop-conditions.ts:269` — the `=== null` arm is unreachable. Story 6.4 does NOT modify stop-conditions.ts. Cosmetic forward.
- **N-2**: `EMPTY_DAG` + `EMPTY_STATE` sentinels at `src/commands/loop/run.ts` mid-file placement. Story 6.4 does NOT relocate. Cosmetic forward.
- **N-3**: Future task records snapshot final test counts AFTER the LAST `biome --write` pass. Story 6.4 must follow this discipline.
- **N-4**: TWO unused LoopOpts seams `finalStateOverride` + `writeLoopExitTranscriptOverride` declared but never consumed. Story 6.4 does NOT touch these. Pure dead surface; Story 6.x cleanup forward.

**42 inherited info forward-trackers** (Stories 5.5 + 5.6 + 6.1 + 6.2 + 6.3 SDRs — I-1 through I-42):
- **I-1 through I-17 (inherited from Story 5.5)**: failure-UX flow forward-trackers; NOT applicable to Story 6.4 — config-consumer + transcript wiring.
- **I-18 (inherited from 5.6)**: PRIMARY HONOURED in Story 6.1; Story 6.4 simply consumes the typed `Config.budgets` field.
- **I-19 through I-22 (inherited from 5.6)**: alias mapping for step IDs / --continue-on-error vs per-step policy / LoopOpts seam consolidation / single-line constraint discipline. Story 6.4 honours I-22 trivially — ZERO new error classes; existing ConfigError + TimeoutError already pass the gate.
- **I-23 (inherited from 6.1, To Story 6.2 — PRIMARY HONOURED at Story 6.2 close)**: NOT applicable to Story 6.4.
- **I-24 (inherited from 6.1, To Story 6.3 — PRIMARY HONOURED at Story 6.3 close)**: NOT applicable to Story 6.4.
- **I-25 (inherited from 6.1, To Story 6.4 — PRIMARY HONOURED HERE)**: `BudgetsSchema` closed-shape; Story 6.4 budget enforcer uses defaults. **HONOURED — this is the canonical Story 6.4 deliverable**. ZERO loader-API change for Story 6.4.
- **I-26 (inherited from 6.1, To Story 6.5)**: `VerifierConfigSchema.mode` field; Story 6.5 wires the per-step verifier registry merge logic. NOT applicable to Story 6.4.
- **I-27 (inherited from 6.1, To Story 6.6)**: `TelemetrySchema` v0.1 minimal; Story 6.6 may extend via schema bump. NOT applicable to Story 6.4 — but note: Story 6.6 will record `tokensIn` / `tokensOut` actuals; the budget cap may or may not be recorded.
- **I-28 (inherited from 6.1, To 6.x)**: `--no-config` flag DEFERRED. Story 6.4 does NOT add `--no-budgets` flag (out of scope).
- **I-29 (inherited from 6.1, To Story 1.12)**: `--doctor` should consume `loadConfig()` and run a FULL multi-error Zod parse for diagnostic output. NOT applicable to Story 6.4.
- **I-30 (inherited from 6.1, To 6.x)**: Defaults-as-TS-constant vs Defaults-as-YAML — auto-generated companion. NOT applicable to Story 6.4.
- **I-31 (inherited from 6.1, To future Epics)**: Per-layer Zod parse vs single post-merge. NOT applicable to Story 6.4.
- **I-32 (inherited from 6.1, To future Epics)**: `personas[step]: string[]` multi-persona dispatch. NOT applicable to Story 6.4.
- **I-33 (inherited from 6.1 SDR, To Story 6.x or test infra cleanup)**: Sporadic flake at `src/smoke/next.test.ts:374` — pre-existing macOS-specific parent-dir mtime drift. NOT a Story 6.4 regression. Forward-tracker for test infra hardening.
- **I-34 (inherited from 6.2, To Story 6.x cleanup)**: Hand-rolled `parseOverridesYaml` at `src/dag/build.ts` is the LEGACY fallback. NOT applicable to Story 6.4.
- **I-35 (inherited from 6.2, To Story 6.x)**: `--no-overrides` CLI flag DEFERRED. NOT applicable to Story 6.4.
- **I-36 (inherited from 6.2, To future Epics)**: Phase enum extension lock-step discipline. NOT applicable to Story 6.4.
- **I-37 (inherited from 6.2, To Story 1.12 doctor command)**: validateOverrides(...) helper for --doctor. NOT applicable to Story 6.4.
- **I-38 (inherited from 6.2, To Stories 6.3-6.5 — consumer-side schema strictness pattern)**: `.strict()` on schemas. **SUBSTANTIVELY HONOURED for Story 6.4** — `BudgetSchema = z.object({...})` extended with `.strict()` (rejects unknown fields like `costUsd` at LOAD time). Backwards-compat preserved. Story 6.5 (`VerifierConfigSchema = z.object({...})`) will follow the same pattern.
- **I-39 (inherited from 6.3, To Stories 6.4-6.5 — shared `getStepConfig` helper potential)**: Story 6.4 OQ-5 DEFERRED — duplication is shallow; per-section default value types differ; extracted helper would add typing complexity. Story 6.5 may revisit. Forward-tracker.
- **I-40 (inherited from 6.3, To Story 6.x cleanup — DispatchSpecV1Schema.model tightening)**: NOT applicable to Story 6.4. Carry forward unchanged.
- **I-41 (inherited from 6.3, To Story 6.6 telemetry)**: model field already sourced reliably; analogous to Story 6.4's budget field — Story 6.6 may record `tokensIn` / `tokensOut` actuals (not the budget cap). Carry forward.
- **I-42 (inherited from 6.3, To Story 6.x — Task tool `model` parameter runtime contract)**: RELATED to Story 6.4 AC-2 timeout best-effort. Both are best-effort runtime contracts. Carry forward unchanged.

### NEW from Story 6.4 (PRODUCED for Stories 6.5+ and beyond)

- **I-43 (To Stories 6.5+ — shared `getStepConfig` helper potential, after 5 sites)**: Story 6.4 close brings the `opts.config?.[section]?.[stepName] ?? default` lookup count to 4 sites (models, budgets, failurePolicies, overrides); Story 6.5 will add the 5th (verifiers). If duplication accumulates further past 5 sites, Story 6.x can extract `getStepConfig(config, sectionKey, stepName, default)` helper (mirror Story 6.3 I-39). DEFER per OQ-5 — extract if 6+ sites OR if a typing pain emerges.
- **I-44 (To Story 6.x — Bun-side timeout enforcement watchdog)**: Story 6.4 documents AC-2 best-effort runtime contract (mirror Story 6.3 I-42 for model). A future Story 6.x may add Bun-side enforcement (e.g., `Promise.race([taskPromise, sleep(timeoutMs)])` wrapper) to convert best-effort into hard guarantee. Forward-tracker. Estimated effort: S (15-30 LoC + integration test).
- **I-45 (To Story 6.x cleanup — DispatchSpecV1Schema.budget tightening)**: Story 6.4 PRESERVES `DispatchSpecV1Schema.budget` shape (open at the dispatch-spec.json file boundary; the validation is at the LOADER per AR42). A future Story 6.x cleanup may tighten to `BudgetSchema.strict()` (mirror Story 6.3 I-40 for model). Estimated effort: XS (5 LoC + ~3 test updates).
- **I-46 (To Story 6.5 — VerifierConfigSchema `.strict()` per I-38)**: Story 6.4 substantively honours I-38 for `BudgetSchema = z.object`. Story 6.5 SHOULD apply `.strict()` to `VerifierConfigSchema = z.object({ requiredFiles?, requiredFrontmatterSections?, mode? })` at `src/schemas/config.ts:188-192`. Forward-tracker. Estimated effort: XS (1-2 LoC + 2-3 test updates).

### Recommendations from epic-5-retrospective (CARRIED)

- **Recommendation item 3 (registry stability)**: HONOURED — Story 6.4 ships ZERO new error classes (registry stays at 17 — discipline maintained across Epic 6).
- **Recommendation item 6 (cross-story coordination via opts.config seam)**: HONOURED — Story 6.4 reads from `opts.config?.budgets?.[stepName]` (Story 5.6 + 6.1 + 6.2 + 6.3 frozen seam); ZERO seam mutation beyond the `budgets?: Budgets` type extension.

## Dev Agent Record

### Implementation Plan

Mirrored Story 6.3 wiring pattern verbatim per spec OQ-5 (DEFER shared
helper). Sequence: (1) `BudgetSchema.strict()` in `src/schemas/config.ts`
per OQ-1 + I-38; (2) `info()` log conditional non-default substring in
`src/dispatch/generate-spec.ts` per OQ-3; (3) `RunNextOptions.config` +
`loadConfigOverride` extension to include `budgets?: Budgets` in
`src/commands/next/run.ts`; (4) thread `budgetOverride` via conditional
spread into `buildDispatchSpec` call site; (5) replace hardcoded
`60k context, 5min timeout` substring in dry-run preview with resolved
budget (k-tokens + minutes); (6) `LoopOpts.config` + `loadConfigOverride`
+ `effectiveConfig` local type extension in `src/commands/loop/run.ts`;
(7) tests at all 5 layers (schema, dispatch, transcript, next runner,
loop runner); (8) docs caveats in `commands/bmad-{next,loop}.md` for
AC-2 timeout best-effort; (9) `docs/configuration.md` budgets section
refresh with Wiring + TIMEOUT contract + Audit trail sub-sections.

### Completion Notes

- All 12 tasks complete; all 12 ACs (AC-1 default + override + partial,
  AC-2 TIMEOUT contract documented, AC-3 markdown + JSON + stderr) covered.
- 29 new tests added across 5 files (10 schema + 8 dispatch + 3 transcript
  + 6 next runner + 2 loop runner); baseline 1402 → 1431/0/4755 (1 sporadic
  LOCK_CONTENTION flake at `src/lock/integration/sub-second-mtime.test.ts`
  on first run; passed on re-run — pre-existing per I-33 carry).
- Errors registry held at 17 (verified via `grep -c "extends StepperError"
  src/errors.ts`). Zero new error classes shipped.
- `bunx tsc --noEmit` exit 0; `bun run check` exit 0 (after biome auto-fix
  on `config.test.ts` formatting); `bun test` 1431/0/4755 across 70 files.
- I-38 substantively honoured — `BudgetSchema.strict()` rejects unknown
  fields like `costUsd` / `maxToolCalls` at LOAD time per OQ-1.
- I-44 forward-tracker recorded: Bun-side timeout enforcement watchdog
  deferred per OQ-2 (best-effort runtime contract).

### Debug Log References

- `bun test src/schemas/config.test.ts`: 87/0/144 (was 77; +10 new).
- `bun test src/dispatch/generate-spec.test.ts`: 37/0/67 (was 29; +8 new).
- `bun test src/runs/render-markdown.test.ts`: 20/0/46 (was 17; +3 new).
- `bun test src/commands/next/run.test.ts`: 169/0/616 (was 163; +6 new).
- `bun test src/commands/loop/run.test.ts`: 173/0/610 (was 171; +2 new).
- `bun test src/errors.test.ts`: 15/0/249 UNCHANGED (registry stable at 17).
- `bun test src/integration/escalate-actionable-hint.test.ts`: 33/0/114
  UNCHANGED (TimeoutError sweep already covers Story 6.4 AC-2 hint shape).

## File List

- src/schemas/config.ts (MOD: BudgetSchema `.strict()` + JSDoc — task 2)
- src/schemas/config.test.ts (MOD: BUD_64_SCHEMA_*, BUD_64_SCHEMA_STRICT_*,
  BUD_64_BUDGETS_RECORD_* — task 2)
- src/dispatch/generate-spec.ts (MOD: info() conditional non-default
  budget substring + JSDoc — task 3)
- src/dispatch/generate-spec.test.ts (MOD: BUD_64_DISPATCH_DEFAULT_*,
  BUD_64_DISPATCH_OVERRIDE_*, BUD_64_DISPATCH_LOG_* — task 4)
- src/runs/render-markdown.test.ts (MOD: BUD_64_TRANSCRIPT_MD_* — task 5)
- src/commands/next/run.ts (MOD: RunNextOptions.config.budgets +
  loadConfigOverride return + budgetOverride conditional spread + dry-run
  preview budget substring + comment update — task 6)
- src/commands/next/run.test.ts (MOD: BUD_64_RUN_*, BUD_64_RUN_DRYRUN_*
  — task 8)
- src/commands/loop/run.ts (MOD: LoopOpts.config.budgets +
  loadConfigOverride return + effectiveConfig local type — task 7)
- src/commands/loop/run.test.ts (MOD: BUD_64_LOOP_* — task 8)
- commands/bmad-next.md (MOD: AC-2 timeout caveat paragraph — task 9)
- commands/bmad-loop.md (MOD: AC-2 timeout caveat paragraph — task 9)
- docs/configuration.md (MOD: budgets section Wiring + TIMEOUT contract
  + Audit trail sub-sections + forward-tracker update — task 10)
- _bmad-output/implementation-artifacts/sprint-status.yaml (MOD: 6-4
  status ready-for-dev → in-progress → review at runtime; last_updated
  bump)
- _bmad-output/implementation-artifacts/6-4-budgets-per-step-config.md
  (MOD: status frontmatter + tasks ticked + Dev Agent Record + File
  List + Change Log)

## Change Log

| Date       | Author    | Change                              |
| ---------- | --------- | ----------------------------------- |
| 2026-05-05 | bmad-dev-story (Claude Opus 4.7 1M, iter 11 of /bmad-loop --until=story:6.8 — loopId 2026-05-05T080939Z-bmad-loop, runId 2026-05-05T104019Z-bmad-next) | Story 6.4 implemented (FOURTH STORY of Epic 6). Status: ready-for-dev → review. AC-1 PRIMARY HONOURED — `config.budgets[stepName]` threads through `buildDispatchSpec.budgetOverride`; defaults `60000`/`300000` fire when per-step config absent (`src/dispatch/generate-spec.ts:208-211`). AC-2 PRIMARY HONOURED — `TimeoutError` registry contract documented in `commands/bmad-{next,loop}.md` AC-2 caveat paragraphs (best-effort runtime cap; `verify-and-advance.ts --error-code TIMEOUT` constructs canonical TimeoutError). AC-3 PRIMARY HONOURED — markdown transcript Section 2 Budget bullet (Story 6.3 baseline preserved); stderr `info()` log surfaces non-default budget substring `, budget <ctxTokens>/<timeoutMs>ms`; JSON run log records every budget. 12 tasks ticked (≈80 sub-tasks). 5 OQs HONOURED (OQ-1 `BudgetSchema.strict()` rejects unknown fields like costUsd/maxToolCalls; OQ-2 verifier TIMEOUT best-effort + Bun-side enforcement deferred to I-44; OQ-3 stderr surfaces only non-default + full audit in markdown + JSON; OQ-4 ZERO mutation to render-markdown.ts; OQ-5 shared getStepConfig DEFERRED per I-43). 12 MODIFIED files (src/schemas/config.ts +13 LoC `.strict()` + JSDoc; src/schemas/config.test.ts +89 LoC BUD_64_SCHEMA_* + BUD_64_SCHEMA_STRICT_* + BUD_64_BUDGETS_RECORD_*; src/dispatch/generate-spec.ts +24 LoC info() conditional budget substring + JSDoc; src/dispatch/generate-spec.test.ts +127 LoC BUD_64_DISPATCH_DEFAULT_* + OVERRIDE_* + LOG_*; src/runs/render-markdown.test.ts +30 LoC BUD_64_TRANSCRIPT_MD_*; src/commands/next/run.ts +28 LoC budgets?: Budgets type + budgetOverride conditional spread + resolved dry-run preview + comment update; src/commands/next/run.test.ts +138 LoC BUD_64_RUN_* + RUN_DRYRUN_*; src/commands/loop/run.ts +6 LoC budgets?: Budgets type extension + effectiveConfig local type widen; src/commands/loop/run.test.ts +52 LoC BUD_64_LOOP_*; commands/bmad-next.md +14 LoC AC-2 timeout caveat; commands/bmad-loop.md +14 LoC same; docs/configuration.md +51 LoC budgets section refresh). 0 NEW files. Test counts before/after: 1402/0/4707 → 1431/0/4755 across 70 files (+29 tests, +48 expect calls). Errors registry stays at 17 (verified). bunx tsc --noEmit exit 0; bun run check exit 0 (after biome auto-format pass on config.test.ts); bun test all green. Forward-trackers PRODUCED 4 NEW (I-43 shared getStepConfig helper to Stories 6.5+ if 6+ sites accumulate; I-44 Bun-side timeout enforcement watchdog to Story 6.x; I-45 DispatchSpecV1Schema.budget tightening to Story 6.x cleanup; I-46 VerifierConfigSchema `.strict()` to Story 6.5). I-25 PRIMARY HONOURED here as canonical Story 6.4 deliverable. I-38 SUBSTANTIVELY honoured for `BudgetSchema = z.object`. Sprint-status `6-4-budgets-per-step-config` ready-for-dev → in-progress → review (line 106); last_updated 2026-05-05T10:48:00Z bumped at line 38. Inherited 4 NITs N-1 through N-4 + 42 info I-1 through I-42 carried forward unchanged. |
| 2026-05-05 | bmad-code-review (Claude Opus 4.7 1M, iter 12 of /bmad-loop --until=story:6.8 — loopId 2026-05-05T080939Z-bmad-loop, runId 2026-05-05T105409Z-bmad-next) | Senior Developer Review — verdict APPROVE. Status: review → done. ZERO must-fix / ZERO should-fix / ZERO new nits / ZERO new info forward-trackers (4 NITs N-1..N-4 + 46 info I-1..I-46 cumulative carry forward unchanged from Story 6.4 dev-iter close — I-1..I-42 inherited from Stories 5.5/5.6/6.1/6.2/6.3; I-43/I-44/I-45/I-46 produced at Story 6.4 create-story step and re-confirmed here). Independent quality gate re-verification GREEN from a fresh shell with `export PATH="$HOME/.bun/bin:$PATH"`: `bunx tsc --noEmit` exit 0; `bun run check` 1431 pass / 0 fail / 4755 expect() across 70 files (matches dev-iter snapshot verbatim — Δ +29/+48/0 vs Story 6.3 baseline 1402/0/4707); `grep -c "extends StepperError" src/errors.ts` = 17 UNCHANGED. AC-1 PASS at src/dispatch/generate-spec.ts:223-225 (default-with-override semantic — `contextTokens: input.budgetOverride?.contextTokens ?? 60_000` + `timeoutMs: input.budgetOverride?.timeoutMs ?? 300_000` Story 2.2 baseline) + src/commands/next/run.ts:2087 (configuredBudget resolution from opts?.config?.budgets?.[nextStep.name]) + run.ts:2100-2102 (conditional spread `budgetOverride: configuredBudget` preserves exactOptionalPropertyTypes); src/commands/next/run.ts:2043-2052 (dry-run preview resolves budget via `contextTokensK = Math.round((resolvedBudget?.contextTokens ?? 60_000) / 1000)` + `timeoutMins = Math.round((resolvedBudget?.timeoutMs ?? 300_000) / 60_000)` — replaces hardcoded `60k context, 5min timeout` substrings); src/commands/loop/run.ts:472, 491, 497, 846 (LoopOpts.config + loadConfigOverride + effectiveConfig type extensions with `budgets?: Budgets`); BUD_64_RUN_1/2/3/4 + BUD_64_RUN_DRYRUN_1/2 + BUD_64_LOOP_1/2 cover. AC-2 PASS at commands/bmad-next.md:114-124 (Story 6.4 AC-2 timeout cap is best-effort caveat — "the dispatch-spec.json's `budget.timeoutMs` is the configured per-step timeout cap; the Claude Code Task tool runtime is responsible for enforcing the cap and surfacing a TIMEOUT condition if exceeded; if the runtime exceeds the cap, the slash-command markdown forwards `--error-code TIMEOUT` to verify-and-advance.ts which constructs `TimeoutError`") + commands/bmad-loop.md (analogous Story 6.4 forward-tracker note for future Task-per-iteration carrying timeoutMs cap best-effort) + src/integration/escalate-actionable-hint.test.ts 33/0/114 UNCHANGED (sweep over all 17 error classes — TimeoutError already covered) + src/errors.ts:200-205 (TimeoutError class with `code: "TIMEOUT"` + `exitCode: 1` + single-line hint per AR21+22 — registry stays at 17). AC-3 PASS dual-channel: src/dispatch/generate-spec.ts:274-279 (info() log line includes conditional `, budget ${dispatchSpec.budget.contextTokens}/${dispatchSpec.budget.timeoutMs}ms` substring WHEN non-default per OQ-3 — single-line preserved via template literal concatenation per AR21+22; BUD_64_DISPATCH_LOG_1/2/3/4 explicitly assert) + src/runs/render-markdown.ts:88-95 (Section 2 "## Dispatch metadata" Budget bullet `Budget: ${input.budget.contextTokens} tokens / ${seconds}s timeout` Story 6.3 baseline — BUD_64_TRANSCRIPT_MD_1/2/3 cover) + JSON run log already records budget field from Story 2.5 baseline UNCHANGED. AR verdicts: AR41 boundary CLEAN (src/dispatch/generate-spec.ts only imports from ../errors, ../io/atomic-write, ../io/log, ../io/paths, ../schemas/dispatch-spec, ./types — NO new boundary crossings; src/commands/next/run.ts type-only import of Budgets via `import("../../schemas/config.ts").Budgets` per Story 6.3 pattern); AR21+22 single-line PRESERVED (info() template literal concatenation contains no `\n`/`\r`; BUD_64_DISPATCH_LOG_3 + BUD_64_DISPATCH_LOG_4 explicitly assert); AR8 lock-free PRESERVED (run.ts pure-read; ZERO state.yaml writes added; dispatch info log is stderr-only per FR54); AR9 stdout invariant PRESERVED (emitDispatchAction unchanged; dispatchSpec.budget field unchanged on AR9 JSON line — only the SOURCE of budget changed config-derived vs hardcoded); AR25 transcript ordering PRESERVED (render-markdown.test.ts AR25 ordering test asserts 8 sections in fixed order with Dispatch metadata between H1 and Inputs; ZERO mutation to render-markdown.ts per OQ-4); AR42 Zod schema-first HONOURED (BudgetSchema is the source-of-truth; `.strict()` at config.ts:237 rejects unknown fields at LOAD time per I-38 SUBSTANTIVE honour). All 5 OQs honoured per spec: OQ-1 BudgetSchema `.strict()` per I-38 SUBSTANTIVELY ✓ (config.ts:232-237 — rejects costUsd/maxToolCalls); OQ-2 verifier TIMEOUT best-effort + Bun-side enforcement deferred to I-44 ✓; OQ-3 stderr surfaces only non-default + full audit in markdown + JSON ✓ (generate-spec.ts:274-281 isDefaultBudget gate); OQ-4 ZERO mutation to render-markdown.ts (only test density added) ✓; OQ-5 shared getStepConfig helper deferred per I-43 ✓. Errors registry held at 17 codes (verified independently from a fresh shell). Inherited forward-trackers (Stories 5.5/5.6/6.1/6.2/6.3 SDRs — CARRIED): 4 cosmetic NITs N-1..N-4 + 42 info I-1..I-42 + 4 NEW from Story 6.4 spec I-43..I-46 — all carry forward unchanged (I-25 PRIMARY HONOURED — Story 6.4 canonical deliverable; I-33 sporadic flake at smoke/next.test.ts:374 confirmed NOT a Story 6.4 regression; I-38 SUBSTANTIVELY honoured for BudgetSchema z.object). Sprint-status `6-4-budgets-per-step-config` review → done (line 106); epic-6 stays in-progress (line 102 unchanged); last_updated 2026-05-05T10:54:09Z bumped. State.yaml workflow advanced: lastStep=bmad-code-review; lastStepCompletedAt 2026-05-05T10:54:09Z; nextStep=bmad-create-story; nextStepStory=6.5; nextStepKey=6-5-verifiers-per-step-config-override; evidenceIndex appended. **STORY 6.4 COMPLETE — `budgets:` per-step config consumer wiring + dual-channel audit trail + AC-2 timeout best-effort contract documented.** Next step: bmad-create-story for Story 6.5 (`verifiers:` per-step config override — independent path; same pattern as Story 6.4 with VerifierConfigSchema `.strict()` per I-46). |

## Senior Developer Review (AI)

**Reviewer:** bmad-code-review (Claude Opus 4.7 1M, iter 12 of /bmad-loop --until=story:6.8)
**Date:** 2026-05-05T10:54:09Z
**runId:** 2026-05-05T105409Z-bmad-next
**loopId:** 2026-05-05T080939Z-bmad-loop
**Outcome:** APPROVE

### Summary

Story 6.4 ships the `budgets:` per-step config consumer wiring at the dispatch-spec generator + dual-channel audit trail (stderr `info()` log surfaces NON-DEFAULT budget values + markdown transcript Section 2 Budget bullet preserved from Story 6.3) + AC-2 best-effort runtime timeout contract documented in slash-command markdown. The work mirrors Story 6.3's pattern verbatim — pure consumer wiring + schema `.strict()` extension + test density + slash-command markdown caveat + docs refresh. ZERO new files. ZERO new error classes. ZERO schema migrations (only `.strict()` validation extension on existing `BudgetSchema`). ZERO repair iterations of substance (single biome `--write` auto-format pass). All 5 OQs honoured transparently per the create-story spec. All quality gates green; errors registry held at 17 codes.

### Quality gate re-verification (independent, fresh shell)

| Gate | Result |
|---|---|
| `bunx tsc --noEmit` | exit 0 |
| `bun run check` | 1431 pass / 0 fail / 4755 expect() across 70 files (Δ +29/+48/0 vs Story 6.3 baseline 1402/0/4707) |
| `grep -c "extends StepperError" src/errors.ts` | 17 UNCHANGED |

All gates GREEN from a fresh shell with `export PATH="$HOME/.bun/bin:$PATH"`. Snapshot matches dev-iter claim verbatim.

### AC verification (file:line evidence)

- **AC-1 (`config.budgets[stepName]` → dispatch-spec.json's `budget.contextTokens` + `budget.timeoutMs`; defaults 60000 / 300000):** PASS.
  - Default-with-override: `src/dispatch/generate-spec.ts:223-225` — `contextTokens: input.budgetOverride?.contextTokens ?? 60_000` + `timeoutMs: input.budgetOverride?.timeoutMs ?? 300_000` (Story 2.2 baseline; AC-1 verbatim defaults).
  - Resolution: `src/commands/next/run.ts:2087` — `const configuredBudget = opts?.config?.budgets?.[nextStep.name];`
  - Conditional spread: `src/commands/next/run.ts:2100-2102` — `...(configuredBudget !== undefined ? { budgetOverride: configuredBudget } : {})` (preserves `exactOptionalPropertyTypes` discipline; falls through to default when undefined).
  - Dry-run preview: `src/commands/next/run.ts:2043-2052` — `contextTokensK = Math.round((resolvedBudget?.contextTokens ?? 60_000) / 1000)` + `timeoutMins = Math.round((resolvedBudget?.timeoutMs ?? 300_000) / 60_000)` replacing hardcoded `60k context, 5min timeout` substring.
  - Loop runner: `src/commands/loop/run.ts:472, 491, 497, 846` — LoopOpts.config + loadConfigOverride + effectiveConfig type extensions with `budgets?: Budgets`.
  - Tests: `BUD_64_RUN_1/2/3/4` (happy-path 80000/600000 + empty record default + non-matching key default + partial override) + `BUD_64_RUN_DRYRUN_1/2` (preview 80k/10min override + 60k/5min default) + `BUD_64_LOOP_1/2` (opts.config.budgets flow-through + loadConfigOverride returning budgets record) + `BUD_64_DISPATCH_DEFAULT_1` + `BUD_64_DISPATCH_OVERRIDE_1/2/3` (full + partial overrides).

- **AC-2 (verifier uses budgets to time out long-running sub-agent calls; TIMEOUT error):** PASS.
  - TimeoutError class: `src/errors.ts:200-205` — `code: "TIMEOUT"`, `exitCode: 1`, single-line hint per AR21+22 (registry stays at 17).
  - AC-2 caveat: `commands/bmad-next.md:114-124` — Story 6.4 AC-2 caveat documenting best-effort runtime contract: "the dispatch-spec.json's `budget.timeoutMs` is the configured per-step timeout cap; the Claude Code Task tool runtime is responsible for enforcing the cap and surfacing a TIMEOUT condition if exceeded; if the runtime exceeds the cap, the slash-command markdown forwards `--error-code TIMEOUT` to verify-and-advance.ts which constructs `TimeoutError`".
  - Loop analog: `commands/bmad-loop.md` analogous Story 6.4 forward-tracker note for future Task-per-iteration carrying timeoutMs cap best-effort.
  - Sweep: `src/integration/escalate-actionable-hint.test.ts` 33/0/114 UNCHANGED (sweep over all 17 error classes — TimeoutError already covered).
  - Bun-side enforcement deferred to forward-tracker I-44 per OQ-2.

- **AC-3 (budget changes surfaced in transcript log for audit):** PASS — dual-channel.
  - Stderr info log: `src/dispatch/generate-spec.ts:274-279` — `isDefaultBudget` gate + conditional `, budget ${dispatchSpec.budget.contextTokens}/${dispatchSpec.budget.timeoutMs}ms` substring WHEN non-default per OQ-3 (single-line template literal concatenation; no `\n`/`\r`).
  - Markdown transcript Section 2: `src/runs/render-markdown.ts:88-95` — Budget bullet `Budget: ${input.budget.contextTokens} tokens / ${seconds}s timeout` (Story 6.3 baseline — ZERO mutation per OQ-4).
  - JSON run log: ALREADY records `budget` field from Story 2.5 baseline (UNCHANGED).
  - Tests: `BUD_64_DISPATCH_LOG_1/2/3/4` (default no-substring + override surface + single-line constraint + partial override) + `BUD_64_TRANSCRIPT_MD_1/2/3` (configured 80000/600000 + 100000/1200000 + null fallback regression).

### AR verdicts

| AR | Verdict | Evidence |
|---|---|---|
| **AR41** boundary | CLEAN | `src/dispatch/generate-spec.ts` only imports from `../errors`, `../io/atomic-write`, `../io/log`, `../io/paths`, `../schemas/dispatch-spec`, `./types` — NO new boundary crossings; `src/commands/next/run.ts` uses type-only `import("../../schemas/config.ts").Budgets` per Story 6.3 pattern |
| **AR21+22** single-line | PRESERVED | `info()` log at `generate-spec.ts:274-281` is template literal concatenation with no `\n`/`\r`; BUD_64_DISPATCH_LOG_3 + LOG_4 explicitly assert |
| **AR8** lock-free | PRESERVED | `run.ts` consumer addition is pure-read (ZERO state.yaml writes added); only adds local-variable resolution + buildDispatchSpec field thread |
| **AR9** stdout invariant | PRESERVED | `emitDispatchAction` unchanged; `dispatchSpec.budget` field unchanged on the AR9 JSON line — only the SOURCE of budget changed (config-derived vs hardcoded) |
| **AR25** transcript ordering | PRESERVED | `render-markdown.test.ts` AR25 ordering test asserts 8 sections in fixed order with Dispatch metadata between H1 and Inputs; ZERO mutation to `render-markdown.ts` per OQ-4 |
| **AR42** Zod schema-first | HONOURED | `BudgetSchema` at `config.ts:232-237` is source-of-truth; `.strict()` rejects unknown fields like `costUsd`/`maxToolCalls` at LOAD time per I-38 SUBSTANTIVE honour |

### OQ adjudication

| OQ | Position | Evidence |
|---|---|---|
| **OQ-1** `.strict()` on BudgetSchema | HONOURED | `src/schemas/config.ts:232-237` — `BudgetSchema = z.object({...}).strict()` — backwards-compat preserved (existing fixtures use only contextTokens + timeoutMs) |
| **OQ-2** verifier TIMEOUT best-effort caveat | HONOURED | `commands/bmad-next.md:114-124` carries the verbatim Story 6.4 AC-2 caveat; Bun-side enforcement deferred to I-44 |
| **OQ-3** info() log surfaces only non-default budgets | HONOURED | `src/dispatch/generate-spec.ts:274-279` — `isDefaultBudget` gate ensures budget substring appears ONLY when configured ≠ defaults |
| **OQ-4** markdown transcript Section 2 ZERO mutation (test density only) | HONOURED | `src/runs/render-markdown.ts` UNCHANGED at the Budget bullet (Story 6.3 baseline preserved); `src/runs/render-markdown.test.ts` adds 3 BUD_64_TRANSCRIPT_MD_* tests |
| **OQ-5** shared getStepConfig helper deferred | HONOURED | Forward-tracker I-43 records the option; the inline `opts.config?.budgets?.[stepName]` lookup pattern mirrored from Story 6.3; extract if 6+ sites accumulate |

### Findings

| Severity | Count |
|---|---|
| Must-fix | 0 |
| Should-fix | 0 |
| Nits | 0 NEW (4 inherited NITs N-1..N-4 cumulative carry forward unchanged) |
| Info | 0 NEW (46 inherited info I-1..I-46 cumulative carry forward unchanged from Story 6.4 dev-iter close — I-1..I-42 inherited from Stories 5.5/5.6/6.1/6.2/6.3; I-43/I-44/I-45/I-46 produced at Story 6.4 create-story step and re-confirmed here) |

### Forward Action Items (cumulative carry-forward)

**Inherited NITs (4) — UNCHANGED from Story 6.3 SDR**
- **N-1**: Defensive null check at `src/commands/loop/stop-conditions.ts:269` — unreachable arm. Cosmetic forward.
- **N-2**: `EMPTY_DAG` + `EMPTY_STATE` sentinels at `src/commands/loop/run.ts` mid-file placement. Cosmetic forward.
- **N-3**: Future tasks must snapshot final test counts AFTER the LAST `biome --write` pass. Story 6.4 dev-iter HONOURED.
- **N-4**: TWO unused LoopOpts seams `finalStateOverride` + `writeLoopExitTranscriptOverride`. Pure dead surface; Story 6.x cleanup forward.

**Inherited info I-1..I-42** — UNCHANGED (see story file Forward Action Items section). Story 6.4 deliverable closes I-25 (PRIMARY HONOURED here); I-33 sporadic flake at `src/smoke/next.test.ts:374` confirmed NOT a Story 6.4 regression; I-38 SUBSTANTIVELY honoured for `BudgetSchema = z.object` (rejects unknown fields like `costUsd`/`maxToolCalls`).

**Forward-trackers PRODUCED at Story 6.4 (4 NEW) — re-confirmed at review step**
- **I-43 (To Stories 6.5+)** — shared `getStepConfig(config, sectionKey, stepName, default)` helper potential after 5+ sites accumulate (currently 4: models/budgets/failurePolicies/overrides; Story 6.5 adds verifiers as 5th). Forward-tracker. Estimated effort: XS (15-20 LoC).
- **I-44 (To Story 6.x)** — Bun-side timeout enforcement watchdog (e.g., `Promise.race([taskPromise, sleep(timeoutMs)])` wrapper) to convert AC-2 best-effort runtime contract into hard guarantee. Forward-tracker. Estimated effort: S (15-30 LoC + integration test).
- **I-45 (To Story 6.x cleanup)** — `DispatchSpecV1Schema.budget` tightening from open `{ contextTokens: z.number(), timeoutMs: z.number() }` to `BudgetSchema.strict()`-derived shape. Estimated effort: XS (5 LoC + ~3 test updates).
- **I-46 (To Story 6.5)** — `VerifierConfigSchema.strict()` per I-38 substantive honour pattern (mirror of Story 6.4 BudgetSchema strict). Estimated effort: XS (1-2 LoC + 2-3 test updates).

### Verdict rationale

Story 6.4 is a textbook consumer-wiring story with one substantive schema-strictness extension: spec is concrete, scope is narrow, dev-iter snapshot matches independent re-verification verbatim (1431/0/4755; errors=17). All 3 ACs verified with file:line evidence; all 5 OQs honoured per the create-story spec; all 6 ARs preserved (AR41 boundary, AR21+22 single-line, AR8 lock-free, AR9 stdout, AR25 transcript ordering, AR42 Zod schema-first). ZERO must-fix, ZERO should-fix, ZERO new nits, ZERO new info forward-trackers. The implementation honours Story 6.1 SDR I-25 PRIMARY (the canonical Story 6.4 deliverable), Story 6.2 SDR I-38 SUBSTANTIVELY (`.strict()` on BudgetSchema z.object), Story 5.6 + 6.1 + 6.2 + 6.3 frozen `opts.config` seam, Story 2.2 dispatch-spec generator unchanged at internals, Story 2.5 transcript writers unchanged at the JSON layer + Story 6.3 OQ-3 markdown layer Budget bullet preserved per OQ-4. Errors registry held at 17 codes per the AR21 + epic-4-retro discipline. The 4 forward-trackers (I-43 to I-46) are well-scoped for downstream Stories 6.5-6.6 + Story 6.x cleanup. Approve and advance to Story 6.5 (`verifiers:` per-step config override — independent path; same pattern as Story 6.4 with VerifierConfigSchema `.strict()` per I-46).
| 2026-05-05 | bmad-create-story (Claude Opus 4.7 1M, iter 10 of /bmad-loop --until=story:6.8 — loopId 2026-05-05T080939Z-bmad-loop, runId 2026-05-05T102551Z-bmad-next) | Story 6.4 spec created (FOURTH STORY of Epic 6). Status: backlog → ready-for-dev. AC byte-identical to epics.md lines 1201-1213 (3-block Given/When/Then — `budgets:` config → dispatch-spec.json's `budget.contextTokens` + `budget.timeoutMs` with 60000 / 300000 defaults + verifier TIMEOUT error contract + budget changes surfaced in transcript log for audit). 12 tasks (~80 sub-tasks). 5 OQs adjudicated transparently for code-review (OQ-1 apply `.strict()` to BudgetSchema per I-38 SUBSTANTIVELY — rejects unknown fields like costUsd at LOAD time; backwards-compat preserved; OQ-2 verifier TIMEOUT contract is best-effort — dispatch-spec.json carries the cap; Layer 1 forwards to Claude Code Task tool runtime; runtime enforces; TimeoutError is canonical surface; registry stays at 17; Bun-side enforcement deferred to forward-tracker I-44; OQ-3 `info()` log line surfaces ONLY non-default budget values — full audit in markdown transcript Section 2 + JSON run log; stderr minimises noise for common 60_000/300_000 case; AC-3 "budget changes" wording honoured verbatim; OQ-4 markdown transcript Section 2 unchanged — Story 6.3 OQ-3 already added Budget bullet; Story 6.4 only adds test density for configured non-default values; ZERO mutation to render-markdown.ts; OQ-5 shared `getStepConfig` helper DEFERRED — duplication is shallow; per-section default value types differ; extracted helper would add typing complexity; Story 6.5 may revisit per forward-tracker I-43). 12 deps (6.1 PRIMARY for loadConfig + BudgetsSchema closed-shape + Story 6.1 SDR I-25 PRIMARY HONOURED here; 2.2 PRIMARY for buildDispatchSpec.budgetOverride + DispatchSpecV1Schema.budget + info() log line + 60_000/300_000 defaults match AC-1 verbatim; 2.5 PRIMARY for transcript module group — RunLogV1Schema.budget + buildRunLog already wired + render-markdown Section 2 Budget bullet from Story 6.3 baseline; 6.2 PATTERN for I-38 .strict() discipline — Story 6.4 substantively honours; 6.3 PATTERN + IMMEDIATE PREDECESSOR — runner-side wiring pattern verbatim mirror; 1.2 PRIMARY for ConfigError + TimeoutError + registry CI gate at 17 codes; 1.5 PATTERN for schema-first; 1.3 PRIMARY for io/log.ts info helper conditional non-default surface; 6.5/6.6 CROSS-STORY COORDINATION orthogonal; 2.4 CONSUMER for runner buildDispatchSpec call site mirror Story 6.3; 5.6 PATTERN for opts.config seam frozen). 39 inputDocuments. ZERO NEW files. 12 MODIFIED files (src/schemas/config.ts +2 LoC `.strict()` extension; src/schemas/config.test.ts +50 LoC MOD_64_SCHEMA_* + MOD_64_SCHEMA_STRICT_* + MOD_64_BUDGETS_RECORD_*; src/dispatch/generate-spec.ts +6 LoC info() conditional non-default budget substring; src/dispatch/generate-spec.test.ts +50 LoC MOD_64_DISPATCH_*; src/runs/render-markdown.test.ts +40 LoC MOD_64_TRANSCRIPT_MD_*; src/commands/next/run.ts +12 LoC budgets?: Budgets type + budgetOverride conditional spread + dry-run preview budget substring + comment update; src/commands/next/run.test.ts +120 LoC MOD_64_RUN_*; src/commands/loop/run.ts +4 LoC budgets?: Budgets type extension; src/commands/loop/run.test.ts +50 LoC MOD_64_LOOP_*; commands/bmad-next.md +10 LoC AC-2 timeout caveat paragraph; commands/bmad-loop.md +10 LoC same; docs/configuration.md +30 LoC budgets section refresh + Wiring + TIMEOUT contract + Audit trail sub-sections + cross-links + forward-tracker update). FORWARD-TRACKERS produced (4 NEW): I-43 to Stories 6.5+ shared getStepConfig helper potential after 5 sites / I-44 to Story 6.x Bun-side timeout enforcement watchdog / I-45 to Story 6.x cleanup DispatchSpecV1Schema.budget tightening / I-46 to Story 6.5 VerifierConfigSchema `.strict()` per I-38 substantive honour. INHERITED forward-trackers: 4 cosmetic nits N-1/N-2/N-3/N-4 + 42 info I-1 through I-42 (I-25 PRIMARY HONOURED — Story 6.4 deliverable; I-33 sporadic flake at smoke/next.test.ts:374 NOT a regression; I-38 .strict() discipline SUBSTANTIVELY honoured for BudgetSchema = z.object; I-42 RELATED to Story 6.4 AC-2 timeout best-effort; cumulative carry forward unchanged). Errors registry stays at 17 (Story 6.4 ships ZERO new error classes per AR21 + epic-4-retro Recommendations item 3 + Story 5.6 OQ-9 + Story 6.1/6.2/6.3 OQ pattern). Schema migration registry stays at v1 (no schemaVersion bump — `.strict()` is structural validation, not shape change). Sprint-status `6-4-budgets-per-step-config` backlog → ready-for-dev (line 106); epic-6 stays in-progress (line 102). last_updated 2026-05-05T10:25:51Z bumped at lines 2 + 38. NO src/ mutations during create-story phase — those are dev-story iter work. |
