/**
 * src/verifiers/types.ts — Public type surface for the verifier module
 * (FR17, FR38, NFR-M3, NFR-S6, NFR-R1, NFR-S1, AR21, AR22, AR33, AR41).
 *
 * **HIGHER-TIER module per AR41** (architecture lines 1287-1289). Allowed
 * imports: foundational (`../errors.ts`, `../io/`, `../schemas/`); mid-tier
 * (`../dag/`, `../personas/` — both OPTIONAL, NOT used by this file); Bun
 * stdlib; Node stdlib; `zod` only. **FORBIDDEN**: sibling higher-tier
 * (`../dispatch/`, `../failure-ux/`).
 *
 * This file defines the `VerifierConfig` shape verbatim from architecture
 * §D9 lines 482-487 plus the supporting types `ArtifactRef`,
 * `VerifierError`, `Result<T, E>`. The `Result<T, E>` type is the AR33
 * sole-exception per architecture line 858 (originally introduced by
 * Story 1.7's CLI argument parser); custom verifier callbacks are the
 * SECOND legitimate use site by analogy.
 */

import type { ZodSchema } from "zod";

/**
 * Reference handle to a sub-agent artifact under
 * `staging/<runId>/outputs/`. Carries the absolute path + the resolved
 * step name + the dispatch run id. Custom checks receive this and may
 * read the file content via `Bun.file(artifact.path).text()`.
 *
 * **NFR-S6 (no execution of sub-agent output)**: the verifier reads but
 * never executes the artifact body. The custom-check signature receives
 * an `ArtifactRef` (path-handle), NOT the parsed body — the project's
 * own custom callback decides how to read.
 */
export interface ArtifactRef {
  /** Absolute filesystem path to the artifact file. */
  readonly path: string;
  /** Resolved BMAD step name (e.g., `"dev-story"`, `"prd"`). */
  readonly stepName: string;
  /** Dispatch run id (architecture §P5 — the `runId` query parameter). */
  readonly runId: string;
  /** Absolute path to the staging outputs directory containing the artifact. */
  readonly outputsDir: string;
}

/**
 * Custom-check error shape per architecture §D9 line 486. Wraps a single
 * failure detail; the orchestrator collects these into the `checks[]`
 * array of the final `VerifierResultV1`. The `check` field defaults to
 * `"custom"` when the orchestrator translates a custom-callback failure
 * into a check result; the project may override it for finer-grained
 * reporting (e.g., `"custom:body-md-headings"`).
 */
export interface VerifierError {
  /** Check name (e.g., `"frontmatter"`, `"custom"`). */
  readonly check: string;
  /** Human-readable failure detail rendered in `verifier-result.json`. */
  readonly detail: string;
}

/**
 * Result type used ONLY by `VerifierConfig.custom?` callbacks (architecture
 * line 858 sole-exception to AR33 throw-everywhere discipline; mirrors
 * `src/commands/next/args.ts` from Story 1.7). The custom callback
 * returns this discriminated union to surface failure detail to the
 * orchestrator without throwing — the orchestrator then renders the
 * failure into the structured `VerifierResultV1.checks[]` array, NOT
 * into a thrown error (per AC-3 + AC-4: per-check failures are reported
 * via `status: "fail"`, NOT thrown).
 */
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/**
 * Per-step verifier configuration shape — verbatim from architecture
 * §D9 lines 482-487. Plugin defaults live in `src/verifiers/defaults.ts`;
 * project-config override resolution (the `bmad-stepper.config.yaml`
 * `verifiers:` block) is deferred to Story 6.5 (FR38 second half).
 *
 * Fields:
 *   - `requiredFiles` — glob patterns evaluated against
 *     `staging/<runId>/outputs/`. Empty array → check skips.
 *   - `requiredFrontmatterSections` — top-level YAML frontmatter keys
 *     that must exist (truthy) on the primary artifact. Empty array →
 *     check skips. Depth-1 only (no dotted-path lookup) for v0.1.
 *   - `schema` — optional Zod schema for the artifact body. v0.1 default
 *     configs all set this to `null`; per-artifact body schemas land in
 *     Story 6.x.
 *   - `custom?` — optional deterministic-stateless callback (sync or
 *     async). Per architecture §D9 line 490 + AC-5: no Claude calls, no
 *     network. v0.1 default configs do NOT register any custom
 *     callbacks; project-config overrides may add them in Story 6.5.
 */
export interface VerifierConfig {
  /** Glob patterns relative to `staging/<runId>/outputs/`. */
  readonly requiredFiles: readonly string[];
  /** Top-level YAML frontmatter keys that must exist on the primary artifact. */
  readonly requiredFrontmatterSections: readonly string[];
  /** Optional Zod schema for the artifact body (post-frontmatter content). */
  readonly schema: ZodSchema | null;
  /**
   * Optional deterministic-stateless callback. Receives an `ArtifactRef`
   * (path-handle, NOT the parsed body — NFR-S6); returns
   * `Result<void, VerifierError>` (sync OR async). MUST NOT call Claude,
   * MUST NOT touch the network, MUST NOT spawn network tools (per
   * architecture §D9 line 490 + AC-5). v0.1 enforces this by convention
   * + JSDoc only; runtime sandboxing (e.g., `--no-network` flag scan) is
   * a Story 6.5 follow-up.
   */
  readonly custom?: (
    artifact: ArtifactRef,
  ) => Promise<Result<void, VerifierError>> | Result<void, VerifierError>;
}

/**
 * Per-check result row that the orchestrator assembles into the
 * `VerifierResultV1.checks[]` array. The shape is structurally
 * compatible with `src/schemas/verifier-result.ts`'s nested check object
 * (Story 1.5).
 */
export interface CheckResult {
  /** Check name: one of `"required-files"`, `"frontmatter"`, `"schema"`, `"custom"`. */
  readonly name: string;
  /** Per-check status (`"pass" | "fail" | "skip"` — same enum as the aggregate). */
  readonly status: "pass" | "fail" | "skip";
  /** Human-readable detail rendered verbatim into the JSON result. */
  readonly detail: string;
}
