# Configuration: `bmad-stepper.config.yaml`

This document describes the layered configuration model for the
`bmad-stepper` Claude Code plugin (Story 6.1, Epic 6).

## Overview

`bmad-stepper.config.yaml` is the project-level configuration file that
customises the Stepper for your repository. It controls:

- Per-step persona selection (`personas:`).
- DAG overrides — phase pinning, prerequisite/post-requisite insertion,
  optional/skipped flags (`overrides:`).
- Per-step verifier extensions (`verifiers:`).
- Per-step failure policy (`failurePolicies:`).
- Per-step model selection (`models:`).
- Per-step budget caps (`budgets:`).
- Stepper internal paths (`paths:`).
- Telemetry opt-in (`telemetry:`).

Authoring a config file is OPTIONAL. The Stepper ships with a complete
set of plugin defaults and works correctly with no configuration at all.
A project config is the right tool when you want to customise the
behaviour for ALL contributors on a repository.

## File locations

The Stepper reads three layers (highest priority first):

1. **Project config (canonical)** — `bmad-stepper.config.yaml` at the
   repository root (next to `package.json`). COMMITTED to version
   control. This is the primary customisation surface.
2. **User config** — `~/.config/bmad-stepper/config.yaml`. Per-user,
   NOT committed. Useful for personal preferences (e.g., a personal
   `personas:` block) that do not belong in the project's repository.
3. **Plugin defaults** — built into the plugin code at
   `src/config/defaults.ts`. Cannot be modified externally; provides
   the bottom layer in the resolution stack.

> **Note:** The path `.bmad-stepper/config.yaml` (inside the
> `.bmad-stepper/` directory) is RESERVED for Stepper internal state
> (lock files, run history, plugin metadata) and MUST NOT be confused
> with the project-level `bmad-stepper.config.yaml` at the repository
> root.

## Resolution rule

Resolution follows **project > user > defaults** (deep merge per
field). Concretely:

- **Top-level keys**: explicit values in higher-priority layers
  override lower-priority values.
- **Sub-records** (e.g., `failurePolicies`, `personas`, `models`,
  `budgets`): per-key entries from the project layer win; user-layer
  entries fill gaps; defaults fill the remaining gaps. Empty records
  at higher layers DO NOT erase deeper-layer entries.
- **Nested objects** (e.g., `paths`, per-step `budgets[step] = { ... }`):
  per-field deep merge — a project's `paths.runs` does NOT erase a
  user's `paths.state`.
- **Arrays** (e.g., `personas[step]: string[]`): NO concatenation. The
  later layer's array REPLACES the earlier layer's array. (Avoids
  surprising additive semantics; aligns with the typical "user
  overrides default" expectation.)
- **`undefined` values** SKIP — they do not erase deeper-layer values.

### Worked example

Defaults (built into the plugin):

```yaml
schemaVersion: 1
paths:
  state: _bmad-output/.stepper/state.yaml
  runs: _bmad-output/.stepper/runs/
  staging: _bmad-output/.stepper/staging/
  telemetry: _bmad-output/.stepper/telemetry/
telemetry:
  enabled: false
```

User config (`~/.config/bmad-stepper/config.yaml`):

```yaml
schemaVersion: 1
paths:
  state: /home/me/custom-state.yaml
failurePolicies:
  bmad-dev-story: retry
```

Project config (`bmad-stepper.config.yaml`):

```yaml
schemaVersion: 1
failurePolicies:
  bmad-dev-story: route-to-fixer
models:
  bmad-dev-story: opus
```

Resolved config:

```yaml
schemaVersion: 1
paths:
  state: /home/me/custom-state.yaml          # from user
  runs: _bmad-output/.stepper/runs/          # from defaults
  staging: _bmad-output/.stepper/staging/    # from defaults
  telemetry: _bmad-output/.stepper/telemetry/ # from defaults
failurePolicies:
  bmad-dev-story: route-to-fixer             # project wins over user
models:
  bmad-dev-story: opus                       # from project
telemetry:
  enabled: false                             # from defaults
```

## Schema versioning

The top-level `schemaVersion: 1` field is REQUIRED. The Stepper uses
this field to migrate older config files forward when the schema
evolves. As of v0.1, only schema version `1` exists; future versions
will land migrations in `src/migrations/config/`.

If the Stepper encounters a config file with `schemaVersion` HIGHER
than the current version, it exits with `STATE_TOO_NEW` (exit 1) and
the hint: "Run `/bmad-next --upgrade` to install a Stepper version
that supports this schema."

## Top-level keys

### `personas`

Per-step persona selection. Each entry maps a step ID to either a
persona name (string) or an ordered list of personas (string[]).

Multi-persona sequential dispatch is currently a forward-tracker
(Stories 4.1 + 5.* contemplated this); v0.1 picks the FIRST element
when an array is supplied.

```yaml
personas:
  bmad-dev-story: amelia
  bmad-code-review: ["amelia", "indie"]
```

### `overrides`

DAG overrides for skill resolution. Each entry maps a skill ID to an
optional set of fields:

- `phase` — pin the step into one of the 5 valid Phase values
  (`analysis | planning | solutioning | implementation | retro`).
- `after` — additional prerequisite step IDs (the step waits for these
  to complete first).
- `before` — additional post-requisite step IDs (the step is required
  before these begin).
- `optional` — mark the step as optional (skipped unless explicitly
  enabled with `--include-optional` or via per-iteration options).
- `persona` — persona identifier(s) for the override step (string,
  string-array, or null); defers to the persona resolver.
- `idempotent` — when `true`, the runner may safely retry on failure
  (Story 5.1 retry semantics).

Story 6.2 lands the **strict Tier 2 consumer**. When an `overrides:`
block is present, the DAG builder consumes the typed map directly via
`config.overrides` (no YAML parse, no graceful degradation). Override
entries either replace a seed entry of the same name or append a new
node to the resolved DAG. Tarjan SCC cycle detection runs unchanged
after the patch.

```yaml
overrides:
  architecture-validator:
    phase: solutioning
    after:
      - bmad-create-architecture
    optional: true
```

#### Worked example — replace a seed entry

The seed (`src/dag/seed-v6.x.ts`) places `bmad-create-prd` at phase
`planning` with `after: [bmad-product-brief]`. To pin it into the
`solutioning` phase under the `architect` persona instead, write:

```yaml
overrides:
  bmad-create-prd:
    phase: solutioning
    after:
      - bmad-product-brief
    optional: true
    persona: architect
```

The DAG builder sees `config.overrides["bmad-create-prd"]`, merges the
override fields onto the seed entry, and re-runs Tarjan SCC. The
resulting `bmad-create-prd` node carries the override phase, the
override persona, and the (unchanged) seed `after` topology.

#### Phase enum

The `phase` field MUST be one of the 5 valid values exported by
`PhaseSchema` (`src/schemas/config.ts`):

- `analysis`
- `planning`
- `solutioning`
- `implementation`
- `retro`

Any other value (e.g., `phase: deployment`) surfaces as a `CONFIG_ERROR`
(exit code 2) at load time with a single-line, field-pointing hint.

#### Validation errors (Story 6.2 strict Tier 2)

Story 6.2 introduces strict validation at the DAG builder. Authoring
mistakes surface as a single-line `CONFIG_ERROR` (exit code 2) at load
time instead of silently misordering the DAG:

- **Unknown predecessor** (`after: [missing-skill]`) → hint format:
  `See bmad-stepper.config.yaml at overrides.<skill>.after[<index>]: predecessor "<missing>" is not a known skill. Run /bmad-next --doctor to validate the file against the schema.`
- **Unknown successor** (`before: [missing-skill]`) → symmetric format
  pointing at `before[<index>]`.
- **Invalid phase** (`phase: deployment`) → Zod parse-time rejection
  with the `phase` field path in the hint.
- **Unknown sub-key** (e.g., `optionnal: true` typo) → Zod parse-time
  rejection per `.strict()` with the unknown key in the hint.

The hint format satisfies the AR22 actionable-hint contract (leading
`See` and trailing `Run /bmad-next --doctor` both match the regex
`/^.*(Run|See|Try|Check) /`) and is a single line (no `\n`/`\r`).
Override-introduced cycles still surface as `DAG_CYCLE` (exit code 3)
via the existing Tarjan SCC path.

See architecture lines 411-443 (D5 three-tier discovery) and
`src/dag/build.ts` for the resolver implementation.

### `verifiers`

Per-step verifier configuration extensions. Each entry maps a step ID
to an optional set of fields:

- `requiredFiles` — additional files the verifier checks for existence.
- `requiredFrontmatterSections` — additional frontmatter sections the
  verifier checks within the step's primary artifact.
- `mode` — `"merge"` (default — combine with the registry baseline) or
  `"replace"` (replace the registry baseline entirely).

```yaml
verifiers:
  bmad-dev-story:
    requiredFrontmatterSections:
      - "Implementation Plan"
    mode: merge
```

**Wiring (Story 6.5).** The verifier registry resolves a per-step
config via `getVerifierConfig(stepName, projectVerifiers?)` (in
`src/verifiers/registry.ts`). When `projectVerifiers` is supplied via
`opts.config.verifiers` (threaded from `loadConfig()` through
`runVerifyAndAdvance`), the registry layers the project entry on the
plugin baseline per the entry's `mode` field. The merged config is
fed into `runVerifier` → `checkRequiredFiles` / `checkFrontmatter`,
which surface any unmet requirements as `verifier-result.json`
`status: "fail"`. See architecture §D9 line 490 for the resolution
priority.

**`mode` semantics.**

- `"merge"` (default) — array union with baseline-order-preserved and
  de-dup. Baseline entries appear first in their original order;
  override entries that are NOT already in the baseline are appended in
  order. Worked example: baseline `["title", "status"]` +
  override `["status", "owner"]` → merged
  `["title", "status", "owner"]` (`"status"` not duplicated;
  `"owner"` appended).
- `"replace"` — full-section replacement. Explicit fields in the
  override take effect; UNSET fields fall through to **empty arrays**
  (NOT to the baseline — opting into `"replace"` means clearing the
  baseline section). Worked example:
  `{ requiredFrontmatterSections: ["title", "owner"], mode: "replace" }`
  applied to a baseline with `requiredFiles: ["**/*.md"]` →
  `{ requiredFiles: [], requiredFrontmatterSections: ["title", "owner"] }`
  (the baseline `requiredFiles` is cleared).

**AR17 security boundary (AC-2).** Custom checks (the registry-side
`custom?` callback on `VerifierConfig`) and Zod schemas (the registry-
side `schema` field) are **plugin-side only** — declared in
`src/verifiers/defaults.ts` and never sourced from project config. The
schema-side `VerifierConfigSchema` deliberately declares NO `custom` /
`customFn` / `judge` / `schema` / `verifierFile` field, and Story 6.5
applies `.strict()` so these unknown keys are rejected at LOAD time
with a single-line `ConfigError` actionable hint. The merge logic in
`getVerifierConfig` reads `custom?` and `schema` from the BASELINE
only — defence-in-depth per AR42. v0.1 ships ZERO `custom` callbacks
across all 8 plugin defaults; the seam exists for plugin-side
extensions (Story 6.x — LLM-as-judge `judge:` field per architecture
line 1727).

**AC-3 schema-mismatch failure mode.** Project YAML cannot reference
a non-existent Zod schema, supply executable code, or carry deferred
fields like `judge:`. Any of the following surface `ConfigError` exit
2 at LOAD time (BEFORE any verifier dispatch) with a single-line
actionable hint pointing at the unrecognized key:

```yaml
verifiers:
  bmad-dev-story:
    schema: MySchema       # → ConfigError (AC-3 PRIMARY)
```

```yaml
verifiers:
  bmad-dev-story:
    customFn: { name: x }  # → ConfigError (AR17 — no user code)
```

```yaml
verifiers:
  bmad-dev-story:
    judge: claude          # → ConfigError (LLM-as-judge deferred)
```

```yaml
verifiers:
  bmad-dev-story:
    custom: "() => true"   # → ConfigError (AR17 — symmetric)
```

```yaml
verifiers:
  bmad-dev-story:
    mode: replace-all      # → ConfigError (mode enum constraint)
```

Cross-references: AR17 (security boundary), AR21 (single-line hint),
AR22 (actionable hint regex `/^.*(Run|See|Try|Check) /`), and the
architecture line 1727 LLM-as-judge deferred extension.

### `failurePolicies`

Per-step failure-mode policy. Values are the closed enum:

- `retry` — retry the step on failure (up to `--max-retries`).
- `skip` — log the failure and skip this step; advance state.
- `route-to-fixer` — route to a fixer-type sub-agent before retrying.
- `escalate` — surface the failure to the user with an actionable hint.

When no policy is set for a step, the resolver falls back to
`escalate` per architecture line 499.

See `commands/bmad-loop.md` for the canonical reference (Story 5.6
single-source-of-truth pattern).

```yaml
failurePolicies:
  bmad-dev-story: retry
  bmad-code-review: route-to-fixer
```

### `models`

Per-step model selection. Values are the closed enum
`sonnet | opus | haiku`. **Story 6.3 — wired** (the dispatch-spec.json's
`model` field reflects the configured value; default `sonnet` if not
configured).

```yaml
models:
  bmad-dev-story: opus
  bmad-code-review: sonnet
```

#### Wiring (Story 6.3)

- The runner reads `config.models[stepName]` and threads the resolved
  value into `buildDispatchSpec({ modelOverride })` at the canonical
  dispatch site (`src/commands/next/run.ts`).
- When `config.models[stepName]` is undefined (no per-step config), the
  generator falls back to the canonical `"sonnet"` default at
  `src/dispatch/generate-spec.ts:196` — the default-with-override
  semantic established by Story 2.2.
- The dispatch info-log line at `src/dispatch/generate-spec.ts:240-248`
  surfaces the resolved model on stderr (FR54): `dispatch: built spec
  for step <stepName> (model <model>) at <path>`.
- The markdown transcript renderer (`src/runs/render-markdown.ts`)
  surfaces the resolved model in the new "## Dispatch metadata" section
  (Story 6.3 OQ-3 — Section 2 of 8) for audit purposes. The JSON run
  log already records the field via Story 2.5's `RunLogV1Schema.model`.

#### Task tool `model` parameter (where supported)

Per AC-2, the slash-command markdown (`commands/bmad-next.md` step 3)
forwards the configured model to the Task tool's `model` parameter:

```
Task(
  agent  = <jsonLine.agent>,
  prompt = "staging/<jsonLine.runId>/dispatch-spec.json",
  model  = <dispatchSpec.model>
)
```

If the Claude Code Task tool runtime does not honour the `model`
parameter (e.g., on a future runtime change or a bound persona that
cannot accept the parameter), the runtime falls back to its default
behaviour. Stepper still records the configured model in the
dispatch-spec.json + transcript markdown + JSON run log for audit
purposes — the configured model is the user's INTENT; runtime
acceptance is best-effort.

### `budgets`

Per-step budget caps. Each entry is an optional set of fields:

- `contextTokens` — context-window cap in tokens (positive integer).
- `timeoutMs` — wall-clock cap in milliseconds (positive integer).

Both fields are OPTIONAL; the budget enforcer (Story 6.4 — DONE)
threads `config.budgets[stepName]` into `buildDispatchSpec.budgetOverride`,
which falls back to `60000` / `300000` defaults when the per-step
config is absent. Partial overrides are supported: e.g.,
`{ contextTokens: 80000 }` overrides only `contextTokens` and
`timeoutMs` falls through to the `300000` default.

```yaml
budgets:
  bmad-dev-story:
    contextTokens: 80000
    timeoutMs: 600000
```

Story 6.4 — `BudgetSchema` is `.strict()` (rejects unknown fields
like `costUsd` or `maxToolCalls` at LOAD time with a single-line
`CONFIG_ERROR` exit 2). Fields beyond `contextTokens` + `timeoutMs`
fail validation; existing fixtures are non-breaking.

#### Wiring (Story 6.4)

- The runner reads `opts.config?.budgets?.[stepName]` and threads it
  via `buildDispatchSpec.budgetOverride`.
- The dispatch-spec.json's `budget.contextTokens` + `budget.timeoutMs`
  fields reflect the configured values; defaults `60000` / `300000`
  fire when no per-step config is supplied per AC-1.
- The dry-run preview message (`stepper next --dry-run`) surfaces the
  resolved budget so the user can audit per-step routing
  (e.g., `(sonnet, 80k context, 10min timeout)`).

#### TIMEOUT contract (where supported)

- The dispatch-spec.json's `budget.timeoutMs` is the configured cap.
  The Layer 1 slash-command markdown reads the cap from
  `staging/<runId>/dispatch-spec.json` for audit; the Claude Code Task
  tool runtime is responsible for enforcing the cap and surfacing a
  `TIMEOUT` condition if exceeded.
- Best-effort: the Task tool does NOT accept a per-call `timeoutMs`
  parameter; runtime caps are tool-internal. Stepper records the cap
  in the dispatch-spec.json + transcript markdown + JSON run log for
  audit purposes — the configured cap is the user's INTENT; runtime
  enforcement is best-effort. (Same stance as Story 6.3 OQ-2 for the
  `model` parameter — see `commands/bmad-{loop,next}.md` for the
  caveat language.)
- When the runtime exceeds the cap, the slash-command markdown
  forwards `--error-code TIMEOUT` to `verify-and-advance.ts` which
  constructs `TimeoutError` (registry code `TIMEOUT`, exitCode `1`,
  single-line hint). A future Story 6.x may add Bun-side enforcement
  (forward-tracker I-44).

#### Audit trail (AC-3)

- Every budget value surfaces in the markdown transcript Section 2
  "## Dispatch metadata" Budget bullet (`Budget: <ctx> tokens / <s>s
  timeout`) — Story 6.3 OQ-3 baseline.
- The stderr `info()` log line at `src/dispatch/generate-spec.ts`
  surfaces ONLY non-default budget values (substring `, budget
  <ctxTokens>/<timeoutMs>ms`) — minimises log noise for the common
  60_000 / 300_000 case. AC-3 "budget changes" wording honoured
  verbatim.
- The JSON run log (`<runId>.json`) records the budget on every
  dispatch (Story 2.5 baseline).

Cross-link: architecture line 782 (config schema) + architecture
lines 793-813 (dispatch-spec.json shape) + `TimeoutError` in the
errors registry.

### `paths`

Stepper internal directory paths. All four fields are REQUIRED if a
`paths:` block is supplied (defaults are filled per-field via
deep-merge).

- `state` — `state.yaml` path (default
  `_bmad-output/.stepper/state.yaml`).
- `runs` — runs directory root (default `_bmad-output/.stepper/runs/`).
- `staging` — staging directory root (default
  `_bmad-output/.stepper/staging/`).
- `telemetry` — telemetry directory root (default
  `_bmad-output/.stepper/telemetry/`).

The Stepper writes inside these paths via `assertWithinScope()` (paths
must remain inside `_bmad-output/`, `_bmad-output/.stepper/`, or
`os.tmpdir()` per AR42).

```yaml
paths:
  state: _bmad-output/.stepper/state.yaml
  runs: _bmad-output/.stepper/runs/
  staging: _bmad-output/.stepper/staging/
  telemetry: _bmad-output/.stepper/telemetry/
```

### `telemetry`

Opt-in telemetry. The single `enabled: boolean` field defaults to
`false` per the privacy-first NFR-S3 requirement.

When `enabled: true`, the Stepper writes per-iteration telemetry
records to the `paths.telemetry` directory.

```yaml
telemetry:
  enabled: false
```

#### Wiring (Story 6.6)

When the verify-and-advance step-completion finalization site fires
(Step 12.25 in `src/commands/next/verify-and-advance.ts` finally
block), the runner builds a `TelemetryRecord` with these closed-set
fields and calls `writeTelemetryRecord(record, opts?)` from
`src/telemetry/index.ts` (mid-tier per AR41):

| Field            | Source                                                   |
|------------------|----------------------------------------------------------|
| `schemaVersion`  | literal `1` (Story 1.5 baseline)                         |
| `ts`             | ISO-8601 from `opts.nowIso ?? new Date().toISOString()`  |
| `step`           | `dispatchSpec.step`                                      |
| `phase`          | `derivePhaseFromStep(dispatchSpec.step)`                 |
| `persona`        | `dispatchSpec.taskSpec.persona`                          |
| `model`          | `dispatchSpec.model` (Story 6.3 default `"sonnet"`)      |
| `durationMs`     | `Math.round(performance.now() - startMs)`                |
| `verifierStatus` | `verifierResult.status` (`"pass" \| "fail" \| "skip"`)    |
| `retries`        | `accumulatedRunHistoryFromRetries.length`                |
| `tokensIn`       | `args.tokensIn ?? 0`                                     |
| `tokensOut`      | `args.tokensOut ?? 0`                                    |
| `errorCode?`     | `outcomeError.code` when present                         |

The writer appends one JSON line per call to
`<paths.telemetry>/<YYYY-MM>.jsonl` (the monthly file is derived from
`ts.slice(0, 7)` — UTC-locked because `new Date().toISOString()` always
returns the `Z` suffix). Cross-link: architecture line 1664 (telemetry
"no PII" closed-set whitelist).

#### NFR-S3 anti-PII boundary (AC-2)

`TelemetryRecordV1Schema` at `src/schemas/telemetry.ts` is `.strict()`.
Every record passes through `TelemetryRecordV1Schema.parse(...)`
defence-in-depth at the writer entry point — extra fields throw a Zod
`unrecognized keys` error. The CI test at `src/telemetry/collect.test.ts`
verifies rejection of synthetic excess fields (`password`, `prompt`,
`response`, `cwd`, `apiKey`). Cross-link: AR17 (security boundary), AR42
(schema-first validation), architecture line 1664.

Worked example (rejected):

```ts
writeTelemetryRecord({
  ...validRecord,
  prompt: "user input goes here",  // ← extra field; throws ZodError.
});
```

#### AC-3 opt-in gate

`telemetry.enabled: false` (default) → ZERO file system writes. The
gate is `opts?.config?.telemetry?.enabled === true` (strict-equals)
at the verify-and-advance Step 12.25 site. The strict-equals rejects
`undefined`, `false`, `null`, `0`, `""` — only the literal `true`
opens the writer. When disabled, the entire telemetry block is
skipped (no `mkdir`, no `appendFile`, no scope-check).

#### File path + JSONL append semantics

- File path: `<paths.telemetry>/<YYYY-MM>.jsonl`. Default
  `paths.telemetry` is `_bmad-output/.stepper/telemetry/`. The
  `<YYYY-MM>` rotation is derived from `record.ts` (UTC-locked).
- Append-mode: records are appended via `fs.appendFile` (NOT
  `atomicWrite` tmp+rename — JSONL is append-only). Per-record
  atomicity follows from POSIX `O_APPEND` semantics (writes <
  PIPE_BUF size are atomic; a TelemetryRecord JSON line is well under
  1 KB).
- Monthly rotation is automatic via the `ts → YYYY-MM` derivation;
  12-month archival is Story 6.8 (forward).

#### Aggregation report (Story 6.7)

Run `bun run aggregate-telemetry --period <YYYY-MM>` to produce a
structured markdown report at `<paths.telemetry>/<period>.md`. The
report has six sections (H1 + 5 H2 sections):

1. `# Telemetry Aggregate — <period>` (H1).
2. `## Summary` — record count (parsed + skipped malformed),
   period range (first/last `ts`), distinct steps.
3. `## Per-step aggregates` — table with 7 columns:
   `Step | Count | Mean ms | p95 ms | Retry rate | Verifier-fail rate |
   Mean tokens (in/out/total)`. Rows alphabetized by step name.
4. `## Verifier outcomes` — per-status table (pass / fail / skip)
   with count + percentage columns.
5. `## Failure patterns` — per-`errorCode` table sorted by count
   descending. When no failures, renders the `None observed.`
   paragraph (no table).
6. `## Schema notes` — static block referencing `TelemetryRecordV1Schema`
   (closed-set 12-field whitelist per NFR-S3).

The report contains no PII / no source content (NFR-S3 transitively
via `TelemetryRecordV1Schema.strict()` enforced upstream at write time
and re-validated on read with `parse()`). The integration test
`src/integration/aggregate-telemetry-no-pii.test.ts` asserts the
absence of forbidden substrings (`password`, `prompt`, `response`,
`apiKey`, `secret`, `homeDir`, `email`, `userInput`, `userPrompt`)
in the rendered output.

NFR-P6: report generation completes within 2 seconds for one week of
run logs (architecture line 1395). The implementation reads the JSONL
file whole, parses each line through Zod (defence-in-depth), groups
by step name, and produces a deterministic markdown string. Sizing
analysis: ~700 records/week × ~250 bytes ≈ 175 KB; whole-file read
plus O(n) linear pass yields ~10 ms wall-clock for 1000 records on
commodity hardware — comfortably within the 2-second budget.

Per OQ-7, malformed JSONL lines (truncated JSON, extra fields rejected
by `.strict()`) are SKIPPED with a single-line `log.warn` audit and
counted into the `parseErrorCount` field surfaced under `## Summary`.
A single corrupted line does NOT halt the aggregator — the v0.1
dogfood signal favours degraded data with explicit annotation over
no data at all.

Exit codes: `0` (success), `1` (usage error / missing JSONL file).
The aggregator does NOT use exit 2 because it is NOT a CONFIG_ERROR.

## Error handling

Invalid config files surface as `CONFIG_ERROR` (exit code 2) with a
single-line, Zod-derived, field-pointing actionable hint of the form:

```
See bmad-stepper.config.yaml at <field-path>: <Zod-message>. Run /bmad-next --doctor to validate the file against the schema.
```

The hint is single-line by design (per AR22 + Story 5.6 single-line
constraint). For a full multi-error validation report, run
`/bmad-next --doctor` (Story 1.12) — the doctor command surfaces every
Zod issue at once.

YAML parse errors (malformed YAML) surface with a similar single-line
hint pointing at the offending file path.

A `schemaVersion` higher than the loader's current version surfaces as
`STATE_TOO_NEW` (exit code 1) with the hint pointing at
`/bmad-next --upgrade`.

## Forward-tracker — Stories 6.3-6.8

Stories 6.1 + 6.2 ship the **loader + schema + DAG override consumer**.
The per-key consumer behaviour lands in later Epic 6 stories:

- **Story 6.2** — DONE — `overrides:` wired into the DAG builder via
  the strict Tier 2 path (`config.overrides` consumed directly; unknown
  predecessor / successor → `CONFIG_ERROR` exit 2 with single-line
  edge-pointing hint).
- **Story 6.3** — DONE — `models:` wired into the per-step model
  dispatcher (`config.models[stepName]` → `buildDispatchSpec.modelOverride`
  → dispatch-spec.json's `model` field with `"sonnet"` default).
  Slash-command markdown forwards the model to the Task tool (where
  supported per AC-2 caveat). Markdown transcript renders Model in the
  new "## Dispatch metadata" section.
- **Story 6.4** — DONE — `budgets:` wired into the per-step budget
  enforcer (`config.budgets[stepName]` → `buildDispatchSpec.budgetOverride`
  → dispatch-spec.json's `budget.contextTokens` + `budget.timeoutMs`
  with `60000` / `300000` defaults). `BudgetSchema.strict()` rejects
  unknown fields. Slash-command markdown documents the AC-2 best-effort
  timeout cap forward (where supported caveat). Markdown transcript
  Section 2 records every budget value; stderr `info()` log surfaces
  only non-default values per AC-3.
- **Story 6.5** — DONE — `verifiers:` wired into the per-step verifier
  registry (`config.verifiers[stepName]` →
  `getVerifierConfig(stepName, projectVerifiers)` → merge / replace per
  the entry's `mode` field). `VerifierConfigSchema.strict()` rejects
  unknown fields at LOAD time per AR17 + AC-3 dual-purpose security
  boundary. `custom?` callback + `schema` field remain plugin-side
  only (defence-in-depth via schema declaration + `.strict()`).
- **Story 6.6** — DONE — `telemetry:` wired into the JSONL writer
  (`writeTelemetryRecord(record, opts?)` at `src/telemetry/collect.ts`
  called at the verify-and-advance Step 12.25 finally block when
  `config.telemetry.enabled === true`). `TelemetryRecordV1Schema.strict()`
  defence-in-depth on every write rejects extra fields (NFR-S3 anti-PII
  boundary). Best-effort try/catch + `log.warn` fallback so a Zod
  parse error or filesystem ENOSPC does NOT mask the verifier outcome.
- **Story 6.7** — DONE — telemetry aggregation report at
  `bun run aggregate-telemetry --period <YYYY-MM>` (reads the JSONL
  files Story 6.6 writes; produces a 5-section markdown summary at
  `<paths.telemetry>/<period>.md` per FR45 + NFR-P6). See the
  "#### Aggregation report (Story 6.7)" sub-section above for the
  layout, no-PII guarantee, performance contract, and exit codes.
- **Story 6.8** — DONE — auto-archival of runs (> 90 days →
  `<paths.runs>/.archive/<YYYY-MM>/`) and telemetry (> 12 months →
  `<paths.telemetry>/.archive/`); fires once per Stepper session at
  `/bmad-next` or `/bmad-loop` startup; non-blocking + idempotent +
  telemetry-rotation gated on `telemetry.enabled`. See
  `## Auto-archival (Story 6.8 — DONE)` section below for details.

Until those stories land, the schema validates the fields' shape and
the loader produces a typed `Config` value, but the runtime ignores
the per-key entries (resolves to plugin defaults).

## Auto-archival (Story 6.8 — DONE)

Story 6.8 ships an automatic archival/rotation pair that fires at
Stepper start (any command) to keep the active runs and telemetry
directories from growing unbounded. Two independent paths:

1. **Runs > 90 days** are moved to
   `<paths.runs>/.archive/<YYYY-MM>/<basename>` (per NFR-Sc4 +
   architecture line 1413). The `<YYYY-MM>` subdir is derived from each
   file's mtime (UTC-locked per the Story 6.6 + 6.7 + 6.8 transitive
   I-48 discipline). Both halves of a Story 2.5 paired transcript
   (`<ts>-<step>.log` + `<ts>-<step>.json`) move together because both
   share the same mtime.
2. **Telemetry > 12 months** are moved to
   `<paths.telemetry>/.archive/<basename>` (FLAT layout — no per-period
   subdir, since the filename `<YYYY-MM>.{jsonl,md}` already carries
   the period; per architecture line 358 + Story 6.8 OQ-8). Only
   canonical `<period>.{jsonl,md}` files are eligible — foreign files
   (`notes.txt`, `.DS_Store`, etc.) are LEFT ALONE per OQ-7.

### Startup-trigger semantics

The archival trigger fires on the FIRST `/bmad-next` or `/bmad-loop`
invocation per Bun-process session (the closure-private
`oncePerSessionRef` flag mirrors the Story 4.9 SIGINT pattern). Within
a single `bun run` invocation, archival runs at most once. Across
separate invocations (separate Bun processes), each process re-fires;
the threshold filter naturally short-circuits already-moved files.

The trigger is gated on `!args.dryRun` (next/run.ts) and
`!args.planFirst` (loop/run.ts) — both flags are read-only modes that
must not mutate the inventory.

### Non-blocking + best-effort

Archival NEVER blocks the user's command (per AC-4 verbatim). The
runner-tier callers fire-and-forget via
`void runArchivalAtStartup({config}).catch(...)`. The async work
proceeds concurrently with the dispatch path; the audit notice
emerges asynchronously to stderr. Per-entry failures are logged via
`warn()` but do NOT propagate (Story 2.2 staging-cleanup precedent).

### Idempotency (AC-3)

The archival pair is idempotent across THREE layers:

1. The closure-private `oncePerSessionRef` short-circuits within a
   single session.
2. The mtime threshold filter naturally re-skips already-moved files.
3. The `.archive/` subdir is hard-skipped at the entry-loop level so
   files inside `.archive/` are NEVER re-evaluated.

### `telemetry.enabled` gate (AC-2 verbatim)

Telemetry rotation is GATED on `config.telemetry.enabled === true` per
AC-2 verbatim. When telemetry is disabled, the JSONL+md files do not
exist; the rotate.ts module is bypassed entirely. Runs archival is NOT
gated — runs are written by every `/bmad-next` invocation regardless
of telemetry config; their 90-day archival is unconditional per AC-1.

### Audit notice (AR21)

A single-line `info()` message is emitted to stderr on the FIRST
invocation per session WHEN ANY work was done:

```
archival: archived <runs-count> runs older than 90 days, <telemetry-count> telemetry files older than 12 months
```

When BOTH counts are 0 (the most common case on a fresh project), the
notice is SUPPRESSED to avoid spam.

### Cross-links

- `src/runs/archive.ts` — `archiveOldRuns(opts)` (AC-1; NFR-Sc4).
- `src/telemetry/rotate.ts` — `rotateOldTelemetry(opts)` (AC-2;
  NFR-Sc5).
- `src/startup/archival-trigger.ts` — `runArchivalAtStartup(opts)`
  orchestrator (AC-3; AC-4).
- `src/integration/auto-archival-startup.test.ts` — primary AC-1/2/3/4
  integration test.
- `_bmad-output/planning-artifacts/architecture.md` §lines 1413-1414 —
  NFR-Sc4 + NFR-Sc5 source.
- `_bmad-output/planning-artifacts/epics.md` §lines 1269-1276 —
  AC-1/AC-2/AC-3/AC-4 verbatim.

### What is NOT covered (forward-trackers)

- Calendar-month subtraction for the 12-month threshold (v0.1 uses
  ms-arithmetic — `12 * 30 * 24 * 60 * 60 * 1000` ms ≈ 360 days; the
  ~5-day slack is acceptable per AC-2 wording).
- Configurable archival thresholds via `bmad-stepper.config.yaml`
  (the 90-day + 12-month constants are fixed in code; tests inject
  overrides via the function options seam).
- Aggregating archived periods (post-v0.1 forward per Story 6.7 OQ-3 —
  the aggregator reads only the active dir).
- Compression of archived files (`.tar.gz`, `.zstd`) — v0.1 simply
  renames files; archived files remain individually readable.

## Cross-references

- `src/schemas/config.ts` — the Zod schema source-of-truth.
- `src/config/load.ts` — the three-layer file loader.
- `src/config/defaults.ts` — the plugin-default constant.
- `src/migrations/config/index.ts` — the per-family migration registry.
- `commands/bmad-loop.md` and `commands/bmad-next.md` — slash-command
  reference (Story 5.6 + Story 6.1 cross-link).
- `_bmad-output/planning-artifacts/architecture.md` §P3 (lines 773-790)
  — architectural source for the schema shape.
- `_bmad-output/planning-artifacts/prd.md` FR34-FR40 — functional
  requirements covered by Story 6.1.

## Upgrade flow (Story 6.9 — DONE)

The `--upgrade` flag (`/bmad-next --upgrade` or the standalone CLI
`bun run upgrade`) checks the GitHub Releases API for a newer Stepper
version. The flow is read-only — Stepper NEVER auto-installs and NEVER
writes to `~/.claude/plugins/` (NFR-S2 + AC-1 verbatim).

### Endpoint and payload

- **Endpoint:** `https://api.github.com/repos/tgorka/bmad-stepper/releases/latest`.
- **Permitted by NFR-S1:** the ONLY main-thread network I/O in the
  Stepper code path; all other paths are network-free (architecture
  §line 646-657 D14 + §line 1396 NFR-S1 mapping).
- **Current version source:** `.claude-plugin/plugin.json:version` —
  read at runtime via `fs.readFile` + `JSON.parse` + Zod-validated
  `PluginManifestSchema`. No hard-coded version (NFR-M3).
- **CHANGELOG link:** taken from the release's `html_url` field
  (e.g., `https://github.com/tgorka/bmad-stepper/releases/tag/v0.2.0`).
- **BMAD compatibility extraction:** the GitHub release body is
  searched for a `## BMAD Compatibility — vX.Y.x` heading (regex
  `/(?:^|\n)#{1,6}\s+BMAD Compatibility\s+[—\-]\s+(v?\d+\.\d+\.[\d.x]+)/i`);
  when present the captured version is rendered; when absent the
  report shows `(BMAD compat info not present in release notes)`.
- **Tag normalization:** GitHub releases conventionally use `v<version>`
  (e.g., `v0.1.0`); the upgrade flow strips a leading `v` before
  comparing to the bare manifest version.
- **Semver compare:** numeric `[major, minor, patch]` integer-tuple
  compare (NOT lexicographic string compare — `0.10.0 > 0.9.0` is
  numerically correct).

### Failure semantics

- **Exit code 1 + AC-2 hint:** when the API call fails (offline, 403
  rate limit, 4xx/5xx, 10s `AbortController` timeout, malformed
  response, missing or malformed plugin manifest), Stepper exits 1 with
  the byte-identical hint `Could not reach GitHub Releases. Check your
  network or try again later.` See `docs/exit-codes.md` for the
  verbatim exit-1 catalog entry.

### Security and discipline

- **Never auto-installs:** ZERO writes to `~/.claude/plugins/` from
  this code path (AC-1 verbatim + NFR-S2 enforced by integration test
  `src/integration/upgrade-no-plugin-write.test.ts` — sweeps
  `fs.writeFile` / `fs.appendFile` / `fs.copyFile` / `fs.rename` /
  `fs.unlink` for ZERO calls + snapshot-before-after of a synthetic
  `~/.claude/plugins/` analogue).
- **User-Agent header:** the GH API request includes
  `User-Agent: bmad-stepper/<currentVersion>` per GitHub's API
  documentation recommendation. The Stepper version is the only audit
  signal Stepper exposes to GitHub.
- **Timeout budget:** 10 seconds (`UPGRADE_FETCH_TIMEOUT_MS = 10_000`
  ms; explicit `AbortController` budget; not configurable in v0.1).
- **Errors registry HELD AT 17:** Story 6.9 ships ZERO new error
  classes. Network / data failures throw bare `Error` and the
  orchestrator (cli.ts + runner-tier wiring) surfaces the AC-2 hint
  at the catch site. The 33-test `escalate-actionable-hint.test.ts`
  sweep over all 17 error classes is UNCHANGED.

### AR9 carve-out (third documented)

The upgrade success report goes to stdout DIRECTLY (NOT wrapped in the
AR9 JSON line) — alongside Story 3.8 `--export-state` (JSON body) and
Story 3.9 `--watch` (raw transcript). The runner detects `--upgrade`
in argv at the `import.meta.main` block via the `wasUpgradeRequested`
helper and bypasses `emitDispatchAction` for the success path. The
failure path PRESERVES AR9 — the halt action is emitted normally so the
user sees the structured halt message in addition to the stderr error.

See `docs/exit-codes.md` for the verbatim exit-1 hint and the
`commands/bmad-next.md` `### --upgrade (Story 6.9)` section for the
slash-command surface.
