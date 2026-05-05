/**
 * src/config/defaults.ts — Plugin-default config values for
 * `bmad-stepper.config.yaml` (Story 6.1, FR37, AR41).
 *
 * Mid-tier module per AR41: imports only the foundational `Config` type
 * from `../schemas/config.ts`. ZERO upward imports.
 *
 * The constant is the BOTTOM-most layer of the three-layer resolution
 * (project > user > defaults). Per OQ-1 (Story 6.1) the defaults live
 * here as a TypeScript constant rather than a bundled YAML file:
 *   - avoids a pre-build step (Bun runs TS directly per architecture line 1564);
 *   - eliminates a YAML parse round-trip on every load;
 *   - the constant is type-checked against `Config` at compile time;
 *   - the loader passes the constant directly to `deepMerge` without IO.
 *
 * Per OQ-10 (Story 6.1) the four `paths` fields match architecture lines
 * 783-787 verbatim. Telemetry defaults to disabled per NFR-S3.
 *
 * Forward-tracker (I-30 of Story 6.1): if the defaults grow large, may
 * extract to `examples/bmad-stepper.config.yaml` as a documentation
 * companion + machine-readable source-of-truth (auto-generated from
 * this constant via a CI script).
 */

import type { Config } from "../schemas/config.ts";

/**
 * The plugin-default `Config` value. Used as the bottom layer in the
 * three-layer resolution rule (project > user > defaults).
 *
 * The constant is `as const`-frozen so consumers cannot mutate it
 * (defensive — `deepMerge` already returns a fresh object). The shape
 * is TYPE-CHECKED against `Config` at compile time via the `satisfies`
 * operator (TypeScript 4.9+).
 */
export const DEFAULT_CONFIG = {
  schemaVersion: 1 as const,
  personas: {},
  overrides: {},
  verifiers: {},
  failurePolicies: {},
  models: {},
  budgets: {},
  paths: {
    state: "_bmad-output/.stepper/state.yaml",
    runs: "_bmad-output/.stepper/runs/",
    staging: "_bmad-output/.stepper/staging/",
    telemetry: "_bmad-output/.stepper/telemetry/",
  },
  telemetry: { enabled: false },
} satisfies Config;
