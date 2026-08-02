import { beforeEach, describe, expect, it } from "vitest";
import { useGraphStore, alignableSelection } from "./store";
import type { AnyNode } from "./model/types";

/**
 * Aligning and distributing, which exist so that arranging a diagram does
 * not require dragging anything — and so that two boxes end up actually
 * level rather than nearly level.
 */

/** A node of a known size, so the arithmetic has something exact to hit. */
function node(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  parentId?: string,
): AnyNode {
  return {
    id,
    type: "shape",
    position: { x, y },
    selected: true,
    style: { width: w, height: h },
    data: { label: id, shape: "rect" },
    ...(parentId ? { parentId } : {}),
  } as unknown as AnyNode;
}

const boxes = () =>
  Object.fromEntries(
    useGraphStore.getState().nodes.map((n) => [n.id, { x: n.position.x, y: n.position.y }]),
  );

function seed(nodes: AnyNode[]) {
  useGraphStore.setState({ nodes, edges: [], code: "flowchart TD\n" });
}

beforeEach(() => {
  useGraphStore.setState({ nodes: [], edges: [] });
});

describe("what can be aligned", () => {
  it("needs at least two nodes", () => {
    seed([node("a", 0, 0, 100, 50)]);
    expect(alignableSelection(useGraphStore.getState().nodes)).toHaveLength(0);
  });

  it("ignores nodes that are not selected", () => {
    const a = node("a", 0, 0, 100, 50);
    const b = { ...node("b", 10, 10, 100, 50), selected: false } as AnyNode;
    seed([a, b]);
    expect(alignableSelection(useGraphStore.getState().nodes)).toHaveLength(0);
  });

  it("refuses a selection spanning different parents", () => {
    // A child's position is relative to its group, so comparing it with a
    // top-level node would be comparing two coordinate systems.
    seed([node("a", 0, 0, 100, 50), node("b", 10, 10, 100, 50, "g1")]);
    expect(alignableSelection(useGraphStore.getState().nodes)).toHaveLength(0);
  });

  it("accepts a selection sharing one parent", () => {
    seed([node("a", 0, 0, 100, 50, "g1"), node("b", 10, 10, 100, 50, "g1")]);
    expect(alignableSelection(useGraphStore.getState().nodes)).toHaveLength(2);
  });
});

describe("aligning", () => {
  beforeEach(() => {
    // Widths differ on purpose: an edge and a centre are different answers.
    seed([node("a", 0, 0, 100, 40), node("b", 50, 100, 200, 40), node("c", 30, 200, 60, 40)]);
  });

  it("puts every left edge on the leftmost one", () => {
    useGraphStore.getState().alignSelection("left");
    const p = boxes();
    expect([p.a.x, p.b.x, p.c.x]).toEqual([0, 0, 0]);
  });

  it("puts every right edge on the rightmost one", () => {
    useGraphStore.getState().alignSelection("right");
    const p = boxes();
    // The selection's right edge is b's: 50 + 200 = 250.
    expect([p.a.x + 100, p.b.x + 200, p.c.x + 60]).toEqual([250, 250, 250]);
  });

  it("centres on the middle of the selection, not the average node", () => {
    useGraphStore.getState().alignSelection("centerX");
    const p = boxes();
    // Bounding box spans 0..250, so every centre lands on 125.
    expect([p.a.x + 50, p.b.x + 100, p.c.x + 30]).toEqual([125, 125, 125]);
  });

  it("leaves the other axis alone", () => {
    const before = boxes();
    useGraphStore.getState().alignSelection("left");
    const after = boxes();
    expect([after.a.y, after.b.y, after.c.y]).toEqual([before.a.y, before.b.y, before.c.y]);
  });

  it("aligns tops and bottoms the same way", () => {
    useGraphStore.getState().alignSelection("top");
    expect(Object.values(boxes()).map((p) => p.y)).toEqual([0, 0, 0]);

    seed([node("a", 0, 0, 100, 40), node("b", 0, 100, 100, 80)]);
    useGraphStore.getState().alignSelection("bottom");
    const p = boxes();
    // The lowest edge is b's: 100 + 80 = 180.
    expect([p.a.y + 40, p.b.y + 80]).toEqual([180, 180]);
  });

  it("does nothing when there is nothing to align against", () => {
    seed([node("a", 7, 9, 100, 40)]);
    useGraphStore.getState().alignSelection("left");
    expect(boxes().a).toEqual({ x: 7, y: 9 });
  });
});

describe("distributing", () => {
  it("evens the gaps rather than the centres", () => {
    // Widths 100, 20, 100 across 0..400: equal centres and equal gaps are
    // different arrangements, and this asserts the second.
    seed([node("a", 0, 0, 100, 40), node("b", 150, 0, 20, 40), node("c", 300, 0, 100, 40)]);
    useGraphStore.getState().distributeSelection("x");

    const p = boxes();
    const gapAB = p.b.x - (p.a.x + 100);
    const gapBC = p.c.x - (p.b.x + 20);
    expect(gapAB).toBe(gapBC);
    // The outer two do not move: distributing arranges what is between them.
    expect(p.a.x).toBe(0);
    expect(p.c.x).toBe(300);
  });

  it("works down the page too", () => {
    seed([node("a", 0, 0, 40, 100), node("b", 0, 120, 40, 20), node("c", 0, 300, 40, 100)]);
    useGraphStore.getState().distributeSelection("y");
    const p = boxes();
    expect(p.b.y - (p.a.y + 100)).toBe(p.c.y - (p.b.y + 20));
  });

  it("uses the visual order, not the selection order", () => {
    seed([node("c", 300, 0, 50, 40), node("a", 0, 0, 50, 40), node("b", 100, 0, 50, 40)]);
    useGraphStore.getState().distributeSelection("x");
    const p = boxes();
    expect(p.a.x).toBe(0);
    expect(p.c.x).toBe(300);
    expect(p.b.x).toBeGreaterThan(p.a.x);
    expect(p.b.x).toBeLessThan(p.c.x);
  });

  it("does nothing with two nodes, which have nothing between them", () => {
    seed([node("a", 0, 0, 50, 40), node("b", 300, 0, 50, 40)]);
    useGraphStore.getState().distributeSelection("x");
    const p = boxes();
    expect([p.a.x, p.b.x]).toEqual([0, 300]);
  });
});
