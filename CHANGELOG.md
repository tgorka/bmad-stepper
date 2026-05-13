# Changelog

This file is auto-managed by [Changesets](https://github.com/changesets/changesets). For release-history entries see below.

## 0.2.0 — 2026-05-13

### BREAKING — plugin name `bmad-stepper` → `bmad`; commands appear bare in the slash picker

The plugin's `name` field in `.claude-plugin/plugin.json` (and the matching entry in `.claude-plugin/marketplace.json`) is `bmad`. The **marketplace** name remains `bmad-stepper`.

| Surface | Before (v0.1.0) | After (v0.2.0) |
|---|---|---|
| Install command (in Claude Code) | `/plugin install bmad-stepper@bmad-stepper` | `/plugin install bmad@bmad-stepper` |
| Install command (external CLI) | `claude plugin install bmad-stepper@bmad-stepper` | `claude plugin install bmad@bmad-stepper` |
| Uninstall | `/plugin uninstall bmad-stepper@bmad-stepper` | `/plugin uninstall bmad@bmad-stepper` |
| Slash-command picker | `/bmad-stepper:bmad-loop`, etc. | `/bmad-loop`, `/bmad-next`, `/bmad-doctor` (bare) |
| On-disk cache layout | `~/.claude/plugins/cache/bmad-stepper/bmad-stepper/<v>/` | `~/.claude/plugins/cache/bmad-stepper/bmad/<v>/` |

The slash-command picker shows commands bare (no prefix) because the plugin name `bmad` is a prefix of each command name (`bmad-loop`, `bmad-next`, `bmad-doctor`) — Claude Code's picker collapses the redundant namespace prefix in this case (same convention as the `bmad` plugin from `bmad-method`).

**Coexistence with `bmad@bmad-method`**: if you have both `bmad@bmad-method` (the BMAD method plugin from `bmad-code-org/bmad-method` or `tgorka/bmad-plugin`) and `bmad@bmad-stepper` (this) installed, both plugins are named `bmad`. The marketplace name distinguishes them in `~/.claude/plugins/installed_plugins.json` (the key is `<plugin>@<marketplace>`), but slash-command picker behavior with same-name plugins is environment-dependent. The Stepper detector itself reads `installed_plugins.json` and resolves `bmad@bmad-method` (the BMAD method skills) independently — the rename does not change BMAD detection. If you observe ambiguity in the slash-command picker, use the canonical `<plugin>@<marketplace>:<command>` form (e.g., `/bmad@bmad-stepper:bmad-loop`).

**Migration from v0.1.0**:

```text
/plugin uninstall bmad-stepper@bmad-stepper
/plugin marketplace update tgorka/bmad-stepper
/plugin install bmad@bmad-stepper
```

State (`_bmad-output/.stepper/`) is preserved across plugin uninstall/reinstall per the FR49 invariant — no data loss.

### BREAKING — skills migration (UX)

The three Layer-1 markdown files moved from `commands/<name>.md` (slash-command layout) to `skills/<name>/SKILL.md` (skill layout). The Claude Code slash-command picker now shows bare `/bmad-loop`, `/bmad-next`, `/bmad-doctor` with a `(bmad)` source hint instead of the prefixed `/bmad-stepper:bmad-loop` form. Matches the bmad plugin's UX.

- `/bmad-stepper:bmad-loop` no longer resolves; type `/bmad-loop`.
- Same for `/bmad-stepper:bmad-next` → `/bmad-next` and `/bmad-stepper:bmad-doctor` → `/bmad-doctor`.
- The AR9 four-step protocol (Bash → JSON line read → Task → Bash verify-and-advance) is preserved verbatim in the new SKILL.md bodies; only the engine-level `$ARGUMENTS` substitution is replaced with explicit "capture the user's flag string" instructions (Claude Code skills do not perform `$ARGUMENTS` interpolation).
- Frontmatter: `name` field added (required by the SKILL.md format), `description` carries the inline argument hint that v0.1.0 stored in `argumentHint`, `allowedTools` dropped (skills do not accept it; the body's `## Tool restrictions` prose section + Layer 2 `assertWithinScope` enforcement remain).

### Bundled fixes (35 commits since v0.1.0)

- **Marketplace BMAD detection**: stepper now detects BMAD installed via `/plugin install bmad@bmad-method` (cache layout under `~/.claude/plugins/cache/bmad-method/bmad/<version>/`) by reading `~/.claude/plugins/installed_plugins.json`. Legacy `~/.claude/plugins/bmad-method-*` spec layout still supported.
- **Auto-bootstrap & recompute**: fresh projects auto-create `state.yaml` on first `/bmad-next`; `--recompute-state` flag wired; `BmadNotInstalledError` surfaces from the dispatch path and lands in the loop transcript (`_bmad-output/.stepper/runs/<ts>-loop-exit.json`'s `stopReason.iterationMessage`).
- **Loop robustness**: halts on iter 1 when dispatch doesn't advance state (no-progress detector); `process.argv` no longer leaks into per-iter dispatch; null-persona utility steps skipped cleanly with a clean exit path for out-of-DAG state.
- **Bun-side timeout watchdog**: per-step timeout enforcement via `Promise.race` + `clearTimeout`.
- **Config & overrides**: `getStepConfig` helper, `validateOverrides` doctor check, `--no-overrides` flag.
- **Telemetry & schema**: calendar-aware rotation threshold; budget schema strict.
- **Marketplace manifest**: local `.claude-plugin/marketplace.json` shipped; `tgorka` username canonicalized.
- **CI hardening**: release-blocker gate; biome strict mode; macOS runner dropped; spy-based stdout/stderr tests skipped on Linux; cwd-in-tmpdir Linux fix.
- **Network discipline**: `src/upgrade/` is the only `fetch` consumer; integration sweep at `src/integration/no-network-on-main.test.ts` enforces it.
- **Layer-1 driver loop**: `/bmad-loop` body now drives per-iteration dispatch end-to-end (Bash → Task → Bash) instead of the v0.1 SKELETON path that emitted dispatch specs without invoking Task.
- **FILL_ME marker handling**: dispatch scans the body for `<!-- FILL_ME -->` markers; state writer emits block-style YAML for round-trip safety with interactive input collection.
- **Interactive step questions stub**: collect-input pre-flight halt for interactive BMAD steps.

### Test harness, debug observability, and on-merge CI (PRs #67–#69, #73)

- **e2e regression sweep + debug surface** (PR #67): four new `src/smoke/*.test.ts` files covering `/bmad-loop` happy path, doctor (5 cases including the new `--verbose` flag), skill invocation contract. New `STEPPER_TRACE=1` env-gated `traceLog()` helper in `src/io/log.ts` exposing per-subsystem diagnostic stream. New `docs/debugging.md` consolidating forensic surfaces (transcripts, state.yaml fields, recipes).
- **Doctor failure paths + loop StopReason matrix + skill exec contract** (PR #68): 3 new doctor cases (corrupt state, unknown flag, marketplace cache layout). New in-process `src/smoke/loop-matrix.test.ts` exercising 6 StopReason variants via `runNextOverride`. New `src/smoke/skill-executable-contract.test.ts` extracting + spawning each SKILL.md's `bun run` invocation. Fix to a pre-existing flake in `src/smoke/next.test.ts` (parent-mtime → own-prefix sibling diff).
- **Multi-iter pipeline + Layer-1 Claude harness + on-merge real-BMAD compat** (PR #69): new `src/smoke/multi-iter-pipeline.test.ts` driving the actual `runNext` → mock-Task → `runVerifyAndAdvance` dance for N iterations against a tmpdir. New `src/smoke/skill-body-structure.test.ts` (17 structural invariants). New `tests/harness/layer1-claude-sim.test.ts` + `.github/workflows/layer1-sim.yml` (opt-in Claude API harness, gated on `ANTHROPIC_API_KEY`). `.github/workflows/bmad-compat.yml` extended with `/bmad-loop --plan-first` + skill-frontmatter sweep, retriggered on push-to-main (cron dropped). `.github/workflows/ci.yml` switched to push-only (drop pull_request duplicate runs). New `docs/testing-roadmap.md`.
- **Hotfixes** (PR #73): Layer1 harness false-alarm fixed (treat empty-string env var as absent); Tier 3 phase-missing fixed (default to `"implementation"` + `optional: true` instead of throwing) — resolves issues #71, #72.

### BMAD Compatibility — v6.5.x and v6.6.x

Verified against BMAD 6.5.0.1 and 6.6.0.0; the two upstream skill catalogs are byte-identical (102 skills each). `SEED_BMAD_VERSION` bumped from `"6.5"` to `"6.6"`. Both `bmad-code-org/bmad-method` (PabloLION upstream) and `tgorka/bmad-plugin` (republishes the same `bmad-method` marketplace at v6.6.0.0) install to the same on-disk path; the detector picks the lex-max `installPath` across all entries in `installed_plugins.json`.

The `bmad-compat.yml` CI job runs on every merge to `main` (cron dropped in PR #69) and files an issue on regression.

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
- **Marketplace publication:** `/plugin marketplace add tgorka/bmad-stepper` + `--upgrade` flow that checks GitHub Releases.
- **License:** MIT (see `LICENSE`).
- **Documentation:** README + Quick Start (under 10 minutes per NFR-M4); `docs/{getting-started, configuration, exit-codes}.md`; seven worked examples in `docs/examples/`; scripting examples in `examples/scripting/`.

### BMAD Compatibility — v6.5.x

Tested against BMAD-METHOD v6.5.x (the latest stable at v0.1.0 release time). Compatible with v6.3+ (the marketplace-shipped seed; older versions may require project-level overrides via `bmad-stepper.config.yaml:overrides`).

The `--doctor` command reports any unknown skill on first run; the `overrides:` config block is the documented escape hatch for forward-compatibility.

### Marketplace publication note

The Claude Code marketplace listing at `tgorka/bmad-stepper` is submitted manually by the maintainer via the Claude Code marketplace UI at the v0.1.0 git tag (per architecture line 1566 — there is no Anthropic API for automated submission as of v0.1.0). The `release.yml` Changesets workflow automates the GitHub Release tag; the marketplace listing is the one-time human step that follows.
