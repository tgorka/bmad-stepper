# Story 2.2: Specify Sequential Task Sub-Agent Orchestration

## Status

done

## Story

As a solo developer, I want Stepper to run task sub-agents sequentially within a BMAD step, so that task dependencies are explicit and file conflicts are easier to reason about.

## Acceptance Criteria

1. Given a step declares multiple tasks, when `/bmad-next` executes the step, then Stepper starts the tasks one at a time in declared order, and it does not run v1 task sub-agents in parallel.
2. Given a task produces an output used by a later task, when the next task begins, then Stepper passes the prior output as an explicit input, and the task record identifies the source output.
3. Given a task sub-agent completes, when Stepper records the result, then the task output includes a self-check for persona used, inputs read, outputs produced, and scope respected, and missing self-check information is treated as a validation problem.
4. Given a task cannot start because a prior task failed validation, when Stepper evaluates the task pipeline, then later tasks are not started, and the stop report identifies the failed upstream task.

## Dev Notes

- Source requirements: `docs/epics.md` Story 2.2; PRD FR25-FR29; NFR16 and NFR18; and `AGENTS.md` rule to execute task sub-agents sequentially in v1.
- The main thread remains the orchestrator. Detailed task work belongs in run/task records.
- Each task contract needs persona, explicit inputs, downstream input mapping, allowed paths, required outputs, and a self-check.
- Later tasks must not start after an upstream validation failure.

## Tasks/Subtasks

- [x] Define sequential task orchestration in `/bmad-next`.
- [x] Add explicit downstream input passing and source-output references to the task contract.
- [x] Require task self-check fields for persona, inputs read, outputs produced, and scope respected.
- [x] Add state/schema/template fields for task records and sequential execution policy.
- [x] Self-review task orchestration against v1 no-parallel-sub-agent constraint.

## Dev Agent Record

- Created this story artifact from Epic 2 planning context and the prior Story 2.1 transaction model.
- Implemented task execution contracts in prompt-first command docs and schemas without adding runtime code.
- Verified that downstream inputs are explicit and task validation failure prevents later task startup.
- Review iteration 1: clean self-review. No follow-up fixes remained after checking command spec, command reference, schema, and templates for consistent wording.

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
- `docs/stories/2-2-specify-sequential-task-sub-agent-orchestration.md`

## Change Log

- 2026-04-29: Specified sequential task sub-agent orchestration, explicit downstream inputs, and required self-checks.
- 2026-04-29: Added self-review record and marked story done after no remaining issues were found.

## Senior Developer Review (AI)

Reviewer: GPT-5.5

Result: Pass. The implementation preserves sequential task execution in v1, documents explicit task input/output handoff, and treats missing self-check information as validation failure.

## Review Follow-ups (AI)

None.
