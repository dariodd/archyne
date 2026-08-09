/**
 * Reading a PlantUML **sequence diagram** into a Mermaid one.
 *
 * Scoped to one diagram family on purpose. PlantUML is not one language but a
 * dozen sharing a pair of `@start`/`@end` markers, and its sequence grammar is
 * the one that lines up with Mermaid closely enough to convert without
 * guessing. A class or state or deployment diagram is refused by name rather
 * than half-converted into something that has to be checked line by line —
 * a converter you cannot trust costs more than no converter at all.
 *
 * Within sequence diagrams, what comes across is participants and their kind,
 * messages and their arrow styles, activation, notes, and the
 * `alt`/`else`/`opt`/`loop`/`par`/`break`/`critical` blocks. What does not:
 * styling (`skinparam`, colours, stereotypes), `!include` and the
 * preprocessor, `box` participant grouping, dividers and delays — Mermaid has
 * nowhere to put them, so they are stepped over and counted.
 */
import type { AnyNode, FlowEdge, ParticipantNode, SeqItem, SeqOp } from "./types";
import { serializeSequence } from "./kinds/sequence";
import { idFactory } from "./importShared";

export interface PlantumlImport {
  code: string;
  /** Participants. */
  nodes: number;
  /** Messages. */
  edges: number;
  /** Lines with no Mermaid equivalent. */
  dropped: number;
}

/** How a participant is declared. Only two of these survive into Mermaid. */
const PARTICIPANT_WORDS =
  /^(participant|actor|boundary|control|entity|database|collections|queue)\b/i;

/** Statements that exist only to style or configure, and are simply skipped. */
const IGNORED =
  /^(@startuml|@enduml|@startmindmap|title\b|header\b|footer\b|caption\b|legend\b|end\s+legend\b|skinparam\b|!|hide\b|show\b|scale\b|left\s+header\b|right\s+header\b|center\b|top\s+to\s+bottom\b|autoactivate\b|box\b|end\s+box\b|newpage\b|mainframe\b)/i;

/**
 * The Mermaid operator for a PlantUML arrow.
 *
 * The one that matters: PlantUML draws `->` as a line *with* a filled head,
 * while Mermaid spells that `->>` and reserves `->` for a line with no head
 * at all. Confusing the pair silently removes every arrowhead in the diagram.
 * Only a bare `-` or `--`, with nothing on either end, is truly headless.
 */
function arrowOp(raw: string, dotted: boolean): SeqOp {
  // A circle end (`o->`) has no Mermaid spelling and does not change the line.
  const body = raw.replace(/\s+/g, "").replace(/^o|o$/g, "");
  if (body.startsWith("x") || body.endsWith("x")) return dotted ? "--x" : "-x";

  // `<` is a head on the left; `\` and `/` are the half-arrow heads.
  const reversed = body.startsWith("<");
  const headless = !reversed && !/[>\\/]/.test(body);
  if (headless) return dotted ? "-->" : "->";
  return dotted ? "-->>" : "->>";
}

/** Strip quotes, a trailing `#colour`, and any `<<stereotype>>`. */
function cleanName(raw: string): string {
  return raw
    .trim()
    .replace(/\s*<<[^>]*>>\s*/g, " ")
    .replace(/\s+#\w+.*$/, "")
    .replace(/^"(.*)"$/s, "$1")
    .trim();
}

/**
 * The blocks Mermaid has, and what PlantUML calls them.
 *
 * `group` has no Mermaid counterpart; `opt` is the closest thing — a labelled
 * frame around a stretch of the diagram — so that is what it becomes.
 */
const BLOCKS: Record<string, string> = {
  alt: "alt",
  opt: "opt",
  loop: "loop",
  par: "par",
  break: "break",
  critical: "critical",
  group: "opt",
};

/** Which PlantUML family a file is, read off the statements it uses. */
export type PlantumlFamily = "sequence" | "class" | "state";

/**
 * The families that can be converted, and the marks that identify them.
 *
 * Positive signals only: a `class` keyword makes it a class diagram whatever
 * else is in the file. Sequence is the fallback, because its own giveaway — a
 * message arrow — is the least distinctive thing in the language.
 */
const FAMILY = [
  [/^\s*(abstract\s+class|abstract|class|interface|enum|struct|protocol)\s+\w/im, "class"],
  [/^\s*state\s+\w/im, "state"],
  [/^\s*\[\*\]\s*-{1,}>/m, "state"],
  [/-{1,}>\s*\[\*\]\s*$/m, "state"],
] as const satisfies ReadonlyArray<readonly [RegExp, PlantumlFamily]>;

/** Families with no Mermaid counterpart, refused by name. */
const UNSUPPORTED: Array<[RegExp, string]> = [
  [/^@start(mindmap|gantt|salt|wbs|json|yaml|ditaa|dot|chen|ebnf|regex)\b/im, "that kind of"],
  [/^\s*(usecase|rectangle|component|node|folder|cloud|artifact)\s+\w/im, "a component"],
  [/^\s*object\s+\w/im, "an object"],
];

/** Which family this source is. Throws for one Archyne cannot convert. */
export function plantumlFamily(source: string): PlantumlFamily {
  const body = source.replace(/\/'[\s\S]*?'\//g, "");
  for (const [pattern, family] of FAMILY) {
    if (pattern.test(body)) return family;
  }
  for (const [pattern, what] of UNSUPPORTED) {
    if (pattern.test(body)) {
      throw new Error(
        `this is ${what} diagram — Archyne reads PlantUML sequence, class and state diagrams`,
      );
    }
  }
  return "sequence";
}

/**
 * Read a PlantUML sequence diagram.
 *
 * Callers go through `plantumlFamily` first; this assumes the answer was
 * "sequence", and says so plainly if the file holds no messages after all.
 */
export function plantumlToMermaid(source: string): PlantumlImport {
  const body = source.replace(/\/'[\s\S]*?'\//g, ""); // /' block comment '/
  const nextId = idFactory();
  const idOf = new Map<string, string>();
  const order: string[] = [];
  const participants = new Map<string, ParticipantNode>();
  const edges: FlowEdge[] = [];
  const items: SeqItem[] = [];
  let dropped = 0;

  /** Find or create a participant, keeping declaration order. */
  const participant = (rawName: string, ptype?: "participant" | "actor"): string => {
    const name = cleanName(rawName);
    const known = idOf.get(name);
    if (known) {
      // A later explicit declaration can still say it is an actor.
      if (ptype) {
        const node = participants.get(known);
        if (node) node.data.ptype = ptype;
      }
      return known;
    }
    const id = nextId(name, `p${order.length + 1}`);
    idOf.set(name, id);
    order.push(id);
    participants.set(id, {
      id,
      type: "participant",
      position: { x: order.length * 160, y: 0 },
      data: { label: name, ptype: ptype ?? "participant", direction: "TB" },
    });
    return id;
  };

  const lines = body.split("\n");
  let pendingNote: {
    placement: "left" | "right" | "over";
    a: string;
    b?: string;
    text: string[];
  } | null = null;

  for (const raw of lines) {
    const line = raw.replace(/'.*$/, "").trim(); // ' to end of line is a comment
    if (!line) continue;

    // A note opened with no text runs until `end note`.
    if (pendingNote) {
      if (/^end\s*[hr]?note$/i.test(line)) {
        items.push({
          kind: "note",
          placement: pendingNote.placement,
          a: pendingNote.a,
          ...(pendingNote.b ? { b: pendingNote.b } : {}),
          text: pendingNote.text.join(" ").trim() || "note",
        });
        pendingNote = null;
        continue;
      }
      pendingNote.text.push(line);
      continue;
    }

    if (IGNORED.test(line)) continue;

    const declared = PARTICIPANT_WORDS.exec(line);
    if (declared) {
      const rest = line.slice(declared[0].length).trim();
      // `participant "Long name" as X` and `participant X as "Long name"`
      // both occur; the alias is whichever side the `as` puts second.
      const aliased = /^(.*?)\s+as\s+(.*)$/i.exec(rest);
      const name = aliased ? cleanName(aliased[1]) : cleanName(rest);
      const alias = aliased ? cleanName(aliased[2]) : "";
      if (!name && !alias) continue;

      const kind = declared[1].toLowerCase() === "actor" ? "actor" : "participant";
      // The label is the longer, human side; the alias is what messages use.
      const label = alias && alias.length > name.length ? alias : name;
      const key = alias && alias.length > name.length ? name : alias || name;
      const id = participant(label, kind);
      if (key) idOf.set(key, id);
      continue;
    }

    // Notes, one line or opened for several.
    const note = /^([hr]?note)\s+(left|right|over)\b(.*)$/i.exec(line);
    if (note) {
      const placement = note[2].toLowerCase() as "left" | "right" | "over";
      let rest = note[3].trim().replace(/^of\s+/i, "");
      const colon = rest.indexOf(":");
      const targets = (colon >= 0 ? rest.slice(0, colon) : rest)
        .split(",")
        .map((t) => cleanName(t))
        .filter(Boolean);
      const text = colon >= 0 ? rest.slice(colon + 1).trim() : "";
      const a = participant(targets[0] ?? order[0] ?? "note");
      const b = targets[1] ? participant(targets[1]) : undefined;

      if (text) {
        items.push({ kind: "note", placement, a, ...(b ? { b } : {}), text });
      } else {
        pendingNote = { placement, a, ...(b ? { b } : {}), text: [] };
      }
      rest = "";
      continue;
    }

    if (/^autonumber\b/i.test(line)) {
      items.push({ kind: "autonumber" });
      continue;
    }
    const activate = /^(activate|deactivate)\s+(.+)$/i.exec(line);
    if (activate) {
      items.push({
        kind: "active",
        on: activate[1].toLowerCase() === "activate",
        actor: participant(activate[2]),
      });
      continue;
    }
    if (/^(end|end\s+(loop|alt|opt|par|group|critical|break))$/i.test(line)) {
      items.push({ kind: "end" });
      continue;
    }
    const divider = /^(else|and)\b(.*)$/i.exec(line);
    if (divider) {
      items.push({
        kind: "divider",
        op: divider[1].toLowerCase(),
        label: divider[2].trim(),
      });
      continue;
    }
    const block = /^(alt|opt|loop|par|break|critical|group)\b(.*)$/i.exec(line);
    if (block) {
      items.push({
        kind: "block",
        op: BLOCKS[block[1].toLowerCase()],
        label: block[2].trim(),
      });
      continue;
    }

    // `ref over a, b : text` is a labelled frame with no Mermaid equivalent;
    // as a note it at least keeps the words on the diagram.
    const ref = /^ref\s+over\s+([^:]+)(?::\s*(.*))?$/i.exec(line);
    if (ref) {
      const targets = ref[1]
        .split(",")
        .map((t) => cleanName(t))
        .filter(Boolean);
      const a = participant(targets[0] ?? order[0] ?? "ref");
      items.push({
        kind: "note",
        placement: "over",
        a,
        ...(targets[1] ? { b: participant(targets[1]) } : {}),
        text: (ref[2] ?? "ref").trim(),
      });
      continue;
    }

    // A message: two names either side of an arrow, then an optional label.
    const message =
      /^([^-<>]+?)\s*((?:<-{1,2}|-{1,2}>|<<-{1,2}|-{1,2}>>|-{1,2})[\\/x o]*>?[\\/x o]*)\s*([^:]+?)\s*(?::\s*(.*))?$/.exec(
        line,
      );
    if (message) {
      const arrow = message[2].trim();
      const reversed = arrow.startsWith("<");
      const dotted = arrow.includes("--");
      // `A <- B` reads right to left: the sender is on the right.
      const leftRaw = message[reversed ? 3 : 1];
      const rightRaw = message[reversed ? 1 : 3];

      // `A -> B ++` activates B; `-- ` deactivates the sender.
      const trailing = /\s(\+\+|--|\*\*|!!)\s*$/.exec(rightRaw);
      const from = participant(leftRaw.replace(/\s(\+\+|--|\*\*|!!)\s*$/, ""));
      const to = participant(rightRaw.replace(/\s(\+\+|--|\*\*|!!)\s*$/, ""));

      const edge: FlowEdge = {
        id: `m${edges.length}_${from}_${to}`,
        source: from,
        target: to,
        data: { label: (message[4] ?? "").trim(), seq: { op: arrowOp(arrow, dotted) } },
      };
      edges.push(edge);
      items.push({ kind: "message", edgeId: edge.id });
      if (trailing?.[1] === "++") items.push({ kind: "active", on: true, actor: to });
      if (trailing?.[1] === "--") items.push({ kind: "active", on: false, actor: from });
      continue;
    }

    // `return x` closes the current activation with a dotted reply, but only
    // a diagram using `++` shorthand knows who to reply to; without that the
    // words would go on the wrong arrow.
    dropped++;
  }

  if (edges.length === 0) {
    throw new Error("no messages found — only PlantUML sequence diagrams can be imported");
  }

  const nodes: AnyNode[] = order.map((id) => participants.get(id)!);
  return {
    code: serializeSequence(nodes, edges, items),
    nodes: nodes.length,
    edges: edges.length,
    dropped,
  };
}
