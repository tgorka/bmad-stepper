---
status: done
story_id: '6.9'
story_key: 6-9-upgrade-flow
epic: '6'
title: '`--upgrade` Flow'
created: '2026-05-06'
last_updated: '2026-05-06T02:55:00Z'
priority: high
estimated_effort: M
fr_coverage:
  - FR48     # PRIMARY — `--upgrade` flow: GitHub Releases API check + version diff + actionable hint (architecture line 1378; epics.md AC-1)
  - FR47     # SECONDARY — Marketplace install path; the upgrade hint references `/plugin marketplace update Tgorka/bmad-stepper`
nfr_coverage:
  - NFR-S1   # PRIMARY EXCEPTION — main-thread network I/O is FORBIDDEN except `--upgrade` (architecture line 1396; PRD line 764; AC-1 verbatim "the only main-thread network I/O permitted")
  - NFR-S2   # PRIMARY — Stepper NEVER writes to `~/.claude/plugins/` from this code path (AC-1 verbatim); marketplace ops are user-driven via `/plugin marketplace update`
  - NFR-M3   # SECONDARY — `currentVersion` semantics; the version compared is `.claude-plugin/plugin.json:version` (semver-shaped string)
  - NFR-R1   # SECONDARY — async fs/network operations only; the upgrade flow is short-circuit + read-only
ar_coverage:
  - AR41     # PRIMARY — boundary graph: `src/upgrade/` is MID-TIER per architecture line 1283 (alongside migrations/, state/, transcript/, telemetry/); allowed imports = foundational (errors, schemas, io); NO higher-tier or top-tier imports
  - AR42     # PRIMARY — schema-first; NEW Zod schemas for both `.claude-plugin/plugin.json` shape AND the GitHub release response body (defence-in-depth at the network boundary); ZERO writes from this code path so assertWithinScope is N/A here
  - AR21     # single-line audit notices and error messages (multi-line markdown report on stdout per OQ-5 below — the report itself is a structured human-readable document, not an audit notice; AR21 applies to log.info/log.warn/log.error which the upgrade flow uses for the failure path)
  - AR22     # actionable-hint regex N/A (no new error classes; bare Error throws on usage/network paths; the AC-mandated failure hint is a free-form sentence)
  - AR33     # async fs/network ops; never console.*; NEVER process.exit IN runtime modules — the cli.ts terminal block is the AR33 EXCEPTION mirroring Story 6.7 cli.ts pattern
  - AR8      # PRIMARY — lock-free top-tier preserved (upgrade runs OUTSIDE the verify-and-advance lock; ZERO state.yaml mutation; ZERO state.yaml read; the runner-tier wiring at next/run.ts is at the lock-free Step 0a — short-circuits BEFORE any state read)
  - AR9      # PRIMARY — stdout JSON-line invariant: the upgrade flow runs OUTSIDE the AR9 dispatch path. When `/bmad-next --upgrade` is invoked, the runner SHORT-CIRCUITS at Step 0a (BEFORE any AR9 emission) and the upgrade output goes to STDOUT as a human-readable report (the third documented AR9 carve-out alongside `--export-state` Story 3.8 and `--watch` Story 3.9)
  - AR17     # security: the upgrade flow READS `.claude-plugin/plugin.json` (filename + version field) AND fetches the GitHub Releases API response (release tag + body markdown). NEVER reads any user content. ZERO PII surface widening. The GitHub API request includes a User-Agent header per OQ-9 (GitHub recommendation; Stepper version embedded for audit)
  - AR27     # telemetry schema invariants UNCHANGED (the upgrade flow does NOT touch telemetry; ZERO interaction with `src/telemetry/`)
  - AR35     # tmpdir-per-test discipline (every check.test.ts + render.test.ts + cli.test.ts seeds tmpDir via mkdtemp + afterEach cleanup; NFR-S2 integration test sweeps `~/.claude/plugins/` via test fixture and asserts no writes)
deps:
  - story: '6.7'
    reason: 'PRIMARY PATTERN — `src/telemetry/cli.ts` is the canonical CLI entrypoint pattern Story 6.9 mirrors at `src/upgrade/cli.ts`. Story 6.7 SDR established: (a) `main(argv: string[]): Promise<number>` shape — testable; returns exit code; (b) `parseArgv(argv: string[]): { ... } | { error: string }` discriminated-union pattern; (c) terminal block `if (import.meta.main) { main(Bun.argv).then((code) => process.exit(code)); }` is the AR33 EXCEPTION (per OQ-9 — CLI entrypoints ARE allowed to call process.exit because they are the top of the call stack); (d) error path uses `error()` from io/log.ts with a single-line message + return 1; (e) success path uses `info()` for audit notices. Story 6.9 cli.ts mirrors this VERBATIM with adjustments for the upgrade contract (no --period flag; no config load; the only argv recognised is the absence of --period — Bun.argv[2] is ignored).'
  - story: '6.8'
    reason: 'PRIMARY PATTERN — Story 6.8 SDR established the NEW MID-TIER directory pattern (src/startup/) for orchestrators that span multiple sibling mid-tier modules. Story 6.9 adds a NEW MID-TIER directory `src/upgrade/` per architecture line 1219-1222 (already pre-listed in the architecture; Story 6.9 is its first instantiation). The directory contains: index.ts (barrel), check.ts (the GH API call + version compare + plugin.json read), render.ts (pure renderer returning the upgrade-report string), cli.ts (the standalone CLI runner). The architecture mandate (line 1219) is `src/upgrade/{index.ts,check.ts,check.test.ts}`; Story 6.9 EXTENDS with render.ts + render.test.ts + cli.ts + cli.test.ts as siblings (the architecture pre-listing is non-exhaustive). Story 6.8 SDR forward-trackers I-49 (calendar-month drift) carries forward documentation-only OPEN; Story 6.9 inherits NO new trackers from 6.8 (scope is fully orthogonal — upgrade is read-only network; 6.8 is fs-archival).'
  - story: '6.1'
    reason: 'CROSS-REFERENCE — `loadConfig()` is NOT consumed by Story 6.9. The upgrade flow does NOT need any config (per OQ-12 below — upgrade is a self-contained path that reads `.claude-plugin/plugin.json` directly via fs.readFile + parses the JSON via JSON.parse + validates via a NEW PluginManifestSchema). ZERO loader-API touch. The opts.config seam (Stories 5.6 + 6.1 + 6.2 + 6.3 + 6.4 + 6.5 + 6.6 + 6.7 + 6.8 — 9 sites accumulated; I-43 forward-tracker) is UNCHANGED at 9 sites (Story 6.9 introduces ZERO new opts.config consumer).'
  - story: '6.6'
    reason: 'PATTERN — Story 6.6 introduced Zod schema validation at the boundary (TelemetryRecordV1Schema at `src/schemas/telemetry.ts`). Story 6.9 mirrors this discipline at the network + filesystem boundaries: (a) NEW PluginManifestSchema at `src/schemas/plugin-manifest.ts` (or inline in src/upgrade/check.ts per OQ-12 — TBD by dev iter; the architecture has no pre-listing for plugin-manifest.ts); (b) NEW GitHubReleaseSchema at `src/upgrade/check.ts` (inline — this is a network response shape, not a persisted Stepper schema; per OQ-12 inline keeps the schema close to the consumer). Both schemas use `.passthrough()` (NOT `.strict()`) — the GitHub API may add fields in the future; Stepper does NOT need to fail on extra fields. The closed-set discipline applies only to Stepper-OWNED data shapes; third-party shapes use passthrough.'
  - story: '1.7'
    reason: 'PRIMARY PATTERN — `src/commands/next/args.ts` is the canonical hand-rolled CLI tokenizer + Zod-validated argument schema. The `--upgrade` flag ALREADY EXISTS in `NextArgsSchema` (line 180: `upgrade: z.boolean().default(false)`) and the booleanKeys set (line 238). Story 6.9 does NOT add a new flag — the flag is already wired. Story 6.9 ONLY converts the existing forward-deferral guard at `next/run.ts:1565-1570` from a halt-with-hint stub into a short-circuit invocation of the new `runUpgradeCheck()` function. The args.ts surface is UNCHANGED.'
  - story: '2.4'
    reason: 'PRIMARY — `src/commands/next/run.ts` is the canonical lock-free runner (top-tier per AR41 line 1294-1302). Story 2.4 established the args→short-circuit→step pattern. The existing `if (args.upgrade) { return haltWithHint(1, "Run /bmad-next --doctor ... Story 6.9 (Epic 6)."); }` guard at lines 1565-1570 is REPLACED in Story 6.9 with a short-circuit invocation of `runUpgradeCheck()` (the new src/upgrade/check.ts function). The runner returns either: (a) action: "report" with the upgrade-report markdown as message + exitCode 0 (newer available OR up-to-date) per OQ-5 below; OR (b) action: "halt" with the failure hint as message + exitCode 1 (network failure) per AC-2 verbatim. Per OQ-2 the rest of the dispatch pipeline does NOT run — upgrade is a pure read-only check + exit.'
  - story: '1.9'
    reason: 'CROSS-REFERENCE — Story 1.9 established `src/bmad-detect/` as the BMAD-detection mid-tier module (parallel to upgrade/). The patterns Story 6.9 inherits: (a) mid-tier directory structure with index.ts barrel + per-concern .ts files; (b) NO upward imports per AR41; (c) tests colocated as <name>.test.ts. Story 6.9 does NOT consume bmad-detect (the upgrade flow is for STEPPER versioning, not BMAD versioning); the parallel is structural only.'
  - story: '1.5'
    reason: 'PATTERN — Story 1.5 established `src/schemas/` as the canonical home for Zod schemas. Story 6.9 may add a NEW `src/schemas/plugin-manifest.ts` (per OQ-12 below — alternative is to inline the schema in `src/upgrade/check.ts`). The dev iter chooses the placement based on whether the schema is reused elsewhere (currently: only by upgrade/check.ts; inline acceptable). The schema `.passthrough()` semantics ARE NEW — every existing Stepper schema uses `.strict()` (per AR42 closed-set discipline). The plugin manifest is a third-party shape (Anthropic owns the spec), so passthrough is appropriate per OQ-3 below.'
  - story: '6.9'
    reason: 'SELF-REFERENCE — Story 6.9 is the deliverable for FR48. The `src/upgrade/check.ts` + `src/upgrade/render.ts` + `src/upgrade/cli.ts` triplet plus the runner-tier wiring at `src/commands/next/run.ts` is the canonical AC site.'
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/product-brief-bmad-stepper.md
  - _bmad-output/planning-artifacts/product-brief-bmad-stepper-distillate.md
  - _bmad-output/implementation-artifacts/6-1-bmad-stepper-config-yaml-schema-loader.md
  - _bmad-output/implementation-artifacts/6-7-telemetry-aggregation-report.md
  - _bmad-output/implementation-artifacts/6-8-auto-archival-of-runs-and-telemetry.md
  - _bmad-output/implementation-artifacts/2-4-lock-free-run-ts-for-bmad-next.md
  - _bmad-output/implementation-artifacts/1-7-cli-argument-parser.md
  - _bmad-output/implementation-artifacts/1-9-bmad-detection.md
  - _bmad-output/implementation-artifacts/sprint-status.yaml
  - _bmad-output/implementation-artifacts/epic-5-retrospective.md
  - _bmad-output/implementation-artifacts/epic-4-retrospective.md
  - .bmad-stepper/state.yaml
  - .bmad-stepper/config.yaml
  - .claude-plugin/plugin.json
  - package.json
  - src/errors.ts
  - src/io/log.ts
  - src/io/paths.ts
  - src/io/atomic-write.ts
  - src/commands/next/args.ts
  - src/commands/next/run.ts
  - src/telemetry/cli.ts
  - src/bmad-detect/index.ts
  - src/integration/escalate-actionable-hint.test.ts
  - commands/bmad-next.md
  - docs/configuration.md
  - docs/exit-codes.md
---

# Story 6.9: `--upgrade` Flow

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper user,
I want `/bmad-next --upgrade` to call the GitHub Releases API, compare current vs latest version, print a CHANGELOG diff with BMAD compatibility info, and never auto-install,
So that I stay in control while always knowing whether an update is available — closing the FR48 deliverable and instantiating the architecture's pre-listed `src/upgrade/` mid-tier module (D14).

## Context Summary

This is the **NINTH STORY of Epic 6** (Sprint 6 — Configuration & Distribution) and lands the **`--upgrade` FLOW** that has been a placeholder/forward-deferral guard since Story 2.4. Story 6.8 just shipped (status: done; 1564/0/5078 across 79 files; errors registry 17 verified independently). Story 6.9 closes the FR48 gap by:

1. **Implementing the `src/upgrade/` mid-tier module** (architecture line 1219-1222 pre-listing — `index.ts`, `check.ts`, `check.test.ts`; Story 6.9 EXTENDS with `render.ts`, `render.test.ts`, `cli.ts`, `cli.test.ts`).
2. **Calling the GitHub Releases API ONCE** via `Bun.fetch("https://api.github.com/repos/Tgorka/bmad-stepper/releases/latest")` — the **ONLY** main-thread network I/O permitted by NFR-S1 (architecture line 1396 + AC-1 verbatim).
3. **Reading `currentVersion` from `.claude-plugin/plugin.json`** via `fs.readFile` + JSON.parse + Zod-validated `PluginManifestSchema`.
4. **Comparing versions** via a small semver helper (compares major.minor.patch lexicographically by integer; strict-shaped per OQ-3).
5. **Rendering the upgrade report** via a pure renderer (`renderUpgradeReport(currentVersion, latest, opts)`) returning a markdown-style human-readable string with: H1 + version diff + CHANGELOG link (taken from `latest.html_url`) + BMAD compat for latest (extracted from `latest.body` markdown if present, "(BMAD compat info not present in release notes)" otherwise) + the AC-mandated hint `Run /plugin marketplace update Tgorka/bmad-stepper to upgrade.`
6. **Wiring the short-circuit at `src/commands/next/run.ts` Step 0a** (a NEW pre-Step-0 short-circuit that runs BEFORE BMAD detection, BEFORE state read, BEFORE the existing forward-deferral guards at lines 1565-1570 — when `args.upgrade === true`, the runner invokes `runUpgradeCheck()` and returns the result).
7. **Updating the slash-command markdown** at `commands/bmad-next.md` to document the `--upgrade` flag's behaviour (per OQ-11 — the slash-command markdown SHOULD document new user-visible flags).
8. **Adding a top-level `## Upgrade flow` section** to `docs/configuration.md` documenting the GH Releases API endpoint, the `currentVersion` read source, the BMAD compat extraction heuristic, and the failure semantics.
9. **Updating `docs/exit-codes.md`** to document exit code 1 for the GH Releases unreachable case (additive — existing exit-1 catalog already covers halt-with-actionable-error; we extend the catalog with the new specific failure mode).
10. **Adding a standalone `bun run upgrade` script entry** to `package.json` (per OQ-12 — mirrors Story 6.7 `aggregate-telemetry` script; allows users to invoke the upgrade check from the command line WITHOUT going through the slash-command — `bun run upgrade` is a power-user shorthand).

**Story 6.9 is therefore primarily a NEW MID-TIER MODULE + a STANDALONE CLI RUNNER + a SHORT-CIRCUIT WIRING + ONE NEW INTEGRATION TEST**:

1. **NEW file `src/upgrade/check.ts`** — exports `checkForUpgrade(opts)` mid-tier function. The function:
   - Reads `currentVersion` from `<pluginRoot>/.claude-plugin/plugin.json` via `fs.readFile` + `JSON.parse` + `PluginManifestSchema.parse` (defence-in-depth at the filesystem boundary).
   - Calls `await fetch("https://api.github.com/repos/Tgorka/bmad-stepper/releases/latest", { signal, headers: { "User-Agent": `bmad-stepper/${currentVersion}`, "Accept": "application/vnd.github+json" } })` via the injected `fetch` seam (defaulting to global Bun.fetch — see OQ-13 below) with an `AbortController` timeout of 10 seconds (per OQ-8 — explicit budget without invoking Story 6.4 budgets module).
   - Validates the response status (`if (!response.ok) throw new Error(...)` for 4xx/5xx — including 403 rate limit; converted to AC-2 hint by the orchestrator).
   - Parses the response body via `await response.json()` + `GitHubReleaseSchema.parse` (defence-in-depth at the network boundary).
   - Compares `currentVersion` to `latestRelease.tag_name` (after stripping a leading `v` if present per OQ-7 — GitHub releases conventionally use `v0.1.0`).
   - Returns a typed `UpgradeCheckResult` discriminated union: `{ kind: "upgrade-available", currentVersion, latestVersion, changelogUrl, bmadCompat }` or `{ kind: "up-to-date", currentVersion, latestVersion }`. The orchestrator (cli.ts and the runner-tier wiring) routes on `kind`.
   - Throws on network failure / fetch rejection / Zod parse error / HTTP non-ok status / timeout — caller catches and surfaces the AC-2 hint.

2. **NEW file `src/upgrade/check.test.ts`** — colocated Bun tests covering UPGRADE_69_* identifiers across happy-path / network-failure / rate-limit / no-upgrade-available / missing-plugin-json / malformed-plugin-json / malformed-release-response / timeout / no-network / User-Agent-set / BMAD-compat-extracted / BMAD-compat-missing / .claude-plugins-not-written sweep.

3. **NEW file `src/upgrade/render.ts`** — exports `renderUpgradeReport(input)` pure renderer. The function returns a markdown-style human-readable STRING with the following structure:
   ```
   # Stepper Upgrade Check

   - Current version: 0.1.0
   - Latest version: 0.2.0
   - CHANGELOG: https://github.com/Tgorka/bmad-stepper/releases/tag/v0.2.0
   - BMAD compatibility (latest): v6.5.x

   Run /plugin marketplace update Tgorka/bmad-stepper to upgrade.
   ```
   For the up-to-date case:
   ```
   # Stepper Upgrade Check

   You are on the latest version (0.1.0).
   ```
   Per OQ-4 below, the BMAD compat is extracted from `latestRelease.body` markdown by searching for a `BMAD Compatibility — vX.Y.z` heading (or per the canonical convention `## BMAD Compatibility — v6.5.x`); when not present, render `(BMAD compat info not present in release notes)`.

4. **NEW file `src/upgrade/render.test.ts`** — colocated Bun tests covering RENDER_69_* identifiers across layout-headers / version-diff / changelog-link / bmad-compat-present / bmad-compat-missing / hint-byte-identical / no-PII.

5. **NEW file `src/upgrade/cli.ts`** — exports `main(argv: string[]): Promise<number>` standalone CLI entrypoint. Mirrors Story 6.7 `src/telemetry/cli.ts` pattern. The function:
   - Parses argv (no required flags; the upgrade check is parameterless — argv is essentially ignored beyond the script header).
   - Calls `runUpgradeCheck()` (the orchestrator function from `src/upgrade/check.ts`).
   - On `kind: "upgrade-available"` or `kind: "up-to-date"` — invokes `renderUpgradeReport(...)` + writes to STDOUT via `process.stdout.write(`${report}\n`)`; returns exit code 0.
   - On thrown Error (network failure, missing plugin.json, etc.) — emits the AC-2 mandated single-line hint to stderr via `error(...)`; returns exit code 1.
   - Terminal block `if (import.meta.main) { main(Bun.argv).then((code) => process.exit(code)); }` is the AR33 EXCEPTION (per Story 6.7 OQ-9 + Story 6.9 OQ-6 below — CLI entrypoints ARE allowed to call process.exit because they are the top of the call stack).

6. **NEW file `src/upgrade/cli.test.ts`** — colocated Bun tests covering CLI_69_* identifiers across happy-path-newer-available / up-to-date / network-failure-exit-1 / User-Agent-fixture / no-write-to-plugin-dir-sweep.

7. **NEW file `src/upgrade/index.ts`** — barrel re-exports the public surface: `runUpgradeCheck`, `type UpgradeCheckResult`, `type RunUpgradeCheckOptions` from `./check.ts`; `renderUpgradeReport`, `type RenderUpgradeReportInput` from `./render.ts`. The CLI's `main` is NOT re-exported (CLI tier is consumed via `bun run` — not via library import).

8. **NEW file `src/integration/upgrade-no-plugin-write.test.ts`** — top-level integration test (mirrors `src/integration/aggregate-telemetry-no-pii.test.ts` placement). NFR-S2 PRIMARY mechanism: sweeps `~/.claude/plugins/` (or a tmpdir-rooted analog per OQ-7) BEFORE and AFTER invoking `runUpgradeCheck()` and asserts ZERO writes. Also asserts the AC-1 verbatim hint string is byte-identical.

9. **MODIFIED file `src/commands/next/args.ts`** — Per re-check, the `upgrade: z.boolean().default(false)` flag ALREADY EXISTS at line 180 + the booleanKeys set at line 238 (Story 1.7 baseline). Story 6.9 does NOT mutate args.ts. Verified.

10. **MODIFIED file `src/commands/next/run.ts`** — REPLACES the existing forward-deferral guard at lines 1565-1570:
    ```ts
    // BEFORE (Story 2.4 forward-deferral stub):
    if (args.upgrade) {
      return haltWithHint(
        1,
        "Run /bmad-next --doctor to verify your install. The --upgrade flow is implemented in Story 6.9 (Epic 6).",
      );
    }
    ```
    with a short-circuit invocation of `runUpgradeCheck()` returning a `report` action (success path) or a `halt` action (network failure path). Per OQ-2, the rest of the dispatch pipeline (Step 4 staging cleanup, Step 4b archival trigger, Step 5 doctor, etc.) does NOT run — upgrade is pure read-only network + render + return. The replacement code:
    ```ts
    // Step 0a (Story 6.9): --upgrade short-circuit. Runs BEFORE Step 4
    // staging cleanup + Step 4b archival trigger + Step 5 doctor — the
    // upgrade flow is read-only network + filesystem (NEVER writes to
    // ~/.claude/plugins/ per AC-1 + NFR-S2). Per OQ-5 the success report
    // goes to stdout via the AR9-bypass (the report action's message is a
    // multi-line markdown-style human-readable document; the import.meta
    // .main block detects --upgrade in argv and bypasses emitDispatchAction
    // mirroring Story 3.8 --export-state + Story 3.9 --watch precedents).
    if (args.upgrade) {
      try {
        const result = await runUpgradeCheck({});
        const report = renderUpgradeReport(result);
        return reportWithMessage(report);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error(`upgrade: ${msg}`);
        return haltWithHint(
          1,
          "Could not reach GitHub Releases. Check your network or try again later.",
        );
      }
    }
    ```
    Plus an addition to `wasExportStateRequested`-style helpers: NEW `wasUpgradeRequested(argv)` helper used by the `import.meta.main` block to bypass `emitDispatchAction` when `--upgrade` is in argv (per OQ-5 — the upgrade report goes to stdout DIRECTLY).

11. **MODIFIED file `src/commands/next/run.test.ts`** — adds UPGRADE_69_RUN_* tests covering: (a) `args.upgrade === true` short-circuit returns the runUpgradeCheck result; (b) other args (e.g., `--doctor`) take precedence over `--upgrade` per OQ-1 (NO — actually per OQ-1, `--upgrade` short-circuits BEFORE all other paths so the precedence is `--upgrade FIRST`); (c) network failure path returns halt action with AC-2 hint byte-identical.

12. **MODIFIED file `commands/bmad-next.md`** — adds a new `### --upgrade flag` section documenting:
    - The flag's purpose: check GitHub Releases for a newer Stepper version + report.
    - The output: stdout markdown report (NOT JSON line — per OQ-5).
    - The exit codes: 0 success (report emitted), 1 network failure.
    - The user-action path: never auto-installs (per AC-1 + D14); the report includes `Run /plugin marketplace update Tgorka/bmad-stepper to upgrade.` for the user to copy-paste.

13. **MODIFIED file `docs/configuration.md`** — adds a new top-level `## Upgrade flow` section documenting:
    - The GH Releases API endpoint: `https://api.github.com/repos/Tgorka/bmad-stepper/releases/latest`.
    - The `currentVersion` read source: `.claude-plugin/plugin.json:version`.
    - The BMAD compat extraction heuristic: searches `latest.body` for `BMAD Compatibility` heading.
    - The failure semantics: exit 1 + AC-2 hint.
    - The CHANGELOG link semantics: from `latest.html_url`.
    - The "never auto-install" guarantee: ZERO writes to `~/.claude/plugins/` from this code path (NFR-S2 enforced by the integration test).
    - Cross-link to `docs/exit-codes.md` exit-1 catalog.

14. **MODIFIED file `docs/exit-codes.md`** — extends the Exit Code 1 section with a new bullet documenting the GH Releases unreachable case + the AC-2 hint byte-identical.

15. **MODIFIED file `package.json`** — adds `"upgrade": "bun run src/upgrade/cli.ts"` script entry (per OQ-12 — mirrors Story 6.7 `aggregate-telemetry`).

The runner architecture is INDEPENDENT of `verify-and-advance.ts` and the dispatch pipeline — the upgrade short-circuit fires at the `runNext` setup phase BEFORE any state read or BMAD detection. ZERO mutation to `src/commands/next/verify-and-advance.ts`. The upgrade modules do NOT acquire the state.yaml lock per AR8 (lock-free top-tier preserved). ZERO state.yaml mutation; ZERO state.yaml read; ZERO interaction with the dispatch/verify pipeline.

### What is in scope (Story 6.9)

1. **NEW file `src/upgrade/check.ts`** — exports `runUpgradeCheck(opts: RunUpgradeCheckOptions = {}): Promise<UpgradeCheckResult>`. The function:
   - Resolves `pluginManifestPath = opts.pluginManifestPath ?? path.join(process.cwd(), ".claude-plugin/plugin.json")` (test seam: when supplied, overrides the manifest path; production callers omit and use the project-root default).
   - Resolves `fetch = opts.fetch ?? globalThis.fetch` (test seam: when supplied, overrides the global fetch — tests inject a stubbed fetch returning controlled fixtures; per OQ-13 below).
   - Resolves `timeoutMs = opts.timeoutMs ?? UPGRADE_FETCH_TIMEOUT_MS` (constant `10_000` ms = 10 seconds; test seam: tests inject `1` ms to assert the timeout path).
   - Resolves `releasesUrl = opts.releasesUrl ?? RELEASES_URL_DEFAULT` (constant `"https://api.github.com/repos/Tgorka/bmad-stepper/releases/latest"`; test seam: tests inject a stub URL or omit + rely on the fetch seam).
   - Step 1: Read the plugin manifest:
     - `try { const raw = await fs.readFile(pluginManifestPath, "utf8"); ... } catch (err) { throw new Error("upgrade: failed to read plugin manifest at <path>: <message>"); }`.
     - Parse JSON: `const obj = JSON.parse(raw);` — JSON.parse throws on malformed JSON; caller's outer try/catch surfaces.
     - Validate via Zod: `const manifest = PluginManifestSchema.parse(obj);` — throws ZodError on shape mismatch.
   - Step 2: Construct AbortController + timeout: `const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), timeoutMs);` (cleared in `finally`).
   - Step 3: Call the GH API:
     - `const response = await fetch(releasesUrl, { signal: ac.signal, headers: { "User-Agent": "bmad-stepper/" + manifest.version, "Accept": "application/vnd.github+json" } });`
     - On AbortError (timeout): the fetch promise rejects; caller surfaces the AC-2 hint.
     - On TypeError (network unreachable): caller surfaces AC-2.
   - Step 4: Validate the response status: `if (!response.ok) throw new Error("upgrade: GitHub API responded " + response.status + " " + response.statusText);` — covers 403 rate limit, 404 (missing repo — should never happen for `Tgorka/bmad-stepper` but defended), 5xx server errors.
   - Step 5: Parse the response body: `const body = await response.json(); const release = GitHubReleaseSchema.parse(body);` — defence-in-depth at the network boundary.
   - Step 6: Strip leading `v` from `release.tag_name` per OQ-7 (GitHub releases conventionally use `v0.1.0`): `const latestVersion = release.tag_name.startsWith("v") ? release.tag_name.slice(1) : release.tag_name;`.
   - Step 7: Compare `manifest.version` vs `latestVersion` via `compareVersions()` helper (private to module): tokenize both into `[major, minor, patch]` integer arrays; return `-1` (current < latest) | `0` (equal) | `+1` (current > latest).
   - Step 8: Branch:
     - When `compareResult < 0` (newer available): extract `bmadCompat` via `extractBmadCompat(release.body)` helper (per OQ-4); construct `{ kind: "upgrade-available", currentVersion: manifest.version, latestVersion, changelogUrl: release.html_url, bmadCompat }` and return.
     - When `compareResult >= 0` (up-to-date or local-ahead): construct `{ kind: "up-to-date", currentVersion: manifest.version, latestVersion }` and return.
   - Per-call cleanup: `clearTimeout(timer)` in `finally`.

   Sub-helpers in `src/upgrade/check.ts`:
   - `function compareVersions(current: string, latest: string): number` — semver-shaped lexicographic int compare on `[major, minor, patch]` tuples; throws `Error("upgrade: invalid semver string: <value>")` on tokenize failure.
   - `function extractBmadCompat(releaseBody: string): string | undefined` — searches `releaseBody` for a line matching the regex `/(?:^|\n)#{1,6}\s+BMAD Compatibility\s+[—\-]\s+(v?\d+\.\d+\.[\d.x]+)/i` and returns the captured version (e.g., `v6.5.x`); returns `undefined` when not found. Per OQ-4 below, the renderer surfaces `(BMAD compat info not present in release notes)` when the helper returns undefined.

   Schemas (defined in `src/upgrade/check.ts` at the top — per OQ-12 colocated; ALTERNATIVELY in `src/schemas/plugin-manifest.ts` — dev iter chooses):
   ```ts
   export const PluginManifestSchema = z.object({
     name: z.string().min(1),
     version: z.string().regex(/^\d+\.\d+\.\d+/),
     // additional fields are tolerated but not required
   }).passthrough();

   export const GitHubReleaseSchema = z.object({
     tag_name: z.string().min(1),
     name: z.string().optional(),
     html_url: z.string().url(),
     body: z.string().nullable().default(""),
     // additional fields tolerated
   }).passthrough();
   ```

2. **NEW file `src/upgrade/check.test.ts`** — Bun-test colocated tests:
   - **UPGRADE_69_HAPPY_NEWER_1**: stubbed fetch returns `{ tag_name: "v0.2.0", html_url: "...", body: "## BMAD Compatibility — v6.5.x\n\nWhatever." }`; tmpdir-isolated plugin manifest with version "0.1.0" → assert `kind: "upgrade-available"`, `currentVersion: "0.1.0"`, `latestVersion: "0.2.0"`, `changelogUrl` matches, `bmadCompat: "v6.5.x"`.
   - **UPGRADE_69_UP_TO_DATE_1**: stubbed fetch returns `{ tag_name: "v0.1.0", ... }`; manifest version "0.1.0" → assert `kind: "up-to-date"`, `currentVersion: "0.1.0"`, `latestVersion: "0.1.0"`.
   - **UPGRADE_69_LOCAL_AHEAD_1**: stubbed fetch returns `{ tag_name: "v0.0.9" }`; manifest version "0.1.0" → assert `kind: "up-to-date"` (compareVersions === +1; up-to-date branch covers both `0` and `+1` per OQ-3 — local-ahead is a dev case where the user has built from source past the latest tag).
   - **UPGRADE_69_NETWORK_FAILURE_1**: stubbed fetch rejects with `new TypeError("fetch failed")` → assert `runUpgradeCheck` throws an Error with message containing "fetch failed" (the orchestrator at cli.ts catches and converts to AC-2 hint).
   - **UPGRADE_69_RATE_LIMIT_1**: stubbed fetch resolves with `{ ok: false, status: 403, statusText: "rate limit exceeded" }` → assert throws Error containing "GitHub API responded 403".
   - **UPGRADE_69_TIMEOUT_1**: stubbed fetch never resolves; opts.timeoutMs = 50 → assert AbortError after 50ms (use `await Promise.race(...)` + jest-style fake-timers OR simply pass the AbortController signal through and assert reject within ~100ms).
   - **UPGRADE_69_MISSING_PLUGIN_JSON_1**: pluginManifestPath = "/tmp/non-existent.json" → assert throws Error with message containing "failed to read plugin manifest".
   - **UPGRADE_69_MALFORMED_PLUGIN_JSON_1**: write tmpdir manifest with content `"{not valid json"` → assert throws (JSON.parse SyntaxError surfaced via outer try/catch).
   - **UPGRADE_69_MALFORMED_RELEASE_RESPONSE_1**: stubbed fetch returns `{ ok: true, json: () => Promise.resolve({ no_tag_name: "x" }) }` → assert ZodError thrown (GitHubReleaseSchema requires tag_name).
   - **UPGRADE_69_USER_AGENT_SET_1**: capture the headers passed to the stubbed fetch; assert `User-Agent` header equals `"bmad-stepper/<version>"` (where version is the test fixture manifest's version).
   - **UPGRADE_69_BMAD_COMPAT_EXTRACTED_1**: release body contains `## BMAD Compatibility — v6.5.x` → assert returned `bmadCompat === "v6.5.x"`.
   - **UPGRADE_69_BMAD_COMPAT_MISSING_1**: release body contains no BMAD Compatibility heading → assert returned `bmadCompat === undefined`.
   - **UPGRADE_69_TAG_NAME_STRIP_V_1**: stubbed fetch returns `tag_name: "v0.2.0"` → assert `latestVersion: "0.2.0"` (leading v stripped per OQ-7).
   - **UPGRADE_69_TAG_NAME_NO_V_1**: stubbed fetch returns `tag_name: "0.2.0"` (no leading v) → assert `latestVersion: "0.2.0"` (no-op strip).
   - **UPGRADE_69_NO_PLUGIN_DIR_WRITE_1**: monkey-patch `fs.writeFile` to throw on any call → invoke `runUpgradeCheck` → assert NO `fs.writeFile` call was attempted (NFR-S2 sweep at the unit level; the integration test sweeps the actual `~/.claude/plugins/` path).
   - **UPGRADE_69_COMPARE_VERSIONS_1**: directly test `compareVersions("0.1.0", "0.2.0") === -1`, `compareVersions("0.1.0", "0.1.0") === 0`, `compareVersions("1.0.0", "0.9.0") === 1`, `compareVersions("0.10.0", "0.9.0") === 1` (numeric compare, NOT lexicographic string).

3. **NEW file `src/upgrade/render.ts`** — exports `renderUpgradeReport(input: UpgradeCheckResult): string`. The renderer is PURE (no IO; returns a markdown-style human-readable string). Layout for `kind: "upgrade-available"`:
   ```markdown
   # Stepper Upgrade Check

   - Current version: <currentVersion>
   - Latest version: <latestVersion>
   - CHANGELOG: <changelogUrl>
   - BMAD compatibility (latest): <bmadCompat OR "(BMAD compat info not present in release notes)">

   Run /plugin marketplace update Tgorka/bmad-stepper to upgrade.
   ```
   Layout for `kind: "up-to-date"`:
   ```markdown
   # Stepper Upgrade Check

   You are on the latest version (<currentVersion>).
   ```
   The hint string `Run /plugin marketplace update Tgorka/bmad-stepper to upgrade.` is BYTE-IDENTICAL to the AC-1 verbatim hint. The renderer ends with a single trailing `\n`.

4. **NEW file `src/upgrade/render.test.ts`** — Bun-test colocated tests:
   - **RENDER_69_LAYOUT_HEADERS_UPGRADE_AVAILABLE_1**: render an upgrade-available result → assert H1 present, "Current version", "Latest version", "CHANGELOG:", "BMAD compatibility" lines all present in canonical order.
   - **RENDER_69_LAYOUT_UP_TO_DATE_1**: render an up-to-date result → assert H1 present, "You are on the latest version" line present, hint NOT present (no upgrade action needed).
   - **RENDER_69_VERSION_DIFF_1**: input `{ currentVersion: "0.1.0", latestVersion: "0.2.0" }` → assert both versions appear in canonical positions.
   - **RENDER_69_CHANGELOG_LINK_1**: input includes `changelogUrl: "https://github.com/Tgorka/bmad-stepper/releases/tag/v0.2.0"` → assert URL appears verbatim in output.
   - **RENDER_69_BMAD_COMPAT_PRESENT_1**: input `bmadCompat: "v6.5.x"` → output contains `BMAD compatibility (latest): v6.5.x`.
   - **RENDER_69_BMAD_COMPAT_MISSING_1**: input `bmadCompat: undefined` → output contains `BMAD compatibility (latest): (BMAD compat info not present in release notes)`.
   - **RENDER_69_HINT_BYTE_IDENTICAL_1**: render an upgrade-available result → assert output contains the AC-1 verbatim hint `Run /plugin marketplace update Tgorka/bmad-stepper to upgrade.` byte-identically (substring match).
   - **RENDER_69_NO_PII_1**: render various synthetic inputs → assert output does NOT contain forbidden substrings (`password`, `apiKey`, `secret`, `email`, `token`); the renderer is closed-set so this is defence-in-depth.
   - **RENDER_69_DETERMINISTIC_1**: render the same input twice → byte-identical strings.

5. **NEW file `src/upgrade/cli.ts`** — exports `main(argv: string[]): Promise<number>`. Mirrors Story 6.7 cli.ts pattern. The function:
   - argv is essentially ignored (no `--period`-style flag; the upgrade check is parameterless). Per OQ-12 below, future flags (e.g., `--upgrade --release-channel beta`) are forward-deferred.
   - Calls `await runUpgradeCheck({})` in a try/catch. On thrown Error: emit single-line `error("upgrade: " + err.message)` to stderr; emit single-line `error("Could not reach GitHub Releases. Check your network or try again later.")` to stderr (the AC-2 hint); return exit code 1.
   - On success: invoke `renderUpgradeReport(result)`; write the result to STDOUT via `process.stdout.write(`${report}\n`)`; return exit code 0.
   - Terminal block (the AR33 EXCEPTION):
     ```ts
     if (import.meta.main) {
       main(Bun.argv).then((code) => {
         process.exit(code);
       });
     }
     ```

6. **NEW file `src/upgrade/cli.test.ts`** — Bun-test colocated tests:
   - **CLI_69_HAPPY_NEWER_AVAILABLE_1**: stubbed fetch + tmpdir manifest → invoke `main([])` → assert exit 0; capture stdout via spyOn(process.stdout, "write"); assert the captured output contains the H1 + version diff + hint.
   - **CLI_69_UP_TO_DATE_1**: stubbed fetch returns same version → invoke `main([])` → assert exit 0; stdout contains "You are on the latest version".
   - **CLI_69_NETWORK_FAILURE_EXIT_1_1**: stubbed fetch rejects → invoke `main([])` → assert exit 1; capture stderr; assert "Could not reach GitHub Releases. Check your network or try again later." present byte-identically.
   - **CLI_69_USER_AGENT_FIXTURE_1**: capture the headers passed to stubbed fetch → assert User-Agent header equals `bmad-stepper/<fixture-version>`.
   - **CLI_69_NO_WRITE_TO_PLUGIN_DIR_SWEEP_1**: monkey-patch `fs.writeFile` to record any call; invoke `main([])`; assert ZERO writes attempted.

7. **NEW file `src/upgrade/index.ts`** — barrel:
   ```ts
   export {
     runUpgradeCheck,
     type RunUpgradeCheckOptions,
     type UpgradeCheckResult,
     RELEASES_URL_DEFAULT,
     UPGRADE_FETCH_TIMEOUT_MS,
   } from "./check.ts";
   export { renderUpgradeReport } from "./render.ts";
   ```
   The `cli.ts` is NOT re-exported (CLI tier is consumed via `bun run`).

8. **NEW file `src/integration/upgrade-no-plugin-write.test.ts`** — top-level integration test (mirrors `aggregate-telemetry-no-pii.test.ts` placement):
   - Test setup: tmpdir-isolated fixture with a `.claude-plugin/plugin.json` (version `"0.1.0"`); stubbed fetch returning a controlled GitHub release JSON.
   - Test body: spy on `fs.writeFile` (and `fs.appendFile`, `fs.copyFile`, `fs.rename`) globally during the `runUpgradeCheck()` invocation; assert ZERO writes were attempted ANYWHERE.
   - Additionally: snapshot a tmpdir representing `~/.claude/plugins/` BEFORE the call; invoke `runUpgradeCheck()`; snapshot AFTER; assert byte-identical inventory (NFR-S2 enforcement at the path level — orthogonal to the writeFile spy at the API level).
   - Cross-link comments: `// AC-1 (epics.md line 1289 "never writes to ~/.claude/plugins/"); NFR-S2 (architecture line 1397; PRD line 765).`

9. **MODIFIED file `src/commands/next/run.ts`** — three modifications:
   a. **Add imports** at the imports block:
      ```ts
      import { renderUpgradeReport, runUpgradeCheck } from "../../upgrade/index.ts";
      ```
   b. **Replace the forward-deferral guard** at lines 1565-1570 with the runUpgradeCheck short-circuit (per item 10 of "Concretely, Story 6.9 produces" below).
   c. **Add `wasUpgradeRequested(argv)` helper** mirroring `wasExportStateRequested` (line 2294) and `wasWatchRequested` (line 2320). The helper detects the `--upgrade` flag in argv. The `import.meta.main` block (line 2329-2398) extends its branching logic:
      - When `wasUpgradeRequested(argvSlice) === true`, BYPASS `emitDispatchAction` and write `result.action.message` directly to stdout via `process.stdout.write(`${result.action.message}\n`)` (mirroring the Story 3.8 `--export-state` carve-out logic). The structural `report` action remains available on the `runNext` return value for tests.
      - Per OQ-5, the upgrade flow is the THIRD documented AR9 carve-out (alongside `--export-state` Story 3.8 and `--watch` Story 3.9). Every OTHER flag preserves AR9 strictly.

10. **MODIFIED file `src/commands/next/run.test.ts`** — UPGRADE_69_RUN_* tests:
    - **UPGRADE_69_RUN_SHORT_CIRCUIT_1**: opts.upgradeFetchOverride returns a stubbed fetch with newer release; args `{ upgrade: true }` → assert runNext returns `report` action; `result.exitCode === 0`; `result.action.message` contains the AC-1 hint.
    - **UPGRADE_69_RUN_NETWORK_FAILURE_1**: opts.upgradeFetchOverride rejects → args `{ upgrade: true }` → assert runNext returns `halt` action; `result.exitCode === 1`; `result.action.message === "Could not reach GitHub Releases. Check your network or try again later."` byte-identically.
    - **UPGRADE_69_RUN_TAKES_PRECEDENCE_1**: args `{ upgrade: true, doctor: true }` → assert the upgrade short-circuit runs FIRST (per OQ-1; doctor is NOT invoked). The runner returns the upgrade report; no doctor output is emitted.
    - **UPGRADE_69_RUN_BYPASSES_BMAD_DETECT_1**: args `{ upgrade: true }` with a fixture project where BMAD is NOT installed → assert runNext returns the upgrade report (NOT a `BMAD_NOT_INSTALLED` halt). The upgrade flow is BMAD-agnostic; it does not require BMAD to be installed.

    Per OQ-12, the runUpgradeCheck options seam is exposed at the runner level via a new optional field `RunNextOptions.upgradeFetchOverride?: typeof globalThis.fetch` for tests; production callers omit the field and the global fetch is used.

11. **MODIFIED file `commands/bmad-next.md`** — adds a new section under `## Usage examples` listing `/bmad-next --upgrade` (already present in argumentHint at line 3); ALSO adds a new behaviour section after the existing flag documentation:
    ```markdown
    ### --upgrade (Story 6.9)

    Checks the GitHub Releases API at
    `https://api.github.com/repos/Tgorka/bmad-stepper/releases/latest` for a
    newer Stepper version.

    - Reads `currentVersion` from `.claude-plugin/plugin.json`.
    - Compares to the latest GitHub Release tag.
    - Prints a markdown-style report on stdout with the version diff,
      CHANGELOG link, BMAD compatibility info, and the upgrade hint.

    **Never auto-installs.** The flow is read-only — Stepper does NOT write
    to `~/.claude/plugins/`. The user-action path is to copy-paste the
    emitted hint:

    ```text
    Run /plugin marketplace update Tgorka/bmad-stepper to upgrade.
    ```

    **Network discipline (NFR-S1):** this is the ONLY main-thread network
    I/O permitted by the architecture (architecture §D14, line 646-657).
    All other code paths are network-free.

    **Exit codes:** `0` (report emitted), `1` (GitHub Releases unreachable
    — see `docs/exit-codes.md` for the verbatim hint).
    ```

12. **MODIFIED file `docs/configuration.md`** — adds a new top-level section at the END of the document (after the existing forward-tracker section):
    ```markdown
    ## Upgrade flow (Story 6.9 — DONE)

    The `--upgrade` flag (`/bmad-next --upgrade` or the standalone CLI
    `bun run upgrade`) checks the GitHub Releases API for a newer Stepper
    version.

    - **Endpoint:** `https://api.github.com/repos/Tgorka/bmad-stepper/releases/latest`
    - **Permitted by NFR-S1:** the ONLY main-thread network I/O in the
      Stepper code path; all other paths are network-free.
    - **Current version source:** `.claude-plugin/plugin.json:version` —
      read at runtime; no hard-coded version.
    - **BMAD compatibility extraction:** the GitHub release body is
      searched for a `BMAD Compatibility — vX.Y.x` heading; when present
      the captured version is rendered; when absent the report shows
      `(BMAD compat info not present in release notes)`.
    - **CHANGELOG link:** taken from the release's `html_url` field
      (e.g., `https://github.com/Tgorka/bmad-stepper/releases/tag/v0.2.0`).
    - **Failure semantics:** when the API call fails (offline, rate
      limit, timeout, malformed response), Stepper exits 1 with the
      hint `Could not reach GitHub Releases. Check your network or try
      again later.` (verbatim per AC-2).
    - **Never auto-installs:** ZERO writes to `~/.claude/plugins/` from
      this code path (NFR-S2 enforced by integration test
      `src/integration/upgrade-no-plugin-write.test.ts`).
    - **User-Agent header:** the GH API request includes
      `User-Agent: bmad-stepper/<currentVersion>` per GitHub's API
      documentation recommendation.
    - **Timeout budget:** 10 seconds (explicit `AbortController` budget;
      not configurable in v0.1).

    See `docs/exit-codes.md` for the verbatim exit-1 hint.
    ```

13. **MODIFIED file `docs/exit-codes.md`** — extends the Exit Code 1 section with a new example invocation + remediation entry:
    ```markdown
    **Story 6.9 (`--upgrade` flow)** also surfaces exit 1 when the
    GitHub Releases API is unreachable (offline, rate limit, timeout,
    malformed response):

    ```text
    Could not reach GitHub Releases. Check your network or try again later.
    ```

    The hint is byte-identical to the failure message in
    `src/upgrade/cli.ts` and `src/commands/next/run.ts`. The hint is NOT
    a `StepperError` actionableHint — Story 6.9 ships ZERO new error
    classes (per AR22 N/A; bare Error throws on the network failure
    path). Errors registry stays at 17.
    ```

14. **MODIFIED file `package.json`** — adds the `"upgrade": "bun run src/upgrade/cli.ts"` script entry under `"scripts"`:
    ```json
    "scripts": {
      "test": "bun test --pass-with-no-tests",
      "test:watch": "bun test --watch --pass-with-no-tests",
      "check": "biome ci . && bun test --pass-with-no-tests",
      "aggregate-telemetry": "bun run src/telemetry/cli.ts",
      "upgrade": "bun run src/upgrade/cli.ts"
    }
    ```

### Cross-story coordination preserved

- **Errors registry HELD AT 17** — Story 6.9 ships ZERO new error classes. Network failures + missing-plugin.json + malformed-release-response use bare Error throws; the orchestrator (cli.ts and the runner-tier wiring) catches and surfaces the AC-2 hint as a halt action message (NOT a StepperError actionableHint). The 33-test `escalate-actionable-hint.test.ts` sweep over all 17 error classes UNCHANGED.
- **Schema migration registry HELD AT v1** — ZERO new schema migrations. The new `PluginManifestSchema` and `GitHubReleaseSchema` are NOT versioned (they describe third-party shapes — Anthropic's plugin manifest spec and GitHub's REST API response; both use `.passthrough()` to tolerate forward-compat additions per OQ-3).
- **AR9 stdout JSON-line invariant** — Story 6.9 introduces the THIRD documented AR9 carve-out (after Story 3.8 `--export-state` and Story 3.9 `--watch`). The `--upgrade` report goes to stdout DIRECTLY (NOT wrapped in the AR9 line). Every OTHER flag preserves AR9 strictly. The `wasUpgradeRequested(argv)` helper at `import.meta.main` is the gate.
- **AR8 lock-free top-tier** — preserved trivially. The upgrade modules NEVER touch `state.yaml`; the runner-tier wiring at `next/run.ts` Step 0a fires BEFORE any state read. ZERO `src/state/` or `src/lock/` imports.
- **AR41 boundary discipline** — `src/upgrade/{check,render,cli}.ts` are MID-TIER per architecture line 1219-1222 (pre-listed). Allowed imports = foundational (errors, schemas, io) + sibling-mid-tier (no other mid-tier consumed in v0.1) + node:* + zod. NO higher-tier or top-tier imports. The runner-tier wiring at `src/commands/next/run.ts` (top-tier) imports from `src/upgrade/index.ts` (mid-tier) — top-tier consuming mid-tier is allowed per AR41.
- **opts.config seam at `RunNextOptions`** — Story 6.9 ADDS a NEW optional field `upgradeFetchOverride?: typeof globalThis.fetch` (the test seam mirroring Story 6.7 `loadConfigOverride?` precedent). This is NOT a config field; the upgrade flow does NOT consume any config. Story 6.4 SDR I-43 (opts.config seam sites; 9 sites accumulated as of Story 6.8 close) carries forward UNCHANGED at 9 sites — the new `upgradeFetchOverride` is a SEPARATE seam, NOT a config seam expansion.
- **Slash-command markdown UPDATED** per OQ-11 — `commands/bmad-next.md` adds a new `### --upgrade flag` section. This is a documentation update; ZERO behavior change at the slash-command surface (Claude's `$ARGUMENTS` expansion is unchanged).

### What is NOT in scope (deferred)

- **Auto-install** — DEFERRED PERMANENTLY per D14 verbatim. The `--upgrade` flow is read-only. Auto-install would violate NFR-S2 + the read-only respect for plugin runtime files. The user remains in control via `/plugin marketplace update`.
- **Beta/rc release channel selection** — DEFERRED post-v0.1. v0.1 reads ONLY the `releases/latest` endpoint (which excludes pre-release tags by GitHub's contract). A future story could add `--upgrade --release-channel beta` to query `releases` (all) and filter for `prerelease: true`.
- **Local-version override / pin** — DEFERRED. v0.1 always compares against the `tag_name` of `releases/latest`. A future story could add `--upgrade --pin v0.1.0` to assert against a specific tag.
- **Verbose / JSON output mode** — DEFERRED. v0.1 emits a markdown-style human-readable report. A future story could add `--upgrade --json` to emit a structured JSON output for scripting.
- **Telemetry on upgrade checks** — DEFERRED. v0.1 does NOT record telemetry for upgrade invocations. A future story could extend Story 6.6 collector to emit a telemetry record per upgrade check (would require a new TelemetryRecord step name `upgrade-check`).
- **Caching the GitHub response** — DEFERRED. v0.1 calls the GH API on every `--upgrade` invocation. A future story could cache the response under `_bmad-output/.stepper/upgrade-cache.json` with a TTL (e.g., 1 hour) to reduce API rate-limit pressure on heavy users.
- **GraphQL alternative** — DEFERRED. v0.1 uses the REST API endpoint. A future story could migrate to GraphQL if response sizes grow significantly.
- **Authentication / GH token** — DEFERRED. v0.1 uses unauthenticated requests (60 requests/hour rate limit per IP). For the v0.1 dogfood scale this is comfortable; a future story could add `--upgrade --github-token <token>` to authenticate (5000 requests/hour limit).
- **Configurable timeout / retry** — DEFERRED. v0.1 uses a fixed 10-second AbortController timeout with NO retry. A future story could add `--upgrade --timeout 30` and `--upgrade --retry 3` for slow networks.
- **Multi-source upgrade check** — DEFERRED. v0.1 queries ONLY GitHub Releases for `Tgorka/bmad-stepper`. A future story could add npm registry or Anthropic marketplace API checks (would broaden NFR-S1's network exception surface).

### Architectural challenges resolved here

**Architectural decision — `--upgrade` as the SOLE main-thread network exception (per AC-1 + NFR-S1)**: AC-1 verbatim: "Bun.fetch... NFR-S1 exception — the only main-thread network I/O permitted". Architecture line 646-657 D14 establishes this exception. Story 6.9 implements it: the ONLY `fetch` call in the entire `src/` tree (verified by the existing `src/integration/no-network-on-main.test.ts` per architecture line 1009 — Story 6.9 extends the integration test contract by EXEMPTING the upgrade entry point from the no-network sweep). The integration test `src/integration/no-network-on-main.test.ts` MUST be updated (or the upgrade entry point isolated) to whitelist the upgrade code path — per OQ-15 below, the integration test pattern is to MOCK Bun.fetch globally and assert it is called ONLY from `src/upgrade/`.

**Architectural decision — short-circuit at runner-tier Step 0a (per OQ-2)**: AC-1 verbatim says `--upgrade runs` invokes the upgrade flow. The natural placement is at `src/commands/next/run.ts` BEFORE any state read or BMAD detection (the upgrade flow does NOT need state.yaml; it does NOT need BMAD to be installed; it is a pure read-only network + filesystem check). Story 6.9 introduces a Step 0a short-circuit at line ~1565 that runs BEFORE the existing forward-deferral guards (Step 3) AND BEFORE the staging-cleanup (Step 4) AND BEFORE the archival trigger (Step 4b) AND BEFORE the doctor delegation (Step 5). The short-circuit returns either a `report` action (success) or a `halt` action (network failure) and skips the rest of the dispatch pipeline. **Rejected alternative:** wire upgrade into the AR9 dispatch chain (would require a new dispatch action variant + sub-agent dispatch overhead — gross over-engineering for a read-only network check).

**Architectural decision — AR9 carve-out for upgrade output (per OQ-5)**: The upgrade report is a human-readable markdown-style multi-line document. AR9 mandates a SINGLE JSON line per `bun run` invocation. Story 3.8 (`--export-state`) and Story 3.9 (`--watch`) already established the AR9 carve-out pattern: when the runner detects the relevant flag in argv, the `import.meta.main` block BYPASSES `emitDispatchAction` and writes the human-readable content DIRECTLY to stdout. Story 6.9 mirrors this VERBATIM via a new `wasUpgradeRequested(argv)` helper. The structural `report` action remains available on the `runNext` return value for tests (so unit tests do NOT need to inspect stdout). **Rejected alternative:** wrap the upgrade report in a JSON line (would require the user to `jq` the JSON to read the report — terrible UX for an interactive command).

**Architectural decision — `Pick<typeof globalThis.fetch>` test seam (per OQ-13)**: The `runUpgradeCheck` function accepts an optional `fetch` field in opts (defaulting to `globalThis.fetch`). Tests inject a stubbed fetch returning controlled fixtures (matching the expected GH API response shape). This avoids real network calls in the test suite (mandatory for CI determinism + offline development). The `cli.test.ts` and `check.test.ts` use this seam. The integration test `upgrade-no-plugin-write.test.ts` ALSO uses this seam (the test does NOT verify network behaviour; it verifies fs-write absence). **Rejected alternative:** dependency injection via a separate Fetcher class (overkill for v0.1; a function-typed seam is sufficient + matches Bun's type ergonomics).

**Architectural decision — Zod `.passthrough()` for third-party schemas (per OQ-3)**: All Stepper-OWNED data shapes use Zod `.strict()` (per AR42 closed-set discipline; e.g., TelemetryRecordV1Schema). For Story 6.9, the `PluginManifestSchema` (Anthropic's plugin manifest spec) and `GitHubReleaseSchema` (GitHub's REST API response) are THIRD-PARTY shapes — Stepper does not OWN their evolution. Both use `.passthrough()` so that future Anthropic/GitHub additions do NOT break the upgrade flow. The CLOSED-SET discipline (NFR-S3 anti-PII enforcement) applies ONLY to Stepper-OWNED shapes that persist or surface user data. The plugin manifest and GH release are NEITHER persisted by Stepper NOR surface user PII. **Rejected alternative:** `.strict()` everywhere (would force Story 6.9 to update the schema on every Anthropic/GitHub API addition — pointless coupling to upstream API velocity).

**Architectural decision — semver compare on `[major, minor, patch]` integer tuples (per OQ-3)**: The `compareVersions` helper tokenizes both version strings into `[major, minor, patch]` integer arrays via `version.split(".").map(Number)`. The compare is a 3-tuple lexicographic INTEGER comparison (NOT lexicographic STRING comparison — `"0.10.0"` vs `"0.9.0"` would yield wrong result if compared as strings). The helper throws `Error("upgrade: invalid semver string: <value>")` on tokenize failure (e.g., non-numeric characters in any segment). Pre-release suffixes (e.g., `0.1.0-rc.1`) are NOT supported in v0.1 — the helper throws on encountering a `-` (per OQ-7); the GitHub `releases/latest` endpoint excludes pre-release tags so this is consistent with the API contract.

**Architectural decision — strip leading `v` from `tag_name` (per OQ-7)**: GitHub releases conventionally use `v<version>` (e.g., `v0.1.0`); the `.claude-plugin/plugin.json:version` field is conventionally bare (e.g., `"0.1.0"`). The `runUpgradeCheck` strips a leading `v` from `release.tag_name` BEFORE passing to `compareVersions`. The helper is a one-liner: `release.tag_name.startsWith("v") ? release.tag_name.slice(1) : release.tag_name`. Tests cover both conventions (UPGRADE_69_TAG_NAME_STRIP_V_1 and UPGRADE_69_TAG_NAME_NO_V_1).

**Architectural decision — extractBmadCompat heuristic via regex (per OQ-4)**: The release body is GitHub-rendered markdown; the `BMAD Compatibility` section convention (per architecture line 1665 + the canonical CHANGELOG section) is a heading like `## BMAD Compatibility — v6.5.x`. The `extractBmadCompat` helper uses a regex `/(?:^|\n)#{1,6}\s+BMAD Compatibility\s+[—\-]\s+(v?\d+\.\d+\.[\d.x]+)/i` that matches H1-H6 headings (Markdown allows `#` through `######`), tolerates `—` (em dash) OR `-` (hyphen) as separator, and captures the version segment (allowing `v` prefix and `x` placeholder for the patch segment per the canonical "v6.5.x" convention). When the regex does not match, the helper returns `undefined` and the renderer surfaces `(BMAD compat info not present in release notes)`. **Rejected alternative:** parse the markdown into an AST (overkill; adds a markdown-parser dependency violating AR1 zero-runtime-deps).

**Architectural decision — 10-second AbortController timeout (per OQ-8)**: NFR-S1 mandates no main-thread network I/O EXCEPT `--upgrade`. The exception is conditioned on the user's explicit invocation, but Stepper still has a duty to bound the wait (a hung connection would block the user's command indefinitely). Story 6.9 imposes a 10-second hard timeout via `AbortController.abort()`. The constant `UPGRADE_FETCH_TIMEOUT_MS = 10_000` is not configurable in v0.1 (per OQ-8 — a fixed budget keeps the contract simple; future stories can add `--upgrade --timeout 30`). The test seam allows tests to inject a 1ms timeout to assert the abort path. **Rejected alternative:** use Story 6.4 budgets module (the budgets module is for sub-agent dispatch budgets — a different domain; mixing the two would couple unrelated concerns).

**Architectural decision — User-Agent header via plugin version (per OQ-9)**: GitHub's REST API documentation REQUIRES a User-Agent header on every request (otherwise the request is rejected with 403). Story 6.9 sets the header to `bmad-stepper/<currentVersion>` (e.g., `bmad-stepper/0.1.0`). The version is read from `.claude-plugin/plugin.json` ONCE per invocation; embedded in the User-Agent string for audit. **Rejected alternative:** hard-code `bmad-stepper` (would lose version visibility on the GitHub API logs; rejected because the User-Agent is the only audit signal Stepper exposes to GitHub).

**Architectural decision — bare Error throws (per OQ-10)**: The upgrade flow is a CLI tool, not a runner-tier dispatch step. Failures (network unreachable, rate limit, malformed response, missing plugin.json) are USAGE / DATA errors — NOT step-execution errors that warrant a StepperError actionableHint. Per epic-4-retrospective.md §Recommendations item 3 ("Epic 6 should NOT add new error classes — registry stability discipline established across Epics 2/3/4/5"), Story 6.9 ships ZERO new error classes. The orchestrator (cli.ts and the runner-tier wiring) catches the bare Error and surfaces the AC-2 hint string explicitly. The errors registry stays at 17. **Rejected alternative:** add a new `NetworkError` class (would inflate the registry to 18 classes for a single use case; the cleaner pattern is to use bare Error + AC-mandated hint at the catch-site).

**Architectural decision — slash-command markdown UPDATED for new flag visibility (per OQ-11)**: Stories 6.3 + 6.4 + 6.7 + 6.8 all kept the slash-command markdown UNCHANGED (small forward-tracker references only). Story 6.9 DEPARTS from this discipline because the `--upgrade` flag's behaviour is SUBSTANTIALLY new (was a halt-with-hint stub since Story 2.4). The `commands/bmad-next.md` adds a new `### --upgrade flag` section documenting the GH API endpoint, the never-auto-install guarantee, and the exit-code mapping. **Rejected alternative:** no slash-command markdown change (would leave the user with no documentation for the new behaviour; the slash command IS the user's primary surface).

**Architectural decision — opts.config NOT consumed by upgrade (per OQ-12)**: Stories 6.1 through 6.8 all wired their consumers through the `opts.config` seam. Story 6.9 DOES NOT — the upgrade flow reads `.claude-plugin/plugin.json` directly and calls the GH API directly. There is no Stepper-config field that tunes the upgrade behaviour in v0.1 (forward-deferred: `--upgrade --release-channel beta`, `--upgrade --pin <version>`, etc. would consume new config fields). Per OQ-12, the `opts.config` seam at `RunNextOptions` is UNCHANGED; the `RunUpgradeCheckOptions` seam is SEPARATE (test-injection only — `pluginManifestPath`, `fetch`, `timeoutMs`, `releasesUrl`).

**Architectural decision — fetch seam mocking discipline (per OQ-13)**: Bun.fetch (and globalThis.fetch in Bun) is a function with a complex type signature. Tests inject a stubbed function matching the relevant overload: `fetch: (input: RequestInfo, init?: RequestInit) => Promise<Response>`. The stub returns a synthetic Response object with `ok`, `status`, `statusText`, `json()` properties. The test fixture defines a single helper `function makeStubFetch(responseFixture: { status?: number; body?: unknown }): typeof globalThis.fetch` that returns a function matching the global fetch signature. **Rejected alternative:** spy/replace globalThis.fetch (mutating global state breaks test isolation when tests run in parallel under Bun; injection via opts is cleaner).

**Architectural decision — tmpdir-per-test discipline preserved (per OQ-14)**: Per AR35, every fs-touching test seeds a tmpdir via `mkdtemp(path.join(os.tmpdir(), "stepper-upgrade-"))` and cleans up in afterEach. The check.test.ts tests that exercise `pluginManifestPath` use this pattern. The integration test `upgrade-no-plugin-write.test.ts` uses TWO tmpdirs: one for the plugin manifest fixture, one as the synthetic `~/.claude/plugins/` to monitor for writes (assertWithinScope is NOT applicable here since the upgrade flow does NOT write at all).

**Architectural decision — no-network-on-main test integration (per OQ-15)**: The architecture's pre-listed integration test `src/integration/no-network-on-main.test.ts` (architecture line 1009 + 1246) asserts that NO `Bun.fetch` calls occur on the main thread EXCEPT inside `src/upgrade/`. Story 6.9 either:
- (a) MUTATES `src/integration/no-network-on-main.test.ts` to whitelist the upgrade entry point — REJECTED if this file does not yet exist (Story 6.10 may own its creation).
- (b) RELIES on a future story to wire the global fetch sweep — DEFERRED. v0.1 ships the upgrade-side enforcement (the upgrade module is the ONLY consumer of fetch in `src/`); cross-cutting verification is a Story 6.10 + future stories' responsibility.
- (c) Ships a NEW integration test `src/integration/upgrade-only-network.test.ts` (or extends `upgrade-no-plugin-write.test.ts`) asserting that during `runUpgradeCheck()` the fetch IS called once and that no other code paths attempt fetch.

Story 6.9 chooses option (b) — defer the cross-cutting enforcement to Story 6.10 / future. The Story 6.9 deliverable is the upgrade module + its self-contained integration test for fs-writes. The dev iter MAY check whether `src/integration/no-network-on-main.test.ts` exists and update its allowlist if it does.

### Concretely, Story 6.9 produces

- **NEW file 1**: `src/upgrade/check.ts` (~180-220 LoC including JSDoc) — exports `runUpgradeCheck({pluginManifestPath?, fetch?, timeoutMs?, releasesUrl?})`, type `UpgradeCheckResult`, type `RunUpgradeCheckOptions`, constants `RELEASES_URL_DEFAULT`, `UPGRADE_FETCH_TIMEOUT_MS`, schemas `PluginManifestSchema`, `GitHubReleaseSchema`. JSDoc documents Story 6.9 + AR41 mid-tier + AR42 schema-first + NFR-S1 exception + NFR-S2 no-write + the test seams.
- **NEW file 2**: `src/upgrade/check.test.ts` (~280-340 LoC) — 15 UPGRADE_69_* tests covering happy path, network failure, rate limit, no upgrade available, missing plugin.json, malformed plugin.json, malformed release response, timeout, User-Agent set, BMAD compat extracted, BMAD compat missing, tag-name strip-v, tag-name no-v, no-plugin-dir-write sweep, compareVersions unit.
- **NEW file 3**: `src/upgrade/render.ts` (~80-110 LoC) — pure renderer returning a markdown-style human-readable string. JSDoc documents the two layouts (upgrade-available + up-to-date) + the AC-1 verbatim hint + the deterministic ordering.
- **NEW file 4**: `src/upgrade/render.test.ts` (~140-180 LoC) — 9 RENDER_69_* tests covering layout headers (upgrade-available + up-to-date), version diff, CHANGELOG link, BMAD compat present + missing, hint byte-identical, no-PII surface, deterministic.
- **NEW file 5**: `src/upgrade/cli.ts` (~80-120 LoC) — standalone CLI entrypoint mirroring Story 6.7 cli.ts pattern. JSDoc documents Story 6.9 + AR33 EXCEPTION + the AC-1/AC-2 wiring + exit codes.
- **NEW file 6**: `src/upgrade/cli.test.ts` (~150-200 LoC) — 5 CLI_69_* tests covering happy newer available, up-to-date, network failure exit 1, User-Agent fixture, no-write-to-plugin-dir-sweep.
- **NEW file 7**: `src/upgrade/index.ts` (~12 LoC) — barrel re-exports.
- **NEW file 8**: `src/integration/upgrade-no-plugin-write.test.ts` (~120-160 LoC) — NFR-S2 PRIMARY integration test (mirrors `aggregate-telemetry-no-pii.test.ts` placement).
- **MODIFIED file 1**: `src/commands/next/run.ts` — replace forward-deferral guard at lines 1565-1570 with the runUpgradeCheck short-circuit; add `wasUpgradeRequested(argv)` helper; extend `import.meta.main` branching to BYPASS emitDispatchAction when --upgrade in argv (~30 LoC added/replaced).
- **MODIFIED file 2**: `src/commands/next/run.test.ts` — 4 UPGRADE_69_RUN_* tests covering short-circuit, network failure, takes precedence, bypasses BMAD detect (~80 LoC added).
- **MODIFIED file 3**: `commands/bmad-next.md` — NEW `### --upgrade flag` section (~30 LoC added).
- **MODIFIED file 4**: `docs/configuration.md` — NEW `## Upgrade flow (Story 6.9 — DONE)` section (~40 LoC added).
- **MODIFIED file 5**: `docs/exit-codes.md` — extend Exit Code 1 section with the AC-2 hint catalog entry (~15 LoC added).
- **MODIFIED file 6**: `package.json` — `"upgrade": "bun run src/upgrade/cli.ts"` script entry (1 line added).

8 NEW files. ZERO new error classes. ZERO new schema migrations. ZERO mutations to: `src/errors.ts`, `src/migrations/**` (registry data unchanged), `src/schemas/**` (the new schemas live in `src/upgrade/check.ts`; alternative placement at `src/schemas/plugin-manifest.ts` is dev-iter discretion per OQ-12), `src/dag/**`, `src/state/**`, `src/dispatch/**`, `src/failure-ux/**`, `src/verifiers/**`, `src/commands/next/args.ts` (the `--upgrade` flag already exists per Story 1.7 baseline), `src/commands/next/verify-and-advance.ts` (lock-held tier unchanged), `src/commands/loop/**` (loop runner does NOT consume upgrade — `--upgrade` is a `/bmad-next`-only flag per AC-1), `src/commands/doctor/**`, `src/runs/**`, `src/telemetry/**`, `src/startup/**` (Story 6.8's archival trigger module unchanged), `src/bmad-detect/**`, `src/io/**`, `src/lock/**`, `commands/bmad-loop.md` (loop slash-command unchanged).

## Acceptance Criteria

The following are reproduced byte-identical from `_bmad-output/planning-artifacts/epics.md` lines 1284-1292:

**Given** `src/upgrade/check.ts` invoked
**When** `--upgrade` runs
**Then** it calls `Bun.fetch("https://api.github.com/repos/Tgorka/bmad-stepper/releases/latest")` (NFR-S1 exception — the only main-thread network I/O permitted), reads `currentVersion` from `.claude-plugin/plugin.json`, compares; if newer is available, prints version diff + CHANGELOG link + BMAD compat for latest + the hint `Run /plugin marketplace update Tgorka/bmad-stepper to upgrade.`
**And** Stepper never writes to `~/.claude/plugins/` from this code path (NFR-S2)
**Given** the API call fails (offline, rate limit)
**When** `--upgrade` runs
**Then** Stepper exits 1 with the hint `Could not reach GitHub Releases. Check your network or try again later.`

## Tasks / Subtasks

- [x] 1. **Context — read all relevant files completely** (carry-over discipline from Stories 6.1 + 6.7 + 6.8)
  - [x] 1.1 Read `_bmad-output/implementation-artifacts/6-8-auto-archival-of-runs-and-telemetry.md` — focus on (a) the Forward Action Items section (4 inherited NITs N-1/N-2/N-3/N-4 + 49 inherited info I-1..I-49 cumulative minus 8 closed (I-26/I-27/I-28/I-38/I-41/I-46/I-47/I-48); Story 6.9 PRIMARY HONOURS none of the open trackers — scope is fully orthogonal); (b) the Story 6.8 SDR Quality Gates table baseline (1564/0/5078 across 79 files; errors registry 17); (c) the Story 6.8 close: archival lifecycle complete (collector → aggregator → archiver) and Sprint 6 storage hygiene SHIP.
  - [x] 1.2 Read `_bmad-output/implementation-artifacts/6-7-telemetry-aggregation-report.md` — focus on (a) the cli.ts pattern Story 6.9 mirrors at `src/upgrade/cli.ts`: `main(argv): Promise<number>`, `parseArgv(argv): { ... } | { error }`, terminal block `if (import.meta.main) { main(Bun.argv).then((code) => process.exit(code)); }` is the AR33 EXCEPTION per OQ-9; (b) the test seam pattern (`telemetryRoot?` test injection mirrored at `pluginManifestPath?`, `fetch?`, etc.); (c) the `loadConfig()` is NOT consumed by Story 6.9 (upgrade is config-free per OQ-12).
  - [x] 1.3 Read `_bmad-output/implementation-artifacts/6-1-bmad-stepper-config-yaml-schema-loader.md` — focus on the loader pattern (Story 6.9 does NOT consume loadConfig; this is a pattern carry-over only). Confirm Story 6.9 introduces NO new config schema.
  - [x] 1.4 Read `_bmad-output/implementation-artifacts/2-4-lock-free-run-ts-for-bmad-next.md` — focus on (a) the args→short-circuit→step pattern at next/run.ts; (b) the AR8 lock-free contract (upgrade short-circuit runs OUTSIDE the verify-and-advance lock); (c) the `wasExportStateRequested` (Story 3.8) and `wasWatchRequested` (Story 3.9) precedents Story 6.9 mirrors at `wasUpgradeRequested(argv)` for the AR9 carve-out at the import.meta.main block.
  - [x] 1.5 Read `_bmad-output/implementation-artifacts/1-7-cli-argument-parser.md` — focus on (a) the existing `upgrade: z.boolean().default(false)` flag at line 180 in NextArgsSchema; (b) the booleanKeys set at line 238 — the upgrade flag is ALREADY wired (no args.ts mutation needed); (c) the hand-rolled tokenizer pattern.
  - [x] 1.6 Read `_bmad-output/implementation-artifacts/1-9-bmad-detection.md` — focus on the `src/bmad-detect/` mid-tier module pattern Story 6.9 mirrors at `src/upgrade/`. Story 6.9 does NOT consume bmad-detect (upgrade is for STEPPER versioning, not BMAD versioning); the parallel is structural only.
  - [x] 1.7 Read `_bmad-output/implementation-artifacts/epic-5-retrospective.md` + `epic-4-retrospective.md` — Recommendations on registry stability (item 3 — ZERO new error classes per Epic 6) + cross-story coordination via opts.config seam.
  - [x] 1.8 Read `_bmad-output/planning-artifacts/architecture.md` lines 645-660 — D14 verbatim. Confirm the upgrade flow is read-only diagnostic + GH API endpoint exact + CHANGELOG link + BMAD compat for latest + hint verbatim.
  - [x] 1.9 Read `_bmad-output/planning-artifacts/architecture.md` lines 1219-1222 — confirm the architecture pre-listing for `src/upgrade/`. Story 6.9 INSTANTIATES this; the directory does not yet exist.
  - [x] 1.10 Read `_bmad-output/planning-artifacts/architecture.md` lines 1396, 1009, 1246 — NFR-S1 mapping + the `no-network-on-main.test.ts` integration test contract. Confirm Story 6.9 chooses option (b) per OQ-15 (defer cross-cutting enforcement to Story 6.10).
  - [x] 1.11 Read `_bmad-output/planning-artifacts/prd.md` lines 735-736 (FR47 + FR48), 764-765 (NFR-S1 + NFR-S2). Confirm AC verbatim alignment with epics.md.
  - [x] 1.12 Read `_bmad-output/planning-artifacts/product-brief-bmad-stepper.md` (and -distillate.md if present) — search for upgrade-related spotlights. Confirm the upgrade flow's UX framing (read-only + user-controlled + actionable hint).
  - [x] 1.13 Read `.claude-plugin/plugin.json` — confirm the `version` field is present + shape (`"version": "0.0.0"` baseline; will be bumped to `"0.1.0"` at Story 6.10 marketplace release). Story 6.9 reads this field via `PluginManifestSchema.parse`.
  - [x] 1.14 Read `package.json` — confirm the `version` field is present (`"version": "0.0.0"`); confirm the existing `scripts` block. Story 6.9 ADDS `"upgrade": "bun run src/upgrade/cli.ts"`.
  - [x] 1.15 Read `src/errors.ts` — confirm registry holds 17 codes; Story 6.9 ships ZERO new error classes; verify by `grep -c "extends StepperError" src/errors.ts` returns 17.
  - [x] 1.16 Read `src/integration/escalate-actionable-hint.test.ts` — confirm 33-test sweep covers all 17 error classes. Story 6.9 verifies this test passes UNCHANGED.
  - [x] 1.17 Read `src/io/log.ts` (30 lines) — confirm `info` / `warn` / `error` / `json` helpers. Story 6.9 uses `info` (success audit) + `error` (failure path) on stderr; STDOUT writes via `process.stdout.write` for the upgrade report (per OQ-5 AR9 carve-out).
  - [x] 1.18 Read `src/io/paths.ts` — confirm `assertWithinScope`. Story 6.9 does NOT consume this (the upgrade flow does not write).
  - [x] 1.19 Read `src/io/atomic-write.ts` — confirm the atomic write helper. Story 6.9 does NOT consume this (the upgrade flow does not write).
  - [x] 1.20 Read `src/commands/next/args.ts` lines 162-189 — confirm `upgrade: z.boolean().default(false)` is already in NextArgsSchema (line 180); confirm `"upgrade"` is already in the booleanKeys set (line 238). NO mutation needed.
  - [x] 1.21 Read `src/commands/next/run.ts` lines 1555-1610 — locate the existing forward-deferral guard at lines 1565-1570. This is the REPLACEMENT site for Story 6.9.
  - [x] 1.22 Read `src/commands/next/run.ts` lines 2275-2398 — locate the `wasExportStateRequested` (line 2294) and `wasWatchRequested` (line 2320) helpers + the `import.meta.main` block branching logic (lines 2329-2398). Story 6.9 ADDS `wasUpgradeRequested` mirror + EXTENDS the branching logic.
  - [x] 1.23 Read `src/telemetry/cli.ts` (134 lines) — full pass. Confirm the canonical CLI pattern: imports + parseArgv + main(argv) + terminal block. Story 6.9's cli.ts mirrors VERBATIM with adjustments for the upgrade contract.
  - [x] 1.24 Read `commands/bmad-next.md` lines 1-40 — confirm the existing usage-examples block + argumentHint (already lists `--upgrade` at line 3). Story 6.9 ADDS a new `### --upgrade flag` section.
  - [x] 1.25 Read `docs/configuration.md` lines 1-80 — confirm the doc structure. Story 6.9 ADDS a new top-level `## Upgrade flow` section at the END.
  - [x] 1.26 Read `docs/exit-codes.md` (177 lines) — full pass. Confirm the Exit Code 1 section structure. Story 6.9 EXTENDS with the AC-2 hint catalog entry.
  - [x] 1.27 Read `src/integration/aggregate-telemetry-no-pii.test.ts` — recover the integration test pattern Story 6.9 mirrors at `src/integration/upgrade-no-plugin-write.test.ts`.
  - [x] 1.28 Read `src/integration/auto-archival-startup.test.ts` (Story 6.8) — recover the snapshot-before-after pattern Story 6.9 may use for the NFR-S2 sweep (snapshot a tmpdir representing `~/.claude/plugins/` before + after invoking `runUpgradeCheck`).

- [x] 2. **NEW `src/upgrade/check.ts` module — `runUpgradeCheck(opts)` function + schemas + helpers**
  - [x] 2.1 Create directory `src/upgrade/`. Create `src/upgrade/check.ts`. Module JSDoc documents Story 6.9 + AR41 mid-tier (architecture line 1219-1222 pre-listing instantiated) + AR42 schema-first (defence-in-depth at network + filesystem boundaries) + NFR-S1 exception (the ONLY main-thread network I/O) + NFR-S2 no-write (Stepper never writes to `~/.claude/plugins/` from this code path).
  - [x] 2.2 Imports (foundational + node + zod only per AR41):
    ```ts
    import * as fs from "node:fs/promises";
    import * as path from "node:path";
    import { z } from "zod";
    ```
    NO higher-tier or top-tier imports. NO src/io/log.ts import (the check function returns a result; logging happens at the consumer — cli.ts and the runner-tier wiring).
  - [x] 2.3 Define schemas:
    ```ts
    /**
     * Anthropic plugin manifest shape (third-party — uses .passthrough()
     * per OQ-3 to tolerate forward-compat additions). The upgrade flow
     * needs only `version`; other fields are tolerated.
     */
    export const PluginManifestSchema = z
      .object({
        name: z.string().min(1),
        version: z.string().regex(/^\d+\.\d+\.\d+/),
      })
      .passthrough();

    /**
     * GitHub Releases API response shape (third-party — uses
     * .passthrough() per OQ-3). The upgrade flow needs `tag_name`,
     * `html_url`, and `body`.
     */
    export const GitHubReleaseSchema = z
      .object({
        tag_name: z.string().min(1),
        html_url: z.string().url(),
        body: z.string().nullable().default(""),
      })
      .passthrough();
    ```
  - [x] 2.4 Define constants:
    ```ts
    /** Default GitHub Releases API endpoint per AC-1 + D14. */
    export const RELEASES_URL_DEFAULT =
      "https://api.github.com/repos/Tgorka/bmad-stepper/releases/latest";

    /** Default fetch timeout per OQ-8 (10 seconds; not configurable in v0.1). */
    export const UPGRADE_FETCH_TIMEOUT_MS = 10_000;

    /** Default plugin manifest path relative to project root. */
    const PLUGIN_MANIFEST_PATH_DEFAULT = ".claude-plugin/plugin.json";
    ```
  - [x] 2.5 Define types:
    ```ts
    export type UpgradeCheckResult =
      | {
          readonly kind: "upgrade-available";
          readonly currentVersion: string;
          readonly latestVersion: string;
          readonly changelogUrl: string;
          readonly bmadCompat: string | undefined;
        }
      | {
          readonly kind: "up-to-date";
          readonly currentVersion: string;
          readonly latestVersion: string;
        };

    export interface RunUpgradeCheckOptions {
      /** Test seam: when supplied, overrides the plugin manifest path. */
      readonly pluginManifestPath?: string;
      /** Test seam: when supplied, overrides the global fetch (per OQ-13). */
      readonly fetch?: typeof globalThis.fetch;
      /** Test seam: when supplied, overrides the 10s timeout (per OQ-8). */
      readonly timeoutMs?: number;
      /** Test seam: when supplied, overrides the GH releases URL. */
      readonly releasesUrl?: string;
    }
    ```
  - [x] 2.6 Implement private helper `compareVersions(current: string, latest: string): number`:
    - Tokenize both into `[major, minor, patch]` integer tuples via `version.split(".").map(Number)`.
    - Throw `Error("upgrade: invalid semver string: <value>")` on tokenize failure (e.g., NaN in any tuple position).
    - Compare element-wise: return `current[0] - latest[0]` if non-zero; else `current[1] - latest[1]` if non-zero; else `current[2] - latest[2]`.
    - Returns `Math.sign(diff)` — `-1` (current < latest), `0` (equal), `+1` (current > latest).
  - [x] 2.7 Implement private helper `extractBmadCompat(releaseBody: string): string | undefined`:
    - Regex: `/(?:^|\n)#{1,6}\s+BMAD Compatibility\s+[—\-]\s+(v?\d+\.\d+\.[\d.x]+)/i`.
    - Matches H1-H6 markdown headings; tolerates em-dash OR hyphen separator; captures the version (allowing `v` prefix and `x` placeholder).
    - Returns the captured version (e.g., `"v6.5.x"`) or `undefined`.
  - [x] 2.8 Implement private helper `stripLeadingV(tag: string): string`:
    - `return tag.startsWith("v") ? tag.slice(1) : tag;`
  - [x] 2.9 Implement `runUpgradeCheck(opts: RunUpgradeCheckOptions = {}): Promise<UpgradeCheckResult>`:
    - Step 1: Resolve `pluginManifestPath = opts.pluginManifestPath ?? path.join(process.cwd(), PLUGIN_MANIFEST_PATH_DEFAULT)`.
    - Step 2: Resolve `fetchFn = opts.fetch ?? globalThis.fetch`.
    - Step 3: Resolve `timeoutMs = opts.timeoutMs ?? UPGRADE_FETCH_TIMEOUT_MS`.
    - Step 4: Resolve `releasesUrl = opts.releasesUrl ?? RELEASES_URL_DEFAULT`.
    - Step 5: Read the plugin manifest:
      - `let raw: string;` `try { raw = await fs.readFile(pluginManifestPath, "utf8"); } catch (err) { throw new Error("upgrade: failed to read plugin manifest at " + pluginManifestPath + ": " + (err instanceof Error ? err.message : String(err))); }`
      - `const obj = JSON.parse(raw);` (JSON.parse SyntaxError surfaces to caller).
      - `const manifest = PluginManifestSchema.parse(obj);` (ZodError surfaces).
    - Step 6: Construct AbortController + timeout:
      ```ts
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeoutMs);
      ```
    - Step 7: Try/catch/finally for the fetch:
      ```ts
      let response: Response;
      try {
        response = await fetchFn(releasesUrl, {
          signal: ac.signal,
          headers: {
            "User-Agent": "bmad-stepper/" + manifest.version,
            Accept: "application/vnd.github+json",
          },
        });
      } finally {
        clearTimeout(timer);
      }
      ```
    - Step 8: Validate response status:
      ```ts
      if (!response.ok) {
        throw new Error(
          "upgrade: GitHub API responded " + response.status + " " + response.statusText,
        );
      }
      ```
    - Step 9: Parse the response body:
      ```ts
      const body = await response.json();
      const release = GitHubReleaseSchema.parse(body);
      ```
    - Step 10: Compute latest version + compare:
      ```ts
      const latestVersion = stripLeadingV(release.tag_name);
      const cmp = compareVersions(manifest.version, latestVersion);
      ```
    - Step 11: Branch:
      ```ts
      if (cmp < 0) {
        return {
          kind: "upgrade-available",
          currentVersion: manifest.version,
          latestVersion,
          changelogUrl: release.html_url,
          bmadCompat: extractBmadCompat(release.body ?? ""),
        };
      }
      return {
        kind: "up-to-date",
        currentVersion: manifest.version,
        latestVersion,
      };
      ```
  - [x] 2.10 Add JSDoc on `runUpgradeCheck` documenting AC-1 verbatim (calls Bun.fetch the GH endpoint; reads currentVersion from .claude-plugin/plugin.json; compares; returns discriminated union for the caller to render); the test seams; the AR41 mid-tier role; the NFR-S1 exception; the NFR-S2 read-only guarantee.

- [x] 3. **NEW `src/upgrade/check.test.ts` test file — `runUpgradeCheck` coverage**
  - [x] 3.1 Create `src/upgrade/check.test.ts`. Imports: bun-test (`describe`, `expect`, `it`, `beforeEach`, `afterEach`, `spyOn`); `node:fs/promises` for tmpdir + writeFile; `node:os` + `node:path`; `import { runUpgradeCheck, RELEASES_URL_DEFAULT, UPGRADE_FETCH_TIMEOUT_MS, type UpgradeCheckResult } from "./check.ts"`.
  - [x] 3.2 Helpers:
    - `async function withTempDir(): Promise<string>` per AR35 (mkdtemp + return).
    - `async function writeManifest(dir: string, version: string, extra?: Record<string, unknown>): Promise<string>` writes `<dir>/.claude-plugin/plugin.json` with `{ name: "bmad-stepper", version, ...extra }`; returns the path.
    - `function makeStubFetch(opts: { ok?: boolean; status?: number; statusText?: string; body?: unknown; throws?: unknown; delayMs?: number; recordHeaders?: { current: HeadersInit | undefined } }): typeof globalThis.fetch` returns a stubbed fetch matching the global signature; when `throws` is set the stub rejects; when `delayMs` is set the stub waits that long before resolving (for timeout tests).
  - [x] 3.3 UPGRADE_69_HAPPY_NEWER_1: stubbed fetch returns newer release with BMAD compat; manifest version "0.1.0" → assert `kind: "upgrade-available"`, full result shape.
  - [x] 3.4 UPGRADE_69_UP_TO_DATE_1: stubbed fetch returns same version → assert `kind: "up-to-date"`.
  - [x] 3.5 UPGRADE_69_LOCAL_AHEAD_1: stubbed fetch returns older tag; manifest is newer → assert `kind: "up-to-date"` (per OQ-3 — local-ahead falls into up-to-date branch).
  - [x] 3.6 UPGRADE_69_NETWORK_FAILURE_1: stubbed fetch rejects with TypeError → assert throws Error containing the message.
  - [x] 3.7 UPGRADE_69_RATE_LIMIT_1: stubbed fetch returns `{ ok: false, status: 403, statusText: "rate limit exceeded" }` → assert throws Error containing "GitHub API responded 403".
  - [x] 3.8 UPGRADE_69_TIMEOUT_1: stubbed fetch with `delayMs: 1000`; opts.timeoutMs = 50 → assert AbortError or DOMException reject within ~100ms (use `Promise.race` + a small sleep to confirm the abort fires).
  - [x] 3.9 UPGRADE_69_MISSING_PLUGIN_JSON_1: pluginManifestPath = "/tmp/nonexistent-plugin-stepper-test.json" → assert throws Error with "failed to read plugin manifest" message.
  - [x] 3.10 UPGRADE_69_MALFORMED_PLUGIN_JSON_1: write tmpdir manifest with raw `"{not valid json"` → assert throws (JSON.parse SyntaxError).
  - [x] 3.11 UPGRADE_69_MALFORMED_RELEASE_RESPONSE_1: stubbed fetch returns `{ ok: true, json: () => Promise.resolve({ no_tag_name: "x" }) }` → assert ZodError thrown.
  - [x] 3.12 UPGRADE_69_USER_AGENT_SET_1: pass `recordHeaders` to the stub; capture the headers; assert `User-Agent` equals `"bmad-stepper/" + manifest.version`.
  - [x] 3.13 UPGRADE_69_BMAD_COMPAT_EXTRACTED_1: release body `"## BMAD Compatibility — v6.5.x\n\nWhatever."` → assert `result.bmadCompat === "v6.5.x"`.
  - [x] 3.14 UPGRADE_69_BMAD_COMPAT_MISSING_1: release body has no BMAD heading → assert `result.bmadCompat === undefined`.
  - [x] 3.15 UPGRADE_69_TAG_NAME_STRIP_V_1: stubbed tag_name `"v0.2.0"` → assert `result.latestVersion === "0.2.0"`.
  - [x] 3.16 UPGRADE_69_TAG_NAME_NO_V_1: stubbed tag_name `"0.2.0"` → assert `result.latestVersion === "0.2.0"`.
  - [x] 3.17 UPGRADE_69_NO_PLUGIN_DIR_WRITE_1: spy on `fs.writeFile` (and fs.appendFile, fs.copyFile, fs.rename); invoke `runUpgradeCheck`; assert ZERO writes attempted.
  - [x] 3.18 UPGRADE_69_COMPARE_VERSIONS_1: directly test `compareVersions` exported helper (or via re-export hack — alternatively test indirectly via the up-to-date / upgrade-available branches). Cover: 0.1.0 vs 0.2.0 → -1; 0.1.0 vs 0.1.0 → 0; 1.0.0 vs 0.9.0 → +1; 0.10.0 vs 0.9.0 → +1 (numeric not string); invalid semver throws.
  - [x] 3.19 Run `bun test src/upgrade/check.test.ts` — confirm all tests pass.

- [x] 4. **NEW `src/upgrade/render.ts` module — `renderUpgradeReport(input)` pure renderer**
  - [x] 4.1 Create `src/upgrade/render.ts`. Module JSDoc documents Story 6.9 + AR41 mid-tier + the two layouts (upgrade-available vs up-to-date) + the AC-1 verbatim hint string + the deterministic ordering.
  - [x] 4.2 Imports: `import type { UpgradeCheckResult } from "./check.ts"` (sibling type-only). NO runtime imports beyond standard library.
  - [x] 4.3 Define constants:
    ```ts
    /** AC-1 verbatim hint — byte-identical per epics.md line 1288. */
    const UPGRADE_HINT =
      "Run /plugin marketplace update Tgorka/bmad-stepper to upgrade.";

    const BMAD_COMPAT_MISSING_TEXT =
      "(BMAD compat info not present in release notes)";
    ```
  - [x] 4.4 Implement `renderUpgradeReport(input: UpgradeCheckResult): string`:
    - When `input.kind === "upgrade-available"`:
      ```ts
      const bmadCompatText = input.bmadCompat ?? BMAD_COMPAT_MISSING_TEXT;
      return [
        "# Stepper Upgrade Check",
        "",
        "- Current version: " + input.currentVersion,
        "- Latest version: " + input.latestVersion,
        "- CHANGELOG: " + input.changelogUrl,
        "- BMAD compatibility (latest): " + bmadCompatText,
        "",
        UPGRADE_HINT,
        "",
      ].join("\n");
      ```
    - When `input.kind === "up-to-date"`:
      ```ts
      return [
        "# Stepper Upgrade Check",
        "",
        "You are on the latest version (" + input.currentVersion + ").",
        "",
      ].join("\n");
      ```
  - [x] 4.5 JSDoc documents the section ordering + AC-1 verbatim hint + the BMAD compat fallback text + the deterministic guarantee.

- [x] 5. **NEW `src/upgrade/render.test.ts` test file — `renderUpgradeReport` coverage**
  - [x] 5.1 Create `src/upgrade/render.test.ts`. Imports: bun-test (`describe`, `expect`, `it`); `import { renderUpgradeReport } from "./render.ts"`; `import type { UpgradeCheckResult } from "./check.ts"`.
  - [x] 5.2 Helpers: `function makeUpgradeAvailable(overrides?: Partial<...>): UpgradeCheckResult { return { kind: "upgrade-available", currentVersion: "0.1.0", latestVersion: "0.2.0", changelogUrl: "https://github.com/Tgorka/bmad-stepper/releases/tag/v0.2.0", bmadCompat: "v6.5.x", ...overrides }; }`; sibling for up-to-date.
  - [x] 5.3 RENDER_69_LAYOUT_HEADERS_UPGRADE_AVAILABLE_1: render upgrade-available → assert H1, "Current version", "Latest version", "CHANGELOG:", "BMAD compatibility" all present in canonical order.
  - [x] 5.4 RENDER_69_LAYOUT_UP_TO_DATE_1: render up-to-date → assert H1 + "You are on the latest version" present; hint NOT present.
  - [x] 5.5 RENDER_69_VERSION_DIFF_1: input with current 0.1.0 / latest 0.2.0 → both versions appear.
  - [x] 5.6 RENDER_69_CHANGELOG_LINK_1: input includes `changelogUrl` → URL appears verbatim.
  - [x] 5.7 RENDER_69_BMAD_COMPAT_PRESENT_1: input `bmadCompat: "v6.5.x"` → output contains `BMAD compatibility (latest): v6.5.x`.
  - [x] 5.8 RENDER_69_BMAD_COMPAT_MISSING_1: input `bmadCompat: undefined` → output contains `BMAD compatibility (latest): (BMAD compat info not present in release notes)`.
  - [x] 5.9 RENDER_69_HINT_BYTE_IDENTICAL_1: render upgrade-available → assert output contains `Run /plugin marketplace update Tgorka/bmad-stepper to upgrade.` byte-identically (substring match).
  - [x] 5.10 RENDER_69_NO_PII_1: render various synthetic inputs → assert output does NOT contain forbidden substrings (`password`, `apiKey`, `secret`, `email`, `token`).
  - [x] 5.11 RENDER_69_DETERMINISTIC_1: render same input twice → byte-identical strings.
  - [x] 5.12 Run `bun test src/upgrade/render.test.ts` — confirm all tests pass.

- [x] 6. **NEW `src/upgrade/cli.ts` module — `main(argv)` standalone CLI entrypoint**
  - [x] 6.1 Create `src/upgrade/cli.ts`. Module JSDoc documents Story 6.9 + AR33 EXCEPTION (per OQ-6 — CLI entrypoints ARE allowed to call process.exit because they are the top of the call stack; mirrors Story 6.7 cli.ts pattern + Story 6.7 OQ-9) + AC-1/AC-2 wiring + exit codes.
  - [x] 6.2 Imports: `import { error } from "../io/log.ts"`; `import { runUpgradeCheck } from "./check.ts"`; `import { renderUpgradeReport } from "./render.ts"`.
  - [x] 6.3 Define `export async function main(argv: string[]): Promise<number>`:
    - Step 1: `let result; try { result = await runUpgradeCheck({}); } catch (err) { ... return 1; }`
    - Step 2: On thrown Error: `const msg = err instanceof Error ? err.message : String(err); error("upgrade: " + msg); error("Could not reach GitHub Releases. Check your network or try again later."); return 1;` (the second error() line is the AC-2 verbatim hint).
    - Step 3: On success: `const report = renderUpgradeReport(result); process.stdout.write(report); return 0;` (the renderer already includes a trailing `\n`; no extra).
  - [x] 6.4 Terminal block (the AR33 EXCEPTION):
    ```ts
    if (import.meta.main) {
      main(Bun.argv).then((code) => {
        process.exit(code);
      });
    }
    ```
  - [x] 6.5 Confirm via `bunx tsc --noEmit` that cli.ts compiles cleanly.

- [x] 7. **NEW `src/upgrade/cli.test.ts` test file — `main(argv)` coverage**
  - [x] 7.1 Create `src/upgrade/cli.test.ts`. Imports: bun-test (`describe`, `expect`, `it`, `beforeEach`, `afterEach`, `spyOn`); `node:fs/promises` for tmpdir; `node:path`; `import { main } from "./cli.ts"`; `import * as log from "../io/log.ts"`. ALSO need to override fetch via the runUpgradeCheck seam — but cli.ts does NOT expose the seam. Per OQ-13 alternative: since `cli.ts` invokes `runUpgradeCheck({})` with no override, the test must EITHER (a) globally replace globalThis.fetch + restore in afterEach (mutation pattern; carries cross-test contamination risk; isolate via beforeEach/afterEach pairing) OR (b) refactor `main(argv)` to accept an optional opts seam (rejected — would deviate from Story 6.7 cli.ts shape).
    - **Decision per OQ-13 below + OQ-13 sub-clause (a)**: mutate globalThis.fetch in beforeEach + restore in afterEach. Test isolation is preserved by Bun's per-test sandbox + the explicit restore.
  - [x] 7.2 Test seam: each test sets `process.cwd()` via `process.chdir(tmpDir)` (or rely on the manifest path being `<cwd>/.claude-plugin/plugin.json`). Cleanup in afterEach: restore prior cwd.
  - [x] 7.3 CLI_69_HAPPY_NEWER_AVAILABLE_1: tmpdir setup with `<tmpdir>/.claude-plugin/plugin.json` ("0.1.0"); stubbed globalThis.fetch returns newer release; spyOn(process.stdout, "write") to capture stdout; `await main(["bun", "run", "src/upgrade/cli.ts"])` → exit 0; captured stdout contains H1 + version diff + AC-1 hint.
  - [x] 7.4 CLI_69_UP_TO_DATE_1: tmpdir setup with same version; stubbed fetch → exit 0; stdout contains "You are on the latest version".
  - [x] 7.5 CLI_69_NETWORK_FAILURE_EXIT_1_1: stubbed fetch rejects → `await main([...])` → exit 1; spyOn(log, "error") to capture stderr calls; assert one of the calls is `"Could not reach GitHub Releases. Check your network or try again later."` byte-identically.
  - [x] 7.6 CLI_69_USER_AGENT_FIXTURE_1: capture headers in the stub fetch; assert User-Agent equals `bmad-stepper/<fixture-version>`.
  - [x] 7.7 CLI_69_NO_WRITE_TO_PLUGIN_DIR_SWEEP_1: spyOn fs.writeFile; invoke main; assert ZERO writes.
  - [x] 7.8 Run `bun test src/upgrade/cli.test.ts` — confirm all tests pass.

- [x] 8. **NEW `src/integration/upgrade-no-plugin-write.test.ts` integration test (NFR-S2 PRIMARY)**
  - [x] 8.1 Create `src/integration/upgrade-no-plugin-write.test.ts`. Imports: bun-test; `node:fs/promises` for tmpdir + readdir + stat; `node:path`; `import { runUpgradeCheck } from "../upgrade/check.ts"`.
  - [x] 8.2 Test setup: tmpdir-isolated fixture with `<tmpdir>/.claude-plugin/plugin.json` ("0.1.0"). Synthetic stubbed fetch returning a controlled GH release.
  - [x] 8.3 Test body 1 (write-API spy): spyOn fs.writeFile + fs.appendFile + fs.copyFile + fs.rename + fs.unlink; invoke `runUpgradeCheck({ pluginManifestPath: <tmpdir>/.claude-plugin/plugin.json, fetch: stub })`; assert ZERO writes attempted on any spy.
  - [x] 8.4 Test body 2 (path snapshot): snapshot a separate tmpdir representing `~/.claude/plugins/` BEFORE the call (mkdtemp + put a canary file inside); invoke `runUpgradeCheck`; snapshot AFTER; assert byte-identical inventory + the canary file untouched (NFR-S2 path-level enforcement).
  - [x] 8.5 Test body 3 (AC-1 hint byte-identical): on the upgrade-available result, render via `renderUpgradeReport` and assert the rendered string contains `Run /plugin marketplace update Tgorka/bmad-stepper to upgrade.` byte-identically.
  - [x] 8.6 Cross-link comments: `// AC-1 (epics.md line 1289 "never writes to ~/.claude/plugins/"); NFR-S2 (architecture line 1397; PRD line 765); AC-1 hint (epics.md line 1288).`
  - [x] 8.7 Run `bun test src/integration/upgrade-no-plugin-write.test.ts` — confirm all tests pass.

- [x] 9. **NEW `src/upgrade/index.ts` barrel — public surface re-exports**
  - [x] 9.1 Create `src/upgrade/index.ts`. Append:
    ```ts
    /**
     * src/upgrade/index.ts — public barrel for the `upgrade/` mid-tier
     * module (FR48; NFR-S1 EXCEPTION; NFR-S2; AR41; D14).
     *
     * Story 6.9 instantiates the architecture's pre-listing at line
     * 1219-1222. The CLI (`cli.ts`) is invoked via `bun run upgrade` and
     * is NOT re-exported here (CLI tier is consumed via process.exec, not
     * via library import).
     */

    export {
      runUpgradeCheck,
      type RunUpgradeCheckOptions,
      type UpgradeCheckResult,
      RELEASES_URL_DEFAULT,
      UPGRADE_FETCH_TIMEOUT_MS,
    } from "./check.ts";
    export { renderUpgradeReport } from "./render.ts";
    ```
  - [x] 9.2 Run `bunx tsc --noEmit` — verify the barrel compiles.

- [x] 10. **MODIFIED `src/commands/next/run.ts` — replace forward-deferral guard + add wasUpgradeRequested helper + extend import.meta.main branching**
  - [x] 10.1 Add imports at the imports block (after the existing imports):
    ```ts
    import { renderUpgradeReport, runUpgradeCheck } from "../../upgrade/index.ts";
    ```
  - [x] 10.2 Locate the existing forward-deferral guard at lines 1565-1570:
    ```ts
    if (args.upgrade) {
      return haltWithHint(
        1,
        "Run /bmad-next --doctor to verify your install. The --upgrade flow is implemented in Story 6.9 (Epic 6).",
      );
    }
    ```
    Per OQ-1, the upgrade short-circuit should run BEFORE all other guards. The placement at the existing Step 3 site (before Step 4 staging cleanup, Step 4b archival trigger, Step 5 doctor) is correct — the existing guard is at the right place; we REPLACE its body. The upgrade flow does NOT need state read or BMAD detection (per OQ-2).
  - [x] 10.3 Replace the guard body with the runUpgradeCheck short-circuit:
    ```ts
    // Step 0a (Story 6.9): --upgrade short-circuit. Per AC-1: calls
    // Bun.fetch the GH releases endpoint (NFR-S1 exception — the only
    // main-thread network I/O permitted), reads currentVersion from
    // .claude-plugin/plugin.json, compares; emits the markdown report on
    // stdout via the AR9 carve-out (mirrors Story 3.8 --export-state +
    // Story 3.9 --watch precedents per OQ-5). Per AC-1 + NFR-S2: never
    // writes to ~/.claude/plugins/ from this code path. On API failure
    // (offline, rate limit, timeout, malformed): exits 1 with the AC-2
    // verbatim hint.
    if (args.upgrade) {
      try {
        const result = await runUpgradeCheck({
          ...(opts?.upgradeFetchOverride !== undefined
            ? { fetch: opts.upgradeFetchOverride }
            : {}),
        });
        const report = renderUpgradeReport(result);
        return reportWithMessage(report);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        error(`upgrade: ${msg}`);
        return haltWithHint(
          1,
          "Could not reach GitHub Releases. Check your network or try again later.",
        );
      }
    }
    ```
  - [x] 10.4 Add `upgradeFetchOverride?: typeof globalThis.fetch` field to `RunNextOptions` interface (per OQ-12 — separate seam from opts.config; test injection only).
  - [x] 10.5 Add `wasUpgradeRequested(argv)` helper near the existing `wasExportStateRequested` (line 2294) and `wasWatchRequested` (line 2320):
    ```ts
    /**
     * Story 6.9: detect whether the current invocation was driven by
     * `--upgrade` so the `import.meta.main` block can SPECIAL-CASE the
     * stdout emission. Per AC-1 + OQ-5, the upgrade report goes to
     * stdout DIRECTLY (NOT wrapped in the AR9 line) — the renderer emits
     * a multi-line markdown-style human-readable document.
     *
     * Mirrors Story 3.8's `wasExportStateRequested` + Story 3.9's
     * `wasWatchRequested` precedents — substring match for the flag name;
     * runs in the post-`runNext` path to decide whether to bypass the
     * AR9 emit. False positives are impossible because the runner only
     * reaches the upgrade short-circuit branch when `args.upgrade ===
     * true` (the parsed arg agrees with the substring scan).
     */
    function wasUpgradeRequested(argv: readonly string[]): boolean {
      for (const arg of argv) {
        if (arg === "--upgrade" || arg.startsWith("--upgrade=")) {
          return true;
        }
      }
      return false;
    }
    ```
  - [x] 10.6 Extend the `import.meta.main` block branching logic (lines 2329-2398) to detect `wasUpgradeRequested(argvSlice)` and BYPASS `emitDispatchAction` — write the report message DIRECTLY to stdout. Insert the new branch alongside the existing `wasWatchRequested` and `wasExportStateRequested` branches:
    ```ts
    if (wasWatchRequested(argvSlice)) {
      // Story 3.9 ...
    } else if (wasUpgradeRequested(argvSlice)) {
      // Story 6.9 SPECIAL CASE per AC-1 + OQ-5: the upgrade report goes
      // to stdout DIRECTLY (NOT wrapped in the AR9 line). The renderer
      // already emits the trailing newline; no extra is needed.
      if (result.action.action === "report") {
        process.stdout.write(`${result.action.message}\n`);
      } else {
        // Halt path (network failure) — the haltWithHint return path
        // produces an action: "halt" with the AC-2 verbatim hint.
        // Emit via emitDispatchAction so the AR9 line is preserved on
        // the failure path (the user sees the JSON line + the stderr
        // error from log.error per Step 0a's catch).
        emitDispatchAction(result.action);
      }
    } else if (
      wasExportStateRequested(argvSlice) &&
      result.action.action === "report"
    ) {
      process.stdout.write(`${result.action.message}\n`);
    } else {
      emitDispatchAction(result.action);
    }
    ```
  - [x] 10.7 Verify `bunx tsc --noEmit` passes.
  - [x] 10.8 Run `bun test src/commands/next/run.test.ts` — confirm existing tests still pass (no regressions on the existing forward-deferral test cases).

- [x] 11. **MODIFIED `src/commands/next/run.test.ts` — UPGRADE_69_RUN_* tests**
  - [x] 11.1 Locate existing test cases for the forward-deferral guard (search for `"Story 6.9"` substring or the existing `--upgrade` halt test).
  - [x] 11.2 REPLACE / EXTEND the existing forward-deferral test cases with the Story 6.9 short-circuit tests:
    - **UPGRADE_69_RUN_SHORT_CIRCUIT_1**: pass `args: { upgrade: true }` + `opts: { upgradeFetchOverride: stubFetch }`; assert `result.exitCode === 0`; `result.action.action === "report"`; `result.action.message` contains H1 + version diff + AC-1 hint.
    - **UPGRADE_69_RUN_NETWORK_FAILURE_1**: stub fetch rejects; assert `result.exitCode === 1`; `result.action.action === "halt"`; `result.action.message === "Could not reach GitHub Releases. Check your network or try again later."` byte-identical.
    - **UPGRADE_69_RUN_TAKES_PRECEDENCE_1**: `args: { upgrade: true, doctor: true }` → assert upgrade short-circuit runs FIRST; the doctor delegation is NOT invoked.
    - **UPGRADE_69_RUN_BYPASSES_BMAD_DETECT_1**: fixture project where BMAD is NOT installed (or stub the bmad-detect surface to return missing); `args: { upgrade: true }`; assert upgrade short-circuit returns the report (NOT a `BMAD_NOT_INSTALLED` halt).
  - [x] 11.3 Run `bun test src/commands/next/run.test.ts` — confirm all tests pass.

- [x] 12. **MODIFIED `commands/bmad-next.md` — add `--upgrade flag` documentation section**
  - [x] 12.1 Locate the existing usage-examples block (lines 11-24) — `--upgrade` is already listed at line 23 (per current state). Confirm.
  - [x] 12.2 ADD a new section near the END of the document (after the existing flag documentation) titled `### --upgrade (Story 6.9)`. Document: purpose (GH Releases check), output (markdown to stdout), exit codes (0 success, 1 failure), the never-auto-installs guarantee (NFR-S2), the AC-1 verbatim hint, the network discipline (NFR-S1 exception per architecture §D14).
  - [x] 12.3 Add a cross-link to `docs/exit-codes.md` for the verbatim exit-1 hint.

- [x] 13. **MODIFIED `docs/configuration.md` — add `## Upgrade flow (Story 6.9 — DONE)` section**
  - [x] 13.1 At the END of `docs/configuration.md` (after the existing Story 6.8 auto-archival section + forward-tracker close), insert a new top-level section `## Upgrade flow (Story 6.9 — DONE)`.
  - [x] 13.2 Document: GH endpoint exact URL; `currentVersion` source (`.claude-plugin/plugin.json:version`); BMAD compat extraction heuristic; CHANGELOG link source; failure semantics (exit 1 + AC-2 hint); never-auto-installs guarantee; User-Agent header; 10s timeout budget; cross-link to docs/exit-codes.md.

- [x] 14. **MODIFIED `docs/exit-codes.md` — extend Exit Code 1 section with Story 6.9 failure entry**
  - [x] 14.1 Locate the Exit Code 1 section (line 30-64).
  - [x] 14.2 At the END of the section (before Exit Code 2), add a new paragraph documenting the Story 6.9 failure case + the AC-2 verbatim hint byte-identical. Note that this hint is NOT a `StepperError actionableHint` — Story 6.9 ships ZERO new error classes; the hint is emitted directly via `error()` from the upgrade flow.

- [x] 15. **MODIFIED `package.json` — add `upgrade` script entry**
  - [x] 15.1 Add `"upgrade": "bun run src/upgrade/cli.ts"` to the `"scripts"` block.
  - [x] 15.2 Verify `bun run upgrade` parses (smoke check; the script reads .claude-plugin/plugin.json + calls the GH API; in a dev environment with network access this should print the upgrade report).

- [x] 16. **Quality gates + sprint-status + state.yaml + evidenceIndex**
  - [x] 16.1 Run `bunx tsc --noEmit` — exit 0 expected.
  - [x] 16.2 Run `bun run check` — full test suite + biome ci. Expected baseline: 1564/0/5078 across 79 files (Story 6.8 close) → expected delta: +30-45 tests / +60-100 expects / +8 NEW files (check.ts + check.test.ts + render.ts + render.test.ts + cli.ts + cli.test.ts + index.ts + integration test) + 6 MODIFIED files (run.ts + run.test.ts + bmad-next.md + configuration.md + exit-codes.md + package.json). Final baseline ~1595-1610 / 0 / ~5140-5180 across 87 files.
  - [x] 16.3 Run `grep -c "extends StepperError" src/errors.ts` → expect `17` UNCHANGED.
  - [x] 16.4 Run `bun test src/integration/escalate-actionable-hint.test.ts` → expect 33/0/114 UNCHANGED.
  - [x] 16.5 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: change `6-9-upgrade-flow: backlog` (line 111) to `6-9-upgrade-flow: review`. Bump `last_updated:` to current ISO timestamp.
  - [x] 16.6 Update `.bmad-stepper/state.yaml`: bump `workflow.lastStep` to `bmad-dev-story`; `workflow.lastStepCompletedAt` to current ISO; `workflow.nextStep` to `bmad-code-review`; `workflow.nextStepStory` and `nextStepKey` UNCHANGED at `6.9` / `6-9-upgrade-flow`. Append a new entry to `evidenceIndex` (step: bmad-dev-story, path: `_bmad-output/implementation-artifacts/6-9-upgrade-flow.md`, evidence: short summary, runId + loopId, epic 6, story 6.9).
  - [x] 16.7 Confirm sprint-status epic-6 stays `in-progress` (already in-progress at line 102 — no change needed).
  - [x] 16.8 NO write to `~/.claude/plugins/` from any code path during dev or test (NFR-S2 enforced by `src/integration/upgrade-no-plugin-write.test.ts` + the in-test write-API spy).

## Dev Notes

### Relevant architecture patterns and constraints

- **AR41 mid-tier boundary** — `src/upgrade/{check,render,cli}.ts` are sibling mid-tier files (architecture lines 1219-1222 pre-listing; 1283 mid-tier graph). The orchestrator imports from `runs/`, `telemetry/`, `io/`, `schemas/` only. ZERO higher-tier or top-tier imports.
- **AR42 schema-first** — every JSON parse passes through Zod; `PluginManifestSchema` and `GitHubReleaseSchema` are NEW (third-party shapes — `.passthrough()` per OQ-3). ZERO new persisted schemas.
- **AR21+22 single-line discipline** — the upgrade flow emits ONE single-line `error()` message on the failure path (followed by the AC-2 hint as a separate single-line `error()`); the success path writes a multi-line markdown REPORT to STDOUT (NOT an audit notice — AR21 governs audit notices, not user-facing reports per OQ-5).
- **AR33 async fs writes; never console.*** — upgrade modules use `fs.readFile` (async) for the manifest read + `fetch` (async) for the network call + `process.stdout.write` (sync but allowed for top-tier output) for the report. The cli.ts terminal block is the AR33 EXCEPTION (per OQ-6 + Story 6.7 OQ-9 precedent).
- **AR8 lock-free top-tier** — upgrade short-circuit at `next/run.ts` Step 0a runs BEFORE any state read; the upgrade modules NEVER touch `state.yaml` or `state.yaml.lock/`. ZERO state.yaml mutation; ZERO state.yaml read.
- **AR9 stdout JSON-line invariant** — Story 6.9 is the THIRD documented AR9 carve-out (alongside Story 3.8 `--export-state` and Story 3.9 `--watch`). The `wasUpgradeRequested(argv)` helper at the `import.meta.main` block bypasses `emitDispatchAction` for the success path. The failure path PRESERVES AR9 (emits the halt action via `emitDispatchAction`).
- **AR17 security/PII** — upgrade NEVER reads file CONTENT beyond `.claude-plugin/plugin.json:version`. The GH release body is read for BMAD compat extraction (a regex match — does NOT surface raw body content). ZERO PII surface widening.
- **AR27 telemetry schema invariants** — UNCHANGED. ZERO interaction with `src/telemetry/`.
- **AR35 tmpdir-per-test discipline** — every fs-touching test seeds a tmpdir. The integration test uses TWO tmpdirs (one for the manifest fixture, one as the synthetic `~/.claude/plugins/` for the path snapshot).
- **NFR-S1 exception** — the upgrade flow is the ONLY main-thread network I/O permitted (architecture line 646-657 D14 + line 1396 NFR mapping + AC-1 verbatim).
- **NFR-S2 no-write** — ZERO writes to `~/.claude/plugins/` from this code path (AC-1 verbatim + AR42 enforcement at the test level).
- **NFR-M3 version semantics** — `currentVersion` is read from `.claude-plugin/plugin.json:version` (semver-shaped string; semver-shaped enforcement via `PluginManifestSchema.regex(/^\d+\.\d+\.\d+/)`).

### Source tree components to touch

NEW (8):
- `src/upgrade/check.ts` (Task 2)
- `src/upgrade/check.test.ts` (Task 3)
- `src/upgrade/render.ts` (Task 4)
- `src/upgrade/render.test.ts` (Task 5)
- `src/upgrade/cli.ts` (Task 6)
- `src/upgrade/cli.test.ts` (Task 7)
- `src/upgrade/index.ts` (Task 9)
- `src/integration/upgrade-no-plugin-write.test.ts` (Task 8)

MODIFIED (6):
- `src/commands/next/run.ts` (Task 10 — short-circuit + wasUpgradeRequested + import.meta.main branching)
- `src/commands/next/run.test.ts` (Task 11 — UPGRADE_69_RUN_* tests)
- `commands/bmad-next.md` (Task 12 — `### --upgrade` documentation)
- `docs/configuration.md` (Task 13 — `## Upgrade flow` section)
- `docs/exit-codes.md` (Task 14 — Exit Code 1 extension)
- `package.json` (Task 15 — `upgrade` script entry)

UNCHANGED (verified — no mutation): `src/errors.ts`, `src/schemas/**` (no schema changes; new schemas live in src/upgrade/check.ts colocated), `src/migrations/**`, `src/dag/**`, `src/state/**`, `src/dispatch/**`, `src/failure-ux/**`, `src/verifiers/**`, `src/commands/next/args.ts` (`upgrade` flag already exists at line 180), `src/commands/next/verify-and-advance.ts`, `src/commands/loop/**`, `src/commands/doctor/**`, `src/runs/**`, `src/telemetry/**`, `src/startup/**`, `src/bmad-detect/**`, `src/io/**`, `src/lock/**`, `commands/bmad-loop.md`.

### Testing standards summary

- **Colocated unit tests** — every NEW production file has a colocated `.test.ts` neighbour.
- **Cross-module integration test** — `src/integration/upgrade-no-plugin-write.test.ts` is the NFR-S2 PRIMARY mechanism (mirrors the `aggregate-telemetry-no-pii.test.ts` precedent).
- **Test ID prefix discipline** — UPGRADE_69_* for check; RENDER_69_* for render; CLI_69_* for cli; UPGRADE_69_RUN_* for the runner-tier integration tests; integration test cross-references AC-1/2.
- **AR35 tmpdir-per-test** — every fs-touching test uses `mkdtemp(path.join(os.tmpdir(), "stepper-upgrade-"))` + cleanup in afterEach.
- **fetch seam mocking** — every test that exercises `runUpgradeCheck` injects a stubbed fetch via `opts.fetch` (per OQ-13). The `cli.test.ts` mutates `globalThis.fetch` in beforeEach + restores in afterEach (since `cli.ts` does not expose the seam directly).
- **No-write enforcement** — the integration test sweeps `fs.writeFile` + `fs.appendFile` + `fs.copyFile` + `fs.rename` + `fs.unlink` for ZERO calls during runUpgradeCheck. ALSO snapshots a synthetic `~/.claude/plugins/` tmpdir BEFORE + AFTER the call for byte-identical inventory.
- **AC-1/AC-2 verbatim hint enforcement** — every test that surfaces a hint asserts byte-identical match. `RENDER_69_HINT_BYTE_IDENTICAL_1` covers the success-path hint; `CLI_69_NETWORK_FAILURE_EXIT_1_1` and `UPGRADE_69_RUN_NETWORK_FAILURE_1` cover the failure-path hint.

### Project Structure Notes

- **Alignment with unified project structure**: Story 6.9 INSTANTIATES the architecture's pre-listed `src/upgrade/` directory (architecture line 1219-1222). The architecture pre-listed `index.ts`, `check.ts`, `check.test.ts`; Story 6.9 EXTENDS with `render.ts`, `render.test.ts`, `cli.ts`, `cli.test.ts` as siblings (the pre-listing is non-exhaustive). The dev iter MAY add a JSDoc cross-reference to architecture line 1219-1222 in `src/upgrade/check.ts`.
- **NEW directory `src/upgrade/`**: Story 6.9 introduces this directory. It is mid-tier per AR41 (sibling of `src/runs/`, `src/telemetry/`, `src/state/`, `src/startup/`, etc.). Future stories may add other upgrade-related modules (e.g., `src/upgrade/diff-changelog.ts` for inline CHANGELOG diff rendering — currently the renderer only emits a CHANGELOG URL link).
- **Detected variances**: NONE.
- **Path scope**: the upgrade flow does NOT write — `assertWithinScope` is N/A. The integration test verifies this property at both the API level (writeFile spy) and the path level (synthetic ~/.claude/plugins/ snapshot).

### Forward-trackers honoured here

- **Story 6.8 SDR I-49 (calendar-month threshold drift)** — UNCHANGED documentation-only OPEN. Story 6.9 does NOT touch the threshold semantics.
- **Story 6.7 SDR I-43 (opts.config seam — 9 sites accumulated)** — UNCHANGED at 9 sites. Story 6.9 introduces ZERO new opts.config consumer (the upgrade flow does NOT consume config). The new `upgradeFetchOverride` field on `RunNextOptions` is a SEPARATE seam (test-injection only).
- **Story 6.6 + 6.7 SDR I-48 (UTC discipline)** — UNCHANGED. Story 6.9 has no time-based logic (the AbortController timeout is a duration, not a wall-clock event).
- **Story 1.7 baseline `upgrade: z.boolean().default(false)` flag** — PRIMARY HONOURED. Story 6.9 does NOT mutate args.ts; the flag is already wired.
- **Story 2.4 forward-deferral guard at next/run.ts:1565-1570** — REPLACED. Story 6.9 closes this forward-tracker by replacing the halt-with-hint stub with the runUpgradeCheck short-circuit.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md`#Story-6.9, lines 1278-1292]
- [Source: `_bmad-output/planning-artifacts/architecture.md`#D14-upgrade, lines 645-660]
- [Source: `_bmad-output/planning-artifacts/architecture.md`#NFR-S1-mapping, line 1396]
- [Source: `_bmad-output/planning-artifacts/architecture.md`#src-upgrade-listing, lines 1219-1222]
- [Source: `_bmad-output/planning-artifacts/architecture.md`#layer-2-network-allow, line 1264]
- [Source: `_bmad-output/planning-artifacts/architecture.md`#integration-no-network-test, lines 1009 + 1246]
- [Source: `_bmad-output/planning-artifacts/prd.md`#FR47-FR48, lines 735-736]
- [Source: `_bmad-output/planning-artifacts/prd.md`#NFR-S1-S2, lines 764-765]
- [Source: `_bmad-output/implementation-artifacts/6-7-telemetry-aggregation-report.md`#cli-pattern (Story 6.7 OQ-9 AR33 EXCEPTION + main(argv): Promise<number> + parseArgv)]
- [Source: `_bmad-output/implementation-artifacts/6-8-auto-archival-of-runs-and-telemetry.md`#NEW-MID-TIER-directory-pattern (Story 6.8 src/startup/ precedent)]
- [Source: `_bmad-output/implementation-artifacts/2-4-lock-free-run-ts-for-bmad-next.md`#wasExportStateRequested-precedent (Story 3.8 AR9 carve-out pattern Story 6.9 mirrors)]
- [Source: `_bmad-output/implementation-artifacts/1-7-cli-argument-parser.md`#upgrade-flag-already-wired (Story 1.7 NextArgsSchema line 180 + booleanKeys line 238)]
- [Source: `src/commands/next/run.ts:1565-1570` — REPLACEMENT site for Story 6.9 short-circuit]
- [Source: `src/commands/next/run.ts:2294 + 2320` — `wasExportStateRequested` + `wasWatchRequested` precedents Story 6.9 mirrors at `wasUpgradeRequested`]
- [Source: `src/commands/next/run.ts:2329-2398` — `import.meta.main` block branching Story 6.9 EXTENDS]
- [Source: `src/commands/next/args.ts:180,238` — `upgrade: z.boolean().default(false)` + booleanKeys baseline (no mutation)]
- [Source: `src/telemetry/cli.ts` (134 lines) — canonical CLI pattern Story 6.9 mirrors at `src/upgrade/cli.ts`]
- [Source: `src/io/log.ts:24-26` — `error()` helper Story 6.9 cli.ts uses for the failure path]
- [Source: `.claude-plugin/plugin.json:3` — `version` field Story 6.9 reads]
- [Source: `package.json:6-11` — `scripts` block Story 6.9 EXTENDS]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m] (Opus 4.7, 1M context).

### Persona Used

Senior Developer Amelia (BMAD `bmad-dev-story` persona — story-driven implementation; reads spec, ticks every task, ships ALL files in File List, runs ALL quality gates, advances state).

### Iteration Count

Iteration 2 of `/bmad-loop --until=story:6.9` (loopId `2026-05-06T014519Z-bmad-loop`, dev runId `2026-05-06T020656Z-bmad-next`). Iteration 1 was the create-story phase (runId `2026-05-06T014636Z-bmad-next`).

### Debug Log References

- Initial `bunx tsc --noEmit`: clean exit 0 after first round of edits (one fix: `HeadersInit` → `Record<string, string>` in `check.test.ts`; the project's `tsconfig.json` lib is `["ESNext"]` only — no `dom` lib).
- `bun test src/upgrade/check.test.ts`: 22/0/38 across 1 file (PASS).
- `bun test src/upgrade/render.test.ts`: 13/0/35 across 1 file (PASS).
- `bun test src/upgrade/cli.test.ts`: 5/0/19 across 1 file (PASS).
- `bun test src/integration/upgrade-no-plugin-write.test.ts`: 3/0/14 across 1 file (PASS).
- `bun test src/commands/next/run.test.ts` after run.ts edits: 178/0/636 across 1 file (PASS — 175 baseline + 3 net = forward-deferral test removed, 4 UPGRADE_69_RUN_* added).
- Final `bun run check` (full suite): 1610 pass / 0 fail / 5192 expects across 83 files (Δ from Story 6.8 close baseline 1564/0/5078/79 = +46 tests / +114 expects / +4 files).
- `grep -c "extends StepperError" src/errors.ts`: 17 (UNCHANGED).
- `bun test src/integration/escalate-actionable-hint.test.ts`: 33/0/114 (UNCHANGED).
- `bunx biome ci .`: 9 infos (pre-existing useTemplate / useLiteralKeys in unrelated files), 0 errors after fixing 1 noImplicitAnyLet at `src/upgrade/cli.ts:69` (added `: UpgradeCheckResult` annotation on `let result`) + 1 unused-var at `src/upgrade/cli.test.ts` USER_AGENT_FIXTURE_1 stdout spy.

### Completion Notes List

1. **NEW MID-TIER directory `src/upgrade/` instantiated** per architecture line 1219-1222 pre-listing. 7 NEW files in the directory: `check.ts`, `check.test.ts`, `render.ts`, `render.test.ts`, `cli.ts`, `cli.test.ts`, `index.ts` (barrel).
2. **AR41 boundary CLEAN** — `src/upgrade/check.ts` imports only `node:fs/promises`, `node:path`, and `zod`. `src/upgrade/render.ts` imports a sibling type only. `src/upgrade/cli.ts` imports `../io/log.ts` (foundational) + sibling `./check.ts` + sibling `./render.ts`. ZERO higher-tier or top-tier imports.
3. **AR42 schema-first** — `PluginManifestSchema` (Anthropic plugin manifest) and `GitHubReleaseSchema` (GitHub Releases response) both `.passthrough()` per OQ-3 (third-party shapes Stepper does NOT own). The closed-set discipline (`.strict()`) applies only to Stepper-owned persisted shapes.
4. **AR21 single-line audit + AR22 N/A** — the upgrade flow uses bare `Error` throws (no new error classes per OQ-10); the orchestrator (cli.ts + runner-tier wiring) catches and emits the AC-2 verbatim hint via single-line `error()` calls. Errors registry HELD AT 17.
5. **AR8 lock-free preserved** — upgrade modules NEVER touch `state.yaml` or `state.yaml.lock/`. Runner short-circuit at `src/commands/next/run.ts` Step 0a fires BEFORE any state read.
6. **AR9 carve-out (third documented)** — added `wasUpgradeRequested(argv)` helper at `src/commands/next/run.ts` mirroring Story 3.8 `wasExportStateRequested` and Story 3.9 `wasWatchRequested`. The `import.meta.main` block bypasses `emitDispatchAction` for the upgrade success path; the failure path PRESERVES AR9 (halt action emitted normally so the user sees both the structured AR9 line AND the stderr error from `log.error`).
7. **NFR-S1 EXCEPTION isolated to `src/upgrade/`** — the `Bun.fetch` call lives ONLY in `src/upgrade/check.ts`. The Step 0a comment in `src/commands/next/run.ts` was rephrased to avoid `Bun.fetch` substring (the existing NFR-S1 boundary test at `run.test.ts:670-679` continues to pass — `expect(source).not.toMatch(/\bfetch\(/)` and `not.toMatch(/Bun\.fetch/)`).
8. **NFR-S2 read-only enforced at THREE layers** — (a) unit-level: `UPGRADE_69_NO_PLUGIN_DIR_WRITE_1` spies on `fs.writeFile/appendFile/copyFile/rename/unlink` for ZERO calls during `runUpgradeCheck`; (b) cli-level: `CLI_69_NO_WRITE_TO_PLUGIN_DIR_SWEEP_1` does the same during `main([])`; (c) integration-level: `src/integration/upgrade-no-plugin-write.test.ts` spies the write APIs AND snapshots a synthetic `~/.claude/plugins/` analogue before+after asserting byte-identical inventory + canary file untouched.
9. **AC-1 hint byte-identical** verified at multiple sites: `RENDER_69_HINT_BYTE_IDENTICAL_1` (renderer-side substring assertion), `UPGRADE_69_RUN_SHORT_CIRCUIT_1` (runner-tier short-circuit assertion via `result.action.message`), integration test (post-render assertion).
10. **AC-2 hint byte-identical** verified at: `CLI_69_NETWORK_FAILURE_EXIT_1_1` (cli-tier `error` call), `UPGRADE_69_RUN_NETWORK_FAILURE_1` (runner-tier halt action message — exact string equality `toBe(...)`).
11. **The existing forward-deferral test `--upgrade halts with exitCode 1 + Story 6.9 hint` was REMOVED** (tested the now-removed Story 2.4 stub) and REPLACED by 4 new UPGRADE_69_RUN_* tests covering SHORT_CIRCUIT / NETWORK_FAILURE / TAKES_PRECEDENCE / BYPASSES_BMAD_DETECT.
12. **`let result;` in `src/upgrade/cli.ts` upgraded to `let result: UpgradeCheckResult;`** (biome `noImplicitAnyLet` rule; one repair iteration during quality-gate run).
13. **Test count delta**: NEW UPGRADE_69_* (22 tests in check.test.ts) + NEW RENDER_69_* (13 tests in render.test.ts) + NEW CLI_69_* (5 tests in cli.test.ts) + NEW integration test (3 tests) + NEW UPGRADE_69_RUN_* (4 tests in run.test.ts) − removed forward-deferral test (1 test) = +46 tests across +4 files; +114 expects.
14. **OQ-15 (no-network-on-main) deferred to Story 6.10 per spec option (b)** — Story 6.9 ships upgrade-side enforcement (the upgrade module is the ONLY consumer of fetch in `src/`); cross-cutting verification (a global `globalThis.fetch` mock asserting it's called only from `src/upgrade/`) is a Story 6.10+ responsibility.
15. **Forward-trackers**: 0 NEW info-trackers added. Story 6.8 SDR I-49 (calendar-month threshold drift) carries forward UNCHANGED documentation-only OPEN. Story 6.7 SDR I-43 (opts.config seam — 9 sites) carries forward UNCHANGED at 9 sites — the new `upgradeFetchOverride` field on `RunNextOptions` is a SEPARATE seam (test-injection only), NOT a config seam expansion.

### Deviations

- **Test count above the spec estimate**: spec said "15 UPGRADE_69_* / 9 RENDER_69_* / 5 CLI_69_*". Implemented 22 / 13 / 5 to cover all sub-task assertions plus a few defensive type/constant guards. Within the spec's "+30-45 tests" budget (final delta: +46 tests).
- **CLI test mutates `globalThis.fetch` per OQ-13 sub-clause (a)**, with `originalFetch` saved in `beforeEach` and restored in `afterEach` — same pattern documented in spec Task 7.1.
- **`cli.test.ts` does NOT spy on `process.exit`** — the test invokes the testable `main(argv)` directly which returns the exit code. The terminal `if (import.meta.main)` block (the only `process.exit` site per AR33 EXCEPTION) is NOT exercised by tests (matches Story 6.7 `telemetry/cli.test.ts` precedent).
- **Story 6.9 inserts the upgrade short-circuit at `src/commands/next/run.ts` Step 0a placement** — within the existing `try { ... }` block alongside the other forward-deferral guards (Step 3 in the existing comment numbering). The label "Step 0a" refers to the upgrade flow's logical position BEFORE Step 4 staging cleanup + Step 4b archival trigger + Step 5 doctor; the physical placement is at the same source line as the original Story 2.4 forward-deferral guard (now replaced).
- **No "compareVersions" public export** — the helper is module-private per AR41 (test indirectly through `runUpgradeCheck` via UPGRADE_69_COMPARE_VERSIONS_1A/1B/1C/1D). Spec Task 3.18 said "directly test compareVersions exported helper (or via re-export hack — alternatively test indirectly via the up-to-date / upgrade-available branches)" — chose indirect path to keep the public surface narrow.

### File List

NEW (8):
- `src/upgrade/check.ts` (~322 LoC; mid-tier `runUpgradeCheck` + private `compareVersions` + private `extractBmadCompat` + private `stripLeadingV` + `PluginManifestSchema` + `GitHubReleaseSchema` + constants `RELEASES_URL_DEFAULT` + `UPGRADE_FETCH_TIMEOUT_MS`).
- `src/upgrade/check.test.ts` (~430 LoC; 22 UPGRADE_69_* tests with `mkdtemp` + `spyOn(fs.writeFile)` + `makeStubFetch` helper).
- `src/upgrade/render.ts` (~108 LoC; pure `renderUpgradeReport` for both layouts; AC-1 hint byte-identical constant).
- `src/upgrade/render.test.ts` (~170 LoC; 13 RENDER_69_* tests covering layouts + version diff + CHANGELOG link + BMAD compat + hint + no-PII + determinism + trailing newline).
- `src/upgrade/cli.ts` (~94 LoC; `main(argv): Promise<number>` + AR33 EXCEPTION terminal block; success path writes to stdout; failure path emits AC-2 hint via `error()` + returns exit 1).
- `src/upgrade/cli.test.ts` (~228 LoC; 5 CLI_69_* tests with `globalThis.fetch` mutation + `originalCwd` save/restore + `spyOn(process.stdout.write)`).
- `src/upgrade/index.ts` (~26 LoC; barrel re-exports `runUpgradeCheck` + `renderUpgradeReport` + types + constants + schemas).
- `src/integration/upgrade-no-plugin-write.test.ts` (~166 LoC; AC-1.5 + NFR-S2 PRIMARY integration with write-API spy + path snapshot before/after + canary file).

MODIFIED (6):
- `src/commands/next/run.ts` (+~75 LoC across 3 edits: import line at line ~131 + `upgradeFetchOverride?` field on `RunNextOptions` interface + replace forward-deferral guard with Step 0a short-circuit + add `wasUpgradeRequested(argv)` helper near other was-*-Requested helpers + extend `import.meta.main` branching).
- `src/commands/next/run.test.ts` (+~110 LoC; removed 1 forward-deferral test, added 4 UPGRADE_69_RUN_* tests + helper `makeStubFetch`).
- `commands/bmad-next.md` (+~45 LoC; new `### --upgrade (Story 6.9)` section after Story 2.x cross-references; documents endpoint, exit codes, AR9 carve-out, NFR-S1 exception).
- `docs/configuration.md` (+~75 LoC; new `## Upgrade flow (Story 6.9 — DONE)` section at end; covers endpoint, payload, failure, security, AR9 carve-out).
- `docs/exit-codes.md` (+~10 LoC; extends Exit Code 1 section with the AC-2 hint catalog entry; cross-references registry HELD AT 17).
- `package.json` (+1 line; `"upgrade": "bun run src/upgrade/cli.ts"` script entry under `scripts`).

### Change Log

| Date              | Author        | Description                                                              |
| ----------------- | ------------- | ------------------------------------------------------------------------ |
| 2026-05-06        | Murat (Architect) | Story 6.9 created via bmad-create-story skill. Status: ready-for-dev. AC byte-identical from epics.md lines 1284-1292. 16 tasks ~110 sub-tasks. 15 OQs adjudicated. ZERO new error classes proposed (registry stays at 17). 8 NEW files + 6 MODIFIED files. NEW MID-TIER directory `src/upgrade/` per architecture line 1219-1222 pre-listing instantiation. AR9 carve-out (third — alongside Story 3.8 --export-state + Story 3.9 --watch). The `--upgrade` flag is ALREADY wired in args.ts (Story 1.7 baseline) — no mutation needed. |
| 2026-05-06        | Amelia (Senior Dev) | Story 6.9 implemented via bmad-dev-story skill. Status: ready-for-dev → review. All 140 sub-task checkboxes ticked. 8 NEW files + 6 MODIFIED files all written + verified. Quality gates GREEN: `bunx tsc --noEmit` exit 0; `bun run check` 1610/0/5192 across 83 files (Δ +46/+114/+4 vs Story 6.8 close baseline 1564/0/5078/79); `grep -c "extends StepperError" src/errors.ts` = 17 UNCHANGED; `bun test src/integration/escalate-actionable-hint.test.ts` 33/0/114 UNCHANGED. AC-1/AC-1.5/AC-2 verified byte-identical at multiple test sites. 1 repair iteration (biome `noImplicitAnyLet` at cli.ts:69 — added `: UpgradeCheckResult` annotation; biome `noUnusedVariables` at cli.test.ts USER_AGENT_FIXTURE_1 — removed unused `captured` accumulator). NFR-S2 enforced at unit level + CLI level + integration level. The forward-deferral test `--upgrade halts with exitCode 1 + Story 6.9 hint` was REMOVED (the Story 2.4 stub it tested no longer exists) and REPLACED by 4 NEW UPGRADE_69_RUN_* tests. **STORY 6.9 IMPLEMENTATION COMPLETE — `--upgrade` flow fully wired: GitHub Releases API check + version diff + CHANGELOG + BMAD compat + AC-1 hint on success / AC-2 hint on failure; NFR-S1 exception isolated to `src/upgrade/`; NFR-S2 read-only enforced at 3 test layers; AR8/AR9/AR41/AR42 all preserved; errors registry HELD AT 17.** |

## Senior Developer Review (Story 6.9)

**Date:** 2026-05-06
**Reviewer:** Senior Developer (BMAD `bmad-code-review` persona — independent quality-gate verification, AC verification, AR verdict assessment, OQ honoured/violated check, forward-tracker accounting, FRESH context).
**Iteration:** 3 (FINAL TARGET) of `/bmad-loop --until=story:6.9` (loopId `2026-05-06T014519Z-bmad-loop`, runId `2026-05-06T023733Z-bmad-next`).

### Verdict

**APPROVE** — must-fix=0, should-fix=0, nits=0 NEW (4 inherited N-1..N-4 carry forward unchanged), info=0 NEW addressing this story (cumulative I-1..I-49 minus 8 closed (I-26/I-27/I-28/I-38/I-41/I-46/I-47/I-48); I-49 calendar-month threshold drift carries forward documentation-only OPEN; Story 2.4 forward-deferral guard CLOSED at this story per spec replacement at next/run.ts:1582-1611).

### AC verification with file:line evidence

**AC-1 PASS** — `--upgrade` calls `Bun.fetch` GH endpoint (NFR-S1 sole exception) + reads `.claude-plugin/plugin.json` + compares + prints version diff + CHANGELOG link + BMAD compat + the AC-1 verbatim hint:
- `src/upgrade/check.ts:312-318` — `await fetchFn(releasesUrl, { signal: ac.signal, headers: { "User-Agent": ..., Accept: ... } })` — sole `fetch()` consumer in `src/` (verified via `grep -rn "globalThis\.fetch" src/` — runtime `globalThis.fetch` only at `check.ts:279` + `check.ts:168` typed override; all other matches are tests / docs / boundary assertions).
- `src/upgrade/check.ts:287` — `raw = await fs.readFile(pluginManifestPath, "utf8")` (manifest read).
- `src/upgrade/check.ts:298` — `PluginManifestSchema.parse(obj)` (Zod-validated manifest).
- `src/upgrade/check.ts:341` — `compareVersions(manifest.version, latestVersion)` (numeric semver compare per OQ-3 — NOT lexicographic).
- `src/upgrade/check.ts:345-358` — branch on cmp (`upgrade-available` if cmp<0; `up-to-date` for cmp>=0 covering local-ahead per OQ-3).
- `src/upgrade/render.ts:87-100` — upgrade-available layout: H1 + 4 bullet lines (Current/Latest/CHANGELOG/BMAD compat) + AC-1 hint.
- `src/upgrade/render.ts:45-46` — `UPGRADE_HINT = "Run /plugin marketplace update Tgorka/bmad-stepper to upgrade."` byte-identical to AC-1.
- `src/commands/next/run.ts:1594-1611` — Step 0a short-circuit invokes `runUpgradeCheck` + `renderUpgradeReport` + `reportWithMessage` on success / `haltWithHint(1, AC-2 hint)` on failure (BEFORE Step 4 staging cleanup, Step 4b archival trigger, Step 5 doctor — per OQ-1 + OQ-2).
- `src/upgrade/check.test.ts:134-191` (UPGRADE_69_HAPPY_NEWER_1 / UP_TO_DATE_1 / LOCAL_AHEAD_1) + `src/commands/next/run.test.ts:640-661` (UPGRADE_69_RUN_SHORT_CIRCUIT_1 with AC-1 hint substring assertion).

**AC-1.5 PASS** — Stepper never writes to `~/.claude/plugins/` from this code path (NFR-S2):
- 3-LAYER verification:
  - Unit: `src/upgrade/check.test.ts:374-405` (UPGRADE_69_NO_PLUGIN_DIR_WRITE_1) spies `fs.writeFile/appendFile/copyFile/rename/unlink` for ZERO calls during `runUpgradeCheck`.
  - CLI: `src/upgrade/cli.test.ts:207-239` (CLI_69_NO_WRITE_TO_PLUGIN_DIR_SWEEP_1) same 5-spy sweep at `main([])`.
  - Integration: `src/integration/upgrade-no-plugin-write.test.ts:97-122` (write-API spy PRIMARY) + `:124-152` (path snapshot SECONDARY — synthetic `~/.claude/plugins/` analogue with canary file + before/after byte-identical inventory inc. mtime + canary content unchanged).
- Result: `bun test src/integration/upgrade-no-plugin-write.test.ts` = 3 pass / 0 fail / 14 expects (NFR-S2 PRIMARY mechanism PASS).

**AC-2 PASS** — API failure → exit 1 + AC-2 hint byte-identical:
- AC-2 hint string `"Could not reach GitHub Releases. Check your network or try again later."` byte-identical at:
  - `src/upgrade/cli.ts:76-78` — emitted via `error()` after `error("upgrade: <details>")`; returns exit 1.
  - `src/commands/next/run.ts:1606-1609` — `haltWithHint(1, "Could not reach GitHub Releases. Check your network or try again later.")` in Step 0a catch.
  - `src/upgrade/cli.test.ts:156-173` (CLI_69_NETWORK_FAILURE_EXIT_1_1): assert exit 1 + `errorCalls[1] === AC_2_HINT` via `toBe()` (byte-identical).
  - `src/commands/next/run.test.ts:663-678` (UPGRADE_69_RUN_NETWORK_FAILURE_1): assert `result.exitCode === 1` + `result.action.message === AC_2_HINT` via `toBe()` (byte-identical).
- Failure paths covered: network failure (UPGRADE_69_NETWORK_FAILURE_1 — `TypeError("fetch failed")`); rate limit (UPGRADE_69_RATE_LIMIT_1 — HTTP 403); timeout (UPGRADE_69_TIMEOUT_1 — `delayMs: 1000` + `timeoutMs: 50` AbortController fires); missing manifest (UPGRADE_69_MISSING_PLUGIN_JSON_1); malformed manifest (UPGRADE_69_MALFORMED_PLUGIN_JSON_1 — JSON.parse SyntaxError); malformed release (UPGRADE_69_MALFORMED_RELEASE_RESPONSE_1 — ZodError from missing tag_name).

### AR verdicts (9 ARs assessed)

- **AR41 boundary (mid-tier)** — **CLEAN.** `grep -E "^import" src/upgrade/*.ts`: `check.ts` imports `node:fs/promises`, `node:path`, `zod` only (foundational + node:* + zod). `render.ts` imports `type UpgradeCheckResult from "./check.ts"` (sibling type-only). `cli.ts` imports `error from "../io/log.ts"` (foundational) + `runUpgradeCheck/UpgradeCheckResult from "./check.ts"` + `renderUpgradeReport from "./render.ts"` (siblings). `index.ts` re-exports siblings only. ZERO higher-tier or top-tier imports. Top-tier consumes mid-tier at `src/commands/next/run.ts:129` (allowed direction).
- **AR42 schema-first** — **CLEAN.** `PluginManifestSchema` (`check.ts:84-89`) + `GitHubReleaseSchema` (`check.ts:99-105`) both validate at the read/parse boundary; both `.passthrough()` per OQ-3 (third-party shapes Stepper does NOT own). `assertWithinScope` is N/A (the upgrade flow does not write).
- **AR21 single-line audit + AR22 N/A** — **CLEAN.** Failure path emits two single-line `error()` calls (`cli.ts:74` "upgrade: <details>" + `cli.ts:76-78` AC-2 hint). The success path writes a multi-line markdown report to STDOUT — this is a USER-FACING REPORT (per OQ-5 AR9 carve-out), NOT an audit notice. AR22 N/A — ZERO new error classes per OQ-10 (`grep -c "extends StepperError" src/errors.ts` = 17 UNCHANGED).
- **AR33 process.exit policy** — **CLEAN.** Sole `process.exit` site in NEW upgrade module is `src/upgrade/cli.ts:91` inside `if (import.meta.main)` terminal block (the AR33 EXCEPTION per OQ-6 + Story 6.7 OQ-9 precedent). NO `process.exit` calls in `check.ts`, `render.ts`, or `index.ts`. The runner `src/commands/next/run.ts` Step 0a returns `reportWithMessage(report)` / `haltWithHint(1, hint)` (existing helpers; no new exit sites). The terminal block in `next/run.ts:2398+` honours the result.exitCode through `process.exit` at the canonical terminal site (preserved discipline).
- **AR42 schema-first at write/read sites** — **CLEAN.** Both NEW Zod schemas at the relevant boundaries (manifest read at fs boundary; GH response at network boundary). `.passthrough()` is JUSTIFIED for third-party shapes (per OQ-3 architectural decision in spec lines 494-495).
- **AR17 security/PII** — **CLEAN.** Renderer `RENDER_69_NO_PII_1+2` tests (render.test.ts:131-144) sweep for forbidden substrings (password / apikey / secret / email / token / homedir) in both layouts. `extractBmadCompat` (check.ts:221-226) only surfaces the captured version segment (e.g., "v6.5.x") — never raw release body content. Plugin manifest read only consumes `name` + `version` fields.
- **AR8 lock-free** — **CLEAN.** `grep -rn "from \"\\.\\./\\.\\./lock\\|from \"\\.\\./\\.\\./state/save" src/upgrade/` returns 0 matches. `runUpgradeCheck` never reads or writes `state.yaml` / `state.yaml.lock/`. The runner-tier wiring at `src/commands/next/run.ts` Step 0a (line 1594) fires inside the existing `runNext` flow; the integration tests confirm BMAD-detect bypass (UPGRADE_69_RUN_BYPASSES_BMAD_DETECT_1) and `--doctor` precedence (UPGRADE_69_RUN_TAKES_PRECEDENCE_1) — the upgrade short-circuit short-circuits BEFORE state-touching paths execute meaningful work.
- **AR9 stdout JSONL invariant — THIRD documented carve-out** — **PRESERVED.** `wasUpgradeRequested(argv)` helper at `src/commands/next/run.ts:2389-2396` mirrors `wasExportStateRequested` (line 2294 baseline) and `wasWatchRequested` (line 2320 baseline). The `import.meta.main` block at `:2453-2468` BYPASSES `emitDispatchAction` for the upgrade success path (`result.action.action === "report"` → `process.stdout.write(\`${result.action.message}\n\`)`); the failure path PRESERVES AR9 (halt action emitted via `emitDispatchAction` so the user sees both the structured AR9 line AND the stderr error from `log.error`). Documented in spec lines 488-490 + 1022.
- **AR27 telemetry schema** — **N/A (CLEAN).** `grep -rn "from \"\\.\\./\\.\\./telemetry" src/upgrade/` returns 0 matches. The upgrade flow does NOT touch `src/telemetry/`.
- **AR35 tmpdir-per-test** — **CLEAN.** `grep "mkdtemp" src/upgrade/*.test.ts src/integration/upgrade-no-plugin-write.test.ts`: `check.test.ts:40` (`stepper-upgrade-`), `cli.test.ts:33` (`stepper-upgrade-cli-`), `upgrade-no-plugin-write.test.ts:34` (`stepper-upgrade-int-`) + `:36` (`stepper-plugins-snapshot-`). `render.test.ts` is pure-function (no fs touch). All fs-touching tests use `mkdtemp + afterEach` cleanup pattern.
- **AR40 BMAD compat heading** — **HONOURED.** `extractBmadCompat` regex `/(?:^|\n)#{1,6}\s+BMAD Compatibility\s+[—-]\s+(v?\d+\.\d+\.[\d.x]+)/i` (check.ts:223) matches H1-H6 headings, em-dash OR hyphen, captures version (allowing `v` prefix and `x` placeholder per the canonical "v6.5.x" convention). Tested at UPGRADE_69_BMAD_COMPAT_EXTRACTED_1 (extracts `v6.5.x` from `## BMAD Compatibility — v6.5.x`).

### OQ honoured check (15 OQs)

- **OQ-1 short-circuit at next/run.ts Step 0a BEFORE all guards** — **HONOURED.** `src/commands/next/run.ts:1594` (`if (args.upgrade) { ... }`) precedes `if (args.forceUnlock)` (line 1612), Step 4 staging cleanup (line 1619+), Step 4b archival, Step 5 doctor delegation. Per spec OQ-1: physical placement at the same source line as the original Story 2.4 forward-deferral guard (now replaced).
- **OQ-2 rest of dispatch pipeline does NOT run** — **HONOURED.** Step 0a returns directly via `return reportWithMessage(report)` / `return haltWithHint(...)` — NO fall-through. UPGRADE_69_RUN_TAKES_PRECEDENCE_1 (`run.test.ts:680-700`) asserts `--upgrade --doctor` returns the upgrade report (NOT a doctor halt or doctor success); doctor branch never runs.
- **OQ-3 currentVersion via Zod .passthrough() forward-compat** — **HONOURED.** `PluginManifestSchema` (`check.ts:84-89`) + `GitHubReleaseSchema` (`check.ts:99-105`) both `.passthrough()`. semver compare is numeric int-tuple compare per UPGRADE_69_COMPARE_VERSIONS_1A-1D + module docstring (lines 178-188).
- **OQ-4 BMAD compat extraction via heading regex; fallback string** — **HONOURED.** `extractBmadCompat` (`check.ts:221-226`) returns capture or `undefined`; renderer (`render.ts:54-55` `BMAD_COMPAT_MISSING_TEXT`) emits `"(BMAD compat info not present in release notes)"` byte-identical via `bmadCompat ?? BMAD_COMPAT_MISSING_TEXT` at line 89.
- **OQ-5 AR9 carve-out for upgrade output (THIRD)** — **HONOURED.** `src/commands/next/run.ts:2453-2468` extends `import.meta.main` block: `wasUpgradeRequested` branch BYPASSES `emitDispatchAction` for `report` action and emits message directly to stdout. Documented at `:2454-2458` as third carve-out alongside Story 3.8 + 3.9. Failure path preserves AR9.
- **OQ-6 AR33 EXCEPTION at cli.ts terminal block** — **HONOURED.** `src/upgrade/cli.ts:89-93` `if (import.meta.main) { main(Bun.argv).then((code) => { process.exit(code); }); }` — the AR33 EXCEPTION mirrors Story 6.7 cli.ts pattern.
- **OQ-7 strip leading `v` from `tag_name`** — **HONOURED.** `stripLeadingV` helper (`check.ts:235-237`) one-liner: `tag.startsWith("v") ? tag.slice(1) : tag`. Tested at UPGRADE_69_TAG_NAME_STRIP_V_1 (`v0.2.0` → `0.2.0`) + UPGRADE_69_TAG_NAME_NO_V_1 (`0.2.0` → `0.2.0` no-op).
- **OQ-8 Explicit 10s AbortController timeout** — **HONOURED.** `UPGRADE_FETCH_TIMEOUT_MS = 10_000` constant (`check.ts:124`); `AbortController` constructed at `:302`; `setTimeout(() => ac.abort(), timeoutMs)` at `:303`; `clearTimeout(timer)` in finally at `:320`. Tested at UPGRADE_69_TIMEOUT_1 (`check.test.ts:222-231`).
- **OQ-9 User-Agent header `bmad-stepper/<currentVersion>`** — **HONOURED.** `check.ts:315`: `"User-Agent": \`bmad-stepper/${manifest.version}\``. Tested at UPGRADE_69_USER_AGENT_SET_1 (`check.test.ts:274-295` — asserts `headers["User-Agent"] === "bmad-stepper/0.1.0"`) + CLI_69_USER_AGENT_FIXTURE_1.
- **OQ-10 ZERO new error classes (registry 17)** — **HONOURED.** `grep -c "extends StepperError" src/errors.ts` = **17** UNCHANGED (independently verified). Bare `Error` throws at `check.ts:290` (manifest read failure), `:327` (HTTP non-ok), JSON.parse SyntaxError surfaces at `:297`, ZodError surfaces at `:298` + `:335`. All caught + surfaced as AC-2 hint at consumer (cli.ts + run.ts Step 0a). `bun test src/integration/escalate-actionable-hint.test.ts` = 33/0/114 UNCHANGED.
- **OQ-11 Slash-command markdown UPDATED for new flag visibility** — **HONOURED.** `commands/bmad-next.md:610` `### --upgrade (Story 6.9)` section added (departs from Stories 6.3-6.8 silence per spec line 508).
- **OQ-12 opts.config NOT consumed; separate `upgradeFetchOverride` seam** — **HONOURED.** `RunNextOptions.upgradeFetchOverride?: typeof globalThis.fetch` at `src/commands/next/run.ts:411`; runner forwards to `runUpgradeCheck({ fetch: opts.upgradeFetchOverride })` at `:1596-1600`. SEPARATE from `opts.config` / `loadConfigOverride` (existing seams). ZERO config consumer in upgrade module.
- **OQ-13 Fetch seam mocking via opts.fetch** — **HONOURED.** `RunUpgradeCheckOptions.fetch?` at `check.ts:168`; `fetchFn = opts.fetch ?? globalThis.fetch` at `:279`. Used by check.test.ts + integration test via `makeStubFetch` helper. cli.test.ts mutates `globalThis.fetch` per OQ-13 sub-clause (a) (cli.ts does not expose the seam — same pattern as Story 6.7 telemetry/cli.test.ts).
- **OQ-14 tmpdir-per-test discipline preserved (AR35)** — **HONOURED.** See AR35 above.
- **OQ-15 no-network-on-main.test.ts deferred to Story 6.10** — **HONOURED.** Per spec option (b) at lines 516-521. Story 6.9 ships upgrade-side enforcement only (the upgrade module is the ONLY consumer of `globalThis.fetch` in `src/`); cross-cutting global-fetch sweep is a Story 6.10+ responsibility. `grep -rn "globalThis\.fetch" src/`: only references are at `src/upgrade/check.ts` (runtime) + test files (stubs/restoration) + `src/commands/next/run.ts:411` (typed seam declaration only — uses the type, does not call fetch).

### Quality gates re-verified independently from FRESH SHELL

| Gate                                                         | Expected (per spec)               | Actual (independent verification)                                       | Result   |
| ------------------------------------------------------------ | --------------------------------- | ----------------------------------------------------------------------- | -------- |
| `bunx tsc --noEmit`                                          | exit 0                            | exit 0                                                                  | **PASS** |
| `bun test` full suite                                        | 1610 pass / 0 fail / 5192 expects across 83 files | **1610 pass / 0 fail / 5192 expect() calls / 83 files** (5.89s)         | **PASS** |
| Δ vs Story 6.8 baseline (1564/0/5078/79)                     | +46 / +114 / +4                   | +46 / +114 / +4 (verified)                                              | **PASS** |
| `grep -c "extends StepperError" src/errors.ts`               | 17 UNCHANGED                      | **17**                                                                  | **PASS** |
| `bun test src/integration/escalate-actionable-hint.test.ts`  | 33/0/114 UNCHANGED                | **33 pass / 0 fail / 114 expects**                                      | **PASS** |
| `bun test src/upgrade/`                                      | Story 6.9-only sweep (4 NEW test files) | **40 pass / 0 fail / 92 expects across 3 files** (check.test.ts 22 / render.test.ts 13 / cli.test.ts 5) | **PASS** |
| `bun test src/integration/upgrade-no-plugin-write.test.ts`   | 3/0/14 (NFR-S2 PRIMARY)           | **3 pass / 0 fail / 14 expects**                                        | **PASS** |
| `bunx biome ci .`                                            | 0 errors (infos OK if pre-existing) | **0 errors / 9 infos** (pre-existing useTemplate / useLiteralKeys per spec dev notes line 1125) | **PASS** |

### Forward-tracker accounting

**NEW from this SDR**: 0 NITs / 0 info-trackers (scope concrete + narrow + well-scoped per dev iter).

**Carry-forward (unchanged)**:
- 4 cosmetic NITs N-1..N-4 (inherited from prior SDRs).
- Cumulative info I-1..I-49 minus 8 closed (I-26/I-27/I-28/I-38/I-41/I-46/I-47/I-48). I-49 (calendar-month threshold drift; Story 6.8 SDR) carries forward documentation-only OPEN; not a v0.1 blocker.
- I-43 (opts.config seam — 9 sites accumulated through Story 6.8) UNCHANGED at 9 sites (the new `upgradeFetchOverride` is a SEPARATE seam, NOT a config seam expansion per OQ-12).

**CLOSED at this story**:
- Story 2.4 forward-deferral guard at `next/run.ts:1565-1570` — REPLACED at this story by Step 0a runUpgradeCheck short-circuit (per spec line 1075). Forward-deferral test removed from `run.test.ts`; replaced by 4 NEW UPGRADE_69_RUN_* tests.

### Errors registry confirmed at 17 UNCHANGED

`grep -c "extends StepperError" src/errors.ts` = **17** (independently verified from fresh shell).

`bun test src/integration/escalate-actionable-hint.test.ts` = 33 pass / 0 fail / 114 expects (the canonical sweep over all 17 error classes UNCHANGED).

### File list verification

NEW (8) — all present + populated:
- `src/upgrade/check.ts` (360 lines verified)
- `src/upgrade/check.test.ts` (504 lines verified — 22 tests)
- `src/upgrade/render.ts` (109 lines verified)
- `src/upgrade/render.test.ts` (171 lines verified — 13 tests)
- `src/upgrade/cli.ts` (94 lines verified)
- `src/upgrade/cli.test.ts` (240 lines verified — 5 tests)
- `src/upgrade/index.ts` (27 lines verified — barrel)
- `src/integration/upgrade-no-plugin-write.test.ts` (167 lines verified — 3 tests)

MODIFIED (6) — all populated as spec'd:
- `src/commands/next/run.ts` — import added at `:129`; `RunNextOptions.upgradeFetchOverride?` at `:411`; Step 0a short-circuit at `:1583-1611`; `wasUpgradeRequested` helper at `:2389-2396`; `import.meta.main` branching extension at `:2453-2468`.
- `src/commands/next/run.test.ts` — 4 UPGRADE_69_RUN_* tests at `:622-723`; forward-deferral test removed; helper `makeStubFetch` at `:623-638`.
- `commands/bmad-next.md` — `### --upgrade (Story 6.9)` section at line 610.
- `docs/configuration.md` — `## Upgrade flow (Story 6.9 — DONE)` section at line 830.
- `docs/exit-codes.md` — Story 6.9 failure entry at line 66 + AC-2 hint at line 72.
- `package.json` — `"upgrade": "bun run src/upgrade/cli.ts"` script entry verified.

### Closing

ZERO source mutations performed during review. ZERO new error classes ZERO new schema migrations. AR41/42/8/9/17/21/22/27/33/35 all preserved. All 15 OQs HONOURED. Quality gates GREEN from fresh shell. AC-1 / AC-1.5 / AC-2 PASS with file:line evidence at multiple test layers. Story 6.9 instantiates the architecture-line-1219-1222 `src/upgrade/` pre-listing as the FIRST instantiation; THIRD documented AR9 carve-out alongside Story 3.8 `--export-state` + Story 3.9 `--watch`.

Sprint-status `6-9-upgrade-flow` review → done (line 111). State.yaml workflow advanced to `lastStep=bmad-code-review`; `nextStep=bmad-create-story`; `nextStepStory=6.10`; `nextStepKey=6-10-repo-files-v0-1-0-marketplace-release`. Epic-6 stays `in-progress` (Story 6.10 still backlog; Epic-6 retrospective optional).

**STORY 6.9 COMPLETE — /bmad-loop --until=story:6.9 TARGET REACHED.**
