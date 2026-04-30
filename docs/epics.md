---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
inputDocuments:
  - docs/prd.md
  - docs/architecture.md
---

# BMAD Stepper - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for BMAD Stepper, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: Użytkownik może uruchomić preview następnego kroku BMAD bez modyfikowania plików projektu.
FR2: System może wykryć najbliższy niewykonany krok BMAD na podstawie workflow, stanu i artefaktów.
FR3: System może pokazać wymagane inputy, oczekiwane outputy, kryteria ukończenia i warunki stopu dla wybranego kroku.
FR4: Użytkownik może ograniczyć wybór kroku przez epic, story, phase lub step.
FR5: System może zdiagnozować brak wymaganych plików BMAD przed wykonaniem workflow.
FR6: Użytkownik może wykonać dokładnie jeden krok BMAD przez `/bmad-next`.
FR7: System może załadować personę, instrukcje, inputy, outputy, taski, done criteria i next transitions dla kroku.
FR8: System może potraktować krok jako transakcję, która aktualizuje stan dopiero po spełnieniu kryteriów ukończenia.
FR9: System może wykonać opcjonalne kroki domyślnie, chyba że użytkownik poprosi o ich pominięcie.
FR10: System może zatrzymać wykonanie pojedynczego kroku, gdy inputy są brakujące, completion jest niejednoznaczne lub potrzebna jest decyzja człowieka.
FR11: Użytkownik może uruchomić pętlę kroków przez `/bmad-loop`.
FR12: Użytkownik może ustawić cel pętli jako next story, konkretną story, zakres story, epic, phase lub step.
FR13: System może powtarzać `/bmad-next` do osiągnięcia jawnego warunku stopu.
FR14: System może zatrzymać pętlę po osiągnięciu limitu kroków.
FR15: System może zatrzymać pętlę na checkpointach człowieka, failed validation, repair limits, missing inputs i ambiguous completion.
FR16: System może raportować, dlaczego pętla została zatrzymana i jaki jest rekomendowany następny ruch.
FR17: System może używać `.bmad-stepper/state.yaml` jako indeksu aktywnego workflow.
FR18: System może porównywać zapisany stan z dowodami w artefaktach projektu.
FR19: System może wykryć konflikt między stanem a frontmatterem, plikami, outputami, testami lub review results.
FR20: Użytkownik może uruchomić lub otrzymać interactive reconcile, gdy stan i artefakty się nie zgadzają.
FR21: Użytkownik może wybrać sposób naprawy konfliktu, taki jak update state, trust artifacts, rerun step, skip step lub diagnostic.
FR22: System może odmówić kontynuacji, gdy nie da się udowodnić bezpiecznego następnego kroku.
FR23: System może wykryć nieukończony run i zaoferować resume, restart, abandon lub reconcile.
FR24: System może ponownie wejść w krok idempotentnie, sprawdzając istniejące artefakty przed retry lub rerun.
FR25: System może uruchamiać task sub-agenty sekwencyjnie w ramach kroku.
FR26: System może przekazywać output jednego taska jako jawny input do następnego taska.
FR27: System może wymagać, aby każdy task wyprodukował zadeklarowany output.
FR28: System może walidować task output pod kątem obecności, wymaganych sekcji, zgodności kontraktu i zakresu mutacji.
FR29: System może wymagać od task outputu self-checku obejmującego użytą personę, przeczytane inputy, wyprodukowane outputy i respektowany scope.
FR30: System może ponawiać naprawę task outputu do skonfigurowanego limitu.
FR31: System może zapisać failure report, gdy task nie spełnia kontraktu po limitach naprawy.
FR32: Użytkownik może skonfigurować Stepper przez `.bmad-stepper/config.yaml`.
FR33: System może odczytać template stanu z `.bmad-stepper/state.yaml`.
FR34: System może respektować ustawienia dotyczące optional steps, repair limits, loop limits, task execution i output directories.
FR35: System może pinować wersję Stepper dla projektu.
FR36: System może wykryć lokalne zmiany w plikach Stepper przed aktualizacją assets.
FR37: Użytkownik może zobaczyć plan zmian przed nadpisaniem plików projektu.
FR38: Użytkownik może znaleźć first-run path opisujący konfigurację, dry-run, wykonanie jednego kroku i recovery guidance.
FR39: Użytkownik może znaleźć command reference dla wszystkich opcji `/bmad-next` i `/bmad-loop`.
FR40: Użytkownik może znaleźć przykłady dla preview, scoped execution, story loop, skip optional steps i reconcile.
FR41: System może wyjaśnić ograniczenie gwarancji: artefakty dowodzą ukończenia workflow, nie semantycznej jakości decyzji.
FR42: Maintainer może utrzymywać schematy config, state i step contract jako audytowalną część produktu.
FR43: Użytkownik może prześledzić run records, task outputs i review/fix history w plikach projektu.

### NonFunctional Requirements

NFR1: Stepper musi zatrzymać wykonanie zamiast kontynuować, gdy nie może jednoznacznie potwierdzić następnego bezpiecznego kroku.
NFR2: Każdy konflikt między `.bmad-stepper/state.yaml` a artefaktami musi skutkować reconcile reportem przed dalszą automatyzacją.
NFR3: Każde przerwane lub nieukończone wykonanie musi mieć możliwą do zrozumienia ścieżkę resume, restart, abandon albo reconcile.
NFR4: Repair i loop limits muszą być jawne w konfiguracji i widoczne w raportach zatrzymania.
NFR5: Dry-run output musi pokazywać selected step, planned tasks, expected outputs, evidence, stop conditions i conflicts przed modyfikacją plików.
NFR6: Stop reports muszą wyjaśniać, co system próbował zrobić, co wykrył, dlaczego się zatrzymał i jaki następny krok rekomenduje.
NFR7: Dokumentacja musi jasno komunikować, że artefakty dowodzą ukończenia workflow, ale nie gwarantują semantycznej jakości decyzji lub implementacji.
NFR8: Komendy muszą deklarować możliwe state changes i file mutation scope.
NFR9: State updates mogą zostać zapisane dopiero po potwierdzeniu wymaganych evidence dla kroku.
NFR10: Task outputs, failure reports i review/fix iterations muszą być możliwe do prześledzenia w plikach projektu.
NFR11: Run records muszą zachować wystarczający kontekst, aby użytkownik mógł zrozumieć, co zostało wykonane po przerwaniu sesji.
NFR12: Aktualizacje plugin assets muszą wykrywać lokalne zmiany przed nadpisaniem plików projektu.
NFR13: Główny kontekst wykonania musi preferować plan, status i podsumowania, a szczegóły tasków przechowywać w run/task records.
NFR14: Stepper musi traktować BMAD Method jako prerequisite i zatrzymać się z diagnozą, gdy wymagane pliki BMAD nie istnieją.
NFR15: Stepper nie może wykonywać fully automatic state repair bez potwierdzenia użytkownika.
NFR16: Task sub-agenty w v1 muszą działać sekwencyjnie, aby ograniczyć konflikty plików i niejawne zależności.
NFR17: Out-of-scope file mutations muszą zatrzymać krok lub wymagać jawnej akceptacji użytkownika.
NFR18: Persona drift musi być wykrywalny przez task self-check i walidację outputu.
NFR19: V1 musi pozostać prompt-first i script-light, dopóki executable validation, fixture tests, generated docs lub release automation nie uzasadnią runtime.
NFR20: Dokumentacja, schematy, szablony i command specs muszą być utrzymywane spójnie.
NFR21: Schematy config, state i step contract muszą być czytelne dla maintainera i użyteczne jako audytowalny kontrakt.
NFR22: Project-pinned Stepper behavior musi chronić repo przed niekontrolowanymi zmianami zachowania po update pluginu.
NFR23: Dry-run powinien być wystarczająco szybki, aby użytkownik traktował go jako normalny pierwszy krok przed wykonaniem pracy, a nie jako ciężką diagnostykę.
NFR24: Step selection i state/artifact comparison powinny ograniczać wczytywany kontekst do tego, co potrzebne dla bieżącego kroku.
NFR25: Długie operacje loop muszą raportować postęp przez run/task records, aby przerwanie sesji nie utraciło kontekstu.

### Additional Requirements

- V1 must be delivered as a Claude Code plugin, not a standalone CLI.
- Stepper must not install BMAD Method; it must diagnose missing BMAD prerequisites and stop.
- V1 must remain prompt-first and script-light, with TypeScript/Bun deferred until executable validation, fixture tests, generated docs, or release automation justify it.
- Task sub-agents must execute sequentially in v1.
- Optional BMAD steps must run by default unless `--skip-optional` is requested.
- `.bmad-stepper/state.yaml` must be treated as an index, not the source of truth.
- Artifacts and frontmatter must be treated as proof of completion.
- State/artifact conflicts must become explicit user checkpoints with interactive repair.
- Interrupted or repeated commands must inspect existing evidence before retrying or rerunning.
- Command specs and step contracts must declare expected mutations and stop on unexpected changes.
- Run records, task outputs, failure reports, and review/fix iterations must explain what happened.
- The main thread should remain an orchestrator while detailed task work is stored in run/task records.
- Project-pinned behavior and update plans must protect local project modifications.
- The likely architectural components are command specs, project configuration, state index, step contract schema, artifact/evidence resolver, task orchestration model, run/task record structure, and documentation/templates.

### UX Design Requirements

No UX Design document was found during prerequisite validation.

### FR Coverage Map

FR1: Epic 1 - Preview the next BMAD step without mutating project files.
FR2: Epic 1 - Detect the nearest unfinished BMAD step from workflow, state, and artifacts.
FR3: Epic 1 - Show required inputs, expected outputs, completion criteria, and stop conditions.
FR4: Epic 1 - Scope step selection by epic, story, phase, or step.
FR5: Epic 1 - Diagnose missing BMAD prerequisite files before execution.
FR6: Epic 2 - Execute exactly one BMAD step through `/bmad-next`.
FR7: Epic 2 - Load persona, instructions, inputs, outputs, tasks, done criteria, and transitions.
FR8: Epic 2 - Treat each step as a transaction with state updates only after evidence passes.
FR9: Epic 2 - Run optional steps by default unless `--skip-optional` is requested.
FR10: Epic 2 - Stop a single step on missing inputs, ambiguous completion, or human decisions.
FR11: Epic 3 - Run a sequence of BMAD steps through `/bmad-loop`.
FR12: Epic 3 - Target loops by next story, story, story range, epic, phase, or step.
FR13: Epic 3 - Repeat `/bmad-next` until an explicit stop target is reached.
FR14: Epic 3 - Stop loops after configured step limits.
FR15: Epic 3 - Stop loops on checkpoints, failed validation, repair limits, missing inputs, and ambiguous completion.
FR16: Epic 3 - Report why a loop stopped and recommend the next safe action.
FR17: Epic 4 - Use `.bmad-stepper/state.yaml` as the active workflow index.
FR18: Epic 4 - Compare stored state with evidence in project artifacts.
FR19: Epic 4 - Detect conflicts between state and frontmatter, files, outputs, tests, or review results.
FR20: Epic 4 - Trigger interactive reconcile when state and artifacts disagree.
FR21: Epic 4 - Let the user choose update state, trust artifacts, rerun step, skip step, or diagnostic.
FR22: Epic 4 - Refuse continuation when the next safe step cannot be proven.
FR23: Epic 4 - Detect unfinished runs and offer resume, restart, abandon, or reconcile.
FR24: Epic 4 - Re-enter steps idempotently by checking existing artifacts before retry or rerun.
FR25: Epic 2 - Run task sub-agents sequentially within a step.
FR26: Epic 2 - Pass one task output as explicit input to the next task.
FR27: Epic 2 - Require each task to produce its declared output.
FR28: Epic 2 - Validate task output for presence, required sections, contract compliance, and mutation scope.
FR29: Epic 2 - Require task self-checks for persona, read inputs, produced outputs, and scope.
FR30: Epic 2 - Retry task output repair up to the configured limit.
FR31: Epic 2 - Write failure reports when task contracts remain unsatisfied after repair limits.
FR32: Epic 5 - Configure Stepper through `.bmad-stepper/config.yaml`.
FR33: Epic 5 - Read the state template from `.bmad-stepper/state.yaml`.
FR34: Epic 5 - Respect settings for optional steps, repair limits, loop limits, task execution, and output directories.
FR35: Epic 5 - Pin the Stepper version for a project.
FR36: Epic 5 - Detect local changes in Stepper files before asset updates.
FR37: Epic 5 - Show a change plan before overwriting project files.
FR38: Epic 1 - Provide first-run documentation for configuration, dry-run, single-step execution, and recovery guidance.
FR39: Epic 1 - Provide command reference for all `/bmad-next` and `/bmad-loop` options.
FR40: Epic 1 - Provide examples for preview, scoped execution, story loop, skip optional steps, and reconcile.
FR41: Epic 1 - Explain the guarantee boundary around artifact evidence versus semantic quality.
FR42: Epic 5 - Maintain config, state, and step contract schemas as auditable product artifacts.
FR43: Epic 5 - Let users trace run records, task outputs, and review/fix history in project files.

## Epic List

### Epic 1: Preview and Trust the Next BMAD Step

Users can configure Stepper enough to run `/bmad-next --dry-run`, diagnose BMAD prerequisites, see the selected next step, and understand expected inputs, outputs, evidence, stop conditions, and scope before any mutation.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR38, FR39, FR40, FR41

### Epic 2: Execute One BMAD Step Safely

Users can run `/bmad-next` for exactly one workflow step, with persona/task loading, optional-step behavior, transactional state updates, sequential task execution, output validation, retry limits, and failure reporting.
**FRs covered:** FR6, FR7, FR8, FR9, FR10, FR25, FR26, FR27, FR28, FR29, FR30, FR31

### Epic 3: Run Controlled BMAD Loops

Users can run `/bmad-loop` toward explicit targets such as next story, story, story range, epic, phase, or step, while respecting max steps, repair limits, checkpoints, missing inputs, ambiguous completion, and stop reports.
**FRs covered:** FR11, FR12, FR13, FR14, FR15, FR16

### Epic 4: Recover from State and Artifact Conflicts

Users can trust Stepper across interrupted sessions and manual artifact edits because it treats state as an index, compares it with artifact evidence, detects conflicts, offers interactive reconcile choices, and refuses unsafe continuation.
**FRs covered:** FR17, FR18, FR19, FR20, FR21, FR22, FR23, FR24

### Epic 5: Maintain Project Assets and Auditability

Users and maintainers can configure project-pinned Stepper behavior, protect local changes during updates, maintain schemas and templates, and trace run records, task outputs, and review/fix history.
**FRs covered:** FR32, FR33, FR34, FR35, FR36, FR37, FR42, FR43

## Epic 1: Preview and Trust the Next BMAD Step

Users can configure Stepper enough to run `/bmad-next --dry-run`, diagnose BMAD prerequisites, see the selected next step, and understand expected inputs, outputs, evidence, stop conditions, and scope before any mutation.

### Story 1.1: Define First-Run Configuration and Prerequisite Diagnostics

As a solo developer,
I want Stepper to define the minimum first-run setup and diagnose missing BMAD prerequisites,
So that I can know whether `/bmad-next --dry-run` can safely evaluate my project.

**Acceptance Criteria:**

**Given** a target project where Stepper is being used for the first time
**When** the user follows the first-run setup guidance
**Then** the required `.bmad-stepper/config.yaml` and `.bmad-stepper/state.yaml` expectations are clear
**And** the documentation explains that BMAD Method must already be installed.

**Given** required BMAD files are missing from the target project
**When** `/bmad-next --dry-run` is specified
**Then** the command spec requires Stepper to stop before selecting or executing a workflow step
**And** the diagnostic output identifies the missing prerequisite category and recommended repair.

**Given** BMAD prerequisites appear present
**When** `/bmad-next --dry-run` is specified
**Then** the command spec allows Stepper to continue into workflow/state/artifact inspection
**And** no project files are modified during this prerequisite check.

**Given** a maintainer reviews the command and docs
**When** they compare prerequisite behavior across README, command reference, and examples
**Then** the behavior is consistent and does not imply Stepper installs BMAD Method.

### Story 1.2: Specify Dry-Run Step Selection and Scoped Targeting

As a solo developer,
I want `/bmad-next --dry-run` to select the next BMAD step from workflow, state, and artifacts with optional scope filters,
So that I can preview the right next action without manually reconstructing workflow state.

**Acceptance Criteria:**

**Given** a project with Stepper config, state, and BMAD workflow artifacts
**When** the user runs `/bmad-next --dry-run` without filters
**Then** the command spec requires Stepper to identify the nearest unfinished BMAD step using workflow order, `.bmad-stepper/state.yaml`, and artifact evidence
**And** the result explains which inputs were used for selection.

**Given** the user provides `--epic`, `--story`, `--phase`, or `--step`
**When** `/bmad-next --dry-run` evaluates the project
**Then** step selection is constrained to the requested scope
**And** the preview reports the active scope filter.

**Given** the requested scope does not match a known workflow target
**When** dry-run selection occurs
**Then** Stepper stops without mutation
**And** the output explains that the requested target could not be resolved.

**Given** `.bmad-stepper/state.yaml` and artifact evidence disagree
**When** dry-run selection attempts to choose a step
**Then** Stepper does not silently trust state alone
**And** the output identifies the conflict as a blocker for safe step selection.

### Story 1.3: Specify Dry-Run Preview Output and Trust Boundary

As a solo developer,
I want dry-run output to show the selected step, planned work, evidence, stop conditions, conflicts, and mutation scope,
So that I can decide whether it is safe to let Stepper execute the next BMAD step.

**Acceptance Criteria:**

**Given** `/bmad-next --dry-run` selects a candidate step
**When** the preview is rendered
**Then** it shows the selected step identity, required inputs, expected outputs, planned tasks, completion evidence, stop conditions, and possible conflicts
**And** it clearly states that no project files were modified.

**Given** the selected step has declared output artifacts or frontmatter evidence
**When** dry-run preview is rendered
**Then** the preview lists the evidence Stepper will require before treating the step as complete
**And** the preview distinguishes existing evidence from missing evidence.

**Given** the selected step may mutate files during real execution
**When** dry-run preview is rendered
**Then** the preview declares the expected file mutation scope
**And** it identifies mutations outside that scope as stop-or-confirm conditions.

**Given** the user reads the dry-run preview
**When** they compare the preview against the docs
**Then** the docs explain that artifact evidence proves workflow completion, not semantic quality of product or implementation decisions
**And** the examples reinforce that human review remains part of trust.

### Story 1.4: Document First-Run Path, Command Reference, and Core Examples

As a solo developer,
I want concise docs for first-run setup, command options, and common dry-run workflows,
So that I can adopt Stepper without guessing how preview and recovery are supposed to work.

**Acceptance Criteria:**

**Given** a new user opens the README or first-run docs
**When** they follow the initial path
**Then** the docs show configuration, prerequisite confirmation, `/bmad-next --dry-run`, single-step execution, and recovery guidance in order
**And** the docs identify which files the user should expect to create or inspect.

**Given** a user opens the command reference
**When** they inspect `/bmad-next` and `/bmad-loop`
**Then** every v1 option from the PRD is listed with its intent, inputs, outputs, state changes, mutation scope, stop conditions, and failure behavior.

**Given** a user opens the examples
**When** they review preview, scoped execution, story loop, skip optional, and reconcile examples
**Then** each example explains what Stepper checks, why it may stop, and the next safe action.

**Given** a maintainer changes command behavior
**When** they update docs
**Then** README, command reference, and examples remain consistent about dry-run behavior and the trust boundary.

## Epic 2: Execute One BMAD Step Safely

Users can run `/bmad-next` for exactly one workflow step, with persona/task loading, optional-step behavior, transactional state updates, sequential task execution, output validation, retry limits, and failure reporting.

### Story 2.1: Specify Single-Step Transaction Execution

As a solo developer,
I want `/bmad-next` to execute exactly one selected BMAD step as a transaction,
So that workflow progress is recorded only when the required evidence proves the step is complete.

**Acceptance Criteria:**

**Given** `/bmad-next` has selected a step
**When** execution begins
**Then** the command spec requires Stepper to load the step persona, instructions, inputs, outputs, tasks, done criteria, review policy, and next transitions
**And** the command executes no more than the selected step.

**Given** the selected step is optional
**When** the user does not pass `--skip-optional`
**Then** Stepper includes the optional step in normal execution
**And** the run record notes that default optional-step behavior was used.

**Given** the selected step reaches its done criteria
**When** required artifacts or frontmatter evidence are present
**Then** Stepper may update `.bmad-stepper/state.yaml`
**And** the update records the completed step and supporting evidence.

**Given** required inputs are missing, completion is ambiguous, or a human decision is needed
**When** `/bmad-next` executes
**Then** Stepper stops without marking the step complete
**And** the stop report explains what blocked the transaction.

### Story 2.2: Specify Sequential Task Sub-Agent Orchestration

As a solo developer,
I want Stepper to run task sub-agents sequentially within a BMAD step,
So that task dependencies are explicit and file conflicts are easier to reason about.

**Acceptance Criteria:**

**Given** a step declares multiple tasks
**When** `/bmad-next` executes the step
**Then** Stepper starts the tasks one at a time in declared order
**And** it does not run v1 task sub-agents in parallel.

**Given** a task produces an output used by a later task
**When** the next task begins
**Then** Stepper passes the prior output as an explicit input
**And** the task record identifies the source output.

**Given** a task sub-agent completes
**When** Stepper records the result
**Then** the task output includes a self-check for persona used, inputs read, outputs produced, and scope respected
**And** missing self-check information is treated as a validation problem.

**Given** a task cannot start because a prior task failed validation
**When** Stepper evaluates the task pipeline
**Then** later tasks are not started
**And** the stop report identifies the failed upstream task.

### Story 2.3: Validate Task Outputs and Mutation Scope

As a solo developer,
I want each task output to be validated against its declared contract and mutation scope,
So that plausible but contractually invalid work does not advance the workflow.

**Acceptance Criteria:**

**Given** a task declares one or more required outputs
**When** the task completes
**Then** Stepper verifies that each declared output exists
**And** missing outputs prevent the step from being marked complete.

**Given** a task output requires specific sections or metadata
**When** validation runs
**Then** Stepper checks for required sections, frontmatter, or other contract markers
**And** reports which required element is missing or invalid.

**Given** a task changes files outside its declared mutation scope
**When** Stepper validates the task
**Then** the step stops or requires explicit user approval before proceeding
**And** the unexpected mutations are listed in the report.

**Given** all task outputs satisfy their contracts
**When** Stepper evaluates step completion
**Then** those outputs can be used as completion evidence for the step transaction.

### Story 2.4: Specify Repair Limits and Failure Reports

As a solo developer,
I want Stepper to retry repair only within configured limits and produce a failure report when repair cannot satisfy the contract,
So that failed automation leaves an auditable explanation instead of silent drift.

**Acceptance Criteria:**

**Given** a task output fails validation
**When** repair is allowed by configuration
**Then** Stepper may request a repair attempt up to the configured repair limit
**And** each attempt is recorded.

**Given** a repair attempt succeeds
**When** validation passes after the repair
**Then** Stepper can continue the current step
**And** the run record notes the repair history.

**Given** repair attempts reach the configured limit
**When** the task output still fails validation
**Then** Stepper writes a failure report
**And** the step remains incomplete.

**Given** the user reviews a failure report
**When** they inspect the report
**Then** it explains the failed task, expected contract, actual output, attempted repairs, changed files, and recommended next action.

## Epic 3: Run Controlled BMAD Loops

Users can run `/bmad-loop` toward explicit targets such as next story, story, story range, epic, phase, or step, while respecting max steps, repair limits, checkpoints, missing inputs, ambiguous completion, and stop reports.

### Story 3.1: Define Loop Targets and Dry-Run Planning

As a solo developer,
I want `/bmad-loop` to accept explicit loop targets and preview the planned path,
So that I can bound automation before it starts repeating workflow steps.

**Acceptance Criteria:**

**Given** the user runs `/bmad-loop --until next-story`
**When** Stepper parses the command
**Then** it resolves the target to the next story boundary
**And** reports that target in the loop plan.

**Given** the user runs `/bmad-loop --until story:<id>`, `story-range:<start>-<end>`, `epic:<id>`, `phase:<name>`, or `step:<id>`
**When** Stepper parses the command
**Then** it resolves the requested target type and value
**And** rejects unknown or malformed targets without mutation.

**Given** the user includes `--dry-run`
**When** loop planning runs
**Then** Stepper previews the selected target, likely step sequence, expected outputs, stop conditions, and limits
**And** does not execute steps.

**Given** the target cannot be proven from workflow, state, and artifacts
**When** loop planning runs
**Then** Stepper stops with a diagnostic
**And** recommends how to clarify or repair the target.

### Story 3.2: Repeat `/bmad-next` Within Loop Limits

As a solo developer,
I want `/bmad-loop` to repeat the same safe single-step transaction until the explicit target or a limit is reached,
So that loop automation remains bounded and understandable.

**Acceptance Criteria:**

**Given** a valid loop target and no dry-run flag
**When** `/bmad-loop` starts
**Then** Stepper executes work by repeatedly invoking the `/bmad-next` transaction model
**And** each iteration records the selected step and result.

**Given** the loop reaches its explicit target
**When** the final required step is complete
**Then** Stepper stops the loop successfully
**And** the summary explains which target was reached.

**Given** the loop reaches `--max-steps` or the configured default step limit
**When** another step would be needed
**Then** Stepper stops before executing more work
**And** the stop report explains that the step limit was reached.

**Given** the user passes `--skip-optional`
**When** the loop encounters optional steps
**Then** Stepper skips optional steps according to the command contract
**And** records which optional steps were skipped.

### Story 3.3: Report Loop Stop Conditions and Next Actions

As a solo developer,
I want loop execution to stop clearly on checkpoints, validation failures, repair limits, missing inputs, and ambiguous completion,
So that I know why automation stopped and how to continue safely.

**Acceptance Criteria:**

**Given** a human checkpoint is encountered
**When** `/bmad-loop` is running
**Then** Stepper stops before proceeding
**And** the stop report explains the decision required from the user.

**Given** a step fails validation or reaches repair limits
**When** loop execution evaluates the result
**Then** the loop stops
**And** the report links the failure to the specific step or task record.

**Given** a required input is missing or completion evidence is ambiguous
**When** the loop attempts to continue
**Then** Stepper stops instead of guessing
**And** the report recommends the next safe command or repair action.

**Given** a loop stops for any reason
**When** the user reads the stop report
**Then** it states what Stepper tried, what it detected, why it stopped, and what the recommended next move is.

## Epic 4: Recover from State and Artifact Conflicts

Users can trust Stepper across interrupted sessions and manual artifact edits because it treats state as an index, compares it with artifact evidence, detects conflicts, offers interactive reconcile choices, and refuses unsafe continuation.

### Story 4.1: Treat State as an Index Backed by Artifact Evidence

As a solo developer,
I want Stepper to compare `.bmad-stepper/state.yaml` with artifact evidence before continuing,
So that resumed workflow state is grounded in files rather than stale memory.

**Acceptance Criteria:**

**Given** `.bmad-stepper/state.yaml` indicates the current workflow position
**When** Stepper evaluates the next action
**Then** it treats state as an index
**And** verifies relevant artifacts, frontmatter, task outputs, tests, or review results before trusting it.

**Given** artifact evidence confirms the indexed state
**When** Stepper selects the next step
**Then** it may proceed from the indexed position
**And** the preview or run record identifies the evidence used.

**Given** artifact evidence is missing or incomplete
**When** Stepper compares state and artifacts
**Then** it does not mark the prior step as proven
**And** it reports the missing evidence.

**Given** the same command is rerun after an interruption
**When** Stepper inspects existing artifacts
**Then** it avoids duplicating proven completed work
**And** it identifies the next unproven step.

### Story 4.2: Detect Conflicts and Refuse Unsafe Continuation

As a solo developer,
I want Stepper to detect conflicts between state and artifacts and refuse unsafe continuation,
So that workflow automation does not proceed from false assumptions.

**Acceptance Criteria:**

**Given** state says a step is complete but artifact frontmatter says it is incomplete
**When** Stepper evaluates progress
**Then** it identifies a state/artifact conflict
**And** stops before selecting a downstream step.

**Given** expected output files are missing, tests disagree, or review results contradict state
**When** Stepper compares evidence
**Then** it reports the conflicting evidence sources
**And** classifies the conflict as blocking safe continuation.

**Given** Stepper cannot prove the next safe step
**When** `/bmad-next` or `/bmad-loop` runs
**Then** it refuses to continue automatically
**And** the output explains what proof is missing.

**Given** conflict detection runs during dry-run
**When** conflicts exist
**Then** no project files are modified
**And** the dry-run report recommends reconcile or diagnostic action.

### Story 4.3: Provide Interactive Reconcile Choices

As a solo developer,
I want an interactive reconcile flow when state and artifacts disagree,
So that I can choose how to repair or proceed with full context.

**Acceptance Criteria:**

**Given** a state/artifact conflict is detected
**When** Stepper enters reconcile mode
**Then** it shows what state says, what artifacts say, and why they disagree
**And** it recommends a safe default action.

**Given** reconcile choices are presented
**When** the user selects update state, trust artifacts, rerun step, skip step, or diagnostic
**Then** Stepper follows the selected path only after user confirmation
**And** records the choice in the run or repair record.

**Given** a repair choice would mutate state or files
**When** the user has not confirmed it
**Then** Stepper does not apply the repair automatically
**And** the prompt explains the pending mutation.

**Given** diagnostic mode is selected
**When** Stepper inspects the conflict
**Then** it produces a report of evidence sources and possible repair paths
**And** does not change workflow state.

### Story 4.4: Handle Interrupted Runs and Idempotent Re-Entry

As a solo developer,
I want Stepper to detect unfinished runs and re-enter steps idempotently,
So that interruption does not force me to guess whether to resume, restart, abandon, or reconcile.

**Acceptance Criteria:**

**Given** a prior run was interrupted before completion
**When** the user invokes Stepper again
**Then** Stepper detects the unfinished run
**And** offers resume, restart, abandon, or reconcile.

**Given** the user chooses resume
**When** Stepper re-enters the step
**Then** it checks existing artifacts before retrying work
**And** it continues only from unproven or incomplete outputs.

**Given** the user chooses restart or abandon
**When** Stepper applies the choice
**Then** it records the decision
**And** preserves enough context for later audit.

**Given** existing artifacts partially satisfy a step
**When** Stepper prepares a retry or rerun
**Then** it identifies which evidence can be reused
**And** which work must be regenerated or repaired.

## Epic 5: Maintain Project Assets and Auditability

Users and maintainers can configure project-pinned Stepper behavior, protect local changes during updates, maintain schemas and templates, and trace run records, task outputs, and review/fix history.

### Story 5.1: Define Config and State Templates

As a solo developer,
I want clear `.bmad-stepper/config.yaml` and `.bmad-stepper/state.yaml` templates,
So that Stepper behavior and workflow position are explicit and auditable.

**Acceptance Criteria:**

**Given** a user initializes Stepper assets
**When** they inspect the config template
**Then** it documents settings for optional steps, repair limits, loop limits, task execution, and output directories
**And** the schema describes valid values.

**Given** a user inspects the state template
**When** they compare it with the state schema
**Then** the template represents the active workflow index clearly
**And** it does not imply that state is stronger evidence than artifacts.

**Given** command specs read configuration
**When** a setting affects execution
**Then** the command docs explain how the setting changes behavior
**And** the examples use the same terms as the templates and schemas.

**Given** config or state is invalid
**When** Stepper evaluates the project
**Then** it stops with a validation-oriented diagnostic
**And** recommends a repair path.

### Story 5.2: Protect Project-Pinned Assets During Updates

As a project maintainer,
I want Stepper to pin project behavior and show update plans before overwriting assets,
So that plugin updates do not silently destroy local workflow changes.

**Acceptance Criteria:**

**Given** a project pins a Stepper version
**When** Stepper reads project assets
**Then** it can identify the pinned version
**And** explain how that pin affects expected behavior.

**Given** a newer plugin version has changed command specs, schemas, templates, or docs
**When** an asset update is considered
**Then** Stepper detects local changes before overwriting files
**And** distinguishes new upstream changes from project-local modifications.

**Given** local changes exist
**When** Stepper prepares an update
**Then** it presents a change plan before mutation
**And** requires user confirmation for overwrites.

**Given** the user rejects or defers an update item
**When** the update flow completes
**Then** local files remain unchanged for that item
**And** the decision is captured for audit.

### Story 5.3: Maintain Schemas and Run Audit Records

As a maintainer,
I want schemas and run records to stay consistent with command behavior,
So that Stepper remains reviewable as a prompt-first product surface.

**Acceptance Criteria:**

**Given** command behavior changes
**When** schemas are reviewed
**Then** `config.schema.json`, `state.schema.json`, and `step.schema.json` are updated or explicitly confirmed unchanged
**And** docs, templates, and command specs remain consistent.

**Given** Stepper executes a step or loop
**When** run records are written
**Then** they preserve selected step, inputs, task outputs, validation results, repairs, failures, and review/fix history
**And** they contain enough context to understand the run after interruption.

**Given** detailed task records exist
**When** the main conversation or summary references progress
**Then** the main context can prefer plan, status, and summaries
**And** detailed evidence remains available in run/task records.

**Given** a user or reviewer audits the repository
**When** they inspect docs, schemas, templates, and run records
**Then** they can trace how behavior is specified and how completed workflow steps were proven.
