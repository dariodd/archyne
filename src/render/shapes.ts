/**
 * What each flowchart shape is, as geometry rather than as markup.
 *
 * This used to be a `switch` returning JSX inside `ShapeNode.tsx`, which was
 * exactly right while the canvas was the only thing that drew. It stops being
 * right the moment a second drawer exists: a renderer that emits an SVG string
 * has no React, and the obvious move — writing the same shapes again, in
 * strings — produces two definitions of "cylinder" that agree until somebody
 * edits one.
 *
 * That failure has a precedent here worth not repeating. `renderWithMermaid`
 * (`model/fromMermaid.ts`) exists because the canvas and the preview drew
 * *different pictures of one file*, and the fix was one route rather than two
 * careful ones.
 *
 * So the shapes are described here, once, as primitives, and each consumer
 * turns a primitive into whatever it emits — JSX for the canvas, a string for
 * the renderer. Neither owns the geometry, and a change to a hexagon is a
 * change to the hexagon.
 *
 * Coordinates are in the node's own frame: `0,0` to `w,h`. The 1px inset that
 * runs through nearly all of them is the stroke, which straddles the path and
 * would otherwise be clipped in half by the element's edge.
 */
import type { Shape } from "../model/types";

/**
 * Which of the two paints a primitive takes.
 *
 * `fill` is the body of the shape — `.shape-fill` in the stylesheet, which is
 * also what carries a node's custom colours. `line` is the detail drawn over
 * it: a subroutine's inner bars, a cylinder's rim, the inner ring of a double
 * circle. They are separate because a custom fill must not swallow the detail.
 */
export type Paint = "fill" | "line";

export type Primitive =
  | {
      kind: "rect";
      paint: Paint;
      x: number;
      y: number;
      width: number;
      height: number;
      rx?: number;
    }
  | { kind: "ellipse"; paint: Paint; cx: number; cy: number; rx: number; ry: number }
  | { kind: "polygon"; paint: Paint; points: [number, number][] }
  | { kind: "path"; paint: Paint; d: string }
  | { kind: "line"; paint: Paint; x1: number; y1: number; x2: number; y2: number };

/** The rounded rectangle nearly every shape is a variation on. */
function body(w: number, h: number, rx?: number): Primitive {
  return {
    kind: "rect",
    paint: "fill",
    x: 1,
    y: 1,
    width: w - 2,
    height: h - 2,
    ...(rx !== undefined ? { rx } : {}),
  };
}

/**
 * The primitives that draw `shape` at `w` × `h`, in paint order.
 *
 * Every shape in `Shape` is covered, and the switch is exhaustive on purpose:
 * adding a shape to the union without drawing it should not compile.
 */
export function shapeGeometry(shape: Shape, w: number, h: number): Primitive[] {
  switch (shape) {
    case "round":
      return [body(w, h, 8)];

    case "stadium":
      return [body(w, h, (h - 2) / 2)];

    case "subroutine":
      return [
        body(w, h),
        { kind: "line", paint: "line", x1: 9, y1: 1, x2: 9, y2: h - 1 },
        { kind: "line", paint: "line", x1: w - 9, y1: 1, x2: w - 9, y2: h - 1 },
      ];

    case "cylinder": {
      // The barrel, then the rim drawn back over its top so the ellipse reads
      // as a lid rather than as a seam.
      const ry = 8;
      const rx = (w - 2) / 2;
      return [
        {
          kind: "path",
          paint: "fill",
          d: `M1 ${ry} A ${rx} ${ry} 0 0 1 ${w - 1} ${ry} L ${w - 1} ${h - ry} A ${rx} ${ry} 0 0 1 1 ${h - ry} Z`,
        },
        { kind: "path", paint: "line", d: `M1 ${ry} A ${rx} ${ry} 0 0 0 ${w - 1} ${ry}` },
      ];
    }

    case "circle":
      return [
        { kind: "ellipse", paint: "fill", cx: w / 2, cy: h / 2, rx: w / 2 - 1, ry: h / 2 - 1 },
      ];

    case "doublecircle":
      return [
        { kind: "ellipse", paint: "fill", cx: w / 2, cy: h / 2, rx: w / 2 - 1, ry: h / 2 - 1 },
        { kind: "ellipse", paint: "line", cx: w / 2, cy: h / 2, rx: w / 2 - 6, ry: h / 2 - 6 },
      ];

    case "diamond":
      return [
        {
          kind: "polygon",
          paint: "fill",
          points: [
            [w / 2, 1],
            [w - 1, h / 2],
            [w / 2, h - 1],
            [1, h / 2],
          ],
        },
      ];

    case "hexagon": {
      // The corner cut is a share of the width, but never more than half the
      // height — otherwise a short wide hexagon collapses into a diamond.
      const c = Math.min(h / 2, w * 0.18);
      return [
        {
          kind: "polygon",
          paint: "fill",
          points: [
            [c, 1],
            [w - c, 1],
            [w - 1, h / 2],
            [w - c, h - 1],
            [c, h - 1],
            [1, h / 2],
          ],
        },
      ];
    }

    case "odd":
      return [
        {
          kind: "polygon",
          paint: "fill",
          points: [
            [1, h / 2],
            [14, 1],
            [w - 1, 1],
            [w - 1, h - 1],
            [14, h - 1],
          ],
        },
      ];

    case "trapezoid":
      return [
        {
          kind: "polygon",
          paint: "fill",
          points: [
            [w * 0.18, 1],
            [w * 0.82, 1],
            [w - 1, h - 1],
            [1, h - 1],
          ],
        },
      ];

    case "inv_trapezoid":
      return [
        {
          kind: "polygon",
          paint: "fill",
          points: [
            [1, 1],
            [w - 1, 1],
            [w * 0.82, h - 1],
            [w * 0.18, h - 1],
          ],
        },
      ];

    case "lean_right":
      return [
        {
          kind: "polygon",
          paint: "fill",
          points: [
            [w * 0.15, 1],
            [w - 1, 1],
            [w * 0.85, h - 1],
            [1, h - 1],
          ],
        },
      ];

    case "lean_left":
      return [
        {
          kind: "polygon",
          paint: "fill",
          points: [
            [1, 1],
            [w * 0.85, 1],
            [w - 1, h - 1],
            [w * 0.15, h - 1],
          ],
        },
      ];

    case "square":
      return [body(w, h)];
  }

  // Unreachable for any `Shape`, and TypeScript proves it — `shape` is `never`
  // by this line, so adding a member to the union without a case above still
  // fails to compile. What this catches is the other direction: `data.shape`
  // is parsed out of a file, and a document naming a shape this build does not
  // have would otherwise fall out of the switch as `undefined` and take the
  // whole render down. A plain box is a poor drawing of an unknown shape and a
  // very good one of a crash.
  return [body(w, h)];
}

/** `points="x,y x,y"`, the one form both consumers want it in. */
export function pointsAttr(points: [number, number][]): string {
  return points.map(([x, y]) => `${x},${y}`).join(" ");
}
