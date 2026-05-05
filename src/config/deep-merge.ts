/**
 * src/config/deep-merge.ts — Recursive deep-merge helper for the
 * three-layer config resolution (Story 6.1, FR34-FR40, AR41).
 *
 * Foundational helper per AR41: ZERO imports. Pure-function recursive
 * merge.
 *
 * Per OQ-3 (Story 6.1) the merge follows the architecturally-correct
 * "project > user > defaults" semantics:
 *   - Records merge per-key — later layer wins on conflict.
 *   - Nested plain objects merge per-field — recursion preserves deep
 *     fields from earlier layers.
 *   - Arrays REPLACE (later wins; no concatenation) — avoids surprising
 *     additive semantics; matches the most common "user overrides
 *     default" expectation.
 *   - Primitives REPLACE (later wins).
 *   - `undefined` values SKIP (do not erase earlier-layer values).
 *   - `null` values REPLACE (explicit null is a value, not absence).
 *
 * The function does NOT use lodash/merge-deep (NFR-S1 minimal-dependency
 * principle). It supports any number of layers via rest args.
 */

/**
 * Returns true when `value` is a plain object (not an array, null, or
 * other built-in like Date/Map/Set). Plain objects are recursed into;
 * non-plain values are treated as primitives (replaced atomically).
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

/**
 * Recursively merges two values per the OQ-3 semantics. Pure function
 * — does NOT mutate either input.
 *
 * @internal
 */
function mergeTwo(base: unknown, override: unknown): unknown {
  // `undefined` SKIPS — do not erase the base value.
  if (override === undefined) {
    return base;
  }
  // If both are plain objects, recurse per-field.
  if (isPlainObject(base) && isPlainObject(override)) {
    const result: Record<string, unknown> = { ...base };
    for (const key of Object.keys(override)) {
      result[key] = mergeTwo(base[key], override[key]);
    }
    return result;
  }
  // Otherwise REPLACE: arrays, primitives, null, mismatched-shape values
  // all overwrite the base value atomically.
  return override;
}

/**
 * Deep-merges any number of layers in left-to-right order; the LAST
 * layer wins on conflict. Returns a fresh object (does not mutate
 * inputs).
 *
 * Generic `T` is the result shape — typically the application domain
 * type (e.g., `Config`). Layers are typed as `Partial<T>`-friendly via
 * `unknown` to support the loader's "merge raw YAML over typed
 * defaults" flow.
 *
 * @example
 *   deepMerge(
 *     { paths: { state: "a", runs: "b" } },
 *     { paths: { state: "c" } }
 *   )
 *   // => { paths: { state: "c", runs: "b" } }
 */
export function deepMerge<T>(...layers: ReadonlyArray<unknown>): T {
  if (layers.length === 0) {
    return {} as T;
  }
  let result: unknown = layers[0];
  for (let i = 1; i < layers.length; i++) {
    result = mergeTwo(result, layers[i]);
  }
  return result as T;
}
