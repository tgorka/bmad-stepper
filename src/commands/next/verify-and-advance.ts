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

import {
  cleanStagingOrphans,
  emitDispatchAction,
  promote,
  resolvePhaseDir,
} from "../../dispatch/index.ts";
import {
  ConfigError,
  StateChangedDuringDispatchError,
  StepperError,
  VerifierFailureError,
} from "../../errors.ts";
import { error, info, warn } from "../../io/log.ts";
import { STAGING_PATH } from "../../io/paths.ts";
import { acquire, type LockHandle, type LockOptions } from "../../lock/lock.ts";
import { writeStepTranscript } from "../../runs/index.ts";
import type { DispatchActionV1 } from "../../schemas/dispatch-protocol.ts";
import {
  type DispatchSpecV1,
  DispatchSpecV1Schema,
} from "../../schemas/dispatch-spec.ts";
import type { State } from "../../schemas/state.ts";
import { loadStateUnlocked } from "../../state/load.ts";
import { saveState } from "../../state/save.ts";
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
 * v0.1 RunHistoryEntry shape per Task 5.9 + epic AC line 677 ("tokens are
 * recorded into runHistory[]"). The Story 1.5 `StateV1Schema` declares
 * `runHistory: z.array(z.unknown())` — structurally loose, so the entry
 * is appended verbatim. A future Story 6.x schema bump may tighten the
 * shape; Story 2.6 v0.1 ships the structured literal.
 */
interface RunHistoryEntry {
  runId: string;
  step: string;
  epic: number;
  story: string;
  verifierStatus: "pass" | "fail" | "skip";
  promotedTo: string | null;
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
  ts: string;
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

  try {
    // Step 2: acquire lock. The lock-acquired contract is positive (must
    // call exactly ONCE per runVerifyAndAdvance invocation). On
    // LockContentionError, the outer catch translates to action: "halt"
    // with exitCode: 4.
    handle = await acquire(opts?.lockOptions);

    // Step 3: read state via loadStateUnlocked (NOT loadState — that
    // would attempt to acquire a second lock and throw LockContentionError).
    stateBefore = await loadStateUnlocked({ statePath: opts?.statePath });

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

    // Step 6: run verifier (Story 2.1 PRIMARY CONSUMER carry-over).
    verifierResult = await runVerifier(args.runId, {
      stepName: dispatchSpec.step,
      stagingRoot,
    });

    // Step 7: branch on verifier status.
    if (verifierResult.status === "fail") {
      throw new VerifierFailureError(
        `verify-and-advance: verifier reported fail for run ${args.runId} step ${dispatchSpec.step}`,
        JSON.stringify(verifierResult),
      );
    }
    // status === "pass" or "skip" → proceed to promote + advance.

    // Step 8: promote artifact (Story 2.6 NEW deliverable).
    const promoteResult = await promote({
      runId: args.runId,
      stepName: dispatchSpec.step,
      phase: derivePhaseFromStep(dispatchSpec.step),
      stagingRoot,
      canonicalRoot: opts?.canonicalRoot,
      nowIso: opts?.nowIso,
    });
    promotedTo = promoteResult.promotedTo;

    // Step 9: advance state. Append runHistory entry, advance
    // lastSuccessfulStep, clear lastAttempted.
    const completedAtIso = opts?.nowIso ?? new Date().toISOString();
    const durationMs = Math.round(performance.now() - startMs);
    const runHistoryEntry: RunHistoryEntry = {
      runId: args.runId,
      step: dispatchSpec.step,
      epic: dispatchSpec.epic,
      story: dispatchSpec.story,
      verifierStatus: verifierResult.status,
      promotedTo,
      durationMs,
      tokensIn: args.tokensIn,
      tokensOut: args.tokensOut,
      ts: completedAtIso,
    };
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
      runHistory: [...(stateBefore.runHistory ?? []), runHistoryEntry],
    };

    // Step 10: save state under held lock (NFR-S5 — atomic write +
    // .bak rotation via saveState → atomicWrite).
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
      if (handle !== undefined && stateBefore !== undefined) {
        try {
          const stateOnHalt: State = {
            ...stateBefore,
            lastAttempted: args.lastAttempted ?? null,
            lastFailureReason: {
              code: err.code,
              message: err.message,
              hint: err.actionableHint,
              runId: args.runId,
            },
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
        message: err.actionableHint,
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
