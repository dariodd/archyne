/**
 * Where every node is, and how big — resolved once, from nothing but the nodes.
 *
 * This lived in `store.ts`, which was the natural home while the only caller
 * was the editor. It is here now because of what importing it dragged in:
 * `store.ts` reaches `workspace.ts`, which touches `window` **while the module
 * is evaluating**, so anything importing it needed a browser before a single
 * line of its own ran. `tests/e2e-render.mts` found that by trying to build an
 * SVG in Node and never getting as far as calling anything.
 *
 * Nothing here has ever needed a browser: it is arithmetic over the node list.
 * So it sits where a renderer can reach it, and the store imports it like any
 * other caller.
 */
import type { AnyNode } from "./model/types";
import { measureNode } from "./measureNode";
// Type-only, so this module carries no runtime dependency on the guides store.
import type { Box } from "./guides";

export type { Box };

/**
 * A node's box in its parent's coordinates.
 *
 * The width can come from three places depending on how the node got here —
 * a typed group size, what the browser measured, or what its contents measure
 * to before anything has been rendered — so it is resolved in one place rather
 * than at each call site.
 */
export function boxOf(n: AnyNode): Box {
  const stated = Number(n.style?.width ?? n.measured?.width ?? n.width);
  const size = measureNode(n, undefined, Number.isFinite(stated) ? stated : undefined);
  return {
    x: n.position.x,
    y: n.position.y,
    w: Number(n.style?.width ?? n.measured?.width ?? n.width ?? size.width),
    h: Number(n.style?.height ?? n.measured?.height ?? n.height ?? size.height),
  };
}

/**
 * Every node's box in canvas coordinates, with each group's offset folded in.
 *
 * React Flow stores a child's position relative to its parent, which is the
 * right thing for dragging a group and wrong for anything that compares two
 * nodes on screen. Resolved once for the whole graph rather than walking the
 * parent chain per node, since the callers ask about all of them at once.
 */
export function absoluteBoxes(nodes: AnyNode[]): Map<string, Box> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out = new Map<string, Box>();
  const resolve = (n: AnyNode, seen: Set<string>): Box => {
    const cached = out.get(n.id);
    if (cached) return cached;
    const box = boxOf(n);
    const parent = n.parentId ? byId.get(n.parentId) : undefined;
    // `seen` guards against a parent cycle. Parsing cannot produce one, but
    // this would hang rather than misbehave, which is the worse failure.
    if (parent && !seen.has(parent.id)) {
      const pb = resolve(parent, new Set(seen).add(n.id));
      box.x += pb.x;
      box.y += pb.y;
    }
    out.set(n.id, box);
    return box;
  };
  for (const n of nodes) resolve(n, new Set([n.id]));
  return out;
}
