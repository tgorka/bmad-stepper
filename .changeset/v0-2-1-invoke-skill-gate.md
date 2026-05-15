---
"bmad-stepper": patch
---

### feat: invoke-skill gate — bypass `bmad-step-runner` for steps with matching plugin skill

When the BMad plugin has a matching skill for the resolved step (e.g.,
`bmad-brainstorming` resolves to `<bmadPluginDir>/skills/bmad-brainstorming/SKILL.md`),
`/bmad-next` and `/bmad-loop` now emit a new AR9 action variant
`invoke-skill` that tells Layer 1 to call the Skill tool against
`bmad:<stepName>` instead of dispatching the generic `bmad-step-runner`
sub-agent. The rich BMad skill body runs in-thread with full user
interaction and writes its canonical artifact directly — artifacts now
carry the BMad skill's faithful title, structure, and depth instead of
the generic dispatch-spec body that the sub-agent invented from a
template prompt.

Falls back to the legacy `dispatch` path for steps with no matching
plugin skill, so non-BMad steps and BMad-without-skill installations
keep working unchanged.

**New surface**:

- AR9 protocol: `DispatchActionV1Schema` discriminated-union gains an
  `invoke-skill` variant `{ runId, skillName, lastAttempted?, exitCode: 0 }`.
- `src/commands/next/run.ts`: invoke-skill gate calls `detectBmadSkills()`
  after the dry-run path and before the interactive pre-flight. Test seam:
  `RunNextOptions.installedBmadSkills?: readonly string[]`.
- `src/commands/next/verify-and-advance.ts`: new `--invoke-skill-mode`
  argv flag triggers an early-return path that skips the dispatch-spec
  read, the verifier, and the staging→canonical promote step. State is
  advanced from the forwarded `--last-attempted-json` payload
  (REQUIRED on this path). The `runHistory[]` entry records
  `verifierStatus: "skip"` reflecting the verifier bypass.
- `skills/bmad-next/SKILL.md` + `skills/bmad-loop/SKILL.md`: new
  `Case action == "invoke-skill"` branch instructing Layer 1 to call
  `Skill(skill=jsonLine.skillName)` and forward `--invoke-skill-mode`
  to `verify-and-advance.ts`.

**Why the verifier is skipped on this path**: the v0.1 verifier defaults
target the staging-output convention (`staging/<runId>/outputs/<stepName>.md`
+ generic `**/*.md` glob). BMad skill output filenames vary per skill
(e.g., `bmad-create-prd` writes `prd.md`, not `bmad-create-prd.md`), so
the existing checks don't translate cleanly to canonical paths. The
BMad plugin skill is the source of truth for its own artifact quality;
a future story may add per-step canonical-path verifier overrides via
project config.

**Interactive steps**: the `interactive: true` pre-flight (pending-input
stub) is bypassed on the invoke-skill path — the BMad skill handles its
own user interaction in-thread.

### feat: dispatch-path enrichment — BMad skill + persona references threaded into dispatch-spec

For the fallback path (sub-agent dispatch via Task), the dispatch-spec
now carries optional absolute paths to the matching BMad plugin skill
and persona SKILL.md files so the `bmad-step-runner` sub-agent reads +
follows the real BMad framework instead of inventing from the generic
`task` template prompt. This makes the dispatch path also faithful when
it does fire (older Claude Code runtimes that lack the Skill tool, env
where BMad detection is bypassed, or any future opt-out).

**Surface**:

- `src/bmad-detect/detect-skills.ts`: new exported helper
  `resolveBmadSkillReferences(stepName, persona, opts?)` returning
  `{ skillPath: string | null, personaPath: string | null }`. Persona
  resolution uses the BMad `bmad-agent-<persona>` skill-folder
  convention; either field is `null` when its source file is absent or
  BMad is not installed (no throw).
- `src/schemas/dispatch-spec.ts`: `taskSpec` gains optional
  `skillReference?: string` and `personaReference?: string`.
- `src/dispatch/generate-spec.ts`: passes through new optional input
  fields `skillReference` + `personaReference`; emits them in the
  dispatch-spec.json only when supplied (back-compat preserved for
  existing consumers).
- `src/commands/next/run.ts`: dispatch path calls
  `resolveBmadSkillReferences()` after persona resolution and threads
  the result into `buildDispatchSpec`.
- `agents/bmad-step-runner.md`: 6-section AR7 contract gains a
  "v0.2.1 — optional BMad context references" subsection;
  execution-sequence steps 3 + 6 updated to read+follow
  `personaReference` + `skillReference` when present, with the
  generic `taskSpec.persona` + `taskSpec.task` text as fallback.
