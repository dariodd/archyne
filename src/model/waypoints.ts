/**
 * Edge waypoints — the corners a connection is routed through — stored as a
 * second trailing comment beside the positions one, e.g.
 *
 *   %% graph:waypoints {"a>b":[[120,80],[120,160]],"a>b#1":[[300,80]]}
 *
 * A separate line rather than more fields inside `graph:positions`: that
 * comment's shape is part of the file format contract, and this is a
 * different kind of thing keyed a different way.
 *
 * **Coordinates are absolute canvas positions**, unlike node positions, which
 * are relative to their group. An edge can run between two nodes in different
 * groups — or between one inside a group and one outside — so there is no
 * parent whose frame both ends share.
 *
 * **Edges are keyed by their endpoints, not by their id.** Parsed edge ids
 * carry their index in the file (`e3_a_b`), so inserting one line renames
 * every edge after it and the waypoints would follow the wrong connections.
 * `a>b` survives that; a second edge between the same pair becomes `a>b#1`,
 * so adding one does not disturb the first.
 */

export interface Waypoint {
  x: number;
  y: number;
}

export type WaypointMap = Record<string, Waypoint[]>;

const LINE_RE = /^\s*%%\s*graph:waypoints\s+(\{.*\})\s*$/m;

/** Identifies one edge across re-parses. */
export function waypointKey(source: string, target: string, ordinal: number): string {
  return ordinal === 0 ? `${source}>${target}` : `${source}>${target}#${ordinal}`;
}

/**
 * A key per edge, in document order, so that repeats between the same pair
 * get stable ordinals.
 */
export function waypointKeys(
  edges: Array<{ id: string; source: string; target: string }>,
): Map<string, string> {
  const seen = new Map<string, number>();
  const out = new Map<string, string>();
  for (const e of edges) {
    const pair = `${e.source}>${e.target}`;
    const ordinal = seen.get(pair) ?? 0;
    seen.set(pair, ordinal + 1);
    out.set(e.id, waypointKey(e.source, e.target, ordinal));
  }
  return out;
}

export function readWaypoints(code: string): WaypointMap | null {
  const m = code.match(LINE_RE);
  if (!m) return null;
  try {
    const raw = JSON.parse(m[1]) as Record<string, unknown>;
    const out: WaypointMap = {};
    for (const [key, value] of Object.entries(raw)) {
      if (!Array.isArray(value)) continue;
      const points: Waypoint[] = [];
      for (const p of value) {
        // Accept only complete pairs of finite numbers: a half-read point
        // would put a corner at NaN and take the whole path with it.
        if (Array.isArray(p) && p.length >= 2) {
          const [x, y] = p;
          if (Number.isFinite(x) && Number.isFinite(y))
            points.push({ x: Number(x), y: Number(y) });
        }
      }
      if (points.length > 0) out[key] = points;
    }
    return out;
  } catch {
    return null;
  }
}

export function stripWaypoints(code: string): string {
  return code.replace(LINE_RE, "").replace(/\n+$/, "\n");
}

export function waypointsLine(map: WaypointMap): string {
  const rounded: Record<string, number[][]> = {};
  for (const [key, points] of Object.entries(map)) {
    if (points.length === 0) continue;
    rounded[key] = points.map((p) => [Math.round(p.x), Math.round(p.y)]);
  }
  return `%% graph:waypoints ${JSON.stringify(rounded)}`;
}

/**
 * Replace, add or remove the waypoints line.
 *
 * An empty map removes it rather than leaving `{}` behind: a diagram with no
 * bent edges should look exactly like one that never had any.
 */
export function patchWaypoints(code: string, map: WaypointMap): string {
  const useful = Object.entries(map).filter(([, points]) => points.length > 0);
  if (useful.length === 0) return stripWaypoints(code);
  const line = waypointsLine(Object.fromEntries(useful));
  if (LINE_RE.test(code)) return code.replace(LINE_RE, line);
  return `${code.replace(/\n+$/, "")}\n${line}\n`;
}

/**
 * Carry waypoints across a rewrite that dropped the line, for the edges that
 * still exist — the same bargain `carryOverPositions` strikes for nodes. A
 * rewrite that brings its own waypoints wins.
 */
export function carryOverWaypoints(
  oldCode: string,
  newCode: string,
  currentKeys: Iterable<string>,
): string {
  if (readWaypoints(newCode)) return newCode;
  const old = readWaypoints(oldCode);
  if (!old) return newCode;
  const kept: WaypointMap = {};
  for (const key of currentKeys) {
    if (old[key]) kept[key] = old[key];
  }
  if (Object.keys(kept).length === 0) return newCode;
  return patchWaypoints(newCode, kept);
}
