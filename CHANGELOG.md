# Changelog

This file is auto-managed by [Changesets](https://github.com/changesets/changesets). For release-history entries see below.

## 0.1.0 — 2026-05-06

### Initial public release

- **Two slash commands shipped:** `/bmad-next` (zero-config single-step advance, full flag inventory per FR1-FR15 + FR27-FR32 + FR41-FR42 + FR50-FR54), `/bmad-loop` (bounded loop with eight stop conditions, four failure-UX modes, SIGINT graceful exit per FR19-FR30).
- **State machine:** atomic state on disk at `_bmad-output/.stepper/state.yaml` with `.bak` rotation, file lock with PID heartbeat, branch+sha snapshot, schema-versioned + Zod-migrated. Recovery from any halt via `--resume`.
- **Sub-agent dispatch contract:** verifier-before-promote gate, declared context budget + timeout per task, `staging/<run-id>/` workspace, transcript-per-step (markdown + JSON).
- **Failure-UX modes:** retry, skip, route-to-fixer, escalate; per-step policy via `bmad-stepper.config.yaml`.
- **Configuration surface:** `bmad-stepper.config.yaml` schema with personas, overrides, verifiers, failurePolicies, models, budgets, paths, telemetry blocks.
- **Telemetry:** opt-in (`telemetry.enabled: true`); local-only; no PII; rotated at 12 months.
- **Auto-archival:** runs older than 90 days archived to `_bmad-output/.stepper/runs/.archive/`.
- **Diagnostic flags:** `--doctor`, `--upgrade`, `--explain`, `--list`, `--export-state`, `--diff-state`, `--watch`, `--plan-first`, `--recompute-state`.
- **Marketplace publication:** `/plugin marketplace add Tgorka/bmad-stepper` + `--upgrade` flow that checks GitHub Releases.
- **License:** MIT (see `LICENSE`).
- **Documentation:** README + Quick Start (under 10 minutes per NFR-M4); `docs/{getting-started, configuration, exit-codes}.md`; seven worked examples in `docs/examples/`; scripting examples in `examples/scripting/`.

### BMAD Compatibility — v6.5.x

Tested against BMAD-METHOD v6.5.x (the latest stable at v0.1.0 release time). Compatible with v6.3+ (the marketplace-shipped seed; older versions may require project-level overrides via `bmad-stepper.config.yaml:overrides`).

The `--doctor` command reports any unknown skill on first run; the `overrides:` config block is the documented escape hatch for forward-compatibility.

### Marketplace publication note

The Claude Code marketplace listing at `Tgorka/bmad-stepper` is submitted manually by the maintainer via the Claude Code marketplace UI at the v0.1.0 git tag (per architecture line 1566 — there is no Anthropic API for automated submission as of v0.1.0). The `release.yml` Changesets workflow automates the GitHub Release tag; the marketplace listing is the one-time human step that follows.
