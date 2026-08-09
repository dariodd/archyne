/**
 * Reading SQL DDL into a Mermaid ER diagram.
 *
 * A schema is already an ER diagram; it is just written down as `CREATE
 * TABLE`. Tables are entities, columns are attributes, and a foreign key is a
 * relationship with a cardinality that can be read off the constraints rather
 * than guessed: the child end is *many* unless the column is unique, the
 * parent end is *one* unless the column is nullable, and the relationship is
 * identifying when the key is part of the child's own primary key.
 *
 * Deliberately dialect-agnostic and deliberately shallow. It reads the parts
 * of the language that describe *shape* — tables, columns, types, keys,
 * references, comments — and steps over everything about behaviour and
 * storage. Views, triggers, functions, grants, indexes, partitioning and
 * `CHECK` conditions have no place on an ER diagram and are skipped without
 * complaint, which is what lets a whole `pg_dump` be opened rather than a
 * hand-trimmed excerpt.
 */
import type { AnyNode, EntityAttr, EntityNode, ErCard, FlowEdge } from "./types";
import { serializeEr } from "./kinds/er";
import { idFactory } from "./importShared";

export interface SqlImport {
  code: string;
  /** Tables read. */
  nodes: number;
  /** Foreign keys read. */
  edges: number;
  /** Foreign keys naming a table that is not in the file. */
  dropped: number;
}

/* ---------- lexing helpers ---------- */

/**
 * Strip comments, then split into statements on the semicolons that are not
 * inside a string, an identifier or a bracket.
 *
 * Doing this with `split(";")` is the classic way to break on a default value
 * of `';'` or a comment containing one.
 */
function statements(sql: string): string[] {
  const out: string[] = [];
  let current = "";
  let depth = 0;
  let at = 0;

  while (at < sql.length) {
    const c = sql[at];
    const rest = sql.slice(at, at + 2);

    if (rest === "--" || c === "#") {
      const end = sql.indexOf("\n", at);
      at = end < 0 ? sql.length : end;
      continue;
    }
    if (rest === "/*") {
      const end = sql.indexOf("*/", at + 2);
      at = end < 0 ? sql.length : end + 2;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      const quote = c;
      let text = c;
      at++;
      while (at < sql.length) {
        // A doubled quote is an escaped one and does not close the literal.
        if (sql[at] === quote && sql[at + 1] === quote) {
          text += quote + quote;
          at += 2;
          continue;
        }
        if (sql[at] === quote) break;
        if (sql[at] === "\\" && quote === "'") {
          text += sql.slice(at, at + 2);
          at += 2;
          continue;
        }
        text += sql[at++];
      }
      current += `${text}${quote}`;
      at++;
      continue;
    }
    if (c === "(" || c === "[") depth++;
    if (c === ")" || c === "]") depth = Math.max(0, depth - 1);
    if (c === ";" && depth === 0) {
      out.push(current);
      current = "";
      at++;
      continue;
    }
    current += c;
    at++;
  }
  out.push(current);
  return out.map((s) => s.trim()).filter(Boolean);
}

/** Split a comma-separated list, ignoring commas inside brackets or strings. */
function topLevelCommas(body: string): string[] {
  const out: string[] = [];
  let current = "";
  let depth = 0;
  let quote = "";

  for (let at = 0; at < body.length; at++) {
    const c = body[at];
    if (quote) {
      current += c;
      if (c === quote) quote = "";
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      quote = c;
      current += c;
      continue;
    }
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === "," && depth === 0) {
      out.push(current.trim());
      current = "";
      continue;
    }
    current += c;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/** The contents of the outermost bracketed group, or null. */
function parens(text: string): string | null {
  const open = text.indexOf("(");
  if (open < 0) return null;
  let depth = 0;
  for (let at = open; at < text.length; at++) {
    if (text[at] === "(") depth++;
    else if (text[at] === ")" && --depth === 0) return text.slice(open + 1, at);
  }
  return null;
}

/**
 * Strip `"`, `` ` ``, `[]` quoting and any `schema.` qualifier.
 *
 * The qualifier has to be split off before the quotes come off, not after:
 * `"public"."orders"` is two quoted parts, and treating it as one would
 * either keep the quotes or cut a name that legitimately contains a dot.
 */
function bareName(raw: string): string {
  const parts: string[] = [];
  let current = "";
  let quote = "";

  for (const c of raw.trim()) {
    if (quote) {
      current += c;
      if (c === (quote === "[" ? "]" : quote)) quote = "";
      continue;
    }
    if (c === '"' || c === "`" || c === "[") {
      quote = c;
      current += c;
      continue;
    }
    if (c === ".") {
      parts.push(current);
      current = "";
      continue;
    }
    current += c;
  }
  parts.push(current);

  return (parts[parts.length - 1] ?? "")
    .trim()
    .replace(/^\[(.*)\]$/s, "$1")
    .replace(/^"(.*)"$/s, "$1")
    .replace(/^`(.*)`$/s, "$1")
    .replace(/""/g, '"');
}

/** The first identifier in `text`, honouring every quoting style. */
function firstIdentifier(text: string): { name: string; rest: string } | null {
  const match =
    /^\s*(\[[^\]]*\]|"(?:[^"]|"")*"|`[^`]*`|[A-Za-z_][\w$]*)((?:\s*\.\s*(?:\[[^\]]*\]|"(?:[^"]|"")*"|`[^`]*`|[A-Za-z_][\w$]*))*)/.exec(
      text,
    );
  if (!match) return null;
  return {
    name: bareName(match[1] + (match[2] ?? "")),
    rest: text.slice(match[0].length),
  };
}

/* ---------- the schema ---------- */

interface Column {
  name: string;
  type: string;
  primary: boolean;
  unique: boolean;
  notNull: boolean;
  comment: string;
}

interface ForeignKey {
  column: string;
  table: string;
}

interface Table {
  name: string;
  columns: Column[];
  keys: ForeignKey[];
}

/** Words that end the type and begin the constraints on a column. */
const CONSTRAINT_START =
  /\b(PRIMARY\s+KEY|NOT\s+NULL|NULL|UNIQUE|REFERENCES|DEFAULT|CHECK|GENERATED|AUTO_INCREMENT|AUTOINCREMENT|IDENTITY|COLLATE|COMMENT|CONSTRAINT|SRID|STORAGE|ENCODE|COMPRESSION)\b/i;

/** Table-level entries in the body of a `CREATE TABLE`, rather than columns. */
const TABLE_LEVEL =
  /^\s*(CONSTRAINT\b|PRIMARY\s+KEY\b|FOREIGN\s+KEY\b|UNIQUE\b|CHECK\b|EXCLUDE\b|KEY\b|INDEX\b|FULLTEXT\b|SPATIAL\b|PERIOD\b)/i;

/** `REFERENCES other(col)` — the target table is all this needs. */
function referencedTable(text: string): string | null {
  const match = /\bREFERENCES\s+([^\s(]+)/i.exec(text);
  return match ? bareName(match[1]) : null;
}

function readColumn(entry: string): Column | null {
  const first = firstIdentifier(entry);
  if (!first) return null;

  const tail = first.rest;
  const cut = CONSTRAINT_START.exec(tail);
  const rawType = (cut ? tail.slice(0, cut.index) : tail).trim();
  const constraints = cut ? tail.slice(cut.index) : "";

  const comment = /\bCOMMENT\s+'((?:[^']|'')*)'/i.exec(constraints);
  return {
    name: first.name,
    // Mermaid's attribute type is one token: `character varying(255)` has to
    // lose its space or the parser reads a second attribute. Spaces around
    // the punctuation of `NUMERIC(10, 2)` simply go, rather than becoming
    // underscores in the middle of a number.
    type:
      rawType
        .replace(/\s+/g, " ")
        .replace(/\s*([(),])\s*/g, "$1")
        .trim()
        .replace(/\s+/g, "_")
        .replace(/[^\w()[\],]/g, "") || "unknown",
    primary: /\bPRIMARY\s+KEY\b/i.test(constraints),
    unique: /\bUNIQUE\b/i.test(constraints),
    notNull: /\bNOT\s+NULL\b/i.test(constraints) || /\bPRIMARY\s+KEY\b/i.test(constraints),
    comment: comment ? comment[1].replace(/''/g, "'") : "",
  };
}

/** `CREATE TABLE name ( … )`, or null when the statement is something else. */
function readCreateTable(statement: string): Table | null {
  const head =
    /^\s*CREATE\s+(?:GLOBAL\s+|LOCAL\s+|TEMP\w*\s+|UNLOGGED\s+|EXTERNAL\s+|VIRTUAL\s+)*TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?/i.exec(
      statement,
    );
  if (!head) return null;
  const named = firstIdentifier(statement.slice(head[0].length));
  if (!named) return null;

  const body = parens(named.rest);
  if (body === null) return null; // `CREATE TABLE x AS SELECT …` and friends

  const table: Table = { name: named.name, columns: [], keys: [] };
  const byName = new Map<string, Column>();

  for (const entry of topLevelCommas(body)) {
    if (!TABLE_LEVEL.test(entry)) {
      const column = readColumn(entry);
      if (!column) continue;
      table.columns.push(column);
      byName.set(column.name.toLowerCase(), column);

      const target = referencedTable(entry);
      if (target) table.keys.push({ column: column.name, table: target });
      continue;
    }

    // A named constraint is the same clause with `CONSTRAINT x` in front.
    const clause = entry.replace(
      /^\s*CONSTRAINT\s+(?:\[[^\]]*\]|"[^"]*"|`[^`]*`|[\w$]+)\s*/i,
      "",
    );
    const columns = (parens(clause) ?? "").split(",").map((c) => bareName(c));

    if (/^\s*PRIMARY\s+KEY\b/i.test(clause)) {
      for (const name of columns) {
        const column = byName.get(name.toLowerCase());
        if (column) {
          column.primary = true;
          column.notNull = true;
        }
      }
    } else if (/^\s*UNIQUE\b/i.test(clause)) {
      // Only a single-column unique constraint says anything about one row;
      // a composite one does not make either column unique.
      if (columns.length === 1) {
        const column = byName.get(columns[0].toLowerCase());
        if (column) column.unique = true;
      }
    } else if (/^\s*FOREIGN\s+KEY\b/i.test(clause)) {
      const target = referencedTable(clause);
      if (target && columns[0]) table.keys.push({ column: columns[0], table: target });
    }
  }
  return table;
}

/**
 * `ALTER TABLE t ADD CONSTRAINT … ` — where a dump puts every constraint.
 *
 * `pg_dump` writes each table bare and then adds its keys afterwards, so a
 * reader that only looks inside `CREATE TABLE` finds a schema with no primary
 * keys, no unique columns and no relationships at all.
 */
function readAlter(
  statement: string,
): { table: string; key?: ForeignKey; primary?: string[]; unique?: string[] } | null {
  const head = /^\s*ALTER\s+TABLE\s+(?:ONLY\s+|IF\s+EXISTS\s+)*/i.exec(statement);
  if (!head) return null;
  const named = firstIdentifier(statement.slice(head[0].length));
  if (!named) return null;

  const at = named.rest.search(/\b(FOREIGN\s+KEY|PRIMARY\s+KEY|UNIQUE)\b/i);
  if (at < 0) return null;
  const clause = named.rest.slice(at);
  const columns = (parens(clause) ?? "")
    .split(",")
    .map((c) => bareName(c))
    .filter(Boolean);

  if (/^FOREIGN\s+KEY/i.test(clause)) {
    const target = referencedTable(clause);
    if (!target || !columns[0]) return null;
    return { table: named.name, key: { column: columns[0], table: target } };
  }
  if (/^PRIMARY\s+KEY/i.test(clause)) return { table: named.name, primary: columns };
  // As inside `CREATE TABLE`: only a single-column unique says anything
  // about one row.
  return columns.length === 1 ? { table: named.name, unique: columns } : null;
}

/** `COMMENT ON COLUMN t.c IS 'text'` — how Postgres documents a schema. */
function readColumnComment(
  statement: string,
): { table: string; column: string; text: string } | null {
  const match = /^\s*COMMENT\s+ON\s+COLUMN\s+(\S+?)\s+IS\s+'((?:[^']|'')*)'/i.exec(statement);
  if (!match) return null;
  const parts = match[1].split(".");
  if (parts.length < 2) return null;
  return {
    table: bareName(parts[parts.length - 2]),
    column: bareName(parts[parts.length - 1]),
    text: match[2].replace(/''/g, "'"),
  };
}

/* ---------- the conversion ---------- */

/** Read SQL DDL. Throws when there is no table in it. */
export function sqlToMermaid(sql: string): SqlImport {
  const tables: Table[] = [];
  const byName = new Map<string, Table>();
  const comments: Array<{ table: string; column: string; text: string }> = [];

  for (const statement of statements(sql)) {
    const created = readCreateTable(statement);
    if (created) {
      tables.push(created);
      byName.set(created.name.toLowerCase(), created);
      continue;
    }
    const altered = readAlter(statement);
    if (altered) {
      const table = byName.get(altered.table.toLowerCase());
      if (!table) continue;
      const find = (name: string) =>
        table.columns.find((c) => c.name.toLowerCase() === name.toLowerCase());

      if (altered.key) table.keys.push(altered.key);
      for (const name of altered.primary ?? []) {
        const column = find(name);
        if (column) {
          column.primary = true;
          column.notNull = true;
        }
      }
      for (const name of altered.unique ?? []) {
        const column = find(name);
        if (column) column.unique = true;
      }
      continue;
    }
    const comment = readColumnComment(statement);
    if (comment) comments.push(comment);
  }

  if (tables.length === 0) throw new Error("no CREATE TABLE statement in this file");

  for (const { table, column, text } of comments) {
    const found = byName
      .get(table.toLowerCase())
      ?.columns.find((c) => c.name.toLowerCase() === column.toLowerCase());
    if (found) found.comment = text;
  }

  const nextId = idFactory();
  const idOf = new Map<string, string>();
  const nodes: AnyNode[] = tables.map((table, index) => {
    const id = nextId(table.name, `t${index + 1}`);
    idOf.set(table.name.toLowerCase(), id);
    const foreign = new Set(table.keys.map((k) => k.column.toLowerCase()));

    const attributes: EntityAttr[] = table.columns.map((column) => {
      const keys: string[] = [];
      if (column.primary) keys.push("PK");
      if (foreign.has(column.name.toLowerCase())) keys.push("FK");
      // Mermaid has one more marker, and a column that is neither the primary
      // key nor a foreign one but is still unique is worth showing as such.
      if (column.unique && !column.primary) keys.push("UK");
      return { type: column.type, name: column.name, keys, comment: column.comment };
    });

    const node: EntityNode = {
      id,
      type: "entity",
      position: { x: 0, y: 0 },
      data: { label: table.name, attributes, direction: "TB" },
    };
    return node;
  });

  const edges: FlowEdge[] = [];
  let dropped = 0;
  for (const table of tables) {
    const child = idOf.get(table.name.toLowerCase());
    for (const key of table.keys) {
      const parent = idOf.get(key.table.toLowerCase());
      // A key pointing outside the file — a schema split across dumps, or a
      // table filtered out of one. There is no entity to draw it to.
      if (!child || !parent) {
        dropped++;
        continue;
      }
      const column = table.columns.find(
        (c) => c.name.toLowerCase() === key.column.toLowerCase(),
      );

      // The child end: one row unless the key column may repeat.
      const cardA: ErCard = column?.unique || column?.primary ? "ZERO_OR_ONE" : "ZERO_OR_MORE";
      // The parent end: exactly one unless the key may be absent.
      const cardB: ErCard = column?.notNull ? "ONLY_ONE" : "ZERO_OR_ONE";

      edges.push({
        id: `e${edges.length}_${parent}_${child}`,
        source: parent,
        target: child,
        data: {
          label: key.column,
          er: {
            cardA,
            cardB,
            // A key that is part of the child's own primary key makes the
            // child depend on the parent for its identity.
            identifying: !!column?.primary,
          },
        },
      });
    }
  }

  return {
    code: serializeEr("TB", nodes, edges),
    nodes: nodes.length,
    edges: edges.length,
    dropped,
  };
}
