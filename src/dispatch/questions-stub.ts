/**
 * src/dispatch/questions-stub.ts — Pre-flight questions sub-artifact for
 * interactive BMAD steps.
 *
 * Some BMAD skills (brainstorming, product-brief, create-prd, ...) are
 * inherently interactive — their workflows literally halt and wait for
 * user input ("🛑 NEVER generate content without user input"). Stepper's
 * sub-agent contract is file-in / file-out only, so dispatching the
 * worker for these steps without context produces poor artifacts (the
 * worker has nothing to brainstorm ABOUT).
 *
 * The fix is to short-circuit the dispatch on `interactive: true` steps:
 * write a `inputs/questions.md` stub, halt with a "fill this file" hint,
 * and let the user (or `/bmad-loop` Layer 1) populate the file before
 * `/bmad-next --resume` proceeds. The filled file is then included as a
 * `taskSpec.context[]` entry on the resumed dispatch so the worker has
 * the user's answers and runs non-interactively.
 *
 * The stub uses `<!-- FILL_ME -->` as the sentinel marker. `isQuestionsFilled`
 * returns true iff zero markers remain.
 */

import * as path from "node:path";
import { atomicWrite } from "../io/atomic-write.ts";
import { PENDING_INPUT_PATH } from "../io/paths.ts";

/** Filename of the stub when nested under a staging dir's `inputs/`. */
export const QUESTIONS_FILENAME = "questions.md";

/** Sentinel marker indicating an unfilled answer slot. */
export const FILL_ME_MARKER = "<!-- FILL_ME -->";

/**
 * One question prompt to surface to the user. `prompt` is the question
 * text; `hint` is optional clarifying text shown beneath it.
 */
export interface QuestionPrompt {
  readonly prompt: string;
  readonly hint?: string;
}

/**
 * Per-step question prompts. Each entry maps a step name (the seed
 * `name` field) to the initial questions the BMAD skill would ask the
 * user before producing its artifact.
 *
 * The prompts are hand-curated for v0.1 — they mirror the first-round
 * questions in each skill's `step-01-*.md` workflow file. A future
 * iteration could parse them dynamically from the skill source.
 */
const STEP_QUESTIONS: Readonly<Record<string, readonly QuestionPrompt[]>> = {
  "bmad-brainstorming": [
    {
      prompt: "What are we brainstorming about?",
      hint: "The central topic, problem, or challenge you want to explore.",
    },
    {
      prompt: "What specific outcomes are you hoping for?",
      hint: "Types of ideas, solutions, or insights you're after.",
    },
    {
      prompt: "Any constraints or context to anchor the session?",
      hint: "Stack, audience, deadline, scope limits — leave blank if none.",
    },
  ],
  "bmad-domain-research": [
    {
      prompt: "Which domain or industry should we research?",
      hint: "Be specific — e.g., 'healthcare patient-portal apps', not 'healthcare'.",
    },
    {
      prompt: "What is the goal of the research?",
      hint: "Decision the research informs — feature scope, market entry, competitive analysis, etc.",
    },
  ],
  "bmad-market-research": [
    {
      prompt: "What market are we researching?",
      hint: "Product category, geography, customer segment.",
    },
    {
      prompt: "What strategic question are we trying to answer?",
      hint: "e.g., 'is there room for a new entrant', 'which segment to target first'.",
    },
  ],
  "bmad-product-brief": [
    {
      prompt: "What is the product idea (one sentence)?",
    },
    {
      prompt: "Who is the primary user?",
    },
    {
      prompt: "What problem does it solve for them?",
    },
    {
      prompt: "Any prior brainstorming output to build on?",
      hint: "Path to a brainstorming-session file, or a paste of the key picks.",
    },
  ],
  "bmad-prfaq": [
    {
      prompt: "What is the working title for this PRFAQ?",
    },
    {
      prompt: "What is the customer-facing announcement summary?",
      hint: "One paragraph as if it were the press release.",
    },
  ],
  "bmad-create-prd": [
    {
      prompt: "Product name and one-line description?",
    },
    {
      prompt: "Top 3-5 user goals this PRD must satisfy?",
    },
    {
      prompt: "Any explicit non-goals / scope cuts?",
    },
    {
      prompt: "Path to the product-brief artifact, if one exists?",
    },
  ],
  "bmad-validate-prd": [
    {
      prompt: "Path to the PRD to validate?",
    },
    {
      prompt: "Any specific concerns to focus on?",
      hint: "Leave blank for the standard validation sweep.",
    },
  ],
  "bmad-edit-prd": [
    {
      prompt: "Path to the PRD to edit?",
    },
    {
      prompt: "What change should be made?",
      hint: "A specific edit instruction — section, what to add/remove/reword.",
    },
  ],
  "bmad-create-ux-design": [
    {
      prompt: "Which feature(s) need UX patterns?",
    },
    {
      prompt: "Target platform(s)?",
      hint: "Web, iOS, Android, CLI, etc.",
    },
    {
      prompt: "Path to the PRD this design supports?",
    },
  ],
  "bmad-create-epics-and-stories": [
    {
      prompt: "Path to the PRD to break down?",
    },
    {
      prompt: "Suggested number of epics (or 'auto')?",
    },
  ],
  "bmad-create-architecture": [
    {
      prompt: "Project name and short description?",
    },
    {
      prompt: "Tech stack constraints / preferences?",
      hint: "Languages, frameworks, deployment target, scale targets.",
    },
    {
      prompt: "Path to the PRD or epics this architecture supports?",
    },
  ],
  "bmad-create-story": [
    {
      prompt: "Which story should be created next?",
      hint: "Epic number + story key, e.g., 'epic 2, story 2.3'.",
    },
    {
      prompt: "Any context or constraints specific to this story?",
    },
  ],
  "bmad-correct-course": [
    {
      prompt: "What change is being proposed mid-sprint?",
    },
    {
      prompt: "Why now — what triggered the change?",
    },
  ],
  "bmad-checkpoint-preview": [
    {
      prompt: "What change set should be reviewed?",
      hint: "Branch name, PR link, or 'staged + uncommitted'.",
    },
    {
      prompt: "Anything specific to focus the review on?",
    },
  ],
  "bmad-technical-research": [
    {
      prompt: "What technology or architectural question to research?",
    },
    {
      prompt: "What decision will the research inform?",
    },
  ],
  "bmad-retrospective": [
    {
      prompt: "Which epic is being retro'd?",
    },
    {
      prompt: "Anything you already know you want to flag?",
      hint: "Wins, regrets, surprises — leave blank for an open retro.",
    },
  ],
};

/**
 * Generic fallback prompts for an interactive step we don't have a
 * curated entry for (e.g., a third-party BMAD skill flagged
 * `interactive: true` via the overrides config).
 */
const GENERIC_QUESTIONS: readonly QuestionPrompt[] = [
  {
    prompt: "What is the goal or topic for this step?",
  },
  {
    prompt: "Any specific inputs, constraints, or context to use?",
  },
  {
    prompt: "What outcome should this step produce?",
  },
];

/**
 * Returns the question prompts for a step name. Falls back to
 * `GENERIC_QUESTIONS` when the step is not in the curated map.
 */
export function getQuestionsForStep(
  stepName: string,
): readonly QuestionPrompt[] {
  return STEP_QUESTIONS[stepName] ?? GENERIC_QUESTIONS;
}

/**
 * Build the markdown body of the stub questions file. Each prompt gets
 * a numbered `### N. <prompt>` heading, an italic hint line (if any),
 * and a `<!-- FILL_ME -->` placeholder where the user types the answer.
 */
export function renderQuestionsStub(
  stepName: string,
  prompts: readonly QuestionPrompt[],
): string {
  const lines: string[] = [];
  lines.push(`# Questions for ${stepName}`);
  lines.push("");
  lines.push(
    `This step is **interactive** — the BMAD skill needs your input before it`,
  );
  lines.push(
    "can produce a useful artifact. Replace each `<!-- FILL_ME -->` marker below",
  );
  lines.push(
    "with your answer (one line or many — leave the marker out when done).",
  );
  lines.push("");
  lines.push(
    "When every marker is gone, run `/bmad-next --resume` to continue.",
  );
  lines.push("");
  lines.push("---");
  lines.push("");
  prompts.forEach((q, idx) => {
    lines.push(`### ${idx + 1}. ${q.prompt}`);
    if (q.hint !== undefined) {
      lines.push("");
      lines.push(`_${q.hint}_`);
    }
    lines.push("");
    lines.push(FILL_ME_MARKER);
    lines.push("");
  });
  return `${lines.join("\n")}\n`;
}

/**
 * Compute the step-stable path of the questions stub. Defaults to
 * `_bmad-output/.stepper/pending-input/<step>.md`; tests can override
 * the parent directory via `pendingInputDir`. The path does NOT embed
 * a runId — the file persists across the halted run and the subsequent
 * `/bmad-next --resume`.
 */
export function questionsPathForStep(
  stepName: string,
  pendingInputDir?: string,
): string {
  return path.join(pendingInputDir ?? PENDING_INPUT_PATH, `${stepName}.md`);
}

/**
 * Returns true iff every `<!-- FILL_ME -->` marker has been removed
 * from the file. Used by the runner to decide whether the user (or the
 * loop) has filled the stub yet.
 */
export function isQuestionsFilled(content: string): boolean {
  return !content.includes(FILL_ME_MARKER);
}

/**
 * Read the existing pending questions file for a step. Returns null
 * when the file does not exist; returns the file contents otherwise.
 * `pendingInputDir` overrides the production
 * `_bmad-output/.stepper/pending-input` location (test seam).
 */
export async function readQuestionsForStep(
  stepName: string,
  pendingInputDir?: string,
): Promise<string | null> {
  const target = questionsPathForStep(stepName, pendingInputDir);
  return await Bun.file(target)
    .text()
    .catch(() => null);
}

/**
 * Write the questions stub file via the standard atomic-write contract.
 * No-op when the target already exists (preserves a user's in-progress
 * edits — only a fresh halt creates the stub). `pendingInputDir`
 * overrides the production location (test seam).
 */
export async function writeQuestionsStub(
  stepName: string,
  pendingInputDir?: string,
): Promise<{ readonly path: string; readonly created: boolean }> {
  const target = questionsPathForStep(stepName, pendingInputDir);
  const prompts = getQuestionsForStep(stepName);
  const body = renderQuestionsStub(stepName, prompts);

  const existing = await Bun.file(target)
    .text()
    .catch(() => null);
  if (existing !== null) {
    return { path: target, created: false };
  }

  await atomicWrite(target, body);
  return { path: target, created: true };
}
