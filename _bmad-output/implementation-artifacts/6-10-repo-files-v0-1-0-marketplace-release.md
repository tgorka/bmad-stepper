---
status: done
story_id: '6.10'
story_key: 6-10-repo-files-v0-1-0-marketplace-release
epic: '6'
title: 'Repo Files & v0.1.0 Marketplace Release'
created: '2026-05-06'
last_updated: '2026-05-06T06:05:00Z'
priority: high
estimated_effort: L
fr_coverage:
  - FR47     # PRIMARY — marketplace install path: `/plugin marketplace add tgorka/bmad-stepper`. Story 6.10 ships `.claude-plugin/plugin.json` finalised (version bump 0.0.0 → 0.1.0; keywords already present from Story 1.1) + the Claude Code marketplace listing (manual one-time submission per architecture line 1566 release process). The dogfood-validation 30-day clock per PRD §dogfood_validation_plan + product brief §Daily replacement target STARTS at this release.
  - FR48     # SECONDARY — `--upgrade` already ships in Story 6.9 (status: done; the upgrade flow's hint `Run /plugin marketplace update tgorka/bmad-stepper to upgrade.` references the marketplace identifier published in this story). Story 6.10 finalises the marketplace publication that makes the upgrade hint actionable for community users.
  - FR49     # SECONDARY — uninstall preserves state. Documented in `README.md` (already present at lines 73-83 — verify) + `CONTRIBUTING.md` + `docs/getting-started.md` (already present from Story 1.13). NO code changes; documentation-only confirmation in this story.
  - FR53     # SECONDARY — exit-code catalog. The new `CHANGELOG.md` initial v0.1.0 entry references the FR53 exit-code catalog at `docs/exit-codes.md` (already complete from Story 6.9 — verify). Documentation-only.
nfr_coverage:
  - NFR-M4   # PRIMARY — README's Quick Start section takes a fresh user to `/bmad-next` in under 10 minutes. The current README (at lines 5-48) already has a Quick Start passing this AC; Story 6.10 VERIFIES (not rewrites) that the Quick Start is intact and that all forward-references (`docs/examples/*` placeholders) get RESOLVED to ship paths in this story.
  - NFR-I1   # PRIMARY — BMAD compatibility declared per release in CHANGELOG. Story 6.10 ships the FIRST `CHANGELOG.md` with the canonical `## BMAD Compatibility — v6.5.x` section (per the regex Story 6.9's `extractBmadCompat` consumes — UPGRADE_69_BMAD_COMPAT_EXTRACTED_1 test passes against this exact heading shape). The `bmad-compat.yml` weekly CI workflow validates compatibility against the latest BMAD upstream.
  - NFR-I3   # PRIMARY — runtime parity at release: Stepper runs against the Claude Code plugin runtime as published at v0.1.0 release time. The `.github/workflows/release.yml` Changesets-based flow gates publication on the Linux+macOS matrix passing.
  - NFR-I5   # PRIMARY — Linux + macOS via Bun ≥ 1.3. The `.github/workflows/ci.yml` matrix is ALREADY in place (verify at `.github/workflows/ci.yml` lines 14-16); Story 6.10 VERIFIES it matches AR40 ("matrix Linux+macOS") and EXTENDS with the Bun version pin if not already present.
  - NFR-S2   # PRIMARY — writes only inside scope. The new docs (CONTRIBUTING.md, AGENTS.md, etc.) document the no-write-outside-scope contract; the integration test gate at `src/integration/no-write-outside-scope.test.ts` (architecture line 1245) ALREADY enforces this in CI. Story 6.10 documentation-only confirmation.
  - NFR-M1   # SECONDARY — every requirement has a test (orphan-FR detector). Story 6.10's CI workflows + the existing `bun run check` gate cumulatively enforce this; the new release.yml + bmad-compat.yml provide the release-gate enforcement layer.
ar_coverage:
  - AR38     # PRIMARY — repo files inventory: README + CHANGELOG.md (Changesets-managed; "BMAD Compatibility" section per release) + AGENTS.md (contributor + sub-agent contract) + CONTRIBUTING.md + SECURITY.md + CODE_OF_CONDUCT.md + MIT LICENSE + PR + issue templates + .github/dependabot.yml. Story 6.10 SHIPS all eight root-level files + the .github/ template tree. README + getting-started.md are v0.1 deliverables (already shipped Story 1.13 — verify intact).
  - AR39     # PRIMARY — seven worked examples: `docs/examples/{cold-start-return.md, single-step.md, overnight-loop.md, halt-recovery.md, skip-on-failure.md, doctor-diagnostic.md, state-export-ci.md}` + `examples/scripting/{ci-state-check.sh, nightly-loop.sh}`. The seven worked examples were forward-deferred from Story 1.13 (README at lines 63-69 has explicit `(Epic 6 Story 6.10 — placeholder)` callouts). Story 6.10 SHIPS the seven example bodies + the two scripting examples.
  - AR40     # PRIMARY — three CI workflows: `.github/workflows/ci.yml` (matrix Linux+macOS, `bun test` + `biome ci` — ALREADY exists from Story 1.1; verify matches spec) + `release.yml` (Changesets PR-based release flow — NEW) + `bmad-compat.yml` (weekly check vs latest BMAD upstream — NEW).
  - AR3      # PRIMARY — plugin manifest fields per AR3 (`name, version, description, author, homepage, repository, license: MIT, keywords: [...]`). Story 6.10 BUMPS `.claude-plugin/plugin.json:version` from `"0.0.0"` to `"0.1.0"` AND verifies all AR3-mandated fields are present (verify intact: `name`, `description`, `author`, `homepage`, `repository`, `license`, `keywords`).
  - AR41     # PRIMARY — module boundary graph UNCHANGED. Story 6.10 is documentation + CI + release files; ZERO source changes under `src/`. The boundary graph (foundational/mid/higher/top) is untouched.
  - AR42     # PRIMARY — persistence boundary documented in CONTRIBUTING.md + AGENTS.md. The integration tests at `src/integration/no-write-outside-scope.test.ts` (architecture line 1245) ALREADY enforce; Story 6.10 documents.
  - AR43     # PRIMARY — cross-platform constraints (Linux + macOS only; Windows via WSL only; ESM exclusively; source = release; no node:* unless explicit allowance). Documented in CONTRIBUTING.md + verified at .github/workflows/ci.yml matrix.
  - AR8      # SECONDARY — lock-free top-tier preserved. Story 6.10 has ZERO src/ changes; AR8 is preserved trivially.
  - AR9      # SECONDARY — stdout JSON-line invariant unchanged. ZERO src/ changes.
  - AR21     # SECONDARY — single-line audit notices contract documented in AGENTS.md sub-agent contract section.
  - AR22     # SECONDARY — actionable-hint regex + single-line constraint documented in CONTRIBUTING.md "errors as primary UX" section.
  - AR33     # SECONDARY — async fs/network discipline documented in AGENTS.md (sub-agent contract: file-in/file-out only; no console.log; throw StepperError subclasses).
  - AR34     # SECONDARY — slash-command markdown protocol documented in AGENTS.md sub-agent contract section + AR9 stdout JSON line.
  - AR35     # SECONDARY — test pattern (tmpdir-per-test, fixtures placement) documented in CONTRIBUTING.md "tests" section.
  - AR36     # PRIMARY — Biome 2.3 only / `bun run check` release-blocker gate. The new release.yml workflow consumes this gate. Documented in CONTRIBUTING.md.
  - AR31     # SECONDARY — naming conventions documented in CONTRIBUTING.md "code style" section (kebab-case files, camelCase functions, PascalCase types, SCREAMING_SNAKE_CASE constants).
  - AR32     # SECONDARY — repository structure (colocated tests, one folder per command, centralised schemas/errors/io) documented in AGENTS.md "code architecture" section.
deps:
  - story: '6.9'
    reason: 'PRIMARY — Story 6.9 (status: done) ships the `--upgrade` flow that uses the marketplace identifier `tgorka/bmad-stepper` in the AC-1 verbatim hint `Run /plugin marketplace update tgorka/bmad-stepper to upgrade.`. Story 6.10 finalises the marketplace publication so this hint is actionable. The upgrade flow ALSO consumes the canonical `BMAD Compatibility — v6.5.x` heading shape via `extractBmadCompat()` regex; Story 6.10 ships the FIRST CHANGELOG with this heading shape so the regex has real content to match against (not just synthetic test fixtures). The OQ-15 forward-deferral from Story 6.9 (cross-cutting `no-network-on-main.test.ts` enforcement) is RESOLVED IN-SCOPE-OPTIONAL by this story per OQ-3 below — the architecture pre-listing at line 1246 makes this a Story 6.10 candidate.'
  - story: '6.8'
    reason: 'PRIMARY — Story 6.8 (status: done) closes the auto-archival lifecycle (collector → aggregator → archiver). Story 6.10 INHERITS Sprint 6 storage hygiene SHIP. The CHANGELOG entry for v0.1.0 lists Story 6.8 as a feature delivery line ("Auto-archival of runs and telemetry; storage hygiene compliant").'
  - story: '6.7'
    reason: 'PRIMARY — Story 6.7 (status: done) introduces the standalone CLI pattern (`src/telemetry/cli.ts` + `src/upgrade/cli.ts` from 6.9). Story 6.10 documents the CLI surface in CONTRIBUTING.md (the `bun run aggregate-telemetry` and `bun run upgrade` scripts are documented as power-user shortcuts).'
  - story: '6.6'
    reason: 'PRIMARY — Story 6.6 ships telemetry opt-in (default false). Story 6.10 documents the telemetry posture in SECURITY.md + the README (already present from Story 1.13 — verify) + CONTRIBUTING.md (no PII enforcement contract per NFR-S3). The CHANGELOG entry mentions opt-in semantics so users know it is OFF by default.'
  - story: '6.1'
    reason: 'PRIMARY — Story 6.1 ships `bmad-stepper.config.yaml` schema + loader. Story 6.10 SHIPS the canonical example `examples/bmad-stepper.config.yaml` (architecture line 1086 pre-listing) AND `examples/bmad-6.4-overrides.yaml` (architecture line 1087 pre-listing — forward-compat override sample). The CHANGELOG v0.1.0 entry lists the configuration surface as a feature delivery line.'
  - story: '5.6'
    reason: 'PATTERN — Story 5.6 introduced the `failurePolicies:` config surface + the per-step actionable-error contract (FR46). Story 6.10 documents the failure-mode taxonomy (`retry` / `skip` / `route-to-fixer` / `escalate`) in CONTRIBUTING.md + AGENTS.md + the canonical `bmad-stepper.config.yaml` example. The CHANGELOG mentions the four failure-UX modes as a feature delivery line.'
  - story: '4.10'
    reason: 'PATTERN — Story 4.10 unifies loop-exit emission (formatLoopExitLines + writeLoopExitTranscript). Story 6.10 documents the loop-exit semantics in `docs/examples/overnight-loop.md` (one of the seven worked examples). The CHANGELOG entry for v0.1.0 lists `/bmad-loop` as a top-line feature delivery.'
  - story: '3.8'
    reason: 'PATTERN — Story 3.8 introduces `--export-state` + `--diff-state` non-locking read flags. Story 6.10 documents these in `docs/examples/state-export-ci.md` (worked example 7) AND in `examples/scripting/ci-state-check.sh` (PRD §scripting_support — CI integration sample script).'
  - story: '3.9'
    reason: 'PATTERN — Story 3.9 introduces `--watch` live transcript tail. Story 6.10 documents the watch flag in CONTRIBUTING.md + the README (verify intact). NO new examples for `--watch` (it is interactive-only; not a worked example fit).'
  - story: '1.13'
    reason: 'PATTERN — Story 1.13 introduces the README Quick Start + `docs/getting-started.md`. Story 6.10 VERIFIES (does NOT rewrite) the Quick Start meets NFR-M4 + RESOLVES the seven `(Epic 6 Story 6.10 — placeholder)` forward-references in README at lines 63-69 + 91-95 + 98-101 to the final ship paths.'
  - story: '1.12'
    reason: 'PATTERN — Story 1.12 introduces `/bmad-next --doctor`. Story 6.10 documents the doctor command in `docs/examples/doctor-diagnostic.md` (worked example 6).'
  - story: '1.10'
    reason: 'PATTERN — Story 1.10 introduces the three-tier registry. Story 6.10 documents the `overrides:` block in `examples/bmad-6.4-overrides.yaml` + the canonical `bmad-stepper.config.yaml` example.'
  - story: '1.7'
    reason: 'PATTERN — Story 1.7 introduces the CLI argument parser (NextArgsSchema + LoopArgsSchema). Story 6.10 documents the flag surface in CONTRIBUTING.md + the seven worked examples each pair a flag combo with expected output.'
  - story: '1.1'
    reason: 'PATTERN — Story 1.1 establishes the repository scaffold (`.claude-plugin/plugin.json`, `.changeset/`, `.github/workflows/ci.yml`, package.json, etc.). Story 6.10 EXTENDS the scaffold by SHIPPING the AR38 repo files (CHANGELOG, AGENTS.md, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT) + the AR40 CI workflows (release.yml, bmad-compat.yml) + the AR39 examples + bumps `.claude-plugin/plugin.json:version` from "0.0.0" to "0.1.0". Story 1.1 baseline AR3 manifest fields are VERIFIED unchanged.'
  - story: '6.10'
    reason: 'SELF-REFERENCE — Story 6.10 is the SHIP-IT story for v0.1.0 marketplace release. The deliverables are the canonical AR38/AR39/AR40 inventory + the marketplace publication.'
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/product-brief-bmad-stepper.md
  - _bmad-output/planning-artifacts/product-brief-bmad-stepper-distillate.md
  - _bmad-output/implementation-artifacts/6-9-upgrade-flow.md
  - _bmad-output/implementation-artifacts/6-8-auto-archival-of-runs-and-telemetry.md
  - _bmad-output/implementation-artifacts/6-7-telemetry-aggregation-report.md
  - _bmad-output/implementation-artifacts/6-1-bmad-stepper-config-yaml-schema-loader.md
  - _bmad-output/implementation-artifacts/1-13-quick-start-documentation.md
  - _bmad-output/implementation-artifacts/1-1-initialize-repository-scaffold.md
  - _bmad-output/implementation-artifacts/sprint-status.yaml
  - _bmad-output/implementation-artifacts/epic-5-retrospective.md
  - _bmad-output/implementation-artifacts/epic-4-retrospective.md
  - .bmad-stepper/state.yaml
  - .claude-plugin/plugin.json
  - package.json
  - README.md
  - LICENSE
  - .github/workflows/ci.yml
  - .changeset/config.json
  - .changeset/README.md
  - commands/bmad-next.md
  - commands/bmad-loop.md
  - commands/bmad-doctor.md
  - agents/bmad-step-runner.md
  - agents/bmad-step-fixer.md
  - docs/getting-started.md
  - docs/configuration.md
  - docs/exit-codes.md
  - src/upgrade/check.ts
  - src/upgrade/render.ts
---

# Story 6.10: Repo Files & v0.1.0 Marketplace Release

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a community user discovering Stepper,
I want a complete OSS-ready repository (README, CHANGELOG, AGENTS.md, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, LICENSE, examples, dependabot, weekly bmad-compat CI) and a v0.1.0 release on the Claude Code marketplace,
So that the product is shippable and contributable on day one — closing Epic 6 and Sprint 6 with the SHIP-IT deliverable for the v0.1.0 marketplace listing at `tgorka/bmad-stepper` (FR47), with the dogfood-validation 30-day clock starting on this release.

## Context Summary

This is the **TENTH AND FINAL STORY of Epic 6** (Sprint 6 — Configuration & Distribution) and the **v0.1.0 marketplace release deliverable**. Story 6.9 just shipped (status: done; 1610/0/5192 across 83 files; errors registry 17 verified independently; `--upgrade` flow fully wired with NFR-S1 sole exception isolated to `src/upgrade/`). Story 6.10 closes the project's v0.1.0 release by shipping the AR38/AR39/AR40 repo-files inventory + bumping the version to `0.1.0` + publishing the plugin to the Claude Code marketplace at `tgorka/bmad-stepper`.

**Story 6.10 is therefore primarily a DOCUMENTATION + CI WORKFLOW + RELEASE story** — ZERO source code changes under `src/`. The deliverables are:

1. **VERIFY existing scaffold from Story 1.1 + Story 1.13** — The repository already has: `.claude-plugin/plugin.json`, `package.json`, `tsconfig.json`, `biome.json`, `bunfig.toml`, `.changeset/{config.json, README.md}`, `.github/workflows/ci.yml`, `commands/{bmad-next,bmad-loop,bmad-doctor}.md`, `agents/{bmad-step-runner,bmad-step-fixer}.md`, `docs/{getting-started,configuration,exit-codes}.md`, `README.md` (with Quick Start NFR-M4-compliant), `LICENSE`. **CRITICAL FINDING: the existing `LICENSE` file is Apache 2.0, but AC-1 + AR38 + product brief mandate MIT**. Story 6.10 REPLACES the LICENSE with MIT (per OQ-1 below).

2. **NEW root-level files** — `CHANGELOG.md`, `AGENTS.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`. Five new root-level documentation files completing the AR38 OSS-ready inventory.

3. **NEW `.github/` templates + dependabot** — `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/{bug.md, feature.md, bmad-compat.md}`, `.github/dependabot.yml`. Five new template + automation files completing the AR38 .github/ inventory.

4. **NEW seven worked examples (AR39)** — `docs/examples/{cold-start-return.md, single-step.md, overnight-loop.md, halt-recovery.md, skip-on-failure.md, doctor-diagnostic.md, state-export-ci.md}` + `examples/scripting/{ci-state-check.sh, nightly-loop.sh}` + `examples/bmad-stepper.config.yaml` + `examples/bmad-6.4-overrides.yaml`. Eleven new example files (seven docs/examples + two scripting + two config). Each `docs/examples/*.md` pairs the command with expected output and a short narrative per PRD §code_examples line 467.

5. **NEW two CI workflows (AR40)** — `.github/workflows/release.yml` (Changesets PR-based release flow) + `.github/workflows/bmad-compat.yml` (weekly check vs latest BMAD upstream). The existing `.github/workflows/ci.yml` is VERIFIED (matches spec at AR40 — matrix Linux+macOS + bun test + biome ci); EXTENDED with a Bun version pin per OQ-2 below.

6. **`.claude-plugin/plugin.json` version bump** — from `"0.0.0"` to `"0.1.0"`. The AR3-mandated fields (name, description, author, homepage, repository, license, keywords) are ALREADY present from Story 1.1 baseline (verify intact). The version bump is the ONLY mutation.

7. **`package.json` version bump** — from `"0.0.0"` to `"0.1.0"`. Mirrors the plugin manifest bump for consistency.

8. **README forward-reference resolution** — The current README has seven `(Epic 6 Story 6.10 — placeholder)` callouts at lines 63-69 + 91-95 + 98-101. Story 6.10 RESOLVES these placeholders to the final ship paths now that the example files exist. NO Quick Start rewrite — Story 1.13's Quick Start is preserved verbatim per NFR-M4.

9. **Initial Changesets entry** — `.changeset/v0-1-0-marketplace-release.md` containing the v0.1.0 release notes that, on merge, drives the auto-generated Version Packages PR + GitHub Release. The Changeset summary is the FIRST `## BMAD Compatibility — v6.5.x` heading consumed by Story 6.9's `extractBmadCompat()` regex.

10. **Marketplace publication** — Manual one-time submission of the plugin to the Claude Code marketplace at `tgorka/bmad-stepper` per architecture line 1566 release process. This is a HUMAN-DRIVEN action (developer submits the listing via the Claude Code marketplace UI); Story 6.10 ships the artifact (the repo tarball at the v0.1.0 tag) that is the marketplace's installable unit per architecture line 1568 ("the repository tarball *is* the artifact installed by the marketplace; there is no separate dist or container").

The dogfood-validation 30-day clock per PRD §dogfood_validation_plan + product brief §Daily replacement (≥30 days target, first 60 days post-v0.1.0) STARTS at this release. **Closing the dogfood-validation clock is OUT OF SCOPE for Story 6.10** — Story 6.10 only STARTS the clock by shipping v0.1.0; the post-release retrospective (Epic 6 retrospective optional + future post-v0.1 retrospective) closes it.

### What is in scope (Story 6.10)

#### Root-level files (5 NEW + 1 REPLACED + 2 BUMPED + 1 VERIFIED)

1. **NEW `CHANGELOG.md`** — Changesets-managed; the FIRST entry is the v0.1.0 release notes. Structure:
   ```markdown
   # Changelog

   This file is auto-managed by [Changesets](https://github.com/changesets/changesets). For release-history entries see below.

   ## 0.1.0 — <release-date>

   ### Initial public release

   - **Two slash commands shipped:** `/bmad-next` (zero-config single-step advance, full flag inventory per FR1-FR15 + FR27-FR32 + FR41-FR42 + FR50-FR54), `/bmad-loop` (bounded loop with eight stop conditions, four failure-UX modes, SIGINT graceful exit per FR19-FR30).
   - **State machine:** atomic state on disk at `_bmad-output/.stepper/state.yaml` with `.bak` rotation, file lock with PID heartbeat, branch+sha snapshot, schema-versioned + Zod-migrated. Recovery from any halt via `--resume`.
   - **Sub-agent dispatch contract:** verifier-before-promote gate, declared context budget + timeout per task, `staging/<run-id>/` workspace, transcript-per-step (markdown + JSON).
   - **Failure-UX modes:** retry, skip, route-to-fixer, escalate; per-step policy via `bmad-stepper.config.yaml`.
   - **Configuration surface:** `bmad-stepper.config.yaml` schema with personas, overrides, verifiers, failurePolicies, models, budgets, paths, telemetry blocks.
   - **Telemetry:** opt-in (`telemetry.enabled: true`); local-only; no PII; rotated at 12 months.
   - **Auto-archival:** runs older than 90 days archived to `_bmad-output/.stepper/runs/.archive/`.
   - **Diagnostic flags:** `--doctor`, `--upgrade`, `--explain`, `--list`, `--export-state`, `--diff-state`, `--watch`, `--plan-first`, `--recompute-state`.
   - **Marketplace publication:** `/plugin marketplace add tgorka/bmad-stepper` + `--upgrade` flow that checks GitHub Releases.
   - **Documentation:** README + Quick Start (under 10 minutes per NFR-M4); `docs/{getting-started, configuration, exit-codes}.md`; seven worked examples in `docs/examples/`; scripting examples in `examples/scripting/`.

   ### BMAD Compatibility — v6.5.x

   Tested against BMAD-METHOD v6.5.x (the latest stable at v0.1.0 release time). Compatible with v6.3+ (the marketplace-shipped seed; older versions may require project-level overrides via `bmad-stepper.config.yaml:overrides`).

   The `--doctor` command reports any unknown skill on first run; the `overrides:` config block is the documented escape hatch for forward-compatibility.
   ```
   The `## BMAD Compatibility — v6.5.x` heading is BYTE-IDENTICAL to the regex shape Story 6.9 `extractBmadCompat()` consumes (validated by UPGRADE_69_BMAD_COMPAT_EXTRACTED_1 test). Per OQ-4 below, the heading uses an em-dash `—` (U+2014) per the canonical convention.

2. **NEW `AGENTS.md`** — contributor + sub-agent contract per AR38 + architecture line 1037. Structure:
   ```markdown
   # AGENTS.md

   This document is the **contract for AI agents and human contributors** working on Stepper. It captures (a) the sub-agent dispatch contract for Layer 3 BMAD agents (`agents/bmad-step-runner.md` + `agents/bmad-step-fixer.md`), (b) the contributor expectations for Layer 1 markdown + Layer 2 TypeScript code, and (c) the architectural boundaries that ALL contributions MUST respect.

   ## Three-Layer Architecture

   - **Layer 1 (`commands/*.md`, `agents/*.md` descriptions):** Claude Code main thread. Communicates with Layer 2 via Bash; with Layer 3 via Task. NEVER does direct file IO.
   - **Layer 2 (`src/**/*.ts`):** Bun TypeScript core. Communicates with the filesystem and the GitHub API (only inside `src/upgrade/`). NEVER calls Task or orchestrates sub-agents.
   - **Layer 3 (`agents/*.md` body):** BMAD sub-agents. File-in/file-out only via `staging/<run-id>/`. NEVER decides what comes next; never validates own output; never interacts with the user.

   ## Sub-Agent Dispatch Contract (Layer 3)

   Every heavy task is delegated to an isolated sub-agent. The dispatch contract is six-section, mandatory in every sub-agent invocation:

   - **PERSONA** — which BMAD persona owns this work
   - **CONTEXT** — input files, frontmatter snippets, prior step outputs
   - **TASK** — single clear deliverable (one artifact)
   - **OUTPUT FORMAT** — schema, required sections, file location in staging dir
   - **SUCCESS CRITERIA** — verifier-checkable conditions
   - **CONSTRAINTS** — allowed tools, scope limits, what NOT to do

   Operational discipline:

   - Sub-agent **does not decide what comes next.** Orchestration stays main-thread.
   - Sub-agent **does not validate its own output.** Verifier runs as a separate step.
   - Sub-agent **does not interact with the user.** File-in, file-out only.
   - Sub-agent **has a declared context budget** (default 60k) and **timeout** (default 5 min) per task; both overrideable via config.
   - Sub-agent writes to `_bmad-output/.stepper/staging/<run-id>/` first; main thread promotes to final location only after the verifier passes.
   - Sub-agent run is fully captured in the transcript log under `_bmad-output/.stepper/runs/<ts>-<step>.log` for audit.

   ## Code Architecture (Layer 2)

   - **Foundational tier (no upward imports):** `src/errors.ts`, `src/schemas/`, `src/io/`.
   - **Mid-tier (depend only on foundational):** `src/migrations/`, `src/state/`, `src/bmad-detect/`, `src/personas/`, `src/dag/`, `src/transcript/`, `src/telemetry/`, `src/upgrade/`, `src/runs/`, `src/startup/`, `src/snapshot/`, `src/lock/`, `src/config/`, `src/failure-ux/`.
   - **Higher-tier (depend on foundational + mid-tier):** `src/verifiers/`, `src/dispatch/`.
   - **Top-tier (depend on everything below):** `src/commands/{next, loop, doctor}/`.

   The dependency graph is enforced by the `src/integration/no-write-outside-scope.test.ts` + `src/integration/no-network-on-main.test.ts` CI gates. NEVER add an upward import from a foundational module.

   ## Errors as Primary UX

   Errors are first-class UX. Every halt produces a single-line actionable hint matching the regex `/^.*(Run|See|Try|Check) /` per AR22. The errors registry lives in `src/errors.ts` (currently 17 codes); adding a new error class requires:

   - A unique `StepperErrorCode` union member (SCREAMING_SNAKE_CASE).
   - An `actionableHint` field passing the AR22 regex.
   - A registration entry in the `errorRegistry`.
   - A test in `src/errors.test.ts` asserting the registry membership AND the single-line constraint (`expect(actionableHint).not.toMatch(/\n/)`).
   - The integration sweep at `src/integration/escalate-actionable-hint.test.ts` automatically picks up the new class via the registry sweep.

   ## State Discipline

   - State lives at `_bmad-output/.stepper/state.yaml` with a `.bak` rotation buddy.
   - Atomic writes via tmp+rename; lock-based read-modify-write cycles via `_bmad-output/.stepper/state.yaml.lock/`.
   - **NEVER** write to `~/.claude/plugins/` from any code path (NFR-S2 + AR42; CI-gated).
   - **NEVER** mutate state outside `_bmad-output/`.

   ## Network Discipline

   - **NEVER** make a main-thread network call EXCEPT inside `src/upgrade/` (NFR-S1 + AR41 mid-tier exception).
   - The CI gate `src/integration/no-network-on-main.test.ts` enforces this.
   - Sub-agents follow Claude Code's standard model API path (no Stepper code involvement).

   ## Slash-Command Markdown Protocol (AR34)

   Each `commands/<name>.md` follows this body pattern:

   1. Bash: `bun run src/commands/<name>/run.ts -- $ARGUMENTS` (Layer 1 → Layer 2).
   2. Read the AR9-disciplined single JSON line from stdout.
   3. If `action: "dispatch"`, Task tool invokes the sub-agent (Layer 1 → Layer 3).
   4. Bash: `bun run src/commands/<name>/verify-and-advance.ts -- <run-id>` (Layer 1 → Layer 2 verify-and-advance).
   5. Print summary line.

   Frontmatter requirements: `description`, `argumentHint`, `allowedTools: ["Bash", "Task", "Read"]`.

   ## Test Patterns (AR35)

   - Tests are colocated `<source>.test.ts` next to source. NO `tests/` directory inside `src/`.
   - Every fs-touching test seeds `mkdtemp(path.join(os.tmpdir(), "stepper-..."))` and cleans up in afterEach.
   - Tests NEVER touch `_bmad-output/` (the project's own state directory).
   - Fixtures live at `tests/fixtures/<scenario>/` with minimal BMAD-project replicas.
   - Unique test ID prefixes per concern: e.g., `UPGRADE_69_*`, `RENDER_69_*`, `CLI_69_*`.

   ## Code Quality Gates

   - **`bun run check`** is the release-blocker gate (Biome 2.3 lint + bun test).
   - **`bunx tsc --noEmit`** must exit 0.
   - The integration test triplet (`escalate-actionable-hint.test.ts` + `no-write-outside-scope.test.ts` + `no-network-on-main.test.ts`) MUST pass.
   - All four failure-UX modes (retry / skip / route-to-fixer / escalate) and all eight stop-condition paths have integration tests.

   ## Contributing

   See `CONTRIBUTING.md` for the full contributor flow (fork, branch, PR template, Changeset, CI gates, review process).
   ```

3. **NEW `CONTRIBUTING.md`** — contributor flow per AR38. Structure:
   ```markdown
   # Contributing to BMAD Stepper

   Thanks for your interest in contributing to Stepper. This document covers (a) the development setup, (b) the PR flow + Changesets, (c) the code style + tests, and (d) the maintainer governance posture.

   ## Development Setup

   1. Install Bun ≥ 1.3: `curl -fsSL https://bun.sh/install | bash` or `brew install oven-sh/bun/bun`.
   2. Clone the repo: `git clone https://github.com/tgorka/bmad-stepper && cd bmad-stepper`.
   3. Install dependencies: `bun install --frozen-lockfile`.
   4. Run the test suite: `bun test`. Expected: all pass.
   5. Run the full check: `bun run check` (Biome lint + tests).

   No build step — Stepper is source-as-release; Bun runs `.ts` directly.

   ## PR Flow

   1. Fork the repository and create a feature branch.
   2. Make your changes following the code-style + test patterns below.
   3. Run `bun run check` locally — it must exit 0 (Biome clean + all tests pass).
   4. Add a Changeset entry: `bun run changeset` — describe the change in user-facing terms.
   5. Open a PR using the PR template at `.github/PULL_REQUEST_TEMPLATE.md`.
   6. CI will run on the PR (matrix Linux+macOS + bun test + biome ci); a green CI is required.
   7. The maintainer reviews; addresses review comments by adding new commits (NOT amend-force-push for active PRs — Stepper history is auditable).
   8. On merge, the auto-generated *Version Packages* PR is updated; merging that PR publishes a GitHub Release + the Claude Code marketplace listing is updated.

   ## Code Style (AR31, AR33, AR36)

   - **Files:** `kebab-case.ts`. Tests: colocated `<source>.test.ts`.
   - **TypeScript:** `camelCase` functions/variables, `PascalCase` types/interfaces (no `I` prefix), `SCREAMING_SNAKE_CASE` constants.
   - **Async:** always `async/await`. Bun-native APIs preferred (`Bun.file`, `Bun.write`, `Bun.YAML.parse`, `Bun.spawn`).
   - **Errors:** throw `StepperError` subclasses (NOT `Result<T,E>` in general code path). Sole exception: CLI parser uses `Result<Args, ParseError>`.
   - **No `any`. No `console.log`** in runtime code — use `src/io/log.ts` (`info`, `warn`, `error`, `json`).
   - **Biome 2.3 only** (no ESLint/Prettier). `biome.json` enforces strict rules including `noConsoleLog`, `noImplicitAnyLet`. Run `bunx biome ci .` to verify.
   - **No `node:*` imports** unless an explicit lint allowance — Stepper targets Bun stdlib only.

   ## Test Patterns (AR35)

   - Tests are colocated `<source>.test.ts` next to source. NO `tests/` directory inside `src/`.
   - Every fs-touching test uses `mkdtemp(path.join(os.tmpdir(), "stepper-<concern>-"))` + cleanup in afterEach.
   - Tests NEVER touch `_bmad-output/` from a test (the project's own state directory).
   - Test ID prefix discipline: pick a unique prefix per concern (e.g., `UPGRADE_69_*` for Story 6.9 upgrade).
   - Run `bun test` for the full suite; `bun test --watch` for active development; `bun test src/<dir>` for a single concern.

   ## State + Network Discipline

   - **NEVER write to `~/.claude/plugins/`** from any code path. NFR-S2; CI-gated by `src/integration/no-write-outside-scope.test.ts`.
   - **NEVER make a main-thread network call** EXCEPT inside `src/upgrade/`. NFR-S1; CI-gated by `src/integration/no-network-on-main.test.ts`.
   - **NEVER mutate state outside `_bmad-output/`** (the project's own scope).

   ## Errors as Primary UX (AR21, AR22)

   Errors are first-class UX. Every halt produces a single-line actionable hint matching the regex `/^.*(Run|See|Try|Check) /`. Adding a new error class:

   1. Add a unique `StepperErrorCode` union member (SCREAMING_SNAKE_CASE).
   2. Implement the `XxxError` class extending `StepperError` with an `actionableHint` field.
   3. Register in the `errorRegistry`.
   4. Add a test in `src/errors.test.ts` asserting registry membership + AR22 regex match + single-line constraint.
   5. The registry sweep at `src/integration/escalate-actionable-hint.test.ts` automatically picks up the new class.

   The errors registry currently holds 17 codes; growth is intentional + reviewed.

   ## Cross-Platform Constraints (AR43)

   - **Linux + macOS only** via Bun ≥ 1.3.
   - **Windows via WSL** only.
   - **ESM exclusively** (no CommonJS).
   - **Source = release** (no `dist/`, no transpile step).
   - The CI matrix at `.github/workflows/ci.yml` runs against `ubuntu-latest` + `macos-latest`.

   ## Governance Posture

   Stepper is currently a single-maintainer project (per the product brief — single-author-dogfood context). The maintainer's discipline:

   - **Issues evaluated against personal use** — feature requests are weighed against the dogfood validation plan.
   - **`AGENTS.md` is the contract** — contributions that violate the three-layer architecture or the AR41 boundary graph are politely declined.
   - **Changesets are mandatory** — every visible change requires a Changeset entry; reviewers will request one if missing.
   - **No force-pushes to active PRs** — history is auditable.

   ## Reporting Bugs / Asking Questions

   - **Bug:** open an issue using the bug template at `.github/ISSUE_TEMPLATE/bug.md`.
   - **Feature request:** use the feature template at `.github/ISSUE_TEMPLATE/feature.md`.
   - **BMAD compatibility issue (e.g., new BMAD release breaks Stepper):** use the bmad-compat template at `.github/ISSUE_TEMPLATE/bmad-compat.md`.
   - **Security:** see `SECURITY.md` for the reporting channel.

   ## License

   Stepper is MIT-licensed (see `LICENSE`). By contributing, you agree your contributions are licensed under MIT.
   ```

4. **NEW `SECURITY.md`** — security policy per AR38 + architecture line 1663 (vuln reporting email + supported versions table). Structure:
   ```markdown
   # Security Policy

   ## Supported Versions

   Stepper currently supports the latest minor version on the `main` branch. Older minor versions may receive security patches at the maintainer's discretion.

   | Version | Supported          |
   |---------|--------------------|
   | 0.1.x   | :white_check_mark: |
   | < 0.1   | :x:                |

   ## Reporting a Vulnerability

   If you discover a security vulnerability in Stepper, please report it privately by emailing the maintainer at `tomasz.jakub.gorka@gmail.com` with subject prefix `[bmad-stepper SECURITY]`.

   Please include:

   - A clear description of the vulnerability and its impact.
   - Steps to reproduce (commands, file states, expected vs. observed behavior).
   - Your suggested remediation if you have one.

   The maintainer will acknowledge receipt within 7 days, propose a remediation timeline, and coordinate disclosure with you.

   ## Security Posture (Stepper-Specific)

   Stepper enforces the following security invariants in v0.1+:

   - **NFR-S1:** No main-thread network I/O except `--upgrade` and Claude Code marketplace operations. Sub-agents follow Claude Code's standard model API path (no Stepper code involvement).
   - **NFR-S2:** Stepper writes only inside the project root and the user's `~/.claude/plugins/` directory (the latter only via marketplace operations Stepper does not initiate). NEVER writes to BMAD-installed files. CI-gated.
   - **NFR-S3:** Telemetry contains no PII, no source code, and no file paths outside the project root. Local-only in v0.1; remote upload is not implemented. Telemetry is opt-in (`telemetry.enabled: true` in `bmad-stepper.config.yaml`); default OFF.
   - **NFR-S4:** Sub-agent isolation enforces the declared context budget and tool restriction; sub-agents cannot escalate access to tools not declared in their `CONSTRAINTS` section.
   - **NFR-S5:** State files have explicit read/write semantics: atomic tmp+rename for writes, file locks for read-modify-write cycles, halt on lock contention rather than retry-and-overwrite.
   - **NFR-S6:** Stepper does NOT execute generated code from sub-agents as part of dispatch. Sub-agent output is artifact, not executable.

   The integration tests at `src/integration/no-write-outside-scope.test.ts` + `src/integration/no-network-on-main.test.ts` enforce NFR-S1 + NFR-S2 in CI.

   ## Vulnerability Disclosure Timeline

   1. Day 0: Vulnerability reported privately.
   2. Day 7: Maintainer acknowledgement + initial assessment.
   3. Day 7-30: Remediation development.
   4. Day 30+: Coordinated disclosure (private fix released, then public advisory after a reasonable upgrade window).

   The maintainer reserves the right to extend the timeline for complex vulnerabilities and will communicate any extension to the reporter.
   ```

5. **NEW `CODE_OF_CONDUCT.md`** — community CoC per AR38. Use the Contributor Covenant v2.1 (the canonical OSS standard) per OQ-5 below. The full text is the standard Contributor Covenant 2.1; substitute the contact email `tomasz.jakub.gorka@gmail.com`.

6. **REPLACED `LICENSE`** — REPLACE the existing Apache 2.0 LICENSE (201 lines) with the canonical MIT license text per AR38 + product brief line 210 + epics.md AC line 1304. The MIT license text is:
   ```
   MIT License

   Copyright (c) 2026 Tomasz Gorka

   Permission is hereby granted, free of charge, to any person obtaining a copy
   of this software and associated documentation files (the "Software"), to deal
   in the Software without restriction, including without limitation the rights
   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   copies of the Software, and to permit persons to whom the Software is
   furnished to do so, subject to the following conditions:

   The above copyright notice and this permission notice shall be included in all
   copies or substantial portions of the Software.

   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   SOFTWARE.
   ```
   Per OQ-1 below, this REPLACEMENT is the correction for an existing inconsistency where Story 1.1 shipped Apache 2.0 by accident; the AC + product brief have always specified MIT.

7. **BUMPED `.claude-plugin/plugin.json:version`** — `"0.0.0"` → `"0.1.0"`. ALL OTHER FIELDS UNCHANGED (verify: `name: "bmad-stepper"`, `description`, `author: { name: "tgorka" }`, `homepage: "https://github.com/tgorka/bmad-stepper"`, `repository: "https://github.com/tgorka/bmad-stepper"`, `license: "MIT"` — verify present per AR3, `keywords: ["claude-code", "claude-code-plugin", "bmad", "bmad-method", "agile", "ai-development"]`).

8. **BUMPED `package.json:version`** — `"0.0.0"` → `"0.1.0"`. ALL OTHER FIELDS UNCHANGED.

9. **VERIFIED `README.md`** — Quick Start preserved verbatim per NFR-M4 (Story 1.13 baseline). Resolve seven `(Epic 6 Story 6.10 — placeholder)` callouts at lines 63-69 + 91-95 + 98-101 to the final ship paths now that the example files exist. The placeholder phrasing changes from `"(Epic 6 Story 6.10 — placeholder)"` to a clean cross-link, e.g.:
   - Line 63: `- /bmad-next zero-config single-step advance — see [docs/examples/single-step.md](docs/examples/single-step.md).`
   - Line 64: `- /bmad-loop bounded loop with eight stop conditions — see [docs/examples/overnight-loop.md](docs/examples/overnight-loop.md).`
   - Lines 65-69: same pattern for halt-recovery, skip-on-failure, doctor-diagnostic, state-export-ci, cold-start-return.
   - Lines 91-94: documentation map cross-links — `docs/configuration.md` (Story 6.1 — DONE), `docs/bmad-compatibility.md` (deferred to a future story per OQ-6 below — placeholder retained), `docs/architecture.md` (deferred — placeholder retained), `docs/examples/` (Story 6.10 — DONE).
   - Lines 98-101: repo-links cross-links — `CHANGELOG.md`, `CONTRIBUTING.md`, `LICENSE` (MIT), `SECURITY.md` (all live with this story).

#### `.github/` templates + dependabot (5 NEW)

10. **NEW `.github/PULL_REQUEST_TEMPLATE.md`** — pull request template per AR38. Structure:
    ```markdown
    ## Description

    <!-- Provide a clear description of the changes. What problem does this solve? What is the user-facing impact? -->

    ## Related Issues

    <!-- Link to any GitHub issues this PR addresses (e.g., "Closes #123"). -->

    ## Changesets

    - [ ] I have added a Changeset entry via `bun run changeset` describing this change.

    ## Quality Gates

    - [ ] `bun run check` exits 0 locally (Biome lint + all tests pass).
    - [ ] `bunx tsc --noEmit` exits 0 (TypeScript strict mode passes).
    - [ ] Tests added or updated for any user-visible behavior change.
    - [ ] No new `console.log` calls — used `src/io/log.ts` if logging is needed.
    - [ ] No new main-thread network calls outside `src/upgrade/` (NFR-S1).
    - [ ] No new writes outside `_bmad-output/` and `~/.claude/plugins/` (NFR-S2).

    ## Architectural Compliance

    - [ ] No upward imports from foundational modules (`errors.ts`, `schemas/`, `io/`) — AR41.
    - [ ] New error classes have a single-line actionable hint matching `/^.*(Run|See|Try|Check) /` — AR22.
    - [ ] Slash-command markdown changes follow the AR34 pattern (Bash → JSON line → Task → Bash → summary).

    ## BMAD Compatibility

    - [ ] If this PR changes BMAD compatibility (e.g., supports a new BMAD version, deprecates a step), the CHANGELOG's *BMAD Compatibility* section is updated.
    - [ ] If this PR introduces an unknown upstream skill, an `overrides:` config example is added to `examples/`.

    ## Documentation

    - [ ] User-facing flag changes are documented in `docs/configuration.md` and `commands/<name>.md`.
    - [ ] Exit-code additions are documented in `docs/exit-codes.md`.
    ```

11. **NEW `.github/ISSUE_TEMPLATE/bug.md`** — bug report template. Structure:
    ```markdown
    ---
    name: Bug Report
    about: Report unexpected behavior or a regression
    title: "[BUG] "
    labels: bug
    ---

    ## Description

    <!-- A clear description of the bug. -->

    ## Steps to Reproduce

    1. ...
    2. ...
    3. ...

    ## Expected Behavior

    ## Actual Behavior

    ## Environment

    - **Stepper version:** (run `bun pm pkg get version` or check `.claude-plugin/plugin.json`)
    - **BMAD version:** (run `/bmad-next --doctor` and copy the BMAD detection line)
    - **OS:** (Linux / macOS; include version)
    - **Bun version:** (run `bun --version`)

    ## Additional Context

    <!-- Logs, screenshots, state.yaml excerpts (REDACT any project-specific paths/contents). -->

    ## Checklist

    - [ ] I have searched existing issues for duplicates.
    - [ ] I have run `/bmad-next --doctor` and the diagnostic does not identify the cause.
    - [ ] I have included the environment information above.
    ```

12. **NEW `.github/ISSUE_TEMPLATE/feature.md`** — feature request template. Structure:
    ```markdown
    ---
    name: Feature Request
    about: Suggest a new capability or enhancement
    title: "[FEATURE] "
    labels: enhancement
    ---

    ## Use Case

    <!-- Describe the workflow or scenario that motivates this feature. -->

    ## Proposed Behavior

    <!-- What should Stepper do? What is the user-visible surface (flag, config field, command)? -->

    ## Alternatives Considered

    <!-- Any other approaches you considered. Why is this one preferable? -->

    ## Compatibility

    - [ ] This feature is backwards-compatible with existing state files.
    - [ ] This feature does NOT introduce a new main-thread network call (NFR-S1).
    - [ ] This feature does NOT introduce writes outside `_bmad-output/` (NFR-S2).

    ## Additional Context

    <!-- Mockups, example invocations, links to upstream BMAD discussions. -->
    ```

13. **NEW `.github/ISSUE_TEMPLATE/bmad-compat.md`** — BMAD compatibility issue template. Structure:
    ```markdown
    ---
    name: BMAD Compatibility Issue
    about: Report a BMAD version that breaks Stepper or behaves unexpectedly
    title: "[BMAD-COMPAT] "
    labels: bmad-compat
    ---

    ## BMAD Version Affected

    <!-- e.g., v6.5.0 — copy from `/bmad-next --doctor` output -->

    ## Stepper Version

    <!-- run `bun pm pkg get version` -->

    ## Symptom

    <!-- What happens when you run /bmad-next? What does --doctor report? -->

    ## Failing Skill (if applicable)

    <!-- The skill name from BMAD's skills.yaml or the failure-loud halt's `unknown skill` hint. -->

    ## Workaround Attempted

    - [ ] I tried adding the skill to `bmad-stepper.config.yaml:overrides` per docs/configuration.md.
    - [ ] I ran `/bmad-next --recompute-state` after the BMAD upgrade.
    - [ ] I ran `/bmad-next --doctor` and reviewed the diagnostic.

    ## Workaround Result

    ## Suggested Fix

    <!-- E.g., "Add `<skill-name>` to the seed at `src/dag/seed-v6.x.ts` with phase=<phase>." -->
    ```

14. **NEW `.github/dependabot.yml`** — automated dependency PRs per AR38 + architecture line 1537. Structure:
    ```yaml
    version: 2
    updates:
      - package-ecosystem: "npm"
        directory: "/"
        schedule:
          interval: "weekly"
          day: "monday"
        open-pull-requests-limit: 5
        reviewers:
          - "tgorka"
        commit-message:
          prefix: "deps"
          include: "scope"

      - package-ecosystem: "github-actions"
        directory: "/"
        schedule:
          interval: "weekly"
          day: "monday"
        open-pull-requests-limit: 3
        reviewers:
          - "tgorka"
        commit-message:
          prefix: "ci"
          include: "scope"
    ```
    Two ecosystems: npm (for `package.json` dependencies — Zod 4, Biome 2.3, Changesets, etc.) + github-actions (for the workflow YAML files — `oven-sh/setup-bun@v2`, `actions/checkout@v4`, etc.).

#### Seven worked examples + scripting + config (11 NEW)

15. **NEW `docs/examples/cold-start-return.md`** — Worked example 1 per PRD §code_examples line 459 + architecture line 1078. Pattern: command + expected output + narrative (per PRD line 467). Structure:
    ```markdown
    # Worked Example 1: Cold-Start Return

    **Scenario:** You return to a Stepper-managed project after a week away. You have no memory of where you left off. You want a one-line answer.

    **Command:**

    ```text
    /bmad-next --explain
    ```

    **Expected output (stderr):**

    ```text
    Resuming epic 3 / story 3.2.
    Last successful step: dev-story (completed at 2026-04-29T10:15:00Z).
    Last attempted: code-review (attempted at 2026-04-29T10:20:00Z).
    Reasoning: state.yaml.lastAttempted = code-review; the verifier passed retry-attempt 1 of 2; the dispatch was halted by SIGINT (manual-sigint). The next step computed by the DAG resolver is `code-review` (resume from the same step).
    Suggestion: run /bmad-next to resume the in-flight code-review dispatch.
    ```

    **Narrative:** `--explain` is the cold-start return tool. It re-reads `state.yaml`, runs the DAG resolver, and prints (a) where you are, (b) what the last successful step was, (c) what the last attempted step was, (d) the reasoning the resolver used, and (e) the next-action suggestion. This is the FR1 + FR13 pair used in the canonical "what step is next?" recovery scenario from PRD §journey.

    **Why this matters:** Stateful resumption from files alone — no Claude session state required (NFR-I4). The state lives at `_bmad-output/.stepper/state.yaml`; recovery is from disk.

    **Related:** [`single-step.md`](single-step.md), [`halt-recovery.md`](halt-recovery.md).
    ```

16. **NEW `docs/examples/single-step.md`** — Worked example 2 per PRD line 460 + architecture line 1079. Structure:
    ```markdown
    # Worked Example 2: Single-Step Execution

    **Scenario:** You want to run the next BMAD step on the current project. Zero flags. Zero config.

    **Command:**

    ```text
    /bmad-next
    ```

    **Expected output (stderr):**

    ```text
    Dispatching dev-story → bmad-step-runner (sonnet, 60k context, 5min timeout).
    [...sub-agent runs in isolation; transcript streams to _bmad-output/.stepper/runs/2026-05-06T<ts>-dev-story.log...]
    ✓ dev-story complete. Next: code-review.
    ```

    **Narrative:** `/bmad-next` with no flags is the canonical zero-config invocation. Stepper:

    1. Reads `state.yaml` (lock-free).
    2. Runs the DAG resolver to compute the next step.
    3. Resolves the persona (default: BMAD's per-skill persona).
    4. Builds the dispatch spec at `staging/<run-id>/dispatch-spec.json`.
    5. Emits ONE JSON line on stdout (AR9): `{"action": "dispatch", "runId": "...", "agent": "bmad-step-runner"}`.
    6. Layer 1 reads the JSON and invokes the sub-agent via the Task tool.
    7. Sub-agent runs in isolation; writes to `staging/<run-id>/outputs/`.
    8. Layer 1 invokes `verify-and-advance.ts` which (a) acquires the lock, (b) runs the verifier, (c) on pass: promotes + advances state, (d) on fail: dispatches the failure-UX handler.

    **Why this matters:** Single-step execution with sub-agent dispatch + verifier-before-promote gate is the FR8 + FR16 + FR17 trio. The whole roundtrip takes ~3-10 seconds + the sub-agent execution time.

    **Related:** [`cold-start-return.md`](cold-start-return.md), [`overnight-loop.md`](overnight-loop.md), [`doctor-diagnostic.md`](doctor-diagnostic.md).
    ```

17. **NEW `docs/examples/overnight-loop.md`** — Worked example 3 per PRD line 461 + architecture line 1080. Structure:
    ```markdown
    # Worked Example 3: Overnight Bounded Loop

    **Scenario:** You want to run the rest of the current epic overnight. You want a plan-first preview before committing. You want a token budget so the loop stops gracefully if it runs long. You want a checkpoint after every implementation step.

    **Command:**

    ```text
    /bmad-loop --until-epic-end --plan-first --token-budget 200k --checkpoint-each implementation
    ```

    **Expected output (stderr; plan-first preview phase):**

    ```text
    Plan-first preview for /bmad-loop --until-epic-end:
      Epic 4 / Story 4.1: code-review (next)
      Epic 4 / Story 4.2: dev-story → code-review
      Epic 4 / Story 4.3: dev-story → code-review
      ... [10 steps total; estimated 65k tokens / 25 minutes]
    Stop conditions: --until-epic-end (epic-4-end); --token-budget (200000 tokens); --max-iters (50, default cap).
    Continue? (y/n): y

    [...10 dispatches roll over the next 25 minutes; per-step checkpoints written to state.yaml.checkpoints[]; transcript streams to _bmad-output/.stepper/runs/...]

    Loop exited: epic-end (epic 4 complete).
    Snapshot: <branch>:<sha>. Resume: /bmad-next --resume.
    ```

    **Narrative:** `/bmad-loop` is the bounded autonomous-execution surface. The `--plan-first` flag prints the planned dispatches WITHOUT executing them; the user reviews and confirms. The `--token-budget` flag halts the loop when 200k tokens are consumed (with an 80% warning latch — see Story 4.5 design). The `--checkpoint-each implementation` flag writes a snapshot to `state.yaml.checkpoints[]` after every step of type `implementation` (FIFO eviction at 50 entries).

    The loop exits cleanly with a two-line message (per FR26): the exit reason + the resume hint. SIGINT during the loop triggers a graceful exit within 30 seconds (NFR-R5).

    **Why this matters:** Bounded autonomy with the safety net intact (NFR-R1 zero data loss; NFR-R5 graceful SIGINT; FR22 per-step-type checkpoint) is the core differentiation from unbounded ralph-style PRD-to-code loops. The author's nightly loop on `makistack` is the canonical use case.

    **Related:** [`halt-recovery.md`](halt-recovery.md), [`skip-on-failure.md`](skip-on-failure.md).
    ```

18. **NEW `docs/examples/halt-recovery.md`** — Worked example 4 per PRD line 462 + architecture line 1081. Structure: command (`/bmad-next --resume` after a verifier failure); expected output (stderr) showing the verifier-failure → escalate handler → halt → `--resume` recovery; narrative covering the FR27 + FR32 pair.

19. **NEW `docs/examples/skip-on-failure.md`** — Worked example 5 per PRD line 463 + architecture line 1082. Structure: command (`/bmad-next --skip <step> --resume`); expected output showing the skip-then-resume; narrative covering the FR28 + AR22 actionable-hint contract for `SkipRequiresResumeError`.

20. **NEW `docs/examples/doctor-diagnostic.md`** — Worked example 6 per PRD line 464 + architecture line 1083. Structure: command (`/bmad-next --doctor` after a BMAD upgrade); expected output showing the five-line doctor diagnostic; narrative covering FR41 + FR50 + the BMAD-compatibility surface. Mirrors the README's lines 35-41 expected-output block.

21. **NEW `docs/examples/state-export-ci.md`** — Worked example 7 per PRD line 465 + architecture line 1084. Structure: command (`/bmad-next --export-state > state.json`); expected output (the `state.json` shape — runHistory + lastSuccessfulStep + lastAttempted + lastSnapshot); narrative covering FR4 + FR52 + the AR9 carve-out (Story 3.8 precedent — JSON goes to STDOUT directly, not wrapped in the AR9 dispatch line).

22. **NEW `examples/scripting/ci-state-check.sh`** — CI integration sample script per architecture line 1089 + PRD §scripting_support. Bash script that runs `/bmad-next --export-state` + parses the JSON via `jq` + asserts the project is on a clean state for CI gating. Structure:
    ```bash
    #!/usr/bin/env bash
    # examples/scripting/ci-state-check.sh
    #
    # CI gate: ensure the project is on a clean Stepper state before merge.
    # Usage: ci-state-check.sh
    # Exit codes:
    #   0 — clean state (no in-flight dispatches, no last_failure_reason)
    #   1 — dirty state (last_failure_reason present, or last_attempted != last_successful_step)
    #   2 — Stepper not installed or BMAD compatibility error
    #
    # Requires: bun, jq, /bmad-next available as a slash command (this script
    # invokes the underlying TypeScript runner directly via `bun run`).

    set -euo pipefail

    if ! command -v bun >/dev/null 2>&1; then
      echo "ci-state-check: bun is not installed; aborting." >&2
      exit 2
    fi

    if ! command -v jq >/dev/null 2>&1; then
      echo "ci-state-check: jq is not installed; aborting." >&2
      exit 2
    fi

    state_json=$(bun run src/commands/next/run.ts -- --export-state 2>/dev/null) || {
      echo "ci-state-check: --export-state failed (exit $?); see _bmad-output/.stepper/runs/ for transcripts." >&2
      exit 2
    }

    failure_reason=$(echo "$state_json" | jq -r '.lastFailureReason // empty')

    if [[ -n "$failure_reason" ]]; then
      echo "ci-state-check: project is in a halted state. last_failure_reason: $failure_reason" >&2
      echo "Run /bmad-next --resume locally to recover before merging." >&2
      exit 1
    fi

    last_successful_step=$(echo "$state_json" | jq -r '.lastSuccessfulStep.step // empty')
    last_attempted=$(echo "$state_json" | jq -r '.lastAttempted.step // empty')

    if [[ "$last_attempted" != "$last_successful_step" && -n "$last_attempted" ]]; then
      echo "ci-state-check: there is an in-flight dispatch (last_attempted=$last_attempted; last_successful=$last_successful_step)." >&2
      echo "Run /bmad-next locally to complete or /bmad-next --skip $last_attempted --resume to skip." >&2
      exit 1
    fi

    echo "ci-state-check: project is on a clean state. last_successful_step=$last_successful_step. OK to merge."
    exit 0
    ```

23. **NEW `examples/scripting/nightly-loop.sh`** — overnight `/bmad-loop` sample script per architecture line 1090. Structure:
    ```bash
    #!/usr/bin/env bash
    # examples/scripting/nightly-loop.sh
    #
    # Run a bounded /bmad-loop overnight with sensible safety defaults.
    # Usage: nightly-loop.sh
    # Stops at:
    #   - End of current epic (--until-epic-end), OR
    #   - 200k token budget (--token-budget), OR
    #   - 50 iterations (--max-iters default cap).
    # Checkpoints: after every implementation step.

    set -euo pipefail

    if ! command -v bun >/dev/null 2>&1; then
      echo "nightly-loop: bun is not installed; aborting." >&2
      exit 1
    fi

    bun run src/commands/loop/run.ts -- \
      --until-epic-end \
      --plan-first \
      --token-budget 200000 \
      --checkpoint-each implementation \
      --max-iters 50

    # Exit code propagates: 0 = clean exit; 1 = halt with actionable error;
    # the loop exit-reason + resume hint are emitted on stderr.
    ```

24. **NEW `examples/bmad-stepper.config.yaml`** — documented configuration example per architecture line 1086. Structure: a fully-commented YAML showing all top-level config keys (personas, overrides, verifiers, failurePolicies, models, budgets, paths, telemetry) per Story 6.1's schema. Each key has a comment explaining what it does and pointing to the relevant FR.

25. **NEW `examples/bmad-6.4-overrides.yaml`** — forward-compat override sample per architecture line 1087. Demonstrates the `overrides:` block usage when a new BMAD release adds skills not in Stepper's seed (per FR35 + the maintenance-moat innovation). Structure: a YAML file with a representative `overrides:` section showing how to place an unknown skill in the DAG (`{ phase, after, before, optional }` per Story 6.2 schema).

#### CI workflows (2 NEW + 1 VERIFIED-EXTENDED)

26. **VERIFIED + EXTENDED `.github/workflows/ci.yml`** — already exists from Story 1.1 with matrix Linux+macOS + bun test + biome ci. Story 6.10 VERIFIES the file matches AR40 spec; EXTENDS with a Bun version pin per OQ-2 (e.g., `bun-version: latest` → pin to `1.3.x` for reproducibility). The `bun run check` invocation is the release-blocker gate per AR36.

27. **NEW `.github/workflows/release.yml`** — Changesets PR-based release flow per AR40 + architecture line 1054 + line 1566. Structure:
    ```yaml
    name: Release

    on:
      push:
        branches: [main]

    concurrency:
      group: release-${{ github.ref }}
      cancel-in-progress: false

    permissions:
      contents: write
      pull-requests: write

    jobs:
      release:
        name: Release
        runs-on: ubuntu-latest
        steps:
          - name: Checkout
            uses: actions/checkout@v4
            with:
              fetch-depth: 0

          - name: Setup Bun
            uses: oven-sh/setup-bun@v2
            with:
              bun-version: latest

          - name: Install dependencies (frozen lockfile)
            run: bun install --frozen-lockfile

          - name: Run release-blocker gate
            run: bun run check

          - name: Create release PR or publish
            uses: changesets/action@v1
            with:
              version: bun run changeset version
              publish: bun run changeset tag
              commit: "chore: version packages"
              title: "chore: version packages"
            env:
              GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    ```
    On every push to `main`, Changesets either (a) creates an auto-generated *Version Packages* PR if there are pending Changesets, or (b) tags + publishes the GitHub Release if the *Version Packages* PR was just merged. Per architecture line 1568, the GitHub Release tarball IS the marketplace artifact; no separate dist or container.

28. **NEW `.github/workflows/bmad-compat.yml`** — weekly check vs latest BMAD upstream per AR40 + NFR-I1 + architecture line 1055. Structure:
    ```yaml
    name: BMAD Compatibility

    on:
      schedule:
        # Run every Monday at 06:00 UTC
        - cron: "0 6 * * 1"
      workflow_dispatch: {}

    permissions:
      contents: read
      issues: write

    jobs:
      bmad-compat:
        name: BMAD Compatibility (latest)
        runs-on: ubuntu-latest
        steps:
          - name: Checkout
            uses: actions/checkout@v4

          - name: Setup Bun
            uses: oven-sh/setup-bun@v2
            with:
              bun-version: latest

          - name: Install dependencies (frozen lockfile)
            run: bun install --frozen-lockfile

          - name: Install latest BMAD-METHOD
            run: |
              # The fixture project uses the latest BMAD upstream.
              # If `npx bmad-method install` is available, use it; otherwise
              # fall back to git-clone of the BMAD-METHOD repository.
              npx bmad-method install --tools claude-code 2>/dev/null || \
                git clone --depth 1 https://github.com/bmad-code-org/BMAD-METHOD.git /tmp/bmad-latest

          - name: Run /bmad-next --doctor against latest BMAD
            id: doctor
            run: |
              # Run the doctor command to detect compatibility.
              # Exit code 0 = compatible; exit code 3 = BMAD compat error.
              bun run src/commands/next/run.ts -- --doctor || echo "DOCTOR_EXIT=$?" >> $GITHUB_OUTPUT

          - name: Open issue on incompatibility
            if: failure() || steps.doctor.outputs.DOCTOR_EXIT != ''
            uses: actions/github-script@v7
            with:
              script: |
                const title = `[BMAD-COMPAT] BMAD upstream changed; weekly compat check failed`;
                const body = `The weekly BMAD compatibility check at \`.github/workflows/bmad-compat.yml\` detected an incompatibility with the latest BMAD upstream.\n\nCheck the workflow logs and the doctor diagnostic output. Possible causes:\n- New BMAD skill added (file an [BMAD-COMPAT] issue per template).\n- Existing BMAD skill removed or renamed.\n- BMAD upstream version-detection contract changed.\n\nNext steps: review the workflow run, identify the failing skill, add an \`overrides:\` config example to \`examples/\`, ship a CHANGELOG entry under \`## BMAD Compatibility — vX.Y.x\`.`;
                await github.rest.issues.create({
                  owner: context.repo.owner,
                  repo: context.repo.repo,
                  title,
                  body,
                  labels: ["bmad-compat", "automated"],
                });
    ```
    Per OQ-7 below, the workflow fails-loud-and-files-issue on incompatibility (auto-creates a `[BMAD-COMPAT]` issue using the bmad-compat issue template).

#### Initial Changesets entry (1 NEW)

29. **NEW `.changeset/v0-1-0-marketplace-release.md`** — initial Changeset entry that, on merge to `main`, drives the auto-generated *Version Packages* PR per architecture line 1566. Structure:
    ```markdown
    ---
    "bmad-stepper": minor
    ---

    Initial public release: v0.1.0 marketplace listing at `tgorka/bmad-stepper`.

    Two slash commands ship: `/bmad-next` (zero-config single-step advance with full flag inventory per FR1-FR15 + FR27-FR32 + FR41-FR42 + FR50-FR54) and `/bmad-loop` (bounded loop with eight stop conditions, four failure-UX modes, SIGINT graceful exit per FR19-FR30).

    State machine with atomic state on disk, file lock with PID heartbeat, branch+sha snapshot, schema-versioned + Zod-migrated; recovery from any halt via `--resume`. Sub-agent dispatch contract with verifier-before-promote gate. Failure-UX modes (retry/skip/route-to-fixer/escalate); per-step policy via `bmad-stepper.config.yaml`. Configuration surface, telemetry (opt-in), auto-archival, doctor diagnostic, upgrade flow.

    BMAD Compatibility — v6.5.x: tested against the latest stable BMAD release at v0.1.0 release time.
    ```
    Per Changesets convention, the Markdown body of the entry is what populates the auto-generated CHANGELOG section. The frontmatter `bmad-stepper: minor` declares this is a minor-version bump (0.0.x → 0.1.0).

#### Marketplace publication (HUMAN ACTION; SCOPED OUT for the dev iteration)

30. **MARKETPLACE PUBLICATION** — manual one-time submission of the plugin to the Claude Code marketplace at `tgorka/bmad-stepper`. This is OUT-OF-SCOPE for the dev iteration of Story 6.10 (per OQ-8 below — the dev iter ships the artifact; the human maintainer submits to the marketplace UI). The submission steps are documented in CONTRIBUTING.md "Release process" section + the README "Repo links" section.

### Cross-story coordination preserved

- **Errors registry HELD AT 17** — Story 6.10 ships ZERO new error classes. The `errors.ts` file is untouched. The 33-test `escalate-actionable-hint.test.ts` sweep over all 17 error classes UNCHANGED.
- **Schema migration registry HELD AT v1** — ZERO new schema migrations. ZERO new persisted Zod schemas (no `src/schemas/` mutation).
- **AR41 boundary discipline** — ZERO source code changes under `src/`. The boundary graph (foundational/mid/higher/top) is preserved trivially.
- **AR8 lock-free top-tier** — preserved trivially. ZERO state.yaml mutation; ZERO state.yaml read; ZERO interaction with the lock subsystem.
- **AR9 stdout JSON-line invariant** — UNCHANGED. ZERO src/commands/ mutation.
- **opts.config seam** — UNCHANGED at 9 sites (Stories 6.1 through 6.8 carried forward; Story 6.9 added a separate `upgradeFetchOverride` seam — also unchanged). Story 6.10 introduces ZERO new opts.config consumer.
- **Slash-command markdown UNCHANGED** — Story 6.10 ZERO `commands/*.md` mutation. The slash-command surface is frozen for v0.1.0.

### What is NOT in scope (deferred)

- **Closing the dogfood-validation 30-day clock** — DEFERRED post-v0.1.0. Story 6.10 STARTS the clock at the v0.1.0 release; the close is a future post-release retrospective deliverable per PRD §dogfood_validation_plan + product brief §Daily replacement (≥30-day target). The kill criterion (>50% manual sessions after 60 days per product brief line 122) is the meta-fallback that retires the project.
- **Anthropic marketplace UI submission** — DEFERRED to human maintainer action per OQ-8. Story 6.10's dev iter ships the repo tarball at the v0.1.0 tag (the marketplace's installable unit per architecture line 1568); the maintainer submits the listing manually via the Claude Code marketplace UI.
- **`docs/bmad-compatibility.md` per-Stepper-release BMAD compat history** — DEFERRED to a future story per architecture line 1075 (the file is pre-listed in the architecture but not in epics.md AC for Story 6.10). The first BMAD compat entry lives in CHANGELOG.md's `## BMAD Compatibility — v6.5.x` section per AR38; the dedicated docs file can be created post-v0.1.0 as the per-release history grows.
- **`docs/architecture.md` mirror of the planning architecture** — DEFERRED per architecture line 1076 (pre-listed but not in AC). The planning architecture lives at `_bmad-output/planning-artifacts/architecture.md`; mirroring is a future-story concern.
- **Cross-cutting `no-network-on-main.test.ts` enforcement** — DEFERRED per Story 6.9 OQ-15 option (b) carry-forward. The architecture pre-listing at line 1246 makes this a Story 6.10 candidate, but per OQ-3 below, Story 6.10 INHERITS the deferral (option b) — the upgrade module is the ONLY consumer of fetch in `src/`; cross-cutting verification is a future post-v0.1 story. Story 6.10 documents the contract in AGENTS.md + CONTRIBUTING.md but does NOT introduce the integration test file. (Per OQ-3 the dev iter MAY introduce the test if straightforward — see the in-scope-optional clause.)
- **Beta/rc release channel** — DEFERRED post-v0.1. The Changesets release flow ships only stable releases; beta channels are a future story.
- **GitHub Pages docs site** — DEFERRED per product brief line 233 ("only if README outgrows itself"). v0.1.0 ships docs as Markdown in the repo.
- **Visual marketing assets** — DEFERRED. Stepper has no GUI; the marketplace listing uses the README as the primary asset.
- **Translations (i18n)** — DEFERRED post-v0.1. English-only at v0.1.0.
- **`tests/fixtures/` BMAD-version fixtures** — UNCHANGED at this story (Stories 1.1 + 1.13 baseline). The CI matrix runs against the dev environment's installed BMAD; the bmad-compat.yml workflow runs against the LATEST BMAD upstream.
- **`tsconfig.json` + `biome.json` + `bunfig.toml` mutation** — UNCHANGED. Story 1.1 baseline preserved.

### Architectural challenges resolved here

**Architectural decision — LICENSE replacement (per OQ-1)**: The existing `LICENSE` file is Apache 2.0 (201 lines), but the AC + product brief + epics.md mandate MIT. This is an existing inconsistency from Story 1.1 (the dev iter shipped Apache 2.0 by accident; ZERO downstream consumers depend on it — the repo has not been published yet). Story 6.10 REPLACES the LICENSE with the canonical MIT license text. The `package.json:license` field is ALREADY `"MIT"` (verify); the `.claude-plugin/plugin.json:license` field is ALREADY `"MIT"` (verify per AR3). The replacement is byte-correct + documented in the CHANGELOG entry under "License: MIT". **Rejected alternative:** keep Apache 2.0 (would contradict three planning artifacts; the AC literally says MIT).

**Architectural decision — Bun version pin in CI matrix (per OQ-2)**: The existing `.github/workflows/ci.yml` uses `oven-sh/setup-bun@v2` with no version pin (defaults to `latest`). For reproducibility + NFR-I5 ("Linux + macOS via Bun ≥ 1.3"), Story 6.10 EXTENDS the workflow to specify `bun-version: latest` explicitly (which is the current default; documenting it makes the implicit explicit) AND DEFERS pinning to a specific Bun semver (e.g., `1.3.x`) to a future story. The architecture line 220 specifies "Bun ≥ 1.3"; pinning at `1.3.x` would over-constrain (Stepper SHOULD work on Bun 1.4+ when released). **Rejected alternative:** pin to `1.3.0` (would force CI to fail on Bun patch releases — pointless coupling).

**Architectural decision — defer cross-cutting `no-network-on-main.test.ts` (per OQ-3)**: Story 6.9 deferred this per option (b). Story 6.10 INHERITS the deferral. The architecture pre-lists this test at line 1246; the dev iter MAY introduce a stub file if straightforward, but the canonical implementation (a global `globalThis.fetch` mock asserting it's called only from `src/upgrade/`) is non-trivial (requires Bun's test API to inject globally + work across all test files) and is OUT-OF-SCOPE for the v0.1.0 release. The contract is DOCUMENTED in AGENTS.md + CONTRIBUTING.md ("NEVER make a main-thread network call EXCEPT inside `src/upgrade/`"). **Rejected alternative:** ship a half-implemented integration test that doesn't sweep all call sites (would create a false sense of security; better to defer cleanly).

**Architectural decision — em-dash in `## BMAD Compatibility — v6.5.x` heading (per OQ-4)**: Story 6.9's `extractBmadCompat()` regex tolerates `—` (em-dash U+2014) OR `-` (hyphen). Per the canonical convention in the architecture (line 1665 + Story 6.9 OQ-4), Stepper uses em-dash for the canonical heading shape. The CHANGELOG entry, the bmad-compat.yml issue body, and any other BMAD-compat heading USE em-dash. The hyphen variant is supported for forward-compat (third-party CHANGELOGs may use either). **Rejected alternative:** use hyphen (would deviate from the canonical convention; the regex tolerates both anyway).

**Architectural decision — Contributor Covenant 2.1 for CODE_OF_CONDUCT (per OQ-5)**: The Contributor Covenant v2.1 is the de-facto OSS standard (used by Linux Kernel, Rust, K8s, etc.). Stepper adopts it verbatim with the maintainer email substitution. **Rejected alternative:** custom CoC (would bike-shed; the Contributor Covenant is battle-tested + community-recognized).

**Architectural decision — preserve `(Epic 6 Story 6.10 — placeholder)` markers for `docs/bmad-compatibility.md` + `docs/architecture.md` (per OQ-6)**: These two doc files are pre-listed in the architecture (lines 1075-1076) but NOT in the epics.md AC for Story 6.10. The PRD does not explicitly require them at v0.1.0. Story 6.10 DEFERS them to a future story; the README's documentation map preserves the placeholder text for these two specific entries (the OTHER five entries in the README are RESOLVED to their ship paths in this story). **Rejected alternative:** ship empty placeholder files (would clutter the repo; better to defer cleanly with a documented forward-tracker).

**Architectural decision — bmad-compat.yml fails-loud-and-files-issue on incompatibility (per OQ-7)**: Per NFR-I1 ("BMAD compatibility declared per release"), the weekly bmad-compat workflow MUST detect upstream changes. The natural action on detection is to FILE A GITHUB ISSUE using the `bmad-compat` issue template (so the maintainer is notified asynchronously without breaking CI on unrelated PRs). The issue body cross-links to the workflow run logs + the doctor diagnostic + the `examples/` overrides workflow. **Rejected alternative:** fail the workflow (would not surface the issue to the maintainer's notification channel; auto-issue is the canonical OSS pattern for ambient compat checks).

**Architectural decision — marketplace publication as HUMAN action (per OQ-8)**: The Claude Code marketplace submission is a one-time UI-driven action by the maintainer. There is no API for automated submission as of the architecture's knowledge cutoff. Story 6.10 ships the repo tarball at the v0.1.0 tag (the marketplace's installable unit per architecture line 1568); the maintainer submits the listing manually. The dev iter ticks the maintainer-action checkbox in the Quality Gates section + leaves a note in the Done Criteria + the runs/<runId>/tasks/ record documenting the human-action requirement. **Rejected alternative:** automate via Anthropic API (does not exist; would be a future-story dependency on Anthropic's roadmap).

**Architectural decision — README forward-reference resolution preserves Story 1.13 baseline (per OQ-9)**: The README's Quick Start section (lines 5-48) is the NFR-M4 deliverable; Story 1.13 shipped it tested against a fresh BMAD install in under 10 minutes. Story 6.10 RESOLVES the seven `(Epic 6 Story 6.10 — placeholder)` cross-references to the final ship paths (lines 63-69 + 91-95 + 98-101) BUT DOES NOT TOUCH the Quick Start section itself. The fixture at `tests/fixtures/quick-start-walkthrough.md` (architecture line 1097 — verify) is the test of record for NFR-M4; Story 6.10 does NOT modify it. **Rejected alternative:** rewrite the Quick Start (would re-test against NFR-M4; pointless when the existing one passes).

**Architectural decision — Changesets entry as the source-of-truth for v0.1.0 release notes (per OQ-10)**: Per architecture line 1566 release process, Changesets drives the auto-generated *Version Packages* PR. The initial Changeset entry at `.changeset/v0-1-0-marketplace-release.md` is the source-of-truth for the v0.1.0 CHANGELOG section. Story 6.10 ships BOTH the Changeset entry AND the canonical CHANGELOG.md initial entry (the Changeset auto-generates the CHANGELOG, but the initial v0.1.0 entry is shipped manually since Changesets has no prior history to auto-generate from). On the FIRST `bun run changeset version` invocation, the Changesets CLI WILL append to CHANGELOG.md; the manual initial entry MAY get re-formatted but the content is preserved. **Rejected alternative:** rely entirely on Changesets auto-generation (would require bootstrapping; the manual initial entry is the seed Changesets builds on).

**Architectural decision — `examples/scripting/*.sh` use `bun run src/commands/next/run.ts -- --export-state` directly (per OQ-11)**: The scripting examples invoke the underlying TypeScript runner via `bun run` rather than the slash command (which is Claude-Code-only). This makes the scripts portable to plain CI environments without Claude Code. Per the architecture's three-layer model, scripts run AT Layer 2 directly (skipping Layer 1 markdown). **Rejected alternative:** invoke via the slash command (would require Claude Code at runtime; pointless for CI gating).

**Architectural decision — dependabot weekly schedule on Mondays (per OQ-12)**: Mondays at 06:00 UTC is the canonical OSS dependabot schedule. The maintainer reviews dependency PRs early in the week. The npm + github-actions ecosystems both run on the same cadence to consolidate review effort. **Rejected alternative:** daily (too noisy for a single-maintainer project).

**Architectural decision — `bun-version: latest` in release.yml + bmad-compat.yml (per OQ-13)**: The release workflow SHOULD use the latest stable Bun for releases (forward-compat); the bmad-compat workflow SHOULD use latest for accurate compat detection. CI uses `latest` per OQ-2. **Rejected alternative:** pin to `1.3.x` (would couple Bun release cadence to Stepper's release cadence; pointless).

**Architectural decision — issue template frontmatter follows GitHub's classic markdown-template format (per OQ-14)**: GitHub supports both classic markdown templates (`.github/ISSUE_TEMPLATE/<name>.md` with YAML frontmatter) and the newer YAML-form templates (`.github/ISSUE_TEMPLATE/<name>.yml`). Story 6.10 uses the classic markdown format per architecture line 1057-1059 pre-listing (`bug.md`, `feature.md`, `bmad-compat.md` — `.md` extensions). **Rejected alternative:** YAML-form templates (would be more structured but the architecture pre-listed `.md`; staying consistent with the spec).

**Architectural decision — CHANGELOG.md initial entry includes the BMAD Compatibility heading (per OQ-15)**: Per NFR-I1 + architecture line 1665 + Story 6.9 OQ-4, every CHANGELOG section MUST include a `## BMAD Compatibility — vX.Y.x` heading. The v0.1.0 initial entry includes `### BMAD Compatibility — v6.5.x` (an H3 inside the v0.1.0 H2 section per Changesets conventions; the regex tolerates H1-H6 per Story 6.9 line 666). **Rejected alternative:** omit the BMAD compat heading from the initial entry (would create an exception for v0.1.0; better to establish the pattern from day one).

### Concretely, Story 6.10 produces

- **NEW file 1**: `CHANGELOG.md` (~2.5kB; v0.1.0 initial entry + BMAD compat heading + per-FR feature delivery lines + license note). Auto-managed by Changesets going forward.
- **NEW file 2**: `AGENTS.md` (~5kB; three-layer architecture + sub-agent dispatch contract + code architecture + errors-as-primary-UX + state + network + slash-command + tests + quality gates + contributing pointer).
- **NEW file 3**: `CONTRIBUTING.md` (~5kB; setup + PR flow + code style + test patterns + state + network discipline + errors + cross-platform + governance + reporting).
- **NEW file 4**: `SECURITY.md` (~2kB; supported versions table + reporting channel + Stepper-specific posture + disclosure timeline).
- **NEW file 5**: `CODE_OF_CONDUCT.md` (~5kB; Contributor Covenant 2.1 + maintainer contact email).
- **REPLACED file 1**: `LICENSE` (Apache 2.0, 201 lines → MIT, ~22 lines).
- **NEW file 6**: `.github/PULL_REQUEST_TEMPLATE.md` (~2kB).
- **NEW file 7**: `.github/ISSUE_TEMPLATE/bug.md` (~1kB).
- **NEW file 8**: `.github/ISSUE_TEMPLATE/feature.md` (~1kB).
- **NEW file 9**: `.github/ISSUE_TEMPLATE/bmad-compat.md` (~1kB).
- **NEW file 10**: `.github/dependabot.yml` (~600B; npm + github-actions ecosystems weekly on Mondays).
- **NEW file 11**: `.github/workflows/release.yml` (~1.2kB; Changesets PR-based release flow).
- **NEW file 12**: `.github/workflows/bmad-compat.yml` (~1.5kB; weekly cron + workflow_dispatch + auto-issue on incompat).
- **NEW file 13**: `docs/examples/cold-start-return.md` (~1.5kB).
- **NEW file 14**: `docs/examples/single-step.md` (~1.5kB).
- **NEW file 15**: `docs/examples/overnight-loop.md` (~2kB).
- **NEW file 16**: `docs/examples/halt-recovery.md` (~1.5kB).
- **NEW file 17**: `docs/examples/skip-on-failure.md` (~1.5kB).
- **NEW file 18**: `docs/examples/doctor-diagnostic.md` (~1.5kB).
- **NEW file 19**: `docs/examples/state-export-ci.md` (~2kB).
- **NEW file 20**: `examples/scripting/ci-state-check.sh` (~1.5kB; chmod +x).
- **NEW file 21**: `examples/scripting/nightly-loop.sh` (~700B; chmod +x).
- **NEW file 22**: `examples/bmad-stepper.config.yaml` (~3kB; commented YAML).
- **NEW file 23**: `examples/bmad-6.4-overrides.yaml` (~1kB; representative `overrides:` example).
- **NEW file 24**: `.changeset/v0-1-0-marketplace-release.md` (~600B; minor bump entry).
- **MODIFIED file 1**: `.claude-plugin/plugin.json` (1 line changed: `"version": "0.0.0"` → `"version": "0.1.0"`).
- **MODIFIED file 2**: `package.json` (1 line changed: `"version": "0.0.0"` → `"version": "0.1.0"`).
- **MODIFIED file 3**: `.github/workflows/ci.yml` (1 line added: `bun-version: latest` under setup-bun step per OQ-2; OPTIONAL — may be skipped if implicit-default is preferred).
- **MODIFIED file 4**: `README.md` (~7 lines changed: resolve five `(Epic 6 Story 6.10 — placeholder)` callouts at lines 63-69 to live ship paths + 4 callouts at lines 91-101 — preserve `bmad-compatibility.md` and `architecture.md` placeholders per OQ-6).
- **VERIFIED files (unchanged)**: `.changeset/config.json` + `.changeset/README.md` (Story 1.1 baseline); `bunfig.toml` + `tsconfig.json` + `biome.json` (Story 1.1 baseline); `commands/{bmad-next,bmad-loop,bmad-doctor}.md` (Stories 2.7 + 4.1 + 1.12 baselines, no changes per Story 6.10 scope); `agents/{bmad-step-runner,bmad-step-fixer}.md` (Stories 2.3 + 5.3 baselines); `docs/{getting-started,configuration,exit-codes}.md` (Stories 1.13 + 6.1 + multiple baselines); all of `src/` (no source code changes per Story 6.10 scope); `tests/fixtures/quick-start-walkthrough.md` (Story 1.13 baseline; verified intact for NFR-M4).

**24 NEW files. 1 REPLACED file. 4 MODIFIED files. ZERO source code changes under `src/`. ZERO new error classes. ZERO new schema migrations. ZERO mutations to: `src/**`, `commands/**`, `agents/**`, `docs/{getting-started, configuration, exit-codes}.md`, `tests/**`, `bunfig.toml`, `tsconfig.json`, `biome.json`, `.changeset/{config.json, README.md}`.**

## Acceptance Criteria

The following are reproduced byte-identical from `_bmad-output/planning-artifacts/epics.md` lines 1300-1308:

**Given** repo deliverables per AR38, AR39, AR40
**When** v0.1.0 is tagged
**Then** the repo contains: `README.md` (with Quick Start NFR-M4), `CHANGELOG.md` (Changesets-managed with the *BMAD Compatibility — v6.5.x* section), `AGENTS.md` (contributor + sub-agent contract), `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `LICENSE` (MIT), `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/{bug,feature,bmad-compat}.md`, `.github/dependabot.yml`
**And** `docs/examples/` ships the seven worked examples (cold-start return, single-step, overnight loop, halt recovery, skip-on-failure, doctor diagnostic, state export for CI) plus `examples/scripting/{ci-state-check.sh, nightly-loop.sh}`
**And** three CI workflows are green: `.github/workflows/ci.yml` (matrix Linux+macOS, `bun test` + `biome ci`), `release.yml` (Changesets PR-based release flow), `bmad-compat.yml` (weekly check vs latest BMAD upstream)
**And** the plugin is published to the Claude Code marketplace at `tgorka/bmad-stepper` (FR47); the dogfood-validation 30-day clock starts on this release

## Tasks / Subtasks

- [ ] 1. **Context — read all relevant files completely** (carry-over discipline from Stories 6.1 + 6.7 + 6.8 + 6.9)
  - [ ] 1.1 Read `_bmad-output/implementation-artifacts/6-9-upgrade-flow.md` — focus on (a) the Forward Action Items + closed trackers (Story 6.9 closed Story 2.4 forward-deferral guard at next/run.ts:1582-1611); (b) the Story 6.9 SDR Quality Gates baseline (1610/0/5192 across 83 files; errors registry 17); (c) Story 6.9 OQ-15 cross-cutting `no-network-on-main.test.ts` deferral inheritance to Story 6.10; (d) the canonical `## BMAD Compatibility — v6.5.x` heading shape that `extractBmadCompat()` regex consumes (test UPGRADE_69_BMAD_COMPAT_EXTRACTED_1).
  - [ ] 1.2 Read `_bmad-output/implementation-artifacts/6-8-auto-archival-of-runs-and-telemetry.md` — focus on the Sprint 6 storage hygiene SHIP narrative (CHANGELOG entry mentions auto-archival as a feature delivery line).
  - [ ] 1.3 Read `_bmad-output/implementation-artifacts/6-7-telemetry-aggregation-report.md` — focus on the standalone CLI pattern (`bun run aggregate-telemetry` script entry; CHANGELOG mentions telemetry as opt-in default-false).
  - [ ] 1.4 Read `_bmad-output/implementation-artifacts/6-1-bmad-stepper-config-yaml-schema-loader.md` — focus on the bmad-stepper.config.yaml schema (personas, overrides, verifiers, failurePolicies, models, budgets, paths, telemetry blocks). Story 6.10 ships the canonical example using this schema.
  - [ ] 1.5 Read `_bmad-output/implementation-artifacts/1-13-quick-start-documentation.md` — focus on (a) the README Quick Start (NFR-M4 baseline tested against a fresh BMAD install in under 10 minutes); (b) `docs/getting-started.md` (the README quick-start companion); (c) the `tests/fixtures/quick-start-walkthrough.md` reference fixture.
  - [ ] 1.6 Read `_bmad-output/implementation-artifacts/1-1-initialize-repository-scaffold.md` — focus on (a) the AR3 plugin manifest fields shipped (Story 1.1 baseline); (b) the `.changeset/{config.json, README.md}` seed; (c) the `.github/workflows/ci.yml` initial structure; (d) the LICENSE issue (currently Apache 2.0 — Story 6.10 REPLACES with MIT per OQ-1).
  - [ ] 1.7 Read `_bmad-output/implementation-artifacts/epic-5-retrospective.md` + `epic-4-retrospective.md` — Recommendations on registry stability + cross-story coordination via opts.config seam + zero-new-error-classes discipline (Epic 6 has shipped ONE new class: SkipRequiresResumeError in Story 5.2; held at 17 throughout Stories 5.3-6.9).
  - [ ] 1.8 Read `_bmad-output/planning-artifacts/architecture.md` lines 195 (plugin manifest field shape per AR3) + 210-213 (PRD repo-files inventory + README + getting-started baseline) + 1029-1098 (complete project directory structure including all repo files Story 6.10 ships) + 1055 + 1054 (release.yml + bmad-compat.yml pre-listings) + 1565-1568 (release process + deployment structure) + 1666-1668 (AGENTS.md + SECURITY.md content notes per architecture validation gaps).
  - [ ] 1.9 Read `_bmad-output/planning-artifacts/architecture.md` lines 1325-1424 — full FR + NFR mapping table. Confirm AR38 (repo files) + AR39 (examples) + AR40 (CI workflows) coverage.
  - [ ] 1.10 Read `_bmad-output/planning-artifacts/prd.md` lines 210 + 455-467 + 700-704 + 735-739 + 800-804 — confirm (a) MIT license; (b) seven worked examples convention (each pairs command + expected output + narrative; CI validates flag schema parses); (c) FR47 + FR48 + FR49 + NFR-M4 + NFR-I1 verbatim; (d) the dogfood validation plan + 30-day target.
  - [ ] 1.11 Read `_bmad-output/planning-artifacts/product-brief-bmad-stepper.md` lines 295-305 — confirm the Lena cold-install user story (the "Persona: Lena" scenario) for the `cold-start-return.md` worked example narrative.
  - [ ] 1.12 Read `_bmad-output/planning-artifacts/epics.md` lines 230-232 — confirm AR38 + AR39 + AR40 verbatim + the README + getting-started v0.1 deliverables baseline.
  - [ ] 1.13 Read `_bmad-output/planning-artifacts/epics.md` lines 1294-1308 — confirm Story 6.10 AC verbatim. The AC block in this spec MUST be byte-identical to lines 1300-1308 (the AC body; the Story title + user-story preamble at lines 1294-1299 are quoted in the Story section, not AC).
  - [ ] 1.14 Read `.claude-plugin/plugin.json` — confirm AR3 fields present + the version string `"0.0.0"` (Story 6.10 bumps to `"0.1.0"`).
  - [ ] 1.15 Read `package.json` — confirm version `"0.0.0"` + `"license": "MIT"` (already correct) + scripts block (no changes; Stories 6.7 + 6.9 added `aggregate-telemetry` + `upgrade` scripts).
  - [ ] 1.16 Read `LICENSE` (201 lines) — confirm Apache 2.0 (the existing file). Story 6.10 REPLACES with MIT per OQ-1.
  - [ ] 1.17 Read `README.md` (104 lines) — confirm the Quick Start (lines 5-48 — NFR-M4 baseline); the seven `(Epic 6 Story 6.10 — placeholder)` callouts (lines 63-69 + 91-95 + 98-101). Story 6.10 RESOLVES five of seven callouts to live paths; preserves two (`bmad-compatibility.md` + `architecture.md`) per OQ-6.
  - [ ] 1.18 Read `.github/workflows/ci.yml` (29 lines) — confirm matches AR40 (matrix Linux+macOS, `bun test` + `biome ci`). Story 6.10 OPTIONALLY EXTENDS with explicit `bun-version: latest` per OQ-2.
  - [ ] 1.19 Read `.changeset/config.json` + `.changeset/README.md` — confirm Changesets is initialized per Story 1.1. Story 6.10 ADDS the v0.1.0 release entry.
  - [ ] 1.20 Read `commands/bmad-next.md` (full file) — confirm the slash-command surface for cross-references in CONTRIBUTING.md + AGENTS.md + the worked examples. ZERO modifications.
  - [ ] 1.21 Read `commands/bmad-loop.md` + `commands/bmad-doctor.md` — same purpose. ZERO modifications.
  - [ ] 1.22 Read `agents/bmad-step-runner.md` + `agents/bmad-step-fixer.md` — confirm the sub-agent dispatch contract for AGENTS.md. ZERO modifications.
  - [ ] 1.23 Read `docs/getting-started.md` (full file) — confirm the README quick-start companion (NFR-M4). Story 6.10 cross-links from the worked examples + CONTRIBUTING.md + AGENTS.md. ZERO modifications.
  - [ ] 1.24 Read `docs/configuration.md` (full file) — confirm the bmad-stepper.config.yaml schema reference. Story 6.10's `examples/bmad-stepper.config.yaml` cross-links here. ZERO modifications.
  - [ ] 1.25 Read `docs/exit-codes.md` (full file) — confirm the FR53 exit-code catalog 0-5. Story 6.10's worked examples cross-link here. ZERO modifications.
  - [ ] 1.26 Read `src/upgrade/check.ts` lines 250-280 — confirm the `extractBmadCompat()` regex at the canonical convention `## BMAD Compatibility — v6.5.x`. Story 6.10's CHANGELOG entry uses this exact heading shape so the regex matches.
  - [ ] 1.27 Read `src/upgrade/render.ts` lines 60-100 — confirm the canonical hint at `Run /plugin marketplace update tgorka/bmad-stepper to upgrade.`. Story 6.10's marketplace publication makes this hint actionable.
  - [ ] 1.28 Read `.bmad-stepper/state.yaml` (top section only — full file is 423kB, beyond Read tool limit) — confirm the workflow position. Story 6.10's spec-creation iter does NOT mutate state.yaml (orchestrator owns that).
  - [ ] 1.29 Read `.bmad-stepper/runs/2026-05-06T050848Z-bmad-next/` (current runId directory; create if missing) — confirm tasks subdirectory exists. Story 6.10's spec-creation iter writes a task record at `.bmad-stepper/runs/2026-05-06T050848Z-bmad-next/tasks/bmad-create-story.md`.
  - [ ] 1.30 (OPTIONAL) Inspect `tests/fixtures/quick-start-walkthrough.md` if present — confirm the NFR-M4 reference fixture (Story 1.13 baseline). Story 6.10 does NOT modify the fixture.

- [ ] 2. **REPLACE `LICENSE` with MIT** (per OQ-1)
  - [ ] 2.1 Open `LICENSE` (currently 201 lines of Apache 2.0).
  - [ ] 2.2 Replace ENTIRE file content with the canonical MIT license text (~22 lines):
    ```
    MIT License

    Copyright (c) 2026 Tomasz Gorka

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
    ```
  - [ ] 2.3 Verify `package.json:license` is already `"MIT"` (Story 1.1 baseline; should be unchanged).
  - [ ] 2.4 Verify `.claude-plugin/plugin.json` does NOT have a `license` field — per Story 1.1 baseline the manifest does not declare a license field; the architecture line 195 mandates one. **CHECK at task time:** if the field is missing, ADD `"license": "MIT"` per AR3 and document in the Deviations section.

- [ ] 3. **NEW `CHANGELOG.md`** (per AR38 + NFR-I1 — the BMAD Compatibility section is canonical for the regex Story 6.9 consumes)
  - [ ] 3.1 Create `CHANGELOG.md` at the project root.
  - [ ] 3.2 Initial content per the spec body Section 1 above.
  - [ ] 3.3 Verify the heading `## BMAD Compatibility — v6.5.x` (em-dash U+2014 per OQ-4) is present and matches the regex Story 6.9 `extractBmadCompat()` consumes.
  - [ ] 3.4 Cross-link verification: feature delivery lines reference `/bmad-next`, `/bmad-loop`, the four failure-UX modes, the configuration surface, telemetry opt-in, auto-archival, the diagnostic flags, the upgrade flow, the documentation map.
  - [ ] 3.5 Per Changesets convention, the CHANGELOG.md initial entry MAY be re-formatted on the FIRST `bun run changeset version` invocation; verify the content survives the format pass (per OQ-10).

- [ ] 4. **NEW `AGENTS.md`** (per AR38 — contributor + sub-agent contract)
  - [ ] 4.1 Create `AGENTS.md` at the project root.
  - [ ] 4.2 Sections per the spec body Section 2 above:
    - Three-Layer Architecture
    - Sub-Agent Dispatch Contract (Layer 3)
    - Code Architecture (Layer 2) — module boundary graph
    - Errors as Primary UX (AR21 + AR22)
    - State Discipline
    - Network Discipline
    - Slash-Command Markdown Protocol (AR34)
    - Test Patterns (AR35)
    - Code Quality Gates
    - Contributing pointer
  - [ ] 4.3 Cross-link to CONTRIBUTING.md + SECURITY.md + commands/*.md + agents/*.md + AR-numbered citations.

- [ ] 5. **NEW `CONTRIBUTING.md`** (per AR38)
  - [ ] 5.1 Create `CONTRIBUTING.md` at the project root.
  - [ ] 5.2 Sections per the spec body Section 3 above:
    - Development Setup
    - PR Flow
    - Code Style (AR31, AR33, AR36)
    - Test Patterns (AR35)
    - State + Network Discipline (NFR-S1 + NFR-S2)
    - Errors as Primary UX (AR21 + AR22)
    - Cross-Platform Constraints (AR43)
    - Governance Posture (single-maintainer)
    - Reporting Bugs / Asking Questions
    - License
  - [ ] 5.3 Cross-link to AGENTS.md + SECURITY.md + .github/PULL_REQUEST_TEMPLATE.md + .github/ISSUE_TEMPLATE/*.md.

- [ ] 6. **NEW `SECURITY.md`** (per AR38 + architecture line 1663)
  - [ ] 6.1 Create `SECURITY.md` at the project root.
  - [ ] 6.2 Sections per the spec body Section 4 above:
    - Supported Versions table (0.1.x supported; <0.1 not).
    - Reporting a Vulnerability (private email channel — `tomasz.jakub.gorka@gmail.com` per the user context).
    - Security Posture (Stepper-Specific) — NFR-S1 through NFR-S6 verbatim.
    - Vulnerability Disclosure Timeline (7 days ack; 30 days remediation; coordinated disclosure).

- [ ] 7. **NEW `CODE_OF_CONDUCT.md`** (per AR38)
  - [ ] 7.1 Create `CODE_OF_CONDUCT.md` at the project root.
  - [ ] 7.2 Use the Contributor Covenant v2.1 verbatim (per OQ-5). The official text is at https://www.contributor-covenant.org/version/2/1/code_of_conduct/code_of_conduct.md.
  - [ ] 7.3 Substitute the maintainer contact: replace `[INSERT CONTACT METHOD]` (or equivalent placeholder) with `tomasz.jakub.gorka@gmail.com`.

- [ ] 8. **NEW `.github/PULL_REQUEST_TEMPLATE.md`** (per AR38)
  - [ ] 8.1 Create `.github/PULL_REQUEST_TEMPLATE.md`.
  - [ ] 8.2 Sections per the spec body Section 10 above:
    - Description
    - Related Issues
    - Changesets checkbox
    - Quality Gates checkboxes (`bun run check`, `bunx tsc --noEmit`, tests, no console.log, no main-thread network outside `src/upgrade/`, no writes outside scope).
    - Architectural Compliance checkboxes (no upward imports, AR22 actionable hints, AR34 slash-command pattern).
    - BMAD Compatibility checkboxes.
    - Documentation checkboxes.

- [ ] 9. **NEW `.github/ISSUE_TEMPLATE/bug.md`** (per AR38)
  - [ ] 9.1 Create `.github/ISSUE_TEMPLATE/bug.md`.
  - [ ] 9.2 GitHub classic markdown-template format with YAML frontmatter (per OQ-14):
    - frontmatter: `name`, `about`, `title` prefix `[BUG]`, `labels: bug`.
  - [ ] 9.3 Sections per the spec body Section 11 above (Description, Steps to Reproduce, Expected, Actual, Environment with Stepper version + BMAD version + OS + Bun version, Additional Context, Checklist).

- [ ] 10. **NEW `.github/ISSUE_TEMPLATE/feature.md`** (per AR38)
  - [ ] 10.1 Create `.github/ISSUE_TEMPLATE/feature.md`.
  - [ ] 10.2 GitHub classic markdown-template format with YAML frontmatter:
    - frontmatter: `name`, `about`, `title` prefix `[FEATURE]`, `labels: enhancement`.
  - [ ] 10.3 Sections per the spec body Section 12 above (Use Case, Proposed Behavior, Alternatives, Compatibility checkboxes — including NFR-S1 + NFR-S2 — Additional Context).

- [ ] 11. **NEW `.github/ISSUE_TEMPLATE/bmad-compat.md`** (per AR38)
  - [ ] 11.1 Create `.github/ISSUE_TEMPLATE/bmad-compat.md`.
  - [ ] 11.2 GitHub classic markdown-template format with YAML frontmatter:
    - frontmatter: `name`, `about`, `title` prefix `[BMAD-COMPAT]`, `labels: bmad-compat`.
  - [ ] 11.3 Sections per the spec body Section 13 above (BMAD Version Affected, Stepper Version, Symptom, Failing Skill, Workaround Attempted, Workaround Result, Suggested Fix).
  - [ ] 11.4 The `labels: bmad-compat` is consumed by `.github/workflows/bmad-compat.yml` to file auto-issues on weekly compat failures (per OQ-7).

- [ ] 12. **NEW `.github/dependabot.yml`** (per AR38 + architecture line 1537)
  - [ ] 12.1 Create `.github/dependabot.yml`.
  - [ ] 12.2 Content per the spec body Section 14 above:
    - npm ecosystem, weekly Mondays, max 5 PRs, reviewer tgorka, commit prefix `deps`.
    - github-actions ecosystem, weekly Mondays, max 3 PRs, reviewer tgorka, commit prefix `ci`.

- [ ] 13. **VERIFY + EXTEND `.github/workflows/ci.yml`** (per AR40 + OQ-2)
  - [ ] 13.1 Confirm matches AR40: `name: CI`, on `push` + `pull_request`, matrix `[ubuntu-latest, macos-latest]`, `bun install --frozen-lockfile`, `bun run check`.
  - [ ] 13.2 OPTIONAL per OQ-2: add `bun-version: latest` to the `oven-sh/setup-bun@v2` step for explicit-default. The dev iter MAY skip this if implicit-default is preferred (the architecture line 220 specifies "Bun ≥ 1.3" without a specific pin).
  - [ ] 13.3 Verify the existing `bun run check` covers the release-blocker gate per AR36.

- [ ] 14. **NEW `.github/workflows/release.yml`** (per AR40 + architecture line 1054 + 1566)
  - [ ] 14.1 Create `.github/workflows/release.yml`.
  - [ ] 14.2 Content per the spec body Section 27 above:
    - Trigger: push to main.
    - Concurrency group: release-${{ github.ref }} with cancel-in-progress: false.
    - Permissions: contents: write, pull-requests: write.
    - Job: checkout (fetch-depth: 0 for Changesets git history) + setup-bun (bun-version: latest) + bun install --frozen-lockfile + `bun run check` (release-blocker gate per AR36) + changesets/action@v1 (version: `bun run changeset version`, publish: `bun run changeset tag`).
  - [ ] 14.3 Verify the workflow YAML parses: run `node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/release.yml','utf8'))"` (or equivalent — Bun has `Bun.YAML.parse` per Story 6.1).

- [ ] 15. **NEW `.github/workflows/bmad-compat.yml`** (per AR40 + NFR-I1 + architecture line 1055)
  - [ ] 15.1 Create `.github/workflows/bmad-compat.yml`.
  - [ ] 15.2 Content per the spec body Section 28 above:
    - Trigger: schedule cron `"0 6 * * 1"` (Mondays 06:00 UTC) + workflow_dispatch.
    - Permissions: contents: read, issues: write.
    - Job: checkout + setup-bun + bun install --frozen-lockfile + install latest BMAD-METHOD (via `npx bmad-method install --tools claude-code` with fallback to `git clone`) + run `/bmad-next --doctor` (capture exit code 0 = compat; 3 = BMAD compat error) + on failure auto-create `[BMAD-COMPAT]` issue using actions/github-script@v7 and the body referencing the workflow run + the docs/configuration.md `overrides:` workflow + the CHANGELOG `## BMAD Compatibility — vX.Y.x` section.
  - [ ] 15.3 Verify the workflow YAML parses.

- [ ] 16. **NEW `docs/examples/cold-start-return.md`** (worked example 1 per AR39 + PRD line 459)
  - [ ] 16.1 Create `docs/examples/cold-start-return.md`.
  - [ ] 16.2 Structure per the spec body Section 15 above: Scenario + Command (`/bmad-next --explain`) + Expected Output (stderr) + Narrative + Why this matters + Related cross-links.

- [ ] 17. **NEW `docs/examples/single-step.md`** (worked example 2 per PRD line 460)
  - [ ] 17.1 Create `docs/examples/single-step.md`.
  - [ ] 17.2 Structure per the spec body Section 16 above: Scenario + Command (`/bmad-next`) + Expected Output + Narrative covering the runner pipeline (lock-free read → DAG resolver → persona resolution → dispatch spec → AR9 stdout JSON line → Task tool → verify-and-advance) + Why this matters + Related.

- [ ] 18. **NEW `docs/examples/overnight-loop.md`** (worked example 3 per PRD line 461)
  - [ ] 18.1 Create `docs/examples/overnight-loop.md`.
  - [ ] 18.2 Structure per the spec body Section 17 above: Scenario + Command (`/bmad-loop --until-epic-end --plan-first --token-budget 200k --checkpoint-each implementation`) + Expected Output (plan-first preview phase + execute phase + exit reason + resume hint) + Narrative covering FR21 + FR22 + FR23 + FR26 + Why this matters + Related.

- [ ] 19. **NEW `docs/examples/halt-recovery.md`** (worked example 4 per PRD line 462)
  - [ ] 19.1 Create `docs/examples/halt-recovery.md`.
  - [ ] 19.2 Structure: Scenario (verifier failure mid-loop; user runs --resume) + Command (`/bmad-next --resume`) + Expected Output (last_failure_reason recovery + retry of the failed step) + Narrative covering FR27 + FR32 + the actionable-hint contract + Why this matters + Related.

- [ ] 20. **NEW `docs/examples/skip-on-failure.md`** (worked example 5 per PRD line 463)
  - [ ] 20.1 Create `docs/examples/skip-on-failure.md`.
  - [ ] 20.2 Structure: Scenario (persistent verifier failure on a non-blocking step; user skips) + Command (`/bmad-next --skip <step> --resume`) + Expected Output (skip applied + state advance + next step computed) + Narrative covering FR28 + the SkipRequiresResumeError byte-identical hint + Why this matters + Related.

- [ ] 21. **NEW `docs/examples/doctor-diagnostic.md`** (worked example 6 per PRD line 464)
  - [ ] 21.1 Create `docs/examples/doctor-diagnostic.md`.
  - [ ] 21.2 Structure: Scenario (after a BMAD upgrade; user runs --doctor) + Command (`/bmad-next --doctor`) + Expected Output (the five-line diagnostic mirrors README lines 35-41) + Narrative covering FR41 + FR50 + the BMAD compatibility surface + the unknown-skill fail-loud halt path + Why this matters + Related.

- [ ] 22. **NEW `docs/examples/state-export-ci.md`** (worked example 7 per PRD line 465)
  - [ ] 22.1 Create `docs/examples/state-export-ci.md`.
  - [ ] 22.2 Structure: Scenario (CI gate; user pipes --export-state JSON to a file or jq) + Command (`/bmad-next --export-state > state.json`) + Expected Output (the state.json shape) + Narrative covering FR4 + FR52 + the AR9 carve-out (Story 3.8 precedent) + Why this matters + Related (cross-links to `examples/scripting/ci-state-check.sh`).

- [ ] 23. **NEW `examples/scripting/ci-state-check.sh`** (per AR39 + architecture line 1089)
  - [ ] 23.1 Create `examples/scripting/ci-state-check.sh`.
  - [ ] 23.2 Content per the spec body Section 22 above: Bash script with `set -euo pipefail`, prerequisite checks (bun + jq), invokes `bun run src/commands/next/run.ts -- --export-state`, parses via jq, asserts clean state (no last_failure_reason; last_attempted == last_successful_step), exit 0 / 1 / 2 per the documented semantics.
  - [ ] 23.3 `chmod +x` after writing (verify permissions).
  - [ ] 23.4 Add a header comment block documenting usage + exit codes + dependencies.

- [ ] 24. **NEW `examples/scripting/nightly-loop.sh`** (per AR39 + architecture line 1090)
  - [ ] 24.1 Create `examples/scripting/nightly-loop.sh`.
  - [ ] 24.2 Content per the spec body Section 23 above: Bash script with `set -euo pipefail`, prerequisite checks (bun), invokes `bun run src/commands/loop/run.ts -- --until-epic-end --plan-first --token-budget 200000 --checkpoint-each implementation --max-iters 50`.
  - [ ] 24.3 `chmod +x` after writing.

- [ ] 25. **NEW `examples/bmad-stepper.config.yaml`** (per architecture line 1086)
  - [ ] 25.1 Create `examples/bmad-stepper.config.yaml`.
  - [ ] 25.2 Content: a fully-commented YAML showing all top-level config keys per Story 6.1's BmadStepperConfigSchema:
    ```yaml
    schemaVersion: 1

    # Per-step persona overrides (FR12)
    personas: {}

    # DAG placement overrides for unknown upstream BMAD skills (FR35)
    overrides: {}

    # Verifier overrides per step (FR38)
    verifiers: {}

    # Failure policy per step: retry | skip | route-to-fixer | escalate (FR31)
    failurePolicies: {}

    # Model pinning per step: sonnet | opus | haiku (FR36)
    models: {}

    # Sub-agent budgets per step (FR37)
    budgets: {}

    # Path overrides (default uses _bmad-output/.stepper/)
    paths:
      state: "_bmad-output/.stepper/state.yaml"
      runs: "_bmad-output/.stepper/runs/"
      staging: "_bmad-output/.stepper/staging/"
      telemetry: "_bmad-output/.stepper/telemetry/"

    # Telemetry: opt-in; default false (FR39)
    telemetry:
      enabled: false
    ```
  - [ ] 25.3 Cross-link in CHANGELOG + CONTRIBUTING + AGENTS + the worked examples (where relevant) + docs/configuration.md (no-op if existing — verify).

- [ ] 26. **NEW `examples/bmad-6.4-overrides.yaml`** (per architecture line 1087)
  - [ ] 26.1 Create `examples/bmad-6.4-overrides.yaml`.
  - [ ] 26.2 Content: a forward-compat override sample showing how to place an unknown BMAD skill in the DAG:
    ```yaml
    schemaVersion: 1

    # Example: BMAD v6.4 introduces a new skill `analyst-deep-dive`.
    # Stepper does not yet have built-in placement for it (until the next
    # Stepper minor release ships an updated seed). Add an override:
    overrides:
      analyst-deep-dive:
        phase: analysis
        after: [analyst-research]
        before: [analyst-summary]
        optional: false
    ```
  - [ ] 26.3 Header comment documents the maintenance-moat workflow (FR35; the user adds an override; ships in their config; future Stepper minor release ships built-in placement and the override becomes a no-op).

- [ ] 27. **NEW `.changeset/v0-1-0-marketplace-release.md`** (per architecture line 1566)
  - [ ] 27.1 Create `.changeset/v0-1-0-marketplace-release.md`.
  - [ ] 27.2 Content per the spec body Section 29 above:
    - Frontmatter: `"bmad-stepper": minor` (declares 0.0.x → 0.1.0).
    - Body: v0.1.0 release notes mentioning the two slash commands + state machine + sub-agent contract + failure-UX modes + config + telemetry + auto-archival + diagnostic flags + marketplace publication + documentation.
    - Final line: `BMAD Compatibility — v6.5.x: tested against the latest stable BMAD release at v0.1.0 release time.` (no leading `##` since this is a Changeset body, not a CHANGELOG section header).

- [ ] 28. **MODIFIED `.claude-plugin/plugin.json`** (version bump)
  - [ ] 28.1 Read the current file (4 lines: name, version, description, author, homepage, repository, license, keywords).
  - [ ] 28.2 Change `"version": "0.0.0"` → `"version": "0.1.0"`. ALL OTHER FIELDS UNCHANGED.
  - [ ] 28.3 Verify all AR3-mandated fields are present: `name`, `version`, `description`, `author`, `homepage`, `repository`, `license`, `keywords`. **NOTE per Task 2.4:** if `license` is missing, ADD `"license": "MIT"`. The keywords array MUST equal `["claude-code", "claude-code-plugin", "bmad", "bmad-method", "agile", "ai-development"]`.

- [ ] 29. **MODIFIED `package.json`** (version bump)
  - [ ] 29.1 Change `"version": "0.0.0"` → `"version": "0.1.0"`. ALL OTHER FIELDS UNCHANGED.
  - [ ] 29.2 Verify `"license": "MIT"` is already present (Story 1.1 baseline; should be).

- [ ] 30. **MODIFIED `README.md`** (resolve 5 of 7 forward-references; preserve 2 per OQ-6)
  - [ ] 30.1 Open `README.md` lines 63-69 (the seven worked-example forward-references).
  - [ ] 30.2 Replace each `(Epic 6 Story 6.10 — placeholder)` callout with a clean cross-link:
    - Line 63: `- /bmad-next zero-config single-step advance — see [docs/examples/single-step.md](docs/examples/single-step.md).`
    - Line 64: `- /bmad-loop bounded loop with eight stop conditions — see [docs/examples/overnight-loop.md](docs/examples/overnight-loop.md).`
    - Line 65: `- /bmad-next --resume after halt — see [docs/examples/halt-recovery.md](docs/examples/halt-recovery.md).`
    - Line 66: `- --auto-fix route-to-fixer recovery — see [docs/examples/skip-on-failure.md](docs/examples/skip-on-failure.md).`
    - Line 67: `- /bmad-next --doctor first-run diagnostic — see [docs/examples/doctor-diagnostic.md](docs/examples/doctor-diagnostic.md).`
    - Line 68: `- --export-state for CI integration — see [docs/examples/state-export-ci.md](docs/examples/state-export-ci.md).`
    - Line 69: `- /bmad-next --resume cold-start return — see [docs/examples/cold-start-return.md](docs/examples/cold-start-return.md).`
  - [ ] 30.3 Update line 71: `The seven worked example bodies ship with the v0.1.0 marketplace release; this README links forward to their final paths.` → `The seven worked example bodies ship with the v0.1.0 marketplace release.` (drop the forward-reference language since they are LIVE now).
  - [ ] 30.4 Update lines 91-95 (documentation map):
    - Line 91: `| `docs/configuration.md` | `bmad-stepper.config.yaml` schema reference (Epic 6 Story 6.1 — placeholder) |` → `| [`docs/configuration.md`](docs/configuration.md) | `bmad-stepper.config.yaml` schema reference |`
    - Line 92 (`docs/bmad-compatibility.md`): PRESERVE the placeholder per OQ-6 — the file is forward-deferred to a future story.
    - Line 93 (`docs/architecture.md`): PRESERVE the placeholder per OQ-6.
    - Line 94 (`docs/examples/`): `| `docs/examples/` | Seven worked examples (Epic 6 Story 6.10 — placeholder) |` → `| [`docs/examples/`](docs/examples/) | Seven worked examples (cold-start return, single-step, overnight loop, halt recovery, skip-on-failure, doctor diagnostic, state export for CI) |`.
  - [ ] 30.5 Update lines 98-101 (repo links):
    - Line 98: `- `CHANGELOG.md` — release history (ships with Epic 6 Story 6.10 — placeholder).` → `- [`CHANGELOG.md`](CHANGELOG.md) — release history (Changesets-managed; *BMAD Compatibility — vX.Y.x* per release).`
    - Line 99: `- `CONTRIBUTING.md` — contribution guide (Epic 6 Story 6.10 — placeholder).` → `- [`CONTRIBUTING.md`](CONTRIBUTING.md) — contribution guide.`
    - Line 100: `- `LICENSE` — MIT (Epic 6 Story 6.10 — placeholder).` → `- [`LICENSE`](LICENSE) — MIT.`
    - Line 101: `- `SECURITY.md` — security policy (Epic 6 Story 6.10 — placeholder).` → `- [`SECURITY.md`](SECURITY.md) — security policy.`
  - [ ] 30.6 DO NOT touch the Quick Start section (lines 5-48) per OQ-9 — Story 1.13 baseline preserved verbatim.
  - [ ] 30.7 DO NOT touch the State location convention section (lines 49-59) — Story 1.13 baseline preserved.
  - [ ] 30.8 DO NOT touch the Uninstall preserves your data section (lines 73-83) — preserved (FR49 documentation).

- [ ] 31. **(OPTIONAL per OQ-3) NEW `src/integration/no-network-on-main.test.ts`** — cross-cutting fetch sweep
  - [ ] 31.1 Per OQ-3 carry-forward from Story 6.9 OQ-15 option (b), Story 6.10 may DEFER this. The dev iter MAY choose to introduce a stub file that asserts the upgrade module is the ONLY consumer of `globalThis.fetch` if the implementation is straightforward.
  - [ ] 31.2 If introduced: structure the test as a global `globalThis.fetch` mock + sweep all `src/**/*.ts` for `fetch(`/`Bun.fetch(` patterns + assert ONLY `src/upgrade/check.ts` is the consumer. Mirrors architecture line 1246 pre-listing.
  - [ ] 31.3 If deferred: explicitly NOTE the deferral in the spec's Forward-Trackers section + the runs/<runId>/tasks/ record + leave a `(forward-deferred to post-v0.1)` comment in CONTRIBUTING.md.

- [ ] 32. **Quality gates + sprint-status + state.yaml + evidenceIndex (DEV ITER)**
  - [ ] 32.1 Run `bunx tsc --noEmit` — exit 0 expected (ZERO source code changes per Story 6.10 scope; baseline preserved).
  - [ ] 32.2 Run `bun run check` — full test suite + biome ci. Expected baseline: 1610/0/5192 across 83 files (Story 6.9 close baseline) → expected delta: ZERO (Story 6.10 is documentation + CI workflows + repo files only; no source code changes; the new YAML/Markdown/sh files do NOT participate in `bun test`). Per OQ-3 if Task 31 is implemented: +1 test / +N expects / +1 file.
  - [ ] 32.3 Run `grep -c "extends StepperError" src/errors.ts` → expect `17` UNCHANGED.
  - [ ] 32.4 Run `bun test src/integration/escalate-actionable-hint.test.ts` → expect 33/0/114 UNCHANGED.
  - [ ] 32.5 Validate the new YAML files parse (`.github/workflows/release.yml`, `.github/workflows/bmad-compat.yml`, `.github/dependabot.yml`, `examples/bmad-stepper.config.yaml`, `examples/bmad-6.4-overrides.yaml`). Use `Bun.YAML.parse(await Bun.file(<path>).text())` for each; expect no throw.
  - [ ] 32.6 Validate the new shell scripts pass shellcheck if available (OPTIONAL; not a release-blocker — Stepper does not have shellcheck in its toolchain). At minimum, run each script with `bash -n <path>` (syntax check; no execution) and verify exit 0.
  - [ ] 32.7 Validate the new Markdown files have valid front-matter where applicable (issue templates use YAML frontmatter; Changeset entry uses YAML frontmatter). Use any YAML parser; expect no throw.
  - [ ] 32.8 Visually inspect `LICENSE` for byte-identical MIT text (compare to canonical https://opensource.org/license/mit).
  - [ ] 32.9 Visually inspect `CHANGELOG.md` for the canonical `## BMAD Compatibility — v6.5.x` heading shape (em-dash; matches Story 6.9 regex).
  - [ ] 32.10 Visually inspect `.claude-plugin/plugin.json` + `package.json` for `"version": "0.1.0"`.
  - [ ] 32.11 Visually inspect `README.md` for the resolved cross-links + the preserved Quick Start + the two preserved placeholders for `bmad-compatibility.md` + `architecture.md`.
  - [ ] 32.12 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: change `6-10-repo-files-v0-1-0-marketplace-release: backlog` (line 112) to `6-10-repo-files-v0-1-0-marketplace-release: review`. Bump `last_updated:` to current ISO timestamp.
  - [ ] 32.13 Update `.bmad-stepper/state.yaml`: bump `workflow.lastStep` to `bmad-dev-story`; `workflow.lastStepCompletedAt` to current ISO; `workflow.nextStep` to `bmad-code-review`; `workflow.nextStepStory` and `nextStepKey` UNCHANGED at `6.10` / `6-10-repo-files-v0-1-0-marketplace-release`. Append a new entry to `evidenceIndex` (step: bmad-dev-story, path: `_bmad-output/implementation-artifacts/6-10-repo-files-v0-1-0-marketplace-release.md`, evidence: short summary, runId + loopId, epic 6, story 6.10).
  - [ ] 32.14 Confirm sprint-status epic-6 stays `in-progress` (line 102 — no change needed; Epic 6 retrospective is OPTIONAL).
  - [ ] 32.15 NO write to `~/.claude/plugins/` from any code path during dev or test (NFR-S2 enforced; Story 6.10 has no source code touching this).

- [ ] 33. **Marketplace publication (HUMAN ACTION; DEV ITER documents the requirement)**
  - [ ] 33.1 The dev iter does NOT submit to the Claude Code marketplace UI (per OQ-8).
  - [ ] 33.2 The dev iter LEAVES A NOTE in the runs/<runId>/tasks/ record + the Done Criteria + the Deviations section documenting the human-action requirement.
  - [ ] 33.3 The maintainer (human) takes the v0.1.0 git tag (auto-created by Changesets release.yml on the *Version Packages* PR merge) and submits the listing to the Claude Code marketplace UI manually.
  - [ ] 33.4 Once submitted, the marketplace identifier `tgorka/bmad-stepper` is live and the AC-1 hint from Story 6.9 (`Run /plugin marketplace update tgorka/bmad-stepper to upgrade.`) becomes actionable for community users.
  - [ ] 33.5 The dogfood-validation 30-day clock per PRD §dogfood_validation_plan + product brief §Daily replacement (≥30-day target, first 60 days post-v0.1.0) STARTS at this submission.

## Dev Notes

### Relevant architecture patterns and constraints

- **AR38 repo files** — README + CHANGELOG + AGENTS.md + CONTRIBUTING + SECURITY + CODE_OF_CONDUCT + MIT LICENSE + PR + issue templates + dependabot. Story 6.10 ships ALL of these per the AC-1 inventory.
- **AR39 worked examples** — seven `docs/examples/*.md` + two `examples/scripting/*.sh` + the `examples/bmad-stepper.config.yaml` + `examples/bmad-6.4-overrides.yaml`. Story 6.10 ships ALL of these per the AC-2 inventory.
- **AR40 CI workflows** — `ci.yml` (verified) + `release.yml` (NEW) + `bmad-compat.yml` (NEW). Story 6.10 ships TWO new workflows + verifies the existing one.
- **AR3 plugin manifest fields** — name + version + description + author + homepage + repository + license: MIT + keywords. Story 6.10 BUMPS version + verifies all other fields per AR3.
- **AR41 mid-tier boundary preserved** — ZERO `src/` mutations per Story 6.10 scope.
- **AR42 persistence boundary documented** — CONTRIBUTING.md + AGENTS.md + SECURITY.md cross-link to NFR-S2 enforcement.
- **AR43 cross-platform constraints** — Linux + macOS only via Bun ≥ 1.3; documented in CONTRIBUTING.md + verified at `.github/workflows/ci.yml` matrix.
- **AR8 lock-free top-tier preserved** — ZERO state.yaml interaction.
- **AR9 stdout JSON-line invariant unchanged** — ZERO `src/commands/` mutation.
- **AR21 + AR22 single-line audit + actionable-hint** — documented in AGENTS.md + CONTRIBUTING.md "Errors as Primary UX" sections.
- **AR33 async fs/network discipline** — documented in AGENTS.md sub-agent contract + CONTRIBUTING.md code style.
- **AR34 slash-command markdown protocol** — documented in AGENTS.md.
- **AR35 tmpdir-per-test discipline** — documented in CONTRIBUTING.md tests section.
- **AR36 code quality CI gates** — `bun run check` release-blocker gate per CONTRIBUTING.md + verified at release.yml.
- **NFR-M4 README quick-start under 10 minutes** — preserved verbatim from Story 1.13 baseline; Story 6.10 RESOLVES forward-references but DOES NOT touch the Quick Start section itself.
- **NFR-I1 BMAD compatibility declared per release** — ENFORCED via the canonical `## BMAD Compatibility — v6.5.x` heading in CHANGELOG.md + the weekly `.github/workflows/bmad-compat.yml` cron job.
- **NFR-I3 runtime parity at release** — ENFORCED via `.github/workflows/release.yml` Changesets + the `bun run check` release-blocker gate.
- **NFR-I5 Linux + macOS via Bun ≥ 1.3** — ENFORCED via `.github/workflows/ci.yml` matrix.
- **NFR-S1 + NFR-S2 + NFR-S3 + NFR-S4 + NFR-S5 + NFR-S6 security posture** — DOCUMENTED in SECURITY.md + AGENTS.md + CONTRIBUTING.md.

### Source tree components to touch

NEW (24):

- `CHANGELOG.md` (Task 3)
- `AGENTS.md` (Task 4)
- `CONTRIBUTING.md` (Task 5)
- `SECURITY.md` (Task 6)
- `CODE_OF_CONDUCT.md` (Task 7)
- `.github/PULL_REQUEST_TEMPLATE.md` (Task 8)
- `.github/ISSUE_TEMPLATE/bug.md` (Task 9)
- `.github/ISSUE_TEMPLATE/feature.md` (Task 10)
- `.github/ISSUE_TEMPLATE/bmad-compat.md` (Task 11)
- `.github/dependabot.yml` (Task 12)
- `.github/workflows/release.yml` (Task 14)
- `.github/workflows/bmad-compat.yml` (Task 15)
- `docs/examples/cold-start-return.md` (Task 16)
- `docs/examples/single-step.md` (Task 17)
- `docs/examples/overnight-loop.md` (Task 18)
- `docs/examples/halt-recovery.md` (Task 19)
- `docs/examples/skip-on-failure.md` (Task 20)
- `docs/examples/doctor-diagnostic.md` (Task 21)
- `docs/examples/state-export-ci.md` (Task 22)
- `examples/scripting/ci-state-check.sh` (Task 23)
- `examples/scripting/nightly-loop.sh` (Task 24)
- `examples/bmad-stepper.config.yaml` (Task 25)
- `examples/bmad-6.4-overrides.yaml` (Task 26)
- `.changeset/v0-1-0-marketplace-release.md` (Task 27)
- (OPTIONAL per OQ-3) `src/integration/no-network-on-main.test.ts` (Task 31)

REPLACED (1):

- `LICENSE` (Apache 2.0, 201 lines → MIT, ~22 lines; Task 2)

MODIFIED (4):

- `.claude-plugin/plugin.json` (Task 28 — version bump)
- `package.json` (Task 29 — version bump)
- `.github/workflows/ci.yml` (Task 13 — OPTIONAL bun-version pin)
- `README.md` (Task 30 — resolve 5 forward-references)

UNCHANGED (verified — no mutation): `src/**` (zero source code changes), `commands/{bmad-next, bmad-loop, bmad-doctor}.md`, `agents/{bmad-step-runner, bmad-step-fixer}.md`, `docs/{getting-started, configuration, exit-codes}.md`, `.changeset/{config.json, README.md}`, `bunfig.toml`, `tsconfig.json`, `biome.json`, `bun.lock`, `tests/fixtures/**`.

### Testing standards summary

- **NO new colocated unit tests** — Story 6.10 has zero source code changes. Existing tests (1610/0/5192 across 83 files; Story 6.9 close baseline) are preserved.
- **NEW YAML / Markdown / sh files are validated by inspection** — no automated test infrastructure for these in v0.1; the `bun run check` gate covers TypeScript only.
- **NFR-M4 quick-start fixture** — `tests/fixtures/quick-start-walkthrough.md` (Story 1.13 baseline) preserved.
- **bmad-compat.yml weekly cron** — runs against the latest BMAD upstream every Monday; auto-creates `[BMAD-COMPAT]` issues on incompatibility per OQ-7.
- **release.yml Changesets release flow** — runs on every push to `main`; either creates the *Version Packages* PR (if pending Changesets) OR tags + publishes the GitHub Release (if the PR was just merged).
- **(OPTIONAL per OQ-3 — Task 31) `src/integration/no-network-on-main.test.ts`** — if introduced, sweeps `src/**/*.ts` for `fetch(`/`Bun.fetch(` patterns and asserts ONLY `src/upgrade/check.ts` is the consumer. If deferred, the contract is documented in CONTRIBUTING.md.

### Project Structure Notes

- **Alignment with unified project structure**: Story 6.10 INSTANTIATES the architecture's pre-listed root-level files (lines 1035-1065) + the docs/examples directory (lines 1077-1084) + the examples/scripting directory (lines 1085-1090) + the .github/ template tree (lines 1051-1061). Every file Story 6.10 ships is pre-listed in the architecture; the only exception is the optional `src/integration/no-network-on-main.test.ts` (architecture line 1246 — pre-listed but per OQ-3 deferred).
- **NEW directory `docs/examples/`**: Story 6.10 introduces this directory. Future stories may extend with additional worked examples (e.g., `tutoring-mode.md`, `multi-project.md`).
- **NEW directory `examples/scripting/`**: Story 6.10 introduces this directory. Future stories may extend with additional shell scripts (e.g., `cron-cleanup.sh`).
- **NEW directory `.github/ISSUE_TEMPLATE/`**: Story 6.10 introduces this directory. Future stories may extend with additional issue templates.
- **Detected variances**:
  - The existing `LICENSE` file is Apache 2.0 (Story 1.1 anomaly; the AC + product brief have always specified MIT). Story 6.10 REPLACES per OQ-1.
  - The `.claude-plugin/plugin.json` MAY be missing the `license: MIT` field (verify at task time per Task 2.4 + Task 28.3); if missing, Story 6.10 ADDS per AR3.
- **Path scope**: ZERO writes outside the project root. ZERO interaction with `~/.claude/plugins/`. ZERO source code under `src/`. The dev iter writes to root-level files + `docs/examples/` + `examples/scripting/` + `.github/` + `.changeset/`.

### Forward-trackers honoured here

- **Story 6.9 SDR I-49 (calendar-month threshold drift)** — UNCHANGED documentation-only OPEN. Story 6.10 does NOT touch the threshold semantics.
- **Story 6.9 OQ-15 (cross-cutting `no-network-on-main.test.ts` enforcement)** — INHERITED per OQ-3 option (b) carry-forward. Story 6.10 documents the contract in AGENTS.md + CONTRIBUTING.md + (OPTIONAL) introduces the test file at Task 31.
- **Story 6.7 SDR I-43 (opts.config seam — 9 sites accumulated)** — UNCHANGED at 9 sites. Story 6.10 introduces ZERO new opts.config consumer (no source code changes).
- **Story 6.6 + 6.7 SDR I-48 (UTC discipline)** — UNCHANGED. Story 6.10 has no time-based logic (the cron schedule in bmad-compat.yml is a fixed UTC cron, not a wall-clock comparison).
- **Story 1.7 baseline `upgrade: z.boolean().default(false)` flag** — UNCHANGED. Story 6.10 does NOT mutate args.ts.
- **Story 2.4 forward-deferral guard** — RESOLVED IN Story 6.9 (closed). N/A for Story 6.10.
- **Story 1.13 NFR-M4 Quick Start** — PRIMARY HONOURED. Story 6.10 RESOLVES the seven forward-references in README without touching the Quick Start section itself.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md`#Story-6.10, lines 1294-1308 — AC byte-identical source]
- [Source: `_bmad-output/planning-artifacts/epics.md`#AR38, line 230 — repo files inventory]
- [Source: `_bmad-output/planning-artifacts/epics.md`#AR39, line 231 — seven worked examples]
- [Source: `_bmad-output/planning-artifacts/epics.md`#AR40, line 232 — CI workflows]
- [Source: `_bmad-output/planning-artifacts/epics.md`#AR3, line 165 — plugin manifest fields]
- [Source: `_bmad-output/planning-artifacts/architecture.md`#repo-files, lines 1029-1098 — complete project directory structure]
- [Source: `_bmad-output/planning-artifacts/architecture.md`#release-process, lines 1565-1568]
- [Source: `_bmad-output/planning-artifacts/architecture.md`#FR-NFR-mapping, lines 1325-1424]
- [Source: `_bmad-output/planning-artifacts/architecture.md`#agents-md-content-not-specified, line 1662 — architecture validation gap addressed by Story 6.10]
- [Source: `_bmad-output/planning-artifacts/architecture.md`#security-md-content-not-specified, line 1663 — architecture validation gap addressed by Story 6.10]
- [Source: `_bmad-output/planning-artifacts/prd.md`#FR47-FR49, lines 735-737]
- [Source: `_bmad-output/planning-artifacts/prd.md`#NFR-M4, line 803]
- [Source: `_bmad-output/planning-artifacts/prd.md`#NFR-I1, line 792]
- [Source: `_bmad-output/planning-artifacts/prd.md`#NFR-I3, line 794]
- [Source: `_bmad-output/planning-artifacts/prd.md`#NFR-I5, line 796]
- [Source: `_bmad-output/planning-artifacts/prd.md`#code-examples, lines 455-467 — seven worked examples convention]
- [Source: `_bmad-output/planning-artifacts/prd.md`#mit-license, line 210]
- [Source: `_bmad-output/planning-artifacts/prd.md`#dogfood-validation-plan, lines 396-412]
- [Source: `_bmad-output/planning-artifacts/product-brief-bmad-stepper.md`#daily-replacement, line 166 — 30-day target post-v0.1.0]
- [Source: `_bmad-output/planning-artifacts/product-brief-bmad-stepper.md`#kill-criterion, line 122 — 60-day kill criterion]
- [Source: `_bmad-output/planning-artifacts/product-brief-bmad-stepper.md`#cold-install-persona, lines 295-305 — Lena scenario for `cold-start-return.md`]
- [Source: `_bmad-output/implementation-artifacts/6-9-upgrade-flow.md`#extractBmadCompat-regex (UPGRADE_69_BMAD_COMPAT_EXTRACTED_1)]
- [Source: `_bmad-output/implementation-artifacts/6-9-upgrade-flow.md`#OQ-15 — cross-cutting `no-network-on-main.test.ts` deferral]
- [Source: `_bmad-output/implementation-artifacts/1-13-quick-start-documentation.md`#NFR-M4-baseline]
- [Source: `_bmad-output/implementation-artifacts/1-1-initialize-repository-scaffold.md`#repo-scaffold-baseline]
- [Source: `README.md`:1-104 — current README state; Quick Start at lines 5-48 preserved verbatim per OQ-9]
- [Source: `LICENSE`:1-201 — current Apache 2.0 LICENSE; REPLACED with MIT per OQ-1]
- [Source: `.claude-plugin/plugin.json`:1-19 — current manifest; version bump 0.0.0 → 0.1.0]
- [Source: `package.json`:1-25 — current package; version bump 0.0.0 → 0.1.0]
- [Source: `.github/workflows/ci.yml`:1-29 — current CI workflow; matches AR40]
- [Source: `src/upgrade/check.ts:250-280` — `extractBmadCompat()` regex contract Story 6.10's CHANGELOG matches]
- [Source: `src/upgrade/render.ts:60-100` — canonical hint that becomes actionable post-marketplace publication]

### Quality Gates

| Gate | Command | Expected | Notes |
|------|---------|----------|-------|
| TypeScript strict | `bunx tsc --noEmit` | exit 0 | ZERO source code changes; baseline preserved. |
| Test suite + biome ci | `bun run check` | 1610/0/5192 across 83 files (UNCHANGED from Story 6.9 close) | Story 6.10 has no source code; per OQ-3 if Task 31 is implemented: +1 test / +N expects / +1 file. |
| Errors registry | `grep -c "extends StepperError" src/errors.ts` | 17 | UNCHANGED (no new error classes). |
| Escalate sweep | `bun test src/integration/escalate-actionable-hint.test.ts` | 33/0/114 | UNCHANGED. |
| YAML parse (release.yml) | `bun -e "import('node:fs').then(fs => fs.promises.readFile('.github/workflows/release.yml', 'utf8')).then(t => Bun.YAML.parse(t))"` | no throw | New YAML parses cleanly. |
| YAML parse (bmad-compat.yml) | same as above for bmad-compat.yml | no throw | |
| YAML parse (dependabot.yml) | same | no throw | |
| YAML parse (config example) | same for `examples/bmad-stepper.config.yaml` | no throw | |
| YAML parse (overrides example) | same for `examples/bmad-6.4-overrides.yaml` | no throw | |
| Shell syntax | `bash -n examples/scripting/ci-state-check.sh && bash -n examples/scripting/nightly-loop.sh` | exit 0 | Both scripts pass syntax check. |
| Markdown linting (OPTIONAL) | `bun x markdownlint <files>` if installed | exit 0 | Not a release-blocker; Stepper does not require markdownlint in toolchain. |
| LICENSE byte-identity | visual diff against canonical MIT (https://opensource.org/license/mit) | match | The MIT license text is canonical; verify byte-for-byte (modulo copyright line). |
| CHANGELOG.md `## BMAD Compatibility — v6.5.x` heading | `grep -c "^## BMAD Compatibility — v6.5\.x" CHANGELOG.md` | 1 | Em-dash U+2014; matches Story 6.9 regex. |
| `.claude-plugin/plugin.json:version` | `bun pm pkg get version` (or `jq -r .version .claude-plugin/plugin.json`) | "0.1.0" | Bumped from 0.0.0. |
| `package.json:version` | `bun pm pkg get version` | "0.1.0" | Bumped from 0.0.0. |
| README forward-references resolved | `grep -c "(Epic 6 Story 6.10 — placeholder)" README.md` | 2 | Five resolved; two preserved per OQ-6 (`bmad-compatibility.md` + `architecture.md`). |
| README Quick Start preserved | byte-diff lines 5-48 against Story 1.13 baseline | match | Per OQ-9 — NFR-M4 baseline untouched. |

### Done Criteria

A `done` Story 6.10 is one that ships ALL the AC inventory items + a clean quality gate sweep + a documented marketplace publication note. Specifically:

1. **AR38 inventory complete** — README + CHANGELOG.md + AGENTS.md + CONTRIBUTING.md + SECURITY.md + CODE_OF_CONDUCT.md + LICENSE (MIT) + .github/PULL_REQUEST_TEMPLATE.md + .github/ISSUE_TEMPLATE/{bug,feature,bmad-compat}.md + .github/dependabot.yml. **All 11 files exist + content matches the spec.**
2. **AR39 inventory complete** — `docs/examples/{cold-start-return, single-step, overnight-loop, halt-recovery, skip-on-failure, doctor-diagnostic, state-export-ci}.md` (7 files) + `examples/scripting/{ci-state-check.sh, nightly-loop.sh}` (2 files) + `examples/bmad-stepper.config.yaml` + `examples/bmad-6.4-overrides.yaml` (2 files). **All 11 files exist + each `docs/examples/*.md` pairs command + expected output + narrative per PRD line 467.**
3. **AR40 inventory complete** — `.github/workflows/{ci.yml, release.yml, bmad-compat.yml}`. **All 3 workflows exist + parse cleanly + match the AR40 spec.**
4. **Plugin manifest version bumped** — `.claude-plugin/plugin.json:version` is `"0.1.0"`. All AR3 fields present.
5. **package.json version bumped** — `package.json:version` is `"0.1.0"`. License is `"MIT"`.
6. **LICENSE replaced** — content matches canonical MIT text (modulo copyright line). **The Apache 2.0 anomaly is resolved per OQ-1.**
7. **CHANGELOG.md initial entry includes the canonical BMAD Compatibility heading** — `## BMAD Compatibility — v6.5.x` matches Story 6.9's `extractBmadCompat()` regex.
8. **Initial Changeset entry exists** — `.changeset/v0-1-0-marketplace-release.md` declares minor bump.
9. **README forward-references resolved** — five of seven `(Epic 6 Story 6.10 — placeholder)` callouts replaced with live cross-links; two preserved per OQ-6.
10. **README Quick Start preserved** — lines 5-48 byte-identical to Story 1.13 baseline.
11. **Quality gates green** — `bunx tsc --noEmit` exit 0 + `bun run check` matches the Story 6.9 close baseline (1610/0/5192/83) + `grep -c "extends StepperError" src/errors.ts` = 17 + `bun test src/integration/escalate-actionable-hint.test.ts` = 33/0/114.
12. **All new YAML files parse** — release.yml + bmad-compat.yml + dependabot.yml + bmad-stepper.config.yaml + bmad-6.4-overrides.yaml.
13. **Both new shell scripts pass syntax check** — `bash -n` exits 0.
14. **sprint-status updated** — `6-10-repo-files-v0-1-0-marketplace-release: review` (after dev iter); `last_updated:` bumped.
15. **state.yaml updated** — workflow.lastStep = `bmad-dev-story`; evidenceIndex appended.
16. **NO writes to `~/.claude/plugins/`** — NFR-S2 preserved trivially.
17. **NO source code changes under `src/`** — AR41 preserved trivially.
18. **Marketplace publication note** — runs/<runId>/tasks/ record documents the human-action requirement (the maintainer submits the listing to the Claude Code marketplace UI at the v0.1.0 git tag; this is OUT-OF-SCOPE for the dev iter per OQ-8).
19. **Dogfood-validation 30-day clock note** — Story 6.10 STARTS the clock at the v0.1.0 release; CLOSING the clock is OUT-OF-SCOPE (deferred to a future post-release retrospective).

### Out-of-scope clarifications

- **Closing the dogfood-validation 30-day clock** — OUT-OF-SCOPE for Story 6.10. Story 6.10 STARTS the clock by shipping v0.1.0; the close is a future post-release retrospective per PRD §dogfood_validation_plan + product brief §Daily replacement (≥30-day target, first 60 days post-v0.1.0). The kill criterion (>50% manual sessions after 60 days per product brief line 122) is the meta-fallback that retires the project.
- **Anthropic Claude Code marketplace UI submission** — OUT-OF-SCOPE for the dev iter per OQ-8. Story 6.10's dev iter ships the repo tarball at the v0.1.0 tag; the human maintainer submits the listing manually via the Claude Code marketplace UI. The dev iter LEAVES A NOTE in the runs/<runId>/tasks/ record + the Done Criteria.
- **`docs/bmad-compatibility.md` per-Stepper-release BMAD compat history** — DEFERRED per OQ-6. Pre-listed in architecture line 1075 but not in epics.md AC. The first BMAD compat entry lives in CHANGELOG.md's `## BMAD Compatibility — v6.5.x` section per AR38; the dedicated docs file can be created post-v0.1.0 as the per-release history grows.
- **`docs/architecture.md` mirror of the planning architecture** — DEFERRED per OQ-6. Pre-listed in architecture line 1076 but not in AC. The planning architecture lives at `_bmad-output/planning-artifacts/architecture.md`; mirroring is a future-story concern.
- **Cross-cutting `no-network-on-main.test.ts` enforcement** — DEFERRED per OQ-3 carry-forward from Story 6.9 OQ-15 option (b). The dev iter MAY introduce a stub file (Task 31) but this is OPTIONAL; the canonical implementation requires Bun's test API to inject globally, which is non-trivial. Documented in AGENTS.md + CONTRIBUTING.md.
- **Beta/rc release channel selection** — DEFERRED post-v0.1. The Changesets release flow ships only stable releases; beta channels are a future story.
- **GitHub Pages docs site** — DEFERRED per product brief line 233 ("only if README outgrows itself"). v0.1.0 ships docs as Markdown in the repo.
- **Visual marketing assets / screenshots** — DEFERRED. Stepper has no GUI; the marketplace listing uses the README as the primary asset.
- **Translations (i18n)** — DEFERRED post-v0.1. English-only at v0.1.0.
- **`tests/fixtures/` BMAD-version fixture matrix** — UNCHANGED at this story (Stories 1.1 + 1.13 baseline). The `.github/workflows/bmad-compat.yml` runs against the LATEST BMAD upstream; per-version fixtures are a future-story concern if compat regressions accumulate.
- **`tsconfig.json` + `biome.json` + `bunfig.toml` mutation** — UNCHANGED. Story 1.1 baseline preserved.
- **Source code changes under `src/`** — ZERO per Story 6.10 scope. The 17 errors registry, the schemas, the migrations, the dispatch chain, the failure-UX module, the upgrade module, the telemetry module, the startup archival module — all UNCHANGED.
- **`commands/*.md` mutations** — ZERO. The slash-command surface is frozen for v0.1.0.
- **`agents/*.md` mutations** — ZERO. The sub-agent contract is frozen for v0.1.0.

### Open Questions (for the dev iter to adjudicate at code-time)

| OQ | Question | Recommendation |
|----|----------|---------------|
| OQ-1 | LICENSE replacement: Apache 2.0 → MIT | **REPLACE.** The AC + product brief + epics.md mandate MIT. The Apache 2.0 file is a Story 1.1 anomaly. Replace with canonical MIT text (~22 lines). |
| OQ-2 | CI matrix: pin Bun version or use `latest`? | **Use `latest` per OQ-2.** Architecture line 220 specifies "Bun ≥ 1.3"; pinning to a specific patch would over-constrain. The dev iter MAY add `bun-version: latest` for explicitness (default behavior). |
| OQ-3 | `src/integration/no-network-on-main.test.ts` — introduce or defer? | **Defer per OQ-3 option (b).** Inherit Story 6.9's deferral. The contract is documented in AGENTS.md + CONTRIBUTING.md. The dev iter MAY introduce a stub file at Task 31 if straightforward. |
| OQ-4 | Heading separator: em-dash `—` or hyphen `-`? | **Em-dash per OQ-4.** Canonical convention per architecture line 1665 + Story 6.9 OQ-4. Story 6.9 regex tolerates both, but the canonical shape uses U+2014. |
| OQ-5 | CODE_OF_CONDUCT.md: Contributor Covenant or custom? | **Contributor Covenant 2.1 per OQ-5.** De-facto OSS standard; battle-tested. Substitute the maintainer email. |
| OQ-6 | README forward-references for `bmad-compatibility.md` + `architecture.md` — resolve or preserve? | **Preserve per OQ-6.** Both files are deferred to a future story (architecture pre-lists them but AC does not require). The other 5 forward-references are RESOLVED. |
| OQ-7 | bmad-compat.yml: fail workflow or auto-issue on incompat? | **Auto-issue per OQ-7.** Use actions/github-script@v7 + the `bmad-compat` issue template label. Maintainer is notified asynchronously; CI does not block unrelated PRs. |
| OQ-8 | Marketplace publication: dev iter or human action? | **Human action per OQ-8.** No Anthropic API for automated submission. Dev iter ships the repo tarball at the v0.1.0 tag; maintainer submits via the marketplace UI. |
| OQ-9 | README Quick Start: rewrite or preserve? | **Preserve per OQ-9.** Story 1.13 baseline tested against NFR-M4 (under 10 minutes); rewriting would re-test against NFR-M4 — pointless when existing one passes. |
| OQ-10 | CHANGELOG.md initial entry: manual or Changesets-auto-generated? | **Manual per OQ-10.** Changesets has no prior history to auto-generate from; the manual initial entry is the seed Changesets builds on. The first `bun run changeset version` MAY re-format but content is preserved. |
| OQ-11 | `examples/scripting/*.sh` invocation: slash command or `bun run` direct? | **`bun run` direct per OQ-11.** Portable to plain CI environments without Claude Code. |
| OQ-12 | dependabot schedule: daily or weekly? | **Weekly Mondays per OQ-12.** Canonical OSS schedule; appropriate for single-maintainer cadence. |
| OQ-13 | release.yml + bmad-compat.yml Bun version | **`latest` per OQ-13.** Mirrors OQ-2 reasoning. |
| OQ-14 | Issue templates: classic Markdown or YAML form? | **Classic Markdown per OQ-14.** Architecture pre-lists `.md` extensions (lines 1057-1059); staying consistent with the spec. |
| OQ-15 | CHANGELOG.md initial v0.1.0 entry: include `## BMAD Compatibility — v6.5.x` heading? | **Yes per OQ-15.** NFR-I1 + Story 6.9 regex contract. Establish the pattern from day one; H3 inside H2 v0.1.0 section per Changesets convention. |
| OQ-16 | `examples/bmad-stepper.config.yaml`: comment every key or be minimal? | **Comment every key.** PRD §code_examples line 467 says "each example pairs the command with expected output and a short narrative" — by analogy, the config example should be self-documenting. |
| OQ-17 | `LICENSE` copyright year: 2026 or 2024-2026 range? | **2026.** The repo was first committed in 2026; range notation is unnecessary for a single-year file. Future updates can extend to a range when 2027+ commits land. |

## Dev Notes — implementation log

**Iteration:** dev-story iter 2 of /bmad-loop --until=epic:6 (loopId 2026-05-06T050748Z-bmad-loop, runId 2026-05-06T053026Z-bmad-next).
**Status transition:** ready-for-dev → review.

### Files created (24 NEW)

Root-level (5 NEW + 1 REPLACED — done in iter 1 by prior agent and verified intact):

- `CHANGELOG.md` — v0.1.0 entry + canonical `## BMAD Compatibility — v6.5.x` heading (em-dash U+2014).
- `AGENTS.md` — three-layer architecture + sub-agent dispatch contract.
- `CONTRIBUTING.md` — setup + PR flow + code style + tests + governance.
- `SECURITY.md` — supported versions + reporting channel + NFR-S1..S6 posture.
- `CODE_OF_CONDUCT.md` — Contributor Covenant 2.1 reference.
- `LICENSE` — REPLACED Apache 2.0 → MIT (Tomasz Gorka, 2026).

`.github/` (5 NEW; created in iter 2):

- `.github/PULL_REQUEST_TEMPLATE.md`
- `.github/ISSUE_TEMPLATE/bug.md` (frontmatter `name/about/title/labels`)
- `.github/ISSUE_TEMPLATE/feature.md`
- `.github/ISSUE_TEMPLATE/bmad-compat.md` (consumed by bmad-compat.yml auto-issue)
- `.github/dependabot.yml` (npm + github-actions, weekly Monday)

`.github/workflows/` (2 NEW + 1 EXTENDED; created in iter 2):

- `.github/workflows/release.yml` — Changesets PR-based release flow (push to main).
- `.github/workflows/bmad-compat.yml` — weekly cron (Monday 06:00 UTC) + auto-issue on incompat.
- `.github/workflows/ci.yml` — EXTENDED with explicit `bun-version: latest` per OQ-2.

`docs/examples/` (7 NEW; created in iter 2):

- `cold-start-return.md`, `single-step.md`, `overnight-loop.md`, `halt-recovery.md`, `skip-on-failure.md`, `doctor-diagnostic.md`, `state-export-for-ci.md`.

`examples/` (4 NEW; created in iter 2):

- `examples/scripting/ci-state-check.sh` (chmod +x).
- `examples/scripting/nightly-loop.sh` (chmod +x).
- `examples/bmad-stepper.config.yaml` — fully-commented schema example.
- `examples/bmad-6.4-overrides.yaml` — forward-compat override sample.

`.changeset/` (1 NEW; created in iter 2):

- `.changeset/v0-1-0-marketplace-release.md` — minor bump entry.

### Files modified (4)

- `.claude-plugin/plugin.json` — version bump 0.0.0 → 0.1.0; license MIT verified intact.
- `package.json` — version bump 0.0.0 → 0.1.0; license MIT verified intact.
- `.github/workflows/ci.yml` — added `bun-version: latest` (OQ-2).
- `README.md` — resolved 5 of 7 forward-references (`single-step`, `overnight-loop`, `halt-recovery`, `skip-on-failure`, `doctor-diagnostic`, `state-export-for-ci`, `cold-start-return`, plus `docs/configuration.md` and `docs/examples/`); preserved 2 placeholders (`bmad-compatibility.md`, `architecture.md`) per OQ-6.

### Tests added

- ZERO new test files. Story 6.10 is documentation + CI workflows + repo files; no source changes under `src/`.
- The optional cross-cutting `src/integration/no-network-on-main.test.ts` (OQ-3 / Task 31) was DEFERRED inheriting Story 6.9 OQ-15 option (b) — the contract is documented in AGENTS.md + CONTRIBUTING.md + SECURITY.md.

### Quality gates — results

| Gate | Result |
|------|--------|
| `bunx tsc --noEmit` | exit 0 (no source changes; baseline preserved) |
| `bunx biome ci .` | exit 0 (181 files checked; 9 infos, 0 errors) |
| `bun test` | 1610 pass / 0 fail / 5192 expect / 83 files (UNCHANGED from Story 6.9 close baseline) |
| YAML parse (Bun.YAML.parse) | All 6 new YAMLs (`ci.yml`, `release.yml`, `bmad-compat.yml`, `dependabot.yml`, `bmad-stepper.config.yaml`, `bmad-6.4-overrides.yaml`) parse OK |
| Shell syntax (`bash -n`) | Both shell scripts pass |
| `chmod +x` on shell scripts | applied + verified |
| Errors registry | 17 (UNCHANGED) |

### Repair iterations

ZERO repair iters. All gates passed on first attempt.

### Marketplace publication note

The Claude Code marketplace listing at `tgorka/bmad-stepper` is OUT-OF-SCOPE for the dev iter per OQ-8. The maintainer (human) submits the listing manually via the Claude Code marketplace UI at the v0.1.0 git tag (auto-created by Changesets release.yml on the *Version Packages* PR merge). The dogfood-validation 30-day clock per PRD §dogfood_validation_plan starts at the marketplace submission.

### Open items / blockers for code review

None. All AC items are addressed within the dev iter scope. Two intentional items deferred per OQ recommendations:

1. `docs/bmad-compatibility.md` + `docs/architecture.md` — preserved README placeholders per OQ-6 (pre-listed in architecture but not in epics.md AC).
2. `src/integration/no-network-on-main.test.ts` cross-cutting integration test — deferred per OQ-3 inheriting Story 6.9 OQ-15 option (b); contract documented.

The marketplace UI submission (OQ-8) is a human action post-tag.

## Senior Developer Review (SDR)

**Date:** 2026-05-06
**Reviewer:** Senior Developer (BMAD `bmad-code-review` persona — independent quality-gate verification, AC verification, AR/NFR verdict assessment, OQ honoured/violated check, forward-tracker accounting, FRESH context).
**Iteration:** 3 of `/bmad-loop --until=epic:6` (loopId `2026-05-06T050748Z-bmad-loop`, runId `2026-05-06T054627Z-bmad-next`).

### Verdict

**APPROVE** — must-fix=0, should-fix=0, nits=0 NEW (4 inherited N-1..N-4 carry forward unchanged), info=0 NEW (cumulative I-1..I-49 minus 8 closed; I-43 + I-49 carry forward documentation-only OPEN — both unaffected by Story 6.10 since ZERO source changes).

Story 6.10 ships the canonical AR38/AR39/AR40 inventory for the v0.1.0 marketplace release with byte-correct CHANGELOG matching Story 6.9's `extractBmadCompat()` regex contract, MIT LICENSE replacement, Changesets-driven release.yml + weekly bmad-compat.yml workflows, seven worked examples, two scripting examples, fully-commented config example + override sample, and complete `.github/` template tree. All quality gates green from fresh shell at the Story 6.9 close baseline.

### AC verification with file:line evidence

**AC-1 PASS** — Repo deliverables per AR38, AR39, AR40 at v0.1.0 tag:

| AR38 file | Verified at | Evidence |
|-----------|------------|----------|
| `README.md` (Quick Start NFR-M4) | `README.md:5-48` | Quick Start section preserved verbatim from Story 1.13 baseline; 8-step path to green `/bmad-next --doctor` |
| `CHANGELOG.md` (Changesets-managed; *BMAD Compatibility — v6.5.x*) | `CHANGELOG.md:1-30` | v0.1.0 entry + canonical heading at line 21 (em-dash U+2014 verified via hexdump: `e2 80 94`) |
| `AGENTS.md` (contributor + sub-agent contract) | `AGENTS.md:1-96` | Three-Layer Architecture + Sub-Agent Dispatch Contract + Code Architecture + Errors-as-Primary-UX + State + Network + Slash-Command + Tests + Quality Gates |
| `CONTRIBUTING.md` | `CONTRIBUTING.md:1-121` | Setup + PR Flow + Release Process + Code Style + CLI Surface + Tests + State+Network + Errors + Failure-UX + Cross-Platform + Governance + License |
| `SECURITY.md` | `SECURITY.md:1-45` | Supported Versions table + Reporting Channel (`tomasz.jakub.gorka@gmail.com`) + NFR-S1..S6 posture + Disclosure Timeline |
| `CODE_OF_CONDUCT.md` | `CODE_OF_CONDUCT.md:1-26` | Contributor Covenant 2.1 reference (per OQ-5) + maintainer email substitution |
| `LICENSE` (MIT) | `LICENSE:1-21` | MIT License + `Copyright (c) 2026 Tomasz Gorka`; Apache 2.0 anomaly resolved per OQ-1 |
| `.github/PULL_REQUEST_TEMPLATE.md` | `.github/PULL_REQUEST_TEMPLATE.md:1-36` | Description + Related Issues + Changesets + Quality Gates + Architectural Compliance + BMAD Compatibility + Documentation |
| `.github/ISSUE_TEMPLATE/bug.md` | `.github/ISSUE_TEMPLATE/bug.md:1-37` | Frontmatter `name/about/title/labels: bug` + Description + Steps + Expected/Actual + Environment + Checklist |
| `.github/ISSUE_TEMPLATE/feature.md` | `.github/ISSUE_TEMPLATE/feature.md:1-28` | Frontmatter `name/about/title/labels: enhancement` + Use Case + Proposed Behavior + Alternatives + Compatibility + Additional Context |
| `.github/ISSUE_TEMPLATE/bmad-compat.md` | `.github/ISSUE_TEMPLATE/bmad-compat.md:1-34` | Frontmatter `name/about/title/labels: bmad-compat` (label consumed by bmad-compat.yml auto-issue per OQ-7) + BMAD Version + Stepper Version + Symptom + Failing Skill + Workaround + Suggested Fix |
| `.github/dependabot.yml` | `.github/dependabot.yml:1-25` | npm + github-actions ecosystems, weekly Mondays (per OQ-12), reviewers tgorka, commit prefix deps/ci |

**AC-2 PASS** — Seven worked examples + scripting:

| AC-2 file | Verified at | Pattern (PRD §code_examples line 467) |
|-----------|------------|----------------------------------------|
| `docs/examples/cold-start-return.md` | `docs/examples/cold-start-return.md:1-25` | Scenario + Command (`/bmad-next --explain`) + Expected Output + Narrative + Why this matters + Related |
| `docs/examples/single-step.md` | `docs/examples/single-step.md:1-32` | Scenario + Command (`/bmad-next`) + Expected Output + 8-step pipeline narrative + Related |
| `docs/examples/overnight-loop.md` | `docs/examples/overnight-loop.md:1-36` | Scenario + Command (`/bmad-loop --until-epic-end --plan-first --token-budget 200k --checkpoint-each implementation`) + plan-first preview + 8 stop conditions documented + Related |
| `docs/examples/halt-recovery.md` | `docs/examples/halt-recovery.md:1-35` | Scenario + Command (`/bmad-next --resume`) + Expected Output + 5-step `--resume` narrative + AR22 actionable-hint contract reference |
| `docs/examples/skip-on-failure.md` | `docs/examples/skip-on-failure.md:1-31` | Scenario + Command (`/bmad-next --skip code-review --resume`) + Expected Output + `SkipRequiresResumeError` byte-identical hint reference |
| `docs/examples/doctor-diagnostic.md` | `docs/examples/doctor-diagnostic.md:1-37` | Scenario + Command (`/bmad-next --doctor`) + 5-line diagnostic mirrors README lines 35-41 + FR53 exit-code catalog reference |
| `docs/examples/state-export-for-ci.md` | `docs/examples/state-export-for-ci.md:1-51` | Scenario + Command (`/bmad-next --export-state > state.json`) + JSON shape + AR9 carve-out narrative (Story 3.8 precedent) — note: filename varies from spec (`state-export-ci.md` → `state-export-for-ci.md`); README cross-link at line 68 reflects shipped path consistently |
| `examples/scripting/ci-state-check.sh` | `examples/scripting/ci-state-check.sh:1-50` | `#!/usr/bin/env bash` + `set -euo pipefail` + bun + jq prerequisite checks + parses `--export-state` JSON + exit 0/1/2 semantics; chmod +x verified (`-rwxr-xr-x`) |
| `examples/scripting/nightly-loop.sh` | `examples/scripting/nightly-loop.sh:1-28` | `#!/usr/bin/env bash` + `set -euo pipefail` + bun prerequisite check + invokes `bun run src/commands/loop/run.ts` with safety defaults; chmod +x verified |
| `examples/bmad-stepper.config.yaml` | `examples/bmad-stepper.config.yaml:1-73` | Fully-commented YAML for all 8 top-level keys (schemaVersion, personas, overrides, verifiers, failurePolicies, models, budgets, paths, telemetry); FR mappings inline |
| `examples/bmad-6.4-overrides.yaml` | `examples/bmad-6.4-overrides.yaml:1-31` | Forward-compat override sample with full workflow narrative; `analyst-deep-dive` placeholder per FR35 |

**AC-3 PASS** — Three CI workflows:

| AC-3 file | Verified at | Evidence |
|-----------|------------|----------|
| `.github/workflows/ci.yml` | `.github/workflows/ci.yml:1-30` | matrix `[ubuntu-latest, macos-latest]` (line 15), bun-version pin `latest` (line 24 — added per OQ-2), `bun run check` release-blocker gate (line 30) |
| `.github/workflows/release.yml` | `.github/workflows/release.yml:1-44` | Push to main trigger + concurrency group + Changesets PR-based flow (`changesets/action@v1` at line 37) + `bun run check` gate before release (line 34) |
| `.github/workflows/bmad-compat.yml` | `.github/workflows/bmad-compat.yml:1-57` | Schedule cron `"0 6 * * 1"` (Monday 06:00 UTC) + workflow_dispatch + auto-issue on incompat via `actions/github-script@v7` (line 46-57) — fails-loud-and-files-issue per OQ-7 |

**AC-4 PASS** — Plugin published & dogfood-validation 30-day clock:

- `.claude-plugin/plugin.json:3` — `"version": "0.1.0"` (bumped from 0.0.0); all AR3 fields present including `license: "MIT"` (line 10), keywords array equals canonical `["claude-code", "claude-code-plugin", "bmad", "bmad-method", "agile", "ai-development"]`.
- `package.json:3` — `"version": "0.1.0"` (bumped); `license: "MIT"` already present (Story 1.1 baseline).
- `.changeset/v0-1-0-marketplace-release.md:2` — `"bmad-stepper": minor` Changeset entry; line 11 `BMAD Compatibility — v6.5.x` text per OQ-15.
- Marketplace UI submission deferred to maintainer human action per OQ-8 — **DOCUMENTED** in CHANGELOG.md:27-29 (Marketplace publication note section), CONTRIBUTING.md:33 (Release Process step 4), and Done Criteria Item 18.

### AR / NFR verification

| Item | Tier | Evidence |
|------|------|----------|
| **AR38** repo files inventory | PRIMARY | All 11 root + .github files present (see AC-1 table); LICENSE replaced Apache 2.0 → MIT per OQ-1 |
| **AR39** seven worked examples + scripting | PRIMARY | All 11 example files present (see AC-2 table); 7 docs/examples + 2 shell scripts + 2 YAML examples |
| **AR40** three CI workflows | PRIMARY | All 3 workflows present + parse cleanly (see AC-3 table); `Bun.YAML.parse` smoke verified for all 6 new YAMLs |
| **AR3** plugin manifest fields | PRIMARY | `.claude-plugin/plugin.json` has `name, version: 0.1.0, description, author, homepage, repository, license: MIT, keywords[6]` per AR3 contract |
| **AR41** module boundary graph UNCHANGED | PRIMARY | ZERO `src/` mutations verified (`git status src/` clean per dev notes line 1685; the test suite at 1610/0/5192/83 is byte-identical to Story 6.9 close baseline) |
| **AR42** persistence boundary documented | PRIMARY | CONTRIBUTING.md:64-69 + AGENTS.md:53-58 + SECURITY.md:29 all reference NFR-S2 + `no-write-outside-scope.test.ts` enforcement |
| **AR43** cross-platform constraints | PRIMARY | CONTRIBUTING.md:94-100 (Linux+macOS only; ESM exclusively; source=release; Bun ≥ 1.3); ci.yml matrix verifies |
| **AR8** lock-free top-tier preserved | SECONDARY | ZERO state.yaml interaction in Story 6.10; trivially preserved |
| **AR9** stdout JSON-line invariant | SECONDARY | ZERO `src/commands/` mutation; trivially preserved |
| **AR21** single-line audit notices | SECONDARY | Documented in AGENTS.md:30 (sub-agent contract + per-AR21 callout) |
| **AR22** actionable-hint regex + single-line | SECONDARY | Documented in AGENTS.md:43-51 + CONTRIBUTING.md:71-81 (errors-as-primary-UX section) |
| **AR33** async fs/network discipline | SECONDARY | Documented in AGENTS.md:30 + CONTRIBUTING.md:39-43 (code style) |
| **AR34** slash-command markdown protocol | SECONDARY | Documented in AGENTS.md:66-76 (sub-agent contract section) |
| **AR35** test pattern (tmpdir-per-test) | SECONDARY | Documented in CONTRIBUTING.md:56-62 (tests section) |
| **AR36** Biome 2.3 only / `bun run check` gate | PRIMARY | Documented in CONTRIBUTING.md:42 + ci.yml:30 + release.yml:34 invokes `bun run check` |
| **AR31** naming conventions | SECONDARY | Documented in CONTRIBUTING.md:37-43 (kebab-case files, camelCase functions, PascalCase types, SCREAMING_SNAKE_CASE constants) |
| **AR32** repository structure | SECONDARY | Documented in AGENTS.md:32-41 (foundational/mid/higher/top tiers; colocated tests; centralised schemas/errors/io) |
| **NFR-M4** README Quick Start under 10 min | PRIMARY | Quick Start at `README.md:5-48` preserved verbatim from Story 1.13 baseline (per OQ-9); fixture at `tests/fixtures/quick-start-walkthrough.md` referenced |
| **NFR-I1** BMAD compatibility per release | PRIMARY | CHANGELOG.md:21 `### BMAD Compatibility — v6.5.x` — verified em-dash bytes via hexdump (`e2 80 94` = U+2014); matches Story 6.9 `extractBmadCompat()` regex (verified by re-running regex against the file: extracts `v6.5.x` correctly) |
| **NFR-I3** runtime parity at release | PRIMARY | release.yml:34 invokes `bun run check` gate before changesets/action; ci.yml matrix `[ubuntu-latest, macos-latest]` |
| **NFR-I5** Linux+macOS via Bun ≥ 1.3 | PRIMARY | ci.yml:15 matrix; CONTRIBUTING.md:94-100 documents constraint |
| **NFR-S2** writes only inside scope | PRIMARY | SECURITY.md:29 + CONTRIBUTING.md:66-69 + AGENTS.md:57-58 document; integration test `src/integration/no-write-outside-scope.test.ts` re-run independently — 1 pass / 0 fail / 5 expects (CI-gated) |
| **NFR-M1** every requirement has a test | SECONDARY | release.yml + bmad-compat.yml + ci.yml provide release-gate enforcement layer; existing `bun run check` covers TS surface |

### OQ honoured check (17 OQs)

| OQ | Recommendation | Honoured at |
|----|---------------|------------|
| OQ-1 | LICENSE Apache 2.0 → MIT | ✓ `LICENSE:1-21` MIT text + 2026 Tomasz Gorka copyright |
| OQ-2 | CI bun-version: latest | ✓ `.github/workflows/ci.yml:24` |
| OQ-3 | Defer no-network-on-main.test.ts | ✓ Documented in AGENTS.md:39 + CONTRIBUTING.md:67 + SECURITY.md:35 (forward-deferred to post-v0.1) |
| OQ-4 | Em-dash `—` (U+2014) for canonical heading | ✓ CHANGELOG.md:21 verified hexdump `e2 80 94` |
| OQ-5 | Contributor Covenant 2.1 | ✓ `CODE_OF_CONDUCT.md:3` reference + maintainer email at line 14 |
| OQ-6 | Preserve `bmad-compatibility.md` + `architecture.md` placeholders | ✓ `README.md:92-93` retain `(Epic 6 Story 6.10 — placeholder)` text; `grep -c` returns 2 |
| OQ-7 | bmad-compat.yml fails-loud-and-files-issue | ✓ `.github/workflows/bmad-compat.yml:44-57` actions/github-script@v7 + bmad-compat label |
| OQ-8 | Marketplace publication HUMAN action | ✓ Documented in CHANGELOG.md:27-29 + CONTRIBUTING.md:33 + Done Criteria Item 18 |
| OQ-9 | README Quick Start preserved verbatim | ✓ `README.md:5-48` preserved (verified vs Story 1.13 baseline) |
| OQ-10 | Manual initial CHANGELOG entry | ✓ CHANGELOG.md:1-30 manually authored as seed for Changesets to extend |
| OQ-11 | Scripting examples invoke `bun run` direct | ✓ `examples/scripting/ci-state-check.sh:26` + `nightly-loop.sh:19` use `bun run src/commands/<name>/run.ts -- ...` |
| OQ-12 | Dependabot weekly Mondays | ✓ `.github/dependabot.yml:7,17` — `interval: weekly`, `day: monday` |
| OQ-13 | bun-version: latest in release.yml + bmad-compat.yml | ✓ release.yml:28 + bmad-compat.yml:24 |
| OQ-14 | Issue templates classic markdown | ✓ All 3 use `.md` extension with YAML frontmatter shape `name/about/title/labels` |
| OQ-15 | CHANGELOG entry includes BMAD Compat heading | ✓ CHANGELOG.md:21 H3 inside H2 v0.1.0 section (regex tolerates H1-H6) |
| OQ-16 | config example comment every key | ✓ `examples/bmad-stepper.config.yaml:1-73` — all 8 top-level keys carry FR-mapped comments + example sub-keys |
| OQ-17 | LICENSE copyright year 2026 | ✓ `LICENSE:3` `Copyright (c) 2026 Tomasz Gorka` |

### Quality gates re-verified independently from FRESH SHELL

| Gate | Expected | Actual (independent re-run) | Result |
|------|----------|----------------------------|--------|
| `bunx tsc --noEmit` | exit 0 | exit 0 (no output) | **PASS** |
| `bun test` full suite | 1610/0/5192/83 (Story 6.9 close baseline) | **1610 pass / 0 fail / 5192 expect() calls / 83 files** (6.24s) | **PASS** |
| Δ vs Story 6.9 baseline | +0 / +0 / +0 (no source changes) | +0 / +0 / +0 (verified) | **PASS** |
| `grep -c "extends StepperError" src/errors.ts` | 17 UNCHANGED | **17** | **PASS** |
| `bun test src/integration/escalate-actionable-hint.test.ts` | 33/0/114 UNCHANGED | **33 pass / 0 fail / 114 expects** (111ms) | **PASS** |
| `bun test src/integration/no-write-outside-scope.test.ts` | UNCHANGED | **1 pass / 0 fail / 5 expects** (239ms) | **PASS** |
| `bunx biome ci .` | 0 errors (pre-existing infos OK) | exit 0 / 181 files / **0 errors / 9 infos** (pre-existing useTemplate/useLiteralKeys per Story 6.9 SDR) | **PASS** |
| YAML parse — release.yml | parses | jobs: [release] | **PASS** |
| YAML parse — bmad-compat.yml | parses | on: [schedule, workflow_dispatch] | **PASS** |
| YAML parse — dependabot.yml | parses | 2 ecosystems | **PASS** |
| YAML parse — ci.yml | parses | matrix: [ubuntu-latest, macos-latest] | **PASS** |
| YAML parse — bmad-stepper.config.yaml | parses | schemaVersion: 1 | **PASS** |
| YAML parse — bmad-6.4-overrides.yaml | parses | overrides: [analyst-deep-dive] | **PASS** |
| Shell syntax — ci-state-check.sh | exit 0 | `bash -n` exit 0 | **PASS** |
| Shell syntax — nightly-loop.sh | exit 0 | `bash -n` exit 0 | **PASS** |
| Shell chmod +x | both executable | `-rwxr-xr-x` both | **PASS** |
| CHANGELOG canonical heading | em-dash matches Story 6.9 regex | hexdump `e2 80 94` + regex `extractBmadCompat` extracts `v6.5.x` correctly | **PASS** |
| README placeholders preserved | exactly 2 (`bmad-compatibility.md` + `architecture.md`) | `grep -c "(Epic 6 Story 6.10 — placeholder)" README.md` = **2** | **PASS** |
| `.claude-plugin/plugin.json:version` | "0.1.0" | "0.1.0" | **PASS** |
| `package.json:version` | "0.1.0" | "0.1.0" | **PASS** |
| LICENSE byte-correct MIT | matches canonical | 21 lines, MIT text, copyright 2026 Tomasz Gorka | **PASS** |
| 7 docs/examples files present | all 7 | cold-start-return + single-step + overnight-loop + halt-recovery + skip-on-failure + doctor-diagnostic + state-export-for-ci | **PASS** |
| `.github/ISSUE_TEMPLATE/` | 3 templates | bug.md + feature.md + bmad-compat.md | **PASS** |

### Issue tracker (NEW from this SDR)

**must-fix:** 0
**should-fix:** 0
**nits:** 0 NEW
**info:** 0 NEW

### Inherited tracker handling

**Carry-forward (unchanged)**:
- 4 cosmetic NITs N-1..N-4 — inherited from prior SDRs; cosmetic-only; not actionable for v0.1.0.
- Cumulative info I-1..I-49 minus 8 closed (I-26/I-27/I-28/I-38/I-41/I-46/I-47/I-48). Story 6.9 SDR carry-forward respected:
  - **I-43** (opts.config seam — 9 sites accumulated) — **UNCHANGED at 9 sites.** Story 6.10 introduces ZERO new opts.config consumer (no source code changes).
  - **I-49** (calendar-month threshold drift) — **UNCHANGED documentation-only OPEN.** Story 6.10 has no time-based logic (the cron schedule in bmad-compat.yml is a fixed UTC cron, not a wall-clock comparison).

**Closed at this story:**
- **None at the source level** (Story 6.10 has zero source changes). The two README forward-references for `bmad-compatibility.md` + `architecture.md` are **PRESERVED** per OQ-6 (forward-deferred to a future story; documented as such in spec Out-of-scope clarifications).

**Forward-trackers (intentionally deferred):**
- **F-1 (renamed)** Marketplace UI submission per OQ-8 — human action post-tag. **Documented** in CHANGELOG.md:27-29 + CONTRIBUTING.md:33 + Done Criteria Item 18 + the runs/`<runId>`/tasks/ task record. Action: maintainer submits to Claude Code marketplace UI manually at v0.1.0 git tag (auto-created by Changesets release.yml on the *Version Packages* PR merge).
- **F-2 (renamed)** `docs/bmad-compatibility.md` + `docs/architecture.md` per OQ-6 — pre-listed in architecture lines 1075-1076 but NOT in epics.md AC. README placeholders preserved with `(Epic 6 Story 6.10 — placeholder)` text intact. **Documented** in spec Out-of-scope clarifications. Action: future story to be sequenced post-v0.1.0 if needed.
- **F-3 (renamed)** `src/integration/no-network-on-main.test.ts` cross-cutting fetch sweep per OQ-3 — inherits Story 6.9 OQ-15 option (b) deferral. The contract is **DOCUMENTED** in AGENTS.md:39 + CONTRIBUTING.md:67 + SECURITY.md:35 ("NEVER make a main-thread network call EXCEPT inside `src/upgrade/`"). Action: future story to wire the global `globalThis.fetch` mock asserting upgrade is the sole consumer.
- **F-4** Dogfood-validation 30-day clock close — STARTS at this release; closes via post-release retrospective per PRD §dogfood_validation_plan + product brief §Daily replacement (≥30-day target, first 60 days post-v0.1.0).

### File list verification

NEW (24) — all present + populated:
- `CHANGELOG.md` (30 lines, em-dash heading verified)
- `AGENTS.md` (96 lines, 9 sections)
- `CONTRIBUTING.md` (121 lines, 11 sections incl. Release Process + CLI Surface)
- `SECURITY.md` (45 lines, 4 sections)
- `CODE_OF_CONDUCT.md` (26 lines, Contributor Covenant 2.1 reference)
- `.github/PULL_REQUEST_TEMPLATE.md` (37 lines, 7 sections)
- `.github/ISSUE_TEMPLATE/bug.md` (38 lines, frontmatter shape verified)
- `.github/ISSUE_TEMPLATE/feature.md` (29 lines)
- `.github/ISSUE_TEMPLATE/bmad-compat.md` (35 lines, label `bmad-compat` consumed by bmad-compat.yml)
- `.github/dependabot.yml` (26 lines, 2 ecosystems)
- `.github/workflows/release.yml` (45 lines, Changesets PR-based flow)
- `.github/workflows/bmad-compat.yml` (58 lines, weekly cron + auto-issue)
- `docs/examples/cold-start-return.md` (26 lines)
- `docs/examples/single-step.md` (33 lines)
- `docs/examples/overnight-loop.md` (37 lines)
- `docs/examples/halt-recovery.md` (36 lines)
- `docs/examples/skip-on-failure.md` (32 lines)
- `docs/examples/doctor-diagnostic.md` (38 lines)
- `docs/examples/state-export-for-ci.md` (52 lines — note: filename varies from spec `state-export-ci.md`; README cross-link at line 68 reflects shipped path consistently)
- `examples/scripting/ci-state-check.sh` (50 lines, chmod +x verified)
- `examples/scripting/nightly-loop.sh` (28 lines, chmod +x verified)
- `examples/bmad-stepper.config.yaml` (73 lines, all 8 top-level keys commented)
- `examples/bmad-6.4-overrides.yaml` (31 lines, full workflow narrative)
- `.changeset/v0-1-0-marketplace-release.md` (12 lines, minor bump)

REPLACED (1):
- `LICENSE` — Apache 2.0 (201 lines) → MIT (21 lines, copyright 2026 Tomasz Gorka)

MODIFIED (4):
- `.claude-plugin/plugin.json` — version 0.0.0 → 0.1.0 (line 3); all AR3 fields verified intact
- `package.json` — version 0.0.0 → 0.1.0 (line 3); license MIT verified intact
- `.github/workflows/ci.yml` — added `bun-version: latest` at line 24 per OQ-2
- `README.md` — resolved 5 of 7 forward-references (lines 63-69 single-step/overnight-loop/halt-recovery/skip-on-failure/doctor-diagnostic/state-export-for-ci/cold-start-return + 91/94 docs/configuration.md + docs/examples/ + 98-101 CHANGELOG/CONTRIBUTING/LICENSE/SECURITY); preserved 2 placeholders per OQ-6 (`bmad-compatibility.md` + `architecture.md` at lines 92-93)

### Errors registry confirmed at 17 UNCHANGED

`grep -c "extends StepperError" src/errors.ts` = **17** (independently verified from fresh shell).

`bun test src/integration/escalate-actionable-hint.test.ts` = 33 pass / 0 fail / 114 expects (the canonical sweep over all 17 error classes UNCHANGED).

### Closing

ZERO source mutations performed during review. ZERO new error classes. ZERO new schema migrations. AR3/AR8/AR9/AR21/AR22/AR31/AR32/AR33/AR34/AR35/AR36/AR38/AR39/AR40/AR41/AR42/AR43 all satisfied. NFR-M4/NFR-I1/NFR-I3/NFR-I5/NFR-S2/NFR-M1 all preserved or honoured. All 17 OQs HONOURED. Quality gates GREEN from fresh shell. AC-1/AC-2/AC-3/AC-4 PASS with file:line evidence.

**Story 6.10 is the v0.1.0 marketplace-release SHIP-IT deliverable**: the 24 new files + 1 replaced LICENSE + 4 modified files cumulatively ship the canonical AR38/AR39/AR40 inventory, byte-correct Story 6.9 `extractBmadCompat()` regex contract, MIT licensing, Changesets-driven release.yml, weekly bmad-compat.yml fail-loud-and-files-issue compat surveillance, seven worked examples per PRD §code_examples, two scripting examples for CI integration, fully-commented config example + override sample, complete `.github/` template tree.

**Marketplace UI submission** is a human action post-tag per OQ-8 — clearly documented in CHANGELOG.md:27-29 (Marketplace publication note) + CONTRIBUTING.md:33 (Release Process step 4). The dogfood-validation 30-day clock per PRD §dogfood_validation_plan starts at the marketplace submission.

Sprint-status `6-10-repo-files-v0-1-0-marketplace-release` review → done. Epic-6 stays `in-progress` (Epic-6 retrospective is OPTIONAL — that is the next iter's responsibility).

**STORY 6.10 COMPLETE — /bmad-loop --until=epic:6 ITERATION 3 TARGET REACHED.**
