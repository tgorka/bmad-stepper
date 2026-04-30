# Story 2.1: Specify Single-Step Transaction Execution

## Status

done

## Story

As a solo developer, I want `/bmad-next` to execute exactly one selected BMAD step as a transaction, so that workflow progress is recorded only when the required evidence proves the step is complete.

## Acceptance Criteria

1. Given `/bmad-next` has selected a step, when execution begins, then the command spec requires Stepper to load the step persona, instructions, inputs, outputs, tasks, done criteria, review policy, and next transitions, and the command executes no more than the selected step.
2. Given the selected step is optional, when the user does not pass `--skip-optional`, then Stepper includes the optional step in normal execution, and the run record notes that default optional-step behavior was used.
3. Given the selected step reaches its done criteria, when required artifacts or frontmatter evidence are present, then Stepper may update `.bmad-stepper/state.yaml`, and the update records the completed step and supporting evidence.
4. Given required inputs are missing, completion is ambiguous, or a human decision is needed, when `/bmad-next` executes, then Stepper stops without marking the step complete, and the stop report explains what blocked the transaction.

## Dev Notes

- Source requirements: `docs/epics.md` Story 2.1; PRD FR6-FR10; NFR6, NFR8, NFR9, NFR14, NFR19; and architecture constraints that workflow steps are atomic and state is only an index.
- Keep BMAD Method as a prerequisite. Execution starts only after prerequisite diagnostics, state/artifact comparison, and step selection prove a safe candidate.
- The one-step transaction lifecycle must be explicit: select, prepare context, execute tasks, validate outputs, confirm completion evidence, then update state.
- Optional BMAD steps are included by default unless `--skip-optional` is requested.

## Tasks/Subtasks

- [x] Expand `/bmad-next` execution behavior into a one-step transaction lifecycle.
- [x] Specify required step context loading: persona, instructions, inputs, outputs, tasks, done criteria, review policy, and transitions.
- [x] Add run/state template and schema support for selected step, optional-step policy, completion evidence, and state updates after validation.
- [x] Align command reference, examples, and README with single-step execution behavior.
- [x] Self-review the transaction contract for consistency with Epic 1 trust boundaries.

## Dev Agent Record

- Created this story artifact from Epic 2 planning context.
- Implemented prompt-first updates in command specs, documentation, templates, and schemas; no runtime or package harness was added.
- Confirmed the execution contract still treats a workflow step as the atomic unit and only advances state after declared evidence passes.
- Review iteration 1: clean self-review. No follow-up fixes remained after aligning `/bmad-next`, docs, schemas, and templates around the same lifecycle.

## File List

- `README.md`
- `commands/bmad-next.md`
- `commands/bmad-loop.md`
- `docs/command-reference.md`
- `docs/examples.md`
- `schemas/config.schema.json`
- `schemas/state.schema.json`
- `schemas/step.schema.json`
- `templates/bmad-stepper.config.yaml`
- `templates/bmad-stepper.state.yaml`
- `docs/stories/2-1-specify-single-step-transaction-execution.md`

## Change Log

- 2026-04-29: Specified `/bmad-next` as a single-step transaction with evidence-backed state advancement.
- 2026-04-29: Added self-review record and marked story done after no remaining issues were found.

## Senior Developer Review (AI)

Reviewer: GPT-5.5

Result: Pass. The implementation makes the single selected step the transaction boundary, keeps optional steps included by default, and requires completion evidence before any state update. It remains prompt-first and does not introduce runtime behavior beyond the product contract.

## Review Follow-ups (AI)

None.
