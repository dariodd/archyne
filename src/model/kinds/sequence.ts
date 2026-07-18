import type { AnyNode, FlowEdge, ParticipantNode, SeqItem, SeqOp } from "../types";
import { entriesOf } from "./shared";

/** mermaid sequenceDb LINETYPE constants → syntax operators. */
const OP_BY_TYPE: Record<number, SeqOp> = {
  0: "->>",
  1: "-->>",
  3: "-x",
  4: "--x",
  5: "->",
  6: "-->",
  24: "-)",
  25: "--)",
};

/** Block-opening statement types → keyword. */
const BLOCK_BY_TYPE: Record<number, string> = {
  10: "loop",
  12: "alt",
  15: "opt",
  19: "par",
  22: "rect",
  27: "critical",
  30: "break",
};

/** Divider statement types → keyword. */
const DIVIDER_BY_TYPE: Record<number, string> = {
  13: "else",
  20: "and",
  28: "option",
};

const END_TYPES = new Set([11, 14, 16, 21, 23, 29, 31]);
const PLACEMENT: Record<number, "left" | "right" | "over"> = {
  0: "left",
  1: "right",
  2: "over",
};

function textOf(v: unknown): string {
  if (v && typeof v === "object" && "text" in (v as object)) {
    return String((v as { text: unknown }).text ?? "");
  }
  return typeof v === "string" ? v : "";
}

/**
 * The sequence db exposes everything as one ordered statement stream —
 * messages, notes, block open/divider/close, activations. We keep that
 * stream as `items`, so structural canvas edits can rebuild the code
 * without losing constructs the canvas doesn't edit yet.
 */
export function parseSequence(db: Record<string, (...a: unknown[]) => unknown>): {
  nodes: AnyNode[];
  edges: FlowEdge[];
  items: SeqItem[];
  warning?: string;
} {
  const actors = entriesOf(db.getActors?.());
  const messages = (db.getMessages?.() ?? []) as Array<Record<string, unknown>>;

  const nodes: AnyNode[] = actors.map(([id, a]) => {
    const node: ParticipantNode = {
      id,
      type: "participant",
      position: { x: 0, y: 0 },
      data: {
        label: String(a.description ?? id),
        ptype: a.type === "actor" ? "actor" : "participant",
        direction: "TB",
      },
    };
    return node;
  });

  const edges: FlowEdge[] = [];
  const items: SeqItem[] = [];
  let skipped = 0;
  for (const m of messages) {
    const type = typeof m.type === "number" ? m.type : -1;
    const op = OP_BY_TYPE[type];
    const from = typeof m.from === "string" ? m.from : undefined;
    const to = typeof m.to === "string" ? m.to : undefined;
    if (op && from && to) {
      const edge: FlowEdge = {
        id: `m${edges.length}_${from}_${to}`,
        source: from,
        target: to,
        data: { label: textOf(m.message), seq: { op } },
      };
      edges.push(edge);
      items.push({ kind: "message", edgeId: edge.id });
      continue;
    }
    if (type === 2 && from) {
      items.push({
        kind: "note",
        placement: PLACEMENT[Number(m.placement)] ?? "over",
        a: from,
        ...(to && to !== from ? { b: to } : {}),
        text: textOf(m.message),
      });
      continue;
    }
    if (BLOCK_BY_TYPE[type]) {
      items.push({ kind: "block", op: BLOCK_BY_TYPE[type], label: textOf(m.message) });
      continue;
    }
    if (DIVIDER_BY_TYPE[type]) {
      items.push({ kind: "divider", op: DIVIDER_BY_TYPE[type], label: textOf(m.message) });
      continue;
    }
    if (END_TYPES.has(type)) {
      items.push({ kind: "end" });
      continue;
    }
    if ((type === 17 || type === 18) && from) {
      items.push({ kind: "active", on: type === 17, actor: from });
      continue;
    }
    if (type === 26) {
      items.push({ kind: "autonumber" });
      continue;
    }
    skipped++;
  }

  return {
    nodes,
    edges,
    items,
    ...(skipped > 0
      ? {
          warning: `${skipped} sequence statement(s) of an unsupported kind will be dropped by canvas edits.`,
        }
      : {}),
  };
}

/**
 * Remove the item at `index`. Removing a block also removes its matching
 * end and its top-level dividers, keeping the wrapped content in place.
 */
export function removeSeqItemAt(items: SeqItem[], index: number): SeqItem[] {
  const item = items[index];
  if (!item) return items;
  if (item.kind !== "block") {
    return items.filter((_, i) => i !== index);
  }
  const drop = new Set<number>([index]);
  let depth = 0;
  for (let i = index + 1; i < items.length; i++) {
    const it = items[i];
    if (it.kind === "block") depth++;
    else if (it.kind === "divider" && depth === 0) drop.add(i);
    else if (it.kind === "end") {
      if (depth === 0) {
        drop.add(i);
        break;
      }
      depth--;
    }
  }
  return items.filter((_, i) => !drop.has(i));
}

/* ---------- serialize ---------- */

export function serializeSequence(
  nodes: AnyNode[],
  edges: FlowEdge[],
  items: SeqItem[] = [],
): string {
  const lines: string[] = ["sequenceDiagram"];
  // Left-to-right position on the canvas defines participant order.
  const participants = nodes
    .filter((n): n is ParticipantNode => n.type === "participant")
    .sort((a, b) => a.position.x - b.position.x);
  for (const p of participants) {
    const alias = p.data.label !== p.id ? ` as ${p.data.label}` : "";
    lines.push(`  ${p.data.ptype} ${p.id}${alias}`);
  }

  const byId = new Map(edges.map((e) => [e.id, e]));
  const emitted = new Set<string>();
  let depth = 1;
  const pad = () => "  ".repeat(depth);

  const emitMessage = (e: FlowEdge) => {
    const op = e.data?.seq?.op ?? "->>";
    lines.push(`${pad()}${e.source}${op}${e.target}: ${e.data?.label || "msg"}`);
    emitted.add(e.id);
  };

  for (const item of items) {
    switch (item.kind) {
      case "message": {
        const e = byId.get(item.edgeId);
        if (e) emitMessage(e); // deleted messages simply vanish from the stream
        break;
      }
      case "note": {
        const where =
          item.placement === "over"
            ? `over ${item.a}${item.b ? `,${item.b}` : ""}`
            : `${item.placement} of ${item.a}`;
        lines.push(`${pad()}Note ${where}: ${item.text}`);
        break;
      }
      case "block":
        lines.push(`${pad()}${item.op}${item.label ? ` ${item.label}` : ""}`);
        depth++;
        break;
      case "divider":
        depth = Math.max(1, depth - 1);
        lines.push(`${pad()}${item.op}${item.label ? ` ${item.label}` : ""}`);
        depth++;
        break;
      case "end":
        depth = Math.max(1, depth - 1);
        lines.push(`${pad()}end`);
        break;
      case "active":
        lines.push(`${pad()}${item.on ? "activate" : "deactivate"} ${item.actor}`);
        break;
      case "autonumber":
        lines.push(`${pad()}autonumber`);
        break;
    }
  }
  // Messages drawn on the canvas but not yet in the stream go at the end.
  for (const e of edges) {
    if (!emitted.has(e.id)) emitMessage(e);
  }
  return lines.join("\n") + "\n";
}
