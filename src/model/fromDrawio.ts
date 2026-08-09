/**
 * Reading a draw.io (`.drawio`, `diagrams.net`) file into a Mermaid flowchart.
 *
 * The point of this is migration, not fidelity. draw.io's model is free-form
 * geometry — arbitrary paths, rotation, layers, per-shape fonts — and Mermaid
 * has none of that, so an exact import is not on offer and pretending
 * otherwise would produce a worse result than saying so. What does carry over
 * is the part people actually drew: the boxes, what they say, which shape they
 * are, what colour they were given, what connects to what, the containers
 * around them, and *where everything sits* — which lands in the
 * `%% graph:positions` comment, so an imported diagram opens looking like the
 * one that was left behind rather than re-laid-out from scratch.
 *
 * The output goes through the same serializer as everything else, so an import
 * is an ordinary Mermaid document from the first moment: undo, round-trip and
 * the file-format contract all apply to it with no special case.
 */
import { inflateSync } from "fflate";
import type {
  AnyNode,
  ArrowType,
  EdgeStroke,
  FlowEdge,
  GroupNode,
  Shape,
  ShapeNode,
} from "./types";
import { serializeFlowchart } from "./kinds/flowchart";
import { idFactory, readableOn } from "./importShared";
import { buildArchitecture, CLOUD_STENCILS } from "./drawioArchitecture";
import { positionsLine, type PositionMap } from "./positions";
import { waypointKey, waypointsLine, type WaypointMap } from "./waypoints";

export interface DrawioImport {
  /** A complete Mermaid document, layout comments included. */
  code: string;
  /** How many shapes and connections came across. */
  nodes: number;
  edges: number;
  /** Every page in the file. Only the first is converted. */
  pages: string[];
  /** Cells that had nothing to become and were left out. */
  dropped: number;
  /**
   * The family the drawing looks like, when that is *not* the flowchart it
   * was converted to. draw.io has no diagram type of its own — a sequence
   * diagram there is lifeline shapes on the same canvas as everything else —
   * so the only honest thing is to convert what can be converted and say
   * what the file appeared to be.
   */
  looksLike?: "sequence" | "er" | "class";
}

/** The families a draw.io drawing can be read as. */
export type DrawioAs = "flowchart" | "architecture";

/** Style markers that give away a family Archyne cannot yet convert. */
const FAMILY_MARKS: Array<[RegExp, "sequence" | "er" | "class"]> = [
  [/umlLifeline|umlFrame|shape=umlActor/i, "sequence"],
  [/entityRelationEdgeStyle|shape=table\b|childLayout=tableLayout/i, "er"],
  [/swimlane;.*startSize=26|umlEmptyClass|shape=umlClass/i, "class"],
];

/** The family the styles suggest, or undefined for an ordinary drawing. */
function looksLike(cells: RawCell[]): DrawioImport["looksLike"] {
  const styles = cells.map((c) => c.style).join(";");
  for (const [pattern, family] of FAMILY_MARKS) {
    if (pattern.test(styles)) return family;
  }
  return undefined;
}

/* ---------- unwrapping the container ---------- */

function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, "text/xml");
  if (doc.querySelector("parsererror")) throw new Error("this file is not valid XML");
  return doc;
}

/**
 * The XML of one page.
 *
 * draw.io stores a page either as plain `<mxGraphModel>` or — the default when
 * "Compressed" is on — as base64 of raw DEFLATE of the URI-encoded XML. Three
 * layers deep, and no marker distinguishes the two, so the compressed path is
 * simply what is tried when there is no element inside the `<diagram>`.
 */
function pageModel(diagram: Element): Element {
  const inline = diagram.querySelector("mxGraphModel");
  if (inline) return inline;

  const payload = (diagram.textContent ?? "").trim();
  if (!payload) throw new Error("this page is empty");

  let xml: string;
  try {
    const bytes = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
    xml = decodeURIComponent(new TextDecoder().decode(inflateSync(bytes)));
  } catch {
    throw new Error("this page is compressed in a way Archyne cannot read");
  }
  const model = parseXml(xml).querySelector("mxGraphModel");
  if (!model) throw new Error("this page holds no diagram");
  return model;
}

/* ---------- reading cells ---------- */

interface RawCell {
  id: string;
  label: string;
  style: string;
  parent: string;
  vertex: boolean;
  edge: boolean;
  source: string;
  target: string;
  geometry: { x: number; y: number; w: number; h: number } | null;
  points: Array<{ x: number; y: number }>;
}

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
 * A cell's label as text.
 *
 * draw.io labels are HTML — bold runs, `<br>`, sometimes a whole table. Only
 * the words survive, because a Mermaid label is text; the line breaks survive
 * as `<br/>`, which Mermaid does render.
 */
function plainText(value: string): string {
  const lines = value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]*>/g, "");
  return (
    decodeEntities(lines)
      .split("\n")
      // `\s` covers the non-breaking spaces `&nbsp;` just turned into, which
      // draw.io uses freely for spacing inside a label.
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("<br/>")
  );
}

interface Style {
  /** Bare tokens: `ellipse`, `rounded`, `swimlane`, `group`. */
  names: Set<string>;
  /** `key=value` pairs. */
  of: Record<string, string>;
}

function parseStyle(style: string): Style {
  const names = new Set<string>();
  const of: Record<string, string> = {};
  for (const part of style.split(";")) {
    const token = part.trim();
    if (!token) continue;
    const eq = token.indexOf("=");
    if (eq < 0) names.add(token.toLowerCase());
    else of[token.slice(0, eq).trim()] = token.slice(eq + 1).trim();
  }
  return { names, of };
}

function geometryOf(cell: Element): RawCell["geometry"] {
  const g = [...cell.children].find((c) => c.getAttribute("as") === "geometry");
  if (!g) return null;
  const n = (name: string) => Number(g.getAttribute(name) ?? NaN);
  const x = n("x");
  const y = n("y");
  if (!Number.isFinite(x) && !Number.isFinite(y)) return null;
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    w: Number.isFinite(n("width")) ? n("width") : 120,
    h: Number.isFinite(n("height")) ? n("height") : 60,
  };
}

function pointsOf(cell: Element): RawCell["points"] {
  const g = [...cell.children].find((c) => c.getAttribute("as") === "geometry");
  const array = g && [...g.children].find((c) => c.getAttribute("as") === "points");
  if (!array) return [];
  return [...array.children]
    .filter((p) => p.tagName === "mxPoint")
    .map((p) => ({ x: Number(p.getAttribute("x") ?? 0), y: Number(p.getAttribute("y") ?? 0) }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}

/**
 * Every cell in the model, in document order.
 *
 * A cell may be wrapped in `<object>` (or `<UserObject>`), which is how
 * draw.io attaches custom properties and where the label then lives — so the
 * identity comes from the wrapper and everything else from the `mxCell`
 * inside it.
 */
function readCells(model: Element): RawCell[] {
  const root = model.querySelector("root");
  if (!root) return [];

  const out: RawCell[] = [];
  for (const element of [...root.children]) {
    const wrapped = element.tagName !== "mxCell";
    const cell = wrapped ? element.querySelector("mxCell") : element;
    if (!cell) continue;

    const label = wrapped
      ? (element.getAttribute("label") ?? element.getAttribute("value") ?? "")
      : (cell.getAttribute("value") ?? "");

    out.push({
      id: (wrapped ? element.getAttribute("id") : cell.getAttribute("id")) ?? "",
      label: plainText(label),
      style: cell.getAttribute("style") ?? "",
      parent: cell.getAttribute("parent") ?? "",
      vertex: cell.getAttribute("vertex") === "1",
      edge: cell.getAttribute("edge") === "1",
      source: cell.getAttribute("source") ?? "",
      target: cell.getAttribute("target") ?? "",
      geometry: geometryOf(cell),
      points: pointsOf(cell),
    });
  }
  return out.filter((c) => c.id);
}

/* ---------- shapes ---------- */

/** draw.io's built-in style names, and the Mermaid shape each becomes. */
const BY_NAME: Record<string, Shape> = {
  rhombus: "diamond",
  hexagon: "hexagon",
  cylinder: "cylinder",
  cylinder3: "cylinder",
  datastore: "cylinder",
  parallelogram: "lean_right",
  trapezoid: "trapezoid",
  process: "subroutine",
  step: "odd",
  display: "odd",
  card: "square",
  note: "square",
  document: "square",
  tape: "square",
  cube: "square",
  cloud: "square",
  triangle: "square",
  actor: "square",
  umlActor: "square",
};

/** The shape library draw.io's own flowchart stencils come from. */
const BY_STENCIL: Record<string, Shape> = {
  decision: "diamond",
  database: "cylinder",
  direct_data: "cylinder",
  stored_data: "cylinder",
  internal_storage: "square",
  terminator: "stadium",
  start_1: "circle",
  start_2: "circle",
  on_page_reference: "circle",
  off_page_reference: "odd",
  predefined_process: "subroutine",
  data: "lean_right",
  manual_input: "lean_right",
  manual_operation: "inv_trapezoid",
  preparation: "hexagon",
  document: "square",
  process: "square",
  or: "circle",
  summing_function: "circle",
};

/**
 * The Mermaid shape closest to what draw.io drew.
 *
 * Mermaid has fourteen vertex shapes and draw.io has thousands, so this is a
 * best fit and nothing more. Anything unrecognised becomes a rectangle, which
 * is what an unrecognised box looks like in draw.io too.
 */
function mapShape(style: Style, geometry: RawCell["geometry"]): Shape {
  const named = style.of.shape?.toLowerCase() ?? "";
  if (named.startsWith("mxgraph.")) {
    const stencil = BY_STENCIL[named.split(".").pop() ?? ""];
    if (stencil) return stencil;
  }

  const isEllipse = style.names.has("ellipse") || named === "ellipse";
  if (isEllipse || named === "doubleellipse") {
    if (style.of.shape === "doubleEllipse" || named === "doubleellipse") return "doublecircle";
    // A wide ellipse is a pill in everything but name; only a round one is
    // really a circle, and Mermaid's circle forces its label into a square.
    const ratio = geometry ? geometry.w / Math.max(1, geometry.h) : 1;
    return ratio > 1.3 ? "stadium" : "circle";
  }

  for (const name of style.names) {
    if (BY_NAME[name]) return BY_NAME[name];
  }
  if (named && BY_NAME[named]) return BY_NAME[named];

  if (style.of.rounded === "1") {
    // draw.io's terminator is a rectangle with its corners rounded all the
    // way, which is exactly Mermaid's stadium.
    return Number(style.of.arcSize ?? 0) >= 40 ? "stadium" : "round";
  }
  return "square";
}

/** `fill:` / `stroke:` / `color:` for a cell that was given colours. */
function colourStyles(style: Style): string[] {
  const out: string[] = [];
  const colour = (value: string | undefined) =>
    !value ? null : value.toLowerCase() === "none" ? "transparent" : value;

  const fill = colour(style.of.fillColor);
  const stroke = colour(style.of.strokeColor);
  const text = colour(style.of.fontColor);
  if (fill) out.push(`fill:${fill}`);
  if (stroke) out.push(`stroke:${stroke === "transparent" ? "none" : stroke}`);

  if (text) {
    out.push(`color:${text}`);
  } else if (fill) {
    const readable = readableOn(fill);
    if (readable) out.push(`color:${readable}`);
  }
  // A label with no box is a real draw.io idiom for a heading. Mermaid has no
  // such shape, but a rectangle painted out of existence reads the same.
  if (style.names.has("text") && !fill && !stroke) {
    out.push("fill:transparent", "stroke:none");
  }
  return out;
}

/* ---------- the conversion ---------- */

/**
 * Whether a drawing is cloud architecture, from the stencils it uses.
 *
 * A VPC drawn with `mxgraph.aws4.*` shapes is not a flowchart, and reading it
 * as one throws away the icons — the part that makes it legible.
 */
function looksArchitectural(cells: RawCell[]): boolean {
  return cells.some((c) => CLOUD_STENCILS.test(c.style));
}

/** Read a draw.io file. Throws when the file is not one, or is unreadable. */
export function drawioToMermaid(xml: string, as?: DrawioAs): DrawioImport {
  const doc = parseXml(xml);
  const diagrams = [...doc.querySelectorAll("diagram")];
  const pages = diagrams.map((d, i) => d.getAttribute("name") || `Page ${i + 1}`);

  const model = diagrams.length
    ? pageModel(diagrams[0])
    : (doc.querySelector("mxGraphModel") ?? null);
  if (!model) throw new Error("this file holds no diagram");

  const cells = readCells(model);
  const byId = new Map(cells.map((c) => [c.id, c]));

  // A cell parented to an edge and styled as its label *is* that label, not a
  // node — which is where draw.io puts most edge labels.
  const edgeLabels = new Map<string, string>();
  for (const cell of cells) {
    const parent = byId.get(cell.parent);
    if (cell.vertex && parent?.edge && parseStyle(cell.style).names.has("edgelabel")) {
      if (cell.label) edgeLabels.set(cell.parent, cell.label);
    }
  }

  // Layers are cells parented to the model root. They carry nothing Mermaid
  // can express, so their children are treated as top-level.
  const layers = new Set(cells.filter((c) => !c.vertex && !c.edge).map((c) => c.id));
  const hasVertexChild = new Set(
    cells.filter((c) => c.vertex && byId.get(c.parent)?.vertex).map((c) => c.parent),
  );

  const isContainer = (cell: RawCell): boolean => {
    if (!cell.vertex) return false;
    const style = parseStyle(cell.style);
    return (
      hasVertexChild.has(cell.id) ||
      style.names.has("group") ||
      style.names.has("swimlane") ||
      style.of.container === "1"
    );
  };

  // A cloud drawing is read as `architecture-beta` instead, unless the reader
  // has asked for a flowchart: its stencils carry icons, and a flowchart has
  // nowhere to put them.
  if (as === "architecture" || (as !== "flowchart" && looksArchitectural(cells))) {
    const centreOf = (cell: RawCell) => {
      if (!cell.geometry) return null;
      // Geometry is parent-relative, so walk up to get one frame of reference.
      let x = cell.geometry.x + cell.geometry.w / 2;
      let y = cell.geometry.y + cell.geometry.h / 2;
      let at = byId.get(cell.parent);
      for (let guard = 0; at && guard < 64; guard++) {
        if (at.geometry) {
          x += at.geometry.x;
          y += at.geometry.y;
        }
        at = byId.get(at.parent);
      }
      return { x, y };
    };

    const result = buildArchitecture(
      cells
        .filter((c) => c.vertex && !parseStyle(c.style).names.has("edgelabel"))
        .map((c) => ({
          id: c.id,
          label: c.label,
          style: c.style,
          centre: centreOf(c),
          box: c.geometry ? { ...c.geometry } : null,
          parent: byId.get(c.parent) && !layers.has(c.parent) ? c.parent : null,
          container: isContainer(c),
        })),
      cells
        .filter((c) => c.edge)
        .map((c) => {
          const style = parseStyle(c.style);
          return {
            source: c.source,
            target: c.target,
            label: c.label || edgeLabels.get(c.id) || "",
            intoSource: (style.of.startArrow ?? "none").toLowerCase() !== "none",
            intoTarget: (style.of.endArrow ?? "classic").toLowerCase() !== "none",
          };
        }),
    );
    return { ...result, pages };
  }

  const nextId = idFactory();
  const idOf = new Map<string, string>();
  const nodes: AnyNode[] = [];
  const positions: PositionMap = {};
  let dropped = 0;

  const parentIdOf = (cell: RawCell): string | undefined => {
    const parent = byId.get(cell.parent);
    if (!parent || layers.has(parent.id) || !isContainer(parent)) return undefined;
    return idOf.get(parent.id);
  };

  // Groups first, and outermost first, so a child always finds its parent
  // already named.
  const depth = (cell: RawCell): number => {
    let n = 0;
    let at = byId.get(cell.parent);
    while (at && n < 64) {
      n++;
      at = byId.get(at.parent);
    }
    return n;
  };

  const groupCells = cells.filter(isContainer).sort((a, b) => depth(a) - depth(b));
  for (const cell of groupCells) {
    const id = nextId(cell.label, `g${nodes.length + 1}`);
    idOf.set(cell.id, id);
    const parentId = parentIdOf(cell);
    const group: GroupNode = {
      id,
      type: "group",
      position: { x: 0, y: 0 },
      data: { label: cell.label || id, subgraphId: id },
      style: { width: cell.geometry?.w ?? 320, height: cell.geometry?.h ?? 220 },
      ...(parentId ? { parentId } : {}),
    };
    nodes.push(group);
    positions[id] = {
      x: cell.geometry?.x ?? 0,
      y: cell.geometry?.y ?? 0,
      w: cell.geometry?.w ?? 320,
      h: cell.geometry?.h ?? 220,
    };
  }

  for (const cell of cells) {
    if (!cell.vertex || isContainer(cell)) continue;
    const style = parseStyle(cell.style);
    // Edge labels were harvested above; they are not nodes.
    if (style.names.has("edgelabel")) continue;
    if (!cell.label && !cell.geometry) {
      dropped++;
      continue;
    }

    const id = nextId(cell.label, `n${nodes.length + 1}`);
    idOf.set(cell.id, id);
    const parentId = parentIdOf(cell);
    const styles = colourStyles(style);
    const node: ShapeNode = {
      id,
      type: "shape",
      position: { x: 0, y: 0 },
      data: {
        label: cell.label,
        shape: mapShape(style, cell.geometry),
        direction: "TB",
        ...(styles.length ? { styles } : {}),
      },
      ...(parentId ? { parentId } : {}),
    };
    nodes.push(node);
    if (cell.geometry) {
      positions[id] = {
        x: cell.geometry.x,
        y: cell.geometry.y,
        w: cell.geometry.w,
        h: cell.geometry.h,
      };
    }
  }

  const edges: FlowEdge[] = [];
  const waypoints: WaypointMap = {};
  const ordinals = new Map<string, number>();

  for (const cell of cells) {
    if (!cell.edge) continue;
    const source = idOf.get(cell.source);
    const target = idOf.get(cell.target);
    // Mermaid has no dangling connection: an arrow has two ends or it is not
    // an arrow. One drawn to empty canvas cannot come across.
    if (!source || !target) {
      dropped++;
      continue;
    }

    const style = parseStyle(cell.style);
    const stroke: EdgeStroke =
      style.of.dashed === "1"
        ? "dotted"
        : Number(style.of.strokeWidth ?? 1) >= 3
          ? "thick"
          : "normal";
    const end = (style.of.endArrow ?? "classic").toLowerCase();
    const arrow: ArrowType =
      end === "none"
        ? "arrow_open"
        : end === "oval" || end === "circle"
          ? "arrow_circle"
          : end === "cross" || end === "ercross"
            ? "arrow_cross"
            : "arrow_point";
    const start = (style.of.startArrow ?? "none").toLowerCase();
    const both = start !== "none" && arrow !== "arrow_open";

    const id = `e${edges.length}_${source}_${target}`;
    edges.push({
      id,
      source,
      target,
      data: {
        label: cell.label || edgeLabels.get(cell.id) || "",
        stroke,
        arrow,
        ...(both ? { both: true } : {}),
      },
    });

    if (cell.points.length) {
      const pair = `${source}>${target}`;
      const ordinal = ordinals.get(pair) ?? 0;
      ordinals.set(pair, ordinal + 1);
      waypoints[waypointKey(source, target, ordinal)] = cell.points;
    } else {
      const pair = `${source}>${target}`;
      ordinals.set(pair, (ordinals.get(pair) ?? 0) + 1);
    }
  }

  const body = serializeFlowchart("TB", nodes, edges);
  const trailer = [positionsLine(positions)];
  if (Object.keys(waypoints).length) trailer.push(waypointsLine(waypoints));

  const family = looksLike(cells);
  return {
    code: `${body}${trailer.join("\n")}\n`,
    nodes: nodes.length,
    edges: edges.length,
    pages,
    dropped,
    ...(family ? { looksLike: family } : {}),
  };
}
