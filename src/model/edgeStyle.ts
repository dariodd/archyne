/**
 * How each connection is presented — stored as a third trailing comment
 * beside the positions and waypoints ones, e.g.
 *
 *   %% graph:edges {"a>b":{"label":[40,-12],"route":"straight"}}
 *
 * One comment rather than one per setting. Both of the things kept here are
 * decisions about a single edge's appearance, they are written and read at
 * the same moments, and a file that grew a new `%% graph:` line for every
 * such decision would become a stack of parallel dictionaries keyed the same
 * way. Adding a field to the object costs nothing; adding a line costs a
 * parser, a serialiser and a place in the round-trip.
 *
 * Edges are keyed exactly as in `waypoints.ts`, by their endpoints and an
 * ordinal — see the reasoning there. Coordinates are canvas units, and the
 * label offset is measured from where the label would sit unaided, which is
 * the middle of the route: an offset of nothing is the default, so an
 * untouched label writes nothing at all.
 */

/** How a connection is drawn between its corners. */
export type RouteStyle = "orthogonal" | "straight" | "curved";

export const ROUTE_STYLES: RouteStyle[] = ["orthogonal", "straight", "curved"];

/** The presentation of one edge. Every field is optional and defaults out. */
export interface EdgeStyle {
  /** How far the label has been dragged from the middle of the route. */
  label?: { x: number; y: number };
  /** Omitted when orthogonal, which is what an edge is unless told otherwise. */
  route?: RouteStyle;
}

export type EdgeStyleMap = Record<string, EdgeStyle>;

const LINE_RE = /^\s*%%\s*graph:edges\s+(\{.*\})\s*$/m;

const isStyle = (v: unknown): v is RouteStyle =>
  typeof v === "string" && (ROUTE_STYLES as string[]).includes(v);

/** Nothing worth writing down: the edge is exactly as it would be anyway. */
export function isPlain(style: EdgeStyle | undefined): boolean {
  if (!style) return true;
  const moved = style.label && (style.label.x !== 0 || style.label.y !== 0);
  const routed = style.route && style.route !== "orthogonal";
  return !moved && !routed;
}

export function readEdgeStyles(code: string): EdgeStyleMap | null {
  const m = code.match(LINE_RE);
  if (!m) return null;
  try {
    const raw = JSON.parse(m[1]) as Record<string, unknown>;
    const out: EdgeStyleMap = {};
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value !== "object" || value === null) continue;
      const record = value as { label?: unknown; route?: unknown };
      const style: EdgeStyle = {};

      // Only a complete pair of finite numbers: half a point would put the
      // label at NaN and take it off the page entirely.
      if (Array.isArray(record.label) && record.label.length >= 2) {
        const [x, y] = record.label;
        if (Number.isFinite(x) && Number.isFinite(y)) {
          style.label = { x: Number(x), y: Number(y) };
        }
      }
      if (isStyle(record.route)) style.route = record.route;
      if (!isPlain(style)) out[key] = style;
    }
    return out;
  } catch {
    return null;
  }
}

export function stripEdgeStyles(code: string): string {
  return code.replace(LINE_RE, "").replace(/\n+$/, "\n");
}

export function edgeStylesLine(map: EdgeStyleMap): string {
  const written: Record<string, { label?: number[]; route?: RouteStyle }> = {};
  for (const [key, style] of Object.entries(map)) {
    if (isPlain(style)) continue;
    const one: { label?: number[]; route?: RouteStyle } = {};
    if (style.label && (style.label.x !== 0 || style.label.y !== 0)) {
      one.label = [Math.round(style.label.x), Math.round(style.label.y)];
    }
    if (style.route && style.route !== "orthogonal") one.route = style.route;
    written[key] = one;
  }
  return `%% graph:edges ${JSON.stringify(written)}`;
}

/**
 * Replace, add or remove the line.
 *
 * A map with nothing worth saying removes it rather than leaving `{}`: a
 * diagram whose edges are all ordinary should look exactly like one whose
 * edges were never touched.
 */
export function patchEdgeStyles(code: string, map: EdgeStyleMap): string {
  const useful = Object.entries(map).filter(([, style]) => !isPlain(style));
  if (useful.length === 0) return stripEdgeStyles(code);
  const line = edgeStylesLine(Object.fromEntries(useful));
  if (LINE_RE.test(code)) return code.replace(LINE_RE, line);
  return `${code.replace(/\n+$/, "")}\n${line}\n`;
}

/**
 * Carry the styles across a rewrite that dropped the line, for the edges that
 * still exist — the bargain `carryOverWaypoints` strikes for corners. A
 * rewrite bringing its own styles wins.
 */
export function carryOverEdgeStyles(
  oldCode: string,
  newCode: string,
  currentKeys: Iterable<string>,
): string {
  if (readEdgeStyles(newCode)) return newCode;
  const old = readEdgeStyles(oldCode);
  if (!old) return newCode;
  const keep: EdgeStyleMap = {};
  const alive = new Set(currentKeys);
  for (const [key, style] of Object.entries(old)) {
    if (alive.has(key)) keep[key] = style;
  }
  return patchEdgeStyles(newCode, keep);
}
