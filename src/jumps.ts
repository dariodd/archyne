/**
 * Where one connection crosses another, and the little hop drawn there.
 *
 * Two orthogonal lines meeting at a right angle look, on the page, exactly
 * like two lines joining. draw.io answers this by lifting one of them over
 * the other in a small arc, and the arc is read instantly as "these two do
 * not meet" — it is the oldest convention in wiring diagrams.
 *
 * Which of the two hops has to be decided the same way every time, or the
 * pair would fight over it and the drawing would flicker as edges re-render.
 * The rule here is that the horizontal run hops the vertical one. It needs no
 * agreement between the two edges, no z-order and no ids: each can work it
 * out alone and they will always agree.
 *
 * No React — arithmetic, tested as arithmetic.
 */
import type { Point } from "./routing";

/** How far the hop reaches along the line, either side of the crossing. */
export const JUMP_RADIUS = 5;

/** Runs closer than this to each other's ends are joins, not crossings. */
const NEAR_END = 2;

interface Run {
  from: Point;
  to: Point;
}

const runsOf = (points: Point[]): Run[] =>
  points.slice(0, -1).map((from, i) => ({ from, to: points[i + 1] }));

const isHorizontal = (r: Run): boolean => Math.abs(r.from.y - r.to.y) < 0.5;

/** Strictly between, with a little room at each end. */
function between(v: number, m: number, n: number): boolean {
  return v > Math.min(m, n) + NEAR_END && v < Math.max(m, n) - NEAR_END;
}

/**
 * Every point where a horizontal run of `route` crosses a vertical run of
 * one of `others`.
 *
 * Ends are excluded: two connections leaving the same node share a point by
 * design, and hopping there would draw a bump on the node's own border.
 */
export function crossings(route: Point[], others: Point[][]): Point[] {
  const mine = runsOf(route).filter(isHorizontal);
  if (mine.length === 0) return [];

  const found: Point[] = [];
  for (const other of others) {
    for (const run of runsOf(other)) {
      if (isHorizontal(run)) continue;
      for (const h of mine) {
        if (between(run.from.x, h.from.x, h.to.x) && between(h.from.y, run.from.y, run.to.y)) {
          found.push({ x: run.from.x, y: h.from.y });
        }
      }
    }
  }
  // Two edges may cross at the same place; one hop is enough.
  return found.filter(
    (p, i) =>
      found.findIndex((q) => Math.abs(q.x - p.x) < 0.5 && Math.abs(q.y - p.y) < 0.5) === i,
  );
}

/**
 * The hops that fall on one horizontal run, in the order they are met.
 *
 * `from` and `to` are the run's ends — already trimmed back by whatever the
 * corners at either end cut off. The crossings are returned as the x
 * positions to interrupt it at, sorted along the direction of travel and
 * dropped when two are too close together to draw separately.
 *
 * A hop needs its own width of run to sit on, not just a point inside it. A
 * crossing within half a hop of the end has the arc finishing past where the
 * run stops, and the line then travels back those two or three units to pick
 * up the corner: a nub at the bend, small but drawn, and unmistakably wrong
 * once you have seen it.
 */
export function jumpsAlong(from: Point, to: Point, points: Point[]): number[] {
  if (Math.abs(from.y - to.y) >= 0.5) return [];
  const forwards = to.x >= from.x;
  const lo = Math.min(from.x, to.x) + JUMP_RADIUS;
  const hi = Math.max(from.x, to.x) - JUMP_RADIUS;
  const xs = points
    .filter((p) => Math.abs(p.y - from.y) < 0.5 && p.x >= lo && p.x <= hi)
    .map((p) => p.x)
    .sort((m, n) => (forwards ? m - n : n - m));

  // Two hops within a hop's width of each other would draw as one blot.
  return xs.filter((x, i) => i === 0 || Math.abs(x - xs[i - 1]) > JUMP_RADIUS * 2);
}
