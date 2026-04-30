# Story 5.1: Define Config and State Templates

## Status

done

## Story

As a solo developer, I want clear `.bmad-stepper/config.yaml` and `.bmad-stepper/state.yaml` templates, so that Stepper behavior and workflow position are explicit and auditable.

## Acceptance Criteria

1. Given a user initializes Stepper assets, when they inspect the config template, then it documents settings for optional steps, repair limits, loop limits, task execution, and output directories, and the schema describes valid values.
2. Given a user inspects the state template, when they compare it with the state schema, then the template represents the active workflow index clearly, and it does not imply that state is stronger evidence than artifacts.
3. Given command specs read configuration, when a setting affects execution, then the command docs explain how the setting changes behavior, and the examples use the same terms as the templates and schemas.
4. Given config or state is invalid, when Stepper evaluates the project, then it stops with a validation-oriented diagnostic, and recommends a repair path.

## Dev Notes

- Source requirements: `docs/epics.md` Story 5.1; PRD FR32-FR34; NFR4, NFR8, NFR9, NFR11, NFR19, NFR20, and NFR21.
- Architecture constraints: prompt-first and script-light; BMAD Method is a prerequisite; optional steps run by default; task sub-agents are sequential in v1; state is an index backed by artifact evidence.
- Epic 4 retrospective asked Epic 5 to keep config and state templates aligned with recovery fields and evidence records.
- Templates and schemas must use the same field names for optional steps, repair limits, loop limits, task execution, output directories, state evidence, run records, checkpoint records, reconcile records, and audit records.

## Tasks/Subtasks

- [x] Expand config template/schema with optional-step policy, repair limits, loop limits, sequential task execution, output directories, review/fix policy, and project pinning.
- [x] Expand state template/schema with state-as-index comments, evidence references, run/task records, validation results, repair/failure records, checkpoints, reconcile decisions, and audit records.
- [x] Document config/state validation diagnostics in command specs, command reference, examples, and README.
- [x] Verify templates, schemas, and command docs use consistent terminology.
- [x] Self-review Story 5.1 acceptance criteria and record follow-up status.

## Dev Agent Record

- Created this story artifact from Epic 5 requirements before marking the work done.
- Implemented template/schema parity for config and state fields that affect execution and recovery.
- Added invalid config/state behavior to `/bmad-next`, inherited behavior in `/bmad-loop`, command reference, examples, and README.
- Review iteration 1: clean self-review. No follow-up fixes remained after checking config/state template terms against schemas and docs.

## File List

- `commands/bmad-next.md`
- `commands/bmad-loop.md`
- `docs/command-reference.md`
- `docs/examples.md`
- `README.md`
- `schemas/config.schema.json`
- `schemas/state.schema.json`
- `schemas/step.schema.json`
- `templates/bmad-stepper.config.yaml`
- `templates/bmad-stepper.state.yaml`
- `docs/stories/5-1-define-config-and-state-templates.md`
- `docs/stories/sprint-status.yaml`

## Change Log

- 2026-04-29: Defined config/state template and schema updates for Epic 5 maintainability and validation diagnostics.
- 2026-04-29: Added clean self-review record and marked story done.

## Senior Developer Review (AI)

Reviewer: GPT-5.5

Result: Pass. Config and state templates now explicitly describe execution controls, output directories, state-as-index behavior, evidence references, and audit records, with matching schema and documentation language.

## Review Follow-ups (AI)

None.
