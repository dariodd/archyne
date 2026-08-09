import { describe, expect, it } from "vitest";
import { sqlToMermaid } from "./fromSql";
import { parseDiagram } from "./diagram";

/** The attribute lines of one entity block. */
function attributesOf(code: string, entity: string): string[] {
  const lines = code.split("\n");
  const start = lines.findIndex((l) => l.trim().startsWith(`${entity} {`));
  if (start < 0) throw new Error(`no entity ${entity} in\n${code}`);
  const end = lines.findIndex((l, i) => i > start && l.trim() === "}");
  return lines.slice(start + 1, end).map((l) => l.trim());
}

const relationsOf = (code: string) =>
  code
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.includes(" : "));

describe("tables and columns", () => {
  it("reads the smallest schema there is", () => {
    const { code, nodes } = sqlToMermaid("CREATE TABLE users (id INT);");
    expect(nodes).toBe(1);
    expect(code).toContain("erDiagram");
    expect(attributesOf(code, "users")).toEqual(["INT id"]);
  });

  it("keeps a type that is more than one word in one piece", () => {
    // `character varying(255) name` would otherwise read as two attributes.
    const { code } = sqlToMermaid("CREATE TABLE t (name character varying(255));");
    expect(attributesOf(code, "t")).toEqual(["character_varying(255) name"]);
  });

  it("marks the primary key, declared either way", () => {
    const inline = sqlToMermaid("CREATE TABLE t (id INT PRIMARY KEY);");
    const separate = sqlToMermaid("CREATE TABLE t (id INT, PRIMARY KEY (id));");
    expect(attributesOf(inline.code, "t")).toEqual(["INT id PK"]);
    expect(attributesOf(separate.code, "t")).toEqual(["INT id PK"]);
  });

  it("marks a unique column, but not one of a composite unique", () => {
    const single = sqlToMermaid("CREATE TABLE t (a INT, UNIQUE (a));");
    const composite = sqlToMermaid("CREATE TABLE t (a INT, b INT, UNIQUE (a, b));");
    expect(attributesOf(single.code, "t")).toEqual(["INT a UK"]);
    expect(attributesOf(composite.code, "t")).toEqual(["INT a", "INT b"]);
  });

  it("reads a named constraint the same as an unnamed one", () => {
    const { code } = sqlToMermaid(
      "CREATE TABLE t (id INT, CONSTRAINT t_pkey PRIMARY KEY (id));",
    );
    expect(attributesOf(code, "t")).toEqual(["INT id PK"]);
  });

  it("takes the quoting off every dialect's identifiers", () => {
    const { code } = sqlToMermaid(
      'CREATE TABLE "public"."orders" ("id" INT, `qty` INT, [note] TEXT);',
    );
    expect(code).toContain("orders {");
    expect(attributesOf(code, "orders")).toEqual(["INT id", "INT qty", "TEXT note"]);
  });

  it("steps over everything that is not a table", () => {
    const sql = `
      CREATE SCHEMA app;
      CREATE TABLE t (id INT);
      CREATE INDEX t_idx ON t (id);
      CREATE VIEW v AS SELECT * FROM t;
      GRANT SELECT ON t TO reader;
      CREATE TABLE u AS SELECT * FROM t;
    `;
    const { nodes, code } = sqlToMermaid(sql);
    expect(nodes).toBe(1);
    expect(code).not.toContain("v {");
  });

  it("refuses a file with no table in it", () => {
    expect(() => sqlToMermaid("SELECT 1;")).toThrow(/no CREATE TABLE/);
  });
});

describe("the parts of the language that trip a splitter", () => {
  it("does not end a statement on a semicolon inside a string", () => {
    const { nodes, code } = sqlToMermaid(
      "CREATE TABLE t (a TEXT DEFAULT 'a;b', b INT); CREATE TABLE u (id INT);",
    );
    expect(nodes).toBe(2);
    expect(attributesOf(code, "t")).toEqual(["TEXT a", "INT b"]);
  });

  it("does not end one inside a comment", () => {
    const sql = `
      -- one; two;
      /* three; four; */
      CREATE TABLE t (id INT); # five;
    `;
    expect(sqlToMermaid(sql).nodes).toBe(1);
  });

  it("does not split a column list on a comma inside a type", () => {
    const { code } = sqlToMermaid("CREATE TABLE t (amount NUMERIC(10, 2), note TEXT);");
    expect(attributesOf(code, "t")).toEqual(["NUMERIC(10,2) amount", "TEXT note"]);
  });

  it("does not split on a comma inside a CHECK", () => {
    const { code } = sqlToMermaid(
      "CREATE TABLE t (state TEXT, CHECK (state IN ('a', 'b')), id INT);",
    );
    expect(attributesOf(code, "t")).toEqual(["TEXT state", "INT id"]);
  });

  it("reads a doubled quote as an escaped one", () => {
    const { code } = sqlToMermaid(
      "CREATE TABLE t (a INT COMMENT 'it''s here'); CREATE TABLE u (id INT);",
    );
    expect(attributesOf(code, "t")).toEqual(['INT a "it\'s here"']);
  });
});

describe("foreign keys become relationships", () => {
  const SCHEMA = `
    CREATE TABLE customers (id INT PRIMARY KEY, name TEXT);
    CREATE TABLE orders (
      id INT PRIMARY KEY,
      customer_id INT NOT NULL REFERENCES customers(id),
      total NUMERIC(10,2)
    );
  `;

  it("draws the parent to the child, one to many", () => {
    // Dashed, because an order has its own identity and merely points at a
    // customer — the crow's-foot meaning of a non-identifying relationship.
    // Only a key that is part of the child's own primary key draws solid.
    const { code, edges } = sqlToMermaid(SCHEMA);
    expect(edges).toBe(1);
    expect(relationsOf(code)).toEqual(['customers ||..o{ orders : "customer_id"']);
  });

  it("marks the key column FK on the child", () => {
    const { code } = sqlToMermaid(SCHEMA);
    expect(attributesOf(code, "orders")).toEqual([
      "INT id PK",
      "INT customer_id FK",
      "NUMERIC(10,2) total",
    ]);
  });

  it("reads a nullable key as an optional parent", () => {
    const sql = `
      CREATE TABLE a (id INT PRIMARY KEY);
      CREATE TABLE b (a_id INT REFERENCES a(id));
    `;
    expect(relationsOf(sqlToMermaid(sql).code)).toEqual(['a |o..o{ b : "a_id"']);
  });

  it("reads a unique key as one to one", () => {
    const sql = `
      CREATE TABLE a (id INT PRIMARY KEY);
      CREATE TABLE b (a_id INT NOT NULL UNIQUE REFERENCES a(id));
    `;
    expect(relationsOf(sqlToMermaid(sql).code)).toEqual(['a ||..o| b : "a_id"']);
  });

  it("reads a key that is also the primary key as identifying", () => {
    // The child cannot exist without the parent, which is what the solid
    // line in an ER diagram means.
    const sql = `
      CREATE TABLE a (id INT PRIMARY KEY);
      CREATE TABLE b (a_id INT PRIMARY KEY REFERENCES a(id));
    `;
    expect(relationsOf(sqlToMermaid(sql).code)[0]).toContain("--");
    // …and a plain one is dotted.
    const weak = `
      CREATE TABLE a (id INT PRIMARY KEY);
      CREATE TABLE b (id INT PRIMARY KEY, a_id INT NOT NULL REFERENCES a(id));
    `;
    expect(relationsOf(sqlToMermaid(weak).code)[0]).toContain("..");
  });

  it("reads a table-level FOREIGN KEY clause", () => {
    const sql = `
      CREATE TABLE a (id INT PRIMARY KEY);
      CREATE TABLE b (a_id INT NOT NULL, FOREIGN KEY (a_id) REFERENCES a (id));
    `;
    expect(relationsOf(sqlToMermaid(sql).code)).toEqual(['a ||..o{ b : "a_id"']);
  });

  it("reads the ALTER TABLE form a dump writes", () => {
    // pg_dump puts every constraint after every table, so a converter that
    // only looks inside CREATE TABLE finds no relationships at all.
    const sql = `
      CREATE TABLE public.customers (id INT NOT NULL);
      CREATE TABLE public.orders (id INT NOT NULL, customer_id INT NOT NULL);
      ALTER TABLE ONLY public.orders
        ADD CONSTRAINT orders_customer_fkey FOREIGN KEY (customer_id)
        REFERENCES public.customers(id) ON DELETE CASCADE;
    `;
    const { code, edges } = sqlToMermaid(sql);
    expect(edges).toBe(1);
    expect(relationsOf(code)).toEqual(['customers ||..o{ orders : "customer_id"']);
  });

  it("reads a primary and a unique key added by ALTER TABLE", () => {
    // `pg_dump` writes every table bare and adds its keys afterwards, so
    // reading only inside CREATE TABLE finds a schema with no keys at all.
    const sql = `
      CREATE TABLE t (id bigint NOT NULL, email text NOT NULL);
      ALTER TABLE ONLY t ADD CONSTRAINT t_pkey PRIMARY KEY (id);
      ALTER TABLE ONLY t ADD CONSTRAINT t_email_key UNIQUE (email);
    `;
    expect(attributesOf(sqlToMermaid(sql).code, "t")).toEqual([
      "bigint id PK",
      "text email UK",
    ]);
  });

  it("leaves out a key pointing at a table that is not here", () => {
    const sql = `
      CREATE TABLE b (a_id INT NOT NULL REFERENCES elsewhere(id));
    `;
    const { edges, dropped } = sqlToMermaid(sql);
    expect([edges, dropped]).toEqual([0, 1]);
  });
});

describe("comments", () => {
  it("reads the MySQL inline form", () => {
    const { code } = sqlToMermaid("CREATE TABLE t (id INT COMMENT 'the key');");
    expect(attributesOf(code, "t")).toEqual(['INT id "the key"']);
  });

  it("reads the Postgres statement form", () => {
    const sql = `
      CREATE TABLE t (id INT);
      COMMENT ON COLUMN public.t.id IS 'the key';
    `;
    expect(attributesOf(sqlToMermaid(sql).code, "t")).toEqual(['INT id "the key"']);
  });
});

describe("what comes out is a Mermaid document", () => {
  it("parses back as an ER diagram, entities and relationships intact", async () => {
    const sql = `
      CREATE TABLE "user" (
        id BIGSERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );
      CREATE TABLE "order" (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        total NUMERIC(10,2) NOT NULL
      );
      CREATE TABLE order_line (
        order_id BIGINT NOT NULL,
        sku TEXT NOT NULL,
        PRIMARY KEY (order_id, sku),
        FOREIGN KEY (order_id) REFERENCES "order" (id)
      );
      ALTER TABLE ONLY "order"
        ADD CONSTRAINT order_user_fkey FOREIGN KEY (user_id) REFERENCES "user"(id);
    `;

    const graph = await parseDiagram(sqlToMermaid(sql).code);
    expect(graph.kind).toBe("er");
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(["order", "order_line", "user"]);
    expect(graph.edges.map((e) => `${e.source}>${e.target}`).sort()).toEqual([
      "order>order_line",
      "user>order",
    ]);

    const order = graph.nodes.find((n) => n.id === "order");
    expect(order?.type).toBe("entity");
    if (order?.type === "entity") {
      expect(
        order.data.attributes.map((a) => `${a.type} ${a.name} ${a.keys.join(",")}`),
      ).toEqual(["BIGSERIAL id PK", "BIGINT user_id FK", "NUMERIC(10,2) total "]);
    }
  });
});
