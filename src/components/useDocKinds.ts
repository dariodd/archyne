import { useMemo } from "react";
import { readDocCode, useWorkspace } from "../workspace";
import { sniffKind } from "../model/sniff";
import { useGraphStore } from "../store";
import type { DiagramKind } from "../model/types";

/**
 * Each open document's family, keyed by id.
 *
 * Re-read when the documents change or the open one is edited — which is when
 * a family can change, since it changes by rewriting the header. The active
 * document is taken from the store rather than from storage, so a kind
 * switched a moment ago shows immediately.
 *
 * In its own file because two surfaces want it: the tab strip and the list of
 * all documents. Keeping it out of either component file also keeps both of
 * them exporting nothing but components, which is what fast refresh needs to
 * swap them without reloading the page.
 */
export function useDocKinds(): Record<string, DiagramKind | null> {
  const docs = useWorkspace((s) => s.docs);
  const activeId = useWorkspace((s) => s.activeId);
  const code = useGraphStore((s) => s.code);

  return useMemo(() => {
    const out: Record<string, DiagramKind | null> = {};
    for (const d of docs) {
      out[d.id] = sniffKind(d.id === activeId ? code : (readDocCode(d.id) ?? ""));
    }
    return out;
  }, [docs, activeId, code]);
}
