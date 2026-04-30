---
stepsCompleted: [1, 2, 3]
inputDocuments: []
session_topic: "bmad-next, bmad-loop, and a Claude Code plugin for automating BMAD Method workflows"
session_goals: "Design single-step and looped workflow execution, sub-agent task orchestration, Claude Code plugin distribution, and repository assets for using and maintaining the project"
selected_approach: "ai-recommended"
techniques_used: ["First Principles Thinking", "Morphological Analysis", "Chaos Engineering"]
ideas_generated: 29
context_file: ""
---

# Brainstorming Session Results

**Facilitator:** AI
**Date:** 2026-04-29 16:57

## Session Overview

**Topic:** `bmad-next`, `bmad-loop`, and a Claude Code plugin for automating BMAD Method workflows.

**Goals:** Design a model for executing individual BMAD steps, controlled loops with stop conditions, isolated sub-agent tasks, installation and updates through a Claude Code plugin, and the minimal repository structure needed to use and maintain the project.

### Context Guidance

No local `_bmad/core/config.yaml` file was found. This session uses the user's product description as the primary context.

### Session Setup

The session focuses on a developer product: a tool that interprets BMAD workflow state, selects the correct persona and configuration, executes individual steps or step loops, delegates tasks to independent sub-agents, and writes outputs to files.

## Technique Selection

**Approach:** AI-Recommended Techniques

**Recommended Techniques:**

- **First Principles Thinking:** Define what step, task, persona, workflow state, output, and completion mean.
- **Morphological Analysis:** Map the design options for `bmad-next`, `bmad-loop`, plugin behavior, schemas, templates, and repository shape.
- **Chaos Engineering:** Stress-test the design against context rot, invalid state, sub-agent failure, option conflicts, and nondeterministic review loops.

## Technique Execution Results

### First Principles Thinking

**[Workflow Core #1] Step as a workflow transaction**

_Concept_: Every BMAD step has inputs, a persona, instructions, completion criteria, outputs, and possible next states. `bmad-next` executes exactly one transaction: prepare context, execute, write artifacts, and update state.

_Novelty_: A step becomes the unit of planning, resumption, and auditability rather than just a prompt to run.

**[Workflow Core #2] Full Step Contract from v1**

_Concept_: Every step has `id`, `phase`, `persona`, `inputs`, `outputs`, `doneCriteria`, `optional`, `tasks`, `next`, and `reviewPolicy`.

_Novelty_: BMAD workflow becomes a declarative execution system instead of a collection of hand-wired commands.

**[Workflow Core #3] Workflow Leads, Artifacts Decide**

_Concept_: The workflow definition determines order and transitions, but `doneCriteria` is evaluated against files, frontmatter, diffs, tests, review outputs, and declared artifacts.

_Novelty_: The system avoids both blindly taking the next list item and magically inferring the whole workflow from the repository.

**[Workflow Core #4] State Index, Artifact Proof**

_Concept_: `.bmad-stepper/state.yaml` stores a fast index of the active workflow, phase, epic, story, last step, next step, and task results. Artifacts and frontmatter are the evidence that validates the state.

_Novelty_: State enables fast resumption, while artifacts protect against false state after manual edits, merges, or crashes.

**[Workflow Core #5] Reconcile Screen Before Execution**

_Concept_: When `state.yaml` and artifacts disagree, `bmad-next` stops and shows a short report: "state says X, artifacts say Y, recommended action Z". The user chooses update state, trust artifacts, rerun step, skip step, or diagnostic.

_Novelty_: State conflict becomes a controlled checkpoint rather than hidden agent behavior.

**[Workflow Core #6] Optional-by-default Execution**

_Concept_: `bmad-next` executes optional steps by default unless the user passes `--skip-optional`. Reports still mark optional steps as optional.

_Novelty_: This preserves the fuller BMAD process and reduces accidental omission of quality or learning steps.

**[Workflow Core #7] Main Thread as Orchestrator, Tasks as Sub-agents**

_Concept_: Inside a step, every task runs as a separate sub-agent with its own persona, input context, and output contract. The main thread loads the step, runs tasks sequentially, collects artifacts, and evaluates `doneCriteria`.

_Novelty_: Context rot is structurally limited because task working memory lives in sub-agent outputs, not in the main conversation.

**[Workflow Core #8] Sequential Sub-agent Pipeline**

_Concept_: Task sub-agents always run one after another in v1. The output of task N becomes an explicit input to task N+1.

_Novelty_: The system gets context isolation without parallel file conflicts, race conditions, or complex merge behavior.

### Morphological Analysis

**[Command Surface #9] `/bmad-next` as a scoped step executor**

_Concept_: `/bmad-next` selects the nearest unfinished step globally, or within `--epic`, `--story`, `--phase`, or `--step`. `--skip-optional`, `--dry-run`, and `--reconcile` control execution policy, preview mode, and state repair.

_Novelty_: One command supports both "guide me forward" and precise scoped execution.

**[Command Surface #10] `/bmad-loop` as a controlled `/bmad-next` loop**

_Concept_: `/bmad-loop` repeatedly invokes `/bmad-next` until a stop condition such as next story, a specific story, a story range, an epic, a phase, or a specific step. Story completion includes review/fix loops, and every reconcile or user checkpoint stops the loop.

_Novelty_: The loop is not an autopilot without brakes; it is a deterministic loop of single-step transactions.

**[Command Surface #11] Runaway Protection by Step Limit**

_Concept_: `/bmad-loop` has a default step limit, such as `--max-steps 20`, which can be overridden. If the limit is reached, the loop stops with a report and recommended next command.

_Novelty_: Broken workflows, bad completion criteria, or endless review loops cannot grind indefinitely.

**[Plugin #12] Claude Code Slash Plugin, not a separate CLI**

_Concept_: V1 ships Claude Code slash commands `/bmad-next` and `/bmad-loop`, not standalone system binaries. Commands run in the current project context and assume BMAD Method is already installed.

_Novelty_: The product focuses on agentic workflow execution instead of building another general-purpose CLI.

**[Plugin #13] Project-pinned Stepper Runtime**

_Concept_: The project pins the stepper version in `.bmad-stepper/config.yaml`. Plugin updates may update global commands/templates and project `.bmad-stepper/`, but must detect local changes and show a change plan before overwriting.

_Novelty_: Projects keep repeatability and control while the tool can still update from GitHub.

**[Plugin #14] BMAD-as-Prerequisite**

_Concept_: The plugin does not install BMAD Method. It checks for BMAD config, workflows, and personas, and stops with installation guidance when they are missing.

_Novelty_: Stepper orchestrates BMAD without becoming a BMAD installer.

**[Repo Shape #15] Prompt-first, Script-light V1**

_Concept_: V1 consists of slash commands, declarative contracts, templates, schemas, and documentation. TypeScript/Bun is added only if schema validation, fixture tests, generated docs, or release automation require it.

_Novelty_: The repo avoids premature runtime complexity while staying ready for automation.

**[Execution Policy #16] Three Automatic Repair Iterations by Default**

_Concept_: Review/fix or retry loops default to three iterations, configurable globally or per step. After the limit, the system stops with findings and a recommendation.

_Novelty_: The agent can fix issues automatically but has a guardrail against loops and implementation drift.

**[Config #17] Minimal Project Config with Safe Defaults**

_Concept_: `.bmad-stepper/config.yaml` pins the version, points to BMAD config, includes optional steps by default, sets repair and loop limits, enforces sequential tasks, enables interactive repair, defines output directories, and controls update policy.

_Novelty_: The project has a small, readable execution contract with explicit safety controls.

### Chaos Engineering

**[Resilience #18] Crash-safe Run Lock**

_Concept_: Every `/bmad-next` creates a run record and lock file under `.bmad-stepper/runs/{{runId}}/`. If the next command finds an unfinished run, it asks whether to resume, restart, abandon, or reconcile.

_Novelty_: Crashes have a recovery protocol instead of leaving half-invisible workflow state.

**[Resilience #19] Task Output Validation Gate**

_Concept_: The orchestrator validates each task output for existence, required sections, contract compliance, and mutation scope. Failed validation retries up to the limit, then writes a failure report and creates a user checkpoint.

_Novelty_: A sub-agent cannot silently advance the workflow with a plausible but invalid output.

**[Resilience #20] Scoped File Mutation Policy**

_Concept_: Step contracts can declare allowed paths. Out-of-scope file changes stop the step and show a diff with accept, manual revert, rerun, or blocked options.

_Novelty_: Agent work gets review-like boundaries without requiring a full sandbox.

**[Resilience #21] Persona Drift Check**

_Concept_: Every task prompt includes explicit persona, scope, required output, and forbidden actions. The task output starts with a self-check covering persona used, inputs read, outputs produced, and scope respected.

_Novelty_: Validation covers role alignment as well as files.

**[Resilience #22] Stop on Human Checkpoint**

_Concept_: `/bmad-loop` stops on reconcile, missing input, ambiguous completion, failed validation, repair limits, or required product decisions.

_Novelty_: The loop automates work, not ownership decisions.

**[Resilience #23] Dry-run as Plan Preview**

_Concept_: `/bmad-next --dry-run` and `/bmad-loop --dry-run` show selected steps, evidence, planned tasks, expected outputs, stop conditions, and conflicts without modifying files.

_Novelty_: Users can inspect workflow logic before execution.

**[Resilience #24] Idempotent Step Re-entry**

_Concept_: Steps check existing artifacts and `doneCriteria` before deciding resume, retry, or reconcile.

_Novelty_: Restarting after crash or manual edits does not create duplicate or contradictory artifacts.

**[Resilience #25] Version-aware Plugin Updates**

_Concept_: Plugin updates compare the global version, project pin, and local `.bmad-stepper/` modifications. Project-file changes require confirmation.

_Novelty_: Projects are protected from hidden workflow migrations.

**[Resilience #26] BMAD Prerequisite Diagnostic**

_Concept_: Missing BMAD config, workflows, or personas stop execution with a diagnosis and installation/repair instructions.

_Novelty_: Stepper does not execute workflows on uncertain assumptions.

**[Resilience #27] Review Loop Ledger**

_Concept_: Each `review -> apply fixes -> review` iteration records findings, decisions, applied fixes, and result. Default limit: three iterations.

_Novelty_: Automatic fixing becomes auditable.

**[Resilience #28] Ambiguous Stop Condition Report**

_Concept_: If `/bmad-loop --until ...` cannot prove it reached the target, it reports expected stop, current step, found evidence, missing evidence, and recommended next command.

_Novelty_: Stop conditions are treated as contracts.

**[Resilience #29] Output-first Main Context Protection**

_Concept_: The main thread keeps only plan, status, and summaries. Detailed task context lives in `.bmad-stepper/runs/{{runId}}/tasks/*.md` and is selectively passed forward.

_Novelty_: Context-rot prevention is a core architecture rule.

## Recommended V1 Scope

**Commands:**

- `/bmad-next`
- `/bmad-next --epic 2`
- `/bmad-next --story 2.3`
- `/bmad-next --phase planning`
- `/bmad-next --step story.dev`
- `/bmad-next --skip-optional`
- `/bmad-next --dry-run`
- `/bmad-next --reconcile`
- `/bmad-loop --until next-story`
- `/bmad-loop --until story:2.3`
- `/bmad-loop --until story-range:2.3-2.5`
- `/bmad-loop --until epic:2`
- `/bmad-loop --until phase:planning`
- `/bmad-loop --until step:epic.retro`
- `/bmad-loop --max-steps 10`
- `/bmad-loop --skip-optional`
- `/bmad-loop --dry-run`

**Project config default:**

```yaml
version: 0.1.0

bmad:
  required: true
  configPath: _bmad/core/config.yaml

execution:
  optionalSteps: include
  maxRepairIterations: 3
  maxLoopSteps: 20
  stopOnCheckpoint: true
  taskExecution: sequential

state:
  path: .bmad-stepper/state.yaml
  conflictPolicy: interactive-repair

outputs:
  runsDir: .bmad-stepper/runs
  taskOutputsDir: .bmad-stepper/runs/{{runId}}/tasks

plugin:
  updatePolicy: ask
```

**Repository shape:**

```text
README.md
CHANGELOG.md
CONTRIBUTING.md
AGENTS.md
LICENSE
.gitignore
.github/workflows/ci.yml
commands/
  bmad-next.md
  bmad-loop.md
templates/
  bmad-stepper.config.yaml
  bmad-stepper.state.yaml
schemas/
  config.schema.json
  state.schema.json
  step.schema.json
docs/
  architecture.md
  command-reference.md
  examples.md
```

**Script policy:** V1 should stay prompt-first and script-light. Add TypeScript/Bun only when needed for schema validation, fixture tests, generated docs, or release automation.

## Next Recommended Work

1. Finalize plugin packaging conventions.
2. Expand step contracts for the first real BMAD workflows.
3. Add fixture tests if schemas become executable validation inputs.
