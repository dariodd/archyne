import { describe, expect, it } from "vitest";
import { crossings, jumpsAlong, JUMP_RADIUS } from "./jumps";
import type { Point } from "./routing";

const p = (x: number, y: number): Point => ({ x, y });

describe("finding where one connection crosses another", () => {
  // A horizontal line at y = 100, from x = 0 to x = 200.
  const across = [p(0, 100), p(200, 100)];

  it("finds the crossing of a vertical line", () => {
    const down = [p(80, 0), p(80, 300)];
    expect(crossings(across, [down])).toEqual([p(80, 100)]);
  });

  it("ignores a vertical line that stops short", () => {
    expect(crossings(across, [[p(80, 0), p(80, 40)]])).toEqual([]);
  });

  it("ignores one that passes outside the run", () => {
    expect(crossings(across, [[p(400, 0), p(400, 300)]])).toEqual([]);
  });

  it("hops the vertical run, never the other way about", () => {
    // The same pair seen from the other edge: the vertical one finds nothing,
    // so exactly one of the two draws a hop and they never disagree.
    const down = [p(80, 0), p(80, 300)];
    expect(crossings(down, [across])).toEqual([]);
  });

  it("does not hop where two lines meet at their ends", () => {
    // Two connections leaving the same node share that point by design.
    const fromTheSameCorner = [p(0, 100), p(0, 400)];
    expect(crossings(across, [fromTheSameCorner])).toEqual([]);
  });

  it("reports a place once however many lines cross there", () => {
    const one = [p(80, 0), p(80, 300)];
    const two = [p(80, 50), p(80, 250)];
    expect(crossings(across, [one, two])).toEqual([p(80, 100)]);
  });

  it("finds several crossings along one run", () => {
    const at = crossings(across, [
      [p(50, 0), p(50, 300)],
      [p(150, 0), p(150, 300)],
    ]);
    expect(at.map((q) => q.x).sort((m, n) => m - n)).toEqual([50, 150]);
  });

  it("has nothing to say about a line with no horizontal runs", () => {
    expect(crossings([p(0, 0), p(0, 100)], [[p(-50, 50), p(50, 50)]])).toEqual([]);
  });
});

describe("placing the hops along a run", () => {
  it("sorts them the way the run travels", () => {
    const at = [p(150, 10), p(50, 10)];
    expect(jumpsAlong(p(0, 10), p(200, 10), at)).toEqual([50, 150]);
    expect(jumpsAlong(p(200, 10), p(0, 10), at)).toEqual([150, 50]);
  });

  it("leaves out crossings on another line", () => {
    expect(jumpsAlong(p(0, 10), p(200, 10), [p(50, 90)])).toEqual([]);
  });

  it("merges two crossings too close to draw apart", () => {
    const at = [p(100, 10), p(100 + JUMP_RADIUS, 10)];
    expect(jumpsAlong(p(0, 10), p(200, 10), at)).toHaveLength(1);
  });

  it("says nothing about a vertical run", () => {
    expect(jumpsAlong(p(0, 0), p(0, 200), [p(0, 100)])).toEqual([]);
  });
});
