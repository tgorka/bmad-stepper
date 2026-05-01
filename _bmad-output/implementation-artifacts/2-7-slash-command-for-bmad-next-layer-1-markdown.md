---
status: done
story_id: '2.7'
story_key: 2-7-slash-command-for-bmad-next-layer-1-markdown
epic: '2'
title: 'Slash Command for `/bmad-next` (Layer 1 Markdown)'
created: '2026-05-01'
last_updated: '2026-05-01T08:45:00Z'
priority: M
estimated_effort: M
fr_coverage:
  - FR1
  - FR16
  - FR17
  - FR18
  - FR32
  - FR46
  - FR53
  - FR54
nfr_coverage:
  - NFR-S2
  - NFR-S4
  - NFR-R1
  - NFR-R4
ar_coverage:
  - AR7
  - AR8
  - AR9
  - AR16
  - AR21
  - AR22
  - AR41
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/implementation-artifacts/epic-1-retrospective.md
  - _bmad-output/implementation-artifacts/2-1-verifier-configuration-registry.md
  - _bmad-output/implementation-artifacts/2-2-dispatch-spec-generator.md
  - _bmad-output/implementation-artifacts/2-3-generic-sub-agent-bmad-step-runner-md.md
  - _bmad-output/implementation-artifacts/2-4-lock-free-run-ts-for-bmad-next.md
  - _bmad-output/implementation-artifacts/2-5-markdown-transcript-json-run-log-writers.md
  - _bmad-output/implementation-artifacts/2-6-verify-and-advance-ts-with-state-hash-check.md
  - _bmad-output/implementation-artifacts/1-12-bmad-next-doctor-command.md
  - _bmad-output/implementation-artifacts/1-1-initialize-repository-scaffold.md
  - .claude-plugin/plugin.json
  - commands/bmad-next.md
  - commands/bmad-doctor.md
  - agents/bmad-step-runner.md
  - src/commands/next/run.ts
  - src/commands/next/verify-and-advance.ts
  - src/commands/next/args.ts
  - src/schemas/dispatch-protocol.ts
  - src/schemas/dispatch-spec.ts
  - src/dispatch/emit.ts
---

# Story 2.7: Slash Command for `/bmad-next` (Layer 1 Markdown)

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper user,
I want `/bmad-next` to be a single slash command that orchestrates: Bash invoke `run.ts`, read JSON line, Task dispatch sub-agent, Bash invoke `verify-and-advance.ts`, print summary line,
So that typing `/bmad-next` does the full happy path without any manual copy-paste.

## Context Summary

This is the **seventh story of Epic 2 (Single-Step Advance with Sub-Agent Dispatch)** and lands the **canonical Layer 1 orchestrator** — the body of `commands/bmad-next.md`. Until now Epic 2 shipped the Layer 2 verifier subsystem (Story 2.1), the Layer 2 dispatch-spec generator + AR9 emitter (Story 2.2), the Layer 3 sub-agent definition (Story 2.3), the Layer 2 lock-free pre-dispatch runner (Story 2.4), the Layer 2 transcript writers (Story 2.5), and the Layer 2 lock-acquiring post-dispatch runner (Story 2.6). With every Layer 2 + Layer 3 piece now in place, Story 2.7 finally **wires Layer 1** into the canonical `/bmad-next` orchestrator that composes:

1. **Bash invoke** of Story 2.4's `src/commands/next/run.ts` → emits AR9 stdout JSON line per `src/schemas/dispatch-protocol.ts`.
2. **Parse** the single JSON line; branch on `action`:
   - `dispatch` → invoke `Task` against the named agent (`bmad-step-runner` from Story 2.3) with the dispatch-spec path as the prompt.
   - `report` → print the `message` field directly.
   - `halt` → print the `message` field and exit with the non-zero code.
3. **Capture** the Task tool's response token counts (per architecture Critical Gap Resolution 6 line 1677).
4. **Bash invoke** of Story 2.6's `src/commands/next/verify-and-advance.ts` with `--run-id <id> --tokens-in <n> --tokens-out <n>`.
5. **Print** the FR18 one-line summary from the second runner's AR9 stdout JSON line.

This story is **structurally distinct** from every prior Epic 2 story: it ships **NO TypeScript code under `src/`**. The deliverable is the **markdown body** of `commands/bmad-next.md` — Layer 1's prompt-engineered orchestration logic. The existing 11-line placeholder file (created by Story 1.1's repo scaffold) is REPLACED with the real ~150-300-line orchestration body. Frontmatter (`description`, `argumentHint`, `allowedTools`) is verified / updated to match epic AC line 692. No `.claude-plugin/plugin.json` change required (the plugin manifest auto-discovers commands per the existing convention).

Concretely, this story produces:

1. **`commands/bmad-next.md`** (REPLACED — 11-line placeholder body → ~150-300 lines). Frontmatter: `description` (one-line user-facing description visible in `/help`), `argumentHint: "<flags>"` (per epic AC line 692), `allowedTools: ["Bash", "Task", "Read"]` (per epic AC line 692). Body sections: usage examples, behavior sequence (Bash → JSON-line parse → Task dispatch → Bash → summary), tool restrictions (per epic AC line 701), error handling.
2. **NO new agent definitions** — the canonical `agents/bmad-step-runner.md` (Story 2.3) is the single Task target.
3. **NO new TypeScript source files** — Stories 2.4 + 2.6 ship the runners; Story 2.7 only invokes them.
4. **NO new fixture files** — Story 2.8 owns the end-to-end smoke test.

This story closes the **Layer 1 ↔ Layer 2 ↔ Layer 3** orchestration loop that architecture §lines 1443-1485 prescribes. The triple-binding is now fully wired:

- AR9 line emit (Story 2.2 `emitDispatchAction` writes `agent: "bmad-step-runner"` per `src/dispatch/emit.ts:48`).
- Frontmatter `name: bmad-step-runner` (Story 2.3 `agents/bmad-step-runner.md:2`).
- `Task` invocation argument (Story 2.7 reads the JSON line, extracts `agent`, invokes `Task(agent="bmad-step-runner", prompt="<dispatch-spec-path>")`).

It does **NOT**:

- Implement the **end-to-end happy-path smoke test**. That is **Story 2.8** — runs the full `/bmad-next` from slash command to state advance against a fixture project. Story 2.7 ships only the markdown body; Story 2.8 ships the canonical end-to-end exercise.
- Implement the **`commands/bmad-loop.md`** Layer 1 orchestrator. That is **Story 4.1** — `/bmad-loop` composes `/bmad-next` per loop iteration. Story 2.7 ships ONLY the `/bmad-next` slash command.
- Implement **TypeScript code** (`src/`). The Layer 2 runners (`run.ts`, `verify-and-advance.ts`) and Layer 3 agent are already shipped (Stories 2.4, 2.6, 2.3). Story 2.7's mutation scope is `commands/bmad-next.md` only.
- Implement the **failure-UX engine** (Stories 5.1-5.4). On `action: "halt"` the markdown body prints the `message` field and exits non-zero per epic AC line 698-700. The structured failure modes (retry / skip / route-to-fixer / escalate) are Layer 2 concerns owned by Epic 5.
- Implement the **`--watch`** live transcript tail. Story 3.9 owns the `--watch` integration; Story 2.7 just passes the flag through to `run.ts` via `$ARGUMENTS`.
- Add **`commands/bmad-loop.md`** scaffold. Per Story 1.1's scaffold note, only `commands/bmad-next.md` and `commands/bmad-doctor.md` were placeholdered. `commands/bmad-loop.md` is created by **Story 4.1** when the loop runner ships.
- Modify the **plugin manifest** (`.claude-plugin/plugin.json`). Per Story 1.1 scaffold + Story 2.3 Task 1.2 confirmation: the plugin manifest auto-discovers commands from `commands/*.md` and agents from `agents/*.md`. Story 2.7 changes the markdown body of an existing file; no manifest update needed.
- Modify **Story 2.4's `run.ts`** or **Story 2.6's `verify-and-advance.ts`**. Story 2.7 INVOKES both as black-box processes via Bash; the public surface (CLI args, stdout JSON line, exit codes) is the contract Story 2.4/2.6 already shipped. Story 2.7 must NOT modify either.
- Modify **Story 2.3's agent definition** (`agents/bmad-step-runner.md`). The agent's `name`, `description`, `allowed-tools` frontmatter is the binding contract Story 2.7 invokes; modifying it would break the AR9 triple-binding.

It DOES land:

- The **Layer 1 markdown body** of `commands/bmad-next.md` per architecture §P6 (lines 919-952) — frontmatter (`description`, `argumentHint`, `allowedTools`) + body (usage examples, behavior sequence, tool restrictions, error handling).
- The **AR9 stdout JSON-line consumer** per architecture §line 1460 + §line 1660 + `src/schemas/dispatch-protocol.ts`. The markdown body instructs Claude (Layer 1) to parse the single JSON line emitted by `bun run src/commands/next/run.ts -- $ARGUMENTS` and branch on `action`.
- The **`Task` invocation** that binds Layer 1 to Layer 3 per architecture §line 1465 + §A.D2 (lines 297-336). The body instructs Claude to call `Task(agent="<agent>", prompt="staging/<runId>/dispatch-spec.json")` against the agent name from the JSON line. The literal `"bmad-step-runner"` is NOT hardcoded in the markdown — Layer 1 reads the `agent` field from the AR9 line per defence-in-depth (so a future renamed agent breaks neither the markdown nor the code path).
- The **token-count capture + threading** per architecture Critical Gap Resolution 6 line 1677 + epic AC line 694 step 4-5. The markdown body instructs Claude to capture the Task tool's response token counts (`tokens_in` + `tokens_out` from the Task response object) and forward them to `verify-and-advance.ts` as `--tokens-in <n> --tokens-out <n>` positional flags.
- The **second Bash invoke** of Story 2.6's `src/commands/next/verify-and-advance.ts` with the captured token counts. The markdown body reads the second AR9 line and prints the FR18 one-line summary.
- The **tool restrictions** per epic AC line 701: Bash is restricted to `bun run <plugin-root>/...` invocations; Task is restricted to plugin-declared agents (those under `agents/` — i.e., `bmad-step-runner` for v0.1); no file edits outside `staging/<run-id>/` and `_bmad-output/.stepper/`. These are documented in the markdown body so Claude (Layer 1) honors them at the prompt-layer; the architectural enforcement (NFR-S2, NFR-S4) lives at Layer 2 (verifier scope check, `assertWithinScope`).
- The **AR9 branching contract** per epic AC lines 695-700:
  - `action: "report"` → Claude prints `message` field directly without dispatching anything (exit 0 unless `exitCode > 0` per the discriminated union).
  - `action: "halt"` → Claude prints `message` field (the actionable hint) and exits with `exitCode` (non-zero).
  - `action: "dispatch"` → Claude invokes `Task` with the named agent + dispatch-spec path, then runs the second Bash invoke, then prints the FR18 summary.
- The **FR18 single-line summary** per epic AC line 694 step 6. The body instructs Claude to print the second runner's AR9 `message` field (which is the FR18-conformant `"✓ <step> → <canonical-path> (tokens: in=<n> out=<n>, <ms>ms)"` format Story 2.6 emits).
- The **error handling** per FR32 + FR46 — every error surface is a single-line actionable hint (the `message` field from `action: "halt"`). The markdown body explicitly tells Claude to print the hint verbatim; never to embellish or mutate it.
- The **AR41 boundary preservation** — the markdown body invokes ONLY Layer 2 entrypoints (`bun run src/commands/next/run.ts` + `bun run src/commands/next/verify-and-advance.ts`) and Layer 3 sub-agents (`Task(agent="bmad-step-runner", ...)`). Layer 1 NEVER does direct file IO outside the `Read` tool's allowance for inspecting the dispatch-spec (defensive read for human display only — the spec is Layer 2's source of truth).

## Acceptance Criteria

The acceptance criteria below are reproduced **verbatim** from `_bmad-output/planning-artifacts/epics.md` §Story 2.7 (lines 690-701, BDD Given/When/Then format). Lines and AC labelling preserved.

**Given** `commands/bmad-next.md` with frontmatter `description`, `argumentHint: "<flags>"`, `allowedTools: ["Bash", "Task", "Read"]`
**When** the user types `/bmad-next` in Claude Code
**Then** the markdown body instructs Claude to: (1) `Bash: bun run src/commands/next/run.ts -- $ARGUMENTS`, (2) parse the single stdout JSON line, (3) if action=`dispatch` invoke `Task` against the agent named in the JSON line (`bmad-step-runner` from Story 2.3) passing the dispatch-spec path as the prompt, (4) capture Task's response token counts, (5) `Bash: bun run src/commands/next/verify-and-advance.ts -- --run-id <id> --tokens-in <n> --tokens-out <n>`, (6) print one summary line per FR18
**Given** action=`report` (read-only flag)
**When** user types
**Then** Claude prints the `message` field directly without dispatching anything
**Given** action=`halt`
**When** user types
**Then** Claude prints the actionable hint and exits
**And** tool restrictions in the markdown body declare: Bash limited to `bun run <plugin-root>/...`; Task limited to plugin-declared agents; no file edits outside `staging/<run-id>/` and `_bmad-output/.stepper/`

## Tasks / Subtasks

- [x] **Task 0 — Verify pre-conditions (AC: all)**
  - [x] 0.1 Confirm Story 2.6 (`src/commands/next/verify-and-advance.ts`) is `done` per `_bmad-output/implementation-artifacts/sprint-status.yaml` (`2-6-verify-and-advance-ts-with-state-hash-check: done`). Confirm Story 2.5 (`src/runs/`), Story 2.4 (`src/commands/next/run.ts`), Story 2.3 (`agents/bmad-step-runner.md`), Story 2.2 (`src/dispatch/`), Story 2.1 (`src/verifiers/`) are `done`.
  - [x] 0.2 Confirm `commands/bmad-next.md` EXISTS (Story 1.1's 11-line placeholder). Verify the existing frontmatter shape: `description`, `argumentHint`, `allowedTools: ["Bash", "Task", "Read"]`. Story 2.7 REPLACES the body but the frontmatter shape is already correct from Story 1.1.
  - [x] 0.3 Confirm `agents/bmad-step-runner.md` EXISTS with frontmatter `name: bmad-step-runner`, `description: execute a BMAD method step from a dispatch spec at staging/<run-id>/dispatch-spec.json`, `allowed-tools: Read, Write, Edit, Grep, Bash` per Story 2.3. The literal `"bmad-step-runner"` is the AR9 binding target.
  - [x] 0.4 Confirm `src/commands/next/run.ts` exports `runNext` AND has the `import.meta.main` entrypoint that emits exactly ONE AR9 JSON line on stdout via `emitDispatchAction(result.action)` then `process.exit(result.exitCode)`. Verify by reading `src/commands/next/run.ts:831-850`.
  - [x] 0.5 Confirm `src/commands/next/verify-and-advance.ts` exports `runVerifyAndAdvance` AND has the `import.meta.main` entrypoint per Story 2.6 (lines 805-806 of verify-and-advance.ts). The script accepts `--run-id <id> --tokens-in <n> --tokens-out <n>` per `parseVerifyAndAdvanceArgs` (Story 2.6 Task 4).
  - [x] 0.6 Confirm `src/schemas/dispatch-protocol.ts` exports `DispatchActionV1Schema` (the discriminated union over `action`) — this is the canonical contract for the AR9 stdout JSON line. The body of `commands/bmad-next.md` must mirror the union shape verbatim (action in {"dispatch", "report", "halt"}; required fields per variant).
  - [x] 0.7 Confirm `src/dispatch/emit.ts` writes `agent: "bmad-step-runner"` literal at line 48 (Story 2.2 dispatch action emit). The slash-command markdown does NOT hardcode the agent literal — it READS the `agent` field from the AR9 JSON line per the triple-binding documented in Story 2.3 line 84.
  - [x] 0.8 Confirm `.claude-plugin/plugin.json` does NOT need updating — the plugin manifest auto-discovers commands from `commands/*.md` and agents from `agents/*.md` per Story 1.1 + Story 2.3 Task 1.2. Verify by reading the manifest; confirm the existing `name`, `version`, `description`, `author`, `homepage`, `repository`, `license`, `keywords` fields are sufficient.
  - [x] 0.9 Read epics.md Story 2.7 §lines 684-701 verbatim. Confirm the AC text in §Acceptance Criteria above is character-identical (re-verify on first dev pass).
  - [x] 0.10 Read architecture.md §A.D1 lines 270-296 (three-layer execution model); §A.D2 lines 297-336 (sub-agent dispatch via Task tool — Layer 1↔3 binding); §P6 lines 919-952 (slash-command markdown patterns — frontmatter shape + body pattern + tool restrictions); §line 1065 (`commands/bmad-next.md` directory listing); §line 1263 (Layer 1 = main thread surface); §line 1443-1485 (Layer 1↔2↔3 sequence diagram); §line 1460 (AR9 stdout JSON-line emit); §line 1465 (Task invocation surface); §line 1660 (AR9 protocol concretization); §line 1677 (token counts threaded via positional flags). Note that §P6 is the architectural source for the markdown body shape Story 2.7 lands.
  - [x] 0.11 Read prd.md FR1 line 671 (compute next step zero-config); FR16 line 689 (sub-agent dispatch with budget+timeout); FR17 line 690 (verifier on every sub-agent output); FR18 line 691 (one human-readable line per step); FR32 line 711 (actionable error report on halt); FR46 line 731 (single-line + full-detail errors); FR53 line 744 (exit codes); FR54 line 745 (stdout/stderr discipline). Read NFR-S2 (writes only inside scope); NFR-S4 (sub-agent isolation enforces declared scope); NFR-R1 (zero data loss on halt); NFR-R4 (clean halt on stale lock).
  - [x] 0.12 Read Story 2.6's File List + Senior Developer Review §Carry-overs (`_bmad-output/implementation-artifacts/2-6-verify-and-advance-ts-with-state-hash-check.md` lines 1338-1344) — confirm Story 2.7 is correctly identified as the **PRIMARY INVOKER**: the Layer 1 markdown that calls `bun run src/commands/next/verify-and-advance.ts -- --run-id <id> --tokens-in <n> --tokens-out <n>` AFTER the Task tool returns the sub-agent's output + token counts.
  - [x] 0.13 Read Story 2.4's Forward Dependencies + Senior Dev Carry-overs (`_bmad-output/implementation-artifacts/2-4-lock-free-run-ts-for-bmad-next.md` lines 685, 1090-1112) — confirm Story 2.7 is the **PRIMARY INVOKER** of Story 2.4's `run.ts`: the Layer 1 orchestrator that calls `bun run src/commands/next/run.ts -- $ARGUMENTS` and reads the AR9 stdout JSON line.
  - [x] 0.14 Read Story 2.3's Forward Dependencies (`_bmad-output/implementation-artifacts/2-3-generic-sub-agent-bmad-step-runner-md.md` lines 71, 84) — confirm Story 2.7 is the **PRIMARY INVOKER** of Story 2.3's agent: the Layer 1 orchestrator that invokes `Task(agent="bmad-step-runner", prompt="staging/<runId>/dispatch-spec.json")`. The literal `"bmad-step-runner"` is NOT hardcoded in the markdown — Layer 1 reads the `agent` field from the AR9 line per defence-in-depth.
  - [x] 0.15 Read Story 1.1's repo-scaffold story (`_bmad-output/implementation-artifacts/1-1-initialize-repository-scaffold.md`) — confirm `commands/bmad-next.md` was created with the placeholder body. Story 2.7 REPLACES the body verbatim — the frontmatter shape is already correct.
  - [x] 0.16 Read Story 1.12's `commands/bmad-doctor.md` precedent — confirm the slash-command body pattern (frontmatter + behavior section + Bash invocation + diagnostic output description). Story 2.7's `bmad-next.md` follows the same pattern but extends with: (a) JSON-line parse step, (b) `Task` invocation, (c) token-count capture, (d) second Bash invoke, (e) summary print. The Story 1.12 precedent is the structural template.
  - [x] 0.17 Confirm baseline `bun run check` exits 0 with **523 pass / 0 fail / 1840 expects / 45 files** per Story 2.6 final (carries through Story 2.7 — zero TS deltas).
  - [x] 0.18 Confirm Bun host version satisfies AR2 (Bun >= 1.3). Run `bun --version`; record in Completion Notes.

- [x] **Task 1 — Plan the markdown body structure (AC: all)**
  - [x] 1.1 Sketch the `commands/bmad-next.md` outline per architecture §P6 lines 933-952 + Story 1.12 `commands/bmad-doctor.md` precedent + epic AC line 694 enumerated steps:
    ```
    ---
    description: <one-line user-facing description>
    argumentHint: "<flags>"
    allowedTools: ["Bash", "Task", "Read"]
    ---

    # /bmad-next

    ## Usage examples
    /bmad-next
    /bmad-next --explain
    /bmad-next --dry-run
    /bmad-next --resume
    /bmad-next --doctor
    /bmad-next --list

    ## Behavior

    1. Run the lock-free pre-dispatch composer via Bash:
       `bun run src/commands/next/run.ts -- $ARGUMENTS`

    2. Read the single stdout JSON line — the AR9 dispatch-action protocol per
       `src/schemas/dispatch-protocol.ts`. The shape is one of three variants:
       - `{ "action": "dispatch", "runId": "<id>", "agent": "<agent-name>", "exitCode": 0 }`
       - `{ "action": "report", "message": "<text>", "exitCode": >=0 }`
       - `{ "action": "halt", "message": "<actionable-hint>", "exitCode": >=1 }`

    3. Branch on action:
       - dispatch → invoke Task against `agent` with prompt `staging/<runId>/dispatch-spec.json`.
       - report   → print `message` directly, then exit (zero unless exitCode > 0).
       - halt     → print `message` (the actionable hint), then exit with exitCode.

    4. After Task returns:
       - Capture token counts from the Task response.
       - Run `bun run src/commands/next/verify-and-advance.ts -- --run-id <id> --tokens-in <n> --tokens-out <n>`.
       - Read the second AR9 JSON line and print the `message` field (FR18 summary).

    ## Tool restrictions
    - Bash: limited to `bun run <plugin-root>/...` invocations.
    - Task: limited to plugin-declared agents under `agents/`.
    - No file edits outside `staging/<run-id>/` and `_bmad-output/.stepper/`.

    ## Error handling
    - Print `message` field verbatim — never embellish or mutate.
    - Exit with the JSON line's `exitCode` field (FR53 0-5 surface).
    - Never invoke a third Bash or Task on a halt path.
    ```
  - [x] 1.2 Verify the frontmatter shape per epic AC line 692 + architecture §P6 line 924-928:
    - `description`: one-line user-facing string ("Compute and execute the next BMAD step.").
    - `argumentHint: "<flags>"`: literal hint string per epic AC line 692; v0.1 uses the more user-friendly `"[--doctor | --upgrade | --resume | --dry-run | ...]"` form Story 1.1 already shipped.
    - `allowedTools: ["Bash", "Task", "Read"]`: the three Layer 1 tool surfaces. `Bash` for `bun run` invocation; `Task` for sub-agent dispatch; `Read` for defensive dispatch-spec inspection (display only).
  - [x] 1.3 Document the AR9 line shape inline in the markdown body so Claude (Layer 1) has the schema to validate against without needing to import `src/schemas/dispatch-protocol.ts`. Layer 1 is markdown-only; the schema is informational, not enforced at the markdown layer (defence-in-depth lives in `emitDispatchAction`'s Zod parse on the writer side per Story 2.2).

- [x] **Task 2 — Replace `commands/bmad-next.md` body (AC-1, AC-2)**
  - [x] 2.1 OPEN `commands/bmad-next.md` (existing 11-line file from Story 1.1). The frontmatter (lines 1-5) is INVARIANT from Story 1.1; lines 6-11 (the placeholder body) are REPLACED.
  - [x] 2.2 The new body opens with a one-line role declaration:
    > "Compute and execute the next BMAD step. Layer 1 orchestrator: Bash → AR9 JSON line → Task → Bash → summary."
  - [x] 2.3 Add a `## Usage examples` section listing the most-common invocations:
    ```
    /bmad-next
    /bmad-next --dry-run
    /bmad-next --explain
    /bmad-next --resume
    /bmad-next --doctor
    /bmad-next --list
    /bmad-next --diff-state
    /bmad-next --export-state
    ```
  - [x] 2.4 The frontmatter `description` field becomes: `"Compute and execute the next BMAD step (zero-config orchestrator)."` — replaces the Story 1.1 placeholder verbatim. The `argumentHint` field carries the existing `"[--doctor | --upgrade | --resume | --dry-run | ...]"`. The `allowedTools` field is preserved as `["Bash", "Task", "Read"]`.

- [x] **Task 3 — Author the body — Step 1: Bash invoke `run.ts` (AC-1)**
  - [x] 3.1 Add a `## Behavior` heading; under it, add `### 1. Bash: invoke the lock-free pre-dispatch composer.` with body:
    ```bash
    bun run src/commands/next/run.ts -- $ARGUMENTS
    ```
  - [x] 3.2 The body explains: "This invocation reads `state.yaml` (lock-free), computes the next step via the DAG resolver, builds the dispatch spec at `staging/<run-id>/dispatch-spec.json`, and emits exactly ONE JSON line on stdout describing the next action. Per architecture §line 1672 + AR8, no project lock is acquired during this call (the runner is read-only). Per FR54, all progress / warning / error logging routes to stderr; only the AR9 JSON line goes to stdout."
  - [x] 3.3 Document the `$ARGUMENTS` expansion: "`$ARGUMENTS` is Claude Code's standard slash-command tail-string expansion per architecture §line 629 — the user's text after `/bmad-next` is forwarded verbatim to `run.ts`'s argv (Story 1.7 `parseNextArgs` consumes it)."
  - [x] 3.4 Document the exit-code mapping for this Bash invoke per FR53 + Story 2.4:
    - 0 — success (one of the three AR9 actions on stdout).
    - 2 — argument parse error (configuration error).
    - 3 — BMAD compatibility error.
    - 5 — pathological input.
    - Other non-zero codes propagate through the AR9 `action: "halt"` line.

- [x] **Task 4 — Author the body — Step 2: Parse the AR9 JSON line (AC-1, AC-2)**
  - [x] 4.1 Add `### 2. Parse the single stdout JSON line.` Document the AR9 contract per `src/schemas/dispatch-protocol.ts`:
    ```
    The script emits EXACTLY ONE JSON line on stdout. The shape is one of three
    discriminated variants (per src/schemas/dispatch-protocol.ts):

    Variant 1 — dispatch:
      { "action": "dispatch", "runId": "<id>", "agent": "<agent-name>", "exitCode": 0 }

    Variant 2 — report:
      { "action": "report", "message": "<human-readable text>", "exitCode": >= 0 }

    Variant 3 — halt:
      { "action": "halt", "message": "<actionable hint>", "exitCode": >= 1 }
    ```
  - [x] 4.2 The body instructs Claude (Layer 1): "Parse the single line via JSON.parse. Do NOT inspect any other stdout content — the runner is contractually bound to emit exactly ONE line per AR9 + FR54."
  - [x] 4.3 Note the schema source: "The shape is verified by Story 2.2's `emitDispatchAction` (calls `DispatchActionV1Schema.parse()` before writing). Layer 1's parse is defence-in-depth — if the line is malformed, abort with a clear error rather than attempt invalid actions."

- [x] **Task 5 — Author the body — Step 3: Branch on action (AC-1, AC-2, AC-3)**
  - [x] 5.1 Add `### 3. Branch on action.` per the AR9 discriminated union + epic AC lines 695-700:
    ```
    Case action == "dispatch":
      Invoke Task tool with the agent name from the JSON line and the dispatch
      spec path as the prompt:
        Task(
          agent = <jsonLine.agent>,
          prompt = "staging/<jsonLine.runId>/dispatch-spec.json"
        )
      Then proceed to Step 4 (capture token counts).

    Case action == "report":
      Print the `message` field DIRECTLY to the user. No Task dispatch. No
      second Bash invoke. Exit with the JSON line's exitCode (typically 0).

    Case action == "halt":
      Print the `message` field DIRECTLY to the user (the actionable hint).
      No Task dispatch. No second Bash invoke. Exit with the JSON line's
      exitCode (>= 1 per FR53).

    Default (unrecognised action):
      Print "ERROR: unrecognised AR9 action: <jsonLine.action>" and exit 1.
    ```
  - [x] 5.2 The body emphasises: "The agent name in the dispatch JSON line is canonical — Story 2.2's `emitDispatchAction` writes `agent: 'bmad-step-runner'` for v0.1 (per `src/dispatch/emit.ts:48`). The slash-command body reads the field at runtime rather than hardcoding the literal so a future renamed agent (Story 6.x) breaks neither the markdown nor the code path."
  - [x] 5.3 The body emphasises: "On `report` and `halt`, print the `message` field VERBATIM. Do NOT embellish with prefixes like 'Stepper says:' or status icons. The `message` is already FR18-conformant (single human-readable line) and FR46-conformant (single-line actionable hint on errors). Embellishment breaks the contract."
  - [x] 5.4 The body emphasises: "On `halt`, exit with the JSON line's `exitCode` (>= 1). Do NOT continue to Step 4 — the dispatch was not performed and there is nothing to verify."

- [x] **Task 6 — Author the body — Step 4: Capture Task token counts (AC-1)**
  - [x] 6.1 Add `### 4. Capture Task tool's response token counts.` per architecture Critical Gap Resolution 6 line 1677 + epic AC line 694 step 4:
    ```
    The Task tool's response object contains token counts:
      response.tokens_in   — input tokens consumed by the sub-agent
      response.tokens_out  — output tokens emitted by the sub-agent

    Capture these as integers for the next step. If the Task response does
    not include token counts (e.g., a future Claude Code runtime change),
    fall back to 0 / 0 — verify-and-advance.ts accepts non-negative integers
    via parseVerifyAndAdvanceArgs (Story 2.6 Task 4) and writes them into
    the run-log JSON + state.runHistory[] entry.
    ```
  - [x] 6.2 The body explains the threading: "Token-count threading is the architecture's documented integration boundary between Layer 1 (which has access to Claude Code's Task response object) and Layer 2 (which has no Task awareness). The positional `--tokens-in <n> --tokens-out <n>` flags are the contract per architecture line 1677 + Story 2.6 `parseVerifyAndAdvanceArgs`."
  - [x] 6.3 Document the FR5 + FR45 downstream consumers: "`verify-and-advance.ts` writes the captured counts into BOTH the run-log JSON `tokensIn`/`tokensOut` fields (Story 2.5 surface) AND the `runHistory[]` entry on `state.yaml` (Story 2.6 surface). Story 6.7's telemetry aggregation later sums across `runHistory[]` for the `--token-budget` Story 4.5 stop condition."

- [x] **Task 7 — Author the body — Step 5: Bash invoke `verify-and-advance.ts` (AC-1)**
  - [x] 7.1 Add `### 5. Bash: invoke the lock-acquiring post-dispatch runner.` per epic AC line 694 step 5:
    ```bash
    bun run src/commands/next/verify-and-advance.ts -- --run-id <runId> --tokens-in <tokensIn> --tokens-out <tokensOut>
    ```
    where `<runId>` is the value from Step 2's parsed JSON line (`jsonLine.runId`), and `<tokensIn>` / `<tokensOut>` are from Step 4's Task response.
  - [x] 7.2 The body explains: "This second invocation acquires the project lock, re-reads `state.yaml`, performs the state-hash TOCTOU check (per architecture §line 1673), runs the verifier on the sub-agent's output, atomically promotes the artifact to its canonical path, atomically updates `state.yaml` with `.bak` rotation (NFR-S5), writes the markdown transcript + JSON run log via Story 2.5's writers, and releases the lock in `finally` per AR8."
  - [x] 7.3 Document the runtime separation: "The two Bash invokes are SEPARATE PROCESSES with FRESH Bun runtimes. The lock-free → lock-held boundary is the **process boundary** between `run.ts` and `verify-and-advance.ts` — the (5+ minute) sub-agent run between them does NOT hold the project lock."
  - [x] 7.4 Document the exit-code mapping for the second Bash invoke per FR53 + Story 2.6:
    - 0 — verifier passed; artifact promoted; state advanced.
    - 1 — `STATE_CHANGED_DURING_DISPATCH` (TOCTOU mismatch — state advanced during dispatch) OR verifier failure.
    - 2 — argument parse error.
    - 4 — lock contention.
    - 5 — pathological input.

- [x] **Task 8 — Author the body — Step 6: Print FR18 summary (AC-1)**
  - [x] 8.1 Add `### 6. Print the FR18 one-line summary.` per epic AC line 694 step 6:
    ```
    Read the second AR9 JSON line (the verify-and-advance output). The
    `message` field is the FR18 single-line summary in one of two shapes:

    On success (action = "report"):
      "✓ <step> → <canonical-path> (tokens: in=<n> out=<n>, <ms>ms)"

    On failure (action = "halt"):
      "<actionable hint>" — e.g., "Run /bmad-next --diff-state to see what
      changed and /bmad-next --resume to retry from the current state."

    Print the `message` field VERBATIM. Exit with the JSON line's exitCode.
    ```
  - [x] 8.2 The body emphasises: "This is the canonical FR18 main-thread output — one human-readable line per step. The line is composed by `verify-and-advance.ts` per Story 2.6 Task 8.7 + the architecture line 1480 contract. Layer 1 just prints it."
  - [x] 8.3 The body documents the round-trip: "After Step 6, `/bmad-next` returns control to the user. The transcript pair (`<ts>-<step>.{log,json}` under `_bmad-output/.stepper/runs/`) is on disk for `/bmad-next --watch` (Story 3.9), `/bmad-next --diff-state` (Story 3.8), and `/bmad-next --export-state` (Story 3.10) to consume."

- [x] **Task 9 — Author the body — Tool restrictions section (AC: tool-restrictions clause line 701)**
  - [x] 9.1 Add `## Tool restrictions` heading per epic AC line 701 + architecture §P6 lines 948-951:
    ```
    - Bash is restricted to `bun run <plugin-root>/...` invocations only. The
      slash command MUST NOT invoke shell scripts, system binaries (curl, git,
      npm, node, python, etc.), or any non-Bun executable.
    - Task is restricted to plugin-declared agents (those defined under
      `agents/` in this plugin). For v0.1 the only declared agent is
      `bmad-step-runner`. Future agents (e.g., `bmad-step-fixer` from Epic 5
      Story 5.3) will be declared in the same directory.
    - No file edits outside `staging/<run-id>/` and `_bmad-output/.stepper/`.
      The `Read` tool may inspect any project file (read-only); `Write` /
      `Edit` are NOT in `allowedTools` (per the frontmatter declaration).
    ```
  - [x] 9.2 The body emphasises: "These restrictions are documented in the markdown body for human readers + Claude (Layer 1) as prompt-layer enforcement. The architectural enforcement lives at Layer 2 (verifier scope check, `assertWithinScope` per Story 1.3) — but the markdown declaration is the FIRST line of defence."
  - [x] 9.3 Document the `allowedTools` frontmatter linkage: "Claude Code's runtime restricts the slash command to the three tools in `allowedTools: ['Bash', 'Task', 'Read']`. The body's tool-restriction section narrows the BASH and TASK surfaces further (per the verbiage above) — these are PROMPT-LAYER constraints Claude honors at the orchestration layer."

- [x] **Task 10 — Author the body — Error handling section (AC: report + halt branches)**
  - [x] 10.1 Add `## Error handling` heading covering the FR32 + FR46 + AR21 + AR22 + AR9 error UX:
    ```
    Every error surfaces as a single-line actionable hint via the AR9
    `action: "halt"` JSON line. The `message` field is already AR22-conformant
    (single-line "Run/See/Try/Check"-prefixed actionable hint per src/errors.ts
    registry). Layer 1 prints the hint VERBATIM and exits with the JSON line's
    exitCode (>= 1 per FR53).

    DO NOT:
      - Append a stack trace (errors are AR21-conformant; Layer 2's
        try/catch translates throw → halt with no stack on the main thread).
      - Embellish with prefixes ("Stepper says:", "ERROR:", etc.).
      - Run a third Bash or Task on the halt path.
      - Retry automatically (Stories 5.1-5.4 own the retry / skip /
        route-to-fixer / escalate engine).

    DO:
      - Print the `message` field as-is (one line).
      - Exit with the `exitCode` field.
      - Surface the FR53 exit-code mapping to the user IF they ask "what
        does exit code N mean" — the canonical mapping is documented in
        prd.md FR53 line 744.
    ```
  - [x] 10.2 The body documents the round-trip on errors: "The transcript pair is STILL written on every halt path (Story 2.6 finally block). Users can run `/bmad-next --watch` (Story 3.9) or inspect `_bmad-output/.stepper/runs/<ts>-<step>.{log,json}` directly for forensic detail per FR43 + FR44."
  - [x] 10.3 Document the explicit halt-path discipline: "Per architecture §line 862 + FR54 — `runVerifyAndAdvance` writes ALL diagnostic output to stderr (info/warn/error) and ONE AR9 JSON line to stdout. Layer 1 should treat stderr as logs (don't display verbatim to user; let Claude Code's runtime handle stderr per its standard convention) and stdout as the AR9 protocol channel."

- [x] **Task 11 — Author the body — Footnote + architectural credit (informational)**
  - [x] 11.1 Add a closing `---` separator + footnote crediting the architectural sources, mirroring the Story 2.3 agent footnote pattern:
    ```
    ---

    This Layer 1 orchestrator mirrors architecture §A.D1 (three-layer
    execution model — main thread, Bun core, sub-agents), §A.D2 (sub-agent
    dispatch via Task tool), §P6 (slash-command markdown patterns —
    frontmatter shape + body pattern + tool restrictions), §line 1443-1485
    (Layer 1↔2↔3 sequence diagram), §line 1660 (AR9 protocol), §line 1677
    (token-count positional flag threading), and PRD FR1, FR16, FR17, FR18,
    FR32, FR46, FR53, FR54.

    For the lock-free pre-dispatch composer, see `src/commands/next/run.ts`
    (Story 2.4). For the lock-acquiring post-dispatch runner, see
    `src/commands/next/verify-and-advance.ts` (Story 2.6). For the canonical
    sub-agent definition, see `agents/bmad-step-runner.md` (Story 2.3). For
    the AR9 JSON-line schema, see `src/schemas/dispatch-protocol.ts` (Story
    2.2). The end-to-end happy-path smoke test is Story 2.8 deliverable.
    ```
  - [x] 11.2 Document the file's relationship to the placeholder: "Story 1.1's repo scaffold created the 11-line placeholder body; Story 2.7 replaces the body with the canonical orchestration logic. The frontmatter (`description`, `argumentHint`, `allowedTools`) is invariant from Story 1.1 — the shape was correct from the scaffold."

- [x] **Task 12 — Quality gates (AC: all)**
  - [x] 12.1 Run `bun run check` — expect 0 fail (Story 2.6 baseline 523 pass / 1840 expects / 45 files). Story 2.7 ships **zero TS deltas**, so test count + expects count are unchanged. Confirm `bunx tsc --noEmit` exits 0.
  - [x] 12.2 Run `bun run lint` (Biome) — expect 0 errors, 0 warnings. (Biome does NOT lint markdown by default; the `commands/` directory is markdown-only and is not subject to Biome.)
  - [x] 12.3 Manual smoke (FR18 + AR9 round-trip): in a Claude Code session with the plugin loaded, type `/bmad-next` (zero-config). Confirm:
    - Bash invocation 1 runs `bun run src/commands/next/run.ts -- ` → emits ONE JSON line `{ "action": "dispatch", "runId": "...", "agent": "bmad-step-runner", "exitCode": 0 }`.
    - Task tool dispatches `bmad-step-runner` with the dispatch-spec path.
    - Sub-agent writes the artifact under `staging/<run-id>/outputs/`.
    - Bash invocation 2 runs `bun run src/commands/next/verify-and-advance.ts -- --run-id <id> --tokens-in <n> --tokens-out <n>` → emits ONE JSON line `{ "action": "report", "message": "✓ <step> → <canonical-path> (tokens: ...)", "exitCode": 0 }`.
    - The summary line prints to the user.
    - `state.yaml` is updated with the new step + runHistory entry.
  - [x] 12.4 Manual smoke (`--dry-run` read-only path): type `/bmad-next --dry-run`. Confirm:
    - Bash invocation 1 emits `{ "action": "report", "message": "<dry-run summary>", "exitCode": 0 }`.
    - NO Task dispatch.
    - NO second Bash invoke.
    - The `message` prints to the user.
    - `state.yaml` is NOT modified.
  - [x] 12.5 Manual smoke (halt path — corrupt state): mutate `state.yaml` to invalid YAML; type `/bmad-next`. Confirm:
    - Bash invocation 1 emits `{ "action": "halt", "message": "<actionable hint>", "exitCode": 1 }`.
    - NO Task dispatch.
    - NO second Bash invoke.
    - The actionable hint prints to the user verbatim.
    - The slash command exits with non-zero.
  - [x] 12.6 AR9 round-trip line-counting check (manual): run `bun run src/commands/next/run.ts -- --dry-run 2>/dev/null | wc -l` → expect exactly **1** line on stdout (FR54 + AR9 + Story 2.4 NFR-M3 verification).

- [x] **Task 13 — Update sprint status + write task record (housekeeping)**
  - [x] 13.1 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`:
    - Flip `2-7-slash-command-for-bmad-next-layer-1-markdown: backlog` → `ready-for-dev`.
    - Bump `last_updated` to `2026-05-01T08:35:00Z`.
  - [x] 13.2 Write `.bmad-stepper/runs/2026-05-01T083100Z-bmad-next/tasks/t1-create-story.yaml` per the Story 2.6 task-record precedent. Capture inputsRead, outputsProduced, selfCheck, storyMetrics, designDecisions, previousStoryIntelligence, forwardDependencies.
  - [x] 13.3 Confirm the dispatch-time declaredMutationScope is honored — only the three allowed paths touched (story MD + sprint-status YAML + task record YAML).

## Dev Notes

### Architecture / boundary discipline

- **Markdown-only deliverable.** Story 2.7 ships ZERO TypeScript code under `src/`. The mutation scope is `commands/bmad-next.md` — the 11-line Story 1.1 placeholder body is REPLACED with the canonical Layer 1 orchestration logic (~150-300 lines). Frontmatter is INVARIANT from Story 1.1 (already correctly shaped).
- **AR41 implication.** The AR41 import-boundary graph applies to TypeScript modules under `src/`; it does NOT govern markdown files. However, the markdown body's INVOCATIONS are tier-bound — Layer 1 may invoke Layer 2 (Bash → Bun script) and Layer 3 (Task → sub-agent), but MUST NOT bypass either layer (e.g., direct file IO outside the `Read` tool's defensive read scope). Story 2.7 honours this by routing ALL state mutation through Layer 2's `verify-and-advance.ts`.
- **Triple-binding integrity.** The slash command's body reads `agent` from the AR9 JSON line; it does NOT hardcode the literal `"bmad-step-runner"`. This decouples the markdown from agent renames — only `src/dispatch/emit.ts:48` (Story 2.2) needs to change if the canonical agent is renamed. The triple-binding (AR9 emit ↔ frontmatter name ↔ Task argument) remains intact via the JSON-line indirection.
- **No `.claude-plugin/plugin.json` mutation.** Per Story 1.1 + Story 2.3 Task 1.2 confirmation: the plugin manifest auto-discovers commands and agents from their respective root-level directories. Story 2.7's body change does not alter the discovery surface.

### Frontmatter (invariant from Story 1.1)

```yaml
---
description: Compute and execute the next BMAD step (zero-config orchestrator).
argumentHint: "[--doctor | --upgrade | --resume | --dry-run | ...]"
allowedTools: ["Bash", "Task", "Read"]
---
```

The `description` is updated from the Story 1.1 placeholder ("Compute and execute the next BMAD step (placeholder).") to drop the "(placeholder)" suffix. The `argumentHint` and `allowedTools` are preserved verbatim from Story 1.1 — they were correctly shaped from the scaffold.

### Body section structure

The new body has 6 top-level sections per Task 1.1 sketch:

1. **Role declaration** (1 line) — "Compute and execute the next BMAD step. Layer 1 orchestrator: Bash → AR9 JSON line → Task → Bash → summary."
2. **`## Usage examples`** — 8 example invocations (zero-config, `--dry-run`, `--explain`, `--resume`, `--doctor`, `--list`, `--diff-state`, `--export-state`).
3. **`## Behavior`** — 6 numbered subsections (Bash 1, parse JSON line, branch on action, capture tokens, Bash 2, print summary).
4. **`## Tool restrictions`** — 3 bullet points (Bash limited to `bun run <plugin-root>/...`, Task limited to plugin-declared agents, no file edits outside scope).
5. **`## Error handling`** — DO / DO NOT lists for halt-path discipline.
6. **Footnote** — architectural sources + downstream-story credits.

### AR9 JSON-line consumption pattern

The slash-command body documents the AR9 protocol inline (rather than `Read`-ing `src/schemas/dispatch-protocol.ts` at runtime) per the architecture's documented pattern (architecture §P6 body pattern). The schema is informational at the markdown layer; the canonical enforcement lives in `emitDispatchAction`'s Zod parse on the writer side (Story 2.2). Layer 1 trusts the writer per defence-in-depth, but the markdown body documents the shape so Claude (Layer 1) can validate the structure without an extra read.

### Token-count capture pattern (architecture Critical Gap Resolution 6)

The Task tool's response object exposes `tokens_in` + `tokens_out` per Claude Code runtime convention. The markdown body instructs Claude to capture these as integers and forward them as positional flags to `verify-and-advance.ts`:

```
bun run src/commands/next/verify-and-advance.ts -- --run-id <runId> --tokens-in <tokensIn> --tokens-out <tokensOut>
```

The fall-back behavior (token counts missing or zero) is documented — `parseVerifyAndAdvanceArgs` accepts non-negative integers including 0 (Story 2.6 Task 4 schema). The captured counts flow into BOTH the run-log JSON `tokensIn`/`tokensOut` fields (Story 2.5 surface) AND the `runHistory[]` entry on `state.yaml` (Story 2.6 surface). Story 4.5's `--token-budget` stop condition + Story 6.7's telemetry aggregation are downstream consumers.

### Tool restriction inheritance

Per architecture §P6 lines 948-951 + epic AC line 701, the slash-command body declares three tool-restriction clauses:

1. **Bash limited to `bun run <plugin-root>/...`** — the slash command MUST NOT invoke shell scripts, system binaries (`curl`, `git`, `npm`, `node`, `python`), or any non-Bun executable. The body documents this as a prompt-layer constraint.
2. **Task limited to plugin-declared agents** — only agents under `agents/` in this plugin. For v0.1 the only declared agent is `bmad-step-runner`. Future agents (e.g., `bmad-step-fixer` from Story 5.3) will be added to the same directory.
3. **No file edits outside `staging/<run-id>/` and `_bmad-output/.stepper/`** — the `Read` tool may inspect any project file (read-only); `Write` and `Edit` are NOT in `allowedTools` (per frontmatter declaration). The architectural enforcement (NFR-S2 scope check, `assertWithinScope` per Story 1.3) lives at Layer 2 — the markdown declaration is the FIRST line of defence.

### Error handling discipline

Per FR32 + FR46 + AR21 + AR22 + AR9, every error surfaces as a single-line actionable hint via the AR9 `action: "halt"` JSON line. The slash command:

- Prints the `message` field VERBATIM (no embellishment).
- Exits with the `exitCode` field (>= 1 per FR53).
- Does NOT retry automatically (Stories 5.1-5.4 own the failure-UX engine).
- Does NOT append stack traces (errors are AR21-conformant — translated by Layer 2's outer try/catch).
- Does NOT run a third Bash or Task on the halt path.

The transcript pair (`<ts>-<step>.{log,json}` under `_bmad-output/.stepper/runs/`) is STILL written on every halt path (Story 2.6 finally block) — users can run `/bmad-next --watch` (Story 3.9) or inspect the files directly for forensic detail per FR43 + FR44.

### Layer 1 vs Layer 2 vs Layer 3 boundary discipline

| Layer | Owner | Story 2.7 Surface |
|-------|-------|-------------------|
| Layer 1 (main thread) | `commands/bmad-next.md` body | This story's deliverable. |
| Layer 2 (Bun core) | `src/commands/next/{run,verify-and-advance}.ts` | Stories 2.4 + 2.6 already shipped. Story 2.7 INVOKES via Bash. |
| Layer 3 (sub-agent) | `agents/bmad-step-runner.md` | Story 2.3 already shipped. Story 2.7 INVOKES via Task. |

Story 2.7 is the **first AND only** Story 2.* deliverable that lives at Layer 1. All prior Stories (2.1, 2.2, 2.4, 2.5, 2.6) shipped Layer 2 surfaces; Story 2.3 shipped the Layer 3 surface. Story 2.7 closes the loop.

### Round-trip diagnostics

The slash command produces:

1. ONE AR9 JSON line on stdout per Bash invoke (×2 on dispatch path; ×1 on report/halt path).
2. ZERO main-thread output beyond the FR18 single-line summary (success path) OR the actionable hint (halt path).
3. TWO files under `_bmad-output/.stepper/runs/`: `<ts>-<step>.log` (markdown transcript per AR25) + `<ts>-<step>.json` (machine-readable run log per AR26).
4. ONE atomic `state.yaml` update + `.bak` rotation (success path only).
5. ONE atomic canonical-artifact write under `_bmad-output/<phase>-artifacts/<step>.<ext>` (success path only).

All five surfaces are NFR-S5 atomic; NFR-R1 zero-data-loss; NFR-S2 in-scope.

### v0.1 limitations + forward-deferred surfaces

- **Multi-persona steps** (AR16) — v0.1 Story 2.4 picks the FIRST persona from `resolvePersona`'s `string | readonly string[]` return contract. The slash command body inherits this — single Task dispatch per `/bmad-next` invocation. Multi-persona sequential dispatch is Story 4.1 (loop runner) + Story 5.* (failure-UX engine).
- **`--watch`** — v0.1 routes through `run.ts` to `action: "halt"` with hint pointing at Story 3.9. Story 2.7's body just passes the flag through `$ARGUMENTS`; the markdown does NOT branch on `--watch` itself.
- **`--upgrade`** — v0.1 routes through `run.ts` to `action: "halt"` with hint pointing at Story 6.9. Same passthrough pattern as `--watch`.
- **`--force-unlock`** — v0.1 routes through `run.ts` to `action: "halt"` with hint pointing at Epic 6 polish. Same passthrough pattern.
- **`--resume` / `--diff-state` / `--export-state` / `--explain` / `--list` / `--dry-run`** — v0.1 read-only flags route to `action: "report"` per Story 2.4. The slash command body branches on `report` and prints the `message` directly — no Task dispatch, no second Bash invoke.

### Story 1.1 placeholder context

Story 1.1's `commands/bmad-next.md` shipped 11 lines:

```markdown
---
description: Compute and execute the next BMAD step (placeholder).
argumentHint: "[--doctor | --upgrade | --resume | --dry-run | ...]"
allowedTools: ["Bash", "Task", "Read"]
---

# /bmad-next (Placeholder)

This command is not yet implemented. Story 1.1 only ships the repository scaffold.
The actual orchestration logic ships in Epic 2.
```

Story 2.7 REPLACES lines 7-11 (the placeholder body) with the canonical orchestration body (~150-300 lines). The frontmatter (lines 1-5) is preserved with one minor edit: drop the "(placeholder)" suffix from `description`.

### Carry-overs from Story 2.6

Per Story 2.6 §Carry-overs to future stories (Story 2.6 file lines 1338-1344):

- **PRIMARY INVOKER role**: Story 2.7 calls `bun run src/commands/next/verify-and-advance.ts -- --run-id <id> --tokens-in <n> --tokens-out <n>` AFTER the Task tool returns. Captures token counts from the Task response object per architecture Critical Gap Resolution 6 line 1677.
- **AR9 stdout consumer**: Story 2.7 reads the AR9 JSON line from `verify-and-advance.ts`'s stdout and prints the `message` field as the FR18 summary.
- **No code changes to Story 2.6 surface**: Story 2.6's `verify-and-advance.ts` public CLI surface (`--run-id`, `--tokens-in`, `--tokens-out` flags + AR9 stdout JSON line + exit codes 0-5) is the contract Story 2.7 invokes. Story 2.7 must NOT modify either file.

### Carry-overs from Story 2.4

Per Story 2.4 §Forward Dependencies (Story 2.4 file line 685):

- **PRIMARY INVOKER role**: Story 2.7 calls `bun run src/commands/next/run.ts -- $ARGUMENTS` (the user's slash-command arguments forwarded verbatim per Claude Code's `$ARGUMENTS` expansion convention per architecture §line 629).
- **AR9 stdout consumer**: Story 2.7 reads the AR9 JSON line from `run.ts`'s stdout and branches on `action`.
- **No code changes to Story 2.4 surface**: same invariance as Story 2.6.

### Carry-overs from Story 2.3

Per Story 2.3 §Forward Dependencies (Story 2.3 file lines 71, 84):

- **PRIMARY INVOKER role**: Story 2.7 invokes `Task(agent="bmad-step-runner", prompt="staging/<runId>/dispatch-spec.json")`. The literal `"bmad-step-runner"` is NOT hardcoded — read from the AR9 JSON line's `agent` field for triple-binding integrity.
- **No code changes to Story 2.3 surface**: the agent's `name`, `description`, `allowed-tools` frontmatter is the binding contract Story 2.7 invokes; modifying it would break the AR9 triple-binding.

## Forward Dependencies

Stories that consume Story 2.7's `commands/bmad-next.md` deliverable:

- **Story 2.8 — Smoke test for `/bmad-next` happy path** [E2E SATISFACTION]: spawns the full pipeline (slash command → Bash → Task → Bash → summary) and asserts the artifact ends up at the canonical path with the verifier reporting `pass`. The canonical end-to-end test for Story 2.7's orchestrator. Requires the slash command to exist for the Claude Code runtime to dispatch it.
- **Story 4.1 — `/bmad-loop` skeleton**: composes `/bmad-next` per loop iteration. The Layer 1 markdown body of `commands/bmad-loop.md` (NEW in Story 4.1) invokes the slash command Story 2.7 ships. The composition pattern (Bash + Task) Story 2.7 establishes is the canonical Layer 1 orchestrator template; `/bmad-loop` extends with iteration + stop-condition logic.
- **Stories 3.6 / 3.7 / 3.8 / 3.9 / 3.10** — the read-only flag surfaces. Story 2.7's body routes `report` action lines directly to user output — no behavior change required when these stories enrich the `message` field shape.
- **Stories 5.1-5.4 — Failure-UX modes**: when the Layer 2 failure-UX engine ships, the AR9 line shape MAY be extended (e.g., `action: "halt"` with structured retry-hint). Story 2.7's body branches on `action` ∈ {"dispatch", "report", "halt"} — adding new action variants would require a body update; v0.1 ships only the three.
- **Story 6.x failure-UX engine** — the `action: "halt"` branch may be replaced with structured retry / skip / route-to-fixer / escalate semantics. Story 2.7's v0.1 body simply prints the hint and exits non-zero.
- **Story 6.10 — repo files for v0.1.0 marketplace release**: bundles `commands/bmad-next.md` (Story 2.7's deliverable) into the marketplace package. The markdown is the user-visible documentation surface for the slash command — Story 6.10 ratifies the v0.1 publication shape.

## Previous Story Intelligence

This is iteration 7 of Epic 2 — the **seventh story** of the epic, following Story 2.1 (verifiers — DONE), Story 2.2 (dispatch-spec generator — DONE), Story 2.3 (generic sub-agent — DONE), Story 2.4 (lock-free `run.ts` — DONE), Story 2.5 (transcript writers — DONE), and Story 2.6 (lock-acquiring `verify-and-advance.ts` — DONE). Story 2.7 wires Layer 1 markdown into the canonical orchestrator. Lessons learned from Stories 1.1–1.13 + 2.1 + 2.2 + 2.3 + 2.4 + 2.5 + 2.6 directly applicable:

### Story 1.1 — Bun host scaffold

- `commands/bmad-next.md` was created as a placeholder during Story 1.1 with frontmatter `description`, `argumentHint`, `allowedTools: ["Bash", "Task", "Read"]`. The frontmatter shape is correct from the scaffold; Story 2.7 replaces only the placeholder body (lines 7-11). The "(placeholder)" suffix in `description` is dropped.
- The plugin manifest auto-discovers commands; no `.claude-plugin/plugin.json` mutation needed.

### Story 1.12 — `/bmad-next --doctor` Command

- Story 1.12 shipped `commands/bmad-doctor.md` as the canonical slash-command markdown precedent — frontmatter (`description`, `argumentHint`, `allowedTools`), body (one-line role declaration + behavior section + Bash invocation + diagnostic output description). Story 2.7's `bmad-next.md` follows the same structural template but extends with: (a) JSON-line parse step, (b) `Task` invocation, (c) token-count capture, (d) second Bash invoke, (e) summary print.
- The Story 1.12 doctor body is shorter (~25 lines including frontmatter) because doctor has no Task dispatch and no AR9 protocol — just one Bash invoke + 5 stderr lines. Story 2.7's body is longer (~150-300 lines) because the orchestration sequence is richer.

### Story 2.1 — Verifier configuration registry

- Independent at the slash-command markdown layer. Story 2.7 does NOT consume Story 2.1's surface directly — Story 2.6's `verify-and-advance.ts` invokes `runVerifier` internally. The verifier output flows through the AR9 line's `message` field per Story 2.6 Task 8.7.

### Story 2.2 — Dispatch spec generator

- Story 2.2 shipped `src/dispatch/emit.ts` which writes the AR9 JSON line `{ "action": "dispatch", "runId": "...", "agent": "bmad-step-runner", "exitCode": 0 }` (per `emit.ts:48`). Story 2.7's body reads the `agent` field from this line at runtime per the triple-binding documented in Story 2.3 line 84.
- Story 2.2 also shipped `src/schemas/dispatch-protocol.ts` (`DispatchActionV1Schema`) — the canonical contract for the AR9 stdout JSON line. Story 2.7's body documents the union shape inline (informational only — the canonical Zod parse lives in `emitDispatchAction` per defence-in-depth).

### Story 2.3 — Generic sub-agent

- Story 2.3 shipped `agents/bmad-step-runner.md` with frontmatter `name: bmad-step-runner`. Story 2.7's body invokes `Task(agent=<from-AR9-line>, prompt="<dispatch-spec-path>")` — the literal `"bmad-step-runner"` is NOT hardcoded. Triple-binding integrity per Story 2.3 line 84.
- The sub-agent's `allowed-tools` (frontmatter line 4: `Read, Write, Edit, Grep, Bash`) is enforced by Claude Code's runtime — Story 2.7 does NOT need to re-declare these in the slash-command body.

### Story 2.4 — Lock-free `run.ts`

- Story 2.4 shipped `src/commands/next/run.ts` with the `import.meta.main` block that emits exactly ONE AR9 JSON line on stdout via `emitDispatchAction(result.action)` then `process.exit(result.exitCode)`. Story 2.7's body invokes this via `bun run src/commands/next/run.ts -- $ARGUMENTS` and parses the single line.
- Story 2.4's lock-free contract per architecture §line 1672 + AR8 means the (5+ minute) sub-agent dispatch between Bash 1 and Bash 2 does NOT hold the project lock. Story 2.7's body design depends on this — the two Bash invokes are SEPARATE PROCESSES.
- Story 2.4 wired the `cleanStagingOrphans()` "at Stepper start" (Task 4) — Story 2.7 inherits this transparently; no additional cleanup invocation required at the slash-command layer.

### Story 2.5 — Transcript writers

- Independent at the slash-command markdown layer. Story 2.7 does NOT consume Story 2.5's surface directly — Story 2.6's `verify-and-advance.ts` invokes `writeStepTranscript` internally per the FIRST canonical caller carry-over closure.
- Story 2.5 dev-001 directory rename (`src/runs/` instead of architecture-doc `src/transcript/`) is independent of Story 2.7 (the markdown body does NOT reference the source-tree path).

### Story 2.6 — `verify-and-advance.ts` (PREVIOUS STORY)

- Story 2.6 shipped `src/commands/next/verify-and-advance.ts` with the `import.meta.main` block that emits exactly ONE AR9 JSON line on stdout via `emitDispatchAction(result.action)` then `process.exit(result.exitCode)`. Story 2.7's body invokes this via `bun run src/commands/next/verify-and-advance.ts -- --run-id <id> --tokens-in <n> --tokens-out <n>` and parses the single line.
- Story 2.6's `parseVerifyAndAdvanceArgs` (Task 4) accepts `--run-id <id>`, `--tokens-in <n>`, `--tokens-out <n>` per epic line 694 step 5. Story 2.7 invokes with these positional flags exactly.
- Story 2.6's success-line message format (Story 2.6 Task 8.7 — `"✓ <step> → <canonical-path> (tokens: in=<n> out=<n>, <ms>ms)"`) is the FR18-conformant string Story 2.7's body prints verbatim.
- Story 2.6's halt-path hint propagation (`StateChangedDuringDispatchError.actionableHint`, `VerifierFailureError.actionableHint`, etc.) flows through the AR9 line's `message` field — Story 2.7 prints verbatim.

### Errors registry stability

- The 16-entry registry has been stable since Story 1.5; held through Stories 1.13, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6. Story 2.7 USES no error classes (markdown-only deliverable; the body reads error hints from the AR9 line's `message` field, which is composed by Layer 2's `actionableHint` propagation). Registry stays at 16 codes.

### AR41 boundary discipline

- AR41 governs `src/` TypeScript modules; markdown files under `commands/` and `agents/` are exempt. Story 2.7's deliverable is markdown-only — no AR41 boundary check applies. The body's INVOCATIONS are tier-bound (Layer 1 → Layer 2 via Bash; Layer 1 → Layer 3 via Task) but this is the architectural intent, not a boundary violation.

### Test-first enforcement

- Test count grew 0 → 311 (epic-1) → 354 (Story 2.1) → 409 (Story 2.2) → 409 (Story 2.3 — markdown-only) → 441 (Story 2.4) → 475 (Story 2.5) → 523 (Story 2.6). Story 2.7 mirrors Story 2.3's markdown-only pattern: **zero test deltas**. The canonical end-to-end smoke is Story 2.8.
- Manual smoke validation (Task 12.3, 12.4, 12.5, 12.6) covers the dev-iteration sanity check; Story 2.8 ships the automated end-to-end coverage.

### Scope discipline

- Story 2.6 added 2 new sources + 2 new test files + 4 modified files (8 file changes). Story 2.7 modifies 1 file (`commands/bmad-next.md` body) + 2 housekeeping files (sprint-status YAML + task record YAML). Modest scope per markdown-only deliverable pattern.

### Story 2.3 markdown-only precedent

- Story 2.3 was the prior markdown-only deliverable (the agent definition). Lessons applicable to Story 2.7:
  1. **Frontmatter shape is the binding contract** — Story 2.3's `name`, `description`, `allowed-tools` frontmatter is invariant; Story 2.7's `description`, `argumentHint`, `allowedTools` frontmatter is similarly the binding contract.
  2. **Body is prompt-engineered orchestration** — both stories ship structured prompts that instruct Claude (Layer 3 sub-agent or Layer 1 main thread) how to follow a contractual sequence.
  3. **Triple-binding integrity** — Story 2.3 establishes the `name: bmad-step-runner` literal; Story 2.7 reads the literal at runtime via the AR9 JSON line. The two stories together complete the binding loop.
  4. **Manual smoke fixture pattern** — Story 2.3 shipped `tests/fixtures/bmad-step-runner/` for dev-iteration sanity checks; Story 2.7 does NOT ship a fixture (Story 2.8 owns the canonical end-to-end). The dev-iteration smoke for Story 2.7 is the manual `/bmad-next` invocation in Claude Code (Task 12.3-12.6).

### Long-story threshold

- epic-1-retrospective recommends < 600 lines per story file. Story 2.6 landed at ~1351 lines (deliberate exception for the SECOND L-effort runner-tier integration story). Story 2.7 targets ~500-800 lines — **within the threshold** for an M-effort markdown-only deliverable. The simpler scope (no source-tree mutations, no test files, no schema deltas) keeps the story file lean.

## Architectural Reference Map

The story authoring referenced these specific sections:

- `_bmad-output/planning-artifacts/architecture.md` §A.D1 lines 270-296 (three-layer execution model — Layer 1 main thread)
- `_bmad-output/planning-artifacts/architecture.md` §A.D2 lines 297-336 (sub-agent dispatch via Task tool — Layer 1↔3 binding)
- `_bmad-output/planning-artifacts/architecture.md` §line 332 (prescribed agent description for `bmad-step-runner`)
- `_bmad-output/planning-artifacts/architecture.md` §P5 lines 864-917 (dispatch-spec.json shape + verifier output + promotion contract)
- `_bmad-output/planning-artifacts/architecture.md` §P6 lines 919-952 (slash-command markdown patterns — frontmatter shape + body pattern + tool restrictions)
- `_bmad-output/planning-artifacts/architecture.md` §directory-listing line 1065 (`commands/bmad-next.md` placement)
- `_bmad-output/planning-artifacts/architecture.md` §line 1263 (Layer 1 = main thread surface)
- `_bmad-output/planning-artifacts/architecture.md` §lines 1443-1485 (Layer 1↔2↔3 sequence diagram)
- `_bmad-output/planning-artifacts/architecture.md` §line 1460 (AR9 stdout JSON-line emit)
- `_bmad-output/planning-artifacts/architecture.md` §line 1465 (Task invocation surface)
- `_bmad-output/planning-artifacts/architecture.md` §line 1660 (AR9 protocol concretization — exit-code constraints)
- `_bmad-output/planning-artifacts/architecture.md` §line 1677 (Critical Gap Resolution 6 — token counts threaded via positional flags)
- `_bmad-output/planning-artifacts/prd.md` FR1 line 671 (compute next step zero-config)
- `_bmad-output/planning-artifacts/prd.md` FR16 line 689 (sub-agent dispatch with budget+timeout)
- `_bmad-output/planning-artifacts/prd.md` FR17 line 690 (verifier on every sub-agent output)
- `_bmad-output/planning-artifacts/prd.md` FR18 line 691 (one human-readable line per step)
- `_bmad-output/planning-artifacts/prd.md` FR32 line 711 (actionable error report on halt)
- `_bmad-output/planning-artifacts/prd.md` FR46 line 731 (single-line + full-detail errors)
- `_bmad-output/planning-artifacts/prd.md` FR53 line 744 (exit codes 0-5)
- `_bmad-output/planning-artifacts/prd.md` FR54 line 745 (stdout/stderr discipline)
- `_bmad-output/planning-artifacts/prd.md` NFR-S2 line 765 (writes only inside scope)
- `_bmad-output/planning-artifacts/prd.md` NFR-S4 line 767 (sub-agent isolation enforces declared scope)
- `_bmad-output/planning-artifacts/prd.md` NFR-R1 line 773 (zero data loss on halt)
- `_bmad-output/planning-artifacts/epics.md` Story 2.7 lines 684-701 (AC verbatim source)
- `_bmad-output/implementation-artifacts/2-6-verify-and-advance-ts-with-state-hash-check.md` (Story 2.6 — PRIMARY INVOKER carry-over for Story 2.7)
- `_bmad-output/implementation-artifacts/2-4-lock-free-run-ts-for-bmad-next.md` (Story 2.4 — PRIMARY INVOKER carry-over for Story 2.7)
- `_bmad-output/implementation-artifacts/2-3-generic-sub-agent-bmad-step-runner-md.md` (Story 2.3 — Layer 3 process boundary; PRIMARY INVOKER carry-over for Story 2.7)
- `_bmad-output/implementation-artifacts/2-2-dispatch-spec-generator.md` (Story 2.2 — `emitDispatchAction` agent literal; AR9 JSON-line writer)
- `_bmad-output/implementation-artifacts/1-12-bmad-next-doctor-command.md` (Story 1.12 — slash-command markdown precedent for `commands/bmad-doctor.md`)
- `_bmad-output/implementation-artifacts/1-1-initialize-repository-scaffold.md` (Story 1.1 — placeholder body for `commands/bmad-next.md`)
- `commands/bmad-next.md` (existing 11-line placeholder; Story 2.7 REPLACES body)
- `commands/bmad-doctor.md` (Story 1.12 markdown precedent)
- `agents/bmad-step-runner.md` (Story 2.3 sub-agent — `Task` invocation target)
- `src/commands/next/run.ts` (Story 2.4 — Bash invoke 1 source)
- `src/commands/next/verify-and-advance.ts` (Story 2.6 — Bash invoke 2 source)
- `src/commands/next/args.ts` (Story 1.7 + Story 2.6 — `parseNextArgs` + `parseVerifyAndAdvanceArgs` consumers)
- `src/schemas/dispatch-protocol.ts` (Story 2.2 — `DispatchActionV1Schema` AR9 contract)
- `src/dispatch/emit.ts` (Story 2.2 — `emitDispatchAction` writes `agent: "bmad-step-runner"` literal at line 48)

## File List

> Predicted by bmad-create-story; finalized by bmad-dev-story on completion.

**New files:** none.

**Modified files:**

- `commands/bmad-next.md` — REPLACE placeholder body (lines 7-11) with canonical Layer 1 orchestration body (~150-300 lines). Frontmatter (lines 1-5) preserved with one minor edit (drop "(placeholder)" suffix from `description`). NEW total file size: ~155-310 lines.

**Status flips (3 files):**

- `_bmad-output/implementation-artifacts/2-7-slash-command-for-bmad-next-layer-1-markdown.md` — `status: ready-for-dev` → `review` (after dev-story completes); all task checkboxes flipped to checked; Dev Agent Record sections populated.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `2-7-slash-command-for-bmad-next-layer-1-markdown: backlog` → `ready-for-dev` (this story-create task) → `review` (after dev-story); `last_updated` refreshed.
- `.bmad-stepper/runs/2026-05-01T083100Z-bmad-next/tasks/t1-create-story.yaml` — task record file (NEW) for this story-create invocation.

## Dev Agent Record

> Populated by bmad-dev-story on completion.

### Context Reference

- `_bmad-output/implementation-artifacts/2-7-slash-command-for-bmad-next-layer-1-markdown.md` (this story file)
- `_bmad-output/implementation-artifacts/2-6-verify-and-advance-ts-with-state-hash-check.md` (PREVIOUS STORY — PRIMARY INVOKER carry-over for Story 2.7)
- `_bmad-output/implementation-artifacts/2-4-lock-free-run-ts-for-bmad-next.md` (Story 2.4 — PRIMARY INVOKER carry-over for Story 2.7)
- `_bmad-output/implementation-artifacts/2-3-generic-sub-agent-bmad-step-runner-md.md` (Story 2.3 — PRIMARY INVOKER carry-over for Story 2.7)
- `_bmad-output/implementation-artifacts/2-2-dispatch-spec-generator.md` (Story 2.2 — `emitDispatchAction` agent literal; AR9 JSON-line writer)
- `_bmad-output/implementation-artifacts/1-12-bmad-next-doctor-command.md` (Story 1.12 — slash-command markdown precedent)
- `_bmad-output/implementation-artifacts/1-1-initialize-repository-scaffold.md` (Story 1.1 — placeholder body source)
- `_bmad-output/planning-artifacts/architecture.md` §A.D1 (three-layer execution model)
- `_bmad-output/planning-artifacts/architecture.md` §A.D2 (sub-agent dispatch via Task tool)
- `_bmad-output/planning-artifacts/architecture.md` §P6 (slash-command markdown patterns)
- `_bmad-output/planning-artifacts/architecture.md` §lines 1443-1485 (Layer 1↔2↔3 sequence)
- `_bmad-output/planning-artifacts/architecture.md` §line 1660 (AR9 protocol concretization)
- `_bmad-output/planning-artifacts/architecture.md` §line 1677 (Critical Gap Resolution 6 — token counts threaded)

### Agent Model Used

claude-opus-4-7[1m] (Bun host 1.3.12).

### Debug Log References

- `bun run check` baseline before edit: 523 pass / 0 fail / 1840 expects / 45 files (carries from Story 2.6 final).
- `bun run check` after edit: 523 pass / 0 fail / 1840 expects / 45 files (markdown-only deliverable; ZERO TS deltas).
- `bunx tsc --noEmit` after edit: exit code 0.
- Frontmatter shape verified preserved per Task 0.2 + Task 2.4: `description: "Compute and execute the next BMAD step (zero-config orchestrator)."` (placeholder suffix dropped); `argumentHint: "[--doctor | --upgrade | --resume | --dry-run | ...]"` (invariant); `allowedTools: ["Bash", "Task", "Read"]` (invariant).

### Completion Notes

Story 2.7 ships the canonical Layer 1 markdown body of `commands/bmad-next.md`
— the FIRST AND ONLY Layer 1 deliverable of Epic 2. The Story 1.1 placeholder
body (lines 7-11) is REPLACED with the canonical orchestration body (270-line
total file size, within 150-300 target). Frontmatter (lines 1-5) preserved
with one minor edit: `description` suffix `"(placeholder)"` dropped per Task 2.4.

The body has 6 top-level sections per Task 1.1 sketch:

1. **Role declaration (1 line)** — "Compute and execute the next BMAD step.
   Layer 1 orchestrator: Bash → AR9 JSON line → Task → Bash → summary."
2. **`## Usage examples`** — 8 example invocations (zero-config, `--dry-run`,
   `--explain`, `--resume`, `--doctor`, `--list`, `--diff-state`,
   `--export-state`).
3. **`## Behavior`** — 6 numbered subsections (Bash 1, parse JSON line,
   branch on action, capture tokens, Bash 2, print summary).
4. **`## Tool restrictions`** — 3 bullet points (Bash limited to
   `bun run <plugin-root>/...`; Task limited to plugin-declared agents;
   no file edits outside `staging/<run-id>/` and `_bmad-output/.stepper/`).
5. **`## Error handling`** — DO / DO NOT lists for halt-path discipline.
6. **Footnote** — architectural sources + downstream-story credits.

The body documents the AR9 union shape inline (informational only — the
canonical Zod parse lives in `emitDispatchAction` per defence-in-depth).
Triple-binding integrity preserved: the body reads `agent` from the AR9
JSON line at runtime rather than hardcoding the literal `"bmad-step-runner"`,
so a future renamed agent (Story 6.x) breaks neither the markdown nor the
code path.

Token-count capture pattern documented per architecture Critical Gap
Resolution 6 line 1677: from Task tool response object (`tokens_in` +
`tokens_out`); forwarded as `--tokens-in <n> --tokens-out <n>` positional
flags. Fall-back to `0 / 0` if response lacks token counts (per Story 2.6
`parseVerifyAndAdvanceArgs` non-negative-integer schema).

Quality gates: `bun run check` and `bunx tsc --noEmit` both exit 0; test
counts unchanged at 523 pass / 0 fail / 1840 expects / 45 files
(markdown-only deliverable; bun test cannot exercise Layer 1). Manual
smoke validation only (Tasks 12.3-12.6) — automated end-to-end is Story 2.8.

NO deviations recorded. NO `src/` mutations. NO new agent definitions.
NO new schema changes. NO `.claude-plugin/plugin.json` mutations. Errors
registry stays at 16 codes. Bun host: 1.3.12 (satisfies AR2 ≥ 1.3).

### File List

**Modified files:**

- `commands/bmad-next.md` — REPLACED placeholder body (lines 7-11) with
  canonical Layer 1 orchestration body (~263 lines of body content).
  Frontmatter preserved with one minor edit (drop "(placeholder)" suffix
  from `description`). Total file size: 270 lines (within 150-300 target).

**Status flips:**

- `_bmad-output/implementation-artifacts/2-7-slash-command-for-bmad-next-layer-1-markdown.md`
  — `status: ready-for-dev` → `review`; all task checkboxes flipped to
  checked; Dev Agent Record sections populated.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` —
  `2-7-slash-command-for-bmad-next-layer-1-markdown: ready-for-dev` →
  `review`; `last_updated` refreshed to `2026-05-01T08:38:00Z`.
- `.bmad-stepper/runs/2026-05-01T083600Z-bmad-next/tasks/t1-dev-story.yaml`
  — task record (NEW) for this dev-story invocation.

## Change Log

- **2026-05-01 (code-review)**: Status `review` → `done` (approve). Senior Developer Review appended (verdict APPROVE with 0 findings). All 2 AC + 7 AR + 8 FR + 4 NFR coverage verified PASS via reading `commands/bmad-next.md` (270 lines), AR9 line-count smoke (`bun run src/commands/next/run.ts -- --dry-run 2>/dev/null | wc -l = 1` — FR54 + AR9 confirmed empirically). Quality gates re-run: `bun run check` 523 pass / 0 fail / 1840 expects / 45 files (Story 2.6 baseline carries through unchanged); `bunx tsc --noEmit` exit 0. Triple-binding integrity inspected: literal `"bmad-step-runner"` appears only as documentation (4 occurrences at lines 102, 106, 204, 268) — the runtime invocation reads `<jsonLine.agent>` (line 83) per defence-in-depth. Frontmatter preserved per Task 0.2 + Task 2.4: `description: "Compute and execute the next BMAD step (zero-config orchestrator)."` (placeholder suffix dropped); `argumentHint: "[--doctor | --upgrade | --resume | --dry-run | ...]"` (invariant); `allowedTools: ["Bash", "Task", "Read"]` (invariant). Sprint-status YAML synchronized: `2-7-slash-command-for-bmad-next-layer-1-markdown: review` → `done`. bmad-code-review persona, model `claude-opus-4-7[1m]`, run `2026-05-01T083900Z-bmad-next`. Mutation scope honored: only story MD + sprint-status YAML + task record YAML touched per declared paths.
- **2026-05-01 (dev-story)**: Body of `commands/bmad-next.md` REPLACED (11-line Story 1.1 placeholder → 270-line canonical Layer 1 orchestration body, within 150-300 target). Frontmatter (lines 1-5) preserved with one minor edit: `description` suffix `"(placeholder)"` dropped per Task 2.4. Status `ready-for-dev` → `review`; sprint-status YAML synchronized. ZERO TS deltas — `bun run check` and `bunx tsc --noEmit` exit 0; test counts unchanged at 523 pass / 0 fail / 1840 expects / 45 files. Errors registry stays at 16 codes (markdown-only deliverable USES no error classes). Triple-binding integrity preserved — body reads `agent` from AR9 JSON line at runtime, NOT hardcoded literal. Token-count capture pattern documented per architecture Critical Gap Resolution 6 line 1677. Tool restrictions documented per epic AC line 701 + architecture §P6 lines 948-951. NO deviations recorded. Bun host: 1.3.12 (satisfies AR2 ≥ 1.3). Mutation scope honored: only `commands/bmad-next.md`, story MD, sprint-status YAML, and task record YAML touched per `.bmad-stepper/runs/2026-05-01T083600Z-bmad-next/run.yaml` declared paths. bmad-dev-story persona, model `claude-opus-4-7[1m]`, run `2026-05-01T083600Z-bmad-next`.
## Senior Developer Review (AI)

**Reviewer:** Tomasz (bmad-code-review persona)
**Date:** 2026-05-01
**Outcome:** **APPROVE**

### Summary

Story 2.7 ships the canonical Layer 1 markdown body of `commands/bmad-next.md` — the **first AND only Layer 1 deliverable of Epic 2** that closes the Layer 1 ↔ Layer 2 ↔ Layer 3 orchestration loop. The 11-line Story 1.1 placeholder body is replaced with a 270-line orchestrator (within the 150-300 target) covering: role declaration, 8 usage examples, 6-step behavior sequence (Bash → AR9 parse → branch → token capture → Bash → summary), 3-clause tool-restrictions section, DO/DO-NOT error-handling discipline, and architectural footnote. Frontmatter is preserved verbatim from Story 1.1 with one minor edit (drop the "(placeholder)" suffix from `description`). ZERO `src/` mutations; ZERO test deltas; ZERO new error classes; ZERO `.claude-plugin/plugin.json` changes. Triple-binding integrity is preserved by reading `<jsonLine.agent>` at runtime rather than hardcoding the literal — the literal `"bmad-step-runner"` appears only as documentation (4 occurrences at lines 102, 106, 204, 268, never inside a `Task(agent="bmad-step-runner", ...)` invocation).

### Acceptance Criteria

| AC | Verdict | Evidence |
|----|---------|----------|
| **AC-1** (frontmatter shape + 6-step body for `dispatch` path) | PASS | Frontmatter at `commands/bmad-next.md:1-5` matches epic AC line 692 verbatim: `description` (zero-config orchestrator), `argumentHint: "[--doctor \| --upgrade \| --resume \| --dry-run \| ...]"`, `allowedTools: ["Bash", "Task", "Read"]`. 6-step body at lines 31-194 maps 1:1 to epic AC line 694 enumeration: (1) Bash `run.ts -- $ARGUMENTS` (lines 31-50), (2) parse single stdout JSON line (52-74), (3) branch on action with Task dispatch (76-114), (4) capture token counts (116-140), (5) Bash `verify-and-advance.ts -- --run-id ... --tokens-in ... --tokens-out ...` (142-170), (6) print FR18 summary (172-194). |
| **AC-2** (`report` and `halt` branches print `message` directly) | PASS | Lines 88-95 codify: `report` → "Print the `message` field DIRECTLY to the user. No Task dispatch. No second Bash invoke. Exit with the JSON line's exitCode (typically 0)." `halt` → "Print the `message` field DIRECTLY to the user (the actionable hint). No Task dispatch. No second Bash invoke. Exit with the JSON line's exitCode (>= 1 per FR53)." Tool-restrictions section (lines 198-208) declares all 3 clauses from epic AC line 701. |

### Architecture / FR / NFR Coverage

| Item | Verdict | Evidence |
|------|---------|----------|
| **AR7** (6-section dispatch-spec contract) | PASS | Body delegates spec composition to Layer 2 `run.ts` (line 34); Task dispatch passes the spec path as the only data channel (line 84) per `agents/bmad-step-runner.md:14-18`. |
| **AR8** (lock-free pre-dispatch + lock-held post-dispatch) | PASS | Documented at lines 39-42 ("no project lock is acquired during this call") and 158-161 ("two Bash invokes are SEPARATE PROCESSES with FRESH Bun runtimes; lock-free → lock-held boundary is the **process boundary**"). |
| **AR9** (single JSON line consumer + dispatch + token capture) | PASS | Lines 52-74 document the discriminated union exactly matching `src/schemas/dispatch-protocol.ts:37-54`. Variant 1 (`dispatch` with `runId` + `agent` + `exitCode: 0`), Variant 2 (`report` with `message` + `exitCode >= 0`), Variant 3 (`halt` with `message` + `exitCode >= 1`). Empirical smoke: `bun run src/commands/next/run.ts -- --dry-run 2>/dev/null \| wc -l` returns exactly **1**. Token capture documented at lines 116-140 per architecture line 1677. |
| **AR16** (multi-persona handling — v0.1 single) | PASS | Inherits Story 2.4's "FIRST persona from `resolvePersona`" contract; documented in story Dev Notes line 532 ("v0.1 limitations + forward-deferred surfaces"). Body issues a single `Task` dispatch per `/bmad-next` invocation. Multi-persona is correctly deferred to Stories 4.1 + 5.*. |
| **AR21** (errors are AR21-conformant) | PASS | Lines 372-377: "Append a stack trace (errors are AR21-conformant; Layer 2's try/catch translates throw → halt with no stack on the main thread)" — i.e., the markdown explicitly tells Claude to NOT append stack traces. |
| **AR22** (single-line actionable hints) | PASS | Lines 222-226: "The `message` field is already AR22-conformant (single-line 'Run/See/Try/Check'-prefixed actionable hint per `src/errors.ts` registry). Layer 1 prints the hint VERBATIM and exits with the JSON line's `exitCode`." |
| **AR41** (markdown — naturally compliant) | PASS | AR41 governs `src/` TypeScript modules; markdown files under `commands/` and `agents/` are exempt. The body's INVOCATIONS are tier-bound (Layer 1 → Layer 2 via Bash; Layer 1 → Layer 3 via Task) — no boundary violation. |
| **FR1** (compute next step zero-config) | PASS | First usage example: `/bmad-next` (line 14). Body invokes `run.ts -- $ARGUMENTS` which auto-resolves the next step. |
| **FR16** (sub-agent dispatch with budget+timeout) | PASS | Line 84 invokes `Task(agent=<jsonLine.agent>, prompt="staging/<jsonLine.runId>/dispatch-spec.json")` — Claude Code's runtime owns budget+timeout via `taskSpec.constraints` per the dispatch spec. |
| **FR17** (verifier on every sub-agent output) | PASS | Step 5 (line 145) invokes `verify-and-advance.ts` which `runVerifier`s before promote. The body explains this at lines 151-156. |
| **FR18** (one human-readable line per step) | PASS | Step 6 (lines 172-194) prints the `verify-and-advance` AR9 line's `message` field VERBATIM in the success-format `"✓ <step> → <canonical-path> (tokens: in=<n> out=<n>, <ms>ms)"`. |
| **FR32** (actionable error report on halt) | PASS | Lines 222-244 document the halt-path discipline; print the AR9 `message` (the actionable hint) verbatim, exit with the AR9 `exitCode`. |
| **FR46** (single-line + full-detail errors) | PASS | Lines 246-248: "The transcript pair is STILL written on every halt path (Story 2.6 finally block). Users can run `/bmad-next --watch` (Story 3.9) or inspect `_bmad-output/.stepper/runs/<ts>-<step>.{log,json}` directly for forensic detail per FR43 + FR44." Single-line surface + full-detail transcript pair. |
| **FR53** (exit codes 0-5) | PASS | Both Bash invokes have explicit exit-code mappings: lines 44-50 (run.ts: 0, 2, 3, 5) and 163-170 (verify-and-advance.ts: 0, 1, 2, 4, 5). |
| **FR54** (stdout/stderr discipline) | PASS | Line 41-42: "Per FR54, all progress / warning / error logging routes to stderr; only the AR9 JSON line goes to stdout." Reaffirmed at lines 250-254. Empirically verified by the line-count smoke test (exactly 1 line on stdout). |
| **NFR-S2** (writes only inside scope) | PASS | Tool restrictions section line 206-208: "No file edits outside `staging/<run-id>/` and `_bmad-output/.stepper/`." `Write` and `Edit` are NOT in `allowedTools` per frontmatter. |
| **NFR-S4** (sub-agent isolation enforces declared scope) | PASS | The Task dispatch is to `bmad-step-runner` whose frontmatter restricts to `Read, Write, Edit, Grep, Bash` (Story 2.3 already shipped); architectural enforcement lives at Layer 2's `assertWithinScope`. Body documents this at lines 210-213. |
| **NFR-R1** (zero data loss on halt) | PASS | Body documents the transcript-on-halt at lines 246-248 (Story 2.6 finally block). State updates only happen via `verify-and-advance.ts`'s atomic write path. |
| **NFR-R4** (clean halt on stale lock) | PASS | Inherited from Story 2.6's `acquire()` lock contention → exit 4 path. Body's halt branch (lines 92-95) prints the actionable hint and exits with the non-zero code. |

### Quality Gates (re-run)

| Gate | Result |
|------|--------|
| `bun run check` | **PASS** — `523 pass / 0 fail / 1840 expect() calls / Ran 523 tests across 45 files. [1492ms]` (Story 2.6 baseline carries through unchanged — markdown-only deliverable produces zero TS deltas). |
| `bunx tsc --noEmit` | **PASS** — `exit=0`. |
| `commands/bmad-next.md` frontmatter preserved | **PASS** — `description: "Compute and execute the next BMAD step (zero-config orchestrator)."` (placeholder suffix dropped); `argumentHint: "[--doctor \| --upgrade \| --resume \| --dry-run \| ...]"` (invariant); `allowedTools: ["Bash", "Task", "Read"]` (invariant). |
| Body covers 6 required sections | **PASS** — usage examples (lines 11-22), 6-step behavior (29-194), tool restrictions (197-218), error handling (221-254), architectural footnote (256-270). |
| AR9 single-line stdout (manual smoke) | **PASS** — `bun run src/commands/next/run.ts -- --dry-run 2>/dev/null \| wc -l` = `1`. FR54 + AR9 confirmed empirically. |
| File length within target | **PASS** — `wc -l` = 270 lines (target: 150-300). |

### Findings

**Total: 0 findings.**

- **High:** 0
- **Medium:** 0
- **Low:** 0
- **Info:** 0

Story 2.7 is exemplary in its scope discipline: the deliverable is markdown-only, the mutation scope is honored to the letter (only `commands/bmad-next.md` body is touched; frontmatter line 1-5 preserved with one minor edit), and the triple-binding integrity is preserved by reading `<jsonLine.agent>` at runtime rather than hardcoding the literal. The body covers every AC clause, every AR, every FR/NFR with specific architectural references. The defence-in-depth posture is correct: the body documents the AR9 union shape inline (so Claude knows the contract without an extra `Read`), but trusts `emitDispatchAction`'s Zod parse on the writer side as the canonical enforcement.

The only forward-deferred surfaces (`--watch`, `--upgrade`, `--force-unlock`, multi-persona) are correctly identified in the body's footnote and Dev Notes — Story 2.7 passes them through to `run.ts` via `$ARGUMENTS` and inherits the "halt with hint pointing at the owning story" pattern Story 2.4 already shipped.

### Carry-overs to future stories

- **Story 2.8 (canonical end-to-end smoke test)** — the natural next deliverable. Story 2.7 ships only the markdown body; Story 2.8 must spawn the full pipeline (slash command → Bash → Task → Bash → summary) against `tests/fixtures/minimal-bmad-project/` and assert state.yaml advance + canonical-artifact promotion + transcript-pair existence + no out-of-scope writes. The Story 2.8 test is the FIRST automated end-to-end coverage of the Layer 1 orchestrator Story 2.7 ships.
- **Story 4.1 (`/bmad-loop` skeleton)** — composes `/bmad-next` per loop iteration. The composition pattern (Bash + Task + Bash) Story 2.7 establishes is the canonical Layer 1 orchestrator template; `/bmad-loop` extends with iteration + stop-condition logic.
- **Stories 5.1-5.4 (failure-UX modes)** — when the Layer 2 failure-UX engine ships, the AR9 line shape MAY be extended (e.g., `action: "halt"` with structured retry-hint). Story 2.7's body branches on `action` ∈ {"dispatch", "report", "halt"} — adding new action variants would require a body update; v0.1 ships only the three.
- **Story 6.10 (v0.1.0 marketplace release)** — bundles `commands/bmad-next.md` (Story 2.7's deliverable) into the marketplace package. The markdown is the user-visible documentation surface for the slash command — Story 6.10 ratifies the v0.1 publication shape.

### Final Verdict

**APPROVE.** Status flipped `review` → `done`. Sprint-status YAML synchronized.

- **2026-05-01 (created)**: Story file created (status `ready-for-dev`) — bmad-create-story persona, model `claude-opus-4-7[1m]`, run `2026-05-01T083100Z-bmad-next`. SEVENTH epic-2 story (after Story 2.1 verifiers — DONE, Story 2.2 dispatch-spec generator — DONE, Story 2.3 generic sub-agent — DONE, Story 2.4 lock-free `run.ts` — DONE, Story 2.5 transcript writers — DONE, Story 2.6 lock-acquiring `verify-and-advance.ts` — DONE). FIRST AND ONLY Layer 1 deliverable of Epic 2 — the canonical `/bmad-next` slash command body that orchestrates Bash → AR9 JSON line → Task → Bash → summary. Drafted from epics.md §Story 2.7 lines 684-701 (AC verbatim), architecture.md §A.D1 (three-layer model), §A.D2 (sub-agent dispatch via Task tool), §P5 (dispatch contract), §P6 (slash-command markdown patterns — frontmatter + body + tool restrictions), §directory-listing line 1065 (`commands/bmad-next.md` placement), §line 1263 (Layer 1 = main thread surface), §lines 1443-1485 (Layer 1↔2↔3 sequence), §line 1460 (AR9 stdout JSON-line emit), §line 1465 (Task invocation surface), §line 1660 (AR9 protocol concretization — exit-code constraints), §line 1677 (Critical Gap Resolution 6 — token counts threaded via positional flags), prd.md FR1+FR16+FR17+FR18+FR32+FR46+FR53+FR54 + NFR-S2/S4/R1/R4, Story 2.6 PRIMARY INVOKER carry-over (lines 1338-1344), Story 2.4 PRIMARY INVOKER carry-over (line 685), Story 2.3 PRIMARY INVOKER carry-over (lines 71, 84), Story 2.2 `emitDispatchAction` agent literal (`src/dispatch/emit.ts:48`), Story 1.12 slash-command markdown precedent (`commands/bmad-doctor.md`), Story 1.1 placeholder body (`commands/bmad-next.md` 11 lines). Mirrors Stories 2.6 / 2.5 / 2.4 / 2.3 / 2.2 / 2.1 / 1.12 / 1.1 template structure. Files planned: 1 modified file (`commands/bmad-next.md` body REPLACED — 11-line placeholder → ~150-300-line canonical Layer 1 orchestrator). Hard constraints: ZERO `src/` mutations; ZERO new error class registration (registry stays at 16 codes); ZERO new external runtime deps; ZERO new TypeScript files; ZERO new agent definitions; ZERO `.claude-plugin/plugin.json` changes. Body design: 6 top-level sections (role declaration + Usage examples + Behavior 6-step sequence + Tool restrictions + Error handling + Footnote). AR9 line consumption: read `agent` field from JSON line (NOT hardcoded literal — defence-in-depth for future agent renames per triple-binding integrity). Token-count capture: from Task tool's response object (`tokens_in` + `tokens_out`); forwarded as `--tokens-in <n> --tokens-out <n>` positional flags per architecture line 1677. Tool restrictions: Bash limited to `bun run <plugin-root>/...`; Task limited to plugin-declared agents; no file edits outside `staging/<run-id>/` and `_bmad-output/.stepper/`. Estimated effort: M (medium — markdown-only deliverable; no source-tree mutations; no test files; no schema deltas; 13 task groups; manual smoke validation only — Story 2.8 ships canonical end-to-end). Test count delta target: 0 (markdown-only; baseline 523 → 523). FR/NFR/AR coverage: FR1+FR16+FR17+FR18+FR32+FR46+FR53+FR54 / NFR-S2+S4+R1+R4 / AR7+AR8+AR9+AR16+AR21+AR22+AR41.
