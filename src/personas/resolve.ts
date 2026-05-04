/**
 * src/personas/resolve.ts — 4-tier persona resolver (FR12, FR34, FR40,
 * NFR-R1, NFR-I2, AR33, AR41).
 *
 * Public function `resolvePersona(input)` composes:
 *   Tier 1 (frontmatter)   — `<pluginDir>/skills/<step>/SKILL.md` (or
 *                            `skill.yaml` fallback) `persona:` field.
 *   Tier 2 (project config) — `<projectRoot>/bmad-stepper.config.yaml`
 *                             `personas:` block. Hand-rolled YAML
 *                             extractor mirroring Story 1.10's
 *                             `overrides:` extractor strategy.
 *   Tier 3 (defaults)      — `DEFAULT_PERSONAS` in-memory lookup. Zero IO.
 *   Tier 4 (module config) — `<bmadDir>/<module>/config.yaml` triggers.
 *                            Each present BMAD module (`bmm`, `tea`,
 *                            `bmb`, `cis`) carries an implicit persona;
 *                            substring match on the step name in the
 *                            module's primary trigger list yields the
 *                            module's persona. Minimal pattern-match
 *                            layer; full schema is Story 6.1.
 *
 * On exhaustion (none of four tiers resolve), throws `ConfigError` with
 * the verbatim AC-2 hint via the per-instance `hintOverride` constructor
 * arg (Story 1.10 `UnknownBmadSkillError` pattern; Story 1.11 extends
 * `ConfigError` analogously — registry stays at 16 codes).
 *
 * Architecture compliance:
 *   - §D13 lines 631-642 — 4-tier resolution + multi-persona sequential
 *                          dispatch + verbatim fail-loud hint.
 *   - AR33 line 213    — async function; throws `StepperError` subclasses
 *                         verbatim; no `console.*`; no `process.exit`.
 *   - AR41 line 1296   — `src/personas/` is mid-tier. Allowed imports:
 *                         foundational `../errors.ts`, `../io/log.ts`;
 *                         Bun stdlib `Bun.file`; Node stdlib
 *                         `node:fs/promises`, `node:path`; intra-module
 *                         siblings `./defaults.ts`. Forbidden:
 *                         `../bmad-detect/`, `../state/`, `../schemas/`,
 *                         `../lock/`, `../migrations/`, `../snapshot/`,
 *                         `../dag/`, `../commands/`, sibling mid-tier
 *                         modules, `node:child_process`, external libs.
 *
 * Multi-persona sequential dispatch (architecture line 640): the
 * `string | readonly string[]` return contract carries the multi-persona
 * sentinel — Story 2.3's sub-agent runner inspects `Array.isArray()` and
 * dispatches sub-agents one-by-one. Parallel dispatch deferred per PRD §17.
 */

import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { ConfigError } from "../errors.ts";
import { warn } from "../io/log.ts";
import { DEFAULT_PERSONAS } from "./defaults.ts";

/**
 * Public input shape for `resolvePersona()`. Composer pattern: the runner
 * (Story 2.4) calls `detectBmadVersion()` first to resolve `pluginDir`,
 * then passes it here. Per AR41 mid-tier-to-mid-tier ban, this module
 * does NOT directly import from `src/bmad-detect/`.
 *
 * - `stepName`        — REQUIRED. The BMAD plugin skill directory name
 *                       (kebab-case; the strings `detectBmadSkills()`
 *                       returns; Story 1.9).
 * - `pluginDir`       — Plugin root for Tier 1 SKILL.md frontmatter read.
 *                       If undefined, Tier 1 is skipped.
 * - `projectRoot`     — Project root for resolving the default Tier 2
 *                       config path and the default Tier 4 `_bmad/` root.
 *                       Defaults to `process.cwd()`.
 * - `configPath`      — Override the Tier 2 config path. Test-only-but-
 *                       exported escape hatch.
 * - `bmadConfigPath`  — Override the Tier 4 `_bmad/` root directory.
 *                       Test-only-but-exported escape hatch.
 */
export interface ResolveInput {
  readonly stepName: string;
  readonly pluginDir?: string;
  readonly projectRoot?: string;
  readonly configPath?: string;
  readonly bmadConfigPath?: string;
}

/**
 * Resolved persona shape. Single-persona steps return a `string`;
 * multi-persona steps return a `readonly string[]` that signals
 * sequential dispatch to Story 2.3's sub-agent runner.
 */
export type ResolveOptions = ResolveInput;

/**
 * Implicit persona-by-module mapping for Tier 4 (`_bmad/<module>/`).
 * Architecture §D13 line 638-642 documents the BMAD-module-to-persona
 * convention; the precise schema lands in Story 6.1.
 */
const MODULE_PERSONAS: ReadonlyMap<string, string> = new Map([
  ["bmm", "pm"],
  ["tea", "tea"],
  ["bmb", "dev"],
  ["cis", "analyst"],
]);

/**
 * Compute the AC-2 verbatim hint for a no-tier-resolves throw.
 * The literal string MUST flow through `actionableHint` (the global
 * error formatter renders it), not `detail`.
 */
function ac2NoPersonaHint(stepName: string): string {
  return `Add a persona for ${stepName} in bmad-stepper.config.yaml under the personas: block.`;
}

/**
 * Compute leading-whitespace count for a YAML line.
 */
function indentOf(line: string): number {
  let i = 0;
  while (i < line.length && line[i] === " ") {
    i += 1;
  }
  return i;
}

/**
 * Strip optional surrounding single/double quotes from a YAML scalar.
 */
function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

/**
 * Parse an inline YAML scalar value (string, list `[a, b]`, or empty).
 * Returns `string | string[] | null` — null when value is empty.
 */
function parseInlineValue(raw: string): string | string[] | null {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return null;
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim();
    if (inner === "") {
      return [];
    }
    return inner.split(",").map((item) => stripQuotes(item.trim()));
  }
  return stripQuotes(trimmed);
}

/**
 * Extract YAML frontmatter (the `---\n...\n---` block) from the top of a
 * SKILL.md file. Returns null when no frontmatter delimiter pair exists.
 */
function extractFrontmatter(text: string): string | null {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    return null;
  }
  const closingIdx = lines.findIndex(
    (line, idx) => idx > 0 && line.trim() === "---",
  );
  if (closingIdx < 0) {
    return null;
  }
  return lines.slice(1, closingIdx).join("\n");
}

/**
 * Parse a flat YAML key:value block (no nested indented map). Returns
 * the `persona:` value if present, else null. Handles inline scalars,
 * inline arrays, and dash-list block syntax.
 */
function extractPersonaFromFlatYaml(
  text: string,
): string | readonly string[] | null {
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "" || line.trim().startsWith("#")) {
      i += 1;
      continue;
    }
    if (indentOf(line) > 0) {
      i += 1;
      continue;
    }
    const colonIdx = line.indexOf(":");
    if (colonIdx < 0) {
      i += 1;
      continue;
    }
    const key = line.slice(0, colonIdx).trim();
    const valueRaw = line.slice(colonIdx + 1).trim();
    i += 1;

    if (key !== "persona") {
      // Skip dash-list followers for non-persona keys.
      if (valueRaw === "") {
        while (i < lines.length) {
          const next = lines[i] ?? "";
          if (next.trim() === "" || next.trim().startsWith("#")) {
            i += 1;
            continue;
          }
          if (indentOf(next) === 0) {
            break;
          }
          i += 1;
        }
      }
      continue;
    }

    if (valueRaw !== "") {
      const parsed = parseInlineValue(valueRaw);
      if (parsed === null) {
        return null;
      }
      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v));
      }
      return String(parsed);
    }

    // Dash-list block follows.
    const items: string[] = [];
    while (i < lines.length) {
      const next = lines[i] ?? "";
      if (next.trim() === "" || next.trim().startsWith("#")) {
        i += 1;
        continue;
      }
      if (indentOf(next) === 0) {
        break;
      }
      const content = next.trim();
      if (!content.startsWith("-")) {
        break;
      }
      items.push(stripQuotes(content.slice(1).trim()));
      i += 1;
    }
    return items;
  }
  return null;
}

/**
 * Hand-rolled YAML extractor for the `personas:` block of
 * `bmad-stepper.config.yaml`. Locates the top-level `personas:` line
 * and returns a Map keyed by step name. Mirrors Story 1.10's
 * `overrides:` extractor strategy (build.ts parseOverridesYaml).
 *
 * Returns an empty Map when the `personas:` block is absent (caller
 * decides whether to log a warn).
 */
function parsePersonasYaml(
  text: string,
): ReadonlyMap<string, string | readonly string[]> {
  const result = new Map<string, string | readonly string[]>();
  const lines = text.split(/\r?\n/);
  let i = 0;

  // Find `personas:` at column 0.
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (/^personas:\s*$/.test(line)) {
      i += 1;
      break;
    }
    i += 1;
  }
  if (i >= lines.length) {
    return result;
  }

  // Collect children at first non-zero indent under `personas:`.
  let stepIndent: number | null = null;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "" || line.trim().startsWith("#")) {
      i += 1;
      continue;
    }
    const indent = indentOf(line);
    if (indent === 0) {
      // Back at top-level — exit personas block.
      break;
    }
    if (stepIndent === null) {
      stepIndent = indent;
    }
    if (indent !== stepIndent) {
      i += 1;
      continue;
    }
    const stepLine = line.slice(indent);
    const colonIdx = stepLine.indexOf(":");
    if (colonIdx < 0) {
      i += 1;
      continue;
    }
    const stepName = stepLine.slice(0, colonIdx).trim();
    const valueRaw = stepLine.slice(colonIdx + 1).trim();
    i += 1;

    if (stepName === "") {
      continue;
    }

    if (valueRaw !== "") {
      const parsed = parseInlineValue(valueRaw);
      if (parsed !== null) {
        if (Array.isArray(parsed)) {
          result.set(
            stepName,
            parsed.map((v) => String(v)),
          );
        } else {
          result.set(stepName, String(parsed));
        }
      }
      continue;
    }

    // Dash-list block follows.
    const items: string[] = [];
    while (i < lines.length) {
      const next = lines[i] ?? "";
      if (next.trim() === "" || next.trim().startsWith("#")) {
        i += 1;
        continue;
      }
      const nextIndent = indentOf(next);
      if (nextIndent <= stepIndent) {
        break;
      }
      const content = next.slice(nextIndent);
      if (!content.startsWith("-")) {
        break;
      }
      items.push(stripQuotes(content.slice(1).trim()));
      i += 1;
    }
    if (items.length > 0) {
      result.set(stepName, items);
    }
  }

  return result;
}

/**
 * Detect whether a config file's text contains a `personas:` top-level
 * key (used to distinguish "file present, no personas: block" from "file
 * present, has personas: block but no match for this step").
 */
function hasPersonasBlock(text: string): boolean {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (/^personas:\s*$/.test(line)) {
      return true;
    }
  }
  return false;
}

/**
 * Tier 1: read `<pluginDir>/skills/<stepName>/SKILL.md` (or
 * `skill.yaml` fallback) for `persona:` frontmatter.
 */
async function tier1Frontmatter(
  stepName: string,
  pluginDir: string,
): Promise<string | readonly string[] | null> {
  const skillMdPath = path.join(pluginDir, "skills", stepName, "SKILL.md");
  const skillYamlPath = path.join(pluginDir, "skills", stepName, "skill.yaml");

  if (existsSync(skillMdPath)) {
    try {
      const text = await Bun.file(skillMdPath).text();
      const frontmatter = extractFrontmatter(text);
      if (frontmatter !== null) {
        const persona = extractPersonaFromFlatYaml(frontmatter);
        if (persona !== null) {
          return persona;
        }
      }
    } catch {
      // Fall through to skill.yaml fallback.
    }
  }

  if (existsSync(skillYamlPath)) {
    try {
      const text = await Bun.file(skillYamlPath).text();
      const persona = extractPersonaFromFlatYaml(text);
      if (persona !== null) {
        return persona;
      }
    } catch {
      // Fall through to no-Tier-1-hit.
    }
  }

  return null;
}

/**
 * Tier 2: read `<projectRoot>/bmad-stepper.config.yaml` (or override
 * `configPath`) for the `personas:` block. Returns the persona for
 * `stepName` if the block exists and contains a matching key, or
 * `null` if no match. Logs `warn` once when the file exists but lacks
 * a `personas:` block (per Tasks 4.13/4.14 in the story spec).
 */
async function tier2ProjectConfig(
  stepName: string,
  configPath: string,
): Promise<string | readonly string[] | null> {
  if (!existsSync(configPath)) {
    return null;
  }
  try {
    const text = await Bun.file(configPath).text();
    if (!hasPersonasBlock(text)) {
      warn(
        `personas: no personas: config block found at ${configPath}; skipping Tier 2`,
      );
      return null;
    }
    const personas = parsePersonasYaml(text);
    return personas.get(stepName) ?? null;
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    warn(
      `personas: project-config read failed at ${configPath}: ${reason}; skipping Tier 2`,
    );
    return null;
  }
}

/**
 * Tier 3: synchronous in-memory lookup in `DEFAULT_PERSONAS`.
 */
function tier3Defaults(stepName: string): string | readonly string[] | null {
  return DEFAULT_PERSONAS[stepName] ?? null;
}

/**
 * Tier 4: walk `<bmadDir>/<module>/config.yaml` for each present BMAD
 * module; substring-match `stepName` against the module's primary
 * trigger list. On hit, return the module's implicit persona from
 * MODULE_PERSONAS.
 *
 * The minimal pattern-match layer: a config file is considered to
 * "trigger" `stepName` if any non-blank line of the config file (after
 * stripping leading dashes/whitespace) is the literal `stepName` string.
 * This deliberately narrow matcher handles the common case (a `triggers:`
 * dash-list naming step ids); the precise BMAD-module-trigger schema
 * lands in Story 6.1.
 */
async function tier4ModuleConfig(
  stepName: string,
  bmadDir: string,
): Promise<string | null> {
  if (!existsSync(bmadDir)) {
    return null;
  }
  let entries: string[] = [];
  try {
    const direntList = await fs.readdir(bmadDir, { withFileTypes: true });
    entries = direntList
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    warn(
      `personas: module-config directory listing failed at ${bmadDir}: ${reason}; skipping Tier 4`,
    );
    return null;
  }

  for (const moduleName of entries) {
    const moduleConfigPath = path.join(bmadDir, moduleName, "config.yaml");
    if (!existsSync(moduleConfigPath)) {
      continue;
    }
    let text: string;
    try {
      text = await Bun.file(moduleConfigPath).text();
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/);
    let matched = false;
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line === "" || line.startsWith("#")) {
        continue;
      }
      // Strip a leading dash (dash-list item) and surrounding quotes.
      let candidate = line;
      if (candidate.startsWith("-")) {
        candidate = candidate.slice(1).trim();
      }
      candidate = stripQuotes(candidate);
      if (candidate === stepName) {
        matched = true;
        break;
      }
    }
    if (!matched) {
      continue;
    }
    const persona = MODULE_PERSONAS.get(moduleName);
    if (persona !== undefined) {
      return persona;
    }
  }
  return null;
}

/**
 * Resolve the persona for a BMAD step name through the 4-tier cascade.
 *
 * @throws {ConfigError} (code `CONFIG_ERROR`, exit 2) when no tier
 *   resolves. The error's `actionableHint` carries the verbatim AC-2
 *   string `Add a persona for <step> in bmad-stepper.config.yaml under
 *   the personas: block.`.
 */
export async function resolvePersona(
  input: ResolveInput,
): Promise<string | readonly string[]> {
  const projectRoot = input.projectRoot ?? process.cwd();
  const configPath =
    input.configPath ?? path.join(projectRoot, "bmad-stepper.config.yaml");
  const bmadDir = input.bmadConfigPath ?? path.join(projectRoot, "_bmad");

  // Tier 1: SKILL.md frontmatter (skipped when pluginDir absent).
  if (input.pluginDir !== undefined) {
    const tier1 = await tier1Frontmatter(input.stepName, input.pluginDir);
    if (tier1 !== null) {
      return tier1;
    }
  }

  // Tier 2: project config personas: block.
  const tier2 = await tier2ProjectConfig(input.stepName, configPath);
  if (tier2 !== null) {
    return tier2;
  }

  // Tier 3: hand-curated defaults (synchronous, zero IO).
  const tier3 = tier3Defaults(input.stepName);
  if (tier3 !== null) {
    return tier3;
  }

  // Tier 4: _bmad/<module>/config.yaml triggers.
  const tier4 = await tier4ModuleConfig(input.stepName, bmadDir);
  if (tier4 !== null) {
    return tier4;
  }

  // No-tier-resolves — fail-loud with the verbatim AC-2 hint.
  throw new ConfigError(
    `Persona not resolvable for step "${input.stepName}".`,
    JSON.stringify({
      step: input.stepName,
      tiersChecked: {
        tier1: input.pluginDir !== undefined ? "checked-no-match" : "skipped",
        tier2: "checked-no-match",
        tier3: "checked-no-match",
        tier4: "checked-no-match",
      },
    }),
    ac2NoPersonaHint(input.stepName),
  );
}
