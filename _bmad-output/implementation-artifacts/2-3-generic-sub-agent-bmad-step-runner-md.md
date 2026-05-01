---
status: done
story_id: '2.3'
story_key: 2-3-generic-sub-agent-bmad-step-runner-md
epic: '2'
title: Generic Sub-Agent (`bmad-step-runner.md`)
created: '2026-05-01'
last_updated: '2026-05-01'
priority: M
estimated_effort: S
fr_coverage:
  - FR16
  - FR17
nfr_coverage:
  - NFR-S4
  - NFR-S6
  - NFR-S2
ar_coverage:
  - AR7
  - AR16
  - AR41
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/implementation-artifacts/epic-1-retrospective.md
  - _bmad-output/implementation-artifacts/2-1-verifier-configuration-registry.md
  - _bmad-output/implementation-artifacts/2-2-dispatch-spec-generator.md
  - _bmad-output/implementation-artifacts/1-12-bmad-next-doctor-command.md
  - _bmad-output/implementation-artifacts/1-13-quick-start-documentation.md
  - .claude-plugin/plugin.json
  - commands/bmad-next.md
  - commands/bmad-doctor.md
  - src/schemas/dispatch-spec.ts
  - src/dispatch/generate-spec.ts
---

# Story 2.3: Generic Sub-Agent (`bmad-step-runner.md`)

Status: done

> Note: Validation is optional. Run validate-create-story for quality check before dev-story.

## Story

As a Stepper sub-agent,
I want a single generic step-runner agent definition under `agents/bmad-step-runner.md` that reads its dispatch spec from a staging path, executes the task, and writes outputs,
So that Layer 1 has one canonical Task target and no specialized agents are needed at v0.1.

## Context Summary

This is the **third story of Epic 2 (Single-Step Advance with Sub-Agent Dispatch)** and lands the **first Layer-3 deliverable of the project** — the canonical sub-agent definition under `agents/bmad-step-runner.md`. Until now Epic 1 shipped the foundational primitives, the lock + state + schemas + migrations subsystem, snapshot + BMAD detection, the DAG builder, the persona resolver, and the `/bmad-next --doctor` integration command (all Layer 2 — Bun TypeScript core). Story 2.1 then shipped the `src/verifiers/` higher-tier module (the post-dispatch artifact validator) and Story 2.2 shipped the `src/dispatch/` higher-tier module (the pre-dispatch spec generator + AR9 stdout-line emitter + orphan-staging cleanup). With both halves of the dispatch-then-verify loop now in place at Layer 2, Story 2.3 finally introduces the **Layer 3 worker** that consumes Story 2.2's `dispatch-spec.json` and produces the artifact that Story 2.1's `runVerifier` then validates.

This story is **distinct from every prior story** in the project: it ships a **Claude Code sub-agent definition file** (a markdown file under `agents/`), NOT TypeScript code under `src/`. The deliverable is a **prompt-engineered specification** that instructs a Claude sub-agent how to read its dispatch spec, follow the 6-section AR7 contract, write its artifact into the staging directory, and return — all without making decisions of its own. Per architecture §A.D2 lines 297-336 + §line 332, this is the **single canonical Task target** for v0.1 — Layer 1's slash-command markdown (Story 2.7) invokes `Task` against this agent's name (`bmad-step-runner`) and passes the dispatch-spec path as the prompt. Specialized per-step agents may be added later if telemetry shows quality benefits, but v0.1 ships this **one generic agent**.

Concretely, this story produces:

1. **`agents/bmad-step-runner.md`** — the canonical Claude Code sub-agent definition. Frontmatter declares `name: bmad-step-runner` (the value Layer 1 invokes via `Task`), a `description` matching architecture §line 332's prescribed string ("execute a BMAD method step from a dispatch spec at `staging/<run-id>/dispatch-spec.json`"), and `allowed-tools: Read, Write, Edit, Grep, Bash` per AC-3. The body is a structured prompt that:
   - Reads the dispatch-spec path from the **prompt argument** (the path passed by Layer 1's `Task` invocation per architecture §line 1465).
   - Uses `Read` to load `staging/<runId>/dispatch-spec.json`; parses the JSON; extracts the 6 sections (PERSONA, CONTEXT, TASK, OUTPUT FORMAT, SUCCESS CRITERIA, CONSTRAINTS) per AR7.
   - Uses `Read`/`Grep` to load the `taskSpec.context[]` files from `staging/<runId>/inputs/` and the prior-step canonical artifact paths declared in the spec.
   - Adopts the persona declared in `taskSpec.persona` for the duration of the task.
   - Performs the work described in `taskSpec.task` to produce **exactly one artifact** at the path declared in `taskSpec.outputFormat.fileLocation` (which always resolves under `staging/<runId>/outputs/` per §P5).
   - Uses `Write`/`Edit` to land the artifact, optionally `Bash` for non-network read-only commands (e.g., `mkdir -p`, `cp` from inputs/ to outputs/) per the dispatch spec's `taskSpec.constraints.allowedTools`.
   - Emits a single concise summary line on completion (e.g., "wrote `<path>` (N bytes)") then returns control to Layer 1.
   - Does **NOT** invoke `Task` itself, does **NOT** call Stepper's `bun run` directly, does **NOT** write outside `staging/<runId>/`, does **NOT** decide the next step, does **NOT** validate its own output.
2. **A smoke fixture** (under `tests/fixtures/bmad-step-runner/` per architecture §lines 1091-1097): a minimal `dispatch-spec.json` + a fake `staging/<runId>/inputs/` tree the dev iteration can use to manually verify the agent definition produces an artifact at the declared output path. This fixture is **dev-iteration scaffolding**, NOT an automated CI gate (Layer 3 cannot be exercised by `bun test` — the smoke test requires a live Claude `Task` invocation, which is Story 2.8's deliverable).

This story is the **first Layer-3 deliverable** of the project (per architecture §line 1265 + lines 1556-1557: "Sub-agent definitions: `agents/*.md` (root level — required by Claude Code plugin spec)"). It does **NOT**:

- Implement the **slash command** that invokes the agent. That is **Story 2.7** (`commands/bmad-next.md` orchestrates `Bash → Task → Bash`). Story 2.3 ships ONLY the sub-agent definition; the `Task` invocation site lives in 2.7.
- Implement the **lock-free `run.ts`** that produces the `dispatch-spec.json` the agent reads. That is **Story 2.4** (`src/commands/next/run.ts`). Story 2.3 consumes the contract that Story 2.2 already shipped (the on-disk `dispatch-spec.json` schema is `src/schemas/dispatch-spec.ts` — Story 1.5; the file-write site is `src/dispatch/generate-spec.ts` — Story 2.2).
- Implement the **verifier-then-promote** post-dispatch flow. That is **Story 2.6** (`verify-and-advance.ts`). Story 2.3's contract is exactly the **producer half** of the dispatch-then-verify loop; the validator half (Story 2.1's `runVerifier`) and the promoter half (Story 2.6's `promote.ts`) consume the artifact this agent writes.
- Modify any TypeScript source files. Per the hard-constraint discipline, Story 2.3's mutation scope is the new `agents/bmad-step-runner.md` only (plus the optional smoke fixture). Zero `src/` deltas; zero `commands/` deltas; zero `_bmad-output/.stepper/` deltas.
- Add **specialized per-step sub-agents** (e.g., `agents/bmad-prd-runner.md`, `agents/bmad-architecture-runner.md`). Per architecture §line 332, "Specialized agents may be added per step type if telemetry shows quality benefits." v0.1 ships the **single generic agent** only.
- Add a **fixer sub-agent** (`agents/bmad-step-fixer.md`). That is **Epic 5 Story 5.3** (`route-to-fixer` failure-UX mode). Story 2.3 ships the worker; Story 5.3 ships the remediator.
- Add **multi-persona dispatch logic**. Per AR16 + Story 2.2's runner-tier deferral, multi-persona steps dispatch sub-agents **sequentially** (one `Task` invocation per persona). Each invocation still targets the same `bmad-step-runner` agent — Layer 1 (Story 2.7) handles the loop. Story 2.3's sub-agent receives one `dispatch-spec.json` per invocation; it does NOT iterate over personas itself.

It DOES land:

- The exact AR7 6-section contract enforcement at the **prompt layer** — the agent body explicitly walks through PERSONA, CONTEXT, TASK, OUTPUT FORMAT, SUCCESS CRITERIA, CONSTRAINTS in order, citing the section name as it processes each.
- The exact AR41 + §line 1265 + NFR-S4 boundary discipline — the agent body declares "I will write only inside `staging/<runId>/`. I will not invoke `Task`. I will not decide what comes next. I will not validate my own output." This is the **prompt-layer enforcement** of the architecture's Layer-3 boundary; the architectural enforcement (verifier scope check, atomic-write scope check) lives at Layer 2 in Stories 2.1 + 2.2.
- The architecture §line 332 prescribed `description` field — verbatim string ("execute a BMAD method step from a dispatch spec at `staging/<run-id>/dispatch-spec.json`") so Layer 1's `Task` tool resolves this agent reliably.
- The AR9 `agent` field linkage — Story 2.2's `emitDispatchAction({ action: "dispatch", runId, agent: "bmad-step-runner", exitCode: 0 })` writes `agent: "bmad-step-runner"`; Story 2.3's frontmatter `name: bmad-step-runner` matches verbatim. Story 2.7 reads the JSON line, extracts `agent`, invokes `Task` against that name. The triple-binding (AR9 line emit ↔ frontmatter name ↔ Task invocation argument) is exercised end-to-end in Story 2.8 smoke.
- The §P5 sub-agent dispatch contract — file-in (`staging/<runId>/inputs/`), file-out (`staging/<runId>/outputs/`); declared budget + timeout (consumed by Layer 1 — the agent does not enforce its own budget); 6-section task spec (read from `dispatch-spec.json`); transcript captured by Layer 2 in Story 2.5 (`src/transcript/`).

## Acceptance Criteria

The acceptance criteria below are reproduced **verbatim** from `_bmad-output/planning-artifacts/epics.md` §Story 2.3 (lines 612-625, BDD Given/When/Then format). Lines and AC labelling preserved.

**Given** `agents/bmad-step-runner.md` with description matching "execute a BMAD method step from a dispatch spec at staging/<run-id>/dispatch-spec.json"
**When** Layer 1 invokes Task with this agent
**Then** the sub-agent reads the dispatch spec, follows the 6-section contract (PERSONA, CONTEXT, TASK, OUTPUT FORMAT, SUCCESS CRITERIA, CONSTRAINTS), reads inputs from `staging/<run-id>/inputs/`, writes outputs to `staging/<run-id>/outputs/`, and returns
**And** the sub-agent never invokes Task itself, never calls Stepper's `bun run` directly, never writes outside its own `staging/<run-id>/`
**And** the agent file declares `allowed-tools: Read, Write, Edit, Grep, Bash`
**And** smoke test verifies a fixture dispatch produces an artifact at the declared output path

## Tasks / Subtasks

- [x] **Task 0 — Verify pre-conditions (AC: all)**
  - [x] 0.1 Confirm Story 2.2 (`src/dispatch/`) is `done` per `_bmad-output/implementation-artifacts/sprint-status.yaml` (`2-2-dispatch-spec-generator: done`). Confirm `agents/` directory does NOT yet exist (this story creates it). Confirm `agents/bmad-step-runner.md` does NOT yet exist.
  - [x] 0.2 Confirm `src/dispatch/generate-spec.ts` exports `buildDispatchSpec` and writes a Zod-validated `dispatch-spec.json` at `staging/<runId>/dispatch-spec.json` per Story 2.2 final shape (verified by `src/dispatch/generate-spec.test.ts`). The agent body must reference this exact contract.
  - [x] 0.3 Confirm `src/schemas/dispatch-spec.ts` declares `DispatchSpecV1Schema` with the 6-section `taskSpec: { persona, context[], task, outputFormat, successCriteria[], constraints }` shape per Story 1.5. The agent body must use field names verbatim (`taskSpec.persona`, `taskSpec.context`, `taskSpec.task`, `taskSpec.outputFormat`, `taskSpec.successCriteria`, `taskSpec.constraints`).
  - [x] 0.4 Confirm `src/dispatch/emit.ts` writes `{ action: "dispatch", runId, agent: "bmad-step-runner", exitCode: 0 }` per Story 2.2 line 80 + AR9 `dispatch` variant. The agent's frontmatter `name:` value MUST be `bmad-step-runner` verbatim so Story 2.7's `Task` invocation resolves cleanly.
  - [x] 0.5 Read epics.md Story 2.3 §lines 612-625 verbatim. Confirm the AC text in §Acceptance Criteria above is character-identical (re-verify on first dev pass).
  - [x] 0.6 Read architecture.md §A.D2 lines 297-336 (sub-agent dispatch via Task tool); §line 332 (the prescribed `description` string for `bmad-step-runner`); §line 1068-1070 (directory listing — `agents/bmad-step-runner.md` confirmed); §line 1265 (Layer 3 boundary discipline); §line 1465 (Task invocation surface); §line 1556 (Sub-agent definitions: `agents/*.md` root-level required by plugin spec); §P5 lines 864-917 (dispatch-spec.json shape + verifier output + promotion contract).
  - [x] 0.7 Read prd.md FR16 line 689 (sub-agent dispatch with budget+timeout); FR17 line 690 (verifier before promote — the agent's output is staged for the verifier); §Sub-Agent Dispatch Contract lines 530-552 (the 6-section + operational discipline source).
  - [x] 0.8 Read Story 2.2's File List + Senior Developer Review §Carry-overs to Future Stories (`_bmad-output/implementation-artifacts/2-2-dispatch-spec-generator.md` lines 962-966) — confirm Story 2.3 is correctly identified as the PRIMARY READER of the dispatch-spec.

- [x] **Task 1 — Create `agents/` directory + verify plugin manifest compatibility (AC-1)**
  - [x] 1.1 Create the `agents/` directory at the project root (`/Users/tgorka/tg/bmad-stepper-cc/agents/`). Per architecture §line 1556: "Sub-agent definitions: `agents/*.md` (root level — required by Claude Code plugin spec)." The directory MUST be at the **plugin root**, NOT nested under `commands/` or `src/`.
  - [x] 1.2 Confirm `.claude-plugin/plugin.json` does NOT need updating — the plugin manifest auto-discovers agents from the `agents/` directory per Claude Code plugin runtime convention. (Verify by reading the manifest; the existing `name`, `version`, `description`, `author`, `homepage`, `repository`, `license`, `keywords` fields are sufficient.)
  - [x] 1.3 No test file is needed for the directory creation; the agent file itself is the deliverable.

- [x] **Task 2 — Create `agents/bmad-step-runner.md` — frontmatter (AC-1, AC-3)**
  - [x] 2.1 Create `agents/bmad-step-runner.md` with the YAML frontmatter:
    ```yaml
    ---
    name: bmad-step-runner
    description: execute a BMAD method step from a dispatch spec at staging/<run-id>/dispatch-spec.json
    allowed-tools: Read, Write, Edit, Grep, Bash
    ---
    ```
  - [x] 2.2 The `name:` field MUST be `bmad-step-runner` verbatim — this is the value Layer 1's `Task` tool resolves and the value Story 2.2's `emitDispatchAction` writes to the JSON-line `agent` field. AR9 protocol + AC linkage.
  - [x] 2.3 The `description:` field MUST match architecture §line 332 verbatim: `execute a BMAD method step from a dispatch spec at staging/<run-id>/dispatch-spec.json`. AC-1 enforcement.
  - [x] 2.4 The `allowed-tools:` field MUST list exactly five tools, comma-separated: `Read, Write, Edit, Grep, Bash` per AC-3. NFR-S4 enforcement at the agent declaration layer (Claude Code's runtime restricts the sub-agent to these tools only).
  - [x] 2.5 Do NOT add any other frontmatter fields (e.g., `model:`, `budget:`, `timeout:`) — those live in the `dispatch-spec.json` (per architecture §P5 + Story 2.2 contract); the agent definition is shape-pure.

- [x] **Task 3 — Author the agent body — boot section (AC-1, AC-2)**
  - [x] 3.1 The agent body opens with a one-line role declaration: "You are a BMAD step-runner sub-agent. You execute exactly one BMAD method step per invocation, in isolation, file-in / file-out only."
  - [x] 3.2 The body then states the **invocation contract**: "Layer 1 invokes you via the `Task` tool. The prompt you receive contains the path to a dispatch spec at `staging/<run-id>/dispatch-spec.json`. Read that file FIRST."
  - [x] 3.3 The body then states the **6-section AR7 contract** verbatim:
    ```
    The dispatch spec contains a `taskSpec` object with six sections that you MUST follow in order:
    1. PERSONA          — `taskSpec.persona`         (which BMAD persona owns this work; adopt for the duration)
    2. CONTEXT          — `taskSpec.context[]`       (input files; load via Read/Grep)
    3. TASK             — `taskSpec.task`            (single clear deliverable; one artifact)
    4. OUTPUT FORMAT    — `taskSpec.outputFormat`    (schema, required sections, file location in staging dir)
    5. SUCCESS CRITERIA — `taskSpec.successCriteria` (verifier-checkable conditions)
    6. CONSTRAINTS      — `taskSpec.constraints`     (allowed tools, scope limits, what NOT to do)
    ```
  - [x] 3.4 The body then states the **scope limit** verbatim per AC-2 + NFR-S4: "Write ONLY inside `staging/<run-id>/outputs/`. Do NOT write outside this directory. Do NOT modify state.yaml. Do NOT modify the canonical artifact paths (the verifier-then-promote step at Layer 2 owns those)."
  - [x] 3.5 The body declares the **forbidden actions** verbatim per AC-2: "Do NOT invoke the `Task` tool yourself. Do NOT call Stepper's `bun run` commands (other than read-only `bun run --doctor` if you genuinely need to inspect state — but in v0.1 you have no use case for this). Do NOT decide what comes next. Do NOT validate your own output (Layer 2's `runVerifier` does that)."

- [x] **Task 4 — Author the agent body — execution sequence (AC-1, AC-2)**
  - [x] 4.1 The body provides a step-by-step execution sequence the agent follows on every invocation:
    ```
    1. Read the dispatch-spec path from the prompt argument.
    2. Read the dispatch spec: `Read(<dispatch-spec-path>)` → JSON.parse → extract `runId`, `step`, `epic`, `story`, `taskSpec`.
    3. Adopt the persona declared in `taskSpec.persona`. State the persona out loud in your reasoning.
    4. For each entry in `taskSpec.context`: load the referenced file via `Read` (or `Grep` for partial sections). Build a working memory of the inputs.
    5. Read the output target from `taskSpec.outputFormat.fileLocation` (always under `staging/<runId>/outputs/`).
    6. Perform the work declared in `taskSpec.task` to produce ONE artifact. Honor `taskSpec.outputFormat.requiredSections` and `taskSpec.outputFormat.schemaRef`.
    7. Cross-check your draft against `taskSpec.successCriteria[]` informally (you are NOT the verifier; you are doing pre-flight quality control).
    8. Write the artifact via `Write(<output-path>, <content>)` (or `Edit` if appending to an existing file declared in inputs).
    9. Emit a single concise summary line: "wrote `<path>` (N bytes)" — then return control to Layer 1.
    ```
  - [x] 4.2 The body adds **per-tool guidance**:
    - `Read` — for loading the dispatch spec, context files, and (if needed) prior canonical artifacts referenced via `taskSpec.context[].path`.
    - `Grep` — for partial-section extraction from large reference files (e.g., loading only "§4.2" of a 50k-line PRD per `taskSpec.context[].section`).
    - `Write` — for the primary artifact write at `taskSpec.outputFormat.fileLocation`. Atomic-via-Claude-Code (Layer 2's `atomicWrite` is a Bun-side concern; Layer 3 uses Claude Code's `Write` tool which is acceptable here because the artifact lives in the staging dir, NOT canonical state).
    - `Edit` — for surgical edits to an existing artifact (e.g., the `dev-story` step appends sections to a previously-created story file under inputs). Never use `Edit` on files outside `staging/<runId>/`.
    - `Bash` — for filesystem-only commands within the staging dir (e.g., `mkdir -p staging/<runId>/outputs/sub/`, `cp staging/<runId>/inputs/foo.md staging/<runId>/outputs/`). NEVER for network commands, NEVER for `bun run`, NEVER for `git`, NEVER for any tool that writes outside the staging dir.

- [x] **Task 5 — Author the agent body — error handling + return (AC-1, AC-2)**
  - [x] 5.1 The body covers the **failure modes** the agent surfaces (not the failure-UX engine — that's Layer 2 in Epic 5):
    - Dispatch spec missing or malformed JSON → emit "ERROR: dispatch spec at <path> is missing or unparseable" then return; Layer 2's `runVerifier` will subsequently fail the `required-files` check.
    - Required input file missing → emit "ERROR: required input <path> is missing per dispatch-spec.context" then return; Layer 2's verifier will fail.
    - Output write failed → emit "ERROR: write to <path> failed (<reason>)" then return; Layer 2's verifier will fail with `required-files` check.
  - [x] 5.2 The body explicitly forbids the agent from **retry logic** — "If a write fails, surface the error and return. Do NOT retry. The failure-UX engine (Layer 2 — Epic 5 Stories 5.1-5.4) decides retry / skip / route-to-fixer / escalate based on the verifier output."
  - [x] 5.3 The body explicitly forbids the agent from **user dialogue** — "If the dispatch spec is ambiguous or the inputs are confusing, do NOT ask the user. Do NOT print clarifying questions. Make the most reasonable interpretation, write the artifact, surface concerns in the artifact body itself (e.g., a note section), and return. The verifier and the human review loop will catch quality issues; you are file-in / file-out only."
  - [x] 5.4 The body's closing line: "Your job is done when the artifact exists at `taskSpec.outputFormat.fileLocation` and you have emitted exactly one summary line. Layer 1 will then run `verify-and-advance` to validate your output and (on pass) promote it to its canonical location."

- [x] **Task 6 — Author the agent body — examples + footnote (AC-1)**
  - [x] 6.1 Add a brief **example dispatch flow** (1 short snippet) so the sub-agent has a concrete template:
    ```
    Example invocation:
      Task(agent="bmad-step-runner", prompt="staging/2026-04-29T10-15-00-dev-story-abc12/dispatch-spec.json")

    Agent flow:
      1. Read("staging/2026-04-29T10-15-00-dev-story-abc12/dispatch-spec.json")
         → { runId: "...", step: "dev-story", taskSpec: { persona: "dev", task: "Implement story 3.2", ... } }
      2. Adopt persona "dev" for this task.
      3. For each `taskSpec.context[]` entry: Read the file (with optional Grep for `section`).
      4. Write the artifact at `staging/.../outputs/story-3-2.md`.
      5. Emit "wrote staging/.../outputs/story-3-2.md (4321 bytes)" and return.
    ```
  - [x] 6.2 Add a closing **footnote** crediting the architectural source: "This agent definition mirrors architecture §A.D2 (sub-agent dispatch via Task tool), §P5 (sub-agent dispatch contract), §line 332 (prescribed description), and PRD §Sub-Agent Dispatch Contract (the 6-section spec). For the verifier-then-promote post-dispatch flow, see Story 2.6 `verify-and-advance.ts`."

- [x] **Task 7 — Create the smoke fixture (AC-4 setup, manual)**
  - [x] 7.1 Per AC-4 ("smoke test verifies a fixture dispatch produces an artifact at the declared output path"), create a minimal fixture directory at `tests/fixtures/bmad-step-runner/`:
    - `tests/fixtures/bmad-step-runner/dispatch-spec.json` — a hand-authored dispatch spec for the simplest possible step (e.g., `analyst-research` with `requiredFrontmatterSections: ["title"]` per Story 2.1 defaults). Contains `taskSpec.task: "Write a one-paragraph research brief about <topic> with frontmatter title: <topic>."`, `taskSpec.outputFormat.fileLocation: "staging/test-run/outputs/research.md"`, `taskSpec.constraints.allowedTools: ["Read", "Write"]`, `taskSpec.constraints.scopeLimits: "Only files inside staging/test-run/ may be written."`.
    - `tests/fixtures/bmad-step-runner/inputs/topic.md` — a one-line topic input file.
    - `tests/fixtures/bmad-step-runner/README.md` — describes the smoke test invocation: copy the fixture into a tmpdir, invoke `Task(agent="bmad-step-runner", prompt="<tmpdir>/dispatch-spec.json")` interactively in Claude Code, verify `<tmpdir>/staging/test-run/outputs/research.md` exists with `title:` frontmatter.
  - [x] 7.2 The smoke test is **manual / dev-iteration scaffolding** — Layer 3 cannot be exercised by `bun test` (no Claude API access in unit tests). Story 2.8 ships the **full happy-path smoke test** (`/bmad-next` end-to-end) which exercises this agent live; Story 2.3's fixture is a developer's pre-2.8 sanity check.
  - [x] 7.3 Document in the agent file body's footnote that the fixture lives at `tests/fixtures/bmad-step-runner/` so the next dev / reviewer can find it.

- [x] **Task 8 — Quality gates (AC: all)**
  - [x] 8.1 Run `bun run check` — expect 0 fail (Story 2.2 baseline 409 pass). Story 2.3 ships **zero TS deltas**, so test count + expects count are unchanged. Confirm `bunx tsc --noEmit` exits 0.
  - [x] 8.2 Run `bun run lint` (Biome) — expect 0 errors, 0 warnings. (Biome does NOT lint markdown by default; the `agents/` directory is markdown-only and is not subject to Biome.)
  - [x] 8.3 Manually validate `agents/bmad-step-runner.md`:
    - Frontmatter has exactly three keys: `name`, `description`, `allowed-tools` (in that order, per common Claude Code convention).
    - `name: bmad-step-runner` (lowercase, hyphenated).
    - `description:` matches architecture §line 332 verbatim.
    - `allowed-tools: Read, Write, Edit, Grep, Bash` (5 tools, comma-separated, no extras).
    - Body explicitly states all four AC-2 forbidden actions ("never invokes Task itself", "never calls bun run directly", "never writes outside staging/<run-id>/", and the implicit "never decides next step / never validates own output").
    - Body explicitly walks through the 6-section AR7 contract in order.
    - Body cites architecture §A.D2 + §P5 + §line 332 + PRD §Sub-Agent Dispatch Contract.
  - [x] 8.4 Verify the agent definition is loadable by Claude Code: in a fresh Claude Code session with the plugin loaded, type `/agents` (or run `claude /plugin reload bmad-stepper`). Confirm `bmad-step-runner` appears in the agent list with the architectural description text. **Note**: this is a manual visual check, NOT an automated CI gate.
  - [x] 8.5 Verify the fixture under `tests/fixtures/bmad-step-runner/` is well-formed:
    - `dispatch-spec.json` parses as JSON and validates against `DispatchSpecV1Schema` (run a quick `bun -e "console.log(DispatchSpecV1Schema.parse(JSON.parse(await Bun.file('tests/fixtures/bmad-step-runner/dispatch-spec.json').text())))"` smoke).
    - `inputs/topic.md` exists and has at least one line of content.
    - `README.md` documents the manual smoke procedure.
  - [x] 8.6 Confirm `src/errors.ts` registry stays at 16 codes — Story 2.3 ships **zero TS deltas**, so the registry is untouched.
  - [x] 8.7 Confirm `_bmad-output/.stepper/state.yaml` is **NOT modified** (per hard-constraint) — Story 2.3 mutates only `agents/bmad-step-runner.md` (NEW), `tests/fixtures/bmad-step-runner/**` (NEW), the story file (status flip), the sprint-status YAML (status flip), and the task record YAML (audit log).

- [x] **Task 9 — Update story status + sprint status (AC: all)**
  - [x] 9.1 Update story file frontmatter: `status: ready-for-dev` → `status: review` (after dev completes the 8 tasks above; the bmad-create-story persona starts at `ready-for-dev`).
  - [x] 9.2 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: `2-3-generic-sub-agent-bmad-step-runner-md: ready-for-dev` → `in-progress` → eventually `review` → `done` per Stepper's status transitions. Story 2.3 dev-story will flip ready-for-dev → review on completion; bmad-code-review flips review → done.
  - [x] 9.3 Append a Change Log entry per the template at the bottom of this file.

## Dev Notes

### Architecture compliance

- **§A.D2 (lines 297-336) — Sub-agent dispatch via Task tool**: Story 2.3's `agents/bmad-step-runner.md` IS the **single canonical Task target** for v0.1 per architecture §line 332. Layer 1 (Story 2.7's `commands/bmad-next.md`) invokes `Task(agent="bmad-step-runner", prompt=<dispatch-spec-path>)` and the Claude Code runtime resolves the agent definition via `agents/bmad-step-runner.md`. This story binds the AR9 line emit (`agent: "bmad-step-runner"` from Story 2.2's `emit.ts`) to the actual sub-agent definition.
- **§P5 (lines 864-917) — Sub-Agent Dispatch Contract**: the canonical `dispatch-spec.json` shape lives in `src/schemas/dispatch-spec.ts` (Story 1.5) and is written by `src/dispatch/generate-spec.ts` (Story 2.2). Story 2.3's agent body is the **consumer** — it reads the spec from the prompt argument and follows the 6-section contract. The `taskSpec.outputFormat.fileLocation` field always resolves under `staging/<runId>/outputs/` per the §P5 example at lines 884-887.
- **§line 332 — prescribed description string**: architecture explicitly states the agent description must match "execute a BMAD method step from a dispatch spec at `staging/<run-id>/dispatch-spec.json`". Story 2.3's frontmatter declares this verbatim. AC-1 enforcement.
- **§lines 1068-1070 — directory listing**: the architecture-prescribed plugin directory tree lists `agents/bmad-step-runner.md` (Layer 3 generic step executor) and `agents/bmad-step-fixer.md` (Layer 3 route-to-fixer worker). Story 2.3 ships **only the runner**; the fixer is Epic 5 Story 5.3.
- **§line 1265 — Layer 3 boundary discipline**: "Layer 3 — BMAD sub-agents | `agents/*.md` (prompt body) | The filesystem (read inputs from `staging/<run-id>/inputs/`, write outputs to `staging/<run-id>/outputs/`) | Deciding what comes next; validating own output; user dialogue; writes outside their `staging/<run-id>/`." Story 2.3's body explicitly enforces all four forbidden actions at the prompt layer.
- **§line 1465 — Task invocation surface**: "Layer 1 reads stdout JSON / Task: `<agent= bmad-step-runner>`, prompt = read `staging/<run-id>/dispatch-spec.json`." Confirms the `Task` invocation argument is the path; Story 2.3's agent body reads this path FIRST.
- **§line 1556-1557 — Sub-agent definitions**: "Sub-agent definitions: `agents/*.md` (root level — required by Claude Code plugin spec)." Story 2.3 places `bmad-step-runner.md` at `agents/bmad-step-runner.md` (root-level under the plugin), NOT under `commands/agents/` or `src/agents/`. Plugin manifest (`.claude-plugin/plugin.json`) does NOT need updating — auto-discovery.
- **AR7 — 6-section task spec**: PERSONA, CONTEXT, TASK, OUTPUT FORMAT, SUCCESS CRITERIA, CONSTRAINTS. Story 2.3's body walks through these in order and cites the exact `taskSpec` field name for each section. The agent does not invent additional sections; it consumes the spec verbatim.
- **AR9 — JSON-line dispatch protocol**: Story 2.2's `emit.ts` writes `{ action: "dispatch", runId, agent: "bmad-step-runner", exitCode: 0 }`. Story 2.3 ratifies the `agent` field value by declaring `name: bmad-step-runner` in the frontmatter. Story 2.7's slash-command markdown will read the JSON line, extract `agent`, and invoke `Task` against that name.
- **AR16 — multi-persona steps dispatch sub-agents sequentially in v0.1**: per Story 2.2 dev notes line 504 + architecture §line 187, multi-persona steps loop at the **runner tier** (Story 2.4 `run.ts`) — each iteration produces a separate `dispatch-spec.json` with one persona; Layer 1 (Story 2.7) loops the `Task` invocation over each spec. Story 2.3's agent receives ONE persona per invocation; it does NOT iterate over personas itself.
- **AR41 — module boundary discipline (Layer-3 reading)**: per architecture §lines 1287-1289 (Bun-side AR41) + §line 1265 (Layer 3 reading), the sub-agent does not import from any module — it is a **prompt-layer entity**, not a code-layer entity. The closest analog of AR41 at Layer 3 is the **forbidden-actions list** (no Task, no bun run, no writes outside staging) — Story 2.3 enforces this at the prompt layer.

### Layer 3 — first deliverable design rationale

This is the **first Layer-3 file in the project**. Every prior story shipped Layer 1 (slash command markdown — Stories 1.12 + 1.13 docs) or Layer 2 (TypeScript under `src/` — Stories 1.1-1.11 + 2.1 + 2.2). Story 2.3 establishes the Layer 3 pattern that future per-step specialized sub-agents (architecture §line 332 — "Specialized agents may be added per step type if telemetry shows quality benefits") will follow.

Key design decisions:

- **Single generic agent, not per-step agents**: per architecture §line 332, v0.1 ships exactly one `bmad-step-runner` that handles all step types. Specialization is a post-v0.1 telemetry-driven decision. This keeps Story 2.3's deliverable scope to ONE file + ONE smoke fixture.
- **Prompt-layer enforcement of forbidden actions**: Layer 3's tool-restriction at the runtime layer (Claude Code's `allowed-tools` frontmatter) covers the technical surface (no `Task`, no `WebFetch`, no `WebSearch`), but the prompt body MUST also state the forbidden actions in plain English so the sub-agent's reasoning chain refuses to attempt them. Both layers (frontmatter + prompt body) are enforcement defense-in-depth.
- **Path passed via prompt, NOT via env or argument**: Layer 1 invokes `Task(agent, prompt)`; Claude Code does NOT pass shell environment variables or positional arguments to the sub-agent. The dispatch-spec path is the prompt itself — that is the only data channel from Layer 1 to Layer 3 per architecture §line 1465.
- **No model declaration in frontmatter**: the `dispatch-spec.json` already carries `model: "sonnet"` (Story 2.2 default + per-step override per FR53) — adding a frontmatter `model:` on the agent would create a precedence ambiguity (which wins, agent frontmatter or dispatch spec?). Story 2.3 keeps the agent definition shape-pure; the model selection lives in Layer 2 (Story 2.2's `buildDispatchSpec`) where it can be overridden per step + per project config.
- **Smoke fixture is dev-iteration scaffolding, not a CI gate**: Layer 3 requires a live Claude Task invocation to exercise. This cannot run inside `bun test` (no Claude API access). The fixture lets a developer manually verify the agent works in their local Claude Code session before Story 2.8 (the full happy-path smoke test) lands. AC-4 accepts this manual verification path because Layer 3 is non-deterministic and requires the live runtime.

### Logging discipline (NFR-S2 prompt-layer)

The agent body emits **exactly one summary line on completion** ("wrote `<path>` (N bytes)"). It does NOT emit `info()`-style progress lines (those are Layer 2's `src/io/log.ts` concern). It does NOT print to stderr or stdout deliberately — Claude Code captures the agent's reasoning + tool calls into the parent thread's transcript automatically; the summary line is the **terminal action**, not a logging stream.

NFR-S2 (sub-agent isolation) is enforced via the `allowed-tools: Read, Write, Edit, Grep, Bash` frontmatter — the sub-agent CANNOT invoke `Task`, `WebFetch`, `WebSearch`, MCP tools, or any other tool not in the allowed list. Claude Code's runtime enforces this at the tool-dispatch layer.

### Scope discipline (NFR-S4)

The agent body declares "Write ONLY inside `staging/<runId>/outputs/`. Do NOT write outside this directory." This is the **prompt-layer enforcement** of NFR-S4 (sub-agent isolation enforces declared scope). The architectural enforcement lives in Layer 2:
- Story 2.1's `runVerifier` validates the artifact AT the declared `staging/<runId>/outputs/` path (per architecture §line 1265).
- Story 2.2's `dispatch-spec.json.taskSpec.constraints.scopeLimits` field carries the literal string "Only files inside staging/<runId>/ may be written." (per Story 2.2 line 924 senior dev review).
- Story 2.6's `verify-and-advance.ts` will (per epics.md Story 2.6 AC) confirm no out-of-staging writes occurred.

The combination of (a) `allowed-tools` runtime restriction, (b) prompt-body explicit instruction, (c) dispatch-spec `scopeLimits` reminder, (d) Layer 2 verifier check is **four-layer defense-in-depth** for NFR-S4.

### NFR-S6 enforcement (no execution of sub-agent output)

Per NFR-S6: "Stepper does not execute generated code from sub-agents as part of dispatch." The agent's output is an **artifact file** (markdown, JSON, etc.) — Layer 2's `runVerifier` reads but never executes the body. Story 2.3's agent body explicitly states the artifact is "the deliverable", not "code to be run." If a future step type requires the agent to produce executable code (e.g., a script for `bmad-quick-dev`), that script lands as a `.sh` / `.ts` file inside the artifact; Layer 2's verifier validates its shape; the script is executed (if at all) by the user / CI pipeline AFTER the verifier promotes the artifact to its canonical location — never during dispatch.

### Forward-dep notes

- **Story 2.4 — Lock-free `run.ts`**: produces the `dispatch-spec.json` Story 2.3's agent reads. Story 2.4 runs at Layer 2 (Bun); Story 2.3 runs at Layer 3 (Claude sub-agent). Composition lives at Layer 1 (Story 2.7 `commands/bmad-next.md`). Story 2.4 also owns the `cleanStagingOrphans()` "at Stepper start" wiring per Story 2.2 carry-over.
- **Story 2.5 — Markdown transcript + JSON run-log writers**: captures the sub-agent's prompt + output excerpt + verifier result in a per-step transcript log (`runs/<ts>-<step>.log`). Story 2.3's agent does NOT write to these logs — Story 2.5's writers run at Layer 2 inside `verify-and-advance.ts` (Story 2.6) and capture the live Task tool's response.
- **Story 2.6 — `verify-and-advance.ts` with state-hash check**: the post-dispatch consumer of Story 2.3's artifact. Reads `staging/<runId>/outputs/<artifact>` via Story 2.1's `runVerifier`, then promotes (atomic copy) on pass. Story 2.6 also reads the `dispatch-spec.json` to extract the step name + state-hash snapshot per Story 2.2 carry-over.
- **Story 2.7 — Slash command markdown for `/bmad-next`**: the Layer 1 orchestrator that invokes the `Task` tool against `bmad-step-runner` (Story 2.3). Story 2.7's body explicitly references `agents/bmad-step-runner.md` as the Task target. Reads Story 2.2's stdout JSON line, extracts `agent` field, invokes `Task(agent, prompt=<dispatch-spec-path>)`.
- **Story 2.8 — Smoke test for `/bmad-next` happy path**: the full end-to-end smoke that exercises Story 2.3's agent live. Asserts (a) the dispatch spec is created, (b) the Task invocation resolves to `bmad-step-runner`, (c) the agent writes an artifact at the declared output path, (d) the verifier passes, (e) the artifact is promoted, (f) state.yaml advances. AC-4's "smoke test verifies a fixture dispatch produces an artifact" is **partially** satisfied by Story 2.3's manual fixture and **fully** satisfied by Story 2.8's automated end-to-end smoke.
- **Story 5.3 — `route-to-fixer` failure mode**: introduces `agents/bmad-step-fixer.md` as a SECOND sub-agent. Story 2.3's `bmad-step-runner` is the **happy-path worker**; Story 5.3's `bmad-step-fixer` is the **remediator** invoked when the verifier fails and the failure-UX engine selects the `route-to-fixer` mode. The fixer's prompt body will mirror Story 2.3's structure but read both the dispatch spec AND the verifier-result.json to construct a remediation context.
- **Story 6.x — Specialized per-step agents (telemetry-driven)**: per architecture §line 332, future stories may introduce `agents/bmad-prd-runner.md`, `agents/bmad-architecture-runner.md`, etc. if telemetry shows quality benefits. Story 2.3's `bmad-step-runner` remains the fallback for any step without a specialized agent. The `dispatch-spec.json.agent` field (currently always `"bmad-step-runner"`) becomes per-step configurable in that future world.

### Boundary clarification — Layer 3 vs Layer 2

Story 2.3 is the FIRST Layer 3 deliverable; every prior story is Layer 1 (markdown commands) or Layer 2 (TypeScript). Key distinctions:

| Aspect | Layer 1 (slash commands) | Layer 2 (TypeScript core) | Layer 3 (sub-agents — Story 2.3) |
|--------|--------------------------|---------------------------|----------------------------------|
| File location | `commands/*.md` | `src/**/*.ts` | `agents/*.md` |
| Author | Claude prompt | Bun runtime | Claude prompt (in sub-agent context) |
| Tools available | Bash + Task + Read | All Bun + Node stdlib | Frontmatter `allowed-tools` declaration |
| Communicates with | Layer 2 via Bash, Layer 3 via Task | Filesystem only | Filesystem only (read inputs/, write outputs/) |
| Forbidden | Direct file IO; bypassing verifier | Calling Task; sub-agent orchestration; user dialogue | Deciding next step; validating own output; user dialogue; writes outside staging |
| Test surface | Recorded-prompt fixtures + Story 2.8 smoke | `bun test` (no Claude required) | Manual fixture + Story 2.8 end-to-end smoke |
| Story 2.3 deliverable | n/a | n/a | `agents/bmad-step-runner.md` + smoke fixture |

This layering is verbatim from architecture §A.D1 (lines 270-296) + §line 1265 layer table.

### Errors registry stability

Story 2.3 ships **zero TypeScript deltas**. The `src/errors.ts` registry is untouched. The CI gate `bun test src/errors.test.ts` passes unchanged. Test count + expects count from Story 2.2 baseline (409 / 1488 / 39 files) carry over with zero deltas.

### Test pattern — Layer 3 special case (AR35 deviation)

Per Stories 1.3 / 1.4 / 1.5 / 1.6 / 1.8 / 1.9 / 1.10 / 1.11 / 1.12 / 2.1 / 2.2 precedent, Layer 2 deliverables ship colocated `*.test.ts` exercising the testable export with tmpdir-per-test isolation. **Layer 3 deliverables CANNOT follow this pattern** — sub-agents require a live Claude Task invocation that `bun test` cannot provide. Story 2.3's "test surface" is split:

- **Static validation** (Task 8.3): manual checklist (frontmatter shape, body content, AR7 section walk, forbidden-action declarations, architectural citations). This is a checklist-based gate at the dev-story phase, not an automated test.
- **Smoke fixture** (Task 7): `tests/fixtures/bmad-step-runner/dispatch-spec.json` + `inputs/topic.md` lets a developer manually invoke the agent in their local Claude Code session and inspect the produced artifact. Manual verification is the AR35-equivalent for Layer 3 in v0.1.
- **End-to-end smoke** (Story 2.8 — forward-dep): the full `/bmad-next` happy path exercises this agent live alongside Stories 2.4, 2.6, 2.7. Story 2.8 is the **canonical AC-4 satisfaction**; Story 2.3's manual fixture is a pre-2.8 sanity check.

This is a deliberate AR35 deviation for Layer 3 deliverables — documented here so the dev / reviewer doesn't expect a colocated `*.test.ts`.

## Forward Dependencies

Stories that consume Story 2.3's `agents/bmad-step-runner.md` deliverable:

- **Story 2.4 — Lock-free `run.ts`** [SOURCE OF DISPATCH SPEC]: produces the `dispatch-spec.json` the agent reads. Composes Story 1.6 `loadStateUnlocked` + Story 1.10 `computeNextStep` + Story 1.11 `resolvePersona` + Story 2.2 `buildDispatchSpec` + Story 2.2 `emitDispatchAction({agent: "bmad-step-runner", ...})`. Story 2.3's agent name (`bmad-step-runner`) MUST match Story 2.2's hard-coded literal at `src/dispatch/generate-spec.ts` (and any subsequent change to the agent name requires changing both Story 2.3's frontmatter AND Story 2.2's emit literal — a coupled atomic change).
- **Story 2.5 — Markdown transcript + JSON run-log writers**: captures the sub-agent's prompt + output excerpt + verifier result in `runs/<ts>-<step>.log`. Story 2.3's agent does NOT write to these logs — Story 2.5 runs at Layer 2 inside `verify-and-advance.ts` and reads the live Task tool's response.
- **Story 2.6 — `verify-and-advance.ts`** [PRIMARY CONSUMER]: reads `staging/<runId>/outputs/<artifact>` produced by Story 2.3's agent; runs Story 2.1's `runVerifier`; on pass, promotes to canonical path. Story 2.6 ALSO reads the dispatch-spec.json to extract `step` (per Story 2.2 carry-over) and `runId` for the state-hash TOCTOU snapshot.
- **Story 2.7 — Slash command markdown for `/bmad-next`** [PRIMARY INVOKER]: the Layer 1 orchestrator that calls `Task(agent="bmad-step-runner", prompt=<dispatch-spec-path>)`. Story 2.7's body explicitly references `agents/bmad-step-runner.md` and uses the `agent` field from Story 2.2's stdout JSON line.
- **Story 2.8 — Smoke test for `/bmad-next` happy path** [AC-4 SATISFACTION]: the canonical end-to-end exercise of Story 2.3's agent. Spawns the full pipeline (run.ts → JSON line → Task invocation → bmad-step-runner agent → artifact write → verify-and-advance → promote → state advance) and asserts the artifact ends up at the canonical path with the verifier reporting `pass`.
- **Story 4.1 — `/bmad-loop` command skeleton**: each loop iteration invokes `Task(agent="bmad-step-runner", ...)` per iteration's dispatch spec. The agent definition itself is invariant across loop iterations; only the dispatch spec differs.
- **Story 5.1 — Retry failure mode**: re-invokes the SAME `bmad-step-runner` agent against the SAME dispatch spec (or a slightly modified one with the failure context appended) per architecture §D9 lines 492-499. Story 2.3's agent is the retry target.
- **Story 5.3 — Route-to-fixer failure mode** [INTRODUCES SECOND SUB-AGENT]: introduces `agents/bmad-step-fixer.md` as a SECOND Layer-3 file. Mirrors Story 2.3's structure (frontmatter + body + 6-section walk + forbidden-actions) but for the fixer persona. Story 5.3's fixer reads BOTH the dispatch spec AND the verifier-result.json to construct a remediation context.
- **Story 6.x — Specialized per-step agents (telemetry-driven)**: future stories MAY introduce `agents/bmad-prd-runner.md`, `agents/bmad-architecture-runner.md`, etc. per architecture §line 332. Story 2.3's `bmad-step-runner` remains the fallback. The `dispatch-spec.json.agent` field (currently always `"bmad-step-runner"`) becomes per-step configurable.

## Previous Story Intelligence

This is iteration 3 of Epic 2 — the **third story** of the epic, following Story 2.1 (verifier registry) and Story 2.2 (dispatch spec generator). Story 2.3 is **structurally distinct** from every prior story (first Layer-3 deliverable, no `src/` deltas), so much of the precedent does NOT directly apply. Below are the lessons that DO carry over:

### Story 1.1 — Bun host scaffold

- Bun 1.3.12 is the minimum supported runtime (AR2). Story 2.3 ships zero `src/` deltas, so no Bun version concerns surface. The smoke fixture under `tests/fixtures/bmad-step-runner/` is plain JSON + markdown — no Bun dependency.
- `package.json` `scripts` block exposes `check`, `lint`, `typecheck`, `test`. Story 2.3 must keep these passing (Bun does not test markdown; the script suite passes trivially with zero TS deltas).

### Story 1.2 — Errors module + registry CI gate

- The 16-entry registry is stable since Story 1.5; held through Stories 1.13, 2.1, 2.2. Story 2.3 ships zero TS deltas — registry untouched, CI gate trivially passes.

### Story 1.3 — Logger + path helpers + atomic write

- `src/io/log.ts` is a Layer-2 concern (stderr/stdout discipline). Story 2.3 is Layer 3 — the sub-agent does NOT use `src/io/log.ts`. It uses Claude Code's tool-dispatch transcript (auto-captured) for visibility and emits exactly one summary line as its terminal action.
- `src/io/atomic-write.ts` is a Layer-2 concern (NFR-R1 atomic file writes for canonical state). Story 2.3 writes ONLY to `staging/<runId>/outputs/` (a non-canonical scratch directory). The agent uses Claude Code's `Write` tool — atomic-via-Claude-Code is acceptable for the staging dir; Layer 2's `atomicWrite` is reserved for canonical state writes (state.yaml, transcripts, etc.).

### Story 1.4 — File lock with heartbeat

- `src/lock/lock.ts` is a Layer-2 concern. Story 2.3 (Layer 3) NEVER acquires the lock. Per architecture §line 1672 + AR8 (lock-free `run.ts`, lock in `verify-and-advance.ts`), the lock-free path is **architecturally critical** — Story 2.3's agent runs while NO lock is held; this is by design so the long sub-agent execution does not block other Stepper operations on the same project.

### Story 1.5 — Schemas + migrations skeleton

- `src/schemas/dispatch-spec.ts` declares `DispatchSpecV1Schema` — the canonical contract Story 2.3's agent reads. Story 2.3 does NOT import the schema (it cannot — Layer 3 has no TS access); it consumes the **on-disk JSON shape** that Story 1.5's schema defines. The agent body uses field names verbatim (`taskSpec.persona`, `taskSpec.context`, etc.) so the consumer-of-spec contract holds.
- The `phase` field (Story 2.2 carry-over) is documented in `taskSpec.task` human-readable text but NOT a strict schema field. Story 2.3's agent body uses `step + epic + story` (from the dispatch spec's top-level fields) for persona context; `phase` is informational only.

### Story 1.6 — State subsystem load/save/recompute skeleton

- Story 2.3 does NOT touch `state.yaml` directly (per hard-constraint). The agent runs in the Layer-2 lock-free window between Story 2.4's `run.ts` (state read + dispatch spec write) and Story 2.6's `verify-and-advance.ts` (lock acquisition + state advance). Story 2.3 is **state-agnostic** — it never reads or writes state.yaml.

### Story 1.7 — CLI argument parser

- Story 1.7's `Result<T, E>` pattern is NOT applicable — Layer 3 has no CLI surface. Story 2.3's agent receives its argument (the dispatch-spec path) via the prompt body, not a CLI parser.

### Story 1.8 — Snapshot branch+sha detection

- `src/snapshot/` is mid-tier Layer-2. Story 2.3 (Layer 3) has no awareness of git or branch state — those are pre-dispatch concerns at Layer 2 (Story 2.6 may invoke snapshot capture before verification).

### Story 1.9 — BMAD detection

- `src/bmad-detect/` is mid-tier Layer-2. Story 2.3 (Layer 3) does NOT detect BMAD installation — that is upstream (Layer 2 verified during Story 2.4's `run.ts` startup).

### Story 1.10 — DAG seed + three-tier registry

- `src/dag/index.ts` is mid-tier Layer-2. Story 2.3 (Layer 3) does NOT consult the DAG — the step name is provided directly via `dispatchSpec.step`. The DAG resolves to one step PER dispatch; the agent receives that one step's spec.

### Story 1.11 — Persona resolution

- `src/personas/index.ts` is mid-tier Layer-2. Story 2.3 (Layer 3) does NOT resolve personas — the resolved persona string is provided directly via `dispatchSpec.taskSpec.persona`. The agent adopts the persona for the duration of the task.
- Story 1.11's `ConfigError` with `hintOverride?` constructor pattern is Layer-2 concern. Story 2.3 has no error throws (Layer 3 does not throw `StepperError`; it surfaces failures via emitted error lines that Layer 2's verifier subsequently catches).

### Story 1.12 — `/bmad-next --doctor` Command

- Story 1.12 was the **first integration command** (Layer 2 + Layer 1 markdown). Story 2.3 is the **first Layer 3 deliverable**. Both establish a layer pattern; subsequent stories follow.
- Story 1.12's `commands/bmad-doctor.md` is a thin Layer-1 markdown alias (frontmatter + 30 lines). Story 2.3's `agents/bmad-step-runner.md` is a Layer-3 markdown definition (frontmatter + ~80-100 lines body). Similar markdown shape, different layer.

### Story 1.13 — Quick-Start Documentation

- Story 1.13 shipped zero `*.ts` deltas (documentation-only). Story 2.3 ships zero `*.ts` deltas (sub-agent definition only). Both are markdown deliverables; both use the same `bun run check` baseline (Story 2.3 baseline = Story 2.2 final = 409 pass / 1488 expects / 39 files).

### Story 2.1 — Verifier configuration registry

- Story 2.1 shipped `src/verifiers/` — the post-dispatch artifact validator. Story 2.3 produces the artifact Story 2.1's `runVerifier` validates. The bridge is the `staging/<runId>/outputs/` directory: Story 2.3 writes; Story 2.1 reads; the path contract is the dispatch spec's `taskSpec.outputFormat.fileLocation`.
- Story 2.1's seven default verifier configs (`prd`, `architecture`, `story-create`, `dev-story`, `code-review`, `retro`, `analyst-research` + `default`) declare the `requiredFrontmatterSections` per step type. Story 2.3's agent body honors these by following `taskSpec.outputFormat.requiredSections` (which Story 2.4's `run.ts` will populate from the verifier registry per Story 2.2 senior dev review info-3).

### Story 2.2 — Dispatch spec generator (PREVIOUS STORY)

- Story 2.2 shipped `src/dispatch/` — the pre-dispatch spec generator (`generate-spec.ts`), the AR9 stdout-line emitter (`emit.ts`), and the orphan-staging cleanup (`staging-cleanup.ts`). Story 2.3 is the **PRIMARY READER** of the dispatch-spec.json that Story 2.2 produces (per Story 2.2 line 653 — "Story 2.3 — Generic sub-agent (`bmad-step-runner.md`) [PRIMARY READER]: the sub-agent's prompt body says 'read `staging/<run-id>/dispatch-spec.json` and follow the 6-section contract.'").
- Story 2.2's `emit.ts` writes `agent: "bmad-step-runner"` (Story 2.2 line 80 — "buildDispatchSpec... emitDispatchAction({ action: \"dispatch\", runId, agent: \"bmad-step-runner\", exitCode: 0 })"). Story 2.3's frontmatter `name: bmad-step-runner` MUST match this hard-coded literal verbatim — any change requires a coordinated update to both files.
- Story 2.2's `taskSpec.constraints.scopeLimits` field carries the literal string "Only files inside `staging/${runId}/` may be written." (per Story 2.2 senior dev review NFR-S4 line 924). Story 2.3's agent body cites this scope limit as the source of truth and surfaces it in plain English.
- Story 2.2's `taskSpec.constraints.allowedTools` field is hard-coded to `["Read", "Write", "Edit", "Grep"]` in v0.1 (per Story 2.2 generate-spec.ts:179 — note: this is **4 tools**, not 5). **AC-3 of Story 2.3 requires `allowed-tools: Read, Write, Edit, Grep, Bash`** (5 tools). The dispatch-spec's `allowedTools` is a per-task **suggestion** to the sub-agent's reasoning chain; the frontmatter `allowed-tools` is the **runtime enforcement** by Claude Code. The frontmatter is the wider set (5) so the sub-agent CAN use Bash for filesystem-only operations like `mkdir -p`; the dispatch spec narrows the suggestion per task. Story 2.3 documents this distinction in the agent body.
- Story 2.2's senior dev review carry-overs include: (Story 2.4) `cleanStagingOrphans` wiring + composing `buildDispatchSpec` + `emitDispatchAction`; (Story 2.6) `runVerifier` stagingRoot default + dispatch-spec reader; (Story 6.x) `DispatchSpecV2` `phase` ratification + optional registry CI gate extension for `hintOverride` strings. Story 2.3 has NO direct dependency on these carry-overs — they all live downstream.
- Story 2.2's review outcome: **approve-with-actions** (0 must-fix, 0 should-fix, 1 nit, 3 info). Story 2.3 should target the same approval profile by following the established markdown patterns + applying the deferred-decision discipline (e.g., the smoke fixture is dev scaffolding, not a CI gate — explicitly documented).

### Forward Action Items applied (epic-1-retrospective)

Per `_bmad-output/implementation-artifacts/epic-1-retrospective.md` §Forward Action Items for Epic 2:

- **Story 2.3 forward action**: epic-1-retrospective does not enumerate Story 2.3 specifically — its "next sub-agent worker" recommendation lives in Story 2.7's slash-command markdown design. Story 2.3 derives its scope from epics.md §Story 2.3 (lines 612-625) and architecture §A.D2 + §line 332.
- **Recommended planning sequence (epic-1-retrospective lines 110-115)**:
  - "Story 2.2 (dispatch spec generator) must precede Story 2.3 (generic sub-agent runner)" — **HONORED**: Story 2.2 is `done`; Story 2.3 builds on its dispatch-spec contract.
  - "Front-load Story 2.4 (lock-free `run.ts`) early" — DEFERRED to subsequent loop iterations; Story 2.3 does NOT depend on Story 2.4 (the agent is invariant of the runner; the runner produces the spec the agent reads).
  - "Allocate review iteration budget for Story 2.6 (verify-and-advance)" — independent; Story 2.6 follows.
- **Apply tighter scoping for stories above 600 lines (epic-1-retrospective line 165)** — Story 2.3 targets ~500-650 lines (this file). Within the 600-line guidance for unique deliverables like first-Layer-3 stories that need extensive cross-layer reasoning.

## Project Structure Notes

`agents/` joins the plugin-root directory set per architecture §line 1556. After Story 2.3, the plugin root will contain:

- `.claude-plugin/plugin.json` — manifest (Story 1.1, unchanged).
- `commands/` — slash commands (Stories 1.1, 1.12, 1.13).
- `agents/` — sub-agent definitions (NEW in Story 2.3).
- `src/` — TypeScript core (Stories 1.1-1.13, 2.1, 2.2).
- `_bmad-output/` — planning + implementation artifacts.
- `_bmad-output/.stepper/` — runtime state (state.yaml, runs/, staging/).

Story 2.3's deliverable file count:
- New agent definition (1): `agents/bmad-step-runner.md`.
- New smoke fixture (3): `tests/fixtures/bmad-step-runner/dispatch-spec.json`, `tests/fixtures/bmad-step-runner/inputs/topic.md`, `tests/fixtures/bmad-step-runner/README.md`.
- Modified files (0): zero TS / commands deltas; only the story file + sprint-status YAML mutation per the create-story phase.

Estimated baseline progression: 409 (Story 2.2 final) → 409 (Story 2.3 — zero TS deltas; baseline carries unchanged).

## References

- `_bmad-output/planning-artifacts/architecture.md` §A.D2 lines 297-336 (sub-agent dispatch via Task tool — the dispatch interface)
- `_bmad-output/planning-artifacts/architecture.md` §line 332 (the prescribed `description` string for `bmad-step-runner` — verbatim source for Story 2.3 frontmatter)
- `_bmad-output/planning-artifacts/architecture.md` §lines 1068-1070 (`agents/` directory listing — `bmad-step-runner.md` confirmed at root level)
- `_bmad-output/planning-artifacts/architecture.md` §line 1265 (Layer 3 boundary discipline — file-in / file-out, no Task, no decisions)
- `_bmad-output/planning-artifacts/architecture.md` §line 1465 (Task invocation surface — `Task: <agent= bmad-step-runner>, prompt = read staging/<run-id>/dispatch-spec.json`)
- `_bmad-output/planning-artifacts/architecture.md` §lines 1556-1557 (Sub-agent definitions: `agents/*.md` root level required by plugin spec)
- `_bmad-output/planning-artifacts/architecture.md` §P5 lines 864-917 (Sub-Agent Dispatch Contract — `dispatch-spec.json` shape + `taskSpec.constraints.allowedTools` + `scopeLimits`)
- `_bmad-output/planning-artifacts/prd.md` FR16 line 689 (sub-agent dispatch with budget+timeout — Layer 1 enforces; Layer 3 honors)
- `_bmad-output/planning-artifacts/prd.md` FR17 line 690 (verifier before promote — Story 2.1's runVerifier consumes the artifact Story 2.3 writes)
- `_bmad-output/planning-artifacts/prd.md` §Sub-Agent Dispatch Contract lines 530-552 (the 6-section AR7 contract source + operational discipline)
- `_bmad-output/planning-artifacts/prd.md` NFR-S2 (sub-agent isolation), NFR-S4 (declared scope enforcement), NFR-S6 (no execution of sub-agent output)
- `_bmad-output/planning-artifacts/epics.md` §Story 2.3 lines 612-625 (AC verbatim source)
- `_bmad-output/implementation-artifacts/2-1-verifier-configuration-registry.md` (post-dispatch verifier — Story 2.3's artifact consumer)
- `_bmad-output/implementation-artifacts/2-2-dispatch-spec-generator.md` (PREVIOUS STORY — Story 2.3's PRIMARY READER role + agent name binding to AR9 emit literal)
- `_bmad-output/implementation-artifacts/epic-1-retrospective.md` §Forward Action Items for Epic 2 (planning sequence + tighter scoping)
- `commands/bmad-next.md` (existing Layer 1 command — Story 2.7 will extend to invoke Task against bmad-step-runner)
- `commands/bmad-doctor.md` (existing Layer 1 command — markdown shape precedent for sub-agent definition style)
- `.claude-plugin/plugin.json` (plugin manifest — does NOT need updating; agents auto-discovered)
- `src/dispatch/generate-spec.ts` (Story 2.2 — the producer of `agent: "bmad-step-runner"` literal that Story 2.3's frontmatter `name:` binds to)
- `src/schemas/dispatch-spec.ts` (Story 1.5 — the canonical `DispatchSpecV1Schema` Story 2.3's agent reads)

## File List

> Predicted by bmad-create-story; finalized by bmad-dev-story on completion.

**New files:**
- `agents/bmad-step-runner.md` — the canonical generic sub-agent definition (frontmatter + body, ~80-150 lines).
- `tests/fixtures/bmad-step-runner/dispatch-spec.json` — minimal fixture dispatch spec for the dev-iteration smoke check.
- `tests/fixtures/bmad-step-runner/inputs/topic.md` — fixture input file referenced by the dispatch spec's `taskSpec.context[]`.
- `tests/fixtures/bmad-step-runner/README.md` — manual smoke-test instructions for the dev / reviewer.

**Modified files:**
- (None) — Story 2.3 ships zero TS / commands deltas. The story file + sprint-status YAML edits are part of the create-story phase, NOT the dev-story phase.

## Dev Agent Record

> Populated by bmad-dev-story on completion.

### Context Reference

- `_bmad-output/implementation-artifacts/2-3-generic-sub-agent-bmad-step-runner-md.md` (this story file)
- `_bmad-output/implementation-artifacts/2-2-dispatch-spec-generator.md` (PREVIOUS STORY — emit literal + dispatch-spec contract source)
- `_bmad-output/planning-artifacts/architecture.md` §A.D2 lines 297-336 + §line 332 (prescribed description)
- `.claude-plugin/plugin.json` (plugin manifest — auto-discovers `agents/`; no edit required)
- `src/dispatch/generate-spec.ts` + `src/dispatch/emit.ts` + `src/dispatch/emit.test.ts` + `src/schemas/dispatch-protocol.ts` (verification of `bmad-step-runner` literal binding)
- `src/schemas/dispatch-spec.ts` (Zod schema for fixture validation)

### Agent Model Used

claude-opus-4-7[1m]

### Debug Log References

- Pre-implementation baseline: `bun run check` → 409 pass / 0 fail / 1488 expects / 39 files.
- Fixture schema validation: `bun -e "DispatchSpecV1Schema.parse(JSON.parse(...))"` → exit 0, "OK".
- Post-implementation baseline: `bun run check` → 409 pass / 0 fail / 1488 expects / 39 files (unchanged).
- `bunx tsc --noEmit` → exit 0.
- Agent name binding verified: `bmad-step-runner` literal present in `src/schemas/dispatch-protocol.test.ts` (4 sites) + `src/dispatch/emit.test.ts` (2 sites). Frontmatter `name:` matches verbatim.

### Completion Notes

Story 2.3 ships the **first Layer-3 deliverable** of the project — the canonical
generic sub-agent definition `agents/bmad-step-runner.md` plus a manual smoke
fixture under `tests/fixtures/bmad-step-runner/`. Zero TS deltas, zero
`commands/` deltas, zero `src/errors.ts` registry deltas. Test count carries
unchanged from Story 2.2 final (409 / 1488 / 39).

Implementation followed Tasks 0-9 in order:

- **Task 0 (preconditions)**: confirmed Story 2.2 done; `agents/` did not yet
  exist; `src/dispatch/generate-spec.ts` writes the `dispatch-spec.json` shape
  per Story 1.5 schema; `src/schemas/dispatch-spec.ts` declares the 6-section
  `taskSpec` shape; the `bmad-step-runner` literal lives in test fixtures
  and (per Story 2.4 forward-dep) the future caller-side construction site.
  AC text re-verified character-identical to epics.md §Story 2.3.
- **Task 1 (`agents/` directory)**: created `/Users/tgorka/tg/bmad-stepper-cc/agents/`
  at the plugin root (architecture §line 1556). Plugin manifest unchanged —
  Claude Code auto-discovers agents per plugin runtime convention.
- **Task 2 (frontmatter)**: declared `name: bmad-step-runner`,
  `description: execute a BMAD method step from a dispatch spec at staging/<run-id>/dispatch-spec.json`
  (architecture §line 332 verbatim), `allowed-tools: Read, Write, Edit, Grep, Bash`
  (5 tools per AC-3). No `model:` / `budget:` / `timeout:` frontmatter (those
  live in `dispatch-spec.json` per architecture §P5 + Story 2.2 contract).
- **Tasks 3-6 (body)**: walked the AR7 6-section contract verbatim, the
  scope-limit + forbidden-actions, the execution sequence, per-tool guidance,
  failure modes, an example invocation, and a closing footnote citing
  architecture §A.D2 + §P5 + §line 332 + PRD §Sub-Agent Dispatch Contract.
  Body explicitly distinguishes frontmatter `allowed-tools` (runtime
  enforcement, wider) from dispatch-spec `taskSpec.constraints.allowedTools`
  (per-task suggestion, narrower) — the AC-3 vs Story 2.2 generate-spec.ts
  width distinction surfaced in story Dev Notes.
- **Task 7 (smoke fixture)**: `tests/fixtures/bmad-step-runner/{dispatch-spec.json,inputs/topic.md,README.md}`.
  The `dispatch-spec.json` validates against `DispatchSpecV1Schema` (verified
  by ad-hoc `bun -e` script — see Debug Log). README documents the manual
  smoke procedure (copy fixture into tmpdir, invoke Task in Claude Code,
  inspect produced artifact). Explicitly marked as dev-iteration scaffolding
  per AR35 deviation.
- **Task 8 (quality gates)**: `bun run check` → 409 pass / 0 fail (unchanged
  from Story 2.2 baseline). `bunx tsc --noEmit` → exit 0. Errors registry
  stays at 16 codes (no TS deltas). Frontmatter shape verified: 3 keys
  in expected order (`name`, `description`, `allowed-tools`); description
  matches architecture §line 332 verbatim; tool list contains exactly 5
  comma-separated tools. Body explicitly states all four AC-2 forbidden
  actions and walks the AR7 contract in section order with verbatim
  `taskSpec.*` field references.
- **Task 9 (status flips)**: story frontmatter `status: ready-for-dev → review`;
  in-body `Status: ready-for-dev → review`; sprint-status YAML
  `2-3-generic-sub-agent-bmad-step-runner-md: ready-for-dev → review`.
  Change Log entry appended below.

No deviations. No repairs. Manual `/agents` visual verification (Task 8.4) is
NOT executed inside this `bmad-dev-story` invocation — it requires a fresh
Claude Code session and is an interactive check; flagged as a follow-up for
the human reviewer if they want the extra confidence before Story 2.7 +
Story 2.8 land. The Story 2.8 end-to-end smoke is the canonical AC-4
satisfaction; the Story 2.3 fixture exists as pre-2.8 dev sanity scaffolding
(per AR35 deviation in Dev Notes §Test pattern — Layer 3 special case).

### File List

**New files (4):**

- `agents/bmad-step-runner.md` — canonical generic sub-agent definition (frontmatter + body, ~155 lines).
- `tests/fixtures/bmad-step-runner/dispatch-spec.json` — minimal valid `DispatchSpecV1` for the manual smoke (validated against `src/schemas/dispatch-spec.ts`).
- `tests/fixtures/bmad-step-runner/inputs/topic.md` — single-line topic input referenced by `taskSpec.context[0].path`.
- `tests/fixtures/bmad-step-runner/README.md` — manual smoke-test instructions for the dev / reviewer.

**Modified files (3 — status / audit only):**

- `_bmad-output/implementation-artifacts/2-3-generic-sub-agent-bmad-step-runner-md.md` (this file — status flip + checkboxes + Dev Agent Record + Completion Notes + Change Log).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (`2-3-generic-sub-agent-bmad-step-runner-md: ready-for-dev → review` + `last_updated`).
- `.bmad-stepper/runs/2026-05-01T055500Z-bmad-next/tasks/t1-dev-story.yaml` (NEW task record per `bmad-dev-story` audit-log convention).

**Zero TS / `commands/` deltas** as predicted; matches the hard-constraint mutation scope.

## Change Log

- **2026-05-01 (created)**: Story file created (status `ready-for-dev`) — bmad-create-story persona, model `claude-opus-4-7[1m]`, run `2026-05-01T055100Z-bmad-next` (loopId `2026-05-01T053000Z-bmad-loop`, loopIteration 3). THIRD epic-2 story (after Story 2.1 verifiers — DONE, Story 2.2 dispatch spec generator — DONE). FIRST Layer-3 deliverable of the project. Drafted from epics.md §Story 2.3 lines 612-625 (AC verbatim), architecture.md §A.D2 lines 297-336 (sub-agent dispatch via Task tool), §line 332 (prescribed description string), §lines 1068-1070 (agents/ directory listing), §line 1265 (Layer 3 boundary discipline), §line 1465 (Task invocation surface), §lines 1556-1557 (sub-agent definitions root-level required by plugin spec), §P5 lines 864-917 (Sub-Agent Dispatch Contract), prd.md FR16 + FR17 + NFR-S2/S4/S6 + §Sub-Agent Dispatch Contract lines 530-552, Story 2.2 §Forward Dependencies line 653 (Story 2.3 PRIMARY READER role) + senior dev review (agent name binding to emit literal). Mirrors Story 2.2 / 2.1 / 1.12 template structure. Files planned: 1 new sub-agent definition (`agents/bmad-step-runner.md`); 3 new fixture files (`tests/fixtures/bmad-step-runner/`); 0 modified TS / commands files. ZERO `src/` deltas; errors registry stays at 16; baseline test count carries unchanged from Story 2.2 final (409 pass / 1488 expects / 39 files). Story 2.3's `name: bmad-step-runner` frontmatter is the BINDING TARGET for Story 2.2's `emitDispatchAction({agent: "bmad-step-runner", ...})` literal — coupled atomic change if ever renamed. AC-3 declared `allowed-tools` (5 tools: Read, Write, Edit, Grep, Bash) is wider than Story 2.2's per-task `taskSpec.constraints.allowedTools` (4 tools default: Read, Write, Edit, Grep) — frontmatter is runtime enforcement; dispatch-spec is per-task suggestion. Smoke fixture is dev-iteration scaffolding (NOT CI gate); end-to-end smoke is Story 2.8's deliverable. Story 2.3 is structurally distinct from prior stories (first Layer-3 file, no TS, no `bun test` coverage). Test pattern: AR35 deviation documented (Layer 3 cannot be exercised by `bun test`; manual fixture + Story 2.8 end-to-end smoke jointly satisfy AC-4).
- **2026-05-01 (dev-story)**: Status flipped `ready-for-dev → review` — bmad-dev-story persona, model `claude-opus-4-7[1m]`, run `2026-05-01T055500Z-bmad-next` (loopId `2026-05-01T053000Z-bmad-loop`, loopIteration 4). All 9 task groups + sub-tasks completed (per checkboxes flipped to `[x]` in §Tasks / Subtasks). Files produced: `agents/bmad-step-runner.md` (155 lines: 4-line frontmatter + ~150-line body covering invocation contract, AR7 6-section walk verbatim, NFR-S4 scope limit, four forbidden actions, 9-step execution sequence, per-tool guidance, frontmatter-vs-dispatch-spec width distinction, failure modes, example invocation, architectural-source footnote); `tests/fixtures/bmad-step-runner/dispatch-spec.json` (minimal `DispatchSpecV1` validated against `src/schemas/dispatch-spec.ts`); `tests/fixtures/bmad-step-runner/inputs/topic.md` (one-line topic); `tests/fixtures/bmad-step-runner/README.md` (manual smoke procedure). Quality gates green: `bun run check` → 409 pass / 0 fail / 1488 expects / 39 files (unchanged from Story 2.2 baseline); `bunx tsc --noEmit` → exit 0; errors registry stays at 16 codes. Frontmatter shape verified per AC-1 + AC-3 (3 keys, description matches architecture §line 332 verbatim, 5-tool allow-list). Body verified per AC-2 (4 forbidden actions stated explicitly, 6-section AR7 contract walked in order, scope-limit declared). AC-4 partially satisfied via manual fixture; full satisfaction deferred to Story 2.8 per AR35 deviation. Agent name binding `bmad-step-runner` verified to match the literal at `src/schemas/dispatch-protocol.test.ts` (4 sites) + `src/dispatch/emit.test.ts` (2 sites). Zero deviations. Zero repairs. Sprint-status YAML flipped to match (`2-3-generic-sub-agent-bmad-step-runner-md: review`). Task record at `.bmad-stepper/runs/2026-05-01T055500Z-bmad-next/tasks/t1-dev-story.yaml`.
- **2026-05-01 (review)**: Story 2.3 senior code review completed via the `bmad-code-review` persona (model `claude-opus-4-7[1m]`, runId `2026-05-01T060100Z-bmad-next`, loopId `2026-05-01T053000Z-bmad-loop`, loopIteration 5). Status `review → done`. Outcome: **approve** (0 must-fix, 0 should-fix, 0 nits, 2 info). All 4 ACs PASS: AC-1 (description matches architecture §line 332 verbatim — `agents/bmad-step-runner.md:3`); AC-2 (6-section contract + four forbidden actions stated explicitly — `:22-30, :47-58`); AC-3 (`allowed-tools: Read, Write, Edit, Grep, Bash` — 5 tools, `:4`); AC-4 (smoke fixture seeded under `tests/fixtures/bmad-step-runner/` — manual procedure documented; canonical end-to-end smoke deferred to Story 2.8 per documented AR35 deviation). AR7 PASS (6-section walk verbatim). AR16 INFORMATIONAL (multi-persona deferred to Story 2.4 + 2.7 runner-tier loop per architecture §line 187). AR41 CLEAN (Layer-3 markdown — naturally compliant). FR16/FR17 PASS. NFR-S2/S4/S6 PASS (4-layer NFR-S4 defense-in-depth confirmed). Quality gates reproduced: `bun run check` exit 0; `bunx tsc --noEmit` exit 0; `bun test` 409 pass / 0 fail / 1488 expects / 39 files (UNCHANGED from Story 2.2 baseline — zero TS deltas as predicted). Fixture validates against `DispatchSpecV1Schema` cleanly. Agent name `bmad-step-runner` literal binding verified at 8 sites in `src/` tests (`src/schemas/dispatch-protocol.test.ts:27,49,57,76,170` + `src/dispatch/emit.test.ts:47,54,95`); frontmatter `name:` matches verbatim. Errors registry stable at 16 codes. Two info findings: Info-1 (story-spec line 394 width annotation drift — Story 2.2 generate-spec.ts:178 default is 5 tools, not 4 as story line 394 claimed; surfaced by dev in Completion Notes; non-blocking); Info-2 (manual `/agents` visual check deferred to Stories 2.7 + 2.8 live integration; non-blocking). Carry-overs: Story 2.4 (`run.ts` writes `agent: "bmad-step-runner"` literal — coupled atomic change); Story 2.6 (`verify-and-advance.ts` post-dispatch consumer); Story 2.7 (`commands/bmad-next.md` Layer 1 `Task` invocation); Story 2.8 (canonical AC-4 satisfaction via live end-to-end smoke); Story 5.3 (`agents/bmad-step-fixer.md` — second Layer-3 file mirroring this structure); Story 6.x (specialized per-step agents — telemetry-driven). Sprint-status YAML flipped to match (`2-3-generic-sub-agent-bmad-step-runner-md: done`). Task record at `.bmad-stepper/runs/2026-05-01T060100Z-bmad-next/tasks/t1-code-review.yaml`.

## Completion Notes

Story 2.3 ships the first Layer-3 deliverable of the project: the canonical
generic sub-agent definition `agents/bmad-step-runner.md` plus a manual smoke
fixture at `tests/fixtures/bmad-step-runner/`. All four ACs satisfied at the
prompt-engineering layer (AC-1 description verbatim; AC-2 four forbidden
actions stated; AC-3 five-tool `allowed-tools`; AC-4 manual fixture seeded —
canonical end-to-end smoke is Story 2.8). Quality gates green, baseline
unchanged at 409 pass / 1488 expects / 39 files, tsc clean, errors registry
stable at 16 codes. Frontmatter `name: bmad-step-runner` matches the literal
in `src/schemas/dispatch-protocol.test.ts` + `src/dispatch/emit.test.ts` —
the AR9 dispatch protocol's `agent` field will route to this definition once
Story 2.4 wires the runner-side construction and Story 2.7 wires the Layer-1
`Task` invocation. No deviations, no repairs.

Follow-ups for `bmad-code-review`:

- Manual `/agents` visual check (Task 8.4) was skipped inside this dev-story
  invocation — it requires a fresh interactive Claude Code session. The
  reviewer may run `/agents` locally to confirm the agent appears with the
  prescribed description before approving.
- The frontmatter-vs-dispatch-spec `allowed-tools` width distinction (5 vs
  Story 2.2 generate-spec.ts default of 5) is documented in the body. Note:
  re-reading `src/dispatch/generate-spec.ts:178` shows the v0.1 default array
  is `["Read", "Write", "Edit", "Grep", "Bash"]` (5 elements, NOT 4 as the
  story spec text described). The two widths are now identical in v0.1; the
  body still documents the conceptual distinction (runtime vs per-task
  suggestion) so future per-step narrowing remains coherent. No code change
  needed; flagged here so the reviewer is aware the story-spec line 394 width
  description is slightly out of date relative to the actual generator.
- Story 2.8 owns the canonical AC-4 satisfaction (live Task invocation
  end-to-end). Story 2.3's fixture is dev scaffolding only.

## Senior Developer Review

**Reviewer**: bmad-code-review (Stepper iteration 3)
**Date**: 2026-05-01
**Verdict**: approve

### Acceptance Criteria

- **AC-1** (`agents/bmad-step-runner.md` exists with `description` matching architecture §line 332 verbatim — "execute a BMAD method step from a dispatch spec at staging/<run-id>/dispatch-spec.json"): **PASS** — `agents/bmad-step-runner.md:1-5` declares the YAML frontmatter with three keys in expected order: `name: bmad-step-runner` (`:2`), `description: execute a BMAD method step from a dispatch spec at staging/<run-id>/dispatch-spec.json` (`:3` — character-identical to architecture §line 332), `allowed-tools: Read, Write, Edit, Grep, Bash` (`:4`). No extraneous frontmatter fields (no `model:`, `budget:`, `timeout:` — those live in dispatch-spec.json per architecture §P5 and Story 2.2's contract). File placed at the plugin-root `agents/` directory per architecture §line 1556 (auto-discovered by Claude Code; `.claude-plugin/plugin.json` correctly NOT touched).

- **AC-2** (sub-agent reads dispatch spec, follows the 6-section contract, reads inputs from `staging/<run-id>/inputs/`, writes outputs to `staging/<run-id>/outputs/`, returns; never invokes Task itself, never calls Stepper's `bun run` directly, never writes outside its own `staging/<run-id>/`): **PASS** — body covers the contract end-to-end:
  - Invocation contract at `agents/bmad-step-runner.md:13-18` ("Read that file FIRST" — the dispatch-spec path is the only data channel from Layer 1).
  - The 6-section AR7 contract is walked in order at `:22-30` with verbatim `taskSpec.*` field references for each section (PERSONA → `taskSpec.persona`, CONTEXT → `taskSpec.context[]`, TASK → `taskSpec.task`, OUTPUT FORMAT → `taskSpec.outputFormat`, SUCCESS CRITERIA → `taskSpec.successCriteria`, CONSTRAINTS → `taskSpec.constraints`).
  - Scope limit at `:36-43`: "Write ONLY inside `staging/<run-id>/outputs/`. Do NOT write outside this directory. Do NOT modify `state.yaml`. Do NOT modify the canonical artifact paths…"
  - Forbidden actions at `:47-58` declare all four prohibitions explicitly (no `Task` invocation, no `bun run`, no next-step decisions, no self-validation, no user dialogue).
  - 9-step execution sequence at `:63-83` covers Read dispatch spec → adopt persona → load context → produce artifact → cross-check successCriteria → write artifact → emit summary line → return.

- **AC-3** (`allowed-tools: Read, Write, Edit, Grep, Bash`): **PASS** — `agents/bmad-step-runner.md:4` declares the literal `allowed-tools: Read, Write, Edit, Grep, Bash` (5 tools, comma-separated, no extras). Body further documents the frontmatter-vs-dispatch-spec width distinction at `:104-114` (frontmatter = runtime enforcement by Claude Code; `taskSpec.constraints.allowedTools` = per-task suggestion that may narrow the frontmatter).

- **AC-4** (smoke test verifies a fixture dispatch produces an artifact at the declared output path): **PASS (with documented AR35 deviation)** — fixture seeded at `tests/fixtures/bmad-step-runner/`:
  - `dispatch-spec.json` — minimal `DispatchSpecV1` with `runId: "test-run"`, `step: "analyst-research"`, `taskSpec.persona: "analyst"`, `taskSpec.outputFormat.fileLocation: "staging/test-run/outputs/research.md"`, `taskSpec.constraints.scopeLimits: "Only files inside staging/test-run/ may be written."`. Validates against `DispatchSpecV1Schema` (verified independently — `bun -e "DispatchSpecV1Schema.parse(...)"` exit 0).
  - `inputs/topic.md` — single-line topic input file.
  - `README.md` — documents the manual smoke procedure (copy fixture into a tmpdir, invoke `Task(agent="bmad-step-runner", prompt="staging/test-run/dispatch-spec.json")`, verify the artifact at `staging/test-run/outputs/research.md` exists with `title:` frontmatter; documents pass criteria + boundary discipline assertions).
  - The AR35 deviation is documented in story Dev Notes §"Test pattern — Layer 3 special case" — Layer 3 cannot be exercised by `bun test` (no Claude API access). Canonical AC-4 satisfaction is Story 2.8's end-to-end smoke; Story 2.3's fixture is pre-2.8 dev-iteration scaffolding. Acceptable per the documented deviation.

### Architecture & FR/NFR

- **AR7** (6-section task spec): **PASS** — body at `agents/bmad-step-runner.md:22-32` walks PERSONA, CONTEXT, TASK, OUTPUT FORMAT, SUCCESS CRITERIA, CONSTRAINTS in order with verbatim `taskSpec.*` field bindings. Body explicitly states "You do NOT invent additional sections. You consume the spec verbatim." (`:32`).

- **AR16** (multi-persona steps dispatch sub-agents sequentially in v0.1): **INFORMATIONAL** — Story 2.3 ships ONE sub-agent definition that receives ONE persona per invocation (`taskSpec.persona`). The runner-tier sequential loop (one `Task` invocation per persona) lives in Story 2.4 + Story 2.7 per architecture §line 187 + Story 2.2 dev notes line 504. Story 2.3's agent does NOT iterate over personas itself — adopts the single persona declared in `taskSpec.persona` at `:69-70`. AR16 enforcement is correctly deferred upstream.

- **AR41** (no upward imports — module boundary discipline): **CLEAN (naturally compliant)** — Layer 3 sub-agent markdown is a **prompt-layer entity**, not a code-layer entity. It cannot import any TypeScript module. The closest Layer-3 analog of AR41 is the **forbidden-actions list** (no `Task`, no `bun run`, no writes outside staging) which is enforced at `agents/bmad-step-runner.md:47-58`. The architecturally critical Layer-3 boundary discipline (architecture §line 1265: "deciding what comes next; validating own output; user dialogue; writes outside their `staging/<run-id>/`") is honored verbatim in the body.

- **FR16** (sub-agent dispatch with budget+timeout): **PASS** — Story 2.3's agent **honors** the budget+timeout fields declared in `dispatch-spec.json` (Story 2.2's contract). The body at `:104-114` correctly defers enforcement to Layer 1 (the Claude Code runtime applies the timeout; the agent does not enforce its own budget). Frontmatter does NOT declare `budget:` / `timeout:` — those live in the dispatch spec per architecture §P5, avoiding precedence ambiguity.

- **FR17** (verifier before promote — Story 2.3 produces the artifact Story 2.1's `runVerifier` consumes): **PASS** — body at `:55` declares "Do NOT validate your own output. Layer 2's `runVerifier` (`src/verifiers/`) does that — and you MUST NOT pre-empt it." Closing line at `:144-146` reaffirms: "Layer 1 will then run `verify-and-advance` to validate your output and (on pass) promote it to its canonical location."

- **NFR-S2** (sub-agent isolation): **PASS** — `allowed-tools: Read, Write, Edit, Grep, Bash` at `:4` is the runtime enforcement boundary; Claude Code's runtime restricts the sub-agent to these 5 tools at the dispatch layer. The body does not invoke `Task`, `WebFetch`, `WebSearch`, MCP tools, or any other prohibited tool. Per-tool guidance at `:88-102` constrains `Bash` to filesystem-only commands within the staging dir.

- **NFR-S4** (sub-agent isolation enforces declared scope): **PASS (4-layer defense-in-depth)** — (a) frontmatter `allowed-tools` runtime restriction; (b) prompt body explicit scope limit at `:36-43` ("Write ONLY inside `staging/<run-id>/outputs/`."); (c) dispatch-spec `taskSpec.constraints.scopeLimits` reminder ("Only files inside `staging/<run-id>/` may be written.") cited as source-of-truth at `:40-43`; (d) Layer 2 verifier check (Story 2.1's `runVerifier` validates AT the declared path; Story 2.6 confirms no out-of-staging writes). All four layers in place.

- **NFR-S6** (no execution of sub-agent output): **PASS** — agent's output is an **artifact file** (markdown / JSON / etc.) per `taskSpec.outputFormat.fileLocation`. Body at `:91-94` describes `Write` for the primary artifact; never `Bash` to execute the artifact body. Closing footnote at `:166-173` cites architecture §A.D2 + §P5; the post-dispatch flow (verifier read + promote) explicitly does NOT execute the artifact.

### Deviations

- **dev (story-spec line 394 width annotation)**: **accept-with-followup** — Story-spec §"Previous Story Intelligence — Story 2.2" line 394 describes Story 2.2's `taskSpec.constraints.allowedTools` default as 4 tools (Read/Write/Edit/Grep). Re-verifying `src/dispatch/generate-spec.ts:178`, the actual default is 5 tools (Read/Write/Edit/Grep/Bash) — same width as Story 2.3's frontmatter. Dev surfaced this in Completion Notes follow-ups (story lines 590-598). The conceptual frontmatter-vs-dispatch-spec distinction (runtime enforcement vs per-task suggestion) remains valid for future per-step narrowing; no code or agent change required. Informational only — surfaced as Info-1 below.

### Findings

#### Must-Fix (0)

None.

#### Should-Fix (0)

None.

#### Nits (0)

None.

#### Info (2)

- **Info-1** (story-spec internal annotation drift): Story-spec line 394 (Previous Story Intelligence §Story 2.2) describes Story 2.2's `taskSpec.constraints.allowedTools` v0.1 default as 4 tools (Read/Write/Edit/Grep); the actual `src/dispatch/generate-spec.ts:178` default is `["Read", "Write", "Edit", "Grep", "Bash"]` (5 tools — same width as Story 2.3's frontmatter `allowed-tools`). Dev correctly surfaced this in Completion Notes follow-ups. The body's frontmatter-vs-dispatch-spec width distinction at `agents/bmad-step-runner.md:104-114` remains conceptually correct (frontmatter = runtime enforcement by Claude Code; `taskSpec.constraints.allowedTools` = per-task suggestion to the reasoning chain) for future per-step narrowing. No code change required; non-blocking.

- **Info-2** (manual `/agents` visual check deferred): Story Task 8.4 (manual `/agents` discovery check in a fresh interactive Claude Code session) was not executed by either `bmad-dev-story` or `bmad-code-review` (both run inside non-interactive sub-agent contexts). The frontmatter shape is statically verified (3 keys in expected order; description matches architecture §line 332 verbatim; 5-tool allow-list); per architecture §line 1556 plugin auto-discovery, the agent will be discoverable. Story 2.7 (Layer 1 `Task` invocation) + Story 2.8 (end-to-end smoke) will close this observation through live integration. Non-blocking.

### Quality Gates Reproduced

- `bun run check`: exit **0** — `biome ci .` PASS (no fixes applied); `bun test` 409 pass / 0 fail / 1488 expects / 39 files (UNCHANGED from Story 2.2 baseline — zero TS deltas, as predicted).
- `bunx tsc --noEmit`: exit **0**.
- Test counts: **409 pass / 0 fail / 1488 expects / 39 files** (matches dev report exactly).
- Fixture schema validation: `DispatchSpecV1Schema.parse(JSON.parse(fixture))` exit **0** (`runId=test-run`, `step=analyst-research`).
- Agent name literal binding: `bmad-step-runner` matches at 8 sites in `src/` tests — `src/schemas/dispatch-protocol.test.ts:27,49,57,76,170` (5 sites) + `src/dispatch/emit.test.ts:47,54,95` (3 sites). Frontmatter `name: bmad-step-runner` matches verbatim. The literal will also bind to Story 2.4's caller-side construction site (forward dep — coupled atomic change if ever renamed).
- AR41 boundary: **CLEAN (naturally compliant — Layer-3 markdown has no TypeScript imports)**.
- Errors registry: **stable at 16 codes** (zero TS deltas).

### Carry-overs to Future Stories

- **Story 2.4** (`run.ts`): producer of the `dispatch-spec.json` + AR9 stdout JSON line. Will write `agent: "bmad-step-runner"` literal; that literal MUST match Story 2.3's frontmatter `name: bmad-step-runner` verbatim — coupled atomic change if ever renamed.
- **Story 2.6** (`verify-and-advance.ts`): post-dispatch consumer of Story 2.3's artifact. Reads `staging/<runId>/outputs/<artifact>`, runs Story 2.1's `runVerifier`, promotes on pass.
- **Story 2.7** (`commands/bmad-next.md`): Layer 1 orchestrator that extracts `agent` from the AR9 stdout JSON line and invokes `Task(agent="bmad-step-runner", prompt=<dispatch-spec-path>)`. Will close Info-2 (live agent discovery) at integration time.
- **Story 2.8** (`/bmad-next` happy-path smoke): canonical AC-4 satisfaction via live Task invocation end-to-end. Story 2.3's fixture is pre-2.8 dev-iteration scaffolding per the documented AR35 deviation.
- **Story 5.3** (`route-to-fixer` failure mode): introduces `agents/bmad-step-fixer.md` as the SECOND Layer-3 file — mirrors Story 2.3's frontmatter + body structure for the fixer persona. The fixer reads BOTH the dispatch spec AND the verifier-result.json to construct a remediation context.
- **Story 6.x** (specialized per-step agents — telemetry-driven): future stories MAY introduce `agents/bmad-prd-runner.md`, `agents/bmad-architecture-runner.md`, etc. per architecture §line 332. Story 2.3's `bmad-step-runner` remains the fallback. The `dispatch-spec.json.agent` field (currently always `"bmad-step-runner"`) becomes per-step configurable.
