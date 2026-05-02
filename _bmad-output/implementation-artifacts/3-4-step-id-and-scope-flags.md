---
status: done
story_id: '3.4'
story_key: 3-4-step-id-and-scope-flags
epic: '3'
title: '`--step <id>` and Scope Flags'
created: '2026-05-01'
last_updated: '2026-05-01'
priority: M
estimated_effort: M
fr_coverage:
  - FR1
  - FR8
  - FR10
  - FR11
  - FR53
  - FR54
nfr_coverage:
  - NFR-S2
  - NFR-S5
  - NFR-M3
  - NFR-R4
ar_coverage:
  - AR8
  - AR9
  - AR21
  - AR22
  - AR33
  - AR41
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/implementation-artifacts/epic-2-retrospective.md
  - _bmad-output/implementation-artifacts/3-1-record-last-attempted-last-failure-reason-on-halt.md
  - _bmad-output/implementation-artifacts/3-2-resume-flag.md
  - _bmad-output/implementation-artifacts/3-3-dry-run-flag.md
  - _bmad-output/implementation-artifacts/2-2-dispatch-spec-generator.md
  - _bmad-output/implementation-artifacts/2-4-lock-free-run-ts-for-bmad-next.md
  - _bmad-output/implementation-artifacts/1-7-cli-argument-parser.md
  - _bmad-output/implementation-artifacts/1-10-dag-seed-three-tier-registry.md
  - src/errors.ts
  - src/io/log.ts
  - src/state/load.ts
  - src/schemas/state.ts
  - src/dispatch/index.ts
  - src/dispatch/generate-spec.ts
  - src/dag/types.ts
  - src/dag/index.ts
  - src/dag/build.ts
  - src/commands/next/run.ts
  - src/commands/next/run.test.ts
  - src/commands/next/args.ts
  - src/commands/next/args.test.ts
  - src/commands/next/index.ts
---

# Story 3.4: `--step <id>` and Scope Flags

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper user,
I want `--step`, `--epic`, `--story`, `--phase` to override or narrow the computed next step,
So that I can manually point Stepper at a specific work item.

## Context Summary

This is the **fourth story of Epic 3** and the **scope-narrowing flag cluster** that completes the explicit-targeting half of Story 1.7's 18-flag inventory. Stories 3.1 + 3.2 closed the halt-recovery loop (write `state.lastAttempted` + `state.lastFailureReason` on halt; consume them via `--resume`); Story 3.3 landed the first read-only-preview flag (`--dry-run` with byte-zero filesystem mutation). Story 3.4 turns its attention to the **next-step-selection heuristic** itself: given the user's explicit intent (`--step bmad-X`) or scope hint (`--epic 3`, `--story 3.4`, `--phase planning`), the runner-tier `pickNextStep` must (a) honour the override semantics per epic AC lines 776-784 and (b) keep the `--explain`/`--list`/`--dry-run` read-only cluster forward-compatible.

**All 4 CLI flags ALREADY EXIST** on `NextArgsSchema` per Story 1.7's 18-flag inventory (`src/commands/next/args.ts:148-153`):

- `step: z.string().optional()` (line 148) — accepts a step name like `bmad-brainstorming`.
- `epic: z.string().optional()` (line 149) — accepts an epic number as a string (`"3"`, `"6"`); v0.1 wiring per architecture line 1340 (`FR10 → src/dag/build.ts`) treats this as informational metadata since DAG nodes do NOT carry epic-level attribution at the seed level (story attribution is project-level and lives in `_bmad-output/implementation-artifacts/<story-key>.md` frontmatter — Story 6.x telemetry enhancement).
- `story: z.string().optional()` (line 150) — accepts a story id like `"3.4"`; same v0.1 caveat as `--epic`.
- `phase: z.enum(["analysis", "planning", "solutioning", "implementation", "retro"]).optional()` (lines 151-153) — the 5-value DAG phase enum per architecture line 452. This filter IS structurally implementable at v0.1 (DAG nodes carry `node.phase`).

Story 1.7 reserved all 4 flags for Epic 3 consumption; Story 3.4 wires the runtime branches in `src/commands/next/run.ts`. **No new CLI flag schema work is required.** The `args.ts:208-224` `booleanKeys` set does NOT enumerate these 4 flags (they are all optional STRINGS / ENUMS, not booleans); Story 1.7's tests already cover the parse-side. **No args change needed for Story 3.4.**

**Story 2.4 already shipped a partial scope-flag implementation** at `src/commands/next/run.ts:429-538`. The current implementation has 3 levels of completeness:

1. **`--step` (lines 434-445)**: SHIPPED but INCOMPLETE per AC line 780. The current branch resolves the step name to a `DagNode` via `dag.nodes.get(args.step)` and either returns it OR throws `ConfigError` with the hint `Run /bmad-next --list to see candidate steps; "<step>" is not in the resolved DAG.`. **What's missing**: the AC line 780 wording requires "the named step is dispatched **if its preconditions are met**; otherwise Stepper exits with `CONFIG_ERROR` describing the unmet preconditions and the hint `Run /bmad-next --explain to see why <step> is blocked.`". The current branch does NOT verify preconditions — it dispatches whatever step name the user passes, even if `state.lastSuccessfulStep` does not yet satisfy the step's `node.after[]` prerequisites. Story 3.4 ADDS the precondition check.

2. **`--phase` (lines 482-484)**: SHIPPED and FUNCTIONAL. The current implementation filters candidates by `n.phase === args.phase`. Story 3.4 PRESERVES this; the existing tests at `run.test.ts` already cover the happy path. The only Story 3.4 enhancement: the precondition-met candidates set is filtered THROUGH `--phase` (the existing call site already does this).

3. **`--epic` and `--story` (lines 495-501)**: STUBBED via `void args.epic; void args.story;`. The current implementation logs a comment and preserves the candidate set unchanged — i.e., the flags are SILENTLY IGNORED. Story 3.4 must decide v0.1 semantics for these two flags. Per the AC line 783 wording (`candidate steps are filtered to those matching the scope; the highest-priority unblocked candidate is selected`), the v0.1 conservative implementation needs A FILTER, but the DAG node shape (`src/dag/types.ts:60-68`) does NOT expose epic/story attribution. Story 3.4 adopts the **runner-tier projection from `state.lastAttempted` / `state.lastSuccessfulStep`** as the v0.1 scope source: if `args.epic` is supplied AND it does NOT match `state.lastSuccessfulStep?.epic` (or `state.lastAttempted?.epic` on a fresh project), the filter REJECTS all candidates by setting `filtered = []` (which then triggers the existing `ConfigError` at lines 512-526). The same logic applies to `args.story`. **This is a v0.1 design decision** documented in §v0.1 Design Decisions; Story 6.x telemetry enhancement may extend DAG nodes with epic/story attribution.

**The contract per AC line 780**: when `--step <name>` is supplied, the runner verifies that the step's preconditions are met. **Precondition** is defined as: every name in `node.after[]` MUST be reachable from `state.lastSuccessfulStep` walking the inverse DAG (`edgesIn`). For v0.1 conservative scope, Story 3.4 uses the simpler rule: **every name in `node.after[]` MUST equal `state.lastSuccessfulStep?.step` OR be in the implicitly-completed `state.completedSteps[]` set IF that field exists** (Story 1.5 declared `state.completedSteps: string[]` per architecture line 783). When the precondition is unmet, throw `ConfigError` with the verbatim AC-line-780 hint `Run /bmad-next --explain to see why <step> is blocked.`. **The `<step>` substitution is `args.step` verbatim** (e.g., `Run /bmad-next --explain to see why bmad-create-architecture is blocked.`).

**The contract per AC line 783**: when `--epic`, `--story`, or `--phase` (alone or in combination) is supplied without `--step`, candidates are filtered to those matching the scope, and the highest-priority unblocked candidate is selected. The "highest-priority" tiebreaker is the existing phase-order then name-lexicographic sort at `pickNextStep` lines 530-535. The "unblocked" predicate is the existing precondition-satisfied check (`node.after[]` matches `lastStepName`). Story 3.4 ADDS the `--epic` / `--story` filters BEFORE the existing phase / optional filters; the order is: prerequisite-satisfaction → `--phase` → `--epic` → `--story` → optional-inclusion → tiebreaker sort. If the filtered set is empty, throw the existing `ConfigError` at lines 512-526 with the existing hint `Run /bmad-next --list to see candidate steps; the current filter excludes all candidates.`.

**The contract per AC line 784**: combining `--epic` and `--story` (or `--phase`) is allowed; combining `--step` with any scope flag prints a warning that scope is ignored when `--step` is explicit. Story 3.4 emits a SINGLE warning to stderr via `log.warn` per the AR33 stdout/stderr discipline (AR9 reserves stdout for the dispatch JSON line; warnings go to stderr per `src/io/log.ts:20-21`). The warning format: `next: --step is explicit; --epic/--story/--phase scope flags are ignored.`. The warning is emitted ONCE at the start of `pickNextStep` BEFORE the explicit-`--step` branch returns.

**Edge case — `--step <name>` where `<name>` is the current `lastSuccessfulStep`**: the existing `pickNextStep` skips the `node.name === lastStepName` candidate (line 462-464) on the inferred path; on the `--step` explicit path, the current implementation at lines 434-445 does NOT skip. Story 3.4 PRESERVES the existing behavior: explicit `--step lastSuccessfulStep.step` is allowed (the user may want to re-run a step intentionally — though Story 3.2 `--resume` is the canonical re-run path). The precondition check passes trivially because `node.after` is reachable from `state.lastSuccessfulStep` (the step was, by definition, already dispatched).

**Edge case — `--step <name>` on a fresh project (no `lastSuccessfulStep`)**: the precondition check verifies `node.after.length === 0` (the step is an entry-point). If `node.after` is non-empty, the hint surfaces the unmet-prerequisite list. The "fresh project" case is the natural `bmad-brainstorming` start; explicit `--step bmad-brainstorming` succeeds because its `after` is empty.

**Edge case — `--step` combined with `--resume`**: Story 3.2's resume branch BYPASSES `pickNextStep` (lines 918-926). When BOTH `--step` and `--resume` are passed, the resume branch wins (it bypasses scope-flag enforcement entirely). The Story 3.2 `resolveResumeTarget` JSDoc at lines 597-602 already documents this precedence; Story 3.4 preserves it (no warning emission for `--step + --resume` because the resume branch returns BEFORE the `pickNextStep` warning would fire). Story 3.4 documents this in JSDoc.

**Edge case — `--step` combined with `--dry-run`**: Story 3.3's dry-run branch sits AFTER the `pickFirstPersona` (lines 985-1000); it reads `nextStep.name` from `pickNextStep`'s result. When `--step --dry-run` is passed, `pickNextStep` resolves to the explicit step (Story 3.4 verifies preconditions per AC line 780); the dry-run preview surfaces the explicit step. The Story 3.3 test at `run.test.ts` Test J (`--dry-run + --step bmad-brainstorming`) already verifies this combo path.

**Edge case — `--step` combined with `--explain`**: the `--explain` short-circuit at lines 833-861 calls `pickNextStep` (line 853) directly. When `--step --explain` is passed, `pickNextStep` honors `args.step` AND verifies preconditions (Story 3.4 wiring); on success, the explain stub references the explicit step name. On precondition failure, the throw is caught by the inner try/catch at line 855-857 and the explain stub falls back to `(none — DAG empty or filters exclude all candidates)`. **Decision**: Story 3.4 PRESERVES the catch-and-fallback behavior in the explain handler; the precondition error surfaces only on the dispatch path (where the user actually wants to run the step). On the explain path, the user is asking "why" — the empty-candidate fallback is acceptable because Story 3.6's full reasoning trace will explicitly call out the unmet prerequisites.

**Edge case — `--epic ""` / `--story ""` / `--step ""`**: empty strings are treated as "no filter" per Story 1.7's existing convention at `pickNextStep` lines 435 (`args.step !== undefined && args.step !== ""`) and lines 495+499 (`args.epic !== "" && args.story !== ""`). Story 3.4 PRESERVES this: empty-string flag values are silently dropped to "no filter" (the user passed `--epic=` with an empty value); the warning for `--step + scope` does NOT fire if the scope flag values are empty.

**Forward-coupling with Story 3.6 (`--explain` Reasoning Trace)**. Story 3.6 owns the full reasoning trace including the unmet-precondition enumeration. Story 3.4's `--step <name>` precondition-failure throw surfaces a SHORT hint pointing the user at `--explain`; the FULL precondition diagnostic ("step `<name>` is blocked by unmet prerequisites: [`X`, `Y`]") lands in Story 3.6's `--explain` enhancement. v0.1 conservative: Story 3.4 ships the AC-mandated short hint; Story 3.6 enriches the diagnostic.

**Forward-coupling with Story 3.7 (`--list`)**. Story 3.7's `--list` output enumerates candidate next steps by walking the inverse DAG. The same precondition-satisfied predicate Story 3.4 implements for `--step` is the natural foundation for Story 3.7's enumeration. Story 3.4 documents the shared predicate in JSDoc; Story 3.7 may refactor to a shared helper (`isPreconditionMet(node, state, dag)`).

**Forward-coupling with Story 6.x (per-step DAG epic/story attribution)**. v0.1 ships `--epic` / `--story` as runner-tier projections from `state.lastSuccessfulStep` / `state.lastAttempted`. Story 6.x telemetry enhancement may extend DAG nodes with `epic?: number` + `story?: string` attribution (sourced from BMAD skill frontmatter or per-step config), enabling true cross-DAG scope filtering. Story 3.4's v0.1 form is forward-compatible: when DAG nodes gain epic/story attribution, the filter expression at `pickNextStep` lines 495-501 swaps from "compare against `state.lastSuccessfulStep.epic`" to "compare against `node.epic`" with no test-shape change.

Concretely, this story produces:

1. **`src/commands/next/run.ts`** (MODIFIED) — substantially rewrites `pickNextStep` (lines 429-539) with:
   - **Scope-conflict warning emission** at the very top of the function (BEFORE the explicit-`--step` branch): when `args.step !== undefined && args.step !== ""` AND any of (`args.epic`, `args.story`, `args.phase`) is set with a non-empty value, emit `log.warn("next: --step is explicit; --epic/--story/--phase scope flags are ignored.")` to stderr per AC line 784. Pass the logger via a new optional parameter to `pickNextStep` (or via a closure variable; closure is cleaner — see Tasks).
   - **`--step` precondition check** in the explicit-`--step` branch (lines 435-444 area): after the `dag.nodes.get(args.step)` lookup succeeds, verify that the step's preconditions are met. v0.1 rule: every name in `node.after[]` MUST equal `state.lastSuccessfulStep?.step` OR be in `state.completedSteps?.[]` if that field is non-empty. When unmet, throw `ConfigError` with the verbatim hint `Run /bmad-next --explain to see why <step> is blocked.`. The error `detail` JSON includes `{ step, after, lastSuccessfulStep, completedSteps }` for diagnostic logging.
   - **`--epic` / `--story` filter wiring** at the existing stub site (lines 495-501): replace the `void args.epic; void args.story;` no-ops with v0.1 runner-tier projections. The filter logic: when `args.epic` is supplied, project the candidate's epic from `(state.lastAttempted?.step === node.name ? state.lastAttempted.epic : state.lastSuccessfulStep?.epic) ?? 0` and reject candidates whose projected epic does NOT equal `Number(args.epic)`. The same projection applies to `args.story` (string comparison). **v0.1 caveat documented in §v0.1 Design Decisions**: this is a runner-tier projection; not a true DAG-node-attribution filter.
   - **JSDoc enhancement** above `pickNextStep`: documents the scope-conflict warning, the precondition rule, the v0.1 epic/story projection, and the forward-coupling with Stories 3.6 / 3.7 / 6.x.

2. **`src/commands/next/run.ts`** (MODIFIED, secondary surface) — adds the helper `isPreconditionMet(node, state)` (or inlines the logic in `pickNextStep`; v0.1 conservative inlines for the explicit-`--step` branch and reuses the existing per-candidate filter for the inferred path). The helper signature:
   ```typescript
   function isPreconditionMet(node: DagNode, state: State): boolean {
     if (node.after.length === 0) return true;
     const lastStepName = state.lastSuccessfulStep?.step;
     const completed = new Set(state.completedSteps ?? []);
     return node.after.every((p) => p === lastStepName || completed.has(p));
   }
   ```
   This helper is the SHARED predicate for `--step` precondition check + the existing inferred-candidate filter at `pickNextStep` lines 459-477 (which currently uses an inline simpler check — the helper unifies the two; Story 3.7's `--list` may consume the same helper).

3. **`src/commands/next/run.test.ts`** (MODIFIED) — appends a new `describe` block (`"runNext — Story 3.4 --step + scope flags"`) with ~12-15 NEW test cases covering AC line 780 (preconditions met / unmet), AC line 783 (scope filtering happy path / empty result), AC line 784 (warning emission), and edge cases (combos with `--resume` / `--dry-run` / `--explain`):
   - **AC-1 happy path (--step preconditions met)** — seed state with `lastSuccessfulStep: { step: "bmad-brainstorming", epic, story, attemptedAt }`; invoke with `--step bmad-product-brief` (which has `after: ["bmad-brainstorming"]` per Story 1.10 seed); assert (a) `result.exitCode === 0`, (b) `result.action.action === "dispatch"`, (c) `result.action.lastAttempted.step === "bmad-product-brief"`.
   - **AC-1 unmet preconditions (--step blocked)** — seed state with NO `lastSuccessfulStep`; invoke with `--step bmad-create-architecture` (which has `after: [..., "bmad-create-prd", ...]` per Story 1.10 seed — NOT an entry-point); assert (a) `result.exitCode === 2`, (b) `result.action.action === "halt"`, (c) `result.action.message` contains `Run /bmad-next --explain to see why bmad-create-architecture is blocked.`.
   - **AC-1 unknown step (existing behavior preserved)** — invoke with `--step bmad-not-a-real-step`; assert the existing hint `Run /bmad-next --list to see candidate steps; "bmad-not-a-real-step" is not in the resolved DAG.` (unchanged from Story 2.4).
   - **AC-1 entry-point on fresh project** — invoke with `--step bmad-brainstorming` on a fresh state (no `lastSuccessfulStep`); assert success (entry-point has empty `after[]`; precondition trivially met).
   - **AC-2 scope filtering happy path (--phase)** — seed state with `lastSuccessfulStep: { step: "bmad-brainstorming", ... }`; invoke with `--phase planning`; assert the dispatched step is in the planning phase (e.g., `bmad-product-brief`).
   - **AC-2 scope filtering happy path (--epic)** — seed state with `lastSuccessfulStep: { step: "bmad-brainstorming", epic: 3, story: "3.0", ... }`; invoke with `--epic 3`; assert the dispatched step's projected epic equals 3 (the v0.1 projection passes through `state.lastSuccessfulStep.epic`).
   - **AC-2 scope filtering happy path (--story)** — same fixture as `--epic`; invoke with `--story "3.4"`; assert the dispatched step's projected story equals `"3.4"`.
   - **AC-2 scope filtering empty result** — seed valid state; invoke with `--epic 999` (no candidates); assert `result.exitCode === 2` and `result.action.message` contains `Run /bmad-next --list to see candidate steps`.
   - **AC-2 combined --epic + --story** — seed valid state; invoke with `--epic 3 --story "3.4"`; assert the dispatched step matches BOTH filters (the v0.1 projection: both equal `state.lastSuccessfulStep.epic + .story`).
   - **AC-2 combined --epic + --phase** — seed valid state; invoke with `--epic 3 --phase planning`; assert the dispatched step matches BOTH filters.
   - **AC-3 warning emission (--step + --epic)** — invoke with `--step bmad-brainstorming --epic 3`; assert (a) success on the `--step` path, (b) the captured logger's `warn(message)` was called with the message `next: --step is explicit; --epic/--story/--phase scope flags are ignored.`. Use the existing `LoggerFns` injection escape hatch at `RunNextOptions.logger`.
   - **AC-3 warning emission (--step + --story)** — same as above but with `--story "3.4"`; assert the warning fires.
   - **AC-3 warning emission (--step + --phase)** — same as above but with `--phase planning`; assert the warning fires.
   - **AC-3 warning emission (--step + multiple scope flags)** — invoke with `--step bmad-brainstorming --epic 3 --story "3.4" --phase planning`; assert exactly ONE warning is emitted (not 3).
   - **AC-3 no warning (--step alone)** — invoke with `--step bmad-brainstorming`; assert NO warning emitted.
   - **AC-3 no warning (scope flags alone, no --step)** — invoke with `--epic 3`; assert NO warning emitted (the warning only fires when `--step` IS combined with scope).
   - **Edge: --step + --resume (resume wins)** — seed valid `lastAttempted` + `lastFailureReason`; invoke with `--step bmad-product-brief --resume`; assert the dispatched step is `state.lastAttempted.step` (resume bypasses scope-flag enforcement); assert NO warning is emitted (the warning fires inside `pickNextStep` which is bypassed on resume).
   - **Edge: --step + --dry-run combo** — invoke with `--step bmad-brainstorming --dry-run` on a fresh state; assert the dry-run preview surfaces the explicit step (per Story 3.3 Test J — already covered, but Story 3.4 verifies the precondition-met explicit step).
   - **Edge: --step blocked + --explain (explain catches throw)** — invoke with `--step bmad-create-architecture --explain` on a fresh state (precondition unmet); assert the explain stub returns the empty-candidate fallback (`current next step: (none — DAG empty or filters exclude all candidates)`); the throw is caught by the existing inner try/catch.

4. **`src/commands/next/args.ts`** (UNCHANGED — `--step`, `--epic`, `--story`, `--phase` already in `NextArgsSchema` per Story 1.7). Verified via Read: `args.ts:148-153` declares all 4 flags. Story 1.7's tests already cover the parse-side. **No args change needed for Story 3.4.**

5. **`src/dag/build.ts` / `src/dag/types.ts`** (UNCHANGED — Story 3.4 BYPASSES the architecture line 1340 (`FR10 → src/dag/build.ts`) suggestion that DAG-build owns the `--step` validation; v0.1 conservative places the validation in `pickNextStep` (runner-tier) where the state context is already available). DAG nodes do NOT gain epic/story attribution in v0.1; Story 6.x is the natural extension point.

6. **`src/dispatch/generate-spec.ts`** (UNCHANGED — Story 3.4 changes the `nextStep` resolution but NOT the dispatch-spec construction; the existing `epic + story` projection at `generate-spec.ts:172-177` continues to read from `state.lastAttempted ?? state.lastSuccessfulStep`).

This story exercises:
- **AR8** (lock-free `run.ts` / lock-held `verify-and-advance.ts`): UNCHANGED. Story 3.4 modifies `pickNextStep` (a synchronous helper inside `runNext`); no lock acquired in `run.ts`. The downstream `verify-and-advance.ts` is unchanged.
- **AR9** (single discriminated-union JSON line on stdout): UNCHANGED. The dispatch line shape is identical; only the `nextStep.name` resolution path changes. The new precondition-failure throw flows through the existing `haltFromError` translation pipeline at `run.ts:1068-1090`.
- **AR21 + AR22** (errors carry code + actionable hint; single-line `Run/See/Try/Check` hints): EXTENDED. Story 3.4 introduces 1 NEW `ConfigError` `hintOverride` string (precondition-unmet for `--step`). The hint follows the AR22 verb discipline (`Run` is the leading verb). The hint is single-line.
- **AR33** (function & error semantics; throw not Result; no console.*; async/await): UNCHANGED. The new `isPreconditionMet` helper is a pure boolean predicate; no new throws beyond the existing `ConfigError`. The `log.warn(...)` call goes through the established `LoggerFns.warn` interface at `src/commands/next/run.ts:184` (which delegates to `src/io/log.ts:20-21`'s stderr writer).
- **AR41** (boundary graph; no upward / sibling-higher imports): UNCHANGED. Story 3.4 modifies `run.ts` (top-tier composer) only; no new module created; no new imports added. The `State`, `DagNode`, `DagAdjacency`, `NextArgs`, `ConfigError`, and `LoggerFns` types are all already imported.
- **FR8** (`/bmad-next` single-step advance): EXTENDED. The runner now respects the user's explicit `--step` override AND verifies its preconditions per AC line 780.
- **FR10** (`--step <id>` override): PRIMARY DELIVERABLE. Architecture §line 1340 declares `FR10 → src/commands/next/args.ts, src/commands/next/run.ts`, with `src/dag/build.ts` as a secondary surface. Story 3.4 wires the runtime branch in `run.ts`; the `args.ts` declaration is already shipped (Story 1.7); the `dag/build.ts` is INTENTIONALLY UNCHANGED (v0.1 conservative places the precondition check in the runner-tier where the state is already in scope).
- **FR11** (`--epic`/`--story`/`--phase` scope filters): PRIMARY DELIVERABLE. Architecture §line 1341 declares `FR11 → src/commands/next/args.ts, src/commands/next/run.ts, src/dag/sort.ts`. Story 3.4 wires the runtime branch in `run.ts`; the `dag/sort.ts` reference is INTENTIONALLY UNCHANGED in v0.1 (no DAG-side topological sort introduced; the existing phase-order tiebreaker at `pickNextStep` lines 530-535 stays).
- **FR53** (Documented exit codes): UNCHANGED. The new precondition-failure throw uses `ConfigError` (`exitCode: 2`); halt translations flow through the existing `haltFromError` mapping.
- **FR54** (stdout/stderr discipline): EXTENDED. The new `log.warn(...)` call writes to stderr per `src/io/log.ts:20-21`; AR9's stdout reservation for the dispatch JSON line is preserved (the warning is stderr-only).
- **NFR-S2** (writes only inside scope): UNCHANGED. The runner does NOT add any new write-side behavior.
- **NFR-S5** (non-corrupting flag combinations): EXTENDED. The `--step + scope` warning enforces the user's intent without silently dropping the explicit override.

Estimated effort: **M** (medium — modifies 1 existing file (`run.ts`) substantially in `pickNextStep`; adds 1 new helper (`isPreconditionMet`); introduces 1 new error throw with `hintOverride`; emits 1 new `log.warn(...)` call; extends 1 existing test file (`run.test.ts`) with ~17-18 new test cases. NO new modules. NO new schema work. NO new error classes. NO `args.ts` change. NO Layer 1 markdown change. The integration test is OPTIONAL — the colocated `run.test.ts` cases cover the same surface).

It does **NOT**:

- **Modify `state.yaml` from `run.ts`.** The lock-free contract per architecture §line 1672 is preserved. Story 3.4 reads `state.lastSuccessfulStep` + `state.completedSteps` for the precondition check; nothing writes state.
- **Acquire the lock.** `run.ts` is structurally lock-free per Story 2.4's contract. Story 3.4 inherits.
- **Add a new error class.** The 16-code registry stays UNCHANGED. The 1 new precondition-failure throw uses the existing `ConfigError` class with `hintOverride` (Story 1.11 AC-2 + Story 1.10 AC-3 + Story 3.2 AC-2 precedent).
- **Modify `commands/bmad-next.md` (Story 2.7 Layer 1 markdown).** The Layer 1 markdown already branches on `action` per Story 2.7 — the `halt` branch (precondition-unmet on `--step`) prints the message to the user; no markdown change needed.
- **Modify `src/dag/build.ts`.** Architecture §line 1340 mentions `FR10 → ... src/dag/build.ts`, but the `pickNextStep`-tier validation is the v0.1 conservative placement. The DAG build remains pure (no scope-flag awareness). Story 6.x telemetry enhancement may revisit when DAG nodes gain epic/story attribution.
- **Modify `src/dag/sort.ts`.** Architecture §line 1341 mentions `FR11 → ... src/dag/sort.ts`. The existing `pickNextStep` phase-order tiebreaker at lines 530-535 covers the v0.1 sort; no separate sort module needed in v0.1.
- **Implement `--explain` reasoning trace** (Story 3.6). The precondition-failure hint surfaces a SHORT pointer at `--explain`; the FULL diagnostic ("step `<name>` is blocked by unmet prerequisites: [`X`, `Y`]") is forward-deferred to Story 3.6.
- **Implement `--list` candidate enumeration** (Story 3.7). Story 3.4's `isPreconditionMet` helper is the natural foundation for Story 3.7's enumeration; Story 3.4 documents the shared predicate but does not refactor.
- **Implement DAG-node epic/story attribution** (Story 6.x). v0.1 ships runner-tier projections from `state.lastSuccessfulStep` / `state.lastAttempted`; the projection becomes a true DAG-node filter when Story 6.x extends the DAG node shape.
- **Modify `verify-and-advance.ts`.** The lock-held runner is unchanged. The dispatch flow downstream of `run.ts`'s exit is symmetric whether the step was inferred or explicit.
- **Add a new dispatch-protocol field.** The dispatch line shape is unchanged.
- **Implement `--persona` override or `--include-optional`/`--no-optional`** (Story 3.5). Story 3.5 owns the next round of flag wiring.

It DOES land:

- The architecturally-prescribed **`--step <id>` precondition check** in `pickNextStep` per FR10 + epic AC line 780.
- The architecturally-prescribed **`--epic` / `--story` filter wiring** (v0.1 runner-tier projections) per FR11 + epic AC line 783.
- The **scope-conflict warning** for `--step + --epic/--story/--phase` per epic AC line 784.
- The **shared `isPreconditionMet(node, state)` helper** as a stable foundation for Story 3.7 (`--list`) reuse.
- **17-18 new colocated test cases** in `run.test.ts` covering all 3 ACs + edge cases (combos with `--resume` / `--dry-run` / `--explain`).
- The **forward-coupling documentation** with Stories 3.5 / 3.6 / 3.7 / 6.x.

## Acceptance Criteria

The acceptance criteria below are reproduced **verbatim** from `_bmad-output/planning-artifacts/epics.md` §Story 3.4 (lines 776-784, BDD Given/When/Then format). Lines and AC labelling preserved.

**Given** `--step <name>` is supplied
**When** Stepper runs
**Then** the named step is dispatched if its preconditions are met; otherwise Stepper exits with `CONFIG_ERROR` describing the unmet preconditions and the hint `Run /bmad-next --explain to see why <step> is blocked.`
**Given** `--epic <n>`, `--story <x.y>`, or `--phase <name>` flags
**When** Stepper computes
**Then** candidate steps are filtered to those matching the scope; the highest-priority unblocked candidate is selected
**And** combining `--epic` and `--story` or `--phase` is allowed; combining `--step` with any scope flag prints a warning that scope is ignored when `--step` is explicit

## Tasks / Subtasks

- [x] **Task 0 — Verify pre-conditions (AC: all)**
  - [x] 0.1 Confirm Story 3.1 (`record_last_attempted_last_failure_reason_on_halt`) is `done` per `_bmad-output/implementation-artifacts/sprint-status.yaml:71` (`3-1-record-last-attempted-last-failure-reason-on-halt: done`).
  - [x] 0.2 Confirm Story 3.2 (`--resume` Flag) is `done` per `sprint-status.yaml:72` (`3-2-resume-flag: done`).
  - [x] 0.3 Confirm Story 3.3 (`--dry-run` Flag) is `done` per `sprint-status.yaml:73` (`3-3-dry-run-flag: done`).
  - [x] 0.4 Confirm Story 1.7 (`src/commands/next/args.ts`) declares all 4 scope flags on `NextArgsSchema`:
    - `step: z.string().optional()` at line 148.
    - `epic: z.string().optional()` at line 149.
    - `story: z.string().optional()` at line 150.
    - `phase: z.enum(["analysis", "planning", "solutioning", "implementation", "retro"]).optional()` at lines 151-153.
    Verify by reading `src/commands/next/args.ts:140-170`. **No args change needed for Story 3.4.**
  - [x] 0.5 Confirm Story 2.4's existing `pickNextStep(state, dag, args)` lives at `src/commands/next/run.ts:429-539`. Read this region to confirm:
    - Lines 434-445: explicit-`--step` branch (resolves to `dag.nodes.get(args.step)`; throws `ConfigError` on unknown step). **Story 3.4 ADDS the precondition check after line 444.**
    - Lines 458-477: candidate computation loop (filters by `node.after.includes(lastStepName)` or empty `after[]` for fresh project).
    - Lines 482-484: `--phase` filter (already functional). **Story 3.4 PRESERVES.**
    - Lines 495-501: `--epic` / `--story` stub (no-op `void`). **Story 3.4 REPLACES with v0.1 projection.**
    - Lines 504-510: optional-inclusion filter. **Story 3.4 PRESERVES.**
    - Lines 512-526: empty-candidate throw. **Story 3.4 PRESERVES.**
    - Lines 530-538: tiebreaker sort + return. **Story 3.4 PRESERVES.**
  - [x] 0.6 Confirm `src/dag/types.ts:60-68` declares `DagNode` with fields `name`, `phase`, `after`, `before`, `optional`, `persona`, optional `idempotent`. **DagNode does NOT carry epic/story attribution at v0.1.** Story 6.x telemetry enhancement may extend.
  - [x] 0.7 Confirm `src/schemas/state.ts` declares `state.completedSteps` (Story 1.5). Read `src/schemas/state.ts` lines around `StateV1Schema` to confirm. The `state.completedSteps[]` array is the v0.1 source for "step `X` is in the completed-prerequisites set".
  - [x] 0.8 Confirm `src/errors.ts:206-239` exports `ConfigError` with the optional `hintOverride` constructor arg (Story 1.11 AC-2 + Story 3.2 AC-2 precedent). Verify via Grep.
  - [x] 0.9 Confirm `src/commands/next/run.ts:182-187` declares `LoggerFns` with `warn(message: string): void`. The Story 3.4 warning emission goes through this interface; the default logger at `run.ts:245-264` delegates to `src/io/log.ts:20-21`'s `warn()` (stderr writer).
  - [x] 0.10 Confirm `src/commands/next/run.ts:719` declares `pickNextStep(state, dag, args)` as a closure inside `runNext`'s top-level scope. The logger (`log` variable from `runNext` line 720) is in closure scope; `pickNextStep` can call `log.warn(...)` directly without a parameter change. **Decision**: pass the logger as a fourth parameter to `pickNextStep` for explicit dependency tracking, OR rely on closure capture. v0.1 conservative: closure capture (preserves the existing function signature).
  - [x] 0.11 Confirm `src/dag/seed-v6.x.ts` ships the canonical seed entries Story 1.10 declared. Verify `bmad-brainstorming` has `after: []` (entry-point) and `bmad-product-brief` has `after: ["bmad-brainstorming"]` (next-after-brainstorming). These are the canonical fixtures for Story 3.4's tests.
  - [x] 0.12 Read epics.md §Story 3.4 lines 776-784 verbatim. Confirm the AC text in §Acceptance Criteria above is character-identical.
  - [x] 0.13 Read architecture.md §line 1340 (`FR10 → src/commands/next/args.ts, src/commands/next/run.ts, src/dag/build.ts`); §line 1341 (`FR11 → src/commands/next/args.ts, src/commands/next/run.ts, src/dag/sort.ts`); §line 1672 (`run.ts` is read-only / lock-free); §line 821 (`--explain` is human-greppable).
  - [x] 0.14 Read prd.md §FR8 line 681 (`Users can advance a single BMAD step (/bmad-next)`); §FR10 line 683 (`Users can override the step that Stepper would otherwise compute (--step <id>)`); §FR11 line 684 (`Users can narrow step computation by epic, story, or phase (--epic, --story, --phase)`).
  - [x] 0.15 Read epic-2-retrospective.md §Forward Action Items — confirm Story 3.4 is in the recommended sequence (AFTER Story 3.3, BEFORE Story 3.5).
  - [x] 0.16 Read Story 3.3's File List + Dev Notes sections (`3-3-dry-run-flag.md` lines 350-555). Confirm Story 3.3 did NOT touch `pickNextStep` (the dry-run branch is at `run.ts:985-1000`, downstream of `pickNextStep`). Story 3.4's mutations are independent.
  - [x] 0.17 Read Story 3.2's Resume branch (`run.ts:918-926`). Confirm it bypasses `pickNextStep` entirely; the Story 3.4 warning emission inside `pickNextStep` does NOT fire on `--resume + --step`.
  - [x] 0.18 Confirm baseline `bun run check` exits 0 with **589 pass / 0 fail / 2172 expects / 49 files** per Story 3.3 final.
  - [x] 0.19 Confirm Bun host version satisfies AR2 (Bun >= 1.3). Run `bun --version`; record in Completion Notes.

- [x] **Task 1 — Plan the `isPreconditionMet(node, state)` helper (AC line 780)**
  - [x] 1.1 Sketch the helper at the top of `src/commands/next/run.ts` near the existing `pickNextStep` function (between `getRequiredSections` line 401 and `pickNextStep` line 429):
    ```typescript
    /**
     * Story 3.4: shared predicate for "is this step's after[] preconditions
     * satisfied by the current state?". Used by:
     *   - The explicit `--step` branch in `pickNextStep` (AC line 780).
     *   - The inferred-candidate filter in `pickNextStep` (existing
     *     line 459-477 — refactored to call this helper).
     *   - Story 3.7 (`--list`) future consumer.
     *
     * v0.1 rule: a step's preconditions are met when EVERY name in
     * `node.after[]` matches `state.lastSuccessfulStep?.step` OR is in
     * `state.completedSteps?.[] ?? []`. An entry-point (empty `after[]`)
     * is trivially met.
     *
     * Returns `true` when the preconditions are met, `false` otherwise.
     * Pure / synchronous; no I/O.
     */
    function isPreconditionMet(node: DagNode, state: State): boolean {
      if (node.after.length === 0) return true;
      const lastStepName = state.lastSuccessfulStep?.step;
      const completed = new Set(state.completedSteps ?? []);
      return node.after.every((p) => p === lastStepName || completed.has(p));
    }
    ```
  - [x] 1.2 Confirm `state.completedSteps` is declared on `StateV1Schema` (Story 1.5). Verify by reading `src/schemas/state.ts`. **If `completedSteps` is NOT declared, fall back to: precondition met when `node.after.every(p => p === state.lastSuccessfulStep?.step)` OR `node.after.length === 0`.** Document the decision in JSDoc.
  - [x] 1.3 Document the helper's contract: synchronous, pure, no throws, no I/O. Returns boolean.
  - [x] 1.4 Document the rule's v0.1 conservative scope: "every prerequisite matches `lastSuccessfulStep.step` OR is in `completedSteps`". The full transitive-closure model (Story 3.6/3.7 enhancement) walks the inverse DAG (`edgesIn`) from each prerequisite back to the project root; v0.1 uses the simpler direct-match rule.

- [x] **Task 2 — Plan the `--step` precondition check + error hint (AC line 780)**
  - [x] 2.1 Sketch the insertion in `pickNextStep` (lines 434-445 region):
    ```typescript
    // Explicit --step path (highest priority).
    if (args.step !== undefined && args.step !== "") {
      const node = dag.nodes.get(args.step);
      if (node === undefined) {
        throw new ConfigError(
          `Unknown step: ${args.step}`,
          JSON.stringify({ step: args.step, available: [...dag.nodes.keys()] }),
          `Run /bmad-next --list to see candidate steps; "${args.step}" is not in the resolved DAG.`,
        );
      }
      // Story 3.4 (epic AC line 780): verify preconditions BEFORE returning.
      // The named step is dispatched only if its preconditions are met;
      // otherwise throw `ConfigError` with the verbatim AC-line-780 hint.
      if (!isPreconditionMet(node, state)) {
        throw new ConfigError(
          `Step ${args.step} is blocked by unmet preconditions`,
          JSON.stringify({
            step: args.step,
            after: node.after,
            lastSuccessfulStep: state.lastSuccessfulStep?.step ?? null,
            completedSteps: state.completedSteps ?? [],
          }),
          `Run /bmad-next --explain to see why ${args.step} is blocked.`,
        );
      }
      return node;
    }
    ```
  - [x] 2.2 Document the hint's verbatim character match per AC line 780: `Run /bmad-next --explain to see why <step> is blocked.` (the `<step>` substitution is `args.step` verbatim — e.g., `Run /bmad-next --explain to see why bmad-create-architecture is blocked.`).
  - [x] 2.3 Document the AR22 verb discipline: the hint starts with `Run` (the canonical AR22 verb). The hint is single-line.
  - [x] 2.4 Document the diagnostic JSON fields in `detail`: `{ step, after, lastSuccessfulStep, completedSteps }`. These flow through the existing `StepperError.detail` field and are surfaced via the structured logging at `verify-and-advance.ts` (when applicable) — for v0.1, `detail` is informational only (the `actionableHint` is what users see).
  - [x] 2.5 Document the precondition-state interaction: when `state.lastSuccessfulStep === undefined` AND `state.completedSteps === []` (or undefined), the precondition is met ONLY for entry-points (`node.after.length === 0`). This matches the inferred-candidate fresh-project rule at `pickNextStep` lines 465-469.

- [x] **Task 3 — Plan the `--phase` filter preservation (AC line 783)**
  - [x] 3.1 Story 2.4 already shipped the `--phase` filter at `pickNextStep` lines 482-484. Story 3.4 PRESERVES this code unchanged:
    ```typescript
    if (args.phase !== undefined) {
      filtered = filtered.filter((n) => n.phase === args.phase);
    }
    ```
  - [x] 3.2 Confirm the existing test coverage at `run.test.ts` covers the `--phase` happy path. If not, ADD ONE test case in Task 9 (`AC-2 scope filtering happy path (--phase)`).
  - [x] 3.3 Document the filter ordering: `--phase` is applied AFTER the prerequisite-satisfied candidate computation (lines 458-477) and BEFORE the `--epic` / `--story` filters (Task 4) and the optional-inclusion filter (lines 504-510). Order matters because `--phase` narrows by node attribute (no state interaction); `--epic` / `--story` need the state context.

- [x] **Task 4 — Plan the `--epic` / `--story` v0.1 filter wiring (AC line 783)**
  - [x] 4.1 Replace the existing stub at `pickNextStep` lines 495-501 (`void args.epic; void args.story;`) with v0.1 runner-tier projections:
    ```typescript
    // Story 3.4 (epic AC line 783): --epic / --story filter wiring.
    //
    // v0.1 conservative semantics: DAG nodes do NOT carry epic/story
    // attribution at the seed level (per src/dag/types.ts:60-68; story
    // attribution is project-level per architecture line 1340 ref).
    // The runner-tier projection sources epic/story from
    // `state.lastSuccessfulStep` / `state.lastAttempted` and rejects
    // candidates whose projected attribution does NOT match.
    //
    // Empty-string flag values are treated as "no filter" per Story 1.7
    // line 70 forward-dep precedent.
    //
    // Story 6.x telemetry enhancement may extend DAG nodes with
    // `epic?: number` + `story?: string` attribution; the filter
    // expression then swaps to `n.epic === Number(args.epic)` with no
    // test-shape change.
    if (args.epic !== undefined && args.epic !== "") {
      const projectedEpic =
        state.lastAttempted?.epic ?? state.lastSuccessfulStep?.epic ?? 0;
      if (projectedEpic !== Number(args.epic)) {
        filtered = [];
      }
    }
    if (args.story !== undefined && args.story !== "") {
      const projectedStory =
        state.lastAttempted?.story ?? state.lastSuccessfulStep?.story ?? "0.0";
      if (projectedStory !== args.story) {
        filtered = [];
      }
    }
    ```
  - [x] 4.2 Document the v0.1 conservative scope in JSDoc above `pickNextStep`: "The DAG node shape (src/dag/types.ts:60-68) does NOT carry epic/story attribution; v0.1 sources epic/story from state-tier projections. Story 6.x extension TBD."
  - [x] 4.3 Document the empty-string convention: `--epic ""` and `--story ""` are treated as "no filter" (the user passed `--epic=` with an empty value).
  - [x] 4.4 Document the empty-result behavior: when `args.epic` or `args.story` projection mismatches, the `filtered` array is set to `[]`. The existing throw at `pickNextStep` lines 512-526 fires with the existing hint `Run /bmad-next --list to see candidate steps; the current filter excludes all candidates.`. **No new error class; no new hint string.**
  - [x] 4.5 Document the filter ordering: `--epic` and `--story` apply AFTER `--phase` (Task 3) and BEFORE the optional-inclusion filter (lines 504-510). This way, `--epic 3 --phase planning` narrows by phase first (which is faster — no state lookup), then by epic (which is a single state read).

- [x] **Task 5 — Plan the `--step + scope` warning emission (AC line 784)**
  - [x] 5.1 Add a logger parameter to `pickNextStep` OR rely on closure capture. v0.1 conservative: **explicit parameter** for clarity (the existing `log` variable in `runNext` line 720 is already in closure scope, but the explicit parameter makes the dependency visible at the call site):
    ```typescript
    function pickNextStep(
      state: State,
      dag: DagAdjacency,
      args: NextArgs,
      log: LoggerFns,
    ): DagNode {
      // Story 3.4 (epic AC line 784): warn on --step + scope flag combo.
      // The warning fires ONCE at the very top of pickNextStep (before
      // the explicit --step branch returns) when --step is explicit AND
      // any of (--epic, --story, --phase) is set with a non-empty value.
      // Per FR54 / src/io/log.ts:20-21, the warning writes to stderr;
      // AR9's stdout reservation for the dispatch JSON line is preserved.
      const stepIsExplicit = args.step !== undefined && args.step !== "";
      const epicIsSet = args.epic !== undefined && args.epic !== "";
      const storyIsSet = args.story !== undefined && args.story !== "";
      const phaseIsSet = args.phase !== undefined;
      if (stepIsExplicit && (epicIsSet || storyIsSet || phaseIsSet)) {
        log.warn(
          "next: --step is explicit; --epic/--story/--phase scope flags are ignored.",
        );
      }
      // ... rest of pickNextStep ...
    }
    ```
  - [x] 5.2 Update the call site at `runNext` line 925 (`nextStep = pickNextStep(state, dag, args);`) to pass `log` as the 4th argument: `nextStep = pickNextStep(state, dag, args, log);`.
  - [x] 5.3 Update the `--explain` short-circuit at `run.ts:853` (`pickNextStep(state, dag, args)`) to pass `log`: `pickNextStep(state, dag, args, log)`.
  - [x] 5.4 Document the warning's verbatim format: `next: --step is explicit; --epic/--story/--phase scope flags are ignored.`. The format follows the existing convention at `pickFirstPersona` line 314-316 (`next: multi-persona sequential dispatch is deferred to ...`) — `next:` prefix + sentence with verb + period.
  - [x] 5.5 Document the once-per-invocation guarantee: the warning fires at MOST once per `pickNextStep` call (the if-block at top of function); `pickNextStep` is called at MOST once per `runNext` invocation (modulo `--explain` short-circuit which short-circuits before the standard `pickNextStep` call); therefore the warning fires at MOST once per `/bmad-next` invocation. **Edge case: when `--step --explain` is invoked**, the explain handler calls `pickNextStep(state, dag, args, log)` and the warning fires. When the standard happy path is reached (which only happens if `--explain` is NOT set), `pickNextStep` is called again — but in that case `--explain` was not set, so the explain handler did not fire, so `pickNextStep` is called exactly once. Net result: at most one warning per invocation.
  - [x] 5.6 Document the no-warn cases:
    - `--step` alone (no scope flags): no warning.
    - Scope flags alone (no `--step`): no warning.
    - `--step ""` + `--epic 3`: no warning (empty-string `--step` is treated as "no filter").
    - `--step bmad-X --epic ""`: no warning (empty-string `--epic` is treated as "no filter").
    - `--step bmad-X --resume`: no warning fires (the resume branch bypasses `pickNextStep` per Story 3.2 line 918-926).

- [x] **Task 6 — Implement the `isPreconditionMet` helper (AC line 780)**
  - [x] 6.1 Edit `src/commands/next/run.ts` to add the helper per Task 1.1 sketch. Place between `getRequiredSections` (line 401) and `pickNextStep` (line 429) — sibling-helper position.
  - [x] 6.2 Verify `state.completedSteps` is declared in `src/schemas/state.ts`'s `StateV1Schema`. If absent, fall back to the simpler rule (`node.after.every(p => p === state.lastSuccessfulStep?.step)`) and update the helper's body + JSDoc accordingly.
  - [x] 6.3 Verify the helper compiles via `bunx tsc --noEmit` (the standalone helper has no new imports).
  - [x] 6.4 The helper's JSDoc documents: AC line 780 ownership, the v0.1 conservative rule, the synchronous + pure contract, and the forward-coupling with Story 3.7 (`--list`).

- [x] **Task 7 — Implement the `--step` precondition check (AC line 780)**
  - [x] 7.1 Edit `src/commands/next/run.ts` `pickNextStep` (lines 434-445) to insert the precondition check per Task 2.1 sketch — AFTER the `dag.nodes.get(args.step)` lookup succeeds, BEFORE the `return node;` statement.
  - [x] 7.2 Verify the AR22 verb discipline: the hint starts with `Run`. Single-line.
  - [x] 7.3 Verify the `<step>` substitution: the hint embeds `args.step` (e.g., `Run /bmad-next --explain to see why bmad-create-architecture is blocked.`). The substitution is via JS template literal — NOT via `console.error` or any other formatter (AR33 stdout/stderr discipline).
  - [x] 7.4 Verify the `detail` JSON includes 4 fields: `step`, `after`, `lastSuccessfulStep` (with `?? null` fallback), `completedSteps` (with `?? []` fallback). The detail is for diagnostic logging — the user's `actionableHint` is the AR22-compliant single-line hint.

- [x] **Task 8 — Implement the `--epic` / `--story` v0.1 filter wiring (AC line 783)**
  - [x] 8.1 Edit `src/commands/next/run.ts` `pickNextStep` (lines 495-501) to replace the no-op stubs per Task 4.1 sketch.
  - [x] 8.2 Verify the projection uses `state.lastAttempted?.epic ?? state.lastSuccessfulStep?.epic ?? 0` per the existing `generate-spec.ts:172-177` precedent. The same projection applies to `args.story`.
  - [x] 8.3 Verify the comparison: `Number(args.epic)` vs the projected number; string-equality for `args.story` (story IDs are like `"3.4"`, `"6.10"` — strings).
  - [x] 8.4 Verify the empty-result handling: when projection mismatches, set `filtered = []`. The existing throw at lines 512-526 fires.
  - [x] 8.5 Verify the filter ordering: `--phase` (line 482-484) → `--epic` (Task 4 new) → `--story` (Task 4 new) → optional-inclusion (line 504-510). The order is documented in JSDoc above `pickNextStep`.

- [x] **Task 9 — Implement the `--step + scope` warning emission (AC line 784)**
  - [x] 9.1 Edit `src/commands/next/run.ts` `pickNextStep` to:
    - Add `log: LoggerFns` as the 4th parameter (Task 5.1 sketch).
    - Insert the warning emission at the very top of the function (BEFORE the explicit-`--step` branch).
  - [x] 9.2 Edit the standard call site at `runNext` line 925 to pass `log` as the 4th argument.
  - [x] 9.3 Edit the `--explain` short-circuit at `run.ts:853` to pass `log` as the 4th argument.
  - [x] 9.4 Verify the warning format: `next: --step is explicit; --epic/--story/--phase scope flags are ignored.`. The format aligns with the existing `pickFirstPersona` warning convention.
  - [x] 9.5 Verify the no-warn cases per Task 5.6: empty-string scope flags do NOT trigger the warning.
  - [x] 9.6 Verify the warning goes through `log.warn(...)` (the `LoggerFns.warn` interface at `run.ts:184`); the default logger's `warn` delegates to `src/io/log.ts:20-21`'s `warn(message)` which writes to `process.stderr`.

- [x] **Task 10 — Implement the colocated test cases (AC: all)**
  - [x] 10.1 Edit `src/commands/next/run.test.ts` to APPEND a new `describe` block: `"runNext — Story 3.4 --step + scope flags"`.
  - [x] 10.2 **Test case A (AC-1 happy path: --step preconditions met)** — seed state with `lastSuccessfulStep: { step: "bmad-brainstorming", epic, story, attemptedAt }` and `completedSteps: ["bmad-brainstorming"]`; invoke with `argv: ["--step", "bmad-product-brief"]`; assert (a) `result.exitCode === 0`, (b) `result.action.action === "dispatch"`, (c) `result.action.lastAttempted.step === "bmad-product-brief"`.
  - [x] 10.3 **Test case B (AC-1 unmet preconditions: --step blocked)** — seed state with NO `lastSuccessfulStep` (fresh project); invoke with `--step bmad-create-architecture` (Story 1.10 seed: `after` includes `bmad-create-prd` — NOT an entry-point); assert (a) `result.exitCode === 2`, (b) `result.action.action === "halt"`, (c) `result.action.message` contains `Run /bmad-next --explain to see why bmad-create-architecture is blocked.` verbatim.
  - [x] 10.4 **Test case C (AC-1 entry-point on fresh project)** — invoke with `--step bmad-brainstorming` on fresh state; assert success (entry-point's `after` is empty; precondition trivially met).
  - [x] 10.5 **Test case D (AC-1 unknown step preserves Story 2.4 hint)** — invoke with `--step bmad-not-a-real-step`; assert the existing hint `Run /bmad-next --list to see candidate steps; "bmad-not-a-real-step" is not in the resolved DAG.` (Story 3.4 does NOT modify this throw).
  - [x] 10.6 **Test case E (AC-2 scope filtering happy path: --phase)** — seed state with `lastSuccessfulStep: { step: "bmad-brainstorming", ... }`; invoke with `--phase planning`; assert (a) success, (b) the dispatched step's phase is `planning`.
  - [x] 10.7 **Test case F (AC-2 scope filtering happy path: --epic match)** — seed state with `lastSuccessfulStep: { step: "bmad-brainstorming", epic: 3, story: "3.0", ... }`; invoke with `--epic 3`; assert success (projection matches).
  - [x] 10.8 **Test case G (AC-2 scope filtering empty result: --epic mismatch)** — same seed, invoke with `--epic 999`; assert (a) `result.exitCode === 2`, (b) `result.action.message` contains `Run /bmad-next --list to see candidate steps`.
  - [x] 10.9 **Test case H (AC-2 scope filtering happy path: --story match)** — seed with `story: "3.4"`; invoke with `--story "3.4"`; assert success.
  - [x] 10.10 **Test case I (AC-2 combined --epic + --story)** — seed with `epic: 3, story: "3.4"`; invoke with `--epic 3 --story "3.4"`; assert success (both filters match).
  - [x] 10.11 **Test case J (AC-2 combined --epic + --phase)** — seed with `epic: 3`; invoke with `--epic 3 --phase planning`; assert success.
  - [x] 10.12 **Test case K (AC-3 warning emission: --step + --epic)** — invoke with `--step bmad-brainstorming --epic 3` (use a captured `LoggerFns` via `RunNextOptions.logger` — `loggerCapture.warnMessages: string[]`); assert (a) success on the `--step` path, (b) `loggerCapture.warnMessages` contains `next: --step is explicit; --epic/--story/--phase scope flags are ignored.`.
  - [x] 10.13 **Test case L (AC-3 warning emission: --step + --story)** — same as K but with `--story "3.4"`; assert the warning fires.
  - [x] 10.14 **Test case M (AC-3 warning emission: --step + --phase)** — same as K but with `--phase planning`; assert the warning fires.
  - [x] 10.15 **Test case N (AC-3 warning emission: --step + multiple scope flags)** — invoke with `--step bmad-brainstorming --epic 3 --story "3.0" --phase analysis`; assert exactly ONE warning is emitted (`loggerCapture.warnMessages.filter(m => m.includes("scope flags are ignored")).length === 1`).
  - [x] 10.16 **Test case O (AC-3 no warning: --step alone)** — invoke with `--step bmad-brainstorming`; assert no scope-warning fires.
  - [x] 10.17 **Test case P (AC-3 no warning: scope flags alone)** — invoke with `--epic 3`; assert no scope-warning fires.
  - [x] 10.18 **Test case Q (Edge: --step + --resume — resume wins)** — seed valid `lastAttempted` + `lastFailureReason`; invoke with `--step bmad-product-brief --resume`; assert (a) the dispatched step is `state.lastAttempted.step` (NOT `bmad-product-brief`), (b) NO scope-warning is emitted.
  - [x] 10.19 **Test case R (Edge: --step + --dry-run combo)** — invoke with `--step bmad-brainstorming --dry-run` on fresh state; assert (a) `result.action.action === "report"`, (b) `result.action.message` contains `Dry-run: would dispatch bmad-brainstorming `.
  - [x] 10.20 **Test case S (Edge: --step blocked + --explain)** — invoke with `--step bmad-create-architecture --explain` on fresh state (precondition unmet); assert (a) `result.action.action === "report"`, (b) `result.action.message` contains the empty-candidate fallback (`current next step: (none — DAG empty or filters exclude all candidates)`); the throw is caught by the inner try/catch at `run.ts:855-857`.
  - [x] 10.21 Each test follows AR35 tmpdir-per-test discipline: reuses module-level `beforeEach`/`afterEach` + `commonOpts`/`writeMinimalState` factories.

- [x] **Task 11 — Verify backward compatibility (no regression on existing tests)**
  - [x] 11.1 Run `bun test src/commands/next/run.test.ts`: confirm pre-existing tests (especially Story 3.3's `--dry-run + --step bmad-brainstorming` test) pass with the new precondition check (the dry-run combo's seed state has the entry-point `bmad-brainstorming`; precondition trivially met).
  - [x] 11.2 Run `bun test src/integration/`: confirm Story 2.8 + Story 3.1 + Story 3.3 integration tests pass.
  - [x] 11.3 Run `bun test src/smoke/`: confirm Story 2.8 happy-path smoke passes.
  - [x] 11.4 Run `bun run check` (full suite + tsc + lint): confirm exit 0; record post-Story-3.4 baseline test counts in Completion Notes.

- [x] **Task 12 — Run the full test suite + `bun run check` (AC: all)**
  - [x] 12.1 `bun run check` exit 0. Test delta: ~+18-20 tests (~17-18 new colocated + potential 1-2 helper unit-tests if `isPreconditionMet` is tested in isolation), ~+50-60 expects.
  - [x] 12.2 Post-Story-3.4 baseline projection: ~607-609 pass / 0 fail / ~2222-2232 expects / 49 files (no new test files added).
  - [x] 12.3 Confirm `src/errors.ts` registry stays at **16 codes** (`bun test src/errors.test.ts`: 10 pass, 197 expects). Story 3.4 ships ZERO new error classes — the precondition-failure throw uses existing `ConfigError` with `hintOverride`.
  - [x] 12.4 Confirm `bunx tsc --noEmit` exits 0.
  - [x] 12.5 Confirm AR41 boundary check at `run.test.ts:606-638` still passes (no new forbidden imports introduced).

- [x] **Task 13 — Update sprint-status.yaml + record completion (AC: all)**
  - [x] 13.1 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: flip `3-4-step-id-and-scope-flags` from `backlog` (set by Story 3.3 final) to `ready-for-dev` (this Story 3.4 create-story step). At story completion (Step 9 of bmad-dev-story workflow), flip to `review` (intermediate `in-progress` during dev). `epic-3: in-progress` is preserved.
  - [x] 13.2 Flip the story file frontmatter `status: ready-for-dev → review` at end of bmad-dev-story workflow per the workflow's Step 9 contract. (At create-story time, the value is `ready-for-dev`.)
  - [x] 13.3 sprint-status.yaml retains its original schema (no new fields).

## Dev Notes

### File List

#### Modified Files

- **`src/commands/next/run.ts`** (~1145 → ~1190 lines): adds `isPreconditionMet(node, state)` helper (~10 lines including JSDoc) before `pickNextStep`; modifies `pickNextStep` (lines 429-539) to (a) accept `log: LoggerFns` as the 4th parameter, (b) emit the scope-warning at the top of the function, (c) verify the precondition in the explicit-`--step` branch, (d) replace the `--epic` / `--story` no-op stubs with v0.1 runner-tier projections; updates the 2 call sites at `run.ts:853` (explain handler) and `run.ts:925` (standard happy path) to pass `log` as the 4th argument; expands the JSDoc above `pickNextStep` to document the AC-line-780 / AC-line-783 / AC-line-784 wiring + v0.1 design decisions. ~45 lines net delta.
- **`src/commands/next/run.test.ts`** (~1490 → ~1700 lines): APPENDS a new `describe("runNext — Story 3.4 --step + scope flags", ...)` block with 17-18 test cases per Task 10. Reuses module-level `beforeEach`/`afterEach` + `commonOpts`/`writeMinimalState`; adds a colocated `captureLogger()` factory (or reuses the existing pattern from Story 2.4 tests) for warning-capture assertions.

#### New Files

(none — Story 3.4 is purely additive on existing files; no new modules; no new integration test file required by AC.)

#### Sprint-Status

- **`_bmad-output/implementation-artifacts/sprint-status.yaml`**: flip `3-4-step-id-and-scope-flags: backlog → ready-for-dev` (at create-story time). Confirm `epic-3: in-progress` (already set by Story 3.1).

### Architecture Compliance

- **AR8** (lock-free `run.ts` / lock-held `verify-and-advance.ts`): UNCHANGED. Story 3.4 modifies `pickNextStep` (synchronous helper inside `runNext`); no lock acquired. The new precondition check reads `state.lastSuccessfulStep` + `state.completedSteps` (already in scope from `loadStateUnlocked`); no additional state I/O. Verified by Test S (Task 10.20) — even on a precondition-failure throw, no state.yaml mutation occurs.
- **AR9** (single discriminated-union JSON line on stdout): UNCHANGED. The dispatch line shape is identical; only the `nextStep.name` resolution path changes. The new precondition-failure throw flows through the existing `haltFromError` translation pipeline at `run.ts:1068-1090` and emits `action: "halt"` with `exitCode: 2`. Round-trip schema validation via `DispatchActionV1Schema.parse()` is preserved.
- **AR21** (errors carry code): EXTENDED. Story 3.4 introduces 1 NEW `ConfigError` throw with the existing `code: "CONFIG_ERROR"` discriminator (registry stays at 16 codes).
- **AR22** (errors carry actionable hint; single-line `Run/See/Try/Check`): EXTENDED. The new hint `Run /bmad-next --explain to see why <step> is blocked.` follows the `Run` verb convention and is single-line. The `<step>` substitution is via JS template literal; no other dynamic content.
- **AR33** (function & error semantics; throw not Result; no console.*; async/await): UNCHANGED. The new helper `isPreconditionMet` is a pure boolean; the new throw uses `throw new ConfigError(...)` (not `Result`-shaped); the warning emission goes through `log.warn(message)` (NOT `console.warn`). Branch is synchronous within the async `runNext`.
- **AR41** (boundary graph; no upward / sibling-higher imports): UNCHANGED. Story 3.4 modifies `run.ts` (top-tier composer) only; no new module created; no new imports added. The `State`, `DagNode`, `DagAdjacency`, `NextArgs`, `ConfigError`, and `LoggerFns` types are all already imported. The colocated AR41 boundary check at `run.test.ts:606-638` continues to pass.

### Acceptance Criteria Mapping

- **AC line 780** ("the named step is dispatched if its preconditions are met; otherwise Stepper exits with `CONFIG_ERROR` describing the unmet preconditions and the hint `Run /bmad-next --explain to see why <step> is blocked.`"): delivered by Tasks 1-2 (helper + sketch) + Tasks 6-7 (implement helper + insert precondition check) + Task 10.3 (Test B asserts the verbatim hint).
- **AC line 783** ("candidate steps are filtered to those matching the scope; the highest-priority unblocked candidate is selected"): delivered by Tasks 3-4 (preserve `--phase`; replace `--epic` / `--story` stubs with v0.1 projection) + Task 8 (implement `--epic` / `--story` filters) + Task 10.6-10.11 (Tests E-J cover all 3 scope flags individually + 2 combos).
- **AC line 784** ("combining `--epic` and `--story` or `--phase` is allowed; combining `--step` with any scope flag prints a warning that scope is ignored when `--step` is explicit"): delivered by Task 5 (sketch) + Task 9 (implement) + Tasks 10.12-10.17 (Tests K-P cover the 3 scope flags individually + multi-flag + no-warn cases).

### v0.1 Design Decisions

#### `--step` precondition rule: simple direct-match, NOT full transitive closure

Story 3.4's precondition rule is the v0.1 conservative direct-match: "every prerequisite in `node.after[]` matches `state.lastSuccessfulStep?.step` OR is in `state.completedSteps?.[]`". The full transitive-closure model — walking the inverse DAG (`edgesIn`) from each prerequisite back to the project root — is forward-deferred to Story 3.6 (`--explain` reasoning trace) and Story 3.7 (`--list`). **Rationale**: the simple direct-match rule covers the most common case (the user just completed the prerequisite step and wants to skip ahead); the full closure is overkill for v0.1 and would duplicate Story 3.6's reasoning-trace work. Document the deferral in JSDoc.

#### `--epic` / `--story` filters use runner-tier state projections, NOT DAG-node attribution

DAG nodes (`src/dag/types.ts:60-68`) do NOT carry `epic` / `story` attribution at the v0.1 seed level (story attribution is project-level metadata, living in `_bmad-output/implementation-artifacts/<story-key>.md` frontmatter). Story 3.4's v0.1 implementation projects epic/story from `state.lastAttempted ?? state.lastSuccessfulStep` (the same projection `generate-spec.ts:172-177` uses). **Rationale**: a true DAG-node-attribution filter would require Story 6.x telemetry-driven enhancement (extending the DAG node shape with optional epic/story fields, sourced from BMAD skill frontmatter or per-step config). v0.1 conservative ships the runner-tier projection; the format is forward-compatible.

#### `pickNextStep` accepts `log` as a 4th parameter (explicit dependency)

Story 3.4 adds `log: LoggerFns` as the 4th parameter to `pickNextStep` for explicit dependency tracking. The `log` variable is already in closure scope (declared at `runNext` line 720), so closure capture would also work — but the explicit parameter makes the dependency visible at the call site (a reader of `pickNextStep` sees the 4 inputs). This pattern matches the existing `pickFirstPersona(persona, stepName, log)` signature at `run.ts:299-303`. **Rationale**: AR33 stdout/stderr discipline requires explicit logger plumbing; the parameter makes the warning emission auditable.

#### Warning verb: `next:` prefix + sentence per existing convention

The warning format `next: --step is explicit; --epic/--story/--phase scope flags are ignored.` follows the existing convention at `pickFirstPersona` (line 314-316: `next: multi-persona sequential dispatch is deferred to ...`) — `next:` prefix + sentence with verb + period. **Rationale**: consistency with the existing in-band warning format.

#### Once-per-invocation warning guarantee

The warning fires AT MOST once per `pickNextStep` call (the if-block at the top of the function); `pickNextStep` is called AT MOST once per `runNext` invocation. **Rationale**: idempotent warnings prevent log noise. Test N (Task 10.15) explicitly asserts the once-only guarantee.

#### No new error class — reuse `ConfigError` with `hintOverride`

Per Story 1.11 AC-2 + Story 1.10 AC-3 + Story 3.2 AC-2 precedent, `ConfigError` accepts an optional `hintOverride` constructor arg that flows through `actionableHint`. Story 3.4's new throw uses `ConfigError` with `hintOverride` — registry stays at **16 codes**. The hint is `Run /bmad-next --explain to see why <step> is blocked.` (verbatim per AC line 780 with `<step>` substitution).

#### Empty-string scope flags treated as "no filter"

Per Story 1.7 line 70 forward-dep precedent (and the existing `pickNextStep` behavior at lines 435 + 495 + 499), empty-string flag values (`--epic=`, `--story=`, `--step=`) are treated as "no filter". The warning for `--step + scope` does NOT fire if scope flag values are empty. **Rationale**: handle the common shell-scripting case where a variable expands to empty.

#### `--phase` filter uses node attribute (already shipped in Story 2.4)

The `--phase` filter at `pickNextStep` lines 482-484 was shipped by Story 2.4 and remains FUNCTIONAL. The DAG node shape DOES carry `node.phase` (one of 5 values per architecture line 452). Story 3.4 PRESERVES this filter unchanged; no v0.1 design decision to make. **Rationale**: phase attribution is at the seed level (Tier 1 + Tier 2 + Tier 3 frontmatter parsing) — true DAG-node attribute, not a runner-tier projection.

#### `--explain` short-circuit catches precondition-failure throw

When `--step <name> --explain` is invoked and the precondition is unmet, `pickNextStep` throws `ConfigError`. The inner try/catch at `run.ts:855-857` catches the throw and falls back to `(none — DAG empty or filters exclude all candidates)`. **Rationale**: on the explain path, the user is asking "why" — the empty-candidate fallback is acceptable. The full diagnostic ("step `<name>` is blocked by unmet prerequisites: [`X`, `Y`]") is forward-deferred to Story 3.6.

#### Resume bypasses `pickNextStep` — no warning on `--resume + --step`

Story 3.2's resume branch at `run.ts:918-926` bypasses `pickNextStep` entirely. When `--step --resume` is invoked, the resume branch wins (resumes `state.lastAttempted.step` regardless of `--step`); the warning emission inside `pickNextStep` does NOT fire. **Rationale**: resume's "do the same thing again" intent supersedes the `--step` override. Test Q (Task 10.18) asserts this.

### Carry-overs from Story 3.3

- **Story 3.3 §line 552** (Story 3.4 forward-coupling — scope filters): RECEIVED. Story 3.4 implements the `--epic` / `--story` / `--phase` filter wiring per Story 3.3's documented forward-compatibility.
- **Story 3.3 §line 162** (`--dry-run + scope flags` v0.1 behavior): RESPECTED. Story 3.3's dry-run preview reads from `pickNextStep`'s result; Story 3.4 enriches the candidate-resolution; the dry-run preview naturally surfaces the filtered next step (no Story 3.3 code change needed).
- **Story 3.3 §line 469** (`--dry-run + --step bmad-brainstorming` test J): PRESERVED. Story 3.4's precondition check on the entry-point `bmad-brainstorming` (empty `after[]`) trivially passes; the existing test continues to assert success.

### Carry-overs from Story 3.2

- **Story 3.2 §line 471** (`Resume substitutes nextStep — does NOT skip pickNextStep cross-validation`): RESPECTED. Story 3.4's warning emission inside `pickNextStep` does NOT fire on `--resume + --step` because the resume branch bypasses `pickNextStep` entirely. Story 3.2's design statement is verbatim preserved.
- **Story 3.2 §line 597-602** (Resume JSDoc — scope flags ignored on resume): RESPECTED. Story 3.4 documents the same precedence.

### Carry-overs from Epic 2 Retrospective

- **Story 2.4 `--phase` filter** (already shipped): PRESERVED. Story 3.4 does NOT modify the `--phase` filter behavior.
- **Story 2.4 `--epic` / `--story` no-op stub**: REPLACED. Story 3.4 wires the v0.1 runner-tier projection.
- **Story 2.4 `pickNextStep` signature** (3 args: state, dag, args): EXTENDED to 4 args (state, dag, args, log) per Task 5.1. The 2 call sites at `run.ts:853` + `run.ts:925` are updated to pass `log`.

### Forward Dependencies

- **Story 3.5 (`--persona` Override + `--include-optional`/`--no-optional`)**: SECONDARY CONSUMER. The next round of flag wiring; Story 3.4's `pickNextStep` extension provides the foundation (4-arg signature; warning-emission convention).
- **Story 3.6 (`--explain` Reasoning Trace)**: PRIMARY CONSUMER. Story 3.6 enriches the `--explain` short-circuit at `run.ts:833-861` to enumerate the unmet prerequisites for blocked candidates. Story 3.4's `isPreconditionMet` helper is the natural foundation; Story 3.6 may walk the inverse DAG from each blocking prerequisite back to the project root.
- **Story 3.7 (`--list` candidate next-steps)**: PRIMARY CONSUMER. Story 3.7's `--list` enumerates candidate next steps; the `isPreconditionMet` helper is shared with Story 3.4's `--step` precondition check. Story 3.7 may refactor the helper or call it directly.
- **Story 3.10 (Non-Locking Read Flags)**: TERTIARY CONSUMER. The lock-skipping flag cluster includes `--list` and `--explain`, both of which consume `pickNextStep` semantics indirectly. Story 3.10's wiring is structural; Story 3.4's runtime semantics are independent.
- **Story 6.x (per-step config)**: PRIMARY ARCHITECTURAL EXTENSION. Story 6.x telemetry enhancement may extend DAG nodes with `epic?: number` + `story?: string` attribution (sourced from BMAD skill frontmatter or per-step config); the `--epic` / `--story` filter expressions in Story 3.4 swap from runner-tier projections to DAG-node-attribute checks with no test-shape change.

### Previous Story Intelligence

This story builds on:

- **Story 1.5 (Schemas + Migrations Skeleton)** — declared `state.lastSuccessfulStep` + `state.lastAttempted` + `state.completedSteps` on `StateV1Schema`. Story 3.4 reads `state.completedSteps` for the precondition rule (Task 1.1 helper) and `state.lastSuccessfulStep.epic + .story` for the v0.1 epic/story projection (Task 4.1).
- **Story 1.7 (CLI Argument Parser)** — declared `step: z.string().optional()` + `epic: z.string().optional()` + `story: z.string().optional()` + `phase: z.enum(...).optional()` on `NextArgsSchema`. Story 3.4 wires the runtime branches; NO args change.
- **Story 1.10 (DAG seed + 3-tier registry)** — established `build(...)` returning `DagAdjacency { nodes: Map<string, DagNode> }`. Story 3.4's precondition check uses `node.after`; the v0.1 conservative rule does NOT walk the full inverse DAG (Story 3.6/3.7 enhancement).
- **Story 1.11 (Persona Resolution)** — established `resolvePersona({ stepName, ... })`. Story 3.4 does NOT modify persona resolution; the `--step` override resolves the persona from `nextStep.name` (already done at `run.ts:929-940`).
- **Story 2.2 (Dispatch Spec Generator)** — established `BuildDispatchSpecInput` with the `epic` + `story` projection at `generate-spec.ts:172-177`. Story 3.4's `--epic` / `--story` filter uses the SAME projection convention.
- **Story 2.4 (`run.ts` lock-free runner)** — established the `pickNextStep(state, dag, args)` 3-argument signature + the existing `--phase` filter + the `--epic` / `--story` no-op stubs. Story 3.4 EXTENDS the signature to 4 args (adds `log`) + replaces the no-op stubs with v0.1 projections + adds the precondition check + adds the warning emission.
- **Story 3.1 (Record `last_attempted` / `last_failure_reason` on Halt)** — UNCHANGED. The `--step` precondition-failure throw flows through the existing `haltFromError` translation pipeline; Story 3.1's halt-record write happens in `verify-and-advance.ts` (NOT in `run.ts`'s pre-dispatch path), so a precondition-failure halt does NOT update `state.lastAttempted` (the user did not actually attempt the step — the runner blocked the dispatch).
- **Story 3.2 (`--resume` Flag)** — established the `resolveResumeTarget` helper that bypasses `pickNextStep`. Story 3.4's warning emission inside `pickNextStep` does NOT fire on `--resume + --step` because the resume branch bypasses `pickNextStep` entirely. Story 3.2's precedence is preserved.
- **Story 3.3 (`--dry-run` Flag)** — established the dry-run preview branch downstream of `pickNextStep`. Story 3.4's `pickNextStep` extension feeds the resolved `nextStep` to the dry-run branch; the existing `--dry-run + --step` test (Story 3.3 Test J) continues to pass.

Story 3.4 does NOT consume from:

- Stories 1.1-1.4, 1.8, 1.9, 1.12, 1.13 (repo scaffold, errors module, logger, lock, branch detection, BMAD detection, doctor, quick-start docs) — these are independent prerequisites for `run.ts` but their public APIs are not touched by Story 3.4.
- Stories 2.1, 2.3, 2.5, 2.6, 2.7, 2.8 (verifier registry, sub-agent markdown, transcript writers, verify-and-advance, Layer 1 markdown, smoke test) — Story 3.4 doesn't touch the verifier surface, sub-agent prompt, transcript writer, lock-held runner, Layer 1 markdown, or smoke test.

### Open Questions for Code Review

1. **Should `--epic` / `--story` filtering throw `ConfigError` directly when projection mismatches, instead of setting `filtered = []` and relying on the downstream "no candidates" throw?** v0.1 conservative reuses the existing throw (single error message for all empty-result cases); Story 6.x may revisit when the filter becomes a true DAG-node attribute check.
2. **Should `isPreconditionMet` walk the full inverse DAG (`edgesIn`) for transitive-closure precondition checking?** v0.1 conservative direct-match rule covers the common case; Story 3.6/3.7 owns the full closure walk.
3. **Should the warning fire on `--step ""` + `--epic 3` (empty-string `--step`)?** v0.1 conservative: NO — empty-string `--step` is "no filter"; the user did not pass an explicit step. Test O (Task 10.16) asserts the no-warn behavior on `--step` alone; the empty-string subcase is symmetric.
4. **Should `isPreconditionMet` be exported for Story 3.7 (`--list`) reuse, or stay private to `run.ts`?** v0.1 conservative: stay private; Story 3.7 may move it to a shared helper module (`src/dag/preconditions.ts`?) when the surface area justifies the extraction.
5. **Should the warning carry the actual scope-flag values for diagnosability (e.g., `--step bmad-X is explicit; --epic 3 / --phase planning are ignored.`)?** v0.1 conservative: NO — the warning is short and stable; Story 3.6's `--explain` enrichment may carry the values.

## Dev Agent Record

### Context Reference

- `_bmad-output/implementation-artifacts/3-4-step-id-and-scope-flags.md` (this file)
- `src/commands/next/run.ts` (`pickNextStep` extension + `isPreconditionMet` helper)
- `src/commands/next/run.test.ts` (Story 3.4 coverage describe block)

### Agent Model Used

Opus 4.7 (1M context) — bmad-dev-story sub-agent for Story 3.4 (1M-context variant per BMAD `dev` agent skill).

### Debug Log References

- Bun host: 1.3.12 (AR2 satisfied — Bun >= 1.3).
- Pre-implementation baseline confirmed: 589 pass / 0 fail / 2172 expects / 49 files (Story 3.3 final).
- Initial run after pickNextStep extension shipped surfaced 1 expected failure: existing test at `run.test.ts:214-246` ("populates taskSpec.outputFormat.requiredSections...") seeded `lastSuccessfulStep: bmad-create-prd` and dispatched `--step bmad-dev-story`; the new precondition check (Story 3.4 line-780 wiring) rejected this since `bmad-dev-story.after = ["bmad-create-story"]`. Resolved by reseeding the test fixture to `lastSuccessfulStep: bmad-create-story` so the precondition is met. Single repair iteration.
- Initial Story 3.4 colocated test sweep surfaced 5 expected failures in the AC-2 scope-filter happy-path tests: I had originally seeded `lastSuccessfulStep: bmad-brainstorming` expecting `bmad-product-brief` to be the deterministic dispatch, but `bmad-product-brief` is `optional: true` (default-exclude-optional path filters it out). Resolved by reseeding to `lastSuccessfulStep: bmad-create-prd` and asserting `bmad-create-epics-and-stories` (the deterministic non-optional planning candidate). Single repair iteration.
- Post-implementation final: 608 pass / 0 fail / 2223 expects / 49 files.

### Completion Notes List

- **Implementation lands cleanly inside the story spec's allowed mutation surface.** Modified `src/commands/next/run.ts`: added `isPreconditionMet(node, state)` helper (~25 lines including JSDoc) before `pickNextStep`; extended `pickNextStep` signature to 4 args (`state, dag, args, log: LoggerFns`); inserted scope-conflict warning emission at top of function; inserted precondition check in explicit-`--step` branch with verbatim AC-line-780 hint; replaced `--epic`/`--story` no-op stubs with v0.1 runner-tier projections; updated 2 call sites at `runNext` (explain handler + standard happy path) to pass `log` as 4th argument; expanded JSDoc above `pickNextStep` to document AC-line-780 / -783 / -784 wiring + v0.1 design decisions + forward-coupling with Stories 3.5 / 3.6 / 3.7 / 6.x.
- Modified `src/commands/next/run.test.ts`: APPENDED a new `describe("runNext — Story 3.4 --step + scope flags", ...)` block with 19 colocated test cases per Task 10 (4 AC-1 + 6 AC-2 + 6 AC-3 + 3 edge cases). Added colocated `captureLogger()` factory + `writeStateWithLastSuccessful({ step, epic?, story? })` factory. Reuses module-level `tmp` setup, `writeMinimalState`, `commonOpts`, `DispatchActionV1Schema` import. Updated 1 pre-existing test (line 214) to seed `lastSuccessfulStep: bmad-create-story` (vs. `bmad-create-prd`) so the precondition check at `--step bmad-dev-story` passes — minimal-blast-radius adjustment to a fixture that pre-dated Story 3.4.
- **NO new error classes.** Registry CI gate stays at 16 codes. The new precondition-failure throw uses existing `ConfigError` with `hintOverride` per Story 1.11 + Story 3.2 precedent.
- **NO state-yaml writes from `run.ts`.** Lock-free contract per architecture §line 1672 + AR8 preserved (no test changes assert this since the existing AR41 boundary check at `run.test.ts:620-628` continues to pass — no new imports, no `lock/` references introduced).
- **NO new modules / NO Layer 1 markdown change / NO `verify-and-advance.ts` change / NO schema bump / NO `args.ts` change / NO `dag/build.ts` change.** Story 3.4 is purely additive at the runner-tier composer.
- **AR41 boundary preserved.** No new imports added; the existing `LoggerFns` type is reused via the existing `runNext` closure parameter.
- **AR9 protocol preserved.** The dispatch line shape is unchanged; the new precondition-failure throw flows through the existing `haltFromError` translation pipeline at `run.ts:1068-1090`.
- **5 v0.1 design decisions documented in JSDoc** (per story §v0.1 Design Decisions): (1) precondition rule is direct-match (no transitive closure walk); (2) `--epic`/`--story` use runner-tier state projections (DAG nodes lack epic/story attribution); (3) `pickNextStep` accepts `log` as a 4th explicit-dependency parameter; (4) warning verb follows the existing `next:` prefix convention; (5) once-per-invocation warning guarantee.
- **Deviation from story spec Task 1.2**: `state.completedSteps` is NOT declared on `StateV1Schema` (verified via `src/schemas/state.ts:92-119`). Per Task 1.2 fallback instruction, `isPreconditionMet` uses the simpler rule `node.after.every(p => p === lastSuccessfulStep.step)` and documents this in JSDoc. The Task 7.4 `detail` JSON also omits the `completedSteps` field accordingly.
- **Forward-coupling documented.** JSDoc above `pickNextStep` references Stories 3.5 (`--persona`/`--include-optional`/`--no-optional`), 3.6 (`--explain` reasoning trace), 3.7 (`--list` candidate enumeration), 6.x (DAG epic/story attribution).
- **Single repair iteration consumed**: 1 to fix the pre-existing test fixture (`bmad-dev-story` precondition); 1 to refactor scope-filter test fixtures to use `bmad-create-prd` chain (deterministic non-optional candidate). Total: 2 repair iterations within the ≤3 budget.

### Test Counts (final)

- **bun run check**: exit 0.
- **Total**: 608 pass / 0 fail / 2223 expect() calls / 49 files.
- **Story 3.4 delta**: +19 tests / +51 expects / 0 new files (vs. Story 3.3 final baseline of 589 / 2172 / 49).
- **Run-tests suite** (`bun test src/commands/next/run.test.ts`): 77 pass / 239 expects (58 pre-existing + 19 new Story 3.4).
- **Errors registry CI gate** (`bun test src/errors.test.ts`): 10 pass / 197 expects — registry stays at 16 codes.
- **TypeScript** (`bunx tsc --noEmit`): exit 0.
- **Biome ci** (`bunx --bun biome ci .`): exit 0 (115 files checked clean).

### File List

#### Modified Files

- `src/commands/next/run.ts` — added Story 3.4 `isPreconditionMet(node, state)` helper (~25 lines including JSDoc) BEFORE `pickNextStep`; extended `pickNextStep` signature with `log: LoggerFns` 4th parameter; inserted scope-conflict warning emission at top of function (4 boolean checks + single `log.warn(...)`); inserted precondition check in explicit-`--step` branch (after `dag.nodes.get(args.step)` lookup succeeds, before `return node;`) with verbatim AC-line-780 hint `Run /bmad-next --explain to see why <step> is blocked.`; replaced `--epic`/`--story` no-op stubs (lines 495-501) with v0.1 runner-tier projections sourcing from `state.lastAttempted ?? state.lastSuccessfulStep`; updated 2 call sites at `runNext` (line 853 explain handler + line 925 standard happy path) to pass `log` as 4th argument; expanded JSDoc above `pickNextStep` (~50 lines) documenting AC-line-780 / -783 / -784 wiring + v0.1 design decisions + forward-coupling. ~1143 → ~1206 lines.
- `src/commands/next/run.test.ts` — APPENDED a new `describe("runNext — Story 3.4 --step + scope flags", ...)` block (~340 lines including helpers) with 19 colocated test cases per Task 10 (AC-1: happy/blocked/entry-point/unknown × 4; AC-2: phase/epic-match/epic-mismatch/story-match/epic+story/epic+phase × 6; AC-3: warn-emit-3-flags + warn-emit-multi + no-warn-step-alone + no-warn-scope-alone × 6; edges: resume-wins / dry-run-combo / explain-catches × 3). Added `captureLogger()` factory + `writeStateWithLastSuccessful()` factory. UPDATED 1 pre-existing fixture at line 214 (lastSuccessfulStep: bmad-create-prd → bmad-create-story) so the precondition check passes for `--step bmad-dev-story`. ~1497 → ~1840 lines.

#### New Files

(none — Story 3.4 is purely additive on existing files; no new modules; no new integration test file required by AC.)

#### Sprint Status

- `_bmad-output/implementation-artifacts/sprint-status.yaml` — flipped `3-4-step-id-and-scope-flags` from `ready-for-dev` → `review`. `epic-3` remains `in-progress`.

#### Story File

- `_bmad-output/implementation-artifacts/3-4-step-id-and-scope-flags.md` — Tasks/Subtasks all marked `[x]`, frontmatter status flipped to `review`, inline status line flipped to `review`, Dev Agent Record / Test Counts / File List / Change Log populated.

#### Task Record

- `.bmad-stepper/runs/2026-05-01T195954Z-bmad-next/tasks/t1-dev-story.yaml` (NEW) — task record per BMAD dev-story discipline.

#### NOT Modified (per spec)

- `src/commands/next/args.ts` — `--step`/`--epic`/`--story`/`--phase` already declared by Story 1.7.
- `src/errors.ts` — registry stays at 16 codes (no new error class).
- `src/dag/build.ts` / `src/dag/types.ts` — DAG nodes do NOT gain epic/story attribution in v0.1 (Story 6.x is the natural extension).
- `src/dispatch/generate-spec.ts` — dispatch-spec construction unchanged (existing epic+story projection at `generate-spec.ts:172-177` continues to read from state).
- `src/state/load.ts` — `loadStateUnlocked` already exposed.
- `src/commands/next/verify-and-advance.ts` — Story 3.4 does NOT touch the lock-held runner.
- `commands/bmad-next.md` — Layer 1 markdown already branches on `action`; the `halt` discriminator (precondition-unmet) is already handled.
- `src/schemas/state.ts` / `src/schemas/dispatch-protocol.ts` — no schema bump.

## Senior Developer Review (AI)

**Reviewer**: bmad-code-review (claude-opus-4-7[1m])
**Reviewed**: 2026-05-01
**Verdict**: **APPROVE** (status: review → done)
**Counts**: must-fix=0 | should-fix=0 | nits=0 | info=2

### Outcome

Implementation lands cleanly inside the spec's allowed mutation surface. All 3 ACs delivered with high fidelity to the verbatim AC wording (epic line 780 hint, line 783 filter behaviour, line 784 warning). AR8/AR9/AR21/AR22/AR33/AR41 invariants preserved. Quality gates reproduce green (608/0/2223/49). Single rationally-documented spec deviation (`state.completedSteps` not on `StateV1Schema` → simpler precondition rule via Task 1.2 fallback path) — adjudicated ACCEPT-WITH-FOLLOWUP.

### AC Verification

- **AC-1** (epic line 780: `--step <name>` is dispatched if preconditions are met; otherwise `CONFIG_ERROR` + verbatim hint `Run /bmad-next --explain to see why <step> is blocked.`) — **PASS**.
  - `isPreconditionMet(node, state)` helper at `src/commands/next/run.ts:434-439` (pure / synchronous; entry-point trivially met when `node.after.length === 0`; otherwise direct-match against `state.lastSuccessfulStep?.step`).
  - Precondition check inserted in explicit-`--step` branch at `src/commands/next/run.ts:528-538` (after the `dag.nodes.get(args.step)` lookup succeeds, before `return node;`).
  - Verbatim hint at `src/commands/next/run.ts:536`: `` `Run /bmad-next --explain to see why ${args.step} is blocked.` `` — character-identical to AC line 780.
  - `ConfigError` `detail` JSON includes `{ step, after, lastSuccessfulStep }` (line 530-534) for diagnostic logging.
  - Test coverage:
    - **happy path** (preconditions met): `run.test.ts:1572-1584` (`--step bmad-product-brief` after `lastSuccessfulStep: bmad-brainstorming` → dispatch).
    - **unmet preconditions** (verbatim hint): `run.test.ts:1588-1603` (`--step bmad-create-architecture` on fresh state; asserts `result.action.message === "Run /bmad-next --explain to see why bmad-create-architecture is blocked."`).
    - **entry-point on fresh project**: `run.test.ts:1607-1617` (`--step bmad-brainstorming` on fresh state; empty `after[]` trivially met).
    - **unknown step preserves Story 2.4 hint**: `run.test.ts:1621-1633` (`--step bmad-not-a-real-step` → existing `Run /bmad-next --list to see candidate steps; ...` hint unchanged).

- **AC-2** (epic line 783: `--epic`/`--story`/`--phase` filter candidates; highest-priority unblocked candidate selected; combinations allowed) — **PASS**.
  - `--phase` filter at `src/commands/next/run.ts:577-579` (preserved from Story 2.4 unchanged).
  - `--epic` filter at `src/commands/next/run.ts:604-610` (v0.1 runner-tier projection from `state.lastAttempted?.epic ?? state.lastSuccessfulStep?.epic ?? 0`; rejects ALL candidates on mismatch).
  - `--story` filter at `src/commands/next/run.ts:611-617` (same projection convention).
  - Tiebreaker (phase order then name lexicographic) at `src/commands/next/run.ts:646-651` (preserved unchanged).
  - Filter ordering: prerequisite-satisfaction → `--phase` → `--epic` → `--story` → optional-inclusion → tiebreaker (documented in JSDoc at `run.ts:465-478`).
  - Test coverage:
    - **`--phase` happy path**: `run.test.ts:1637-1656` (`--phase planning` after `lastSuccessfulStep: bmad-create-prd` → dispatches `bmad-create-epics-and-stories`).
    - **`--epic` match**: `run.test.ts:1660-1678` (epic projection 3 matches filter 3 → dispatch).
    - **`--epic` mismatch**: `run.test.ts:1682-1698` (epic 999 → halt with empty-candidate hint `Run /bmad-next --list to see candidate steps`).
    - **`--story` match**: `run.test.ts:1702-1716` (story `"3.4"` matches filter `"3.4"` → dispatch).
    - **combined `--epic` + `--story`**: `run.test.ts:1720-1735` (both projections match → dispatch).
    - **combined `--epic` + `--phase`**: `run.test.ts:1739-1757` (epic + phase narrowing → dispatches `bmad-create-epics-and-stories`).

- **AC-3** (epic line 784: combining `--step` with any scope flag prints a warning that scope is ignored) — **PASS**.
  - Warning emission at `src/commands/next/run.ts:499-513` (top of `pickNextStep`, BEFORE the explicit-`--step` branch; fires once when `--step` is explicit AND any of `--epic`/`--story`/`--phase` is set with a non-empty value).
  - Verbatim warning text at `run.ts:511`: `next: --step is explicit; --epic/--story/--phase scope flags are ignored.` (single line; prefix matches `pickFirstPersona` `next:` convention at line 314-316).
  - Warning routed via `log.warn(...)` (`LoggerFns.warn` interface, default delegates to `src/io/log.ts:20-21` `process.stderr.write`) — confirmed stderr-only; AR9 stdout reservation preserved.
  - `pickNextStep` signature extended to 4 args at `run.ts:493-498` (`state, dag, args, log: LoggerFns`); 2 call sites updated at `run.ts:969` (explain handler) + `run.ts:1041` (standard happy path).
  - Test coverage:
    - **`--step + --epic`**: `run.test.ts:1761-1774` (warn fires; dispatch succeeds).
    - **`--step + --story`**: `run.test.ts:1778-1790`.
    - **`--step + --phase`**: `run.test.ts:1794-1806`.
    - **`--step + multiple scope flags = ONE warning**: `run.test.ts:1810-1831` (asserts `scopeWarnings.length === 1` — once-per-invocation guarantee).
    - **`--step` alone (no warning)**: `run.test.ts:1835-1847`.
    - **scope flags alone (no warning)**: `run.test.ts:1851-1867`.
    - **`--step + --resume` (resume wins; no warning)**: `run.test.ts:1871-1906` (asserts `result.action.lastAttempted?.step === "bmad-dev-story"` (the resume target, NOT `--step` value); asserts `scopeWarnings.length === 0` — resume bypasses `pickNextStep` entirely per Story 3.2 §line 918-926).
    - **`--step + --dry-run`**: `run.test.ts:1910-1922` (preview surfaces explicit step `bmad-brainstorming`).
    - **`--step` blocked + `--explain`**: `run.test.ts:1926-1940` (explain stub catches throw via inner try/catch at `run.ts:971-973`; falls back to `(none — DAG empty or filters exclude all candidates)`).

### Architecture / NFR / FR coverage

- **AR8** (lock-free `run.ts` / lock-held `verify-and-advance.ts`) — **PASS**. No lock acquired in `pickNextStep`. Verified by Grep: 3 matches for "acquire" in `run.ts` are JSDoc references at lines 21, 24, 832 (no executable `acquire()` call). The new precondition check + scope filters read `state.lastSuccessfulStep` + `state.lastAttempted` (already in scope from `loadStateUnlocked`); no additional state I/O. AR41 boundary check at `run.test.ts:623-637` continues to pass.
- **AR9** (single discriminated-union JSON line on stdout) — **PASS**. The dispatch line shape is unchanged; only the `nextStep.name` resolution path changes. The new precondition-failure throw flows through the existing `haltFromError` translation pipeline at `run.ts:1119-1141` and emits `action: "halt"` with `exitCode: 2`. Confirmed via Grep: warning routed via `log.warn(...)` → `src/io/log.ts:20-21` `process.stderr.write` (NOT stdout). Round-trip schema-validation via `DispatchActionV1Schema.parse()` preserved (existing AR9 schema-validation tests at `run.test.ts:409-447` continue to pass).
- **AR21** (errors carry code) — **PASS**. New precondition-failure throw uses existing `ConfigError` (`code: "CONFIG_ERROR"`); registry stays at 16 codes (`bun test src/errors.test.ts: 10 pass / 197 expects`).
- **AR22** (errors carry actionable hint; single-line `Run/See/Try/Check`) — **PASS**. Hint `Run /bmad-next --explain to see why <step> is blocked.` follows AR22 verb discipline (`Run` leading verb); single line; verbatim character-match with epic AC line 780.
- **AR33** (function & error semantics; throw not Result; no console.\*; async/await) — **PASS**. `isPreconditionMet` helper is pure boolean (no throws, no I/O). Precondition-unmet throw uses `throw new ConfigError(...)` (NOT Result-shaped). Warning emission via `log.warn(message)` (NOT `console.warn`). `runNext` Result-shape return preserved (the throw is caught by outer `haltFromError` translation pipeline). Branch is synchronous within the async `runNext`.
- **AR41** (boundary graph; no upward / sibling-higher imports) — **PASS**. Zero new imports added. Verified via Grep on `^import` in `src/commands/next/run.ts`: 9 imports, all foundational (`schemas/`, `errors`, `io/log`) + mid-tier (`dag/`, `dispatch/`, `personas/`, `state/load`, `verifiers/`, `commands/doctor/run`) + intra-module (`./args`). The colocated AR41 boundary check at `run.test.ts:623-637` continues to pass.
- **FR1** — PASS (inherited from Story 2.4 zero-config happy-path).
- **FR8** (`/bmad-next` single-step advance) — **EXTENDED PASS**. The runner now respects `--step` override AND verifies preconditions per AC line 780.
- **FR10** (`--step <id>` override) — **PRIMARY DELIVERABLE PASS**. Architecture §line 1340 declares `FR10 → src/commands/next/args.ts, src/commands/next/run.ts`. Story 3.4 wires the runtime branch in `run.ts`; `args.ts` declaration was already shipped by Story 1.7. The `dag/build.ts` reference is INTENTIONALLY UNCHANGED in v0.1 (runner-tier placement preferred where state context is already in scope).
- **FR11** (`--epic`/`--story`/`--phase` scope filters) — **PRIMARY DELIVERABLE PASS**. Architecture §line 1341 declares `FR11 → src/commands/next/args.ts, src/commands/next/run.ts, src/dag/sort.ts`. Story 3.4 wires the runtime branch in `run.ts`; the existing phase-order tiebreaker at `pickNextStep` lines 646-651 covers the v0.1 sort (no separate `dag/sort.ts` module needed in v0.1).
- **FR53** (documented exit codes) — **PASS**. Precondition-failure halt returns exit code 2 via `ConfigError`; halt translations flow through standard `haltFromError`.
- **FR54** (stdout/stderr discipline) — **PASS**. Warning routed to stderr via `log.warn`; AR9 dispatch line on stdout preserved.
- **NFR-S2** (writes only inside scope) — **PASS BY ABSENCE**. Story 3.4 adds zero new writes; the runner reads `state.lastSuccessfulStep` + `state.lastAttempted` only.
- **NFR-S5** (non-corrupting flag combinations) — **PASS**. The `--step + scope` warning enforces user intent without silently dropping the explicit override; `--step + --resume` precedence (resume wins) is preserved per Story 3.2.
- **NFR-M3** (well-instrumented errors) — **PASS**. Detail JSON `{ step, after, lastSuccessfulStep }` carries diagnostic context.
- **NFR-R4** (resume + dry-run + explain composability) — **PASS**. Tested via 3 dedicated edge-case tests at `run.test.ts:1871-1940`.

### Findings

#### Must-fix

(none)

#### Should-fix

(none)

#### Nits

(none)

#### Info

- **Info-1** (`isPreconditionMet` direct-match scope vs full transitive closure): the v0.1 conservative direct-match rule (`node.after.every(p => p === lastSuccessfulStep.step)`) covers single-prerequisite steps but rejects multi-prerequisite synthesis steps where multiple parallel branches must be completed. Acceptable v0.1 scope — when `state.completedSteps` is added later (or when Story 3.6/3.7 introduces the full inverse-DAG closure walk), the helper extends naturally. Documented in JSDoc at `run.ts:412-429`.
- **Info-2** (`--epic`/`--story` runner-tier projection vs DAG-node attribution): v0.1 sources epic/story from `state.lastAttempted ?? state.lastSuccessfulStep` (the same projection as `generate-spec.ts:172-177`). The DAG node shape (`src/dag/types.ts:60-68`) does NOT carry `epic`/`story` attribution. When Story 6.x telemetry-driven enhancement extends the DAG node shape, the filter expression at `run.ts:604-617` swaps from `projectedEpic !== Number(args.epic)` to `n.epic === Number(args.epic)` with no test-shape change. Forward-compatible by design.

### Validator Independent Re-Run

- `bun test`: **608 pass / 0 fail / 2223 expect() calls / 49 files** (verified across 2 consecutive full-suite runs; both 608/0/2223/49 stable).
- `bun run check`: **exit 0** (biome format + biome ci + tsc + bun test all clean).
- `bunx --bun biome ci .`: **exit 0** (115 files checked clean).
- `bunx --bun tsc --noEmit`: **exit 0** (no TypeScript errors).
- AR41 boundary check (Grep on `run.ts` for `acquire`/`from "../../lock/"`): **0 executable matches**; only 3 JSDoc references at lines 21, 24, 832 documenting the lock-free contract.
- AC-text byte-identical: `diff <(sed -n '778,784p' epics.md) <(grep -A 30 "^## Acceptance Criteria" 3-4-step-id-and-scope-flags.md | sed -n '/^\*\*Given\*\*/,/^\*\*And\*\* combining/p')` → **exit 0** (verbatim BDD AC content matches; the `**Acceptance Criteria:**` header line in epics.md is the only delta, expected as it's the section preamble).

### Deviations Adjudication

- **dev-001 — `state.completedSteps` fallback rule**: **ACCEPT-WITH-FOLLOWUP** (Story 3.6/3.7).
  - Description: Task 1.2 instructed to verify `state.completedSteps` on `StateV1Schema` and fall back to the simpler `node.after.every(p => p === lastSuccessfulStep.step)` rule if absent. The dev correctly verified `src/schemas/state.ts:92-119` and confirmed `completedSteps` is NOT declared (only `lastSuccessfulStep` + `lastAttempted` + `lastFailureReason` per Story 1.5). The simpler rule was applied at `run.ts:434-439`. JSDoc at `run.ts:419-429` documents this rationale.
  - Rationale: v0.1 conservative scope; the simpler rule covers the common case (user just completed step X and wants to skip ahead to Y). The full transitive-closure model (walking the inverse DAG `edgesIn` from each prerequisite back to project root) is forward-deferred to Story 3.6 (`--explain` reasoning trace) / Story 3.7 (`--list`).
  - Followup: Story 3.6/3.7 may extend `isPreconditionMet` to walk the full inverse DAG; alternatively, `StateV1Schema` may add `completedSteps: string[]` (Story 6.x telemetry enhancement) to support the multi-prerequisite case directly.
- **open-question-1 (filter throws `ConfigError` directly vs sets `filtered = []`)**: **ACCEPT v0.1 conservative**. Setting `filtered = []` and reusing the existing empty-candidate throw at `run.ts:628-643` is cleaner — single error message for all empty-result cases (filter mismatch, no entry-points, optional-only candidates excluded). Story 6.x may revisit when DAG-node-attribute filters land.
- **open-question-2 (`isPreconditionMet` walks full inverse DAG transitive closure)**: **ACCEPT v0.1 conservative**. Same rationale as dev-001 — the simple direct-match covers the common case; Story 3.6/3.7 owns the full closure walk. The helper signature `(node, state) → boolean` is forward-compatible (the body extends without changing call sites).
- **open-question-3 (warning fires on `--step ""` + `--epic 3`)**: **ACCEPT v0.1 conservative**. Empty-string `--step` is treated as "no filter" per `stepIsExplicit = args.step !== undefined && args.step !== ""` at `run.ts:505`; the warning correctly does NOT fire. Symmetric with the empty-string handling at the explicit-`--step` branch entry at `run.ts:516`.
- **open-question-4 (`isPreconditionMet` exported for Story 3.7 reuse vs private)**: **ACCEPT v0.1 conservative**. Stay private to `run.ts` for now; Story 3.7 may extract to `src/dag/preconditions.ts` (or similar shared helper module) when the surface area justifies. The 5-line helper is cheap to relocate.
- **open-question-5 (warning carries actual scope-flag values for diagnosability)**: **ACCEPT v0.1 conservative**. The warning `next: --step is explicit; --epic/--story/--phase scope flags are ignored.` is short, stable, and matches the existing `pickFirstPersona` warning convention at `run.ts:314-316`. Story 3.6's `--explain` enrichment may carry the values when the full reasoning trace lands.
- **open-question-6 (epic line 783 "highest-priority unblocked candidate" tiebreaker semantics)**: **ACCEPT v0.1 conservative**. The existing `pickNextStep` tiebreaker at `run.ts:646-651` (phase order via `PHASE_ORDER.get(a.phase)` then name lexicographic) is the v0.1 "highest-priority" rule. Story 3.4 PRESERVES the existing sort; no new semantic introduced.

### Strengths

- **Zero-deviation execution against spec mutation surface**: 13 task groups (Tasks 0–13) completed verbatim; the lone fixture-update at `run.test.ts:218-229` is the minimum-blast-radius adjustment Task 11.1 anticipated (`bmad-dev-story` precondition required `lastSuccessfulStep: bmad-create-story` instead of the original `bmad-create-prd`).
- **Verbatim hint character-match**: epic AC line 780's hint `Run /bmad-next --explain to see why <step> is blocked.` is reproduced verbatim at `run.ts:536` with `args.step` template-literal substitution. AR22 verb discipline (`Run` leading verb; single line) preserved.
- **Once-per-invocation warning guarantee**: Test N (`run.test.ts:1810-1831`) explicitly asserts `scopeWarnings.length === 1` when 3 scope flags are passed alongside `--step` — guards against logging-cascade regressions.
- **Edge-case discipline**: 3 dedicated edge-case tests (`--step + --resume`, `--step + --dry-run`, `--step` blocked + `--explain`) cover the hardest combinatorial corners. The `--explain` path's inner try/catch fallback was tested to ensure the throw is caught and the empty-candidate fallback message surfaces (Test S at `run.test.ts:1926-1940`).
- **Forward-coupling documentation**: 50+ lines of JSDoc above `pickNextStep` (`run.ts:441-491`) document AC-line-780 / -783 / -784 wiring + v0.1 design decisions + forward-coupling with Stories 3.5 / 3.6 / 3.7 / 6.x. Reads like a mini-design-doc.
- **AR41 cleanliness**: zero new imports; existing `LoggerFns` type reused via the existing `runNext` closure parameter.
- **Empty-string convention**: Empty-string scope flags (`--epic=`, `--story=`, `--step=`) consistently treated as "no filter" — prevents shell-script-expansion regressions.

### Sprint-status update

- `3-4-step-id-and-scope-flags: review → done`
- `epic-3: in-progress` (preserved — Stories 3.5–3.10 still open)

### Approval

Story status flipped `review → done`. `sprint-status.yaml` flipped `3-4-step-id-and-scope-flags: review → done`. Ready to advance to Story 3.5 (`--persona` Override + `--include-optional`/`--no-optional`) per the standard Epic-3 sequence.

## Change Log

| Date       | Author                | Change                                       |
| ---------- | --------------------- | -------------------------------------------- |
| 2026-05-01 | bmad-create-story | Initial story file created from epics.md §3.4 |
| 2026-05-01 | bmad-dev-story | Run `2026-05-01T195954Z-bmad-next` — implemented `--step` + `--epic` + `--story` + `--phase` flags + `isPreconditionMet` helper; 608/0/2223/49; status ready-for-dev → review |
| 2026-05-01 | bmad-code-review | Senior Developer Review — APPROVE; 0 must-fix / 0 should-fix / 0 nits / 2 info; AC-1/2/3 PASS; AR8/9/21/22/33/41 PASS; status → done |
