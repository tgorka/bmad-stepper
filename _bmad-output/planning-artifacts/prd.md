---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-02b-vision
  - step-02c-executive-summary
  - step-03-success
  - step-04-journeys
  - step-05-domain (skipped - domainComplexity:low)
  - step-06-innovation
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
  - step-12-complete
releaseMode: phased
status: complete
completedAt: '2026-04-29'
inputDocuments:
  - _bmad-output/planning-artifacts/product-brief-bmad-stepper.md
  - _bmad-output/planning-artifacts/product-brief-bmad-stepper-distillate.md
  - _bmad-output/brainstorming/brainstorming-session-2026-04-29-1656.md
documentCounts:
  briefs: 2
  research: 0
  brainstorming: 1
  projectDocs: 0
  projectContext: 0
workflowType: 'prd'
projectName: 'bmad-stepper'
classification:
  projectType: developer_tool
  projectTypeNote: 'Primary intent: workflow orchestrator with bounded autonomy. CSV taxonomy lacks ai-agent-orchestration category; using developer_tool as nearest fit and augmenting with custom sections.'
  domain: general
  domainSubNiche: ai-agent-orchestration
  domainComplexity: low
  technicalComplexity: high
  projectContext: greenfield
  projectContextNote: single-author-dogfood
  autonomyLevel: bounded-loop
augmentedSections:
  fromDeveloperTool:
    - language_matrix
    - installation_methods
    - api_surface
    - code_examples
    - migration_guide
  fromCliTool:
    - command_structure
    - output_formats
    - config_schema
    - scripting_support
  custom:
    - sub_agent_dispatch_contract
    - state_machine_invariants
    - bounded_autonomy_guarantees
    - runaway_loop_safety
    - dogfood_validation_plan
    - classification_note
skippedSections:
  - visual_design
  - store_compliance
---

# Product Requirements Document - bmad-stepper

**Author:** tgorka
**Date:** 2026-04-29

## Executive Summary

BMAD Stepper is a Claude Code plugin that adds two slash commands — `/bmad-next` and `/bmad-loop` — to the BMAD method workflow. It eliminates the manual orchestration tax of running BMAD by inferring project state from files (source of truth) plus a write-through `state.yaml` cache, then either advancing one step or running a bounded loop until a declared stop condition fires.

The product solves a compounding cost: a single BMAD epic invokes 30+ skills across analysis, planning, solutioning, implementation, and retrospective phases. Each invocation is a manual context switch, an argument copy-paste, and an opportunity to lose track. For developers running BMAD across multiple projects in parallel — the primary user (Tgorka, dogfooding on `makistack`) and the adjacent target audience (indie devs, AI-native builders, BMAD adopters) — the cost is largest at the worst moment: returning to a project after a context switch, when momentum is already broken and the first question is always *"what step is next?"*

`/bmad-next` answers that question and runs it. `/bmad-loop` chains the answer until a stop condition fires. Both commands keep the main conversation window clean: every heavy task runs in an isolated sub-agent with declared context budget and file-based I/O; the main thread logs one or two lines per step. Eight stop-condition types, mandatory checkpoints, file-lock heartbeats, atomic writes, and branch+sha snapshots make autonomous runs trustworthy enough to leave unattended overnight.

The product succeeds when, after thirty days of daily use, the author no longer remembers when they last invoked a BMAD skill by hand.

### What Makes This Special

**The differentiation moment is returning to a project after a week away.** You type `/bmad-next` and get a one-line answer: *"You're at `story-create` for epic 3; PRD §4.2 and architecture loaded; plan: create story 3.2 from PRD §4.2; proceed?"* Zero recall, zero scrollback, zero "which skill now?" The second moment is leaving `/bmad-loop --until-epic-end --plan-first` running overnight and waking to clean per-step commits, transcripts archived to `.stepper/runs/`, every step verified — and a main conversation window untouched.

Four insights make this possible:

1. **BMAD has 30+ skills but no central state machine.** State is scattered across PRD, architecture docs, stories, and frontmatter — a Git-friendly feature that creates a discovery gap. Stepper reconstructs state from files-as-source-of-truth, surviving any session restart and any branch switch.
2. **Sub-agent isolation is cheaper than maintaining a clean main context.** Anthropic explicitly framed *context engineering* as the new discipline in April 2026; Stepper is a textbook implementation: declared budgets, file-based handoffs, no self-validation by the executing sub-agent.
3. **Bounded autonomy is trust earned per project.** Eight stop-condition types, atomic tmp+rename writes, file-lock with PID heartbeat, branch+sha snapshots, `--plan-first` dry-run, `--token-budget` cap — safety is a first-class part of the product, not a wrapper added after launch.
4. **Read-only respect for upstream BMAD is a strategic moat.** Stepper does not vendor or fork BMAD skills; upstream installs cleanly via `npx bmad-method install` and Stepper layers on top. Any fork-based competitor pays exponential merge cost on every BMAD release. Stepper pays zero unless a new upstream skill cannot be placed in the DAG, in which case it fails loudly with a remediation hint.

No Claude Code plugin currently fills this gap. Ralph and agentic-loop run PRD-to-code loops with no methodology awareness. PabloLION/bmad-plugin is a thin install wrapper. BMAD core ships an Orchestrator agent, but stage advancement still requires the user to invoke each agent by hand. The window for a BMAD-aware stepper is open right now: BMAD v6.3 (April 2026) just shipped marketplace primitives and parallel stories, the Claude Code plugin ecosystem grew from zero to 9,000+ in five months, and Aider's 4.1M installs have proven that terminal-native AI tooling adopts at scale. The personal timing matches: the author currently runs multiple BMAD-driven projects in parallel, and the futility of manual chaining compounds daily.

In two to three years, Stepper remains a sharp personal tool first and a community wrapper second — explicitly *not* merged into BMAD core, *not* a generic methodology stepper, *not* an enterprise platform. The opt-in telemetry that ships in v0.1 may grow into a community benchmark — answering an empirical question nobody else can: *what does a healthy BMAD epic actually look like?* That growth path is opt-in for both contributors and the maintainer; reliability comes before scope.

## Project Classification

| Dimension | Value | Note |
|-----------|-------|------|
| **Project Type** | `developer_tool` | Primary intent is *workflow orchestrator with bounded autonomy*. The BMAD project-types taxonomy lacks an `ai-agent-orchestration` category; `developer_tool` is the nearest fit and is augmented with custom sections. |
| **Domain** | `general` (sub-niche: `ai-agent-orchestration`) | Not regulated. Concerns are context pollution, runaway loops, methodology drift, sub-agent coordination, token budgets — not generic CRUD. |
| **Domain Complexity** | `low` | No HIPAA/PCI/FedRAMP/FDA burden. |
| **Technical Complexity** | `high` | Concurrency invariants (file lock + PID heartbeat, atomic tmp+rename, NFS fallback), hybrid state model with three precedence layers, schema-versioned migrations (Zod), DAG-validated step registry with cycle detection, sub-agent dispatch architecture, eight stop-condition semantics, four failure-UX modes, pathological-input guards. |
| **Project Context** | `greenfield` (single-author-dogfood) | No pre-existing project documentation; primary user is the author, dogfooded on `makistack`. PRD includes a *Dogfood Validation Plan* in lieu of enterprise rollout planning. |
| **Autonomy Level** | `bounded-loop` | Custom axis. Mandates a dedicated PRD chapter on stop conditions, safety invariants, runaway prevention, and human override. |

PRD sections augmented from `developer_tool`: `language_matrix`, `installation_methods`, `api_surface`, `code_examples`, `migration_guide`. Augmented from `cli_tool`: `command_structure`, `output_formats`, `config_schema`, `scripting_support`. Custom sections required by the product's nature but not present in the BMAD taxonomy: `sub_agent_dispatch_contract`, `state_machine_invariants`, `bounded_autonomy_guarantees`, `runaway_loop_safety`, `dogfood_validation_plan`, `classification_note`. Skipped: `visual_design`, `store_compliance`.

## Success Criteria

### User Success

The primary user is the author. User success is operationalized as a binary: the product is winning when manual skill chains have been replaced by `/bmad-next` and `/bmad-loop` in the author's daily BMAD work, and the author trusts the tool enough to stop holding it in working memory.

Success indicators (per primary user, in priority order):

- **Daily replacement.** `/bmad-next` is the first command typed after `cd` into a BMAD project, for at least 30 consecutive days, across at least two active projects (`makistack` plus one other).
- **Cold-start elimination.** Returning to a project after a context break (≥3 days), the author types `/bmad-next` instead of opening files to recall state. Measured by self-report; expected within the first week of use.
- **Loop trust earned per project.** At least one full `/bmad-loop --until-epic-end --plan-first` run completes overnight without manual intervention and with all per-step verifiers passing. Earned per project, not globally.
- **Memory offload.** The author no longer remembers when they last invoked a BMAD skill by hand on a primary project — the canonical 30-day mark from the Executive Summary.

Anti-indicator: if the author still reaches for manual skill chains in more than 50% of sessions after 60 days of v0.1, the project is shelved (kill criterion).

### Business Success

There is no commercial business behind Stepper. *Business success* in this PRD means **project sustainability** for a single-maintainer open-source plugin, plus optional community adoption signals.

**Sustainability (must-hold):**

- Maintainer time spent on Stepper trends down per release after v0.1.0, not up. Stable feature set + small surface area + read-only respect for upstream BMAD = upstream releases require zero merge work in Stepper unless registry auto-detection finds an unknown skill.
- No compounding maintenance debt: every BMAD release is tested against Stepper via `--doctor`, and the CHANGELOG's *BMAD Compatibility* section is filled per release.

**Community adoption (track, do not optimize for):**

- Marketplace installs of `Tgorka/bmad-stepper`.
- GitHub stars on the repository.
- Community-filed issues and PRs that pass the *evaluated against personal use first* governance bar.

These signals are tracked as input to potential future direction, not as targets that drive feature decisions.

### Technical Success

Technical success is the bar that enables the user-success outcomes above. The product must be **reliable enough to leave unattended overnight** and **recoverable from any halt**.

Hard requirements (v0.1 release blockers):

- **Zero data loss** under any halt scenario (SIGINT, crash, branch switch, lock contention, disk full): atomic tmp+rename writes always, `.bak` backups before destructive ops, snapshots before destructive steps.
- **100% recovery via `--resume`** from any halt point: `state.yaml` records `last_attempted` and `last_failure_reason`; `--resume` always picks up cleanly.
- **Zero silent state drift** in the cache: `--diff-state` reports any divergence between `state.yaml` and files-of-truth; recompute is one command (`--recompute-state`).
- **Zero unbounded loops** in v0.1: every `/bmad-loop` run must declare or default to a stop condition. No infinite-loop code paths reachable.
- **No upstream BMAD modification:** Stepper never writes to BMAD-installed files; a CI gate enforces this.
- **Schema-versioned state with migrations:** `state.yaml` carries a version field; loading older versions runs migrations; corrupted state surfaces actionable errors, not stack traces.
- **Concurrency safety:** exclusive lock per project root with PID + heartbeat; stale lock detection; halt on branch switch.

Quality gates (v0.1 release blockers):

- Smoke tests pass on Linux + macOS via Bun on `bun test`.
- All eight stop conditions covered by integration tests.
- All four failure-UX modes (retry, skip, route-to-fixer, escalate) covered by integration tests.
- `--doctor` passes against the latest BMAD release tested at release time.

### Measurable Outcomes

| Outcome | Metric | Target | Window | Tracking |
|---------|--------|--------|--------|----------|
| Daily replacement | Days of consecutive `/bmad-next` use as primary entry point | ≥30 | First 60 days post-v0.1.0 | Author journal + transcript log frequency |
| Project breadth | Active projects using Stepper daily | ≥2 (`makistack` + one other) | First 60 days post-v0.1.0 | Project enumeration |
| Epic time reduction | Wall-clock time to complete a full epic in `makistack` | ≥X% reduction vs. baseline (X locked after first full Stepper-driven epic) | Per epic | `_bmad-output/.stepper/telemetry/` |
| Data-loss incidents | User-perceived data loss events | 0 | Lifetime of v0.1 | Author journal + GitHub issues |
| Recovery success | Halts that recovered cleanly via `--resume` | 100% | Lifetime of v0.1 | Run-log analysis |
| Cache drift | `--diff-state` warnings during normal use | 0 | Lifetime of v0.1 | Run-log analysis |
| Kill criterion | Sessions where author reached for manual skill chain | <50% | Days 30-60 post-v0.1.0 | Session journal |

Two targets are deliberately deferred to *baseline-locking* (the first complete Stepper-driven epic on `makistack`):

- **Epic time reduction target (X%)** — set after baseline epic completes.
- **Token spend per epic** — tracked from day one, no target until baseline.

## Product Scope

### MVP - Minimum Viable Product (v0.1.0)

Both `/bmad-next` and `/bmad-loop` ship together with the full flag inventory from the brief. v0.1 deliberately ships the full command surface — *no scaffolding-only stubs* — so the dogfood test is honest from day one.

**Commands and flags (v0.1 fully implemented):**

- `/bmad-next` with `--step`, `--epic`, `--story`, `--phase`, `--dry-run`, `--resume`, `--include-optional`/`--no-optional`, `--persona`, `--explain`, `--list`.
- `/bmad-loop` with `--until-epic-end`, `--until-story`, `--max-iters`, `--time-budget`, `--token-budget`, `--stop-on-error`/`--continue-on-error`, `--interactive`, `--auto-fix`, `--plan-first`, `--checkpoint-each`.
- State / inspection: `--recompute-state`, `--export-state`, `--diff-state`, `--watch`.
- Diagnostics: `--doctor`, `--upgrade`.

**Architecture and safety:**

- Hybrid state model (files SoT + `_bmad-output/.stepper/state.yaml` write-through cache + frontmatter authoritative per document).
- Sub-agent dispatch: sequential, file-based I/O, declared context budget per task, transcript log streamed to `_bmad-output/.stepper/runs/`.
- Step registry auto-generated from installed BMAD skills with project overrides; DAG-validated on every load; unknown upstream skills fail loudly with remediation hint.
- All eight stop-condition types fully implemented.
- All four failure-UX modes (retry, skip, route-to-fixer, escalate) fully implemented.
- Concurrency invariants: exclusive lock + PID heartbeat, atomic tmp+rename writes, branch+sha snapshots, halt-on-branch-switch.
- Pathological-input guards: 50k-line PRD warning + paginated read, 50MB state.yaml size guard, UTF-8 enforcement, 200-issue review pagination, lazy-load registry for 100 epics × 1000 stories.

**Operational primitives:**

- Opt-in local telemetry (off by default), aggregating step timing, retry rates, verifier failure patterns to `_bmad-output/.stepper/telemetry/` as a human-readable report.
- Schema-versioned state with Zod migrations.
- Errors-as-primary-UX: every error produces an actionable hint; tested in CI.

**Distribution and docs:**

- Distribution: Claude Code plugin marketplace as `Tgorka/bmad-stepper`. MIT license.
- Stack: TypeScript on Bun + Bun test + Biome + Changesets + GitHub Actions matrix Linux + macOS.
- Repo files: README, CHANGELOG, AGENTS.md, CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md, PR + issue templates.
- README and getting-started docs are v0.1 deliverables, not follow-ups.

**Explicitly out of MVP (v0.1):**

- Parallel sub-agent dispatch (sequential default; parallelism deferred).
- Self-validating sub-agents (verifier always runs as a separate step).
- Bundling BMAD skills (Stepper is a stage walker, not a distribution).
- Letting sub-agents pick the next step (orchestration stays main-thread).
- Generic non-BMAD methodology stepping.
- Native Windows support (WSL only in v0.1).
- Remote telemetry upload (local-only opt-in in v0.1).

### Growth Features (Post-MVP)

Growth is opt-in; nothing here is a roadmap commitment. Each item is gated by *real user demand from the primary user or qualifying community signal*.

- **Parallel sub-agent dispatch** — when a real epic on `makistack` exposes a sequential bottleneck worth fixing.
- **Named profiles** (`indie-dev`, `enterprise`) — when a non-author user files an issue showing a profile-shaped configuration need.
- **Opt-in remote telemetry upload** + community benchmark dashboard ("your epic vs. median BMAD epic") — gated on accumulating local telemetry from the primary user first, then on community interest.
- **Stacked PRs / Graphite integration** — convenience feature for the maintainer.
- **GitHub Pages docs site** — only if README outgrows itself.
- **`bmad-prev` / `--undo-last`** — if real undo scenarios surface during dogfooding.
- **`--visualize`** — emit the resolved DAG as Graphviz dot for diagnostics; gated on a real "I can't see why this step is next" moment.
- **`--init`** — generate a `bmad-stepper.config.yaml` starter template; gated on the second non-author user filing the same template request.
- **`--validate`** — run precondition checks across the entire registry as a linter, without dispatching any sub-agent; gated on a CI-integration request.
- **`--reset-epic <n>`** — archive the epic into `_bmad-output/.archive/` and reset state to its start; gated on a real recovery scenario in dogfooding.
- **`--print-prompt`** — emit the exact sub-agent prompt that would be dispatched (combined with `--dry-run`); gated on a debugging-ergonomics complaint from the primary user.
- **GitHub Discussions enablement** — separate Q&A surface from Issues; gated on the issue tracker accumulating discussion-shaped threads.
- **AGENTS.md as executable contributor spec** — beyond serving as plugin metadata, evolve `AGENTS.md` into the canonical "how to contribute via Claude Code itself" guide; gated on the first community contributor.

### Vision (Future)

Two- to three-year horizon. The vision is *reliability and sustainability*, not feature breadth.

- Stepper remains a sharp personal tool first and a community wrapper second.
- Compatibility with upstream BMAD is tracked release-by-release; the product never falls more than one minor BMAD version behind.
- Telemetry from v0.1 may grow into a community benchmark, answering an empirical question nobody else can: *what does a healthy BMAD epic actually look like?*
- The maintainer still trusts the tool to run unattended on their own repos two years from now.

**Explicit non-goals:**

- Not merging into BMAD core. Stepper stays an independent plugin.
- Not becoming a generic methodology stepper. Stepper stays opinionated about BMAD.
- Not chasing enterprise features (SSO, audit logs as primary UX, RBAC, multi-team dashboards).
- Not adding native Windows support unless a contributor commits to long-term maintenance.

## User Journeys

### Journey 1: Primary User — Cold-Start Return (Happy Path)

**Persona:** Tgorka — sole maintainer juggling `makistack` (active development), `bmad-stepper` (this project), and consulting work. Returns to projects after days or weeks of context switching.

**Opening Scene:** Monday morning. Tgorka opens a terminal, `cd makistack`. Last touched the project nine days ago. Without Stepper, this would mean opening `_bmad-output/`, scanning recent files, trying to remember whether `story-create` for epic 3 finished, scrolling Claude history, losing 15 minutes before any productive work.

**Rising Action:** Tgorka types `/bmad-next --explain`. Stepper reads `_bmad-output/.stepper/state.yaml`, validates against files, computes the next step. Output:

> *"Next step: `dev-story` for epic 3 / story 3.2.*
> *Reasoning: `story-create` completed on 2026-04-20 (frontmatter `status: ready`); no `dev-story` artifact exists yet; preconditions met (PRD §4.2 loaded, architecture §6 loaded, persona = `dev`).*
> *Run with `/bmad-next` (or `/bmad-next --dry-run` to preview)."*

**Climax:** Tgorka types `/bmad-next`. Main thread logs one line: *"Dispatching dev-story (epic 3 / story 3.2) → sub-agent (Sonnet, 60k context budget, 5 min timeout)."* The sub-agent runs in isolation, writes to `_bmad-output/.stepper/staging/dev-story-2026-04-29-09-12.md`, returns. The verifier checks frontmatter, required sections, and schema. State updates atomically. Main thread logs: *"✓ dev-story complete. Next: `code-review` (epic 3 / story 3.2)."*

**Resolution:** In two minutes, Tgorka knows where the project is, has progressed it by one step, and can now decide: invoke `/bmad-next` again, chain through code-review and wrap-up via `/bmad-loop --until-story 3.2 --plan-first`, or context-switch back to `bmad-stepper` knowing exactly where `makistack` will resume.

**Capabilities revealed:** stateful resumption from files, `--explain` reasoning trace, single-step execution, sub-agent dispatch with declared budget, verifier-after-step gate, atomic state update.

### Journey 2: Primary User — Halt Recovery (Edge Case)

**Persona:** Same primary user. Different scenario: started a `/bmad-loop --until-epic-end` overnight, woke up to find it halted at step 7 of 12 with a verifier failure on `code-review`.

**Opening Scene:** 7:30 AM. Coffee. Terminal showing the loop transcript. Last line: *"⚠ Verifier failed on `code-review` (epic 3 / story 3.4): missing `Checklist` section. Halted. Run `/bmad-next --resume` after fixing, or `/bmad-next --skip code-review --resume` to continue."*

**Rising Action:** Tgorka opens the failed artifact and sees the issue: the sub-agent produced a code review but used a non-standard heading. Two options surface: (a) fix the artifact by hand and resume, or (b) re-dispatch with a tighter prompt. Tgorka picks (a) — quick fix.

**Climax:** Tgorka edits the file, saves, runs `/bmad-next --resume`. Stepper re-runs validation, sees the verifier passes now, advances state to step 8, continues. The loop is not lost: `state.yaml` had `last_attempted: code-review (epic 3 story 3.4)` and `last_failure_reason: missing Checklist section`. After resume: *"✓ code-review (epic 3 / story 3.4) accepted on retry. Next: `wrap-up-review` (epic 3 / story 3.4)."*

**Resolution:** Total time lost: under 5 minutes. No re-running of completed work. No state corruption from the halt. The halt itself — graceful SIGINT-style — preserved partial work and produced an actionable error message instead of a stack trace.

**Capabilities revealed:** verifier-as-halt-gate, halt-with-actionable-error, `--resume` from `last_attempted`, `--skip` failure-UX mode, errors-as-primary-UX.

### Journey 3: Adjacent User — First Install (BMAD Community)

**Persona:** Lena, indie dev who just discovered BMAD via a YouTube talk. Installed BMAD-method via `npx bmad-method install --tools claude-code`. Tried running an epic by hand for two days, got tired of remembering which agent runs next, found `Tgorka/bmad-stepper` on the marketplace.

**Opening Scene:** Lena types `/plugin marketplace add Tgorka/bmad-stepper`. Plugin installs to `~/.claude/plugins/`. Lena is unsure if this works with her version of BMAD.

**Rising Action:** Lena types `/bmad-next --doctor`. Output: *"BMAD detected: v6.3.0 (compatible). Project: `lena-app`. State file: not present (fresh project). Step registry: built from 31 BMAD skills + 0 project overrides; DAG validated; no cycles. Suggestion: run `/bmad-next` to start the analysis phase."* Lena reads the README's Quick Start (three commands), types `/bmad-next`. Stepper picks `analyst-research` as the first step (no analysis docs exist, project is brand new), explains the choice, asks Lena to confirm. Lena types `y`. Sub-agent runs.

**Climax:** Five minutes later, Lena has her first BMAD artifact (`research-report.md`). She types `/bmad-next` again. Stepper picks the next step (`brainstorming`). Lena realizes she just used three commands to start a BMAD project end-to-end without memorizing any of the 31 skill names or which one comes after which.

**Resolution:** Lena uses Stepper for two epics, files an issue: *"Could `/bmad-next --persona test-architect` accept TEA module's persona names too?"* Tgorka reads it, evaluates against personal use, decides it's an in-scope clarification rather than a new feature, replies with a one-line fix. Lena's PR merges three days later.

**Capabilities revealed:** `--doctor` first-run validation, BMAD upstream version detection, fresh-project state initialization, DAG validation on registry load, marketplace install flow, governance posture (issues evaluated against personal use).

### Journey 4: Maintainer — BMAD Upstream Upgrade

**Persona:** Tgorka in maintainer-of-Stepper hat, not user-of-Stepper hat. BMAD just shipped v6.4.0 with two new skills: `architecture-validator` and `epic-splitter`.

**Opening Scene:** Tgorka updates BMAD locally via `npx bmad-method install --tools claude-code`. Runs Stepper on `makistack`. Stepper logs: *"⚠ Unknown upstream skills detected: `architecture-validator` (no DAG placement), `epic-splitter` (no DAG placement). Halting. Add overrides in `bmad-stepper.config.yaml` or wait for Stepper update."*

**Rising Action:** Tgorka opens `bmad-stepper.config.yaml`, adds DAG overrides:

```yaml
overrides:
  architecture-validator:
    phase: solutioning
    after: [architecture]
    optional: true
  epic-splitter:
    phase: planning
    after: [epics-and-stories]
    optional: true
```

Reruns `/bmad-next --doctor`. Output: *"DAG validated. 33 skills total (was 31). 2 overrides active."*

**Climax:** Tgorka opens a new branch, writes a CHANGELOG entry under *BMAD Compatibility — v0.1.4*: "Tested with BMAD v6.4.0. Two new skills require overrides until the next minor release. See `examples/bmad-6.4-overrides.yaml`." Ships v0.1.4 within the hour.

**Resolution:** Community users on BMAD v6.4 get a working Stepper either via the config override pattern (immediate) or via v0.1.4 (which ships built-in placements for the new skills, no override needed). Maintenance time: ~1 hour. No fork, no rebase, no merge conflict.

**Capabilities revealed:** fail-loudly on unknown upstream skills, project-level DAG overrides, CHANGELOG *BMAD Compatibility* convention, release-as-config-update pattern, maintenance moat in action.

### Journey 5: CI/Automation Consumer — `--export-state` for Audit

**Persona:** Future Tgorka or a community contributor who wants to embed Stepper in CI: gate PR merges on "no in-flight BMAD work that should not be interrupted."

**Opening Scene:** A CI job runs on every PR to `main`. The job needs to know: is there an active BMAD epic that is mid-implementation? If yes, warn the PR author.

**Rising Action:** The CI job runs `/bmad-next --export-state > state.json`. The JSON has machine-readable fields: `current_phase`, `active_epic`, `last_successful_step`, `last_attempted`, `last_failure_reason`. A small script parses it: if `current_phase` is `implementation` and `last_attempted` is unfinished, the script comments on the PR: *"⚠ BMAD epic 3 is mid-implementation. Coordinate with the BMAD owner before merging."*

**Climax:** The PR author sees the comment, runs `/bmad-next --diff-state` locally, confirms the state, and merges or holds the PR appropriately.

**Resolution:** Stepper acts as an audit surface for the BMAD workflow without any special CI integration code in Stepper itself. The `--export-state` flag is a thin shim over data already on disk; the heavy lifting lives in the consuming script.

**Capabilities revealed:** `--export-state` JSON output, machine-readable state schema, scripting support, separation of state-as-data from state-as-UX.

### Journey Requirements Summary

The five journeys above span the full v0.1 capability surface and validate the user-facing contracts demanded by the success criteria.

| Journey | Capabilities surfaced |
|---------|------------------------|
| 1. Cold-start return (happy path) | Stateful resumption, `--explain` reasoning, single-step execution, sub-agent dispatch, verifier gate, atomic state update |
| 2. Halt recovery (edge case) | Verifier-as-halt, actionable error, `--resume`, `--skip`, errors-as-primary-UX |
| 3. First install (community) | `--doctor`, BMAD version detection, fresh-project init, DAG validation on load, marketplace flow, governance posture |
| 4. BMAD upgrade (maintainer) | Fail-loudly on unknown skills, project DAG overrides, CHANGELOG compatibility convention, maintenance moat |
| 5. CI export (automation) | `--export-state` JSON, machine-readable schema, scripting support, state-as-data separation |

Two cross-journey capabilities are implicit in every journey: **observability** — the transcript log streamed to `_bmad-output/.stepper/runs/` is the audit trail behind every operation — and **bounded autonomy** — every multi-step action either declares or defaults to a stop condition, and every sub-agent has a declared context budget and timeout.

## Innovation & Novel Patterns

### Detected Innovation Areas

Stepper introduces five novel patterns that, in combination, define a new product category — *bounded methodology-aware orchestration*. None of these patterns is independently new; the novelty is the integration into a single shippable Claude Code plugin.

1. **Methodology-aware DAG walking on top of BMAD.** Existing autonomous-loop tools (Ralph, agentic-loop) treat the codebase as a PRD-to-code engine and have no concept of BMAD stages. BMAD core ships an Orchestrator agent, but stage advancement still requires the user to invoke each agent by hand. Stepper is — as of April 2026 — the first Claude Code plugin that walks the BMAD DAG end-to-end, with phase-aware stop conditions and per-step persona resolution.
2. **Bounded autonomy as a first-class product category.** Eight stop-condition types, mandatory checkpoints, file-lock heartbeats, atomic writes, branch+sha snapshots, `--plan-first` dry-run, `--token-budget` cap. Safety is not a wrapper added after launch; it is the product. This positioning directly addresses the runaway-cost and runaway-edit risks that mainstream criticism pins on autonomous loops, and it is what makes nightly unattended `/bmad-loop` runs trustable.
3. **File-as-truth state machine for stateful AI workflows.** Most AI-agent workflows treat session memory or vector DBs as state. Stepper inverts: files on disk are the source of truth; `state.yaml` is a write-through cache; frontmatter is authoritative per document. State is recomputable from disk via `--recompute-state` at any moment. This makes Stepper independent of any Claude Code session, restartable across machines, auditable via Git, and compatible with branch-based parallel work.
4. **Read-only upstream respect as a strategic moat.** Stepper does not vendor or fork BMAD skills. New BMAD releases require zero merge work in Stepper unless the registry auto-detection finds an unknown skill it cannot place in the DAG (in which case it fails loudly with a remediation hint). Any fork-based competitor pays exponential merge cost on every BMAD release; Stepper pays zero. This compounds as a long-term cost-of-ownership moat against any fork-based entrant.
5. **Context engineering as packaged product, not abstract pattern.** Anthropic explicitly framed *context engineering* (compaction, structured note-taking, multi-agent handoffs) as the new discipline in April 2026. Stepper operationalizes it: every heavy task runs in an isolated sub-agent with declared context budget and file-based I/O; the main thread logs one or two lines per step; sub-agents do not decide what comes next; sub-agents do not validate their own output. This is a textbook, shippable implementation that other dev tooling has only described.

CSV signal `New paradigm` (from `developer_tool` project type) is matched: Stepper proposes a paradigm — *bounded methodology-aware orchestration* — that is not adequately served by *autonomous-loop tools*, *PRD-to-code engines*, *thin install wrappers*, or *single-shot agent invokers*.

### Market Context & Competitive Landscape

| Adjacent product | Closest overlap with Stepper | Where Stepper differs |
|------------------|------------------------------|------------------------|
| **Ralph (snarktank)** | Autonomous loop re-running Claude Code CLI against `prd.json` until user stories pass. Validates demand for set-and-loop autonomy. | No methodology awareness, no DAG walking, no stage-specific stop conditions. Stepper adds methodology guardrails, eight stop-condition types, and per-step verifiers. |
| **agentic-loop (allierays)** | Claude Code toolkit fusing Ralph-style loops with PRD-driven dev. | PRD-to-code only; no analysis/planning/solutioning/retro phases. Stepper covers the full BMAD lifecycle. |
| **PabloLION/bmad-plugin** | Thin `npx bmad-method install` wrapper. Sets the floor for BMAD distribution. | Does not add a stepper or loop layer; stage advancement remains manual. Stepper layers orchestration on top of the same install. |
| **BMAD-METHOD core (v6.3.0, Apr 2026)** | Official Analyst/PM/Architect/SM/Dev/QA personas + Orchestrator agent. | Stage advancement is still manual; user invokes each agent by hand. Stepper automates the "invoke next agent" step while keeping orchestration on the main thread. |
| **Cursor / Cline / Aider Agent modes** | IDE/terminal agents focused on edit-loops. | Optimized for the dev/implementation phase only; no structured product-discovery stages. Stepper covers analysis through retro. |
| **Awesome-Claude-Code marketplace (9,000+ plugins)** | Sprawling plugin ecosystem. | Few BMAD-aware plugins; no observed BMAD-lifecycle stepper as of April 2026. Stepper occupies the gap. |

The window for a BMAD-aware stepper is open *now*: BMAD v6.3 (April 2026) shipped marketplace primitives, parallel stories, and agent consolidation; the Claude Code plugin ecosystem grew from zero to 9,000+ in five months; Anthropic's framing of context engineering as a distinct discipline gives Stepper a clean narrative to ride; Aider's 4.1M installs prove that terminal-native, model-agnostic AI tooling adopts at scale.

### Validation Approach

Innovation is validated empirically against the *primary user* before any community claim is made. The validation hierarchy is intentionally narrow:

1. **Dogfood validation (primary).** The author runs Stepper daily on `makistack` and at least one secondary project for ≥30 consecutive days. If `/bmad-next` does not become the default first command after `cd`, the innovation claims are not validated regardless of community reception.
2. **Baseline-locked epic comparison.** The first complete Stepper-driven epic on `makistack` locks the baseline for *time-to-complete*; subsequent epics are measured against it. The target percentage reduction is set after baseline (deferred per Success Criteria), but the methodology — measure same-author same-project epics with and without Stepper — is fixed.
3. **Local telemetry signals.** Opt-in local telemetry tracks step timing, retry rates, and verifier failure patterns. After 30 days of dogfood data, the author compares observed signals to the qualitative claims in this PRD. Anomalies (e.g., `retry rate > 10%` on a specific step) trigger investigation, not feature-cuts.
4. **Community signals (track, do not optimize).** Marketplace installs, GitHub stars, and community-filed issues are tracked but never drive feature decisions. A community-filed issue is acted on only when it overlaps with the author's personal use.
5. **BMAD compatibility CI.** Every BMAD upstream minor release is tested against Stepper via `--doctor` in CI; the CHANGELOG's *BMAD Compatibility* section is filled per Stepper release. This validates the *maintenance moat* innovation continuously, not just at v0.1.0.

### Risk Mitigation

Each innovation carries a specific failure mode. Mitigations are pre-declared and built into v0.1, not deferred to v0.x.

| Innovation | Failure mode | Pre-declared mitigation |
|------------|--------------|-------------------------|
| Methodology-aware DAG walking | DAG cycle / missing precondition / unknown upstream skill | DAG validation on every load, fail-loudly on unknown skills with remediation hint, project-level overrides via `bmad-stepper.config.yaml` |
| Bounded autonomy | Loop runs too long, edits too aggressively, or burns tokens unexpectedly | Eight stop-condition types, `--plan-first` mandatory-by-convention before nightly runs, `--token-budget` cap, `--max-iters` cap, mandatory checkpoint snapshots before destructive steps |
| File-as-truth state machine | `state.yaml` drifts silently from files | `--diff-state` reports any divergence, `--recompute-state` is one command, `state.yaml` is treated as a hint not authoritative, schema-versioned with migrations |
| Read-only upstream moat | BMAD upstream pivots in a way Stepper cannot follow | `--doctor` flags incompatibilities at run time, CHANGELOG tracks compatibility per release, fail-loudly on unknown skills means breakage is visible immediately, governance posture explicitly allows shelving the project (kill criterion) |
| Context engineering as product | Sub-agent isolation degrades quality (over-isolated sub-agents lose useful context) | Declared context budget per task includes relevant files; sub-agent task spec mandates `CONTEXT` section listing input files; verifier is a separate step — if isolation harms quality, verifier failure rate rises and surfaces the problem in telemetry |

A general fallback applies across innovations: if v0.1 cannot validate an innovation claim within 60 days of dogfooding, the claim is removed from the README, the relevant feature is reduced in scope or removed, and the PRD is updated. The kill criterion (>50% manual sessions after 60 days) is the meta-fallback that retires the entire project if dogfooding never converges.

## Developer-Tool Specific Requirements

### Project-Type Overview

Stepper is shipped as a Claude Code plugin — a developer tool whose primary distribution channel is the Claude Code marketplace, not npm or PyPI. Its API surface is two slash commands plus a YAML config file. The "tool" concept blends three roles: (a) a CLI command surface from the user perspective, (b) a workflow orchestrator from the system perspective, and (c) a package consumed by the Claude Code plugin runtime. Each role drives a distinct documentation track in v0.1.

### Language Matrix

- **Implementation language:** TypeScript on Bun runtime.
- **TypeScript target:** strict mode, ES2022 target, ESM modules.
- **Bun version:** ≥1.1 at v0.1.0; tracks Bun stable releases per Stepper minor.
- **No Node.js compatibility commitment in v0.1.** Bun is the only supported runtime. Node compat is evaluated post-v0.1 only if a contributor commits to long-term maintenance.
- **No transpilation step shipped.** Source files are the release artifact; Bun runs `.ts` directly.
- **External user code via `bmad-stepper.config.yaml` only.** No plugin authors execute custom TypeScript inside Stepper.

### Installation Methods

| Method | Command | Notes |
|--------|---------|-------|
| Marketplace install (recommended) | `/plugin marketplace add Tgorka/bmad-stepper` | Per-project (under `.claude/plugins/`) or per-user (under `~/.claude/plugins/`) at user choice |
| Manual install (fallback) | Clone repo, copy plugin manifest | Documented but not the recommended path |
| Upgrade | `/bmad-next --upgrade` | Checks GitHub Releases; reports current vs. latest; prompts user |
| Uninstall | `/plugin marketplace remove Tgorka/bmad-stepper` | Removes the plugin only; `_bmad-output/.stepper/` data is left intact for the user to handle |

Installation prerequisites are checked at first run by `--doctor`:

- BMAD installed (`npx bmad-method install --tools claude-code` or equivalent).
- BMAD version compatible with Stepper version (per CHANGELOG *BMAD Compatibility* section).
- Project root contains `_bmad/` ancestor.
- Filesystem supports atomic rename (warn on NFS, iCloud sync, network FS).

### API Surface

Stepper has three API surfaces, in order of stability:

1. **Slash command surface (most stable).** `/bmad-next` and `/bmad-loop` with their flag inventories. Stable within a Stepper MAJOR version.
2. **Config file surface (medium stability).** `bmad-stepper.config.yaml` schema. Schema-versioned with Zod migrations. Backward-compatible across MINOR versions.
3. **Internal sub-agent dispatch contract (lowest stability in v0.x).** Sub-agent task spec template (PERSONA / CONTEXT / TASK / OUTPUT FORMAT / SUCCESS CRITERIA / CONSTRAINTS). Considered internal in v0.1; not a public API; may change between MINOR versions until v1.0.

State files (`state.yaml`, run logs, telemetry reports) are *user-readable* but not *programmatic API*. The `--export-state` JSON output is the only programmatic state-as-data contract; its shape is stable within a Stepper MAJOR version.

### Code Examples

The README and getting-started docs ship at v0.1.0 with seven worked examples:

1. **Cold-start return** — `/bmad-next --explain` after returning to a project.
2. **Single-step execution** — `/bmad-next` with no flags.
3. **Bounded loop overnight** — `/bmad-loop --until-epic-end --plan-first --token-budget 200k --checkpoint-each implementation`.
4. **Halt recovery** — `/bmad-next --resume` after a verifier failure.
5. **Skip on persistent failure** — `/bmad-next --skip <step> --resume`.
6. **Doctor diagnostic** — `/bmad-next --doctor` after a BMAD upgrade.
7. **State export for CI** — `/bmad-next --export-state > state.json`.

Each example pairs the command with expected output and a short narrative. Examples live in `examples/` in the repo and are linked from the README; CI validates that the command syntax in examples parses correctly against the actual flag schema.

### Migration Guide

Migration concerns at this stage are exclusively about *BMAD upstream compatibility*, not legacy data formats (Stepper has no v0 to migrate from).

- **BMAD upstream version changes** — handled by `--doctor` at run time and the CHANGELOG's *BMAD Compatibility* section per Stepper release. When a new BMAD release adds skills, Stepper either ships built-in placements (in the next minor) or the user supplies project-level overrides via `bmad-stepper.config.yaml`.
- **Stepper schema migrations** — `state.yaml` carries a version field; loading older versions runs Zod-defined migrations automatically; corrupted state surfaces actionable errors.
- **Stepper MAJOR version bumps** — semver discipline: MAJOR = plugin API break, MINOR = features, PATCH = fix. A migration guide ships in CHANGELOG with concrete before/after examples for any MAJOR bump.

### Command Structure (CLI Augmentation)

The two commands have a parallel internal structure:

```
/bmad-next [<step-id>] [scope-flags] [behavior-flags] [diagnostic-flags]
/bmad-loop [stop-conditions]+         [behavior-flags] [diagnostic-flags]
```

- **Scope flags** (`--epic`, `--story`, `--phase`, `--persona`, `--include-optional`, `--no-optional`) narrow which step Stepper considers next.
- **Behavior flags** (`--dry-run`, `--resume`, `--auto-fix`, `--interactive`, `--checkpoint-each`) modify execution semantics.
- **Stop-condition flags** (`--until-epic-end`, `--until-story`, `--max-iters`, `--time-budget`, `--token-budget`, `--stop-on-error`, `--continue-on-error`) are required (or default-supplied) for `/bmad-loop`.
- **Diagnostic flags** (`--explain`, `--list`, `--doctor`, `--upgrade`, `--recompute-state`, `--export-state`, `--diff-state`, `--watch`, `--plan-first`) produce no state changes (read-only), except `--upgrade` and `--recompute-state`.

`/bmad-next` with no flags is the canonical invocation: zero-config, computes next step, dispatches sub-agent, advances state. Every other invocation form is an override or inspection.

### Output Formats

- **Main thread output** — single human-readable line per step (`Dispatching <step> → sub-agent (<model>, <budget>, <timeout>)` and `✓ <step> complete. Next: <next step>`).
- **Transcript log per run** — verbose markdown stream to `_bmad-output/.stepper/runs/<ts>-<step>.log`. Includes sub-agent prompt, sub-agent output, verifier result, state delta. Human-readable and Git-friendly.
- **Machine-readable run log** — JSON at `_bmad-output/.stepper/runs/<ts>-<step>.json`. Schema-versioned. Used by `--export-state`, `--diff-state`, telemetry.
- **Telemetry report** — local human-readable markdown at `_bmad-output/.stepper/telemetry/<period>.md`. Aggregates step timing, retry rates, verifier failure patterns.
- **Errors** — actionable single-line summary on the main thread; full report in run log. No stack traces on the main thread.

### Configuration Schema

Project-level: `bmad-stepper.config.yaml` (committed to repo or git-ignored at user choice). User-level: `~/.config/bmad-stepper/config.yaml` (optional). Project overrides user.

Top-level config keys (all optional; sensible defaults if omitted):

- `version` — config schema version (Zod-validated, migrated on load).
- `personas` — map of `{step-name: persona-name}` overrides.
- `overrides` — map of `{skill-name: {phase, after, before, optional}}` for DAG placement of unknown upstream skills.
- `verifiers` — map of `{step-name: {required-sections, schema}}` overrides.
- `failure-policies` — default policy per step (`retry` / `skip` / `route-to-fixer` / `escalate`); fallback `escalate`.
- `telemetry` — `enabled: bool` (default `false`).
- `models` — map of `{step-name: model-id}` to pin specific models per step (Sonnet / Opus / Haiku).
- `budgets` — default context budget and timeout per step.
- `paths` — overrides for state file location, runs directory, telemetry directory.

The schema is fully documented in `docs/configuration.md` shipped with v0.1.

### Scripting Support

Stepper is callable from non-interactive contexts (CI, cron, shell scripts) via `--export-state`, `--diff-state`, `--list`, `--explain`, `--dry-run`. These flags are read-only or write-only-to-staging — they never advance state without explicit user instruction.

- **Exit codes:** 0 = success, 1 = halt-with-actionable-error, 2 = configuration error, 3 = BMAD compatibility error, 4 = lock contention, 5 = pathological input.
- **Stdin/stdout discipline:** `--export-state` writes JSON to stdout only; all other diagnostics go to stderr; the main run-log stream is on disk, never on stdout/stderr.
- **Idempotency:** `--list`, `--explain`, `--dry-run`, `--export-state`, `--diff-state` are safe to run repeatedly without side effects.
- **Lock semantics in non-interactive use:** `--export-state` does not require the project lock; advancing flags do.

This makes Stepper composable: a CI job can run `/bmad-next --export-state > state.json` without holding the lock or risking a state advance. Scripting examples ship in `examples/scripting/`.

### Sub-Agent Dispatch Contract

Every heavy task is delegated to an isolated sub-agent. The dispatch contract is six-section, mandatory in every sub-agent invocation:

```
PERSONA          — which BMAD persona owns this work
CONTEXT          — input files, frontmatter snippets, prior step outputs
TASK             — single clear deliverable (one artifact)
OUTPUT FORMAT    — schema, required sections, file location in staging dir
SUCCESS CRITERIA — verifier-checkable conditions
CONSTRAINTS      — allowed tools, scope limits, what NOT to do
```

Operational discipline:

- Sub-agent **does not decide what comes next.** Orchestration stays main-thread.
- Sub-agent **does not validate its own output.** Verifier runs as a separate step.
- Sub-agent **does not interact with the user.** File-in, file-out only.
- Sub-agent **has a declared context budget** (default 60k) and **timeout** (default 5 min) per task; both overrideable via config.
- Sub-agent writes to `_bmad-output/.stepper/staging/<run-id>/` first; main thread promotes to final location only after the verifier passes.
- Sub-agent run is fully captured in the transcript log under `_bmad-output/.stepper/runs/<ts>-<step>.log` for audit.

This contract is internal to v0.1 (not public API), but it is documented in `AGENTS.md` so contributors can reason about sub-agent boundaries.

### State Machine Invariants

State has three layers with explicit precedence:

1. **Files** (BMAD artifacts: PRD, architecture docs, stories, retros). Source of truth.
2. **`_bmad-output/.stepper/state.yaml`**. Write-through cache. Tracks `last_successful_step`, `last_attempted`, `last_failure_reason`.
3. **Frontmatter** inside artifacts. Authoritative for that document's status and metadata.

Hard invariants enforced in v0.1:

- **State is recomputable from files alone.** `--recompute-state` rebuilds `state.yaml` from disk; cache is never the sole source of truth.
- **All state writes are atomic.** Tmp+rename always; `.bak` backup before destructive ops; fallback for filesystems without atomic rename (warn the user).
- **`state.yaml.lock` with PID + heartbeat.** Stale-lock detection; exclusive per project root.
- **Halt on branch switch.** Stepper detects branch+sha mismatch since the last run and halts with a prompt rather than trusting cached state across branches.
- **Schema-versioned with Zod migrations.** Loading older state runs migrations; corrupted state surfaces actionable errors, not stack traces.
- **`--diff-state` reports cache-vs-files divergence.** Visible drift, never silent.

### Bounded-Autonomy Guarantees

`/bmad-loop` is bounded by construction. Eight stop-condition types, each with declared semantics:

| Stop condition | Trigger | Exit behavior |
|----------------|---------|----------------|
| `epic-end` | Current epic phase complete (all stories shipped + retro filed) | Clean exit, transcript archived, `state.yaml` snapshot |
| `story-N` | Declared story id reached or completed | Clean exit, transcript archived |
| `next-story` | Next story boundary | Clean exit, transcript archived |
| `phase-end` | BMAD phase transition | Clean exit, transcript archived |
| `max-iters N` | Hard step-count cap | Clean exit, exit reason logged |
| `time-budget` | Wall-clock cap | Clean exit, partial work committed |
| `token-budget` | API token spend cap | Clean exit, partial work committed |
| `error` | First failed verifier (with `--stop-on-error`) | Halt with actionable error, `--resume` available |
| `manual` | SIGINT-handled graceful exit | In-flight sub-agent allowed to finish current write, then halt; `--resume` available |

All stop conditions emit a human-readable exit reason, a state snapshot pointer, and a `--resume` invocation hint. `--plan-first` previews the loop's planned step sequence before committing tokens — by convention, used before any nightly unattended run.

`--max-iters` defaults to 50 if no other stop condition is supplied, preventing accidental infinite loops. `--continue-on-error` is opt-in; the default is `--stop-on-error`.

### Runaway-Loop Safety

In addition to stop conditions:

- **Mandatory checkpoint snapshots** before destructive steps: branch + sha recorded; `.bak` of any modified file.
- **`--token-budget` cap:** when the cap is approached, the loop emits a warning at 80% and halts at 100%.
- **`--time-budget` cap:** same warning/halt pattern.
- **`--checkpoint-each <step-type>`:** forces a checkpoint after every step of a given type (e.g., `--checkpoint-each implementation` snapshots after every dev-story).
- **Pathological-input guards:** 50k-line PRD warning + paginated read; 50MB `state.yaml` size guard with halt; UTF-8 enforcement on filenames; 200-issue review pagination; lazy-load registry for 100 epics × 1000 stories; configurable epic file-name pattern.
- **Halt on branch switch:** Stepper detects external branch change between iterations and halts; user must `--resume` after deciding whether the cached state is still valid for the new branch.
- **Halt on plugin update mid-loop:** detected by hash check; user prompted to restart.

### Dogfood Validation Plan

Operationalizes how the primary user verifies success during the v0.1 cycle:

- **Daily journal entry** — a one-line note per session in `_bmad-output/.stepper/journal/<date>.md` capturing "did `/bmad-next` get used? if not, why?". Kept for 60 days post-v0.1.0.
- **Weekly review** — every Sunday, the author skims the week's journal entries plus the telemetry report. If the week's `manual session %` exceeds 50%, the entry is flagged for investigation.
- **First-epic baseline** — the first complete Stepper-driven epic on `makistack` is the baseline for *time-to-complete*; baseline is locked at the retrospective step of that epic.
- **60-day decision** — at day 60, the author decides: continue (success criteria met), pivot (specific feature is broken; fix and re-test), or shelve (kill criterion triggered). The decision is written into `RETROSPECTIVE.md` and posted as a GitHub release note.
- **Public dogfood signal** — release notes for every minor version include a one-line dogfood-status claim: e.g., *"Currently the author's default `/bmad-next` daily on `makistack` and `bmad-stepper`."* Honest signal beats marketing claim.

### Implementation Considerations

- **Linux + macOS first.** CI matrix runs Linux + macOS on Bun latest. Windows users run via WSL; native Windows is post-v0.1 only if a contributor commits to long-term maintenance.
- **No runtime dependencies in the plugin itself.** Stepper is TypeScript code; runtime deps are restricted to Bun standard library + Zod for schema validation. No Node-only deps.
- **Source = release.** No `dist/` build step is shipped; Bun runs `.ts` directly. Plugin manifest at `.claude-plugin/plugin.json` points to source files.
- **Test discipline.** `bun test` runs smoke + integration tests. Integration tests cover all eight stop conditions, all four failure-UX modes, and `--doctor` against a fixture BMAD install. Smoke tests cover happy-path `/bmad-next` and `/bmad-loop` invocations.
- **Linting/formatting.** Biome only; no ESLint, no Prettier.
- **Versioning.** Changesets for a semi-manual release flow (PR-based). MAJOR = plugin API break, MINOR = features, PATCH = fix.

This is a developer tool that, by virtue of being a Claude Code plugin, deliberately avoids most of the surface area of traditional dev tooling (no SDK, no IDE integration, no public API). What remains — slash commands, config schema, sub-agent contract — is documented exhaustively because that *is* the entire user interface.

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** Problem-solving + experience MVP. The minimum that makes the primary user say *"this is useful"* is *both commands fully implemented with the safety net intact*. A scaffolding-only stub of `/bmad-loop` would fail the dogfood test on day one — the author would not trust it overnight, and trust is the entire product. Therefore the MVP ships the full v0.1 surface (see Product Scope) rather than a thinner subset.

**Resource Requirements:** Single maintainer (the author). No team, no contractors. Estimated solo effort: 3-6 weeks of focused work for v0.1.0. The calendar timeline is open-ended (this is a personal project), but the token budget per Stepper feature is tracked via the same telemetry the product produces.

**Validated learning, not feature breadth.** The fastest path to validated learning is the dogfood loop on `makistack`: ship v0.1.0, run real epics, measure whether `/bmad-next` becomes the default first command. Every additional v0.1 feature is justified against *"would the dogfood loop fail without this?"* not *"would users like this?"*.

### Phase Boundaries

This PRD's phased scope is documented under **Product Scope** above:

- **MVP — v0.1.0:** both commands fully implemented, full flag inventory, hybrid state model, sub-agent dispatch, eight stop conditions, four failure-UX modes, opt-in local telemetry, `--doctor`, `--upgrade`, README + getting-started docs, Linux + macOS via Bun.
- **Growth — Post-MVP:** parallel sub-agent dispatch, named profiles, opt-in remote telemetry, GitHub Pages docs, `bmad-prev`/`--undo-last`, Stacked-PRs / Graphite integration. Each is gated on real demand from the primary user or a qualifying community signal.
- **Vision — 2- to 3-year horizon:** reliability and sustainability, not breadth. Telemetry may grow into a community benchmark. Explicit non-goals: not merging into BMAD core, not becoming a generic stepper, not chasing enterprise features.

No requirement from input documents has been silently moved to a later phase. The user-confirmed decision in PRD step 2 was *"ship both commands fully"* in v0.1 (closing the open question §18 of the brief distillate). This is preserved.

### Risk Mitigation Strategy

**Technical risks:**

- *Verifier strength is a balance* (too weak → ships bad work; too strict → halts constantly). Mitigation: v0.1 ships a conservative verifier (file-existence, schema validation, frontmatter completeness); telemetry tracks verifier failure patterns; verifier evolution is data-driven.
- *Step registry auto-generation accuracy* (parse skill frontmatter vs. naming convention vs. hand-curated YAML overrides) is a known open design. Mitigation: fail-loudly on unknown skills with remediation hint; project-level overrides as escape hatch; final discovery mechanism deferred to architecture phase.
- *Concurrency edge cases on macOS* (NFS, iCloud sync, Time Machine snapshots). Mitigation: file-lock + PID heartbeat + halt-on-branch-switch + atomic-rename fallback; documented limits.
- *BMAD upstream methodology drift* (v6.3 already consolidated four agents into Amelia; v6.4 may restructure further). Mitigation: `--doctor`, declared compatibility per CHANGELOG, fail-loudly on unknown skills, governance posture explicitly allows shelving.

**Market risks:**

- *No demand from the BMAD community.* Acceptable. The primary user is the author; community adoption is a bonus, not a target. The kill criterion is dogfood-driven, not adoption-driven.
- *BMAD community adopts a competing tool* (e.g., a forked plugin that bundles BMAD skills). Acceptable under the maintenance-moat reasoning: forking is exponential cost; Stepper's read-only respect is a long-term moat that compounds in Stepper's favor.
- *Anthropic ships a built-in BMAD orchestrator inside Claude Code itself.* Possible but unlikely within the v0.1 horizon. If it happens, the dogfood loop continues uninterrupted; Stepper either deprecates gracefully or migrates its value-adds (sub-agent isolation, file-as-truth state) into the new ecosystem.

**Resource risks:**

- *Single-maintainer burnout or abandonment.* Mitigated by the explicit governance posture: no roadmap commitments, contributions evaluated against personal use, project deliberately stays small. The kill criterion is a sustainability tool — shelving cleanly is preferable to drift.
- *Time budget exceeds 6 weeks.* Acceptable. v0.1 ships when ready, not on a deadline. The single hard constraint is *dogfood-test the moment v0.1 ships* — no ship-without-trying-it-first.
- *Token budget for Stepper development exceeds reasonable.* Tracked via the same telemetry the product produces (eat-your-own-dogfood on cost discipline). If a Stepper-development epic burns more tokens than expected on `bmad-stepper` itself, that is a data point about Stepper ergonomics, not just a budget issue.

## Functional Requirements

This is the capability contract for v0.1.0. Every feature implemented downstream must trace back to one or more FRs here. FRs state *what* capability exists, not *how* it is implemented.

### Stateful Workflow Orchestration

- **FR1:** Users can have Stepper compute the next BMAD step from project files alone, with no manual state declaration (`/bmad-next` zero-config).
- **FR2:** Users can rebuild the cached state from files of truth (`--recompute-state`).
- **FR3:** Users can inspect divergence between the cache and files of truth (`--diff-state`).
- **FR4:** Users can export the current state as machine-readable JSON (`--export-state`).
- **FR5:** System can recover correct state after any halt, branch switch, or session restart using files alone.
- **FR6:** System validates all state files against a versioned schema on load and surfaces actionable errors on corruption.
- **FR7:** System applies schema migrations automatically on load when the state schema version is older than the runtime.

### Step Execution & Dispatch

- **FR8:** Users can advance a single BMAD step (`/bmad-next`).
- **FR9:** Users can preview a step without executing it (`--dry-run`).
- **FR10:** Users can override the step that Stepper would otherwise compute (`--step <id>`).
- **FR11:** Users can narrow step computation by epic, story, or phase (`--epic`, `--story`, `--phase`).
- **FR12:** Users can override the persona used for a step (`--persona`).
- **FR13:** Users can request the reasoning Stepper used to select the next step (`--explain`).
- **FR14:** Users can list candidate next steps with their preconditions (`--list`).
- **FR15:** Users can include or exclude optional steps from candidate computation (`--include-optional` / `--no-optional`).
- **FR16:** System dispatches each heavy task to an isolated sub-agent with declared context budget and timeout.
- **FR17:** System runs a verifier on every sub-agent output before promoting it to the canonical artifact location.
- **FR18:** System logs main-thread output as one or two human-readable lines per step.

### Bounded Loop Execution

- **FR19:** Users can chain step execution until a declared stop condition fires (`/bmad-loop`).
- **FR20:** Users can declare any of eight stop-condition types: `epic-end`, `story-X-Y`, `next-story`, `phase-end`, `max-iters`, `time-budget`, `token-budget`, `error`.
- **FR21:** Users can preview the loop's planned step sequence before committing tokens (`--plan-first`).
- **FR22:** Users can force a checkpoint snapshot after every step of a given type (`--checkpoint-each`).
- **FR23:** Users can cap the loop's wall-clock time, API token spend, or iteration count (`--time-budget`, `--token-budget`, `--max-iters`).
- **FR24:** Users can interrupt a running loop with SIGINT and have Stepper exit cleanly with state preserved.
- **FR25:** System enforces a default `max-iters` cap when no other stop condition is supplied, preventing accidental infinite loops.
- **FR26:** System emits a human-readable exit reason, state-snapshot pointer, and `--resume` invocation hint on every loop exit.

### Failure Handling & Recovery

- **FR27:** Users can resume from the last attempted step after any halt (`--resume`).
- **FR28:** Users can skip a failing step and resume (`--skip <step> --resume`).
- **FR29:** Users can request a fixer sub-agent to retry a failure (`--auto-fix`).
- **FR30:** Users can pause for manual confirmation between steps in a loop (`--interactive`).
- **FR31:** Users can configure a per-step failure policy (retry / skip / route-to-fixer / escalate) via the config file.
- **FR32:** System produces an actionable, human-readable error report on every halt with no stack traces on the main thread.
- **FR33:** System records `last_attempted`, `last_successful_step`, and `last_failure_reason` to `state.yaml` for every halt.

### Configuration & Customization

- **FR34:** Users can configure Stepper via a project-level YAML file (`bmad-stepper.config.yaml`).
- **FR35:** Users can supply DAG placement overrides for unknown upstream BMAD skills (`overrides:` block in config).
- **FR36:** Users can pin a specific model (Sonnet / Opus / Haiku) per step (`models:` block).
- **FR37:** Users can override sub-agent context budget and timeout per step (`budgets:` block).
- **FR38:** Users can override verifier required-sections and schema per step (`verifiers:` block).
- **FR39:** Users can opt in to local telemetry collection (`telemetry: enabled: true`).
- **FR40:** System loads project-level config that overrides user-level config that overrides plugin defaults, with the resolution rule documented.

### Diagnostics & Observability

- **FR41:** Users can run a diagnostic that reports BMAD compatibility, state file presence, and DAG validity (`--doctor`).
- **FR42:** Users can stream the live transcript of a running loop (`--watch`).
- **FR43:** System writes a per-step transcript log (markdown) to `_bmad-output/.stepper/runs/<ts>-<step>.log`.
- **FR44:** System writes a per-step machine-readable run log (JSON) to `_bmad-output/.stepper/runs/<ts>-<step>.json`.
- **FR45:** System produces a local human-readable telemetry report aggregating step timing, retry rates, and verifier failure patterns when telemetry is enabled.
- **FR46:** System emits an actionable single-line error summary on the main thread and full details to the run log on every error.

### Distribution & Lifecycle

- **FR47:** Users can install Stepper from the Claude Code marketplace (`/plugin marketplace add Tgorka/bmad-stepper`).
- **FR48:** Users can check for and install Stepper updates (`--upgrade`).
- **FR49:** Users can uninstall Stepper while preserving local state data in `_bmad-output/.stepper/`.
- **FR50:** System detects the installed BMAD version and validates compatibility on first run via `--doctor`.
- **FR51:** System fails loudly with a remediation hint when a BMAD skill is detected that cannot be placed in the DAG.

### Scripting & Integration

- **FR52:** Non-interactive callers can read state without holding the project lock (`--export-state`, `--list`, `--explain`, `--dry-run`, `--diff-state`).
- **FR53:** System emits documented exit codes for distinct failure categories: 0 = success, 1 = halt-with-actionable-error, 2 = configuration error, 3 = BMAD compatibility error, 4 = lock contention, 5 = pathological input.
- **FR54:** System enforces stdout/stderr discipline so `--export-state` JSON output is safely pipeable while diagnostics are routed to stderr.

This list is binding. Any feature not listed here will not exist in v0.1.0 unless an explicit PRD amendment is made.

## Non-Functional Requirements

NFR coverage is selective: only categories that materially affect the product appear here. Accessibility is out of scope (Stepper has no GUI), and traditional B2B scalability concerns are replaced with single-project pathological-input scaling.

### Performance

- **NFR-P1: Next-step computation completes within 500 ms p95** for projects up to 50 epics × 50 stories on a typical SSD. Measured from `/bmad-next` invocation to the first main-thread log line.
- **NFR-P2: State recompute (`--recompute-state`) completes within 5 seconds** for projects up to 100 epics × 1000 stories.
- **NFR-P3: Sub-agent dispatch overhead (main-thread time, excluding sub-agent execution) is under 200 ms p95.**
- **NFR-P4: Transcript log streaming has zero observable impact on main-thread latency** during loop execution.
- **NFR-P5: Loading a `state.yaml` of up to 1 MB takes under 100 ms.** Above 1 MB Stepper warns; above 50 MB Stepper halts and recommends `--recompute-state`.
- **NFR-P6: Telemetry report generation completes within 2 seconds** for one week of run logs.

### Security

- **NFR-S1: Stepper performs no network I/O on the main thread** except for explicit `--upgrade` and Claude Code plugin marketplace operations. Sub-agents follow Claude Code's standard model API path.
- **NFR-S2: Stepper writes only inside the project root and the user's `~/.claude/plugins/` directory.** No writes to BMAD-installed files; a CI gate enforces this.
- **NFR-S3: Telemetry contains no PII, no source code, and no file paths outside the project root.** Local-only in v0.1; remote upload is not implemented.
- **NFR-S4: Sub-agent isolation enforces the declared context budget and tool restriction;** sub-agents cannot escalate access to tools not declared in their `CONSTRAINTS` section.
- **NFR-S5: State files have explicit read/write semantics:** atomic tmp+rename for writes, file locks for read-modify-write cycles, halt on lock contention rather than retry-and-overwrite.
- **NFR-S6: Stepper does not execute generated code from sub-agents** as part of dispatch. Basic linter checks are advisory; sub-agent output is artifact, not executable.

### Reliability

- **NFR-R1: Zero data loss on any halt scenario** (SIGINT, crash, branch switch, lock contention, disk full, OS kill). Atomic writes + `.bak` backups before destructive ops + branch+sha snapshots + halt-on-branch-switch enforce this.
- **NFR-R2: 100% recovery rate via `--resume`** from any halt point in v0.1. Tested in CI for all four failure-UX modes and all eight stop conditions.
- **NFR-R3: State files are recomputable from disk alone** via `--recompute-state`; the cache may always be discarded.
- **NFR-R4: Stepper halts cleanly on a stale lock** with a human-readable message and a remediation command (`--force-unlock` after PID-heartbeat detection).
- **NFR-R5: Loop interruption via SIGINT yields a graceful exit within 30 seconds.** The in-flight sub-agent is allowed to finish its current write before the halt.
- **NFR-R6: Schema migrations on `state.yaml` are idempotent.** Running an old Stepper after a new one has migrated state surfaces an actionable error, not a corrupt-state silent failure.
- **NFR-R7: All eight stop-condition paths are individually covered by integration tests.**
- **NFR-R8: All four failure-UX modes (retry, skip, route-to-fixer, escalate) are individually covered by integration tests.**

### Scalability

- **NFR-Sc1: Stepper supports up to 100 epics × 1000 stories per project** with a lazy-load registry and paginated reads. Performance degrades gracefully (per NFR-P2) but does not error.
- **NFR-Sc2: PRD files up to 50,000 lines are read with pagination + warning,** not loaded fully into memory.
- **NFR-Sc3: A loop with up to 1,000 sub-agent dispatches per `/bmad-loop` invocation runs without memory leaks** in the main thread (verified by a long-run integration test).
- **NFR-Sc4: Run logs older than 90 days are auto-archived** to `_bmad-output/.stepper/runs/.archive/` to prevent unbounded growth in the active runs directory.
- **NFR-Sc5: Telemetry data older than 12 months is auto-rotated** when telemetry is enabled.

### Integration

- **NFR-I1: Stepper compatibility with BMAD-METHOD is declared per release** in the CHANGELOG's *BMAD Compatibility* section. Compatibility is tested in CI against the latest BMAD release at Stepper release time.
- **NFR-I2: Unknown upstream BMAD skills cause a fail-loud halt** with a remediation hint, not silent ignore. The project-level `overrides:` config is the documented escape hatch.
- **NFR-I3: Stepper runs against the Claude Code plugin runtime as published at v0.1.0 release time** with no patches or workarounds. Compatibility with the runtime is tested at Stepper release time.
- **NFR-I4: Stepper does not depend on any specific Claude Code session state.** Restart, model switch, or terminal close do not corrupt Stepper state; recovery is from files.
- **NFR-I5: Stepper supports running on Linux and macOS via Bun ≥1.1.** Native Windows is not supported in v0.1; WSL is the documented Windows path.

### Maintainability (single-maintainer specific)

- **NFR-M1: All FRs and NFRs map to integration tests** in v0.1 release CI; orphan requirements (no test) block release.
- **NFR-M2: Errors at every level produce actionable hints** with concrete next-action commands. Tested in CI: every error in `errors.ts` has a matching test case asserting the hint format.
- **NFR-M3: All public-facing schemas (config, state, run-log JSON) are validated by Zod** with versioned migrations. Schema changes require a Changeset entry and a migration-path test.
- **NFR-M4: The README's Quick Start section can take a fresh user to a working `/bmad-next` invocation in under 10 minutes** measured against a clean BMAD install.
- **NFR-M5: Maintenance time per Stepper release trends down post-v0.1.0.** A release exceeding 8 hours of maintainer time flags itself for retrospective in the release notes.
