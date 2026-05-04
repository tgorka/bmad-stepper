/**
 * src/dag/tarjan.test.ts — Pure-function tests for `tarjanScc`.
 *
 * No IO, no tmpdir setup — pure synthetic adjacency lists. Covers AC-3
 * Tarjan SCC cycle detection invariants and the self-loop edge case the
 * caller (`build()`) handles separately.
 */

import { describe, expect, it } from "bun:test";
import { tarjanScc } from "./tarjan.ts";

describe("tarjanScc", () => {
  it("returns empty array for an empty graph", () => {
    const edges = new Map<string, ReadonlySet<string>>();
    const sccs = tarjanScc(edges);
    expect(sccs).toEqual([]);
  });

  it("returns one SCC of size 1 for a single node with no edges", () => {
    const edges = new Map<string, ReadonlySet<string>>([
      ["A", new Set<string>()],
    ]);
    const sccs = tarjanScc(edges);
    expect(sccs).toEqual([["A"]]);
  });

  it("returns three SCCs of size 1 for a linear chain A->B->C", () => {
    const edges = new Map<string, ReadonlySet<string>>([
      ["A", new Set(["B"])],
      ["B", new Set(["C"])],
      ["C", new Set<string>()],
    ]);
    const sccs = tarjanScc(edges);
    expect(sccs).toHaveLength(3);
    for (const scc of sccs) {
      expect(scc).toHaveLength(1);
    }
    const allNames = sccs.flat().sort();
    expect(allNames).toEqual(["A", "B", "C"]);
  });

  it("returns one SCC of size 2 for a 2-cycle A<->B", () => {
    const edges = new Map<string, ReadonlySet<string>>([
      ["A", new Set(["B"])],
      ["B", new Set(["A"])],
    ]);
    const sccs = tarjanScc(edges);
    expect(sccs).toHaveLength(1);
    const first = sccs[0];
    expect(first).toBeDefined();
    if (first !== undefined) {
      expect([...first].sort()).toEqual(["A", "B"]);
    }
  });

  it("returns one SCC of size 3 for a 3-cycle A->B->C->A", () => {
    const edges = new Map<string, ReadonlySet<string>>([
      ["A", new Set(["B"])],
      ["B", new Set(["C"])],
      ["C", new Set(["A"])],
    ]);
    const sccs = tarjanScc(edges);
    expect(sccs).toHaveLength(1);
    const first = sccs[0];
    expect(first).toBeDefined();
    if (first !== undefined) {
      expect([...first].sort()).toEqual(["A", "B", "C"]);
    }
  });

  it("returns multiple SCCs for two disconnected 2-cycles", () => {
    const edges = new Map<string, ReadonlySet<string>>([
      ["A", new Set(["B"])],
      ["B", new Set(["A"])],
      ["C", new Set(["D"])],
      ["D", new Set(["C"])],
    ]);
    const sccs = tarjanScc(edges);
    expect(sccs).toHaveLength(2);
    for (const scc of sccs) {
      expect(scc).toHaveLength(2);
    }
    const flat = sccs.flat().sort();
    expect(flat).toEqual(["A", "B", "C", "D"]);
  });

  it("returns mixed SCCs for an acyclic component plus a cycle", () => {
    const edges = new Map<string, ReadonlySet<string>>([
      ["A", new Set(["B"])],
      ["B", new Set(["C"])],
      ["C", new Set<string>()],
      ["D", new Set(["E"])],
      ["E", new Set(["D"])],
    ]);
    const sccs = tarjanScc(edges);
    expect(sccs).toHaveLength(4);
    const sizes = sccs.map((s) => s.length).sort();
    expect(sizes).toEqual([1, 1, 1, 2]);
    const cycle = sccs.find((s) => s.length === 2);
    expect(cycle).toBeDefined();
    if (cycle !== undefined) {
      expect([...cycle].sort()).toEqual(["D", "E"]);
    }
  });

  it("identifies a self-loop as an SCC of size 1; caller checks edgesOut.get(A).has(A)", () => {
    const edges = new Map<string, ReadonlySet<string>>([["A", new Set(["A"])]]);
    const sccs = tarjanScc(edges);
    expect(sccs).toEqual([["A"]]);
    // Caller-side cycle detection contract: size-1 SCC with self-edge IS a cycle.
    expect(edges.get("A")?.has("A")).toBe(true);
  });

  it("is deterministic across consecutive invocations on the same input", () => {
    const edges = new Map<string, ReadonlySet<string>>([
      ["alpha", new Set(["beta"])],
      ["beta", new Set(["gamma"])],
      ["gamma", new Set<string>()],
      ["delta", new Set(["epsilon"])],
      ["epsilon", new Set(["delta"])],
    ]);
    const a = tarjanScc(edges);
    const b = tarjanScc(edges);
    expect(a).toEqual(b);
  });
});
