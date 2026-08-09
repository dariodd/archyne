import { useContext, useMemo } from "react";
import { useGraphStore } from "../store";
import { StaticGraphContext, type StaticGraph } from "./graphSourceContext";
import type { AnyNode, FlowEdge } from "../model/types";

/**
 * The graph to draw, and whether it can be edited.
 *
 * Both sources are read unconditionally — hooks cannot be called in a branch
 * — and the static one wins when it is there. Subscribing to a store the
 * component will not use costs a re-render it would have had anyway.
 */
export function useGraphView(): StaticGraph & {
  editable: boolean;
  /** The current graph, for handlers that must not close over a stale one. */
  latest: () => { nodes: AnyNode[]; edges: FlowEdge[] };
} {
  const stat = useContext(StaticGraphContext);
  const storeNodes = useGraphStore((s) => s.nodes);
  const storeEdges = useGraphStore((s) => s.edges);
  const storeKind = useGraphStore((s) => s.kind);

  return useMemo(
    () =>
      stat
        ? {
            ...stat,
            editable: false,
            latest: () => ({ nodes: stat.nodes, edges: stat.edges }),
          }
        : {
            nodes: storeNodes,
            edges: storeEdges,
            kind: storeKind,
            editable: true,
            latest: () => {
              const s = useGraphStore.getState();
              return { nodes: s.nodes, edges: s.edges };
            },
          },
    [stat, storeNodes, storeEdges, storeKind],
  );
}
