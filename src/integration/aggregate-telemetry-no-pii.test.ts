/**
 * src/integration/aggregate-telemetry-no-pii.test.ts — AC-3 PRIMARY
 * integration test (Story 6.7).
 *
 * Cross-module integration test: writes a fixture JSONL file (mirroring
 * Story 6.6 collector output), runs the aggregator + renderer, then
 * sweeps the rendered markdown for known-PII surfaces. Belt-and-braces
 * verification beyond the schema-level closed-set whitelist guarantee.
 *
 * AC-3 (epics.md line 1259) — report contains no PII / no source content.
 * NFR-S3 (architecture line 1664) — no-PII closed-set transitive guarantee.
 *
 * AR35: tmpdir per test; cleanup in afterEach.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { TelemetryRecord } from "../schemas/telemetry.ts";
import { aggregateTelemetry } from "../telemetry/aggregate.ts";
import { renderTelemetryReport } from "../telemetry/render-report.ts";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-no-pii-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// AC-3 (epics.md line 1259) — report contains no PII / no source content.
// NFR-S3 (architecture line 1664) — no-PII closed-set transitive guarantee.
const FORBIDDEN_PII_SUBSTRINGS = [
  "password",
  "prompt",
  "response",
  "apikey",
  "secret",
  "homedir",
  "email",
  "userinput",
  "userprompt",
];

describe("aggregate-telemetry — no PII / no source content (AC-3)", () => {
  it("AC-3 PRIMARY: rendered markdown contains zero forbidden PII substrings", async () => {
    // Fixture: 10 records with varied step / persona / model / errorCode.
    const records: TelemetryRecord[] = [
      {
        schemaVersion: 1,
        ts: "2026-05-01T00:00:00.000Z",
        step: "bmad-create-story",
        phase: "planning",
        persona: "po",
        model: "sonnet",
        durationMs: 12345,
        verifierStatus: "pass",
        retries: 0,
        tokensIn: 1000,
        tokensOut: 500,
      },
      {
        schemaVersion: 1,
        ts: "2026-05-02T00:00:00.000Z",
        step: "bmad-dev-story",
        phase: "implementation",
        persona: "dev",
        model: "opus",
        durationMs: 23456,
        verifierStatus: "fail",
        retries: 2,
        tokensIn: 5000,
        tokensOut: 2500,
        errorCode: "VERIFIER_FAILURE",
      },
      {
        schemaVersion: 1,
        ts: "2026-05-03T00:00:00.000Z",
        step: "bmad-code-review",
        phase: "implementation",
        persona: "qa",
        model: "haiku",
        durationMs: 5000,
        verifierStatus: "pass",
        retries: 0,
        tokensIn: 800,
        tokensOut: 200,
      },
      {
        schemaVersion: 1,
        ts: "2026-05-04T00:00:00.000Z",
        step: "bmad-create-story",
        phase: "planning",
        persona: "po",
        model: "sonnet",
        durationMs: 10000,
        verifierStatus: "skip",
        retries: 1,
        tokensIn: 600,
        tokensOut: 300,
        errorCode: "TIMEOUT",
      },
      {
        schemaVersion: 1,
        ts: "2026-05-05T00:00:00.000Z",
        step: "bmad-dev-story",
        phase: "implementation",
        persona: "dev",
        model: "sonnet",
        durationMs: 17000,
        verifierStatus: "fail",
        retries: 3,
        tokensIn: 4000,
        tokensOut: 1500,
        errorCode: "VERIFIER_FAILURE",
      },
      {
        schemaVersion: 1,
        ts: "2026-05-06T00:00:00.000Z",
        step: "bmad-code-review",
        phase: "implementation",
        persona: "qa",
        model: "haiku",
        durationMs: 3000,
        verifierStatus: "pass",
        retries: 0,
        tokensIn: 500,
        tokensOut: 100,
      },
      {
        schemaVersion: 1,
        ts: "2026-05-07T00:00:00.000Z",
        step: "bmad-checkpoint-preview",
        phase: "review",
        persona: "qa",
        model: "haiku",
        durationMs: 7000,
        verifierStatus: "pass",
        retries: 0,
        tokensIn: 200,
        tokensOut: 50,
      },
      {
        schemaVersion: 1,
        ts: "2026-05-08T00:00:00.000Z",
        step: "bmad-create-story",
        phase: "planning",
        persona: "po",
        model: "sonnet",
        durationMs: 9000,
        verifierStatus: "pass",
        retries: 0,
        tokensIn: 1100,
        tokensOut: 550,
      },
      {
        schemaVersion: 1,
        ts: "2026-05-09T00:00:00.000Z",
        step: "bmad-dev-story",
        phase: "implementation",
        persona: "dev",
        model: "opus",
        durationMs: 30000,
        verifierStatus: "pass",
        retries: 1,
        tokensIn: 6000,
        tokensOut: 3000,
      },
      {
        schemaVersion: 1,
        ts: "2026-05-10T00:00:00.000Z",
        step: "bmad-checkpoint-preview",
        phase: "review",
        persona: "qa",
        model: "haiku",
        durationMs: 4000,
        verifierStatus: "pass",
        retries: 0,
        tokensIn: 250,
        tokensOut: 80,
      },
    ];

    const filePath = path.join(tmpDir, "2026-05.jsonl");
    await fs.writeFile(
      filePath,
      records.map((r) => JSON.stringify(r)).join("\n") + "\n",
      "utf8",
    );

    const aggregate = await aggregateTelemetry({
      period: "2026-05",
      telemetryRoot: tmpDir,
    });
    const markdown = renderTelemetryReport(aggregate);

    expect(aggregate.totalRecords).toBe(10);
    expect(aggregate.parseErrorCount).toBe(0);

    // AC-3 PRIMARY: lowercase-sweep ~10 known-PII surfaces. Lowercase to
    // catch mixed-case PII patterns. The renderer's literal output is all
    // ASCII so the lowercase comparison is well-defined.
    const lower = markdown.toLowerCase();
    for (const forbidden of FORBIDDEN_PII_SUBSTRINGS) {
      expect(lower).not.toContain(forbidden.toLowerCase());
    }

    // AC-3 SECONDARY: ensure error codes were aggregated (I-47 verified).
    expect(aggregate.failurePatterns).toEqual({
      VERIFIER_FAILURE: 2,
      TIMEOUT: 1,
    });
  });
});
