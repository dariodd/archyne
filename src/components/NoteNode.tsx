import { Handle, NodeResizer, Position, useInternalNode, type NodeProps } from "@xyflow/react";
import type { NoteNode } from "../model/types";
import { NODE_MIN, useGraphStore } from "../store";

/** Sticky-note node (class diagram notes). */
export function NoteNodeView({ id, data, selected }: NodeProps<NoteNode>) {
  const setNodeSize = useGraphStore((s) => s.setNodeSize);
  const resizeEnd = useGraphStore((s) => s.onNodeDragStop);
  // A note is normally as wide as its text, between a floor and a ceiling.
  // Once it has been given a width it fills what it was given instead — the
  // ceiling would otherwise quietly refuse the resize.
  const sized = useInternalNode(id)?.style?.width !== undefined;
  return (
    <div className={`note-node${selected ? " selected" : ""}${sized ? " sized" : ""}`}>
      <NodeResizer
        isVisible={selected}
        minWidth={NODE_MIN.width}
        minHeight={NODE_MIN.height}
        onResize={(_, p) => setNodeSize(id, p.width, p.height, p.x, p.y)}
        onResizeEnd={() => resizeEnd()}
      />
      {data.text}
      {data.target && <div className="note-target">→ {data.target}</div>}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
