import { describe, expect, it } from "vitest";
import { betterScore, layoutScore, placedNodes, SCORE_NAMES } from "./choose";
import type { AnyNode, FlowEdge } from "../model/types";

/** A node of a stated size and place. */
function node(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  parentId?: string,
): AnyNode {
  return {
    id,
    type: "shape",
    position: { x, y },
    width,
    height,
    data: { label: id, shape: "rect" },
    ...(parentId ? { parentId } : {}),
  } as unknown as AnyNode;
}

function group(id: string, x: number, y: number, width: number, height: number): AnyNode {
  return {
    id,
    type: "group",
    position: { x, y },
    style: { width, height },
    width,
    height,
    data: { label: id },
  } as unknown as AnyNode;
}

function edge(source: string, target: string): FlowEdge {
  return { id: `${source}-${target}`, source, target, data: { label: "" } };
}

describe("placedNodes", () => {
  it("writes positions and a group's settled size onto the nodes", () => {
    const nodes = [group("g", 0, 0, 300, 200), node("a", 0, 0, 160, 54, "g")];
    const out = placedNodes(nodes, {
      g: { x: 12, y: 14, w: 340, h: 210 },
      a: { x: 5, y: 6 },
    });
    expect(out[0].position).toEqual({ x: 12, y: 14 });
    expect(out[0].style).toMatchObject({ width: 340, height: 210 });
    expect(out[0].width).toBe(340);
    expect(out[0].measured).toBeUndefined();
    expect(out[1].position).toEqual({ x: 5, y: 6 });
  });
});

describe("betterScore", () => {
  it("decides on the first measurement that differs", () => {
    expect(betterScore([1, 500, 900], [2, 0, 0])).toBe(true);
    expect(betterScore([1, 0], [0, 900])).toBe(false);
    expect(betterScore([0, 0], [0, 0])).toBe(false);
  });
});

describe("layoutScore", () => {
  it("finds a clean side-by-side pair faultless, and measures its ground", () => {
    const nodes = [node("a", 0, 0, 160, 54), node("b", 200, 0, 160, 54)];
    const score = layoutScore(nodes, [edge("a", "b")], "flowchart");
    const names = Object.fromEntries(SCORE_NAMES.map((n, i) => [n, score[i]]));
    expect(names).toMatchObject({
      spill: 0,
      overlap: 0,
      coincident: 0,
      border: 0,
      crossings: 0,
      onStranger: 0,
      buryOwn: 0,
      overLabel: 0,
      overBox: 0,
    });
    expect(score[SCORE_NAMES.length - 1]).toBeGreaterThan(0);
  });

  it("counts containers covering each other as worse than empty page", () => {
    const overlapping = [group("g", 0, 0, 300, 200), group("h", 150, 0, 300, 200)];
    const spread = [group("g", 0, 0, 300, 200), group("h", 350, 0, 300, 200)];
    const tight = layoutScore(overlapping, [], "flowchart");
    const loose = layoutScore(spread, [], "flowchart");
    expect(tight[1]).toBeGreaterThan(0);
    expect(loose[1]).toBe(0);
    expect(betterScore(loose, tight)).toBe(true);
  });

  it("counts a node that pokes out of its own container", () => {
    const placed = [
      group("g", 0, 0, 300, 200),
      node("a", 20, 20, 160, 54, "g"),
      node("b", 280, 180, 60, 54, "g"),
    ];
    const score = layoutScore(placed, [], "flowchart");
    expect(score[0]).toBe(1);
  });

  it("walks the whole way in a single edge to keep its names aligned", () => {
    const nodes = [node("a", 0, 0, 160, 54), node("b", 200, 0, 160, 54)];
    const score = layoutScore(nodes, [edge("a", "b")], "flowchart");
    expect(score.length).toBe(SCORE_NAMES.length);
    for (const name of SCORE_NAMES) expect(score[SCORE_NAMES.indexOf(name)]).toBeDefined();
  });
});
