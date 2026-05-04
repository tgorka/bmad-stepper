/**
 * src/schemas/pid.test.ts — Unit tests for `PidFileV1Schema` (AC-1).
 *
 * Coverage:
 *   - Positive parse of the Story 1.4 actual on-disk shape (no
 *     `schemaVersion`); Zod's `.default(1)` populates the field.
 *   - Positive parse with `schemaVersion: 1` explicitly set.
 *   - Missing required field (`pid`).
 *   - Wrong field type (`pid: "1234"` rejected).
 *
 * Also exports `canonicalPidFileV1Fixture` representing the legacy
 * (no-version) on-disk shape that Story 1.4's writer emits.
 */

import { describe, expect, it } from "bun:test";
import { PidFileV1Schema } from "./pid.ts";

export const canonicalPidFileV1Fixture = {
  pid: 12345,
  hostname: "host.local",
  acquiredAt: "2026-04-30T12:00:00.000Z",
  heartbeatIntervalMs: 5000,
};

describe("PidFileV1Schema", () => {
  it("parses the Story 1.4 actual on-disk shape (no schemaVersion)", () => {
    const parsed = PidFileV1Schema.parse(canonicalPidFileV1Fixture);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.pid).toBe(12345);
    expect(parsed.hostname).toBe("host.local");
    expect(parsed.acquiredAt).toBe("2026-04-30T12:00:00.000Z");
    expect(parsed.heartbeatIntervalMs).toBe(5000);
  });

  it("parses with schemaVersion: 1 explicitly set", () => {
    const parsed = PidFileV1Schema.parse({
      schemaVersion: 1,
      ...canonicalPidFileV1Fixture,
    });
    expect(parsed.schemaVersion).toBe(1);
  });

  it("rejects when pid is absent", () => {
    const result = PidFileV1Schema.safeParse({
      hostname: "host.local",
      acquiredAt: "2026-04-30T12:00:00.000Z",
      heartbeatIntervalMs: 5000,
    });
    expect(result.success).toBe(false);
  });

  it("rejects when pid is a string instead of number", () => {
    const result = PidFileV1Schema.safeParse({
      ...canonicalPidFileV1Fixture,
      pid: "12345",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when heartbeatIntervalMs is absent", () => {
    const result = PidFileV1Schema.safeParse({
      pid: 12345,
      hostname: "host.local",
      acquiredAt: "2026-04-30T12:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when schemaVersion is 2 (literal(1))", () => {
    const result = PidFileV1Schema.safeParse({
      schemaVersion: 2,
      ...canonicalPidFileV1Fixture,
    });
    expect(result.success).toBe(false);
  });
});
