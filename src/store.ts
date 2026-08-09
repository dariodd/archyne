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
import {
  patchWaypoints,
  readWaypoints,
  waypointKeys,
  type Waypoint,
  type WaypointMap,
} from "./model/waypoints";
import {
  isPlain,
  patchEdgeStyles,
  readEdgeStyles,
  type EdgeStyle,
  type EdgeStyleMap,
} from "./model/edgeStyle";
import {
  isPlainNode,
  patchNodeStyles,
  readNodeStyles,
  type NodeStyle,
  type NodeStyleMap,
} from "./model/nodeStyle";
import {
  CUSTOM,
  iconName,
  patchIconLibrary,
  readIconLibrary,
  usedIcons,
  type IconLibrary,
} from "./model/iconLibrary";
import { sanitiseSvg } from "./model/svg";
import { setCarriedIcons } from "./icons";
import { useIconPack } from "./iconPack";
import { removeSeqItemAt } from "./model/kinds/sequence";
import { SEQ_SPACING, SEQ_TOP } from "./seqLayout";
import { autoLayout } from "./layout/autoLayout";
import { useIconPrefs } from "./iconPrefs";
import { EMBEDDED, loadWorkspace, touchActive, useWorkspace, writeDocCode } from "./workspace";
import type { Box } from "./guides";
import { carryWaypoints } from "./orthogonal";

/** Smallest a group may be, whether dragged or typed. */
export const GROUP_MIN = { width: 140, height: 100 };

/**
 * Smallest anything else may be. Well under any default size, because the
 * point of resizing a node is often to make it small — but not to zero,
 * which would leave nothing to grab hold of again.
 */
export const NODE_MIN = { width: 48, height: 28 };

/** The floor for one node: groups have their own, everything else shares. */
export function minSize(n: AnyNode): { width: number; height: number } {
  return isGroup(n) ? GROUP_MIN : NODE_MIN;
}

/** True when this node has been given a size, rather than taking its own. */
export function hasCustomSize(n: AnyNode): boolean {
  return !isGroup(n) && n.style?.width !== undefined;
}

export type AlignEdge = "left" | "centerX" | "right" | "top" | "middleY" | "bottom";

/**
 * A node's box in its parent's coordinates.
 *
 * The width can come from three places depending on how the node got here —
 * a typed group size, what the browser measured, or an estimate made before
 * anything was rendered — so it is resolved in one place rather than at each
 * call site.
 */
function boxOf(n: AnyNode): Box {
  const size = estimateSize(n);
  return {
    x: n.position.x,
    y: n.position.y,
    w: Number(n.style?.width ?? n.measured?.width ?? n.width ?? size.width),
    h: Number(n.style?.height ?? n.measured?.height ?? n.height ?? size.height),
  };
}

/**
 * Every node's box in canvas coordinates, with each group's offset folded in.
 *
 * React Flow stores a child's position relative to its parent, which is the
 * right thing for dragging a group and wrong for anything that compares two
 * nodes on screen. Resolved once for the whole graph rather than walking the
 * parent chain per node, since the callers ask about all of them at once.
 */
export function absoluteBoxes(nodes: AnyNode[]): Map<string, Box> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out = new Map<string, Box>();
  const resolve = (n: AnyNode, seen: Set<string>): Box => {
    const cached = out.get(n.id);
    if (cached) return cached;
    const box = boxOf(n);
    const parent = n.parentId ? byId.get(n.parentId) : undefined;
    // `seen` guards against a parent cycle. Parsing cannot produce one, but
    // this would hang rather than misbehave, which is the worse failure.
    if (parent && !seen.has(parent.id)) {
      const pb = resolve(parent, new Set(seen).add(n.id));
      box.x += pb.x;
      box.y += pb.y;
    }
    out.set(n.id, box);
    return box;
  };
  for (const n of nodes) resolve(n, new Set([n.id]));
  return out;
}

/**
 * The selected nodes, but only when they can be reasoned about together.
 *
 * React Flow keeps a child's position relative to its parent, so aligning a
 * top-level node against one inside a group would be comparing two different
 * coordinate systems and would move things somewhere nobody asked for. When
 * the selection spans parents there is no sensible answer, so there is no
 * answer: the commands are hidden rather than silently doing half the job.
 */
export function alignableSelection(nodes: AnyNode[]): AnyNode[] {
  const selected = nodes.filter((n) => n.selected);
  if (selected.length < 2) return [];
  const parent = selected[0].parentId;
  return selected.every((n) => n.parentId === parent) ? selected : [];
}

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
export function annotateParallel(kind: DiagramKind, edges: FlowEdge[]): FlowEdge[] {
  if (kind === "sequence") return edges; // messages are stacked by order
  const keyOf = (e: FlowEdge) =>
    `${[e.source, e.target].sort().join("~")}|${e.sourceHandle ?? ""}|${e.targetHandle ?? ""}`;
  const groups = new Map<string, string[]>();
  for (const e of edges) {
    const key = keyOf(e);
    groups.set(key, [...(groups.get(key) ?? []), e.id]);
  }
  return edges.map((e) => {
    // A hand-routed edge keeps its own route: bending one by hand is a more
    // specific instruction than "these two overlap, spread them apart". The
    // lane info goes with the fan-out, so it is dropped rather than left to
    // reappear if the corners are removed later.
    if (e.data?.points?.length) {
      if (e.type === "routed" && !e.data.par) return e;
      const data = { ...(e.data ?? { label: "" }) };
      delete data.par;
      return { ...e, type: "routed" as const, data };
    }
    const g = groups.get(keyOf(e))!;
    if (g.length < 2) {
      // No longer parallel (siblings deleted): strip the stale lane info
      // so the edge snaps back to a plain centered path.
      if (e.type !== "parallel" && !e.data?.par) return e;
      const data = { ...(e.data ?? { label: "" }) };
      delete data.par;
      return { ...e, type: "routed", data };
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
export function placeNodes(
  nodes: AnyNode[],
  positions: PositionMap,
  kind: DiagramKind,
): AnyNode[] {
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
      // React Flow reads the explicit dimensions off both places, and the
      // node views read `width`/`height` to draw themselves at the right
      // size, so both are set rather than one being derived later.
      ...(p.w !== undefined && p.h !== undefined
        ? { style: { ...n.style, width: p.w, height: p.h }, width: p.w, height: p.h }
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
   * Resize a node to an exact size and persist it.
   *
   * `setNodeSize` is the live half of a drag; this is the whole gesture in
   * one call, for the inspector's width and height fields — the way to
   * resize without dragging a handle (WCAG 2.5.7).
   */
  resizeNode: (id: string, w: number, h: number) => void;
  /**
   * Give a node its content-driven size back.
   *
   * Resizing is one-way otherwise: nothing about a 300×90 box says what it
   * would have been, and dragging a handle cannot land back on "whatever
   * this label needs". Groups are excluded — they have no size of their own
   * to return to.
   */
  resetNodeSize: (id: string) => void;
  /**
   * Insert a corner into an edge's route, at `index` among the existing ones.
   *
   * The index is what makes this usable: a waypoint dragged out of the
   * segment between the second and third corners has to land between them,
   * not at the end, or the path folds back on itself.
   */
  addWaypoint: (edgeId: string, index: number, point: Waypoint, commit?: boolean) => void;
  moveWaypoint: (edgeId: string, index: number, point: Waypoint, commit?: boolean) => void;
  removeWaypoint: (edgeId: string, index: number) => void;
  /**
   * Replace an edge's corners outright.
   *
   * Sliding a run of an orthogonal route can add corners, drop them and move
   * others all at once — the arithmetic in `orthogonal.ts` returns the whole
   * new path — so there is nothing sensible to express as one insertion or
   * one move.
   */
  setWaypoints: (edgeId: string, points: Waypoint[], commit?: boolean) => void;
  /**
   * Change how one edge is presented — where its label sits, how it routes.
   * Merged into whatever is already there, so moving a label does not undo a
   * routing choice made a moment before.
   */
  setEdgeStyle: (edgeId: string, patch: EdgeStyle, commit?: boolean) => void;
  /** Change how one node is drawn — a box with its icon, or the icon alone. */
  setNodeStyle: (nodeId: string, patch: NodeStyle) => void;
  /** The icons this document carries, by name, already sanitised. */
  iconLibrary: IconLibrary;
  /**
   * Take an SVG into the document under `name`, and answer with the
   * reference a node should use. The markup is cleaned first; anything that
   * is not an icon is refused.
   */
  addCustomIcon: (name: string, svg: string) => string | null;
  /**
   * Take a whole folder in at once. Answers with the references accepted, in
   * the order given, so a caller can point a node at the first of them.
   */
  addCustomIcons: (files: Array<{ name: string; svg: string }>) => string[];
  /**
   * Add a corner at the middle of the edge's last segment.
   *
   * The pointer-free way in: the inspector has no geometry of its own, so
   * the midpoint is worked out here, from where the two ends actually are.
   */
  appendWaypoint: (edgeId: string) => void;
  /** Straighten an edge: drop every corner at once. */
  clearWaypoints: (edgeId: string) => void;
  /**
   * Write a dragged route out, once.
   *
   * Dragging a corner passes `commit: false` on every pointer move: writing
   * the comment at 60fps would fill the undo stack with one entry per frame
   * and rewrite the document each time. The gesture ends here instead.
   */
  commitWaypoints: () => void;
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
  /**
   * Line the selected nodes up on one edge, or on their shared centre.
   *
   * Dragging can get two boxes nearly level; only arithmetic gets them
   * actually level. It is also a way to arrange a diagram without dragging
   * anything, which is the same reason the group size fields exist.
   */
  alignSelection: (edge: AlignEdge) => void;
  /** Even the gaps between the selected nodes along one axis. */
  distributeSelection: (axis: "x" | "y") => void;
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

/**
 * Move every connection's corners to keep up with the nodes that moved.
 *
 * Reads the absolute geometry twice — before the change and after — because
 * a node inside a group moves when the group is dragged without its own
 * position changing at all, and the corners have to follow that too.
 */
function carryEdges(before: AnyNode[], after: AnyNode[], edges: FlowEdge[]): FlowEdge[] {
  const was = absoluteBoxes(before);
  const now = absoluteBoxes(after);
  const shift = (id: string) => {
    const a = was.get(id);
    const b = now.get(id);
    return a && b ? { x: b.x - a.x, y: b.y - a.y } : { x: 0, y: 0 };
  };

  let touched = false;
  const next = edges.map((e) => {
    const points = e.data?.points;
    if (!points || points.length === 0) return e;
    const carried = carryWaypoints(points, shift(e.source), shift(e.target));
    if (carried === points) return e;
    touched = true;
    return { ...e, data: { ...(e.data ?? { label: "" }), points: carried } };
  });
  return touched ? next : edges;
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
        // A group has no natural size, so its own is always recorded. Every
        // other node keeps whatever its content asks for unless it has been
        // resized on purpose — writing the measured size of every node would
        // bloat the comment and freeze labels at the width they happened to
        // render at.
        ...(isGroup(n)
          ? {
              w: Number(n.style?.width ?? n.measured?.width ?? 320),
              h: Number(n.style?.height ?? n.measured?.height ?? 220),
            }
          : hasCustomSize(n)
            ? { w: Number(n.style?.width), h: Number(n.style?.height) }
            : {}),
      };
    }
    return positions;
  };

  const collectWaypoints = (): WaypointMap => {
    const keys = waypointKeys(get().edges);
    const map: WaypointMap = {};
    for (const e of get().edges) {
      const points = e.data?.points;
      if (points?.length) map[keys.get(e.id)!] = points;
    }
    return map;
  };

  /** The icons the document should keep: the ones its nodes still name. */
  const collectIcons = (): IconLibrary => {
    const referenced = get()
      .nodes.map((n) => (n.data as { icon?: string }).icon)
      .filter((i): i is string => typeof i === "string");
    return usedIcons(get().iconLibrary, referenced);
  };

  const collectNodeStyles = (): NodeStyleMap => {
    const map: NodeStyleMap = {};
    for (const n of get().nodes) {
      const style = (n.data as { style?: NodeStyle }).style;
      if (!isPlainNode(style)) map[n.id] = style!;
    }
    return map;
  };

  const collectEdgeStyles = (): EdgeStyleMap => {
    const keys = waypointKeys(get().edges);
    const map: EdgeStyleMap = {};
    for (const e of get().edges) {
      const style = e.data?.style;
      if (!isPlain(style)) map[keys.get(e.id)!] = style!;
    }
    return map;
  };

  /**
   * Apply an edit to one edge's corners and write the result out.
   *
   * Going through `repatchPositions` rather than `regenerate` is the point:
   * a corner is layout, so the user's own text is left exactly as it is.
   */
  const patchWaypointList = (
    edgeId: string,
    edit: (points: Waypoint[]) => Waypoint[],
    commit = true,
  ): void => {
    const edge = get().edges.find((e) => e.id === edgeId);
    if (!edge) return;
    const next = edit(edge.data?.points ?? []);
    // Back through `annotateParallel` so the edge type is decided in one
    // place: a straightened edge that overlaps another goes back to being
    // fanned out, which nothing here would otherwise undo.
    set({
      edges: annotateParallel(
        get().kind,
        get().edges.map((e) =>
          e.id === edgeId
            ? {
                ...e,
                data: {
                  ...(e.data ?? { label: "" }),
                  ...(next.length > 0 ? { points: next } : { points: undefined }),
                },
              }
            : e,
        ),
      ),
    });
    if (commit) repatchPositions();
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
    const serialized = serializeDiagram({
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
    const code = patchIconLibrary(
      patchNodeStyles(
        patchEdgeStyles(patchWaypoints(serialized, collectWaypoints()), collectEdgeStyles()),
        collectNodeStyles(),
      ),
      collectIcons(),
    );
    set({ code, parseError: null });
    persist(code);
  };

  /**
   * Only the layout changed (a drag, a resize, a waypoint) — leave the
   * user's text alone and rewrite the two trailing comments.
   */
  const repatchPositions = () => {
    record(get().code);
    const code = patchIconLibrary(
      patchNodeStyles(
        patchEdgeStyles(
          patchWaypoints(patchPositions(get().code, collectPositions()), collectWaypoints()),
          collectEdgeStyles(),
        ),
        collectNodeStyles(),
      ),
      collectIcons(),
    );
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
        // Carry the selection across the re-parse.
        //
        // Re-parsing rebuilds every node from the text, and the rebuilt ones
        // arrived unselected. Any position-only edit rewrites the positions
        // comment, which schedules a re-parse 400ms later — so moving a node
        // with the arrow keys deselected it a moment afterwards and the next
        // press did nothing. Aligning a selection had the same fate, and made
        // it obvious. A node that is still there keeps its selection; one
        // that the edit removed cannot.
        const selectedIds = new Set(
          get()
            .nodes.filter((n) => n.selected)
            .map((n) => n.id),
        );
        if (selectedIds.size > 0) {
          nodes = nodes.map((n) => (selectedIds.has(n.id) ? { ...n, selected: true } : n));
        }

        // How a node is drawn lives in its own comment, keyed by id, and is
        // matched back on here rather than surviving on the node objects,
        // which a re-parse replaces.
        // The document's own icons, over the ones this browser has kept: a
        // file that carries a different drawing under the same name is
        // describing itself, and wins.
        const carried = { ...useIconPack.getState().icons, ...(readIconLibrary(code) ?? {}) };
        setCarriedIcons(carried);

        const looks = readNodeStyles(code);
        if (looks) {
          nodes = nodes.map((n) =>
            looks[n.id] ? ({ ...n, data: { ...n.data, style: looks[n.id] } } as AnyNode) : n,
          );
        }

        // Waypoints live in their own comment and are keyed by endpoints,
        // so they are matched back onto the freshly parsed edges here rather
        // than surviving on the edge objects, which do not.
        const stored = readWaypoints(code);
        const styles = readEdgeStyles(code);
        const keys = waypointKeys(parsed.edges);
        const routed =
          stored || styles
            ? parsed.edges.map((e) => {
                const key = keys.get(e.id)!;
                const points = stored?.[key];
                const style = styles?.[key];
                if (!points && !style) return e;
                return {
                  ...e,
                  data: {
                    ...(e.data ?? { label: "" }),
                    ...(points ? { points } : {}),
                    ...(style ? { style } : {}),
                  },
                };
              })
            : parsed.edges;

        set({
          iconLibrary: carried,
          kind: parsed.kind,
          nodes,
          edges: annotateParallel(parsed.kind, routed),
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
        // A connection's corners are absolute positions, so moving a node
        // would otherwise leave them exactly where they were and send the
        // line off on an errand. Carry them the same way instead — each
        // corner following the end it is nearer.
        const moved = changes.some((c) => c.type === "position" && c.position);
        set({
          nodes,
          ...(moved ? { edges: carryEdges(get().nodes, nodes, get().edges) } : {}),
        });
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
            ? {
                ...n,
                position: { x, y },
                style: { ...n.style, width: w, height: h },
                width: w,
                height: h,
              }
            : n,
        ),
      });
    },

    resizeNode: (id, w, h) => {
      const node = get().nodes.find((n) => n.id === id);
      if (!node) return;
      const min = minSize(node);
      get().setNodeSize(
        id,
        Math.max(min.width, Math.round(w)),
        Math.max(min.height, Math.round(h)),
        node.position.x,
        node.position.y,
      );
      repatchPositions();
    },

    resetNodeSize: (id) => {
      const node = get().nodes.find((n) => n.id === id);
      if (!node || isGroup(node)) return;
      set({
        nodes: get().nodes.map((n) =>
          n.id === id
            ? {
                ...n,
                style: { ...n.style, width: undefined, height: undefined },
                width: undefined,
                height: undefined,
                measured: undefined,
              }
            : n,
        ),
      });
      repatchPositions();
    },

    addWaypoint: (edgeId, index, point, commit = true) => {
      patchWaypointList(
        edgeId,
        (points) => [
          ...points.slice(0, index),
          { x: Math.round(point.x), y: Math.round(point.y) },
          ...points.slice(index),
        ],
        commit,
      );
    },

    moveWaypoint: (edgeId, index, point, commit = true) => {
      patchWaypointList(
        edgeId,
        (points) =>
          points.map((p, i) =>
            i === index ? { x: Math.round(point.x), y: Math.round(point.y) } : p,
          ),
        commit,
      );
    },

    setWaypoints: (edgeId, points, commit = true) => {
      patchWaypointList(
        edgeId,
        () => points.map((q) => ({ x: Math.round(q.x), y: Math.round(q.y) })),
        commit,
      );
    },

    iconLibrary: {},

    addCustomIcons: (files) => {
      // Through the browser's pack first: it cleans, names and keeps them, so
      // the same icons are there for the next diagram too.
      const refs = useIconPack.getState().add(files);
      const pack = useIconPack.getState().icons;
      const library = { ...get().iconLibrary };
      for (const ref of refs) {
        const key = ref.slice(CUSTOM.length + 1);
        if (pack[key]) library[key] = pack[key];
      }
      set({ iconLibrary: library });
      setCarriedIcons(library);
      return refs;
    },

    addCustomIcon: (name, svg) => {
      const clean = sanitiseSvg(svg);
      if (!clean) return null;
      const key = iconName(name);
      const library = { ...get().iconLibrary, [key]: clean };
      set({ iconLibrary: library });
      setCarriedIcons(library);
      return `${CUSTOM}:${key}`;
    },

    setNodeStyle: (nodeId, patch) => {
      set({
        nodes: get().nodes.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                data: {
                  ...n.data,
                  style: { ...(n.data as { style?: NodeStyle }).style, ...patch },
                },
              }
            : n,
        ) as AnyNode[],
      });
      repatchPositions();
    },

    setEdgeStyle: (edgeId, patch, commit = true) => {
      set({
        edges: get().edges.map((e) =>
          e.id === edgeId
            ? {
                ...e,
                data: {
                  ...(e.data ?? { label: "" }),
                  style: { ...(e.data?.style ?? {}), ...patch },
                },
              }
            : e,
        ),
      });
      if (commit) repatchPositions();
    },

    commitWaypoints: () => repatchPositions(),

    removeWaypoint: (edgeId, index) => {
      patchWaypointList(edgeId, (points) => points.filter((_, i) => i !== index));
    },

    appendWaypoint: (edgeId) => {
      const edge = get().edges.find((e) => e.id === edgeId);
      if (!edge) return;
      const boxes = absoluteBoxes(get().nodes);
      const centre = (id: string): Waypoint | null => {
        const b = boxes.get(id);
        return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : null;
      };
      const from = centre(edge.source);
      const to = centre(edge.target);
      if (!from || !to) return;
      const points = edge.data?.points ?? [];
      const last = points[points.length - 1] ?? from;
      get().addWaypoint(edgeId, points.length, {
        x: (last.x + to.x) / 2,
        y: (last.y + to.y) / 2,
      });
    },

    clearWaypoints: (edgeId) => {
      patchWaypointList(edgeId, () => []);
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
              // A named icon when the palette gave one — dropping the
              // Azure "Virtual Networks" icon should make a VNet, not a
              // generic cloud with the wrong picture on it.
              ...(kind === "architecture" ? { icon: seed.icon ?? "cloud" } : {}),
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
      // Groups may be grouped. A VNet holding a Subnet holding its machines
      // is the ordinary shape of a cloud diagram, and excluding groups here
      // meant the only way to nest one was to write it in the source by hand.
      const chosen = nodes.filter((n) => n.selected);
      const byId = new Map(nodes.map((n) => [n.id, n]));
      const inside = (n: AnyNode, ancestor: string): boolean => {
        for (let p = n.parentId; p; p = byId.get(p)?.parentId) {
          if (p === ancestor) return true;
        }
        return false;
      };
      // A selected group brings its contents with it; taking those in as
      // members of their own accord would move them twice.
      const selected = chosen.filter(
        (n) => !chosen.some((other) => other.id !== n.id && inside(n, other.id)),
      );
      if (selected.length === 0) return;
      const parent = selected[0].parentId;
      if (!selected.every((n) => n.parentId === parent)) return;

      const PAD = 28;
      const TITLE = 34;
      const boxes = selected.map((n) => {
        const s = estimateSize(n);
        // A container is as big as it was drawn, which is in its style; only
        // a leaf can be estimated from its contents. `Number(undefined)` is
        // NaN rather than nullish, so the fallback has to be explicit.
        const styled = (v: unknown): number | null => {
          const parsed = Number(v);
          return Number.isFinite(parsed) ? parsed : null;
        };
        const w = n.measured?.width ?? styled(n.style?.width) ?? s.width;
        const h = n.measured?.height ?? styled(n.style?.height) ?? s.height;
        return {
          x1: n.position.x,
          y1: n.position.y,
          x2: n.position.x + w,
          y2: n.position.y + h,
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

    alignSelection: (edge) => {
      const targets = alignableSelection(get().nodes);
      if (targets.length === 0) return;

      const boxes = targets.map(boxOf);
      // The bounding box of the selection, which is what every edge is
      // measured against — including the centre, so "centre" means the
      // middle of what you selected rather than the average of the nodes.
      const left = Math.min(...boxes.map((b) => b.x));
      const right = Math.max(...boxes.map((b) => b.x + b.w));
      const top = Math.min(...boxes.map((b) => b.y));
      const bottom = Math.max(...boxes.map((b) => b.y + b.h));

      const moved = new Map<string, { x: number; y: number }>();
      targets.forEach((n, i) => {
        const b = boxes[i];
        const pos = { x: b.x, y: b.y };
        if (edge === "left") pos.x = left;
        else if (edge === "right") pos.x = right - b.w;
        else if (edge === "centerX") pos.x = (left + right) / 2 - b.w / 2;
        else if (edge === "top") pos.y = top;
        else if (edge === "bottom") pos.y = bottom - b.h;
        else if (edge === "middleY") pos.y = (top + bottom) / 2 - b.h / 2;
        moved.set(n.id, { x: Math.round(pos.x), y: Math.round(pos.y) });
      });

      set({
        // Only what moves gets a new object. Replacing every node makes
        // React Flow re-sync its list and drop the selection, so the panel
        // vanished after one click and nothing could be chained — which is
        // why `nudgeSelection` touches only what it moves too.
        nodes: get().nodes.map((n) => {
          const next = moved.get(n.id);
          return next ? { ...n, position: next } : n;
        }),
      });
      repatchPositions();
    },

    distributeSelection: (axis) => {
      const targets = alignableSelection(get().nodes);
      // Two nodes are already evenly spaced with respect to each other;
      // there is nothing between them to move.
      if (targets.length < 3) return;

      const withBoxes = targets
        .map((n) => ({ n, b: boxOf(n) }))
        .sort((p, q) => (axis === "x" ? p.b.x - q.b.x : p.b.y - q.b.y));

      const first = withBoxes[0].b;
      const last = withBoxes[withBoxes.length - 1].b;
      const span = axis === "x" ? last.x + last.w - first.x : last.y + last.h - first.y;
      const used = withBoxes.reduce((sum, { b }) => sum + (axis === "x" ? b.w : b.h), 0);
      // Equal *gaps*, not equal centres: with boxes of different sizes those
      // are different arrangements, and even gaps is what looks tidy.
      const gap = (span - used) / (withBoxes.length - 1);

      const moved = new Map<string, { x: number; y: number }>();
      let cursor = axis === "x" ? first.x : first.y;
      for (const { n, b } of withBoxes) {
        moved.set(n.id, {
          x: axis === "x" ? Math.round(cursor) : b.x,
          y: axis === "y" ? Math.round(cursor) : b.y,
        });
        cursor += (axis === "x" ? b.w : b.h) + gap;
      }

      set({
        // Only what moves gets a new object. Replacing every node makes
        // React Flow re-sync its list and drop the selection, so the panel
        // vanished after one click and nothing could be chained — which is
        // why `nudgeSelection` touches only what it moves too.
        nodes: get().nodes.map((n) => {
          const next = moved.get(n.id);
          return next ? { ...n, position: next } : n;
        }),
      });
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
