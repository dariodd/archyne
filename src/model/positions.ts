/**
 * Node positions are stored inside the mermaid text as a single trailing
 * comment line, e.g.
 *
 *   %% graph:positions {"a":{"x":0,"y":0},"g1":{"x":10,"y":10,"w":300,"h":200}}
 *
 * Mermaid (and every renderer/LLM) ignores %% comments, so the file stays a
 * valid, standard mermaid diagram while manual layout survives round-trips.
 * Group entries carry w/h; child node coordinates are relative to their group,
 * matching React Flow's parent-relative positioning.
 */

export interface StoredPosition {
  x: number;
  y: number;
  w?: number;
  h?: number;
}

export type PositionMap = Record<string, StoredPosition>;

const LINE_RE = /^\s*%%\s*graph:positions\s+(\{.*\})\s*$/m;

export function readPositions(code: string): PositionMap | null {
  const m = code.match(LINE_RE);
  if (!m) return null;
  try {
    const raw = JSON.parse(m[1]) as Record<string, unknown>;
    const out: PositionMap = {};
    for (const [id, v] of Object.entries(raw)) {
      if (
        v !== null &&
        typeof v === "object" &&
        typeof (v as StoredPosition).x === "number" &&
        typeof (v as StoredPosition).y === "number"
      ) {
        out[id] = v as StoredPosition;
      }
    }
    return out;
  } catch {
    return null;
  }
}

export function stripPositions(code: string): string {
  return code.replace(LINE_RE, "").replace(/\n+$/, "\n");
}

export function positionsLine(positions: PositionMap): string {
  const rounded: PositionMap = {};
  for (const [id, p] of Object.entries(positions)) {
    rounded[id] = {
      x: Math.round(p.x),
      y: Math.round(p.y),
      ...(p.w !== undefined ? { w: Math.round(p.w) } : {}),
      ...(p.h !== undefined ? { h: Math.round(p.h) } : {}),
    };
  }
  return `%% graph:positions ${JSON.stringify(rounded)}`;
}

/** Replace (or append) the positions line in an existing mermaid document. */
export function patchPositions(code: string, positions: PositionMap): string {
  const line = positionsLine(positions);
  if (LINE_RE.test(code)) return code.replace(LINE_RE, line);
  return `${code.replace(/\n+$/, "")}\n\n${line}\n`;
}

/**
 * When a rewrite (typically by an LLM) drops the positions line, carry over
 * the old document's positions for nodes that still exist, so manual layout
 * survives structural edits. A rewrite that brings its own positions wins.
 */
export function carryOverPositions(
  oldCode: string,
  newCode: string,
  currentIds: Iterable<string>,
): string {
  if (readPositions(newCode)) return newCode;
  const old = readPositions(oldCode);
  if (!old) return newCode;
  const kept: PositionMap = {};
  for (const id of currentIds) {
    if (old[id]) kept[id] = old[id];
  }
  if (Object.keys(kept).length === 0) return newCode;
  return patchPositions(newCode, kept);
}
