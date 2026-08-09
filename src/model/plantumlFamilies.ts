/**
 * The other two PlantUML families Archyne can read: class and state.
 *
 * These live apart from the sequence reader because they share nothing with
 * it but the `@start`/`@end` markers — different statements, different target
 * diagram, different model. What they do share is the shape of the job:
 * grammar to grammar, with no geometry on either side, which is why they are
 * worth converting at all.
 */
import type {
  AnyNode,
  ClassMarker,
  ClassNode,
  FlowEdge,
  GroupNode,
  StateNode,
  StateType,
} from "./types";
import { serializeClass } from "./kinds/cls";
import { serializeState } from "./kinds/state";
import { idFactory } from "./importShared";

export interface FamilyImport {
  code: string;
  nodes: number;
  edges: number;
  dropped: number;
}

/** Statements that only style or configure, and are stepped over. */
const IGNORED =
  /^(@start\w*|@end\w*|title\b|header\b|footer\b|caption\b|legend\b|end\s*legend\b|skinparam\b|!|hide\b|show\b|scale\b|left\s+to\s+right\b|top\s+to\s+bottom\b|together\b|newpage\b)/i;

/** Strip quotes, a `#colour`, and a `<<stereotype>>` that is not a keyword. */
function cleanName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+#\w+.*$/, "")
    .replace(/^"(.*)"$/s, "$1")
    .replace(/^'(.*)'$/s, "$1")
    .trim();
}

/** Lines with the comment syntaxes and blank lines already taken out. */
function statements(source: string): string[] {
  return source
    .replace(/\/'[\s\S]*?'\//g, "")
    .split("\n")
    .map((line) => line.replace(/'.*$/, "").trim())
    .filter((line) => line && !IGNORED.test(line));
}

/* ---------- class diagrams ---------- */

/** What each end of a PlantUML relation means in Mermaid's vocabulary. */
function classMarker(end: string): ClassMarker {
  if (end.includes("|>") || end.includes("<|")) return "extension";
  if (end.includes("*")) return "composition";
  if (end.includes("o")) return "aggregation";
  if (end.includes(">") || end.includes("<")) return "dependency";
  return "none";
}

/** `class`, `abstract class`, `interface`, `enum` … and what each annotates. */
const DECLARES =
  /^(abstract\s+class|abstract|class|interface|enum|entity|struct|protocol|annotation|exception|metaclass)\s+(.+)$/i;

const ANNOTATION: Record<string, string> = {
  interface: "interface",
  abstract: "abstract",
  "abstract class": "abstract",
  enum: "enumeration",
  annotation: "annotation",
  struct: "struct",
  exception: "exception",
};

/** Read a PlantUML class diagram. */
export function plantumlClassToMermaid(source: string): FamilyImport {
  const nextId = idFactory();
  const idOf = new Map<string, string>();
  const nodes: AnyNode[] = [];
  const edges: FlowEdge[] = [];
  let dropped = 0;

  const classes = new Map<string, ClassNode>();
  const packages: string[] = [];

  /** Find or create a class, keeping declaration order. */
  const cls = (rawName: string, annotation?: string): ClassNode => {
    // `Order as O` and a generic `List<T>` both turn up in a name position.
    const name = cleanName(rawName).replace(/\s+as\s+.*$/i, "");
    const bare = name.replace(/<[^>]*>/, "").trim();
    const known = idOf.get(bare);
    if (known) {
      const node = classes.get(known)!;
      if (annotation && !node.data.annotations.includes(annotation)) {
        node.data.annotations.push(annotation);
      }
      return node;
    }
    const id = nextId(bare, `c${classes.size + 1}`);
    idOf.set(bare, id);
    const generic = /<([^>]*)>/.exec(name)?.[1];
    const node: ClassNode = {
      id,
      type: "class",
      position: { x: 0, y: 0 },
      data: {
        label: bare,
        members: [],
        methods: [],
        annotations: annotation ? [annotation] : [],
        ...(generic ? { generic } : {}),
        direction: "TB",
      },
      ...(packages.length ? { parentId: packages[packages.length - 1] } : {}),
    };
    classes.set(id, node);
    nodes.push(node);
    return node;
  };

  let open: ClassNode | null = null;

  for (const line of statements(source)) {
    // Inside a `{ … }` body, every line is a member of the open class.
    if (open) {
      if (line === "}") {
        open = null;
        continue;
      }
      // `..`, `--` and `__` are separators inside a PlantUML class body.
      if (/^([._-])\1+.*$/.test(line)) continue;
      const member = line.replace(/^\{(static|abstract)\}\s*/i, (_m, kind: string) =>
        kind.toLowerCase() === "static" ? "" : "",
      );
      const suffix = /^\{static\}/i.test(line) ? "$" : /^\{abstract\}/i.test(line) ? "*" : "";
      if (member.includes("(")) open.data.methods.push(`${member}${suffix}`);
      else open.data.members.push(member);
      continue;
    }

    const pkg = /^(package|namespace|together)\s+(.+?)\s*\{$/i.exec(line);
    if (pkg) {
      const label = cleanName(pkg[2]).replace(/\s+<<.*$/, "");
      const id = nextId(label, `p${packages.length + 1}`);
      const group: GroupNode = {
        id,
        type: "group",
        position: { x: 0, y: 0 },
        data: { label, subgraphId: id },
        style: { width: 320, height: 220 },
      };
      nodes.push(group);
      packages.push(id);
      continue;
    }
    if (line === "}" && packages.length) {
      packages.pop();
      continue;
    }

    const declared = DECLARES.exec(line);
    if (declared) {
      const keyword = declared[1].toLowerCase().replace(/\s+/g, " ");
      const rest = declared[2].trim();
      const node = cls(rest.replace(/\s*\{$/, ""), ANNOTATION[keyword]);
      if (rest.endsWith("{")) open = node;
      continue;
    }

    // A relation: two names either side of a line made of the marker
    // characters. `..` anywhere in it means the line is dashed.
    const relation =
      /^(.+?)\s*(?:"([^"]*)"\s*)?([<>o*|.\\/#+^-]{2,})\s*(?:"([^"]*)"\s*)?(.+?)(?:\s*:\s*(.*))?$/.exec(
        line,
      );
    if (relation && /[-.]/.test(relation[3])) {
      const [, leftName, card1, op, card2, rightName, label] = relation;
      const middle = op.replace(/^[^-.]*/, "").replace(/[^-.]*$/, "");
      edges.push({
        id: `r${edges.length}`,
        source: cls(leftName).id,
        target: cls(rightName).id,
        data: {
          label: (label ?? "").trim(),
          cls: {
            left: classMarker(op.slice(0, 2)),
            right: classMarker(op.slice(-2)),
            dotted: middle.includes("."),
            ...(card1 ? { card1 } : {}),
            ...(card2 ? { card2 } : {}),
          },
        },
      });
      continue;
    }

    // `Order : +int id` — a member added from outside the body.
    const member = /^([^:]+?)\s*:\s*(.+)$/.exec(line);
    if (member && !/[<>|*]/.test(member[1])) {
      const node = cls(member[1]);
      if (member[2].includes("(")) node.data.methods.push(member[2].trim());
      else node.data.members.push(member[2].trim());
      continue;
    }

    dropped++;
  }

  if (nodes.length === 0) throw new Error("no classes found in this diagram");
  return {
    code: serializeClass("TB", nodes, edges),
    nodes: nodes.length,
    edges: edges.length,
    dropped,
  };
}

/* ---------- state diagrams ---------- */

const PSEUDO: Record<string, StateType> = {
  choice: "choice",
  fork: "fork",
  join: "join",
};

/** Read a PlantUML state diagram. */
export function plantumlStateToMermaid(source: string): FamilyImport {
  const nextId = idFactory();
  const idOf = new Map<string, string>();
  const nodes: AnyNode[] = [];
  const edges: FlowEdge[] = [];
  const composites: string[] = [];
  let dropped = 0;
  let terminals = 0;

  const parent = () => (composites.length ? composites[composites.length - 1] : undefined);

  const state = (rawName: string, type: StateType = "normal"): string => {
    // `[*]` is the start or the end depending on which side of the arrow it
    // is; each occurrence is its own node, as Mermaid draws them.
    if (rawName.trim() === "[*]") {
      const id = `terminal${++terminals}`;
      const node: StateNode = {
        id,
        type: "state",
        position: { x: 0, y: 0 },
        data: { label: id, stateType: type, direction: "TB" },
        ...(parent() ? { parentId: parent() } : {}),
      };
      nodes.push(node);
      return id;
    }

    const name = cleanName(rawName).replace(/\s+as\s+.*$/i, "");
    const known = idOf.get(name);
    if (known) return known;
    const id = nextId(name, `s${nodes.length + 1}`);
    idOf.set(name, id);
    const node: StateNode = {
      id,
      type: "state",
      position: { x: 0, y: 0 },
      data: { label: name, stateType: type, direction: "TB" },
      ...(parent() ? { parentId: parent() } : {}),
    };
    nodes.push(node);
    return id;
  };

  for (const line of statements(source)) {
    if (line === "}" && composites.length) {
      composites.pop();
      continue;
    }

    // `state Busy {` opens a composite; `state X <<choice>>` is a pseudostate.
    const declared = /^state\s+(.+)$/i.exec(line);
    if (declared) {
      const rest = declared[1].trim();
      if (rest.endsWith("{")) {
        const label = cleanName(rest.replace(/\s*\{$/, "")).replace(/\s+as\s+.*$/i, "");
        // A composite is usually named by a transition before it is opened —
        // `[*] --> Busy` then `state Busy { … }`. Reusing the id turns that
        // state *into* the container instead of leaving an orphan beside it.
        const existing = idOf.get(label);
        const id = existing ?? nextId(label, `g${nodes.length + 1}`);
        idOf.set(label, id);
        const group: GroupNode = {
          id,
          type: "group",
          position: { x: 0, y: 0 },
          data: { label, subgraphId: id },
          style: { width: 320, height: 220 },
          ...(parent() ? { parentId: parent() } : {}),
        };
        const at = nodes.findIndex((n) => n.id === id);
        if (at >= 0) nodes[at] = group;
        else nodes.push(group);
        composites.push(id);
        continue;
      }
      const stereotype = /<<\s*(\w+)\s*>>/.exec(rest)?.[1]?.toLowerCase();
      state(rest.replace(/<<[^>]*>>/, ""), (stereotype && PSEUDO[stereotype]) || "normal");
      continue;
    }

    // A transition, with an optional `: label`.
    const arrow =
      /^(.+?)\s*(-{1,}(?:\[[^\]]*\])?(?:down|up|left|right|d|u|l|r)?-*>)\s*([^:]+?)(?:\s*:\s*(.*))?$/i.exec(
        line,
      );
    if (arrow) {
      const [, from, , to, label] = arrow;
      // `[*] -->` starts; `--> [*]` ends. The same token, two meanings.
      const source = state(from, from.trim() === "[*]" ? "start" : "normal");
      const target = state(to, to.trim() === "[*]" ? "end" : "normal");
      edges.push({
        id: `t${edges.length}_${source}_${target}`,
        source,
        target,
        data: { label: (label ?? "").trim() },
      });
      continue;
    }

    // `Idle : waiting for work` is a description on the state.
    const described = /^([^:]+?)\s*:\s*(.*)$/.exec(line);
    if (described && !/[<>[\]]/.test(described[1])) {
      state(described[1]);
      continue;
    }

    dropped++;
  }

  if (edges.length === 0) throw new Error("no transitions found in this diagram");
  return {
    code: serializeState("TB", nodes, edges),
    nodes: nodes.length,
    edges: edges.length,
    dropped,
  };
}
