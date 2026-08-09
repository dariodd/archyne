/**
 * Reading an Excalidraw scene into a Mermaid flowchart.
 *
 * The same bargain as draw.io, and the same honesty about it: Excalidraw is a
 * freehand canvas, so the pencil strokes, the hand-drawn wobble, the images
 * and the loose text have no counterpart here. What does come across is the
 * diagram people draw *with* it — boxes, ellipses and diamonds with their
 * text, arrows between them, frames as containers, and the positions.
 *
 * Two details of the format do most of the work. Text is usually a separate
 * element bound to a shape by `containerId` rather than a property of it; and
 * an arrow knows what it joins through `startBinding` / `endBinding`, which
 * is far more reliable than guessing from where its endpoints happen to sit.
 */
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
import { positionsLine, type PositionMap } from "./positions";
import { idFactory, readableOn } from "./importShared";

export interface ExcalidrawImport {
  code: string;
  nodes: number;
  edges: number;
  /** Elements with no Mermaid equivalent — freehand, images, loose text. */
  dropped: number;
}

/** Only the fields this reads. A scene carries a great many more. */
interface Element {
  id?: unknown;
  type?: unknown;
  x?: unknown;
  y?: unknown;
  width?: unknown;
  height?: unknown;
  text?: unknown;
  label?: { text?: unknown };
  containerId?: unknown;
  frameId?: unknown;
  name?: unknown;
  isDeleted?: unknown;
  backgroundColor?: unknown;
  strokeColor?: unknown;
  strokeStyle?: unknown;
  strokeWidth?: unknown;
  startBinding?: { elementId?: unknown } | null;
  endBinding?: { elementId?: unknown } | null;
  startArrowhead?: unknown;
  endArrowhead?: unknown;
  points?: unknown;
}

const num = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const str = (value: unknown): string => (typeof value === "string" ? value : "");

/** Excalidraw writes `"transparent"` for no fill, which CSS does not mind. */
function colour(value: unknown): string | null {
  const text = str(value).trim();
  return !text || text === "transparent" ? null : text;
}

/** The Mermaid shape closest to an Excalidraw one. */
function mapShape(element: Element): Shape {
  switch (str(element.type)) {
    case "diamond":
      return "diamond";
    case "ellipse": {
      const ratio = num(element.width, 1) / Math.max(1, num(element.height, 1));
      return ratio > 1.3 ? "stadium" : "circle";
    }
    default:
      return "square";
  }
}

/** Text as Mermaid can hold it: one line, breaks kept. */
function label(raw: string): string {
  return raw
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("<br/>");
}

/** Read an Excalidraw scene. Throws when the JSON is not one. */
export function excalidrawToMermaid(json: string): ExcalidrawImport {
  let scene: { type?: unknown; elements?: unknown };
  try {
    scene = JSON.parse(json) as typeof scene;
  } catch {
    throw new Error("this file is not valid JSON");
  }
  if (!Array.isArray(scene.elements)) throw new Error("this file holds no Excalidraw scene");

  // A deleted element stays in the file until the scene is next saved from a
  // fresh session, so importing them would resurrect what was rubbed out.
  const elements = (scene.elements as Element[]).filter(
    (e) => e && typeof e === "object" && e.isDeleted !== true,
  );
  const byId = new Map(elements.map((e) => [str(e.id), e]));

  // Text bound to a shape is that shape's label, not an element of its own.
  const boundText = new Map<string, string>();
  for (const element of elements) {
    const container = str(element.containerId);
    if (str(element.type) === "text" && container) {
      boundText.set(container, label(str(element.text)));
    }
  }

  const SHAPES = new Set(["rectangle", "diamond", "ellipse"]);
  const nextId = idFactory();
  const idOf = new Map<string, string>();
  const nodes: AnyNode[] = [];
  const positions: PositionMap = {};
  let dropped = 0;

  // Frames first, so a shape inside one finds its container already named.
  for (const element of elements) {
    if (str(element.type) !== "frame") continue;
    const text = label(str(element.name)) || "Frame";
    const id = nextId(text, `g${nodes.length + 1}`);
    idOf.set(str(element.id), id);
    const group: GroupNode = {
      id,
      type: "group",
      position: { x: 0, y: 0 },
      data: { label: text, subgraphId: id },
      style: { width: num(element.width, 320), height: num(element.height, 220) },
    };
    nodes.push(group);
    positions[id] = {
      x: num(element.x),
      y: num(element.y),
      w: num(element.width, 320),
      h: num(element.height, 220),
    };
  }

  for (const element of elements) {
    const type = str(element.type);
    if (!SHAPES.has(type)) {
      // Loose text is a caption rather than a node, and everything else here
      // — freehand, images, lines — has nothing to become.
      if (type !== "arrow" && type !== "frame" && !(type === "text" && element.containerId)) {
        dropped++;
      }
      continue;
    }

    const text = boundText.get(str(element.id)) ?? label(str(element.text));
    const id = nextId(text, `n${nodes.length + 1}`);
    idOf.set(str(element.id), id);

    const fill = colour(element.backgroundColor);
    const stroke = colour(element.strokeColor);
    const styles: string[] = [];
    if (fill) styles.push(`fill:${fill}`);
    if (stroke) styles.push(`stroke:${stroke}`);
    if (fill) {
      const readable = readableOn(fill);
      if (readable) styles.push(`color:${readable}`);
    }

    const parentId = idOf.get(str(element.frameId));
    const node: ShapeNode = {
      id,
      type: "shape",
      position: { x: 0, y: 0 },
      data: {
        label: text,
        shape: mapShape(element),
        direction: "TB",
        ...(styles.length ? { styles } : {}),
      },
      ...(parentId ? { parentId } : {}),
    };
    nodes.push(node);

    // A framed shape is positioned in scene coordinates, but the canvas wants
    // a child placed relative to its container.
    const frame = byId.get(str(element.frameId));
    positions[id] = {
      x: num(element.x) - (parentId ? num(frame?.x) : 0),
      y: num(element.y) - (parentId ? num(frame?.y) : 0),
      w: num(element.width, 120),
      h: num(element.height, 60),
    };
  }

  const edges: FlowEdge[] = [];
  for (const element of elements) {
    if (str(element.type) !== "arrow") continue;
    const source = idOf.get(str(element.startBinding?.elementId));
    const target = idOf.get(str(element.endBinding?.elementId));
    // An arrow drawn to empty canvas, or between two things that did not come
    // across. Mermaid has no connection with a loose end.
    if (!source || !target) {
      dropped++;
      continue;
    }

    const style = str(element.strokeStyle);
    const stroke: EdgeStroke =
      style === "dashed" || style === "dotted"
        ? "dotted"
        : num(element.strokeWidth, 1) >= 3
          ? "thick"
          : "normal";
    const head = str(element.endArrowhead) || "arrow";
    const tail = str(element.startArrowhead);
    const arrow: ArrowType =
      head === "none"
        ? "arrow_open"
        : head === "circle" || head === "circle_outline" || head === "dot"
          ? "arrow_circle"
          : "arrow_point";
    const both = !!tail && tail !== "none" && arrow !== "arrow_open";

    edges.push({
      id: `e${edges.length}_${source}_${target}`,
      source,
      target,
      data: {
        label: boundText.get(str(element.id)) ?? label(str(element.label?.text)),
        stroke,
        arrow,
        ...(both ? { both: true } : {}),
      },
    });
  }

  const body = serializeFlowchart("TB", nodes, edges);
  const trailer = Object.keys(positions).length ? `${positionsLine(positions)}\n` : "";
  return { code: `${body}${trailer}`, nodes: nodes.length, edges: edges.length, dropped };
}
