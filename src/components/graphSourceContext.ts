import { createContext } from "react";
import type { AnyNode, DiagramKind, FlowEdge } from "../model/types";

/**
 * Where a canvas component gets its graph from.
 *
 * The editor's edge components used to read `useGraphStore` directly, which
 * tied them to *the* open document. That was invisible until something else
 * wanted to draw a canvas — the import preview, which shows a diagram that
 * has deliberately not been loaded — and every connection came out missing,
 * because the components looked in the store and found somebody else's
 * diagram, or nothing at all.
 *
 * So the graph arrives through a context instead. The editor provides none,
 * and the components fall back to the store exactly as before; a preview
 * provides a static one and is read-only by construction, because a static
 * graph has nowhere to put an edit.
 */
export interface StaticGraph {
  nodes: AnyNode[];
  edges: FlowEdge[];
  kind: DiagramKind;
}

export const StaticGraphContext = createContext<StaticGraph | null>(null);
