import type { Direction } from "../types";

export function quote(label: string): string {
  return `"${label.replace(/"/g, "#quot;")}"`;
}

export function normalizeDirection(dir: unknown): Direction {
  const d = typeof dir === "string" ? dir.toUpperCase() : "TB";
  return d === "TB" || d === "TD" || d === "LR" || d === "RL" || d === "BT"
    ? (d as Direction)
    : "TB";
}

export function entriesOf(
  collection: unknown,
): Array<[string, Record<string, unknown>]> {
  if (collection instanceof Map) {
    return [...collection.entries()] as Array<[string, Record<string, unknown>]>;
  }
  if (collection && typeof collection === "object") {
    return Object.entries(collection as Record<string, Record<string, unknown>>);
  }
  return [];
}
