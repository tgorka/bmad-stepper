---
title: "Product Brief: BMAD Stepper"
status: "complete"
created: "2026-04-29"
updated: "2026-04-29"
inputs:
  - "docs/brainstorming/brainstorming-session-2026-04-29-1657.md"
  - "README.md"
  - "docs/architecture.md"
  - "docs/command-reference.md"
  - "docs/examples.md"
---

# Product Brief: BMAD Stepper

## Executive Summary

BMAD Stepper is a Claude Code plugin for solo developers who use BMAD Method and want the agent to move through the process without constant manual prompting. It provides controlled momentum, not full autonomy: pick the next step, prepare the right context, run the right persona and task pipeline, validate the expected artifacts, update state, and stop when human judgment is needed.

The headline experience is `/bmad-loop`: a controlled loop that repeatedly runs the next BMAD step until an explicit stop condition is reached. Instead of manually shepherding an agent through planning, story work, reviews, fixes, and handoffs, the developer can ask Stepper to continue until the next story, a specific story, a story range, an epic, a phase, or a named step. The loop keeps the developer in control by stopping on checkpoints, ambiguous state, missing inputs, validation failures, repair limits, and other moments where ownership decisions should not be automated.

This matters now because agentic coding tools are becoming powerful enough to run multi-step work, but developers still distrust "almost right" outputs, context loss, and opaque automation. BMAD Stepper gives BMAD users a safer execution layer: workflow state is indexed, completion is proven through artifacts, task work is isolated into sequential sub-agents, and every loop has brakes.

## The Problem

BMAD Method gives developers a structured way to move from product thinking to implementation, but running that process inside an AI coding assistant still requires a lot of manual orchestration. A solo developer has to remember the current workflow position, choose the right persona, provide the right context, ask for the next task, inspect outputs, request fixes, and decide when to continue. The process works, but the developer becomes the workflow engine.

General-purpose coding agents help with individual tasks, yet they do not naturally understand BMAD step boundaries, completion criteria, artifact evidence, or state repair. Long sessions can drift. Manual edits can make saved state stale. Review/fix loops can run too long. Agents can produce plausible outputs that do not satisfy the workflow contract. The result is friction exactly where BMAD is supposed to create momentum.

For a solo developer, the cost is not just time. It is cognitive load. Every transition requires checking whether the agent did the right thing, whether the next step is safe, and whether automation should continue. Stepper exists to reduce that manual agent steering without hiding the moments that still require judgment.

## The Solution

BMAD Stepper adds two Claude Code slash commands:

- `/bmad-next` executes exactly one unfinished BMAD workflow step.
- `/bmad-loop` repeatedly invokes `/bmad-next` until an explicit stop condition is reached.

Each step is treated as a workflow transaction with declared inputs, persona, tasks, outputs, done criteria, review policy, and next-step transitions. The workflow definition leads execution order, but artifacts decide whether work is complete. `.bmad-stepper/state.yaml` acts as a fast index of active workflow position, while frontmatter, files, diffs, tests, review outputs, and declared artifacts serve as proof.

Inside a step, task work runs through sequential sub-agents in v1. The main thread stays small and acts as the orchestrator: it loads the step, dispatches tasks, collects outputs, validates contracts, updates state, and decides whether to stop or continue. This keeps context rot down without introducing the file conflicts and merge complexity of parallel task execution.

The user experience is deliberately conservative. `/bmad-loop --dry-run` is the flagship trust moment: it previews selected steps, expected outputs, evidence, stop conditions, and conflicts before touching files. If state and artifacts disagree, Stepper stops for interactive repair instead of guessing. If the loop reaches a repair or step limit, it writes a report and recommends the next action.

## What Makes This Different

BMAD Stepper is not a general agent framework, a standalone CLI, or a BMAD installer. It is a narrow execution layer for developers who already use BMAD Method in Claude Code.

Its differentiation comes from four choices:

- Step-level transactions: the atomic unit is a BMAD workflow step, not an open-ended prompt or chat session.
- Artifact-backed completion: state is useful, but files and frontmatter prove whether work is done.
- Controlled loops: `/bmad-loop` automates repeated progress while preserving human checkpoints and explicit stop conditions.
- Prompt-first v1: the project stays script-light and avoids a TypeScript runtime until executable validation, fixture tests, generated docs, or release automation justify it.

This focus lets Stepper solve a specific pain better than broad coding agents: reducing the manual work of driving BMAD agents while keeping the workflow auditable and recoverable.

## Trust Contract

BMAD Stepper should be clear about what v1 can and cannot guarantee. It can select declared steps, preview planned work, require expected artifacts, compare state against file evidence, enforce loop and repair limits, and stop when evidence is missing or ambiguous. It cannot prove semantic quality by structure alone, and it should not pretend that a valid file automatically means a good product decision or a correct implementation.

That is why v1 treats artifacts as proof of workflow completion, not proof of perfect judgment. Reviews, tests, acceptance criteria, and human checkpoints remain part of the system. The product earns trust by showing its evidence and refusing to continue when the evidence is weak.

## Who This Serves

The primary user is a solo developer using BMAD Method with Claude Code. They want the leverage of agentic workflows without becoming a full-time agent coordinator. They value structure, resumability, and safety more than maximum autonomy.

Their "aha moment" is running `/bmad-loop --until story:2.3` and seeing the agent move through a bounded BMAD workflow without needing step-by-step prompting, while still stopping at the moments where the developer must review, decide, or repair.

Secondary users may include maintainers of BMAD-based projects who want consistent workflow execution across repos, but v1 should optimize for the solo developer first.

## Success Criteria

BMAD Stepper v1 is working when it measurably reduces manual agent steering for solo BMAD users while preserving trust.

Useful success signals include:

- A developer can preview and run a BMAD loop without manually selecting every next persona or step.
- `/bmad-loop` can complete a bounded target, such as one story, while stopping predictably on checkpoints and repair limits.
- State/artifact conflicts are detected and repaired interactively rather than hidden.
- Task outputs are validated before the workflow advances.
- Users report less prompt-by-prompt orchestration and more confidence in resuming work after interruptions.
- A first-time user can install or copy the command specs, add config, run `/bmad-next --dry-run`, and understand the planned next action within a few minutes.

## Known Unknowns and Validation Plan

The most important product risk is whether solo BMAD users want a loop to continue across multiple workflow steps, or whether they prefer explicit step-by-step control. V1 should validate this by observing real BMAD sessions and comparing the number of manual prompts, interventions, and recovery moments before and after Stepper.

The second risk is false confidence. Prompt-first validation can check structure, expected files, declared outputs, and stop conditions, but it may miss semantic problems. V1 should make that boundary visible in docs and command output, then add TypeScript or another runtime only when repeated validation failures show that prompt-first checks are not enough.

The third risk is onboarding friction. If a solo developer cannot get from prerequisite BMAD install to first dry run quickly, the product may feel like extra process. The first-session milestone should be modest: configure Stepper, preview the next step, execute one bounded step, and understand why the command stopped or continued.

## V1 Scope

In scope for v1:

- Claude Code slash-command specifications for `/bmad-next` and `/bmad-loop`.
- Project config and state templates under `.bmad-stepper/`.
- Step contract schema covering identity, phase, persona, inputs, outputs, tasks, done criteria, optionality, next transitions, and review policy.
- Sequential task sub-agent orchestration.
- Optional steps included by default unless `--skip-optional` is requested.
- Dry-run previews, interactive reconcile behavior, repair limits, loop limits, and checkpoint stops.
- Documentation, command reference, examples, and schemas that keep the prompt-first system auditable.
- A clear first-run path: prerequisite check, config creation, dry-run preview, one bounded execution, and recovery guidance.

Out of scope for v1:

- Installing BMAD Method.
- A TypeScript runtime.
- Parallel task sub-agent execution.
- Fully automatic state repair without user confirmation.
- General-purpose workflow automation outside BMAD Method.

## Vision

If BMAD Stepper succeeds, it becomes the dependable execution companion for BMAD Method inside Claude Code: the thing a solo developer trusts to keep moving through the method without losing the thread.

Over time, Stepper can grow from prompt-first command specifications into a more validated runtime only where evidence shows the need: schema-backed checks, fixture tests, generated docs, release automation, and richer run ledgers. The long-term promise is not unlimited autonomy. It is controlled momentum: agents do more of the process work, while the developer keeps the decisions that matter.
