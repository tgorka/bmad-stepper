/**
 * src/config/deep-merge.test.ts — Unit tests for `deepMerge` (Story 6.1).
 *
 * Coverage per OQ-3 semantics:
 *   - Empty / single / two-layer / three-layer combinations.
 *   - Nested object deep-merge.
 *   - Arrays REPLACE (no concatenation).
 *   - Primitives REPLACE.
 *   - undefined SKIPS (does not erase earlier layer).
 *   - null REPLACES (explicit null is a value).
 *   - Empty record at higher layer DOES NOT erase deeper-layer entries.
 *     (Per OQ-3 deep-merge semantics: an empty record means "no new
 *     entries"; deep-merge per-field preserves the deeper layer's
 *     entries unchanged. Replacement requires explicit per-key
 *     overrides.)
 */

import { describe, expect, it } from "bun:test";
import { deepMerge } from "./deep-merge.ts";

describe("MERGE_61_*: deepMerge (Story 6.1)", () => {
  it("MERGE_61_1: empty layers list returns empty object", () => {
    const result = deepMerge();
    expect(result).toEqual({});
  });

  it("MERGE_61_2: single layer returns the layer (identity)", () => {
    const result = deepMerge<{ a: number }>({ a: 1 });
    expect(result).toEqual({ a: 1 });
  });

  it("MERGE_61_3: two layers — top-level keys merge per-key", () => {
    const result = deepMerge<{ a: number; b: number }>(
      { a: 1, b: 2 },
      { b: 20 },
    );
    expect(result).toEqual({ a: 1, b: 20 });
  });

  it("MERGE_61_4: three layers — last layer wins on conflict", () => {
    const result = deepMerge<{ a: number; b: number; c: number }>(
      { a: 1, b: 1, c: 1 },
      { b: 2, c: 2 },
      { c: 3 },
    );
    expect(result).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("MERGE_61_5: nested objects deep-merge per-field (paths block scenario)", () => {
    const result = deepMerge<{
      paths: { state: string; runs: string; staging: string };
    }>(
      {
        paths: {
          state: "default-state",
          runs: "default-runs",
          staging: "default-staging",
        },
      },
      {
        paths: { state: "user-state" } as {
          state: string;
          runs: string;
          staging: string;
        },
      },
      {
        paths: { runs: "project-runs" } as {
          state: string;
          runs: string;
          staging: string;
        },
      },
    );
    expect(result.paths).toEqual({
      state: "user-state",
      runs: "project-runs",
      staging: "default-staging",
    });
  });

  it("MERGE_61_6: arrays REPLACE — project's array overwrites user's array", () => {
    const result = deepMerge<{ personas: { dev: string[] } }>(
      { personas: { dev: ["custom-dev", "amelia"] } },
      { personas: { dev: ["dev"] } },
    );
    expect(result.personas.dev).toEqual(["dev"]);
  });

  it("MERGE_61_7: undefined value at higher layer does NOT erase earlier value", () => {
    const result = deepMerge<{ paths: { runs: string | undefined } }>(
      { paths: { runs: "user-runs" } },
      { paths: { runs: undefined } },
    );
    expect(result.paths.runs).toBe("user-runs");
  });

  it("MERGE_61_8: empty record at higher layer DOES NOT erase deeper-layer entries (deep-merge per-field)", () => {
    const result = deepMerge<{ failurePolicies: Record<string, string> }>(
      { failurePolicies: { "dev-story": "retry" } },
      { failurePolicies: {} },
    );
    expect(result.failurePolicies).toEqual({ "dev-story": "retry" });
  });

  it("MERGE_61_9: null at higher layer REPLACES earlier value (explicit null is a value)", () => {
    const result = deepMerge<{ x: number | null }>({ x: 1 }, { x: null });
    expect(result.x).toBeNull();
  });

  it("MERGE_61_10: mixed primitives — later string overwrites earlier number", () => {
    const result = deepMerge<{ x: unknown }>({ x: 1 }, { x: "two" });
    expect(result.x).toBe("two");
  });

  it("MERGE_61_11: array → object replacement (mismatched shape)", () => {
    const result = deepMerge<{ x: unknown }>({ x: [1, 2, 3] }, { x: { a: 1 } });
    expect(result.x).toEqual({ a: 1 });
  });

  it("MERGE_61_12: object → array replacement (mismatched shape)", () => {
    const result = deepMerge<{ x: unknown }>({ x: { a: 1 } }, { x: [1, 2] });
    expect(result.x).toEqual([1, 2]);
  });

  it("MERGE_61_13: deeply nested per-step budgets — both fields preserved", () => {
    const result = deepMerge<{
      budgets: { "dev-story": { contextTokens?: number; timeoutMs?: number } };
    }>(
      { budgets: { "dev-story": { contextTokens: 60000 } } },
      { budgets: { "dev-story": { timeoutMs: 300000 } } },
    );
    expect(result.budgets["dev-story"]).toEqual({
      contextTokens: 60000,
      timeoutMs: 300000,
    });
  });

  it("MERGE_61_14: pure-function — does not mutate inputs", () => {
    const a = { paths: { state: "a" } };
    const b = { paths: { runs: "b" } };
    const result = deepMerge<{ paths: { state?: string; runs?: string } }>(
      a,
      b,
    );
    expect(a).toEqual({ paths: { state: "a" } });
    expect(b).toEqual({ paths: { runs: "b" } });
    expect(result.paths).toEqual({ state: "a", runs: "b" });
  });

  it("MERGE_61_15: skips undefined layer entirely", () => {
    const result = deepMerge<{ a: number }>({ a: 1 }, undefined);
    expect(result).toEqual({ a: 1 });
  });
});
