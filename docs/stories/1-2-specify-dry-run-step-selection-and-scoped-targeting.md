# Story 1.2: Specify Dry-Run Step Selection and Scoped Targeting

## Status

done

## Story

As a solo developer, I want `/bmad-next --dry-run` to select the next BMAD step from workflow, state, and artifacts with optional scope filters, so that I can preview the right next action without manually reconstructing workflow state.

## Acceptance Criteria

1. Given a project with Stepper config, state, and BMAD workflow artifacts, when the user runs `/bmad-next --dry-run` without filters, then the command spec requires Stepper to identify the nearest unfinished BMAD step using workflow order, `.bmad-stepper/state.yaml`, and artifact evidence, and the result explains which inputs were used for selection.
2. Given the user provides `--epic`, `--story`, `--phase`, or `--step`, when `/bmad-next --dry-run` evaluates the project, then step selection is constrained to the requested scope, and the preview reports the active scope filter.
3. Given the requested scope does not match a known workflow target, when dry-run selection occurs, then Stepper stops without mutation, and the output explains that the requested target could not be resolved.
4. Given `.bmad-stepper/state.yaml` and artifact evidence disagree, when dry-run selection attempts to choose a step, then Stepper does not silently trust state alone, and the output identifies the conflict as a blocker for safe step selection.

## Dev Notes

- Source requirements: `docs/epics.md` Story 1.2, PRD FR1-FR4, NFR1, NFR5, NFR8, and NFR24.
- The workflow step is atomic; dry-run can inspect but cannot mutate.
- Selection must combine BMAD workflow order, state as index, and artifact/frontmatter evidence.

## Tasks/Subtasks

- [x] Specify dry-run step selection basis in `commands/bmad-next.md`.
- [x] Specify scope filter behavior for `--epic`, `--story`, `--phase`, and `--step`.
- [x] Document unresolved target and state/artifact conflict stop behavior.
- [x] Add scoped dry-run example with next safe actions.
- [x] Self-review dry-run selection behavior against Story 1.2 acceptance criteria.

## Dev Agent Record

- Expanded `/bmad-next` selection rules to compare workflow order, state index values, and artifact evidence.
- Documented active scope filters and unresolved-target failure behavior.
- Added scoped dry-run example for story targeting and repair guidance.
- Initial self-review pass: no follow-up fixes required after confirming dry-run remains read-only in command spec, reference, and examples.

## File List

- `commands/bmad-next.md`
- `docs/command-reference.md`
- `docs/examples.md`
- `schemas/state.schema.json`
- `docs/stories/1-2-specify-dry-run-step-selection-and-scoped-targeting.md`

## Change Log

- 2026-04-29: Added explicit dry-run selection basis and scope filter stop behavior.
- 2026-04-29: Added self-review record and marked story done after no remaining issues were found.

## Senior Developer Review (AI)

Reviewer: GPT-5.5

Result: Pass. Dry-run selection no longer depends on state alone, scope filters are documented as constraints, unresolved targets stop without mutation, and conflicts block safe selection.

## Review Follow-ups (AI)

None.
