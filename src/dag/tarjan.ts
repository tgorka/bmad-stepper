/**
 * src/dag/tarjan.ts — Standard Tarjan strongly-connected-components algorithm
 * (FR8, FR9, AR33, AR41).
 *
 * Pure-function module per AR41 mid-tier boundary (architecture lines
 * 1278-1304): zero imports from any project file (including the local
 * ./types.ts — the function operates on a generic `ReadonlyMap<string,
 * ReadonlySet<string>>` adjacency input). The single export is
 * `tarjanScc()`, a synchronous, deterministic SCC computation.
 *
 * Architecture compliance:
 *   - §D6 line 467 — Tarjan SCC cycle detection on adjacency lists.
 *   - AR41        — `src/dag/` is mid-tier; this file imports nothing.
 *   - AR33        — synchronous, no IO, no `console.*`.
 *
 * Algorithm: standard recursive Tarjan's algorithm. Each unindexed node
 * triggers a `strongconnect` traversal that maintains an `index` counter,
 * `indices` and `lowlinks` maps, an `onStack` set, and a stack of nodes.
 * When a node's lowlink equals its index, the stack is popped down to and
 * including that node and the popped slice is one SCC. Recursion depth on
 * ~30-50 nodes is well within Bun's default stack — iterative variant
 * deferred until a regression surfaces.
 *
 * Edge cases:
 *   - Empty graph                     → returns `[]`.
 *   - Single node, no edges           → returns `[[node]]` (NOT a cycle —
 *                                        cycles are SCCs of size > 1).
 *   - Self-loop A → A                 → returns `[[A]]` of size 1, but
 *                                        `edgesOut.get(A)?.has(A)` is true.
 *                                        The CALLER must detect self-loops
 *                                        separately via this predicate
 *                                        (`build()` does this in step 6).
 *                                        `tarjan.ts` is purely topological.
 *   - Multiple disconnected cycles    → returns multiple size-> 1 SCCs.
 *   - Mixed acyclic + cyclic          → returns a mix of size-1 and size-> 1
 *                                        SCCs.
 *
 * Determinism: iteration order over `edgesOut.keys()` matches the input
 * Map's insertion order, which the seed array determines (Story 1.10
 * `seed-v6.x.ts`). Two consecutive calls on the same input produce
 * identical output.
 *
 * Forward note: Story 3.6 / 3.7 (`--explain` / `--list`) will land
 * `src/dag/sort.ts` for topological sorting; `sort.ts` may absorb or
 * import this file. The architecture (lines 1155-1161) names the future
 * file `sort.ts` rather than `tarjan.ts`; Story 1.10 ships standalone
 * `tarjan.ts` and defers the rename.
 */

/**
 * Compute the strongly-connected components of a directed graph.
 *
 * @param edgesOut - Adjacency map: `node → set of successors`. Direction
 *                   convention: `edgesOut.get(A) = {B, C}` means edges
 *                   `A → B` and `A → C` (A is a prerequisite for B and C).
 * @returns Array of SCCs. Each SCC is a non-empty array of node names.
 *          An SCC of size > 1 is a cycle. A size-1 SCC `[A]` is a cycle
 *          ONLY if `edgesOut.get(A)?.has(A)` is true (self-loop) — the
 *          caller checks this separately.
 */
export function tarjanScc(
  edgesOut: ReadonlyMap<string, ReadonlySet<string>>,
): string[][] {
  let index = 0;
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const result: string[][] = [];

  const strongconnect = (v: string): void => {
    indices.set(v, index);
    lowlinks.set(v, index);
    index += 1;
    stack.push(v);
    onStack.add(v);

    const successors = edgesOut.get(v);
    if (successors !== undefined) {
      for (const w of successors) {
        if (!indices.has(w)) {
          strongconnect(w);
          // biome-ignore lint/style/noNonNullAssertion: lowlinks[w] set by recursive strongconnect above
          lowlinks.set(v, Math.min(lowlinks.get(v)!, lowlinks.get(w)!));
        } else if (onStack.has(w)) {
          // biome-ignore lint/style/noNonNullAssertion: indices[w] set on entry to strongconnect(w)
          lowlinks.set(v, Math.min(lowlinks.get(v)!, indices.get(w)!));
        }
      }
    }

    if (lowlinks.get(v) === indices.get(v)) {
      const scc: string[] = [];
      let w: string | undefined;
      do {
        w = stack.pop();
        if (w === undefined) {
          break;
        }
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      result.push(scc);
    }
  };

  for (const node of edgesOut.keys()) {
    if (!indices.has(node)) {
      strongconnect(node);
    }
  }

  return result;
}
