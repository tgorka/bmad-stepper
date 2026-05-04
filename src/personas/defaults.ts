/**
 * src/personas/defaults.ts — Tier 3 hand-curated persona-default map
 * (FR12, FR34, FR40, NFR-R1, NFR-I2, AR33, AR41).
 *
 * Foundational mid-tier module per AR41 (architecture lines 1278-1304).
 * Mirrors `src/dag/seed-v6.x.ts` `persona` field for every non-null entry
 * in kebab-case identifiers: `analyst`, `pm`, `architect`, `ux-designer`,
 * `dev`, `tech-writer`, `tea`. Null-persona seed entries are OMITTED so
 * Tier 4 (module-config triggers) or the no-tier-resolves throw fires.
 *
 * **TYPE-LEVEL MIRRORING CONTRACT** with `src/dag/seed-v6.x.ts`:
 * any change to the seed `persona` field set MUST land in this file in
 * the same PR. Per AR41 mid-tier-to-mid-tier ban, this file does NOT
 * import the seed at runtime — coordination is via TYPE-level mirroring
 * (verified by `defaults.test.ts` which imports the seed under the
 * test-only cross-module exception).
 *
 * Architecture compliance:
 *   - §D13 lines 631-642 — 4-tier resolution + multi-persona sequential
 *                          dispatch. This file IS Tier 3.
 *   - AR33 line 213    — readonly fields, no IO, no `console.*`.
 *   - AR41 line 1296   — `src/personas/` is mid-tier; this file imports
 *                        nothing.
 *
 * Sizing: 36 entries (45 seed - 9 null-persona seed entries: bmad-customize,
 * bmad-shard-doc, bmad-help, bmad-advanced-elicitation, bmad-distillator,
 * plus the 4 phase-utility nulls if any). The defaults map is the FAST
 * PATH — zero IO at runtime, already compiled into the bundle.
 */

/**
 * Hand-curated default persona map. Keys are BMAD plugin skill directory
 * names (kebab-case). Values are persona identifiers in kebab-case
 * (`string`) or arrays of identifiers (`readonly string[]`) for
 * multi-persona steps that dispatch sub-agents sequentially per
 * architecture line 640 + PRD §17.
 */
export const DEFAULT_PERSONAS: Record<string, string | readonly string[]> = {
  // Phase: analysis (5)
  "bmad-brainstorming": "analyst",
  "bmad-domain-research": "analyst",
  "bmad-market-research": "analyst",
  "bmad-product-brief": "analyst",
  "bmad-prfaq": "pm",

  // Phase: planning (5)
  "bmad-create-prd": "pm",
  "bmad-validate-prd": "pm",
  "bmad-edit-prd": "pm",
  "bmad-create-ux-design": "ux-designer",
  "bmad-create-epics-and-stories": "pm",

  // Phase: solutioning (4)
  "bmad-create-architecture": "architect",
  "bmad-check-implementation-readiness": "architect",
  "bmad-sprint-planning": "pm",
  "bmad-technical-research": "analyst",

  // Phase: implementation — core dev chain (8 non-null personas; 2 null-persona
  // seed entries [bmad-customize, bmad-shard-doc] are OMITTED)
  "bmad-create-story": ["analyst", "pm"] as const,
  "bmad-dev-story": "dev",
  "bmad-quick-dev": "dev",
  "bmad-code-review": "dev",
  "bmad-correct-course": "pm",
  "bmad-checkpoint-preview": "dev",
  "bmad-generate-project-context": "tech-writer",
  "bmad-document-project": "tech-writer",

  // Phase: implementation — testarch (8)
  "bmad-testarch-framework": "tea",
  "bmad-testarch-ci": "tea",
  "bmad-testarch-test-design": "tea",
  "bmad-testarch-atdd": "tea",
  "bmad-testarch-automate": "tea",
  "bmad-testarch-test-review": "tea",
  "bmad-testarch-trace": "tea",
  "bmad-testarch-nfr": "tea",

  // Phase: implementation — editorial / review (5)
  "bmad-editorial-review-prose": "tech-writer",
  "bmad-editorial-review-structure": "tech-writer",
  "bmad-review-adversarial-general": "dev",
  "bmad-review-edge-case-hunter": "dev",
  "bmad-index-docs": "tech-writer",

  // Phase: retro (1)
  "bmad-retrospective": "pm",

  // Misc / utility (3) — bmad-help, bmad-advanced-elicitation, bmad-distillator
  // are OMITTED (their seed `persona` is `null`; they fall through to Tier 4
  // or throw via the no-tier-resolves path).
};
