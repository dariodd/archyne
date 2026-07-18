import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { NoteNode } from "../model/types";

/** Sticky-note node (class diagram notes). */
export function NoteNodeView({ data, selected }: NodeProps<NoteNode>) {
  return (
    <div className={`note-node${selected ? " selected" : ""}`}>
      {data.text}
      {data.target && <div className="note-target">→ {data.target}</div>}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
