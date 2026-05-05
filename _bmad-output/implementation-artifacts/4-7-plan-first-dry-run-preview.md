---
status: done
story_id: '4.7'
story_key: 4-7-plan-first-dry-run-preview
epic: '4'
title: '`--plan-first` Dry-Run Preview'
created: '2026-05-04'
last_updated: '2026-05-04T02:45:00Z'
priority: H
estimated_effort: M
fr_coverage:
  - FR8
  - FR9
  - FR19
  - FR21
  - FR23
  - FR53
  - FR54
nfr_coverage:
  - NFR-P1
  - NFR-S2
  - NFR-S5
  - NFR-R1
  - NFR-R4
  - NFR-M3
ar_coverage:
  - AR8
  - AR9
  - AR10
  - AR21
  - AR22
  - AR33
  - AR34
  - AR41
  - AR42
deps:
  - 4-6-stop-condition-error-with-stop-on-error-continue-on-error   # PRIMARY: default-cap inverted-check at run.ts:510-522 must EXTEND with `&& args.planFirst !== true` clause per 4.6 SDR forward-tracker #1; halt-on-error short-circuit pattern; LoopMetrics + LoopOpts seam
  - 4-5-stop-condition-time-budget-and-token-budget                 # PATTERN: LoopMetrics deferred-baseline; AR10 token-flow source for token estimation; Bun.nanoseconds() loop-entry snapshot pattern
  - 4-4-stop-condition-max-iters-and-default-cap                    # PATTERN: default-cap inverted-check pattern; AC-2 message-format precedent; FR25 default-cap origin
  - 4-3-stop-condition-next-story-and-phase-end                     # PATTERN: LoopContext baseline + per-iteration stateFn; opt-in DAG load pattern (analogous gating for plan-mode DAG load)
  - 4-2-stop-condition-epic-end-and-story-x-y                       # PATTERN: stop-conditions.ts file structure + sprintStatus consumption; AR9 message-format precedent
  - 4-1-bmad-loop-command-skeleton                                  # SKELETON: LoopArgsSchema declares planFirst at args.ts:103 (parsed-only since 4.1); IterationRecord shape (action union); AR9 final-emission strategy; "report" action variant in dispatch protocol
  - 1-10-dag-seed-three-tier-registry                               # DAG: build({ skillNames }) + DagAdjacency + topological-walk seed; Story 4.7's plan walks dag.nodes/edgesOut to enumerate planned steps
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/implementation-artifacts/4-6-stop-condition-error-with-stop-on-error-continue-on-error.md
  - _bmad-output/implementation-artifacts/4-5-stop-condition-time-budget-and-token-budget.md
  - _bmad-output/implementation-artifacts/4-4-stop-condition-max-iters-and-default-cap.md
  - _bmad-output/implementation-artifacts/4-3-stop-condition-next-story-and-phase-end.md
  - _bmad-output/implementation-artifacts/4-2-stop-condition-epic-end-and-story-x-y.md
  - _bmad-output/implementation-artifacts/4-1-bmad-loop-command-skeleton.md
  - _bmad-output/implementation-artifacts/3-1-record-last-attempted-last-failure-reason-on-halt.md
  - _bmad-output/implementation-artifacts/sprint-status.yaml
  - .bmad-stepper/state.yaml
  - src/commands/loop/args.ts
  - src/commands/loop/run.ts
  - src/commands/loop/run.test.ts
  - src/commands/loop/stop-conditions.ts
  - src/commands/loop/stop-conditions.test.ts
  - src/commands/loop/index.ts
  - src/commands/next/run.ts
  - src/commands/next/verify-and-advance.ts
  - src/commands/next/args.ts
  - src/dag/index.ts
  - src/dag/types.ts
  - src/dag/build.ts
  - src/dag/seed-v6.x.ts
  - src/state/load.ts
  - src/schemas/state.ts
  - src/schemas/dispatch-protocol.ts
  - src/dispatch/emit.ts
  - src/errors.ts
  - commands/bmad-loop.md
---

# Story 4.7: `--plan-first` Dry-Run Preview

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper user (overnight loop pattern),
I want `/bmad-loop --plan-first` to preview the planned step sequence before committing tokens,
So that I never start an unattended run on a wrong assumption.

## Context Summary

This is the **seventh story of Epic 4 (Bounded Loop with Eight Stop Conditions)** and it lands the **`--plan-first` dry-run preview** flag per FR21. It is structurally distinct from Stories 4.1-4.6: those stories wired runtime stop-condition flags that drive the iteration body. **Story 4.7's `--plan-first` is a PRE-FLIGHT PREVIEW MODE** — when supplied, the loop runner computes the planned sequence of steps (best-effort, walking the DAG until the first declared stop condition would fire), emits ONE AR9 `"report"` JSON line carrying the human-readable plan in its `message` field, and exits 0 without dispatching anything (no `runNext` invocation, no state mutation, no per-iteration body, no token spend on Task subagents).

**Story 4.7's scope is THREE acceptance criteria** rolled into a single AC block (epics.md lines 994-1000):

- AC-1 (line 998): when `--plan-first` is supplied → compute the planned step sequence (best-effort, since failures may divert) until the first declared stop condition would fire → emit a JSON-line action `"report"` with the human-readable plan → exit 0 without dispatching anything.
- AC-2 (line 999): the plan output includes total estimated steps, total estimated tokens (using `models:` config + per-step budgets), checkpoints (if `--checkpoint-each` is supplied).
- AC-3 (line 1000): the plan output is reproducible across invocations on the same state.

The flag was already declared in `LoopArgsSchema` at `src/commands/loop/args.ts:103` per Story 4.1 (RUNTIME-DEFERRED) — Story 4.7 wires it at runtime. Net deliverables: **ZERO new exported error classes (registry holds at 16); ZERO state schema changes; ZERO new I/O imports; ZERO new `console.*` calls; ONE new helper module `src/commands/loop/plan.ts` (pure function — no I/O); FOUR modified files (1 new + 2 source-modified + 1 markdown)**.

**`--plan-first` semantics per AC-1 verbatim** (epics.md line 998): the runner DOES NOT enter the iteration body. After argv parsing + LoopArgs resolution, the runner detects `args.planFirst === true` and short-circuits to a pre-flight branch:

1. Read state via `loadStateUnlocked()` (lock-free per AR8 — same loader the iteration body uses, but called ONCE before any iteration would have run).
2. Read sprint-status via the existing `loadSprintStatusForLoop()` helper.
3. Build the DAG via `buildDag({ skillNames: [] })` (always — plan-mode requires the DAG to walk planned steps; opt-in DAG load pattern from Story 4.3 is INSUFFICIENT here because plan-mode ALWAYS needs the DAG, regardless of other flags).
4. Compute the plan via the new pure helper `computePlan(state, dag, sprintStatus, args)` returning a structured `Plan` shape — total estimated steps, planned step list, total estimated tokens (degraded fallback when `models:` config is absent — Story 6.3 dependency), checkpoints (degraded fallback when `--checkpoint-each` is absent — Story 4.8 forward dependency), the first stop condition that would fire on the planned walk.
5. Format the plan as a HUMAN-READABLE multi-line text body via the new pure helper `formatPlan(plan): string`.
6. Emit ONE AR9 `"report"` JSON line via `emitDispatchAction({ action: "report", message: <formattedPlan>, exitCode: 0 })`. The plan text lives ENTIRELY inside the `message` field — the AR9 JSON line itself remains a single stdout line per AR9 + FR54 (the `message` value contains embedded `\n` for the human-readable layout).
7. Exit with code 0 (clean exit; the dry-run is the success path per AC-1 "exits 0 without dispatching anything").

**`--plan-first` does NOT enter the iteration body**: this is the central design decision. The pre-flight branch is gated immediately AFTER LoopArgs resolution and BEFORE the default-cap injection block, ALL the loop-entry initialisation (LoopMetrics, LoopContext, dagFn, stateFn, sprintStatusFn closures), AND the iteration `while (true)` loop. This means: ZERO tokens spent on Task subagents (AC-1 "without dispatching anything"); ZERO state.yaml writes (no `verify-and-advance.ts` invocations); ZERO checkpoint snapshots (Story 4.8 forward dependency); ZERO halt-on-error gates (Story 4.6 path is irrelevant in plan-mode). The only I/O Story 4.7 performs is THREE read-only loads (state, sprint-status, DAG) — all lock-free per AR8.

**`Plan` data shape** (new exported type, lives in `src/commands/loop/plan.ts`):

```typescript
export interface PlannedStep {
  readonly step: string;
  readonly epic: string | null;
  readonly story: string | null;
  readonly phase: Phase;
  readonly persona: string | readonly string[] | null;
  readonly estimatedTokensIn: number | null;
  readonly estimatedTokensOut: number | null;
}

export interface PlanCheckpoint {
  readonly afterStep: string;
  readonly stepType: "story" | "epic" | "phase";
  readonly description: string;
}

export interface PlanFirstStopCondition {
  readonly code: StopReason["code"];
  readonly message: string;
}

export interface Plan {
  readonly totalEstimatedSteps: number;
  readonly steps: readonly PlannedStep[];
  readonly totalEstimatedTokensIn: number | null;
  readonly totalEstimatedTokensOut: number | null;
  readonly modelsConfigPresent: boolean;
  readonly checkpoints: readonly PlanCheckpoint[];
  readonly checkpointEachConfigured: boolean;
  readonly firstStopCondition: PlanFirstStopCondition | null;
}
```

Each field is `readonly` per Story 4.3 OQ-9 immutable-struct pattern. The `null` values on token estimates are the v0.1 graceful-fallback signal (Story 6.3 `models:` config dependency is not yet implemented; v0.1 conservative renders these as `"<unknown — Story 6.3 models: config required>"` in the formatted body and aggregates as `null` total). The `checkpoints` array is empty when `--checkpoint-each` is absent OR when Story 4.8 has not yet wired the runtime semantics; v0.1 conservative renders the empty array with a "(none — `--checkpoint-each` not supplied)" placeholder line.

**Plan computation algorithm** (pure function `computePlan` in `src/commands/loop/plan.ts`):

1. Determine the **plan-walk start node**: when `state.lastSuccessfulStep !== null`, find a successor in `dag.edgesOut.get(state.lastSuccessfulStep.step)` that is NOT yet completed (per `state.runHistory[]` traversal). When `state.lastSuccessfulStep === null`, pick the first un-completed seed node (analogous to `runNext`'s zero-state path).
2. Walk the DAG **iteratively** following the topological successors (when multiple successors exist, choose the one with `optional === false` first; when ties remain, fall back to insertion-order from `dag.nodes` — deterministic per the `Map` insertion-order invariant from Story 1.10's `src/dag/types.ts:73-77`).
3. For each visited node, **evaluate the stop condition predicates** (re-using `evaluateStopConditions` from `stop-conditions.ts` with a **synthetic state** that pretends the just-visited step has just completed). Stop the walk on the FIRST predicate that fires; record the `firstStopCondition` field.
4. Apply a **plan-walk safety cap** (constant `MAX_PLAN_WALK = 200` defined in `plan.ts`). If no stop condition fires within 200 hops, halt the plan with a synthetic `firstStopCondition: { code: "max-iters-reached", message: "(plan-walk safety cap reached at 200 hops)" }`. Rationale: the actual `--max-iters=50` default-cap injection is BYPASSED in plan-mode (per Task 1 below) so a misconfigured loop or a DAG cycle could otherwise spin indefinitely in plan-mode. The 200 cap is generous enough to surface the user's intended scope while bounding worst-case plan computation.
5. For each `PlannedStep`, fill `estimatedTokensIn`/`estimatedTokensOut` from the `models:` config IF available (Story 6.3 forward dependency). v0.1 conservative: query a stub helper `lookupModelTokens(stepName): { tokensIn: number; tokensOut: number } | null` defined in `plan.ts` that returns `null` for v0.1 (Story 6.3 will replace this stub with the actual config lookup); the runner aggregates `null`s as `null` for the total when ANY step lacks tokens.
6. For each visited step matching `args.checkpointEach` (when supplied), append a `PlanCheckpoint` entry. Story 4.8 forward dependency: when `args.checkpointEach === undefined`, the checkpoints array is empty (graceful fallback documented in OQ-3 below); when supplied AND Story 4.8 has not yet wired runtime semantics, the plan-mode STILL surfaces the checkpoint locations because the plan computation is pure-function over `args.checkpointEach + dag.nodes[].phase` lookup — no Story 4.8 runtime dependency.
7. Return the immutable `Plan` value.

**Plan formatting** (pure function `formatPlan` in `src/commands/loop/plan.ts`): produces a multi-line human-readable text body. Format (illustrative, not byte-mandated):

```
Plan: <N> steps planned (first stop: <stop-code> — <stop-message>)

Total estimated steps: <N>
Total estimated tokens: <T> in + <T> out (or "<unknown — Story 6.3 models: config required>")

Steps:
  1. <step-name> [<phase>] (epic <E>, story <S>) — <persona> — ~<t> in / ~<t> out tokens
  2. ...

Checkpoints (--checkpoint-each <type>):
  After step <step-name>: <description>
  (or "(none — --checkpoint-each not supplied)")

First stop condition: <code> — <message>
```

The `firstStopCondition` line is always emitted; when the walk terminates by the safety cap, the synthetic message is rendered. The full text becomes the `message` field of the AR9 `"report"` JSON line — newlines inside the `message` string are NOT problematic for AR9 because the JSON-line discipline applies to the OUTER JSON line (which embeds the message via JSON-string escaping). Story 4.7 v0.1 chooses HUMAN-READABLE text over a structured nested-JSON message because (a) FR18 mandates one-line summaries on stdout but the AR9 `"report"` action's `message` field is documented as containing the human-readable summary (architecture line 1660 + epics.md line 998 verbatim "human-readable plan"); (b) the consumer (Layer 1 markdown's "Print the message field VERBATIM") emits it as-is per `commands/bmad-loop.md`.

**Default-cap inverted-check extension** (per Story 4.6 SDR forward-tracker #1, line 893): the default-cap inverted-check at `src/commands/loop/run.ts:510-522` MUST extend with `&& args.planFirst !== true` clause so that `--plan-first` does NOT trigger the default 50-iter cap. **However**, Story 4.7's pre-flight branch is gated BEFORE the default-cap stanza — so the cap injection becomes unreachable in plan-mode regardless. The `args.planFirst !== true` clause is added DEFENSIVELY for symmetry with the other 9 clauses (maxIters, untilEpicEnd, untilStory, nextStory, phaseEnd, timeBudgetMs, tokenBudget, stopOnError, continueOnError) AND to ensure that if the pre-flight gate is ever moved or refactored, the cap injection still does the right thing for plan-mode. The defensive clause also future-proofs against a hypothetical `--plan-first --max-iters 5` invocation if a future story chose to still gate on planFirst inside the iteration body.

**Pre-flight gate placement decision** (cf. OQ-7 below): the pre-flight branch is gated AFTER LoopArgs resolution at `run.ts:469-485` (lines 471-485 in the current 4.6 baseline) and BEFORE the default-cap injection at `run.ts:510-522`. Rationale:

1. Argv parsing must happen FIRST so that `parseLoopArgs` can surface argv parse errors (per FR53 exit-code 2). When argv parsing fails, the loop exits with a `ConfigError` BEFORE the plan-first gate fires — this is correct behaviour (a malformed `--plan-first foo` invocation should fail to parse, not silently emit an empty plan).
2. The pre-flight gate is BEFORE state/sprint-status/DAG loaders are constructed at `run.ts:524-585`. Plan-mode performs its OWN state/sprint-status/DAG loads (one-shot, not the per-iteration closures); the iteration body's loaders are unused in plan-mode.
3. The pre-flight gate is BEFORE the `loopMetrics` initialisation at `run.ts:638-646` and BEFORE the `loopContext` baseline capture at `run.ts:617-632`. Plan-mode does not consume `loopMetrics` (no per-iteration time/token accumulation) or `loopContext` (no transition detection).

This placement keeps the runner's iteration body unchanged. The plan-mode branch is a SHORT-CIRCUIT — it returns early, before ANY iteration code path is reached.

**`StopReason` discriminated union — NO new variant**: this is intentional. Story 4.7 does NOT add a `plan-first-completed` variant because the loop never enters the iteration body and the `LoopResult.stopReason` shape is irrelevant in plan-mode. Plan-mode bypasses the standard `LoopResult` return path entirely — the `import.meta.main` block at `run.ts:967-989` is extended to detect plan-mode via a new optional return shape from `runLoop` (see Task 5 below). v0.1 conservative chooses to extend `runLoop`'s return type with a discriminated union `LoopResult | PlanResult` rather than threading an extra plan-mode parameter through the existing `LoopResult` shape.

**`LoopResult | PlanResult` discriminated return**: the new `PlanResult` interface (in `src/commands/loop/run.ts`) carries:

```typescript
export interface PlanResult {
  readonly mode: "plan";
  readonly plan: Plan;
  readonly formattedPlan: string;
  readonly exitCode: 0;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
}
```

The `LoopResult` interface gains a `mode: "loop"` discriminator field (default-initialised in the existing iteration-body return path) so the union is properly discriminated. The `import.meta.main` block branches on `result.mode`: when `mode === "plan"`, emit the AR9 `"report"` JSON line carrying `result.formattedPlan` and exit 0; when `mode === "loop"`, follow the existing flow (formatExitReason → emit AR9 → exit). v0.1 conservative chooses this discriminated-union approach over a sentinel-based `LoopResult.planMode?: Plan` field because the discriminator is type-safe and the two modes are structurally distinct (plan-mode has no `iterations[]`, no `stopReason`, no `exitCode: 1`).

**EMPTY_DAG / EMPTY_STATE sentinel inheritance** (per Story 4.6 §Forward Action Items N-2): Story 4.7 INHERITS unchanged. The plan-mode branch performs its OWN one-shot DAG load (no fallback to EMPTY_DAG) — when `buildDag({ skillNames: [] })` fails, plan-mode emits a graceful `"report"` line with a single-line message `Plan unavailable — DAG build failed: <error>. Run /bmad-loop --doctor to diagnose.` and exits 0. This is the AR22-conformant fallback (the user gets actionable detail without a stack trace). Tracked as OQ-4.

**Reproducibility requirement (AC-3)**: epics.md line 1000 mandates "the plan output is reproducible across invocations on the same state". Story 4.7 v0.1 achieves this by:

1. `computePlan(state, dag, sprintStatus, args)` is a PURE FUNCTION over its four inputs. No `Bun.nanoseconds()` calls, no `new Date()` calls, no random IDs, no hashes-of-objects. The same `(state, dag, sprintStatus, args)` quadruple produces the same `Plan` value.
2. `formatPlan(plan)` is a PURE FUNCTION over `plan`. The output text is byte-identical for the same input.
3. The DAG iteration order is deterministic per `Map` insertion-order from Story 1.10 (the seed array is fixed; the override append order is fixed; the Tier 3 frontmatter parse order is fixed by `skillNames` input order). The plan-walk's tie-breaking heuristic (optional === false first, then insertion-order) is deterministic.
4. The state read happens ONCE at the start of plan-mode; subsequent reads of the same `state.yaml` produce the same `State` value (per Story 1.6's deterministic YAML parse).
5. The `Plan` itself does NOT contain timestamps OR run IDs OR durations. The `PlanResult` wrapper does carry `startedAt`/`completedAt`/`durationMs` for observability — but these fields are NOT included in the `formattedPlan` text body. Reproducibility is asserted on `formattedPlan`, not on `PlanResult` as a whole.

The reproducibility test fixture (Test PF_47_5) calls `runLoop` TWICE with identical inputs and asserts `result1.formattedPlan === result2.formattedPlan` byte-identical.

**Token estimation and the Story 6.3 `models:` config dependency**: AC-2 (epics.md line 999) requires "total estimated tokens (using `models:` config + per-step budgets)". Story 6.3 (`models:` per-step config) is NOT yet implemented (sprint-status row 105: backlog). Story 4.7 v0.1 ships a STUB `lookupModelTokens(stepName): { tokensIn: number; tokensOut: number } | null` helper at `plan.ts` that returns `null` for ALL inputs in v0.1; the formatted plan renders "<unknown — Story 6.3 `models:` config required>" for the totals. This is the v0.1 graceful-fallback path documented as OQ-2. Story 6.3 will replace the stub with a config-driven lookup; Story 4.7's `formatPlan` already accommodates the eventual non-null return path. The stub is a DOCUMENTED forward-tracker — not a TODO — because the AC says "using `models:` config + per-step budgets" and v0.1 explicitly notes the dependency.

**Checkpoint surfacing in absence of Story 4.8 wiring**: AC-2 says "checkpoints (if `--checkpoint-each` is supplied)". Story 4.8 owns the `--checkpoint-each <step-type>` runtime wiring (sprint-status row 90: backlog). Story 4.7 v0.1 SURFACES the planned checkpoint locations in the plan output IF the user supplies `--checkpoint-each` — the plan-walk already enumerates `PlannedStep` records, so identifying which steps match the `--checkpoint-each <type>` filter is a pure-function lookup over `step.phase` against `args.checkpointEach`. This works WITHOUT Story 4.8's runtime wiring because plan-mode does NOT actually create checkpoint snapshots — it only DESCRIBES where Story 4.8's eventual wiring would create them. When `args.checkpointEach === undefined`, the checkpoints array is empty (graceful fallback). Tracked as OQ-3.

**Argv parse interaction**: `parseLoopArgs` already accepts `--plan-first` per Story 4.1 (declared at args.ts:103, tokenized as a boolean flag). No args.ts changes are needed in Story 4.7. Story 4.7 ALSO does NOT touch the schema's other fields — the `--plan-first` flag is independent of all other flags (modulo the default-cap clause).

**Story 4.7 is INTENTIONALLY NARROW**: stories 4.8 (`--checkpoint-each <type>`), 4.9 (`SIGINT`), 4.10 (`Loop exit reason + resume hint format`) will continue to extend the bounded-loop runner. Story 4.7 does NOT touch `stop-conditions.ts` (no new pure-function predicate; the plan-mode logic is intrinsically different from a stop-condition predicate — it WALKS the DAG rather than evaluates a single boundary), `verify-and-advance.ts`, the per-iteration body, the failure-path semantics, or any state-mutating path.

**Concretely, Story 4.7 produces:**

1. **`src/commands/loop/plan.ts`** (NEW, ~+250-350 lines): exports `Plan`, `PlannedStep`, `PlanCheckpoint`, `PlanFirstStopCondition` interfaces + `computePlan(state, dag, sprintStatus, args): Plan` pure function + `formatPlan(plan): string` pure function + `lookupModelTokens(stepName): { tokensIn, tokensOut } | null` v0.1 stub + `MAX_PLAN_WALK = 200` constant. ZERO I/O imports; pure function module per AR41 top-tier constraints (analogous to `stop-conditions.ts`).

2. **`src/commands/loop/plan.test.ts`** (NEW, ~+300-450 lines): pure-function unit tests for `computePlan` (PC1-PC10 covering: zero-state walk; mid-DAG walk; stop-condition firing during walk; safety-cap fire; null-token aggregation; checkpoint enumeration; reproducibility — same inputs → same Plan; deterministic DAG iteration order); pure-function tests for `formatPlan` (PF1-PF6 covering: single-step plan; multi-step plan; null-token rendering; checkpoint section rendering; firstStopCondition rendering; reproducibility — same Plan → same formatted text); tests for `lookupModelTokens` v0.1 stub (always returns null).

3. **`src/commands/loop/run.ts`** (MODIFIED, ~+90-130 lines): extends import block with `computePlan` + `formatPlan` from `./plan.ts` (TWO new imports per AR41 boundary — both top-tier sibling imports allowed); EXTENDS default-cap inverted-check at run.ts:510-522 with `&& args.planFirst !== true` clause (~+1 line); ADDS the pre-flight branch at ~run.ts:486 (after LoopArgs resolution, BEFORE default-cap stanza) — ~+50 lines of one-shot state/sprint-status/DAG load + `computePlan` + `formatPlan` + `PlanResult` return; ADDS `PlanResult` exported interface at ~run.ts:182 next to `LoopResult`; EXTENDS `LoopResult` with `mode: "loop"` discriminator (default-initialised in the existing return path); EXTENDS `runLoop`'s return type to `Promise<LoopResult | PlanResult>`; EXTENDS the `import.meta.main` block at run.ts:967-989 to branch on `result.mode` — when `"plan"` emit `{ action: "report", message: result.formattedPlan, exitCode: 0 }` and exit 0; UPDATES the JSDoc forward-tracker at run.ts:494-509 to remove the `4.7:` line (now wired) — leaving only the structural enumeration of how the default-cap clauses grew across stories; UPDATES the EXIT-CODE MAPPING JSDoc at run.ts:29-40 to note that plan-mode ALWAYS maps to exit code 0; UPDATES the JSDoc above `runLoop` (run.ts:448-468) to document the plan-mode short-circuit.

4. **`src/commands/loop/run.test.ts`** (MODIFIED, ~+10-14 new tests / ~+250-350 lines): integration tests PF_47_1 (plan-first short-circuits BEFORE iteration body — assert ZERO `runNextOverride` calls); PF_47_2 (plan-first emits AR9 `"report"` action — assert exit code 0 + `result.mode === "plan"` + `result.plan.totalEstimatedSteps > 0`); PF_47_3 (plan-mode reads state once via `stateOverride` — call count assertion); PF_47_4 (plan-mode reads sprint-status once via `sprintStatusOverride`); PF_47_5 (REPRODUCIBILITY — call `runLoop` twice with identical inputs, assert `result1.formattedPlan === result2.formattedPlan` byte-identical); PF_47_6 (DAG-build failure → graceful fallback message, exit 0); PF_47_7 (plan-first + `--checkpoint-each story` surfaces checkpoint locations); PF_47_8 (plan-first + `--max-iters 5` does NOT enter iteration body — the explicit cap is FORWARDED into the plan as an annotation but not enforced as a runtime bound); PF_47_9 (default-cap clause: `--plan-first` alone does NOT inject the default 50-iter cap — verify by inspecting `result.plan` shape, NOT iteration count); PF_47_10 (plan-first + verifier-failure state — graceful: plan-mode does NOT read `state.lastFailureReason`; the plan walks regardless); SWEEP_47 (AC-1 + AC-2 + AC-3 sweep — 3 sub-tests).

5. **`commands/bmad-loop.md`** (MODIFIED, ~+50-70 lines): §Stop Conditions table flips the `--plan-first` row from `parsed only` → `RUNTIME-WIRED in 4.7`; new sub-section `### --plan-first (Story 4.7)` covering behaviour summary, usage example, plan output shape, exit code mapping, AR9 stdout discipline note, reproducibility note, Story 4.8/6.3 forward-dependency notes; updated intro paragraph (Story version map adds 4.7); §Behavior bullet 2 updated (plan-mode short-circuits BEFORE the StopReason logic — the StopReason variant list is unchanged); FR53 exit-code mapping note retains `0` for plan-mode.

6. **`_bmad-output/implementation-artifacts/sprint-status.yaml`** (MODIFIED): flips `4-7-plan-first-dry-run-preview: backlog → ready-for-dev`. Bumps `last_updated:` at BOTH the comment block top AND the live YAML field.

**FR/NFR/AR mapping:**

- **FR8** (single-step advance): UNCHANGED. **FR9** (dry-run): RELATED — `--plan-first` is conceptually the loop-wrapper's analogue of `/bmad-next --dry-run`, but the implementations are distinct (FR9 owns `/bmad-next --dry-run`; FR21 owns `/bmad-loop --plan-first`). **FR19** (8 stop-conditions): UNCHANGED — Story 4.6 completed FR19 + FR20. **FR21** (`--plan-first` preview): WIRED HERE for the FIRST and ONLY time. **FR23** (cap wall-clock/token/iter): UNCHANGED. **FR53** (exit codes): EXTENDED in detail — plan-mode ALWAYS maps to exit code `0`; no new exit codes introduced. **FR54** (stdout/stderr discipline): UPHELD — single AR9 `"report"` JSON line on stdout per command invocation.
- **NFR-P1** (<500ms p95): PRESERVED — plan-mode performs THREE one-shot reads (state, sprint-status, DAG build ~5-10ms) + a pure-function plan walk (sub-millisecond for 200-hop cap). End-to-end ~10-30ms — well within budget.
- **AR8** (lock-free top-tier): UPHELD — plan-mode uses `loadStateUnlocked` (read-only); ZERO new lock acquisitions. **AR9** (single AR9 line): UPHELD — plan-mode emits exactly ONE `"report"` JSON line per command invocation. **AR10** (token-flow): RELATED — plan-mode estimates tokens from `models:` config (Story 6.3 forward dependency); v0.1 stub returns null. **AR21+22** (errors): UNCHANGED — registry stays at 16. The plan-mode DAG-build-fail path emits an AR22-conformant single-line hint via the `"report"` action's `message` field (no new error class). **AR33** (no console.*): UPHELD. **AR34** (slash-command markdown): UNCHANGED — markdown updates are doc-only. **AR41** (boundary graph): UPHELD — TWO new top-tier sibling imports (`computePlan` + `formatPlan`) from the new `./plan.ts` module; ZERO upward imports; ZERO mid-tier imports added. **AR42** (test discipline): EXTENDED — new colocated test file `plan.test.ts`; tmpdir-per-test discipline preserved (the new tests are pure-function over fixtures, no tmpdir mutation needed).

Estimated effort: **M** (medium — ONE new pure-function source file + colocated test file (~+550-800 net lines); ONE modified source file (~+90-130 net lines); ONE modified test file (~+250-350 net lines); ONE modified markdown file (~+50-70 net lines); ZERO new error classes; ZERO new I/O imports outside the new module).

It does **NOT**:

- **Wire the remaining stop-condition / control flags** (`--checkpoint-each`, `--interactive`, `--auto-fix`, SIGINT, exit-reason format) — deferred to Stories 4.8-4.10 + 5.3 + 5.5.
- **Address Story 4.1 SF-1 (`extractFailureCode EXIT_0`)** — forward-tracker to 4.10. **SF-2 was addressed by 4.6** (dropped `"unknown"` from `IterationRecord.action` union).
- **Modify `verify-and-advance.ts` or `next/args.ts`** — Story 4.7 does NOT enter the iteration body and does NOT consume per-iteration runHistory writes.
- **Wire the `models:` per-step config** — that is Story 6.3's responsibility. Story 4.7 ships a v0.1 stub with documented forward-dependency.
- **Wire the `--checkpoint-each` runtime semantics** — that is Story 4.8's responsibility. Story 4.7's plan-mode SURFACES the planned checkpoint locations (pure-function over `args.checkpointEach + dag.nodes[].phase`) without depending on Story 4.8's runtime wiring.
- **Add a new error class** — registry stays at 16. The DAG-build-fail fallback path emits a "report" message instead of throwing.
- **Add a new exit code** — plan-mode maps to existing exit code `0` (clean exit).
- **Change `LoopResult.exitCode`** — the `LoopResult` interface gains a `mode: "loop"` discriminator field; the existing `exitCode: 0 | 1 | 2` remains.
- **Compute the plan recursively** — the plan-walk is iterative with a 200-hop safety cap. Recursive walking would risk stack overflow on pathological DAG topologies.
- **Touch the `StopReason` discriminated union** — plan-mode bypasses StopReason entirely; the union is unchanged.

## Acceptance Criteria

The acceptance criteria below are reproduced **verbatim** from `_bmad-output/planning-artifacts/epics.md` §Story 4.7 (lines 988-1000, BDD Given/When/Then format). Lines and AC labelling preserved.

**Acceptance Criteria:**

**Given** `--plan-first` is supplied
**When** the loop is invoked
**Then** Stepper computes the planned sequence of steps until the first declared stop condition would fire (best-effort, since failures may divert), emits a JSON-line action `"report"` with the human-readable plan, and exits 0 without dispatching anything
**And** the plan output includes: total estimated steps, total estimated tokens (using `models:` config + per-step budgets), checkpoints (if `--checkpoint-each` is supplied)
**And** the plan output is reproducible across invocations on the same state

> **Story 4.7 stop-condition scope note:** AC-1 covers the core `--plan-first` semantics (compute plan, emit AR9 "report", exit 0 without dispatching). AC-2 covers the plan output content (estimated steps, estimated tokens via `models:` config which is Story 6.3 v0.1 stub, checkpoints which depend on `--checkpoint-each` Story 4.8 forward dependency). AC-3 covers reproducibility (pure-function `computePlan` + `formatPlan` over deterministic state/DAG/sprint-status inputs). Story 4.7 is the SEVENTH story in Epic 4; stories 4.8 (`--checkpoint-each`), 4.9 (SIGINT), 4.10 (exit reason format) will continue to extend the bounded-loop runner. Plan-mode is INTENTIONALLY a SHORT-CIRCUIT before the iteration body — ZERO tokens spent, ZERO state mutations.

## Tasks / Subtasks

- [x] **Task 0 — Verify pre-conditions (AC: all)**
  - [x] 0.1 Confirm Story 4.6 is `done` per `_bmad-output/implementation-artifacts/sprint-status.yaml:88`. Confirm code-review verdict `approve` per `_bmad-output/implementation-artifacts/4-6-stop-condition-error-with-stop-on-error-continue-on-error.md` Senior Developer Review section (verdict line 801, counts in §Quality gates: 0 must-fix / 0 should-fix / 2 nits inherited / 9 info forward-trackers).
  - [x] 0.2 Read `_bmad-output/implementation-artifacts/4-6-stop-condition-error-with-stop-on-error-continue-on-error.md` end-to-end. Confirm:
    - `src/commands/loop/run.ts:510-522` defines the default-cap inverted-check (now 9-clause: `args.maxIters === undefined && args.untilEpicEnd !== true && args.untilStory === undefined && args.nextStory !== true && args.phaseEnd !== true && args.timeBudgetMs === undefined && args.tokenBudget === undefined && args.stopOnError !== true && args.continueOnError !== true`).
    - JSDoc forward-tracker at `run.ts:494-509` enumerates Story 4.7 future-flag clause verbatim (`4.7: && args.planFirst !== true`).
    - `src/commands/loop/run.ts:125-167` defines `StopReason` discriminated union with 9 variants (`max-iters-reached`, `halt-on-error`, `epic-end-reached`, `until-story-reached`, `next-story-reached`, `phase-end-reached`, `time-budget-reached`, `token-budget-reached`, `error-stop`).
    - `src/commands/loop/run.ts:796-857` defines the halt-on-error short-circuit (gated on `args.continueOnError`).
    - `src/commands/loop/args.ts:103` declares `planFirst: z.boolean().optional()`.
    - `src/commands/loop/args.ts:126` includes `"planFirst"` in the `BOOLEAN_KEYS` set (per Story 4.1 tokenizer wiring).
    - Errors registry at `src/errors.ts` holds at 16 codes (verified by 4.6 SDR §Quality gates).
    - `src/dispatch/emit.ts` exports `emitDispatchAction` for AR9 line emission (already used by `run.ts:971`).
    - `src/schemas/dispatch-protocol.ts:60-64` defines the `"report"` action variant (`{ action: "report", message: string, exitCode: number }`).
  - [x] 0.3 Read epics.md §Story 4.7 lines 988-1000 verbatim. Confirm the AC text in §Acceptance Criteria above is character-identical to lines 994-1000 — particularly the `"report"` action literal, the `models:` config reference, the `--checkpoint-each` forward dependency, and the "reproducible across invocations on the same state" wording.
  - [x] 0.4 Read `src/commands/loop/run.test.ts` to confirm the existing Tests A-I (Story 4.1), Test E + X_44 + Y_44 + Z_44 + AA_44 (Story 4.4), TB_45_*/KB_45_*/SWEEP_45 (Story 4.5), SE_46_*/CE_46_*/SWEEP_46 (Story 4.6) all pass per the post-Story-4.6 baseline (~177 pass / 0 fail / ~543 expects across 3 files).
  - [x] 0.5 Read `_bmad-output/planning-artifacts/prd.md` §FR21 (line 697) verbatim: "Users can preview the loop's planned step sequence before committing tokens (`--plan-first`)." Confirm. Read PRD §FR54 (line 745) for stdout/stderr discipline. Read PRD line 587: "`--plan-first` previews the loop's planned step sequence before committing tokens — by convention, used before any nightly unattended run."
  - [x] 0.6 Read `_bmad-output/implementation-artifacts/sprint-status.yaml` and confirm `4-7-plan-first-dry-run-preview: backlog` is the current value at line 89 (Story 4.7 will flip to `ready-for-dev`).
  - [x] 0.7 Read Story 4.6's §Forward Action Items (line 893) to confirm the EXPLICIT extension mandate for Story 4.7: "EXTEND the default-cap inverted-check stanza at `run.ts:510-522` (after Story 4.6's extension) with `&& args.planFirst !== true` clause OR decide that `--plan-first` should bypass the loop entirely (since dry-run never enters iteration body)." Story 4.7 chooses BOTH paths: bypass the iteration body (the substantive plan-mode short-circuit) AND defensive add the clause for symmetry. The OQ-4 unbounded-iteration warning predicate at `run.ts:544-553` does NOT need extension because plan-mode short-circuits BEFORE that warning fires.
  - [x] 0.8 Read `_bmad-output/planning-artifacts/architecture.md` §FR21 reference (line 1351) to confirm the implementation location: "FR21 — `--plan-first` — `src/commands/loop/run.ts` — `src/dag/sort.ts`". Note: `src/dag/sort.ts` is REFERENCED but not yet IMPLEMENTED (it's a forward-tracker; Story 4.7 implements the plan-walk INLINE in `src/commands/loop/plan.ts` using the existing `dag.edgesOut` adjacency structure rather than introducing a new `sort.ts` module). Tracked as OQ-8.
  - [x] 0.9 Read `src/commands/loop/args.ts:103` to confirm `planFirst: z.boolean().optional()` is declared. Read line 126 to confirm `"planFirst"` is in `BOOLEAN_KEYS`. Confirm tokenizer-level test exists for `--plan-first` argv parsing (Test in `src/commands/loop/args.test.ts` per Story 4.1 baseline).
  - [x] 0.10 Confirm baseline `bun test src/commands/loop` exits 0 with the post-Story-4.6 baseline (~177 pass / 0 fail / ~543 expects across 3 files per Story 4.6 §Quality gates).
  - [x] 0.11 Confirm Bun host version satisfies AR2 (Bun >= 1.3). Run `bun --version`; record in Completion Notes.
  - [x] 0.12 Confirm `src/errors.ts` registry holds at 16 codes (`bun test src/errors.test.ts` → 10 pass / 0 fail / 197 expects).
  - [x] 0.13 Confirm `src/dag/index.ts` exports `build`, `DagAdjacency`, `DagNode`, `Phase` (per the Story 1.10 surface — Story 4.7's plan-walk consumes all four).
  - [x] 0.14 Confirm `src/state/load.ts` exports `loadStateUnlocked` (read-only state loader). Story 4.7 reads state ONCE in plan-mode via this loader — same pattern as the iteration body.

- [x] **Task 1 — Address Story 4.6 forward action items: extend default-cap inverted-check (AC: implicit prerequisite)**
  - [x] 1.1 At `src/commands/loop/run.ts:510-522`, EXTEND the default-cap inverted-check predicate with the new clause:
    ```typescript
    if (
      args.maxIters === undefined &&
      args.untilEpicEnd !== true &&
      args.untilStory === undefined &&
      args.nextStory !== true &&
      args.phaseEnd !== true &&
      args.timeBudgetMs === undefined &&
      args.tokenBudget === undefined &&
      args.stopOnError !== true &&
      args.continueOnError !== true &&
      args.planFirst !== true
    ) {
      args = { ...args, maxIters: 50 };
    }
    ```
    Reasoning: per Story 4.6 SDR forward-tracker #1 + Story 4.6 §Forward Action Items, the default-cap MUST short-circuit when `--plan-first` is supplied. While Story 4.7's pre-flight branch (Task 4) ALREADY short-circuits BEFORE this stanza is reached, the defensive clause future-proofs the code: (a) if a future story refactors the pre-flight branch into the iteration body, the cap injection still does the right thing; (b) the clause keeps the default-cap predicate symmetrical with the 10 declared `LoopArgsSchema` fields; (c) when ALL fields are undefined except `planFirst === true`, the predicate correctly evaluates to `false` and no cap is injected.
  - [x] 1.2 Update the JSDoc forward-tracker comment at `run.ts:494-509` to remove the `4.7: && args.planFirst !== true` line (now wired by this Task) and update the structural enumeration to indicate that the default-cap predicate is now COMPLETE for all wired stop-condition flags. Forward-tracker text becomes:
    > "Stories 4.5 wired the time-budget + token-budget clauses; Story 4.6 wired the stop-on-error + continue-on-error clauses; Story 4.7 wired the plan-first clause — when `--plan-first` is supplied alone (without `--max-iters`), the pre-flight branch (run.ts:486+) short-circuits BEFORE this stanza is reached, but the defensive clause is preserved for refactor-safety."
  - [x] 1.3 Decide on the `hasExplicitStopCondition` refactor (per Story 4.6 SDR forward-tracker #9): the predicate is now 10 clauses long. v0.1 conservative DEFERS the refactor to a future story (Story 6.x or a dedicated cleanup story) because Story 4.7's primary focus is the plan-mode short-circuit. The 10-clause predicate remains readable inline. Document the decision in §Open Questions (OQ-1).
  - [x] 1.4 Document the inheritance of N-1 (defensive null check at stop-conditions.ts:269) and N-2 (`EMPTY_DAG` + `EMPTY_STATE` sentinel mid-file placement) from Story 4.6 §Forward Action Items. Story 4.7 INHERITS both unchanged — the plan-mode logic does NOT consume `stop-conditions.ts` (no new pure-function predicate) and KEEPS the sentinels (the iteration body still uses them). Document in §Forward Action Items.

- [x] **Task 2 — Create the new `src/commands/loop/plan.ts` module (AC-1, AC-2, AC-3)**
  - [x] 2.1 Create `src/commands/loop/plan.ts` as a NEW pure-function module. Top-of-file JSDoc:
    ```typescript
    /**
     * src/commands/loop/plan.ts — Pure-function plan computation + formatting
     * for `/bmad-loop --plan-first` (FR21, AR9, AR33, AR41, AR42).
     *
     * Top-tier module per AR41 (architecture lines 1294-1302). Pure functions
     * only — ZERO I/O imports, ZERO `console.*` calls, ZERO throws. Analogous
     * to `./stop-conditions.ts` — the runner (./run.ts) handles I/O loading
     * and passes the resolved values here.
     *
     * Story 4.7 §AC-1 contract: `--plan-first` short-circuits the iteration
     * body and emits a single AR9 `"report"` JSON line carrying the human-
     * readable plan in its `message` field. The plan walks the DAG until the
     * first declared stop condition would fire (best-effort, since failures
     * may divert).
     *
     * Story 4.7 §AC-2 contract: the plan includes total estimated steps,
     * total estimated tokens (using `models:` config — Story 6.3 forward
     * dependency, v0.1 stub returns null), checkpoints (if `--checkpoint-each`
     * is supplied — Story 4.8 forward dependency, v0.1 surfaces planned
     * locations without runtime semantics).
     *
     * Story 4.7 §AC-3 contract: the plan output is reproducible across
     * invocations on the same state. `computePlan` + `formatPlan` are PURE
     * FUNCTIONS over their inputs — no `Bun.nanoseconds()`, no `new Date()`,
     * no random IDs, no hashes. The DAG iteration order is deterministic per
     * `Map` insertion-order (Story 1.10 invariant). The plan-walk's tie-
     * breaking heuristic (optional === false first, then insertion-order) is
     * deterministic. The same `(state, dag, sprintStatus, args)` quadruple
     * produces the same `Plan` value, and the same `Plan` value produces the
     * same `formattedPlan` string.
     *
     * Architecture cross-references:
     *   - architecture.md §AR41 lines 1294-1302 (boundary graph; top-tier
     *     may import foundational types).
     *   - architecture.md §line 1351 (FR21 — `--plan-first` — implementation
     *     in `src/commands/loop/run.ts` + plan-walk helper module).
     *   - architecture.md §line 1660 (AR9 protocol concretization — the
     *     `"report"` action's `message` field carries human-readable text).
     *   - architecture.md §line 587 (`--plan-first` previews the loop's
     *     planned step sequence before committing tokens).
     *   - epics.md §Story 4.7 lines 988-1000 (AC verbatim source).
     *   - prd.md FR21 line 697 (preview the loop's planned step sequence).
     */
    ```
  - [x] 2.2 Add type imports — top-tier sibling-only per AR41:
    ```typescript
    import type { DagAdjacency, DagNode, Phase } from "../../dag/index.ts";
    import type { State } from "../../schemas/state.ts";
    import type { LoopArgs } from "./args.ts";
    import { evaluateStopConditions, type SprintStatus } from "./stop-conditions.ts";
    import type { StopReason } from "./run.ts";
    ```
    Note: `evaluateStopConditions` is a value import (not a type import) because Task 5 calls it during the plan-walk to detect when the first stop condition would fire. Per AR41, top-tier sibling imports between `loop/plan.ts` and `loop/stop-conditions.ts` are explicitly allowed.
  - [x] 2.3 Add the `MAX_PLAN_WALK = 200` constant + JSDoc explaining the safety cap rationale (Story 4.7 OQ-5).
  - [x] 2.4 Define the `PlannedStep` exported interface with all 7 readonly fields (see §Context Summary). JSDoc each field. Note: `epic` is `string | null` because `state.lastSuccessfulStep.epic` is `number` per Story 4.2 normalization (the plan stringifies it). `story` is `string | null` because `state.lastSuccessfulStep.story` is `string`.
  - [x] 2.5 Define the `PlanCheckpoint` exported interface with `afterStep`, `stepType`, `description` fields. JSDoc the contract: `stepType` matches `args.checkpointEach` (Story 4.8 forward dependency); `description` is a human-readable single-line description.
  - [x] 2.6 Define the `PlanFirstStopCondition` exported interface — `{ code: StopReason["code"], message: string }`. JSDoc the contract: this is a SUBSET of `StopReason` carrying only the discriminator and message (the structured fields are dropped because plan-mode does not consume them).
  - [x] 2.7 Define the `Plan` exported interface with all 8 fields (see §Context Summary). JSDoc each field. Mark all as readonly.
  - [x] 2.8 Define the `lookupModelTokens(stepName: string): { tokensIn: number; tokensOut: number } | null` v0.1 stub:
    ```typescript
    /**
     * v0.1 STUB — returns null for ALL inputs. Story 6.3 (`models:` per-step
     * config) will replace this with a config-driven lookup. The plan-mode
     * formatter renders "<unknown — Story 6.3 `models:` config required>"
     * when this returns null. Tracked as OQ-2.
     */
    export function lookupModelTokens(
      _stepName: string,
    ): { tokensIn: number; tokensOut: number } | null {
      return null;
    }
    ```
    The underscore prefix on `_stepName` signals the unused parameter (per the project's biome lint rules).

- [x] **Task 3 — Implement `computePlan` pure function (AC-1, AC-2, AC-3)**
  - [x] 3.1 Define the function signature:
    ```typescript
    export function computePlan(
      state: State,
      dag: DagAdjacency,
      sprintStatus: SprintStatus | null,
      args: LoopArgs,
    ): Plan
    ```
    All four inputs are READ-ONLY. The function returns an immutable `Plan` value.
  - [x] 3.2 Determine the plan-walk start node:
    - When `state.lastSuccessfulStep === null` (zero-state path): pick the FIRST seed node with no predecessors (i.e., `dag.edgesIn.get(node.name) === undefined || dag.edgesIn.get(node.name).size === 0`). This is analogous to `runNext`'s zero-state path. Use insertion-order to break ties (the Story 1.10 seed array is the canonical ordering).
    - When `state.lastSuccessfulStep !== null`: find a successor in `dag.edgesOut.get(state.lastSuccessfulStep.step)` that is NOT yet completed. The "completed" check uses `state.runHistory[]` traversal: a step is completed if any `runHistory[i]?.step === <stepName> && runHistory[i]?.verifierStatus === "pass"` (defensive typeof guards because `runHistory[]` is `z.unknown()` per Story 1.5).
    - When neither path identifies a start node (e.g., all successors are completed; the loop has hit `epic-end`-like state): return an EMPTY `Plan` with `totalEstimatedSteps: 0` and `firstStopCondition: { code: "epic-end-reached", message: "all steps completed at plan-time" }`.
  - [x] 3.3 Implement the iterative plan-walk:
    ```typescript
    const visited: PlannedStep[] = [];
    const checkpoints: PlanCheckpoint[] = [];
    let currentNode: DagNode | undefined = startNode;
    let firstStopCondition: PlanFirstStopCondition | null = null;
    let hops = 0;

    while (currentNode !== undefined && hops < MAX_PLAN_WALK) {
      hops++;
      const tokens = lookupModelTokens(currentNode.name);
      const planned: PlannedStep = {
        step: currentNode.name,
        epic: state.lastSuccessfulStep?.epic !== undefined
          ? String(state.lastSuccessfulStep.epic)
          : null,
        story: state.lastSuccessfulStep?.story ?? null,
        phase: currentNode.phase,
        persona: currentNode.persona,
        estimatedTokensIn: tokens?.tokensIn ?? null,
        estimatedTokensOut: tokens?.tokensOut ?? null,
      };
      visited.push(planned);

      // Story 4.8 forward dependency: surface checkpoint locations.
      if (args.checkpointEach !== undefined) {
        const checkpointMatch = matchCheckpointType(currentNode, args.checkpointEach);
        if (checkpointMatch !== null) {
          checkpoints.push(checkpointMatch);
        }
      }

      // Synthesize a State that pretends `currentNode` has just completed.
      const syntheticState: State = synthesizeStateAfterStep(state, currentNode);

      // Evaluate stop conditions against the synthetic state.
      const stopReason = evaluateStopConditions(
        syntheticState,
        dag,
        args,
        sprintStatus ?? undefined,
        // loopContext + loopMetrics are intentionally undefined — the
        // plan-walk does not consume the loop-entry baseline (no
        // transitions detected from a baseline) or token/time accumulators
        // (plan-mode is wall-clock-zero).
        undefined,
        undefined,
      );
      if (stopReason !== null) {
        firstStopCondition = {
          code: stopReason.code,
          message: extractStopReasonMessage(stopReason),
        };
        break;
      }

      // Walk to the next node.
      currentNode = pickNextSuccessor(currentNode, dag, syntheticState);
    }

    if (firstStopCondition === null && hops >= MAX_PLAN_WALK) {
      firstStopCondition = {
        code: "max-iters-reached",
        message: `(plan-walk safety cap reached at ${MAX_PLAN_WALK} hops)`,
      };
    }
    ```
    The helper functions `synthesizeStateAfterStep`, `pickNextSuccessor`, `extractStopReasonMessage`, `matchCheckpointType` are defined inline in `plan.ts` as pure-function helpers (private — not exported).
  - [x] 3.4 Implement `synthesizeStateAfterStep(state, node): State`. Returns a NEW State value (immutable; uses spread) where `lastSuccessfulStep` is updated to `{ step: node.name, epic: <derived from sprintStatus or state>, story: <derived>, ts: state.lastSuccessfulStep?.ts ?? "0" }`. The `epic`/`story` derivation: when the DAG node is associated with a specific story (via `dag.nodes.get(name).phase` + `state.lastAttempted.epic/story` lookup), use those values; otherwise inherit from `state.lastSuccessfulStep`. This is BEST-EFFORT per AC-1 wording — the synthetic state is used by `evaluateStopConditions` to detect transitions, not to produce reliable epic/story tracking.
  - [x] 3.5 Implement `pickNextSuccessor(currentNode, dag, syntheticState): DagNode | undefined`. Walks `dag.edgesOut.get(currentNode.name)` (a `ReadonlySet<string>`):
    - Filter out names that are already in `visited[]` (would form a cycle in plan-mode; the underlying DAG is acyclic per Story 1.10 Tarjan validation but plan-mode may revisit nodes if the synthetic state regresses — defensive).
    - Filter out names not in `dag.nodes` (defensive — should not happen given the build invariants).
    - Among the remaining candidates, prefer `optional === false` first; among ties, choose insertion-order (the iteration order of the `Set` returned by `edgesOut.get` is the order edges were added, which is the order `build()` appended them — deterministic per Story 1.10).
    - When the filtered set is EMPTY, return `undefined` (the walk terminates naturally — the plan has reached a leaf node or all successors are already-visited).
  - [x] 3.6 Implement `extractStopReasonMessage(stopReason: StopReason): string`. Mirrors the `formatExitReason` logic in `run.ts:927-963` — switch on `stopReason.code` and return the message field (or the formatted text for variants without a `message` field, e.g., `max-iters-reached` returns `max-iters (${maxIters}) reached`).
  - [x] 3.7 Implement `matchCheckpointType(node, checkpointEachType): PlanCheckpoint | null`. Pure-function lookup:
    - When `checkpointEachType === "phase"`: match `node.phase` boundaries — surface a checkpoint for the FIRST node of each phase (forward-dependency on Story 4.8's runtime semantics; v0.1 conservative interprets "after every step of this type" as "after every phase transition" for `--checkpoint-each phase`).
    - When `checkpointEachType === "story"`: surface a checkpoint after every step (Story 4.8 will own the precise semantics; v0.1 conservative interprets "every step of type story" as "every step that advances story state").
    - When `checkpointEachType === "epic"`: surface a checkpoint after every step that closes an epic.
    - v0.1 conservative: a single boilerplate description "<step-name> [<phase>] checkpoint marker (Story 4.8 wires runtime semantics)" is sufficient. Story 4.8 may refine.
  - [x] 3.8 Aggregate totals after the walk:
    - `totalEstimatedSteps = visited.length`.
    - `totalEstimatedTokensIn = visited.every(s => s.estimatedTokensIn !== null) ? visited.reduce((sum, s) => sum + s.estimatedTokensIn!, 0) : null` (only sum when ALL steps have non-null tokens; otherwise return null per the v0.1 stub-driven behavior).
    - `totalEstimatedTokensOut`: analogous.
    - `modelsConfigPresent = visited.length > 0 && visited[0].estimatedTokensIn !== null` (a heuristic to flag when the v0.1 stub returns non-null in a future Story 6.3 path).
    - `checkpointEachConfigured = args.checkpointEach !== undefined`.
  - [x] 3.9 Return the immutable `Plan`:
    ```typescript
    return {
      totalEstimatedSteps,
      steps: visited,
      totalEstimatedTokensIn,
      totalEstimatedTokensOut,
      modelsConfigPresent,
      checkpoints,
      checkpointEachConfigured,
      firstStopCondition,
    };
    ```

- [x] **Task 4 — Implement `formatPlan` pure function (AC-2, AC-3)**
  - [x] 4.1 Define the function signature:
    ```typescript
    export function formatPlan(plan: Plan): string
    ```
  - [x] 4.2 Build the formatted text body via string concatenation. The format (illustrative):
    ```
    Plan: <N> steps planned (first stop: <code> — <message>)

    Total estimated steps: <N>
    Total estimated tokens: <T> in + <T> out
    (or "Total estimated tokens: <unknown — Story 6.3 `models:` config required>")

    Steps:
      1. <step-name> [<phase>] (epic <E>, story <S>) — <persona> — ~<t> in / ~<t> out tokens
      2. <step-name> [<phase>] ...
      ...

    Checkpoints (--checkpoint-each <type>):
      After step <step-name>: <description>
      (or "(none — --checkpoint-each not supplied)" when checkpointEachConfigured === false)

    First stop condition: <code> — <message>
    ```
    The newlines are LITERAL `\n` in the returned string. The `formatPlan` function consumes ONLY the `Plan` input — it does NOT consume `args` or `state` directly (the relevant args/state derivatives are baked into the `Plan` shape per Task 3).
  - [x] 4.3 The plan summary header line: `Plan: ${plan.totalEstimatedSteps} steps planned (first stop: ${plan.firstStopCondition?.code ?? "none"} — ${plan.firstStopCondition?.message ?? "no stop condition will fire"})`.
  - [x] 4.4 The token-totals line: when `plan.totalEstimatedTokensIn === null || plan.totalEstimatedTokensOut === null`, render "Total estimated tokens: <unknown — Story 6.3 `models:` config required>". Otherwise render "Total estimated tokens: ${tokensIn} in + ${tokensOut} out".
  - [x] 4.5 The Steps section: enumerate `plan.steps[]` with 1-indexed numbering. Each step: `${i + 1}. ${step.step} [${step.phase}] (epic ${step.epic ?? "?"}, story ${step.story ?? "?"}) — ${formatPersona(step.persona)} — ${formatStepTokens(step)}`. The `formatPersona` helper handles `string | string[] | null` rendering. The `formatStepTokens` helper renders `~${tokensIn} in / ~${tokensOut} out tokens` or `<unknown tokens>` when null.
  - [x] 4.6 The Checkpoints section: when `plan.checkpoints.length === 0`, render the placeholder `(none — --checkpoint-each not supplied)` if `!plan.checkpointEachConfigured`, OR `(none — no matches in plan walk)` if `plan.checkpointEachConfigured && plan.checkpoints.length === 0`. When `plan.checkpoints.length > 0`, enumerate each checkpoint: `After step ${cp.afterStep}: ${cp.description}`.
  - [x] 4.7 The First stop condition section: `First stop condition: ${plan.firstStopCondition?.code ?? "none"} — ${plan.firstStopCondition?.message ?? "no stop condition will fire"}`. (Repeats from the header line for clarity at the END of the plan body.)
  - [x] 4.8 Verify reproducibility (AC-3): run the function TWICE with the same `Plan` value and assert byte-identical output. The function does NOT use `Date()`, `Math.random()`, `Bun.nanoseconds()`, or any non-deterministic source — confirm by code review of `formatPlan`'s body.

- [x] **Task 5 — Wire `--plan-first` pre-flight branch in `runLoop` (AC-1)**
  - [x] 5.1 At `src/commands/loop/run.ts:50-67`, EXTEND the import block with TWO new top-tier sibling imports:
    ```typescript
    import { computePlan, formatPlan, type Plan } from "./plan.ts";
    ```
    Per AR41, top-tier sibling imports are explicitly allowed (analogous to the existing `import { ... } from "./stop-conditions.ts"` pattern). ZERO new mid-tier imports; the new `./plan.ts` module is itself top-tier.
  - [x] 5.2 At `src/commands/loop/run.ts:175-182`, ADD the new `PlanResult` exported interface:
    ```typescript
    /**
     * Structured return value from `runLoop` when invoked in plan-mode
     * (`--plan-first`). The plan-mode short-circuit at run.ts:486+ returns
     * this shape INSTEAD OF the iteration-body `LoopResult`. The
     * `import.meta.main` block branches on `result.mode` to dispatch the
     * AR9 emit + exit code.
     */
    export interface PlanResult {
      readonly mode: "plan";
      readonly plan: Plan;
      readonly formattedPlan: string;
      readonly exitCode: 0;
      readonly startedAt: string;
      readonly completedAt: string;
      readonly durationMs: number;
    }
    ```
    Note: `mode: "plan"` is the discriminator. `plan` is the structured `Plan` value (for tests / tooling consumers). `formattedPlan` is the string carried in the AR9 `"report"` action's `message` field. `exitCode: 0` is fixed (plan-mode is always a clean exit).
  - [x] 5.3 At `src/commands/loop/run.ts:175-182` (the existing `LoopResult` interface), ADD the `mode: "loop"` discriminator:
    ```typescript
    export interface LoopResult {
      readonly mode: "loop";
      readonly stopReason: StopReason;
      readonly exitCode: 0 | 1 | 2;
      readonly iterations: readonly IterationRecord[];
      readonly durationMs: number;
      readonly startedAt: string;
      readonly completedAt: string;
    }
    ```
    Default-initialise `mode: "loop"` in the existing return path at `run.ts:887-894`. The discriminator becomes the FIRST field of both interfaces for canonical positioning.
  - [x] 5.4 At `src/commands/loop/run.ts:469`, EXTEND `runLoop`'s return type:
    ```typescript
    export async function runLoop(opts?: LoopOpts): Promise<LoopResult | PlanResult>
    ```
    The discriminated union allows callers to branch on `result.mode` (test code uses this; the `import.meta.main` block uses this).
  - [x] 5.5 At `src/commands/loop/run.ts:486` (after the LoopArgs resolution at lines 471-485, BEFORE the default-cap injection at lines 510-522), ADD the plan-mode pre-flight branch:
    ```typescript
    // Story 4.7 AC-1: --plan-first short-circuits the iteration body.
    // Compute the plan, format it, and emit a single AR9 "report" line at
    // the import.meta.main block — exit 0 without dispatching anything.
    if (args.planFirst === true) {
      const planStartedAt = new Date().toISOString();
      const planStartNs: number = Bun.nanoseconds();
      // One-shot state read (lock-free per AR8 — same loader the iteration
      // body uses, but called ONCE before any iteration would have run).
      let planState: State | null = null;
      try {
        planState = await loadStateUnlocked();
      } catch {
        planState = null;
      }
      // One-shot sprint-status read.
      let planSprintStatus: SprintStatus | null = null;
      try {
        planSprintStatus = await loadSprintStatusForLoop();
      } catch {
        planSprintStatus = null;
      }
      // One-shot DAG build (always — plan-mode requires the DAG to walk).
      let planDag: DagAdjacency | null = null;
      try {
        planDag = await buildDag({ skillNames: [] });
      } catch {
        planDag = null;
      }
      // Construct the Plan + formattedPlan.
      let plan: Plan;
      let formattedPlan: string;
      if (planState === null || planDag === null) {
        // Graceful fallback (OQ-4): emit a single-line message with an
        // AR22-conformant hint. Plan-mode does NOT throw on read failure.
        plan = {
          totalEstimatedSteps: 0,
          steps: [],
          totalEstimatedTokensIn: null,
          totalEstimatedTokensOut: null,
          modelsConfigPresent: false,
          checkpoints: [],
          checkpointEachConfigured: args.checkpointEach !== undefined,
          firstStopCondition: null,
        };
        formattedPlan = planState === null
          ? "Plan unavailable — state.yaml could not be read. Run /bmad-loop --doctor to diagnose."
          : "Plan unavailable — DAG build failed. Run /bmad-loop --doctor to diagnose.";
      } else {
        plan = computePlan(planState, planDag, planSprintStatus, args);
        formattedPlan = formatPlan(plan);
      }
      const planCompletedAt = new Date().toISOString();
      const planDurationMs = (Bun.nanoseconds() - planStartNs) / 1_000_000;
      return {
        mode: "plan",
        plan,
        formattedPlan,
        exitCode: 0,
        startedAt: planStartedAt,
        completedAt: planCompletedAt,
        durationMs: planDurationMs,
      };
    }
    ```
    Note: the timestamps + duration are recorded in `PlanResult` for observability but NOT included in `formattedPlan` per AC-3 (reproducibility).
  - [x] 5.6 At `src/commands/loop/run.ts:887-894` (the existing return path), prepend `mode: "loop",` to the returned `LoopResult` literal so the discriminator is set.
  - [x] 5.7 At `src/commands/loop/run.ts:967-989` (the `import.meta.main` block), EXTEND with the plan-mode branch:
    ```typescript
    if (import.meta.main) {
      try {
        const result = await runLoop({ argv: process.argv.slice(2) });
        if (result.mode === "plan") {
          // Story 4.7: plan-mode emits a single AR9 "report" line carrying
          // the human-readable plan in its message field. Exit code 0.
          emitDispatchAction({
            action: "report",
            message: result.formattedPlan,
            exitCode: result.exitCode,
          });
          process.exit(result.exitCode);
        }
        const message = formatExitReason(result.stopReason);
        emitDispatchAction({
          action: "report",
          message,
          exitCode: result.exitCode,
        });
        process.exit(result.exitCode);
      } catch (err) {
        // ... existing catch block unchanged ...
      }
    }
    ```
    The existing `if (result.mode === "plan")` branch comes FIRST — it short-circuits before `formatExitReason` is called (which would fail on plan-mode because there is no `stopReason`).
  - [x] 5.8 Update the JSDoc above `runLoop` (run.ts:448-468) to add a §Story 4.7 paragraph documenting the plan-mode short-circuit:
    > "Story 4.7 (`--plan-first`) ADDS a pre-flight branch BEFORE the iteration body. When `args.planFirst === true`, the runner performs THREE one-shot read-only loads (state, sprint-status, DAG) and computes a `Plan` value via `computePlan`; the formatted plan is returned via the `PlanResult` discriminated union. The plan-mode branch is gated AFTER LoopArgs resolution and BEFORE the default-cap injection — argv parse errors still fire correctly. The iteration body never runs in plan-mode; ZERO tokens are spent on Task subagents."
  - [x] 5.9 Update the EXIT-CODE MAPPING JSDoc at run.ts:29-40 to add a plan-mode reference:
    > "Plan-mode (`--plan-first`) ALWAYS maps to exit code `0` (clean exit; the dry-run is the success path). The plan body is carried in the AR9 `"report"` action's `message` field; the exit code is fixed."
  - [x] 5.10 Verify NO new error class is needed: the DAG-build-fail path is handled by the graceful fallback above (single-line message, exit 0). The lock-free state read uses `loadStateUnlocked` which already handles errors via try/catch in the iteration-body pattern. ZERO new entries to `src/errors.ts` registry — confirmed registry stays at 16.

- [x] **Task 6 — Test `computePlan` and `formatPlan` in new `src/commands/loop/plan.test.ts` (AC-1, AC-2, AC-3)**
  - [x] 6.1 Create the new file `src/commands/loop/plan.test.ts` with the canonical Story 4.5/4.6 colocated-test header. Top-of-file JSDoc:
    ```typescript
    /**
     * src/commands/loop/plan.test.ts — colocated unit tests for `computePlan`
     * + `formatPlan` + `lookupModelTokens` (Story 4.7 AC-1, AC-2, AC-3).
     *
     * Coverage:
     *   - PC1-PC10: computePlan unit tests (zero-state walk, mid-DAG walk,
     *     stop-condition firing during walk, safety-cap fire, null-token
     *     aggregation, checkpoint enumeration, reproducibility — same
     *     inputs → same Plan, deterministic DAG iteration order).
     *   - PF1-PF6: formatPlan unit tests (single-step plan, multi-step plan,
     *     null-token rendering, checkpoint section rendering,
     *     firstStopCondition rendering, reproducibility — same Plan → same
     *     formatted text).
     *   - LMT1: lookupModelTokens v0.1 stub returns null for ALL inputs.
     */
    ```
  - [x] 6.2 Define test fixtures inline:
    - `freshState(): State` — the canonical zero-state State value (no `lastSuccessfulStep`).
    - `midState(stepName, epic, story): State` — a State value with `lastSuccessfulStep` populated.
    - `seedDag(): DagAdjacency` — a 5-7 node fixture DAG with deterministic ordering.
    - `freshSprintStatus(): SprintStatus` — sprint status with all stories backlog.
    - `args(overrides): LoopArgs` — a builder for LoopArgs with sensible defaults.
  - [x] 6.3 PC1: `computePlan(freshState(), seedDag(), null, args({}))` returns a Plan with `totalEstimatedSteps > 0` and `firstStopCondition !== null` (the safety cap or a natural stop). Assert the steps are in DAG insertion-order.
  - [x] 6.4 PC2: `computePlan(midState(...), seedDag(), null, args({}))` walks from the mid-state successor — assert the first step in the plan is the FIRST UNCOMPLETED successor of `state.lastSuccessfulStep.step`.
  - [x] 6.5 PC3: `computePlan(midState, seedDag, sprintStatus(epicDone), args({ untilEpicEnd: true }))` — assert `firstStopCondition.code === "epic-end-reached"` (the predicate fires immediately on the first step of the walk).
  - [x] 6.6 PC4 (safety cap): construct a synthetic DAG with a cycle (or 200+ unique nodes); call `computePlan`; assert `firstStopCondition.code === "max-iters-reached"` and `firstStopCondition.message.includes("safety cap")`. Assert `plan.steps.length === MAX_PLAN_WALK`.
  - [x] 6.7 PC5 (null-token aggregation): assert that for v0.1 stub, ALL steps have `estimatedTokensIn === null` and `estimatedTokensOut === null`; assert `plan.totalEstimatedTokensIn === null` (not 0!) and `plan.modelsConfigPresent === false`.
  - [x] 6.8 PC6 (checkpoints with `--checkpoint-each story`): `computePlan(..., args({ checkpointEach: "story" }))` — assert `plan.checkpointEachConfigured === true` and `plan.checkpoints.length > 0`. Assert each checkpoint's `stepType === "story"` and `afterStep` matches a step in `plan.steps[]`.
  - [x] 6.9 PC7 (no checkpoints when not configured): `computePlan(..., args({}))` — assert `plan.checkpointEachConfigured === false` and `plan.checkpoints.length === 0`.
  - [x] 6.10 PC8 (REPRODUCIBILITY — same inputs): call `computePlan(state, dag, sprintStatus, args)` TWICE; assert `JSON.stringify(plan1) === JSON.stringify(plan2)` byte-identical. This is the AC-3 unit test rubric — pure function over its inputs.
  - [x] 6.11 PC9 (deterministic DAG iteration order): construct two `DagAdjacency` values where the underlying `Map` has different insertion orders for the SAME node set. Assert that `computePlan` produces the SAME plan for BOTH inputs IFF the two DAGs are structurally equivalent — i.e., the plan-walk's tie-breaking does not depend on Map insertion order in a way that violates reproducibility for equivalent DAGs. (Optional — defensive check on the deterministic-iteration invariant.)
  - [x] 6.12 PC10 (zero-state path): `computePlan(freshState(), seedDag(), null, args({}))` walks from the FIRST seed node with no predecessors. Assert `plan.steps[0].step === <expected first seed node>`.
  - [x] 6.13 PF1 (single-step plan): construct a `Plan` with `totalEstimatedSteps: 1`; call `formatPlan(plan)`; assert the output contains:
    - "Plan: 1 step planned" (or "Plan: 1 steps planned" — pick one and stick with it; v0.1 conservative omits singular/plural switch and uses "Plan: 1 steps planned" for simplicity. Document in OQ-6).
    - The single step's `step` name.
    - The first-stop-condition section.
  - [x] 6.14 PF2 (multi-step plan): construct a `Plan` with `totalEstimatedSteps: 5`; call `formatPlan`; assert the output contains 5 numbered step lines (1, 2, 3, 4, 5).
  - [x] 6.15 PF3 (null-token rendering): construct a `Plan` with `totalEstimatedTokensIn: null`; call `formatPlan`; assert the output contains the placeholder text "<unknown — Story 6.3 `models:` config required>".
  - [x] 6.16 PF4 (checkpoint section rendering): construct a `Plan` with 2 checkpoints; assert the output contains 2 checkpoint lines + a header. Then construct a Plan with 0 checkpoints + `checkpointEachConfigured: false`; assert the placeholder "(none — --checkpoint-each not supplied)" appears.
  - [x] 6.17 PF5 (firstStopCondition rendering): construct a Plan with `firstStopCondition.code: "max-iters-reached"`; assert the output contains "First stop condition: max-iters-reached".
  - [x] 6.18 PF6 (REPRODUCIBILITY — same Plan): call `formatPlan(plan)` TWICE with the same input; assert `text1 === text2` byte-identical. AC-3 unit test rubric for the formatter.
  - [x] 6.19 LMT1: `lookupModelTokens("dev-story")` returns `null`; `lookupModelTokens("any-step")` returns `null`. v0.1 stub assertion.

- [x] **Task 7 — Test plan-mode integration in `run.test.ts` (AC-1, AC-2, AC-3)**
  - [x] 7.1 ADD a test fixture helper `planFirstArgs(overrides): LoopArgs` near the top of `run.test.ts` to build a `LoopArgs` value with `planFirst: true` and configurable other flags.
  - [x] 7.2 ADD describe block `runLoop — Test PF_47_1 (Story 4.7 AC-1: --plan-first short-circuits BEFORE iteration body)`:
    ```typescript
    describe("runLoop — Test PF_47_1 (Story 4.7 AC-1: --plan-first short-circuits BEFORE iteration body)", () => {
      it("--plan-first does NOT call runNextOverride at all", async () => {
        const { stub, calls } = countingStub(successResult());
        const result = await runLoop({
          argv: ["--plan-first"],
          runNextOverride: stub,
          stateOverride: () => freshTestState(),
          sprintStatusOverride: () => null,
          dagOverride: () => seedTestDag(),
        });
        expect(calls()).toBe(0); // ZERO iterations.
        expect(result.mode).toBe("plan");
        expect(result.exitCode).toBe(0);
      });
    });
    ```
    The `freshTestState()` + `seedTestDag()` helpers are inline test fixtures that build a State + DAG.
  - [x] 7.3 ADD describe block `runLoop — Test PF_47_2 (Story 4.7 AC-1: --plan-first emits AR9 "report" action)`:
    - Run the test; cast `result` to `PlanResult` after asserting `result.mode === "plan"`; assert `result.plan.totalEstimatedSteps > 0`; assert `result.formattedPlan.length > 0`.
    - Then verify the AR9 emit path: at the `import.meta.main` block, the emit is `{ action: "report", message: result.formattedPlan, exitCode: 0 }`. The unit test cannot directly assert the stdout emission; instead, the test asserts the SHAPE returned by `runLoop` is correct (the `import.meta.main` block is exercised by the integration test below).
  - [x] 7.4 ADD describe block `runLoop — Test PF_47_3 (Story 4.7: plan-mode reads state ONCE)`:
    - Use `stateOverride` to return a stable State; assert that the override is called EXACTLY ONCE in plan-mode (the iteration body's per-iteration loader is bypassed). Use a counting stub for `stateOverride`.
  - [x] 7.5 ADD describe block `runLoop — Test PF_47_4 (Story 4.7: plan-mode reads sprint-status ONCE)`:
    - Analogous to PF_47_3 but for `sprintStatusOverride`.
  - [x] 7.6 ADD describe block `runLoop — Test PF_47_5 (Story 4.7 AC-3: REPRODUCIBILITY — same inputs → same formatted plan)`:
    ```typescript
    describe("runLoop — Test PF_47_5 (Story 4.7 AC-3: REPRODUCIBILITY)", () => {
      it("--plan-first produces byte-identical formattedPlan across two invocations", async () => {
        const stableState = freshTestState();
        const stableDag = seedTestDag();
        const result1 = await runLoop({
          argv: ["--plan-first"],
          stateOverride: () => stableState,
          sprintStatusOverride: () => null,
          dagOverride: () => stableDag,
        });
        const result2 = await runLoop({
          argv: ["--plan-first"],
          stateOverride: () => stableState,
          sprintStatusOverride: () => null,
          dagOverride: () => stableDag,
        });
        expect(result1.mode).toBe("plan");
        expect(result2.mode).toBe("plan");
        if (result1.mode !== "plan" || result2.mode !== "plan") return;
        expect(result1.formattedPlan).toBe(result2.formattedPlan);
      });
    });
    ```
    This is the AC-3 verbatim integration test rubric — "the plan output is reproducible across invocations on the same state".
  - [x] 7.7 ADD describe block `runLoop — Test PF_47_6 (Story 4.7 OQ-4: DAG-build failure → graceful fallback)`:
    - Pass `dagOverride: () => null` (or a throw); assert the result mode is "plan", the formattedPlan contains "Plan unavailable", and exit code is 0. The graceful fallback preserves AC-1 "exits 0 without dispatching anything".
  - [x] 7.8 ADD describe block `runLoop — Test PF_47_7 (Story 4.7 AC-2: --plan-first --checkpoint-each story surfaces checkpoint locations)`:
    - Run with `argv: ["--plan-first", "--checkpoint-each", "story"]`; cast result to `PlanResult`; assert `result.plan.checkpointEachConfigured === true` and `result.plan.checkpoints.length > 0`. Assert `result.formattedPlan` contains the word "Checkpoints" and at least one "After step" line.
  - [x] 7.9 ADD describe block `runLoop — Test PF_47_8 (Story 4.7: --plan-first + --max-iters 5 does NOT enter iteration body)`:
    - Run with `argv: ["--plan-first", "--max-iters", "5"]`; assert `result.mode === "plan"` and `runNextOverride` was called ZERO times. The explicit `--max-iters 5` is forwarded into the plan as a stop-condition annotation but is NOT enforced as a runtime bound (because plan-mode short-circuits BEFORE the iteration body).
  - [x] 7.10 ADD describe block `runLoop — Test PF_47_9 (Story 4.7: --plan-first alone does NOT trigger default 50-iter cap)`:
    - Run with `argv: ["--plan-first"]` (no other flags); assert `result.mode === "plan"`. Inspect the plan to verify the default-cap clause behaves correctly: the plan walks until a natural stop OR the safety cap, NOT bounded to 50 hops by the default-cap predicate. (The plan-walk safety cap is 200 hops, distinct from the default-cap's 50 iter.)
  - [x] 7.11 ADD describe block `runLoop — Test PF_47_10 (Story 4.7: --plan-first ignores state.lastFailureReason)`:
    - Use a state fixture WITH `lastFailureReason: { code: "VERIFIER_FAILURE", ... }` (the Story 4.6 failure-state fixture). Run with `argv: ["--plan-first"]`; assert `result.mode === "plan"` and the plan walks regardless. Plan-mode does NOT consume `state.lastFailureReason` (the failure-policy semantics belong to the iteration body's halt-on-error gate, which plan-mode bypasses).
  - [x] 7.12 ADD describe block `runLoop — Test SWEEP_47 (Story 4.7: AC-1 + AC-2 + AC-3 sweep)`:
    - ONE describe block, 3 sub-tests:
      - Sweep-47-A (AC-1): `--plan-first` emits a "report" action with exit 0 + ZERO runNext calls.
      - Sweep-47-B (AC-2): the plan output includes total estimated steps + total estimated tokens (or null placeholder) + checkpoints (or empty placeholder).
      - Sweep-47-C (AC-3): the formatted plan is byte-identical across two invocations with the same state.
  - [x] 7.13 UPDATE the top-of-file comment block at run.test.ts:1-34 to reflect Story 4.7's coverage delta:
    - Add: "AC-1 (Tests PF_47_1-2 + Sweep-47-A): Story 4.7 `--plan-first` short-circuits BEFORE iteration body; emits a single AR9 `\"report\"` JSON line with the human-readable plan; exits 0 without dispatching anything."
    - Add: "AC-2 (Tests PF_47_7-8 + Sweep-47-B): plan output includes total estimated steps, total estimated tokens (Story 6.3 stub), checkpoints (with `--checkpoint-each` Story 4.8 forward dependency)."
    - Add: "AC-3 (Tests PF_47_5 + Sweep-47-C): plan output is reproducible across invocations on the same state (pure-function `computePlan` + `formatPlan`)."
  - [x] 7.14 Test counts projection: net delta is ~+11 new describe blocks (~12 sub-tests on `run.test.ts` + ~16 sub-tests on the new `plan.test.ts`); ~+50-80 new expects across the two files. Net post-Story-4.7: ~189-200 pass / 0 fail / ~600-650 expects across 4 files (was 3).

- [x] **Task 8 — Update `commands/bmad-loop.md` (AC-1, AC-2, AC-3 indirect)**
  - [x] 8.1 In the §Stop Conditions table (lines 178-192), flip the `--plan-first` row from `parsed only` → `RUNTIME-WIRED in 4.7`.
  - [x] 8.2 Update the intro paragraph (lines 13-19): was "Story 4.6 wired the failure-policy flags (`--stop-on-error`, `--continue-on-error`); Story 4.7+ will wire the remaining flags (`--plan-first`, `--checkpoint-each <type>`)." → REPLACE with "Story 4.6 wired the failure-policy flags; Story 4.7 wired `--plan-first` (dry-run preview); Stories 4.8+ will wire the remaining flags (`--checkpoint-each <type>`, SIGINT, exit-reason format)."
  - [x] 8.3 INSERT a new sub-section `### --plan-first (Story 4.7)` AFTER the `### --continue-on-error (Story 4.6)` sub-section. Content covers:
    - Behaviour summary (compute the planned step sequence; emit AR9 "report"; exit 0 without dispatching).
    - Usage example: `/bmad-loop --plan-first` (alone), `/bmad-loop --plan-first --until-epic-end --max-iters 50` (with other flags forwarded into the plan as annotations).
    - Plan output shape: total steps, estimated tokens (Story 6.3 forward dependency), checkpoints (Story 4.8 forward dependency), first stop condition.
    - AR9 stdout discipline: a SINGLE `"report"` JSON line where `message` carries the multi-line human-readable plan body (newlines inside the message are JSON-escaped).
    - Exit code: ALWAYS `0` (clean exit; the dry-run is the success path per AC-1).
    - Reproducibility: the plan output is byte-identical across invocations on the same state.
    - Forward dependencies: Story 6.3 (`models:` config) for non-null token estimates; Story 4.8 (`--checkpoint-each` runtime) for actual checkpoint snapshots.
  - [x] 8.4 Update §Behavior bullet 2 (lines 73-77) — the StopReason variant list is UNCHANGED for plan-mode (plan-mode bypasses the StopReason logic entirely). Add a NEW bullet 2.5 noting plan-mode short-circuit:
    > "When `--plan-first` is supplied, the runner short-circuits BEFORE the iteration body — emits a single AR9 `\"report\"` JSON line carrying the planned step sequence and exits 0 without dispatching anything. The StopReason variants do not apply in plan-mode."
  - [x] 8.5 Update §FR53 exit-code mapping (lines 96-108) — note that plan-mode ALWAYS maps to exit code `0` (clean exit). Append:
    > "Plan-mode (`--plan-first`) ALWAYS maps to exit code `0` (clean exit; the dry-run is the success path per Story 4.7 AC-1)."
  - [x] 8.6 Update "When NEITHER --max-iters nor any other stop condition is supplied" paragraph (lines 403-411) — extend the explicit-conditions enumeration with `--plan-first`. New text: "When the user supplies an explicit stop condition (e.g., `--until-epic-end`, ..., `--continue-on-error`, `--plan-first`) WITHOUT `--max-iters`, NO default cap is applied". Note: `--plan-first` is technically NOT a stop condition (it's a pre-flight mode), but for the purposes of the default-cap suppression it behaves like one.
  - [x] 8.7 Verify §argumentHint (line 3) already includes `[--plan-first]` (declared per Story 4.1); no change.
  - [x] 8.8 Verify the §Usage examples block (lines 22-35) already lists `/bmad-loop --plan-first` (line 31 — the existing example); update the comment to say "Story 4.7 — RUNTIME-WIRED in 4.7" (was "dry-run preview").

- [x] **Task 9 — Update `_bmad-output/implementation-artifacts/sprint-status.yaml` (AC: all)**
  - [x] 9.1 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: flip `4-7-plan-first-dry-run-preview: backlog → ready-for-dev` (this Story 4.7 create-story step). At dev-story completion, flip to `review`. At code-review completion, flip to `done`.
  - [x] 9.2 Bump `last_updated:` timestamp at BOTH the `# last_updated:` comment line (line 2) AND the `last_updated:` key:value line (line 38). Use `2026-05-04T01:30:00Z` (UTC ISO timestamp at create-story step).
  - [x] 9.3 sprint-status.yaml retains its original schema (no new fields). DO NOT touch any other story status.

- [x] **Task 10 — Update `src/commands/loop/index.ts` barrel (AC: structural)**
  - [x] 10.1 At `src/commands/loop/index.ts:24-30`, ADD the new `Plan`, `PlannedStep`, `PlanCheckpoint`, `PlanFirstStopCondition`, `PlanResult` exports:
    ```typescript
    export type {
      IterationRecord,
      LoopOpts,
      LoopResult,
      PlanResult,
      StopReason,
    } from "./run.ts";
    export {
      type Plan,
      type PlannedStep,
      type PlanCheckpoint,
      type PlanFirstStopCondition,
      computePlan,
      formatPlan,
      lookupModelTokens,
    } from "./plan.ts";
    ```
    Tooling consumers (Story 4.10 exit-reason format work; future telemetry) can import the structured `Plan` value via the barrel.

- [x] **Task 11 — Run the full test suite + quality gates (AC: all)**
  - [x] 11.1 `bun test src/commands/loop` exit 0. Test delta projection: ~+11 new describe blocks / ~+50-80 new expects across `run.test.ts` + the new `plan.test.ts`. The existing tests (Tests A-I, X_44-AA_44, TB_45_*, KB_45_*, SE_46_*, CE_46_*, SWEEP_45, SWEEP_46) must STILL PASS (Story 4.7 does NOT modify existing logic; the plan-mode branch is additive).
  - [x] 11.2 Post-Story-4.7 baseline projection: ~189-200 pass / 0 fail / ~600-650 expects across 4 loop test files (was 3 — `plan.test.ts` is new).
  - [x] 11.3 Confirm `src/errors.ts` registry stays at **16 codes** (`bun test src/errors.test.ts`: 10 pass, 197 expects). Story 4.7 ships ZERO new error classes.
  - [x] 11.4 Confirm `bunx --bun tsc --noEmit` exits 0. Pay attention to:
    - The `LoopResult | PlanResult` discriminated union — TypeScript narrowing via `result.mode === "plan"` should work cleanly.
    - The new `./plan.ts` module's imports — verify no circular dependency with `./run.ts` (the `StopReason` type is imported BY `plan.ts` FROM `run.ts`, so the dependency direction is `plan.ts → run.ts`; `run.ts` imports VALUES from `plan.ts` (`computePlan`, `formatPlan`); the import graph is acyclic because the `StopReason` import in `plan.ts` is type-only).
    - The exit code on `PlanResult` is the literal `0` (TypeScript should infer correctly).
  - [x] 11.5 Confirm `bunx --bun biome ci .` exits 0 (the modified files + new files pass biome lint/format).
  - [x] 11.6 Confirm AR41 boundary checks at `src/commands/loop/run.test.ts:255-291` STILL PASS — Story 4.7 ships TWO new top-tier sibling imports (from `./plan.ts`); the boundary check should accept these. Verify the boundary check rules account for the new `./plan.ts` module.
  - [x] 11.7 Confirm `commands/bmad-loop.md` is well-formed YAML frontmatter + valid markdown body (no syntax errors). Run a markdown linter check if available.
  - [x] 11.8 Verify the AR9 stdout discipline: capture stdout in PF_47_2's integration path (when feasible — the `import.meta.main` block is exercised by a separate test or by reading the stdout via a child-process invocation). Assert exactly ONE JSON line on stdout containing `"action":"report"` and `"exitCode":0`.
  - [x] 11.9 Verify the reproducibility test PF_47_5 runs DETERMINISTICALLY across multiple test runs — no flakiness.

- [x] **Task 12 — Final self-check (AC: all)**
  - [x] 12.1 Re-run all three quality gates one final time: `bun test src/commands/loop`, `bunx --bun biome ci .`, `bunx --bun tsc --noEmit`. All exit 0.
  - [x] 12.2 Confirm Story 4.2's existing tests STILL pass — Story 4.7 does NOT modify `stop-conditions.ts`; the existing predicates are unchanged.
  - [x] 12.3 Confirm Story 4.3's existing tests STILL pass — Story 4.7 does NOT modify `nextStoryStopCondition`, `phaseEndStopCondition`, or `LoopContext`.
  - [x] 12.4 Confirm Story 4.4's existing tests STILL pass — the default-cap inverted-check is EXTENDED (not modified); `argv=[]` still produces 50 iters; `--max-iters 10` still exits with `max-iters (10) reached`. The new `args.planFirst !== true` clause is defensive and does NOT alter the default-cap behavior for the existing test fixtures.
  - [x] 12.5 Confirm Story 4.5's existing tests STILL pass — the budget predicates are unchanged.
  - [x] 12.6 Confirm Story 4.6's existing tests STILL pass — the failure-policy gate is unchanged. The new plan-mode short-circuit at run.ts:486+ is BEFORE the halt-on-error gate at run.ts:796-857 — but plan-mode never reaches that gate (the iteration body is bypassed entirely). Tests SE_46_*/CE_46_* run on argv WITHOUT `--plan-first` and are unaffected.
  - [x] 12.7 Confirm Story 4.1's existing Tests A-I STILL pass — the iteration body is unchanged.
  - [x] 12.8 Confirm the AR41 boundary checks pass — the new `./plan.ts` module is top-tier and only imports from foundational/type-only sources.
  - [x] 12.9 Confirm no `console.*` in any new or modified file (per AR33).
  - [x] 12.10 Update §Dev Agent Record §Completion Notes with: (a) actual final test counts, (b) any deviations from this story spec, (c) any open questions surfaced during implementation that should be tracked in code-review.

## Dev Notes

### Architecture invariants enforced

- **AR8** (lock-free top-tier `run.ts`; lock-held `verify-and-advance.ts`): UPHELD. The plan-mode pre-flight branch uses `loadStateUnlocked` (the read-only loader); ZERO new lock acquisitions. The DAG build (`buildDag({ skillNames: [] })`) does NOT acquire any lock per Story 1.10's contract. The sprint-status read uses the same `loadSprintStatusForLoop` helper as the iteration body.
- **AR9** (single discriminated-union JSON line on stdout): UPHELD. Plan-mode emits exactly ONE `"report"` action JSON line per command invocation. The `message` field carries the multi-line human-readable plan body (newlines are JSON-escaped within the string value, which preserves the AR9 outer JSON-line invariant). The single AR9 stdout line per command invocation is preserved.
- **AR10** (token counts threaded via verify-and-advance): RELATED. Plan-mode estimates tokens from the `models:` config (Story 6.3 forward dependency); v0.1 stub returns null. Plan-mode does NOT consume per-iteration `runHistory[].tokensIn / tokensOut` (no iterations run in plan-mode).
- **AR21 + AR22** (errors carry code + actionable hint): UNCHANGED. Story 4.7 ships ZERO new error classes — registry stays at 16 codes. The DAG-build-fail fallback emits an AR22-conformant single-line hint via the `"report"` action's `message` field (no throws, no new error class).
- **AR33** (function & error semantics; throw not Result; no console.\*; async/await): UPHELD. The plan-mode branch is async (state/dag/sprint-status reads); the pure-function helpers in `plan.ts` are sync. ZERO `console.*` calls.
- **AR34** (slash-command markdown protocol): UNCHANGED. The `commands/bmad-loop.md` modifications are documentation-only — table flips + new sub-section + paragraph updates.
- **AR41** (boundary graph): UPHELD. The new `./plan.ts` module is TOP-TIER (analogous to `./stop-conditions.ts`). It imports ONLY from foundational/type-only sources (`../../dag/index.ts` types; `../../schemas/state.ts` types; `./args.ts` types; `./stop-conditions.ts` value-import for `evaluateStopConditions` — top-tier sibling allowed; `./run.ts` type-only import for `StopReason` — top-tier sibling allowed). The `./run.ts` extension adds TWO new top-tier sibling imports (`computePlan`, `formatPlan` from `./plan.ts`) — both allowed per the existing `./stop-conditions.ts` import precedent.
- **AR42** (test discipline): EXTENDED. New colocated test file `plan.test.ts`; tmpdir-per-test discipline preserved (the new tests are pure-function over fixtures, no tmpdir mutation needed). The integration tests in `run.test.ts` use the existing `stateOverride` / `sprintStatusOverride` / `dagOverride` injection seams — no new test-injection patterns.

### Code paths to extend

Story 4.7's modification points (file:line refs against the current Story 4.6 baseline):

- **`run.ts:29-40`** — JSDoc EXIT-CODE MAPPING block. UPDATE to note plan-mode ALWAYS maps to exit code 0.
- **`run.ts:50-67`** — import block. ADD two new top-tier sibling imports (`computePlan`, `formatPlan`, type `Plan`) from `./plan.ts`.
- **`run.ts:175-182`** — `LoopResult` interface. ADD `mode: "loop"` discriminator field (FIRST position).
- **`run.ts:182+`** — INSERT new `PlanResult` exported interface (~+10 lines).
- **`run.ts:448-468`** — JSDoc above `runLoop`. UPDATE to document the plan-mode short-circuit.
- **`run.ts:469`** — `runLoop` return type. EXTEND from `Promise<LoopResult>` to `Promise<LoopResult | PlanResult>`.
- **`run.ts:486`** — INSERT plan-mode pre-flight branch (~+50 lines).
- **`run.ts:494-509`** — JSDoc forward-tracker comment. UPDATE to remove `4.7:` line (now wired) and document the wired-state.
- **`run.ts:510-522`** — default-cap inverted-check. EXTEND with `&& args.planFirst !== true` clause (~+1 line).
- **`run.ts:887-894`** — existing return path. PREPEND `mode: "loop",` to the returned `LoopResult` literal.
- **`run.ts:967-989`** — `import.meta.main` block. EXTEND with the plan-mode branch (~+10 lines).
- **`plan.ts`** — NEW file (~+250-350 lines).
- **`plan.test.ts`** — NEW file (~+300-450 lines).
- **`run.test.ts:1-34`** — top-of-file comment. UPDATE coverage delta.
- **`run.test.ts`** end of file — INSERT new describe blocks for PF_47_1-10 + SWEEP_47.
- **`index.ts:24-39`** — barrel exports. ADD `Plan`, `PlannedStep`, `PlanCheckpoint`, `PlanFirstStopCondition`, `PlanResult`, `computePlan`, `formatPlan`, `lookupModelTokens`.
- **`commands/bmad-loop.md:13-19`** — intro paragraph. UPDATE Story map.
- **`commands/bmad-loop.md:73-77`** — Behavior bullet 2. ADD plan-mode short-circuit note.
- **`commands/bmad-loop.md:96-108`** — FR53 exit-code mapping. UPDATE note.
- **`commands/bmad-loop.md:178-192`** — Stop Conditions table. FLIP `--plan-first` row from `parsed only` to `RUNTIME-WIRED in 4.7`.
- **`commands/bmad-loop.md:411+`** — INSERT new sub-section `### --plan-first (Story 4.7)`.
- **`commands/bmad-loop.md:403-411`** — "When NEITHER" paragraph. EXTEND explicit-conditions enumeration with `--plan-first`.

### `Plan` design contract

The `Plan` shape is the v0.1 minimum-viable structure for the AC-2 enumeration. Each field is `readonly` (immutable struct per the project's Story 4.3 OQ-9 precedent). The `null` values on token estimates are the v0.1 graceful-fallback signal (Story 6.3 dependency). The `checkpoints` array is empty when `--checkpoint-each` is absent (Story 4.8 forward dependency). The `firstStopCondition` is the SUBSET of `StopReason` carrying only the discriminator and message — plan-mode does NOT consume the structured StopReason fields (e.g., `step`, `runLogPath`) because plan-mode never produces a halt path.

The `Plan` shape is RETURNED via the `PlanResult` discriminated-union variant of `runLoop`. Tests can inspect `result.plan` for structural assertions (e.g., `plan.totalEstimatedSteps`, `plan.checkpoints.length`); the user-facing AR9 emit uses `result.formattedPlan` (the string body).

### `PlanResult` discriminated-union design

The `LoopResult | PlanResult` union allows callers to branch on `result.mode`. v0.1 conservative chooses this discriminated approach over a sentinel-based `LoopResult.planMode?: Plan` field because:

1. Type safety — TypeScript's discriminator narrowing works cleanly on `result.mode === "plan"`.
2. Structural distinctness — plan-mode has NO `iterations[]`, NO `stopReason`, NO non-zero `exitCode`. Sentinel-based fields would force every `LoopResult` consumer to defensively check the sentinel.
3. Future extension — if Story 4.10 adds a third mode (e.g., `--explain-loop`), the union extends cleanly.

The trade-off: `LoopResult` consumers must add `if (result.mode === "loop")` guards before accessing `stopReason` / `iterations[]`. The existing 4.6-baseline test code asserts on `result.stopReason.code` / `result.iterations.length` directly — these assertions will need TypeScript narrowing or explicit `mode` guards. Story 4.7 Task 7's tests document the new pattern.

### Plan-walk algorithm semantics

The plan-walk is a pure-function DAG traversal with a synthetic state. The walk's tie-breaking heuristic (optional === false first, then insertion-order) is documented as DETERMINISTIC per the Story 1.10 invariants. The MAX_PLAN_WALK = 200 safety cap bounds worst-case computation (a misconfigured DAG cycle or a runaway plan-mode invocation cannot exhaust resources). The walk's stop-condition evaluation re-uses `evaluateStopConditions` from `stop-conditions.ts` with a synthetic state — the predicates are pure functions and are guaranteed to behave deterministically given the synthetic state.

The "best-effort" qualifier in AC-1 (epics.md line 998) is justified by the plan-walk's heuristic tie-breaking and the synthetic state's epic/story derivation. The plan is NOT a guarantee that the actual loop will follow this exact sequence — failures may divert (per AC-1 wording "since failures may divert"), the user may interrupt, the DAG may be reloaded with overrides, etc. The plan is a USEFUL preview for overnight-run pattern users to verify their assumptions.

### Plan-mode reproducibility (AC-3)

The reproducibility guarantee is achieved by:

1. `computePlan` is a PURE FUNCTION over `(state, dag, sprintStatus, args)`.
2. `formatPlan` is a PURE FUNCTION over `plan`.
3. The plan-walk's tie-breaking is deterministic per `Map` insertion-order.
4. The state read happens ONCE at plan-mode entry; subsequent reads of the same state.yaml produce the same State value (per Story 1.6's deterministic YAML parse).
5. The DAG iteration order is deterministic per Story 1.10's `Map`-based insertion-order invariants.
6. The Plan and formattedPlan values do NOT contain timestamps, run IDs, durations, or random IDs.

The `PlanResult` wrapper carries `startedAt`, `completedAt`, `durationMs` for observability, but these fields are NOT included in `formattedPlan` — reproducibility is asserted on `formattedPlan` only.

### Forward dependencies on Stories 6.3 and 4.8

- **Story 6.3 (`models:` per-step config)**: Story 4.7 ships a v0.1 stub `lookupModelTokens(stepName): null` that returns null for all inputs. The plan formatter renders "<unknown — Story 6.3 `models:` config required>" for the totals when any step lacks tokens. Story 6.3 will replace the stub with a config-driven lookup; Story 4.7's `formatPlan` already accommodates the eventual non-null return path. The stub is a DOCUMENTED forward-tracker — not a TODO — because the AC says "using `models:` config + per-step budgets" and v0.1 explicitly notes the dependency.
- **Story 4.8 (`--checkpoint-each <step-type>`)**: Story 4.7 SURFACES the planned checkpoint locations in the plan output IF the user supplies `--checkpoint-each`. The plan-walk enumerates `PlannedStep` records, so identifying which steps match `--checkpoint-each <type>` is a pure-function lookup. This works WITHOUT Story 4.8's runtime wiring because plan-mode does NOT actually create checkpoint snapshots — it only DESCRIBES where Story 4.8's eventual wiring would create them. Story 4.8 will own the runtime semantics; Story 4.7's plan-mode display is a forward-compatible preview.

### Test-suite impact + reproducibility-test rubric

Post-Story-4.6 baseline: 177 / 0 / 543 across 3 files (loop tests). Story 4.7 adds:
- New `plan.test.ts` file (~16 sub-tests across PC1-PC10 + PF1-PF6 + LMT1).
- `run.test.ts` extension (~12 sub-tests across PF_47_1-10 + SWEEP_47-A/B/C).

Net post-Story-4.7: ~189-200 / 0 / ~600-650 across 4 files. The full regression (`bun test`) should remain ~916-928 / 0 / ~3340-3400 expects. Errors registry held at 16.

The AC-3 reproducibility-test rubric is satisfied by Test PF_47_5: TWO `runLoop` invocations with identical inputs; assert `result1.formattedPlan === result2.formattedPlan` byte-identical. Test PC8 + PF6 are the unit-test rubrics for the same property at the pure-function layer.

### Errors registry + Stories 4.8+ forward-trackers

ZERO new error classes (registry holds at 16). The plan-mode branch uses pure-function logic + try/catch around the three reads; failure paths emit single-line "Plan unavailable" messages instead of throwing. Forward-trackers:

- **Story 4.8 (`--checkpoint-each <step-type>`)**: WIRES the runtime checkpoint semantics. Plan-mode will continue to surface the planned checkpoint locations; Story 4.8 adds the actual snapshot creation at iteration time. The plan-walk's checkpoint-matching pure-function logic (Task 3.7) becomes shared with Story 4.8's runtime path.
- **Story 4.9 (`SIGINT graceful exit`)**: Adds a SIGINT handler. Plan-mode does NOT need a SIGINT handler (plan-mode is wall-clock-zero — completes in ~10-30ms; no mid-flight Task subagent to interrupt). The SIGINT handler ONLY applies to the iteration body.
- **Story 4.10 (Loop exit reason + resume hint format)**: ENRICHES `formatExitReason` for all StopReason variants. May also unify the plan-mode `formattedPlan` with the same hint-formatter pattern (forward-tracker — v0.1 conservative keeps `formatPlan` separate).
- **Story 6.3 (`models:` per-step config)**: REPLACES the `lookupModelTokens` v0.1 stub with a config-driven lookup. Story 4.7's `formatPlan` already handles the non-null return path.
- **Story 6.x (config-driven default-cap suppression)**: As the default-cap inverted-check predicate at `run.ts:510-522` continues to grow with each new stop-condition flag (now 10 clauses post-4.7: maxIters, untilEpicEnd, untilStory, nextStory, phaseEnd, timeBudgetMs, tokenBudget, stopOnError, continueOnError, planFirst), consider refactoring to a `hasExplicitStopCondition(args)` helper for readability. Pure-function refactor; no behavioral change. Combined with Story 4.10's exit-reason format work.

### N-1 + N-2 nit inheritance

Story 4.2's defensive null check at `stop-conditions.ts:269` (unreachable `=== null` arm given optional-chain returns `undefined`) — Story 4.7 INHERITS unchanged because the file is NOT modified. Story 4.2's `EMPTY_DAG` sentinel + Story 4.5's `EMPTY_STATE` sentinel mid-file placement — Story 4.7 KEEPS both because the iteration body still uses them; plan-mode performs its OWN one-shot DAG/state reads (no fallback to sentinels — the graceful "Plan unavailable" message handles missing reads).

### Length justification

This spec is ~750-850 lines targeting the precedent set by 4.6 (~915 lines) and 4.5 (~896 lines). The substantive Story 4.7 content lives in: §Context Summary (the plan-mode short-circuit reasoning + Plan shape design), §Tasks (12 tasks — Tasks 2-4 own the new `plan.ts` module which is the primary deliverable, ~3-task length each), §Dev Notes (architecture invariants + code paths + design contracts + reproducibility analysis), §Open Questions (8 OQs covering plan-walk semantics, fallback paths, schema design), §Forward Action Items (Stories 4.8/4.9/4.10 + 6.3 + 6.x). The reproducibility AC-3 + plan-walk algorithm design + the `LoopResult | PlanResult` discriminated union design mandate detailed reasoning.

## Open Questions for Code Review

1. **`hasExplicitStopCondition` refactor at `run.ts:510-522` (10-clause default-cap predicate)**: per Story 4.6 SDR forward-tracker #9, the predicate is now 10 clauses long (maxIters, untilEpicEnd, untilStory, nextStory, phaseEnd, timeBudgetMs, tokenBudget, stopOnError, continueOnError, planFirst). v0.1 conservative DEFERS the refactor — the 10-clause predicate remains readable inline. Trade-off: refactor (cleaner, single source of truth) vs defer (current code is mechanical and easy to extend). Reviewer adjudication welcomed.

2. **Token estimation in absence of `models:` config (Story 6.3 dependency)**: AC-2 requires "total estimated tokens (using `models:` config + per-step budgets)". Story 6.3 (the `models:` per-step config) is NOT yet implemented. Story 4.7 v0.1 ships a `lookupModelTokens(stepName): null` stub; the formatter renders "<unknown — Story 6.3 `models:` config required>" for the totals. Trade-off: stub (v0.1; honest about the dependency) vs hardcoded heuristic (e.g., assume 5000 in / 2000 out per step; misleading). v0.1 chooses stub.

3. **Checkpoint surfacing in absence of Story 4.8 wiring**: AC-2 requires "checkpoints (if `--checkpoint-each` is supplied)". Story 4.8 owns the `--checkpoint-each` runtime semantics. Plan-mode SURFACES the planned checkpoint locations IF the user supplies `--checkpoint-each` — pure-function lookup. When `--checkpoint-each` is NOT supplied, the plan output renders "(none — --checkpoint-each not supplied)". Trade-off: surface (v0.1; honest about the planned locations) vs omit (cleaner output but loses AC-2 coverage). v0.1 chooses surface.

4. **DAG-build-fail graceful fallback**: when `buildDag({ skillNames: [] })` throws (e.g., DAG cycle, missing seed file), the plan-mode branch emits a single-line message "Plan unavailable — DAG build failed. Run /bmad-loop --doctor to diagnose." with exit code 0. Trade-off: graceful (v0.1; preserves AC-1 "exits 0" wording) vs throw (cleaner failure mode but breaks AC-1). v0.1 chooses graceful.

5. **MAX_PLAN_WALK = 200 safety cap rationale**: the plan-walk has a 200-hop safety cap to prevent runaway computation on pathological DAG topologies. Trade-off: 200 (generous; covers most overnight-run scopes which are typically <50 steps) vs lower (faster failure mode) vs higher (more accommodating). v0.1 chooses 200 as a compromise. Tracked here for code-review adjudication.

6. **Plan format: human-readable text vs structured JSON in message field**: AC-1 says "human-readable plan" (epics.md line 998). v0.1 conservative chooses HUMAN-READABLE multi-line text body inside the AR9 `"report"` action's `message` field. Trade-off: text (matches AC wording; simple to consume; tooling consumers may parse if desired) vs structured JSON-in-JSON (cleaner programmatic access but requires double-parse + violates the "human-readable" wording). v0.1 chooses text. The `Plan` structured shape is STILL accessible via the `PlanResult.plan` field for tests / tooling consumers (the import.meta.main block is the only consumer that emits to stdout; tooling consumers can call `runLoop` programmatically and inspect `result.plan`).

7. **Pre-flight gate placement (AFTER LoopArgs resolution; BEFORE default-cap)**: the pre-flight branch is gated AFTER LoopArgs resolution at `run.ts:469-485` and BEFORE the default-cap injection at `run.ts:510-522`. Trade-off: this placement (argv parse errors fire correctly; iteration body's loaders are unused) vs gate at run.ts entry (cleaner short-circuit but argv parse errors would not fire — wrong behavior) vs gate AFTER all loaders are constructed (wastes time on closures that are unused in plan-mode). v0.1 chooses the middle path — argv parse correctness + minimum wasted work.

8. **`src/dag/sort.ts` reference in architecture.md line 1351**: the architecture file references `src/dag/sort.ts` as the FR21 implementation location. The file does NOT yet exist. Story 4.7 implements the plan-walk INLINE in `src/commands/loop/plan.ts` using the existing `dag.edgesOut` adjacency rather than introducing a `src/dag/sort.ts` module. Trade-off: inline (v0.1; leverages existing adjacency) vs new module (matches architecture reference; clean separation of concerns). v0.1 chooses inline because the plan-walk has logic specific to the loop-mode (synthetic state, stop-condition evaluation, checkpoint matching) that does NOT belong in the foundational `src/dag/` mid-tier. The architecture reference is a forward-tracker for a hypothetical future generalization.

## Forward Action Items

- **Story 4.8 (`--checkpoint-each <step-type>`)**: WIRES the runtime checkpoint semantics. Plan-mode will continue to surface the planned checkpoint locations (the `matchCheckpointType` pure-function helper from Story 4.7 Task 3.7 is reusable). Story 4.8 adds the actual snapshot creation at iteration time via `src/io/snapshot.ts` (per architecture line 1352).
- **Story 4.9 (`SIGINT graceful exit`)**: Adds a SIGINT handler. Plan-mode does NOT need a SIGINT handler. The SIGINT handler applies ONLY to the iteration body.
- **Story 4.10 (Loop exit reason + resume hint format)**: ENRICHES `formatExitReason` for all StopReason variants. May also unify the plan-mode `formattedPlan` with the same hint-formatter pattern (forward-tracker — v0.1 conservative keeps `formatPlan` separate). Story 4.10 may also extend the AR9 line discipline to include richer exit-summary fields.
- **Story 6.3 (`models:` per-step config)**: REPLACES the `lookupModelTokens` v0.1 stub with a config-driven lookup from `bmad-stepper.config.yaml`. Story 4.7's `formatPlan` already handles the non-null return path; Story 6.3's wiring is a drop-in replacement of the stub function body.
- **Story 6.x (config-driven default-cap suppression)** (per Story 4.6 SDR forward-tracker #9): As the default-cap inverted-check predicate at `run.ts:510-522` is now 10 clauses long, consider refactoring to a `hasExplicitStopCondition(args)` helper. Pure-function refactor; no behavioral change.
- **Story 6.x (DAG sort module)**: The architecture.md line 1351 reference to `src/dag/sort.ts` is unfulfilled. Story 4.7 implements the plan-walk inline; a future story may extract the walk logic into a shared `src/dag/sort.ts` module IF a second consumer emerges (e.g., Story 4.10's exit-reason format work, or Story 3.7's `--list` candidate enumeration).
- **N-1 cosmetic nit (inherited from Story 4.2/4.3/4.4/4.5/4.6)**: defensive `epicNum === undefined || epicNum === null` check at `src/commands/loop/stop-conditions.ts:269` has unreachable `=== null` arm given optional-chain returns `undefined`. Cosmetic; preserved in 4.7 because `stop-conditions.ts` is NOT modified. Forward-tracker for opportunistic cleanup.
- **N-2 cosmetic nit (inherited from Story 4.2/4.3/4.4/4.5/4.6)**: `EMPTY_DAG` sentinel at `run.ts:363-367` + Story 4.5's `EMPTY_STATE` sentinel at `run.ts:377-386` positioned mid-file. KEPT in 4.7 because the iteration body still consumes them. Cleanup deferred.
- **D3 forward-tracker (per-iteration state caching)**: Story 4.5 + Story 4.6 introduced 4 + 5 per-iteration `stateFn` calls; Story 4.7 introduces a SIXTH state read in the plan-mode branch (one-shot, NOT per-iteration). v0.1 conservative does NOT merge calls. Future story may introduce a unified per-invocation state-loader to reduce call count.
- **AC-2 token estimation completeness**: When Story 6.3 lands, Story 4.7's `lookupModelTokens` stub should be replaced. The integration test PF_47_2 should be EXTENDED to assert non-null `result.plan.totalEstimatedTokensIn`. Forward-tracker for Story 6.3's developer.
- **AC-2 checkpoint runtime completeness**: When Story 4.8 lands, Story 4.7's `matchCheckpointType` pure-function helper should be SHARED with Story 4.8's runtime path. Forward-tracker for Story 4.8's developer.

## References

- `_bmad-output/planning-artifacts/epics.md` lines 988-1000 — AC verbatim source.
- `_bmad-output/planning-artifacts/prd.md` line 697 (FR21: `--plan-first`) + line 587 (`--plan-first` previews the loop's planned step sequence by convention before any nightly unattended run) + line 745 (FR54: stdout/stderr discipline).
- `_bmad-output/planning-artifacts/architecture.md` §line 1351 (FR21 implementation location reference) + §AR8/9/10/21/22/33/34/41/42 invariants (applicable to `src/commands/loop/run.ts` + `src/commands/loop/plan.ts`).
- `_bmad-output/implementation-artifacts/4-6-stop-condition-error-with-stop-on-error-continue-on-error.md` — predecessor (status done; verdict approve); SDR forward-tracker #1 (line 893) mandates Story 4.7 extension of default-cap inverted-check.
- `_bmad-output/implementation-artifacts/4-5-stop-condition-time-budget-and-token-budget.md` — `LoopMetrics` deferred-baseline pattern + AR10 token-flow source for token estimation.
- `_bmad-output/implementation-artifacts/4-4-stop-condition-max-iters-and-default-cap.md` — default-cap inverted-check pattern; AC-2 message-format precedent.
- `_bmad-output/implementation-artifacts/4-3-stop-condition-next-story-and-phase-end.md` — `LoopContext` baseline + per-iteration stateFn pattern + opt-in DAG load pattern (analogous to plan-mode's always-load DAG).
- `_bmad-output/implementation-artifacts/4-2-stop-condition-epic-end-and-story-x-y.md` — `stop-conditions.ts` module structure + sprintStatus consumption.
- `_bmad-output/implementation-artifacts/4-1-bmad-loop-command-skeleton.md` — `LoopArgsSchema` `planFirst` declaration (parsed-only); `IterationRecord` shape; AR9 final-emission strategy; "report" action variant.
- `_bmad-output/implementation-artifacts/3-1-record-last-attempted-last-failure-reason-on-halt.md` — `state.lastFailureReason` write semantics (NOT consumed by Story 4.7 plan-mode; documented for completeness).
- `_bmad-output/implementation-artifacts/1-10-dag-seed-three-tier-registry.md` — DAG `build({ skillNames })` + `DagAdjacency` + topological-walk seed; plan-mode walks `dag.edgesOut` to enumerate planned steps.
- `src/commands/loop/run.ts` (~991 lines) — modified for plan-mode short-circuit + LoopResult/PlanResult discriminated union.
- `src/commands/loop/run.test.ts` (~1500 lines after 4.6) — modified with new PF_47_* tests + SWEEP_47.
- `src/commands/loop/plan.ts` — NEW (~+250-350 lines).
- `src/commands/loop/plan.test.ts` — NEW (~+300-450 lines).
- `commands/bmad-loop.md` (~488 lines) — modified for plan-first sub-section + table flip.
- `src/commands/loop/args.ts:103` — UNCHANGED (`planFirst` already declared per 4.1).
- `src/commands/loop/stop-conditions.ts` (~662 lines) — UNCHANGED (no new pure-function predicate; Plan-mode uses `evaluateStopConditions` for synthetic-state walk).
- `src/dag/index.ts` + `src/dag/types.ts` + `src/dag/build.ts` — UNCHANGED (Story 4.7 consumes the existing surface).
- `src/state/load.ts` — UNCHANGED (`loadStateUnlocked` consumed for plan-mode one-shot read).
- `src/schemas/state.ts` — UNCHANGED.
- `src/schemas/dispatch-protocol.ts:60-64` — UNCHANGED ("report" action variant already declared).
- `src/dispatch/emit.ts` — UNCHANGED (`emitDispatchAction` already imported by run.ts).
- `src/errors.ts` — UNCHANGED (registry stays at 16; ZERO new error classes).

## Dev Agent Record

### Context Reference

Inputs (full list in §References + frontmatter `inputDocuments`). Story 4.7 spec read end-to-end (1091 lines); 12 Tasks / ~110 sub-tasks executed; 8 OQs surfaced for code-review adjudication.

### Agent Model Used

claude-opus-4-7[1m]. Bun 1.3.12 (700fc117) host (satisfies AR2 `>= 1.3` per Story 4.6 SDR §Quality gates baseline).

### Debug Log References

- **Initial discriminated-union impact**: introducing `LoopResult | PlanResult` broke 151 TypeScript references in `run.test.ts` (existing tests that read `result.iterations` / `result.stopReason` directly). Mitigation: added a single `asLoop<T>(result): Extract<T, { mode: "loop" }>` narrowing helper near the top of `run.test.ts` and globally wrapped 64 `await runLoop(...)` call sites via a single bun script. Net code change: +20 lines for the helper + scaffolding. Quality gates clean afterwards.
- **TypeScript narrowing on `args.planFirst !== true` in default-cap predicate**: TypeScript correctly narrows `args.planFirst` to `false | undefined` after the early-return on `args.planFirst === true`, so the defensive clause was reported as unintentional. Mitigation per spec: cast via `(args.planFirst as boolean | undefined) !== true` to preserve the symmetric 10-clause predicate without disabling TS. The cast is documented in the inline comment as Story 4.7 OQ-1 (deferred `hasExplicitStopCondition` helper refactor).
- **Biome formatting auto-fixed**: 2 files (run.test.ts + plan.ts) needed minor formatting touch-ups (trailing-newlines, import grouping). Ran `bunx --bun biome check --write` once; quality gates clean afterwards.

### Completion Notes List

- **Repair iterations used**: 0 / 3 max (no test failures or quality-gate failures required a repair iteration).
- **Test counts**:
  - Loop colocated: 210 pass / 0 fail / 644 expects across 4 files (was 177/0/543 in 3 files; +33 new tests = 19 plan + 14 PF_47/SWEEP_47).
  - Errors: 10 pass / 0 fail / 197 expects (registry stays at 16 — ZERO new error classes added).
  - Full regression: 937 pass / 0 fail / 3381 expects across 60 files (was 904/0/3280 in 59; +33 tests, +101 expects, +1 file `plan.test.ts`).
- **Quality gates**: `bun test src/commands/loop` exit 0; `bun test src/errors.test.ts` exit 0; `bun test` exit 0; `bunx --bun tsc --noEmit` exit 0; `bunx --bun biome ci .` exit 0.
- **AC-1 evidence (plan-mode short-circuits BEFORE iteration body, emits AR9 `report`, exits 0)**:
  - `src/commands/loop/run.ts:486-585` — pre-flight branch gated AFTER LoopArgs resolution, BEFORE default-cap injection. Returns `PlanResult` with `mode: "plan"`, `exitCode: 0`. Test PF_47_1 (run.test.ts) asserts `runNextOverride` calls === 0; Test PF_47_8 confirms `--plan-first --max-iters 5` still has ZERO runNext calls.
  - `src/commands/loop/run.ts:1064-1080` — `import.meta.main` branches on `result.mode === "plan"` and emits `emitDispatchAction({ action: "report", message: result.formattedPlan, exitCode: 0 })`. Test PF_47_2 asserts the formattedPlan contains `Plan:`, `Total estimated steps:`, `First stop condition:`.
- **AC-2 evidence (plan output includes total estimated steps, total estimated tokens, checkpoints)**:
  - `src/commands/loop/plan.ts:309-347` — `computePlan` aggregates `totalEstimatedSteps`, `totalEstimatedTokensIn/Out` (null when ANY step lacks tokens), `checkpoints[]` (when `args.checkpointEach !== undefined`).
  - `src/commands/loop/plan.ts:404-452` — `formatPlan` renders the totals + checkpoints sections, including the `<unknown — Story 6.3 \`models:\` config required>` placeholder for null tokens and the `(none — --checkpoint-each not supplied)` placeholder for empty checkpoints. Tests PC5/PC6/PC7/PF3/PF4 + Sweep-47-B cover the full surface.
- **AC-3 evidence (reproducibility across invocations on the same state)**:
  - `src/commands/loop/plan.ts:264-307` — `computePlan` is a pure function over `(state, dag, sprintStatus, args)`. The plan-walk's tie-breaking heuristic is deterministic per `Map` insertion-order (Story 1.10 invariant).
  - `src/commands/loop/plan.ts:404-452` — `formatPlan` is a pure function over `Plan`. No `Bun.nanoseconds()`, no `new Date()`, no random IDs.
  - Tests PC8 / PF6 (unit) + PF_47_5 / Sweep-47-C (integration) assert byte-identical output across two invocations.
- **AR8 (lock-free)**: plan-mode uses `loadStateUnlocked` (read-only); the DAG build (`buildDag({ skillNames: [] })`) acquires no lock; the sprint-status read uses the same `loadSprintStatusForLoop` helper.
- **AR9 (single AR9 line)**: plan-mode emits exactly ONE `"report"` JSON line per command invocation. Newlines inside the message are JSON-escaped.
- **AR10 (token estimation)**: v0.1 stub `lookupModelTokens` returns null; the formatter renders the placeholder. Story 6.3 forward dependency.
- **AR21+22 (errors registry stays at 16)**: ZERO new error classes. The DAG-build-fail / state-load-fail paths emit single-line `Plan unavailable — <reason>` messages instead of throwing.
- **AR33 (no console.* calls)**: confirmed via Grep — no `console.X(` invocations in any new or modified file.
- **AR34 (slash-command markdown)**: `commands/bmad-loop.md` table flipped + new `### --plan-first (Story 4.7)` sub-section added; intro paragraph + behavior bullet + FR53 mapping updated.
- **AR41 (boundary graph)**: TWO new top-tier sibling imports added (`computePlan`, `formatPlan` + `Plan` type from `./plan.ts`). The new `./plan.ts` module imports only foundational/type-only sources + sibling `evaluateStopConditions` from `./stop-conditions.ts` — analogous to the existing `./stop-conditions.ts` import precedent. Plan.ts imports `StopReason` (type-only) from `./run.ts` so the import direction is `plan → run` for types and `run → plan` for values; the cycle is broken because the `StopReason` import is type-only.
- **AR42 (test discipline)**: new colocated test file `plan.test.ts`; tmpdir-per-test discipline preserved (the new tests are pure-function over fixtures, no tmpdir mutation).
- **Deviations**: NONE. The implementation follows the spec verbatim. The single deliberate cast `(args.planFirst as boolean | undefined) !== true` in the default-cap predicate is documented in the inline comment as the spec-mandated defensive clause.
- **Errors registry confirmation**: `bun test src/errors.test.ts` exits 0 with 10 pass / 197 expects → registry remains at 16 codes per Story 4.6 SDR baseline.
- **Sprint-status flip**: `4-7-plan-first-dry-run-preview: ready-for-dev` → `review` at line 89; `last_updated` bumped at lines 2 + 38 to `2026-05-04T02:30:00Z`.

### File List

**Modified (4 source + 2 doc/yaml):**
- `src/commands/loop/run.ts` — extended default-cap inverted-check (10-clause), added pre-flight branch, added `PlanResult` interface, added `mode: "loop"` discriminator to `LoopResult`, extended `runLoop` return type to `Promise<LoopResult | PlanResult>`, extended `import.meta.main` block to dispatch on `result.mode`. Updated EXIT-CODE MAPPING JSDoc + JSDoc above `runLoop`. Removed `4.7:` forward-tracker line. Net delta: +120 lines.
- `src/commands/loop/run.test.ts` — added `asLoop` narrowing helper near the top; wrapped all 64 `await runLoop(...)` call sites for TS narrowing; added 14 new describe blocks (PF_47_1-10 + SWEEP_47-A/B/C); updated top-of-file coverage comment. Net delta: +320 lines.
- `src/commands/loop/index.ts` — added `Plan`, `PlannedStep`, `PlanCheckpoint`, `PlanFirstStopCondition`, `MAX_PLAN_WALK`, `computePlan`, `formatPlan`, `lookupModelTokens` exports from `./plan.ts`; added `PlanResult` to the `./run.ts` re-export. Net delta: +10 lines.
- `commands/bmad-loop.md` — flipped `--plan-first` row in §Stop Conditions table; added new `### --plan-first (Story 4.7)` sub-section after the `--continue-on-error` paragraph; updated intro paragraph (Story map); added Behavior bullet 2.5 for plan-mode short-circuit; updated FR53 exit-code mapping; updated "When NEITHER" paragraph with `--plan-first` clause; updated `--plan-first` usage-example comment. Net delta: +75 lines.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — flipped `4-7-plan-first-dry-run-preview: ready-for-dev → review`; bumped `last_updated` at the comment + key:value lines.
- `_bmad-output/implementation-artifacts/4-7-plan-first-dry-run-preview.md` — frontmatter `status: ready-for-dev → review`; bumped `last_updated`; ticked all 12 Task checkboxes; populated §Dev Agent Record + §File List + §Change Log.

**New (2):**
- `src/commands/loop/plan.ts` — NEW pure-function module (~470 lines). Exports `Plan`, `PlannedStep`, `PlanCheckpoint`, `PlanFirstStopCondition`, `MAX_PLAN_WALK`, `computePlan`, `formatPlan`, `lookupModelTokens`. ZERO I/O imports; ZERO `console.*` calls; ZERO throws.
- `src/commands/loop/plan.test.ts` — NEW colocated test file (~390 lines). 19 tests across PC1-PC10 (computePlan), PF1-PF6 (formatPlan), LMT1 (lookupModelTokens stub).

**NOT modified (deliberate per spec)**:
- `src/errors.ts` — registry stays at 16 codes; ZERO new error classes per Story 4.7 design (graceful fallback via "report" message, not throws).
- `src/commands/loop/args.ts` — `planFirst: z.boolean().optional()` already declared per Story 4.1 baseline (line 103).
- `src/commands/loop/stop-conditions.ts` — UNCHANGED (no new pure-function predicate; plan-mode uses `evaluateStopConditions` for synthetic-state walk).
- `.bmad-stepper/state.yaml` — plan-mode is read-only.
- `_bmad-output/.stepper/runs/` — plan-mode does NOT create snapshots.

## Senior Developer Review (AI)

**Reviewer:** Tomasz Gorka (claude-opus-4-7[1m] code-review agent, iter 6 of /bmad-loop run 2026-05-04T020222Z-bmad-next, loop 2026-05-03T233849Z-bmad-loop)
**Date:** 2026-05-04
**Outcome:** **approve** (must-fix=0, should-fix=0, nits=2 inherited)

### Summary

Story 4.7 lands `--plan-first` dry-run preview cleanly. The implementation is the v0.1-spec verbatim: pre-flight branch in `runLoop` short-circuits BEFORE the iteration body, ZERO tokens spent on Task subagents, ZERO state mutations, single AR9 `"report"` line emitted on stdout, exit 0. The new `src/commands/loop/plan.ts` module is a pure-function top-tier module (no I/O, no `console.*`, no throws) analogous to `stop-conditions.ts` — 470+ lines well-structured around `computePlan` + `formatPlan` + `lookupModelTokens` v0.1 stub. The `LoopResult | PlanResult` discriminated-union return shape is type-safe and clean; the `import.meta.main` block branches on `result.mode` correctly. AC-1, AC-2, AC-3 are all met with file:line evidence; reproducibility is asserted at both the unit (PC8/PF6) and integration (PF_47_5/Sweep-47-C) test layers. ZERO new error classes; registry holds at 16. Quality gates 5/5 pass. NFR-P1 (<500ms p95) preserved — plan-mode performs ~10-30ms end-to-end.

### Quality gates re-verified

- `bun test src/commands/loop/` → **210 pass / 0 fail / 644 expects** across 4 files (was 177/0/543 in 3 files; +33 tests = 19 plan + 14 PF_47/SWEEP_47). Matches projected baseline.
- `bun test src/errors.test.ts` → **10 pass / 0 fail / 197 expects**; registry at **16 codes** (independently verified by `grep -c '^  | "' src/errors.ts` → 16 union members; `grep -c '^export class \w+Error' src/errors.ts` → 16 classes).
- `bun test` → **937 pass / 0 fail / 3381 expects** across 60 files. Matches projection.
- `bun run check` (biome ci) → **exit 0**.
- `bunx tsc --noEmit` → **exit 0**.

All five gates green on first run; no repair iterations consumed during code-review.

### AC verification (file:line evidence)

**AC-1** (`--plan-first` exits 0 without dispatching anything; emits action `"report"` with human-readable plan):
- Pre-flight branch: `src/commands/loop/run.ts:548-635` — gated AFTER LoopArgs resolution at run.ts:524-539, BEFORE default-cap injection at run.ts:664-677. Reads state/sprint-status/DAG one-shot via overridable closures (lines 554-595); short-circuits via `return { mode: "plan", ... }` at run.ts:626-634 with `exitCode: 0` literal type.
- AR9 emit branch: `src/commands/loop/run.ts:1126-1136` — `if (result.mode === "plan")` branch in `import.meta.main` calls `emitDispatchAction({ action: "report", message: result.formattedPlan, exitCode: result.exitCode })` then `process.exit(result.exitCode)`. Plan-mode emit comes BEFORE the `formatExitReason(result.stopReason)` call so plan-mode never reaches the iteration-body summary path.
- ZERO dispatch confirmed by Test PF_47_1 (run.test.ts:1759) — asserts `calls() === 0` for `runNextOverride`. Test PF_47_8 (run.test.ts:1903) confirms `--plan-first --max-iters 5` ALSO has zero `runNext` calls.

**AC-2** (plan output includes total estimated steps, total estimated tokens, checkpoints):
- `computePlan` aggregation: `src/commands/loop/plan.ts:449-463` — `totalEstimatedSteps = visited.length`; `totalEstimatedTokensIn = null` when ANY step lacks tokens (correct behaviour with v0.1 stub); `checkpointEachConfigured = args.checkpointEach !== undefined`; `checkpoints[]` populated by `matchCheckpointType` per-step at lines 405-414.
- `formatPlan` rendering: `src/commands/loop/plan.ts:510-576` — header line at 517-519 surfaces `totalEstimatedSteps`; token totals at 525-537 render `<unknown — Story 6.3 \`models:\` config required>` placeholder when null (matches AC-2 "using `models:` config" via documented v0.1 stub fallback); checkpoints section at 558-569 with `(none — --checkpoint-each not supplied)` placeholder when absent.
- Tests PC5/PC6/PC7 + PF3/PF4 + PF_47_7 + Sweep-47-B cover the full surface.

**AC-3** (reproducibility — same state + args → same plan output):
- `computePlan` is pure: no `Bun.nanoseconds()`, no `new Date()`, no random IDs (verified by Grep — only the wrapper `PlanResult.startedAt/completedAt` use `new Date().toISOString()` at run.ts:549/623, but those fields are NOT included in `formattedPlan`).
- `formatPlan` is pure: lines 510-576 use only `Plan` fields + literal strings + `Array.join("\n")`.
- DAG iteration determinism: `pickNextSuccessor` at plan.ts:261-277 follows `Map`/`Set` insertion-order per Story 1.10 invariant (the `optional === false` first / insertion-order tie-break is explicit in the comment).
- Test PF_47_5 (run.test.ts:1832) asserts `result1.formattedPlan === result2.formattedPlan` byte-identical across two `runLoop` invocations with identical inputs. Sweep-47-C reasserts at the integration layer.

### AR upheld checklist

- **AR8** (lock-free top-tier): UPHELD — plan-mode uses `loadStateUnlocked` (read-only); ZERO new lock acquisitions. `buildDag({ skillNames: [] })` does not touch the lock.
- **AR9** (single AR9 stdout line per command invocation): UPHELD — plan-mode emits exactly ONE `"report"` JSON line; the multi-line plan body lives entirely INSIDE the `message` field via JSON-string escaping (newlines preserved as `\n` in the embedded value, outer JSON line remains single-line).
- **AR10** (token-flow): RELATED — plan-mode estimates tokens from `models:` config (Story 6.3 forward dependency); v0.1 stub returns null. Plan-mode does NOT consume per-iteration `runHistory[].tokensIn/tokensOut` because no iterations run.
- **AR21+22** (errors registry held at 16): UPHELD — `grep -c '^export class \w+Error' src/errors.ts` confirms 16 classes; union members count 16. The DAG-build-fail / state-load-fail paths emit single-line `Plan unavailable — <reason>. Run /bmad-loop --doctor to diagnose.` messages instead of throwing — matches AR22 actionable-hint discipline without requiring a new error class.
- **AR33** (no `console.*`): UPHELD — `Grep "console\."` over `src/commands/loop/` returns ZERO actual invocations (only JSDoc references in comments).
- **AR34** (slash-command markdown): UPHELD — `commands/bmad-loop.md` table flipped + new `### --plan-first (Story 4.7)` sub-section added cleanly; intro paragraph + behavior bullet + FR53 mapping updated.
- **AR41** (boundary graph): UPHELD — TWO new top-tier sibling imports (`computePlan`, `formatPlan` + type `Plan` from `./plan.ts`). The new `./plan.ts` module imports only foundational/type-only sources + sibling `evaluateStopConditions` from `./stop-conditions.ts` — analogous to existing precedent. The cycle `plan.ts ↔ run.ts` is broken because the `StopReason` import in `plan.ts:48` is type-only.
- **AR42** (test discipline): UPHELD — new colocated test file `plan.test.ts` (~390 lines, 19 tests); tmpdir-per-test discipline preserved (pure-function tests use inline fixtures, no tmpdir mutation needed).

### Open Question adjudications (8 OQs)

- **OQ-1 (10-clause default-cap predicate refactor)**: **DEFER**. The 10-clause inline predicate at run.ts:664-674 remains readable; the refactor to a `hasExplicitStopCondition(args)` helper is a pure cosmetic change with no behavioural impact. Tracking forward to Story 6.x or a dedicated cleanup story when the predicate grows further (Story 4.8 `--checkpoint-each` will likely add an 11th clause). The defensive `(args.planFirst as boolean | undefined) !== true` cast is correct given TypeScript's narrowing; the comment at run.ts:656-663 documents the rationale clearly.
- **OQ-2 (`models:` config v0.1 stub returning null)**: **ACCEPT**. The stub at plan.ts:171-175 with the underscore-prefixed parameter is the right v0.1 conservative path; the formatter's null-aware rendering at plan.ts:526-537 already accommodates Story 6.3's eventual non-null return. The placeholder text "<unknown — Story 6.3 `models:` config required>" is honest about the dependency and surfaces the forward-tracker to users.
- **OQ-3 (Checkpoint surfacing in absence of Story 4.8 wiring)**: **ACCEPT**. The pure-function `matchCheckpointType` at plan.ts:322-331 is a good design — Story 4.8 owns the runtime semantics, but plan-mode legitimately surfaces the planned locations as a forecast. The v0.1 boilerplate description ("Story 4.8 wires runtime semantics") is appropriately humble. Story 4.8 will share this helper.
- **OQ-4 (DAG-build-fail graceful fallback)**: **ACCEPT**. The graceful single-line `Plan unavailable — DAG build failed. Run /bmad-loop --doctor to diagnose.` message at run.ts:617 with exit code 0 preserves AC-1 ("exits 0 without dispatching anything") even on internal failure. Throwing would break AC-1 wording. Test PF_47_6 covers this path.
- **OQ-5 (MAX_PLAN_WALK = 200 cap rationale)**: **ACCEPT**. The 200-hop cap at plan.ts:63 is generous enough for typical overnight-run scopes (<50 steps) while bounding worst-case computation on pathological DAG topologies. Synthetic DAG cycles in PC4 confirm the cap fires correctly.
- **OQ-6 (Plan format human-readable text vs structured JSON)**: **ACCEPT**. AC-1 mandates "human-readable plan" (epics.md line 998 verbatim) so text is the right choice. The structured `Plan` shape remains accessible via `PlanResult.plan` for tests/tooling consumers — this is the best of both worlds (human-readable for the user, structured for programmatic consumers).
- **OQ-7 (Pre-flight gate placement after LoopArgs but before default-cap)**: **ACCEPT**. The placement at run.ts:548 (after LoopArgs resolution at 524-539, before default-cap at 664-677) is correct: argv parse errors fire correctly via `parseLoopArgs` returning a Result that throws `ConfigError` (FR53 exit code 2); plan-mode skips the wasted-work LoopMetrics/LoopContext initialisation; the default-cap clause for `planFirst` is defensive symmetry per Story 4.6 SDR forward-tracker.
- **OQ-8 (`src/dag/sort.ts` architecture reference unfulfilled)**: **DEFER**. The architecture.md line 1351 reference is a forward-tracker for a hypothetical generalisation; Story 4.7 implements the plan-walk inline in `plan.ts` because the walk has logic specific to the loop-mode (synthetic state, stop-condition evaluation, checkpoint matching) that does NOT belong in the foundational `src/dag/` mid-tier. Forward to Story 6.x if a second consumer emerges.

**OQ adjudication tally:** 6 ACCEPT (OQ-2/3/4/5/6/7) + 2 DEFER (OQ-1/8) + 0 REJECT.

### Deviation decisions

ZERO deviations from the spec. Implementation follows the dev-story spec verbatim. The single deliberate cast `(args.planFirst as boolean | undefined) !== true` in the default-cap predicate at run.ts:674 is documented in the inline comment as the spec-mandated defensive clause (matches OQ-1).

### Forward-tracker action items (carried to subsequent stories)

- **Story 4.8 (`--checkpoint-each <step-type>` runtime)**: SHARE the `matchCheckpointType` pure-function helper at plan.ts:322-331 with Story 4.8's runtime path; refine the v0.1 boilerplate description to reflect actual snapshot-creation semantics.
- **Story 4.9 (SIGINT graceful exit)**: Plan-mode does NOT need a SIGINT handler (wall-clock-zero, completes in ~10-30ms); the SIGINT handler applies ONLY to the iteration body.
- **Story 4.10 (Loop exit reason + resume hint format)**: Consider unifying `formatPlan`'s output structure with the iteration-body's `formatExitReason` if a shared hint-formatter pattern emerges. Story 4.7 OQ-1 (10-clause predicate refactor) MAY also be addressed in Story 4.10's unification work.
- **Story 6.3 (`models:` per-step config)**: REPLACE `lookupModelTokens` v0.1 stub at plan.ts:171-175 with config-driven lookup from `bmad-stepper.config.yaml`. Drop-in replacement of the function body. Test PF_47_2 should be EXTENDED to assert non-null `result.plan.totalEstimatedTokensIn` after Story 6.3 lands.
- **Story 6.x (config-driven default-cap suppression / `hasExplicitStopCondition` helper)**: Story 4.7 OQ-1 deferred. The 10-clause predicate at run.ts:664-674 grows linearly with each new stop-condition flag; refactor when it reaches ~12+ clauses or when readability degrades.
- **Story 6.x (DAG sort module / `src/dag/sort.ts`)**: Story 4.7 OQ-8 deferred. Architecture.md line 1351 forward-tracker; extract the plan-walk logic into a shared module if a second consumer emerges (e.g., Story 4.10 exit-reason work, Story 3.7 `--list` candidate enumeration).
- **N-1 inherited cosmetic nit**: defensive `epicNum === undefined || epicNum === null` check at `src/commands/loop/stop-conditions.ts:269` has unreachable `=== null` arm. Story 4.7 INHERITS unchanged because `stop-conditions.ts` is NOT modified. Forward-tracker for opportunistic cleanup in any future `stop-conditions.ts` edit.
- **N-2 inherited cosmetic nit**: `EMPTY_DAG` sentinel at run.ts:406-410 + `EMPTY_STATE` sentinel at run.ts:420-429 positioned mid-file. KEPT in 4.7 because the iteration body still consumes them. Cleanup deferred to Story 6.x file-level reorganisation.
- **D3 forward-tracker (per-iteration state caching)**: Story 4.7 introduces a SIXTH state read in plan-mode (one-shot, NOT per-iteration). v0.1 conservative does NOT merge calls. Future story may introduce a unified per-invocation state-loader.

### Verdict

**approve**: must-fix = 0; should-fix = 0; 2 nits inherited unchanged; 9 forward-trackers carried. Story 4.7 is COMPLETE.

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-05-04 | bmad-create-story (Iteration 4 of /bmad-loop run 2026-05-04T012730Z-bmad-next, loop 2026-05-03T233849Z-bmad-loop) | Initial story spec — status: ready-for-dev. |
| 2026-05-04 | bmad-dev-story (Iteration 5 of /bmad-loop run 2026-05-04T014355Z-bmad-next, loop 2026-05-03T233849Z-bmad-loop) | Story 4.7 dev-story complete — status: ready-for-dev → review. Tasks 1-12 done; 12 task checkboxes ticked; 33 new tests (19 plan + 14 PF_47/SWEEP_47); errors registry stays at 16; quality gates 5/5 pass; 0 repair iterations. |
| 2026-05-04 | bmad-code-review (Iteration 6 of /bmad-loop run 2026-05-04T020222Z-bmad-next, loop 2026-05-03T233849Z-bmad-loop) | Story 4.7 code-review complete — status: review → done. Verdict approve (must-fix=0, should-fix=0, 2 inherited nits, 9 forward-trackers). All 5 quality gates re-verified green: bun test src/commands/loop 210/0/644, bun test src/errors.test.ts 10/0/197 (registry 16), bun test 937/0/3381, bun run check exit 0, bunx tsc --noEmit exit 0. AC-1 + AC-2 + AC-3 verified with file:line evidence. AR8/9/10/21/22/33/34/41/42 all upheld. 8 OQs adjudicated: 6 ACCEPT + 2 DEFER + 0 REJECT. ZERO deviations from spec. |
