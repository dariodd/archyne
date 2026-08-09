/**
 * Drawing a path through a set of corners.
 *
 * Kept away from React so the geometry can be read as arithmetic and tested
 * as arithmetic. Corners are rounded rather than mitred because a hand-routed
 * edge should look like the rest of the diagram, where every join is soft.
 */

import { jumpsAlong, JUMP_RADIUS } from "./jumps";

export interface Point {
  x: number;
  y: number;
}

/** How far a corner is cut, before the segments themselves limit it. */
export const CORNER_RADIUS = 10;

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** `from` moved `d` of the way towards `to`. */
function towards(from: Point, to: Point, d: number): Point {
  const len = distance(from, to);
  if (len === 0) return { ...from };
  return { x: from.x + ((to.x - from.x) * d) / len, y: from.y + ((to.y - from.y) * d) / len };
}

const round = (n: number): number => Math.round(n * 100) / 100;

/**
 * A straight stretch, hopping over anything crossing it.
 *
 * The hop is a half-circle, and it always bulges the same way — upwards on
 * the page, whichever direction the line is travelling — so a diagram full of
 * them reads as one convention rather than an assortment. In SVG's downward
 * y, that means the sweep flag turns over with the direction of travel.
 */
function straight(from: Point, to: Point, over: Point[], radius: number): string {
  const xs = jumpsAlong(from, to, over);
  if (xs.length === 0) return ` L ${round(to.x)},${round(to.y)}`;

  const forwards = to.x >= from.x;
  let d = "";
  for (const x of xs) {
    const before = forwards ? x - radius : x + radius;
    const after = forwards ? x + radius : x - radius;
    d += ` L ${round(before)},${round(from.y)}`;
    d += ` A ${radius} ${radius} 0 0 ${forwards ? 0 : 1} ${round(after)},${round(from.y)}`;
  }
  return `${d} L ${round(to.x)},${round(to.y)}`;
}

/**
 * An SVG path visiting every point, with the corners rounded off and a hop
 * drawn wherever another connection crosses it.
 *
 * Each corner's radius is capped at half of its shorter neighbouring
 * segment, so two corners close together cannot eat into each other and
 * turn the path inside out.
 */
export function roundedPolyline(
  points: Point[],
  radius = CORNER_RADIUS,
  over: Point[] = [],
): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${round(points[0].x)},${round(points[0].y)}`;

  let d = `M ${round(points[0].x)},${round(points[0].y)}`;
  let pen = points[0];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const corner = points[i];
    const next = points[i + 1];
    const r = Math.min(radius, distance(prev, corner) / 2, distance(corner, next) / 2);
    const start = towards(corner, prev, r);
    const end = towards(corner, next, r);
    d += straight(pen, start, over, JUMP_RADIUS);
    d += ` Q ${round(corner.x)},${round(corner.y)} ${round(end.x)},${round(end.y)}`;
    pen = end;
  }
  return d + straight(pen, points[points.length - 1], over, JUMP_RADIUS);
}

/** How far `at` is from the segment `a`–`b`, measuring to its ends. */
function distanceToSegment(at: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  // A segment of no length is a point, and the distance to it is direct.
  const t =
    len2 === 0 ? 0 : Math.max(0, Math.min(1, ((at.x - a.x) * dx + (at.y - a.y) * dy) / len2));
  return distance(at, { x: a.x + t * dx, y: a.y + t * dy });
}

/**
 * Which segment of the route a point lies nearest.
 *
 * The index is the one a corner dropped there would take, so it means the
 * same thing as `segmentMidpoints` — grabbing the line halfway along and
 * grabbing the dot drawn there put the corner in the same place.
 */
export function nearestSegment(points: Point[], at: Point): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const d = distanceToSegment(at, points[i], points[i + 1]);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  return best;
}

/**
 * The middle of each segment — where the handles that *add* a corner go.
 *
 * There is one more segment than there are corners, which is what makes a
 * new corner insertable at either end of the route as well as between two
 * existing ones. The index returned is the position the new corner takes.
 */
export function segmentMidpoints(points: Point[]): Array<Point & { index: number }> {
  const out: Array<Point & { index: number }> = [];
  for (let i = 0; i < points.length - 1; i++) {
    out.push({
      x: (points[i].x + points[i + 1].x) / 2,
      y: (points[i].y + points[i + 1].y) / 2,
      index: i,
    });
  }
  return out;
}

/** Corner to corner, with nothing done to the joins. */
export function straightPolyline(points: Point[]): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  return rest.reduce(
    (d, q) => `${d} L ${round(q.x)},${round(q.y)}`,
    `M ${round(first.x)},${round(first.y)}`,
  );
}

/**
 * A curve easing through every corner.
 *
 * Each corner becomes the control point of a quadratic, and the curve passes
 * through the midpoints between them — the standard way of turning a
 * polyline into something smooth without solving for a spline. With two
 * points there is nothing to smooth and it is a straight line.
 */
export function curvedPolyline(points: Point[]): string {
  if (points.length < 3) return straightPolyline(points);
  const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  let d = `M ${round(points[0].x)},${round(points[0].y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const to = mid(points[i], points[i + 1]);
    d += ` Q ${round(points[i].x)},${round(points[i].y)} ${round(to.x)},${round(to.y)}`;
  }
  const last = points[points.length - 1];
  return `${d} Q ${round(last.x)},${round(last.y)} ${round(last.x)},${round(last.y)}`;
}
