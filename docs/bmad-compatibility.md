# BMAD Compatibility

This document tracks the per-release compatibility between **BMAD Stepper** and the
[BMAD Method](https://github.com/bmad-code-org/BMAD-METHOD) upstream plugin. Use it to
determine which Stepper version to install for a given BMAD installation, and to
understand how Stepper detects and enforces compatibility at runtime.

## What BMAD compatibility means for Stepper

BMAD Stepper orchestrates BMAD workflows by reading the skills installed under
`~/.claude/plugins/bmad-method-*/skills/`. The step DAG is built from a combination of:

- **Tier 1 seed** (`src/dag/seed-v6.x.ts`) — a hand-curated list of skills compiled into
  the Stepper bundle (zero IO at runtime).
- **Tier 2 overrides** (`bmad-stepper.config.yaml`) — project-level DAG mutations.
- **Tier 3 frontmatter** — live reads of `SKILL.md` files for skills absent from the seed.

A BMAD **minor release** that adds or renames skills may require a Stepper seed update.
A BMAD **patch release** that does not change the skill list is always compatible.
A BMAD **major release** may change the plugin layout contract and requires an explicit
Stepper compatibility review.

## Compatibility table

| Stepper version | Supported BMAD version range | Notes |
|-----------------|------------------------------|-------|
| v0.1.0          | v6.4+ (tested through v6.5)  | Plugin detection at `~/.claude/plugins/bmad-method-*/`. Cache layout (`~/.claude/plugins/cache/bmad-method/bmad/<version>/`) also detected automatically. Seed targets BMAD v6.5 (`SEED_BMAD_VERSION = "6.5"` in `src/dag/seed-v6.x.ts`). |

Each GitHub Release includes a `## BMAD Compatibility — vX.Y.x` section in the release
notes. The `--upgrade` flow reads this section and surfaces it in the version-check
report (see [Checking for upgrades](#checking-for-upgrades) below).

## How compatibility is checked at runtime

Compatibility checking is handled by `src/bmad-detect/` — a mid-tier module (AR41) with
two public functions:

### `detectBmadVersion(opts?)`

Resolves `~/.claude/plugins/` for directories matching `bmad-method-*`:

1. Lists `<homeDir>/.claude/plugins/` for entries starting with `"bmad-method-"`.
   - Both layout conventions are covered:
     - **Spec layout:** `~/.claude/plugins/bmad-method-<version>/`
     - **Cache layout:** `~/.claude/plugins/cache/bmad-method/bmad/<version>/`
   - `ENOENT` on the plugins root → empty candidate list.
2. If no candidates are found → throws `BmadNotInstalledError` (exit code 3).
3. Sorts candidates descending (lexicographic) and picks the highest-named entry.
4. Reads `<pluginDir>/.claude-plugin/plugin.json` and validates that `plugin.json`
   contains a string `version` field.
5. Returns the version string (e.g., `"6.5.0.1"`).

### `detectBmadSkills(opts?)`

Reads `<pluginDir>/skills/` and returns the sorted list of skill directory names.
These names are matched against the Tier 1 seed; unknown names fall through to the
Tier 3 frontmatter reader.

Both functions are called in parallel at startup:

```typescript
const [bmadVersion, skillNames] = await Promise.all([
  detectBmadVersion(opts),
  detectBmadSkills(opts),
]);
```

## What happens on incompatible or missing BMAD

Stepper produces structured errors with actionable hints on all compatibility failure
paths. Exit code 3 covers every BMAD-compat failure.

| Error class | Code | Trigger | Actionable hint |
|-------------|------|---------|-----------------|
| `BmadNotInstalledError` | `BMAD_NOT_INSTALLED` | No `bmad-method-*` directory in `~/.claude/plugins/` | `Run npx bmad-method install --tools claude-code first.` |
| `BmadIncompatibleError` | `BMAD_INCOMPATIBLE` | Installed BMAD version is outside the supported range | `Run /bmad-next --upgrade to see a Stepper version compatible with your BMAD installation.` |
| `UnknownBmadSkillError` | `UNKNOWN_BMAD_SKILL` | A required skill is absent from the BMAD install | `Run /bmad-next --list to see the candidate skills your BMAD installation registers.` |
| `DagCycleError` | `DAG_CYCLE` | A DAG cycle was introduced (e.g., by `overrides:`) | `See _bmad-output/.stepper/runs/<latest>/log.md for the cycle path; check the bmad-stepper.config.yaml dag.overrides block for circular edges.` |

The doctor command (`/bmad-next --doctor`) runs all four checks and reports the BMAD
version detected. A healthy install emits:

```text
BMAD detected: v<version> (compatible)
```

An incompatible install emits a single-line actionable hint to stderr and exits 3.

See [`docs/exit-codes.md`](exit-codes.md) for the complete FR53 exit-code catalog.

## Checking for upgrades

Run the upgrade check at any time:

```text
/bmad-next --upgrade
```

Or via the standalone CLI:

```bash
bun run upgrade
```

The upgrade flow:

1. Reads the current Stepper version from `.claude-plugin/plugin.json`.
2. Calls `https://api.github.com/repos/Tgorka/bmad-stepper/releases/latest`.
3. Compares the current version against the latest release (numeric semver tuple, not
   lexicographic — so `0.10.0 > 0.9.0` is correct).
4. Extracts the `## BMAD Compatibility — vX.Y.x` section from the release body (when
   present) and includes it in the report.
5. Prints an actionable upgrade hint when a newer version is available.

The upgrade flow is **read-only**: Stepper never auto-installs and never writes to
`~/.claude/plugins/` (NFR-S2 + AC-1). The CHANGELOG link in the report points to the
GitHub Release at `https://github.com/Tgorka/bmad-stepper/releases/tag/v<version>`.

Network failures (offline, 403 rate limit, 4xx/5xx, 10-second timeout) exit 1 with:

```text
Could not reach GitHub Releases. Check your network or try again later.
```

## Overriding the BMAD plugin path

Stepper's BMAD detector resolves the plugin directory from `os.homedir()` by default.
The `DetectBmadOptions` interface exposes a `homeDir` injection seam used by tests; in
production code, set the environment variable `HOME` (or `USERPROFILE` on Windows via
WSL) to redirect the detector to a non-standard location.

For per-project BMAD skill overrides (e.g., a custom skill not in the upstream BMAD
plugin), use `bmad-stepper.config.yaml`:

```yaml
overrides:
  my-custom-skill:
    phase: implementation
    after:
      - bmad-create-architecture
    optional: true
```

See [`docs/configuration.md`](configuration.md#overrides) for the full `overrides:`
schema reference.

## Weekly CI compatibility check

The workflow at `.github/workflows/bmad-compat.yml` runs every Monday at 06:00 UTC
(and on `workflow_dispatch`). It:

1. Checks out the Stepper repository.
2. Installs the latest BMAD Method upstream via `npx bmad-method install --tools claude-code`.
3. Runs `/bmad-next --doctor` against the latest BMAD.
4. On failure (exit code 3, or any other non-zero exit), opens a GitHub issue labelled
   `bmad-compat` and `automated` with the title
   `[BMAD-COMPAT] BMAD upstream changed; weekly compat check failed`.

If the weekly job opens an issue, the maintainer:

1. Reviews the workflow run log for the failing skill or layout change.
2. Updates `src/dag/seed-v6.x.ts` if a new BMAD skill needs to be seeded.
3. Ships a point release with a Changeset entry and a
   `## BMAD Compatibility — vX.Y.x` section in the GitHub Release notes.

## Filing a compatibility issue

Use the GitHub issue template at `.github/ISSUE_TEMPLATE/bmad-compat.md`
([direct link](https://github.com/Tgorka/bmad-stepper/issues/new?template=bmad-compat.md)):

- **Title:** `[BMAD-COMPAT] <short description>`
- **Label:** `bmad-compat`
- **Required fields:**
  - BMAD version affected (copy from `/bmad-next --doctor` output).
  - Stepper version (`bun pm pkg get version`).
  - Symptom: what `/bmad-next` reports, what `--doctor` shows.
  - Failing skill name (if a specific skill is missing or renamed).
  - Workarounds you tried (checkboxes in the template).

Before filing, check whether the issue resolves by adding the skill to
`bmad-stepper.config.yaml:overrides` per [`docs/configuration.md`](configuration.md).

## CHANGELOG compatibility entries

Each Stepper release includes a CHANGELOG entry of the form
`## BMAD Compatibility — vX.Y.x` that documents:

- Which BMAD skills were added to the seed.
- Which BMAD skills were removed or renamed in upstream.
- Any layout or manifest changes in the BMAD plugin.
- The recommended action for users upgrading BMAD independently of Stepper.

The CHANGELOG is managed by [Changesets](https://github.com/changesets/changesets);
see [`CONTRIBUTING.md`](../CONTRIBUTING.md#release-process) for the release flow.
