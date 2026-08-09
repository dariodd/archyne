/**
 * Nudging apart the connections that share a corridor.
 *
 * Two edges running between the same two columns take the same halfway line
 * and are drawn one exactly on top of the other. Nothing is wrong with either
 * route; the drawing simply says "one connection" where there are two, and no
 * amount of hopping helps, because they never cross — they lie together.
 *
 * So runs that coincide are fanned out around where they were. This can only
 * be done knowing every route at once, which is why it lives beside the
 * router rather than inside an edge.
 *
 * One nudge per connection, deliberately. A route whose every run is shifted
 * in turn stops resembling the one the user arranged, and each shift moves
 * the runs either side of it, so the second correction would be working from
 * numbers the first had already invalidated.
 */
import { moveSegment, segmentsOf, type Axis } from "./orthogonal";
import type { Point } from "./routing";

/** How far apart coincident runs are set, in canvas units. */
export const GAP = 9;

/** Runs shorter than this are joins between corners, not corridors. */
const WORTH_MOVING = 24;

interface Candidate {
  id: string;
  index: number;
  axis: Axis;
  /** Where the run sits on the axis it can be moved along. */
  at: number;
  lo: number;
  hi: number;
}

/** Do two runs cover any of the same ground? */
function share(a: Candidate, b: Candidate): boolean {
  return a.lo < b.hi - 1 && b.lo < a.hi - 1;
}

/**
 * Every route, with coincident runs moved apart.
 *
 * The order is settled by edge id so that the same diagram always fans out
 * the same way: the drawing must not depend on which edge happened to be
 * rendered first.
 */
export function spreadRuns(routes: Map<string, Point[]>, gap = GAP): Map<string, Point[]> {
  const runs: Candidate[] = [];
  for (const [id, route] of routes) {
    for (const run of segmentsOf(route)) {
      const along: Axis = run.axis;
      const lo = Math.min(run.from[along], run.to[along]);
      const hi = Math.max(run.from[along], run.to[along]);
      if (hi - lo < WORTH_MOVING) continue;
      runs.push({
        id,
        index: run.index,
        axis: run.axis,
        at: run.axis === "x" ? run.from.y : run.from.x,
        lo,
        hi,
      });
    }
  }

  // Runs on the same line, in the same direction, covering the same stretch.
  const groups = new Map<string, Candidate[]>();
  for (const run of runs) {
    const key = `${run.axis}:${Math.round(run.at)}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(run);
  }

  const moved = new Set<string>();
  const out = new Map(routes);
  for (const group of groups.values()) {
    const together = [...group].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const overlapping = together.filter((c) =>
      together.some((other) => other !== c && other.id !== c.id && share(c, other)),
    );
    if (overlapping.length < 2) continue;

    // The first stays where the router put it and the rest fan out around it,
    // so a diagram with one connection in a corridor never moves at all.
    overlapping.forEach((run, i) => {
      if (i === 0 || moved.has(run.id)) return;
      const offset = ((i + 1) >> 1) * gap * (i % 2 === 1 ? 1 : -1);
      const route = out.get(run.id);
      if (!route) return;
      out.set(run.id, moveSegment(route, run.index, run.at + offset));
      moved.add(run.id);
    });
  }
  return out;
}
