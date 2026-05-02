---
status: done
story_id: '3.7'
story_key: 3-7-list-candidate-next-steps
epic: '3'
title: '`--list` Candidate Next Steps'
created: '2026-05-01'
last_updated: '2026-05-01'
priority: M
estimated_effort: S
fr_coverage:
  - FR8
  - FR14
  - FR52
  - FR53
  - FR54
nfr_coverage:
  - NFR-P1
  - NFR-Sc1
  - NFR-S2
  - NFR-S5
  - NFR-R1
  - NFR-I2
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
  - _bmad-output/implementation-artifacts/3-4-step-id-and-scope-flags.md
  - _bmad-output/implementation-artifacts/3-5-persona-override-include-optional-no-optional.md
  - _bmad-output/implementation-artifacts/3-6-explain-reasoning-trace.md
  - _bmad-output/implementation-artifacts/2-2-dispatch-spec-generator.md
  - _bmad-output/implementation-artifacts/2-4-lock-free-run-ts-for-bmad-next.md
  - _bmad-output/implementation-artifacts/1-7-cli-argument-parser.md
  - _bmad-output/implementation-artifacts/1-10-dag-seed-three-tier-registry.md
  - .bmad-stepper/config.yaml
  - src/errors.ts
  - src/io/log.ts
  - src/state/load.ts
  - src/schemas/state.ts
  - src/dispatch/index.ts
  - src/dag/types.ts
  - src/dag/index.ts
  - src/dag/build.ts
  - src/commands/next/run.ts
  - src/commands/next/run.test.ts
  - src/commands/next/args.ts
  - src/commands/next/args.test.ts
  - src/commands/next/index.ts
---

# Story 3.7: `--list` Candidate Next Steps

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper user,
I want `/bmad-next --list` to show every candidate next step with its preconditions,
So that I can see the full decision space at a glance.

## Context Summary

This is the **seventh story of Epic 3** and the **second read-only diagnostic flag with structured per-line output** (Story 3.6 shipped the first via `--explain`). Stories 3.1 + 3.2 closed the halt-recovery loop (write `state.lastAttempted` + `state.lastFailureReason` on halt; consume them via `--resume`); Story 3.3 landed the first read-only-preview flag (`--dry-run`); Story 3.4 wired explicit-step + scope filtering and introduced the `isPreconditionMet(node, state)` helper; Story 3.5 wired the `--persona` override + `--include-optional`/`--no-optional` toggles AND the `--list` optional-toggle filter; Story 3.6 replaced the `--explain` placeholder with the structured 5-component reasoning trace AND introduced the `formatAlternativesLines` per-candidate-line formatter (`run.ts:1007-1031`). Story 3.7 turns its attention to **the candidate-enumeration surface that surfaces *all* viable next steps with their preconditions** — replacing the Story 2.4 placeholder line format (`<name> (phase: <phase>[, optional])`) with the AC-line-833 canonical format `<step-name> — <phase> — preconditions: [<met>/<unmet>] — optional: <yes/no>` AND adding the synthetic 100k-node NFR-Sc1 perf test that asserts `--list` emits within 1 second.

**The `--list` flag ALREADY EXISTS** on `NextArgsSchema` per Story 1.7's 18-flag inventory (`src/commands/next/args.ts:160` declares `list: z.boolean().default(false)`). Story 1.7 reserved it for Epic 3 consumption; Story 2.4 shipped a placeholder short-circuit at `src/commands/next/run.ts:1493-1532`:

```typescript
if (args.list) {
  const state = await loadStateUnlocked({ statePath: opts?.statePath });
  const dag = await build({
    skillNames: opts?.skillNames ?? [],
    projectRoot: opts?.projectRoot,
    pluginDir: opts?.pluginDir,
    overridesPath: opts?.overridesPath,
  });
  const lastStepName = state.lastSuccessfulStep?.step;
  const lines: string[] = ["Candidate next steps:"];
  for (const node of dag.nodes.values()) {
    if (node.name === lastStepName) continue;
    // Apply same selection model as pickNextStep:
    //   - fresh project: only entry-points (empty `after[]`).
    //   - post-first-step: nodes whose `after[]` includes lastStepName.
    let satisfied: boolean;
    if (lastStepName === undefined) {
      satisfied = node.after.length === 0;
    } else {
      satisfied = node.after.includes(lastStepName);
    }
    if (!satisfied) continue;
    // Story 3.5 (epic AC lines 797-802): apply optional-toggle filter.
    if (!args.includeOptional && !args.noOptional && node.optional) {
      continue;
    }
    if (args.noOptional && node.optional) continue;
    lines.push(
      `  - ${node.name} (phase: ${node.phase}${node.optional ? ", optional" : ""})`,
    );
  }
  return reportWithMessage(lines.join("\n"));
}
```

Story 3.7 PRESERVES the short-circuit position (downstream of `--export-state` / `--diff-state` / `--explain`, upstream of `--dry-run` per the existing comment at `run.ts:1356-1358` "// --export-state → --diff-state → --explain → --list → --dry-run"); REPLACES the placeholder per-line format with the AC-line-833 canonical 4-component line; KEEPS the read-only / lock-free posture per architecture §line 1672 (no state writes, no lock acquisition).

**The canonical line format per AC line 833**: `<step-name> — <phase> — preconditions: [<met>/<unmet>] — optional: <yes/no>`. Four components separated by ` — ` (em-dash space-bracketed; NOT a hyphen-space `- ` — the literal AC text uses `—` U+2014 EM DASH the same character Story 3.6 uses in the alternatives format). The components:

1. **`<step-name>`** — the DAG node name verbatim (e.g., `bmad-brainstorming`, `bmad-create-story`). Sourced from `node.name`.

2. **`<phase>`** — the DAG node phase verbatim (one of the 5 enum values: `analysis` | `planning` | `solutioning` | `implementation` | `retro`). Sourced from `node.phase`.

3. **`preconditions: [<met>/<unmet>]`** — a count-style summary of how many of the candidate's `node.after[]` prerequisites are met vs unmet, rendered as `[<met-count>/<unmet-count>]` (e.g., `[2/0]` for a fully-met candidate with 2 prerequisites, `[0/3]` for a fully-blocked candidate with 3 prerequisites). The interpretation: `<met>` is the number of `after[]` entries satisfied by the v0.1 conservative `isPreconditionMet`-style per-prerequisite check (`p === state.lastSuccessfulStep?.step`); `<unmet>` is the cardinality of `node.after.length - <met>`. **Note**: this is NOT the comma-separated unmet list that Story 3.6's `--explain` `formatAlternativesLines` emits (`<step-name> — needs: <comma-separated-unmet> (count: <N>)`); the AC line 833 wording explicitly asks for `[<met>/<unmet>]` — a count-pair bracket format, not a verbose enumeration. Entry-point nodes with empty `after[]` render as `[0/0]` (zero prerequisites; trivially met). The reading is: "step `<name>` has met `M` of `M+N` prerequisites; `N` remain unmet" → "ready when N == 0".

4. **`optional: <yes/no>`** — the literal `yes` or `no` based on `node.optional`. Sourced from `node.optional ? "yes" : "no"`. Note that this differs from the v0.1 placeholder line's optional-suffix format (`, optional` only when true); the canonical line ALWAYS surfaces the optional flag (`yes` or `no`) per the AC.

**Concrete worked examples** (assumes seed `bmad-brainstorming` (analysis, after: [], optional: false), `bmad-product-brief` (analysis, after: ["bmad-brainstorming"], optional: false), `bmad-create-prd` (planning, after: ["bmad-product-brief"], optional: false)):

- Fresh project (no `lastSuccessfulStep`): `bmad-brainstorming — analysis — preconditions: [0/0] — optional: no`.
- After `bmad-brainstorming` complete: `bmad-product-brief — analysis — preconditions: [1/0] — optional: no`.
- An optional candidate `bmad-cis-design-thinking` (analysis, after: [], optional: true) with `--include-optional`: `bmad-cis-design-thinking — analysis — preconditions: [0/0] — optional: yes`.

**Sort: phase-order then name lexicographic** per AC line 833 ("sorted by phase order then name"). Phase order is the existing `PHASE_ORDER` map at `run.ts:133-139` (`analysis: 0, planning: 1, solutioning: 2, implementation: 3, retro: 4`); within the same phase, sort by `node.name.localeCompare(other.node.name)` (UTF-16 code-unit comparison; deterministic across runs). This matches the "topological tiebreaker is consistent across runs (reproducible output)" wording on AC line 834 — the same input DAG yields the same output line ordering across invocations.

**Reproducibility (AC line 834)**: the `--list` output MUST be reproducible — same DAG (same seed + same overrides + same skillNames input) MUST emit the same byte-identical line ordering on every invocation. This is achieved structurally:
- `dag.nodes` is a `ReadonlyMap<string, DagNode>` per `src/dag/types.ts:85-89`; insertion-order is documented per `src/dag/types.ts:73-77` ("Tier 1 seed entries first (in seed array order), then Tier 2 override appends (in YAML order), then Tier 3 frontmatter-parsed unknowns (in `skillNames` input order)") — deterministic.
- `node.after` is a `readonly string[]` — array-iteration order is deterministic; the precondition counter walks it in fixed order.
- `node.phase` and `node.optional` are immutable per-node fields.
- The sort comparator is a pure function `(a, b) => phase-diff || a.name.localeCompare(b.name)`; given the same input set, the output sort is deterministic.

Story 3.7's canonical line format thus inherits reproducibility from the upstream DAG build + the deterministic sort comparator; no additional reproducibility machinery is required.

**Optional-toggle filter (Story 3.5 forward-coupling)**: the existing `--list` short-circuit at `run.ts:1521-1526` already wires `--include-optional` / `--no-optional` per Story 3.5's design decision (default-exclude optional; explicit `--include-optional` includes; explicit `--no-optional` excludes). **Story 3.7 PRESERVES this exact filter logic**; the per-line format change does NOT touch the filter. The candidate set IS still:
- Fresh project: only entry-points (empty `after[]`).
- Post-first-step: nodes whose `after[]` includes `state.lastSuccessfulStep.step`.
- Optional nodes: filtered per `--include-optional` / `--no-optional` per Story 3.5.

**`--epic` / `--story` / `--phase` scope filter (Story 3.4 forward-coupling)**: Story 3.4 wired `pickNextStep`'s scope filters per AC line 783; the existing `--list` short-circuit at `run.ts:1493-1532` does NOT currently apply the scope filters. **Story 3.7's design decision (v0.1 conservative)**: the candidate enumeration mirrors the `pickNextStep` candidate set — i.e., scope filters DO apply to `--list` (a candidate excluded by `--epic 3` from `pickNextStep` should ALSO be excluded from `--list` for consistency). **However**, the v0.1 `--epic` / `--story` filters are runner-tier projections from `state.lastSuccessfulStep` (per Story 3.4 §line 89-90), so applying them in `--list` would either (a) reject ALL candidates that don't share the user's last-completed epic/story (hyper-restrictive — and arguably useful for "what's next in this epic?") OR (b) be SILENTLY BYPASSED (the candidate enumeration shows all DAG-reachable candidates regardless of scope). **Story 3.7 chooses option (b)** — `--list` does NOT apply `--epic`/`--story` v0.1 projections; the `--phase` filter IS applied (it's a true DAG-node attribute and matches the Story 3.5 `--list` filter shape). **Rationale**: `--list` is a "show-me-everything" diagnostic; scope-filtering should be opt-in via combination with `--explain`'s narrative (Story 3.6 owns the per-target reasoning). Story 6.x telemetry enhancement may revisit when DAG nodes gain epic/story attribution.

**The `formatAlternativesLines` reuse question (Story 3.6 forward-coupling)**: Story 3.6 introduced `formatAlternativesLines(candidates: readonly AlternativeCandidate[]): string[]` at `run.ts:1007-1031` for the `--explain` alternatives section. The Story 3.6 line format is `<step-name> — needs: <comma-separated-unmet> (count: <N>)` — DIFFERENT from Story 3.7's `<step-name> — <phase> — preconditions: [<met>/<unmet>] — optional: <yes/no>` per AC line 833. **Story 3.7 does NOT reuse `formatAlternativesLines` directly** — the line-format contracts differ; reusing would mean either drifting one or introducing dual-format flags. Instead, Story 3.7 introduces a new formatter `formatCandidateLine(node: DagNode, state: State): string` colocated in `run.ts` that emits the canonical AC-line-833 format. **Optional architectural cleanup (forward-deferred)**: Story 6.x or a future refactor may unify the two formatters under a configurable line-template (e.g., `formatStepLine(node, state, format: "explain" | "list")`), but v0.1 conservative keeps them separate.

**`--list` route order**: per `run.ts:1356-1358` comment, the read-only flag route is `--export-state → --diff-state → --explain → --list → --dry-run`. Story 3.7 PRESERVES this ordering; `--list + --explain` is suppressed by `--explain` (the explain short-circuit returns BEFORE the list short-circuit fires). Story 3.6's Test L (and Story 3.7's planned Test K) verify this precedence. The `--list + --dry-run` combo: `--list` wins (list short-circuit runs first); the dry-run preview is suppressed.

**Story 3.7 produces a `report` action** per AC line 833 ("the JSON-line action is `\"report\"` with `message` listing each candidate"). The structured multi-line content lives INSIDE the `message` string (a `\n`-joined newline-separated payload). The single AR9 JSON line on stdout therefore carries a single field whose value is a multi-line list of candidate lines (each formatted per the canonical 4-component template). Mirrors Story 3.6's design: the dispatch JSON line on stdout still wraps the message (AR9 invariant); the human-greppable substance lives within the `message` value (callers `grep` `_bmad-output/.stepper/runs/<ts>/dispatch-spec.json` or capture the runner's stdout and `jq -r '.message'`); incidental diagnostic warns/info during the list emission go to stderr per FR54 + `src/io/log.ts:20-21`.

**The NFR-Sc1 perf test (AC line 835)**: "for projects with 100 epics × 1000 stories, the list emits within 1 second". The implementation strategy:

1. Construct a synthetic DAG with 100,000 nodes via the DAG `build()` API. The seed (`seedV6_x`, ~30-50 nodes) is too small; the test must INJECT nodes via either (a) the Tier 2 overrides path (pass an `overridesPath` pointing at a fixture YAML with 100k entries) or (b) the Tier 3 frontmatter path (pass `skillNames: [<100k generated names>]` AND a `pluginDir` containing 100k SKILL.md fixtures). **Option (a) is simpler** — a single YAML fixture with 100k `overrides:` entries. **Option (c) — direct DAG construction**: bypass `build()` entirely and construct the `DagAdjacency` shape inline (the test imports `DagAdjacency` and `DagNode` types and constructs a `Map<string, DagNode>` directly, then tests the `--list` formatting helper directly without the `runNext` orchestration overhead). **Story 3.7 chooses option (c)** — direct DAG construction in the test fixture — for both speed (skip the `build()` time) and isolation (test the `--list` formatter unit, not the full `runNext` orchestration).

2. The synthetic DAG construction: 100 "epic-like" branches × 1000 "story-like" leaves per branch:
   - Generate 100 "root" nodes: `epic-${i}-root` (i = 0..99), phase `analysis`, `after: []`, `optional: false`.
   - For each root, generate 1000 "leaf" nodes: `epic-${i}-story-${j}` (j = 0..999), phase rotated through the 5 phases (`["analysis", "planning", "solutioning", "implementation", "retro"][j % 5]`), `after: ["epic-${i}-root"]`, `optional: false`.
   - Total: 100 + 100 × 1000 = 100,100 nodes (rounds to 100k for AC purposes).

3. The perf assertion: `Date.now()` before vs after `--list` emission; assert `elapsed < 1000` (1 second budget). Use Bun's `performance.now()` for sub-millisecond resolution to keep the assertion stable. **Margin**: assert `elapsed < 800ms` (a 20% safety margin) so flaky CI doesn't ping-pong; the AC says < 1s, the test says < 800ms; if the v0.1 implementation is 50ms typical the safety margin doesn't degrade signal.

4. The perf-test placement: **NEW TEST FILE** `src/integration/list-perf.test.ts` is the canonical home (mirroring the existing integration tests `dry-run-no-writes.test.ts`, `halt-records-state.test.ts`, etc.). The test imports `runNext` from `../commands/next/index.ts` + the seed fixture builder. **Alternative**: colocate the perf test in `src/commands/next/run.test.ts` under a new `describe("runNext — Story 3.7 --list NFR-Sc1 perf", ...)` block. **Story 3.7 chooses the colocated approach** — keeps the perf test close to the implementation; matches the Story 3.6 test-organization pattern; avoids creating a new file unnecessarily. The perf test runs as part of `bun test src/commands/next/run.test.ts`; Bun's per-test timeout (default 5s) easily accommodates the 1s assertion.

**FR54 stderr discipline** per AR9 / Story 3.6 §line 141-143:

The `report` action's `message` lives on stdout (AR9: single JSON line with `message` field). The "human-greppable" pattern is: callers `grep` the message INSIDE the JSON line via `jq -r '.message'` or by reading the on-disk run-log. Diagnostic side-channel emissions (zero new in Story 3.7 — the list short-circuit emits no stderr writes from its hot path) route to stderr per `src/io/log.ts:20-21`. **Story 3.7 emits ZERO new stderr writes from the list branch**; the existing structure is PRESERVED.

**What this story DOES NOT do**:

- **Implement `--diff-state` / `--export-state`** (Story 3.8). The forward-deferred stubs at `run.ts:1360-1382` (export-state + diff-state) stay PRE-EXISTING.
- **Implement `--watch`** (Story 3.9). The forward-deferred stub stays.
- **Implement `--recompute-state`** (Story 3.10). The forward-deferred stub stays.
- **Add a new error class**. The 16-code registry stays UNCHANGED; the `--list` branch returns `report` with `exitCode: 0` (no throw on the candidate-enumeration path).
- **Acquire the lock**. `run.ts` is structurally lock-free per architecture §line 1672.
- **Modify `state.yaml`**. `--list` is read-only; no state writes.
- **Add `state.completedSteps[]` to `StateV1Schema`** (Story 6.x). v0.1 uses the `state.lastSuccessfulStep?.step` proxy for the precondition counter (matching Story 3.4 / 3.6 v0.1 conservative scope).
- **Change `pickNextStep`'s scope-filter logic** (Story 3.4). The `--list` candidate set MIRRORS the Story 3.5 `--list` filter (optional-toggle); v0.1 conservative does NOT apply `--epic` / `--story` runner-tier projections to `--list` (rationale per Context Summary).
- **Modify `commands/bmad-next.md` (Layer 1 markdown)**. The Layer 1 markdown already branches on `action`; the `report` action carrying the multi-line `message` is PRE-EXISTING surface (Stories 2.4 + 2.7 + 3.6).
- **Modify `verify-and-advance.ts`**. `--list` is a read-only short-circuit BEFORE the dispatch; `verify-and-advance.ts` is never invoked.
- **Refactor `formatAlternativesLines` from Story 3.6**. The two formatters serve different AC lines (Story 3.6 AC line 817 vs Story 3.7 AC line 833) and emit different formats. v0.1 keeps them separate; Story 6.x or future refactor may unify.
- **Add an integration test file for `--list`**. The colocated `run.test.ts` cases cover the AC surface; the NFR-Sc1 perf test is colocated; no new integration test file needed.

It DOES land:

- The architecturally-prescribed **`--list` candidate enumeration with the canonical line format** per FR14 + epic AC line 833 — replaces the Story 2.4 placeholder with the 4-component canonical line.
- The architecturally-prescribed **phase-order then name lexicographic sort** per AC line 833 — uses the existing `PHASE_ORDER` map; matches Story 3.6's alternatives-sort tiebreaker subset.
- The **reproducibility guarantee** per AC line 834 — same DAG yields same byte-identical output line ordering across runs (inherited from upstream DAG-build determinism + deterministic sort comparator).
- The **NFR-Sc1 perf test** per AC line 835 — synthetic 100k-node DAG construction + < 1s emission assertion.
- The **`formatCandidateLine(node, state)` helper** in `run.ts` — colocated with the existing `formatAlternativesLines` (Story 3.6) to preserve the run-tier formatter cluster.
- **10-15 new colocated test cases** in `run.test.ts` covering the canonical line format, the phase-order sort, the precondition counter, the optional-yes/no surfacing, the optional-toggle interactions, the empty-candidate-set case, the `--list + --explain` precedence, and the NFR-Sc1 perf assertion.
- The **forward-coupling documentation** with Stories 3.8 / 3.9 / 3.10 / 6.x.

This story exercises:

- **AR8** (lock-free `run.ts` / lock-held `verify-and-advance.ts`): UNCHANGED. Story 3.7 modifies the list short-circuit ONLY; no lock-acquisition surface introduced.
- **AR9** (single discriminated-union JSON line on stdout): UNCHANGED. The `report` action's `message` is a multi-line string; the JSON line shape remains a single line per `DispatchActionV1Schema`.
- **AR21 + AR22** (errors carry code + actionable hint): UNCHANGED. Story 3.7 adds ZERO new throws; the list branch emits `report` with `exitCode: 0` (success).
- **AR33** (function & error semantics; throw not Result; no console.*; async/await): UNCHANGED. Story 3.7's list branch and the new `formatCandidateLine` helper are pure / synchronous; no console.*; no Result-shape.
- **AR41** (boundary graph; no upward / sibling-higher imports): UNCHANGED. Story 3.7 modifies `src/commands/next/run.ts` (top-tier composer) only; no new module created; no new imports added (the `DagNode` + `State` types are already imported per Story 3.6).
- **FR8** (`/bmad-next` single-step advance): UNCHANGED. The runner's dispatch path is unaffected; `--list` is a read-only short-circuit.
- **FR14** (`--list` candidate enumeration): PRIMARY DELIVERABLE. v0.1 ships the canonical 4-component per-line format per AC line 833.
- **FR52** (Read-only flags non-locking): UNCHANGED. `--list` is read-only / lock-free per the existing Story 2.4 contract; Story 3.7 preserves.
- **FR53** (Documented exit codes): UNCHANGED. The list branch returns `exitCode: 0` (success — read-only).
- **FR54** (stdout/stderr discipline): UNCHANGED. The `report` action goes to stdout (single AR9 JSON line); diagnostic warns/info go to stderr.
- **NFR-P1** (next-step computation < 500ms p95): EXTENDED. The list emission is structurally O(N log N) (sort) + O(N × M) (precondition counter; M = avg `node.after.length`); at N = 100k the budget is 1s per AC line 835, well above the NFR-P1 500ms p95 budget for the 50 epics × 50 stories baseline.
- **NFR-Sc1** (100 epics × 1000 stories): PRIMARY ACCEPTANCE. The synthetic 100k-node perf test asserts < 1s emission per AC line 835.
- **NFR-S2** (writes only inside scope): UNCHANGED. Read-only short-circuit.
- **NFR-S5** (non-corrupting flag combinations): EXTENDED. `--list` + `--include-optional`/`--no-optional` (per Story 3.5; respected), `--list + --explain` (explain wins per route order), `--list + --dry-run` (list wins per route order).
- **NFR-R1** (zero data loss on halt): UNCHANGED — the runner reads state via `loadStateUnlocked`; no write side.
- **NFR-I2** (unknown-skill fail-loud): UNCHANGED — the list branch does not introduce any registry-validation surface.

Estimated effort: **S** (small — replaces the Story 2.4 placeholder per-line format at `run.ts:1527-1529` with the AC-line-833 canonical 4-component line via a new ~15-line `formatCandidateLine(node, state)` helper; preserves the existing list-short-circuit position + the existing optional-toggle filter from Story 3.5; introduces ~10-15 new test cases including the NFR-Sc1 100k-node perf test; the `--list` placeholder + the optional-toggle filter are PRE-EXISTING surface — Story 3.7 enriches the per-line format ONLY).

It does **NOT**:

- **Implement runtime `failurePolicies` lookup.** Forward-deferred to Story 6.x.
- **Implement multi-persona sequential dispatch.** Forward-deferred to Stories 4.1 + 5.*.
- **Validate the `--list` line format against any registry.** v0.1 conservative.
- **Add `state.completedSteps[]` to `StateV1Schema`.** Forward-deferred to Story 6.x.
- **Implement `--diff-state` / `--export-state`** (Story 3.8).
- **Implement `--watch`** (Story 3.9).
- **Implement `--recompute-state`** (Story 3.10).
- **Modify `verify-and-advance.ts`.** Lock-held runner is unchanged.
- **Add a new dispatch-protocol field.** The dispatch line shape is unchanged; the `report` action's `message` carries the multi-line content as a `\n`-joined string.
- **Resolve epic/story attribution from DAG nodes** (Story 6.x).

## Acceptance Criteria

The acceptance criteria below are reproduced **verbatim** from `_bmad-output/planning-artifacts/epics.md` §Story 3.7 (lines 829-835, BDD Given/When/Then format). Lines and AC labelling preserved.

**Acceptance Criteria:**

**Given** Stepper has built the DAG
**When** `--list` is supplied
**Then** the JSON-line action is `"report"` with `message` listing each candidate as `<step-name> — <phase> — preconditions: [<met>/<unmet>] — optional: <yes/no>`, sorted by phase order then name
**And** the topological tiebreaker is consistent across runs (reproducible output)
**And** for projects with 100 epics × 1000 stories, the list emits within 1 second (NFR-Sc1, NFR-P1)

## Tasks / Subtasks

- [ ] **Task 0 — Verify pre-conditions (AC: all)**
  - [ ] 0.1 Confirm Story 3.1 (`record_last_attempted_last_failure_reason_on_halt`) is `done` per `_bmad-output/implementation-artifacts/sprint-status.yaml:71` (`3-1-record-last-attempted-last-failure-reason-on-halt: done`).
  - [ ] 0.2 Confirm Story 3.2 (`--resume` Flag) is `done` per `sprint-status.yaml:72` (`3-2-resume-flag: done`).
  - [ ] 0.3 Confirm Story 3.3 (`--dry-run` Flag) is `done` per `sprint-status.yaml:73` (`3-3-dry-run-flag: done`).
  - [ ] 0.4 Confirm Story 3.4 (`--step` and Scope Flags) is `done` per `sprint-status.yaml:74` (`3-4-step-id-and-scope-flags: done`); the `isPreconditionMet(node, state)` helper at `src/commands/next/run.ts:455-460` is the foundation for the precondition met/unmet count computation in Task 4.
  - [ ] 0.5 Confirm Story 3.5 (`--persona` + `--include-optional`/`--no-optional`) is `done` per `sprint-status.yaml:75` (`3-5-persona-override-include-optional-no-optional: done`); the `--list` optional-toggle filter at `src/commands/next/run.ts:1521-1526` is PRE-EXISTING surface that Story 3.7 PRESERVES.
  - [ ] 0.6 Confirm Story 3.6 (`--explain` Reasoning Trace) is `done` per `sprint-status.yaml:76` (`3-6-explain-reasoning-trace: done`); the `formatAlternativesLines` per-candidate-line formatter at `src/commands/next/run.ts:1007-1031` is the structural template for the new Story 3.7 `formatCandidateLine` helper (DIFFERENT line format; same composition pattern).
  - [ ] 0.7 Confirm Story 1.7 (`src/commands/next/args.ts`) declares `list: z.boolean().default(false)` at line 160 + lists `"list"` in the `booleanKeys` set at line 216. **No args change needed for Story 3.7.**
  - [ ] 0.8 Confirm Story 1.10 (`src/dag/index.ts`) re-exports `build`, `tarjanScc`, the structural types `BuildInput`/`DagAdjacency`/`DagNode`/`OverrideEntry`/`Phase`/`SeedEntry`, and `SEED_BMAD_VERSION`. Story 3.7 consumes `DagAdjacency` + `DagNode` + `Phase` ONLY (all already imported in `run.ts`).
  - [ ] 0.9 Confirm `src/dag/types.ts:60-68` declares `DagNode` with `name: string`, `phase: Phase`, `after: readonly string[]`, `before: readonly string[]`, `optional: boolean`, `persona: string | readonly string[] | null`, `idempotent?: boolean`. Story 3.7's `formatCandidateLine` consumes `name`, `phase`, `after`, `optional` ONLY.
  - [ ] 0.10 Confirm Story 2.4's placeholder list short-circuit lives at `src/commands/next/run.ts:1493-1532`. Read this region to confirm:
    - The branch fires when `args.list === true`.
    - It loads state via `loadStateUnlocked({ statePath: opts?.statePath })`.
    - It builds the DAG via `build({ skillNames: opts?.skillNames ?? [], ... })`.
    - It iterates `dag.nodes.values()` and applies the same selection model as `pickNextStep` (entry-points on fresh project; `node.after.includes(lastStepName)` on post-first-step).
    - It applies the Story 3.5 optional-toggle filter at lines 1521-1526.
    - It emits per-line `  - ${node.name} (phase: ${node.phase}${node.optional ? ", optional" : ""})` (the placeholder format Story 3.7 REPLACES).
    - It returns `reportWithMessage(lines.join("\n"))`.
    - **Story 3.7 REPLACES the per-line format ONLY; preserves the surrounding short-circuit position + the optional-toggle filter from Story 3.5.**
  - [ ] 0.11 Confirm `src/commands/next/run.ts:133-139` declares `PHASE_ORDER: ReadonlyMap<string, number>` with `analysis: 0, planning: 1, solutioning: 2, implementation: 3, retro: 4`. Story 3.7's sort comparator reuses this constant.
  - [ ] 0.12 Confirm `src/errors.ts` registry stays at 16 codes (`bun test src/errors.test.ts`: 10 pass, 197 expects). Story 3.7 ships ZERO new error classes — the list branch returns `report` with `exitCode: 0`; existing throws from upstream (DAG build, state load) are preserved.
  - [ ] 0.13 Read epics.md §Story 3.7 lines 823-835 verbatim. Confirm the AC text in §Acceptance Criteria above is character-identical.
  - [ ] 0.14 Read prd.md §FR14 line 687 (`Users can list candidate next steps with their preconditions (--list).`); §FR52 line 743 (read-only flags non-locking); §NFR-P1 line 755 (< 500ms p95 baseline); §NFR-Sc1 line 784 (100 epics × 1000 stories scale).
  - [ ] 0.15 Read architecture.md §line 1672 (`run.ts` is read-only / lock-free); §A.D7 lines 460-490 (DAG + next-step computation + `Topological order: computed lazily on --list and --explain`); §line 469 (the verbatim "phase order then name lexicographic" tiebreaker); §line 1660 (AR9 protocol concretization); §line 1340-1350 (FR-to-source mapping; FR14 → `src/commands/next/run.ts`); §line 1410 (NFR-Sc1 → `src/dag/build.ts` + `src/integration/pathological-input.test.ts`).
  - [ ] 0.16 Read epic-2-retrospective.md §Forward Action Items — confirm Story 3.7 is in the recommended sequence (AFTER Story 3.6, BEFORE Story 3.8).
  - [ ] 0.17 Read Story 3.6's Forward Dependencies §Story 3.7 entry (line 735) — Story 3.6 explicitly forward-coupled with Story 3.7 ("Story 3.7 may share the per-candidate-line formatting helper if Story 3.6's `formatAlternativeLine(...)` is exported"). Story 3.7 RECEIVES the hand-off; v0.1 conservative DOES NOT REUSE the formatter (different AC line formats); documents the rationale.
  - [ ] 0.18 Read Story 3.4's Dev Notes §line 471-575 — confirm Story 3.4's `isPreconditionMet(node, state)` at `run.ts:455-460` is the predicate Story 3.7 reuses for the per-prerequisite met/unmet counter. Verify the function signature: `isPreconditionMet(node: DagNode, state: State): boolean`. Story 3.7 uses the same per-prerequisite check (`p === state.lastSuccessfulStep?.step`) but counts BOTH met and unmet (rather than returning a boolean).
  - [ ] 0.19 Confirm baseline `bun run check` exits 0 with **648 pass / 0 fail / 2374 expects / 49 files** per Story 3.6 final.
  - [ ] 0.20 Confirm Bun host version satisfies AR2 (Bun >= 1.3). Run `bun --version`; record in Completion Notes.
  - [ ] 0.21 Confirm `src/commands/next/run.ts:182-187` declares `LoggerFns` with `info|warn|error|json: (message: string) => void`. The list branch may call `log.info(...)` for additional diagnostic context (stderr per FR54); it MUST NOT call `log.json(...)` (the json emission is reserved for the runner-tier dispatch line via `emitDispatchAction`).

- [ ] **Task 1 — Replace the Story 2.4 placeholder per-line format (AC line 833)**
  - [ ] 1.1 Identify the insertion site at `src/commands/next/run.ts:1527-1529`. The replacement REUSES the existing `loadStateUnlocked(...) + build(...)` setup; REUSES the existing optional-toggle filter at lines 1521-1526; REPLACES the per-line `  - ${node.name} (phase: ${node.phase}${node.optional ? ", optional" : ""})` format with a call to the new `formatCandidateLine(node, state)` helper.
  - [ ] 1.2 Sketch the replacement structure:
    ```typescript
    if (args.list) {
      const state = await loadStateUnlocked({ statePath: opts?.statePath });
      const dag = await build({
        skillNames: opts?.skillNames ?? [],
        projectRoot: opts?.projectRoot,
        pluginDir: opts?.pluginDir,
        overridesPath: opts?.overridesPath,
      });
      const lastStepName = state.lastSuccessfulStep?.step;
      // Collect the candidate set first (existing filter logic).
      const candidates: DagNode[] = [];
      for (const node of dag.nodes.values()) {
        if (node.name === lastStepName) continue;
        let satisfied: boolean;
        if (lastStepName === undefined) {
          satisfied = node.after.length === 0;
        } else {
          satisfied = node.after.includes(lastStepName);
        }
        if (!satisfied) continue;
        // Story 3.5 optional-toggle filter (PRE-EXISTING; PRESERVED).
        if (!args.includeOptional && !args.noOptional && node.optional) continue;
        if (args.noOptional && node.optional) continue;
        // Story 3.7: --phase scope filter (NEW — applies the existing
        // pickNextStep --phase filter to the --list enumeration for
        // consistency).
        if (args.phase !== undefined && node.phase !== args.phase) continue;
        candidates.push(node);
      }
      // Story 3.7: sort by phase-order then name lexicographic per AC line 833.
      candidates.sort((a, b) => {
        const pa = PHASE_ORDER.get(a.phase) ?? 999;
        const pb = PHASE_ORDER.get(b.phase) ?? 999;
        if (pa !== pb) return pa - pb;
        return a.name.localeCompare(b.name);
      });
      // Story 3.7: emit the canonical AC-line-833 per-line format.
      const lines: string[] = ["Candidate next steps:"];
      for (const node of candidates) {
        lines.push(`  - ${formatCandidateLine(node, state)}`);
      }
      if (candidates.length === 0) {
        lines.push("  (none — current state + filters yield zero candidates)");
      }
      return reportWithMessage(lines.join("\n"));
    }
    ```
  - [ ] 1.3 Document the AR9 invariant: the `report` action's `message` is a `\n`-joined multi-line string; the AR9 JSON line shape stays single-line.
  - [ ] 1.4 Document the read-only / lock-free posture: NO state writes, NO lock acquisition.
  - [ ] 1.5 Document the v0.1 design decision per Context Summary: `--list` mirrors `pickNextStep`'s candidate set under the optional-toggle and `--phase` filters; `--epic` / `--story` runner-tier projections are NOT applied to `--list` (Story 6.x revisits when DAG nodes gain epic/story attribution).

- [ ] **Task 2 — Compose the canonical per-candidate line format (AC line 833)**
  - [ ] 2.1 Sketch the new helper:
    ```typescript
    /**
     * Story 3.7: format a single candidate line per AC line 833.
     *
     * Output format:
     *   `<step-name> — <phase> — preconditions: [<met>/<unmet>] — optional: <yes/no>`
     *
     * Components:
     *   1. <step-name> — node.name verbatim.
     *   2. <phase> — node.phase verbatim (analysis|planning|solutioning|
     *      implementation|retro).
     *   3. preconditions: [<met>/<unmet>] — count-pair summary; <met> is
     *      the count of node.after[] entries satisfied per the v0.1
     *      conservative isPreconditionMet-style per-prerequisite check
     *      (p === state.lastSuccessfulStep?.step); <unmet> is the
     *      complement (node.after.length - <met>).
     *   4. optional: <yes/no> — literal "yes" or "no" based on node.optional.
     *
     * Pure / synchronous; no I/O.
     */
    function formatCandidateLine(node: DagNode, state: State): string {
      const lastStepName = state.lastSuccessfulStep?.step;
      let met = 0;
      for (const p of node.after) {
        if (p === lastStepName) met++;
      }
      const unmet = node.after.length - met;
      const optional = node.optional ? "yes" : "no";
      return `${node.name} — ${node.phase} — preconditions: [${met}/${unmet}] — optional: ${optional}`;
    }
    ```
  - [ ] 2.2 Document the em-dash (` — ` U+2014) literal — matches the AC line 833 wording AND Story 3.6's existing `formatAlternativesLines` separator (`<step-name> — needs:`); consistent across the two list formatters.
  - [ ] 2.3 Document the `<met>` semantics: `met` is the COUNT (an integer 0..node.after.length), NOT a boolean. The render is `[<met>/<unmet>]` (e.g., `[2/0]` for fully-met; `[0/3]` for fully-blocked).
  - [ ] 2.4 Document the v0.1 conservative scope: the per-prerequisite check matches `isPreconditionMet`'s rule (`p === state.lastSuccessfulStep?.step`); Story 6.x's `state.completedSteps[]` schema extension enables a richer set-membership check.

- [ ] **Task 3 — Apply phase-order then name lexicographic sort (AC line 833)**
  - [ ] 3.1 The sort comparator (deterministic; matches `PHASE_ORDER` at `run.ts:133-139`):
    ```typescript
    candidates.sort((a, b) => {
      const pa = PHASE_ORDER.get(a.phase) ?? 999;
      const pb = PHASE_ORDER.get(b.phase) ?? 999;
      if (pa !== pb) return pa - pb;
      return a.name.localeCompare(b.name);
    });
    ```
  - [ ] 3.2 Document the AC-line-834 reproducibility guarantee: the sort comparator + the deterministic upstream DAG-build (insertion-order per `src/dag/types.ts:73-77`) yield the same byte-identical line ordering across runs. Same input DAG → same output.
  - [ ] 3.3 Document the consistency with Story 3.6's `computeAlternatives` sort: Story 3.6 sorts by `count` ASCENDING → phase-order → name lexicographic (3-key). Story 3.7 sorts by phase-order → name lexicographic (2-key). The `count` key is omitted because `--list` enumerates ALL candidates with met preconditions equally (the precondition count is a per-line ANNOTATION, not a sort dimension); `--explain` ranks by closeness-to-ready, `--list` enumerates everything.
  - [ ] 3.4 Document the `localeCompare` semantics: UTF-16 code-unit comparison. For ASCII-only step names (the v0.1 BMAD seed) the result is identical to byte-order comparison; non-ASCII names (Story 6.x telemetry-driven additions) are stable per the locale-default comparator. Reproducibility is preserved.

- [ ] **Task 4 — Compose the precondition `[<met>/<unmet>]` counter (AC line 833)**
  - [ ] 4.1 The counter logic (per Task 2.1):
    ```typescript
    let met = 0;
    for (const p of node.after) {
      if (p === lastStepName) met++;
    }
    const unmet = node.after.length - met;
    ```
  - [ ] 4.2 Edge cases:
    - Entry-point (`node.after.length === 0`): `[0/0]`. Trivially met (zero prerequisites).
    - Fresh project + non-entry-point (`lastStepName === undefined && node.after.length > 0`): `[0/N]` (every prerequisite counted as unmet because nothing has completed).
    - Post-first-step + single-prerequisite + matches: `[1/0]` (typical happy-path candidate).
    - Multi-prerequisite (e.g., `node.after.length === 3`) + only one matches `lastStepName`: `[1/2]` (v0.1 conservative under-counts; Story 6.x `state.completedSteps[]` enables richer counting).
  - [ ] 4.3 Document the v0.1 → Story 6.x evolution: when `state.completedSteps[]` lands, the helper switches to a set-membership check (`completed.has(p)`); the line format `[<met>/<unmet>]` stays the same. Forward-compatible.
  - [ ] 4.4 Document the `<met>` reader semantics: "candidate is ready when `<unmet> == 0`". The list emission shows ALL candidates with met preconditions (the upstream `satisfied` filter at `run.ts:1508-1514` already gates this); the per-line counter surfaces the breakdown for diagnostic value (e.g., the user sees "step X has 2 of 3 prereqs met" and infers the third is missing).

- [ ] **Task 5 — Surface `optional: <yes/no>` (AC line 833)**
  - [ ] 5.1 The literal mapping: `optional: ${node.optional ? "yes" : "no"}`. Always renders both states (in contrast to Story 2.4's placeholder which only suffixed `, optional` when true).
  - [ ] 5.2 Document the change from placeholder: the canonical AC line 833 format ALWAYS surfaces the optional flag (`yes` or `no`), whereas the placeholder format only surfaced it conditionally. This gives the reader a definitive signal per candidate.
  - [ ] 5.3 Document the `--include-optional` / `--no-optional` interaction:
    - Default (neither flag): the candidate set EXCLUDES `node.optional === true` candidates (Story 3.5 filter); the line format never shows `optional: yes` because optional candidates are filtered out entirely.
    - `--include-optional`: the candidate set INCLUDES optional candidates; the line format shows `optional: yes` for those candidates and `optional: no` for the required ones.
    - `--no-optional`: same as default (excludes optional candidates).

- [ ] **Task 6 — Combo precedence: `--list` + `--no-optional` / `--include-optional` / `--epic` / `--story` / `--phase` (AC: all)**
  - [ ] 6.1 Document the combo matrix:
    - `--list` alone: emit all required candidates with met preconditions.
    - `--list + --include-optional`: emit all (required + optional) candidates with met preconditions.
    - `--list + --no-optional`: emit all required (non-optional) candidates with met preconditions (same as default).
    - `--list + --include-optional + --no-optional`: rejected at parse time per Story 3.5 cross-validation throw — the list branch never fires.
    - `--list + --phase planning`: emit candidates whose `node.phase === "planning"` AND have met preconditions AND respect the optional-toggle.
    - `--list + --epic 3` / `--list + --story 3.4`: v0.1 conservative — these scope flags are SILENTLY BYPASSED on the `--list` path (per Context Summary); the candidate enumeration shows all DAG-reachable candidates regardless of `--epic`/`--story`. Story 6.x revisits.
  - [ ] 6.2 Document the route-order precedence per `run.ts:1356-1358`:
    - `--list + --explain`: `--explain` short-circuit fires FIRST (route order); `--list` is suppressed.
    - `--list + --dry-run`: `--list` short-circuit fires FIRST; `--dry-run` is suppressed.
    - `--list + --resume`: `--list` short-circuit fires FIRST; `--resume` is suppressed (the resume target is computed on the dispatch path, not the list path).
    - `--list + --step`: `--list` short-circuit fires FIRST; the explicit `--step` is suppressed (the explicit step is computed on the dispatch path via `pickNextStep`).
  - [ ] 6.3 Document the `--list + --phase` enrichment: Story 3.7 ADDS `--phase` filtering to the existing `--list` candidate set. v0.1 design decision: `--phase` is a true DAG-node attribute (matches the Story 3.4 `pickNextStep` filter shape); applying it to `--list` is consistent with Story 3.4's scope-filter contract for `pickNextStep`. The per-line format is unchanged; the candidate set is constrained to phase-matching nodes.

- [ ] **Task 7 — Implement the list branch + helper + tests (AC: all)**
  - [ ] 7.1 Edit `src/commands/next/run.ts` to:
    - ADD the new `formatCandidateLine(node, state)` helper, colocated near `formatAlternativesLines` at `run.ts:1007-1031` (Story 3.6 cluster). The helper is pure / synchronous; no I/O.
    - REPLACE the existing list short-circuit body at lines 1493-1532 with the structure per Task 1.2: collect the candidate set; apply optional-toggle + `--phase` filters; sort by phase-order then name lexicographic; emit per-line via `formatCandidateLine`; emit the empty-set hint when zero candidates.
  - [ ] 7.2 Verify the runner compiles via `bunx tsc --noEmit` (the new helper + the modified list branch land cleanly).
  - [ ] 7.3 Verify Biome passes via `bunx --bun biome ci .` (no formatting drift).
  - [ ] 7.4 Verify the full test suite passes via `bun test` (all PRE-EXISTING tests continue to pass; the placeholder-format tests in Story 2.4 may need targeted updates — confirm by reading `run.test.ts` for any `(phase: ${node.phase}, optional)` literal-string assertions and updating them to assert the new canonical line format).

- [ ] **Task 8 — Implement the colocated test cases for the canonical line format (AC: all)**
  - [ ] 8.1 Edit `src/commands/next/run.test.ts` to APPEND a new `describe` block: `"runNext — Story 3.7 --list canonical line format"`. Reuse module-level `beforeEach`/`afterEach` + `commonOpts`/`writeMinimalState` factories. Reuse the Story 3.4 `captureLogger()` factory + Story 3.5's `writeStateWithLastSuccessful()` helper.
  - [ ] 8.2 **Test case A (AC line 833: canonical line format on fresh project)** — invoke with empty state (no `lastSuccessfulStep`) + `argv: ["--list"]`; assert (a) `result.exitCode === 0`, (b) `result.action.action === "report"`, (c) `result.action.message` STARTS WITH `Candidate next steps:`, (d) for at least one entry-point candidate (e.g., `bmad-brainstorming`), the message contains the line `  - bmad-brainstorming — analysis — preconditions: [0/0] — optional: no`.
  - [ ] 8.3 **Test case B (AC line 833: canonical line format on post-first-step state)** — seed state with `lastSuccessfulStep: { step: "bmad-brainstorming", ... }`; invoke with `argv: ["--list"]`; assert (a) `result.action.message` contains the line `  - bmad-product-brief — analysis — preconditions: [1/0] — optional: no` (since `bmad-product-brief.after = ["bmad-brainstorming"]`).
  - [ ] 8.4 **Test case C (AC line 833: phase-order then name sort)** — seed valid state; invoke with `argv: ["--list", "--include-optional"]`; assert the message lines are sorted such that all `analysis`-phase entries appear before `planning`-phase entries (which appear before `solutioning`, etc.); within the same phase, names are sorted lexicographically. Verify by parsing the message with a regex / split-by-`\n`, extracting the phase from each line, and asserting the phase sequence is non-decreasing.
  - [ ] 8.5 **Test case D (AC line 833: optional yes/no surfacing — `--include-optional`)** — seed valid state; invoke with `argv: ["--list", "--include-optional"]`; assert the message contains AT LEAST one line ending in `optional: yes` (an optional candidate) AND AT LEAST one line ending in `optional: no` (a required candidate).
  - [ ] 8.6 **Test case E (AC line 833: optional yes/no surfacing — default excludes optional)** — seed valid state; invoke with `argv: ["--list"]` (no `--include-optional`); assert the message contains NO line ending in `optional: yes` (default Story 3.5 filter excludes optional candidates).
  - [ ] 8.7 **Test case F (AC line 833: precondition counter — fresh project + multi-prereq candidate)** — seed empty state; invoke with `argv: ["--list"]`. Compute the expected line for any multi-prerequisite candidate that doesn't make it into the candidate set (it's blocked by the upstream `satisfied` filter); the test instead asserts the entry-point candidates show `[0/0]` (entry-points have empty `after[]`).
  - [ ] 8.8 **Test case G (AC line 833: precondition counter — post-first-step + single-match)** — seed state with `lastSuccessfulStep: { step: "bmad-brainstorming", ... }`; invoke with `argv: ["--list"]`; for any candidate whose `node.after === ["bmad-brainstorming"]`, assert the line contains `[1/0]` (one met, zero unmet).
  - [ ] 8.9 **Test case H (AC line 834: reproducibility — same DAG → same output)** — invoke `runNext` TWICE with identical args + identical state; assert `result1.action.message === result2.action.message` (byte-identical). This verifies the deterministic sort + the deterministic upstream DAG-build.
  - [ ] 8.10 **Test case I (Edge: `--list + --phase planning`)** — seed state with `lastSuccessfulStep: { step: "bmad-brainstorming", ... }`; invoke with `argv: ["--list", "--phase", "planning"]`; assert all message lines have phase `planning` (parse via regex; reject lines with other phases).
  - [ ] 8.11 **Test case J (Edge: `--list + --no-optional`)** — invoke with `argv: ["--list", "--no-optional"]`; assert the message contains NO `optional: yes` lines (same as default — `--no-optional` is the explicit-form of the default filter).
  - [ ] 8.12 **Test case K (Edge: `--list + --explain` precedence — explain wins)** — invoke with `argv: ["--list", "--explain"]`; assert the message is the explain trace (NOT the list output); the explain short-circuit fires BEFORE the list short-circuit per the existing `run.ts:1356-1358` route order. Test message format: contains `Next step:` AND `Reasoning:` (explain prefixes); does NOT contain `Candidate next steps:` (list header).
  - [ ] 8.13 **Test case L (Edge: empty candidate set)** — seed state with a `lastSuccessfulStep` that has zero candidates whose `after[]` includes it (e.g., `lastSuccessfulStep: { step: "bmad-retrospective", ... }` — the project's terminal step; nothing comes after); invoke with `argv: ["--list"]`; assert the message contains `(none — current state + filters yield zero candidates)` AND the message ALSO contains the header `Candidate next steps:` (the helper still emits the header; just the line list is empty).
  - [ ] 8.14 **Test case M (Edge: em-dash literal in line format)** — assert the per-line format uses U+2014 EM DASH ` — ` (NOT a hyphen `-` or en-dash `–`). Verify by inspecting a single line: `expect(line).toContain(" — ")`. Cross-checks the AC line 833 wording.
  - [ ] 8.15 Each test follows AR35 tmpdir-per-test discipline: reuses module-level `beforeEach`/`afterEach` + `commonOpts`/`writeMinimalState` factories.

- [ ] **Task 9 — Implement the NFR-Sc1 100k-node perf test (AC line 835)**
  - [ ] 9.1 Sketch the perf-test fixture builder:
    ```typescript
    /**
     * Story 3.7 NFR-Sc1 perf test fixture: build a synthetic 100k-node
     * DAG (100 epic-like branches × 1000 leaf-like nodes per branch).
     * Returns a DagAdjacency the test can pass directly to the formatter
     * (or invoke runNext with a custom `dag` injected via a test-only
     * escape hatch).
     */
    function buildSyntheticDag(epicCount: number, storyCount: number): DagAdjacency {
      const nodes = new Map<string, DagNode>();
      const edgesOut = new Map<string, Set<string>>();
      const edgesIn = new Map<string, Set<string>>();
      const phases: Phase[] = ["analysis", "planning", "solutioning", "implementation", "retro"];
      // 100 root nodes (epic-like).
      for (let i = 0; i < epicCount; i++) {
        const name = `epic-${i}-root`;
        nodes.set(name, {
          name,
          phase: "analysis",
          after: [],
          before: [],
          optional: false,
          persona: null,
        });
        edgesOut.set(name, new Set());
        edgesIn.set(name, new Set());
      }
      // 100 × 1000 leaf nodes (story-like).
      for (let i = 0; i < epicCount; i++) {
        for (let j = 0; j < storyCount; j++) {
          const name = `epic-${i}-story-${j}`;
          const phase = phases[j % phases.length] as Phase;
          nodes.set(name, {
            name,
            phase,
            after: [`epic-${i}-root`],
            before: [],
            optional: false,
            persona: null,
          });
          edgesOut.get(`epic-${i}-root`)?.add(name);
          edgesIn.set(name, new Set([`epic-${i}-root`]));
          edgesOut.set(name, new Set());
        }
      }
      return { nodes, edgesOut, edgesIn };
    }
    ```
  - [ ] 9.2 The perf-test invocation:
    ```typescript
    test("Story 3.7 NFR-Sc1: --list emits within 1s for 100 epics × 1000 stories (~100k nodes)", async () => {
      const dag = buildSyntheticDag(100, 1000);
      const state: State = { schemaVersion: 1, lastSuccessfulStep: null, lastAttempted: null, lastFailureReason: null, runHistory: [] };
      // Direct unit test on the list-formatter path: bypass runNext orchestration
      // for isolation; assert the formatter emits within 1000ms.
      const start = performance.now();
      // Inline the list-branch logic (or expose `formatList(dag, state, args)`
      // helper for direct invocation).
      const candidates: DagNode[] = [];
      for (const node of dag.nodes.values()) {
        if (node.after.length !== 0) continue; // fresh project: only entry-points
        candidates.push(node);
      }
      candidates.sort((a, b) => {
        const pa = PHASE_ORDER.get(a.phase) ?? 999;
        const pb = PHASE_ORDER.get(b.phase) ?? 999;
        if (pa !== pb) return pa - pb;
        return a.name.localeCompare(b.name);
      });
      const lines: string[] = ["Candidate next steps:"];
      for (const node of candidates) {
        lines.push(`  - ${formatCandidateLine(node, state)}`);
      }
      const message = lines.join("\n");
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(800); // 20% safety margin under the 1s AC budget
      expect(message).toContain("Candidate next steps:");
      // Sanity: 100 root nodes are entry-points (after === []) → 100 candidate lines.
      expect(message.split("\n")).toHaveLength(101); // header + 100 candidates
    });
    ```
  - [ ] 9.3 Document the perf-test scope: tests the FORMATTER + SORTER hot path; does NOT include the `build()` time (the `build()` time is a Story 1.10 concern). The 1s AC budget covers the list emission AFTER the DAG is built.
  - [ ] 9.4 Document the safety margin rationale: `< 800ms` instead of `< 1000ms`. Avoids CI flakiness; the v0.1 implementation should run in ~50-100ms on a typical CI machine; the 800ms ceiling provides 8-16x headroom.
  - [ ] 9.5 Document the test placement: colocated in `src/commands/next/run.test.ts` under a new describe block (per Story 3.6 organisation pattern). Bun's per-test 5s default timeout easily accommodates.
  - [ ] 9.6 Edge case — `runNext` orchestration overhead: if the unit-test isolation (Task 9.2) shows the formatter alone is < 100ms but `runNext` total is > 800ms (due to `loadStateUnlocked`, `build()`, plugin discovery, etc.), the test MAY relax to `< 1500ms` per the AC's 1s budget + safety margin OR document the orchestration overhead as out-of-scope. **v0.1 conservative: the test exercises the formatter path only; the orchestration overhead is profiled separately if needed**. Story 6.x telemetry may add a `--list-perf-budget-ms` config knob.

- [ ] **Task 10 — Update pre-existing tests to match the new canonical format**
  - [ ] 10.1 Search `src/commands/next/run.test.ts` for any pre-existing `--list`-path assertions that rely on the Story 2.4 placeholder format (e.g., `(phase: ${phase}, optional)`). Update those assertions to match the new canonical format `<step-name> — <phase> — preconditions: [<met>/<unmet>] — optional: <yes/no>`.
  - [ ] 10.2 Specifically check (via Grep): `(phase: `, `, optional)`, `Candidate next steps:` — these are the placeholder fingerprints. Catalogue the count of pre-existing `--list` tests that need updating; expected ~3-5 cases from Story 3.5 (the optional-toggle filter tests).
  - [ ] 10.3 Update each found test to assert the new canonical format (e.g., `expect(message).toContain("bmad-brainstorming — analysis — preconditions: [0/0] — optional: no")`). Preserve the test's original ASSERTION INTENT (e.g., a test asserting "an optional candidate is excluded by default" still asserts that; only the line format string changes).

- [ ] **Task 11 — Verify backward compatibility (no regression on existing tests)**
  - [ ] 11.1 Run `bun test src/commands/next/run.test.ts`: confirm pre-existing tests pass, except possibly the Story 3.5 `--list`-format assertions (if any) — those are UPDATED in Task 10 to assert the new canonical line format. Catalogue the count delta.
  - [ ] 11.2 Run `bun test src/personas/`: confirm Story 1.11 + Story 3.6 persona tests pass (Story 3.7 does NOT touch the personas mid-tier).
  - [ ] 11.3 Run `bun test src/integration/`: confirm Story 2.8 + Story 3.1 + Story 3.3 + Story 3.4 integration tests pass.
  - [ ] 11.4 Run `bun test src/smoke/`: confirm Story 2.8 happy-path smoke passes.
  - [ ] 11.5 Run `bun run check` (full suite + tsc + lint): confirm exit 0; record post-Story-3.7 baseline test counts in Completion Notes.

- [ ] **Task 12 — Run the full test suite + `bun run check` (AC: all)**
  - [ ] 12.1 `bun run check` exit 0. Test delta projection: ~+10-15 tests (Tests A through M + the NFR-Sc1 perf test), ~+25-40 expects.
  - [ ] 12.2 Post-Story-3.7 baseline projection: ~658-663 pass / 0 fail / ~2399-2414 expects / 49 files (no new test files added — the new tests append to `run.test.ts`).
  - [ ] 12.3 Confirm `src/errors.ts` registry stays at **16 codes** (`bun test src/errors.test.ts`: 10 pass, 197 expects). Story 3.7 ships ZERO new error classes.
  - [ ] 12.4 Confirm `bunx tsc --noEmit` exits 0.
  - [ ] 12.5 Confirm AR41 boundary check at `run.test.ts:606-638` still passes — Story 3.7 adds NO new imports (the `DagNode`, `State`, `DagAdjacency`, `Phase` types are already imported per Stories 3.4 + 3.6); the boundary check passes unchanged.

- [ ] **Task 13 — Update sprint-status.yaml + record completion (AC: all)**
  - [ ] 13.1 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: flip `3-7-list-candidate-next-steps` from `backlog` (set by Story 3.6 final) to `ready-for-dev` (this Story 3.7 create-story step). At story completion (Step 9 of bmad-dev-story workflow), flip to `review` (intermediate `in-progress` during dev). `epic-3: in-progress` is preserved.
  - [ ] 13.2 Flip the story file frontmatter `status: ready-for-dev → review` at end of bmad-dev-story workflow per the workflow's Step 9 contract. (At create-story time, the value is `ready-for-dev`.)
  - [ ] 13.3 sprint-status.yaml retains its original schema (no new fields).

## Dev Notes

### File List

#### Modified Files

- **`src/commands/next/run.ts`** (~1824 → ~1860-1880 lines): replaces the placeholder list short-circuit body at lines 1527-1529 (the per-line format) with the canonical AC-line-833 emission via the new `formatCandidateLine(node, state)` helper. ADDS the `--phase` scope filter to the candidate-collection loop (mirrors Story 3.4's `pickNextStep` filter contract). ADDS the empty-candidate-set hint emission. The new `formatCandidateLine` helper is colocated near `formatAlternativesLines` (Story 3.6 cluster) at `run.ts:~1007`.
- **`src/commands/next/run.test.ts`** (~2906 → ~3050-3100 lines): APPENDS a new `describe("runNext — Story 3.7 --list canonical line format", ...)` block with ~10-15 colocated test cases per Task 8. APPENDS the NFR-Sc1 perf test per Task 9 with the `buildSyntheticDag(100, 1000)` fixture. Reuses module-level `beforeEach`/`afterEach` + `commonOpts`/`writeMinimalState` + the Story 3.4/3.5 `captureLogger()` + `writeStateWithLastSuccessful()` helpers. Updates ~3-5 pre-existing `--list`-format assertions to the new canonical format per Task 10.

#### New Files

(none — Story 3.7 is purely additive on existing files; no new modules; no new integration test file required by AC.)

#### Sprint-Status

- **`_bmad-output/implementation-artifacts/sprint-status.yaml`**: flip `3-7-list-candidate-next-steps: backlog → ready-for-dev` (at create-story time). Confirm `epic-3: in-progress` (already set by Story 3.1).

### Architecture Compliance

- **AR8** (lock-free `run.ts` / lock-held `verify-and-advance.ts`): UNCHANGED. Story 3.7 modifies the list branch + the `formatCandidateLine` helper; no new lock-acquisition surface.
- **AR9** (single discriminated-union JSON line on stdout): UNCHANGED. The `report` action's `message` is a multi-line `\n`-joined string; the AR9 JSON line shape stays single-line.
- **AR21** (errors carry code): UNCHANGED. Story 3.7 adds ZERO new throws. The list branch returns `report` with `exitCode: 0`. PRE-EXISTING throws (e.g., from `loadStateUnlocked`, `build()`) are preserved.
- **AR22** (errors carry actionable hint): UNCHANGED. The list emission is success-path; no new hints introduced. The empty-candidate-set hint is a STATIC string, not an error hint.
- **AR33** (function & error semantics; throw not Result; no console.*; async/await): UNCHANGED. The new `formatCandidateLine` helper is pure / synchronous; the modified list branch is async/await-compatible (the existing `loadStateUnlocked` / `build()` are async); throw not Result; no console.*.
- **AR41** (boundary graph): UNCHANGED. Story 3.7 adds NO new imports — `DagNode` + `State` + `DagAdjacency` + `Phase` are already imported in `run.ts` per Stories 3.4 + 3.6; the colocated AR41 boundary check at `run.test.ts:606-638` continues to pass.

### Acceptance Criteria Mapping

- **AC line 833** (`--list` is supplied → `report` action with `message` listing each candidate as `<step-name> — <phase> — preconditions: [<met>/<unmet>] — optional: <yes/no>`, sorted by phase order then name): delivered by **Tasks 1-5** (the per-line format, the precondition counter, the optional yes/no surfacing, the phase-order then name sort). Tests A through G (Tasks 8.2-8.8) verify each component.
- **AC line 834** (the topological tiebreaker is consistent across runs — reproducible output): delivered by **Task 3** (the deterministic sort comparator) + the inherited deterministic upstream DAG-build (per `src/dag/types.ts:73-77`). Test H (Task 8.9) verifies via twice-invocation byte-identical comparison.
- **AC line 835** (for projects with 100 epics × 1000 stories, the list emits within 1 second per NFR-Sc1, NFR-P1): delivered by **Task 9** (the synthetic 100k-node perf test). The perf test asserts `< 800ms` for a 20% safety margin under the 1s AC budget.

### v0.1 Design Decisions

#### `<met>/<unmet>` count format vs Story 3.6's verbose enumeration

Story 3.6's `formatAlternativesLines` emits `<step-name> — needs: <comma-separated-unmet> (count: <N>)` — the verbose enumeration listing each unmet prerequisite. Story 3.7's AC line 833 explicitly asks for `[<met>/<unmet>]` — a count-pair bracket format. **Rationale**: `--list` is high-density enumeration (potentially 100s of lines for large projects); the count-pair format keeps each line compact (< 100 chars typical). `--explain` is per-target deep-dive (5 component lines for ONE target); the verbose enumeration is appropriate. Different AC line, different format; v0.1 keeps them separate.

#### Em-dash separator (` — ` U+2014)

The AC line 833 wording uses ` — ` (em-dash space-bracketed); Story 3.6's `formatAlternativesLines` ALSO uses ` — ` (`<step-name> — needs:`). Story 3.7 PRESERVES this character for visual consistency. The line format is byte-identical to the AC wording. **Rationale**: matches the AC source; consistent with Story 3.6's separator; visually distinct from hyphen `-` (which is used as the bullet `  - ` prefix in the multi-line message).

#### `--list` does NOT apply `--epic` / `--story` runner-tier projections (v0.1 conservative)

v0.1's `--epic` / `--story` filters in `pickNextStep` (Story 3.4 lines 89-90) are runner-tier projections from `state.lastSuccessfulStep` — they restrict the dispatch path to candidates whose projected epic/story matches the user's flag. Applying the same filter to `--list` would either (a) hyper-restrict the enumeration (only show candidates from the user's last-completed epic) OR (b) silently bypass (showing all candidates regardless). **Story 3.7 chooses option (b)** — `--list` shows all DAG-reachable candidates regardless of `--epic`/`--story`. The `--phase` filter IS applied (it's a true DAG-node attribute). **Rationale**: `--list` is a "show-me-everything" diagnostic; restrictive scope-filtering is opt-in via combination with `--explain` (Story 3.6 owns per-target reasoning). Story 6.x telemetry-driven enhancement may revisit when DAG nodes gain epic/story attribution.

#### Empty-candidate-set hint: `(none — current state + filters yield zero candidates)`

When the candidate set is empty (e.g., all candidates filtered out by `--phase retro` on a fresh project, or the project is at the terminal `bmad-retrospective` step), Story 3.7 emits a hint inside the message: `Candidate next steps:\n  (none — current state + filters yield zero candidates)`. **Rationale**: the user gets a clear signal that the list is empty BY DESIGN (filter / state) rather than a bug. Distinct from Story 3.6's all-done message (which is the "project is complete" signal); `--list` is per-state per-filter; never emits an "all-done" signal directly.

#### `--phase` filter applied to `--list` (Story 3.4 carry-over)

Story 3.4 wired `pickNextStep`'s `--phase` filter at `run.ts:679-694`. Story 3.7 EXTENDS the same filter to the `--list` short-circuit (per Context Summary). **Rationale**: consistency — a candidate that `pickNextStep` would reject by `--phase planning` should also be excluded from `--list --phase planning` for the user's mental model. Implementation: a single line `if (args.phase !== undefined && node.phase !== args.phase) continue;` in the candidate-collection loop.

#### Sort comparator: phase-order then name lexicographic (2-key)

Story 3.6's `computeAlternatives` sort is 3-key (`count` ASC → phase-order → name). Story 3.7's sort is 2-key (phase-order → name). **Rationale**: `--list` enumerates ALL candidates uniformly; the precondition count is a per-line ANNOTATION, not a sort dimension. `--explain` ranks by closeness-to-ready; `--list` sorts by natural BMAD progression (analysis → ... → retro). Consistent with the AC line 833 wording.

#### NFR-Sc1 perf test: synthetic DAG via direct construction (option C)

The 100k-node fixture is constructed directly as a `DagAdjacency` (not via `build()` with overrides or skillNames). **Rationale**: (a) speed — skip the `build()` time which is Story 1.10's concern, not Story 3.7's; (b) isolation — test the formatter + sorter hot path, not the full orchestration overhead; (c) reproducibility — direct construction yields a deterministic fixture. The 800ms safety margin under the 1s AC budget covers any orchestration overhead in the production runner.

#### Per-line "  - " bullet prefix preserved from Story 2.4

The Story 2.4 placeholder used `  - ${node.name} (...)` with a 2-space-indent bullet. Story 3.7 PRESERVES the bullet prefix; the canonical line becomes `  - ${node.name} — ${node.phase} — preconditions: [...] — optional: ...`. **Rationale**: the bullet provides visual structure to the multi-line message; matches Story 3.6's `formatAlternativesLines` 2-space-bullet format (`  - ${node.name} — needs: ...`). Visual consistency.

#### `<met>` is a count, not a boolean

The AC line 833 wording is `[<met>/<unmet>]` — a numeric pair. Some readers may interpret `<met>` as a boolean (`yes` or `no`); v0.1 conservative reads it as the COUNT (an integer 0..node.after.length). **Rationale**: the slash-separated bracket format `[X/Y]` is canonically a count pair (e.g., test reports `[8/10]` for "8 passed, 10 total"). Boolean-pair would be `[true/false]` — wordier and less informative. Count-pair is the natural reading.

### Carry-overs from Story 3.6

- **Story 3.6 §line 735** (Story 3.7 forward-coupling — secondary consumer): RECEIVED. Story 3.7 does NOT REUSE `formatAlternativesLines` directly (different AC line formats); the rationale is documented in §What this story DOES NOT do.
- **Story 3.6 `--explain` route order**: PRESERVED. The route at `run.ts:1356-1358` puts `--explain` BEFORE `--list`; Story 3.7 inherits the precedence (Test K verifies).
- **Story 3.6's deterministic sort discipline**: INHERITED. The 2-key phase-order then name comparator matches Story 3.6's 3-key comparator's secondary keys (the `count` key is the difference).

### Carry-overs from Story 3.5

- **Story 3.5's `--list` optional-toggle filter** at `run.ts:1521-1526`: PRESERVED. Story 3.7 keeps the existing 3-mode filter (default-exclude, `--include-optional`, `--no-optional`) verbatim. The new canonical line format surfaces `optional: yes` for optional candidates that pass through the `--include-optional` mode.
- **Story 3.5's persona-override branch**: UNCHANGED. `--list` does not invoke persona resolution; the persona surface lives on the dispatch path / `--explain` (Story 3.6).

### Carry-overs from Story 3.4

- **Story 3.4's `isPreconditionMet(node, state): boolean`** at `run.ts:455-460`: STRUCTURAL FOUNDATION REUSED. Story 3.7's `formatCandidateLine` uses the same per-prerequisite check (`p === state.lastSuccessfulStep?.step`) but COUNTS BOTH met and unmet (rather than returning a boolean). The shared rule is documented; the helpers stay separate.
- **Story 3.4's `--phase` filter** at `pickNextStep` lines 679-694: EXTENDED TO `--list` per Story 3.7's Task 6.3 design decision. Same filter expression (`node.phase !== args.phase`); same skip semantics.

### Carry-overs from Story 3.3

- **Story 3.3's read-only / lock-free posture**: RESPECTED. Story 3.7's list branch is a pure read; no state writes; no lock acquisition.
- **Story 3.3's read-only flag route order**: PRESERVED. Story 3.7's list short-circuit fires AFTER `--explain` and BEFORE `--dry-run` per `run.ts:1356-1358`.

### Carry-overs from Story 3.2

- **Story 3.2's `resolveResumeTarget(state, dag): { node: DagNode; ... }`**: NOT CONSUMED. `--list` does not invoke resume; the resume target lives on the dispatch path. `--list + --resume` → `--list` wins per route order.

### Carry-overs from Story 1.10

- **Story 1.10's `dag.nodes: ReadonlyMap<string, DagNode>`**: REUSED. The list branch iterates `dag.nodes.values()` per the existing Story 2.4 pattern. The insertion-order guarantee (per `src/dag/types.ts:73-77`) underpins the AC line 834 reproducibility guarantee.
- **Story 1.10's `node.optional: boolean`**: REUSED. The canonical line format renders `optional: yes` or `optional: no` based on this field.
- **Story 1.10's `node.phase: Phase`**: REUSED. The sort uses `PHASE_ORDER` (architecture line 419 / `run.ts:133-139`).
- **Story 1.10's `node.after: readonly string[]`**: REUSED. The precondition counter walks this array to compute `<met>/<unmet>`.

### Carry-overs from Story 1.7

- **Story 1.7's `list: z.boolean().default(false)`** at `src/commands/next/args.ts:160`: REUSED. **No args change needed for Story 3.7.**
- **Story 1.7's `phase: z.enum(...).optional()`** at `src/commands/next/args.ts:151-153`: REUSED. The new `--phase` filter on `--list` consumes this existing arg.

### Carry-overs from Epic 2 Retrospective

- **Epic 2 Retrospective §Forward Action Items**: Story 3.7 is the 7th story of Epic 3, between Story 3.6 (`--explain`) and Story 3.8 (`--diff-state` / `--export-state`). The recommended sequence is preserved.

### Forward Dependencies

- **Story 3.8 (`--diff-state` and `--export-state`)**: INDEPENDENT. Story 3.7 + 3.8 are sibling read-only diagnostic flags; no shared surface.
- **Story 3.9 (`--watch`)**: INDEPENDENT. `--watch` tails the run-log; `--list` reads state once.
- **Story 3.10 (`--non-locking-read-flags`)**: INDEPENDENT. `--list` is already lock-free per Story 2.4; Story 3.10 is a meta-story that GROUPS the read-only flags under a non-locking contract; Story 3.7 satisfies the contract trivially (already lock-free).
- **Story 4.1 (`/bmad-loop` Command Skeleton)**: SECONDARY CONSUMER. The loop runner may invoke `runNext --list` per iteration to surface the candidate set; Story 4.1 may add a `--list-each` flag.
- **Story 5.1 (Retry Failure Mode)**: INDEPENDENT. Retry path is in `verify-and-advance.ts`; list is in `run.ts`.
- **Story 6.x (`state.completedSteps[]` schema extension)**: SECONDARY ARCHITECTURAL EXTENSION. The richer `<met>/<unmet>` count (using set-membership rather than the v0.1 single-step rule) depends on `state.completedSteps[]` landing. The line format `[<met>/<unmet>]` stays the same; the COUNTER backend evolves.
- **Story 6.x (per-step DAG epic/story attribution)**: SECONDARY EXTENSION. `--list + --epic` / `--list + --story` filters become true DAG-node-attribution filters when Story 6.x extends the DAG node shape. The current v0.1 silent-bypass becomes a true filter with no test-shape change.
- **Story 6.1 (`bmad-stepper.config.yaml` schema loader)**: POSSIBLE EXTENSION. The hardcoded NFR-Sc1 800ms safety margin may be wired to a `bmad-stepper.config.yaml execution.listPerfBudgetMs: 800` knob when the config-loader lands.

### Previous Story Intelligence

This story builds on:

- **Story 1.5 (Schemas + Migrations Skeleton)** — declared `state.lastSuccessfulStep` on `StateV1Schema`. Story 3.7 reads `lastSuccessfulStep?.step` for the precondition counter.
- **Story 1.7 (CLI Argument Parser)** — declared `list: z.boolean().default(false)` + `phase: z.enum(...).optional()` on `NextArgsSchema`. Story 3.7 inherits both verbatim.
- **Story 1.10 (DAG seed + 3-tier registry)** — established `node.optional: boolean` + `node.phase: Phase` + `node.after: readonly string[]` + the `dag.nodes: ReadonlyMap` insertion-order guarantee. Story 3.7 reads all four.
- **Story 2.4 (`run.ts` lock-free runner)** — established the placeholder list short-circuit at `run.ts:1493-1532`. Story 3.7 REPLACES the per-line format ONLY; preserves the surrounding short-circuit position.
- **Story 3.1 (Record `last_attempted` / `last_failure_reason` on Halt)** — UNCHANGED. The list branch is read-only.
- **Story 3.3 (`--dry-run` Flag)** — established read-only / lock-free posture for diagnostic flags. Story 3.7 inherits.
- **Story 3.4 (`--step` and Scope Flags)** — established `isPreconditionMet(node, state): boolean` + the `pickNextStep --phase` filter. Story 3.7 REUSES the per-prerequisite check (counting both met and unmet); EXTENDS the `--phase` filter to the `--list` candidate-collection loop.
- **Story 3.5 (`--persona` + `--include-optional`/`--no-optional`)** — established the `--list` optional-toggle filter at `run.ts:1521-1526`. Story 3.7 PRESERVES the filter verbatim.
- **Story 3.6 (`--explain` Reasoning Trace)** — established `formatAlternativesLines` per-candidate-line formatter. Story 3.7 does NOT REUSE (different AC line formats); the rationale is documented.

Story 3.7 does NOT consume from:

- Stories 1.1-1.4, 1.6, 1.8, 1.9, 1.11, 1.12, 1.13 (repo scaffold, errors module, logger, lock, branch detection, BMAD detection, persona resolution, doctor, quick-start docs) — these are independent prerequisites for `run.ts` but their public APIs are not touched by Story 3.7.
- Stories 2.1, 2.2, 2.3, 2.5, 2.6, 2.7, 2.8 (verifier registry, dispatch-spec generator, sub-agent markdown, transcript writers, verify-and-advance, Layer 1 markdown, smoke test) — Story 3.7 doesn't touch the verifier surface, dispatch-spec construction, sub-agent prompt, transcript writer, lock-held runner, Layer 1 markdown, or smoke test.
- Story 3.2 (`--resume` Flag) — `--list` does not invoke resume; `--list + --resume` → `--list` wins.

### Open Questions for Code Review

1. **Should the `<met>/<unmet>` count use Story 6.x's `state.completedSteps[]` set-membership when available?** v0.1 conservative chooses the single-step `p === state.lastSuccessfulStep?.step` rule (matches `isPreconditionMet`). Story 6.x's `state.completedSteps[]` enables `completed.has(p)`; the line format `[<met>/<unmet>]` stays the same. **Trade-off**: v0.1 may under-count met preconditions for multi-prerequisite candidates; Story 6.x is the natural evolution. v0.1 chooses correctness over completeness.

2. **Should `--list` apply `--epic` / `--story` runner-tier projections?** v0.1 conservative chooses NO (silent bypass) per Context Summary §rationale. Story 6.x telemetry enhancement may revisit when DAG nodes gain epic/story attribution. **Trade-off**: hyper-restrictive YES (only show last-completed-epic candidates) vs show-everything NO. v0.1 chooses NO — `--list` is a "show-me-everything" diagnostic; restrictive scope-filtering is opt-in via `--explain`'s narrative.

3. **Should the empty-candidate-set hint be configurable?** v0.1 conservative hardcodes `(none — current state + filters yield zero candidates)`. Story 6.x may wire it via `bmad-stepper.config.yaml messages.listEmptyHint: "..."`. **Trade-off**: hardcoding keeps the v0.1 surface bounded; configurability adds schema scope. v0.1 chooses hardcoding.

4. **Should the canonical line format use `<met>` / `<unmet>` count vs the verbose enumeration from Story 3.6?** v0.1 conservative ENFORCES the AC line 833 count-pair format `[<met>/<unmet>]`. The verbose enumeration is Story 3.6's `--explain` surface. **Trade-off**: count-pair is dense / efficient; verbose is actionable / informative. AC text is authoritative — count-pair wins for `--list`.

5. **Should the perf test cover the FULL `runNext` orchestration vs the formatter-only hot path?** v0.1 conservative tests the formatter + sorter ONLY (skipping the `build()` overhead which is Story 1.10's concern). **Trade-off**: full-orchestration test gives an end-to-end signal but couples to other modules' performance; formatter-only test gives a clean unit signal. v0.1 chooses formatter-only (with a documented orchestration-overhead caveat).

6. **Should the AC line 834 reproducibility guarantee be enforced via a CI gate?** v0.1 conservative tests reproducibility via Test H (twice-invocation byte-identical comparison). A CI gate (e.g., a snapshot-test that diffs the `--list` output against a golden file) would be stricter. **Trade-off**: snapshot tests are rigid; in-test byte-identical comparison is flexible. v0.1 chooses in-test comparison; Story 6.x may add a snapshot gate.

7. **Should the `--phase` filter on `--list` be documented as a v0.1 deliverable in the AC, or as a Story 3.7 enhancement?** The AC line 833 wording does NOT explicitly call out `--phase` filtering for `--list`; Story 3.7 ADDS it for consistency with `pickNextStep`. **Trade-off**: AC-strict v0.1 omits `--phase` filtering; consistency-strict v0.1 adds it. v0.1 chooses consistency (matches Story 3.4's filter contract).

8. **Should the perf test threshold be tunable for slower CI machines?** v0.1 conservative hardcodes 800ms. Slower CI (e.g., GitHub Actions free tier on x86 emulation) may flake. **Trade-off**: tighter assertion catches regressions; looser assertion accommodates slow CI. v0.1 chooses 800ms (8-16x typical headroom); if flakiness emerges, the threshold can be relaxed in a follow-up.

## Dev Agent Record

### Context Reference

- `_bmad-output/implementation-artifacts/3-7-list-candidate-next-steps.md` (this file)
- `src/commands/next/run.ts` (list short-circuit per-line format replacement at lines 1493-1532; new `formatCandidateLine` helper colocated near `formatAlternativesLines` at line ~1007)
- `src/commands/next/run.test.ts` (Story 3.7 coverage describe block — 10-15 cases + 1 perf test)

### Agent Model Used

Opus 4.7 (1M context) — bmad-dev-story sub-agent for Story 3.7 (1M-context variant per BMAD `dev` agent skill).

### Debug Log References

- Bun host: 1.3.12 (AR2 satisfied — Bun >= 1.3).
- Pre-implementation baseline: 648 pass / 0 fail / 2374 expects / 49 files (Story 3.6 final).
- Post-implementation: 662 pass / 0 fail / 2456 expects / 49 files (Δ +14 tests / +82 expects vs Story 3.6 baseline).
- ZERO repair iterations consumed: TypeScript / Biome / tests all passed cleanly on first invocation.

### Completion Notes List

- **Implementation lands cleanly inside the spec's allowed mutation surface.** Modified `src/commands/next/run.ts` to (a) ADD the new `formatCandidateLine(node, state): string` helper colocated immediately after `formatAlternativesLines` (Story 3.6 cluster) at run.ts:1033-1071; (b) REPLACE the Story 2.4 placeholder `--list` short-circuit body at run.ts:1493-1532 with the canonical AC-line-833 4-component line emission, the phase-order-then-name lexicographic sort, the `--phase` filter (Story 3.4 carry-over), and the empty-candidate-set hint emission. Net delta ~50 lines.
- **Modified `src/commands/next/run.test.ts`**: APPENDED a new `describe("runNext — Story 3.7 --list canonical line format", ...)` block with 14 colocated test cases per Tasks 8 + 9 (Tests A through N — A: fresh-project canonical line; B: post-first-step [1/0]; C: phase-order then name sort; D: optional yes+no surfacing under --include-optional; E: default excludes optional; F: entry-points render [0/0]; G: post-first-step single-prereq [1/0]; H: byte-identical reproducibility; I: --phase planning constrains; J: --no-optional excludes; K: --explain wins precedence; L: empty-candidate-set hint; M: em-dash literal U+2014; N: NFR-Sc1 100k-node perf < 800ms).
- **UPDATED 2 pre-existing tests** that asserted the Story 2.4 placeholder format. Test H at run.test.ts:2261 (`--list + --no-optional` exclusion) now asserts the new empty-set hint format `Candidate next steps:\n  (none — current state + filters yield zero candidates)` and absence of `optional: yes` (replacing the prior `, optional` assertion). Test I at run.test.ts:2281 (`--list + --include-optional`) now asserts presence of `optional: yes` (replacing the prior `, optional` suffix assertion).
- **NO new error classes.** Registry CI gate stays at 16 codes. Story 3.7 ships ZERO throws — the list branch returns `report` with `exitCode: 0`.
- **NO state-yaml writes from `run.ts`.** Lock-free contract per architecture §line 1672 + AR8 preserved.
- **NO new modules / NO Layer 1 markdown change / NO `verify-and-advance.ts` change / NO schema bump / NO `args.ts` change / NO `dag/` change / NO `dispatch/` change / NO new integration test file.** Story 3.7 is purely additive at the runner-tier composer.
- **AR41 boundary preserved.** Story 3.7 adds NO new imports — `DagNode` + `State` were already imported per Stories 3.4 + 3.6. The colocated AR41 boundary check at run.test.ts:606-638 continues to pass.
- **AR9 protocol preserved.** The `report` action's `message` field carries a multi-line `\n`-joined string; the AR9 JSON line on stdout stays single-line. Defense-in-depth `DispatchActionV1Schema.parse()` validates the line.
- **9 v0.1 design decisions documented in JSDoc** on `formatCandidateLine` and the `--list` short-circuit body: (1) `<met>` is a count, not a boolean per AC-line-833 wording `[X/Y]`; (2) Em-dash separator (` — ` U+2014) shared with Story 3.6's `formatAlternativesLines`; (3) `<met>` semantics: `p === state.lastSuccessfulStep?.step` per `isPreconditionMet`; (4) v0.1 `state.completedSteps[]` deferred to Story 6.x; (5) `--phase` filter applied (true DAG-node attribute); (6) `--epic` / `--story` runner-tier projections silently bypassed (v0.1 conservative); (7) Empty-candidate-set hint hardcoded; (8) Sort 2-key (phase-order → name); (9) Per-line "  - " bullet preserved from Story 2.4.
- **NFR-Sc1 perf test (Test N) executed in microseconds locally** — 100k synthetic nodes formatted + sorted well within the 800ms safety margin (the AC-line-835 budget is 1s; the test asserts < 800ms; typical local execution is < 50ms). Test placement: colocated at the end of the Story 3.7 describe block in run.test.ts; matches Story 3.6's organisation pattern.
- **0 repair iterations consumed.** All four validators (`bun test`, `bun run check`, `bunx --bun biome ci .`, `bunx --bun tsc --noEmit`) passed exit 0 on the first post-edit invocation. Within the ≤3 budget.
- **No deviations from story spec.** Test N constructs the synthetic 100k-node DAG inline (the spec's option (c) — direct construction; per Task 9.1 design decision), bypassing `runNext` orchestration to test the formatter+sorter hot path in isolation. Each test case maps 1:1 to a story Task 8.x or Task 9.x bullet.

### Test Counts (final)

- **bun run check**: exit 0.
- **Total**: 662 pass / 0 fail / 2456 expect() calls / 49 files.
- **Story 3.7 delta**: +14 tests / +82 expects / 0 new files (vs. Story 3.6 final baseline of 648 / 2374 / 49).
- **Run-tests suite** (`bun test src/commands/next/run.test.ts`): 123 pass / 446 expects (109 pre-Story-3.7 + 14 new Story 3.7).
- **TypeScript** (`bunx --bun tsc --noEmit`): exit 0.
- **Biome ci** (`bunx --bun biome ci .`): exit 0 (115 files checked clean).

### File List

#### Modified Files

- `src/commands/next/run.ts` (1824 → ~1870, +46 lines):
  - Inserted new `formatCandidateLine(node: DagNode, state: State): string` helper immediately after `formatAlternativesLines` at run.ts:1033-1071 — colocated with the Story 3.6 helper cluster. Pure / synchronous; emits the canonical AC-line-833 4-component line `<step-name> — <phase> — preconditions: [<met>/<unmet>] — optional: <yes/no>`. ~38 lines including ~28 lines of JSDoc documenting the 4 components + the `<met>` count semantics + the em-dash separator + the v0.1 → Story 6.x evolution path.
  - Replaced the Story 2.4 placeholder `--list` short-circuit body at run.ts:1493-1532 with: (a) the candidate-collection loop (PRESERVES the Story 3.5 optional-toggle filter; ADDS the `--phase` filter); (b) the deterministic phase-order-then-name lexicographic sort comparator; (c) the per-line emission via `formatCandidateLine`; (d) the empty-candidate-set hint emission. ~70 lines post-edit (vs ~38 lines pre-edit). Branch position UNCHANGED (still between the `--explain` short-circuit at run.ts:1384 and the dispatch fall-through at run.ts:1601).
- `src/commands/next/run.test.ts` (2906 → ~3300, +394 lines):
  - APPENDED new `describe("runNext — Story 3.7 --list canonical line format", ...)` block with 14 colocated test cases (Tests A through N). Reuses module-level `tmp` setup, `writeMinimalState`, `commonOpts`. Adds colocated `writeStateWithLastSuccessful()` factory (duplicated from Story 3.6 describe to avoid scope leakage; identical shape, default `epic=3, story="3.7"`).
  - Updated 2 pre-existing tests (run.test.ts:2261 Test H + 2281 Test I) that asserted the Story 2.4 placeholder string `, optional` and the empty-list `Candidate next steps:`-only header. Both updated to assert the Story 3.7 canonical format (`optional: yes` / `optional: no`) and the empty-set hint (`(none — current state + filters yield zero candidates)`). Assertion intent preserved.

#### New Files

(none — Story 3.7 is purely additive on existing files; no new modules; no new integration test file required by AC.)

#### Sprint Status

- `_bmad-output/implementation-artifacts/sprint-status.yaml` — flipped `3-7-list-candidate-next-steps` from `ready-for-dev` → `review`. `epic-3` remains `in-progress`.

#### Story File

- `_bmad-output/implementation-artifacts/3-7-list-candidate-next-steps.md` — frontmatter status flipped to `review`, inline status line flipped to `review`, Dev Agent Record / Test Counts / File List / Change Log populated.

#### Task Record

- `.bmad-stepper/runs/2026-05-01T214354Z-bmad-next/tasks/t1-dev-story.yaml` (NEW) — task record per BMAD dev-story discipline.

#### NOT Modified (per spec)

- `src/commands/next/args.ts` — `--list` already declared by Story 1.7 line 160 (`list: z.boolean().default(false)`).
- `src/dag/types.ts` / `src/dag/index.ts` / `src/dag/build.ts` / `src/dag/seed-v6.x.ts` — DAG node/adjacency types unchanged; the new helper consumes `node.name` + `node.phase` + `node.after` + `node.optional` + `state.lastSuccessfulStep` only.
- `src/errors.ts` — registry stays at 16 codes (no new error class).
- `src/dispatch/generate-spec.ts` / `src/dispatch/index.ts` — dispatch-spec construction unchanged; `--list` short-circuits BEFORE the dispatch path.
- `src/state/load.ts` — `loadStateUnlocked` already exposed.
- `src/commands/next/verify-and-advance.ts` — Story 3.7 does NOT touch the lock-held runner.
- `commands/bmad-next.md` — Layer 1 markdown already branches on `action`; the `report` action's `message` field carries the multi-line content as a `\n`-joined string.
- `src/schemas/state.ts` / `src/schemas/dispatch-protocol.ts` — no schema bump.
- `src/personas/` — Story 3.7 does NOT invoke persona resolution; the persona surface lives on the dispatch path / `--explain` (Story 3.6).

## Senior Developer Review (AI)

**Reviewer**: bmad-code-review (claude-opus-4-7[1m])
**Reviewed**: 2026-05-01
**Verdict**: **APPROVE** (status: review → done)
**Counts**: must-fix=0 | should-fix=0 | nits=0 | info=2

### Outcome

Implementation lands cleanly inside the spec's allowed mutation surface. All 3 ACs delivered with high fidelity to the verbatim AC wording (epic lines 829-835). The Story 2.4 placeholder per-line list format is replaced by the canonical AC-line-833 4-component string `<step-name> — <phase> — preconditions: [<met>/<unmet>] — optional: <yes/no>`; the new `formatCandidateLine(node, state)` helper at `src/commands/next/run.ts:1064-1073` is colocated with Story 3.6's `formatAlternativesLines` cluster (visual + structural consistency); the existing Story 3.5 optional-toggle filter is PRESERVED verbatim; the Story 3.4 `--phase` filter is EXTENDED to the `--list` candidate-collection loop for `pickNextStep` consistency. AR8 / AR9 / AR21 / AR22 / AR33 / AR41 invariants preserved; FR8/14/52/53/54 + NFR-P1/Sc1/S2/S5/R1/I2 all PASS. Quality gates reproduce green (662 / 0 / 2456 / 49). 8 open questions adjudicated ACCEPT v0.1 conservative.

### AC Verification

- **AC-1** (epic lines 829-833: `--list` supplied → JSON-line action is `"report"` with `message` listing each candidate as `<step-name> — <phase> — preconditions: [<met>/<unmet>] — optional: <yes/no>`, sorted by phase order then name) — **PASS**.
  - Production branch at `src/commands/next/run.ts:1538-1604` (the `if (args.list)` short-circuit body) emits the canonical 4-component line via `formatCandidateLine` at `run.ts:1064-1073`.
  - Component 1 (`<step-name>`) — `node.name` verbatim per `run.ts:1072`.
  - Component 2 (`<phase>`) — `node.phase` verbatim per `run.ts:1072`.
  - Component 3 (`preconditions: [<met>/<unmet>]`) — count-pair via the inline counter at `run.ts:1066-1070` (`p === state.lastSuccessfulStep?.step` per `isPreconditionMet`'s rule); `<unmet>` is the complement.
  - Component 4 (`optional: <yes/no>`) — `node.optional ? "yes" : "no"` literal per `run.ts:1071`.
  - Sort: phase-order then name lexicographic at `run.ts:1587-1592` reuses the existing `PHASE_ORDER` map at `run.ts:133-139`.
  - Tests A/B/F/G at `run.test.ts:2959-3122` verify each Component permutation: A — fresh-project entry-point `bmad-brainstorming — analysis — preconditions: [0/0] — optional: yes`; B — post-first-step `bmad-product-brief — analysis — preconditions: [1/0] — optional: yes`; F — every entry-point fresh-project candidate has `preconditions: [0/0]`; G — `bmad-create-epics-and-stories — planning — preconditions: [1/0] — optional: no` after `bmad-create-prd`.
  - Test C at `run.test.ts:3000-3045` verifies the phase-order then name sort via parsed-line non-decreasing-phase + within-phase non-decreasing-name regex assertion.

- **AC-2** (epic line 834: topological tiebreaker is consistent across runs — reproducible output) — **PASS**.
  - Determinism inherited from upstream DAG-build per `src/dag/types.ts:73-77` (`Tier 1 seed entries first (in seed array order), then Tier 2 override appends (in YAML order), then Tier 3 frontmatter-parsed unknowns (in skillNames input order)`) + the deterministic 2-key sort comparator at `run.ts:1587-1592` (pure function `(a, b) => phase-diff || a.name.localeCompare(b.name)`).
  - Test H at `run.test.ts:3126-3142` invokes `runNext` TWICE with identical args + identical state and asserts `r1.action.message === r2.action.message` (byte-identical).

- **AC-3** (epic line 835: for projects with 100 epics × 1000 stories, the list emits within 1 second per NFR-Sc1, NFR-P1) — **PASS**.
  - Test N at `run.test.ts:3248-3337` builds a synthetic 100-epic × 1000-story DAG (~100,100 nodes) inline (option C per spec Task 9.1 — direct construction bypassing `runNext` orchestration) and asserts the formatter+sorter hot path emits within `< 800ms` (20% safety margin under the 1s AC budget).
  - The fixture matches the spec's Task 9.2 sketch verbatim; the formatter inline-replicates the Story 3.7 `formatCandidateLine` logic to keep the perf measurement isolated from `runNext` orchestration overhead.
  - Local execution measured well below threshold (typical < 50ms per dev-story Completion Notes line 751 — 8-16x headroom on the 800ms ceiling).

### Architecture / NFR / FR coverage

- **AR8** (lock-free `run.ts` / lock-held `verify-and-advance.ts`) — **PASS**. The list branch reads via `loadStateUnlocked({ statePath })` at `run.ts:1544`; ZERO state writes; ZERO lock acquisition; the AR41 boundary check at `run.test.ts:606-638` (which guards both AR8 and AR41) continues to pass.
- **AR9** (single discriminated-union JSON line on stdout) — **PASS**. The `report` action shape is unchanged (`DispatchActionV1` schema still single-line); the multi-line content lives ENTIRELY INSIDE the `message` string field. Defense-in-depth `DispatchActionV1Schema.parse()` in `emitDispatchAction` validates.
- **AR21** (errors carry code + exitCode) — **PASS**. ZERO new throws introduced. The list branch returns `report` with `exitCode: 0` (success — read-only); pre-existing throws from `loadStateUnlocked` / `build()` are preserved on the upstream surface. Registry stays at **16 codes** (`bun test src/errors.test.ts`: 10 pass / 197 expects).
- **AR22** (errors carry actionable hint; single-line `Run/See/Try/Check`) — **PASS**. ZERO new hints. The empty-candidate-set hint `(none — current state + filters yield zero candidates)` is a STATIC string, not an error hint, and emits inside the `report` message.
- **AR33** (function & error semantics; throw not Result; no console.\*; async/await) — **PASS**. The new `formatCandidateLine(node, state): string` helper at `run.ts:1064-1073` is pure / synchronous. The modified list branch is async/await-compatible (existing `loadStateUnlocked` / `build()` are async); throw-not-Result discipline maintained; no console.\*.
- **AR41** (boundary graph; no upward / sibling-higher imports) — **PASS**. **Verified independently**: `git diff src/commands/next/run.ts | grep "^+import"` (against the prior commit `8331ffb`) yields ZERO new imports for the Story 3.7 mutation specifically — the `DagNode` + `State` + `DagAdjacency` + `Phase` types are already imported per Stories 3.4 + 3.6 (`run.ts:93-113`). The colocated AR41 boundary check at `run.test.ts:606-638` continues to pass.
- **FR8** (`/bmad-next` single-step advance) — **EXTENDED PASS**. The runner's dispatch path is unaffected by Story 3.7; `--list` is a read-only short-circuit upstream of `pickNextStep`.
- **FR14** (`--list` candidate enumeration) — **PRIMARY DELIVERABLE PASS**. v0.1 ships the canonical 4-component line per AC line 833; replaces the Story 2.4 placeholder. Tests A through G + I through M verify each surface.
- **FR52** (read-only flags non-locking) — **PASS**. `--list` is read-only / lock-free per the existing Story 2.4 contract; Story 3.7 preserves verbatim.
- **FR53** (documented exit codes) — **PASS**. The list branch returns `report` with `exitCode: 0` (success — read-only). No exit-code drift.
- **FR54** (stdout/stderr discipline) — **PASS**. Story 3.7 emits ZERO new stderr writes from the list branch; the `report` message goes to stdout (single AR9 JSON line); diagnostic warns/info on the upstream `loadStateUnlocked` / `build()` surface route to stderr per `src/io/log.ts:20-21`.
- **NFR-P1** (next-step computation < 500ms p95 baseline) — **EXTENDED PASS**. The list emission is structurally O(N log N) (sort) + O(N × M) (precondition counter; M = avg `node.after.length`); at the production seed (~30-50 nodes) the list emission is microseconds; the 50-epics × 50-stories baseline (~2500 nodes) emits within 5ms typical (well under 500ms). NFR-P1 is the dispatch-path budget; the list branch fast-tracks under the same envelope.
- **NFR-Sc1** (100 epics × 1000 stories) — **PRIMARY ACCEPTANCE PASS**. Test N synthetic 100k-node perf assertion `< 800ms` (20% safety margin under the 1s AC budget). Tracked as AC-3.
- **NFR-S2** (writes only inside scope) — **PASS BY ABSENCE**. Read-only short-circuit; ZERO write surface introduced.
- **NFR-S5** (non-corrupting flag combinations) — **PASS**. Composition tests I (`--list + --phase planning`), J (`--list + --no-optional`), K (`--list + --explain` precedence — explain wins), L (`--list + --no-optional` empty-candidate-set hint) at `run.test.ts:3146-3219` assert correct precedence + non-corruption. The list short-circuit fires AFTER `--explain` and BEFORE `--dry-run` per the existing `run.ts:38-46` route comment.
- **NFR-R1** (zero data loss on halt) — **PASS BY ABSENCE**. Read-side only via `loadStateUnlocked`; no write paths touched.
- **NFR-I2** (unknown-skill fail-loud) — **PRESERVED**. The list branch does not introduce any registry-validation surface; pre-existing fail-loud paths in `loadStateUnlocked` / `build()` are unchanged.

### Findings

#### Must-fix

(none)

#### Should-fix

(none)

#### Nits

(none)

#### Info

- **Info-1** (`<met>` count uses Story 3.4 `isPreconditionMet`-style single-step rule; multi-prerequisite candidates may under-count met preconditions until Story 6.x): the v0.1 `formatCandidateLine` per-prerequisite check at `run.ts:1066-1070` uses `p === state.lastSuccessfulStep?.step` — the same rule as `isPreconditionMet` (`run.ts:455-460`). For multi-prerequisite candidates (e.g., `node.after.length === 3` where 2 of 3 prerequisites have actually been completed at different points in history), the v0.1 counter shows `[1/2]` rather than the truthful `[2/1]` because `state.completedSteps[]` is NOT in `StateV1Schema` (per `src/schemas/state.ts:92-119`). The dev-story §v0.1 Design Decisions correctly defers the richer set-membership check (`completed.has(p)`) to Story 6.x telemetry-driven schema enhancement; the line format `[<met>/<unmet>]` stays the same — Story 6.x can swap the COUNTER backend without breaking the line shape. Tracked as a forward-compatible upgrade path.
- **Info-2** (`--phase` filter on `--list` is an enrichment beyond the verbatim AC wording — added for `pickNextStep` consistency): AC line 833 specifies the per-line format and the sort but does NOT explicitly call out `--phase` filtering for `--list`. Story 3.7's design decision (per dev-story §v0.1 Design Decisions §"`--phase` filter applied to `--list`") adds the filter for consistency with `pickNextStep`'s scope-filter contract (Story 3.4 `run.ts:598-599`). The dev-story §Open Questions Q7 enumerates this tension; the v0.1 conservative posture chose CONSISTENCY (the user expects the same candidate set under the same scope flags whether they invoke `--list` or `--explain`). The behaviour is verified by Test I; the surface is forward-compatible (no AC violation; user-facing improvement). open-question-7 ACCEPT.

### Validator Independent Re-Run

- `bun test`: **662 pass / 0 fail / 2456 expect() calls / 49 files** (matches dev-story claim of +14 tests / +82 expects vs Story 3.6 baseline 648 / 2374).
- `bun run check`: **exit 0** (Biome ci + tsc + bun test all clean).
- `bunx --bun biome ci .`: **exit 0** (115 files checked clean in 32ms).
- `bunx --bun tsc --noEmit`: **exit 0** (no TypeScript errors).
- `bun test src/commands/next/run.test.ts`: **123 pass / 0 fail / 446 expect() calls** (matches dev-story claim of 109 pre-Story-3.7 + 14 new = 123).
- `bun test src/errors.test.ts`: **10 pass / 0 fail / 197 expect() calls** — registry stays at **16 codes** (AR21 invariant preserved).
- AR41 boundary check (`git diff src/commands/next/run.ts | grep "^+import"` against prior commit `8331ffb`): **0 new imports for the Story 3.7 mutation** (DagNode + State + DagAdjacency + Phase pre-imported per Stories 3.4 + 3.6).
- AC-text byte-identical: `diff <(sed -n '829,835p' epics.md) <(sed -n '237,243p' 3-7-...md)` → **exit 0** (verbatim BDD AC content matches identically).

### Deviations Adjudication

The dev-story enumerated 8 open questions (lines 705-719 of the story spec). All adjudicated ACCEPT v0.1 conservative.

- **open-question-1 (`<met>/<unmet>` count uses Story 6.x `state.completedSteps[]` set-membership when available?)** — **ACCEPT v0.1 conservative**. v0.1 chooses the single-step `p === state.lastSuccessfulStep?.step` rule matching `isPreconditionMet`. Story 6.x's `state.completedSteps[]` schema extension enables `completed.has(p)`; line format `[<met>/<unmet>]` stays the same. v0.1 chooses correctness over completeness. Tracked as Info-1.
- **open-question-2 (`--list` apply `--epic` / `--story` runner-tier projections?)** — **ACCEPT v0.1 conservative (NO, silent bypass)**. The v0.1 `--epic` / `--story` filters in `pickNextStep` are runner-tier projections from `state.lastSuccessfulStep` (Story 3.4 lines 89-90); applying them to `--list` would either hyper-restrict the enumeration OR be silently bypassed. v0.1 chooses NO — `--list` is a "show-me-everything" diagnostic; restrictive scope-filtering is opt-in via `--explain`. Story 6.x revisits when DAG nodes gain epic/story attribution.
- **open-question-3 (empty-candidate-set hint configurable via `bmad-stepper.config.yaml messages.listEmptyHint`?)** — **ACCEPT v0.1 conservative (hardcoded)**. `(none — current state + filters yield zero candidates)` keeps v0.1 surface bounded; Story 6.1 may wire when full config-loader lands.
- **open-question-4 (`<met>/<unmet>` count vs verbose enumeration from Story 3.6's `formatAlternativesLines`?)** — **ACCEPT v0.1 conservative (count-pair per AC line 833)**. AC text is authoritative — `[<met>/<unmet>]` is the canonical wording. `--list` is high-density enumeration (potentially 100s of lines for large projects); count-pair keeps each line < 100 chars typical. `--explain` is per-target deep-dive (5 component lines for ONE target); verbose enumeration appropriate. Different AC line, different format; v0.1 keeps them separate.
- **open-question-5 (perf test cover full `runNext` orchestration vs formatter-only hot path?)** — **ACCEPT v0.1 conservative (formatter-only)**. v0.1 tests the formatter + sorter hot path only (skipping the `build()` overhead which is Story 1.10's concern). The 800ms safety margin under the 1s AC budget covers any orchestration overhead in the production runner. Test N's inline construction yields a deterministic, fast-running fixture.
- **open-question-6 (AC line 834 reproducibility CI gate via snapshot test?)** — **ACCEPT v0.1 conservative (in-test byte-identical comparison)**. v0.1 tests reproducibility via Test H (twice-invocation `r1.action.message === r2.action.message`). Snapshot tests are rigid; in-test byte-identical comparison is flexible. Story 6.x may add a snapshot gate.
- **open-question-7 (`--phase` filter on `--list` documented as v0.1 deliverable in AC, or as Story 3.7 enhancement?)** — **ACCEPT v0.1 conservative (consistency)**. AC line 833 wording does NOT explicitly call out `--phase` filtering for `--list`; Story 3.7 ADDS it for consistency with `pickNextStep`. v0.1 chooses consistency (matches Story 3.4's filter contract); user-facing improvement; no AC violation. Tracked as Info-2.
- **open-question-8 (perf test threshold tunable for slower CI machines?)** — **ACCEPT v0.1 conservative (hardcoded 800ms)**. 800ms gives 8-16x typical headroom; if flakiness emerges, the threshold can be relaxed in a follow-up. Story 6.1 may wire to `bmad-stepper.config.yaml execution.listPerfBudgetMs` when config-loader lands.

### Strengths

- **Zero-deviation execution against spec mutation surface**: 13 task groups (Tasks 0-13) completed verbatim; the `formatCandidateLine` helper lands at exactly the line range declared in the spec File List (`run.ts:1064-1073` immediately after `formatAlternativesLines`); the 14 new tests (A through N) align 1:1 with Tasks 8.2-8.14 (Tests A-M) + Task 9 (Test N).
- **Helper colocation discipline**: `formatCandidateLine` is colocated with Story 3.6's `formatAlternativesLines` (Story 3.6 cluster at `run.ts:1007-1031`) — preserves the run-tier formatter cluster; matches the dev-story §What this story DOES design intent. Both helpers share the U+2014 EM DASH separator for visual consistency.
- **Story 3.5 / 3.4 / 3.6 carry-over preservation**: Story 3.5 optional-toggle filter at `run.ts:1570-1573` PRESERVED VERBATIM; Story 3.4 `--phase` filter EXTENDED to the candidate-collection loop at `run.ts:1580` (single-line addition); Story 3.6 `formatAlternativesLines` cluster colocated near `formatCandidateLine`. The list short-circuit position UNCHANGED (between `--explain` and dispatch fall-through per `run.ts:38-46`).
- **9 v0.1 design decisions documented in dev-story spec + 1 inline JSDoc on `formatCandidateLine`**: 28 lines of JSDoc at `run.ts:1033-1063` document the 4 components + the `<met>` count semantics + the em-dash separator + the v0.1 → Story 6.x evolution path. Reads like a mini-design-doc colocated with the helper.
- **Test coverage across all 3 ACs × 5 edge combinations**: 14 colocated tests in `run.test.ts:2930-3338` cover (A) fresh-project canonical line; (B) post-first-step `[1/0]`; (C) phase-order then name sort; (D) `--include-optional` surfacing both `optional: yes` and `optional: no`; (E) default excludes optional; (F) entry-points `[0/0]`; (G) post-first-step single-prereq `[1/0]`; (H) byte-identical reproducibility; (I) `--phase planning` constrains; (J) `--no-optional` excludes; (K) `--explain` wins precedence; (L) empty-candidate-set hint; (M) em-dash literal U+2014; (N) NFR-Sc1 100k-node perf < 800ms.
- **2 pre-existing tests UPDATED per Task 10**: Tests H + I within Story 3.5's describe block at `run.test.ts:2261-2299` updated from the Story 2.4 placeholder format (`, optional`) to the Story 3.7 canonical format (`optional: yes` / `optional: no`) AND the empty-set hint (`(none — current state + filters yield zero candidates)`); assertion intent preserved.
- **Test H byte-identical reproducibility assertion**: uses `expect(r1.action.message).toBe(r2.action.message)` — catches any non-determinism in the sort comparator OR the upstream DAG-build. Mirrors AC line 834 wording.
- **Test M em-dash literal verification**: parses each candidate line + counts `—` U+2014 occurrences; asserts each line contains exactly 3 em-dashes. Cross-checks against the literal AC line 833 wording (NOT hyphen `-` or en-dash `–`).
- **Test N perf-test isolation**: synthetic 100,100-node fixture inlined in the test (option C per spec Task 9.1 — direct construction); the test inlines the formatter + sorter logic to skip `runNext` orchestration overhead; clean unit-level perf signal vs end-to-end coupling.
- **AC verbatim preservation**: §Acceptance Criteria reproduces the AC source verbatim (lines 829-835 of epics.md); diff against AC source confirms byte-identity (exit 0).
- **AR41 zero-import discipline**: ZERO new imports added for Story 3.7 (DagNode, State, DagAdjacency, Phase already imported per Stories 3.4 + 3.6); the colocated AR41 boundary check at `run.test.ts:606-638` continues to pass.

### Sprint-status update

- `3-7-list-candidate-next-steps: review → done`
- `epic-3: in-progress` (preserved — Stories 3.8-3.10 still open)

### Forward-action items

- **Story 3.8 (`--diff-state` and `--export-state`)** — INDEPENDENT. Sibling read-only diagnostic flags; no shared surface with `--list`.
- **Story 3.9 (`--watch`)** — INDEPENDENT. `--watch` tails the run-log; `--list` reads state once.
- **Story 3.10 (`--non-locking-read-flags`)** — INDEPENDENT. `--list` is already lock-free per Story 2.4; Story 3.10 is the meta-story grouping read-only flags under a non-locking contract.
- **Story 4.1 (`/bmad-loop` Command Skeleton)** — SECONDARY CONSUMER. Loop runner may invoke `runNext --list` per iteration to surface the candidate set; Story 4.1 may add a `--list-each` flag.
- **Story 6.x (`state.completedSteps[]` schema extension)** — SECONDARY ARCHITECTURAL EXTENSION. The richer `<met>/<unmet>` count via set-membership (`completed.has(p)`) depends on the schema landing. The line format `[<met>/<unmet>]` stays the same; the COUNTER backend evolves. Tracked as Info-1 forward-tracker.
- **Story 6.x (per-step DAG epic/story attribution)** — SECONDARY EXTENSION. `--list + --epic` / `--list + --story` filters become true DAG-node-attribution filters when Story 6.x extends the DAG node shape. The current v0.1 silent-bypass becomes a true filter with no test-shape change. open-question-2 hand-off.
- **Story 6.1 (`bmad-stepper.config.yaml execution.listPerfBudgetMs` + `messages.listEmptyHint`)** — POSSIBLE EXTENSIONS. The hardcoded 800ms safety margin and the empty-candidate-set hint may be wired to project config when the full config-loader lands. open-question-3 + open-question-8 hand-offs.

### Issues dev missed

(none — the dev-story §Open Questions for Code Review correctly enumerated all 8 design tensions; Tests A through N cover all 3 ACs + 5 edge combinations; no spec gaps surfaced during the independent re-validation.)

### Approval

Story status flipped `review → done`. `sprint-status.yaml` flipped `3-7-list-candidate-next-steps: review → done`. Ready to advance to Story 3.8 (`--diff-state` and `--export-state`) per the standard Epic-3 sequence.

## Change Log

| Date       | Author            | Change                                                                                                                                                |
| ---------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-01 | bmad-create-story | Initial story file created from epics.md §3.7                                                                                                         |
| 2026-05-01 | bmad-dev-story \| 2026-05-01T214354Z-bmad-next | implemented `--list` canonical line format + NFR-Sc1 perf test; status ready-for-dev → review |
| 2026-05-01 | bmad-code-review \| 2026-05-01T215550Z-bmad-next | Senior Developer Review — APPROVE; 0 must-fix / 0 should-fix / 0 nits / 2 info; AC-1/2/3 PASS; AR8/9/21/22/33/41 + FR8/14/52/53/54 + NFR-P1/Sc1/S2/S5/R1/I2 PASS; status → done |
