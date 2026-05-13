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
 * Tier 2 parser strategy: TWO orthogonal paths per Story 6.2.
 *   - **STRICT path (Story 6.2 — preferred)**: when `BuildInput.overrides`
 *     is provided (typed Zod-validated record from `loadConfig()` →
 *     `config.overrides`), build() consumes the map directly. NO YAML
 *     parse. NO graceful degradation. Edge validation throws
 *     `ConfigError` (exit 2) with a single-line, field-pointing hint
 *     when an override declares an unknown predecessor / successor.
 *   - **LEGACY path (Story 1.10 — graceful)**: when `BuildInput.overrides
 *     === undefined`, build() reads `bmad-stepper.config.yaml` directly
 *     via the hand-rolled extractor (split on lines, find `overrides:`,
 *     walk indented children, parse simple types). On parse failure or
 *     missing file, log `warn` once and skip Tier 2 entirely (Story 1.10
 *     graceful-degradation per "Story 1.10 is foundational; Story 6.1+
 *     own strict validation" scoping). Edge validation throws
 *     `UnknownBmadSkillError` (exit 3) with the AC-3 verbatim hint.
 *
 * The origin of each entry's edges is tracked via a per-build
 * `overrideSources: Map<string, Set<string>>` so the dangling-edge check
 * can switch error class on origin (override → ConfigError; seed/
 * frontmatter → UnknownBmadSkillError) per AC line 1182-1184.
 */

import { existsSync } from "node:fs";
import * as path from "node:path";
import {
  ConfigError,
  DagCycleError,
  UnknownBmadSkillError,
} from "../errors.ts";
import { traceLog, warn } from "../io/log.ts";
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
 * Story 6.2 — single-line edge-pointing hint for an override-introduced
 * unknown predecessor / successor (per OQ-5).
 *
 * Format:
 *   See bmad-stepper.config.yaml at overrides.<skillName>.<edgeKind>[<index>]:
 *   <edgeKind> "<unknownDep>" is not a known skill. Run /bmad-next --doctor
 *   to validate the file against the schema.
 *
 * Both "See" and "Run" verbs satisfy the AR22 actionable-hint regex
 * `/^.*(Run|See|Try|Check) /`. The format is single-line (no `\n`/`\r`)
 * to satisfy Story 5.6's single-line constraint. The full multi-error
 * list (if more than one edge fails) is reserved for `--doctor` per
 * Story 6.1 SDR I-29 forward-tracker; the throw-site reports the FIRST
 * failure only.
 */
function overrideEdgeHint(
  skillName: string,
  edgeKind: "after" | "before",
  index: number,
  unknownDep: string,
): string {
  const noun = edgeKind === "after" ? "predecessor" : "successor";
  return `See bmad-stepper.config.yaml at overrides.${skillName}.${edgeKind}[${index}]: ${noun} "${unknownDep}" is not a known skill. Run /bmad-next --doctor to validate the file against the schema.`;
}

/**
 * Story 6.2 — apply a single override entry to the resolved node Map,
 * either patching an existing seed entry (when names match) or appending
 * a new node (when the name is new).
 *
 * Shared by the STRICT path (Story 6.2 — `BuildInput.overrides`
 * provided) and the LEGACY path (Story 1.10 — `parseOverridesYaml`
 * fallback) so the merge semantics stay identical between the two.
 *
 * Throws when an APPEND-mode entry (no seed match) lacks the required
 * `phase` field. The strict path catches this at the loader layer (Zod
 * does not require `phase`, so this is a runtime guard for new appends).
 */
function applyOverride(
  resolved: Map<string, DagNode>,
  name: string,
  override: OverrideEntry,
): void {
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
        override.persona !== undefined ? override.persona : existing.persona,
      ...(override.idempotent !== undefined
        ? { idempotent: override.idempotent }
        : existing.idempotent !== undefined
          ? { idempotent: existing.idempotent }
          : {}),
      ...(override.interactive !== undefined
        ? { interactive: override.interactive }
        : existing.interactive !== undefined
          ? { interactive: existing.interactive }
          : {}),
    };
    resolved.set(name, merged);
    return;
  }
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
    ...(override.interactive !== undefined
      ? { interactive: override.interactive }
      : {}),
  });
}

/**
 * Story 6.2 — origin tracker for override-introduced edges. Keyed by
 * skill name, value is the union of edge targets (from both `after` and
 * `before`) declared in an override entry. The dangling-edge check
 * consults this map to decide which error class to throw — `ConfigError`
 * for override-introduced unknowns (AC-2), `UnknownBmadSkillError` for
 * seed/frontmatter-introduced unknowns (Story 1.10 AC-3 unchanged).
 *
 * Stored alongside per-edge index Maps so the hint can point at the
 * exact `after[i]` or `before[i]` position (per OQ-5 hint format). The
 * `name → after-index` and `name → before-index` Maps key by edge target
 * (the unknown name) and value the index in the OVERRIDE entry's array.
 */
interface OverrideOriginTracking {
  readonly sources: Map<string, Set<string>>;
  /** name → (depTarget → index in override's `after` array) */
  readonly afterIndices: Map<string, Map<string, number>>;
  /** name → (depTarget → index in override's `before` array) */
  readonly beforeIndices: Map<string, Map<string, number>>;
}

/**
 * Story 6.2 — normalise `BuildInput.overrides` into a `Map<string,
 * OverrideEntry>` regardless of whether the caller supplied a
 * `ReadonlyMap` or a plain `Record` (Zod's `z.record` infers to
 * `Record<string, T>`). Iteration order matches the input — Map
 * insertion order or Object.entries order — both deterministic.
 *
 * Each entry's `name` field is filled from the map key (the canonical
 * skill ID) when undefined on the value object. This keeps the two
 * shapes interchangeable for downstream consumers.
 */
function normaliseOverridesInput(
  overrides:
    | ReadonlyMap<string, OverrideEntry>
    | Readonly<Record<string, OverrideEntry>>,
): Map<string, OverrideEntry> {
  const out = new Map<string, OverrideEntry>();
  if (overrides instanceof Map) {
    for (const [name, override] of overrides) {
      out.set(
        name,
        override.name === undefined ? { ...override, name } : override,
      );
    }
    return out;
  }
  for (const [name, override] of Object.entries(overrides)) {
    out.set(
      name,
      override.name === undefined ? { ...override, name } : override,
    );
  }
  return out;
}

function recordOverrideEdges(
  tracking: OverrideOriginTracking,
  name: string,
  override: OverrideEntry,
): void {
  const targets = new Set<string>();
  const afterIndex = new Map<string, number>();
  const beforeIndex = new Map<string, number>();
  if (override.after !== undefined) {
    for (let i = 0; i < override.after.length; i += 1) {
      const t = override.after[i];
      if (t === undefined) {
        continue;
      }
      targets.add(t);
      // First index wins (the offending edge surfaces the FIRST
      // declaration of the unknown name).
      if (!afterIndex.has(t)) {
        afterIndex.set(t, i);
      }
    }
  }
  if (override.before !== undefined) {
    for (let i = 0; i < override.before.length; i += 1) {
      const t = override.before[i];
      if (t === undefined) {
        continue;
      }
      targets.add(t);
      if (!beforeIndex.has(t)) {
        beforeIndex.set(t, i);
      }
    }
  }
  if (targets.size > 0) {
    tracking.sources.set(name, targets);
  }
  if (afterIndex.size > 0) {
    tracking.afterIndices.set(name, afterIndex);
  }
  if (beforeIndex.size > 0) {
    tracking.beforeIndices.set(name, beforeIndex);
  }
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
      interactive?: boolean;
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
      } else if (subKey === "interactive") {
        if (typeof parsed !== "boolean") {
          throw new Error(
            `invalid interactive value for skill ${skillName}: ${subValueRaw}`,
          );
        }
        entry.interactive = parsed;
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
  interactive?: boolean;
} {
  const lines = text.split(/\r?\n/);
  const result: {
    phase?: Phase;
    after?: string[];
    optional?: boolean;
    persona?: string | string[] | null;
    idempotent?: boolean;
    interactive?: boolean;
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
    } else if (key === "interactive" && typeof parsed === "boolean") {
      result.interactive = parsed;
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

  // Throw only when NEITHER file exists — there's nothing to read.
  // When the file exists but lacks `phase`, default to "implementation"
  // (catch-all bucket) + `optional: true` instead of failing. The
  // upstream bmad plugin's SKILL.md files declare only `{ name,
  // description }` — they don't carry phase metadata — so requiring
  // `phase` would force every plugin-shipped skill not in the seed to
  // fail loud (issue #72). Defaulting keeps the doctor green while
  // preserving the architecture's "seed is the curated source of
  // phase truth" principle: the auto-defaulted node ends up in the
  // implementation bucket flagged optional so it doesn't interfere
  // with the natural DAG ordering of seeded skills.
  if (parsed === null) {
    throw new UnknownBmadSkillError(
      `Unknown BMAD skill: ${skillName} — no SKILL.md or skill.yaml found`,
      JSON.stringify({ skill: skillName, attemptedPaths }),
      ac3UnknownSkillHint(skillName),
    );
  }

  return {
    name: skillName,
    phase: parsed.phase ?? "implementation",
    after: parsed.after ?? [],
    before: [], // Computed by build() step 5.
    optional: parsed.optional ?? (parsed.phase === undefined ? true : false),
    persona: parsed.persona ?? null,
    ...(parsed.idempotent !== undefined
      ? { idempotent: parsed.idempotent }
      : {}),
    ...(parsed.interactive !== undefined
      ? { interactive: parsed.interactive }
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
      ...(entry.interactive !== undefined
        ? { interactive: entry.interactive }
        : {}),
    });
  }

  // Tier 2: overrides — Story 6.2 STRICT path branches on
  // `input.overrides` provided; falls back to LEGACY parseOverridesYaml
  // (graceful degradation per Story 1.10) when undefined.
  const overrideTracking: OverrideOriginTracking = {
    sources: new Map(),
    afterIndices: new Map(),
    beforeIndices: new Map(),
  };

  if (input.overrides !== undefined) {
    // STRICT path (Story 6.2): consume the typed map directly. NO YAML
    // parse. NO graceful degradation — schema validation is the loader's
    // responsibility. Edge-validation errors throw ConfigError per AC-2.
    const overrides = normaliseOverridesInput(input.overrides);
    for (const [name, override] of overrides) {
      // Skip entries with nothing to merge (empty `{}`) — treat as a
      // no-op rather than throwing on missing `phase` (the user
      // declaring an empty entry is a no-op intent; `applyOverride`'s
      // append branch would otherwise fail).
      const existing = resolved.get(name);
      if (existing === undefined && override.phase === undefined) {
        // Defensive: empty append → no-op (not a runtime fault per AC).
        // The schema layer (.strict() + Zod) is the source-of-truth for
        // structural validation; missing `phase` for an APPEND simply
        // means the user did not author enough info to materialise the
        // node, so we skip.
        continue;
      }
      applyOverride(resolved, name, override);
      recordOverrideEdges(overrideTracking, name, override);
    }
  } else if (existsSync(overridesPath)) {
    // LEGACY path (Story 1.10): parse YAML directly with graceful
    // degradation on missing/malformed. Origin tracking still populated
    // so override-introduced unknowns surface as ConfigError per AC-2.
    try {
      const text = await Bun.file(overridesPath).text();
      const overrides = parseOverridesYaml(text);
      for (const [name, override] of overrides) {
        applyOverride(resolved, name, override);
        recordOverrideEdges(overrideTracking, name, override);
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
      traceLog(`dag: tier=seed/override skill=${skillName}`);
      continue;
    }
    if (input.pluginDir === undefined) {
      throw new UnknownBmadSkillError(
        `Unknown BMAD skill: ${skillName} — not in seed/overrides and no pluginDir provided for frontmatter parse`,
        JSON.stringify({ skill: skillName }),
        ac3UnknownSkillHint(skillName),
      );
    }
    traceLog(
      `dag: tier=frontmatter skill=${skillName} pluginDir=${input.pluginDir}`,
    );
    const node = await tier3FrontmatterParse(skillName, input.pluginDir);
    resolved.set(skillName, node);
  }

  // Step 4: compute edges + dangling-edge check.
  //
  // Story 6.2 — the dangling-edge check now BRANCHES on origin:
  //   - if the offending edge originated from an OVERRIDE entry's
  //     `after` or `before` array, throw ConfigError (exit 2) with a
  //     single-line, field-pointing hint pointing at the offending
  //     edge index per AC-2 + OQ-5;
  //   - else (seed-introduced or frontmatter-introduced unknown), throw
  //     UnknownBmadSkillError (exit 3) with the AC-3 verbatim hint
  //     (Story 1.10 behaviour preserved).
  const edgesOut = new Map<string, Set<string>>();
  const edgesIn = new Map<string, Set<string>>();
  for (const name of resolved.keys()) {
    edgesOut.set(name, new Set());
    edgesIn.set(name, new Set());
  }
  for (const node of resolved.values()) {
    for (const dep of node.after) {
      if (!resolved.has(dep)) {
        // Check if this `after` edge came from an override.
        const overrideTargets = overrideTracking.sources.get(node.name);
        if (overrideTargets?.has(dep)) {
          const idx =
            overrideTracking.afterIndices.get(node.name)?.get(dep) ?? 0;
          throw new ConfigError(
            `Unknown predecessor: ${dep} — referenced by overrides.${node.name}.after[${idx}] but not in seed/overrides/frontmatter`,
            JSON.stringify({
              skill: dep,
              referencedBy: node.name,
              edgeKind: "after",
              edgeIndex: idx,
            }),
            overrideEdgeHint(node.name, "after", idx, dep),
          );
        }
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

  // Story 6.2 — symmetric dangling-edge check for override `before`
  // edges. These edges DO NOT live on the resolved node's `after` (they
  // were authored as `before` on the override entry and represent the
  // SUCCESSOR side of the relationship). We validate them HERE: each
  // `before` target must exist in the resolved set so the inverse-edge
  // computation (Step 5) can complete. AC-2 symmetric: unknown
  // successor → ConfigError pointing at `before[<index>]`.
  for (const [name, beforeIndex] of overrideTracking.beforeIndices) {
    for (const [target, idx] of beforeIndex) {
      if (!resolved.has(target)) {
        throw new ConfigError(
          `Unknown successor: ${target} — referenced by overrides.${name}.before[${idx}] but not in seed/overrides/frontmatter`,
          JSON.stringify({
            skill: target,
            referencedBy: name,
            edgeKind: "before",
            edgeIndex: idx,
          }),
          overrideEdgeHint(name, "before", idx, target),
        );
      }
    }
  }

  // Story 6.2 — apply override `before` edges into the adjacency Maps
  // (the node owning the override authored the `before:` list, so for
  // each `before: T`, we record T.after += [name] equivalent — i.e.,
  // the node-owner is a SUCCESSOR of T, so edges T → name flow). The
  // inverse-edge propagation here is what Step 5 (`before` field
  // inversion) consumes for the final node materialisation.
  for (const [name, beforeIndex] of overrideTracking.beforeIndices) {
    for (const target of beforeIndex.keys()) {
      // edges flow from name → target (since `before: T` means "this
      // step is required BEFORE T begins" — name precedes T).
      edgesOut.get(name)?.add(target);
      edgesIn.get(target)?.add(name);
    }
  }

  // Step 5: compute `before` field by inverting `after` across all
  // resolved entries + folding in override-introduced `before` edges.
  //
  // Story 6.2 — when an override authored a `before: [T]` list, the
  // node-owner's relationship is "owner → T" (owner precedes T). This
  // means T.before includes owner. We surface that here by walking the
  // overrideTracking.beforeIndices map; each (ownerName → target) entry
  // corresponds to "target.before += ownerName".
  const finalNodes = new Map<string, DagNode>();
  for (const [name, node] of resolved) {
    const beforeSet = new Set<string>();
    for (const other of resolved.values()) {
      if (other.after.includes(name)) {
        beforeSet.add(other.name);
      }
    }
    // Fold override-authored `before` edges: any owner whose
    // `before: [name]` mentions this node makes the owner a predecessor
    // of `name` — so name's before-set includes the owner.
    for (const [ownerName, beforeIndex] of overrideTracking.beforeIndices) {
      if (beforeIndex.has(name)) {
        beforeSet.add(ownerName);
      }
    }
    const before = [...beforeSet].sort();
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

/**
 * I-37: validate that every key in a parsed overrides block is a known
 * BMAD skill ID. Throws `ConfigError` (exit 2) when any key is absent
 * from `allKnownSkills`, so the user gets an actionable hint pointing at
 * the `overrides:` block before the DAG is built.
 *
 * Called by `checkStepRegistry` in `src/commands/doctor/checks.ts` after
 * `OverridesSchema.safeParse()` succeeds.
 *
 * @param overrides        — the Zod-validated override map.
 * @param allKnownSkills   — the skill names returned by `detectBmadSkills`.
 */
export function validateOverrides(
  overrides: Record<string, unknown>,
  allKnownSkills: readonly string[],
): void {
  const knownSet = new Set(allKnownSkills);
  const unknown = Object.keys(overrides).filter((k) => !knownSet.has(k));
  if (unknown.length > 0) {
    throw new ConfigError(
      `config.overrides contains unknown skill IDs: ${unknown.join(", ")}`,
      `Unknown IDs: ${unknown.join(", ")}`,
      `Run /bmad-next --doctor to see the list of known BMAD skills, or check the overrides: block in bmad-stepper.config.yaml.`,
    );
  }
}
