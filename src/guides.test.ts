import { describe, expect, it } from "vitest";
import { computeSnap, type Box } from "./guides";

const box = (x: number, y: number, w = 100, h = 40): Box => ({ x, y, w, h });

describe("computeSnap", () => {
  it("leaves a box alone when nothing is near", () => {
    expect(computeSnap(box(500, 500), [box(0, 0)], 6)).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  it("has no opinion when there is nothing to align to", () => {
    expect(computeSnap(box(10, 10), [], 6)).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  it("pulls a near-miss left edge onto the one below it", () => {
    const snap = computeSnap(box(4, 200), [box(0, 0)], 6);
    expect(snap.dx).toBe(-4);
    expect(snap.dy).toBe(0);
  });

  it("ignores a miss just outside the threshold", () => {
    expect(computeSnap(box(7, 200), [box(0, 0)], 6).dx).toBe(0);
  });

  it("snaps centre to centre, not only edge to edge", () => {
    // Edges 0/100 against 33/73 — nowhere near. Centres 50 against 53.
    expect(computeSnap(box(0, 200, 100), [box(33, 0, 40)], 6).dx).toBe(3);
  });

  it("does not let an edge land on a centre", () => {
    // The moving box's right edge is exactly on the static box's centre,
    // which is a coincidence rather than an alignment.
    expect(computeSnap(box(0, 200, 100), [box(60, 0, 80)], 6).dx).toBe(0);
  });

  it("snaps one edge to the opposite edge, so boxes can sit flush", () => {
    // Right edge at 100, the other box's left edge at 103.
    expect(computeSnap(box(0, 200, 100), [box(103, 0, 40)], 6).dx).toBe(3);
  });

  it("prefers the closest of several candidates", () => {
    // One box's left edge is 5 away, another's right edge is 1 away.
    expect(computeSnap(box(100, 200), [box(105, 0), box(0, 0, 101)], 6).dx).toBe(1);
  });

  it("resolves the two axes independently", () => {
    const snap = computeSnap(box(102, 203), [box(100, 0), box(400, 200)], 6);
    expect(snap.dx).toBe(-2);
    expect(snap.dy).toBe(-3);
  });

  it("scales with the threshold it is given", () => {
    expect(computeSnap(box(9, 200), [box(0, 0)], 6).dx).toBe(0);
    expect(computeSnap(box(9, 200), [box(0, 0)], 12).dx).toBe(-9);
  });

  it("reports the line it snapped to, spanning both boxes", () => {
    const snap = computeSnap(box(2, 200, 100), [box(0, 0, 40)], 6);
    const vertical = snap.guides.filter((g) => g.axis === "x");
    expect(vertical).toHaveLength(1);
    expect(vertical[0].at).toBe(0);
    // From the top of the static box to the bottom of the moved one.
    expect(vertical[0].from).toBe(0);
    expect(vertical[0].to).toBe(240);
  });

  it("collapses a whole column into one line, not one per node", () => {
    const snap = computeSnap(
      box(1, 400, 100),
      [box(0, 0, 40), box(0, 100, 40), box(0, 200, 40)],
      6,
    );
    const vertical = snap.guides.filter((g) => g.axis === "x");
    expect(vertical).toHaveLength(1);
    expect(vertical[0].from).toBe(0);
    expect(vertical[0].to).toBe(440);
  });

  it("reports a line per distinct position when a box lands on two", () => {
    // Left edge onto one node's left, right edge onto another's left.
    const snap = computeSnap(box(0, 400, 100), [box(0, 0, 40), box(100, 0, 40)], 6);
    const positions = snap.guides.filter((g) => g.axis === "x").map((g) => g.at);
    expect(positions.sort((a, b) => a - b)).toEqual([0, 100]);
  });

  it("reports no line when it did not snap", () => {
    expect(computeSnap(box(500, 500), [box(0, 0)], 6).guides).toEqual([]);
  });

  it("keeps an exact match exactly where it is, and still draws it", () => {
    const snap = computeSnap(box(0, 200), [box(0, 0)], 6);
    expect(snap.dx).toBe(0);
    expect(snap.guides.some((g) => g.axis === "x" && g.at === 50)).toBe(true);
  });

  it("draws one line, not three, for boxes of the same width in a column", () => {
    // Left, centre and right all agree; only the centre is worth drawing.
    const snap = computeSnap(box(0, 200, 100), [box(0, 0, 100)], 6);
    expect(snap.guides.filter((g) => g.axis === "x").map((g) => g.at)).toEqual([50]);
  });

  it("aligns a wide box to a narrow one by their right edges", () => {
    // Right edges at 203 and 200; left edges 37 apart, centres 17 apart.
    expect(computeSnap(box(103, 300, 100), [box(140, 0, 60)], 6).dx).toBe(-3);
  });
});
