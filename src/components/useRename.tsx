import { useState } from "react";
import { labelToText, textToLabel } from "../model/label";
import { useGraphStore } from "../store";

/**
 * Renaming a node in place, on the canvas.
 *
 * Double-clicking a node and typing its name is how every diagram editor
 * works, and here it existed on flowchart shapes alone — in the other six
 * families the only way to change a label was to find the field in the
 * inspector. This is that editor, lifted out of `ShapeNodeView` so the rest
 * can have it rather than grow six copies of it.
 *
 * `multiline` follows what mermaid will accept, which is not a detail we get
 * to decide. A second line is `<br>` in the file — the field shows it as a
 * line and writes it back as markup, see `model/label.ts` — and an
 * architecture diagram's parser rejects `<br>` outright, so a service is
 * renamed one line at a time and Enter there has nothing to do but finish.
 *
 * The caller owns the markup: it says where the field goes and what opens
 * it, because a picture node puts it under the icon, a table under the
 * title, and a participant in the head. All this owns is the state, the
 * conversion, and the keys.
 */
export function useRename(
  id: string,
  label: string,
  options: {
    multiline?: boolean;
    className?: string;
    style?: React.CSSProperties;
    /** Which field of the node holds the text. A note keeps its in `text`. */
    field?: string;
  } = {},
) {
  const { multiline = false, className = "", style, field: key = "label" } = options;
  const updateNodeData = useGraphStore((s) => s.updateNodeData);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const begin = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraft(multiline ? labelToText(label) : label);
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const next = multiline ? textToLabel(draft.trim()) : draft.trim();
    if (next && next !== label) updateNodeData(id, { [key]: next });
  };

  /**
   * The field, laid over the words rather than put in place of them.
   *
   * Most of these nodes are the size of what they hold, so a field with a
   * width of its own is a node that changes shape the moment it is
   * double-clicked — which it did, in seven families out of eight. So the
   * text stays in the layout, unseen, holding the box open, and the field
   * is positioned on top of it. What is held open is the *draft*, not the
   * label: the box then follows what is being typed, and ends the rename at
   * the size it had been showing all along.
   */
  const field = (
    <span className="node-rename-slot" style={style}>
      <span aria-hidden="true" className="node-rename-ghost">
        {draft || " "}
      </span>
      <textarea
        className={`node-rename nodrag${className ? ` ${className}` : ""}`}
        value={draft}
        // No wrapping: a long name scrolls under the caret instead of
        // folding onto a second line the node has no room for. The lines
        // Shift+Enter puts in are still lines.
        wrap="off"
        rows={draft.split("\n").length}
        cols={1}
        // Legitimate autofocus: this is only rendered after a double-click
        // asking to type, so focus belongs here.
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          // Enter finishes the rename, which leaves the textarea's own Enter
          // for the line break — under Shift, where every other field puts it.
          if (e.key === "Enter" && !(multiline && e.shiftKey)) {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") setEditing(false);
        }}
      />
    </span>
  );

  return { editing, begin, field };
}
