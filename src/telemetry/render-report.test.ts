/**
 * src/telemetry/render-report.test.ts — coverage for `renderTelemetryReport`
 * (Story 6.7 — RPT_67_*).
 *
 * Pure renderer: tests do NOT need tmpdir / fs (the renderer is a pure
 * function returning a string). AR35 still applies for any test fixtures
 * that need filesystem state — but this file's tests are 100 % synthetic.
 *
 * AC mapping:
 *   - AC-1 (rendered structure): RPT_67_LAYOUT_HEADERS_*, RPT_67_PER_STEP_TABLE_*,
 *     RPT_67_VERIFIER_OUTCOMES_*, RPT_67_FAILURE_*.
 *   - AC-3 (no-PII surface): RPT_67_NO_PII_SURFACE_*.
 *   - Determinism: RPT_67_DETERMINISTIC_*.
 */

import { describe, expect, it } from "bun:test";
import type { AggregateResult } from "./aggregate.ts";
import { renderTelemetryReport } from "./render-report.ts";

function makeAggregate(overrides?: Partial<AggregateResult>): AggregateResult {
  return {
    period: "2026-05",
    totalRecords: 4,
    parseErrorCount: 0,
    firstTs: "2026-05-01T00:00:00.000Z",
    lastTs: "2026-05-31T23:59:59.000Z",
    distinctSteps: 2,
    perStep: {
      "step-a": {
        count: 2,
        meanDurationMs: 150,
        p95DurationMs: 200,
        retryRate: 0.5,
        verifierFailureRate: 0,
        meanTokensIn: 1000,
        meanTokensOut: 500,
        meanTokensTotal: 1500,
        errorCodeCounts: {},
      },
      "step-b": {
        count: 2,
        meanDurationMs: 1000,
        p95DurationMs: 1100,
        retryRate: 0,
        verifierFailureRate: 0.5,
        meanTokensIn: 2000,
        meanTokensOut: 1000,
        meanTokensTotal: 3000,
        errorCodeCounts: { TIMEOUT: 1 },
      },
    },
    verifierOutcomes: { pass: 3, fail: 1, skip: 0 },
    failurePatterns: { TIMEOUT: 1 },
    ...overrides,
  };
}

// ─── LAYOUT HEADERS: 5 H2 sections in canonical order ────────────────────

describe("renderTelemetryReport — LAYOUT_HEADERS", () => {
  it("RPT_67_LAYOUT_HEADERS_1: H1 contains period; 5 H2 sections present in canonical order", () => {
    const md = renderTelemetryReport(makeAggregate());

    expect(md).toContain("# Telemetry Aggregate — 2026-05");

    const h2s = [
      "## Summary",
      "## Per-step aggregates",
      "## Verifier outcomes",
      "## Failure patterns",
      "## Schema notes",
    ];
    for (const h2 of h2s) {
      expect(md).toContain(h2);
    }

    // Verify ordering: each section's index in the rendered string is monotonically increasing.
    let prev = -1;
    for (const h2 of h2s) {
      const idx = md.indexOf(h2);
      expect(idx).toBeGreaterThan(prev);
      prev = idx;
    }
  });
});

// ─── PER_STEP_TABLE: alphabetized + 7 columns ────────────────────────────

describe("renderTelemetryReport — PER_STEP_TABLE", () => {
  it("RPT_67_PER_STEP_TABLE_1: 3 steps → 3 alphabetized rows; column count 7", () => {
    const aggregate = makeAggregate({
      perStep: {
        "z-step": {
          count: 1,
          meanDurationMs: 100,
          p95DurationMs: 100,
          retryRate: 0,
          verifierFailureRate: 0,
          meanTokensIn: 100,
          meanTokensOut: 50,
          meanTokensTotal: 150,
          errorCodeCounts: {},
        },
        "a-step": {
          count: 1,
          meanDurationMs: 200,
          p95DurationMs: 200,
          retryRate: 0,
          verifierFailureRate: 0,
          meanTokensIn: 200,
          meanTokensOut: 100,
          meanTokensTotal: 300,
          errorCodeCounts: {},
        },
        "m-step": {
          count: 1,
          meanDurationMs: 300,
          p95DurationMs: 300,
          retryRate: 0,
          verifierFailureRate: 0,
          meanTokensIn: 300,
          meanTokensOut: 150,
          meanTokensTotal: 450,
          errorCodeCounts: {},
        },
      },
    });
    const md = renderTelemetryReport(aggregate);
    const aIdx = md.indexOf("| a-step ");
    const mIdx = md.indexOf("| m-step ");
    const zIdx = md.indexOf("| z-step ");
    expect(aIdx).toBeGreaterThan(0);
    expect(mIdx).toBeGreaterThan(aIdx);
    expect(zIdx).toBeGreaterThan(mIdx);

    // Header row column count: count pipe characters in the header row (8 = 7 columns + leading + trailing).
    const headerRow = md.split("\n").find((l) => l.startsWith("| Step |"));
    expect(headerRow).toBeDefined();
    const pipeCount = (headerRow as string).match(/\|/g)?.length ?? 0;
    expect(pipeCount).toBe(8);
  });
});

// ─── FAILURE_EMPTY: "None observed." when failurePatterns is empty ───────

describe("renderTelemetryReport — FAILURE_EMPTY", () => {
  it("RPT_67_FAILURE_EMPTY_1: failurePatterns = {} → 'None observed.' under H2 (no table)", () => {
    const aggregate = makeAggregate({ failurePatterns: {} });
    const md = renderTelemetryReport(aggregate);
    expect(md).toContain("## Failure patterns");
    expect(md).toContain("None observed.");
    // Ensure no table separator under failure patterns.
    const idxFp = md.indexOf("## Failure patterns");
    const idxNext = md.indexOf("## Schema notes", idxFp);
    const section = md.slice(idxFp, idxNext);
    expect(section).not.toContain("|------------|");
  });
});

// ─── FAILURE_SORTED: count desc then errorCode asc ──────────────────────

describe("renderTelemetryReport — FAILURE_SORTED", () => {
  it("RPT_67_FAILURE_SORTED_1: counts [10, 30, 20] → rendered in order 30, 20, 10", () => {
    const aggregate = makeAggregate({
      failurePatterns: {
        FIRST: 10,
        SECOND: 30,
        THIRD: 20,
      },
    });
    const md = renderTelemetryReport(aggregate);
    const secondIdx = md.indexOf("| SECOND ");
    const thirdIdx = md.indexOf("| THIRD ");
    const firstIdx = md.indexOf("| FIRST ");
    expect(secondIdx).toBeGreaterThan(0);
    expect(thirdIdx).toBeGreaterThan(secondIdx);
    expect(firstIdx).toBeGreaterThan(thirdIdx);
  });
});

// ─── VERIFIER_OUTCOMES: percentage column ────────────────────────────────

describe("renderTelemetryReport — VERIFIER_OUTCOMES", () => {
  it("RPT_67_VERIFIER_OUTCOMES_1: pass/fail/skip rows + Math.round percentage", () => {
    const aggregate = makeAggregate({
      verifierOutcomes: { pass: 88, fail: 8, skip: 4 },
      totalRecords: 100,
    });
    const md = renderTelemetryReport(aggregate);
    expect(md).toContain("| pass | 88 | 88% |");
    expect(md).toContain("| fail | 8 | 8% |");
    expect(md).toContain("| skip | 4 | 4% |");
  });

  it("RPT_67_VERIFIER_OUTCOMES_2: zero total → 0% percentages", () => {
    const aggregate = makeAggregate({
      verifierOutcomes: { pass: 0, fail: 0, skip: 0 },
      totalRecords: 0,
      perStep: {},
      distinctSteps: 0,
      firstTs: undefined,
      lastTs: undefined,
    });
    const md = renderTelemetryReport(aggregate);
    expect(md).toContain("| pass | 0 | 0% |");
    expect(md).toContain("| fail | 0 | 0% |");
    expect(md).toContain("| skip | 0 | 0% |");
  });
});

// ─── NO_PII_SURFACE: forbidden substrings ────────────────────────────────

describe("renderTelemetryReport — NO_PII_SURFACE (NFR-S3)", () => {
  it("RPT_67_NO_PII_SURFACE_1: rendered string contains no forbidden PII surfaces", () => {
    const aggregate = makeAggregate();
    const md = renderTelemetryReport(aggregate);
    const lower = md.toLowerCase();
    // NB: "tokens" is allowed (it's the legitimate aggregate column header).
    const FORBIDDEN = [
      "password",
      "prompt",
      "response",
      "apikey",
      "homedir",
      "email",
      "secret",
      "userinput",
      "userprompt",
    ];
    for (const f of FORBIDDEN) {
      expect(lower).not.toContain(f);
    }
  });
});

// ─── DETERMINISTIC ───────────────────────────────────────────────────────

describe("renderTelemetryReport — DETERMINISTIC", () => {
  it("RPT_67_DETERMINISTIC_1: render same aggregate twice → byte-identical strings", () => {
    const aggregate = makeAggregate();
    const a = renderTelemetryReport(aggregate);
    const b = renderTelemetryReport(aggregate);
    expect(a).toBe(b);
  });
});
