/**
 * Where each connection ties up against a face.
 *
 * A connection meets a box in the middle of whichever face points at the other
 * end. That is right for one connection and wrong for the second: five edges
 * leaving a node's underside all leave from the same point, so five lines set
 * off stacked on top of each other and five arrowheads land in the same place.
 * The picture then says one connection where there are five, and no amount of
 * routing afterwards separates them — they never cross, they coincide.
 *
 * So the face is treated as a quay rather than a point, and the connections
 * using it are given berths along it. This is what draw.io and Visio do, and
 * it is the thing that makes a hub node — a gateway, a queue, a database —
 * readable at all.
 *
 * Two rules keep it from looking arbitrary:
 *
 *   - **Order follows the other end.** Berths are handed out in the order the
 *     far ends lie along the face, so the lines fan out without crossing each
 *     other on the way. Ties go to the edge id, so a drawing is always laid
 *     out the same way.
 *   - **The middle is the middle.** Berths are spread symmetrically about the
 *     centre of the face, so one connection still meets it dead centre and an
 *     odd number always has one down the middle.
 *
 * Like `spread.ts` this can only be decided with every connection in hand,
 * which is why it is a pass over all of them rather than something an edge
 * works out about itself.
 */
import { axisOfSide, type Side } from "./orthogonal";
import type { Ends } from "./routes";
import type { Point } from "./routing";
import type { Rect } from "./avoid";

/** How far apart berths are set, in canvas units, when the face allows it. */
export const BERTH_GAP = 16;

/**
 * How far the outermost berth stays from the corner.
 *
 * A connection meeting a box right on its corner reads as missing the box, and
 * the arrowhead has nothing behind it. Capped at a quarter of the face so a
 * small node still has a usable middle.
 */
const CORNER_ROOM = 14;

/** One end of one connection, waiting for its place on a face. */
interface Slot {
  edge: string;
  end: "from" | "to";
  /** Where the *other* end of this connection is, along the face's axis. */
  towards: number;
}

/** The extent of a face along the axis a berth can move on. */
function quay(box: Rect, side: Side): { from: number; span: number } {
  return axisOfSide(side) === "x" ? { from: box.y, span: box.h } : { from: box.x, span: box.w };
}

/**
 * Every connection's ends, with the ones sharing a face spread along it.
 *
 * `ends` is what `endsOf` decided — which faces, and the middle of each. Only
 * the points move; which face a connection uses is settled before this and is
 * not this pass's business.
 */
export function spreadBerths(
  edges: { id: string; source: string; target: string }[],
  ends: Map<string, Ends>,
  boxes: Map<string, Rect>,
  gap = BERTH_GAP,
): Map<string, Ends> {
  // Each face, and everything wanting to meet it. A self-loop puts both of its
  // ends in, on two different faces, which is exactly right: it queues for
  // each of them like anything else.
  const quays = new Map<string, { node: string; side: Side; slots: Slot[] }>();
  const add = (node: string, side: Side, slot: Slot) => {
    const key = `${node}|${side}`;
    const at = quays.get(key) ?? { node, side, slots: [] };
    at.slots.push(slot);
    quays.set(key, at);
  };

  for (const edge of edges) {
    const at = ends.get(edge.id);
    if (!at) continue;
    // Ordered by where the far end sits along the same axis the berths move
    // on: for a left or right face that is its y, for a top or bottom its x.
    const axis = axisOfSide(at.fromSide) === "x" ? "y" : "x";
    const toAxis = axisOfSide(at.toSide) === "x" ? "y" : "x";
    add(edge.source, at.fromSide, { edge: edge.id, end: "from", towards: at.end[axis] });
    add(edge.target, at.toSide, { edge: edge.id, end: "to", towards: at.start[toAxis] });
  }

  const out = new Map(ends);
  for (const { node, side, slots } of quays.values()) {
    if (slots.length < 2) continue;
    const box = boxes.get(node);
    if (!box) continue;

    const { from, span } = quay(box, side);
    const middle = from + span / 2;
    const room = Math.max(0, span - Math.min(CORNER_ROOM, span / 4) * 2);
    const step = Math.min(gap, room / (slots.length - 1));

    const queue = [...slots].sort(
      (a, b) => a.towards - b.towards || (a.edge < b.edge ? -1 : a.edge > b.edge ? 1 : 0),
    );
    queue.forEach((slot, i) => {
      const at = out.get(slot.edge);
      if (!at) return;
      const along = middle + (i - (queue.length - 1) / 2) * step;
      const point: Point = slot.end === "from" ? { ...at.start } : { ...at.end };
      if (axisOfSide(side) === "x") point.y = along;
      else point.x = along;
      out.set(slot.edge, slot.end === "from" ? { ...at, start: point } : { ...at, end: point });
    });
  }
  return out;
}
