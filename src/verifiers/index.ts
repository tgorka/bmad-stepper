/**
 * src/verifiers/index.ts — Public barrel for the verifier module
 * (FR17, FR38, NFR-M3, NFR-S6, NFR-R1, NFR-S1, AR21, AR22, AR33, AR41).
 *
 * **HIGHER-TIER module per AR41** (architecture lines 1287-1289). The
 * `src/verifiers/` module is the FIRST higher-tier module of the
 * project; depends on foundational + (optionally) mid-tier modules;
 * NEVER on sibling higher-tier modules (`../dispatch/`, `../failure-ux/`).
 *
 * Story 2.1 ships the verifier registry + default per-step configs +
 * the `runVerifier` orchestrator. The four built-in checks
 * (`required-files`, `frontmatter`, `schema`, `custom`) are exported as
 * named functions so consumers (Story 2.6 `verify-and-advance.ts`,
 * Epic 5 failure-UX engine) can invoke them in isolation if needed.
 *
 * Public surface intentionally omits internal helpers (e.g.,
 * frontmatter regex, JSON-parse fallback) — those stay private to
 * `./checks.ts`.
 */

export type { RunVerifierOptions, RunVerifierResult } from "./checks.ts";
export {
  checkCustom,
  checkFrontmatter,
  checkRequiredFiles,
  checkSchema,
  runVerifier,
} from "./checks.ts";
export { defaultVerifiers } from "./defaults.ts";
export { getVerifierConfig, verifierRegistry } from "./registry.ts";
export type {
  ArtifactRef,
  CheckResult,
  Result,
  VerifierConfig,
  VerifierError,
} from "./types.ts";
