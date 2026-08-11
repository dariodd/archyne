import { useEffect, useRef, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  Position,
  type EdgeProps,
  type NodeProps,
} from "@xyflow/react";
import type { FlowEdge, ParticipantNode } from "../model/types";
import { ActorGlyph } from "./ActorGlyph";
import { useRename } from "./useRename";
import { useGraphStore } from "../store";
import { t } from "../i18n";

export { SEQ_HEADER, SEQ_TOP, SEQ_SPACING } from "../seqLayout";
import { SEQ_HEADER, SEQ_TOP, SEQ_SPACING, shiftedIndex, useSeqDrag } from "../seqLayout";

/** Pointer travel, in screen px, before a press on a message becomes a drag. */
const DRAG_THRESHOLD = 4;

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
        {data.ptype === "actor" && <ActorGlyph />}
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
 * position in the statement stream, between the two participants' lifelines.
 *
 * The whole arrow is a drag handle, not just its label: an unlabelled message
 * still has to be movable, and its label is a few pixels wide. A press only
 * becomes a drag once the pointer has actually travelled, so a plain click
 * still reaches React Flow and selects the edge.
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
  const rowCount = useGraphStore((s) => s.seqItems.length || s.edges.length);
  const label = useGraphStore((s) => s.edges.find((e) => e.id === id)?.data?.label ?? "");
  const moveMessageTo = useGraphStore((s) => s.moveMessageTo);
  const dragFrom = useSeqDrag((s) => s.from);
  const dragTo = useSeqDrag((s) => s.to);
  const dragging = useSeqDrag((s) => s.edgeId) === id;
  const [dragDy, setDragDy] = useState<number | null>(null);
  const pressedAt = useRef<number | null>(null);
  const flowScale = useRef(1);

  // Dragged: follow the pointer. Otherwise: sit on the row this message will
  // have once the drag in flight lands, so the lane opens up ahead of the drop.
  const y = dragging
    ? SEQ_TOP + index * SEQ_SPACING + (dragDy ?? 0)
    : SEQ_TOP + shiftedIndex(index, dragFrom, dragTo) * SEQ_SPACING;

  // A drag abandoned with Escape leaves the row where it started.
  useEffect(() => {
    if (!dragging) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      pressedAt.current = null;
      setDragDy(null);
      useSeqDrag.getState().end();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [dragging]);

  const drag = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      pressedAt.current = e.clientY;
      // screen px → flow px: derive the zoom from the viewport transform
      const vp = document.querySelector<HTMLElement>(".react-flow__viewport");
      const m = vp?.style.transform.match(/scale\(([\d.]+)\)/);
      flowScale.current = m ? Number(m[1]) : 1;
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (pressedAt.current === null) return;
      const travelled = e.clientY - pressedAt.current;
      if (!dragging && Math.abs(travelled) < DRAG_THRESHOLD) return;
      e.stopPropagation();
      const dy = travelled / flowScale.current;
      const to = Math.max(0, Math.min(rowCount - 1, index + Math.round(dy / SEQ_SPACING)));
      if (!dragging) useSeqDrag.getState().begin(id, index);
      useSeqDrag.getState().moveTo(to);
      setDragDy(dy);
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.currentTarget.releasePointerCapture(e.pointerId);
      pressedAt.current = null;
      if (!dragging) return; // a click, not a drag — let it select the edge
      const { to } = useSeqDrag.getState();
      useSeqDrag.getState().end();
      setDragDy(null);
      if (to !== index) moveMessageTo(id, to);
    },
    onPointerCancel: () => {
      pressedAt.current = null;
      setDragDy(null);
      useSeqDrag.getState().end();
    },
  };

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
      <path
        className={`seq-grab${dragging ? " dragging" : ""}`}
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        strokeLinecap="round"
        {...drag}
      >
        <title>{t("seq.dragReorder")}</title>
      </path>
      <EdgeLabelRenderer>
        <div
          className={`message-label draggable${selected ? " selected" : ""}${dragging ? " dragging" : ""}`}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          title={t("seq.dragReorder")}
          {...drag}
        >
          {label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
