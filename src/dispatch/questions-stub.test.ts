/**
 * src/dispatch/questions-stub.test.ts — Unit tests for the interactive-step
 * pre-flight questions stub renderer + detection logic.
 *
 * Regression coverage for the false-positive `isQuestionsFilled` bug
 * where the renderer's instruction paragraph used to embed the literal
 * `<!-- FILL_ME -->` marker in backticks for documentation. The check
 * was a naive substring scan over the whole file, so even after the
 * user replaced every real marker, the instruction reference still
 * matched and the runner kept halting with "Pending questions stub".
 */

import { describe, expect, it } from "bun:test";
import {
  FILL_ME_MARKER,
  isQuestionsFilled,
  renderQuestionsStub,
} from "./questions-stub.ts";

describe("renderQuestionsStub", () => {
  it("emits one FILL_ME marker per prompt and zero in the instruction header", () => {
    const body = renderQuestionsStub("bmad-test", [
      { prompt: "First?" },
      { prompt: "Second?" },
      { prompt: "Third?" },
    ]);
    const dividerIdx = body.indexOf("\n---\n");
    expect(dividerIdx).toBeGreaterThan(0);
    const header = body.slice(0, dividerIdx);
    const answerSlots = body.slice(dividerIdx);
    expect(header.includes(FILL_ME_MARKER)).toBe(false);
    expect(answerSlots.split(FILL_ME_MARKER).length - 1).toBe(3);
  });
});

describe("isQuestionsFilled", () => {
  it("returns false on a freshly rendered stub", () => {
    const body = renderQuestionsStub("bmad-test", [
      { prompt: "First?" },
      { prompt: "Second?" },
    ]);
    expect(isQuestionsFilled(body)).toBe(false);
  });

  it("returns true when every marker in the answer body is replaced", () => {
    const fresh = renderQuestionsStub("bmad-test", [
      { prompt: "First?" },
      { prompt: "Second?" },
    ]);
    const filled = fresh.split(FILL_ME_MARKER).join("user answer");
    expect(isQuestionsFilled(filled)).toBe(true);
  });

  it("ignores literal marker text in the pre-divider header (legacy stubs)", () => {
    // The pre-fix renderer embedded the literal marker in the
    // instruction paragraph for documentation. After the user fills
    // every real answer slot, the only remaining occurrence is the
    // header reference — `isQuestionsFilled` MUST treat that as filled.
    const legacyFilled = [
      "# Questions for bmad-brainstorming",
      "",
      "Replace each `<!-- FILL_ME -->` marker below with your answer.",
      "",
      "---",
      "",
      "### 1. What are we brainstorming about?",
      "",
      "sample app",
      "",
    ].join("\n");
    expect(isQuestionsFilled(legacyFilled)).toBe(true);
  });

  it("returns false when an answer slot still has the marker (post-divider)", () => {
    const partiallyFilled = [
      "# Questions for bmad-brainstorming",
      "",
      "Replace each placeholder marker below with your answer.",
      "",
      "---",
      "",
      "### 1. First?",
      "",
      "answered",
      "",
      "### 2. Second?",
      "",
      FILL_ME_MARKER,
      "",
    ].join("\n");
    expect(isQuestionsFilled(partiallyFilled)).toBe(false);
  });
});
