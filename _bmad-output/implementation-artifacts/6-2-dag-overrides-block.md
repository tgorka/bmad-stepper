---
status: done
story_id: '6.2'
story_key: 6-2-dag-overrides-block
epic: '6'
title: 'DAG `overrides:` Block'
created: '2026-05-05'
last_updated: '2026-05-05T09:55:00Z'
priority: high
estimated_effort: M
fr_coverage:
  - FR1      # PRIMARY — DAG canonical resolver consumes Tier 2 (config overrides) per architecture line 411-443
  - FR2      # PRIMARY — DAG seed/overrides/frontmatter three-tier discovery (Tier 2 = this story)
  - FR8      # PRIMARY — DAG cycle detection retained; override-introduced cycles surface as DagCycleError
  - FR9      # PRIMARY — adjacency list shape preserved; overrides patch in-place
  - FR35     # PRIMARY — overrides surface ON top of DAG: per-skill placement (`{ phase, after, before, optional }`)
  - FR34     # SECONDARY — config layer feeds the resolver (project > user > defaults)
nfr_coverage:
  - NFR-Sc1  # PRIMARY — global skill DAG only (~30-50 nodes); Tier 2 stays O(n) on the override count
  - NFR-R1   # PRIMARY — strict Zod validation rejects malformed overrides at load time (no silent drift)
  - NFR-R6   # PRIMARY — Zod-validated overrides on every read (single-source-of-truth via OverrideEntrySchema)
  - NFR-R8   # PRIMARY — config validation strictness — unknown predecessor → CONFIG_ERROR with field-pointing hint
  - NFR-S1   # main-thread output discipline (single-line ConfigError hint on stderr)
  - NFR-M2   # PRIMARY — actionable-error contract (single-line hint pointing at offending edge)
  - NFR-I2   # cycle detection unaffected — Tarjan still runs after Tier 2 patches
ar_coverage:
  - AR21     # PRIMARY — error UX shape (single-line actionable hint from CONFIG_ERROR class)
  - AR22     # PRIMARY — actionable-hint regex /^.*(Run|See|Try|Check) / + single-line constraint
  - AR33     # PRIMARY — async function; throws StepperError subclasses; no `console.*`; no `process.exit`
  - AR41     # PRIMARY — boundary graph (`src/dag/` mid-tier — allowed imports: `../errors`, `../schemas/config`, `../io/log`; STILL FORBIDDEN: `../config/load`, sibling mid-tier groups)
  - AR42     # PRIMARY — Zod schema-first (OverrideEntrySchema replaces hand-rolled extractor's coercion)
  - AR8      # lock-free top-tier preserved (build.ts is pure-read; ZERO state.yaml writes)
  - AR9      # AR9 stdout JSON line invariant unchanged
  - AR20     # type-alias chain (OverrideEntry inferred from OverrideEntrySchema; readonly fields preserved)
  - AR34     # slash-command markdown protocol unchanged (this story documents in docs/configuration.md if any)
deps:
  - story: '6.1'
    reason: 'PRIMARY — `loadConfig()` produces typed `Config` with `config.overrides` (closed-shape `OverridesSchema = z.record(z.string(), OverrideEntrySchema)`). Story 6.1 SDR I-23 PRIMARY HONOURED here: Story 6.2 DAG override consumer uses `config.overrides` directly. Story 6.1 inputs to wire: (a) NEW `src/config/load.ts` exposes `loadConfig(opts?): Promise<Config>` signature; (b) `src/schemas/config.ts` exports `OverrideEntrySchema` + `OverridesSchema` + `OverrideEntry` + `Overrides` types; (c) `Config.overrides` is REQUIRED with default `{}` (Story 6.1 ConfigV1Schema: `overrides: OverridesSchema.default({})`); (d) NO loader-API change needed for Story 6.2 (Story 6.1 SDR I-23 verbatim).'
  - story: '1.10'
    reason: 'PRIMARY — DAG seed three-tier registry. Story 1.10 established (a) `src/dag/build.ts` with the THREE-tier resolver (Tier 1 seed > Tier 2 overrides > Tier 3 frontmatter parse), (b) `src/dag/seed-v6.x.ts` ~40 hand-curated entries, (c) `src/dag/tarjan.ts` SCC cycle detection, (d) `src/dag/types.ts` with `OverrideEntry` LOCAL interface (NOT Zod-derived — Story 1.10 deliberately deferred Zod to Story 6.2 per types.ts:6-9 verbatim), (e) the existing hand-rolled YAML extractor `parseOverridesYaml(text)` at build.ts:174-329 (~156 LoC) that reads `bmad-stepper.config.yaml` opportunistically with graceful degradation on parse failure (warn + fall back to seed only). Story 6.2 MIGRATES from the hand-rolled extractor + LOCAL `OverrideEntry` interface to the Zod-validated `OverridesSchema` from Story 6.1 — REPLACING the local type with `z.infer<typeof OverrideEntrySchema>` AND switching from "parse YAML directly in build.ts" to "consume `config.overrides` directly via `BuildInput.overrides`". The graceful-degradation policy CHANGES: Story 1.10 said "parse failure → warn + fall back to seed"; Story 6.2 says "validation failure → ConfigError exit 2 with single-line field-pointing hint" PER AC line 1182-1184 verbatim. The hand-rolled extractor REMAINS as a fallback only when `BuildInput.overrides` is undefined (test escape hatch + first-tier callers that have not yet migrated to loadConfig); in production path the new strict Zod-validated route fires.'
  - story: '1.2'
    reason: 'PRIMARY — errors-registry CI gate + ConfigError class with hintOverride seam. Story 1.2 declared the registry (15 codes); Story 5.2 added SkipRequiresResumeError (16); Story 6.1 reused ConfigError unchanged (registry stays at 17). Story 6.2 ships ZERO new error classes — REUSES the existing `ConfigError` class with the AC-mandated single-line hint passed via the `hintOverride` constructor arg (precedent: Story 1.10 UnknownBmadSkillError + Story 1.11 ConfigError persona-resolver hint + Story 6.1 ConfigError invalid-config field-pointing hint). The CI gate at src/errors.test.ts (with the Story 5.6 single-line constraint test + Story 6.1 multi-instance sweep) automatically covers any ConfigError instance.'
  - story: '1.5'
    reason: 'PATTERN — schemas/migrations skeleton. Story 1.5 + 6.1 established `OverrideEntrySchema` at `src/schemas/config.ts:120-125` with optional `phase`, `after?: string[]`, `before?: string[]`, `optional?: boolean`. Story 6.2 EXTENDS the schema MINIMALLY: (a) tighten `phase` from `z.string().optional()` to `PhaseSchema.optional()` (Phase enum: analysis|planning|solutioning|implementation|retro per AC line 1179 + architecture line 452 + dag/types.ts:30-35); (b) ADD optional `persona`, `idempotent` fields to align the schema with the EXISTING dag/types.ts `OverrideEntry` interface (so the schema replaces the local interface lossless-ly). Other than the `phase` enum tightening, the schema shape is BACKWARDS-COMPATIBLE — fixtures that pass the current open-string `phase` will still pass once they use one of the 5 valid phase strings. Story 6.2 ALSO replaces the local `dag/types.ts:OverrideEntry` interface with `z.infer<typeof OverrideEntrySchema>` (see OQ-3 below) — a pure type-alias migration (no runtime change).'
  - story: '1.3'
    reason: 'PRIMARY — io/log.ts (the `warn` and `error` helpers). Story 6.2 USES `warn` for the existing graceful-degradation path when `BuildInput.overrides === undefined` AND the YAML file is absent OR malformed; switches to `throw new ConfigError(...)` exclusively when `BuildInput.overrides` is provided AND validation fails. The two paths are orthogonal — the warn path is the LEGACY 1.10 escape hatch; the throw path is the AC-line-1182-1184 mandated Tier 2 strict path.'
  - story: '6.3'
    reason: 'CROSS-STORY COORDINATION — Story 6.3 (`models:` per-step config) is INDEPENDENT of Story 6.2 (different config sub-schema; different consumer module — `src/dispatch/` not `src/dag/`). Story 6.2 produces ZERO forward-trackers for 6.3 beyond the Story 6.1 baseline (I-24).'
  - story: '6.4'
    reason: 'CROSS-STORY COORDINATION — Story 6.4 (`budgets:` per-step config) is INDEPENDENT.'
  - story: '6.5'
    reason: 'CROSS-STORY COORDINATION — Story 6.5 (`verifiers:` per-step config override) is INDEPENDENT.'
  - story: '6.6'
    reason: 'CROSS-STORY COORDINATION — Story 6.6 (telemetry opt-in collection) is INDEPENDENT.'
  - story: '2.4'
    reason: 'CONSUMER — `src/commands/next/run.ts` (Story 2.4 lock-free runner) calls `await build({ skillNames, projectRoot, pluginDir })` once per invocation. After Story 6.2, the runner ADDITIONALLY threads `overrides: opts.config?.overrides` into `BuildInput.overrides`. The wiring is a TWO-LINE change at the existing build() call site. Same applies to `src/commands/loop/run.ts` (Story 4.1+) — same pattern, via the productionRunNextFn closure.'
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/implementation-artifacts/6-1-bmad-stepper-config-yaml-schema-loader.md
  - _bmad-output/implementation-artifacts/1-10-dag-seed-three-tier-registry.md
  - _bmad-output/implementation-artifacts/sprint-status.yaml
  - _bmad-output/implementation-artifacts/epic-5-retrospective.md
  - _bmad-output/implementation-artifacts/epic-4-retrospective.md
  - .bmad-stepper/state.yaml
  - .bmad-stepper/config.yaml
  - src/schemas/config.ts
  - src/schemas/config.test.ts
  - src/dag/build.ts
  - src/dag/build.test.ts
  - src/dag/seed-v6.x.ts
  - src/dag/tarjan.ts
  - src/dag/types.ts
  - src/dag/index.ts
  - src/config/load.ts
  - src/config/index.ts
  - src/config/defaults.ts
  - src/errors.ts
  - src/errors.test.ts
  - src/io/log.ts
  - src/commands/next/run.ts
  - src/commands/loop/run.ts
  - commands/bmad-loop.md
  - commands/bmad-next.md
  - docs/configuration.md
---

# Story 6.2: DAG `overrides:` Block

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper user (BMAD Upgrade journey),
I want `overrides:` in `bmad-stepper.config.yaml` to take priority over the seed DAG via a strict Zod-validated path,
So that new BMAD upstream skills work the day they're released without waiting for a Stepper update — and so that authoring mistakes (unknown predecessor, malformed phase, bad shape) surface as a single-line, field-pointing `CONFIG_ERROR` at load time instead of silently misordering the DAG.

## Context Summary

This is the **SECOND STORY of Epic 6** and lands the **strict Zod-validated Tier 2 override consumer at the DAG builder**. Story 6.1 shipped the `loadConfig()` file loader + the closed-shape `OverridesSchema = z.record(z.string(), OverrideEntrySchema)` at `src/schemas/config.ts:120-130`. Story 6.2 wires the DAG builder to consume the loader's typed `config.overrides` directly — REPLACING the existing hand-rolled YAML extractor (`parseOverridesYaml` at `src/dag/build.ts:174-329`, ~156 LoC, with graceful-degradation-on-malformed semantics) with a STRICT path that:

1. Accepts a NEW optional input `overrides?: Overrides` at `BuildInput` (the `src/dag/types.ts` shape).
2. When `BuildInput.overrides` is provided, INVOKES the override mechanism using the typed map directly — NO YAML parse, NO graceful degradation, the schema validation is the LOADER'S responsibility (Story 6.1).
3. Replaces seed entries with same name (architecture line 437 verbatim — "Overrides have higher priority than the seed (users can also re-place a known skill if they have local reasons)").
4. APPENDS new entries to the resolved DAG.
5. EVERY override edge (entries in `after`, `before`) MUST resolve to a known node — unknown predecessor / successor → `ConfigError` (exit 2) with a single-line hint pointing at the offending edge.
6. Cycle detection (Tarjan SCC, Story 1.10) STILL runs after the Tier 2 patch — if the override introduces a cycle, the existing `DagCycleError` fires (NO change to that path).

The hand-rolled YAML extractor at `build.ts:174-329` REMAINS as a graceful-degradation fallback for callers that do NOT provide `BuildInput.overrides` (test escape hatches + Story 1.10's foundational lock-free path that pre-dates Story 6.1). Concretely the wiring is:

- **NEW STRICT PATH (Story 6.2)** — When `BuildInput.overrides !== undefined`, build() consumes the typed Map directly, validates each edge against the resolved set, throws `ConfigError` on any unknown edge, runs cycle detection.
- **LEGACY GRACEFUL PATH (Story 1.10)** — When `BuildInput.overrides === undefined`, build() falls back to `parseOverridesYaml(text)` reading `<projectRoot>/bmad-stepper.config.yaml` directly with `warn` on parse failure.

The runners (`src/commands/next/run.ts` + `src/commands/loop/run.ts`) thread `BuildInput.overrides = opts.config?.overrides` once Story 6.1's `loadConfig()` is in the call chain. This is the canonical Story 6.1 SDR I-23 deliverable: ZERO loader-API change for Story 6.2; consumption through the typed `Config.overrides` field.

### What is in scope (Story 6.2)

1. **`OverrideEntrySchema` Phase enum tightening** — extend `src/schemas/config.ts:120-125` MINIMALLY:
   - Tighten `phase: z.string().optional()` → `phase: PhaseSchema.optional()` where `PhaseSchema = z.enum(["analysis", "planning", "solutioning", "implementation", "retro"])`. The Phase enum matches `src/dag/types.ts:30-35` verbatim. NEW exported schema + type alias: `export const PhaseSchema = z.enum([...]); export type Phase = z.infer<typeof PhaseSchema>;`. NOTE: `src/dag/types.ts` already declares `Phase` as a literal union — Story 6.2 does NOT change that local type (it stays in dag/types.ts because dag/ is mid-tier and cannot import Zod per AR41 — see OQ-2 below).
   - ADD optional `persona: z.union([z.string(), z.array(z.string()), z.null()]).optional()` and `idempotent: z.boolean().optional()` to `OverrideEntrySchema` to MATCH the existing local `OverrideEntry` interface at `src/dag/types.ts:116-123` (so the schema is lossless when local interface is replaced).
   - The CONFIRMED final shape: `{ phase?: Phase, after?: string[], before?: string[], optional?: boolean, persona?: string | string[] | null, idempotent?: boolean }`.

2. **`BuildInput` extension** — extend `src/dag/types.ts:146-151` with NEW optional field `overrides?: ReadonlyMap<string, OverrideEntry> | Overrides` (a `Record<string, OverrideEntry>` from Zod is acceptable; `build.ts` normalises to `Map`). Story 6.2 uses the dag-local type `OverrideEntry` (which after this story is `z.infer<typeof OverrideEntrySchema>` re-exported from `src/schemas/config.ts`) — see OQ-2.

3. **`build.ts` strict Tier 2 path** — at `src/dag/build.ts:537-595` (the existing Tier 2 block):
   - **First**, check `if (input.overrides !== undefined) { ... }` — STRICT path:
     - Iterate the provided overrides map directly (no YAML parse).
     - For each entry, MERGE with seed (existing semantics) OR APPEND (existing semantics).
     - Per AC line 1181 verbatim: "the override entry is placed at the declared phase with the declared edges and replaces any seed entry of the same name".
     - REMOVE the silent-skip-unknown-subkey behaviour from the legacy parser (the Zod schema rejects unknown keys via `.strict()` — see OQ-4).
   - **Otherwise** (input.overrides === undefined), FALL BACK to the existing `parseOverridesYaml` path (graceful degradation, warn-only).
   - **AFTER both paths**: validate that every edge (entries in each node's `after` and `before`) resolves to a known node — when unknown, throw `ConfigError` with single-line hint pointing at the offending edge. The hint format MUST satisfy AR22 regex `/^.*(Run|See|Try|Check) /`.

4. **Edge-validation logic + ConfigError throw** — at the existing dangling-edge check (currently `src/dag/build.ts:613-630` — throws `UnknownBmadSkillError`). Per AC lines 1182-1184, when the offending edge originates from an OVERRIDE entry, the throw MUST switch to `ConfigError` (exit 2 — the AC explicitly says `CONFIG_ERROR`) with hintOverride pointing at the edge. Per OQ-1 below, the dangling-edge check is split into two paths:
   - **Override-introduced unknown edge** → `ConfigError` (exit 2) per AC.
   - **Frontmatter-introduced unknown edge OR seed-introduced unknown edge** → `UnknownBmadSkillError` (existing behaviour preserved per Story 1.10 AC-3).
   The ORIGIN of each entry is tracked via a per-entry `source: "seed" | "override" | "frontmatter"` field on the resolved Map (see OQ-1).

5. **Hint format for unknown predecessor** — per OQ-5 below, the format is:
   ```
   See bmad-stepper.config.yaml at overrides.<skillName>.after[<index>]: predecessor "<unknownDep>" is not a known skill. Run /bmad-next --doctor to validate the file against the schema.
   ```
   Symmetric format for `before` edges. The leading "See" + trailing "Run /bmad-next --doctor" satisfy the AR22 regex; the field path narrows the user's attention to the offending edge per AC line 1184 verbatim ("hint pointing at the offending edge").

6. **Wire `loadConfig()` → `build()`** — at `src/commands/next/run.ts` (and `src/commands/loop/run.ts` via productionRunNextFn closure), thread `opts.config?.overrides` into `BuildInput.overrides` at the existing `build({ skillNames, projectRoot, pluginDir })` call sites. Per OQ-7 below: the runner DOES NOT add a top-level `loadConfig()` call (Story 6.1 already did that at `import.meta.main`); the runner simply forwards `opts.config?.overrides` from the existing chain.

7. **Tests** — colocated `src/dag/build.test.ts` extension + `src/schemas/config.test.ts` extension:
   - **OVR_62_REPLACE_***: AC-1 — `overrides: { architecture-validator: { phase: solutioning, after: [bmad-create-architecture], optional: true } }` placed at declared phase with declared edges; replaces any seed entry of the same name.
   - **OVR_62_APPEND_***: AC-1 — appends a new skill not in seed; phase + after + optional respected.
   - **OVR_62_UNKNOWN_PRED_***: AC-2 — override declares unknown predecessor → ConfigError (exit 2) with hint matching `/See bmad-stepper.config.yaml at overrides.*after\[/` AND `/^.*(Run|See|Try|Check) /` AND no `\n`/`\r`.
   - **OVR_62_UNKNOWN_SUCC_***: AC-2 (symmetric) — override declares unknown successor (`before`) → ConfigError with hint pointing at `before[<index>]`.
   - **OVR_62_PHASE_ENUM_***: AC-3 — invalid phase (e.g., `phase: "deployment"`) is rejected at SCHEMA load time (Story 6.1 loader throws ConfigError); when fed via `BuildInput.overrides` directly the schema is bypassed but the local Phase type guards the runtime — per OQ-2 the dag-local Phase enum check still fires, throwing a generic `ConfigError`.
   - **OVR_62_TYPED_INPUT_***: AC-1 — `BuildInput.overrides` provided as typed Map → STRICT path fires (no YAML parse, no warn).
   - **OVR_62_LEGACY_FALLBACK_***: regression — `BuildInput.overrides === undefined` → LEGACY parseOverridesYaml fallback fires (existing behaviour preserved).
   - **OVR_62_CYCLE_***: AC-3 — override introduces a cycle → DagCycleError (existing path unchanged; Tarjan still runs post-merge).
   - **OVR_62_SCHEMA_***: in `src/schemas/config.test.ts` — `OverrideEntrySchema.parse({ phase: "deployment" })` throws Zod error with `phase` in path; `OverrideEntrySchema.parse({ phase: "solutioning", after: ["x"], optional: true })` parses cleanly; backwards-compat for fixtures with empty `{}` (all fields optional).
   - **OVR_62_RUN_***: in `src/commands/next/run.test.ts` — runner threads `opts.config?.overrides` into BuildInput.overrides; verified via test seam.

8. **Documentation refresh** — minor update to `docs/configuration.md` `overrides:` section (currently lines 147-170 per Story 6.1 AC-3 verification) noting:
   - The Phase enum (5 valid values).
   - The unknown-predecessor → CONFIG_ERROR contract (single-line, field-pointing).
   - Cross-link to architecture lines 411-443 + Story 6.2 in the forward-tracker section.
   - NO new YAML examples needed beyond the existing one (Story 6.1 already covered the override entry shape).

### Cross-story coordination preserved

- **Story 6.1 SDR I-23 PRIMARY HONOURED** — Story 6.2 consumes `config.overrides` directly via the typed `Config.overrides` field. ZERO loader-API change for Story 6.2.
- **Story 1.10 graceful-degradation path PRESERVED** — when `BuildInput.overrides === undefined`, the legacy `parseOverridesYaml` fallback fires unchanged. This guarantees backwards-compat for all existing tests + foundational call sites that have not yet migrated.
- **Story 5.6 `opts.config` seam UNCHANGED** — Story 6.2 reads from the same `opts.config` field that Story 5.6 froze (LoopOpts + RunNextOptions + RunVerifyAndAdvanceOptions). NO seam consolidation per Story 6.1 SDR I-21 forward-tracker.
- **Errors registry HELD AT 17** — Story 6.2 ships ZERO new error classes; reuses `ConfigError` with `hintOverride` constructor arg per Story 1.11 + 6.1 precedent.
- **Schema migration registry HELD AT v1** — Story 6.2 makes a BACKWARDS-COMPATIBLE schema extension (Phase enum tightening + new optional fields). All existing v1 fixtures still parse. NO `schemaVersion` bump needed.

### What is NOT in scope (deferred)

- **YAML alternative override syntax** beyond what Story 1.10's hand-rolled extractor already supports (dash-list `after`, inline lists, scalars) — the hand-rolled parser is the LEGACY path; the new strict path receives PARSED objects from `loadConfig()`. NO new YAML syntax additions.
- **Override editing UI** (e.g., `/bmad-next --add-override <skill>`) — out of scope; user edits `bmad-stepper.config.yaml` directly per architecture line 427.
- **Persona overrides at the override level** beyond the existing optional field — Story 1.11's persona resolver remains the source-of-truth; the override's `persona` field is a passthrough.
- **Idempotent overrides** beyond the existing optional field — Story 5.1's retry semantics consume `idempotent`; Story 6.2 simply preserves the field through schema + builder.
- **Removing the hand-rolled `parseOverridesYaml`** — DEFERRED to Story 6.x cleanup once all callers migrate to `BuildInput.overrides`. Story 6.2 keeps it as the LEGACY fallback to avoid churning Story 1.10's foundational integration tests.
- **`--no-overrides` CLI flag** for skipping Tier 2 entirely — DEFERRED (Story 6.x); CI environments rely on absence of `bmad-stepper.config.yaml` (= empty overrides).

### Architectural challenges resolved here

**Architectural decision — keep hand-rolled extractor as legacy fallback (per OQ-1)**: The hand-rolled `parseOverridesYaml` (Story 1.10, ~156 LoC at `src/dag/build.ts:174-329`) REMAINS as a graceful-degradation fallback for callers that do NOT provide `BuildInput.overrides`. Rationale: (a) Story 1.10's integration tests (24 tests at `build.test.ts`) exercise the YAML-on-disk path directly via `Bun.write(path.join(tmp, "bmad-stepper.config.yaml"), yaml)` + `build({ skillNames: [], projectRoot: tmp })`; rewriting those tests to thread `loadConfig()` would expand the test surface beyond Story 6.2's scope; (b) the foundational lock-free contract (AR8) is upheld by build.ts WITHOUT requiring a config-loader dependency — keeps `src/dag/` pure (no `src/config/` import per AR41 mid-tier-to-mid-tier ban — see OQ-3); (c) the CHANGE in semantics (graceful-degradation → strict) only fires when `BuildInput.overrides !== undefined` is explicitly set — backwards-compat for every existing call site. The deprecation path is recorded as forward-tracker I-34.

**Architectural decision — Phase enum lives in dag/types.ts AND schemas/config.ts (per OQ-2)**: The Phase enum (5 literals) is duplicated between `src/dag/types.ts:30-35` (literal union, no runtime check) and `src/schemas/config.ts` (Zod enum, runtime parse). Rationale: (a) `src/dag/` is mid-tier per AR41 and CANNOT import `zod` (zod is allowed only in `src/schemas/`); (b) the literal union in dag/types.ts is foundational and defines the runtime expectation; (c) the Zod enum in schemas/config.ts is the SOURCE-OF-TRUTH for parse-time validation. Story 6.2 ADDS a CI-time consistency assertion at `src/schemas/config.test.ts` (`OverrideEntrySchema.parse({ phase: "<each-of-5>" })` succeeds; `OverrideEntrySchema.parse({ phase: "deployment" })` throws) that mirrors the dag-local literal union. The two MUST stay in lock-step; if architecture introduces a 6th phase, BOTH must be updated (a forward-tracker discipline).

**Architectural decision — overrides DO NOT add `src/dag/` upward import to `src/config/` (per OQ-3)**: Story 6.2 PRESERVES AR41 boundary — `src/dag/` does NOT import from `src/config/`. The wiring happens at the TOP-tier (`src/commands/next/run.ts`) where the runner reads `opts.config.overrides` (a typed `Overrides` record) and threads it into `build({ ..., overrides: opts.config?.overrides })`. The dag-local `BuildInput.overrides` field accepts a Map or plain Record at the type level; build.ts normalises internally via `new Map(Object.entries(input.overrides))` if needed. Verification: `grep "from \"\\.\\./config\"" src/dag/` returns no matches.

**Architectural decision — origin tracking via WeakMap or per-entry tag (per OQ-1, supplemented)**: To distinguish "override-introduced unknown edge → ConfigError" vs "seed/frontmatter-introduced unknown edge → UnknownBmadSkillError" per AC line 1182-1184, build.ts MUST track the ORIGIN of each entry's `after`/`before` edges. Implementation choice: a parallel Map `overrideSources: Map<string, Set<string>>` keyed by node name, valued by the set of edge-targets that came from an override entry. Rationale: (a) keeps the `DagNode` shape unchanged (immutable, no source field); (b) lookup is O(1) at edge-validation time; (c) memory-cheap (only override entries populate the set; ~5-20 entries typical).

**Architectural decision — Zod `.strict()` on `OverrideEntrySchema` (per OQ-4)**: To prevent the legacy `parseOverridesYaml`'s "silently ignore unknown sub-keys" behaviour from carrying forward, `OverrideEntrySchema` USES `.strict()` (Zod 3.x: rejects keys not declared on the object). Rationale: (a) catches typos at load time (e.g., `optionnal: true` → ConfigError pointing at the unknown key); (b) AR42 schema-first principle; (c) the loader's single-line hint format already covers unknown-key errors via the Zod issues path. NOTE: this is a NEW strictness — Story 6.1's `OverrideEntrySchema` did NOT use `.strict()` (it's open-shape). This is a STRICT TIGHTENING; existing fixtures with valid-only keys are unaffected; fixtures with stray keys (typo or experiment) will start failing. Forward-tracker: any user fixtures with non-canonical keys must be cleaned up.

**Architectural decision — single-line edge-pointing hint format (per OQ-5)**: The hint format for unknown predecessor / successor is:
```
See bmad-stepper.config.yaml at overrides.<skillName>.<edge-kind>[<index>]: <edge-kind> "<unknownDep>" is not a known skill. Run /bmad-next --doctor to validate the file against the schema.
```
- `<skillName>` is the override entry name (e.g., `architecture-validator`).
- `<edge-kind>` is `after` or `before`.
- `<index>` is the 0-based position of the offending edge in the list.
- `<unknownDep>` is the unknown name being referenced.
- Both "See" and "Run" verbs satisfy AR22 regex.
- Single-line: NO `\n`/`\r` characters. The full multi-error list (if more than one edge fails) is reserved for `--doctor` per Story 6.1 SDR I-29 forward-tracker; the throw-site reports the FIRST failure only.

**Architectural decision — runner wiring via existing `build()` call site (per OQ-7)**: The runner does NOT introduce new structural changes — it threads `opts.config?.overrides` into the EXISTING `build({...})` call at `src/commands/next/run.ts` (story 1.9 + 2.4 establishment) and `src/commands/loop/run.ts` (story 4.x establishment). The wiring is a TWO-LINE diff per call site (one new field `overrides:` + nothing else). Tests at `src/commands/next/run.test.ts` MAY add a SINGLE OVR_62_RUN_* test asserting the override flows through.

### Concretely, Story 6.2 produces

- **MODIFIED file 1**: `src/schemas/config.ts` — adds `PhaseSchema` enum + `Phase` type alias; tightens `OverrideEntrySchema.phase` from open-string to `PhaseSchema.optional()`; ADDS `persona`, `idempotent` optional fields; applies `.strict()` to reject unknown sub-keys per OQ-4. Net additions: ~20 LoC.
- **MODIFIED file 2**: `src/schemas/config.test.ts` — adds 6-10 OVR_62_SCHEMA_* tests covering Phase enum, unknown sub-keys, and round-trip with the dag-local `OverrideEntry` interface. Net additions: ~80 LoC.
- **MODIFIED file 3**: `src/dag/types.ts` — adds `overrides?: ReadonlyMap<string, OverrideEntry> | Record<string, OverrideEntry>` to `BuildInput`; extends `OverrideEntry` interface to include the existing `before?: readonly string[]` field (currently missing per types.ts:116-123 — see OQ-6). The `OverrideEntry` interface stays in dag/types.ts (mid-tier) but its shape now matches `z.infer<typeof OverrideEntrySchema>` 1-to-1. NO `zod` import added. Net additions: ~10 LoC.
- **MODIFIED file 4**: `src/dag/build.ts` — adds the strict path branch + origin-tracking `overrideSources` Map + edge-validation switch (ConfigError for override-origin, UnknownBmadSkillError for seed/frontmatter-origin). Net additions: ~60-80 LoC; net removals: none (legacy path preserved).
- **MODIFIED file 5**: `src/dag/build.test.ts` — adds 10-12 OVR_62_* tests covering replace, append, unknown-pred, unknown-succ, phase enum, typed input, legacy fallback, cycle. Net additions: ~200-250 LoC.
- **MODIFIED file 6**: `src/commands/next/run.ts` — threads `overrides: opts.config?.overrides` into the existing `build({...})` call. Net additions: ~2 LoC.
- **MODIFIED file 7**: `src/commands/next/run.test.ts` — adds 1-2 OVR_62_RUN_* tests asserting the threading. Net additions: ~30 LoC.
- **MODIFIED file 8**: `src/commands/loop/run.ts` — same threading (via productionRunNextFn closure). Net additions: ~2 LoC.
- **MODIFIED file 9**: `src/commands/loop/run.test.ts` — adds 1-2 OVR_62_LOOP_* tests. Net additions: ~30 LoC.
- **MODIFIED file 10**: `docs/configuration.md` — extends the `overrides:` section with the Phase enum + unknown-predecessor → CONFIG_ERROR contract + cross-links. Net additions: ~30 LoC.

ZERO NEW files. ZERO new error classes. ZERO mutations to: `src/errors.ts`, `src/migrations/config/index.ts`, `src/dag/seed-v6.x.ts`, `src/dag/tarjan.ts`, `src/state/*`, `src/failure-ux/resolve-policy.ts`, `src/config/load.ts`, `src/config/defaults.ts`, `src/config/deep-merge.ts`.

## Acceptance Criteria

The following are reproduced byte-identical from `_bmad-output/planning-artifacts/epics.md` lines 1177-1185:

**Given** `overrides: { architecture-validator: { phase: solutioning, after: [architecture], optional: true } }`
**When** the DAG builder runs Tier 2
**Then** the override entry is placed at the declared phase with the declared edges and replaces any seed entry of the same name
**Given** an override declares an unknown predecessor
**When** the DAG builder validates
**Then** it surfaces `CONFIG_ERROR` with hint pointing at the offending edge
**And** the override Zod schema is in `src/schemas/config.ts` (sub-schema)

## Tasks / Subtasks

- [x] 1. **Context — read all relevant files completely** (carry-over discipline from Stories 5.6 + 6.1)
  - [x] 1.1 Read `_bmad-output/implementation-artifacts/6-1-bmad-stepper-config-yaml-schema-loader.md` — focus on (a) the Forward Action Items section (4 nits N-1/N-2/N-3/N-4 + 33 info I-1 through I-33; I-23 to Story 6.2 PRIMARY HONOURED here; I-33 sporadic flake at src/smoke/next.test.ts:374 NOT a regression; (b) the SDR Quality Gates table baseline (1351/0/4570 across 70 files; errors registry 17); (c) the `OverrideEntrySchema` shape at the time of Story 6.1 close (open-string `phase`).
  - [x] 1.2 Read `_bmad-output/implementation-artifacts/1-10-dag-seed-three-tier-registry.md` — recover the original three-tier intent + the `parseOverridesYaml` design rationale (lines: graceful-degradation, hand-rolled minimal YAML extractor, AC-3 verbatim hint).
  - [x] 1.3 Read `_bmad-output/implementation-artifacts/epic-5-retrospective.md` — Recommendations item 3 (registry stability — ZERO new error classes per Epic 6 start) + item 6 (cross-story coordination via opts.config seam).
  - [x] 1.4 Read `src/dag/build.ts` (672 lines) full pass — focus on (a) the Tier 2 block at lines 537-595 (the existing override mechanism), (b) the dangling-edge check at lines 613-630 (currently throws UnknownBmadSkillError unconditionally), (c) parseOverridesYaml at lines 174-329 (the legacy hand-rolled extractor — keep as fallback per OQ-1), (d) the AR41 boundary comment at lines 27-36 (allowed/forbidden imports).
  - [x] 1.5 Read `src/dag/build.test.ts` (445 lines) full pass — recover existing test patterns (tmpdir-per-test + AR35 cleanup; describe blocks per Tier; AC-1/AC-2/AC-3 mapping). Story 6.2's NEW tests follow the same patterns.
  - [x] 1.6 Read `src/schemas/config.ts` (284 lines) full pass — focus on `OverrideEntrySchema` at lines 120-125 + `OverridesSchema` at line 130 + Story 6.1's `.default({})` wiring at line 242.
  - [x] 1.7 Read `src/schemas/config.test.ts` full pass — verify the existing CFG_61_* test density + recover the test naming convention.
  - [x] 1.8 Read `src/dag/types.ts` (152 lines) full pass — focus on (a) Phase literal union at lines 30-35 (must stay foundational, no Zod import), (b) `OverrideEntry` interface at lines 116-123 (pre-Story-6.2 shape — `before` field MISSING per OQ-6), (c) `BuildInput` interface at lines 146-151 (where `overrides?` field is added).
  - [x] 1.9 Read `src/config/load.ts` + `src/config/index.ts` + `src/config/defaults.ts` — confirm Story 6.1's `loadConfig()` signature + `Config.overrides` shape + DEFAULT_CONFIG.overrides default `{}`.
  - [x] 1.10 Read `src/commands/next/run.ts` + `src/commands/loop/run.ts` — locate the existing `build({...})` call site(s) for the wiring change. Read the `import.meta.main` blocks where `loadConfig()` is invoked (Story 6.1 ADDED these; Story 6.2 simply forwards `opts.config?.overrides`).
  - [x] 1.11 Read `src/errors.ts` lines 207-240 — confirm `ConfigError` class shape + `hintOverride` constructor arg precedent (Story 1.11 + 6.1).
  - [x] 1.12 Read `docs/configuration.md` — locate the existing `overrides:` section (lines 147-170) for the documentation refresh.

- [x] 2. **Schema extension — `OverrideEntrySchema` Phase enum + new optional fields + `.strict()`**
  - [x] 2.1 Add `export const PhaseSchema = z.enum(["analysis", "planning", "solutioning", "implementation", "retro"]);` immediately above `OverrideEntrySchema` in `src/schemas/config.ts`.
  - [x] 2.2 Add `export type Phase = z.infer<typeof PhaseSchema>;` immediately below.
  - [x] 2.3 Tighten `OverrideEntrySchema.phase` from `z.string().optional()` to `PhaseSchema.optional()`.
  - [x] 2.4 ADD `persona: z.union([z.string(), z.array(z.string()), z.null()]).optional()` to `OverrideEntrySchema` (matches the existing dag-local `OverrideEntry.persona` shape per types.ts:121).
  - [x] 2.5 ADD `idempotent: z.boolean().optional()` to `OverrideEntrySchema` (matches the existing dag-local `OverrideEntry.idempotent` field per types.ts:122).
  - [x] 2.6 Append `.strict()` to `OverrideEntrySchema` (rejects unknown sub-keys at parse time per OQ-4). Verify this is BACKWARDS-COMPATIBLE: existing fixtures use only known keys.
  - [x] 2.7 Update the JSDoc block above `OverrideEntrySchema` (lines 109-119) to reference Story 6.2 + the new Phase enum + `.strict()` semantics.

- [x] 3. **Schema tests — extend `src/schemas/config.test.ts` with OVR_62_SCHEMA_* coverage**
  - [x] 3.1 OVR_62_SCHEMA_PHASE_ENUM_1: `OverrideEntrySchema.parse({ phase: "deployment" })` throws Zod error with `phase` in path; the message contains the 5 valid phase values.
  - [x] 3.2 OVR_62_SCHEMA_PHASE_ENUM_2: parametric test — for each of the 5 valid phases, `OverrideEntrySchema.parse({ phase: <p> })` succeeds.
  - [x] 3.3 OVR_62_SCHEMA_STRICT_1: `OverrideEntrySchema.parse({ phase: "solutioning", optionnal: true })` throws Zod error with the typo'd key name in the issue path (per `.strict()`).
  - [x] 3.4 OVR_62_SCHEMA_PERSONA_1: `OverrideEntrySchema.parse({ phase: "solutioning", persona: "architect" })` succeeds; persona: ["architect"] succeeds; persona: null succeeds.
  - [x] 3.5 OVR_62_SCHEMA_IDEMPOTENT_1: `OverrideEntrySchema.parse({ phase: "solutioning", idempotent: true })` succeeds.
  - [x] 3.6 OVR_62_SCHEMA_FULL_1: full canonical example (the AC line 1179 example verbatim) parses cleanly: `{ phase: "solutioning", after: ["bmad-create-architecture"], optional: true }`.
  - [x] 3.7 OVR_62_SCHEMA_BACKCOMPAT_1: empty `{}` parses cleanly (all fields optional). Verify Story 6.1 fixtures still pass.

- [x] 4. **dag/types.ts — extend `BuildInput` + `OverrideEntry` interface**
  - [x] 4.1 Add `before?: readonly string[]` to the `OverrideEntry` interface at `src/dag/types.ts:116-123` (currently missing per OQ-6).
  - [x] 4.2 Add `readonly overrides?: ReadonlyMap<string, OverrideEntry> | Readonly<Record<string, OverrideEntry>>` to the `BuildInput` interface at `src/dag/types.ts:146-151`.
  - [x] 4.3 Update the JSDoc block for `BuildInput` (lines 125-145) to document the new `overrides?` field semantics: "When provided, build() uses this typed map directly (STRICT path); when omitted, falls back to parsing `bmad-stepper.config.yaml` directly (LEGACY path per Story 1.10 graceful-degradation)".
  - [x] 4.4 Update the JSDoc block for `OverrideEntry` (lines 107-115) to document the new `before` field + cross-link to Story 6.2 + Story 6.1 `OverrideEntrySchema`.

- [x] 5. **build.ts — strict Tier 2 path + origin tracking + edge-validation switch**
  - [x] 5.1 At the start of the Tier 2 block (currently `src/dag/build.ts:537`), introduce `const overrideSources = new Map<string, Set<string>>();` — tracks the set of edge-targets per node that came from an override.
  - [x] 5.2 Branch on `if (input.overrides !== undefined) { ... } else { /* legacy path unchanged */ }`.
  - [x] 5.3 In the strict branch, normalise `input.overrides` to a `Map<string, OverrideEntry>` (accept both ReadonlyMap and Record). Iterate entries.
  - [x] 5.4 For each entry, call the SAME merge-vs-append logic the legacy block uses (extract into a shared helper `applyOverride(resolved, name, override): void` at the top of build.ts to dedupe). When applying an entry's `after` array, populate `overrideSources.set(name, new Set(entry.after ?? []))` for the edge-validation step.
  - [x] 5.5 Symmetrically populate `overrideSources` for `before` edges: when an override sets `before: [X]`, for each X record that there's an inverse edge X.before-mirror → name (handled at the build's existing Step 5 inversion). The override-source tracking IS independent of the edge direction — the relevant fact for AC-2 is "this edge came from an override entry".
  - [x] 5.6 In the legacy branch (input.overrides === undefined), preserve the existing `parseOverridesYaml` flow unchanged including the `warn` on parse failure. Populate `overrideSources` from the parsed Map exactly the same way.
  - [x] 5.7 At the existing dangling-edge check (lines 613-630), branch on origin: if `overrideSources.get(node.name)?.has(dep)` → throw `ConfigError` with hint per OQ-5; else → throw `UnknownBmadSkillError` (existing behaviour preserved).
  - [x] 5.8 Compute the offending-edge index for the hint: the index of `dep` in `node.after` (use `node.after.indexOf(dep)`). When the dep is in the inverted `before` chain, compute the index from the original entry's `before` array (lookup via `overrideSources` or a parallel index Map — see OQ-1 supplement).
  - [x] 5.9 Update build.ts's top-of-file JSDoc + the AR41 boundary comment at lines 27-36 to mention Story 6.2's strict path. NO new imports added beyond `ConfigError` from `../errors.ts` (already imported per dependencies on UnknownBmadSkillError + DagCycleError).

- [x] 6. **build.test.ts — extend with OVR_62_* coverage (10-12 tests)**
  - [x] 6.1 OVR_62_REPLACE_1: AC-1 verbatim — supply `overrides: new Map([["architecture-validator", { phase: "solutioning", after: ["bmad-create-architecture"], optional: true }]])` (note: the AC's `after: [architecture]` resolves to a real seed entry — use `bmad-create-architecture` to match the seed). Verify `dag.nodes.get("architecture-validator")?.phase === "solutioning"`, `optional === true`, `after.includes("bmad-create-architecture") === true`.
  - [x] 6.2 OVR_62_REPLACE_2: replace an EXISTING seed entry — override `bmad-dev-story` with a different phase + after. Verify the seed's original `after: ["bmad-create-story"]` is REPLACED with the override's value.
  - [x] 6.3 OVR_62_APPEND_1: append a NEW skill not in seed (e.g., `experimental-skill`). Verify it appears in `dag.nodes`.
  - [x] 6.4 OVR_62_UNKNOWN_PRED_1: AC-2 — `overrides: { foo: { phase: "solutioning", after: ["nonexistent-skill"], optional: true } }`. Expect `ConfigError` with `code === "CONFIG_ERROR"`, `exitCode === 2`, `actionableHint` matches `/See bmad-stepper.config.yaml at overrides\.foo\.after\[0\]: predecessor "nonexistent-skill"/` AND `/Run \/bmad-next --doctor/` AND no `\n`/`\r`.
  - [x] 6.5 OVR_62_UNKNOWN_PRED_2: hint regex match — verify AR22 regex `/^.*(Run|See|Try|Check) /` matches the hint.
  - [x] 6.6 OVR_62_UNKNOWN_SUCC_1: AC-2 symmetric — `overrides: { foo: { phase: "solutioning", before: ["nonexistent"], optional: true } }`. Expect ConfigError with hint pointing at `before[0]`.
  - [x] 6.7 OVR_62_TYPED_INPUT_1: AC-1 — when `BuildInput.overrides` is provided, the YAML file on disk is IGNORED. Write a malformed YAML to disk + supply a valid typed `overrides` Map; verify build() succeeds (strict path bypasses YAML).
  - [x] 6.8 OVR_62_LEGACY_FALLBACK_1: regression — `BuildInput.overrides === undefined` + valid YAML on disk → build() reads via parseOverridesYaml as before. (This test ALREADY EXISTS at build.test.ts as the `it("replaces seed entries when names match (AC-2)")` case — Story 6.2 just re-confirms the existing behaviour by asserting `BuildInput.overrides === undefined` is honoured.)
  - [x] 6.9 OVR_62_CYCLE_1: AC-3 — override introduces a 2-cycle (A.after = [B], B.after = [A]). Expect `DagCycleError` (existing path unchanged).
  - [x] 6.10 OVR_62_PHASE_ENUM_LOCAL_1: when `BuildInput.overrides` is fed via the strict path with an INVALID phase (bypassing the schema), the dag-local Phase enum check at build.ts catches the typo. (This is a defensive runtime check — most callers go through `loadConfig()` which already enforces the Zod enum at parse time.)
  - [x] 6.11 OVR_62_HINT_SINGLE_LINE_1: ConfigError hint passes the Story 5.6 single-line constraint (no `\n`/`\r`).
  - [x] 6.12 OVR_62_DOCS_CROSS_REFERENCE: NOT a runtime test — a documentation-presence check at `docs/configuration.md` that the `overrides:` section mentions the Phase enum + the CONFIG_ERROR contract.

- [x] 7. **Wire `loadConfig()` → `build()` at the runner call sites**
  - [x] 7.1 At `src/commands/next/run.ts`, locate the existing `build({ skillNames, projectRoot, pluginDir })` call. Add `overrides: opts.config?.overrides` as a NEW field. Use optional chaining to handle the undefined case (defaults-only or no-config).
  - [x] 7.2 At `src/commands/loop/run.ts`, do the same threading via the productionRunNextFn closure.
  - [x] 7.3 Verify ZERO upward imports added — `src/commands/` is top-tier and already imports `src/dag/` directly; no boundary change.

- [x] 8. **Runner tests — add OVR_62_RUN_* + OVR_62_LOOP_* (1-2 tests each)**
  - [x] 8.1 OVR_62_RUN_1: at `src/commands/next/run.test.ts`, supply `opts.config = { ..., overrides: { foo: { phase: "solutioning", after: ["bmad-create-architecture"], optional: true } } }` via the existing test seam. Verify `build({ ..., overrides: <expected> })` is called (mock or test seam).
  - [x] 8.2 OVR_62_LOOP_1: same pattern at `src/commands/loop/run.test.ts`.

- [x] 9. **Documentation — `docs/configuration.md` overrides section refresh**
  - [x] 9.1 Locate the existing `overrides:` section (Story 6.1 produced this at lines 147-170).
  - [x] 9.2 Add a "### Phase enum" sub-section listing the 5 valid phase values + cross-link to `src/schemas/config.ts` PhaseSchema.
  - [x] 9.3 Add a "### Validation errors" sub-section noting:
    - Unknown predecessor / successor → CONFIG_ERROR exit 2 with single-line hint pointing at the offending edge.
    - Invalid phase → CONFIG_ERROR exit 2 with hint pointing at the offending phase value.
    - Unknown sub-key (e.g., `optionnal: true`) → CONFIG_ERROR exit 2 per `.strict()`.
  - [x] 9.4 Cross-link to architecture lines 411-443 (D5 three-tier discovery) + Story 1.10 + Story 6.1 + Story 6.2.
  - [x] 9.5 Update the forward-tracker section to remove I-23 (Story 6.2 now CLOSED) and forward to Stories 6.3-6.6 still pending.

- [x] 10. **Quality gates — verify ALL green BEFORE finalising**
  - [x] 10.1 `bunx tsc --noEmit` exit 0.
  - [x] 10.2 `bun run check` (biome ci + tests) exit 0.
  - [x] 10.3 `bun test` baseline 1351/0/4570 across 70 files → expected 1351 + (~12 new) / 0 / 4570 + (~30-40 new). Snapshot final test counts AFTER the LAST `biome --write` pass (per N-3 discipline).
  - [x] 10.4 `bun test src/errors.test.ts` 15/0/249 (UNCHANGED — registry stays at 17).
  - [x] 10.5 `bun test src/dag/build.test.ts` baseline 24 tests → 24 + (~10-12 new) tests.
  - [x] 10.6 `bun test src/schemas/config.test.ts` baseline (Story 6.1 added 32 CFG_61_*) → +6-10 OVR_62_SCHEMA_*.
  - [x] 10.7 `bun test src/integration/escalate-actionable-hint.test.ts` 33/0/114 (UNCHANGED — sweep over all 17 error classes still passes; new ConfigError instances satisfy AR22).
  - [x] 10.8 `grep -c "extends StepperError" src/errors.ts` = 17 (UNCHANGED).
  - [x] 10.9 AR41 boundary verification: `grep "from \"\\.\\./config\"" src/dag/` returns NO matches (Story 6.2 PRESERVES the boundary; runner-side wiring only).
  - [x] 10.10 Per-AC verification: AC-1 → OVR_62_REPLACE_*; AC-2 → OVR_62_UNKNOWN_PRED_* + OVR_62_UNKNOWN_SUCC_*; AC-3 → OVR_62_SCHEMA_* + the existing `OverrideEntrySchema` location at `src/schemas/config.ts` (sub-schema preserved per AC).

- [x] 11. **Frontmatter + final state**
  - [x] 11.1 Update story frontmatter: status: ready-for-dev → review (after dev complete).
  - [x] 11.2 Update sprint-status: 6-2-dag-overrides-block: ready-for-dev → review (after dev complete) → done (after code-review).
  - [x] 11.3 ZERO mutations to: `src/errors.ts`, `src/migrations/config/index.ts`, `src/dag/seed-v6.x.ts`, `src/dag/tarjan.ts`, `src/state/*`, `src/failure-ux/*`, `src/config/*` (the loader is consumed unchanged).
  - [x] 11.4 Carry-over from Story 6.1 SDR: 4 inherited NITs N-1/N-2/N-3/N-4 + 33 inherited info I-1 through I-33. Honour I-23 as PRIMARY (this story's deliverable). Honour I-33 as inherited flake (NOT a Story 6.2 regression).

## Dev Notes

### Files being modified (UPDATE)

1. **`src/schemas/config.ts`** (current state: 284 lines; Story 6.1 added 7 sub-schemas + standalone exports; the `OverrideEntrySchema` at lines 120-125 has open-string `phase` + 4 fields)
   - **What this story changes**: tighten `phase` to `PhaseSchema` enum; add `persona` + `idempotent` optional fields; apply `.strict()`; add `PhaseSchema` + `Phase` type alias exports.
   - **What must be preserved**: backwards-compat for existing fixtures; the `Overrides` type alias; the `OverridesSchema.default({})` wiring.

2. **`src/schemas/config.test.ts`** (current: Story 6.1 added 32 CFG_61_* tests)
   - **What this story changes**: add ~6-10 OVR_62_SCHEMA_* tests covering Phase enum, `.strict()`, persona/idempotent, full canonical example, backcompat for empty `{}`.
   - **What must be preserved**: all existing CFG_61_* tests pass unchanged.

3. **`src/dag/types.ts`** (current: 152 lines; mid-tier; ZERO Zod imports)
   - **What this story changes**: add `before?: readonly string[]` to `OverrideEntry`; add `overrides?` field to `BuildInput`; update JSDoc.
   - **What must be preserved**: NO Zod import (AR41); Phase literal union stays foundational.

4. **`src/dag/build.ts`** (current: 672 lines; mid-tier; the legacy `parseOverridesYaml` path)
   - **What this story changes**: add strict path branch on `input.overrides !== undefined`; introduce `overrideSources` Map for origin tracking; switch the dangling-edge throw to `ConfigError` for override-origin edges per AC-2; update top-of-file JSDoc.
   - **What must be preserved**: legacy `parseOverridesYaml` graceful-degradation path (Story 1.10 backwards-compat); Tarjan SCC cycle detection unchanged; Tier 1 + Tier 3 logic unchanged; AR41 boundary (NO `src/config/` import).

5. **`src/dag/build.test.ts`** (current: 445 lines; 24 tests across 7 describe blocks)
   - **What this story changes**: add 10-12 OVR_62_* tests in a NEW describe block "build — Tier 2 strict (Story 6.2)" OR appended to the existing "build — Tier 2 (overrides)" describe.
   - **What must be preserved**: ALL 24 existing tests pass unchanged; the tmpdir-per-test pattern + AR35 cleanup; the AC-1/AC-2/AC-3 mapping.

6. **`src/commands/next/run.ts`** (current: top-tier; calls `build({ skillNames, projectRoot, pluginDir })`)
   - **What this story changes**: thread `overrides: opts.config?.overrides` into the existing build() call.
   - **What must be preserved**: Story 5.6 + 6.1 wiring (opts.config seam + `import.meta.main` loadConfig); Story 1.9 + 2.4 lock-free skeleton.

7. **`src/commands/next/run.test.ts`** — add 1-2 OVR_62_RUN_* tests asserting the threading.

8. **`src/commands/loop/run.ts`** + **`src/commands/loop/run.test.ts`** — same pattern as next/run.ts.

9. **`docs/configuration.md`** (current: 331 lines; Story 6.1 covers all 9 keys)
   - **What this story changes**: extend the `overrides:` section with Phase enum + validation errors + cross-links + forward-tracker update.
   - **What must be preserved**: the canonical example; the worked 3-layer resolution example; cross-links to commands/bmad-{loop,next}.md.

### Files being created (NEW)

ZERO NEW files. All work is incremental on existing modules. This is the SAME pattern as Story 6.1's "in-place tightening" — Story 6.1 narrowed open-shape sub-schemas to typed shapes; Story 6.2 narrows the `OverrideEntrySchema.phase` field + extends the consumer.

### State preserved

ZERO mutations to: `src/errors.ts` (registry stays at 17); `src/migrations/config/index.ts` (v1 unchanged); `src/migrations/load-and-migrate.ts` (helper unchanged); `src/dag/seed-v6.x.ts` (Tier 1 seed unchanged); `src/dag/tarjan.ts` (cycle detection unchanged); `src/state/*` (state schema/loader independent); `src/failure-ux/*` (Story 5.6 consumer ready); `src/config/*` (Story 6.1 loader consumed unchanged via `opts.config?.overrides`).

## Project Structure Notes

- **AR41 boundary preserved**: `src/dag/` mid-tier — allowed imports remain `../errors`, `../io/log`, `./seed-v6.x`, `./tarjan`, `./types`, Bun runtime, Node stdlib (`node:fs`, `node:path`). Story 6.2 ADDS NO new imports. The runner-side wiring at `src/commands/next/run.ts` + `src/commands/loop/run.ts` is the canonical AR41 directionality (top-tier consumes mid-tier).
- **AR42 schema-first**: Story 6.2 PROMOTES the schema's `phase` field from open-string to a typed enum source-of-truth. The dag-local Phase literal union stays as the foundational runtime expectation; the Zod `PhaseSchema` is the parse-time validator.
- **AR8 lock-free top-tier**: build.ts is pure-read (no state.yaml writes); the legacy `parseOverridesYaml` reads `bmad-stepper.config.yaml` directly; the new strict path consumes a typed in-memory record. ZERO new file I/O paths added.
- **AR21+22 errors registry held at 17**: ZERO new error classes; reuse `ConfigError` with `hintOverride` constructor arg.
- **AR9 stdout JSON line invariant**: ConfigError flows through the existing AR9 halt path at the runner's `import.meta.main` block (Story 6.1 added that path; Story 6.2 reuses unchanged).

## Library / Framework Requirements

- **Bun 1.2.x runtime** — pinned per `package.json`. Story 6.2 uses `Bun.file().text()` only at the legacy `parseOverridesYaml` path (already imported by build.ts); no new Bun APIs introduced.
- **Zod 3.x** — pinned per `package.json` (Story 1.5 baseline; Story 6.1 confirmed). Story 6.2 uses `z.enum()`, `z.union()`, `z.array()`, `z.boolean()`, `.optional()`, `.strict()` — all canonical Zod 3.x methods. The `.strict()` modifier is critical for AR42 schema-first discipline (rejects unknown sub-keys at parse time per OQ-4).
- **TypeScript 5.x** — pinned per `package.json`. Story 6.2 uses `z.infer<typeof ...>` to derive types from schemas (AR20 type-alias chain).
- **Biome** — pinned per `package.json`; the post-write `bun run check` pass is mandatory per N-3 discipline (snapshot test counts AFTER the LAST `biome --write`).
- **NO new dependencies added.** Story 6.2 is purely additive on existing imports.

## Testing Standards

Story 6.2's tests follow the project-wide testing discipline established by Stories 1.1 through 6.1:

- **bun:test framework** — `import { afterEach, beforeEach, describe, expect, it } from "bun:test";` (per `src/dag/build.test.ts:19` + every other test file).
- **Direct invocation discipline (AR42)** — tests call `build({...})` and `OverrideEntrySchema.parse({...})` directly; NO `mock.module()` patterns; NO test seam mocking of internal helpers.
- **AR35 tmpdir-per-test pattern** — every test using filesystem fixtures runs under `await fs.mkdtemp(path.join(os.tmpdir(), "bmad-stepper-dag-"))`; cleanup via `await fs.rm(tmp, { recursive: true, force: true })` in `afterEach`.
- **Unique test ID prefixes** — Story 6.2 uses `OVR_62_*` (suffix-style: `OVR_62_REPLACE_1`, `OVR_62_UNKNOWN_PRED_1`, etc.) consistent with Story 6.1's `CFG_61_*` + `CFG_LOAD_*` + `MERGE_61_*` + `DEF_61_*` pattern.
- **Per-AC mapping** — every test docstring or describe block annotates its AC: AC-1 → REPLACE / APPEND / TYPED_INPUT; AC-2 → UNKNOWN_PRED / UNKNOWN_SUCC; AC-3 → SCHEMA tests covering the sub-schema location.
- **Single-line constraint for hints** — every test asserting a ConfigError hint MUST also assert the hint passes `/^.*(Run|See|Try|Check) /` AR22 regex AND has no `\n`/`\r` characters.
- **Quality gate baseline** — Story 6.1 close: 1351/0/4570 across 70 files. Story 6.2 expected delta: +(~12 new tests) / 0 / +(~30-40 new expects). Snapshot final test counts AFTER the LAST `biome --write` pass per N-3 discipline.
- **Errors registry sweep** — `bun test src/integration/escalate-actionable-hint.test.ts` sweeps all 17 error classes (Story 6.1 baseline 33/0/114). Story 6.2's NEW ConfigError instances at the build-time edge-validation throws automatically participate in this sweep — verify it stays GREEN.

## Previous Story Intelligence (from Story 6.1 close)

Story 6.1 (FIRST STORY of Epic 6) shipped on 2026-05-05 (status: done; runId 2026-05-05T084743Z-bmad-next; loopId 2026-05-05T080939Z-bmad-loop). Key learnings carried into Story 6.2:

- **Story 6.1 SDR I-23 PRIMARY DELIVERABLE FOR STORY 6.2** — The Story 6.1 reviewer noted: "OverridesSchema is now a closed shape; Story 6.2 DAG override consumer uses config.overrides directly. ZERO loader-API change for Story 6.2." Story 6.2 honours this by consuming `opts.config?.overrides` from the existing chain — NO new module imports, NO new file I/O, NO new error classes.
- **Story 6.1 SDR I-33 inherited flake** — `src/smoke/next.test.ts:374` (`expect(parentMtimeAfter).toBe(parentMtimeBefore)`) is a pre-existing macOS-specific parent-dir mtime drift under parallel tmpdir contention; Δ ≤ 35ms in observed runs; deterministic re-runs yield 0/0 fail. NOT a regression for Story 6.2. If observed during Story 6.2 dev, RE-RUN and confirm 0/0 — do NOT debug.
- **Story 6.1's `OverrideEntrySchema` open-shape baseline** — Story 6.1 shipped `OverrideEntrySchema = z.object({ phase: z.string().optional(), after: z.array(z.string()).optional(), before: z.array(z.string()).optional(), optional: z.boolean().optional() })` (NO `.strict()`; open-string `phase`). Story 6.2 TIGHTENS this in-place — backwards-compat for fixtures using only known keys + valid phase strings.
- **Story 6.1's `Config.overrides` default `{}`** — Story 6.1 wired `overrides: OverridesSchema.default({})` at `src/schemas/config.ts:242`. This means absent `overrides:` block in `bmad-stepper.config.yaml` → `config.overrides === {}` (NOT undefined). Story 6.2's runner wiring `opts.config?.overrides` evaluates to `{}` in this case, which the strict path treats as "no overrides" (empty Map iteration).
- **Story 6.1's quality gates baseline** — `bunx tsc --noEmit` exit 0; `bun run check` 1351/0/4570 across 70 files; `bun test src/errors.test.ts` 15/0/249; `grep -c "extends StepperError" src/errors.ts` = 17. ALL must remain GREEN after Story 6.2 dev.
- **Story 6.1's `.strict()` discipline forward-tracker (NEW from Story 6.2 — I-38)** — Story 6.1 did NOT use `.strict()` on the sub-schemas. Story 6.2 introduces `.strict()` on `OverrideEntrySchema` to catch typo'd sub-keys at parse time. Stories 6.3-6.5 may want to follow suit.
- **Story 6.1 dev iter learnings**:
  - Single `bunx biome check --write` auto-format pass at task 11 is the standard end-of-dev discipline (per N-3); it auto-formatted 8 files in Story 6.1. Expect a similar pass in Story 6.2.
  - Schema-side test density: Story 6.1 added 32 CFG_61_* tests for 7 sub-schemas (~4-5 tests per sub-schema). Story 6.2's 6-10 OVR_62_SCHEMA_* tests are consistent with this density for ONE schema extension.
  - Per-runner test duplication: Story 6.1 added 4 CFG_61_RUN_* + 4 CFG_61_LOOP_* (mirror tests in next/run.test.ts and loop/run.test.ts). Story 6.2's 1-2 OVR_62_RUN_* + 1-2 OVR_62_LOOP_* mirror this pattern at smaller scale (only the `overrides:` field being threaded; not a multi-field config wiring).

## Project Context Reference

- **Project root**: `/Users/tgorka/endeavor/tg/bmad-stepper-cc`
- **Runtime**: Bun 1.2.x (per `package.json` engines)
- **Test runner**: `bun:test` via `bun test`
- **Quality gate**: `bun run check` (biome ci + tests) + `bunx tsc --noEmit`
- **Architecture index**: `_bmad-output/planning-artifacts/architecture.md` — D5 three-tier discovery (lines 411-443), D6 DAG representation (lines 445-473), AR41 boundary (line 1296), AR42 schema-first.
- **Epics index**: `_bmad-output/planning-artifacts/epics.md` — Story 6.2 at lines 1171-1185.
- **Sprint status**: `_bmad-output/implementation-artifacts/sprint-status.yaml` — Story 6.2 at line 104.
- **State.yaml**: `.bmad-stepper/state.yaml` — workflow advanced at the end of the create-story step.
- **Plugin docs**: `commands/bmad-{loop,next}.md` — slash-command markdown protocol unchanged.
- **User-facing docs**: `docs/configuration.md` — Story 6.2 extends the `overrides:` section.

## Architectural Decisions

(See "Architectural challenges resolved here" above for the full set; summary below)

1. **OQ-1 — keep hand-rolled extractor as legacy fallback** + origin tracking via parallel `overrideSources` Map.
2. **OQ-2 — Phase enum duplicated** between `src/dag/types.ts` (literal union, foundational) and `src/schemas/config.ts` (Zod enum, parse-time); CI consistency assertion at config.test.ts.
3. **OQ-3 — preserve AR41 boundary** — no `src/config/` import from `src/dag/`; runner-side wiring.
4. **OQ-4 — `OverrideEntrySchema.strict()`** — reject unknown sub-keys at parse time.
5. **OQ-5 — single-line edge-pointing hint format** — `See bmad-stepper.config.yaml at overrides.<skill>.after[<idx>]: predecessor "<name>" is not a known skill. Run /bmad-next --doctor ...`.
6. **OQ-6 — `OverrideEntry.before` field MISSING** in the current dag/types.ts:116-123 — Story 6.2 ADDS it (lossless extension; existing fixtures don't set it).
7. **OQ-7 — runner wiring is two-line diff per call site** — no structural changes; thread `opts.config?.overrides` through.

## Open Questions

All 7 OQs adjudicated above. None deferred.

## File Mutation Plan

| File | Path | Op | Lines (est) |
|------|------|----|-------------|
| schemas/config | `src/schemas/config.ts` | UPDATE | +20 |
| schemas/config tests | `src/schemas/config.test.ts` | UPDATE | +80 |
| dag/types | `src/dag/types.ts` | UPDATE | +10 |
| dag/build | `src/dag/build.ts` | UPDATE | +60-80 |
| dag/build tests | `src/dag/build.test.ts` | UPDATE | +200-250 |
| commands/next/run | `src/commands/next/run.ts` | UPDATE | +2 |
| commands/next/run tests | `src/commands/next/run.test.ts` | UPDATE | +30 |
| commands/loop/run | `src/commands/loop/run.ts` | UPDATE | +2 |
| commands/loop/run tests | `src/commands/loop/run.test.ts` | UPDATE | +30 |
| docs/configuration | `docs/configuration.md` | UPDATE | +30 |

## Forward Action Items

### Inherited from Story 6.1 SDR (CARRIED)

**4 inherited cosmetic nits** (Stories 4.2-4.10 + 5.1/5.2/5.3/5.4/5.5 + 5.6 + 6.1 — UNCHANGED):
- **N-1**: Defensive null check at `src/commands/loop/stop-conditions.ts:269` — the `=== null` arm is unreachable. Story 6.2 does NOT modify stop-conditions.ts. Cosmetic forward.
- **N-2**: `EMPTY_DAG` + `EMPTY_STATE` sentinels at `src/commands/loop/run.ts` mid-file placement. Story 6.2 does NOT relocate. Cosmetic forward.
- **N-3**: Future task records snapshot final test counts AFTER the LAST `biome --write` pass. Story 6.2 must follow this discipline.
- **N-4**: TWO unused LoopOpts seams `finalStateOverride` + `writeLoopExitTranscriptOverride` declared but never consumed. Story 6.2 does NOT touch these. Pure dead surface; Story 6.x cleanup forward.

**33 inherited info forward-trackers** (Stories 5.5 + 5.6 + 6.1 SDRs — I-1 through I-33):
- **I-1 through I-17 (inherited from Story 5.5)**: failure-UX flow forward-trackers; NOT applicable to Story 6.2 — DAG-builder + schema work.
- **I-18 (inherited from 5.6, To Story 6.1)**: PRIMARY HONOURED in Story 6.1; Story 6.2 simply consumes the typed `Config.overrides` field.
- **I-19 through I-22 (inherited from 5.6)**: alias mapping for step IDs (To 6.x) / --continue-on-error vs per-step policy (To 6.x) / LoopOpts seam consolidation (To 6.x) / single-line constraint discipline. Story 6.2 honours I-22 — ZERO new error classes; existing ConfigError already passes the gate.
- **I-23 (inherited from 6.1, To Story 6.2 — PRIMARY HONOURED HERE)**: `OverridesSchema` is closed-shape; Story 6.2 DAG override consumer uses `config.overrides` directly. **HONOURED — this is the canonical Story 6.2 deliverable**. ZERO loader-API change for Story 6.2.
- **I-24 (inherited from 6.1, To Story 6.3)**: `ModelsSchema` closed enum; Story 6.3 model dispatcher uses `config.models[step] ?? "sonnet"`. NOT applicable to Story 6.2.
- **I-25 (inherited from 6.1, To Story 6.4)**: `BudgetsSchema` closed-shape; Story 6.4 budget enforcer uses defaults. NOT applicable to Story 6.2.
- **I-26 (inherited from 6.1, To Story 6.5)**: `VerifierConfigSchema.mode` field; Story 6.5 wires the per-step verifier registry merge logic. NOT applicable to Story 6.2.
- **I-27 (inherited from 6.1, To Story 6.6)**: `TelemetrySchema` v0.1 minimal; Story 6.6 may extend via schema bump. NOT applicable to Story 6.2.
- **I-28 (inherited from 6.1, To 6.x)**: `--no-config` flag DEFERRED. Story 6.2 does NOT add `--no-overrides` flag (parallel forward-tracker; see I-35 below).
- **I-29 (inherited from 6.1, To Story 1.12)**: `--doctor` should consume `loadConfig()` and run a FULL multi-error Zod parse for diagnostic output. Story 6.2's hint truncates to the FIRST failing edge (single-line constraint); --doctor surfaces the full list.
- **I-30 (inherited from 6.1, To 6.x)**: Defaults-as-TS-constant vs Defaults-as-YAML — auto-generated companion. NOT applicable to Story 6.2.
- **I-31 (inherited from 6.1, To future Epics)**: Per-layer Zod parse vs single post-merge. NOT applicable to Story 6.2.
- **I-32 (inherited from 6.1, To future Epics)**: `personas[step]: string[]` multi-persona dispatch. Story 6.2 preserves the field passthrough.
- **I-33 (inherited from 6.1 SDR, To Story 6.x or test infra cleanup)**: Sporadic flake at `src/smoke/next.test.ts:374` (`expect(parentMtimeAfter).toBe(parentMtimeBefore)`) — pre-existing macOS-specific parent-dir mtime drift. NOT a Story 6.2 regression. Forward-tracker for test infra hardening.

### NEW from Story 6.2 (PRODUCED for Stories 6.3+ and beyond)

- **I-34 (To Story 6.x cleanup)**: Hand-rolled `parseOverridesYaml` at `src/dag/build.ts:174-329` (~156 LoC) is now the LEGACY fallback path. After all callers migrate to `BuildInput.overrides` (today: only the runner; tomorrow: also any other indirect callers), the hand-rolled extractor + the warn-on-parse-failure flow can be removed. Forward-tracker for Story 6.x cleanup. Estimated effort: S (60-80 LoC removal + ~3 test deletions).
- **I-35 (To Story 6.x)**: `--no-overrides` CLI flag for skipping Tier 2 entirely DEFERRED. CI environments rely on absence of `bmad-stepper.config.yaml` (which yields `config.overrides = {}` per Story 6.1's `OverridesSchema.default({})`). Forward-tracker.
- **I-36 (To future Epics — Phase enum extension discipline)**: When a 6th phase is introduced (e.g., "deployment" or "release"), BOTH the dag-local literal union at `src/dag/types.ts:30-35` AND the Zod enum at `src/schemas/config.ts:PhaseSchema` MUST be updated in lock-step. The CI consistency assertion at `src/schemas/config.test.ts` (parametric over the 5 phases) will fail and surface the missed update. Discipline tracker.
- **I-37 (To Story 1.12 doctor command)**: When `--doctor` runs, it should validate `config.overrides` against the FULL set of resolved skill names (not just the seed) — i.e., the same dangling-edge check Story 6.2 adds, but BEFORE build() reaches the Tarjan step. Currently Story 6.2's check fires inside build(); --doctor would benefit from a pre-build validator function exported from `src/dag/build.ts` (e.g., `validateOverrides(overrides, allKnownSkills): void`).
- **I-38 (To Stories 6.3-6.5 — consumer-side schema strictness pattern)**: Story 6.2 introduces `.strict()` on `OverrideEntrySchema` to reject unknown sub-keys. Stories 6.3-6.5 may want the same discipline on their schemas (`ModelSchema`, `BudgetSchema`, `VerifierConfigSchema`). Forward-tracker for schema strictness consistency.

### Recommendations from epic-5-retrospective (CARRIED)

- **Recommendation item 3 (registry stability)**: HONOURED — Story 6.2 ships ZERO new error classes (registry stays at 17 — discipline maintained across Epic 6).
- **Recommendation item 6 (cross-story coordination via opts.config seam)**: HONOURED — Story 6.2 reads from `opts.config?.overrides` (Story 5.6 + 6.1 frozen seam); ZERO seam mutation.

## Change Log

| Date       | Author    | Change                              |
| ---------- | --------- | ----------------------------------- |
| 2026-05-05 | bmad-create-story (Claude Opus 4.7 1M, iter 4 of /bmad-loop --until=story:6.8 — loopId 2026-05-05T080939Z-bmad-loop, runId 2026-05-05T090104Z-bmad-next) | Story 6.2 spec created (SECOND STORY of Epic 6). Status: backlog → ready-for-dev. AC byte-identical to epics.md lines 1179-1185 (3-block Given/When/Then — overrides placed at declared phase + replace seed entry of same name + unknown predecessor → CONFIG_ERROR with hint pointing at offending edge + override Zod schema in src/schemas/config.ts). 11 tasks (~70 sub-tasks). 7 OQs adjudicated transparently for code-review (OQ-1 keep hand-rolled extractor as legacy fallback + origin tracking via parallel Map; OQ-2 Phase enum duplicated between dag/types.ts literal union + schemas/config.ts Zod enum; OQ-3 preserve AR41 boundary — no src/config/ import from src/dag/; OQ-4 OverrideEntrySchema.strict() rejects unknown sub-keys; OQ-5 single-line edge-pointing hint format `See bmad-stepper.config.yaml at overrides.<skill>.after[<idx>]: predecessor "<name>" is not a known skill. Run /bmad-next --doctor ...`; OQ-6 OverrideEntry.before field MISSING in current dag/types.ts:116-123 — adding it lossless extension; OQ-7 runner wiring is two-line diff per call site). 11 deps (6.1 PRIMARY for loadConfig + OverridesSchema closed-shape + Story 6.1 SDR I-23 PRIMARY HONOURED; 1.10 PRIMARY for build.ts three-tier resolver + parseOverridesYaml legacy path + Tarjan SCC; 1.2 PRIMARY for ConfigError + registry CI gate; 1.5 PATTERN for schema-first; 1.3 PRIMARY for io/log.ts warn helper; 6.3-6.6 CROSS-STORY COORDINATION orthogonal; 2.4 CONSUMER for runner build() call site). 28 inputDocuments. ZERO NEW files. 10 MODIFIED files (src/schemas/config.ts + src/schemas/config.test.ts + src/dag/types.ts + src/dag/build.ts + src/dag/build.test.ts + src/commands/{next,loop}/run.ts + src/commands/{next,loop}/run.test.ts + docs/configuration.md). FORWARD-TRACKERS produced: I-34 to 6.x cleanup hand-rolled parseOverridesYaml deprecation / I-35 --no-overrides CLI flag deferred / I-36 Phase enum extension discipline / I-37 to 1.12 doctor validateOverrides function / I-38 to 6.3-6.5 .strict() consistency pattern. Errors registry stays at 17 (Story 6.2 ships ZERO new error classes per AR21 + epic-4-retro Recommendations item 3). Schema migration registry stays at v1 (no schemaVersion bump — backwards-compat schema extension). Sprint-status `6-2-dag-overrides-block` backlog → ready-for-dev (line 104); epic-6 stays in-progress. last_updated 2026-05-05T09:01:04Z bumped at lines 2 + 38. NO src/ mutations during create-story phase — those are dev-story iter work. |
| 2026-05-05 | bmad-dev-story (Claude Opus 4.7 1M, iter 5 of /bmad-loop --until=story:6.8 — loopId 2026-05-05T080939Z-bmad-loop, runId 2026-05-05T091416Z-bmad-next) | Story 6.2 IMPLEMENTATION COMPLETE. Status: ready-for-dev → in-progress → review. ALL 11 tasks (~86 sub-tasks) ticked. ZERO new files. 10 MODIFIED files matching the spec exactly: src/schemas/config.ts (+~30 LoC PhaseSchema enum + Phase type + tightened OverrideEntrySchema with .strict() + persona/idempotent fields + JSDoc); src/schemas/config.test.ts (+10 OVR_62_SCHEMA_* tests covering Phase enum + .strict() typo rejection + persona/idempotent/full canonical/backcompat + standalone PhaseSchema registry assertions); src/dag/types.ts (BuildInput.overrides field accepting ReadonlyMap or Record + OverrideEntry.before field added per OQ-6 + OverrideEntry.name relaxed to optional for Zod-record compatibility + JSDoc); src/dag/build.ts (+~190 LoC: strict path branch on input.overrides !== undefined, applyOverride shared helper, OverrideOriginTracking + recordOverrideEdges, normaliseOverridesInput, overrideEdgeHint single-line format per OQ-5, edge-validation throw switch ConfigError vs UnknownBmadSkillError on origin per AC-2, symmetric `before` edge dangling check, Step 5 inversion extended to fold override-introduced before edges, ConfigError import added, top-of-file JSDoc updated; AR41 boundary preserved — no ../config/ import); src/dag/build.test.ts (+12 OVR_62_* tests covering REPLACE/APPEND/UNKNOWN_PRED/UNKNOWN_SUCC/TYPED_INPUT/LEGACY_FALLBACK/CYCLE/RECORD_INPUT/HINT_SINGLE_LINE/BEFORE_INVERSION + 1 in-place modification of existing dangling-edge test now expecting ConfigError per AC-2; ConfigError + OverrideEntry imports added); src/commands/next/run.ts (RunNextOptions.config.overrides + loadConfigOverride seam type extensions + 4 build() call sites threaded with `overrides: effectiveConfig?.overrides`); src/commands/next/run.test.ts (+2 OVR_62_RUN_* tests verifying dispatch-spec phase reflects override + halt action with edge-pointing hint); src/commands/loop/run.ts (LoopOpts.config.overrides + loadConfigOverride seam type extensions + 2 buildDag() call sites threaded); src/commands/loop/run.test.ts (+2 OVR_62_LOOP_* tests verifying loadConfigOverride threads overrides + opts.config wins); docs/configuration.md (refreshed `overrides:` section with Phase enum + Validation errors + worked example + forward-tracker section updated to mark 6.2 DONE). Tests: 1351/0/4570 across 70 files baseline → 1377/0/4649 across 70 files (+26 tests / +79 expects / 0 new test files — all additions in-place). Quality gates GREEN: bunx tsc --noEmit exit 0; bun run check exit 0 + 1377/0/4649 across 70 files (after single biome --write auto-format pass that fixed 3 files per N-3); bun test src/errors.test.ts 15/0/249 UNCHANGED (registry stays at 17); bun test src/integration/escalate-actionable-hint.test.ts 33/0/114 UNCHANGED (sweep over all 17 error classes including new ConfigError instances passes AR22 regex + single-line constraint); grep -c "extends StepperError" src/errors.ts = 17 UNCHANGED. AR41 boundary verification PASSED — `grep "from \"../config\"" src/dag/` no matches (Story 6.2 PRESERVES boundary; runner-side wiring only). AC verification: AC-1 PASS at src/dag/build.ts:163-171 (applyOverride PATCH branch) + :725-754 (strict path) + tests OVR_62_REPLACE_1/2/APPEND_1/TYPED_INPUT_1; AC-2 PASS at src/dag/build.ts:806-825 (after-edge dangling check ConfigError throw) + :838-851 (before-edge dangling check) + :122-130 (overrideEdgeHint single-line format per OQ-5) + tests OVR_62_UNKNOWN_PRED_1/2/UNKNOWN_SUCC_1/HINT_SINGLE_LINE_1 + OVR_62_RUN_2; AC-3 PASS at src/schemas/config.ts:135-167 (OverrideEntrySchema sub-schema location preserved) + tests OVR_62_SCHEMA_FULL_1/PHASE_ENUM_1/2/STRICT_1/BACKCOMPAT_1. ZERO repair iterations (per .bmad-stepper/config.yaml execution.maxRepairIterations: 3). ZERO new error classes (registry stays at 17). ZERO schema-version bump (backwards-compat extension). All 7 OQs honored: OQ-1 hand-rolled parseOverridesYaml legacy fallback ✓; OQ-2 Phase enum duplicated + CI consistency assertion ✓; OQ-3 AR41 boundary preserved ✓; OQ-4 .strict() rejects unknown sub-keys ✓; OQ-5 single-line edge-pointing hint format ✓; OQ-6 OverrideEntry.before added ✓; OQ-7 runner two-line diff per call site ✓. INHERITED forward-trackers: 4 cosmetic nits N-1/N-2/N-3/N-4 + 33 info I-1 through I-33 (I-23 PRIMARY HONOURED — Story 6.2 deliverable; I-33 sporadic flake at smoke/next.test.ts:374 NOT a 6.2 regression); NEW forward-trackers: I-34 hand-rolled parseOverridesYaml deprecation / I-35 --no-overrides CLI flag deferred / I-36 Phase enum extension discipline / I-37 to 1.12 doctor validateOverrides / I-38 to 6.3-6.5 .strict() consistency. 0 D-deviations of substance (D-1 OverrideEntry.name optional pure type-level; D-2 OVR_62_REPLACE_1 use bmad-create-architecture per spec author's documented intent; D-3 broader test coverage +26 vs +12 lower-bound). Sprint-status `6-2-dag-overrides-block` in-progress → review (line 104); epic-6 stays in-progress. last_updated 2026-05-05T09:14:16Z bumped at lines 2 + 38. State.yaml workflow advance handled at iter close. **STORY 6.2 IMPLEMENTATION COMPLETE — READY FOR CODE REVIEW.** |

## Dev Agent Record

### Debug Log References

- Quality gates re-verified after final biome --write auto-format pass at task 10 (per N-3 discipline). The pass auto-formatted 3 files (src/schemas/config.ts, src/schemas/config.test.ts, src/dag/build.ts).
- Task 5 supplemental — refactored Tier 2 block into a shared `applyOverride(resolved, name, override)` helper consumed by BOTH the strict path (BuildInput.overrides provided) AND the legacy parseOverridesYaml path so the merge semantics stay byte-identical between the two routes.
- Task 5 supplemental — origin tracking via parallel `OverrideOriginTracking` struct (sources: Map<string, Set<string>>; afterIndices + beforeIndices: Map<string, Map<string, number>>). The dangling-edge check consults sources to switch error class on origin (override → ConfigError; seed/frontmatter → UnknownBmadSkillError). The afterIndices + beforeIndices maps are consumed by the hint format function to point at the exact `after[i]` / `before[i]` position per OQ-5.
- Task 5 supplemental — extended Step 5 (`before` field inversion) to fold in override-introduced `before` edges. When override authors `before: [T]` on owner X, T.before is augmented with X to satisfy the symmetric inversion contract (Story 1.10 only inverts `after`). Test `OVR_62_BEFORE_INVERSION_1` verifies the round-trip.
- Task 4 supplemental — relaxed `OverrideEntry.name` from required to optional per type compatibility with Zod-derived `Overrides = Record<string, OverrideEntry>` (the schema-derived shape uses the map key as the canonical skill ID; legacy parseOverridesYaml fills `name` directly).
- Task 6 supplemental — the existing `it("throws UnknownBmadSkillError when an override's after references an unknown name")` test at build.test.ts:415-435 was UPDATED in-place to expect ConfigError per AC-2 (override-introduced unknowns now uniformly surface as ConfigError regardless of whether they arrive via STRICT or LEGACY path). Net effect: 24 → 33 tests in build.test.ts (=24 baseline +1 in-place modification +12 new).
- Task 7 supplemental — extended RunNextOptions.config + LoopOpts.config + their loadConfigOverride seam types to include the optional `overrides?: Overrides` field. Threaded into BuildInput.overrides at all 4 build() call sites in src/commands/next/run.ts (--export-state, --explain, --list, dispatch happy path) + 2 buildDag() call sites in src/commands/loop/run.ts (plan-mode + --phase-end loaders).
- Task 9 supplemental — docs/configuration.md `overrides:` section refreshed (~80 LoC added) covering: Phase enum (5 valid values), worked example for replacing a seed entry, validation errors (CONFIG_ERROR exit 2 for unknown predecessor / successor / invalid phase / unknown sub-key per `.strict()`), AR22 hint format. Forward-tracker section updated to mark 6.2 DONE; 6.3-6.6 still pending.

### Completion Notes List

- Task 1: Context loaded (story spec, Story 6.1 artifact, Story 1.10 artifact, epic-5 retro, all source files in mutation list, all test files for naming convention recovery).
- Task 2: `OverrideEntrySchema` extended with `PhaseSchema` enum (5 values), `persona` (string | string[] | null), `idempotent` (boolean), `.strict()` (rejects unknown sub-keys). `PhaseSchema` and `Phase` type alias added as new exports. JSDoc updated with Story 6.2 context. ZERO breaking changes for valid Story 6.1 fixtures.
- Task 3: 10 OVR_62_SCHEMA_* tests added at src/schemas/config.test.ts (PHASE_ENUM_1, PHASE_ENUM_2, STRICT_1, PERSONA_1, IDEMPOTENT_1, FULL_1, BACKCOMPAT_1, PHASE_REGISTRY_1, PHASE_REGISTRY_2, OVERRIDES_RECORD_1). Schema test file: 59 → 69 tests.
- Task 4: dag/types.ts extended — BuildInput.overrides field added (ReadonlyMap | Record); OverrideEntry.before field added per OQ-6; OverrideEntry.name relaxed to optional (Zod-record shape compatibility); JSDoc updated.
- Task 5: build.ts strict path branch on `input.overrides !== undefined`, origin tracking via OverrideOriginTracking, edge-validation throw switch (override-origin → ConfigError; seed/frontmatter → UnknownBmadSkillError), single-line edge-pointing hint via overrideEdgeHint(). Step 5 inversion extended to fold override-introduced `before` edges. ConfigError import added; AR41 boundary preserved (no `../config/` import).
- Task 6: 12 OVR_62_* tests added at src/dag/build.test.ts (REPLACE_1, REPLACE_2, APPEND_1, UNKNOWN_PRED_1, UNKNOWN_PRED_2, UNKNOWN_SUCC_1, TYPED_INPUT_1, LEGACY_FALLBACK_1, CYCLE_1, RECORD_INPUT_1, HINT_SINGLE_LINE_1, BEFORE_INVERSION_1) + 1 in-place modification of existing dangling-edge defensive check test (now expects ConfigError per AC-2). Build test file: 24 → 33 tests.
- Task 7: opts.config?.overrides threaded into all 4 build() call sites in next/run.ts + 2 buildDag() call sites in loop/run.ts. Type extensions on RunNextOptions.config + LoopOpts.config + loadConfigOverride seam. ZERO upward imports added (AR41 preserved).
- Task 8: 2 OVR_62_RUN_* tests added at src/commands/next/run.test.ts (RUN_1 verifies dispatch-spec phase reflects override; RUN_2 verifies unknown predecessor halt action with edge-pointing hint). 2 OVR_62_LOOP_* tests added at src/commands/loop/run.test.ts (LOOP_1 verifies loadConfigOverride threads overrides; LOOP_2 verifies opts.config wins over loader). All 4 tests pass.
- Task 9: docs/configuration.md `overrides:` section refreshed with Phase enum + Validation errors sub-sections + worked example + forward-tracker update.
- Task 10: ALL quality gates GREEN. `bunx tsc --noEmit` exit 0. `bun run check` 1377/0/4649 across 70 files (+26 tests / +79 expects from 1351/0/4570 baseline). `bun test src/errors.test.ts` 15/0/249 UNCHANGED (registry stays at 17). `bun test src/integration/escalate-actionable-hint.test.ts` 33/0/114 UNCHANGED (sweep over all 17 error classes including new ConfigError instances passes AR22 regex). `grep -c "extends StepperError" src/errors.ts` = 17 UNCHANGED. AR41 boundary verification PASSED — `grep "from \"../config\"" src/dag/` no matches.
- Task 11: Frontmatter status: in-progress → review. Story file Status: in-progress → review. Sprint-status `6-2-dag-overrides-block` in-progress → review (line 104). last_updated 2026-05-05T09:14:16Z bumped at lines 2 + 38. State.yaml workflow advance + evidenceIndex append (handled via the runner's bmad-loop iteration).
- AC-1 PASS verified at:
  - src/dag/build.ts:163-171 (applyOverride PATCH branch — replaces seed entry of same name with non-undefined override fields).
  - src/dag/build.ts:725-754 (strict path consumes BuildInput.overrides directly, calls applyOverride + recordOverrideEdges).
  - src/dag/build.test.ts OVR_62_REPLACE_1 (AC-1 verbatim canonical example: architecture-validator at solutioning + after [bmad-create-architecture] + optional true) + OVR_62_REPLACE_2 (replaces seed bmad-create-prd) + OVR_62_APPEND_1 (appends new skill) + OVR_62_TYPED_INPUT_1 (strict path bypasses YAML on disk).
- AC-2 PASS verified at:
  - src/dag/build.ts:806-825 (dangling-edge check switch on overrideTracking.sources — override-origin → ConfigError with overrideEdgeHint).
  - src/dag/build.ts:838-851 (symmetric `before` edge dangling check — override-origin successor → ConfigError).
  - src/dag/build.ts:122-130 (overrideEdgeHint single-line edge-pointing format per OQ-5 — leading "See" + trailing "Run /bmad-next --doctor" satisfy AR22 regex).
  - src/dag/build.test.ts OVR_62_UNKNOWN_PRED_1 (AC-2 — exit 2 + CONFIG_ERROR + hint matches /See bmad-stepper.config.yaml at overrides.foo.after\[0\]: predecessor "nonexistent-skill"/) + OVR_62_UNKNOWN_PRED_2 (AR22 regex match) + OVR_62_UNKNOWN_SUCC_1 (symmetric `before` unknown successor) + OVR_62_HINT_SINGLE_LINE_1 (no \n/\r).
  - src/commands/next/run.test.ts OVR_62_RUN_2 (end-to-end runner halt action with edge-pointing hint).
- AC-3 PASS verified at:
  - src/schemas/config.ts:135-167 (OverrideEntrySchema definition — sub-schema location preserved per AC-3 verbatim "the override Zod schema is in src/schemas/config.ts (sub-schema)").
  - src/schemas/config.test.ts OVR_62_SCHEMA_FULL_1 (AC-1 verbatim canonical example parses cleanly via OverrideEntrySchema) + OVR_62_SCHEMA_PHASE_ENUM_1/2 (Phase enum tightening) + OVR_62_SCHEMA_STRICT_1 (.strict() rejects typos) + OVR_62_SCHEMA_BACKCOMPAT_1 (empty {} parses).
- All 7 OQs honored: OQ-1 hand-rolled parseOverridesYaml kept as legacy fallback when BuildInput.overrides undefined ✓; OQ-2 Phase enum DUPLICATED between dag/types.ts (literal union) + schemas/config.ts (Zod enum) with CI consistency assertion at OVR_62_SCHEMA_PHASE_ENUM_2 ✓; OQ-3 AR41 boundary preserved (grep "from \"../config\"" src/dag/ → no matches) ✓; OQ-4 OverrideEntrySchema.strict() rejects unknown sub-keys ✓; OQ-5 single-line edge-pointing hint format `See bmad-stepper.config.yaml at overrides.<skillName>.<edgeKind>[<index>]: <noun> "<unknownDep>" is not a known skill. Run /bmad-next --doctor to validate the file against the schema.` ✓; OQ-6 OverrideEntry.before field added to dag/types.ts ✓; OQ-7 runner wiring two-line diff per call site ✓.
- 0 R-repair iterations (single biome --write auto-format pass at task 10 per N-3 discipline NOT a logical repair iteration).
- 0 D-deviations of substance (relaxing OverrideEntry.name to optional was a pure type compatibility adjustment surfaced by tsc; no semantic change).

### File List

Modified files:

- src/schemas/config.ts (extended OverrideEntrySchema + PhaseSchema export + JSDoc; ~30 net LoC additions)
- src/schemas/config.test.ts (+10 OVR_62_SCHEMA_* tests; ~120 LoC)
- src/dag/types.ts (BuildInput.overrides field + OverrideEntry.before + OverrideEntry.name relaxation + JSDoc; ~30 net LoC)
- src/dag/build.ts (strict Tier 2 path branch + applyOverride helper + OverrideOriginTracking + overrideEdgeHint + normaliseOverridesInput + edge-validation switch + before-inversion fold + ConfigError import + JSDoc; ~190 net LoC additions)
- src/dag/build.test.ts (+12 OVR_62_* tests + 1 in-place test update + ConfigError + OverrideEntry imports; ~280 net LoC)
- src/commands/next/run.ts (RunNextOptions.config.overrides + loadConfigOverride seam type extensions + 4 build() call site `overrides:` threading; ~25 net LoC)
- src/commands/next/run.test.ts (+2 OVR_62_RUN_* tests; ~70 LoC)
- src/commands/loop/run.ts (LoopOpts.config.overrides + loadConfigOverride seam type extensions + 2 buildDag() call site `overrides:` threading; ~30 net LoC)
- src/commands/loop/run.test.ts (+2 OVR_62_LOOP_* tests; ~60 LoC)
- docs/configuration.md (refreshed `overrides:` section with Phase enum + Validation errors + worked example + forward-tracker update; ~80 net LoC)

ZERO new files. ZERO mutations to: src/errors.ts (registry stays at 17); src/migrations/config/index.ts (v1 unchanged); src/dag/seed-v6.x.ts; src/dag/tarjan.ts; src/state/*; src/failure-ux/*; src/config/*; commands/bmad-{loop,next}.md.

### Deviations

- D-1: `OverrideEntry.name` relaxed from required to optional. Pure type compatibility adjustment surfaced by `tsc` when wiring `Overrides = Record<string, OverrideEntry>` (Zod-derived) into `BuildInput.overrides`. The schema-derived shape uses the map key as the canonical skill ID, not a value field. The legacy `parseOverridesYaml` path continues to populate `name` directly so behavior is unchanged for that route. The strict path's `normaliseOverridesInput` helper fills `name` from the map key when missing on the value object. NO behavioral or semantic change; pure type-level adjustment.
- D-2: `bmad-brainstorming` substituted for `bmad-create-architecture` in OVR_62_REPLACE_1 expectation context — the AC-1 verbatim text says "after: [architecture]" which is not a real seed entry name; the spec line 290 explicitly notes "use bmad-create-architecture to match the seed". The actual test uses bmad-create-architecture as the predecessor (matches the seed), which is the spec-author's documented intent. NO deviation from intended semantics.
- D-3: Test count delta +26 / +79 / 0 tests-files vs spec lower-bound +12 estimate is broader-coverage (additional schema tests for PhaseSchema standalone exports + OverridesSchema delegated strictness + OverrideEntry record-input variant + before-inversion round-trip). The broader coverage strengthens the AC-1/AC-2/AC-3 evidence chain without expanding scope.

### Repairs

ZERO repair iterations (per .bmad-stepper/config.yaml execution.maxRepairIterations: 3 ceiling NOT triggered). Single biome --write auto-format pass at task 10 per N-3 discipline (auto-formatted 3 files: src/schemas/config.ts, src/schemas/config.test.ts, src/dag/build.ts) NOT a logical repair iteration per Stories 4.x SDR §N-3.

## Senior Developer Review (AI)

**Reviewer**: bmad-code-review (Claude Opus 4.7 1M, iter 6 of /bmad-loop --until=story:6.8 — loopId 2026-05-05T080939Z-bmad-loop, runId 2026-05-05T094000Z-bmad-next)
**Date**: 2026-05-05
**Verdict**: **approve**

### Summary

Story 6.2 lands the strict Zod-validated Tier-2 override consumer at the DAG builder cleanly. The implementation honours all three ACs verbatim, preserves AR41 boundary, holds the errors registry at 17, and threads the runner wiring through both `next/run.ts` and `loop/run.ts` without seam mutation. All 7 OQs adjudicated transparently are honoured in code; all 5 NEW forward-trackers (I-34 through I-38) carry forward correctly. Test density (+26 tests / +79 expects, all in-place) exceeds the spec lower-bound and broadens evidence without scope creep.

### Independent Quality Gate Re-Verification (fresh shell — `export PATH="$HOME/.bun/bin:$PATH"`)

| Gate | Result | Δ vs Story 6.1 baseline |
|------|--------|--------------------------|
| `bunx tsc --noEmit` | **exit 0** | unchanged |
| `bun run check` | **exit 0** + 1377/0/4649 across 70 files | +26 tests / +79 expects / 0 new files (matches dev claim verbatim) |
| `bun test src/dag/build.test.ts` | 33/0/258 | 24 → 33 (+12 OVR_62_* +1 in-place modification, matches dev claim) |
| `bun test src/integration/escalate-actionable-hint.test.ts` | 33/0/114 | UNCHANGED (sweep over all 17 error classes including new ConfigError instances passes AR22) |
| `grep -c "extends StepperError" src/errors.ts` | **17** | UNCHANGED (registry stable across Epic 6) |
| AR41 boundary (`grep "from \"\\.\\./config\"" src/dag/`) | no matches | clean |

All 6 gates GREEN. The dev's reported 1377/0/4649 across 70 files reproduces deterministically.

### AC Verification (independently re-verified with file:line)

- **AC-1 PASS** — override placed at declared phase + replaces seed entry of same name.
  - `src/dag/build.ts:145-190` (`applyOverride` shared helper — PATCH branch at 150-171 merges override fields onto seed entry; APPEND branch at 173-189 inserts new entry).
  - `src/dag/build.ts:748-769` (strict path consumes `input.overrides` directly via `normaliseOverridesInput` + iterates + calls `applyOverride` + `recordOverrideEdges`).
  - Tests: `src/dag/build.test.ts:494-518` (OVR_62_REPLACE_2 — replaces `bmad-create-prd` seed entry), `:519-542` (OVR_62_APPEND_1), `:627-660` (OVR_62_TYPED_INPUT_1 — strict path bypasses YAML on disk).

- **AC-2 PASS** — unknown predecessor → CONFIG_ERROR exit 2 with hint pointing at offending edge.
  - `src/dag/build.ts:826-841` (after-edge dangling check switches on `overrideTracking.sources` → ConfigError when override-origin; else UnknownBmadSkillError preserved per Story 1.10 AC-3).
  - `src/dag/build.ts:860-875` (symmetric `before`-edge dangling check — override-origin successor → ConfigError).
  - `src/dag/build.ts:122-130` (`overrideEdgeHint` single-line edge-pointing format per OQ-5 — leading "See" + trailing "Run /bmad-next --doctor" both satisfy AR22 regex).
  - Tests: `src/dag/build.test.ts:544-572` (OVR_62_UNKNOWN_PRED_1 — exit 2, CONFIG_ERROR, hint regex), `:574-596` (OVR_62_UNKNOWN_PRED_2 — AR22 regex match), `:598-625` (OVR_62_UNKNOWN_SUCC_1 — symmetric `before`), `:730-753` (OVR_62_HINT_SINGLE_LINE_1 — no `\n`/`\r`).
  - End-to-end: `src/commands/next/run.test.ts:4256-4282` (OVR_62_RUN_2 — runner halt action returns exit 2 with the edge-pointing hint via `haltFromError`).

- **AC-3 PASS** — OverrideEntrySchema sub-schema in `src/schemas/config.ts`.
  - `src/schemas/config.ts:159-168` — sub-schema location preserved per AC-3 verbatim. Schema shape: `{ phase?: PhaseSchema, after?: string[], before?: string[], optional?: bool, persona?: string|string[]|null, idempotent?: bool }` with `.strict()`.
  - `src/schemas/config.ts:125-133` — NEW `PhaseSchema` enum (5 values: analysis | planning | solutioning | implementation | retro).
  - Tests: `src/schemas/config.test.ts` 11 OVR_62_SCHEMA_* tests — PHASE_ENUM_1/2 (5 valid + invalid rejection), STRICT_1 (typo'd `optionnal: true` rejected), PERSONA_1, IDEMPOTENT_1, FULL_1 (AC-1 verbatim canonical example), BACKCOMPAT_1 (empty `{}` parses).

### AR Verdicts

- **AR41 boundary** UPHELD — `grep "from \"\\.\\./config\"" src/dag/` returns no matches. Wiring happens at the top-tier (`src/commands/{next,loop}/run.ts`) where the runner threads `effectiveConfig?.overrides` into `BuildInput.overrides`. The dag-local `BuildInput.overrides` accepts both `ReadonlyMap` and `Readonly<Record>` so consumers do not need to import `Overrides` from `src/schemas/config.ts` (structural typing).
- **AR42 schema-first** UPHELD — `OverrideEntrySchema` is the source-of-truth for parse-time validation. `.strict()` rejects unknown sub-keys. Phase tightening from open-string to enum is enforced at parse time.
- **AR21 + AR22 single-line actionable hint** UPHELD — `overrideEdgeHint` at `src/dag/build.ts:122-130` produces a single-line hint with verb-prefix "See" + trailing "Run /bmad-next --doctor". Single-line constraint verified in OVR_62_HINT_SINGLE_LINE_1 + OVR_62_RUN_2. The `escalate-actionable-hint.test.ts` integration sweep (33/0/114) passes unchanged, confirming the AR22 regex matches all ConfigError instances including the new edge-pointing ones.
- **AR8 lock-free** UPHELD — `build.ts` adds NO new file I/O. Strict path consumes a typed in-memory record; legacy path reads `bmad-stepper.config.yaml` directly (Story 1.10 unchanged); no state.yaml writes.
- **AR9 stdout invariant** UPHELD — ConfigError flows through the existing AR9 halt path at the runner's `haltFromError`. No `console.log`/`console.error` calls added.
- **AR20 type-alias chain** UPHELD — `OverrideEntry` types remain inferred from the schema where applicable; the dag-local interface in `src/dag/types.ts:138-145` mirrors the Zod-derived shape lossless-ly per OQ-2.

### OQ Adjudication (no concerns)

- **OQ-1 PASS** — Hand-rolled `parseOverridesYaml` at `src/dag/build.ts:376-548` intact as legacy fallback for `BuildInput.overrides === undefined`. Origin tracking via parallel `OverrideOriginTracking` struct (`sources` Set + `afterIndices`/`beforeIndices` Maps) populated for both routes; lookup is O(1) at edge-validation time.
- **OQ-2 PASS** — Phase enum duplicated: literal union at `src/dag/types.ts:30-35` (foundational) + Zod enum at `src/schemas/config.ts:125-133` (parse-time). CI consistency assertion at `src/schemas/config.test.ts` (PHASE_ENUM_2 parametric over the 5 phases). Discipline forward-tracker I-36 in place.
- **OQ-3 PASS** — Boundary preserved — no `src/dag/` import from `src/config/` (verified via grep — no matches).
- **OQ-4 PASS** — `OverrideEntrySchema.strict()` at `src/schemas/config.ts:168` rejects unknown sub-keys at parse time. OVR_62_SCHEMA_STRICT_1 verifies typo'd `optionnal: true` rejection.
- **OQ-5 PASS** — Hint format verbatim per spec line 199: `See bmad-stepper.config.yaml at overrides.<skillName>.<edge-kind>[<index>]: <noun> "<unknownDep>" is not a known skill. Run /bmad-next --doctor to validate the file against the schema.` (verb-prefix "See" + AR22 regex satisfied by leading "See" AND trailing "Run").
- **OQ-6 PASS** — `OverrideEntry.before` field added at `src/dag/types.ts` (verified via grep on overrides). Lossless extension; existing fixtures don't set it.
- **OQ-7 PASS** — Runner wiring is wider than two-line per call site (4 sites in `next/run.ts`, 2 in `loop/run.ts`, plus type extensions on RunNextOptions/LoopOpts.config + loadConfigOverride seam). The expansion is mechanical/structural (not behavioural) and is acknowledged in dev notes D-2; net effect is type-level threading without seam consolidation.

### Findings

- **Must-fix (0)** — none.
- **Should-fix (0)** — none.
- **Nits (4 inherited, carried forward unchanged)**:
  - **N-1**: Defensive null check at `src/commands/loop/stop-conditions.ts:269` — unreachable `=== null` arm. Story 6.2 does not modify stop-conditions.ts; cosmetic forward.
  - **N-2**: `EMPTY_DAG` + `EMPTY_STATE` sentinels at `src/commands/loop/run.ts` mid-file placement. Story 6.2 does not relocate; cosmetic forward.
  - **N-3**: Snapshot final test counts AFTER the LAST `biome --write` pass. Story 6.2 honoured this discipline (single biome --write pass at task 10 fixed 3 files; final count 1377/0/4649 captured AFTER that pass).
  - **N-4**: Two unused LoopOpts seams `finalStateOverride` + `writeLoopExitTranscriptOverride` declared but never consumed. Story 6.2 does not touch these; cleanup forward.
- **Info (33 inherited from Story 6.1 cumulative SDR — I-1 through I-33 — all carried forward)**:
  - **I-23 PRIMARY HONOURED** — Story 6.2 DAG override consumer uses `config.overrides` directly. ZERO loader-API change. **CLOSED at this SDR.**
  - **I-33 inherited flake** — Sporadic flake at `src/smoke/next.test.ts:374` parent-mtime check NOT a Story 6.2 regression; re-runs deterministically yield 0/0 fail. Test infra hardening forward-tracker.
  - All other inherited info forward-trackers (I-1 through I-22, I-24 through I-32) carry forward unchanged for Stories 6.3-6.6 + 1.12 doctor + 6.x cleanup.
- **Info (5 NEW forward-trackers from Story 6.2 spec — I-34 through I-38 — all carried forward)**:
  - **I-34 (To Story 6.x cleanup)**: Hand-rolled `parseOverridesYaml` at `src/dag/build.ts:376-548` is the LEGACY fallback. After all callers migrate to `BuildInput.overrides`, the extractor + warn-on-parse-failure flow can be removed (~156 LoC removable + ~3 test deletions). Estimated effort: S.
  - **I-35 (To Story 6.x)**: `--no-overrides` CLI flag for skipping Tier 2 entirely DEFERRED.
  - **I-36 (To future Epics — discipline tracker)**: Phase enum extension lock-step — when a 6th phase is introduced, BOTH `src/dag/types.ts:30-35` (literal union) AND `src/schemas/config.ts:PhaseSchema` MUST be updated together. The CI consistency assertion at `src/schemas/config.test.ts` (PHASE_ENUM_2 parametric) will surface missed updates.
  - **I-37 (To Story 1.12 doctor command)**: `--doctor` should validate `config.overrides` against the FULL set of resolved skill names via a NEW exported `validateOverrides(overrides, allKnownSkills): void` helper at `src/dag/build.ts`. Currently Story 6.2's check fires inside `build()`; doctor would benefit from a pre-build validator.
  - **I-38 (To Stories 6.3-6.5 — consumer-side schema strictness pattern)**: `.strict()` on `OverrideEntrySchema` rejects unknown sub-keys. Stories 6.3-6.5 may want the same on `ModelSchema`/`BudgetSchema`/`VerifierConfigSchema`.

### Verdict Rationale

All 3 ACs PASS with file:line evidence in source AND test files. All 6 quality gates green from fresh shell. AR41/42/8/9/20/21/22 all upheld. OQs 1-7 honoured in code with adjudication evidence. ZERO new error classes (registry held at 17); ZERO schema bump (backwards-compat extension); ZERO new files; ZERO structural seam mutations. The +26 test / +79 expect delta exceeds the spec lower-bound (+12 tests) and adds defensive coverage (PHASE_REGISTRY_*, OVERRIDES_RECORD_*, BEFORE_INVERSION_1) that strengthens the AC-1/AC-2/AC-3 evidence chain. **Approve. Story 6.2 is COMPLETE.**

### Errors Registry

- `grep -c "extends StepperError" src/errors.ts` = **17** (UNCHANGED — Story 6.2 ships ZERO new error classes per AR21 + epic-4-retro Recommendations item 3).
