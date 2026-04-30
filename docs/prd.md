---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-02b-vision
  - step-02c-executive-summary
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-06-innovation
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
  - step-12-complete
inputDocuments:
  - docs/product-brief-bmad-stepper.md
  - docs/brainstorming/brainstorming-session-2026-04-29-1657.md
  - docs/architecture.md
  - docs/command-reference.md
  - docs/examples.md
workflowType: prd
releaseMode: single-release
status: complete
completed: "2026-04-29"
documentCounts:
  productBriefs: 1
  research: 0
  brainstorming: 1
  projectDocs: 3
classification:
  projectType: developer_tool
  domain: general / developer workflow automation
  complexity: low domain complexity, medium implementation complexity
  projectContext: brownfield
---

# Product Requirements Document - BMAD Stepper

**Author:** tgorka
**Date:** 2026-04-29

## Executive Summary

BMAD Stepper jest prompt-first pluginem Claude Code dla solo developerów używających BMAD Method, którzy chcą przechodzić przez workflow BMAD bez ręcznego sterowania każdym krokiem, personą, kontekstem i zadaniem. Produkt zmienia Claude Code z wykonawcy pojedynczych promptów w kontrolowanego operatora procesu BMAD: wybiera następny krok, ładuje właściwy kontekst, uruchamia zadania w sekwencyjnych sub-agentach, waliduje oczekiwane artefakty, aktualizuje stan i zatrzymuje się, gdy potrzebna jest decyzja człowieka.

Główny problem nie polega na braku możliwości wykonania pojedynczego zadania przez agenta. Problemem jest koszt koordynacji między krokami: developer musi pamiętać stan workflow, wybierać właściwą rolę, pilnować kryteriów ukończenia, wykrywać rozjazdy między stanem a plikami i decydować, czy automatyzacja może bezpiecznie iść dalej. BMAD Stepper redukuje ten koszt przez dwa polecenia: `/bmad-next`, które wykonuje jeden atomowy krok BMAD, oraz `/bmad-loop`, które powtarza te kroki do jawnego warunku stopu.

### What Makes This Special

Wyróżnikiem BMAD Stepper nie jest maksymalna autonomia, tylko dowodowo kontrolowane tempo. Każdy krok jest traktowany jak mała transakcja workflow: workflow wskazuje intencję i kolejność, ale artefakty decydują, czy krok jest ukończony. `.bmad-stepper/state.yaml` pełni rolę indeksu do wznowienia pracy, nie źródła prawdy absolutnej. Frontmatter, pliki, diffy, testy, review outputy i zadeklarowane artefakty są dowodem postępu.

To podejście rozwiązuje kluczowy problem zaufania w agentic workflow. `/bmad-loop` nie jest autopilotem bez hamulców: zatrzymuje się na checkpointach człowieka, brakujących inputach, niejednoznacznym ukończeniu, konfliktach stanu z artefaktami, błędach walidacji, przekroczonych limitach naprawy i limitach pętli. Flagowy moment zaufania to `--dry-run`, który pokazuje wybrane kroki, oczekiwane outputy, dowody, stop conditions i konflikty przed modyfikacją plików.

## Project Classification

BMAD Stepper jest narzędziem developerskim i pluginem Claude Code, działającym w domenie automatyzacji workflow dla BMAD Method. Projekt ma kontekst brownfield: istnieją już brief, brainstorming, architektura, command reference, przykłady, schematy, szablony i specyfikacje komend. Domenowo złożoność jest niska, ponieważ produkt nie działa w regulowanej branży, ale implementacyjnie złożoność jest średnia ze względu na orkiestrację kroków, walidację artefaktów, naprawę konfliktów stanu, sekwencyjne sub-agenty i wymaganie przewidywalnych warunków stopu.

## Success Criteria

### User Success

Solo developer może uruchomić `/bmad-next --dry-run`, zrozumieć wybrany krok, oczekiwane artefakty, dowody ukończenia i warunki stopu bez ręcznego rekonstruowania stanu BMAD workflow.

Użytkownik czuje ulgę w momencie, gdy `/bmad-loop --until story:<id>` przechodzi przez kolejne kroki BMAD bez prompt-by-prompt koordynacji, ale zatrzymuje się czytelnie, gdy potrzebna jest decyzja człowieka, naprawa stanu lub walidacja wyniku.

Użytkownik może przerwać sesję, wrócić do projektu i zaufać, że Stepper porówna `.bmad-stepper/state.yaml` z artefaktami, zamiast ślepo kontynuować z potencjalnie nieaktualnego indeksu.

### Business Success

W ciągu pierwszych 3 miesięcy v1 powinien udowodnić, że dla realnego użytkownika BMAD zmniejsza liczbę ręcznych promptów potrzebnych do przejścia przez typowy zakres pracy, np. wykonanie jednej story lub bounded planning flow.

W ciągu 12 miesięcy sukces oznacza, że BMAD Stepper staje się domyślnym sposobem prowadzenia BMAD Method w Claude Code dla użytkowników, którzy chcą kontrolowanego momentum zamiast ręcznego sterowania sesją.

Najważniejszym sygnałem biznesowym nie jest sama liczba uruchomień komend, tylko powtarzalne użycie `/bmad-loop` i `--dry-run`: użytkownicy wracają do narzędzia, bo rozumieją, co zrobi, dlaczego się zatrzymało i jak bezpiecznie kontynuować.

### Technical Success

`/bmad-next` wykonuje dokładnie jeden krok workflow jako transakcję: ładuje konfigurację, sprawdza BMAD prerequisites, porównuje stan z artefaktami, wybiera krok, uruchamia zadania sekwencyjnie, waliduje outputy i aktualizuje stan dopiero po spełnieniu kryteriów.

`/bmad-loop` powtarza `/bmad-next` do jawnego warunku stopu i respektuje limity pętli, limity naprawy, checkpointy człowieka, brakujące inputy, niejednoznaczne completion evidence i błędy walidacji.

Prompt-first v1 pozostaje script-light: dokumentacja, schematy, szablony i specyfikacje komend są spójne, a TypeScript/Bun pojawia się dopiero wtedy, gdy potrzebne będą wykonywalne walidacje, fixture tests, generowanie docs lub release automation.

### Measurable Outcomes

- First-run: użytkownik może skonfigurować Stepper, uruchomić `/bmad-next --dry-run` i zrozumieć planowany następny krok w kilka minut.
- Trust: każdy dry run pokazuje selected step, expected outputs, evidence, stop conditions i conflicts przed modyfikacją plików.
- Recovery: konflikt między `.bmad-stepper/state.yaml` a artefaktami kończy się interaktywnym reconcile reportem, a nie cichą kontynuacją.
- Loop safety: `/bmad-loop` zawsze zatrzymuje się na checkpointach, failed validation, missing inputs, repair limits i max step limit.
- Auditability: task outputs, review/fix iterations i run records są możliwe do prześledzenia przez pliki w `.bmad-stepper/runs`.

## Product Scope

### MVP - Minimum Viable Product

MVP obejmuje specyfikacje slash commands `/bmad-next` i `/bmad-loop`, szablony `.bmad-stepper/config.yaml` oraz `.bmad-stepper/state.yaml`, schemat kontraktu kroku, dokumentację first-run, dry-run preview, interactive reconcile i sekwencyjne task sub-agents.

MVP musi pokazać kontrolowane wykonanie jednego kroku oraz bounded loop do warunku stopu. Musi też jasno diagnozować brak BMAD Method, ponieważ Stepper zakłada BMAD jako prerequisite i nie powinien działać na niepewnych założeniach.

### Growth Features (Post-MVP)

Po MVP warto rozwinąć executable validation, fixture tests, generated docs, bogatszy run ledger, lepsze raporty review/fix loop oraz version-aware plugin updates chroniące lokalne zmiany w projekcie.

Growth scope może też obejmować wygodniejsze komendy diagnostyczne i większą automatyzację release workflow, jeśli prompt-first specyfikacje zaczną być niewystarczające.

### Vision (Future)

Docelowo BMAD Stepper staje się zaufanym execution companion dla BMAD Method w Claude Code: narzędziem, które prowadzi przez planning, story execution, review/fix loops i handoffy, zachowując audytowalność, kontrolę człowieka i dowodowe kryteria ukończenia.

## User Journeys

### Journey 1: Solo Developer Previewing the Next BMAD Step

Marta pracuje wieczorem nad projektem prowadzonym BMAD Method. Ma brief, architecture doc i kilka story notes, ale po przerwie nie pamięta dokładnie, gdzie workflow się zatrzymał. Nie chce pytać agenta ogólnie "co dalej?", bo wie, że model może zgadnąć na podstawie rozmowy, a nie plików.

Uruchamia `/bmad-next --dry-run`. Stepper ładuje konfigurację, sprawdza BMAD prerequisites, czyta `.bmad-stepper/state.yaml`, porównuje stan z artefaktami i pokazuje wybrany krok, wymagane inputy, spodziewane outputy, kryteria ukończenia oraz możliwe stop conditions. Marta widzi, że następny krok jest sensowny i że Stepper nie zmodyfikuje plików bez wykonania właściwej transakcji.

Moment wartości pojawia się, gdy Marta rozumie plan bez ręcznego rekonstruowania workflow. Zamiast zarządzać agentem prompt po prompcie, zatwierdza wykonanie jednego kroku z jasnym zakresem.

Revealed capabilities:
- dry-run preview
- workflow step selection
- BMAD prerequisite diagnostics
- state/artifact comparison
- explicit expected outputs and stop conditions

### Journey 2: Solo Developer Running a Controlled Story Loop

Marta chce skończyć story `2.3`. Normalnie musiałaby sama wybierać kolejne persony, przekazywać kontekst, prosić o review, prosić o fixy i pilnować, czy agent nie pominął opcjonalnego kroku. Tym razem uruchamia `/bmad-loop --until story:2.3`.

Stepper wykonuje serię małych transakcji przez `/bmad-next`. Każdy krok ładuje swój kontrakt, uruchamia task sub-agenty sekwencyjnie, zapisuje outputy i waliduje artefakty przed przejściem dalej. Gdy review/fix loop trafia na limit napraw albo checkpoint wymagający decyzji produktowej, pętla zatrzymuje się z raportem.

Moment wartości pojawia się, gdy Marta widzi postęp bez utraty kontroli. Loop nie udaje pełnej autonomii; robi tyle, ile można udowodnić, i jasno mówi, dlaczego przestał.

Revealed capabilities:
- bounded loop execution
- `--until story:<id>` stop condition
- sequential sub-agent orchestration
- review/fix iteration ledger
- repair and step limits
- human checkpoint stop behavior

### Journey 3: Solo Developer Recovering from State/Artifact Conflict

Marta ręcznie edytowała story artifact po poprzedniej sesji. `.bmad-stepper/state.yaml` wskazuje, że krok jest zakończony, ale frontmatter dokumentu albo brakujący output sugeruje coś innego. Gdy uruchamia `/bmad-next`, Stepper nie kontynuuje automatycznie.

Zamiast tego pokazuje reconcile screen: "state says X, artifacts say Y, recommended action Z". Marta może wybrać update state, trust artifacts, rerun step, skip step albo diagnostic. Czuje, że system chroni ją przed cichym pójściem dalej na fałszywym stanie.

Moment wartości pojawia się, gdy konflikt staje się zrozumiałym checkpointem, a nie ukrytą niespójnością, która popsuje dalsze kroki.

Revealed capabilities:
- conflict detection
- interactive repair
- evidence report
- rerun/skip/update-state options
- safe stop on ambiguous completion

### Journey 4: Project Maintainer Updating Stepper Assets

Tomasz utrzymuje repo, w którym Stepper jest już skonfigurowany. Pojawia się nowa wersja pluginu z poprawionymi command specs i schema updates. Tomasz chce skorzystać z ulepszeń, ale nie chce, żeby globalny update nadpisał lokalne dostosowania `.bmad-stepper/`.

Stepper porównuje globalną wersję, project pin i lokalne zmiany. Zamiast przepisać pliki, pokazuje change plan: które assets są nowe, które się różnią, które lokalne zmiany wymagają potwierdzenia. Tomasz wybiera, co przyjąć teraz, a co zostawić.

Moment wartości pojawia się, gdy aktualizacja workflow jest kontrolowana i audytowalna, a projekt zachowuje repeatability.

Revealed capabilities:
- project-pinned Stepper version
- version-aware updates
- local change detection
- update plan before overwrite
- safe project asset migration

### Journey 5: Troubleshooting a Failed Task Output

Marta uruchamia krok, który deleguje zadanie do sub-agenta. Sub-agent tworzy plik, ale output nie spełnia kontraktu: brakuje wymaganej sekcji albo plik znajduje się poza dozwolonym zakresem. Zwykły agent mógłby uznać odpowiedź za "wystarczająco dobrą". Stepper zatrzymuje krok.

System pokazuje, który task failed, jakie wymaganie nie zostało spełnione, co zostało zmienione i czy może bezpiecznie retry. Po maksymalnej liczbie napraw Stepper zapisuje failure report i oddaje decyzję Marcie.

Moment wartości pojawia się, gdy walidacja chroni workflow przed plausibly-correct, ale kontraktowo błędnym outputem.

Revealed capabilities:
- task output validation
- scoped file mutation policy
- retry up to repair limit
- failure report
- user checkpoint after repeated validation failure

### Journey Requirements Summary

Te journeys ujawniają, że BMAD Stepper potrzebuje pięciu głównych obszarów capability:

1. **Discovery and preview:** ładowanie konfiguracji, wykrywanie BMAD prerequisites, wybór następnego kroku, dry-run preview i raport planu.
2. **Transactional step execution:** kontrakt kroku, sekwencyjne task sub-agenty, output contracts, done criteria i state updates dopiero po walidacji.
3. **Controlled loop execution:** `--until` targets, max step limits, repair limits, optional step policy i zatrzymania na checkpointach.
4. **State and artifact reconciliation:** porównanie indeksu stanu z dowodami w plikach, interactive repair i raporty konfliktów.
5. **Maintainability and auditability:** run records, task ledgers, review/fix history, project-pinned config i version-aware update behavior.

## Innovation & Novel Patterns

### Detected Innovation Areas

BMAD Stepper wprowadza wzorzec "artifact-backed agentic workflow execution" dla BMAD Method. Zamiast traktować agenta jako rozmowę, która pamięta kontekst, produkt traktuje workflow jako serię transakcji: każdy krok ma wejścia, personę, task pipeline, outputy, done criteria, review policy i next transitions.

Najbardziej innowacyjny aspekt to rozdzielenie roli workflow, stanu i artefaktów. Workflow wskazuje intencję i kolejność, `.bmad-stepper/state.yaml` przyspiesza wznowienie pracy, ale artefakty i frontmatter są dowodem ukończenia. To ogranicza fałszywe poczucie bezpieczeństwa, które pojawia się, gdy agent kontynuuje tylko dlatego, że "wydaje mu się", że poprzedni krok został ukończony.

Drugim nowym wzorcem jest kontrolowana pętla agentic workflow. `/bmad-loop` nie jest ogólnym autopilotem; jest deterministycznym powtarzaniem `/bmad-next` do jawnego celu, z zatrzymaniami na checkpointach, konfliktach, brakach inputów, błędach walidacji i limitach naprawy.

### Market Context & Competitive Landscape

BMAD Stepper nie konkuruje jako ogólny coding agent, framework agentowy ani samodzielny CLI. Jego przestrzeń konkurencyjna to ręczne prowadzenie BMAD Method w Claude Code, ogólne slash commands, luźne prompt recipes oraz automatyzacje, które nie rozumieją BMAD step boundaries.

Przewaga produktu wynika z wąskości: Stepper zakłada, że BMAD Method już istnieje, i koncentruje się na bezpiecznym wykonywaniu kroków. Dzięki temu może być bardziej precyzyjny niż ogólny agent i mniej ciężki niż pełny runtime workflow engine.

### Validation Approach

Innowację trzeba walidować przez realne sesje BMAD, nie przez samą poprawność dokumentacji. Najważniejsze pytania walidacyjne:

- Czy `/bmad-next --dry-run` daje użytkownikowi wystarczające zaufanie, żeby pozwolił agentowi wykonać kolejny krok?
- Czy `/bmad-loop --until story:<id>` realnie zmniejsza liczbę ręcznych promptów bez zwiększenia ryzyka błędnego postępu?
- Czy reconcile screen jest zrozumiały, gdy stan i artefakty się rozjeżdżają?
- Czy użytkownik rozumie, dlaczego loop się zatrzymał i jak kontynuować?
- Czy prompt-first v1 wystarcza, czy powtarzające się błędy walidacji uzasadniają dodanie TypeScript/Bun runtime?

### Risk Mitigation

Główne ryzyko innowacji to false confidence: użytkownik może myśleć, że "workflow przeszedł", mimo że artefakty spełniły tylko formalny kontrakt, a nie semantyczną jakość. Mitigacja: dokumentować granicę gwarancji, pokazywać dowody w dry-run i stop reports, oraz traktować review, testy i human checkpoints jako część systemu.

Drugie ryzyko to workflow brittleness. Jeśli kontrakty kroków są zbyt sztywne, Stepper będzie często zatrzymywał się z powodu drobnych różnic w artefaktach. Mitigacja: dobrze zaprojektowane done criteria, repair limits, czytelny reconcile flow i możliwość diagnostyki.

Trzecie ryzyko to premature runtime complexity. Jeśli v1 za szybko doda TypeScript/Bun, produkt może stać się cięższy niż problem, który rozwiązuje. Mitigacja: utrzymać v1 prompt-first i script-light, a runtime dodać dopiero, gdy walidacja, fixture tests lub release automation pokażą realną potrzebę.

## Developer Tool Specific Requirements

### Project-Type Overview

BMAD Stepper jest narzędziem developerskim dystrybuowanym jako Claude Code plugin ze slash commands `/bmad-next` i `/bmad-loop`. V1 nie jest standalone CLI, SDK ani biblioteką programistyczną. Produkt działa w bieżącym repo użytkownika i zakłada, że BMAD Method jest już zainstalowany w projekcie docelowym.

Najważniejszym requirementem typu projektu jest developer trust: użytkownik musi rozumieć, co komenda zamierza zrobić, jakie pliki może zmienić, jakie artefakty są wymagane i dlaczego wykonanie zostało zatrzymane.

### Technical Architecture Considerations

V1 pozostaje prompt-first i script-light. Źródłem zachowania są specyfikacje slash commands, schematy, szablony, dokumentacja i kontrakty kroków. TypeScript/Bun runtime jest poza zakresem v1 i powinien zostać dodany dopiero wtedy, gdy pojawi się realna potrzeba wykonywalnej walidacji, fixture tests, generated docs lub release automation.

Stepper działa jako orkiestrator wokół istniejącego BMAD Method:
- sprawdza obecność BMAD prerequisites,
- ładuje konfigurację Stepper i BMAD,
- używa `.bmad-stepper/state.yaml` jako indeksu,
- traktuje artefakty i frontmatter jako dowód ukończenia,
- uruchamia task sub-agenty sekwencyjnie,
- zatrzymuje się na konfliktach, checkpointach i limitach.

### Language Matrix

V1 nie wspiera wielu języków programowania jako runtime target, ponieważ nie generuje SDK ani biblioteki. Podstawowym "językiem" produktu są prompt specs, Markdown, YAML i JSON Schema.

Wymagane formaty:
- Markdown dla slash commands, dokumentacji i run/task reports.
- YAML dla config i state templates.
- JSON Schema dla `config.schema.json`, `state.schema.json` i `step.schema.json`.

### Installation Methods

V1 powinien wspierać prosty, audytowalny sposób użycia:
- skopiowanie lub zainstalowanie pluginu Claude Code,
- dodanie command specs z `commands/`,
- utworzenie `.bmad-stepper/config.yaml` z szablonu,
- utworzenie lub naprawienie `.bmad-stepper/state.yaml`,
- uruchomienie `/bmad-next --dry-run` jako pierwszy bezpieczny test.

Stepper nie instaluje BMAD Method. Jeśli BMAD prerequisites nie istnieją, komendy muszą zatrzymać się z diagnozą i instrukcją naprawy.

### API Surface

Publiczną powierzchnią v1 są slash commands i ich opcje:

- `/bmad-next`
- `/bmad-next --epic <id>`
- `/bmad-next --story <id>`
- `/bmad-next --phase <name>`
- `/bmad-next --step <id>`
- `/bmad-next --skip-optional`
- `/bmad-next --dry-run`
- `/bmad-next --reconcile`
- `/bmad-loop --until next-story`
- `/bmad-loop --until story:<id>`
- `/bmad-loop --until story-range:<start>-<end>`
- `/bmad-loop --until epic:<id>`
- `/bmad-loop --until phase:<name>`
- `/bmad-loop --until step:<id>`
- `/bmad-loop --max-steps <n>`
- `/bmad-loop --skip-optional`
- `/bmad-loop --dry-run`

Każda komenda musi jasno deklarować inputy, outputy, state changes, mutation scope, stop conditions i failure behavior.

### Code Examples

Dokumentacja musi zawierać przykłady dla pierwszej sesji i głównych trybów użycia:
- preview next step,
- execute one scoped step,
- finish a story loop,
- skip optional steps,
- reconcile state/artifact conflict,
- interpret stop reports.

Przykłady powinny pokazywać nie tylko komendę, ale też oczekiwany sposób myślenia użytkownika: co Stepper sprawdza, dlaczego może się zatrzymać i jaki jest następny bezpieczny ruch.

### Migration Guide

Ponieważ v1 jest prompt-first, "migration" oznacza przejście z ręcznego prowadzenia BMAD Method do prowadzenia przez Stepper. Minimalna migracja:

1. Potwierdzić, że BMAD Method działa w projekcie.
2. Dodać konfigurację `.bmad-stepper/config.yaml`.
3. Zainicjalizować `.bmad-stepper/state.yaml`.
4. Uruchomić `/bmad-next --dry-run`.
5. Porównać wykryty krok z własnym rozumieniem stanu projektu.
6. Dopiero potem wykonać `/bmad-next` lub bounded `/bmad-loop`.

Dla istniejących projektów BMAD najważniejszy jest reconcile path: Stepper musi bezpiecznie obsłużyć sytuację, w której artefakty istnieją, ale stan nie został jeszcze zindeksowany.

### Implementation Considerations

Należy unikać funkcji, które wyglądają jak pełna automatyzacja, ale nie mają dobrych dowodów ukończenia. Domyślne zachowanie powinno być konserwatywne: optional steps są wykonywane, sub-agenty działają sekwencyjnie, a każdy konflikt lub niejednoznaczność zatrzymuje workflow.

Sekcje nieistotne dla tego typu projektu, takie jak visual design i store compliance, są poza zakresem PRD v1.

## Project Scoping

### Strategy & Philosophy

**Approach:** Single-release v1 focused on trust-first developer workflow execution. Ten release ma dowieźć kompletną, audytowalną pętlę podstawową: preview, wykonanie jednego kroku, bounded loop, reconcile i stop reports.

**Resource Requirements:** Jedna osoba techniczna/product-minded może dostarczyć prompt-first v1, ponieważ zakres opiera się na command specs, dokumentacji, schematach i szablonach. Runtime engineering jest celowo poza zakresem v1.

### Complete Feature Set

**Core User Journeys Supported:**
- Solo developer previewing the next BMAD step.
- Solo developer running a controlled story loop.
- Solo developer recovering from state/artifact conflict.
- Project maintainer updating Stepper assets.
- Solo developer troubleshooting failed task output.

**Must-Have Capabilities:**
- Slash command spec dla `/bmad-next`.
- Slash command spec dla `/bmad-loop`.
- Dry-run preview pokazujący selected step, expected outputs, evidence, stop conditions i conflicts.
- Project config template `.bmad-stepper/config.yaml`.
- State template `.bmad-stepper/state.yaml`.
- Step contract schema obejmujący identity, phase, persona, inputs, outputs, tasks, done criteria, optionality, next transitions i review policy.
- BMAD prerequisite diagnostics.
- State/artifact comparison przed wykonaniem kroku.
- Interactive reconcile dla konfliktów stanu i artefaktów.
- Sequential task sub-agent orchestration.
- Task output validation.
- Loop targets: next-story, story, story-range, epic, phase, step.
- Loop safety: max steps, repair limits, stop on checkpoint, missing input, ambiguous completion i failed validation.
- Optional steps included by default, chyba że użytkownik poda `--skip-optional`.
- Run/task reporting pod `.bmad-stepper/runs`.
- Dokumentacja first-run, command reference, examples i recovery guidance.
- Schematy JSON dla config, state i step contract.
- Jasne out-of-scope: BMAD installer, TypeScript/Bun runtime, parallel sub-agent execution, fully automatic repair i general-purpose workflow automation.

**Nice-to-Have Capabilities:**
- Executable validation runtime.
- Fixture tests.
- Generated documentation.
- Release automation.
- Richer run ledger visual summaries.
- More granular update/migration tooling.
- Parallel task sub-agent execution after conflict model is proven.
- Additional diagnostics for complex multi-epic workflows.

### Risk Mitigation Strategy

**Technical Risks:** Prompt-first validation may miss semantic quality issues. Mitigation: state the guarantee boundary clearly, require artifacts as completion evidence, include review/test outputs where relevant, and add executable validation only when repeated failures justify runtime complexity.

**Market Risks:** Users may not trust loop automation. Mitigation: make `--dry-run` the flagship trust path, keep `/bmad-next` as the atomic operation, and ensure every stop report explains what happened, why execution stopped, and what command or repair action is recommended.

**Resource Risks:** The project could grow into a runtime too early. Mitigation: keep v1 script-light, treat docs/schemas/templates as the product surface, and defer TypeScript/Bun until validation, fixture tests, generated docs, or release automation create enough need.

## Functional Requirements

### Workflow Discovery & Preview

- FR1: Użytkownik może uruchomić preview następnego kroku BMAD bez modyfikowania plików projektu.
- FR2: System może wykryć najbliższy niewykonany krok BMAD na podstawie workflow, stanu i artefaktów.
- FR3: System może pokazać wymagane inputy, oczekiwane outputy, kryteria ukończenia i warunki stopu dla wybranego kroku.
- FR4: Użytkownik może ograniczyć wybór kroku przez epic, story, phase lub step.
- FR5: System może zdiagnozować brak wymaganych plików BMAD przed wykonaniem workflow.

### Single-Step Execution

- FR6: Użytkownik może wykonać dokładnie jeden krok BMAD przez `/bmad-next`.
- FR7: System może załadować personę, instrukcje, inputy, outputy, taski, done criteria i next transitions dla kroku.
- FR8: System może potraktować krok jako transakcję, która aktualizuje stan dopiero po spełnieniu kryteriów ukończenia.
- FR9: System może wykonać opcjonalne kroki domyślnie, chyba że użytkownik poprosi o ich pominięcie.
- FR10: System może zatrzymać wykonanie pojedynczego kroku, gdy inputy są brakujące, completion jest niejednoznaczne lub potrzebna jest decyzja człowieka.

### Controlled Loop Execution

- FR11: Użytkownik może uruchomić pętlę kroków przez `/bmad-loop`.
- FR12: Użytkownik może ustawić cel pętli jako next story, konkretną story, zakres story, epic, phase lub step.
- FR13: System może powtarzać `/bmad-next` do osiągnięcia jawnego warunku stopu.
- FR14: System może zatrzymać pętlę po osiągnięciu limitu kroków.
- FR15: System może zatrzymać pętlę na checkpointach człowieka, failed validation, repair limits, missing inputs i ambiguous completion.
- FR16: System może raportować, dlaczego pętla została zatrzymana i jaki jest rekomendowany następny ruch.

### State, Evidence & Reconciliation

- FR17: System może używać `.bmad-stepper/state.yaml` jako indeksu aktywnego workflow.
- FR18: System może porównywać zapisany stan z dowodami w artefaktach projektu.
- FR19: System może wykryć konflikt między stanem a frontmatterem, plikami, outputami, testami lub review results.
- FR20: Użytkownik może uruchomić lub otrzymać interactive reconcile, gdy stan i artefakty się nie zgadzają.
- FR21: Użytkownik może wybrać sposób naprawy konfliktu, taki jak update state, trust artifacts, rerun step, skip step lub diagnostic.
- FR22: System może odmówić kontynuacji, gdy nie da się udowodnić bezpiecznego następnego kroku.
- FR23: System może wykryć nieukończony run i zaoferować resume, restart, abandon lub reconcile.
- FR24: System może ponownie wejść w krok idempotentnie, sprawdzając istniejące artefakty przed retry lub rerun.

### Task Orchestration & Validation

- FR25: System może uruchamiać task sub-agenty sekwencyjnie w ramach kroku.
- FR26: System może przekazywać output jednego taska jako jawny input do następnego taska.
- FR27: System może wymagać, aby każdy task wyprodukował zadeklarowany output.
- FR28: System może walidować task output pod kątem obecności, wymaganych sekcji, zgodności kontraktu i zakresu mutacji.
- FR29: System może wymagać od task outputu self-checku obejmującego użytą personę, przeczytane inputy, wyprodukowane outputy i respektowany scope.
- FR30: System może ponawiać naprawę task outputu do skonfigurowanego limitu.
- FR31: System może zapisać failure report, gdy task nie spełnia kontraktu po limitach naprawy.

### Configuration & Project Assets

- FR32: Użytkownik może skonfigurować Stepper przez `.bmad-stepper/config.yaml`.
- FR33: System może odczytać template stanu z `.bmad-stepper/state.yaml`.
- FR34: System może respektować ustawienia dotyczące optional steps, repair limits, loop limits, task execution i output directories.
- FR35: System może pinować wersję Stepper dla projektu.
- FR36: System może wykryć lokalne zmiany w plikach Stepper przed aktualizacją assets.
- FR37: Użytkownik może zobaczyć plan zmian przed nadpisaniem plików projektu.

### Documentation & Developer Experience

- FR38: Użytkownik może znaleźć first-run path opisujący konfigurację, dry-run, wykonanie jednego kroku i recovery guidance.
- FR39: Użytkownik może znaleźć command reference dla wszystkich opcji `/bmad-next` i `/bmad-loop`.
- FR40: Użytkownik może znaleźć przykłady dla preview, scoped execution, story loop, skip optional steps i reconcile.
- FR41: System może wyjaśnić ograniczenie gwarancji: artefakty dowodzą ukończenia workflow, nie semantycznej jakości decyzji.
- FR42: Maintainer może utrzymywać schematy config, state i step contract jako audytowalną część produktu.
- FR43: Użytkownik może prześledzić run records, task outputs i review/fix history w plikach projektu.

## Non-Functional Requirements

### Reliability & Recovery

- NFR1: Stepper musi zatrzymać wykonanie zamiast kontynuować, gdy nie może jednoznacznie potwierdzić następnego bezpiecznego kroku.
- NFR2: Każdy konflikt między `.bmad-stepper/state.yaml` a artefaktami musi skutkować reconcile reportem przed dalszą automatyzacją.
- NFR3: Każde przerwane lub nieukończone wykonanie musi mieć możliwą do zrozumienia ścieżkę resume, restart, abandon albo reconcile.
- NFR4: Repair i loop limits muszą być jawne w konfiguracji i widoczne w raportach zatrzymania.

### Trust & Transparency

- NFR5: Dry-run output musi pokazywać selected step, planned tasks, expected outputs, evidence, stop conditions i conflicts przed modyfikacją plików.
- NFR6: Stop reports muszą wyjaśniać, co system próbował zrobić, co wykrył, dlaczego się zatrzymał i jaki następny krok rekomenduje.
- NFR7: Dokumentacja musi jasno komunikować, że artefakty dowodzą ukończenia workflow, ale nie gwarantują semantycznej jakości decyzji lub implementacji.
- NFR8: Komendy muszą deklarować możliwe state changes i file mutation scope.

### Data Integrity & Auditability

- NFR9: State updates mogą zostać zapisane dopiero po potwierdzeniu wymaganych evidence dla kroku.
- NFR10: Task outputs, failure reports i review/fix iterations muszą być możliwe do prześledzenia w plikach projektu.
- NFR11: Run records muszą zachować wystarczający kontekst, aby użytkownik mógł zrozumieć, co zostało wykonane po przerwaniu sesji.
- NFR12: Aktualizacje plugin assets muszą wykrywać lokalne zmiany przed nadpisaniem plików projektu.
- NFR13: Główny kontekst wykonania musi preferować plan, status i podsumowania, a szczegóły tasków przechowywać w run/task records.

### Safety & Scope Control

- NFR14: Stepper musi traktować BMAD Method jako prerequisite i zatrzymać się z diagnozą, gdy wymagane pliki BMAD nie istnieją.
- NFR15: Stepper nie może wykonywać fully automatic state repair bez potwierdzenia użytkownika.
- NFR16: Task sub-agenty w v1 muszą działać sekwencyjnie, aby ograniczyć konflikty plików i niejawne zależności.
- NFR17: Out-of-scope file mutations muszą zatrzymać krok lub wymagać jawnej akceptacji użytkownika.
- NFR18: Persona drift musi być wykrywalny przez task self-check i walidację outputu.

### Maintainability

- NFR19: V1 musi pozostać prompt-first i script-light, dopóki executable validation, fixture tests, generated docs lub release automation nie uzasadnią runtime.
- NFR20: Dokumentacja, schematy, szablony i command specs muszą być utrzymywane spójnie.
- NFR21: Schematy config, state i step contract muszą być czytelne dla maintainera i użyteczne jako audytowalny kontrakt.
- NFR22: Project-pinned Stepper behavior musi chronić repo przed niekontrolowanymi zmianami zachowania po update pluginu.

### Performance

- NFR23: Dry-run powinien być wystarczająco szybki, aby użytkownik traktował go jako normalny pierwszy krok przed wykonaniem pracy, a nie jako ciężką diagnostykę.
- NFR24: Step selection i state/artifact comparison powinny ograniczać wczytywany kontekst do tego, co potrzebne dla bieżącego kroku.
- NFR25: Długie operacje loop muszą raportować postęp przez run/task records, aby przerwanie sesji nie utraciło kontekstu.
