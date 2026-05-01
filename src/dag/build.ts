/**
 * src/dag/build.ts — Three-tier resolver + Tarjan SCC cycle detection
 * (FR1, FR2, FR8, FR9, FR35, FR51, NFR-Sc1, NFR-R1, NFR-I2, AR33, AR41).
 *
 * Public function `build(input)` composes:
 *   Tier 1 (seed)        — `seedV6_x` from `./seed-v6.x.ts`.
 *   Tier 2 (overrides)   — hand-rolled YAML extractor on
 *                          `<projectRoot>/bmad-stepper.config.yaml`. Full
 *                          Zod-validated loader is Story 6.1 / 6.2.
 *   Tier 3 (frontmatter) — `<pluginDir>/skills/<name>/SKILL.md`
 *                          frontmatter parse, falling back to
 *                          `<pluginDir>/skills/<name>/skill.yaml`.
 *
 * Then runs Tarjan SCC for cycle detection and returns a sealed
 * `DagAdjacency`. Throws `UnknownBmadSkillError` for any skill not
 * resolvable through the three tiers (with the AC-3 verbatim hint
 * "Add an override for <skill> in bmad-stepper.config.yaml under the
 * overrides: block."). Throws `DagCycleError` when Tarjan finds an SCC
 * of size > 1 OR a size-1 SCC with a self-loop.
 *
 * Architecture compliance:
 *   - §D5 lines 411-443 — three-tier discovery cascade.
 *   - §D6 lines 445-473 — adjacency-list shape + Tarjan SCC + lazy
 *                         story-level loading scope.
 *   - AR33 line 213    — async function; throws StepperError subclasses
 *                         verbatim; no `console.*`; no `process.exit`.
 *   - AR41 line 1296   — `src/dag/` is mid-tier. Allowed imports:
 *                         foundational `../errors.ts`, `../io/log.ts`;
 *                         Bun stdlib `Bun.file`; Node stdlib
 *                         `node:fs/promises`, `node:path`; intra-module
 *                         siblings `./types.ts`, `./tarjan.ts`,
 *                         `./seed-v6.x.ts`. Forbidden: `../bmad-detect/`,
 *                         `../state/`, `../schemas/`, `../lock/`,
 *                         `../migrations/`, `../snapshot/`, `../personas/`,
 *                         `../commands/`, sibling mid-tier modules,
 *                         `node:child_process`, external libraries.
 *
 * Lazy story-level loading (NFR-Sc1, architecture line 471): `build()`
 * returns the GLOBAL skill DAG only — the ~30-50 BMAD skill nodes. It
 * does NOT enumerate `_bmad-output/implementation-artifacts/*-*.md` story
 * files. Per-story expansions (e.g., `bmad-dev-story` for epic 3 / story
 * 3.2 expanding into per-story sub-tasks) are deferred to Story 2.4
 * runner — the runner consults the epics/stories directory listing on
 * demand.
 *
 * Tier 2 parser strategy: hand-rolled minimal YAML extractor for the
 * `overrides:` block. Full Zod-validated YAML loader is Story 6.1
 * (`config-yaml-schema-loader`); strict `OverridesSchema` is Story 6.2.
 * The hand-rolled extractor is intentionally narrow — split on lines,
 * find `overrides:`, walk indented children, parse simple types (strings,
 * booleans, inline lists `[a, b]`, dash lists `- a`). On parse failure
 * or missing file, log `warn` once and skip Tier 2 entirely (graceful
 * degradation per "Story 1.10 is foundational; Story 6.1 owns strict
 * validation" scoping).
 */

import { existsSync } from "node:fs";
import * as path from "node:path";
import { DagCycleError, UnknownBmadSkillError } from "../errors.ts";
import { warn } from "../io/log.ts";
import { seedV6_x } from "./seed-v6.x.ts";
import { tarjanScc } from "./tarjan.ts";
import type {
  BuildInput,
  DagAdjacency,
  DagNode,
  OverrideEntry,
  Phase,
} from "./types.ts";

const VALID_PHASES: ReadonlySet<string> = new Set([
  "analysis",
  "planning",
  "solutioning",
  "implementation",
  "retro",
]);

/**
 * Compute the AC-3 verbatim hint for a Tier 3 throw.
 *
 * Architecture line 1381 + Story 1.10 AC-3 mandate the literal string
 * "Add an override for <skill> in bmad-stepper.config.yaml under the
 * overrides: block.". Substituted at the throw site via
 * `UnknownBmadSkillError`'s 3rd constructor arg.
 */
function ac3UnknownSkillHint(skillName: string): string {
  return `Add an override for ${skillName} in bmad-stepper.config.yaml under the overrides: block.`;
}

/**
 * Coerce a parsed YAML scalar into a `Phase` literal — returns null when
 * the value is not one of the five valid phases.
 */
function coercePhase(value: unknown): Phase | null {
  if (typeof value !== "string") {
    return null;
  }
  return VALID_PHASES.has(value) ? (value as Phase) : null;
}

/**
 * Parse a YAML inline scalar value. Handles:
 *   - bare strings (no quotes)
 *   - quoted strings ('foo' or "foo")
 *   - booleans (`true` / `false`)
 *   - inline lists (`[a, b, c]` or `[]`)
 */
function parseInlineValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return null;
  }
  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
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
 * Compute the leading-whitespace count for a YAML line.
 */
function indentOf(line: string): number {
  let i = 0;
  while (i < line.length && line[i] === " ") {
    i += 1;
  }
  return i;
}

/**
 * Hand-rolled YAML extractor for the `overrides:` block of
 * `bmad-stepper.config.yaml`. Returns a Map keyed by skill name, with
 * an `OverrideEntry` value per skill.
 *
 * Parser strategy: locate the top-level `overrides:` line; collect
 * indented children. Two indent levels matter:
 *   - Level A (2 spaces typically): a child key is a skill name.
 *   - Level B (4 spaces typically): a sub-key is one of `phase`, `after`,
 *     `optional`, `persona`, `idempotent`.
 *
 * `after` may be inline (`after: [a, b]`) or a dash-list:
 *   ```
 *   after:
 *     - a
 *     - b
 *   ```
 *
 * On any parse error (malformed YAML, unrecognised structure), throws
 * `Error` — the caller logs a warn and skips Tier 2 (graceful
 * degradation per Story 1.10 scoping).
 */
function parseOverridesYaml(text: string): ReadonlyMap<string, OverrideEntry> {
  const result = new Map<string, OverrideEntry>();
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
  if (i >= lines.length) {
    return result; // No overrides block — empty Map.
  }

  // Collect skill children. Skill keys live at the first non-zero indent
  // we encounter under `overrides:`.
  let skillIndent: number | null = null;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "" || line.trim().startsWith("#")) {
      i += 1;
      continue;
    }
    const indent = indentOf(line);
    if (indent === 0) {
      // Back at top-level key — exit overrides block.
      break;
    }
    if (skillIndent === null) {
      skillIndent = indent;
    }
    if (indent !== skillIndent) {
      // Unexpected indent — fall through; outer caller catches.
      i += 1;
      continue;
    }
    const skillLine = line.slice(indent);
    const skillMatch = /^([\w.-]+):\s*$/.exec(skillLine);
    if (!skillMatch) {
      throw new Error(`malformed skill key at line ${i + 1}: ${line}`);
    }
    const skillName = skillMatch[1];
    if (skillName === undefined) {
      throw new Error(`empty skill name at line ${i + 1}`);
    }
    i += 1;

    // Parse sub-keys until indent drops back to skillIndent or 0.
    const entry: {
      name: string;
      phase?: Phase;
      after?: string[];
      optional?: boolean;
      persona?: string | string[] | null;
      idempotent?: boolean;
    } = { name: skillName };

    while (i < lines.length) {
      const subLine = lines[i] ?? "";
      if (subLine.trim() === "" || subLine.trim().startsWith("#")) {
        i += 1;
        continue;
      }
      const subIndent = indentOf(subLine);
      if (subIndent <= skillIndent) {
        break;
      }
      const subContent = subLine.slice(subIndent);
      const colonIdx = subContent.indexOf(":");
      if (colonIdx < 0) {
        throw new Error(`malformed sub-key at line ${i + 1}: ${subLine}`);
      }
      const subKey = subContent.slice(0, colonIdx).trim();
      const subValueRaw = subContent.slice(colonIdx + 1).trim();
      i += 1;

      if (subValueRaw === "") {
        // Possible dash-list follow-up (for `after`).
        const items: string[] = [];
        while (i < lines.length) {
          const dashLine = lines[i] ?? "";
          if (dashLine.trim() === "" || dashLine.trim().startsWith("#")) {
            i += 1;
            continue;
          }
          const dashIndent = indentOf(dashLine);
          if (dashIndent <= subIndent) {
            break;
          }
          const dashContent = dashLine.slice(dashIndent);
          if (!dashContent.startsWith("-")) {
            break;
          }
          items.push(stripQuotes(dashContent.slice(1).trim()));
          i += 1;
        }
        if (subKey === "after") {
          entry.after = items;
        }
        continue;
      }

      const parsed = parseInlineValue(subValueRaw);
      if (subKey === "phase") {
        const phase = coercePhase(parsed);
        if (phase === null) {
          throw new Error(
            `invalid phase value at line for skill ${skillName}: ${subValueRaw}`,
          );
        }
        entry.phase = phase;
      } else if (subKey === "after") {
        if (Array.isArray(parsed)) {
          entry.after = parsed.map((v) => String(v));
        } else if (parsed === null) {
          entry.after = [];
        } else {
          entry.after = [String(parsed)];
        }
      } else if (subKey === "optional") {
        if (typeof parsed !== "boolean") {
          throw new Error(
            `invalid optional value for skill ${skillName}: ${subValueRaw}`,
          );
        }
        entry.optional = parsed;
      } else if (subKey === "persona") {
        if (parsed === null || parsed === "null") {
          entry.persona = null;
        } else if (Array.isArray(parsed)) {
          entry.persona = parsed.map((v) => String(v));
        } else {
          entry.persona = String(parsed);
        }
      } else if (subKey === "idempotent") {
        if (typeof parsed !== "boolean") {
          throw new Error(
            `invalid idempotent value for skill ${skillName}: ${subValueRaw}`,
          );
        }
        entry.idempotent = parsed;
      }
      // Unknown sub-keys are silently ignored — Story 6.1 owns strict
      // validation; Story 1.10 is graceful.
    }

    result.set(skillName, entry);
  }

  return result;
}

/**
 * Extract YAML frontmatter between the first `---\n` delimiter pair from
 * a SKILL.md file. Returns the raw frontmatter text. Returns null when
 * the file does not contain a frontmatter block.
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
 * Parse a flat YAML key:value block (no nested indented map) — used for
 * SKILL.md frontmatter and skill.yaml whole-file content. Returns a
 * partial entry object.
 */
function parseFlatYaml(text: string): {
  phase?: Phase;
  after?: string[];
  optional?: boolean;
  persona?: string | string[] | null;
  idempotent?: boolean;
} {
  const lines = text.split(/\r?\n/);
  const result: {
    phase?: Phase;
    after?: string[];
    optional?: boolean;
    persona?: string | string[] | null;
    idempotent?: boolean;
  } = {};
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

    if (valueRaw === "") {
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
      if (key === "after") {
        result.after = items;
      }
      continue;
    }

    const parsed = parseInlineValue(valueRaw);
    if (key === "phase") {
      const phase = coercePhase(parsed);
      if (phase !== null) {
        result.phase = phase;
      }
    } else if (key === "after") {
      if (Array.isArray(parsed)) {
        result.after = parsed.map((v) => String(v));
      } else if (parsed !== null) {
        result.after = [String(parsed)];
      }
    } else if (key === "optional" && typeof parsed === "boolean") {
      result.optional = parsed;
    } else if (key === "persona") {
      if (parsed === null || parsed === "null") {
        result.persona = null;
      } else if (Array.isArray(parsed)) {
        result.persona = parsed.map((v) => String(v));
      } else {
        result.persona = String(parsed);
      }
    } else if (key === "idempotent" && typeof parsed === "boolean") {
      result.idempotent = parsed;
    }
  }
  return result;
}

/**
 * Tier 3 frontmatter parse for a single skill name. Tries SKILL.md first
 * (canonical Claude Code plugin file), then falls back to skill.yaml.
 * Throws `UnknownBmadSkillError` (with AC-3 verbatim hint) on any failure
 * — file missing, frontmatter missing, required `phase` field missing or
 * invalid.
 */
async function tier3FrontmatterParse(
  skillName: string,
  pluginDir: string,
): Promise<DagNode> {
  const skillMdPath = path.join(pluginDir, "skills", skillName, "SKILL.md");
  const skillYamlPath = path.join(pluginDir, "skills", skillName, "skill.yaml");
  const attemptedPaths = [skillMdPath, skillYamlPath];

  let parsed: ReturnType<typeof parseFlatYaml> | null = null;

  if (existsSync(skillMdPath)) {
    try {
      const text = await Bun.file(skillMdPath).text();
      const frontmatter = extractFrontmatter(text);
      if (frontmatter !== null) {
        parsed = parseFlatYaml(frontmatter);
      }
    } catch {
      parsed = null;
    }
  }

  if (parsed === null && existsSync(skillYamlPath)) {
    try {
      const text = await Bun.file(skillYamlPath).text();
      parsed = parseFlatYaml(text);
    } catch {
      parsed = null;
    }
  }

  if (parsed === null || parsed.phase === undefined) {
    throw new UnknownBmadSkillError(
      `Unknown BMAD skill: ${skillName} — could not resolve via seed, overrides, or frontmatter parse`,
      JSON.stringify({ skill: skillName, attemptedPaths }),
      ac3UnknownSkillHint(skillName),
    );
  }

  return {
    name: skillName,
    phase: parsed.phase,
    after: parsed.after ?? [],
    before: [], // Computed by build() step 5.
    optional: parsed.optional ?? false,
    persona: parsed.persona ?? null,
    ...(parsed.idempotent !== undefined
      ? { idempotent: parsed.idempotent }
      : {}),
  };
}

/**
 * Build the global skill DAG. Returns a sealed `DagAdjacency` covering
 * the seed (Tier 1), any overrides (Tier 2), and any `skillNames` that
 * required Tier 3 frontmatter parse.
 *
 * Returns the FULL graph — NOT filtered to `skillNames`. The runner's
 * `--list` (Story 3.7) and `--explain` (Story 3.6) want the full graph
 * for candidate enumeration; `skillNames` only governs which Tier 3
 * frontmatter parses fire.
 *
 * @throws {UnknownBmadSkillError} when a `skillName` cannot be resolved
 *   via seed, overrides, or frontmatter parse — OR when an override's
 *   `after:` references a name that doesn't exist in the resolved set.
 * @throws {DagCycleError} when Tarjan SCC finds an SCC of size > 1 OR a
 *   size-1 SCC with a self-loop.
 */
export async function build(input: BuildInput): Promise<DagAdjacency> {
  const projectRoot = input.projectRoot ?? process.cwd();
  const overridesPath =
    input.overridesPath ?? path.join(projectRoot, "bmad-stepper.config.yaml");

  // Tier 1: seed.
  const resolved = new Map<string, DagNode>();
  for (const entry of seedV6_x) {
    resolved.set(entry.name, {
      name: entry.name,
      phase: entry.phase,
      after: [...entry.after],
      before: [],
      optional: entry.optional,
      persona: entry.persona,
    });
  }

  // Tier 2: overrides — graceful degradation on missing/malformed.
  if (existsSync(overridesPath)) {
    try {
      const text = await Bun.file(overridesPath).text();
      const overrides = parseOverridesYaml(text);
      for (const [name, override] of overrides) {
        const existing = resolved.get(name);
        if (existing !== undefined) {
          // Patch the seed entry with non-undefined override fields.
          const merged: DagNode = {
            name,
            phase: override.phase ?? existing.phase,
            after:
              override.after !== undefined
                ? [...override.after]
                : [...existing.after],
            before: [],
            optional: override.optional ?? existing.optional,
            persona:
              override.persona !== undefined
                ? override.persona
                : existing.persona,
            ...(override.idempotent !== undefined
              ? { idempotent: override.idempotent }
              : existing.idempotent !== undefined
                ? { idempotent: existing.idempotent }
                : {}),
          };
          resolved.set(name, merged);
        } else {
          // Append a new entry — phase is required for new entries.
          if (override.phase === undefined) {
            throw new Error(
              `override for new skill "${name}" missing required "phase" field`,
            );
          }
          resolved.set(name, {
            name,
            phase: override.phase,
            after: override.after !== undefined ? [...override.after] : [],
            before: [],
            optional: override.optional ?? false,
            persona: override.persona ?? null,
            ...(override.idempotent !== undefined
              ? { idempotent: override.idempotent }
              : {}),
          });
        }
      }
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      warn(
        `dag: overrides parse failed at ${overridesPath}: ${reason}; falling back to seed only`,
      );
    }
  } else {
    warn(`dag: no overrides config found at ${overridesPath}; using seed only`);
  }

  // Tier 3: frontmatter parse for unknown skillNames.
  for (const skillName of input.skillNames) {
    if (resolved.has(skillName)) {
      continue;
    }
    if (input.pluginDir === undefined) {
      throw new UnknownBmadSkillError(
        `Unknown BMAD skill: ${skillName} — not in seed/overrides and no pluginDir provided for frontmatter parse`,
        JSON.stringify({ skill: skillName }),
        ac3UnknownSkillHint(skillName),
      );
    }
    const node = await tier3FrontmatterParse(skillName, input.pluginDir);
    resolved.set(skillName, node);
  }

  // Step 4: compute edges + dangling-edge check.
  const edgesOut = new Map<string, Set<string>>();
  const edgesIn = new Map<string, Set<string>>();
  for (const name of resolved.keys()) {
    edgesOut.set(name, new Set());
    edgesIn.set(name, new Set());
  }
  for (const node of resolved.values()) {
    for (const dep of node.after) {
      if (!resolved.has(dep)) {
        throw new UnknownBmadSkillError(
          `Unknown BMAD skill: ${dep} — referenced by ${node.name}.after but not in seed/overrides/frontmatter`,
          JSON.stringify({ skill: dep, referencedBy: node.name }),
          ac3UnknownSkillHint(dep),
        );
      }
      edgesOut.get(dep)?.add(node.name);
      edgesIn.get(node.name)?.add(dep);
    }
  }

  // Step 5: compute `before` field by inverting `after` across all
  // resolved entries.
  const finalNodes = new Map<string, DagNode>();
  for (const [name, node] of resolved) {
    const before: string[] = [];
    for (const other of resolved.values()) {
      if (other.after.includes(name)) {
        before.push(other.name);
      }
    }
    before.sort();
    finalNodes.set(name, {
      ...node,
      before,
    });
  }

  // Step 6: Tarjan SCC + self-loop check.
  const sccs = tarjanScc(edgesOut);
  const cycles: string[][] = [];
  for (const scc of sccs) {
    if (scc.length > 1) {
      cycles.push(scc);
    } else if (scc.length === 1) {
      const only = scc[0];
      if (only !== undefined && edgesOut.get(only)?.has(only)) {
        cycles.push(scc);
      }
    }
  }
  if (cycles.length > 0) {
    throw new DagCycleError("DAG cycle detected", JSON.stringify({ cycles }));
  }

  return {
    nodes: finalNodes,
    edgesOut,
    edgesIn,
  };
}
