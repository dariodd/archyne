import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { vsdxToMermaid } from "./fromVsdx";
import { parseDiagram } from "./diagram";
import { readPositions } from "./positions";

/** Build a `.vsdx` package from the parts a test cares about. */
function vsdx(parts: Record<string, string>): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const [path, text] of Object.entries(parts)) files[path] = strToU8(text);
  return zipSync(files);
}

const PAGES = `<?xml version="1.0" encoding="utf-8"?>
<Pages xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <Page ID="0" NameU="Flow">
    <PageSheet><Cell N="PageHeight" V="11"/></PageSheet>
    <Rel r:id="rId1"/>
  </Page>
</Pages>`;

const RELS = `<?xml version="1.0" encoding="utf-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Target="page1.xml" Type="…/page"/>
</Relationships>`;

const MASTERS = `<?xml version="1.0" encoding="utf-8"?>
<Masters>
  <Master ID="2" NameU="Process"/>
  <Master ID="3" NameU="Decision"/>
  <Master ID="4" NameU="Start/End"/>
  <Master ID="5" NameU="Dynamic connector"/>
  <Master ID="6" NameU="Database"/>
</Masters>`;

/** One `<Shape>`, with the cells that matter. */
const shape = (
  id: string,
  master: string,
  text: string,
  geo: { x: number; y: number; w?: number; h?: number },
  extra = "",
) => `<Shape ID="${id}" NameU="Shape" Type="Shape" Master="${master}">
    <Cell N="PinX" V="${geo.x}"/><Cell N="PinY" V="${geo.y}"/>
    <Cell N="Width" V="${geo.w ?? 2}"/><Cell N="Height" V="${geo.h ?? 1}"/>
    ${extra}
    <Text>${text}</Text>
  </Shape>`;

const connector = (id: string, text = "", extra = "") =>
  `<Shape ID="${id}" NameU="Dynamic connector" Type="Shape" Master="5">
     <Cell N="BeginX" V="1"/><Cell N="EndX" V="2"/>
     ${extra}
     <Text>${text}</Text>
   </Shape>`;

const connect = (from: string, begin: string, end: string) =>
  `<Connect FromSheet="${from}" FromCell="BeginX" ToSheet="${begin}" ToCell="PinX"/>
   <Connect FromSheet="${from}" FromCell="EndX" ToSheet="${end}" ToCell="PinX"/>`;

function page(shapes: string, connects = "") {
  return `<?xml version="1.0" encoding="utf-8"?>
<PageContents>
  <Shapes>${shapes}</Shapes>
  <Connects>${connects}</Connects>
</PageContents>`;
}

function build(shapes: string, connects = "") {
  return vsdx({
    "visio/pages/pages.xml": PAGES,
    "visio/pages/_rels/pages.xml.rels": RELS,
    "visio/pages/page1.xml": page(shapes, connects),
    "visio/masters/masters.xml": MASTERS,
  });
}

function lineFor(code: string, id: string): string {
  const line = code.split("\n").find((l) => l.trim().startsWith(id));
  if (!line) throw new Error(`no line for ${id} in\n${code}`);
  return line.trim();
}

describe("the package", () => {
  it("reads the shapes off the first page", () => {
    const { code, nodes, pages } = vsdxToMermaid(
      build(
        shape("1", "2", "Start", { x: 2, y: 10 }) + shape("2", "2", "Stop", { x: 2, y: 8 }),
      ),
    );
    expect(nodes).toBe(2);
    expect(pages).toEqual(["Flow"]);
    expect(lineFor(code, "Start")).toBe('Start["Start"]');
  });

  it("refuses something that is not a Visio package", () => {
    expect(() => vsdxToMermaid(strToU8("not a zip"))).toThrow(/not a readable Visio package/);
    expect(() => vsdxToMermaid(vsdx({ "hello.xml": "<a/>" }))).toThrow(/no Visio drawing/);
  });

  it("follows the relationship to a page part that is not page1.xml", () => {
    const bytes = vsdx({
      "visio/pages/pages.xml": PAGES,
      "visio/pages/_rels/pages.xml.rels": RELS.replace("page1.xml", "page7.xml"),
      "visio/pages/page7.xml": page(shape("1", "2", "Only", { x: 1, y: 10 })),
      "visio/masters/masters.xml": MASTERS,
    });
    expect(vsdxToMermaid(bytes).code).toContain('Only["Only"]');
  });
});

describe("shapes", () => {
  it.each([
    ["2", 'Q["Q"]'],
    ["3", 'Q{"Q"}'],
    ["4", 'Q(["Q"])'],
    ["6", 'Q[("Q")]'],
  ])("maps master %s", (master, expected) => {
    const { code } = vsdxToMermaid(build(shape("1", master, "Q", { x: 1, y: 10 })));
    expect(lineFor(code, "Q")).toBe(expected);
  });

  it("reads text spread over formatting runs", () => {
    // Visio breaks a label at every change of font, so the words arrive in
    // pieces with markup between them.
    const text = `<cp IX='0'/>Pay <cp IX='1'/>now`;
    const { code } = vsdxToMermaid(build(shape("1", "2", text, { x: 1, y: 10 })));
    expect(lineFor(code, "Pay_now")).toBe('Pay_now["Pay now"]');
  });

  it("carries a literal fill but not a theme index", () => {
    const themed = vsdxToMermaid(
      build(
        shape("1", "2", "A", { x: 1, y: 10 }, `<Cell N="FillForegnd" V="0" F="THEMEVAL()"/>`),
      ),
    );
    const literal = vsdxToMermaid(
      build(shape("1", "2", "A", { x: 1, y: 10 }, `<Cell N="FillForegnd" V="#dae8fc"/>`)),
    );
    expect(themed.code).not.toContain("fill:");
    expect(literal.code).toContain("style A fill:#dae8fc,color:#111111");
  });
});

describe("geometry", () => {
  it("turns centre-in-inches-from-the-bottom into corner-in-pixels-from-the-top", () => {
    // A 2×1 inch shape centred at (3, 9) on an 11-inch page: its left edge is
    // at 2in = 192px, and its top edge is 11 − 9 − 0.5 = 1.5in = 144px down.
    const { code } = vsdxToMermaid(build(shape("1", "2", "A", { x: 3, y: 9, w: 2, h: 1 })));
    expect(readPositions(code)).toEqual({ A: { x: 192, y: 144, w: 192, h: 96 } });
  });

  it("reads the page height rather than assuming one", () => {
    const bytes = vsdx({
      "visio/pages/pages.xml": PAGES.replace('V="11"', 'V="20"'),
      "visio/pages/_rels/pages.xml.rels": RELS,
      "visio/pages/page1.xml": page(shape("1", "2", "A", { x: 1, y: 19, w: 2, h: 1 })),
      "visio/masters/masters.xml": MASTERS,
    });
    expect(readPositions(vsdxToMermaid(bytes).code)!.A.y).toBe(48);
  });
});

describe("connectors", () => {
  const TWO = shape("1", "2", "A", { x: 2, y: 10 }) + shape("2", "2", "B", { x: 2, y: 8 });

  it("joins the shapes the Connects table glues it to", () => {
    // The connectivity is not on the connector; it is a separate table that
    // says which cell of which sheet is glued to which.
    const { code, edges } = vsdxToMermaid(build(TWO + connector("9"), connect("9", "1", "2")));
    expect(edges).toBe(1);
    expect(code).toContain("A --> B");
  });

  it("reads the connector's own text as the label", () => {
    const { code } = vsdxToMermaid(build(TWO + connector("9", "yes"), connect("9", "1", "2")));
    expect(code).toContain('A -->|"yes"| B');
  });

  it("recognises a connector by its geometry when the master is unhelpful", () => {
    const odd = `<Shape ID="9" NameU="Sheet.9" Type="Shape" Master="2">
        <Cell N="BeginX" V="1"/><Cell N="EndX" V="2"/><Text></Text>
      </Shape>`;
    const { nodes, edges } = vsdxToMermaid(build(TWO + odd, connect("9", "1", "2")));
    expect([nodes, edges]).toEqual([2, 1]);
  });

  it.each([
    [`<Cell N="LinePattern" V="2"/>`, "A -.-> B"],
    [`<Cell N="LineWeight" V="0.05"/>`, "A ==> B"],
    [`<Cell N="EndArrow" V="0"/>`, "A --- B"],
    [`<Cell N="BeginArrow" V="4"/>`, "A <--> B"],
  ])("maps %s", (extra, expected) => {
    const { code } = vsdxToMermaid(
      build(TWO + connector("9", "", extra), connect("9", "1", "2")),
    );
    expect(code).toContain(expected);
  });

  it("leaves out a connector glued at one end only", () => {
    const half = `<Connect FromSheet="9" FromCell="BeginX" ToSheet="1" ToCell="PinX"/>`;
    const { edges, dropped } = vsdxToMermaid(build(TWO + connector("9"), half));
    expect([edges, dropped]).toEqual([0, 1]);
  });
});

describe("what comes out is a Mermaid document", () => {
  it("parses back, with every shape and connector intact", async () => {
    const shapes =
      shape("1", "4", "Start", { x: 2, y: 10 }) +
      shape("2", "3", "Valid?", { x: 2, y: 8 }) +
      shape("3", "2", "Charge", { x: 1, y: 6 }) +
      shape("4", "6", "Orders", { x: 4, y: 6 }) +
      connector("10", "yes") +
      connector("11");
    const connects = connect("10", "1", "2") + connect("11", "2", "3");

    const { code, nodes, edges } = vsdxToMermaid(build(shapes, connects));
    expect([nodes, edges]).toEqual([4, 2]);

    const graph = await parseDiagram(code);
    expect(graph.kind).toBe("flowchart");
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(["Charge", "Orders", "Start", "Valid"]);
    expect(graph.edges.map((e) => [e.source, e.target, e.data?.label])).toEqual([
      ["Start", "Valid", "yes"],
      ["Valid", "Charge", ""],
    ]);
  });
});
