import type { AnyNode, Direction, EntityAttr, EntityNode, ErCard, FlowEdge } from "../types";
import { ER_CARDS } from "../types";
import { entriesOf } from "./shared";

/**
 * Cardinality marker adjacent to the LEFT entity in the syntax. Note:
 * mermaid stores the markers swapped relative to the syntax — in
 * `A ||--o{ B`, `||` (next to A) is parsed as cardB and `o{` as cardA.
 */
const LEFT_MARK: Record<ErCard, string> = {
  ONLY_ONE: "||",
  ZERO_OR_ONE: "|o",
  ZERO_OR_MORE: "}o",
  ONE_OR_MORE: "}|",
};
const RIGHT_MARK: Record<ErCard, string> = {
  ONLY_ONE: "||",
  ZERO_OR_ONE: "o|",
  ZERO_OR_MORE: "o{",
  ONE_OR_MORE: "|{",
};

function normalizeCard(v: unknown): ErCard {
  return (ER_CARDS as readonly string[]).includes(String(v)) ? (v as ErCard) : "ONLY_ONE";
}

export function parseEr(db: Record<string, (...a: unknown[]) => unknown>): {
  nodes: AnyNode[];
  edges: FlowEdge[];
} {
  const entities = entriesOf(db.getEntities?.());
  const rels = (db.getRelationships?.() ?? []) as Array<Record<string, unknown>>;

  const nameByInternalId = new Map<string, string>();
  const nodes: AnyNode[] = entities.map(([name, v]) => {
    nameByInternalId.set(String(v.id ?? name), name);
    const attributes: EntityAttr[] = ((v.attributes ?? []) as Array<Record<string, unknown>>).map(
      (a) => ({
        type: String(a.type ?? ""),
        name: String(a.name ?? ""),
        keys: ((a.keys ?? []) as unknown[]).map(String),
        comment: String(a.comment ?? ""),
      }),
    );
    const alias = String(v.alias ?? "");
    const node: EntityNode = {
      id: name,
      type: "entity",
      position: { x: 0, y: 0 },
      data: { label: alias || String(v.label ?? name), attributes, direction: "TB" },
    };
    return node;
  });

  const edges: FlowEdge[] = rels.map((r, i) => {
    const spec = (r.relSpec ?? {}) as Record<string, unknown>;
    const source = nameByInternalId.get(String(r.entityA)) ?? String(r.entityA);
    const target = nameByInternalId.get(String(r.entityB)) ?? String(r.entityB);
    return {
      id: `e${i}_${source}_${target}`,
      source,
      target,
      data: {
        label: String(r.roleA ?? ""),
        er: {
          cardA: normalizeCard(spec.cardA),
          cardB: normalizeCard(spec.cardB),
          identifying: String(spec.relType) !== "NON_IDENTIFYING",
        },
      },
    };
  });

  return { nodes, edges };
}

/* ---------- serialize ---------- */

export function serializeEr(direction: Direction, nodes: AnyNode[], edges: FlowEdge[]): string {
  const lines: string[] = ["erDiagram"];
  if (direction !== "TB" && direction !== "TD") lines.push(`  direction ${direction}`);

  for (const n of nodes) {
    if (n.type !== "entity") continue;
    const head = n.data.label !== n.id ? `${n.id}["${n.data.label}"]` : n.id;
    if (n.data.attributes.length === 0) {
      lines.push(`  ${head}`);
      continue;
    }
    lines.push(`  ${head} {`);
    for (const a of n.data.attributes) {
      const keys = a.keys.length ? ` ${a.keys.join(", ")}` : "";
      const comment = a.comment ? ` "${a.comment}"` : "";
      lines.push(`    ${a.type} ${a.name}${keys}${comment}`);
    }
    lines.push("  }");
  }

  if (edges.length > 0) lines.push("");
  for (const e of edges) {
    const er = e.data?.er;
    if (!er) continue;
    const op = `${LEFT_MARK[er.cardB]}${er.identifying ? "--" : ".."}${RIGHT_MARK[er.cardA]}`;
    lines.push(`  ${e.source} ${op} ${e.target} : "${e.data?.label ?? ""}"`);
  }
  return lines.join("\n") + "\n";
}
