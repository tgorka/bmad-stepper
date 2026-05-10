---
title: "Product Brief: bmad-stepper"
status: "complete"
created: "2026-04-29"
updated: "2026-04-30T03:28:37Z"
inputs:
  - "_bmad-output/brainstorming/brainstorming-session-2026-04-29-1656.md"
---

# Product Brief: BMAD Stepper

## Executive Summary

BMAD Stepper is a Claude Code plugin that adds two slash commands, `/bmad-next` and `/bmad-loop`, to the BMAD method workflow. It removes the manual orchestration tax of running BMAD by inferring project state from files and a hybrid cache, then either advancing one step or running a bounded loop until a declared stop condition.

The friction Stepper closes is small per occurrence and large in aggregate. A complete epic in BMAD touches 30 or more skills across analysis, planning, solutioning, implementation, and retrospective phases. Each transition is a manual context switch, a copy-paste of arguments, and an opportunity to lose track. Multi-project developers feel this most: returning to a project after a break, the first question is always "what step is next?" Stepper answers it.

The timing is right. BMAD v6.3 (April 2026) just shipped marketplace primitives and parallel stories. The Claude Code plugin ecosystem grew from zero to 9,000+ in five months. Anthropic now explicitly frames context engineering as the new discipline. Stage-aware orchestration is the gap, and no plugin currently fills it for BMAD.

## The Problem

Solo developers running BMAD method face a steady manual tax that scales linearly with project count and project length.

**Cold start after context switch.** The author works on multiple projects in parallel (notably `makistack`, but not only). After a day or week away from a given project, returning means recalling its current BMAD state: was the last completed step `story-create`, `dev-story`, or `review`? Wrong recall causes redundant work or skipped steps. Right recall costs time and energy at the worst moment, when momentum is already broken.

**Manual chain-of-skills inside one epic.** Completing an epic requires invoking 30+ skills across BMAD phases. Each invocation is a copy-paste of arguments and a context dilution of the main conversation window. Over an epic the cost compounds: degraded model attention, repeated handoffs, occasional missed steps.

**Story-internal repetition.** A single story may need several create / dev / review cycles per element, with one final wrap-up review at the end. Today this is fully manual: launch each cycle, remember which elements are done, finally invoke the wrap-up. Easy to lose track on long stories.

The status-quo cost is not catastrophic per session, but it is large in aggregate and grows worse as the number of active projects multiplies.

## The Solution

`/bmad-next` answers a single question, "what is the next step?", and runs it. The plugin reads project state from files (source of truth), a `state.yaml` write-through cache, and artifact frontmatter (authoritative for that document). It computes the next step from a DAG-validated registry of BMAD skills, delegates the work to an isolated sub-agent with file-based I/O, runs a verifier on the output, and updates state. The main thread logs one or two lines per step. The conversation window stays clean. Discoverability flags (`--list`, `--explain`, `--dry-run`) let the user inspect the next step before committing.

`/bmad-loop` runs `/bmad-next` repeatedly until a declared stop condition fires: `--until-epic-end`, `--until-story X-Y`, `--max-iters N`, `--time-budget 30m`, `--token-budget`, `--stop-on-error`, or manual interrupt. Loops are guarded by atomic writes, file-lock with PID heartbeat, and snapshots before destructive steps. A live transcript log streams to `_bmad-output/.stepper/runs/` so the user can watch progress without polluting the main thread. Failure UX is first-class: retry, skip, route-to-fixer, escalate, with `--resume` after any halt and `--plan-first` to dry-run the loop before committing tokens.

## What Makes This Different

**Methodology-aware orchestration.** Existing autonomous-loop tools (Ralph, agentic-loop) treat the codebase as a PRD-to-code engine and have no concept of BMAD stages. PabloLION/bmad-plugin is a thin install wrapper. BMAD core ships an orchestrator agent, but stage advancement still requires the user to invoke each agent by hand. As of April 2026, no Claude Code plugin we found walks the BMAD DAG end-to-end. Stepper does.

**Bounded autonomy.** This is not a naive infinite loop. Eight stop-condition types, mandatory checkpoints, file-lock heartbeat, atomic tmp+rename writes, branch+sha snapshots, and halt-on-branch-switch invariants address the runaway-cost and runaway-edit risks that mainstream criticism pins on autonomous loops.

**Sub-agent isolation by design.** Every heavy task runs in an isolated sub-agent with declared context budget and file-based input/output. Sub-agents do not decide what comes next and do not validate their own work. This directly targets the "context pollution" failure mode that BMAD practitioners report most often.

**Read-only respect for upstream as a maintenance moat.** Stepper does not vendor BMAD skills. Upstream installs cleanly via `npx bmad-method install`; Stepper layers on top. New BMAD releases require zero fork or merge work in Stepper unless the registry auto-detection finds a new skill it cannot place in the DAG. This is a long-term cost-of-ownership argument that compounds against any fork-based competitor.

## Who This Serves

**Primary user: the author.** Built and dogfooded by tgorka on `makistack` and other internal projects. The plugin earns its keep when the author uses it daily in place of manual skill chains, on real product and consulting work.

**Adjacent users: the BMAD community.** Open-source release on the Claude Code marketplace gives BMAD adopters a one-command upgrade path. The audience is indie devs and AI-native builders running BMAD seriously, especially anyone juggling multiple BMAD projects in parallel.

**Open-source posture.** PRs welcome, issues read. The author retains final say on direction. No roadmap commitments are made to community feature requests; contributions are evaluated against personal use first. This keeps the project sharp and the maintainer sustainable, and sets honest expectations from day one.

## Success Criteria

**Primary signals (must hit):**

- The author uses `/bmad-next` daily, replacing manual skill chains, for at least 30 consecutive days across at least two active projects.
- Time to complete a full epic in `makistack` drops measurably from the pre-Stepper baseline (baseline captured during the first full Stepper-driven epic; target locked once baseline is known).

**Secondary signals (track, do not optimize for):**

- Marketplace installs, GitHub stars, community-filed issues and PRs.

**Kill criterion.** If after 60 days of v0.1 the author still reaches for manual skill chains in more than 50% of sessions, the project is shelved. Better to kill it cleanly than to drift into half-used tooling.

The product succeeds when it becomes the author's default tool and survives daily use. Community adoption is a bonus, not a target.

## Scope

**In v0.1:**

- `/bmad-next` and `/bmad-loop` shipped together, with `--list`, `--explain`, `--dry-run`, `--resume`, `--plan-first` flags.
- Narrow set of stop conditions for `/bmad-loop`: `--max-iters`, `--until-epic-end`, `--stop-on-error`, `--time-budget`, `--token-budget`, `--resume`.
- Hybrid state model: files as source of truth, `state.yaml` cache at `_bmad-output/.stepper/state.yaml`, frontmatter authoritative per document.
- Step registry auto-generated from installed BMAD skills with project overrides; DAG-validated on load. Unknown upstream skills fail loudly with a clear remediation hint.
- Sub-agent dispatch: sequential, file-based I/O, declared context budget, transcript log per run streamed to disk.
- Opt-in local telemetry: aggregate step timing, retry rates, and verifier failure patterns logged to `_bmad-output/.stepper/telemetry/` as a local, human-readable report. Off by default; no code or PII captured. Foundation for future community benchmarks.
- Failure UX baseline: retry, skip, route-to-fixer, escalate, with human-readable failure reports and `--resume`.
- `--doctor` command for upgrade diagnostics when upstream BMAD changes.
- README and getting-started docs as a v0.1 deliverable, not a follow-up.
- Distribution: Claude Code plugin marketplace via GitHub releases. MIT license.
- Stack: TypeScript on Bun (single binary, fast dev loop, native test runner) with Bun test, Biome, Changesets, GitHub Actions CI on Linux + macOS. Windows users run via WSL.

**Explicitly out of v0.1:**

- Parallel sub-agent dispatch (sequential default; parallelism deferred).
- Self-validating sub-agents (verifier always runs as a separate step).
- Bundling BMAD skills (Stepper is a stage walker, not a distribution).
- Letting sub-agents pick the next step (orchestration stays main-thread).
- Generic non-BMAD methodology stepping.

## Vision

In two to three years Stepper remains a sharp personal tool first and a community wrapper second. The goal is not to merge into BMAD core, not to become a generic methodology stepper, and not to chase enterprise features. It stays a plugin: small surface area, fast to update, opinionated about BMAD. Compatibility with upstream is tracked release by release. Named profiles (indie-dev, enterprise) become natural extensions when real users ask for them. The opt-in telemetry from v0.1 may grow into a community benchmark over time, answering an open question nobody else can: what does a healthy BMAD epic actually look like? The point is reliability over scope: a tool the author still trusts to run unattended on their own repos two years from now.
