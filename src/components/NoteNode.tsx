import type { NodeProps } from "@xyflow/react";
import type { NoteNode } from "../model/types";
import { NodeResize } from "./NodeResize";
import { useSized } from "./useSized";
import { SideHandles } from "./SideHandles";
import { useRename } from "./useRename";

/** Sticky-note node (class diagram notes). */
export function NoteNodeView({ id, data, selected }: NodeProps<NoteNode>) {
  // A note is normally as wide as its text, between a floor and a ceiling.
  // Once it has been given a width it fills what it was given instead — the
  // ceiling would otherwise quietly refuse the resize.
  const sized = useSized(id);
  // A note keeps its words in `text` rather than `label`, and they are the
  // whole of it — so the field stands in for the note itself.
  const rename = useRename(id, data.text, {
    multiline: true,
    field: "text",
    className: "note-rename",
  });
  return (
    <div
      className={`note-node${selected ? " selected" : ""}${sized ? " sized" : ""}`}
      onDoubleClick={rename.begin}
    >
      <NodeResize id={id} visible={selected} />
      {rename.editing ? rename.field : data.text}
      {data.target && <div className="note-target">→ {data.target}</div>}
      <SideHandles />
    </div>
  );
}
