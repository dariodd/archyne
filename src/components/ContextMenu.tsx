import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useReactFlow } from "@xyflow/react";
import { useGraphStore } from "../store";
import { isGroup, type DiagramKind, type NodeSeed } from "../model/types";
import { useT } from "../i18n";

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
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const t = useT();

  useEffect(() => {
    // Focus into the menu on open, and hand focus back to whatever had it
    // when the menu closes — otherwise keyboard users are stranded.
    const restoreTo = document.activeElement as HTMLElement | null;
    firstItemRef.current?.focus();
    return () => restoreTo?.focus?.();
  }, []);

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
        { label: t("menu.rename"), action: run(() => focusInspectorLabel()) },
        { label: t("menu.ungroup"), action: run(() => s.ungroupSelection()) },
        {
          label: t("menu.deleteGroup"),
          danger: true,
          action: run(() => s.deleteElement(node.id, "node")),
        },
      );
    } else {
      items.push(
        { label: t("menu.rename"), action: run(() => focusInspectorLabel()) },
        { label: t("menu.duplicate"), action: run(() => s.duplicateNode(node.id)) },
        {
          label: t("menu.copy"),
          action: run(() => s.copySelection()),
        },
      );
      if (node.parentId) {
        items.push({
          label: t("menu.removeFromGroup"),
          action: run(() => s.removeFromGroup(node.id)),
        });
      }
      items.push({
        label: t("menu.delete"),
        danger: true,
        action: run(() => s.deleteElement(node.id, "node")),
      });
    }
  } else if (menu.target === "selection") {
    const count = s.nodes.filter((n) => n.selected).length;
    const groupable =
      s.kind === "flowchart" ||
      s.kind === "state" ||
      s.kind === "architecture" ||
      s.kind === "c4";
    if (groupable) {
      items.push({
        label: t("menu.groupNodes", { count }),
        action: run(() => s.groupSelection()),
      });
    }
    items.push(
      { label: t("menu.copy"), action: run(() => s.copySelection()) },
      {
        label: t("menu.duplicate"),
        action: run(() => {
          s.copySelection();
          s.pasteClipboard();
        }),
      },
      {
        label: t("menu.deleteSelection"),
        danger: true,
        action: run(() => s.deleteSelection()),
      },
    );
  } else if (menu.target === "edge" && menu.id) {
    const id = menu.id;
    items.push(
      { label: t("menu.editLabel"), action: run(() => focusInspectorLabel()) },
      { label: t("menu.delete"), danger: true, action: run(() => s.deleteElement(id, "edge")) },
    );
  } else {
    items.push(
      {
        label: t("menu.addNodeHere"),
        action: run(() =>
          s.addNode(DEFAULT_SEED[s.kind], screenToFlowPosition({ x: menu.x, y: menu.y })),
        ),
      },
      { label: t("menu.paste"), action: run(() => s.pasteClipboard()) },
      { label: t("menu.autoLayout"), action: run(() => void s.runAutoLayout()) },
    );
  }

  /** Arrow / Home / End move focus between items, as a menu should. */
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    if (buttons.length === 0) return;
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? buttons.length - 1
          : e.key === "ArrowDown"
            ? (at + 1) % buttons.length
            : (at - 1 + buttons.length) % buttons.length;
    buttons[next].focus();
  };

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: menu.x, top: menu.y }}
      role="menu"
      aria-label={t("menu.actions")}
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      {items.map((item, i) => (
        <button
          key={item.label}
          className={`context-item${item.danger ? " danger" : ""}`}
          role="menuitem"
          // Focus the first item on open so the menu is usable from the
          // keyboard and Escape has somewhere sensible to return from.
          ref={i === 0 ? firstItemRef : undefined}
          onClick={item.action}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
