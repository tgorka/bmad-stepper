/**
 * src/runs/render-markdown.ts — Pure markdown transcript renderer (AR25, AR41).
 *
 * **MID-TIER module per AR41** (architecture lines 1278-1282). Allowed
 * imports: foundational only. Sibling type import only (`./types.ts`). NO
 * IO, no time-of-call dependencies — the function is deterministic per input.
 * NO upward imports (no `dispatch/`, `verifiers/`, `commands/`, `state/`,
 * `dag/`, `personas/`, `failure-ux/`).
 *
 * Architecture references:
 *   - §F line 547 (markdown transcript shape — `runs/<ts>-<step>.log`).
 *   - §P5 lines 816-847 (worked example — markdown shape verbatim).
 *   - §P5 line 832 (excerpt truncation marker).
 *   - AR25 (epics.md line 205) — Markdown transcript per step (Streamed
 *     write — main thread tails to disk, never to stdout/stderr).
 */

import type { TranscriptInput } from "./types.ts";

const EXCERPT_MAX_CHARS = 2000;

/**
 * Truncates `text` to the first `maxChars` characters; when the source is
 * longer, appends the architecture §P5 line 832 verbatim marker
 * `… (full at staging/<runId>/outputs/)`.
 */
function truncateForExcerpt(
  text: string,
  runId: string,
  maxChars: number = EXCERPT_MAX_CHARS,
): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n\n… (full at staging/${runId}/outputs/)`;
}

/**
 * Maps a verifier check status to its rendered symbol per the architecture
 * §P5 lines 836-840 worked example.
 */
function statusSymbol(status: "pass" | "fail" | "skip"): string {
  switch (status) {
    case "pass":
      return "✓";
    case "fail":
      return "✗";
    case "skip":
      return "○";
  }
}

/**
 * Renders the AR25 markdown transcript from a TranscriptInput. Returns a
 * string containing the seven architecturally-prescribed sections in fixed
 * order:
 *
 *   1. `# Step <stepName> — <runId>`
 *   2. `## Inputs`
 *   3. `## Sub-agent prompt (6 sections)`
 *   4. `## Sub-agent output (excerpt — full at staging/<runId>/outputs/)`
 *   5. `## Verifier result`
 *   6. `## State delta`
 *   7. `## Outcome`
 *
 * The output terminates with a single trailing newline per Git-friendly +
 * POSIX convention.
 */
export function renderTranscriptMarkdown(input: TranscriptInput): string {
  const lines: string[] = [];

  // Section 1 — Header
  lines.push(`# Step ${input.stepName} — ${input.runId}`);
  lines.push("");

  // Section 2 — Inputs
  lines.push("## Inputs");
  if (input.inputs.length === 0) {
    lines.push("(none)");
  } else {
    for (const item of input.inputs) {
      lines.push(`- ${item.label}: ${item.path}`);
    }
  }
  lines.push("");

  // Section 3 — Sub-agent prompt
  lines.push("## Sub-agent prompt (6 sections)");
  lines.push(input.subAgentPrompt);
  lines.push("");

  // Section 4 — Sub-agent output (excerpt)
  lines.push(
    `## Sub-agent output (excerpt — full at staging/${input.runId}/outputs/)`,
  );
  lines.push(truncateForExcerpt(input.subAgentOutput, input.runId));
  lines.push("");

  // Section 5 — Verifier result
  lines.push("## Verifier result");
  for (const check of input.verifierResult.checks) {
    lines.push(
      `- ${check.name}: ${statusSymbol(check.status)} ${check.detail}`,
    );
  }
  lines.push(`- Overall: ${input.verifierResult.status}`);
  lines.push("");

  // Section 6 — State delta
  lines.push("## State delta");
  const before = input.stateBefore;
  const after = input.stateAfter;
  lines.push(
    `- lastSuccessfulStep: ${before.lastSuccessfulStep ?? "(none)"} → ${after.lastSuccessfulStep ?? "(none)"}`,
  );
  lines.push(
    `- lastAttempted: ${before.lastAttempted ?? "(none)"} → ${after.lastAttempted ?? "(none)"}`,
  );
  lines.push("");

  // Section 7 — Outcome
  lines.push("## Outcome");
  lines.push(input.outcome);

  // Trailing newline per Git-friendly + POSIX convention.
  return `${lines.join("\n")}\n`;
}
