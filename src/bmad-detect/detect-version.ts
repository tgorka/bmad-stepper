/**
 * src/bmad-detect/detect-version.ts — BMAD plugin version detector
 * (FR41, FR50, FR51, NFR-S1, NFR-R1, AR33, AR41).
 *
 * Operationalises architecture line 1380 (FR50 → `src/bmad-detect/detect-version.ts`)
 * and AR41 mid-tier module boundary (line 1296) by reading the BMAD plugin
 * manifest (`{ name, version, description, ... }` per architecture line 1665)
 * and returning the upstream `version` field as a string. Routes the absence
 * of any installed plugin to the existing `BmadNotInstalledError`
 * (`src/errors.ts` lines 99–104; registry code `BMAD_NOT_INSTALLED`,
 * exit code 3, verbatim hint `Run npx bmad-method install --tools claude-code first.`)
 * per AC-2.
 *
 * Two install layouts are supported (in priority order):
 *   1. **Marketplace install** (modern, `/plugin marketplace install`):
 *      `<homeDir>/.claude/plugins/cache/<marketplace>/<plugin>/<version>/.claude-plugin/plugin.json`
 *      with the `installed_plugins.json` v2 manifest at
 *      `<homeDir>/.claude/plugins/installed_plugins.json` keying entries as
 *      `"<plugin>@<marketplace>"`. The plugin name for BMAD's marketplace
 *      install is `bmad` (NOT `bmad-method` — that's the marketplace name).
 *   2. **Legacy install** (`npx bmad-method install --tools claude-code`):
 *      `<homeDir>/.claude/plugins/bmad-method-<version>/.claude-plugin/plugin.json`.
 *
 * Public surface:
 *   - `BmadDetection`         — `{ readonly bmadVersion: string; readonly skillNames: readonly string[] }`.
 *                               Matches AC-1's verbatim `{ bmadVersion, skillNames[] }` parsed
 *                               from BMAD's plugin manifest.
 *   - `DetectBmadOptions`     — Test-only-but-exported escape hatch (Story 1.4
 *                               `LockOptions` / Story 1.8 `DetectSnapshotOptions`
 *                               pattern reapplied). All fields optional; `homeDir`
 *                               defaults to `os.homedir()`, `projectRoot` defaults
 *                               to `process.cwd()`. Tests inject tmpdir paths.
 *   - `detectBmadVersion(opts?)` — Public async function returning `Promise<string>`.
 *                               Throws `BmadNotInstalledError` (`exitCode: 3`) on
 *                               missing plugin directory. Throws system `Error` on
 *                               missing/corrupt manifest or non-string `version` field.
 *
 * Algorithm:
 *   1. **Marketplace lookup**: read `<homeDir>/.claude/plugins/installed_plugins.json`.
 *      For every entry whose key splits to `bmad@*` (plugin name `bmad`), collect
 *      `installPath`. ENOENT or JSON-parse failure → empty list (silent fallback).
 *   2. **Legacy lookup**: list `<homeDir>/.claude/plugins/` for entries starting
 *      with `"bmad-method-"`. ENOENT on the plugins root → empty list.
 *   3. If both lists are empty → throw `BmadNotInstalledError`.
 *   4. Pick the marketplace install if any was found (modern install path is
 *      authoritative; legacy `bmad-method-*` is a stale-window artifact).
 *      Within marketplace candidates, pick the lex-max `path.basename` (= version
 *      directory). Within legacy candidates, pick the lex-max directory name.
 *   5. Read `<pluginDir>/.claude-plugin/plugin.json` via `Bun.file(...).json()`.
 *      Missing manifest or JSON parse errors propagate as system `Error`.
 *   6. Validate `typeof parsed.version === "string"`; if not, throw a system
 *      `Error` with the manifest path. Otherwise return `parsed.version`.
 *
 * AR33 (function & error semantics):
 *   - Async (Bun.file().json() and fs.readdir return Promises).
 *   - Throws `BmadNotInstalledError` verbatim from `../errors.ts`; throws
 *     system `Error` for corrupt/missing manifest (the doctor command in
 *     Story 1.12 surfaces these distinctly).
 *   - No `console.*` (Biome `noConsole` rule blocks every call project-wide).
 *   - No `process.exit` — the throw propagates to the global error handler.
 *
 * AR41 (module boundary graph, architecture lines 1278-1304):
 *   - `src/bmad-detect/` is mid-tier alongside `state/`, `migrations/`,
 *     `snapshot/` (Story 1.8 sibling), `personas/`, `dag/`, `transcript/`,
 *     `telemetry/`, `upgrade/`.
 *   - Allowed imports: foundational (`../errors.ts`, `../io/log.ts`),
 *     Bun stdlib (`Bun.file`), Node stdlib (`node:os`, `node:fs/promises`,
 *     `node:path`).
 *   - Forbidden imports: `../state/`, `../schemas/`, `../lock/`,
 *     `../migrations/`, `../snapshot/`, sibling mid-tier modules,
 *     `../commands/`, `node:child_process`, external git-helper libraries.
 *
 * Story 1.9 does NOT modify `src/errors.ts` — the registry stays at 16
 * codes; `BmadNotInstalledError` already exists with the verbatim AC-2
 * hint string. Story 1.9 only adds throw sites.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { BmadNotInstalledError } from "../errors.ts";

/**
 * BMAD detection value object — matches AC-1's verbatim
 * `{ bmadVersion, skillNames[] }` shape parsed from BMAD's plugin manifest.
 *
 * Co-located in `detect-version.ts` (rather than a separate types module)
 * to avoid forward-import cycles and keep the mid-tier surface narrow per
 * AR41. The composer `Promise.all([detectBmadVersion(), detectBmadSkills()])`
 * lives in the orchestrator (Story 1.12 doctor / Story 2.4 runner / Story 4.1
 * loop runner) and assembles the value:
 *
 * ```typescript
 * async function detectBmad(opts?: DetectBmadOptions): Promise<BmadDetection> {
 *   const [bmadVersion, skillNames] = await Promise.all([
 *     detectBmadVersion(opts),
 *     detectBmadSkills(opts),
 *   ]);
 *   return { bmadVersion, skillNames };
 * }
 * ```
 *
 * - `bmadVersion` — The `version` field from `plugin.json` (e.g., `"6.5.0.1"`).
 * - `skillNames`  — Sorted lexicographic ASCII directory names from
 *                   `<pluginDir>/skills/` (populated by `detectBmadSkills`).
 */
export interface BmadDetection {
  readonly bmadVersion: string;
  readonly skillNames: readonly string[];
}

/**
 * Optional injection bag for `detectBmadVersion` and `detectBmadSkills`. All
 * fields optional — production callers pass none.
 *
 * - `homeDir`     — Root directory containing `.claude/plugins/bmad-method-*`.
 *                   Defaults to `os.homedir()`. Tests inject tmpdir paths to
 *                   keep detection isolated from the dev's real plugin install.
 * - `projectRoot` — Project root path used for the asymmetric `_bmad/`
 *                   presence check. Defaults to `process.cwd()`. Tests inject
 *                   tmpdir paths. Currently informational (the plugin-presence
 *                   check is the disqualifier per AC-2 verbatim symmetry).
 */
export interface DetectBmadOptions {
  readonly homeDir?: string;
  readonly projectRoot?: string;
}

/**
 * Resolve the BMAD plugin directory under `<homeDir>/.claude/plugins/`.
 * Internal helper shared by `detectBmadVersion` and `detectBmadSkills`
 * (kept module-private; not exported).
 *
 * Tries the modern marketplace install first, then falls back to the legacy
 * `npx bmad-method install --tools claude-code` directory layout. Throws
 * `BmadNotInstalledError` when neither layout has a candidate.
 */
async function resolvePluginDir(opts?: DetectBmadOptions): Promise<string> {
  const homeDir = opts?.homeDir ?? os.homedir();

  const marketplaceDir = await resolveMarketplacePluginDir(homeDir);
  if (marketplaceDir !== undefined) return marketplaceDir;

  const legacyDir = await resolveLegacyPluginDir(homeDir);
  if (legacyDir !== undefined) return legacyDir;

  throw new BmadNotInstalledError(
    "BMAD is not installed (no marketplace plugin under ~/.claude/plugins/cache/<marketplace>/bmad/<version>/ via installed_plugins.json, and no legacy plugin under ~/.claude/plugins/bmad-method-*).",
  );
}

/**
 * Resolve the marketplace-installed BMAD plugin via
 * `<homeDir>/.claude/plugins/installed_plugins.json` (v2 schema).
 *
 * The manifest keys plugins as `"<plugin>@<marketplace>"`. BMAD's marketplace
 * install registers the plugin name as `bmad` (the marketplace itself is
 * named `bmad-method`, but the plugin slug inside that marketplace is `bmad`).
 *
 * Returns the absolute path to the lex-max `installPath` (= version directory)
 * across all matching entries, or `undefined` when no marketplace install
 * exists / the manifest is missing or unparseable. Silent failure is
 * intentional — the legacy fallback handles those cases.
 */
async function resolveMarketplacePluginDir(
  homeDir: string,
): Promise<string | undefined> {
  const manifestPath = path.join(
    homeDir,
    ".claude",
    "plugins",
    "installed_plugins.json",
  );

  let raw: string;
  try {
    raw = await fs.readFile(manifestPath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }

  let parsed: { plugins?: Record<string, ReadonlyArray<unknown>> };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    return undefined;
  }

  const installs = parsed.plugins ?? {};
  const candidates: string[] = [];
  for (const [key, entries] of Object.entries(installs)) {
    const pluginName = key.split("@")[0];
    if (pluginName !== "bmad") continue;
    for (const entry of entries ?? []) {
      const installPath = (entry as { installPath?: unknown }).installPath;
      if (typeof installPath === "string" && installPath.length > 0) {
        candidates.push(installPath);
      }
    }
  }

  if (candidates.length === 0) return undefined;
  candidates.sort((a, b) => {
    const av = path.basename(a);
    const bv = path.basename(b);
    if (av === bv) return 0;
    return av < bv ? 1 : -1;
  });
  return candidates[0];
}

/**
 * Resolve the legacy `npx bmad-method install --tools claude-code` plugin
 * layout: `<homeDir>/.claude/plugins/bmad-method-<version>/`. Returns the
 * absolute path to the lex-max directory, or `undefined` when no such
 * directory exists.
 */
async function resolveLegacyPluginDir(
  homeDir: string,
): Promise<string | undefined> {
  const pluginsRoot = path.join(homeDir, ".claude", "plugins");

  let candidates: string[];
  try {
    const entries = await fs.readdir(pluginsRoot);
    candidates = entries
      .filter((e) => e.startsWith("bmad-method-"))
      .sort()
      .reverse();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }

  if (candidates.length === 0) return undefined;
  const top = candidates[0] as string;
  return path.join(pluginsRoot, top);
}

/**
 * Detect the installed BMAD plugin's version string.
 *
 * Resolves `<homeDir>/.claude/plugins/bmad-method-X/.claude-plugin/plugin.json`,
 * parses it via `Bun.file(...).json()`, validates `typeof parsed.version ===
 * "string"`, and returns the version verbatim.
 *
 * Throws:
 *   - `BmadNotInstalledError` (`exitCode: 3`, verbatim AC-2 hint) when no
 *     `bmad-method-*` directory exists under `~/.claude/plugins/`.
 *   - System `Error` when the plugin directory is found but `plugin.json`
 *     is missing, unreadable, or unparseable.
 *   - System `Error` when `plugin.json` lacks a string `version` field.
 *
 * Multi-plugin tie-breaker: when multiple `bmad-method-*` directories exist
 * (rare; possible during an upgrade window), the function selects the
 * lexicographically highest directory name as a deterministic choice. A
 * future story MAY upgrade this to semver-aware selection.
 */
export async function detectBmadVersion(
  opts?: DetectBmadOptions,
): Promise<string> {
  const pluginDir = await resolvePluginDir(opts);
  const manifestPath = path.join(pluginDir, ".claude-plugin", "plugin.json");
  const parsed = (await Bun.file(manifestPath).json()) as {
    version?: unknown;
  };

  if (typeof parsed.version !== "string") {
    throw new Error(
      `BMAD plugin manifest missing or non-string 'version' field at ${manifestPath}`,
    );
  }
  return parsed.version;
}

/**
 * Internal export for `detect-skills.ts` to reuse the plugin-directory
 * resolution without code duplication. NOT part of the public barrel —
 * `index.ts` does not re-export this symbol.
 */
export { resolvePluginDir as _resolvePluginDir };
