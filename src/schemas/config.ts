/**
 * src/schemas/config.ts — Zod schema for bmad-stepper.config.yaml v1
 * (FR6, FR7, FR31, FR34-FR40, NFR-M3, AR20, AR41).
 *
 * Foundational module per AR41: zero upward imports; only depends on `zod`.
 *
 * The schema captures the top-level structure of the config file as
 * documented in architecture.md §P3 (lines 773–790).
 *
 * Story 5.6 NARROWED the `failurePolicies` field from
 * `z.record(z.string(), z.unknown())` to `FailurePoliciesSchema`
 * (closed enum union of 4 values: retry/skip/route-to-fixer/escalate)
 * per FR31.
 *
 * Story 6.1 NARROWS the remaining 6 open-shape sub-records — `personas`,
 * `overrides`, `verifiers`, `models`, `budgets` — into typed sub-schemas
 * with standalone exports. Per OQ-9 (Story 6.1) the narrowing is
 * BACKWARDS COMPATIBLE for fixtures with empty records (`personas: {}`
 * still parses) but rejects shapes that were always wrong (e.g.,
 * `personas: { dev: 42 }` is now rejected at parse time). NO schema
 * version bump — still v1.
 *
 * Public surface:
 *   - ConfigV1Schema         — Zod schema for v1.
 *   - ConfigV1               — `z.infer<typeof ConfigV1Schema>`.
 *   - Config                 — application-code alias (= ConfigV1).
 *   - ConfigLatestSchema     — schema alias for the current version.
 *   - FailurePolicySchema    — closed enum (Story 5.6 — FR31).
 *   - FailurePoliciesSchema  — record of step-id → FailurePolicy (Story 5.6).
 *   - FailurePolicy          — `z.infer<typeof FailurePolicySchema>`.
 *   - FailurePolicies        — `z.infer<typeof FailurePoliciesSchema>`.
 *   - PersonasSchema         — record of step-id → string | string[] (Story 6.1 — FR34).
 *   - Personas               — `z.infer<typeof PersonasSchema>`.
 *   - PhaseSchema            — Phase enum (Story 6.2 — FR35; mirrors `src/dag/types.ts:Phase`).
 *   - Phase                  — `z.infer<typeof PhaseSchema>`.
 *   - OverrideEntrySchema    — DAG override entry shape (Story 6.1 — FR35; tightened in Story 6.2 with PhaseSchema + `.strict()`).
 *   - OverridesSchema        — record of skill-id → OverrideEntry.
 *   - OverrideEntry          — `z.infer<typeof OverrideEntrySchema>`.
 *   - Overrides              — `z.infer<typeof OverridesSchema>`.
 *   - VerifierConfigSchema   — per-step verifier config (Story 6.1 — FR38).
 *   - VerifiersSchema        — record of step-id → VerifierConfig.
 *   - VerifierConfig         — `z.infer<typeof VerifierConfigSchema>`.
 *   - Verifiers              — `z.infer<typeof VerifiersSchema>`.
 *   - ModelSchema            — model-name enum: sonnet/opus/haiku (Story 6.1).
 *   - ModelsSchema           — record of step-id → Model.
 *   - Model                  — `z.infer<typeof ModelSchema>`.
 *   - Models                 — `z.infer<typeof ModelsSchema>`.
 *   - BudgetSchema           — per-step budget block (Story 6.1).
 *   - BudgetsSchema          — record of step-id → Budget.
 *   - Budget                 — `z.infer<typeof BudgetSchema>`.
 *   - Budgets                — `z.infer<typeof BudgetsSchema>`.
 *   - PathsSchema            — paths block (state/runs/staging/telemetry) (Story 6.1 — FR39).
 *   - Paths                  — `z.infer<typeof PathsSchema>`.
 *   - TelemetrySchema        — telemetry block (Story 6.1 — FR40).
 *   - Telemetry              — `z.infer<typeof TelemetrySchema>`.
 */

import { z } from "zod";

/**
 * Story 5.6 — closed enum union of the 4 per-step failure-UX policies
 * (architecture lines 494-497; FR31 PRIMARY).
 *
 * Mirrors the `FailurePolicy` type alias at `src/failure-ux/index.ts:32`
 * (the two unions are byte-identical; TypeScript treats them as the same
 * type). The schema-side declaration enables Zod parse-time rejection
 * of invalid policy values per OQ-10 (config files with typos surface
 * as a structured ConfigError at load time, not silently fallback).
 */
export const FailurePolicySchema = z.enum([
  "retry",
  "skip",
  "route-to-fixer",
  "escalate",
]);

/**
 * Story 5.6 — record of BMAD step-id → FailurePolicy (FR31 PRIMARY).
 *
 * The keys are BMAD step IDs (e.g., `bmad-create-story`, `bmad-dev-story`,
 * `bmad-code-review`, `bmad-retrospective`); case-sensitive lookup per
 * OQ-4. Absent keys fall back to the plugin default `escalate` per
 * architecture line 499 ("escalate is the safest fallback when no
 * per-step policy is set"). The fallback is implemented at the resolver
 * (`src/failure-ux/resolve-policy.ts`), NOT the schema — the schema
 * accepts an empty record (existing default).
 */
export const FailurePoliciesSchema = z.record(z.string(), FailurePolicySchema);

export type FailurePolicy = z.infer<typeof FailurePolicySchema>;
export type FailurePolicies = z.infer<typeof FailurePoliciesSchema>;

// ─── Story 6.1 — narrowed sub-schemas (FR34–FR40) ──────────────────────────

/**
 * Story 6.1 — record of step-id → persona-name (string) OR persona-name
 * list (string[]). FR34 PRIMARY (architecture line 777).
 *
 * The single-string variant assigns one persona to the step; the array
 * variant declares multi-persona sequential dispatch (forward-deferred
 * to Stories 4.1 + 5.* per AR16). Story 1.11's persona resolver already
 * accepts both shapes — the narrowing here aligns the schema with the
 * resolver's runtime-tolerated input.
 */
export const PersonasSchema = z.record(
  z.string(),
  z.union([z.string(), z.array(z.string())]),
);

/**
 * Story 6.2 — Phase enum per architecture line 452 (FR35 PRIMARY).
 *
 * Mirrors the `Phase` literal union at `src/dag/types.ts:30-35` byte-
 * identical (5 values: analysis | planning | solutioning | implementation |
 * retro). Per OQ-2 the Phase enum is DUPLICATED across two modules — the
 * dag-local literal union is foundational (no Zod import per AR41 mid-tier
 * boundary) and the Zod enum here is the parse-time validator. The two
 * MUST stay in lock-step; the CI consistency assertion at
 * `src/schemas/config.test.ts` (parametric over the 5 phases) surfaces
 * any drift.
 *
 * When a 6th phase is introduced (e.g., "deployment" or "release"), BOTH
 * declarations must be updated together (forward-tracker I-36).
 */
export const PhaseSchema = z.enum([
  "analysis",
  "planning",
  "solutioning",
  "implementation",
  "retro",
]);

export type Phase = z.infer<typeof PhaseSchema>;

/**
 * Story 6.1 — DAG override entry per architecture line 778 (FR35 PRIMARY).
 * Story 6.2 — TIGHTENED with `PhaseSchema` enum (was open-string),
 * `.strict()` (rejects unknown sub-keys at parse time per OQ-4 + AR42),
 * + `persona` and `idempotent` optional fields aligned with the dag-local
 * `OverrideEntry` interface at `src/dag/types.ts:116-123` so the schema
 * is lossless when the local interface is replaced by `z.infer`.
 *
 * Each field is OPTIONAL — overrides may declare any subset of fields:
 *   - `phase` — Phase override; pins the step into the named phase. Must
 *     be one of the 5 valid phases per `PhaseSchema`.
 *   - `after` — Insert prerequisite step IDs into the resolved DAG node.
 *   - `before` — Insert post-requisite step IDs (nodes that come after).
 *   - `optional` — Mark the step as optional (skipped unless explicitly enabled).
 *   - `persona` — Persona identifier(s) for the override step (string,
 *     string-array, or null). Passes through to the persona resolver.
 *   - `idempotent` — When true, the runner may safely retry on failure
 *     (Story 5.1 retry semantics).
 *
 * `.strict()` rejects ANY key not declared above (e.g., `optionnal: true`
 * → ConfigError pointing at the unknown key path). This is a NEW
 * strictness vs Story 6.1's open-shape baseline; existing fixtures with
 * valid-only keys are unaffected.
 */
export const OverrideEntrySchema = z
  .object({
    phase: PhaseSchema.optional(),
    after: z.array(z.string()).optional(),
    before: z.array(z.string()).optional(),
    optional: z.boolean().optional(),
    persona: z.union([z.string(), z.array(z.string()), z.null()]).optional(),
    idempotent: z.boolean().optional(),
    interactive: z.boolean().optional(),
  })
  .strict();

/**
 * Story 6.1 — record of skill-id → OverrideEntry. FR35 PRIMARY.
 */
export const OverridesSchema = z.record(z.string(), OverrideEntrySchema);

export type OverrideEntry = z.infer<typeof OverrideEntrySchema>;
export type Overrides = z.infer<typeof OverridesSchema>;

/**
 * Story 6.1 — per-step verifier config per architecture line 779 (FR38).
 *
 * Each field is OPTIONAL:
 *   - `requiredFiles` — extra files the verifier checks for existence.
 *   - `requiredFrontmatterSections` — extra frontmatter sections the
 *     verifier checks within the step's primary artifact.
 *   - `mode` — merge-vs-replace semantics (default: merge with the
 *     registry baseline; see Story 6.5 OQ-3 + OQ-4 for full semantics).
 *
 * Story 6.5 — `.strict()` per I-46 forward-tracker (rejects unknown
 * fields like `schema: "MySchema"`, `verifierFile`, `judge`, `customFn`,
 * `custom` at LOAD time per AR17 + AC-3 dual-purpose). The AR17
 * security boundary is enforced via TWO layers: (a) the schema declares
 * NO `custom` / `customFn` / `judge` / `schema` / `verifierFile` field
 * (schema-time enforcement), and (b) `.strict()` rejects unknown keys
 * with a single-line ConfigError actionable hint at LOAD time
 * (parse-time enforcement). Defence-in-depth per AR42. Backwards-compat
 * preserved (existing fixtures use only the documented 3 fields).
 */
export const VerifierConfigSchema = z
  .object({
    requiredFiles: z.array(z.string()).optional(),
    requiredFrontmatterSections: z.array(z.string()).optional(),
    mode: z.enum(["merge", "replace"]).optional(),
  })
  .strict();

/**
 * Story 6.1 — record of step-id → VerifierConfig. FR38 PRIMARY.
 */
export const VerifiersSchema = z.record(z.string(), VerifierConfigSchema);

export type VerifierConfig = z.infer<typeof VerifierConfigSchema>;
export type Verifiers = z.infer<typeof VerifiersSchema>;

/**
 * Story 6.1 — per-step model selector enum per architecture line 781.
 *
 * v0.1 supports the three Anthropic Claude tiers exposed via Claude Code
 * Task tool dispatch. Other providers (e.g., GPT) are out of scope.
 */
export const ModelSchema = z.enum(["sonnet", "opus", "haiku"]);

/**
 * Story 6.1 — record of step-id → Model.
 */
export const ModelsSchema = z.record(z.string(), ModelSchema);

export type Model = z.infer<typeof ModelSchema>;
export type Models = z.infer<typeof ModelsSchema>;

/**
 * Story 6.1 — per-step budget block per architecture line 782.
 *
 * Each field is OPTIONAL. Unset fields fall through to plugin defaults
 * applied by the budget enforcer (Story 6.4 consumer at
 * `src/dispatch/generate-spec.ts:208-211` — `?? 60_000` / `?? 300_000`).
 *   - `contextTokens` — per-step context-window cap (positive integer).
 *   - `timeoutMs` — per-step wall-clock cap in milliseconds (positive).
 *
 * Story 6.4 — `.strict()` per I-38 forward-tracker (rejects unknown fields
 * like `costUsd` or `maxToolCalls` at LOAD time with a single-line
 * ConfigError). Backwards-compat: existing fixtures use only `contextTokens`
 * + `timeoutMs` — non-breaking.
 */
export const BudgetSchema = z
  .object({
    contextTokens: z.number().int().positive().optional(),
    timeoutMs: z.number().int().positive().optional(),
  })
  .strict();

/**
 * Story 6.1 — record of step-id → Budget. FR for Story 6.4 forward-tracker.
 */
export const BudgetsSchema = z.record(z.string(), BudgetSchema);

export type Budget = z.infer<typeof BudgetSchema>;
export type Budgets = z.infer<typeof BudgetsSchema>;

/**
 * Story 6.1 — paths block per architecture lines 783-787 (FR39 PRIMARY).
 *
 * All four fields REQUIRED. Defaults are applied at the loader layer
 * (`src/config/defaults.ts`); the schema requires explicit values once a
 * `paths:` block is present. The four canonical fields:
 *   - `state` — state.yaml path.
 *   - `runs` — runs/ directory root.
 *   - `staging` — staging/ directory root.
 *   - `telemetry` — telemetry output root (Story 6.6 forward-tracker).
 */
export const PathsSchema = z.object({
  state: z.string(),
  runs: z.string(),
  staging: z.string(),
  telemetry: z.string(),
});

export type Paths = z.infer<typeof PathsSchema>;

/**
 * Story 6.1 — telemetry block per architecture line 789 (FR40 PRIMARY).
 *
 * `enabled: boolean` is the only field at v0.1; defaults to `false`
 * (NFR-S3 telemetry-opt-in discipline). Story 6.6 may extend with
 * additional fields (sampling rate, output path) via schema bump.
 */
export const TelemetrySchema = z.object({
  enabled: z.boolean(),
});

export type Telemetry = z.infer<typeof TelemetrySchema>;

// ─── Top-level schema ──────────────────────────────────────────────────────

export const ConfigV1Schema = z.object({
  schemaVersion: z.literal(1),
  /**
   * Story 6.1 — narrowed from `z.record(z.string(), z.unknown())` to
   * `PersonasSchema` (string | string[] values per architecture line 777).
   */
  personas: PersonasSchema.default({}),
  /**
   * Story 6.1 — narrowed from `z.record(z.string(), z.unknown())` to
   * `OverridesSchema` (typed override entries per architecture line 778).
   */
  overrides: OverridesSchema.default({}),
  /**
   * Story 6.1 — narrowed from `z.record(z.string(), z.unknown())` to
   * `VerifiersSchema` (typed verifier config per architecture line 779).
   */
  verifiers: VerifiersSchema.default({}),
  /**
   * Story 5.6 — per-step failure policy block (FR31 PRIMARY). NARROWED
   * from `z.record(z.string(), z.unknown())` (Story 1.5 baseline) to
   * `FailurePoliciesSchema` (closed enum union). User-authored configs
   * with invalid policy values (e.g., typos) are rejected at parse time
   * with a structured Zod validation error per OQ-10.
   */
  failurePolicies: FailurePoliciesSchema.default({}),
  /**
   * Story 6.1 — narrowed from `z.record(z.string(), z.unknown())` to
   * `ModelsSchema` (sonnet/opus/haiku enum per architecture line 781).
   */
  models: ModelsSchema.default({}),
  /**
   * Story 6.1 — narrowed from `z.record(z.string(), z.unknown())` to
   * `BudgetsSchema` (typed budget block per architecture line 782).
   */
  budgets: BudgetsSchema.default({}),
  /**
   * Story 6.1 — paths block per architecture lines 783-787 (FR39 PRIMARY).
   */
  paths: PathsSchema,
  /**
   * Story 6.1 — telemetry block per architecture line 789 (FR40 PRIMARY).
   */
  telemetry: TelemetrySchema,
});

export type ConfigV1 = z.infer<typeof ConfigV1Schema>;
export type Config = ConfigV1;
export const ConfigLatestSchema = ConfigV1Schema;

/**
 * Story 6.1 — Personas type alias.
 */
export type Personas = z.infer<typeof PersonasSchema>;
