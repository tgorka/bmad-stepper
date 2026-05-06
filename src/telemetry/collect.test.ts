/**
 * src/telemetry/collect.test.ts — coverage for `writeTelemetryRecord`
 * (Story 6.6 — AC-1 + AC-2 + AC-3 — TLM_66_COLLECT_*).
 *
 * AR35: tmpdir per `it(...)` block; cleanup in `afterEach`. Tests MUST
 * NOT touch `_bmad-output/` (the real project's output directory).
 *
 * AC mapping:
 *   - AC-1 (write success): TLM_66_COLLECT_WRITE_*, TLM_66_COLLECT_APPEND_*,
 *     TLM_66_COLLECT_DIFFERENT_MONTHS_*, TLM_66_COLLECT_PATH_*,
 *     TLM_66_COLLECT_MKDIR_*.
 *   - AC-2 (Zod rejection): TLM_66_COLLECT_REJECT_EXTRA_* (PRIMARY),
 *     TLM_66_COLLECT_REJECT_MISSING_*, TLM_66_COLLECT_REJECT_BAD_*.
 *   - AC-3 (opt-in gate): NOT in this file — opt-in is gated at the
 *     verify-and-advance call site (TLM_66_VANDA_DISABLED_*). This
 *     module's writer ALWAYS writes when called; the gate lives in the
 *     consumer.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { TelemetryRecord } from "../schemas/telemetry.ts";
import { writeTelemetryRecord } from "./collect.ts";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "stepper-telemetry-"));
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
    durationMs: 12345,
    verifierStatus: "pass",
    retries: 0,
    tokensIn: 1000,
    tokensOut: 500,
    ...overrides,
  };
}

async function readJsonlLines(filePath: string): Promise<string[]> {
  const text = await fs.readFile(filePath, "utf8");
  return text.split("\n").filter((line) => line.length > 0);
}

// ─── AC-1 happy-path: write a single valid record ────────────────────────

describe("writeTelemetryRecord — AC-1 happy-path (write valid record)", () => {
  it("TLM_66_COLLECT_WRITE_1: writes a single line to <YYYY-MM>.jsonl matching the input record", async () => {
    const record = makeValidRecord();
    const result = await writeTelemetryRecord(record, {
      telemetryRoot: tmpDir,
    });

    expect(result.filePath).toBe(path.join(tmpDir, "2026-05.jsonl"));

    const lines = await readJsonlLines(result.filePath);
    expect(lines.length).toBe(1);

    const parsed = JSON.parse(lines[0] as string);
    expect(parsed).toEqual(record);
  });

  it("TLM_66_COLLECT_WRITE_2: parses back through the same Zod schema for round-trip", async () => {
    const record = makeValidRecord({ verifierStatus: "fail" });
    const result = await writeTelemetryRecord(record, {
      telemetryRoot: tmpDir,
    });

    const lines = await readJsonlLines(result.filePath);
    const reparsed = JSON.parse(lines[0] as string);
    // The strict schema rejects extras and verifies enum/literal values.
    const { TelemetryRecordV1Schema } = await import("../schemas/telemetry.ts");
    expect(() => TelemetryRecordV1Schema.parse(reparsed)).not.toThrow();
  });
});

// ─── AC-1: append two records to same monthly file ───────────────────────

describe("writeTelemetryRecord — AC-1 append-mode (multi-record same month)", () => {
  it("TLM_66_COLLECT_APPEND_1: writes two records to same <YYYY-MM>.jsonl → two lines", async () => {
    const recA = makeValidRecord({ step: "bmad-create-prd" });
    const recB = makeValidRecord({ step: "bmad-create-architecture" });
    await writeTelemetryRecord(recA, { telemetryRoot: tmpDir });
    const result = await writeTelemetryRecord(recB, { telemetryRoot: tmpDir });

    const lines = await readJsonlLines(result.filePath);
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0] as string).step).toBe("bmad-create-prd");
    expect(JSON.parse(lines[1] as string).step).toBe(
      "bmad-create-architecture",
    );
  });
});

// ─── AC-1: monthly rotation via ts.slice(0, 7) ──────────────────────────

describe("writeTelemetryRecord — AC-1 monthly rotation", () => {
  it("TLM_66_COLLECT_DIFFERENT_MONTHS_1: writes April + May records to two separate files", async () => {
    const aprilRec = makeValidRecord({ ts: "2026-04-30T23:59:59.999Z" });
    const mayRec = makeValidRecord({ ts: "2026-05-01T00:00:00.000Z" });

    const aprilResult = await writeTelemetryRecord(aprilRec, {
      telemetryRoot: tmpDir,
    });
    const mayResult = await writeTelemetryRecord(mayRec, {
      telemetryRoot: tmpDir,
    });

    expect(aprilResult.filePath).toBe(path.join(tmpDir, "2026-04.jsonl"));
    expect(mayResult.filePath).toBe(path.join(tmpDir, "2026-05.jsonl"));

    const aprilLines = await readJsonlLines(aprilResult.filePath);
    const mayLines = await readJsonlLines(mayResult.filePath);
    expect(aprilLines.length).toBe(1);
    expect(mayLines.length).toBe(1);
  });

  it("TLM_66_COLLECT_PATH_1: filePath = <telemetryRoot>/2026-05.jsonl for ts 2026-05-15", async () => {
    const record = makeValidRecord({ ts: "2026-05-15T10:00:00.000Z" });
    const result = await writeTelemetryRecord(record, {
      telemetryRoot: tmpDir,
    });
    expect(result.filePath).toBe(path.join(tmpDir, "2026-05.jsonl"));
  });
});

// ─── AC-2: closed-set whitelist enforcement (PRIMARY) ────────────────────

describe("writeTelemetryRecord — AC-2 closed-set field whitelist", () => {
  it('TLM_66_COLLECT_REJECT_EXTRA_1: rejects { ...validRecord, password: "secret" } via Zod throw', async () => {
    const malformed = {
      ...makeValidRecord(),
      password: "secret",
    } as unknown as TelemetryRecord;

    await expect(
      writeTelemetryRecord(malformed, { telemetryRoot: tmpDir }),
    ).rejects.toThrow();
  });

  it("TLM_66_COLLECT_REJECT_EXTRA_2: rejects extra `prompt` field", async () => {
    const malformed = {
      ...makeValidRecord(),
      prompt: "user input goes here",
    } as unknown as TelemetryRecord;

    await expect(
      writeTelemetryRecord(malformed, { telemetryRoot: tmpDir }),
    ).rejects.toThrow();
  });

  it("TLM_66_COLLECT_REJECT_EXTRA_3: rejects extra `response` field", async () => {
    const malformed = {
      ...makeValidRecord(),
      response: "model output goes here",
    } as unknown as TelemetryRecord;

    await expect(
      writeTelemetryRecord(malformed, { telemetryRoot: tmpDir }),
    ).rejects.toThrow();
  });

  it("TLM_66_COLLECT_REJECT_EXTRA_4: rejects extra `cwd` field (path leak)", async () => {
    const malformed = {
      ...makeValidRecord(),
      cwd: "/Users/me/projects",
    } as unknown as TelemetryRecord;

    await expect(
      writeTelemetryRecord(malformed, { telemetryRoot: tmpDir }),
    ).rejects.toThrow();
  });

  it("TLM_66_COLLECT_REJECT_EXTRA_5: no file is written on Zod failure", async () => {
    const malformed = {
      ...makeValidRecord(),
      apiKey: "sk-...",
    } as unknown as TelemetryRecord;

    await expect(
      writeTelemetryRecord(malformed, { telemetryRoot: tmpDir }),
    ).rejects.toThrow();

    // No JSONL file should exist after the failed parse.
    const expectedPath = path.join(tmpDir, "2026-05.jsonl");
    let exists = true;
    try {
      await fs.access(expectedPath);
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);
  });
});

// ─── Defence-in-depth: missing required fields ──────────────────────────

describe("writeTelemetryRecord — defence-in-depth (missing/bad fields)", () => {
  it("TLM_66_COLLECT_REJECT_MISSING_1: rejects record missing required `step`", async () => {
    const malformed = (() => {
      const { step: _step, ...rest } = makeValidRecord();
      return rest as unknown as TelemetryRecord;
    })();

    await expect(
      writeTelemetryRecord(malformed, { telemetryRoot: tmpDir }),
    ).rejects.toThrow();
  });

  it("TLM_66_COLLECT_REJECT_BAD_VERIFIER_STATUS_1: rejects verifierStatus typo `passing`", async () => {
    const malformed = makeValidRecord({
      verifierStatus: "passing" as unknown as TelemetryRecord["verifierStatus"],
    });

    await expect(
      writeTelemetryRecord(malformed, { telemetryRoot: tmpDir }),
    ).rejects.toThrow();
  });

  it("TLM_66_COLLECT_REJECT_BAD_TS_1: rejects malformed ts (no ISO prefix)", async () => {
    const malformed = makeValidRecord({ ts: "not-a-date" });

    await expect(
      writeTelemetryRecord(malformed, { telemetryRoot: tmpDir }),
    ).rejects.toThrow();
  });
});

// ─── mkdir-p idempotence ──────────────────────────────────────────────

describe("writeTelemetryRecord — mkdir-p idempotence", () => {
  it("TLM_66_COLLECT_MKDIR_1: telemetryRoot does not exist → first write succeeds", async () => {
    const nestedRoot = path.join(tmpDir, "deep", "nested", "telemetry");
    const record = makeValidRecord();
    const result = await writeTelemetryRecord(record, {
      telemetryRoot: nestedRoot,
    });
    expect(result.filePath).toBe(path.join(nestedRoot, "2026-05.jsonl"));
    const lines = await readJsonlLines(result.filePath);
    expect(lines.length).toBe(1);
  });

  it("TLM_66_COLLECT_MKDIR_2: second write to same root is idempotent", async () => {
    const record = makeValidRecord();
    await writeTelemetryRecord(record, { telemetryRoot: tmpDir });
    const result = await writeTelemetryRecord(record, {
      telemetryRoot: tmpDir,
    });
    const lines = await readJsonlLines(result.filePath);
    expect(lines.length).toBe(2);
  });
});

// ─── Optional errorCode handling ────────────────────────────────────────

describe("writeTelemetryRecord — optional errorCode field", () => {
  it("TLM_66_COLLECT_OPTIONAL_ERROR_CODE_1: record with errorCode → field present in JSON", async () => {
    const record = makeValidRecord({ errorCode: "VERIFIER_FAILURE" });
    const result = await writeTelemetryRecord(record, {
      telemetryRoot: tmpDir,
    });
    const lines = await readJsonlLines(result.filePath);
    const parsed = JSON.parse(lines[0] as string);
    expect(parsed.errorCode).toBe("VERIFIER_FAILURE");
  });

  it("TLM_66_COLLECT_NO_OPTIONAL_ERROR_CODE_1: record without errorCode → field absent (clean omit)", async () => {
    const record = makeValidRecord();
    const result = await writeTelemetryRecord(record, {
      telemetryRoot: tmpDir,
    });
    const lines = await readJsonlLines(result.filePath);
    const parsed = JSON.parse(lines[0] as string);
    expect(Object.hasOwn(parsed, "errorCode")).toBe(false);
  });
});

// ─── No-PII smoke (NFR-S3): every accepted key is in whitelisted set ───

describe("writeTelemetryRecord — NFR-S3 anti-PII closed-set boundary", () => {
  it("TLM_66_COLLECT_NO_PII_1: every key in serialized JSON is in the closed 12-field whitelist", async () => {
    const ALLOWED_KEYS: ReadonlySet<string> = new Set([
      "schemaVersion",
      "ts",
      "step",
      "phase",
      "persona",
      "model",
      "durationMs",
      "verifierStatus",
      "retries",
      "tokensIn",
      "tokensOut",
      "errorCode",
    ]);
    const record = makeValidRecord({ errorCode: "ANY_CODE" });
    const result = await writeTelemetryRecord(record, {
      telemetryRoot: tmpDir,
    });
    const lines = await readJsonlLines(result.filePath);
    const parsed = JSON.parse(lines[0] as string) as Record<string, unknown>;
    for (const key of Object.keys(parsed)) {
      expect(ALLOWED_KEYS.has(key)).toBe(true);
    }
  });
});
