import type { ElkNode } from "elkjs/lib/elk-api";
import type ELKType from "elkjs/lib/elk-api";
import type { AnyNode, Direction, FlowEdge } from "../model/types";
import { estimateSize, isGroup } from "../model/types";
import type { PositionMap } from "../model/positions";

// ELK's bundled engine is ~1.4 MB — load it only when a layout is requested.
let elkPromise: Promise<InstanceType<typeof ELKType>> | null = null;
function getElk() {
  if (!elkPromise) {
    elkPromise = import("elkjs/lib/elk.bundled.js").then((m) => new m.default());
  }
  return elkPromise;
}

const ELK_DIRECTION: Record<Direction, string> = {
  TD: "DOWN",
  TB: "DOWN",
  BT: "UP",
  LR: "RIGHT",
  RL: "LEFT",
};

/**
 * Compute positions for every node with ELK's layered algorithm. Groups
 * become ELK hierarchy nodes, so child coordinates come back parent-relative
 * — exactly what React Flow expects.
 */
export async function autoLayout(
  nodes: AnyNode[],
  edges: FlowEdge[],
  direction: Direction,
): Promise<PositionMap> {
  const childrenOf = new Map<string | undefined, AnyNode[]>();
  for (const n of nodes) {
    const list = childrenOf.get(n.parentId) ?? [];
    list.push(n);
    childrenOf.set(n.parentId, list);
  }

  const toElk = (n: AnyNode): ElkNode => {
    if (isGroup(n)) {
      return {
        id: n.id,
        children: (childrenOf.get(n.id) ?? []).map(toElk),
        layoutOptions: { "elk.padding": "[top=40,left=16,bottom=16,right=16]" },
      };
    }
    const size = estimateSize(n);
    return {
      id: n.id,
      width: n.measured?.width ?? n.width ?? size.width,
      height: n.measured?.height ?? n.height ?? size.height,
    };
  };

  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": ELK_DIRECTION[direction],
      "elk.layered.spacing.nodeNodeBetweenLayers": "70",
      "elk.spacing.nodeNode": "40",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
    },
    children: (childrenOf.get(undefined) ?? []).map(toElk),
    edges: edges.map((e, i) => ({
      id: e.id || `e${i}`,
      sources: [e.source],
      targets: [e.target],
    })),
  };

  const elk = await getElk();
  const result = await elk.layout(graph);
  const positions: PositionMap = {};
  const collect = (elkNode: ElkNode, isRoot: boolean) => {
    if (!isRoot) {
      positions[elkNode.id] = {
        x: elkNode.x ?? 0,
        y: elkNode.y ?? 0,
        ...(elkNode.children?.length
          ? { w: elkNode.width ?? 0, h: elkNode.height ?? 0 }
          : {}),
      };
    }
    for (const c of elkNode.children ?? []) collect(c, false);
  };
  collect(result, true);
  return positions;
}
