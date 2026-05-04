/**
 * src/errors.ts — Stepper error class hierarchy + registry (AR21, AR22, AR33).
 *
 * Foundational module per AR41: zero upward imports, no runtime dependencies.
 * Every concrete subclass declares a `code`, `exitCode`, and an `actionableHint`
 * that ends with a concrete next-action verb (Run/See/Try/Check) so that the
 * `errors.test.ts` registry CI gate can enforce the errors-as-primary-UX
 * principle from day one.
 *
 * Exit-code mapping (PRD-mandated, architecture §D11):
 *   1 → halt-with-actionable-error
 *   2 → configuration error
 *   3 → BMAD compatibility error
 *   4 → lock contention
 *   5 → pathological input / budget
 *
 * The `0` value is included in the union for completeness but no error class
 * uses it (an error implies a non-zero exit).
 */

export type StepperErrorCode =
  | "LOCK_CONTENTION"
  | "BRANCH_SWITCH"
  | "BMAD_INCOMPATIBLE"
  | "BMAD_NOT_INSTALLED"
  | "UNKNOWN_BMAD_SKILL"
  | "DAG_CYCLE"
  | "CORRUPT_STATE"
  | "STATE_TOO_NEW"
  | "STATE_CHANGED_DURING_DISPATCH"
  | "VERIFIER_FAILURE"
  | "PATHOLOGICAL_INPUT"
  | "SCOPE_VIOLATION"
  | "BUDGET_EXCEEDED"
  | "TIMEOUT"
  | "CONFIG_ERROR"
  | "MIGRATION_FAILURE";

export type StepperExitCode = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * Abstract base class for every Stepper error. Subclasses declare their
 * `code`, `exitCode`, and `actionableHint` as readonly literal fields. The
 * `detail` field is optional and is consumed only by the run-log writer
 * (Story 1.3 onwards) — main-thread output prints `actionableHint` only.
 */
export abstract class StepperError extends Error {
  abstract readonly code: StepperErrorCode;
  abstract readonly exitCode: StepperExitCode;
  abstract readonly actionableHint: string;
  readonly detail?: string;

  constructor(message: string, detail?: string) {
    super(message);
    this.detail = detail;
    this.name = new.target.name;
  }

  toJSON(): {
    code: StepperErrorCode;
    exitCode: StepperExitCode;
    message: string;
    actionableHint: string;
    detail: string | undefined;
  } {
    return {
      code: this.code,
      exitCode: this.exitCode,
      message: this.message,
      actionableHint: this.actionableHint,
      detail: this.detail,
    };
  }
}

// ─── Concrete subclasses (16 codes — AC-2 fixed list + Story 1.5 ScopeViolationError) ───────

export class LockContentionError extends StepperError {
  override readonly code = "LOCK_CONTENTION" as const;
  override readonly exitCode = 4 as const;
  override readonly actionableHint =
    "Run /bmad-next --doctor to inspect lock state, or /bmad-next --force-unlock if you're sure no other Stepper is running.";
}

export class BranchSwitchError extends StepperError {
  override readonly code = "BRANCH_SWITCH" as const;
  override readonly exitCode = 1 as const;
  override readonly actionableHint =
    "Run /bmad-next --resume to retry on the new branch after reviewing the state delta.";
}

export class BmadIncompatibleError extends StepperError {
  override readonly code = "BMAD_INCOMPATIBLE" as const;
  override readonly exitCode = 3 as const;
  override readonly actionableHint =
    "Run /bmad-next --upgrade to see a Stepper version compatible with your BMAD installation.";
}

export class BmadNotInstalledError extends StepperError {
  override readonly code = "BMAD_NOT_INSTALLED" as const;
  override readonly exitCode = 3 as const;
  override readonly actionableHint =
    "Run npx bmad-method install --tools claude-code first.";
}

export class UnknownBmadSkillError extends StepperError {
  override readonly code = "UNKNOWN_BMAD_SKILL" as const;
  override readonly exitCode = 3 as const;
  override readonly actionableHint =
    "Run /bmad-next --list to see the candidate skills your BMAD installation registers.";
}

export class DagCycleError extends StepperError {
  override readonly code = "DAG_CYCLE" as const;
  override readonly exitCode = 3 as const;
  override readonly actionableHint =
    "See _bmad-output/.stepper/runs/<latest>/log.md for the cycle path; check the bmad-stepper.config.yaml dag.overrides block for circular edges.";
}

export class CorruptStateError extends StepperError {
  override readonly code = "CORRUPT_STATE" as const;
  override readonly exitCode = 1 as const;
  override readonly actionableHint =
    "Run /bmad-next --recompute-state to rebuild the cache from project files.";
}

export class StateTooNewError extends StepperError {
  override readonly code = "STATE_TOO_NEW" as const;
  override readonly exitCode = 1 as const;
  override readonly actionableHint =
    "Run /bmad-next --upgrade to install a Stepper version that supports this schema.";
}

export class StateChangedDuringDispatchError extends StepperError {
  override readonly code = "STATE_CHANGED_DURING_DISPATCH" as const;
  override readonly exitCode = 1 as const;
  override readonly actionableHint =
    "Run /bmad-next --diff-state to see what changed and /bmad-next --resume to retry from the current state.";
}

export class VerifierFailureError extends StepperError {
  override readonly code = "VERIFIER_FAILURE" as const;
  override readonly exitCode = 1 as const;
  override readonly actionableHint =
    "See _bmad-output/.stepper/runs/<ts>-<step>.log for the verifier output; try /bmad-next --resume after fixing the underlying issue.";
}

export class PathologicalInputError extends StepperError {
  override readonly code = "PATHOLOGICAL_INPUT" as const;
  override readonly exitCode = 5 as const;
  override readonly actionableHint =
    "Check the input shape against the schema in _bmad-output/.stepper/runs/<latest>/log.md.";
}

export class ScopeViolationError extends StepperError {
  override readonly code = "SCOPE_VIOLATION" as const;
  override readonly exitCode = 5 as const;
  override readonly actionableHint =
    "Check that the target path is inside _bmad-output/, _bmad-output/.stepper/, or the test tmpdir; see src/io/paths.ts assertWithinScope() for the allowed roots.";
}

export class BudgetExceededError extends StepperError {
  override readonly code = "BUDGET_EXCEEDED" as const;
  override readonly exitCode = 5 as const;
  override readonly actionableHint =
    "See bmad-stepper.config.yaml budgets to raise the per-step limit, or run /bmad-next --resume after pruning the input.";
}

export class TimeoutError extends StepperError {
  override readonly code = "TIMEOUT" as const;
  override readonly exitCode = 1 as const;
  override readonly actionableHint =
    "Run /bmad-next --resume to retry; check bmad-stepper.config.yaml timeouts to extend the per-step deadline.";
}

export class ConfigError extends StepperError {
  override readonly code = "CONFIG_ERROR" as const;
  override readonly exitCode = 2 as const;
  override readonly actionableHint =
    "See bmad-stepper.config.yaml; run /bmad-next --doctor to validate the file against the schema.";
}

export class MigrationFailureError extends StepperError {
  override readonly code = "MIGRATION_FAILURE" as const;
  override readonly exitCode = 2 as const;
  override readonly actionableHint =
    "Run /bmad-next --doctor to inspect the failing migration; restore _bmad-output/.stepper/state.yaml from .bak and re-run the migration.";
}

// ─── Registry ───────────────────────────────────────────────────────────────

/**
 * Registry of every concrete `StepperError` subclass. Iteration via
 * `Object.values(errorRegistry)` powers the `errors.test.ts` CI gate (AR22).
 *
 * Adding a new error class requires:
 *   1. Add the code to the `StepperErrorCode` union above.
 *   2. Implement the subclass extending `StepperError`.
 *   3. Add the class to this registry.
 *   4. Add the code to the test's `REQUIRED_CODES` list.
 */
export const errorRegistry = {
  LockContentionError,
  BranchSwitchError,
  BmadIncompatibleError,
  BmadNotInstalledError,
  UnknownBmadSkillError,
  DagCycleError,
  CorruptStateError,
  StateTooNewError,
  StateChangedDuringDispatchError,
  VerifierFailureError,
  PathologicalInputError,
  ScopeViolationError,
  BudgetExceededError,
  TimeoutError,
  ConfigError,
  MigrationFailureError,
} as const;

export type ErrorRegistry = typeof errorRegistry;
