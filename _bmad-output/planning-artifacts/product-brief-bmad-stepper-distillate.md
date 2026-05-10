---
title: "Product Brief Distillate: bmad-stepper"
type: llm-distillate
source: "product-brief-bmad-stepper.md"
created: "2026-04-30T03:28:37Z"
purpose: "Token-efficient context for downstream PRD creation, architecture, and dev work."
---

# Product Brief Distillate: BMAD Stepper

This is the dense overflow companion to the executive brief. Each bullet is self-contained — read any section in isolation. Use this as load-context for PRD creation, architecture design, and story writing for `bmad-stepper`.

## 1. Product Identity & Scope Boundary

- Name: BMAD Stepper. Repo: `tgorka/bmad-stepper`. License: MIT.
- Form factor: Claude Code plugin shipping two slash commands (`/bmad-next`, `/bmad-loop`) plus optional `--doctor` diagnostic.
- Scope is stepper-only. Plugin does NOT bundle BMAD skills. User installs upstream BMAD separately via `npx bmad-method install`. Stepper layers on top read-only.
- Internal-tool-first by design. Author (tgorka) is the primary user, dogfooded on `makistack` (which uses BMM, TEA, BMB, CIS, GDS modules). Open-source release is a bonus to the BMAD community, not the goal.
- Versioning is independent of BMAD upstream. Stepper semver: MAJOR = plugin API break, MINOR = features, PATCH = fix. CHANGELOG includes a "BMAD Compatibility" section per release.

## 2. Detailed User Scenarios (Problem Detail)

- Multi-project parallel work: author runs N projects in parallel terminals; switches windows mid-day; returns hours/days later; first question is always "what BMAD step is next?" — `story-create`, `dev-story`, `review`, retro? Wrong recall → redundant work or skipped step. Right recall costs cognitive load before any productive work.
- Manual chain-of-skills inside one epic: completing a single epic invokes 30+ BMAD skills across analysis → planning → solutioning → implementation → retro. Each invocation is copy-paste of args + main-conversation-window context dilution + occasional missed step.
- Story-internal repetition: a story may need several create/dev/review cycles per element, with one final wrap-up review at the end. Today fully manual: launch each cycle, track which elements are done, finally invoke wrap-up review.
- Pragmatic goal statement (verbatim from brainstorming): "eliminate the manual launching of 30+ skills per epic while preserving control over each step and not polluting the main conversation context."

## 3. CLI Surface (Full Flag Inventory from Brainstorming)

`/bmad-next` flags:
- `--step <name>` — force a specific step instead of computed next.
- `--epic <id>`, `--story <id>`, `--phase <name>` — narrow scope.
- `--dry-run` — print what would run, do not execute.
- `--resume` — resume after a prior failure or interrupt.
- `--include-optional` / `--no-optional` — toggle optional steps in DAG.
- `--persona <name>` — override step persona resolution.
- `--explain` — print why this step is next given current state.
- `--list` — show next-N candidate steps (for cold-start discoverability).

`/bmad-loop` flags:
- `--until-epic-end` — stop when current epic completes.
- `--until-story <X-Y>` — stop after specified story id.
- `--max-iters <N>` — bound by iteration count.
- `--time-budget <duration>` — bound by wall-clock (e.g. `30m`).
- `--token-budget <amount>` — bound by API token spend (D3-aware; v0.1 stop condition).
- `--stop-on-error` / `--continue-on-error` — failure policy.
- `--interactive` — pause for human confirm between steps.
- `--auto-fix` — attempt route-to-fixer on verifier failures.
- `--plan-first` — dry-run the loop's plan before committing tokens.
- `--checkpoint-each` — snapshot before each step.

State / inspection helpers:
- `--recompute-state` — rebuild `state.yaml` from files-of-truth.
- `--export-state` — emit current state as JSON for tooling.
- `--diff-state` — diff cache vs files (debug cache drift).
- `--watch` — tail live transcript stream.

## 4. Stop Conditions Spec (8 Types)

For `/bmad-loop`, semantics per type:
- `epic-end` — exits when current epic phase complete (all stories shipped + retro filed).
- `story X-Y` — exits after declared story id reached or completed.
- `next-story` — exits at next story boundary (one-story granularity).
- `phase-end` — exits at next BMAD phase transition (analysis → planning → solutioning → implementation → retro).
- `max-iters N` — hard cap on step count.
- `time-budget` — wall-clock cap.
- `error` — exits on first failed verifier (when `--stop-on-error`).
- `manual` — SIGINT-handled graceful exit; partial work committed; `--resume` picks up.

All stop conditions: emit human-readable exit reason, state snapshot pointer, and `--resume` invocation hint.

## 5. State Model

- Hybrid model. Three layers, with explicit precedence:
  1. **Files** (BMAD artifacts: PRD, architecture docs, stories, etc.) — source of truth.
  2. **`state.yaml`** at `_bmad-output/.stepper/state.yaml` — write-through cache. Tracks `last_successful_step`, `last_attempted`, `last_failure_reason`. User-readable.
  3. **Frontmatter** inside each artifact — authoritative for that document's status/metadata.
- State is recomputable from files alone via `--recompute-state` (cache is a hint, never a single source).
- Schema-versioned with migrations (Zod validation). Atomic tmp+rename writes. `state.yaml.lock` for concurrency.
- Machine logs: JSON in `_bmad-output/.stepper/runs/<ts>-<step>.log`.

## 6. Sub-Agent Dispatch Architecture

- Every heavy task delegated to an isolated sub-agent. Main thread is orchestrator only, logs 1-2 lines per step.
- Sub-agents communicate via files: input file in, output to staging dir, main thread promotes after verification. Run-id naming for orphan cleanup.
- Sub-agents do NOT decide what comes next. Orchestration stays main-thread.
- Sub-agents do NOT validate own output. Verifier runs separately.
- Sequential by default. Parallelism noted as deferred (post-v0.1).
- Default 5-min timeout. Declared context budget per task. Model-independence (Sonnet/Opus/Haiku selectable per task).

Sub-agent task spec template (always 6 sections):
- PERSONA (which BMAD persona owns this work)
- CONTEXT (input files and prior decisions)
- TASK (single clear deliverable)
- OUTPUT FORMAT (structure of expected output)
- SUCCESS CRITERIA (verifier-checkable conditions)
- CONSTRAINTS (allowed tools, scope limits)

## 7. Persona Resolution

Resolution priority order (highest wins):
1. Step frontmatter declares persona explicitly.
2. Project `bmad-stepper.config.yaml` overrides per step.
3. Plugin default mapping.

- Auto-detect persona from `_bmad/{module}/config.yaml` when present.
- Multi-persona steps supported (e.g., review = dev + tea + architect run sequentially or as parallel sub-personas).
- Named profile concept (e.g., `indie-dev`, `enterprise`) signals planned multi-segment configurability — deferred past v0.1.

## 8. Failure UX Modes

Four failure policies, selectable per step or via flag:
- `retry` — re-run sub-agent with same input (configurable max retries).
- `skip` — record skip in state, advance to next step.
- `route-to-fixer` — dispatch a "fixer" sub-agent with the failure context to attempt remediation.
- `escalate` — halt loop, surface human-readable failure report, `--resume` available.

- Errors-as-primary-UX: every error must produce an actionable hint. Tested in CI.
- Graceful SIGINT handling: in-flight sub-agent allowed to finish current write, then halt cleanly.
- `--resume` after any halt picks up from `last_attempted` step.

## 9. Safety / Concurrency Invariants

- Exclusive lock per project root: `state.yaml.lock` with PID + heartbeat (detects stale locks from crashed processes).
- Atomic tmp+rename writes for every file write. `.bak` backups before destructive ops.
- Fallback for filesystems without atomic rename (e.g., some network FS).
- Branch+sha snapshots before destructive steps. Halt on branch switch (don't trust cached state across branches).
- Never modify upstream BMAD skill files (read-only respect).

## 10. Pathological-Input Guards

- 50k-line PRD → warning + paginated read.
- 50MB `state.yaml` → size guard + alert (something has gone wrong).
- UTF-8 filename enforcement for cross-platform consistency.
- 200 review issues → paginate.
- 100 epics × 1000 stories → lazy load registry; never load all at once.
- Configurable epic file-name pattern (project-specific naming).

## 11. Step Registry (Auto-Generation Strategy)

- Auto-generated from installed BMAD skills + project overrides.
- DAG-validated on every load (cycle detection, missing-precondition detection).
- Each step declares: idempotency flag, preconditions (state checks), post-condition verifiers (output checks).
- Unknown upstream skills (skill exists but Stepper doesn't know how to place it in DAG) → fail loudly with remediation hint, don't silently ignore.
- **Open question:** exact discovery mechanism. Candidates: parse skill frontmatter, naming convention matching, hand-curated YAML override file with auto-detection of new skills. Decision deferred to architecture phase.

## 12. Verifier Strategy (Open Design Risk)

- Verifier runs after each sub-agent completes, before state advances.
- v0.1 starts conservative: file-existence checks, JSON/YAML schema validation (Zod), structural integrity (frontmatter present, required sections present).
- Future evolution may add LLM-as-judge for richer content checks.
- Verifier strength is a balance: too weak → loop ships bad work autonomously; too strict → loop halts constantly and erodes trust.
- This is a known open design risk; v0.1 ships conservative and learns from real usage on `makistack`.

## 13. Stack & Tooling Decisions

- **Language/runtime:** TypeScript on Bun. Justified by single binary, fast dev loop, native test runner.
- **Test:** Bun test (not Jest, not Vitest).
- **Linter/formatter:** Biome (not ESLint + Prettier).
- **Versioning:** Changesets.
- **Build/scripts:** package.json scripts (no Taskfile).
- **CI:** GitHub Actions, Bun lockfile cache, matrix Linux + macOS on Bun latest. Smoke + integration tests via `bun test`.
- **Source = release:** no separate `dist/` build step shipped.
- **Windows users:** run via WSL. Native Windows support is not a v0.1 commitment.

## 14. Distribution & Repo Infrastructure

- Marketplace install: `/plugin marketplace add tgorka/bmad-stepper`.
- Project or per-user scope supported. Per-project install lives at `.claude/plugins/`.
- GH Releases as stable channel. `--upgrade` and `--doctor` commands for upgrade flow.
- Plugin manifest committed: `.claude-plugin/plugin.json`.
- Repo files: README, CHANGELOG, AGENTS.md, CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md, PR + issue templates.
- `.gitignore` excludes `_bmad-output/`, `.stepper/`, `node_modules/`, `dist/`, `*.log`, `.env*`.
- Marketplace keywords: `claude-code`, `claude-code-plugin`, `bmad`, `bmad-method`, `agile`, `ai-development`.

## 15. Telemetry Posture (D3 decision: opt-in)

- v0.1 ships opt-in local telemetry. Off by default.
- When enabled, logs aggregate step timing, retry rates, and verifier failure patterns to `_bmad-output/.stepper/telemetry/` as a local human-readable report.
- No code, no PII, no remote upload in v0.1.
- Opt-in remote upload (community benchmark contribution) is a v0.x roadmap item, not v0.1.
- Foundation for future "your epic vs. median BMAD epic" benchmark — answers an empirical question nobody else can answer (BMAD throughput per phase).

## 16. Governance Posture (D2 decision)

- PRs welcome, issues read.
- Author retains final say on direction.
- No roadmap commitments to community feature requests.
- Community contributions evaluated against personal use-fit first.
- Sets honest expectations from day one; protects maintainer sustainability.

## 17. Rejected Ideas (Do Not Re-Propose)

- **Sub-agent decides next step** — REJECTED. Orchestration stays main-thread; sub-agents are leaf executors only.
- **Sub-agent self-validates output** — REJECTED. Verifier always runs as a separate step. Self-validation conflates roles.
- **Vendor / bundle BMAD skills inside Stepper** — REJECTED. Read-only respect for upstream is a maintenance moat. User installs upstream separately.
- **Taskfile + ESLint + Prettier + manual versioning + dist/ build step** — REJECTED in SCAMPER-E phase. Replaced by package.json scripts, Biome, Changesets, source-as-release.
- **Generic non-BMAD methodology stepper** — REJECTED for v0.1 (and explicitly out of scope of 2-3 year vision). Stepper stays opinionated about BMAD.
- **Merge into BMAD core** — explicitly NOT a goal. Stepper stays an independent plugin.

## 18. Open / Deferred Decisions

- **Ship one step type + scaffolding for the rest as v0.1?** Brainstorming SCAMPER-E reverse suggestion. Current scope says ship both commands fully; revisit if v0.1 implementation reveals it's too ambitious.
- **Step registry discovery mechanism** — see §11.
- **Verifier strategy evolution** — see §12.
- **When/whether to add parallel sub-agent dispatch** — sequential default in v0.1; parallelism is a future opportunity.

## 19. Competitive Intelligence

- **Ralph (snarktank)** — autonomous loop re-running Claude Code CLI against `prd.json` until user stories pass; checkpoints into `AGENTS.md`. PRD-only, not BMAD-aware. Validates the autonomous-loop demand but lacks methodology guardrails.
- **agentic-loop (allierays)** — Claude Code toolkit fusing Ralph-style loops with PRD-driven dev. Same gap: PRD-to-code only, no methodology stages.
- **PabloLION/bmad-plugin** — thin `npx bmad-method install` wrapper. Sets the floor for BMAD distribution; does NOT add stepper/loop layer.
- **BMAD-METHOD core (v6.3.0, Apr 2026)** — official Analyst/PM/Architect/SM/Dev/QA personas + Orchestrator agent. Stage advancement still manual; user invokes each agent. v6.3 added Marketplace + parallel stories + agent consolidation into "Amelia".
- **Cursor / Cline / Aider Agent modes** — IDE/terminal agents focused on edit-loops. Optimized for dev/implementation phase; no structured product-discovery stages.
- **Awesome-Claude-Code marketplaces (9,000+ plugins)** — sprawling but few BMAD-aware; no stepper for BMAD lifecycle observed as of April 2026.

## 20. Market & Timing Context

- Claude Code plugin ecosystem grew from 0 to 9,000+ in five months (as of Apr 2026). Marketplace is mature and discoverable.
- BMAD-METHOD v6.3.0 shipped 2026-04-10 with Marketplace + parallel stories + agent consolidation. Momentum is high right at Stepper's launch window.
- AI coding agents stratified into three layers: assistants (keystrokes) → agents (tasks) → orchestration platforms (workflows). Orchestration is the fastest-growing layer.
- Aider has ~4.1M installs, ~15B tokens/week — proves devs adopt terminal-native, model-agnostic AI tooling at scale.
- Anthropic engineering guidance (Apr 2026) explicitly frames "context engineering" (compaction, structured note-taking, multi-agent handoffs) as the new discipline. Stepper's sub-agent isolation + declared budgets + clean main-thread is textbook context engineering.

## 21. User Sentiment About Adjacent Tools

- BMAD praised for being "predictable" / "repeatable"; pain point is the orchestrator/manual-handoff burden.
- Cursor wins on polish; Cline/Aider win on flexibility — common complaint across all three: human still drives multi-step plans + reloads context between phases.
- Ralph reception: clear demand for "set it and let it loop" autonomy; users warn loops without methodology guardrails over-edit, drift, thrash.
- Dominant failure mode in long multi-stage AI workflows: "context pollution" + "aggressive compaction losing subtle but critical context."
- Community blogs (Benny's Mind Hack, DEV.to, Vibe Sparking) frame BMAD as "reclaiming control" but acknowledge new users get lost choosing which agent runs next — UX gap a `/bmad-next` closes directly.

## 22. Risks Acknowledged (Not Solutions)

- **Runaway autonomous loop produces large volumes of bad output** that pollute repo. Mitigation: stop conditions + checkpoints + `--plan-first` + `--token-budget`. Trust must be earned per project.
- **State cache drift** — `state.yaml` diverges from files-of-truth silently. Mitigation: `--recompute-state`, `--diff-state`, files always recomputable.
- **BMAD upstream methodology drift** — v6.3 already merged 4 agents into Amelia. Stepper registry must track. Mitigation: `--doctor`, declared compat per CHANGELOG, fail-loudly on unknown skills.
- **Concurrent invocations across terminals on macOS** edge cases (NFS, iCloud sync, Time Machine snapshots). Mitigation: file-lock + PID heartbeat, but not bullet-proof. Document limits.
- **Author burnout / single-maintainer abandonment** — governance posture (§16) sets expectations; project explicitly stays small to remain sustainable.

## 23. Success Metrics

Primary signals (must hit):
- Author uses `/bmad-next` daily, replacing manual skill chains, ≥30 consecutive days, ≥2 active projects.
- Time to complete a full epic in `makistack` drops measurably from pre-Stepper baseline. **Baseline locked during first full Stepper-driven epic; concrete target set then.**

Secondary signals (track, do not optimize for):
- Marketplace installs.
- GitHub stars.
- Community-filed issues + PRs.

**Kill criterion:** if after 60 days of v0.1 the author still reaches for manual skill chains in >50% of sessions, project shelved. Better killed cleanly than drifting into half-used tooling.

## 24. Vision Boundaries

- Stays a plugin: small surface area, fast updates, opinionated about BMAD.
- Does NOT merge into BMAD core (explicit non-goal).
- Does NOT become a generic methodology stepper (explicit non-goal).
- Does NOT chase enterprise features (explicit non-goal).
- Compatibility with upstream tracked release-by-release.
- Named profiles (`indie-dev`, `enterprise`) added when real users ask, not speculatively.
- Telemetry from v0.1 may grow into community benchmark in v0.x.
