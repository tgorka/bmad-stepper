/**
 * src/commands/doctor/checks.ts — Diagnostic check suite for the
 * `/bmad-next --doctor` command (FR40, FR41, FR50, FR54, AR21, AR22,
 * AR33, AR41).
 *
 * Top-tier module per AR41. Composes mid-tier modules (`bmad-detect/`,
 * `dag/`, `state/`) into discrete pure-async check functions. Each
 * check returns a `CheckResult` discriminated union; the runner
 * (`./run.ts`) aggregates these into the canonical 5-line stderr
 * output documented in epics.md AC-1.
 *
 * The four checks (in invocation order):
 *   1. checkBmadInstalled → "BMAD detected: v<version> (compatible)"
 *   2. checkProjectName   → "Project: <name>"
 *   3. checkStateFile     → "State file: not present (fresh project)"
 *                           OR "State file: present (schemaVersion <X>)"
 *   4. checkStepRegistry  → "Step registry: built from <N> BMAD skills
 *                           + <M> project overrides; DAG validated;
 *                           no cycles"
 *
 * Story 1.12 v0.1 ships these four MANDATORY checks. The OPTIONAL
 * persona-resolvability check (Story 1.11 forward-dep note) is
 * deferred to a future polish PR or Story 3.6 `--explain --reasoning-trace`.
 *
 * Per AR41 top-tier boundary (architecture lines 1294-1295), this
 * module may import from EVERY lower tier — foundational
 * (`../../errors.ts`, `../../io/log.ts`), Bun stdlib (`Bun.file`,
 * `Bun.YAML`), Node stdlib (`node:fs/promises`, `node:path`),
 * mid-tier (`../../bmad-detect/`, `../../dag/`, `../../state/`).
 * The mid-tier-to-mid-tier ban does NOT apply at the commands tier.
 *
 * Per AR33 (architecture line 213), each check is `async`; throws
 * `StepperError` subclasses verbatim through to the runner's top-level
 * catch; no `console.*` calls; no `process.exit` calls. The runner is
 * responsible for surfacing `error.actionableHint` to stderr and
 * exiting with `error.exitCode`.
 *
 * Per AR/FR54 + architecture line 1660, the diagnostic lines are
 * RETURNED as `CheckResult.line` strings; the runner writes them to
 * **stderr** (NOT stdout — stdout is reserved for the JSON-line
 * dispatch protocol; doctor never emits to stdout).
 *
 * Architecture cross-references:
 *   - architecture.md §G CLI Surface (lines 553-629) — exit-code mapping
 *     (FR53) + stderr discipline (FR54).
 *   - architecture.md §FR41, §FR50 — `--doctor` diagnostic + BMAD
 *     version detection.
 *   - architecture.md §AR41 (lines 1294-1295) — top-tier boundary.
 *   - epics.md §Story 1.12 lines 544-557 — verbatim AC-1 line format.
 */

import * as path from "node:path";
import {
  detectBmadSkills,
  detectBmadVersion,
} from "../../bmad-detect/index.ts";
import { build } from "../../dag/index.ts";
import { CorruptStateError, type StepperError } from "../../errors.ts";
import { loadStateUnlocked } from "../../state/load.ts";

/**
 * Discriminated status for a single diagnostic check.
 *
 * - "ok"    → check passed; the line is rendered verbatim.
 * - "fresh" → check passed in the fresh-project case (used only by
 *             checkStateFile when state.yaml is absent).
 * - "warn"  → check produced a warning; the line is rendered verbatim
 *             but the runner does NOT exit on warn.
 * - "error" → check threw a `StepperError`; the runner short-circuits
 *             remaining checks and surfaces `error.actionableHint`
 *             with `error.exitCode`.
 */
export type CheckStatus = "ok" | "fresh" | "warn" | "error";

/**
 * Structured result returned by every check function. The runner
 * aggregates an array of these into the final stderr output. The
 * `error` field is set ONLY when `status === "error"` (the runner
 * uses it to compute the exit code).
 *
 * - `name`   → stable check identifier (machine-readable; useful for
 *             future `--check <name>` filtering).
 * - `status` → discriminated status per `CheckStatus`.
 * - `line`   → exact verbatim stderr line per epics.md AC-1.
 * - `error`  → set when `status === "error"`; the runner reads
 *             `error.exitCode` and `error.actionableHint`.
 */
export interface CheckResult {
  readonly name: string;
  readonly status: CheckStatus;
  readonly line: string;
  readonly error?: StepperError;
}

/**
 * Optional injection bag for test escape hatches. All fields are
 * optional — production callers pass none (the runner resolves
 * defaults: `projectRoot = process.cwd()`, no `homeDir` override so
 * `bmad-detect/` uses `os.homedir()`).
 *
 * - `projectRoot`   → project root for `_bmad/config.yaml`,
 *                     `package.json`, and `bmad-stepper.config.yaml`
 *                     reads. Defaults to `process.cwd()`.
 * - `homeDir`       → BMAD detection home root. Forwarded to
 *                     `detectBmadVersion` / `detectBmadSkills` via
 *                     their `DetectBmadOptions` shape. Defaults to
 *                     `os.homedir()`.
 * - `statePath`     → override the canonical `_bmad-output/.stepper/
 *                     state.yaml` path. Defaults to `STATE_PATH`.
 * - `configPath`    → override the `_bmad/config.yaml` path. Defaults
 *                     to `<projectRoot>/_bmad/config.yaml`.
 * - `overridesPath` → override the `bmad-stepper.config.yaml` path.
 *                     Defaults to `<projectRoot>/bmad-stepper.config.yaml`.
 */
export interface CheckContext {
  readonly projectRoot?: string;
  readonly homeDir?: string;
  readonly statePath?: string;
  readonly configPath?: string;
  readonly overridesPath?: string;
}

/**
 * Concrete BMAD detection value object — internal to doctor's
 * orchestration. The mid-tier `bmad-detect/` exposes
 * `detectBmadVersion()` returning `Promise<string>` and
 * `detectBmadSkills()` returning `Promise<string[]>` separately;
 * doctor wraps these into a single composer object that the runner
 * passes to `checkStepRegistry` after `checkBmadInstalled` succeeds.
 *
 * NOT re-exported via the doctor barrel — strictly internal.
 */
export interface DoctorBmadDetection {
  readonly version: string;
  readonly skillNames: readonly string[];
  readonly homeDir: string | undefined;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function resolveProjectRoot(ctx: CheckContext): string {
  return ctx.projectRoot ?? process.cwd();
}

function resolveConfigPath(ctx: CheckContext): string {
  return (
    ctx.configPath ?? path.join(resolveProjectRoot(ctx), "_bmad/config.yaml")
  );
}

function resolveStatePath(ctx: CheckContext): string {
  return (
    ctx.statePath ??
    path.join(resolveProjectRoot(ctx), "_bmad-output/.stepper/state.yaml")
  );
}

function resolveOverridesPath(ctx: CheckContext): string {
  return (
    ctx.overridesPath ??
    path.join(resolveProjectRoot(ctx), "bmad-stepper.config.yaml")
  );
}

/**
 * Safely read and parse YAML from `filePath`. Returns null on any
 * filesystem or parse error — the doctor's job is to report problems,
 * NOT crash on them. The caller decides how to handle null.
 */
async function tryReadYaml(filePath: string): Promise<unknown | null> {
  try {
    const file = Bun.file(filePath);
    if (!(await file.exists())) return null;
    const text = await file.text();
    return Bun.YAML.parse(text);
  } catch {
    return null;
  }
}

/**
 * Safely read and parse JSON from `filePath`. Returns null on any
 * filesystem or parse error.
 */
async function tryReadJson(filePath: string): Promise<unknown | null> {
  try {
    const file = Bun.file(filePath);
    if (!(await file.exists())) return null;
    return await file.json();
  } catch {
    return null;
  }
}

// ─── checkBmadInstalled ────────────────────────────────────────────────────

/**
 * Diagnostic check 1 — produces line:
 *   "BMAD detected: v<version> (compatible)"
 *
 * Algorithm:
 *   1. Call `detectBmadVersion({ homeDir: ctx.homeDir })`.
 *   2. On success: render `(compatible)` literally per AC-1 — Story 1.9's
 *      `detectBmadVersion` is the canonical compatibility check (it
 *      throws `BmadIncompatibleError` if the version mismatch is fatal;
 *      doctor renders `(compatible)` only when no throw occurs).
 *   3. On `BmadNotInstalledError`: re-throw verbatim. The runner catches,
 *      surfaces the actionable hint, exits 3 per AC-2.
 *   4. On `BmadIncompatibleError`: re-throw verbatim. The runner exits 3.
 *   5. On any other error: re-throw verbatim (doctor never swallows).
 *
 * Note: this check runs FIRST in the runner's check sequence. If it
 * throws, all downstream checks are skipped (the runner short-circuits
 * to the error path).
 */
export async function checkBmadInstalled(
  ctx: CheckContext,
): Promise<CheckResult> {
  const version = await detectBmadVersion({
    homeDir: ctx.homeDir,
    projectRoot: resolveProjectRoot(ctx),
  });
  return {
    name: "bmad-installed",
    status: "ok",
    line: `BMAD detected: v${version} (compatible)`,
  };
}

// ─── checkProjectName ──────────────────────────────────────────────────────

/**
 * Diagnostic check 2 — produces line:
 *   "Project: <name>"
 *
 * Algorithm:
 *   1. Try to read `<projectRoot>/_bmad/config.yaml` (or `ctx.configPath`).
 *      If parsed YAML has `bmm.project_name` (string), use that.
 *   2. Otherwise fall back to `<projectRoot>/package.json` `name` field
 *      via `Bun.file(path).json()`.
 *   3. If both are missing OR yield no string, return:
 *        { status: "warn",
 *          line: "Project: (unknown — set bmm.project_name in
 *                 _bmad/config.yaml)" }
 *      The runner does NOT exit on warn; the warn is rendered inline.
 *
 * Errors from `Bun.YAML.parse` or `Bun.file.json` (malformed input)
 * are swallowed gracefully via `tryReadYaml` / `tryReadJson` and the
 * function falls through to the next source. Doctor's job is to report
 * problems, NOT crash on them.
 */
export async function checkProjectName(
  ctx: CheckContext,
): Promise<CheckResult> {
  const configPath = resolveConfigPath(ctx);
  const config = (await tryReadYaml(configPath)) as {
    bmm?: { project_name?: unknown };
  } | null;
  const fromConfig = config?.bmm?.project_name;
  if (typeof fromConfig === "string" && fromConfig.length > 0) {
    return {
      name: "project-name",
      status: "ok",
      line: `Project: ${fromConfig}`,
    };
  }

  const pkgPath = path.join(resolveProjectRoot(ctx), "package.json");
  const pkg = (await tryReadJson(pkgPath)) as { name?: unknown } | null;
  const fromPkg = pkg?.name;
  if (typeof fromPkg === "string" && fromPkg.length > 0) {
    return {
      name: "project-name",
      status: "ok",
      line: `Project: ${fromPkg}`,
    };
  }

  return {
    name: "project-name",
    status: "warn",
    line: "Project: (unknown — set bmm.project_name in _bmad/config.yaml)",
  };
}

// ─── checkStateFile ────────────────────────────────────────────────────────

/**
 * Diagnostic check 3 — produces one of:
 *   - "State file: not present (fresh project)" (status: "fresh")
 *   - "State file: present (schemaVersion <X>)" (status: "ok")
 *
 * Algorithm (safer message-string-free pattern per story spec note):
 *   1. Check `Bun.file(statePath).size === 0` BEFORE invoking the loader.
 *      If size === 0 (or the file does not exist), the state.yaml is
 *      absent — return the fresh-project result without invoking the
 *      loader. This avoids the message-string match required when
 *      `loadStateUnlocked` throws `CorruptStateError("state.yaml is
 *      missing or empty")`.
 *   2. If size > 0, call `loadStateUnlocked({ statePath })`. On success
 *      return the present-state line including the schemaVersion.
 *   3. On any `CorruptStateError` (parse failure or migration failure
 *      from a non-empty file): re-throw verbatim. The runner catches
 *      and surfaces the actionable hint with exit 1 per AC-3.
 *   4. On `StateTooNewError` / `MigrationFailureError` /
 *      `PathologicalInputError`: re-throw verbatim. The runner exits 1.
 *
 * Per architecture line 1672, doctor calls `loadStateUnlocked` (NOT
 * `loadState`) — `run.ts` is read-only and lock-free; only
 * `verify-and-advance.ts` acquires the lock.
 */
export async function checkStateFile(ctx: CheckContext): Promise<CheckResult> {
  const statePath = resolveStatePath(ctx);
  const file = Bun.file(statePath);
  // Bun.file(path).size returns 0 for missing files (no ENOENT throw)
  // — this is the cleanest absence detector and avoids the
  // message-string match against the loader's "missing or empty" hint.
  let size = 0;
  try {
    size = file.size;
  } catch {
    size = 0;
  }
  if (size === 0) {
    return {
      name: "state-file",
      status: "fresh",
      line: "State file: not present (fresh project)",
    };
  }

  // Size > 0: file exists with content. Delegate to the unlocked loader
  // for parse + migration + size-guard semantics.
  let state: Awaited<ReturnType<typeof loadStateUnlocked>>;
  try {
    state = await loadStateUnlocked({ statePath });
  } catch (err) {
    if (err instanceof CorruptStateError) {
      // Defence-in-depth: the size > 0 path may still encounter the
      // "missing or empty" message if the file is whitespace-only or
      // truncated between the `size` read and the `loadStateUnlocked`
      // call. Treat this race-window case as fresh as well — but a
      // genuine parse failure has a different message and propagates.
      if (err.message === "state.yaml is missing or empty") {
        return {
          name: "state-file",
          status: "fresh",
          line: "State file: not present (fresh project)",
        };
      }
    }
    throw err;
  }

  return {
    name: "state-file",
    status: "ok",
    line: `State file: present (schemaVersion ${state.schemaVersion})`,
  };
}

// ─── checkStepRegistry ─────────────────────────────────────────────────────

/**
 * Helper: count overrides declared in `bmad-stepper.config.yaml`.
 * Returns 0 if the file does not exist or has no `overrides:` block.
 *
 * Doctor inlines a simple line-based extractor mirroring the pattern
 * used by `src/dag/build.ts`'s helper (story spec note: "keep them
 * separate for v0.1; full Zod-validated config-yaml loader lands in
 * Story 6.1"). The extractor only counts top-level skill keys under
 * `overrides:` — sub-keys (`phase`, `after`, `optional`, `persona`,
 * `idempotent`) are ignored.
 *
 * Errors during read/parse are swallowed; the function returns 0 in
 * those cases so the diagnostic line still renders.
 */
async function countProjectOverrides(overridesPath: string): Promise<number> {
  const file = Bun.file(overridesPath);
  if (!(await file.exists())) return 0;
  let text: string;
  try {
    text = await file.text();
  } catch {
    return 0;
  }

  const lines = text.split(/\r?\n/);
  let i = 0;
  // Find `overrides:` at column 0.
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (/^overrides:\s*$/.test(line)) {
      i += 1;
      break;
    }
    i += 1;
  }
  if (i >= lines.length) return 0;

  // Determine the skill-key indent.
  let skillIndent: number | null = null;
  let count = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      i += 1;
      continue;
    }
    let lead = 0;
    while (lead < line.length && line[lead] === " ") lead += 1;
    if (lead === 0) {
      // Back at top-level key — exit overrides block.
      break;
    }
    if (skillIndent === null) skillIndent = lead;
    if (lead !== skillIndent) {
      // Sub-key (deeper indent) — skip.
      i += 1;
      continue;
    }
    const stripped = line.slice(lead);
    if (/^[\w.-]+:\s*$/.test(stripped)) {
      count += 1;
    }
    i += 1;
  }
  return count;
}

/**
 * Diagnostic check 4 — produces line:
 *   "Step registry: built from <N> BMAD skills + <M> project overrides;
 *    DAG validated; no cycles"
 *
 * Algorithm:
 *   1. Call `detectBmadSkills({ homeDir })` — returns sorted string[]
 *      of skill directory names. <N> = bmadSkills.length.
 *   2. Count project overrides in `bmad-stepper.config.yaml` via the
 *      private `countProjectOverrides` helper. <M> = override count.
 *   3. Resolve the BMAD plugin directory by re-deriving it from the
 *      home dir + version (the bmad-detect API does NOT expose the
 *      pluginDir directly in v0.1; doctor MUST reconstruct it). The
 *      reconstruction matches `bmad-detect/detect-version.ts`'s
 *      `_resolvePluginDir` algorithm.
 *   4. Call `build({ skillNames: bmadSkills, pluginDir, projectRoot })`
 *      from `src/dag/`. On success render the verbatim line.
 *   5. On `DagCycleError` / `UnknownBmadSkillError`: re-throw verbatim.
 *      The runner exits 3 per AC-4.
 *
 * Note: counts are exact integers; the line is rendered as a single
 * template literal. The format mirrors epics.md AC-1 line 4 verbatim.
 */
export async function checkStepRegistry(
  ctx: CheckContext,
  bmad: DoctorBmadDetection,
): Promise<CheckResult> {
  const projectRoot = resolveProjectRoot(ctx);
  const overridesPath = resolveOverridesPath(ctx);

  const overrideCount = await countProjectOverrides(overridesPath);
  // Resolve plugin dir for Tier 3 frontmatter parse (build() may need
  // it). Reconstruct using the same algorithm bmad-detect uses.
  const pluginDir = await resolvePluginDir(bmad);

  await build({
    skillNames: bmad.skillNames,
    projectRoot,
    overridesPath,
    pluginDir,
  });

  return {
    name: "step-registry",
    status: "ok",
    line: `Step registry: built from ${bmad.skillNames.length} BMAD skills + ${overrideCount} project overrides; DAG validated; no cycles`,
  };
}

/**
 * Reconstruct the BMAD plugin directory from the homeDir using the
 * same lex-max algorithm as `bmad-detect/detect-version.ts`. Internal
 * helper for `checkStepRegistry`.
 *
 * Throws if the plugin directory cannot be resolved; in practice this
 * never happens because `checkBmadInstalled` ran first and would have
 * thrown `BmadNotInstalledError`.
 */
async function resolvePluginDir(
  bmad: DoctorBmadDetection,
): Promise<string | undefined> {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const homeDir = bmad.homeDir ?? os.homedir();
  const pluginsRoot = path.join(homeDir, ".claude", "plugins");
  let entries: string[];
  try {
    entries = await fs.readdir(pluginsRoot);
  } catch {
    return undefined;
  }
  const candidates = entries
    .filter((e) => e.startsWith("bmad-method-"))
    .sort()
    .reverse();
  if (candidates.length === 0) return undefined;
  // biome-ignore lint/style/noNonNullAssertion: length checked above
  return path.join(pluginsRoot, candidates[0]!);
}

// ─── Composer (used by run.ts) ─────────────────────────────────────────────

/**
 * Helper for the runner to combine the BMAD version + skill list into
 * a single `DoctorBmadDetection` value object. NOT exported in the
 * doctor barrel — internal API used only by `./run.ts`.
 *
 * Calls the two detectors concurrently via `Promise.all` (they are
 * independent file-system reads).
 */
export async function detectBmad(
  ctx: CheckContext,
): Promise<DoctorBmadDetection> {
  const opts = {
    homeDir: ctx.homeDir,
    projectRoot: resolveProjectRoot(ctx),
  };
  const [version, skillNames] = await Promise.all([
    detectBmadVersion(opts),
    detectBmadSkills(opts),
  ]);
  return { version, skillNames, homeDir: ctx.homeDir };
}
