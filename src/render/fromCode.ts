/**
 * Mermaid text in, SVG out — the call the package exists to offer.
 *
 * `renderSvg` takes a graph that is already parsed, laid out and positioned,
 * because that is what the editor has by the time it wants to draw. Nobody
 * importing a library has any of that: they have the contents of a
 * ```` ```mermaid ```` fence. This is the three steps between.
 *
 * ## Why it is a separate entry point
 *
 * Weight. `renderSvg` alone is a few kilobytes of first-party code with no
 * dependencies at all — `npm run size:render` fails if that stops being true.
 * Parsing is Mermaid's, and laying out is ELK's, so *this* function drags both
 * in. A consumer who already has a graph (the editor, another renderer's
 * pipeline, anything that has done its own layout) should not pay for a parser
 * it will not call, so the package exposes the two separately and says which is
 * which.
 *
 * ## The order matters, and it is not obvious
 *
 * Layout runs over **placed** nodes, not over the bare parse: ELK needs each
 * node's size to lay one out, and `placeNodes` is what gives it one. Handing it
 * the bare nodes lays every architecture diagram out as a column of boxes
 * overlapping their own groups. `CanvasPreview` learned this the hard way and
 * says so at the same line; this is the same sequence, deliberately.
 */
import { parseDiagram } from "../model/diagram";
import { readPositions } from "../model/positions";
import { autoLayout } from "../layout/autoLayout";
import { annotateParallel, placeNodes } from "../graph";
import { renderSvg, type RenderOptions } from "./renderSvg";

export interface RenderResult {
  svg: string;
  width: number;
  height: number;
}

/**
 * Same options as the emitter's.
 *
 * There is deliberately no "resolve the icons for me" switch: reaching the
 * Iconify collections from here put 1.8 MB of icon data in the package, for a
 * renderer whose other entry point is ten kilobytes. `iconNames` says which
 * icons a diagram asks for and `RenderOptions.icons` takes the markup, so a
 * caller who wants logos pays for them and one who does not, does not.
 */
export type RenderCodeOptions = RenderOptions;

/** The size the emitter settled on, read back off the document it wrote. */
function sizeOf(svg: string): { width: number; height: number } {
  const w = /<svg[^>]*\swidth="(\d+(?:\.\d+)?)"/.exec(svg);
  const h = /<svg[^>]*\sheight="(\d+(?:\.\d+)?)"/.exec(svg);
  return { width: w ? Number(w[1]) : 0, height: h ? Number(h[1]) : 0 };
}

/**
 * Draw a Mermaid document.
 *
 * Positions come from the layout comment when the document carries one — which
 * is how a diagram arranged in Archyne keeps its arrangement everywhere — and
 * from ELK when it does not.
 *
 * Throws `UnsupportedFamilyError` for a family with no drawing yet, and
 * whatever Mermaid throws for text it cannot parse. Both are worth catching:
 * the first is a fact about this build, the second about the input.
 */
export async function render(
  code: string,
  options: RenderCodeOptions = {},
): Promise<RenderResult> {
  const parsed = await parseDiagram(code);

  const stored = readPositions(code);
  let nodes = placeNodes(parsed.nodes, stored ?? {}, parsed.kind);
  if (!stored) {
    const laid = await autoLayout(nodes, parsed.edges, parsed.direction);
    nodes = placeNodes(parsed.nodes, laid, parsed.kind);
  }
  const edges = annotateParallel(parsed.kind, parsed.edges);

  // The parse knows the `classDef` table; without passing it on, every
  // `class a,b hot` in the document is silently ignored and the picture comes
  // back in the default palette.
  const svg = renderSvg(nodes, edges, parsed.kind, {
    classDefs: parsed.classDefs,
    ...options,
  });
  return { svg, ...sizeOf(svg) };
}
