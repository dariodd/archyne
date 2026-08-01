import { create } from "zustand";
import {
  applyNodeChanges,
  applyEdgeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import type {
  AnyNode,
  ArchDir,
  SeqItem,
  C4Node,
  ClassDefs,
  ClassNode,
  DiagramKind,
  Direction,
  EntityNode,
  FlowEdge,
  FlowEdgeData,
  GroupNode,
  JunctionNode,
  NodeSeed,
  NoteNode,
  ParticipantNode,
  ServiceNode,
  ShapeNode,
  StateNode,
} from "./model/types";
import { estimateSize, isGroup } from "./model/types";
import {
  defaultEdgeData,
  parseDiagram,
  presentEdge,
  serializeDiagram,
  UnsupportedDiagramError,
} from "./model/diagram";
import { patchPositions, readPositions, type PositionMap } from "./model/positions";
import { removeSeqItemAt } from "./model/kinds/sequence";
import { SEQ_SPACING, SEQ_TOP } from "./seqLayout";
import { autoLayout } from "./layout/autoLayout";
import { useIconPrefs } from "./iconPrefs";
import { EMBEDDED, loadWorkspace, touchActive, useWorkspace, writeDocCode } from "./workspace";

/** Smallest a group may be, whether dragged or typed. */
export const GROUP_MIN = { width: 140, height: 100 };

export const SAMPLE = `flowchart TD
  start(["Start"])
  input[/"User request"/]
  check{"Valid?"}
  work["Process request"]
  err["Show error"]
  db[("Database")]
  done(["Done"])

  start --> input
  input --> check
  check -->|"yes"| work
  check -->|"no"| err
  work --> db
  db --> done
  err --> done
`;

export const NEW_DIAGRAM: Record<DiagramKind, string> = {
  flowchart: 'flowchart TD\n  a["Start"] --> b["Next step"]\n',
  state: "stateDiagram-v2\n  [*] --> Idle\n  Idle --> Working : start\n  Working --> [*]\n",
  er: 'erDiagram\n  CUSTOMER {\n    string name PK\n  }\n  CUSTOMER ||--o{ ORDER : "places"\n',
  class:
    "classDiagram\n  class Animal {\n    +int age\n    +makeSound() void\n  }\n  Animal <|-- Dog\n",
  sequence:
    "sequenceDiagram\n  actor U as User\n  participant S as Server\n  U->>S: request\n  S-->>U: response\n",
  architecture:
    "architecture-beta\n  group vpc(cloud)[VPC]\n  service web(internet)[Web] in vpc\n  service db(database)[Database] in vpc\n\n  web:R --> L:db\n",
  c4: 'C4Context\n  title System Context\n  Person(user, "User")\n  System(app, "Application")\n\n  Rel(user, app, "Uses")\n',
};

/**
 * Mark edges that share a node pair (and, for architecture, the same
 * handles) so the canvas can fan them out instead of overlapping them.
 */
function annotateParallel(kind: DiagramKind, edges: FlowEdge[]): FlowEdge[] {
  if (kind === "sequence") return edges; // messages are stacked by order
  const keyOf = (e: FlowEdge) =>
    `${[e.source, e.target].sort().join("~")}|${e.sourceHandle ?? ""}|${e.targetHandle ?? ""}`;
  const groups = new Map<string, string[]>();
  for (const e of edges) {
    const key = keyOf(e);
    groups.set(key, [...(groups.get(key) ?? []), e.id]);
  }
  return edges.map((e) => {
    const g = groups.get(keyOf(e))!;
    if (g.length < 2) {
      // No longer parallel (siblings deleted): strip the stale lane info
      // so the edge snaps back to a plain centered path.
      if (e.type !== "parallel" && !e.data?.par) return e;
      const data = { ...(e.data ?? { label: "" }) };
      delete data.par;
      return { ...e, type: "smoothstep", data };
    }
    return {
      ...e,
      type: "parallel",
      data: {
        ...(e.data ?? { label: "" }),
        // s normalizes the perpendicular offset for opposite-direction
        // edges so they land on distinct lanes, not the same one.
        par: { i: g.indexOf(e.id), n: g.length, s: e.source <= e.target ? 1 : -1 },
      },
    };
  });
}

/** Assign stored/cascade positions to bare nodes. */
function placeNodes(nodes: AnyNode[], positions: PositionMap, kind: DiagramKind): AnyNode[] {
  if (kind === "sequence") {
    // Participants live on a single top row; x order = participant order.
    let col = 0;
    return nodes.map((n) => {
      const p = positions[n.id];
      const x = p?.x ?? col * 220;
      col++;
      return { ...n, position: { x, y: 0 } };
    });
  }
  const placed = Object.values(positions);
  let cascadeX = placed.length > 0 ? Math.max(...placed.map((p) => p.x)) + 260 : 0;
  let cascadeY = 0;
  return nodes.map((n) => {
    const p = positions[n.id];
    if (!p) {
      const pos = { x: cascadeX, y: cascadeY };
      cascadeY += 110;
      if (cascadeY > 660) {
        cascadeY = 0;
        cascadeX += 260;
      }
      return { ...n, position: pos };
    }
    return {
      ...n,
      position: { x: p.x, y: p.y },
      ...(isGroup(n) && p.w !== undefined
        ? { style: { ...n.style, width: p.w, height: p.h } }
        : {}),
    };
  });
}

export interface GraphState {
  code: string;
  kind: DiagramKind;
  nodes: AnyNode[];
  edges: FlowEdge[];
  direction: Direction;
  classDefs: ClassDefs;
  parseError: string | null;
  warning: string | null;
  /**
   * Set when the code is valid Mermaid of a family we cannot edit visually.
   * The canvas swaps to a read-only render rather than refusing the file.
   */
  unsupported: string | null;
  canUndo: boolean;
  canRedo: boolean;
  /** False until the first diagram has been parsed and laid out. */
  booted: boolean;
  c4Flavor: string;
  title: string;
  accTitle: string;
  accDescr: string;
  /** Sequence: ordered statement stream (messages reference edge ids). */
  seqItems: SeqItem[];

  setCodeFromEditor: (code: string) => void;
  applyCode: (
    code: string,
    opts?: { forceLayout?: boolean; record?: boolean },
  ) => Promise<void>;
  /**
   * Resolves once the restored code has been re-parsed. The UI ignores the
   * promise, but anything sequencing edits (tests, the embed bridge) needs a
   * way to wait rather than guess.
   */
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  copySelection: () => void;
  pasteClipboard: () => void;
  onNodesChange: (changes: NodeChange<AnyNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<FlowEdge>[]) => void;
  onConnect: (conn: Connection) => void;
  onNodeDragStop: (dragged?: AnyNode) => void;
  setNodeSize: (id: string, w: number, h: number, x: number, y: number) => void;
  /**
   * Resize a group to an exact size and persist it.
   *
   * `setNodeSize` is the live half of a drag; this is the whole gesture in
   * one call, for the inspector's width and height fields — the way to
   * resize a group without dragging a handle (WCAG 2.5.7).
   */
  resizeNode: (id: string, w: number, h: number) => void;
  addNode: (seed: NodeSeed, position: { x: number; y: number }) => void;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  updateEdgeData: (id: string, patch: Partial<FlowEdgeData>) => void;
  setDirection: (d: Direction) => void;
  setDiagramMeta: (patch: { title?: string; accTitle?: string; accDescr?: string }) => void;
  runAutoLayout: () => Promise<void>;
  newDiagram: (kind: DiagramKind) => void;
  /**
   * Stash the current undo history under `outgoingId` and adopt the one
   * belonging to `incomingId`. Called when the workspace switches documents.
   */
  swapHistory: (outgoingId: string, incomingId: string) => void;
  groupSelection: () => void;
  ungroupSelection: () => void;
  moveMessage: (id: string, delta: number) => void;
  updateSeqItem: (index: number, item: SeqItem) => void;
  removeSeqItem: (index: number) => void;
  selectOnly: (id: string, target: "node" | "edge") => void;
  selectAll: () => void;
  /** Move every selected node by a pixel delta (keyboard nudging). */
  nudgeSelection: (dx: number, dy: number) => void;
  deleteSelection: () => void;
  /** Re-derive edge presentation (colors) — used on theme change. */
  refreshEdges: () => void;
  deleteElement: (id: string, target: "node" | "edge") => void;
  duplicateNode: (id: string) => void;
  removeFromGroup: (id: string) => void;
}

let parseTimer: ReturnType<typeof setTimeout> | undefined;

/** Write the active document's source, and note that it changed. */
function persist(code: string) {
  if (EMBEDDED) return;
  const { activeId } = useWorkspace.getState();
  if (!activeId) return;
  writeDocCode(activeId, code);
  touchActive();
}

export function loadInitialCode(): string {
  let fromUrl: string | null = null;
  try {
    // ?code=<urlencoded mermaid> loads a diagram from the URL (shareable links).
    fromUrl = new URLSearchParams(location.search).get("code");
  } catch {
    // no URL access (tests)
  }

  // The workspace is built either way, so that a shared link opens into a
  // real document the user can then keep, rename or save.
  const { state, code } = loadWorkspace(SAMPLE);
  useWorkspace.setState(state);

  if (fromUrl) {
    persist(fromUrl);
    return fromUrl;
  }
  return code;
}

export const useGraphStore = create<GraphState>((set, get) => {
  /**
   * Undo/redo: because the mermaid code is the single source of truth, the
   * history is just a stack of code snapshots replayed through applyCode.
   */
  let past: string[] = [];
  let future: string[] = [];
  let lastEditorEdit = 0;
  const syncHistoryFlags = () => set({ canUndo: past.length > 0, canRedo: future.length > 0 });

  /**
   * One history per document, kept in memory only.
   *
   * With a single shared stack, undoing after switching documents would
   * replay a snapshot belonging to a different diagram over the one on
   * screen — silent, and destructive. Histories are deliberately not
   * persisted: a stack of full-document snapshots is large, and nobody
   * expects undo to reach across a reload.
   */
  const histories = new Map<string, { past: string[]; future: string[] }>();

  const record = (oldCode: string) => {
    if (!oldCode || past[past.length - 1] === oldCode) return;
    past.push(oldCode);
    if (past.length > 100) past.shift();
    future.length = 0;
    syncHistoryFlags();
  };

  /** Clipboard for copy/paste, kept out of react state. */
  let clipboard: { nodes: AnyNode[]; edges: FlowEdge[] } | null = null;

  const collectPositions = (): PositionMap => {
    const positions: PositionMap = {};
    for (const n of get().nodes) {
      positions[n.id] = {
        x: n.position.x,
        y: n.position.y,
        ...(isGroup(n)
          ? {
              w: Number(n.style?.width ?? n.measured?.width ?? 320),
              h: Number(n.style?.height ?? n.measured?.height ?? 220),
            }
          : {}),
      };
    }
    return positions;
  };

  /** Rebuild the mermaid text from the canvas (structural change). */
  const regenerate = () => {
    // A read-only diagram has no parsed graph behind it. Serializing from the
    // empty node list would silently replace the user's gantt (or pie, or
    // mindmap) with a blank diagram of whatever kind was loaded before it.
    // Guarding here covers every edit path at once.
    if (get().unsupported) return;
    record(get().code);
    const {
      kind,
      nodes,
      edges,
      direction,
      classDefs,
      c4Flavor,
      title,
      accTitle,
      accDescr,
      seqItems,
    } = get();
    const code = serializeDiagram({
      kind,
      direction,
      nodes,
      edges,
      classDefs,
      c4Flavor,
      title,
      accTitle,
      accDescr,
      items: seqItems,
      positions: collectPositions(),
    });
    set({ code, parseError: null });
    persist(code);
  };

  /** Only positions changed (drag) — leave the user's text intact. */
  const repatchPositions = () => {
    record(get().code);
    const code = patchPositions(get().code, collectPositions());
    set({ code });
    persist(code);
  };

  const freshId = (prefix: string): string => {
    let max = 0;
    const re = new RegExp(`^${prefix}(\\d+)$`);
    for (const n of get().nodes) {
      const m = n.id.match(re);
      if (m) max = Math.max(max, Number(m[1]));
    }
    return `${prefix}${max + 1}`;
  };

  return {
    code: "",
    kind: "flowchart",
    nodes: [],
    edges: [],
    direction: "TD",
    classDefs: {},
    parseError: null,
    warning: null,
    unsupported: null,
    canUndo: false,
    canRedo: false,
    booted: false,
    c4Flavor: "C4Context",
    title: "",
    accTitle: "",
    accDescr: "",
    seqItems: [],

    setCodeFromEditor: (code) => {
      // Group typing bursts into one history entry.
      const now = Date.now();
      if (now - lastEditorEdit > 900) record(get().code);
      lastEditorEdit = now;
      set({ code });
      persist(code);
      clearTimeout(parseTimer);
      parseTimer = setTimeout(() => void get().applyCode(code), 400);
    },

    applyCode: async (code, opts) => {
      if (opts?.record) record(get().code);
      try {
        const parsed = await parseDiagram(code);
        let positions = opts?.forceLayout ? null : readPositions(code);
        let nodes = placeNodes(parsed.nodes, positions ?? {}, parsed.kind);
        if (!positions && parsed.kind !== "sequence") {
          positions = await autoLayout(nodes, parsed.edges, parsed.direction);
          nodes = placeNodes(parsed.nodes, positions, parsed.kind);
        }
        set({
          kind: parsed.kind,
          nodes,
          edges: annotateParallel(parsed.kind, parsed.edges),
          direction: parsed.direction,
          classDefs: parsed.classDefs,
          warning: parsed.warning ?? null,
          c4Flavor: parsed.c4Flavor ?? "C4Context",
          title: parsed.title ?? "",
          accTitle: parsed.accTitle ?? "",
          accDescr: parsed.accDescr ?? "",
          seqItems: parsed.items ?? [],
          parseError: null,
          unsupported: null,
          code,
        });
        persist(code);
      } catch (err) {
        if (err instanceof UnsupportedDiagramError) {
          // Not an error from the user's point of view: the file is fine, we
          // just can't offer visual editing for it. Drop the stale graph so
          // the canvas can't be edited into the wrong diagram, and keep the
          // code so it still renders, saves and round-trips untouched.
          set({
            unsupported: err.diagramType,
            nodes: [],
            edges: [],
            seqItems: [],
            parseError: null,
            warning: null,
            code,
          });
          persist(code);
        } else {
          set({ parseError: err instanceof Error ? err.message : String(err), code });
        }
      } finally {
        if (!get().booted) set({ booted: true });
      }
    },

    onNodesChange: (changes) => {
      if (get().kind === "sequence") {
        // Participants stay on the top row — only horizontal dragging.
        for (const c of changes) {
          if (c.type === "position" && c.position) c.position.y = 0;
        }
      }
      const removed = new Set(changes.filter((c) => c.type === "remove").map((c) => c.id));
      let nodes = applyNodeChanges(changes, get().nodes);
      if (removed.size > 0) {
        nodes = nodes.map((n) =>
          n.parentId && removed.has(n.parentId)
            ? { ...n, parentId: undefined, extent: undefined }
            : n,
        );
        const ids = new Set(nodes.map((n) => n.id));
        const edges = annotateParallel(
          get().kind,
          get().edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
        );
        set({ nodes, edges });
        regenerate();
      } else {
        set({ nodes });
      }
    },

    onEdgesChange: (changes) => {
      const hadRemove = changes.some((c) => c.type === "remove");
      let edges = applyEdgeChanges(changes, get().edges);
      if (hadRemove) edges = annotateParallel(get().kind, edges);
      const ids = new Set(edges.map((e) => e.id));
      set({
        edges,
        ...(hadRemove
          ? {
              seqItems: get().seqItems.filter(
                (it) => it.kind !== "message" || ids.has(it.edgeId),
              ),
            }
          : {}),
      });
      if (hadRemove) regenerate();
    },

    onConnect: (conn) => {
      if (!conn.source || !conn.target) return;
      const kind = get().kind;
      if (
        kind === "architecture" &&
        get().edges.some((e) => e.source === conn.source && e.target === conn.target)
      ) {
        set({
          warning: `mermaid's architecture renderer allows only one connection from ${conn.source} to ${conn.target} — edit the existing edge instead.`,
        });
        return;
      }
      const data = defaultEdgeData(kind);
      if (kind === "architecture" && data.arch) {
        data.arch.lhsDir = (conn.sourceHandle as ArchDir) || "R";
        data.arch.rhsDir = (conn.targetHandle as ArchDir) || "L";
      }
      const edge = presentEdge(kind, {
        id: `e${get().edges.length}_${conn.source}_${conn.target}_${Date.now()}`,
        source: conn.source,
        target: conn.target,
        ...(kind === "architecture"
          ? { sourceHandle: data.arch!.lhsDir, targetHandle: data.arch!.rhsDir }
          : {}),
        data,
      });
      set({
        edges: annotateParallel(kind, [...get().edges, edge]),
        ...(kind === "sequence"
          ? { seqItems: [...get().seqItems, { kind: "message" as const, edgeId: edge.id }] }
          : {}),
      });
      regenerate();
    },

    onNodeDragStop: (dragged) => {
      // Draw.io-style reparenting: dropping a node inside a group joins it,
      // dropping it outside leaves it.
      const { kind, nodes } = get();
      if (dragged && kind !== "sequence") {
        const byId = new Map(nodes.map((n) => [n.id, n]));
        const absOf = (n: AnyNode): { x: number; y: number } => {
          let x = n.position.x;
          let y = n.position.y;
          let p = n.parentId;
          while (p) {
            const pn = byId.get(p);
            if (!pn) break;
            x += pn.position.x;
            y += pn.position.y;
            p = pn.parentId;
          }
          return { x, y };
        };
        const node = byId.get(dragged.id);
        if (node && !isGroup(node)) {
          const size = estimateSize(node);
          const w = node.measured?.width ?? size.width;
          const h = node.measured?.height ?? size.height;
          const abs = { ...absOf(node) };
          const cx = abs.x + w / 2;
          const cy = abs.y + h / 2;
          let target: AnyNode | undefined;
          let targetDepth = -1;
          for (const g of nodes) {
            if (!isGroup(g)) continue;
            const ga = absOf(g);
            const gw = Number(g.style?.width ?? g.measured?.width ?? 320);
            const gh = Number(g.style?.height ?? g.measured?.height ?? 220);
            if (cx >= ga.x && cx <= ga.x + gw && cy >= ga.y && cy <= ga.y + gh) {
              let depth = 0;
              let p = g.parentId;
              while (p) {
                depth++;
                p = byId.get(p)?.parentId;
              }
              if (depth > targetDepth) {
                targetDepth = depth;
                target = g;
              }
            }
          }
          if ((target?.id ?? undefined) !== node.parentId) {
            const base = target ? absOf(target) : { x: 0, y: 0 };
            const updated: AnyNode = {
              ...node,
              parentId: target?.id,
              extent: undefined,
              position: { x: abs.x - base.x, y: abs.y - base.y },
            };
            // Keep parents before children in the array.
            set({ nodes: [...nodes.filter((n) => n.id !== node.id), updated] });
            regenerate();
            return;
          }
        }
      }
      repatchPositions();
    },

    setNodeSize: (id, w, h, x, y) => {
      set({
        nodes: get().nodes.map((n) =>
          n.id === id
            ? { ...n, position: { x, y }, style: { ...n.style, width: w, height: h } }
            : n,
        ),
      });
    },

    resizeNode: (id, w, h) => {
      const node = get().nodes.find((n) => n.id === id);
      if (!node) return;
      get().setNodeSize(
        id,
        Math.max(GROUP_MIN.width, Math.round(w)),
        Math.max(GROUP_MIN.height, Math.round(h)),
        node.position.x,
        node.position.y,
      );
      repatchPositions();
    },

    addNode: (seed, position) => {
      const { direction } = get();
      if (seed.type === "seqnote" || seed.type === "seqblock") {
        if (get().kind !== "sequence") return;
        const items = [...get().seqItems];
        const row = Math.max(
          0,
          Math.min(items.length, Math.round((position.y - SEQ_TOP) / SEQ_SPACING)),
        );
        if (seed.type === "seqnote") {
          let nearest = "";
          let best = Infinity;
          for (const n of get().nodes) {
            if (n.type !== "participant") continue;
            const w = n.measured?.width ?? estimateSize(n).width;
            const d = Math.abs(n.position.x + w / 2 - position.x);
            if (d < best) {
              best = d;
              nearest = n.id;
            }
          }
          if (!nearest) return;
          items.splice(row, 0, {
            kind: "note",
            placement: "over",
            a: nearest,
            text: "Note",
          });
        } else {
          // Wrap the message at the drop row, if any; otherwise insert empty.
          const wrapEnd = items[row]?.kind === "message" ? row + 1 : row;
          items.splice(wrapEnd, 0, { kind: "end" });
          if (seed.op === "alt") {
            items.splice(wrapEnd, 0, { kind: "divider", op: "else", label: "" });
          }
          items.splice(row, 0, { kind: "block", op: seed.op, label: "condition" });
        }
        set({ seqItems: items });
        regenerate();
        return;
      }
      let node: AnyNode;
      switch (seed.type) {
        case "shape":
          node = {
            id: freshId("n"),
            type: "shape",
            position,
            data: { label: "New node", shape: seed.shape, direction },
          } satisfies ShapeNode;
          break;
        case "state": {
          const prefix = seed.stateType === "normal" ? "s" : seed.stateType;
          node = {
            id: freshId(prefix),
            type: "state",
            position,
            data: {
              label: seed.stateType === "normal" ? "NewState" : "",
              stateType: seed.stateType,
              direction,
            },
          } satisfies StateNode;
          break;
        }
        case "entity":
          node = {
            id: freshId("ENTITY"),
            type: "entity",
            position,
            data: {
              label: freshId("ENTITY"),
              attributes: [{ type: "string", name: "id", keys: ["PK"], comment: "" }],
              direction,
            },
          } satisfies EntityNode;
          break;
        case "class":
          node = {
            id: freshId("Class"),
            type: "class",
            position,
            data: {
              label: freshId("Class"),
              members: [],
              methods: [],
              annotations: [],
              direction,
            },
          } satisfies ClassNode;
          break;
        case "participant": {
          const id = freshId(seed.ptype === "actor" ? "actor" : "p");
          node = {
            id,
            type: "participant",
            position: { x: position.x, y: 0 },
            data: { label: id, ptype: seed.ptype, direction },
          } satisfies ParticipantNode;
          break;
        }
        case "service": {
          const id = freshId("svc");
          useIconPrefs.getState().recordRecent(seed.icon);
          node = {
            id,
            type: "service",
            position,
            data: { label: id, icon: seed.icon, direction },
          } satisfies ServiceNode;
          break;
        }
        case "junction":
          node = {
            id: freshId("j"),
            type: "junction",
            position,
            data: {},
          } satisfies JunctionNode;
          break;
        case "c4": {
          const id = freshId("el");
          node = {
            id,
            type: "c4",
            position,
            data: { label: id, c4Shape: seed.c4Shape, descr: "", direction },
          } satisfies C4Node;
          break;
        }
        case "note":
          node = {
            id: freshId("note"),
            type: "note",
            position,
            data: { text: "Note", direction },
          } satisfies NoteNode;
          break;
        case "group": {
          const kind = get().kind;
          const gid = freshId("g");
          node = {
            id: gid,
            type: "group",
            position,
            data: {
              label: gid,
              subgraphId: gid,
              ...(kind === "architecture" ? { icon: "cloud" } : {}),
              ...(kind === "c4" ? { boundaryType: "SYSTEM" } : {}),
            },
            style: { width: 340, height: 240 },
          } satisfies GroupNode;
          break;
        }
      }
      if (seed.type === "entity" || seed.type === "class") {
        node = { ...node, data: { ...node.data, label: node.id } } as AnyNode;
      }
      node.selected = true;
      set({ nodes: [...get().nodes.map((n) => ({ ...n, selected: false })), node] });
      regenerate();
    },

    updateNodeData: (id, patch) => {
      set({
        nodes: get().nodes.map((n) =>
          n.id === id ? ({ ...n, data: { ...n.data, ...patch } } as AnyNode) : n,
        ),
      });
      regenerate();
    },

    updateEdgeData: (id, patch) => {
      const kind = get().kind;
      const mapped = get().edges.map((e) => {
        if (e.id !== id || !e.data) return e;
        const data: FlowEdgeData = {
          ...e.data,
          ...patch,
          ...(patch.er ? { er: { ...e.data.er!, ...patch.er } } : {}),
          ...(patch.cls ? { cls: { ...e.data.cls!, ...patch.cls } } : {}),
          ...(patch.arch ? { arch: { ...e.data.arch!, ...patch.arch } } : {}),
        };
        const next = { ...e, data };
        if (data.arch) {
          next.sourceHandle = data.arch.lhsDir;
          next.targetHandle = data.arch.rhsDir;
        }
        return presentEdge(kind, next);
      });
      // presentEdge resets the edge type — re-derive parallel fan-out.
      set({ edges: annotateParallel(kind, mapped) });
      regenerate();
    },

    setDiagramMeta: (patch) => {
      set(patch);
      regenerate();
    },

    setDirection: (direction) => {
      set({
        direction,
        nodes: get().nodes.map((n) =>
          isGroup(n) ? n : ({ ...n, data: { ...n.data, direction } } as AnyNode),
        ),
      });
      regenerate();
    },

    runAutoLayout: async () => {
      const { nodes, edges, direction, kind } = get();
      if (kind === "sequence") {
        set({
          nodes: nodes.map((n, i) => ({ ...n, position: { x: i * 220, y: 0 } })),
        });
        repatchPositions();
        return;
      }
      const positions = await autoLayout(nodes, edges, direction);
      set({
        nodes: nodes.map((n) => {
          const p = positions[n.id];
          if (!p) return n;
          return {
            ...n,
            position: { x: p.x, y: p.y },
            ...(isGroup(n) && p.w !== undefined
              ? { style: { ...n.style, width: p.w, height: p.h } }
              : {}),
          };
        }),
      });
      repatchPositions();
    },

    swapHistory: (outgoingId, incomingId) => {
      if (outgoingId) histories.set(outgoingId, { past, future });
      const next = histories.get(incomingId) ?? { past: [], future: [] };
      past = next.past;
      future = next.future;
      syncHistoryFlags();
    },

    newDiagram: (kind) => {
      void get().applyCode(NEW_DIAGRAM[kind], { forceLayout: true, record: true });
    },

    undo: async () => {
      if (past.length === 0) return;
      future.push(get().code);
      const prev = past.pop()!;
      syncHistoryFlags();
      await get().applyCode(prev);
    },

    redo: async () => {
      if (future.length === 0) return;
      past.push(get().code);
      const next = future.pop()!;
      syncHistoryFlags();
      await get().applyCode(next);
    },

    copySelection: () => {
      const nodes = get().nodes.filter((n) => n.selected && !isGroup(n));
      if (nodes.length === 0) return;
      const ids = new Set(nodes.map((n) => n.id));
      const edges = get().edges.filter((e) => ids.has(e.source) && ids.has(e.target));
      clipboard = {
        nodes: structuredClone(nodes),
        edges: structuredClone(edges),
      };
    },

    pasteClipboard: () => {
      if (!clipboard || clipboard.nodes.length === 0) return;
      const { kind } = get();
      const taken = new Set(get().nodes.map((n) => n.id));
      const idMap = new Map<string, string>();
      const uniquify = (id: string) => {
        let i = 2;
        let candidate = `${id}_${i}`;
        while (taken.has(candidate)) candidate = `${id}_${++i}`;
        taken.add(candidate);
        return candidate;
      };
      const newNodes = clipboard.nodes.map((n) => {
        const id = uniquify(n.id);
        idMap.set(n.id, id);
        return {
          ...structuredClone(n),
          id,
          parentId: undefined,
          extent: undefined,
          selected: true,
          position: {
            x: n.position.x + 36,
            y: kind === "sequence" ? 0 : n.position.y + 36,
          },
        } as AnyNode;
      });
      const newEdges = clipboard.edges.map((e, i) =>
        presentEdge(kind, {
          ...structuredClone(e),
          id: `e${Date.now()}_${i}`,
          source: idMap.get(e.source)!,
          target: idMap.get(e.target)!,
        }),
      );
      set({
        nodes: [...get().nodes.map((n) => ({ ...n, selected: false })), ...newNodes],
        edges: annotateParallel(kind, [...get().edges, ...newEdges]),
      });
      regenerate();
    },

    groupSelection: () => {
      const { kind, nodes } = get();
      if (
        kind !== "flowchart" &&
        kind !== "state" &&
        kind !== "architecture" &&
        kind !== "c4" &&
        kind !== "class"
      )
        return;
      const selected = nodes.filter((n) => n.selected && !isGroup(n));
      if (selected.length === 0) return;
      const parent = selected[0].parentId;
      if (!selected.every((n) => n.parentId === parent)) return;

      const PAD = 28;
      const TITLE = 34;
      const boxes = selected.map((n) => {
        const s = estimateSize(n);
        return {
          x1: n.position.x,
          y1: n.position.y,
          x2: n.position.x + (n.measured?.width ?? s.width),
          y2: n.position.y + (n.measured?.height ?? s.height),
        };
      });
      const x1 = Math.min(...boxes.map((b) => b.x1)) - PAD;
      const y1 = Math.min(...boxes.map((b) => b.y1)) - PAD - TITLE;
      const x2 = Math.max(...boxes.map((b) => b.x2)) + PAD;
      const y2 = Math.max(...boxes.map((b) => b.y2)) + PAD;

      const gid = freshId("g");
      const group: GroupNode = {
        id: gid,
        type: "group",
        position: { x: x1, y: y1 },
        data: {
          label: gid,
          subgraphId: gid,
          ...(kind === "architecture" ? { icon: "cloud" } : {}),
          ...(kind === "c4" ? { boundaryType: "SYSTEM" } : {}),
        },
        style: { width: x2 - x1, height: y2 - y1 },
        ...(parent ? { parentId: parent } : {}),
      };
      const selectedIds = new Set(selected.map((n) => n.id));
      const rest = nodes.map((n) =>
        selectedIds.has(n.id)
          ? ({
              ...n,
              parentId: gid,
              position: { x: n.position.x - x1, y: n.position.y - y1 },
              selected: false,
            } as AnyNode)
          : n,
      );
      // Parents must precede children: insert the group before its members.
      const firstChild = rest.findIndex((n) => selectedIds.has(n.id));
      rest.splice(firstChild, 0, { ...group, selected: true });
      set({ nodes: rest });
      regenerate();
    },

    updateSeqItem: (index, item) => {
      const items = [...get().seqItems];
      if (!items[index]) return;
      items[index] = item;
      set({ seqItems: items });
      regenerate();
    },

    removeSeqItem: (index) => {
      set({ seqItems: removeSeqItemAt(get().seqItems, index) });
      regenerate();
    },

    selectOnly: (id, target) => {
      set({
        nodes: get().nodes.map((n) => ({ ...n, selected: target === "node" && n.id === id })),
        edges: get().edges.map((e) => ({ ...e, selected: target === "edge" && e.id === id })),
      });
    },

    selectAll: () => {
      set({
        nodes: get().nodes.map((n) => ({ ...n, selected: true })),
        edges: get().edges.map((e) => ({ ...e, selected: true })),
      });
    },

    nudgeSelection: (dx, dy) => {
      const nodes = get().nodes;
      if (!nodes.some((n) => n.selected)) return;
      set({
        nodes: nodes.map((n) =>
          n.selected ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } } : n,
        ),
      });
      // Position-only change: rewrite the positions comment and leave the
      // rest of the user's mermaid text alone, exactly as a drag does.
      repatchPositions();
    },

    refreshEdges: () => {
      set({
        edges: annotateParallel(
          get().kind,
          get().edges.map((e) => presentEdge(get().kind, e)),
        ),
      });
    },

    deleteSelection: () => {
      const nodeRemovals = get()
        .nodes.filter((n) => n.selected)
        .map((n) => ({ type: "remove" as const, id: n.id }));
      const edgeRemovals = get()
        .edges.filter((e) => e.selected)
        .map((e) => ({ type: "remove" as const, id: e.id }));
      if (edgeRemovals.length) get().onEdgesChange(edgeRemovals);
      if (nodeRemovals.length) get().onNodesChange(nodeRemovals);
    },

    deleteElement: (id, target) => {
      if (target === "node") {
        get().onNodesChange([{ type: "remove", id }]);
      } else {
        get().onEdgesChange([{ type: "remove", id }]);
      }
    },

    duplicateNode: (id) => {
      const { nodes, kind } = get();
      const node = nodes.find((n) => n.id === id);
      if (!node || isGroup(node)) return;
      const taken = new Set(nodes.map((n) => n.id));
      let i = 2;
      let newId = `${id}_${i}`;
      while (taken.has(newId)) newId = `${id}_${++i}`;
      const copy: AnyNode = {
        ...structuredClone(node),
        id: newId,
        selected: true,
        position: {
          x: node.position.x + 36,
          y: kind === "sequence" ? 0 : node.position.y + 36,
        },
      };
      set({ nodes: [...nodes.map((n) => ({ ...n, selected: false })), copy] });
      regenerate();
    },

    removeFromGroup: (id) => {
      const { nodes } = get();
      const node = nodes.find((n) => n.id === id);
      if (!node?.parentId) return;
      const byId = new Map(nodes.map((n) => [n.id, n]));
      let x = node.position.x;
      let y = node.position.y;
      let p: string | undefined = node.parentId;
      while (p) {
        const pn = byId.get(p);
        if (!pn) break;
        x += pn.position.x;
        y += pn.position.y;
        p = pn.parentId;
      }
      set({
        nodes: nodes.map((n) =>
          n.id === id
            ? ({ ...n, parentId: undefined, extent: undefined, position: { x, y } } as AnyNode)
            : n,
        ),
      });
      regenerate();
    },

    moveMessage: (id, delta) => {
      const items = [...get().seqItems];
      const i = items.findIndex((it) => it.kind === "message" && it.edgeId === id);
      if (i < 0) return;
      const target = Math.max(0, Math.min(items.length - 1, i + delta));
      if (target === i) return;
      const [item] = items.splice(i, 1);
      items.splice(target, 0, item);
      set({ seqItems: items });
      regenerate();
    },

    ungroupSelection: () => {
      const { nodes, edges } = get();
      const group = nodes.find((n) => n.selected && isGroup(n));
      if (!group) return;
      const remaining = nodes
        .filter((n) => n.id !== group.id)
        .map((n) =>
          n.parentId === group.id
            ? ({
                ...n,
                parentId: group.parentId,
                extent: group.parentId ? ("parent" as const) : undefined,
                position: {
                  x: n.position.x + group.position.x,
                  y: n.position.y + group.position.y,
                },
              } as AnyNode)
            : n,
        );
      set({
        nodes: remaining,
        edges: edges.filter((e) => e.source !== group.id && e.target !== group.id),
      });
      regenerate();
    },
  };
});
