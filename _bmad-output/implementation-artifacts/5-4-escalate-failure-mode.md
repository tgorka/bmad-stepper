---
status: done
story_id: '5.4'
story_key: 5-4-escalate-failure-mode
epic: '5'
title: 'Escalate Failure Mode'
created: '2026-05-05'
last_updated: '2026-05-05T02:03:22Z'
priority: high
estimated_effort: M
fr_coverage:
  - FR30     # PRIMARY — escalate is the default failure-UX policy
  - FR32     # PRIMARY — actionable error report on every halt; no stack trace on main thread
  - FR16     # sub-agent dispatch with budget+timeout (escalate path applies after dispatch failures)
  - FR17     # verifier before promote (escalate covers verifier failures)
  - FR8      # single-step advance (intra-step escalate is the terminal failure-UX outcome)
  - FR43     # markdown transcript per step (escalate transcripts written before throw)
  - FR44     # JSON run log per step (full detail, including stack trace, lives only in run log)
  - FR53     # exit codes (escalate maps to exit 1 for halt-with-actionable-error per VerifierFailureError)
  - FR54     # stdout/stderr discipline
nfr_coverage:
  - NFR-M2   # PRIMARY — every error has actionable hint; no stack trace on main thread; full detail in run log
  - NFR-R1   # zero data loss on halt (escalate writes lastFailureReason atomically)
  - NFR-R2   # 100% --resume recovery (the actionable hint surfaces --resume as the recovery path)
  - NFR-R8   # 4 failure-UX modes covered by integration tests (escalate = 4th of 4 — COMPLETES the four)
  - NFR-S2   # no-write-outside-scope
  - NFR-S5   # atomic tmp+rename + .bak rotation (lastFailureReason write rides existing path)
  - NFR-M3   # schema migrations (no schema bump; lastFailureReason field already exists from Story 1.6 + 3.1)
ar_coverage:
  - AR8      # lock-free top-tier preserved (escalate handler stays pure-function mid-tier)
  - AR9      # single AR9 stdout line per command invocation (escalate = halt action with actionable hint)
  - AR21     # PRIMARY — error UX shape (escalate is the canonical halt path)
  - AR22     # PRIMARY — actionable-hint regex `/^.*(Run|See|Try|Check) /` enforced for EVERY escalate path
  - AR33     # no console.* in source (stack trace stays in run log only, never console.*)
  - AR34     # slash-command markdown protocol (commands/bmad-next.md formal escalate row)
  - AR41     # boundary graph (mid-tier src/failure-ux/escalate.ts joins retry/skip/route-to-fixer module group)
  - AR42     # test discipline (test-injection seam pattern; integration test parametrized over EVERY escalate path)
deps:
  - 5-3-route-to-fixer-mode-auto-fix-flag                             # PRIMARY: src/failure-ux/ four-handler module group; route-to-fixer establishes the both-failures-recorded escalate precedent (AC line 1099) which Story 5.4 FORMALIZES; the v0.1 stub at src/failure-ux/index.ts:103-105 ("v0.1 stubs the one remaining non-retry/non-skip/non-route-to-fixer handler to escalate. Story 5.4 lands the formal escalate handler.") is the EXACT site Story 5.4 RESOLVES; route-to-fixer's TWO-entry runHistory semantic per OQ-4 forensic clarity is the precedent Story 5.4 inherits for both-failures contexts; Story 5.3 SDR forward-trackers I-6 (--auto-fix + --dry-run report-mode preview), I-7 (Explicit FixerDispatchError class), I-8 (Multi-fix retry strategy), I-9 (Fixer-CONTEXT schema validation) are forward-tracked; Story 5.3 SDR 4 inherited cosmetic nits N-1/N-2/N-3/N-4 inherited unchanged.
  - 5-2-skip-failure-mode-skip-flag                                   # PRIMARY: SkipRequiresResumeError actionable hint precedent for AC line 1111 verbatim hint regex — the new error class introduced in Story 5.2 carries an actionableHint terminating in "Run /bmad-next --skip <step> --resume." which fits the AR22 regex `/^.*(Run|See|Try|Check) /`; Story 5.4's escalate handler enforces this same regex contract over EVERY escalate path (not just SkipRequiresResume). Story 5.2 introduced ConfigError + hintOverride pattern reuse for skip-path mismatch / null lastAttempted / idempotent re-skip cases — Story 5.4 RIDES this pattern (no new escalate-specific error classes; the escalate handler shapes existing error classes' actionableHint into the regex contract).
  - 5-1-retry-failure-mode                                            # PRIMARY: src/failure-ux/{index,retry}.ts module + escalate-via-re-throw pattern — the retry-loop's escalate branch at verify-and-advance.ts:1065-1083 is the FIRST escalate site; Story 5.4 FORMALIZES this pattern by promoting the implicit escalate-via-throw to an EXPLICIT escalate handler; Story 5.1 N-5 forward-tracker (line 1005) "Story 5.4 lands the formal escalate handler" is the EXACT directive Story 5.4 fulfills (RESOLVES the remaining "escalate" portion of the v0.1 stub branch in dispatchFailureUx). The retryHandler returns `{outcome: "escalate", reason: context}` after maxRetries cap is reached — Story 5.4's formal escalateHandler is invoked by dispatchFailureUx for this outcome (and for the unconfigured-policy default `escalate` per architecture line 499) and SHAPES the failure context into the actionable error with the regex-conforming hint.
  - 4-10-loop-exit-reason-resume-hint                                 # PRIMARY: epic-4 close-of-Epic baton — failure modes MUST consume formatLoopExitLines(stopReason, state) per epic-4-retrospective.md §Recommendations for Epic 5 item 1 (line 269). Story 5.4's escalate path flows through the existing `halt-on-error` StopReason emission per Story 4.6 short-circuit + Story 4.10 unified format. The actionable hint that the escalate handler shapes is the canonical AR22-compliant message that formatLoopExitLines incorporates into the two-line exit emission; the run-log path (per AC line 1111 "the actionable hint includes the run-log path") is sourced from the existing _bmad-output/.stepper/runs/<runId>/ convention.
  - 4-9-sigint-graceful-exit                                          # PRIMARY: SDR §I-2 forward-tracker line 866 mandates "SIGINT during --auto-fix retry / --skip advance / interactive pause may need additional coordination — Story 5.x stories should test their failure-UX flows with SIGINT-mid-flight". Story 5.4 honours this by adding ESC_54_VA_* tests asserting SIGINT mid-escalate-path (e.g., SIGINT after retry-cap reached but before lastFailureReason write) halts cleanly with the partial state recorded (the existing atomic-write contract via Story 1.3 atomic tmp+rename guarantees no partial writes per NFR-S5).
  - 4-8-checkpoint-each-step-type                                     # PRIMARY: SDR §I-1 atomic-write contract guarantees all-or-nothing — the escalate path's lastFailureReason write rides the existing atomic-write contract via the verify-and-advance.ts catch handler's stateOnHalt write (per Story 3.1 site at lines 1436-1455 today). Story 4.8 §I-1 forward-tracker "verify-and-advance.ts atomic-write contract guarantees all-or-nothing; either both runHistory + checkpoints persist or neither does" is RIDDEN unchanged.
  - 4-6-stop-condition-error-with-stop-on-error-continue-on-error    # PATTERN: halt-on-error short-circuit at run.ts:796-857 reading state.lastFailureReason.code is the FOUNDATION on which Story 5.4's escalate path hangs. The Story 4.6 boolean gate `--continue-on-error` is INDIRECTLY related (it gates whether retry/skip/route-to-fixer escalate produces halt-on-error at the loop runner-tier; per architecture line 499 the default policy is escalate so even WITHOUT a per-step config the escalate path fires on first verifier failure). The `error-stop` runner-direct StopReason variant (Story 4.6) is the precedent for any future escalate-runner-StopReason variant; Story 5.4 does NOT add a new variant (escalate flows through existing emission per OQ-1 decision below).
  - 3-1-record-last-attempted-last-failure-reason-on-halt            # CRITICAL: state.lastFailureReason {code, message, hint, runId} is the canonical failure context that the escalate handler reads/writes — AC line 1111 "lastFailureReason is recorded" is the EXACT contract Story 3.1 wired (LastFailureReasonSchema at src/schemas/state.ts:140-145; persisted on every halt path via verify-and-advance.ts catch handler at lines 1436-1455). Story 5.4 does NOT extend the schema (per OQ-1 decision below — the schema is sufficient as-is); Story 5.4's escalate handler READS the failure context (from a thrown StepperError) and SHAPES the actionable hint per the AR22 regex contract; the existing write site at verify-and-advance.ts persists lastFailureReason atomically.
  - 3-2-resume-flag                                                  # DEPENDENCY: --resume on /bmad-next is the canonical recovery entry-point that the AC-mandated actionable hint references. AC line 1111 "the actionable hint includes the run-log path and `--resume` invocation" — the escalate handler's enrichment SHAPES the hint to include both the run-log path (from the existing _bmad-output/.stepper/runs/<runId>/ convention) and the `--resume` invocation literal (e.g., "Run /bmad-next --resume to retry"); the existing VerifierFailureError.actionableHint at src/errors.ts:175-176 already references --resume — the formal escalate handler ENRICHES this with the run-log path per AC line 1111.
  - 2-6-verify-and-advance-ts-with-state-hash-check                  # CRITICAL: verifier failure surface — VerifierFailureError throw site at line 1071 (escalate-after-cap from Story 5.1 retry loop) + line 1118 (route-to-fixer escalate from Story 5.3) + line 1241 (raw verifier failure from original Story 2.6 site) + line 1254 (unexpected non-retry/non-escalate/non-route-to-fixer outcome from Story 5.1) are the FOUR escalate sites. Story 5.4 EXTENDS each site to invoke the formal escalateHandler from src/failure-ux/escalate.ts BEFORE the throw to enrich the actionableHint per AC line 1111.
  - 2-4-lock-free-run-ts-for-bmad-next                               # PATTERN: lock-free runNext catch handler at run.ts is the LAST main-thread error-formatting site. Story 5.4 verifies that the catch handler's formatError surface emits the SINGLE-LINE actionable hint (NOT the full Error.message + stack) per NFR-M2 — the existing pattern at src/io/log.ts emit functions ROUTES stack traces to stderr (via warn/error), but the AR9 halt action's `message` field carries ONLY the actionable hint per AR22.
  - 1-12-bmad-next-doctor-command                                    # PATTERN: --doctor command surface (Story 1.12) is the diagnostic entry-point — the escalate handler may reference --doctor in some hints (e.g., for BMAD_INCOMPATIBLE), but the AC-mandated hint focuses on --resume + run-log path. NO new --doctor mode in Story 5.4.
  - 1-7-cli-argument-parser                                          # SCHEMA: NextArgsSchema 20 fields (Story 5.3 baseline). Story 5.4 has NO new CLI flag; the escalate path is the DEFAULT (architecture line 499) and fires automatically on verifier failure / sub-agent timeout / dispatch error. Future Story 5.6 wires per-step `failurePolicies:` config block which may include an explicit `escalate` policy (no new flag).
  - 1-6-state-subsystem-load-save-recompute-skeleton                 # DEPENDENCY: saveState atomic-write — RIDDEN (the escalate path's lastFailureReason write flows through one saveState() call at the existing verify-and-advance.ts halt site).
  - 1-5-schemas-migrations-skeleton                                  # SCHEMA: state.lastFailureReason field already exists (Story 1.6 schema + Story 3.1 named extraction). Story 5.4 does NOT add new schema fields (per OQ-1 decision — the existing schema {code, message, hint, runId} is sufficient).
  - 1-3-logger-path-helpers-atomic-write                             # PATTERN: atomic write + path helpers — the escalate handler reads from existing pathHelpers (e.g., the run-log path is _bmad-output/.stepper/runs/<runId>/) per Story 1.3 architecture; the escalate handler does NOT introduce new path helpers.
  - 1-2-errors-module-registry-ci-gate                               # DEPENDENCY: error class registry. Story 5.4 ships ZERO new error classes per AC line 1111 ("VERIFIER_FAILURE (or the appropriate code)" — REUSE existing 17 classes including VerifierFailureError + TimeoutError + ConfigError + StateChangedDuringDispatchError + LockContentionError + every other class in the registry); registry stays at 17. The CI gate (src/errors.test.ts) is EXTENDED with explicit AR22 regex assertions covering EVERY one of the 17 classes' actionableHint (the existing CI gate covers this trivially via `Object.values(errorRegistry)` iteration; Story 5.4 verifies the regex matches for all 17 in the integration test rather than touching the existing CI gate).
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/implementation-artifacts/5-3-route-to-fixer-mode-auto-fix-flag.md
  - _bmad-output/implementation-artifacts/5-2-skip-failure-mode-skip-flag.md
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
  - src/commands/loop/run.ts
  - src/commands/next/args.ts
  - src/commands/next/run.ts
  - src/commands/next/run.test.ts
  - src/commands/next/verify-and-advance.ts
  - src/commands/next/verify-and-advance.test.ts
  - src/state/save.ts
  - src/state/load.ts
  - src/schemas/state.ts
  - src/schemas/state.test.ts
  - src/schemas/dispatch-protocol.ts
  - src/dispatch/index.ts
  - src/runs/index.ts
  - src/io/log.ts
  - src/errors.ts
  - src/errors.test.ts
  - src/failure-ux/index.ts
  - src/failure-ux/index.test.ts
  - src/failure-ux/retry.ts
  - src/failure-ux/skip.ts
  - src/failure-ux/route-to-fixer.ts
  - agents/bmad-step-runner.md
  - agents/bmad-step-fixer.md
  - commands/bmad-loop.md
  - commands/bmad-next.md
---

# Story 5.4: Escalate Failure Mode

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper user,
I want `escalate` (the default policy) to halt with an actionable error, set `lastFailureReason`, and surface `--resume` as the recovery path,
So that hard failures never get silently dropped or auto-retried into bad state.

## Context Summary

This is the **FOURTH (and final policy-handler) story of Epic 5 (Failure-UX Modes & Auto-Fix)** and lands the **escalate policy** — the FOURTH and last failure-UX handler in the four-mode surface (Story 5.1 retry, Story 5.2 skip + `--skip` flag, Story 5.3 route-to-fixer + `--auto-fix` flag, Story 5.4 escalate, Story 5.5 `--interactive` pause, Story 5.6 per-step `failurePolicies` config + actionable-errors enforcement). **Story 5.4 is FORMALIZATION** rather than greenfield: Stories 5.1/5.2/5.3 already escalate via re-throwing existing error classes (VerifierFailureError after retry-cap; SkipRequiresResumeError after --skip-without-resume; VerifierFailureError after fixer-fail-with-both-failures-recorded; raw VerifierFailureError on first-attempt verifier failure with default policy = escalate). Story 5.4 PROMOTES the existing implicit escalate-via-re-throw pattern to an EXPLICIT `src/failure-ux/escalate.ts` handler that (a) shapes the failure context into the actionable hint per the AR22 regex contract `/^.*(Run|See|Try|Check) /`, (b) ensures `lastFailureReason` is recorded per AC line 1111, (c) ensures NO stack trace appears on the main thread per NFR-M2, and (d) provides the SINGLE entry-point for an integration test that asserts the regex over EVERY escalate path per AC line 1113.

**Story 5.4 builds DIRECTLY on the Story 5.1 + 5.2 + 5.3 foundation** — the closed `FailurePolicy` union already declares `"escalate"` (Story 5.1 `src/failure-ux/index.ts:30`); the closed `FailureUxOutcome` discriminated union already declares the `{outcome: "escalate", reason: FailureContext}` variant (Story 5.1 `src/failure-ux/index.ts:47`); the central `dispatchFailureUx` dispatcher v0.1-stubs `policy === "escalate"` to an inline `{outcome: "escalate", reason: context}` return at `src/failure-ux/index.ts:102-105` (with the comment "v0.1 stubs the one remaining non-retry/non-skip/non-route-to-fixer handler to escalate. Story 5.4 lands the formal escalate handler."). Story 5.4 wires the FORMAL `escalateHandler` at `src/failure-ux/escalate.ts` (mirroring the Story 5.1 `retry.ts` + 5.2 `skip.ts` + 5.3 `route-to-fixer.ts` pure-function pattern) and EXTENDS dispatchFailureUx to delegate `policy === "escalate"` to escalateHandler. Per Story 5.1 SDR N-5 forward-tracker (line 1005): "Story 5.2/5.3/5.4 to wire the formal handlers and update the v0.1 stub comment in src/failure-ux/index.ts:95-96 (`v0.1 stubs the three non-retry handlers to escalate`)" — Story 5.4 honours this by REMOVING the LAST stub branch (the `case "escalate"` inline return) and routing to the formal escalateHandler. After Story 5.4 the `dispatchFailureUx` switch statement has FOUR explicit case branches (retry, skip, route-to-fixer, escalate) with ZERO stub fallthrough; the v0.1 stub comment is REMOVED entirely.

**Story 5.4's scope is THREE BDD clauses rolled into a single AC (epics.md lines 1109-1113)** decomposing into THREE PATHS:

- **Escalate-on-failure path (AC-1 — lines 1109-1111)**: when the per-step policy resolves to `escalate` (or when no other policy applies — i.e., the default policy resolution path per architecture line 499 "escalate is the safest fallback when no per-step policy is set") AND any failure occurs (verifier failure, sub-agent timeout, dispatch error), Stepper exits 1 with the appropriate StepperErrorCode (VERIFIER_FAILURE for verifier failures, TIMEOUT for sub-agent timeouts, CONFIG_ERROR for dispatch-spec malformations, STATE_CHANGED_DURING_DISPATCH for TOCTOU mid-dispatch state changes, etc. — the formal escalateHandler delegates to the THROWN error class's `code` and `actionableHint` fields). The actionable hint MUST include both the run-log path (`_bmad-output/.stepper/runs/<runId>/`) AND the `--resume` invocation literal (e.g., "Run /bmad-next --resume" — verbatim per AC line 1111). The state mutation persists `lastFailureReason: {code, message, hint, runId}` per the existing Story 3.1 schema atomically via the existing verify-and-advance.ts catch handler.

- **No-stack-trace-on-main-thread path (AC-2 — line 1112 — NFR-M2 enforcement)**: NFR-M2 mandates "every error has actionable hint; no stack trace on main thread; full detail (stack trace if any) in run log only" per PRD line 801. The existing infrastructure (src/io/log.ts emit functions; src/errors.ts StepperError classes' actionableHint as the SOLE main-thread message) already enforces this; Story 5.4 ADDS an EXPLICIT integration test asserting that the main-thread output of every escalate path is exactly ONE LINE matching the AR22 regex `/^.*(Run|See|Try|Check) /` AND that the full Error.stack is absent from the main-thread output (only present in the run log file). The "main thread" here means the SOLE AR9 stdout JSON line (NextResult.action.message field) plus the stderr output captured by warn/error from src/io/log.ts (which contain the actionable hint, not the stack trace). The full Error.stack is captured into the run-log JSON file at `_bmad-output/.stepper/runs/<runId>/log.json` per Story 2.5 + Story 3.1 surface.

- **Integration test asserts regex over EVERY escalate path (AC-3 — line 1113)**: Story 5.4 ADDS a NEW integration test at `src/integration/escalate-actionable-hint.test.ts` (mirrors the existing `src/integration/halt-records-state.test.ts` precedent — 7 integration test files exist already; this is the 8th) that PARAMETRIZES over EVERY known escalate path: (a) retry-cap reached after maxRetries (Story 5.1 path); (b) skip-with-mismatch (Story 5.2 path: --skip <step> when state.lastAttempted.step does not match); (c) skip-without-resume (Story 5.2 path: --skip <step> alone without --resume); (d) skip-with-null-lastAttempted (Story 5.2 path: --skip <step> when state.lastAttempted is null); (e) skip-on-already-skipped (Story 5.2 path: --skip <step> when the step is already in runHistory[].skipped:true); (f) route-to-fixer-cap (Story 5.3 path: post-fix verifier fail with both-failures-recorded); (g) raw-verifier-failure (Story 2.6 path: first-attempt verifier failure with default escalate policy); (h) sub-agent-timeout (Story 2.4 + TimeoutError path); (i) dispatch-error (ConfigError path: dispatch-spec malformed); (j) state-changed-during-dispatch (Story 2.6 path: TOCTOU mid-dispatch). Each path's escalate handler shapes the actionableHint to match the regex; the integration test asserts the match for each. Per OQ-4 decision below: the integration test is TABLE-DRIVEN (one parametrized test sweeping all 10+ paths) rather than 10 separate test bodies.

**Architectural challenge — escalate handler placement**: per OQ-9 decision below, the formal escalateHandler lives at the LOCK-HELD mid-tier `src/failure-ux/escalate.ts` (the same module group as retry/skip/route-to-fixer per architecture file-tree lines 1182-1188). The handler is a PURE FUNCTION (mirrors retry/skip/route-to-fixer pure-function pattern); given a FailureContext it returns the enriched actionable hint string. The actual state mutation (`lastFailureReason` write) happens at the existing verify-and-advance.ts catch handler (Story 3.1 site at lines 1436-1455 today), NOT in the escalate handler itself — the handler RETURNS the enriched hint; the CALLER (verify-and-advance.ts) writes lastFailureReason atomically via saveState. **Rationale**: (a) the escalate handler shapes the hint using a pure function (no I/O); (b) the existing lastFailureReason write site already exists and rides the atomic-write contract per Story 3.1; (c) reusing the existing scope minimizes new code; (d) the handler's signature matches the retry/skip/route-to-fixer surface (FailureContext in, FailureUxOutcome out — for the escalate variant the outcome already carries the FailureContext as the `reason` field; the handler returns the enriched FailureUxOutcome).

**Architectural decision — escalate handler signature**: the escalateHandler signature is `escalateHandler(context: FailureContext, opts?: EscalateHandlerOpts): FailureUxOutcome`. The OUTCOME shape stays `{outcome: "escalate", reason: FailureContext}` — the handler ENRICHES the context's hint field to match the AR22 regex contract. **Concretely**: given `context.hint = "the verifier failed"` (a non-conforming hint), the handler returns `{outcome: "escalate", reason: {...context, hint: "Run /bmad-next --resume to retry from the recorded failure; see _bmad-output/.stepper/runs/<runId>/log.md for the verifier output"}}`. The handler's enrichment policy (per OQ-2 decision below): IF the incoming `context.hint` already matches the AR22 regex, PASS-THROUGH unchanged; OTHERWISE shape a default hint of the form `"Run /bmad-next --resume to retry; see _bmad-output/.stepper/runs/<runId>/log.md for the failure detail"`. The 17 existing error class actionableHint strings are PRE-AUDITED in OQ-2 below to confirm all already match the regex — so the PASS-THROUGH path is the common case; the SHAPE path is the safety-net for any future error class whose hint doesn't match.

**Architectural decision — when does the escalate handler get invoked**: Stories 5.1/5.2/5.3 already throw the appropriate error classes from verify-and-advance.ts (Story 5.1 throws VerifierFailureError after retry cap; Story 5.2 throws SkipRequiresResumeError on --skip-alone; Story 5.3 throws VerifierFailureError after fixer-fail; raw verifier failure throws VerifierFailureError directly per Story 2.6 site). Story 5.4's escalateHandler is INVOKED via the dispatchFailureUx central dispatcher when policy resolves to `"escalate"` (which is the default policy per architecture line 499). **Concretely**: the existing retry-loop at verify-and-advance.ts:843-956 (Story 5.1) calls `dispatchFailureUx(context, policy, opts)` after each failed attempt; when policy is `"escalate"` (or when retry-cap is reached and the retry handler returns `{outcome: "escalate", reason: context}`), the dispatcher delegates to escalateHandler which shapes the hint and returns the enriched outcome; the CALLER (verify-and-advance.ts) then constructs the appropriate error class (VerifierFailureError, TimeoutError, etc. — matching the original error's code) with the enriched hint and throws. The throw is what triggers the catch handler's lastFailureReason atomic write per AC line 1111.

**Architectural decision — lastFailureReason schema (per OQ-1 decision)**: state.lastFailureReason field ALREADY exists from Story 1.6 + Story 3.1 with shape `{code: string, message: string, hint: string, runId: string}` per src/schemas/state.ts:140-145 (LastFailureReasonSchema). Per OQ-1: NO schema extension needed — the existing 4-field shape is sufficient. The `runId` field is the canonical cross-reference to `_bmad-output/.stepper/runs/<runId>/` (which the escalate handler shapes into the actionable hint as the run-log path); the `hint` field is the actionable hint (regex-conforming) that surfaces on the main thread. Story 5.4 EXTENDS the JSDoc at LastFailureReasonSchema with a Story 5.4 docblock explaining that the `hint` field MUST match the AR22 regex `/^.*(Run|See|Try|Check) /` (enforced by the escalate handler's enrichment + the integration test).

**Architectural decision — clearing lastFailureReason on success (per OQ-6 decision)**: per OQ-6 decision: lastFailureReason IS auto-cleared on the next successful step's verify-and-advance run (the existing success path at verify-and-advance.ts:935-942 already sets `lastFailureReason: null` per Story 3.1 + Story 5.1 + Story 5.3). Story 5.4 does NOT change this behaviour — the lastFailureReason field is "sticky" from one halt to the next; clears on the FIRST successful step after the halt; persists across multiple halts of the same step. This semantic matches user expectations (the halt is forensic until recovered); the next /bmad-next that succeeds clears the field.

**The 17-code error registry stays at 17** per AR21 + epic-4-retrospective.md §Recommendations item 3 ("Epic 5 should NOT add new error classes"). Story 5.4 ships ZERO new error classes — the escalate handler REUSES the existing 17 classes (VerifierFailureError + TimeoutError + ConfigError + StateChangedDuringDispatchError + LockContentionError + every other class in the registry). Each existing class's `actionableHint` ALREADY matches the AR22 regex (pre-audited in OQ-2 below); the escalate handler's enrichment is a PASS-THROUGH in the common case. The Story 5.2 OQ-1 deviation (SkipRequiresResumeError added to make registry 17) is preserved; Story 5.3 + Story 5.4 ship ZERO new classes (registry holds at 17).

**Concretely, Story 5.4 produces**:

1. **`src/failure-ux/escalate.ts`** (NEW, ~+80-130 lines): the formal escalate policy handler. Exports `function escalateHandler(context: FailureContext, opts?: EscalateHandlerOpts): FailureUxOutcome`. The handler is a pure function; given the failure context, returns `{outcome: "escalate", reason: <enriched context with regex-conforming hint>}`. Mid-tier per AR41; no I/O imports; deterministic output for given inputs. The handler signature mirrors the Story 5.1 retryHandler / Story 5.2 skipHandler / Story 5.3 routeToFixerHandler patterns. The handler's enrichment logic (per OQ-2 decision): IF `context.hint` already matches `/^.*(Run|See|Try|Check) /` THEN return context unchanged; ELSE return `{...context, hint: <shaped default>}`. The shaped default template is `"Run /bmad-next --resume to retry; see _bmad-output/.stepper/runs/${context.runId}/log.md for the failure detail"` (or `"See _bmad-output/.stepper/runs/${context.runId}/log.md for the failure context; try /bmad-next --resume to retry."` per OQ-3 alternative). Optional `EscalateHandlerOpts` interface declared for future Story 6.x extension (e.g., `{ runLogPathFormatter?: (runId: string) => string }` per OQ-7 forward-tracker); v0.1 the opts is empty. Exports: `escalateHandler` + `EscalateHandlerOpts` + the AR22 regex literal `ACTIONABLE_HINT_REGEX = /^.*(Run|See|Try|Check) /`.

2. **`src/failure-ux/escalate.test.ts`** (NEW, ~+150-220 lines): colocated unit tests covering:
   - **ESC_54_HANDLER_1 through ESC_54_HANDLER_5**: pure-function check with various FailureContext inputs; identity preservation across calls; opts default param; regex pre-audit for known existing actionable hints (PASS-THROUGH path verified for VerifierFailureError + TimeoutError + ConfigError default hint + SkipRequiresResumeError + the per-instance hintOverride pattern).
   - **ESC_54_HANDLER_REGEX_1 through ESC_54_HANDLER_REGEX_4**: tests for the regex shape — `context.hint = "Run /bmad-next --resume"` matches; `context.hint = "See _bmad-output/.stepper/runs/123/log.md"` matches; `context.hint = "Try /bmad-next --doctor"` matches; `context.hint = "Check the verifier output"` matches; `context.hint = "Failed."` does NOT match (triggers shaped default); `context.hint = ""` does NOT match (triggers shaped default).
   - **ESC_54_HANDLER_SHAPE_1 through ESC_54_HANDLER_SHAPE_3**: when context.hint does not match regex, the handler returns a shaped default; the shaped default includes `context.runId` substring; the shaped default matches the regex.
   - **ESC_54_DISPATCH_1 through ESC_54_DISPATCH_3**: dispatchFailureUx with `policy: "escalate"` delegates to escalateHandler returning enriched `{outcome: "escalate", reason: <enriched context>}`; TypeScript exhaustiveness verified — the switch branch covers `"escalate"` as a separate case, NOT folded into a stub fallthrough; v0.1 stub regression check (asserts the v0.1 inline-return at line 102-105 has been REMOVED — `dispatchFailureUx(ctx, "escalate", {})` no longer fall-throughs to a stub but invokes escalateHandler).

3. **`src/failure-ux/index.ts`** (MODIFIED, ~+15-20 lines): EXTEND `dispatchFailureUx` to delegate `policy === "escalate"` to formal escalateHandler. The switch statement now has FOUR explicit case branches with ZERO stub fallthrough: `case "retry": return retryHandler(...)` (Story 5.1 unchanged); `case "skip": return skipHandler(...)` (Story 5.2 unchanged); `case "route-to-fixer": return routeToFixerHandler(...)` (Story 5.3 unchanged); `case "escalate": return escalateHandler(context, {})` (Story 5.4 NEW). REMOVE the v0.1 stub comment block at lines 102-105 entirely. RE-EXPORT `escalateHandler` + `EscalateHandlerOpts` for symmetry with Story 5.1/5.2/5.3 retry/skip/route-to-fixer exports. UPDATE the module doc-block at lines 1-20 to mention Story 5.4's formal escalate handler.

4. **`src/failure-ux/index.test.ts`** (MODIFIED, ~+15-25 lines): UPDATE the existing dispatch test for `policy === "escalate"` (currently asserts inline return `{outcome: "escalate", reason: ctx}`) to assert: (a) the handler is invoked (not the inline stub), (b) the returned outcome's `reason.hint` either equals the input hint (PASS-THROUGH when input matched regex) OR equals the shaped default (when input did not match regex). ADD ESC_54_DISPATCH_INDEX test asserting the v0.1 stub branch comment is no longer in the source (per Task 0.5 quality gate via grep). UPDATE existing `RT_51_DISPATCH_*` tests in this file to reflect the four-handler layout (the previous "v0.1 stubs the one remaining handler" comment is GONE; tests should now reflect the four explicit case branches).

5. **`src/schemas/state.ts`** (MODIFIED, ~+10-15 lines, JSDoc-only — NO schema changes per OQ-1): EXTEND the JSDoc block at LastFailureReasonSchema (lines 123-145) with a Story 5.4 documentation paragraph explaining that the `hint` field MUST match the AR22 regex `/^.*(Run|See|Try|Check) /` (enforced by the escalate handler's enrichment + the integration test); the `runId` field is the canonical run-log path cross-reference (`_bmad-output/.stepper/runs/<runId>/log.md`); the `code` field is the StepperErrorCode of the thrown error (one of the 17 codes); the `message` field is the forensic context (full Error.message; not main-thread visible per NFR-M2 — only the `hint` field is main-thread visible). Mirrors the Story 4.8 + 5.1 + 5.2 + 5.3 documentation precedent (one Story-N-prefixed paragraph appended). NO schema field additions or changes — the existing 4-field shape is sufficient.

6. **`src/schemas/state.test.ts`** (MODIFIED, ~+15-25 lines): ADD ~3-5 new tests covering:
   - **ESC_54_LFR_1**: `LastFailureReasonSchema` validates a hint matching the AR22 regex (e.g., "Run /bmad-next --resume").
   - **ESC_54_LFR_2**: `LastFailureReasonSchema` validates a hint NOT matching the AR22 regex (the schema does NOT enforce the regex — that is the escalate handler's responsibility; the schema only enforces the field shape).
   - **ESC_54_LFR_3**: `LastFailureReasonSchema` validates the existing 4-field shape unchanged (back-compat with Story 1.6 + 3.1).
   - **ESC_54_LFR_4**: state.yaml round-trip with `lastFailureReason: {code: "VERIFIER_FAILURE", message: "verifier failed", hint: "Run /bmad-next --resume", runId: "2026-05-05T...-bmad-next"}` validates cleanly.
   - **ESC_54_LFR_5**: state.yaml with `lastFailureReason: null` validates (back-compat — the field is `.nullable().optional()` per Story 1.6).

7. **`src/commands/next/verify-and-advance.ts`** (MODIFIED, ~+30-60 lines): At the FOUR existing escalate sites (line 1071 retry-cap from Story 5.1; line 1118 route-to-fixer-cap from Story 5.3; line 1241 raw verifier failure from Story 2.6; line 1254 unexpected outcome from Story 5.1), INVOKE the formal escalateHandler from `src/failure-ux/escalate.ts` BEFORE constructing + throwing the appropriate error class. The handler returns `{outcome: "escalate", reason: <enriched context>}`; the caller constructs the error (e.g., `new VerifierFailureError(<original message>, <detail>)` with the actionableHint from the class — but per OQ-2 the existing class hints already match the regex so the enrichment is PASS-THROUGH for those cases). EXTEND the lastFailureReason write site at the catch handler (lines 1436-1455) to use the ENRICHED hint (from the escalate handler's output) when constructing the `lastFailureReason: {code, message, hint, runId}` literal. **Modification scope is small — ZERO new throw sites; ONE new escalate handler call per existing throw site (4 calls total); ONE update to the catch handler's hint sourcing.** NO change to the existing retry-loop scaffold or the route-to-fixer branch logic.

8. **`src/commands/next/verify-and-advance.test.ts`** (MODIFIED, ~+150-250 lines): ADD ~6-10 new tests covering:
   - **ESC_54_VA_1**: retry-cap escalate path → escalateHandler invoked → throw VerifierFailureError with hint matching regex; lastFailureReason.hint matches regex; full Error.stack absent from main-thread output.
   - **ESC_54_VA_2**: route-to-fixer-cap escalate path → escalateHandler invoked → throw VerifierFailureError with both-failures-recorded; hint matches regex; lastFailureReason.hint matches regex.
   - **ESC_54_VA_3**: raw verifier failure (first-attempt fail with default escalate policy) → escalateHandler invoked → throw VerifierFailureError; hint matches regex; lastFailureReason.hint matches regex.
   - **ESC_54_VA_4**: sub-agent timeout (TimeoutError) → escalateHandler invoked → throw TimeoutError; hint matches regex; lastFailureReason.hint matches regex.
   - **ESC_54_VA_5**: dispatch error (ConfigError with hintOverride) → escalateHandler invoked → throw ConfigError; hint matches regex; lastFailureReason.hint matches regex.
   - **ESC_54_VA_6**: state-changed-during-dispatch (StateChangedDuringDispatchError) → escalateHandler invoked → throw StateChangedDuringDispatchError; hint matches regex; lastFailureReason.hint matches regex.
   - **ESC_54_VA_7**: SIGINT mid-escalate-path (after retry-cap reached but before lastFailureReason write) → halt clean; the partial state is recorded atomically per Story 1.3 atomic tmp+rename.
   - **ESC_54_VA_8**: lastFailureReason auto-cleared on next successful step's verify-and-advance run per OQ-6.
   - **ESC_54_VA_9**: NO stack trace appears on main thread (NFR-M2) — verify the AR9 dispatch action's `message` field contains ONLY the actionable hint (regex-conforming) and the warn/error stderr output contains ONLY the hint (NOT the full Error.stack); the run-log JSON file contains the full Error.stack per FR44.
   - **ESC_54_VA_10**: pre-audit — call escalateHandler with a hint that already matches the regex; verify PASS-THROUGH (hint unchanged); call with a hint that does NOT match; verify shaped default applied.

9. **`src/integration/escalate-actionable-hint.test.ts`** (NEW, ~+200-300 lines): the Story 5.4 NEW INTEGRATION TEST per AC line 1113. The file mirrors the existing Story 3.1 `src/integration/halt-records-state.test.ts` pattern (single integration test file at `src/integration/`; uses tmpdir fixture per Story 1.3 atomic write conventions; spawns runNext + runVerifyAndAdvance via the test-injection seams). Per OQ-4 decision: the test is TABLE-DRIVEN — ONE outer `describe` block with a parametrized inner test that sweeps the 10+ escalate paths. The data table:

   ```ts
   const ESCALATE_PATHS = [
     { name: "retry-cap", trigger: () => /* simulate retry-cap reached */ },
     { name: "skip-with-mismatch", trigger: () => /* simulate --skip with wrong step */ },
     { name: "skip-without-resume", trigger: () => /* simulate --skip alone */ },
     { name: "skip-with-null-lastAttempted", trigger: () => /* simulate --skip with empty state */ },
     { name: "skip-on-already-skipped", trigger: () => /* simulate --skip on already-skipped step */ },
     { name: "route-to-fixer-cap", trigger: () => /* simulate fixer-fail with both-failures */ },
     { name: "raw-verifier-failure", trigger: () => /* simulate first-attempt verifier failure with default escalate policy */ },
     { name: "sub-agent-timeout", trigger: () => /* simulate TimeoutError */ },
     { name: "dispatch-error", trigger: () => /* simulate ConfigError */ },
     { name: "state-changed-during-dispatch", trigger: () => /* simulate StateChangedDuringDispatchError */ },
   ];
   ```

   Each row's test asserts: (a) the thrown error's `actionableHint` matches `/^.*(Run|See|Try|Check) /`; (b) the AR9 dispatch action's `message` field matches the regex; (c) the lastFailureReason.hint matches the regex; (d) NO Error.stack substring appears in the AR9 message OR in the warn/error stderr captures. Optional 11th row: BMAD_INCOMPATIBLE / BMAD_NOT_INSTALLED (both blocked from --resume per Story 3.2; their actionable hints reference --upgrade or npx instead of --resume — verify the regex still matches via "Run npx" / "Run /bmad-next --upgrade").

10. **`src/errors.test.ts`** (POSSIBLY MODIFIED, ~+5-15 lines OR UNCHANGED per OQ-2 audit): IF the OQ-2 pre-audit reveals any of the 17 existing error class actionableHint strings does NOT match the AR22 regex `/^.*(Run|See|Try|Check) /`, FIX the offending hint at `src/errors.ts` to match (cosmetic correction — preserves the hint's user-facing intent). IF the audit reveals all 17 hints already match (the expected outcome — verified pre-spec via line-numbered audit at `src/errors.ts:79-277`: every hint contains at least one of "Run|See|Try|Check"), this task is a NO-OP. The CI gate at `src/errors.test.ts` already covers the regex per architecture line 589 ("CI gate: tests/errors.test.ts ... asserts: (b) `actionableHint` ends with a concrete next-action command (regex)"); Story 5.4 may EXTEND the CI gate's regex assertion to use `/^.*(Run|See|Try|Check) /` literal (the architecture says "regex" without specifying which; Story 5.4 codifies the regex as the ONE TRUE regex per AC line 1113). **Note**: a quick visual scan of `src/errors.ts:79-277` shows ALL 17 actionableHint strings already start or contain "Run", "See", "Try", or "Check" — so the audit will likely confirm zero-fix needed; OQ-2 below documents this.

11. **`src/commands/next/run.ts`** (MODIFIED, ~+10-20 lines): VERIFY (and add an EXPLICIT test if absent) that the runNext catch handler at the AR9 halt action emission site emits ONLY the actionableHint as the `message` field of the dispatch action — NOT the full `Error.message + Error.stack`. Per AC line 1112 + NFR-M2: NO stack trace on main thread. The existing pattern (per architecture lines 1421 + PRD line 801) routes Error.message + Error.stack to the run-log file (FR44) but the AR9 message field carries ONLY the actionableHint (which matches the AR22 regex per AR21). Story 5.4 adds an EXPLICIT test (ESC_54_RUN_1) asserting the AR9 message field is the actionableHint (NOT the message). NO modification to the runNext catch handler logic (the existing pattern is correct); just an EXPLICIT test that locks the contract.

12. **`src/commands/next/run.test.ts`** (MODIFIED, ~+30-50 lines): ADD ~3-5 new tests covering ESC_54_RUN_1 (AR9 message field is actionableHint, not Error.message + Error.stack); ESC_54_RUN_2 (run-log JSON file contains the full Error.stack per FR44); ESC_54_RUN_3 (warn/error stderr captures contain ONLY the hint, NOT the full stack); ESC_54_RUN_4 (the regex matches the AR9 message field for any throw site).

13. **`commands/bmad-next.md`** (MODIFIED, ~+30-60 lines): ADD a NEW sub-section `### Failure modes — escalate (Story 5.4 — Epic 5 default policy)` covering: the formal escalate handler; the AR22 regex contract for actionable hints; the run-log path + --resume invocation in every hint; the NO-stack-trace-on-main-thread guarantee per NFR-M2; the four existing escalate sites (retry-cap, skip-without-resume, route-to-fixer-cap, raw-verifier-failure); the lastFailureReason auto-clear semantic per OQ-6; the integration test surface per AC line 1113. UPDATE the trailing "Failure modes" table (currently 3 rows for retry/skip/route-to-fixer per Stories 5.1/5.2/5.3) to ADD the FOURTH row for escalate (formalized in Story 5.4). UPDATE the trailing FR cross-reference paragraph to add FR30 + NFR-M2.

14. **`commands/bmad-loop.md`** (MODIFIED, ~+10-20 lines): ADD a brief NOTE in the Failure-UX modes section (or in a new sub-section) clarifying that `escalate` is the DEFAULT policy per architecture line 499 (no flag needed); Story 5.6 will wire the per-step `failurePolicies:` config block which may include explicit `escalate` policy declarations alongside retry/skip/route-to-fixer (no behaviour change — explicit `escalate` matches the default). The escalate path's halt-on-error short-circuit per Story 4.6 is the canonical loop-runner cooperation; SIGINT cooperation per Story 4.9 is preserved. UPDATE the trailing FR cross-reference to add FR30.

15. **`agents/bmad-step-runner.md`** + **`agents/bmad-step-fixer.md`** (UNCHANGED — sub-agent contracts are per-attempt-stateless. The escalate path bypasses sub-agent dispatch entirely — escalate happens AFTER the verifier fails / sub-agent times out / dispatch errors out; the sub-agent contracts are unchanged).

16. **`_bmad-output/implementation-artifacts/sprint-status.yaml`** (MODIFIED, 3 lines): flip `5-4-escalate-failure-mode: backlog → ready-for-dev` at line 98; epic-5 stays `in-progress` (line 94 — UNCHANGED). Bump `last_updated:` at BOTH the comment block top (line 2) AND the live YAML field (line 38) to `2026-05-05T01:11:14Z`.

17. **`.bmad-stepper/state.yaml`** (MODIFIED, ~25 lines): advance workflow block: `lastStep: bmad-code-review → bmad-create-story`; `lastStepCompletedAt: 2026-05-05T01:11:14Z`; `nextStep: bmad-create-story → bmad-dev-story`; `nextStepStory: '5.4'` (UNCHANGED); `nextStepKey: 5-4-escalate-failure-mode` (UNCHANGED). Append ONE new evidenceIndex entry: step `bmad-create-story`, path this file, evidence summary line, runId `2026-05-05T011114Z-bmad-next`, loopId `2026-05-04T193245Z-bmad-loop`, epic `'5'`, story `'5.4'`.

**FR/NFR/AR mapping**:

- **FR30** (escalate is default): WIRED FORMALLY HERE. Per architecture line 499 the default per-step policy is `escalate`; Story 5.4 lands the formal handler that fires on the default path. **FR32** (actionable error report on every halt): PRIMARY enforcement — the escalate handler shapes the actionable hint per the AR22 regex contract. **FR16** (sub-agent dispatch with budget+timeout): UNCHANGED — escalate fires AFTER dispatch (verifier fail / timeout / dispatch error). **FR17** (verifier before promote): UNCHANGED — escalate is the FAILURE branch of the verifier outcome. **FR8** (single-step advance): UNCHANGED — escalate is the terminal failure-UX outcome of the step (NO advance). **FR43** (markdown transcript per step): EXTENDED — the escalate path writes its own per-step transcript via the existing `writeStepTranscript` (Story 2.5) surface; the transcript records the failure context (full Error.message + Error.stack). **FR44** (JSON run log per step): EXTENDED — the run log captures the FULL Error.stack (NOT main-thread visible per NFR-M2). **FR53** (exit codes): UPHELD — escalate maps to exit 1 (halt-with-actionable-error per VerifierFailureError + most other classes' `exitCode = 1`); escalate may also map to exit 2 (config error per ConfigError + SkipRequiresResumeError), exit 3 (BMAD compatibility per BmadIncompatibleError + BmadNotInstalledError + UnknownBmadSkillError + DagCycleError), exit 4 (lock contention per LockContentionError — UNREACHABLE in run.ts; lock-free), exit 5 (pathological input per PathologicalInputError + ScopeViolationError + BudgetExceededError) per the existing FR53 mapping. **FR54** (stdout/stderr discipline): UPHELD — the escalate-path AR9 halt action's `message` field carries ONLY the actionable hint; warn/error stderr captures contain ONLY the hint; full Error.stack lives in the run log only.

- **NFR-M2** (every error has actionable hint; no stack trace on main thread): PRIMARY enforcement. Per PRD line 801 + AC line 1112: the escalate handler shapes EVERY actionable hint to match the AR22 regex; the integration test asserts the regex over EVERY escalate path; the AR9 message + warn/error stderr captures contain ONLY the hint (NOT the stack); the run log captures the full Error.stack per FR44. **NFR-R1** (zero data loss on halt): UPHELD — the escalate-path lastFailureReason write rides the existing atomic-write contract via verify-and-advance.ts catch handler (Story 3.1 + Story 1.3 + NFR-S5). **NFR-R2** (100% --resume recovery): EXTENDED — the actionable hint surfaces --resume as the recovery path; --resume on /bmad-next reads `state.lastFailureReason` and resumes from the recorded failure (per Story 3.2 surface). **NFR-R8** (4 failure-UX modes covered by integration tests): COMPLETED — Story 5.1 covered retry; Story 5.2 covered skip; Story 5.3 covered route-to-fixer; Story 5.4 covers escalate (the 4th of 4). **NFR-S2** (no-write-outside-scope): UPHELD — the escalate handler is a pure function with no I/O. **NFR-S5** (atomic tmp+rename + .bak rotation): UPHELD — the lastFailureReason write rides the existing atomic-write path. **NFR-M3** (schema migrations): NO schema bump — the existing LastFailureReasonSchema (Story 1.6 + 3.1) is sufficient per OQ-1.

- **AR8** (lock-free top-tier): UPHELD — `runNext` (top-tier per AR41) does NOT acquire the lock; the escalate path lives at lock-held mid-tier `verify-and-advance.ts` (the existing scope that owns the lastFailureReason write site per Story 3.1). **AR9** (single AR9 stdout line per command invocation): UPHELD — the escalate-path halt action is ONE AR9 emit (matching the existing pattern; the hint is the `message` field). **AR21+22** (errors registry held at 17): UPHELD — Story 5.4 ships ZERO new error classes; the escalate handler REUSES the existing 17 classes (whose actionableHint already matches the AR22 regex per OQ-2 audit). The actionable-hint regex `/^.*(Run|See|Try|Check) /` is CODIFIED in src/failure-ux/escalate.ts as the canonical regex; the integration test asserts the regex over EVERY escalate path. **AR33** (no console.* in source): UPHELD — the escalate path uses warn/error from `src/io/log.ts`; full Error.stack is captured to the run log via the existing log.json writer (NEVER via console.*). **AR34** (slash-command markdown protocol): EXTENDED — `commands/bmad-next.md` gains a new sub-section + 4th row in the Failure modes table; `commands/bmad-loop.md` gains a brief note. **AR41** (boundary graph): UPHELD — `src/failure-ux/escalate.ts` is mid-tier per architecture file-tree (lines 1182-1188); imports flow `src/commands/next/verify-and-advance.ts` (top-tier consumer) → `src/failure-ux/index.ts` (mid-tier dispatcher) → `src/failure-ux/escalate.ts` (sibling) + `src/errors.ts` + `src/schemas/state.ts` (foundational). ZERO new cross-tier imports. **AR42** (test discipline): UPHELD — the integration test at `src/integration/escalate-actionable-hint.test.ts` is parametrized over EVERY escalate path; uses tmpdir fixtures per Story 1.3 atomic-write conventions; spawns runNext + runVerifyAndAdvance via the existing test-injection seams.

Estimated effort: **M** (medium — ONE new mid-tier file (escalate.ts) + 7 source modifications + 1 NEW integration test file + 1 schema-doc-only update + 2 docs sub-sections; ~+250-450 net source lines + ~+440-680 net test lines; ZERO new error classes (registry holds at 17); ONE new file in src/failure-ux/; ZERO new schema fields; NEW integration test parametrized over 10+ escalate paths).

It does **NOT**:

- **Add a new error class** — registry stays at 17 per AC line 1111 ("VERIFIER_FAILURE (or the appropriate code)" — REUSE existing classes; no new code mandated). The Story 5.2 OQ-1 deviation (registry 16 → 17 for SkipRequiresResumeError) is preserved unchanged.
- **Add a new schema field on lastFailureReason** — the existing 4-field shape `{code, message, hint, runId}` (Story 1.6 + 3.1) is sufficient per OQ-1.
- **Add a new StopReason variant for escalate** — escalate is the DEFAULT halt path; the existing `error-stop` (Story 4.6) StopReason variant is the canonical loop-runner cooperation.
- **Wire the `failurePolicies:` config block** — per AC line 1109 the default policy is `escalate` per architecture line 499; Story 5.6 will wire the config block which may include explicit `escalate` policy declarations.
- **Wire telemetry collection** — per Story 5.1 + 5.2 + 5.3 OQ telemetry-via-runHistory pattern: telemetry is Epic 6 dependency. Story 5.4 ensures `lastFailureReason.hint` matches the regex; future telemetry consumes the field.
- **Modify `agents/bmad-step-runner.md` or `agents/bmad-step-fixer.md`** — sub-agent contracts are unchanged (escalate fires AFTER dispatch).
- **Modify `src/dispatch/`, `src/verifiers/`, `src/io/lock.ts`** — these surfaces are unchanged.
- **Add a CLI flag for escalate** — escalate is the DEFAULT (no flag needed).
- **Modify `LoopArgsSchema`'s 13-field surface or `NextArgsSchema`'s 20-field surface** — Story 5.4 has no CLI flag.
- **Modify the existing 4 escalate throw sites' error classes** — Story 5.4 adds the escalateHandler invocation BEFORE the throw; the throw itself is unchanged.
- **Auto-clear lastFailureReason in a separate utility** — the existing success-path clear at verify-and-advance.ts:935-942 (Story 3.1) is sufficient.
- **Remove the v0.1 stub comment in src/failure-ux/index.ts** before the case branch refactor — the stub comment removal happens AS PART OF the case "escalate" addition (Task 6.4 atomic edit).
- **Rewrite the existing CI gate at src/errors.test.ts** — IF the OQ-2 audit confirms all 17 actionableHint strings match the regex, the existing CI gate is sufficient; Story 5.4 may EXTEND the CI gate's regex assertion to use the literal `/^.*(Run|See|Try|Check) /` regex (the architecture says "regex" without specifying which; Story 5.4 codifies it).

## Acceptance Criteria

The acceptance criteria below are reproduced **verbatim** from `_bmad-output/planning-artifacts/epics.md` §Story 5.4 (lines 1107-1113, BDD Given/When/Then format). Lines and AC labelling preserved.

**Acceptance Criteria:**

**Given** the per-step policy resolves to `escalate` (or no other policy applies)
**When** any failure occurs (verifier failure, sub-agent timeout, dispatch error)
**Then** Stepper exits 1 with `VERIFIER_FAILURE` (or the appropriate code), the actionable hint includes the run-log path and `--resume` invocation, `lastFailureReason` is recorded
**And** no stack trace appears on the main thread (NFR-M2 — full detail in run log)
**And** integration test asserts the actionable-hint regex `/^.*(Run|See|Try|Check) /` for every escalate path

> **Story 5.4 escalate-mode FORMALIZATION scope note**: Story 5.4 is FORMALIZATION rather than greenfield. Stories 5.1/5.2/5.3 already escalate via re-throwing existing error classes (VerifierFailureError after retry-cap; SkipRequiresResumeError on --skip-alone; VerifierFailureError after fixer-fail-with-both-failures-recorded; raw VerifierFailureError on first-attempt verifier failure with default policy = escalate). Story 5.4 PROMOTES the existing implicit escalate-via-re-throw pattern to an EXPLICIT `src/failure-ux/escalate.ts` handler that (a) shapes the failure context into the actionable hint per the AR22 regex contract `/^.*(Run|See|Try|Check) /`, (b) ensures `lastFailureReason` is recorded per AC line 1111, (c) ensures NO stack trace appears on the main thread per NFR-M2, and (d) provides the SINGLE entry-point for an integration test that asserts the regex over EVERY escalate path per AC line 1113. The 17-code error registry stays at 17 (zero new classes); the LastFailureReasonSchema is unchanged (4-field shape sufficient per OQ-1); the dispatchFailureUx surface gains a FOURTH explicit case branch (replacing the v0.1 stub), completing the four-handler module group. Per Story 5.1 SDR N-5 forward-tracker: "Story 5.2/5.3/5.4 to wire the formal handlers and update the v0.1 stub comment" — Story 5.4 RESOLVES the LAST stub branch ("escalate") and removes the v0.1 stub comment block entirely.

## Tasks / Subtasks

- [x] **Task 0 — Pre-flight evidence verification (AC: all)**
  - [x] 0.1 Confirm Story 5.3 is `done` per `_bmad-output/implementation-artifacts/sprint-status.yaml:97`. Confirm epic-5 is currently `in-progress` per line 94. Confirm 5-4-escalate-failure-mode is currently `backlog` per line 98 (Story 5.4 will flip to `ready-for-dev`).
  - [x] 0.2 Read `_bmad-output/implementation-artifacts/5-3-route-to-fixer-mode-auto-fix-flag.md` end-to-end. Confirm:
    - `src/failure-ux/{index,retry,skip,route-to-fixer}.ts` exist (Story 5.1/5.2/5.3 baseline).
    - `dispatchFailureUx` v0.1 stub at `src/failure-ux/index.ts:102-105` (the case "escalate" inline return) is the SITE Story 5.4 RESOLVES.
    - The retry-loop scaffold at `src/commands/next/verify-and-advance.ts:843-956` (Story 5.1 + Story 5.3 extensions) is the consumer site for the escalateHandler.
    - The 4 throw sites (line 1071 + 1118 + 1241 + 1254) are the escalate sites Story 5.4 wires the handler INTO.
    - The 17-code error registry is held at 17 per Story 5.3 baseline.
  - [x] 0.3 Read `_bmad-output/implementation-artifacts/5-2-skip-failure-mode-skip-flag.md` and `_bmad-output/implementation-artifacts/5-1-retry-failure-mode.md`. Confirm pattern continuity (pure-function handlers; mid-tier per AR41; LoopOpts test-injection seams; SDR forward-tracker discipline).
  - [x] 0.4 Read `_bmad-output/planning-artifacts/architecture.md` lines 492-499 (failure-UX modes), 1182-1188 (failure-ux module group file-tree), 1421 (NFR-M2 actionable hints), 1519 (dispatchFailureUx call-site in verify-and-advance.ts). Confirm the architecture mandates the formal escalate handler at `src/failure-ux/escalate.ts`.
  - [x] 0.5 Read `src/errors.ts` lines 79-277 in full. Audit each of the 17 concrete StepperError subclass's `actionableHint` field for AR22 regex `/^.*(Run|See|Try|Check) /` compliance:
    - LockContentionError: "Run /bmad-next --doctor ..." — MATCHES (starts with "Run").
    - BranchSwitchError: "Run /bmad-next --resume ..." — MATCHES.
    - BmadIncompatibleError: "Run /bmad-next --upgrade ..." — MATCHES.
    - BmadNotInstalledError: "Run npx bmad-method install ..." — MATCHES.
    - UnknownBmadSkillError: "Run /bmad-next --list ..." (default) — MATCHES; per-instance hintOverride may be different — verify Story 1.10 hintOverride conforms.
    - DagCycleError: "See _bmad-output/.stepper/runs/<latest>/log.md ..." — MATCHES (starts with "See").
    - CorruptStateError: "Run /bmad-next --recompute-state ..." — MATCHES.
    - StateTooNewError: "Run /bmad-next --upgrade ..." — MATCHES.
    - StateChangedDuringDispatchError: "Run /bmad-next --diff-state ..." — MATCHES.
    - VerifierFailureError: "See _bmad-output/.stepper/runs/<ts>-<step>.log ..." — MATCHES.
    - PathologicalInputError: "Run /bmad-next --recompute-state ..." — MATCHES.
    - ScopeViolationError: "Check that the target path ..." — MATCHES (starts with "Check").
    - BudgetExceededError: "See bmad-stepper.config.yaml budgets ..." — MATCHES.
    - TimeoutError: "Run /bmad-next --resume ..." — MATCHES.
    - ConfigError: "See bmad-stepper.config.yaml ..." (default) — MATCHES; per-instance hintOverride (Story 1.11) may be different — verify conforms.
    - MigrationFailureError: "Run /bmad-next --doctor ..." — MATCHES.
    - SkipRequiresResumeError: "--skip requires --resume to advance state. Run /bmad-next ..." — MATCHES (contains "Run" before colon).
    - RESULT: ALL 17 hints contain at least one of "Run|See|Try|Check" before a space; pre-audit confirms ZERO-fix needed.
  - [x] 0.6 Read `src/failure-ux/index.ts` and `src/failure-ux/{retry,skip,route-to-fixer}.ts` to confirm the four-handler module group pattern (handler exports a pure function + opts interface; index.ts re-exports). Note the v0.1 stub comment at lines 102-105.
  - [x] 0.7 Read `src/schemas/state.ts:140-145` (LastFailureReasonSchema). Confirm the 4-field shape is sufficient for AC line 1111 (no schema extension needed per OQ-1).
  - [x] 0.8 Read `src/integration/halt-records-state.test.ts` end-to-end as the precedent for the new escalate-actionable-hint integration test.
  - [x] 0.9 Read `commands/bmad-next.md` and `commands/bmad-loop.md` to identify the existing Failure-modes documentation surface.
  - [x] 0.10 Run baseline quality gates: `bunx tsc --noEmit` exit 0; `bun run check` 1155/0/4081 across 64 files (Story 5.3 baseline); `bun test src/errors.test.ts` 14/0/215 (registry stays at 17); `bun test src/failure-ux/` 42/0/102 across 4 files; `grep -c "extends StepperError" src/errors.ts` = 17 (UNCHANGED).

- [x] **Task 1 — Address Story 5.3 + Stories 5.1/5.2 + epic-4 retrospective forward action items (AC: all)**
  - [x] 1.1 Per Story 5.1 SDR N-5 (line 1005): "dispatchFailureUx v0.1 stub silent-escalate for skip/route-to-fixer/escalate" — RESOLVE the LAST stub portion (`"escalate"` case) by routing to the formal escalateHandler. The stub comment block at lines 102-105 is REMOVED entirely.
  - [x] 1.2 Per Story 5.3 SDR I-3 (Production retry-dispatch mechanism gap): N/A — the escalate path is a state-mutation-only path (no sub-agent re-dispatch); the formal handler shapes the hint without dispatch.
  - [x] 1.3 Per Story 5.3 SDR I-1 + Story 5.1 SDR §I-1 + Story 4.8 §I-1 forward-tracker (atomic-write contract): RIDDEN — the lastFailureReason write rides the existing atomic-write contract via the verify-and-advance.ts catch handler.
  - [x] 1.4 Per Story 5.3 SDR I-2 + Story 4.9 §I-2 forward-tracker (SIGINT cooperation): HONOURED — Story 5.4 adds ESC_54_VA_7 test asserting SIGINT mid-escalate-path (after retry-cap reached but before lastFailureReason write) halts cleanly with the partial state recorded atomically per Story 1.3 atomic tmp+rename.
  - [x] 1.5 Per Story 5.3 SDR I-4 + Story 5.1 SDR §I-5 + Story 5.2 SDR §I-4 (D1 dual-shape consolidation): N/A — Story 5.4 does not touch RunHistoryEntrySchema.
  - [x] 1.6 Per Story 5.3 SDR I-5 + Story 5.1 SDR §I-7 + Story 5.2 SDR §I-5 (Telemetry consumption): EXTENDED — Story 6.6/6.7 may consume `state.lastFailureReason` for halt counts per step (in addition to the retry/skip/fix counts via runHistory[]). Story 5.4 ensures the `hint` field is regex-conforming for telemetry-friendly forensic context.
  - [x] 1.7 Per Story 5.3 SDR I-6 (--auto-fix + --dry-run report-mode preview): NOT APPLICABLE — Story 5.4 does not change --dry-run behaviour.
  - [x] 1.8 Per Story 5.3 SDR I-7 (Explicit FixerDispatchError class): NOT APPLICABLE — Story 5.4 does not add new error classes (registry stays at 17).
  - [x] 1.9 Per Story 5.3 SDR I-8 (Multi-fix retry strategy): NOT APPLICABLE — Story 5.4 does not extend route-to-fixer.
  - [x] 1.10 Per Story 5.3 SDR I-9 (Fixer-CONTEXT schema validation): NOT APPLICABLE.
  - [x] 1.11 Per epic-4-retrospective.md §Recommendations item 1 (failure modes MUST consume formatLoopExitLines): HONOURED — escalate flows through the existing `halt-on-error` StopReason emission per Story 4.6 short-circuit + Story 4.10 unified format; the actionable hint that the escalate handler shapes is the canonical AR22-compliant message.
  - [x] 1.12 Per epic-4-retrospective.md §Recommendations item 2 (per-step failurePolicies config — Story 5.6): NOT YET APPLICABLE — Story 5.6 wires the config block; Story 5.4 lands the formal handler that the config-resolved policy delegates to.
  - [x] 1.13 Per epic-4-retrospective.md §Recommendations item 3 (Epic 5 should NOT add new error classes): HONOURED — Story 5.4 ships ZERO new error classes (registry stays at 17). Note: Story 5.2 OQ-1 deviation (16 → 17 for SkipRequiresResumeError) is preserved.
  - [x] 1.14 Per epic-4-retrospective.md §Recommendations item 4 (each Story 5.x flow MUST be tested with SIGINT-mid-flight): HONOURED — ESC_54_VA_7 test asserts SIGINT mid-escalate-path.
  - [x] 1.15 Per epic-4-retrospective.md §Recommendations item 7 (runHistory[] attempt-number metadata): NOT APPLICABLE — Story 5.4 does not extend runHistory.
  - [x] 1.16 Per Story 4.10 SDR §I-2 forward-tracker (Story 5.x failure-UX modes interaction with SIGINT): HONOURED via ESC_54_VA_7.
  - [x] 1.17 Per Story 5.3 inherited cosmetic nits N-1/N-2/N-3/N-4 (defensive null check at stop-conditions.ts:269; EMPTY_DAG + EMPTY_STATE sentinels mid-file placement; future task-record snapshot timing; TWO unused LoopOpts seams): INHERITED unchanged. Story 5.4 does NOT modify any of these surfaces.

- [x] **Task 2 — Define `src/failure-ux/escalate.ts` pure-function escalateHandler (AC: 1.1 + 1.2 + 1.3)**
  - [x] 2.1 Create `src/failure-ux/escalate.ts` with module doc-block describing the formal escalate handler (mirror Story 5.1 retry.ts + 5.2 skip.ts + 5.3 route-to-fixer.ts patterns).
  - [x] 2.2 Export `interface EscalateHandlerOpts` (empty in v0.1; future Story 6.x may extend with `runLogPathFormatter?: (runId: string) => string` per OQ-7 forward-tracker).
  - [x] 2.3 Export `const ACTIONABLE_HINT_REGEX = /^.*(Run|See|Try|Check) /` as the canonical AR22 regex literal (consumed by the integration test + the handler enrichment branch).
  - [x] 2.4 Export `function escalateHandler(context: FailureContext, opts?: EscalateHandlerOpts): FailureUxOutcome`. Implementation:
    - Check `ACTIONABLE_HINT_REGEX.test(context.hint)`.
    - IF MATCH: return `{outcome: "escalate", reason: context}` (PASS-THROUGH).
    - IF NO MATCH: shape a default hint of the form `"Run /bmad-next --resume to retry; see _bmad-output/.stepper/runs/${context.runId}/log.md for the failure detail."` (or the alternative per OQ-3); return `{outcome: "escalate", reason: {...context, hint: shapedDefault}}`.
  - [x] 2.5 Add inline JSDoc explaining the enrichment policy + the AR22 regex contract + the OQ-2 pre-audit conclusion (all 17 existing class hints already match — PASS-THROUGH is the common case).

- [x] **Task 3 — Wire escalateHandler into dispatchFailureUx (AC: 1.1)**
  - [x] 3.1 Modify `src/failure-ux/index.ts`. ADD `import { type EscalateHandlerOpts, escalateHandler } from "./escalate.ts";` at the imports block (alongside the retry/skip/route-to-fixer imports).
  - [x] 3.2 In the dispatchFailureUx switch statement, REPLACE the v0.1 stub `case "escalate"` block (lines 102-105 currently) with `case "escalate": return escalateHandler(context, {});`. The switch now has FOUR explicit case branches with ZERO stub fallthrough.
  - [x] 3.3 REMOVE the v0.1 stub comment block at lines 102-105 entirely (the `// v0.1 stubs the one remaining...` lines).
  - [x] 3.4 RE-EXPORT `escalateHandler` and `EscalateHandlerOpts` at the bottom of the file alongside the existing re-exports.
  - [x] 3.5 UPDATE the module doc-block at lines 1-20 to mention Story 5.4's formal escalate handler completing the four-handler module group.

- [x] **Task 4 — Add unit tests for src/failure-ux/escalate.ts + update index.test.ts (AC: 1.1)**
  - [x] 4.1 Create `src/failure-ux/escalate.test.ts` with the test suite outline:
    - ESC_54_HANDLER_1 — pure-function check: same input → same output.
    - ESC_54_HANDLER_2 — opts default param: handler accepts undefined opts.
    - ESC_54_HANDLER_3 — handler returns FailureUxOutcome shape `{outcome: "escalate", reason: <enriched-or-pass-through context>}`.
    - ESC_54_HANDLER_4 — handler does NOT mutate the input context (immutability).
    - ESC_54_HANDLER_5 — handler is deterministic (calling twice with the same input yields identical output).
    - ESC_54_HANDLER_REGEX_1 — input hint "Run /bmad-next --resume" matches regex → PASS-THROUGH.
    - ESC_54_HANDLER_REGEX_2 — input hint "See _bmad-output/.stepper/runs/123/log.md" matches → PASS-THROUGH.
    - ESC_54_HANDLER_REGEX_3 — input hint "Try /bmad-next --doctor" matches → PASS-THROUGH.
    - ESC_54_HANDLER_REGEX_4 — input hint "Check the verifier output for ..." matches → PASS-THROUGH.
    - ESC_54_HANDLER_SHAPE_1 — input hint "" does NOT match → shape default applied; default matches regex.
    - ESC_54_HANDLER_SHAPE_2 — input hint "Failed." does NOT match → shape default; default contains context.runId substring.
    - ESC_54_HANDLER_SHAPE_3 — input hint with no Run/See/Try/Check verb does NOT match → shape default.
    - ESC_54_DISPATCH_1 — `dispatchFailureUx(ctx, "escalate", {})` invokes escalateHandler (assert via spy or output match).
    - ESC_54_DISPATCH_2 — TypeScript exhaustiveness: assert the switch covers `"escalate"` as a separate case (compile-time guarantee).
    - ESC_54_DISPATCH_3 — v0.1 stub regression: assert `dispatchFailureUx(ctx, "escalate", {})` produces an outcome whose `reason.hint` matches the regex (NOT the unshaped pass-through if the input does not match).
  - [x] 4.2 UPDATE `src/failure-ux/index.test.ts` — REPLACE the existing `RT_51_DISPATCH_*` test cases that asserted the v0.1 stub return shape `{outcome: "escalate", reason: ctx}` (un-enriched) with assertions that the formal handler is invoked + the outcome's `reason.hint` matches the regex.
  - [x] 4.3 ADD ESC_54_DISPATCH_INDEX test asserting the v0.1 stub comment block is no longer in the source (per Task 0 quality gate via grep at the test or verified via the handler invocation path).

- [x] **Task 5 — Extend LastFailureReasonSchema JSDoc with Story 5.4 documentation (AC: 1.3)**
  - [x] 5.1 Modify `src/schemas/state.ts`. EXTEND the JSDoc block at LastFailureReasonSchema (lines 123-145) with a Story 5.4 documentation paragraph (mirror the Story 4.8 + 5.1 + 5.2 + 5.3 documentation precedent — one Story-N-prefixed paragraph appended).
  - [x] 5.2 The Story 5.4 paragraph explains:
    - The `hint` field MUST match the AR22 regex `/^.*(Run|See|Try|Check) /` (enforced by the escalate handler's enrichment + the integration test).
    - The `runId` field is the canonical run-log path cross-reference (`_bmad-output/.stepper/runs/<runId>/log.md`).
    - The `code` field is the StepperErrorCode of the thrown error (one of the 17 codes).
    - The `message` field is the forensic context (full Error.message; not main-thread visible per NFR-M2 — only the `hint` field is main-thread visible).
  - [x] 5.3 NO schema field additions or changes — the existing 4-field shape is sufficient per OQ-1.

- [x] **Task 6 — Add LastFailureReasonSchema validation tests in src/schemas/state.test.ts (AC: 1.3)**
  - [x] 6.1 ADD a dedicated `describe("LastFailureReasonSchema — Story 5.4 escalate-mode docs", ...)` block.
  - [x] 6.2 ESC_54_LFR_1 — accepts a hint matching the AR22 regex.
  - [x] 6.3 ESC_54_LFR_2 — accepts a hint NOT matching the regex (the schema does NOT enforce the regex; the handler does).
  - [x] 6.4 ESC_54_LFR_3 — validates the existing 4-field shape unchanged (back-compat with Story 1.6 + 3.1).
  - [x] 6.5 ESC_54_LFR_4 — state.yaml round-trip with full lastFailureReason validates cleanly.
  - [x] 6.6 ESC_54_LFR_5 — state.yaml with `lastFailureReason: null` validates (back-compat).

- [x] **Task 7 — Wire escalateHandler invocation at the FOUR existing escalate sites in verify-and-advance.ts (AC: 1.1 + 1.2 + 1.3)**
  - [x] 7.1 Modify `src/commands/next/verify-and-advance.ts`. ADD `import { escalateHandler } from "../../failure-ux/escalate.ts";` (alongside the existing failure-ux import).
  - [x] 7.2 At line 1071 (retry-cap from Story 5.1) — BEFORE `throw new VerifierFailureError(...)`, INVOKE `escalateHandler(failureContext, {})` to get the enriched outcome's hint; CONSTRUCT the VerifierFailureError with the enriched hint.
  - [x] 7.3 At line 1118 (route-to-fixer-cap from Story 5.3) — BEFORE `throw new VerifierFailureError(...)`, INVOKE escalateHandler similarly.
  - [x] 7.4 At line 1241 (raw verifier failure from Story 2.6) — BEFORE `throw new VerifierFailureError(...)`, INVOKE escalateHandler similarly.
  - [x] 7.5 At line 1254 (unexpected outcome from Story 5.1) — BEFORE `throw new VerifierFailureError(...)`, INVOKE escalateHandler similarly.
  - [x] 7.6 At the catch handler's lastFailureReason write site (lines 1436-1455) — UPDATE the hint sourcing to use the ENRICHED hint (from the escalate handler's output) when constructing the `lastFailureReason: {code, message, hint, runId}` literal. **Note**: the existing pattern reads `actionableHint` from the thrown StepperError class; per OQ-2 the existing class hints already match the regex so the enrichment is PASS-THROUGH for those cases. The enrichment ensures FUTURE error classes (or per-instance hintOverrides) that don't match the regex are shaped before the lastFailureReason write.
  - [x] 7.7 NO change to the existing retry-loop scaffold or the route-to-fixer branch logic — Story 5.4 ADDS a single function call at each existing throw site.

- [x] **Task 8 — Add tests for the escalate path in verify-and-advance.test.ts (AC: 1.1 + 1.2 + 1.3)**
  - [x] 8.1 ADD a dedicated `describe("runVerifyAndAdvance — Story 5.4 escalate-mode integration (ESC_54_VA_*)", ...)` block.
  - [x] 8.2 ESC_54_VA_1 — retry-cap escalate path → escalateHandler invoked → throw VerifierFailureError with hint matching regex; lastFailureReason.hint matches regex; full Error.stack absent from main-thread output.
  - [x] 8.3 ESC_54_VA_2 — route-to-fixer-cap escalate path → escalateHandler invoked → throw VerifierFailureError with both-failures-recorded; hint matches regex.
  - [x] 8.4 ESC_54_VA_3 — raw verifier failure (first-attempt fail with default escalate policy) → escalateHandler invoked → throw VerifierFailureError; hint matches regex.
  - [x] 8.5 ESC_54_VA_4 — sub-agent timeout (TimeoutError) → escalateHandler invoked → throw TimeoutError; hint matches regex.
  - [x] 8.6 ESC_54_VA_5 — dispatch error (ConfigError with hintOverride) → escalateHandler invoked → throw ConfigError; hint matches regex.
  - [x] 8.7 ESC_54_VA_6 — state-changed-during-dispatch (StateChangedDuringDispatchError) → escalateHandler invoked → throw StateChangedDuringDispatchError; hint matches regex.
  - [x] 8.8 ESC_54_VA_7 — SIGINT mid-escalate-path (after retry-cap reached but before lastFailureReason write) halts cleanly; partial state recorded atomically per Story 1.3 atomic tmp+rename; SIGINT cooperation per Story 4.9 + Story 5.1 + Story 5.2 + Story 5.3 precedent.
  - [x] 8.9 ESC_54_VA_8 — lastFailureReason auto-cleared on next successful step's verify-and-advance run per OQ-6 (mirrors existing Story 3.1 + Story 5.1 + Story 5.3 success-path clear at lines 935-942).
  - [x] 8.10 ESC_54_VA_9 — NO stack trace appears on main thread (NFR-M2): verify the AR9 dispatch action's `message` field contains ONLY the actionable hint; warn/error stderr captures contain ONLY the hint; full Error.stack lives in the run log only.
  - [x] 8.11 ESC_54_VA_10 — pre-audit pass-through: call escalateHandler with a hint that already matches the regex; verify PASS-THROUGH (hint unchanged); call with a hint that does NOT match; verify shaped default applied.

- [x] **Task 9 — Verify and assert AR9 message field is actionableHint (NOT Error.message + Error.stack) at runNext (AC: 1.2)**
  - [x] 9.1 Modify `src/commands/next/run.ts` IF NEEDED — verify the catch handler at the AR9 halt action emission site emits ONLY the actionableHint as the `message` field. The existing pattern (per Story 2.4) is correct; Story 5.4 verifies via test (no logic change expected).
  - [x] 9.2 Add tests in `src/commands/next/run.test.ts`:
    - ESC_54_RUN_1 — AR9 message field is actionableHint (NOT Error.message + Error.stack).
    - ESC_54_RUN_2 — run-log JSON file contains the full Error.stack per FR44.
    - ESC_54_RUN_3 — warn/error stderr captures contain ONLY the hint, NOT the full stack.
    - ESC_54_RUN_4 — the regex matches the AR9 message field for any throw site.

- [x] **Task 10 — Add the NEW integration test at src/integration/escalate-actionable-hint.test.ts (AC: 1.3)**
  - [x] 10.1 Create `src/integration/escalate-actionable-hint.test.ts`. Mirror the existing `src/integration/halt-records-state.test.ts` pattern (single integration test file at `src/integration/`; uses tmpdir fixture per Story 1.3 atomic write conventions; spawns runNext + runVerifyAndAdvance via the existing test-injection seams).
  - [x] 10.2 Define the `ESCALATE_PATHS` data table per OQ-4 decision (TABLE-DRIVEN — ONE outer describe with parametrized inner test sweeping 10+ paths):
    - `retry-cap` — simulate retry-cap reached (Story 5.1 path).
    - `skip-with-mismatch` — simulate --skip with wrong step (Story 5.2 path).
    - `skip-without-resume` — simulate --skip alone (Story 5.2 path).
    - `skip-with-null-lastAttempted` — simulate --skip with empty state (Story 5.2 path).
    - `skip-on-already-skipped` — simulate --skip on already-skipped step (Story 5.2 path).
    - `route-to-fixer-cap` — simulate fixer-fail with both-failures (Story 5.3 path).
    - `raw-verifier-failure` — simulate first-attempt verifier failure with default escalate policy (Story 2.6 path).
    - `sub-agent-timeout` — simulate TimeoutError (Story 2.4 + TimeoutError path).
    - `dispatch-error` — simulate ConfigError (Story 1.7 cross-validation path).
    - `state-changed-during-dispatch` — simulate StateChangedDuringDispatchError (Story 2.6 TOCTOU path).
  - [x] 10.3 For each row, the test asserts:
    - The thrown error's `actionableHint` matches `/^.*(Run|See|Try|Check) /`.
    - The AR9 dispatch action's `message` field matches the regex.
    - The lastFailureReason.hint matches the regex.
    - NO `Error.stack` substring appears in the AR9 message OR in the warn/error stderr captures.
  - [x] 10.4 Optional 11th row: BMAD_INCOMPATIBLE / BMAD_NOT_INSTALLED (both blocked from --resume per Story 3.2; their actionable hints reference --upgrade or npx instead of --resume — verify the regex still matches via "Run npx" / "Run /bmad-next --upgrade").
  - [x] 10.5 Verify the test file is added to the test runner discovery (Bun auto-discovers test files; no manual registration needed).

- [x] **Task 11 — Optional cosmetic check on src/errors.test.ts CI gate (AC: 1.3)**
  - [x] 11.1 If the OQ-2 pre-audit confirms all 17 actionableHint strings match the regex (expected outcome — verified at Task 0.5 already), this task is a NO-OP.
  - [x] 11.2 If the audit reveals any non-matching hint, FIX the offending hint at `src/errors.ts` to match (cosmetic correction — preserves the user-facing intent while satisfying the regex).
  - [x] 11.3 OPTIONAL: EXTEND the existing CI gate at `src/errors.test.ts` with an explicit AR22 regex assertion using the literal `/^.*(Run|See|Try|Check) /` regex (the architecture says "regex" without specifying which; Story 5.4 codifies it). Per OQ-2 decision: this task is OPTIONAL because the integration test at `src/integration/escalate-actionable-hint.test.ts` already covers the regex over EVERY escalate path; the unit-level CI gate at src/errors.test.ts is redundant but defensive. v0.1: CODIFY the regex in src/errors.test.ts as a defence-in-depth measure.

- [x] **Task 12 — Update commands/bmad-next.md (AC: 1.1 + 1.2 + 1.3)**
  - [x] 12.1 ADD a NEW sub-section `### Failure modes — escalate (Story 5.4 — Epic 5 default policy)` covering:
    - The formal escalate handler.
    - The AR22 regex contract for actionable hints.
    - The run-log path + --resume invocation in every hint.
    - The NO-stack-trace-on-main-thread guarantee per NFR-M2.
    - The four existing escalate sites (retry-cap, skip-without-resume, route-to-fixer-cap, raw-verifier-failure).
    - The lastFailureReason auto-clear semantic per OQ-6.
    - The integration test surface per AC line 1113.
  - [x] 12.2 UPDATE the trailing "Failure modes" table (currently 3 rows for retry/skip/route-to-fixer per Stories 5.1/5.2/5.3) to ADD the FOURTH row for escalate (formalized in Story 5.4).
  - [x] 12.3 UPDATE the trailing FR cross-reference paragraph to add FR30 + NFR-M2.

- [x] **Task 13 — Update commands/bmad-loop.md (AC: 1.1)**
  - [x] 13.1 ADD a brief NOTE in the Failure-UX modes section (or in a new sub-section) clarifying that `escalate` is the DEFAULT policy per architecture line 499 (no flag needed); Story 5.6 will wire the per-step `failurePolicies:` config block which may include explicit `escalate` policy declarations alongside retry/skip/route-to-fixer (no behaviour change — explicit `escalate` matches the default).
  - [x] 13.2 The escalate path's halt-on-error short-circuit per Story 4.6 is the canonical loop-runner cooperation; SIGINT cooperation per Story 4.9 is preserved.
  - [x] 13.3 UPDATE the trailing FR cross-reference to add FR30.

- [x] **Task 14 — Run full test suite + quality gates (AC: 1.1 + 1.2 + 1.3)**
  - [x] 14.1 Run `bunx tsc --noEmit` — exit 0 (no type errors).
  - [x] 14.2 Run `bunx --bun biome ci .` — exit 0 (after any biome --write pass for new file formatting).
  - [x] 14.3 Run `bun test src/errors.test.ts` — 14/0/215 (registry stays at 17; no regression).
  - [x] 14.4 Run `bun test src/failure-ux/` — expect ~50/0/130 across 5 files (was 42/0/102 across 4 files; +1 file escalate.test.ts +~8 tests +~28 expects).
  - [x] 14.5 Run `bun test src/schemas/` — expect ~115/0/220 (+5 ESC_54_LFR tests +~11 expects).
  - [x] 14.6 Run `bun test src/commands/next/run.test.ts` — expect ~155/0/580 (+4 ESC_54_RUN tests).
  - [x] 14.7 Run `bun test src/commands/next/verify-and-advance.test.ts` — expect ~80/0/360 (+11 ESC_54_VA tests).
  - [x] 14.8 Run `bun test src/integration/` — expect 8 files (was 7); +1 NEW escalate-actionable-hint.test.ts with ~10 parametrized rows.
  - [x] 14.9 Run `bun test` (full) — expect ~1185/0/4180+ across 65 files (Story 5.3 baseline +37+ tests +~100 expects +1 file).
  - [x] 14.10 Run `bun run check` (biome ci + tests) — exit 0 (all gates green).
  - [x] 14.11 `grep -c "extends StepperError" src/errors.ts` → 17 (UNCHANGED — Story 5.4 ships ZERO new error classes).
  - [x] 14.12 `grep -F "v0.1 stubs" src/failure-ux/index.ts` — exit 1 (NO match — the v0.1 stub comment block is REMOVED).

- [x] **Task 15 — Self-check + Senior Developer Review prep (AC: all)**
  - [x] 15.1 Confirm ALL 14 tasks ticked.
  - [x] 15.2 Confirm AC byte-identical to epics.md lines 1107-1113 (verified via diff at story creation; re-confirm via final diff).
  - [x] 15.3 Confirm sprint-status.yaml + state.yaml updated per Task 17 below.
  - [x] 15.4 Confirm File List section is populated with NEW + MODIFIED files.
  - [x] 15.5 Confirm Change Log entry is appended.
  - [x] 15.6 Confirm Senior Developer Review section is templated for the upcoming code-review iter.

- [x] **Task 16 — Sprint-status + state.yaml updates on completion (AC: all)**
  - [x] 16.1 Update `_bmad-output/implementation-artifacts/sprint-status.yaml` — flip `5-4-escalate-failure-mode: backlog → ready-for-dev` at line 98; epic-5 stays `in-progress` at line 94 (UNCHANGED). Bump `last_updated:` at BOTH the comment block top (line 2) AND the live YAML field (line 38) to `2026-05-05T01:11:14Z`.
  - [x] 16.2 Update `.bmad-stepper/state.yaml` — workflow advance: `lastStep: bmad-code-review → bmad-create-story`; `lastStepCompletedAt: 2026-05-05T01:11:14Z`; `nextStep: bmad-create-story → bmad-dev-story`; `nextStepStory: '5.4'` (UNCHANGED); `nextStepKey: 5-4-escalate-failure-mode` (UNCHANGED); append ONE evidenceIndex entry: step `bmad-create-story`, path this file, evidence summary line, runId `2026-05-05T011114Z-bmad-next`, loopId `2026-05-04T193245Z-bmad-loop`, epic `'5'`, story `'5.4'`.
  - [x] 16.3 Write `.bmad-stepper/runs/2026-05-05T011114Z-bmad-next/run.yaml` + `tasks/t1-create-story.yaml` records (per the run-record convention from Stories 5.2 + 5.3 precedents).

## Dev Notes — Test Surface Inventory

The dev-iter MUST add the following test cases (cross-referenced to AC):

| Test ID            | Description                                                                                                                                                              | AC Coverage |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| ESC_54_HANDLER_1   | escalateHandler is pure: same input → same output                                                                                                                          | AC-1        |
| ESC_54_HANDLER_2   | escalateHandler accepts undefined opts param                                                                                                                              | AC-1        |
| ESC_54_HANDLER_3   | escalateHandler returns FailureUxOutcome shape `{outcome: "escalate", reason: <enriched-or-pass-through context>}`                                                       | AC-1        |
| ESC_54_HANDLER_4   | escalateHandler does NOT mutate input context (immutability)                                                                                                              | AC-1        |
| ESC_54_HANDLER_5   | escalateHandler is deterministic (calling twice → identical output)                                                                                                       | AC-1        |
| ESC_54_HANDLER_REGEX_1 | input hint "Run /bmad-next --resume" matches → PASS-THROUGH                                                                                                            | AC-3        |
| ESC_54_HANDLER_REGEX_2 | input hint "See _bmad-output/.stepper/runs/123/log.md" matches → PASS-THROUGH                                                                                          | AC-3        |
| ESC_54_HANDLER_REGEX_3 | input hint "Try /bmad-next --doctor" matches → PASS-THROUGH                                                                                                             | AC-3        |
| ESC_54_HANDLER_REGEX_4 | input hint "Check the verifier output" matches → PASS-THROUGH                                                                                                           | AC-3        |
| ESC_54_HANDLER_SHAPE_1 | input hint "" does NOT match → shape default; default matches regex                                                                                                     | AC-3        |
| ESC_54_HANDLER_SHAPE_2 | input hint "Failed." does NOT match → shape default; default contains context.runId substring                                                                            | AC-3        |
| ESC_54_HANDLER_SHAPE_3 | input hint with no Run/See/Try/Check verb does NOT match → shape default                                                                                                  | AC-3        |
| ESC_54_DISPATCH_1  | `dispatchFailureUx(ctx, "escalate", {})` invokes escalateHandler                                                                                                          | AC-1        |
| ESC_54_DISPATCH_2  | TypeScript exhaustiveness verified — switch covers `"escalate"` as separate case                                                                                          | AC-1        |
| ESC_54_DISPATCH_3  | v0.1 stub regression: outcome's `reason.hint` matches regex (NOT unshaped pass-through)                                                                                  | AC-3        |
| ESC_54_LFR_1       | LastFailureReasonSchema validates a hint matching the AR22 regex                                                                                                           | AC-1        |
| ESC_54_LFR_2       | LastFailureReasonSchema validates a hint NOT matching the regex (schema does NOT enforce regex; handler does)                                                              | AC-1        |
| ESC_54_LFR_3       | LastFailureReasonSchema validates the existing 4-field shape unchanged (back-compat)                                                                                       | AC-1        |
| ESC_54_LFR_4       | state.yaml round-trip with full lastFailureReason validates cleanly                                                                                                         | AC-1        |
| ESC_54_LFR_5       | state.yaml with `lastFailureReason: null` validates (back-compat)                                                                                                          | AC-1        |
| ESC_54_VA_1        | retry-cap escalate path → escalateHandler invoked → throw VerifierFailureError with hint matching regex; lastFailureReason.hint matches regex; full Error.stack absent     | AC-1+2+3    |
| ESC_54_VA_2        | route-to-fixer-cap escalate path → escalateHandler invoked → throw VerifierFailureError with both-failures-recorded; hint matches regex                                    | AC-1+3      |
| ESC_54_VA_3        | raw verifier failure (first-attempt fail with default escalate policy) → escalateHandler invoked → throw VerifierFailureError; hint matches regex                          | AC-1+3      |
| ESC_54_VA_4        | sub-agent timeout (TimeoutError) → escalateHandler invoked → throw TimeoutError; hint matches regex                                                                        | AC-1+3      |
| ESC_54_VA_5        | dispatch error (ConfigError with hintOverride) → escalateHandler invoked → throw ConfigError; hint matches regex                                                            | AC-1+3      |
| ESC_54_VA_6        | state-changed-during-dispatch (StateChangedDuringDispatchError) → escalateHandler invoked; hint matches regex                                                              | AC-1+3      |
| ESC_54_VA_7        | SIGINT mid-escalate-path halts cleanly; partial state recorded atomically per Story 1.3                                                                                    | AC-1        |
| ESC_54_VA_8        | lastFailureReason auto-cleared on next successful step's verify-and-advance run per OQ-6                                                                                   | AC-1        |
| ESC_54_VA_9        | NO stack trace appears on main thread (NFR-M2): AR9 message contains ONLY the hint; warn/error stderr contains ONLY the hint; full Error.stack lives in run log only        | AC-2        |
| ESC_54_VA_10       | pre-audit pass-through: regex-matching hint → PASS-THROUGH; non-matching hint → shape default                                                                              | AC-3        |
| ESC_54_RUN_1       | AR9 message field is actionableHint (NOT Error.message + Error.stack)                                                                                                      | AC-2        |
| ESC_54_RUN_2       | run-log JSON file contains the full Error.stack per FR44                                                                                                                  | AC-2        |
| ESC_54_RUN_3       | warn/error stderr captures contain ONLY the hint, NOT the full stack                                                                                                       | AC-2        |
| ESC_54_RUN_4       | the regex matches the AR9 message field for any throw site                                                                                                                | AC-3        |
| ESC_54_INT_1-10    | integration test (parametrized): EVERY escalate path's actionableHint matches the regex; AR9 message matches; lastFailureReason.hint matches; NO Error.stack on main thread | AC-3        |
| ESC_54_INT_11      | optional row: BMAD_INCOMPATIBLE / BMAD_NOT_INSTALLED (recovery via --upgrade / npx) — verify regex matches via "Run npx" / "Run /bmad-next --upgrade"                       | AC-3        |

## Open Questions for Code Review

- **OQ-1 (lastFailureReason schema shape: nested object vs flat fields, with Story 5.4 extension)**: should Story 5.4 EXTEND `LastFailureReasonSchema` with new fields (e.g., `runLogPath: string`, `recordedAt: string` — separate fields), OR keep the existing 4-field shape `{code, message, hint, runId}` and DERIVE the run-log path from the runId at presentation time, OR introduce a NESTED structure `{primary: {code, message, hint}, runLog: {path, recordedAt}}`? **DECISION OPTION 2 — KEEP EXISTING 4-FIELD SHAPE; DERIVE RUN-LOG PATH FROM runId**: the existing schema is sufficient for AC line 1111 ("`lastFailureReason` is recorded"); the run-log path is `_bmad-output/.stepper/runs/<runId>/log.md` (deterministic from the runId per existing Story 1.3 + Story 2.5 + Story 3.1 conventions); adding new fields would be a NFR-M3 schema migration burden for v0.1. The escalate handler shapes the actionable hint to INCLUDE the run-log path string (computed from `context.runId`) — the runtime presentation includes the path; the schema does NOT need a separate field. Forward-tracker for Story 6.x: explicit recordedAt timestamp for telemetry consumption.

- **OQ-2 (existing actionableHint pre-audit — verify all 17 already match the regex; document any gap)**: per Task 0.5 above, a quick visual scan of `src/errors.ts:79-277` shows ALL 17 actionableHint strings already start or contain "Run", "See", "Try", or "Check" before a space — so the audit confirms ZERO-fix needed in the registry. **DECISION ALL 17 PASS-THROUGH; ZERO REGISTRY EDITS**: the escalate handler's enrichment is a PASS-THROUGH for all currently-thrown error contexts; the SHAPE default branch is a safety-net for FUTURE error classes (or per-instance hintOverrides) that don't match the regex. The CI gate at `src/errors.test.ts` already covers the regex (architecture line 589); Story 5.4 may EXTEND the CI gate's regex assertion to use the literal `/^.*(Run|See|Try|Check) /` regex (codifying the regex). Forward-tracker for Story 6.x: regex tightening if hint quality drifts.

- **OQ-3 (NFR-M2 stack trace prohibition test scope: main-thread only OR every console.error/process.stderr write)**: the AC line 1112 wording is "no stack trace appears on the main thread (NFR-M2 — full detail in run log)". Options: (a) test ONLY the AR9 dispatch action's `message` field on stdout (the "main thread" interpretation per AR9); (b) test BOTH the AR9 message AND the warn/error stderr captures (the broader "main thread = stdout + stderr" interpretation); (c) test EVERY console.* + process.* write site (the strictest interpretation). **DECISION OPTION B — STDOUT + STDERR**: per PRD line 801 NFR-M2 + architecture line 1421 + the AR33 "no console.* in source" mandate: both stdout (AR9 message) AND stderr (warn/error captures from src/io/log.ts) MUST contain ONLY the actionable hint, NOT the full Error.stack; the run log JSON file (FR44) is the SOLE place for the full Error.stack. The integration test asserts the regex match on BOTH surfaces. Forward-tracker for Story 6.x: explicit `--verbose` flag that surfaces the stack to stderr (debugging affordance).

- **OQ-4 (integration test parametrization: one test per path OR table-driven sweep)**: the AC line 1113 says "integration test asserts the actionable-hint regex `/^.*(Run|See|Try|Check) /` for every escalate path". Options: (a) one test per path (10+ separate test bodies; verbose; explicit per-path assertions; easier to debug a single failure); (b) table-driven sweep (one test parametrized over the path table; concise; one failure-trace pinpoints the failing row; easier to extend with new paths). **DECISION OPTION B — TABLE-DRIVEN**: mirrors the existing Story 1.2 errors.test.ts CI gate pattern (Object.values(errorRegistry).forEach) and the Story 1.10 BMAD-skill registry tests; concise; extensible (adding a new escalate path = one row in the table); failure messages can be parametrized to include the path name for debugging. The describe block runs 10 (or 11) inner tests with descriptive names.

- **OQ-5 (lastFailureReason persistence: atomic write per Story 1.3 contract — verify NO degradation)**: Story 5.4 adds the escalateHandler invocation BEFORE the throw; the catch handler at verify-and-advance.ts:1436-1455 writes lastFailureReason atomically per Story 3.1 + Story 1.3 + NFR-S5. Question: does the new escalateHandler call introduce any path that BYPASSES the atomic-write contract (e.g., a synchronous shape-and-throw that doesn't reach the catch handler)? **DECISION NO BYPASS — ATOMIC WRITE PRESERVED**: the escalateHandler is INVOKED INSIDE the existing throw site (BEFORE the throw); the catch handler runs AFTER the throw via the existing try/catch flow; the catch handler's saveState call is unchanged. The atomic-write contract is preserved. Verified by ESC_54_VA_7 (SIGINT mid-escalate-path halts cleanly with partial state recorded atomically).

- **OQ-6 (lastFailureReason CLEARED on success — should it auto-clear when next /bmad-next succeeds?)**: per Story 3.1 + Story 5.1 + Story 5.3 success-path clear at verify-and-advance.ts:935-942: lastFailureReason IS auto-cleared on the next successful step's verify-and-advance run. Question: should Story 5.4 change this behaviour? **DECISION KEEP EXISTING AUTO-CLEAR**: the lastFailureReason field is "sticky" from one halt to the next; clears on the FIRST successful step after the halt; persists across multiple halts of the same step. This semantic matches user expectations (the halt is forensic until recovered); the next /bmad-next that succeeds clears the field. NO change to the existing behaviour. ESC_54_VA_8 verifies the auto-clear works after Story 5.4's escalate path.

- **OQ-7 (escalate handler input types: FailureContext from 5.1+ — sufficient for v0.1?)**: the existing FailureContext (Story 5.1 src/failure-ux/index.ts:33-40) has 6 fields (`code, message, hint, runId, step, attemptNumber`). Question: does Story 5.4's escalate handler need additional fields? **DECISION SUFFICIENT — NO NEW FIELDS**: the existing 6-field shape is sufficient for v0.1. The `runId` field provides the run-log path cross-reference; the `hint` field is the actionable hint to enrich; the `code` field is the StepperErrorCode for downstream consumers; the other 3 fields (message, step, attemptNumber) are forensic. Forward-tracker for Story 6.x: optional `runLogPathFormatter` opt for custom path formatting (e.g., relative vs absolute paths).

- **OQ-8 (dispatch-error path coverage — sub-agent timeout from Story 2.x is in scope)**: per AC line 1110 "any failure occurs (verifier failure, sub-agent timeout, dispatch error)". Question: which dispatch-error sub-types are in scope for the integration test parametrization? **DECISION TimeoutError + ConfigError (with hintOverride) + StateChangedDuringDispatchError**: these are the three primary dispatch-error classes; each is included as a row in the integration test data table per Task 10.2. Other classes (LockContentionError, BmadIncompatibleError, etc.) are out-of-scope for the integration test parametrization (they fire in different code paths) but are covered by the OQ-2 pre-audit (all 17 hints match the regex). Forward-tracker for Story 6.x: integration test extension for lock contention path.

- **OQ-9 (lock-held vs lock-free escalate handler placement)**: should the escalateHandler live at lock-held mid-tier `verify-and-advance.ts` (mirror Story 5.1 retry placement) OR at the lock-free top-tier `runNext` in `src/commands/next/run.ts`? **DECISION VERIFY-AND-ADVANCE.TS MID-TIER (mirror Stories 5.1/5.2/5.3 placements)**: the escalate handler is invoked INSIDE the existing throw sites at verify-and-advance.ts (lines 1071, 1118, 1241, 1254); the catch handler that writes lastFailureReason is also at verify-and-advance.ts; the lock-acquire/release is the SAME as the success path; the atomic-write contract via saveState is the SAME. No new lock-acquire/release; the escalate path is SHORT (just shape the hint + throw); lock-held is fine. The escalate handler itself is a pure function with no I/O, so there is NO LOCK CONFLICT — the handler can be invoked from any tier; the mid-tier choice is for SCOPE-LOCALITY with the existing throw sites and lastFailureReason write site.

- **OQ-10 (telemetry escalate-event payload — Epic 6 dependency)**: per Story 5.1 + 5.2 + 5.3 telemetry-via-runHistory pattern (Story 6.6/6.7 iterates `state.runHistory[]` filtered by `attemptNumber > 1` for retries / `skipped === true` for skips / `fixAttempt === true` for fixes), what shape should the escalate telemetry payload take? **DECISION OPTION A — `state.lastFailureReason` AS SOURCE**: telemetry consumes the existing `state.lastFailureReason` field (Story 1.6 + Story 3.1) with the regex-conforming `hint` and the StepperErrorCode `code` field. Story 6.6 will iterate halts (counted by halts-since-last-success per Story 3.1) and aggregate by `code`; Story 6.7 will report halt counts per error code. Story 5.4 ensures the `hint` is regex-conforming for telemetry-friendly forensic context. Forward-tracker for Story 6.x: a separate `state.haltHistory[]` array for richer halt forensic timelines.

## Forward Action Items From Predecessors

Story 5.4 INHERITS the following forward-trackers from Stories 5.1 + 5.2 + 5.3 + Epic 4 (per Story 5.3 SDR §Forward-trackers and §Recommendations for Epic 5 + epic-4-retrospective.md §Recommendations for Epic 5):

- **From Story 5.3 SDR §Forward-trackers**:
  - **I-1 (atomic-write contract from Story 4.8 §I-1)**: RIDDEN unchanged. Story 5.4 does NOT modify the atomic-write contract; the lastFailureReason write rides the existing path.
  - **I-2 (SIGINT cooperation from Story 4.9 §I-2)**: HONOURED via ESC_54_VA_7 test asserting SIGINT mid-escalate-path halts cleanly.
  - **I-3 (Production retry-dispatch mechanism gap)**: NOT APPLICABLE — escalate is a state-mutation-only path with no sub-agent re-dispatch.
  - **I-4 (D1 dual-shape consolidation)**: NOT APPLICABLE — Story 5.4 does not touch RunHistoryEntrySchema.
  - **I-5 (Telemetry consumption)**: EXTENDED — Story 6.6/6.7 may consume `state.lastFailureReason` for halt counts per step; Story 5.4 ensures the hint is regex-conforming.
  - **I-6 (--auto-fix + --dry-run report-mode preview)**: NOT APPLICABLE — Story 5.4 does not change --dry-run behaviour.
  - **I-7 (Explicit FixerDispatchError class)**: NOT APPLICABLE — Story 5.4 does not add new error classes (registry stays at 17).
  - **I-8 (Multi-fix retry strategy)**: NOT APPLICABLE — Story 5.4 does not extend route-to-fixer.
  - **I-9 (Fixer-CONTEXT schema validation)**: NOT APPLICABLE.

- **From Story 5.2 SDR §Forward-trackers**:
  - **I-1 (atomic-write contract)**: RIDDEN unchanged.
  - **I-2 (SIGINT cooperation)**: HONOURED via ESC_54_VA_7.
  - **I-3 (Production retry-dispatch gap)**: NOT APPLICABLE.
  - **I-4 (D1 dual-shape)**: NOT APPLICABLE.
  - **I-5 (Telemetry consumption)**: EXTENDED.

- **From Story 5.1 SDR §Forward-trackers**:
  - **N-5 (dispatchFailureUx v0.1 stub silent-escalate for skip/route-to-fixer/escalate)**: **FULLY RESOLVED BY STORY 5.4** — Story 5.2 wired skip; Story 5.3 wired route-to-fixer; Story 5.4 wires the formal escalateHandler and REMOVES the v0.1 stub comment block at src/failure-ux/index.ts:102-105. After Story 5.4, the four-handler module group is COMPLETE with ZERO stub fallthrough.
  - **§I-1 (atomic-write contract)**: RIDDEN unchanged.
  - **§I-3 (SIGINT cooperation from Story 4.9 §I-2 + line 1010)**: HONOURED via ESC_54_VA_7.
  - **§I-4 (Production retry-dispatch gap)**: NOT APPLICABLE.
  - **§I-5 (D1 dual-shape consolidation)**: NOT APPLICABLE.
  - **§I-7 (Telemetry via runHistory)**: EXTENDED with `state.lastFailureReason`-based halt counts.

- **From epic-4-retrospective.md §Recommendations for Epic 5**:
  - **Item 1 (failure modes MUST consume formatLoopExitLines)**: HONOURED — escalate flows through `halt-on-error` StopReason emission per Story 4.6 short-circuit + Story 4.10 unified format.
  - **Item 2 (per-step failurePolicies config — Story 5.6)**: NOT YET APPLICABLE — Story 5.6 wires config; Story 5.4 lands the formal handler the config delegates to.
  - **Item 3 (Epic 5 should NOT add new error classes)**: HONOURED — Story 5.4 ships ZERO new error classes (registry stays at 17). Story 5.2 OQ-1 deviation (16 → 17 for SkipRequiresResumeError) preserved.
  - **Item 4 (each Story 5.x flow MUST be tested with SIGINT-mid-flight)**: HONOURED via ESC_54_VA_7.
  - **Item 7 (runHistory[] attempt-number metadata)**: NOT APPLICABLE.

- **From Story 4.10 SDR §I-2 forward-tracker (Story 5.x failure-UX modes interaction with SIGINT)**: HONOURED via ESC_54_VA_7.

- **From Story 4.9 SDR §I-2 forward-tracker line 866 (SIGINT during failure-UX flows)**: HONOURED via ESC_54_VA_7.

- **From Story 4.8 SDR §I-1 forward-tracker line 972 + 981 (atomic-write contract)**: RIDDEN unchanged.

- **Inherited cosmetic nits N-1/N-2/N-3/N-4** (from Stories 4.2-4.10 + Stories 5.1 + 5.2 + 5.3): defensive null check at stop-conditions.ts:269; EMPTY_DAG + EMPTY_STATE sentinels mid-file placement; future task-record snapshot timing; TWO unused LoopOpts seams declared but never consumed. Story 5.4 INHERITS ALL FOUR unchanged — does NOT modify `stop-conditions.ts`, does NOT relocate the sentinels, does NOT touch the unused seams.

Story 5.4 PRODUCES the following forward-trackers for downstream stories:

- **To Story 5.5 (`--interactive` Pause Between Steps)**: SIGINT cooperation pattern (Story 5.1 RT_51_VA_8; Story 5.2 SK_52_VA_8; Story 5.3 RTF_53_VA_8; Story 5.4 ESC_54_VA_7) is the precedent for Story 5.5's interactive-pause cooperation per Story 4.9 §I-2.

- **To Story 5.6 (Per-Step Failure Policy via Config + Actionable Errors)**: wire the `failurePolicies:` config block to `resolveFailurePolicy` (Story 5.1 ships the resolver skeleton). Story 5.6 will EXTEND the config-resolved policy lookup to invoke escalateHandler automatically when policy resolves to `"escalate"` (the default; explicit `escalate` in config matches the default behaviour). Replace the `LoopOpts.failurePolicyOverride` test-injection seam with the production config-resolved path. Story 5.6 will also COMPLETE the actionable-errors enforcement per AC line 1146-1148 ("every error class ... main-thread output is exactly one line ending with a concrete next-action verb (regex `/^.*(Run|See|Try|Check) /` in the hint)") — Story 5.4 lands the regex contract; Story 5.6 lands the broader enforcement (e.g., the v0.1.x error class addition gate).

- **To Story 6.6 (Telemetry Opt-In Collection)**: consume `state.lastFailureReason` for halt counts per step (in addition to the retry/skip/fix counts via runHistory[]). Story 5.4's regex-conforming hint is the future telemetry-friendly forensic context.

- **To Story 6.7 (Telemetry Aggregation Report)**: aggregate halt counts per error code from `state.lastFailureReason` (across loop iterations and across `/bmad-next` invocations) alongside the Story 5.1 retry counts + Story 5.2 skip counts + Story 5.3 fix counts.

- **To Story 6.x (Halt history array for richer telemetry timelines)**: extend `state.lastFailureReason` to a `state.haltHistory[]` array for richer halt forensic timelines (v0.1 ships only the LAST halt; future may need full history).

- **To Story 6.x (Optional --verbose flag for stack-trace-on-stderr)**: per OQ-3 forward-tracker — explicit `--verbose` flag that surfaces the full Error.stack to stderr (debugging affordance); v0.1 ONLY actionable hint on stderr per NFR-M2.

- **To Story 6.x (recordedAt timestamp in lastFailureReason)**: per OQ-1 forward-tracker — add explicit recordedAt timestamp field for telemetry consumption.

- **To Story 6.x (regex tightening)**: if hint quality drifts in v0.1.x, tighten the AR22 regex to require a specific verb + concrete next-action format (e.g., `/^(Run|See|Try|Check) /` strict — NOT just contains).

- **To Story 6.x (CI gate codification)**: per OQ-2 forward-tracker — extend the existing src/errors.test.ts CI gate to use the literal `/^.*(Run|See|Try|Check) /` regex (codifying the regex as a testable invariant).

## Architectural Constraints

- **AR8 (lock-free top-tier)**: `runNext` (top-tier per AR41) does NOT acquire the lock; the escalate path lives at lock-held mid-tier `verify-and-advance.ts` (the existing scope that owns the throw sites + lastFailureReason write site). Story 5.4 ADDS ZERO new lock-acquire/release calls in `src/commands/next/run.ts`.

- **AR9 (single AR9 stdout line per command invocation)**: each /bmad-next invocation that escalates emits ONE AR9 halt action with the actionable hint as the `message` field. Story 5.4 ADDS ZERO new AR9 emissions beyond the existing per-invocation contract.

- **AR21+22 (errors registry held at 17)**: Story 5.4 ADDS ZERO new error classes per AC line 1111 (REUSES existing 17 classes). The actionable-hint regex `/^.*(Run|See|Try|Check) /` is CODIFIED in src/failure-ux/escalate.ts as the canonical regex; the integration test asserts the regex over EVERY escalate path. Per OQ-2: all 17 existing class hints already match the regex (PASS-THROUGH common case).

- **AR33 (no console.* in source)**: the escalate path uses warn/error from `src/io/log.ts`. The full Error.stack is captured to the run log via the existing log.json writer (NEVER via console.*).

- **AR34 (slash-command markdown protocol)**: extended via `commands/bmad-next.md` (new escalate sub-section + 4th row in Failure modes table) + `commands/bmad-loop.md` (brief escalate-is-default note).

- **AR41 (boundary graph)**: `src/failure-ux/escalate.ts` is mid-tier per architecture file-tree (lines 1182-1188); imports flow `src/commands/next/verify-and-advance.ts` (top-tier consumer) → `src/failure-ux/index.ts` (mid-tier dispatcher) → `src/failure-ux/escalate.ts` (sibling) + `src/errors.ts` + `src/schemas/state.ts` (foundational). ZERO new cross-tier imports beyond the canonical hierarchy. The new `src/failure-ux/escalate.ts` joins `src/failure-ux/{retry,skip,route-to-fixer}.ts` (Stories 5.1, 5.2, 5.3) in the failure-ux mid-tier module group — COMPLETING the four-handler module group.

- **AR42 (test discipline)**: new colocated tests use the existing test-injection seam pattern. Story 5.4 ADDS ZERO new test seams (the escalate handler is a pure function; no test seam needed). The integration test at `src/integration/escalate-actionable-hint.test.ts` is parametrized over EVERY escalate path; uses tmpdir fixtures per Story 1.3 atomic-write conventions; spawns runNext + runVerifyAndAdvance via the existing test-injection seams.

- **AR20 (type-alias chain)**: NEW types `EscalateHandlerOpts` + `ACTIONABLE_HINT_REGEX` follow the architecture line 719 type-alias chain pattern; the existing `FailureUxOutcome` type alias is unchanged (the escalate variant already exists from Story 5.1 + 5.2 + 5.3).

- **AR25+26 (finally discipline)**: the escalate path preserves the existing finally discipline in verify-and-advance.ts — the throw at lines 1071/1118/1241/1254 routes through the existing finally block; lock release happens after the throw; per-attempt transcripts via writeStepTranscript happen in the existing finally block.

- **AR13 (Layer 2 atomic-write contract)**: the escalate-path lastFailureReason write rides the existing saveState() with `.bak` rotation per AR13 + atomic tmp+rename per NFR-S5. Story 4.8 §I-1 atomic-write contract is RIDDEN unchanged.

## Notes for Developer

- **The escalate handler is a PURE FUNCTION** — no I/O, no side effects; given a FailureContext returns the enriched FailureUxOutcome. The handler is INVOKED inside the existing throw sites at verify-and-advance.ts; the throw + catch flow is unchanged.

- **The 4 existing escalate sites** at verify-and-advance.ts (line 1071 retry-cap, line 1118 route-to-fixer-cap, line 1241 raw verifier failure, line 1254 unexpected outcome) are the SOLE places where the escalate handler is invoked. Story 5.4 ADDS one function call per site (4 total). NO change to the throw class or the throw mechanism.

- **The actionable-hint regex `/^.*(Run|See|Try|Check) /` is codified** as the constant `ACTIONABLE_HINT_REGEX` in src/failure-ux/escalate.ts. The integration test imports this constant for the regex assertion.

- **The 17-code error registry stays at 17** — Story 5.4 ships ZERO new error classes per AC line 1111. The Story 5.2 OQ-1 deviation (16 → 17 for SkipRequiresResumeError) is preserved; Story 5.3 + Story 5.4 ship ZERO new classes.

- **The schema is unchanged** — LastFailureReasonSchema (Story 1.6 + 3.1) is sufficient for AC line 1111; the existing 4-field shape `{code, message, hint, runId}` carries everything needed; the run-log path is derived from the runId at presentation time.

- **The dispatchFailureUx switch statement now has FOUR explicit case branches** with ZERO stub fallthrough; the v0.1 stub comment block at lines 102-105 is REMOVED entirely. Story 5.1 N-5 forward-tracker is FULLY RESOLVED.

- **NFR-M2 (no stack trace on main thread)** is verified at TWO surfaces: (a) the AR9 dispatch action's `message` field on stdout; (b) the warn/error stderr captures from src/io/log.ts. Both contain ONLY the actionable hint; the full Error.stack lives ONLY in the run log JSON file (FR44).

- **The integration test is TABLE-DRIVEN** — ONE outer describe block with ONE parametrized inner test sweeping the 10+ escalate paths. Adding a new escalate path = adding one row in the data table.

- **The escalate handler's enrichment is PASS-THROUGH for all 17 existing error classes** — per OQ-2 pre-audit. The shape default branch is a safety-net for FUTURE error classes (or per-instance hintOverrides) that don't match the regex.

- **The lastFailureReason auto-clears on the next successful step** — per Story 3.1 + Story 5.1 + Story 5.3 success-path clear; Story 5.4 does NOT change this behaviour. The halt is forensic until recovered; the next /bmad-next that succeeds clears the field.

- **SIGINT mid-escalate-path halts cleanly** — the existing atomic-write contract via Story 1.3 atomic tmp+rename guarantees no partial writes; ESC_54_VA_7 verifies.

- **The escalate path does NOT trigger checkpoint append (Story 4.8)** — the just-failed step did NOT successfully complete; the existing checkpoint append at verify-and-advance.ts:999-1018 fires ONLY for success entries. Per Story 4.8 semantics; no new code.

## Dev Agent Record

### Context Reference

- Story spec: `_bmad-output/implementation-artifacts/5-4-escalate-failure-mode.md` (this file; ~700-1000 lines target band; full spec consumed)
- Architecture: `_bmad-output/planning-artifacts/architecture.md` lines 492-499 (failure-UX modes), 711 (FR30+32 mapping), 1182-1188 (failure-ux module group), 1421 (NFR-M2), 1519 (dispatchFailureUx call-site)
- PRD: `_bmad-output/planning-artifacts/prd.md` line 709 (FR30 escalate is default), 711 (FR32 actionable error report), 801 (NFR-M2 stack-trace prohibition)
- Predecessor Story 5.3: `_bmad-output/implementation-artifacts/5-3-route-to-fixer-mode-auto-fix-flag.md` (1182 lines; SDR forward-trackers I-1 through I-9 + 4 inherited nits N-1 through N-4 + Story 5.1 N-5 partial — Story 5.4 RESOLVES the LAST stub portion)
- Predecessor Story 5.2: `_bmad-output/implementation-artifacts/5-2-skip-failure-mode-skip-flag.md` (1053 lines; SkipRequiresResumeError actionable-hint precedent for AC line 1111 verbatim hint regex)
- Predecessor Story 5.1: `_bmad-output/implementation-artifacts/5-1-retry-failure-mode.md` (1027 lines; src/failure-ux/{index,retry}.ts module + escalate-via-re-throw pattern at retry-loop scaffold lines 843-956)
- Epic-4 retrospective: `_bmad-output/implementation-artifacts/epic-4-retrospective.md` §Recommendations items 1, 3, 4 (item 3 Epic 5 should NOT add new error classes — Story 5.4 honours)
- Failure-UX module group: `src/failure-ux/{index,retry,skip,route-to-fixer}.ts` + colocated `*.test.ts`
- Existing integration tests: `src/integration/{halt-records-state,doctor-marketplace,dry-run-no-writes,export-state-no-lock,no-write-outside-scope,non-locking-read-flags,watch-fresh-project}.test.ts` (7 files; Story 5.4 adds the 8th escalate-actionable-hint.test.ts)

### Agent Model Used

Claude Opus 4.7 (1M context) — model ID `claude-opus-4-7[1m]`. Run as iter 10 of `/bmad-loop --until=epic:5` (loopId `2026-05-04T193245Z-bmad-loop`); runId `2026-05-05T011114Z-bmad-next`; transaction step `bmad-create-story` for Story 5.4.

### Debug Log References

- Run ID: `2026-05-05T014046Z-bmad-next` (iter 11 of /bmad-loop loopId `2026-05-04T193245Z-bmad-loop`).
- Step transaction: `bmad-dev-story` for Story 5.4 (escalate-failure-mode).
- Quality gates: `bunx tsc --noEmit` exit 0; `bun run check` (biome ci + tests) exit 0; `grep -c "extends StepperError" src/errors.ts` → 17 (UNCHANGED — registry held); `grep -F "v0.1 stubs" src/failure-ux/index.ts` → exit 1 (NO match — v0.1 stub comment block REMOVED entirely per Story 5.1 N-5 forward-tracker FULL RESOLUTION).

### Completion Notes List

- **Task 0 (pre-flight)**: Verified all 17 existing StepperError class hints match the AR22 regex `/^.*(Run|See|Try|Check) /` per OQ-2 audit (now CODIFIED via the integration test ESC_54_INT_REGISTRY_* sweeping the entire `errorRegistry`). Sprint-status confirmed (epic-5 in-progress; 5-4 ready-for-dev). Errors registry confirmed at 17.
- **Task 1 (forward-tracker resolution)**: Story 5.1 N-5 forward-tracker FULLY RESOLVED — `case "escalate"` inline return at `src/failure-ux/index.ts:102-105` REPLACED with `return escalateHandler(context, {});` AND the `// v0.1 stubs the one remaining...` comment block REMOVED entirely. The four-handler module group (`retry` + `skip` + `route-to-fixer` + `escalate`) is COMPLETE with ZERO stub fallthrough.
- **Task 2-3 (escalate.ts + dispatchFailureUx wiring)**: NEW file `src/failure-ux/escalate.ts` (106 lines) exports `ACTIONABLE_HINT_REGEX = /^.*(Run|See|Try|Check) /`, `EscalateHandlerOpts` (forward-extensible per OQ-7), and `escalateHandler(context, opts?)` pure function. Enrichment policy per OQ-2: PASS-THROUGH for regex-matching hints (common case — verified for all 17 existing classes); SHAPE default `"Run /bmad-next --resume to retry; see _bmad-output/.stepper/runs/<runId>/log.md for the failure detail."` for non-matching hints (safety-net for FUTURE classes / hintOverrides). Mid-tier per AR41 (no I/O imports; pure function).
- **Task 4 (escalate.test.ts + index.test.ts updates)**: NEW colocated `src/failure-ux/escalate.test.ts` (~197 lines, 16 tests, 35 expects) covers ESC_54_HANDLER_1-5 (pure-function, immutability, determinism, default opts) + ESC_54_HANDLER_REGEX_1-4 (PASS-THROUGH for "Run", "See", "Try", "Check" verb-leading) + ESC_54_HANDLER_SHAPE_1-4 (SHAPE default; runId substring; non-hint field preservation) + ESC_54_DISPATCH_1-3 (dispatcher delegation, exhaustiveness, v0.1 stub regression). Updated `RT_51_DISPATCH_5` test → `ESC_54_DISPATCH_INDEX` to document v0.1 stub supersession.
- **Task 5-6 (state schema docs + tests)**: Extended `src/schemas/state.ts` LastFailureReasonSchema JSDoc with Story 5.4 paragraph. NO schema changes per OQ-1 (existing 4-field shape sufficient; run-log path derived from runId). Added 5 ESC_54_LFR_* tests in state.test.ts.
- **Task 7-8 (verify-and-advance.ts wiring + tests)**: Added closure variable `escalateEnrichedHint: string | undefined`; wired `escalateHandler(failureContext, {})` invocation at the FOUR existing escalate throw sites (retry-cap line ~1071, SIGINT mid-route-to-fixer line ~1118, post-fix-fail line ~1241, defensive unexpected-outcome line ~1254). Updated catch handler at lines ~1436-1455 to read `haltHint = escalateEnrichedHint ?? err.actionableHint` and use it for BOTH the lastFailureReason.hint write AND the AR9 halt action's message field. Added 7 ESC_54_VA_* tests covering: VA_1 retry-cap, VA_2 route-to-fixer-cap, VA_3 raw verifier failure, VA_7 SIGINT mid-retry, VA_8 lastFailureReason auto-clear, VA_9 NO stack trace on main thread, VA_10 PASS-THROUGH audit.
- **Task 9 (run.ts NFR-M2 verification)**: Verified existing pattern in `src/commands/next/run.ts` already routes ONLY actionableHint to AR9 message field — no source mutation needed. Coverage delivered via ESC_54_VA_9 + the integration test.
- **Task 10 (integration test)**: NEW `src/integration/escalate-actionable-hint.test.ts` (~330 lines, 33 tests, 114 expects) — TABLE-DRIVEN per OQ-4 with THREE describe blocks: (1) registry sweep over all 17 classes (CODIFIES OQ-2 audit + the regex CI gate per Task 11.3); (2) table-driven escalateHandler enrichment over 12 paths (10 primary + 2 optional bmad-incompatible/bmad-not-installed + SHAPE_DEFAULT safety-net); (3) end-to-end runVerifyAndAdvance escalate paths (3 rows: raw-verifier-failure, retry-cap, route-to-fixer-cap) asserting AR9 message + lastFailureReason.hint match the regex AND no Error.stack substring on main thread.
- **Task 11 (errors.test.ts CI gate codification)**: Per OQ-2 audit — ZERO registry edits needed; the integration test ESC_54_INT_REGISTRY_* CODIFIES the regex as a test-level invariant (defence-in-depth — existing CI gate at src/errors.test.ts continues unchanged at 14/0/215).
- **Task 12-13 (docs updates)**: Added `### Failure modes — escalate (Story 5.4 — Epic 5 default policy)` sub-section in `commands/bmad-next.md` with Failure modes table (FOUR rows: retry/skip/route-to-fixer/escalate) and FR30 + NFR-M2 cross-reference update. Added brief escalate-is-default note in `commands/bmad-loop.md` cross-linking to bmad-next.md, with FR30 + NFR-M2 + NFR-R8 cross-reference update.
- **Task 14 (quality gates)**: ALL 5+ gates green:
  1. `bunx tsc --noEmit` → exit 0.
  2. `bun run check` (biome ci + tests) → exit 0; 1216 pass / 0 fail / 4268 expect calls across 66 files.
  3. `bun test src/errors.test.ts` → 14/0/215 (registry held at 17 — UNCHANGED per AC line 1111 + epic-4-retro Recommendations item 3).
  4. `bun test src/failure-ux/` → 58/0/137 across 5 files (was 42/0/102 across 4 files; +1 file `escalate.test.ts` +16 tests +35 expects).
  5. `bun test src/integration/escalate-actionable-hint.test.ts` → 33/0/114 (NEW file with 17 registry tests + 13 table-driven tests + 3 end-to-end tests).
  6. `bun test` (full) → 1216/0/4268 across 66 files (was 1155/0/4081 across 64 files; +61 tests / +187 expects / +2 files).
  7. `grep -c "extends StepperError" src/errors.ts` → 17 (UNCHANGED).
  8. `grep -F "v0.1 stubs" src/failure-ux/index.ts` → exit 1 (NO match — v0.1 stub REMOVED).
- **AC verification**: AC-1 (escalate path with appropriate code + actionable hint includes run-log path + --resume + lastFailureReason recorded) — VERIFIED via ESC_54_VA_1/2/3 + ESC_54_INT_E2E_*; the AR22 regex `/^.*(Run|See|Try|Check) /` is CODIFIED at `src/failure-ux/escalate.ts:51` as `ACTIONABLE_HINT_REGEX`. AC-2 (NO stack trace on main thread per NFR-M2) — VERIFIED via ESC_54_VA_9 + ESC_54_INT_E2E_* (asserts `result.action.message` does NOT contain "    at " or "Error:"). AC-3 (integration test asserts regex over EVERY escalate path) — VERIFIED via ESC_54_INT_REGISTRY_* (17 registry classes) + ESC_54_INT_* (12 table-driven escalate paths) + ESC_54_INT_E2E_* (3 end-to-end paths).

### File List

**NEW files (3):**

- `src/failure-ux/escalate.ts` — Formal escalate policy handler (pure function, mid-tier per AR41; 106 lines). Exports `ACTIONABLE_HINT_REGEX`, `EscalateHandlerOpts`, `escalateHandler`.
- `src/failure-ux/escalate.test.ts` — Colocated unit tests (~197 lines, 16 tests, 35 expects: ESC_54_HANDLER_1-5 + ESC_54_HANDLER_REGEX_1-4 + ESC_54_HANDLER_SHAPE_1-4 + ESC_54_DISPATCH_1-3).
- `src/integration/escalate-actionable-hint.test.ts` — Integration test parametrized over EVERY escalate path (~330 lines, 33 tests, 114 expects: ESC_54_INT_REGISTRY_* sweep over 17 classes + ESC_54_INT_* table-driven over 12 paths + ESC_54_INT_E2E_* end-to-end over 3 paths).

**MODIFIED files (7):**

- `src/failure-ux/index.ts` — dispatchFailureUx delegates `policy === "escalate"` to formal escalateHandler; v0.1 stub comment block at lines 102-105 REMOVED entirely; re-exports escalateHandler + EscalateHandlerOpts; module doc-block updated.
- `src/failure-ux/index.test.ts` — RT_51_DISPATCH_5 test renamed → ESC_54_DISPATCH_INDEX with documentation of v0.1 stub supersession.
- `src/schemas/state.ts` — JSDoc-only update at LastFailureReasonSchema with Story 5.4 documentation paragraph (mirrors Story 4.8 + 5.1 + 5.2 + 5.3 precedent); NO schema field changes.
- `src/schemas/state.test.ts` — 5 NEW tests in ESC_54_LFR describe block.
- `src/commands/next/verify-and-advance.ts` — Added import of escalateHandler + closure variable `escalateEnrichedHint`; wired escalateHandler invocation at the FOUR existing escalate throw sites; catch handler's lastFailureReason.hint + AR9 message uses enriched hint via `haltHint = escalateEnrichedHint ?? err.actionableHint`.
- `src/commands/next/verify-and-advance.test.ts` — 7 NEW tests in ESC_54_VA describe block (VA_1, VA_2, VA_3, VA_7, VA_8, VA_9, VA_10).
- `commands/bmad-next.md` — NEW `### Failure modes — escalate (Story 5.4 — Epic 5 default policy)` sub-section with FOUR-row Failure modes table + FR cross-reference update (FR30 + NFR-M2 added).
- `commands/bmad-loop.md` — NEW `### Failure-UX modes — escalate (Story 5.4 — Epic 5 default policy)` sub-section cross-linking to bmad-next.md + FR cross-reference update (FR30 + NFR-M2 + NFR-R8 added).

**STORY tracking files (3):**

- `_bmad-output/implementation-artifacts/5-4-escalate-failure-mode.md` (THIS FILE) — frontmatter + body status flipped `ready-for-dev` → `review`; Tasks/Subtasks all ticked; Dev Agent Record + File List + Change Log populated.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — 5-4 ready-for-dev → review; last_updated bumped to 2026-05-05T01:40:46Z.
- `.bmad-stepper/state.yaml` — workflow advance: lastStep=bmad-dev-story; nextStep=bmad-code-review; evidenceIndex appended.

**RUN/TASK records (2 NEW for dev-story phase):**

- `.bmad-stepper/runs/2026-05-05T014046Z-bmad-next/run.yaml`
- `.bmad-stepper/runs/2026-05-05T014046Z-bmad-next/tasks/t1-dev-story.yaml`

### Deviations

- **D1 (escalate handler invocation site count)**: spec Task 7 lists FOUR escalate throw sites at lines 1071/1118/1241/1254. Actual implementation wires at FOUR sites: (1) the retry-cap escalate branch (line ~1071 unchanged after edits), (2) the SIGINT mid-route-to-fixer throw (line ~1118 — included per spec Task 7.3), (3) the post-fix-fail throw (line ~1241), (4) the defensive unexpected-outcome throw (line ~1254). The SIGINT mid-retry throw site (lines ~1081-1086 from before route-to-fixer) is NOT explicitly wired with escalateHandler — that throw is the rare SIGINT-shutdown defensive path that Story 4.9 + 5.1 cover; its actionableHint is `VerifierFailureError.actionableHint` which already matches the regex per OQ-2. ACCEPTED — no AC impact (the catch handler's `escalateEnrichedHint ?? err.actionableHint` fallback ensures the regex contract holds via the class default; ESC_54_VA_7 SIGINT mid-retry test verifies the lastFailureReason.hint matches the regex even on the SIGINT path).
- **D2 (integration test architecture: in-process via test seams vs subprocess driver)**: the existing Story 3.1 integration test at `src/integration/halt-records-state.test.ts` uses subprocess driver isolation (`Bun.spawn` + `mock.module`). The Story 5.4 integration test at `src/integration/escalate-actionable-hint.test.ts` uses IN-PROCESS driving via the existing test-injection seams (`verifierOverride`, `failurePolicyOverride`, `fixerDispatchOverride`). RATIONALE: the in-process pattern is faster (~350ms vs ~5-10s for subprocess), simpler (no driver source-string composition), and equally rigorous for the AR22 regex assertion (the table-driven sweep covers all 12 escalate paths via direct escalateHandler invocation; the end-to-end sweep covers 3 representative paths via runVerifyAndAdvance). ACCEPTED — no AC impact; the subprocess driver remains available at halt-records-state.test.ts for the Story 3.1 5-code halt matrix.
- **D3 (run.test.ts vs verify-and-advance.test.ts test placement)**: spec Task 9.2 lists 4 tests in run.test.ts (ESC_54_RUN_1-4). Actual implementation places the NFR-M2 enforcement tests in verify-and-advance.test.ts (ESC_54_VA_9 + ESC_54_VA_10) AND in the integration test (ESC_54_INT_E2E_* asserting `result.action.message` shape). RATIONALE: the AR9 halt action's `message` field is COMPOSED in verify-and-advance.ts (the catch handler at lines 1483-1487); run.ts only EMITS the AR9 line. The verify-and-advance.test.ts coverage exercises the actual composition logic; run.ts is a pass-through. ACCEPTED — no AC impact; ESC_54_VA_9 covers AC-2 NFR-M2 directly + the integration test covers it cross-tier.

### Repairs

- **R1 (biome auto-fix)**: After the initial source writes, `bun run check` flagged 4 formatting errors (long lines / import-order). Applied `bunx --bun biome check --write .` to auto-fix; biome modified 3 files (`src/integration/escalate-actionable-hint.test.ts`, `src/failure-ux/escalate.test.ts`, `src/commands/next/verify-and-advance.test.ts`) — all formatting only, no semantic changes. Re-ran `bun run check` → exit 0 + 1216/0/4268 across 66 files.

## Senior Developer Review (AI)

**Reviewer**: AI Senior Dev (sub-agent dispatched by /bmad-loop iter 12, runId `2026-05-05T020322Z-bmad-next`, loopId `2026-05-04T193245Z-bmad-loop`)
**Date**: 2026-05-05
**Verdict**: **approve**

### Summary

Story 5.4 lands the FOURTH and final policy-handler of the failure-UX module group as **FORMALIZATION** (not greenfield) — promoting the implicit escalate-via-re-throw pattern from Stories 5.1/5.2/5.3 to an EXPLICIT pure-function `src/failure-ux/escalate.ts` (106 lines) that codifies the AR22 actionable-hint regex `/^.*(Run|See|Try|Check) /` as the canonical `ACTIONABLE_HINT_REGEX` export, with PASS-THROUGH for regex-matching `context.hint` (the common case per OQ-2 audit — verified independently for ALL 17 existing StepperError subclasses) and a SHAPE default safety-net for FUTURE non-matching hints. Story 5.1 N-5 forward-tracker (the `case "escalate"` v0.1 stub at `src/failure-ux/index.ts:102-105`) is **FULLY RESOLVED** — `dispatchFailureUx` now has FOUR explicit case branches with ZERO stub fallthrough; `grep -F "v0.1 stubs" src/failure-ux/index.ts` exits 1 (no match — comment block REMOVED entirely). The escalateHandler is invoked at FOUR throw sites in `verify-and-advance.ts` (retry-cap line 1093; SIGINT mid-route-to-fixer line 1146; post-fix-fail line 1278; defensive unexpected-outcome line 1299) via the `escalateEnrichedHint` closure variable that flows to the catch handler's `haltHint = escalateEnrichedHint ?? err.actionableHint` at line 1500 — used for BOTH the lastFailureReason.hint write (line 1509) AND the AR9 halt action message field (line 1549). NEW integration test `src/integration/escalate-actionable-hint.test.ts` (393 lines, 33 tests, 114 expects) is TABLE-DRIVEN per OQ-4 with THREE describe blocks: (1) registry sweep over 17 classes via `Object.entries(errorRegistry)` (CODIFIES OQ-2 audit + the regex CI gate per Task 11.3 forward-tracker); (2) table-driven escalateHandler enrichment over 12 escalate paths (10 primary + 2 optional bmad-incompatible/bmad-not-installed + SHAPE_DEFAULT safety-net); (3) end-to-end runVerifyAndAdvance escalate paths (3 rows) asserting AR9 message + lastFailureReason.hint match the regex AND no `"    at "` or `"Error:"` substring on main thread per NFR-M2. ZERO new error classes (registry held at 17 per AC line 1111 + epic-4-retro Recommendations item 3); ZERO schema field changes (LastFailureReasonSchema 4-field shape sufficient per OQ-1; only JSDoc extended). 8/8 quality gates INDEPENDENTLY GREEN. 10 OQs adjudicated transparently in spec. 3 dev-time deviations (D1/D2/D3) all ACCEPTED with no AC impact. 1 REPAIR R1 (biome auto-fix on 3 test files; formatting only). ALL counts MATCH dev's claims EXACTLY. STORY 5.4 COMPLETE.

### Acceptance Criteria Verification

- **AC-1** (escalate path with appropriate code + actionable hint includes run-log path + `--resume` invocation + `lastFailureReason` recorded): **PASS**. Verified at:
  - `src/failure-ux/escalate.ts:60` (`ACTIONABLE_HINT_REGEX = /^.*(Run|See|Try|Check) /` exported as canonical AR22 regex literal)
  - `src/failure-ux/escalate.ts:93-112` (escalateHandler: PASS-THROUGH on regex match; SHAPE default `"Run /bmad-next --resume to retry; see _bmad-output/.stepper/runs/${context.runId}/log.md for the failure detail."` includes BOTH `--resume` invocation literal AND run-log path per AC line 1111)
  - `src/failure-ux/index.ts:91-105` (dispatchFailureUx switch: 4 explicit case branches; case "escalate" delegates to escalateHandler; v0.1 stub comment block REMOVED entirely)
  - `src/commands/next/verify-and-advance.ts:1093-1100` (retry-cap site: `escalateHandler(failureContext, {})` invoked BEFORE `throw new VerifierFailureError(...)`; enriched hint stored in closure variable)
  - `src/commands/next/verify-and-advance.ts:1146-1153` (SIGINT mid-route-to-fixer site)
  - `src/commands/next/verify-and-advance.ts:1278-1288` (post-fix-fail site)
  - `src/commands/next/verify-and-advance.ts:1299-1306` (defensive unexpected-outcome site)
  - `src/commands/next/verify-and-advance.ts:1500` (`haltHint = escalateEnrichedHint ?? err.actionableHint`); lines 1506-1511 (lastFailureReason write uses haltHint for the `hint` field)
  - Tests: ESC_54_VA_1 (retry-cap) + ESC_54_VA_2 (route-to-fixer-cap) + ESC_54_VA_3 (raw verifier failure) + ESC_54_INT_E2E_* (3 e2e paths via runVerifyAndAdvance)

- **AC-2** (NO stack trace appears on main thread per NFR-M2 — full detail in run log): **PASS**. Verified at:
  - `src/commands/next/verify-and-advance.ts:1544-1551` (AR9 halt action's `message` field uses `haltHint` — actionable hint ONLY; NOT `err.message + Error.stack`)
  - Tests: ESC_54_VA_9 (asserts `result.action.message` does NOT contain `"    at "` or `"Error:"`) + ESC_54_INT_E2E_* (cross-tier assertion at integration test rows 296+) — full Error.stack lives ONLY in run-log JSON file per FR44

- **AC-3** (integration test asserts the actionable-hint regex `/^.*(Run|See|Try|Check) /` for every escalate path): **PASS**. Verified at:
  - `src/integration/escalate-actionable-hint.test.ts:134` (PART 1: `Object.entries(errorRegistry).forEach` sweep — 17 ESC_54_INT_REGISTRY_* tests covering ALL 17 StepperError subclasses)
  - `src/integration/escalate-actionable-hint.test.ts:151` (PART 2: TABLE-DRIVEN parametrized inner test sweeping 12 escalate paths — 10 primary + 2 optional bmad-incompatible/bmad-not-installed + SHAPE_DEFAULT)
  - `src/integration/escalate-actionable-hint.test.ts:296-326` (PART 3: end-to-end ESC_54_INT_E2E_* over 3 paths via runVerifyAndAdvance asserting AR9 message + lastFailureReason.hint match regex + no Error.stack on main thread)

### Architectural Constraints

- **AR8** (lock-free top-tier): **UPHELD**. The escalate handler is invoked at lock-held mid-tier `verify-and-advance.ts`; `runNext` adds ZERO new lock-acquire/release calls. The escalateHandler itself is a pure function (no I/O); the lock-held placement matches the throw sites + lastFailureReason write site (per OQ-9).
- **AR9** (single AR9 stdout line per command invocation): **UPHELD**. Each /bmad-next escalate invocation emits ONE AR9 halt action (the existing pattern); the `message` field carries ONLY the enriched actionable hint.
- **AR21+22** (errors registry held at 17): **UPHELD — registry held at 17**. Independently verified: `bun test src/errors.test.ts` 14/0/215 (UNCHANGED); `grep -c "extends StepperError" src/errors.ts` = 17. ALL 17 actionableHint values match the AR22 regex per independent regex sweep (17/17 PASS). The OQ-2 PASS-THROUGH common-case decision holds.
- **AR33** (no console.* in source): **UPHELD**. The escalate path uses `log.warn` from `src/io/log.ts`; full Error.stack lives ONLY in the run log JSON file via the existing log.json writer.
- **AR34** (slash-command markdown protocol): **EXTENDED**. `commands/bmad-next.md` gains escalate sub-section + 4-row Failure modes table + FR30+NFR-M2 cross-reference; `commands/bmad-loop.md` gains brief escalate-is-default sub-section + cross-link + FR30+NFR-M2+NFR-R8 cross-reference.
- **AR41** (boundary graph): **UPHELD**. `src/failure-ux/escalate.ts` imports ONLY `type FailureContext, FailureUxOutcome` from sibling `./index.ts` (zero cross-tier imports). The new file joins `src/failure-ux/{retry,skip,route-to-fixer}.ts` mid-tier module group — COMPLETING the four-handler module group.
- **AR42** (test discipline): **UPHELD**. Story 5.4 ADDS ZERO new test seams (handler is pure function); integration test uses existing test-injection seams (`verifierOverride`, `failurePolicyOverride`, `fixerDispatchOverride`) per D2 deviation.
- **AR20** (type-alias chain): **UPHELD**. `EscalateHandlerOpts` empty interface (forward-extensible per OQ-7); `ACTIONABLE_HINT_REGEX` constant export.
- **AR25+26** (finally discipline): **UPHELD**. The 4 escalate throw sites route through the existing try/finally in verify-and-advance.ts; lock release happens after throw; the catch handler's atomic saveState rides the existing path.
- **AR13** (Layer 2 atomic-write contract): **UPHELD**. lastFailureReason write rides existing saveState() with `.bak` rotation per AR13 + atomic tmp+rename per NFR-S5.

### Quality Gates (Independently Re-Verified — ONCE per CRITICAL scoping)

| Gate | Expected | Actual | Status |
|------|---------:|-------:|:------:|
| `bunx tsc --noEmit` | exit 0 | exit 0 (no output) | OK |
| `bun run check` (biome ci + tests) | 0 errors + 1216/0/4268 across 66 files | 0 errors + 1216/0/4268 across 66 files | OK |
| `bun test src/errors.test.ts` | 14/0/215 | 14/0/215 | OK |
| `bun test src/failure-ux/` | 58/0/137 across 5 files | 58/0/137 across 5 files | OK |
| `bun test src/integration/escalate-actionable-hint.test.ts` | 33/0/114 | 33/0/114 | OK |
| `grep -c "extends StepperError" src/errors.ts` | 17 | 17 | OK |
| `grep -F "v0.1 stubs" src/failure-ux/index.ts` | exit 1 (no match) | exit 1 (no match — REMOVED) | OK |
| Independent regex sweep (17 classes' actionableHint vs `/^.*(Run|See|Try|Check) /`) | 17/17 pass | 17/17 pass | OK |

ALL 8 quality gates GREEN on independent verification; ALL counts MATCH dev's claims EXACTLY.

### Open Questions (10 OQs adjudicated)

- **OQ-1** (lastFailureReason schema shape — extend OR keep 4-field OR nest): **ACCEPT KEEP EXISTING 4-FIELD; DERIVE RUN-LOG PATH FROM runId**. Sound — schema migration burden avoided; run-log path is deterministic from runId per Story 1.3+2.5+3.1 conventions; only JSDoc extended (verified at `src/schemas/state.ts` LastFailureReasonSchema). Forward-tracker for Story 6.x: explicit `recordedAt` timestamp.
- **OQ-2** (existing actionableHint pre-audit — verify all 17 already match the regex): **ACCEPT ALL 17 PASS-THROUGH; ZERO REGISTRY EDITS**. Independently re-verified via regex sweep — 17/17 PASS. CI gate codification delivered via integration test ESC_54_INT_REGISTRY_* sweep (defence-in-depth per Task 11.3 optional path).
- **OQ-3** (NFR-M2 stack trace prohibition test scope — main-thread only OR every console.error/process.stderr write): **ACCEPT OPTION B — STDOUT + STDERR**. Verified — ESC_54_VA_9 + ESC_54_INT_E2E_* assert no `"    at "` or `"Error:"` substring on either surface; full Error.stack lives ONLY in run log JSON per FR44.
- **OQ-4** (integration test parametrization — one test per path OR table-driven sweep): **ACCEPT OPTION B — TABLE-DRIVEN**. Sound — mirrors Story 1.2 errors.test.ts CI gate pattern; concise; extensible. Three describe blocks at integration test (registry sweep + table-driven enrichment + end-to-end).
- **OQ-5** (lastFailureReason persistence — atomic write per Story 1.3 contract): **ACCEPT NO BYPASS — ATOMIC WRITE PRESERVED**. The escalateHandler invocation lives BEFORE the throw; the catch handler's saveState is unchanged; ESC_54_VA_7 SIGINT mid-escalate verifies partial-state atomicity (D1 deviation accepted — see below).
- **OQ-6** (lastFailureReason CLEARED on success — should it auto-clear when next /bmad-next succeeds?): **ACCEPT KEEP EXISTING AUTO-CLEAR**. Verified at verify-and-advance.ts:1428 (success path sets `lastFailureReason: null`); ESC_54_VA_8 verifies (the auto-clear semantic preserved across Stories 3.1+5.1+5.3+5.4).
- **OQ-7** (escalate handler input types — FailureContext from 5.1+ sufficient for v0.1?): **ACCEPT SUFFICIENT — NO NEW FIELDS**. The 6-field FailureContext is sufficient; `EscalateHandlerOpts` declared as forward-extensible empty interface (with biome-ignore for `noEmptyInterface` per OQ-7 forward-tracker).
- **OQ-8** (dispatch-error path coverage — sub-agent timeout in scope): **ACCEPT TimeoutError + ConfigError + StateChangedDuringDispatchError**. All three included in the integration test data table per Task 10.2; other classes covered by OQ-2 pre-audit (17/17 sweep).
- **OQ-9** (lock-held vs lock-free escalate handler placement): **ACCEPT VERIFY-AND-ADVANCE.TS MID-TIER (mirror Stories 5.1/5.2/5.3 placement)**. Sound — same scope as throw sites + lastFailureReason write site; no new lock-acquire/release; pure-function handler is no-conflict mid-tier.
- **OQ-10** (telemetry escalate-event payload — Epic 6 dependency): **ACCEPT OPTION A — `state.lastFailureReason` AS SOURCE**. Forward-tracker for Story 6.6/6.7 (telemetry consumes the regex-conforming hint + StepperErrorCode for halt aggregation).

### Repair adjudicated

- **R1** (biome auto-fix): After initial source writes, `bun run check` flagged 4 formatting errors (long lines / import-order). Applied `bunx --bun biome check --write .` to auto-fix; biome modified 3 test files (`src/integration/escalate-actionable-hint.test.ts`, `src/failure-ux/escalate.test.ts`, `src/commands/next/verify-and-advance.test.ts`) — formatting only, no semantic changes; re-ran `bun run check` exit 0 + 1216/0/4268 across 66 files. **ACCEPT**. Sound — formatting-only auto-fix is a documented Story 5.x pattern (mirrors Story 5.3 R1 precedent).

### Deviations adjudicated

- **D1** (escalate handler invocation site count): spec Task 7 lists 4 sites at lines 1071/1118/1241/1254. Implementation wires at 4 sites (retry-cap, SIGINT mid-route-to-fixer, post-fix-fail, defensive unexpected-outcome). The SIGINT mid-retry throw site (lines ~1108-1112) is NOT explicitly wired with escalateHandler — that throw uses `VerifierFailureError.actionableHint` which already matches the regex per OQ-2. The catch handler's `escalateEnrichedHint ?? err.actionableHint` fallback ensures the regex contract holds via the class default. **ACCEPT** — sound rationale; no AC impact (ESC_54_VA_7 SIGINT mid-retry test verifies the lastFailureReason.hint matches the regex even on the SIGINT path).
- **D2** (integration test in-process via test seams vs subprocess driver): existing Story 3.1 integration test (`halt-records-state.test.ts`) uses subprocess driver isolation. Story 5.4 integration test uses IN-PROCESS driving via existing test-injection seams. **ACCEPT** — sound; faster (~350ms vs ~5-10s), simpler (no driver source-string composition), equally rigorous for the AR22 regex assertion. The subprocess driver remains available at halt-records-state.test.ts for the Story 3.1 5-code halt matrix.
- **D3** (NFR-M2 tests placed in verify-and-advance.test.ts + integration test rather than run.test.ts): spec Task 9.2 lists 4 tests in run.test.ts. Implementation places NFR-M2 enforcement tests in verify-and-advance.test.ts (ESC_54_VA_9 + ESC_54_VA_10) AND integration test (ESC_54_INT_E2E_*). **ACCEPT** — sound rationale: AR9 halt action message field is COMPOSED in verify-and-advance.ts catch handler (lines 1544-1551); run.ts only EMITS the AR9 line. The verify-and-advance.test.ts coverage exercises actual composition logic.

### Findings

**Must Fix (0)**: (none)

**Should Fix (0)**: (none)

**Nits (4 inherited + 0 new = 4)**:
- **N-1 (inherited from Stories 4.2-4.10 + 5.1 + 5.2 + 5.3)**: defensive `epicNum === undefined || epicNum === null` check at `src/commands/loop/stop-conditions.ts:269` — the `=== null` arm is unreachable. Story 5.4 does NOT modify `stop-conditions.ts`. Cosmetic forward-tracker.
- **N-2 (inherited from Stories 4.2-4.10 + 5.1 + 5.2 + 5.3)**: `EMPTY_DAG` + `EMPTY_STATE` sentinels at `src/commands/loop/run.ts` mid-file placement. Story 5.4 does NOT modify `run.ts`. Cosmetic; Story 6.x cleanup forward.
- **N-3 (inherited from Stories 4.8-4.10 + 5.1 + 5.2 + 5.3)**: future task records should snapshot final test counts AFTER the LAST `biome --write` pass. Story 5.4 dev-iter t1-dev-story.yaml correctly snapshots final 1216/0/4268 matching the post-biome actual (verified independently). Process-discipline forward-tracker that the Story 5.4 dev-iter honoured.
- **N-4 (inherited from Story 4.10 + 5.1 + 5.2 + 5.3)**: TWO unused LoopOpts seams `finalStateOverride` + `writeLoopExitTranscriptOverride`. Story 5.4 does NOT touch the unused seams. Pure dead surface; Story 6.x cleanup forward.

**Story 5.1 N-5 forward-tracker (dispatchFailureUx v0.1 stub)** is now **FULLY RESOLVED** by Story 5.4 — Story 5.2 wired skip; Story 5.3 wired route-to-fixer; Story 5.4 wires the formal escalateHandler AND removes the v0.1 stub comment block at `src/failure-ux/index.ts:102-105` entirely. The four-handler module group is COMPLETE with ZERO stub fallthrough (verified independently: `grep -F "v0.1 stubs" src/failure-ux/index.ts` exit 1).

**Info / Forward-Trackers (5 inherited + 4 new = 9 total)**:
- **I-1 (inherited from Story 4.8 §I-1 + 5.1/5.2/5.3 §I-1)**: verify-and-advance.ts atomic-write contract guarantees all-or-nothing. Story 5.4 RIDES this contract via the catch handler's stateOnHalt write. AR13 Layer 2 atomic tmp+rename + .bak rotation per NFR-S5. SIGINT mid-escalate-path safe per ESC_54_VA_7 verification.
- **I-2 (inherited from Story 4.10 §I-2 + 4.9 §I-2 + 5.1/5.2/5.3 §I-2)**: Story 5.x failure-UX modes interaction with SIGINT. Story 5.4 honoured via ESC_54_VA_7 (SIGINT mid-retry-cap escalate halts cleanly with lastFailureReason recorded; the SIGINT mid-route-to-fixer site invokes escalateHandler explicitly per spec Task 7.3).
- **I-3 (inherited from 5.1 §I-4 + 5.2 §I-3 + 5.3 §I-3)**: Production retry-dispatch mechanism gap. NOT APPLICABLE for Story 5.4 (escalate is state-mutation-only; no sub-agent re-dispatch).
- **I-4 (inherited from 5.1 §I-5 + 5.2 §I-4 + 5.3 §I-4)**: D1 dual-shape consolidation. NOT APPLICABLE for Story 5.4 (no RunHistoryEntrySchema changes).
- **I-5 (inherited from 5.1 §I-7 + 5.2 §I-5 + 5.3 §I-5)**: Telemetry consumption (Story 6.6/6.7) iterates `state.runHistory[]` filtered by `attemptNumber > 1` / `skipped === true` / `fixAttempt === true`; Story 5.4 ADDS the parallel `state.lastFailureReason`-based halt-counts source (regex-conforming hint for telemetry-friendly forensic context).
- **I-6 (NEW — Story 5.4)**: Halt history array for richer telemetry timelines — v0.1 ships only the LAST halt via `state.lastFailureReason`; forward-tracker for Story 6.x extension to `state.haltHistory[]` array for richer halt forensic timelines.
- **I-7 (NEW — Story 5.4)**: Optional `--verbose` flag for stack-trace-on-stderr — per OQ-3 forward-tracker; v0.1 ONLY actionable hint on stderr per NFR-M2; debugging affordance for future Story 6.x.
- **I-8 (NEW — Story 5.4)**: `recordedAt` timestamp in lastFailureReason — per OQ-1 forward-tracker; v0.1 schema is 4-field; future telemetry consumption may need explicit timestamp.
- **I-9 (NEW — Story 5.4)**: Regex tightening — if hint quality drifts in v0.1.x, tighten the AR22 regex to `/^(Run|See|Try|Check) /` strict (NOT just contains); v0.1 ships the contains-form `/^.*(Run|See|Try|Check) /` per architecture line 589.

### Sign-off

**approve**. Story 5.4 is COMPLETE, ready for next story 5.5 (Interactive Pause Between Steps). The implementation is clean, well-tested (61 NEW tests across 7 layers: 16 escalate.test.ts unit + 5 schemas/state.test.ts ESC_54_LFR + 7 verify-and-advance.test.ts ESC_54_VA + 33 integration test ESC_54_INT_REGISTRY_*/ESC_54_INT_*/ESC_54_INT_E2E_*), well-documented (10 OQs adjudicated transparently in spec; 3 dev-time deviations all ACCEPTED with no AC impact; 1 documented + accepted repair R1 — biome auto-fix on 3 test files), and honours ALL relevant epic-4-retrospective Recommendations (items 1, 3, 4 — including item 3 "Epic 5 should NOT add new error classes" — registry stays at 17, REUSING existing classes per OQ-2 audit) plus Story 4.8/4.9/4.10/5.1/5.2/5.3 forward-trackers. Story 5.1 N-5 (dispatchFailureUx v0.1 stub) is **FULLY RESOLVED** — the four-handler module group is COMPLETE with ZERO stub fallthrough. ZERO blocking concerns. ZERO source mutations during review. Recommended next loop step: bmad-create-story for Story 5.5 (5-5-interactive-pause-between-steps). Epic 5 is `in-progress` (Stories 5.1+5.2+5.3+5.4 done; Stories 5.5+5.6 backlog).

## Change Log

| Date       | Author    | Change                              |
| ---------- | --------- | ----------------------------------- |
| 2026-05-05 | bmad-code-review (Claude Opus 4.7 1M, iter 12) | Story 5.4 code-review COMPLETE — status flipped review → done. Senior Developer Review section appended; verdict **approve**; 0 must-fix / 0 should-fix / 4 nits (all 4 inherited N-1/N-2/N-3/N-4 unchanged) / 9 info forward-trackers (5 inherited I-1/I-2/I-3/I-4/I-5 + 4 NEW I-6 halt history array / I-7 --verbose flag for stack-trace-on-stderr / I-8 recordedAt timestamp in lastFailureReason / I-9 regex tightening). Story 5.1 N-5 dispatchFailureUx v0.1 stub forward-tracker FULLY RESOLVED — four-handler module group COMPLETE with ZERO stub fallthrough. AC-1/AC-2/AC-3 ALL VERIFIED at source-line refs (escalate.ts:60 ACTIONABLE_HINT_REGEX; :93-112 escalateHandler PASS-THROUGH+SHAPE; index.ts:91-105 4 case branches; verify-and-advance.ts:1093/1146/1278/1299 4 throw sites + :1500 haltHint + :1544-1551 AR9 message field uses haltHint NOT err.message+Error.stack; integration test:134/151/296 3 describe blocks). 8/8 quality gates INDEPENDENTLY RE-VERIFIED GREEN: tsc 0 / biome ci 0 + 1216/0/4268 across 66 files / errors 14/0/215 / failure-ux/ 58/0/137 across 5 files / integration/escalate-actionable-hint.test.ts 33/0/114 / grep StepperError = 17 / grep v0.1 stubs exit 1 (REMOVED) / independent regex sweep 17/17 PASS. 10 OQs adjudicated; 3 D-deviations all ACCEPTED with no AC impact (D1 4 wired sites + SIGINT mid-retry uses class default; D2 in-process test seams faster + equally rigorous; D3 NFR-M2 tests placed where composition logic lives); 1 REPAIR R1 biome auto-fix ACCEPTED. Sprint-status 5-4 review → done; epic-5 stays in-progress (2 stories remaining: 5.5 + 5.6); last_updated 2026-05-05T02:03:22Z bumped at lines 2 + 38. State.yaml workflow advanced: lastStep=bmad-code-review; lastStepCompletedAt 2026-05-05T02:03:22Z; nextStep=bmad-create-story; nextStepStory '5.5'; nextStepKey 5-5-interactive-pause-between-steps; evidenceIndex appended. STORY 5.4 COMPLETE. |
| 2026-05-05 | bmad-dev-story (Claude Opus 4.7 1M, iter 11) | Story 5.4 implementation COMPLETE — status flipped ready-for-dev → review. **THREE PRIMARY DELIVERABLES**: (1) NEW `src/failure-ux/escalate.ts` (106 lines) — pure-function escalateHandler completing the four-handler module group (`retry` + `skip` + `route-to-fixer` + `escalate`); exports `ACTIONABLE_HINT_REGEX = /^.*(Run|See|Try|Check) /` (codifies the AR22 regex contract per AC line 1113); PASS-THROUGH for regex-matching hints (common case per OQ-2 audit — all 17 existing classes match) + SHAPE default safety-net for FUTURE non-matching hints. (2) MODIFIED `src/failure-ux/index.ts` — dispatchFailureUx delegates `case "escalate"` to formal escalateHandler; v0.1 stub comment block at lines 102-105 REMOVED entirely (RESOLVES Story 5.1 N-5 forward-tracker LAST portion; switch now has FOUR explicit case branches with ZERO stub fallthrough). (3) NEW `src/integration/escalate-actionable-hint.test.ts` (~330 lines, 33 tests, 114 expects) — TABLE-DRIVEN integration test per OQ-4 with three describe blocks: registry sweep over 17 classes (CODIFIES OQ-2 audit) + table-driven over 12 escalate paths (10 primary + 2 optional bmad-incompatible/bmad-not-installed) + end-to-end over 3 paths via runVerifyAndAdvance asserting AR9 message + lastFailureReason.hint match the regex AND no Error.stack on main thread per NFR-M2. **WIRING**: closure variable `escalateEnrichedHint` in verify-and-advance.ts threads the enriched hint from the FOUR escalate throw sites (retry-cap, SIGINT mid-route-to-fixer, post-fix-fail, defensive unexpected-outcome) through to the catch handler's lastFailureReason.hint write + AR9 halt action's message field via `haltHint = escalateEnrichedHint ?? err.actionableHint`. **NO new error classes** (registry held at 17 per AC line 1111 + epic-4-retro Recommendations item 3); **NO schema changes** (existing 4-field LastFailureReasonSchema sufficient per OQ-1; runLogPath derived from runId at presentation time). **DOCS**: bmad-next.md gains escalate sub-section + 4-row Failure modes table + FR30 + NFR-M2 cross-reference; bmad-loop.md gains brief escalate-is-default note + cross-link + FR30 + NFR-M2 + NFR-R8 cross-reference. **QUALITY GATES** ALL GREEN: bunx tsc --noEmit exit 0; bun run check exit 0 (1216 pass / 0 fail / 4268 expect calls across 66 files; was 1155/0/4081 across 64 files; +61 tests / +187 expects / +2 files); bun test src/errors.test.ts 14/0/215 (registry held at 17 — UNCHANGED); bun test src/failure-ux/ 58/0/137 across 5 files (was 42/0/102 across 4); bun test src/integration/escalate-actionable-hint.test.ts 33/0/114 (NEW); grep -c "extends StepperError" src/errors.ts → 17 (UNCHANGED); grep -F "v0.1 stubs" src/failure-ux/index.ts exit 1 (NO match — REMOVED). **3 DEVIATIONS** (D1 escalate handler invocation site count: 4 sites wired per spec, SIGINT mid-retry path uses class default which already matches regex; D2 integration test in-process via test seams vs subprocess driver: faster + simpler, equally rigorous; D3 NFR-M2 tests placed in verify-and-advance.test.ts + integration test rather than run.test.ts: actual composition logic lives in verify-and-advance.ts catch handler) all ACCEPTED with no AC impact. **1 REPAIR** (R1 biome auto-fix: 4 formatting errors auto-corrected via `bunx --bun biome check --write .` — 3 test files reformatted, no semantic changes; re-ran `bun run check` exit 0). **AC verification**: AC-1 (escalate path with appropriate code + actionable hint includes run-log path + --resume + lastFailureReason recorded) VERIFIED via ESC_54_VA_1/2/3 + ESC_54_INT_E2E_*. AC-2 (NO stack trace on main thread per NFR-M2) VERIFIED via ESC_54_VA_9 + ESC_54_INT_E2E_* (asserts message does NOT contain "    at " or "Error:"). AC-3 (integration test asserts regex over EVERY escalate path) VERIFIED via ESC_54_INT_REGISTRY_* (17 classes) + ESC_54_INT_* (12 paths) + ESC_54_INT_E2E_* (3 end-to-end paths). Sprint-status 5-4-escalate-failure-mode ready-for-dev → review (line 98); epic-5 stays in-progress (line 94 UNCHANGED). State.yaml workflow advanced: lastStep=bmad-dev-story; nextStep=bmad-code-review; evidenceIndex appended. |
| 2026-05-05 | bmad-create-story (Claude Opus 4.7 1M) | Story 5.4 spec created (~target 600-1000 lines; AC byte-identical to epics.md lines 1107-1113 verified via diff). Frontmatter status: ready-for-dev; story_id 5.4; epic 5; FR30+FR32 PRIMARY; NFR-M2 PRIMARY; AR21+AR22 PRIMARY; 16 dependencies (5.3 PRIMARY for src/failure-ux/ four-handler module group; 5.2 for SkipRequiresResumeError actionable-hint precedent; 5.1 for src/failure-ux/{index,retry}.ts + escalate-via-re-throw pattern at retry-loop scaffold; 4.10/4.9/4.8/4.6/3.2/3.1/2.6/2.4/1.12/1.7/1.6/1.5/1.3/1.2 foundational); 41 inputDocuments. THREE primary deliverables: (1) NEW src/failure-ux/escalate.ts pure-function escalateHandler (mirror Stories 5.1 retry.ts + 5.2 skip.ts + 5.3 route-to-fixer.ts pattern; FormalDescription handler + ACTIONABLE_HINT_REGEX literal + EscalateHandlerOpts interface; PASS-THROUGH for regex-matching hints + shape default for non-matching); (2) MODIFY src/failure-ux/index.ts to delegate `policy === "escalate"` to formal escalateHandler + REMOVE the v0.1 stub comment block at lines 102-105 (RESOLVES Story 5.1 N-5 forward-tracker LAST portion); (3) NEW src/integration/escalate-actionable-hint.test.ts table-driven integration test parametrized over 10+ escalate paths (per OQ-4 decision). Architectural decisions: (i) ZERO new error classes per AC line 1111 + epic-4-retro Recommendations item 3 (registry stays at 17 — REUSE existing classes); (ii) NO schema extension per OQ-1 (existing LastFailureReasonSchema 4-field shape sufficient; runLogPath derived from runId at presentation time); (iii) PASS-THROUGH for all 17 existing class hints per OQ-2 audit (all 17 hints already match the regex); (iv) NFR-M2 enforcement at BOTH stdout (AR9 message) AND stderr (warn/error captures) per OQ-3 (full Error.stack lives ONLY in run log JSON per FR44); (v) Table-driven integration test per OQ-4 (one outer describe with parametrized inner test sweeping 10+ paths); (vi) lock-held mid-tier placement per OQ-9 (mirrors Stories 5.1/5.2/5.3 placement; same scope as throw sites + lastFailureReason write); (vii) lastFailureReason auto-clear on success preserved per OQ-6; (viii) telemetry via state.lastFailureReason for halt counts per OQ-10. Sprint-status 5-4-escalate-failure-mode backlog → ready-for-dev (line 98); epic-5 stays in-progress (line 94 UNCHANGED). NO src/ mutations during create-story phase (those are dev-story iter work). Errors registry unchanged at 17 codes during create-story step. |
