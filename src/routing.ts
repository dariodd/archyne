/**
 * Drawing a path through a set of corners.
 *
 * Kept away from React so the geometry can be read as arithmetic and tested
 * as arithmetic. Corners are rounded rather than mitred because a hand-routed
 * edge should look like the rest of the diagram, where every join is soft.
 */

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
 * An SVG path visiting every point, with the corners rounded off.
 *
 * Each corner's radius is capped at half of its shorter neighbouring
 * segment, so two corners close together cannot eat into each other and
 * turn the path inside out.
 */
export function roundedPolyline(points: Point[], radius = CORNER_RADIUS): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${round(points[0].x)},${round(points[0].y)}`;

  let d = `M ${round(points[0].x)},${round(points[0].y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const corner = points[i];
    const next = points[i + 1];
    const r = Math.min(radius, distance(prev, corner) / 2, distance(corner, next) / 2);
    const start = towards(corner, prev, r);
    const end = towards(corner, next, r);
    d += ` L ${round(start.x)},${round(start.y)}`;
    d += ` Q ${round(corner.x)},${round(corner.y)} ${round(end.x)},${round(end.y)}`;
  }
  const last = points[points.length - 1];
  return `${d} L ${round(last.x)},${round(last.y)}`;
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
