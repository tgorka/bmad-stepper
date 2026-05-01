/**
 * src/schemas/verifier-result.test.ts — Unit tests for
 * `VerifierResultV1Schema` (AC-1).
 *
 * Coverage:
 *   - Positive parse of the canonical fixture.
 *   - Missing required field (`status`).
 *   - `status` enum exhaustive (`"unknown"` rejected).
 *
 * Also exports `canonicalVerifierResultV1Fixture` for cross-file reuse by
 * `migration.test.ts`.
 */

import { describe, expect, it } from "bun:test";
import {
  type VerifierResultV1,
  VerifierResultV1Schema,
} from "./verifier-result.ts";

export const canonicalVerifierResultV1Fixture = {
  schemaVersion: 1 as const,
  status: "pass" as const,
  checks: [],
  promotedTo: null,
} satisfies VerifierResultV1;

describe("VerifierResultV1Schema", () => {
  it("parses the canonical verifier result v1 fixture", () => {
    const parsed = VerifierResultV1Schema.parse(
      canonicalVerifierResultV1Fixture,
    );
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.status).toBe("pass");
    expect(parsed.checks).toEqual([]);
    expect(parsed.promotedTo).toBeNull();
  });

  it("rejects when status is absent", () => {
    const result = VerifierResultV1Schema.safeParse({
      schemaVersion: 1,
      checks: [],
      promotedTo: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown status enum value", () => {
    const result = VerifierResultV1Schema.safeParse({
      ...canonicalVerifierResultV1Fixture,
      status: "unknown",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a populated checks array", () => {
    const parsed = VerifierResultV1Schema.parse({
      schemaVersion: 1,
      status: "fail",
      checks: [
        { name: "biome", status: "pass", detail: "Checked 20 files." },
        { name: "tests", status: "fail", detail: "1 test failed." },
      ],
      promotedTo: null,
    });
    expect(parsed.checks).toHaveLength(2);
    expect(parsed.checks[0]?.name).toBe("biome");
  });

  it("rejects a check with an unknown nested status", () => {
    const result = VerifierResultV1Schema.safeParse({
      schemaVersion: 1,
      status: "pass",
      checks: [{ name: "x", status: "weird", detail: "y" }],
      promotedTo: null,
    });
    expect(result.success).toBe(false);
  });
});
