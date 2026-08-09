import { describe, expect, it } from "vitest";
import { blocked, crosses, routeAround, type Rect } from "./avoid";
import type { Point } from "./routing";

const p = (x: number, y: number): Point => ({ x, y });
const box = (x: number, y: number, w = 100, h = 60): Rect => ({ x, y, w, h });

const isOrthogonal = (route: Point[]): boolean =>
  route.every(
    (q, i) =>
      i === 0 || Math.abs(q.x - route[i - 1].x) < 0.5 || Math.abs(q.y - route[i - 1].y) < 0.5,
  );

/** No run of the path may pass through the box. */
const clearOf = (route: Point[], r: Rect): boolean =>
  route.every((q, i) => i === 0 || !crosses(route[i - 1], q, r));

describe("a run against a box", () => {
  const r = box(100, 100);

  it("sees a run driven straight through it", () => {
    expect(crosses(p(0, 130), p(300, 130), r)).toBe(true);
  });

  it("lets a run pass above and below", () => {
    expect(crosses(p(0, 50), p(300, 50), r)).toBe(false);
    expect(crosses(p(0, 200), p(300, 200), r)).toBe(false);
  });

  it("counts grazing the side as passing, not crossing", () => {
    // Two boxes placed flush leave a line between them to be used.
    expect(crosses(p(100, 0), p(100, 300), r)).toBe(false);
  });

  it("sees a run that stops inside", () => {
    expect(crosses(p(0, 130), p(150, 130), r)).toBe(true);
  });

  it("reports the first box that blocks, over a list", () => {
    expect(blocked(p(0, 130), p(300, 130), [box(500, 500), r])).toBe(true);
    expect(blocked(p(0, 10), p(300, 10), [box(500, 500), r])).toBe(false);
  });
});

describe("routing around what is in the way", () => {
  it("has nothing to say when there are no obstacles", () => {
    expect(routeAround(p(0, 0), p(200, 0), "x", "x", [])).toBeNull();
  });

  it("goes around a box standing in the path", () => {
    const wall = box(100, 100);
    const route = routeAround(p(0, 130), p(300, 130), "x", "x", [wall]);
    expect(route).not.toBeNull();
    expect(isOrthogonal(route!)).toBe(true);
    expect(clearOf(route!, wall)).toBe(true);
    expect(route![0]).toEqual(p(0, 130));
    expect(route![route!.length - 1]).toEqual(p(300, 130));
  });

  it("keeps its distance rather than scraping along the side", () => {
    const wall = box(100, 100);
    const route = routeAround(p(0, 130), p(300, 130), "x", "x", [wall], 14)!;
    // Whatever it does, it stays outside the box plus its clearance.
    const grown = { x: 86, y: 86, w: 128, h: 88 };
    expect(clearOf(route, grown)).toBe(true);
  });

  it("threads the gap between two boxes when that is the short way", () => {
    const top = box(100, 0, 100, 100);
    const bottom = box(100, 200, 100, 100);
    const route = routeAround(p(0, 150), p(300, 150), "x", "x", [top, bottom])!;
    expect(clearOf(route, top)).toBe(true);
    expect(clearOf(route, bottom)).toBe(true);
    expect(isOrthogonal(route)).toBe(true);
  });

  it("leaves along the axis it is given", () => {
    const wall = box(100, 100);
    const route = routeAround(p(0, 130), p(300, 130), "y", "x", [wall])!;
    // Setting off vertically means the first run changes y, not x.
    expect(route[1].x).toBe(route[0].x);
  });

  it("arrives along the axis it is given", () => {
    const wall = box(100, 100);
    const route = routeAround(p(0, 130), p(300, 130), "x", "x", [wall])!;
    const n = route.length;
    expect(route[n - 1].y).toBe(route[n - 2].y);
  });

  it("prefers the path with fewer corners", () => {
    // One box, off to the side of a clear straight run: going round it would
    // cost corners for nothing, so the straight line survives.
    const route = routeAround(p(0, 0), p(300, 0), "x", "x", [box(100, 200)])!;
    expect(route).toHaveLength(2);
  });

  it("gives up rather than hanging when the target is walled in", () => {
    // The end sits inside a box with no way in.
    const route = routeAround(p(0, 0), p(150, 130), "x", "x", [box(100, 100)]);
    expect(route === null || isOrthogonal(route)).toBe(true);
  });

  it("declines a crowd instead of searching it", () => {
    const many = Array.from({ length: 61 }, (_, i) => box(i * 20, 100, 10, 10));
    expect(routeAround(p(0, 130), p(300, 130), "x", "x", many)).toBeNull();
  });
});
