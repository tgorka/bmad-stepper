/**
 * src/verifiers/registry.ts — Public registry + lookup for the verifier
 * module (FR17, FR38, AR33, AR41).
 *
 * **HIGHER-TIER module per AR41** (architecture lines 1287-1289). Allowed
 * imports: foundational + intra-module siblings (`./types.ts`,
 * `./defaults.ts`). This file imports ONLY those siblings — no IO, no
 * external dependencies, no upward imports.
 *
 * Architecture compliance:
 *   - §D9 lines 482-487 — registry concept + per-step lookup. Resolution
 *     priority (line 490): "Project config (`bmad-stepper.config.yaml`
 *     `verifiers:`) overrides plugin defaults". v0.1 ships
 *     `verifierRegistry === defaultVerifiers` (no project-config layer
 *     yet); the project-config-aware override resolver lands in
 *     **Story 6.5** (FR38 second half).
 *   - AR33 — synchronous lookup; throws a plain `Error` only on the
 *     architecture-invariant violation (missing `default` baseline) —
 *     this is a programming error, NOT a runtime user-facing failure
 *     (the test gate enforces the invariant).
 */

import { defaultVerifiers } from "./defaults.ts";
import type { VerifierConfig } from "./types.ts";

/**
 * Public registry of per-step verifier configurations. v0.1 shipped value
 * is the `defaultVerifiers` map verbatim (the plugin defaults — Tier 1
 * by analogy with Story 1.10's seed-v6.x DAG and Story 1.11's
 * persona defaults). Story 6.5 extends this with project-config layer
 * resolution.
 *
 * Consumers (Story 2.6 `verify-and-advance.ts`, Epic 5 failure-UX
 * engine) use `getVerifierConfig(stepName)` rather than indexing the
 * registry directly — that helper handles the `default` fallback path.
 */
export const verifierRegistry: Readonly<Record<string, VerifierConfig>> =
  defaultVerifiers;

/**
 * Look up the verifier config for a step name. Falls back to the
 * `default` baseline (empty `requiredFiles` + empty
 * `requiredFrontmatterSections` + `schema: null`) when the step is not
 * explicitly registered. The fallback semantics let callers verify
 * unknown / custom step types without raising — the verifier produces
 * `status: "pass"` with all checks `"skip"`, so the orchestrator
 * proceeds without halting on unrecognised step names.
 *
 * Throws a plain `Error` (NOT a `StepperError`) on the
 * architecture-invariant violation that the `default` baseline is
 * missing — this is a programming error caught by the test gate, not a
 * runtime user-facing failure.
 *
 * @param stepName — the BMAD step name (e.g., `"dev-story"`, `"prd"`).
 * @returns the per-step config, or the `default` baseline.
 */
export function getVerifierConfig(stepName: string): VerifierConfig {
  const config = verifierRegistry[stepName];
  if (config !== undefined) {
    return config;
  }
  const baseline = verifierRegistry.default;
  if (baseline === undefined) {
    throw new Error(
      "verifier registry is missing the `default` baseline (architecture §D9 invariant)",
    );
  }
  return baseline;
}
