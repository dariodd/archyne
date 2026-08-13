import { describe, expect, it } from "vitest";
import { autoLayout } from "./autoLayout";
import type { AnyNode, FlowEdge } from "../model/types";

/**
 * `autoLayout()` actually running, rather than the helpers around it.
 *
 * The plan for a renderer other tools can import rests on a claim nothing was
 * checking: that layout is pure enough to run without a browser. It looked
 * true — `autoLayout.ts` names no DOM API, and `createElk()` already falls back
 * to `elkjs/lib/elk.bundled.js` when `Worker` is undefined, which is exactly
 * the case here — but "looked true" is how the assumption in
 * `estimateSize` survived as long as it did.
 *
 * So this drives the real solver, in Node, through the real fallback. The
 * assertions are relationships rather than coordinates: ELK is a third-party
 * solver whose exact output may shift under a version bump, and a test that
 * pinned the numbers would fail for reasons that are not about us. What must
 * hold is that every node is placed, that the direction is obeyed, that a
 * node's size is what reserves its room, and that a group's children come back
 * in the group's frame.
 *
 * Kept in its own file, away from `autoLayout.test.ts`, because that one is a
 * pure unit test that runs in milliseconds and this one loads a 1.4 MB solver.
 */

/** A node of a stated size, so the arithmetic has something exact to hit. */
function node(id: string, width: number, height: number, parentId?: string): AnyNode {
  return {
    id,
    type: "shape",
    position: { x: 0, y: 0 },
    width,
    height,
    data: { label: id, shape: "rect" },
    ...(parentId ? { parentId } : {}),
  } as unknown as AnyNode;
}

function group(id: string): AnyNode {
  return {
    id,
    type: "group",
    position: { x: 0, y: 0 },
    data: { label: id },
  } as unknown as AnyNode;
}

function edge(source: string, target: string): FlowEdge {
  return { id: `${source}-${target}`, source, target, data: { label: "" } };
}

describe("autoLayout, run for real", () => {
  it("places every node it is given", async () => {
    const nodes = [node("a", 160, 54), node("b", 160, 54), node("c", 160, 54)];
    const positions = await autoLayout(nodes, [edge("a", "b"), edge("b", "c")], "TB");

    expect(Object.keys(positions).sort()).toEqual(["a", "b", "c"]);
    for (const p of Object.values(positions)) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it("lays a chain out across the page when asked for LR", async () => {
    const nodes = [node("a", 160, 54), node("b", 160, 54)];
    const positions = await autoLayout(nodes, [edge("a", "b")], "LR");

    expect(positions.b.x).toBeGreaterThan(positions.a.x);
  });

  it("lays the same chain down the page when asked for TB", async () => {
    const nodes = [node("a", 160, 54), node("b", 160, 54)];
    const positions = await autoLayout(nodes, [edge("a", "b")], "TB");

    expect(positions.b.y).toBeGreaterThan(positions.a.y);
  });

  it("reserves room according to the size a node states", async () => {
    // The point of Phase 2b in RENDERER.local.md: what is fed in here is what
    // decides the picture. A node twice as wide must push its successor twice
    // as far, or the sizes are decoration.
    const narrow = await autoLayout(
      [node("a", 100, 54), node("b", 100, 54)],
      [edge("a", "b")],
      "LR",
    );
    const wide = await autoLayout(
      [node("a", 400, 54), node("b", 100, 54)],
      [edge("a", "b")],
      "LR",
    );

    expect(narrow.b.x - narrow.a.x).toBeGreaterThanOrEqual(100);
    expect(wide.b.x - wide.a.x).toBeGreaterThanOrEqual(400);
    expect(wide.b.x - wide.a.x).toBeGreaterThan(narrow.b.x - narrow.a.x);
  });

  it("returns a group's children in the group's own frame", async () => {
    const nodes = [group("g"), node("a", 160, 54, "g"), node("b", 160, 54, "g")];
    const positions = await autoLayout(nodes, [edge("a", "b")], "TB");

    // The group is sized by ELK and reported with `w`/`h`; a leaf is not.
    expect(positions.g.w).toBeGreaterThan(0);
    expect(positions.g.h).toBeGreaterThan(0);
    expect(positions.a.w).toBeUndefined();

    // Children are parent-relative, which is what React Flow expects — so they
    // sit inside the box rather than out at the group's absolute coordinates.
    for (const id of ["a", "b"]) {
      expect(positions[id].x).toBeGreaterThanOrEqual(0);
      expect(positions[id].x).toBeLessThan(positions.g.w!);
      expect(positions[id].y).toBeLessThan(positions.g.h!);
    }
  });

  it("coordinates the disconnected as well as the connected", async () => {
    const positions = await autoLayout([node("lonely", 160, 54)], [], "TB");
    expect(positions.lonely).toBeDefined();
  });
});
