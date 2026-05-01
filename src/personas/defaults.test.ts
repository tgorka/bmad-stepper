/**
 * src/personas/defaults.test.ts — TYPE-level mirroring contract assertion
 * between `defaults.ts` and `src/dag/seed-v6.x.ts` (AR41 test-only
 * cross-module import allowance).
 *
 * Architecture compliance:
 *   - AR41 line 1296   — `src/personas/` is mid-tier. The runtime
 *                        `defaults.ts` does NOT import from `src/dag/`.
 *                        This test file IS allowed to import the seed
 *                        because the AR41 import-restriction CI check
 *                        excludes `*.test.ts` files (test files often
 *                        need cross-module assertions).
 *   - §D13 lines 631-642 — 4-tier resolution; `DEFAULT_PERSONAS` is Tier 3.
 *
 * The TYPE-level mirroring contract (Story 1.10 INFO-1 forward-dep):
 *   1. Every non-null `seedV6_x[].persona` MUST have a matching entry in
 *      `DEFAULT_PERSONAS` with the same value (deep equality for arrays).
 *   2. Every key in `DEFAULT_PERSONAS` MUST exist as a `seedV6_x[].name`.
 *   3. Null-persona seed entries are OMITTED from `DEFAULT_PERSONAS` (they
 *      fall through to Tier 4 or throw).
 */

import { describe, expect, it } from "bun:test";
import { seedV6_x } from "../dag/seed-v6.x.ts";
import { DEFAULT_PERSONAS } from "./defaults.ts";

describe("DEFAULT_PERSONAS", () => {
  it("is a non-empty record", () => {
    const keys = Object.keys(DEFAULT_PERSONAS);
    expect(keys.length).toBeGreaterThan(0);
  });

  it("mirrors every non-null seed persona entry (TYPE-level contract)", () => {
    for (const seed of seedV6_x) {
      if (seed.persona === null) {
        continue;
      }
      const fromDefaults = DEFAULT_PERSONAS[seed.name];
      expect(fromDefaults).toBeDefined();
      // Deep-equality: arrays compare element-wise; strings compare directly.
      if (Array.isArray(seed.persona)) {
        expect(Array.isArray(fromDefaults)).toBe(true);
        expect([...(fromDefaults as readonly string[])]).toEqual([
          ...seed.persona,
        ]);
      } else {
        expect(fromDefaults).toBe(seed.persona);
      }
    }
  });

  it("every defaults key exists as a seed entry name", () => {
    const seedNames = new Set(seedV6_x.map((entry) => entry.name));
    for (const key of Object.keys(DEFAULT_PERSONAS)) {
      expect(seedNames.has(key)).toBe(true);
    }
  });

  it("null-persona seed entries are absent from defaults", () => {
    for (const seed of seedV6_x) {
      if (seed.persona === null) {
        expect(DEFAULT_PERSONAS[seed.name]).toBeUndefined();
      }
    }
  });

  it("uses kebab-case persona identifiers from the canonical set", () => {
    const allowed = new Set([
      "analyst",
      "pm",
      "architect",
      "ux-designer",
      "dev",
      "tech-writer",
      "tea",
    ]);
    for (const value of Object.values(DEFAULT_PERSONAS)) {
      const ids = Array.isArray(value) ? value : [value];
      for (const id of ids) {
        expect(allowed.has(id)).toBe(true);
      }
    }
  });
});
