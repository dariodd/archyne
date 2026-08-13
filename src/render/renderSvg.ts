/**
 * A diagram as a self-contained SVG string.
 *
 * This is the shape that makes Archyne importable. The editor can already be
 * embedded — an iframe and a `postMessage` protocol (`src/embed.ts`) — but an
 * application can only ever be *embedded*, and every Markdown preview that
 * draws diagrams bundles a library or shells out to a binary instead. Mermaid
 * is in all of them because it is those two things, not because of any plugin
 * protocol; none of those previews has a hook where another extension supplies
 * the renderer.
 *
 * So the output here is deliberately a *string* and not a DOM: geometry as real
 * `<rect>` and `<path>`, sizes worked out by `measureNode` rather than measured
 * afterwards by a browser, and the paint inlined as a `<style>` inside the
 * `<svg>` so the picture survives the page that made it. Cache it, put it in an
 * `<img>`, hand it to a PDF.
 *
 * ## What it does not do yet
 *
 * Flowcharts, states, ER, classes and C4. The two that are missing are missing
 * for reasons rather than for want of typing, and `SUPPORTED` below records
 * both: an architecture service is an icon and icons resolve asynchronously; a
 * sequence diagram's geometry is not routed at all. Either would be a half-drawn
 * picture if forced through here, so both are refused instead.
 *
 * Labels are real `<text>`, wrapped and positioned here from measured widths
 * and baselines. They were `<foreignObject>` first — Mermaid's own default —
 * until it became clear that the one route needing nobody's cooperation,
 * pre-rendering diagrams to `.svg` files beside a document, is exactly the route
 * where a foreignObject is not painted: `<img>`, GitHub, resvg, librsvg and
 * most PDF pipelines all drop it, leaving boxes with no words in them.
 */
import { labelLines } from "../model/label";
import { labelSize } from "../model/types";
import { styleProps } from "../model/nodeStyle";
import {
  C4_TAGS,
  isGroup,
  type AnyNode,
  type DiagramKind,
  type ClassDefs,
  type FlowEdge,
  type ShapeNodeData,
} from "../model/types";
import { absoluteBoxes } from "../boxes";
import { allRoutes } from "../routes";
import { roundedPolyline } from "../routing";
import {
  NODE_FONT,
  textMetrics,
  wrapText,
  type FontSpec,
  type TextMetrics,
} from "../textMetrics";
import {
  ARCH_ICON,
  BORDER_WIDTH as BOX_MODEL_BORDER,
  BOXES,
  C4_COLOURS,
  C4_HEAD,
  FONTS,
  TABLE_ROWS,
  GROUP_TITLE,
  PALETTE,
  type PaletteName,
  SERVICE_LABEL_MAX,
  TABLE_TITLE,
  face,
} from "./boxModel";
import { markerDefs } from "./markers";
import { pointsAttr, shapeGeometry } from "./shapes";

/**
 * The families that have a drawing here.
 *
 * `sequence` is the one still missing, and not for want of typing: its geometry
 * is not routed at all. Messages are ordered rows against lifelines, which
 * `seqLayout` decides and `allRoutes` never sees, so it needs its own placement
 * rather than another case in `nodeInner`. It is a step in
 * `RENDERER.local.md` rather than half a picture returned from here.
 *
 * `architecture` used to be here too, because a service is an icon and icons
 * resolve asynchronously. That is settled: `RenderOptions.icons` takes them
 * already resolved, so the emitter stays pure and sync.
 */
const SUPPORTED = new Set<DiagramKind>([
  "flowchart",
  "state",
  "er",
  "class",
  "c4",
  "architecture",
]);

/** Whether this family has a drawing here, for callers deciding a route. */
export function canRender(kind: DiagramKind): boolean {
  return SUPPORTED.has(kind);
}

/** Thrown for a diagram family this cannot draw yet. */
export class UnsupportedFamilyError extends Error {
  constructor(readonly kind: DiagramKind) {
    super(`renderSvg draws ${[...SUPPORTED].join(", ")}; "${kind}" is not implemented yet`);
    this.name = "UnsupportedFamilyError";
  }
}

export interface RenderOptions {
  /** Which palette to paint with. Defaults to dark, as the app does. */
  theme?: PaletteName;
  /** Space around the diagram, in px. */
  padding?: number;
  /** Paint the ground, or leave it transparent for the page underneath. */
  background?: boolean;
  /**
   * `classDef` definitions, which a flowchart uses to colour a *set* of nodes.
   *
   * Without them every `class a,b hot` in a document is silently ignored and
   * the export comes back in the default palette — which is what it did.
   * `parseDiagram` returns them; `render()` passes them on.
   */
  classDefs?: ClassDefs;
  /**
   * Icon markup by name, for the families that draw one.
   *
   * Resolving an icon is asynchronous — `getIconHtml` lazy-loads an Iconify
   * collection — and making the whole renderer async for that would put an
   * `await` in front of every caller for the sake of one family. So the caller
   * resolves them and this stays a pure function of its inputs.
   * `renderSvgWithIcons` in `./withIcons.ts` does the resolving for callers who
   * would rather not.
   *
   * **The markup is inserted verbatim.** Anything from outside this repository
   * must go through `sanitiseSvg` (`model/svg.ts`) first, which is what the
   * editor does with an imported icon pack.
   */
  icons?: Record<string, string>;
}

/**
 * Text going into markup.
 *
 * Every label here is untrusted: it arrives from a `?code=` link, from the
 * embed bridge, or from a file somebody opened. The output is a string nobody
 * will parse again before putting it on a page, so this is the only thing
 * standing between a diagram and script in whatever document embeds it.
 * Applied to *all* text and *all* attribute values, without exception, rather
 * than to the ones that look dangerous.
 */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Numbers, short enough to read and precise enough to draw. */
function n(v: number): string {
  return String(Math.round(v * 100) / 100);
}

/**
 * The colours and type a node is drawn with, from both places they come from.
 *
 * A diagram states them twice over: `style a fill:#f9f` names one node, and
 * `classDef hot fill:#c04` with `class a,b hot` names a set. The canvas
 * resolves the two together, class first so an inline style wins — and this did
 * not, which meant every `classDef` colour was dropped from an export. The
 * order here is `ShapeNode`'s, deliberately.
 */
function drawnStyle(node: AnyNode, classDefs: ClassDefs) {
  const data = node.data as { classes?: string[]; styles?: string[] };
  return styleProps([
    ...(data.classes ?? []).flatMap((c) => classDefs[c] ?? []),
    ...(data.styles ?? []),
  ]);
}

/**
 * A node's own colours, as an **inline style** rather than as attributes.
 *
 * This matters and is easy to get wrong: the document carries a `<style>` block
 * with `.sf { fill: … }`, and in SVG a CSS rule beats a presentation attribute.
 * So `fill="#ff8800"` on the element was in the file, visible to anyone reading
 * it, and painted nothing — the class won. An inline `style` beats the class,
 * which is what the canvas does too (`boxStyleOf` returns React inline styles).
 */
function paintAttrs(s: ReturnType<typeof drawnStyle>, part: "fill" | "line" = "fill"): string {
  const decls = [
    // A detail line — a subroutine's bars, a cylinder's rim — takes the custom
    // *stroke* but never the fill, which would blot it out. That is what
    // `.shape-line { stroke: var(--custom-stroke, …) }` does on the canvas, and
    // keeping only the theme colour here left a purple rim on a green cylinder.
    ...(part === "fill" && s.fill ? [`fill:${s.fill}`] : []),
    ...(s.stroke ? [`stroke:${s.stroke}`] : []),
  ];
  return decls.length ? ` style="${esc(decls.join(";"))}"` : "";
}

/**
 * The label's own face and colour.
 *
 * `fill` on a `<tspan>` rather than a class, because a node's `color:` is the
 * one paint that cannot come from the stylesheet — it is written in the
 * diagram.
 */
function labelFace(s: ReturnType<typeof drawnStyle>, base: FontSpec) {
  const size = s.fontSize ? Number.parseFloat(s.fontSize) : base.size;
  const font: FontSpec = {
    family: base.family,
    size: Number.isFinite(size) ? size : base.size,
    ...(s.fontWeight ? { weight: s.fontWeight } : base.weight ? { weight: base.weight } : {}),
  };
  // Inline for the same reason the box's paint is: `.t { fill: … }` in the
  // document's own stylesheet would otherwise win over a `fill` attribute.
  const decls = [
    ...(s.color ? [`fill:${s.color}`] : []),
    ...(s.fontStyle ? [`font-style:${s.fontStyle}`] : []),
  ];
  const attrs = decls.length ? ` style="${esc(decls.join(";"))}"` : "";
  return { font, attrs };
}

/** One shape's primitives, as elements. */
function shapeMarkup(node: AnyNode, w: number, h: number, classDefs: ClassDefs): string {
  if (node.type !== "shape") return "";
  const custom = drawnStyle(node, classDefs);
  const bodyPaint = paintAttrs(custom, "fill");
  const linePaint = paintAttrs(custom, "line");

  return shapeGeometry(node.data.shape, w, h)
    .map((p) => {
      // The body takes the node's own colours if it has any; detail drawn over
      // it keeps the theme's, so a custom fill cannot swallow a subroutine's
      // bars or a cylinder's rim.
      const cls = p.paint === "fill" ? "sf" : "sl";
      const own = p.paint === "fill" ? bodyPaint : linePaint;
      switch (p.kind) {
        case "rect":
          return `<rect class="${cls}" x="${n(p.x)}" y="${n(p.y)}" width="${n(p.width)}" height="${n(p.height)}"${p.rx !== undefined ? ` rx="${n(p.rx)}"` : ""}${own}/>`;
        case "ellipse":
          return `<ellipse class="${cls}" cx="${n(p.cx)}" cy="${n(p.cy)}" rx="${n(p.rx)}" ry="${n(p.ry)}"${own}/>`;
        case "polygon":
          return `<polygon class="${cls}" points="${pointsAttr(p.points)}"${own}/>`;
        case "path":
          return `<path class="${cls}" d="${p.d}"${own}/>`;
        case "line":
          return `<line class="${cls}" x1="${n(p.x1)}" y1="${n(p.y1)}" x2="${n(p.x2)}" y2="${n(p.y2)}"${own}/>`;
      }
    })
    .join("");
}

/**
 * A run of text drawn as real SVG, laid out here rather than by a browser.
 *
 * This replaced `<foreignObject>`, and the reason is the whole point of the
 * renderer. An SVG loaded through `<img>`, rendered by resvg or librsvg, put
 * into a PDF, or shown by GitHub is drawn in a mode where a foreignObject's
 * HTML is simply **not painted**: the boxes appear and the words do not. So the
 * route that needs no cooperation from anybody — pre-render the diagrams to
 * `.svg` files beside the document — produced pictures with no text in them.
 * Mermaid's default output has the same hole; it is not a reason to keep it.
 *
 * The cost is that line breaking and vertical placement are arithmetic here
 * instead of a browser's job. `wrapText` does the first from measured widths,
 * and `ascent` does the second: SVG positions text by its **baseline**, and
 * `dominant-baseline` — the attribute that would spare us the sums — is exactly
 * the kind of thing the non-browser renderers this exists for implement
 * unevenly. So every baseline is computed and written out.
 */
interface TextBlock {
  text: string;
  font: FontSpec;
  /** Where the text sits inside `width`. */
  align: "start" | "middle";
  /** Extra attributes, for the odd line that is bold or dimmed. */
  attrs?: string;
}

/**
 * Lay `blocks` out one under another inside a box, and draw them.
 *
 * `top` is where the first line box begins; `place` says whether the stack
 * hangs from there or is centred on the whole height.
 */
function textStack(
  blocks: TextBlock[],
  opts: {
    x: number;
    width: number;
    top: number;
    height?: number;
    place?: "hang" | "centre";
    metrics?: TextMetrics;
  },
): string {
  const metrics = opts.metrics ?? textMetrics();
  type Line = { text: string; font: FontSpec; attrs: string; h: number; ascent: number };
  const lines: Line[] = [];

  for (const block of blocks) {
    for (const raw of labelLines(block.text)) {
      for (const line of wrapText(raw, block.font, opts.width, metrics)) {
        const size = metrics.measure(line, block.font);
        lines.push({
          text: line,
          font: block.font,
          attrs: block.attrs ?? "",
          h: size.height,
          ascent: size.ascent,
        });
      }
    }
  }
  if (lines.length === 0) return "";

  const total = lines.reduce((sum, l) => sum + l.h, 0);
  let y =
    opts.place === "centre" && opts.height !== undefined
      ? opts.top + (opts.height - total) / 2
      : opts.top;

  const anchor = blocks[0].align === "middle" ? "middle" : "start";
  const x = blocks[0].align === "middle" ? opts.x + opts.width / 2 : opts.x;

  const spans = lines
    .map((l) => {
      const baseline = y + l.ascent;
      y += l.h;
      const weight = l.font.weight ? ` font-weight="${l.font.weight}"` : "";
      return (
        `<tspan x="${n(x)}" y="${n(baseline)}" font-size="${n(l.font.size)}"` +
        ` font-family="${esc(l.font.family)}"${weight}${l.attrs}>${esc(l.text)}</tspan>`
      );
    })
    .join("");

  return `<text class="t" text-anchor="${anchor}">${spans}</text>`;
}

/**
 * A flowchart shape's label, centred in the box the shape occupies.
 *
 * The node does not grow around it — `measureNode` explains why — so a label
 * too long for its box wraps and then simply runs past it, exactly as the
 * canvas clips it. Wrapping at the box's inner width is what keeps the common
 * case looking right.
 */
function shapeLabel(node: AnyNode, w: number, h: number, classDefs: ClassDefs): string {
  const data = node.data as ShapeNodeData;
  const custom = drawnStyle(node, classDefs);
  const { font, attrs } = labelFace(custom, face(labelSize(data.styles)));
  return textStack([{ text: data.label, font, align: "middle", attrs }], {
    x: BOXES.shape.padX / 2,
    width: w - BOXES.shape.padX,
    top: 0,
    height: h,
    place: "centre",
  });
}

/** A state: a rounded box with its name, or one of the markers that carry none. */
function stateMarkup(
  node: AnyNode,
  w: number,
  h: number,
  text: string,
  classDefs: ClassDefs,
): string {
  if (node.type !== "state") return "";
  const custom = drawnStyle(node, classDefs);
  const t = node.data.stateType;
  if (t === "choice") {
    // `.choice-state` is a square turned 45°, which is a diamond drawn plainly.
    return `<polygon class="sf" points="${pointsAttr([
      [w / 2, 1],
      [w - 1, h / 2],
      [w / 2, h - 1],
      [1, h / 2],
    ])}"/>`;
  }
  if (t === "fork" || t === "join") {
    return `<rect class="bar" x="0" y="0" width="${n(w)}" height="${n(h)}" rx="3"/>`;
  }
  if (t !== "normal") {
    // Start is a filled disc; end is a ring with one inside it.
    const r = w / 2 - 1;
    if (t === "start")
      return `<circle class="bar" cx="${n(w / 2)}" cy="${n(h / 2)}" r="${n(r)}"/>`;
    return (
      `<circle class="ring" cx="${n(w / 2)}" cy="${n(h / 2)}" r="${n(r - 1)}"/>` +
      `<circle class="bar" cx="${n(w / 2)}" cy="${n(h / 2)}" r="7"/>`
    );
  }
  const pad = BOXES.state;
  const face_ = labelFace(custom, FONTS.state);
  return (
    `<rect class="sf" x="0.75" y="0.75" width="${n(w - 1.5)}" height="${n(h - 1.5)}" rx="10"${paintAttrs(custom)}/>` +
    textStack([{ text, font: face_.font, align: "middle", attrs: face_.attrs }], {
      x: pad.padX / 2,
      width: w - pad.padX,
      top: 0,
      height: h,
      place: "centre",
    })
  );
}

/**
 * The title band and rows shared by an ER entity and a class.
 *
 * The vertical arithmetic is `measureNode`'s, run forwards: it worked out the
 * height from a title band, a rule, and rows of a known step, so the text goes
 * back at those same offsets. Both read the offsets from `render/boxModel.ts`,
 * which is generated from the stylesheet — so the drawing and the measurement
 * cannot disagree about where row three begins.
 */
function tableMarkup(
  w: number,
  h: number,
  title: TextBlock[],
  groups: TextBlock[][],
  paint = "",
): string {
  const metrics = textMetrics();
  const parts = [
    `<rect class="sf" x="0.75" y="0.75" width="${n(w - 1.5)}" height="${n(h - 1.5)}" rx="8"${paint}/>`,
  ];

  // The title band, centred across the node, with its own padding above it.
  let y = TABLE_TITLE.padY / 2;
  const titleWidth = w - TABLE_TITLE.padX - BOXES.table.border;
  parts.push(textStack(title, { x: (w - titleWidth) / 2, width: titleWidth, top: y, metrics }));
  for (const block of title) {
    for (const line of wrapText(block.text, block.font, titleWidth, metrics)) {
      y += metrics.measure(line, block.font).height;
    }
  }
  y += TABLE_TITLE.padY / 2;

  // The rule under it, then each group of rows.
  parts.push(`<line class="rule" x1="0" y1="${n(y)}" x2="${n(w)}" y2="${n(y)}"/>`);
  y += TABLE_TITLE.rule;

  const rowX = TABLE_ROWS.rowPadX / 2;
  const rowWidth = w - TABLE_ROWS.rowPadX - BOXES.table.border;
  for (const group of groups) {
    y += TABLE_ROWS.padY / 2;
    for (const rowBlock of group) {
      const size = metrics.measure(rowBlock.text, rowBlock.font);
      parts.push(
        textStack([rowBlock], {
          x: rowX,
          width: rowWidth,
          top: y + TABLE_ROWS.rowPadY / 2,
          metrics,
        }),
      );
      y += size.height + TABLE_ROWS.rowPadY;
    }
    y += TABLE_ROWS.padY / 2;
  }

  return parts.join("");
}

/**
 * An icon, placed at a size, from markup the caller resolved.
 *
 * A nested `<svg>` is the right primitive: it carries its own `viewBox`, so
 * giving it `x`, `y`, `width` and `height` scales the drawing into that box
 * without anybody parsing the paths. Any `width`/`height` the pack shipped is
 * dropped first — Iconify writes `1em`, which would otherwise win.
 */
function iconMarkup(markup: string, x: number, y: number, size: number): string {
  const opening = markup.match(/^\s*<svg\b[^>]*>/i);
  if (!opening) return "";
  const attrs = opening[0]
    .replace(/^\s*<svg/i, "")
    .replace(/>$/, "")
    .replace(/\s(width|height|x|y)\s*=\s*"[^"]*"/gi, "");
  const rest = markup.slice(opening[0].length);
  return `<svg${attrs} x="${n(x)}" y="${n(y)}" width="${n(size)}" height="${n(size)}">${rest}`;
}

/**
 * An architecture service: an icon with its name under it.
 *
 * The icon is not required. A service whose icon the caller did not resolve —
 * or did not have — still draws as a box with a name in it, because a diagram
 * missing one logo is a diagram, and a diagram missing every node is not.
 */
function serviceMarkup(
  node: AnyNode,
  w: number,
  h: number,
  icons: Record<string, string>,
): string {
  if (node.type !== "service") return "";
  const box = BOXES.service;
  const bare = node.data.style?.look === "icon";
  const frame = bare
    ? ""
    : `<rect class="sf" x="0.75" y="0.75" width="${n(w - 1.5)}" height="${n(h - 1.5)}" rx="10"/>`;

  const markup = node.data.icon ? icons[node.data.icon] : undefined;
  const iconSize = Math.min(ARCH_ICON, w - box.padX, h - box.padY);
  const icon = markup ? iconMarkup(markup, (w - iconSize) / 2, box.padY / 2, iconSize) : "";

  const label = textStack([{ text: node.data.label, font: FONTS.service, align: "middle" }], {
    x: box.padX / 2,
    width: Math.min(SERVICE_LABEL_MAX, w - box.padX),
    top: box.padY / 2 + (markup ? iconSize + box.gap : 0),
  });
  return frame + icon + label;
}

/** A C4 element: the tag, the name, and a description under them. */
function c4Markup(node: AnyNode, w: number, h: number): string {
  if (node.type !== "c4") return "";
  const tag = C4_TAGS[node.data.c4Shape] ?? node.data.c4Shape;
  const person = node.data.c4Shape.includes("person");
  const box = BOXES.c4;
  const blocks: TextBlock[] = [
    { text: `«${tag}»`, font: FONTS.c4Tag, align: "middle", attrs: ' opacity="0.75"' },
    { text: node.data.label, font: FONTS.c4Label, align: "middle" },
  ];
  if (node.data.descr) {
    blocks.push({
      text: node.data.descr,
      font: FONTS.c4Descr,
      align: "middle",
      attrs: ' opacity="0.85"',
    });
  }
  // `.c4-head` is only drawn for a person, and the text starts under it.
  const head = person
    ? `<circle class="c4-head" cx="${n(w / 2)}" cy="${n(box.padY / 2 + 13)}" r="13"/>`
    : "";
  return (
    `<rect class="c4" x="0.75" y="0.75" width="${n(w - 1.5)}" height="${n(h - 1.5)}" rx="8"/>` +
    head +
    textStack(blocks, {
      // Centred on the node itself. Wrapping uses the content width, which the
      // border shrinks, but the *centre* of a border-box is still its middle —
      // taking the border off one side only pulled every centred label 1.5px
      // to the left.
      x: (w - (w - box.padX - box.border)) / 2,
      width: w - box.padX - box.border,
      top: box.padY / 2 + (person ? C4_HEAD : 0),
    })
  );
}

/**
 * Whatever this node is, drawn in its own frame.
 *
 * One place that knows the families, so adding the next one is a case here
 * rather than a condition threaded through the caller.
 */
function nodeInner(
  node: AnyNode,
  w: number,
  h: number,
  icons: Record<string, string>,
  classDefs: ClassDefs,
): string {
  if (isGroup(node)) return groupMarkup(node, w, h);
  // Every box-shaped family takes the colours the diagram gives it, from a
  // `style` statement or from a `classDef` the node is a member of.
  const custom = drawnStyle(node, classDefs);
  const paint = paintAttrs(custom);
  switch (node.type) {
    case "shape":
      return shapeMarkup(node, w, h, classDefs) + shapeLabel(node, w, h, classDefs);
    case "state":
      return stateMarkup(node, w, h, node.data.label, classDefs);
    case "entity": {
      const title = labelFace(custom, FONTS.tableTitle);
      const row = labelFace(custom, FONTS.table);
      return tableMarkup(
        w,
        h,
        [{ text: node.data.label, font: title.font, align: "middle", attrs: title.attrs }],
        [
          node.data.attributes.map((a) => ({
            // One run per row: the type column, the name and the keys read as
            // one line, and splitting them into three anchored spans would put
            // the renderer in the business of laying out a flex row.
            text: [a.type, a.name, a.keys.join(",")].filter(Boolean).join("  "),
            font: row.font,
            align: "start" as const,
            attrs: row.attrs,
          })),
        ],
        paint,
      );
    }
    case "class": {
      const name = node.data.generic
        ? `${node.data.label}<${node.data.generic}>`
        : node.data.label;
      const heading = labelFace(custom, FONTS.tableTitle);
      const title: TextBlock[] = [
        ...node.data.annotations.map((a) => ({
          text: `«${a}»`,
          font: FONTS.annotation,
          align: "middle" as const,
          attrs: ' opacity="0.7"',
        })),
        { text: name, font: heading.font, align: "middle" as const, attrs: heading.attrs },
      ];
      const groups = [node.data.members, node.data.methods]
        .filter((g) => g.length > 0)
        .map((g) =>
          g.map((m) => ({
            text: m,
            font: FONTS.mono,
            align: "start" as const,
            attrs: custom.color ? ` style="${esc(`fill:${custom.color}`)}"` : "",
          })),
        );
      return tableMarkup(w, h, title, groups, paint);
    }
    case "service":
      return serviceMarkup(node, w, h, icons);
    case "junction":
      // A dot. `.junction-node` is a filled disc with no content at all.
      return `<circle class="bar" cx="${n(w / 2)}" cy="${n(h / 2)}" r="${n(w / 2 - 1)}"/>`;
    case "c4":
      return c4Markup(node, w, h);
    default:
      // A family with no drawing yet. Reached only if `SUPPORTED` lets its
      // diagram through, so it is a bug in that list rather than in the data.
      return "";
  }
}

/** A group's frame and its title, which sits above the children. */
function groupMarkup(node: AnyNode, w: number, h: number): string {
  const title = isGroup(node) ? node.data.label : "";
  const frame = `<rect class="gf" x="0.75" y="0.75" width="${n(w - 1.5)}" height="${n(h - 1.5)}" rx="10"/>`;
  if (!title) return frame;
  return (
    frame +
    textStack([{ text: title, font: FONTS.groupTitle, align: "start" }], {
      x: GROUP_TITLE.padX / 2,
      width: w - GROUP_TITLE.padX,
      top: GROUP_TITLE.padY / 2,
    })
  );
}

/** An edge's label, on a plate so the line does not read through it. */
function edgeLabelMarkup(text: string, at: { x: number; y: number }): string {
  if (!text) return "";
  const font = { family: NODE_FONT.family, size: 11 };
  const size = textMetrics().measure(text, font);
  const w = size.width + 10;
  const h = size.height + 4;
  return (
    `<g transform="translate(${n(at.x - w / 2)},${n(at.y - h / 2)})">` +
    `<rect class="el-bg" x="0" y="0" width="${n(w)}" height="${n(h)}" rx="3"/>` +
    `<text class="el" x="${n(w / 2)}" y="${n(h / 2)}" text-anchor="middle" dominant-baseline="central">${esc(text)}</text>` +
    `</g>`
  );
}

/** Where an edge's label goes: the middle of the route, by length. */
function midpointOf(points: { x: number; y: number }[]): { x: number; y: number } {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    lengths.push(d);
    total += d;
  }
  let travelled = 0;
  for (let i = 0; i < lengths.length; i++) {
    if (travelled + lengths[i] >= total / 2) {
      const t = lengths[i] === 0 ? 0 : (total / 2 - travelled) / lengths[i];
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * t,
        y: points[i].y + (points[i + 1].y - points[i].y) * t,
      };
    }
    travelled += lengths[i];
  }
  return points[points.length - 1];
}

/**
 * Draw `nodes` and `edges` as one SVG document.
 *
 * Positions are taken from the nodes as they stand — from the layout comment a
 * document carries, or from `autoLayout` — and sizes from `absoluteBoxes`,
 * which is the same resolution the canvas uses and ends at `measureNode`.
 */
export function renderSvg(
  nodes: AnyNode[],
  edges: FlowEdge[],
  kind: DiagramKind,
  options: RenderOptions = {},
): string {
  if (!SUPPORTED.has(kind)) throw new UnsupportedFamilyError(kind);

  const theme = options.theme ?? "dark";
  const pad = options.padding ?? 24;
  const c = PALETTE[theme];
  const boxes = absoluteBoxes(nodes);
  const routes = allRoutes(nodes, edges, kind);

  // The extent of everything drawn, nodes and routes both: an edge that loops
  // out around a node reaches past every box.
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  const grow = (x: number, y: number) => {
    x1 = Math.min(x1, x);
    y1 = Math.min(y1, y);
    x2 = Math.max(x2, x);
    y2 = Math.max(y2, y);
  };
  for (const node of nodes) {
    const b = boxes.get(node.id);
    if (!b) continue;
    grow(b.x, b.y);
    grow(b.x + b.w, b.y + b.h);
  }
  for (const points of routes.values()) for (const p of points) grow(p.x, p.y);
  if (!Number.isFinite(x1)) {
    x1 = 0;
    y1 = 0;
    x2 = 0;
    y2 = 0;
  }

  const width = Math.ceil(x2 - x1 + pad * 2);
  const height = Math.ceil(y2 - y1 + pad * 2);
  const dx = pad - x1;
  const dy = pad - y1;

  // Groups first, so their frames sit behind what they contain.
  const ordered = [...nodes].sort((a, b) => Number(isGroup(b)) - Number(isGroup(a)));
  const nodeMarkup = ordered
    .map((node) => {
      const b = boxes.get(node.id);
      if (!b) return "";
      return `<g transform="translate(${n(b.x)},${n(b.y)})">${nodeInner(node, b.w, b.h, options.icons ?? {}, options.classDefs ?? {})}</g>`;
    })
    .join("");

  const edgeMarkup = edges
    .map((edge) => {
      const points = routes.get(edge.id);
      if (!points || points.length < 2) return "";
      const d = roundedPolyline(points);
      const line = `<path class="e" d="${d}" marker-end="url(#arch-arrow)"/>`;
      return line + edgeLabelMarkup(edge.data?.label ?? "", midpointOf(points));
    })
    .join("");

  const style = [
    `.sf{fill:${c.nodeFill};stroke:${c.nodeStroke};stroke-width:${BOX_MODEL_BORDER};vector-effect:non-scaling-stroke}`,
    `.sl{fill:none;stroke:${c.nodeStroke};stroke-width:${BOX_MODEL_BORDER}}`,
    `.gf{fill:none;stroke:${c.nodeStroke};stroke-width:1.5;stroke-dasharray:6 4}`,
    `.e{fill:none;stroke:${c.edge};stroke-width:1.5}`,
    `.el{fill:${c.edgeLabel};font-family:${NODE_FONT.family};font-size:11px}`,
    `.el-bg{fill:${c.edgeLabelBg}}`,
    // State markers: a fork bar, a start disc and an end ring are all painted
    // in the text colour rather than the node's.
    `.bar{fill:${c.text}}`,
    `.ring{fill:none;stroke:${c.text};stroke-width:2}`,
    `.c4{fill:${C4_COLOURS.fill};stroke:${C4_COLOURS.stroke};stroke-width:1.5}`,
    `.c4-head{fill:${C4_COLOURS.text};opacity:0.85}`,
    // Every label. A C4 element paints its own, being a dark box in both
    // themes; everything else takes the theme's text colour.
    `.t{fill:${c.text}}`,
    `.c4 ~ .t tspan{fill:${C4_COLOURS.text}}`,
    `.rule{stroke:${c.nodeStroke};stroke-width:1}`,
  ].join("");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<style>${style}</style>` +
    // Every marker, not only the arrowhead: a class diagram's edges end in
    // diamonds and an ER diagram's in crow's feet, and the same table draws
    // them for the canvas.
    `<defs>${markerDefs(c.edge, c.markerHollow)}</defs>` +
    (options.background === false ? "" : `<rect width="100%" height="100%" fill="${c.bg}"/>`) +
    `<g transform="translate(${n(dx)},${n(dy)})">${edgeMarkup}${nodeMarkup}</g>` +
    `</svg>`
  );
}
