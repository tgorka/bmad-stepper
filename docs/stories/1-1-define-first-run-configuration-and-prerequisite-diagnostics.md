# Story 1.1: Define First-Run Configuration and Prerequisite Diagnostics

## Status

done

## Story

As a solo developer, I want Stepper to define the minimum first-run setup and diagnose missing BMAD prerequisites, so that I can know whether `/bmad-next --dry-run` can safely evaluate my project.

## Acceptance Criteria

1. Given a target project where Stepper is being used for the first time, when the user follows the first-run setup guidance, then the required `.bmad-stepper/config.yaml` and `.bmad-stepper/state.yaml` expectations are clear, and the documentation explains that BMAD Method must already be installed.
2. Given required BMAD files are missing from the target project, when `/bmad-next --dry-run` is specified, then the command spec requires Stepper to stop before selecting or executing a workflow step, and the diagnostic output identifies the missing prerequisite category and recommended repair.
3. Given BMAD prerequisites appear present, when `/bmad-next --dry-run` is specified, then the command spec allows Stepper to continue into workflow/state/artifact inspection, and no project files are modified during this prerequisite check.
4. Given a maintainer reviews the command and docs, when they compare prerequisite behavior across README, command reference, and examples, then the behavior is consistent and does not imply Stepper installs BMAD Method.

## Dev Notes

- Source requirements: `docs/epics.md` Story 1.1, PRD FR5/FR38, NFR14, and architecture constraints that BMAD Method is a prerequisite.
- Keep v1 prompt-first and script-light; no runtime, installer, or generated files.
- State remains an index; prerequisite checks must complete before step selection or mutation.

## Tasks/Subtasks

- [x] Clarify first-run setup in `README.md`.
- [x] Make `/bmad-next --dry-run` prerequisite diagnostics explicit in `commands/bmad-next.md`.
- [x] Align command reference and examples with missing-BMAD stop behavior.
- [x] Add template/schema guidance that BMAD is required and externally installed.
- [x] Self-review consistency across README, command specs, examples, templates, and schemas.

## Dev Agent Record

- Created the story artifact from Epic 1 planning context.
- Implemented prompt-first product surface updates only.
- Verified the docs state Stepper diagnoses missing BMAD prerequisites and does not install BMAD.
- Initial self-review pass: no follow-up fixes required after aligning README, command reference, examples, template comments, and schema descriptions.

## File List

- `README.md`
- `commands/bmad-next.md`
- `docs/command-reference.md`
- `docs/examples.md`
- `templates/bmad-stepper.config.yaml`
- `templates/bmad-stepper.state.yaml`
- `schemas/config.schema.json`
- `schemas/state.schema.json`
- `docs/stories/1-1-define-first-run-configuration-and-prerequisite-diagnostics.md`

## Change Log

- 2026-04-29: Added first-run path, prerequisite categories, dry-run stop behavior, and missing-BMAD repair guidance.
- 2026-04-29: Added self-review record and marked story done after no remaining issues were found.

## Senior Developer Review (AI)

Reviewer: GPT-5.5

Result: Pass. The implementation keeps BMAD Method as a prerequisite, defines config/state expectations, and ensures dry-run stops before selection or mutation when prerequisites are missing. The behavior is consistent across README, command spec, command reference, examples, templates, and schemas.

## Review Follow-ups (AI)

None.
