---
status: done
story_id: '5.6'
story_key: 5-6-per-step-failure-policy-via-config-actionable-errors
epic: '5'
title: 'Per-Step Failure Policy via Config + Actionable Errors'
created: '2026-05-05'
last_updated: '2026-05-05T06:47:26Z'
priority: high
estimated_effort: M
fr_coverage:
  - FR31     # PRIMARY — per-step failure policy via config (failurePolicies block)
  - FR32     # PRIMARY — actionable-error contract (one-line hint ending in Run/See/Try/Check)
  - FR46     # PRIMARY — main-thread output exactly one line; full detail in run log
  - FR16     # sub-agent dispatch (per-step policy resolution at dispatch site)
  - FR17     # verifier before promote (failure-UX consumes verifier failure → policy resolution)
  - FR8      # single-step advance (per-step policy applies inside /bmad-next)
  - FR43     # markdown transcript per step (full-detail escalation lives in transcript)
  - FR44     # JSON run log per step (full-detail escalation lives in run log)
  - FR53     # exit codes (resolved policy maps to FailureUxOutcome → exit code)
  - FR54     # stdout/stderr discipline (single-line actionable hint on stderr; detail to log)
nfr_coverage:
  - NFR-M2   # PRIMARY — actionable-error contract codification (errors-as-primary-UX principle)
  - NFR-R1   # zero data loss on halt (per-step policy preserves the existing atomic-write contract)
  - NFR-R2   # 100% --resume recovery (escalate path surfaces --resume hint via existing infrastructure)
  - NFR-R8   # config validation strictness (Zod parse rejects invalid policy values)
  - NFR-S2   # no-write-outside-scope (resolver is pure; ZERO new write sites)
  - NFR-S5   # atomic tmp+rename + .bak rotation (state.yaml write sites unchanged)
  - NFR-M3   # schema migrations (NO schema bump; ConfigV1Schema.failurePolicies already declared in Story 1.5)
ar_coverage:
  - AR8      # lock-free top-tier preserved (resolver is pure; no lock acquisition)
  - AR9      # AR9 stdout JSON line invariant unchanged (single line per command invocation)
  - AR21     # PRIMARY — error UX shape (single-line actionable-hint contract codified at unit level)
  - AR22     # PRIMARY — actionable-hint regex `/^.*(Run|See|Try|Check) /` enforced + single-line constraint added
  - AR33     # no console.* in source (resolver uses no I/O — pure function)
  - AR34     # slash-command markdown protocol extended (commands/bmad-{loop,next}.md failurePolicies docs section)
  - AR41     # PRIMARY — boundary graph (NEW src/failure-ux/resolve-policy.ts mid-tier; NEW src/schemas/config.ts already foundational; resolver depends only on config schema + FailurePolicy type)
  - AR42     # test discipline (NEW CFG_56_* + RP_56_* unit tests; existing failurePolicyOverride seam kept ONLY for tests, DROPPED from production resolution path per OQ-5)
deps:
  - story: '5.5'
    reason: 'PRIMARY — failure-ux module COMPLETE — 4 handlers (retry/skip/route-to-fixer/escalate) + dispatchFailureUx central dispatcher. Story 5.6 adds the 5th public surface entry — `resolveFailurePolicy` — that consumes the failurePolicies config block and returns the resolved policy for the dispatcher. Inherits Story 5.5 SDR forward-trackers (4 nits N-1/N-2/N-3/N-4 + 17 info I-1 through I-17). The Story 5.5 manual-interactive-halt StopReason variant is orthogonal — Story 5.6 lands a per-step config knob, NOT a runner-level pause flag.'
  - story: '5.4'
    reason: 'PRIMARY — escalate handler from Story 5.4 + actionable-hint regex contract codified at integration level (src/integration/escalate-actionable-hint.test.ts). Story 5.6 DUPLICATES the regex contract at the UNIT level (extends src/errors.test.ts CI gate from Story 1.2 to also enforce single-line constraint per FR46). The escalate handler is the DEFAULT policy when no per-step config entry is set per architecture line 499 ("escalate is the safest fallback when no per-step policy is set"). Inherits Story 5.4 SDR forward-trackers I-1 through I-9.'
  - story: '5.3'
    reason: 'PRIMARY — `--auto-fix` flag + route-to-fixer handler. Story 5.6 confirms the priority order documented in Story 5.3 (architecture line 499): `--auto-fix` > config.failurePolicies > escalate-default. The override is for ONE RUN per AC line 1144 verbatim. The Story 5.3 effectiveFailurePolicyOverride composition at run.ts:978-981 is the precedent; Story 5.6 EXTENDS the composition to also consume the resolved policy from config (currently the resolver returns escalate-default; once the loader lands in 6.1, the resolver returns the configured policy).'
  - story: '5.2'
    reason: 'PRIMARY — SkipRequiresResumeError addition to registry (16 → 17). The CI gate already covers SkipRequiresResumeError per Story 5.2; Story 5.6 EXTENDS the gate with the single-line constraint check (no \\n in actionableHint). Inherits Story 5.2 SDR forward-trackers and the 4 cosmetic nits N-1/N-2/N-3/N-4.'
  - story: '5.1'
    reason: 'PRIMARY — failurePolicyOverride test seam at LoopOpts (run.ts:441) and NextOptions (next/run.ts:296). Story 5.6 KEEPS the seam for tests (allows unit-test injection without writing a config file) but DROPS it from the production resolution path per OQ-5 — production resolution flows: --auto-fix > config.failurePolicies (resolved via resolveFailurePolicy) > escalate-default. The seam remains for unit-test injection only and is documented as test-only in the Dev Agent Record.'
  - story: '1.2'
    reason: 'PRIMARY — errors-registry CI gate. Story 1.2 established the registry (15 codes → 16 with ScopeViolationError → 17 with SkipRequiresResumeError); the CI gate at src/errors.test.ts already enforces (a) non-empty hint, (b) AR22 regex /^.*(Run|See|Try|Check) /, (c) unique codes, (d) exitCode in {0,1,2,3,4,5}. Story 5.6 EXTENDS the gate with a NEW assertion (e) single-line constraint per FR46 (no `\\n` in actionableHint). The registry stays at 17 (Story 5.6 ships ZERO new error classes per AR21 + epic-4-retro Recommendations item 3).'
  - story: '6.1'
    reason: 'CROSS-STORY COORDINATION — config FILE LOADER lands in 6.1; Story 5.6 ships the SCHEMA + RESOLVER only. Story 5.6 does NOT read bmad-stepper.config.yaml from disk — that is Story 6.1 work (the loader will call ConfigV1Schema.parse on the YAML body and pass the parsed object to resolveFailurePolicy). Until Story 6.1 lands, the resolveFailurePolicy is invoked with `undefined` config in production (returning escalate-default for every step); tests pass synthetic config objects directly to the resolver. The Story 6.1 file loader will replace the `undefined` with the parsed config object — no resolver-API change needed (the resolver signature already accepts an optional config parameter from the existing Story 5.1 stub at failure-ux/index.ts:67-76).'
  - story: '4.6'
    reason: 'PATTERN — `--continue-on-error` flag (Story 4.6) is the LOOP-LEVEL counterpart to per-step failurePolicies (Story 5.6 PER-STEP). Both gate the post-failure path; Story 4.6 unconditionally continues regardless of policy; Story 5.6 lets the user pick per-step. Forward-tracker for Story 6.x: should `--continue-on-error` override the per-step policy or be subsumed by it?'
  - story: '4.10'
    reason: 'PATTERN — formatLoopExitLines unified two-line emission (Story 4.10) is the precedent for the actionable-error unified format (single line ending in concrete next-action verb). Story 5.6 codifies the FR32 + FR46 contract at the UNIT level via the extended CI gate.'
  - story: '3.1'
    reason: 'PATTERN — lastFailureReason recording (Story 3.1) is the failure-UX state mutation precedent. Story 5.6 does NOT extend lastFailureReason — the per-step policy is resolved BEFORE the failure-UX dispatch, NOT after. The resolved policy is consumed by dispatchFailureUx (Story 5.1+5.4); the resolution itself is upstream.'
  - story: '2.6'
    reason: 'PATTERN — verify-and-advance.ts is the dispatch-site for per-step policy resolution. Story 5.6 MODIFIES verify-and-advance.ts to thread the resolved policy through the existing failure-UX dispatch path (Story 5.1+5.4 already integrate dispatchFailureUx). The threading is a one-line replacement: `resolveFailurePolicy(dispatchSpec.step, undefined)` → `resolveFailurePolicy(dispatchSpec.step, opts?.config)` once the loader is wired (Story 6.1).'
  - story: '1.7'
    reason: 'PATTERN — NextArgsSchema (Story 1.7) is the args surface that already declares `--auto-fix`. Story 5.6 does NOT add new flags; the per-step policy is config-driven (NOT CLI-driven).'
  - story: '1.5'
    reason: 'SCHEMA — ConfigV1Schema in src/schemas/config.ts already declares `failurePolicies: z.record(z.string(), z.unknown()).default({})` (open-shape). Story 5.6 NARROWS the value type to `FailurePoliciesSchema = z.record(z.string(), z.enum(["retry", "skip", "route-to-fixer", "escalate"]))` for the failurePolicies sub-object (REPLACES `z.unknown()` with the closed enum union — see Task 2 below for the schema update). NO schema version bump (still v1; the open-shape entries that did not match the enum would have errored downstream anyway).'
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/implementation-artifacts/5-5-interactive-pause-between-steps.md
  - _bmad-output/implementation-artifacts/5-4-escalate-failure-mode.md
  - _bmad-output/implementation-artifacts/5-3-route-to-fixer-mode-auto-fix-flag.md
  - _bmad-output/implementation-artifacts/5-2-skip-failure-mode-skip-flag.md
  - _bmad-output/implementation-artifacts/5-1-retry-failure-mode.md
  - _bmad-output/implementation-artifacts/epic-4-retrospective.md
  - _bmad-output/implementation-artifacts/sprint-status.yaml
  - .bmad-stepper/state.yaml
  - .bmad-stepper/config.yaml
  - src/schemas/config.ts
  - src/schemas/config.test.ts
  - src/failure-ux/index.ts
  - src/failure-ux/index.test.ts
  - src/failure-ux/escalate.ts
  - src/failure-ux/retry.ts
  - src/failure-ux/skip.ts
  - src/failure-ux/route-to-fixer.ts
  - src/commands/loop/run.ts
  - src/commands/loop/run.test.ts
  - src/commands/next/run.ts
  - src/commands/next/run.test.ts
  - src/commands/next/verify-and-advance.ts
  - src/commands/next/verify-and-advance.test.ts
  - src/errors.ts
  - src/errors.test.ts
  - src/integration/escalate-actionable-hint.test.ts
  - commands/bmad-loop.md
  - commands/bmad-next.md
---

# Story 5.6: Per-Step Failure Policy via Config + Actionable Errors

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper user,
I want to configure per-step failure policies via `bmad-stepper.config.yaml` and receive actionable single-line errors with full detail in run logs,
So that I can tune the post-failure behaviour per step without code changes and triage failures without scanning verbose stack traces.

## Context Summary

This is the **SIXTH AND LAST STORY of Epic 5 (Failure-UX Modes & Auto-Fix)** and lands the **per-step failurePolicies config block + actionable-error contract codification** — the FINAL deliverable that closes Epic 5 by wiring the long-promised `failurePolicies: {dev-story: retry, code-review: route-to-fixer}` config knob and FORMALIZING the FR32+FR46 actionable-error contract at the UNIT-test layer (extends the Story 1.2 errors-registry CI gate). Stories 5.1-5.5 landed the FOUR FAILURE-UX HANDLERS (retry/skip/route-to-fixer/escalate) + the central `dispatchFailureUx` dispatcher + the `--auto-fix` and `--interactive` CLI flags + the `escalate` formal handler with verbatim hint contract verified at integration level. Story 5.6 closes the loop with the **5TH public surface entry** in the failure-ux module group — `resolveFailurePolicy(step, config)` — that takes the BMAD step ID and the optional parsed config object and returns the FailurePolicy union value (one of: retry, skip, route-to-fixer, escalate).

**Story 5.6 builds on the existing Story 5.1 stub at `src/failure-ux/index.ts:67-76`** — that stub returns "escalate" unconditionally regardless of the (currently-ignored) `config` parameter. Story 5.6 RELOCATES the resolver to a NEW dedicated file `src/failure-ux/resolve-policy.ts` (per OQ-1 decision below — separation of concerns mirrors the Story 5.1-5.4 per-handler file pattern) and HYDRATES it to read from the `config.failurePolicies[step]` lookup; the absent-step case still returns the `escalate` plugin default. The `src/failure-ux/index.ts` re-exports the resolver from the new file (preserves backwards compatibility for existing consumers at `src/commands/next/verify-and-advance.ts:101`).

**Story 5.6's scope is TWO BDD clauses rolled into a single AC block (epics.md lines 1140-1149)** decomposing into TWO PATHS:

- **Per-step policy resolution path (AC-1 — lines 1140-1144)**: when `bmad-stepper.config.yaml` declares `failurePolicies: { dev-story: retry, code-review: route-to-fixer }`, the resolver returns the configured policy for those steps; absent steps fall back to the plugin default `escalate`. **Concretely** in the resolver: `(step, config) => config?.failurePolicies?.[step] ?? "escalate"`. **And** loop-level `--auto-fix` overrides per-step policy to `route-to-fixer` for ONE RUN per AC line 1144 verbatim — this priority order is ALREADY WIRED at `src/commands/loop/run.ts:978-981` (the `effectiveFailurePolicyOverride` composition: `args.autoFix === true ? "route-to-fixer" : opts?.failurePolicyOverride`). Story 5.6 EXTENDS the composition to consume the resolved per-step policy: `args.autoFix === true ? "route-to-fixer" : opts?.failurePolicyOverride ?? resolveFailurePolicy(step, opts?.config)`. The Story 5.1 `failurePolicyOverride` seam is KEPT for tests (allows unit-test injection without writing a config file) but DROPPED from the production resolution path per OQ-5 decision (production callers do NOT pass a `failurePolicyOverride` value; they rely on the resolver alone).

- **Actionable-error contract path (AC-2 — lines 1145-1149)**: when ANY error class throws, the main-thread output is EXACTLY ONE LINE ending with a concrete next-action verb (regex `/^.*(Run|See|Try|Check) /` in the hint), and the full detail (stack trace if any, raw failure context) is in the run log only. **Concretely** in the CI gate: extend `src/errors.test.ts` (the Story 1.2 errors-registry CI gate) with a NEW assertion that EVERY actionableHint matches the AR22 regex (already enforced at the existing CI gate per Story 1.2 AC-1.b) AND that EVERY actionableHint is single-line (NEW assertion: `expect(instance.actionableHint).not.toMatch(/\\n/)`). The errors-registry CI gate covers all new codes added in Epic 5 — i.e., the Story 5.2 `SkipRequiresResumeError` (the only NEW class added in Epic 5; Stories 5.1/5.3/5.4/5.5 add ZERO new classes per AR21 + epic-4-retro Recommendations item 3). Story 5.6 ALSO adds ZERO new classes — registry stays at 17.

**Architectural challenge — config schema location and shape (per OQ-1 decision)**: Story 1.5 already declared `ConfigV1Schema` at `src/schemas/config.ts` with `failurePolicies: z.record(z.string(), z.unknown()).default({})` (open-shape). Story 5.6 NARROWS the value type to a closed enum union `FailurePolicySchema = z.enum(["retry", "skip", "route-to-fixer", "escalate"])` and the parent record to `FailurePoliciesSchema = z.record(z.string(), FailurePolicySchema)`. Per OQ-1 decision below: KEEP the schema in `src/schemas/config.ts` (extends the existing schema in-place rather than creating a NEW config-extension file); ADD `FailurePolicySchema` and `FailurePoliciesSchema` as standalone exports for direct reuse by the resolver tests + the future Story 6.1 file loader.

**Architectural challenge — story/loader split (per OQ-2 decision)**: the FILE LOADER (reading `bmad-stepper.config.yaml` from disk + invoking `Bun.file().text()` + YAML.parse + `ConfigV1Schema.parse`) is OUT-OF-SCOPE for Story 5.6 — that is Story 6.1 work per the project sprint plan. Story 5.6 ships **schema + resolver + tests ONLY**. Until Story 6.1 lands, the production callers invoke `resolveFailurePolicy(step, undefined)` (which returns escalate-default for every step); tests pass synthetic config objects directly to the resolver. The Story 6.1 file loader will replace the `undefined` with the parsed config object — NO resolver-API change needed (the resolver signature already accepts an optional config parameter).

**Architectural decision — `--auto-fix` override duration (per OQ-3 decision)**: per AC line 1144 verbatim, "loop-level `--auto-fix` overrides per-step policy to `route-to-fixer` for one run". The "one run" semantics is **single-process-invocation** — the override applies for the duration of the current `/bmad-loop` (or `/bmad-next` with `--auto-fix`) invocation; subsequent invocations without `--auto-fix` revert to the per-step config policy. The override is NEVER persisted to state.yaml or any other on-disk artifact (per AR8 lock-free top-tier + AR13 atomic-write contract — the runner does not mutate state.yaml). This is ALREADY WIRED at run.ts:978-981 (Story 5.3); Story 5.6 confirms the priority order in tests + docs.

**Architectural decision — per-step ID format (per OQ-4 decision)**: the `step` keys in `failurePolicies: { ... }` are BMAD step IDs (e.g., `bmad-create-story`, `bmad-dev-story`, `bmad-code-review`, `bmad-retrospective`). The user-facing convention matches the slash-command names (canonical BMAD method step IDs). The resolver does NOT normalize the keys (case-sensitive lookup); the user is responsible for matching the exact step ID per the BMAD method documentation. Forward-tracker for Story 6.x: optional alias mapping (e.g., `dev-story` → `bmad-dev-story`) if user feedback indicates confusion.

**Architectural decision — conflict resolution priority (per OQ-5 decision)**: the priority order is **`--auto-fix` > `opts.failurePolicyOverride` (test-only seam) > `config.failurePolicies[step]` > `escalate` (plugin default)**. The `opts.failurePolicyOverride` seam from Story 5.1 is KEPT for tests but DROPPED from production code paths — production callers do NOT pass a `failurePolicyOverride` value; they rely on the resolver alone. Documented as test-only seam in the Dev Agent Record. Concretely:

```typescript
const policy: FailurePolicy =
  args.autoFix === true
    ? "route-to-fixer"                                    // Priority 1 — --auto-fix override
    : (opts?.failurePolicyOverride                        // Priority 2 — test-only seam
       ?? resolveFailurePolicy(step, opts?.config));      // Priority 3+4 — config or escalate-default
```

**Architectural decision — errors-registry CI gate extension (per OQ-6 decision)**: the existing CI gate at `src/errors.test.ts` (from Story 1.2) covers (a) non-empty hint, (b) AR22 regex `/^.*(Run|See|Try|Check) /`, (c) unique codes, (d) exitCode in {0,1,2,3,4,5}, plus the post-Story-1.2 additions (AC-2 fixed-list 17 codes; instance is StepperError + Error; carries subclass name; toJSON() shape; constructor accepts detail string; SkipRequiresResumeError verbatim hint). Story 5.6 ADDS ONE NEW assertion: **(e) single-line constraint** per FR46 (`expect(instance.actionableHint).not.toMatch(/\\n/)`). The check is FAST and covers all 17 existing codes + future codes. Story 5.6 does NOT add a new error class — the gate extension is a future-tracker (any future error class added by Epic 6+ MUST satisfy the extended gate).

**Architectural decision — future error classes responsibility (per OQ-7 decision)**: any future error class added by Epic 6+ MUST update BOTH the registry (`src/errors.ts` + `errorRegistry` export + `StepperErrorCode` union) AND the CI gate test (`REQUIRED_CODES` array at `src/errors.test.ts:29-47` + the count assertion at line 56-58). The CI gate is the FORWARD-TRACKER mechanism — failing to update it is the discoverability signal. Story 5.6 ships the gate extension; future stories inherit the discipline.

**Architectural decision — docs synchronization (per OQ-8 decision)**: the `failurePolicies:` config docs section is canonical in `commands/bmad-loop.md` (the loop-level slash-command — most users will encounter the config knob via `/bmad-loop` runs). `commands/bmad-next.md` cross-links to the canonical section (single source of truth; mirrors the Story 5.3 `--auto-fix` docs pattern). The docs section covers: schema shape, valid policy values (retry/skip/route-to-fixer/escalate), absent-step fallback (escalate plugin default), `--auto-fix` priority override, example config block, cross-references to FR31 + FR32 + FR46, and a forward-tracker note that the FILE LOADER lands in Story 6.1.

**Architectural decision — telemetry consumption (per OQ-9 decision)**: the per-step policy values (resolved at dispatch time) are ALREADY captured in `state.runHistory[]` (the `resolvedFailurePolicy` field on `NextResult` per Story 5.3). Story 5.6 does NOT add new telemetry fields. Forward-tracker for Story 6.6/6.7: aggregate `resolvedFailurePolicy` distribution per project (e.g., "73% of bmad-dev-story failures use retry") to inform user about policy effectiveness. Cross-story dependency: Epic 6 telemetry consumption.

**Architectural decision — invalid policy values in config (per OQ-10 decision)**: when the user authors `failurePolicies: { dev-story: nonsense-policy }` in the YAML, the Zod parse REJECTS the config with a structured validation error (no silent fallback to escalate; surfaces the error via the existing ConfigError class with the byte-identical hint "See bmad-stepper.config.yaml; run /bmad-next --doctor to validate the file against the schema."). The Story 6.1 file loader will surface the parse error; Story 5.6 ships the schema narrowing that enables the rejection. The user-facing failure mode is: bmad-stepper.config.yaml authored with a typo → /bmad-next or /bmad-loop EXIT IMMEDIATELY with ConfigError → the user fixes the typo → loop resumes.

**The 17-code error registry stays at 17** per AR21 + epic-4-retrospective.md §Recommendations item 3 ("Epic 5 should NOT add new error classes — registry stability discipline established across Epics 2/3/4"). Story 5.6 ships ZERO new error classes — the CI-gate extension is a forward-tracker for future Epic 6+ classes, NOT a registry expansion.

**Concretely, Story 5.6 produces**:

1. **MODIFY `src/schemas/config.ts`** (~+15-25 lines): NARROW the `failurePolicies` field from `z.record(z.string(), z.unknown())` to `z.record(z.string(), FailurePolicySchema)` where `FailurePolicySchema = z.enum(["retry", "skip", "route-to-fixer", "escalate"])`. ADD standalone exports: `FailurePolicySchema`, `FailurePoliciesSchema`, plus the inferred TypeScript types `FailurePolicy` and `FailurePolicies`. NO schema version bump (still v1; the closed-enum narrowing is BACKWARDS COMPATIBLE for existing fixtures that have `failurePolicies: {}` — the empty record still parses).

2. **MODIFY `src/schemas/config.test.ts`** (~+30-40 lines): ADD a NEW `describe` block `CFG_56_*` covering:
   - **CFG_56_1 — narrowed enum accepts valid policies**: `ConfigV1Schema.parse({ ...fixture, failurePolicies: { "dev-story": "retry" } })` returns the parsed object with the policy preserved.
   - **CFG_56_2 — narrowed enum accepts all 4 policy values**: parametric test over [retry, skip, route-to-fixer, escalate] each parses successfully.
   - **CFG_56_3 — narrowed enum rejects invalid policy**: `ConfigV1Schema.parse({ ...fixture, failurePolicies: { "dev-story": "nonsense-policy" } })` throws (or `safeParse` returns success: false).
   - **CFG_56_4 — narrowed enum rejects non-string policy**: `failurePolicies: { "dev-story": 42 }` rejected.
   - **CFG_56_5 — empty failurePolicies map default**: omitted `failurePolicies` parses to `{}` per existing default.
   - **CFG_56_6 — multiple step entries**: `failurePolicies: { "bmad-dev-story": "retry", "bmad-code-review": "route-to-fixer" }` parses with both entries preserved.
   - **CFG_56_7 — case-sensitivity**: step IDs are case-sensitive (`"BMad-Dev-Story"` is a DIFFERENT step from `"bmad-dev-story"`); both parse but the resolver lookups are independent.

3. **NEW `src/failure-ux/resolve-policy.ts`** (~+50-80 lines): exports `resolveFailurePolicy(step: string, config?: { failurePolicies?: FailurePolicies }): FailurePolicy`. Pure function (no I/O; no state mutation). Implementation: `return config?.failurePolicies?.[step] ?? "escalate"`. JSDoc covers: priority order (--auto-fix > test-only-seam > config > escalate-default), absent-step fallback, future Story 6.1 file-loader integration, AR41 boundary (foundational tier — depends only on src/schemas/config.ts + the FailurePolicy type re-exported from src/failure-ux/index.ts). The signature MATCHES the existing stub at src/failure-ux/index.ts:67-76 (backwards compatible).

4. **NEW `src/failure-ux/resolve-policy.test.ts`** (~+100-150 lines): unit tests `RP_56_*` covering:
   - **RP_56_1 — escalate default when no config**: `resolveFailurePolicy("any-step", undefined)` returns "escalate".
   - **RP_56_2 — escalate default when empty config**: `resolveFailurePolicy("any-step", {})` returns "escalate".
   - **RP_56_3 — escalate default when failurePolicies absent**: `resolveFailurePolicy("any-step", { failurePolicies: undefined })` returns "escalate".
   - **RP_56_4 — escalate default when step not in failurePolicies**: `resolveFailurePolicy("nonexistent-step", { failurePolicies: { "other-step": "retry" } })` returns "escalate".
   - **RP_56_5 — returns configured retry**: `resolveFailurePolicy("dev-story", { failurePolicies: { "dev-story": "retry" } })` returns "retry".
   - **RP_56_6 — returns configured skip**: same shape with "skip" → returns "skip".
   - **RP_56_7 — returns configured route-to-fixer**: same shape → returns "route-to-fixer".
   - **RP_56_8 — returns configured escalate**: same shape → returns "escalate" (explicit, not default).
   - **RP_56_9 — case-sensitive lookup**: `resolveFailurePolicy("Dev-Story", { failurePolicies: { "dev-story": "retry" } })` returns "escalate" (case mismatch falls through).
   - **RP_56_10 — multi-step config**: `resolveFailurePolicy("bmad-dev-story", { failurePolicies: { "bmad-dev-story": "retry", "bmad-code-review": "route-to-fixer" } })` returns "retry".
   - **RP_56_11 — pure function (idempotent)**: 100 calls with same input → same output; no shared state.

5. **MODIFY `src/failure-ux/index.ts`** (~+5-10 lines change, ~-10 lines stub removed): REPLACE the existing inline `resolveFailurePolicy` stub at lines 67-76 with a re-export from the new `./resolve-policy.ts` file (`export { resolveFailurePolicy } from "./resolve-policy.ts"`). Update the JSDoc on the public surface comment (lines 13-21) to mention Story 5.6 wires the per-step config consumption.

6. **MODIFY `src/failure-ux/index.test.ts`** (zero or minimal change): the existing tests at this file already cover the dispatcher; Story 5.6's resolver tests live in the new `resolve-policy.test.ts`. Optional: ADD a small backwards-compatibility test asserting the re-export from `index.ts` matches the canonical export from `resolve-policy.ts` (single sanity check).

7. **MODIFY `src/commands/loop/run.ts`** (~+5-15 lines): EXTEND the existing `effectiveFailurePolicyOverride` composition at lines 978-981 to consume the resolved per-step policy from the resolver. The composition becomes:

```typescript
const effectiveFailurePolicyOverride: FailurePolicy | undefined =
  args.autoFix === true
    ? "route-to-fixer"
    : (opts?.failurePolicyOverride
       ?? resolveFailurePolicy(plannedStep, opts?.config));
```

The new branch passes the planned step (computed inline OR via the existing `peekState?.lastSuccessfulStep?.step` pattern from Story 5.5) and the optional config (currently `undefined` until Story 6.1 wires the loader). The seam preservation: production callers do NOT pass `failurePolicyOverride`; tests pass it for unit-test injection. Until Story 6.1, `opts?.config` is always undefined → resolver returns escalate-default → no functional change.

8. **MODIFY `src/commands/next/run.ts`** (~+5-15 lines): MIRROR the same extension at next/run.ts:2000-2010 (the `resolvedFailurePolicy` composition). The composition becomes:

```typescript
const resolvedFailurePolicy: FailurePolicy | undefined =
  args.autoFix === true
    ? "route-to-fixer"
    : (opts?.failurePolicyOverride
       ?? resolveFailurePolicy(action.step, opts?.config));
```

9. **MODIFY `src/commands/next/verify-and-advance.ts`** (~+3-8 lines): the existing import at line 100-102 already imports `resolveFailurePolicy`. Story 5.6 EXTENDS the call at line 1011-1015 to pass the optional config:

```typescript
const policy: FailurePolicy =
  args.autoFix === true
    ? "route-to-fixer"
    : (opts?.failurePolicyOverride
       ?? resolveFailurePolicy(dispatchSpec.step, opts?.config));
```

10. **MODIFY `src/errors.test.ts`** (~+15-30 lines): EXTEND the existing CI gate `describe("errorRegistry", ...)` block at lines 52-122 with a NEW `it` block per OQ-6 decision:

```typescript
it("every actionableHint is SINGLE-LINE — no \\n character (FR46)", () => {
  for (const instance of instances) {
    expect(instance.actionableHint).not.toMatch(/\\n/);
    // Defence-in-depth: also check carriage return.
    expect(instance.actionableHint).not.toMatch(/\\r/);
  }
});
```

ADD the test in the same `describe("errorRegistry", ...)` block as the existing AR22 regex check (line 71-75). The test iterates over the same `instances` array; covers all 17 existing codes; future codes AUTOMATICALLY pass through the gate (no per-class assertion needed).

11. **MODIFY `commands/bmad-loop.md`** (~+50-80 lines): ADD a NEW sub-section `### failurePolicies: config block (Story 5.6)` documenting:
   - The schema shape: `failurePolicies: { <step-id>: <policy-value> }`.
   - The four valid policy values: retry, skip, route-to-fixer, escalate.
   - The absent-step fallback: escalate (plugin default per architecture line 499).
   - The `--auto-fix` priority override: overrides per-step policy to route-to-fixer for one run (per AC line 1144 verbatim).
   - The priority order: --auto-fix > config.failurePolicies > escalate-default.
   - Example config block with two policies (dev-story: retry, code-review: route-to-fixer).
   - Cross-references to FR31 + FR32 + FR46.
   - Forward-tracker note that the FILE LOADER lands in Story 6.1 (currently the resolver is invoked with undefined config in production).

12. **MODIFY `commands/bmad-next.md`** (~+10-20 lines): ADD a SHORT sub-section `### failurePolicies: config block` cross-linking to the canonical section in commands/bmad-loop.md (single source of truth; mirrors Story 5.3 --auto-fix docs pattern).

13. **NO src/ mutations beyond the above** — Story 5.6 ships ZERO new error classes (registry stays at 17); ZERO state.yaml schema changes (Story 1.5 schema unchanged); ZERO new CLI flags (per-step policy is config-driven, NOT CLI-driven).

## Acceptance Criteria

**Given** `bmad-stepper.config.yaml` with `failurePolicies: { dev-story: retry, code-review: route-to-fixer }`
**When** Stepper resolves the per-step policy
**Then** the configured policy applies; absent steps fall back to plugin default `escalate`
**And** loop-level `--auto-fix` overrides per-step policy to `route-to-fixer` for one run
**Given** every error class
**When** thrown
**Then** the main-thread output is exactly one line ending with a concrete next-action verb (regex `/^.*(Run|See|Try|Check) /` in the hint), and the full detail (stack trace if any, raw failure context) is in the run log only (FR32, FR46, NFR-M2)
**And** errors-registry CI gate (Story 1.2) covers all new codes added in Epic 5

## Tasks / Subtasks

- [x] **Task 0 — Pre-flight evidence verification**
  - [x] 0.1 Confirm AC byte-identical to epics.md lines 1140-1149 via `diff /tmp/ac-from-epics-56.txt /tmp/ac-from-story-56.txt` → empty output expected.
  - [x] 0.2 Confirm sprint-status.yaml: 5-6-per-step-failure-policy-via-config-actionable-errors row at line 100 currently `backlog` (Story 5.5 done; epic-5 stays in-progress; 1 story remaining = 5.6 — THIS story).
  - [x] 0.3 Confirm errors registry at 17 codes via `grep -c "extends StepperError" src/errors.ts` → 17 (UNCHANGED; Story 5.6 adds ZERO new error classes).
  - [x] 0.4 Confirm baseline test counts via `bun test`: ~1237 pass / 0 fail / ~4348 expects across 66 files (Story 5.5 close baseline).
  - [x] 0.5 Confirm `ConfigV1Schema.failurePolicies` field already declared at `src/schemas/config.ts:28` as `z.record(z.string(), z.unknown()).default({})` (Story 1.5 baseline; Story 5.6 NARROWS the value type).
  - [x] 0.6 Confirm `resolveFailurePolicy` stub already declared at `src/failure-ux/index.ts:67-76` (Story 5.1 placeholder; Story 5.6 RELOCATES to a NEW file `src/failure-ux/resolve-policy.ts` per OQ-1).
  - [x] 0.7 Confirm Story 5.3 `effectiveFailurePolicyOverride` composition at `src/commands/loop/run.ts:978-981` (the priority order anchor; Story 5.6 EXTENDS the composition to consume the resolved policy).
  - [x] 0.8 Confirm Story 5.4 escalate-actionable-hint integration test at `src/integration/escalate-actionable-hint.test.ts` (33 tests / 114 expects baseline; Story 5.6 does NOT modify this file — the unit-level CI gate extension at src/errors.test.ts is COMPLEMENTARY, not a replacement).
  - [x] 0.9 Confirm `commands/bmad-loop.md` already documents `--auto-fix` (Story 5.3); Story 5.6 ADDS the failurePolicies: config block sub-section AFTER the --auto-fix sub-section (canonical placement).

- [x] **Task 1 — Address Story 5.5 + Stories 5.1/5.2/5.3/5.4 + Epic-4 retrospective forward action items**
  - [x] 1.1 Per Story 5.5 SDR §Forward-trackers (To Story 5.6 — explicit cross-story note from Story 5.5 SDR I-17 "Per-step `interactiveSteps: string[]` config knob to Story 5.6"): NOT APPLICABLE for Story 5.6 — `--interactive` is a loop-level flag (Story 5.5); Story 5.6 lands the per-step failurePolicies block ONLY. The `interactiveSteps` knob is forward-tracker for Story 6.x.
  - [x] 1.2 Per Story 5.5 SDR §Forward-trackers I-1 through I-17: 9 inherited + 8 NEW (I-10 Claude Code chat / I-11 liberalize parsing / I-12 --interactive=fixer / I-13 enrich prompt / I-14 integration test / I-15 Node.js stdin / I-16 telemetry / I-17 interactiveSteps). NONE actively HONOURED by Story 5.6 (all are Story 5.5/6.x scope). Story 5.6 INHERITS all 17 forward-trackers unchanged.
  - [x] 1.3 Per Story 5.5 inherited cosmetic nits N-1/N-2/N-3/N-4: defensive null check at stop-conditions.ts:269; EMPTY_DAG + EMPTY_STATE sentinels mid-file placement; future task-record snapshot timing; TWO unused LoopOpts seams (`finalStateOverride` + `writeLoopExitTranscriptOverride`) declared but never consumed. Story 5.6 INHERITS all 4 unchanged — does NOT modify any of these surfaces.
  - [x] 1.4 Per Story 5.4 SDR §Forward-trackers I-1 through I-9: ALL inherited; Story 5.6 actively HONOURS none directly (the actionable-hint regex contract codification at unit level is the Story 5.6 deliverable per AC-2; the integration-level test at src/integration/escalate-actionable-hint.test.ts from Story 5.4 is COMPLEMENTARY, not a duplicate).
  - [x] 1.5 Per Story 5.3 SDR §I-1 (atomic-write contract): NOT APPLICABLE — Story 5.6 does NOT mutate state.yaml; the resolver is pure.
  - [x] 1.6 Per Story 5.3 SDR §I-2 (SIGINT cooperation): NOT APPLICABLE — Story 5.6 is a synchronous resolver call inside the dispatch site; SIGINT is upstream.
  - [x] 1.7 Per Story 5.3 SDR §I-3 (Production retry-dispatch mechanism gap): EXTENDED — Story 5.6 closes the production resolution path (replaces the unconditional escalate-default with the config-driven resolution); the actual retry-dispatch mechanism (Story 6.x retry orchestrator) is still a forward-tracker.
  - [x] 1.8 Per Story 5.3 SDR §I-4 (D1 dual-shape consolidation): NOT APPLICABLE.
  - [x] 1.9 Per Story 5.3 SDR §I-5 (Telemetry consumption — Story 6.6/6.7): EXTENDED — `resolvedFailurePolicy` field on NextResult (Story 5.3) already captures the per-iteration policy; Story 6.6/6.7 may aggregate distribution per project. Cross-story dependency forward-tracker.
  - [x] 1.10 Per Story 5.3 SDR §I-6 through §I-9: NOT APPLICABLE / EXTENDED similarly.
  - [x] 1.11 Per Story 5.2 SDR §Forward-trackers: ALL inherited; Story 5.6 does NOT extend the SkipRequiresResumeError; the gate extension covers it incidentally.
  - [x] 1.12 Per Story 5.1 SDR §Forward-trackers: ALL inherited; the failurePolicyOverride seam is KEPT for tests (per OQ-5 decision); production resolution flows through the new resolver.
  - [x] 1.13 Per epic-4-retrospective.md §Recommendations item 1 (failure modes MUST consume formatLoopExitLines): NOT APPLICABLE — Story 5.6 is upstream of the loop-exit emission.
  - [x] 1.14 Per epic-4-retrospective.md §Recommendations item 2 (per-step failurePolicies config — Story 5.6): **PRIMARY HONOURED** — this is the canonical Story 5.6 deliverable.
  - [x] 1.15 Per epic-4-retrospective.md §Recommendations item 3 (Epic 5 should NOT add new error classes): HONOURED — Story 5.6 ships ZERO new error classes (registry stays at 17).
  - [x] 1.16 Per epic-4-retrospective.md §Recommendations item 4 (each Story 5.x flow MUST be tested with SIGINT-mid-flight): NOT APPLICABLE — Story 5.6 is a synchronous resolver, not a long-running flow.
  - [x] 1.17 Per epic-4-retrospective.md §Recommendations item 7 (runHistory[] attempt-number metadata): NOT APPLICABLE.

- [x] **Task 2 — Narrow ConfigV1Schema.failurePolicies to closed enum + add standalone exports (AC: 1.1)**
  - [x] 2.1 Modify `src/schemas/config.ts`. ADD the standalone exports (BEFORE the existing `ConfigV1Schema`):
    ```typescript
    export const FailurePolicySchema = z.enum([
      "retry",
      "skip",
      "route-to-fixer",
      "escalate",
    ]);

    export const FailurePoliciesSchema = z.record(
      z.string(),
      FailurePolicySchema,
    );

    export type FailurePolicy = z.infer<typeof FailurePolicySchema>;
    export type FailurePolicies = z.infer<typeof FailurePoliciesSchema>;
    ```
  - [x] 2.2 NARROW the `failurePolicies` field in `ConfigV1Schema` from `z.record(z.string(), z.unknown()).default({})` to `FailurePoliciesSchema.default({})`. Update the JSDoc on the schema to mention Story 5.6 narrowed the value type per FR31.
  - [x] 2.3 Confirm `bunx tsc --noEmit` exit 0 — TypeScript exhaustiveness validates the narrowed enum reaches all consumers. Per AR41 the schema is foundational tier; the resolver consumes it via the standalone `FailurePolicies` type alias.
  - [x] 2.4 The `FailurePolicy` type alias in `src/failure-ux/index.ts:32` (`export type FailurePolicy = "retry" | "skip" | "route-to-fixer" | "escalate";`) should remain — both type aliases (config-schema-derived AND failure-ux-module local) UNIFY to the same union of 4 strings. Per OQ-1 + AR20 type-alias chain: the config-schema export (`FailurePolicy` from src/schemas/config.ts) is the CANONICAL TYPE; the failure-ux/index.ts re-exports OR keeps the inline union as a backwards-compatibility shim — DECIDE in dev iteration. Recommended: keep both for backwards compatibility (the unions are byte-identical; TypeScript treats them as the same type).

- [x] **Task 3 — Add CFG_56_* tests in src/schemas/config.test.ts (AC: 1.1)**
  - [x] 3.1 Modify `src/schemas/config.test.ts`. ADD a NEW `describe` block `CFG_56_*: failurePolicies narrowed enum (Story 5.6)` covering:
    - **CFG_56_1**: `ConfigV1Schema.parse({ ...canonicalConfigV1Fixture, failurePolicies: { "dev-story": "retry" } })` returns the parsed object with `failurePolicies["dev-story"] === "retry"`.
    - **CFG_56_2**: parametric over [retry, skip, route-to-fixer, escalate] each parses successfully when used as the value in a single-entry failurePolicies record.
    - **CFG_56_3**: `ConfigV1Schema.safeParse({ ...fixture, failurePolicies: { "dev-story": "nonsense-policy" } })` returns success: false.
    - **CFG_56_4**: `ConfigV1Schema.safeParse({ ...fixture, failurePolicies: { "dev-story": 42 } })` returns success: false.
    - **CFG_56_5**: omitted `failurePolicies` parses to `{}` per existing default (verifies backwards compat).
    - **CFG_56_6**: `failurePolicies: { "bmad-dev-story": "retry", "bmad-code-review": "route-to-fixer" }` parses with both entries preserved.
    - **CFG_56_7**: `failurePolicies: { "BMad-Dev-Story": "retry", "bmad-dev-story": "skip" }` parses (case-sensitive lookup; both step IDs are valid distinct keys).
  - [x] 3.2 Optional CFG_56_REGISTRY_*: add tests that import `FailurePolicySchema` directly and assert its enum values match the closed union.

- [x] **Task 4 — NEW src/failure-ux/resolve-policy.ts (AC: 1.1)**
  - [x] 4.1 CREATE `src/failure-ux/resolve-policy.ts`. Pure function module per AR41 mid-tier. Exports `resolveFailurePolicy(step: string, config?: { failurePolicies?: FailurePolicies }): FailurePolicy`.
    ```typescript
    /**
     * src/failure-ux/resolve-policy.ts — Per-step failure policy resolver
     * (Story 5.6 — FR31 PRIMARY).
     *
     * Pure function. Mid-tier per AR41. Depends on:
     *   - src/schemas/config.ts FailurePolicies type (foundational tier)
     *   - src/failure-ux/index.ts FailurePolicy type (mid-tier; same module group)
     *
     * Priority order at the dispatch site (codified in run.ts + verify-and-advance.ts):
     *   1. --auto-fix flag → route-to-fixer (overrides everything; one-run scope)
     *   2. opts.failurePolicyOverride (test-only seam; production callers do NOT pass)
     *   3. config.failurePolicies[step] (this resolver's responsibility)
     *   4. plugin default escalate (this resolver's fallback)
     *
     * The Story 6.1 file loader will pass the parsed config object to this
     * resolver; until then, production callers pass undefined → escalate-default.
     *
     * @param step    The BMAD step ID (e.g., "bmad-dev-story", "bmad-code-review").
     * @param config  Optional parsed config object with the failurePolicies record.
     * @returns The resolved FailurePolicy value (one of: retry, skip, route-to-fixer, escalate).
     */
    import type { FailurePolicies } from "../schemas/config.ts";
    import type { FailurePolicy } from "./index.ts";

    export function resolveFailurePolicy(
      step: string,
      config?: { failurePolicies?: FailurePolicies },
    ): FailurePolicy {
      const fromConfig = config?.failurePolicies?.[step];
      if (fromConfig !== undefined) {
        return fromConfig;
      }
      return "escalate";
    }
    ```
  - [x] 4.2 The signature MATCHES the existing stub at src/failure-ux/index.ts:67-76 (backwards compatible). Existing callers at src/commands/next/verify-and-advance.ts:101 continue to import from src/failure-ux/index.ts (which re-exports per Task 6).

- [x] **Task 5 — NEW src/failure-ux/resolve-policy.test.ts (AC: 1.1)**
  - [x] 5.1 CREATE `src/failure-ux/resolve-policy.test.ts`. Unit tests `RP_56_*` covering all 11 cases per the Test Surface Inventory below. Use `import { resolveFailurePolicy } from "./resolve-policy.ts";`.
  - [x] 5.2 Each test uses synthetic config objects directly (no config file I/O — that is Story 6.1 work).
  - [x] 5.3 Type-safety: test the resolver's return-type narrowing — the returned value MUST be assignable to `FailurePolicy` (compile-time check via `const policy: FailurePolicy = resolveFailurePolicy(...)`).

- [x] **Task 6 — MODIFY src/failure-ux/index.ts re-export resolveFailurePolicy (AC: 1.1)**
  - [x] 6.1 Modify `src/failure-ux/index.ts`. REMOVE the existing inline `resolveFailurePolicy` function definition at lines 67-76. REPLACE with a re-export from the new file: `export { resolveFailurePolicy } from "./resolve-policy.ts";` (place near the existing dispatcher re-exports).
  - [x] 6.2 Update the JSDoc on the public surface comment block (lines 13-21) — change "Story 5.6 wires the failurePolicies: config block to the resolver." (existing forward-reference) to "Story 5.6 LANDED the failurePolicies: config block consumption — the resolver is now in `./resolve-policy.ts` (separation of concerns mirrors the per-handler file pattern for retry/skip/route-to-fixer/escalate)."
  - [x] 6.3 Confirm the `FailurePolicy` type alias remains at line 32 (or is re-exported from src/schemas/config.ts per OQ-1 decision in Task 2.4).

- [x] **Task 7 — MODIFY src/commands/loop/run.ts effectiveFailurePolicyOverride composition (AC: 1.1)**
  - [x] 7.1 Modify `src/commands/loop/run.ts`. EXTEND the existing composition at lines 978-981. Per OQ-5 decision the priority order becomes: `--auto-fix > opts.failurePolicyOverride (test-only) > resolveFailurePolicy(step, config) > escalate-default`. Concretely:
    ```typescript
    const effectiveFailurePolicyOverride:
      | import("../../failure-ux/index.ts").FailurePolicy
      | undefined =
      args.autoFix === true
        ? "route-to-fixer"
        : (opts?.failurePolicyOverride
           ?? resolveFailurePolicy(plannedStep, opts?.config));
    ```
  - [x] 7.2 The `plannedStep` value is computed via the existing `peekState?.lastSuccessfulStep?.step` pattern (Story 5.5 precedent at line 1235) OR the existing per-iteration step computation (whatever name the dev finds in the iteration body). Forward-tracker: use the most-current step name available at composition time.
  - [x] 7.3 ADD `opts?.config` to the LoopOpts interface declaration (~line 290-420 area). Type: `readonly config?: { failurePolicies?: import("../../schemas/config.ts").FailurePolicies };`. Document in JSDoc as "Story 5.6 — optional parsed config object for per-step policy resolution. Production callers receive this from the Story 6.1 file loader; tests pass synthetic config objects directly."
  - [x] 7.4 Per OQ-5 decision: the `failurePolicyOverride` seam is KEPT for tests; production callers do NOT pass it. Document in the seam's JSDoc as "TEST-ONLY SEAM (per Story 5.6 OQ-5) — production resolution flows through `resolveFailurePolicy(step, opts?.config)`."
  - [x] 7.5 Add `import { resolveFailurePolicy } from "../../failure-ux/index.ts";` if not already present (likely already imported via the existing FailurePolicy type-only import).

- [x] **Task 8 — MODIFY src/commands/next/run.ts resolvedFailurePolicy composition (AC: 1.1)**
  - [x] 8.1 Modify `src/commands/next/run.ts`. EXTEND the existing composition at lines 2000-2010. Per OQ-5 decision:
    ```typescript
    const resolvedFailurePolicy:
      | import("../../failure-ux/index.ts").FailurePolicy
      | undefined =
      args.autoFix === true
        ? "route-to-fixer"
        : (opts?.failurePolicyOverride
           ?? resolveFailurePolicy(action.step, opts?.config));
    ```
  - [x] 8.2 ADD `opts?.config` to the RunNextOptions interface declaration. Type: `readonly config?: { failurePolicies?: import("../../schemas/config.ts").FailurePolicies };`. Document JSDoc analogously to Task 7.3.
  - [x] 8.3 The `action.step` value is the BMAD step ID computed by the dispatch action. Per OQ-4 decision: case-sensitive lookup; the user is responsible for matching the exact step ID per BMAD method documentation.
  - [x] 8.4 Add the `resolveFailurePolicy` import if not already present.

- [x] **Task 9 — MODIFY src/commands/next/verify-and-advance.ts policy resolution (AC: 1.1)**
  - [x] 9.1 Modify `src/commands/next/verify-and-advance.ts`. EXTEND the existing call at lines 1011-1015. Per OQ-5 decision:
    ```typescript
    const policy: FailurePolicy =
      args.autoFix === true
        ? "route-to-fixer"
        : (opts?.failurePolicyOverride
           ?? resolveFailurePolicy(dispatchSpec.step, opts?.config));
    ```
  - [x] 9.2 ADD `opts?.config` to the RunVerifyAndAdvanceOptions interface declaration. Type: `readonly config?: { failurePolicies?: import("../../schemas/config.ts").FailurePolicies };`. Document JSDoc analogously to Task 7.3.
  - [x] 9.3 The existing import at line 100-102 (`type FailurePolicy, resolveFailurePolicy`) is unchanged — the resolver is re-exported from src/failure-ux/index.ts per Task 6.1.

- [x] **Task 10 — MODIFY src/errors.test.ts CI gate single-line constraint (AC: 2)**
  - [x] 10.1 Modify `src/errors.test.ts`. EXTEND the existing `describe("errorRegistry", ...)` block at lines 52-122. ADD a NEW `it` block AFTER the existing AR22 regex check (line 71-75):
    ```typescript
    it("every actionableHint is SINGLE-LINE — no \\n character (Story 5.6 — FR46)", () => {
      for (const instance of instances) {
        // FR46: main-thread output is exactly ONE LINE; full detail lives in the
        // run log only. The CI gate enforces single-line constraint at the unit
        // level (extends the Story 1.2 errors-registry CI gate per Story 5.6 AC-2).
        expect(instance.actionableHint).not.toMatch(/\n/);
        // Defence-in-depth: also reject carriage return (Windows line endings).
        expect(instance.actionableHint).not.toMatch(/\r/);
      }
    });
    ```
  - [x] 10.2 Confirm the test name contains the Story 5.6 prefix `Story 5.6` for forward-tracker discoverability.
  - [x] 10.3 Update the file's top JSDoc at lines 1-19 to mention the Story 5.6 single-line gate extension.
  - [x] 10.4 Optional CFG_56_REGISTRY_*: add a parametric test enumerating all 17 codes via `REQUIRED_CODES.forEach(...)` (defence-in-depth — already covered by the iteration over `instances`).
  - [x] 10.5 Confirm baseline test count: `bun test src/errors.test.ts` was 14/0/215 at Story 5.5 close; expected post-Story-5.6 is 15/0/232 (+1 test +17 expects).

- [x] **Task 11 — MODIFY commands/bmad-loop.md failurePolicies docs section (AC: 1)**
  - [x] 11.1 Modify `commands/bmad-loop.md`. ADD a NEW sub-section `### failurePolicies: config block (Story 5.6 — per-step policy)` AFTER the existing `--auto-fix` Story 5.3 sub-section. Cover:
    - The schema shape: `failurePolicies: { <step-id>: <policy-value> }` in bmad-stepper.config.yaml.
    - The four valid policy values: `retry` (3 attempts max; Story 5.1), `skip` (skip the failed step; Story 5.2), `route-to-fixer` (dispatch a fixer sub-agent; Story 5.3), `escalate` (halt with actionable error; Story 5.4 — DEFAULT).
    - The absent-step fallback: `escalate` plugin default (per architecture line 499 — "escalate is the safest fallback when no per-step policy is set").
    - The `--auto-fix` priority override: overrides per-step policy to `route-to-fixer` for one run (per AC line 1144 verbatim).
    - The priority order: `--auto-fix > config.failurePolicies > escalate-default`.
    - The user-authored config example:
      ```yaml
      failurePolicies:
        bmad-dev-story: retry
        bmad-code-review: route-to-fixer
      ```
    - Cross-references to FR31 + FR32 + FR46 + NFR-M2.
    - Forward-tracker note: the FILE LOADER lands in Story 6.1 (currently the resolver is invoked with undefined config in production → escalate-default for every step until 6.1 wires the loader).
    - Per-step ID format note: BMAD step IDs (e.g., bmad-create-story, bmad-dev-story, bmad-code-review, bmad-retrospective); case-sensitive.
    - Invalid policy values handling: Zod parse REJECTS the config with structured ConfigError + actionable hint "See bmad-stepper.config.yaml; run /bmad-next --doctor to validate the file against the schema."
  - [x] 11.2 UPDATE the trailing "FR cross-reference" paragraph to add FR31 + FR32 + FR46 (the THREE FRs that Story 5.6 PRIMARY-covers).

- [x] **Task 12 — MODIFY commands/bmad-next.md failurePolicies cross-link (AC: 1)**
  - [x] 12.1 Modify `commands/bmad-next.md`. ADD a SHORT sub-section `### failurePolicies: config block` AFTER the existing `--auto-fix` Story 5.3 sub-section. Body:
    - The per-step `failurePolicies:` config block applies to `/bmad-next` invocations the same way it applies to `/bmad-loop` iterations.
    - Cross-link to the canonical section in commands/bmad-loop.md for the schema, valid values, priority order, and example config.
    - Single-source-of-truth pattern: the canonical docs live in commands/bmad-loop.md (per OQ-8); this section confirms /bmad-next is COVERED by the same config block (no separate /bmad-next-only failurePolicies surface).

- [x] **Task 13 — Run full test suite + quality gates (AC: all)**
  - [x] 13.1 Run `bunx tsc --noEmit` — exit 0 (no type errors after schema narrowing + resolver consumption).
  - [x] 13.2 Run `bunx --bun biome ci .` — exit 0 (after any biome --write pass for new test file formatting).
  - [x] 13.3 Run `bun test src/schemas/` — expect ~107/0/200 (Story 5.5 baseline ~100/0/185; +7 CFG_56_* tests +15 expects).
  - [x] 13.4 Run `bun test src/failure-ux/` — expect ~35/0/65 (Story 5.5 baseline ~24/0/49; +11 RP_56_* tests +16 expects).
  - [x] 13.5 Run `bun test src/commands/loop/` — expect baseline ~296/0/989 (UNCHANGED or +1-3 tests if dev adds composition tests; the per-step resolution is mostly transparent through the seam).
  - [x] 13.6 Run `bun test src/commands/next/` — expect baseline + 0-3 tests (similar transparency).
  - [x] 13.7 Run `bun test src/errors.test.ts` — expect 15/0/232 (was 14/0/215; +1 single-line constraint test +17 expects from the iteration over 17 codes).
  - [x] 13.8 Run `bun test src/integration/escalate-actionable-hint.test.ts` — expect 33/0/114 (UNCHANGED — Story 5.6 is COMPLEMENTARY to the integration test).
  - [x] 13.9 Run `bun test` (full) — expect ~1255/0/4380 (Story 5.5 baseline 1237/0/4348 +18 tests +32 expects across 67 files = 66 + NEW src/failure-ux/resolve-policy.test.ts).
  - [x] 13.10 Run `bun run check` (biome ci + tests) — exit 0 (all gates green).
  - [x] 13.11 `grep -c "extends StepperError" src/errors.ts` → 17 (UNCHANGED — Story 5.6 ships ZERO new error classes).
  - [x] 13.12 `grep -F "resolveFailurePolicy" src/failure-ux/index.ts` → expect 1 match (the re-export line).
  - [x] 13.13 `grep -F "resolveFailurePolicy" src/failure-ux/resolve-policy.ts` → expect ≥1 match (the export declaration).
  - [x] 13.14 `grep -c "FailurePolicySchema\|FailurePoliciesSchema" src/schemas/config.ts` → expect ≥2 matches (the new exports).

- [x] **Task 14 — Self-check + Senior Developer Review prep (AC: all)**
  - [x] 14.1 Confirm ALL 13 tasks ticked.
  - [x] 14.2 Confirm AC byte-identical to epics.md lines 1140-1149 (verified via diff at story creation; re-confirm via final diff).
  - [x] 14.3 Confirm sprint-status.yaml + state.yaml updated per Task 15 below.
  - [x] 14.4 Confirm File List section is populated with NEW + MODIFIED files.
  - [x] 14.5 Confirm Change Log entry is appended.
  - [x] 14.6 Confirm Senior Developer Review section is templated for the upcoming code-review iter.

- [x] **Task 15 — Sprint-status + state.yaml updates on completion (AC: all)**
  - [x] 15.1 Update `_bmad-output/implementation-artifacts/sprint-status.yaml` — flip `5-6-per-step-failure-policy-via-config-actionable-errors: backlog → ready-for-dev` at line 100; epic-5 stays `in-progress` at line 94 (UNCHANGED — the dev iteration will progress it; the epic ONLY transitions to done after the last story is done AND optionally after the retrospective). Bump `last_updated:` at BOTH the comment block top (line 2) AND the live YAML field (line 38) to `2026-05-05T05:58:07Z`.
  - [x] 15.2 Update `.bmad-stepper/state.yaml` — workflow advance: `lastStep: bmad-code-review → bmad-create-story`; `lastStepCompletedAt: 2026-05-05T05:58:07Z`; `nextStep: bmad-create-story → bmad-dev-story`; `nextStepStory: '5.6'` (UNCHANGED); `nextStepKey: 5-6-per-step-failure-policy-via-config-actionable-errors` (UNCHANGED); append ONE evidenceIndex entry: step `bmad-create-story`, path this file, evidence summary line, runId `2026-05-05T055807Z-bmad-next`, loopId `2026-05-04T193245Z-bmad-loop`, epic `'5'`, story `'5.6'`.
  - [x] 15.3 Write `.bmad-stepper/runs/2026-05-05T055807Z-bmad-next/run.yaml` + `tasks/t1-create-story.yaml` records (per the run-record convention from Stories 5.4 + 5.5 precedents).

## Dev Notes — Test Surface Inventory

The dev-iter MUST add the following test cases (cross-referenced to AC):

| Test ID            | Description                                                                                                                                                              | AC Coverage |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| CFG_56_1           | `ConfigV1Schema.parse({ ...fixture, failurePolicies: { "dev-story": "retry" } })` returns the parsed object with the policy preserved                                       | AC-1        |
| CFG_56_2           | parametric over [retry, skip, route-to-fixer, escalate] each parses successfully when used as the value in a single-entry failurePolicies record                            | AC-1        |
| CFG_56_3           | `ConfigV1Schema.safeParse({ ...fixture, failurePolicies: { "dev-story": "nonsense-policy" } })` returns success: false                                                      | AC-1        |
| CFG_56_4           | `ConfigV1Schema.safeParse({ ...fixture, failurePolicies: { "dev-story": 42 } })` returns success: false                                                                     | AC-1        |
| CFG_56_5           | omitted `failurePolicies` parses to `{}` per existing default                                                                                                              | AC-1        |
| CFG_56_6           | `failurePolicies: { "bmad-dev-story": "retry", "bmad-code-review": "route-to-fixer" }` parses with both entries preserved                                                  | AC-1        |
| CFG_56_7           | case-sensitive lookup — `failurePolicies: { "BMad-Dev-Story": "retry", "bmad-dev-story": "skip" }` parses (both step IDs are valid distinct keys)                          | AC-1        |
| RP_56_1            | escalate default when no config: `resolveFailurePolicy("any-step", undefined)` returns "escalate"                                                                          | AC-1        |
| RP_56_2            | escalate default when empty config: `resolveFailurePolicy("any-step", {})` returns "escalate"                                                                              | AC-1        |
| RP_56_3            | escalate default when failurePolicies absent: `resolveFailurePolicy("any-step", { failurePolicies: undefined })` returns "escalate"                                         | AC-1        |
| RP_56_4            | escalate default when step not in failurePolicies: `resolveFailurePolicy("nonexistent-step", { failurePolicies: { "other-step": "retry" } })` returns "escalate"            | AC-1        |
| RP_56_5            | returns configured retry: `resolveFailurePolicy("dev-story", { failurePolicies: { "dev-story": "retry" } })` returns "retry"                                                | AC-1        |
| RP_56_6            | returns configured skip: same shape with "skip" → returns "skip"                                                                                                            | AC-1        |
| RP_56_7            | returns configured route-to-fixer: same shape → returns "route-to-fixer"                                                                                                    | AC-1        |
| RP_56_8            | returns configured escalate: same shape → returns "escalate" (explicit, not default)                                                                                        | AC-1        |
| RP_56_9            | case-sensitive lookup: `resolveFailurePolicy("Dev-Story", { failurePolicies: { "dev-story": "retry" } })` returns "escalate" (case mismatch falls through)                  | AC-1        |
| RP_56_10           | multi-step config: `resolveFailurePolicy("bmad-dev-story", { failurePolicies: { "bmad-dev-story": "retry", "bmad-code-review": "route-to-fixer" } })` returns "retry"      | AC-1        |
| RP_56_11           | pure function (idempotent): 100 calls with same input → same output; no shared state                                                                                       | AC-1        |
| ERR_56_SINGLE_LINE | every actionableHint is SINGLE-LINE — no \\n character (FR46) — iterates over all 17 codes from errorRegistry                                                                 | AC-2        |

## Open Questions for Code Review

- **OQ-1 (FailurePoliciesSchema location — NEW src/schemas/config.ts vs reuse types)**: Options: (a) NARROW the existing `failurePolicies` field in src/schemas/config.ts in-place + add standalone exports `FailurePolicySchema` + `FailurePoliciesSchema`; (b) NEW dedicated src/schemas/failure-policies.ts file with the schema; (c) SCHEMAS LIVE in src/failure-ux/ next to the resolver. **DECISION OPTION A — extend src/schemas/config.ts in-place**: the failurePolicies field is ALREADY part of the canonical config schema (Story 1.5); narrowing the value type in-place avoids a parallel-schema split + matches the existing per-field pattern (`paths:`, `telemetry:`, `personas:`, etc.). The standalone `FailurePolicySchema` + `FailurePoliciesSchema` exports enable direct reuse by the resolver tests + the future Story 6.1 file loader. NO schema version bump (still v1; the closed-enum narrowing is BACKWARDS COMPATIBLE for fixtures with empty failurePolicies). Forward-tracker for Story 6.x: split if the config schema grows beyond ~100 lines (currently ~45 lines).

- **OQ-2 (Story 5.6 vs 6.1 split — config schema/resolver here; FILE LOADER in 6.1)**: Options: (a) Story 5.6 ships SCHEMA + RESOLVER + tests ONLY; FILE LOADER (Bun.file().text() + YAML.parse + ConfigV1Schema.parse) is Story 6.1; (b) Story 5.6 ships EVERYTHING including the file loader; (c) HYBRID — schema + resolver here; loader as a forward-tracker stub that returns undefined. **DECISION OPTION A — Story 5.6 ships SCHEMA + RESOLVER ONLY**: matches the project sprint plan (Story 6.1 is "bmad-stepper.config.yaml schema + loader" per epics.md line 1166-1167; Story 5.6 is "per-step failure policy via config + actionable errors" per AC line 1140 — the WIRING between the schema and the consumer); the file-loader work has its own AC + tests that belong to Story 6.1. Story 5.6 closes the per-step policy CONSUMER side; Story 6.1 closes the FILE I/O side. Until Story 6.1 lands, production callers invoke `resolveFailurePolicy(step, undefined)` → escalate-default for every step; tests pass synthetic config objects directly. Cross-story coordination note documented in deps.

- **OQ-3 (`--auto-fix` override duration — single run only per AC line 1144 verbatim)**: Options: (a) SINGLE-PROCESS-INVOCATION — override applies for the duration of the current /bmad-loop or /bmad-next invocation; subsequent invocations without --auto-fix revert to per-step config; (b) PERSISTED to state.yaml — override survives across invocations until explicitly cleared; (c) HYBRID — single-invocation by default; opt-in --auto-fix-persist to survive across invocations. **DECISION OPTION A — SINGLE-PROCESS-INVOCATION** (per AC line 1144 verbatim "for one run"): the override is NEVER persisted to state.yaml or any other on-disk artifact (per AR8 lock-free top-tier + AR13 atomic-write contract — the runner does not mutate state.yaml from the override path). Already wired at run.ts:978-981 (Story 5.3); Story 5.6 confirms the priority order in tests + docs.

- **OQ-4 (per-step ID format — BMAD step IDs)**: Options: (a) BMAD step IDs verbatim (`bmad-create-story`, `bmad-dev-story`, `bmad-code-review`, `bmad-retrospective`); (b) short aliases (`dev-story`, `code-review`); (c) BOTH with alias mapping (`dev-story → bmad-dev-story`). **DECISION OPTION A — BMAD step IDs verbatim**: the user-facing convention matches the slash-command names + the canonical BMAD method documentation. Case-sensitive lookup; the user is responsible for matching the exact step ID. Forward-tracker for Story 6.x: optional alias mapping if user feedback indicates confusion.

- **OQ-5 (conflict resolution priority — --auto-fix > config.failurePolicies > escalate-default)**: Options: (a) `--auto-fix > opts.failurePolicyOverride (test-only) > config > escalate-default`; (b) `--auto-fix > config > opts.failurePolicyOverride > escalate-default`; (c) DROP `opts.failurePolicyOverride` entirely (force tests to construct config objects). **DECISION OPTION A — KEEP `opts.failurePolicyOverride` for tests; DROP from production resolution path**: the seam preserves test-isolation (allows unit-test injection without writing config files); production callers do NOT pass it (they rely on the resolver alone). Documented as test-only seam in the Dev Agent Record. The priority order is preserved per AC line 1144 verbatim ("loop-level `--auto-fix` overrides per-step policy to `route-to-fixer` for one run") — the test seam is INVISIBLE to production users.

- **OQ-6 (errors-registry CI gate update — add single-line constraint check)**: Options: (a) ADD a NEW `it` block in the existing `describe("errorRegistry", ...)` with the single-line assertion; (b) NEW `describe` block `describe("FR46 single-line constraint", ...)` for separation; (c) EXTEND the existing AR22 regex test to also check single-line. **DECISION OPTION A — ADD NEW it block in existing describe**: minimal disruption to the existing CI gate structure; co-locates the gate with the AR22 regex check (both are forward-tracker mechanisms); future Epic 6+ classes inherit the gate AUTOMATICALLY (no per-class assertion needed). The test name contains the Story 5.6 prefix `Story 5.6` for forward-tracker discoverability.

- **OQ-7 (future error classes — must update BOTH registry AND CI gate test)**: forward-tracker mechanism. **DECISION CONFIRMED**: any future error class added by Epic 6+ MUST update BOTH (a) the registry (`src/errors.ts` + `errorRegistry` + `StepperErrorCode` union) AND (b) the CI gate test (`REQUIRED_CODES` array + count assertion). The CI gate IS the discoverability signal — failing to update it surfaces the omission. Story 5.6 ships the gate extension; future stories inherit the discipline.

- **OQ-8 (docs synchronization — failurePolicies: section ONCE in bmad-loop.md (canonical); bmad-next.md cross-links)**: Options: (a) CANONICAL in commands/bmad-loop.md; cross-link from commands/bmad-next.md; (b) DUPLICATED in both files; (c) NEW dedicated docs file (commands/failure-policies.md) that both slash-commands link to. **DECISION OPTION A — CANONICAL in bmad-loop.md; cross-link from bmad-next.md**: single source of truth (mirrors Story 5.3 --auto-fix docs pattern); avoids drift between the two slash-command markdown files; most users encounter the failurePolicies knob via /bmad-loop runs (the canonical placement matches user intent).

- **OQ-9 (telemetry — config.failurePolicies values telemetered for Epic 6 dependency)**: Options: (a) v0.1 ships only the resolver — telemetry is Story 6.6/6.7 work; (b) ADD a per-iteration telemetry field `resolvedFailurePolicy` already captured on NextResult (Story 5.3); (c) AGGREGATE distribution per project (Story 6.6/6.7). **DECISION OPTION A — v0.1 ships only the resolver; aggregation deferred to Story 6.6/6.7**: the per-iteration `resolvedFailurePolicy` field is ALREADY captured on NextResult (Story 5.3); the aggregation across iterations is forward-tracker for Epic 6 telemetry. Cross-story dependency: Story 6.6/6.7 may aggregate distribution per project to inform user about policy effectiveness.

- **OQ-10 (invalid policy values in config → Zod validation error per user-authored config)**: Options: (a) Zod parse REJECTS the config with structured ConfigError; (b) silent fallback to escalate; (c) WARN + fallback to escalate. **DECISION OPTION A — Zod parse REJECTS with ConfigError**: explicit failure mode > silent fallback (user-authored config errors surface immediately, not at the next failure); the existing ConfigError class with hint "See bmad-stepper.config.yaml; run /bmad-next --doctor to validate the file against the schema." is the right user-facing message. The Story 6.1 file loader will surface the parse error; Story 5.6 ships the schema narrowing that enables the rejection. The failure mode: bmad-stepper.config.yaml authored with a typo → /bmad-next or /bmad-loop EXIT IMMEDIATELY with ConfigError → user fixes → loop resumes.

## Forward Action Items From Predecessors

Story 5.6 INHERITS the following forward-trackers from Stories 5.1 + 5.2 + 5.3 + 5.4 + 5.5 + Epic 4 (per Story 5.5 SDR §Forward-trackers and §Recommendations for Epic 5 + epic-4-retrospective.md §Recommendations for Epic 5):

- **From Story 5.5 SDR §Forward-trackers (To Story 5.6 — explicit cross-story note from I-17)**:
  - **I-17 — Per-step `interactiveSteps: string[]` config knob**: NOT APPLICABLE for Story 5.6 — `--interactive` is loop-level (Story 5.5); Story 5.6 lands the per-step `failurePolicies:` block ONLY. The `interactiveSteps` knob is forward-tracker for Story 6.x.
  - **I-1 through I-9 (inherited from Story 5.4 SDR — atomic-write/SIGINT/dispatch-mechanism/etc.)**: NONE actively HONOURED by Story 5.6 (all are Story 5.5/6.x scope).
  - **I-10 through I-16 (NEW — Story 5.5)**: Claude Code chat adaptation / liberalize parsing / --interactive=fixer / enrich prompt / integration test / Node.js stdin / telemetry. NONE actively HONOURED by Story 5.6.

- **From Story 5.5 inherited cosmetic nits N-1/N-2/N-3/N-4**: defensive null check at stop-conditions.ts:269; EMPTY_DAG + EMPTY_STATE sentinels mid-file placement; future task-record snapshot timing; TWO unused LoopOpts seams. Story 5.6 INHERITS all 4 unchanged — does NOT modify any of these surfaces.

- **From Story 5.4 SDR §Forward-trackers I-1 through I-9 (general inheritance)**: NONE actively HONOURED by Story 5.6 directly. The actionable-hint regex contract codification at unit level (AC-2) is the Story 5.6 deliverable; the integration-level test at src/integration/escalate-actionable-hint.test.ts (Story 5.4) is COMPLEMENTARY, not a duplicate.

- **From Story 5.3 SDR §Forward-trackers**:
  - **I-1 (atomic-write contract)**: NOT APPLICABLE.
  - **I-2 (SIGINT cooperation)**: NOT APPLICABLE — Story 5.6 is a synchronous resolver call.
  - **I-3 (Production retry-dispatch mechanism gap)**: EXTENDED — Story 5.6 closes the production resolution path; the actual retry orchestrator is still a Story 6.x forward-tracker.
  - **I-5 (Telemetry consumption)**: EXTENDED — `resolvedFailurePolicy` already on NextResult; aggregation per Story 6.6/6.7.

- **From Story 5.2 SDR §Forward-trackers**: ALL inherited; Story 5.6 does NOT extend SkipRequiresResumeError; the gate extension covers it incidentally.

- **From Story 5.1 SDR §Forward-trackers**:
  - **N-5 (dispatchFailureUx v0.1 stub)**: FULLY RESOLVED by Story 5.4 (already done — Story 5.6 inherits the resolved state).
  - **§I-1 (atomic-write contract)**: NOT APPLICABLE.
  - **§I-3 (SIGINT cooperation)**: NOT APPLICABLE.
  - **§I-4 (Production retry-dispatch gap)**: EXTENDED.
  - **§I-7 (Telemetry via runHistory)**: EXTENDED.

- **From epic-4-retrospective.md §Recommendations for Epic 5**:
  - **Item 1 (failure modes MUST consume formatLoopExitLines)**: NOT APPLICABLE — Story 5.6 is upstream of loop-exit emission.
  - **Item 2 (per-step failurePolicies config — Story 5.6)**: **PRIMARY HONOURED** — this is the canonical Story 5.6 deliverable. The `failurePolicies: { ... }` config block + the resolver + the priority-order wiring at the dispatch sites.
  - **Item 3 (Epic 5 should NOT add new error classes)**: HONOURED — Story 5.6 ships ZERO new error classes (registry stays at 17).
  - **Item 4 (each Story 5.x flow MUST be tested with SIGINT-mid-flight)**: NOT APPLICABLE — Story 5.6 is a synchronous resolver, not a long-running flow.
  - **Item 7 (runHistory[] attempt-number metadata)**: NOT APPLICABLE.

- **From Story 4.10 SDR §I-2 forward-tracker (Story 5.x failure-UX modes interaction with SIGINT)**: NOT APPLICABLE — Story 5.6 is a pure resolver.

- **From Story 4.9 SDR §I-2 forward-tracker (SIGINT during failure-UX flows)**: NOT APPLICABLE — Story 5.6 is upstream of the failure-UX flow.

- **From Story 4.8 SDR §I-1 forward-tracker (atomic-write contract)**: NOT APPLICABLE.

- **Inherited cosmetic nits N-1/N-2/N-3/N-4** (from Stories 4.2-4.10 + Stories 5.1 + 5.2 + 5.3 + 5.4 + 5.5): defensive null check at stop-conditions.ts:269; EMPTY_DAG + EMPTY_STATE sentinels mid-file placement; future task-record snapshot timing; TWO unused LoopOpts seams declared but never consumed. Story 5.6 INHERITS ALL FOUR unchanged.

Story 5.6 PRODUCES the following forward-trackers for downstream stories:

- **To Story 6.1 (config FILE LOADER)**: cross-story-coordination note. The Story 6.1 file loader will:
  1. Read `bmad-stepper.config.yaml` from disk via `Bun.file().text()`.
  2. Parse the YAML body via the YAML parser.
  3. Validate via `ConfigV1Schema.parse()` (REJECTS invalid policy values per OQ-10 → ConfigError).
  4. Pass the parsed config object to ALL dispatch sites (loop runner + next runner + verify-and-advance.ts) via the existing `opts.config` seams that Story 5.6 already declared.
  5. NO resolver-API change needed (Story 5.6 already accepts the optional config parameter).

- **To Story 6.x (Per-step interactiveSteps config knob from Story 5.5 I-17)**: `--interactive` is loop-level (Story 5.5); Story 6.x may add per-step opt-in `interactiveSteps: string[]` analog to failurePolicies.

- **To Story 6.x (Alias mapping for step IDs per OQ-4)**: v0.1 BMAD step IDs verbatim (case-sensitive); Story 6.x may add optional alias mapping (`dev-story → bmad-dev-story`).

- **To Story 6.x (--continue-on-error vs per-step policy interaction)**: open question — should `--continue-on-error` (Story 4.6) override the per-step policy or be subsumed by it? Story 5.6 does NOT decide; current behaviour is `--continue-on-error` is orthogonal (it controls whether the loop CONTINUES after a halt; the per-step policy controls WHAT happens at the failure). Forward-tracker.

- **To Story 6.6/6.7 (Telemetry aggregation per OQ-9)**: aggregate `resolvedFailurePolicy` distribution per project across loop runs to inform user about policy effectiveness (e.g., "73% of bmad-dev-story failures use retry").

- **To Story 6.x (LoopOpts/RunNextOptions/RunVerifyAndAdvanceOptions seam consolidation)**: Story 5.6 ADDS `opts.config` to all THREE option interfaces (LoopOpts at run.ts; RunNextOptions at next/run.ts; RunVerifyAndAdvanceOptions at verify-and-advance.ts). Story 6.x may consolidate the duplicated seam declarations into a shared base interface.

- **To future Epics (N-NEW — single-line constraint applies to ALL future error classes)**: per OQ-7 + OQ-6 — any future error class added MUST satisfy the extended CI gate (single-line actionableHint per FR46). The gate is the FORWARD-TRACKER mechanism — failing to update REQUIRED_CODES + the count assertion is the discoverability signal.

## Architectural Constraints

- **AR8 (lock-free top-tier)**: `runLoop` (top-tier per AR41) does NOT acquire the lock; the resolver call is pure (no I/O); ZERO new lock acquisitions; ZERO state.yaml writes by the runner. The resolver path is RIDE-FREE on the existing failure-UX dispatch infrastructure.

- **AR9 (single AR9 stdout line per command invocation)**: UNCHANGED. The resolver is invoked at the dispatch site; the AR9 emission discipline is preserved by the existing dispatcher (no new AR9 emission introduced).

- **AR21+22 (errors registry held at 17)**: Story 5.6 ADDS ZERO new error classes per AR21 + epic-4-retro Recommendations item 3. Registry stays at 17. The CI gate EXTENSION (single-line constraint per FR46) is a forward-tracker for FUTURE classes, NOT a registry expansion. The actionable-hint regex `/^.*(Run|See|Try|Check) /` continues to be enforced; the new single-line constraint is COMPLEMENTARY.

- **AR33 (no console.* in source)**: the resolver uses NO I/O — pure function; ZERO console.* added.

- **AR34 (slash-command markdown protocol)**: extended via `commands/bmad-loop.md` — NEW `### failurePolicies: config block (Story 5.6 — per-step policy)` sub-section + `commands/bmad-next.md` SHORT cross-link sub-section (mirrors Story 5.3 --auto-fix docs pattern).

- **AR41 (boundary graph)**: `src/failure-ux/resolve-policy.ts` is mid-tier per AR41 (joins src/failure-ux/{retry,skip,route-to-fixer,escalate}.ts as the 5th file in the failure-ux module group). Depends only on (a) src/schemas/config.ts (foundational tier — `FailurePolicies` type) and (b) src/failure-ux/index.ts (mid-tier same-group — `FailurePolicy` type). ZERO upward imports from src/commands/. ZERO new cross-tier imports.

- **AR42 (test discipline)**: NEW unit tests `RP_56_*` (in src/failure-ux/resolve-policy.test.ts) + `CFG_56_*` (in src/schemas/config.test.ts) + `ERR_56_SINGLE_LINE` (extending src/errors.test.ts). All tests use direct invocation of the resolver / Zod parse / errorRegistry iteration — NO mock.module discipline; matches the foundational/mid-tier purity.

- **AR20 (type-alias chain)**: NEW `FailurePolicy` + `FailurePolicies` exports from src/schemas/config.ts join the canonical type-alias chain. The existing `FailurePolicy` re-export from src/failure-ux/index.ts:32 may be REPLACED by a re-export from src/schemas/config.ts OR KEPT as a backwards-compatibility shim — DECIDE in dev (recommended: keep both for backwards compatibility; both unions are byte-identical so TypeScript treats them as the same type).

- **AR25+26 (finally discipline)**: NOT APPLICABLE — the resolver is a pure synchronous function; no try/finally needed.

- **AR13 (Layer 2 atomic-write contract)**: NOT APPLICABLE — Story 5.6 does NOT write state.yaml or any other on-disk artifact; the runner-tier resolver call is RIDE-FREE on the existing atomic-write infrastructure.

## Notes for Developer

- **The resolver is a SIMPLE pure function** — `(step, config) => config?.failurePolicies?.[step] ?? "escalate"`. ~10 lines of source code. ~150 lines of tests. The simplicity is INTENTIONAL — the per-step policy resolution is the FOUNDATION on which Story 6.1's file loader builds; keeping the resolver simple makes the loader's responsibility crystal clear.

- **The failure-UX module group GROWS from 4 → 5 source files** — joins src/failure-ux/{retry,skip,route-to-fixer,escalate}.ts with the 5th file src/failure-ux/resolve-policy.ts. The 4 handler files implement the FailurePolicy actions; the resolver file SELECTS which handler to dispatch. The split mirrors the established per-handler file pattern.

- **The `failurePolicyOverride` test seam at LoopOpts/RunNextOptions/RunVerifyAndAdvanceOptions is KEPT for tests but DROPPED from production** per OQ-5 — production callers do NOT pass it; they rely on the resolver alone. Document in the seam's JSDoc as "TEST-ONLY SEAM (per Story 5.6 OQ-5) — production resolution flows through `resolveFailurePolicy(step, opts?.config)`."

- **The `opts.config` seam is NEW for Story 5.6** — Story 6.1 will populate it via the file loader. Until 6.1, production callers pass undefined → resolver returns escalate-default. Tests pass synthetic config objects directly via the seam.

- **The 17-code error registry stays at 17** — Story 5.6 ships ZERO new error classes per AR21 + epic-4-retro Recommendations item 3. The CI gate EXTENSION (single-line constraint per FR46) is a forward-tracker for FUTURE classes, NOT a registry expansion.

- **The single-line constraint on actionableHint is FR46 + AR22 unified** — every existing actionableHint already passes the constraint (verified empirically via `grep -P '\\\\n|\\\\r' src/errors.ts | grep actionableHint` exit 1). The CI gate enforces the constraint at the unit level; future classes inherit the gate AUTOMATICALLY.

- **The em-dash `—` is NOT used in any actionableHint** — the em-dash is reserved for StopReason variant messages (Story 4.6 error-stop, Story 4.9 manual-sigint, Story 4.10 unified format, Story 5.5 manual-interactive-halt). The actionableHint contract uses ASCII characters only.

- **The Zod schema narrowing is BACKWARDS COMPATIBLE** — existing fixtures with `failurePolicies: {}` still parse (the empty record passes the closed-enum value-type validation trivially). New fixtures with `failurePolicies: { "step": "retry" }` parse with the policy preserved.

- **The future Story 6.1 file loader will TRIVIALLY consume the resolver** — the loader reads/parses the YAML, calls `ConfigV1Schema.parse(yamlBody)`, and passes the result to ALL dispatch sites via the existing `opts.config` seams that Story 5.6 declared. ZERO resolver-API changes needed for Story 6.1.

- **`--continue-on-error` (Story 4.6) and per-step `failurePolicies` (Story 5.6) are CURRENTLY ORTHOGONAL** — `--continue-on-error` controls whether the LOOP continues after a halt; the per-step policy controls WHAT happens at the failure. Forward-tracker for Story 6.x: should one subsume the other?

- **Telemetry consumption is OUT-OF-SCOPE** — the per-iteration `resolvedFailurePolicy` field is ALREADY captured on NextResult (Story 5.3); aggregation across iterations is Story 6.6/6.7 forward-tracker.

- **The user-facing failure mode for invalid config values** is: bmad-stepper.config.yaml authored with `failurePolicies: { dev-story: nonsense-policy }` → /bmad-next or /bmad-loop EXIT IMMEDIATELY with ConfigError + actionable hint "See bmad-stepper.config.yaml; run /bmad-next --doctor to validate the file against the schema." → user fixes the typo → loop resumes. The Story 6.1 file loader will surface the parse error.

- **Story 6.1 is the NEXT story** (the FIRST story of Epic 6). The cross-story coordination note in deps documents the schema/resolver-vs-loader split. Story 5.6 closes Epic 5; Story 6.1 opens Epic 6.

- **THIS IS THE LAST STORY OF EPIC 5** — after Story 5.6 dev + code-review iterations complete, the Epic 5 retrospective (`epic-5-retrospective`) is OPTIONAL but typically included by default per loop policy (per the Epic 4 precedent). The retrospective consolidates Epic 5 lessons (failure-UX module group + 4 handlers + dispatcher + resolver + actionable-error contract codification + 1 NEW error class SkipRequiresResumeError + 1 NEW StopReason variant manual-interactive-halt + 2 NEW CLI flags --auto-fix and --interactive).

## Dev Agent Record

### Context Reference

- Story spec: `_bmad-output/implementation-artifacts/5-6-per-step-failure-policy-via-config-actionable-errors.md` (this file; ~700-1000 lines target band; full spec consumed)
- Architecture: `_bmad-output/planning-artifacts/architecture.md` line 494-499 (FailurePolicy union + escalate-as-default + --auto-fix override semantics), line 773-790 (config block schema canonical reference for Story 1.5 + Story 5.6 + Story 6.1)
- PRD: `_bmad-output/planning-artifacts/prd.md` line 712-714 (FR31 — Per-step failure policy via config), line 715-718 (FR32 — Actionable-error contract), line 740-742 (FR46 — Main-thread output is exactly one line)
- Predecessor Story 5.5: `_bmad-output/implementation-artifacts/5-5-interactive-pause-between-steps.md` (812 lines; SDR forward-trackers I-1 through I-17; the canonical spec template structure)
- Predecessor Story 5.4: `_bmad-output/implementation-artifacts/5-4-escalate-failure-mode.md` (846 lines; escalate handler + integration-level actionable-hint contract verification at src/integration/escalate-actionable-hint.test.ts; Story 5.6 codifies the SAME contract at the UNIT level)
- Predecessor Story 5.3: `_bmad-output/implementation-artifacts/5-3-route-to-fixer-mode-auto-fix-flag.md` (--auto-fix flag wiring + effectiveFailurePolicyOverride composition at run.ts:978-981; the priority-order anchor for Story 5.6)
- Predecessor Story 5.2: `_bmad-output/implementation-artifacts/5-2-skip-failure-mode-skip-flag.md` (SkipRequiresResumeError addition to registry 16 → 17; the only NEW error class in Epic 5; the gate extension covers it incidentally)
- Predecessor Story 5.1: `_bmad-output/implementation-artifacts/5-1-retry-failure-mode.md` (failurePolicyOverride seam pattern at LoopOpts:441 + NextOptions:296; KEPT for tests + DROPPED from production resolution path per Story 5.6 OQ-5)
- Story 1.2 errors-registry CI gate: `src/errors.test.ts` (the foundational gate; Story 5.6 EXTENDS with single-line constraint per FR46)
- Story 1.5 ConfigV1Schema: `src/schemas/config.ts` (the foundational schema; Story 5.6 NARROWS failurePolicies value type from z.unknown to closed enum)
- Epic-4 retrospective: `_bmad-output/implementation-artifacts/epic-4-retrospective.md` §Recommendations item 2 (PRIMARY HONOURED) + item 3 (HONOURED — registry stays at 17)
- Failure-UX module: `src/failure-ux/{index,retry,skip,route-to-fixer,escalate}.ts` + colocated `*.test.ts` (Story 5.6 ADDS the 5th file `resolve-policy.ts` + colocated `resolve-policy.test.ts`)
- Errors registry: `src/errors.ts` (17 codes; UNCHANGED — Story 5.6 ships ZERO new classes)
- Slash-command markdown: `commands/bmad-loop.md` (canonical failurePolicies docs section) + `commands/bmad-next.md` (cross-link sub-section)

### Agent Model Used

Claude Opus 4.7 (1M context) — model ID `claude-opus-4-7[1m]`. Run as iter 16 RETRY of `/bmad-loop --until=epic:5` (loopId `2026-05-04T193245Z-bmad-loop`); runId `2026-05-05T055807Z-bmad-next` (a previous attempt at runId `2026-05-05T030205Z-bmad-next` timed out without writing any outputs and was abandoned); transaction step `bmad-create-story` for Story 5.6 (LAST STORY of Epic 5).

### Debug Log References

- `bunx tsc --noEmit` — exit 0 (after one fix: `action.lastAttempted` possibly-undefined narrowing → replaced with in-scope `nextStep.name`).
- `bun run check` — biome ci 0 + 1262/0/4420 across 67 files (was 1237/0/4348 baseline; +25 tests +72 expects + NEW resolve-policy.test.ts file).
- `bun test src/errors.test.ts` — 15/0/249 (was 14/0/215; +1 single-line constraint test +34 expects from 17 codes × 2 assertions).
- `bun test src/failure-ux/` — 71/0/153 across 6 files (was 58/0/137 across 5 files; NEW resolve-policy.test.ts +13 tests +16 expects).
- `bun test src/schemas/` — 126/0/240 across 9 files (was 113/0/189 area; +13 CFG_56_* tests +51 expects).
- `bun test src/integration/escalate-actionable-hint.test.ts` — 33/0/114 (UNCHANGED — Story 5.6 unit-level CI gate is COMPLEMENTARY).
- `grep -c "extends StepperError" src/errors.ts` — 17 (UNCHANGED — Story 5.6 ships ZERO new error classes per AR21 + epic-4-retro Recommendations item 3).

### Completion Notes List

- **AC-1 (per-step policy resolution + --auto-fix override)**: `resolveFailurePolicy(step, config)` at `src/failure-ux/resolve-policy.ts:48-52` returns `config?.failurePolicies?.[step] ?? "escalate"`. Wired into the production composition at THREE dispatch sites: `src/commands/loop/run.ts:978-1010` (loop runner threads `opts.config` to `RunNextOptions.config`), `src/commands/next/run.ts:2032-2040` (NextResult.resolvedFailurePolicy composition consumes resolver via `nextStep.name`), `src/commands/next/verify-and-advance.ts:1011-1023` (per-step policy at the actual dispatch site via `dispatchSpec.step`). Priority order per OQ-5: --auto-fix > opts.failurePolicyOverride [TEST-ONLY SEAM] > resolveFailurePolicy(step, opts.config) > escalate-default. Verified by RP_56_4 (absent step → escalate) + RP_56_5/6/7/8 (each of 4 policy values returned when configured) + CFG_56_1 through CFG_56_7 (schema parses/rejects per OQ-10).
- **AC-2 (actionable-error contract single-line + verb regex)**: NEW single-line constraint test at `src/errors.test.ts:71-79` iterates over all 17 instances asserting `expect(instance.actionableHint).not.toMatch(/\n/)` + `not.toMatch(/\r/)`. Existing AR22 regex test (`/^.*(Run|See|Try|Check) /`) at lines 65-69 covers the verb-ending requirement. Both tests use the same `instances` array; future Epic 6+ classes inherit the gate AUTOMATICALLY.
- **OQ-1 (FailurePoliciesSchema location)**: ADOPTED — schema lives in src/schemas/config.ts in-place + standalone exports `FailurePolicySchema` + `FailurePoliciesSchema` + types `FailurePolicy` + `FailurePolicies`.
- **OQ-2 (story split)**: ADOPTED — Story 5.6 ships SCHEMA + RESOLVER ONLY; FILE LOADER deferred to Story 6.1.
- **OQ-5 (priority order with test-only seam)**: ADOPTED — failurePolicyOverride seam KEPT for tests but DROPPED from production resolution path; production callers pass nothing; rely on resolver alone.
- **OQ-6 (single-line CI gate placement)**: ADOPTED — NEW it block in existing describe(errorRegistry) co-located with AR22 regex check.
- **OQ-8 (docs canonical placement)**: ADOPTED — canonical failurePolicies: docs section in commands/bmad-loop.md + SHORT cross-link sub-section in commands/bmad-next.md.
- **OQ-10 (invalid policy → ConfigError)**: VERIFIED at schema layer — CFG_56_3 + CFG_56_4 confirm Zod parse rejects invalid string + non-string policy values. The Story 6.1 file loader will surface the parse error via the existing ConfigError class.
- **Errors registry held at 17** (UNCHANGED) per AR21 + epic-4-retro Recommendations item 3 — Story 5.6 ships ZERO new error classes; CI-gate extension is a forward-tracker for FUTURE classes.
- **Failure-UX module group GROWS from 4 → 5 source files** — resolve-policy.ts joins retry/skip/route-to-fixer/escalate.

### File List

**NEW files (2):**

- `src/failure-ux/resolve-policy.ts` (~50 LoC pure resolver function)
- `src/failure-ux/resolve-policy.test.ts` (~135 LoC; 13 tests RP_56_1 through RP_56_11 + RP_56_TYPE_NARROWING + RP_56_BACKWARDS_COMPAT)

**MODIFIED files (10):**

- `src/schemas/config.ts` — narrow failurePolicies value type from z.unknown to FailurePoliciesSchema closed enum + standalone exports FailurePolicySchema + FailurePoliciesSchema + types FailurePolicy + FailurePolicies.
- `src/schemas/config.test.ts` — add CFG_56_1 through CFG_56_7 + CFG_56_REGISTRY_1 through CFG_56_REGISTRY_4 (11 NEW tests +51 expects).
- `src/failure-ux/index.ts` — replace inline resolveFailurePolicy stub with re-export from ./resolve-policy.ts; update JSDoc.
- `src/commands/loop/run.ts` — add `opts.config` seam to LoopOpts; thread opts.config to RunNextOptions.config in productionRunNextFn closure; updated effectiveFailurePolicyOverride JSDoc to document Story 5.6 priority order.
- `src/commands/next/run.ts` — add `opts.config` seam to RunNextOptions; extend resolvedFailurePolicy composition at lines 2032-2040 with `resolveFailurePolicy(nextStep.name, opts.config)`; import resolveFailurePolicy at top-level.
- `src/commands/next/run.test.ts` — REPAIR R2: RTF_53_RUN_7 expectation update from `toBeUndefined()` to `toBe("escalate")` reflecting Story 5.6 wired the resolver default into the production composition.
- `src/commands/next/verify-and-advance.ts` — add `opts.config` seam to RunVerifyAndAdvanceOptions; extend policy composition at lines 1011-1023 to pass opts.config.
- `src/errors.test.ts` — extend CI gate with NEW single-line constraint test iterating over all 17 codes; updated file JSDoc.
- `commands/bmad-loop.md` — add ~80-line canonical `### failurePolicies: config block (Story 5.6 — per-step policy)` sub-section after --auto-fix Story 5.3 section.
- `commands/bmad-next.md` — add SHORT cross-link sub-section after --auto-fix Story 5.3 section pointing to canonical bmad-loop.md section per OQ-8.

**STORY tracking files (3):**

- `_bmad-output/implementation-artifacts/5-6-per-step-failure-policy-via-config-actionable-errors.md` (THIS FILE) — frontmatter status `ready-for-dev → review`; all task checkboxes ticked; Dev Agent Record populated; Change Log entry appended.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — 5-6 row `ready-for-dev → review`; epic-5 stays in-progress; last_updated bumped to 2026-05-05T06:17:28Z at lines 2 + 38.
- `.bmad-stepper/state.yaml` — workflow advance: `lastStep: bmad-create-story → bmad-dev-story`; `lastStepCompletedAt → 2026-05-05T06:17:28Z`; `nextStep: bmad-dev-story → bmad-code-review`; appended bmad-dev-story evidenceIndex entry.

**RUN/TASK records (1 NEW for dev-story phase):**

- `.bmad-stepper/runs/2026-05-05T061728Z-bmad-next/run.yaml`
- `.bmad-stepper/runs/2026-05-05T061728Z-bmad-next/tasks/t1-dev-story.yaml`

### Deviations

None. The implementation followed the spec verbatim. One MINOR shape adjustment from spec line 167-168 (resolver signature uses `FailurePolicies` type imported from `src/schemas/config.ts` rather than the inline `Record<string, FailurePolicy>` shape from the Story 5.1 stub) — this is the spec's own preferred shape per Task 4.1 code template at lines 346-358, NOT a deviation.

### Repairs

- **R1 — biome multiline format on FailurePoliciesSchema**: initial `src/schemas/config.ts` declaration spread `z.record(z.string(), FailurePolicySchema)` across 4 lines per readability; biome ci formatter required collapsed single-line form `export const FailurePoliciesSchema = z.record(z.string(), FailurePolicySchema);`. Collapsed; no semantic change. ACCEPTED.
- **R2 — RTF_53_RUN_7 test expectation update**: pre-Story-5.6 the test at `src/commands/next/run.test.ts:4142-4154` asserted `result.resolvedFailurePolicy` to be `undefined` when `--auto-fix` is omitted + no `failurePolicyOverride` test seam supplied. Story 5.6's wired resolver path now defaults to the resolver fallback `"escalate"` (the plugin default per architecture line 499). Updated the expectation from `toBeUndefined()` to `toBe("escalate")` and updated the test name + comment to reflect Story 5.6 wiring. The test comment ALREADY anticipated this in its name "production default, falls through to per-step config in Story 5.6" — the update is a forward-compat rename, NOT a behavior regression. ACCEPTED.

## Senior Developer Review (AI)

**Reviewer**: AI Senior Dev (sub-agent dispatched by /bmad-loop iter 18, runId `2026-05-05T064726Z-bmad-next`, loopId `2026-05-04T193245Z-bmad-loop`)
**Date**: 2026-05-05
**Verdict**: **approve**

### Summary

Story 5.6 lands the SIXTH AND LAST STORY of Epic 5 — the per-step `failurePolicies:` config block + actionable-error contract codification. Implementation adds the **5th public surface** in the failure-ux module group (`resolveFailurePolicy(step, config)` at NEW `src/failure-ux/resolve-policy.ts:44-53`), narrows `ConfigV1Schema.failurePolicies` from `z.record(z.string(), z.unknown())` to a closed enum union via NEW exports `FailurePolicySchema` + `FailurePoliciesSchema` (src/schemas/config.ts:46-67), wires the resolver at THREE dispatch sites (loop runner + next runner + verify-and-advance.ts) via the NEW `opts.config` seam, and EXTENDS the Story 1.2 errors-registry CI gate with a single-line constraint per FR46 (src/errors.test.ts:83-94 — iterates over all 17 instances asserting `not.toMatch(/\n/)` + `not.toMatch(/\r/)`). The failure-UX module group GROWS from 4 → 5 source files (resolve-policy.ts joins retry/skip/route-to-fixer/escalate). The 17-code error registry stays at 17 per AR21 + epic-4-retro Recommendations item 3. ZERO new error classes; ZERO new CLI flags; ZERO state.yaml schema changes. 8/8 quality gates INDEPENDENTLY GREEN. 10 OQs adjudicated transparently. 0 deviations + 2 ACCEPTED repairs (R1 biome multiline format collapse; R2 RTF_53_RUN_7 forward-compat expectation update). STORY 5.6 COMPLETE — EPIC 5 STORIES COMPLETE.

### Acceptance Criteria Verification

- **AC-1** (failurePolicies config block applied; absent steps fall back to escalate; --auto-fix overrides per-step policy to route-to-fixer for one run): **PASS**. Verified at:
  - `src/failure-ux/resolve-policy.ts:44-53` (pure resolver — `return fromConfig` for configured step at line 50 + `return "escalate"` fallback at line 52 for absent step / undefined config / undefined failurePolicies)
  - `src/commands/next/verify-and-advance.ts:1031-1035` (per-step policy at the actual dispatch site — priority order: --auto-fix > opts.failurePolicyOverride [TEST-ONLY SEAM] > resolveFailurePolicy(dispatchSpec.step, opts.config) > escalate-default)
  - `src/commands/next/run.ts:2032-2038` (NextResult.resolvedFailurePolicy composition consumes resolver via `nextStep.name`)
  - `src/commands/loop/run.ts:1007-1010` (loop runner threads `opts.config` to RunNextOptions.config so verify-and-advance.ts resolver consults `config.failurePolicies[step]`; --auto-fix branch at line 1010 still short-circuits to "route-to-fixer" per AC line 1144 verbatim)
  - Tests: RP_56_4 (absent step → escalate) + RP_56_5/6/7/8 (each of the 4 policy values returned correctly when configured) + RP_56_1/2/3 (escalate default for undefined / empty / failurePolicies-undefined config) + RP_56_9 (case-sensitive lookup per OQ-4) + RP_56_10 (multi-step config) + RP_56_11 (pure-function idempotence) + CFG_56_1 through CFG_56_7 (Zod schema parses valid + rejects invalid per OQ-10)

- **AC-2** (every actionableHint is single-line ending with concrete next-action verb; full detail in run log): **PASS**. Verified at:
  - `src/errors.test.ts:83-94` (NEW single-line constraint test iterates over all 17 instances asserting `expect(instance.actionableHint).not.toMatch(/\n/)` at line 90 + `expect(instance.actionableHint).not.toMatch(/\r/)` at line 92 for defence-in-depth Windows-line-ending check)
  - `src/errors.test.ts:77-81` (existing AR22 regex `/^.*(Run|See|Try|Check) /` test covers verb-ending requirement)
  - Both tests use the same `instances` array (line 60) iterating over all 17 constructors from `errorRegistry`. Future Epic 6+ classes inherit the gate AUTOMATICALLY — failing this is the discoverability signal.
  - Independent registry coverage verification: `errorRegistry` enumerated via `Object.values()` and confirmed 17 distinct constructor classes (LockContentionError, BranchSwitchError, BmadIncompatibleError, BmadNotInstalledError, UnknownBmadSkillError, DagCycleError, CorruptStateError, StateTooNewError, StateChangedDuringDispatchError, VerifierFailureError, PathologicalInputError, ScopeViolationError, BudgetExceededError, TimeoutError, ConfigError, MigrationFailureError, SkipRequiresResumeError) each instantiated with non-empty actionableHint. The new test iterates ALL 17, not a subset.

### Architectural Constraints

- **AR8** (lock-free top-tier): **UPHELD**. The resolver is a pure function (no I/O, no state mutation); ZERO new lock acquisitions; ZERO state.yaml writes by the runner.
- **AR9** (single AR9 stdout line per command invocation): **UPHELD UNCHANGED**. The resolver is invoked at the dispatch site; no new AR9 emission introduced.
- **AR21+22** (errors registry held at 17): **UPHELD — registry held at 17**. Independently verified: `grep -c "extends StepperError" src/errors.ts` = 17; `bun test src/errors.test.ts` 15/0/249 (was 14/0/215 — +1 single-line constraint test +34 expects from 17 codes × 2 assertions). ZERO new error classes per AR21 + epic-4-retro Recommendations item 3.
- **AR33** (no console.* in source): **UPHELD**. Resolver uses NO I/O.
- **AR34** (slash-command markdown protocol): **EXTENDED**. `commands/bmad-loop.md` gains `### failurePolicies: config block (Story 5.6 — per-step policy)` canonical sub-section + `commands/bmad-next.md` SHORT cross-link sub-section per OQ-8.
- **AR41** (boundary graph): **UPHELD**. NEW `src/failure-ux/resolve-policy.ts` is mid-tier per AR41 (joins src/failure-ux/{retry,skip,route-to-fixer,escalate}.ts as the 5th file in the failure-ux module group). Depends only on (a) src/schemas/config.ts (foundational tier — `FailurePolicies` type) at line 41 and (b) src/failure-ux/index.ts (mid-tier same-group — `FailurePolicy` type) at line 42. ZERO upward imports from src/commands/.
- **AR42** (test discipline): **UPHELD**. NEW unit tests `RP_56_*` (13 tests in src/failure-ux/resolve-policy.test.ts) + `CFG_56_*` (in src/schemas/config.test.ts) + single-line constraint test extending src/errors.test.ts. All tests use direct invocation of the resolver / Zod parse / errorRegistry iteration — NO mock.module discipline.
- **AR20** (type-alias chain): **UPHELD**. NEW `FailurePolicy` + `FailurePolicies` exports from src/schemas/config.ts join the canonical type-alias chain; the existing `FailurePolicy` re-export from src/failure-ux/index.ts:32 is KEPT as backwards-compatibility shim (both unions are byte-identical so TypeScript treats them as the same type).
- **AR25+26** (finally discipline): **NOT APPLICABLE** — pure synchronous resolver.
- **AR13** (Layer 2 atomic-write contract): **NOT APPLICABLE** — Story 5.6 does NOT write state.yaml.

### Quality Gates (Independently Re-Verified — ONCE per CRITICAL scoping)

| Gate | Expected | Actual | Status |
|------|---------:|-------:|:------:|
| `bunx tsc --noEmit` | exit 0 | exit 0 (no output) | OK |
| `bun run check` (biome ci + tests) | 0 errors + 1262/0/4420 across 67 files | 0 errors + 1262/0/4420 across 67 files | OK |
| `bun test src/errors.test.ts` | 15/0/249 (was 14/0/215 — +1 test +34 expects) | 15/0/249 | OK |
| `bun test src/failure-ux/` | 71/0/153 across 6 files | 71/0/153 across 6 files | OK |
| `bun test src/schemas/` | 126/0/240 across 9 files (+13 CFG_56_*) | 126/0/240 across 9 files | OK |
| `bun test src/integration/escalate-actionable-hint.test.ts` | 33/0/114 (UNCHANGED — complementary) | 33/0/114 | OK |
| `grep -c "extends StepperError" src/errors.ts` | 17 | 17 | OK |
| Independent registry coverage verification (errorRegistry has 17 ctors; new test iterates all 17 via shared `instances` array, not a subset) | confirmed | confirmed via `Object.values(errorRegistry)` length 17 + new test at lines 83-94 uses the canonical `instances` array (line 60) shared with the existing AR22 regex check at lines 77-81 | OK |

ALL 8 quality gates GREEN on independent verification. Counts match dev claims verbatim.

### Open Questions (10 OQs adjudicated)

- **OQ-1** (FailurePoliciesSchema location — extend src/schemas/config.ts in-place + standalone exports): **ACCEPT OPTION A**. Sound — narrowing the value type in-place avoids parallel-schema split + matches the existing per-field pattern; standalone exports enable direct reuse by resolver tests + Story 6.1 file loader. NO schema version bump.
- **OQ-2** (Story 5.6 vs 6.1 split — schema + resolver here; FILE LOADER deferred to 6.1): **ACCEPT OPTION A**. Sound — matches the project sprint plan; Story 5.6 closes the per-step policy CONSUMER side; Story 6.1 closes the FILE I/O side. Until Story 6.1 lands, production callers invoke `resolveFailurePolicy(step, undefined)` → escalate-default for every step.
- **OQ-3** (`--auto-fix` override duration — single-process-invocation per AC line 1144 verbatim): **ACCEPT OPTION A**. Sound — already wired at run.ts (Story 5.3); Story 5.6 confirms the priority order in tests + docs.
- **OQ-4** (per-step ID format — BMAD step IDs verbatim case-sensitive): **ACCEPT OPTION A**. Sound — matches slash-command names + canonical BMAD method docs. Verified at RP_56_9 (case-mismatch falls through to escalate). Forward-tracker for Story 6.x: optional alias mapping.
- **OQ-5** (conflict resolution priority — --auto-fix > opts.failurePolicyOverride [test-only seam] > config > escalate-default): **ACCEPT OPTION A**. Sound — failurePolicyOverride seam KEPT for tests but DROPPED from production resolution path; production callers do NOT pass it; rely on resolver alone. Documented in JSDoc at run.ts + next/run.ts + verify-and-advance.ts.
- **OQ-6** (errors-registry CI gate update — ADD NEW it block in existing describe): **ACCEPT OPTION A**. Sound — minimal disruption; co-located with AR22 regex check; future Epic 6+ classes inherit gate AUTOMATICALLY.
- **OQ-7** (future error classes — must update BOTH registry AND CI gate test): **DECISION CONFIRMED forward-tracker**. CI gate IS the discoverability signal — failing to update REQUIRED_CODES + count assertion surfaces the omission.
- **OQ-8** (docs synchronization — canonical in bmad-loop.md; cross-link from bmad-next.md): **ACCEPT OPTION A**. Sound — single source of truth; mirrors Story 5.3 --auto-fix docs pattern.
- **OQ-9** (telemetry — v0.1 ships only resolver; aggregation deferred to Story 6.6/6.7): **ACCEPT OPTION A**. Sound — `resolvedFailurePolicy` already on NextResult (Story 5.3); aggregation forward-tracker for Epic 6 telemetry.
- **OQ-10** (invalid policy values in config → Zod parse REJECTS with ConfigError): **ACCEPT OPTION A**. Sound — explicit failure mode > silent fallback. Verified at CFG_56_3 + CFG_56_4 (Zod parse rejects invalid string + non-string policy values).

### Repairs adjudicated

- **R1** (biome multiline z.record format on src/schemas/config.ts FailurePoliciesSchema export): initial `z.record(z.string(), FailurePolicySchema)` declaration spread across 4 lines per readability; biome ci formatter required collapsed single-line form `export const FailurePoliciesSchema = z.record(z.string(), FailurePolicySchema);`. Collapsed; no semantic change. **ACCEPT** — formatting-only auto-fix is a documented Story 5.x pattern (mirrors Stories 5.1/5.2/5.3/5.4/5.5 R-repair precedent).
- **R2** (RTF_53_RUN_7 test expectation update): pre-Story-5.6 the test at `src/commands/next/run.test.ts` asserted `result.resolvedFailurePolicy === undefined` when `--auto-fix` is omitted + no `failurePolicyOverride` test seam supplied (Story 5.3 baseline). Story 5.6's wired resolver path now defaults to the resolver fallback `"escalate"` (the plugin default per architecture line 499). Updated the expectation from `toBeUndefined()` to `toBe("escalate")`. The test comment ALREADY anticipated this in its name "production default, falls through to per-step config in Story 5.6" — this is the EXPECTED forward-compat update, NOT a behavior regression. **ACCEPT** — sound rationale; the resolved-policy field gaining a defined default is the entire point of Story 5.6 wiring.

### Deviations adjudicated

(none — Dev Agent Record reports 0 deviations. The minor shape adjustment (resolver signature uses imported `FailurePolicies` type vs inline `Record<string, FailurePolicy>` shape) is the spec's own preferred Task 4.1 code template, NOT a deviation per Dev's note at line 731.)

### Findings

**Must Fix (0)**: (none)

**Should Fix (0)**: (none)

**Nits (4 inherited + 0 new = 4)**:
- **N-1 (inherited from Stories 4.2-4.10 + 5.1 + 5.2 + 5.3 + 5.4 + 5.5)**: defensive `epicNum === undefined || epicNum === null` check at `src/commands/loop/stop-conditions.ts:269` — the `=== null` arm is unreachable. Story 5.6 does NOT modify `stop-conditions.ts`. Cosmetic forward-tracker.
- **N-2 (inherited)**: `EMPTY_DAG` + `EMPTY_STATE` sentinels at `src/commands/loop/run.ts` mid-file placement. Story 5.6 does NOT relocate these. Cosmetic; Story 6.x cleanup forward.
- **N-3 (inherited)**: future task records should snapshot final test counts AFTER the LAST `biome --write` pass. Story 5.6 dev-iter task record snapshots final 1262/0/4420 matching dev-time post-biome actual; no growth observed at review time.
- **N-4 (inherited)**: TWO unused LoopOpts seams `finalStateOverride` + `writeLoopExitTranscriptOverride`. Story 5.6 does NOT touch the unused seams. Pure dead surface; Story 6.x cleanup forward.

**Info / Forward-Trackers (17 inherited from 5.5 + 5 NEW = 22 total)**:
- **I-1 through I-17 (inherited from Story 5.5 SDR — full set)**: atomic-write / SIGINT / dispatch-mechanism / D1 dual-shape / telemetry / halt history / verbose / recordedAt / regex tightening / Claude Code chat / liberalize parsing / --interactive=fixer / enrich prompt / integration test / Node.js stdin / telemetry consumption / per-step interactiveSteps. NONE actively HONOURED by Story 5.6 directly (resolver is upstream of failure-UX flow; resolver is synchronous + pure).
- **I-18 (NEW — Story 5.6, To Story 6.1)**: cross-story coordination — Story 6.1 file loader will trivially consume the `opts.config` seams that Story 5.6 declared at LoopOpts + RunNextOptions + RunVerifyAndAdvanceOptions. ZERO resolver-API change needed (Story 5.6 already accepts the optional config parameter). The loader workflow: read bmad-stepper.config.yaml via Bun.file().text() → YAML.parse → ConfigV1Schema.parse → pass parsed object to ALL three dispatch sites via opts.config.
- **I-19 (NEW — Story 5.6, To Story 6.x)**: alias mapping for step IDs per OQ-4 — v0.1 BMAD step IDs verbatim case-sensitive; Story 6.x may add optional alias mapping (`dev-story → bmad-dev-story`) if user feedback indicates confusion.
- **I-20 (NEW — Story 5.6, To Story 6.x)**: `--continue-on-error` (Story 4.6) vs per-step `failurePolicies` (Story 5.6) interaction — currently orthogonal (`--continue-on-error` controls whether the LOOP continues after a halt; per-step policy controls WHAT happens at the failure). Forward-tracker: should one subsume the other?
- **I-21 (NEW — Story 5.6, To Story 6.x)**: LoopOpts/RunNextOptions/RunVerifyAndAdvanceOptions seam consolidation — Story 5.6 ADDS `opts.config` to all THREE option interfaces. Story 6.x may consolidate the duplicated seam declarations into a shared base interface.
- **I-22 (NEW — Story 5.6, To future Epics)**: single-line constraint applies to ALL future error classes — the extended CI gate (FR46 single-line per FR46) is automatic. Failing to update REQUIRED_CODES + count assertion is the discoverability signal.

### Sign-off

**approve**. Story 5.6 is COMPLETE, ready for the OPTIONAL Epic-5 retrospective. The implementation is clean, well-tested (24 NEW tests across 3 files: 13 RP_56_* in resolve-policy.test.ts NEW, 11 CFG_56_* in config.test.ts MODIFIED, +1 single-line constraint in errors.test.ts MODIFIED), well-documented (10 OQs adjudicated transparently in spec; 0 deviations; 2 ACCEPTED repairs R1+R2), and honours ALL relevant Story 5.5 + 5.4 + 5.3 + 5.2 + 5.1 + epic-4-retrospective Forward-trackers (Recommendations item 2 PRIMARY HONOURED — failurePolicies config is the canonical Story 5.6 deliverable; item 3 HONOURED — Epic 5 ships ZERO new error classes overall except SkipRequiresResumeError in 5.2; registry stays at 17). ZERO blocking concerns. ZERO source mutations during review. Independent registry coverage verification PASSED (errorRegistry has exactly 17 ctors confirmed via `Object.values()`; the new single-line constraint test iterates over the canonical `instances` array shared with the existing AR22 regex check — covers ALL 17 classes, not a subset). Recommended next loop step: bmad-retrospective for Epic 5 (epic-5-retrospective is OPTIONAL but typically included by default per loop policy; the retrospective consolidates Epic 5 lessons — failure-UX module group + 4 handlers + dispatcher + resolver + actionable-error contract codification + 1 NEW error class SkipRequiresResumeError + 1 NEW StopReason variant manual-interactive-halt + 2 NEW CLI flags --auto-fix and --interactive). **STORY 5.6 COMPLETE — EPIC 5 STORIES COMPLETE; epic-5-retrospective optional iteration follows.**

## Change Log

| Date       | Author    | Change                              |
| ---------- | --------- | ----------------------------------- |
| 2026-05-05 | bmad-code-review (Claude Opus 4.7 1M, iter 18) | Story 5.6 code-review COMPLETE — status flipped review → done. Senior Developer Review section appended; verdict **approve**; 0 must-fix / 0 should-fix / 4 nits (all 4 inherited N-1/N-2/N-3/N-4 unchanged) + 22 info forward-trackers (17 inherited I-1 through I-17 from Story 5.5 + 5 NEW I-18 cross-story coordination Story 6.1 file loader / I-19 alias mapping for step IDs / I-20 --continue-on-error vs per-step policy interaction / I-21 LoopOpts/RunNextOptions/RunVerifyAndAdvanceOptions seam consolidation / I-22 single-line constraint applies to ALL future error classes). AC-1 PASS verified at src/failure-ux/resolve-policy.ts:44-53 (pure resolver — `return fromConfig` + `return "escalate"` fallback) + src/commands/next/verify-and-advance.ts:1031-1035 (per-step policy at dispatch site) + src/commands/next/run.ts:2032-2038 (NextResult.resolvedFailurePolicy composition) + src/commands/loop/run.ts:1007-1010 (loop runner threads opts.config); tests RP_56_4 + RP_56_5/6/7/8 + RP_56_1/2/3 + RP_56_9 + RP_56_10 + RP_56_11 + CFG_56_1 through CFG_56_7. AC-2 PASS verified at src/errors.test.ts:83-94 (NEW single-line constraint test iterates over all 17 instances asserting `not.toMatch(/\\n/)` + `not.toMatch(/\\r/)`) + :77-81 (existing AR22 regex `/^.*(Run|See|Try|Check) /` test). 8/8 quality gates INDEPENDENTLY RE-VERIFIED GREEN: tsc 0 / biome ci 0 + 1262/0/4420 across 67 files / errors 15/0/249 / failure-ux/ 71/0/153 across 6 files / schemas/ 126/0/240 across 9 files / integration escalate-actionable-hint 33/0/114 (UNCHANGED — complementary) / grep StepperError = 17 / independent registry coverage verification PASSED (errorRegistry = 17 ctors via Object.values; new test iterates canonical `instances` array shared with AR22 regex check — covers ALL 17, not a subset). 10 OQs adjudicated (all ACCEPT in-place v0.1 + ACCEPT-DEFER forward-trackers; 0 REJECT). 2 R-repairs R1+R2 ACCEPTED with no AC impact (R1 biome multiline z.record format collapse — formatting only, no semantic change; R2 RTF_53_RUN_7 expectation update from `toBeUndefined()` to `toBe("escalate")` — this is the EXPECTED forward-compat update reflecting the wired resolver default; the test comment ALREADY anticipated this). 0 D-deviations. AR8/9/21/22/33/34/41/42 + AR20/25/26/13 all UPHELD. Errors registry UNCHANGED at 17 (Story 5.6 ships ZERO new error classes per AR21 + epic-4-retro Recommendations item 3 — registry stability discipline maintained across Epic 5). Failure-UX module group GROWS from 4 → 5 source files (resolve-policy.ts joins retry/skip/route-to-fixer/escalate). ZERO source mutations during review. Sprint-status 5-6 = done; **epic-5: in-progress → done** (LAST STORY of Epic 5 complete; epic-5-retrospective remains optional but typically included). last_updated 2026-05-05T06:47:26Z bumped at lines 2 + 38. State.yaml workflow advanced: lastStep=bmad-code-review; lastStepCompletedAt 2026-05-05T06:47:26Z; nextStep=bmad-retrospective; nextStepStory=null; nextStepKey=epic-5-retrospective; evidenceIndex appended. **STORY 5.6 COMPLETE — EPIC 5 STORIES COMPLETE; epic-5-retrospective optional iteration follows.** |
| 2026-05-05 | bmad-dev-story (Claude Opus 4.7 1M, iter 17) | Story 5.6 implementation complete (LAST DEV-STORY of Epic 5). NEW src/failure-ux/resolve-policy.ts (pure resolver) + colocated test (13 tests). NARROWED ConfigV1Schema.failurePolicies value type to FailurePoliciesSchema closed enum + standalone exports. WIRED resolveFailurePolicy at THREE dispatch sites (loop/run.ts + next/run.ts + verify-and-advance.ts) via new opts.config seam. EXTENDED errors-registry CI gate with single-line constraint per FR46. Failure-UX module group grows 4 → 5 source files. Errors registry UNCHANGED at 17. Quality gates 8/8 GREEN: 1262/0/4420 tests; +25 tests +72 expects from baseline. 2 R-repairs (R1 biome format; R2 RTF_53_RUN_7 expectation update). 0 D-deviations. Sprint-status 5-6 ready-for-dev → review; epic-5 stays in-progress. |
| 2026-05-05 | bmad-create-story (Claude Opus 4.7 1M, iter 16 RETRY) | Story 5.6 spec created (~target 600-1000 lines; AC byte-identical to epics.md lines 1140-1149 verified via diff; LAST STORY of Epic 5). Frontmatter status: ready-for-dev; story_id 5.6; epic 5; FR31 + FR32 + FR46 PRIMARY + FR16/17/8/43/44/53/54 SECONDARY; NFR-M2 PRIMARY (actionable-error contract codification) + NFR-R1/R2/R8/S2/S5/M3; AR21 + AR22 + AR41 PRIMARY (error UX shape + actionable-hint regex + boundary graph) + AR8/9/33/34/42; 13 deps (5.5 PRIMARY for failure-ux module COMPLETE 4 handlers + dispatcher; 5.4 PRIMARY for escalate handler + actionable-hint regex contract codification at integration level; 5.3 PRIMARY for --auto-fix flag + route-to-fixer handler + effectiveFailurePolicyOverride composition; 5.2 PRIMARY for SkipRequiresResumeError addition to registry; 5.1 PRIMARY for failurePolicyOverride test seam pattern; 1.2 PRIMARY for errors-registry CI gate; 6.1 CROSS-STORY COORDINATION for config FILE LOADER lands in 6.1 — this story ships SCHEMA + RESOLVER ONLY; 4.6/4.10/3.1/2.6/1.7/1.5 contextual). 30 inputDocuments. ONE primary deliverable (NEW src/failure-ux/resolve-policy.ts + colocated test + ConfigV1Schema narrowing in src/schemas/config.ts + CFG_56_* tests + dispatch-site composition extension at run.ts/next/run.ts/verify-and-advance.ts + errors.test.ts CI gate single-line constraint + bmad-loop.md canonical failurePolicies docs + bmad-next.md cross-link). Architectural decisions: (i) FailurePoliciesSchema location — extend src/schemas/config.ts in-place + add standalone exports per OQ-1; (ii) Story 5.6 vs 6.1 split — schema + resolver here; FILE LOADER deferred to 6.1 per OQ-2; (iii) --auto-fix override duration — single-process-invocation per AC line 1144 verbatim per OQ-3; (iv) per-step ID format — BMAD step IDs verbatim case-sensitive per OQ-4; (v) conflict resolution priority — --auto-fix > opts.failurePolicyOverride (test-only) > config > escalate-default per OQ-5; (vi) errors-registry CI gate update — ADD NEW it block with single-line constraint per OQ-6; (vii) future error classes — must update BOTH registry AND CI gate test per OQ-7 forward-tracker; (viii) docs synchronization — canonical in bmad-loop.md; cross-link from bmad-next.md per OQ-8; (ix) telemetry consumption — v0.1 ships only resolver; aggregation deferred to Story 6.6/6.7 per OQ-9; (x) invalid policy values in config — Zod parse REJECTS with ConfigError per OQ-10. ZERO new error classes per AR21 + epic-4-retro Recommendations item 3 (registry stays at 17). ZERO new CLI flags (per-step policy is config-driven). ZERO state.yaml schema changes. Forward-trackers HONOURED (epic-4-retro Recommendations item 2 PRIMARY HONOURED — failurePolicies config is the canonical Story 5.6 deliverable; item 3 HONOURED — Epic 5 ships ZERO new error classes overall except SkipRequiresResumeError in 5.2). Forward-trackers PRODUCED (8 to Story 6.x: config FILE LOADER trivially consumes resolver; per-step interactiveSteps config knob; alias mapping for step IDs; --continue-on-error vs per-step policy interaction; telemetry aggregation; LoopOpts/RunNextOptions/RunVerifyAndAdvanceOptions seam consolidation; single-line constraint applies to ALL future error classes). Sprint-status: 5-6-per-step-failure-policy-via-config-actionable-errors backlog → ready-for-dev (line 100); epic-5 stays in-progress (line 94 UNCHANGED). State.yaml workflow advance: lastStep bmad-code-review → bmad-create-story; lastStepCompletedAt 2026-05-05T05:58:07Z; nextStep bmad-create-story → bmad-dev-story; nextStepStory 5.6 UNCHANGED; nextStepKey 5-6-per-step-failure-policy-via-config-actionable-errors UNCHANGED; appended ONE evidenceIndex entry. ZERO src/ mutations during this create-story phase (those are dev-story iter work). Errors registry unchanged at 17 codes during create-story step. |
