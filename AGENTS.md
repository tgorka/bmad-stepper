# Agent Instructions

BMAD Stepper is a prompt-first Claude Code plugin project for BMAD Method workflow execution.

## Project Rules

- Assume BMAD Method is installed by the target project. Do not design Stepper as a BMAD installer.
- Treat a workflow step as the atomic execution unit.
- Treat artifacts and frontmatter as proof of completion; treat `.bmad-stepper/state.yaml` as an index.
- Use interactive repair when state and artifacts conflict.
- Run optional steps by default unless `--skip-optional` is requested.
- Execute task sub-agents sequentially in v1.
- Stop loops on human checkpoints, missing inputs, ambiguous completion, failed validation, and repair limits.
- Keep the project script-light until validation or automation needs justify TypeScript/Bun.

## Editing Guidelines

- Keep docs and schemas in sync.
- Keep command specifications explicit about inputs, outputs, state changes, and failure behavior.
- Prefer small, auditable changes.
- Do not add generated files unless the generator is committed and documented.
