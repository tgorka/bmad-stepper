/**
 * src/schemas/telemetry.test.ts — Unit tests for `TelemetryRecordV1Schema`
 * (AC-1; closed-set NFR-S3 enforcement).
 *
 * Coverage:
 *   - Positive parse of the canonical closed-set fixture.
 *   - Missing required field (`durationMs`).
 *   - Wrong field type (`retries: "0"` fails).
 *   - **Extra-field rejection** (NFR-S3 anti-PII): `{ ..., projectName: "secret" }`
 *     fails because the schema is `.strict()`.
 *
 * Also exports `canonicalTelemetryRecordV1Fixture` for cross-file reuse by
 * `migration.test.ts`.
 */

import { describe, expect, it } from "bun:test";
import {
  type TelemetryRecordV1,
  TelemetryRecordV1Schema,
} from "./telemetry.ts";

export const canonicalTelemetryRecordV1Fixture = {
  schemaVersion: 1 as const,
  ts: "2026-04-30T12:00:00.000Z",
  step: "bmad-dev-story",
  phase: "implementation",
  persona: "bmad-dev-story",
  model: "claude-opus-4-7",
  durationMs: 1234,
  verifierStatus: "pass" as const,
  retries: 0,
  tokensIn: 100,
  tokensOut: 200,
} satisfies TelemetryRecordV1;

describe("TelemetryRecordV1Schema", () => {
  it("parses the canonical telemetry record v1 fixture", () => {
    const parsed = TelemetryRecordV1Schema.parse(
      canonicalTelemetryRecordV1Fixture,
    );
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.step).toBe("bmad-dev-story");
    expect(parsed.verifierStatus).toBe("pass");
    expect(parsed.retries).toBe(0);
  });

  it("rejects when durationMs is absent", () => {
    const result = TelemetryRecordV1Schema.safeParse({
      ...canonicalTelemetryRecordV1Fixture,
      durationMs: undefined,
    });
    expect(result.success).toBe(false);
  });

  it("rejects when retries is a string instead of number", () => {
    const result = TelemetryRecordV1Schema.safeParse({
      ...canonicalTelemetryRecordV1Fixture,
      retries: "0",
    });
    expect(result.success).toBe(false);
  });

  it("rejects extra fields (NFR-S3 anti-PII; .strict() enforced)", () => {
    const result = TelemetryRecordV1Schema.safeParse({
      ...canonicalTelemetryRecordV1Fixture,
      projectName: "secret",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown verifierStatus enum value", () => {
    const result = TelemetryRecordV1Schema.safeParse({
      ...canonicalTelemetryRecordV1Fixture,
      verifierStatus: "unknown",
    });
    expect(result.success).toBe(false);
  });

  it("accepts an optional errorCode field", () => {
    const parsed = TelemetryRecordV1Schema.parse({
      ...canonicalTelemetryRecordV1Fixture,
      errorCode: "VERIFIER_FAILURE",
    });
    expect(parsed.errorCode).toBe("VERIFIER_FAILURE");
  });
});
