import { create } from "zustand";
import type { SeqItem } from "./model/types";

// The rhythm moved to `./seqMetrics`, which holds no store: three constants
// here meant Zustand — and React behind it — in anything that drew a sequence
// diagram, including the published renderer. Re-exported so the components
// that reach for them here are unchanged.
export { SEQ_HEADER, SEQ_TOP, SEQ_SPACING } from "./seqMetrics";

/**
 * The row a message is being dragged to, shared for the length of the gesture.
 *
 * The edge doing the dragging and the overlay drawing the blocks are siblings
 * with no common ancestor below the canvas, and both have to agree on where
 * the row will land: the arrows shuffle out of the way, the block frame grows
 * or shrinks around them. Kept out of the graph store on purpose — this never
 * reaches the document, and every `set` on the graph store is a step the undo
 * stack has to reason about.
 */
interface SeqDragState {
  /** Edge being dragged, or null when no gesture is in flight. */
  edgeId: string | null;
  /** Row it started on, and the row it would land on if dropped now. */
  from: number;
  to: number;
  begin: (edgeId: string, from: number) => void;
  moveTo: (to: number) => void;
  end: () => void;
}

export const useSeqDrag = create<SeqDragState>((set) => ({
  edgeId: null,
  from: -1,
  to: -1,
  begin: (edgeId, from) => set({ edgeId, from, to: from }),
  moveTo: (to) => set((s) => (s.to === to ? s : { ...s, to })),
  end: () => set({ edgeId: null, from: -1, to: -1 }),
}));

/**
 * Where row `i` sits once a pending move from `from` to `to` is accounted for.
 *
 * Everything between the two ends closes up by one row in the direction the
 * dragged row travelled; everything outside that span stays put. Order is
 * preserved, so a block opened at one row and closed at a later one can never
 * come out inverted.
 */
export function shiftedIndex(i: number, from: number, to: number): number {
  if (from < 0 || from === to) return i;
  if (i === from) return to;
  if (from < to) return i > from && i <= to ? i - 1 : i;
  return i >= to && i < from ? i + 1 : i;
}

/**
 * The block a message dropped at row `to` would end up inside — as an index
 * into the *current* items, so the caller can match it to the frame it drew.
 * -1 when the drop lands at the top level.
 *
 * Walks the stream as it will be without the dragged row, counting blocks
 * opened and closed before the insertion point. The innermost one still open
 * there is the one that will wrap it.
 */
export function dropBlock(items: SeqItem[], from: number, to: number): number {
  const open: number[] = [];
  for (let j = 0; j < to; j++) {
    // `j` walks the stream minus the dragged row; map it back to a real index.
    const at = j < from ? j : j + 1;
    const item = items[at];
    if (!item) break;
    if (item.kind === "block") open.push(at);
    else if (item.kind === "end") open.pop();
  }
  return open.length ? open[open.length - 1] : -1;
}
