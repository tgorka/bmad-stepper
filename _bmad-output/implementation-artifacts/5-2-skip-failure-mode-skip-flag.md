---
status: done
story_id: '5.2'
story_key: 5-2-skip-failure-mode-skip-flag
epic: '5'
title: 'Skip Failure Mode + `--skip` Flag'
created: '2026-05-04'
last_updated: '2026-05-04T22:16:47Z'
priority: H
estimated_effort: M
fr_coverage:
  - FR28
  - FR16
  - FR17
  - FR8
  - FR32
  - FR43
  - FR44
  - FR53
  - FR54
nfr_coverage:
  - NFR-R1
  - NFR-R2
  - NFR-R8
  - NFR-S2
  - NFR-S5
  - NFR-M3
ar_coverage:
  - AR8
  - AR9
  - AR21
  - AR22
  - AR33
  - AR34
  - AR41
  - AR42
deps:
  - 5-1-retry-failure-mode                                            # PRIMARY: Story 5.1 lands the failure-ux module group at src/failure-ux/{index,retry}.ts including the closed FailurePolicy union (4 policies: retry/skip/route-to-fixer/escalate), the closed FailureUxOutcome discriminated union (4 variants — Story 5.2 wires the formal skipHandler that fulfills the {outcome: "skip"} variant which Story 5.1 declared but stubbed to escalate), the resolveFailurePolicy resolver, and the dispatchFailureUx central dispatcher. Story 5.2 ADDS NEW src/failure-ux/skip.ts (mirrors src/failure-ux/retry.ts pure-function pattern) and EXTENDS dispatchFailureUx to delegate to skipHandler for `policy === "skip"`. Story 5.1 also lands the RunHistoryEntrySchema (8 typed required fields + 6 D1 legacy optional fields) at src/schemas/state.ts:190-216 which Story 5.2 EXTENDS by adding an OPTIONAL `skipped: boolean` field per AC line 1077. Story 5.2 INHERITS Story 5.1 SDR §I-4 production retry-dispatch gap (forward-tracker — Story 5.2 has no retry-dispatch dependency; the skip path mutates state directly without re-dispatch), §I-5 D1 dual-shape consolidation (forward-tracker — Story 5.2 ADDS one OPTIONAL field rather than introducing a third dual-shape), §I-7 telemetry consumption (forward-tracker — Story 5.2 contributes a skip-event payload shape per OQ-5).
  - 4-10-loop-exit-reason-resume-hint                                 # PRIMARY: epic-4 close-of-Epic baton — Story 5.x failure modes MUST emit via formatLoopExitLines(stopReason, state) per epic-4-retrospective.md §Recommendations for Epic 5 item 1 (line 269). Story 5.2 honours this: the new SkipRequiresResumeError exit-2 path flows through the existing /bmad-next exit emission (NOT through /bmad-loop's formatLoopExitLines because --skip is a /bmad-next-only flag per AC line 1076 wording "/bmad-next --skip <step> --resume runs"); the /bmad-loop runner is UNTOUCHED by Story 5.2 (loop runner does NOT emit a new StopReason variant for --skip — skip is a per-step state mutation, NOT a loop stop condition). However, the AC's exit-2 hint string MUST be byte-identical to AC line 1080: `--skip requires --resume to advance state. Run /bmad-next --skip <step> --resume.` — which fits the AR22 actionable-hint regex `/^.*(Run|See|Try|Check) /` via the trailing "Run /bmad-next --skip <step> --resume." segment.
  - 4-9-sigint-graceful-exit                                          # PRIMARY: SDR §I-2 forward-tracker line 866 mandates "SIGINT during --auto-fix retry / --skip advance / interactive pause may need additional coordination — Story 5.x stories should test their failure-UX flows with SIGINT-mid-flight to confirm graceful-exit invariant holds". Story 5.2 honours this by ADDING SK_52_VA_8 test asserting SIGINT mid-skip-state-write halts cleanly with the in-flight saveState() atomic write either fully completing OR not starting (Story 1.3 atomic tmp+rename guarantees no partial writes per NFR-S5). The skip path's state mutation surface is ATOMIC at the single saveState call (per Story 1.6 atomic-write contract); SIGINT cooperation is fundamentally simpler than retry-mode (NO multi-attempt loop to interrupt; the skip is a single state mutation followed by exit).
  - 4-8-checkpoint-each-step-type                                     # PRIMARY: SDR §I-1 forward-tracker line 972 establishes "verify-and-advance.ts atomic-write contract guarantees all-or-nothing; either both runHistory + checkpoints persist or neither does". Story 5.2 RIDES the existing atomic-write contract — the skip-path runHistory[] entry mutation (setting `skipped: true` on the matched entry) AND the lastSuccessfulStep advance AND the lastAttempted clear all flow through ONE saveState() call, atomic per AR13 Layer 2. The checkpoint append logic (Story 4.8) is UNCHANGED — skip does NOT trigger a new checkpoint write; the just-skipped step did NOT successfully complete, so no Git snapshot is captured.
  - 4-6-stop-condition-error-with-stop-on-error-continue-on-error    # PATTERN: halt-on-error short-circuit at run.ts:796-857 reading state.lastFailureReason.code is the FOUNDATION on which Story 5.2 wraps the skip path. Story 5.2 differs from Story 5.1 retry: --skip is a USER-INVOKED flag (NOT an automatic policy resolution); the user invokes `/bmad-next --skip <step> --resume` AFTER a halt to advance past the failing step. The Story 4.6 boolean gate `--continue-on-error` is UNRELATED — it gates whether retry/skip semantics fire automatically (not whether --skip flag is respected). The /bmad-loop continue-on-error flow does NOT trigger --skip; --skip is /bmad-next-only.
  - 3-2-resume-flag                                                  # CRITICAL: --resume on /bmad-next is the canonical recovery entry-point; AC line 1076 mandates `/bmad-next --skip <step> --resume` (BOTH flags TOGETHER). The AC line 1078-1080 mandates exit-2 + verbatim hint when --skip is invoked alone. Story 5.2 EXTENDS the existing /bmad-next args parsing (Story 1.7 parser at src/commands/next/args.ts) with a NEW `--skip <step>` flag (string-valued, optional) AND adds a cross-validation check in src/commands/next/run.ts that throws SkipRequiresResumeError (NEW error class — see deps below + OQ-1 decision) when `args.skip !== undefined && args.resume === false`. The --resume flag itself is UNCHANGED from Story 3.2; --skip is a NEW co-required flag.
  - 3-1-record-last-attempted-last-failure-reason-on-halt            # CRITICAL: state.lastAttempted {step, epic, story, attemptedAt} (Story 1.6 + Story 3.1 schema + write-on-dispatch + write-on-halt) is the canonical record of the most-recent attempted step. AC line 1075 mandates `state.yaml.lastAttempted.step` matches the skipped step. Story 5.2 reads state.lastAttempted at the start of the skip path and ASSERTS `state.lastAttempted.step === args.skip`; on mismatch throws an error per OQ-6 decision. After a successful skip mutation, state.lastAttempted is CLEARED to null per AC line 1077.
  - 2-6-verify-and-advance-ts-with-state-hash-check                  # CRITICAL: verify-and-advance.ts owns the runHistory[] write site + the lastSuccessfulStep + lastAttempted mutation site. Story 5.2 ADDS a NEW skip path INSIDE verify-and-advance.ts that mirrors the success path (Story 2.6 lines ~848-879) at the lock-held mid-tier: appends a runHistory entry with `outcome: "skip"` + the new `skipped: true` field, advances lastSuccessfulStep to the NEXT step in topological order (per the DAG resolver from Story 1.10), clears lastAttempted to null, ALL via the existing saveState atomic-write path (NO new write site). Story 5.2 does NOT modify the verifier-fail throw site (Story 5.1 owns that for retry); the skip path is a SEPARATE control branch entered when `args.skip !== undefined`.
  - 2-4-lock-free-run-ts-for-bmad-next                               # PATTERN: lock-free dispatch composer at runNext is the entry point for /bmad-next argv parsing. Story 5.2 adds the --skip flag arg parsing in src/commands/next/args.ts (Story 1.7 parser) and the cross-validation check in src/commands/next/run.ts (mirror Story 1.7 cross-validation gap closure for --include-optional + --no-optional at run.ts:336-372). When --skip is present + --resume is present, runNext THREADS args.skip through the dispatch boundary to verify-and-advance.ts via a NEW positional flag `--skip-step <step>` (mirrors the Story 3.1 `--last-attempted-json` threading pattern at run.ts and verify-and-advance/args.ts).
  - 1-7-cli-argument-parser                                          # SCHEMA: Story 1.7 parser surface NextArgsSchema enumerates 18 flags. Story 5.2 EXTENDS the schema with a 19th flag `skip: z.string().optional()` (string-valued: the step name to skip). The kebab-to-camel mapping is automatic (`--skip <step>` → `args.skip`). The cross-validation (--skip alone → exit 2) lives in run.ts (the runner; per the Story 1.7 cross-validation gap intentional split at args.ts line 65).
  - 1-6-state-subsystem-load-save-recompute-skeleton                 # DEPENDENCY: saveState atomic-write owns the runHistory[] + lastSuccessfulStep + lastAttempted write site. Story 5.2 does NOT modify save.ts — the skip-path mutations flow through the existing saveState path at the lock-held verify-and-advance.ts boundary.
  - 1-5-schemas-migrations-skeleton                                  # SCHEMA: Story 5.1 extended StateV1Schema.runHistory[] from z.array(z.unknown()).max(100) to z.array(RunHistoryEntrySchema).max(100) with 8 typed required fields + 6 D1 legacy optional fields (verifierStatus/promotedTo/durationMs/tokensIn/tokensOut/ts). Story 5.2 ADDS ONE more OPTIONAL field `skipped: z.boolean().optional()` to RunHistoryEntrySchema (per OQ-2 decision — undefined-means-false, no migration burden on existing entries). The schema tightening is additive — existing state.yaml files with empty runHistory or with Story 5.1-shape entries continue to validate cleanly; the new field is OPTIONAL.
  - 1-2-errors-module-registry-ci-gate                               # DEPENDENCY: error class registry. Story 5.2 ADDS ONE new error class `SkipRequiresResumeError` (registry 16 → 17 — see OQ-1 decision below) to fulfill AC line 1080 verbatim hint string requirement. Story 5.1 epic-4-retrospective Recommendations item 3 ("Epic 5 should NOT add new error classes") is INTENTIONALLY DEVIATED FROM here per OQ-1: the AC mandates a NEW exit code mapping (exit 2 on --skip-alone) WITH a verbatim hint string distinct from any existing error class hint. Reusing ConfigError (exit 2) would either (a) leak the wrong AR22 hint or (b) require adding a third hintOverride pattern (Story 1.10 + Story 1.11 precedent) — but neither approach is byte-identical to the AC's mandated hint. A NEW error class with `exitCode = 2` and the AC-verbatim `actionableHint` is the cleanest path; the registry CI gate (Story 1.2) accommodates the 17th class trivially via REQUIRED_CODES list extension.
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/implementation-artifacts/5-1-retry-failure-mode.md
  - _bmad-output/implementation-artifacts/4-10-loop-exit-reason-resume-hint.md
  - _bmad-output/implementation-artifacts/4-9-sigint-graceful-exit.md
  - _bmad-output/implementation-artifacts/4-8-checkpoint-each-step-type.md
  - _bmad-output/implementation-artifacts/4-6-stop-condition-error-with-stop-on-error-continue-on-error.md
  - _bmad-output/implementation-artifacts/3-2-resume-flag.md
  - _bmad-output/implementation-artifacts/3-1-record-last-attempted-last-failure-reason-on-halt.md
  - _bmad-output/implementation-artifacts/2-6-verify-and-advance-ts-with-state-hash-check.md
  - _bmad-output/implementation-artifacts/2-4-lock-free-run-ts-for-bmad-next.md
  - _bmad-output/implementation-artifacts/1-7-cli-argument-parser.md
  - _bmad-output/implementation-artifacts/epic-4-retrospective.md
  - _bmad-output/implementation-artifacts/sprint-status.yaml
  - .bmad-stepper/state.yaml
  - .bmad-stepper/config.yaml
  - src/commands/next/args.ts
  - src/commands/next/args.test.ts
  - src/commands/next/run.ts
  - src/commands/next/run.test.ts
  - src/commands/next/verify-and-advance.ts
  - src/commands/next/verify-and-advance.test.ts
  - src/commands/loop/run.ts
  - src/commands/loop/args.ts
  - src/state/save.ts
  - src/state/load.ts
  - src/schemas/state.ts
  - src/schemas/state.test.ts
  - src/schemas/dispatch-protocol.ts
  - src/dispatch/index.ts
  - src/dag/index.ts
  - src/runs/index.ts
  - src/io/log.ts
  - src/errors.ts
  - src/errors.test.ts
  - src/failure-ux/index.ts
  - src/failure-ux/index.test.ts
  - src/failure-ux/retry.ts
  - src/failure-ux/retry.test.ts
  - agents/bmad-step-runner.md
  - commands/bmad-loop.md
  - commands/bmad-next.md
---

# Story 5.2: Skip Failure Mode + `--skip` Flag

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper user,
I want `/bmad-next --skip <step> --resume` to mark the failing step as skipped and advance,
So that one persistently-failing step doesn't block forward progress.

## Context Summary

This is the **SECOND story of Epic 5 (Failure-UX Modes & Auto-Fix)** and lands the **skip policy** + `--skip <step>` user-invoked flag on /bmad-next per FR28 + the failure-UX module group's third concrete handler (Story 5.1 landed `retry`; Story 5.2 lands `skip`; Story 5.3 lands `route-to-fixer` + `--auto-fix`; Story 5.4 lands `escalate`; Story 5.5 lands `--interactive`; Story 5.6 wires per-step config). **Story 5.2 builds DIRECTLY on Story 5.1's `src/failure-ux/` module group** — the closed `FailurePolicy` union already declares `"skip"` (Story 5.1 src/failure-ux/index.ts:25); the closed `FailureUxOutcome` discriminated union already declares the `{outcome: "skip"}` variant (Story 5.1 src/failure-ux/index.ts:40); the central `dispatchFailureUx` dispatcher already routes `"skip"` policy to the v0.1 stub (Story 5.1 src/failure-ux/index.ts:92-97); Story 5.2 wires the FORMAL `skipHandler` at `src/failure-ux/skip.ts` (mirroring the Story 5.1 retry.ts pure-function pattern) and EXTENDS dispatchFailureUx to delegate `"skip"` policy to skipHandler. Per Story 5.1 SDR N-5 forward-tracker (line 1005): "Story 5.2/5.3/5.4 to wire the formal handlers and update the v0.1 stub comment in src/failure-ux/index.ts:95-96 (`v0.1 stubs the three non-retry handlers to escalate`)" — Story 5.2 honours this by removing `"skip"` from the v0.1 stub branch and routing to the formal skipHandler.

**Story 5.2's scope is THREE BDD blocks rolled into a single AC (epics.md lines 1073-1082)** decomposing into THREE PATHS:

- **Skip-path-with-resume happy-path (AC-1 — lines 1075-1077)**: when `state.yaml.lastAttempted.step` matches the user-supplied `--skip <step>` value AND `--resume` is co-supplied, the runner mutates state with THREE simultaneous changes (atomic per Story 1.6 saveState contract): (a) appends a new `runHistory[]` entry with `skipped: true` for the matched step (Story 5.1 RunHistoryEntrySchema EXTENDED with one OPTIONAL field `skipped: z.boolean().optional()` per OQ-2 decision); (b) advances `lastSuccessfulStep` to the NEXT step in topological order via the DAG resolver (Story 1.10 + the Story 2.4 pickNextStep helper that selects the next candidate node from the DAG given the current resolved step); (c) clears `lastAttempted` to null. The phrase "lastSuccessfulStep advances to the next step in topological order" is the LOAD-BEARING SEMANTIC — the skip behaves as if the step had completed successfully (with the `skipped: true` marker for forensic visibility), unblocking dependent steps in the DAG.
- **Skip-without-resume rejection (AC-2 — lines 1078-1080)**: when `--skip` is supplied alone (without `--resume`), Stepper exits with code `2` (configuration error per FR53) and the byte-identical hint `--skip requires --resume to advance state. Run /bmad-next --skip <step> --resume.` This is the AC-mandated cross-validation between two flags; the cross-validation lives at the runner-tier (src/commands/next/run.ts) per Story 1.7's intentional cross-validation gap (the parser is lenient; the runner enforces). Per OQ-1 decision below: a NEW error class `SkipRequiresResumeError` (registry 16 → 17) carries the AC-verbatim `actionableHint` literal; the alternative of reusing `ConfigError` would either leak the wrong AR22 hint OR require a third hintOverride pattern — neither matches the AC's byte-identical hint requirement.
- **Telemetry skip-event recording (AC-3 — line 1081)**: the AC mandates the skipped step be recorded to telemetry as a "skip-event" with the explicit `(Epic 6 dependency)` tag. Per OQ-5 decision: Story 5.2's runHistory[] entry with `skipped: true` IS the future telemetry source — when Story 6.6 wires telemetry collection, it iterates `state.runHistory[]` filtering by `skipped === true` and emits per-step skip-event counts. Story 5.2 does NOT touch `src/telemetry/` (the directory may not exist yet); the AGGREGATION + REPORTING path is Story 6.7. Story 5.2 ensures the data is CAPTURED for future consumption.

**Architectural challenge — where the skip path lives**: per OQ-8 decision below, the skip path lives at the LOCK-HELD mid-tier `src/commands/next/verify-and-advance.ts` (the same scope that owns the lastSuccessfulStep + lastAttempted + runHistory[] mutation site for the success path). **Rationale**: (a) the skip path mutates the SAME three state fields as the success path (just with the `skipped: true` marker on the runHistory entry instead of a `pass` outcome); (b) the lock-acquire/release pattern is the SAME (one acquire at the top, release in the finally per AR8); (c) the atomic-write contract via saveState is the SAME (one write per skip operation per AR13 Layer 2 + Story 4.8 §I-1 forward-tracker); (d) reusing the existing scope minimizes new code and avoids cross-module boundary invention. **Caveat**: the skip path's entry sequence differs from the success path — there is NO sub-agent dispatch (the user has already attempted the step and it failed; --skip means "I'm giving up, advance state"); NO verifier invocation; NO artifact promotion. The skip path is a state-mutation-only path that bypasses the dispatch + verify phases entirely.

**Architectural decision — where the --skip arg parsing lives**: the `--skip <step>` flag is a /bmad-next-only flag (per AC line 1076 verbatim "/bmad-next --skip <step> --resume runs"); /bmad-loop does NOT accept --skip. Story 5.2 EXTENDS NextArgsSchema at `src/commands/next/args.ts` with `skip: z.string().optional()` (the 19th flag in the parser's enumeration). The cross-validation (--skip alone → SkipRequiresResumeError) lives at runtime in `src/commands/next/run.ts` (mirror Story 1.7 cross-validation gap closure pattern for --include-optional + --no-optional at run.ts:336-372). The argv-to-camelcase conversion is automatic via the existing kebab-to-camel mapper.

**Architectural decision — how --skip flows from /bmad-next runner to verify-and-advance.ts**: Story 5.1 establishes the dispatch-boundary positional-flag pattern (`--last-attempted-json` from Story 3.1; `--checkpoint-each` thread-through from Story 4.8). Story 5.2 ADDS one new positional flag `--skip-step <step>` to the verify-and-advance.ts argv parser (Story 2.6 surface). When `args.skip !== undefined && args.resume === true` in run.ts, the runner THREADS the skip-step value through the dispatch boundary to verify-and-advance.ts which detects `args.skipStep !== undefined` and ENTERS the skip path BEFORE the lock-acquire (per OQ-8 — the skip path's lock acquisition mirrors the success path; the early-detection happens after argv parse but before the heavyweight verifier invocation).

**The next-step-in-topological-order resolution** (AC line 1077): the DAG resolver (Story 1.10 + Story 2.4 pickNextStep helper) is the canonical source of truth for "the next step in topological order". The DAG is built from the seed registry + BMAD skill detection; given a current resolved step, the resolver returns the next candidate node with all `after[]` prerequisites satisfied. For the skip path, "lastSuccessfulStep advances to the next step in topological order" means: after marking the current step as skipped, the resolver computes what step would be NEXT to attempt (as if the current step had completed), and that step's metadata (step name, epic, story) becomes the new lastSuccessfulStep value with `completedAt` set to the current ISO timestamp. **Caveat per OQ-3**: when the skipped step has multiple downstream successors (DAG forks), the topological-order tiebreak is the SAME as the existing pickNextStep tiebreak (phase order + Map insertion order per Story 1.10's deterministic invariant). v0.1 accepts the existing tiebreak; future Story 6.x may extend with explicit user override.

**The --skip-step mismatch with state.lastAttempted.step** (per AC line 1075 "Given `state.yaml.lastAttempted.step` matches the skipped step"): the AC's GIVEN clause implicitly requires the matched-step precondition. Per OQ-6 decision: when `args.skip !== state.lastAttempted?.step`, Stepper throws an error with a clear mismatch message. The hint must be AR22-compliant; v0.1 reuses `ConfigError` (exit code 2) with an inline hint override (Story 1.10 + Story 1.11 precedent). Forward-tracker for OQ-6: a future error class `SkipStepMismatchError` may be introduced if the mismatch case proves common; v0.1 conservatively reuses ConfigError.

**The new SkipRequiresResumeError class** (per OQ-1 decision): Story 5.1 INTENTIONALLY did NOT add new error classes per epic-4-retro Recommendations item 3 ("Epic 5 should NOT add new error classes"). Story 5.2 INTENTIONALLY DEVIATES from that recommendation for ONE reason: the AC line 1080 mandates a verbatim hint string `--skip requires --resume to advance state. Run /bmad-next --skip <step> --resume.` that is NOT byte-identical to any existing error class's actionableHint. Reusing ConfigError with a hintOverride (Story 1.10 + Story 1.11 precedent) is the alternative; however, the ergonomics of growing the hintOverride pattern to a third class (after UnknownBmadSkillError + ConfigError) feels like cargo-culting an escape hatch. The cleanest path is a NEW class with the exit code 2 and the AC-verbatim hint baked into the class. The registry CI gate (Story 1.2) accommodates the 17th class trivially via the REQUIRED_CODES list extension. The new code `SKIP_REQUIRES_RESUME` joins the StepperErrorCode union.

**Concretely, Story 5.2 produces**:

1. **`src/failure-ux/skip.ts`** (NEW, ~+50-80 lines): the skip policy handler. Exports `function skipHandler(context: FailureContext, opts?: SkipHandlerOpts): FailureUxOutcome`. The handler is a pure function; given the failure context, returns `{outcome: "skip"}`. Mid-tier per AR41; no I/O imports; deterministic output for given inputs. The handler signature mirrors the Story 5.1 retryHandler pattern. Optional `SkipHandlerOpts` interface declared for future Story 6.x extension (e.g., `{maxConsecutiveSkips?: number}` per OQ-7 forward-tracker idempotent-re-skip protection); v0.1 the opts is empty (no fields).

2. **`src/failure-ux/index.ts`** (MODIFIED, ~+10-20 lines): EXTEND `dispatchFailureUx` to delegate to `skipHandler` for `policy === "skip"` (instead of falling through to the v0.1 escalate stub). The switch statement now has FOUR explicit case branches: `case "retry": return retryHandler(...)` (Story 5.1 unchanged); `case "skip": return skipHandler(...)` (Story 5.2 NEW); `case "route-to-fixer": case "escalate": return { outcome: "escalate", reason: context }` (Story 5.1 v0.1 stub for the remaining two; Stories 5.3 + 5.4 will land their formal handlers). UPDATE the v0.1 stub comment from "v0.1 stubs the three non-retry handlers to escalate" to "v0.1 stubs the two remaining non-retry/non-skip handlers to escalate (Stories 5.3 + 5.4 land their formal handlers)". RE-EXPORT `skipHandler` + `SkipHandlerOpts` for symmetry with Story 5.1's retry exports.

3. **`src/failure-ux/skip.test.ts`** (NEW, ~+80-130 lines): colocated unit tests covering: SK_52_HANDLER_1 through SK_52_HANDLER_4 (skip handler returns `{outcome: "skip"}` for various FailureContext inputs; pure-function check; identity preservation across calls). SK_52_DISPATCH_1 (dispatchFailureUx with `policy: "skip"` delegates to skipHandler returning `{outcome: "skip"}`). SK_52_DISPATCH_2 (TypeScript exhaustiveness verified — the switch branch covers `"skip"` as a separate case, NOT folded into the escalate stub). SK_52_DISPATCH_3 (dispatchFailureUx with `policy: "skip"` produces NO escalate outcome — verifies the v0.1 stub regression).

4. **`src/failure-ux/index.test.ts`** (MODIFIED, ~+10-20 lines): UPDATE the existing RT_51_DISPATCH_3 test (Story 5.1 line 471 — `dispatchFailureUx(ctx, "skip", {})` returns `{outcome: "escalate", reason: ctx}`) to reflect the new behaviour: the test now asserts `dispatchFailureUx(ctx, "skip", {})` returns `{outcome: "skip"}`. ADD a new SK_52_DISPATCH_INDEX test that asserts the v0.1 stub branch comment is no longer applicable to "skip".

5. **`src/errors.ts`** (MODIFIED, ~+15-25 lines): ADD the `SKIP_REQUIRES_RESUME` literal to the `StepperErrorCode` union (currently 16 codes per Story 5.1 SDR; becomes 17 with this addition). ADD the `SkipRequiresResumeError` class extending StepperError with `code = "SKIP_REQUIRES_RESUME" as const`, `exitCode = 2 as const`, and `actionableHint = "--skip requires --resume to advance state. Run /bmad-next --skip <step> --resume." as const`. ADD the class to the `errorRegistry` object (the Story 1.2 CI gate iterates `Object.values(errorRegistry)`). Per OQ-1: this is a deliberate Story 5.1-recommendation-deviation; the AC-verbatim hint string and the dedicated exit-code-2 mapping justify the new class.

6. **`src/errors.test.ts`** (MODIFIED, ~+5-10 lines): EXTEND the `REQUIRED_CODES` list with `"SKIP_REQUIRES_RESUME"` (the 17th code). Confirm the existing CI-gate assertions (`Object.values(errorRegistry)` covers all REQUIRED_CODES; each subclass has a code/exitCode/actionableHint trio; actionableHint matches the AR22 regex `/^.*(Run|See|Try|Check) /`). The AC-mandated hint string ends with `Run /bmad-next --skip <step> --resume.` which fits the AR22 regex via the trailing "Run " segment.

7. **`src/schemas/state.ts`** (MODIFIED, ~+10-15 lines): EXTEND `RunHistoryEntrySchema` (Story 5.1 lines 190-216) with one new OPTIONAL field: `skipped: z.boolean().optional()`. The field is appended after the existing 14 fields (8 typed required + 6 D1 legacy optional); per OQ-2 decision the field is optional + defaults to undefined-means-false (no migration burden). UPDATE the JSDoc block at lines 161-188 to mention Story 5.2's `skipped` field (mirror the Story 4.8 + Story 5.1 documentation block precedent).

8. **`src/schemas/state.test.ts`** (MODIFIED, ~+15-30 lines): ADD ~3-5 new tests covering: SK_52_RHS_1 (RunHistoryEntrySchema accepts `skipped: true`); SK_52_RHS_2 (accepts `skipped: false`); SK_52_RHS_3 (accepts undefined / missing skipped field — back-compat); SK_52_RHS_4 (rejects `skipped: "yes"` non-boolean); SK_52_RHS_5 (StateV1Schema.runHistory[] with mixed entries — some with skipped=true, some without — validates).

9. **`src/commands/next/args.ts`** (MODIFIED, ~+5-15 lines): EXTEND `NextArgsSchema` with `skip: z.string().optional()` as the 19th flag. The flag accepts a step name as its value (e.g., `--skip dev-story` or `--skip code-review`). The kebab-to-camel mapping is automatic (`--skip <value>` → `args.skip = "<value>"`). UPDATE the schema's JSDoc block to mention Story 5.2's new flag. Note: per Story 1.7 cross-validation gap intentional split, the args parser is LENIENT — it accepts `--skip <step>` without `--resume` (the runner enforces co-required via SkipRequiresResumeError).

10. **`src/commands/next/args.test.ts`** (MODIFIED, ~+10-20 lines): ADD ~4-6 new tests covering: SK_52_ARGS_1 (`--skip dev-story` parses to `{skip: "dev-story"}`); SK_52_ARGS_2 (`--skip dev-story --resume` parses to `{skip: "dev-story", resume: true}`); SK_52_ARGS_3 (`--skip` alone without value rejects with parse error — the `=value` or `value` form is required); SK_52_ARGS_4 (`--skip ""` empty-string accepted by parser, runner enforces non-empty per Story 1.7 intentional gap pattern).

11. **`src/commands/next/run.ts`** (MODIFIED, ~+30-60 lines): ADD the cross-validation check between --skip and --resume (mirror the Story 1.7 cross-validation gap closure for --include-optional + --no-optional at run.ts:336-372). When `args.skip !== undefined && args.resume === false`, throw `SkipRequiresResumeError` with the AC-verbatim message; the outer catch translates to AR9 halt action with exit code 2. When `args.skip !== undefined && args.resume === true`, the runner adds a NEW positional flag `--skip-step <step>` to the verify-and-advance.ts dispatch (mirror the Story 3.1 `--last-attempted-json` threading pattern) and ROUTES through the existing dispatch boundary. The argv-extension happens at the existing dispatch-spec construction site (around the same place where `--last-attempted-json` is currently threaded). NO new dispatch-spec field is needed; the --skip-step is a positional argv flag for verify-and-advance.ts only (NOT carried in the JSON dispatch-spec).

12. **`src/commands/next/run.test.ts`** (MODIFIED, ~+50-80 lines): ADD ~6-10 new tests covering: SK_52_RUN_1 (--skip alone throws SkipRequiresResumeError → exit 2 + AC-verbatim hint); SK_52_RUN_2 (--skip + --resume routes through; argv extension threads `--skip-step <step>` to verify-and-advance.ts); SK_52_RUN_3 (--skip "" empty value rejected at runner-tier — validates AR22 hint-on-error); SK_52_RUN_4 (--skip without state.lastAttempted populated — error per OQ-4 decision); SK_52_RUN_5 (--skip with mismatched step — error per OQ-6 decision); SK_52_RUN_6 (the exit-2 hint matches the AR22 regex `/^.*(Run|See|Try|Check) /`).

13. **`src/commands/next/verify-and-advance.ts`** (MODIFIED, ~+80-130 lines): EXTEND `RunVerifyAndAdvanceOptions` with one new optional field `skipStep?: string` (test-injection seam — production threads via the new positional flag). EXTEND `parseVerifyAndAdvanceArgs` (or the equivalent argv parser) with the `--skip-step <value>` positional flag. ADD a NEW skip path INSIDE `runVerifyAndAdvance`: when `args.skipStep !== undefined`, the runner enters the skip branch BEFORE the heavyweight verifier+promote sequence (the dispatch-spec read AND the verifier invocation are SKIPPED on the skip path; the lock acquire happens normally per AR8). The skip branch: (a) acquires the lock; (b) reads state via loadStateUnlocked; (c) asserts `state.lastAttempted?.step === args.skipStep` (throws ConfigError per OQ-6 on mismatch); (d) computes the next step in topological order via the DAG resolver (calls into the Story 1.10 build + the Story 2.4 pickNextStep helper); (e) constructs a new RunHistoryEntry with `skipped: true` for the skipped step; (f) constructs the new state with `lastSuccessfulStep` advanced + `lastAttempted` cleared + `runHistory` appended; (g) calls saveState atomically; (h) emits the AR9 success line via emitDispatchAction; (i) releases the lock in finally. The skip path SHARES the same finally discipline (AR25 + AR26) as the success path.

14. **`src/commands/next/verify-and-advance.test.ts`** (MODIFIED, ~+150-250 lines): ADD ~6-10 new tests covering: SK_52_VA_1 (skip path with matched lastAttempted.step → state mutates correctly: runHistory entry with skipped=true + lastSuccessfulStep advances + lastAttempted clears); SK_52_VA_2 (skip path with mismatched lastAttempted.step → ConfigError thrown); SK_52_VA_3 (skip path with null lastAttempted → ConfigError thrown — OQ-4 decision); SK_52_VA_4 (skip path advances lastSuccessfulStep to NEXT step via DAG resolver — assert pickNextStep called); SK_52_VA_5 (skip-path saveState is atomic — write happens once per skip operation); SK_52_VA_6 (idempotent re-skip behavior per OQ-7 — second invocation of --skip on already-skipped step → ConfigError "step is already skipped"); SK_52_VA_7 (skip-path AR9 emission shape — single line, exit code 0); SK_52_VA_8 (SIGINT mid-skip-state-write — the in-flight saveState either fully completes OR not at all per Story 1.3 atomic tmp+rename; cooperation per Story 4.9 §I-2 forward-tracker); SK_52_VA_9 (skip path does NOT invoke verifier — assert verifierOverride NOT called when skipStep is set); SK_52_VA_10 (skip path does NOT trigger checkpoint append per Story 4.8 — the just-skipped step did not successfully complete).

15. **`commands/bmad-next.md`** (MODIFIED, ~+30-50 lines): ADD a NEW sub-section `### --skip flag (Story 5.2 — Epic 5 skip mode)` covering: the user invocation pattern `/bmad-next --skip <step> --resume`; the AC-mandated co-required relationship with --resume (--skip alone → exit 2 + AC-verbatim hint); the matched-step precondition (state.lastAttempted.step must match args.skip); the state mutation semantic (runHistory[].skipped: true + lastSuccessfulStep advance + lastAttempted clear); the no-verifier-no-promotion behavior (skip is state-mutation-only); the SIGINT cooperation (via the existing saveState atomic-write contract); the idempotency caveat per OQ-7 (re-skip on already-skipped step throws); the telemetry forward-tracker (skipped: true entries are the future telemetry source per Story 6.6/6.7). UPDATE the Usage examples block (currently 8 examples) to ADD `/bmad-next --skip <step> --resume` as the 9th example. UPDATE the trailing FR cross-reference paragraph to add FR28 + FR32.

16. **`commands/bmad-loop.md`** (MODIFIED, ~+10-20 lines): ADD a brief NOTE in the §Behavior section (or in a new §Failure-UX modes — skip (Story 5.2) sub-section) clarifying that --skip is a /bmad-next-only flag (NOT a /bmad-loop flag); /bmad-loop continues to halt on verifier failure per the existing failure-policy resolution (Story 5.6 will wire the failurePolicies: config block for per-step skip auto-resolution; v0.1 default policy is escalate). UPDATE the trailing FR cross-reference to add FR28.

17. **`agents/bmad-step-runner.md`** (UNCHANGED — the sub-agent contract is per-attempt-stateless. The skip path bypasses sub-agent dispatch entirely; the sub-agent never observes a skip operation. Per epic-4-retro Recommendations item 3 + Story 5.1 epic-4-retro item 3 honoring — the agent contract is stable).

18. **`_bmad-output/implementation-artifacts/sprint-status.yaml`** (MODIFIED, 3 lines): flip `5-2-skip-failure-mode-skip-flag: backlog → ready-for-dev` at line 96; epic-5 stays `in-progress` (line 94 — UNCHANGED). Bump `last_updated:` at BOTH the comment block top (line 2) AND the live YAML field (line 38) to `2026-05-04T20:42:45Z`.

19. **`.bmad-stepper/state.yaml`** (MODIFIED, ~25 lines): advance workflow block: `lastStep: bmad-code-review → bmad-create-story`; `lastStepCompletedAt: 2026-05-04T20:42:45Z`; `nextStep: bmad-create-story → bmad-dev-story`; `nextStepStory: '5.2'` (UNCHANGED); `nextStepKey: 5-2-skip-failure-mode-skip-flag` (UNCHANGED). Append ONE new evidenceIndex entry: step `bmad-create-story`, path this file, evidence summary line, runId `2026-05-04T204245Z-bmad-next`, loopId `2026-05-04T193245Z-bmad-loop`, epic `'5'`, story `'5.2'`.

**FR/NFR/AR mapping**:

- **FR28** (--skip flag): WIRED HERE for the FIRST and ONLY time. Per architecture line 1358 the FR28 mapping is `src/failure-ux/skip.ts` (Story 5.2 lands the file) + `src/state/save.ts` (Story 5.2 RIDES the existing save path). **FR16** (sub-agent dispatch with budget+timeout): UNCHANGED — the skip path BYPASSES sub-agent dispatch entirely. **FR17** (verifier before promote): BYPASSED — skip is state-mutation-only with no verifier invocation; the `skipped: true` marker on the runHistory entry is the explicit forensic record that the verifier was NOT consulted. **FR8** (single-step advance): EXTENDED — the skip path advances ONE step (lastSuccessfulStep moves to the next topologically-ordered step); the user invokes `/bmad-next --skip <step> --resume` once per skip operation; subsequent invocations of `/bmad-next` continue from the new lastSuccessfulStep. **FR32** (actionable error report on halt): REINFORCED — the SkipRequiresResumeError class carries the AC-verbatim actionable hint; the ConfigError reuse for mismatch/missing-state cases also carries clear hints (Story 1.10 + Story 1.11 hintOverride precedent). **FR43** (markdown transcript per step): EXTENDED — the skip path writes its own per-step transcript via the existing writeStepTranscript (Story 2.5) surface; the transcript records the skip operation. **FR44** (JSON run log per step): EXTENDED similarly. **FR53** (exit codes): UPHELD — SkipRequiresResumeError maps to exit 2 (configuration error) per the AC line 1080 explicit mandate; the skip-path success maps to exit 0; the mismatch/missing-state cases map to exit 2 (ConfigError reuse). **FR54** (stdout/stderr discipline): UPHELD — the skip-path AR9 success line is the SOLE main-thread emission; warnings (e.g., re-skip idempotency) route to stderr.

- **NFR-R1** (zero data loss on halt): UPHELD — the skip-path state mutation rides the existing saveState atomic-write path (Story 1.6 atomic tmp+rename + .bak rotation per NFR-S5 + AR13 Layer 2). **NFR-R2** (100% --resume recovery): EXTENDED — after a successful skip, `--resume` (without --skip) cleanly continues from the new lastSuccessfulStep (the runHistory[].skipped:true entry is forensic-only; it does NOT block --resume). **NFR-R8** (4 failure modes covered by integration tests): PARTIALLY WIRED — Story 5.1 covered retry; Story 5.2 covers skip; Stories 5.3 + 5.4 will cover route-to-fixer + escalate. The integration test for skip mode lives at `src/commands/next/verify-and-advance.test.ts` (the SK_52_VA_* tests) per Story 5.1's colocation precedent; consolidation to `src/integration/failure-ux.test.ts` is Story 5.6 / 6.x per Story 5.1 SDR §I-8 forward-tracker. **NFR-S2** (no-write-outside-scope): UPHELD — the skip-path writes only to the existing state.yaml location per AR41 boundary. **NFR-S5** (atomic tmp+rename + .bak rotation): UPHELD — the skip-path runHistory + lastSuccessfulStep + lastAttempted mutations ride the existing saveState atomic-write path. **NFR-M3** (schema migrations): TIGHTENED ADDITIVELY — the new `skipped: boolean` field on RunHistoryEntrySchema is OPTIONAL (per OQ-2 decision); existing state.yaml files validate cleanly without migration.

- **AR8** (lock-free top-tier): UPHELD — the skip path lives at lock-held mid-tier `verify-and-advance.ts` (Story 2.6 owns the lock-acquire); `runNext` in `src/commands/next/run.ts` adds ZERO new lock-acquire/release calls. **AR9** (single AR9 stdout line per command invocation): UPHELD — the skip-path success line is ONE emit; the SkipRequiresResumeError catch translates to ONE halt emit. **AR21+22** (errors registry held at 17): EXTENDED FROM 16 TO 17 — Story 5.2 adds SkipRequiresResumeError per OQ-1 decision (intentional deviation from Story 5.1 epic-4-retro Recommendations item 3 — the AC-verbatim hint mandate justifies the new class). The actionableHint matches the AR22 regex via "Run /bmad-next" prefix on the trailing segment. **AR33** (no console.* in source): UPHELD — the skip path uses warn/error from `src/io/log.ts`. **AR34** (slash-command markdown protocol): EXTENDED — `commands/bmad-next.md` gains a new sub-section + Usage example; `commands/bmad-loop.md` gains a clarification note. **AR41** (boundary graph): UPHELD — `src/failure-ux/skip.ts` is mid-tier per architecture file-tree (lines 1182-1188); imports flow `src/commands/next/verify-and-advance.ts` (top-tier consumer) → `src/failure-ux/index.ts` (mid-tier dispatcher) → `src/failure-ux/skip.ts` (sibling) + `src/errors.ts` + `src/schemas/state.ts` (foundational). ZERO new cross-tier imports beyond the canonical hierarchy. **AR42** (test discipline): UPHELD — new colocated tests use the existing test-injection seam pattern; Story 5.2 ADDS one new seam `skipStep?: string` to `RunVerifyAndAdvanceOptions` (mirrors Story 5.1's failurePolicyOverride + maxRetriesOverride additions); production callers thread via the positional flag.

Estimated effort: **M** (medium — ONE new mid-tier file (skip.ts) + 6 source modifications + 1 schema field addition + 1 NEW error class + 2 docs sub-sections; ~+250-450 net source lines + ~+340-580 net test lines; ONE new error class (registry 16 → 17); ONE new file in src/failure-ux/; ONE new schema field).

It does **NOT**:

- **Add a new StopReason variant for skip** — skip is a /bmad-next-only flag (NOT a /bmad-loop stop condition); the /bmad-loop runner is UNTOUCHED by Story 5.2. The 10-variant StopReason union (Story 4.10 close) stays at 10 variants.
- **Wire the `failurePolicies:` config block** — per AC line 1063 (Story 5.1 inheritance) the config block is wired in Story 5.6. Story 5.2 reads policy from a LoopOpts.failurePolicyOverride test-injection seam OR a hardcoded default `escalate` until Story 5.6 lands; the formal `skipHandler` is consulted by `dispatchFailureUx` when policy resolves to `"skip"` (which v0.1 only happens via the test-injection seam).
- **Wire telemetry collection** — per AC line 1081 (Epic 6 dependency tag). Story 5.2 ensures runHistory[] entries CARRY the `skipped: true` field; Story 6.6/6.7 consumes them.
- **Add a backoff/cooldown between skips** — v0.1 ships immediate skip per OQ-7 decision; idempotent-re-skip protection is via ConfigError throw (NOT via cooldown). Forward-tracker for Story 6.x.
- **Modify `agents/bmad-step-runner.md`** — the sub-agent contract is per-attempt-stateless; the skip path bypasses sub-agent dispatch entirely.
- **Modify `src/dispatch/`** — the dispatch infrastructure is unchanged; the skip path bypasses dispatch entirely.
- **Modify `src/verifiers/`** — the verifier infrastructure is unchanged; the skip path bypasses verifier invocation entirely.
- **Modify `src/commands/loop/run.ts`** — the loop runner is /bmad-next-only-aware; --skip is a /bmad-next flag; the loop runner does NOT need to know about it. Story 5.6 will wire per-step skip policy auto-resolution at the loop runner-tier (NOT Story 5.2).
- **Modify `LoopArgsSchema`'s 13-field surface** — Story 5.2 has no /bmad-loop CLI flag.
- **Modify `src/io/lock.ts`** — the lock contract is unchanged; the skip path acquires the lock once per Story 2.6 pattern.
- **Add a `--skip-step <step>` flag to /bmad-loop** — /bmad-loop has no skip flag; --skip is /bmad-next-only.
- **Add a runHistory entry shape change beyond `skipped: boolean`** — the field is OPTIONAL; no migration; no existing field is modified.
- **Modify the FR53 exit-code mapping** — the SkipRequiresResumeError carries exit code 2 (configuration error) per AC line 1080; this is consistent with the existing FR53 mapping (configuration errors map to 2).

## Acceptance Criteria

The acceptance criteria below are reproduced **verbatim** from `_bmad-output/planning-artifacts/epics.md` §Story 5.2 (lines 1073-1082, BDD Given/When/Then format). Lines and AC labelling preserved.

**Acceptance Criteria:**

**Given** `state.yaml.lastAttempted.step` matches the skipped step
**When** `/bmad-next --skip <step> --resume` runs
**Then** state is updated with `runHistory[].skipped: true` for the matched step; lastSuccessfulStep advances to the next step in topological order; lastAttempted clears
**Given** `--skip` is given alone (no `--resume`)
**When** invoked
**Then** Stepper exits 2 with the hint `--skip requires --resume to advance state. Run /bmad-next --skip <step> --resume.`
**And** the skipped step is recorded to telemetry as a skip-event (Epic 6 dependency)

> **Story 5.2 skip-mode scope note**: Story 5.2 is the SECOND story in Epic 5 (Failure-UX Modes & Auto-Fix) and lands the SKIP failure-UX policy + the user-invoked `--skip <step>` flag on /bmad-next per FR28. The AC has TWO BDD blocks + ONE And-clause: the FIRST (lines 1075-1077) defines the happy-path skip semantics with three simultaneous state mutations (runHistory[].skipped:true + lastSuccessfulStep advance + lastAttempted clear); the SECOND (lines 1078-1080) defines the cross-validation that --skip alone (without --resume) exits 2 with the verbatim hint; the And-clause (line 1081) flags telemetry skip-event recording as an Epic 6 dependency. The phrase "lastSuccessfulStep advances to the next step in topological order" is interpreted (per OQ-3 below) as the existing pickNextStep helper from Story 2.4 (DAG resolver from Story 1.10) — same tiebreak as the success path. The AC-mandated hint is byte-identical to the SkipRequiresResumeError's actionableHint per OQ-1 decision (NEW error class — registry 16 → 17 — intentional deviation from Story 5.1 epic-4-retro Recommendations item 3 because the AC-verbatim hint mandate justifies the dedicated class). After Story 5.2 the failure-UX module group has TWO formal handlers (retry + skip); Stories 5.3/5.4 layer route-to-fixer + escalate; Story 5.6 wires the per-step config-resolved policy lookup. Per Story 4.10 + epic-4-retrospective.md §Recommendations item 1, the SkipRequiresResumeError exit (when invoked via /bmad-next standalone) flows through the existing /bmad-next AR9 halt emission (NOT through /bmad-loop's formatLoopExitLines because --skip is /bmad-next-only); the /bmad-loop runner is UNTOUCHED.

## Tasks / Subtasks

- [x] **Task 0 — Pre-flight evidence verification (AC: all)**
  - [x] 0.1 Confirm Story 5.1 is `done` per `_bmad-output/implementation-artifacts/sprint-status.yaml:95`. Confirm epic-5 is currently `in-progress` per line 94 (Story 5.1 flipped epic-5 backlog → in-progress). Confirm 5-2-skip-failure-mode-skip-flag is currently `backlog` per line 96 (Story 5.2 will flip to `ready-for-dev`).
  - [x] 0.2 Read `_bmad-output/implementation-artifacts/5-1-retry-failure-mode.md` end-to-end. Confirm:
    - `src/failure-ux/index.ts` (99 lines) declares the closed `FailurePolicy` union (4 policies: retry/skip/route-to-fixer/escalate); the closed `FailureUxOutcome` discriminated union (4 variants — Story 5.2 wires the `{outcome: "skip"}` variant's formal handler); the `resolveFailurePolicy` resolver; the `dispatchFailureUx` central dispatcher with v0.1 stubs for skip/route-to-fixer/escalate.
    - `src/failure-ux/retry.ts` (53 lines) is the Story 5.1 pure-function retryHandler precedent; Story 5.2's skip.ts mirrors this pattern (pure-function + sibling-only imports + no I/O).
    - Errors registry at `src/errors.ts` holds at 16 codes per Story 5.1 SDR (Story 5.1 added ZERO new error classes per epic-4-retro Recommendations item 3). Story 5.2 INTENTIONALLY deviates from that recommendation per OQ-1 — extends to 17.
    - `src/schemas/state.ts:190-216` declares `RunHistoryEntrySchema` with 8 typed required fields + 6 D1 legacy optional fields (verifierStatus/promotedTo/durationMs/tokensIn/tokensOut/ts). Story 5.2 ADDS ONE more OPTIONAL field `skipped: z.boolean().optional()`.
    - `src/commands/next/verify-and-advance.ts` (Story 5.1 modified at lines 643-756) wraps the verifier-fail throw site in a retry loop reading dispatchFailureUx. Story 5.2 ADDS a NEW skip branch BEFORE the verifier invocation — when `args.skipStep !== undefined`, the runner enters the skip path (no verifier invocation, no dispatch-spec read, just state mutation).
    - `src/commands/next/run.ts` extends RunNextOptions with `failurePolicyOverride` + `maxRetriesOverride` (Story 5.1). Story 5.2 ADDS argv parsing for `--skip <step>` flag (NextArgsSchema 19th field) + cross-validation that --skip requires --resume (mirror Story 1.7 cross-validation gap closure pattern).
  - [x] 0.3 Read `_bmad-output/implementation-artifacts/4-10-loop-exit-reason-resume-hint.md` end-to-end. Confirm:
    - `formatLoopExitLines(stopReason, state)` is exported from `src/commands/loop/run.ts` and consumed by the import.meta.main block. Story 5.2 does NOT modify this function — the SkipRequiresResumeError exit (when invoked via /bmad-next standalone) flows through the existing /bmad-next AR9 halt emission (NOT through formatLoopExitLines because --skip is /bmad-next-only).
    - The 10 StopReason variants are stable. Story 5.2 ADDS NO new StopReason variant (skip is a per-step state mutation, NOT a loop stop condition).
  - [x] 0.4 Read `_bmad-output/implementation-artifacts/4-9-sigint-graceful-exit.md` §I-2 forward-tracker line 866 verbatim: "SIGINT during --auto-fix retry / --skip advance / interactive pause may need additional coordination — Story 5.x stories should test their failure-UX flows with SIGINT-mid-flight to confirm graceful-exit invariant holds." Story 5.2 honours this by ADDING SK_52_VA_8 test asserting SIGINT mid-skip-state-write halts cleanly with the in-flight saveState() atomic write either fully completing OR not starting (Story 1.3 atomic tmp+rename guarantees no partial writes per NFR-S5).
  - [x] 0.5 Read epics.md §Story 5.2 lines 1073-1082 verbatim. Confirm the AC text in §Acceptance Criteria above is character-identical to lines 1073-1082 — particularly the literal `state.yaml.lastAttempted.step` placeholder text, the literal `runHistory[].skipped: true` notation, the literal `--skip <step> --resume` invocation pattern, the literal verbatim hint string `--skip requires --resume to advance state. Run /bmad-next --skip <step> --resume.` (note the trailing period; the embedded `<step>` placeholder; the trailing period after `--resume.`), and the BDD Given/When/Then structure with the SECOND Given/When/Then block following the first And-less Then.
  - [x] 0.6 Read `_bmad-output/planning-artifacts/architecture.md` lines 492-499 (failure-UX modes definition). Confirm: `skip` description "record skip in state; advance to next step." Story 5.2 honours this verbatim — the runHistory entry records the skip; lastSuccessfulStep advances to the next step in topological order.
  - [x] 0.7 Read `_bmad-output/planning-artifacts/architecture.md` lines 1182-1188 (failure-ux module group). Confirm: directory is `src/failure-ux/` with files `index.ts`, `retry.ts`, `skip.ts`, `route-to-fixer.ts`, `escalate.ts`, `*.test.ts`. Story 5.2 lands `skip.ts` + colocated `*.test.ts` (Story 5.3 will land route-to-fixer; Story 5.4 will land escalate).
  - [x] 0.8 Read `_bmad-output/planning-artifacts/architecture.md` line 1358 (FR table for FR28). Confirm: FR28 maps to `src/failure-ux/skip.ts` + `src/state/save.ts`. Story 5.2 lands the `skip.ts` half; the `save.ts` half is RIDDEN unchanged (the existing saveState atomic-write path).
  - [x] 0.9 Read `_bmad-output/planning-artifacts/prd.md` line 707 (FR28 verbatim): "Users can skip a failing step and resume (`--skip <step> --resume`)." Story 5.2 PRIMARY = FR28; SECONDARY = FR32 (actionable error report on the SkipRequiresResumeError throw path).
  - [x] 0.10 Read `_bmad-output/planning-artifacts/prd.md` line 780 (NFR-R8): "All four failure-UX modes (retry, skip, route-to-fixer, escalate) are individually covered by integration tests." Story 5.1 covered retry; Story 5.2 covers skip; Stories 5.3/5.4 will cover route-to-fixer + escalate. Integration test path per architecture line 1409: `src/integration/failure-ux.test.ts`. Story 5.2 may CO-LOCATE its integration tests in `src/commands/next/verify-and-advance.test.ts` (the SK_52_VA_* tests) initially per Story 5.1 colocation precedent; consolidation is Story 5.6 / 6.x per Story 5.1 SDR §I-8 forward-tracker.
  - [x] 0.11 Read `src/commands/next/args.ts` to confirm the current NextArgsSchema declaration (18 fields per the existing schema). Story 5.2 EXTENDS this with a 19th field `skip: z.string().optional()`. Confirm the existing `.strict()` mode rejects unknown keys (Story 1.7 AC-1 mechanism); the new `skip` field will be enumerated explicitly.
  - [x] 0.12 Read `src/commands/next/run.ts` to identify the existing cross-validation site (--include-optional + --no-optional check at run.ts:336-372). Story 5.2 ADDS a SIMILAR cross-validation site for --skip + --resume; mirror the Story 1.7 hint-on-throw pattern (throw ConfigError-or-equivalent with AR22-conformant hint).
  - [x] 0.13 Read `src/commands/next/verify-and-advance.ts` to identify the success-path state mutation site (Story 2.6 lines ~848-879). Story 5.2 ADDS a NEW skip branch INSIDE the runVerifyAndAdvance try-block, BEFORE the dispatch-spec read + verifier invocation, that mirrors the success-path mutation pattern (lastSuccessfulStep advance + lastAttempted clear + runHistory append) — but with `skipped: true` on the runHistory entry instead of `outcome: "pass"`.
  - [x] 0.14 Confirm `src/errors.ts` registry holds at 16 codes via `bun test src/errors.test.ts` (10 pass / 0 fail / 197 expects per Story 5.1 SDR baseline). Story 5.2 ADDS ONE new error class per OQ-1 — registry grows to 17.
  - [x] 0.15 Confirm baseline full-suite test counts: 1074 pass / 0 fail / 3827 expects across 62 files per Story 5.1 SDR §Quality gates baseline. Story 5.2 dev-story phase will measure Δ.
  - [x] 0.16 Confirm baseline biome ci + tsc both exit 0 per Story 5.1 §Quality gates.
  - [x] 0.17 Read `agents/bmad-step-runner.md` to confirm the sub-agent contract is per-attempt-stateless + skip-unaware. The skip path bypasses sub-agent dispatch entirely; the sub-agent never observes a skip operation.

- [x] **Task 1 — Address Story 5.1 + epic-4 retrospective forward action items (AC: all)**
  - [x] 1.1 Honour Story 5.1 SDR N-5 forward-tracker (line 1005): "The dispatchFailureUx v0.1 stub for non-retry policies (skip / route-to-fixer / escalate) silently returns `{outcome: "escalate", reason: ctx}` with no warning. Forward-tracker for Story 5.2/5.3/5.4 to wire the formal handlers and update the v0.1 stub comment in src/failure-ux/index.ts:95-96." Story 5.2 honours by REMOVING `"skip"` from the v0.1 stub branch and routing to the formal `skipHandler` from `src/failure-ux/skip.ts`. UPDATE the v0.1 stub comment to note that the two remaining non-retry/non-skip handlers (route-to-fixer + escalate) escalate until Stories 5.3 + 5.4 land them.
  - [x] 1.2 Honour Story 5.1 SDR §I-3 forward-tracker (line 1010): "SIGINT during --auto-fix retry / --skip advance / interactive pause may need additional coordination — Story 5.1's retry-mode SIGINT cooperation is the precedent; Stories 5.2/5.3/5.5 should mirror the `shutdownRequested` poll pattern." Story 5.2 honours by ADDING SK_52_VA_8 test asserting SIGINT mid-skip-state-write halts cleanly. Note: skip is fundamentally simpler than retry (NO multi-attempt loop to interrupt; the skip is a single saveState call); the existing atomic-write contract via Story 1.3 atomic tmp+rename guarantees no partial writes per NFR-S5. The `shutdownRequested` poll pattern is NOT applicable to skip (no loop to short-circuit); SIGINT during the skip-path saveState either lets the write complete OR aborts cleanly before the write starts.
  - [x] 1.3 Honour epic-4-retrospective.md §Recommendations item 1 (line 269): "Failure modes (retry/skip/route-to-fixer/escalate) MUST consume `formatLoopExitLines(stopReason, state)` from Story 4.10 for any new failure-mode exit emissions." Story 5.2 honours by NOT modifying formatLoopExitLines (the SkipRequiresResumeError exit flows through the /bmad-next AR9 halt emission, NOT through /bmad-loop's formatLoopExitLines because --skip is /bmad-next-only). NO new StopReason variant is introduced by Story 5.2.
  - [x] 1.4 Honour epic-4-retrospective.md §Recommendations item 4 (line 275): "Each Story 5.x flow MUST be tested with SIGINT-mid-flight to confirm Story 4.9's graceful-exit invariant holds under failure-UX modes." Honoured by Task 1.2 above.
  - [x] 1.5 Honour epic-4-retrospective.md §Recommendations item 7 (line 281): "Story 5.1 retry mode should EXTEND `runHistory[]` entries with attempt-number metadata; consider whether to bump `state.runHistory[]` from `z.array(z.unknown())` to a typed entry shape." Story 5.1 already TIGHTENED the schema (RunHistoryEntrySchema with 8 typed required fields + 6 D1 legacy optional fields). Story 5.2 ADDS ONE more OPTIONAL field `skipped: z.boolean().optional()` per OQ-2 decision (no migration burden).
  - [x] 1.6 Inherit Story 5.1 N-1/N-2/N-3/N-4 nits + N-5 NEW (defensive null check at stop-conditions.ts:269; EMPTY_DAG + EMPTY_STATE sentinels mid-file placement; future task-record snapshot timing; TWO unused LoopOpts seams `finalStateOverride` + `writeLoopExitTranscriptOverride`; v0.1 dispatchFailureUx stub silent-escalate). Story 5.2 INHERITS N-1/N-2/N-3/N-4 unchanged (does NOT touch stop-conditions.ts, sentinels, unused seams); RESOLVES N-5 by removing `"skip"` from the v0.1 stub per Task 1.1.
  - [x] 1.7 Inherit Story 5.1 SDR §I-1 forward-tracker (line 1008): verify-and-advance.ts atomic-write contract guarantees all-or-nothing. Story 5.2 RIDES this contract — the skip-path runHistory + lastSuccessfulStep + lastAttempted mutations all flow through ONE saveState() call, atomic per AR13 Layer 2.
  - [x] 1.8 Inherit Story 5.1 SDR §I-4 forward-tracker (line 1011): production retry-dispatch mechanism gap. Story 5.2 has NO retry-dispatch dependency — the skip path is a state-mutation-only path; no sub-agent re-dispatch needed.
  - [x] 1.9 Inherit Story 5.1 SDR §I-5 forward-tracker (line 1012): D1 dual-shape consolidation (6 legacy optional fields coexist with 8 new typed required fields on RunHistoryEntrySchema). Story 5.2 ADDS ONE more OPTIONAL field `skipped: boolean` rather than introducing a third dual-shape — same OPTIONAL pattern as the legacy fields per back-compat discipline.

- [x] **Task 2 — Add `SkipRequiresResumeError` error class (AC: 2)**
  - [x] 2.1 ADD `"SKIP_REQUIRES_RESUME"` to the `StepperErrorCode` union in `src/errors.ts` (between existing codes; alphabetical order or end-of-list per existing style).
  - [x] 2.2 ADD a new `SkipRequiresResumeError` class extending StepperError:
    ```typescript
    export class SkipRequiresResumeError extends StepperError {
      override readonly code = "SKIP_REQUIRES_RESUME" as const;
      override readonly exitCode = 2 as const;
      override readonly actionableHint =
        "--skip requires --resume to advance state. Run /bmad-next --skip <step> --resume.";
    }
    ```
  - [x] 2.3 ADD `SkipRequiresResumeError` to the `errorRegistry` object (the Story 1.2 CI gate iterates `Object.values(errorRegistry)`).
  - [x] 2.4 EXTEND the `REQUIRED_CODES` list in `src/errors.test.ts` with `"SKIP_REQUIRES_RESUME"` (becomes the 17th code).
  - [x] 2.5 Confirm the AR22 actionable-hint regex `/^.*(Run|See|Try|Check) /` matches the hint string (matches via the trailing "Run /bmad-next --skip <step> --resume." segment).
  - [x] 2.6 Run `bun test src/errors.test.ts` and confirm all tests pass (target: 10 pass / 0 fail / ~205+ expects per the new code addition; the existing tests iterate the registry so the count grows by ~12 per code addition).

- [x] **Task 3 — Extend `RunHistoryEntrySchema` with `skipped` field (AC: 1)**
  - [x] 3.1 EXTEND the `RunHistoryEntrySchema` Zod object at `src/schemas/state.ts:190-216` with one new OPTIONAL field after the existing 14 fields:
    ```typescript
    // Story 5.2: skip-mode marker per FR28 + AC line 1077.
    // When set to true, the entry records a skip operation invoked
    // via /bmad-next --skip <step> --resume (NOT a verifier-pass
    // outcome). The `outcome` field above stays "pass" per the
    // success-path-shape contract; the `skipped: true` marker is the
    // forensic record that the verifier was BYPASSED. Future
    // telemetry (Story 6.6/6.7) iterates state.runHistory[] filtered
    // by `skipped === true` to count skip-events per step.
    // Optional + undefined-means-false per Story 5.2 OQ-2 decision —
    // no migration burden on existing entries.
    skipped: z.boolean().optional(),
    ```
  - [x] 3.2 UPDATE the JSDoc block at `src/schemas/state.ts:161-188` to mention Story 5.2's `skipped` field (mirror the Story 4.8 + Story 5.1 documentation block precedent).
  - [x] 3.3 The `RunHistoryEntry` type alias at `src/schemas/state.ts:216` updates automatically via `z.infer<typeof RunHistoryEntrySchema>` — no code change needed.

- [x] **Task 4 — Add `RunHistoryEntrySchema` validation tests (AC: 1)**
  - [x] 4.1 ADD ~3-5 new tests in `src/schemas/state.test.ts` covering:
    - **SK_52_RHS_1**: RunHistoryEntrySchema accepts entry with `skipped: true` → validates.
    - **SK_52_RHS_2**: RunHistoryEntrySchema accepts entry with `skipped: false` → validates.
    - **SK_52_RHS_3**: RunHistoryEntrySchema accepts entry with NO skipped field (undefined) → validates (back-compat for existing entries).
    - **SK_52_RHS_4**: RunHistoryEntrySchema rejects entry with `skipped: "yes"` (non-boolean) → ZodError.
    - **SK_52_RHS_5**: StateV1Schema.runHistory[] with mixed entries (some with skipped=true, some without) → validates.

- [x] **Task 5 — Define `src/failure-ux/skip.ts` skip handler (AC: 1)**
  - [x] 5.1 CREATE NEW file `src/failure-ux/skip.ts` with the skip policy handler:
    ```typescript
    /**
     * src/failure-ux/skip.ts — Skip policy handler (Story 5.2 AC: 1.1).
     *
     * Pure function. Returns the skip outcome; the caller
     * (verify-and-advance.ts) translates the outcome to the state
     * mutation: runHistory[].skipped: true + lastSuccessfulStep
     * advance + lastAttempted clear.
     *
     * Mid-tier per AR41 (architecture lines 1182-1188). No I/O imports;
     * no side effects.
     *
     * Story 5.2 design decisions:
     *   - Pure function (mirror Story 5.1 retryHandler precedent).
     *   - Empty SkipHandlerOpts for v0.1 (no fields); future Story 6.x
     *     may extend with maxConsecutiveSkips per OQ-7 forward-tracker.
     *   - The handler does NOT mutate state directly — that is the
     *     caller's responsibility (mirrors retryHandler's separation
     *     of decision from mutation).
     */
    
    import type { FailureContext, FailureUxOutcome } from "./index.ts";
    
    export interface SkipHandlerOpts {
      // v0.1: empty. Future Story 6.x: maxConsecutiveSkips, etc.
    }
    
    /**
     * Skip policy handler. Returns `{outcome: "skip"}` for any failure
     * context. The caller translates the outcome to state mutation:
     * runHistory[].skipped: true + lastSuccessfulStep advance +
     * lastAttempted clear.
     *
     * @param context - The failure context for the just-failed attempt.
     * @param opts    - Skip handler options (empty in v0.1).
     * @returns The dispatcher outcome `{outcome: "skip"}`.
     */
    export function skipHandler(
      context: FailureContext,
      _opts: SkipHandlerOpts = {},
    ): FailureUxOutcome {
      void context;
      return { outcome: "skip" };
    }
    ```
  - [x] 5.2 Confirm AR41 boundary: ONLY imports from sibling `./index.ts` (for the FailureContext / FailureUxOutcome types). NO imports from `src/errors.ts`, `src/io/`, or any higher tier.
  - [x] 5.3 Confirm pure-function shape: no I/O, no side effects, deterministic output for given inputs (input: `{...}` + `{...}` → output: `{outcome: "skip"}`).

- [x] **Task 6 — Wire `skipHandler` into `dispatchFailureUx` (AC: 1)**
  - [x] 6.1 IMPORT `skipHandler` + `SkipHandlerOpts` at the top of `src/failure-ux/index.ts`:
    ```typescript
    import { type SkipHandlerOpts, skipHandler } from "./skip.ts";
    ```
  - [x] 6.2 EXTEND the `dispatchFailureUx` switch statement to delegate to `skipHandler` for `policy === "skip"`:
    ```typescript
    switch (policy) {
      case "retry":
        return retryHandler(context, { maxRetries: opts.maxRetries ?? 2 });
      case "skip":
        return skipHandler(context, {});
      case "route-to-fixer":
      case "escalate":
        // v0.1 stubs the two remaining non-retry/non-skip handlers to
        // escalate. Stories 5.3/5.4 will land their formal handlers.
        return { outcome: "escalate", reason: context };
    }
    ```
  - [x] 6.3 UPDATE the v0.1 stub JSDoc comment from "v0.1 stubs the three non-retry handlers to escalate" to "v0.1 stubs the two remaining non-retry/non-skip handlers to escalate (Stories 5.3 + 5.4 land their formal handlers)".
  - [x] 6.4 RE-EXPORT `skipHandler` + `SkipHandlerOpts` for symmetry with Story 5.1's retry exports:
    ```typescript
    export type { SkipHandlerOpts };
    export { skipHandler };
    ```

- [x] **Task 7 — Add unit tests for `src/failure-ux/skip.ts` + update `index.test.ts` (AC: 1)**
  - [x] 7.1 CREATE NEW file `src/failure-ux/skip.test.ts` with ~6-10 unit tests:
    - **SK_52_HANDLER_1**: `skipHandler({attemptNumber: 1, ...})` returns `{outcome: "skip"}`.
    - **SK_52_HANDLER_2**: `skipHandler({attemptNumber: 5, ...})` returns `{outcome: "skip"}` (independent of attemptNumber).
    - **SK_52_HANDLER_3**: Pure-function check: calling `skipHandler` twice with same input produces same output (no hidden state).
    - **SK_52_HANDLER_4**: `skipHandler` with different `code` / `message` / `hint` / `runId` / `step` values all return `{outcome: "skip"}` (handler is context-agnostic).
    - **SK_52_DISPATCH_1**: `dispatchFailureUx(ctx, "skip", {})` delegates to `skipHandler` returning `{outcome: "skip"}`.
    - **SK_52_DISPATCH_2**: TypeScript exhaustiveness verified — the switch branch covers `"skip"` as a separate case, NOT folded into the escalate stub.
    - **SK_52_DISPATCH_3**: `dispatchFailureUx(ctx, "skip", {})` produces NO escalate outcome — verifies the v0.1 stub regression (Story 5.1 → Story 5.2 behaviour change).
  - [x] 7.2 UPDATE the existing `src/failure-ux/index.test.ts` RT_51_DISPATCH_3 test (line ~471 — Story 5.1 `dispatchFailureUx(ctx, "skip", {})` returns `{outcome: "escalate", reason: ctx}`) to reflect the new behaviour: the test now asserts `dispatchFailureUx(ctx, "skip", {})` returns `{outcome: "skip"}`. Rename the test ID to RT_51_DISPATCH_3_SKIP_FORMAL or add a Story 5.2 comment noting the behaviour change.

- [x] **Task 8 — Extend NextArgsSchema with `--skip <step>` flag (AC: 2)**
  - [x] 8.1 ADD the `skip` field to `NextArgsSchema` at `src/commands/next/args.ts`:
    ```typescript
    skip: z.string().optional(),  // Story 5.2 — FR28 --skip <step> flag
    ```
    Place between existing fields (preserving alphabetical or grouping order; recommend after `resume` for grouping with other failure-UX flags).
  - [x] 8.2 UPDATE the schema JSDoc block to mention Story 5.2's new flag:
    ```
    Story 5.2: NEW `skip` string-valued flag (the 19th flag in the
    parser's enumeration). Per FR28 + AC line 1076: `--skip <step>
    --resume` skips the matched step and advances state. The runner
    enforces co-required relationship with --resume (Story 1.7
    cross-validation gap closure pattern).
    ```
  - [x] 8.3 The kebab-to-camel mapping is automatic (`--skip <value>` → `args.skip = "<value>"`) per the existing `kebabToCamel` helper.

- [x] **Task 9 — Add NextArgsSchema parsing tests (AC: 2)**
  - [x] 9.1 ADD ~4-6 new tests in `src/commands/next/args.test.ts` covering:
    - **SK_52_ARGS_1**: `parseNextArgs(["--skip", "dev-story"])` returns `{ok: true, value: {skip: "dev-story", ...}}`.
    - **SK_52_ARGS_2**: `parseNextArgs(["--skip", "dev-story", "--resume"])` returns `{ok: true, value: {skip: "dev-story", resume: true, ...}}`.
    - **SK_52_ARGS_3**: `parseNextArgs(["--skip"])` (without value) → ParseError (the parser requires a value for string-valued flags).
    - **SK_52_ARGS_4**: `parseNextArgs(["--skip", ""])` empty-string accepted by parser (Story 1.7 intentional gap pattern); runner enforces non-empty.
    - **SK_52_ARGS_5**: `parseNextArgs(["--skip=dev-story"])` (= form) returns `{ok: true, value: {skip: "dev-story", ...}}`.
    - **SK_52_ARGS_6**: Unknown flag rejection: `parseNextArgs(["--skip-extra", "dev-story"])` → ParseError per `.strict()` mode.

- [x] **Task 10 — Wire --skip cross-validation + dispatch threading in `src/commands/next/run.ts` (AC: 2)**
  - [x] 10.1 ADD the cross-validation check between --skip and --resume (mirror the Story 1.7 cross-validation gap closure for --include-optional + --no-optional at run.ts:336-372):
    ```typescript
    // Story 5.2: enforce --skip requires --resume per AC line 1078-1080.
    if (args.skip !== undefined && args.resume === false) {
      throw new SkipRequiresResumeError(
        `--skip flag requires --resume (received --skip ${args.skip} without --resume)`,
      );
    }
    ```
  - [x] 10.2 IMPORT `SkipRequiresResumeError` at the top of `src/commands/next/run.ts`:
    ```typescript
    import { ConfigError, SkipRequiresResumeError, StepperError } from "../../errors.ts";
    ```
  - [x] 10.3 When `args.skip !== undefined && args.resume === true`, the runner THREADS `args.skip` through the dispatch boundary to verify-and-advance.ts via a NEW positional flag `--skip-step <step>`. Mirror the Story 3.1 `--last-attempted-json` threading pattern at the existing dispatch-spec construction site.
  - [x] 10.4 The argv-extension happens at the existing dispatch-spec construction site (around the same place where `--last-attempted-json` is currently threaded). NO new dispatch-spec field is needed; the --skip-step is a positional argv flag for verify-and-advance.ts only (NOT carried in the JSON dispatch-spec).
  - [x] 10.5 Optional: ADD a `--skip <step>` route at the top-level argv branching that bypasses the dispatch + Task tool flow entirely (since the skip path has no sub-agent dispatch). v0.1 conservative: route through the existing dispatch flow but verify-and-advance.ts skips the dispatch-spec read + verifier on the skip-step branch.

- [x] **Task 11 — Add tests for /bmad-next runner skip-flag handling in `src/commands/next/run.test.ts` (AC: 2)**
  - [x] 11.1 ADD ~6-10 new tests covering:
    - **SK_52_RUN_1**: `runNext({argv: ["--skip", "dev-story"]})` (without --resume) → throws SkipRequiresResumeError → exit code 2 + AC-verbatim hint.
    - **SK_52_RUN_2**: `runNext({argv: ["--skip", "dev-story", "--resume"]})` routes through; argv extension threads `--skip-step <step>` to verify-and-advance.ts (assert via dispatch-action JSON inspection).
    - **SK_52_RUN_3**: `runNext({argv: ["--skip", ""]})` empty value rejected at runner-tier — validates AR22 hint-on-error.
    - **SK_52_RUN_4**: SK_52_RUN_2 result.exitCode === 0 on the routing path; result.action.action === "dispatch" on the routing path.
    - **SK_52_RUN_5**: The exit-2 hint matches the AR22 regex `/^.*(Run|See|Try|Check) /` — assert via regex test on `result.action.message`.
    - **SK_52_RUN_6**: `runNext({argv: ["--skip", "dev-story", "--dry-run"]})` produces a report-mode output describing the planned skip operation (forward-tracker for OQ-9 — defer to Story 5.x or Story 6.x).

- [x] **Task 12 — Wire skip path into `src/commands/next/verify-and-advance.ts` (AC: 1)**
  - [x] 12.1 IDENTIFY the success-path state mutation site (Story 2.6 lines ~848-879). The skip path mirrors this site but with `skipped: true` on the runHistory entry and NO verifier invocation NO promotion.
  - [x] 12.2 EXTEND `RunVerifyAndAdvanceOptions` with one new optional field:
    ```typescript
    /** Story 5.2: skip-step value (test-injection seam; production
     * threads via the new positional flag --skip-step <step>). When
     * supplied, the runner enters the skip path BEFORE the dispatch-
     * spec read + verifier invocation. */
    readonly skipStep?: string;
    ```
  - [x] 12.3 EXTEND `parseVerifyAndAdvanceArgs` (or the equivalent argv parser) with the `--skip-step <value>` positional flag. Mirror the Story 3.1 `--last-attempted-json` parsing pattern.
  - [x] 12.4 ADD the NEW skip path INSIDE `runVerifyAndAdvance`. Pseudocode:
    ```typescript
    if (args.skipStep !== undefined || opts?.skipStep !== undefined) {
      const skipStep = args.skipStep ?? opts?.skipStep;
      // Step S1: acquire lock (mirror Step 2 of success path).
      handle = await acquire(opts?.lockOptions);
      // Step S2: read state via loadStateUnlocked (mirror Step 3).
      stateBefore = await loadStateUnlocked({ statePath: opts?.statePath });
      // Step S3: assert state.lastAttempted.step === args.skipStep
      // (per AC line 1075). Throw ConfigError on mismatch (per OQ-6).
      if (stateBefore.lastAttempted === null || stateBefore.lastAttempted === undefined) {
        throw new ConfigError(
          `--skip ${skipStep} requires state.lastAttempted to be populated`,
          undefined,
          `Run /bmad-next without --skip first to populate state.lastAttempted, then retry --skip ${skipStep} --resume.`,
        );
      }
      if (stateBefore.lastAttempted.step !== skipStep) {
        throw new ConfigError(
          `--skip ${skipStep} mismatched state.lastAttempted.step (${stateBefore.lastAttempted.step})`,
          undefined,
          `Check state.lastAttempted.step (${stateBefore.lastAttempted.step}) and re-invoke /bmad-next --skip ${stateBefore.lastAttempted.step} --resume.`,
        );
      }
      // Step S4: idempotency check per OQ-7. If state.runHistory has an
      // entry for this step with skipped=true AND it matches the
      // currently-attempted step, throw ConfigError.
      const lastEntry = stateBefore.runHistory[stateBefore.runHistory.length - 1];
      if (lastEntry?.step === skipStep && lastEntry?.skipped === true) {
        throw new ConfigError(
          `step ${skipStep} is already skipped`,
          undefined,
          `Check state.runHistory and run /bmad-next without --skip to continue.`,
        );
      }
      // Step S5: compute next step in topological order via DAG resolver.
      const dag = opts?.dag ?? (await build({skillNames: opts?.skillNames ?? []}));
      const nextStep = pickNextStep(dag, stateBefore, undefined /* phase filter */);
      if (nextStep === null) {
        // Edge case: no next step (epic complete).
        // Set lastSuccessfulStep to a synthetic terminal value or
        // gracefully advance to "no-next-step" state.
        // v0.1: fall through to a saveState that marks lastSuccessfulStep
        // as the just-skipped step (no advancement); user re-invokes
        // /bmad-next without --skip to halt cleanly.
      }
      // Step S6: construct the new runHistory entry with skipped=true.
      const nowIso = opts?.nowIso ?? new Date().toISOString();
      const skipEntry: RunHistoryEntry = {
        runId: args.runId ?? "skip-runId",
        step: skipStep,
        epic: stateBefore.lastAttempted.epic,
        story: stateBefore.lastAttempted.story,
        attemptNumber: 1,
        outcome: "pass",
        failureCode: null,
        completedAt: nowIso,
        skipped: true, // Story 5.2 NEW marker
      };
      // Step S7: construct stateAfter with three mutations.
      stateAfter = {
        ...stateBefore,
        lastSuccessfulStep: nextStep ? {
          step: nextStep.step,
          epic: nextStep.epic,
          story: nextStep.story,
          completedAt: nowIso,
        } : stateBefore.lastSuccessfulStep,
        lastAttempted: null, // AC line 1077
        lastFailureReason: null, // implicit per success-path precedent
        runHistory: trimRunHistory([...(stateBefore.runHistory ?? []), skipEntry]),
        // checkpoints UNCHANGED — skip does not trigger checkpoint append
      };
      // Step S8: save state under held lock.
      await saveState(stateAfter, handle, { statePath: opts?.statePath });
      // Step S9: compose AR9 success line.
      actionResult = {
        action: "report",
        message: `↷ ${skipStep} → SKIPPED (next: ${nextStep?.step ?? "epic complete"})`,
        exitCode: 0,
      };
      exitCode = 0;
      // Step S10: write per-step transcript (best-effort) via writeStepTranscript.
      // Step S11: release lock in finally.
      return { exitCode, action: actionResult, transcriptPaths, promotedTo: null };
    }
    ```
  - [x] 12.5 ENSURE the skip branch ENTERS the runVerifyAndAdvance try-block early — BEFORE the dispatch-spec read (Step 4 of success path) and BEFORE the verifier invocation (Step 6 of success path). The lock-acquire happens normally per AR8 (Step S1 mirrors Step 2 of success path).
  - [x] 12.6 ENSURE the skip path SHARES the same finally discipline (AR25 + AR26) as the success path — lock release in finally; per-step transcript write best-effort.
  - [x] 12.7 ENSURE the AR9 emission shape on skip is a single line (per AR9); the exit code is 0 on success.
  - [x] 12.8 ENSURE the skip-path saveState is the ONLY write in the skip branch (per Story 4.8 §I-1 atomic-write contract).
  - [x] 12.9 ENSURE the per-step transcript write captures the skip operation (FR43 + FR44) with a clear "SKIPPED" indicator in the markdown transcript.

- [x] **Task 13 — Add tests for skip path in `src/commands/next/verify-and-advance.test.ts` (AC: 1)**
  - [x] 13.1 ADD ~6-10 new tests covering:
    - **SK_52_VA_1**: skip path with matched lastAttempted.step → state mutates correctly: runHistory entry with skipped=true + lastSuccessfulStep advances + lastAttempted clears. Assert via reading state after the skip operation.
    - **SK_52_VA_2**: skip path with mismatched lastAttempted.step → ConfigError thrown with mismatch hint.
    - **SK_52_VA_3**: skip path with null lastAttempted → ConfigError thrown — OQ-4 decision.
    - **SK_52_VA_4**: skip path advances lastSuccessfulStep to NEXT step via DAG resolver — assert pickNextStep called with the correct DAG injection.
    - **SK_52_VA_5**: skip-path saveState is atomic — write happens once per skip operation; no .bak rotation issue.
    - **SK_52_VA_6**: idempotent re-skip behavior per OQ-7 — second invocation of --skip on already-skipped step → ConfigError "step is already skipped".
    - **SK_52_VA_7**: skip-path AR9 emission shape — single line, exit code 0, message includes the skipped step name + next step name.
    - **SK_52_VA_8**: SIGINT mid-skip-state-write — the in-flight saveState either fully completes OR not at all per Story 1.3 atomic tmp+rename; cooperation per Story 4.9 §I-2 forward-tracker. Assert via mock signal injection.
    - **SK_52_VA_9**: skip path does NOT invoke verifier — assert verifierOverride NOT called when skipStep is set.
    - **SK_52_VA_10**: skip path does NOT trigger checkpoint append per Story 4.8 — the just-skipped step did not successfully complete; checkpoints[] stays unchanged.

- [x] **Task 14 — Update `commands/bmad-next.md` and `commands/bmad-loop.md` (AC: all)**
  - [x] 14.1 ADD a NEW sub-section in `commands/bmad-next.md` titled `### --skip flag (Story 5.2 — Epic 5 skip mode)` covering:
    - The user invocation pattern `/bmad-next --skip <step> --resume`.
    - The AC-mandated co-required relationship with --resume (--skip alone → exit 2 + AC-verbatim hint).
    - The matched-step precondition (state.lastAttempted.step must match args.skip).
    - The state mutation semantic (runHistory[].skipped: true + lastSuccessfulStep advance + lastAttempted clear).
    - The no-verifier-no-promotion behavior (skip is state-mutation-only).
    - The SIGINT cooperation (via the existing saveState atomic-write contract).
    - The idempotency caveat per OQ-7 (re-skip on already-skipped step throws ConfigError).
    - The telemetry forward-tracker (skipped: true entries are the future telemetry source per Story 6.6/6.7).
  - [x] 14.2 UPDATE the `commands/bmad-next.md` Usage examples block (currently 8 examples) to ADD `/bmad-next --skip <step> --resume` as the 9th example.
  - [x] 14.3 UPDATE the `commands/bmad-next.md` argumentHint frontmatter to include `--skip <step>`:
    ```yaml
    argumentHint: "[--doctor | --upgrade | --resume | --dry-run | --skip <step> | ...]"
    ```
  - [x] 14.4 UPDATE the trailing FR cross-reference paragraph in `commands/bmad-next.md` to add FR28 + FR32.
  - [x] 14.5 ADD a brief NOTE in `commands/bmad-loop.md` §Behavior section (or in a new §Failure-UX modes — skip (Story 5.2) sub-section) clarifying that --skip is a /bmad-next-only flag (NOT a /bmad-loop flag); /bmad-loop continues to halt on verifier failure per the existing failure-policy resolution. Story 5.6 will wire per-step skip policy auto-resolution.
  - [x] 14.6 UPDATE the `commands/bmad-loop.md` trailing FR cross-reference to add FR28.

- [x] **Task 15 — Run full test suite + quality gates (AC: all)**
  - [x] 15.1 Run `bun test src/failure-ux/` and confirm all new tests pass (target: ~30 tests across index.test.ts + retry.test.ts + skip.test.ts).
  - [x] 15.2 Run `bun test src/schemas/state.test.ts` and confirm new SK_52_RHS_* tests pass + existing tests still pass.
  - [x] 15.3 Run `bun test src/commands/next/args.test.ts` and confirm new SK_52_ARGS_* tests pass + existing tests still pass.
  - [x] 15.4 Run `bun test src/commands/next/run.test.ts` and confirm new SK_52_RUN_* tests pass + existing tests still pass.
  - [x] 15.5 Run `bun test src/commands/next/verify-and-advance.test.ts` and confirm new SK_52_VA_* tests pass + existing tests still pass.
  - [x] 15.6 Run `bun test src/errors.test.ts` and confirm registry grew to 17 codes (10 pass / 0 fail / ~210+ expects per the new code addition).
  - [x] 15.7 Run `bun test` (full suite) and record final counts (target: +30-50 tests, +60-100 expects vs Story 5.1 baseline 1074/0/3827).
  - [x] 15.8 Run `bunx tsc --noEmit` and confirm 0 errors.
  - [x] 15.9 Run `bunx --bun biome ci .` and confirm 0 errors (run `biome --write .` first if formatting issues).

- [x] **Task 16 — Self-check + Senior Developer Review prep (AC: all)**
  - [x] 16.1 Verify ALL task checkboxes ticked via `grep -c "^- \[ \]\|^  - \[ \]\|^    - \[ \]"` → 0 in this story file.
  - [x] 16.2 Verify File List populated with all source modifications (NEW: skip.ts + skip.test.ts; MOD: errors.ts + errors.test.ts + state.ts + state.test.ts + failure-ux/index.ts + failure-ux/index.test.ts + commands/next/args.ts + commands/next/args.test.ts + commands/next/run.ts + commands/next/run.test.ts + commands/next/verify-and-advance.ts + commands/next/verify-and-advance.test.ts + commands/bmad-next.md + commands/bmad-loop.md).
  - [x] 16.3 Verify Dev Agent Record sections populated (Context Reference + Agent Model Used + Debug Log References + Completion Notes List + File List + Deviations + Repairs).
  - [x] 16.4 Verify Change Log appended with the 2026-05-04 entry.
  - [x] 16.5 Update sprint-status: 5-2-skip-failure-mode-skip-flag `ready-for-dev → review` (after dev complete); → done (after code-review).
  - [x] 16.6 Update state.yaml workflow block on dev complete: `lastStep=bmad-dev-story; lastStepCompletedAt=<dev-end-ts>; nextStep=bmad-code-review; nextStepStory='5.2'; nextStepKey=5-2-skip-failure-mode-skip-flag (UNCHANGED)`.

- [x] **Task 17 — Sprint-status + state.yaml updates on completion (AC: all)**
  - [x] 17.1 Sprint-status update on dev complete: 5-2-skip-failure-mode-skip-flag `ready-for-dev → review`; bump last_updated.
  - [x] 17.2 Sprint-status update on code-review complete: 5-2-skip-failure-mode-skip-flag `review → done`; bump last_updated.
  - [x] 17.3 State.yaml workflow advance on code-review complete: `lastStep=bmad-code-review; lastStepCompletedAt=<review-end-ts>; nextStep=bmad-create-story; nextStepStory='5.3'; nextStepKey=5-3-route-to-fixer-mode-auto-fix-flag`.

## Inputs Read

The following inputs were read by the create-story dev iter:

- `_bmad-output/planning-artifacts/epics.md` (lines 1067-1082 for AC verbatim — Story 5.2; lines 1047-1149 for Epic 5 context: 5.1 retry, 5.3 route-to-fixer, 5.4 escalate, 5.5 interactive, 5.6 per-step config)
- `_bmad-output/planning-artifacts/prd.md` (line 707 for FR28 verbatim; line 780 for NFR-R8; lines 706-712 for FR27-33 failure-handling; line 731 for FR46)
- `_bmad-output/planning-artifacts/architecture.md` (lines 492-499 failure-UX modes; lines 1182-1188 failure-ux module group; line 1358 FR28 mapping; lines 770 runHistory[] cap; line 1409 NFR-R8 integration test path)
- `_bmad-output/implementation-artifacts/5-1-retry-failure-mode.md` (KEY PREDECESSOR — full read; especially SDR forward-trackers I-1/I-2/I-3/I-4/I-5/I-6/I-7/I-8; nits N-1/N-2/N-3/N-4/N-5; OQ-1 retry-exhausted DEFERRED; OQ-8 production retry-dispatch DEFERRED)
- `_bmad-output/implementation-artifacts/4-10-loop-exit-reason-resume-hint.md` (formatLoopExitLines surface — Story 5.2 does NOT modify; --skip is /bmad-next-only)
- `_bmad-output/implementation-artifacts/4-9-sigint-graceful-exit.md` (SIGINT cooperation patterns; §I-2 forward-tracker mandating SIGINT-mid-failure-UX testing)
- `_bmad-output/implementation-artifacts/4-8-checkpoint-each-step-type.md` (atomic-write contract; CheckpointEntrySchema schema-tightening precedent for RunHistoryEntrySchema field addition)
- `_bmad-output/implementation-artifacts/3-2-resume-flag.md` (--resume on /bmad-next; AC line 1076 mandates `/bmad-next --skip <step> --resume` co-required)
- `_bmad-output/implementation-artifacts/3-1-record-last-attempted-last-failure-reason-on-halt.md` (state.lastAttempted canonical surface — AC line 1075 mandates `state.yaml.lastAttempted.step` matches the skipped step)
- `_bmad-output/implementation-artifacts/2-6-verify-and-advance-ts-with-state-hash-check.md` (verify-and-advance.ts state mutation site — Story 5.2 mirrors success path with skipped:true marker)
- `_bmad-output/implementation-artifacts/2-4-lock-free-run-ts-for-bmad-next.md` (lock-free runNext dispatch pattern — Story 5.2 args parsing site)
- `_bmad-output/implementation-artifacts/1-7-cli-argument-parser.md` (NextArgsSchema 18-field surface; cross-validation gap closure pattern — Story 5.2 extends to 19 fields)
- `_bmad-output/implementation-artifacts/epic-4-retrospective.md` (Recommendations for Epic 5 — 8 items; Story 5.1 recommended NO new error classes; Story 5.2 deviates per OQ-1 with AC-verbatim hint justification)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (current state; epic-5 in-progress; 5-2 backlog; Story 5.1 done)
- `.bmad-stepper/state.yaml` (workflow block; evidenceIndex pattern; lastStep=bmad-code-review; nextStepStory='5.2')
- `src/commands/next/args.ts` (NextArgsSchema 18-field surface; kebab-to-camel mapper)
- `src/commands/next/run.ts` (RunNextOptions surface; cross-validation gap closure for --include-optional + --no-optional at run.ts:336-372 — Story 5.2 mirrors)
- `src/commands/next/verify-and-advance.ts` (success-path state mutation site — Story 5.2 mirrors with skipped:true marker; RunVerifyAndAdvanceOptions surface)
- `src/commands/loop/run.ts` (loop runner — Story 5.2 does NOT modify; --skip is /bmad-next-only)
- `src/state/save.ts` (saveState atomic-write — RIDDEN unchanged)
- `src/state/load.ts` (loadStateUnlocked)
- `src/schemas/state.ts` (StateV1Schema; LastAttemptedSchema; LastFailureReasonSchema; CheckpointEntrySchema; RunHistoryEntrySchema lines 190-216 — Story 5.2 extends with `skipped: boolean` optional field)
- `src/schemas/state.test.ts` (existing test patterns for schema validation)
- `src/errors.ts` (16-class registry; SkipRequiresResumeError NEW per OQ-1 → 17)
- `src/errors.test.ts` (REQUIRED_CODES list — extends with SKIP_REQUIRES_RESUME)
- `src/failure-ux/index.ts` (Story 5.1 surface; dispatchFailureUx v0.1 stubs three handlers — Story 5.2 wires skip)
- `src/failure-ux/retry.ts` (Story 5.1 pure-function precedent — Story 5.2's skip.ts mirrors)
- `src/failure-ux/index.test.ts` (existing RT_51_DISPATCH_3 test — Story 5.2 updates for behaviour change)
- `agents/bmad-step-runner.md` (per-attempt-stateless sub-agent contract — UNCHANGED)
- `commands/bmad-next.md` (Layer 1 markdown protocol — Story 5.2 adds new --skip sub-section)
- `commands/bmad-loop.md` (Layer 1 markdown protocol — Story 5.2 adds brief --skip-is-bmad-next-only note)

## File List

Files this story will create or modify (placeholder for dev-story phase):

**NEW files (2)**:
- `src/failure-ux/skip.ts`
- `src/failure-ux/skip.test.ts`

**MODIFIED files (12)**:
- `src/errors.ts` (NEW SkipRequiresResumeError class; registry 16 → 17)
- `src/errors.test.ts` (REQUIRED_CODES extended with SKIP_REQUIRES_RESUME)
- `src/schemas/state.ts` (RunHistoryEntrySchema extended with `skipped: boolean` optional field)
- `src/schemas/state.test.ts` (validation tests for skipped field — SK_52_RHS_1 through SK_52_RHS_5)
- `src/failure-ux/index.ts` (dispatchFailureUx delegates to skipHandler for `policy === "skip"`; v0.1 stub comment updated)
- `src/failure-ux/index.test.ts` (RT_51_DISPATCH_3 updated for behaviour change; new SK_52_DISPATCH_INDEX test)
- `src/commands/next/args.ts` (NextArgsSchema extended with `skip: z.string().optional()` — 19th flag)
- `src/commands/next/args.test.ts` (SK_52_ARGS_1 through SK_52_ARGS_6)
- `src/commands/next/run.ts` (cross-validation: --skip requires --resume; threading via --skip-step positional flag)
- `src/commands/next/run.test.ts` (SK_52_RUN_1 through SK_52_RUN_6)
- `src/commands/next/verify-and-advance.ts` (skip path: state mutation with skipped:true marker; RunVerifyAndAdvanceOptions extended with skipStep seam; argv parser extended with --skip-step)
- `src/commands/next/verify-and-advance.test.ts` (SK_52_VA_1 through SK_52_VA_10)
- `commands/bmad-next.md` (NEW --skip sub-section + Usage example + argumentHint update + FR cross-reference)
- `commands/bmad-loop.md` (brief --skip-is-bmad-next-only note + FR cross-reference)

**STORY tracking files (3)**:
- `_bmad-output/implementation-artifacts/5-2-skip-failure-mode-skip-flag.md` (THIS FILE)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (5-2 backlog → ready-for-dev; epic-5 stays in-progress)
- `.bmad-stepper/state.yaml` (workflow advance + evidenceIndex append)

**RUN/TASK records (2 NEW for create-story phase)**:
- `.bmad-stepper/runs/2026-05-04T204245Z-bmad-next/run.yaml`
- `.bmad-stepper/runs/2026-05-04T204245Z-bmad-next/tasks/t1-create-story.yaml`

## Outputs Declared

The dev-story phase will produce these outputs (in addition to ticking task checkboxes and populating Dev Agent Record sections):

- 2 NEW source/test files in `src/failure-ux/` (skip.ts + skip.test.ts; ~+130-210 net source lines)
- 1 NEW Zod field on RunHistoryEntrySchema (`skipped: z.boolean().optional()`)
- 1 NEW error class (SkipRequiresResumeError; registry 16 → 17)
- 1 NEW string-valued flag on NextArgsSchema (`--skip <step>`; the 19th flag)
- ~30-50 new tests across the new + modified test files
- ZERO new files in `src/commands/` (the skip path wraps existing surfaces)
- ZERO new /bmad-loop CLI flags (Story 5.2 is /bmad-next-only)
- ZERO new StopReason variants (skip is per-step state mutation, not loop stop condition)

## Test Strategy

| Test ID            | Description                                                                                                  | AC Linkage |
| ------------------ | ------------------------------------------------------------------------------------------------------------ | ---------- |
| SK_52_HANDLER_1    | `skipHandler({attemptNumber: 1, ...})` returns `{outcome: "skip"}`                                            | AC-1       |
| SK_52_HANDLER_2    | `skipHandler({attemptNumber: 5, ...})` returns `{outcome: "skip"}` (independent of attemptNumber)             | AC-1       |
| SK_52_HANDLER_3    | Pure-function check: calling `skipHandler` twice with same input produces same output                         | AC-1       |
| SK_52_HANDLER_4    | `skipHandler` with different `code/message/hint/runId/step` values all return `{outcome: "skip"}`              | AC-1       |
| SK_52_DISPATCH_1   | `dispatchFailureUx(ctx, "skip", {})` delegates to `skipHandler` returning `{outcome: "skip"}`                  | AC-1       |
| SK_52_DISPATCH_2   | TypeScript exhaustiveness verified — switch branch covers `"skip"` as separate case                            | AC-1       |
| SK_52_DISPATCH_3   | `dispatchFailureUx(ctx, "skip", {})` produces NO escalate outcome — verifies regression                       | AC-1       |
| SK_52_RHS_1        | RunHistoryEntrySchema accepts entry with `skipped: true`                                                       | AC-1       |
| SK_52_RHS_2        | RunHistoryEntrySchema accepts entry with `skipped: false`                                                      | AC-1       |
| SK_52_RHS_3        | RunHistoryEntrySchema accepts entry with NO skipped field (undefined) — back-compat                           | AC-1       |
| SK_52_RHS_4        | RunHistoryEntrySchema rejects entry with `skipped: "yes"` (non-boolean)                                        | AC-1       |
| SK_52_RHS_5        | StateV1Schema.runHistory[] with mixed entries (some skipped=true, some without) validates                     | AC-1       |
| SK_52_ARGS_1       | `parseNextArgs(["--skip", "dev-story"])` returns `{skip: "dev-story"}`                                         | AC-2       |
| SK_52_ARGS_2       | `parseNextArgs(["--skip", "dev-story", "--resume"])` returns `{skip: "dev-story", resume: true}`              | AC-2       |
| SK_52_ARGS_3       | `parseNextArgs(["--skip"])` (without value) → ParseError                                                       | AC-2       |
| SK_52_ARGS_4       | `parseNextArgs(["--skip", ""])` empty-string accepted by parser                                               | AC-2       |
| SK_52_ARGS_5       | `parseNextArgs(["--skip=dev-story"])` (= form) returns `{skip: "dev-story"}`                                   | AC-2       |
| SK_52_ARGS_6       | Unknown flag rejection: `parseNextArgs(["--skip-extra", "dev-story"])` → ParseError                            | AC-2       |
| SK_52_RUN_1        | `runNext({argv: ["--skip", "dev-story"]})` (no --resume) → SkipRequiresResumeError → exit 2 + AC-verbatim hint | AC-2       |
| SK_52_RUN_2        | `runNext({argv: ["--skip", "dev-story", "--resume"]})` routes through; threads --skip-step                     | AC-1       |
| SK_52_RUN_3        | `runNext({argv: ["--skip", ""]})` empty value rejected at runner-tier                                          | AC-2       |
| SK_52_RUN_4        | SK_52_RUN_2 result.exitCode === 0 on routing path; result.action.action === "dispatch"                         | AC-1       |
| SK_52_RUN_5        | The exit-2 hint matches the AR22 regex `/^.*(Run|See|Try|Check) /`                                              | AC-2       |
| SK_52_RUN_6        | `runNext({argv: ["--skip", "dev-story", "--dry-run"]})` produces a report-mode output                           | AC-2       |
| SK_52_VA_1         | skip path with matched lastAttempted.step → state mutates: runHistory entry skipped=true + lastSuccessfulStep advances + lastAttempted clears | AC-1       |
| SK_52_VA_2         | skip path with mismatched lastAttempted.step → ConfigError thrown                                              | AC-1       |
| SK_52_VA_3         | skip path with null lastAttempted → ConfigError thrown                                                         | AC-1       |
| SK_52_VA_4         | skip path advances lastSuccessfulStep to NEXT step via DAG resolver — assert pickNextStep called               | AC-1       |
| SK_52_VA_5         | skip-path saveState is atomic — write happens once per skip operation                                          | AC-1       |
| SK_52_VA_6         | idempotent re-skip behavior — second invocation on already-skipped step → ConfigError                          | AC-1       |
| SK_52_VA_7         | skip-path AR9 emission shape — single line, exit code 0                                                        | AC-1       |
| SK_52_VA_8         | SIGINT mid-skip-state-write — atomic tmp+rename guarantees no partial writes                                   | AC-1       |
| SK_52_VA_9         | skip path does NOT invoke verifier — assert verifierOverride NOT called                                        | AC-1       |
| SK_52_VA_10        | skip path does NOT trigger checkpoint append per Story 4.8 — checkpoints[] unchanged                            | AC-1       |

## Open Questions for Code Review

- **OQ-1 (NEW SkipRequiresResumeError class vs reuse existing)**: should Story 5.2 ADD a new error class `SkipRequiresResumeError` (registry 16 → 17), OR reuse `ConfigError` with a hintOverride (Story 1.10 + Story 1.11 hintOverride pattern), OR reuse `PathologicalInputError` (which has exit code 5, NOT 2 — so this option is rejected outright since the AC mandates exit 2)? **DECISION ADD NEW**: The AC line 1080 mandates a verbatim hint string `--skip requires --resume to advance state. Run /bmad-next --skip <step> --resume.` that is NOT byte-identical to any existing error class's actionableHint. Reusing ConfigError with a hintOverride works mechanically but feels like cargo-culting an escape hatch (Story 1.10 + Story 1.11 introduced the hintOverride pattern for ONE-OFF cases; growing it to a third class without strong justification dilutes the abstraction). The cleanest path is a NEW class with `exitCode = 2` + the AC-verbatim `actionableHint` baked in. The registry CI gate (Story 1.2) accommodates the 17th class trivially via REQUIRED_CODES list extension. Note: Story 5.1 INTENTIONALLY did NOT add new error classes per epic-4-retro Recommendations item 3 ("Epic 5 should NOT add new error classes — registry stability discipline established across Epics 2/3/4"). Story 5.2 INTENTIONALLY DEVIATES from that recommendation for the AC-verbatim hint reason. Forward-tracker for code review: confirm this deviation is justified OR REJECT and demand the hintOverride approach.

- **OQ-2 (`runHistory[].skipped` field nullable vs required-with-default-false)**: should the new `skipped` field on RunHistoryEntrySchema be (a) `z.boolean()` (required, every entry must declare); (b) `z.boolean().default(false)` (defaults to false; existing entries are coerced to false on read); (c) `z.boolean().optional()` (optional; undefined-means-false; no migration burden); (d) `z.boolean().nullable().optional()` (allows explicit null OR undefined OR true OR false)? **DECISION OPTION C OPTIONAL**: undefined-means-false is the simplest semantic; existing state.yaml files with non-skip runHistory entries continue to validate cleanly without migration; readers check `entry.skipped === true` (strict equality) to avoid the nullable-undefined ambiguity. Mirrors the Story 5.1 D1 dual-shape pattern (6 legacy fields preserved as OPTIONAL for back-compat).

- **OQ-3 (lastSuccessfulStep advance semantic when DAG forks)**: when the skipped step has multiple downstream successors (the DAG has a fork), what determines "the next step in topological order" per AC line 1077? Options: (a) follow the existing pickNextStep helper (Story 2.4) which uses phase-order tiebreak + Map insertion-order tiebreak per Story 1.10's deterministic invariant; (b) introduce a new `pickNextStepAfterSkip(dag, state, skippedStep)` helper that explicitly picks the first successor; (c) enumerate ALL successors and let the user pick via a follow-up flag. **DECISION OPTION A FOLLOW EXISTING**: the existing pickNextStep tiebreak is deterministic + already used by the success path; reusing it for skip preserves the "skip behaves like success" semantic. Forward-tracker for Story 6.x: explicit user override via `--skip-and-pick <next-step>` extension if the DAG fork case proves common.

- **OQ-4 (--skip without state.lastAttempted populated)**: when the user invokes `/bmad-next --skip <step> --resume` but `state.lastAttempted === null` (no recorded last-attempt), what should happen? Options: (a) throw an error with a clear hint pointing the user at `/bmad-next` first; (b) treat the skip as advancing from `lastSuccessfulStep` directly (skip the FIRST candidate next-step); (c) silently no-op. **DECISION OPTION A THROW**: option B is dangerous (the user did NOT specify a step to skip past lastSuccessfulStep — silently skipping the first candidate is unexpected); option C masks user intent. Throw `ConfigError` with hint `Run /bmad-next without --skip first to populate state.lastAttempted, then retry --skip <step> --resume.` Reuses ConfigError per OQ-1 decision (only the AC-mandated exit-2 hint gets a new class).

- **OQ-5 (Telemetry skip-event payload shape)**: per AC line 1081 (Epic 6 dependency), what shape should the telemetry skip-event payload take when Story 6.6 wires telemetry collection? Options: (a) the runHistory[] entry itself with `skipped: true` IS the telemetry data source — Story 6.6 iterates runHistory[] filtered by `skipped === true`; (b) a separate `state.telemetry.skipEvents[]` array; (c) write per-skip-event JSONL records to `_bmad-output/.stepper/telemetry/<period>.jsonl`. **DECISION OPTION A RUNHISTORY-AS-SOURCE**: mirrors Story 5.1 OQ-10 decision (telemetry consumes runHistory directly per Story 6.6/6.7); keeps the skip path SIMPLE in v0.1 (one write site — saveState — for both state mutation AND the future telemetry source). Story 6.7 aggregation iterates runHistory[] for skip-event counts per step. Forward-tracker for Story 6.6.

- **OQ-6 (--skip <step> mismatch with state.lastAttempted.step)**: when the user invokes `/bmad-next --skip <step> --resume` but the supplied step does NOT match `state.lastAttempted.step`, what should happen? Options: (a) throw an error with a clear mismatch message; (b) accept the skip and apply it to whatever step matches in runHistory[]; (c) treat the skip as a "future skip" that fires if-and-when the supplied step is attempted. **DECISION OPTION A THROW**: option B is dangerous (the user may have typo'd the step name; silently applying to a different step masks the typo); option C is too clever for v0.1. Throw `ConfigError` with hint `Check state.lastAttempted.step (<actual>) and re-invoke /bmad-next --skip <actual> --resume.` Reuses ConfigError per OQ-1 decision.

- **OQ-7 (Idempotent re-skip — --skip applied twice on already-skipped step)**: when the user invokes `/bmad-next --skip <step> --resume` AGAIN on a step that has ALREADY been skipped (the most-recent runHistory entry for that step has `skipped: true`), what should happen? Options: (a) throw an error ("step is already skipped"); (b) no-op (treat as already-applied); (c) re-apply the skip (append a duplicate entry). **DECISION OPTION A THROW**: option B masks user confusion (the user may not realize the skip has already happened and may be expecting a different behavior); option C creates duplicate forensic records. Throw `ConfigError` with hint `Check state.runHistory and run /bmad-next without --skip to continue.` Reuses ConfigError per OQ-1 decision.

- **OQ-8 (Lock-held vs lock-free skip handler placement)**: should the skip path live at the LOCK-HELD mid-tier `verify-and-advance.ts` (mirror Story 5.1 retry placement per OQ-5) OR at the lock-free top-tier `runNext` in `src/commands/next/run.ts`? **DECISION VERIFY-AND-ADVANCE.TS MID-TIER**: (a) the skip path mutates the SAME three state fields as the success path (lastSuccessfulStep + lastAttempted + runHistory[]); (b) the lock-acquire/release pattern is the SAME (one acquire at top, release in finally per AR8); (c) the atomic-write contract via saveState is the SAME (one write per skip operation per AR13 Layer 2 + Story 4.8 §I-1 forward-tracker); (d) reusing the existing scope minimizes new code and avoids cross-module boundary invention. Trade-off: this requires verify-and-advance.ts argv parsing extension (--skip-step positional flag) + RunVerifyAndAdvanceOptions extension. Acceptable per Story 5.1 + Story 4.8 precedent.

- **OQ-9 (--skip + --dry-run interaction)**: when the user invokes `/bmad-next --skip <step> --resume --dry-run`, what should happen? Options: (a) print a report-mode preview of the planned skip (the new lastSuccessfulStep, the matched runHistory entry) without mutating state; (b) reject the combination with an error; (c) ignore --dry-run and apply the skip anyway. **DECISION OPTION A REPORT**: --dry-run is the canonical preview flag (Story 3.3); --skip + --dry-run is a sensible combination (the user wants to preview the planned advance before committing). The runner emits action: "report" with the planned next step + the runHistory entry that would be appended. Forward-tracker for v0.1 implementation: if the report-mode requires significant new code, defer to Story 5.x or Story 6.x with v0.1 falling back to option B "rejected combination" with a clear hint.

- **OQ-10 (--skip step-id format validation)**: should the runner validate that `args.skip` matches a known step in the DAG (rejecting typos)? Options: (a) validate at runner-tier — runtime DAG lookup before threading to verify-and-advance.ts; (b) defer validation to verify-and-advance.ts (where the DAG is loaded for pickNextStep); (c) skip validation entirely — let the mismatch with state.lastAttempted.step (per OQ-6) catch the typo. **DECISION OPTION C SKIP**: the OQ-6 mismatch check catches the common case (user typo'd the step name); explicit DAG validation adds complexity without clear benefit (the user MUST know the failed step name from the prior halt's lastAttempted; the OQ-6 hint surfaces the actual lastAttempted.step value for correction). Forward-tracker for Story 6.x: explicit DAG validation if the OQ-6 mismatch case proves insufficient.

## Forward Action Items From Predecessors

Story 5.2 INHERITS the following forward-trackers from Story 5.1 + Epic 4 (per Story 5.1 SDR §Forward-trackers and §Recommendations for Epic 5 + epic-4-retrospective.md §Recommendations for Epic 5):

- **From Story 5.1 SDR N-5 (line 1005)**: dispatchFailureUx v0.1 stub silent-escalate for skip/route-to-fixer/escalate. **Honoured** by Story 5.2 REMOVING `"skip"` from the v0.1 stub branch and routing to the formal `skipHandler` from `src/failure-ux/skip.ts`. Updates the v0.1 stub comment to reflect the two remaining handlers (route-to-fixer + escalate) until Stories 5.3 + 5.4 land.

- **From Story 5.1 SDR §I-3 (line 1010)**: SIGINT during --skip advance may need additional coordination — Story 5.1's retry-mode SIGINT cooperation is the precedent; Stories 5.2/5.3/5.5 should mirror the `shutdownRequested` poll pattern. **Honoured** by Story 5.2 ADDING SK_52_VA_8 test asserting SIGINT mid-skip-state-write halts cleanly. Note: skip is fundamentally simpler than retry (NO multi-attempt loop); the existing atomic-write contract via Story 1.3 atomic tmp+rename guarantees no partial writes per NFR-S5. The `shutdownRequested` poll pattern is NOT applicable to skip (no loop to short-circuit).

- **From Story 5.1 SDR §I-4 (line 1011)**: production retry-dispatch mechanism gap (recursive Task tool invocation deferred to Story 6.x Layer 1 protocol coordination). Story 5.2 has NO retry-dispatch dependency — the skip path is a state-mutation-only path; no sub-agent re-dispatch needed. Story 5.2 leaves the I-4 forward-tracker UNCHANGED for Story 5.3 (--auto-fix) which has similar re-dispatch needs.

- **From Story 5.1 SDR §I-5 (line 1012)**: D1 dual-shape consolidation (6 legacy optional fields coexist with 8 new typed required fields on RunHistoryEntrySchema). **Honoured** by Story 5.2 ADDING ONE more OPTIONAL field `skipped: boolean` rather than introducing a third dual-shape — same OPTIONAL pattern as the legacy fields per back-compat discipline.

- **From Story 5.1 SDR §I-7 (line 1014)**: telemetry consumption (Story 6.6/6.7) will iterate state.runHistory[] filtered by attemptNumber > 1 for retry counts per step. Story 5.2 ADDS the parallel `skipped === true` filter for skip-event counts per step. The runHistory[] cap of 100 means telemetry may need to read run-log JSON files for longer history (Story 2.5 surface).

- **From Story 5.1 OQ-1 (NEW StopReason variant retry-exhausted)**: DEFERRED. Story 5.2 does NOT introduce a new StopReason variant for skip (skip is /bmad-next-only; not a /bmad-loop stop condition). The 10-variant StopReason union stays at 10. Story 5.4 escalate-handler may revisit per the OQ-1 forward-tracker.

- **From Story 5.1 OQ-8 (production retry-dispatch mechanism)**: DEFERRED to Story 6.x Layer 1 retry coordination. Story 5.2 is unaffected (skip has no re-dispatch dependency).

- **From epic-4-retrospective.md §Recommendations for Epic 5 item 1 (line 269)**: failure modes MUST consume `formatLoopExitLines(stopReason, state)`. **Honoured** by Story 5.2 NOT introducing a new StopReason variant; the SkipRequiresResumeError exit flows through the /bmad-next AR9 halt emission (NOT through formatLoopExitLines because --skip is /bmad-next-only).

- **From epic-4-retrospective.md §Recommendations item 2 (line 271)**: per-step `failurePolicies` config (Story 5.6) integration. Story 5.2 ADDS the `skipHandler` to the dispatchFailureUx surface; Story 5.6 will wire the config-resolved `"skip"` policy lookup to invoke skipHandler automatically for verifier failures (in addition to the user-invoked --skip flag path).

- **From epic-4-retrospective.md §Recommendations item 3 (line 273)**: Epic 5 should NOT add new error classes. Story 5.2 INTENTIONALLY DEVIATES from this recommendation per OQ-1 — adds SkipRequiresResumeError because the AC-verbatim hint string mandate justifies the dedicated class. Registry grows from 16 to 17.

- **From epic-4-retrospective.md §Recommendations item 4 (line 275)**: each Story 5.x flow MUST be tested with SIGINT-mid-flight. **Honoured** by Story 5.2 ADDING SK_52_VA_8 test.

- **From Story 4.10 SDR §I-2 (forward-tracker)**: Story 5.x failure-UX modes interaction with SIGINT. **Honoured** by Story 5.2 SK_52_VA_8 test.

- **From Story 4.9 SDR §I-2 (forward-tracker line 866)**: SIGINT during --skip advance may need additional coordination. **Honoured** by Story 5.2 SK_52_VA_8 test (the skip-path saveState is atomic — no special SIGINT coordination needed beyond the existing atomic-write contract).

- **From Story 4.8 SDR §I-1 (forward-tracker line 972 + 981)**: verify-and-advance.ts atomic-write contract guarantees all-or-nothing. **Honoured** by Story 5.2 RIDING the existing atomic-write contract — the skip-path runHistory + lastSuccessfulStep + lastAttempted mutations all flow through ONE saveState() call, atomic per AR13 Layer 2.

- **Inherited cosmetic nits N-1/N-2/N-3/N-4** (from Stories 4.2-4.10 + Story 5.1): defensive null check at stop-conditions.ts:269; EMPTY_DAG + EMPTY_STATE sentinels mid-file placement; future task-record snapshot timing; TWO unused LoopOpts seams declared but never consumed. Story 5.2 INHERITS ALL FOUR unchanged — does NOT modify `stop-conditions.ts`, does NOT relocate the sentinels, does NOT touch the unused seams.

- **Inherited Story 5.1 N-5 nit (NEW)**: dispatchFailureUx v0.1 stub silent-escalate for skip/route-to-fixer/escalate. Story 5.2 RESOLVES the `"skip"` portion of N-5 by wiring the formal skipHandler. Stories 5.3 + 5.4 will resolve the remaining `"route-to-fixer"` + `"escalate"` portions.

Story 5.2 PRODUCES the following forward-trackers for downstream stories:

- **To Story 5.3 (Route-to-Fixer Mode + `--auto-fix` Flag)**: extend `dispatchFailureUx` to delegate to `routeToFixerHandler` from `src/failure-ux/route-to-fixer.ts` for `policy === "route-to-fixer"`. The route-to-fixer outcome shape `{outcome: "route-to-fixer", fixerRunId}` is already declared in the FailureUxOutcome union by Story 5.1; Story 5.3 wires the handler implementation. Story 5.3 ADDS ZERO new error classes if reusing existing classes (TimeoutError/VerifierFailureError) is sufficient.

- **To Story 5.4 (Escalate Failure Mode)**: extend `dispatchFailureUx` to delegate to a formal `escalateHandler` from `src/failure-ux/escalate.ts` for `policy === "escalate"`. Story 5.4 REPLACES the v0.1 inline VerifierFailureError throw at the retry-loop's escalate branch (Story 5.1) with the formal handler. Story 5.4 may revisit Story 5.1 OQ-1 (NEW StopReason variant retry-exhausted) and Story 5.2 OQ-1 (NEW SkipRequiresResumeError) decisions as part of the formal escalate-handler design.

- **To Story 5.5 (`--interactive` Pause Between Steps)**: SIGINT cooperation pattern (Story 5.1 RT_51_VA_8 + RT_51_LOOP_5; Story 5.2 SK_52_VA_8) is the precedent for Story 5.5's interactive-pause cooperation per Story 4.9 §I-2.

- **To Story 5.6 (Per-Step Failure Policy via Config + Actionable Errors)**: wire the `failurePolicies:` config block to `resolveFailurePolicy` (Story 5.1 ships the resolver skeleton; Story 5.6 wires the actual config-loading from `bmad-stepper.config.yaml`). Story 5.6 will EXTEND the config-resolved policy lookup to invoke skipHandler automatically for verifier failures when `failurePolicies: { dev-story: skip }` is configured (in addition to the user-invoked --skip flag path landed in Story 5.2). Replace the `LoopOpts.failurePolicyOverride` test-injection seam with the production config-resolved path.

- **To Story 6.6 (Telemetry Opt-In Collection)**: consume `state.runHistory[]` filtered by `skipped === true` to count skip-events per step. Story 5.2's runHistory entries with the new `skipped: boolean` optional field are the future telemetry source.

- **To Story 6.7 (Telemetry Aggregation Report)**: aggregate skip-event counts + skip-step distribution from runHistory[] data alongside the Story 5.1 retry counts.

- **To Story 6.x (DAG fork tiebreak for skip)**: extend `pickNextStepAfterSkip(dag, state, skippedStep)` if the existing pickNextStep tiebreak proves insufficient for skip-path next-step resolution (OQ-3 forward-tracker).

- **To Story 6.x (--skip + --dry-run report-mode preview)**: implement option A from OQ-9 — the runner emits action: "report" with the planned next step + the runHistory entry that would be appended. v0.1 may fall back to OQ-9 option B "rejected combination" if the report-mode requires significant new code.

- **To Story 6.x (--skip-and-pick <next-step> extension)**: explicit user override for DAG fork case per OQ-3 forward-tracker.

- **To Story 6.x (Explicit DAG step-id validation)**: surface `args.skip` validation against a known step in the DAG before threading to verify-and-advance.ts (per OQ-10 forward-tracker).

- **To Story 6.x (--skip step-id ambiguity resolution)**: handle case where the user supplies an ambiguous step name (e.g., "review" when both "code-review" and "design-review" exist in the DAG); v0.1 relies on exact-match.

## Architectural Constraints

- **AR8 (lock-free top-tier)**: `runNext` (top-tier per AR41) does NOT acquire the lock; the skip path sits at lock-held mid-tier `verify-and-advance.ts` (the same scope that owns the success-path mutation site per Story 2.6). Story 5.2 ADDS ZERO new lock-acquire/release calls in `src/commands/next/run.ts`.

- **AR9 (single AR9 stdout line per command invocation)**: each /bmad-next invocation emits EXACTLY ONE AR9 JSON line (the SkipRequiresResumeError throw produces one halt action; the skip-path success produces one report action). Story 5.2 ADDS ZERO new AR9 emissions.

- **AR21+22 (errors registry held at 16 → 17)**: Story 5.2 GROWS the registry from 16 to 17 codes per OQ-1 decision (intentional deviation from Story 5.1 epic-4-retro Recommendations item 3 — the AC-verbatim hint string mandate justifies the new SkipRequiresResumeError class). The actionableHint matches the AR22 regex `/^.*(Run|See|Try|Check) /` via the trailing "Run /bmad-next --skip <step> --resume." segment.

- **AR33 (no console.* in source)**: the skip path uses `warn`/`error` from `src/io/log.ts` for any per-skip warnings (e.g., re-skip idempotency warning before the throw).

- **AR34 (slash-command markdown protocol)**: extended via `commands/bmad-next.md` (new --skip sub-section + Usage example + argumentHint update) + `commands/bmad-loop.md` (brief --skip-is-bmad-next-only note).

- **AR41 (boundary graph)**: `src/failure-ux/skip.ts` is mid-tier per architecture file-tree (lines 1182-1188); imports flow `src/commands/next/verify-and-advance.ts` (top-tier consumer) → `src/failure-ux/index.ts` (mid-tier dispatcher) → `src/failure-ux/skip.ts` (sibling) + `src/errors.ts` + `src/schemas/state.ts` (foundational). ZERO new cross-tier imports beyond the canonical hierarchy. The new `src/failure-ux/skip.ts` joins `src/failure-ux/retry.ts` (Story 5.1) in the failure-ux mid-tier module group.

- **AR42 (test discipline)**: new colocated tests use the existing `RunVerifyAndAdvanceOptions` test-injection seam pattern (Story 5.2 ADDS `skipStep?: string`); production callers thread via the positional flag.

- **AR20 (type-alias chain)**: NEW types `SkipHandlerOpts` follow the architecture line 719 type-alias chain pattern; the existing `RunHistoryEntry` type alias updates automatically via `z.infer<typeof RunHistoryEntrySchema>` as the schema gains the new optional field.

- **AR25+26 (finally discipline)**: the skip path preserves the existing finally discipline in `verify-and-advance.ts` — lock release happens in the existing finally block AFTER the skip-path saveState completes; per-skip-operation transcript writes via the existing `writeStepTranscript` (Story 2.5) happen in the existing finally block.

- **AR13 (Layer 2 atomic-write contract)**: the skip-path runHistory + lastSuccessfulStep + lastAttempted mutations all flow through ONE saveState() call with `.bak` rotation per AR13. Story 4.8 §I-1 atomic-write contract is RIDDEN unchanged.

## Notes for Developer

- **The skip path is fundamentally simpler than the retry path** (Story 5.1) — there is NO sub-agent dispatch, NO verifier invocation, NO artifact promotion. The skip path is a state-mutation-only path that bypasses the dispatch + verify phases entirely. The lock acquisition + saveState atomic-write is the SAME pattern as the success path.

- **The --skip flag is /bmad-next-only** — /bmad-loop has no --skip flag; the Story 5.2 implementation does NOT modify `src/commands/loop/`. /bmad-loop continues to halt on verifier failure per the existing failure-policy resolution (default escalate). Story 5.6 will wire per-step skip policy auto-resolution at the loop runner-tier (NOT Story 5.2).

- **The SkipRequiresResumeError is the ONLY new error class** in Story 5.2. The mismatch (OQ-6) and missing-state (OQ-4) and idempotent re-skip (OQ-7) cases all reuse `ConfigError` with hintOverride (Story 1.10 + Story 1.11 precedent). Per OQ-1: the AC-mandated verbatim hint for SkipRequiresResumeError is the SOLE justification for the new class; the other cases do not warrant new classes because their hints can be cleanly composed via the existing ConfigError hintOverride pattern.

- **The runHistory entry skipped: true marker is the FORENSIC RECORD** that the verifier was BYPASSED on this step. The `outcome` field stays "pass" per the success-path-shape contract (the entry rides the existing schema validation); the `skipped: true` marker is the explicit flag that downstream readers (telemetry per Story 6.6/6.7; --explain per Story 3.6; --diff-state per Story 3.8) use to distinguish skip operations from genuine pass operations.

- **The lastSuccessfulStep advance via pickNextStep (Story 2.4)** mirrors the success-path advance — same DAG resolver, same tiebreak, same code path. The skip path effectively says "treat this step as if it had completed successfully (with the skipped:true marker for forensic visibility), and advance to the next step in topological order".

- **SIGINT cooperation is via the existing atomic-write contract** (Story 1.3) — the skip-path saveState is the SOLE write site; SIGINT mid-write either lets the atomic tmp+rename fully complete OR aborts cleanly before the rename. NO partial writes are possible per NFR-S5. The `shutdownRequested` poll pattern (Story 4.9 + Story 5.1) is NOT applicable to the skip path (no multi-attempt loop to short-circuit).

- **The skip path does NOT trigger checkpoint append (Story 4.8)** — the just-skipped step did not successfully complete; no Git snapshot is captured. The `state.checkpoints[]` array stays unchanged on the skip path. This is verified by SK_52_VA_10 test.

- **The new --skip-step <step> positional flag for verify-and-advance.ts** is the cross-process threading mechanism (mirror Story 3.1 --last-attempted-json + Story 4.8 --checkpoint-each precedent). The flag is parsed by parseVerifyAndAdvanceArgs and consumed by the new skip branch INSIDE runVerifyAndAdvance. NO new dispatch-spec field is needed (the JSON dispatch-spec is unchanged; --skip-step is a positional argv flag for the second Bash invocation only).

- **The 17-code error registry** (Story 5.2 grows from 16 to 17) accommodates the SkipRequiresResumeError trivially via the existing CI gate pattern (REQUIRED_CODES list extension + errorRegistry export). The Story 1.2 CI gate iterates `Object.values(errorRegistry)` and asserts each subclass has the code/exitCode/actionableHint trio + AR22-conformant hint regex match.

- **The schema migration impact is zero** — the new `skipped: boolean` field is OPTIONAL (per OQ-2 decision); existing state.yaml files validate cleanly without migration. Readers check `entry.skipped === true` (strict equality) to avoid the nullable-undefined ambiguity.

- **The dispatchFailureUx surface is now THREE-handler** (retry from Story 5.1 + skip from Story 5.2 + the v0.1 stub for route-to-fixer + escalate). The closed `FailureUxOutcome` union is forward-compatible — Stories 5.3 + 5.4 will land their handlers without union changes.

- **Per-attempt transcripts are written** via the existing `writeStepTranscript` (Story 2.5) surface; the skip-path transcript captures the skip operation with a clear "SKIPPED" indicator in the markdown.

## Dev Agent Record

### Context Reference

- Story spec: `_bmad-output/implementation-artifacts/5-2-skip-failure-mode-skip-flag.md` (this file; full read)
- Architecture: `_bmad-output/planning-artifacts/architecture.md` lines 492-499 (failure-UX modes), 770 (runHistory[] cap), 1182-1188 (failure-ux module group), 1358 (FR28 mapping)
- PRD: `_bmad-output/planning-artifacts/prd.md` line 707 (FR28 verbatim), line 780 (NFR-R8)
- Predecessor Story 5.1: `_bmad-output/implementation-artifacts/5-1-retry-failure-mode.md` (1027 lines; full read; SDR forward-trackers I-1 through I-8; nits N-1 through N-5)
- Epic-4 retrospective: `_bmad-output/implementation-artifacts/epic-4-retrospective.md` §Recommendations for Epic 5 items 1, 2, 3, 4, 7 (Story 5.2 honours items 1/2/4/7; intentionally deviates from item 3 per OQ-1)
- Predecessor schema-tightening precedent: Story 4.8 `CheckpointEntrySchema` + Story 5.1 `RunHistoryEntrySchema` at `src/schemas/state.ts:130-216`
- Predecessor cross-validation gap closure: Story 1.7 `--include-optional` + `--no-optional` at `src/commands/next/run.ts:336-372`
- Verifier-fail success-path mutation site: `src/commands/next/verify-and-advance.ts:848-879` (Story 2.6 + Story 5.1 modifications)

### Agent Model Used

Claude Opus 4.7 (1M context) — model ID `claude-opus-4-7[1m]`. Run as iter 5 of `/bmad-loop --until=epic:5` (loopId `2026-05-04T193245Z-bmad-loop`); runId `2026-05-04T210638Z-bmad-next`; transaction step `bmad-dev-story` for Story 5.2.

### Debug Log References

- Quality-gate runs (all GREEN on first pass):
  - `bunx tsc --noEmit` → exit 0 (no output)
  - `bun test src/errors.test.ts` → 14 pass / 0 fail / 215 expects (was 10/0/197)
  - `bun test src/schemas/state.test.ts` → 47 pass / 0 fail / 88 expects (was 42/0/76)
  - `bun test src/failure-ux/` → 34 pass / 0 fail / 67 expects across 3 files (was 24/0/49 across 2 files)
  - `bun test src/commands/next/args.test.ts` → 62 pass / 0 fail / 155 expects (was 51/0/130)
  - `bun test src/commands/next/run.test.ts` → 144 pass / 0 fail / 546 expects (was 138/0/532)
  - `bun test src/commands/next/verify-and-advance.test.ts` → 59 pass / 0 fail / 260 expects (was 49/0/219)
  - `bun test` → 1118 pass / 0 fail / 3948 expects across 63 files (was 1074/0/3827 across 62 files)
  - `bun run check` (biome ci + tests) → exit 0
  - `grep -c "extends StepperError" src/errors.ts` → 17 (UP from 16 per OQ-1 deviation)
- ONE TypeScript-fix iteration: DagNode test fixture in SK_52_VA helper `buildSkipDag` initially used wrong field names `{moduleSubpath, personas}` instead of canonical DagNode shape `{before, persona}`; fixed inline before any test ran. Not counted as a repair.

### Completion Notes List

- **AC-1 (skip-path-with-resume happy-path)** verified at:
  - `src/failure-ux/skip.ts:42-58` (skipHandler returns `{outcome: "skip"}`)
  - `src/failure-ux/index.ts:90-94` (dispatchFailureUx delegates `policy === "skip"` to formal skipHandler)
  - `src/schemas/state.ts:213-222` (RunHistoryEntrySchema gains `skipped: z.boolean().optional()` per OQ-2)
  - `src/commands/next/verify-and-advance.ts:629-769` (skip path: state mutation with `skipped: true` marker + lastSuccessfulStep advance + lastAttempted clear; atomic saveState; AR9 single-line emit; early-return)
  - SK_52_VA_1 verifies the three simultaneous state mutations per AC line 1077; SK_52_VA_4 verifies lastSuccessfulStep advance via DAG resolver; SK_52_VA_5 verifies atomic saveState; SK_52_VA_8 verifies SIGINT cooperation; SK_52_VA_9 verifies verifier NOT invoked on skip path; SK_52_VA_10 verifies checkpoints[] unchanged.
- **AC-2 (skip-without-resume rejection)** verified at:
  - `src/errors.ts:228-258` (SkipRequiresResumeError class with **BYTE-IDENTICAL** actionableHint per AC line 1080: `--skip requires --resume to advance state. Run /bmad-next --skip <step> --resume.`)
  - `src/errors.ts:21-38` (StepperErrorCode union includes SKIP_REQUIRES_RESUME — registry 16 → 17 per OQ-1 INTENTIONAL deviation from Story 5.1 epic-4-retro Recommendations item 3)
  - `src/commands/next/run.ts:391-409` (enforceSkipRequiresResume cross-validation function)
  - `src/commands/next/run.ts:1411` (call site after enforceMutuallyExclusiveFlags)
  - SK_52_RUN_1 verifies exit 2 + AC-verbatim hint; SK_52_RUN_5 verifies AR22 regex match; SkipRequiresResumeError errors.test.ts AC-verbatim hint test verifies BYTE-IDENTICAL hint string; errorRegistry contains exactly 17 entries.
- **AC-3 (telemetry skip-event recording — Epic 6 dependency)**: runHistory entries with `skipped: true` are persisted via the existing saveState atomic-write path; SK_52_VA_1 verifies the entry is written. Story 6.6/6.7 will iterate `state.runHistory[]` filtered by `skipped === true` for skip-event counts per step (forward-tracker preserved per OQ-5).
- **OQ adjudications** (10 total): OQ-1 ACCEPT NEW class (registry 16 → 17); OQ-2 ACCEPT optional field (no migration); OQ-3 ACCEPT existing pickNextStep tiebreak (DAG fork → forward to Story 6.x); OQ-4 ACCEPT throw on null lastAttempted; OQ-5 ACCEPT runHistory-as-telemetry-source; OQ-6 ACCEPT throw on mismatch; OQ-7 ACCEPT throw on idempotent re-skip; OQ-8 ACCEPT verify-and-advance.ts mid-tier placement; OQ-9 ACCEPT route through dispatch flow on --dry-run (v0.1 conservative); OQ-10 ACCEPT skip DAG validation (rely on OQ-6 mismatch check).
- **Forward-trackers honoured**: Story 5.1 SDR N-5 (RESOLVED — skip removed from v0.1 stub); §I-3 (HONOURED via SK_52_VA_8); §I-5 (HONOURED — added optional field not third dual-shape); §I-7 (HONOURED — telemetry source added); epic-4-retro items 1, 2, 4, 7 (HONOURED); item 3 INTENTIONALLY DEVIATED per OQ-1; Story 4.10 SDR §I-2 + Story 4.9 SDR §I-2 + Story 4.8 SDR §I-1 ALL honoured.
- **Forward-trackers PRODUCED for downstream**: 5.3 wire routeToFixerHandler + remove "route-to-fixer" from v0.1 stub; 5.4 land formal escalateHandler + remove "escalate" from v0.1 stub; 5.5 SIGINT cooperation precedent (SK_52_VA_8); 5.6 wire failurePolicies: config block to invoke skipHandler automatically; 6.6/6.7 consume runHistory[].skipped===true filter; 6.x DAG fork tiebreak / --skip + --dry-run report-mode preview / --skip-and-pick / explicit DAG step-id validation.

### File List

**NEW files (2):**

- `src/failure-ux/skip.ts` — Skip policy handler (pure function, mid-tier per AR41)
- `src/failure-ux/skip.test.ts` — Colocated unit tests (10 tests: SK_52_HANDLER_1-5 + SK_52_DISPATCH_1-5)

**MODIFIED files (12):**

- `src/errors.ts` — NEW SkipRequiresResumeError class; registry 16 → 17 per OQ-1
- `src/errors.test.ts` — REQUIRED_CODES extended with SKIP_REQUIRES_RESUME; 4 NEW tests in SkipRequiresResumeError describe block
- `src/schemas/state.ts` — RunHistoryEntrySchema extended with `skipped: z.boolean().optional()` per OQ-2
- `src/schemas/state.test.ts` — 5 NEW tests in SK_52_RHS describe block
- `src/failure-ux/index.ts` — dispatchFailureUx delegates `policy === "skip"` to formal skipHandler; v0.1 stub comment updated; re-exports skipHandler + SkipHandlerOpts
- `src/failure-ux/index.test.ts` — RT_51_DISPATCH_3 updated for behaviour change (Story 5.2 supersedes Story 5.1 v0.1 stub)
- `src/commands/next/args.ts` — NextArgsSchema extended with `skip: z.string().optional()` (19th flag); VerifyAndAdvanceArgsSchema extended with `skipStep: z.string().optional()`; parseVerifyAndAdvanceArgs extended with `--skip-step` branch
- `src/commands/next/args.test.ts` — Empty-argv default test updated for `skip: undefined`; inventory test updated for 19 keys; 6 NEW SK_52_ARGS tests + 3 NEW SK_52_ARGS_VA tests
- `src/commands/next/run.ts` — enforceSkipRequiresResume cross-validation; SkipRequiresResumeError import; call site after enforceMutuallyExclusiveFlags
- `src/commands/next/run.test.ts` — 6 NEW SK_52_RUN tests in dedicated describe block; helper writeSkipState added
- `src/commands/next/verify-and-advance.ts` — RunVerifyAndAdvanceOptions extended with `skipStep?: string` seam; RunHistoryEntry interface extended with `skipped?: boolean`; pickNextStepAfterSkip helper added; ~120-line SKIP PATH inside runVerifyAndAdvance try-block (AFTER state read, BEFORE dispatch-spec read + verifier invocation); state mutation with three simultaneous changes; atomic saveState; AR9 single-line emit; early-return per OQ-8 placement
- `src/commands/next/verify-and-advance.test.ts` — 10 NEW SK_52_VA tests in dedicated describe block; helpers seedSkipState + buildSkipDag added
- `commands/bmad-next.md` — argumentHint updated to include `--skip <step>`; 9th Usage example added; NEW `### --skip flag (Story 5.2 — Epic 5 skip mode)` sub-section (~70 lines); FR cross-reference updated to add FR28
- `commands/bmad-loop.md` — NEW `### Skip failure mode (--skip is /bmad-next-only — Story 5.2)` sub-section (~30 lines) clarifying that --skip is a /bmad-next-only flag; FR cross-reference updated to add FR28

**STORY tracking files (3):**

- `_bmad-output/implementation-artifacts/5-2-skip-failure-mode-skip-flag.md` (THIS FILE) — frontmatter + body status flipped to review; ALL 107 task checkboxes ticked; Dev Agent Record sections populated; Change Log entry appended
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — 5-2 ready-for-dev → review; last_updated bumped
- `.bmad-stepper/state.yaml` — workflow advance: lastStep=bmad-dev-story; nextStep=bmad-code-review; nextStepStory='5.2' (UNCHANGED); evidenceIndex appended

**RUN/TASK records (2 NEW for dev-story phase):**

- `.bmad-stepper/runs/2026-05-04T210638Z-bmad-next/run.yaml`
- `.bmad-stepper/runs/2026-05-04T210638Z-bmad-next/tasks/t1-dev-story.yaml`

### Deviations

ZERO deviations. Implementation matches the spec verbatim — all source-file modifications, test additions, and architectural decisions land per the spec's §Concretely Story 5.2 produces enumeration. The OQ-1 deviation (registry 16 → 17) was DECLARED in the spec itself (NOT a dev-time deviation) and is documented in the spec §Open Questions for Code Review + the AC-mandated verbatim hint string requirement.

### Repairs

ZERO repair iterations. Quality gates 9/9 GREEN on first pass. ONE TypeScript-fix iteration (DagNode test fixture field-name correction in SK_52_VA helper — `buildSkipDag` initially used `moduleSubpath` + `personas` instead of canonical DagNode `before` + `persona`; fixed inline before any test ran; not counted as a formal repair).

## Senior Developer Review (AI)

**Reviewer**: AI Senior Dev (sub-agent dispatched by /bmad-loop iter 6, runId 2026-05-04T221647Z-bmad-next, loopId 2026-05-04T193245Z-bmad-loop)
**Date**: 2026-05-04
**Verdict**: **approve**

### Summary

Story 5.2 lands the SECOND failure-UX policy (skip) on the Story 5.1 foundation: NEW pure-function `src/failure-ux/skip.ts` (mirroring the Story 5.1 retry.ts precedent), an extension of `dispatchFailureUx` to delegate `policy === "skip"` to the formal handler (resolving Story 5.1 N-5 forward-tracker), one OPTIONAL Zod field `skipped: z.boolean().optional()` on RunHistoryEntrySchema (additive — zero migration burden per OQ-2), one NEW error class SkipRequiresResumeError carrying the AC-mandated BYTE-IDENTICAL hint string per AC line 1080 (intentional registry deviation 16 → 17 per OQ-1, justified by AC-verbatim mandate), a new --skip <step> flag on NextArgsSchema (the 19th flag per Story 1.7), an enforceSkipRequiresResume cross-validation site in src/commands/next/run.ts, and a ~120-line skip path in verify-and-advance.ts that mutates state with three simultaneous changes (lastSuccessfulStep advance via DAG resolver + lastAttempted clear + runHistory append with skipped:true marker) atomically through ONE saveState call. Implementation follows the spec literally (107 of 107 task checkboxes ticked), 10 OQs all adjudicated transparently, ZERO deviations, ZERO repair iterations. Independently re-verified: bunx tsc --noEmit exit 0; bun run check biome ci 0 errors + 1118/0/3948; failure-ux/ 34/0/67 across 3 files; schemas/ 105/0/194; verify-and-advance.test.ts 59/0/260; args.test.ts 62/0/155; run.test.ts 144/0/546; errors.test.ts 14/0/215; full suite 1118/0/3948 across 63 files; grep -c "extends StepperError" src/errors.ts = 17. ALL counts match dev's claims EXACTLY. AC line 1080 hint string BYTE-IDENTICAL verified independently. STORY 5.2 COMPLETE.

### Acceptance Criteria Verification

- **AC-1** (skip-path-with-resume happy-path; state.yaml.lastAttempted.step matches → runHistory[].skipped:true for matched step + lastSuccessfulStep advances to next topological step + lastAttempted clears): **PASS**. Implementation verified at:
  - `src/failure-ux/skip.ts:49-57` (skipHandler returns `{outcome: "skip"}` invariant of context per OQ-7 separation)
  - `src/failure-ux/index.ts:91-95` (dispatchFailureUx delegates `policy === "skip"` to formal skipHandler; resolves Story 5.1 N-5 v0.1 stub)
  - `src/schemas/state.ts:227-235` (RunHistoryEntrySchema gains `skipped: z.boolean().optional()` per OQ-2 — undefined-means-false; no migration burden)
  - `src/commands/next/verify-and-advance.ts:689-826` (skip path: lines 727-735 OQ-4 null-lastAttempted check; lines 738-744 OQ-6 mismatch check with actual-step surfaced in hint; lines 752-758 OQ-7 idempotent re-skip protection; line 764 pickNextStepAfterSkip DAG resolver call; lines 770-789 RunHistoryEntry construction with skipped:true marker + outcome stays "pass" per success-path-shape contract; lines 798-811 stateAfter with three simultaneous mutations (lastSuccessfulStep advance + lastAttempted:null + runHistory FIFO-100 trim); line 813 saveState atomic-write under held lock; lines 815-820 AR9 single-line "↷ {step} → SKIPPED (next: {next})" emission; line 825 EARLY return BEFORE the dispatch-spec read + verifier invocation)
  - SK_52_VA_1 verifies the three simultaneous state mutations; SK_52_VA_2 verifies mismatch ConfigError; SK_52_VA_3 verifies null-lastAttempted ConfigError; SK_52_VA_4 verifies pickNextStepAfterSkip DAG resolver call; SK_52_VA_5 verifies atomic saveState with .bak rotation; SK_52_VA_6 verifies idempotent re-skip; SK_52_VA_7 verifies AR9 single-line emit + exit 0; SK_52_VA_8 verifies SIGINT cooperation via atomic tmp+rename; SK_52_VA_9 verifies verifier NOT invoked on skip path; SK_52_VA_10 verifies checkpoints[] unchanged per Story 4.8.

- **AC-2** (skip-without-resume rejection; --skip alone → exit 2 + BYTE-IDENTICAL hint string per AC line 1080): **PASS**. Implementation verified at:
  - `src/errors.ts:272-277` (SkipRequiresResumeError class — `code = "SKIP_REQUIRES_RESUME" as const`, `exitCode = 2 as const`, `actionableHint = "--skip requires --resume to advance state. Run /bmad-next --skip <step> --resume."` BYTE-IDENTICAL match against epics.md line 1080 verified by independent grep; AR22 regex `/^.*(Run|See|Try|Check) /` matches via trailing "Run /bmad-next..." segment)
  - `src/errors.ts:38` (StepperErrorCode union extended with `"SKIP_REQUIRES_RESUME"` — registry 16 → 17 per OQ-1 INTENTIONAL deviation from Story 5.1 epic-4-retro Recommendations item 3 — justified by AC-verbatim hint mandate)
  - `src/errors.ts:308` (errorRegistry includes SkipRequiresResumeError; Story 1.2 CI gate iterates Object.values)
  - `src/commands/next/run.ts:395-401` (enforceSkipRequiresResume cross-validation function — throws when `args.skip !== undefined && args.resume === false`)
  - `src/commands/next/run.ts:1431` (call site after enforceMutuallyExclusiveFlags)
  - SK_52_RUN_1 verifies exit 2 + AC-verbatim hint via SkipRequiresResumeError throw; SK_52_RUN_5 verifies AR22 regex match; SkipRequiresResumeError tests verify BYTE-IDENTICAL hint at errors.test.ts:133-140 + registry inclusion at :147-150.

- **AC-3** (telemetry skip-event recording — Epic 6 dependency tag): **PASS-DEFERRED**. The runHistory[] entry with `skipped: true` IS the future telemetry source per OQ-5. Story 5.2 ENSURES the data is CAPTURED via SK_52_VA_1 (the entry with skipped:true is persisted via saveState atomic-write). Story 6.6 will iterate `state.runHistory[]` filtered by `skipped === true` for skip-event counts per step; Story 6.7 will aggregate and report. Forward-tracker preserved per OQ-5; no Story 5.2 telemetry code required.

### Architectural Constraints

- **AR8** (lock-free top-tier; runNext does NOT acquire the lock): **UPHELD**. Verified — the skip path lives at the EXISTING lock-held mid-tier `verify-and-advance.ts` (the same scope that owns the success-path mutation site per Story 2.6); `runNext` in `src/commands/next/run.ts` adds ZERO new lock-acquire/release calls (the skip path's lock-acquire is the EXISTING acquire at verify-and-advance.ts:683 — shared with the success path per OQ-8 placement).
- **AR9** (single AR9 stdout line per command invocation): **UPHELD**. Each /bmad-next --skip invocation emits EXACTLY ONE AR9 JSON line: the success path emits one report action `↷ {step} → SKIPPED (next: {next})` at verify-and-advance.ts:815-820; the SkipRequiresResumeError throw emits one halt action via the runner-tier outer catch with the AC-verbatim hint. Story 5.2 ADDS ZERO new AR9 emissions beyond the existing per-invocation contract.
- **AR21+22** (errors registry GREW from 16 → 17 per OQ-1 INTENTIONAL deviation): **UPHELD**. Verified independently: `bun test src/errors.test.ts` 14/0/215 (UP from 10/0/197); `grep -c "extends StepperError" src/errors.ts` = 17 (UP from 16). The new SkipRequiresResumeError actionableHint matches the AR22 regex `/^.*(Run|See|Try|Check) /` via the trailing "Run /bmad-next..." segment — verified by SkipRequiresResumeError errors.test.ts:142-145 test. Per OQ-1 the deviation from Story 5.1 epic-4-retro Recommendations item 3 ("Epic 5 should NOT add new error classes") is JUSTIFIED by the AC-mandated verbatim hint string mandate that does not match any existing class's actionableHint.
- **AR33** (no console.* in source): **UPHELD**. Verified independently — grep on `src/failure-ux/skip.ts` + `src/commands/next/verify-and-advance.ts` (skip path lines 689-826) returns zero matches for `console.(log|error|warn|info)`; the skip path uses NO log calls (no per-skip logging needed; the AR9 emission is the SOLE main-thread output).
- **AR34** (slash-command markdown protocol): **UPHELD**. `commands/bmad-next.md` extended with NEW `### --skip flag (Story 5.2 — Epic 5 skip mode)` sub-section (~75 lines covering: invocation pattern + co-required relation with --resume + matched-step precondition (OQ-4/OQ-6) + state mutation semantic + no-verifier-no-promotion behavior + SIGINT cooperation + idempotent re-skip caveat (OQ-7) + telemetry forward-tracker + /bmad-next-only scope + Layer 1 markdown threading instructions); argumentHint frontmatter updated to include `--skip <step>`; 9th Usage example added; FR cross-reference updated to add FR28. `commands/bmad-loop.md` extended with NEW `### Skip failure mode (--skip is /bmad-next-only — Story 5.2)` sub-section (~30 lines clarifying that --skip is /bmad-next-only and /bmad-loop continues to halt on verifier failure per existing failure-policy resolution); FR cross-reference updated to add FR28.
- **AR41** (boundary graph; mid-tier `src/failure-ux/` per architecture lines 1182-1188): **UPHELD**. `src/failure-ux/skip.ts` imports ONLY `type FailureContext, FailureUxOutcome` from sibling `./index.ts` (zero imports from `src/commands/`, zero imports from `src/state/`, zero imports from `src/errors.ts`); `src/failure-ux/index.ts` imports skipHandler from sibling `./skip.ts` (mirrors retry.ts pattern). Consumer `src/commands/next/verify-and-advance.ts` imports types from `../../failure-ux/index.ts` (top-tier → mid-tier flow per AR41 hierarchy). Re-exports `skipHandler + SkipHandlerOpts` for symmetry with Story 5.1's retry exports.
- **AR42** (test discipline; RunVerifyAndAdvanceOptions test-injection seam): **UPHELD**. New seam `skipStep?: string` added to RunVerifyAndAdvanceOptions (mirrors Story 5.1's `failurePolicyOverride`/`maxRetriesOverride` + Story 4.8 `checkpointEach` seam pattern); production callers thread via the new `--skip-step <step>` positional flag added to parseVerifyAndAdvanceArgs (mirrors Story 3.1 --last-attempted-json + Story 4.8 --checkpoint-each precedent).
- **AR20** (type-alias chain): **UPHELD**. NEW types `SkipHandlerOpts` (empty interface, forward-extensible per OQ-7) follow architecture line 719 type-alias chain pattern; `RunHistoryEntry` type alias updates automatically via `z.infer<typeof RunHistoryEntrySchema>` as the schema gains the new optional field.
- **AR25+26** (finally discipline): **UPHELD**. The skip path preserves the existing finally discipline in verify-and-advance.ts — lock release happens in the existing finally block AFTER the skip-path saveState completes; the early-return at verify-and-advance.ts:825 routes through the finally block per the existing try/finally contract.
- **AR13** (Layer 2 atomic-write contract): **UPHELD**. The skip-path runHistory + lastSuccessfulStep + lastAttempted + lastFailureReason mutations all flow through ONE saveState() call at verify-and-advance.ts:813 with `.bak` rotation per AR13. Story 4.8 §I-1 atomic-write contract is RIDDEN unchanged.

### Quality Gates (Independently Re-Verified)

| Gate | Expected | Actual | Status |
|------|---------:|-------:|:------:|
| `bunx tsc --noEmit` | exit 0 | exit 0 (no output) | OK |
| `bun run check` (biome ci + tests) | 0 errors + 1118/0/3948 | 0 errors + 1118/0/3948 across 63 files | OK |
| `bun test src/errors.test.ts` | 14/0/215 | 14/0/215 | OK |
| `bun test src/failure-ux/` | 34/0/67 across 3 files | 34/0/67 across 3 files | OK |
| `bun test src/schemas/` | ~47/0/88 or higher | 105/0/194 across 9 files (state.test.ts: 47/0/88) | OK |
| `bun test src/commands/next/args.test.ts` | 62/0/155 | 62/0/155 | OK |
| `bun test src/commands/next/run.test.ts` | 144/0/546 | 144/0/546 | OK |
| `bun test src/commands/next/verify-and-advance.test.ts` | 59/0/260 | 59/0/260 | OK |
| `bun test` (full) | 1118/0/3948 / 63 files | 1118/0/3948 / 63 files | OK |
| `grep -c "extends StepperError" src/errors.ts` | 17 | 17 | OK |
| AC line 1080 hint BYTE-IDENTICAL | exact match | exact match (verified independently — see AR21+22 above) | OK |

Stability: re-ran `bun run check` (which includes biome ci + full suite) — counts stable at 1118/0/3948 (no flake observed). All 10 quality gates GREEN on independent re-verification; ALL counts MATCH dev's claims exactly.

### Open Questions (10 OQs adjudicated)

- **OQ-1** (NEW SkipRequiresResumeError class vs reuse ConfigError + hintOverride): **ACCEPT NEW class (registry 16 → 17)**. The AC-mandated BYTE-IDENTICAL hint string mandate justifies the dedicated class — verified independently that no existing class's actionableHint matches `--skip requires --resume to advance state. Run /bmad-next --skip <step> --resume.` byte-for-byte. Reusing ConfigError with a third hintOverride would dilute the abstraction (Story 1.10 + Story 1.11 hintOverride pattern was established for ONE-OFF cases). The intentional deviation from Story 5.1 epic-4-retro Recommendations item 3 ("Epic 5 should NOT add new error classes") is well-documented in code (errors.ts:258-271 doc-block) and in the spec (line 116-117, OQ-1 section). Sound trade-off for v0.1.
- **OQ-2** (`runHistory[].skipped` field nullable vs required-with-default vs optional): **ACCEPT OPTIONAL** (`z.boolean().optional()` — undefined-means-false). Mirrors the Story 5.1 D1 dual-shape pattern (6 legacy fields preserved as OPTIONAL for back-compat); zero migration burden on existing entries; readers check `entry.skipped === true` (strict equality) to avoid the nullable-undefined ambiguity. Verified via SK_52_RHS_3 (back-compat for entries without skipped field) + SK_52_RHS_5 (mixed-entries validate cleanly).
- **OQ-3** (lastSuccessfulStep advance semantic when DAG forks): **ACCEPT** existing pickNextStep / pickNextStepAfterSkip tiebreak (phase order + Map insertion order per Story 1.10 deterministic invariant). Reuses the existing tiebreak for the skip path — preserves the "skip behaves like success" semantic. Forward-tracker for Story 6.x explicit user override via `--skip-and-pick <next-step>` extension if the DAG fork case proves common.
- **OQ-4** (--skip without state.lastAttempted populated): **ACCEPT** throw ConfigError with hint `Run /bmad-next without --skip first to populate state.lastAttempted, then retry --skip <step> --resume.` Avoids dangerous silent-skip behavior. Verified by SK_52_VA_3 (null-lastAttempted → ConfigError thrown with correct hint).
- **OQ-5** (Telemetry skip-event payload shape): **ACCEPT-DEFER** runHistory-as-source. The runHistory[] entry with `skipped: true` IS the telemetry data source; Story 6.6 will iterate runHistory[] filtered by `skipped === true` for skip-event counts per step; Story 6.7 will aggregate and report. Mirrors Story 5.1 OQ-10 retry-as-source decision. Forward-tracker preserved.
- **OQ-6** (--skip <step> mismatch with state.lastAttempted.step): **ACCEPT** throw ConfigError with hint surfacing the actual lastAttempted.step value for correction. Avoids dangerous silent-apply-to-wrong-step behavior. Verified by SK_52_VA_2 (mismatch ConfigError with actual-step in hint).
- **OQ-7** (Idempotent re-skip — --skip applied twice on already-skipped step): **ACCEPT** throw ConfigError (`step <name> is already skipped`). Avoids duplicate forensic records + masks user confusion. Verified by SK_52_VA_6 (idempotent re-skip → ConfigError thrown).
- **OQ-8** (Lock-held mid-tier vs lock-free top-tier skip placement): **ACCEPT** verify-and-advance.ts mid-tier. Sound rationale per spec lines 119/731: same three state fields mutated as success path; same lock acquire/release pattern (one acquire at top, release in finally); same atomic-write contract via saveState; reusing existing scope minimizes new code. Trade-off (verify-and-advance.ts argv parsing extension + RunVerifyAndAdvanceOptions extension) acceptable per Story 5.1 + Story 4.8 precedent.
- **OQ-9** (--skip + --dry-run interaction): **ACCEPT** route through dispatch flow on --dry-run (v0.1 conservative). The Task 11.1 SK_52_RUN_6 test verifies the combination produces a report-mode output; full report-mode preview with planned-skip enumeration is forward-tracker for Story 5.x or Story 6.x (per OQ-9 spec line 733). v0.1 acceptable.
- **OQ-10** (--skip step-id format validation): **ACCEPT** rely on OQ-6 mismatch check. The OQ-6 check at verify-and-advance.ts:738-744 catches the common-case typo (user supplied step name does not match state.lastAttempted.step → ConfigError with actual-step in hint). Explicit DAG validation adds complexity without clear v0.1 benefit. Forward-tracker for Story 6.x explicit DAG validation if OQ-6 proves insufficient.

### Deviations adjudicated

ZERO D-deviations declared by dev. The OQ-1 deviation (registry 16 → 17) was DECLARED in the spec itself at lines 50/116-117/129/717/731/759 (NOT a dev-time deviation) and the dev-iter implemented per spec. The implementation matches the spec verbatim — all source-file modifications, test additions, and architectural decisions land per the spec's §Concretely Story 5.2 produces enumeration. **ACCEPT (no adjudication needed)**.

### Findings

**Must Fix (0)**:
(none)

**Should Fix (0)**:
(none)

**Nits (4 inherited + 0 new = 4)**:
- **N-1 (inherited from Stories 4.2-4.10 + Story 5.1)**: defensive `epicNum === undefined || epicNum === null` check at `src/commands/loop/stop-conditions.ts:269` — the `=== null` arm is unreachable. Verified still present + still cosmetic; Story 5.2 does NOT modify `stop-conditions.ts`. Opportunistic cleanup forward.
- **N-2 (inherited from Stories 4.2-4.10 + Story 5.1)**: `EMPTY_DAG` + `EMPTY_STATE` sentinels at `src/commands/loop/run.ts` mid-file placement. Verified still present + still consumed; Story 5.2 does NOT modify `run.ts` mid-file region. Cosmetic; Story 6.x cleanup forward.
- **N-3 (inherited from Stories 4.8/4.9/4.10 + Story 5.1)**: future task records should snapshot final test counts AFTER the LAST `biome --write` pass. Story 5.2's `t1-dev-story.yaml` correctly snapshots `final: '1118 pass / 0 fail / 3948 expect calls / 63 files'` matching the post-biome actual (verified independently). Process-discipline forward-tracker that the Story 5.2 dev-iter honored.
- **N-4 (inherited from Story 4.10 + Story 5.1)**: TWO unused LoopOpts seams `finalStateOverride` + `writeLoopExitTranscriptOverride` declared but never consumed. Verified still present; Story 5.2 does NOT touch the unused seams. Pure dead surface; Story 6.x cleanup forward (either WIRE in import.meta.main OR REMOVE the dead seam declarations).

Note: Story 5.1 N-5 (dispatchFailureUx v0.1 stub silent-escalate for skip/route-to-fixer/escalate) is **PARTIALLY RESOLVED** by Story 5.2 — the `"skip"` portion is RESOLVED (formal skipHandler wired). The remaining `"route-to-fixer"` + `"escalate"` portions are forward-tracked to Stories 5.3 + 5.4 respectively. Story 5.2 updated the v0.1 stub comment from "v0.1 stubs the three non-retry handlers to escalate" to "v0.1 stubs the two remaining non-retry/non-skip handlers to escalate (Stories 5.3 + 5.4 land their formal handlers)" per Task 1.1.

**Info / Forward-Trackers (5 inherited + 4 new = 9 total)**:
- **I-1 (inherited from Story 4.8 §I-1 + Story 5.1 §I-1)**: verify-and-advance.ts atomic-write contract guarantees all-or-nothing — Story 5.2 RIDES this contract via the skip-path saveState at verify-and-advance.ts:813 (single write per skip operation; AR13 Layer 2 atomic tmp+rename + .bak rotation). SIGINT mid-skip-state-write is safe per AC SK_52_VA_8 verification.
- **I-2 (inherited from Story 4.10 §I-2 + Story 4.9 §I-2 + Story 5.1 §I-3)**: Story 5.x failure-UX modes interaction with SIGINT — Story 5.2 honoured via SK_52_VA_8 (SIGINT mid-skip-state-write halts cleanly with atomic tmp+rename guaranteeing no partial writes per NFR-S5; the `shutdownRequested` poll pattern is NOT applicable to skip — no multi-attempt loop to short-circuit; the skip path is a single-write operation).
- **I-3 (inherited from Story 5.1 §I-4)**: Production retry-dispatch mechanism gap. Story 5.2 has NO retry-dispatch dependency — the skip path is a state-mutation-only path; no sub-agent re-dispatch needed. Forward to Story 5.3 (--auto-fix) which has similar re-dispatch needs.
- **I-4 (inherited from Story 5.1 §I-5)**: D1 dual-shape consolidation — 6 legacy optional fields coexist with 8 new typed required fields on RunHistoryEntrySchema. Story 5.2 ADDED ONE more OPTIONAL field `skipped: boolean` rather than introducing a third dual-shape; same OPTIONAL pattern as the legacy fields per back-compat discipline. Forward to Story 6.x consolidation when the Story 4.5 token reader and Story 4.x plan-walk completion check can be migrated to the typed fields.
- **I-5 (inherited from Story 5.1 §I-7)**: Telemetry consumption (Story 6.6/6.7) will iterate `state.runHistory[]` filtered by `attemptNumber > 1` for retry counts AND `skipped === true` for skip counts. Story 5.2 ADDS the parallel filter for skip-event counts per step.
- **I-6 (NEW — Story 5.2)**: DAG fork tiebreak for skip — when the skipped step has multiple downstream successors (DAG fork), the skip path uses `pickNextStepAfterSkip` (verify-and-advance.ts:538) which mirrors the existing pickNextStep tiebreak (phase order + Map insertion order per Story 1.10 deterministic invariant). Forward-tracker for Story 6.x explicit user override via `--skip-and-pick <next-step>` extension if the DAG fork case proves common per OQ-3.
- **I-7 (NEW — Story 5.2)**: --skip + --dry-run report-mode preview — v0.1 routes through the existing dispatch flow on --dry-run (per OQ-9 conservative); SK_52_RUN_6 verifies the combination produces a report-mode output. Forward-tracker for Story 6.x full report-mode preview with planned-skip enumeration.
- **I-8 (NEW — Story 5.2)**: --skip step-id ambiguity resolution — v0.1 relies on exact-match against state.lastAttempted.step (per OQ-10); the OQ-6 mismatch check catches typos. Forward-tracker for Story 6.x explicit DAG step-id validation if the user supplies an ambiguous step name (e.g., "review" when both "code-review" and "design-review" exist).
- **I-9 (NEW — Story 5.2)**: SkipHandlerOpts is empty in v0.1 (forward-extensible per OQ-7); future Story 6.x may extend with `maxConsecutiveSkips: number` for idempotent re-skip protection beyond the current ConfigError throw. The empty-interface pattern is biome-ignored at skip.ts:32 (lint/suspicious/noEmptyInterface) — acceptable for forward-extensibility.

### Sign-off

**approve**. Story 5.2 is COMPLETE, ready for next story 5.3 (Route-to-Fixer Mode + `--auto-fix` Flag). The implementation is clean, well-tested (44 new tests across 7 layers: pure-function unit tests + dispatcher unit tests + RunHistoryEntrySchema validation tests + NextArgsSchema parsing tests + parseVerifyAndAdvanceArgs tests + runner-tier cross-validation tests + integration tests for the skip path + SkipRequiresResumeError class tests), well-documented (10 OQs adjudicated transparently, ZERO deviations, ZERO repair iterations), and honours ALL relevant epic-4-retrospective Recommendations (items 1, 2, 4, 7 — item 3 INTENTIONALLY DEVIATED per OQ-1 with AC-verbatim hint string justification) plus the Story 4.8/4.9/4.10/5.1 forward-trackers. The OQ-1 deviation (registry 16 → 17) is well-justified by the AC-mandated BYTE-IDENTICAL hint string requirement and properly documented in code + spec. ZERO blocking concerns. ZERO source mutations during review. Recommended next loop step: bmad-create-story for Story 5.3 (5-3-route-to-fixer-mode-auto-fix-flag). Epic 5 is `in-progress` (Stories 5.1 + 5.2 done; Stories 5.3-5.6 backlog).

## Change Log

| Date       | Author    | Change                              |
| ---------- | --------- | ----------------------------------- |
| 2026-05-04 | dev-story | Status ready-for-dev → review. Implemented Story 5.2 per spec: NEW src/failure-ux/skip.ts pure-function skipHandler; MODIFIED src/failure-ux/index.ts to delegate skip → skipHandler (resolves Story 5.1 N-5); ADDED SkipRequiresResumeError to src/errors.ts (registry 16 → 17 per OQ-1 INTENTIONAL deviation from epic-4-retro item 3 — AC-mandated verbatim hint justifies new class); EXTENDED RunHistoryEntrySchema with skipped: boolean optional field per OQ-2; ADDED --skip <step> flag (NextArgsSchema 19th field) + cross-validation enforceSkipRequiresResume in run.ts; ADDED skip path in verify-and-advance.ts (state-mutation only — no verifier, no promotion); UPDATED commands/bmad-next.md + bmad-loop.md docs. Quality gates 9/9 GREEN on first pass: tsc 0; biome ci 0; full suite 1074/3827 → 1118/3948 (+44 tests +121 expects +1 file); errors registry 17 (UP from 16). 10 SK_52_HANDLER + SK_52_DISPATCH + SK_52_RHS + SK_52_ARGS + SK_52_RUN + SK_52_VA test groups all green. ZERO deviations + ZERO repair iterations. |
| 2026-05-04 | Tomasz G. | Story 5.2 created (ready-for-dev). |
| 2026-05-04 | AI Senior Dev (Opus 4.7 1M, dispatched by /bmad-loop iter 6) | Story 5.2 code-review complete (review → done). Senior Developer Review section appended (~210 lines per Story 5.1 SDR template). Verdict: **approve** (must-fix=0, should-fix=0, nits=4 inherited N-1/N-2/N-3/N-4 + 0 new = 4, info=9 forward-trackers — 5 inherited I-1/I-2/I-3/I-4/I-5 + 4 new I-6/I-7/I-8/I-9). AC-1 PASS verified at src/failure-ux/skip.ts:49-57 + src/failure-ux/index.ts:91-95 + src/schemas/state.ts:227-235 + src/commands/next/verify-and-advance.ts:689-826 (SK_52_VA_1-10). AC-2 PASS verified at src/errors.ts:272-277 (SkipRequiresResumeError BYTE-IDENTICAL hint per AC line 1080) + src/errors.ts:38 (StepperErrorCode union extended) + src/errors.ts:308 (errorRegistry) + src/commands/next/run.ts:395-401 + src/commands/next/run.ts:1431 (call site) + SK_52_RUN_1/5 + errors.test.ts:133-150. AC-3 PASS-DEFERRED (Epic 6 dependency tag; runHistory[] entries with skipped:true persisted per SK_52_VA_1; Story 6.6/6.7 will iterate). Quality gates 11/11 INDEPENDENTLY re-verified GREEN: bunx tsc --noEmit exit 0; bun run check biome ci 0 errors + 1118/0/3948; bun test src/errors.test.ts 14/0/215; bun test src/failure-ux/ 34/0/67 across 3 files; bun test src/schemas/ 105/0/194 across 9 files; bun test src/commands/next/args.test.ts 62/0/155; bun test src/commands/next/run.test.ts 144/0/546; bun test src/commands/next/verify-and-advance.test.ts 59/0/260; bun test (full) 1118/0/3948 across 63 files; grep -c "extends StepperError" src/errors.ts = 17; AC line 1080 hint BYTE-IDENTICAL verified. ALL counts MATCH dev claims EXACTLY. 10 OQs adjudicated (8 ACCEPT in-place + 2 ACCEPT-DEFER; 0 REJECT). 0 D-deviations (the OQ-1 deviation was DECLARED in spec, not dev-time). N-1/N-2/N-3/N-4 inherited cosmetic nits verified still-present + still-cosmetic; N-5 from Story 5.1 PARTIALLY RESOLVED (skip portion wired); 4 new I-trackers (I-6 DAG fork tiebreak / I-7 --skip+--dry-run report-mode / I-8 --skip step-id ambiguity / I-9 SkipHandlerOpts forward-extensibility). AR8/9/21/22/33/34/41/42 + AR20/25/26/13 all UPHELD. ZERO source mutations during review. Frontmatter status flipped review → done; inline Status flipped review → done; last_updated bumped to 2026-05-04T22:16:47Z. **STORY 5.2 COMPLETE.** Recommended next loop step: bmad-create-story for Story 5.3 (5-3-route-to-fixer-mode-auto-fix-flag). |
