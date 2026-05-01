/**
 * src/verifiers/defaults.ts — Hand-curated per-step verifier configuration
 * defaults (FR17, FR38, AR33, AR41).
 *
 * **HIGHER-TIER module per AR41** (architecture lines 1287-1289). Allowed
 * imports: foundational + intra-module sibling (`./types.ts`). This file
 * imports ONLY `./types.ts`. Pure data; zero IO at module load.
 *
 * Architecture compliance:
 *   - §D9 lines 482-487 — `VerifierConfig` shape; resolution priority
 *     (line 490): "Project config (`bmad-stepper.config.yaml`
 *     `verifiers:`) overrides plugin defaults". v0.1 ships ONLY the
 *     plugin defaults; the project-config override resolver is Story 6.5.
 *   - §directory-listing line 1163 — `src/verifiers/` lists per-step
 *     files (`prd.ts`, `architecture.ts`, ...). v0.1 consolidates all
 *     per-step entries into this single `defaults.ts` file (mirrors
 *     Story 1.11's `src/personas/defaults.ts` pattern). Per-file split
 *     can land in Story 6.5 if project-config overrides require per-step
 *     granularity.
 *   - §line 1727 — LLM-as-judge `judge:` field is a deferred post-v0.1
 *     extension. v0.1 ships **conservative deterministic checks only**
 *     (file-existence, frontmatter, optional Zod schema, optional
 *     deterministic custom callback).
 *
 * Per-step entries (mirroring AC-1 verbatim list + architecture line 1163):
 *   - `default` — baseline fallback for any unregistered step.
 *   - `prd`, `architecture`, `dev-story`, `code-review` — markdown
 *     artifact with `title` + `status` frontmatter.
 *   - `story-create` — markdown artifact with `title` + `status` +
 *     `story_id` (story files require the story identifier).
 *   - `retro` — markdown artifact with `status` + `epic` (retrospective
 *     ties to a specific epic per Story 1.13 / epic-1-retrospective.md).
 *   - `analyst-research` — markdown artifact with `title` only (research
 *     output may not have a status workflow yet).
 *
 * The empty `schema: null` fields are **deferred** to per-artifact body
 * schema stories (Story 6.x). The `checks/schema.ts` runner is in place
 * so Story 6.x can register schemas without modifying the orchestrator.
 *
 * Sizing: 8 entries (1 default + 7 step types) — well under the
 * "30-50 nodes" rule of thumb that applies to the much larger DAG seed.
 */

import type { VerifierConfig } from "./types.ts";

/**
 * Hand-curated map of step name → `VerifierConfig`. Keys are BMAD step
 * type names (the canonical short names: `prd`, `dev-story`, ...).
 * Values are `VerifierConfig` literals with conservative `requiredFiles`
 * + `requiredFrontmatterSections` and `schema: null` (deferred).
 *
 * The `default` baseline is the fallback used by `getVerifierConfig`
 * when the requested step name is not registered (e.g., a custom
 * project step type).
 */
export const defaultVerifiers: Readonly<Record<string, VerifierConfig>> = {
  default: {
    requiredFiles: [],
    requiredFrontmatterSections: [],
    schema: null,
  },
  prd: {
    requiredFiles: ["**/*.md"],
    requiredFrontmatterSections: ["title", "status"],
    schema: null,
  },
  architecture: {
    requiredFiles: ["**/*.md"],
    requiredFrontmatterSections: ["title", "status"],
    schema: null,
  },
  "story-create": {
    requiredFiles: ["**/*.md"],
    requiredFrontmatterSections: ["title", "status", "story_id"],
    schema: null,
  },
  "dev-story": {
    requiredFiles: ["**/*.md"],
    requiredFrontmatterSections: ["title", "status"],
    schema: null,
  },
  "code-review": {
    requiredFiles: ["**/*.md"],
    requiredFrontmatterSections: ["title", "status"],
    schema: null,
  },
  retro: {
    requiredFiles: ["**/*.md"],
    requiredFrontmatterSections: ["status", "epic"],
    schema: null,
  },
  "analyst-research": {
    requiredFiles: ["**/*.md"],
    requiredFrontmatterSections: ["title"],
    schema: null,
  },
} as const;
