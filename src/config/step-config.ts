/**
 * src/config/step-config.ts — Typed per-step config accessor helper (I-43).
 *
 * Mid-tier module per AR41. Zero upward imports; only depends on the
 * foundational `../schemas/config.ts` (AR41 intra-module sibling import).
 *
 * The `getStepConfig` helper consolidates the call-sites across the
 * codebase that read per-step config values with patterns like
 * `opts?.config?.models?.[stepName]`. Replacing those patterns with
 * `getStepConfig(opts?.config, "models", stepName)` provides:
 *   - A single typed accessor that works with both the full `Config` type
 *     and the narrow structural subsets used by `RunNextOptions.config` /
 *     `RunLoopOptions.config`.
 *   - Correct return type inference (`Model | undefined`, `Budget | undefined`,
 *     etc.) via the generic `K` constraint.
 *   - A documented, greppable contract for future callers.
 *
 * Closes forward-tracker I-43.
 */

import type { Config } from "../schemas/config.ts";

/**
 * Retrieve a per-step config value from a named config section.
 * Returns `undefined` when `config`, the `section`, or the `stepName` key
 * is absent.
 *
 * The `config` parameter accepts:
 *   - The full `Config` / `ConfigV1` type returned by `loadConfig()`.
 *   - Any `Partial<Pick<Config, K>>` — i.e., the narrow structural subsets
 *     used by `RunNextOptions.config` and `RunLoopOptions.config` (which
 *     omit `paths` / `telemetry` but include `models`, `budgets`, etc.).
 *
 * @example
 *   const model = getStepConfig(opts?.config, "models", stepName) ?? "sonnet";
 *   const budget = getStepConfig(opts?.config, "budgets", stepName);
 *   const policy = getStepConfig(opts?.config, "failurePolicies", stepName);
 */
export function getStepConfig<
  K extends keyof Pick<
    Config,
    "models" | "budgets" | "failurePolicies" | "personas" | "verifiers"
  >,
>(
  config: Partial<Pick<Config, K>> | undefined,
  section: K,
  stepName: string,
): NonNullable<Config[K]>[string] | undefined {
  return (config?.[section] as Record<string, unknown> | undefined)?.[
    stepName
  ] as NonNullable<Config[K]>[string] | undefined;
}
