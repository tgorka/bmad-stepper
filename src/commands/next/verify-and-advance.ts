/**
 * src/commands/next/verify-and-advance.ts — canonical lock-acquiring
 * `/bmad-next` post-dispatch runner (FR1, FR5, FR16, FR17, FR18, FR32, FR43,
 * FR44, FR46, FR53, FR54, AR8, AR9, AR11, AR12, AR21, AR22, AR25, AR26,
 * AR33, AR41).
 *
 * **TOP-TIER MODULE** per AR41 (architecture lines 1294-1302). The
 * lock-acquiring complement to Story 2.4's `run.ts` (the lock-free pre-
 * dispatch composer). Together Stories 2.4 + 2.6 close the dispatch-then-
 * verify loop the architecture's Coherence Validation Correction 1 (line
 * 1672 + AR8) prescribes.
 *
 * Composition map:
 *   - foundational: `../../errors.ts`, `../../io/log.ts`,
 *     `../../io/paths.ts`, `../../schemas/dispatch-protocol.ts`,
 *     `../../schemas/dispatch-spec.ts`, `../../schemas/state.ts`.
 *   - mid-tier:     `../../state/load.ts` (`loadStateUnlocked` ONLY —
 *                   under the held lock, NOT `loadState` which would
 *                   double-lock); `../../state/save.ts` (`saveState` —
 *                   REQUIRED LockHandle parameter); `../../lock/lock.ts`
 *                   (`acquire` — Story 2.6 OWNS the first lock-acquiring
 *                   runner-tier path); `../../runs/index.ts`
 *                   (`writeStepTranscript` — FIRST canonical caller).
 *   - higher-tier:  `../../dispatch/index.ts` (`emitDispatchAction`,
 *                   `cleanStagingOrphans`, `promote`); `../../verifiers/
 *                   index.ts` (`runVerifier`).
 *   - intra-module: `./args.ts` (`parseVerifyAndAdvanceArgs`).
 *
 * **AR8 LOCK-ACQUIRED CONTRACT (architecture line 1672)**: this module
 * MUST call `acquire()` exactly ONCE at the top of `runVerifyAndAdvance`
 * and `release()` in the `finally` block. The mock-spy test (Task 11.7
 * + 11.8) verifies the call count + the release-on-error path.
 *
 * **AR9 STDOUT DISCIPLINE**: each `bun run` invocation emits EXACTLY ONE
 * JSON line on stdout — the `DispatchActionV1` line written via
 * `emitDispatchAction` (which calls `json()` from `src/io/log.ts` after
 * defence-in-depth `DispatchActionV1Schema.parse()`). All progress /
 * warning / error logging routes to stderr via `info()` / `warn()` /
 * `error()`. The `runVerifyAndAdvance` function itself returns the
 * structured `VerifyAndAdvanceResult` and does NOT emit; only the
 * `import.meta.main` block emits the line.
 *
 * **STATE-HASH TOCTOU CHECK (architecture line 1673 — Critical Gap
 * Resolution 2)**: `runVerifyAndAdvance` re-validates that the state at
 * verify-time has not advanced past the dispatch-spec's projection.
 * v0.1 Option A: derive `(epic, story)` from current state's
 * `lastAttempted` / `lastSuccessfulStep` AND from the dispatch-spec; if
 * the tuples diverge, throw `StateChangedDuringDispatchError` (already
 * registered at `src/errors.ts:164-169` — registry stays at 16 codes;
 * Story 2.6 wires the FIRST throw site).
 *
 * **FINALLY DISCIPLINE (AR25 + AR26 + Story 2.5 PRIMARY CALLER carry-over)**:
 * The transcript + run log are written via Story 2.5's `writeStepTranscript`
 * inside the `finally` block — captured on EVERY exit path (pass, fail,
 * halt, throw) so the audit trail is complete. The transcript write is
 * BEST-EFFORT — failures are warned to stderr but do NOT mask the
 * original outcome. The lock release is the LAST action in the finally
 * block; per AR8 the lock is released regardless.
 *
 * **EXIT-CODE MAPPING (FR53)**: 0 (success), 1 (halt-with-actionable-
 * error — verifier fail / state-hash mismatch / corrupt state), 2
 * (configuration error — argv parse / malformed dispatch-spec), 3 (BMAD
 * compatibility — unreachable here), 4 (lock contention), 5
 * (pathological input — state.yaml > 50 MB / scope violation).
 *
 * Architecture cross-references:
 *   - architecture.md §A.D1 lines 270-296 (three-layer execution model).
 *   - architecture.md §line 1107 (`src/commands/next/verify-and-advance.ts` placement).
 *   - architecture.md §line 1294-1302 (AR41 top-tier import boundary).
 *   - architecture.md §line 1471-1481 (Layer 2 verify-and-advance.ts sequence).
 *   - architecture.md §line 1478 (write transcript step).
 *   - architecture.md §line 1672 (lock-acquiring runner contract — AR8).
 *   - architecture.md §line 1673 (state-hash TOCTOU check).
 *   - architecture.md §line 1674 (STATE_CHANGED_DURING_DISPATCH registered).
 *   - architecture.md §line 1677 (token counts threaded via positional flags).
 *   - prd.md FR53 line 744 (exit codes 0-5).
 *   - prd.md FR54 line 745 (stdout/stderr discipline).
 *   - epics.md §Story 2.6 lines 664-682 (AC verbatim source).
 */

import { mkdir, unlink } from "node:fs/promises";
import type { DagAdjacency } from "../../dag/index.ts";
import type { Phase } from "../../dag/types.ts";
import {
  cleanStagingOrphans,
  emitDispatchAction,
  promote,
  questionsPathForStep,
  resolvePhaseDir,
} from "../../dispatch/index.ts";
import {
  ConfigError,
  StateChangedDuringDispatchError,
  StepperError,
  VerifierFailureError,
} from "../../errors.ts";
import {
  dispatchFailureUx,
  escalateHandler,
  type FailureContext,
  type FailurePolicy,
  resolveFailurePolicy,
} from "../../failure-ux/index.ts";
import { atomicWrite } from "../../io/atomic-write.ts";
import { error, info, warn } from "../../io/log.ts";
import { STAGING_PATH } from "../../io/paths.ts";
import { acquire, type LockHandle, type LockOptions } from "../../lock/lock.ts";
import { writeStepTranscript } from "../../runs/index.ts";
import type { DispatchActionV1 } from "../../schemas/dispatch-protocol.ts";
import {
  type DispatchSpecV1,
  DispatchSpecV1Schema,
} from "../../schemas/dispatch-spec.ts";
import {
  type CheckpointEntry,
  CheckpointEntrySchema,
  type State,
} from "../../schemas/state.ts";
import type { TelemetryRecord } from "../../schemas/telemetry.ts";
import { detectSnapshot, type Snapshot } from "../../snapshot/detect.ts";
import { loadStateUnlocked } from "../../state/load.ts";
import { saveState } from "../../state/save.ts";
import { writeTelemetryRecord as defaultWriteTelemetryRecord } from "../../telemetry/index.ts";
import { type RunVerifierResult, runVerifier } from "../../verifiers/index.ts";
import { parseVerifyAndAdvanceArgs } from "./args.ts";

// ─── Module-level constants ────────────────────────────────────────────────

/**
 * v0.1 phase derivation lookup table per Task 8.4 + architecture §P5
 * worked example. Story 2.6 avoids importing the DAG (Story 1.10) at the
 * runner-tier to prevent transitive coupling — the dispatch-spec carries
 * `epic + story` but NOT `phase` per Story 2.2 dev-001 (the v1 schema
 * does not declare `phase`). A future Story 6.x DispatchSpecV2 schema
 * bump may add `phase` to the dispatch-spec; v0.1 ships with this
 * conservative lookup.
 *
 * Mapping (per seed-v6.x.ts step naming):
 *   - planning:       bmad-create-prd, bmad-create-architecture,
 *                     bmad-create-ux-design, bmad-research,
 *                     bmad-brainstorming, bmad-domain-research,
 *                     bmad-product-brief, bmad-prfaq.
 *   - implementation: bmad-create-story, bmad-dev-story, bmad-code-review,
 *                     bmad-retrospective.
 *   - default:        implementation (conservative fallback).
 */
const PLANNING_STEPS: ReadonlySet<string> = new Set([
  "bmad-create-prd",
  "bmad-create-architecture",
  "bmad-create-ux-design",
  "bmad-research",
  "bmad-brainstorming",
  "bmad-domain-research",
  "bmad-product-brief",
  "bmad-prfaq",
  "bmad-market-research",
  "bmad-technical-research",
  "bmad-create-game-brief",
  "bmad-create-gdd",
  "bmad-game-architecture",
  "bmad-narrative",
  "bmad-create-epics-and-stories",
  "bmad-validate-prd",
  "bmad-edit-prd",
]);

/**
 * Logger surface accepted by `runVerifyAndAdvance` for test injection.
 * Mirrors Story 2.4's `RunNextOptions.logger` shape (info/warn/error/json).
 */
interface LoggerFns {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

// ─── Public types ─────────────────────────────────────────────────────────

/**
 * Test-injection escape hatches for `runVerifyAndAdvance`. Mirrors
 * Story 2.4's `RunNextOptions` precedent — every IO concern is injectable
 * for tmpdir-per-test isolation. Production callers pass none (all
 * defaults resolve from `process.cwd()` / `process.argv`).
 */
export interface RunVerifyAndAdvanceOptions {
  /** Argv slice (defaults to `process.argv.slice(2)`). */
  readonly argv?: readonly string[];
  /** Project root for canonical-path resolution (defaults to `process.cwd()`). */
  readonly projectRoot?: string;
  /** Forwarded to `loadStateUnlocked` + `saveState`. */
  readonly statePath?: string;
  /** Forwarded to `runVerifier` + `promote` + dispatch-spec read. */
  readonly stagingRoot?: string;
  /**
   * Override the directory where the interactive-step questions stub
   * was written by `runNext`. Defaults to a sibling of `stagingRoot`
   * named `pending-input` when `stagingRoot` is set, else the
   * production constant `_bmad-output/.stepper/pending-input`. Tests
   * pass a tmpdir-rooted path so the cleanup deletes the right file.
   */
  readonly pendingInputDir?: string;
  /** Forwarded to `promote` (defaults to BMAD_OUTPUT_ROOT). */
  readonly canonicalRoot?: string;
  /** Forwarded to `writeStepTranscript`. */
  readonly runsRoot?: string;
  /** Forwarded to `acquire`. */
  readonly lockOptions?: LockOptions;
  /** Forwarded to `writeStepTranscript` + state mutation timestamp. */
  readonly nowIso?: string;
  /** Logger override; defaults to `{ info, warn, error }` from `src/io/log.ts`. */
  readonly logger?: LoggerFns;
  /**
   * Story 4.8 (`--checkpoint-each <step-type>`): when supplied, the
   * post-step state save APPENDS a `state.checkpoints[]` entry IF the
   * just-completed step's `phase` matches this value. The entry shape
   * is `{ branch, sha, takenAt, stepType }` per AR13 Layer 1; the
   * `branch` + `sha` come from `detectSnapshot()` (Story 1.8); the
   * `takenAt` is the ISO timestamp at append; `stepType` echoes this
   * value. FIFO-evicted at 50 entries (the `.max(50)` cap on
   * `StateV1Schema.checkpoints[]`).
   *
   * The matcher (`matchCheckpointPhase`) looks up the just-completed
   * step's `phase` via the optional `dag` injection seam below; when
   * `dag === undefined`, the matcher falls back to the v0.1
   * `derivePhaseFromStep` lookup table (planning/implementation only).
   * For full 5-phase coverage, callers should inject the DAG.
   */
  readonly checkpointEach?: Phase;
  /**
   * Story 4.8: optional DAG-injection seam for the per-iteration
   * `node.phase` lookup used by the checkpoint matcher. When
   * `undefined`, the matcher falls back to `derivePhaseFromStep`
   * (planning/implementation only — sufficient for v0.1 since the
   * production checkpoint flow targets `--checkpoint-each
   * implementation` per the AC's worked example).
   */
  readonly dag?: DagAdjacency;
  /**
   * Story 5.1: per-step failure policy override.
   *
   * **TEST-ONLY SEAM (per Story 5.6 OQ-5)** — production resolution
   * flows through `resolveFailurePolicy(dispatchSpec.step, opts.config)`.
   * Production callers do NOT pass this field; tests pass it for
   * deterministic retry-loop coverage without writing a config file.
   *
   * When supplied AND the verifier fails, the retry loop consults this
   * policy instead of resolving from config.
   */
  readonly failurePolicyOverride?: FailurePolicy;
  /**
   * Story 5.6 — optional parsed config object for per-step policy
   * resolution (FR31 PRIMARY). Production callers receive this from the
   * Story 6.1 file loader (when it lands); tests pass synthetic config
   * objects directly. Until Story 6.1 lands, the resolver is invoked
   * with `undefined` config in production → escalate-default for every
   * step.
   */
  readonly config?: {
    failurePolicies?: import("../../schemas/config.ts").FailurePolicies;
    /**
     * Story 6.5 — optional per-step verifier config map. When supplied,
     * `runVerifier` consults `projectVerifiers[stepName]` and merges /
     * replaces the baseline plugin defaults per the entry's `mode`
     * field. AR17 + AC-2 enforced: the schema declares NO `custom` /
     * `schema` field — the registry-side `custom?` callback + `schema`
     * are PLUGIN-SIDE only and preserved from the baseline.
     */
    verifiers?: import("../../schemas/config.ts").Verifiers;
    /**
     * Story 6.6 — opt-in telemetry config (FR39, FR40, NFR-S3). When
     * `enabled === true`, the finally block (Step 12.25) writes a
     * TelemetryRecord JSONL line to `<telemetryRoot>/<YYYY-MM>.jsonl`
     * after the transcript write and BEFORE the orphan staging cleanup.
     * The opt-in gate is `enabled === true` strict-equals (rejects
     * `undefined`, `false`, `null`, `0`, `""`) per OQ-4. AC-3 mechanism.
     */
    telemetry?: import("../../schemas/config.ts").Telemetry;
  };
  /**
   * Story 6.6 — test seam: when supplied, overrides the telemetry
   * directory root for `writeTelemetryRecord`. Production callers omit
   * this; the writer falls back to `_bmad-output/.stepper/telemetry/`
   * (the `paths.telemetry` default per `src/config/defaults.ts:48`).
   * Mirror Story 2.6 `runsRoot?` seam pattern.
   */
  readonly telemetryRoot?: string;
  /**
   * Story 6.6 — test seam: when supplied, replaces the imported
   * `writeTelemetryRecord` with a stub. Tests pass a stub that throws
   * to exercise the best-effort fall-through (Step 12.25 catch +
   * log.warn). Production callers omit. Mirror Story 6.5
   * `verifierOverride?` test seam pattern.
   */
  readonly writeTelemetryRecordOverride?: typeof import("../../telemetry/index.ts").writeTelemetryRecord;
  /**
   * Story 5.1: max-retries override (test-injection seam; production
   * defaults to 2 per architecture line 494 = 3 total attempts). The
   * cap is RETRIES AFTER THE ORIGINAL — `maxRetries: 2` means the
   * retry loop runs up to 3 attempts (1 original + 2 retries) before
   * escalating per dispatchFailureUx.
   */
  readonly maxRetriesOverride?: number;
  /**
   * Story 5.1 test-injection seam: replaces the imported `runVerifier`
   * with a stub. Tests pass an attempt-aware stub that returns pass/fail
   * results in sequence to exercise the retry loop deterministically
   * without needing real artifact files. Production callers pass
   * nothing → the runner uses the real `runVerifier` from
   * `src/verifiers/index.ts`.
   *
   * The stub's signature mirrors `runVerifier(runId, opts)` →
   * `Promise<RunVerifierResult>`. The stub may inspect a per-attempt
   * counter that is closure-captured to alternate outcomes.
   */
  readonly verifierOverride?: (
    runId: string,
    opts: {
      stepName: string;
      stagingRoot: string;
      /**
       * Story 6.5 — test seam reflects the runtime `runVerifier`
       * signature. Production threading: when `opts.config.verifiers` is
       * supplied, the runner forwards it via this field so the test
       * stub can capture / assert the merge layer's input. NOT
       * load-bearing for stubs that ignore it.
       */
      projectVerifiers?: import("../../schemas/config.ts").Verifiers;
    },
  ) => Promise<RunVerifierResult> | RunVerifierResult;
  /**
   * Story 5.1 test-injection seam: invoked between retry attempts to
   * simulate sub-agent re-dispatch (which v0.1 does NOT actually
   * perform per OQ-8 — the same dispatch-spec is on disk, the test
   * stub may overwrite the staged artifact between attempts to
   * change the next verifier outcome). When undefined the retry loop
   * just iterates without any "re-dispatch" side-effect; production
   * path is identical (no recursive Task tool invocation in v0.1).
   *
   * @param attemptNumber - The attempt number that is about to start
   *                        (2 for the first retry, 3 for the second).
   */
  readonly reDispatchOverride?: (attemptNumber: number) => Promise<void> | void;
  /**
   * Story 5.1 test-injection seam: when supplied, the retry loop polls
   * this function BEFORE re-dispatching the next attempt. If it returns
   * true, the retry loop halts cleanly with the LAST attempt's failure
   * context (no escalate, no further attempts) — cooperation per Story
   * 4.9 graceful-exit invariant. Production callers pass nothing → the
   * retry loop never short-circuits.
   */
  readonly shutdownRequested?: () => boolean;
  /**
   * Story 5.3 test-injection seam: when supplied AND the per-step policy
   * resolves to route-to-fixer, the verify-and-advance loop calls this
   * function INSTEAD of returning the AR9 dispatch action for the fixer
   * (production path is the slash-command markdown's second-AR9-cycle).
   * The function should write a corrected artifact to
   * `staging/<fixerRunId>/outputs/<artifact>` so the subsequent verifier
   * re-run can succeed (or write an intentionally-failing artifact to
   * test the escalate branch).
   *
   * The signature mirrors the test seam pattern from Story 5.1
   * `reDispatchOverride`. Production callers pass nothing — the runner
   * returns the AR9 dispatch action and the slash-command markdown
   * dispatches the fixer via the Task tool.
   */
  readonly fixerDispatchOverride?: (fixerRunId: string) => Promise<void> | void;
  /**
   * Story 5.2 test-injection seam: when supplied (or when the argv
   * carries `--skip-step <step>`), the runner enters the SKIP path
   * BEFORE the dispatch-spec read + verifier invocation. The skip
   * path mutates state with three simultaneous changes (atomic per
   * the existing saveState contract): (a) appends a new runHistory[]
   * entry with `skipped: true` for the matched step; (b) advances
   * lastSuccessfulStep to the NEXT step in topological order via
   * the DAG resolver; (c) clears lastAttempted to null per AC line
   * 1077. Production callers thread via the `--skip-step <step>`
   * positional flag; tests pass via this seam.
   */
  readonly skipStep?: string;
  /**
   * Story 5.2: optional DAG injection seam for the skip path's
   * `pickNextStepAfterSkip` lookup. When undefined, the skip path
   * falls back to a v0.1 conservative behavior: lastSuccessfulStep
   * is cleared to null + lastAttempted is cleared (the user re-
   * invokes /bmad-next without --skip to advance from
   * lastSuccessfulStep). Production callers SHOULD inject the DAG
   * for proper next-step resolution; tests may inject a synthetic
   * DAG to exercise the resolver path.
   *
   * Note: the existing `dag` field above (Story 4.8) is reused here
   * — the skip path consults the same DAG injection seam as the
   * checkpoint matcher.
   */
}

/**
 * Structured return value from `runVerifyAndAdvance`. Tests inspect this
 * directly WITHOUT mutating stdout / process state. The `import.meta.main`
 * block emits the AR9 line via `emitDispatchAction(result.action)` and
 * exits with `result.exitCode`.
 */
export interface VerifyAndAdvanceResult {
  readonly exitCode: 0 | 1 | 2 | 3 | 4 | 5;
  readonly action: DispatchActionV1;
  /** Optional artifact paths returned for caller introspection (tests + Story 2.7). */
  readonly transcriptPaths?: { markdown: string; json: string };
  /** Canonical-destination path on success; null on failure / halt. */
  readonly promotedTo?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

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
  };
}

/**
 * Derive the planning vs implementation phase for a step name per the
 * v0.1 lookup table. Conservative fallback to `"implementation"` for
 * unknown step names — the canonical phase resolution lives in the DAG
 * (Story 1.10) but Story 2.6 deliberately avoids the transitive coupling
 * to keep the runner-tier dependency graph minimal.
 *
 * Pure function — no IO, no allocation beyond the lookup.
 */
export function derivePhaseFromStep(
  stepName: string,
): "planning" | "implementation" {
  return PLANNING_STEPS.has(stepName) ? "planning" : "implementation";
}

/**
 * Story 4.8: pure-function lookup — would the just-completed step fire a
 * checkpoint under `checkpointEach`? Returns the matched phase (echoes
 * the input) or `null`. The AC-1 contract: the just-completed step's
 * `phase` (looked up via the DAG when supplied; falls back to the v0.1
 * `derivePhaseFromStep` lookup table when no DAG is available) must
 * equal `checkpointEach` exactly.
 *
 * Inlined here per AR41 boundary — `next/verify-and-advance.ts`
 * (mid-tier) cannot import the analogous `matchCheckpointType` helper
 * from `loop/plan.ts` (top-tier). The duplication is ~6 lines and is
 * deliberate per Story 4.8 OQ-4; a future Story 6.x may extract the
 * matcher into a foundational `src/checkpoint/match.ts` module shared
 * by both consumers.
 *
 * Pure function — no IO, no allocation beyond the lookup.
 */
export function matchCheckpointPhase(
  stepName: string,
  dag: DagAdjacency | undefined,
  checkpointEach: Phase | undefined,
): Phase | null {
  if (checkpointEach === undefined) return null;
  // DAG path: authoritative phase resolution (5-phase coverage).
  if (dag !== undefined) {
    const node = dag.nodes.get(stepName);
    if (node === undefined) return null;
    if (node.phase !== checkpointEach) return null;
    return checkpointEach;
  }
  // Fallback: v0.1 `derivePhaseFromStep` lookup (planning/implementation
  // coverage only). The production AC worked example targets
  // `--checkpoint-each implementation` which is the conservative
  // fallback's default; analysis/solutioning/retro phases require the
  // DAG injection seam.
  const derived = derivePhaseFromStep(stepName);
  if (derived !== checkpointEach) return null;
  return checkpointEach;
}

/**
 * Read + Zod-parse the dispatch-spec.json under `staging/<runId>/`. Throws
 * `ConfigError` (CONFIG_ERROR, exitCode 2) on missing / unreadable /
 * malformed dispatch-spec. The Zod parse via `DispatchSpecV1Schema.parse()`
 * is defence-in-depth (NFR-M3); the dispatch-spec is written by Story
 * 2.4 / 2.2 with the schema-validated literal, so the parse is a
 * belt-and-suspenders check.
 */
async function readDispatchSpec(
  stagingRoot: string,
  runId: string,
): Promise<DispatchSpecV1> {
  const specPath = `${stagingRoot}/${runId}/dispatch-spec.json`;
  const file = Bun.file(specPath);
  const exists = await file.exists();
  if (!exists) {
    throw new ConfigError(
      `verify-and-advance: dispatch-spec missing at ${specPath}`,
      `runId=${runId}`,
      `Run /bmad-next to start a new dispatch; the dispatch-spec at ${specPath} is missing.`,
    );
  }
  let raw: unknown;
  try {
    raw = await file.json();
  } catch (err) {
    throw new ConfigError(
      `verify-and-advance: dispatch-spec at ${specPath} is malformed JSON`,
      err instanceof Error ? err.message : String(err),
      `Run /bmad-next to start a new dispatch; the dispatch-spec at ${specPath} is malformed.`,
    );
  }
  try {
    return DispatchSpecV1Schema.parse(raw);
  } catch (err) {
    throw new ConfigError(
      `verify-and-advance: dispatch-spec at ${specPath} failed schema validation`,
      err instanceof Error ? err.message : String(err),
      `Run /bmad-next --doctor to diagnose the malformed dispatch-spec; expected DispatchSpecV1 shape.`,
    );
  }
}

/**
 * Read the sub-agent output (best-effort) from
 * `staging/<runId>/outputs/<artifactFilename ?? stepName + ".md">`. On
 * read failure, returns the empty string + warns to stderr — the
 * transcript still gets written for forensics; the verifier will have
 * surfaced the missing-output error.
 */
async function readSubAgentOutput(
  stagingRoot: string,
  runId: string,
  stepName: string,
  log: LoggerFns,
  artifactFilename?: string,
): Promise<string> {
  const filename = artifactFilename ?? `${stepName}.md`;
  const outputPath = `${stagingRoot}/${runId}/outputs/${filename}`;
  try {
    const file = Bun.file(outputPath);
    const exists = await file.exists();
    if (!exists) {
      log.warn(
        `verify-and-advance: sub-agent output missing at ${outputPath} (transcript will record empty body)`,
      );
      return "";
    }
    return await file.text();
  } catch (err) {
    log.warn(
      `verify-and-advance: failed to read sub-agent output at ${outputPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return "";
  }
}

/**
 * Compare the current state's `(epic, story)` projection against the
 * dispatch-spec's `(epic, story)` projection per architecture line 1673
 * (Coherence Validation Correction 2). Story 2.6 v0.1 Option A:
 *
 *   - currentEpicStory = state.lastAttempted ? (lastAttempted.epic, story)
 *                       : state.lastSuccessfulStep ? (lastSuccessfulStep.epic, story)
 *                       : (0, "0.0")
 *   - dispatchEpicStory = (dispatchSpec.epic, dispatchSpec.story)
 *   - match = epic-story tuples are structurally equal
 *
 * Returns the structured `{ match, currentEpicStory, dispatchEpicStory }`
 * so the caller can log the divergence for forensic capture.
 *
 * Pure function — no IO.
 */
export interface StateHashComparison {
  readonly match: boolean;
  readonly currentEpicStory: { readonly epic: number; readonly story: string };
  readonly dispatchEpicStory: { readonly epic: number; readonly story: string };
}

export function compareStateHashes(
  state: State,
  dispatchSpec: DispatchSpecV1,
): StateHashComparison {
  let currentEpicStory: { epic: number; story: string };
  if (state.lastAttempted !== undefined && state.lastAttempted !== null) {
    currentEpicStory = {
      epic: state.lastAttempted.epic,
      story: state.lastAttempted.story,
    };
  } else if (
    state.lastSuccessfulStep !== undefined &&
    state.lastSuccessfulStep !== null
  ) {
    currentEpicStory = {
      epic: state.lastSuccessfulStep.epic,
      story: state.lastSuccessfulStep.story,
    };
  } else {
    currentEpicStory = { epic: 0, story: "0.0" };
  }
  const dispatchEpicStory = {
    epic: dispatchSpec.epic,
    story: dispatchSpec.story,
  };
  const match =
    currentEpicStory.epic === dispatchEpicStory.epic &&
    currentEpicStory.story === dispatchEpicStory.story;
  return { match, currentEpicStory, dispatchEpicStory };
}

/**
 * Story 5.3: write the fixer's dispatch-spec at
 * `staging/<fixerRunId>/dispatch-spec.json` per AC line 1093 ("the
 * failure context (verifier result + artifact excerpt) in its CONTEXT
 * section"). The spec extends the original step's context with TWO new
 * entries: the verifier-result.json + the original artifact (read-only
 * inputs for the fixer's reasoning).
 *
 * The dispatch-spec mirrors the canonical DispatchSpecV1 shape (Story
 * 1.5 schema) — same persona/context/task/outputFormat/successCriteria/
 * constraints six-section AR7 contract — with the fixer-specific
 * differences:
 *   - persona: "bmad-step-fixer" (the fixer agent name).
 *   - task:    BYTE-IDENTICAL to AC line 1091 substring "remediate a
 *              BMAD step artifact based on a verifier failure".
 *   - outputFormat.fileLocation: under the FIXER staging dir
 *              (staging/<fixerRunId>/outputs/<artifact>) — note the
 *              `-fix` suffix on the runId per AC line 1093.
 *   - context: extended with verifier-result + original-artifact paths.
 *
 * Atomic via existing atomicWrite (NFR-S5 — `.tmp` → rename, `.bak`
 * rotation on overwrite).
 *
 * Returns the absolute path to the written dispatch-spec.json.
 */
async function writeFixerDispatchSpec(input: {
  fixerRunId: string;
  originalRunId: string;
  originalDispatchSpec: DispatchSpecV1;
  verifierResultPath: string;
  originalArtifactPath: string;
  stagingRoot: string;
}): Promise<string> {
  const fixerStagingDir = `${input.stagingRoot}/${input.fixerRunId}`;
  const fixerSpecPath = `${fixerStagingDir}/dispatch-spec.json`;
  const fixerOutputArtifact = `staging/${input.fixerRunId}/outputs/${input.originalDispatchSpec.step}.md`;

  // Compose the fixer's context[] — start with the original step's
  // context entries (so the fixer has the same reference materials
  // the original step had) and append the AC-mandated two extras
  // (verifier-result + original artifact).
  const originalContext = Array.isArray(
    input.originalDispatchSpec.taskSpec.context,
  )
    ? (input.originalDispatchSpec.taskSpec.context as readonly unknown[])
    : [];
  const fixerContext = [
    ...originalContext,
    {
      path: input.verifierResultPath,
      label: "verifier-result.json (failure context per AC line 1093)",
    },
    {
      path: input.originalArtifactPath,
      label: "original artifact (excerpt per AC line 1093)",
    },
  ];

  const fixerSpec: DispatchSpecV1 = {
    schemaVersion: 1,
    runId: input.fixerRunId,
    step: input.originalDispatchSpec.step,
    epic: input.originalDispatchSpec.epic,
    story: input.originalDispatchSpec.story,
    model: input.originalDispatchSpec.model,
    budget: input.originalDispatchSpec.budget,
    taskSpec: {
      // Story 5.3 OQ-1: bmad-step-fixer persona key (mirrors the
      // bmad-step-fixer.md frontmatter `name:` field).
      persona: "bmad-step-fixer",
      context: fixerContext,
      // BYTE-IDENTICAL to AC line 1091 substring + agents/bmad-step-
      // fixer.md frontmatter description per Task 2.5 verification.
      task: "remediate a BMAD step artifact based on a verifier failure",
      outputFormat: {
        fileLocation: fixerOutputArtifact,
        // The corrected artifact must honor the same required-sections
        // and schema-ref constraints as the original step's output (the
        // original verifier re-runs after the fix).
        ...((input.originalDispatchSpec.taskSpec.outputFormat as Record<
          string,
          unknown
        > | null) ?? {}),
        // Override fileLocation to point at the FIXER staging dir.
        // (Spread first, then override to ensure correctness.)
      },
      successCriteria: input.originalDispatchSpec.taskSpec.successCriteria,
      constraints: {
        // Inherit any original constraints (allowed-tools, etc.).
        ...((input.originalDispatchSpec.taskSpec.constraints as Record<
          string,
          unknown
        > | null) ?? {}),
        // Tighten scope-limits to the FIXER staging dir per NFR-S4.
        scopeLimits: `Only files inside \`staging/${input.fixerRunId}/\` may be written.`,
      },
    },
  };

  // Defence-in-depth Zod validate (caller-bug guard).
  const validated = DispatchSpecV1Schema.parse(fixerSpec);

  // mkdir -p the fix staging dir tree (mirrors generate-spec.ts pattern
  // — atomicWrite does NOT mkdir, so the parent must exist before write).
  await mkdir(`${fixerStagingDir}/inputs`, { recursive: true });
  await mkdir(`${fixerStagingDir}/outputs`, { recursive: true });

  // Atomic write via existing atomicWrite (NFR-S5 — `.tmp` → rename,
  // `.bak` rotation; the assertWithinScope check passes for staging
  // dir paths under STEPPER_INTERNAL_ROOT).
  await atomicWrite(fixerSpecPath, JSON.stringify(validated, null, 2));
  return fixerSpecPath;
}

/**
 * Story 5.2: pick the next step in topological order AFTER the just-
 * skipped step. Returns the first DAG node whose `after[]` includes the
 * skipped step (mirrors the success-path advance — same DAG resolver,
 * same tiebreak per OQ-3 decision). Returns `null` when:
 *   - no DAG is injected (v0.1 graceful degradation — the caller falls
 *     back to clearing lastSuccessfulStep);
 *   - no successor exists (e.g., the skipped step is a terminal node).
 *
 * Pure function — no IO. The tiebreak is the existing pickNextStep
 * tiebreak from Story 1.10 (Map insertion order); future Story 6.x may
 * extend with phase-order + lexicographic tiebreaks per OQ-3 forward-
 * tracker.
 */
function pickNextStepAfterSkip(
  skippedStep: string,
  dag: DagAdjacency | undefined,
): { name: string } | null {
  if (dag === undefined) return null;
  for (const node of dag.nodes.values()) {
    if (node.name === skippedStep) continue;
    if (node.after.includes(skippedStep)) {
      return node;
    }
  }
  return null;
}

/**
 * Story 5.1: FIFO-100 trim helper for the runHistory[] write site.
 * Mirrors the FIFO-50 checkpoints[] trim precedent (Story 4.8). When
 * the array exceeds the .max(100) cap on RunHistoryEntrySchema, the
 * OLDEST entries are dropped before the schema-validate boundary in
 * saveState would reject the write. Pure function — no IO.
 */
function trimRunHistory(entries: RunHistoryEntry[]): RunHistoryEntry[] {
  if (entries.length <= 100) return entries;
  return entries.slice(entries.length - 100);
}

/**
 * v0.1 RunHistoryEntry shape per Task 5.9 + epic AC line 677 ("tokens are
 * recorded into runHistory[]"). Story 5.1 (Epic 5 retry mode) TIGHTENED
 * `StateV1Schema.runHistory[]` to `z.array(RunHistoryEntrySchema)` adding
 * the load-bearing `attemptNumber`, `outcome`, `failureCode`, `completedAt`
 * fields for the Epic 5 retry telemetry consumption (Story 6.6/6.7). The
 * legacy fields `verifierStatus`, `promotedTo`, `durationMs`, `tokensIn`,
 * `tokensOut`, `ts` are preserved as OPTIONAL on the schema (Story 5.1
 * D1 deviation — allows the Story 4.5 token accumulation reader and the
 * Story 4.x plan-walk completion check to keep working without changes).
 */
interface RunHistoryEntry {
  // Story 5.1: required typed fields per RunHistoryEntrySchema.
  runId: string;
  step: string;
  epic: number;
  story: string;
  attemptNumber: number;
  outcome: "pass" | "fail";
  failureCode: string | null;
  completedAt: string;
  // Legacy fields preserved for backwards compat (Story 5.1 D1).
  // OPTIONAL on the schema; optional here so callers (tests) can omit them.
  verifierStatus?: "pass" | "fail" | "skip";
  promotedTo?: string | null;
  durationMs?: number;
  tokensIn?: number;
  tokensOut?: number;
  ts?: string;
  // Story 5.2: skip-mode marker per AC line 1077. When `true`, the entry
  // records a skip operation invoked via `/bmad-next --skip <step>
  // --resume` (NOT a verifier-pass outcome). The `outcome` field stays
  // "pass" per the success-path-shape contract; the `skipped: true`
  // marker is the forensic record that the verifier was BYPASSED.
  skipped?: boolean;
  // Story 5.3: fix-attempt marker per AC line 1096. When `true`, the
  // entry records a fix-attempt invoked via /bmad-next --auto-fix or
  // per-step `route-to-fixer` policy. The `outcome` field is "pass"
  // (post-fix verifier passed) or "fail" (post-fix verifier failed per
  // AC line 1099 escalate path); the `fixAttempt: true` marker is the
  // forensic record that the entry corresponds to a remediation attempt.
  fixAttempt?: boolean;
}

// ─── Public function ──────────────────────────────────────────────────────

/**
 * Run the canonical lock-acquiring `/bmad-next` post-dispatch
 * orchestration. Composes the mid-tier (lock + state + runs) + higher-tier
 * (dispatch + verifiers) surface into a single async function that
 * returns a structured `VerifyAndAdvanceResult` for tests to inspect; the
 * `import.meta.main` block emits the AR9 line + exits with the result
 * code.
 *
 * Algorithm (Story 2.6 Tasks 6-9):
 *   1. Resolve options + parse argv via `parseVerifyAndAdvanceArgs`.
 *   2. Acquire lock via `acquire(opts?.lockOptions)`.
 *   3. Read state via `loadStateUnlocked` (under held lock, NOT
 *      `loadState` which would double-lock).
 *   4. Read dispatch-spec via `readDispatchSpec`.
 *   5. Compare state-hash via `compareStateHashes`. On mismatch throw
 *      `StateChangedDuringDispatchError` (FIRST throw site).
 *   6. Run verifier via `runVerifier`. On fail throw `VerifierFailureError`.
 *   7. Promote artifact via `promote()`. Capture `promotedTo`.
 *   8. Append to `runHistory[]` + advance `lastSuccessfulStep` + clear
 *      `lastAttempted`.
 *   9. Save state via `saveState(state, handle)` (REQUIRED LockHandle).
 *  10. Compose AR9 success line.
 *  11. (finally) Read sub-agent output + write transcript pair via
 *      `writeStepTranscript`. Best-effort; failures warn but do not mask.
 *  12. (finally) `cleanStagingOrphans()` (best-effort; Story 2.2 carry-over).
 *  13. (finally) `handle.release()`.
 *
 * On any `StepperError` throw mid-flow, the outer try/catch translates
 * to `action: "halt"` with `exitCode: err.exitCode` and `message:
 * err.actionableHint` (AR21 + AR22 + AC-3).
 *
 * **MUST call `acquire()` exactly ONCE** — Task 11.7 mock-spy verifies.
 */
export async function runVerifyAndAdvance(
  opts?: RunVerifyAndAdvanceOptions,
): Promise<VerifyAndAdvanceResult> {
  const log = opts?.logger ?? defaultLogger();
  const argv = opts?.argv ?? process.argv.slice(2);

  // Step 1: parse argv (defensive — the import.meta.main block also
  // surfaces parse errors before invoking runVerifyAndAdvance).
  const parsed = parseVerifyAndAdvanceArgs(argv);
  if (!parsed.ok) {
    return {
      exitCode: 2,
      action: {
        action: "halt",
        message: parsed.error.hint,
        exitCode: 2,
      },
    };
  }
  const args = parsed.value;

  const stagingRoot = opts?.stagingRoot ?? STAGING_PATH;
  const startMs = performance.now();

  // Bookkeeping for the finally block (transcript composition).
  let handle: LockHandle | undefined;
  let stateBefore: State | undefined;
  let stateAfter: State | undefined;
  let dispatchSpec: DispatchSpecV1 | undefined;
  let verifierResult: RunVerifierResult | undefined;
  let promotedTo: string | null = null;
  let outcomeError: StepperError | undefined;
  let actionResult: DispatchActionV1 | undefined;
  let exitCode: 0 | 1 | 2 | 3 | 4 | 5 = 0;
  let transcriptPaths: { markdown: string; json: string } | undefined;
  // Story 5.1: per-attempt failed-outcome runHistory entries accumulated
  // during the retry loop. Persisted on BOTH the success path (Step 10
  // saveState below; the trailing successful entry is appended after
  // these) AND the halt path (the catch handler concatenates them onto
  // stateOnHalt.runHistory before writing).
  const accumulatedRunHistoryFromRetries: RunHistoryEntry[] = [];
  // Story 5.4 — escalate handler enriched-hint closure (FR30+FR32+NFR-M2).
  // Set at each of the 4 escalate throw sites BEFORE the throw via
  // escalateHandler(failureContext, {}). The catch handler reads this
  // (when defined) to OVERRIDE the default `err.actionableHint` in the
  // lastFailureReason write + AR9 halt action message. Per OQ-2 audit,
  // all 17 existing StepperError class hints already match the AR22
  // regex (PASS-THROUGH common case); the override is a safety-net that
  // also cements the integration-test contract — every escalate path's
  // lastFailureReason.hint matches `/^.*(Run|See|Try|Check) /`.
  let escalateEnrichedHint: string | undefined;

  try {
    // Step 2: acquire lock. The lock-acquired contract is positive (must
    // call exactly ONCE per runVerifyAndAdvance invocation). On
    // LockContentionError, the outer catch translates to action: "halt"
    // with exitCode: 4.
    handle = await acquire(opts?.lockOptions);

    // Step 3: read state via loadStateUnlocked (NOT loadState — that
    // would attempt to acquire a second lock and throw LockContentionError).
    stateBefore = await loadStateUnlocked({ statePath: opts?.statePath });

    // Story 5.2 SKIP PATH: when args.skipStep is supplied (via the
    // --skip-step <step> positional flag OR the test-injection seam),
    // enter the skip branch BEFORE the heavyweight verifier+promote
    // sequence. The dispatch-spec read AND the verifier invocation
    // are SKIPPED on the skip path; the lock acquire happens normally
    // per AR8 (Step 2 above), and the lock release in finally per
    // AR25 + AR26.
    //
    // The skip branch:
    //   (a) asserts state.lastAttempted is populated (OQ-4: throw on
    //       null lastAttempted with hint pointing at /bmad-next first);
    //   (b) asserts state.lastAttempted.step === skipStep (OQ-6: throw
    //       on mismatch with hint surfacing the actual lastAttempted.step
    //       value for correction);
    //   (c) idempotency check (OQ-7): if the most-recent runHistory
    //       entry for this step has skipped=true, throw — second --skip
    //       on already-skipped step is rejected;
    //   (d) computes the next step via pickNextStepAfterSkip (DAG
    //       resolver from Story 1.10 + sibling-step lookup);
    //   (e) constructs the new RunHistoryEntry with skipped=true (the
    //       outcome field stays "pass" per the success-path-shape
    //       contract; skipped:true is the FORENSIC marker that the
    //       verifier was BYPASSED);
    //   (f) constructs stateAfter with lastSuccessfulStep advanced to
    //       the resolved next step + lastAttempted cleared + the new
    //       runHistory entry appended;
    //   (g) saves state via the existing saveState atomic-write path
    //       (ONE write, atomic per AR13 Layer 2; SIGINT cooperation
    //       per Story 4.9 §I-2 forward-tracker — the atomic tmp+rename
    //       guarantees no partial writes per NFR-S5);
    //   (h) emits the AR9 success line (single line, exitCode 0);
    //   (i) returns BEFORE the success-path verifier+promote sequence.
    //
    // Per Story 4.8 §I-1 atomic-write contract: the skip-path saveState
    // is the SOLE write site in this branch.
    const skipStep = args.skipStep ?? opts?.skipStep;
    if (skipStep !== undefined) {
      // OQ-4: state.lastAttempted must be populated.
      if (
        stateBefore.lastAttempted === null ||
        stateBefore.lastAttempted === undefined
      ) {
        throw new ConfigError(
          `--skip ${skipStep} requires state.lastAttempted to be populated`,
          JSON.stringify({ skipStep, lastAttempted: null }),
          `Run /bmad-next without --skip first to populate state.lastAttempted, then retry --skip ${skipStep} --resume.`,
        );
      }
      // OQ-6: --skip <step> mismatch with state.lastAttempted.step.
      if (stateBefore.lastAttempted.step !== skipStep) {
        const actualStep = stateBefore.lastAttempted.step;
        throw new ConfigError(
          `--skip ${skipStep} mismatched state.lastAttempted.step (${actualStep})`,
          JSON.stringify({ skipStep, actualStep }),
          `Check state.lastAttempted.step (${actualStep}) and re-invoke /bmad-next --skip ${actualStep} --resume.`,
        );
      }
      // OQ-7: idempotent re-skip protection — reject if the most-recent
      // runHistory entry for this step has skipped=true (the user has
      // already invoked --skip on this step; second invocation is
      // user-confusion, throw with hint).
      const existingHistory = stateBefore.runHistory ?? [];
      const lastEntry = existingHistory[existingHistory.length - 1];
      if (lastEntry?.step === skipStep && lastEntry?.skipped === true) {
        throw new ConfigError(
          `step ${skipStep} is already skipped`,
          JSON.stringify({ skipStep, lastEntry }),
          `Check state.runHistory and run /bmad-next without --skip to continue.`,
        );
      }
      // Compute the next step via the DAG resolver. When no DAG is
      // injected (v0.1 graceful degradation), the resolver returns
      // null and the runner falls back to clearing lastSuccessfulStep
      // (the user re-invokes /bmad-next without --skip to resume from
      // the prior state).
      const nextNode = pickNextStepAfterSkip(skipStep, opts?.dag);
      const nowIso = opts?.nowIso ?? new Date().toISOString();
      // Construct the runHistory entry with the skipped: true marker.
      // The runId on the skip entry is best-effort: prefer args.runId
      // (the verify-and-advance.ts runId from Layer 1's flag thread);
      // fall back to a synthetic skip-runId when args.runId is absent.
      const skipEntry: RunHistoryEntry = {
        runId: args.runId,
        step: skipStep,
        epic: stateBefore.lastAttempted.epic,
        story: stateBefore.lastAttempted.story,
        attemptNumber: 1,
        // Per the success-path-shape contract: `outcome` stays "pass";
        // the `skipped: true` marker is the explicit flag.
        outcome: "pass",
        failureCode: null,
        completedAt: nowIso,
        skipped: true,
        // Legacy fields preserved for back-compat.
        verifierStatus: "skip",
        promotedTo: null,
        durationMs: Math.round(performance.now() - startMs),
        tokensIn: args.tokensIn,
        tokensOut: args.tokensOut,
        ts: nowIso,
      };
      const nextLastSuccessfulStep = nextNode
        ? {
            step: nextNode.name,
            epic: stateBefore.lastAttempted.epic,
            story: stateBefore.lastAttempted.story,
            completedAt: nowIso,
          }
        : (stateBefore.lastSuccessfulStep ?? null);
      stateAfter = {
        ...stateBefore,
        lastSuccessfulStep: nextLastSuccessfulStep,
        lastAttempted: null,
        // Per Story 3.1 success-path precedent: clear failure context.
        lastFailureReason: null,
        // Story 5.2: append the skip entry; FIFO-100 trim per the
        // existing trimRunHistory helper.
        runHistory: trimRunHistory([...existingHistory, skipEntry]),
        // checkpoints UNCHANGED — skip does NOT trigger checkpoint
        // append (the just-skipped step did not successfully complete;
        // no Git snapshot is captured per Story 4.8 atomic-write
        // contract — see SK_52_VA_10).
      };
      // Save state under held lock (atomic tmp+rename per AR13 Layer 2).
      await saveState(stateAfter, handle, { statePath: opts?.statePath });
      // Compose the AR9 success line. Single-line (per AR9), exitCode 0.
      const nextStepLabel = nextNode?.name ?? "epic complete";
      actionResult = {
        action: "report",
        message: `↷ ${skipStep} → SKIPPED (next: ${nextStepLabel})`,
        exitCode: 0,
      };
      exitCode = 0;
      // Return EARLY from runVerifyAndAdvance — the skip branch
      // BYPASSES the dispatch-spec read + verifier invocation entirely.
      // The lock release happens in the finally block per AR8 contract.
      return { exitCode, action: actionResult, transcriptPaths, promotedTo };
    }

    // v0.2.2 INVOKE-SKILL PATH: when args.invokeSkillMode is true (the
    // --invoke-skill-mode argv flag forwarded by Layer 1's slash-command
    // markdown), the BMad plugin skill — invoked in-thread by Layer 1
    // via the Skill tool — already wrote its canonical artifact directly.
    // Skip the dispatch-spec read, the verifier invocation, AND the
    // promote step (there is no staging source to copy); just advance
    // state and append a success-marked runHistory entry.
    //
    // Required upstream invariant: `args.lastAttempted` MUST be populated
    // (forwarded via --last-attempted-json from the AR9 invoke-skill
    // action that `run.ts` emitted). Without it we cannot derive the
    // (step, epic, story) tuple for the lastSuccessfulStep advance.
    //
    // The verifier is BYPASSED on this path because the existing
    // per-step verifier configs (defaultVerifiers — glob `**/*.md` +
    // `<stepName>.md` filename convention) target the staging-outputs
    // layout that this path never produces. The BMad plugin skill is
    // the source of truth for its own artifact quality; a future story
    // may add per-step canonical-path verifier overrides via project
    // config.
    if (args.invokeSkillMode === true) {
      if (args.lastAttempted === undefined || args.lastAttempted === null) {
        throw new ConfigError(
          `--invoke-skill-mode requires --last-attempted-json '<JSON>'`,
          JSON.stringify({ invokeSkillMode: true, lastAttempted: null }),
          `Pass --last-attempted-json '<JSON>' alongside --invoke-skill-mode; Layer 1 forwards this from the AR9 invoke-skill line.`,
        );
      }
      const nowIso = opts?.nowIso ?? new Date().toISOString();
      const durationMs = Math.round(performance.now() - startMs);
      const successEntry: RunHistoryEntry = {
        runId: args.runId,
        step: args.lastAttempted.step,
        epic: args.lastAttempted.epic,
        story: args.lastAttempted.story,
        attemptNumber: 1,
        outcome: "pass",
        failureCode: null,
        completedAt: nowIso,
        // verifierStatus: "skip" reflects the verifier-bypass on this
        // path (the BMad plugin skill owns artifact quality; the
        // per-step verifier was not invoked).
        verifierStatus: "skip",
        promotedTo: null,
        durationMs,
        tokensIn: args.tokensIn,
        tokensOut: args.tokensOut,
        ts: nowIso,
      };
      stateAfter = {
        ...stateBefore,
        lastSuccessfulStep: {
          step: args.lastAttempted.step,
          epic: args.lastAttempted.epic,
          story: args.lastAttempted.story,
          completedAt: nowIso,
        },
        lastAttempted: null,
        // Symmetric with the dispatch-path success branch: clear the
        // failure context on success per Story 3.1 AC line 735.
        lastFailureReason: null,
        runHistory: trimRunHistory([
          ...(stateBefore.runHistory ?? []),
          successEntry,
        ]),
        // checkpoints UNCHANGED — invoke-skill mode does NOT trigger
        // checkpoint append on this path (no DAG-resolved phase here;
        // a future story may extend if --checkpoint-each is to apply).
      };
      await saveState(stateAfter, handle, { statePath: opts?.statePath });
      actionResult = {
        action: "report",
        message: `✓ ${args.lastAttempted.step} → invoke-skill (tokens: in=${args.tokensIn} out=${args.tokensOut}, ${durationMs}ms)`,
        exitCode: 0,
      };
      exitCode = 0;
      // Return EARLY — the invoke-skill branch BYPASSES the dispatch-
      // spec read + verifier invocation + promote step entirely. The
      // lock release happens in the finally block per AR8 contract.
      return { exitCode, action: actionResult, transcriptPaths, promotedTo };
    }

    // Step 4: read dispatch-spec.
    dispatchSpec = await readDispatchSpec(stagingRoot, args.runId);

    // Step 5: state-hash TOCTOU check (architecture line 1673).
    const cmp = compareStateHashes(stateBefore, dispatchSpec);
    if (!cmp.match) {
      throw new StateChangedDuringDispatchError(
        `verify-and-advance: state advanced during dispatch (runId=${args.runId})`,
        JSON.stringify({
          currentEpicStory: cmp.currentEpicStory,
          dispatchEpicStory: cmp.dispatchEpicStory,
        }),
      );
    }

    // Step 6 + 7: run verifier with Story 5.1 retry loop. Each attempt
    // appends ONE runHistory[] entry with attemptNumber metadata; on
    // verifier-fail the loop consults the per-step failure policy via
    // dispatchFailureUx; on retry-outcome the loop iterates (with optional
    // re-dispatch via reDispatchOverride for tests) up to maxRetries+1
    // total attempts; on escalate-outcome the loop re-throws
    // VerifierFailureError with the LAST attempt's failure context. The
    // accumulated retry-attempt runHistory entries are persisted on BOTH
    // the success path (Step 10 saveState below) AND the halt path (the
    // catch handler reads `accumulatedRunHistoryFromRetries`).
    const verifierFn = opts?.verifierOverride ?? runVerifier;
    // Story 5.3: --auto-fix (positional argv flag OR test-injection seam)
    // FORCES the per-step failure policy to "route-to-fixer" per
    // architecture line 499 ("Loop-level `--auto-fix` flag overrides
    // per-step policy to `route-to-fixer` for one run").
    //
    // Story 5.6 (FR31 PRIMARY): per-step config-driven resolution joins
    // the priority chain. Priority order per OQ-5:
    //   1. --auto-fix → "route-to-fixer" (one-run scope per AC line 1144)
    //   2. opts.failurePolicyOverride (TEST-ONLY SEAM per OQ-5)
    //   3. resolveFailurePolicy(dispatchSpec.step, opts.config) (production)
    //   4. plugin default "escalate" (resolver fallback per architecture line 499)
    // Until Story 6.1 wires the file loader, opts.config is undefined in
    // production → resolver returns escalate-default for every step.
    const policy: FailurePolicy =
      args.autoFix === true
        ? "route-to-fixer"
        : (opts?.failurePolicyOverride ??
          resolveFailurePolicy(dispatchSpec.step, opts?.config));
    const maxRetries = opts?.maxRetriesOverride ?? 2;
    // Story 5.3: track whether the success path was achieved via a fix
    // attempt so the success-path runHistory entry below can be marked
    // with `fixAttempt: true` per OQ-2; also track the runId to use for
    // the promote() call (the FIXER's runId on fix-success per AC line
    // 1095 "the corrected artifact is promoted").
    let wasFixAttempt = false;
    let finalRunIdForPromote: string = args.runId;

    let attemptNumber = 1;
    while (true) {
      verifierResult = await verifierFn(args.runId, {
        stepName: dispatchSpec.step,
        stagingRoot,
        ...(opts?.config?.verifiers !== undefined
          ? { projectVerifiers: opts.config.verifiers }
          : {}),
      });

      if (verifierResult.status !== "fail") {
        // status === "pass" or "skip" → exit retry loop, proceed to
        // promote + advance. The successful attempt's runHistory entry
        // is built below (single canonical write site).
        break;
      }

      // Verifier failed for this attempt — append a fail-outcome
      // runHistory entry capturing the attempt's metadata. The entry
      // rides the existing saveState() atomic-write path; on escalate
      // the catch handler persists `accumulatedRunHistoryFromRetries`
      // alongside lastFailureReason.
      const completedAtIsoForFail = opts?.nowIso ?? new Date().toISOString();
      const failEntry: RunHistoryEntry = {
        runId: args.runId,
        step: dispatchSpec.step,
        epic: dispatchSpec.epic,
        story: dispatchSpec.story,
        attemptNumber,
        outcome: "fail",
        failureCode: "VERIFIER_FAILURE",
        completedAt: completedAtIsoForFail,
        verifierStatus: "fail",
        promotedTo: null,
        durationMs: Math.round(performance.now() - startMs),
        tokensIn: args.tokensIn,
        tokensOut: args.tokensOut,
        ts: completedAtIsoForFail,
      };
      accumulatedRunHistoryFromRetries.push(failEntry);

      // Resolve the failure-UX outcome via the per-policy dispatcher.
      const failureContext: FailureContext = {
        code: "VERIFIER_FAILURE",
        message: `verify-and-advance: verifier reported fail for run ${args.runId} step ${dispatchSpec.step}`,
        hint: "See _bmad-output/.stepper/runs/<ts>-<step>.log for the verifier output; try /bmad-next --resume after fixing the underlying issue.",
        runId: args.runId,
        step: dispatchSpec.step,
        attemptNumber,
      };
      const outcome = dispatchFailureUx(failureContext, policy, {
        maxRetries,
      });

      if (outcome.outcome === "escalate") {
        // Escalate-after-cap (or escalate policy on attempt 1) — throw
        // VerifierFailureError carrying the LAST attempt's context. The
        // outer catch translates to AR9 halt action; the accumulated
        // failed-attempt runHistory entries flow through the catch
        // handler's stateOnHalt write below.
        //
        // Story 5.4: invoke the formal escalateHandler BEFORE the throw
        // to enrich the actionable hint per the AR22 regex contract
        // `/^.*(Run|See|Try|Check) /` (architecture line 589 + epics.md
        // §Story 5.4 AC line 1113). The enriched hint flows to the
        // catch handler via the `escalateEnrichedHint` closure variable
        // declared above (overrides `err.actionableHint` in the
        // lastFailureReason write + AR9 halt message). PASS-THROUGH
        // common case: the FailureContext.hint above already matches
        // the regex (via "See _bmad-output/.stepper/runs/<ts>-<step>
        // .log" leading "See ").
        const enriched = escalateHandler(failureContext, {});
        if (enriched.outcome === "escalate") {
          escalateEnrichedHint = enriched.reason.hint;
        }
        throw new VerifierFailureError(
          `verify-and-advance: verifier reported fail for run ${args.runId} step ${dispatchSpec.step} after ${attemptNumber} attempt(s) (maxRetries: ${maxRetries})`,
          JSON.stringify(verifierResult),
        );
      }
      // outcome.outcome === "retry" — Story 4.9 SIGINT cooperation:
      // check shutdownRequested BEFORE re-dispatching; on shutdown
      // throw VerifierFailureError carrying the LAST attempt's context
      // so the catch handler persists state cleanly. The loop runner's
      // SIGINT handler (Story 4.9) will then surface manual-sigint.
      if (opts?.shutdownRequested?.() === true) {
        throw new VerifierFailureError(
          `verify-and-advance: shutdown requested mid-retry for run ${args.runId} step ${dispatchSpec.step} after ${attemptNumber} attempt(s)`,
          JSON.stringify(verifierResult),
        );
      }
      // Re-dispatch the SAME dispatch-spec for the next attempt. v0.1
      // production: the same staging/<runId>/dispatch-spec.json file
      // is on disk; the sub-agent overwrites the prior attempt's output
      // at staging/<runId>/outputs/<artifact>. Test path: the
      // reDispatchOverride stub may overwrite the staged artifact to
      // change the next verifier outcome.
      if (outcome.outcome === "retry") {
        attemptNumber = outcome.nextAttempt;
        if (opts?.reDispatchOverride !== undefined) {
          await opts.reDispatchOverride(attemptNumber);
        }
        // Continue the while-loop to invoke the verifier again on the
        // (possibly-new) artifact.
        continue;
      }
      // Story 5.3: route-to-fixer path. Generate the fixer's dispatch-
      // spec at staging/<fixerRunId>/dispatch-spec.json with the AC-
      // mandated CONTEXT entries (verifier-result + original artifact);
      // dispatch the fixer (production: emit AR9 dispatch action for
      // the slash-command markdown to dispatch via Task; test path:
      // invoke the fixerDispatchOverride seam); re-run the original
      // verifier on the fixer's output; on pass exit the loop with
      // success (promote from FIXER staging dir on success path);
      // on post-fix-fail append a SECOND runHistory entry with
      // fixAttempt:true + escalate via VerifierFailureError throw
      // (per AC line 1099 "with both failures recorded").
      if (outcome.outcome === "route-to-fixer") {
        const fixerRunId = outcome.fixerRunId;
        // SIGINT cooperation per Story 4.9 §I-2 — poll
        // shutdownRequested BEFORE invoking the fixer dispatch.
        if (opts?.shutdownRequested?.() === true) {
          // Story 5.4: invoke the formal escalateHandler BEFORE the throw
          // to enrich the actionable hint per the AR22 regex contract.
          const enrichedSigintFix = escalateHandler(failureContext, {});
          if (enrichedSigintFix.outcome === "escalate") {
            escalateEnrichedHint = enrichedSigintFix.reason.hint;
          }
          throw new VerifierFailureError(
            `verify-and-advance: shutdown requested mid-route-to-fixer for run ${args.runId} step ${dispatchSpec.step}`,
            JSON.stringify(verifierResult),
          );
        }
        // Generate the fixer's dispatch-spec at
        // staging/<fixerRunId>/dispatch-spec.json. The dispatch-spec
        // extends the original step's context with the verifier-result
        // + the original-artifact (per AC line 1093 "the failure
        // context (verifier result + artifact excerpt) in its
        // CONTEXT section"). Atomic write via the existing atomicWrite.
        await writeFixerDispatchSpec({
          fixerRunId,
          originalRunId: args.runId,
          originalDispatchSpec: dispatchSpec,
          verifierResultPath: `${stagingRoot}/${args.runId}/verifier-result.json`,
          originalArtifactPath: `${stagingRoot}/${args.runId}/outputs/${dispatchSpec.step}.md`,
          stagingRoot,
        });
        // Test-path: invoke the fixerDispatchOverride seam (which
        // simulates the sub-agent's write to the fix staging dir).
        // Production-path: NO test seam supplied → return early with
        // the AR9 dispatch action for the fixer; the slash-command
        // markdown drives the second AR9 cycle (Bash → AR9 dispatch
        // action for fixer → Task → Bash verify-and-advance for
        // fixer's runId). The current verify-and-advance call returns
        // with action: "dispatch" + runId=fixerRunId.
        if (opts?.fixerDispatchOverride !== undefined) {
          await opts.fixerDispatchOverride(fixerRunId);
        } else {
          // Production: return the fixer dispatch AR9 action; the
          // slash-command markdown will re-invoke verify-and-advance
          // with the fixer's runId. The accumulated retry-attempt
          // runHistory entries (the original verifier-fail entry just
          // appended above) flow through to the catch handler's
          // stateOnHalt write only if we throw; here we return cleanly,
          // so persist the original-fail entry on this return path
          // before returning. The persistence rides the existing
          // saveState contract (atomic-write under held lock).
          if (handle !== undefined && stateBefore !== undefined) {
            try {
              const stateMidFix: State = {
                ...stateBefore,
                runHistory: trimRunHistory([
                  ...(stateBefore.runHistory ?? []),
                  ...accumulatedRunHistoryFromRetries,
                ]),
              };
              await saveState(stateMidFix, handle, {
                statePath: opts?.statePath,
              });
            } catch (saveErr) {
              log.warn(
                `verify-and-advance: failed to persist mid-fix runHistory (non-fatal): ${saveErr instanceof Error ? saveErr.message : String(saveErr)}`,
              );
            }
          }
          return {
            exitCode: 0,
            action: {
              action: "dispatch",
              runId: fixerRunId,
              agent: "bmad-step-fixer",
              lastAttempted: {
                step: dispatchSpec.step,
                epic: dispatchSpec.epic,
                story: dispatchSpec.story,
                attemptedAt: opts?.nowIso ?? new Date().toISOString(),
              },
              exitCode: 0,
            },
            transcriptPaths,
            promotedTo: null,
          };
        }
        // Re-invoke the verifier on the fixer's output (the verifier
        // reads staging/<fixerRunId>/outputs/<artifact> per the
        // dispatch-spec contract); the verifier-result is written to
        // staging/<fixerRunId>/verifier-result.json (NOT overwriting
        // the original verifier-result.json — preserves both failure
        // contexts per AC line 1099).
        const fixerVerifierResult = await verifierFn(fixerRunId, {
          stepName: dispatchSpec.step,
          stagingRoot,
          ...(opts?.config?.verifiers !== undefined
            ? { projectVerifiers: opts.config.verifiers }
            : {}),
        });
        if (fixerVerifierResult.status !== "fail") {
          // Post-fix verifier PASSES — break out of the retry loop;
          // success path will promote from staging/<fixerRunId>/.
          // The success-path runHistory entry below is marked with
          // fixAttempt: true (the wasFixAttempt flag tracks this).
          verifierResult = fixerVerifierResult;
          wasFixAttempt = true;
          finalRunIdForPromote = fixerRunId;
          break;
        }
        // Post-fix verifier FAILS — append a SECOND runHistory entry
        // with fixAttempt: true + outcome: "fail" + failureCode:
        // "VERIFIER_FAILURE" (per OQ-4 two-entry decision); throw
        // VerifierFailureError carrying both failure contexts in the
        // message (per AC line 1099 "with both failures recorded").
        const completedAtIsoForFixFail =
          opts?.nowIso ?? new Date().toISOString();
        const fixFailEntry: RunHistoryEntry = {
          runId: fixerRunId,
          step: dispatchSpec.step,
          epic: dispatchSpec.epic,
          story: dispatchSpec.story,
          // Same attemptNumber as the original verifier-fail attempt
          // (the fix is INTRA-attempt; fixAttempt:true is the
          // forensic distinction).
          attemptNumber,
          outcome: "fail",
          failureCode: "VERIFIER_FAILURE",
          completedAt: completedAtIsoForFixFail,
          fixAttempt: true,
          verifierStatus: "fail",
          promotedTo: null,
          durationMs: Math.round(performance.now() - startMs),
          tokensIn: args.tokensIn,
          tokensOut: args.tokensOut,
          ts: completedAtIsoForFixFail,
        };
        accumulatedRunHistoryFromRetries.push(fixFailEntry);
        // Story 5.4: invoke the formal escalateHandler BEFORE the throw
        // to enrich the actionable hint per the AR22 regex contract.
        // The post-fix-fail FailureContext reuses the original failure
        // context with the fixer-aware message; the enriched hint flows
        // to the catch handler via escalateEnrichedHint closure.
        const enrichedFix = escalateHandler(failureContext, {});
        if (enrichedFix.outcome === "escalate") {
          escalateEnrichedHint = enrichedFix.reason.hint;
        }
        throw new VerifierFailureError(
          `verify-and-advance: post-fix verifier reported fail for run ${args.runId} (fixer ${fixerRunId}) step ${dispatchSpec.step} after fix attempt; original VERIFIER_FAILURE + post-fix VERIFIER_FAILURE`,
          JSON.stringify({
            originalVerifierResult: verifierResult,
            fixerVerifierResult,
          }),
        );
      }
      // Defensive: skip outcomes are state-mutation paths handled
      // BEFORE the retry loop entry (verify-and-advance.ts skip path
      // at lines 689-826). The skip outcome should never reach this
      // branch; this branch is preserved for TypeScript exhaustiveness
      // on the closed FailureUxOutcome union.
      //
      // Story 5.4: invoke the formal escalateHandler BEFORE the throw
      // (defensive — even the unexpected-outcome path's hint must
      // satisfy the AR22 regex contract).
      const enrichedDefensive = escalateHandler(failureContext, {});
      if (enrichedDefensive.outcome === "escalate") {
        escalateEnrichedHint = enrichedDefensive.reason.hint;
      }
      throw new VerifierFailureError(
        `verify-and-advance: unexpected non-retry/non-escalate/non-route-to-fixer outcome from dispatchFailureUx for run ${args.runId} step ${dispatchSpec.step}`,
        JSON.stringify({ outcome, verifierResult }),
      );
    }

    // Step 8: promote artifact (Story 2.6 NEW deliverable).
    // Story 5.3: when wasFixAttempt === true, promote from the FIXER's
    // staging dir (staging/<fixerRunId>/outputs/<artifact>) rather than
    // the original failed artifact at staging/<originalRunId>/outputs/.
    // The promote() function reads sourcePath = stagingRoot/<runId>/
    // outputs/<artifact>, so passing finalRunIdForPromote selects the
    // correct source.
    const promoteResult = await promote({
      runId: finalRunIdForPromote,
      stepName: dispatchSpec.step,
      phase: derivePhaseFromStep(dispatchSpec.step),
      stagingRoot,
      canonicalRoot: opts?.canonicalRoot,
      nowIso: opts?.nowIso,
    });
    promotedTo = promoteResult.promotedTo;

    // Best-effort cleanup of the interactive-step questions stub. When
    // the just-promoted step was flagged `interactive: true`, run.ts
    // wrote `_bmad-output/.stepper/pending-input/<step>.md` and the
    // user (or the loop) filled it before this dispatch fired. The
    // file's purpose ends here — a subsequent re-run of the same step
    // (or a future invocation that picks the step again) should start
    // from a fresh stub. ENOENT is silently swallowed for non-
    // interactive steps; any other error is logged via warn() and
    // ignored (cleanup MUST NOT block state advance).
    const pendingInputDir =
      opts?.pendingInputDir ??
      (opts?.stagingRoot !== undefined
        ? `${opts.stagingRoot.replace(/\/staging\/?$/, "")}/pending-input`
        : undefined);
    const pendingInputFile = questionsPathForStep(
      dispatchSpec.step,
      pendingInputDir,
    );
    try {
      await unlink(pendingInputFile);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        warn(
          `pending-input cleanup failed at ${pendingInputFile}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    // Step 9: advance state. Append runHistory entry for the SUCCESSFUL
    // attempt (attemptNumber captures which attempt actually passed —
    // 1 for first-try, 2 for first-retry-success, etc.), advance
    // lastSuccessfulStep, clear lastAttempted.
    const completedAtIso = opts?.nowIso ?? new Date().toISOString();
    const durationMs = Math.round(performance.now() - startMs);
    const runHistoryEntry: RunHistoryEntry = {
      // Story 5.1: required typed fields per RunHistoryEntrySchema.
      // The retry loop above only breaks on non-fail (pass | skip), so
      // the success-path entry's outcome is always "pass" per the schema
      // (skip is a per-check status, not a per-entry outcome — collapsed
      // to "pass" here for the entry-level outcome).
      // Story 5.3: when wasFixAttempt === true, the runId points at the
      // FIXER's runId (the fixer-success forensic record); the
      // fixAttempt:true marker distinguishes a fix-attempt entry from
      // a normal success or retry-after-success entry.
      runId: wasFixAttempt ? finalRunIdForPromote : args.runId,
      step: dispatchSpec.step,
      epic: dispatchSpec.epic,
      story: dispatchSpec.story,
      attemptNumber,
      outcome: "pass",
      failureCode: null,
      completedAt: completedAtIso,
      // Legacy fields (Story 2.6) — preserved for back-compat readers
      // (Story 4.5 token accumulation; Story 4.x plan-walk completion).
      verifierStatus: verifierResult.status,
      promotedTo,
      durationMs,
      tokensIn: args.tokensIn,
      tokensOut: args.tokensOut,
      ts: completedAtIso,
      // Story 5.3: fix-attempt marker per FR29 + AC line 1096. When
      // wasFixAttempt === true, the success was achieved via the
      // fixer's corrected output (the post-fix verifier passed). The
      // marker is the FORENSIC RECORD that the entry corresponds to a
      // remediation attempt distinct from a normal retry attempt.
      ...(wasFixAttempt ? { fixAttempt: true } : {}),
    };

    // Story 4.8: checkpoint append per --checkpoint-each <step-type>.
    // The just-completed step's phase is looked up via the DAG (when
    // injected) or falls back to derivePhaseFromStep; if the resolved
    // phase matches opts.checkpointEach, capture a Git branch+sha
    // snapshot via detectSnapshot() (Story 1.8) and append to
    // state.checkpoints[] with FIFO-50 trim. The append is silent (no
    // AR9 / no stderr); the user observes the checkpoint via state.yaml
    // inspection or via the exit-reason resume hint (Story 4.10 forward
    // dependency). The append rides on the existing saveState call below
    // — ZERO new write sites; the .bak rotation per AR13 Layer 2 lives
    // where it always has.
    let nextCheckpoints: CheckpointEntry[] = [
      ...((stateBefore.checkpoints ?? []) as CheckpointEntry[]),
    ];
    const matchedPhase = matchCheckpointPhase(
      dispatchSpec.step,
      opts?.dag,
      opts?.checkpointEach,
    );
    if (matchedPhase !== null) {
      let snapshot: Snapshot | null = null;
      try {
        snapshot = await detectSnapshot();
      } catch {
        // OQ-7: detectSnapshot throws inside a confirmed Git work-tree
        // on empty-repo (no commits) or git-binary-missing. Story 4.8
        // v0.1 graceful degradation: skip the checkpoint append (do
        // NOT halt the loop). Forward-tracker for Story 4.10 to surface
        // this via the exit-reason resume hint.
        snapshot = null;
      }
      if (snapshot !== null) {
        const entry: CheckpointEntry = CheckpointEntrySchema.parse({
          branch: snapshot.branch,
          sha: snapshot.sha,
          takenAt: snapshot.takenAt,
          stepType: matchedPhase,
        });
        // FIFO-50 trim: when at-or-over cap (50 entries), drop the
        // OLDEST entry before appending. The .max(50) cap on
        // StateV1Schema.checkpoints[] would otherwise reject a 51st
        // entry on saveState.
        nextCheckpoints.push(entry);
        if (nextCheckpoints.length > 50) {
          nextCheckpoints = nextCheckpoints.slice(nextCheckpoints.length - 50);
        }
      }
    }

    stateAfter = {
      ...stateBefore,
      lastSuccessfulStep: {
        step: dispatchSpec.step,
        epic: dispatchSpec.epic,
        story: dispatchSpec.story,
        completedAt: completedAtIso,
      },
      lastAttempted: null,
      // Story 3.1: clear the failure context on success per AC line 735
      // ("lastSuccessfulStep advances, lastAttempted clears, lastFailureReason
      // clears"). Story 2.6 left this untouched; Story 3.1 closes the gap so
      // a successful step erases prior failure forensics.
      lastFailureReason: null,
      // Story 5.1: prepend any accumulated retry-attempt fail entries
      // before the trailing success entry. Order: existing history first,
      // then per-attempt fails (in attempt order), then the final
      // success entry. The .max(100) cap on RunHistoryEntrySchema FIFO-
      // trims at the schema-validate boundary in saveState; if the
      // resulting array exceeds 100, the schema-parse will reject —
      // mitigated by the trimming below to keep the LATEST 100 entries.
      runHistory: trimRunHistory([
        ...(stateBefore.runHistory ?? []),
        ...accumulatedRunHistoryFromRetries,
        runHistoryEntry,
      ]),
      // Story 4.8: persist the (possibly mutated) checkpoints[] array.
      // When opts.checkpointEach is undefined OR the just-completed
      // step's phase mismatched, nextCheckpoints is the unchanged
      // stateBefore.checkpoints array (no-op write).
      checkpoints: nextCheckpoints,
    };

    // Step 10: save state under held lock (NFR-S5 — atomic write +
    // .bak rotation via saveState → atomicWrite). The Story 4.8
    // checkpoint append rides on this existing write — ZERO new write
    // sites; the .bak rotation per AR13 Layer 2 lives where it always
    // has.
    await saveState(stateAfter, handle, { statePath: opts?.statePath });

    // Step 11: compose AR9 success line per FR18.
    actionResult = {
      action: "report",
      message: `✓ ${dispatchSpec.step} → ${promotedTo} (tokens: in=${args.tokensIn} out=${args.tokensOut}, ${durationMs}ms)`,
      exitCode: 0,
    };
    exitCode = 0;
  } catch (err) {
    if (err instanceof StepperError) {
      outcomeError = err;

      // Story 3.1: persist halt context to state.yaml under the held lock.
      // Best-effort — failure to save the halt context must NOT mask the
      // original outcome (the original error is still surfaced via the AR9
      // halt action's `message` field). The save uses the EXISTING `handle`
      // from `acquire(opts?.lockOptions)` at the top of the try block — no
      // new lock acquisition. Per AR12 + Story 1.6 NFR-S5, `saveState(state,
      // handle, ...)` is the canonical single write point.
      //
      // Guards: the save only runs when (a) `acquire()` succeeded — `handle`
      // defined; AND (b) `loadStateUnlocked()` succeeded — `stateBefore`
      // defined. Halts BEFORE either step (LockContentionError; corrupt
      // state) propagate without writing state.yaml.
      //
      // Field semantics:
      //   - lastSuccessfulStep: UNCHANGED — preserves stateBefore's value
      //     per AC line 732 ("lastSuccessfulStep is cleared to point at the
      //     previous success (unchanged from before the failed attempt)").
      //   - lastAttempted: from `args.lastAttempted` (forwarded by Layer 1
      //     from the AR9 dispatch line); `null` when the flag was absent.
      //   - lastFailureReason: projected from the thrown StepperError's
      //     (code, message, actionableHint, runId) tuple. The hint reuses
      //     `err.actionableHint` — same source-of-truth as the AR9 halt
      //     action's `message` field.
      //
      // Story 5.4 — escalate handler enrichment override: when one of the
      // 4 escalate throw sites set `escalateEnrichedHint` (via the formal
      // escalateHandler from src/failure-ux/escalate.ts), the enriched
      // hint REPLACES `err.actionableHint` in BOTH the lastFailureReason
      // write AND the AR9 halt action's message field below. PASS-THROUGH
      // common case (per OQ-2 audit): the enriched hint equals
      // `err.actionableHint` because all 17 existing StepperError class
      // hints already match the AR22 regex `/^.*(Run|See|Try|Check) /`.
      // The override is the safety-net for FUTURE error classes / per-
      // instance hintOverrides whose hint does NOT match the regex.
      const haltHint = escalateEnrichedHint ?? err.actionableHint;
      if (handle !== undefined && stateBefore !== undefined) {
        try {
          const stateOnHalt: State = {
            ...stateBefore,
            lastAttempted: args.lastAttempted ?? null,
            lastFailureReason: {
              code: err.code,
              message: err.message,
              hint: haltHint,
              runId: args.runId,
            },
            // Story 5.1: persist any per-attempt failed runHistory[]
            // entries accumulated during the retry loop. On escalate-
            // after-cap (or on first-attempt fail with policy=escalate),
            // these entries provide forensic visibility for
            // "this halt was caused by retry exhaustion (vs first-
            // attempt failure)" via the attemptNumber metadata.
            runHistory:
              accumulatedRunHistoryFromRetries.length > 0
                ? trimRunHistory([
                    ...(stateBefore.runHistory ?? []),
                    ...accumulatedRunHistoryFromRetries,
                  ])
                : (stateBefore.runHistory ?? []),
          };
          await saveState(stateOnHalt, handle, {
            statePath: opts?.statePath,
          });
        } catch (saveErr) {
          log.warn(
            `verify-and-advance: failed to persist halt context to state.yaml (non-fatal): ${saveErr instanceof Error ? saveErr.message : String(saveErr)}`,
          );
        }
      }

      const code = err.exitCode;
      // The DispatchActionV1Schema's halt variant requires exitCode >= 1.
      const haltExit = code >= 1 ? code : 1;
      const validExit: 1 | 2 | 3 | 4 | 5 =
        code === 1 || code === 2 || code === 3 || code === 4 || code === 5
          ? code
          : 1;
      exitCode = validExit;
      actionResult = {
        action: "halt",
        // Story 5.4 — escalate-enriched hint override (PASS-THROUGH for
        // all 17 existing classes per OQ-2 audit; safety-net for FUTURE
        // non-matching hints).
        message: haltHint,
        exitCode: haltExit,
      };
    } else {
      // Non-StepperError: rethrow to import.meta.main top-level catch.
      // Best-effort to release the lock + write a transcript first via
      // the finally block before the rethrow propagates.
      try {
        await releaseLockBestEffort(handle, log);
      } finally {
        handle = undefined;
      }
      throw err;
    }
  } finally {
    // Step 12: best-effort transcript write (forensic discipline). Only
    // if we have enough context (handle acquired + stateBefore + dispatchSpec).
    if (
      handle !== undefined &&
      stateBefore !== undefined &&
      dispatchSpec !== undefined
    ) {
      try {
        const subAgentOutput = await readSubAgentOutput(
          stagingRoot,
          args.runId,
          dispatchSpec.step,
          log,
        );
        const writeResult = await writeStepTranscript({
          ...buildTranscriptInput({
            runId: args.runId,
            dispatchSpec,
            stateBefore,
            stateAfter,
            verifierResult,
            subAgentOutput,
            promotedTo,
            tokensIn: args.tokensIn,
            tokensOut: args.tokensOut,
            durationMs: Math.round(performance.now() - startMs),
            outcomeError,
            nowIso: opts?.nowIso,
          }),
          runsRoot: opts?.runsRoot,
        });
        transcriptPaths = {
          markdown: writeResult.markdownPath,
          json: writeResult.jsonPath,
        };
      } catch (writeErr) {
        log.warn(
          `verify-and-advance: transcript write failed (non-fatal): ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`,
        );
      }
    }

    // Step 12.25: Story 6.6 — opt-in telemetry write (best-effort).
    // Gate: opts?.config?.telemetry?.enabled === true (strict-equals per
    // OQ-4 — rejects undefined / false / null / 0 / ""). When disabled
    // (default), this block is SKIPPED → ZERO file system writes (AC-3).
    // The write happens INSIDE the held lock (per OQ-1) so the
    // verifierResult + transcript + telemetry triple is atomic per step.
    // Best-effort try/catch + log.warn (per OQ-8) — a Zod parse error or
    // filesystem ENOSPC must NOT mask the verifier outcome.
    if (
      opts?.config?.telemetry?.enabled === true &&
      handle !== undefined &&
      dispatchSpec !== undefined
    ) {
      try {
        const record: TelemetryRecord = {
          schemaVersion: 1,
          ts: opts?.nowIso ?? new Date().toISOString(),
          step: dispatchSpec.step,
          phase: derivePhaseFromStep(dispatchSpec.step),
          persona: dispatchSpec.taskSpec?.persona ?? "<unspecified>",
          model: dispatchSpec.model ?? "sonnet",
          durationMs: Math.round(performance.now() - startMs),
          verifierStatus: verifierResult?.status ?? "skip",
          retries: accumulatedRunHistoryFromRetries.length,
          tokensIn: args.tokensIn ?? 0,
          tokensOut: args.tokensOut ?? 0,
          ...(outcomeError !== undefined
            ? { errorCode: outcomeError.code }
            : {}),
        };
        const writeFn =
          opts?.writeTelemetryRecordOverride ?? defaultWriteTelemetryRecord;
        await writeFn(record, {
          ...(opts?.telemetryRoot !== undefined
            ? { telemetryRoot: opts.telemetryRoot }
            : {}),
        });
      } catch (telemetryErr) {
        log.warn(
          `verify-and-advance: telemetry write failed (non-fatal): ${telemetryErr instanceof Error ? telemetryErr.message : String(telemetryErr)}`,
        );
      }
    }

    // Step 12.5: best-effort orphan staging cleanup (Story 2.2 carry-over).
    if (handle !== undefined) {
      try {
        await cleanStagingOrphans({ stagingRoot });
      } catch (cleanupErr) {
        log.info(
          `verify-and-advance: orphan staging cleanup failed (non-fatal): ${cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)}`,
        );
      }
    }

    // Step 13: release lock (LAST in the finally block — per AR8 contract).
    await releaseLockBestEffort(handle, log);
  }

  if (actionResult === undefined) {
    // Should be unreachable — the try block sets it on success and the
    // catch block sets it on StepperError; non-StepperError already
    // rethrew in the catch above. Defensive.
    throw new Error(
      "verify-and-advance: internal error — actionResult undefined post-try-finally",
    );
  }

  return { exitCode, action: actionResult, transcriptPaths, promotedTo };
}

/**
 * Best-effort lock release in the finally block. Per Story 1.4 contract,
 * `release()` is idempotent (safe to call multiple times); this helper
 * documents intent + swallows any release error so the original outcome
 * is not masked.
 */
async function releaseLockBestEffort(
  handle: LockHandle | undefined,
  log: LoggerFns,
): Promise<void> {
  if (handle === undefined) return;
  try {
    await handle.release();
  } catch (err) {
    log.warn(
      `verify-and-advance: lock release failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Helper to compose the `TranscriptInput` literal for `writeStepTranscript`
 * (Story 2.5 PRIMARY CALLER carry-over). Centralised so the finally
 * block stays readable.
 */
interface BuildTranscriptInputArgs {
  readonly runId: string;
  readonly dispatchSpec: DispatchSpecV1;
  readonly stateBefore: State;
  readonly stateAfter: State | undefined;
  readonly verifierResult: RunVerifierResult | undefined;
  readonly subAgentOutput: string;
  readonly promotedTo: string | null;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly durationMs: number;
  readonly outcomeError: StepperError | undefined;
  readonly nowIso: string | undefined;
}

function buildTranscriptInput(args: BuildTranscriptInputArgs): {
  readonly runId: string;
  readonly stepName: string;
  readonly epic: number | null;
  readonly story: string | null;
  readonly phase: string | null;
  readonly persona: string | null;
  readonly model: string | null;
  readonly budget: { contextTokens: number; timeoutMs: number } | null;
  readonly inputs: ReadonlyArray<{ path: string; label: string }>;
  readonly subAgentPrompt: string;
  readonly subAgentOutput: string;
  readonly verifierResult: {
    status: "pass" | "fail" | "skip";
    checks: ReadonlyArray<{
      name: string;
      status: "pass" | "fail" | "skip";
      detail: string;
    }>;
    promotedTo: string | null;
  };
  readonly stateBefore: {
    lastSuccessfulStep: string | null;
    lastAttempted: string | null;
  };
  readonly stateAfter: {
    lastSuccessfulStep: string | null;
    lastAttempted: string | null;
  };
  readonly outcome: string;
  readonly durationMs: number;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly errors: ReadonlyArray<unknown>;
  readonly nowIso: string | undefined;
} {
  const inputs: Array<{ path: string; label: string }> = [];
  for (const c of args.dispatchSpec.taskSpec.context as unknown[]) {
    if (typeof c !== "object" || c === null) continue;
    const obj = c as { path?: unknown; label?: unknown };
    if (typeof obj.path !== "string") continue;
    inputs.push({
      path: obj.path,
      label: typeof obj.label === "string" ? obj.label : obj.path,
    });
  }
  const verifierForTranscript: {
    status: "pass" | "fail" | "skip";
    checks: ReadonlyArray<{
      name: string;
      status: "pass" | "fail" | "skip";
      detail: string;
    }>;
    promotedTo: string | null;
  } =
    args.verifierResult !== undefined
      ? {
          status: args.verifierResult.status,
          checks: args.verifierResult.checks,
          promotedTo: args.promotedTo,
        }
      : { status: "skip", checks: [], promotedTo: null };

  const outcome =
    args.outcomeError !== undefined
      ? `✗ Halted: ${args.outcomeError.code} — ${args.outcomeError.message}`
      : `✓ Promoted from staging/${args.runId}/ to ${args.promotedTo ?? "(none)"}.`;

  const stateBeforeProjection = {
    lastSuccessfulStep: args.stateBefore.lastSuccessfulStep?.step ?? null,
    lastAttempted: args.stateBefore.lastAttempted?.step ?? null,
  };
  const stateAfterProjection = {
    lastSuccessfulStep:
      args.stateAfter?.lastSuccessfulStep?.step ??
      args.stateBefore.lastSuccessfulStep?.step ??
      null,
    lastAttempted: args.stateAfter?.lastAttempted?.step ?? null,
  };

  return {
    runId: args.runId,
    stepName: args.dispatchSpec.step,
    epic: args.dispatchSpec.epic ?? null,
    story: args.dispatchSpec.story ?? null,
    phase: derivePhaseFromStep(args.dispatchSpec.step),
    persona: args.dispatchSpec.taskSpec.persona ?? null,
    model: args.dispatchSpec.model ?? null,
    budget: args.dispatchSpec.budget ?? null,
    inputs,
    subAgentPrompt: JSON.stringify(args.dispatchSpec.taskSpec, null, 2),
    subAgentOutput: args.subAgentOutput,
    verifierResult: verifierForTranscript,
    stateBefore: stateBeforeProjection,
    stateAfter: stateAfterProjection,
    outcome,
    durationMs: args.durationMs,
    tokensIn: args.tokensIn,
    tokensOut: args.tokensOut,
    errors: args.outcomeError !== undefined ? [args.outcomeError.toJSON()] : [],
    nowIso: args.nowIso,
  };
}

// Re-export resolvePhaseDir for tests that want to verify the mapping
// without importing dispatch directly. Convenience only — production
// callers go through src/dispatch/index.ts.
export { resolvePhaseDir };

// ─── import.meta.main entrypoint ──────────────────────────────────────────

if (import.meta.main) {
  // The outer entrypoint per Story 1.12 doctor + Story 2.4 run.ts
  // precedent. `runVerifyAndAdvance` returns the structured
  // `VerifyAndAdvanceResult`; the entrypoint emits the AR9 line via
  // `emitDispatchAction` (defence-in-depth — the function validates
  // against `DispatchActionV1Schema.parse()`) and exits with the result
  // code.
  //
  // The top-level catch handles non-StepperError throws (system errors,
  // unexpected failures). StepperError throws are translated to
  // `action: "halt"` by `runVerifyAndAdvance`'s own try/catch (Task 6.3).
  try {
    const result = await runVerifyAndAdvance();
    emitDispatchAction(result.action);
    process.exit(result.exitCode);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    error(`verify-and-advance: unexpected failure: ${message}`);
    process.exit(1);
  }
}
