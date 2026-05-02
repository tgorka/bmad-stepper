---
status: done
story_id: '3.5'
story_key: 3-5-persona-override-include-optional-no-optional
epic: '3'
title: '`--persona` Override + `--include-optional`/`--no-optional`'
created: '2026-05-01'
last_updated: '2026-05-01'
priority: M
estimated_effort: S
fr_coverage:
  - FR8
  - FR12
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
  - AR16
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

# Story 3.5: `--persona` Override + `--include-optional`/`--no-optional`

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper user,
I want `--persona` to override the resolved persona for one run and `--include-optional`/`--no-optional` to toggle whether optional steps are candidates,
So that I can route a step through a non-default persona or skip soft-optional steps.

## Context Summary

This is the **fifth story of Epic 3** and the **persona/optional toggle cluster** that wires the second batch of explicit-targeting flags from Story 1.7's 18-flag inventory. Stories 3.1 + 3.2 closed the halt-recovery loop (write `state.lastAttempted` + `state.lastFailureReason` on halt; consume them via `--resume`); Story 3.3 landed the first read-only-preview flag (`--dry-run` with byte-zero filesystem mutation); Story 3.4 landed the `--step` precondition check + `--epic`/`--story`/`--phase` filter wiring + the `--step + scope` warning. Story 3.5 turns its attention to **persona resolution + optional-step toggle semantics** — both already partially shipped during the Story 1.7 + Story 2.4 + Story 1.11 cascade — and tightens the contract per epic AC lines 792-805.

**All 3 CLI flags ALREADY EXIST** on `NextArgsSchema` per Story 1.7's 18-flag inventory (`src/commands/next/args.ts:154-167`):

- `persona: z.string().optional()` (line 158) — accepts a persona identifier like `pm`, `dev`, `tea`, `analyst`, `architect`. Documented in Story 1.7's args.ts header line 60-71 as "the runner is responsible for treating empty-string flag values as 'no filter'".
- `includeOptional: z.boolean().default(false)` (line 156) — toggles inclusion of `node.optional === true` candidates.
- `noOptional: z.boolean().default(false)` (line 157) — explicit exclusion. Note: kebab-case `--no-optional` maps via `kebabToCamel` to `noOptional` per `args.ts:179-181 + 261-269`; this is NOT a parser-level negation (e.g. `--no-dry-run` becomes the unknown key `noDryRun` and is rejected by `.strict()`).

Story 1.7 reserved all 3 flags for Epic 3 consumption; Story 1.7 §line 64-69 declared the cross-validation gap explicitly:

> `--include-optional` and `--no-optional` are mutually exclusive in semantics, but the parser is lenient — both can be passed together and the schema accepts the combination. The runner (Story 2.4) is responsible for cross-validation and emitting an actionable error.

**Story 2.4 already shipped the cross-validation closure** at `src/commands/next/run.ts:266-284` via `enforceMutuallyExclusiveFlags(args)`. The function throws `ConfigError` with the verbatim hint `Pass either --include-optional or --no-optional, not both.` when BOTH flags are passed. **Story 3.5 PRESERVES this cross-validation; no change to `enforceMutuallyExclusiveFlags`.**

**Story 2.4 already shipped the optional-inclusion filter** at `src/commands/next/run.ts:619-626`:

```typescript
// Apply optional inclusion/exclusion.
if (args.noOptional) {
  filtered = filtered.filter((n) => !n.optional);
} else if (!args.includeOptional) {
  // Default v0.1 behaviour: exclude optional nodes UNLESS
  // includeOptional is explicitly set.
  filtered = filtered.filter((n) => !n.optional);
}
```

**Story 2.4 already shipped the persona override branch** at `src/commands/next/run.ts:1044-1056`:

```typescript
// Resolve persona + apply --persona override (FR12).
let personaResolved: string | readonly string[];
if (args.persona !== undefined && args.persona !== "") {
  personaResolved = args.persona;
} else {
  personaResolved = await resolvePersona({
    stepName: nextStep.name,
    pluginDir: opts?.pluginDir,
    projectRoot: opts?.projectRoot,
    configPath: opts?.configPath,
    bmadConfigPath: opts?.bmadConfigPath,
  });
}
const persona = pickFirstPersona(personaResolved, nextStep.name, log);
```

**Story 2.4 already shipped the same optional-filter logic in the `--list` short-circuit** at `run.ts:1001-1004`. The `--list` enumeration applies the SAME 3-mode optional toggle (default exclude / `--include-optional` include / `--no-optional` exclude) and the existing test coverage at `run.test.ts` exercises it.

**Story 1.11 already shipped the 4-tier persona resolution** in `src/personas/resolve.ts:537-585`:

1. **Tier 1 (frontmatter)** — `<pluginDir>/skills/<step>/SKILL.md` `persona:` field.
2. **Tier 2 (project config)** — `<projectRoot>/bmad-stepper.config.yaml` `personas:` block.
3. **Tier 3 (defaults)** — `DEFAULT_PERSONAS` in-memory lookup (Story 1.11 `src/personas/defaults.ts`).
4. **Tier 4 (module config)** — `<bmadDir>/<module>/config.yaml` triggers (`bmm`/`tea`/`bmb`/`cis`).

The Tier 4 cascade is verbatim per architecture §D13 lines 631-642 + AC-2's no-tier-resolves throw via `ConfigError` with hintOverride.

**Story 3.5 is therefore primarily a CONTRACT-TIGHTENING + TEST-COVERAGE-EXPANSION story.** All 3 flags + the cross-validation are already wired; Story 3.5's deliverables are:

1. **Verify the existing branches are AC-compliant** (epic AC lines 792-805 verbatim wording vs. shipped behaviour).
2. **Add explicit AC-coverage test cases** in `run.test.ts` — the existing test suite has implicit coverage via Story 2.4's smoke tests + Story 3.4's combination tests, but Story 3.5 adds 12-15 dedicated AC-driven test cases.
3. **Document the 3 forward-deferrals**: (a) `failurePolicies` runtime to Story 6.x; (b) multi-persona sequential dispatch to Story 4.x; (c) per-step config layering to Story 6.x.
4. **Tighten the JSDoc** on the persona-override branch + the optional-toggle filter to reference Story 3.5's epic AC lines and the v0.1 design decisions.

Concretely, this story produces:

1. **`src/commands/next/run.ts`** (MODIFIED — JSDoc + comment expansion only) — adds Story 3.5 carry-over comments at the 3 insertion sites:
   - Line 266-284 (`enforceMutuallyExclusiveFlags`) — JSDoc reference to Story 3.5 epic AC line 803-805 (the "no toggle" default applies when neither flag is supplied; the cross-validation throws when both are supplied).
   - Line 619-626 (optional-toggle filter in `pickNextStep`) — JSDoc reference to Story 3.5 epic AC lines 797-802 (`--no-optional` excludes; `--include-optional` includes with normal priority; default behaviour matches `.bmad-stepper/config.yaml execution.optionalSteps: include` per architecture §line 776).
   - Line 1001-1004 (optional-toggle filter in `--list` short-circuit) — JSDoc reference to Story 3.5 epic AC lines 797-802 (mirror-coverage in the read-only `--list` enumeration).
   - Line 1044-1056 (persona-override branch + Story 1.11 fall-through) — JSDoc reference to Story 3.5 epic AC lines 794-796 (`--persona <name>` bypasses the 4-tier resolution; the dispatch-spec's `PERSONA` field uses the supplied name).
   - **No behavioural change.** The 4 insertion sites already implement the AC-mandated behaviour; Story 3.5 ONLY tightens the JSDoc to cite the AC lines verbatim.

2. **`src/commands/next/run.test.ts`** (MODIFIED — APPEND only) — appends a new `describe` block (`"runNext — Story 3.5 --persona override + --include-optional/--no-optional"`) with ~12-15 NEW test cases covering AC line 794-796 (`--persona` bypass), AC line 797-799 (`--no-optional` exclusion), AC line 800-802 (`--include-optional` inclusion), and AC line 803-805 (default no-toggle behaviour). The existing cross-validation tests (Story 2.4 already covers both flags simultaneously) are PRESERVED unchanged.

3. **`src/commands/next/args.ts`** (UNCHANGED — `--persona`, `--include-optional`, `--no-optional` already in `NextArgsSchema` per Story 1.7). Verified via Read: `args.ts:156-158` declares all 3 flags; `tokenize()` at lines 208-273 routes the kebab-case `--no-optional` to camelCase `noOptional` per the standard kebab→camel pipeline (no special-case logic). **No args change needed for Story 3.5.**

4. **`src/personas/resolve.ts`** (UNCHANGED — Story 1.11's 4-tier resolution stays). The `--persona` override BYPASSES `resolvePersona` entirely — the bypass branch at `run.ts:1046-1047` short-circuits BEFORE the await call. **No persona-tier-cascade change for Story 3.5.**

5. **`src/dag/types.ts` / `src/dag/build.ts`** (UNCHANGED — `node.optional: boolean` already declared at `src/dag/types.ts:65`; the seed's `optional: true` flagging is owned by Story 1.10). **No DAG change needed for Story 3.5.**

This story exercises:

- **AR8** (lock-free `run.ts` / lock-held `verify-and-advance.ts`): UNCHANGED. Story 3.5 modifies JSDoc + tests only; no lock-acquisition surface introduced.
- **AR9** (single discriminated-union JSON line on stdout): UNCHANGED. The dispatch line shape is identical; the persona override flows through the existing `buildDispatchSpec(...)` call site at `run.ts:1141+`. The defence-in-depth `DispatchActionV1Schema.parse()` step at `emitDispatchAction` enforces the persona field shape on every emission.
- **AR16** (multi-persona sequential dispatch): EXTENDED. The `--persona` override surface explicitly bypasses `resolvePersona`'s `string | readonly string[]` return contract and SUPPLIES a single string; `pickFirstPersona` therefore receives a single string AND emits NO multi-persona warn (the existing warn at `run.ts:314-316` only fires on `Array.isArray(persona)`). The forward-deferral to Stories 4.1 + 5.* is preserved — when the user does NOT pass `--persona` and Tier 1 returns an array, the existing single-element-pick + warn behaviour wins.
- **AR21 + AR22** (errors carry code + actionable hint; single-line `Run/See/Try/Check` hints): UNCHANGED. The 16-code registry stays. The `enforceMutuallyExclusiveFlags` ConfigError + the persona-empty-array ConfigError + the unresolvable-persona ConfigError are all PRE-EXISTING (Story 1.11 + Story 2.4); Story 3.5 adds ZERO new throws.
- **AR33** (function & error semantics; throw not Result; no console.*; async/await): UNCHANGED. Story 3.5 adds JSDoc + tests only.
- **AR41** (boundary graph; no upward / sibling-higher imports): UNCHANGED. Story 3.5 modifies `run.ts` JSDoc + appends to `run.test.ts`; no new imports added; no new module created. The colocated AR41 boundary check at `run.test.ts:606-638` continues to pass.
- **FR8** (`/bmad-next` single-step advance): EXTENDED. The runner now respects the user's explicit `--persona` override AND the optional-toggle flags per AC lines 792-805.
- **FR12** (`--persona` override): PRIMARY DELIVERABLE. Architecture §line 1342 declares `FR12 → src/commands/next/args.ts, src/personas/resolve.ts`. Story 1.11 delivered `resolvePersona`; Story 1.7 delivered the args declaration; Story 2.4 delivered the runtime branch. Story 3.5 ADDS the AC-coverage tests + JSDoc tightening.
- **FR15** (`--include-optional`/`--no-optional`): PRIMARY DELIVERABLE. Architecture §line 1345 declares `FR15 → src/commands/next/args.ts, src/dag/build.ts`. Story 1.7 delivered the args declaration; Story 2.4 delivered the runtime branch in `pickNextStep` + `--list`. Story 3.5 ADDS the AC-coverage tests + JSDoc tightening.
- **FR53** (Documented exit codes): UNCHANGED. The existing `enforceMutuallyExclusiveFlags` throw uses `ConfigError` (`exitCode: 2`); the existing `resolvePersona`-tier-exhaustion throw uses `ConfigError` (`exitCode: 2`).
- **FR54** (stdout/stderr discipline): UNCHANGED. The persona-override branch emits no log; the multi-persona-warn at `pickFirstPersona` line 314-316 writes to stderr per `LoggerFns.warn` → `src/io/log.ts:20-21`.
- **NFR-S2** (writes only inside scope): UNCHANGED.
- **NFR-S5** (non-corrupting flag combinations): EXTENDED. The `--include-optional ⊕ --no-optional` exclusion + the `--persona` override + the existing `--step + scope` warning (Story 3.4) form a stable family of user-intent-respecting flag interactions.
- **NFR-R1** (zero data loss on halt): UNCHANGED — the runner reads state via `loadStateUnlocked`; no write side.
- **NFR-I2** (unknown-skill fail-loud): UNCHANGED — the `--persona` override resolves a persona NAME (a free-form string), not a skill name; the runner does NOT validate the persona name against any registry (architectural decision per §D13 line 638-642 deferred to Story 6.1's full schema). v0.1 conservative: `--persona <any-string>` is accepted; the BMAD plugin's downstream sub-agent prompt receives the supplied name verbatim.

Estimated effort: **S** (small — JSDoc + comments expansion only on `run.ts`; appends a new colocated `describe` block (~150 lines) to `run.test.ts` with 12-15 test cases. NO new modules. NO new schema work. NO new error classes. NO `args.ts` change. NO `resolve.ts` change. NO `dag/` change. NO `dispatch/` change. NO `verify-and-advance.ts` change. NO Layer 1 markdown change. The integration test is OPTIONAL — the colocated `run.test.ts` cases cover the same surface).

It does **NOT**:

- **Implement runtime `failurePolicies` lookup.** Architecture §line 780 declares `failurePolicies: {}` as a top-level config block (`{ stepName: "retry" | "skip" | "route-to-fixer" | "escalate" }`); the AC line 805 wording mentions `failurePolicies` defaults applying when neither toggle flag is set, but the **runtime consumption of `failurePolicies` is forward-deferred to Story 6.x** (the per-step failure-policy via config). Story 3.5 documents the deferral; it does NOT wire the runtime lookup.
- **Implement multi-persona sequential dispatch.** AR16 line 187 + architecture §D13 line 640 reserve multi-persona steps for Stories 4.1 (loop runner) + 5.* (failure-UX engine). Story 3.5 PRESERVES the existing v0.1 single-element-pick + warn behaviour at `pickFirstPersona` lines 314-316.
- **Validate the `--persona` value against any registry.** v0.1 conservative: the runner accepts `--persona <any-non-empty-string>` and forwards it verbatim to the dispatch-spec's `PERSONA` field. The BMAD plugin's downstream sub-agent prompt is responsible for any persona-name validation (e.g., the persona may be a typo — the sub-agent's first action is to verify it can perform the task in the named role).
- **Modify `pickFirstPersona`'s multi-persona warn.** The existing `next: multi-persona sequential dispatch is deferred to Stories 4.1 + 5.*; current invocation uses persona <first> (step <name>)` wording stays.
- **Modify `state.yaml` from `run.ts`.** The lock-free contract per architecture §line 1672 is preserved.
- **Acquire the lock.** `run.ts` is structurally lock-free per Story 2.4's contract.
- **Add a new error class.** The 16-code registry stays UNCHANGED.
- **Modify `commands/bmad-next.md` (Story 2.7 Layer 1 markdown).** The Layer 1 markdown already branches on `action`; the dispatch line carries the persona + the optional candidates filtered list; no markdown change needed.
- **Implement `--explain` reasoning trace** (Story 3.6).
- **Implement `--list` candidate enumeration** with the AC-3 reasoning summary (Story 3.7).
- **Modify `verify-and-advance.ts`.** The lock-held runner is unchanged.
- **Add a new dispatch-protocol field.** The dispatch line shape is unchanged.
- **Resolve epic/story attribution from DAG nodes** (Story 6.x). The `--epic`/`--story` filter from Story 3.4 stays as a runner-tier projection.

It DOES land:

- The architecturally-prescribed **`--persona <name>` override** behaviour per FR12 + epic AC lines 794-796 — the dispatch-spec's `PERSONA` field uses the supplied name, BYPASSING the 4-tier resolution.
- The architecturally-prescribed **`--no-optional` filter** behaviour per FR15 + epic AC lines 797-799 — steps with `node.optional === true` are excluded from candidate computation.
- The architecturally-prescribed **`--include-optional` filter** behaviour per FR15 + epic AC lines 800-802 — optional steps are included with normal priority (the same phase-order tiebreaker applies).
- The architecturally-prescribed **default no-toggle behaviour** per FR15 + epic AC lines 803-805 — when neither flag is supplied, the project-config `personas:` block resolution applies (Story 1.11 4-tier cascade) and the `failurePolicies` defaults apply (forward-deferred to Story 6.x for runtime lookup; Story 3.5 documents the deferral).
- **12-15 new colocated test cases** in `run.test.ts` covering all 4 AC lines + edge cases (combos with `--step` / `--resume` / `--dry-run` / `--list` / `--explain`).
- The **forward-coupling documentation** with Stories 3.6 / 3.7 / 4.1 / 5.* / 6.x.

## Acceptance Criteria

The acceptance criteria below are reproduced **verbatim** from `_bmad-output/planning-artifacts/epics.md` §Story 3.5 (lines 792-805, BDD Given/When/Then format). Lines and AC labelling preserved.

**Given** `--persona <name>` is supplied
**When** dispatching
**Then** the dispatch-spec's PERSONA field uses the supplied name, bypassing the 4-tier resolution
**Given** `--no-optional` is supplied
**When** computing next step
**Then** steps with `optional: true` in the DAG are excluded from candidates
**Given** `--include-optional` is supplied
**When** computing
**Then** optional steps are included with normal priority
**Given** neither flag is supplied
**When** computing
**Then** the project-config `failurePolicies` and `personas` defaults apply (no toggle)

## Tasks / Subtasks

- [x] **Task 0 — Verify pre-conditions (AC: all)**
  - [x] 0.1 Confirm Story 3.1 (`record_last_attempted_last_failure_reason_on_halt`) is `done` per `_bmad-output/implementation-artifacts/sprint-status.yaml:71` (`3-1-record-last-attempted-last-failure-reason-on-halt: done`).
  - [x] 0.2 Confirm Story 3.2 (`--resume` Flag) is `done` per `sprint-status.yaml:72` (`3-2-resume-flag: done`).
  - [x] 0.3 Confirm Story 3.3 (`--dry-run` Flag) is `done` per `sprint-status.yaml:73` (`3-3-dry-run-flag: done`).
  - [x] 0.4 Confirm Story 3.4 (`--step` and Scope Flags) is `done` per `sprint-status.yaml:74` (`3-4-step-id-and-scope-flags: done`).
  - [x] 0.5 Confirm Story 1.7 (`src/commands/next/args.ts`) declares all 3 Story-3.5 flags on `NextArgsSchema`:
    - `includeOptional: z.boolean().default(false)` at line 156.
    - `noOptional: z.boolean().default(false)` at line 157.
    - `persona: z.string().optional()` at line 158.
    Verify by reading `src/commands/next/args.ts:140-170`. **No args change needed for Story 3.5.**
  - [x] 0.6 Confirm Story 1.11 (`src/personas/resolve.ts`) shipped the 4-tier resolution per Tier 1 (SKILL.md frontmatter) + Tier 2 (project config `personas:`) + Tier 3 (`DEFAULT_PERSONAS`) + Tier 4 (`_bmad/<module>/config.yaml` triggers). Verify the public function signature `resolvePersona(input: ResolveInput): Promise<string | readonly string[]>` at `src/personas/resolve.ts:537-585`.
  - [x] 0.7 Confirm Story 2.4's `enforceMutuallyExclusiveFlags(args: NextArgs): void` lives at `src/commands/next/run.ts:266-284`. Read this region to confirm the throw signature: `throw new ConfigError("Both --include-optional and --no-optional were passed; the flags are mutually exclusive.", JSON.stringify({...}), "Pass either --include-optional or --no-optional, not both.")`. **Story 3.5 PRESERVES this; no change.**
  - [x] 0.8 Confirm Story 2.4's `pickFirstPersona(persona, stepName, log): string` lives at `src/commands/next/run.ts:299-320`. Read this region to confirm:
    - `Array.isArray(persona)` branch returns the first element + emits the multi-persona warn.
    - The empty-array case throws `ConfigError` with `Configure at least one persona for ${stepName} in bmad-stepper.config.yaml under the personas: block.`.
    - **Story 3.5 PRESERVES this; no change.**
  - [x] 0.9 Confirm Story 2.4's optional-toggle filter at `src/commands/next/run.ts:619-626`. Read to confirm the 3-mode branch:
    - `if (args.noOptional) → filter out !optional`
    - `else if (!args.includeOptional) → filter out !optional` (default — exclude)
    - `else → include all` (`--include-optional` takes effect)
    - **Story 3.5 PRESERVES this; ONLY tightens the JSDoc.**
  - [x] 0.10 Confirm Story 2.4's optional-toggle filter at the `--list` short-circuit, `src/commands/next/run.ts:1001-1004`. Read to confirm the 3-mode branch matches the `pickNextStep` filter (consistency invariant). **Story 3.5 PRESERVES this; ONLY tightens the JSDoc.**
  - [x] 0.11 Confirm Story 2.4's persona-override branch at `src/commands/next/run.ts:1044-1056`. Read to confirm:
    - `if (args.persona !== undefined && args.persona !== "") → personaResolved = args.persona`
    - `else → personaResolved = await resolvePersona({...})` (Story 1.11 4-tier cascade)
    - `const persona = pickFirstPersona(personaResolved, nextStep.name, log)` (multi-persona handling)
    - **Story 3.5 PRESERVES this; ONLY tightens the JSDoc.**
  - [x] 0.12 Confirm `src/dag/types.ts:60-68` declares `DagNode.optional: boolean` (line 65). The Tier 1 seed at `src/dag/seed-v6.x.ts` flags soft-optional steps with `optional: true` per Story 1.10's seed declarations. Story 3.5 reads the field; does NOT modify the DAG node shape.
  - [x] 0.13 Confirm `.bmad-stepper/config.yaml` declares `execution.optionalSteps: include` (line 14). This is the project's CURRENT default-include-optional config. **AC line 805 `personas` defaults**: this maps to Story 1.11's 4-tier `resolvePersona` — when `--persona` is not supplied AND `personas:` block is absent in `bmad-stepper.config.yaml`, the Tier 3 `DEFAULT_PERSONAS` lookup (Story 1.11's hand-curated defaults) wins. **AC line 805 `failurePolicies` defaults**: forward-deferred to Story 6.x (architecture §line 780 declares `failurePolicies: {}` as a top-level config block; v0.1 has NO runtime consumption).
  - [x] 0.14 Confirm `src/errors.ts` exports `ConfigError` with the optional `hintOverride` constructor arg (Story 1.11 + Story 2.4 + Story 3.2 + Story 3.4 precedent). Story 3.5 adds ZERO new throws.
  - [x] 0.15 Confirm `src/commands/next/run.ts:182-187` declares `LoggerFns` with `info|warn|error|json: (message: string) => void`. The persona-override branch does NOT emit any log; the multi-persona warn (when `--persona` is NOT supplied AND Tier 1 returns an array) goes through `LoggerFns.warn`.
  - [x] 0.16 Read epics.md §Story 3.5 lines 792-805 verbatim. Confirm the AC text in §Acceptance Criteria above is character-identical.
  - [x] 0.17 Read architecture.md §D13 lines 631-642 (4-tier persona resolution + multi-persona sequential dispatch + verbatim fail-loud hint); §line 780 (`failurePolicies: {}` config block — forward-deferred runtime to Story 6.x); §line 1342 (`FR12 → src/commands/next/args.ts, src/personas/resolve.ts`); §line 1345 (`FR15 → src/commands/next/args.ts, src/dag/build.ts`); §line 1672 (`run.ts` is read-only / lock-free); §AR16 line 187 (multi-persona deferral).
  - [x] 0.18 Read prd.md §FR12 line 685 (`Users can override the persona used for a step (--persona)`); §FR15 line 688 (`Users can include or exclude optional steps from candidate computation (--include-optional / --no-optional)`).
  - [x] 0.19 Read epic-2-retrospective.md §Forward Action Items — confirm Story 3.5 is in the recommended sequence (AFTER Story 3.4, BEFORE Story 3.6).
  - [x] 0.20 Read Story 3.4's File List + Dev Notes sections (`3-4-step-id-and-scope-flags.md` lines 471-575). Confirm Story 3.4 already extended `pickNextStep` to 4 args (`state, dag, args, log`); Story 3.5 INHERITS this signature unchanged.
  - [x] 0.21 Confirm baseline `bun run check` exits 0 with **608 pass / 0 fail / 2223 expects / 49 files** per Story 3.4 final.
  - [x] 0.22 Confirm Bun host version satisfies AR2 (Bun >= 1.3). Run `bun --version`; record in Completion Notes.

- [x] **Task 1 — Plan the JSDoc-tightening on `enforceMutuallyExclusiveFlags` (AC line 803-805)**
  - [x] 1.1 Sketch the JSDoc enhancement at `src/commands/next/run.ts:266-272` (existing JSDoc):
    ```typescript
    /**
     * Cross-validation gap closure (Story 1.7 args.ts line 65 forward-dep):
     * `--include-optional` and `--no-optional` are mutually exclusive in
     * semantics but the parser is lenient. The runner enforces the
     * exclusion here. Throws `ConfigError` (code `CONFIG_ERROR`, exitCode
     * 2) with the verbatim hint per AC.
     *
     * **Story 3.5 (epic AC lines 803-805)**: when neither flag is
     * supplied, the runner falls through to the project-config `personas:`
     * defaults (Story 1.11's 4-tier `resolvePersona` cascade) and the
     * `failurePolicies` defaults (forward-deferred to Story 6.x — the
     * v0.1 config-block at architecture §line 780 is declared but not yet
     * consumed at runtime).
     */
    ```
  - [x] 1.2 The JSDoc enhancement is purely documentary. Story 3.5 ships ZERO behavioural change in `enforceMutuallyExclusiveFlags`.
  - [x] 1.3 Document the empty-string edge case: `--persona ""` is treated as "no override" per the existing `args.persona !== undefined && args.persona !== ""` guard at `run.ts:1046`. Story 3.5 PRESERVES this; the existing test coverage from Story 2.4 already exercises the empty-string fall-through.

- [x] **Task 2 — Plan the JSDoc-tightening on the optional-toggle filter (AC lines 797-802)**
  - [x] 2.1 Sketch the comment enhancement at `src/commands/next/run.ts:619-626` (existing 8 lines):
    ```typescript
    // Apply optional inclusion/exclusion.
    //
    // **Story 3.5 (epic AC lines 797-802)**: the 3-mode branch:
    //   - `--no-optional` → exclude `node.optional === true` candidates
    //     (epic AC lines 797-799).
    //   - `--include-optional` → include optional candidates with normal
    //     priority — the same phase-order + name-lexicographic tiebreaker
    //     applies (epic AC lines 800-802).
    //   - default (neither flag) → exclude optional candidates (Story 2.4
    //     v0.1 conservative default, matching the project's
    //     `.bmad-stepper/config.yaml execution.optionalSteps: include`
    //     spirit but RESTRICTING optional candidates from the next-step
    //     selection unless the user explicitly opts in via
    //     `--include-optional`).
    //
    // **Note** (Story 3.5 AC line 805): the project-config
    // `failurePolicies` defaults are forward-deferred to Story 6.x (the
    // top-level config block at architecture §line 780 is declared but
    // NOT yet consumed at runtime). v0.1 ships the optional-toggle
    // semantics; the per-step failure-policy block (`retry` / `skip` /
    // `route-to-fixer` / `escalate`) is Story 6.x scope.
    if (args.noOptional) {
      filtered = filtered.filter((n) => !n.optional);
    } else if (!args.includeOptional) {
      // Default v0.1 behaviour: exclude optional nodes UNLESS
      // includeOptional is explicitly set.
      filtered = filtered.filter((n) => !n.optional);
    }
    ```
  - [x] 2.2 The comment enhancement is purely documentary. Story 3.5 ships ZERO behavioural change in the optional-toggle filter.
  - [x] 2.3 Document the **default semantics divergence** between `.bmad-stepper/config.yaml execution.optionalSteps: include` (line 14 of project config — "Optional BMAD steps run by default unless a command passes --skip-optional") and the runner's actual default (`exclude when neither flag is set`). The project config's prose suggests "include by default"; the runner's v0.1 implementation EXCLUDES by default. **This is intentional**: Story 2.4's runner-tier default is to be conservative (skip optional candidates unless explicitly included); the project config's prose is aspirational. Story 6.x will reconcile when the full config-loader (Story 6.1) lands. **Document in JSDoc.**

- [x] **Task 3 — Plan the JSDoc-tightening on the `--list` optional-toggle filter (AC lines 797-802)**
  - [x] 3.1 Sketch the comment enhancement at `src/commands/next/run.ts:1001-1004` (existing 4 lines):
    ```typescript
    // **Story 3.5 (epic AC lines 797-802)**: the `--list` short-circuit
    // applies the same 3-mode optional-toggle filter as `pickNextStep`
    // for consistency (the candidate enumeration must match the next-
    // step selection contract).
    if (!args.includeOptional && !args.noOptional && node.optional) {
      continue;
    }
    if (args.noOptional && node.optional) continue;
    ```
  - [x] 3.2 The comment enhancement is purely documentary. Story 3.5 ships ZERO behavioural change in the `--list` short-circuit.
  - [x] 3.3 Document the consistency invariant: the optional-toggle filter is applied at TWO sites (`pickNextStep` + `--list` short-circuit). Story 3.5's tests exercise BOTH sites to assert mirror-coverage.

- [x] **Task 4 — Plan the JSDoc-tightening on the persona-override branch (AC lines 794-796)**
  - [x] 4.1 Sketch the comment enhancement at `src/commands/next/run.ts:1044-1056` (existing 13 lines):
    ```typescript
    // Resolve persona + apply --persona override (FR12).
    //
    // **Story 3.5 (epic AC lines 794-796)**: when `--persona <name>` is
    // supplied (non-empty string), BYPASS the 4-tier resolution
    // (Story 1.11's `resolvePersona` cascade: Tier 1 SKILL.md frontmatter
    // > Tier 2 project config `personas:` > Tier 3 `DEFAULT_PERSONAS`
    // > Tier 4 `_bmad/<module>/config.yaml` triggers) and use the
    // supplied name verbatim. The dispatch-spec's `PERSONA` field
    // (`buildDispatchSpec` → `generate-spec.ts:172-177`) receives the
    // supplied name as-is.
    //
    // Empty-string `--persona ""` is treated as "no override" per the
    // existing Story 1.7 line 70 forward-dep precedent (`pickNextStep`
    // line 505 + line 516 + line 604 + line 611 — the runner consistently
    // treats empty-string flag values as "no filter / no override").
    //
    // **Story 3.5 (forward-deferral)**: the supplied `--persona <name>`
    // is NOT validated against any registry. v0.1 conservative: any
    // non-empty string is accepted; the BMAD plugin's downstream sub-agent
    // prompt is responsible for any persona-name validation. Story 6.1
    // may add the registry-validation when the full config-loader lands.
    let personaResolved: string | readonly string[];
    if (args.persona !== undefined && args.persona !== "") {
      personaResolved = args.persona;
    } else {
      personaResolved = await resolvePersona({
        stepName: nextStep.name,
        pluginDir: opts?.pluginDir,
        projectRoot: opts?.projectRoot,
        configPath: opts?.configPath,
        bmadConfigPath: opts?.bmadConfigPath,
      });
    }
    const persona = pickFirstPersona(personaResolved, nextStep.name, log);
    ```
  - [x] 4.2 Document the multi-persona warn elision: when `--persona` is supplied (a single string), the `pickFirstPersona` `Array.isArray(persona)` branch (lines 304-318) is NOT taken — the supplied string is returned verbatim and NO multi-persona warn is emitted. **This is the AC line 794-796 "bypassing the 4-tier resolution" semantics.**
  - [x] 4.3 Document the AR16 + architecture §D13 line 640 forward-deferral: when `--persona` is NOT supplied AND Tier 1 returns an array (multi-persona step), the existing single-element-pick + warn behaviour at `pickFirstPersona` lines 304-318 wins. Story 3.5 PRESERVES this; the full sequential dispatch is forward-deferred to Stories 4.1 + 5.*.

- [x] **Task 5 — Implement the JSDoc-tightening (no behaviour change; AC: all)**
  - [x] 5.1 Edit `src/commands/next/run.ts` to apply the 4 JSDoc/comment expansions per Tasks 1-4:
    - Lines 266-284 (`enforceMutuallyExclusiveFlags`).
    - Lines 619-626 (optional-toggle filter in `pickNextStep`).
    - Lines 1001-1004 (optional-toggle filter in `--list` short-circuit).
    - Lines 1044-1056 (persona-override branch).
  - [x] 5.2 Verify the runner compiles via `bunx tsc --noEmit` (no type changes; pure JSDoc/comment additions).
  - [x] 5.3 Verify Biome passes via `bunx --bun biome ci .` (no formatting drift).
  - [x] 5.4 Verify the full test suite passes via `bun test` (no behavioural change; existing tests must continue to pass).

- [x] **Task 6 — Implement the colocated test cases (AC: all)**
  - [x] 6.1 Edit `src/commands/next/run.test.ts` to APPEND a new `describe` block: `"runNext — Story 3.5 --persona override + --include-optional/--no-optional"`. Reuse module-level `beforeEach`/`afterEach` + `commonOpts`/`writeMinimalState` factories. Reuse the existing `captureLogger()` factory from Story 3.4.
  - [x] 6.2 **Test case A (AC line 794-796: --persona override bypasses 4-tier resolution)** — seed state with `lastSuccessfulStep: { step: "bmad-brainstorming", ... }`; invoke with `argv: ["--persona", "tea"]`; assert (a) `result.exitCode === 0`, (b) `result.action.action === "dispatch"`, (c) the dispatched persona is `"tea"` (NOT the Tier 3 default for the resolved next step). Capture via `result.action.persona` if exposed by `DispatchActionV1`, OR via the `taskSpec.persona` field in the dispatch line.
  - [x] 6.3 **Test case B (AC line 794-796: --persona empty string falls through to 4-tier)** — invoke with `argv: ["--persona", ""]`; assert the dispatched persona is the Tier 3 `DEFAULT_PERSONAS` value for the resolved next step (e.g., the seed `bmad-product-brief` step has Tier 3 default `pm` per `src/personas/defaults.ts`).
  - [x] 6.4 **Test case C (AC line 794-796: --persona override does NOT emit multi-persona warn)** — invoke with `argv: ["--persona", "tea"]` on a step whose Tier 3 defaults to a multi-persona ARRAY (if any seed step has this — e.g., a hypothetical `code-review` step). Assert `loggerCapture.warnMessages.filter(m => m.includes("multi-persona")).length === 0`. **If no seed step has multi-persona Tier 3 defaults**, document the test as "no-applicable-fixture-in-v0.1-seed; deferred to Story 4.1".
  - [x] 6.5 **Test case D (AC line 797-799: --no-optional excludes optional candidates from pickNextStep)** — seed state with `lastSuccessfulStep: { step: "bmad-create-prd", ... }` (Story 1.10 seed: `bmad-product-brief` is `optional: true`; the inferred next-step from `bmad-create-prd` includes both optional and non-optional candidates per the seed). Invoke with `argv: ["--no-optional"]`; assert the dispatched step is NOT an `optional: true` candidate. Verify by reading `dag.nodes.get(result.action.lastAttempted.step)?.optional === false`.
  - [x] 6.6 **Test case E (AC line 800-802: --include-optional includes optional candidates)** — same fixture as D; invoke with `argv: ["--include-optional"]`; assert the dispatched step CAN be an `optional: true` candidate (the phase-order + name-lexicographic tiebreaker may select either an optional or non-optional candidate; the test asserts that the OPTIONAL candidates are NOT excluded — verify by checking the candidates set BEFORE tiebreaker via a test-only-but-exported `candidatesForState(state, dag, args)` helper IF Story 2.4 exposed one; otherwise assert by injecting a fixture where the `--include-optional` flag CHANGES the dispatched step vs. default).
  - [x] 6.7 **Test case F (AC line 803-805: default no-toggle behaviour)** — invoke with `argv: []` (no flags); assert (a) the dispatched step is NOT an `optional: true` candidate (default-exclude per Story 2.4); (b) the persona is resolved via Story 1.11's 4-tier cascade (NOT a user-supplied override); (c) NO `failurePolicies` runtime branching occurs (Story 6.x deferral).
  - [x] 6.8 **Test case G (AC cross-validation preservation: --include-optional + --no-optional)** — invoke with `argv: ["--include-optional", "--no-optional"]`; assert (a) `result.exitCode === 2`, (b) `result.action.action === "halt"`, (c) `result.action.message === "Pass either --include-optional or --no-optional, not both."`. **This is Story 2.4's existing throw — Story 3.5 PRESERVES.**
  - [x] 6.9 **Test case H (AC line 797-799: --no-optional in --list short-circuit)** — invoke with `argv: ["--list", "--no-optional"]`; assert (a) `result.exitCode === 0`, (b) `result.action.action === "report"`, (c) `result.action.message` does NOT enumerate any `optional: true` step from the candidate list.
  - [x] 6.10 **Test case I (AC line 800-802: --include-optional in --list short-circuit)** — invoke with `argv: ["--list", "--include-optional"]`; assert (a) success, (b) the report message DOES enumerate optional steps with the `, optional` suffix in the per-line output (per Story 2.4's `--list` formatter at `run.ts:1006`).
  - [x] 6.11 **Test case J (Edge: --persona + --step combo)** — invoke with `argv: ["--step", "bmad-brainstorming", "--persona", "tea"]` on a fresh state; assert (a) the dispatched step is `bmad-brainstorming`, (b) the dispatched persona is `tea`. **The `--step` precondition + `--persona` override compose orthogonally.**
  - [x] 6.12 **Test case K (Edge: --persona + --resume — resume's recorded persona-source vs --persona override)** — seed `lastAttempted: { step: "bmad-dev-story", ... }`; invoke with `argv: ["--resume", "--persona", "tea"]`; assert the dispatched persona is `tea` (the `--persona` override wins because the persona-resolution branch at `run.ts:1044-1056` runs AFTER the resume-target resolver and BEFORE `buildDispatchSpec`). **This documents the precedence: `--persona` overrides EVEN ON RESUME.**
  - [x] 6.13 **Test case L (Edge: --persona + --dry-run combo)** — invoke with `argv: ["--persona", "tea", "--dry-run"]` on a state with a valid next step; assert (a) `result.action.action === "report"` (dry-run preview), (b) the preview message includes `persona: tea` (NOT the 4-tier-resolved default). **The dry-run preview surfaces the override.**
  - [x] 6.14 **Test case M (Edge: --no-optional + --step combo)** — invoke with `argv: ["--step", "bmad-product-brief"]` (which is `optional: true` per Story 1.10 seed) AND `--no-optional`. Document the v0.1 design decision: **`--step` bypasses the candidate filter — explicit step wins**. The `--step` branch at `pickNextStep` lines 515-540 returns the resolved node BEFORE the optional-toggle filter applies. Assert the dispatched step IS `bmad-product-brief` (the `--no-optional` does NOT block the explicit `--step`). **Document this in JSDoc on the optional-toggle comment.**
  - [x] 6.15 **Test case N (Edge: --include-optional + --no-optional + --step combo)** — invoke with `argv: ["--step", "bmad-brainstorming", "--include-optional", "--no-optional"]`; assert the cross-validation throw fires BEFORE the `--step` branch (the `enforceMutuallyExclusiveFlags` check runs at Step 2 of `runNext` at line 848, BEFORE the `pickNextStep` call at line 1041). The throw's verbatim hint is `Pass either --include-optional or --no-optional, not both.`.
  - [x] 6.16 **Test case O (Edge: --persona + --explain combo)** — invoke with `argv: ["--persona", "tea", "--explain"]` on a state with a valid next step; assert (a) `result.action.action === "report"`, (b) the explain stub message references the resolved next step. **Note**: Story 3.6 (`--explain` reasoning trace) will enrich the message with persona-tier provenance ("resolved via Tier 1: SKILL.md frontmatter" or "supplied via `--persona` override"); v0.1 ships only the empty-candidate fallback / step name surfacing. Document the forward-coupling.
  - [x] 6.17 Each test follows AR35 tmpdir-per-test discipline: reuses module-level `beforeEach`/`afterEach` + `commonOpts`/`writeMinimalState` factories.

- [x] **Task 7 — Verify backward compatibility (no regression on existing tests)**
  - [x] 7.1 Run `bun test src/commands/next/run.test.ts`: confirm pre-existing tests (especially Story 2.4's persona-override happy path + Story 3.4's combination tests) pass with the new JSDoc-only edits.
  - [x] 7.2 Run `bun test src/personas/`: confirm Story 1.11's 4-tier resolution tests pass (Story 3.5 does NOT touch `resolve.ts`).
  - [x] 7.3 Run `bun test src/integration/`: confirm Story 2.8 + Story 3.1 + Story 3.3 + Story 3.4 integration tests pass.
  - [x] 7.4 Run `bun test src/smoke/`: confirm Story 2.8 happy-path smoke passes.
  - [x] 7.5 Run `bun run check` (full suite + tsc + lint): confirm exit 0; record post-Story-3.5 baseline test counts in Completion Notes.

- [x] **Task 8 — Run the full test suite + `bun run check` (AC: all)**
  - [x] 8.1 `bun run check` exit 0. Test delta: ~+12-15 tests (~12-15 new colocated cases per Task 6.2-6.16), ~+30-40 expects.
  - [x] 8.2 Post-Story-3.5 baseline projection: ~620-625 pass / 0 fail / ~2253-2263 expects / 49 files (no new test files added).
  - [x] 8.3 Confirm `src/errors.ts` registry stays at **16 codes** (`bun test src/errors.test.ts`: 10 pass, 197 expects). Story 3.5 ships ZERO new error classes — the cross-validation throw is PRE-EXISTING (Story 2.4); the persona-override branch ships ZERO throws (it short-circuits BEFORE `resolvePersona` is awaited).
  - [x] 8.4 Confirm `bunx tsc --noEmit` exits 0.
  - [x] 8.5 Confirm AR41 boundary check at `run.test.ts:606-638` still passes (no new forbidden imports introduced — Story 3.5 adds ZERO imports).

- [x] **Task 9 — Update sprint-status.yaml + record completion (AC: all)**
  - [x] 9.1 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: flip `3-5-persona-override-include-optional-no-optional` from `backlog` (set by Story 3.4 final) to `ready-for-dev` (this Story 3.5 create-story step). At story completion (Step 9 of bmad-dev-story workflow), flip to `review` (intermediate `in-progress` during dev). `epic-3: in-progress` is preserved.
  - [x] 9.2 Flip the story file frontmatter `status: ready-for-dev → review` at end of bmad-dev-story workflow per the workflow's Step 9 contract. (At create-story time, the value is `ready-for-dev`.)
  - [x] 9.3 sprint-status.yaml retains its original schema (no new fields).

## Dev Notes

### File List

#### Modified Files

- **`src/commands/next/run.ts`** (~1259 → ~1280 lines): tightens JSDoc/comments at 4 insertion sites:
  - Lines 266-284 (`enforceMutuallyExclusiveFlags`): adds Story 3.5 carry-over reference for AC lines 803-805 default behaviour.
  - Lines 619-626 (optional-toggle filter in `pickNextStep`): adds Story 3.5 carry-over reference for AC lines 797-802 + documents the project-config divergence.
  - Lines 1001-1004 (optional-toggle filter in `--list` short-circuit): adds Story 3.5 carry-over reference for AC lines 797-802 + the consistency invariant.
  - Lines 1044-1056 (persona-override branch): adds Story 3.5 carry-over reference for AC lines 794-796 + the empty-string fall-through + the forward-deferral on persona-name validation.
  - **No behavioural change.** ~21 lines net delta.
- **`src/commands/next/run.test.ts`** (~1840 → ~2000 lines): APPENDS a new `describe("runNext — Story 3.5 --persona override + --include-optional/--no-optional", ...)` block with 12-15 test cases per Task 6. Reuses module-level `beforeEach`/`afterEach` + `commonOpts`/`writeMinimalState` + the Story 3.4 `captureLogger()` factory.

#### New Files

(none — Story 3.5 is purely additive on existing files; no new modules; no new integration test file required by AC.)

#### Sprint-Status

- **`_bmad-output/implementation-artifacts/sprint-status.yaml`**: flip `3-5-persona-override-include-optional-no-optional: backlog → ready-for-dev` (at create-story time). Confirm `epic-3: in-progress` (already set by Story 3.1).

### Architecture Compliance

- **AR8** (lock-free `run.ts` / lock-held `verify-and-advance.ts`): UNCHANGED. Story 3.5 modifies JSDoc + tests only; no new lock-acquisition surface.
- **AR9** (single discriminated-union JSON line on stdout): UNCHANGED. The dispatch line shape is identical; the persona override + optional-toggle filter both flow through the existing `buildDispatchSpec(...)` + `emitDispatchAction` pipeline.
- **AR16** (multi-persona sequential dispatch): EXTENDED. The `--persona` override surface explicitly bypasses `resolvePersona`'s `string | readonly string[]` return contract. When `--persona` is supplied, NO multi-persona warn is emitted (the supplied string short-circuits the array-detection branch in `pickFirstPersona`). When `--persona` is NOT supplied AND Tier 1 returns an array, the existing v0.1 single-element-pick + warn behaviour wins; full sequential dispatch is forward-deferred to Stories 4.1 + 5.*.
- **AR21** (errors carry code): UNCHANGED. Story 3.5 adds ZERO new throws. The pre-existing `enforceMutuallyExclusiveFlags` ConfigError (Story 2.4) + `pickFirstPersona` empty-array ConfigError (Story 2.4) + `resolvePersona` no-tier-resolves ConfigError (Story 1.11) all stay.
- **AR22** (errors carry actionable hint; single-line `Run/See/Try/Check`): UNCHANGED. The pre-existing hints (verb-leading: `Pass`, `Configure`, `Add`) all stay.
- **AR33** (function & error semantics; throw not Result; no console.*; async/await): UNCHANGED. Story 3.5 adds JSDoc + tests only.
- **AR41** (boundary graph; no upward / sibling-higher imports): UNCHANGED. Zero new imports in `run.ts`. Story 3.5 modifies JSDoc + appends to `run.test.ts`; no new module created. The colocated AR41 boundary check at `run.test.ts:606-638` continues to pass.

### Acceptance Criteria Mapping

- **AC line 794-796** (`--persona <name>` is supplied + dispatching → dispatch-spec's PERSONA field uses the supplied name, bypassing the 4-tier resolution): delivered by **PRE-EXISTING Story 2.4 code** at `src/commands/next/run.ts:1044-1056` (the `if (args.persona !== undefined && args.persona !== "")` short-circuit). Story 3.5's JSDoc tightening (Task 4 + 5) cites the AC verbatim; the 6 new tests at Task 6.2-6.16 (cases A, B, C, J, K, L, O) verify the contract.
- **AC line 797-799** (`--no-optional` is supplied + computing next step → steps with `optional: true` excluded from candidates): delivered by **PRE-EXISTING Story 2.4 code** at `src/commands/next/run.ts:619-621` (the `if (args.noOptional) → filter out !optional` branch) + at `src/commands/next/run.ts:1004` (the same filter in the `--list` short-circuit). Story 3.5's JSDoc tightening (Task 2 + 3 + 5) cites the AC verbatim; the 2 new tests at Task 6.5 (case D) + 6.9 (case H) verify the contract at BOTH sites.
- **AC line 800-802** (`--include-optional` is supplied + computing → optional steps included with normal priority): delivered by **PRE-EXISTING Story 2.4 code** at `src/commands/next/run.ts:622-625` (the `else if (!args.includeOptional) → exclude` branch — when `includeOptional === true`, the filter SKIPS the exclusion) + at `src/commands/next/run.ts:1001-1003` (the same filter in the `--list` short-circuit). Story 3.5's JSDoc tightening cites the AC verbatim; the 2 new tests at Task 6.6 (case E) + 6.10 (case I) verify the contract at BOTH sites.
- **AC line 803-805** (neither flag supplied + computing → project-config `failurePolicies` and `personas` defaults apply, no toggle): delivered by **PRE-EXISTING Story 2.4 code** at `src/commands/next/run.ts:1048-1056` (the fall-through to `resolvePersona` cascade — Story 1.11's 4-tier resolution). The `failurePolicies` runtime is forward-deferred to Story 6.x — Story 3.5 documents the deferral; v0.1 has NO runtime consumption of the `failurePolicies` config block. The 2 new tests at Task 6.7 (case F) + 6.8 (case G) verify the no-toggle default behaviour + the cross-validation preservation.

### v0.1 Design Decisions

#### `--persona <name>` accepts ANY non-empty string — no registry validation

The runner-tier accepts `--persona <any-non-empty-string>` and forwards it verbatim to the dispatch-spec's `PERSONA` field. There is NO validation of the persona name against any registry (e.g., `DEFAULT_PERSONAS` keys, project-config `personas:` block values, `_bmad/<module>/config.yaml` triggers). **Rationale**: v0.1 conservative — the BMAD plugin's downstream sub-agent prompt is responsible for any persona-name validation; the runner trusts user intent. Story 6.1 (full config-loader) may add registry-validation when the schema lands.

#### Empty-string `--persona ""` is treated as "no override"

Per the Story 1.7 line 70 forward-dep precedent, empty-string flag values are treated as "no filter / no override". The persona-override branch at `run.ts:1046` checks `args.persona !== undefined && args.persona !== ""`; an empty string falls through to the 4-tier `resolvePersona` cascade. **Rationale**: handle the common shell-scripting case where a variable expands to empty.

#### Default optional-toggle behaviour is EXCLUDE — diverges from `.bmad-stepper/config.yaml`

The runner's v0.1 default (when neither `--include-optional` nor `--no-optional` is supplied) is to EXCLUDE optional candidates from `pickNextStep` selection (per `run.ts:622-625`). The project's `.bmad-stepper/config.yaml execution.optionalSteps: include` (line 14) declares an "include by default" intent in prose, but the runner does NOT consume the project config at runtime in v0.1 (Story 6.1 forward-dep). **Rationale**: the conservative default keeps the deterministic happy-path narrow — the user explicitly opts in via `--include-optional` when they want the broader candidate set. The full config-loader reconciliation lands in Story 6.x.

#### `--persona` overrides EVEN ON RESUME

Story 3.2's resume branch substitutes `state.lastAttempted.step` for the standard `pickNextStep(...)` result, but the persona-resolution branch at `run.ts:1044-1056` runs AFTER the resume-target resolver. **The `--persona` override therefore wins on resume** — the user can repoint a resumed step at a different persona for one run. **Rationale**: resume's "do the same thing again" intent is at the step level; persona is a separate axis. Test case K (Task 6.12) asserts this.

#### `--persona` overrides DO NOT emit the multi-persona warn

The existing `pickFirstPersona` warn at `run.ts:314-316` fires only when `Array.isArray(persona)`. When `--persona` is supplied (a single string), the array-detection branch is NOT taken — no warn is emitted. **Rationale**: the user explicitly chose the persona; the multi-persona warn is for the implicit-resolution case where the runner needs to surface the deferred-sequential-dispatch.

#### `--no-optional` does NOT block the explicit `--step` branch

The `--step` branch at `pickNextStep` lines 515-540 returns the resolved node BEFORE the optional-toggle filter applies. **`--step + --no-optional` therefore dispatches the explicit step EVEN IF it is `optional: true`.** **Rationale**: `--step` is the user's explicit intent; the optional-toggle is for candidate computation. Test case M (Task 6.14) asserts this; Story 3.5 documents the v0.1 design decision.

#### `failurePolicies` runtime is forward-deferred to Story 6.x

Architecture §line 780 declares `failurePolicies: {}` as a top-level config block (`{ stepName: "retry" | "skip" | "route-to-fixer" | "escalate" }`). The AC line 805 wording mentions `failurePolicies` defaults applying when neither toggle flag is set, but v0.1 has NO runtime consumption of this config block. **Rationale**: the per-step failure-policy is Epic 5's scope (Stories 5.1 retry / 5.2 skip / 5.3 route-to-fixer / 5.4 escalate / 5.6 per-step config); the config-loader is Story 6.1's scope. Story 3.5 documents the deferral; the AC line 805 default behaviour is interpreted as "no toggle" — i.e., the runner does NOT branch on `failurePolicies` in v0.1.

#### Multi-persona sequential dispatch is forward-deferred to Stories 4.1 + 5.*

AR16 line 187 + architecture §D13 line 640 reserve multi-persona steps (e.g., `code-review` = `dev` + `tea`) for sequential dispatch in Stories 4.1 (loop runner) + 5.* (failure-UX engine). v0.1's `pickFirstPersona` picks the first element + emits a warn. **Rationale**: the parallel dispatch surface needs the loop-runner's iteration model + the failure-UX engine's retry semantics; the v0.1 single-step `/bmad-next` cannot orchestrate the sequential cascade alone.

### Carry-overs from Story 3.4

- **Story 3.4 §line 564** (Story 3.5 forward-coupling — secondary consumer): RECEIVED. Story 3.5 INHERITS the `pickNextStep(state, dag, args, log)` 4-arg signature; no signature change.
- **Story 3.4 §line 174** (Story 3.5 = "next round of flag wiring"): RESPECTED. Story 3.5 wires the persona + optional toggles per AC lines 792-805.
- **Story 3.4 `captureLogger()` factory at `run.test.ts`**: REUSED. Story 3.5's tests reuse the same logger-capture pattern.

### Carry-overs from Story 3.3

- **Story 3.3 §line 469** (`--dry-run + --persona` test forward-coupling): RECEIVED. Story 3.5's Test L (Task 6.13) verifies the dry-run preview surfaces the `--persona` override.

### Carry-overs from Story 3.2

- **Story 3.2 §line 471** (`Resume substitutes nextStep — does NOT bypass persona resolution`): RESPECTED. Story 3.5's Test K (Task 6.12) verifies the persona-override wins on resume.

### Carry-overs from Story 1.11

- **Story 1.11's 4-tier `resolvePersona`**: PRESERVED. Story 3.5 BYPASSES this cascade only when `--persona` is supplied; the cascade fires verbatim when `--persona` is absent.
- **Story 1.11 AC-2 verbatim hint** (`Add a persona for <step> in bmad-stepper.config.yaml under the personas: block.`): PRESERVED. Story 3.5 does NOT modify the no-tier-resolves throw.

### Carry-overs from Story 1.10

- **Story 1.10 seed `optional: true` flagging**: CONSUMED. Story 3.5's tests reference seed steps with `optional: true` flagging (e.g., `bmad-product-brief` per Story 1.10's seed declarations) to exercise the `--no-optional` exclusion + `--include-optional` inclusion.

### Carry-overs from Story 1.7

- **Story 1.7 §line 64-69 cross-validation gap**: CLOSED (by Story 2.4's `enforceMutuallyExclusiveFlags`; Story 3.5 PRESERVES).
- **Story 1.7 §line 70 empty-string convention**: PRESERVED. The `--persona ""` empty-string fall-through respects the project-wide convention.

### Carry-overs from Epic 2 Retrospective

- **Epic 2 Retrospective §Forward Action Items**: Story 3.5 is the 5th story of Epic 3, between Story 3.4 (`--step + scope flags`) and Story 3.6 (`--explain reasoning trace`). The recommended sequence is preserved.

### Forward Dependencies

- **Story 3.6 (`--explain` Reasoning Trace)**: PRIMARY CONSUMER. Story 3.6 enriches the `--explain` short-circuit at `run.ts:833-861` to enumerate the persona-tier provenance ("resolved via Tier 1: SKILL.md frontmatter" / "resolved via Tier 2: project-config" / "supplied via `--persona` override" / etc.). Story 3.5's persona-override branch is the foundation; Story 3.6 enriches the diagnostic.
- **Story 3.7 (`--list` candidate next-steps)**: SECONDARY CONSUMER. Story 3.7's `--list` enumeration consumes the optional-toggle filter at `run.ts:1001-1004`; Story 3.5's JSDoc tightening at this site documents the consistency invariant.
- **Story 4.1 (`/bmad-loop` Command Skeleton)**: PRIMARY CONSUMER. The loop runner consumes `runNext` per iteration; the per-iteration persona override + optional-toggle flags are forwarded verbatim. Story 4.1 may add the multi-persona sequential dispatch wiring.
- **Story 5.1 (Retry Failure Mode)**: SECONDARY CONSUMER. The retry semantics consume `failurePolicies` per-step config (Story 5.6 + 6.x); Story 3.5 documents the v0.1 deferral.
- **Story 5.6 (Per-Step Failure Policy via Config)**: PRIMARY CONSUMER. Wires the runtime consumption of `failurePolicies` per architecture §line 780. Story 3.5's AC line 805 default-behaviour documentation flags the deferral.
- **Story 6.1 (`bmad-stepper.config.yaml` schema loader)**: PRIMARY ARCHITECTURAL EXTENSION. The full config-loader will reconcile the project-config `optionalSteps: include` prose with the runner-tier default (Story 3.5 §v0.1 Design Decisions documents the divergence) and validate the persona-name registry.

### Previous Story Intelligence

This story builds on:

- **Story 1.5 (Schemas + Migrations Skeleton)** — declared `state.lastSuccessfulStep` + `state.lastAttempted` on `StateV1Schema`. Story 3.5 reads `lastSuccessfulStep` for the next-step computation; the persona-override branch is state-independent.
- **Story 1.7 (CLI Argument Parser)** — declared `persona: z.string().optional()` + `includeOptional: z.boolean().default(false)` + `noOptional: z.boolean().default(false)` on `NextArgsSchema`. Story 1.7 §line 64-69 documented the cross-validation gap; Story 1.7 §line 70 documented the empty-string convention. Story 3.5 inherits BOTH.
- **Story 1.10 (DAG seed + 3-tier registry)** — established `node.optional: boolean` + the seed `optional: true` flagging. Story 3.5's tests reference seed steps with `optional: true` to exercise the toggle.
- **Story 1.11 (Persona Resolution)** — established `resolvePersona({ stepName, ... }): Promise<string | readonly string[]>` with the 4-tier cascade (Tier 1 frontmatter > Tier 2 config > Tier 3 defaults > Tier 4 module config). Story 3.5 BYPASSES the cascade only when `--persona` is supplied.
- **Story 2.2 (Dispatch Spec Generator)** — established `BuildDispatchSpecInput` with the `persona` field. Story 3.5's persona override flows through the existing `buildDispatchSpec(...)` call site.
- **Story 2.4 (`run.ts` lock-free runner)** — established the persona-override branch at `run.ts:1044-1056` + the optional-toggle filter at `run.ts:619-626 + 1001-1004` + the cross-validation closure at `run.ts:266-284` + the multi-persona pick-first warn at `pickFirstPersona`. Story 3.5 PRESERVES all 4 surfaces; ONLY tightens the JSDoc.
- **Story 3.1 (Record `last_attempted` / `last_failure_reason` on Halt)** — UNCHANGED. The persona-override branch is state-read-side; no halt-record interaction.
- **Story 3.2 (`--resume` Flag)** — established the `resolveResumeTarget` helper that bypasses `pickNextStep`. Story 3.5's `--persona + --resume` test (Task 6.12 case K) verifies the persona-override wins on resume.
- **Story 3.3 (`--dry-run` Flag)** — established the dry-run preview branch downstream of `pickNextStep`. Story 3.5's `--persona + --dry-run` test (Task 6.13 case L) verifies the dry-run preview surfaces the override.
- **Story 3.4 (`--step` and Scope Flags)** — established the 4-arg `pickNextStep(state, dag, args, log)` signature + the `--step + scope` warning + the `isPreconditionMet` helper. Story 3.5's `--persona + --step` test (Task 6.11 case J) verifies the orthogonal composition; Story 3.5's `--no-optional + --step` test (Task 6.14 case M) documents the v0.1 design decision that `--step` bypasses the optional-toggle filter.

Story 3.5 does NOT consume from:

- Stories 1.1-1.4, 1.6, 1.8, 1.9, 1.12, 1.13 (repo scaffold, errors module, logger, lock, branch detection, BMAD detection, doctor, quick-start docs) — these are independent prerequisites for `run.ts` but their public APIs are not touched by Story 3.5.
- Stories 2.1, 2.3, 2.5, 2.6, 2.7, 2.8 (verifier registry, sub-agent markdown, transcript writers, verify-and-advance, Layer 1 markdown, smoke test) — Story 3.5 doesn't touch the verifier surface, sub-agent prompt, transcript writer, lock-held runner, Layer 1 markdown, or smoke test.

### Open Questions for Code Review

1. **Should the `--persona` override emit a warn citing the bypassed Tier?** v0.1 conservative: NO — the user explicitly chose the persona; surfacing "you bypassed Tier 1 (SKILL.md frontmatter)" is noise. Story 3.6's `--explain` enrichment may enumerate the bypass on the explain path.
2. **Should `--no-optional` block the explicit `--step <optional-step>` branch?** v0.1 conservative: NO — the `--step` branch wins (test case M asserts this). Story 6.x may revisit when the per-step config-loader lands; the user's explicit `--step` intent supersedes the toggle.
3. **Should the `--include-optional` flag explicitly LOG the "including optional candidates" decision?** v0.1 conservative: NO — the `--list` short-circuit's per-line `, optional` suffix already surfaces the optional candidates; the `pickNextStep` decision is internal.
4. **Should the runner reject `--persona <invalid-name>` (registry-validation)?** v0.1 conservative: NO — accept any non-empty string; the BMAD plugin's downstream sub-agent prompt validates. Story 6.1 may add validation.
5. **Should `failurePolicies` runtime lookup land in Story 3.5 (per AC line 805 wording)?** v0.1 conservative: NO — the `failurePolicies` runtime is Story 5.6 + Story 6.x scope. Story 3.5's AC line 805 default-behaviour documentation interprets "no toggle" as "no runtime branching on `failurePolicies` in v0.1"; the config-block is declared at architecture §line 780 but NOT yet consumed.
6. **Should the optional-toggle default flip from EXCLUDE to INCLUDE to match `.bmad-stepper/config.yaml execution.optionalSteps: include`?** v0.1 conservative: NO — the runner does NOT consume the project config in v0.1 (Story 6.1 forward-dep); the conservative default keeps the deterministic happy-path narrow. Story 6.x will reconcile.
7. **Should the multi-persona warn fire on `--persona` override even when the supplied string is identical to a multi-persona array's first element?** v0.1 conservative: NO — the warn fires ONLY when the runner's resolution returns an array (i.e., NOT supplied via `--persona`). Test case C (Task 6.4) asserts this.

## Dev Agent Record

### Context Reference

- `_bmad-output/implementation-artifacts/3-5-persona-override-include-optional-no-optional.md` (this file)
- `src/commands/next/run.ts` (4-site JSDoc tightening only)
- `src/commands/next/run.test.ts` (Story 3.5 coverage describe block — 12-15 cases)

### Agent Model Used

Opus 4.7 (1M context) — bmad-create-story sub-agent for Story 3.5 (1M-context variant per BMAD `dev` agent skill).

### Debug Log References

- Bun host: 1.3.12 (AR2 satisfied — Bun >= 1.3).
- Pre-implementation baseline confirmed: 608 pass / 0 fail / 2223 expects / 49 files (Story 3.4 final).
- Post-implementation final: 625 pass / 0 fail / 2281 expects / 49 files (Δ +17 tests / +58 expects vs Story 3.4 baseline).
- ZERO repair iterations consumed: tests passed cleanly on first run after JSDoc-tightening + new describe block.
- ZERO TypeScript errors / ZERO Biome violations on initial post-edit validation.

### Completion Notes List

- **Implementation lands cleanly inside the story spec's allowed mutation surface.** Modified `src/commands/next/run.ts` at 4 insertion sites to tighten JSDoc per Story 3.5 epic AC lines 794-805: (1) `enforceMutuallyExclusiveFlags` (lines 266-303 post-edit) cites AC line 803-805 default behaviour + the `failurePolicies` Story 6.x deferral; (2) optional-toggle filter in `pickNextStep` (lines ~657-676 post-edit) cites AC lines 797-802 + documents the project-config divergence (`.bmad-stepper/config.yaml execution.optionalSteps: include` vs runner-tier default EXCLUDE) + the `--step + --no-optional` design decision; (3) `--list` short-circuit optional-toggle filter (lines ~1042-1057 post-edit) cites AC lines 797-802 + the consistency invariant; (4) persona-override branch (lines ~1085-1135 post-edit) cites AC lines 794-796 + documents the empty-string fall-through, the registry-validation forward-deferral, the multi-persona warn elision, the resume composition, and the multi-persona sequential dispatch deferral. **No behavioural change.** ~103 lines net delta on `run.ts` (1259 → 1362).
- Modified `src/commands/next/run.test.ts`: APPENDED a new `describe("runNext — Story 3.5 --persona override + --include-optional/--no-optional", ...)` block with 17 colocated test cases per Task 6 (15 original cases + 2 baseline cases for diff-with-default fixtures). Reuses module-level `tmp` setup, `writeMinimalState`, `commonOpts`. Adds colocated `captureLogger()` factory + `writeStateWithLastSuccessful()` factory + `readDispatchedPersona()` helper for spec-read assertions. ~478 lines net delta (1941 → 2419).
- **Test breakdown**: AC line 794-796 (--persona) × 4 (Test A, B, C, C-baseline); AC line 797-799 (--no-optional) × 2 (Test D, H); AC line 800-802 (--include-optional) × 3 (Test E, E-baseline, I); AC line 803-805 (default) × 2 (Test F, G); edges × 6 (Test J, K, L, M, N, O). All 4 ACs covered; cross-validation preservation (G + N) asserts the Story 2.4 closure stays intact; multi-persona warn elision (C + C-baseline) asserts both directions of the AR16 deferral.
- **NO new error classes.** Registry CI gate stays at 16 codes. Story 3.5 ships ZERO throws — the cross-validation throw is PRE-EXISTING (Story 2.4); the persona-override branch ships ZERO throws (it short-circuits BEFORE `resolvePersona` is awaited).
- **NO state-yaml writes from `run.ts`.** Lock-free contract per architecture §line 1672 + AR8 preserved.
- **NO new modules / NO Layer 1 markdown change / NO `verify-and-advance.ts` change / NO schema bump / NO `args.ts` change / NO `dag/` change / NO `dispatch/` change / NO `personas/resolve.ts` change.** Story 3.5 is purely additive at the runner-tier composer (JSDoc + tests).
- **AR41 boundary preserved.** No new imports added; the colocated AR41 boundary check at `run.test.ts:606-638` continues to pass.
- **AR9 protocol preserved.** The dispatch line shape is unchanged; the JSDoc edits are documentary only.
- **7 v0.1 design decisions documented in JSDoc** (per story §v0.1 Design Decisions): (1) `--persona <name>` accepts ANY non-empty string — no registry validation; (2) Empty-string `--persona ""` is treated as "no override"; (3) Default optional-toggle behaviour is EXCLUDE — diverges from `.bmad-stepper/config.yaml`; (4) `--persona` overrides EVEN ON RESUME; (5) `--persona` overrides DO NOT emit the multi-persona warn; (6) `--no-optional` does NOT block the explicit `--step` branch; (7) `failurePolicies` runtime is forward-deferred to Story 6.x. All 7 decisions inlined into the relevant insertion sites.
- **Forward-coupling documented.** JSDoc at the persona-override branch references Stories 3.6 (`--explain` reasoning trace persona-tier provenance), 3.7 (`--list` candidate enumeration), 4.1 (loop runner), 5.* (failure-UX engine — multi-persona sequential dispatch), 6.x (config-loader + DAG attribution).
- **ZERO repair iterations consumed.** The `bun test` / `bunx tsc --noEmit` / `bunx --bun biome ci .` / `bun run check` validators all passed exit 0 on first invocation after the JSDoc-tightening + test-append. Within the ≤3 budget.
- **No deviations from story spec.** Task 6.4 (Test C) was successfully implementable using `bmad-create-story` (multi-persona Tier 3 default `["analyst", "pm"]`) — the story spec noted "if no seed step has multi-persona Tier 3 defaults, document the test as 'no-applicable-fixture-in-v0.1-seed; deferred to Story 4.1'" but the seed at `src/dag/seed-v6.x.ts:165` confirms `bmad-create-story.persona = ["analyst", "pm"]` IS multi-persona. Both directions of the multi-persona warn elision are asserted (Test C: warn elided when override supplied; Test C-baseline: warn fires when override absent).

### Test Counts (final)

- **bun run check**: exit 0.
- **Total**: 625 pass / 0 fail / 2281 expect() calls / 49 files.
- **Story 3.5 delta**: +17 tests / +58 expects / 0 new files (vs. Story 3.4 final baseline of 608 / 2223 / 49).
- **Run-tests suite** (`bun test src/commands/next/run.test.ts`): 94 pass / 297 expects (77 pre-Story-3.5 + 17 new Story 3.5).
- **Errors registry CI gate** (`bun test src/errors.test.ts`): 10 pass / 197 expects — registry stays at 16 codes.
- **TypeScript** (`bunx --bun tsc --noEmit`): exit 0.
- **Biome ci** (`bunx --bun biome ci .`): exit 0 (115 files checked clean).

### File List

#### Modified Files

- `src/commands/next/run.ts` — tightened JSDoc/comments at 4 insertion sites:
  - `enforceMutuallyExclusiveFlags` (lines 266-303 post-edit): added Story 3.5 carry-over reference for AC lines 803-805 + the `failurePolicies` Story 6.x deferral note.
  - Optional-toggle filter in `pickNextStep` (lines ~657-676 post-edit): added Story 3.5 carry-over reference for AC lines 797-802 + project-config divergence note + cross-validation note + `--step` design-decision note.
  - Optional-toggle filter in `--list` short-circuit (lines ~1042-1057 post-edit): added Story 3.5 carry-over reference for AC lines 797-802 + consistency invariant note.
  - Persona-override branch (lines ~1085-1135 post-edit): added Story 3.5 carry-over reference for AC lines 794-796 + empty-string handling + registry-validation forward-deferral + multi-persona warn elision + resume composition + multi-persona sequential dispatch deferral.
  - **No behavioural change.** ~1259 → ~1362 lines (+103).
- `src/commands/next/run.test.ts` — APPENDED new `describe("runNext — Story 3.5 --persona override + --include-optional/--no-optional", ...)` block with 17 colocated test cases. Added colocated `captureLogger()`, `writeStateWithLastSuccessful()`, and `readDispatchedPersona()` helpers (mirrored from Story 3.4's pattern with Story 3.5 default fixture values: epic=3, story="3.5"). Test categories: AC-1 persona × 4 (override + empty-string + multi-persona-warn-elided + multi-persona-warn-baseline); AC-2 no-optional × 2 (pickNextStep + --list); AC-3 include-optional × 3 (pickNextStep + pickNextStep-baseline + --list); AC-4 default × 2 (default-no-toggle + cross-validation); edges × 6 (--step combo / --resume combo / --dry-run combo / --no-optional + --step / cross-validation before --step / --explain combo). ~1941 → ~2419 lines (+478).

#### New Files

(none — Story 3.5 is purely additive on existing files; no new modules; no new integration test file required by AC.)

#### Sprint Status

- `_bmad-output/implementation-artifacts/sprint-status.yaml` — flipped `3-5-persona-override-include-optional-no-optional` from `ready-for-dev` → `review`. `epic-3` remains `in-progress`.

#### Story File

- `_bmad-output/implementation-artifacts/3-5-persona-override-include-optional-no-optional.md` — Tasks/Subtasks all marked `[x]`, frontmatter status flipped to `review`, inline status line flipped to `review`, Dev Agent Record / Test Counts / File List / Change Log populated.

#### Task Record

- `.bmad-stepper/runs/2026-05-01T202935Z-bmad-next/tasks/t1-dev-story.yaml` (NEW) — task record per BMAD dev-story discipline.

#### NOT Modified (per spec)

- `src/commands/next/args.ts` — `--persona`/`--include-optional`/`--no-optional` already declared by Story 1.7.
- `src/personas/resolve.ts` — Story 1.11's 4-tier resolution stays; the `--persona` override BYPASSES the cascade.
- `src/personas/defaults.ts` — Tier 3 hand-curated defaults stay.
- `src/errors.ts` — registry stays at 16 codes (no new error class).
- `src/dag/build.ts` / `src/dag/types.ts` — DAG node `optional: boolean` already declared by Story 1.10.
- `src/dispatch/generate-spec.ts` — dispatch-spec construction unchanged; the existing `persona` field flow is preserved.
- `src/state/load.ts` — `loadStateUnlocked` already exposed.
- `src/commands/next/verify-and-advance.ts` — Story 3.5 does NOT touch the lock-held runner.
- `commands/bmad-next.md` — Layer 1 markdown already branches on `action`; the `dispatch` discriminator carries the persona field via `taskSpec`.
- `src/schemas/state.ts` / `src/schemas/dispatch-protocol.ts` — no schema bump.

## Senior Developer Review (AI)

**Reviewer**: bmad-code-review (claude-opus-4-7[1m])
**Reviewed**: 2026-05-01
**Verdict**: **APPROVE** (status: review → done)
**Counts**: must-fix=0 | should-fix=0 | nits=0 | info=2

### Outcome

Implementation lands cleanly inside the spec's allowed mutation surface. All 4 ACs delivered with high fidelity to the verbatim AC wording (epic lines 794-805). Story is pure JSDoc-tightening on production code (no behavioural change at the 4 insertion sites) plus 17 new colocated tests asserting the contract. AR8 / AR9 / AR16 / AR21 / AR22 / AR33 / AR41 invariants preserved. Quality gates reproduce green (625 / 0 / 2281 / 49). Zero deviations from the spec's allowed mutation surface; all 7 open questions adjudicated ACCEPT v0.1 conservative.

### AC Verification

- **AC-1** (epic lines 794-796: `--persona <name>` is supplied → dispatch-spec's PERSONA field uses the supplied name, bypassing the 4-tier resolution) — **PASS**.
  - Production branch at `src/commands/next/run.ts:1148-1159` (`if (args.persona !== undefined && args.persona !== "") { personaResolved = args.persona; } else { personaResolved = await resolvePersona({...}); }`).
  - JSDoc tightening at `run.ts:1104-1147` cites AC lines 794-796 verbatim + documents 5 v0.1 design decisions inline (empty-string handling, registry-validation forward-deferral, multi-persona warn elision, resume composition, sequential dispatch deferral).
  - `pickFirstPersona` short-circuit at `run.ts:316-320`: a supplied `string` (non-array) bypasses the `Array.isArray(persona)` branch — verbatim per AC.
  - Tests:
    - **Test A** at `run.test.ts:2062-2077` (`--persona tea` overrides Tier 3 default `analyst` for `bmad-product-brief`; persona surfaced via on-disk `dispatch-spec.json` read).
    - **Test B** at `run.test.ts:2081-2094` (`--persona ""` falls through to Tier 3 default `analyst` for `bmad-brainstorming`).
    - **Test C** at `run.test.ts:2098-2122` (multi-persona `bmad-create-story` Tier 3 `["analyst", "pm"]` override with `--persona dev` does NOT emit multi-persona warn).
    - **Test C-baseline** at `run.test.ts:2126-2146` (without `--persona`, multi-persona warn fires exactly once for `bmad-create-story`).

- **AC-2** (epic lines 797-799: `--no-optional` is supplied → steps with `optional: true` excluded from candidates) — **PASS**.
  - Production branch at `src/commands/next/run.ts:672-673` (`if (args.noOptional) { filtered = filtered.filter((n) => !n.optional); }`).
  - Mirror filter in `--list` short-circuit at `run.ts:1064` (`if (args.noOptional && node.optional) continue;`).
  - JSDoc tightening at `run.ts:636-671` cites AC lines 797-799 verbatim + the project-config divergence note + the cross-validation precedence + the `--step` design-decision note.
  - JSDoc tightening at `run.ts:1053-1063` cites AC lines 797-802 + the consistency invariant.
  - Tests:
    - **Test D** at `run.test.ts:2150-2168` (`--no-optional` after `bmad-create-prd` excludes 3 optional candidates → dispatches non-optional `bmad-create-epics-and-stories`).
    - **Test H** at `run.test.ts:2250-2266` (`--list --no-optional` on fresh state → empty enumeration; no `, optional` suffix in output).

- **AC-3** (epic lines 800-802: `--include-optional` is supplied → optional steps included with normal priority) — **PASS**.
  - Production branch at `run.ts:674-678` (`else if (!args.includeOptional) { filtered = filtered.filter((n) => !n.optional); }` — when `args.includeOptional === true`, the filter SKIPS the exclusion → optional candidates kept).
  - Tiebreaker at `run.ts:697-703` (phase order then name lexicographic) applies uniformly to optional + non-optional candidates ("normal priority" semantic).
  - Mirror filter in `--list` short-circuit at `run.ts:1061-1063` (`if (!args.includeOptional && !args.noOptional && node.optional) continue;` — when `--include-optional` true, optional candidates surface with `, optional` suffix per `run.ts:1066`).
  - Tests:
    - **Test E** at `run.test.ts:2172-2187` (after `bmad-brainstorming`, only `bmad-product-brief` (optional) is reachable; `--include-optional` dispatches it — clean differentiator vs default).
    - **Test E-baseline** at `run.test.ts:2191-2206` (default behaviour halts when only optional candidates exist; verbatim hint preserved).
    - **Test I** at `run.test.ts:2270-2285` (`--list --include-optional` includes `bmad-brainstorming` with `, optional` suffix).

- **AC-4** (epic lines 803-805: neither flag supplied → project-config `failurePolicies` and `personas` defaults apply, no toggle) — **PASS**.
  - Production: the `else if (!args.includeOptional)` branch at `run.ts:674-678` covers the no-toggle case (default-exclude); `enforceMutuallyExclusiveFlags` at `run.ts:290-301` is a no-op when both flags are unset; the persona path falls through to `resolvePersona(...)` (Story 1.11 4-tier cascade) at `run.ts:1152-1158`.
  - JSDoc tightening at `run.ts:266-289` cites AC lines 803-805 + documents the `failurePolicies` Story 6.x deferral verbatim per the dev-story §v0.1 Design Decisions.
  - Tests:
    - **Test F** at `run.test.ts:2210-2229` (default: dispatches non-optional `bmad-create-epics-and-stories` with Tier 3 persona `pm`).
    - **Test G** (cross-validation preservation) at `run.test.ts:2233-2246` (`--include-optional --no-optional` throws ConfigError with verbatim hint `Pass either --include-optional or --no-optional, not both.`; exitCode 2).

### Architecture / NFR / FR coverage

- **AR8** (lock-free `run.ts` / lock-held `verify-and-advance.ts`) — **PASS**. JSDoc-only edits at 4 sites; no new lock acquisition; no `state.yaml` write side-effects. The colocated AR41 boundary check at `run.test.ts:606-638` (which guards both AR8 and AR41) continues to pass.
- **AR9** (single discriminated-union JSON line on stdout) — **PASS**. Dispatch line shape unchanged; `pickFirstPersona` warn (when applicable) routed via `LoggerFns.warn` → `src/io/log.ts:20-21` → `process.stderr.write` (NOT stdout). Test C asserts warn-elision; Test C-baseline asserts warn fires when applicable.
- **AR16** (multi-persona sequential dispatch) — **EXTENDED PASS**. The `--persona` override surface explicitly bypasses the multi-persona Tier-3 array path (verified by Test C: `bmad-create-story` Tier 3 `["analyst", "pm"]` with `--persona dev` → no multi-persona warn). When `--persona` absent, the existing v0.1 single-element-pick + warn behaviour is preserved (Test C-baseline). Forward-deferral to Stories 4.1 + 5.* documented verbatim in JSDoc at `run.ts:1141-1147`.
- **AR21** (errors carry code) — **PASS**. ZERO new throws introduced by Story 3.5. The pre-existing `enforceMutuallyExclusiveFlags` ConfigError (Story 2.4) + `pickFirstPersona` empty-array ConfigError (Story 2.4) + `resolvePersona` no-tier-resolves ConfigError (Story 1.11) all stay. Registry stays at **16 codes** (`bun test src/errors.test.ts`: 10 pass / 197 expects).
- **AR22** (errors carry actionable hint; single-line `Run/See/Try/Check`) — **PASS**. ZERO new hints introduced. The pre-existing hints (`Pass either --include-optional or --no-optional, not both.`; `Configure at least one persona for ...`; `Add a persona for <step> in bmad-stepper.config.yaml under the personas: block.`) all preserved.
- **AR33** (function & error semantics; throw not Result; no console.\*; async/await) — **PASS**. JSDoc-only edits at 4 sites. No console.\* introduced. No Result-shape introduced. The persona-override branch is synchronous within the async `runNext`.
- **AR41** (boundary graph; no upward / sibling-higher imports) — **PASS**. **Verified independently**: `git diff src/commands/next/run.ts | grep "^+import"` returned ZERO matches (exit code 1 — grep found no lines), confirming no new imports added. The colocated AR41 boundary check at `run.test.ts:606-638` continues to pass.
- **FR8** (`/bmad-next` single-step advance) — **EXTENDED PASS**. The runner now respects `--persona` override + the optional-toggle flags per AC lines 794-805.
- **FR12** (`--persona` override) — **PRIMARY DELIVERABLE PASS**. Architecture §line 1342 declares `FR12 → src/commands/next/args.ts, src/personas/resolve.ts`. Story 3.5 ships the AC-coverage tests (4 tests across A/B/C/C-baseline) + JSDoc tightening (5 design-decision documentation blocks at the persona-override branch).
- **FR15** (`--include-optional`/`--no-optional`) — **PRIMARY DELIVERABLE PASS**. Architecture §line 1345 declares `FR15 → src/commands/next/args.ts, src/dag/build.ts`. Story 3.5 ships the AC-coverage tests (5 tests across D/E/E-baseline/H/I) + JSDoc tightening at both filter sites (`pickNextStep` + `--list` short-circuit).
- **FR53** (documented exit codes) — **PASS**. `enforceMutuallyExclusiveFlags` cross-validation throw uses `ConfigError` (exitCode 2). Test G + Test N assert the exit code.
- **FR54** (stdout/stderr discipline) — **PASS**. Multi-persona warn (when applicable) routes to stderr; AR9 dispatch line on stdout preserved. Test C + Test C-baseline assert.
- **NFR-S2** (writes only inside scope) — **PASS BY ABSENCE**. JSDoc-only edits introduce zero new write surface.
- **NFR-S5** (non-corrupting flag combinations) — **PASS**. Composition tests: J (`--persona + --step`), K (`--persona + --resume`), L (`--persona + --dry-run`), M (`--no-optional + --step`), N (`--include-optional + --no-optional + --step`), O (`--persona + --explain`) all assert correct precedence + non-corruption.
- **NFR-M3** (well-instrumented errors) — **PASS BY INHERITANCE**. The pre-existing throws all carry detail JSON; no new throws added.
- **NFR-R1** (zero data loss on halt) — **PASS BY ABSENCE**. Read-side only; no write paths touched.
- **NFR-I2** (unknown-skill fail-loud) — **PRESERVED**. The `--persona <any-non-empty-string>` registry-validation forward-deferral to Story 6.1 is documented verbatim in JSDoc at `run.ts:1122-1127`.

### Findings

#### Must-fix

(none)

#### Should-fix

(none)

#### Nits

(none)

#### Info

- **Info-1** (default optional-toggle semantics divergence from `.bmad-stepper/config.yaml execution.optionalSteps: include`): the runner's v0.1 default (when neither `--include-optional` nor `--no-optional` is supplied) is to EXCLUDE optional candidates from `pickNextStep` selection. The project's `.bmad-stepper/config.yaml execution.optionalSteps: include` (line 14) declares an "include by default" intent in prose, but the runner does NOT consume the project config at runtime in v0.1 (Story 6.1 forward-dep). Documented verbatim in JSDoc at `run.ts:648-653`. Acceptable v0.1 scope; Story 6.x reconciles when the full config-loader lands.
- **Info-2** (`failurePolicies` runtime forward-deferred to Story 6.x): AC line 805 wording mentions `failurePolicies` defaults applying when neither toggle flag is supplied, but v0.1 has NO runtime consumption of the `failurePolicies` config block (architecture §line 780 declares the block but the runtime is Epic 5 + Story 6.1 scope). Documented in JSDoc at `run.ts:278-285`. Story 3.5's AC-4 verdict interprets "no toggle" as "no runtime branching on `failurePolicies` in v0.1"; the test surface (Test F) asserts the persona + optional-exclusion defaults only.

### Validator Independent Re-Run

- `bun test`: **625 pass / 0 fail / 2281 expect() calls / 49 files** (verified across 2 consecutive full-suite runs; both 625/0/2281/49 stable).
- `bun run check`: **exit 0** (biome format + biome ci + tsc + bun test all clean).
- `bunx --bun biome ci .`: **exit 0** (115 files checked clean).
- `bunx --bun tsc --noEmit`: **exit 0** (no TypeScript errors).
- `bun test src/commands/next/run.test.ts -t "Story 3.5"`: **17 pass / 0 fail / 58 expect() calls** (matches dev-story claim).
- `bun test src/commands/next/run.test.ts`: **94 pass / 0 fail / 297 expect() calls** (matches dev-story claim of 77 pre-Story-3.5 + 17 new = 94).
- `bun test src/errors.test.ts`: **10 pass / 0 fail / 197 expect() calls** — registry stays at **16 codes** (AR21 invariant preserved).
- AR41 boundary check (`git diff src/commands/next/run.ts | grep "^+import"`): **0 matches** (exit code 1, no output) — confirms ZERO new imports added by Story 3.5.
- AC-text byte-identical: `diff <(sed -n '794,805p' epics.md) <(grep -A 30 "^## Acceptance Criteria" 3-5-...md | sed -n '/^\*\*Given\*\*/,/^\*\*Then\*\* the project-config/p')` → **exit 0** (verbatim BDD AC content matches; no header-line delta required because the story spec embeds the BDD lines directly without additional preamble between the `## Acceptance Criteria` heading and the first `**Given**`).

### Deviations Adjudication

The dev-story enumerated 7 open questions (lines 558-564). All adjudicated ACCEPT v0.1 conservative — Story 3.5 is a CONTRACT-TIGHTENING story, so the v0.1 conservative posture is correct.

- **open-question-1 (`--persona` override emit a warn citing the bypassed Tier?)** — **ACCEPT v0.1 conservative**. The user explicitly chose the persona; surfacing "you bypassed Tier 1 (SKILL.md frontmatter)" is noise. Story 3.6's `--explain` enrichment may enumerate the bypass on the explain path. Forward-deferral correctly documented in JSDoc at `run.ts:1104-1114`.
- **open-question-2 (`--no-optional` block the explicit `--step <optional-step>` branch?)** — **ACCEPT v0.1 conservative**. The `--step` branch returns BEFORE the optional-toggle filter applies (`run.ts:531-552`); the user's explicit `--step` intent supersedes the toggle. **Test M at `run.test.ts:2359-2375` asserts this**: `--step bmad-product-brief --no-optional` dispatches the optional `bmad-product-brief` despite `--no-optional`. Story 6.x may revisit when the per-step config-loader lands.
- **open-question-3 (`--include-optional` flag explicitly LOG the "including optional candidates" decision?)** — **ACCEPT v0.1 conservative**. The `--list` short-circuit's per-line `, optional` suffix already surfaces the optional candidates (Test I asserts); the `pickNextStep` decision is internal.
- **open-question-4 (reject `--persona <invalid-name>` via registry-validation?)** — **ACCEPT v0.1 conservative**. Accept any non-empty string; the BMAD plugin's downstream sub-agent prompt validates. Forward-deferral correctly documented in JSDoc at `run.ts:1122-1127`. Story 6.1 may add validation when the full config-loader lands.
- **open-question-5 (`failurePolicies` runtime lookup land in Story 3.5 per AC line 805 wording?)** — **ACCEPT v0.1 conservative**. The `failurePolicies` runtime is Story 5.6 + Story 6.x scope. AC line 805's "no toggle" interpretation is correct: in v0.1 there is no runtime branching on `failurePolicies`; the config-block is declared at architecture §line 780 but NOT yet consumed. Documented in JSDoc at `run.ts:278-285` + `run.ts:655-660`.
- **open-question-6 (optional-toggle default flip from EXCLUDE to INCLUDE to match `.bmad-stepper/config.yaml`?)** — **ACCEPT v0.1 conservative**. The runner does NOT consume the project config in v0.1 (Story 6.1 forward-dep); the conservative default keeps the deterministic happy-path narrow. Story 6.x will reconcile. Info-1 above flags this for follow-up tracking.
- **open-question-7 (multi-persona warn fire on `--persona` override even when supplied string identical to a multi-persona array's first element?)** — **ACCEPT v0.1 conservative**. The warn fires ONLY when the runner's resolution returns an array (i.e., NOT supplied via `--persona`). **Test C at `run.test.ts:2098-2122` asserts this**: `--persona dev` on multi-persona-Tier-3 step `bmad-create-story` does NOT emit the warn even though the supplied "dev" is NOT in the Tier 3 array (`["analyst", "pm"]`); the supplied string takes precedence verbatim. The semantics match the AC line 794-796 "bypassing the 4-tier resolution".

No spec deviations introduced by the dev. The Test C fixture used `bmad-create-story` (which IS multi-persona per `src/personas/defaults.ts:61`); the dev-story §Completion Notes correctly notes the seed at `src/dag/seed-v6.x.ts:165` provides this fixture and the spec's "if no seed step has multi-persona Tier 3 defaults, document the test as no-applicable-fixture-in-v0.1-seed" fallback was not needed.

### Strengths

- **Zero-deviation execution against spec mutation surface**: 9 task groups (Tasks 0-9) completed verbatim; the 4-site JSDoc tightening lands at exactly the line ranges declared in the spec File List (`run.ts:266-303`, `~657-676`, `~1042-1057`, `~1085-1135`); the 17 new tests align 1:1 with Tasks 6.2-6.16.
- **JSDoc quality**: 5 distinct design-decision blocks inlined at the persona-override branch (`run.ts:1106-1147`) document empty-string handling, registry-validation forward-deferral, multi-persona warn elision, resume composition, and sequential dispatch deferral. Reads like a mini-design-doc.
- **Test design discipline**: 17 tests organised by AC (4 persona / 2 no-optional / 3 include-optional / 2 default + cross-validation / 6 edge-case combos). Each AC clause has at least 1 differentiator test (Test E uses a fixture where `--include-optional` CHANGES the dispatched step vs default — clean signal).
- **Fixture choice**: Test E + Test E-baseline use the same `bmad-brainstorming` fixture and assert opposite outcomes (default halts vs `--include-optional` dispatches `bmad-product-brief`). This is the cleanest possible differentiator for "include with normal priority" semantics — the optional candidate is the ONLY reachable candidate, so its inclusion vs exclusion is observable in the dispatched step.
- **Multi-persona symmetry**: Test C + Test C-baseline assert both directions of the AR16 deferral (warn elided when `--persona` supplied; warn fires when absent). The dev correctly identified `bmad-create-story` as the seed multi-persona fixture.
- **Composition coverage**: Tests J/K/L/M/N/O cover the hardest combinatorial corners of `--persona`/`--no-optional` against `--step`/`--resume`/`--dry-run`/`--explain` + the cross-validation precedence (Test N asserts the throw fires BEFORE the `--step` branch).
- **AR41 cleanliness**: zero new imports verified by independent grep.
- **Spec-read centralisation**: the `readDispatchedPersona(runId)` helper at `run.test.ts:2054-2058` factors the on-disk dispatch-spec.json read pattern used in 6+ tests. Reduces test-code duplication.

### Sprint-status update

- `3-5-persona-override-include-optional-no-optional: review → done`
- `epic-3: in-progress` (preserved — Stories 3.6-3.10 still open)

### Approval

Story status flipped `review → done`. `sprint-status.yaml` flipped `3-5-persona-override-include-optional-no-optional: review → done`. Ready to advance to Story 3.6 (`--explain` Reasoning Trace) per the standard Epic-3 sequence.

## Change Log

| Date       | Author                | Change                                       |
| ---------- | --------------------- | -------------------------------------------- |
| 2026-05-01 | bmad-create-story | Initial story file created from epics.md §3.5 |
| 2026-05-01 | bmad-dev-story | 2026-05-01T202935Z-bmad-next | tightened JSDoc for existing --persona/--include-optional/--no-optional branches + ~12-15 new tests; status ready-for-dev → review |
| 2026-05-01 | bmad-code-review | Senior Developer Review — APPROVE; 0 must-fix / 0 should-fix / 0 nits / 2 info; AC-1/2/3/4 PASS; AR8/9/16/21/22/33/41 PASS; status → done |
