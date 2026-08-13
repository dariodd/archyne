/**
 * A sequence diagram, which is the one family that is not laid out at all.
 *
 * Every other family gets positions from ELK or from the document's layout
 * comment, and edges from the orthogonal router. A sequence diagram gets
 * neither: participants sit on a single top row, and everything else is a
 * *row* — a message, a note, a block, a divider — at `SEQ_TOP + i * SEQ_SPACING`
 * in the order the statements were written. `allRoutes` never sees it, which is
 * why `renderSvg` refused it until now rather than pretending a router could
 * place it.
 *
 * The arithmetic here is `SequenceOverlay`'s and `SequenceView`'s, run over the
 * same constants from `seqMetrics.ts`. That is deliberate: the renderer draws
 * what the editor draws, and the two reading the same numbers is what keeps
 * them from drifting.
 *
 * One thing matched rather than improved: an `activate` statement is drawn as a
 * small tag beside the lifeline, because that is what the canvas shows. The
 * conventional notation is a narrow bar *on* the lifeline, and it would be a
 * better picture — but it would also be the renderer and the editor disagreeing
 * about what a diagram looks like, which is the failure everything else here is
 * arranged to prevent. Worth changing in both, together, or not at all.
 */
import { SEQ_HEADER, SEQ_SPACING, SEQ_TOP } from "../seqMetrics";
import type { AnyNode, FlowEdge, SeqItem } from "../model/types";
import type { Box } from "../boxes";

/** How far past the last row a lifeline runs, as `ParticipantNodeView` draws it. */
const LIFELINE_TAIL = 30;

export interface SequenceGeometry {
  /** Every participant's lifeline, as a vertical segment. */
  lifelines: Array<{ id: string; x: number; top: number; bottom: number }>;
  /** The x of each participant's lifeline, by id. */
  centres: Map<string, number>;
  /** Where row `i` sits. */
  rowY: (i: number) => number;
  /** The extent the rows and lifelines occupy, for the document's bounds. */
  bounds: { minX: number; maxX: number; maxY: number };
}

/**
 * Where the lifelines and rows fall, given the participants and how many rows
 * the statement stream has.
 */
export function sequenceGeometry(
  nodes: AnyNode[],
  boxes: Map<string, Box>,
  rowCount: number,
): SequenceGeometry {
  const centres = new Map<string, number>();
  const lifelines: SequenceGeometry["lifelines"] = [];
  let minX = Infinity;
  let maxX = -Infinity;

  // The lifeline hangs from under the head and runs past the last row, which is
  // the height `ParticipantNodeView` gives it.
  const bottom = SEQ_TOP - SEQ_HEADER + rowCount * SEQ_SPACING + LIFELINE_TAIL;

  for (const node of nodes) {
    if (node.type !== "participant") continue;
    const box = boxes.get(node.id);
    if (!box) continue;
    const x = box.x + box.w / 2;
    centres.set(node.id, x);
    lifelines.push({ id: node.id, x, top: box.y + box.h, bottom: box.y + box.h + bottom });
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
  }

  if (!Number.isFinite(minX)) {
    minX = 0;
    maxX = 0;
  }

  return {
    lifelines,
    centres,
    rowY: (i: number) => SEQ_TOP + i * SEQ_SPACING,
    bounds: {
      minX,
      maxX,
      maxY: lifelines.reduce((y, l) => Math.max(y, l.bottom), SEQ_TOP + rowCount * SEQ_SPACING),
    },
  };
}

/** Which row a message occupies, by the order of the statement stream. */
export function messageRows(items: SeqItem[], edges: FlowEdge[]): Map<string, number> {
  const rows = new Map<string, number>();
  if (items.length > 0) {
    items.forEach((item, i) => {
      if (item.kind === "message") rows.set(item.edgeId, i);
    });
  } else {
    // A document with no statement stream — an older parse, or a diagram that
    // is nothing but messages — falls back to edge order, as `MessageEdge` does.
    edges.forEach((e, i) => rows.set(e.id, i));
  }
  return rows;
}

/**
 * The blocks (`alt`, `loop`, `opt`, …) as frames, paired with their `end`.
 *
 * `SequenceOverlay` keeps a stack and closes a frame when it meets an `end`;
 * so does this. An unclosed block is dropped rather than drawn to the bottom of
 * the diagram: a frame with no end is a document that did not say where it
 * stopped, and guessing looks like a bug in the drawing.
 */
export function blockFrames(
  items: SeqItem[],
): Array<{ start: number; end: number; op: string; label: string }> {
  const stack: Array<{ start: number; op: string; label: string }> = [];
  const frames: Array<{ start: number; end: number; op: string; label: string }> = [];
  items.forEach((item, i) => {
    if (item.kind === "block") stack.push({ start: i, op: item.op, label: item.label });
    else if (item.kind === "end") {
      const open = stack.pop();
      if (open) frames.push({ ...open, end: i });
    }
  });
  return frames;
}
