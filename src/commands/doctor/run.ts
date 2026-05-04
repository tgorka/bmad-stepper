/**
 * src/commands/doctor/run.ts — Orchestrator + stderr formatter for the
 * `/bmad-next --doctor` command (FR40, FR41, FR47, FR50, FR53, FR54,
 * AR21, AR22, AR33, AR41).
 *
 * Top-tier module per AR41. Composes the four checks from
 * `./checks.ts` into the canonical 5-line stderr output documented in
 * epics.md AC-1, surfaces errors via `error.actionableHint`, and exits
 * with the appropriate code per FR53.
 *
 * Architecture line 1672 — `run.ts` is **read-only and lock-free**.
 * Doctor never acquires the project lock and never mutates `state.yaml`.
 * The state-file check delegates to `loadStateUnlocked` (NOT
 * `loadState`); only `verify-and-advance.ts` (Story 2.6) acquires the
 * lock, and doctor never advances state.
 *
 * Public surface:
 *   - `runDoctor(opts?)` — testable async entrypoint. Returns
 *                          `DoctorResult { exitCode, results }`. Does
 *                          NOT print or call `process.exit`.
 *   - `DoctorResult`     — `{ exitCode, results: readonly CheckResult[] }`.
 *   - `RunDoctorOptions` — extends `CheckContext` with optional
 *                          logger injection.
 *
 * Outer entrypoint (`if (import.meta.main) { ... }` at the bottom of
 * the file): parses argv via `parseDoctorArgs`, invokes `runDoctor`,
 * writes each `result.line` to stderr in order, and `process.exit`s
 * with `result.exitCode`. The `import.meta.main` guard ensures tests
 * may import the module without auto-executing.
 *
 * Per AR/FR54 + architecture line 1660, ALL diagnostic output goes to
 * **stderr**. The `info()` writer from `src/io/log.ts` is stderr-bound
 * (verified — Story 1.3's design). The runner uses `info()` for the
 * happy-path lines and `error()` for the actionable-hint emit on
 * failure paths. **stdout stays empty** — Story 2.4's `next/run.ts`
 * reserves stdout for the JSON-line dispatch protocol; doctor never
 * emits a dispatch line.
 *
 * Exit code mapping (FR53 verbatim):
 *   - 0 → all checks passed.
 *   - 1 → halt-with-actionable-error (`CORRUPT_STATE`,
 *         `STATE_TOO_NEW`, `MIGRATION_FAILURE`).
 *   - 2 → configuration error (`PARSE_ERROR` from argv).
 *   - 3 → BMAD compatibility error (`BMAD_NOT_INSTALLED`,
 *         `BMAD_INCOMPATIBLE`, `DAG_CYCLE`, `UNKNOWN_BMAD_SKILL`).
 *   - 4 → lock contention (NEVER — doctor is lock-free).
 *   - 5 → pathological input / budget (`PATHOLOGICAL_INPUT`).
 *
 * Per AR33 (architecture line 213), `runDoctor` is `async`; throws are
 * caught at the runner's top-level catch (the `import.meta.main`
 * entrypoint and any caller's try/catch); no `console.*` calls; no
 * `process.exit` inside `runDoctor` (only in the entrypoint block).
 *
 * Architecture cross-references:
 *   - architecture.md §G CLI Surface (lines 553-629) — exit-code
 *     mapping (FR53) + stderr discipline (FR54).
 *   - architecture.md §1672 — `run.ts` is read-only / lock-free.
 *   - architecture.md §1671-1678 — thin-alias `commands/bmad-doctor.md`
 *     delegates to `bun run src/commands/doctor/run.ts -- $ARGUMENTS`.
 *   - architecture.md §FR41 — `--doctor` diagnostic.
 *   - architecture.md §FR53 — exit codes.
 *   - architecture.md §FR54 — stdout/stderr discipline.
 *   - epics.md §Story 1.12 lines 544-557 — verbatim AC-1 5-line format.
 */

import { StepperError } from "../../errors.ts";
import { error, info } from "../../io/log.ts";
import { parseDoctorArgs } from "./args.ts";
import {
  type CheckContext,
  type CheckResult,
  checkProjectName,
  checkStateFile,
  checkStepRegistry,
  detectBmad,
} from "./checks.ts";

/**
 * Aggregate result returned by the testable `runDoctor` entrypoint.
 * Tests assert against this shape directly; the
 * `import.meta.main` block writes `results[*].line` to stderr and
 * exits with `exitCode`.
 *
 * - `exitCode` → one of 0, 1, 3, or 5 in v0.1 (4 = lock contention is
 *               unreachable — doctor is lock-free; 2 = parse error is
 *               handled in the entrypoint before `runDoctor` is
 *               called).
 * - `results` → ordered list of check results. On the success path,
 *               5 entries (4 checks + suggestion). On the error path,
 *               1-N entries representing the checks that ran before
 *               the throw, plus a synthetic error entry whose `line`
 *               is the thrown error's `actionableHint`.
 */
export interface DoctorResult {
  readonly exitCode: 0 | 1 | 3 | 5;
  readonly results: readonly CheckResult[];
}

/**
 * Optional injection bag for `runDoctor`. Extends `CheckContext` so
 * the same escape hatches (projectRoot, homeDir, statePath, etc.)
 * flow through to the check functions.
 *
 * - `logger` → optional override for the `{ info, error }` writers.
 *              Defaults to `src/io/log.ts`'s functions. Tests inject a
 *              capturing logger to assert on the rendered lines.
 */
export interface RunDoctorOptions extends CheckContext {
  readonly logger?: {
    info(message: string): void;
    error(message: string): void;
  };
}

/**
 * Static suggestion line per epics.md AC-1. v0.1 ships this fixed
 * string; a future polish PR may make it context-dependent (e.g.,
 * suggesting `--resume` when the state file shows an in-progress
 * step).
 */
const SUGGESTION_LINE =
  "Suggestion: run /bmad-next to start the analysis phase.";

/**
 * Run the doctor diagnostic suite. Composes the four checks from
 * `./checks.ts`, aggregates the results, and returns a structured
 * `DoctorResult`. The function is read-only and lock-free; safe to
 * invoke from any read-only entrypoint (the `import.meta.main` block,
 * Story 2.4's `next/run.ts` `--doctor` dispatch, Story 4.1's loop
 * pre-flight check).
 *
 * Algorithm:
 *   1. Resolve options against defaults.
 *   2. Run checks in order:
 *      a. checkBmadInstalled — short-circuits to error path on throw.
 *      b. detectBmad (composer for checkStepRegistry).
 *      c. checkProjectName — warn-only by design; errors propagate.
 *      d. checkStateFile — short-circuits on real corruption.
 *      e. checkStepRegistry — short-circuits on cycle / unknown skill.
 *   3. Append the static suggestion line.
 *   4. Return `{ exitCode: 0, results }`.
 *
 * Error path: catches any `StepperError`, appends a synthetic
 * `CheckResult` with `status: "error"` and `line: error.actionableHint`,
 * returns `{ exitCode: error.exitCode, results }`. Non-StepperError
 * throws (system errors, unexpected failures) propagate verbatim — the
 * runner's caller (or the `import.meta.main` block) is responsible for
 * the top-level catch.
 */
export async function runDoctor(
  opts?: RunDoctorOptions,
): Promise<DoctorResult> {
  const ctx: CheckContext = {
    projectRoot: opts?.projectRoot,
    homeDir: opts?.homeDir,
    statePath: opts?.statePath,
    configPath: opts?.configPath,
    overridesPath: opts?.overridesPath,
  };
  const results: CheckResult[] = [];

  try {
    // 1. BMAD installed check (also captures version + skill list for
    //    the registry check downstream).
    const bmad = await detectBmad(ctx);
    results.push({
      name: "bmad-installed",
      status: "ok",
      line: `BMAD detected: v${bmad.version} (compatible)`,
    });

    // 2. Project name check (warn-only).
    const projectName = await checkProjectName(ctx);
    results.push(projectName);

    // 3. State file check.
    const stateFile = await checkStateFile(ctx);
    results.push(stateFile);

    // 4. Step registry / DAG validity check.
    const stepRegistry = await checkStepRegistry(ctx, bmad);
    results.push(stepRegistry);

    // 5. Static suggestion line.
    results.push({
      name: "suggestion",
      status: "ok",
      line: SUGGESTION_LINE,
    });

    return { exitCode: 0, results };
  } catch (err) {
    if (err instanceof StepperError) {
      results.push({
        name: "error",
        status: "error",
        line: err.actionableHint,
        error: err,
      });
      // The five exit codes in `StepperExitCode` (architecture line 559)
      // are { 0, 1, 2, 3, 4, 5 }. Doctor's `runDoctor` may surface
      // 1, 3, or 5 in v0.1 (0 is the success path; 2 is a parser
      // exit handled in the import.meta.main block; 4 is unreachable
      // since doctor is lock-free). The cast narrows the type.
      const code = err.exitCode;
      if (code === 1 || code === 3 || code === 5) {
        return { exitCode: code, results };
      }
      // Defensive default: any other propagating exit code (rare)
      // surfaces as exit 1 to preserve the halt-with-actionable-error
      // contract.
      return { exitCode: 1, results };
    }
    // Non-StepperError throws (e.g., system Error from a malformed
    // BMAD plugin manifest) propagate to the caller — the runner does
    // NOT swallow unexpected exceptions per AR33. The
    // `checkBmadInstalled` named export is consumed by the per-check
    // unit tests via the `./checks.ts` direct import; the runner uses
    // `detectBmad` (the composer) above instead, so we deliberately
    // do not reference `checkBmadInstalled` here.
    throw err;
  }
}

// ─── import.meta.main entrypoint ──────────────────────────────────────────

if (import.meta.main) {
  // Outer entrypoint per architecture §G + epics.md AC-1. Handles argv
  // parsing (exit 2 on PARSE_ERROR), invokes `runDoctor`, writes lines
  // to stderr, and exits with the result code.
  //
  // The entrypoint uses `error()` from `src/io/log.ts` (stderr-bound
  // per Story 1.3) for ALL output — including the success-path lines.
  // This keeps stdout silent per FR54 (stdout is reserved for the
  // JSON-line dispatch protocol; doctor never emits there).
  //
  // The top-level try/catch handles non-StepperError throws (system
  // errors). StepperError throws are already routed through
  // runDoctor's structured error path.
  const argResult = parseDoctorArgs(process.argv.slice(2));
  if (!argResult.ok) {
    error(argResult.error.hint);
    process.exit(2);
  }
  try {
    const result = await runDoctor();
    for (const r of result.results) {
      info(r.line);
    }
    process.exit(result.exitCode);
  } catch (err) {
    // Non-StepperError fallback: surface the message and exit 1
    // (halt-with-actionable-error). The detail goes to the run-log in
    // a future story; v0.1 simply emits the message.
    const message = err instanceof Error ? err.message : String(err);
    error(`doctor: unexpected failure: ${message}`);
    process.exit(1);
  }
}
