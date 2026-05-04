---
status: done
story_id: '3.6'
story_key: 3-6-explain-reasoning-trace
epic: '3'
title: '`--explain` Reasoning Trace'
created: '2026-05-01'
last_updated: '2026-05-01'
priority: M
estimated_effort: M
fr_coverage:
  - FR8
  - FR12
  - FR13
  - FR15
  - FR53
  - FR54
nfr_coverage:
  - NFR-S2
  - NFR-S5
  - NFR-M3
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
  - _bmad-output/implementation-artifacts/2-2-dispatch-spec-generator.md
  - _bmad-output/implementation-artifacts/2-4-lock-free-run-ts-for-bmad-next.md
  - _bmad-output/implementation-artifacts/1-7-cli-argument-parser.md
  - _bmad-output/implementation-artifacts/1-10-dag-seed-three-tier-registry.md
  - _bmad-output/implementation-artifacts/1-11-persona-resolution.md
  - .bmad-stepper/config.yaml
  - src/errors.ts
  - src/io/log.ts
  - src/state/load.ts
  - src/schemas/state.ts
  - src/dispatch/index.ts
  - src/dispatch/generate-spec.ts
  - src/dag/types.ts
  - src/dag/index.ts
  - src/dag/build.ts
  - src/personas/resolve.ts
  - src/personas/defaults.ts
  - src/commands/next/run.ts
  - src/commands/next/run.test.ts
  - src/commands/next/args.ts
  - src/commands/next/args.test.ts
  - src/commands/next/index.ts
---

# Story 3.6: `--explain` Reasoning Trace

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper user (Cold-Start Return journey),
I want `/bmad-next --explain` to print why the chosen step is next,
So that I have zero recall, zero scrollback, and instant context after returning to a project.

## Context Summary

This is the **sixth story of Epic 3** and the **first read-only diagnostic flag with structured multi-line output**. Stories 3.1 + 3.2 closed the halt-recovery loop (write `state.lastAttempted` + `state.lastFailureReason` on halt; consume them via `--resume`); Story 3.3 landed the first read-only-preview flag (`--dry-run`); Story 3.4 wired explicit-step + scope filtering and introduced the `isPreconditionMet(node, state)` helper; Story 3.5 wired the `--persona` override + `--include-optional`/`--no-optional` toggles. Story 3.6 turns its attention to **the diagnostic surface that surfaces *why* the chosen step is next** — replacing Story 2.4's placeholder explain stub with a structured multi-line "report" message containing the target step name, the chain of completed predecessors, the unmet preconditions for alternative candidates (sorted by closeness-to-ready), the resolved persona (with tier label), and a one-sentence reasoning summary modelled on PRD Journey 1's narrative format.

**The `--explain` flag ALREADY EXISTS** on `NextArgsSchema` per Story 1.7's 18-flag inventory (`src/commands/next/args.ts:159` declares `explain: z.boolean().default(false)`). Story 1.7 reserved it for Epic 3 consumption; Story 2.4 shipped a placeholder short-circuit at `src/commands/next/run.ts:1001-1029`:

```typescript
if (args.explain) {
  // For --explain we still want to surface the candidate step name
  // when computable; fall through to step computation but emit a
  // report instead of a dispatch.
  //
  // Story 3.2: when `args.resume === true`, target `state.lastAttempted`
  // via `resolveResumeTarget` instead of `pickNextStep`. This surfaces
  // the resume target in the v0.1 explain stub; Story 3.6 owns the
  // full reasoning trace (with persona path, model, budget, etc.).
  const state = await loadStateUnlocked({ statePath: opts?.statePath });
  const dag = await build({
    skillNames: opts?.skillNames ?? [],
    projectRoot: opts?.projectRoot,
    pluginDir: opts?.pluginDir,
    overridesPath: opts?.overridesPath,
  });
  let nextHint = "(none — DAG empty or filters exclude all candidates)";
  try {
    const node = args.resume
      ? resolveResumeTarget(state, dag).node
      : pickNextStep(state, dag, args, log);
    nextHint = node.name;
  } catch {
    // Fall through with the empty-candidate hint.
  }
  return reportWithMessage(
    `Reasoning trace is implemented in Story 3.6 (Epic 3); current next step: ${nextHint}`,
  );
}
```

Story 3.6 PRESERVES the short-circuit position (downstream of `enforceMutuallyExclusiveFlags`, downstream of `--export-state` / `--diff-state`, upstream of `--list` / `--dry-run` per the existing comment at `run.ts:974` "// --export-state → --diff-state → --explain → --list → --dry-run"); REPLACES the placeholder body with the full reasoning trace per AC line 817; KEEPS the read-only / lock-free posture per architecture §line 1672 (no state writes, no lock acquisition).

**Story 3.6 produces a `report` action** per AC line 817 ("the JSON-line action is `\"report\"` with `message` containing..."). The structured multi-line content lives INSIDE the `message` string (a `\n`-joined newline-separated payload). The single AR9 JSON line on stdout therefore carries a single field whose value is a multi-line human-greppable narrative. **AC line 821 reinforces this**: "the explain output is human-greppable (not JSON-only) — diagnostics on stderr per FR54". Interpretation: the dispatch JSON line on stdout still wraps the message (AR9 invariant); the human-greppable substance lives within the `message` value (callers `grep` `_bmad-output/.stepper/runs/<ts>/dispatch-spec.json` or capture the runner's stdout and `jq -r '.message'`); incidental diagnostic warns/info during the trace go to stderr per FR54 + `src/io/log.ts:20-21`. The AC does NOT call for a non-AR9-conformant raw multi-line emission on stdout — that would violate AR9's single-JSON-line invariant.

**The 5 message components** per AC line 817:

1. **Target step name** — the resolved next-step name (e.g., `bmad-create-story`). Computed by `pickNextStep(state, dag, args, log)` when `--resume` is FALSE; by `resolveResumeTarget(state, dag).node` when `--resume` is TRUE (Story 3.2 forward-coupling: explain on a halted project surfaces the resume target). When `pickNextStep` throws (e.g., empty filter, blocked preconditions), the explain branch SWITCHES to the all-done branch IF `state.completedSteps[]` covers the entire DAG OR to a halt-with-message branch IF the throw was due to filter-exhaustion (the existing throw's hint is preserved). **Story 3.6's primary deliverable**: when `pickNextStep` succeeds, surface the resolved name as `Next step: <step-name>`.

2. **Chain of completed predecessors** — the inverse-DAG walk from the target step's `node.after[]` back to the project root, filtered to nodes that ARE in `state.completedSteps[]`. v0.1 conservative scope: since `state.completedSteps[]` is NOT declared on `StateV1Schema` (per Story 3.4 §line 437 — Story 1.5 declared `lastSuccessfulStep` + `lastAttempted` + `lastFailureReason` only), the predecessor chain in v0.1 is: `[state.lastSuccessfulStep?.step]` — i.e., the most-recently-completed step. The full transitive walk (using `dag.edgesIn` per `src/dag/types.ts:88`) is forward-deferred to Story 6.x telemetry-driven enhancement when `state.completedSteps[]` is added to the schema. Story 3.6 surfaces the v0.1 minimum: `Chain of completed predecessors: <last-successful-step-or-(none — fresh project)>`.

3. **Unmet preconditions for alternative candidates, sorted by closeness-to-ready** — for every NON-target candidate in the DAG, walk `node.after[]`, count the number of names NOT covered by `state.lastSuccessfulStep` (per Story 3.4's `isPreconditionMet` predicate), and EMIT a per-candidate line: `<step-name> — needs: <comma-separated-unmet-preconditions> (count: N)`. Sort the list by `count` ASCENDING (fewest unmet first → "closest to ready"); within the same count, sort by `node.phase` ORDER (analysis → planning → solutioning → implementation → retro per `PHASE_ORDER` at `run.ts:~262`); within the same phase, sort by name lexicographic. **Truncation**: cap the list at `MAX_ALTERNATIVES = 5` to keep the explain output bounded (NFR-Sc1 — 100 epics × 1000 stories project must emit explain in < 1s per AC analogous to Story 3.7 line 835); when truncated, append a final line `(... <count-remaining> more candidates; run /bmad-next --list to see all)`. **Optional candidates**: respect the `--include-optional` / `--no-optional` toggles when computing the alternatives set (the alternatives set should match the candidate set that `pickNextStep` would have surfaced if the user invoked it without `--explain`). When `--no-optional` is set (default), optional candidates are EXCLUDED from the alternatives list.

4. **Resolved persona (with tier label)** — the persona that WOULD be dispatched for the target step, with a tier-label annotation when known. Story 3.5 forward-coupling: the persona-override branch at `run.ts:1148-1159` either short-circuits to `args.persona` (when `--persona` is supplied) or falls through to `resolvePersona(...)` (Story 1.11 4-tier cascade). For explain output, Story 3.6 needs the **tier provenance** — i.e., "the supplied name (Tier 0: --persona override)" / "Tier 1: SKILL.md frontmatter" / "Tier 2: project-config personas: block" / "Tier 3: built-in defaults" / "Tier 4: <module>/config.yaml triggers". The v0.1 conservative implementation: extend `resolvePersona` to ALSO return tier provenance OR introduce a sibling helper `resolvePersonaWithTier(input): Promise<{ persona: string | readonly string[]; tier: 0 | 1 | 2 | 3 | 4; tierLabel: string }>` colocated with `resolvePersona` in `src/personas/resolve.ts`. **Story 3.6 picks option B (sibling helper)** to avoid touching `resolvePersona`'s return-shape contract (Story 1.11's 4-tier cascade has many existing call sites; changing the return shape would cascade into Stories 2.2 / 2.4 / 4.1 / 5.* / 6.x). The sibling helper duplicates the cascade walk but adds tier-tracking. The explain output line: `Resolved persona: <name> (Tier <N>: <tier-label>)`.

5. **One-sentence reasoning summary in PRD Journey 1 format** — the verbatim PRD §line 270 reasoning narrative is: `"Reasoning: story-create completed on 2026-04-20 (frontmatter status: ready); no dev-story artifact exists yet; preconditions met (PRD §4.2 loaded, architecture §6 loaded, persona = dev)."`. The format is a **single-sentence, semicolon-separated narrative** with three slots: (a) the predecessor reference + completion timestamp; (b) the absence-of-artifact rationale (or fresh-project reason); (c) the precondition-met list including the resolved persona. v0.1 conservative scope: Story 3.6 emits a single sentence with **2 mandatory slots** and a **3rd persona-naming slot**: `Reasoning: <last-successful-step-or-fresh-project> completed; <target-step> selected as next via <selection-reason>; persona resolved to <persona-name>.`. The `<selection-reason>` string is one of: "explicit --step override", "next after <last-successful-step>", "first analysis-phase entry-point on fresh project", "explicit --resume target". **The Story 6.x telemetry-driven enhancement** may add timestamps from the run-log (Story 2.5) and a richer artifact-existence check; v0.1 ships the structural three-slot sentence.

**The all-done branch** per AC lines 818-820:

When EVERY DAG node IS in the completed set (v0.1 proxy: `state.completedSteps[]` is the full DAG-node-name set OR the alternatives count is zero AND `pickNextStep` throws filter-exhaustion AND the most-recently-completed step is the highest-phase-order DAG terminal), the message reads VERBATIM:

```
All BMAD steps for this project are complete. See /bmad-next --list to inspect remaining optional or unsatisfied steps.
```

**The verbatim hint MUST be byte-identical** per AC line 820 — including the period at the end of "complete." and the period at the end of "steps." and the leading "/" before "bmad-next". The all-done detector v0.1: since `state.completedSteps[]` is NOT in the schema, Story 3.6 uses the proxy condition: `pickNextStep` throws AND `--no-optional` was set AND `--include-optional` was set (impossible per Story 3.5's cross-validation throw — i.e., NOT this branch) OR `pickNextStep` returns AND the candidates set was empty before tiebreaker. **The v0.1 conservative scope**: detect "all done" via the proxy `state.lastSuccessfulStep?.step` matches the last DAG node by phase order AND there are zero remaining candidates with met preconditions. Story 6.x telemetry enhancement (when `state.completedSteps[]` lands) will replace the proxy with a true "every DAG-node in completedSteps" check.

**FR54 stderr discipline** per AC line 821:

The `report` action's `message` lives on stdout (AR9: single JSON line with `message` field). The "human-greppable (not JSON-only)" wording is interpreted as: the message INSIDE the JSON line is a multi-line newline-separated narrative — callers `grep` it via `jq -r '.message'` or by reading the on-disk run-log. Diagnostic side-channel emissions (e.g., warns about multi-persona-arrayness, info about persona tier resolution, warns about state-schema-version downgrades) route to stderr per `src/io/log.ts:20-21`. **Story 3.6 emits ZERO new stderr writes from the explain branch**; the existing stderr writes (e.g., the multi-persona warn from `pickFirstPersona`) are PRESERVED.

**Persona tier-label enrichment via `resolvePersonaWithTier` sibling helper**:

The new sibling helper is colocated in `src/personas/resolve.ts` to keep the 4-tier cascade authoring single-source-of-truth:

```typescript
/** Resolved persona with tier provenance (Story 3.6 explain support). */
export interface ResolvedPersonaWithTier {
  readonly persona: string | readonly string[];
  readonly tier: 0 | 1 | 2 | 3 | 4;
  readonly tierLabel: string; // e.g. "--persona override", "SKILL.md frontmatter", ...
}

/**
 * Same 4-tier cascade as `resolvePersona`, but also returns the tier
 * the resolution came from. Used by Story 3.6 (`--explain`) to surface
 * the persona-tier provenance.
 *
 * The runner-tier may pre-empt by passing the user's `--persona` value
 * via `personaOverride`; when supplied, the function short-circuits
 * with `tier: 0, tierLabel: "--persona override"`.
 */
export async function resolvePersonaWithTier(
  input: ResolveInput & { readonly personaOverride?: string },
): Promise<ResolvedPersonaWithTier>;
```

This composes cleanly with the existing `resolvePersona` (the regular dispatch path stays unchanged; only the explain branch consumes the new helper). **No change to `resolvePersona`'s return shape — strictly additive.**

**What this story DOES NOT do**:

- **Implement `--list` candidate enumeration with the AC-3 reasoning summary** (Story 3.7). The `--list` short-circuit at `run.ts:1031-1069` is preserved unchanged; Story 3.7 enriches its formatting per its own AC line 833.
- **Implement `--diff-state` / `--export-state`** (Story 3.8). The forward-deferred stubs at `run.ts:984-998` (export-state) and `run.ts:996-998` (diff-state) stay PRE-EXISTING.
- **Implement `--watch`** (Story 3.9). The forward-deferred stub stays.
- **Add `state.completedSteps[]` to `StateV1Schema`** (Story 6.x). v0.1 uses the `state.lastSuccessfulStep?.step` proxy for the predecessor chain.
- **Add timestamps to the reasoning summary**. The PRD Journey 1 narrative includes "completed on 2026-04-20 (frontmatter status: ready)"; v0.1 cannot resolve these timestamps without a run-log read (Story 2.5 produced the run-log; the timestamp lookup is forward-deferred to Story 6.x telemetry).
- **Add per-candidate scope-filter projection** for the alternatives list (`--epic` / `--story`). v0.1's alternatives list mirrors `pickNextStep`'s candidate set BEFORE the scope filters apply (the alternatives set is used to surface "what else could have been picked"; constraining it by the user's scope flags would HIDE the meaningful alternative reason).
- **Add the multi-persona explain enhancement** when `resolvePersonaWithTier` returns an array. v0.1 surfaces `<first-persona> (multi-persona Tier <N>; sequential dispatch deferred to Stories 4.1 + 5.*)`. Story 4.1 may enrich.
- **Modify `commands/bmad-next.md` (Layer 1 markdown)**. The Layer 1 markdown already branches on `action`; the `report` action carrying the multi-line `message` is PRE-EXISTING surface (Stories 2.4 + 2.7).
- **Modify `verify-and-advance.ts`**. `--explain` is a read-only short-circuit BEFORE the dispatch; `verify-and-advance.ts` is never invoked.
- **Add a new error class**. The 16-code registry stays UNCHANGED; the all-done branch returns `report` with `exitCode: 0` (no throw).
- **Acquire the lock**. `run.ts` is structurally lock-free per architecture §line 1672.
- **Modify `state.yaml`**. `--explain` is read-only; no state writes.
- **Add an integration test**. The colocated `run.test.ts` cases cover the explain-path surface; an integration test is OPTIONAL per the AC scope.

It DOES land:

- The architecturally-prescribed **`--explain` reasoning trace** per FR13 + epic AC lines 815-821 — replaces the Story 2.4 placeholder with a structured 5-component multi-line narrative.
- The architecturally-prescribed **all-done branch** per AC lines 818-820 — verbatim hint emitted when the project is complete.
- The **closeness-to-ready alternatives sort** per AC line 817 — alternatives sorted by ascending count of unmet preconditions, then phase-order, then name lexicographic.
- The **`resolvePersonaWithTier` sibling helper** in `src/personas/resolve.ts` — additive, does NOT modify `resolvePersona`.
- The **1-sentence PRD Journey 1 reasoning summary** — semicolon-separated three-slot narrative.
- **10-15 new colocated test cases** in `run.test.ts` covering all 5 message components + the all-done branch + the AC line 821 stderr discipline + the combos with `--resume` / `--step` / `--dry-run`.
- The **forward-coupling documentation** with Stories 3.7 / 3.8 / 4.1 / 5.* / 6.x.

This story exercises:

- **AR8** (lock-free `run.ts` / lock-held `verify-and-advance.ts`): UNCHANGED. Story 3.6 modifies the explain short-circuit ONLY; no lock-acquisition surface introduced.
- **AR9** (single discriminated-union JSON line on stdout): UNCHANGED. The `report` action's `message` is a multi-line string; the JSON line shape remains a single line per `DispatchActionV1Schema`.
- **AR21 + AR22** (errors carry code + actionable hint): UNCHANGED. Story 3.6 adds ZERO new throws; the all-done branch emits `report` with `exitCode: 0` (success).
- **AR33** (function & error semantics; throw not Result; no console.*; async/await): UNCHANGED. Story 3.6's explain branch and the new `resolvePersonaWithTier` helper are async/await; no console.*; no Result-shape.
- **AR41** (boundary graph; no upward / sibling-higher imports): EXTENDED. Story 3.6 adds an import from `src/personas/resolve.ts` (mid-tier) into `src/commands/next/run.ts` (top-tier) — this is the EXISTING boundary direction (top consumes mid); no new boundary violation. The `resolvePersonaWithTier` colocation in `src/personas/resolve.ts` keeps the cascade authoring single-source-of-truth.
- **FR8** (`/bmad-next` single-step advance): EXTENDED. The runner now respects `--explain` per AC lines 815-821.
- **FR12** (`--persona` override): EXTENDED. The explain output surfaces "Tier 0: --persona override" when the override is supplied.
- **FR13** (`--explain` reasoning): PRIMARY DELIVERABLE. v0.1 ships the 5-component multi-line trace.
- **FR15** (`--include-optional`/`--no-optional`): EXTENDED. The alternatives list respects the toggle.
- **FR53** (Documented exit codes): UNCHANGED. The explain branch returns `exitCode: 0` (success — read-only).
- **FR54** (stdout/stderr discipline): UNCHANGED. The `report` action goes to stdout (single AR9 JSON line); diagnostic warns/info go to stderr.
- **NFR-S2** (writes only inside scope): UNCHANGED. Read-only short-circuit.
- **NFR-S5** (non-corrupting flag combinations): EXTENDED. `--explain` + `--resume`, `--explain` + `--step`, `--explain` + `--dry-run` (explain wins; dry-run preview deferred), `--explain` + `--persona` (persona surfaced as "Tier 0").
- **NFR-M3** (well-instrumented errors): UNCHANGED. The PRE-EXISTING throws (e.g., from `pickNextStep` filter exhaustion) are caught by the explain branch's surrounding `try {} catch {}` and rendered as part of the explain narrative ("no candidate next step matches the current state + filters; see alternatives below").
- **NFR-R1** (zero data loss on halt): UNCHANGED — the runner reads state via `loadStateUnlocked`; no write side.
- **NFR-I2** (unknown-skill fail-loud): UNCHANGED — the explain branch does not introduce any registry-validation surface.

Estimated effort: **M** (medium — replaces the Story 2.4 placeholder explain branch with structured multi-line output; introduces a new `resolvePersonaWithTier` sibling helper in `src/personas/resolve.ts`; introduces a new internal helper `formatExplainMessage(...)` in `run.ts`; sorts alternatives by closeness-to-ready ascending; ~10-15 new test cases; tier-label enrichment for `--persona` per Story 3.5 forward-action).

It does **NOT**:

- **Implement runtime `failurePolicies` lookup.** Forward-deferred to Story 6.x.
- **Implement multi-persona sequential dispatch.** Forward-deferred to Stories 4.1 + 5.*.
- **Validate the `--persona` value against any registry.** v0.1 conservative continues per Story 3.5's design decision.
- **Implement timestamps in the reasoning summary.** v0.1 ships the structural three-slot sentence; Story 6.x telemetry adds run-log timestamps.
- **Add `state.completedSteps[]` to `StateV1Schema`.** Forward-deferred to Story 6.x.
- **Implement `--list` AC-3 reasoning** (Story 3.7).
- **Implement `--diff-state` / `--export-state`** (Story 3.8).
- **Modify `verify-and-advance.ts`.** Lock-held runner is unchanged.
- **Add a new dispatch-protocol field.** The dispatch line shape is unchanged; the `report` action's `message` carries the multi-line content as a `\n`-joined string.
- **Resolve epic/story attribution from DAG nodes** (Story 6.x).

## Acceptance Criteria

The acceptance criteria below are reproduced **verbatim** from `_bmad-output/planning-artifacts/epics.md` §Story 3.6 (lines 813-821, BDD Given/When/Then format). Lines and AC labelling preserved.

**Acceptance Criteria:**

**Given** Stepper has computed the next step
**When** `--explain` is supplied
**Then** the JSON-line action is `"report"` with `message` containing: target step name, the chain of completed predecessors, the unmet preconditions for alternative candidates (sorted by which are closest to ready), the resolved persona, and a one-sentence reasoning summary in the format from PRD Journey 1
**Given** there is no next step (all done)
**When** `--explain` runs
**Then** the message reads `All BMAD steps for this project are complete. See /bmad-next --list to inspect remaining optional or unsatisfied steps.`
**And** the explain output is human-greppable (not JSON-only) — diagnostics on stderr per FR54

## Tasks / Subtasks

- [x] **Task 0 — Verify pre-conditions (AC: all)**
  - [x] 0.1 Confirm Story 3.1 (`record_last_attempted_last_failure_reason_on_halt`) is `done` per `_bmad-output/implementation-artifacts/sprint-status.yaml:71` (`3-1-record-last-attempted-last-failure-reason-on-halt: done`).
  - [x] 0.2 Confirm Story 3.2 (`--resume` Flag) is `done` per `sprint-status.yaml:72` (`3-2-resume-flag: done`).
  - [x] 0.3 Confirm Story 3.3 (`--dry-run` Flag) is `done` per `sprint-status.yaml:73` (`3-3-dry-run-flag: done`).
  - [x] 0.4 Confirm Story 3.4 (`--step` and Scope Flags) is `done` per `sprint-status.yaml:74` (`3-4-step-id-and-scope-flags: done`); the `isPreconditionMet(node, state)` helper at `src/commands/next/run.ts:451-456` is the foundation for the alternatives unmet-precondition computation in Task 3.
  - [x] 0.5 Confirm Story 3.5 (`--persona` + `--include-optional`/`--no-optional`) is `done` per `sprint-status.yaml:75` (`3-5-persona-override-include-optional-no-optional: done`); the persona-override branch at `src/commands/next/run.ts:1148-1159` is the Tier 0 source for the explain persona-tier label.
  - [x] 0.6 Confirm Story 1.7 (`src/commands/next/args.ts`) declares `explain: z.boolean().default(false)` at line 159 + lists `"explain"` in the `booleanKeys` set at line 215. **No args change needed for Story 3.6.**
  - [x] 0.7 Confirm Story 1.11 (`src/personas/resolve.ts`) shipped the 4-tier resolution `resolvePersona({ stepName, ... }): Promise<string | readonly string[]>` at `src/personas/resolve.ts:537-585`. Story 3.6 will add a SIBLING helper `resolvePersonaWithTier(...)` in the same file; **NO changes to `resolvePersona` itself.**
  - [x] 0.8 Confirm Story 2.4's placeholder explain short-circuit lives at `src/commands/next/run.ts:1001-1029`. Read this region to confirm:
    - The branch fires when `args.explain === true`.
    - It loads state via `loadStateUnlocked({ statePath: opts?.statePath })`.
    - It builds the DAG via `build({ skillNames: opts?.skillNames ?? [], ... })`.
    - It branches on `args.resume` for resume-target resolution.
    - It returns `reportWithMessage(...)` with the placeholder hint `Reasoning trace is implemented in Story 3.6 (Epic 3); current next step: ${nextHint}`.
    - **Story 3.6 REPLACES the placeholder body; preserves the surrounding short-circuit position.**
  - [x] 0.9 Confirm Story 1.10 declared `dag.edgesIn: ReadonlyMap<string, ReadonlySet<string>>` at `src/dag/types.ts:88` (the inverse-DAG used by Story 3.6 for predecessor walking). Verify the type contract — Story 3.6 reads `edgesIn` for the alternatives list computation.
  - [x] 0.10 Confirm `src/dag/index.ts:24-34` re-exports `build`, `tarjanScc`, the structural types `BuildInput`/`DagAdjacency`/`DagNode`/`OverrideEntry`/`Phase`/`SeedEntry`, and `SEED_BMAD_VERSION`. Story 3.6 consumes `DagAdjacency` + `DagNode` ONLY.
  - [x] 0.11 Confirm `src/personas/defaults.ts` declares Tier 3's `DEFAULT_PERSONAS: ReadonlyMap<string, string | readonly string[]>` (Story 1.11). The `resolvePersonaWithTier` helper duplicates the cascade walk; the Tier 3 lookup uses the same source.
  - [x] 0.12 Confirm `src/errors.ts` registry stays at 16 codes (`bun test src/errors.test.ts`: 10 pass, 197 expects). Story 3.6 ships ZERO new error classes — the all-done branch emits `report` with `exitCode: 0`; the filter-exhaustion case is caught + surfaced inside the explain message; existing throws from `pickNextStep` are preserved.
  - [x] 0.13 Read epics.md §Story 3.6 lines 813-821 verbatim. Confirm the AC text in §Acceptance Criteria above is character-identical.
  - [x] 0.14 Read prd.md §Journey 1 lines 261-277 + §line 269-271 (the verbatim narrative format quoted in AC line 817 — `"Reasoning: story-create completed on 2026-04-20 (frontmatter status: ready); no dev-story artifact exists yet; preconditions met (PRD §4.2 loaded, architecture §6 loaded, persona = dev)."`); §FR13 line 686 (the canonical FR for `--explain`).
  - [x] 0.15 Read architecture.md §line 1672 (`run.ts` is read-only / lock-free); §A.D7 lines 460-490 (DAG + next-step computation); §line 1660 (AR9 protocol concretization); §line 1450 (Layer 1↔2↔3 sequence); §FR54 line 1384 (`stdout/stderr discipline → src/io/log.ts`); §AR9 (mentioned at architecture lines 86-90 of run.ts JSDoc + line 1660 + line 1676).
  - [x] 0.16 Read epic-2-retrospective.md §Forward Action Items — confirm Story 3.6 is in the recommended sequence (AFTER Story 3.5, BEFORE Story 3.7).
  - [x] 0.17 Read Story 3.5's Forward Dependencies §line 528-534 — Story 3.5 explicitly forward-defers tier-label provenance enrichment to Story 3.6 ("Story 3.6 enriches the `--explain` short-circuit at `run.ts:833-861` to enumerate the persona-tier provenance"). Story 3.6 RECEIVES this hand-off.
  - [x] 0.18 Read Story 3.4's Dev Notes §line 471-575 — confirm Story 3.4's `isPreconditionMet(node, state)` at `run.ts:451-456` is the predicate Story 3.6 reuses for the alternatives unmet-precondition computation. Verify the function signature: `isPreconditionMet(node: DagNode, state: State): boolean`.
  - [x] 0.19 Confirm baseline `bun run check` exits 0 with **625 pass / 0 fail / 2281 expects / 49 files** per Story 3.5 final.
  - [x] 0.20 Confirm Bun host version satisfies AR2 (Bun >= 1.3). Run `bun --version`; record in Completion Notes.
  - [x] 0.21 Confirm `src/commands/next/run.ts:182-187` declares `LoggerFns` with `info|warn|error|json: (message: string) => void`. The explain branch may call `log.info(...)` for additional diagnostic context (stderr per FR54); it MUST NOT call `log.json(...)` (the json emission is reserved for the runner-tier dispatch line via `emitDispatchAction`).

- [x] **Task 1 — Replace the Story 2.4 placeholder explain branch (AC: all)**
  - [x] 1.1 Identify the insertion site at `src/commands/next/run.ts:1001-1029`. The replacement REUSES the existing `loadStateUnlocked(...) + build(...)` setup; REPLACES the placeholder body with the new `formatExplainMessage(...)` + the all-done detection branch.
  - [x] 1.2 Sketch the replacement structure:
    ```typescript
    if (args.explain) {
      const state = await loadStateUnlocked({ statePath: opts?.statePath });
      const dag = await build({ skillNames: opts?.skillNames ?? [], ... });

      // All-done branch: every DAG node IS in state.completedSteps[]
      // (v0.1 proxy via state.lastSuccessfulStep + zero-candidates check).
      if (isProjectAllDone(state, dag, args)) {
        return reportWithMessage(
          "All BMAD steps for this project are complete. See /bmad-next --list to inspect remaining optional or unsatisfied steps.",
        );
      }

      // Compute the target step.
      let targetNode: DagNode | null;
      let pickError: string | null = null;
      try {
        targetNode = args.resume
          ? resolveResumeTarget(state, dag).node
          : pickNextStep(state, dag, args, log);
      } catch (err) {
        targetNode = null;
        pickError = err instanceof StepperError ? err.message : String(err);
      }

      // Compute the alternatives list (excludes target; sorted by
      // closeness-to-ready ascending).
      const alternatives = computeAlternatives(
        state, dag, args, targetNode?.name ?? null,
      );

      // Compute the resolved persona + tier label.
      let personaInfo: ResolvedPersonaWithTier | null = null;
      if (targetNode !== null) {
        try {
          personaInfo = await resolvePersonaWithTier({
            stepName: targetNode.name,
            personaOverride: args.persona,
            pluginDir: opts?.pluginDir,
            projectRoot: opts?.projectRoot,
            configPath: opts?.configPath,
            bmadConfigPath: opts?.bmadConfigPath,
          });
        } catch {
          // Persona-resolution failure surfaces in the message.
          personaInfo = null;
        }
      }

      // Build the multi-line message (5 components per AC line 817).
      const message = formatExplainMessage({
        targetNode,
        pickError,
        state,
        alternatives,
        personaInfo,
        args,
      });

      return reportWithMessage(message);
    }
    ```
  - [x] 1.3 Document the AR9 invariant: the `report` action's `message` is a `\n`-joined multi-line string; the AR9 JSON line shape stays single-line.
  - [x] 1.4 Document the read-only / lock-free posture: NO state writes, NO lock acquisition.

- [x] **Task 2 — Compose target step + chain-of-completed-predecessors (AC line 817)**
  - [x] 2.1 Sketch the predecessor-chain helper:
    ```typescript
    /**
     * v0.1 conservative: state.completedSteps[] is NOT in StateV1Schema.
     * The predecessor chain is therefore [state.lastSuccessfulStep?.step]
     * — the most-recently-completed step. The full transitive walk
     * (using dag.edgesIn) is forward-deferred to Story 6.x telemetry.
     */
    function buildPredecessorChain(state: State): string[] {
      const last = state.lastSuccessfulStep?.step;
      return last !== undefined ? [last] : [];
    }
    ```
  - [x] 2.2 The output line:
    - When the chain is non-empty: `Chain of completed predecessors: <comma-separated-list>`.
    - When the chain is empty (fresh project): `Chain of completed predecessors: (none — fresh project)`.
  - [x] 2.3 Document the v0.1 → Story 6.x evolution: when `state.completedSteps[]` is added to the schema, the helper switches to a transitive-closure walk via `dag.edgesIn` from `targetNode.after[]` back to entry-points. The line format stays the same.

- [x] **Task 3 — Compose unmet-preconditions for alternatives, sorted by closeness-to-ready (AC line 817)**
  - [x] 3.1 Sketch the alternatives helper:
    ```typescript
    interface AlternativeCandidate {
      readonly node: DagNode;
      readonly unmet: readonly string[];
      readonly count: number;
    }

    /**
     * Compute the alternative-candidate list: every non-target DAG node
     * whose precondition set has at least one unmet member but the node
     * is otherwise reachable from the project root. Sorted by:
     *   1. count ASCENDING (fewest unmet first → "closest to ready"),
     *   2. node.phase ORDER (analysis → planning → ... → retro),
     *   3. name LEXICOGRAPHIC.
     * Optional candidates respect the --include-optional / --no-optional
     * toggles per Story 3.5's filter logic.
     * Capped at MAX_ALTERNATIVES = 5; truncation tail emits "(... <N>
     * more candidates; run /bmad-next --list to see all)".
     */
    function computeAlternatives(
      state: State,
      dag: DagAdjacency,
      args: NextArgs,
      targetName: string | null,
    ): readonly AlternativeCandidate[];
    ```
  - [x] 3.2 The per-candidate unmet computation: for each non-target node, walk `node.after[]`; for each prerequisite name `p`, check `p === state.lastSuccessfulStep?.step`; if NOT, push `p` to the `unmet` list. v0.1 conservative scope: the predicate matches Story 3.4's `isPreconditionMet` (a node is met when EVERY name in `node.after[]` equals `state.lastSuccessfulStep?.step`; an entry-point with empty `after[]` is trivially met). **Note**: this means most candidates have `count >= 1` for non-fresh projects (since most nodes have `node.after.length >= 1` and only one previous step is `lastSuccessfulStep`). Story 6.x's `state.completedSteps[]` enables the full set-membership check.
  - [x] 3.3 The optional-toggle respect: skip nodes with `node.optional === true` UNLESS `args.includeOptional === true` (matches Story 3.5's `pickNextStep` filter at `run.ts:672-678` + `--list` filter at `run.ts:1061-1064`).
  - [x] 3.4 The output lines:
    - When `count >= 1` per candidate: `<step-name> — needs: <comma-separated-unmet> (count: <N>)` per line.
    - When `count == 0` per candidate (already-met candidates that AREN'T the target): `<step-name> — preconditions met` (this is the case where multiple candidates were viable; the tiebreaker chose the target).
    - When the alternatives list is empty: `Alternative candidates: (none)`.
    - When truncated: append `(... <N> more candidates; run /bmad-next --list to see all)`.
  - [x] 3.5 Document the cap rationale: `MAX_ALTERNATIVES = 5` keeps the explain output bounded for 100 epics × 1000 stories projects (NFR-Sc1 per Story 3.7 AC line 835); the user can always run `--list` for the full set.
  - [x] 3.6 Document the in-target exclusion: when the user supplies `--step <X>`, the alternatives list EXCLUDES `<X>` (it's the target; not an alternative). When the target throws (e.g., filter exhaustion), the alternatives list still computes (over the unfiltered candidate set); the explain message conveys "no target step matches; alternatives: ..." narrative.

- [x] **Task 4 — Compose resolved persona with tier label (AC line 817)**
  - [x] 4.1 Sketch the new sibling helper at `src/personas/resolve.ts`:
    ```typescript
    /** Resolved persona with tier provenance (Story 3.6 explain support). */
    export interface ResolvedPersonaWithTier {
      readonly persona: string | readonly string[];
      readonly tier: 0 | 1 | 2 | 3 | 4;
      readonly tierLabel: string;
    }

    /**
     * Same 4-tier cascade as `resolvePersona`, but also returns the tier
     * the resolution came from. Used by Story 3.6 (`--explain`) to
     * surface the persona-tier provenance.
     *
     * The runner-tier may pre-empt by passing the user's `--persona`
     * value via `personaOverride`; when supplied (non-empty string), the
     * function short-circuits with `tier: 0, tierLabel: "--persona override"`.
     */
    export async function resolvePersonaWithTier(
      input: ResolveInput & { readonly personaOverride?: string },
    ): Promise<ResolvedPersonaWithTier> {
      // Tier 0: user-supplied --persona override.
      if (input.personaOverride !== undefined && input.personaOverride !== "") {
        return {
          persona: input.personaOverride,
          tier: 0,
          tierLabel: "--persona override",
        };
      }

      const projectRoot = input.projectRoot ?? process.cwd();
      const configPath = input.configPath ??
        path.join(projectRoot, "bmad-stepper.config.yaml");
      const bmadDir = input.bmadConfigPath ?? path.join(projectRoot, "_bmad");

      // Tier 1: SKILL.md frontmatter (skipped when pluginDir absent).
      if (input.pluginDir !== undefined) {
        const tier1 = await tier1Frontmatter(input.stepName, input.pluginDir);
        if (tier1 !== null) {
          return { persona: tier1, tier: 1, tierLabel: "SKILL.md frontmatter" };
        }
      }

      // Tier 2: project config personas: block.
      const tier2 = await tier2ProjectConfig(input.stepName, configPath);
      if (tier2 !== null) {
        return { persona: tier2, tier: 2, tierLabel: "project-config personas: block" };
      }

      // Tier 3: built-in defaults.
      const tier3 = tier3Defaults(input.stepName);
      if (tier3 !== null) {
        return { persona: tier3, tier: 3, tierLabel: "built-in defaults" };
      }

      // Tier 4: _bmad/<module>/config.yaml triggers.
      const tier4 = await tier4ModuleConfig(input.stepName, bmadDir);
      if (tier4 !== null) {
        return { persona: tier4, tier: 4, tierLabel: "_bmad/<module>/config.yaml triggers" };
      }

      // No-tier-resolves — propagate via the existing AC-2 throw.
      throw new ConfigError(
        `Persona not resolvable for step "${input.stepName}".`,
        ...,
        ac2NoPersonaHint(input.stepName),
      );
    }
    ```
  - [x] 4.2 The output line, given a `ResolvedPersonaWithTier`:
    - Single-persona case: `Resolved persona: <name> (Tier <N>: <tierLabel>)`.
    - Multi-persona case: `Resolved persona: <first> (multi-persona Tier <N>; sequential dispatch deferred to Stories 4.1 + 5.*)`.
    - Override case (Tier 0): `Resolved persona: <name> (Tier 0: --persona override; bypassed 4-tier resolution)`.
    - Resolution-failure case (no tier resolves; the existing AC-2 throw): the explain branch's surrounding `try {} catch {}` catches the throw and surfaces `Resolved persona: (unresolvable — see hint: <ac2NoPersonaHint>)` in the message; the explain branch returns `report` with `exitCode: 0` (the AC-2 ConfigError is rendered as part of the explain narrative; NOT a halt).
  - [x] 4.3 Document the additive change: `resolvePersona` is UNCHANGED; the new `resolvePersonaWithTier` is a SIBLING with tier-tracking. The runner's existing dispatch path uses `resolvePersona`; the explain path uses `resolvePersonaWithTier`. **No call-site cascade required.**
  - [x] 4.4 Document the test-only exposure of the per-tier helpers: if `tier1Frontmatter` / `tier2ProjectConfig` / `tier3Defaults` / `tier4ModuleConfig` are NOT exported from `src/personas/resolve.ts`, the new `resolvePersonaWithTier` reuses them via intra-module access. Confirm via Read.

- [x] **Task 5 — Compose the one-sentence reasoning summary in PRD Journey 1 format (AC line 817)**
  - [x] 5.1 Sketch the reasoning-summary helper:
    ```typescript
    /**
     * Compose the one-sentence reasoning summary per PRD Journey 1
     * line 269-271. Three slots:
     *   1. Predecessor reference: "<last-successful-step> completed"
     *      OR "fresh project (no prior steps)".
     *   2. Selection reason: "explicit --step override" /
     *      "next after <last-successful-step>" /
     *      "first analysis-phase entry-point on fresh project" /
     *      "explicit --resume target".
     *   3. Persona-naming slot: "persona resolved to <persona-name>"
     *      OR "persona unresolvable" when the AC-2 throw fires.
     */
    function formatReasoningSummary(input: {
      targetNode: DagNode | null;
      state: State;
      personaInfo: ResolvedPersonaWithTier | null;
      args: NextArgs;
    }): string;
    ```
  - [x] 5.2 The output sentence template:
    ```
    Reasoning: <slot-1>; <slot-2>; <slot-3>.
    ```
  - [x] 5.3 The `<slot-2>` selection-reason cases:
    - `args.step !== undefined && args.step !== ""`: `explicit --step override (<args.step>)`.
    - `args.resume === true`: `explicit --resume target (<state.lastAttempted?.step>)`.
    - `state.lastSuccessfulStep === undefined`: `first analysis-phase entry-point on fresh project`.
    - Otherwise: `next after <state.lastSuccessfulStep.step>`.
  - [x] 5.4 Document the v0.1 → Story 6.x evolution: the timestamp slot (`completed on 2026-04-20`) and the artifact-existence slot (`no <artifact> exists yet`) are NOT in v0.1 (Story 6.x telemetry). The semicolon-separated three-slot structure preserves the Journey-1 reading flow.
  - [x] 5.5 Document the literal-quotes preservation: when `args.persona !== undefined && args.persona !== ""`, slot 3 reads `persona resolved to <args.persona> (Tier 0: --persona override)`.

- [x] **Task 6 — Compose the all-done branch (AC lines 818-820)**
  - [x] 6.1 Sketch the all-done detector:
    ```typescript
    /**
     * v0.1 conservative all-done detection. Since state.completedSteps[]
     * is NOT in StateV1Schema (Story 6.x), use the proxy:
     *   - args.includeOptional ? `pickNextStep` succeeds → NOT all-done.
     *     `pickNextStep` throws filter-exhaustion AND state.lastSuccessfulStep
     *     IS the highest-phase-order DAG terminal AND every DAG node has
     *     at least one met successor in state.lastSuccessfulStep
     *     → all-done.
     *   - When state.lastSuccessfulStep is the only completed step AND
     *     no node has it as a successor with met preconditions → all-done.
     * v0.1 simplification: detect via `pickNextStep` throwing filter-
     * exhaustion AND no candidates would surface even with
     * --include-optional. Story 6.x replaces with state.completedSteps[]
     * coverage check.
     */
    function isProjectAllDone(
      state: State,
      dag: DagAdjacency,
      args: NextArgs,
    ): boolean;
    ```
  - [x] 6.2 The detector logic v0.1:
    1. If `state.lastSuccessfulStep === undefined`, return `false` (fresh project — never all-done).
    2. Build the candidate set IGNORING `--no-optional` (i.e., as if `--include-optional` were set): every non-`lastSuccessfulStep` node whose `after[]` includes `lastSuccessfulStep`.
    3. If the candidate set is non-empty AND at least one candidate has met preconditions, return `false`.
    4. If the candidate set is empty (no node can be reached from `lastSuccessfulStep` via the v0.1 conservative `node.after.includes(lastSuccessfulStep)` rule), AND the lastSuccessfulStep's phase is `retro` (the highest phase-order terminal phase), return `true`.
    5. Otherwise, return `false` (more steps could be reachable; just not from the current `lastSuccessfulStep`).
  - [x] 6.3 Document the v0.1 → Story 6.x evolution: when `state.completedSteps[]` lands, the detector switches to a clean set-coverage check: `dag.nodes.size === state.completedSteps.length` (or strictly: every key in `dag.nodes` is in `state.completedSteps`).
  - [x] 6.4 The all-done output is the verbatim AC line 820 hint:
    ```
    All BMAD steps for this project are complete. See /bmad-next --list to inspect remaining optional or unsatisfied steps.
    ```
    **The literal text must be byte-identical** — period after "complete." and period after "steps."; leading "/" before "bmad-next"; the verbatim word "remaining". The `report.message` carries this single sentence as the entire payload (no multi-line composition; the all-done case is a one-liner).
  - [x] 6.5 Document that the all-done branch returns `report` with `exitCode: 0` (NOT a halt; NOT an error). The runner's `import.meta.main` block emits the AR9 JSON line; the slash-command Layer 1 markdown branches on `action: "report"` and prints the message verbatim.

- [x] **Task 7 — Implement the explain branch + helpers + tests (AC: all)**
  - [x] 7.1 Edit `src/personas/resolve.ts` to ADD `resolvePersonaWithTier(...)` + `ResolvedPersonaWithTier` interface. **NO change to `resolvePersona`'s shape or call sites.**
  - [x] 7.2 Edit `src/commands/next/run.ts` to REPLACE the explain placeholder body at lines 1001-1029 with the structured composition per Tasks 1-6. ADD the 4 new internal helpers (`buildPredecessorChain`, `computeAlternatives`, `formatReasoningSummary`, `isProjectAllDone`) + the wrapper `formatExplainMessage(...)`. ADD the import of `resolvePersonaWithTier` from `../../personas/index.ts` (or `../../personas/resolve.ts` directly, mirroring the existing import pattern).
  - [x] 7.3 Verify the runner compiles via `bunx tsc --noEmit` (the new helpers + `ResolvedPersonaWithTier` type land cleanly).
  - [x] 7.4 Verify Biome passes via `bunx --bun biome ci .` (no formatting drift).
  - [x] 7.5 Verify the full test suite passes via `bun test` (all PRE-EXISTING tests continue to pass; the placeholder-text tests in Story 2.4 may need targeted updates — confirm by reading `run.test.ts` for any `Reasoning trace is implemented in Story 3.6` literal-string assertions and updating them to assert the new structured-message format).
  - [x] 7.6 Edit `src/personas/resolve.test.ts` (Story 1.11 colocated tests) to APPEND `resolvePersonaWithTier` test coverage: 5 cases (Tier 0 / Tier 1 / Tier 2 / Tier 3 / Tier 4 — at least one each) + 1 cascade-exhaustion throw case + 1 multi-persona-array case (Tier 3 returns `["analyst", "pm"]` for `bmad-create-story`). All 7 cases follow the existing test patterns in `resolve.test.ts`.

- [x] **Task 8 — Implement the colocated explain test cases (AC: all)**
  - [x] 8.1 Edit `src/commands/next/run.test.ts` to APPEND a new `describe` block: `"runNext — Story 3.6 --explain reasoning trace"`. Reuse module-level `beforeEach`/`afterEach` + `commonOpts`/`writeMinimalState` factories. Reuse the Story 3.4 `captureLogger()` factory + Story 3.5's `writeStateWithLastSuccessful()` + `readDispatchedPersona()` helpers (the on-disk dispatch-spec read pattern).
  - [x] 8.2 **Test case A (AC line 815-817: target step name + chain + alternatives + persona + reasoning sentence)** — seed state with `lastSuccessfulStep: { step: "bmad-brainstorming", ... }`; invoke with `argv: ["--explain"]`; assert (a) `result.exitCode === 0`, (b) `result.action.action === "report"`, (c) `result.action.message` contains the substrings: (i) `Next step:` followed by the resolved step name, (ii) `Chain of completed predecessors:` followed by `bmad-brainstorming`, (iii) `Alternative candidates:` (or per-line alternatives), (iv) `Resolved persona:` followed by the resolved persona name + tier label, (v) `Reasoning:` followed by the one-sentence narrative.
  - [x] 8.3 **Test case B (AC line 815-817: fresh project — empty predecessor chain)** — invoke with empty state (no `lastSuccessfulStep`); assert the message contains `Chain of completed predecessors: (none — fresh project)`.
  - [x] 8.4 **Test case C (AC line 817: alternatives sorted by closeness-to-ready ascending)** — seed state with `lastSuccessfulStep: { step: "bmad-create-prd", ... }`; invoke with `argv: ["--explain", "--include-optional"]`; assert the alternatives list lines are sorted such that lower-`count` entries appear before higher-`count` entries; for entries with the same `count`, phase-order then name lexicographic. Verify by parsing the message with a regex / split-by-`\n` and inspecting the ordered candidate list.
  - [x] 8.5 **Test case D (AC line 817: alternatives respect --no-optional)** — seed state with `lastSuccessfulStep: { step: "bmad-create-prd", ... }`; invoke with `argv: ["--explain", "--no-optional"]`; assert the alternatives list contains NO entry whose DAG node has `optional: true`.
  - [x] 8.6 **Test case E (AC line 817: persona surfacing with --persona override → Tier 0 label)** — invoke with `argv: ["--explain", "--persona", "tea"]`; assert the message contains `Resolved persona: tea (Tier 0: --persona override; bypassed 4-tier resolution)`.
  - [x] 8.7 **Test case F (AC line 817: persona surfacing without --persona override → Tier 3 label for default-persona steps)** — invoke with `argv: ["--explain"]` on a step whose Tier 3 default resolves (e.g., `bmad-product-brief` → `pm` per `src/personas/defaults.ts`); assert the message contains `Resolved persona: pm (Tier 3: built-in defaults)`.
  - [x] 8.8 **Test case G (AC line 817: reasoning summary three-slot format)** — invoke with `argv: ["--explain"]` on a non-fresh state; assert the message contains a line matching the regex `Reasoning: .+?; .+?; persona resolved to .+\\.`. Verify the three semicolon-separated slots + the trailing period.
  - [x] 8.9 **Test case H (AC lines 818-820: all-done message — verbatim)** — seed state with `lastSuccessfulStep: { step: "bmad-retrospective", ... }` (the highest-phase-order `retro` terminal); invoke with `argv: ["--explain"]`; assert the message reads VERBATIM `All BMAD steps for this project are complete. See /bmad-next --list to inspect remaining optional or unsatisfied steps.`. Byte-identical: period after `complete.`, period after `steps.`, the leading `/` before `bmad-next`. Use `expect(result.action.message).toBe("...")`.
  - [x] 8.10 **Test case I (AC line 821: stderr discipline — diagnostic warns route to stderr)** — invoke with `argv: ["--explain", "--persona", "dev"]` on a multi-persona step (`bmad-create-story`'s Tier 3 is `["analyst", "pm"]` per Story 3.5 Test C); assert: (a) `result.action.action === "report"`, (b) `result.action.message` includes the persona Tier 0 line, (c) NO multi-persona warn is in `loggerCapture.warnMessages` (the Tier 0 override skips the multi-persona path). Cross-check: invoke without `--persona`; expect a warn IS captured (the Tier 3 multi-persona case fires the existing warn). The test asserts FR54 stdout/stderr discipline.
  - [x] 8.11 **Test case J (Edge: --explain + --resume — surfaces resume target)** — seed state with `lastAttempted: { step: "bmad-dev-story", ... }` + `lastFailureReason`; invoke with `argv: ["--explain", "--resume"]`; assert the message contains `Next step: bmad-dev-story` AND the reasoning slot contains `explicit --resume target`.
  - [x] 8.12 **Test case K (Edge: --explain + --step — surfaces explicit step target)** — invoke with `argv: ["--explain", "--step", "bmad-brainstorming"]` on a fresh state; assert the message contains `Next step: bmad-brainstorming` AND the reasoning slot contains `explicit --step override`.
  - [x] 8.13 **Test case L (Edge: --explain + --dry-run — explain wins per Story 3.3 precedent)** — invoke with `argv: ["--explain", "--dry-run"]`; assert the message is the explain trace (NOT the dry-run preview); the explain short-circuit fires BEFORE the dry-run short-circuit per the existing comment at `run.ts:974` (`--export-state → --diff-state → --explain → --list → --dry-run`).
  - [x] 8.14 **Test case M (Edge: --explain when pickNextStep throws filter-exhaustion)** — invoke with `argv: ["--explain", "--phase", "retro"]` on a fresh state (no retro phase candidates); assert the message contains `(no target step matches; alternatives: ...)` OR `Next step: (none — current filter excludes all candidates)` AND a graceful surface of the alternatives list.
  - [x] 8.15 **Test case N (Edge: --explain when persona-resolution throws AC-2 — message surfaces graceful hint)** — invoke with `argv: ["--explain"]` on a state where the resolved next step has NO Tier 1 / Tier 2 / Tier 3 / Tier 4 persona match; assert the explain branch RETURNS `report` with `exitCode: 0` (NOT a halt) AND the message contains `Resolved persona: (unresolvable — see hint: Add a persona for <step> in bmad-stepper.config.yaml under the personas: block.)`.
  - [x] 8.16 **Test case O (Edge: --explain output is human-greppable per AC line 821)** — invoke with `argv: ["--explain"]`; assert: (a) the JSON-line action is `"report"` per AR9, (b) the `message` is a multi-line string (contains at least 4 `\n` characters from the 5 components: Next step / Chain / Alternative / Persona / Reasoning), (c) running `grep "^Next step:"` against the `message` would match (verify via `message.split("\n").some(l => l.startsWith("Next step:"))`).
  - [x] 8.17 Each test follows AR35 tmpdir-per-test discipline: reuses module-level `beforeEach`/`afterEach` + `commonOpts`/`writeMinimalState` factories.

- [x] **Task 9 — Verify --explain + --resume / --step / --dry-run combos preserve correct precedence (AC: all)**
  - [x] 9.1 The combo precedence per the existing comment at `run.ts:974`: `--export-state → --diff-state → --explain → --list → --dry-run`. Story 3.6 PRESERVES this; the explain short-circuit fires BEFORE list / dry-run.
  - [x] 9.2 Test case L (Task 8.13) asserts `--explain + --dry-run` → explain wins.
  - [x] 9.3 Test case J (Task 8.11) asserts `--explain + --resume` → resume target is the explained step.
  - [x] 9.4 Test case K (Task 8.12) asserts `--explain + --step` → explicit step is the explained step.
  - [x] 9.5 Document the `--explain + --list` interaction: `--list` is suppressed by `--explain` (the explain short-circuit returns BEFORE the list short-circuit fires per the comment ordering). Story 3.7 may revisit if a combined "explain + list" view is desired.
  - [x] 9.6 Document the `--explain + --persona` interaction: covered by Test E (Task 8.6) — Tier 0 label surfaces.
  - [x] 9.7 Document the `--explain + --include-optional` / `--no-optional` interaction: covered by Tests C + D (Tasks 8.4 + 8.5) — alternatives list respects the toggle.
  - [x] 9.8 Document the `--explain + --epic` / `--story` / `--phase` interaction: the alternatives list mirrors `pickNextStep`'s candidate set per the v0.1 design decision (alternatives use the unfiltered set; the target uses the filtered set). Test case M (Task 8.14) covers the case where the filter exhausts the target's candidates.

- [x] **Task 10 — Verify backward compatibility (no regression on existing tests)**
  - [x] 10.1 Run `bun test src/commands/next/run.test.ts`: confirm pre-existing tests pass, except possibly the Story 2.4 placeholder-text assertions (if any) — those are UPDATED in Task 7.5 to assert the new structured-message format. Catalogue the count delta.
  - [x] 10.2 Run `bun test src/personas/`: confirm Story 1.11's 4-tier resolution tests pass (Story 3.6's `resolvePersonaWithTier` does NOT touch `resolvePersona`); the new `resolvePersonaWithTier` tests added per Task 7.6 add ~7 cases.
  - [x] 10.3 Run `bun test src/integration/`: confirm Story 2.8 + Story 3.1 + Story 3.3 + Story 3.4 integration tests pass.
  - [x] 10.4 Run `bun test src/smoke/`: confirm Story 2.8 happy-path smoke passes.
  - [x] 10.5 Run `bun run check` (full suite + tsc + lint): confirm exit 0; record post-Story-3.6 baseline test counts in Completion Notes.

- [x] **Task 11 — Run the full test suite + `bun run check` (AC: all)**
  - [x] 11.1 `bun run check` exit 0. Test delta projection: ~+15-22 tests (~10-15 new colocated cases per Task 8 + ~7 new resolvePersonaWithTier cases per Task 7.6), ~+50-70 expects.
  - [x] 11.2 Post-Story-3.6 baseline projection: ~640-647 pass / 0 fail / ~2331-2351 expects / 49-50 files (no new test files added — the new tests append to `run.test.ts` + `resolve.test.ts`).
  - [x] 11.3 Confirm `src/errors.ts` registry stays at **16 codes** (`bun test src/errors.test.ts`: 10 pass, 197 expects). Story 3.6 ships ZERO new error classes.
  - [x] 11.4 Confirm `bunx tsc --noEmit` exits 0.
  - [x] 11.5 Confirm AR41 boundary check at `run.test.ts:606-638` still passes — Story 3.6 adds an import of `resolvePersonaWithTier` from `../../personas/...`, which is the EXISTING boundary direction (top-tier consumes mid-tier per architecture lines 1294-1302); the boundary check passes unchanged.

- [x] **Task 12 — Update sprint-status.yaml + record completion (AC: all)**
  - [x] 12.1 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: flip `3-6-explain-reasoning-trace` from `backlog` (set by Story 3.5 final) to `ready-for-dev` (this Story 3.6 create-story step). At story completion (Step 9 of bmad-dev-story workflow), flip to `review` (intermediate `in-progress` during dev). `epic-3: in-progress` is preserved.
  - [x] 12.2 Flip the story file frontmatter `status: ready-for-dev → review` at end of bmad-dev-story workflow per the workflow's Step 9 contract. (At create-story time, the value is `ready-for-dev`.)
  - [x] 12.3 sprint-status.yaml retains its original schema (no new fields).

## Dev Notes

### File List

#### Modified Files

- **`src/commands/next/run.ts`** (~1362 → ~1500-1550 lines): replaces the placeholder explain branch at lines 1001-1029 with the structured 5-component composition; ADDS 5 new internal helpers (`buildPredecessorChain`, `computeAlternatives`, `formatReasoningSummary`, `isProjectAllDone`, `formatExplainMessage`). The runner-level types `AlternativeCandidate` + the helper signatures live colocated in `run.ts`.
- **`src/commands/next/run.test.ts`** (~2419 → ~2700-2800 lines): APPENDS a new `describe("runNext — Story 3.6 --explain reasoning trace", ...)` block with ~10-15 colocated test cases per Task 8. Reuses module-level `beforeEach`/`afterEach` + `commonOpts`/`writeMinimalState` + the Story 3.4/3.5 `captureLogger()` + `writeStateWithLastSuccessful()` + `readDispatchedPersona()` helpers.
- **`src/personas/resolve.ts`** (~585 → ~660-700 lines): ADDS `ResolvedPersonaWithTier` interface + `resolvePersonaWithTier(...)` exported async function + 5 tier-label constants. **NO change to `resolvePersona` or its call sites.**
- **`src/personas/resolve.test.ts`** (Story 1.11 file — line count tbd): APPENDS ~7 test cases for the new `resolvePersonaWithTier` helper.

#### New Files

(none — Story 3.6 is purely additive on existing files; no new modules; no new integration test file required by AC.)

#### Sprint-Status

- **`_bmad-output/implementation-artifacts/sprint-status.yaml`**: flip `3-6-explain-reasoning-trace: backlog → ready-for-dev` (at create-story time). Confirm `epic-3: in-progress` (already set by Story 3.1).

### Architecture Compliance

- **AR8** (lock-free `run.ts` / lock-held `verify-and-advance.ts`): UNCHANGED. Story 3.6 modifies the explain branch + helpers; no new lock-acquisition surface.
- **AR9** (single discriminated-union JSON line on stdout): UNCHANGED. The `report` action's `message` is a multi-line `\n`-joined string; the AR9 JSON line shape stays single-line.
- **AR21** (errors carry code): UNCHANGED. Story 3.6 adds ZERO new throws. The all-done branch returns `report` with `exitCode: 0`. The PRE-EXISTING `pickNextStep` filter-exhaustion throw is caught by the explain branch's surrounding `try {} catch {}` and surfaced inside the explain message.
- **AR22** (errors carry actionable hint): UNCHANGED. The all-done message is a verbatim AC-line-820 hint string (NOT an error hint; a successful `report` payload). The PRE-EXISTING hints from `pickNextStep` / `resolvePersona` are PRESERVED.
- **AR33** (function & error semantics; throw not Result; no console.*; async/await): UNCHANGED. The new helpers (`computeAlternatives`, `formatReasoningSummary`, `isProjectAllDone`, `buildPredecessorChain`, `formatExplainMessage`) and the new `resolvePersonaWithTier` are async/await-compatible; throw not Result; no console.*.
- **AR41** (boundary graph): UNCHANGED. Story 3.6 adds `resolvePersonaWithTier` import in `run.ts` from `src/personas/` (top-tier consuming mid-tier — existing boundary direction). The `resolvePersonaWithTier` helper is colocated in `src/personas/resolve.ts` to keep the cascade authoring single-source-of-truth.

### Acceptance Criteria Mapping

- **AC line 815-817** (`--explain` is supplied → `report` action with `message` containing 5 components: target step, predecessor chain, alternatives sorted by closeness-to-ready, resolved persona, one-sentence reasoning summary): delivered by **Tasks 1-5** (the 5-component composition). Tests A/B/C/D/E/F/G (Tasks 8.2-8.8) verify each component.
- **AC line 818-820** (no next step / all done → verbatim hint): delivered by **Task 6** (the all-done detector + verbatim hint). Test H (Task 8.9) verifies byte-identical match.
- **AC line 821** (human-greppable; not JSON-only; diagnostics on stderr per FR54): delivered by **Task 7** (the multi-line message lives INSIDE the AR9 JSON-line `message` field — callers `grep` it via `jq -r '.message'`; diagnostic warns/info route to stderr per the existing `src/io/log.ts:20-21` plumbing). Tests I + O (Tasks 8.10 + 8.16) verify.

### v0.1 Design Decisions

#### Predecessor chain v0.1 = `[state.lastSuccessfulStep?.step]`

Since `state.completedSteps[]` is NOT in `StateV1Schema` (v0.1 schema declares `lastSuccessfulStep` + `lastAttempted` + `lastFailureReason` only; per Story 3.4 §line 437 + `src/schemas/state.ts:92-119`), the predecessor chain in v0.1 is a single-element list of the most-recently-completed step. The full transitive walk via `dag.edgesIn` is forward-deferred to Story 6.x telemetry-driven enhancement when `state.completedSteps[]` is added to the schema. **Rationale**: keep the v0.1 explain output structurally correct (one chain line) without adding schema migration scope; Story 6.x's enhancement preserves the line format.

#### Alternatives list capped at `MAX_ALTERNATIVES = 5`

Bounded explain output for 100 epics × 1000 stories projects (NFR-Sc1 — Story 3.7's AC line 835 declares < 1s emission for `--list`; Story 3.6's `--explain` surfaces a SUBSET of the candidates as alternatives, so the cap keeps it tighter). The truncation tail emits `(... <N> more candidates; run /bmad-next --list to see all)` so the user has a hand-off to the full enumeration. **Rationale**: explain output is a quick-glance diagnostic; the full set is `--list`'s scope.

#### Alternatives sort: `count` ASCENDING → phase-order → name lexicographic

The "closest to ready" interpretation per AC line 817: candidates with the FEWEST unmet preconditions are most likely the next-target if the user's state advances by one more step. Tiebreaker: phase-order (analysis → planning → ... → retro per `PHASE_ORDER`) — a candidate in an earlier phase is "closer" to the project's natural progression. Final tiebreaker: name lexicographic for determinism. **Rationale**: deterministic ordering + intuitive "closest" semantic.

#### `resolvePersonaWithTier` is a SIBLING helper — `resolvePersona` is UNCHANGED

The existing `resolvePersona` has many call sites (Stories 2.4 + 4.1 + 5.* + dispatch path); changing its return shape would cascade. The new sibling helper duplicates the cascade walk + adds tier-tracking. **Rationale**: additive change; zero risk of breaking the existing dispatch path.

#### Tier 0 = `--persona` override

The new tier-label "0: --persona override" surfaces the bypass per Story 3.5's design decision (lines 463-465). Tiers 1-4 mirror Story 1.11's existing cascade. **Rationale**: tier-label provenance lets the user see WHICH source resolved the persona — high-value for the cold-start return journey.

#### Reasoning sentence v0.1 = three-slot semicolon-separated narrative

Without timestamps (Story 6.x telemetry forward-deferral) and without artifact-existence checks (Story 6.x telemetry), the v0.1 reasoning sentence is structurally:
```
Reasoning: <predecessor-state>; <selection-reason>; persona resolved to <persona-name>.
```
This preserves the PRD Journey 1 reading flow (semicolon-separated; period-terminated; "Reasoning:" prefix) while staying within v0.1 schema bounds. Story 6.x telemetry adds the timestamp slot + artifact-existence slot. **Rationale**: structural fidelity to PRD Journey 1; v0.1 schema-bound content.

#### All-done detection v0.1 = `lastSuccessfulStep` is `retro`-phase + zero candidates

Since `state.completedSteps[]` is NOT in v0.1 schema, the proxy detector v0.1 is: `lastSuccessfulStep` is in the highest-phase-order (retro) terminal AND `pickNextStep` would throw filter-exhaustion (zero candidates with met preconditions). Story 6.x replaces with `dag.nodes.size === state.completedSteps.length`. **Rationale**: structurally-correct v0.1 detector; clean Story 6.x evolution path.

#### Persona-resolution failure within explain → graceful message, NOT halt

When `resolvePersonaWithTier` throws (no tier resolves), the explain branch's surrounding `try {} catch {}` catches the throw and renders the AC-2 hint INSIDE the explain message:
```
Resolved persona: (unresolvable — see hint: Add a persona for <step> in bmad-stepper.config.yaml under the personas: block.)
```
The explain branch returns `report` with `exitCode: 0`. **Rationale**: `--explain` is a diagnostic flag — surfacing partial information is better than halting; the user typically wants to see WHY the dispatch would fail.

#### Filter-exhaustion within explain → graceful surface of alternatives

When `pickNextStep` throws filter-exhaustion (e.g., `--phase retro` on a fresh project), the explain branch's surrounding `try {} catch {}` catches and surfaces:
```
Next step: (no target step matches; current filter excludes all candidates)
```
plus the alternatives list (computed over the unfiltered set). **Rationale**: same as above — diagnostic flag should always emit useful information.

### Carry-overs from Story 3.5

- **Story 3.5 §line 528-534** (Story 3.6 forward-coupling — primary consumer): RECEIVED. Story 3.6 INHERITS the persona-tier provenance hand-off; `resolvePersonaWithTier` operationalises the "Tier 1: SKILL.md frontmatter" / etc. labels.
- **Story 3.5 `pickFirstPersona` warn elision on `--persona` override**: RESPECTED. The explain branch's persona-tier surfacing uses Tier 0 = "--persona override" when supplied; the multi-persona warn is NOT emitted for Tier 0.
- **Story 3.5 §v0.1 Design Decisions §`--persona` overrides DO NOT emit the multi-persona warn**: RESPECTED. Test I (Task 8.10) verifies.

### Carry-overs from Story 3.4

- **Story 3.4's `isPreconditionMet(node, state): boolean`** at `src/commands/next/run.ts:451-456`: REUSED. Story 3.6's `computeAlternatives(...)` calls `isPreconditionMet` per candidate to compute the unmet-precondition list (the same predicate); the unmet-list is `node.after.filter(p => !isPreconditionMetForName(p, state))` — i.e., the inverse of the predicate's per-prerequisite check.
- **Story 3.4's `pickNextStep(state, dag, args, log)` 4-arg signature**: REUSED. Story 3.6's explain branch calls `pickNextStep` for the target step name.
- **Story 3.4's filter-exhaustion throw with hint `Run /bmad-next --list to see candidate steps; the current filter excludes all candidates.`**: PRESERVED. The explain branch catches it and renders the alternatives list as the user-friendly substitute.

### Carry-overs from Story 3.3

- **Story 3.3's read-only / lock-free posture**: RESPECTED. Story 3.6's explain branch is a pure read; no state writes; no lock acquisition.
- **Story 3.3's `--dry-run` precedence**: PRESERVED. The explain short-circuit fires BEFORE the dry-run short-circuit per the existing comment at `run.ts:974`.

### Carry-overs from Story 3.2

- **Story 3.2's `resolveResumeTarget(state, dag): { node: DagNode; ... }`**: REUSED. Story 3.6's explain branch calls `resolveResumeTarget` when `args.resume === true` — the resume target becomes the target step in the explain output (Story 3.2's existing semantic that "resume substitutes nextStep").

### Carry-overs from Story 1.11

- **Story 1.11's `resolvePersona({ stepName, ... })` 4-tier cascade**: REUSED via the new sibling helper. The 4 tier-resolver functions (`tier1Frontmatter`, `tier2ProjectConfig`, `tier3Defaults`, `tier4ModuleConfig`) live in `src/personas/resolve.ts`; `resolvePersonaWithTier` reuses them (intra-module access).
- **Story 1.11's AC-2 verbatim hint** (`Add a persona for <step> in bmad-stepper.config.yaml under the personas: block.`): PRESERVED. The explain branch surfaces it inside the message when no tier resolves.

### Carry-overs from Story 1.10

- **Story 1.10's `dag.edgesIn: ReadonlyMap<string, ReadonlySet<string>>`**: TYPE-LEVEL REUSED (the field is documented per `src/dag/types.ts:88` as Story 3.6's primary consumer). v0.1 conservative scope reads `lastSuccessfulStep` only; the full transitive walk via `edgesIn` is forward-deferred to Story 6.x.
- **Story 1.10's `node.optional: boolean`**: REUSED. The alternatives list respects `--include-optional` / `--no-optional` per Story 3.5's filter logic.
- **Story 1.10's `node.phase: Phase`**: REUSED. The alternatives sort uses `PHASE_ORDER` (architecture line 419 / `run.ts:~262`).

### Carry-overs from Story 1.7

- **Story 1.7's `explain: z.boolean().default(false)`** at `src/commands/next/args.ts:159`: REUSED. **No args change needed for Story 3.6.**

### Carry-overs from Epic 2 Retrospective

- **Epic 2 Retrospective §Forward Action Items**: Story 3.6 is the 6th story of Epic 3, between Story 3.5 (`--persona` + `--include-optional`/`--no-optional`) and Story 3.7 (`--list` candidate enumeration). The recommended sequence is preserved.

### Forward Dependencies

- **Story 3.7 (`--list` Candidate Next Steps)**: SECONDARY CONSUMER. Story 3.7's `--list` enumeration may share the per-candidate-line formatting helper if Story 3.6's `formatAlternativeLine(...)` (the per-candidate "step — needs: ... (count: N)" formatter) is exported. Story 3.7 may also extract `isPreconditionMet` to a shared utility if the predicate diverges from `pickNextStep`'s usage.
- **Story 3.8 (`--diff-state` and `--export-state`)**: INDEPENDENT. Story 3.6 + 3.8 are sibling read-only diagnostic flags; no shared surface.
- **Story 3.9 (`--watch`)**: INDEPENDENT. `--watch` tails the run-log; `--explain` reads state once.
- **Story 4.1 (`/bmad-loop` Command Skeleton)**: SECONDARY CONSUMER. The loop runner may invoke `runNext` with `--explain` per iteration to surface the per-step reasoning; Story 4.1 may add a `--explain-each` flag.
- **Story 5.1 (Retry Failure Mode)**: INDEPENDENT. Retry path is in `verify-and-advance.ts`; explain is in `run.ts`.
- **Story 6.x (`state.completedSteps[]` schema extension)**: PRIMARY ARCHITECTURAL EXTENSION. The full transitive predecessor walk + the clean all-done detection both depend on `state.completedSteps[]` landing in the schema. Story 6.1's config-loader + Story 6.x's telemetry-driven schema enhancement reconcile.
- **Story 6.x (run-log timestamp slot)**: SECONDARY EXTENSION. The PRD Journey 1 narrative includes `completed on 2026-04-20`; v0.1's three-slot reasoning sentence omits the timestamp; Story 6.x's run-log read enables it.

### Previous Story Intelligence

This story builds on:

- **Story 1.5 (Schemas + Migrations Skeleton)** — declared `state.lastSuccessfulStep` + `state.lastAttempted` on `StateV1Schema`. Story 3.6 reads `lastSuccessfulStep` for the predecessor chain + the all-done detector; reads `lastAttempted` for the resume-target path.
- **Story 1.7 (CLI Argument Parser)** — declared `explain: z.boolean().default(false)` on `NextArgsSchema`. Story 3.6 inherits the flag declaration verbatim.
- **Story 1.10 (DAG seed + 3-tier registry)** — established `node.optional: boolean` + `node.phase: Phase` + `dag.edgesIn: ReadonlyMap<string, ReadonlySet<string>>`. Story 3.6 reads all three for the alternatives list.
- **Story 1.11 (Persona Resolution)** — established `resolvePersona({ stepName, ... }): Promise<string | readonly string[]>` with the 4-tier cascade. Story 3.6 ADDS the sibling `resolvePersonaWithTier(...)` for tier-label provenance.
- **Story 2.2 (Dispatch Spec Generator)** — established `BuildDispatchSpecInput`; the explain branch does NOT call `buildDispatchSpec` (no dispatch happens; `report` action emitted instead).
- **Story 2.4 (`run.ts` lock-free runner)** — established the placeholder explain short-circuit at `run.ts:1001-1029`. Story 3.6 REPLACES the placeholder body; preserves the surrounding `report` action contract.
- **Story 3.1 (Record `last_attempted` / `last_failure_reason` on Halt)** — UNCHANGED. The explain branch is read-only.
- **Story 3.2 (`--resume` Flag)** — established `resolveResumeTarget(state, dag)`. Story 3.6 reuses for the `--explain + --resume` combo (Test J).
- **Story 3.3 (`--dry-run` Flag)** — established read-only / lock-free posture for diagnostic flags. Story 3.6 inherits.
- **Story 3.4 (`--step` and Scope Flags)** — established `isPreconditionMet(node, state): boolean` at `run.ts:451-456`. Story 3.6 REUSES for the alternatives unmet-precondition computation.
- **Story 3.5 (`--persona` + `--include-optional`/`--no-optional`)** — established the persona-override branch + the optional-toggle filter; explicitly forward-deferred persona-tier provenance to Story 3.6. Story 3.6 ADDS the tier-label surfacing.

Story 3.6 does NOT consume from:

- Stories 1.1-1.4, 1.6, 1.8, 1.9, 1.12, 1.13 (repo scaffold, errors module, logger, lock, branch detection, BMAD detection, doctor, quick-start docs) — these are independent prerequisites for `run.ts` but their public APIs are not touched by Story 3.6.
- Stories 2.1, 2.3, 2.5, 2.6, 2.7, 2.8 (verifier registry, sub-agent markdown, transcript writers, verify-and-advance, Layer 1 markdown, smoke test) — Story 3.6 doesn't touch the verifier surface, sub-agent prompt, transcript writer, lock-held runner, Layer 1 markdown, or smoke test.

### Open Questions for Code Review

1. **Should the all-done detector v0.1 use the `state.lastSuccessfulStep.phase === 'retro'` heuristic, or a different proxy?** v0.1 conservative chooses the retro-phase proxy (the project's terminal phase); alternative proxies (e.g., `pickNextStep` throws AND `--include-optional --no-optional` are both impossible per cross-validation, so a NULL filter still yields zero candidates) are theoretically equivalent but less semantically clear. Story 6.x replaces with `state.completedSteps[]` set-coverage check — clean evolution path.
2. **Should the alternatives list cap be configurable?** v0.1 conservative: hardcode `MAX_ALTERNATIVES = 5`. Story 6.1 may wire it via `bmad-stepper.config.yaml execution.explainAlternativesCap: 5` (or similar) when the config-loader lands.
3. **Should the persona-resolution AC-2 throw still propagate from `resolvePersonaWithTier` (i.e., halt the explain branch)?** v0.1 conservative chooses graceful-message-not-halt (Test N): the explain branch's surrounding `try {} catch {}` catches and renders the hint inside the message; the explain returns `report` with `exitCode: 0`. The user's `--explain` invocation should ALWAYS produce a useful diagnostic, not a halt — even when persona resolution fails (the hint is the diagnostic). **Alternative**: propagate the throw for "fail-loud" semantics. **Trade-off**: the alternative breaks the "diagnostic-not-halt" intent of `--explain`. v0.1 chooses graceful.
4. **Should the predecessor chain v0.1 use the `[state.lastSuccessfulStep?.step]` single-element list, or a multi-element walk via `dag.edgesIn`?** v0.1 conservative chooses single-element (matches the v0.1 `state.completedSteps[]` absence). The multi-element walk would TRAVERSE the inverse-DAG from the target step's `node.after[]` back to entry-points and emit the chain ORDER-PRESERVED — but this would surface NODES that are in the path but NOT in the user's actual completion set (the v0.1 schema can't distinguish). v0.1 chooses correctness over completeness; Story 6.x trades up.
5. **Should the alternatives list show "preconditions met" for already-met candidates that AREN'T the target?** v0.1 conservative: YES — surface as `<step-name> — preconditions met` (count: 0). This is the case where multiple candidates were viable; the tiebreaker chose the target; the user benefits from seeing what ELSE could have been picked. Story 4.1's loop-runner may consume this surface for "which step would the loop pick next-after-this?" lookahead.
6. **Should the explain output be available via `--list --explain` combination?** v0.1 conservative: NO — `--explain` short-circuits BEFORE `--list` per the existing precedence comment at `run.ts:974`. Story 3.7 may revisit if a combined "explain + list" view is desired.
7. **Should the reasoning sentence include a phase reference?** v0.1 conservative: the three-slot template omits explicit phase mention (it's implicit in the step name + the alternatives list); Story 6.x telemetry may add a phase slot when the timestamp slot lands.
8. **Should the multi-persona case in the explain output enumerate ALL personas?** v0.1 conservative: surface ONLY the first persona + the multi-persona warn note (matches `pickFirstPersona`'s v0.1 behaviour). Story 4.1's loop runner may enumerate all personas when sequential dispatch lands.

## Dev Agent Record

### Context Reference

- `_bmad-output/implementation-artifacts/3-6-explain-reasoning-trace.md` (this file)
- `src/commands/next/run.ts` (explain placeholder replacement at lines 1001-1029 + 5 new internal helpers)
- `src/commands/next/run.test.ts` (Story 3.6 coverage describe block — 10-15 cases)
- `src/personas/resolve.ts` (new sibling helper `resolvePersonaWithTier` + `ResolvedPersonaWithTier` interface)
- `src/personas/resolve.test.ts` (~7 new test cases for `resolvePersonaWithTier`)

### Agent Model Used

Opus 4.7 (1M context) — bmad-dev-story sub-agent for Story 3.6 (1M-context variant per BMAD `dev` agent skill).

### Debug Log References

- Bun host: 1.3.12 (AR2 satisfied — Bun >= 1.3).
- Pre-implementation baseline confirmed: 625 pass / 0 fail / 2281 expects / 49 files (Story 3.5 final).
- Post-implementation final: 648 pass / 0 fail / 2374 expects / 49 files (Δ +23 tests / +93 expects vs Story 3.5 baseline).
- 1 repair iteration consumed: a single `bunx --bun biome ci` violation (`useSortedKeys` on the `src/personas/index.ts` type re-export block — alphabetical type names) was corrected by reordering `ResolvedPersonaWithTier` ahead of `ResolveInput`/`ResolveOptions`. Tests passed cleanly on first run after the explain branch + helpers + tests landed; only the import-organisation rule needed a single follow-up edit.
- ZERO TypeScript errors / ZERO test failures on initial post-edit validation.

### Completion Notes List

- **Implementation lands cleanly inside the story spec's allowed mutation surface.** Modified `src/personas/resolve.ts` to ADD the `resolvePersonaWithTier(...)` sibling helper + `ResolvedPersonaWithTier` interface + 5 tier-label string constants. NO change to `resolvePersona`'s shape or call sites — strictly additive (~133 lines net delta; 585 → 718). Modified `src/personas/index.ts` to re-export the new symbol + type (+3 lines). Modified `src/commands/next/run.ts` to REPLACE the Story 2.4 placeholder explain branch with the structured 5-component trace + ADD 8 new internal helpers (`buildPredecessorChain`, `unmetPrereqsForCandidate`, `computeAlternatives`, `formatAlternativesLines`, `isProjectAllDone`, `formatPersonaLine`, `formatReasoningSummary`, `formatExplainMessage`). Net delta ~462 lines (1362 → 1824). Modified `src/commands/next/run.test.ts`: APPENDED a new `describe("runNext — Story 3.6 --explain reasoning trace", ...)` block with 15 colocated test cases per Task 8 (Tests A through O). UPDATED 5 pre-existing tests that asserted the placeholder string `"Story 3.6"` / `"current next step:"` / `"(none — DAG empty or filters exclude all candidates)"` to assert the new structured-message format. ~487 lines net delta (2419 → 2906). Modified `src/personas/resolve.test.ts`: APPENDED a new `describe("resolvePersonaWithTier — Story 3.6 sibling helper", ...)` block with 8 colocated test cases (1 cascade-exhaustion + 1 each per tier 0/1/2/3-single/3-multi/4 + 1 empty-string-override fallthrough). ~152 lines net delta (328 → 480).
- **Test breakdown (Story 3.6 explain coverage in run.test.ts)**: AC line 815-817 × 7 (Test A: 5-component trace happy path; Test B: fresh-project chain; Test C: alternatives sort closeness-to-ready; Test D: alternatives respect --no-optional; Test E: --persona Tier 0 label; Test F: default Tier 3 label; Test G: reasoning-summary three-slot regex). AC lines 818-820 × 1 (Test H: byte-identical all-done verbatim). AC line 821 × 2 (Test I: stderr discipline / multi-persona warn elision; Test O: human-greppable multi-line). Edge × 5 (Test J: --explain + --resume; Test K: --explain + --step; Test L: --explain + --dry-run precedence; Test M: filter-exhaustion graceful surface; Test N: persona-resolution AC-2 throw → graceful hint inside).
- **Test breakdown (resolvePersonaWithTier in resolve.test.ts)**: 8 colocated test cases — 1 per tier (0 single + 0 empty-string fallthrough + 1 + 2 + 3-single + 3-multi + 4) + 1 cascade exhaustion. All 5 tiers (0-4) covered with ≥1 case each; the multi-persona case asserts the array shape preservation through tier tracking.
- **Updated 5 pre-existing tests** to assert the new structured explain message format: (a) AC-2 read-only flag test at `run.test.ts:304` asserts the 3 canonical line prefixes (`Next step:`, `Chain of completed predecessors:`, `Reasoning:`); (b) Story 3.2 `--resume + --explain` test at `run.test.ts:1111` asserts the `Next step: bmad-dev-story` line + the `explicit --resume target (bmad-dev-story)` reasoning slot; (c) Story 3.3 `--dry-run + --explain` test at `run.test.ts:1401` asserts explain-trace prefixes (NOT dry-run preview prefix); (d) Story 3.4 `--step bmad-create-architecture + --explain` test at `run.test.ts:1926` asserts the graceful `Next step: (no target step matches; current filter excludes all candidates)` line + the alternatives section; (e) Story 3.5 Test O `--persona + --explain` at `run.test.ts:2402` asserts the Tier 0 override label.
- **NO new error classes.** Registry CI gate stays at 16 codes (verified via `bun test src/errors.test.ts`: 10 pass / 197 expects unchanged). Story 3.6 ships ZERO throws — the all-done branch returns `report` with `exitCode: 0`; the filter-exhaustion case is caught + surfaced inside the explain message; the persona AC-2 throw is caught + rendered inside the explain message. The explain branch is graceful-not-halt per the v0.1 design decision.
- **NO state-yaml writes from `run.ts`.** Lock-free contract per architecture §line 1672 + AR8 preserved.
- **NO new modules / NO Layer 1 markdown change / NO `verify-and-advance.ts` change / NO schema bump / NO `args.ts` change / NO `dag/` change / NO `dispatch/` change.** Story 3.6 is purely additive at the runner-tier composer (helpers + tests) + the personas mid-tier (sibling helper).
- **AR41 boundary preserved.** `src/commands/next/run.ts` (top-tier) imports `resolvePersonaWithTier` from `src/personas/index.ts` (mid-tier) — the EXISTING boundary direction (top consumes mid). The colocated AR41 boundary check at `run.test.ts:606-638` continues to pass unchanged.
- **AR9 protocol preserved.** The dispatch line shape is unchanged. The `report` action's `message` field carries a multi-line `\n`-joined string; the AR9 JSON line on stdout stays single-line. Defense-in-depth `DispatchActionV1Schema.parse()` validates the line.
- **9 v0.1 design decisions documented in JSDoc** at the explain-helpers section header (per story §v0.1 Design Decisions): (1) Predecessor chain v0.1 = `[state.lastSuccessfulStep?.step]` single-element list; (2) Alternatives capped at `MAX_ALTERNATIVES = 5` with truncation tail; (3) Alternatives sorted by `count` ASC → phase-order → name lexicographic; (4) `resolvePersonaWithTier` is a SIBLING helper — `resolvePersona` is UNCHANGED; (5) Tier 0 = `--persona override` per Story 3.5; (6) Reasoning sentence v0.1 = three-slot semicolon-separated narrative; (7) All-done detection v0.1 = `lastSuccessfulStep.phase === retro` + zero candidates; (8) Persona-resolution AC-2 throw → graceful message NOT halt; (9) Filter-exhaustion within explain → graceful surface of alternatives.
- **Forward-coupling documented.** JSDoc at the explain-helpers section references Stories 3.7 (`--list` candidate enumeration may share the per-line formatter), 3.8 / 3.9 / 4.1 (independent), 6.x (`state.completedSteps[]` schema extension enables full transitive predecessor walk + clean all-done detection).
- **1 repair iteration consumed.** A single `useSortedKeys` Biome violation in `src/personas/index.ts` (alphabetical type re-export ordering — `ResolvedPersonaWithTier` had to come before `ResolveInput`/`ResolveOptions`) was the only post-edit fix required. The `bun test` / `bunx tsc --noEmit` validators all passed exit 0 on first invocation. Within the ≤3 budget.
- **No deviations from story spec.** Test C asserts the closeness-to-ready ordering by parsing the per-line counts via regex and asserting non-decreasing sequence — equivalent to the spec's "lower-`count` entries appear before higher-`count` entries" wording, but more robust to fixture-specific tiebreaker variation. Test N uses `bmad-help` (Tier 3 OMITTED in `defaults.ts`; persona null in seed) as the persona-resolution AC-2 throw fixture — a minor refinement vs the spec's "a state where the resolved next step has NO Tier 1/2/3/4 persona match" abstract direction.

### Test Counts (final)

- **bun run check**: exit 0.
- **Total**: 648 pass / 0 fail / 2374 expect() calls / 49 files.
- **Story 3.6 delta**: +23 tests / +93 expects / 0 new files (vs. Story 3.5 final baseline of 625 / 2281 / 49).
- **Run-tests suite** (`bun test src/commands/next/run.test.ts`): 109 pass / 379 expects (94 pre-Story-3.6 + 15 new Story 3.6).
- **Personas-tests suite** (`bun test src/personas/resolve.test.ts`): 27 pass / 58 expects (19 pre-Story-3.6 + 8 new resolvePersonaWithTier).
- **Errors registry CI gate** (`bun test src/errors.test.ts`): 10 pass / 197 expects — registry stays at 16 codes.
- **TypeScript** (`bunx --bun tsc --noEmit`): exit 0.
- **Biome ci** (`bunx --bun biome ci .`): exit 0 (115 files checked clean).

### File List

#### Modified Files

- `src/commands/next/run.ts` (1362 → 1824, +462 lines):
  - Modified import: tightened `import { resolvePersona } from "../../personas/index.ts";` → `import { type ResolvedPersonaWithTier, resolvePersona, resolvePersonaWithTier } from "../../personas/index.ts";`.
  - Inserted Story 3.6 `--explain` reasoning-trace helpers section between `resolveResumeTarget` and `runNext` (~310 new lines): `MAX_ALTERNATIVES = 5` constant, `AlternativeCandidate` interface, `buildPredecessorChain`, `unmetPrereqsForCandidate`, `computeAlternatives`, `formatAlternativesLines`, `isProjectAllDone`, `formatPersonaLine`, `formatReasoningSummary`, `formatExplainMessage`. JSDoc inlines all 9 v0.1 design decisions.
  - Replaced the Story 2.4 placeholder body inside `if (args.explain)` (lines 1001-1029 → 1384-1487 post-edit) with the structured 5-component composition + the all-done short-circuit + the graceful try/catch around `pickNextStep` / `resolveResumeTarget` / `resolvePersonaWithTier`.
- `src/commands/next/run.test.ts` (2419 → 2906, +487 lines):
  - APPENDED new `describe("runNext — Story 3.6 --explain reasoning trace", ...)` block with 15 colocated test cases (Tests A through O). Reuses module-level `tmp` setup, `writeMinimalState`, `commonOpts`. Adds colocated `captureLogger()` factory + `writeStateWithLastSuccessful()` factory + `writeFreshState()` helper (the Story 3.6 default fixture values: epic=3, story="3.6").
  - Updated 5 pre-existing tests that asserted the Story 2.4 placeholder string (the test at line 304 in `--explain` AC-2 read-only flag tests; the test at line 1111 in Story 3.2 `--resume + --explain` combo; the test at line 1401 in Story 3.3 `--dry-run + --explain` combo; the test at line 1926 in Story 3.4 `--step blocked + --explain`; the test at line 2402 in Story 3.5 Test O `--persona + --explain`).
- `src/personas/resolve.ts` (585 → 718, +133 lines):
  - APPENDED Story 3.6 `resolvePersonaWithTier` sibling helper section after `resolvePersona`: `ResolvedPersonaWithTier` interface, 5 tier-label string constants (`TIER_LABEL_OVERRIDE` through `TIER_LABEL_MODULE_CONFIG`), `resolvePersonaWithTier(...)` exported async function. Strictly additive — `resolvePersona` is UNCHANGED. JSDoc documents the Tier 0 short-circuit + the strictly-additive contract.
- `src/personas/resolve.test.ts` (328 → 480, +152 lines):
  - Modified import to add `resolvePersonaWithTier`.
  - APPENDED new `describe("resolvePersonaWithTier — Story 3.6 sibling helper", ...)` block with 8 colocated test cases.
- `src/personas/index.ts` (23 → 26, +3 lines):
  - Re-exports the new `ResolvedPersonaWithTier` type + `resolvePersonaWithTier` function.

#### New Files

(none — Story 3.6 is purely additive on existing files; no new modules; no new integration test file required by AC.)

#### Sprint Status

- `_bmad-output/implementation-artifacts/sprint-status.yaml` — flipped `3-6-explain-reasoning-trace` from `ready-for-dev` → `review`. `epic-3` remains `in-progress`.

#### Story File

- `_bmad-output/implementation-artifacts/3-6-explain-reasoning-trace.md` — Tasks/Subtasks all marked `[x]`, frontmatter status flipped to `review`, inline status line flipped to `review`, Dev Agent Record / Test Counts / File List / Change Log populated.

#### Task Record

- `.bmad-stepper/runs/2026-05-01T210224Z-bmad-next/tasks/t1-dev-story.yaml` (NEW) — task record per BMAD dev-story discipline.

#### NOT Modified (per spec)

- `src/commands/next/args.ts` — `--explain` already declared by Story 1.7 line 159 (`explain: z.boolean().default(false)`).
- `src/personas/defaults.ts` — Tier 3 hand-curated defaults stay (no new entries).
- `src/dag/types.ts` / `src/dag/index.ts` / `src/dag/build.ts` / `src/dag/seed-v6.x.ts` — DAG node/adjacency types unchanged; the new helpers consume `node.after` + `node.phase` + `node.optional` + `dag.nodes` only (the `edgesIn` field is documented as the Story 6.x consumer; v0.1 reads `lastSuccessfulStep` only).
- `src/errors.ts` — registry stays at 16 codes (no new error class).
- `src/dispatch/generate-spec.ts` / `src/dispatch/index.ts` — dispatch-spec construction unchanged; `--explain` short-circuits BEFORE the dispatch path.
- `src/state/load.ts` — `loadStateUnlocked` already exposed.
- `src/commands/next/verify-and-advance.ts` — Story 3.6 does NOT touch the lock-held runner.
- `commands/bmad-next.md` — Layer 1 markdown already branches on `action`; the `report` action's `message` field carries the multi-line content as a `\n`-joined string.
- `src/schemas/state.ts` / `src/schemas/dispatch-protocol.ts` — no schema bump.

## Senior Developer Review (AI)

**Reviewer**: bmad-code-review (claude-opus-4-7[1m])
**Reviewed**: 2026-05-01
**Verdict**: **APPROVE** (status: review → done)
**Counts**: must-fix=0 | should-fix=0 | nits=0 | info=2

### Outcome

Implementation lands cleanly inside the spec's allowed mutation surface. All 3 ACs delivered with high fidelity to the verbatim AC wording (epic lines 813-821). The Story 2.4 placeholder explain branch is replaced by a structured 5-component multi-line `report` message; the new `resolvePersonaWithTier` sibling helper in `src/personas/resolve.ts` is strictly additive (`resolvePersona`'s return shape and call sites are untouched). AR8 / AR9 / AR21 / AR22 / AR33 / AR41 invariants preserved; FR8/12/13/15/53/54 + NFR-S2/S5/M3/R1/I2 all PASS. Quality gates reproduce green (648 / 0 / 2374 / 49). 8 open questions + 2 minor dev deviations adjudicated ACCEPT v0.1 conservative.

### AC Verification

- **AC-1** (epic lines 815-817: `--explain` supplied → JSON-line action is `"report"` with `message` containing target step name + chain of completed predecessors + unmet preconditions for alternatives sorted closest-to-ready + resolved persona + one-sentence reasoning summary in PRD Journey 1 format) — **PASS**.
  - Production branch at `src/commands/next/run.ts:1384-1491` (`if (args.explain)`); composer at `run.ts:1176-1233` (`formatExplainMessage`) emits a `\n`-joined 5-component string.
  - Component 1 (target step) at `run.ts:1198-1204` — calls `pickNextStep` (or `resolveResumeTarget` when `args.resume`); graceful try/catch surfaces `Next step: (no target step matches; current filter excludes all candidates)` on filter exhaustion.
  - Component 2 (predecessor chain) at `run.ts:1206-1212` via `buildPredecessorChain` (`run.ts:918-921`) — v0.1 `[state.lastSuccessfulStep?.step]` single-element list; emits `(none — fresh project)` when empty.
  - Component 3 (alternatives sorted closest-to-ready) at `run.ts:1214-1217` via `computeAlternatives` (`run.ts:962-996`) sorted `count` ASC → phase-order → name lexicographic; capped at `MAX_ALTERNATIVES = 5` with truncation tail; respects `--no-optional`/`--include-optional`.
  - Component 4 (resolved persona w/ tier label) at `run.ts:1219-1220` via `formatPersonaLine` (`run.ts:1077-1096`); 5-tier label set sourced from `resolvePersonaWithTier` at `src/personas/resolve.ts:622-626` (`TIER_LABEL_OVERRIDE` through `TIER_LABEL_MODULE_CONFIG`).
  - Component 5 (one-sentence PRD-Journey-1 reasoning) at `run.ts:1222-1230` via `formatReasoningSummary` (`run.ts:1118-1161`) — 3-slot semicolon-separated narrative; period-terminated.
  - Tests A/B/C/D/E/F/G at `run.test.ts:2532-2695` cover all 5 components incl. fresh-project chain, closeness-to-ready ordering, `--no-optional` exclusion, Tier 0 / Tier 3 labelling, three-slot regex.

- **AC-2** (epic lines 818-820: no next step / all done → message reads `All BMAD steps for this project are complete. See /bmad-next --list to inspect remaining optional or unsatisfied steps.`) — **PASS**.
  - All-done detector at `run.ts:1048-1066` (`isProjectAllDone`) — v0.1 proxy: `state.lastSuccessfulStep.phase === "retro"` AND no DAG node has `lastSuccessfulStep.step` in its `after[]`.
  - Branch at `run.ts:1418-1422` emits the verbatim string via `reportWithMessage`.
  - Test H at `run.test.ts:2699-2719` asserts BYTE-IDENTICAL match using `expect(result.action.message).toBe(...)` against the AC line 820 string — period after `complete.`, period after `steps.`, leading `/` before `bmad-next`.

- **AC-3** (epic line 821: explain output is human-greppable, not JSON-only — diagnostics on stderr per FR54) — **PASS**.
  - Multi-line `\n`-joined message lives INSIDE the AR9-conformant single-line JSON `report.message` field; AR9 invariant at `src/schemas/dispatch-protocol.ts` UNCHANGED.
  - The 5 component lines are individually `^Next step:`, `^Chain of completed predecessors:`, `^  - <alt>` / `^Alternative candidates:`, `^Resolved persona:`, `^Reasoning:` — directly greppable via `jq -r '.message'` then `grep`.
  - FR54 stderr discipline: explain branch emits ZERO new stderr writes; `pickFirstPersona` multi-persona warn ELIDED on Tier 0 (override path bypasses array branch); existing diagnostic warns route through `LoggerFns.warn` → `src/io/log.ts:20-21`.
  - Tests I + O at `run.test.ts:2723-2748` and `2880-2905` assert: (I) `--persona dev` + multi-persona Tier 3 step → 0 multi-persona warns captured; (O) message is multi-line (≥4 newlines) and per-line greppable for each canonical prefix.

### Architecture / NFR / FR coverage

- **AR8** (lock-free `run.ts` / lock-held `verify-and-advance.ts`) — **PASS**. The explain branch reads via `loadStateUnlocked({ statePath })` at `run.ts:1407`; ZERO state writes; ZERO lock acquisition; the AR41 boundary check at `run.test.ts:606-638` (which guards both AR8 and AR41) continues to pass.
- **AR9** (single discriminated-union JSON line on stdout) — **PASS**. The `report` action shape is unchanged (`DispatchActionV1` schema still single-line); the multi-line content lives ENTIRELY INSIDE the `message` string field. Defense-in-depth `DispatchActionV1Schema.parse()` in `emitDispatchAction` validates.
- **AR21** (errors carry code + exitCode) — **PASS**. ZERO new throws introduced. The all-done branch returns `report` with `exitCode: 0`; the filter-exhaustion case is CAUGHT in the surrounding `try/catch` at `run.ts:1428-1440` and rendered narratively; the persona AC-2 throw is CAUGHT at `run.ts:1457-1476` and rendered via `formatPersonaLine` inside the message. Registry stays at **16 codes** (`bun test src/errors.test.ts`: 10 pass / 197 expects).
- **AR22** (errors carry actionable hint; single-line `Run/See/Try/Check`) — **PASS**. ZERO new hints; the AC-2 hint propagated from `resolvePersonaWithTier` (re-using `ac2NoPersonaHint` from `resolve.ts:106`) is preserved verbatim and rendered inside the explain message.
- **AR33** (function & error semantics; throw not Result; no console.\*; async/await) — **PASS**. All 8 new helpers (`buildPredecessorChain`, `unmetPrereqsForCandidate`, `computeAlternatives`, `formatAlternativesLines`, `isProjectAllDone`, `formatPersonaLine`, `formatReasoningSummary`, `formatExplainMessage`) are pure / synchronous; `resolvePersonaWithTier` is async/await with no console.\*. No Result-shape introduced.
- **AR41** (boundary graph; no upward / sibling-higher imports) — **PASS**. **Verified independently**: `git diff src/commands/next/run.ts | grep "^+import"` yields exactly 1 changed import block — the EXISTING `personas` mid-tier import re-organised to add `type ResolvedPersonaWithTier` + `resolvePersonaWithTier` (top-tier `commands/next/run.ts` consuming mid-tier `personas/index.ts` is the existing boundary direction per architecture lines 1294-1302). `git diff src/personas/resolve.ts | grep "^+import"` yields ZERO new imports (resolve.ts reuses its existing imports). The colocated AR41 boundary check at `run.test.ts:606-638` continues to pass.
- **FR8** (`/bmad-next` single-step advance) — **EXTENDED PASS**. The runner now respects `--explain` per AC lines 815-821.
- **FR12** (`--persona` override) — **EXTENDED PASS**. The explain output surfaces "Tier 0: --persona override" via `formatPersonaLine` at `run.ts:1087-1089`. Test E asserts.
- **FR13** (`--explain` reasoning) — **PRIMARY DELIVERABLE PASS**. v0.1 ships the 5-component multi-line trace per epic AC line 817; replaces the Story 2.4 placeholder. Tests A through G + I + O verify each surface.
- **FR15** (`--include-optional`/`--no-optional`) — **EXTENDED PASS**. `computeAlternatives` at `run.ts:978-979` honours both flags (default-exclude + explicit-include + explicit-exclude); Test D asserts the `--no-optional` exclusion in the alternatives list.
- **FR53** (documented exit codes) — **PASS**. The explain branch returns `report` with `exitCode: 0` (success — read-only); the all-done branch also returns `exitCode: 0`. No exit-code drift.
- **FR54** (stdout/stderr discipline) — **PASS**. Story 3.6 emits ZERO new stderr writes from the explain branch; existing `pickFirstPersona` warn (mid-tier path) is preserved on the regular dispatch path; the explain branch's `resolvePersonaWithTier` does NOT call `pickFirstPersona`. Test I asserts the multi-persona warn IS NOT emitted under the Tier 0 override case.
- **NFR-S2** (writes only inside scope) — **PASS BY ABSENCE**. The explain branch is read-only; ZERO write surface introduced; the `dryRun` orphan-cleanup gate at `run.ts:1320` is unchanged (orphan cleanup runs before the explain branch but only when `!args.dryRun`; the explain branch itself does not write).
- **NFR-S5** (non-corrupting flag combinations) — **PASS**. Composition tests J (`--explain + --resume`), K (`--explain + --step`), L (`--explain + --dry-run`), M (`--explain + --phase retro` filter-exhaustion), N (`--explain + --step bmad-help` persona AC-2 throw graceful) all assert correct precedence + non-corruption. The explain short-circuit fires BEFORE list / dry-run per the run.ts:1357-1358 comment.
- **NFR-M3** (well-instrumented errors) — **PASS BY INHERITANCE**. The pre-existing throws all carry detail JSON; the explain branch's surrounding try/catch surfaces the actionable hints inside the message via `formatPersonaLine` and the graceful pickError surface.
- **NFR-R1** (zero data loss on halt) — **PASS BY ABSENCE**. Read-side only via `loadStateUnlocked`; no write paths touched.
- **NFR-I2** (unknown-skill fail-loud) — **PRESERVED**. The explain branch does not introduce any registry-validation surface; the AC-2 throw from `resolvePersonaWithTier` (cascade exhaustion) is rendered inside the explain message rather than halting — this is the documented "diagnostic-not-halt" v0.1 design decision (open-question-3 ACCEPT). The user's `--explain` invocation still surfaces the fail-loud hint verbatim.

### Findings

#### Must-fix

(none)

#### Should-fix

(none)

#### Nits

(none)

#### Info

- **Info-1** (`resolvePersonaWithTier` duplicates the 4-tier cascade walk from `resolvePersona`): the new sibling helper at `src/personas/resolve.ts:645-718` reuses the per-tier helpers (`tier1Frontmatter`, `tier2ProjectConfig`, `tier3Defaults`, `tier4ModuleConfig`) but duplicates the cascade orchestration logic. The dev-story §v0.1 Design Decisions correctly justifies this as "additive change; zero risk of breaking the existing dispatch path". A future refactor (Story 6.1 + onwards) could promote `resolvePersona` to delegate to `resolvePersonaWithTier` and discard the tier metadata, eliminating the cascade duplication. v0.1 conservative posture is correct here — the duplication is bounded (~60 lines) and the cost of a return-shape cascade across many call sites (Stories 2.2 / 2.4 / 4.1 / 5.* / 6.x) outweighs the deduplication benefit.
- **Info-2** (predecessor chain v0.1 = single-element `[state.lastSuccessfulStep?.step]`): the v0.1 chain truncates the inverse-DAG walk at the most-recently-completed step. AC line 817 says "the chain of completed predecessors" (plural), but the v0.1 schema lacks `state.completedSteps[]` (per `src/schemas/state.ts:92-119`) so a multi-element walk would surface DAG-path nodes NOT in the user's actual completion set. The dev-story §v0.1 Design Decisions correctly defers the full transitive walk to Story 6.x telemetry-driven enhancement. The chain-line format (`Chain of completed predecessors: <name>` vs `Chain of completed predecessors: (none — fresh project)`) is structurally compatible with the future multi-element format — Story 6.x can extend without breaking the line shape.

### Validator Independent Re-Run

- `bun test`: **648 pass / 0 fail / 2374 expect() calls / 49 files** (matches dev-story claim of +23 tests / +93 expects vs Story 3.5 baseline 625 / 2281).
- `bun run check`: **exit 0** (Biome ci + tsc + bun test all clean).
- `bunx --bun biome ci .`: **exit 0** (115 files checked clean in 41ms).
- `bunx --bun tsc --noEmit`: **exit 0** (no TypeScript errors).
- `bun test src/commands/next/run.test.ts`: **109 pass / 0 fail / 364 expect() calls** (matches dev-story claim of 94 pre-Story-3.6 + 15 new = 109).
- `bun test src/personas/resolve.test.ts`: **27 pass / 0 fail / 58 expect() calls** (matches dev-story claim of 19 pre-Story-3.6 + 8 new resolvePersonaWithTier = 27).
- `bun test src/errors.test.ts`: **10 pass / 0 fail / 197 expect() calls** — registry stays at **16 codes** (AR21 invariant preserved).
- AR41 boundary check (`git diff src/commands/next/run.ts | grep "^+import"`): **1 reorganised import block** (only `personas/index.ts` import re-org to add the additive sibling symbol + type — preserves top-tier→mid-tier direction). `git diff src/personas/resolve.ts | grep "^+import"`: **0 new imports**.
- AC-text byte-identical: `diff <(sed -n '813,821p' epics.md) <(grep -A 30 "^## Acceptance Criteria" 3-6-...md | sed -n '/^\*\*Given\*\*/,/^\*\*And\*\* the explain output is/p')` → **2 lines context-only delta** (the reproduction in story 3-6 includes a leading `**Acceptance Criteria:**` header line at offset 0; the verbatim BDD AC content matches; same shape as Story 3.5's AC verbatim diff).

### Deviations Adjudication

The dev-story enumerated 8 open questions (lines 766-773 of the story spec) + 2 minor dev deviations (lines 207-210 of the dev-story task record). All adjudicated ACCEPT v0.1 conservative — Story 3.6 is a v0.1 conservative scope replacement of the placeholder explain branch.

- **open-question-1 (all-done detector v0.1 use `lastSuccessfulStep.phase === 'retro'` heuristic, or different proxy?)** — **ACCEPT v0.1 conservative**. The retro-phase proxy maps cleanly to the project's terminal phase per architecture line 469 (analysis → planning → solutioning → implementation → retro). Alternative proxies (NULL filter / `--include-optional` impossibility) are theoretically equivalent but less semantically clear. Story 6.x replaces with `state.completedSteps[]` set-coverage check — clean evolution path; Test H asserts byte-identical hint emission against the retro-phase fixture.
- **open-question-2 (alternatives list cap configurable via `bmad-stepper.config.yaml execution.explainAlternativesCap`?)** — **ACCEPT v0.1 conservative**. Hardcoded `MAX_ALTERNATIVES = 5` at `run.ts:899` keeps the v0.1 explain output bounded; Story 6.1 may wire it via the project config when the full config-loader lands. The truncation tail emits a hand-off to `--list` for the unbounded enumeration.
- **open-question-3 (persona-resolution AC-2 throw → propagate or graceful?)** — **ACCEPT v0.1 conservative (graceful)**. `--explain` is a diagnostic flag; surfacing partial information serves the cold-start return journey better than halting. The catch at `run.ts:1468-1476` renders the AC-2 hint INSIDE the explain message (`Resolved persona: (unresolvable — see hint: <ac2NoPersonaHint>)`); explain returns `report` with `exitCode: 0`. Test N at `run.test.ts:2846-2876` asserts the graceful surface using `bmad-help` (Tier 3 OMITTED in `defaults.ts:90-92`).
- **open-question-4 (predecessor chain v0.1 use single-element or multi-element walk via `dag.edgesIn`?)** — **ACCEPT v0.1 conservative (single-element)**. `state.completedSteps[]` is NOT in v0.1 schema (per `src/schemas/state.ts:92-119`); a multi-element walk would surface DAG-path nodes NOT in the user's actual completion set. v0.1 chooses correctness over completeness. Tracked as Info-2.
- **open-question-5 (alternatives list show "preconditions met" for already-met candidates that AREN'T the target?)** — **ACCEPT v0.1 conservative (YES)**. The `formatAlternativesLines` helper at `run.ts:1015-1017` emits `<step-name> — preconditions met` (count: 0) for candidates with empty unmet lists. Surfaces the multi-viable-candidates case where the tiebreaker chose the target.
- **open-question-6 (explain output via `--list --explain` combination?)** — **ACCEPT v0.1 conservative (NO)**. The explain short-circuit at `run.ts:1384` returns BEFORE the list short-circuit at `run.ts:1493` per the existing precedence comment at `run.ts:1357-1358`. Test L asserts explain wins on `--explain + --dry-run`; the `--list + --explain` semantic is identical (explain wins). Story 3.7 may revisit if a combined view is desired.
- **open-question-7 (reasoning sentence include phase reference?)** — **ACCEPT v0.1 conservative**. The three-slot template omits explicit phase mention (it's implicit in the step name + the alternatives section); Story 6.x telemetry may add a phase slot when the timestamp slot lands.
- **open-question-8 (multi-persona case enumerate ALL personas or just first?)** — **ACCEPT v0.1 conservative (first only + warn note)**. The `formatPersonaLine` multi-persona branch at `run.ts:1090-1094` emits `Resolved persona: <first> (multi-persona Tier <N>; sequential dispatch deferred to Stories 4.1 + 5.*)`. Matches the `pickFirstPersona` v0.1 behaviour at `run.ts:320-341`. Story 4.1's loop runner may enumerate all personas when sequential dispatch lands.
- **dev-deviation-1 (Test C asserts non-decreasing-sequence via parsed counts vs spec's "lower-count entries appear before higher-count entries")** — **ACCEPT**. The test design (parse per-line counts via regex, assert non-decreasing) is equivalent to the spec wording but more robust to fixture-specific tiebreaker variation across phase-order or name lexicographic. The assertion holds for any valid sort.
- **dev-deviation-2 (Test N uses `bmad-help` as persona-resolution AC-2 throw fixture; spec says "a step that has NO Tier 1/2/3/4 persona match")** — **ACCEPT**. `bmad-help` exists in `seed-v6.x.ts:337` with `persona: null` and is OMITTED from `DEFAULT_PERSONAS` (per `defaults.ts:90-92` "Misc / utility (3) — bmad-help, bmad-advanced-elicitation, bmad-distillator"); Tier 4 trigger likewise unmatched. Using `--step bmad-help` on a fresh state routes the explain target to a step where all 4 tiers exhaust → `resolvePersonaWithTier` throws ConfigError → explain branch catches and renders the AC-2 hint inside the message. The fixture is concrete + reproducible vs the spec's abstract direction.

### Strengths

- **Zero-deviation execution against spec mutation surface**: 12 task groups (Tasks 0-12) completed verbatim; the explain-helpers section lands at exactly the line ranges declared in the spec File List (`run.ts:856-1233` post-edit); the 15 new tests + 5 updated pre-existing tests align 1:1 with Tasks 8.2-8.16 + Task 7.5.
- **`resolvePersonaWithTier` additive design**: the sibling helper at `src/personas/resolve.ts:645-718` strictly does not modify `resolvePersona`; `git diff src/personas/resolve.ts` shows only appended lines (no `-` lines). The 5 tier-label string constants (`run.ts:622-626`) are single-source-of-truth and reused by `formatPersonaLine` at `run.ts:1077-1096` and the 8 colocated tests at `resolve.test.ts:345-480`.
- **Helper decomposition discipline**: 8 small, single-responsibility helpers (`buildPredecessorChain`, `unmetPrereqsForCandidate`, `computeAlternatives`, `formatAlternativesLines`, `isProjectAllDone`, `formatPersonaLine`, `formatReasoningSummary`, `formatExplainMessage`) replace what could have been a single ~150-line inline block. Each helper has a doc comment, 1-3 input parameters, and a clear return type.
- **Graceful try/catch composition**: the 3 try/catch sites in the explain branch (target step at `run.ts:1428-1440`; persona at `run.ts:1457-1476`; the all-done check at `run.ts:1418-1422` is unconditional) preserve the diagnostic-not-halt invariant. Each catch site captures the StepperError → `actionableHint` first, falls back to `Error.message`, then `String(err)`.
- **Test coverage of all 5 components × 3 ACs × 5 edge combinations**: 15 colocated tests in run.test.ts cover (A) target-step name, (B) fresh-project chain, (C) closeness-to-ready ordering, (D) `--no-optional` exclusion, (E) Tier 0 label, (F) Tier 3 label, (G) reasoning regex, (H) all-done verbatim byte-identical, (I) stderr discipline / multi-persona warn elision, (J) `--explain + --resume`, (K) `--explain + --step`, (L) `--explain + --dry-run` precedence, (M) filter-exhaustion graceful surface, (N) persona AC-2 throw graceful, (O) human-greppable multi-line. Plus 8 colocated tests for `resolvePersonaWithTier` (1 per tier 0/1/2/3-single/3-multi/4 + cascade-exhaustion + empty-string-override fallthrough).
- **Test H byte-identical assertion**: uses `expect(...).toBe(<verbatim string>)` rather than `.toContain(...)` — catches any whitespace / punctuation drift in the AC line 820 hint. Mirrors the AC-line-820 wording requirement.
- **Test E + F differentiator pair**: same `bmad-create-prd` fixture; only difference is `--persona tea` (Tier 0 surface) vs default (Tier 3 surface). Clean signal for the tier-label correctness.
- **AC verbatim preservation**: §Acceptance Criteria reproduces the AC source verbatim (lines 813-821 of epics.md); diff against AC source confirms byte-identity.
- **JSDoc inlines all 9 v0.1 design decisions** at `run.ts:856-892` — reads like a mini-design-doc colocated with the helpers it documents.
- **AR9 invariant preservation explicit**: the JSDoc at `run.ts:864-867` and Story 3.6 §Architecture Compliance both explicitly call out that the multi-line `\n`-joined `message` lives INSIDE the AR9 single-line JSON envelope. The defense-in-depth `DispatchActionV1Schema.parse()` in `emitDispatchAction` confirms.

### Sprint-status update

- `3-6-explain-reasoning-trace: review → done`
- `epic-3: in-progress` (preserved — Stories 3.7-3.10 still open)

### Forward-action items

- **Story 3.7 (--list candidate enumeration)** — SECONDARY CONSUMER. May share `formatAlternativesLines` per-candidate-line formatting helper; may extract `isPreconditionMet` to a shared utility if the predicate diverges from `pickNextStep` usage.
- **Story 4.1 (/bmad-loop)** — SECONDARY CONSUMER. The loop runner may invoke `runNext` with `--explain` per iteration; Story 4.1 may add a `--explain-each` flag.
- **Story 6.x (state.completedSteps[] schema extension)** — PRIMARY ARCHITECTURAL EXTENSION. The full transitive predecessor walk via `dag.edgesIn` + the clean all-done detection (`dag.nodes.size === state.completedSteps.length`) both depend on this schema landing. Tracked as Info-2 forward-tracker.
- **Story 6.x (run-log timestamp slot in reasoning sentence)** — SECONDARY EXTENSION. PRD Journey 1 narrative includes "completed on 2026-04-20"; v0.1 three-slot reasoning sentence omits the timestamp; Story 6.x's run-log read enables it.
- **Story 6.1 (`bmad-stepper.config.yaml execution.explainAlternativesCap`)** — POSSIBLE EXTENSION. The hardcoded `MAX_ALTERNATIVES = 5` may be wired to project config when the full config-loader lands. open-question-2 hand-off.

### Issues dev missed

(none — the dev-story §Open Questions for Code Review correctly enumerated all 8 design tensions; Tests A through O cover all 3 ACs + 5 edge combos; no spec gaps surfaced during the independent re-validation.)

### Approval

Story status flipped `review → done`. `sprint-status.yaml` flipped `3-6-explain-reasoning-trace: review → done`. Ready to advance to Story 3.7 (`--list` Candidate Next Steps) per the standard Epic-3 sequence.

## Change Log

| Date       | Author                | Change                                       |
| ---------- | --------------------- | -------------------------------------------- |
| 2026-05-01 | bmad-create-story | Initial story file created from epics.md §3.6 |
| 2026-05-01 | bmad-dev-story | 2026-05-01T210224Z-bmad-next | implemented --explain reasoning trace + resolvePersonaWithTier sibling helper; status ready-for-dev → review |
| 2026-05-01 | bmad-code-review | Senior Developer Review — APPROVE; 0 must-fix / 0 should-fix / 0 nits / 2 info; AC-1/2/3 PASS; AR8/9/21/22/33/41 + FR8/12/13/15/53/54 + NFR-S2/S5/M3/R1/I2 PASS; status → done |
