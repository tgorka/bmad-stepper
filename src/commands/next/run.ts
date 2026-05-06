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
 * `--explain`, `--diff-state`, `--export-state`, `--dry-run`, `--watch`
 * each emit `action: "report"` with the human-readable output via the
 * `message` field. Forward-deferred surfaces (`--upgrade` → Story 6.9,
 * `--force-unlock` → Epic 6) emit explicit `action: "halt"` stubs with
 * hints pointing at the owning story; NEVER silently ignored.
 *
 * **AR9 SPECIAL CASES**: Story 3.8 (`--export-state`) and Story 3.9
 * (`--watch`) BYPASS the AR9 single-JSON-line wrapper per FR54 +
 * architecture §line 524 + §line 862. The `--export-state` JSON body
 * goes to stdout DIRECTLY; the `--watch` raw transcript content streams
 * to stdout line-by-line via `process.stdout.write`. The
 * `import.meta.main` block detects each flag and routes around
 * `emitDispatchAction`. Every OTHER flag preserves AR9 strictly.
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
import type { Phase } from "../../dag/types.ts";
import {
  buildDispatchSpec,
  cleanStagingOrphans,
  type Phase as DispatchPhase,
  emitDispatchAction,
} from "../../dispatch/index.ts";
import {
  ConfigError,
  SkipRequiresResumeError,
  StepperError,
} from "../../errors.ts";
import { resolveFailurePolicy } from "../../failure-ux/index.ts";
import { error, info, warn } from "../../io/log.ts";
import {
  type ResolvedPersonaWithTier,
  resolvePersona,
  resolvePersonaWithTier,
} from "../../personas/index.ts";
import { watchMostRecentRunLog } from "../../runs/watch.ts";
import type { DispatchActionV1 } from "../../schemas/dispatch-protocol.ts";
import type { LastAttempted, State } from "../../schemas/state.ts";
import { runArchivalAtStartup } from "../../startup/archival-trigger.ts";
import { diffState } from "../../state/diff.ts";
import { exportState } from "../../state/export.ts";
import { loadStateUnlocked } from "../../state/load.ts";
// Story 6.9 — `--upgrade` short-circuit. Top-tier consumes mid-tier per
// AR41; the upgrade modules are foundational + node:* + zod only.
import { renderUpgradeReport, runUpgradeCheck } from "../../upgrade/index.ts";
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
  /**
   * Story 3.9: forwarded to `watchMostRecentRunLog` (overrides the default
   * `${STEPPER_INTERNAL_ROOT}/runs` path). Tests pass tmpdir-rooted overrides.
   */
  readonly watchRunsRoot?: string;
  /**
   * Story 3.9: forwarded to `watchMostRecentRunLog` (overrides the default
   * 250ms poll interval). Tests typically set 25ms for deterministic timing.
   */
  readonly watchPollMs?: number;
  /**
   * Story 3.9: forwarded to `watchMostRecentRunLog` as the abort signal.
   * Tests drive the watch loop's exit deterministically via this signal
   * (functionally equivalent to a real SIGINT delivery).
   */
  readonly watchSignal?: AbortSignal;
  /**
   * Story 4.8 (`--checkpoint-each <step-type>`): when supplied, the
   * loop runner threads this value from `args.checkpointEach` so that
   * the per-iteration `verify-and-advance.ts` post-step state save can
   * APPEND a `state.checkpoints[]` entry IF the just-completed step's
   * `phase` matches this value. The entry shape is `{ branch, sha,
   * takenAt, stepType }` per AR13 Layer 1; `branch` + `sha` come from
   * `detectSnapshot()` (Story 1.8); `takenAt` is the iso timestamp at
   * append; `stepType` is this value. FIFO-evicted at 50 entries (the
   * `.max(50)` cap on `StateV1Schema.checkpoints[]`).
   *
   * The lock-free `runNext` itself does NOT consume this value (it
   * merely forwards it through to `verify-and-advance.ts` via the
   * dispatch boundary). Production callers of `runNext` directly do
   * NOT supply this field — the `/bmad-next` slash-command does not
   * have a `--checkpoint-each` flag (it is a `/bmad-loop`-only flag).
   * The value is captured here purely so the loop runner's
   * `runNextOverride` test seam can pass it through and so that future
   * Story 6.x integration may forward it across the dispatch boundary.
   */
  readonly checkpointEach?: Phase;
  /**
   * Story 5.1: per-step failure policy override threaded across the
   * dispatch boundary to verify-and-advance.ts (test-injection seam;
   * production reads from config in Story 5.6). Mirrors the Story 4.8
   * `checkpointEach` threading pattern — the lock-free `runNext`
   * composer captures the value but does NOT consume it; the loop
   * runner's `runNextOverride` test seam threads the same value to
   * `verify-and-advance.ts`'s `RunVerifyAndAdvanceOptions.failurePolicyOverride`
   * for end-to-end retry-loop testing.
   *
   * Story 5.3: when `args.autoFix === true` (--auto-fix flag), the
   * resolved failure policy is FORCED to `"route-to-fixer"` overriding
   * any incoming `failurePolicyOverride` value from RunNextOptions OR
   * from per-step config (per architecture line 499). The override is
   * unconditional — the runner reads `result.resolvedFailurePolicy`
   * (computed in runNext) for the threaded value.
   */
  readonly failurePolicyOverride?: import("../../failure-ux/index.ts").FailurePolicy;
  /**
   * Story 5.1: max-retries override threaded across the dispatch boundary
   * to verify-and-advance.ts (test-injection seam; production defaults
   * to 2 per architecture line 494). Mirrors the Story 4.8
   * `checkpointEach` threading pattern.
   */
  readonly maxRetriesOverride?: number;
  /**
   * Story 5.6 — optional parsed config object for per-step policy
   * resolution (FR31 PRIMARY). Production callers receive this from the
   * Story 6.1 file loader (when it lands); tests pass synthetic config
   * objects directly. Until Story 6.1 lands, the resolver is invoked
   * with `undefined` config in production → escalate-default for every
   * step.
   *
   * The shape is a structural subset of `ConfigV1` (only the
   * `failurePolicies` field is consumed by the resolver). The runNext
   * composer threads this directly to RunVerifyAndAdvanceOptions.config
   * (the per-step resolution happens at the dispatch site).
   *
   * Story 6.2 — extended with `overrides?: Overrides` (typed Zod-
   * validated record from `loadConfig()` → `config.overrides`). The
   * runNext composer threads this into `BuildInput.overrides` at every
   * `build({...})` call site so the DAG builder uses the STRICT Tier 2
   * path (no YAML parse, ConfigError on unknown predecessor / successor).
   *
   * Story 6.3 — extended with `models?: Models` (closed-enum record from
   * `loadConfig()` → `config.models`). The runNext composer threads
   * `config.models?.[stepName]` into `buildDispatchSpec({...modelOverride})`
   * so the dispatch-spec.json's `model` field reflects the configured
   * value (default "sonnet" — Story 6.1 SDR I-24 PRIMARY HONOURED).
   */
  readonly config?: {
    failurePolicies?: import("../../schemas/config.ts").FailurePolicies;
    overrides?: import("../../schemas/config.ts").Overrides;
    models?: import("../../schemas/config.ts").Models;
    budgets?: import("../../schemas/config.ts").Budgets;
    /**
     * Story 6.5 — per-step verifier override map. Forwarded into
     * `runVerifyAndAdvance` via `RunVerifyAndAdvanceOptions.config.verifiers`
     * so the verifier registry merges / replaces baseline plugin defaults
     * per the entry's `mode` field. AR17 + AC-2 enforced via the schema
     * layer (no `custom` / `schema` field at the project-config tier).
     */
    verifiers?: import("../../schemas/config.ts").Verifiers;
    /**
     * Story 6.6 — opt-in telemetry config (FR39, FR40, NFR-S3). Forwarded
     * into `runVerifyAndAdvance` via `RunVerifyAndAdvanceOptions.config.telemetry`.
     * When `enabled === true`, the verify-and-advance finally block writes a
     * TelemetryRecord JSONL line (Step 12.25). When `enabled !== true`
     * (default `false` or absent), zero telemetry files are written (AC-3).
     */
    telemetry?: import("../../schemas/config.ts").Telemetry;
    /**
     * Story 6.8 — paths block forwarded into `runArchivalAtStartup`
     * (consumes `paths.runs` + `paths.telemetry`). Production
     * `import.meta.main` threads the full ConfigV1 via `opts.config`;
     * tests with the runNext composer entrypoint may omit, in which
     * case the archival trigger is SKIPPED at runtime per OQ-12.
     */
    paths?: import("../../schemas/config.ts").Paths;
  };
  /**
   * Story 6.1 — test-injection seam for the production `loadConfig()`
   * call wired at the top of `runNext`. Tests pass a synthetic config
   * loader that returns a deterministic `Config` (or throws to exercise
   * the loader-error path). When the seam is supplied, the runner uses
   * its return value for `opts.config` resolution; when omitted, the
   * runner skips the load entirely (preserves test backwards-compat for
   * the 1262-test baseline that did NOT have a config-loader call site).
   *
   * Production code does NOT supply this field — instead, the
   * `import.meta.main` entrypoint at the bottom of this file invokes
   * `loadConfig()` once and threads the result via `opts.config`.
   *
   * The seam returns a structural subset of ConfigV1 (only the fields
   * consumed by `runNext`'s downstream resolvers). Throwing
   * `ConfigError` from the seam exercises the AR21+AR22 surfacing path.
   */
  readonly loadConfigOverride?: () =>
    | Promise<{
        failurePolicies?: import("../../schemas/config.ts").FailurePolicies;
        overrides?: import("../../schemas/config.ts").Overrides;
        models?: import("../../schemas/config.ts").Models;
        budgets?: import("../../schemas/config.ts").Budgets;
        verifiers?: import("../../schemas/config.ts").Verifiers;
        telemetry?: import("../../schemas/config.ts").Telemetry;
      }>
    | {
        failurePolicies?: import("../../schemas/config.ts").FailurePolicies;
        overrides?: import("../../schemas/config.ts").Overrides;
        models?: import("../../schemas/config.ts").Models;
        budgets?: import("../../schemas/config.ts").Budgets;
        verifiers?: import("../../schemas/config.ts").Verifiers;
        telemetry?: import("../../schemas/config.ts").Telemetry;
      };
  /**
   * Story 6.9 — test-injection seam for the `--upgrade` short-circuit at
   * Step 0a. When supplied, the runner forwards this `fetch` to
   * `runUpgradeCheck({ fetch })` so tests stub the network response
   * without touching the real GitHub Releases API. Per OQ-12 this is a
   * SEPARATE seam from `opts.config` (the upgrade flow does NOT consume
   * any config field — the existing `loadConfigOverride` Story 6.1
   * seam is unrelated). Production callers omit this field; the
   * `runUpgradeCheck` defaults to `globalThis.fetch`.
   *
   * The seam mirrors the Story 6.7 `loadConfigOverride` precedent —
   * test-injection only; production code paths use the global fetch.
   */
  readonly upgradeFetchOverride?: typeof globalThis.fetch;
}

/**
 * Structured return value from `runNext`. Tests inspect this directly
 * WITHOUT mutating stdout / process state. The `import.meta.main`
 * block emits the AR9 line via `emitDispatchAction(result.action)` and
 * exits with `result.exitCode`.
 *
 * The exit code 4 (lock contention) is UNREACHABLE in `runNext` since
 * the runner is lock-free — no possible code path can produce it.
 *
 * Story 5.3: `resolvedFailurePolicy` exposes the policy that the runner
 * resolved for this invocation (after applying the --auto-fix override
 * per architecture line 499). The loop runner reads this on the per-
 * iteration result and threads it into the next-iteration's
 * `RunVerifyAndAdvanceOptions.failurePolicyOverride`. The field is
 * absent on halt/report results that did NOT compute a policy (e.g.,
 * --doctor, --upgrade, --list, --explain).
 */
export interface NextResult {
  readonly exitCode: 0 | 1 | 2 | 3 | 5;
  readonly action: DispatchActionV1;
  readonly resolvedFailurePolicy?: import("../../failure-ux/index.ts").FailurePolicy;
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
 *
 * **Story 3.5 (epic AC lines 803-805)**: when neither flag is supplied,
 * the runner falls through to the project-config `personas:` defaults
 * (Story 1.11's 4-tier `resolvePersona` cascade — Tier 1 SKILL.md
 * frontmatter > Tier 2 project config > Tier 3 `DEFAULT_PERSONAS` >
 * Tier 4 `_bmad/<module>/config.yaml` triggers) and the
 * `failurePolicies` defaults (forward-deferred to Story 6.x — the
 * v0.1 config-block at architecture §line 780 is declared but NOT
 * yet consumed at runtime; the per-step failure-policy via
 * `retry`/`skip`/`route-to-fixer`/`escalate` lands in Epic 5 + Story
 * 6.1 config-loader). The `enforceMutuallyExclusiveFlags` function
 * therefore implements ONLY the `--include-optional ⊕ --no-optional`
 * cross-validation; the AC line 805 "no toggle" default is the
 * absence of any branch — neither flag changes runtime behaviour
 * beyond the optional-step inclusion filter at `pickNextStep`.
 *
 * Story 3.5 PRESERVES this throw verbatim; ZERO behavioural change.
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
 * Story 5.2 cross-validation closure: `--skip <step>` REQUIRES `--resume`.
 *
 * Per epics.md AC line 1078-1080 (Story 5.2 BDD block 2): when `--skip`
 * is supplied alone (without `--resume`), Stepper exits with code `2`
 * (configuration error per FR53) and the BYTE-IDENTICAL hint
 * `--skip requires --resume to advance state. Run /bmad-next --skip <step> --resume.`
 *
 * The hint is delivered via `SkipRequiresResumeError` (registry 17 —
 * NEW class added in Story 5.2 per OQ-1 deviation from Story 5.1
 * epic-4-retro Recommendations item 3). The class carries the AC-
 * verbatim `actionableHint`; reusing `ConfigError` with a third
 * `hintOverride` instance was rejected because the AC mandates a
 * verbatim hint distinct from any existing class.
 *
 * Mirrors the Story 1.7 cross-validation gap closure pattern at
 * `enforceMutuallyExclusiveFlags` above (the parser is lenient; the
 * runner enforces).
 */
function enforceSkipRequiresResume(args: NextArgs): void {
  if (args.skip !== undefined && args.resume === false) {
    throw new SkipRequiresResumeError(
      `--skip flag requires --resume (received --skip ${JSON.stringify(args.skip)} without --resume)`,
      JSON.stringify({ skip: args.skip, resume: args.resume }),
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
 * Story 3.4: shared predicate for "is this step's `after[]` preconditions
 * satisfied by the current state?". Used by:
 *   - The explicit `--step` branch in `pickNextStep` (epic AC line 780).
 *   - Story 3.7 (`--list`) future consumer (refactor target).
 *
 * v0.1 conservative direct-match rule: a step's preconditions are met
 * when EVERY name in `node.after[]` matches `state.lastSuccessfulStep?.step`.
 * An entry-point (empty `after[]`) is trivially met. The full
 * transitive-closure model (walking the inverse DAG `edgesIn` from each
 * prerequisite back to the project root) is forward-deferred to Story 3.6
 * (`--explain` reasoning trace) and Story 3.7 (`--list`).
 *
 * **Note**: `state.completedSteps` is NOT declared on `StateV1Schema`
 * (verified via `src/schemas/state.ts:92-119`). Story 1.5 declared
 * `lastSuccessfulStep` + `lastAttempted` + `lastFailureReason` only.
 * The simpler `node.after.every(p => p === lastSuccessfulStep.step)`
 * rule covers the common case where the user just completed step X
 * and wants to skip ahead to step Y (Y has `after: ["X"]`). When a
 * step has multiple prerequisites (e.g., a synthesis step waiting on
 * 2 parallel branches), v0.1 conservatively rejects the precondition
 * unless the single most-recently-completed step is a prerequisite
 * AND the rest were already in the chain (which v0.1 cannot verify
 * without the transitive closure walk).
 *
 * Returns `true` when the preconditions are met, `false` otherwise.
 * Pure / synchronous; no I/O.
 */
function isPreconditionMet(node: DagNode, state: State): boolean {
  if (node.after.length === 0) return true;
  const lastStepName = state.lastSuccessfulStep?.step;
  if (lastStepName === undefined) return false;
  return node.after.every((p) => p === lastStepName);
}

/**
 * Resolve the next step from the DAG given the current state + filter
 * args. v0.1 inline implementation per architecture §A.D7 + Story 2.4
 * Task 7.3 + Story 3.4 Tasks 5-9:
 *
 *   - **Story 3.4 (epic AC line 784)**: when `args.step` is explicit AND
 *     any of `--epic`/`--story`/`--phase` is set with a non-empty value,
 *     emit a single warning to stderr via `log.warn(...)` BEFORE the
 *     explicit-`--step` branch returns. Empty-string flag values do NOT
 *     trigger the warning (treated as "no filter" per Story 1.7).
 *
 *   - If `args.step` is set → resolve to that step name; throw
 *     `ConfigError` if not in the DAG. **Story 3.4 (epic AC line 780)**:
 *     after the lookup succeeds, verify preconditions via
 *     `isPreconditionMet`; throw `ConfigError` with the verbatim hint
 *     `Run /bmad-next --explain to see why <step> is blocked.` when
 *     unmet.
 *   - Else if `state.lastSuccessfulStep` is null/undefined → pick the
 *     first analysis-phase entry-point with empty `after[]` (per
 *     architecture line 419 — phase-ordered tiebreaker).
 *   - Else → pick the first node in the DAG whose `after` list is
 *     fully satisfied by `state.lastSuccessfulStep`. Tiebreaker: phase
 *     order then name lexicographic (architecture line 469).
 *
 *   - **Story 3.4 (epic AC line 783)**: apply `args.phase` →
 *     `args.epic` → `args.story` filters in that order. Phase is a true
 *     DAG-node attribute (`node.phase`); epic/story are v0.1 runner-tier
 *     projections from `state.lastAttempted ?? state.lastSuccessfulStep`
 *     (DAG nodes do NOT carry epic/story attribution at the seed level
 *     per `src/dag/types.ts:60-68`; Story 6.x telemetry-driven enhancement
 *     may extend the DAG node shape with `epic?: number` + `story?: string`
 *     attribution, swapping the projection for a true node-attribute
 *     check with no test-shape change).
 *   - Apply `args.includeOptional` / `args.noOptional` to filter
 *     `node.optional === true` candidates.
 *   - If no candidate after filtering → throw `ConfigError` with
 *     `hintOverride: "Run /bmad-next --list to see candidate steps;
 *     the current filter excludes all candidates."`.
 *
 * Forward-coupling:
 *   - **Story 3.5** (`--persona`/`--include-optional`/`--no-optional`):
 *     reuses the 4-arg signature; the next round of flag wiring.
 *   - **Story 3.6** (`--explain` reasoning trace): owns the unmet-
 *     prerequisite enumeration. Story 3.4 ships a SHORT pointer hint;
 *     Story 3.6 enriches with the full diagnostic.
 *   - **Story 3.7** (`--list` candidate enumeration): consumes
 *     `isPreconditionMet` as the shared predicate; may refactor to
 *     a shared helper module.
 *   - **Story 6.x** (per-step config): extends DAG nodes with epic/story
 *     attribution. Story 3.4's runner-tier projection becomes a true
 *     node-attribute filter with no test-shape change.
 */
function pickNextStep(
  state: State,
  dag: DagAdjacency,
  args: NextArgs,
  log: LoggerFns,
): DagNode {
  // Story 3.4 (epic AC line 784): warn on --step + scope flag combo.
  // The warning fires ONCE at the very top of pickNextStep (before the
  // explicit-`--step` branch returns) when --step is explicit AND any
  // of (--epic, --story, --phase) is set with a non-empty value. Per
  // FR54 / src/io/log.ts:20-21, the warning writes to stderr; AR9's
  // stdout reservation for the dispatch JSON line is preserved.
  const stepIsExplicit = args.step !== undefined && args.step !== "";
  const epicIsSet = args.epic !== undefined && args.epic !== "";
  const storyIsSet = args.story !== undefined && args.story !== "";
  const phaseIsSet = args.phase !== undefined;
  if (stepIsExplicit && (epicIsSet || storyIsSet || phaseIsSet)) {
    log.warn(
      "next: --step is explicit; --epic/--story/--phase scope flags are ignored.",
    );
  }

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
    // Story 3.4 (epic AC line 780): verify preconditions BEFORE returning.
    // The named step is dispatched only if its preconditions are met;
    // otherwise throw `ConfigError` with the verbatim AC-line-780 hint.
    if (!isPreconditionMet(node, state)) {
      throw new ConfigError(
        `Step ${args.step} is blocked by unmet preconditions`,
        JSON.stringify({
          step: args.step,
          after: node.after,
          lastSuccessfulStep: state.lastSuccessfulStep?.step ?? null,
        }),
        `Run /bmad-next --explain to see why ${args.step} is blocked.`,
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

  // Story 3.4 (epic AC line 783): --epic / --story filter wiring.
  //
  // v0.1 conservative semantics: DAG nodes do NOT carry epic/story
  // attribution at the seed level (per `src/dag/types.ts:60-68`; story
  // attribution is project-level and lives in
  // `_bmad-output/implementation-artifacts/<story-key>.md` frontmatter —
  // Story 6.x telemetry enhancement). The runner-tier projection sources
  // epic/story from `state.lastAttempted ?? state.lastSuccessfulStep`
  // (the same projection convention `generate-spec.ts:172-177` uses) and
  // rejects ALL candidates whose projected attribution does NOT match.
  //
  // When projection mismatches, `filtered` is set to `[]`; the existing
  // throw at lines below fires with the existing hint
  // `Run /bmad-next --list to see candidate steps; the current filter
  // excludes all candidates.` (no new error class; no new hint string).
  //
  // Empty-string flag values are treated as "no filter" per Story 1.7
  // line 70 forward-dep precedent.
  //
  // Story 6.x telemetry enhancement may extend DAG nodes with
  // `epic?: number` + `story?: string` attribution; the filter
  // expression then swaps to `n.epic === Number(args.epic)` with no
  // test-shape change.
  if (args.epic !== undefined && args.epic !== "") {
    const projectedEpic =
      state.lastAttempted?.epic ?? state.lastSuccessfulStep?.epic ?? 0;
    if (projectedEpic !== Number(args.epic)) {
      filtered = [];
    }
  }
  if (args.story !== undefined && args.story !== "") {
    const projectedStory =
      state.lastAttempted?.story ?? state.lastSuccessfulStep?.story ?? "0.0";
    if (projectedStory !== args.story) {
      filtered = [];
    }
  }

  // Apply optional inclusion/exclusion.
  //
  // **Story 3.5 (epic AC lines 797-802)**: the 3-mode branch:
  //   - `--no-optional` → exclude `node.optional === true` candidates
  //     (epic AC lines 797-799).
  //   - `--include-optional` → include optional candidates with normal
  //     priority — the same phase-order + name-lexicographic tiebreaker
  //     applies (epic AC lines 800-802).
  //   - default (neither flag) → exclude optional candidates (Story 2.4
  //     v0.1 conservative default; the user explicitly opts in via
  //     `--include-optional` when they want the broader candidate set).
  //
  // **Default semantics divergence note**: the project-config prose at
  // `.bmad-stepper/config.yaml execution.optionalSteps: include` (line 14)
  // declares an "include by default" intent, but the runner does NOT
  // consume the project config at runtime in v0.1 (Story 6.1 forward-dep).
  // Runner-tier default is EXCLUDE — keeps the deterministic happy-path
  // narrow. Story 6.x reconciles when the full config-loader lands.
  //
  // **Note** (Story 3.5 AC line 805): the project-config `failurePolicies`
  // defaults are forward-deferred to Story 6.x (the top-level config block
  // at architecture §line 780 is declared but NOT yet consumed at runtime).
  // v0.1 ships the optional-toggle semantics; the per-step failure-policy
  // block (`retry` / `skip` / `route-to-fixer` / `escalate`) is Epic 5 +
  // Story 6.1 scope.
  //
  // **Note** (Story 3.5): cross-validation between `--include-optional`
  // and `--no-optional` happens BEFORE this branch in `runNext`'s Step 2
  // via `enforceMutuallyExclusiveFlags(args)`; both-true is impossible
  // here (the function would have thrown ConfigError already).
  //
  // **Note** (Story 3.5 + Story 3.4 carry-over): the explicit `--step`
  // branch above returns BEFORE this filter runs. So `--step <optional-step>`
  // dispatches the explicit step EVEN with `--no-optional` — the user's
  // explicit `--step` intent supersedes the toggle. This is intentional
  // per Story 3.5 §v0.1 Design Decisions.
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

// ─── Story 3.6: --explain reasoning-trace helpers ─────────────────────────
//
// Story 3.6 replaces the Story 2.4 placeholder explain short-circuit with a
// structured 5-component multi-line "report" message: target step name, the
// chain of completed predecessors, the unmet preconditions for alternative
// candidates (sorted by closeness-to-ready), the resolved persona (with tier
// label), and a one-sentence reasoning summary in the format from PRD
// Journey 1.
//
// AR9 invariant preserved: the `report` action's `message` is a `\n`-joined
// multi-line string; the AR9 JSON line shape stays single-line.
// Read-only / lock-free posture preserved: NO state writes, NO lock acquisition.
//
// v0.1 design decisions inlined per Story 3.6 §v0.1 Design Decisions:
//   1. Predecessor chain v0.1 = [state.lastSuccessfulStep?.step] (single
//      element). Story 6.x replaces with full transitive walk via
//      `dag.edgesIn` when `state.completedSteps[]` lands on the schema.
//   2. Alternatives capped at MAX_ALTERNATIVES = 5; truncation tail emits
//      "(... <N> more candidates; run /bmad-next --list to see all)".
//   3. Alternatives sorted by `count` ASCENDING → phase-order →
//      name-lexicographic ("closest to ready" semantic).
//   4. `resolvePersonaWithTier` is a SIBLING helper colocated with
//      `resolvePersona`; the existing dispatch path stays unchanged.
//   5. Tier 0 = "--persona override"; bypasses the 4-tier resolution per
//      Story 3.5's design decision.
//   6. Reasoning sentence v0.1 = three-slot semicolon-separated narrative
//      ("Reasoning: <slot-1>; <slot-2>; <slot-3>."). Story 6.x telemetry
//      adds the timestamp slot + artifact-existence slot.
//   7. All-done detection v0.1 = `lastSuccessfulStep` is `retro`-phase +
//      zero candidates with met preconditions. Story 6.x replaces with
//      `dag.nodes.size === state.completedSteps.length`.
//   8. Persona-resolution failure within explain → graceful message
//      surfaces the AC-2 hint inside the explain narrative; the explain
//      branch returns `report` with `exitCode: 0` (NOT halt). The
//      diagnostic flag should always emit useful information.
//   9. Filter-exhaustion within explain → graceful surface of alternatives.

/**
 * Maximum number of alternative candidates rendered in the explain output
 * before truncation. Bounded explain output for 100 epics × 1000 stories
 * projects (NFR-Sc1 — Story 3.7's `--list` is the unbounded enumeration
 * surface). The user can always run `--list` for the full set.
 */
const MAX_ALTERNATIVES = 5;

/**
 * Per-alternative candidate shape. `count` is the cardinality of `unmet`
 * (kept as a separate field for the closeness-to-ready sort).
 */
interface AlternativeCandidate {
  readonly node: DagNode;
  readonly unmet: readonly string[];
  readonly count: number;
}

/**
 * v0.1 conservative predecessor-chain helper. Since `state.completedSteps[]`
 * is NOT in `StateV1Schema` (per `src/schemas/state.ts:92-119`), the
 * predecessor chain in v0.1 is a single-element list of the most-recently-
 * completed step. The full transitive walk via `dag.edgesIn` is forward-
 * deferred to Story 6.x telemetry-driven enhancement.
 */
function buildPredecessorChain(state: State): string[] {
  const last = state.lastSuccessfulStep?.step;
  return last !== undefined ? [last] : [];
}

/**
 * Compute the per-prerequisite unmet list for an alternative candidate.
 * Mirrors `isPreconditionMet`'s per-prerequisite check but enumerates
 * the unmet names rather than returning a boolean. v0.1 conservative
 * rule: a prerequisite `p` is met when `p === state.lastSuccessfulStep?.step`.
 */
function unmetPrereqsForCandidate(
  node: DagNode,
  state: State,
): readonly string[] {
  const lastStepName = state.lastSuccessfulStep?.step;
  const unmet: string[] = [];
  for (const p of node.after) {
    if (lastStepName === undefined || p !== lastStepName) {
      unmet.push(p);
    }
  }
  return unmet;
}

/**
 * Compute the alternative-candidate list per AC line 817.
 *
 * Iterates EVERY non-target DAG node; for each candidate computes the
 * unmet-preconditions list; sorts by count ASCENDING (fewest unmet first
 * → "closest to ready"), then by phase-order, then by name lexicographic.
 *
 * Optional candidates respect the `--include-optional` / `--no-optional`
 * toggles per Story 3.5's filter logic — the alternatives list mirrors
 * `pickNextStep`'s candidate set under the same toggles.
 *
 * **Note**: the alternatives set is NOT scope-filtered (`--epic`/`--story`/
 * `--phase`); v0.1 design decision per Story 3.6 §What this story DOES NOT
 * do — alternatives use the unfiltered set so the user can see "what else
 * could have been picked".
 *
 * Capped at `MAX_ALTERNATIVES = 5`; truncation tail emits "(... <N> more
 * candidates; run /bmad-next --list to see all)".
 */
function computeAlternatives(
  state: State,
  dag: DagAdjacency,
  args: NextArgs,
  targetName: string | null,
): readonly AlternativeCandidate[] {
  const lastStepName = state.lastSuccessfulStep?.step;
  const candidates: AlternativeCandidate[] = [];
  for (const node of dag.nodes.values()) {
    // Skip the target step itself (it's the dispatch focus, not an alternative).
    if (targetName !== null && node.name === targetName) continue;
    // Skip the last successful step itself (cannot re-pick).
    if (node.name === lastStepName) continue;
    // Story 3.5: respect --no-optional / --include-optional toggle. Default
    // (neither flag) excludes optional candidates per Story 3.5's runner-tier
    // default-EXCLUDE design decision.
    if (args.noOptional && node.optional) continue;
    if (!args.includeOptional && !args.noOptional && node.optional) continue;
    const unmet = unmetPrereqsForCandidate(node, state);
    candidates.push({
      node,
      unmet,
      count: unmet.length,
    });
  }
  // Sort: count ASC → phase-order → name lexicographic.
  candidates.sort((a, b) => {
    if (a.count !== b.count) return a.count - b.count;
    const pa = PHASE_ORDER.get(a.node.phase) ?? 999;
    const pb = PHASE_ORDER.get(b.node.phase) ?? 999;
    if (pa !== pb) return pa - pb;
    return a.node.name.localeCompare(b.node.name);
  });
  return candidates;
}

/**
 * Format the alternative-candidate list as the per-line explain output.
 *
 * Output format:
 *   - count >= 1: `<step-name> — needs: <comma-separated-unmet> (count: <N>)`
 *   - count == 0: `<step-name> — preconditions met`
 *   - empty list: `Alternative candidates: (none)`
 *   - truncated:  appends `(... <N> more candidates; run /bmad-next --list to see all)`
 */
function formatAlternativesLines(
  candidates: readonly AlternativeCandidate[],
): string[] {
  if (candidates.length === 0) {
    return ["Alternative candidates: (none)"];
  }
  const lines: string[] = ["Alternative candidates:"];
  const visible = candidates.slice(0, MAX_ALTERNATIVES);
  for (const c of visible) {
    if (c.count === 0) {
      lines.push(`  - ${c.node.name} — preconditions met`);
    } else {
      lines.push(
        `  - ${c.node.name} — needs: ${c.unmet.join(", ")} (count: ${c.count})`,
      );
    }
  }
  if (candidates.length > MAX_ALTERNATIVES) {
    const remaining = candidates.length - MAX_ALTERNATIVES;
    lines.push(
      `  (... ${remaining} more candidates; run /bmad-next --list to see all)`,
    );
  }
  return lines;
}

/**
 * Story 3.7: format a single candidate line for the `--list` enumeration
 * per epic AC line 833.
 *
 * Output format:
 *   `<step-name> — <phase> — preconditions: [<met>/<unmet>] — optional: <yes/no>`
 *
 * Components:
 *   1. `<step-name>` — `node.name` verbatim.
 *   2. `<phase>` — `node.phase` verbatim (analysis|planning|solutioning|
 *      implementation|retro).
 *   3. `preconditions: [<met>/<unmet>]` — count-pair summary; `<met>` is
 *      the count of `node.after[]` entries satisfied per the v0.1
 *      conservative `isPreconditionMet`-style per-prerequisite check
 *      (`p === state.lastSuccessfulStep?.step`); `<unmet>` is the
 *      complement (`node.after.length - <met>`).
 *   4. `optional: <yes/no>` — literal `yes` or `no` based on
 *      `node.optional`. Always renders both states (in contrast to the
 *      Story 2.4 placeholder which only suffixed `, optional` when
 *      true).
 *
 * Pure / synchronous; no I/O.
 *
 * Forward-coupling:
 *   - Story 6.x's `state.completedSteps[]` schema extension enables a
 *     richer set-membership check (`completed.has(p)`); the line format
 *     stays the same. Forward-compatible.
 *
 * The em-dash separator (` — ` U+2014) is shared with Story 3.6's
 * `formatAlternativesLines` for visual consistency.
 */
function formatCandidateLine(node: DagNode, state: State): string {
  const lastStepName = state.lastSuccessfulStep?.step;
  let met = 0;
  for (const p of node.after) {
    if (p === lastStepName) met += 1;
  }
  const unmet = node.after.length - met;
  const optional = node.optional ? "yes" : "no";
  return `${node.name} — ${node.phase} — preconditions: [${met}/${unmet}] — optional: ${optional}`;
}

/**
 * v0.1 conservative all-done detector. Since `state.completedSteps[]` is
 * NOT in `StateV1Schema`, the proxy v0.1 detector is:
 *
 *   - If `state.lastSuccessfulStep === undefined`, return `false` (fresh
 *     project — never all-done).
 *   - If `lastSuccessfulStep.phase` is `retro` (the highest-phase-order
 *     terminal phase) AND no candidate (computed under
 *     `args.includeOptional` semantics — i.e., as if `--include-optional`
 *     were set) has its `after[]` met by `lastSuccessfulStep`, return `true`.
 *   - Otherwise, return `false`.
 *
 * Story 6.x replaces with `dag.nodes.size === state.completedSteps.length`
 * when the schema extension lands.
 */
function isProjectAllDone(state: State, dag: DagAdjacency): boolean {
  const last = state.lastSuccessfulStep;
  if (last === undefined || last === null) return false;
  // Look up the lastSuccessfulStep node in the DAG to check its phase.
  const lastNode = dag.nodes.get(last.step);
  if (lastNode === undefined) return false;
  if (lastNode.phase !== "retro") return false;
  // Compute the candidate set IGNORING --no-optional (i.e., as if
  // --include-optional were set). Any node whose `after[]` includes the
  // last step is a candidate; any candidate at all defeats the all-done
  // detector.
  for (const node of dag.nodes.values()) {
    if (node.name === last.step) continue;
    if (node.after.includes(last.step)) {
      return false;
    }
  }
  return true;
}

/**
 * Format the resolved-persona explain line per AC line 817.
 *
 *   - Tier 0 case: `Resolved persona: <name> (Tier 0: --persona override; bypassed 4-tier resolution)`
 *   - Single-persona Tier 1-4: `Resolved persona: <name> (Tier <N>: <tierLabel>)`
 *   - Multi-persona case: `Resolved persona: <first> (multi-persona Tier <N>; sequential dispatch deferred to Stories 4.1 + 5.*)`
 *   - Resolution-failure (AC-2 throw caught by surrounding try/catch):
 *     `Resolved persona: (unresolvable — see hint: <ac2NoPersonaHint>)`
 */
function formatPersonaLine(
  personaInfo: ResolvedPersonaWithTier | null,
  personaErrorHint: string | null,
): string {
  if (personaInfo === null) {
    if (personaErrorHint !== null) {
      return `Resolved persona: (unresolvable — see hint: ${personaErrorHint})`;
    }
    return "Resolved persona: (unresolvable)";
  }
  if (personaInfo.tier === 0) {
    return `Resolved persona: ${String(personaInfo.persona)} (Tier 0: ${personaInfo.tierLabel}; bypassed 4-tier resolution)`;
  }
  if (Array.isArray(personaInfo.persona)) {
    const arr = personaInfo.persona as readonly string[];
    const first = arr.length > 0 ? arr[0] : "(empty)";
    return `Resolved persona: ${first} (multi-persona Tier ${personaInfo.tier}; sequential dispatch deferred to Stories 4.1 + 5.*)`;
  }
  return `Resolved persona: ${String(personaInfo.persona)} (Tier ${personaInfo.tier}: ${personaInfo.tierLabel})`;
}

/**
 * Format the one-sentence PRD-Journey-1 reasoning summary per AC line 817.
 *
 * Three-slot semicolon-separated narrative:
 *   1. Predecessor reference: "<last-successful-step> completed" OR
 *      "fresh project (no prior steps)".
 *   2. Selection reason: "explicit --step override (<step>)" /
 *      "explicit --resume target (<step>)" /
 *      "first analysis-phase entry-point on fresh project" /
 *      "next after <last-successful-step>" /
 *      "no target step matches the current filters".
 *   3. Persona-naming slot: "persona resolved to <name> (Tier <N>: <label>)"
 *      OR "persona unresolvable" when the AC-2 throw fires.
 *
 * Sentence template: `Reasoning: <slot-1>; <slot-2>; <slot-3>.`
 *
 * v0.1 → Story 6.x evolution: the timestamp slot ("completed on 2026-04-20")
 * and the artifact-existence slot ("no <artifact> exists yet") are NOT in
 * v0.1 (Story 6.x telemetry adds the run-log read).
 */
function formatReasoningSummary(input: {
  targetNode: DagNode | null;
  state: State;
  personaInfo: ResolvedPersonaWithTier | null;
  args: NextArgs;
}): string {
  const { targetNode, state, personaInfo, args } = input;
  const last = state.lastSuccessfulStep?.step;

  // Slot 1: predecessor reference.
  const slot1 =
    last !== undefined ? `${last} completed` : "fresh project (no prior steps)";

  // Slot 2: selection reason.
  let slot2: string;
  if (args.step !== undefined && args.step !== "") {
    slot2 = `explicit --step override (${args.step})`;
  } else if (args.resume) {
    const resumeStep = state.lastAttempted?.step ?? "(none)";
    slot2 = `explicit --resume target (${resumeStep})`;
  } else if (targetNode === null) {
    slot2 = "no target step matches the current filters";
  } else if (last === undefined) {
    slot2 = "first analysis-phase entry-point on fresh project";
  } else {
    slot2 = `next after ${last}`;
  }

  // Slot 3: persona-naming slot.
  let slot3: string;
  if (personaInfo === null) {
    slot3 = "persona unresolvable";
  } else if (personaInfo.tier === 0) {
    slot3 = `persona resolved to ${String(personaInfo.persona)} (Tier 0: --persona override)`;
  } else if (Array.isArray(personaInfo.persona)) {
    const arr = personaInfo.persona as readonly string[];
    const first = arr.length > 0 ? arr[0] : "(empty)";
    slot3 = `persona resolved to ${first} (multi-persona Tier ${personaInfo.tier}: ${personaInfo.tierLabel})`;
  } else {
    slot3 = `persona resolved to ${String(personaInfo.persona)} (Tier ${personaInfo.tier}: ${personaInfo.tierLabel})`;
  }

  return `Reasoning: ${slot1}; ${slot2}; ${slot3}.`;
}

/**
 * Compose the full multi-line explain message per AC line 817 — the
 * 5-component narrative:
 *   1. Next step name (or graceful surface when pickNextStep throws)
 *   2. Chain of completed predecessors
 *   3. Alternative candidates (sorted by closeness-to-ready)
 *   4. Resolved persona (with tier label)
 *   5. One-sentence reasoning summary in PRD Journey 1 format
 *
 * The output is a `\n`-joined multi-line string; the AR9 JSON-line `message`
 * field carries it. Callers `grep` it via `jq -r '.message'` or by reading
 * the on-disk run-log.
 */
function formatExplainMessage(input: {
  targetNode: DagNode | null;
  pickError: string | null;
  state: State;
  alternatives: readonly AlternativeCandidate[];
  personaInfo: ResolvedPersonaWithTier | null;
  personaErrorHint: string | null;
  args: NextArgs;
}): string {
  const {
    targetNode,
    pickError,
    state,
    alternatives,
    personaInfo,
    personaErrorHint,
    args,
  } = input;

  const lines: string[] = [];

  // Component 1: target step name.
  if (targetNode !== null) {
    lines.push(`Next step: ${targetNode.name}`);
  } else {
    lines.push(
      `Next step: (no target step matches; current filter excludes all candidates)${pickError !== null ? ` — ${pickError}` : ""}`,
    );
  }

  // Component 2: chain of completed predecessors.
  const chain = buildPredecessorChain(state);
  if (chain.length === 0) {
    lines.push("Chain of completed predecessors: (none — fresh project)");
  } else {
    lines.push(`Chain of completed predecessors: ${chain.join(", ")}`);
  }

  // Component 3: alternative candidates.
  for (const altLine of formatAlternativesLines(alternatives)) {
    lines.push(altLine);
  }

  // Component 4: resolved persona with tier label.
  lines.push(formatPersonaLine(personaInfo, personaErrorHint));

  // Component 5: one-sentence reasoning summary.
  lines.push(
    formatReasoningSummary({
      targetNode,
      state,
      personaInfo,
      args,
    }),
  );

  return lines.join("\n");
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
 *   3. Forward-deferral guards (`--upgrade`, `--force-unlock`) → halt
 *      with explicit hint pointing at the owning story.
 *   4. `cleanStagingOrphans()` at Stepper start (best-effort —
 *      failures logged to stderr but do NOT propagate).
 *   5. `--doctor` short-circuit: delegate to `runDoctor` (Story 1.12)
 *      and re-emit the doctor result as `action: "report"`.
 *   5b. `--watch` short-circuit (Story 3.9): delegate to
 *      `watchMostRecentRunLog` for the live tail; raw transcript
 *      content streams to stdout DIRECTLY (AR9 SPECIAL CASE per
 *      FR42 + FR54).
 *   6. Read-only flag handling (`--export-state` → Story 3.8 schema-
 *      versioned export; `--diff-state` → Story 3.8 divergence report;
 *      `--list` → v0.1 candidate enumeration; `--explain` → Story 3.6
 *      reasoning trace; `--dry-run` → Story 3.3 dispatch-spec preview
 *      purely in-memory; emits `action: "report"` with byte-zero
 *      filesystem mutation).
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
    // Story 5.2: --skip <step> requires --resume per AC line 1078-1080.
    // Throws SkipRequiresResumeError (exitCode 2) with the AC-verbatim
    // actionable hint when --skip is supplied alone.
    enforceSkipRequiresResume(args);

    // Story 6.1 — config-loader test seam: when `opts.config` is not
    // supplied AND a `loadConfigOverride` is provided (test path), invoke
    // it to obtain a synthetic Config. Production callers receive
    // opts.config from the `import.meta.main` block (which calls
    // `loadConfig()` once and passes the result via opts.config). When
    // neither is supplied, opts.config stays undefined → resolver
    // fallback to escalate-default for every step (preserves the
    // 1262-baseline behaviour).
    let effectiveConfig:
      | {
          failurePolicies?: import("../../schemas/config.ts").FailurePolicies;
          overrides?: import("../../schemas/config.ts").Overrides;
        }
      | undefined = opts?.config;
    if (
      effectiveConfig === undefined &&
      opts?.loadConfigOverride !== undefined
    ) {
      effectiveConfig = await opts.loadConfigOverride();
    }

    // Step 3: forward-deferral guards. Story 3.9 removes the `--watch`
    // entry from this block — the streaming-mode short-circuit is now
    // handled in a new position between `--doctor` (Step 5) and
    // `--export-state` (Step 6 first branch).
    //
    // Step 0a (Story 6.9): --upgrade short-circuit. Per AC-1: invokes
    // the GitHub releases endpoint via the upgrade module (NFR-S1
    // EXCEPTION — the only main-thread network I/O permitted, isolated
    // to src/upgrade/), reads currentVersion from
    // .claude-plugin/plugin.json, compares; emits the markdown report
    // on stdout via the AR9 carve-out (third documented carve-out
    // alongside Story 3.8 --export-state + Story 3.9 --watch per OQ-5).
    // Per AC-1 + NFR-S2: never writes to ~/.claude/plugins/ from this
    // code path (enforced by src/integration/upgrade-no-plugin-write
    // .test.ts). On API failure (offline, rate limit, timeout,
    // malformed response): exits 1 with the AC-2 verbatim hint.
    if (args.upgrade) {
      try {
        const result = await runUpgradeCheck(
          opts?.upgradeFetchOverride !== undefined
            ? { fetch: opts.upgradeFetchOverride }
            : {},
        );
        const report = renderUpgradeReport(result);
        return reportWithMessage(report);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        error(`upgrade: ${msg}`);
        return haltWithHint(
          1,
          "Could not reach GitHub Releases. Check your network or try again later.",
        );
      }
    }
    if (args.forceUnlock) {
      return haltWithHint(
        1,
        "Run /bmad-next --doctor first; --force-unlock is implemented in Story 6.x.",
      );
    }

    // Step 4: orphan staging cleanup (best-effort; Story 2.2 carry-over).
    //
    // Story 3.3 (AC line 768 strictness): skip on `--dry-run`. Strictly,
    // `cleanStagingOrphans` is a maintenance write (deletion of orphan
    // staging dirs older than 24h per Story 2.2's housekeeping contract)
    // — not a dispatch write. AC line 766 targets dispatch writes
    // (`staging/<run-id>/`, `state.yaml.tmp`, lock acquisition); AC line
    // 768 says "no filesystem writes occur during dry-run". The integration
    // test at `src/integration/dry-run-no-writes.test.ts` snapshots the
    // tmpdir before + after `--dry-run` and asserts byte-identical
    // inventory. On a fixture with stale orphan staging dirs, the cleanup
    // would remove them and the snapshot would diverge. Gating the
    // cleanup on `!args.dryRun` keeps the integration test deterministic
    // and respects the AC-line-768 wording. On a clean fixture the gate
    // is a no-op.
    if (!args.dryRun) {
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
    }

    // Step 4b (Story 6.8): auto-archival of old runs + telemetry. Best-
    // effort + non-blocking + dry-run gate (mirrors staging-cleanup gate
    // per OQ-10). Fire-and-forget per AC-4 — the user's command does NOT
    // block on the archival promise. Per OQ-12, `opts.config.paths` and
    // `opts.config.telemetry` may be undefined when the runner is
    // invoked without a loaded config (test seams); in that case the
    // archival trigger is SKIPPED.
    if (
      !args.dryRun &&
      opts?.config?.paths !== undefined &&
      opts.config.telemetry !== undefined
    ) {
      const archivalConfig = {
        paths: opts.config.paths,
        telemetry: opts.config.telemetry,
      };
      void runArchivalAtStartup({ config: archivalConfig }).catch((err) => {
        log.info(
          `archival: trigger failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
        );
      });
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

    // Step 5b: Story 3.9 --watch live-tail short-circuit. Sits between
    // --doctor (above) and --export-state (below). Replaces the Story 2.4
    // forward-deferral guard previously in Step 3.
    //
    // SPECIAL CASE per FR42 + FR54 + architecture §line 524 + §line 862:
    // BYPASS the AR9 wrapper; raw transcript content streams to stdout
    // DIRECTLY. The runner returns a structural `report` action for
    // testability; the `import.meta.main` block detects the `--watch`
    // flag in argv and SKIPS `emitDispatchAction`. The watcher itself
    // emits raw lines via `process.stdout.write` from inside its loop.
    //
    // Mirrors Story 3.8's `--export-state` carve-out — the SECOND
    // documented exception to AR9's single-JSON-line invariant. Every
    // OTHER flag preserves AR9 strictly.
    //
    // Lock-free per AR8: ZERO interaction with `src/lock/`; the watcher
    // does NOT read state.yaml; ZERO state interaction.
    if (args.watch) {
      const watchResult = await watchMostRecentRunLog({
        ...(opts?.watchRunsRoot !== undefined
          ? { runsRoot: opts.watchRunsRoot }
          : {}),
        ...(opts?.watchPollMs !== undefined
          ? { pollMs: opts.watchPollMs }
          : {}),
        ...(opts?.watchSignal !== undefined
          ? { signal: opts.watchSignal }
          : {}),
      });
      const message =
        watchResult.status === "no-runs"
          ? "no runs to watch (fresh project)"
          : `watch session ended (${watchResult.filePath})`;
      return reportWithMessage(message);
    }

    // Step 6: read-only flag handling (route order:
    // --doctor → --watch → --export-state → --diff-state → --explain
    // → --list → --dry-run → fall-through to dispatch path).

    if (args.exportState) {
      // Story 3.8 (epic AC lines 848-852): replace the Story 2.4 placeholder
      // with the schema-versioned 7-field JSON export per FR4 + FR54.
      //
      // Build the DAG so `currentPhase` can be resolved via the `dagNodePhase`
      // callback (graceful: `null` when the lookup misses or `lastSuccessfulStep`
      // is null). The DAG is cheap (Story 1.10 minimum-viable seed-only graph
      // when no skill names provided); lock-free per AR8.
      //
      // SPECIAL CASE per FR54 + architecture §line 524 + §line 862: the
      // `--export-state` JSON body goes to stdout DIRECTLY (NOT wrapped in the
      // AR9 line). The `import.meta.main` block at the bottom of this file
      // detects `args.exportState === true` and emits `result.action.message`
      // directly via `process.stdout.write`. The `runNext` function STILL
      // returns `action: "report"` for testability — tests inspect
      // `result.action.message` and `JSON.parse` it against `StateExportV1Schema`.
      const dag = await build({
        skillNames: opts?.skillNames ?? [],
        ...(opts?.projectRoot !== undefined
          ? { projectRoot: opts.projectRoot }
          : {}),
        ...(opts?.pluginDir !== undefined ? { pluginDir: opts.pluginDir } : {}),
        ...(opts?.overridesPath !== undefined
          ? { overridesPath: opts.overridesPath }
          : {}),
        ...(effectiveConfig?.overrides !== undefined
          ? { overrides: effectiveConfig.overrides }
          : {}),
      });
      const exported = await exportState({
        ...(opts?.statePath !== undefined ? { statePath: opts.statePath } : {}),
        dagNodePhase: (name) => dag.nodes.get(name)?.phase ?? null,
      });
      // Compact single-line JSON body — the AC-line-852 `jq '.currentPhase'`
      // workflow expects a parseable JSON line on stdout.
      return reportWithMessage(JSON.stringify(exported));
    }

    if (args.diffState) {
      // Story 3.8 (epic AC line 847): replace the Story 2.4 placeholder with
      // the cache-vs-files-of-truth divergence report per FR3 + FR52.
      //
      // The diffState helper composes loadStateUnlocked + recomputeStateUnlocked
      // + computeDivergences + formatHumanReadable. Multi-line message inside
      // the AR9 `report` action's `message` field. Mirrors Story 3.7 --list +
      // Story 3.6 --explain.
      //
      // Lock-free per AR8: ZERO interaction with `src/lock/`; both helpers use
      // the unlocked variants. The AR41 boundary check at run.test.ts:606-638
      // continues to pass.
      const report = await diffState({
        ...(opts?.statePath !== undefined ? { statePath: opts.statePath } : {}),
        ...(opts?.projectRoot !== undefined
          ? { projectRoot: opts.projectRoot }
          : {}),
      });
      return reportWithMessage(report.humanReadable);
    }

    if (args.explain) {
      // Story 3.6: replace the Story 2.4 placeholder with the structured
      // 5-component reasoning trace per epic AC lines 815-821.
      //
      // The branch composes the following:
      //   1. Load state + build DAG (read-only / lock-free per AR8).
      //   2. All-done detector: if every DAG node is in the completed set
      //      (v0.1 proxy via lastSuccessfulStep.phase === "retro" + zero
      //      candidates), emit the verbatim AC-line-820 hint and return.
      //   3. Compute the target step via pickNextStep (or resolveResumeTarget
      //      when args.resume === true). If it throws filter-exhaustion, the
      //      surrounding try/catch surfaces the error narratively (NOT halt).
      //   4. Compute the alternatives list (sorted by closeness-to-ready).
      //   5. Resolve persona-with-tier (graceful: AC-2 throws caught).
      //   6. Format the multi-line message via formatExplainMessage.
      //   7. Return report with exitCode 0.
      //
      // AR9 invariant: the `report` action's `message` is a `\n`-joined
      // multi-line string; the AR9 JSON line on stdout stays single-line.
      // FR54: diagnostic warns/info route to stderr; the explain branch
      // emits ZERO new stderr writes (existing pickFirstPersona warns are
      // PRESERVED on the regular dispatch path; the explain branch reaches
      // resolvePersonaWithTier directly without invoking pickFirstPersona).
      const state = await loadStateUnlocked({ statePath: opts?.statePath });
      const dag = await build({
        skillNames: opts?.skillNames ?? [],
        projectRoot: opts?.projectRoot,
        pluginDir: opts?.pluginDir,
        overridesPath: opts?.overridesPath,
        ...(effectiveConfig?.overrides !== undefined
          ? { overrides: effectiveConfig.overrides }
          : {}),
      });

      // All-done branch (AC lines 818-820). Verbatim AC-line-820 hint.
      // Byte-identical: period after "complete.", period after "steps.",
      // leading "/" before "bmad-next".
      if (isProjectAllDone(state, dag)) {
        return reportWithMessage(
          "All BMAD steps for this project are complete. See /bmad-next --list to inspect remaining optional or unsatisfied steps.",
        );
      }

      // Compute the target step (graceful: catch filter-exhaustion +
      // resume-resolution throws).
      let targetNode: DagNode | null = null;
      let pickError: string | null = null;
      try {
        targetNode = args.resume
          ? resolveResumeTarget(state, dag).node
          : pickNextStep(state, dag, args, log);
      } catch (err) {
        targetNode = null;
        pickError =
          err instanceof StepperError
            ? err.actionableHint
            : err instanceof Error
              ? err.message
              : String(err);
      }

      // Compute the alternatives list (excludes target; sorted by
      // closeness-to-ready ascending).
      const alternatives = computeAlternatives(
        state,
        dag,
        args,
        targetNode?.name ?? null,
      );

      // Resolve persona-with-tier (graceful: AC-2 throws caught and
      // rendered inside the explain message; the explain branch returns
      // exitCode: 0 — diagnostic-not-halt).
      let personaInfo: ResolvedPersonaWithTier | null = null;
      let personaErrorHint: string | null = null;
      if (targetNode !== null) {
        try {
          personaInfo = await resolvePersonaWithTier({
            stepName: targetNode.name,
            ...(args.persona !== undefined
              ? { personaOverride: args.persona }
              : {}),
            pluginDir: opts?.pluginDir,
            projectRoot: opts?.projectRoot,
            configPath: opts?.configPath,
            bmadConfigPath: opts?.bmadConfigPath,
          });
        } catch (err) {
          personaInfo = null;
          personaErrorHint =
            err instanceof StepperError
              ? err.actionableHint
              : err instanceof Error
                ? err.message
                : null;
        }
      }

      // Build the multi-line message (5 components per AC line 817).
      const message = formatExplainMessage({
        targetNode,
        pickError,
        state,
        alternatives,
        personaInfo,
        personaErrorHint,
        args,
      });

      return reportWithMessage(message);
    }

    if (args.list) {
      // Story 3.7 (epic AC lines 833-835): replace the Story 2.4
      // placeholder per-line format with the canonical 4-component line
      // `<step-name> — <phase> — preconditions: [<met>/<unmet>] — optional: <yes/no>`,
      // sorted by phase order then name lexicographic. PRESERVES the
      // surrounding short-circuit position + the Story 3.5 optional-toggle
      // filter; ADDS the `--phase` filter (Story 3.4 carry-over for
      // consistency with `pickNextStep`); ADDS the empty-candidate-set
      // hint emission. Read-only / lock-free per AR8.
      const state = await loadStateUnlocked({ statePath: opts?.statePath });
      const dag = await build({
        skillNames: opts?.skillNames ?? [],
        projectRoot: opts?.projectRoot,
        pluginDir: opts?.pluginDir,
        overridesPath: opts?.overridesPath,
        ...(effectiveConfig?.overrides !== undefined
          ? { overrides: effectiveConfig.overrides }
          : {}),
      });
      const lastStepName = state.lastSuccessfulStep?.step;
      // Collect the candidate set (existing filter logic).
      const candidates: DagNode[] = [];
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
        // **Story 3.5 (epic AC lines 797-802)**: the `--list` short-circuit
        // applies the same 3-mode optional-toggle filter as `pickNextStep`
        // for consistency (the candidate enumeration must match the next-
        // step selection contract). PRESERVED verbatim from Story 3.5.
        if (!args.includeOptional && !args.noOptional && node.optional) {
          continue;
        }
        if (args.noOptional && node.optional) continue;
        // **Story 3.7 (Story 3.4 carry-over)**: apply the `--phase` filter
        // for consistency with `pickNextStep` (a candidate excluded by
        // `--phase planning` from `pickNextStep` is also excluded from
        // `--list --phase planning`). `--epic` / `--story` runner-tier
        // projections are NOT applied per v0.1 conservative scope (Story
        // 6.x revisits when DAG nodes gain epic/story attribution).
        if (args.phase !== undefined && node.phase !== args.phase) continue;
        candidates.push(node);
      }
      // **Story 3.7 (epic AC line 833)**: sort by phase-order then name
      // lexicographic. Reproducibility (AC line 834) is inherited from
      // upstream DAG-build determinism + this deterministic sort
      // comparator.
      candidates.sort((a, b) => {
        const pa = PHASE_ORDER.get(a.phase) ?? 999;
        const pb = PHASE_ORDER.get(b.phase) ?? 999;
        if (pa !== pb) return pa - pb;
        return a.name.localeCompare(b.name);
      });
      // **Story 3.7 (epic AC line 833)**: emit the canonical 4-component
      // per-line format via `formatCandidateLine`. Empty-candidate-set hint
      // is emitted INSIDE the message (the header is always present).
      const lines: string[] = ["Candidate next steps:"];
      for (const node of candidates) {
        lines.push(`  - ${formatCandidateLine(node, state)}`);
      }
      if (candidates.length === 0) {
        lines.push("  (none — current state + filters yield zero candidates)");
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
      ...(effectiveConfig?.overrides !== undefined
        ? { overrides: effectiveConfig.overrides }
        : {}),
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
      nextStep = pickNextStep(state, dag, args, log);
    }

    // Resolve persona + apply --persona override (FR12).
    //
    // **Story 3.5 (epic AC lines 794-796)**: when `--persona <name>` is
    // supplied (non-empty string), BYPASS the 4-tier resolution
    // (Story 1.11's `resolvePersona` cascade: Tier 1 SKILL.md frontmatter
    // > Tier 2 project config `personas:` > Tier 3 `DEFAULT_PERSONAS`
    // > Tier 4 `_bmad/<module>/config.yaml` triggers) and use the
    // supplied name verbatim. The dispatch-spec's `PERSONA` field
    // (`buildDispatchSpec` → `generate-spec.ts`) receives the supplied
    // name as-is; downstream sub-agent prompt is responsible for any
    // persona-name validation.
    //
    // **Story 3.5 (empty-string handling)**: `--persona ""` is treated
    // as "no override" per the existing Story 1.7 line 70 forward-dep
    // precedent (the runner consistently treats empty-string flag values
    // as "no filter / no override"). Handles the common shell-scripting
    // case where a variable expands to empty.
    //
    // **Story 3.5 (forward-deferral)**: the supplied `--persona <name>`
    // is NOT validated against any registry (`DEFAULT_PERSONAS` keys,
    // project-config `personas:` block, `_bmad/<module>/config.yaml`
    // triggers). v0.1 conservative: any non-empty string is accepted;
    // Story 6.1 may add registry-validation when the full config-loader
    // lands.
    //
    // **Story 3.5 (multi-persona warn elision)**: when `--persona` is
    // supplied (a single string), `pickFirstPersona`'s
    // `Array.isArray(persona)` branch is NOT taken — the supplied string
    // is returned verbatim and NO multi-persona warn is emitted. This is
    // the AC line 794-796 "bypassing the 4-tier resolution" semantics.
    //
    // **Story 3.5 (resume composition)**: the persona-resolution branch
    // runs AFTER the `--resume` resume-target resolver (above), so
    // `--persona` overrides EVEN ON RESUME. The user can repoint a
    // resumed step at a different persona for one run; resume's
    // "do the same thing again" intent is at the step level only.
    //
    // **Story 3.5 (forward-deferral on multi-persona sequential
    // dispatch)**: when `--persona` is NOT supplied AND Tier 1 returns
    // an array (multi-persona step like `bmad-create-story`), the
    // existing single-element-pick + warn behaviour at `pickFirstPersona`
    // wins. Full sequential dispatch is forward-deferred to Stories 4.1
    // (loop runner) + 5.* (failure-UX engine) per AR16 + architecture
    // §D13 line 640.
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

    // Story 3.3: --dry-run preview branch (epic AC lines 762-768).
    //
    // Composes the dispatch-spec preview purely IN-MEMORY; does NOT call
    // `buildDispatchSpec` (which would mkdir `staging/<runId>/`, mkdir
    // `inputs/`+`outputs/`, and `atomicWrite` the `dispatch-spec.json`
    // per `generate-spec.ts:184-185 + 236-237`). The 5-field preview
    // message includes target step, persona, model, budget, and expected
    // output path per AC line 767.
    //
    // No-write invariants per AC line 766:
    //   - NO `staging/<run-id>/` mkdir   (bypass `buildDispatchSpec`)
    //   - NO `dispatch-spec.json` write  (same bypass)
    //   - NO `state.yaml.tmp` write      (run.ts is structurally lock-free
    //                                     per architecture §line 1672)
    //   - NO lock acquisition            (AR41 + AR8 + Story 2.4 contract)
    //   - NO sub-agent dispatch          (AR9 emit is `report`, not
    //                                     `dispatch`; Layer 1's slash-
    //                                     command markdown branches on
    //                                     `action` and skips Task on
    //                                     `report`)
    //
    // Insertion site sits AFTER `pickFirstPersona` (so the preview can
    // surface the resolved persona) and BEFORE `buildContextRefs`/
    // `buildDispatchSpec` (so the dispatch-spec writes are bypassed).
    //
    // Forward-coupling (documented carry-overs):
    //   - Story 3.6 (`--explain` Reasoning Trace): the existing `--explain`
    //     short-circuit at run.ts:816-844 returns BEFORE this branch, so
    //     `--dry-run --explain` produces the explain stub (explain wins).
    //   - Story 3.10 (Non-Locking Read Flags): wires `skipAcquire: boolean`
    //     on `src/io/lock.ts`; in v0.1 the no-lock invariant is structural.
    //   - Story 3.6 persona-tier enrichment ("resolved via tier 2: plugin-
    //     default"): v0.1 ships persona NAME only.
    //   - Story 6.3 (`models:` per-step config): `model` resolved from
    //     `opts.config?.models?.[stepName] ?? "sonnet"` (Story 6.1 typed
    //     `Config.models` field). The dry-run preview below surfaces the
    //     resolved model so the user can audit per-step routing.
    //   - Story 6.4 (`budgets:` per-step config): `budget.contextTokens` +
    //     `budget.timeoutMs` resolved from `opts.config?.budgets?.[stepName]`
    //     (default 60_000 / 300_000 per AC-1). The dry-run preview surfaces
    //     the configured cap so the user can audit per-step routing.
    //
    // Dry-run runId convention: `<tsPart>-<stepName>-DRYRUN` (no
    // `node:crypto.randomUUID` entropy — predictable for tests; clearly
    // identifies a dry-run runId in logs that may surface it). The
    // expected-output-path uses the same dry-run runId so the user sees a
    // coherent path that does NOT exist on disk.
    if (args.dryRun) {
      const tsPart = (opts?.nowIso ?? new Date().toISOString())
        .replace(/\.\d{3}Z$/, "")
        .replace(/:/g, "-");
      const dryRunId = `${tsPart}-${nextStep.name}-DRYRUN`;
      const epic =
        state.lastAttempted?.epic ?? state.lastSuccessfulStep?.epic ?? 0;
      const story =
        state.lastAttempted?.story ?? state.lastSuccessfulStep?.story ?? "0.0";
      const expectedOutput = `staging/${dryRunId}/outputs/${nextStep.name}.md`;
      // Story 6.3 — resolve the model from opts.config.models (Story 6.1
      // typed `Config.models` field) for the dry-run preview, falling
      // back to "sonnet" when the per-step config is absent.
      const resolvedModel = opts?.config?.models?.[nextStep.name] ?? "sonnet";
      // Story 6.4 — resolve the budget from opts.config.budgets (Story 6.1
      // typed `Config.budgets` field) for the dry-run preview, falling
      // back to defaults (60_000 ctx / 300_000ms = 60k / 5min) when the
      // per-step config is absent. Partial overrides supported per AC-1.
      const resolvedBudget = opts?.config?.budgets?.[nextStep.name];
      const contextTokensK = Math.round(
        (resolvedBudget?.contextTokens ?? 60_000) / 1000,
      );
      const timeoutMins = Math.round(
        (resolvedBudget?.timeoutMs ?? 300_000) / 60_000,
      );
      const message =
        `Dry-run: would dispatch ${nextStep.name} (epic ${epic} / story ${story}) → ` +
        `${persona} (${resolvedModel}, ${contextTokensK}k context, ${timeoutMins}min timeout). ` +
        `Expected output: ${expectedOutput}`;
      return reportWithMessage(message);
    }

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
    // Story 6.3 — `models:` per-step config consumer wiring. Read the
    // resolved model from `opts.config?.models?.[stepName]` (Story 6.1
    // typed `Config.models` field). When undefined (no per-step config),
    // omit the field so generate-spec.ts:196 falls through to the
    // canonical "sonnet" default. Story 6.1 SDR I-24 PRIMARY HONOURED.
    const configuredModel = opts?.config?.models?.[nextStep.name];
    // Story 6.4 — `budgets:` per-step config consumer wiring. Read the
    // resolved budget from `opts.config?.budgets?.[stepName]` (Story 6.1
    // typed `Config.budgets` field). When undefined (no per-step config),
    // omit the field so generate-spec.ts:208-211 falls through to the
    // canonical defaults (60_000 / 300_000). Story 6.1 SDR I-25 PRIMARY
    // HONOURED. Partial overrides supported (e.g., `{ contextTokens: 80000 }`
    // overrides only contextTokens; timeoutMs falls through to default).
    const configuredBudget = opts?.config?.budgets?.[nextStep.name];
    const result = await buildDispatchSpec({
      stepName: nextStep.name,
      state,
      persona,
      stagingRoot: opts?.stagingRoot,
      nowIso: opts?.nowIso,
      phase: dagPhaseToDispatchPhase(nextStep.phase),
      contextRefs: finalContextRefs,
      requiredSections,
      ...(configuredModel !== undefined
        ? { modelOverride: configuredModel }
        : {}),
      ...(configuredBudget !== undefined
        ? { budgetOverride: configuredBudget }
        : {}),
      ...(args.resume && resumeEpicOverride !== undefined
        ? { epic: resumeEpicOverride }
        : {}),
      ...(args.resume && resumeStoryOverride !== undefined
        ? { story: resumeStoryOverride }
        : {}),
    });

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
    // Story 5.3: --auto-fix overrides per-step policy to "route-to-fixer"
    // for one run (architecture line 499). The override is unconditional
    // when args.autoFix === true; it overrides ANY incoming
    // failurePolicyOverride from RunNextOptions OR from per-step config.
    // The resolvedFailurePolicy is exposed on NextResult so the loop
    // runner can thread it to per-iteration verify-and-advance.ts.
    //
    // Story 5.6 (FR31 PRIMARY): per-step config-driven resolution joins
    // the priority chain. Priority order per OQ-5:
    //   1. --auto-fix → "route-to-fixer" (one-run scope per AC line 1144)
    //   2. opts.failurePolicyOverride (TEST-ONLY SEAM per OQ-5)
    //   3. resolveFailurePolicy(action.step, effectiveConfig) (production path)
    //   4. plugin default "escalate" (resolver fallback)
    //
    // Story 6.1 — `effectiveConfig` is derived above from opts.config OR
    // opts.loadConfigOverride() (test seam) OR the import.meta.main
    // block's `loadConfig()` call (production). When all three are
    // absent, effectiveConfig is undefined → resolver returns
    // escalate-default for every step (preserves baseline behaviour).
    const resolvedFailurePolicy:
      | import("../../failure-ux/index.ts").FailurePolicy
      | undefined =
      args.autoFix === true
        ? "route-to-fixer"
        : (opts?.failurePolicyOverride ??
          resolveFailurePolicy(nextStep.name, effectiveConfig));
    return { exitCode: 0, action, resolvedFailurePolicy };
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

/**
 * Story 3.8: detect whether the current invocation was driven by
 * `--export-state` so the `import.meta.main` block can SPECIAL-CASE the
 * stdout emission. Per FR54 + architecture §line 524 + §line 862, the
 * `--export-state` JSON body goes to stdout DIRECTLY (NOT wrapped in the
 * AR9 line), enabling the AC-line-852 `--export-state | jq '.currentPhase'`
 * single-step `jq` workflow. Every OTHER read-only flag (`--diff-state`,
 * `--explain`, `--list`, `--dry-run`) preserves the AR9 line strictly.
 *
 * The argv scan is intentionally simple: a substring match for
 * `--export-state` (with or without `=`-style attachment). Story 1.7's
 * argument parser is the canonical source of truth for parsing semantics;
 * this helper only needs to detect the flag's presence in the
 * `import.meta.main` post-runNext path. False positives are impossible
 * because the runner only emits a `report` action when `args.exportState`
 * is `true` — the substring scan agrees with the parsed args.
 */
function wasExportStateRequested(argv: readonly string[]): boolean {
  for (const arg of argv) {
    if (arg === "--export-state" || arg.startsWith("--export-state=")) {
      return true;
    }
  }
  return false;
}

/**
 * Story 3.9: detect whether the current invocation was driven by
 * `--watch` so the `import.meta.main` block can SPECIAL-CASE the stdout
 * emission. Per FR42 + FR54 + architecture §line 524 + §line 862, the
 * `--watch` raw transcript stream goes to stdout DIRECTLY (NOT wrapped
 * in the AR9 line) — the watcher emits each line via
 * `process.stdout.write` from inside its tail loop. The
 * `import.meta.main` block detects `--watch` in argv and SKIPS
 * `emitDispatchAction` so the structural `report`-action's summary
 * message does NOT print after the streamed content.
 *
 * Mirrors Story 3.8's `wasExportStateRequested` precedent — substring
 * match for the flag name; runs in the post-`runNext` path to decide
 * whether to bypass the AR9 emit. False positives are impossible
 * because the runner only reaches this branch when `args.watch` is
 * `true` (the parsed arg agrees with the substring scan).
 */
function wasWatchRequested(argv: readonly string[]): boolean {
  for (const arg of argv) {
    if (arg === "--watch" || arg.startsWith("--watch=")) {
      return true;
    }
  }
  return false;
}

/**
 * Story 6.9: detect whether the current invocation was driven by
 * `--upgrade` so the `import.meta.main` block can SPECIAL-CASE the
 * stdout emission. Per AC-1 + OQ-5, the upgrade report goes to stdout
 * DIRECTLY (NOT wrapped in the AR9 line) — the renderer emits a
 * multi-line markdown-style human-readable document. Mirrors Story
 * 3.8's `wasExportStateRequested` + Story 3.9's `wasWatchRequested`
 * precedents — substring match for the flag name; runs in the post-
 * `runNext` path to decide whether to bypass the AR9 emit. False
 * positives are impossible because the runner only reaches the upgrade
 * short-circuit branch when `args.upgrade === true` (the parsed arg
 * agrees with the substring scan).
 *
 * The failure path PRESERVES AR9 — when the upgrade short-circuit
 * returns a `halt` action (network failure / timeout / malformed
 * response), the AR9 line is emitted normally so the user sees the
 * structured halt message in addition to the stderr error from
 * log.error.
 */
function wasUpgradeRequested(argv: readonly string[]): boolean {
  for (const arg of argv) {
    if (arg === "--upgrade" || arg.startsWith("--upgrade=")) {
      return true;
    }
  }
  return false;
}

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
  //
  // Story 3.8 SPECIAL CASE for `--export-state` per FR54 + architecture
  // §line 524 + §line 862: emit the JSON body DIRECTLY on stdout (NOT
  // wrapped in the AR9 line). When `args.exportState === true` AND the
  // result is a `report` action, write `result.action.message` (the JSON
  // body) to stdout instead of `emitDispatchAction(result.action)`. This
  // is the documented FR54 carve-out; every OTHER flag (including
  // `--diff-state`) preserves AR9 strictly.
  //
  // Story 6.1 — load the layered Stepper config (project > user >
  // defaults) ONCE at the entrypoint and thread the parsed Config via
  // `opts.config` to runNext. The loader throws ConfigError (exit 2)
  // for invalid input with a single-line, Zod-derived, field-pointing
  // hint per AR21+AR22 + Story 5.6 single-line constraint. Errors flow
  // through the existing `catch (err)` block below which emits a halt
  // AR9 line and exits with the StepperError exit code.
  try {
    const { loadConfig } = await import("../../config/load.ts");
    let loadedConfig: import("../../schemas/config.ts").Config | undefined;
    try {
      loadedConfig = await loadConfig();
    } catch (loadErr) {
      // Surface the ConfigError / StateTooNewError as an AR9 halt line
      // BEFORE attempting to dispatch (a config-load failure is fatal
      // for every flag — even --doctor's full validation requires the
      // schema to be intact at the loader's first parse).
      if (loadErr instanceof StepperError) {
        emitDispatchAction({
          action: "halt",
          message: loadErr.actionableHint,
          exitCode: loadErr.exitCode === 0 ? 1 : loadErr.exitCode,
        });
        process.exit(loadErr.exitCode === 0 ? 1 : loadErr.exitCode);
      }
      throw loadErr;
    }
    const result = await runNext({ config: loadedConfig });
    const argvSlice = process.argv.slice(2);
    if (wasWatchRequested(argvSlice)) {
      // Story 3.9 SPECIAL CASE per FR42 + FR54: the watcher already
      // emitted the transcript content directly via
      // `process.stdout.write` from inside its tail loop. SKIP
      // `emitDispatchAction` so the AR9 summary line does NOT trail
      // the streamed content. The structural `report` action remains
      // available on the `runNext` return value for tests.
    } else if (wasUpgradeRequested(argvSlice)) {
      // Story 6.9 SPECIAL CASE per AC-1 + OQ-5: the upgrade report goes
      // to stdout DIRECTLY (NOT wrapped in the AR9 line). The renderer
      // already emits the trailing newline; no extra is needed. Third
      // documented AR9 carve-out alongside Story 3.8 --export-state +
      // Story 3.9 --watch.
      if (result.action.action === "report") {
        process.stdout.write(`${result.action.message}\n`);
      } else {
        // Halt path (network failure) — the haltWithHint return path
        // produces an action: "halt" with the AC-2 verbatim hint.
        // Emit via emitDispatchAction so the AR9 line is preserved on
        // the failure path (the user sees the JSON line + the stderr
        // error from log.error per Step 0a's catch).
        emitDispatchAction(result.action);
      }
    } else if (
      wasExportStateRequested(argvSlice) &&
      result.action.action === "report"
    ) {
      process.stdout.write(`${result.action.message}\n`);
    } else {
      emitDispatchAction(result.action);
    }
    process.exit(result.exitCode);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    error(`next: unexpected failure: ${message}`);
    process.exit(1);
  }
}
