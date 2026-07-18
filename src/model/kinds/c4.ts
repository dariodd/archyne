import type { AnyNode, C4Node, C4Shape, FlowEdge, GroupNode } from "../types";
import { C4_SHAPES } from "../types";

/** typeC4Shape.text → element statement name. */
const STMT_BY_SHAPE: Record<C4Shape, string> = {
  person: "Person",
  external_person: "Person_Ext",
  system: "System",
  external_system: "System_Ext",
  system_db: "SystemDb",
  system_queue: "SystemQueue",
  container: "Container",
  external_container: "Container_Ext",
  container_db: "ContainerDb",
  container_queue: "ContainerQueue",
  component: "Component",
  external_component: "Component_Ext",
  component_db: "ComponentDb",
  component_queue: "ComponentQueue",
  external_system_db: "SystemDb_Ext",
  external_system_queue: "SystemQueue_Ext",
  external_container_db: "ContainerDb_Ext",
  external_container_queue: "ContainerQueue_Ext",
  external_component_db: "ComponentDb_Ext",
  external_component_queue: "ComponentQueue_Ext",
};

const BOUNDARY_STMT: Record<string, string> = {
  ENTERPRISE: "Enterprise_Boundary",
  SYSTEM: "System_Boundary",
  CONTAINER: "Container_Boundary",
  node: "Node",
  node_l: "Node_L",
  node_r: "Node_R",
};

const REL_STMT: Record<string, string> = {
  rel: "Rel",
  birel: "BiRel",
  rel_u: "Rel_U",
  rel_d: "Rel_D",
  rel_l: "Rel_L",
  rel_r: "Rel_R",
  rel_b: "Rel_Back",
};

function textOf(v: unknown): string {
  return String((v as { text?: unknown } | null | undefined)?.text ?? "");
}

function normShape(v: string): C4Shape {
  return (C4_SHAPES as readonly string[]).includes(v) ? (v as C4Shape) : "system";
}

export function parseC4(db: Record<string, (...a: unknown[]) => unknown>): {
  nodes: AnyNode[];
  edges: FlowEdge[];
  c4Flavor: string;
  title: string;
} {
  const shapes = (db.getC4ShapeArray?.() ?? []) as Array<Record<string, unknown>>;
  const boundaries = (db.getBoundaries?.() ?? []) as Array<Record<string, unknown>>;
  const rels = (db.getRels?.() ?? []) as Array<Record<string, unknown>>;
  const c4Flavor = String(db.getC4Type?.() ?? "C4Context");
  const title = String(db.getTitle?.() ?? "");

  const parentOf = (v: unknown): string | undefined => {
    const p = String(v ?? "");
    return p && p !== "global" ? p : undefined;
  };

  const nodes: AnyNode[] = [];
  const emitBoundary = (alias: string) => {
    if (alias === "global" || nodes.some((n) => n.id === alias)) return;
    const raw = boundaries.find((b) => String(b.alias) === alias);
    if (!raw) return;
    const parent = parentOf(raw.parentBoundary);
    if (parent) emitBoundary(parent);
    const g: GroupNode = {
      id: alias,
      type: "group",
      position: { x: 0, y: 0 },
      data: {
        label: textOf(raw.label),
        subgraphId: alias,
        boundaryType: textOf(raw.type) || "SYSTEM",
      },
      style: { width: 340, height: 240 },
      ...(parent ? { parentId: parent } : {}),
    };
    nodes.push(g);
  };
  for (const b of boundaries) emitBoundary(String(b.alias));

  for (const s of shapes) {
    const parent = parentOf(s.parentBoundary);
    const node: C4Node = {
      id: String(s.alias),
      type: "c4",
      position: { x: 0, y: 0 },
      data: {
        label: textOf(s.label),
        c4Shape: normShape(textOf(s.typeC4Shape)),
        descr: textOf(s.descr),
        direction: "TB",
      },
      ...(parent ? { parentId: parent } : {}),
    };
    nodes.push(node);
  }

  const edges: FlowEdge[] = rels.map((r, i) => ({
    id: `e${i}_${r.from}_${r.to}`,
    source: String(r.from),
    target: String(r.to),
    data: {
      label: textOf(r.label),
      c4: {
        relType: String(r.type ?? "rel"),
        techn: textOf(r.techn),
      },
    },
  }));

  return { nodes, edges, c4Flavor, title };
}

/* ---------- serialize ---------- */

export function serializeC4(
  nodes: AnyNode[],
  edges: FlowEdge[],
  c4Flavor = "C4Context",
  title = "",
): string {
  const lines: string[] = [c4Flavor];
  if (title) lines.push(`  title ${title}`);

  const emitElement = (n: AnyNode, indent: string) => {
    if (n.type !== "c4") return;
    const stmt = STMT_BY_SHAPE[n.data.c4Shape];
    const descr = n.data.descr ? `, "${n.data.descr}"` : "";
    lines.push(`${indent}${stmt}(${n.id}, "${n.data.label}"${descr})`);
  };

  const emitScope = (parent: string | undefined, indent: string) => {
    for (const n of nodes) {
      if (n.parentId !== parent) continue;
      if (n.type === "group") {
        const stmt = BOUNDARY_STMT[n.data.boundaryType ?? ""] ?? "System_Boundary";
        lines.push(`${indent}${stmt}(${n.id}, "${n.data.label}") {`);
        emitScope(n.id, indent + "  ");
        lines.push(`${indent}}`);
      } else {
        emitElement(n, indent);
      }
    }
  };
  emitScope(undefined, "  ");

  if (edges.length > 0) lines.push("");
  for (const e of edges) {
    const c = e.data?.c4;
    const stmt = REL_STMT[c?.relType ?? "rel"] ?? "Rel";
    const techn = c?.techn ? `, "${c.techn}"` : "";
    lines.push(`  ${stmt}(${e.source}, ${e.target}, "${e.data?.label ?? ""}"${techn})`);
  }
  return lines.join("\n") + "\n";
}
