---
name: bmad-next
description: 'Compute and execute the next BMAD step (zero-config orchestrator). Invoke when user types /bmad-next with optional flags like --doctor, --upgrade, --resume, --dry-run, --explain, --list, --diff-state, --export-state, --watch, --recompute-state, --skip <step>, --auto-fix, --no-overrides, --plan-first.'
---

# /bmad-next

Compute and execute the next BMAD step. Layer 1 orchestrator: Bash → AR9 JSON line → Task → Bash → summary.

## Usage examples

```
/bmad-next
/bmad-next --dry-run
/bmad-next --explain
/bmad-next --resume
/bmad-next --doctor
/bmad-next --list
/bmad-next --diff-state
/bmad-next --export-state
/bmad-next --skip <step> --resume
/bmad-next --auto-fix
```

Capture the flag string the user typed after `/bmad-next` (verbatim) and
forward it as `<captured-flags>` to the Bash invocations below. Flags
reach `src/commands/next/run.ts`'s argv (Story 1.7 `parseNextArgs`
consumes them).

## Behavior

### 1. Bash: invoke the lock-free pre-dispatch composer.

```bash
bun run src/commands/next/run.ts -- <captured-flags>
```

This invocation reads `state.yaml` (lock-free), computes the next step via the
DAG resolver, builds the dispatch spec at `staging/<run-id>/dispatch-spec.json`,
and emits exactly ONE JSON line on stdout describing the next action. Per
architecture §line 1672 + AR8, no project lock is acquired during this call
(the runner is read-only). Per FR54, all progress / warning / error logging
routes to stderr; only the AR9 JSON line goes to stdout.

Exit-code mapping for this Bash invoke per FR53 + Story 2.4:

- `0` — success (one of the three AR9 actions was emitted on stdout).
- `2` — argument parse error (configuration error).
- `3` — BMAD compatibility error.
- `5` — pathological input.
- Other non-zero codes propagate through the AR9 `action: "halt"` line.

### 2. Parse the single stdout JSON line.

The script emits EXACTLY ONE JSON line on stdout. The shape is one of three
discriminated variants per `src/schemas/dispatch-protocol.ts`
(`DispatchActionV1Schema`):

```
Variant 1 — dispatch:
  { "action": "dispatch", "runId": "<id>", "agent": "<agent-name>",
    "lastAttempted": { "step": "<name>", "epic": <n>, "story": "<key>",
      "attemptedAt": "<iso>" }?,
    "exitCode": 0 }

Variant 2 — report:
  { "action": "report", "message": "<human-readable text>", "exitCode": >= 0 }

Variant 3 — halt:
  { "action": "halt", "message": "<actionable hint>", "exitCode": >= 1 }
```

Story 3.1 extension: the `dispatch` variant carries an OPTIONAL `lastAttempted`
field with the planned `{ step, epic, story, attemptedAt }` payload. Layer 1
captures this field and forwards it to `verify-and-advance.ts` via the
`--last-attempted-json '<JSON>'` flag (Step 5 below). The field powers
`state.lastAttempted` write-on-dispatch + `state.lastFailureReason` write-on-
halt mutations per epic AC line 731. `verify-and-advance.ts` accepts the flag
optionally — older bmad-next.md bodies that don't forward it still work
(graceful degradation; `state.lastAttempted` is set to `null` on halt).

Parse the single line via JSON.parse. Do NOT inspect any other stdout content
— the runner is contractually bound to emit exactly ONE line per AR9 + FR54.
The shape is verified by Story 2.2's `emitDispatchAction` (calls
`DispatchActionV1Schema.parse()` before writing). The Layer 1 parse is
defence-in-depth — if the line is malformed, abort with a clear error rather
than attempt invalid actions.

### 3. Branch on action.

```
Case action == "dispatch":
  Invoke the Task tool with the agent name from the JSON line and the
  dispatch-spec path as the prompt. Story 6.3 — additionally forward the
  configured `model` parameter so the runtime can route the sub-agent to
  the requested Anthropic Claude tier (sonnet | opus | haiku):
    Task(
      agent  = <jsonLine.agent>,
      prompt = "staging/<jsonLine.runId>/dispatch-spec.json",
      model  = <dispatchSpec.model>     # read from staging/<runId>/dispatch-spec.json's `model` field; "sonnet" default per Story 6.3
    )
  Then proceed to Step 4 (capture token counts).

  Note (Story 6.3 AC-2 — `where supported`): If the Claude Code Task tool
  runtime does not honour the `model` parameter (e.g., on a future
  runtime change or a bound persona that cannot accept the parameter),
  the runtime falls back to its default behaviour. Stepper still records
  the configured model in the dispatch-spec.json + transcript markdown
  + JSON run log for audit purposes — the configured model is the
  user's INTENT; runtime acceptance is best-effort. See
  `docs/configuration.md` `models:` section for configuration syntax.

  Note (Story 6.4 AC-2 — `timeoutMs` cap is best-effort): The dispatch-
  spec.json's `budget.timeoutMs` is the configured per-step timeout cap
  (default 300000ms / 5min; `budget.contextTokens` defaults to 60000).
  The Claude Code Task tool runtime is responsible for enforcing the cap
  and surfacing a TIMEOUT condition if exceeded. Stepper records the cap
  in the dispatch-spec.json + transcript markdown + JSON run log for
  audit purposes — the configured cap is the user's INTENT; runtime
  enforcement is best-effort. If the runtime exceeds the cap, the
  slash-command markdown forwards `--error-code TIMEOUT` to
  `verify-and-advance.ts` which constructs `TimeoutError` (registry code
  TIMEOUT, exitCode 1, single-line hint). See `docs/configuration.md`
  `budgets:` section for configuration syntax.

Case action == "report":
  Print the `message` field DIRECTLY to the user. No Task dispatch. No
  second Bash invoke. Exit with the JSON line's exitCode (typically 0).

  When the report carries `awaitInput: true`, the dispatched step is
  flagged `interactive: true` in the DAG and Stepper has written a
  questions stub at the path in `awaitInputPath` (also surfaced in the
  message). The user (or you, the slash-command Layer-1 LLM) fills
  every `<!-- FILL_ME -->` marker with an answer, then re-invokes
  `/bmad-next --resume`. On the re-invocation Stepper detects the
  filled file and includes it in the sub-agent's context — the
  sub-agent then produces the artifact non-interactively.

Case action == "halt":
  Print the `message` field DIRECTLY to the user (the actionable hint).
  No Task dispatch. No second Bash invoke. Exit with the JSON line's
  exitCode (>= 1 per FR53).

Default (unrecognised action):
  Print "ERROR: unrecognised AR9 action: <jsonLine.action>" and exit 1.
```

The agent name in the dispatch JSON line is canonical — Story 2.2's
`emitDispatchAction` writes `agent: "bmad-step-runner"` for v0.1 (per
`src/dispatch/emit.ts:48`). The slash-command body reads the field at runtime
rather than hardcoding the literal so a future renamed agent (Story 6.x) breaks
neither the markdown nor the code path. This is the AR9 triple-binding integrity
documented in `agents/bmad-step-runner.md` line 84.

On `report` and `halt`, print the `message` field VERBATIM. Do NOT embellish
with prefixes like "Stepper says:" or status icons. The `message` is already
FR18-conformant (single human-readable line) and FR46-conformant (single-line
actionable hint on errors). Embellishment breaks the contract.

On `halt`, exit with the JSON line's `exitCode` (>= 1). Do NOT continue to
Step 4 — the dispatch was not performed and there is nothing to verify.

### 4. Capture Task tool's response token counts.

Per architecture Critical Gap Resolution 6 line 1677, the Task tool's response
object exposes token counts:

```
response.tokens_in   — input tokens consumed by the sub-agent
response.tokens_out  — output tokens emitted by the sub-agent
```

Capture these as integers for the next step. If the Task response does not
include token counts (e.g., a future Claude Code runtime change), fall back
to `0 / 0` — `verify-and-advance.ts` accepts non-negative integers via
`parseVerifyAndAdvanceArgs` (Story 2.6 Task 4) and writes them into the
run-log JSON + `state.runHistory[]` entry.

Token-count threading is the architecture's documented integration boundary
between Layer 1 (which has access to Claude Code's Task response object) and
Layer 2 (which has no Task awareness). The positional `--tokens-in <n>
--tokens-out <n>` flags are the contract per architecture line 1677 + Story
2.6 `parseVerifyAndAdvanceArgs`. The captured counts flow into BOTH the
run-log JSON `tokensIn` / `tokensOut` fields (Story 2.5 surface) AND the
`runHistory[]` entry on `state.yaml` (Story 2.6 surface). Story 6.7's
telemetry aggregation later sums across `runHistory[]` for the
`--token-budget` Story 4.5 stop condition.

### 5. Bash: invoke the lock-acquiring post-dispatch runner.

```bash
bun run src/commands/next/verify-and-advance.ts -- --run-id <runId> --tokens-in <tokensIn> --tokens-out <tokensOut> --last-attempted-json '<lastAttemptedJson>'
```

where `<runId>` is the value from Step 2's parsed JSON line (`jsonLine.runId`),
and `<tokensIn>` / `<tokensOut>` are from Step 4's Task response object.

Story 3.1: `<lastAttemptedJson>` is the JSON-encoded `lastAttempted` object
captured from Step 2's parsed dispatch line (`JSON.stringify(jsonLine
.lastAttempted)`). The flag is OPTIONAL — when absent (e.g., the dispatch
line omitted the field, or this Layer 1 markdown body has not been updated
to capture it), `verify-and-advance.ts` sets `state.lastAttempted` to `null`
on the halt path (graceful degradation per the Story 3.1 design decision).
On the success path, `state.lastAttempted` is cleared to `null` regardless of
the flag's presence.

This second invocation acquires the project lock, re-reads `state.yaml`,
performs the state-hash TOCTOU check (per architecture §line 1673), runs the
verifier on the sub-agent's output, atomically promotes the artifact to its
canonical path, atomically updates `state.yaml` with `.bak` rotation
(NFR-S5), writes the markdown transcript + JSON run log via Story 2.5's
writers, and releases the lock in `finally` per AR8.

The two Bash invokes are SEPARATE PROCESSES with FRESH Bun runtimes. The
lock-free → lock-held boundary is the **process boundary** between `run.ts`
and `verify-and-advance.ts` — the (5+ minute) sub-agent run between them does
NOT hold the project lock.

Exit-code mapping for the second Bash invoke per FR53 + Story 2.6:

- `0` — verifier passed; artifact promoted; state advanced.
- `1` — `STATE_CHANGED_DURING_DISPATCH` (TOCTOU mismatch — state advanced
  during dispatch) OR verifier failure.
- `2` — argument parse error.
- `4` — lock contention.
- `5` — pathological input.

### 6. Print the FR18 one-line summary.

Read the second AR9 JSON line (the `verify-and-advance` output). The
`message` field is the FR18 single-line summary in one of two shapes:

```
On success (action = "report"):
  "✓ <step> → <canonical-path> (tokens: in=<n> out=<n>, <ms>ms)"

On failure (action = "halt"):
  "<actionable hint>" — e.g., "Run /bmad-next --diff-state to see what
  changed and /bmad-next --resume to retry from the current state."
```

Print the `message` field VERBATIM. Exit with the JSON line's `exitCode`.

This is the canonical FR18 main-thread output — one human-readable line per
step. The line is composed by `verify-and-advance.ts` per Story 2.6 Task 8.7
+ the architecture line 1480 contract. Layer 1 just prints it.

After Step 6, `/bmad-next` returns control to the user. The transcript pair
(`<ts>-<step>.{log,json}` under `_bmad-output/.stepper/runs/`) is on disk
for `/bmad-next --watch` (Story 3.9), `/bmad-next --diff-state` (Story 3.8),
and `/bmad-next --export-state` (Story 3.10) to consume.

### Per-step failure-UX policy (Story 5.1 — Epic 5 retry mode)

When the verifier reports `fail` on the sub-agent's output, `verify-and-advance.ts`
now consults the per-step failure-UX policy via `dispatchFailureUx` (mid-tier
`src/failure-ux/index.ts` — Story 5.1). The four supported policies are
`retry`, `skip`, `route-to-fixer`, and `escalate` (architecture lines
494-499). For v0.1 the default is `escalate` (backwards-compatible with
the current behaviour — verifier-failure halts the step immediately).

When the resolved policy is `retry`, the same `staging/<run-id>/dispatch-spec.json`
is re-run by the sub-agent up to `maxRetries` times (default `2` →
3 total attempts: 1 original + 2 retries). Each per-attempt outcome
appends a `runHistory[]` entry with `attemptNumber` metadata. After the
cap is reached without a passing verifier, the policy escalates and
`verify-and-advance.ts` re-throws `VerifierFailureError` with the LAST
attempt's failure context (carried by `state.lastFailureReason`).

See `/bmad-loop` documentation for the canonical retry-mode reference,
including the SAME-dispatch-spec contract, runHistory[] entry shape,
SIGINT cooperation, and forward-trackers for backoff (Story 6.x) and
verifier-vs-dispatch error distinction (Story 6.x). Auto-fix /
interactive policies arrive in Stories 5.3 / 5.5; the
`failurePolicies:` config block lands in Story 5.6.

### `--skip` flag (Story 5.2 — Epic 5 skip mode)

When a step persistently fails and the user wants to advance past it
(rather than continue retrying or routing to a fixer), `/bmad-next
--skip <step> --resume` marks the failing step as `skipped` and
advances state to the next step in topological order. Per FR28 + AC
line 1075-1077.

The `--skip <step>` flag is **co-required with `--resume`** — supplying
`--skip` ALONE exits with code 2 and the BYTE-IDENTICAL hint
`--skip requires --resume to advance state. Run /bmad-next --skip <step> --resume.`
(Story 5.2 SkipRequiresResumeError; registry 17). The cross-validation
lives in `src/commands/next/run.ts` — the parser is lenient (Story 1.7
intentional gap), the runner enforces.

Preconditions per OQ-4 + OQ-6:

- `state.lastAttempted` MUST be populated (use `/bmad-next` first to
  trigger a halt that populates lastAttempted; THEN skip).
- `args.skip` MUST equal `state.lastAttempted.step` (typos are caught
  at the verify-and-advance.ts mismatch check; the hint surfaces the
  actual lastAttempted.step value for correction).

State mutation per AC line 1077 (atomic per AR13 Layer 2 + the existing
saveState contract):

- `runHistory[]` is appended with a new entry carrying `skipped: true`
  for the matched step (the `outcome` field stays `"pass"` per the
  success-path-shape contract; the `skipped: true` marker is the
  FORENSIC RECORD that the verifier was BYPASSED).
- `lastSuccessfulStep` advances to the next step in topological order
  via the DAG resolver (Story 1.10 + sibling-step lookup).
- `lastAttempted` clears to `null`.
- `lastFailureReason` clears to `null` (per the success-path
  precedent).
- `checkpoints[]` is UNCHANGED — the just-skipped step did NOT
  successfully complete; no Git snapshot is captured per Story 4.8.

The skip path is **state-mutation-only** — there is NO sub-agent
dispatch, NO verifier invocation, NO artifact promotion. The lock
acquisition + saveState atomic-write is the SAME pattern as the
success path (per AR8 + AR13 Layer 2).

SIGINT cooperation per Story 4.9 §I-2: the skip-path saveState rides
the existing atomic tmp+rename contract (Story 1.3); SIGINT mid-write
either lets the rename complete OR aborts cleanly before the rename.
NO partial writes are possible per NFR-S5. The `shutdownRequested`
poll pattern (Story 4.9 + Story 5.1 retry mode) is NOT applicable to
the skip path (no multi-attempt loop to short-circuit).

Idempotent re-skip per OQ-7: invoking `/bmad-next --skip <step>
--resume` AGAIN on a step that has ALREADY been skipped (the most-
recent runHistory entry for that step has `skipped: true`) throws
`ConfigError` with the hint `Check state.runHistory and run /bmad-next
without --skip to continue.`

Telemetry forward-tracker per Epic 6: the `runHistory[]` entries with
`skipped: true` are the future telemetry source — when Story 6.6 wires
telemetry collection, it iterates `state.runHistory[]` filtered by
`skipped === true` and emits per-step skip-event counts (Story 6.7
aggregation report).

`--skip` is a `/bmad-next`-only flag — `/bmad-loop` has NO `--skip`
flag (skip is a per-step state mutation, NOT a loop stop condition).
Story 5.6 will wire per-step skip policy auto-resolution at the loop
runner-tier via the `failurePolicies: { <step>: skip }` config block.

When Layer 1 detects `--skip <step>` in the captured flags AND `--resume` in
the captured flags, it threads `--skip-step <step>` to verify-and-advance.ts
in Step 5 above (positional argv flag, mirroring the Story 3.1
`--last-attempted-json` threading pattern).

### `--auto-fix` flag (Story 5.3 — Epic 5 route-to-fixer mode)

When a step's verifier fails and the user wants Stepper to attempt an
automatic fix BEFORE escalating, `/bmad-next --auto-fix` overrides the
per-step failure policy to `route-to-fixer` for one run per architecture
line 499 + FR29. The override is unconditional — when `--auto-fix` is
supplied, the verifier failure on this run triggers a fixer dispatch
(NOT retry, NOT skip, NOT escalate, regardless of any per-step config
setting).

Per AC line 1091-1099, the route-to-fixer semantics are:

1. **Verifier fails** on the original sub-agent's output at
   `staging/<run-id>/outputs/<artifact>`; one `runHistory[]` entry is
   appended with `outcome: "fail"` + `failureCode: "VERIFIER_FAILURE"`
   (the original verifier-fail forensic record).
2. **Fixer is dispatched** as a SECOND AR9 cycle — Layer 1 reads the
   AR9 dispatch action with `agent: "bmad-step-fixer"` + `runId:
   <original-runId>-fix`; the slash-command markdown invokes the fixer
   sub-agent via the `Task` tool. The fixer reads its dispatch-spec at
   `staging/<run-id>-fix/dispatch-spec.json` (which carries the
   verifier-result + the original artifact in its CONTEXT section per AC
   line 1093) and writes a CORRECTED artifact to
   `staging/<run-id>-fix/outputs/<artifact>`.
3. **Original verifier re-runs** on the fixer's output (NOT on the
   original failed output); the post-fix verifier-result is written to
   `staging/<run-id>-fix/verifier-result.json` (the original
   verifier-result.json is PRESERVED at
   `staging/<run-id>/verifier-result.json` for forensic record).
4. **On post-fix pass**: the fixer's corrected artifact is promoted to
   the canonical location (NOT the original failed artifact);
   `runHistory[]` is appended with a SUCCESS entry carrying
   `fixAttempt: true` (the FORENSIC RECORD that the success was via a
   fix attempt, distinct from a normal retry-success).
5. **On post-fix fail**: a SECOND `runHistory[]` entry is appended with
   `outcome: "fail"` + `failureCode: "VERIFIER_FAILURE"` +
   `fixAttempt: true` (the post-fix verifier-fail forensic record); the
   policy escalates to `escalate` via the existing VerifierFailureError
   throw with BOTH failure contexts surfaced in the error message per
   AC line 1099 ("with both failures recorded").

The fixer sub-agent (`agents/bmad-step-fixer.md`) is a Layer 3 worker
per architecture line 1070; its description is BYTE-IDENTICAL to AC line
1091 substring `remediate a BMAD step artifact based on a verifier
failure`. The fixer is file-in / file-out only — it DOES NOT engage the
user, DOES NOT validate its own output, DOES NOT escalate, DOES NOT
retry (the route-to-fixer policy mandates ONE fix attempt per logical
step; on post-fix-fail Layer 2 escalates immediately per AC line 1099).

Staging dir layout per architecture line 549 + AC line 1093:

- `staging/<run-id>/` — the ORIGINAL step's staging dir (the failed
  artifact + the original verifier-result.json; PRESERVED for forensic
  record).
- `staging/<run-id>-fix/` — the FIXER's staging dir (the corrected
  artifact + the post-fix verifier-result.json; PRESERVED for forensic
  record).

SIGINT cooperation per Story 4.9 §I-2: the `shutdownRequested` poll
inside `verify-and-advance.ts` is checked BEFORE invoking the fixer
dispatch; on SIGINT the iteration halts cleanly with the original
verifier-fail context (no fix attempt is started). The atomic-write
contract (Story 1.3) protects all `saveState()` calls so partial-write
recovery is automatic.

Telemetry forward-tracker per Epic 6: the `runHistory[]` entries with
`fixAttempt: true` are the future telemetry source — when Story 6.6
wires telemetry collection, it iterates `state.runHistory[]` filtered by
`fixAttempt === true` and emits per-step fix-event counts (Story 6.7
aggregation report; independent from retry-event counts via
`attemptNumber > 1` filter).

`--auto-fix` is also a `/bmad-loop` flag (per architecture line 499 —
"Loop-level `--auto-fix` flag overrides per-step policy to
`route-to-fixer` for one run"); the loop runner threads the override
across ALL iterations of the loop run via
`RunNextOptions.failurePolicyOverride`.

When Layer 1 detects `--auto-fix` in the captured flags, it threads
`--auto-fix` to verify-and-advance.ts in Step 5 above (positional argv
flag, mirroring the Story 5.2 `--skip-step` threading pattern).

### failurePolicies: config block (Story 5.6 — per-step policy)

The per-step `failurePolicies:` config block in `bmad-stepper.config.yaml`
applies to `/bmad-next` invocations the same way it applies to
`/bmad-loop` iterations. The four valid policies (retry / skip /
route-to-fixer / escalate) and the resolver semantics (priority order,
absent-step fallback, case-sensitive lookup, invalid-value handling)
are CANONICAL in `skills/bmad-loop/SKILL.md` (single source of truth per
OQ-8 — mirrors the Story 5.3 `--auto-fix` docs pattern).

See `skills/bmad-loop/SKILL.md` § `failurePolicies: config block (Story 5.6
— per-step policy)` for the full reference: schema shape, valid values
(retry / skip / route-to-fixer / escalate), absent-step fallback
(escalate plugin default), `--auto-fix` priority override, example
config block, BMAD step-id format, invalid-value handling (ConfigError
on Zod parse failure), and Story 6.1 cross-story coordination (file
loader work).

This section confirms `/bmad-next` is COVERED by the same config block
— there is NO separate `/bmad-next`-only failurePolicies surface. The
resolver (`src/failure-ux/resolve-policy.ts`) is invoked by
`src/commands/next/run.ts` (for the `resolvedFailurePolicy` field on
`NextResult`) AND by `src/commands/next/verify-and-advance.ts` (for
the per-step policy at the verifier-failure dispatch site). Both
consume the same `failurePolicies:` block.

### Configuration file (Story 6.1 — full schema reference)

Story 6.1 ships the file LOADER that reads `bmad-stepper.config.yaml`
from disk and validates the result against `ConfigV1Schema`. The full
configuration model — including all 9 top-level keys, the three-layer
resolution rule (project > user > defaults), per-key examples, and the
schema-versioning model — is documented in `docs/configuration.md`.

`/bmad-next` invokes the same `loadConfig()` function as `/bmad-loop`;
both commands honour the same project + user + defaults layers and
surface the same `CONFIG_ERROR` (exit 2) on invalid input.

### Failure modes — escalate (Story 5.4 — Epic 5 default policy)

`escalate` is the **default** per-step failure-UX policy per architecture
line 499 ("escalate is the safest fallback when no per-step policy is
set"). Story 5.4 lands the formal `escalateHandler` at
`src/failure-ux/escalate.ts` — a pure-function handler that ENRICHES the
in-flight failure context's actionable hint to satisfy the AR22 regex
contract `/^.*(Run|See|Try|Check) /` (architecture line 589 + epics.md
§Story 5.4 AC line 1113). Story 5.4 COMPLETES the four-handler module
group (`retry` + `skip` + `route-to-fixer` + `escalate`) with ZERO stub
fallthrough; the v0.1 stub at `src/failure-ux/index.ts:102-105` is
REMOVED entirely.

**The four existing escalate sites** at `verify-and-advance.ts` are:

1. **Retry-cap** (line ~1071): all retries failed; throw
   `VerifierFailureError` with the LAST attempt's failure context.
2. **Route-to-fixer-cap** (line ~1241): post-fix verifier still fails;
   throw `VerifierFailureError` with both failures recorded.
3. **Raw verifier failure** (default escalate policy on attempt 1):
   throw `VerifierFailureError` immediately.
4. **Unexpected outcome** (TypeScript exhaustiveness defensive throw):
   throw `VerifierFailureError`.

Each site invokes `escalateHandler(failureContext, {})` BEFORE the throw
to enrich the actionable hint per the AR22 regex contract. The catch
handler reads the enriched hint via the `escalateEnrichedHint` closure
variable and uses it for BOTH the `lastFailureReason.hint` write AND the
AR9 halt action's `message` field.

**The actionable-hint regex contract** is codified as the constant
`ACTIONABLE_HINT_REGEX = /^.*(Run|See|Try|Check) /` exported from
`src/failure-ux/escalate.ts`. The handler enriches in TWO modes:

- **PASS-THROUGH** (common case per OQ-2 audit): if the input hint
  already matches the regex, return the context unchanged. All 17
  existing `StepperError` class `actionableHint` strings already match
  the regex (verified by the integration test at
  `src/integration/escalate-actionable-hint.test.ts`).
- **SHAPE default** (safety-net for FUTURE non-matching hints): if the
  input hint does NOT match, shape a default hint of the form `"Run
  /bmad-next --resume to retry; see _bmad-output/.stepper/runs/<runId>/log.md
  for the failure detail."` (matches the regex via the leading "Run "
  verb; references the run-log path + `--resume` invocation per AC
  line 1111).

**NO stack trace on main thread (NFR-M2)**: per PRD line 801 + AC line
1112, the AR9 dispatch action's `message` field carries ONLY the
single-line actionable hint; the warn/error stderr captures from
`src/io/log.ts` carry ONLY the hint; the FULL `Error.stack` lives ONLY
in the run-log JSON file at `_bmad-output/.stepper/runs/<runId>/log.json`
per FR44. The integration test asserts NO `Error.stack` substring
appears in the AR9 message OR the warn/error stderr captures.

**`lastFailureReason` is auto-cleared on the next successful step** per
OQ-6 (preserves Story 3.1 + 5.1 + 5.3 success-path clear at
`verify-and-advance.ts:935-942`). The halt is forensic until recovered;
the next `/bmad-next` that succeeds clears the field.

**Failure modes table**:

| Mode             | Story | Default? | State mutation                                                                     | Halt? | Recovery hint              |
| ---------------- | ----- | -------- | ---------------------------------------------------------------------------------- | ----- | -------------------------- |
| `retry`          | 5.1   | NO       | `runHistory[]` per-attempt entries; `lastFailureReason` on retry-cap escalate     | After cap | `Run /bmad-next --resume` |
| `skip`           | 5.2   | NO       | `runHistory[].skipped: true` + `lastSuccessfulStep` advance + `lastAttempted` clear | NO    | `Run /bmad-next --skip <step> --resume` |
| `route-to-fixer` | 5.3   | NO       | `runHistory[].fixAttempt: true` (success) OR two fail entries on post-fix-fail   | On post-fix-fail | `Run /bmad-next --resume` |
| `escalate`       | 5.4   | **YES**  | `lastFailureReason: {code, message, hint, runId}` (atomic per Story 1.3)         | YES   | `Run /bmad-next --resume`  |

The escalate path's `lastFailureReason` write rides the existing atomic
tmp+rename contract per NFR-S5; SIGINT mid-escalate-path halts cleanly
with the partial state recorded atomically (Story 4.9 §I-2 cooperation
via the `shutdownRequested` poll).

## Tool restrictions

- **Bash** is restricted to `bun run <plugin-root>/...` invocations only. The
  slash command MUST NOT invoke shell scripts, system binaries (`curl`, `git`,
  `npm`, `node`, `python`, etc.), or any non-Bun executable.
- **Task** is restricted to plugin-declared agents (those defined under
  `agents/` in this plugin). For v0.1 the only declared agent is
  `bmad-step-runner`. Future agents (e.g., `bmad-step-fixer` from Epic 5
  Story 5.3) will be declared in the same directory.
- **No file edits outside `staging/<run-id>/` and `_bmad-output/.stepper/`.**
  The `Read` tool may inspect any project file (read-only); `Write` and
  `Edit` are NOT in `allowedTools` (per the frontmatter declaration).

These restrictions are documented in the markdown body for human readers +
Claude (Layer 1) as prompt-layer enforcement. The architectural enforcement
lives at Layer 2 (verifier scope check, `assertWithinScope` per Story 1.3) —
but the markdown declaration is the FIRST line of defence.

Claude Code's runtime restricts the slash command to the three tools in
`allowedTools: ["Bash", "Task", "Read"]`. The body's tool-restriction section
narrows the Bash and Task surfaces further (per the verbiage above) — these
are PROMPT-LAYER constraints Claude honors at the orchestration layer.

## Error handling

Every error surfaces as a single-line actionable hint via the AR9
`action: "halt"` JSON line. The `message` field is already AR22-conformant
(single-line "Run/See/Try/Check"-prefixed actionable hint per
`src/errors.ts` registry). Layer 1 prints the hint VERBATIM and exits with
the JSON line's `exitCode` (>= 1 per FR53).

DO NOT:

- Append a stack trace (errors are AR21-conformant; Layer 2's try/catch
  translates throw → halt with no stack on the main thread).
- Embellish with prefixes ("Stepper says:", "ERROR:", etc.).
- Run a third Bash or Task on the halt path.
- Retry automatically (Stories 5.1-5.4 own the retry / skip /
  route-to-fixer / escalate engine).

DO:

- Print the `message` field as-is (one line).
- Exit with the `exitCode` field.
- Surface the FR53 exit-code mapping to the user IF they ask "what does
  exit code N mean" — the canonical mapping is documented in
  `prd.md` FR53 line 744.

The transcript pair is STILL written on every halt path (Story 2.6 finally
block). Users can run `/bmad-next --watch` (Story 3.9) or inspect
`_bmad-output/.stepper/runs/<ts>-<step>.{log,json}` directly for forensic
detail per FR43 + FR44.

Per architecture §line 862 + FR54, `runVerifyAndAdvance` writes ALL
diagnostic output to stderr (info / warn / error) and ONE AR9 JSON line to
stdout. Layer 1 should treat stderr as logs (don't display verbatim to the
user; let Claude Code's runtime handle stderr per its standard convention)
and stdout as the AR9 protocol channel.

---

This Layer 1 orchestrator mirrors architecture §A.D1 (three-layer execution
model — main thread, Bun core, sub-agents), §A.D2 (sub-agent dispatch via
Task tool), §P6 (slash-command markdown patterns — frontmatter shape + body
pattern + tool restrictions), §line 1443-1485 (Layer 1↔2↔3 sequence
diagram), §line 1660 (AR9 protocol), §line 1677 (token-count positional
flag threading), and PRD FR1, FR16, FR17, FR18, FR28, FR29, FR30, FR32, FR46, FR53, FR54
+ NFR-M2 (Story 5.4 — every error has actionable hint; no stack trace on main thread).

For the lock-free pre-dispatch composer, see `src/commands/next/run.ts`
(Story 2.4). For the lock-acquiring post-dispatch runner, see
`src/commands/next/verify-and-advance.ts` (Story 2.6). For the canonical
sub-agent definition, see `agents/bmad-step-runner.md` (Story 2.3). For
the AR9 JSON-line schema, see `src/schemas/dispatch-protocol.ts` (Story
2.2). The end-to-end happy-path smoke test is Story 2.8 deliverable.

### --upgrade (Story 6.9)

Checks the GitHub Releases API at
`https://api.github.com/repos/tgorka/bmad-stepper/releases/latest` for a
newer Stepper version.

- Reads `currentVersion` from `.claude-plugin/plugin.json`.
- Compares to the latest GitHub Release tag (strips a leading `v` per
  GitHub convention).
- Prints a markdown-style report on stdout with the version diff,
  CHANGELOG link, BMAD compatibility info, and the upgrade hint.

**Never auto-installs.** The flow is read-only — Stepper does NOT write
to `~/.claude/plugins/` from this code path. The user-action path is to
copy-paste the emitted hint:

```text
Run /plugin marketplace update tgorka/bmad-stepper to upgrade.
```

**Network discipline (NFR-S1):** this is the ONLY main-thread network
I/O permitted by the architecture (architecture §D14, line 645-660).
All other code paths are network-free.

**Exit codes:**

- `0` — report emitted (newer release available OR up-to-date).
- `1` — GitHub Releases unreachable (offline, rate limit, timeout,
  malformed response). The single-line hint
  `Could not reach GitHub Releases. Check your network or try again later.`
  is emitted on stderr; the AR9 halt line is emitted on stdout. See
  `docs/exit-codes.md` for the verbatim exit-1 catalog entry.

**AR9 carve-out (third documented):** the upgrade success report goes
to stdout DIRECTLY (NOT wrapped in the AR9 JSON line) — alongside Story
3.8 `--export-state` and Story 3.9 `--watch`. Every other flag preserves
AR9 strictly.

The standalone CLI invocation is `bun run upgrade` (per `package.json`
scripts entry); the slash-command form `/bmad-next --upgrade` is wired
via the runner short-circuit at `src/commands/next/run.ts` Step 0a.
