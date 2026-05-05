/**
 * src/dag/types.ts — Local TypeScript types for the `src/dag/` mid-tier
 * module (FR1, FR2, FR8, FR9, FR35, FR51, AR33, AR41).
 *
 * Story 1.10 deliberately introduces NO Zod schemas. Types are local,
 * structural, and consumed only within `src/dag/`. The Zod-validated
 * `OverridesSchema` for `bmad-stepper.config.yaml` is Story 6.2's
 * deliverable; the full config-yaml schema loader is Story 6.1's
 * deliverable.
 *
 * Architecture compliance:
 *   - §D6 lines 449-465 — `DagNode` + `DagAdjacency` shape.
 *   - §D5 lines 411-443 — three-tier discovery contract that
 *                         `BuildInput` + `SeedEntry` + `OverrideEntry`
 *                         operationalise.
 *   - AR33 line 213    — readonly fields, structural sharing.
 *   - AR41 line 1296   — `src/dag/` is mid-tier; this file imports nothing.
 *
 * Why `Map`/`Set` rather than plain objects: deterministic iteration
 * order (insertion-order) matters for Tarjan traversal stability and
 * reproducible DAG hashing (Story 2.6's state-hash check depends on a
 * deterministic adjacency representation).
 */

/**
 * Phase literal union per architecture line 452. A `DagNode` belongs to
 * exactly one phase; the phase governs the runner's execution order
 * (Story 2.4) and the topological tiebreaker (Story 3.7).
 */
export type Phase =
  | "analysis"
  | "planning"
  | "solutioning"
  | "implementation"
  | "retro";

/**
 * One node in the BMAD step DAG. The shape is a verbatim transcription
 * of architecture §D6 lines 449-458 with one minor extension:
 * `idempotent` is optional in v0.1 (Story 5.1 retry semantics will
 * consume it; Story 1.10 does not yet capture it from frontmatter).
 *
 * - `name`     — Skill directory name (the strings `detectBmadSkills()`
 *                returns; Story 1.9). Acts as the adjacency-list key.
 * - `phase`    — One of the five `Phase` values.
 * - `after`    — Names of nodes this node depends on (prerequisites). The
 *                runner ensures all `after` nodes complete before this
 *                node fires.
 * - `before`   — Names of nodes that depend on this node (computed by
 *                `build()` step 5 by inverting `after` across all final
 *                entries — the Tier 1 seed and Tier 2 overrides only
 *                author `after`).
 * - `optional` — When `true`, the runner may skip this step.
 * - `persona`  — Persona identifier(s) responsible for this skill.
 *                Resolved by Story 1.11 `src/personas/` against the
 *                module config.
 * - `idempotent` — When `true`, the runner may safely retry on failure
 *                  (Story 5.1). Optional in Story 1.10.
 */
export interface DagNode {
  readonly name: string;
  readonly phase: Phase;
  readonly after: readonly string[];
  readonly before: readonly string[];
  readonly optional: boolean;
  readonly persona: string | readonly string[] | null;
  readonly idempotent?: boolean;
}

/**
 * Sealed adjacency-list view of the DAG. Architecture §D6 lines 460-465.
 *
 * - `nodes`    — Map keyed by node name. Insertion order matches the
 *                resolution order: Tier 1 seed entries first (in seed
 *                array order), then Tier 2 override appends (in YAML
 *                order), then Tier 3 frontmatter-parsed unknowns (in
 *                `skillNames` input order).
 * - `edgesOut` — `name → set of successors`. `edgesOut.get(A) = {B}` reads
 *                "A is a prerequisite for B" — edges point from earlier
 *                to later. Tarjan operates on this directed graph.
 * - `edgesIn`  — `name → set of predecessors`. The inverse of `edgesOut`.
 *                Story 3.6 (`--explain`) consumes `edgesIn` to walk the
 *                predecessor chain for any candidate next step.
 */
export interface DagAdjacency {
  readonly nodes: ReadonlyMap<string, DagNode>;
  readonly edgesOut: ReadonlyMap<string, ReadonlySet<string>>;
  readonly edgesIn: ReadonlyMap<string, ReadonlySet<string>>;
}

/**
 * Tier 1 hand-curated seed entry shape. The seed array `seedV6_x` is a
 * `readonly SeedEntry[]` consumed by `build.ts` step 1.
 *
 * Differs from `DagNode` by: (a) `before` is OMITTED — Tier 1 only
 * authors `after`, the `before` field is computed by `build()` step 5;
 * (b) `idempotent` is OMITTED — Story 5.1 forward dependency.
 */
export interface SeedEntry {
  readonly name: string;
  readonly phase: Phase;
  readonly after: readonly string[];
  readonly optional: boolean;
  readonly persona: string | readonly string[] | null;
}

/**
 * Tier 2 override entry shape. The hand-rolled YAML extractor in
 * `build.ts` produces a `Map<string, OverrideEntry>` from the `overrides:`
 * block of `bmad-stepper.config.yaml`.
 *
 * All fields except `name` are optional — overrides PATCH the seed entry
 * (when names match) or APPEND a new entry (when the name is new).
 *
 * Story 6.2 — the shape is now lossless w.r.t. `z.infer<typeof
 * OverrideEntrySchema>` from `src/schemas/config.ts` (OQ-6 ADDED the
 * missing `before` field). The interface stays in this mid-tier module
 * (no Zod import per AR41) but the field-set is byte-identical to the
 * Zod-derived type. The runner-side wiring at `src/commands/next/run.ts`
 * threads `opts.config?.overrides` (a Zod-validated record) into
 * `BuildInput.overrides` — `build()` consumes the typed map directly
 * (STRICT path) and falls back to the hand-rolled YAML extractor only
 * when `BuildInput.overrides === undefined` (LEGACY graceful-degradation
 * path per Story 1.10 backwards-compat).
 */
export interface OverrideEntry {
  /**
   * Story 6.2 — `name` is OPTIONAL because Zod-derived overrides (from
   * `OverridesSchema = z.record(z.string(), OverrideEntrySchema)`) carry
   * the skill ID as the MAP KEY, not as a value field. `build()` fills
   * `name` from the map key when iterating; the legacy parseOverridesYaml
   * path (Story 1.10) populates `name` directly. This keeps the dag-
   * local interface a structural superset of the schema-derived type.
   */
  readonly name?: string;
  readonly phase?: Phase;
  readonly after?: readonly string[];
  readonly before?: readonly string[];
  readonly optional?: boolean;
  readonly persona?: string | readonly string[] | null;
  readonly idempotent?: boolean;
}

/**
 * Public input shape consumed by `build()`. Composer pattern (Story 1.4 /
 * 1.8 / 1.9 precedent): the runner (Story 2.4) calls `detectBmadSkills()`
 * first and passes the resulting `string[]` here as `skillNames`. Per
 * AR41 mid-tier-to-mid-tier ban, `src/dag/` does NOT import from
 * `src/bmad-detect/`.
 *
 * - `skillNames`    — REQUIRED. The skill names the upstream BMAD plugin
 *                     advertises. Tier 3 only fires for names in this
 *                     list that are not in the seed/overrides.
 * - `projectRoot`   — Project root for resolving the default
 *                     `bmad-stepper.config.yaml` path. Defaults to
 *                     `process.cwd()`.
 * - `pluginDir`     — Plugin root where SKILL.md/skill.yaml files live for
 *                     Tier 3 frontmatter parse. If undefined, Tier 3 will
 *                     throw `UnknownBmadSkillError` for any skill not in
 *                     seed/overrides.
 * - `overridesPath` — Override the default config path. Test-only-but-
 *                     exported escape hatch (Story 1.4 `LockOptions` /
 *                     Story 1.8 `DetectSnapshotOptions` pattern).
 * - `overrides`     — STORY 6.2 STRICT TIER-2 SEAM. When provided,
 *                     `build()` consumes this typed map directly (no
 *                     YAML parse, no graceful degradation; the loader is
 *                     responsible for Zod validation per Story 6.1). When
 *                     omitted, `build()` falls back to parsing
 *                     `bmad-stepper.config.yaml` directly via the legacy
 *                     hand-rolled extractor (LEGACY path per Story 1.10
 *                     backwards-compat). Accepts either a `ReadonlyMap`
 *                     or a plain `Record` — `build()` normalises
 *                     internally. The map keys are skill IDs; the entry
 *                     `name` field is redundant when keyed by ID and may
 *                     be omitted from the value (build.ts uses the map
 *                     key as the canonical name).
 */
export interface BuildInput {
  readonly skillNames: readonly string[];
  readonly projectRoot?: string;
  readonly pluginDir?: string;
  readonly overridesPath?: string;
  readonly overrides?:
    | ReadonlyMap<string, OverrideEntry>
    | Readonly<Record<string, OverrideEntry>>;
}
