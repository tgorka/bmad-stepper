/**
 * src/bmad-detect/detect-version.ts — BMAD plugin version detector via
 * `~/.claude/plugins/bmad-method-X/.claude-plugin/plugin.json` reader
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
 * Public surface:
 *   - `BmadDetection`         — `{ readonly bmadVersion: string; readonly skillNames: readonly string[] }`.
 *                               Matches AC-1's verbatim `{ bmadVersion, skillNames[] }` parsed
 *                               from BMAD's plugin manifest. The composer
 *                               `Promise.all([detectBmadVersion(), detectBmadSkills()])`
 *                               is the orchestrator's responsibility (Story 1.12 doctor /
 *                               Story 2.4 runner / Story 4.1 loop runner).
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
 * Algorithm (story spec lines 226-263):
 *   1. List `<homeDir>/.claude/plugins/` for entries starting with `"bmad-method-"`.
 *      ENOENT on the plugins root → empty candidate list.
 *   2. If candidates is empty → throw `BmadNotInstalledError` (regardless of `_bmad/`
 *      presence — the upstream plugin is the disqualifier per AC-2; the project-side
 *      `_bmad/` check is asymmetric and informational only).
 *   3. Sort candidates descending lexicographically and pick the first
 *      (lex-max tie-breaker for the upgrade window when multiple
 *      `bmad-method-*` directories may transiently exist; a future story
 *      MAY parse the version-suffix and pick the highest semver).
 *   4. Read `<pluginDir>/.claude-plugin/plugin.json` via `Bun.file(...).json()`.
 *      Missing manifest or JSON parse errors propagate as system `Error`.
 *   5. Validate `typeof parsed.version === "string"`; if not, throw a system
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
 * (kept module-private; not exported — Story 1.9 keeps the public surface
 * to two functions plus two types per architecture line 1224-1228).
 *
 * Returns the absolute path to the lex-max `bmad-method-*` directory.
 * Throws `BmadNotInstalledError` when no candidate exists (or the plugins
 * root itself does not exist via ENOENT).
 */
async function resolvePluginDir(opts?: DetectBmadOptions): Promise<string> {
  const homeDir = opts?.homeDir ?? os.homedir();
  const pluginsRoot = path.join(homeDir, ".claude", "plugins");

  let candidates: string[];
  try {
    const entries = await fs.readdir(pluginsRoot);
    candidates = entries
      .filter((e) => e.startsWith("bmad-method-"))
      .sort()
      .reverse();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      candidates = [];
    } else {
      throw err;
    }
  }

  if (candidates.length === 0) {
    throw new BmadNotInstalledError(
      "BMAD is not installed (no plugin under ~/.claude/plugins/bmad-method-*).",
    );
  }

  // Non-null assertion: we just checked length > 0 above.
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
