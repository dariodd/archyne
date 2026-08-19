import type { ReactElement } from "react";
import type { LayoutStyle } from "../layout/autoLayout";

/**
 * A small drawing of what an arrangement does to a diagram.
 *
 * Drawn rather than computed. The honest alternative — running the real
 * layout on the open document and shrinking it — would mean five runs of a
 * solver that takes a moment on a graph of any size, on hover, to answer a
 * question the reader is asking in half a second. And it would answer it
 * badly: at thumbnail size the difference between two arrangements of *your*
 * boxes is a smudge, while the difference between a stack of bands and a
 * spray of nodes is legible at any size.
 *
 * So these are schematics: the shape each style makes, with the boxes and
 * connections a diagram is built from, and nothing else. `currentColor` and
 * the palette tokens throughout, so they follow the theme like everything
 * else — and `aria-hidden`, because the name beside them already says which
 * is which and a screen reader gains nothing from the picture.
 */
export function LayoutPreview({ style }: { style: LayoutStyle }) {
  return (
    <svg
      className="layout-preview"
      viewBox="0 0 120 76"
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      {SHAPES[style]}
    </svg>
  );
}

/** A box, at the scale of the schematic. */
const box = (x: number, y: number, w = 24, h = 12, key?: string) => (
  <rect key={key} className="lp-box" x={x} y={y} width={w} height={h} rx={2.5} />
);

/** A frame around a set of boxes — a group, drawn as the canvas draws one. */
const frame = (x: number, y: number, w: number, h: number, key?: string) => (
  <rect key={key} className="lp-frame" x={x} y={y} width={w} height={h} rx={3} />
);

const link = (x1: number, y1: number, x2: number, y2: number, key?: string) => (
  <line key={key} className="lp-link" x1={x1} y1={y1} x2={x2} y2={y2} />
);

const SHAPES: Record<LayoutStyle, ReactElement> = {
  // Ranks down the page, which is what a flowchart is.
  layered: (
    <g>
      {link(60, 18, 60, 26)}
      {link(60, 26, 34, 32)}
      {link(60, 26, 86, 32)}
      {link(34, 44, 60, 52)}
      {link(86, 44, 60, 52)}
      {box(48, 6)}
      {box(22, 32)}
      {box(74, 32)}
      {box(48, 58)}
    </g>
  ),
  // Tiers as bands, the things in a tier side by side.
  bands: (
    <g>
      {frame(8, 4, 104, 20)}
      {box(14, 9, 28, 10)}
      {box(46, 9, 28, 10)}
      {box(78, 9, 28, 10)}
      {frame(8, 28, 104, 20)}
      {box(14, 33, 28, 10)}
      {box(46, 33, 28, 10)}
      {frame(8, 52, 104, 20)}
      {box(14, 57, 28, 10)}
      {box(46, 57, 28, 10)}
      {box(78, 57, 28, 10)}
    </g>
  ),
  // Packed into a rectangle: as little empty page as the boxes allow.
  rectpacking: (
    <g>
      {box(10, 8, 34, 26)}
      {box(48, 8, 26, 12)}
      {box(48, 24, 26, 10)}
      {box(78, 8, 32, 26)}
      {box(10, 40, 26, 28)}
      {box(40, 40, 34, 28)}
      {box(78, 40, 32, 28)}
    </g>
  ),
  // One root, branching out.
  mrtree: (
    <g>
      {link(60, 18, 30, 32)}
      {link(60, 18, 90, 32)}
      {link(30, 44, 16, 58)}
      {link(30, 44, 44, 58)}
      {box(48, 6)}
      {box(18, 32)}
      {box(78, 32)}
      {box(4, 58, 24, 12)}
      {box(32, 58, 24, 12)}
    </g>
  ),
  // Settled as if the connections were springs.
  force: (
    <g>
      {link(28, 20, 62, 12)}
      {link(62, 12, 96, 26)}
      {link(28, 20, 46, 48)}
      {link(46, 48, 96, 26)}
      {link(46, 48, 78, 62)}
      {box(16, 14)}
      {box(50, 6)}
      {box(84, 20)}
      {box(34, 42)}
      {box(66, 56)}
    </g>
  ),
};
