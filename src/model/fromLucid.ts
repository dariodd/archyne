/**
 * Reading a Lucidchart `.lucid` file into a Mermaid flowchart.
 *
 * A `.lucid` file is a zip holding a `document.json` — Lucid's Standard
 * Import format, which the product both documents and exports. Of the
 * drawings Archyne reads, this is the friendliest: a shape carries its own
 * absolute bounding box, the connectivity is on the line that connects, and
 * the Y axis already grows downward like the canvas. What comes across is
 * what the file can say: the boxes and their text, the shape each one is,
 * its colours, what connects to what, the labels and line styles on the
 * connections, hand-routed corners as waypoints, and *where everything sat*
 * — in the `%% graph:positions` comment, so an imported diagram opens where
 * it was rather than re-laid-out.
 *
 * Not attempted, and not pretended. Snowflake-style shapes with no Mermaid
 * vertex (clouds, pentagons, arrows, pictures) become the box that best
 * keeps their footprint; rotation, opacity and image fills go nowhere
 * because Mermaid has no way to say them. Hotspot shapes are invisible,
 * so they are counted out. Lucid **groups** are selection-grouping — they
 * make a set of items move and resize together, which is exactly what a
 * Mermaid subgraph is not — so a group's members come across as the free
 * shapes they look like. Containers are a different thing: a visible box
 * with no list of its members in the file, so one arrives as the box it
 * looks like rather than as a subgraph somebody would find empty.
 */
import { unzipSync } from "fflate";
import type { ArrowType, AnyNode, EdgeStroke, FlowEdge, Shape, ShapeNode } from "./types";
import { serializeFlowchart } from "./kinds/flowchart";
import { positionsLine, type PositionMap } from "./positions";
import { waypointKey, waypointsLine, type WaypointMap } from "./waypoints";
import { idFactory, readableOn } from "./importShared";

export interface LucidImport {
  /** A complete Mermaid document, layout comments included. */
  code: string;
  /** How many shapes and connections came across. */
  nodes: number;
  edges: number;
  /** Every page in the file, in order. One is converted; see `page`. */
  pages: string[];
  /** Which page came across, as an index into `pages`. Defaults to 0. */
  page: number;
  /** Lines with a loose end, and silhouettes with no box to draw. */
  dropped: number;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
}

interface Fill {
  type: "color" | "image";
  color?: string;
}

interface Stroke {
  color?: string;
  width?: number;
  style?: string;
}

interface LucidStyle {
  fill?: Fill;
  stroke?: Stroke;
  /** Twice the pixel corner radius. */
  rounding?: number;
  textColor?: string;
}

interface LucidShape {
  id: string;
  type: string;
  boundingBox: Box;
  style?: LucidStyle;
  text?: string;
}

interface Endpoint {
  type: "shapeEndpoint" | "lineEndpoint" | "positionEndpoint";
  style?: string;
  shapeId?: string;
}

interface LineText {
  text?: string;
}

interface LucidLine {
  id: string;
  endpoint1?: Endpoint;
  endpoint2?: Endpoint;
  stroke?: Stroke;
  text?: LineText[];
  joints?: Array<{ x: number; y: number }>;
  elbowControlPoints?: Array<{ x: number; y: number }>;
}

interface LucidPage {
  id: string;
  title?: string;
  shapes?: LucidShape[];
  lines?: LucidLine[];
}

interface LucidDocument {
  version?: number;
  pages: LucidPage[];
}

/* ---------- text ---------- */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith("#")) {
      const code =
        body[1] === "x" || body[1] === "X"
          ? parseInt(body.slice(2), 16)
          : Number(body.slice(1));
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/**
 * A Lucid label as text.
 *
 * Lucid labels are HTML — `<b>` runs, `<p style=…>`, `<br>` — and Mermaid
 * takes text, so only the words survive, with the line breaks kept as
 * `<br/>` which Mermaid really does render.
 */
function plainText(value: string): string {
  const lines = value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]*>/g, "");
  return decodeEntities(lines)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("<br/>");
}

/* ---------- shapes ---------- */

/** Lucid's library tokens, and the Mermaid vertex each suggests. */
const BY_TYPE: Record<string, Shape> = {
  // Standard library. The default block is a rectangle.
  rectangle: "square",
  // Shape library.
  circle: "circle",
  diamond: "diamond",
  hexagon: "hexagon",
  // Flowchart library.
  process: "square",
  decision: "diamond",
  terminator: "stadium",
  database: "cylinder",
  directAccessStorage: "cylinder",
  internalStorage: "cylinder",
  storedData: "cylinder",
  data: "lean_right",
  manualInput: "lean_right",
  manualOperation: "inv_trapezoid",
  preparation: "hexagon",
  predefinedProcess: "subroutine",
  connector: "circle",
  or: "circle",
  merge: "circle",
  summingJunction: "circle",
  offPageLink: "odd",
  display: "odd",
  // Containers arrive as the box they look like: the file holds no list of
  // a container's members, so a subgraph would come out empty.
  roundedRectangleContainer: "round",
  pillContainer: "stadium",
  circleContainer: "circle",
  diamondContainer: "diamond",
};

/**
 * The Mermaid shape closest to what Lucid drew.
 *
 * Mermaid has fourteen vertex shapes and Lucid has a library of them, so
 * this is a best fit and nothing more. Everything unrecognised becomes a
 * rectangle, which is what an unrecognised Lucid shape looks like too.
 */
function mapShape(shape: LucidShape): Shape {
  // A circle stretched wide is a pill in everything but name, and Mermaid's
  // circle forces its label into a square — so only a round one is really
  // a circle.
  if (shape.type === "circle") {
    const b = shape.boundingBox;
    return b.w / Math.max(1, b.h) > 1.3 ? "stadium" : "circle";
  }
  // A rectangle with its corners rounded is Mermaid's `round`, and one
  // rounded all the way (radius ≥ 30px) is a stadium.
  if (shape.type === "rectangle" && (shape.style?.rounding ?? 0) > 0) {
    return (shape.style?.rounding ?? 0) >= 60 ? "stadium" : "round";
  }
  return BY_TYPE[shape.type] ?? "square";
}

/** Mermaid wants a colour it can draw; Lucid also writes `#rrggbbaa`. */
function hexOf(color: string): string {
  return /^#[0-9a-f]{8}$/i.test(color) ? color.slice(0, 7) : color;
}

const WHITE = /^#fff(fff)?$/i;
const BLACK = /^#000(000)?$/i;

/** `fill:` / `stroke:` / `color:` for a shape that was given colours. */
function colourStyles(shape: LucidShape): string[] {
  const out: string[] = [];
  const fill = shape.style?.fill;
  // Lucid defaults are a white fill on a black stroke, which is also the
  // look of a bare Mermaid box — so only colours somebody actually chose
  // are worth carrying.
  const fillColour = fill?.type === "color" && fill.color ? hexOf(fill.color) : undefined;
  if (fillColour && !WHITE.test(fillColour)) out.push(`fill:${fillColour}`);

  const stroke = shape.style?.stroke?.color ? hexOf(shape.style.stroke.color) : undefined;
  if (stroke && !BLACK.test(stroke)) out.push(`stroke:${stroke}`);

  const text = shape.style?.textColor ? hexOf(shape.style.textColor) : undefined;
  if (text) {
    out.push(`color:${text}`);
  } else if (fillColour) {
    // Lucid's palettes are pale — labels drawn black on them — and Archyne's
    // canvas draws labels light-on-dark, so a pale fill needs dark text to
    // stay readable.
    const readable = readableOn(fillColour);
    if (readable) out.push(`color:${readable}`);
  }
  // A label with no box is a real Lucid idiom for a heading; Mermaid has no
  // such shape, but a rectangle painted out of existence reads the same.
  if (shape.type === "text" && !fillColour) out.push("fill:transparent", "stroke:none");
  return out;
}

/* ---------- lines ---------- */

/** Lucid's endpoint styles, and the nearest Mermaid arrowhead each is. */
const ARROW_OF: Record<string, ArrowType> = {
  none: "arrow_open",
  openArrow: "arrow_open",
  openCircle: "arrow_circle",
  closedCircle: "arrow_circle",
  openSquare: "arrow_cross",
  closedSquare: "arrow_cross",
};

function arrowOf(style: string | undefined): ArrowType {
  // A missing style stays the Lucid default, which is a filled arrowhead.
  return ARROW_OF[style ?? "arrow"] ?? "arrow_point";
}

function edgeStroke(stroke: Stroke | undefined): EdgeStroke {
  if (!stroke) return "normal";
  if (stroke.style === "dashed" || stroke.style === "dotted") return "dotted";
  return (stroke.width ?? 1) >= 3 ? "thick" : "normal";
}

function lineLabel(text: LineText[] | undefined): string {
  if (!text) return "";
  return text
    .map((t) => plainText(t.text ?? ""))
    .filter(Boolean)
    .join("<br/>");
}

/** An absolute point, coercing the string numbers Lucid sometimes writes. */
function pointOf(p: { x: number; y: number }): { x: number; y: number } | null {
  const x = Number(p.x);
  const y = Number(p.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

/* ---------- the conversion ---------- */

function lucidDocumentToMermaid(doc: LucidDocument, pageIndex = 0): LucidImport {
  if (!Array.isArray(doc.pages) || doc.pages.length === 0) {
    throw new Error("this file holds no Lucid pages");
  }
  const pages = doc.pages.map((p, i) => p.title || p.id || `Page ${i + 1}`);
  const clamped = Math.min(
    Math.max(Math.trunc(Number(pageIndex) || 0), 0),
    doc.pages.length - 1,
  );
  const page = doc.pages[clamped];
  const shapes = page.shapes ?? [];
  const lines = page.lines ?? [];

  const nextId = idFactory();
  const idOf = new Map<string, string>();
  const nodes: AnyNode[] = [];
  const positions: PositionMap = {};
  let dropped = 0;

  for (const shape of shapes) {
    if (typeof shape.id !== "string" || !shape.boundingBox) continue;

    // A hotspot is an invisible click region. A Mermaid box cannot be
    // invisible — and a box that cannot be seen but takes up space would
    // be a worse import than saying what was left out.
    if (shape.type === "hotspot") {
      dropped++;
      continue;
    }

    const label = plainText(shape.text ?? "");
    const id = nextId(label, `n${nodes.length + 1}`);
    idOf.set(shape.id, id);

    const styles = colourStyles(shape);
    const node: ShapeNode = {
      id,
      type: "shape",
      position: { x: 0, y: 0 },
      data: {
        label,
        shape: mapShape(shape),
        direction: "TB",
        ...(styles.length ? { styles } : {}),
      },
    };
    nodes.push(node);

    // Bounding boxes are already absolute top-left corners in pixels with
    // Y downward — the canvas's own language, so no turning over this time.
    const { x, y, w, h } = shape.boundingBox;
    positions[id] = { x, y, w, h };
  }

  const edges: FlowEdge[] = [];
  const waypoints: WaypointMap = {};
  const ordinals = new Map<string, number>();

  for (const line of lines) {
    const source =
      line.endpoint1?.type === "shapeEndpoint"
        ? idOf.get(line.endpoint1.shapeId ?? "")
        : undefined;
    const target =
      line.endpoint2?.type === "shapeEndpoint"
        ? idOf.get(line.endpoint2.shapeId ?? "")
        : undefined;
    // Mermaid has no dangling connection: an arrow has two ends or it is not
    // an arrow. One drawn to the canvas — or to a hotspot — cannot come across.
    if (!source || !target) {
      dropped++;
      continue;
    }

    const pair = `${source}>${target}`;
    const ordinal = ordinals.get(pair) ?? 0;
    ordinals.set(pair, ordinal + 1);

    const arrow = arrowOf(line.endpoint2?.style);
    const start = line.endpoint1?.style ?? "none";
    edges.push({
      id: `e${edges.length}_${source}_${target}`,
      source,
      target,
      data: {
        label: lineLabel(line.text),
        stroke: edgeStroke(line.stroke),
        arrow,
        ...(start !== "none" && arrow !== "arrow_open" ? { both: true } : {}),
      },
    });

    // An elbow's corners and a straight line's hand-inserted joints are the
    // same thing to Mermaid: absolute points the edge is routed through.
    const raw = line.joints ?? line.elbowControlPoints ?? [];
    if (raw.length) {
      const points = raw.map(pointOf).filter((p): p is { x: number; y: number } => p !== null);
      if (points.length) waypoints[waypointKey(source, target, ordinal)] = points;
    }
  }

  const body = serializeFlowchart("TB", nodes, edges);
  const trailer = [positionsLine(positions)];
  if (Object.keys(waypoints).length) trailer.push(waypointsLine(waypoints));
  return {
    code: `${body}${trailer.join("\n")}\n`,
    nodes: nodes.length,
    edges: edges.length,
    pages,
    page: clamped,
    dropped,
  };
}

/**
 * Read a bare `document.json` — the unzipped inside of a `.lucid` file.
 * Which page comes across is defaulted to the first; a `page` index picks
 * another.
 */
export function lucidJsonToMermaid(json: string, page?: number): LucidImport {
  let doc: LucidDocument;
  try {
    doc = JSON.parse(json) as LucidDocument;
  } catch {
    throw new Error("this file is not valid JSON");
  }
  return lucidDocumentToMermaid(doc, page);
}

/**
 * Read a Lucid `.lucid` package. Throws when the file is not one. Which page
 * comes across is defaulted to the first; a `page` index picks another.
 */
export function lucidToMermaid(bytes: Uint8Array, page?: number): LucidImport {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error("this file is not a readable Lucid file");
  }
  const part = files["document.json"];
  if (!part) throw new Error("this file holds no Lucid drawing");
  return lucidJsonToMermaid(new TextDecoder().decode(part), page);
}

/**
 * Whether a zip is a Lucid package.
 *
 * Both zips Archyne reads open with the same `PK` signature, so the binary
 * dispatcher has to tell them apart by what is inside — and the marker that
 * says Lucid is the required `document.json` at the root.
 */
export function isLucidZip(bytes: Uint8Array): boolean {
  try {
    return Boolean(unzipSync(bytes)["document.json"]);
  } catch {
    return false;
  }
}
