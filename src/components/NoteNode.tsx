import type { NodeProps } from "@xyflow/react";
import type { NoteNode } from "../model/types";
import { NodeResize } from "./NodeResize";
import { useSized } from "./useSized";
import { SideHandles } from "./SideHandles";

/** Sticky-note node (class diagram notes). */
export function NoteNodeView({ id, data, selected }: NodeProps<NoteNode>) {
  // A note is normally as wide as its text, between a floor and a ceiling.
  // Once it has been given a width it fills what it was given instead — the
  // ceiling would otherwise quietly refuse the resize.
  const sized = useSized(id);
  return (
    <div className={`note-node${selected ? " selected" : ""}${sized ? " sized" : ""}`}>
      <NodeResize id={id} visible={selected} />
      {data.text}
      {data.target && <div className="note-target">→ {data.target}</div>}
      <SideHandles />
    </div>
  );
}
