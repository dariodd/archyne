import { describe, expect, it } from "vitest";
import { nearestSegment, roundedPolyline, segmentMidpoints, type Point } from "./routing";

const p = (x: number, y: number): Point => ({ x, y });

describe("drawing a path through corners", () => {
  it("draws nothing from nothing", () => {
    expect(roundedPolyline([])).toBe("");
  });

  it("is a straight line with no corners to round", () => {
    expect(roundedPolyline([p(0, 0), p(100, 0)])).toBe("M 0,0 L 100,0");
  });

  it("cuts a corner with a curve rather than a point", () => {
    const d = roundedPolyline([p(0, 0), p(100, 0), p(100, 100)], 10);
    // Straight to 10 short of the corner, curve through it, straight on.
    expect(d).toBe("M 0,0 L 90,0 Q 100,0 100,10 L 100,100");
  });

  it("rounds every corner, not only the first", () => {
    const d = roundedPolyline([p(0, 0), p(100, 0), p(100, 100), p(200, 100)], 10);
    expect(d.match(/Q/g)).toHaveLength(2);
  });

  it("keeps the radius inside the segments it joins", () => {
    // The 8px segment cannot give up 10px at each end without inverting.
    const d = roundedPolyline([p(0, 0), p(100, 0), p(108, 0), p(108, 100)], 10);
    expect(d).toContain("L 96,0");
    expect(d).toContain("Q 100,0 104,0");
  });

  it("survives a corner sitting exactly on its neighbour", () => {
    const d = roundedPolyline([p(0, 0), p(50, 50), p(50, 50), p(100, 100)]);
    expect(d).not.toContain("NaN");
  });

  it("rounds coordinates to hundredths, so the path stays readable", () => {
    const d = roundedPolyline([p(0, 0), p(1 / 3, 1 / 7)]);
    expect(d).toBe("M 0,0 L 0.33,0.14");
  });
});

describe("where a new corner can go", () => {
  it("offers one place on a straight edge: the middle", () => {
    expect(segmentMidpoints([p(0, 0), p(100, 200)])).toEqual([{ x: 50, y: 100, index: 0 }]);
  });

  it("offers one more place than there are corners", () => {
    // Two corners, three segments, three places to put the next one.
    const mids = segmentMidpoints([p(0, 0), p(50, 0), p(50, 50), p(100, 50)]);
    expect(mids).toHaveLength(3);
    expect(mids.map((m) => m.index)).toEqual([0, 1, 2]);
  });

  it("indexes each place by where the new corner would land", () => {
    // Dragging out of the middle segment inserts between the two corners,
    // not after them, or the path folds back on itself.
    const mids = segmentMidpoints([p(0, 0), p(50, 0), p(50, 50), p(100, 50)]);
    expect(mids[1]).toEqual({ x: 50, y: 25, index: 1 });
  });

  it("offers nothing for a route with no segments", () => {
    expect(segmentMidpoints([p(0, 0)])).toEqual([]);
  });
});

describe("which segment the line was grabbed by", () => {
  // An L: across the top, then down the right.
  const L = [p(0, 0), p(100, 0), p(100, 100)];

  it("picks the segment the point sits on", () => {
    expect(nearestSegment(L, p(50, 2))).toBe(0);
    expect(nearestSegment(L, p(98, 50))).toBe(1);
  });

  it("measures to the segment, not to its middle", () => {
    // Nearer the *midpoint* of the second segment, but sitting on the first.
    expect(nearestSegment(L, p(90, 0))).toBe(0);
  });

  it("measures to the segment, not to the endless line through it", () => {
    // 40 below the top segment's line but 200 past where that segment stops.
    // Extended forever the top one looks nearest; as a segment it is not.
    expect(nearestSegment(L, p(300, 40))).toBe(1);
  });

  it("agrees with the handle drawn on that segment", () => {
    for (const m of segmentMidpoints(L)) {
      expect(nearestSegment(L, m)).toBe(m.index);
    }
  });

  it("has nowhere to put a corner on a route of one point", () => {
    expect(nearestSegment([p(0, 0)], p(50, 50))).toBe(0);
  });
});

describe("hopping over what crosses the line", () => {
  it("draws a plain line when nothing crosses it", () => {
    expect(roundedPolyline([p(0, 0), p(100, 0)], 10, [])).toBe("M 0,0 L 100,0");
  });

  it("breaks the run and arcs over the crossing", () => {
    const d = roundedPolyline([p(0, 0), p(100, 0)], 10, [p(50, 0)]);
    expect(d).toContain("L 45,0");
    expect(d).toContain("A 5 5 0 0 0 55,0");
    expect(d).toContain("L 100,0");
  });

  it("turns the arc over when the line runs the other way", () => {
    const d = roundedPolyline([p(100, 0), p(0, 0)], 10, [p(50, 0)]);
    // Same bulge on the page, so the sweep flag flips with the direction.
    expect(d).toContain("A 5 5 0 0 1 45,0");
  });

  it("leaves a crossing on another line alone", () => {
    expect(roundedPolyline([p(0, 0), p(100, 0)], 10, [p(50, 80)])).toBe("M 0,0 L 100,0");
  });

  it("hops more than once along a run", () => {
    const d = roundedPolyline([p(0, 0), p(200, 0)], 10, [p(50, 0), p(150, 0)]);
    expect(d.match(/A /g)).toHaveLength(2);
  });

  it("still rounds its corners while hopping", () => {
    const d = roundedPolyline([p(0, 0), p(100, 0), p(100, 80)], 10, [p(50, 0)]);
    expect(d).toContain("Q 100,0");
    expect(d.match(/A /g)).toHaveLength(1);
  });
});
