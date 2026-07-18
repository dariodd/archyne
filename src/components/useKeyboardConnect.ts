import { useEffect, useState } from "react";
import { useGraphStore } from "../store";
import { t } from "../i18n";

/** Id of the React Flow node containing the focused element, if any. */
function focusedNodeId(): string | undefined {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return undefined;
  const node = el.closest<HTMLElement>(".react-flow__node");
  return node?.dataset.id;
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.tagName) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

/**
 * Create edges from the keyboard.
 *
 * Dragging from a handle is the only pointer-free way React Flow offers to
 * connect two nodes, which left the core action of a diagram editor
 * unreachable without a mouse. Tab to a node, press `c`, Tab to another, and
 * press Enter. Escape abandons it.
 *
 * Returns the message to announce, so the caller can render it in a live
 * region, and the pending source id so the canvas can highlight it.
 */
export function useKeyboardConnect() {
  const onConnect = useGraphStore((s) => s.onConnect);
  const [source, setSource] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const labelOf = (id: string) => {
      const node = useGraphStore.getState().nodes.find((n) => n.id === id);
      const label = (node?.data as { label?: unknown } | undefined)?.label;
      return typeof label === "string" && label ? label : id;
    };

    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;

      if (e.key === "Escape" && source) {
        setSource(null);
        setMessage(t("canvas.connectCancelled"));
        return;
      }

      const nodeId = focusedNodeId();
      if (!nodeId) return;

      if (!source && e.key.toLowerCase() === "c" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setSource(nodeId);
        setMessage(t("canvas.connectStart", { name: labelOf(nodeId) }));
        return;
      }

      if (source && e.key === "Enter") {
        e.preventDefault();
        if (nodeId === source) {
          setMessage(t("canvas.connectSameNode"));
          return;
        }
        onConnect({ source, target: nodeId, sourceHandle: null, targetHandle: null });
        setMessage(t("canvas.connectDone", { from: labelOf(source), to: labelOf(nodeId) }));
        setSource(null);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [source, onConnect]);

  return { source, message };
}
