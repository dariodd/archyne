/**
 * Reading Graphviz DOT into a Mermaid flowchart.
 *
 * Unlike the draw.io importer, this one has no impedance mismatch to
 * apologise for: DOT describes a graph, not a drawing, and so does Mermaid.
 * Nodes, edges, clusters, shapes and colours all have a counterpart, and what
 * comes out is close to what a person would have written by hand.
 *
 * The point is the DOT nobody writes by hand. `terraform graph`,
 * `go mod graph`, doxygen, dbt and half the build tools in existence emit it,
 * and it is normally looked at through whichever viewer is nearest and never
 * edited. Here it opens on a canvas.
 *
 * The grammar is small enough to parse properly, so it is parsed properly —
 * tokeniser, then recursive descent over the grammar in the language
 * definition. Regular expressions over DOT come apart on the first quoted
 * brace, and quoted braces are exactly what a generated file is full of.
 */
import type {
  AnyNode,
  ArrowType,
  ClassMarker,
  ClassNode,
  EdgeStroke,
  FlowEdge,
  GroupNode,
  Shape,
  ShapeNode,
} from "./types";
import type { Direction } from "./types";
import { serializeFlowchart } from "./kinds/flowchart";
import { serializeClass } from "./kinds/cls";
import { positionsLine, type PositionMap } from "./positions";
import { idFactory, readableOn } from "./importShared";

export interface DotImport {
  /** A complete Mermaid document. */
  code: string;
  nodes: number;
  edges: number;
  /** Edges dropped because `strict` forbids the repeat. */
  dropped: number;
}

/* ---------- tokeniser ---------- */

type TokenType = "id" | "punct" | "edgeop";

interface Token {
  type: TokenType;
  value: string;
  /** True when the id arrived in quotes, so keywords in quotes stay values. */
  quoted: boolean;
}

const PUNCT = new Set(["{", "}", "[", "]", ";", ",", "=", ":"]);

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let at = 0;

  const push = (type: TokenType, value: string, quoted = false) =>
    tokens.push({ type, value, quoted });

  while (at < source.length) {
    const c = source[at];

    if (/\s/.test(c)) {
      at++;
      continue;
    }
    // Three comment syntaxes, and the `#` one is a whole line only.
    if (c === "/" && source[at + 1] === "/") {
      at = source.indexOf("\n", at);
      if (at < 0) break;
      continue;
    }
    if (c === "/" && source[at + 1] === "*") {
      const close = source.indexOf("*/", at + 2);
      at = close < 0 ? source.length : close + 2;
      continue;
    }
    if (c === "#" && (at === 0 || source[at - 1] === "\n")) {
      at = source.indexOf("\n", at);
      if (at < 0) break;
      continue;
    }

    if (source.startsWith("->", at) || source.startsWith("--", at)) {
      push("edgeop", source.slice(at, at + 2));
      at += 2;
      continue;
    }
    if (PUNCT.has(c)) {
      push("punct", c);
      at++;
      continue;
    }

    if (c === '"') {
      let value = "";
      at++;
      while (at < source.length && source[at] !== '"') {
        // Only the quote and a line continuation are escapes worth honouring;
        // `\n` and `\l` are line breaks in a label and handled with the text.
        if (source[at] === "\\" && (source[at + 1] === '"' || source[at + 1] === "\n")) {
          if (source[at + 1] === '"') value += '"';
          at += 2;
          continue;
        }
        value += source[at++];
      }
      at++; // closing quote
      push("id", value, true);
      continue;
    }

    // An HTML-like label, `<...>`, which nests and may hold quotes.
    if (c === "<") {
      let depth = 0;
      const start = at;
      while (at < source.length) {
        if (source[at] === "<") depth++;
        else if (source[at] === ">" && --depth === 0) {
          at++;
          break;
        }
        at++;
      }
      push("id", source.slice(start + 1, at - 1), true);
      continue;
    }

    const word = /^[A-Za-z-￿_][A-Za-z-￿_0-9]*|^-?(\.\d+|\d+(\.\d*)?)/.exec(source.slice(at));
    if (word) {
      push("id", word[0]);
      at += word[0].length;
      continue;
    }
    // Anything else is not DOT. Skipping keeps one stray byte from taking the
    // whole file down.
    at++;
  }
  return tokens;
}

/* ---------- parser ---------- */

type Attrs = Record<string, string>;

interface DotNode {
  name: string;
  attrs: Attrs;
  /** The cluster it was first seen in, which is the one it belongs to. */
  cluster: string | null;
}

interface DotEdge {
  from: string;
  to: string;
  attrs: Attrs;
}

interface DotCluster {
  name: string;
  attrs: Attrs;
  parent: string | null;
}

interface Parsed {
  directed: boolean;
  strict: boolean;
  graphAttrs: Attrs;
  nodes: Map<string, DotNode>;
  edges: DotEdge[];
  clusters: DotCluster[];
}

/** Defaults set by `node [...]` / `edge [...]`, which are scoped to a block. */
interface Defaults {
  node: Attrs;
  edge: Attrs;
}

/** A bare (unquoted) occurrence of one of DOT's keywords. */
function keyword(token: Token | undefined, word: string): boolean {
  return !!token && token.type === "id" && !token.quoted && token.value.toLowerCase() === word;
}

function parse(tokens: Token[]): Parsed {
  let at = 0;
  const peek = (ahead = 0) => tokens[at + ahead];
  const next = () => tokens[at++];
  const eat = (value: string) => {
    if (peek()?.value === value) {
      at++;
      return true;
    }
    return false;
  };

  const out: Parsed = {
    directed: true,
    strict: false,
    graphAttrs: {},
    nodes: new Map(),
    edges: [],
    clusters: [],
  };

  if (keyword(peek(), "strict")) {
    out.strict = true;
    at++;
  }
  if (keyword(peek(), "graph")) out.directed = false;
  else if (!keyword(peek(), "digraph")) throw new Error("this is not a DOT graph");
  at++;
  if (peek()?.type === "id" && peek()?.value !== "{") at++; // optional graph name
  if (!eat("{")) throw new Error("this DOT graph has no body");

  /** `[a=b, c=d]`, possibly several lists in a row. */
  const attrList = (): Attrs => {
    const attrs: Attrs = {};
    while (peek()?.value === "[") {
      at++;
      while (peek() && peek().value !== "]") {
        if (peek().value === "," || peek().value === ";") {
          at++;
          continue;
        }
        const key = next();
        if (eat("=")) {
          const value = next();
          if (key && value) attrs[key.value.toLowerCase()] = value.value;
        }
      }
      eat("]");
    }
    return attrs;
  };

  /** A node name, skipping any `:port:compass` that follows it. */
  const nodeId = (): string => {
    const name = next().value;
    while (peek()?.value === ":") {
      at++;
      if (peek()?.type === "id") at++;
    }
    return name;
  };

  /**
   * Record a node, or add to one already recorded.
   *
   * Defaults and explicit attributes are separate arguments because they
   * behave differently on a node that already exists. A `node [shape=box]`
   * default applies when the node is *created*; naming it again later — as
   * every edge does — must not re-apply it. Merging the two before this call,
   * as the first version did, let the second mention of `cdn` overwrite its
   * own `shape=ellipse` with the block default and every shape in a file with
   * defaults was silently lost.
   */
  const declare = (name: string, defaults: Attrs, explicit: Attrs, cluster: string | null) => {
    let node = out.nodes.get(name);
    if (!node) {
      node = { name, attrs: { ...defaults }, cluster };
      out.nodes.set(name, node);
    }
    Object.assign(node.attrs, explicit);
  };

  /**
   * One `{ … }` block. Returns every node named inside it, because DOT lets a
   * whole subgraph stand as an edge endpoint: `a -> {b c}` is two edges.
   *
   * `attrsInto` is where a bare `label="x"` inside the block lands. It is the
   * enclosing graph's or cluster's own attributes — writing them all to the
   * root, as this first did, gave every cluster the last one's label.
   */
  const stmtList = (cluster: string | null, defaults: Defaults, attrsInto: Attrs): string[] => {
    const named: string[] = [];
    // Defaults are copied on the way in: a `node [shape=box]` inside a block
    // applies to that block and does not leak back out.
    const scope: Defaults = { node: { ...defaults.node }, edge: { ...defaults.edge } };

    while (peek() && peek().value !== "}") {
      if (peek().value === ";" || peek().value === ",") {
        at++;
        continue;
      }

      // `node [...]`, `edge [...]`, `graph [...]`
      if (
        (keyword(peek(), "node") || keyword(peek(), "edge") || keyword(peek(), "graph")) &&
        peek(1)?.value === "["
      ) {
        const which = next().value.toLowerCase();
        const attrs = attrList();
        if (which === "node") Object.assign(scope.node, attrs);
        else if (which === "edge") Object.assign(scope.edge, attrs);
        else Object.assign(attrsInto, attrs);
        continue;
      }

      // A bare `rankdir=LR`, or a cluster's own `label="…"`.
      if (peek()?.type === "id" && peek(1)?.value === "=") {
        const key = next().value.toLowerCase();
        at++;
        const value = next();
        if (value) attrsInto[key] = value.value;
        continue;
      }

      // A subgraph, named or not, with or without the keyword.
      if (keyword(peek(), "subgraph") || peek()?.value === "{") {
        let name: string | null = null;
        if (keyword(peek(), "subgraph")) {
          at++;
          if (peek() && peek().value !== "{") name = next().value;
        }
        if (!eat("{")) continue;

        // Only `cluster*` subgraphs are drawn as a box. The rest exist to
        // scope attributes and to group edge endpoints, and turning those
        // into subgraphs would invent containers nobody asked for.
        const isCluster = !!name && /^cluster/i.test(name);
        const id = isCluster ? name : cluster;
        let self = out.clusters.find((c) => c.name === name);
        if (isCluster && name && !self) {
          self = { name, attrs: {}, parent: cluster };
          out.clusters.push(self);
        }

        // A cluster's own `label=` is written inside its braces, so its
        // attributes are the target for the block it opens.
        const inside = stmtList(id, scope, self ? self.attrs : {});
        eat("}");
        // The trailing attribute list of `{ … } [color=red]`, if any.
        Object.assign(self?.attrs ?? {}, attrList());

        if (peek()?.type === "edgeop") {
          edgeChain(inside, cluster, scope);
          continue;
        }
        named.push(...inside);
        continue;
      }

      // Otherwise: a node, possibly the start of an edge chain.
      if (peek()?.type !== "id") {
        at++;
        continue;
      }
      const first = nodeId();
      if (peek()?.type === "edgeop") {
        declare(first, scope.node, {}, cluster);
        named.push(first);
        edgeChain([first], cluster, scope);
        continue;
      }
      const attrs = attrList();
      declare(first, scope.node, attrs, cluster);
      named.push(first);
    }
    return named;
  };

  /** `a -> b -> {c d} [label="x"]`, from an already-read left-hand side. */
  function edgeChain(left: string[], cluster: string | null, defaults: Defaults) {
    let from = left;
    const hops: Array<[string[], string[]]> = [];

    while (peek()?.type === "edgeop") {
      at++;
      let to: string[];
      if (peek()?.value === "{" || keyword(peek(), "subgraph")) {
        if (keyword(peek(), "subgraph")) {
          at++;
          if (peek() && peek().value !== "{") at++;
        }
        eat("{");
        to = stmtList(cluster, defaults, {});
        eat("}");
      } else if (peek()?.type === "id") {
        const name = nodeId();
        declare(name, defaults.node, {}, cluster);
        to = [name];
      } else {
        break;
      }
      hops.push([from, to]);
      from = to;
    }

    // The attribute list belongs to every edge in the chain.
    const attrs = { ...defaults.edge, ...attrList() };
    for (const [sources, targets] of hops) {
      for (const a of sources) {
        for (const b of targets) out.edges.push({ from: a, to: b, attrs: { ...attrs } });
      }
    }
  }

  stmtList(null, { node: {}, edge: {} }, out.graphAttrs);
  // A file that runs out before its closing brace is truncated, and opening
  // it as the empty graph it parses to would hide that. `digraph {}` is a
  // legitimately empty one and still closes.
  if (!eat("}")) throw new Error("this DOT graph is never closed");
  return out;
}

/* ---------- mapping to Mermaid ---------- */

const BY_SHAPE: Record<string, Shape> = {
  box: "square",
  rect: "square",
  rectangle: "square",
  square: "square",
  none: "square",
  plaintext: "square",
  plain: "square",
  note: "square",
  tab: "square",
  folder: "square",
  component: "subroutine",
  box3d: "subroutine",
  ellipse: "stadium",
  oval: "stadium",
  circle: "circle",
  point: "circle",
  doublecircle: "doublecircle",
  doubleoctagon: "doublecircle",
  diamond: "diamond",
  mdiamond: "diamond",
  hexagon: "hexagon",
  octagon: "hexagon",
  msquare: "square",
  cylinder: "cylinder",
  parallelogram: "lean_right",
  trapezium: "trapezoid",
  invtrapezium: "inv_trapezoid",
  invhouse: "odd",
  house: "odd",
  cds: "odd",
};

const DIRECTION: Record<string, Direction> = { TB: "TB", LR: "LR", BT: "BT", RL: "RL" };

/**
 * The text of a label.
 *
 * DOT breaks lines with `\n`, `\l` and `\r` (the last two also set the
 * alignment, which Mermaid has no way to honour). An HTML-like label keeps
 * only its words, as it does for draw.io.
 */
function labelText(raw: string): string {
  return raw
    .replace(/\\[nlr]/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\\(.)/g, "$1")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("<br/>");
}

/**
 * `fill:` / `stroke:` / `color:` for a node.
 *
 * In DOT, `color` is the *outline*; it only becomes the fill when `style`
 * says `filled` and no `fillcolor` overrides it. Reading `color` as a fill —
 * the obvious mistake — would paint every node in a file that merely outlines
 * them, which is most generated files.
 *
 * The one liberty taken: a `fillcolor` without `filled` fills anyway.
 * Graphviz ignores it, but nobody writes one meaning nothing.
 */
function nodeStyles(attrs: Attrs): string[] {
  const out: string[] = [];
  const style = (attrs.style ?? "").toLowerCase();
  const filled = /\bfilled\b/.test(style);
  const fill = attrs.fillcolor ?? (filled ? attrs.color : undefined);
  const stroke = attrs.color && attrs.color !== fill ? attrs.color : undefined;

  if (fill) out.push(`fill:${fill}`);
  if (stroke) out.push(`stroke:${stroke}`);
  if (/\b(dashed|dotted)\b/.test(style)) out.push("stroke-dasharray:5");

  if (attrs.fontcolor) out.push(`color:${attrs.fontcolor}`);
  else if (fill) {
    const readable = readableOn(fill);
    if (readable) out.push(`color:${readable}`);
  }
  // `plaintext` is the DOT idiom for a bare caption, and `none` for a node
  // with no outline at all.
  const shape = (attrs.shape ?? "").toLowerCase();
  if ((shape === "plaintext" || shape === "plain" || shape === "none") && !fill && !stroke) {
    out.push("fill:transparent", "stroke:none");
  }
  return out;
}

/**
 * Node coordinates, when the file has them.
 *
 * Plain DOT carries no layout, and Archyne lays those out with ELK. But the
 * output of `dot -Tdot` — which is how a generated graph is often kept once
 * somebody has tidied it — has a `pos` on every node, in points, with the y
 * axis pointing up. Honouring it means a laid-out file opens laid out.
 */
function readPositions(nodes: DotNode[]): PositionMap | null {
  const parsed = nodes.map((n) => /^(-?[\d.]+),(-?[\d.]+)/.exec(n.attrs.pos ?? ""));
  if (parsed.some((m) => !m)) return null;

  const points = parsed.map((m) => ({ x: Number(m![1]), y: Number(m![2]) }));
  if (points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;

  const top = Math.max(...points.map((p) => p.y));
  const out: PositionMap = {};
  nodes.forEach((node, i) => {
    // Points to pixels, and the axis the other way up.
    const scale = 96 / 72;
    out[node.name] = {
      x: Math.round(points[i].x * scale),
      y: Math.round((top - points[i].y) * scale),
    };
  });
  return out;
}

/* ---------- class diagrams drawn with records ---------- */

/**
 * A record label is how UML is drawn in DOT: `{Name|+ id: int\l|+ pay()\l}`,
 * with the fields and the methods in their own compartments. doxygen emits
 * exactly this, and reading it as a flowchart turns a class model into boxes
 * full of pipe characters.
 *
 * The bar is deliberately high — a `shape=record` *and* a compartment
 * separator — because a plain record with no `|` really is just a box.
 */
function isClassRecord(node: DotNode): boolean {
  const shape = (node.attrs.shape ?? "").toLowerCase();
  return (shape === "record" || shape === "mrecord") && (node.attrs.label ?? "").includes("|");
}

/**
 * Split a record label on the `|` that are not inside a nested `{ … }`.
 *
 * The whole label is itself braced, so those come off first — leaving them on
 * puts every separator one level deep and splits nothing.
 */
function compartments(label: string): string[] {
  const body = label.trim().replace(/^\{([\s\S]*)\}$/, "$1");
  const out: string[] = [];
  let current = "";
  let depth = 0;
  for (let at = 0; at < body.length; at++) {
    const c = body[at];
    if (c === "\\") {
      current += body.slice(at, at + 2);
      at++;
      continue;
    }
    if (c === "{") depth++;
    if (c === "}") depth--;
    if (c === "|" && depth === 0) {
      out.push(current);
      current = "";
      continue;
    }
    current += c;
  }
  out.push(current);
  return out.map((part) => part.replace(/^\s*\{|\}\s*$/g, "").trim());
}

/** The entries of one compartment: DOT breaks them with `\l`, `\r` or `\n`. */
function entries(compartment: string): string[] {
  return compartment
    .split(/\\[lrn]/)
    .map((line) => line.replace(/\\(.)/g, "$1").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** What each end of a DOT relation means in class-diagram vocabulary. */
function classMarkerOf(arrow: string): ClassMarker {
  const head = arrow.toLowerCase();
  if (head.includes("empty") && head.includes("diamond")) return "aggregation";
  if (head.includes("diamond")) return "composition";
  if (head.includes("empty") || head.includes("onormal")) return "extension";
  if (head === "none" || !head) return "none";
  return "dependency";
}

function buildClassDiagram(parsed: Parsed, records: DotNode[]): DotImport {
  const nextId = idFactory();
  const idOf = new Map<string, string>();
  const nodes: AnyNode[] = [];

  for (const node of records) {
    const parts = compartments(node.attrs.label ?? node.name);
    const label = entries(parts[0] ?? node.name)[0] ?? node.name;
    const id = nextId(label, `c${nodes.length + 1}`);
    idOf.set(node.name, id);

    // Everything after the name: whatever has brackets is a method.
    const rest = parts.slice(1).flatMap(entries);
    const cls: ClassNode = {
      id,
      type: "class",
      position: { x: 0, y: 0 },
      data: {
        label,
        members: rest.filter((line) => !line.includes("(")),
        methods: rest.filter((line) => line.includes("(")),
        annotations: [],
        direction: "TB",
      },
    };
    nodes.push(cls);
  }

  const edges: FlowEdge[] = [];
  let dropped = 0;
  for (const edge of parsed.edges) {
    const source = idOf.get(edge.from);
    const target = idOf.get(edge.to);
    if (!source || !target) {
      dropped++;
      continue;
    }
    const style = (edge.attrs.style ?? "").toLowerCase();
    // `dir` decides which ends are drawn at all. doxygen writes inheritance
    // as `Base -> Derived [dir=back, arrowtail=empty]` — the arrow points
    // the other way and has no head, so reading `arrowhead` regardless would
    // put a second marker on an edge that has one.
    const dir = (edge.attrs.dir ?? "forward").toLowerCase();
    const tail = dir === "back" || dir === "both";
    const head = dir === "forward" || dir === "both";
    edges.push({
      id: `r${edges.length}_${source}_${target}`,
      source,
      target,
      data: {
        label: labelText(edge.attrs.label ?? ""),
        cls: {
          left: tail ? classMarkerOf(edge.attrs.arrowtail ?? "normal") : "none",
          right: head ? classMarkerOf(edge.attrs.arrowhead ?? "normal") : "none",
          dotted: /\b(dashed|dotted)\b/.test(style),
        },
      },
    });
  }

  return {
    code: serializeClass("TB", nodes, edges),
    nodes: nodes.length,
    edges: edges.length,
    dropped,
  };
}

/**
 * Read a Graphviz DOT file. Throws when it is not one.
 *
 * `as` overrules the detection, for the reader who disagrees with it: a graph
 * of records that is not a class model, or one that is but uses records only
 * for some of its nodes.
 */
export function dotToMermaid(source: string, as?: "flowchart" | "class"): DotImport {
  const parsed = parse(tokenize(source));

  // A file drawn entirely with record labels is a class model, not a graph.
  const dotNodesAll = [...parsed.nodes.values()];
  const records = dotNodesAll.filter(isClassRecord);
  const isClassModel =
    as === "class" ||
    (as !== "flowchart" && records.length > 0 && records.length === dotNodesAll.length);
  if (isClassModel) {
    return buildClassDiagram(parsed, records.length ? records : dotNodesAll);
  }

  const nextId = idFactory();
  const idOf = new Map<string, string>();
  const nodes: AnyNode[] = [];

  // Clusters first, outermost first, so a child always finds its parent.
  const depthOf = (cluster: DotCluster): number => {
    let n = 0;
    let at: DotCluster | undefined = cluster;
    while (at?.parent && n < 64) {
      const parent: string | null = at.parent;
      at = parsed.clusters.find((c) => c.name === parent);
      n++;
    }
    return n;
  };
  for (const cluster of [...parsed.clusters].sort((a, b) => depthOf(a) - depthOf(b))) {
    // `cluster_web` with no label of its own reads better as "web" than as
    // the internal name Graphviz needs it to have.
    const label = labelText(cluster.attrs.label ?? cluster.name.replace(/^cluster_?/i, ""));
    const id = nextId(label, `g${nodes.length + 1}`);
    idOf.set(cluster.name, id);
    const parentId = cluster.parent ? idOf.get(cluster.parent) : undefined;
    const group: GroupNode = {
      id,
      type: "group",
      position: { x: 0, y: 0 },
      data: { label: label || id, subgraphId: id },
      style: { width: 320, height: 220 },
      ...(parentId ? { parentId } : {}),
    };
    nodes.push(group);
  }

  const dotNodes = [...parsed.nodes.values()];
  for (const node of dotNodes) {
    const label = labelText(node.attrs.label ?? node.name);
    const id = nextId(label, `n${nodes.length + 1}`);
    idOf.set(node.name, id);
    const styles = nodeStyles(node.attrs);
    const parentId = node.cluster ? idOf.get(node.cluster) : undefined;
    const shape: ShapeNode = {
      id,
      type: "shape",
      position: { x: 0, y: 0 },
      data: {
        label,
        shape: BY_SHAPE[(node.attrs.shape ?? "").toLowerCase()] ?? "square",
        direction: "TB",
        ...(styles.length ? { styles } : {}),
      },
      ...(parentId ? { parentId } : {}),
    };
    nodes.push(shape);
  }

  const edges: FlowEdge[] = [];
  const seen = new Set<string>();
  let dropped = 0;
  for (const edge of parsed.edges) {
    const source = idOf.get(edge.from);
    const target = idOf.get(edge.to);
    if (!source || !target) {
      dropped++;
      continue;
    }
    // `strict` means at most one edge between a pair, and a generated file
    // often leans on that rather than de-duplicating as it writes. Collapsing
    // the repeat is what the file asked for, so it is not counted as
    // something lost — Graphviz would draw one line here too.
    const pair = `${source}>${target}`;
    if (parsed.strict && seen.has(pair)) continue;
    seen.add(pair);

    const style = (edge.attrs.style ?? "").toLowerCase();
    const width = Number(edge.attrs.penwidth ?? 1);
    const stroke: EdgeStroke = /\b(dashed|dotted)\b/.test(style)
      ? "dotted"
      : /\bbold\b/.test(style) || width >= 3
        ? "thick"
        : "normal";

    const dir = (edge.attrs.dir ?? (parsed.directed ? "forward" : "none")).toLowerCase();
    const head = (edge.attrs.arrowhead ?? "normal").toLowerCase();
    const arrow: ArrowType =
      dir === "none" || head === "none"
        ? "arrow_open"
        : head === "odot" || head === "dot"
          ? "arrow_circle"
          : head === "tee"
            ? "arrow_cross"
            : "arrow_point";
    const both = dir === "both" && arrow !== "arrow_open";

    edges.push({
      id: `e${edges.length}_${source}_${target}`,
      source,
      target,
      data: {
        label: labelText(edge.attrs.label ?? edge.attrs.xlabel ?? ""),
        stroke,
        arrow,
        ...(both ? { both: true } : {}),
      },
    });
  }

  const rankdir = (parsed.graphAttrs.rankdir ?? "TB").toUpperCase();
  const direction = DIRECTION[rankdir] ?? "TB";
  const body = serializeFlowchart(direction, nodes, edges);

  // Only when every node has one: a half-placed graph is worse than a laid
  // out one, because the placed half pins the layout the rest works around.
  const placed = readPositions(dotNodes);
  const positions: PositionMap = {};
  if (placed) {
    for (const [name, point] of Object.entries(placed)) {
      const id = idOf.get(name);
      if (id) positions[id] = point;
    }
  }

  const trailer = Object.keys(positions).length ? `${positionsLine(positions)}\n` : "";
  return { code: `${body}${trailer}`, nodes: nodes.length, edges: edges.length, dropped };
}
