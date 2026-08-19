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
 * "Coincide" is a matter of eyesight rather than arithmetic: two runs three
 * units apart are two lines to the numbers and one line to a reader, and the
 * one underneath is gone — which is worst when the two are drawn differently,
 * because a dashed line hidden under a solid one does not read as a crowded
 * corridor, it reads as a connection that is not there.
 *
 * One nudge per connection **per pass**. A route whose every run is shifted in
 * turn stops resembling the one the user arranged, and each shift moves the
 * runs either side of it, so a second correction within the same pass would be
 * working from numbers the first had already invalidated. Working out the
 * whole picture again and having another look is a different thing, and it is
 * what a connection sharing two separate corridors needs — the first pass
 * frees it from one and leaves it buried in the other.
 */
import { moveSegment, segmentsOf, STUB, type Axis } from "./orthogonal";
import type { Rect } from "./avoid";
import type { Point } from "./routing";

/**
 * How far apart coincident runs are set, in canvas units.
 *
 * Nine, and it was worth checking whether it should be more. A label's plate
 * is around twenty units tall, so lanes nine apart can never have one in a gap
 * between them, and the obvious guess is that widening the fan would give the
 * labels room. Measured over every diagram here, it does almost nothing: the
 * count of labels a stranger's line runs across goes from ten to eight between
 * nine and twenty-four, because the lines a label ends up across are mostly
 * not neighbouring lanes at all — they are connections genuinely travelling
 * across it, which no amount of fanning separates.
 *
 * Sixteen — matching `BERTH_GAP`, so a pair of lines that set off apart would
 * stay apart — does halve them when paired with the `crossed` term in
 * `labels.ts`. It also pushed a connection flush onto a group's border, in a
 * corridor twenty units wide between two of them where the approach to the
 * node left no room to move: a connection that disappears is worse than a
 * label with a line behind it, so it stays at nine until a run can be told to
 * stop between two borders rather than on one.
 */
export const GAP = 9;

/**
 * Runs closer together than this read as one line.
 *
 * Exported because it is a statement about eyesight rather than an internal
 * step, and `e2e-legibility` has to ask the same question of the finished
 * picture. It measures the drawing independently — that is the point of it —
 * but measuring against its own copy of this number was not independence, it
 * was drift waiting to happen, and the copy had already fallen to three.
 */
export const SAME_LINE = 4;

/** Runs shorter than this are joins between corners, not corridors. */
const WORTH_MOVING = 24;

/**
 * How many times the picture is worked out again and looked at afresh.
 *
 * Three. Each pass separates every corridor it finds, so a second is only
 * needed by a connection that was in two of them and a third by one that was
 * in three, which is already rare enough that a fourth would be arithmetic
 * nobody will ever see.
 */
const PASSES = 3;

interface Candidate {
  id: string;
  index: number;
  axis: Axis;
  /** Where the run sits on the axis it can be moved along. */
  at: number;
  lo: number;
  hi: number;
  /**
   * How far this run may travel each way before it ruins an approach.
   *
   * A connection leaves a face perpendicular to it and arrives at one the same
   * way, and that straight stretch is what the arrowhead is drawn on. Moving
   * the corridor next to it shortens it — and this pass happily shortened one
   * to three units, which put the head on the rounded part of a corner and had
   * it arriving at the box sideways. So a run that feeds an end of its route
   * carries how much room it has, and takes as much of the offset as fits.
   */
  room: { back: number; on: number };
  /** A line that is not a connection and cannot be moved — a group's border. */
  fixed?: true;
}

/** Do two runs cover any of the same ground? */
function share(a: Candidate, b: Candidate): boolean {
  return a.lo < b.hi - 1 && b.lo < a.hi - 1;
}

/**
 * How far a run can move each way without leaving an end of its route with
 * too little straight line to carry an arrowhead.
 *
 * Only the first and last segments are protected: those are the approaches,
 * and the rest of the route is the router's to bend. `Infinity` for a run
 * that touches neither.
 */
function roomFor(route: Point[], index: number, axis: Axis, at: number): Candidate["room"] {
  const across: Axis = axis === "x" ? "y" : "x";
  const limits = { back: Infinity, on: Infinity };
  const last = route.length - 2;
  // The segment before this one is the route's first, so moving this run
  // changes how long that approach is.
  if (index - 1 === 0) {
    const anchor = route[0][across];
    const slack = Math.abs(at - anchor) - STUB;
    if (at >= anchor) limits.back = Math.max(0, slack);
    else limits.on = Math.max(0, slack);
  }
  if (index + 1 === last) {
    const anchor = route[route.length - 1][across];
    const slack = Math.abs(at - anchor) - STUB;
    if (at >= anchor) limits.back = Math.min(limits.back, Math.max(0, slack));
    else limits.on = Math.min(limits.on, Math.max(0, slack));
  }
  return limits;
}

/** Every run long enough to be a corridor rather than a join. */
function corridors(routes: Map<string, Point[]>): Candidate[] {
  const runs: Candidate[] = [];
  for (const [id, route] of routes) {
    for (const run of segmentsOf(route)) {
      const along: Axis = run.axis;
      const lo = Math.min(run.from[along], run.to[along]);
      const hi = Math.max(run.from[along], run.to[along]);
      if (hi - lo < WORTH_MOVING) continue;
      const at = run.axis === "x" ? run.from.y : run.from.x;
      runs.push({
        id,
        index: run.index,
        axis: run.axis,
        at,
        lo,
        hi,
        room: roomFor(route, run.index, run.axis, at),
      });
    }
  }
  return runs;
}

/**
 * The four sides of every frame, as lines nothing may be drawn along.
 *
 * A group's border is a line on the page like any other, and a connection
 * running flush with one disappears into it — which happens more often than
 * chance suggests, because a group's edge and the lane beside it are both
 * placed relative to the same boxes. They are not obstacles: a connection
 * between two members of a group has to be able to cross its frame, and being
 * walled in by its own container is worse than touching the border. Sharing
 * the border's *line* is the only thing being ruled out.
 */
function borders(frames: Rect[]): Candidate[] {
  return frames
    .flatMap((f, i) => [
      { id: `frame${i}:top`, index: -1, axis: "x" as Axis, at: f.y, lo: f.x, hi: f.x + f.w },
      {
        id: `frame${i}:bottom`,
        index: -1,
        axis: "x" as Axis,
        at: f.y + f.h,
        lo: f.x,
        hi: f.x + f.w,
      },
      { id: `frame${i}:left`, index: -1, axis: "y" as Axis, at: f.x, lo: f.y, hi: f.y + f.h },
      {
        id: `frame${i}:right`,
        index: -1,
        axis: "y" as Axis,
        at: f.x + f.w,
        lo: f.y,
        hi: f.y + f.h,
      },
    ])
    .map((c) => ({ ...c, room: { back: 0, on: 0 }, fixed: true as const }));
}

/**
 * Runs travelling the same way and close enough together to read as one line.
 *
 * Gathered by proximity rather than by an exact coordinate: rounding each run
 * to its own whole number puts two lines a unit apart in different groups and
 * leaves them drawn on top of each other. A run joins the group before it
 * while it is within `SAME_LINE` of it, so a tight bundle stays one group and
 * gets fanned out all together, which is the only way it comes apart evenly.
 */
function bundles(runs: Candidate[]): Candidate[][] {
  const out: Candidate[][] = [];
  for (const axis of ["x", "y"] as Axis[]) {
    const sorted = runs.filter((r) => r.axis === axis).sort((a, b) => a.at - b.at);
    let group: Candidate[] = [];
    for (const run of sorted) {
      if (group.length && run.at - group[group.length - 1].at > SAME_LINE) {
        out.push(group);
        group = [];
      }
      group.push(run);
    }
    if (group.length) out.push(group);
  }
  return out;
}

/** One look at the picture: every bundle found in it, fanned apart. */
function once(routes: Map<string, Point[]>, frames: Rect[], gap: number): Map<string, Point[]> {
  const moved = new Set<string>();
  const out = new Map(routes);
  for (const group of bundles([...corridors(routes), ...borders(frames)])) {
    const together = [...group];
    const overlapping = together.filter((c) =>
      together.some((other) => other !== c && other.id !== c.id && share(c, other)),
    );
    if (overlapping.length < 2) continue;

    // Lanes in the order the runs already lie in, not in the order their
    // edges happen to be named. Fanning out by edge id reads the same on a
    // diagram opened twice, but it is not stable under a change: a run that
    // moves into a bundle takes the place its *name* earns it and shifts
    // everybody along, so nudging one connection swaps two others over each
    // other for no reason a reader can see. Ordering by where the runs are
    // means a new one slots in beside them and the rest stay put. Ties — two
    // runs on exactly the same line — still fall back to the id, so a fresh
    // diagram is laid out the same way every time.
    const ordered = [...overlapping].sort(
      (a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );

    // Which lane holds still: a border cannot move, so it anchors the bundle
    // if there is one, and the rest count off from where it lies. Otherwise
    // the first run in the bundle, so the others fan out one way — anchoring
    // the middle and fanning both ways sounds tidier and is worse, because
    // it obliges the runs at both ends to travel, and a run boxed in by its
    // own approach cannot, so it stays lying on its neighbour.
    const border = ordered.findIndex((c) => c.fixed);
    const anchor = border >= 0 ? border : 0;

    ordered.forEach((run, i) => {
      if (i === anchor || run.fixed || moved.has(run.id)) return;
      // One lane per place in the order, counted off from the anchor — and
      // measured from where this run already is, not towards an absolute
      // line. The difference shows when a bundle is not quite coincident: an
      // absolute lane asks a run that is already offset to travel the whole
      // way to it, the approaches at its ends cannot spare that much, and the
      // clamped move that results lands it back on its neighbour.
      const want = (i - anchor) * gap;
      // As much of it as the approaches at either end of the route can spare,
      // and the other way about when this way has nothing to spare at all.
      // Which side a run fans out to was never the point — getting it out from
      // under whatever it is lying on is — and a run pinned against an
      // approach on one side stayed exactly where it was, which for a run
      // pinned against a group's border meant staying invisible.
      const room = (d: number) =>
        d >= 0 ? Math.min(d, run.room.back) : Math.max(d, -run.room.on);
      const first = room(want);
      const offset = Math.abs(first) >= 1 ? first : room(-want);
      if (Math.abs(offset) < 1) return;
      const route = out.get(run.id);
      if (!route) return;
      out.set(run.id, moveSegment(route, run.index, run.at + offset));
      moved.add(run.id);
    });
  }
  return out;
}

/**
 * Every route, with coincident runs moved apart.
 *
 * Lanes are handed out in the order the runs already lie in, so the drawing
 * does not depend on which edge happened to be rendered first, and — the
 * part that matters once somebody is dragging — moving one connection does
 * not reshuffle the ones beside it.
 *
 * `frames` are the group boxes: their borders take part as lines that cannot
 * move, so a connection running flush with one is pushed off it.
 *
 * Looked at again after each pass, and stopped as soon as a pass changes
 * nothing — which for most diagrams is the second one.
 */
export function spreadRuns(
  routes: Map<string, Point[]>,
  frames: Rect[] = [],
  gap = GAP,
): Map<string, Point[]> {
  let out = routes;
  for (let pass = 0; pass < PASSES; pass++) {
    const next = once(out, frames, gap);
    let same = true;
    for (const [id, route] of next) {
      if (route !== out.get(id)) {
        same = false;
        break;
      }
    }
    if (same) break;
    out = next;
  }
  return out;
}
