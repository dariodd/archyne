import type { ReactNode } from "react";
import { StaticGraphContext, type StaticGraph } from "./graphSourceContext";

/** Wrap a canvas that draws something other than the open document. */
export function StaticGraphProvider({
  graph,
  children,
}: {
  graph: StaticGraph;
  children: ReactNode;
}) {
  return <StaticGraphContext.Provider value={graph}>{children}</StaticGraphContext.Provider>;
}
