/**
 * src/bmad-detect/detect-skills.ts — BMAD plugin skill enumerator via
 * `~/.claude/plugins/bmad-method-X/skills/` directory listing
 * (FR2, FR50, FR51, NFR-S1, NFR-R1, AR33, AR41).
 *
 * Operationalises architecture line 1332 (FR2 → `src/state/recompute.ts`
 * consumes `src/bmad-detect/detect-skills.ts`) and architecture line 1381
 * (FR51 fail-loud unknown skill — `detectBmadSkills` provides the upstream
 * registry side; the DAG builder in Story 1.10 owns the fail-loud
 * `UnknownBmadSkillError` throw on unknown).
 *
 * Public surface:
 *   - `detectBmadSkills(opts?)` — Public async function returning
 *                                 `Promise<string[]>` — sorted lexicographic
 *                                 ASCII directory names under
 *                                 `<pluginDir>/skills/`. Throws
 *                                 `BmadNotInstalledError` (`exitCode: 3`)
 *                                 when no plugin directory exists, symmetric
 *                                 with `detectBmadVersion`.
 *
 * Algorithm (story spec lines 269-300):
 *   1. Resolve the plugin directory via the shared `_resolvePluginDir`
 *      helper from `./detect-version.ts` (throws `BmadNotInstalledError`
 *      on missing).
 *   2. Compute `skillsDir = path.join(pluginDir, "skills")`.
 *   3. List with `fs.readdir(skillsDir, { withFileTypes: true })`. ENOENT
 *      on the skills directory itself → return `[]` (a valid state for a
 *      plugin without skills).
 *   4. Filter to `entry.isDirectory()` (drop stray files).
 *   5. Map to `entry.name` and `.sort()` (lexicographic ASCII order).
 *
 * AR33 (function & error semantics):
 *   - Async (Bun.file().json() and fs.readdir return Promises).
 *   - Throws `BmadNotInstalledError` verbatim from `../errors.ts` on missing
 *     plugin (symmetric with `detectBmadVersion`).
 *   - Returns `[]` (NOT throw) when plugin exists but has no `skills/` dir —
 *     consistent with the "valid plugin without skills" state.
 *   - No `console.*`; no `process.exit`.
 *
 * AR41 (module boundary graph, architecture lines 1278-1304):
 *   - Allowed imports: foundational (`../errors.ts`), sibling-file
 *     `./detect-version.ts` (within the same `src/bmad-detect/` module —
 *     intra-module imports are unrestricted), Node stdlib (`node:fs/promises`,
 *     `node:path`).
 *   - Forbidden imports: `../state/`, `../schemas/`, `../lock/`,
 *     `../migrations/`, `../snapshot/`, sibling mid-tier modules,
 *     `../commands/`, `node:child_process`, external libraries.
 *
 * Note on `withFileTypes: true`: required so we can call `entry.isDirectory()`
 * to filter out stray files. The Tier 3 DAG fallback in Story 1.10 consumes
 * this list as authoritative — a stray `README.md` in the skills directory
 * MUST NOT pollute the registry.
 *
 * Note on the deterministic sort: `Array.prototype.sort()` defaults to a
 * locale-independent UTF-16 code-unit comparison (lexicographic ASCII order).
 * This is the same ordering the architecture's "deterministic enumeration
 * order" expectation requires (line 1227); reproducible DAG builds depend on
 * a stable iteration order across runs and OSes.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { _resolvePluginDir, type DetectBmadOptions } from "./detect-version.ts";

/**
 * Enumerate the skill directory names under the installed BMAD plugin's
 * `skills/` subdirectory.
 *
 * Resolves `<homeDir>/.claude/plugins/bmad-method-*` (lex-max), lists
 * `<pluginDir>/skills/` with `withFileTypes: true`, filters to directories,
 * and returns the sorted directory names.
 *
 * Throws:
 *   - `BmadNotInstalledError` (`exitCode: 3`, verbatim AC-2 hint) when no
 *     `bmad-method-*` directory exists under `~/.claude/plugins/` (symmetric
 *     with `detectBmadVersion`).
 *
 * Returns:
 *   - `[]` when the plugin directory exists but has no `skills/` subdirectory
 *     (a valid plugin layout — the empty case is exercised in tests for
 *     completeness; the DAG builder in Story 1.10 will handle empty skill
 *     lists explicitly).
 *   - Sorted `string[]` of directory names otherwise. Stray files (e.g.,
 *     `README.md`) are filtered out via `entry.isDirectory()`.
 */
export async function detectBmadSkills(
  opts?: DetectBmadOptions,
): Promise<string[]> {
  const pluginDir = await _resolvePluginDir(opts);
  const skillsDir = path.join(pluginDir, "skills");

  try {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }
}

/**
 * v0.2.2 — pair of absolute paths the dispatch-spec carries forward to
 * the `bmad-step-runner` sub-agent so it can read+follow the BMad
 * plugin's skill body + persona body instead of inventing from the
 * generic dispatch-spec `task` text.
 *
 * Either field is `null` when its source file is absent:
 *   - `skillPath`   → `<pluginDir>/skills/<stepName>/SKILL.md` exists.
 *   - `personaPath` → `<pluginDir>/skills/bmad-agent-<persona>/SKILL.md`
 *                     exists (the BMad persona convention).
 */
export interface BmadSkillReferences {
  readonly skillPath: string | null;
  readonly personaPath: string | null;
}

/**
 * Resolve absolute paths to the BMad plugin's skill SKILL.md and persona
 * SKILL.md for a given step + persona. Used by the dispatch spec
 * generator (Story v0.2.2 enrichment) to thread the BMad context into
 * the `bmad-step-runner` sub-agent so its output is faithful to the
 * BMad skill's framework rather than the generic dispatch-spec `task`
 * fallback.
 *
 * Returns `{ skillPath: null, personaPath: null }` (no throw) when no
 * BMad plugin is installed, or when the specific SKILL.md files do not
 * exist for this step / persona. Callers treat absence as "no
 * enrichment available; sub-agent falls back to the generic task".
 *
 * Persona resolution: BMad stores personas as their own skill folders
 * under the `bmad-agent-<persona>` naming convention (e.g.,
 * `bmad-agent-analyst`, `bmad-agent-pm`, `bmad-agent-architect`). When
 * `persona` is `undefined` OR the corresponding folder does not exist,
 * `personaPath` is `null`.
 */
export async function resolveBmadSkillReferences(
  stepName: string,
  persona: string | undefined,
  opts?: DetectBmadOptions,
): Promise<BmadSkillReferences> {
  let pluginDir: string;
  try {
    pluginDir = await _resolvePluginDir(opts);
  } catch {
    return { skillPath: null, personaPath: null };
  }

  const skillCandidate = path.join(pluginDir, "skills", stepName, "SKILL.md");
  const personaCandidate =
    persona !== undefined && persona !== ""
      ? path.join(pluginDir, "skills", `bmad-agent-${persona}`, "SKILL.md")
      : null;

  const [skillExists, personaExists] = await Promise.all([
    Bun.file(skillCandidate).exists(),
    personaCandidate !== null
      ? Bun.file(personaCandidate).exists()
      : Promise.resolve(false),
  ]);

  return {
    skillPath: skillExists ? skillCandidate : null,
    personaPath:
      personaCandidate !== null && personaExists ? personaCandidate : null,
  };
}
