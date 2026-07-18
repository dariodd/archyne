import type { Node, Edge } from "@xyflow/react";

/** Diagram families the editor supports on the shared canvas. */
export type DiagramKind =
  | "flowchart"
  | "state"
  | "er"
  | "class"
  | "sequence"
  | "architecture"
  | "c4";

/** Mermaid direction. */
export type Direction = "TD" | "TB" | "LR" | "RL" | "BT";

/**
 * Flowchart node shapes, named exactly as mermaid's flowchart parser names
 * vertex types so import/export round-trips without a mapping table.
 */
export const SHAPES = [
  "square",
  "round",
  "stadium",
  "subroutine",
  "cylinder",
  "circle",
  "doublecircle",
  "diamond",
  "hexagon",
  "odd",
  "trapezoid",
  "inv_trapezoid",
  "lean_right",
  "lean_left",
] as const;

export type Shape = (typeof SHAPES)[number];

export const SHAPE_LABELS: Record<Shape, string> = {
  square: "Process",
  round: "Rounded",
  stadium: "Terminator",
  subroutine: "Subroutine",
  cylinder: "Database",
  circle: "Circle",
  doublecircle: "Double circle",
  diamond: "Decision",
  hexagon: "Hexagon",
  odd: "Flag",
  trapezoid: "Trapezoid",
  inv_trapezoid: "Trapezoid alt",
  lean_right: "Input/Output",
  lean_left: "Output/Input",
};

export type EdgeStroke = "normal" | "dotted" | "thick";
export type ArrowType = "arrow_point" | "arrow_open" | "arrow_circle" | "arrow_cross";

/** State diagram node roles. */
export type StateType = "normal" | "start" | "end" | "choice" | "fork" | "join";

/** ER entity attribute, matching mermaid's parsed shape. */
export interface EntityAttr {
  type: string;
  name: string;
  keys: string[];
  comment: string;
}

/** ER relationship cardinalities, named as mermaid names them. */
export const ER_CARDS = ["ONLY_ONE", "ZERO_OR_ONE", "ZERO_OR_MORE", "ONE_OR_MORE"] as const;
export type ErCard = (typeof ER_CARDS)[number];
export const ER_CARD_LABELS: Record<ErCard, string> = {
  ONLY_ONE: "exactly 1",
  ZERO_OR_ONE: "0 or 1",
  ZERO_OR_MORE: "0..N",
  ONE_OR_MORE: "1..N",
};

/** Class relation end markers. */
export const CLASS_MARKERS = [
  "none",
  "extension",
  "composition",
  "aggregation",
  "dependency",
] as const;
export type ClassMarker = (typeof CLASS_MARKERS)[number];

/* ---------- node data ---------- */

export interface ShapeNodeData extends Record<string, unknown> {
  label: string;
  shape: Shape;
  direction: Direction;
  /** classDef names assigned via `class a,b name` or `a:::name`. */
  classes?: string[];
  /** Inline styles from a `style <id> ...` statement, e.g. "fill:#f9f". */
  styles?: string[];
}

/** classDef name → style declarations ("fill:#f9f", "stroke:#333", …). */
export type ClassDefs = Record<string, string[]>;

export interface StateNodeData extends Record<string, unknown> {
  label: string;
  stateType: StateType;
  direction: Direction;
}

export interface EntityNodeData extends Record<string, unknown> {
  label: string;
  attributes: EntityAttr[];
  direction: Direction;
}

export interface ClassNodeData extends Record<string, unknown> {
  label: string;
  members: string[];
  methods: string[];
  /** <<interface>>, <<abstract>>, … */
  annotations: string[];
  /** Generic parameter, e.g. "T" for List~T~. */
  generic?: string;
  direction: Direction;
}

/** Sequence-diagram message operators, as written in the syntax. */
export const SEQ_OPS = ["->>", "-->>", "->", "-->", "-x", "--x", "-)", "--)"] as const;
export type SeqOp = (typeof SEQ_OPS)[number];
export const SEQ_OP_LABELS: Record<SeqOp, string> = {
  "->>": "Solid arrow",
  "-->>": "Dotted arrow",
  "->": "Solid open",
  "-->": "Dotted open",
  "-x": "Solid cross",
  "--x": "Dotted cross",
  "-)": "Async",
  "--)": "Dotted async",
};

/** One row of a sequence diagram, in order. Messages reference edges. */
export type SeqItem =
  | { kind: "message"; edgeId: string }
  | { kind: "note"; placement: "left" | "right" | "over"; a: string; b?: string; text: string }
  | { kind: "block"; op: string; label: string }
  | { kind: "divider"; op: string; label: string }
  | { kind: "end" }
  | { kind: "active"; on: boolean; actor: string }
  | { kind: "autonumber" };

/** Free-floating note (class diagrams), optionally attached to a class. */
export interface NoteNodeData extends Record<string, unknown> {
  text: string;
  target?: string;
  direction: Direction;
}

export interface ParticipantNodeData extends Record<string, unknown> {
  label: string;
  ptype: "participant" | "actor";
  direction: Direction;
}

export interface GroupNodeData extends Record<string, unknown> {
  label: string;
  /** Original mermaid subgraph / composite-state id, kept for export. */
  subgraphId: string;
  /** Group icon (architecture diagrams), e.g. "cloud" or "logos:aws-vpc". */
  icon?: string;
  /** C4 boundary type: ENTERPRISE, SYSTEM, CONTAINER. */
  boundaryType?: string;
}

/** C4 element node, typed as mermaid's typeC4Shape names them. */
export const C4_SHAPES = [
  "person",
  "external_person",
  "system",
  "external_system",
  "system_db",
  "system_queue",
  "container",
  "external_container",
  "container_db",
  "container_queue",
  "component",
  "external_component",
  "component_db",
  "component_queue",
  "external_system_db",
  "external_system_queue",
  "external_container_db",
  "external_container_queue",
  "external_component_db",
  "external_component_queue",
] as const;
export type C4Shape = (typeof C4_SHAPES)[number];

export interface C4NodeData extends Record<string, unknown> {
  label: string;
  c4Shape: C4Shape;
  descr: string;
  direction: Direction;
}

export interface C4EdgeInfo {
  /** mermaid rel type: rel, birel, rel_u, rel_d, rel_l, rel_r, rel_b. */
  relType: string;
  techn: string;
}

/** Architecture-beta service node. */
export interface ServiceNodeData extends Record<string, unknown> {
  label: string;
  /** Built-in name (cloud, database, disk, internet, server) or iconify "logos:aws-s3". */
  icon: string;
  direction: Direction;
}

/** Architecture-beta connection endpoints. */
export type ArchDir = "L" | "R" | "T" | "B";
export interface ArchEdgeInfo {
  lhsDir: ArchDir;
  rhsDir: ArchDir;
  /** Arrow pointing into the lhs / rhs endpoint. */
  lhsInto: boolean;
  rhsInto: boolean;
  /** Endpoint attaches to a group border rather than the node itself. */
  lhsGroup: boolean;
  rhsGroup: boolean;
}

export type ShapeNode = Node<ShapeNodeData, "shape">;
export type StateNode = Node<StateNodeData, "state">;
export type EntityNode = Node<EntityNodeData, "entity">;
export type ClassNode = Node<ClassNodeData, "class">;
export type ParticipantNode = Node<ParticipantNodeData, "participant">;
export type ServiceNode = Node<ServiceNodeData, "service">;
export type JunctionNode = Node<Record<string, unknown>, "junction">;
export type C4Node = Node<C4NodeData, "c4">;
export type NoteNode = Node<NoteNodeData, "note">;
export type GroupNode = Node<GroupNodeData, "group">;
export type AnyNode =
  | ShapeNode
  | StateNode
  | EntityNode
  | ClassNode
  | ParticipantNode
  | ServiceNode
  | JunctionNode
  | C4Node
  | NoteNode
  | GroupNode;

export function isGroup(n: AnyNode): n is GroupNode {
  return n.type === "group";
}

/* ---------- edge data ---------- */

export interface ErEdgeInfo {
  cardA: ErCard;
  cardB: ErCard;
  identifying: boolean;
}

export interface ClassEdgeInfo {
  left: ClassMarker;
  right: ClassMarker;
  dotted: boolean;
  card1?: string;
  card2?: string;
}

/**
 * One edge data shape for every kind; the kind-specific part is optional.
 * flowchart uses stroke/arrow, er uses `er`, class uses `cls`, state uses
 * only the label.
 */
export interface FlowEdgeData extends Record<string, unknown> {
  label: string;
  stroke?: EdgeStroke;
  arrow?: ArrowType;
  /** Flowchart: arrowheads at both ends (<-->, x--x, o--o). */
  both?: boolean;
  er?: ErEdgeInfo;
  cls?: ClassEdgeInfo;
  seq?: { op: SeqOp };
  arch?: ArchEdgeInfo;
  c4?: C4EdgeInfo;
  /** Set when several edges share the same node pair: index, count, and
   *  a direction-normalizing sign for the perpendicular offset. */
  par?: { i: number; n: number; s?: 1 | -1 };
}

export type FlowEdge = Edge<FlowEdgeData>;

/** What a palette item drops onto the canvas. */
export type NodeSeed =
  | { type: "shape"; shape: Shape }
  | { type: "state"; stateType: StateType }
  | { type: "entity" }
  | { type: "class" }
  | { type: "participant"; ptype: "participant" | "actor" }
  | { type: "service"; icon: string }
  | { type: "junction" }
  | { type: "c4"; c4Shape: C4Shape }
  | { type: "group" }
  | { type: "note" }
  | { type: "seqnote" }
  | { type: "seqblock"; op: "loop" | "alt" | "opt" };

/* ---------- sizing ---------- */

export function defaultSize(shape: Shape): { width: number; height: number } {
  switch (shape) {
    case "circle":
    case "doublecircle":
      return { width: 96, height: 96 };
    case "diamond":
      return { width: 150, height: 86 };
    default:
      return { width: 160, height: 54 };
  }
}

/** Size estimate for layout when the node hasn't been measured yet. */
export function estimateSize(n: AnyNode): { width: number; height: number } {
  switch (n.type) {
    case "shape":
      return defaultSize(n.data.shape);
    case "state": {
      const t = n.data.stateType;
      if (t === "normal") return { width: 150, height: 46 };
      if (t === "choice") return { width: 40, height: 40 };
      if (t === "fork" || t === "join") return { width: 70, height: 12 };
      return { width: 28, height: 28 };
    }
    case "entity":
      return { width: 210, height: 36 + Math.max(1, n.data.attributes.length) * 22 };
    case "class":
      return {
        width: 210,
        height: 38 + (n.data.members.length + n.data.methods.length) * 20 + 12,
      };
    case "participant":
      return { width: 150, height: 48 };
    case "note":
      return { width: 150, height: 64 };
    case "service":
      return { width: 110, height: 96 };
    case "junction":
      return { width: 16, height: 16 };
    case "c4":
      return { width: 200, height: 110 };
    default:
      return { width: 320, height: 220 };
  }
}
