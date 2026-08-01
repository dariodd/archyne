import { useMemo, useState } from "react";
import { useGraphStore } from "../store";
import { useT } from "../i18n";
import type { AnyNode } from "../model/types";

/**
 * A navigable, textual view of the diagram.
 *
 * A canvas conveys structure spatially, which is exactly the information a
 * screen reader cannot recover — so the graph needs a parallel representation
 * that states it: every node, and what each one connects to. It doubles as
 * the answer to navigating a large diagram, where hunting for a node by eye
 * stops working well before 200 nodes.
 *
 * Selecting a row selects the node on the canvas, so the two views stay in
 * step rather than being separate modes.
 */
function labelOf(node: AnyNode): string {
  const label = (node.data as { label?: unknown } | undefined)?.label;
  return typeof label === "string" && label.trim() ? label : node.id;
}

export function GraphOutline() {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const selectOnly = useGraphStore((s) => s.selectOnly);
  const [filter, setFilter] = useState("");
  const t = useT();

  const outgoing = useMemo(() => {
    const map = new Map<string, Array<{ to: string; label: string }>>();
    const nameOf = new Map(nodes.map((n) => [n.id, labelOf(n)]));
    for (const edge of edges) {
      const list = map.get(edge.source) ?? [];
      const edgeLabel = (edge.data as { label?: unknown } | undefined)?.label;
      list.push({
        to: nameOf.get(edge.target) ?? edge.target,
        label: typeof edgeLabel === "string" ? edgeLabel : "",
      });
      map.set(edge.source, list);
    }
    return map;
  }, [nodes, edges]);

  const query = filter.trim().toLowerCase();
  const shown = query
    ? nodes.filter(
        (n) => labelOf(n).toLowerCase().includes(query) || n.id.toLowerCase().includes(query),
      )
    : nodes;

  if (nodes.length === 0) {
    return (
      <div className="outline">
        <p className="palette-hint">{t("outline.noNodes")}</p>
      </div>
    );
  }

  return (
    <div className="outline">
      <input
        className="outline-filter"
        type="search"
        value={filter}
        placeholder={t("outline.filter")}
        aria-label={t("outline.filter")}
        onChange={(e) => setFilter(e.target.value)}
      />
      <p className="outline-summary">
        {t("outline.summary", { nodes: nodes.length, edges: edges.length })}
      </p>

      {shown.length === 0 ? (
        <p className="palette-hint">{t("outline.empty")}</p>
      ) : (
        <ul className="outline-list">
          {shown.map((node) => {
            const links = outgoing.get(node.id) ?? [];
            const name = labelOf(node);
            return (
              <li key={node.id}>
                <button
                  type="button"
                  className={`outline-node${node.selected ? " selected" : ""}`}
                  aria-label={t("outline.select", { name })}
                  aria-current={node.selected ? "true" : undefined}
                  onClick={() => selectOnly(node.id, "node")}
                >
                  <span className="outline-name">{name}</span>
                  {links.length > 0 && (
                    <span className="outline-count">
                      {t("outline.connections", { count: links.length })}
                    </span>
                  )}
                </button>
                {links.length > 0 && (
                  <ul className="outline-links">
                    {links.map((link, i) => (
                      <li key={`${link.to}-${i}`}>
                        <span aria-hidden="true">→ </span>
                        {link.to}
                        {link.label && <em> ({link.label})</em>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
