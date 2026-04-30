---
stepsCompleted: [1, 2]
inputDocuments:
  - docs/prd.md
  - docs/product-brief-bmad-stepper.md
  - docs/examples.md
  - docs/command-reference.md
  - docs/brainstorming/brainstorming-session-2026-04-29-1657.md
workflowType: architecture
project_name: BMAD Stepper
user_name: tgorka
date: "2026-04-29"
lastStep: 2
status: in-progress
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**

BMAD Stepper has 43 functional requirements across seven architectural areas:

1. Workflow discovery and preview: selecting the next BMAD step, showing required inputs, expected outputs, completion criteria, stop conditions, and prerequisite diagnostics before mutation.
2. Single-step execution: executing exactly one BMAD workflow step as a transaction, including persona/task loading, optional step policy, and safe stopping on missing or ambiguous inputs.
3. Controlled loop execution: repeatedly invoking the single-step transaction until explicit targets such as story, story range, epic, phase, or step are reached.
4. State, evidence, and reconciliation: using `.bmad-stepper/state.yaml` as an index while treating artifacts, frontmatter, files, task outputs, tests, and review results as completion evidence.
5. Task orchestration and validation: running task sub-agents sequentially, validating each declared output, retrying within repair limits, and writing failure reports when contracts are not satisfied.
6. Configuration and project assets: defining project-pinned Stepper behavior through templates and schemas for config, state, and step contracts.
7. Documentation and developer experience: making first-run, command reference, examples, recovery guidance, and guarantee boundaries explicit.

Architecturally, these requirements point to a conservative orchestration design. The system should be modeled around step contracts, evidence checks, explicit state transitions, and stop reports rather than open-ended agent autonomy.

**Non-Functional Requirements:**

The NFRs are the primary architectural drivers:

- Reliability and recovery require Stepper to stop instead of guessing, especially when state and artifacts conflict.
- Trust and transparency require dry-run previews, stop reports, visible evidence, and declared file mutation scope.
- Data integrity and auditability require state updates only after evidence is confirmed, plus traceable run records and task outputs.
- Safety and scope control require BMAD prerequisite checks, interactive repair, sequential task execution, and detection of out-of-scope file mutations.
- Maintainability requires v1 to remain prompt-first and script-light until executable validation, fixture tests, generated docs, or release automation justify a runtime.
- Performance matters mainly for dry-run responsiveness and bounded context loading, not high-throughput runtime execution.

**Scale & Complexity:**

- Primary domain: developer workflow automation inside Claude Code
- Complexity level: medium
- Estimated architectural components: 8

The likely components are command specs, project configuration, state index, step contract schema, artifact/evidence resolver, task orchestration model, run/task record structure, and documentation/templates.

### Technical Constraints & Dependencies

BMAD Stepper has several explicit constraints:

- It must be a Claude Code plugin, not a standalone CLI in v1.
- It must not install BMAD Method; BMAD is a prerequisite.
- V1 must remain prompt-first and script-light.
- TypeScript/Bun runtime is out of scope unless validation or automation needs justify it later.
- Task sub-agents execute sequentially in v1.
- Optional steps run by default unless `--skip-optional` is requested.
- `.bmad-stepper/state.yaml` is an index, not the source of truth.
- Artifacts and frontmatter are proof of completion.
- Fully automatic state repair is out of scope; repair must be interactive.

### Cross-Cutting Concerns Identified

The architecture needs consistent answers for these cross-cutting concerns:

- Evidence-based completion: every state transition must be backed by declared artifacts or frontmatter evidence.
- Reconciliation: state/artifact conflicts must become explicit user checkpoints.
- Idempotent re-entry: interrupted or repeated commands must inspect existing evidence before retrying or rerunning.
- Auditability: run records, task outputs, failure reports, and review/fix iterations must explain what happened.
- Scope control: command specs and step contracts must declare expected mutations and stop on unexpected changes.
- Context management: the main thread should remain an orchestrator while detailed task work is stored in run/task records.
- Version safety: project-pinned behavior and update plans must protect local project modifications.
