# Getting Started with BMAD Stepper

Deeper onboarding companion to the [README Quick Start](../README.md#quick-start). Read this once after your first `/bmad-next --doctor` pass; it explains prerequisites, the full commands surface, where state lives on disk, and the top-five troubleshooting paths.

## Prerequisites

- **Bun ≥ 1.3** — Stepper's runtime (AR2 / NFR-I5). Verify with `bun --version`. Versions tested through Story 1.12: 1.3.12.
- **Claude Code** — Anthropic's CLI; the host environment for the Stepper plugin (architecture §D1).
- **BMAD installed via** `npx bmad-method install --tools claude-code`. This matches the verbatim `BmadNotInstalledError` actionable hint in `src/errors.ts` and is the canonical install path. The detector handles both real-world layouts:
  - `~/.claude/plugins/cache/bmad-method/bmad/<version>/` (cache layout — what the BMAD installer actually produces in v6.x)
  - `~/.claude/plugins/bmad-method-<version>/` (spec layout — what `architecture.md` describes)
- **macOS** or **Linux** (Windows via WSL2). Per architecture line 1419 (NFR-I5).

## Installing the plugin

In-session (inside Claude Code):
```text
/plugin marketplace add tgorka/bmad-stepper
/plugin install bmad-stepper@bmad-stepper
```

External CLI (outside Claude Code) — same flow via the `claude` terminal command:
```bash
claude plugin marketplace add tgorka/bmad-stepper
claude plugin install bmad-stepper@bmad-stepper
```

For unreleased revisions, swap `tgorka/bmad-stepper` for the path to your local clone (e.g. `/path/to/bmad-stepper`). The marketplace install fetches `tgorka/bmad-stepper` to `~/.claude/plugins/cache/bmad-stepper/bmad-stepper/<version>/`. No code runs at install time — the plugin is invoked on demand via the slash commands declared in `.claude-plugin/plugin.json`.

### Common install errors

- **`BMAD_NOT_INSTALLED` (exit 3).** You skipped step 2 of the Quick Start. Run `npx bmad-method install --tools claude-code` and retry.
- **`MARKETPLACE_FETCH_FAILED`.** Anthropic CLI couldn't reach the marketplace endpoint. Check network connectivity and retry; this surface belongs to Claude Code, not Stepper.
- **`PARSE_ERROR` (exit 2).** You typed an unknown flag. See [`exit-codes.md`](exit-codes.md) §Code 2 and the slash command's `--help` (Epic 3 forward-dep).

### First-run check

Run `/bmad-next --doctor` (or the thin alias `/bmad-doctor`). A healthy install emits these five lines on **stderr**:

```text
BMAD detected: v<version> (compatible)
Project: <name>
State file: not present (fresh project)
Step registry: built from <N> BMAD skills + <M> project overrides; DAG validated; no cycles
Suggestion: run /bmad-next to start the analysis phase.
```

This block must match the README Quick Start byte-for-byte; both are reproduced from `src/commands/doctor/checks.ts` (Story 1.12). If you observe drift, file an issue.

## Commands surface

| Command | Purpose | Story / Status |
|---------|---------|----------------|
| `/bmad-next` | Advance one step (zero-config) | Epic 2 (Story 2.7) — forward-dep |
| `/bmad-next --doctor` | First-run diagnostic | Story 1.12 — DONE |
| `/bmad-doctor` | Thin alias for `/bmad-next --doctor` | Story 1.12 — DONE (architecture line 1678) |
| `/bmad-loop` | Bounded loop with stop conditions | Epic 4 (Story 4.1) — forward-dep |
| `/bmad-next --resume` | Resume after a halt | Epic 3 (Story 3.2) — forward-dep |
| `/bmad-next --list` | List candidate next steps | Epic 3 (Story 3.7) — forward-dep |
| `/bmad-next --explain` | Show reasoning trace | Epic 3 (Story 3.6) — forward-dep |
| `/bmad-next --diff-state` | Show state delta | Epic 3 (Story 3.8) — forward-dep |
| `/bmad-next --export-state` | Export state as JSON | Epic 3 (Story 3.8) — forward-dep |
| `/bmad-next --dry-run` | Preview without executing | Epic 3 (Story 3.3) — forward-dep |

The argument parser (Story 1.7) wires every flag in v0.1; rows marked `forward-dep` accept the flag at parse time but defer the runtime behavior to a later epic.

## State location

Canonical paths (per architecture line 1753):

- `_bmad-output/.stepper/state.yaml` — primary state file (Story 1.6 `loadState` / `loadStateUnlocked` / `saveState`). Schema versioned per Story 1.5 (`StateLatestSchema`).
- `_bmad-output/.stepper/state.yaml.bak` — single-slot backup. Stepper writes atomically (Story 1.3 `atomic-write.ts`) and rotates the prior version into `.bak` on each save.
- `_bmad-output/.stepper/runs/<ts>-<step>.log` — Markdown transcript per step (ships in Epic 2 Story 2.5).
- `_bmad-output/.stepper/runs/<ts>-<step>.json` — JSON run log per step (ships in Epic 2 Story 2.5).
- `staging/<run-id>/` — ephemeral sub-agent dispatch directory (Epic 2 Story 2.2; cleaned up after promote).
- `_bmad-output/.stepper/.lock/` — mkdir-based file lock (Story 1.4). The lock is process-scoped; **doctor and read-only flags do NOT acquire it** (architecture line 1672), so `--doctor` is safe to run while another step is in flight.
- `_bmad-output/.stepper/runs/` archive policy: 90-day rolling retention per NFR-Sc4 (Epic 6 Story 6.8).

## Troubleshooting top-5

Each entry quotes the verbatim `actionableHint` from `src/errors.ts`. Hints are **single-line** and start with a concrete next-action verb (Run/See/Try/Check) per AR22.

### 1. BMAD missing (`BMAD_NOT_INSTALLED`, exit 3)

```text
Run npx bmad-method install --tools claude-code first.
```

BMAD is upstream of Stepper: BMAD ships the method library (skills, agents, workflows); Stepper is the runner that advances through them one verifiable step at a time. Without BMAD installed, Stepper has nothing to dispatch.

### 2. Corrupt state (`CORRUPT_STATE`, exit 1)

```text
Run /bmad-next --recompute-state to rebuild the cache from project files.
```

Per NFR-R3, `state.yaml` is **recomputable from disk** — it is a cache, not a source of truth. The recompute command reads the project files and rebuilds the cache. The `--recompute-state` flag ships in Epic 3.

### 3. Lock contention (`LOCK_CONTENTION`, exit 4)

```text
Run /bmad-next --doctor to inspect lock state, or /bmad-next --force-unlock if you're sure no other Stepper is running.
```

Another `/bmad-next` invocation already holds the project lock. Wait for it to finish, or — if you know the prior invocation died (e.g., killed mid-run) — use `--force-unlock` to clear the stale lock dir.

### 4. DAG cycle (`DAG_CYCLE`, exit 3)

```text
See _bmad-output/.stepper/runs/<latest>/log.md for the cycle path; check the bmad-stepper.config.yaml dag.overrides block for circular edges.
```

Your `bmad-stepper.config.yaml` `dag.overrides:` block introduced a circular edge in the step graph. The full cycle path is recorded in the latest run log; remove the cycle-causing override and re-run.

### 5. Unknown skill (`UNKNOWN_BMAD_SKILL`, exit 3)

```text
Run /bmad-next --list to see the candidate skills your BMAD installation registers.
```

A `bmad-stepper.config.yaml` override references a BMAD skill that doesn't exist in your installed plugin. Check spelling, or upgrade BMAD if the skill was added in a later release.

## What's next

- [`exit-codes.md`](exit-codes.md) — full FR53 catalog of exit codes 0–5.
- `configuration.md` — `bmad-stepper.config.yaml` schema reference (Epic 6 Story 6.1 — placeholder).
- `examples/` — seven worked examples (Epic 6 Story 6.10 — placeholder).
