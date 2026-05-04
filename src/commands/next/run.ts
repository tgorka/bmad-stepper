/**
 * src/commands/next/run.ts — canonical lock-free `/bmad-next` runner
 * (FR1, FR8, FR9, FR10, FR11, FR12, FR13, FR14, FR15, FR16, FR18, FR53,
 *  FR54, NFR-P1, NFR-P3, NFR-S1, NFR-S4, NFR-S5, NFR-R1, NFR-R4, NFR-M3,
 *  AR7, AR8, AR9, AR21, AR22, AR33, AR41).
 *
 * **TOP-TIER MODULE** per AR41 (architecture lines 1294-1302). First
 * end-to-end runner of the project. Composes:
 *   - foundational: `../../errors.ts`, `../../io/log.ts`,
 *     `../../schemas/dispatch-protocol.ts`.
 *   - mid-tier:     `../../state/load.ts` (`loadStateUnlocked` ONLY,
 *                   per architecture §line 1672 + AR8 lock-free contract),
 *                   `../../dag/index.ts`, `../../personas/index.ts`.
 *   - higher-tier:  `../../dispatch/index.ts`, `../../verifiers/index.ts`.
 *   - intra-module: `./args.ts`.
 *   - top-tier sibling: `../doctor/run.ts` (`runDoctor` for `--doctor`
 *                   delegation per architecture §line 1671-1678 +
 *                   Story 1.12 precedent).
 *
 * **LOCK-FREE CONTRACT (architecture §line 1672 + AR8)**: this module
 * MUST NOT import from `../../lock/`, MUST NOT call `acquire()`, MUST
 * NOT call `loadState` (the locked variant), MUST NOT call `saveState`.
 * The state read uses `loadStateUnlocked` exclusively. The lock is
 * acquired ONLY in `verify-and-advance.ts` (Story 2.6 — separate process
 * invocation; the lock-free → lock-held boundary is the process
 * boundary).
 *
 * **AR9 STDOUT DISCIPLINE**: each `bun run` invocation emits EXACTLY
 * ONE JSON line on stdout — the `DispatchActionV1` line written via
 * `emitDispatchAction` (which calls `json()` from `src/io/log.ts` after
 * defence-in-depth `DispatchActionV1Schema.parse()`). All progress /
 * warning / error logging routes to stderr via `info()` / `warn()` /
 * `error()`. The `runNext` function itself returns the structured
 * `NextResult` and does NOT emit; only the `import.meta.main` block
 * emits the line. This separates testability (tests inspect the return
 * value) from process-level concerns.
 *
 * **READ-ONLY FLAG ROUTING**: per the AC-2 enumeration, `--list`,
 * `--explain`, `--diff-state`, `--export-state`, `--dry-run` each emit
 * `action: "report"` with the human-readable output via the `message`
 * field. Forward-deferred surfaces (`--export-state` → Story 3.10,
 * `--diff-state` → Story 3.8, `--explain` → Story 3.6, `--watch` →
 * Story 3.9, `--upgrade` → Story 6.9, `--force-unlock` → Epic 6) emit
 * explicit `action: "halt"` or `action: "report"` stubs with hints
 * pointing at the owning story; NEVER silently ignored.
 *
 * **STAGING ORPHAN CLEANUP**: Story 2.2 ships `cleanStagingOrphans()`
 * but does NOT wire the call site. Story 2.4 owns the wiring per Story
 * 2.2 §Tasks 7.5: "the architecture's 'at Stepper start' wording (AC-4)
 * implies the runner-tier (Story 2.4 run.ts or Story 2.6
 * verify-and-advance.ts) calls it once per `bun run` invocation". The
 * call is best-effort — failures are logged via `info()` (stderr) but
 * do NOT propagate (the orphan cleanup must NEVER block the dispatch).
 *
 * **TASK-SPEC POPULATOR**: Story 2.4 closes Story 2.2's senior dev
 * review info-3 carry-over by populating `taskSpec.context[]` (from the
 * resolved DAG node's `after[]` list mapped to canonical artifact paths
 * under `_bmad-output/`) and `taskSpec.outputFormat.requiredSections`
 * (from Story 2.1's verifier registry via
 * `getVerifierConfig(stepName).requiredFrontmatterSections`). Story 2.4
 * Task 11 extends `BuildDispatchSpecInput` with optional `contextRefs`
 * + `requiredSections` fields (additive — Story 2.2's existing tests
 * continue to pass).
 *
 * **MULTI-PERSONA HANDLING (AR16)**: `resolvePersona` may return
 * `string | readonly string[]` per architecture §line 187. v0.1 picks
 * the first element via `pickFirstPersona` helper and surfaces a
 * stderr warn when an array is returned; the full sequential dispatch
 * is forward-deferred to Stories 4.1 (loop runner) + 5.* (failure-UX
 * engine).
 *
 * **EXIT-CODE MAPPING (FR53)**: 0 (success), 1 (halt-with-actionable-
 * error), 2 (configuration error), 3 (BMAD compatibility), 4 (lock
 * contention — UNREACHABLE in run.ts; lock-free), 5 (pathological
 * input).
 *
 * Architecture cross-references:
 *   - architecture.md §A.D1 lines 270-296 (three-layer execution model).
 *   - architecture.md §A.D2 lines 297-336 (sub-agent dispatch via Task tool).
 *   - architecture.md §A.D7 lines 460-490 (DAG + next-step computation).
 *   - architecture.md §P5 lines 864-917 (`dispatch-spec.json` contract).
 *   - architecture.md §line 1107 (`src/commands/next/run.ts` directory listing).
 *   - architecture.md §line 1294-1302 (AR41 top-tier import boundary).
 *   - architecture.md §line 1450 (Layer 1↔2↔3 sequence).
 *   - architecture.md §line 1660 (AR9 protocol concretization).
 *   - architecture.md §line 1672 (run.ts is read-only / lock-free).
 *   - architecture.md §line 1676 (JSON-line protocol via dispatch-protocol.ts).
 *   - prd.md FR53 line 744 (exit codes 0-5).
 *   - prd.md FR54 line 745 (stdout/stderr discipline).
 *   - epics.md §Story 2.4 lines 627-645 (AC verbatim source).
 */

import * as path from "node:path";
import { build, type DagAdjacency, type DagNode } from "../../dag/index.ts";
import {
  buildDispatchSpec,
  cleanStagingOrphans,
  type Phase as DispatchPhase,
  emitDispatchAction,
} from "../../dispatch/index.ts";
import { ConfigError, StepperError } from "../../errors.ts";
import { error, info, warn } from "../../io/log.ts";
import { resolvePersona } from "../../personas/index.ts";
import type { DispatchActionV1 } from "../../schemas/dispatch-protocol.ts";
import type { LastAttempted, State } from "../../schemas/state.ts";
import { loadStateUnlocked } from "../../state/load.ts";
import { getVerifierConfig } from "../../verifiers/index.ts";
import { runDoctor } from "../doctor/run.ts";
import { type NextArgs, type ParseError, parseNextArgs } from "./args.ts";

// ─── Module-level constants ────────────────────────────────────────────────

/**
 * The canonical sub-agent name Layer 1 invokes via Task. Hard-coded
 * literal must match Story 2.3's `agents/bmad-step-runner.md`
 * frontmatter `name: bmad-step-runner` verbatim — coupled atomic change
 * if ever renamed (both files must change together). Verified at
 * runtime by `emitDispatchAction`'s defence-in-depth Zod parse and by
 * the colocated `run.test.ts` AR41-boundary assertions.
 */
const STEP_RUNNER_AGENT = "bmad-step-runner" as const;

/**
 * Canonical phase ordering for the next-step tiebreaker per architecture
 * line 469 (analysis → planning → solutioning → implementation → retro).
 * Used by `pickNextStep` to break ties between candidates whose `after`
 * lists are equally satisfied.
 */
const PHASE_ORDER: ReadonlyMap<string, number> = new Map([
  ["analysis", 0],
  ["planning", 1],
  ["solutioning", 2],
  ["implementation", 3],
  ["retro", 4],
]);

/**
 * Story 3.2: failure codes that BLOCK `--resume` per epic AC line 746
 * ("recoverable (not `BMAD_INCOMPATIBLE` or `BMAD_NOT_INSTALLED`)").
 *
 * Both codes carry exitCode 3 (BMAD compatibility errors per
 * `src/errors.ts:92-104`). All 14 OTHER codes in the 16-code error
 * registry are RESUMABLE (recoverable). When `state.lastFailureReason.code`
 * is in this set, `resolveResumeTarget` throws `ConfigError` with the
 * actionable hint pointing the user at `/bmad-next --doctor`.
 *
 * When `state.lastFailureReason === null` (e.g., the user killed the
 * process between `run.ts` exit and `verify-and-advance.ts` start), the
 * recoverability check is SKIPPED — the resume targets `state.lastAttempted`
 * regardless. This is the AC-1 happy-path edge case documented in the
 * Story 3.2 spec §Context Summary.
 */
const NON_RECOVERABLE_FAILURE_CODES: ReadonlySet<string> = new Set([
  "BMAD_INCOMPATIBLE",
  "BMAD_NOT_INSTALLED",
]);

/**
 * Canonical artifact-path mapping for Story 2.2 carry-over (populate
 * `taskSpec.context[]`). v0.1 conservative lookup table — maps a
 * prerequisite step name to its canonical artifact path under
 * `_bmad-output/`. The full BMAD-skill metadata extraction is a
 * Story 6.x telemetry-driven enhancement. **Best-effort**: if a
 * referenced artifact does NOT yet exist on disk, the entry is emitted
 * anyway (the sub-agent will surface the missing-input error via Story
 * 2.1's `runVerifier` `required-files` check).
 *
 * Path-mapping convention (per architecture §P5 lines 868-887):
 *   - Planning artifacts:       `_bmad-output/planning-artifacts/<step>.md`
 *   - Implementation artifacts: `_bmad-output/implementation-artifacts/<step>-*.md`
 */
const ARTIFACT_PATH_PREFIX_PLANNING = "_bmad-output/planning-artifacts";
const ARTIFACT_PATH_PREFIX_IMPLEMENTATION =
  "_bmad-output/implementation-artifacts";

/**
 * Logger surface accepted by `runNext` for test injection. Mirrors
 * Story 1.12's `RunDoctorOptions.logger` shape, plus the `json` writer
 * for the AR9 stdout line (used by `emitDispatchAction` transitively;
 * tests typically pass through to the real implementation).
 */
interface LoggerFns {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  json(payload: unknown): void;
}

// ─── Public types ─────────────────────────────────────────────────────────

/**
 * Test-injection escape hatches for `runNext`. Mirrors Story 1.12's
 * `RunDoctorOptions extends CheckContext` precedent — every IO concern
 * is injectable for tmpdir-per-test isolation. Production callers pass
 * none (all defaults resolve from `process.cwd()` / process.argv).
 */
export interface RunNextOptions {
  /** Argv slice (defaults to `process.argv.slice(2)`). */
  readonly argv?: readonly string[];
  /** Project root for `bmad-stepper.config.yaml`, `_bmad/`, etc. (defaults to `process.cwd()`). */
  readonly projectRoot?: string;
  /** Forwarded to `loadStateUnlocked`. */
  readonly statePath?: string;
  /** Forwarded to `buildDispatchSpec` + `cleanStagingOrphans`. */
  readonly stagingRoot?: string;
  /** Forwarded to `build` + `resolvePersona` (BMAD plugin root). */
  readonly pluginDir?: string;
  /** Forwarded to `build` (overrides config path). */
  readonly overridesPath?: string;
  /** Forwarded to `resolvePersona` (project config personas: block). */
  readonly configPath?: string;
  /** Forwarded to `resolvePersona` (`_bmad/<module>/config.yaml` root). */
  readonly bmadConfigPath?: string;
  /**
   * Forwarded to `build` (BMAD-detected skill names). When undefined
   * the runner falls through to seed-only DAG per Story 1.10 graceful
   * degradation.
   */
  readonly skillNames?: readonly string[];
  /** Forwarded to `buildDispatchSpec` (deterministic runId). */
  readonly nowIso?: string;
  /** Logger override; defaults to `{ info, warn, error, json }` from `src/io/log.ts`. */
  readonly logger?: LoggerFns;
}

/**
 * Structured return value from `runNext`. Tests inspect this directly
 * WITHOUT mutating stdout / process state. The `import.meta.main`
 * block emits the AR9 line via `emitDispatchAction(result.action)` and
 * exits with `result.exitCode`.
 *
 * The exit code 4 (lock contention) is UNREACHABLE in `runNext` since
 * the runner is lock-free — no possible code path can produce it.
 */
export interface NextResult {
  readonly exitCode: 0 | 1 | 2 | 3 | 5;
  readonly action: DispatchActionV1;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Default logger that delegates to `src/io/log.ts` writers.
 */
function defaultLogger(): LoggerFns {
  return {
    info(message: string): void {
      info(message);
    },
    warn(message: string): void {
      warn(message);
    },
    error(message: string): void {
      error(message);
    },
    json(payload: unknown): void {
      // Lazy lookup — `emitDispatchAction` calls `json()` directly via
      // `src/io/log.ts`, but the logger plumbing is preserved for
      // future refactors (e.g., a test that wants to capture the JSON
      // line without invoking `emitDispatchAction`).
      void payload;
    },
  };
}

/**
 * Cross-validation gap closure (Story 1.7 args.ts line 65 forward-dep):
 * `--include-optional` and `--no-optional` are mutually exclusive in
 * semantics but the parser is lenient. The runner enforces the
 * exclusion here. Throws `ConfigError` (code `CONFIG_ERROR`, exitCode
 * 2) with the verbatim hint per AC.
 */
function enforceMutuallyExclusiveFlags(args: NextArgs): void {
  if (args.includeOptional && args.noOptional) {
    throw new ConfigError(
      "Both --include-optional and --no-optional were passed; the flags are mutually exclusive.",
      JSON.stringify({
        includeOptional: args.includeOptional,
        noOptional: args.noOptional,
      }),
      "Pass either --include-optional or --no-optional, not both.",
    );
  }
}

/**
 * Coerce a `string | readonly string[]` persona resolver result into a
 * single string per architecture §line 187 + AR16 multi-persona
 * deferral. v0.1 picks the FIRST element from an array and surfaces a
 * stderr warn ("Multi-persona sequential dispatch is deferred to
 * Stories 4.1 + 5.*; current invocation uses persona <first>"). Full
 * sequential dispatch is forward-deferred.
 *
 * Throws `ConfigError` (code `CONFIG_ERROR`, exitCode 2) with a
 * `hintOverride` if the persona array is empty (configuration error —
 * the project's `bmad-stepper.config.yaml personas:` block must
 * declare at least one persona per step).
 */
function pickFirstPersona(
  persona: string | readonly string[],
  stepName: string,
  log: LoggerFns,
): string {
  if (Array.isArray(persona)) {
    const arr = persona as readonly string[];
    if (arr.length === 0) {
      throw new ConfigError(
        `Persona array for step "${stepName}" is empty.`,
        JSON.stringify({ stepName, persona: arr }),
        `Configure at least one persona for ${stepName} in bmad-stepper.config.yaml under the personas: block.`,
      );
    }
    const first = arr[0] as string;
    log.warn(
      `next: multi-persona sequential dispatch is deferred to Stories 4.1 + 5.*; current invocation uses persona ${first} (step ${stepName})`,
    );
    return first;
  }
  return persona as string;
}

/**
 * Map a DAG `Phase` (5 values) to a dispatch `Phase` (2 values). The
 * dispatch module's `Phase` type currently only declares
 * `"planning" | "implementation"` per Story 2.2 dev-001 deviation; the
 * full 5-phase enum lands in a future schema bump. v0.1 mapping:
 *   - `analysis | planning | solutioning` → `"planning"`.
 *   - `implementation | retro`            → `"implementation"`.
 */
function dagPhaseToDispatchPhase(phase: DagNode["phase"]): DispatchPhase {
  if (phase === "analysis" || phase === "planning" || phase === "solutioning") {
    return "planning";
  }
  return "implementation";
}

/**
 * Build the canonical `_bmad-output/` artifact path for a prerequisite
 * step name. v0.1 conservative mapping — uses Story 1.10's seed phase
 * convention to decide between `planning-artifacts/` and
 * `implementation-artifacts/`. Falls through to
 * `implementation-artifacts/` when the phase is unknown.
 *
 * The full BMAD-skill metadata reading is a Story 6.x telemetry-driven
 * enhancement; v0.1 ships the simple lookup that closes Story 2.2
 * carry-over without introducing a new file-system dependency.
 */
function artifactPathForStep(
  node: DagNode | undefined,
  stepName: string,
): string {
  if (
    node !== undefined &&
    (node.phase === "analysis" ||
      node.phase === "planning" ||
      node.phase === "solutioning")
  ) {
    return path.posix.join(ARTIFACT_PATH_PREFIX_PLANNING, `${stepName}.md`);
  }
  return path.posix.join(ARTIFACT_PATH_PREFIX_IMPLEMENTATION, `${stepName}.md`);
}

/**
 * Build the `taskSpec.context[]` populator for a resolved next-step
 * node per Story 2.2 carry-over. For each prerequisite in `node.after`,
 * emits a `{ path, label }` entry pointing at the canonical artifact
 * path under `_bmad-output/`. Returns `[]` for nodes with empty
 * `node.after` (e.g., the seed analysis-phase entry-points like
 * `bmad-brainstorming`).
 *
 * **Best-effort**: if a referenced artifact does NOT yet exist on disk,
 * the entry is emitted anyway (the sub-agent will surface the
 * missing-input error via Story 2.1's `runVerifier` `required-files`
 * check). This v0.1 conservative behaviour mirrors Story 2.2's
 * `taskSpec.constraints.scopeLimits` hard-coding — best-effort
 * resolution; the verifier handles the actual artifact-existence check.
 */
function buildContextRefs(
  node: DagNode,
  dag: DagAdjacency,
): Array<{ path: string; label: string }> {
  const refs: Array<{ path: string; label: string }> = [];
  for (const prereqName of node.after) {
    const prereqNode = dag.nodes.get(prereqName);
    refs.push({
      path: artifactPathForStep(prereqNode, prereqName),
      label: prereqName,
    });
  }
  return refs;
}

/**
 * Compute the `taskSpec.outputFormat.requiredSections` populator for a
 * step name per Story 2.2 carry-over. Calls Story 2.1's
 * `getVerifierConfig(stepName)` and returns the resolved
 * `requiredFrontmatterSections` array (or `[]` when no per-step
 * config exists; the verifier registry has a `defaultVerifiers.default`
 * fallback that returns `[]`).
 */
function getRequiredSections(stepName: string): readonly string[] {
  const config = getVerifierConfig(stepName);
  return config.requiredFrontmatterSections;
}

/**
 * Resolve the next step from the DAG given the current state + filter
 * args. v0.1 inline implementation per architecture §A.D7 + Story 2.4
 * Task 7.3:
 *
 *   - If `args.step` is set → resolve to that step name; throw
 *     `ConfigError` if not in the DAG.
 *   - Else if `state.lastSuccessfulStep` is null/undefined → pick the
 *     first analysis-phase entry-point with empty `after[]` (per
 *     architecture line 419 — phase-ordered tiebreaker).
 *   - Else → pick the first node in the DAG whose `after` list is
 *     fully satisfied by `state.lastSuccessfulStep`. Tiebreaker: phase
 *     order then name lexicographic (architecture line 469).
 *
 *   - Apply `args.epic`, `args.story`, `args.phase` filters BEFORE
 *     selection (empty-string flag values treated as "no filter" per
 *     Story 1.7 line 70 forward-dep).
 *   - Apply `args.includeOptional` / `args.noOptional` to filter
 *     `node.optional === true` candidates.
 *   - If no candidate after filtering → throw `ConfigError` with
 *     `hintOverride: "Run /bmad-next --list to see candidate steps;
 *     the current filter excludes all candidates."`.
 */
function pickNextStep(
  state: State,
  dag: DagAdjacency,
  args: NextArgs,
): DagNode {
  // Explicit --step path (highest priority).
  if (args.step !== undefined && args.step !== "") {
    const node = dag.nodes.get(args.step);
    if (node === undefined) {
      throw new ConfigError(
        `Unknown step: ${args.step}`,
        JSON.stringify({ step: args.step, available: [...dag.nodes.keys()] }),
        `Run /bmad-next --list to see candidate steps; "${args.step}" is not in the resolved DAG.`,
      );
    }
    return node;
  }

  // Compute candidates: nodes with all prerequisites satisfied.
  // v0.1 simple model:
  //   - When state has no `lastSuccessfulStep` (fresh project): only
  //     consider true entry-points (nodes with empty `after[]`). This
  //     is the architecturally-correct first-step semantics.
  //   - When `lastSuccessfulStep` exists: consider every node whose
  //     `after[]` list contains the last step (i.e., "next-after-X").
  //     v0.1 simplification — the full transitive-completion model
  //     lands in Story 3.6/3.7 (`--explain`/`--list` enhancements).
  const lastStepName = state.lastSuccessfulStep?.step;

  const candidates: DagNode[] = [];
  for (const node of dag.nodes.values()) {
    // Skip the last successful step itself (cannot re-pick the
    // previous step as "next"); the runner moves forward in the DAG.
    if (node.name === lastStepName) {
      continue;
    }
    if (lastStepName === undefined) {
      // Fresh-project case: only entry-points (empty `after[]`).
      if (node.after.length === 0) {
        candidates.push(node);
      }
    } else {
      // Post-first-step case: nodes whose `after[]` includes the
      // most-recently-completed step.
      if (node.after.includes(lastStepName)) {
        candidates.push(node);
      }
    }
  }

  // Apply args.phase filter (Phase enum mapping — args.phase is a DAG
  // phase per Story 1.7's NextArgsSchema enum).
  let filtered = candidates;
  if (args.phase !== undefined) {
    filtered = filtered.filter((n) => n.phase === args.phase);
  }

  // Apply args.epic / args.story filters: v0.1 simple semantics — these
  // filters narrow the candidate set when the runner-tier knows the
  // story-level metadata. The DAG nodes do NOT carry epic/story
  // attribution at the seed level (story attribution is project-level
  // and lives in `_bmad-output/implementation-artifacts/<story-key>.md`
  // frontmatter — Story 6.x telemetry enhancement). v0.1 ignores
  // empty-string inputs ("no filter" per Story 1.7 line 70 forward-dep)
  // and otherwise preserves the candidate set for now (a future Story
  // 3.4 enhancement may cross-reference epic/story metadata).
  if (args.epic !== undefined && args.epic !== "") {
    // No epic-level attribution at the DAG node level in v0.1; preserved.
    void args.epic;
  }
  if (args.story !== undefined && args.story !== "") {
    void args.story;
  }

  // Apply optional inclusion/exclusion.
  if (args.noOptional) {
    filtered = filtered.filter((n) => !n.optional);
  } else if (!args.includeOptional) {
    // Default v0.1 behaviour: exclude optional nodes UNLESS
    // includeOptional is explicitly set.
    filtered = filtered.filter((n) => !n.optional);
  }

  if (filtered.length === 0) {
    throw new ConfigError(
      "No candidate next step matches the current state + filters.",
      JSON.stringify({
        lastSuccessfulStep: lastStepName,
        filters: {
          epic: args.epic,
          story: args.story,
          phase: args.phase,
          includeOptional: args.includeOptional,
          noOptional: args.noOptional,
        },
      }),
      "Run /bmad-next --list to see candidate steps; the current filter excludes all candidates.",
    );
  }

  // Tiebreaker: phase order then name lexicographic.
  filtered.sort((a, b) => {
    const pa = PHASE_ORDER.get(a.phase) ?? 999;
    const pb = PHASE_ORDER.get(b.phase) ?? 999;
    if (pa !== pb) return pa - pb;
    return a.name.localeCompare(b.name);
  });

  // biome-ignore lint/style/noNonNullAssertion: filtered.length > 0 checked above
  return filtered[0]!;
}

// ─── Story 3.2: --resume target resolver ─────────────────────────────────

/**
 * Story 3.2: structured result from `resolveResumeTarget`. The runner
 * substitutes these values for the standard `pickNextStep(...)` +
 * `buildContextRefs(...)` + `buildDispatchSpec(...)` derivations on the
 * `--resume` path:
 *   - `node`         — the DAG node for `state.lastAttempted.step`.
 *   - `contextRefs`  — 0/1/2 best-effort `{ path, label }` entries to
 *                       APPEND to the prerequisite-derived context refs:
 *                         * 1 entry pointing at the failure-reason
 *                           transcript path under `_bmad-output/.stepper/runs/<runId>/log.md`
 *                           when `state.lastFailureReason !== null`.
 *                         * 1 entry pointing at the canonical last-attempt
 *                           artifact path under
 *                           `_bmad-output/<planning|implementation>-artifacts/<step>.md`
 *                           (always emitted on resume — best-effort, may
 *                           not exist on disk).
 *   - `epic`/`story` — the canonical resume tuple carried verbatim from
 *                       `state.lastAttempted` (NOT recomputed from
 *                       `state.lastSuccessfulStep`). Forwarded as explicit
 *                       overrides to `buildDispatchSpec`.
 *   - `lastAttempted` — the original `state.lastAttempted` literal
 *                       (preserved for downstream symmetry / future use).
 */
interface ResolveResumeTargetResult {
  readonly node: DagNode;
  readonly contextRefs: ReadonlyArray<{ path: string; label: string }>;
  readonly epic: number;
  readonly story: string;
  readonly lastAttempted: LastAttempted;
}

/**
 * Story 3.2: resolve the `--resume` target from `state.lastAttempted`.
 *
 * Encapsulates the three failure modes per epic AC lines 738-754:
 *   1. AC-2: `state.lastAttempted === null` → throw `ConfigError`
 *      with the verbatim hint
 *      `No prior halt to resume from. Run /bmad-next to advance to the next step.`
 *   2. AC-1 recoverability gate: `state.lastFailureReason.code` is in
 *      `NON_RECOVERABLE_FAILURE_CODES` → throw `ConfigError` with the
 *      hint `Last failure was <code> which is not resumable.
 *      Run /bmad-next --doctor to inspect the BMAD installation, then re-run /bmad-next.`
 *   3. Edge case: `state.lastAttempted.step` is no longer in the
 *      resolved DAG (e.g., BMAD installation upgraded since the halt) →
 *      throw `ConfigError` with the hint
 *      `Step <step> from lastAttempted is no longer in the DAG.
 *      Run /bmad-next --recompute-state and re-run /bmad-next.`
 *
 * Per epic AC line 754, `--resume + --skip` is rejected as
 * unimplemented in v0.1; Story 5.2 owns `--skip` AND the cross-validation
 * rejection. Story 3.2 ships NO enforcement code because `--skip` is NOT
 * yet declared in `NextArgsSchema` (Story 1.7's 18-flag inventory does
 * not include `--skip`).
 *
 * Resume substitutes the cached `state.lastAttempted.step` for the
 * standard `pickNextStep(state, dag, args)` result. Filter args
 * (`--epic`, `--story`, `--phase`, `--include-optional`,
 * `--no-optional`) are SILENTLY IGNORED on resume — the user's intent is
 * "do the same thing again", not "compute the next step under the
 * current filters".
 *
 * Throws (all `ConfigError` with `hintOverride` per Story 1.11 AC-2 +
 * Story 1.10 AC-3 precedent — registry stays at 16 codes):
 *   - `ConfigError` (CONFIG_ERROR, exitCode 2) per the three cases above.
 */
function resolveResumeTarget(
  state: State,
  dag: DagAdjacency,
): ResolveResumeTargetResult {
  // AC-2: no halted run to resume from.
  if (state.lastAttempted === null || state.lastAttempted === undefined) {
    throw new ConfigError(
      "resume: no halted run to resume from",
      JSON.stringify({ lastAttempted: state.lastAttempted ?? null }),
      "No prior halt to resume from. Run /bmad-next to advance to the next step.",
    );
  }

  // AC-1 recoverability gate. Per epic AC line 746, only `BMAD_INCOMPATIBLE`
  // and `BMAD_NOT_INSTALLED` block resume. All other codes are recoverable.
  // When `state.lastFailureReason === null` (the user killed the process
  // between layers, OR Story 3.1's halt-path save was bypassed), the gate
  // is SKIPPED and the resume proceeds with no failure-reason context.
  const failureCode = state.lastFailureReason?.code;
  if (
    failureCode !== undefined &&
    NON_RECOVERABLE_FAILURE_CODES.has(failureCode)
  ) {
    throw new ConfigError(
      `resume: lastFailureReason.code ${failureCode} is not resumable`,
      JSON.stringify({ failureCode }),
      `Last failure was ${failureCode} which is not resumable. Run /bmad-next --doctor to inspect the BMAD installation, then re-run /bmad-next.`,
    );
  }

  // Edge: lastAttempted.step no longer in the resolved DAG (e.g., BMAD
  // installation upgraded since the halt; the step name was renamed).
  const node = dag.nodes.get(state.lastAttempted.step);
  if (node === undefined) {
    throw new ConfigError(
      `resume: lastAttempted.step ${state.lastAttempted.step} is not in the resolved DAG`,
      JSON.stringify({
        step: state.lastAttempted.step,
        available: [...dag.nodes.keys()],
      }),
      `Step ${state.lastAttempted.step} from lastAttempted is no longer in the DAG. Run /bmad-next --recompute-state and re-run /bmad-next.`,
    );
  }

  // Build best-effort resume-context refs (sub-agent reads-or-creates;
  // missing files surface via Story 2.1 `runVerifier` `required-files`
  // check — the same best-effort pattern as `buildContextRefs`).
  const contextRefs: Array<{ path: string; label: string }> = [];
  if (
    state.lastFailureReason !== null &&
    state.lastFailureReason !== undefined
  ) {
    const transcriptPath = path.posix.join(
      "_bmad-output/.stepper/runs",
      state.lastFailureReason.runId,
      "log.md",
    );
    contextRefs.push({
      path: transcriptPath,
      label: `Previous failure: ${state.lastFailureReason.code} — ${state.lastFailureReason.message}`,
    });
  }
  contextRefs.push({
    path: artifactPathForStep(node, state.lastAttempted.step),
    label: "Last attempted artifact (may be missing or incomplete)",
  });

  return {
    node,
    contextRefs,
    epic: state.lastAttempted.epic,
    story: state.lastAttempted.story,
    lastAttempted: state.lastAttempted,
  };
}

// ─── Public function ──────────────────────────────────────────────────────

/**
 * Run the canonical lock-free `/bmad-next` orchestration. Composes the
 * full mid-tier + higher-tier surface into a single async function
 * that returns a structured `NextResult` for tests to inspect; the
 * `import.meta.main` block emits the AR9 line + exits with the result
 * code.
 *
 * Algorithm:
 *   1. Resolve options + parse argv via `parseNextArgs`. On parse
 *      failure → halt with exitCode 2 (FR53 configuration error).
 *   2. Cross-validate flags (Story 1.7 forward-dep): enforce
 *      `--include-optional` ⊕ `--no-optional`.
 *   3. Forward-deferral guards (`--upgrade`, `--watch`, `--force-unlock`)
 *      → halt with explicit hint pointing at the owning story.
 *   4. `cleanStagingOrphans()` at Stepper start (best-effort —
 *      failures logged to stderr but do NOT propagate).
 *   5. `--doctor` short-circuit: delegate to `runDoctor` (Story 1.12)
 *      and re-emit the doctor result as `action: "report"`.
 *   6. Read-only flag handling (`--export-state` → Story 3.10 stub;
 *      `--diff-state` → Story 3.8 stub; `--list` → v0.1 candidate
 *      enumeration; `--explain` → Story 3.6 stub; `--dry-run` → builds
 *      dispatch spec but emits `action: "report"`).
 *   7. Dispatch happy path: read state via `loadStateUnlocked`, build
 *      DAG, compute next step, resolve persona, build dispatch spec,
 *      emit `action: "dispatch"`.
 *   8. Outer try/catch translates `StepperError` throws into
 *      `action: "halt"` with `exitCode: err.exitCode` and `message:
 *      err.actionableHint` (AR21 + AR22 + AC-3).
 *
 * **NEVER calls `acquire()`** — lock-free contract per architecture
 * §line 1672.
 */
export async function runNext(opts?: RunNextOptions): Promise<NextResult> {
  const log = opts?.logger ?? defaultLogger();
  const argv = opts?.argv ?? process.argv.slice(2);

  // Step 1: parse argv.
  const parsed = parseNextArgs(argv);
  if (!parsed.ok) {
    return haltFromParseError(parsed.error);
  }
  const args = parsed.value;

  try {
    // Step 2: cross-validate flags (Story 1.7 forward-dep closure).
    enforceMutuallyExclusiveFlags(args);

    // Step 3: forward-deferral guards.
    if (args.upgrade) {
      return haltWithHint(
        1,
        "Run /bmad-next --doctor to verify your install. The --upgrade flow is implemented in Story 6.9 (Epic 6).",
      );
    }
    if (args.watch) {
      return haltWithHint(
        1,
        "Run /bmad-next --doctor instead; --watch is implemented in Story 3.9 (Epic 3).",
      );
    }
    if (args.forceUnlock) {
      return haltWithHint(
        1,
        "Run /bmad-next --doctor first; --force-unlock is implemented in Story 6.x.",
      );
    }

    // Step 4: orphan staging cleanup (best-effort; Story 2.2 carry-over).
    try {
      const cleanup = await cleanStagingOrphans({
        stagingRoot: opts?.stagingRoot,
      });
      if (cleanup.removedCount > 0) {
        log.info(
          `next: cleaned ${cleanup.removedCount} orphan staging dir(s) at start`,
        );
      }
    } catch (err) {
      log.info(
        `next: orphan staging cleanup failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Step 5: --doctor delegation (Story 1.12 reuse).
    if (args.doctor) {
      const doctorResult = await runDoctor({
        projectRoot: opts?.projectRoot,
        statePath: opts?.statePath,
        configPath: opts?.configPath,
        overridesPath: opts?.overridesPath,
      });
      const message = doctorResult.results.map((r) => r.line).join("\n");
      return {
        exitCode: doctorResult.exitCode === 0 ? 0 : doctorResult.exitCode,
        action: {
          action: "report",
          message,
          exitCode: doctorResult.exitCode,
        },
      };
    }

    // Step 6: read-only flag handling (route order:
    // --export-state → --diff-state → --explain → --list → --dry-run
    // → fall-through to dispatch path).

    if (args.exportState) {
      const statePath =
        opts?.statePath ??
        path.join(
          opts?.projectRoot ?? process.cwd(),
          "_bmad-output/.stepper/state.yaml",
        );
      return reportWithMessage(
        `JSON export is implemented in Story 3.10 (Epic 3); current state path: ${statePath}`,
      );
    }

    if (args.diffState) {
      const statePath =
        opts?.statePath ??
        path.join(
          opts?.projectRoot ?? process.cwd(),
          "_bmad-output/.stepper/state.yaml",
        );
      return reportWithMessage(
        `State diff is implemented in Story 3.8 (Epic 3); current state path: ${statePath}`,
      );
    }

    if (args.explain) {
      // For --explain we still want to surface the candidate step name
      // when computable; fall through to step computation but emit a
      // report instead of a dispatch.
      //
      // Story 3.2: when `args.resume === true`, target `state.lastAttempted`
      // via `resolveResumeTarget` instead of `pickNextStep`. This surfaces
      // the resume target in the v0.1 explain stub; Story 3.6 owns the
      // full reasoning trace (with persona path, model, budget, etc.).
      const state = await loadStateUnlocked({ statePath: opts?.statePath });
      const dag = await build({
        skillNames: opts?.skillNames ?? [],
        projectRoot: opts?.projectRoot,
        pluginDir: opts?.pluginDir,
        overridesPath: opts?.overridesPath,
      });
      let nextHint = "(none — DAG empty or filters exclude all candidates)";
      try {
        const node = args.resume
          ? resolveResumeTarget(state, dag).node
          : pickNextStep(state, dag, args);
        nextHint = node.name;
      } catch {
        // Fall through with the empty-candidate hint.
      }
      return reportWithMessage(
        `Reasoning trace is implemented in Story 3.6 (Epic 3); current next step: ${nextHint}`,
      );
    }

    if (args.list) {
      const state = await loadStateUnlocked({ statePath: opts?.statePath });
      const dag = await build({
        skillNames: opts?.skillNames ?? [],
        projectRoot: opts?.projectRoot,
        pluginDir: opts?.pluginDir,
        overridesPath: opts?.overridesPath,
      });
      const lastStepName = state.lastSuccessfulStep?.step;
      const lines: string[] = ["Candidate next steps:"];
      for (const node of dag.nodes.values()) {
        if (node.name === lastStepName) continue;
        // Apply same selection model as pickNextStep:
        //   - fresh project: only entry-points (empty `after[]`).
        //   - post-first-step: nodes whose `after[]` includes lastStepName.
        let satisfied: boolean;
        if (lastStepName === undefined) {
          satisfied = node.after.length === 0;
        } else {
          satisfied = node.after.includes(lastStepName);
        }
        if (!satisfied) continue;
        if (!args.includeOptional && !args.noOptional && node.optional) {
          continue;
        }
        if (args.noOptional && node.optional) continue;
        lines.push(
          `  - ${node.name} (phase: ${node.phase}${node.optional ? ", optional" : ""})`,
        );
      }
      return reportWithMessage(lines.join("\n"));
    }

    // Steps 7-15: dispatch happy path (--dry-run shares this path
    // through dispatch-spec construction, but emits report instead of
    // dispatch).

    const state = await loadStateUnlocked({ statePath: opts?.statePath });
    const dag = await build({
      skillNames: opts?.skillNames ?? [],
      projectRoot: opts?.projectRoot,
      pluginDir: opts?.pluginDir,
      overridesPath: opts?.overridesPath,
    });

    // Story 3.2: --resume branch. When `args.resume === true`, substitute
    // `state.lastAttempted.step` for the standard `pickNextStep(...)`
    // result and capture the resume-context refs + epic+story overrides
    // for the downstream `buildContextRefs` / `buildDispatchSpec` calls.
    // Per epic AC line 754, `--resume + --skip` is rejected as
    // unimplemented in v0.1; Story 5.2 adds `--skip` AND its rejection.
    let nextStep: DagNode;
    let resumeContextRefs: ReadonlyArray<{ path: string; label: string }> = [];
    let resumeEpicOverride: number | undefined;
    let resumeStoryOverride: string | undefined;
    if (args.resume) {
      const resumeResult = resolveResumeTarget(state, dag);
      nextStep = resumeResult.node;
      resumeContextRefs = resumeResult.contextRefs;
      resumeEpicOverride = resumeResult.epic;
      resumeStoryOverride = resumeResult.story;
    } else {
      nextStep = pickNextStep(state, dag, args);
    }

    // Resolve persona + apply --persona override (FR12).
    let personaResolved: string | readonly string[];
    if (args.persona !== undefined && args.persona !== "") {
      personaResolved = args.persona;
    } else {
      personaResolved = await resolvePersona({
        stepName: nextStep.name,
        pluginDir: opts?.pluginDir,
        projectRoot: opts?.projectRoot,
        configPath: opts?.configPath,
        bmadConfigPath: opts?.bmadConfigPath,
      });
    }
    const persona = pickFirstPersona(personaResolved, nextStep.name, log);

    // Story 2.2 carry-over populators (Task 7.6 + Task 11).
    const contextRefs = buildContextRefs(nextStep, dag);
    // Story 3.2: append the resume-context refs (failure-reason
    // transcript + last-attempt artifact path) AFTER the prerequisite-
    // derived refs. Recency bias: the resume-context refs are the
    // most-recent context the sub-agent sees.
    const finalContextRefs = args.resume
      ? [...contextRefs, ...resumeContextRefs]
      : contextRefs;
    const requiredSections = getRequiredSections(nextStep.name);

    // Build dispatch spec. Story 3.2: pass explicit `epic + story`
    // overrides on resume (the canonical resume tuple from
    // `state.lastAttempted` — NOT recomputed from `lastSuccessfulStep`).
    // The default behaviour in `generate-spec.ts:172-177` already prefers
    // `lastAttempted` over `lastSuccessfulStep`; the explicit override
    // makes the intent explicit in the runner-tier code.
    const result = await buildDispatchSpec({
      stepName: nextStep.name,
      state,
      persona,
      stagingRoot: opts?.stagingRoot,
      nowIso: opts?.nowIso,
      phase: dagPhaseToDispatchPhase(nextStep.phase),
      contextRefs: finalContextRefs,
      requiredSections,
      ...(args.resume && resumeEpicOverride !== undefined
        ? { epic: resumeEpicOverride }
        : {}),
      ...(args.resume && resumeStoryOverride !== undefined
        ? { story: resumeStoryOverride }
        : {}),
    });

    // --dry-run: emit report instead of dispatch (the dispatch-spec
    // IS still written so the user can inspect it).
    if (args.dryRun) {
      return reportWithMessage(
        `Dry-run: would dispatch step ${nextStep.name} to agent ${STEP_RUNNER_AGENT} with run-id ${result.runId} at ${result.stagingDir}. Pass without --dry-run to actually dispatch.`,
      );
    }

    // AR9 dispatch action emit (the canonical happy path).
    // Story 3.1: include the planned `lastAttempted` payload on the
    // dispatch line. Layer 1's slash-command markdown captures the field
    // and forwards via `--last-attempted-json '<JSON>'` to
    // `verify-and-advance.ts`, which writes it to `state.yaml` under the
    // held lock (preserves the lock-free contract here in run.ts).
    // The values come from the resolved next-step + dispatch-spec literal:
    //   - step:        nextStep.name (resolved by pickNextStep).
    //   - epic + story: dispatchSpec.epic / .story (already populated by
    //                  buildDispatchSpec from state + filter args).
    //   - attemptedAt: opts.nowIso (test-deterministic) or current ISO.
    const attemptedAt = opts?.nowIso ?? new Date().toISOString();
    const action: DispatchActionV1 = {
      action: "dispatch",
      runId: result.runId,
      agent: STEP_RUNNER_AGENT,
      lastAttempted: {
        step: nextStep.name,
        epic: result.dispatchSpec.epic,
        story: result.dispatchSpec.story,
        attemptedAt,
      },
      exitCode: 0,
    };
    return { exitCode: 0, action };
  } catch (err) {
    return haltFromError(err);
  }
}

// ─── Helper: halt translation per AR21 + AR22 + AC-3 ──────────────────────

function haltFromError(err: unknown): NextResult {
  if (err instanceof StepperError) {
    const code = err.exitCode;
    const exitCode: 0 | 1 | 2 | 3 | 5 =
      code === 1 || code === 2 || code === 3 || code === 5 ? code : 1;
    return {
      exitCode,
      action: {
        action: "halt",
        message: err.actionableHint,
        exitCode: code === 0 ? 1 : code,
      },
    };
  }
  // Non-StepperError throws propagate to the caller's top-level catch
  // (the `import.meta.main` block writes "next: unexpected failure: …"
  // to stderr and exits 1). For testability, we rethrow rather than
  // swallow — Story 1.12 doctor precedent.
  throw err;
}

function haltFromParseError(parseError: ParseError): NextResult {
  return {
    exitCode: 2,
    action: {
      action: "halt",
      message: parseError.hint,
      exitCode: 2,
    },
  };
}

function haltWithHint(exitCode: 1 | 2 | 3 | 5, message: string): NextResult {
  return {
    exitCode,
    action: {
      action: "halt",
      message,
      exitCode,
    },
  };
}

function reportWithMessage(message: string): NextResult {
  return {
    exitCode: 0,
    action: {
      action: "report",
      message,
      exitCode: 0,
    },
  };
}

// ─── import.meta.main entrypoint ──────────────────────────────────────────

if (import.meta.main) {
  // The outer entrypoint per Story 1.12 doctor precedent. `runNext`
  // returns the structured `NextResult`; the entrypoint emits the AR9
  // line via `emitDispatchAction` (defence-in-depth — the function
  // validates against `DispatchActionV1Schema.parse()`) and exits with
  // the result code.
  //
  // The top-level catch handles non-StepperError throws (system errors,
  // unexpected failures). StepperError throws are translated to
  // `action: "halt"` by `runNext`'s own try/catch (Task 8 pattern).
  try {
    const result = await runNext();
    emitDispatchAction(result.action);
    process.exit(result.exitCode);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    error(`next: unexpected failure: ${message}`);
    process.exit(1);
  }
}
