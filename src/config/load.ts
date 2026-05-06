/**
 * src/config/load.ts — Three-layer `bmad-stepper.config.yaml` loader
 * (Story 6.1, FR6, FR7, FR34-FR40, NFR-R6, NFR-R8, NFR-M2, NFR-S1,
 * AR20, AR21, AR22, AR33, AR41, AR42).
 *
 * Mid-tier module per AR41. Imports allowed:
 *   - `node:os`, `node:path` — runtime built-ins for path resolution.
 *   - `../errors.ts` — ConfigError / CorruptStateError / StateTooNewError.
 *   - `../migrations/load-and-migrate.ts` — loadAndMigrate.
 *   - `../migrations/config/index.ts` — configMigrationRegistry.
 *   - `../schemas/config.ts` — Config type.
 *   - `./defaults.ts` — DEFAULT_CONFIG constant.
 *   - `./deep-merge.ts` — deepMerge helper.
 *   - Bun runtime — Bun.file, Bun.YAML.parse.
 *
 * **NO upward imports** from `src/commands/`, `src/dag/`,
 * `src/dispatch/`, etc. Per OQ-11 (Story 6.1) the module group is
 * mid-tier.
 *
 * Algorithm (per OQ-2/3/4/5/8 of Story 6.1):
 *   1. Resolve paths: project = `<projectRoot>/bmad-stepper.config.yaml`;
 *      user = `~/.config/bmad-stepper/config.yaml` (per OQ-2).
 *   2. For each layer (user, project): try `Bun.file(path).text()`;
 *      ENOENT → empty `""`. YAML-parse non-empty text. YAML parse
 *      errors → throw ConfigError with file-pointing hint.
 *   3. Deep-merge: `deepMerge(DEFAULT_CONFIG, userParsed, projectParsed)`
 *      (per OQ-3 — array-replace + per-field record merge).
 *   4. Validate-and-migrate: `loadAndMigrate(merged, configMigrationRegistry)`
 *      (per OQ-4 — single call on merged object, not per-layer).
 *   5. On `CorruptStateError`: extract Zod field path + message, throw
 *      `ConfigError` with hintOverride per OQ-5.
 *   6. On `StateTooNewError`: pass-through unchanged per OQ-8.
 *   7. Return typed `Config`.
 *
 * Per OQ-9 (Story 6.1) the loader ships ZERO new error classes — reuses
 * `ConfigError` with the per-instance `hintOverride` constructor arg.
 */

import * as os from "node:os";
import * as path from "node:path";
import { ConfigError, CorruptStateError, StateTooNewError } from "../errors.ts";
import { configMigrationRegistry } from "../migrations/config/index.ts";
import { loadAndMigrate } from "../migrations/load-and-migrate.ts";
import type { Config } from "../schemas/config.ts";
import { deepMerge } from "./deep-merge.ts";
import { DEFAULT_CONFIG } from "./defaults.ts";

/**
 * Test-only escape hatches for `loadConfig`. Mirrors Story 1.6's
 * `LoadStateOptions` precedent. Production callers pass nothing.
 */
export interface LoadConfigOptions {
  /** Project root for `bmad-stepper.config.yaml` lookup (default: `process.cwd()`). */
  readonly projectRoot?: string;
  /** User config path (default: `~/.config/bmad-stepper/config.yaml`). */
  readonly userConfigPath?: string;
}

/**
 * Canonical project-config filename (per OQ-2 — at the project root, not
 * inside `.bmad-stepper/`).
 */
const PROJECT_CONFIG_FILENAME = "bmad-stepper.config.yaml";

/**
 * Default user config path: `~/.config/bmad-stepper/config.yaml` per
 * architecture line 41 + FR36.
 */
function defaultUserConfigPath(): string {
  return path.join(os.homedir(), ".config", "bmad-stepper", "config.yaml");
}

/**
 * Read a YAML file via `Bun.file().text()`. Returns the raw text
 * unchanged. ENOENT (file missing) → empty string `""`. Any other read
 * error propagates as a ConfigError with a file-pointing hint (per the
 * loader's "actionable error" contract per AR21+22).
 */
async function readYamlText(filePath: string): Promise<string> {
  const file = Bun.file(filePath);
  // Bun.file's `.exists()` is the cheapest absent-check (does not read
  // bytes). When the file is absent, return empty — both project and
  // user files are OPTIONAL per AC-1 (the defaults layer is enough).
  const exists = await file.exists();
  if (!exists) {
    return "";
  }
  try {
    return await file.text();
  } catch (err) {
    // Read error (e.g., permission denied) — surface as ConfigError
    // with a file-pointing hint. Per OQ-5 the hint format includes
    // both the file path and a "See" verb to satisfy AR22.
    const message = err instanceof Error ? err.message : String(err);
    throw new ConfigError(
      `CONFIG_ERROR: failed to read ${filePath}`,
      message,
      `See ${filePath}; check filesystem permissions. Run /bmad-next --doctor to validate the config layer.`,
    );
  }
}

/**
 * YAML-parse a non-empty text. Empty input → empty record `{}`. Parse
 * errors → ConfigError with a single-line file-pointing hint.
 */
function parseYamlText(text: string, filePath: string): unknown {
  if (text.trim() === "") {
    return {};
  }
  try {
    const parsed = Bun.YAML.parse(text);
    return parsed ?? {};
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Single-line hint: replace newlines with `; ` per AR22 single-line
    // constraint (Story 5.6 gate).
    const flatMessage = message.replace(/[\r\n]+/g, "; ").trim();
    throw new ConfigError(
      `CONFIG_ERROR: YAML parse failure in ${filePath}`,
      flatMessage,
      `See ${filePath}: ${flatMessage.slice(0, 100)}. Run /bmad-next --doctor to validate the file against the schema.`,
    );
  }
}

/**
 * Extract the first Zod error's field path + message from a Zod-error
 * detail string (the formatted-message string surfaced by
 * `loadAndMigrate` via `validation.error.message`).
 *
 * The Zod error message is a JSON-stringified array of issues per
 * `error.message`; parsing it back is the canonical way to retrieve
 * structured fields. Defensive: when parsing fails, returns a generic
 * fallback so the loader still throws a single-line hint.
 */
function extractZodFieldPath(detail: string | undefined): {
  readonly path: string;
  readonly message: string;
} {
  if (detail === undefined || detail.trim() === "") {
    return { path: "<unknown>", message: "validation failed" };
  }
  // Zod 3.x and 4.x both stringify the issues array as JSON; try parse
  // first.
  try {
    const issues = JSON.parse(detail) as Array<{
      path?: ReadonlyArray<string | number>;
      message?: string;
    }>;
    if (Array.isArray(issues) && issues.length > 0) {
      const first = issues[0];
      const fieldPath =
        first?.path !== undefined && first.path.length > 0
          ? first.path.map((p) => String(p)).join(".")
          : "<root>";
      const message = first?.message ?? "validation failed";
      // Defensive: replace newlines / tabs in message to keep the hint
      // single-line (AR22 + Story 5.6 single-line constraint).
      const flatMessage = message.replace(/[\r\n\t]+/g, " ").trim();
      return { path: fieldPath, message: flatMessage };
    }
  } catch {
    // JSON.parse failed — the detail string isn't a JSON-stringified
    // issues array. Fall through to the textual fallback below.
  }
  // Textual fallback: take the first 80 chars of the detail string,
  // single-lined.
  const flat = detail.replace(/[\r\n\t]+/g, " ").trim();
  return { path: "<unknown>", message: flat.slice(0, 80) };
}

/**
 * Load + validate the layered Stepper config (defaults < user <
 * project). Returns the typed `Config`. Throws `ConfigError` (exit 2)
 * for any invalid input with a single-line, Zod-derived, field-pointing
 * actionable hint per AR21 + AR22 + Story 5.6 single-line constraint.
 *
 * The function is the canonical entry point for production command
 * runners (Story 6.1 wires it at `src/commands/next/run.ts` and
 * `src/commands/loop/run.ts`).
 *
 * @throws {ConfigError} when YAML parse fails OR when the merged shape
 *   fails Zod validation. The hint matches `/^.*(Run|See|Try|Check) /`.
 * @throws {StateTooNewError} when `schemaVersion > current` per OQ-8
 *   pass-through.
 */
export async function loadConfig(opts?: LoadConfigOptions): Promise<Config> {
  const projectRoot = opts?.projectRoot ?? process.cwd();
  const userPath = opts?.userConfigPath ?? defaultUserConfigPath();
  const projectPath = path.join(projectRoot, PROJECT_CONFIG_FILENAME);

  const userText = await readYamlText(userPath);
  const projectText = await readYamlText(projectPath);

  const userParsed = parseYamlText(userText, userPath);
  const projectParsed = parseYamlText(projectText, projectPath);

  // Per OQ-3 + OQ-4: deep-merge first, then single loadAndMigrate on
  // the merged object.
  const merged = deepMerge<unknown>(DEFAULT_CONFIG, userParsed, projectParsed);

  try {
    return loadAndMigrate(merged, configMigrationRegistry);
  } catch (err) {
    if (err instanceof StateTooNewError) {
      // Per OQ-8: pass-through. The error formatter at the command
      // runner top-level will surface the AR21+AR22-conformant hint
      // ("Run /bmad-next --upgrade to install a Stepper version that
      // supports this schema.").
      throw err;
    }
    if (err instanceof CorruptStateError) {
      // Per OQ-5: wrap the Zod error into a ConfigError with a
      // single-line, field-pointing hint. The leading "See" + trailing
      // "Run /bmad-next --doctor" verbs both satisfy AR22 regex
      // /^.*(Run|See|Try|Check) /.
      const { path: fieldPath, message } = extractZodFieldPath(err.detail);
      const hint = `See bmad-stepper.config.yaml at ${fieldPath}: ${message}. Run /bmad-next --doctor to validate the file against the schema.`;
      throw new ConfigError(
        `CONFIG_ERROR: invalid bmad-stepper.config.yaml`,
        err.detail,
        hint,
      );
    }
    // Any other error class — propagate unchanged.
    throw err;
  }
}
