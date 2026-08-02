/**
 * Alignment guides: the lines that appear while a node is dragged, and the
 * snap that puts it exactly where the line says.
 *
 * The arithmetic here is a *delta* — how far to nudge what is being dragged —
 * and a delta is the same number in every coordinate system. That is why this
 * can snap a node inside a group against a top-level one, while `alignSelection`
 * refuses the same pair: aligning assigns absolute coordinates, so it would be
 * comparing two frames of reference, whereas nudging by 4 is nudging by 4
 * wherever you are.
 *
 * Kept free of React and of the store so the numbers can be tested directly.
 */
import { create } from "zustand";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A line to draw: `at` is its position on `axis`, `from`–`to` its extent. */
export interface Guide {
  axis: "x" | "y";
  at: number;
  from: number;
  to: number;
}

export interface Snap {
  dx: number;
  dy: number;
  guides: Guide[];
}

/** Positions match when they agree to well under a pixel. */
const EPSILON = 0.01;

/** The canvas grid, in canvas units. Dragging quantises to it. */
export const GRID = 12;

/**
 * How near a line has to be before it grabs the drag, in canvas units.
 *
 * Two floors, and the larger wins. The first is 6 screen pixels, so the
 * magnet feels the same size however far you are zoomed in. The second is
 * half a grid cell, and it is the one that matters: React Flow quantises the
 * position to the grid *before* this code sees it, so a node can only ever be
 * offered at multiples of 12 — and an alignment sitting 5 units from the
 * nearest of those would be unreachable under a smaller threshold. Zoomed in
 * far enough that is what happened, and the guides simply never appeared.
 */
export function threshold(zoom: number): number {
  return Math.max(6 / zoom, GRID / 2);
}

/** One of the three lines a box offers on an axis. */
interface Line {
  at: number;
  centre: boolean;
}

function linesOf(b: Box, axis: "x" | "y"): Line[] {
  const [lo, size] = axis === "x" ? [b.x, b.w] : [b.y, b.h];
  return [
    { at: lo, centre: false },
    { at: lo + size / 2, centre: true },
    { at: lo + size, centre: false },
  ];
}

/**
 * Edges match edges and centres match centres, never one against the other.
 *
 * Letting a left edge land on someone's centre would fire constantly — every
 * box has a centre somewhere down its middle — and the result never looks
 * like anything. Edge-to-*opposite*-edge stays in, because that is how boxes
 * are placed flush against each other.
 */
function comparable(a: Line, b: Line): boolean {
  return a.centre === b.centre;
}

/**
 * The smallest nudge along one axis that lands a line of `moving` on one of
 * `statics`, or 0 when nothing is close enough.
 */
function bestDelta(moving: Box, statics: Box[], axis: "x" | "y", threshold: number): number {
  let best = 0;
  let bestAbs = Infinity;
  for (const m of linesOf(moving, axis)) {
    for (const s of statics) {
      for (const line of linesOf(s, axis)) {
        if (!comparable(m, line)) continue;
        const d = line.at - m.at;
        const abs = Math.abs(d);
        if (abs <= threshold && abs < bestAbs) {
          best = d;
          bestAbs = abs;
        }
      }
    }
  }
  return best;
}

/**
 * Every line the moved box now sits on, one per position however many nodes
 * share it, spanning far enough to reach all of them.
 */
function guidesFor(moved: Box, statics: Box[], axis: "x" | "y"): Guide[] {
  // A vertical guide is measured by how far down the page it reaches, and a
  // horizontal one by how far across, so the span is read off the other axis.
  const lo = (b: Box) => (axis === "x" ? b.y : b.x);
  const hi = (b: Box) => (axis === "x" ? b.y + b.h : b.x + b.w);

  const mine = linesOf(moved, axis);
  const byPosition = new Map<number, Guide>();
  for (const s of statics) {
    const hits = linesOf(s, axis).filter((line) =>
      mine.some((m) => comparable(m, line) && Math.abs(m.at - line.at) < EPSILON),
    );
    // Two boxes of the same width in a column agree on all three lines, and
    // three parallel lines 80px apart say nothing the middle one does not.
    // The centre is the one to keep: it is what "in a column" means.
    const centre = hits.find((h) => h.centre);
    for (const line of centre ? [centre] : hits) {
      const existing = byPosition.get(line.at);
      const from = Math.min(lo(moved), lo(s), existing?.from ?? Infinity);
      const to = Math.max(hi(moved), hi(s), existing?.to ?? -Infinity);
      byPosition.set(line.at, { axis, at: line.at, from, to });
    }
  }
  return [...byPosition.values()];
}

/**
 * Where `moving` wants to go, and the lines that say so.
 *
 * Both axes are resolved independently: a drag can snap horizontally to one
 * node and vertically to another, which is what makes the guides useful for
 * placing a box in a row *and* a column at once.
 */
export function computeSnap(moving: Box, statics: Box[], threshold: number): Snap {
  const dx = bestDelta(moving, statics, "x", threshold);
  const dy = bestDelta(moving, statics, "y", threshold);
  const moved = { ...moving, x: moving.x + dx, y: moving.y + dy };
  return {
    dx,
    dy,
    guides: [...guidesFor(moved, statics, "x"), ...guidesFor(moved, statics, "y")],
  };
}

/**
 * The lines currently on screen.
 *
 * Deliberately its own store rather than a field on the graph store: this
 * changes on every pointer move during a drag, and everything subscribed to
 * the graph would re-render with it.
 */
export const useGuides = create<{ guides: Guide[] }>(() => ({ guides: [] }));

function same(a: Guide[], b: Guide[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (g, i) =>
        g.axis === b[i].axis && g.at === b[i].at && g.from === b[i].from && g.to === b[i].to,
    )
  );
}

/** Set the visible guides, skipping the render when they have not moved. */
export function setGuides(guides: Guide[]): void {
  if (!same(useGuides.getState().guides, guides)) useGuides.setState({ guides });
}

export function clearGuides(): void {
  if (useGuides.getState().guides.length) useGuides.setState({ guides: [] });
}
