/**
 * How each node is presented — a fourth trailing comment beside positions,
 * waypoints and edges, e.g.
 *
 *   %% graph:nodes {"web":{"look":"icon"}}
 *
 * Keyed by node id, as `graph:positions` is: a node's name is written in the
 * diagram itself and survives a re-parse, so it needs none of the endpoint
 * bookkeeping the edge comments do.
 *
 * Only what mermaid has no way of saying goes here. A service in an
 * architecture diagram is drawn as a labelled box with its icon inside;
 * Visio and draw.io more often show the icon alone, standing on the canvas
 * with its name beneath, and there is no mermaid syntax for the difference.
 */

/**
 * How a node is drawn.
 *
 * Which values mean anything depends on what the node is, and the reader does
 * not police that: a service offers `boxed` and `icon`, a container `boxed`,
 * `solid` and `plain`, and each shows only its own in the inspector. Keeping
 * one field rather than one per family is what lets a diagram carry both in
 * a single line, and an unknown value is dropped in either case.
 */
export type NodeLook = "boxed" | "icon" | "solid" | "plain";

export const NODE_LOOKS: NodeLook[] = ["boxed", "icon", "solid", "plain"];

/** What a service may be: a box with its icon, or the icon alone. */
export const SERVICE_LOOKS: NodeLook[] = ["boxed", "icon"];

/** What a container may be: the dashed default, a solid frame, or a hairline. */
export const GROUP_LOOKS: NodeLook[] = ["boxed", "solid", "plain"];

/** The presentation of one node. Every field is optional and defaults out. */
export interface NodeStyle {
  /** Omitted when boxed, which is what a node is unless told otherwise. */
  look?: NodeLook;
}

export type NodeStyleMap = Record<string, NodeStyle>;

const LINE_RE = /^\s*%%\s*graph:nodes\s+(\{.*\})\s*$/m;

const isLook = (v: unknown): v is NodeLook =>
  typeof v === "string" && (NODE_LOOKS as string[]).includes(v);

/** Nothing worth writing down: the node looks as it would anyway. */
export function isPlainNode(style: NodeStyle | undefined): boolean {
  return !style?.look || style.look === "boxed";
}

export function readNodeStyles(code: string): NodeStyleMap | null {
  const m = code.match(LINE_RE);
  if (!m) return null;
  try {
    const raw = JSON.parse(m[1]) as Record<string, unknown>;
    const out: NodeStyleMap = {};
    for (const [id, value] of Object.entries(raw)) {
      if (typeof value !== "object" || value === null) continue;
      const look = (value as { look?: unknown }).look;
      if (isLook(look) && look !== "boxed") out[id] = { look };
    }
    return out;
  } catch {
    return null;
  }
}

export function stripNodeStyles(code: string): string {
  return code.replace(LINE_RE, "").replace(/\n+$/, "\n");
}

export function nodeStylesLine(map: NodeStyleMap): string {
  const written: Record<string, { look: NodeLook }> = {};
  for (const [id, style] of Object.entries(map)) {
    if (!isPlainNode(style)) written[id] = { look: style.look! };
  }
  return `%% graph:nodes ${JSON.stringify(written)}`;
}

/**
 * Replace, add or remove the line.
 *
 * A map with nothing worth saying removes it rather than leaving `{}`: a
 * diagram whose nodes are all ordinary should look exactly like one whose
 * nodes were never touched.
 */
export function patchNodeStyles(code: string, map: NodeStyleMap): string {
  const useful = Object.entries(map).filter(([, style]) => !isPlainNode(style));
  if (useful.length === 0) return stripNodeStyles(code);
  const line = nodeStylesLine(Object.fromEntries(useful));
  if (LINE_RE.test(code)) return code.replace(LINE_RE, line);
  return `${code.replace(/\n+$/, "")}\n${line}\n`;
}

/**
 * The drawable half of a node's `style` declarations.
 *
 * The shape takes fill and stroke; the label takes the rest. Mermaid makes
 * the same split — `isLabelStyle` in its own `styles.ts` — and a declaration
 * it puts on the label is one this has to put there too, or a diagram says
 * one thing here and another everywhere else.
 *
 * Lives here rather than in `ShapeNode` because every family that can carry
 * a `style` statement needs to draw it: a state, a class and an entity all
 * take one, and only `architecture-beta` has no such statement to read.
 */
export interface DrawnStyle {
  fill?: string;
  stroke?: string;
  strokeWidth?: string;
  strokeDasharray?: string;
  color?: string;
  fontSize?: string;
  fontWeight?: string;
  fontStyle?: string;
}

const DRAWN: Record<string, keyof DrawnStyle> = {
  fill: "fill",
  stroke: "stroke",
  color: "color",
  "stroke-width": "strokeWidth",
  "stroke-dasharray": "strokeDasharray",
  "font-size": "fontSize",
  "font-weight": "fontWeight",
  "font-style": "fontStyle",
};

export function styleProps(decls: string[]): DrawnStyle {
  const out: DrawnStyle = {};
  for (const d of decls) {
    const idx = d.indexOf(":");
    if (idx < 0) continue;
    const key = DRAWN[d.slice(0, idx).trim()];
    if (key) out[key] = d.slice(idx + 1).trim();
  }
  return out;
}

/** What a label is drawn with, as inline style for the element holding it. */
export function labelStyleOf(s: DrawnStyle): React.CSSProperties {
  return {
    ...(s.color ? { color: s.color } : {}),
    ...(s.fontSize ? { fontSize: s.fontSize } : {}),
    ...(s.fontWeight ? { fontWeight: s.fontWeight } : {}),
    ...(s.fontStyle ? { fontStyle: s.fontStyle } : {}),
  };
}

/** Fill and border, for the families whose box is an ordinary element. */
export function boxStyleOf(s: DrawnStyle): React.CSSProperties {
  return {
    ...(s.fill ? { background: s.fill } : {}),
    ...(s.stroke ? { borderColor: s.stroke } : {}),
    ...labelStyleOf(s),
  };
}
