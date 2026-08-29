import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { lucidJsonToMermaid, lucidToMermaid } from "./fromLucid";
import { parseDiagram } from "./diagram";
import { readPositions } from "./positions";
import { readWaypoints } from "./waypoints";

/** Build a `.lucid` package from a document. */
function lucid(doc: unknown): Uint8Array {
  return zipSync({ "document.json": strToU8(JSON.stringify(doc)) });
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const shape = (
  id: string,
  type: string,
  box: Box,
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({ id, type, boundingBox: box, text: "Q", ...extra });

const line = (
  id: string,
  from: string,
  to: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id,
  endpoint1: { type: "shapeEndpoint", style: "none", shapeId: from },
  endpoint2: { type: "shapeEndpoint", style: "arrow", shapeId: to },
  ...extra,
});

const doc = (shapes: unknown[], lines: unknown[] = [], title = "Flow") => ({
  version: 1,
  pages: [{ id: "p1", title, shapes, lines }],
});

function lineFor(code: string, id: string): string {
  const l = code.split("\n").find((l) => l.trim().startsWith(id));
  if (!l) throw new Error(`no line for ${id} in\n${code}`);
  return l.trim();
}

describe("the package", () => {
  it("reads the shapes off the first page", () => {
    const { code, nodes, pages } = lucidToMermaid(
      lucid(
        doc([
          shape("1", "process", { x: 10, y: 20, w: 300, h: 54 }),
          shape("2", "process", { x: 10, y: 200, w: 300, h: 54 }),
        ]),
      ),
    );
    expect(nodes).toBe(2);
    expect(pages).toEqual(["Flow"]);
    expect(lineFor(code, "Q")).toBe('Q["Q"]');
  });

  it("lists every page, converting only the first", () => {
    const { code, pages, page } = lucidToMermaid(
      lucid({
        version: 1,
        pages: [
          {
            id: "p1",
            title: "First",
            shapes: [shape("1", "process", { x: 0, y: 0, w: 100, h: 50 })],
          },
          {
            id: "p2",
            title: "Second",
            shapes: [shape("2", "circle", { x: 0, y: 0, w: 60, h: 60 })],
          },
        ],
      }),
    );
    expect(pages).toEqual(["First", "Second"]);
    expect(page).toBe(0);
    expect(lineFor(code, "Q")).toBe('Q["Q"]');
  });

  it("converts a chosen page when asked", () => {
    const result = lucidToMermaid(
      lucid({
        version: 1,
        pages: [
          {
            id: "p1",
            title: "First",
            shapes: [shape("1", "process", { x: 0, y: 0, w: 100, h: 50 })],
          },
          {
            id: "p2",
            title: "Second",
            shapes: [shape("2", "circle", { x: 0, y: 0, w: 60, h: 60 })],
          },
          { id: "p3", title: "Third", shapes: [] },
        ],
      }),
      1,
    );
    expect(result.page).toBe(1);
    expect(result.pages).toEqual(["First", "Second", "Third"]);
    expect(lineFor(result.code, "Q")).toBe('Q(("Q"))');
    expect(result.code).not.toContain('Q["Q"]');
  });

  it("clamps an out-of-range page to the last one", () => {
    const { code, page } = lucidToMermaid(
      lucid({
        version: 1,
        pages: [
          {
            id: "p1",
            title: "First",
            shapes: [shape("1", "process", { x: 0, y: 0, w: 100, h: 50 })],
          },
          {
            id: "p2",
            title: "Second",
            shapes: [shape("2", "circle", { x: 0, y: 0, w: 60, h: 60 })],
          },
        ],
      }),
      99,
    );
    expect(page).toBe(1);
    expect(lineFor(code, "Q")).toBe('Q(("Q"))');
  });

  it("refuses something that is not a Lucid package", () => {
    expect(() => lucidToMermaid(strToU8("not a zip"))).toThrow(/not a readable Lucid file/);
    expect(() => lucidToMermaid(lucid({ hello: true }))).toThrow(/no Lucid pages/);
    expect(() => lucidJsonToMermaid("{nope")).toThrow(/not valid JSON/);
  });

  it("reads a bare document.json without the zip", () => {
    const { code } = lucidJsonToMermaid(
      JSON.stringify(doc([shape("1", "process", { x: 0, y: 0, w: 100, h: 50 })])),
    );
    expect(code).toContain('Q["Q"]');
  });
});

describe("shapes", () => {
  it.each([
    ["decision", 'Q{"Q"}'],
    ["terminator", 'Q(["Q"])'],
    ["database", 'Q[("Q")]'],
    ["process", 'Q["Q"]'],
    ["rectangle", 'Q["Q"]'],
    ["hexagon", 'Q{{"Q"}}'],
  ])("maps lucid %s", (type, expected) => {
    const { code } = lucidToMermaid(
      lucid(doc([shape("1", type, { x: 0, y: 0, w: 100, h: 50 })])),
    );
    expect(lineFor(code, "Q")).toBe(expected);
  });

  it("makes a wide circle a pill", () => {
    const { code } = lucidToMermaid(
      lucid(doc([shape("1", "circle", { x: 0, y: 0, w: 200, h: 60 })])),
    );
    expect(lineFor(code, "Q")).toBe('Q(["Q"])');
  });

  it("rounds a rounded rectangle to the corner its rounding asks for", () => {
    const round = lucidToMermaid(
      lucid(
        doc([
          shape("1", "rectangle", { x: 0, y: 0, w: 100, h: 50 }, { style: { rounding: 20 } }),
        ]),
      ),
    );
    const pill = lucidToMermaid(
      lucid(
        doc([
          shape("1", "rectangle", { x: 0, y: 0, w: 300, h: 60 }, { style: { rounding: 60 } }),
        ]),
      ),
    );
    expect(lineFor(round.code, "Q")).toBe('Q("Q")');
    expect(lineFor(pill.code, "Q")).toBe('Q(["Q"])');
  });

  it("strips the HTML out of a shape's text", () => {
    const { code } = lucidToMermaid(
      lucid(
        doc([
          shape(
            "1",
            "process",
            { x: 0, y: 0, w: 100, h: 50 },
            { text: "<b>Pay</b> now<br/>on time" },
          ),
        ]),
      ),
    );
    expect(lineFor(code, "Pay_now_on_time")).toBe('Pay_now_on_time["Pay now<br/>on time"]');
  });

  it("carries a chosen fill and its readable text colour, not the defaults", () => {
    const { code } = lucidToMermaid(
      lucid(
        doc([
          shape(
            "1",
            "process",
            { x: 0, y: 0, w: 100, h: 50 },
            {
              style: {
                fill: { type: "color", color: "#d5e8d4" },
                stroke: { color: "#82b366" },
              },
            },
          ),
        ]),
      ),
    );
    expect(code).toContain("style Q fill:#d5e8d4,stroke:#82b366,color:#111111");
  });

  it("lets the shape's own text colour win over the readable guess", () => {
    const { code } = lucidToMermaid(
      lucid(
        doc([
          shape(
            "1",
            "process",
            { x: 0, y: 0, w: 100, h: 50 },
            {
              style: {
                fill: { type: "color", color: "#ffffff" },
                stroke: { color: "#000000" },
                textColor: "#ff0000",
              },
            },
          ),
        ]),
      ),
    );
    expect(code).toContain("color:#ff0000");
    expect(code).not.toContain("fill:#ffffff");
    expect(code).not.toContain("stroke:#000000");
  });

  it("leaves the white fill and black stroke of an uncoloured shape alone", () => {
    const { code } = lucidToMermaid(
      lucid(doc([shape("1", "process", { x: 0, y: 0, w: 100, h: 50 })])),
    );
    expect(lineFor(code, "Q")).toBe('Q["Q"]');
  });

  it("renders a text block as a heading — a box painted out of existence", () => {
    const { code } = lucidToMermaid(
      lucid(doc([shape("1", "text", { x: 0, y: 0, w: 200, h: 30 })])),
    );
    expect(code).toContain("style Q fill:transparent,stroke:none");
  });

  it("counts a hotspot out rather than draw an invisible box", () => {
    const { dropped } = lucidToMermaid(
      lucid(doc([shape("1", "hotspot", { x: 0, y: 0, w: 50, h: 50 })])),
    );
    expect(dropped).toBe(1);
  });
});

describe("geometry", () => {
  it("keeps the absolute top-left corners Lucid wrote", () => {
    const { code } = lucidToMermaid(
      lucid(doc([shape("1", "process", { x: 40, y: 120, w: 320, h: 180 })])),
    );
    expect(readPositions(code)).toEqual({ Q: { x: 40, y: 120, w: 320, h: 180 } });
  });
});

describe("lines", () => {
  const TWO = [
    shape("1", "process", { x: 0, y: 0, w: 100, h: 50 }),
    shape("2", "process", { x: 0, y: 200, w: 100, h: 50 }),
  ];

  it("joins the shapes its endpoints name", () => {
    const { code, edges } = lucidToMermaid(lucid(doc(TWO, [line("l1", "1", "2")])));
    expect(edges).toBe(1);
    expect(code).toContain("Q --> Q");
  });

  it("reads the line's own text as the label", () => {
    const { code } = lucidToMermaid(
      lucid(
        doc(TWO, [
          line("l1", "1", "2", { text: [{ text: "yes", position: 0.5, side: "top" }] }),
        ]),
      ),
    );
    expect(code).toContain('Q -->|"yes"| Q');
  });

  it.each([
    [{ endpoint2: { type: "shapeEndpoint", style: "none", shapeId: "2" } }, "Q --- Q"],
    [{ endpoint2: { type: "shapeEndpoint", style: "openCircle", shapeId: "2" } }, "Q --o Q"],
    [{ endpoint2: { type: "shapeEndpoint", style: "closedSquare", shapeId: "2" } }, "Q --x Q"],
  ])("maps the endpoint style %o", (end2, expected) => {
    const { code } = lucidToMermaid(
      lucid(
        doc(TWO, [
          {
            id: "l1",
            endpoint1: { type: "shapeEndpoint", style: "none", shapeId: "1" },
            ...end2,
          },
        ]),
      ),
    );
    expect(code).toContain(expected);
  });

  it("carries an arrowhead on both ends when the start has one too", () => {
    const { code } = lucidToMermaid(
      lucid(
        doc(TWO, [
          {
            id: "l1",
            endpoint1: { type: "shapeEndpoint", style: "arrow", shapeId: "1" },
            endpoint2: { type: "shapeEndpoint", style: "arrow", shapeId: "2" },
          },
        ]),
      ),
    );
    expect(code).toContain("Q <--> Q");
  });

  it("keeps a dashed line dashed and a thick one thick", () => {
    const dashed = lucidToMermaid(
      lucid(doc(TWO, [line("l1", "1", "2", { stroke: { style: "dashed" } })])),
    );
    const thick = lucidToMermaid(
      lucid(doc(TWO, [line("l1", "1", "2", { stroke: { width: 4 } })])),
    );
    expect(dashed.code).toContain("Q -.-> Q");
    expect(thick.code).toContain("Q ==> Q");
  });

  it("leaves out a line with an end glued to nothing", () => {
    const free = lucid(
      doc(TWO, [
        {
          id: "l1",
          endpoint1: { type: "shapeEndpoint", style: "none", shapeId: "1" },
          endpoint2: { type: "positionEndpoint", style: "arrow", position: { x: 10, y: 10 } },
        },
      ]),
    );
    const { edges, dropped } = lucidToMermaid(free);
    expect([edges, dropped]).toEqual([0, 1]);
  });

  it("carries an elbow's corners as waypoints", () => {
    const { code } = lucidToMermaid(
      lucid(
        doc(TWO, [
          line("l1", "1", "2", {
            elbowControlPoints: [
              { x: 120, y: 25 },
              { x: 120, y: 225 },
            ],
          }),
        ]),
      ),
    );
    expect(readWaypoints(code)).toEqual({
      "Q>Q_2": [
        { x: 120, y: 25 },
        { x: 120, y: 225 },
      ],
    });
  });

  it("reads stringly-typed joint coordinates", () => {
    const { code } = lucidToMermaid(
      lucid(doc(TWO, [line("l1", "1", "2", { joints: [{ x: "120", y: "25" }] })])),
    );
    expect(readWaypoints(code)).toEqual({ "Q>Q_2": [{ x: 120, y: 25 }] });
  });

  it("numbers a second edge between the same pair", () => {
    const { code } = lucidToMermaid(
      lucid(
        doc(TWO, [line("l1", "1", "2"), line("l2", "1", "2", { joints: [{ x: 50, y: 100 }] })]),
      ),
    );
    expect(readWaypoints(code)).toEqual({ "Q>Q_2#1": [{ x: 50, y: 100 }] });
  });
});

describe("groups", () => {
  it("brings a group's members across as the free shapes they look like", () => {
    // A Lucid group is selection-grouping — it makes items move together,
    // which is not what a Mermaid subgraph is — so no subgraph appears.
    const { code } = lucidToMermaid(
      lucid({
        version: 1,
        pages: [
          {
            id: "p1",
            title: "Flow",
            shapes: [
              shape("1", "process", { x: 0, y: 0, w: 100, h: 50 }),
              shape("2", "process", { x: 0, y: 120, w: 100, h: 50 }),
            ],
            groups: [{ id: "g1", items: ["1", "2"], note: "Together" }],
          },
        ],
      }),
    );
    expect(code).not.toContain("subgraph");
    expect(lineFor(code, "Q")).toBe('Q["Q"]');
  });
});

describe("what comes out is a Mermaid document", () => {
  it("parses back, with every shape and connection intact", async () => {
    const shapes = [
      shape("1", "terminator", { x: 40, y: 20, w: 200, h: 54 }, { text: "Start" }),
      shape("2", "decision", { x: 80, y: 180, w: 140, h: 86 }, { text: "Valid?" }),
      shape("3", "process", { x: 0, y: 360, w: 180, h: 54 }, { text: "Charge" }),
      shape("4", "database", { x: 240, y: 360, w: 180, h: 54 }, { text: "Orders" }),
    ];
    const lines = [
      line("l1", "1", "2", { text: [{ text: "yes", position: 0.5, side: "top" }] }),
      line("l2", "2", "3"),
      { ...line("l3", "2", "4"), stroke: { style: "dashed" } },
    ];

    const { code, nodes, edges } = lucidToMermaid(lucid(doc(shapes, lines)));
    expect([nodes, edges]).toEqual([4, 3]);

    const graph = await parseDiagram(code);
    expect(graph.kind).toBe("flowchart");
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(["Charge", "Orders", "Start", "Valid"]);
    expect(graph.edges.map((e) => [e.source, e.target, e.data?.label])).toEqual([
      ["Start", "Valid", "yes"],
      ["Valid", "Charge", ""],
      ["Valid", "Orders", ""],
    ]);
  });
});
