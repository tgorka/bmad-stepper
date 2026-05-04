/**
 * src/state/export.ts — `--export-state` JSON projection helper
 * (FR4, FR52, FR54, NFR-M3, AR8, AR11, AR20, AR33, AR41).
 *
 * Mid-tier module per AR41. Composes `loadStateUnlocked + project +
 * StateExportV1Schema.parse`. Pure / async; no I/O writes; lock-free.
 *
 * Maps the on-disk `State` value into the schema-versioned 7-field
 * `StateExportV1` wire shape per Story 3.8 AC line 850. The mapping
 * follows the precedence chain documented in the story spec:
 *   - `currentPhase`: derived via the optional `dagNodePhase(stepName)`
 *     callback (when present). Without a callback (or when the lookup
 *     returns `null`), `currentPhase = null`. The runner-side short-circuit
 *     in `src/commands/next/run.ts` builds the DAG and passes the lookup;
 *     direct callers of `exportState` (e.g., test fixtures) typically pass
 *     no callback and accept `null`.
 *   - `activeEpic`: `state.lastSuccessfulStep?.epic ?? state.lastAttempted?.epic ?? null`.
 *     "Successful" takes precedence over "attempted" because the runner
 *     clears `lastAttempted` on success per Story 3.1.
 *   - `lastSuccessfulStep`, `lastAttempted`, `lastFailureReason`: pass-through
 *     from the cached state.
 *   - `bmadVersion`: pass-through from `state.project.bmadVersion`. Preserves
 *     the `"unknown"` placeholder verbatim per FR4 wording "export the current
 *     state". CI scripts can detect + surface a "BMAD version not yet
 *     resolved by `--doctor`" warning.
 *   - `stepperVersion`: sourced from `STEPPER_VERSION` constant in
 *     `src/version.ts` (Story 3.8 + Story 6.10).
 *
 * Defence-in-depth: `StateExportV1Schema.parse(...)` is called BEFORE
 * returning so the wire shape is guaranteed valid against the AR20
 * schema-versioned discipline. The runner-side `import.meta.main` block
 * emits the JSON body DIRECTLY on stdout (NOT wrapped in the AR9 line)
 * per FR54 + architecture §line 524 + §line 862; the function itself
 * returns the typed value so colocated tests can inspect it without
 * mutating process state.
 *
 * Lock-free: ZERO interaction with `src/lock/`. Uses `loadStateUnlocked`
 * exclusively. AR8 + AR41 boundaries preserved.
 */

import type { Phase } from "../dag/types.ts";
import type { StateExportV1 } from "../schemas/state-export.ts";
import { StateExportV1Schema } from "../schemas/state-export.ts";
import { STEPPER_VERSION } from "../version.ts";
import { type LoadStateOptions, loadStateUnlocked } from "./load.ts";

export interface ExportStateOptions extends LoadStateOptions {
  /**
   * Optional callback to resolve a DAG node's `phase` from its `step`
   * name. When provided AND `state.lastSuccessfulStep` is non-null, the
   * `currentPhase` field is populated via this lookup. Without a callback,
   * `currentPhase` is `null` (graceful degradation for test fixtures + edge
   * cases). The runner-side short-circuit constructs the callback inline
   * via `dag.nodes.get(name)?.phase ?? null`.
   */
  readonly dagNodePhase?: (stepName: string) => Phase | null;
}

/**
 * Project the cached `State` into the `StateExportV1` wire shape. Reads
 * `state.yaml` via `loadStateUnlocked`, applies the field projection, runs
 * defence-in-depth Zod validation, returns the typed value.
 *
 * @throws same error set as `loadStateUnlocked` (CorruptStateError,
 *   StateTooNewError, MigrationFailureError, PathologicalInputError).
 *   NEVER LockContentionError (the helper never acquires the lock).
 */
export async function exportState(
  opts?: ExportStateOptions,
): Promise<StateExportV1> {
  const state = await loadStateUnlocked({
    ...(opts?.statePath !== undefined ? { statePath: opts.statePath } : {}),
    ...(opts?.warnSizeBytes !== undefined
      ? { warnSizeBytes: opts.warnSizeBytes }
      : {}),
    ...(opts?.haltSizeBytes !== undefined
      ? { haltSizeBytes: opts.haltSizeBytes }
      : {}),
    ...(opts?.lockOptions !== undefined
      ? { lockOptions: opts.lockOptions }
      : {}),
    ...(opts?.logger !== undefined ? { logger: opts.logger } : {}),
  });

  const lastSuccessfulStep = state.lastSuccessfulStep ?? null;
  const lastAttempted = state.lastAttempted ?? null;
  const lastFailureReason = state.lastFailureReason ?? null;

  // currentPhase: optional callback lookup; null when no successful step or
  // the callback returns null (or no callback at all).
  let currentPhase: Phase | null = null;
  if (lastSuccessfulStep !== null && opts?.dagNodePhase !== undefined) {
    currentPhase = opts.dagNodePhase(lastSuccessfulStep.step);
  }

  // activeEpic precedence: lastSuccessfulStep > lastAttempted > null. The
  // runner clears `lastAttempted` on success per Story 3.1, so a non-null
  // `lastSuccessfulStep` is always more recent than any earlier attempt.
  const activeEpic = lastSuccessfulStep?.epic ?? lastAttempted?.epic ?? null;

  const exported: StateExportV1 = {
    schemaVersion: 1,
    currentPhase,
    activeEpic,
    lastSuccessfulStep,
    lastAttempted,
    lastFailureReason,
    bmadVersion: state.project.bmadVersion,
    stepperVersion: STEPPER_VERSION,
  };

  // Defence-in-depth: validate the wire shape before returning.
  return StateExportV1Schema.parse(exported);
}
