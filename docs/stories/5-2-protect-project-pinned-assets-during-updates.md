# Story 5.2: Protect Project-Pinned Assets During Updates

## Status

done

## Story

As a project maintainer, I want Stepper to pin project behavior and show update plans before overwriting assets, so that plugin updates do not silently destroy local workflow changes.

## Acceptance Criteria

1. Given a project pins a Stepper version, when Stepper reads project assets, then it can identify the pinned version, and explain how that pin affects expected behavior.
2. Given a newer plugin version has changed command specs, schemas, templates, or docs, when an asset update is considered, then Stepper detects local changes before overwriting files, and distinguishes new upstream changes from project-local modifications.
3. Given local changes exist, when Stepper prepares an update, then it presents a change plan before mutation, and requires user confirmation for overwrites.
4. Given the user rejects or defers an update item, when the update flow completes, then local files remain unchanged for that item, and the decision is captured for audit.

## Dev Notes

- Source requirements: `docs/epics.md` Story 5.2; PRD FR35-FR37; NFR12, NFR19, NFR20, and NFR22.
- Architecture constraints: project-pinned behavior and update plans must protect local project modifications.
- Asset updates are not normal `/bmad-next` step execution. They are maintainer-controlled project asset maintenance with explicit change plans and confirmations.
- Protected assets include command specs, schemas, templates, docs, and any project-pinned Stepper files copied into a target project.

## Tasks/Subtasks

- [x] Add project pin and update policy fields to config schema/template.
- [x] Specify local-change detection, upstream-vs-project-local classification, change plans, overwrite confirmation, and accept/defer/reject decisions.
- [x] Add asset update records to the state schema/template so decisions remain auditable.
- [x] Document project-pinned asset behavior in command specs, command reference, examples, README, CONTRIBUTING, and changelog.
- [x] Self-review Story 5.2 acceptance criteria and record follow-up status.

## Dev Agent Record

- Created this story artifact from Epic 5 project asset requirements.
- Implemented `plugin.pinnedVersion` and `plugin.assetUpdate` as the config contract for update safety.
- Added `assetUpdates` to the state contract for update plans and maintainer decisions.
- Documented that deferred and rejected update items leave local files unchanged and are captured for audit.
- Review iteration 1: clean self-review. No follow-up fixes remained after verifying local-change protection is stated in config schema/template and user-facing docs.

## File List

- `commands/bmad-next.md`
- `commands/bmad-loop.md`
- `docs/command-reference.md`
- `docs/examples.md`
- `README.md`
- `CONTRIBUTING.md`
- `CHANGELOG.md`
- `schemas/config.schema.json`
- `schemas/state.schema.json`
- `templates/bmad-stepper.config.yaml`
- `templates/bmad-stepper.state.yaml`
- `docs/stories/5-2-protect-project-pinned-assets-during-updates.md`
- `docs/stories/sprint-status.yaml`

## Change Log

- 2026-04-29: Specified project-pinned asset update protection and audit decision records.
- 2026-04-29: Added clean self-review record and marked story done.

## Senior Developer Review (AI)

Reviewer: GPT-5.5

Result: Pass. Project-pinned asset behavior now requires a version pin, local-change detection, change-source classification, change plan, overwrite confirmation, and recorded accept/defer/reject decisions.

## Review Follow-ups (AI)

None.
