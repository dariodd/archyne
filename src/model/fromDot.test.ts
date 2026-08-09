import { describe, expect, it } from "vitest";
import terraformGraph from "../../tests/fixtures/terraform-graph.dot?raw";
import { dotToMermaid } from "./fromDot";
import { parseDiagram } from "./diagram";
import { readPositions } from "./positions";

/** The line declaring a node, e.g. `Check{"Valid?"}`. */
function lineFor(code: string, id: string): string {
  const line = code.split("\n").find((l) => l.trim().startsWith(id));
  if (!line) throw new Error(`no line for ${id} in\n${code}`);
  return line.trim();
}

const edgesOf = (code: string) =>
  code
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /\s<?(-{2,3}|-\.-|={2,3}|o-|x-)/.test(l) && !l.startsWith("style"));

describe("the shape of a DOT file", () => {
  it("reads the smallest graph there is", () => {
    const { code, nodes, edges } = dotToMermaid("digraph { a -> b }");
    expect(nodes).toBe(2);
    expect(edges).toBe(1);
    expect(code).toContain("flowchart TB");
    expect(code).toContain("a --> b");
  });

  it("reads a chain as the several edges it is", () => {
    const { code } = dotToMermaid("digraph { a -> b -> c }");
    expect(edgesOf(code)).toEqual(["a --> b", "b --> c"]);
  });

  it("fans out to a braced set of endpoints", () => {
    // `a -> {b c}` is the idiom every generated dependency graph uses.
    const { code } = dotToMermaid("digraph { a -> { b c } }");
    expect(edgesOf(code)).toEqual(["a --> b", "a --> c"]);
  });

  it("fans in from a braced set too", () => {
    const { code } = dotToMermaid("digraph { { a b } -> c }");
    expect(edgesOf(code)).toEqual(["a --> c", "b --> c"]);
  });

  it("draws an undirected graph without arrowheads", () => {
    const { code } = dotToMermaid("graph { a -- b }");
    expect(edgesOf(code)).toEqual(["a --- b"]);
  });

  it("honours `strict` by collapsing the repeat, without calling it a loss", () => {
    const { code, edges, dropped } = dotToMermaid("strict digraph { a -> b; a -> b }");
    expect(edges).toBe(1);
    expect(dropped).toBe(0);
    expect(edgesOf(code)).toEqual(["a --> b"]);
  });

  it("keeps both when the graph is not strict", () => {
    expect(dotToMermaid("digraph { a -> b; a -> b }").edges).toBe(2);
  });

  it("reads rankdir as the direction", () => {
    expect(dotToMermaid("digraph { rankdir=LR; a -> b }").code).toContain("flowchart LR");
    expect(dotToMermaid('digraph { rankdir="BT"; a -> b }').code).toContain("flowchart BT");
  });

  it("refuses a file that is not DOT", () => {
    expect(() => dotToMermaid("flowchart TD\n a --> b")).toThrow(/not a DOT graph/);
    expect(() => dotToMermaid("digraph")).toThrow(/no body/);
  });

  it("refuses a truncated file rather than opening the empty graph it parses to", () => {
    expect(() => dotToMermaid("digraph { a -> b")).toThrow(/never closed/);
    expect(() => dotToMermaid("digraph { subgraph cluster_a { x }")).toThrow(/never closed/);
  });

  it("accepts a graph that is legitimately empty", () => {
    expect(dotToMermaid("digraph {}").nodes).toBe(0);
  });
});

describe("the awkward parts of the syntax", () => {
  it("ignores all three kinds of comment", () => {
    const dot = `digraph {
      // a line comment with a { brace
      # a hash comment
      /* a block
         comment -> not_an_edge */
      a -> b
    }`;
    expect(dotToMermaid(dot).edges).toBe(1);
  });

  it("does not read punctuation inside a quoted name", () => {
    // The reason this is a tokeniser and not a regular expression.
    const { code, nodes, edges } = dotToMermaid('digraph { "a -> b" -> "c}d" }');
    expect(nodes).toBe(2);
    expect(edges).toBe(1);
    expect(code).toContain('a_b["a -> b"]');
  });

  it("keeps a quoted keyword as a name", () => {
    const { code } = dotToMermaid('digraph { "node" -> "graph" }');
    expect(code).toContain('node["node"]');
    expect(code).toContain('graph_["graph"]');
  });

  it("skips ports and compass points on an endpoint", () => {
    const { code, nodes } = dotToMermaid("digraph { a:f0:se -> b:f1 }");
    expect(nodes).toBe(2);
    expect(edgesOf(code)).toEqual(["a --> b"]);
  });

  it("survives semicolons and commas wherever they are allowed", () => {
    const { edges } = dotToMermaid('digraph { a [label="A", color=red;]; a -> b; }');
    expect(edges).toBe(1);
  });

  it("reads an HTML-like label as its words", () => {
    const { code } = dotToMermaid("digraph { a [label=<<b>Bold</b><br/>two>] }");
    expect(lineFor(code, "Bold")).toBe('Bold_two["Bold<br/>two"]');
  });

  it("reads the DOT line breaks", () => {
    const { code } = dotToMermaid('digraph { a [label="one\\ntwo\\lthree"] }');
    expect(code).toContain('["one<br/>two<br/>three"]');
  });
});

describe("labels and identifiers", () => {
  it("names a node after its label, not its DOT name", () => {
    const { code } = dotToMermaid('digraph { n1 [label="Load balancer"] }');
    expect(lineFor(code, "Load_balancer")).toBe('Load_balancer["Load balancer"]');
  });

  it("makes a Mermaid identifier out of a name that is not one", () => {
    // What `terraform graph` emits, and what Mermaid would read as an arrow.
    const { code } = dotToMermaid('digraph { "aws_instance.web" -> "aws_vpc.main" }');
    expect(code).toContain('aws_instance_web["aws_instance.web"]');
    expect(edgesOf(code)).toEqual(["aws_instance_web --> aws_vpc_main"]);
  });

  it("renames a node Mermaid would read as a keyword", () => {
    const { code } = dotToMermaid("digraph { a -> end }");
    expect(code).toContain('end_["end"]');
    expect(edgesOf(code)).toEqual(["a --> end_"]);
  });

  it("keeps two nodes with the same label apart", () => {
    const { code } = dotToMermaid('digraph { a [label="Step"]; b [label="Step"] }');
    expect(code).toContain('Step["Step"]');
    expect(code).toContain('Step_2["Step"]');
  });
});

describe("shapes", () => {
  it.each([
    ["box", 'Q["Q"]'],
    ["ellipse", 'Q(["Q"])'],
    ["circle", 'Q(("Q"))'],
    ["doublecircle", 'Q((("Q")))'],
    ["diamond", 'Q{"Q"}'],
    ["hexagon", 'Q{{"Q"}}'],
    ["cylinder", 'Q[("Q")]'],
    ["component", 'Q[["Q"]]'],
    ["parallelogram", 'Q[/"Q"/]'],
    ["trapezium", 'Q[/"Q"\\]'],
    ["invtrapezium", 'Q[\\"Q"/]'],
    ["somethingexotic", 'Q["Q"]'],
  ])("maps shape=%s", (shape, expected) => {
    const { code } = dotToMermaid(`digraph { Q [shape=${shape}] }`);
    expect(lineFor(code, "Q")).toBe(expected);
  });

  it("applies a `node [...]` default to the nodes after it", () => {
    const { code } = dotToMermaid("digraph { node [shape=diamond]; a; b }");
    expect(lineFor(code, "a")).toBe('a{"a"}');
    expect(lineFor(code, "b")).toBe('b{"b"}');
  });

  it("lets a node overrule the default", () => {
    const { code } = dotToMermaid("digraph { node [shape=diamond]; a [shape=box] }");
    expect(lineFor(code, "a")).toBe('a["a"]');
  });

  it("keeps a node's own shape when an edge names it again later", () => {
    // Every edge re-mentions its endpoints. Treating that as a fresh
    // declaration re-applied the block default over the node's own
    // attributes, and every shape in a file with defaults was lost.
    const { code } = dotToMermaid("digraph { node [shape=box]; a [shape=diamond]; a -> b }");
    expect(lineFor(code, "a")).toBe('a{"a"}');
  });

  it("keeps a node's own colour when an edge names it again later", () => {
    const { code } = dotToMermaid(
      'digraph { node [style=filled, fillcolor="#dae8fc"]; a [fillcolor="#f8cecc"]; a -> b }',
    );
    expect(code).toContain("style a fill:#f8cecc");
    expect(code).toContain("style b fill:#dae8fc");
  });

  it("keeps a default set inside a block from leaking out of it", () => {
    const dot = `digraph {
      { node [shape=diamond]; inner }
      outer
    }`;
    const { code } = dotToMermaid(dot);
    expect(lineFor(code, "inner")).toBe('inner{"inner"}');
    expect(lineFor(code, "outer")).toBe('outer["outer"]');
  });
});

describe("colours", () => {
  it("reads `color` as the outline, not the fill", () => {
    // The mistake that would paint every node in a generated file.
    const { code } = dotToMermaid("digraph { a [color=red] }");
    expect(code).toContain("style a stroke:red");
    expect(code).not.toContain("fill:");
  });

  it("reads `color` as the fill once the node is filled", () => {
    const { code } = dotToMermaid('digraph { a [style=filled, color="#d5e8d4"] }');
    expect(code).toContain("style a fill:#d5e8d4,color:#111111");
  });

  it("lets fillcolor and color mean both at once", () => {
    const { code } = dotToMermaid(
      'digraph { a [style=filled, fillcolor="#eeeeee", color="#333333"] }',
    );
    expect(code).toContain("style a fill:#eeeeee,stroke:#333333,color:#111111");
  });

  it("gives a pale fill dark text and a dark fill light text", () => {
    expect(dotToMermaid('digraph { a [fillcolor="#102030"] }').code).toContain("color:#ffffff");
    expect(dotToMermaid('digraph { a [fillcolor="#eeffee"] }').code).toContain("color:#111111");
  });

  it("does not overrule a fontcolor the file chose", () => {
    const { code } = dotToMermaid('digraph { a [fillcolor="#eeeeee", fontcolor=blue] }');
    expect(code).toContain("style a fill:#eeeeee,color:blue");
  });

  it("draws a plaintext node as bare text", () => {
    const { code } = dotToMermaid("digraph { a [shape=plaintext] }");
    expect(code).toContain("style a fill:transparent,stroke:none");
  });
});

describe("connections", () => {
  it.each([
    ['label="yes"', 'a -->|"yes"| b'],
    ["style=dashed", "a -.-> b"],
    ["style=bold", "a ==> b"],
    ["penwidth=4", "a ==> b"],
    ["arrowhead=none", "a --- b"],
    ["dir=none", "a --- b"],
    ["dir=both", "a <--> b"],
    ["arrowhead=odot", "a --o b"],
    ["arrowhead=tee", "a --x b"],
  ])("maps %s", (attr, expected) => {
    const { code } = dotToMermaid(`digraph { a -> b [${attr}] }`);
    expect(edgesOf(code)).toEqual([expected]);
  });

  it("applies an `edge [...]` default", () => {
    const { code } = dotToMermaid("digraph { edge [style=dashed]; a -> b; b -> c }");
    expect(edgesOf(code)).toEqual(["a -.-> b", "b -.-> c"]);
  });

  it("gives every hop of a chain the same attributes", () => {
    const { code } = dotToMermaid('digraph { a -> b -> c [label="step"] }');
    expect(edgesOf(code)).toEqual(['a -->|"step"| b', 'b -->|"step"| c']);
  });
});

describe("clusters", () => {
  const DOT = `digraph {
    subgraph cluster_web {
      label = "Web tier"
      lb [label="Load balancer"]
      app
    }
    db
    lb -> db
  }`;

  it("becomes a subgraph holding the nodes declared inside it", () => {
    const { code } = dotToMermaid(DOT);
    expect(code).toMatch(
      /subgraph Web_tier \["Web tier"\]\n\s+Load_balancer\["Load balancer"\]\n\s+app\["app"\]\n\s+end/,
    );
    expect(lineFor(code, "db")).toBe('db["db"]');
  });

  it("names an unlabelled cluster after itself, without the prefix", () => {
    const { code } = dotToMermaid("digraph { subgraph cluster_backend { a } }");
    expect(code).toContain('subgraph backend ["backend"]');
  });

  it("gives each cluster its own label", () => {
    // One shared attribute bag gave every cluster the last label read.
    const dot = `digraph {
      subgraph cluster_a { label="First"; x }
      subgraph cluster_b { label="Second"; y }
    }`;
    const { code } = dotToMermaid(dot);
    expect(code).toContain('subgraph First ["First"]');
    expect(code).toContain('subgraph Second ["Second"]');
  });

  it("nests a cluster inside a cluster", () => {
    const dot = `digraph {
      subgraph cluster_out {
        label="Outer"
        subgraph cluster_in { label="Inner"; deep }
      }
    }`;
    const { code } = dotToMermaid(dot);
    expect(code).toMatch(/subgraph Outer \["Outer"\][\s\S]*subgraph Inner \["Inner"\]/);
  });

  it("does not make a container out of a plain subgraph", () => {
    // A braceless-name subgraph exists to scope attributes and to group edge
    // endpoints. Drawing a box round it would invent one nobody asked for.
    const { code } = dotToMermaid("digraph { subgraph { rank=same; a; b } a -> b }");
    expect(code).not.toContain("subgraph");
  });
});

describe("layout", () => {
  it("leaves a plain graph to be laid out", () => {
    // No `pos` in the file, so no positions comment and ELK does the work.
    expect(dotToMermaid("digraph { a -> b }").code).not.toContain("graph:positions");
  });

  it("honours the coordinates `dot -Tdot` writes, the right way up", () => {
    // DOT points are 72 to the inch with y increasing upwards; the canvas is
    // 96 to the inch with y increasing downwards.
    const { code } = dotToMermaid(`digraph {
      a [pos="0,72"]
      b [pos="72,0"]
    }`);
    expect(readPositions(code)).toEqual({ a: { x: 0, y: 0 }, b: { x: 96, y: 96 } });
  });

  it("ignores coordinates when only some nodes have them", () => {
    const { code } = dotToMermaid('digraph { a [pos="0,0"]; b }');
    expect(code).not.toContain("graph:positions");
  });
});

describe("a class model drawn with records", () => {
  const DOXYGEN = `digraph "Order" {
    node [shape=record, fontname="Helvetica"];
    Order  [label="{Order|+ id: int\\l+ total: float\\l|+ pay(): void\\l+ cancel()\\l}"];
    Base   [label="{Base|# created: date\\l|}"];
    Payable [label="{Payable||+ pay(): void\\l}"];
    Base -> Order [dir="back", arrowtail="empty"];
    Payable -> Order [dir="back", arrowtail="empty", style="dashed"];
  }`;

  it("is read as a class diagram, not a flowchart", () => {
    const { code } = dotToMermaid(DOXYGEN);
    expect(code).toContain("classDiagram");
    expect(code).not.toContain("flowchart");
  });

  it("splits the compartments into fields and methods", () => {
    const { code } = dotToMermaid(DOXYGEN);
    expect(code).toMatch(
      /class Order \{\n\s+\+ id: int\n\s+\+ total: float\n\s+\+ pay\(\): void\n\s+\+ cancel\(\)\n\s+\}/,
    );
  });

  it("keeps a class whose compartments are empty", () => {
    const { code } = dotToMermaid(DOXYGEN);
    expect(code).toMatch(/class Payable \{\n\s+\+ pay\(\): void\n\s+\}/);
  });

  it("reads an empty arrowtail as inheritance, and dashed as dotted", () => {
    const { code } = dotToMermaid(DOXYGEN);
    expect(code).toContain("Base <|-- Order");
    expect(code).toContain("Payable <|.. Order");
  });

  it("leaves a plain record with no compartments as a flowchart", () => {
    // One `shape=record` with no `|` really is just a box.
    const { code } = dotToMermaid('digraph { a [shape=record, label="just a box"] }');
    expect(code).toContain("flowchart");
  });

  it("leaves a graph that only partly uses records as a flowchart", () => {
    const mixed = 'digraph { a [shape=record, label="{A|x}"]; b [shape=box]; a -> b }';
    expect(dotToMermaid(mixed).code).toContain("flowchart");
  });

  it("parses back as a Mermaid class diagram", async () => {
    const graph = await parseDiagram(dotToMermaid(DOXYGEN).code);
    expect(graph.kind).toBe("class");
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(["Base", "Order", "Payable"]);
    expect(graph.edges).toHaveLength(2);
  });
});

describe("a file no human wrote", () => {
  it("converts what `terraform graph` actually emits", async () => {
    // Generated by running `terraform graph` over a four-resource config and
    // kept verbatim, so this cannot drift into a shape only Archyne writes.
    const { code, nodes, edges } = dotToMermaid(terraformGraph);

    expect([nodes, edges]).toEqual([4, 3]);
    // `rankdir = "RL"`, a `node [shape = rect]` default, and names that are
    // quoted because a dot in them would otherwise end the identifier.
    expect(code).toContain("flowchart RL");
    expect(lineFor(code, "terraform_data_api")).toBe(
      'terraform_data_api["terraform_data.api"]',
    );
    expect(edgesOf(code)).toEqual([
      "terraform_data_api --> terraform_data_database",
      "terraform_data_database --> terraform_data_network",
      "terraform_data_worker --> terraform_data_database",
    ]);

    const graph = await parseDiagram(code);
    expect(graph.nodes).toHaveLength(4);
    expect(graph.edges).toHaveLength(3);
  });
});

describe("what comes out is a Mermaid document", () => {
  it("parses back, with every node, edge and cluster intact", async () => {
    const dot = `strict digraph deps {
      rankdir=LR
      node [shape=box, style=filled, fillcolor="#dae8fc"]
      subgraph cluster_svc {
        label="Services"
        "api" [label="API"]
        "worker" [shape=cylinder]
      }
      "db" [label="Postgres", shape=cylinder]
      "api" -> "worker" [label="enqueue"]
      "worker" -> "db" [style=dashed]
      "api" -> "db"
    }`;

    const graph = await parseDiagram(dotToMermaid(dot).code);
    expect(graph.kind).toBe("flowchart");
    expect(graph.direction).toBe("LR");
    expect(graph.nodes.map((n) => n.id).sort()).toEqual([
      "API",
      "Postgres",
      "Services",
      "worker",
    ]);
    expect(graph.nodes.find((n) => n.id === "API")?.parentId).toBe("Services");
    expect(graph.nodes.find((n) => n.id === "Postgres")?.parentId).toBeUndefined();
    expect(graph.edges.map((e) => [e.source, e.target, e.data?.label])).toEqual([
      ["API", "worker", "enqueue"],
      ["worker", "Postgres", ""],
      ["API", "Postgres", ""],
    ]);
    expect(graph.edges[1].data?.stroke).toBe("dotted");
  });

  it("parses back a graph whose names are all hostile", async () => {
    const dot = `digraph {
      "end" -> "1st node" -> "a-b" -> "x" -> "style"
    }`;
    // Five names Mermaid would each choke on for a different reason:
    // a keyword, a leading digit, a hyphen it reads as an arrow, and two
    // more keywords.
    const graph = await parseDiagram(dotToMermaid(dot).code);
    expect(graph.nodes).toHaveLength(5);
    expect(graph.edges).toHaveLength(4);
  });
});
