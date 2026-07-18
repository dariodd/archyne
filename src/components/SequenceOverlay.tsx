import { useEffect, useRef, useState } from "react";
import { ViewportPortal } from "@xyflow/react";
import { useGraphStore } from "../store";
import { estimateSize } from "../model/types";
import { SEQ_TOP, SEQ_SPACING } from "../seqLayout";

interface Editing {
  index: number;
  x: number;
  y: number;
}

/** Screen-fixed editor for a sequence item (note / block / divider). */
function SeqItemEditor({
  editing,
  onClose,
  actors,
}: {
  editing: Editing;
  onClose: () => void;
  actors: string[];
}) {
  const item = useGraphStore((s) => s.seqItems[editing.index]);
  const updateSeqItem = useGraphStore((s) => s.updateSeqItem);
  const removeSeqItem = useGraphStore((s) => s.removeSeqItem);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: Event) => {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  if (!item) return null;
  const canEditText =
    item.kind === "note" || item.kind === "block" || item.kind === "divider";

  return (
    <div
      ref={ref}
      className="seq-editor"
      style={{ left: Math.min(editing.x, window.innerWidth - 240), top: editing.y + 10 }}
    >
      {canEditText && (
        <input
          autoFocus
          key={editing.index}
          defaultValue={item.kind === "note" ? item.text : item.label}
          placeholder={item.kind === "note" ? "Note text" : "Label"}
          onBlur={(e) => {
            const v = e.target.value;
            updateSeqItem(
              editing.index,
              item.kind === "note" ? { ...item, text: v } : { ...item, label: v },
            );
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
      )}
      {item.kind === "note" && (
        <div className="seq-editor-row">
          <select
            value={item.placement}
            onChange={(e) =>
              updateSeqItem(editing.index, {
                ...item,
                placement: e.target.value as "left" | "right" | "over",
              })
            }
          >
            <option value="over">over</option>
            <option value="left">left of</option>
            <option value="right">right of</option>
          </select>
          <select
            value={item.a}
            onChange={(e) => updateSeqItem(editing.index, { ...item, a: e.target.value })}
          >
            {actors.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="seq-editor-actions">
        <button
          className="danger"
          onClick={() => {
            onClose();
            removeSeqItem(editing.index);
          }}
        >
          Delete
        </button>
        <button onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

/**
 * Sequence constructs beyond messages — notes, block frames with dividers,
 * activation markers — drawn in flow coordinates. Notes, block tags, and
 * dividers open a screen-fixed editor on click.
 */
export function SequenceOverlay() {
  const items = useGraphStore((s) => s.seqItems);
  const nodes = useGraphStore((s) => s.nodes);
  const [editing, setEditing] = useState<Editing | null>(null);

  const centers = new Map<string, number>();
  const actors: string[] = [];
  let minX = Infinity;
  let maxX = -Infinity;
  for (const n of nodes) {
    if (n.type !== "participant") continue;
    const w = n.measured?.width ?? estimateSize(n).width;
    const cx = n.position.x + w / 2;
    centers.set(n.id, cx);
    actors.push(n.id);
    minX = Math.min(minX, cx);
    maxX = Math.max(maxX, cx);
  }
  if (!centers.size) return null;

  const rowY = (i: number) => SEQ_TOP + i * SEQ_SPACING;
  const open = (index: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing({ index, x: e.clientX, y: e.clientY });
  };

  const overlays: React.ReactNode[] = [];
  const stack: Array<{ start: number; op: string; label: string }> = [];

  items.forEach((item, i) => {
    if (item.kind === "note") {
      const ax = centers.get(item.a) ?? minX;
      const bx = item.b ? (centers.get(item.b) ?? ax) : ax;
      // "over" spans the actors but never collapses below a readable width.
      const width =
        item.placement === "over" ? Math.max(150, Math.abs(bx - ax) + 20) : 170;
      const left =
        item.placement === "left"
          ? ax - width - 20
          : item.placement === "right"
            ? ax + 20
            : (ax + bx) / 2 - width / 2;
      overlays.push(
        <div
          key={`note-${i}`}
          className="seq-note clickable"
          style={{ left, top: rowY(i) - 14, width }}
          onClick={open(i)}
        >
          {item.text}
        </div>,
      );
    } else if (item.kind === "block") {
      stack.push({ start: i, op: item.op, label: item.label });
    } else if (item.kind === "divider") {
      overlays.push(
        <div
          key={`div-${i}`}
          className="seq-divider"
          style={{ left: minX - 50, top: rowY(i), width: maxX - minX + 100 }}
        >
          <span className="clickable" onClick={open(i)}>
            {item.op} {item.label}
          </span>
        </div>,
      );
    } else if (item.kind === "end") {
      const o = stack.pop();
      if (o) {
        overlays.push(
          <div
            key={`blk-${o.start}`}
            className="seq-block"
            style={{
              left: minX - 60,
              top: rowY(o.start) - 6,
              width: maxX - minX + 120,
              height: rowY(i) - rowY(o.start) + 12,
            }}
          >
            <span className="seq-block-tag clickable" onClick={open(o.start)}>
              {o.op}
              {o.label ? ` [${o.label}]` : ""}
            </span>
          </div>,
        );
      }
    } else if (item.kind === "active") {
      const x = centers.get(item.actor);
      if (x !== undefined) {
        overlays.push(
          <div
            key={`act-${i}`}
            className="seq-active"
            style={{ left: x + 8, top: rowY(i) - 8 }}
          >
            {item.on ? "activate" : "deactivate"} {item.actor}
          </div>,
        );
      }
    }
  });

  return (
    <>
      <ViewportPortal>{overlays}</ViewportPortal>
      {editing && (
        <SeqItemEditor editing={editing} actors={actors} onClose={() => setEditing(null)} />
      )}
    </>
  );
}
