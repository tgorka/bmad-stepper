# BMAD Stepper

BMAD Stepper is a Claude Code plugin that runs the [BMAD method](https://github.com/bmad-code-org/BMAD-METHOD) one verifiable step at a time. It is **zero-config** — `/bmad-next` works out of the box on any BMAD project — keeps **atomic state on disk** at `_bmad-output/.stepper/`, and emits **human-readable transcripts** so every advance is auditable. Built on top of BMAD-Method (`bmad@bmad-method`).

## Quick Start

> Target: from a clean machine to a green `/bmad-next --doctor` in under 10 minutes (NFR-M4).

1. **Install Bun ≥ 1.3.** Stepper runs on Bun.
   ```bash
   curl -fsSL https://bun.sh/install | bash
   # or:  brew install oven-sh/bun/bun
   bun --version   # expect: 1.3.x or newer
   ```

2. **Install BMAD.** Two equivalent options:

   **Option A — Claude Code marketplace (recommended for v0.2.0+):**
   ```text
   /plugin marketplace add bmad-code-org/bmad-method     # PabloLION upstream
   /plugin install bmad@bmad-method
   ```
   Or `tgorka/bmad-plugin` (republishes the same `bmad-method` marketplace at v6.6.0.0):
   ```text
   /plugin marketplace add tgorka/bmad-plugin
   /plugin install bmad@bmad-method
   ```

   **Option B — Legacy npx install:**
   ```bash
   npx bmad-method install --tools claude-code
   ```

   Stepper auto-detects either install method:
   - Marketplace install lands at `~/.claude/plugins/cache/bmad-method/bmad/<version>/` and is registered in `~/.claude/plugins/installed_plugins.json` (the detector reads this manifest first).
   - Legacy npx install lands at `~/.claude/plugins/bmad-method-<version>/` (the detector falls back to this scan).
   When both are present, Stepper picks the lex-max version.

3. **Add the Stepper marketplace and install the plugin.**

   In-session (inside Claude Code), from a published GitHub release:
   ```text
   /plugin marketplace add tgorka/bmad-stepper
   /plugin install bmad-stepper@bmad-stepper
   ```

   Or from a local clone (development / unreleased revisions):
   ```text
   /plugin marketplace add /path/to/bmad-stepper
   /plugin install bmad-stepper@bmad-stepper
   ```

   External CLI (outside Claude Code) — same flow via the `claude` terminal command:
   ```bash
   # Published GitHub release
   claude plugin marketplace add tgorka/bmad-stepper
   claude plugin install bmad-stepper@bmad-stepper

   # Local clone
   claude plugin marketplace add /path/to/bmad-stepper
   claude plugin install bmad-stepper@bmad-stepper
   ```

   The marketplace manifest at `.claude-plugin/marketplace.json` lists the `bmad-stepper` plugin; the plugin manifest at `.claude-plugin/plugin.json` declares the `/bmad-next`, `/bmad-doctor`, and `/bmad-loop` skills (under `skills/<name>/SKILL.md`). Type any of the bare names in the Claude Code slash-command picker — Claude Code auto-resolves them since no other plugin defines those names. v0.2.0 migrated from the v0.1.0 `commands/*.md` layout to the `skills/` layout to match the bmad plugin's UX (no visible namespace prefix).

4. **Run the diagnostic.**
   ```text
   /bmad-next --doctor
   ```
   The thin alias `/bmad-doctor` invokes the same runner.

5. **Read the expected output.** A healthy install emits these five lines on **stderr** (placeholders shown; the runner substitutes concrete values):
   ```text
   BMAD detected: v<version> (compatible)
   Project: <name>
   State file: not present (fresh project)
   Step registry: built from <N> BMAD skills + <M> project overrides; DAG validated; no cycles
   Suggestion: run /bmad-next to start the analysis phase.
   ```

6. **Verify the exit code.** `/bmad-next --doctor` exits `0` on success, `1` on corrupt state, `3` on missing or incompatible BMAD. See [`docs/exit-codes.md`](docs/exit-codes.md) for the full FR53 catalog.

   > **Note.** If you skip step 2, you don't need `--doctor` to discover it: every `/bmad-next` and `/bmad-loop` invocation surfaces the same verbatim hint (*"Run npx bmad-method install --tools claude-code first."*) on a missing-BMAD machine and exits `3`. `/bmad-loop`'s loop-exit transcript at `_bmad-output/.stepper/runs/<ts>-loop-exit.json` additionally captures the iteration's halt message under `stopReason.iterationMessage` for post-hoc inspection.

7. **(Optional) Initialize a fresh project.** Either `npx bmad-method init` or just `cd` into an empty directory. The `_bmad-output/.stepper/` directory tree is created on the first `/bmad-next` invocation; doctor itself never writes to disk.

8. **Time check.** If you reached step 7 in under 10 minutes, your install is healthy and the **NFR-M4** dogfood walkthrough is satisfied. The timed reference fixture lives at [`tests/fixtures/quick-start-walkthrough.md`](tests/fixtures/quick-start-walkthrough.md).

### State location convention

After your first `/bmad-next`, Stepper persists state under `_bmad-output/.stepper/`:

- `state.yaml` — canonical project state (atomic write + `.bak` rotation).
- `state.yaml.bak` — last-good rollback.
- `runs/<ts>-<step>.log` and `runs/<ts>-<step>.json` — per-step transcripts (human + machine readable).
- `staging/<run-id>/` — ephemeral sub-agent dispatch workspace; cleaned up after promote.
- `.lock/` — mkdir-based file lock (read-only flags including `--doctor` are lock-free).

Deeper exposition lives in [`docs/getting-started.md`](docs/getting-started.md) §State location.

## What you get

- `/bmad-next` zero-config single-step advance — see [docs/examples/single-step.md](docs/examples/single-step.md).
- `/bmad-loop` bounded loop with eight stop conditions — see [docs/examples/overnight-loop.md](docs/examples/overnight-loop.md).
- `/bmad-next --resume` after halt — see [docs/examples/halt-recovery.md](docs/examples/halt-recovery.md).
- `--auto-fix` route-to-fixer recovery — see [docs/examples/skip-on-failure.md](docs/examples/skip-on-failure.md).
- `/bmad-next --doctor` first-run diagnostic — see [docs/examples/doctor-diagnostic.md](docs/examples/doctor-diagnostic.md).
- `--export-state` for CI integration — see [docs/examples/state-export-for-ci.md](docs/examples/state-export-for-ci.md).
- `/bmad-next --resume` cold-start return — see [docs/examples/cold-start-return.md](docs/examples/cold-start-return.md).

The seven worked example bodies ship with the v0.1.0 marketplace release.

## Uninstall preserves your data

Removing the Stepper plugin **never touches your project state**. `/plugin uninstall bmad-stepper@bmad-stepper` (or `/plugin marketplace remove bmad-stepper` to remove the marketplace entirely) only deletes the cached plugin under `~/.claude/plugins/cache/`. Your `_bmad-output/.stepper/state.yaml`, `_bmad-output/.stepper/state.yaml.bak`, `_bmad-output/.stepper/runs/*.log`, `_bmad-output/.stepper/runs/*.json`, and `staging/<run-id>/` directories are untouched. You can reinstall Stepper later and resume exactly where you left off (FR49).

To wipe project state explicitly, run:

```bash
rm -rf _bmad-output/.stepper/
```

To re-create from scratch after a wipe, just run `/bmad-next` again — the state file is recomputable from disk per NFR-R3 (the `recompute.ts` subsystem reads your project files and rebuilds the cache).

## Documentation map

| Document | Purpose |
|----------|---------|
| [`docs/getting-started.md`](docs/getting-started.md) | Deeper onboarding — prerequisites, commands surface, state location, troubleshooting top-5 |
| [`docs/exit-codes.md`](docs/exit-codes.md) | Exit codes 0–5 with verbatim remediation hints (FR53) |
| [`docs/configuration.md`](docs/configuration.md) | `bmad-stepper.config.yaml` schema reference |
| [`docs/bmad-compatibility.md`](docs/bmad-compatibility.md) | Per-Stepper-release BMAD compat history |
| [`docs/architecture.md`](docs/architecture.md) | Mirror of the planning architecture |
| [`docs/examples/`](docs/examples/) | Seven worked examples (cold-start return, single-step, overnight loop, halt recovery, skip-on-failure, doctor diagnostic, state export for CI) |

## Repo links

- [`CHANGELOG.md`](CHANGELOG.md) — release history (Changesets-managed; *BMAD Compatibility — vX.Y.x* per release).
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — contribution guide.
- [`LICENSE`](LICENSE) — MIT.
- [`SECURITY.md`](SECURITY.md) — security policy.
- Issues: <https://github.com/tgorka/bmad-stepper/issues> (live once v0.1.0 ships).
- Discussions: <https://github.com/tgorka/bmad-stepper/discussions> (live once v0.1.0 ships).
