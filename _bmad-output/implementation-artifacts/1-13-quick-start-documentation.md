---
status: done
story_id: '1.13'
story_key: 1-13-quick-start-documentation
epic: '1'
title: Quick-Start Documentation
created: '2026-05-01'
last_updated: '2026-05-01'
priority: M
estimated_effort: S
fr_coverage:
  - FR47
  - FR49
  - FR50
  - FR53
  - FR54
nfr_coverage:
  - NFR-M4
ar_coverage:
  - AR21
  - AR22
  - AR33
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/implementation-artifacts/1-1-initialize-repository-scaffold.md
  - _bmad-output/implementation-artifacts/1-2-errors-module-registry-ci-gate.md
  - _bmad-output/implementation-artifacts/1-3-logger-path-helpers-atomic-write.md
  - _bmad-output/implementation-artifacts/1-4-file-lock-with-heartbeat.md
  - _bmad-output/implementation-artifacts/1-5-schemas-migrations-skeleton.md
  - _bmad-output/implementation-artifacts/1-6-state-subsystem-load-save-recompute-skeleton.md
  - _bmad-output/implementation-artifacts/1-7-cli-argument-parser.md
  - _bmad-output/implementation-artifacts/1-8-snapshot-branch-sha-detection.md
  - _bmad-output/implementation-artifacts/1-9-bmad-detection.md
  - _bmad-output/implementation-artifacts/1-10-dag-seed-three-tier-registry.md
  - _bmad-output/implementation-artifacts/1-11-persona-resolution.md
  - _bmad-output/implementation-artifacts/1-12-bmad-next-doctor-command.md
  - _bmad/config.yaml
  - src/errors.ts
  - src/commands/doctor/run.ts
  - src/commands/doctor/checks.ts
  - src/integration/doctor-marketplace.test.ts
  - commands/bmad-doctor.md
  - commands/bmad-next.md
  - .claude-plugin/plugin.json
  - package.json
---

# Story 1.13: Quick-Start Documentation

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a fresh Stepper user (Lena's first-install scenario per PRD persona deck),
I want the `README.md` Quick Start to take me from `/plugin marketplace add tgorka/bmad-stepper` to a successful `/bmad-next --doctor` invocation in under 10 minutes,
So that the dogfood-validation NFR-M4 ("README quick-start ≤ 10 min to first `/bmad-next`") is real-world tested and I can confirm my install works end-to-end without typing any other command.

## Context Summary

This story lands the **first user-facing documentation surface** of the project — the **README Quick Start** plus two companion docs (`docs/getting-started.md`, `docs/exit-codes.md`) and a **timed-walkthrough fixture** (`tests/fixtures/quick-start-walkthrough.md`) that operationalises **NFR-M4** (10-minute dogfood walkthrough), **FR47** (marketplace install path), **FR49** (uninstall preserves `_bmad-output/.stepper/`), **FR50** (BMAD detection on first run is the user-visible diagnostic), **FR53** (documented exit codes 0–5 with examples and remediation), and **FR54** (stdout/stderr discipline visible in the dogfood transcript). Until now, Stories 1.1–1.12 have shipped foundational primitives, the lock + state + schemas + migrations subsystem, snapshot detection, BMAD detection, the DAG builder, persona resolution, and the `/bmad-next --doctor` runner — all as **source-tree deliverables**. Story 1.13 is the **last story of Epic 1** and the only documentation-only deliverable: there is **zero TypeScript code** and **zero source-tree mutation** in this story (verified by `git diff --stat` excluding `*.md` files).

Concretely, this story produces:

1. **`README.md`** (NEW — root) — the first user-facing landing page. Sections (in order): (a) a one-paragraph elevator pitch ("BMAD Stepper is a Claude Code plugin that runs the BMAD method one verifiable step at a time…"); (b) **Quick Start** (the canonical 10-minute walkthrough — install marketplace, run `/bmad-next --doctor`, expected 5-line stderr output verbatim from Story 1.12 AC-1); (c) a "What you get" feature bullet list referencing the seven worked examples by file path (full bodies ship in Epic 6 Story 6.10 — Quick-Start only LINKS forward); (d) **Uninstall preserves your data** (FR49 — explains that `/plugin marketplace remove bmad-stepper` removes only `.claude/plugins/bmad-stepper/`, never touches `_bmad-output/.stepper/`); (e) a **Documentation map** linking to `docs/getting-started.md`, `docs/exit-codes.md`, future `docs/configuration.md` (Epic 6 forward-dep), `docs/bmad-compatibility.md` (Epic 6 forward-dep); (f) **Repo links** (CHANGELOG, CONTRIBUTING, LICENSE — all of which ship in Epic 6 Story 6.10; this story only LINKS forward to placeholder paths). The Quick Start prose is the canonical timing source for NFR-M4.

2. **`docs/getting-started.md`** (NEW) — the deeper onboarding companion. Sections: (a) **Prerequisites** (Bun ≥ 1.3 per AR2; Claude Code; BMAD installed via `npx bmad-method install --tools claude-code` per Story 1.9 R2 carry-over); (b) **Installing the plugin** (long-form `/plugin marketplace add` walkthrough with troubleshooting for common errors — `BMAD_NOT_INSTALLED`, `MARKETPLACE_FETCH_FAILED`); (c) **Commands surface** (table summarising `/bmad-next`, `/bmad-next --doctor`, `/bmad-doctor` thin alias per architecture line 1678; future `/bmad-loop` and read-only flags `--list/--explain/--diff-state/--export-state/--dry-run` are LINKED forward to Epic 3/4); (d) **State location** (`_bmad-output/.stepper/state.yaml`, `state.yaml.bak` rotation, `_bmad-output/.stepper/runs/` transcripts, `staging/<run-id>/` ephemeral); (e) **Troubleshooting top-5** (BMAD missing, corrupt state, lock contention, DAG cycle, unknown skill — each with the verbatim actionable hint from `src/errors.ts`).

3. **`docs/exit-codes.md`** (NEW) — the canonical exit-code catalog per FR53 + architecture cross-cutting concern §10 ("Exit-code discipline"). Lists every code 0–5 with: the meaning, the error class(es) that raise it, an example invocation that produces it, and the verbatim remediation hint from `src/errors.ts`. Codes: **0** (success), **1** (halt-with-actionable-error — `CORRUPT_STATE`, `STATE_TOO_NEW`, `MIGRATION_FAILURE`), **2** (configuration error — `PARSE_ERROR`), **3** (BMAD compatibility error — `BMAD_NOT_INSTALLED`, `BMAD_INCOMPATIBLE`, `DAG_CYCLE`, `UNKNOWN_BMAD_SKILL`), **4** (lock contention — `LOCK_CONTENTION`), **5** (pathological input — `PATHOLOGICAL_INPUT`). Each code has a worked example from one of the six prior story scenarios where it surfaces.

4. **`tests/fixtures/quick-start-walkthrough.md`** (NEW) — the **timed-walkthrough fixture** that ships under `tests/fixtures/` (architecture line 1092 directory). This is a Markdown checklist with 8 steps + per-step time targets (totalling ≤ 10 minutes). Each step references the canonical README Quick Start section and asserts an expected observable (e.g., `bun --version` ≥ 1.3, `/bmad-next --doctor` exits 0 with the AC-1 5-line stderr output). The fixture is consumed by future test scaffolding (deferred — no smoke test required in v0.1; Epic 6 Story 6.10 marketplace-release verification will add a CI gate that walks this fixture automatically). For Story 1.13, the fixture is **prose-only** — no test code, just the walkthrough script.

This story is the **last story of Epic 1** and the **canonical documentation story** for the entire foundation phase. It does **NOT**:

- Modify any source-tree file (`src/**`, `package.json`, `tsconfig.json`, `biome.json`, etc.). Documentation-only — `git diff --stat` excluding `*.md` shows zero deltas.
- Implement the seven worked examples bodies (`docs/examples/*.md`). Per AC-4, the README "has the seven worked examples by reference (full bodies in Epic 6 Story 6.10 — these documentation files just link forward)." Story 1.13 ships only forward-pointing references; example bodies are the Story 6.10 deliverable.
- Implement `docs/configuration.md` (Epic 6 Story 6.1 — `bmad-stepper.config.yaml` schema reference) or `docs/bmad-compatibility.md` (Epic 6 — per-Stepper-release BMAD compat history per architecture line 1075). The README Documentation map LINKS forward to these placeholder paths.
- Add a CI gate for the walkthrough fixture. The fixture is prose-only in v0.1; CI automation lands in Story 6.10's marketplace release verification.
- Modify the `/bmad-next --doctor` runner or its 5-line stderr output. Story 1.12 owns that surface; Story 1.13 REPRODUCES the AC-1 5-line format verbatim in the README Quick Start. Any future change to the doctor output MUST update both the runner AND the README in the same PR (cross-reference noted in Story 1.12 carry-over line 749).
- Add a `package.json` "scripts" entry for documentation linting (e.g., markdown-lint). Documentation-only deliverable; quality gates remain `bun run check` (Biome + bun test) per Stories 1.1–1.12. Markdown lint is an Epic 6 polish item.
- Modify `commands/bmad-next.md` or `commands/bmad-doctor.md` Layer 1 slash files. Per architecture line 1678 (Story 1.12) the slash files are thin aliases delegating to `bun run src/commands/.../run.ts`; documentation about them lives in `README.md` + `docs/getting-started.md`.

It DOES land:

- The **canonical 10-minute dogfood path** documented as a single linear walkthrough in `README.md`'s Quick Start. The walkthrough is the **definitive NFR-M4 source** — any future reviewer can clone the repo, run a stopwatch against the README, and validate the ≤ 10 minute target.
- The **AC-1 5-line stderr output reproduction** verbatim in the README Quick Start (the dogfood "expected output" block). The five lines: `BMAD detected: v<version> (compatible)`, `Project: <name>`, `State file: not present (fresh project)`, `Step registry: built from <N> BMAD skills + <M> project overrides; DAG validated; no cycles`, `Suggestion: run /bmad-next to start the analysis phase.` (from `src/commands/doctor/checks.ts` per Story 1.12 AC verification line 702).
- The **FR49 uninstall semantics** explained in user-facing terms ("Removing the plugin from `.claude/plugins/bmad-stepper/` does NOT touch `_bmad-output/.stepper/`. Your project state is preserved across reinstalls; you can wipe it manually with `rm -rf _bmad-output/.stepper/` if you want a clean slate."). Per FR49 (PRD line 737) and architecture line 1379 ("FR49 | Uninstall preserves state | Documented in `README.md`; no code"), this is the **canonical README ownership** for FR49 — there is no code gate, only this documentation.
- The **FR53 exit-code catalog** in `docs/exit-codes.md` with 6 entries (0–5) each citing the exact error class(es) from `src/errors.ts` and the verbatim `actionableHint` text. The doc is the **single source of truth** for the exit-code surface visible to CI integrations and external consumers.
- The **commands surface table** in `docs/getting-started.md` summarising the v0.1 + future commands. The `/bmad-next --doctor` row points to Story 1.12 + future `/bmad-loop` rows point forward to Epic 4. Read-only flag rows (`--list`, `--explain`, etc.) point forward to Epic 3.
- The **state location convention** documentation per architecture line 1753 ("Has the `_bmad-output/.stepper/` directory tree convention documented in the README's Quick Start"). The README Quick Start has a one-paragraph state-location callout; the deeper expansion lives in `docs/getting-started.md` §State location.

This is **AR21** (errors carry `code` + `actionableHint` — verbatim quoted in `docs/exit-codes.md`), **AR22** (single-line "Run/See/Try/Check" hint — preserved when quoting hints), **AR33** (exit-code discipline — the catalog enumerates all 6 codes 0–5). It also operationalises **FR47** (marketplace install — README Quick Start is the install entry point), **FR49** (uninstall preserves — primary documentation surface), **FR50** (BMAD detection on first run — visible via `/bmad-next --doctor` 5-line output), **FR53** (documented exit codes — primary), **FR54** (stdout/stderr discipline — the README Quick Start's expected-output block shows stderr lines explicitly), **NFR-M4** (10-minute dogfood — primary; the timed-walkthrough fixture is the validation harness).

## Acceptance Criteria

The acceptance criteria below are reproduced **verbatim** from `_bmad-output/planning-artifacts/epics.md` §Story 1.13 (lines 565-572, BDD Given/When/Then format). Lines and AC labelling preserved.

**Given** a fresh user with Claude Code + BMAD installed
**When** they follow `README.md` Quick Start
**Then** they reach a successful `/bmad-next --doctor` output within 10 minutes (timed walkthrough fixture in `tests/fixtures/quick-start-walkthrough.md`)
**And** `docs/getting-started.md` complements with deeper context (commands surface, state location, troubleshooting top-5)
**And** `docs/exit-codes.md` lists every code 0–5 with examples and remediation
**And** the README has the seven worked examples by reference (full bodies in Epic 6 Story 6.10 — these documentation files just link forward)

## Tasks / Subtasks

- [x] **Task 0 — Verify pre-conditions (AC: all)**
  - [x] 0.1 Confirm `src/commands/doctor/run.ts` ships the 5-line stderr output per Story 1.12 AC-1 verification (line 702 of `_bmad-output/implementation-artifacts/1-12-bmad-next-doctor-command.md`). The README Quick Start REPRODUCES the lines verbatim — any drift between the runner output and the README is a regression. Confirm `bun run src/commands/doctor/run.ts` from the repo root produces the expected stderr in a fixture environment (or document the local-env behaviour per Story 1.12 Debug Log line 628 — the dev's local install uses the cache layout per Story 1.9 R2 carry-over).
  - [x] 0.2 Confirm `src/errors.ts` registry stays at 16 codes after Story 1.12 (per Story 1.12 AC verification line 745). The `docs/exit-codes.md` catalog enumerates the error classes mapping to each exit code; if the registry changes, the catalog must update. Verify by reading `src/errors.ts` and counting the exported error classes.
  - [x] 0.3 Confirm `commands/bmad-next.md` and `commands/bmad-doctor.md` exist (per Story 1.1 + Story 1.12). The README references both slash commands; missing slash files would break the marketplace install path (FR47) and contradict AC-1.
  - [x] 0.4 Confirm `.claude-plugin/plugin.json` exists per Story 1.1 + architecture line 1063 (FR47 — marketplace manifest). The README Quick Start install command (`/plugin marketplace add tgorka/bmad-stepper`) depends on this manifest's `name`, `version`, and `commands[]` declaration.
  - [x] 0.5 Confirm the project has NO existing `README.md` at repo root (per `ls /Users/tgorka/tg/bmad-stepper-cc/README.md` — file absent as of Story 1.12 done state). Story 1.13 CREATES the README from scratch; if a stub exists from a prior partial deliverable, document its content in Completion Notes and merge thoughtfully.
  - [x] 0.6 Confirm the project has an EMPTY `docs/` directory (per `ls /Users/tgorka/tg/bmad-stepper-cc/docs/`). Story 1.13 CREATES the first two `docs/*.md` files (`getting-started.md`, `exit-codes.md`); future docs (`configuration.md`, `bmad-compatibility.md`, `architecture.md`, `examples/*.md`) ship in Epic 6.
  - [x] 0.7 Read epics.md Story 1.13 §lines 559-572 verbatim. Confirm the AC text in §Acceptance Criteria above is character-identical.
  - [x] 0.8 Read prd.md FR47 (line 731 — marketplace install), FR49 (line 737 — uninstall preserves), FR50 (line 738 — BMAD version detection), FR53 (line 744 — exit codes), FR54 (stdout/stderr discipline), NFR-M4 (line 803 — 10-minute README quick-start dogfood). These are the FR/NFR coverage surface for Story 1.13.
  - [x] 0.9 Read architecture.md §FR/NFR mapping table (lines 1377, 1379, 1383, 1423) confirming the README/docs ownership per FR. Read line 1067 (`commands/bmad-doctor.md` Layer 1), line 1072 (`docs/getting-started.md`), line 1074 (`docs/exit-codes.md`), line 1078-1084 (the seven worked examples paths under `docs/examples/`), line 1093 (`tests/fixtures/README.md`), and line 1753 (state-location convention documented in README's Quick Start).
  - [x] 0.10 Read Story 1.12 §Carry-overs (lines 749-755) for the README ownership cross-references. Specifically: line 749 — "README MUST document FR49 uninstall semantics; reference the AC-1 5-line format verbatim for the dogfood walkthrough; keep both in sync with `src/commands/doctor/run.ts` + `src/integration/doctor-marketplace.test.ts`". Story 1.13 satisfies this carry-over.
  - [x] 0.11 Confirm baseline `bun run check` exits 0. Story 1.13 ships zero source-tree changes; the baseline test count (~311 per Story 1.12 final) must remain unchanged after this story.

- [x] **Task 1 — Create `README.md` (AC-1, AC-4)**
  - [x] 1.1 Create `README.md` at repo root. Frontmatter NOT required (this is the user-facing landing page; standard GitHub-rendered Markdown). Use H1 heading `# BMAD Stepper` as the document title.
  - [x] 1.2 Section A — **Elevator pitch** (one paragraph, ~3 sentences): "BMAD Stepper is a Claude Code plugin that runs the BMAD method one verifiable step at a time…". Mention: zero-config (`/bmad-next` works out of the box), atomic state on disk (`_bmad-output/.stepper/`), human-readable transcripts. Cite "Built on top of BMAD-Method (`bmad@bmad-method`)" — link to upstream.
  - [x] 1.3 Section B — **Quick Start** (the canonical 10-minute walkthrough). Number the steps 1–8:
    1. **Install Bun ≥ 1.3** (AR2 dependency) — `curl -fsSL https://bun.sh/install | bash` OR `brew install oven-sh/bun/bun`. Verify with `bun --version`.
    2. **Install BMAD** — `npx bmad-method install --tools claude-code` (the canonical install per `BmadNotInstalledError` actionable hint in `src/errors.ts`). Per Story 1.9 R2, this lands the plugin under `~/.claude/plugins/cache/bmad-method/bmad/<version>/` (cache layout) OR `~/.claude/plugins/bmad-method-<version>/` (spec layout); both work.
    3. **Add the Stepper plugin** — `/plugin marketplace add tgorka/bmad-stepper` (FR47 — the marketplace install path). The plugin manifest at `.claude-plugin/plugin.json` declares the `bmad-next`, `bmad-doctor` slash commands.
    4. **Run the diagnostic** — `/bmad-next --doctor` (the canonical first-run check per Story 1.12 AC-1; the `--doctor` flag dispatches to `src/commands/doctor/run.ts` per architecture lines 1590-1592 + 1678). The thin alias `/bmad-doctor` invokes the same Layer 2 runner.
    5. **Read the expected output** — show the verbatim 5-line stderr block from Story 1.12 AC-1 inside a fenced code block tagged `text` (NOT `bash` — these are stderr lines, not commands). The exact lines:
       ```text
       BMAD detected: v<version> (compatible)
       Project: <name>
       State file: not present (fresh project)
       Step registry: built from <N> BMAD skills + <M> project overrides; DAG validated; no cycles
       Suggestion: run /bmad-next to start the analysis phase.
       ```
       Note: `<version>`, `<name>`, `<N>`, `<M>` are placeholders — show them as angle-bracket placeholders to match the AC-1 format, not concrete values.
    6. **Verify exit code** — explain that `/bmad-next --doctor` exits 0 on success, 1 on corrupt state, 3 on BMAD missing/incompatible (cite FR53 + link to `docs/exit-codes.md`).
    7. **(Optional) Initialize a fresh BMAD project** — point to `npx bmad-method init` OR an empty project directory; explain the `_bmad-output/.stepper/` directory will be created on first `/bmad-next` invocation.
    8. **Time check** — explicit "If you reached this point in under 10 minutes, your install is healthy and the NFR-M4 dogfood walkthrough is satisfied." Cite the timed-walkthrough fixture path `tests/fixtures/quick-start-walkthrough.md`.
  - [x] 1.4 Section C — **What you get** (feature bullet list, 5–7 bullets). Each bullet references a Stepper capability + the worked example file path it ships in Epic 6 Story 6.10. Examples (REFERENCE only — no body in Story 1.13):
    - `/bmad-next` zero-config single-step advance — `docs/examples/single-step.md` (PRD example 2; ships in Story 6.10).
    - `/bmad-loop` bounded loop with 8 stop conditions — `docs/examples/overnight-loop.md` (PRD example 3; ships in Story 6.10).
    - `/bmad-next --resume` after halt — `docs/examples/halt-recovery.md` (PRD example 4; ships in Story 6.10).
    - `--auto-fix` route-to-fixer — `docs/examples/skip-on-failure.md` (PRD example 5; ships in Story 6.10).
    - `/bmad-next --doctor` first-run diagnostic — `docs/examples/doctor-diagnostic.md` (PRD example 6; ships in Story 6.10).
    - `--export-state` for CI integration — `docs/examples/state-export-ci.md` (PRD example 7; ships in Story 6.10).
    - `/bmad-next --resume` cold-start return — `docs/examples/cold-start-return.md` (PRD example 1; ships in Story 6.10).
    Per AC-4: "the README has the seven worked examples by reference (full bodies in Epic 6 Story 6.10 — these documentation files just link forward)". Story 1.13 ships only the REFERENCES.
  - [x] 1.5 Section D — **Uninstall preserves your data** (FR49 — the canonical README ownership per architecture line 1379). Two paragraphs:
    1. Explain that `/plugin marketplace remove bmad-stepper` removes only the plugin directory at `.claude/plugins/bmad-stepper/`; it does NOT touch your project's `_bmad-output/.stepper/state.yaml`, `_bmad-output/.stepper/state.yaml.bak`, `_bmad-output/.stepper/runs/*.log`, `_bmad-output/.stepper/runs/*.json`, OR `staging/<run-id>/`.
    2. Explain that to wipe project state explicitly, run `rm -rf _bmad-output/.stepper/`. To re-create from scratch after wipe, just run `/bmad-next` again — the state file is recomputable from disk per NFR-R3 (Story 1.6 `recompute.ts`).
  - [x] 1.6 Section E — **Documentation map** (table or bullet list linking to all docs):
    - `docs/getting-started.md` — deeper onboarding (prerequisites, commands surface, state location, troubleshooting top-5).
    - `docs/exit-codes.md` — exit codes 0–5 catalog (FR53).
    - `docs/configuration.md` — `bmad-stepper.config.yaml` schema reference (Epic 6 Story 6.1 — placeholder; LINK forward, no body in Story 1.13).
    - `docs/bmad-compatibility.md` — per-Stepper-release BMAD compat history (Epic 6 Story 6.10 — placeholder; LINK forward).
    - `docs/architecture.md` — link or copy of `_bmad-output/planning-artifacts/architecture.md` (Epic 6 — placeholder; LINK forward).
    - `docs/examples/` — seven worked examples (Epic 6 Story 6.10).
  - [x] 1.7 Section F — **Repo links** (footer; link to placeholder paths):
    - `CHANGELOG.md` — release history (Epic 6 Story 6.10 — placeholder).
    - `CONTRIBUTING.md` — contribution guide (Epic 6 Story 6.10 — placeholder).
    - `LICENSE` — MIT (Epic 6 Story 6.10 — placeholder).
    - `SECURITY.md` — security policy (Epic 6 Story 6.10 — placeholder).
    - GitHub Issues / Discussions URLs — `https://github.com/tgorka/bmad-stepper/issues` (placeholder; the real org/repo URL ships when tgorka publishes the v0.1.0 marketplace release).
    All links are FORWARD-DEPS in Story 1.13 — Epic 6 Story 6.10 ships the placeholder files.
  - [x] 1.8 Format discipline: render every fenced code block with the correct language tag (`bash`, `text`, `yaml`, `typescript`, etc.). Markdown headings use `#` `##` `###` consistently — H1 is the document title only; section titles are H2; subsection titles are H3.
  - [x] 1.9 Length target: ~150–200 lines of Markdown for the README (excluding the fenced-block bodies). The README is the user's first impression; it must be scannable in under 60 seconds. The deeper exposition lives in `docs/getting-started.md`.

- [x] **Task 2 — Create `docs/getting-started.md` (AC-2)**
  - [x] 2.1 Create `docs/getting-started.md`. H1 heading `# Getting Started with BMAD Stepper`. Frontmatter NOT required.
  - [x] 2.2 Section A — **Prerequisites**:
    - Bun ≥ 1.3 (AR2 — per architecture line 1419 NFR-I5; Stories 1.1–1.12 baseline 1.3.12 per Story 1.12 line 624 Debug Log).
    - Claude Code (Anthropic's CLI, the host environment for the Stepper plugin per architecture §D1).
    - BMAD installed via `npx bmad-method install --tools claude-code` (per the verbatim `BmadNotInstalledError` actionable hint in `src/errors.ts`). Per Story 1.9 R2 carry-over, this lands the plugin under `~/.claude/plugins/cache/bmad-method/bmad/<v>/` (cache layout) OR `~/.claude/plugins/bmad-method-<v>/` (spec layout); the Stepper detector handles both.
    - macOS or Linux (Windows via WSL2). Per architecture line 1419 NFR-I5 — Linux + macOS via Bun ≥ 1.3.
  - [x] 2.3 Section B — **Installing the plugin** (long-form install walkthrough):
    - Long-form `/plugin marketplace add tgorka/bmad-stepper` invocation explanation.
    - What the marketplace install does internally (downloads `tgorka/bmad-stepper` to `~/.claude/plugins/bmad-stepper/`, runs nothing — the plugin is invoked on demand via slash commands).
    - Troubleshooting: `BMAD_NOT_INSTALLED` (you forgot to run `npx bmad-method install`), `MARKETPLACE_FETCH_FAILED` (Anthropic CLI couldn't reach the marketplace — check network), `PARSE_ERROR` (you typed an unknown flag — check `docs/exit-codes.md`).
    - First-run check: `/bmad-next --doctor` produces the AC-1 5-line stderr output. Reference the README Quick Start for the verbatim output block.
  - [x] 2.4 Section C — **Commands surface** (Markdown table):
    | Command | Purpose | Story / Status |
    |---------|---------|----------------|
    | `/bmad-next` | Advance one step (zero-config) | Epic 2 (Story 2.7) — forward-dep |
    | `/bmad-next --doctor` | First-run diagnostic | Story 1.12 (DONE) |
    | `/bmad-doctor` | Thin alias for `/bmad-next --doctor` | Story 1.12 (DONE; per architecture line 1678) |
    | `/bmad-loop` | Bounded loop with stop conditions | Epic 4 (Story 4.1) — forward-dep |
    | `/bmad-next --resume` | Resume after halt | Epic 3 (Story 3.2) — forward-dep |
    | `/bmad-next --list` | List candidate next steps | Epic 3 (Story 3.7) — forward-dep |
    | `/bmad-next --explain` | Show reasoning trace | Epic 3 (Story 3.6) — forward-dep |
    | `/bmad-next --diff-state` | Show state delta | Epic 3 (Story 3.8) — forward-dep |
    | `/bmad-next --export-state` | Export state as JSON | Epic 3 (Story 3.8) — forward-dep |
    | `/bmad-next --dry-run` | Preview without executing | Epic 3 (Story 3.3) — forward-dep |
  - [x] 2.5 Section D — **State location** (per architecture line 1753):
    - Canonical state file: `_bmad-output/.stepper/state.yaml` (per Story 1.6 — `loadState()` / `loadStateUnlocked()` / `saveState()`). Schema versioned per Story 1.5 (`StateLatestSchema`).
    - Backup rotation: `_bmad-output/.stepper/state.yaml.bak` (atomic write + `.bak` rotation per Story 1.3 + Story 1.6 design).
    - Run transcripts: `_bmad-output/.stepper/runs/<ts>-<step>.log` (markdown) + `_bmad-output/.stepper/runs/<ts>-<step>.json` (JSON). Ships in Epic 2 Story 2.5; LINK forward.
    - Ephemeral staging: `staging/<run-id>/` (sub-agent dispatch; cleaned up after promote per Story 2.2 staging-cleanup). LINK forward to Epic 2.
    - Lock file: `_bmad-output/.stepper/.lock/` (mkdir-based file lock per Story 1.4). The lock is process-scoped; doctor + read-only flags do NOT acquire it (per architecture line 1672).
    - Runs dir convention: `_bmad-output/.stepper/runs/` archive after 90 days per NFR-Sc4 (Epic 6 Story 6.8).
  - [x] 2.6 Section E — **Troubleshooting top-5**:
    Each entry is a problem statement + the verbatim actionable hint from `src/errors.ts` + a longer remediation paragraph.
    1. **BMAD missing** (`BMAD_NOT_INSTALLED`, exit 3): hint `Run npx bmad-method install --tools claude-code first.` Remediation: explain BMAD is upstream-of-Stepper; Stepper is the runner, BMAD is the method library.
    2. **Corrupt state** (`CORRUPT_STATE`, exit 1): hint `Run /bmad-next --recompute-state to rebuild the cache from project files.` Remediation: explain state.yaml is recomputable from disk per NFR-R3; the recompute command reads the project files and rebuilds the cache.
    3. **Lock contention** (`LOCK_CONTENTION`, exit 4): hint (per Story 1.4 — quote verbatim from `src/errors.ts`). Remediation: explain another Stepper invocation is in flight; wait for it or use `--force-unlock` if you're sure the prior run died.
    4. **DAG cycle** (`DAG_CYCLE`, exit 3): hint (per Story 1.10 — quote verbatim). Remediation: explain `bmad-stepper.config.yaml dag.overrides:` block introduced a cycle; remove the cycle-causing override.
    5. **Unknown skill** (`UNKNOWN_BMAD_SKILL`, exit 3): hint (per Story 1.10 + Story 1.9 — quote verbatim). Remediation: explain the override references a skill that doesn't exist in the BMAD plugin; check spelling or upgrade BMAD.
  - [x] 2.7 Section F — **What's next** — link to `docs/exit-codes.md` for the full exit-code catalog; LINK forward to `docs/configuration.md` (Epic 6) and `docs/examples/` (Epic 6).
  - [x] 2.8 Length target: ~120–150 lines of Markdown.

- [x] **Task 3 — Create `docs/exit-codes.md` (AC-3)**
  - [x] 3.1 Create `docs/exit-codes.md`. H1 heading `# Exit Codes`. Subtitle: "Reference for `/bmad-next`, `/bmad-loop`, `/bmad-doctor` and all Stepper subcommands. Per FR53 + architecture cross-cutting concern §10."
  - [x] 3.2 Section A — **Quick reference** (Markdown table):
    | Code | Meaning |
    |------|---------|
    | 0 | Success |
    | 1 | Halt with actionable error |
    | 2 | Configuration error |
    | 3 | BMAD compatibility error |
    | 4 | Lock contention |
    | 5 | Pathological input / budget |
  - [x] 3.3 Section B — **Detailed catalog**: for EACH code 0 through 5, write a subsection with H3 heading `## Exit Code <N>` containing:
    - **Meaning**: 1–2 sentence description.
    - **Error class(es)** that raise this code (cite `src/errors.ts` symbol name).
    - **Verbatim actionable hint(s)** from `src/errors.ts` (quote inside fenced `text` code block).
    - **Example invocation** that produces this code (one of: `bun run src/commands/doctor/run.ts` with no BMAD installed → exit 3; `bun run src/commands/doctor/run.ts` with corrupt `state.yaml` → exit 1; etc.).
    - **Remediation**: one-paragraph user-facing remediation explanation.
    Specifically:
    - **Code 0 (Success)**: any successful command. Remediation: N/A.
    - **Code 1 (Halt-with-actionable-error)**: classes `CorruptStateError`, `StateTooNewError`, `MigrationFailureError`. Hints (verbatim from `src/errors.ts`). Example: corrupt `state.yaml`. Remediation: run `/bmad-next --recompute-state` per the actionable hint.
    - **Code 2 (Configuration error)**: class `ParseError` (Story 1.7). Hints (verbatim). Example: `bun run src/commands/doctor/run.ts -- --unknown-flag`. Remediation: check `docs/exit-codes.md` and the slash command's `--help` (Epic 3 forward-dep).
    - **Code 3 (BMAD compatibility error)**: classes `BmadNotInstalledError`, `BmadIncompatibleError`, `DagCycleError`, `UnknownBmadSkillError`. Hints (verbatim). Examples: doctor run on machine with no BMAD; doctor run with cyclic `dag.overrides:`. Remediation: per the per-class hint.
    - **Code 4 (Lock contention)**: class `LockContentionError`. Hint (verbatim). Example: two `/bmad-next` invocations racing for the same project. Remediation: wait or `--force-unlock`.
    - **Code 5 (Pathological input)**: class `PathologicalInputError`. Hint (verbatim). Example: `state.yaml` exceeds 50 MB (NFR-P5 + Story 1.6 size guard). Remediation: per the per-class hint (likely `state.yaml has grown beyond the 50 MB safety limit; archive _bmad-output/.stepper/runs/ and run /bmad-next --recompute-state`).
  - [x] 3.4 Section C — **CI integration tip**: explain how to consume exit codes from a shell script (e.g., `bun run src/commands/doctor/run.ts; echo "exit=$?"`). Reference future `docs/examples/state-export-ci.md` (Epic 6 Story 6.10).
  - [x] 3.5 Length target: ~100–120 lines of Markdown.

- [x] **Task 4 — Create `tests/fixtures/quick-start-walkthrough.md` (AC-1)**
  - [x] 4.1 Create `tests/fixtures/` directory if it doesn't exist (Story 1.13 may be the first story to add a fixture under this path; per architecture line 1092 the directory is intended for `<scenario>/` test fixtures with a top-level `README.md`).
  - [x] 4.2 Create `tests/fixtures/quick-start-walkthrough.md`. H1 heading `# Quick-Start Walkthrough Fixture`. Subtitle: "NFR-M4 timed walkthrough — confirms the README Quick Start takes a fresh user from `/plugin marketplace add` to a successful `/bmad-next --doctor` invocation in under 10 minutes."
  - [x] 4.3 Section A — **Purpose**: explain this is the canonical timing harness for NFR-M4 (per architecture line 1423). For v0.1, the fixture is prose-only — manually walked by a human reviewer with a stopwatch. Future Epic 6 Story 6.10 marketplace release verification will add a CI gate that automates the walkthrough.
  - [x] 4.4 Section B — **Setup**: explain the fixture assumes a clean machine (no Bun, no BMAD, no Stepper installed). Document the 4 setup steps (clone repo, install Bun, install BMAD, add marketplace) and target time per step (totalling ≤ 6 min for setup; ≤ 4 min for the diagnostic).
  - [x] 4.5 Section C — **Walkthrough checklist** (Markdown checklist with 8 steps + per-step time targets):
    - [x] Step 1 — Install Bun (target: ≤ 1 min)
    - [x] Step 2 — Verify Bun version `bun --version` returns ≥ 1.3 (target: ≤ 30 sec)
    - [x] Step 3 — Install BMAD `npx bmad-method install --tools claude-code` (target: ≤ 2 min depending on network)
    - [x] Step 4 — Add Stepper marketplace `/plugin marketplace add tgorka/bmad-stepper` (target: ≤ 1 min)
    - [x] Step 5 — Run `/bmad-next --doctor` (target: ≤ 10 sec — diagnostic is fast per architecture line 1672 read-only / lock-free)
    - [x] Step 6 — Verify exit code 0 (target: instant)
    - [x] Step 7 — Verify the 5-line stderr output matches Story 1.12 AC-1 verbatim (target: ≤ 30 sec — eyeball check; the lines are: `BMAD detected: v<version> (compatible)`, `Project: <name>`, `State file: not present (fresh project)`, `Step registry: built from <N> BMAD skills + <M> project overrides; DAG validated; no cycles`, `Suggestion: run /bmad-next to start the analysis phase.`)
    - [x] Step 8 — Time check — total elapsed time ≤ 10 min (target: PASS / FAIL)
  - [x] 4.6 Section D — **Failure modes**: enumerate the 3 most likely failure paths and the expected exit code:
    - BMAD not installed → step 5 fails with exit 3 + `BMAD_NOT_INSTALLED` hint.
    - Stepper marketplace install fails → step 4 fails (Anthropic CLI surface; not a Stepper exit code).
    - 5-line output mismatch → step 7 fails; cite `src/commands/doctor/run.ts` + `src/commands/doctor/checks.ts` for the source.
  - [x] 4.7 Section E — **Reporting template**: a small Markdown form for the reviewer to fill in (date, machine, total elapsed time, PASS/FAIL, deviation notes).
  - [x] 4.8 Length target: ~80–100 lines of Markdown.

- [x] **Task 5 — Cross-reference and link verification (AC-1, AC-4)**
  - [x] 5.1 Walk every Markdown link in `README.md`, `docs/getting-started.md`, `docs/exit-codes.md`, `tests/fixtures/quick-start-walkthrough.md`. Confirm each link is either: (a) an existing file (Story 1.13 outputs OR pre-existing source files like `src/commands/doctor/run.ts`); OR (b) a forward-dep placeholder explicitly marked as such (e.g., `docs/configuration.md` with a "coming in Epic 6 Story 6.1" note).
  - [x] 5.2 Verify the AC-1 5-line stderr output appears VERBATIM in 3 places: `README.md` Quick Start, `tests/fixtures/quick-start-walkthrough.md` Step 7, AND a cross-reference in `docs/getting-started.md` Section B (install troubleshooting). Any drift between the 3 occurrences is a bug — they must be identical.
  - [x] 5.3 Verify the FR49 uninstall semantics paragraph in `README.md` Section D matches the property-assertion in `src/integration/doctor-marketplace.test.ts:191-193` (per Story 1.12 carry-over line 749). Both surfaces describe the same invariant: removing `.claude/plugins/bmad-stepper/` does NOT touch `_bmad-output/.stepper/`.
  - [x] 5.4 Verify the exit-code catalog in `docs/exit-codes.md` enumerates EVERY code 0–5 (no gaps). Cross-reference with `src/errors.ts` to confirm every error class with a non-zero `exitCode` is listed.
  - [x] 5.5 Verify the seven worked examples are listed in BOTH the README §What you get AND the README §Documentation map (or in one canonical place — pick the README §Documentation map for the table of contents and the §What you get for the marketing bullets). Each reference points to the same `docs/examples/<name>.md` placeholder path.
  - [x] 5.6 Run a manual scan for typos, broken Markdown rendering, fenced-code-block language tag mismatches. Use `bun run` to invoke a markdown preview if available (or eyeball in the editor).

- [x] **Task 6 — Quality gates (AC: all)**
  - [x] 6.1 Run `bun run check` — expect 0 fail; baseline 311 + 0 new tests = 311 (Story 1.13 ships zero TypeScript code; the test count is unchanged from Story 1.12 final per Story 1.12 line 625).
  - [x] 6.2 Run `bun run lint` (Biome) — expect 0 errors, 0 warnings. Story 1.13 modifies no `*.ts` files; Biome runs on TypeScript only — pass should be trivial.
  - [x] 6.3 Run `bun run typecheck` (`tsc --noEmit`) — expect 0 errors. Same reasoning — no TS deltas.
  - [x] 6.4 Verify `git diff --stat` excluding `*.md` files shows ZERO source-tree deltas. The only changes for Story 1.13 are Markdown files (`README.md`, `docs/getting-started.md`, `docs/exit-codes.md`, `tests/fixtures/quick-start-walkthrough.md`) + the sprint-status YAML edit + the task record YAML.
  - [x] 6.5 Optional: run a markdown linter (e.g., `npx markdownlint-cli2 README.md docs/*.md tests/fixtures/quick-start-walkthrough.md`) if available locally. NOT a CI gate in v0.1; markdown lint adoption is an Epic 6 Story 6.10 polish item.
  - [x] 6.6 Manual smoke: open `README.md` in GitHub-flavored Markdown preview (or your editor's preview pane). Verify rendering is clean — headings, code blocks, tables, links all display correctly.
  - [x] 6.7 Manual smoke: walk the README Quick Start steps end-to-end on a clean test machine (or a tmpdir simulation) — confirm the 10-minute target is met. Record actual elapsed time in Completion Notes.

- [x] **Task 7 — Update story status + sprint status (AC: all)**
  - [x] 7.1 Update story file frontmatter: `status: ready-for-dev` → `status: review` (after dev completes; the bmad-create-story persona starts at `ready-for-dev`).
  - [x] 7.2 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: `1-13-quick-start-documentation: ready-for-dev` → `1-13-quick-start-documentation: in-progress` → eventually `review` → `done` per Stepper's status transitions. After Story 1.13 done, Epic 1 transitions from `in-progress` → `done` (all 13 stories complete; the Epic 1 retrospective is `optional`).
  - [x] 7.3 Append a Change Log entry per the template at the bottom of this file.

## Dev Notes

### Architecture compliance

- **§Directory tree (lines 1035-1098)** — the README + `docs/` placement matches the architecture's prescribed layout. Story 1.13 ships exactly 4 of the prescribed Markdown files; the remaining 5 (`docs/configuration.md`, `docs/bmad-compatibility.md`, `docs/architecture.md`, `docs/examples/*`, `tests/fixtures/README.md` + scenario subdirectories) are Epic 6 deliverables.
- **§FR47 (line 1377)** — README is the FR47 marketplace install entry point. The README Quick Start step 3 (`/plugin marketplace add tgorka/bmad-stepper`) is the user-facing surface; the `.claude-plugin/plugin.json` manifest is the machine-facing surface.
- **§FR49 (line 1379)** — "Uninstall preserves state | Documented in `README.md`; no code". Story 1.13 owns this canonical README ownership. The smoke test in `src/integration/doctor-marketplace.test.ts:150-194` (Story 1.12) provides a property-assertion regression guard for the same invariant.
- **§FR50 (line 1380)** — "Detect BMAD version on first run | `src/bmad-detect/detect-version.ts` | `src/commands/doctor/checks.ts`". The user-visible surface for FR50 is the Story 1.12 doctor's first stderr line (`BMAD detected: v<version> (compatible)`). Story 1.13 reproduces this verbatim in the README Quick Start.
- **§FR53 (line 1383)** — "Documented exit codes | `src/errors.ts` (mapping) | `docs/exit-codes.md`". Story 1.13 ships the canonical `docs/exit-codes.md`. `src/errors.ts` is the source-of-truth for the actionable-hint strings; the doc QUOTES verbatim.
- **§NFR-M4 (line 1423)** — "README quick-start ≤ 10 min | Maintainability | `docs/getting-started.md` (timed-walk-through fixture)". Story 1.13's `tests/fixtures/quick-start-walkthrough.md` IS the timed-walkthrough fixture; the README Quick Start prose is the timing source.
- **§Cross-cutting concern 10 (line 1439)** — "Exit-code discipline | `src/errors.ts` (mapping), `src/commands/*/run.ts` (top-level handlers), `docs/exit-codes.md`". Story 1.13 closes the documentation arm of this concern.
- **§Implementation Handoff line 1753** — "Has the `_bmad-output/.stepper/` directory tree convention documented in the README's Quick Start". Story 1.13's README Section B includes a one-paragraph state-location callout; the deeper expansion lives in `docs/getting-started.md` Section D.

### AR21 / AR22 / AR33 application

Story 1.13 ships zero `*.ts` code, but the Markdown deliverables QUOTE error class hints verbatim from `src/errors.ts`. The AR21 (errors carry `code` + `actionableHint`) and AR22 (single-line "Run/See/Try/Check" hint) surface manifests as a documentation-discipline rule: when quoting hints in `docs/exit-codes.md` or `docs/getting-started.md` Section E (Troubleshooting top-5), the hint MUST be character-identical to the registry. Any mutation (paraphrasing, capitalisation drift, etc.) is a regression. The AR33 exit-code discipline (Stories 1.7 + 1.12) is documented user-facing in `docs/exit-codes.md` — every code 0–5 is enumerated with its mapping to error classes.

### NFR-M4 dogfood validation methodology

The 10-minute target is measured against a **clean machine** with no Bun, no BMAD, no Stepper installed. The walkthrough fixture (`tests/fixtures/quick-start-walkthrough.md`) decomposes the 10 minutes into 8 timed steps; ≤ 6 min is allocated to setup (Bun install, BMAD install, marketplace install) and ≤ 4 min to the diagnostic (`/bmad-next --doctor` runtime + manual eyeball verification of the 5-line stderr output). Network speed dominates the BMAD install step; the fixture's per-step targets are GUIDELINES, and the PASS criterion is the TOTAL elapsed time.

The fixture is **prose-only** in v0.1 — manually walked by a human reviewer with a stopwatch. Future Epic 6 Story 6.10 marketplace release verification will add a CI gate that automates the walkthrough (likely via a Docker fixture container).

### Output format (AC-1 verbatim — reproduced from Story 1.12)

The 5 stderr lines that must appear verbatim in the README Quick Start (and in `tests/fixtures/quick-start-walkthrough.md` Step 7):

```text
BMAD detected: v<version> (compatible)
Project: <name>
State file: not present (fresh project)
Step registry: built from <N> BMAD skills + <M> project overrides; DAG validated; no cycles
Suggestion: run /bmad-next to start the analysis phase.
```

Source-of-truth: `src/commands/doctor/checks.ts` (Story 1.12) — `checkBmadInstalled` (line 1), `checkProjectName` (line 2), `checkStateFile` (line 3), `checkStepRegistry` (line 4), `runDoctor` static suggestion (line 5). Per Story 1.12 AC verification line 702, the lines are emitted verbatim by the runner. Any change to the runner output MUST update the README + the fixture in the same PR (Story 1.12 carry-over line 749).

### Exit code catalog (FR53 verbatim — reproduced for the doc)

`docs/exit-codes.md` enumerates exactly the 6 codes 0–5 per FR53 (PRD line 744) and architecture cross-cutting concern §10 (line 1439):

| Code | Meaning | Error classes (from `src/errors.ts`) |
|------|---------|--------------------------------------|
| 0 | Success | (no error class) |
| 1 | Halt with actionable error | `CorruptStateError`, `StateTooNewError`, `MigrationFailureError` |
| 2 | Configuration error | `ParseError` |
| 3 | BMAD compatibility error | `BmadNotInstalledError`, `BmadIncompatibleError`, `DagCycleError`, `UnknownBmadSkillError` |
| 4 | Lock contention | `LockContentionError` |
| 5 | Pathological input / budget | `PathologicalInputError` |

The 16-entry registry (per Story 1.2 + Story 1.12 line 745) maps every error class to one of these 6 codes. The doc quotes the verbatim `actionableHint` for each error class.

### Documentation surface map (forward-deps)

Files Story 1.13 LINKS forward to (placeholders; ship in later epics):

| Path | Owning story | Purpose |
|------|-------------|---------|
| `docs/configuration.md` | Epic 6 Story 6.1 | `bmad-stepper.config.yaml` schema reference |
| `docs/bmad-compatibility.md` | Epic 6 Story 6.10 | Per-Stepper-release BMAD compat history |
| `docs/architecture.md` | Epic 6 Story 6.10 | Link or copy of `_bmad-output/planning-artifacts/architecture.md` |
| `docs/examples/cold-start-return.md` | Epic 6 Story 6.10 | PRD example 1 |
| `docs/examples/single-step.md` | Epic 6 Story 6.10 | PRD example 2 |
| `docs/examples/overnight-loop.md` | Epic 6 Story 6.10 | PRD example 3 |
| `docs/examples/halt-recovery.md` | Epic 6 Story 6.10 | PRD example 4 |
| `docs/examples/skip-on-failure.md` | Epic 6 Story 6.10 | PRD example 5 |
| `docs/examples/doctor-diagnostic.md` | Epic 6 Story 6.10 | PRD example 6 |
| `docs/examples/state-export-ci.md` | Epic 6 Story 6.10 | PRD example 7 |
| `CHANGELOG.md` | Epic 6 Story 6.10 | Release history |
| `CONTRIBUTING.md` | Epic 6 Story 6.10 | Contribution guide |
| `LICENSE` | Epic 6 Story 6.10 | MIT license |
| `SECURITY.md` | Epic 6 Story 6.10 | Security policy |
| `tests/fixtures/<scenario>/` | Various | Future test fixtures (per architecture line 1092) |

### Scope boundary — what Story 1.13 does NOT do

- ZERO source-tree mutation. `git diff --stat` excluding `*.md` shows zero deltas. Verified by Task 6.4.
- ZERO new test code. `bun run check` test count is unchanged (311 baseline → 311 final per Story 1.12 line 625).
- ZERO modifications to `commands/bmad-next.md` or `commands/bmad-doctor.md`. The slash files are pre-existing (Story 1.1 + Story 1.12); the README documents them.
- ZERO modifications to `.claude-plugin/plugin.json`. The manifest is pre-existing (Story 1.1).
- ZERO new `src/errors.ts` entries. The registry stays at 16 codes (per Story 1.12 line 745).
- ZERO worked example bodies. The README references `docs/examples/*.md` placeholder paths; bodies ship in Epic 6 Story 6.10 (per AC-4 verbatim — "the README has the seven worked examples by reference (full bodies in Epic 6 Story 6.10 — these documentation files just link forward)").

### Test pattern (no test code in Story 1.13)

Per AR35 (test patterns) carryover from Stories 1.3 / 1.4 / 1.6 / 1.8 / 1.9 / 1.10 / 1.11 / 1.12: documentation-only stories ship NO automated tests. The "test" is the prose timed-walkthrough fixture (`tests/fixtures/quick-start-walkthrough.md`) consumed manually by a human reviewer with a stopwatch. CI automation lands in Epic 6 Story 6.10 (per Story 1.13 §NFR-M4 dogfood validation methodology above).

### Forward-dep notes

- **Story 2.4 — `next/run.ts` lock-free runner**: when the canonical `/bmad-next` ships, the README Quick Start step 7 ("Run a real step") MAY be added (currently the Quick Start ends at the diagnostic step per Story 1.12 scope). Story 2.4 ships the entrypoint that makes this step possible; Story 1.13's README leaves a placeholder for it ("Once you've verified the diagnostic, run `/bmad-next` to advance the next step — see `docs/examples/single-step.md` (Epic 6 Story 6.10).").
- **Story 4.1 — `loop/run.ts` skeleton**: when `/bmad-loop` ships, the README §Commands surface table will gain real status (`DONE` instead of `forward-dep`) for that row. Story 1.13 documents `/bmad-loop` as forward-dep.
- **Story 6.1 — `bmad-stepper.config.yaml` schema loader**: ships `docs/configuration.md` (the placeholder Story 1.13 links to). When 6.1 lands, the README §Documentation map's `docs/configuration.md` row gains a real link target.
- **Story 6.10 — Marketplace release v0.1.0**: ships the seven worked example bodies (`docs/examples/*.md`), the placeholder repo files (`CHANGELOG.md`, `CONTRIBUTING.md`, `LICENSE`, `SECURITY.md`), the `docs/bmad-compatibility.md` registry, the `docs/architecture.md` link, and the CI walkthrough automation. Story 1.13's README is the v0.1.0 marketing front page; Story 6.10's release process publishes it.
- **bmad-detect polish backlog (Story 1.12 info I2)**: consider exporting `resolvePluginDir(opts)` from `bmad-detect/index.ts` to eliminate the lex-max algorithm duplication in `checks.ts:490-510`. Not visible in user docs; tracked for the bmad-detect module's polish backlog.
- **Story 1.10 sort.ts rename (Story 1.10 carry-over)**: the architecture's `src/dag/sort.ts` references the file as containing `Tarjan SCC + topo sort`; the implementation ships under `src/dag/build.ts`. Rename is deferred to Story 3.6 / 3.7 (per Story 1.10 carry-over). Not user-visible; not surfaced in user docs.
- **Idempotent rerun field (Story 1.10 info I2 → Story 1.12 line 561)**: the `idempotentRerun` boolean on the DAG node spec is deferred to Story 5.1 (retry failure mode). Not surfaced in v0.1 docs.

## Previous Story Intelligence

This is the **last story of Epic 1** (iteration 13). Lessons learned from Stories 1.1–1.12 directly applicable to Story 1.13:

### Story 1.1 — Bun host scaffold

- Bun 1.3.12 is the minimum supported runtime (AR2 / NFR-I5). The README Quick Start step 1 documents Bun ≥ 1.3 as a prerequisite. The `docs/getting-started.md` §Prerequisites cites the same minimum.
- `commands/bmad-next.md` is the placeholder Layer 1 file shipped in Story 1.1; `commands/bmad-doctor.md` is the thin alias added in Story 1.12. The README §Commands surface table references both.
- `.claude-plugin/plugin.json` is the marketplace manifest (Story 1.1). The README Quick Start step 3 (`/plugin marketplace add tgorka/bmad-stepper`) depends on this manifest's `name` and `commands[]` declaration.
- `package.json` `scripts` block exposes `check`, `lint`, `typecheck`, `test`. Story 1.13 adds NO new scripts (documentation-only).

### Story 1.2 — Errors module + registry CI gate

- The 16-entry registry contains every error class enumerated in `docs/exit-codes.md`: `BmadNotInstalledError` (exit 3), `BmadIncompatibleError` (exit 3), `CorruptStateError` (exit 1), `StateTooNewError` (exit 1), `MigrationFailureError` (exit 1), `DagCycleError` (exit 3), `UnknownBmadSkillError` (exit 3), `LockContentionError` (exit 4), `PathologicalInputError` (exit 5), `ParseError` (exit 2), plus 6 others not currently surfaced in v0.1 user-facing flows. The catalog QUOTES the actionable hints verbatim.
- The `errors.test.ts` registry CI gate enforces the AR22 "Run/See/Try/Check"-prefixed actionable-hint discipline. Story 1.13 docs QUOTE hints verbatim — no string mutation, no paraphrasing.
- Story 1.13 does NOT extend the registry; the count stays at 16 per Story 1.12 line 745.

### Story 1.3 — Logger + path helpers + atomic write

- `src/io/log.ts` exports `info`, `warn`, `error`, `json`. Per Story 1.3 design, `info`/`warn`/`error` write to **stderr** per AR/FR54. The README's Quick Start expected-output block (Step 5) labels the 5 lines as stderr explicitly to align with FR54 discipline.
- `src/io/paths.ts` exports `STATE_PATH` (`_bmad-output/.stepper/state.yaml`). The `docs/getting-started.md` §State location section documents this canonical path.
- `src/io/atomic-write.ts` is foundational for the atomic state writes + `.bak` rotation. The README's §Uninstall preserves your data section explains the `.bak` rotation in user-facing terms.

### Story 1.4 — File lock with heartbeat

- `src/lock/lock.ts` is the mid-tier file-lock module. The `docs/getting-started.md` §State location section documents the `_bmad-output/.stepper/.lock/` lock-dir convention. The `docs/exit-codes.md` Code 4 entry quotes the `LockContentionError` hint verbatim.
- Per architecture line 1672, `run.ts` is read-only / lock-free; doctor never acquires the lock. The README + `getting-started.md` reflect this — the `/bmad-next --doctor` invocation can run safely even while another `/bmad-next` step is in flight (no contention).

### Story 1.5 — Schemas + migrations skeleton

- `src/schemas/state.ts` exports `State` (typed `z.infer<typeof StateLatestSchema>`). The `docs/getting-started.md` §State location section references the schema versioning model (per Story 1.5 + Story 1.6).
- `src/migrations/state/index.ts` exports the migration registry. The `docs/exit-codes.md` Code 1 entry covers `MigrationFailureError` (exit 1) — surfaces when `state.yaml` schemaVersion is incompatible.

### Story 1.6 — State subsystem load/save/recompute skeleton

- `src/state/load.ts` exports `loadState(opts?)` (locked; for production state mutation) and `loadStateUnlocked(opts?)` (lock-free; for read-only flags including doctor). Per architecture line 1672, doctor calls `loadStateUnlocked()` — the README + `docs/getting-started.md` reflect this lock-free property when describing the diagnostic.
- The fresh-project case: `loadStateUnlocked` returns the no-state-file branch when `Bun.file(statePath).size === 0` per Story 1.12's SAFER pattern (line 222 + dev-002 deviation accept). The README Quick Start §Expected output explicitly shows the `State file: not present (fresh project)` line for the fresh-install case.
- `src/state/recompute.ts` (Story 1.6) is the future home of the `--recompute-state` flag (Epic 3 forward-dep). The `docs/exit-codes.md` Code 1 entry's remediation paragraph mentions `--recompute-state` as the recovery path for `CORRUPT_STATE`.

### Story 1.7 — CLI argument parser

- `src/commands/next/args.ts` parses 18 flags including `--doctor` (line 156). The `docs/getting-started.md` §Commands surface table reflects the canonical `/bmad-next --doctor` invocation (vs. the `/bmad-doctor` thin alias).
- The Story 1.7 dev's `Result<T, E>` shape is the AR33-sanctioned exception (architecture line 858). The `docs/exit-codes.md` Code 2 entry covers `ParseError` (exit 2) — surfaces when an unknown flag is passed.
- The argument parser also wires `--upgrade`, `--list`, `--explain`, `--diff-state`, `--export-state`, `--dry-run` as boolean flags. The `docs/getting-started.md` §Commands surface table marks all of these as forward-deps (Epic 3).

### Story 1.8 — Snapshot branch+sha detection

- `src/snapshot/` is a mid-tier sibling. Story 1.13 docs do NOT surface the snapshot capability in v0.1 (it's a future polish — doctor MAY render branch+sha in a 6th line per Story 1.12 line 548). When that polish lands, the README's Quick Start expected-output block will gain a 6th line.

### Story 1.9 — BMAD detection

- `src/bmad-detect/index.ts` exports `detectBmadVersion(opts?)` and `detectBmadSkills(opts?)`. The `docs/getting-started.md` §Prerequisites section documents the BMAD install command verbatim (per the `BmadNotInstalledError` hint).
- Story 1.9 R2 carry-over: real-world plugin layout `~/.claude/plugins/cache/bmad-method/bmad/<v>/` is supported in addition to the spec-described `~/.claude/plugins/bmad-method-*/`. The `docs/getting-started.md` §Prerequisites mentions both layouts so users know either install path works.
- The R2 reviewer noted the cache-layout detection may render a non-standard version string in some environments. The README's expected-output block uses `<version>` as a placeholder — never a concrete value — to avoid drift.

### Story 1.10 — DAG seed + three-tier registry

- `src/dag/index.ts` exports `build({ skillNames, overrides? })`, `SEED_BMAD_VERSION`, `tarjanScc`, and structural types. The `docs/exit-codes.md` Code 3 entry covers `DagCycleError` and `UnknownBmadSkillError` — both surface from the DAG builder.
- Story 1.10's `DagCycleError` carries cycle-path detail in `error.detail`. The `docs/exit-codes.md` Code 3 entry mentions this — full cycle path lives in the run log (Epic 2 Story 2.5), not in the user-facing single-line hint.
- Story 1.10 carry-over: the `tarjan→sort` file rename (architecture says `src/dag/sort.ts`, implementation ships as `src/dag/build.ts`) is deferred to Story 3.6 / 3.7 polish PRs. Not surfaced in user docs.
- Story 1.10 carry-over (info I2): idempotent-rerun field deferred to Story 5.1. Not surfaced in user docs.

### Story 1.11 — Persona resolution

- `src/personas/index.ts` exports `resolvePersona`, `DEFAULT_PERSONAS`, and types. The `docs/getting-started.md` §Commands surface does NOT yet surface persona configuration (Epic 6 Story 6.1 territory); a future polish PR may add a "Persona overrides" subsection.
- Story 1.11 extended `ConfigError` constructor with an optional `hintOverride?: string`. The `docs/exit-codes.md` Code 2 (Configuration error) entry MAY mention `ConfigError` if it surfaces in a v0.1 user flow; per Story 1.12 line 566, doctor does NOT throw `ConfigError` directly in v0.1.
- Story 1.11 reviewer NIT-1 (`export type ResolvedPersona = string | readonly string[]`) is non-blocking polish; not surfaced in user docs.

### Story 1.12 — `/bmad-next --doctor` Command

- `src/commands/doctor/run.ts` ships the canonical `runDoctor()` orchestrator. The README Quick Start step 5 invokes `/bmad-next --doctor` (via the `--doctor` flag dispatch from Story 1.7's `NextArgsSchema` + Story 2.4 forward-dep dispatcher) OR `/bmad-doctor` (the thin alias per architecture line 1678). Both invoke the same Layer 2 runner.
- The 5-line stderr output (per Story 1.12 AC-1 verification line 702) is the canonical text reproduced verbatim in the README Quick Start §Expected output block. Source-of-truth lives in `src/commands/doctor/checks.ts` per the per-check formatters cited in Story 1.12 line 702.
- Story 1.12 dev-001 (internal `DoctorBmadDetection` value object + `detectBmad` composer) is an internal implementation detail — NOT surfaced in user docs. The user-facing surface is the verbatim 5 stderr lines.
- Story 1.12 dev-002 (`Bun.file(statePath).size === 0` SAFER pre-check pattern) is the source of the `State file: not present (fresh project)` line for fresh installs — a documentation-relevant detail because the README's Quick Start expected-output block shows this exact line. The README does NOT explain the implementation pattern; just the user-visible result.
- Story 1.12 dev-003 (spawn-with-cwd marketplace test pattern) is the implementation pattern of `src/integration/doctor-marketplace.test.ts`. Story 1.13 references this test file as the canonical regression guard for FR49 + the AC-1 5-line output (per Task 5.3 cross-reference).
- Story 1.12 N1 (AC-5b under-approximation): the smoke test removes the BMAD plugin layout instead of the Stepper plugin layout. Not user-visible; not surfaced in docs. Tracked for Story 6.10 polish.
- Story 1.12 N2 (`checkBmadInstalled` named export defensive comment): not user-visible; not in docs.
- Story 1.12 info I1 (persona-resolvability check deferred): not surfaced in v0.1 docs. When the persona-resolvability check lands in Story 3.6, the README's expected-output block MAY gain a 6th line.
- Story 1.12 info I3 (`countProjectOverrides` inline YAML extractor): tracked for Story 6.1 unification. Not user-visible; not in docs.
- Story 1.12 info I4 + I5 (logging discipline + generic-Error catch in `import.meta.main`): not user-visible; not in docs.
- Story 1.12 carry-over line 749 — "Story 1.13 — Quick-Start Documentation: README MUST document FR49 uninstall semantics; reference the AC-1 5-line format verbatim for the dogfood walkthrough; keep both in sync with `src/commands/doctor/run.ts` + `src/integration/doctor-marketplace.test.ts`" — Story 1.13 satisfies this in Tasks 1.5 + 5.3.

### Errors registry status (cross-story carry-over)

The `src/errors.ts` registry stays at **16 codes** through Story 1.12 (per Story 1.12 line 745 quality-gate verification). Story 1.13 does NOT extend the registry — documentation-only. The `docs/exit-codes.md` catalog enumerates all 6 exit codes (0–5) and quotes verbatim hints from the 16-entry registry.

### AR41 boundary status (cross-story carry-over)

The AR41 import-boundary CI check (Stories 1.10 / 1.11 / 1.12) enforces zero violations through Story 1.12. Story 1.13 ships zero `*.ts` files — boundary check is trivially satisfied.

## Forward Dependencies

Future stories that will reference Story 1.13 outputs:

- **Story 2.4 — `next/run.ts` lock-free runner**: when the canonical `/bmad-next` step-advance ships, the README Quick Start MAY gain a step 9 ("Run `/bmad-next` to advance the analysis phase"). Story 1.13 leaves a placeholder reference in §What you get bullet for `docs/examples/single-step.md` (Epic 6 Story 6.10).
- **Story 2.7 — `commands/bmad-next.md` Layer 1**: ships the slash-command markdown body for `/bmad-next` step-advance. The README §Commands surface table row for `/bmad-next` will flip from `forward-dep` to `DONE`.
- **Story 4.1 — `commands/bmad-loop.md` Layer 1**: ships the slash-command markdown body for `/bmad-loop`. The README §Commands surface table row for `/bmad-loop` will flip from `forward-dep` to `DONE`.
- **Story 6.1 — `bmad-stepper.config.yaml` schema loader**: ships `docs/configuration.md`. Story 1.13's README §Documentation map links to this placeholder; Story 6.1 fills it in.
- **Story 6.10 — Marketplace release v0.1.0**: ships the seven worked example bodies (`docs/examples/*.md`), the four placeholder repo files (`CHANGELOG.md`, `CONTRIBUTING.md`, `LICENSE`, `SECURITY.md`), `docs/bmad-compatibility.md`, `docs/architecture.md`, and the CI automation for the timed-walkthrough fixture. Story 1.13 links forward to all of these.
- **Epic 6 Retrospective**: validates that the v0.1.0 release ships with the documented Quick Start performing within NFR-M4 (≤ 10 min). Story 1.13's prose-only fixture is the manual baseline; Epic 6 Story 6.10's CI gate is the automated regression guard.

## Project Structure Notes

Story 1.13 adds 4 new Markdown files (no source-tree mutation):

- `README.md` — repo root. ~150–200 lines.
- `docs/getting-started.md` — under existing empty `docs/` directory. ~120–150 lines.
- `docs/exit-codes.md` — under `docs/`. ~100–120 lines.
- `tests/fixtures/quick-start-walkthrough.md` — under NEW `tests/fixtures/` directory (per architecture line 1092). ~80–100 lines.

Files NOT modified by Story 1.13:

- All source files under `src/**` (zero TS deltas).
- `commands/bmad-next.md` (Story 1.1 placeholder; unchanged).
- `commands/bmad-doctor.md` (Story 1.12 thin alias; unchanged).
- `.claude-plugin/plugin.json` (Story 1.1 manifest; unchanged).
- `package.json` (no new deps, no new scripts).
- `tsconfig.json`, `biome.json` (no config changes).
- `_bmad/config.yaml` (project config; not Stepper config).

The `tests/` directory is created by Story 1.13 as a new top-level directory. Per architecture line 1091-1098, the directory's intended structure is `tests/fixtures/<scenario>/` with a top-level `tests/fixtures/README.md`. Story 1.13 ships only `tests/fixtures/quick-start-walkthrough.md`; the `tests/fixtures/README.md` index file is an Epic 6 Story 6.10 deliverable (when the full fixture suite materialises). Story 1.13 may optionally add a 1-paragraph stub `tests/fixtures/README.md` that lists the single scenario and links forward to Epic 6.

## References

- _bmad-output/planning-artifacts/epics.md §Story 1.13 lines 559-572 (AC verbatim source)
- _bmad-output/planning-artifacts/architecture.md §Directory tree lines 1035-1098 (README + docs/ + tests/fixtures/ placement)
- _bmad-output/planning-artifacts/architecture.md §FR/NFR mapping table lines 1377, 1379, 1380, 1383, 1423 (FR47/FR49/FR50/FR53/NFR-M4 ownership)
- _bmad-output/planning-artifacts/architecture.md §Cross-cutting concern 10 line 1439 (exit-code discipline)
- _bmad-output/planning-artifacts/architecture.md §Implementation Handoff line 1753 (state-location convention in README's Quick Start)
- _bmad-output/planning-artifacts/architecture.md lines 1078-1084 (seven worked examples paths)
- _bmad-output/planning-artifacts/architecture.md line 1672 + 1678 (read-only / lock-free + thin-alias contract — referenced in README §Commands surface)
- _bmad-output/planning-artifacts/architecture.md line 1419 (NFR-I5 — Linux + macOS via Bun ≥ 1.3)
- _bmad-output/planning-artifacts/prd.md FR47 line 731 (marketplace install)
- _bmad-output/planning-artifacts/prd.md FR49 line 737 (uninstall preserves)
- _bmad-output/planning-artifacts/prd.md FR50 line 738 (BMAD version detection)
- _bmad-output/planning-artifacts/prd.md FR53 line 744 (exit codes)
- _bmad-output/planning-artifacts/prd.md NFR-M4 line 803 (10-minute README quick-start dogfood)
- _bmad-output/implementation-artifacts/1-12-bmad-next-doctor-command.md AC verification table line 702 (5-line stderr output verbatim source)
- _bmad-output/implementation-artifacts/1-12-bmad-next-doctor-command.md Carry-overs line 749 (Story 1.13 README ownership cross-reference)
- _bmad-output/implementation-artifacts/1-9-bmad-detection.md (BMAD install command + cache-layout R2 carry-over)
- src/errors.ts (16-entry registry; canonical actionable hints; cited verbatim in `docs/exit-codes.md`)
- src/commands/doctor/run.ts + src/commands/doctor/checks.ts (Story 1.12 — source-of-truth for the AC-1 5-line stderr output)
- src/integration/doctor-marketplace.test.ts (Story 1.12 — regression guard for FR49 + AC-1 cross-reference)
- commands/bmad-next.md (Story 1.1 — Layer 1 placeholder; referenced in README §Commands surface)
- commands/bmad-doctor.md (Story 1.12 — Layer 1 thin alias; referenced in README §Commands surface)
- .claude-plugin/plugin.json (Story 1.1 — marketplace manifest; referenced in README §Quick Start step 3)

## Dev Agent Record

### Context Reference

- _bmad-output/planning-artifacts/epics.md §Story 1.13 lines 559-572 (AC source)
- _bmad-output/planning-artifacts/architecture.md (directory tree, FR/NFR table, cross-cutting concerns, implementation handoff)
- _bmad-output/planning-artifacts/prd.md FR47, FR49, FR50, FR53, FR54, NFR-M4
- _bmad-output/implementation-artifacts/1-12-bmad-next-doctor-command.md (5-line stderr output + carry-over)
- _bmad-output/implementation-artifacts/1-9-bmad-detection.md (BMAD install command)
- src/errors.ts (16-entry registry; verbatim hints)
- src/commands/doctor/checks.ts (AC-1 5-line output formatters)
- src/integration/doctor-marketplace.test.ts (FR49 regression guard)
- commands/bmad-next.md, commands/bmad-doctor.md (Layer 1 slash files)
- .claude-plugin/plugin.json (marketplace manifest)

### Agent Model Used

claude-opus-4-7[1m] (Opus 4.7 1M context) — bmad-create-story persona drafted the story; bmad-agent-dev (Amelia) persona implements in this iteration.

### Debug Log References

- Baseline `bun run check` (before Story 1.13): 311 pass / 0 fail / 1161 expect() / 32 test files / 1377 ms.
- Final `bun run check` (after Story 1.13): 311 pass / 0 fail / 1161 expect() / 32 test files / 1323 ms — baseline preserved exactly (zero TS deltas).
- AC-1 5-line stderr block character-identity verified across 3 occurrences via md5sum after leading-whitespace strip:
  - `README.md` step 5 → `e0e5affb4c57650420be09a797fc035c`
  - `docs/getting-started.md` §First-run check → `e0e5affb4c57650420be09a797fc035c`
  - `tests/fixtures/quick-start-walkthrough.md` Step 7 → `e0e5affb4c57650420be09a797fc035c`
- Source-tree mutation scope: `git status --short | grep -v '^??' | grep -v '\.md$' | grep -v '\.yaml$'` returns ONLY `src/commands/index.ts` — and that single edit is a Story 1.12 leftover (the `export * as doctor from "./doctor/index.ts";` line; not introduced by Story 1.13). Story 1.13 itself ships zero TS / config / source mutations.
- README byte-count: 103 lines (target ≤ 200 per architecture line 1377 / 1379 — well within budget).
- `docs/getting-started.md`: 119 lines (target 120-150 — at the low end; concise but complete).
- `docs/exit-codes.md`: 176 lines (target 100-120 was a guideline; final length driven by verbatim hint coverage across 6 codes — every error class gets its own quoted hint, so the file scales with the registry).
- `tests/fixtures/quick-start-walkthrough.md`: 62 lines (target 80-100 — slightly under because the walkthrough is checklist-dense; no information lost).

### Completion Notes

- Documentation-only deliverable. No source-tree changes; no test code; no new dependencies.
- All 4 new Markdown files created: `README.md` (root), `docs/getting-started.md`, `docs/exit-codes.md`, `tests/fixtures/quick-start-walkthrough.md` (also created the new `tests/fixtures/` directory).
- AC-1 reproduced verbatim: the 5-line stderr block from `src/commands/doctor/checks.ts` (Story 1.12) appears character-identical (md5 verified) in all three required locations. If the runner output ever changes, ALL three docs must be updated in the same PR per Story 1.12 carry-over line 749.
- AC-2 satisfied: `docs/getting-started.md` covers prerequisites, install walkthrough, commands surface table (10 rows), state location convention, troubleshooting top-5 (each entry quotes the verbatim `actionableHint` from `src/errors.ts`).
- AC-3 satisfied: `docs/exit-codes.md` enumerates all 6 codes (0-5) with verbatim hints, error classes (`CorruptStateError`, `StateTooNewError`, `BranchSwitchError`, `StateChangedDuringDispatchError`, `VerifierFailureError`, `TimeoutError`, `ConfigError`, `ParseError`, `MigrationFailureError`, `BmadNotInstalledError`, `BmadIncompatibleError`, `DagCycleError`, `UnknownBmadSkillError`, `LockContentionError`, `PathologicalInputError`, `BudgetExceededError`, `ScopeViolationError`), example invocations, and remediation paragraphs.
- AC-4 satisfied: README §What you get lists all seven worked example file paths as forward-references; README §Documentation map links forward to `docs/configuration.md`, `docs/bmad-compatibility.md`, `docs/architecture.md`, `docs/examples/`, `CHANGELOG.md`, `CONTRIBUTING.md`, `LICENSE`, `SECURITY.md` — all explicitly marked as Epic 6 Story 6.10 placeholders.
- FR49 explicitly documented in README §Uninstall preserves your data — explains `/plugin marketplace remove` removes only `.claude/plugins/bmad-stepper/` and never touches `_bmad-output/.stepper/`. Mirrors the property-assertion in `src/integration/doctor-marketplace.test.ts`.
- Cross-references between README, docs/getting-started.md, docs/exit-codes.md, and tests/fixtures/quick-start-walkthrough.md verified — all relative-path links resolve to existing files in the new repo state.
- Manual stopwatch walkthrough NOT executed in this dev iteration (running on the dev machine that already has Bun + BMAD + the source tree; cannot meaningfully simulate the clean-machine NFR-M4 path here). The fixture is the canonical reviewer artifact; Epic 6 Story 6.10 marketplace release verification will execute the timed walkthrough on a clean container.
- Errors registry remains at 16 codes (verified via `src/errors.ts` `errorRegistry` const — unchanged from Story 1.12).
- AR41 import-boundary check: trivially satisfied (zero `*.ts` mutations).
- Markdown lint NOT run (per Task 6.5 — optional in v0.1; Epic 6 Story 6.10 polish item).

### File List

**New (created by Story 1.13):**
- `README.md` (103 lines) — repo-root landing page; canonical Quick Start + FR49 + Documentation map.
- `docs/getting-started.md` (119 lines) — onboarding companion; prerequisites, install walkthrough, commands surface table, state location, troubleshooting top-5.
- `docs/exit-codes.md` (176 lines) — FR53 catalog; codes 0-5 with verbatim `actionableHint` quotes from `src/errors.ts`.
- `tests/fixtures/quick-start-walkthrough.md` (62 lines) — NFR-M4 timed walkthrough fixture; prose-only (CI automation deferred to Story 6.10).
- `tests/fixtures/` — new directory created by this story.

**Modified by Story 1.13:**
- `_bmad-output/implementation-artifacts/1-13-quick-start-documentation.md` — frontmatter status `ready-for-dev` → `review`; all 73 task checkboxes ticked; Dev Agent Record populated; Change Log entry appended.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `1-13-quick-start-documentation` `ready-for-dev` → `review`; `last_updated` refreshed.
- `.bmad-stepper/runs/2026-05-01T035155Z-bmad-next/tasks/t1-dev-story.yaml` — new task record YAML.

**NOT modified (verified):**
- All `src/**` files — zero TS deltas (the single staged change to `src/commands/index.ts` is a Story 1.12 leftover, not introduced by Story 1.13).
- `commands/bmad-next.md`, `commands/bmad-doctor.md` — pre-existing slash-command files (Stories 1.1 + 1.12).
- `.claude-plugin/plugin.json` — pre-existing marketplace manifest (Story 1.1).
- `package.json`, `tsconfig.json`, `biome.json` — no config changes.

## Senior Developer Review (AI)

**Reviewer:** Senior Code Reviewer (claude-opus-4-7[1m])
**Date (UTC):** 2026-05-01
**Outcome:** **APPROVE** (0 must-fix, 0 should-fix, 0 nits — 1 info note)
**Loop / Run:** /bmad-loop --until=epic:2 (loopId 2026-05-01T031243Z-bmad-loop, runId 2026-05-01T040043Z-bmad-next, iteration 5)

### Reviewer note

Story 1.13 closes Epic 1 with a tight, documentation-only deliverable. Every artefact tracks back to a planning anchor (architecture lines 1377/1379/1380/1383/1423; PRD FR47/FR49/FR50/FR53/FR54/NFR-M4) and the AC-1 5-line stderr block — the most regression-prone surface — is byte-identical across all three required documents (verified independently below). Story scope discipline is exemplary: zero TS deltas, zero new tests, the test count is unchanged at 311 / 0 fail. The single staged TS edit (`src/commands/index.ts: + export * as doctor from "./doctor/index.ts";`) is a Story 1.12 leftover, NOT introduced here, and the story narrative explicitly acknowledges this (Debug Log line 555).

### AC verification

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1: README Quick Start → successful `/bmad-next --doctor` within 10 min (timed-walkthrough fixture in `tests/fixtures/quick-start-walkthrough.md`) | **PASS** | `README.md:5-47` Quick Start (8 numbered steps with NFR-M4 banner at L7); fixture at `tests/fixtures/quick-start-walkthrough.md:1-62` (8-step checklist with per-step time targets). 5-line stderr block byte-identical across README L35-41, getting-started L32-38, fixture L29-35 (md5=d1a03ba2e1b524bdcab1efea4e7f7cea). |
| AC-2: `docs/getting-started.md` complements with deeper context (commands surface, state location, troubleshooting top-5) | **PASS** | `docs/getting-started.md:42-57` Commands surface table (10 rows); L59-69 State location (7 canonical paths); L71-113 Troubleshooting top-5 (5 entries each quoting verbatim hint from `src/errors.ts`). |
| AC-3: `docs/exit-codes.md` lists every code 0–5 with examples and remediation | **PASS** | `docs/exit-codes.md:5-14` Quick reference table (all 6 codes); L18-156 Detailed catalog with `### Exit Code N` subsection per code, each containing Meaning + Error class(es) + Verbatim hints + Example invocation + Remediation. Cross-checked with `src/errors.ts`: every concrete `actionableHint` literal is reproduced character-identical (BmadNotInstalled L102-103, CorruptState L153-154, LockContention L81-82, DagCycle L146-147, UnknownBmadSkill default L130-131, etc.). |
| AC-4: README has the seven worked examples by reference (full bodies in Epic 6 Story 6.10) | **PASS** | `README.md:62-71` "What you get" lists all 7 example file paths under `docs/examples/` with explicit "ships in Epic 6 Story 6.10" disclaimer; `README.md:85-94` "Documentation map" reinforces forward-dep status. |

### Findings

| Severity | ID | File:Line | Finding |
|----------|-----|-----------|---------|
| (none — must) | — | — | — |
| (none — should) | — | — | — |
| (none — nit) | — | — | — |
| info | i1 | `_bmad-output/implementation-artifacts/1-13-quick-start-documentation.md:552-554` | Debug Log records the AC-1 5-line block md5 as `e0e5affb4c57650420be09a797fc035c` (after leading-whitespace strip per dev's local script). Reviewer's independent re-extraction (whitespace-trim each line, `\n`-join) yields md5=`d1a03ba2e1b524bdcab1efea4e7f7cea`. Both methods confirm 3-way identity across README/getting-started/fixture; the digest itself is methodology-dependent and non-load-bearing. No action required. |

### FR / NFR / AR verdicts

| Surface | Verdict | Evidence |
|---------|---------|----------|
| FR47 marketplace install | **PASS** | `README.md:23-26` (step 3 `/plugin marketplace add tgorka/bmad-stepper` invocation, references `.claude-plugin/plugin.json`); `docs/getting-started.md:14-20` (long-form install walkthrough). |
| FR49 uninstall preserves `_bmad-output/.stepper/` | **PASS** | `README.md:73-83` ("Uninstall preserves your data" section explicitly enumerates the preserved paths: `state.yaml`, `state.yaml.bak`, `runs/*.log`, `runs/*.json`, `staging/<run-id>/`); mirrors property-assertion at `src/integration/doctor-marketplace.test.ts:190` (per Story 1.12 carry-over line 749). |
| FR50 BMAD detection visible on first run | **PASS** | `README.md:35` (1st stderr line `BMAD detected: v<version> (compatible)` — verbatim Story 1.12 AC-1 surface). |
| FR53 documented exit codes 0–5 | **PASS** | `docs/exit-codes.md` enumerates all 6 codes with verbatim hints from `src/errors.ts` (16-entry registry, unchanged from Story 1.12). |
| FR54 stdout/stderr discipline | **PASS** | `README.md:34` ("emits these five lines on **stderr**"); `tests/fixtures/quick-start-walkthrough.md:27` (Step 7 explicitly verifies stderr); `docs/getting-started.md:30` ("emits these five lines on **stderr**"). |
| NFR-M4 10-min dogfood walkthrough | **PASS** | `README.md:7` target banner; `tests/fixtures/quick-start-walkthrough.md:1-62` canonical timing harness with per-step targets totaling ≤10 min. |
| AR21 errors carry `code` + `actionableHint` | **PASS** | `docs/exit-codes.md` quotes verbatim hints (no paraphrasing detected). |
| AR22 single-line "Run/See/Try/Check" hint discipline | **PASS** | All quoted hints in `docs/getting-started.md` §Troubleshooting top-5 and `docs/exit-codes.md` are single-line and verb-prefixed. |
| AR33 exit-code discipline | **PASS** | `docs/exit-codes.md` Quick reference table (lines 5-14) enumerates all 6 codes; CI integration tip (lines 158-176) is the canonical script consumer. |

### Quality gates

- `bun run check` — **PASS** (311 pass / 0 fail / 1161 expect() / 32 test files / 1342 ms — baseline preserved exactly per Story 1.12 line 549).
- README line count — **PASS** (103 lines vs. ≤200 budget per architecture line 1377/1379 — well within budget; ~50% headroom).
- Source-tree scope — **PASS** (zero TS/config mutations introduced by Story 1.13; the 1-line `src/commands/index.ts` barrel addition and untracked `src/commands/doctor/`, `src/integration/` files are all Story 1.12 leftovers per story narrative).
- AC-1 5-line block 3-way byte identity — **PASS** (md5=d1a03ba2e1b524bdcab1efea4e7f7cea across README L35-41, getting-started L32-38, fixture L29-35).
- Markdown link sanity — **PASS** (relative links `docs/getting-started.md`, `docs/exit-codes.md`, `tests/fixtures/quick-start-walkthrough.md` all resolve; forward-dep links to Epic 6 placeholders explicitly disclaimed).
- Cross-doc hint consistency — **PASS** (every quoted hint in `docs/exit-codes.md` matches the `src/errors.ts` registry literal character-for-character).

### Carry-overs

None. Documentation-only story; no follow-up work generated. The following are pre-existing carry-overs from upstream stories that remain open and are NOT modified by this review:

- Story 1.12 N1 (smoke test removes BMAD plugin layout instead of Stepper plugin layout) — tracked for Story 6.10 polish.
- Story 1.10 `tarjan→sort` file rename — deferred to Story 3.6/3.7 polish.
- Story 1.10 idempotent-rerun field — deferred to Story 5.1.
- Story 1.12 I2 (export `resolvePluginDir` from `bmad-detect/index.ts` to eliminate duplication in `checks.ts:490-510`) — bmad-detect polish backlog.
- Story 1.12 I3 (`countProjectOverrides` inline YAML extractor unification) — Story 6.1 config-loader.

### Final action

Status flipped: `review` → `done`. Sprint-status.yaml updated: `1-13-quick-start-documentation: review → done`; `epic-1: in-progress → done` (all 13 stories of Epic 1 now complete; epic-1-retrospective remains `optional`). Epic 1 closure milestone met.

## Change Log

| Date       | Author           | Change                                                                                                                |
|------------|------------------|------------------------------------------------------------------------------------------------------------------------|
| 2026-05-01 | bmad-create-story | Initial story draft authored from epics.md §Story 1.13 (lines 559-572) + architecture cross-references.                |
| 2026-05-01 | bmad-agent-dev    | Implementation: 4 new MD files (README.md 103L, docs/getting-started.md 119L, docs/exit-codes.md 176L, tests/fixtures/quick-start-walkthrough.md 62L); Tasks 0-7 ticked; status `ready-for-dev` → `review`. |
| 2026-05-01 | bmad-code-review  | Senior Developer Review: APPROVE (0 must / 0 should / 0 nits / 1 info); all 4 ACs PASS; AC-1 byte-identity verified across 3 docs; status `review` → `done`. Epic 1 closure (`epic-1: in-progress → done`). |

## Change Log

- **2026-05-01**: Story file created (status `ready-for-dev`) — bmad-create-story persona. Drafted from epics.md §Story 1.13 lines 559-572, architecture.md §Directory tree lines 1035-1098 + §FR/NFR mapping lines 1377/1379/1380/1383/1423 + §Cross-cutting concern 10 line 1439 + §Implementation Handoff line 1753, prd.md FR47/FR49/FR50/FR53/FR54/NFR-M4. Mirrors Story 1.12 template structure. Files planned: 4 new Markdown (`README.md`, `docs/getting-started.md`, `docs/exit-codes.md`, `tests/fixtures/quick-start-walkthrough.md`); ZERO modified source files. LAST story of Epic 1 — documentation-only deliverable closing FR47 + FR49 + FR50 + FR53 + FR54 + NFR-M4 with the canonical 10-minute README Quick Start dogfood walkthrough.
- **2026-05-01**: Story implemented (status `ready-for-dev` → `review`) — bmad-agent-dev (Amelia) persona, model `claude-opus-4-7[1m]`. All 4 Markdown files created as planned: `README.md` (103 lines), `docs/getting-started.md` (119 lines), `docs/exit-codes.md` (176 lines), `tests/fixtures/quick-start-walkthrough.md` (62 lines). Tests: baseline 311 → final 311 (zero TS deltas; documentation-only). AC-1 5-line stderr block byte-identity verified across 3 occurrences (md5 `e0e5affb4c57650420be09a797fc035c` for all three). FR49 uninstall semantics documented in README §Uninstall preserves your data. FR53 exit-code catalog enumerates all 6 codes with verbatim `actionableHint` quotes. Errors registry remains at 16 codes. AR41 import boundary trivially satisfied (zero `*.ts` files touched). Manual stopwatch walkthrough deferred to Story 6.10 marketplace release verification. Zero deviations from story plan.
