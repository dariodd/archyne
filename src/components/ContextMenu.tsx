import { useEffect, useRef } from "react";
import { useReactFlow } from "@xyflow/react";
import { useGraphStore } from "../store";
import { isGroup, type DiagramKind, type NodeSeed } from "../model/types";

export interface MenuState {
  x: number;
  y: number;
  target: "node" | "edge" | "pane" | "selection";
  id?: string;
}

const DEFAULT_SEED: Record<DiagramKind, NodeSeed> = {
  flowchart: { type: "shape", shape: "square" },
  state: { type: "state", stateType: "normal" },
  er: { type: "entity" },
  class: { type: "class" },
  sequence: { type: "participant", ptype: "participant" },
  architecture: { type: "service", icon: "server" },
  c4: { type: "c4", c4Shape: "system" },
};

function focusInspectorLabel() {
  requestAnimationFrame(() => document.getElementById("inspector-label")?.focus());
}

export function ContextMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  const { screenToFlowPosition } = useReactFlow();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Capture phase: React Flow stops propagation of canvas mousedowns, so
    // bubble-phase window listeners never fire — capture always does.
    const onDown = (e: Event) => {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("wheel", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("wheel", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  const s = useGraphStore.getState();
  const node = menu.target === "node" ? s.nodes.find((n) => n.id === menu.id) : undefined;

  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };

  const items: Array<{ label: string; danger?: boolean; action: () => void }> = [];

  if (menu.target === "node" && node) {
    if (isGroup(node)) {
      items.push(
        { label: "Rename", action: run(() => focusInspectorLabel()) },
        { label: "Ungroup", action: run(() => s.ungroupSelection()) },
        {
          label: "Delete group",
          danger: true,
          action: run(() => s.deleteElement(node.id, "node")),
        },
      );
    } else {
      items.push(
        { label: "Rename", action: run(() => focusInspectorLabel()) },
        { label: "Duplicate", action: run(() => s.duplicateNode(node.id)) },
        {
          label: "Copy",
          action: run(() => s.copySelection()),
        },
      );
      if (node.parentId) {
        items.push({
          label: "Remove from group",
          action: run(() => s.removeFromGroup(node.id)),
        });
      }
      items.push({
        label: "Delete",
        danger: true,
        action: run(() => s.deleteElement(node.id, "node")),
      });
    }
  } else if (menu.target === "selection") {
    const count = s.nodes.filter((n) => n.selected).length;
    const groupable =
      s.kind === "flowchart" || s.kind === "state" || s.kind === "architecture" || s.kind === "c4";
    if (groupable) {
      items.push({ label: `Group ${count} nodes`, action: run(() => s.groupSelection()) });
    }
    items.push(
      { label: "Copy", action: run(() => s.copySelection()) },
      {
        label: "Duplicate",
        action: run(() => {
          s.copySelection();
          s.pasteClipboard();
        }),
      },
      { label: "Delete selection", danger: true, action: run(() => s.deleteSelection()) },
    );
  } else if (menu.target === "edge" && menu.id) {
    const id = menu.id;
    items.push(
      { label: "Edit label", action: run(() => focusInspectorLabel()) },
      { label: "Delete", danger: true, action: run(() => s.deleteElement(id, "edge")) },
    );
  } else {
    items.push(
      {
        label: "Add node here",
        action: run(() =>
          s.addNode(DEFAULT_SEED[s.kind], screenToFlowPosition({ x: menu.x, y: menu.y })),
        ),
      },
      { label: "Paste", action: run(() => s.pasteClipboard()) },
      { label: "Auto-layout", action: run(() => void s.runAutoLayout()) },
    );
  }

  return (
    <div ref={ref} className="context-menu" style={{ left: menu.x, top: menu.y }}>
      {items.map((item) => (
        <button
          key={item.label}
          className={`context-item${item.danger ? " danger" : ""}`}
          onClick={item.action}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
