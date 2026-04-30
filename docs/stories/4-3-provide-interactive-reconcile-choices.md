# Story 4.3: Provide Interactive Reconcile Choices

## Status

done

## Story

As a solo developer, I want an interactive reconcile flow when state and artifacts disagree, so that I can choose how to repair or proceed with full context.

## Acceptance Criteria

1. Given a state/artifact conflict is detected, when Stepper enters reconcile mode, then it shows what state says, what artifacts say, and why they disagree, and it recommends a safe default action.
2. Given reconcile choices are presented, when the user selects update state, trust artifacts, rerun step, skip step, or diagnostic, then Stepper follows the selected path only after user confirmation, and records the choice in the run or repair record.
3. Given a repair choice would mutate state or files, when the user has not confirmed it, then Stepper does not apply the repair automatically, and the prompt explains the pending mutation.
4. Given diagnostic mode is selected, when Stepper inspects the conflict, then it produces a report of evidence sources and possible repair paths, and does not change workflow state.

## Dev Notes

- Source requirements: `docs/epics.md` Story 4.3; PRD FR20-FR22; NFR2, NFR6, NFR9, NFR11, NFR15, and NFR20.
- Fully automatic state repair is out of scope for v1.
- Reconcile must distinguish read-only diagnostic reporting from mutation choices.
- Mutation choices include state, artifact, checkpoint, run record, or repair record changes.

## Tasks/Subtasks

- [x] Specify `/bmad-next --reconcile` choices and confirmation requirements.
- [x] Require diagnostic mode to be read-only.
- [x] Add reconcile decisions and output directories to schemas and templates.
- [x] Document reconcile, diagnostic, and conflict examples in command reference and examples.
- [x] Self-review reconcile behavior against no-automatic-repair requirements.

## Dev Agent Record

- Created this story artifact after Story 4.2 made conflicts blocking.
- Implemented reconcile choices: update state, trust artifacts, rerun step, skip step, and diagnostic.
- Required explicit confirmation before any state or file mutation and documented diagnostic as read-only.
- Added `reconcileDecisions`, `reconcileReportsDir`, and `diagnosticsDir` schema/template support.
- Review iteration 1: clean self-review. No follow-up fixes remained after checking that mutation paths always require confirmation.

## File List

- `commands/bmad-next.md`
- `docs/command-reference.md`
- `docs/examples.md`
- `README.md`
- `schemas/config.schema.json`
- `schemas/state.schema.json`
- `templates/bmad-stepper.config.yaml`
- `templates/bmad-stepper.state.yaml`
- `docs/stories/4-3-provide-interactive-reconcile-choices.md`

## Change Log

- 2026-04-29: Specified interactive reconcile choices, confirmation requirements, read-only diagnostics, and reconcile decision records.
- 2026-04-29: Added self-review record and marked story done after no remaining issues were found.

## Senior Developer Review (AI)

Reviewer: GPT-5.5

Result: Pass. The implementation keeps reconcile interactive, makes diagnostic mode read-only, and prevents unconfirmed state or artifact mutation.

## Review Follow-ups (AI)

None.
