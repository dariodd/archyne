import type {
  AnyNode,
  ArrowType,
  ClassDefs,
  Direction,
  EdgeStroke,
  FlowEdge,
  GroupNode,
  Shape,
  ShapeNode,
} from "../types";
import { SHAPES, isGroup } from "../types";
import { entriesOf, normalizeDirection, quote } from "./shared";

function normalizeShape(type: unknown): Shape {
  if (typeof type === "string" && (SHAPES as readonly string[]).includes(type)) {
    return type as Shape;
  }
  return "square";
}

export function parseFlowchart(db: Record<string, (...a: unknown[]) => unknown>): {
  direction: Direction;
  nodes: AnyNode[];
  edges: FlowEdge[];
  classDefs: ClassDefs;
} {
  const vertices = entriesOf(db.getVertices?.());
  const rawEdges = (db.getEdges?.() ?? []) as Array<Record<string, unknown>>;
  const rawSubgraphs = (db.getSubGraphs?.() ?? []) as Array<Record<string, unknown>>;
  const direction = normalizeDirection(db.getDirection?.());

  const groupIds = new Set(rawSubgraphs.map((sg) => String(sg.id)));
  const parentOf = new Map<string, string>();
  for (const sg of rawSubgraphs) {
    for (const child of (sg.nodes ?? []) as unknown[]) {
      parentOf.set(String(child), String(sg.id));
    }
  }

  const nodes: AnyNode[] = [];
  const emitGroup = (gid: string) => {
    if (nodes.some((n) => n.id === gid)) return;
    const sg = rawSubgraphs.find((x) => String(x.id) === gid);
    if (!sg) return;
    const parent = parentOf.get(gid);
    if (parent) emitGroup(parent);
    const g: GroupNode = {
      id: gid,
      type: "group",
      position: { x: 0, y: 0 },
      data: { label: String(sg.title ?? gid), subgraphId: gid },
      style: { width: 320, height: 220 },
      ...(parent ? { parentId: parent } : {}),
    };
    nodes.push(g);
  };
  for (const sg of rawSubgraphs) emitGroup(String(sg.id));

  const classDefs: ClassDefs = {};
  for (const [name, def] of entriesOf(db.getClasses?.())) {
    if (name === "default") continue;
    classDefs[name] = ((def.styles ?? []) as unknown[]).map(String);
  }

  for (const [id, v] of vertices) {
    if (groupIds.has(id)) continue;
    const parent = parentOf.get(id);
    const classes = ((v.classes ?? []) as unknown[]).map(String).filter((c) => c !== "default");
    const styles = ((v.styles ?? []) as unknown[]).map(String);
    const n: ShapeNode = {
      id,
      type: "shape",
      position: { x: 0, y: 0 },
      data: {
        label: String(v.text ?? id),
        shape: normalizeShape(v.type),
        direction,
        ...(classes.length ? { classes } : {}),
        ...(styles.length ? { styles } : {}),
      },
      ...(parent ? { parentId: parent } : {}),
    };
    nodes.push(n);
  }

  const edges: FlowEdge[] = rawEdges.map((e, i) => {
    const raw = String(e.type ?? "arrow_point");
    const both = raw.startsWith("double_");
    const t = raw.replace(/^double_/, "");
    const arrow: ArrowType =
      t === "arrow_open" || t === "arrow_circle" || t === "arrow_cross"
        ? (t as ArrowType)
        : "arrow_point";
    const s = String(e.stroke ?? "normal");
    const stroke: EdgeStroke = s === "dotted" || s === "thick" ? s : "normal";
    return {
      id: `e${i}_${e.start}_${e.end}`,
      source: String(e.start),
      target: String(e.end),
      data: { label: String(e.text ?? ""), stroke, arrow, ...(both ? { both: true } : {}) },
    };
  });

  return { direction, nodes, edges, classDefs };
}

/* ---------- serialize ---------- */

function bracket(shape: Shape, label: string): string {
  const l = quote(label);
  switch (shape) {
    case "square":
      return `[${l}]`;
    case "round":
      return `(${l})`;
    case "stadium":
      return `([${l}])`;
    case "subroutine":
      return `[[${l}]]`;
    case "cylinder":
      return `[(${l})]`;
    case "circle":
      return `((${l}))`;
    case "doublecircle":
      return `(((${l})))`;
    case "diamond":
      return `{${l}}`;
    case "hexagon":
      return `{{${l}}}`;
    case "odd":
      return `>${l}]`;
    case "trapezoid":
      return `[/${l}\\]`;
    case "inv_trapezoid":
      return `[\\${l}/]`;
    case "lean_right":
      return `[/${l}/]`;
    case "lean_left":
      return `[\\${l}\\]`;
  }
}

function edgeOp(stroke: EdgeStroke, arrow: ArrowType, both?: boolean): string {
  const head =
    arrow === "arrow_point"
      ? ">"
      : arrow === "arrow_circle"
        ? "o"
        : arrow === "arrow_cross"
          ? "x"
          : "";
  const tail = !both || !head ? "" : arrow === "arrow_point" ? "<" : head;
  switch (stroke) {
    case "dotted":
      return head ? `${tail}-.-${head}` : "-.-";
    case "thick":
      return head ? `${tail}==${head}` : "===";
    default:
      return head ? `${tail}--${head}` : "---";
  }
}

export function serializeFlowchart(
  direction: Direction,
  nodes: AnyNode[],
  edges: FlowEdge[],
  classDefs: ClassDefs = {},
): string {
  const lines: string[] = [`flowchart ${direction}`];
  const groups = nodes.filter(isGroup);
  const byParent = new Map<string | undefined, AnyNode[]>();
  for (const n of nodes) {
    if (isGroup(n)) continue;
    const list = byParent.get(n.parentId) ?? [];
    list.push(n);
    byParent.set(n.parentId, list);
  }

  const emitNode = (n: AnyNode, indent: string) => {
    if (n.type !== "shape") return;
    lines.push(`${indent}${n.id}${bracket(n.data.shape, n.data.label)}`);
  };

  for (const n of byParent.get(undefined) ?? []) emitNode(n, "  ");

  const emitGroup = (g: GroupNode, indent: string) => {
    lines.push(`${indent}subgraph ${g.id} [${quote(g.data.label)}]`);
    for (const child of byParent.get(g.id) ?? []) emitNode(child, indent + "  ");
    for (const nested of groups.filter((x) => x.parentId === g.id)) {
      emitGroup(nested, indent + "  ");
    }
    lines.push(`${indent}end`);
  };
  for (const g of groups.filter((x) => !x.parentId)) emitGroup(g, "  ");

  if (edges.length > 0) lines.push("");
  for (const e of edges) {
    const d = e.data;
    const op = edgeOp(d?.stroke ?? "normal", d?.arrow ?? "arrow_point", d?.both);
    const label = d?.label ? `|${quote(d.label)}|` : "";
    lines.push(`  ${e.source} ${op}${label} ${e.target}`);
  }

  const styleLines: string[] = [];
  for (const [name, styles] of Object.entries(classDefs)) {
    if (styles.length) styleLines.push(`  classDef ${name} ${styles.join(",")}`);
  }
  const byClass = new Map<string, string[]>();
  for (const n of nodes) {
    if (n.type !== "shape") continue;
    for (const c of n.data.classes ?? []) {
      byClass.set(c, [...(byClass.get(c) ?? []), n.id]);
    }
    if (n.data.styles?.length) {
      styleLines.push(`  style ${n.id} ${n.data.styles.join(",")}`);
    }
  }
  for (const [name, ids] of byClass) {
    styleLines.push(`  class ${ids.join(",")} ${name}`);
  }
  if (styleLines.length) lines.push("", ...styleLines);
  return lines.join("\n") + "\n";
}
