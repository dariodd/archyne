import type { AnyNode, Direction, FlowEdge, GroupNode, StateNode, StateType } from "../types";
import { isGroup } from "../types";

interface DocState {
  stmt: "state";
  id: string;
  description?: string;
  start?: boolean;
  type?: string;
  doc?: DocStmt[];
}
interface DocRelation {
  stmt: "relation";
  state1: DocState;
  state2: DocState;
  description?: string;
}
type DocStmt = DocState | DocRelation | { stmt: string };

/**
 * The state db's getStates/getRelations only cover the root scope — states
 * and transitions inside composite states appear solely in the recursive
 * root document, so we walk that.
 */
export function parseState(db: Record<string, (...a: unknown[]) => unknown>): {
  nodes: AnyNode[];
  edges: FlowEdge[];
} {
  const root = db.getRootDocV2?.() as { doc?: DocStmt[] } | undefined;
  const nodes: AnyNode[] = [];
  const edges: FlowEdge[] = [];
  const byId = new Map<string, AnyNode>();

  const stateTypeOf = (s: DocState): StateType => {
    if (s.start === true) return "start";
    if (s.start === false) return "end";
    if (s.type === "choice" || s.type === "fork" || s.type === "join") return s.type;
    return "normal";
  };

  const ensure = (s: DocState, parent: string | undefined, composite: boolean) => {
    const existing = byId.get(s.id);
    if (existing) {
      // A state can be referenced in a relation before its composite block
      // is declared — upgrade it to a group when the block shows up.
      if (composite && existing.type === "state") {
        const upgraded: GroupNode = {
          id: s.id,
          type: "group",
          position: { x: 0, y: 0 },
          data: {
            label: existing.data.label !== s.id ? existing.data.label : s.description || s.id,
            subgraphId: s.id,
          },
          style: { width: 320, height: 220 },
          ...(existing.parentId ? { parentId: existing.parentId } : {}),
        };
        byId.set(s.id, upgraded);
        nodes[nodes.indexOf(existing)] = upgraded;
        return;
      }
      if (parent && !existing.parentId) {
        existing.parentId = parent;
      }
      if (s.description && !isGroup(existing) && existing.data.label === s.id) {
        existing.data.label = s.description;
      }
      return;
    }
    const node: AnyNode = composite
      ? ({
          id: s.id,
          type: "group",
          position: { x: 0, y: 0 },
          data: { label: s.description || s.id, subgraphId: s.id },
          style: { width: 320, height: 220 },
          ...(parent ? { parentId: parent } : {}),
        } as GroupNode)
      : ({
          id: s.id,
          type: "state",
          position: { x: 0, y: 0 },
          data: {
            label: s.description || s.id,
            stateType: stateTypeOf(s),
            direction: "TB",
          },
          ...(parent ? { parentId: parent } : {}),
        } as StateNode);
    byId.set(s.id, node);
    nodes.push(node);
  };

  const walk = (doc: DocStmt[], parent: string | undefined) => {
    for (const stmt of doc) {
      if (stmt.stmt === "state") {
        const s = stmt as DocState;
        ensure(s, parent, Boolean(s.doc?.length));
        if (s.doc?.length) walk(s.doc, s.id);
      } else if (stmt.stmt === "relation") {
        const r = stmt as DocRelation;
        ensure(r.state1, parent, false);
        ensure(r.state2, parent, false);
        edges.push({
          id: `e${edges.length}_${r.state1.id}_${r.state2.id}`,
          source: r.state1.id,
          target: r.state2.id,
          data: { label: r.description ?? "" },
        });
      }
    }
  };
  walk(root?.doc ?? [], undefined);

  // Parents must precede children for React Flow.
  nodes.sort((a, b) => Number(isGroup(b)) - Number(isGroup(a)));
  return { nodes, edges };
}

/* ---------- serialize ---------- */

export function serializeState(
  direction: Direction,
  nodes: AnyNode[],
  edges: FlowEdge[],
): string {
  const lines: string[] = ["stateDiagram-v2"];
  if (direction !== "TB" && direction !== "TD") lines.push(`  direction ${direction}`);

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const stateTypeOf = (id: string): StateType => {
    const n = byId.get(id);
    return n && n.type === "state" ? n.data.stateType : "normal";
  };
  const ref = (id: string) => {
    const t = stateTypeOf(id);
    return t === "start" || t === "end" ? "[*]" : id;
  };

  const declare = (n: AnyNode, indent: string) => {
    if (n.type !== "state") return;
    const t = n.data.stateType;
    if (t === "start" || t === "end") return;
    if (t === "choice" || t === "fork" || t === "join") {
      lines.push(`${indent}state ${n.id} <<${t}>>`);
      return;
    }
    lines.push(
      n.data.label !== n.id ? `${indent}${n.id} : ${n.data.label}` : `${indent}${n.id}`,
    );
  };

  // An edge lives inside a composite when both endpoints share that parent.
  const scopeOf = (e: FlowEdge): string | undefined => {
    const a = byId.get(e.source);
    const b = byId.get(e.target);
    return a?.parentId && a.parentId === b?.parentId ? a.parentId : undefined;
  };

  const emitScope = (parent: string | undefined, indent: string) => {
    for (const n of nodes) {
      if (n.parentId !== parent) continue;
      if (isGroup(n)) {
        lines.push(`${indent}state ${n.id} {`);
        emitScope(n.id, indent + "  ");
        lines.push(`${indent}}`);
      } else {
        declare(n, indent);
      }
    }
    for (const e of edges) {
      if (scopeOf(e) !== parent) continue;
      const label = e.data?.label ? ` : ${e.data.label}` : "";
      lines.push(`${indent}${ref(e.source)} --> ${ref(e.target)}${label}`);
    }
  };
  emitScope(undefined, "  ");
  return lines.join("\n") + "\n";
}
