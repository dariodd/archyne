import type {
  AnyNode,
  ArchDir,
  ArchEdgeInfo,
  FlowEdge,
  GroupNode,
  JunctionNode,
  ServiceNode,
} from "../types";

const DIRS = new Set(["L", "R", "T", "B"]);

function normDir(v: unknown, fallback: ArchDir): ArchDir {
  return typeof v === "string" && DIRS.has(v) ? (v as ArchDir) : fallback;
}

export function parseArchitecture(db: Record<string, (...a: unknown[]) => unknown>): {
  nodes: AnyNode[];
  edges: FlowEdge[];
  warning?: string;
} {
  const rawGroups = (db.getGroups?.() ?? []) as Array<Record<string, unknown>>;
  const rawServices = (db.getServices?.() ?? []) as Array<Record<string, unknown>>;
  const rawJunctions = (db.getJunctions?.() ?? []) as Array<Record<string, unknown>>;
  const rawEdges = (db.getEdges?.() ?? []) as Array<Record<string, unknown>>;

  const nodes: AnyNode[] = [];
  const emitGroup = (gid: string) => {
    if (nodes.some((n) => n.id === gid)) return;
    const raw = rawGroups.find((x) => String(x.id) === gid);
    if (!raw) return;
    const parent = raw.in ? String(raw.in) : undefined;
    if (parent) emitGroup(parent);
    const g: GroupNode = {
      id: gid,
      type: "group",
      position: { x: 0, y: 0 },
      data: {
        label: String(raw.title ?? gid),
        subgraphId: gid,
        ...(raw.icon ? { icon: String(raw.icon) } : {}),
      },
      style: { width: 340, height: 240 },
      ...(parent ? { parentId: parent } : {}),
    };
    nodes.push(g);
  };
  for (const g of rawGroups) emitGroup(String(g.id));

  for (const s of rawServices) {
    const parent = s.in ? String(s.in) : undefined;
    // Both icon and label are optional in the grammar — keep them empty
    // rather than inventing defaults, so serialize stays faithful.
    const node: ServiceNode = {
      id: String(s.id),
      type: "service",
      position: { x: 0, y: 0 },
      data: {
        label: s.title != null ? String(s.title) : "",
        icon: s.icon != null ? String(s.icon) : "",
        direction: "TB",
      },
      ...(parent ? { parentId: parent } : {}),
    };
    nodes.push(node);
  }
  for (const j of rawJunctions) {
    const parent = j.in ? String(j.in) : undefined;
    const node: JunctionNode = {
      id: String(j.id),
      type: "junction",
      position: { x: 0, y: 0 },
      data: {},
      ...(parent ? { parentId: parent } : {}),
    };
    nodes.push(node);
  }

  // mermaid's architecture renderer ids connections as `lhs-rhs`, so a
  // second edge between the same ordered pair breaks its rendering.
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const e of rawEdges) {
    const key = `${e.lhsId}-${e.rhsId}`;
    if (seen.has(key)) dups.add(key);
    seen.add(key);
  }

  const edges: FlowEdge[] = rawEdges.map((e, i) => {
    const arch: ArchEdgeInfo = {
      lhsDir: normDir(e.lhsDir, "R"),
      rhsDir: normDir(e.rhsDir, "L"),
      lhsInto: Boolean(e.lhsInto),
      rhsInto: Boolean(e.rhsInto),
      lhsGroup: Boolean(e.lhsGroup),
      rhsGroup: Boolean(e.rhsGroup),
    };
    return {
      id: `e${i}_${e.lhsId}_${e.rhsId}`,
      source: String(e.lhsId),
      target: String(e.rhsId),
      sourceHandle: arch.lhsDir,
      targetHandle: arch.rhsDir,
      data: { label: String(e.title ?? ""), arch },
    };
  });

  return {
    nodes,
    edges,
    ...(dups.size > 0
      ? {
          warning: `mermaid can render only ONE connection per ordered pair of services — duplicated: ${[...dups].join(", ")}. The canvas shows them, but preview/render will fail until the extra edges are removed.`,
        }
      : {}),
  };
}

/* ---------- serialize ---------- */

export function serializeArchitecture(nodes: AnyNode[], edges: FlowEdge[]): string {
  const lines: string[] = ["architecture-beta"];

  const inSuffix = (n: AnyNode) => (n.parentId ? ` in ${n.parentId}` : "");
  const iconPart = (icon: string | undefined) => (icon ? `(${icon})` : "");
  const labelPart = (label: string) => (label ? `[${label}]` : "");
  for (const n of nodes) {
    if (n.type !== "group") continue;
    lines.push(
      `  group ${n.id}${iconPart(n.data.icon)}${labelPart(n.data.label)}${inSuffix(n)}`,
    );
  }
  for (const n of nodes) {
    if (n.type === "service") {
      lines.push(
        `  service ${n.id}${iconPart(n.data.icon)}${labelPart(n.data.label)}${inSuffix(n)}`,
      );
    } else if (n.type === "junction") {
      lines.push(`  junction ${n.id}${inSuffix(n)}`);
    }
  }

  if (edges.length > 0) lines.push("");
  for (const e of edges) {
    const a = e.data?.arch;
    if (!a) continue;
    const lhs = `${e.source}${a.lhsGroup ? "{group}" : ""}:${a.lhsDir}`;
    const rhs = `${a.rhsDir}:${e.target}${a.rhsGroup ? "{group}" : ""}`;
    const label = e.data?.label ? `[${e.data.label}]` : "";
    const op = `${a.lhsInto ? "<" : ""}-${label}-${a.rhsInto ? ">" : ""}`;
    lines.push(`  ${lhs} ${op} ${rhs}`);
  }
  return lines.join("\n") + "\n";
}
