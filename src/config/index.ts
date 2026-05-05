/**
 * src/config/index.ts — Module barrel for the Story 6.1 config loader.
 *
 * Mid-tier module per AR41. Re-exports the public surface:
 *   - `loadConfig` — three-layer file loader (project > user > defaults).
 *   - `Config` — typed result of `loadConfig` (alias for ConfigV1).
 *   - `DEFAULT_CONFIG` — plugin defaults (bottom of resolution stack).
 *   - `LoadConfigOptions` — test-only escape hatches (mirrors LoadStateOptions).
 *
 * Mirrors the Story 1.6 `src/state/index.ts` precedent. Consumers
 * (Stories 6.2-6.6) import from this barrel.
 */

export type { Config } from "../schemas/config.ts";
export { DEFAULT_CONFIG } from "./defaults.ts";
export { type LoadConfigOptions, loadConfig } from "./load.ts";
