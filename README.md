# BMAD Stepper

BMAD Stepper is a Claude Code plugin project for executing BMAD Method workflows one safe step at a time.

It provides slash-command specifications for:

- `/bmad-next`: select and execute the nearest unfinished BMAD workflow step.
- `/bmad-loop`: repeatedly run `/bmad-next` until an explicit stop condition is reached.

BMAD Stepper assumes BMAD Method is already installed in the target project. It does not install BMAD itself.

## Design Principles

- A workflow step is the atomic execution unit.
- Step completion is proven by artifacts, not only by internal state.
- `.bmad-stepper/state.yaml` is an index for workflow position, not the source of truth.
- The main thread orchestrates; task work runs in isolated sub-agent contexts.
- Tasks execute sequentially in v1 to avoid file conflicts and simplify recovery.
- Optional BMAD steps run by default unless explicitly skipped.
- Loops repeat `/bmad-next` transactions toward explicit targets and stop at human checkpoints, missing inputs, ambiguous completion, validation failures, repair limits, max-step limits, or target boundaries.
- State advances only after declared task outputs, artifact evidence, and done criteria validate.
- Failed task validation can be repaired only within configured limits; exhausted repair writes a failure report and leaves the step incomplete.
- State/artifact conflicts block downstream work until reconcile, diagnostic review, or a user-confirmed repair path resolves them.
- Interrupted runs offer resume, restart, abandon, or reconcile, and re-entry reuses proven artifacts instead of duplicating completed work.
- Project-pinned Stepper assets are protected: updates detect local changes, show a change plan, require confirmation before overwrites, and record accept/defer/reject decisions.
- Run records, task outputs, validation results, repairs, failures, review/fix history, checkpoints, reconcile decisions, and asset update decisions are audit evidence under `.bmad-stepper/runs`.

## First-Run Path

1. Confirm BMAD Method is already installed in the target project. Stepper expects BMAD files such as `_bmad/core/config.yaml`; it will diagnose missing prerequisites and stop, not install BMAD.
2. Install the BMAD Stepper plugin or copy the command specifications from `commands/` into your Claude Code command location.
3. Create `.bmad-stepper/config.yaml` from `templates/bmad-stepper.config.yaml` and verify `bmad.configPath` points to the target project's BMAD config. Review optional-step policy, repair limits, loop limits, sequential task execution, output directories, review/fix history, and `plugin.pinnedVersion`.
4. Create `.bmad-stepper/state.yaml` from `templates/bmad-stepper.state.yaml`. Treat it as the workflow index that Stepper will compare against artifacts and frontmatter; run/task/audit records remain the detailed proof.
5. Run `/bmad-next --dry-run`. The preview should show prerequisite status, selected step, scope filter, required inputs, expected outputs, planned tasks, completion evidence, stop conditions, conflicts, mutation scope, and a confirmation that no files were modified.
6. If the preview is safe, run `/bmad-next` to execute exactly one workflow step. Stepper loads the step contract, runs declared tasks sequentially, validates task outputs and mutation scope, repairs only within configured limits, and updates state only after evidence passes. Use scoped flags such as `--story <id>` or `--step <id>` when you want to constrain selection.
7. Use `/bmad-loop --until story:<id> --dry-run` to preview bounded repeated execution before running a loop. Loop targets can be `next-story`, `story:<id>`, `story-range:<start>-<end>`, `epic:<id>`, `phase:<name>`, or `step:<id>`.
8. If state and artifacts disagree, run `/bmad-next --reconcile` and choose a repair path before continuing. Mutation choices such as update state, trust artifacts, rerun step, or skip step require confirmation; diagnostic mode is read-only.
9. If a prior run was interrupted, choose resume, restart, abandon, or reconcile. Resume must reuse proven artifacts and retry only unproven outputs.

## Trust Boundary

Stepper can prove that declared workflow artifacts, frontmatter, run records, and task outputs satisfy a step contract. It cannot prove the semantic quality of product decisions or implementation choices by itself. Human review, tests, and BMAD checkpoints remain part of the trust model.

## Documentation

- `docs/command-reference.md` lists command intent, inputs, outputs, state changes, mutation scope, stop conditions, and failure behavior.
- `docs/examples.md` shows preview, scoped dry-run, prerequisite failure, trust boundary, safe next action, loop, optional-step, conflict, reconcile, diagnostic, interrupted-run, and idempotent re-entry examples.
- `templates/` and `schemas/` define the first-run project files and auditable contracts.
- Project-pinned asset updates must keep `commands/`, `docs/`, `schemas/`, and `templates/` consistent and local-change safe.

## Status

This repository contains the v1 project scaffold and command design. The v1 implementation is prompt-first and script-light; TypeScript/Bun should be added only when schema validation, fixture tests, generated docs, or release automation require it.

## License

Apache-2.0. See `LICENSE`.
