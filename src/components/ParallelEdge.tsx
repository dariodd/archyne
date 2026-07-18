import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";
import type { FlowEdge } from "../model/types";
import { edgeColors } from "../theme";

/**
 * Edge for parallel connections: edges sharing the same node pair keep
 * their exact endpoints but arc apart with increasing curvature (draw.io
 * style), each label sitting on its own lane at the curve's midpoint.
 */
export function ParallelEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  markerEnd,
  markerStart,
  label,
  selected,
  data,
}: EdgeProps<FlowEdge>) {
  const par = data?.par;
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const lane = par && par.n > 1 ? (par.i - (par.n - 1) / 2) * (par.s ?? 1) : 0;
  // Endpoints spread ALONG the node border (perpendicular to the edge) so
  // each arrowhead lands on its own spot instead of stacking on the handle…
  const endOff = lane * 14;
  const sx = sourceX + px * endOff;
  const sy = sourceY + py * endOff;
  const tx = targetX + px * endOff;
  const ty = targetY + py * endOff;
  // …while the curve's midpoint sits one full lane out, keeping the labels
  // clearly separated (quadratic midpoint = endpoints avg + control/2).
  const laneOff = lane * 28;
  const cx = (sx + tx) / 2 + px * (laneOff - endOff) * 2;
  const cy = (sy + ty) / 2 + py * (laneOff - endOff) * 2;
  const path = `M ${sx} ${sy} Q ${cx} ${cy} ${tx} ${ty}`;
  const labelX = (sourceX + targetX) / 2 + px * laneOff;
  const labelY = (sourceY + targetY) / 2 + py * laneOff;
  const pal = edgeColors();
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={style}
        markerEnd={markerEnd as string | undefined}
        markerStart={markerStart as string | undefined}
        interactionWidth={14}
      />
      {label != null && label !== "" && (
        <EdgeLabelRenderer>
          <div
            className="parallel-label"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              background: pal.labelBg,
              color: selected ? undefined : pal.labelFill,
            }}
          >
            {String(label)}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
