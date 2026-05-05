/**
 * src/verifiers/registry.ts — Public registry + lookup for the verifier
 * module (FR17, FR38, AR33, AR41).
 *
 * **HIGHER-TIER module per AR41** (architecture lines 1287-1289). Allowed
 * imports: foundational + intra-module siblings (`./types.ts`,
 * `./defaults.ts`, plus the foundational schema-tier `../schemas/config.ts`
 * type-only import for `Verifiers` per Story 2.1's `checks.ts` precedent
 * — the `import type` qualifier ensures NO runtime dependency).
 *
 * Architecture compliance:
 *   - §D9 lines 482-487 — registry concept + per-step lookup. Resolution
 *     priority (line 490): "Project config (`bmad-stepper.config.yaml`
 *     `verifiers:`) overrides plugin defaults". Story 6.5 wires the
 *     project-config layer via the optional `projectVerifiers` 2nd arg
 *     to `getVerifierConfig` (FR38 second half). When the 2nd arg is
 *     `undefined`, behaviour is byte-identical to Story 2.1 (no
 *     regression for the 21 existing tests + production callers that
 *     have not threaded config yet).
 *   - AR17 — security boundary: `custom?` callback + `schema` field are
 *     PLUGIN-SIDE ONLY, never sourced from project config. The TWO-LAYER
 *     enforcement (schema declaration + `.strict()` parse) prevents user
 *     code execution at the type system AND the LOAD path; the merge
 *     logic reinforces at runtime by reading `custom?` / `schema` from
 *     the BASELINE entry only.
 *   - AR33 — synchronous lookup; throws a plain `Error` only on the
 *     architecture-invariant violation (missing `default` baseline) —
 *     this is a programming error, NOT a runtime user-facing failure
 *     (the test gate enforces the invariant).
 */

import type { Verifiers } from "../schemas/config.ts";
import { defaultVerifiers } from "./defaults.ts";
import type { VerifierConfig } from "./types.ts";

/**
 * Public registry of per-step verifier configurations. v0.1 shipped value
 * is the `defaultVerifiers` map verbatim (the plugin defaults — Tier 1
 * by analogy with Story 1.10's seed-v6.x DAG and Story 1.11's
 * persona defaults). Story 6.5 layers project-config-aware merge /
 * replace via `getVerifierConfig(stepName, projectVerifiers)`.
 *
 * Consumers (Story 2.6 `verify-and-advance.ts`, Epic 5 failure-UX
 * engine) use `getVerifierConfig(stepName)` rather than indexing the
 * registry directly — that helper handles the `default` fallback path
 * AND (Story 6.5) the optional project-config merge / replace.
 */
export const verifierRegistry: Readonly<Record<string, VerifierConfig>> =
  defaultVerifiers;

/**
 * Look up the verifier config for a step name, optionally layering a
 * project-config override on top of the plugin baseline.
 *
 * **Without `projectVerifiers` (Story 2.1 behaviour, byte-identical):**
 *   Falls back to the `default` baseline (empty `requiredFiles` + empty
 *   `requiredFrontmatterSections` + `schema: null`) when the step is not
 *   explicitly registered. The fallback semantics let callers verify
 *   unknown / custom step types without raising — the verifier produces
 *   `status: "pass"` with all checks `"skip"`, so the orchestrator
 *   proceeds without halting on unrecognised step names.
 *
 * **With `projectVerifiers` (Story 6.5 wiring):**
 *   When `projectVerifiers[stepName]` is defined, the override is layered
 *   on the baseline per the override's `mode` field (default `"merge"`):
 *
 *   - `mode: "merge"` (OQ-4) — array union with baseline-order-preserved
 *     and de-dup. `requiredFiles = baseline.requiredFiles ∪ override.requiredFiles`,
 *     same for `requiredFrontmatterSections`. New override entries are
 *     appended after the baseline; duplicates collapse to a single entry
 *     in baseline-position. `schema` and `custom?` always come from the
 *     baseline (AR17).
 *   - `mode: "replace"` (OQ-3) — full-section replacement. Explicit
 *     fields in the override take effect; UNSET fields fall through to
 *     EMPTY ARRAYS, NOT to the baseline (the user opted into replace
 *     mode without supplying that field, so the baseline is cleared).
 *     `schema` and `custom?` STILL come from the baseline (AR17 — these
 *     are plugin-side seams, NEVER project-supplied).
 *
 *   When `projectVerifiers[stepName]` is `undefined`, the function
 *   resolves identically to the no-config path (baseline lookup with
 *   `default` fallback).
 *
 * **AR17 security boundary (AC-2):** the schema-side `Verifiers` type
 * (defined in `src/schemas/config.ts`) declares ONLY data-only fields
 * (`requiredFiles?`, `requiredFrontmatterSections?`, `mode?`). The
 * registry-side `VerifierConfig` (`src/verifiers/types.ts`) declares the
 * full shape including `schema: ZodSchema | null` and the optional
 * `custom?` callback. The TYPE SYSTEM enforces that `custom?` and
 * `schema` cannot be read from `projectVerifiers` (no such field
 * exists); `.strict()` at the schema layer rejects unknown keys at LOAD
 * time. The merge logic preserves these from the baseline only.
 *
 * Throws a plain `Error` (NOT a `StepperError`) on the
 * architecture-invariant violation that the `default` baseline is
 * missing — this is a programming error caught by the test gate, not a
 * runtime user-facing failure.
 *
 * @param stepName — the BMAD step name (e.g., `"dev-story"`, `"prd"`).
 * @param projectVerifiers — optional project-config `Verifiers` map
 *   threaded from `Config.verifiers` (Story 6.1 `loadConfig()` output).
 *   When supplied AND `[stepName]` is defined, applies the merge /
 *   replace logic; otherwise byte-identical to Story 2.1 baseline.
 * @returns the per-step `VerifierConfig`, possibly with the project
 *   override layered.
 */
export function getVerifierConfig(
  stepName: string,
  projectVerifiers?: Verifiers,
): VerifierConfig {
  const baseline =
    verifierRegistry[stepName] ?? verifierRegistry.default ?? undefined;
  if (baseline === undefined) {
    throw new Error(
      "verifier registry is missing the `default` baseline (architecture §D9 invariant)",
    );
  }
  const override = projectVerifiers?.[stepName];
  if (override === undefined) {
    return baseline;
  }
  const mode = override.mode ?? "merge";
  if (mode === "replace") {
    return {
      requiredFiles: override.requiredFiles ?? [],
      requiredFrontmatterSections: override.requiredFrontmatterSections ?? [],
      schema: baseline.schema,
      ...(baseline.custom !== undefined ? { custom: baseline.custom } : {}),
    };
  }
  // mode === "merge" (OQ-4) — array union with baseline-order-preserved + de-dup.
  const requiredFiles = unionPreservingOrder(
    baseline.requiredFiles,
    override.requiredFiles ?? [],
  );
  const requiredFrontmatterSections = unionPreservingOrder(
    baseline.requiredFrontmatterSections,
    override.requiredFrontmatterSections ?? [],
  );
  return {
    requiredFiles,
    requiredFrontmatterSections,
    schema: baseline.schema,
    ...(baseline.custom !== undefined ? { custom: baseline.custom } : {}),
  };
}

/**
 * Helper — array union preserving baseline order with de-dup.
 * Baseline entries appear first in their original order; override
 * entries that are NOT already in the baseline are appended in their
 * original order. Duplicates collapse to a single entry positioned per
 * the baseline (or per first-occurrence in override if not in baseline).
 *
 * Story 6.5 OQ-4 — chosen semantics for `mode: "merge"`.
 */
function unionPreservingOrder(
  base: readonly string[],
  ext: readonly string[],
): readonly string[] {
  const seen = new Set(base);
  const out: string[] = [...base];
  for (const entry of ext) {
    if (!seen.has(entry)) {
      seen.add(entry);
      out.push(entry);
    }
  }
  return out;
}
