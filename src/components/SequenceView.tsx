import { useRef, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  Position,
  type EdgeProps,
  type NodeProps,
} from "@xyflow/react";
import type { FlowEdge, ParticipantNode } from "../model/types";
import { useRename } from "./useRename";
import { useGraphStore } from "../store";
import { t } from "../i18n";

export { SEQ_HEADER, SEQ_TOP, SEQ_SPACING } from "../seqLayout";
import { SEQ_HEADER, SEQ_TOP, SEQ_SPACING } from "../seqLayout";

export function ParticipantNodeView({ id, data, selected }: NodeProps<ParticipantNode>) {
  const rename = useRename(id, data.label, { multiline: true });
  const rowCount = useGraphStore((s) => s.seqItems.length || s.edges.length);
  const lifelineHeight = SEQ_TOP - SEQ_HEADER + rowCount * SEQ_SPACING + 30;
  return (
    <div className="participant-node">
      <div
        className={`participant-head ${data.ptype}${selected ? " selected" : ""}`}
        onDoubleClick={rename.begin}
      >
        {data.ptype === "actor" && <span className="actor-icon">☺</span>}
        {rename.editing ? rename.field : data.label}
      </div>
      <div className="lifeline" style={{ height: lifelineHeight }} />
      {/* One source-type handle only: a stacked target handle would sit on
          top and make every drag start from the "wrong" end, reversing the
          created message. Loose connection mode accepts both directions. */}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

/**
 * A sequence message: a horizontal line at a y determined by the message's
 * position in the edge list, between the two participants' lifelines.
 */
export function MessageEdge({
  id,
  sourceX,
  targetX,
  style,
  markerEnd,
  selected,
}: EdgeProps<FlowEdge>) {
  // Primitive selectors only: returning a fresh object from a zustand
  // selector re-renders forever under useSyncExternalStore.
  const index = useGraphStore((s) => {
    const row = s.seqItems.findIndex((it) => it.kind === "message" && it.edgeId === id);
    return row >= 0 ? row : s.edges.findIndex((e) => e.id === id);
  });
  const label = useGraphStore((s) => s.edges.find((e) => e.id === id)?.data?.label ?? "");
  const moveMessage = useGraphStore((s) => s.moveMessage);
  const [dragDy, setDragDy] = useState<number | null>(null);
  const dragStart = useRef(0);
  const flowScale = useRef(1);

  const y = SEQ_TOP + index * SEQ_SPACING + (dragDy ?? 0);

  const isSelf = Math.abs(sourceX - targetX) < 1;
  const path = isSelf
    ? `M ${sourceX} ${y - 8} h 46 v 20 h -46`
    : `M ${sourceX} ${y} L ${targetX} ${y}`;
  const labelX = isSelf ? sourceX + 54 : (sourceX + targetX) / 2;
  const labelY = isSelf ? y + 2 : y - 12;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{ ...style, ...(selected ? { stroke: "var(--accent, #5b8def)" } : {}) }}
        markerEnd={markerEnd as string | undefined}
        interactionWidth={16}
      />
      <EdgeLabelRenderer>
        <div
          className={`message-label draggable${selected ? " selected" : ""}${dragDy !== null ? " dragging" : ""}`}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          title={t("seq.dragReorder")}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            dragStart.current = e.clientY;
            // screen px → flow px: derive the zoom from the viewport transform
            const vp = document.querySelector<HTMLElement>(".react-flow__viewport");
            const m = vp?.style.transform.match(/scale\(([\d.]+)\)/);
            flowScale.current = m ? Number(m[1]) : 1;
            setDragDy(0);
          }}
          onPointerMove={(e) => {
            if (dragDy === null) return;
            setDragDy((e.clientY - dragStart.current) / flowScale.current);
          }}
          onPointerUp={(e) => {
            if (dragDy === null) return;
            (e.target as HTMLElement).releasePointerCapture(e.pointerId);
            const delta = Math.round(dragDy / SEQ_SPACING);
            setDragDy(null);
            if (delta !== 0) moveMessage(id, delta);
          }}
        >
          {label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
