---
"bmad-stepper": minor
---

v0.2.0: skills migration + 35 bundled fixes since v0.1.0; BMAD 6.6.0 supported.

## BREAKING — skills migration (UX)

The three Layer-1 markdown files moved from `commands/<name>.md` (slash-command layout) to `skills/<name>/SKILL.md` (skill layout). The Claude Code slash-command picker now shows bare `/bmad-loop`, `/bmad-next`, `/bmad-doctor` with a `(bmad-stepper)` source hint instead of the prefixed `/bmad-stepper:bmad-loop` form. Matches the bmad plugin's UX.

- `/bmad-stepper:bmad-loop` no longer resolves; type `/bmad-loop`.
- Same for `/bmad-stepper:bmad-next` → `/bmad-next` and `/bmad-stepper:bmad-doctor` → `/bmad-doctor`.
- The AR9 four-step protocol (Bash → JSON line read → Task → Bash verify-and-advance) is preserved verbatim in the new SKILL.md bodies; only the engine-level `$ARGUMENTS` substitution is replaced with explicit "capture the user's flag string" instructions (Claude Code skills do not perform `$ARGUMENTS` interpolation).
- Frontmatter: `name` field added (required by the SKILL.md format), `description` carries the inline argument hint that v0.1.0 stored in `argumentHint`, `allowedTools` dropped (skills do not accept it; the body's `## Tool restrictions` prose section + Layer 2 `assertWithinScope` enforcement remain).

## Bundled fixes (35 commits since v0.1.0)

- **Marketplace BMAD detection**: stepper now detects BMAD installed via `/plugin install bmad@bmad-method` (cache layout under `~/.claude/plugins/cache/bmad-method/bmad/<version>/`) by reading `~/.claude/plugins/installed_plugins.json`. Legacy `~/.claude/plugins/bmad-method-*` spec layout still supported. The v0.1.0 README claim that both layouts were auto-detected was aspirational; v0.2.0 makes it real.
- **Auto-bootstrap & recompute**: fresh projects auto-create `state.yaml` on first `/bmad-next`; `--recompute-state` flag wired; `BmadNotInstalledError` surfaces from the dispatch path and lands in the loop transcript (`_bmad-output/.stepper/runs/<ts>-loop-exit.json`'s `stopReason.iterationMessage`).
- **Loop robustness**: halts on iter 1 when dispatch doesn't advance state (no-progress detector); `process.argv` no longer leaks into per-iter dispatch; null-persona utility steps skipped cleanly with a clean exit path for out-of-DAG state.
- **Bun-side timeout watchdog**: per-step timeout enforcement via `Promise.race` + `clearTimeout` (the runtime's `Task` tool does not accept a per-call timeout, so the watchdog enforces the cap in-process).
- **Config & overrides**: `getStepConfig` helper, `validateOverrides` doctor check, `--no-overrides` flag.
- **Telemetry & schema**: calendar-aware rotation threshold; budget schema strict.
- **Marketplace manifest**: local `.claude-plugin/marketplace.json` shipped; `tgorka` username canonicalized.
- **CI hardening**: release-blocker gate; biome strict mode; macOS runner dropped; spy-based stdout/stderr tests skipped on Linux; cwd-in-tmpdir Linux fix.
- **Network discipline**: `src/upgrade/` is the only `fetch` consumer; integration sweep at `src/integration/no-network-on-main.test.ts` enforces it.
- **Layer-1 driver loop**: `/bmad-loop` body now drives per-iteration dispatch end-to-end (Bash → Task → Bash) instead of the v0.1 SKELETON path that emitted dispatch specs without invoking Task.
- **FILL_ME marker handling**: dispatch scans the body for `<!-- FILL_ME -->` markers; state writer emits block-style YAML for round-trip safety with interactive input collection.
- **Interactive step questions stub**: collect-input pre-flight halt for interactive BMAD steps (the dispatched step is flagged `interactive: true` in the DAG; Stepper writes a questions stub at `awaitInputPath` before halting; the user fills the stub and re-invokes `/bmad-next --resume`).

## BMAD Compatibility — v6.5.x and v6.6.x

Verified against BMAD 6.5.0.1 and 6.6.0.0; the two upstream skill catalogs are byte-identical (102 skills each). `SEED_BMAD_VERSION` bumped from `"6.5"` to `"6.6"` to reflect the verification. Both `bmad-code-org/bmad-method` (PabloLION upstream) and `tgorka/bmad-plugin` (republishes the same `bmad-method` marketplace name at v6.6.0.0) install to the same on-disk path; the detector picks the lex-max `installPath` across all entries in `installed_plugins.json`.

The weekly `bmad-compat.yml` CI job continues to gate against the latest BMAD upstream; new minor releases that change the skill list still require a seed PR per `docs/bmad-compatibility.md`.
