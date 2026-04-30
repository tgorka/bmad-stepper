# Story 5.3: Maintain Schemas and Run Audit Records

## Status

done

## Story

As a maintainer, I want schemas and run records to stay consistent with command behavior, so that Stepper remains reviewable as a prompt-first product surface.

## Acceptance Criteria

1. Given command behavior changes, when schemas are reviewed, then `config.schema.json`, `state.schema.json`, and `step.schema.json` are updated or explicitly confirmed unchanged, and docs, templates, and command specs remain consistent.
2. Given Stepper executes a step or loop, when run records are written, then they preserve selected step, inputs, task outputs, validation results, repairs, failures, and review/fix history, and they contain enough context to understand the run after interruption.
3. Given detailed task records exist, when the main conversation or summary references progress, then the main context can prefer plan, status, and summaries, and detailed evidence remains available in run/task records.
4. Given a user or reviewer audits the repository, when they inspect docs, schemas, templates, and run records, then they can trace how behavior is specified and how completed workflow steps were proven.

## Dev Notes

- Source requirements: `docs/epics.md` Story 5.3; PRD FR42-FR43; NFR10, NFR11, NFR13, NFR19, NFR20, NFR21, and NFR25.
- Architecture constraints: prompt-first product behavior is maintained through command specs, docs, schemas, templates, and audit records until executable validation is justified.
- Run records must preserve selected step, inputs, task outputs, validation results, repairs, failures, review/fix history, and interruption context.
- State remains an index of audit evidence; detailed proof lives in configured run/task/report directories.

## Tasks/Subtasks

- [x] Update schemas for config/state/step behavior changed by Epic 5.
- [x] Expand run record schema language for inputs, validation results, repairs, failures, review/fix history, and interruption context.
- [x] Add audit record indexing for run, task, loop, reconcile, failure, checkpoint, review/fix, and asset-update records.
- [x] Keep command specs, command reference, examples, README, CONTRIBUTING, templates, schemas, and CI consistent with script-light verification.
- [x] Self-review Story 5.3 acceptance criteria and record follow-up status.

## Dev Agent Record

- Created this story artifact from Epic 5 schema and auditability requirements.
- Updated `config.schema.json`, `state.schema.json`, and `step.schema.json` for project pinning, audit records, asset update decisions, and expanded evidence types.
- Added run/audit record requirements to command specs and docs, and kept CI script-light by validating JSON plus required prompt-first asset presence.
- Review iteration 1: clean self-review. No follow-up fixes remained after schema parse verification and cross-doc consistency review.
- Final review fix: tightened schema/spec alignment by requiring step-level `instructions`, task-level `instructions`, task-level `repairPolicy`, and the v1 `optionalSteps: include` invariant.

## File List

- `.github/workflows/ci.yml`
- `commands/bmad-next.md`
- `commands/bmad-loop.md`
- `docs/command-reference.md`
- `docs/examples.md`
- `README.md`
- `CONTRIBUTING.md`
- `CHANGELOG.md`
- `schemas/config.schema.json`
- `schemas/state.schema.json`
- `schemas/step.schema.json`
- `templates/bmad-stepper.config.yaml`
- `templates/bmad-stepper.state.yaml`
- `docs/stories/5-3-maintain-schemas-and-run-audit-records.md`
- `docs/stories/sprint-status.yaml`
- `docs/stories/epic-5-retro-2026-04-29.md`

## Change Log

- 2026-04-29: Updated schemas and prompt-first docs for run audit records, project asset audit records, and script-light CI.
- 2026-04-29: Added clean self-review record and marked story done.
- 2026-04-29: Applied final review findings for schema/spec drift in `step.schema.json` and `config.schema.json`.

## Senior Developer Review (AI)

Reviewer: GPT-5.5

Result: Pass after final review fixes. Schemas, templates, command specs, and docs now describe auditable run/task/review/fix records and project asset update records consistently.

## Review Follow-ups (AI)

- [x] Require step-level `instructions` in `step.schema.json`.
- [x] Require task-level `instructions` and `repairPolicy` in `step.schema.json`.
- [x] Restrict v1 config `optionalSteps` to `include` so `--skip-optional` remains the explicit override.
