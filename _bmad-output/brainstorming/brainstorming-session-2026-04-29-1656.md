---
stepsCompleted: [1, 2, 3, 4]
inputDocuments: []
session_topic: 'bmad-stepper-cc — Claude Code plugin with bmad-next / bmad-loop commands'
session_goals: 'Design the architecture and complete feature set for a plugin that automates step-by-step execution of the BMAD-method workflow with isolated sub-agents, configurable personas, and loops driven by stop conditions.'
selected_approach: 'ai-recommended'
techniques_used: ['First Principles Thinking', 'Morphological Analysis', 'What If Scenarios', 'Reverse Brainstorming', 'SCAMPER Method']
ideas_generated: 251
context_file: ''
key_decisions:
  scope: 'Stepper only — bmad-stepper-cc adds only bmad-next/bmad-loop; user installs the upstream BMAD plugin separately'
  state_source: 'Hybrid — use whatever exists and is most recommended (artifacts + state file + frontmatter)'
  ideation_approach: 'AI-Recommended techniques'
---

# Brainstorming Session Results

**Facilitator:** Tgorka
**Date:** 2026-04-29

## Session Overview

**Topic:** bmad-stepper-cc — Claude Code plugin with `bmad-next` and `bmad-loop` commands automating step-by-step execution of the BMAD-method workflow.

**Goals:**
- Design how `bmad-next` should "understand" workflow state and pick the next step
- Design the sub-agent dispatching mechanism per task (with isolated context)
- Design `bmad-loop` with stop conditions (epic, story X-Y, next story, phase)
- Design the Claude Code plugin (installation, update, structure)
- Cover infrastructure: README, CHANGELOG, AGENTS.md, CONTRIBUTING.md, .gitignore, linting/formatting, .github workflows
- Decide on stack (TS+Bun, tests, Taskfile)

### Context Guidance

**Reference point:** the existing `PabloLION/bmad-plugin` (a thin wrapper over `npx bmad-method install --tools claude-code`) — it sets the floor but does not add a "stepper" / "loop" layer.

**Local BMAD context:** the user actively uses BMAD in the `makistack` project (BMM, TEA, BMB, CIS, GDS modules). The workflow has phases: analysis → planning → solutioning → implementation → retrospective.

**Pragmatic goal:** eliminate the manual launching of 30+ skills per epic while preserving control over each step and not polluting the main conversation context.

### Session Setup

**Approach:** AI-Recommended Techniques
**Flow:**
1. Phase 1 — First Principles Thinking (foundation)
2. Phase 2 — Morphological Analysis (generation)
3. Phase 3 — What If + Reverse Brainstorming (stress test)
4. Phase 4 — SCAMPER (refinement)

**Key constraints:**
- Plugin scope: stepper only (`bmad-next` + `bmad-loop`)
- State source: hybrid (use whatever is available + recommended)
- Stack: TS + Bun + optional tests + optional Taskfile
- Distribution: Claude Code plugin, installable from GitHub

---

## Ideation Log

### Phase 1: First Principles Thinking

**Goal:** Strip away assumptions, identify fundamental truths and atoms underlying `bmad-next` and `bmad-loop`.

#### Atoms surfaced

**Q1 — What is a "BMAD step"?**
1. Step = unit of work (persona + skill + input + output) — workflow atom
2. Step = transition between two artifact states (artifact state machine)
3. Step = invocation of a single BMAD skill
4. Step = sequence of sub-tasks producing one coherent artifact **(decision)**
5. Step has a "definition of done" recorded in metadata
6. Step has a type: creation / review / implementation / retrospective / meta
7. Step is optional or required (flag in workflow definition)
8. Step has dependencies (graph, not a line)
9. Step is idempotent or destructive (re-run safety)
10. Step has an "input contract" — preconditions validator
11. BMAD has no central index of steps → we must reconstruct it from skill metadata + workflow files
12. BMAD has phases (analysis → planning → solutioning → implementation → retro)
13. The BMAD workflow is spec-driven (no central state machine, just documents)
14. Every BMAD skill has a "trigger phrase" in its description → registry: phase × skill × trigger

**Q2 — Why a sub-agent?**
15. Context isolation
16. Persona purity
17. Parallelism (possible, but here sequential)
18. Failure containment
19. Output as artifact, not as message
20. Model independence (Sonnet/Opus/Haiku per task)
21. Tool restriction (least-privilege)
22. Conversation budget management
23. Reproducibility
24. Sub-agent as a contract (clear interface)
25. Sub-agent does NOT decide what comes next
26. Sub-agent does NOT carry on a long dialogue with the user (BLOCKED → file → return)
27. Sub-agent does NOT validate its own output

**Q3 — What is "workflow state"?**
28. State = (what exists) + (what is valid) + (where we are in the graph)
29. "What exists" — file-existence checks
30. "What is valid" — `stepsCompleted` frontmatter inside documents
31. "Where we are" — computed pointer (next recommended)
32. State is a projection, not truth → state.yaml = cache + intent
33. State has intentions (user wants to finish epic-2 → loop stop condition)
34. State = git history + workspace (committed vs WIP distinction)
35. State includes sub-agent run history (retry detection)
36. State has checkpoints between phases
37. State is write-only from outside for the stepper (user can override)
38. Files are SoT, state.yaml is a cache (regen on conflict)
39. State.yaml is a write-through cache (lazy regen)
40. Frontmatter inside artifacts is authoritative for that document

#### Decisions captured
- Step = sequence of sub-tasks producing an artifact (transition)
- Step registry = auto-generated from BMAD skills + project overrides
- Sub-agent always for heavy lifting; main thread = orchestration only
- State = hybrid cache (state.yaml + files SoT, regen on demand)
- History = last N runs with timestamp + status + exit-reason

### Phase 2: Morphological Analysis

**Goal:** Systematically traverse the matrix of dimensions (Trigger × State × Persona × Dispatch × Stop × Output × Failure) and extract concrete feature flags + architectural decisions.

#### Morphological matrix
```
A. Trigger mode      : next-unfinished | --step <id> | --epic <n> | --story <e.s> | --phase <name> | --dry-run | --resume
B. State source      : files | state.yaml | frontmatter | git | hybrid
C. Persona resolution: static-map | config-driven | step-frontmatter | agent-detection
D. Sub-agent dispatch: sequential | parallel | mixed | none (inline)
E. Stop conditions   : epic-end | story-N | next-story | phase-end | N-iters | time-budget | error | manual
F. Output dest       : direct-edit | patch-file | staging-dir | pr-branch
G. Failure mode      : halt | skip | retry-N | route-to-fixer | escalate
```

#### CLI ergonomics (A × E)
41. `bmad-next` with no args → next-unfinished (zero-config)
42. `bmad-next --step <skill>` → explicit single skill
43. `bmad-next --epic <n>` → next step within an epic
44. `bmad-next --story <e.s>` → next step needed for a story
45. `bmad-next --phase <name>` → only steps from that phase
46. `bmad-next --dry-run` → preview the decision without sub-agents
47. `bmad-next --include-optional` / `--no-optional`
48. `bmad-next --persona <name>` → force persona override
49. `bmad-next --explain` → audit decision tree
50. `bmad-next --list` → next N steps with preconditions

#### Loop control (E × G)
51. `bmad-loop` → default until next-story-end
52. `bmad-loop --until-epic-end`
53. `bmad-loop --until-story <e.s>`
54. `bmad-loop --max-iters N` (safety)
55. `bmad-loop --time-budget 30m`
56. `bmad-loop --stop-on-error` / `--continue-on-error`
57. `bmad-loop --interactive` (human-in-the-loop)
58. `bmad-loop --auto-fix` (review issues → fix step auto-dispatch)
59. `bmad-loop --plan-first` (preview full sequence, user accepts, then run)
60. `bmad-loop --checkpoint-each <type>` (force checkpoint after step type)

#### State management (B)
61. State path: `_bmad-output/.stepper/state.yaml`
62. State has a schema version (backward compat)
63. `--recompute-state` flag (regen from disk)
64. Tracks last_successful_step + last_attempted + last_failure_reason
65. State is per-project, plugin is per-user
66. state.yaml.lock for concurrent runs
67. `--watch` mode (react to file changes)
68. Git-tracked or ignored — config option (default: ignored)
69. `--export-state > state.json` for CI audit
70. `--diff-state` shows changes from the last run

#### Persona resolution (C)
71. Built-in static map: skill → persona
72. `bmad-stepper.config.yaml` overrides per skill
73. Auto-detect from `_bmad/{module}/config.yaml`
74. Step frontmatter may require a specific persona
75. Persona fallback chain (specific → default)
76. Named profiles: `indie-dev`, `enterprise`, etc.
77. Sub-agent receives project context together with the persona
78. Multi-persona steps (review = dev + tea + architect)
79. `--persona-from <other-config>` (experiments)
80. Priority: frontmatter > project config > plugin default

#### Sub-agent dispatch (D × F)
81. Sequential by default (user requirement)
82. Sub-agent receives input via a file (reproducible)
83. Sub-agent writes to `staging/` first; the main thread promotes
84. Sub-agent timeout (default 5 min)
85. Sub-agent task spec: PERSONA / CONTEXT / TASK / OUTPUT FORMAT / SUCCESS CRITERIA / CONSTRAINTS
86. Sub-agent may retry itself once with an extended prompt
87. Verifier after the sub-agent (lint, schema validation)
88. Run transcript log: `_bmad-output/.stepper/runs/<ts>-<step>.log`
89. `--dry-run` flag for the sub-agent
90. Sub-agent context budget (declared, monitored)

#### Failure modes (G)
91. Halt (default) — stop, report, await user
92. Skip — mark `skipped: true`, continue
93. Retry-N — auto-retry with a modified prompt
94. Route-to-fixer (review issues → fixer sub-agent)
95. Escalate — handler (gh issue, user notify, halt loop)
96. `--max-failures N` budget
97. Failure isolation in the loop
98. `bmad-next --resume` after failure
99. Git snapshot before a destructive step
100. Human-readable failure report (not stack trace)

#### Plugin packaging (meta)
101. Plugin manifest: name=`bmad-stepper-cc`, 2 skills
102. Plugin does not bundle BMAD skills (assume installed separately)
103. Detection at first run: "BMAD found at X" / "BMAD not found, install with..."
104. Compatibility matrix in README
105. Install via `/plugin marketplace add Tgorka/bmad-stepper-cc` + project scope
106. `--upgrade` flag checks gh releases
107. `--doctor` sanity check (BMAD installed? config valid?)
108. Per-project (`.claude/plugins/`) or per-user
109. Minimal tools: Bash, Read, Write, Edit, Task, Grep, Glob
110. Read-only with respect to upstream BMAD (no modification)

### Phase 3: What If + Reverse Brainstorming

**Goal:** Stress-test the design by surfacing edge cases, race conditions, sabotage paths — convert into invariants and guards.

#### What If — User interrupts
111. Ctrl+C in the middle of a sub-agent → trap SIGINT, wait for clean shutdown with timeout, state stays consistent
112. Terminal closed during the loop → state.yaml has last_run_pid + started_at; recovery prompt
113. Manual file edit during execution → detect mtime, recompute state, skip/repeat
114. CWD = subdir → look for the nearest `_bmad/` ancestor
115. User does not approve the artifact → `--interactive` approve/regenerate/skip/abort
116. Undo previous step → `bmad-prev` or `--undo-last`, git restore, mark rolled-back
117. Change persona without restart → live reload config before each iteration
118. See the prompt that would be sent → `--dry-run --print-prompt`
119. Restart an epic → `--reset-epic <n>`, archive into `_bmad-output/.archive/`
120. Two loops at the same time → lock + friendly error

#### What If — System / environment
121. BMAD update during the loop → version snapshot mismatch detection, restart prompt
122. Unknown config key → graceful, warn, do not crash
123. Missing BMAD module for a step → explain + install hint
124. Custom user module → extension point in `bmad-stepper.config.yaml`
125. Skill name collision between modules → priority resolution
126. External disk disconnects → retry + halt + tmp error report
127. Monorepo with several BMAD projects → closest `_bmad/` or `--project-root`
128. Claude Code session restart → stateless plugin, state from disk
129. Haiku model env var → warn for heavy steps
130. Disk full → graceful fail, cleanup staging

#### What If — Concurrency
131. Two `bmad-next` runs at once → file lock with PID + heartbeat
132. State.yaml read during write → atomic write (tmp + rename)
133. Sub-agent times out but is still writing → run_id naming, cleanup
134. Main crashes but the sub-agent finishes → orphan complete file detection
135. Two sub-agents on the same file → user requirement = sequential, but staging areas are isolated
136. User edits state.yaml during a write → atomic + version check
137. Git commits during the loop → branch+sha snapshot, recompute warning
138. Branch switch during the loop → halt, prompt
139. FS without atomic rename → fallback (lock+write+flush), warning
140. Symlinks in output → resolve + log original path

#### What If — Pathological inputs
141. PRD 50k lines → warn, proceed
142. Empty epics.md but story-create called → precondition fail with hint
143. 100 epics × 1000 stories → lazy load state, computed pointers
144. Corrupted frontmatter → blocked status + fix command suggestion
145. Renamed epic mid-implementation → detect missing, prompt
146. Polish characters in filename on CP1252 → enforce UTF-8
147. Dev-story sub-agent generates infinite-loop code → no execute, basic linter check
148. 200 review issues → paginate, prioritize options
149. 50MB state.yaml → size guard, recompute prompt
150. Strange epic file names → configurable pattern

#### Reverse — Sabotage paths → Invariants
151. Duplicated artifact → ✅ "step completed" check before dispatch (unless --force)
152. Skip state recompute after failure → ✅ recompute state at the start of each iteration
153. Concurrent runs on the same epic → ✅ exclusive lock per project root
154. Full transcript in main prompt → ✅ minimum viable context (relevant files + summary only)
155. Long loop bloats main thread → ✅ main thread logs 1–2 lines per step, full logs go elsewhere
156. Show-last-run loads full log into prompt → ✅ open the file externally
157. Crash mid-write → ✅ atomic write always + .bak backup
158. Wrong serialization → ✅ schema validation (Zod) on load
159. State.yaml refers to a non-existent step → ✅ validator that the step exists in the registry
160. Race state vs user edit → ✅ atomic + lock + warning
161. Stale registry cache → ✅ rebuild on plugin version change OR `--recompute`
162. False-positive precondition → ✅ exists AND validates schema
163. Optional treated as required → ✅ metadata `optional: true`, skip by default
164. Cycle in step DAG → ✅ DAG validator on load
165. Custom step cycle → ✅ topological sort over all steps
166. Install on incompatible BMAD → ✅ manifest declares versions, runtime check
167. Schema break in a new version → ✅ migration system with version field
168. Plugin update mid-loop → ✅ hash check, halt + restart
169. No tests → regression → ✅ smoke tests per module, gate on PR
170. Missing docs → ✅ comprehensive `--help`

#### Failure mode design summary
171. Graceful interrupt — trap SIGINT, finalize, save state, clean exit
172. Lock with PID + heartbeat — stale detection
173. Atomic state writes — `tmp + rename` everywhere
174. Schema-versioned state — migrations
175. DAG validation on every registry load
176. Precondition contracts — declared per step
177. Verifier post-conditions — declared per step
178. Idempotency markers — `idempotent: bool` per step
179. Snapshot integration — optional git stash/branch before destructive steps
180. Audit log — every decision with reasoning

### Phase 4: SCAMPER — Infrastructure & Tooling

**Goal:** Run 7 SCAMPER lenses over the project meta-level: docs, CI, tests, packaging, distribution.

#### S — Substitute
181. Bun test (instead of Jest/Vitest)
182. Biome (instead of ESLint+Prettier)
183. Bun (instead of npm/yarn/pnpm)
184. Changesets (versioning + CHANGELOG generation)
185. GH Releases as the stable-versions distribution channel
186. Templated Markdown via a Bun script for shared logic
187. `Bun.file().text()` + regex for BMAD version detection
188. YAML state.yaml (user-facing), JSON for machine-only logs
189. Bun built-in console + `Bun.color` (zero-deps logger)
190. tests/fixtures/* directory instead of inline fixtures

#### C — Combine
191. `bmad-stepper.config.yaml` + `_bmad/core/config.yaml` (project wins, base from BMAD)
192. GH Actions + Bun cache lockfile
193. README badges + shields.io (version, license, BMAD compat — JSON endpoint like Pablo)
194. CHANGELOG.md + GH Releases auto-generated body
195. docs/ folder + GH Pages (optional, post-v0.1)
196. .editorconfig (basics) + Biome (TS specifics)
197. CONTRIBUTING.md (humans) + AGENTS.md (AI)
198. package.json scripts only (NO Taskfile)
199. Smoke + integration tests (single `bun test`, tagged)
200. Changesets (semi-manual release flow, PR-based)

#### A — Adapt
201. `scripts/build-skills.ts` pattern (from Pablo, but skills are our own, not synced)
202. SKILL.md + linked steps directory (BMAD convention)
203. GH Release tag + Action → `claude plugin install` from gh
204. Renovate/Dependabot for deps
205. PR template (.github/PULL_REQUEST_TEMPLATE.md)
206. Issue templates (bug, feature, bmad-compat)
207. CODE_OF_CONDUCT.md (Contributor Covenant 2.1)
208. SECURITY.md (policy, contact, supported versions)
209. FUNDING.yml (optional)
210. `.well-known/funding-manifest-urls` (optional)
211. `description: Use when...` at the top of every skill (superpowers pattern)
212. v0.1.0 semver, independent of BMAD versioning
213. Stacked PRs / graphite (post-v0.1)
214. `scripts/validate-skills.ts` (frontmatter, description, allowed-tools)

#### M — Modify
215. CHANGELOG includes a "BMAD Compatibility" section per release
216. package.json keywords: claude-code, claude-code-plugin, bmad, bmad-method, agile, ai-development
217. Semver: MAJOR=plugin API break, MINOR=features, PATCH=fix
218. CONTRIBUTING tone: "we dogfood the BMAD method to develop this plugin"
219. AGENTS.md: repo-specific instructions (run `bun run validate` before commit)
220. README structure: Quick Start (3 commands) → Features → Architecture → Configuration → Troubleshooting
221. tests/ at the repo root (skills are Markdown, little TS)
222. License: MIT
223. .gitignore: `_bmad-output/`, `.stepper/`, `node_modules/`, `dist/`, `.DS_Store`, `*.log`, `.env*` — commit `.claude-plugin/plugin.json`
224. CI matrix: Bun latest, Linux + macOS

#### P — Put to other uses
225. Plugin skills as user-facing reference docs
226. state.yaml as audit log (enterprise compliance)
227. Transcripts as anonymized training data (improving sub-agent prompts)
228. config.yaml as a starter template (`bmad-next --init`)
229. Registry as a visual workflow diagram (`--visualize > workflow.dot`)
230. Precondition checks as a linter (`--validate`)
231. AGENTS.md as self-doc (Claude Code reads it = executable spec)
232. Skill descriptions = CLI help (`--help` walks the skills)
233. GH Issues = feature tracking + roadmap (labels: phase:*, bmad-compat)
234. GH Discussions = Q&A (separate from Issues)

#### E — Eliminate
235. Taskfile (package.json scripts are enough)
236. Complex CI matrix (start with linux + Bun latest)
237. ESLint + Prettier (Biome replaces them)
238. Runtime deps in the plugin (skills = Markdown, no deps)
239. dist/ build step (plugin lives as-is in the repo)
240. Over-engineered telemetry (simple .log, opt-out)
241. Manual versioning (Changesets automation)
242. "build" as a concept (source = release)
243. Custom state schema if BMAD has a good one
244. Exhaustive testing (focus: state machine + config parser + decision logic)

#### R — Reverse
245. Tests-first for the state machine (smoke tests from day 1)
246. Docs-first for skills (SKILL.md as the spec)
247. Opt-in features by default (advanced flags off, safe defaults)
248. Zero config out-of-the-box (config = override, not requirement)
249. Ship v0.1 with 1 step type + scaffolding for the rest (small, iterate)
250. Errors as primary UX (actionable hints, tested in CI)
251. Skill auto-discovery (instead of a hard-coded registry)
