/**
 * `archyne-render` — the public surface.
 *
 * Deliberately small, and deliberately *not* including `render(code)`. That one
 * needs Mermaid to parse and ELK to lay out; this entry needs neither, and
 * `npm run size:render` fails if that ever stops being true. A consumer who has
 * already parsed and laid out a graph — because they are the editor, or because
 * they did their own — should not carry a parser they will never call.
 *
 * Two entry points, then:
 *
 *   import { renderSvg } from "archyne-render";           // draw a graph
 *   import { render } from "archyne-render/mermaid";      // draw a document
 */
export { renderSvg, canRender, UnsupportedFamilyError, type RenderOptions } from "./renderSvg";

export { shapeGeometry, pointsAttr, type Primitive, type Paint } from "./shapes";
export { markerDefs, MARKERS, type MarkerSpec } from "./markers";
export { PALETTE, C4_COLOURS, type PaletteName } from "./boxModel";

export type { AnyNode, FlowEdge, DiagramKind } from "../model/types";
