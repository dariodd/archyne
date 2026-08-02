import { ViewportPortal } from "@xyflow/react";
import { useGuides } from "../guides";

/**
 * The alignment guides, drawn in canvas coordinates.
 *
 * `ViewportPortal` puts these inside the transformed layer, so a line stays
 * glued to the nodes it refers to at any zoom. The 1px width is divided by
 * nothing on purpose: a hairline that thickens as you zoom in reads as part
 * of the diagram, and these are not part of the diagram.
 */
export function GuideLines() {
  const guides = useGuides((s) => s.guides);
  if (guides.length === 0) return null;
  return (
    <ViewportPortal>
      {guides.map((g) => (
        <div
          key={`${g.axis}${g.at}`}
          className="guide-line"
          style={
            g.axis === "x"
              ? {
                  transform: `translate(${g.at}px, ${g.from}px)`,
                  height: g.to - g.from,
                  width: 1,
                }
              : {
                  transform: `translate(${g.from}px, ${g.at}px)`,
                  width: g.to - g.from,
                  height: 1,
                }
          }
        />
      ))}
    </ViewportPortal>
  );
}
