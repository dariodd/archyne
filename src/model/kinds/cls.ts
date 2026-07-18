import type {
  AnyNode,
  ClassMarker,
  ClassNode,
  Direction,
  FlowEdge,
  GroupNode,
  NoteNode,
} from "../types";
import { entriesOf } from "./shared";

/** mermaid's numeric relation-type constants. */
const TYPE_BY_NUM: Record<number, ClassMarker> = {
  0: "aggregation",
  1: "extension",
  2: "composition",
  3: "dependency",
};

const LEFT_MARK: Record<ClassMarker, string> = {
  none: "",
  extension: "<|",
  composition: "*",
  aggregation: "o",
  dependency: "<",
};
const RIGHT_MARK: Record<ClassMarker, string> = {
  none: "",
  extension: "|>",
  composition: "*",
  aggregation: "o",
  dependency: ">",
};

function markerOf(v: unknown): ClassMarker {
  return typeof v === "number" ? (TYPE_BY_NUM[v] ?? "none") : "none";
}

export function parseClass(db: Record<string, (...a: unknown[]) => unknown>): {
  nodes: AnyNode[];
  edges: FlowEdge[];
  warning?: string;
} {
  const classes = entriesOf(db.getClasses?.());
  const rels = (db.getRelations?.() ?? []) as Array<Record<string, unknown>>;
  const namespaces = entriesOf(db.getNamespaces?.());
  const rawNotes = entriesOf(db.getNotes?.());

  // Namespaces become groups; member classes carry a parent field.
  const groups: AnyNode[] = namespaces.map(([name]) => {
    const g: GroupNode = {
      id: name,
      type: "group",
      position: { x: 0, y: 0 },
      data: { label: name, subgraphId: name },
      style: { width: 340, height: 240 },
    };
    return g;
  });

  const classNodes: AnyNode[] = classes.map(([name, v]) => {
    const members = ((v.members ?? []) as Array<Record<string, unknown>>).map(
      (m) => `${m.visibility ?? ""}${m.id ?? ""}${m.classifier ?? ""}`,
    );
    const methods = ((v.methods ?? []) as Array<Record<string, unknown>>).map((m) => {
      const ret = String(m.returnType ?? "");
      return `${m.visibility ?? ""}${m.id ?? ""}(${m.parameters ?? ""})${m.classifier ?? ""}${ret ? ` ${ret}` : ""}`;
    });
    const generic = String(v.type ?? "");
    const parent = v.parent ? String(v.parent) : undefined;
    const node: ClassNode = {
      id: name,
      type: "class",
      position: { x: 0, y: 0 },
      ...(parent ? { parentId: parent } : {}),
      data: {
        label: String(v.label ?? name),
        members,
        methods,
        annotations: ((v.annotations ?? []) as unknown[]).map(String),
        ...(generic ? { generic } : {}),
        direction: "TB",
      },
    };
    return node;
  });

  const noteNodes: AnyNode[] = rawNotes.map(([nid, n], i) => {
    const node: NoteNode = {
      id: String(n.id ?? nid ?? `note${i}`),
      type: "note",
      position: { x: 0, y: 0 },
      data: {
        text: String(n.text ?? ""),
        ...(n.class ? { target: String(n.class) } : {}),
        direction: "TB",
      },
    };
    return node;
  });

  const nodes: AnyNode[] = [...groups, ...classNodes, ...noteNodes];

  const edges: FlowEdge[] = rels.map((r, i) => {
    const rel = (r.relation ?? {}) as Record<string, unknown>;
    const card = (v: unknown) =>
      typeof v === "string" && v !== "none" && v !== "" ? v : undefined;
    return {
      id: `e${i}_${r.id1}_${r.id2}`,
      source: String(r.id1),
      target: String(r.id2),
      data: {
        label: String(r.title ?? ""),
        cls: {
          left: markerOf(rel.type1),
          right: markerOf(rel.type2),
          dotted: rel.lineType === 1,
          card1: card(r.relationTitle1),
          card2: card(r.relationTitle2),
        },
      },
    };
  });

  return { nodes, edges };
}

/* ---------- serialize ---------- */

export function serializeClass(
  direction: Direction,
  nodes: AnyNode[],
  edges: FlowEdge[],
): string {
  const lines: string[] = ["classDiagram"];
  if (direction !== "TB" && direction !== "TD") lines.push(`  direction ${direction}`);

  const emitClass = (n: ClassNode, indent: string) => {
    const gen = n.data.generic ? `~${n.data.generic}~` : "";
    const head =
      n.data.label !== n.id
        ? `class ${n.id}${gen}["${n.data.label}"]`
        : `class ${n.id}${gen}`;
    const ann = n.data.annotations ?? [];
    if (ann.length === 0 && n.data.members.length === 0 && n.data.methods.length === 0) {
      lines.push(`${indent}${head}`);
      return;
    }
    lines.push(`${indent}${head} {`);
    for (const a of ann) lines.push(`${indent}  <<${a}>>`);
    for (const m of n.data.members) lines.push(`${indent}  ${m}`);
    for (const m of n.data.methods) lines.push(`${indent}  ${m}`);
    lines.push(`${indent}}`);
  };

  // Namespaces first, with their member classes inside.
  for (const g of nodes) {
    if (g.type !== "group") continue;
    lines.push(`  namespace ${g.id} {`);
    for (const n of nodes) {
      if (n.type === "class" && n.parentId === g.id) emitClass(n, "    ");
    }
    lines.push("  }");
  }
  for (const n of nodes) {
    if (n.type === "class" && !n.parentId) emitClass(n, "  ");
  }
  for (const n of nodes) {
    if (n.type !== "note") continue;
    const text = n.data.text.replace(/"/g, "'").replace(/\n/g, " ");
    lines.push(
      n.data.target ? `  note for ${n.data.target} "${text}"` : `  note "${text}"`,
    );
  }

  if (edges.length > 0) lines.push("");
  for (const e of edges) {
    const c = e.data?.cls;
    if (!c) continue;
    const line = c.dotted ? ".." : "--";
    const op = `${LEFT_MARK[c.left]}${line}${RIGHT_MARK[c.right]}`;
    const card1 = c.card1 ? `"${c.card1}" ` : "";
    const card2 = c.card2 ? `"${c.card2}" ` : "";
    const label = e.data?.label ? ` : ${e.data.label}` : "";
    lines.push(`  ${e.source} ${card1}${op} ${card2}${e.target}${label}`);
  }
  return lines.join("\n") + "\n";
}
