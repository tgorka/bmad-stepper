/**
 * src/upgrade/index.ts — public barrel for the `upgrade/` mid-tier
 * module (Story 6.9 — FR48; NFR-S1 EXCEPTION; NFR-S2; AR41; D14).
 *
 * Story 6.9 instantiates the architecture's pre-listing at line
 * 1219-1222 (`src/upgrade/{index.ts,check.ts,check.test.ts}`) and
 * EXTENDS with `render.ts`, `render.test.ts`, `cli.ts`, `cli.test.ts`
 * as siblings (the architecture pre-listing is non-exhaustive).
 *
 * The CLI (`cli.ts`) is invoked via `bun run upgrade` and is NOT
 * re-exported here — the CLI tier is consumed via process.exec, not
 * via library import. The runner-tier wiring at
 * `src/commands/next/run.ts` Step 0a consumes `runUpgradeCheck` +
 * `renderUpgradeReport` directly via this barrel.
 */

export {
  GitHubReleaseSchema,
  PluginManifestSchema,
  RELEASES_URL_DEFAULT,
  type RunUpgradeCheckOptions,
  runUpgradeCheck,
  UPGRADE_FETCH_TIMEOUT_MS,
  type UpgradeCheckResult,
} from "./check.ts";
export { renderUpgradeReport } from "./render.ts";
