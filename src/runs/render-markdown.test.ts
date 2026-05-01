/**
 * src/runs/render-markdown.test.ts — Colocated unit tests for the pure
 * markdown renderer (Story 2.5 AC-1 / Task 7).
 *
 * AR35 pattern: Bun's built-in test runner; pure-function tests with no IO.
 *
 * Coverage map (Task 7 from story spec):
 *   - 7.2 AC-1 section ordering — seven AR25 headings appear in order.
 *   - 7.3 First-line heading — `# Step <stepName> — <runId>` (em-dash exact).
 *   - 7.4 Inputs section formatter — populated bullets.
 *   - 7.5 Empty inputs — `(none)` placeholder.
 *   - 7.6 Excerpt truncation — > 2000 chars.
 *   - 7.7 Excerpt no-truncation — ≤ 2000 chars.
 *   - 7.8 Verifier checks — symbols + Overall bullet.
 *   - 7.9 State delta — arrow notation; (none) for null.
 *   - 7.10 Outcome — verbatim pass-through.
 *   - 7.11 Pure-function determinism — two calls byte-equal.
 *   - 7.12 Trailing newline.
 */

import { describe, expect, it } from "bun:test";
import { renderTranscriptMarkdown } from "./render-markdown.ts";
import type { TranscriptInput } from "./types.ts";

function canonicalTranscriptInput(
  overrides: Partial<TranscriptInput> = {},
): TranscriptInput {
  return {
    runId: "2026-04-29T10-15-00-bmad-create-prd-abc12",
    stepName: "bmad-create-prd",
    epic: 1,
    story: "1.1",
    phase: "planning",
    persona: "pm",
    model: "sonnet",
    budget: { contextTokens: 60000, timeoutMs: 300000 },
    inputs: [{ path: "docs/brief.md", label: "Brief" }],
    subAgentPrompt: "PERSONA: pm\nTASK: write PRD",
    subAgentOutput: "PRD body content",
    verifierResult: {
      status: "pass",
      checks: [{ name: "requiredFiles", status: "pass", detail: "ok" }],
      promotedTo: "_bmad-output/planning-artifacts/prd.md",
    },
    stateBefore: { lastSuccessfulStep: null, lastAttempted: null },
    stateAfter: {
      lastSuccessfulStep: "bmad-create-prd",
      lastAttempted: null,
    },
    outcome: "✓ Promoted from staging/<runId>/ to canonical location.",
    durationMs: 1234,
    tokensIn: 100,
    tokensOut: 200,
    nowIso: "2026-04-29T10:15:00.000Z",
    ...overrides,
  };
}

describe("renderTranscriptMarkdown — AC-1 section ordering", () => {
  it("emits the seven AR25 sections in fixed order", () => {
    const md = renderTranscriptMarkdown(canonicalTranscriptInput());
    const headings = [
      "# Step ",
      "## Inputs",
      "## Sub-agent prompt (6 sections)",
      "## Sub-agent output (excerpt",
      "## Verifier result",
      "## State delta",
      "## Outcome",
    ];
    let cursor = 0;
    for (const h of headings) {
      const idx = md.indexOf(h, cursor);
      expect(idx).toBeGreaterThanOrEqual(cursor);
      cursor = idx + h.length;
    }
  });

  it("first line matches `# Step <stepName> — <runId>` with U+2014 em-dash", () => {
    const md = renderTranscriptMarkdown(canonicalTranscriptInput());
    const firstLine = md.split("\n")[0];
    expect(firstLine).toBe(
      "# Step bmad-create-prd — 2026-04-29T10-15-00-bmad-create-prd-abc12",
    );
  });
});

describe("renderTranscriptMarkdown — Inputs section", () => {
  it("renders one bullet per input in order", () => {
    const md = renderTranscriptMarkdown(
      canonicalTranscriptInput({
        inputs: [
          {
            path: "_bmad-output/planning-artifacts/prd.md",
            label: "PRD",
          },
          {
            path: "_bmad/personas/dev.md",
            label: "Dev persona",
          },
        ],
      }),
    );
    expect(md).toContain("- PRD: _bmad-output/planning-artifacts/prd.md");
    expect(md).toContain("- Dev persona: _bmad/personas/dev.md");
    // Order check: PRD bullet appears before Dev persona bullet.
    expect(md.indexOf("- PRD: ")).toBeLessThan(md.indexOf("- Dev persona: "));
  });

  it("emits `(none)` body when inputs is empty", () => {
    const md = renderTranscriptMarkdown(
      canonicalTranscriptInput({ inputs: [] }),
    );
    // Section header followed by (none) on the next non-empty line.
    const inputsSectionStart = md.indexOf("## Inputs\n");
    expect(inputsSectionStart).toBeGreaterThanOrEqual(0);
    const afterHeader = md.slice(inputsSectionStart + "## Inputs\n".length);
    expect(afterHeader.startsWith("(none)\n")).toBe(true);
  });
});

describe("renderTranscriptMarkdown — Sub-agent output excerpt", () => {
  it("truncates at 2000 chars and appends marker when input exceeds limit", () => {
    const longBody = "x".repeat(2500);
    const md = renderTranscriptMarkdown(
      canonicalTranscriptInput({ subAgentOutput: longBody }),
    );
    // The first 2000 chars are present, the last 500 are not.
    expect(md).toContain("x".repeat(2000));
    expect(md).not.toContain("x".repeat(2001));
    expect(md).toContain(
      "… (full at staging/2026-04-29T10-15-00-bmad-create-prd-abc12/outputs/)",
    );
  });

  it("emits the full output and no marker when input fits within 2000 chars", () => {
    const shortBody = "short content";
    const md = renderTranscriptMarkdown(
      canonicalTranscriptInput({ subAgentOutput: shortBody }),
    );
    expect(md).toContain("short content");
    expect(md).not.toContain("… (full at staging/");
  });
});

describe("renderTranscriptMarkdown — Verifier result", () => {
  it("renders ✓ / ✗ / ○ symbols + Overall bullet", () => {
    const md = renderTranscriptMarkdown(
      canonicalTranscriptInput({
        verifierResult: {
          status: "pass",
          checks: [
            { name: "requiredFiles", status: "pass", detail: "ok" },
            {
              name: "frontmatter",
              status: "fail",
              detail: "missing 'persona' key",
            },
            {
              name: "schema",
              status: "skip",
              detail: "no schema configured",
            },
          ],
          promotedTo: "_bmad-output/planning-artifacts/prd.md",
        },
      }),
    );
    expect(md).toContain("- requiredFiles: ✓ ok");
    expect(md).toContain("- frontmatter: ✗ missing 'persona' key");
    expect(md).toContain("- schema: ○ no schema configured");
    expect(md).toContain("- Overall: pass");
  });
});

describe("renderTranscriptMarkdown — State delta", () => {
  it("uses arrow notation; (none) for null values", () => {
    const md = renderTranscriptMarkdown(
      canonicalTranscriptInput({
        stateBefore: {
          lastSuccessfulStep: "story-create",
          lastAttempted: null,
        },
        stateAfter: {
          lastSuccessfulStep: "dev-story",
          lastAttempted: null,
        },
      }),
    );
    expect(md).toContain("- lastSuccessfulStep: story-create → dev-story");
    expect(md).toContain("- lastAttempted: (none) → (none)");
  });
});

describe("renderTranscriptMarkdown — Outcome", () => {
  it("emits outcome verbatim", () => {
    const md = renderTranscriptMarkdown(
      canonicalTranscriptInput({
        outcome: "✓ Promoted from staging/<runId>/ to canonical location.",
      }),
    );
    expect(md).toContain(
      "✓ Promoted from staging/<runId>/ to canonical location.",
    );
  });
});

describe("renderTranscriptMarkdown — purity & trailing newline", () => {
  it("two calls with the same input yield byte-equal results", () => {
    const input = canonicalTranscriptInput();
    const a = renderTranscriptMarkdown(input);
    const b = renderTranscriptMarkdown(input);
    expect(a).toBe(b);
  });

  it("ends with a single trailing newline", () => {
    const md = renderTranscriptMarkdown(canonicalTranscriptInput());
    expect(md.endsWith("\n")).toBe(true);
    // No double trailing newline.
    expect(md.endsWith("\n\n")).toBe(false);
  });
});
