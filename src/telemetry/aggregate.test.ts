/**
 * src/telemetry/aggregate.test.ts — coverage for `aggregateTelemetry`
 * (Story 6.7 — AC-1 + AC-2 + AC-3 — AGG_67_*).
 *
 * AR35: tmpdir per `it(...)` block; cleanup in `afterEach`. Tests MUST
 * NOT touch `_bmad-output/` (the real project's output directory).
 *
 * AC mapping:
 *   - AC-1 (per-step aggregates): AGG_67_PARSE_BASIC_*, AGG_67_P95_*,
 *     AGG_67_RETRY_RATE_*, AGG_67_VERIFIER_FAIL_RATE_*, AGG_67_TOKENS_*,
 *     AGG_67_ERROR_CODES_*, AGG_67_FIRST_LAST_TS_*.
 *   - AC-2 (NFR-P6 < 2 seconds): AGG_67_NFR_P6_*.
 *   - AC-3 (no-PII transitive): AGG_67_PARSE_REJECT_EXTRA_FIELD_* (Zod
 *     parse rejects extra-field record on read).
 *   - Defence-in-depth + audit: AGG_67_PARSE_SKIP_*, AGG_67_NO_FILE_*,
 *     AGG_67_INVALID_PERIOD_*, AGG_67_OUT_OF_SCOPE_*.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { ScopeViolationError } from "../errors.ts";
import type { TelemetryRecord } from "../schemas/telemetry.ts";
import { aggregateTelemetry } from "./aggregate.ts";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-aggregate-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeValidRecord(
  overrides?: Partial<TelemetryRecord>,
): TelemetryRecord {
  return {
    schemaVersion: 1,
    ts: "2026-05-05T12:34:56.000Z",
    step: "bmad-create-story",
    phase: "planning",
    persona: "po",
    model: "sonnet",
    durationMs: 1000,
    verifierStatus: "pass",
    retries: 0,
    tokensIn: 1000,
    tokensOut: 500,
    ...overrides,
  };
}

async function writeJsonlFixture(
  dir: string,
  period: string,
  records: unknown[],
): Promise<string> {
  const filePath = path.join(dir, `${period}.jsonl`);
  const lines = records
    .map((r) => (typeof r === "string" ? r : JSON.stringify(r)))
    .join("\n");
  await fs.writeFile(
    filePath,
    lines + (records.length > 0 ? "\n" : ""),
    "utf8",
  );
  return filePath;
}

// ─── AC-1 PARSE_BASIC: per-step counts + means + p95 ─────────────────────

describe("aggregateTelemetry — AC-1 PARSE_BASIC", () => {
  it("AGG_67_PARSE_BASIC_1: 5 records over 3 steps → per-step counts", async () => {
    const records: TelemetryRecord[] = [
      makeValidRecord({ step: "step-a", durationMs: 100 }),
      makeValidRecord({ step: "step-a", durationMs: 200 }),
      makeValidRecord({ step: "step-b", durationMs: 1000 }),
      makeValidRecord({ step: "step-c", durationMs: 50 }),
      makeValidRecord({ step: "step-c", durationMs: 150 }),
    ];
    await writeJsonlFixture(tmpDir, "2026-05", records);

    const result = await aggregateTelemetry({
      period: "2026-05",
      telemetryRoot: tmpDir,
    });

    expect(result.totalRecords).toBe(5);
    expect(result.parseErrorCount).toBe(0);
    expect(result.distinctSteps).toBe(3);
    expect(result.perStep["step-a"]?.count).toBe(2);
    expect(result.perStep["step-b"]?.count).toBe(1);
    expect(result.perStep["step-c"]?.count).toBe(2);
    expect(result.perStep["step-a"]?.meanDurationMs).toBe(150);
    expect(result.perStep["step-c"]?.meanDurationMs).toBe(100);
  });
});

// ─── AC-1 P95_NEAREST_RANK: 95th percentile ───────────────────────────────

describe("aggregateTelemetry — AC-1 P95_NEAREST_RANK", () => {
  it("AGG_67_P95_NEAREST_RANK_1: 100 sequential durations [1..100] → p95 = 95", async () => {
    const records: TelemetryRecord[] = [];
    for (let i = 1; i <= 100; i++) {
      records.push(makeValidRecord({ step: "uniform", durationMs: i }));
    }
    await writeJsonlFixture(tmpDir, "2026-05", records);

    const result = await aggregateTelemetry({
      period: "2026-05",
      telemetryRoot: tmpDir,
    });
    expect(result.perStep.uniform?.p95DurationMs).toBe(95);
  });
});

// ─── AC-1 RETRY_RATE ─────────────────────────────────────────────────────

describe("aggregateTelemetry — AC-1 RETRY_RATE", () => {
  it("AGG_67_RETRY_RATE_1: retries [0,0,1,2,3] → mean 1.2", async () => {
    const retries = [0, 0, 1, 2, 3];
    const records: TelemetryRecord[] = retries.map((r) =>
      makeValidRecord({ step: "step-a", retries: r }),
    );
    await writeJsonlFixture(tmpDir, "2026-05", records);

    const result = await aggregateTelemetry({
      period: "2026-05",
      telemetryRoot: tmpDir,
    });
    expect(result.perStep["step-a"]?.retryRate).toBeCloseTo(1.2, 5);
  });
});

// ─── AC-1 VERIFIER_FAIL_RATE ─────────────────────────────────────────────

describe("aggregateTelemetry — AC-1 VERIFIER_FAIL_RATE", () => {
  it("AGG_67_VERIFIER_FAIL_RATE_1: 4 records — 2 pass, 1 fail, 1 skip → fail rate 0.25", async () => {
    const records: TelemetryRecord[] = [
      makeValidRecord({ step: "v", verifierStatus: "pass" }),
      makeValidRecord({ step: "v", verifierStatus: "pass" }),
      makeValidRecord({ step: "v", verifierStatus: "fail" }),
      makeValidRecord({ step: "v", verifierStatus: "skip" }),
    ];
    await writeJsonlFixture(tmpDir, "2026-05", records);

    const result = await aggregateTelemetry({
      period: "2026-05",
      telemetryRoot: tmpDir,
    });
    expect(result.perStep.v?.verifierFailureRate).toBeCloseTo(0.25, 5);
    expect(result.verifierOutcomes).toEqual({ pass: 2, fail: 1, skip: 1 });
  });
});

// ─── AC-1 TOKENS ────────────────────────────────────────────────────────

describe("aggregateTelemetry — AC-1 TOKENS", () => {
  it("AGG_67_TOKENS_1: tokensIn [1000,2000,3000] / tokensOut [500,1000,1500] → means", async () => {
    const records: TelemetryRecord[] = [
      makeValidRecord({ step: "t", tokensIn: 1000, tokensOut: 500 }),
      makeValidRecord({ step: "t", tokensIn: 2000, tokensOut: 1000 }),
      makeValidRecord({ step: "t", tokensIn: 3000, tokensOut: 1500 }),
    ];
    await writeJsonlFixture(tmpDir, "2026-05", records);

    const result = await aggregateTelemetry({
      period: "2026-05",
      telemetryRoot: tmpDir,
    });
    expect(result.perStep.t?.meanTokensIn).toBe(2000);
    expect(result.perStep.t?.meanTokensOut).toBe(1000);
    expect(result.perStep.t?.meanTokensTotal).toBe(3000);
  });
});

// ─── AC-1 ERROR_CODES (I-47 PRIMARY HONOURED) ────────────────────────────

describe("aggregateTelemetry — AC-1 ERROR_CODES (I-47)", () => {
  it("AGG_67_ERROR_CODES_1: errorCodes [undef, VERIFIER_FAILURE, VERIFIER_FAILURE, TIMEOUT, undef] → counts", async () => {
    const records: TelemetryRecord[] = [
      makeValidRecord({ step: "x" }),
      makeValidRecord({
        step: "x",
        verifierStatus: "fail",
        errorCode: "VERIFIER_FAILURE",
      }),
      makeValidRecord({
        step: "x",
        verifierStatus: "fail",
        errorCode: "VERIFIER_FAILURE",
      }),
      makeValidRecord({
        step: "x",
        verifierStatus: "fail",
        errorCode: "TIMEOUT",
      }),
      makeValidRecord({ step: "x" }),
    ];
    await writeJsonlFixture(tmpDir, "2026-05", records);

    const result = await aggregateTelemetry({
      period: "2026-05",
      telemetryRoot: tmpDir,
    });
    expect(result.failurePatterns).toEqual({
      VERIFIER_FAILURE: 2,
      TIMEOUT: 1,
    });
    expect(result.perStep.x?.errorCodeCounts).toEqual({
      VERIFIER_FAILURE: 2,
      TIMEOUT: 1,
    });
  });
});

// ─── AC-1 FIRST_LAST_TS ──────────────────────────────────────────────────

describe("aggregateTelemetry — AC-1 FIRST_LAST_TS", () => {
  it("AGG_67_FIRST_LAST_TS_1: mixed-order ts → firstTs / lastTs reflect lexicographic extremes", async () => {
    const records: TelemetryRecord[] = [
      makeValidRecord({ ts: "2026-05-15T10:00:00.000Z" }),
      makeValidRecord({ ts: "2026-05-01T00:00:00.000Z" }),
      makeValidRecord({ ts: "2026-05-31T23:59:59.000Z" }),
    ];
    await writeJsonlFixture(tmpDir, "2026-05", records);

    const result = await aggregateTelemetry({
      period: "2026-05",
      telemetryRoot: tmpDir,
    });
    expect(result.firstTs).toBe("2026-05-01T00:00:00.000Z");
    expect(result.lastTs).toBe("2026-05-31T23:59:59.000Z");
  });
});

// ─── PARSE_SKIP: malformed lines counted but not fatal ───────────────────

describe("aggregateTelemetry — PARSE_SKIP (OQ-7)", () => {
  it("AGG_67_PARSE_SKIP_1: 3 valid + 2 corrupted lines → totalRecords=3, parseErrorCount=2", async () => {
    const validRecord = makeValidRecord({ step: "good" });
    const validJson = JSON.stringify(validRecord);
    const malformed1 = '{"schemaVersion":1,"ts":'; // truncated
    const malformed2 = "not even json at all";
    const filePath = path.join(tmpDir, "2026-05.jsonl");
    await fs.writeFile(
      filePath,
      [validJson, malformed1, validJson, malformed2, validJson].join("\n") +
        "\n",
      "utf8",
    );

    const result = await aggregateTelemetry({
      period: "2026-05",
      telemetryRoot: tmpDir,
    });
    expect(result.totalRecords).toBe(3);
    expect(result.parseErrorCount).toBe(2);
  });
});

// ─── PARSE_REJECT_EXTRA_FIELD: closed-set whitelist on read ──────────────

describe("aggregateTelemetry — PARSE_REJECT_EXTRA_FIELD (NFR-S3)", () => {
  it("AGG_67_PARSE_REJECT_EXTRA_FIELD_1: extra `password` field → rejected on read", async () => {
    const validRecord = makeValidRecord({ step: "good" });
    const valid = JSON.stringify(validRecord);
    const tainted = JSON.stringify({ ...validRecord, password: "x" });
    const filePath = path.join(tmpDir, "2026-05.jsonl");
    await fs.writeFile(filePath, `${[valid, tainted].join("\n")}\n`, "utf8");

    const result = await aggregateTelemetry({
      period: "2026-05",
      telemetryRoot: tmpDir,
    });
    expect(result.totalRecords).toBe(1);
    expect(result.parseErrorCount).toBe(1);
  });
});

// ─── NO_FILE: ENOENT path ────────────────────────────────────────────────

describe("aggregateTelemetry — NO_FILE (ENOENT)", () => {
  it("AGG_67_NO_FILE_1: missing file → throws bare Error with canonical message", async () => {
    let captured: Error | undefined;
    try {
      await aggregateTelemetry({
        period: "2026-12",
        telemetryRoot: tmpDir,
      });
    } catch (e) {
      captured = e as Error;
    }
    expect(captured).toBeInstanceOf(Error);
    expect(captured?.message).toContain(
      "no JSONL records found for period 2026-12",
    );
  });
});

// ─── INVALID_PERIOD ─────────────────────────────────────────────────────

describe("aggregateTelemetry — INVALID_PERIOD", () => {
  it("AGG_67_INVALID_PERIOD_1: period 'not-a-date' → throws", async () => {
    let captured: Error | undefined;
    try {
      await aggregateTelemetry({
        period: "not-a-date",
        telemetryRoot: tmpDir,
      });
    } catch (e) {
      captured = e as Error;
    }
    expect(captured).toBeInstanceOf(Error);
    expect(captured?.message).toContain("invalid period format");
  });
});

// ─── NFR-P6 PERFORMANCE: < 2 seconds for one week ────────────────────────

describe("aggregateTelemetry — NFR-P6 < 2 seconds (architecture line 1395)", () => {
  it("AGG_67_NFR_P6_1: 1000 records → aggregate completes in < 2000 ms", async () => {
    // NFR-P6 (architecture line 1395) — < 2 seconds for one week of run logs.
    const records: TelemetryRecord[] = [];
    for (let i = 0; i < 1000; i++) {
      records.push(
        makeValidRecord({
          step: `step-${i % 10}`,
          durationMs: i,
          tokensIn: i * 10,
          tokensOut: i * 5,
          retries: i % 4,
        }),
      );
    }
    await writeJsonlFixture(tmpDir, "2026-05", records);

    const t0 = performance.now();
    const result = await aggregateTelemetry({
      period: "2026-05",
      telemetryRoot: tmpDir,
    });
    const elapsed = performance.now() - t0;

    expect(result.totalRecords).toBe(1000);
    expect(elapsed).toBeLessThan(2000);
  });
});

// ─── OUT_OF_SCOPE: AR42 + NFR-S2 ─────────────────────────────────────────

describe("aggregateTelemetry — OUT_OF_SCOPE (AR42 + NFR-S2)", () => {
  it("AGG_67_OUT_OF_SCOPE_1: telemetryRoot '/etc' → ScopeViolationError", async () => {
    let captured: unknown;
    try {
      await aggregateTelemetry({
        period: "2026-05",
        telemetryRoot: "/etc",
      });
    } catch (e) {
      captured = e;
    }
    expect(captured).toBeInstanceOf(ScopeViolationError);
  });
});
