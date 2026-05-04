/**
 * src/dag/seed-v6.x.ts — Tier 1 hand-curated seed for BMAD v6.5 skills
 * (FR1, FR2, FR8, FR9, FR35, AR33, AR41).
 *
 * Architecture §D5 lines 411-443 mandates a three-tier discovery cascade
 * for the step DAG:
 *   Tier 1 (seed)        — this file, the FAST PATH (zero IO at runtime,
 *                          compiled into the bundle).
 *   Tier 2 (overrides)   — `bmad-stepper.config.yaml`, parsed by `build.ts`.
 *   Tier 3 (frontmatter) — `<pluginDir>/skills/<name>/SKILL.md` parsed by
 *                          `build.ts` for skills not in seed/overrides.
 *
 * Maintenance contract (architecture line 443): every BMAD upstream minor
 * release triggers a CI compatibility job that re-runs the seed against the
 * upstream skill list. New skills in BMAD trigger either a seed PR (this
 * file) or an opt-in via `bmad-stepper.config.yaml` overrides.
 *
 * Architecture compliance:
 *   - §D5 lines 411-443 — three-tier discovery; this file IS Tier 1.
 *   - AR33 line 213    — readonly fields, no IO, no `console.*`.
 *   - AR41 line 1296   — `src/dag/` is mid-tier; this file imports only
 *                        `./types.ts` (intra-module sibling — allowed).
 *
 * Persona naming convention: kebab-case identifiers matching Story 1.11's
 * `src/personas/defaults.ts` map. Identifiers used in this seed:
 *   `analyst`, `pm`, `architect`, `ux-designer`, `dev`, `tech-writer`,
 *   `tea`. **Forward dependency**: if Story 1.11 picks different
 *   identifiers, this seed must be updated to match.
 *
 * Sizing: ~40 entries — within the architecture's "30-50 nodes" sweet
 * spot. Sorted by phase grouping for review readability; the in-memory
 * insertion order matches the array order, keeping iteration
 * deterministic for Tarjan traversal stability.
 *
 * Note: this file is intentionally large (~150 lines for the array
 * literal) and dense; it is the canonical Tier 1 contract. Future seed
 * PRs append entries; do not refactor into multiple files.
 */

import type { SeedEntry } from "./types.ts";

/**
 * BMAD plugin compatibility version this seed targets. Bumped in lock-step
 * with upstream BMAD releases (architecture line 443).
 */
export const SEED_BMAD_VERSION = "6.5";

/**
 * Hand-curated seed array. Each entry is a `SeedEntry` — `DagNode` minus
 * `before` (computed by `build()`) and `idempotent` (Story 5.1 forward
 * dependency). Names match the BMAD plugin skill directory names verbatim
 * (the strings `detectBmadSkills()` returns; Story 1.9).
 */
export const seedV6_x: readonly SeedEntry[] = [
  // Phase: analysis (5)
  {
    name: "bmad-brainstorming",
    phase: "analysis",
    after: [],
    optional: true,
    persona: "analyst",
  },
  {
    name: "bmad-domain-research",
    phase: "analysis",
    after: [],
    optional: true,
    persona: "analyst",
  },
  {
    name: "bmad-market-research",
    phase: "analysis",
    after: [],
    optional: true,
    persona: "analyst",
  },
  {
    name: "bmad-product-brief",
    phase: "analysis",
    after: ["bmad-brainstorming"],
    optional: true,
    persona: "analyst",
  },
  {
    name: "bmad-prfaq",
    phase: "analysis",
    after: ["bmad-product-brief"],
    optional: true,
    persona: "pm",
  },

  // Phase: planning (5)
  {
    name: "bmad-create-prd",
    phase: "planning",
    after: ["bmad-product-brief"],
    optional: false,
    persona: "pm",
  },
  {
    name: "bmad-validate-prd",
    phase: "planning",
    after: ["bmad-create-prd"],
    optional: true,
    persona: "pm",
  },
  {
    name: "bmad-edit-prd",
    phase: "planning",
    after: ["bmad-create-prd"],
    optional: true,
    persona: "pm",
  },
  {
    name: "bmad-create-ux-design",
    phase: "planning",
    after: ["bmad-create-prd"],
    optional: true,
    persona: "ux-designer",
  },
  {
    name: "bmad-create-epics-and-stories",
    phase: "planning",
    after: ["bmad-create-prd"],
    optional: false,
    persona: "pm",
  },

  // Phase: solutioning (4)
  {
    name: "bmad-create-architecture",
    phase: "solutioning",
    after: ["bmad-create-epics-and-stories"],
    optional: false,
    persona: "architect",
  },
  {
    name: "bmad-check-implementation-readiness",
    phase: "solutioning",
    after: ["bmad-create-architecture"],
    optional: false,
    persona: "architect",
  },
  {
    name: "bmad-sprint-planning",
    phase: "solutioning",
    after: ["bmad-check-implementation-readiness"],
    optional: false,
    persona: "pm",
  },
  {
    name: "bmad-technical-research",
    phase: "solutioning",
    after: [],
    optional: true,
    persona: "analyst",
  },

  // Phase: implementation — core dev chain (10)
  {
    name: "bmad-create-story",
    phase: "implementation",
    after: ["bmad-sprint-planning"],
    optional: false,
    persona: ["analyst", "pm"],
  },
  {
    name: "bmad-dev-story",
    phase: "implementation",
    after: ["bmad-create-story"],
    optional: false,
    persona: "dev",
  },
  {
    name: "bmad-quick-dev",
    phase: "implementation",
    after: ["bmad-create-story"],
    optional: true,
    persona: "dev",
  },
  {
    name: "bmad-code-review",
    phase: "implementation",
    after: ["bmad-dev-story"],
    optional: false,
    persona: "dev",
  },
  {
    name: "bmad-correct-course",
    phase: "implementation",
    after: ["bmad-create-story"],
    optional: true,
    persona: "pm",
  },
  {
    name: "bmad-checkpoint-preview",
    phase: "implementation",
    after: ["bmad-dev-story"],
    optional: true,
    persona: "dev",
  },
  {
    name: "bmad-generate-project-context",
    phase: "implementation",
    after: ["bmad-create-architecture"],
    optional: true,
    persona: "tech-writer",
  },
  {
    name: "bmad-document-project",
    phase: "implementation",
    after: ["bmad-create-architecture"],
    optional: true,
    persona: "tech-writer",
  },
  {
    name: "bmad-customize",
    phase: "implementation",
    after: [],
    optional: true,
    persona: null,
  },
  {
    name: "bmad-shard-doc",
    phase: "implementation",
    after: ["bmad-create-architecture"],
    optional: true,
    persona: null,
  },

  // Phase: implementation — testarch (8)
  {
    name: "bmad-testarch-framework",
    phase: "implementation",
    after: ["bmad-create-architecture"],
    optional: true,
    persona: "tea",
  },
  {
    name: "bmad-testarch-ci",
    phase: "implementation",
    after: ["bmad-testarch-framework"],
    optional: true,
    persona: "tea",
  },
  {
    name: "bmad-testarch-test-design",
    phase: "implementation",
    after: ["bmad-testarch-framework"],
    optional: true,
    persona: "tea",
  },
  {
    name: "bmad-testarch-atdd",
    phase: "implementation",
    after: ["bmad-testarch-test-design"],
    optional: true,
    persona: "tea",
  },
  {
    name: "bmad-testarch-automate",
    phase: "implementation",
    after: ["bmad-testarch-atdd"],
    optional: true,
    persona: "tea",
  },
  {
    name: "bmad-testarch-test-review",
    phase: "implementation",
    after: ["bmad-testarch-automate"],
    optional: true,
    persona: "tea",
  },
  {
    name: "bmad-testarch-trace",
    phase: "implementation",
    after: ["bmad-testarch-automate"],
    optional: true,
    persona: "tea",
  },
  {
    name: "bmad-testarch-nfr",
    phase: "implementation",
    after: ["bmad-create-architecture"],
    optional: true,
    persona: "tea",
  },

  // Phase: implementation — editorial / review (5)
  {
    name: "bmad-editorial-review-prose",
    phase: "implementation",
    after: ["bmad-create-prd"],
    optional: true,
    persona: "tech-writer",
  },
  {
    name: "bmad-editorial-review-structure",
    phase: "implementation",
    after: ["bmad-create-prd"],
    optional: true,
    persona: "tech-writer",
  },
  {
    name: "bmad-review-adversarial-general",
    phase: "implementation",
    after: ["bmad-dev-story"],
    optional: true,
    persona: "dev",
  },
  {
    name: "bmad-review-edge-case-hunter",
    phase: "implementation",
    after: ["bmad-dev-story"],
    optional: true,
    persona: "dev",
  },
  {
    name: "bmad-index-docs",
    phase: "implementation",
    after: [],
    optional: true,
    persona: "tech-writer",
  },

  // Phase: retro (1)
  {
    name: "bmad-retrospective",
    phase: "retro",
    after: ["bmad-code-review"],
    optional: true,
    persona: "pm",
  },

  // Misc / utility (3)
  {
    name: "bmad-help",
    phase: "analysis",
    after: [],
    optional: true,
    persona: null,
  },
  {
    name: "bmad-advanced-elicitation",
    phase: "analysis",
    after: [],
    optional: true,
    persona: null,
  },
  {
    name: "bmad-distillator",
    phase: "analysis",
    after: [],
    optional: true,
    persona: null,
  },
];
