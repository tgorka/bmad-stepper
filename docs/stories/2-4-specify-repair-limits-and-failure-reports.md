# Story 2.4: Specify Repair Limits and Failure Reports

## Status

done

## Story

As a solo developer, I want Stepper to retry repair only within configured limits and produce a failure report when repair cannot satisfy the contract, so that failed automation leaves an auditable explanation instead of silent drift.

## Acceptance Criteria

1. Given a task output fails validation, when repair is allowed by configuration, then Stepper may request a repair attempt up to the configured repair limit, and each attempt is recorded.
2. Given a repair attempt succeeds, when validation passes after the repair, then Stepper can continue the current step, and the run record notes the repair history.
3. Given repair attempts reach the configured limit, when the task output still fails validation, then Stepper writes a failure report, and the step remains incomplete.
4. Given the user reviews a failure report, when they inspect the report, then it explains the failed task, expected contract, actual output, attempted repairs, changed files, and recommended next action.

## Dev Notes

- Source requirements: `docs/epics.md` Story 2.4; PRD FR30-FR31; NFR4, NFR6, NFR10, NFR11, NFR15, and NFR20.
- Repair is bounded by `execution.maxRepairIterations`; state repair remains interactive and is not made automatic.
- A failed task may be repaired and revalidated, but the step must not advance while validation is still failing.
- Failure reports must be traceable under the configured runs directory and explain what to do next.

## Tasks/Subtasks

- [x] Define repair attempt behavior and max iteration handling in `/bmad-next`.
- [x] Add repair history and failure report paths to run/task record schemas and templates.
- [x] Document repair success and repair exhaustion examples.
- [x] Ensure `/bmad-loop` stops on repair exhaustion inherited from `/bmad-next`.
- [x] Self-review repair behavior against configured limits and no-auto-state-repair rules.

## Dev Agent Record

- Created this story artifact from Epic 2 planning context and prior task validation stories.
- Implemented repair and failure-report behavior in prompt-first command specs, docs, schemas, and templates.
- Confirmed repair attempts are recorded and exhausted repairs leave the step incomplete.
- Review iteration 1: clean self-review. No follow-up fixes remained after aligning repair limit language across command specs, examples, config, state, and step contracts.

## File List

- `commands/bmad-next.md`
- `commands/bmad-loop.md`
- `docs/command-reference.md`
- `docs/examples.md`
- `schemas/config.schema.json`
- `schemas/state.schema.json`
- `schemas/step.schema.json`
- `templates/bmad-stepper.config.yaml`
- `templates/bmad-stepper.state.yaml`
- `docs/stories/2-4-specify-repair-limits-and-failure-reports.md`

## Change Log

- 2026-04-29: Specified bounded repair attempts, repair history, failure reports, and incomplete-state behavior after repair exhaustion.
- 2026-04-29: Added self-review record and marked story done after no remaining issues were found.

## Senior Developer Review (AI)

Reviewer: GPT-5.5

Result: Pass. The implementation makes repair bounded and auditable, writes failure reports on exhaustion, and prevents state advancement while a task contract remains unsatisfied.

## Review Follow-ups (AI)

None.
