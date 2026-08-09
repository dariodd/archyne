/**
 * Routing a connection *around* the boxes in its way.
 *
 * `orthogonal.ts` squares a path off; this decides where the path should go
 * when a node stands in the middle of it. Visio and draw.io both do this, and
 * without it a connector between two distant nodes drives straight through
 * everything between them.
 *
 * The method is the usual one for orthogonal connectors, and it is worth
 * stating because the shape of the code follows from it. A path that avoids
 * rectangles only ever needs to turn on a line that grazes one of them, so
 * rather than searching open space we build the small lattice of those lines
 * — every obstacle's four sides, pushed out by a clearance, plus the two
 * endpoints — and search that. A dozen nodes make a lattice of a few hundred
 * points, which is nothing.
 *
 * Cost is length plus a charge per turn. The charge is what makes the result
 * look drawn rather than computed: of two paths the same length, the one with
 * fewer corners wins, and a detour is taken only when it is genuinely
 * shorter than the bends it saves.
 *
 * No React, no store — arithmetic, tested as arithmetic.
 */
import { tidy, type Axis } from "./orthogonal";
import type { Point } from "./routing";

/** A box to stay out of. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** How far a path keeps off a box it is passing, in canvas units. */
export const CLEARANCE = 14;

/**
 * How much a corner costs, as a length. High enough that the router will go
 * a long way round to save one, which is what stops it staircasing.
 */
const BEND_COST = 40;

/** Beyond this many boxes the lattice stops being cheap; the caller falls back. */
const TOO_MANY = 60;

const grown = (r: Rect, by: number): Rect => ({
  x: r.x - by,
  y: r.y - by,
  w: r.w + by * 2,
  h: r.h + by * 2,
});

/** Strictly inside — touching the edge is allowed, that is what clearance is for. */
function inside(p: Point, r: Rect): boolean {
  return p.x > r.x + 0.5 && p.x < r.x + r.w - 0.5 && p.y > r.y + 0.5 && p.y < r.y + r.h - 0.5;
}

/**
 * Does the axis-aligned run `a`–`b` pass through `r`?
 *
 * Touching a side is not passing through it: two boxes placed flush leave a
 * line between them that a path is entitled to use.
 */
export function crosses(a: Point, b: Point, r: Rect): boolean {
  const lo = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) };
  const hi = { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) };
  return (
    lo.x < r.x + r.w - 0.5 && hi.x > r.x + 0.5 && lo.y < r.y + r.h - 0.5 && hi.y > r.y + 0.5
  );
}

/** Is any part of this run blocked? */
export function blocked(a: Point, b: Point, obstacles: Rect[]): boolean {
  return obstacles.some((r) => crosses(a, b, r));
}

const sortedUnique = (values: number[]): number[] =>
  [...new Set(values.map((v) => Math.round(v)))].sort((m, n) => m - n);

/** A place the path may turn, and the direction it was travelling on arrival. */
interface State {
  at: number; // index into the lattice
  dir: Axis;
}

const key = (s: State): string => `${s.at}:${s.dir}`;

/**
 * An orthogonal path from `a` to `b` that touches none of `obstacles`,
 * leaving along `from` and arriving along `to`.
 *
 * Returns the corners including both ends, or `null` when there is no way
 * through — a node sitting on the target, most often — so the caller can fall
 * back to the direct route rather than draw nothing.
 */
export function routeAround(
  a: Point,
  b: Point,
  from: Axis,
  to: Axis,
  obstacles: Rect[],
  clearance = CLEARANCE,
): Point[] | null {
  if (obstacles.length === 0 || obstacles.length > TOO_MANY) return null;
  const walls = obstacles.map((r) => grown(r, clearance));

  // The lines worth turning on: every wall's sides, and the ends themselves.
  const xs = sortedUnique([a.x, b.x, ...walls.flatMap((r) => [r.x, r.x + r.w])]);
  const ys = sortedUnique([a.y, b.y, ...walls.flatMap((r) => [r.y, r.y + r.h])]);

  const lattice: Point[] = [];
  const indexOf = new Map<string, number>();
  for (const y of ys) {
    for (const x of xs) {
      const p = { x, y };
      // A point buried in a box is no use, but the ends stay whatever
      // happens: a node's own handle sits on its edge, and one nudged inside
      // by rounding must not disqualify the whole route.
      if (walls.some((r) => inside(p, r))) continue;
      indexOf.set(`${x},${y}`, lattice.length);
      lattice.push(p);
    }
  }
  const endpoint = (p: Point): number => {
    const at = indexOf.get(`${Math.round(p.x)},${Math.round(p.y)}`);
    if (at !== undefined) return at;
    indexOf.set(`${Math.round(p.x)},${Math.round(p.y)}`, lattice.length);
    lattice.push({ x: Math.round(p.x), y: Math.round(p.y) });
    return lattice.length - 1;
  };
  const startAt = endpoint(a);
  const goalAt = endpoint(b);

  // Neighbours: the next lattice point along each axis, when the run to it is
  // clear. Built lazily — most of the lattice is never visited.
  const byRow = new Map<number, number[]>();
  const byColumn = new Map<number, number[]>();
  lattice.forEach((p, i) => {
    (byRow.get(p.y) ?? byRow.set(p.y, []).get(p.y)!).push(i);
    (byColumn.get(p.x) ?? byColumn.set(p.x, []).get(p.x)!).push(i);
  });
  for (const row of byRow.values()) row.sort((m, n) => lattice[m].x - lattice[n].x);
  for (const col of byColumn.values()) col.sort((m, n) => lattice[m].y - lattice[n].y);

  function neighbours(at: number): Array<{ at: number; dir: Axis }> {
    const p = lattice[at];
    const out: Array<{ at: number; dir: Axis }> = [];
    for (const [line, dir] of [
      [byRow.get(p.y) ?? [], "x"],
      [byColumn.get(p.x) ?? [], "y"],
    ] as Array<[number[], Axis]>) {
      const here = line.indexOf(at);
      if (here < 0) continue;
      for (const step of [-1, 1]) {
        const next = line[here + step];
        if (next === undefined) continue;
        if (!blocked(p, lattice[next], walls)) out.push({ at: next, dir });
      }
    }
    return out;
  }

  const manhattan = (i: number): number =>
    Math.abs(lattice[i].x - lattice[goalAt].x) + Math.abs(lattice[i].y - lattice[goalAt].y);

  const best = new Map<string, number>();
  const cameFrom = new Map<string, State>();
  const open: Array<{ state: State; cost: number; guess: number }> = [];
  const push = (state: State, cost: number) => {
    const k = key(state);
    if ((best.get(k) ?? Infinity) <= cost) return;
    best.set(k, cost);
    open.push({ state, cost, guess: cost + manhattan(state.at) });
  };
  // Leaving along `from` is not optional: an edge quits its node sideways or
  // vertically according to the handle it is tied to.
  push({ at: startAt, dir: from }, 0);

  let guard = 20000;
  while (open.length && guard-- > 0) {
    open.sort((m, n) => m.guess - n.guess);
    const { state, cost } = open.shift()!;
    if (cost > (best.get(key(state)) ?? Infinity)) continue;

    if (state.at === goalAt && state.dir === to) {
      const path: Point[] = [];
      for (let s: State | undefined = state; s; s = cameFrom.get(key(s))) {
        path.push(lattice[s.at]);
      }
      // The lattice puts a point wherever a line crosses, so a straight run
      // arrives chopped into pieces. They are not corners and must not be
      // reported as any: a handle would appear on each.
      return tidy(path.reverse());
    }

    for (const step of neighbours(state.at)) {
      const p = lattice[state.at];
      const q = lattice[step.at];
      const length = Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
      const next: State = { at: step.at, dir: step.dir };
      const k = key(next);
      const total = cost + length + (step.dir === state.dir ? 0 : BEND_COST);
      if ((best.get(k) ?? Infinity) <= total) continue;
      cameFrom.set(k, state);
      push(next, total);
    }
  }
  return null;
}
