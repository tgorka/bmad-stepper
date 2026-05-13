/**
 * tests/harness/layer1-claude-sim.test.ts — True Layer-1 simulation
 * via the Anthropic API. Implements docs/testing-roadmap.md §"Out of
 * scope #1 — True Layer 1 simulation" by sending each SKILL.md to
 * Claude as the system prompt + a user message, capturing the
 * response, and asserting Claude's intended invocation matches what
 * the SKILL.md prescribes.
 *
 * Status: OPT-IN. Skipped when `ANTHROPIC_API_KEY` is unset (i.e.,
 * in normal `bun run check` and PR CI). To run locally:
 *
 *   ANTHROPIC_API_KEY=sk-ant-... bun test tests/harness/layer1-claude-sim.test.ts
 *
 * To run in GitHub Actions: configure `ANTHROPIC_API_KEY` as a repo
 * secret + add a manual workflow_dispatch step (or a nightly cron
 * that limits API spend). The static analyzer at
 * src/smoke/skill-body-structure.test.ts catches most SKILL.md
 * regressions without API access.
 *
 * What this catches that the static analyzer does not:
 *   - Whether Claude's interpretation of the prose under context
 *     pressure produces the expected bash invocation.
 *   - Whether the SKILL.md's argument-forwarding instructions
 *     ("Capture the flag string the user typed after /<name>")
 *     successfully drive Claude to forward the right tail string.
 *   - Whether the SKILL.md's branching guidance (action == dispatch
 *     → Task; action == report → print; action == halt → exit)
 *     is unambiguous enough for Claude to follow.
 *
 * Cost: each test sends ~3000 tokens of SKILL.md + a small user
 * message; expects ~200 tokens of response. With Claude Opus rates
 * (~$15/Mtok input, ~$75/Mtok output) the full 3-skill sweep costs
 * roughly $0.05 per run — cheap enough for a nightly cron, too
 * expensive for per-PR.
 *
 * Uses Bun's built-in fetch (no SDK dependency added). No tool_use
 * is requested in the API call — instead the test asks Claude to
 * DESCRIBE the bash command it would run, then asserts the
 * response text contains the expected `bun run` shape. Cheaper than
 * a tool-use call and equally diagnostic for SKILL.md regressions.
 */

import { describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const REPO_ROOT = process.cwd();
const SKILLS_DIR = path.join(REPO_ROOT, "skills");
// GitHub Actions sets env vars referencing missing secrets to the EMPTY
// STRING (not undefined). So `=== undefined` is not enough — we must
// treat an empty string as "absent" too. Without this, the harness
// thought a missing secret was present, tried to call the API with an
// empty Authorization header, and got HTTP 401 → issue #71 false alarm.
const RAW_API_KEY = process.env.ANTHROPIC_API_KEY;
const HAS_API_KEY = RAW_API_KEY !== undefined && RAW_API_KEY.length > 0;
const MODEL =
  process.env.ANTHROPIC_HARNESS_MODEL ?? "claude-haiku-4-5-20251001";
const ENDPOINT = "https://api.anthropic.com/v1/messages";

interface MessagesResponse {
  readonly content?: ReadonlyArray<{ type?: string; text?: string }>;
  readonly stop_reason?: string;
  readonly usage?: { input_tokens?: number; output_tokens?: number };
  readonly error?: { type?: string; message?: string };
}

async function askClaude(
  systemPrompt: string,
  userMessage: string,
): Promise<{ text: string; usage: { in: number; out: number } }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error("ANTHROPIC_API_KEY not set");
  }
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic API ${response.status}: ${body.slice(0, 500)}`);
  }
  const json = (await response.json()) as MessagesResponse;
  if (json.error !== undefined) {
    throw new Error(`Anthropic API error: ${json.error.message}`);
  }
  const text = (json.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n");
  return {
    text,
    usage: {
      in: json.usage?.input_tokens ?? 0,
      out: json.usage?.output_tokens ?? 0,
    },
  };
}

interface SkillCheck {
  readonly name: string;
  readonly userMessage: string;
  /** Substring expected in Claude's response describing the bash command. */
  readonly expectedScriptPath: string;
}

const checks: readonly SkillCheck[] = [
  {
    name: "bmad-doctor",
    userMessage:
      "I just typed /bmad-doctor in the chat. Without executing anything, describe in ONE sentence the exact `bun run` shell command you would invoke per the skill's instructions.",
    expectedScriptPath: "src/commands/doctor/run.ts",
  },
  {
    name: "bmad-next",
    userMessage:
      "I just typed /bmad-next --explain in the chat. Without executing anything, describe in ONE sentence the exact `bun run` shell command you would invoke first per the skill's instructions.",
    expectedScriptPath: "src/commands/next/run.ts",
  },
  {
    name: "bmad-loop",
    userMessage:
      "I just typed /bmad-loop --plan-first --max-iters 1 in the chat. Without executing anything, describe in ONE sentence the exact `bun run` shell command you would invoke for plan-first delegation per the skill's instructions.",
    expectedScriptPath: "src/commands/loop/run.ts",
  },
];

const itOrSkip = HAS_API_KEY ? it : it.skip;

describe("Layer 1 Claude sim (opt-in: requires ANTHROPIC_API_KEY)", () => {
  if (!HAS_API_KEY) {
    it.skip("(skipped — set ANTHROPIC_API_KEY to enable)", () => {
      // Marker test so the skip is visible in the runner output.
    });
  }

  for (const check of checks) {
    itOrSkip(
      `${check.name}: Claude reads SKILL.md and prescribes bun run ${check.expectedScriptPath}`,
      async () => {
        const skillBody = await fs.readFile(
          path.join(SKILLS_DIR, check.name, "SKILL.md"),
          "utf8",
        );
        const { text, usage } = await askClaude(skillBody, check.userMessage);
        // Surface usage in the test name on failure for cost awareness.
        if (!text.includes(check.expectedScriptPath)) {
          throw new Error(
            `${check.name}: Claude did not mention ${check.expectedScriptPath}\nresponse (${usage.in}/${usage.out} tok):\n${text.slice(0, 600)}`,
          );
        }
        expect(text).toContain(check.expectedScriptPath);
        expect(text).toContain("bun run");
      },
      30000, // 30s per-test timeout (API roundtrip can be slow)
    );
  }
});
