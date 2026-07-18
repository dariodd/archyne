import { useCallback, useMemo, useState } from "react";
import { ContextMenu, type MenuState } from "./ContextMenu";
import {
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  SelectionMode,
  useReactFlow,
  type NodeTypes,
} from "@xyflow/react";
import { useRef } from "react";
import { useGraphStore } from "../store";
import type { AnyNode, DiagramKind, FlowEdge, NodeSeed } from "../model/types";
import { GroupNodeView, ShapeNodeView } from "./ShapeNode";
import { ClassNodeView, EntityNodeView, MarkerDefs, StateNodeView } from "./KindNodes";
import { MessageEdge, ParticipantNodeView } from "./SequenceView";
import { C4NodeView, JunctionNodeView, ServiceNodeView } from "./ArchView";
import { ParallelEdge } from "./ParallelEdge";
import { NoteNodeView } from "./NoteNode";
import { SequenceOverlay } from "./SequenceOverlay";
import { useKeyboardConnect } from "./useKeyboardConnect";
import { MermaidPreview } from "./MermaidPreview";
import { useT } from "../i18n";
import type { EdgeTypes } from "@xyflow/react";

const nodeTypes: NodeTypes = {
  shape: ShapeNodeView,
  group: GroupNodeView,
  state: StateNodeView,
  entity: EntityNodeView,
  class: ClassNodeView,
  participant: ParticipantNodeView,
  service: ServiceNodeView,
  junction: JunctionNodeView,
  c4: C4NodeView,
  note: NoteNodeView,
};

const edgeTypes: EdgeTypes = {
  message: MessageEdge,
  parallel: ParallelEdge,
};

const DEFAULT_SEED: Record<DiagramKind, NodeSeed> = {
  flowchart: { type: "shape", shape: "square" },
  state: { type: "state", stateType: "normal" },
  er: { type: "entity" },
  class: { type: "class" },
  sequence: { type: "participant", ptype: "participant" },
  architecture: { type: "service", icon: "server" },
  c4: { type: "c4", c4Shape: "system" },
};

export function CanvasView() {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const kind = useGraphStore((s) => s.kind);
  const onNodesChange = useGraphStore((s) => s.onNodesChange);
  const onEdgesChange = useGraphStore((s) => s.onEdgesChange);
  const onConnect = useGraphStore((s) => s.onConnect);
  const onNodeDragStop = useGraphStore((s) => s.onNodeDragStop);
  const addNode = useGraphStore((s) => s.addNode);
  const selectOnly = useGraphStore((s) => s.selectOnly);
  const { screenToFlowPosition } = useReactFlow();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const connect = useKeyboardConnect();
  const unsupported = useGraphStore((s) => s.unsupported);
  const code = useGraphStore((s) => s.code);
  const t = useT();
  /** True when the pointer moved the viewport since the last mousedown —
   * used to not open the context menu after a right-button pan. */
  const panMovedRef = useRef(false);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      const raw = e.dataTransfer.getData("application/x-graph-node");
      if (!raw) return;
      e.preventDefault();
      addNode(
        JSON.parse(raw) as NodeSeed,
        screenToFlowPosition({ x: e.clientX, y: e.clientY }),
      );
    },
    [addNode, screenToFlowPosition],
  );

  // Mark the pending connection source so it is visible, not just announced.
  const flowNodes = useMemo(
    () =>
      connect.source
        ? nodes.map((n) =>
            n.id === connect.source
              ? { ...n, className: `${n.className ?? ""} connect-source`.trim() }
              : n,
          )
        : nodes,
    [nodes, connect.source],
  );

  if (unsupported) {
    // Valid Mermaid we cannot edit visually. Render it rather than refusing
    // the file; the code panel stays fully editable.
    return (
      <main className="canvas-wrap read-only" aria-label={t("canvas.label")}>
        <div className="read-only-banner" role="status">
          <strong>{t("unsupported.title", { type: unsupported })}</strong>
          <span>{t("unsupported.body")}</span>
        </div>
        <MermaidPreview code={code} className="read-only-preview" />
      </main>
    );
  }

  return (
    <main
      className="canvas-wrap"
      aria-label={t("canvas.label")}
      onMouseDownCapture={() => (panMovedRef.current = false)}
    >
      <MarkerDefs />
      <ReactFlow<AnyNode, FlowEdge>
        nodes={flowNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={(_, node) => onNodeDragStop(node)}
        onDrop={onDrop}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).classList.contains("react-flow__pane")) {
            addNode(DEFAULT_SEED[kind], screenToFlowPosition({ x: e.clientX, y: e.clientY }));
          }
        }}
        onEdgeDoubleClick={(_, edge) => {
          void edge;
          requestAnimationFrame(() => document.getElementById("inspector-label")?.focus());
        }}
        onNodeDoubleClick={(_, node) => {
          if (node.type === "shape") return; // shape nodes edit inline
          requestAnimationFrame(() => document.getElementById("inspector-label")?.focus());
        }}
        onNodeContextMenu={(e, node) => {
          e.preventDefault();
          // Right-clicking a node that is part of a multi-selection acts on
          // the whole selection, like draw.io.
          const selectedCount = nodes.filter((n) => n.selected).length;
          if (node.selected && selectedCount > 1) {
            setMenu({ x: e.clientX, y: e.clientY, target: "selection" });
            return;
          }
          selectOnly(node.id, "node");
          setMenu({ x: e.clientX, y: e.clientY, target: "node", id: node.id });
        }}
        onSelectionContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY, target: "selection" });
        }}
        onEdgeContextMenu={(e, edge) => {
          e.preventDefault();
          selectOnly(edge.id, "edge");
          setMenu({ x: e.clientX, y: e.clientY, target: "edge", id: edge.id });
        }}
        onPaneContextMenu={(e) => {
          e.preventDefault();
          if (panMovedRef.current) return; // it was a right-button pan
          setMenu({
            x: (e as React.MouseEvent).clientX,
            y: (e as React.MouseEvent).clientY,
            target: "pane",
          });
        }}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        panOnDrag={[1, 2]}
        onMove={() => (panMovedRef.current = true)}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={38}
        snapToGrid
        snapGrid={[12, 12]}
        fitView
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={["Delete", "Backspace"]}
      >
        <Background gap={18} />
        {kind === "sequence" && <SequenceOverlay />}
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
      {/* How to drive the canvas without a pointer. Visible to screen
          readers only; sighted users have the palette and drag handles. */}
      <p className="visually-hidden">{t("canvas.keyboardHelp")}</p>
      <p className="visually-hidden" role="status" aria-atomic="true">
        {connect.message}
      </p>
    </main>
  );
}
