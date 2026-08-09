import { describe, expect, it } from "vitest";
import { deflateSync } from "fflate";
import { drawioToMermaid } from "./fromDrawio";
import { isDrawio } from "../importFile";
import { parseDiagram } from "./diagram";
import { useGraphStore } from "../store";
import { readPositions } from "./positions";
import { readWaypoints } from "./waypoints";

/** Wrap loose `<mxCell>` markup in the file structure draw.io writes. */
function file(cells: string, attrs = ""): string {
  return `<mxfile host="app.diagrams.net">
  <diagram name="Page-1" id="p1"${attrs}>
    <mxGraphModel dx="800" dy="600" grid="1">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        ${cells}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
}

const box = (
  id: string,
  label: string,
  style = "",
  geo = 'x="40" y="40" width="120" height="60"',
) =>
  `<mxCell id="${id}" value="${label}" style="${style}" vertex="1" parent="1">
     <mxGeometry ${geo} as="geometry" />
   </mxCell>`;

const link = (id: string, source: string, target: string, style = "", label = "") =>
  `<mxCell id="${id}" value="${label}" style="${style}" edge="1" parent="1" source="${source}" target="${target}">
     <mxGeometry relative="1" as="geometry" />
   </mxCell>`;

/** The shape of one node in the generated source, e.g. `Check{"Valid?"}`. */
function lineFor(code: string, id: string): string {
  const line = code.split("\n").find((l) => l.trim().startsWith(id));
  if (!line) throw new Error(`no line for ${id} in\n${code}`);
  return line.trim();
}

describe("recognising a draw.io file", () => {
  it("knows one when it sees it, compressed or not", () => {
    expect(isDrawio(file(box("2", "A")))).toBe(true);
    expect(isDrawio('<mxGraphModel dx="1"><root /></mxGraphModel>')).toBe(true);
  });

  it("does not mistake Mermaid for one", () => {
    expect(isDrawio("flowchart TD\n  a --> b\n")).toBe(false);
    expect(isDrawio("")).toBe(false);
  });
});

describe("shapes and labels", () => {
  it("names nodes after what they say", () => {
    const { code } = drawioToMermaid(file(box("2", "Start") + box("3", "Ship it")));
    expect(lineFor(code, "Start")).toBe('Start["Start"]');
    expect(lineFor(code, "Ship_it")).toBe('Ship_it["Ship it"]');
  });

  it("keeps two nodes with the same label apart", () => {
    const { code } = drawioToMermaid(file(box("2", "Step") + box("3", "Step")));
    expect(lineFor(code, "Step[")).toBe('Step["Step"]');
    expect(lineFor(code, "Step_2")).toBe('Step_2["Step"]');
  });

  it("renames a label that Mermaid claims for itself", () => {
    // `end` as an id closes the enclosing block instead of naming a node.
    const { code } = drawioToMermaid(file(box("2", "end")));
    expect(lineFor(code, "end_")).toBe('end_["end"]');
  });

  it("falls back to a generated id for a node with no label", () => {
    const { code } = drawioToMermaid(file(box("2", "")));
    expect(code).toMatch(/n1\[""\]/);
  });

  it.each([
    ["rhombus;whiteSpace=wrap;", 'Q{"Q"}'],
    ["rounded=1;whiteSpace=wrap;", 'Q("Q")'],
    ["rounded=1;arcSize=40;", 'Q(["Q"])'],
    ["shape=hexagon;", 'Q{{"Q"}}'],
    ["shape=cylinder3;", 'Q[("Q")]'],
    ["shape=process;", 'Q[["Q"]]'],
    ["shape=parallelogram;", 'Q[/"Q"/]'],
    ["shape=trapezoid;", 'Q[/"Q"\\]'],
    ["shape=mxgraph.flowchart.decision;", 'Q{"Q"}'],
    ["shape=mxgraph.flowchart.terminator;", 'Q(["Q"])'],
    ["shape=mxgraph.flowchart.manual_operation;", 'Q[\\"Q"/]'],
    ["whiteSpace=wrap;html=1;", 'Q["Q"]'],
  ])("maps %s", (style, expected) => {
    const { code } = drawioToMermaid(file(box("2", "Q", style)));
    expect(lineFor(code, "Q")).toBe(expected);
  });

  it("reads a wide ellipse as a pill and a round one as a circle", () => {
    const wide = drawioToMermaid(
      file(box("2", "Q", "ellipse;", 'x="0" y="0" width="160" height="60"')),
    );
    const round = drawioToMermaid(
      file(box("2", "Q", "ellipse;", 'x="0" y="0" width="80" height="80"')),
    );
    expect(lineFor(wide.code, "Q")).toBe('Q(["Q"])');
    expect(lineFor(round.code, "Q")).toBe('Q(("Q"))');
  });

  it("turns an HTML label into text, keeping the line breaks", async () => {
    const { code } = drawioToMermaid(
      file(box("2", "&lt;b&gt;Pay&lt;/b&gt;&lt;br&gt;service &amp;amp; more")),
    );
    expect(lineFor(code, "Pay_service_more")).toBe(
      'Pay_service_more["Pay<br/>service & more"]',
    );
    // The ampersand is the interesting half: it must not take the parser with
    // it. Mermaid reads a label holding markup as HTML, so it comes back
    // escaped and with its own spelling of the break — and stays that way
    // rather than gaining an escape on every save.
    const graph = await parseDiagram(code);
    expect(graph.nodes[0].data.label).toBe("Pay<br>service &amp; more");
  });

  it("takes the label off an <object> wrapper", () => {
    const { code } = drawioToMermaid(
      file(`<object label="Wrapped" tag="x" id="9">
              <mxCell style="rhombus;" vertex="1" parent="1">
                <mxGeometry x="0" y="0" width="80" height="80" as="geometry" />
              </mxCell>
            </object>`),
    );
    expect(lineFor(code, "Wrapped")).toBe('Wrapped{"Wrapped"}');
  });
});

describe("colours", () => {
  it("carries fill, stroke and text colour across as a style line", () => {
    const { code } = drawioToMermaid(
      file(box("2", "A", "fillColor=#d5e8d4;strokeColor=#82b366;fontColor=#111111;")),
    );
    expect(code).toContain("style A fill:#d5e8d4,stroke:#82b366,color:#111111");
  });

  it("reads a colourless label as text rather than an invisible box", () => {
    const { code } = drawioToMermaid(file(box("2", "Title", "text;html=1;")));
    expect(code).toContain("style Title fill:transparent,stroke:none");
  });

  it("gives a pale fill dark text, so the label survives the dark theme", () => {
    // draw.io's palettes are all pale because it draws labels black. Without
    // this the words vanish into Archyne's light-on-dark node.
    const { code } = drawioToMermaid(file(box("2", "A", "fillColor=#d5e8d4;")));
    expect(code).toContain("style A fill:#d5e8d4,color:#111111");
  });

  it("gives a dark fill light text", () => {
    const { code } = drawioToMermaid(file(box("2", "A", "fillColor=#1a1a2e;")));
    expect(code).toContain("style A fill:#1a1a2e,color:#ffffff");
  });

  it("does not overrule a text colour the diagram already chose", () => {
    const { code } = drawioToMermaid(
      file(box("2", "A", "fillColor=#d5e8d4;fontColor=#ff0000;")),
    );
    expect(code).toContain("style A fill:#d5e8d4,color:#ff0000");
  });

  it("leaves a node with no fill to the theme", () => {
    const { code } = drawioToMermaid(file(box("2", "A", "strokeColor=#82b366;")));
    expect(code).toContain("style A stroke:#82b366");
    expect(code).not.toContain("color:#");
  });

  it("writes `none` as transparent", () => {
    const { code } = drawioToMermaid(file(box("2", "A", "fillColor=none;strokeColor=none;")));
    expect(code).toContain("style A fill:transparent,stroke:none");
  });
});

describe("connections", () => {
  it("carries an arrow between two boxes", () => {
    const { code, edges } = drawioToMermaid(
      file(box("2", "A") + box("3", "B") + link("4", "2", "3")),
    );
    expect(edges).toBe(1);
    expect(code).toContain("A --> B");
  });

  it("reads the label draw.io parks on the connection itself", () => {
    const { code } = drawioToMermaid(
      file(box("2", "A") + box("3", "B") + link("4", "2", "3", "", "yes")),
    );
    expect(code).toContain('A -->|"yes"| B');
  });

  it("reads the label draw.io parks in a child cell", () => {
    // Which is where it goes whenever the label has been dragged along the
    // line — the common case, and invisible in the edge's own `value`.
    const { code } = drawioToMermaid(
      file(
        box("2", "A") +
          box("3", "B") +
          link("4", "2", "3") +
          `<mxCell id="5" value="no" style="edgeLabel;html=1;" vertex="1" connectable="0" parent="4">
             <mxGeometry x="0.1" relative="1" as="geometry" />
           </mxCell>`,
      ),
    );
    expect(code).toContain('A -->|"no"| B');
    // …and the label cell is not also a node.
    expect(code).not.toMatch(/^\s+no\[/m);
  });

  it.each([
    ["dashed=1;", "A -.-> B"],
    ["strokeWidth=4;", "A ==> B"],
    ["endArrow=none;", "A --- B"],
    ["endArrow=oval;", "A --o B"],
    ["endArrow=cross;", "A --x B"],
    ["startArrow=classic;endArrow=classic;", "A <--> B"],
  ])("maps %s", (style, expected) => {
    const { code } = drawioToMermaid(
      file(box("2", "A") + box("3", "B") + link("4", "2", "3", style)),
    );
    expect(code).toContain(expected);
  });

  it("leaves out a connection with a loose end", () => {
    const { code, edges, dropped } = drawioToMermaid(
      file(
        box("2", "A") +
          `<mxCell id="4" edge="1" parent="1" source="2"><mxGeometry as="geometry" /></mxCell>`,
      ),
    );
    expect(edges).toBe(0);
    expect(dropped).toBe(1);
    expect(code).toContain('A["A"]');
  });
});

describe("layout", () => {
  it("keeps every box where it was drawn", () => {
    const { code } = drawioToMermaid(
      file(box("2", "A", "", 'x="240" y="80" width="160" height="70"')),
    );
    expect(readPositions(code)).toEqual({ A: { x: 240, y: 80, w: 160, h: 70 } });
  });

  it("carries the corners of a hand-routed connection", () => {
    const { code } = drawioToMermaid(
      file(
        box("2", "A") +
          box("3", "B") +
          `<mxCell id="4" edge="1" parent="1" source="2" target="3">
             <mxGeometry relative="1" as="geometry">
               <Array as="points">
                 <mxPoint x="100" y="200" />
                 <mxPoint x="300" y="200" />
               </Array>
             </mxGeometry>
           </mxCell>`,
      ),
    );
    expect(readWaypoints(code)).toEqual({
      "A>B": [
        { x: 100, y: 200 },
        { x: 300, y: 200 },
      ],
    });
  });
});

describe("containers", () => {
  const GROUPED = file(
    `<mxCell id="10" value="VPC" style="swimlane;" vertex="1" parent="1">
       <mxGeometry x="40" y="40" width="320" height="240" as="geometry" />
     </mxCell>
     <mxCell id="11" value="Web" style="" vertex="1" parent="10">
       <mxGeometry x="20" y="60" width="120" height="60" as="geometry" />
     </mxCell>
     <mxCell id="12" value="Api" style="" vertex="1" parent="10">
       <mxGeometry x="20" y="150" width="120" height="60" as="geometry" />
     </mxCell>` + link("13", "11", "12"),
  );

  it("becomes a subgraph holding its children", () => {
    const { code } = drawioToMermaid(GROUPED);
    expect(code).toContain('subgraph VPC ["VPC"]');
    expect(code).toMatch(/subgraph VPC \["VPC"\]\n\s+Web\["Web"\]\n\s+Api\["Api"\]\n\s+end/);
  });

  it("leaves child coordinates relative to the container, as the store wants", () => {
    const positions = readPositions(drawioToMermaid(GROUPED).code)!;
    expect(positions.VPC).toEqual({ x: 40, y: 40, w: 320, h: 240 });
    expect(positions.Web).toEqual({ x: 20, y: 60, w: 120, h: 60 });
  });

  it("treats a plain box with children as a container too", () => {
    const { code } = drawioToMermaid(
      file(
        box("10", "Zone", "", 'x="0" y="0" width="300" height="200"') +
          `<mxCell id="11" value="Inner" vertex="1" parent="10">
             <mxGeometry x="10" y="10" width="80" height="40" as="geometry" />
           </mxCell>`,
      ),
    );
    expect(code).toMatch(/subgraph Zone \["Zone"\]\n\s+Inner\["Inner"\]/);
  });
});

describe("recognising a drawing that is not a flowchart", () => {
  it("says when a drawing looks like a sequence diagram", () => {
    // draw.io has no diagram type of its own — a sequence diagram there is
    // lifeline shapes on the ordinary canvas — so this converts as a
    // flowchart and says what the file appeared to be.
    const result = drawioToMermaid(
      file(box("2", "Web", "shape=umlLifeline;perimeter=lifelinePerimeter;")),
    );
    expect(result.looksLike).toBe("sequence");
    expect(result.code).toContain("flowchart");
  });

  it("says when it looks like an ER diagram", () => {
    const result = drawioToMermaid(
      file(box("2", "orders", "shape=table;startSize=30;childLayout=tableLayout;")),
    );
    expect(result.looksLike).toBe("er");
  });

  it("says nothing about an ordinary drawing", () => {
    expect(drawioToMermaid(file(box("2", "A"))).looksLike).toBeUndefined();
  });
});

describe("the file around the diagram", () => {
  it("lists every page and converts the first", () => {
    const two = `<mxfile>
      <diagram name="Overview" id="a"><mxGraphModel><root>
        <mxCell id="0" /><mxCell id="1" parent="0" />
        ${box("2", "First")}
      </root></mxGraphModel></diagram>
      <diagram name="Detail" id="b"><mxGraphModel><root>
        <mxCell id="0" /><mxCell id="1" parent="0" />
        ${box("3", "Second")}
      </root></mxGraphModel></diagram>
    </mxfile>`;
    const result = drawioToMermaid(two);
    expect(result.pages).toEqual(["Overview", "Detail"]);
    expect(result.code).toContain('First["First"]');
    expect(result.code).not.toContain("Second");
  });

  it("reads the compressed form draw.io writes by default", () => {
    // base64 of raw DEFLATE of the URI-encoded XML — three layers, and no
    // marker in the file to say so.
    const inner = `<mxGraphModel><root><mxCell id="0" /><mxCell id="1" parent="0" />${box("2", "Packed")}</root></mxGraphModel>`;
    const bytes = deflateSync(new TextEncoder().encode(encodeURIComponent(inner)));
    const packed = btoa(String.fromCharCode(...bytes));
    const { code } = drawioToMermaid(`<mxfile><diagram name="P">${packed}</diagram></mxfile>`);
    expect(code).toContain('Packed["Packed"]');
  });

  it("refuses something that is not XML at all", () => {
    expect(() => drawioToMermaid("not xml {")).toThrow();
  });

  it("refuses XML that holds no diagram", () => {
    expect(() => drawioToMermaid("<html><body>hi</body></html>")).toThrow(/no diagram/);
  });
});

describe("what comes out is a Mermaid document", () => {
  it("parses back, with every node, edge and container intact", async () => {
    const { code } = drawioToMermaid(
      file(
        `<mxCell id="10" value="Zone" style="swimlane;" vertex="1" parent="1">
           <mxGeometry x="0" y="0" width="400" height="300" as="geometry" />
         </mxCell>
         <mxCell id="11" value="Start" style="rounded=1;arcSize=40;fillColor=#d5e8d4;" vertex="1" parent="10">
           <mxGeometry x="20" y="40" width="120" height="60" as="geometry" />
         </mxCell>` +
          box("12", "Valid?", "rhombus;", 'x="200" y="200" width="100" height="80"') +
          box("13", "end", "shape=cylinder3;", 'x="400" y="200" width="100" height="80"') +
          link("14", "11", "12", "dashed=1;", "check") +
          link("15", "12", "13", "startArrow=classic;endArrow=classic;"),
      ),
    );

    const graph = await parseDiagram(code);
    expect(graph.kind).toBe("flowchart");
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(["Start", "Valid", "Zone", "end_"]);
    expect(graph.nodes.find((n) => n.id === "Start")?.parentId).toBe("Zone");
    expect(graph.edges.map((e) => [e.source, e.target, e.data?.label])).toEqual([
      ["Start", "Valid", "check"],
      ["Valid", "end_", ""],
    ]);
    expect(graph.edges[0].data?.stroke).toBe("dotted");
    expect(graph.edges[1].data?.both).toBe(true);
  });

  it("opens on the canvas where draw.io had it, not re-laid-out", async () => {
    // The whole point of carrying the geometry across: loading the imported
    // source must not send it through auto-layout.
    const { code } = drawioToMermaid(
      file(box("2", "A", "", 'x="120" y="240" width="160" height="80"')),
    );
    await useGraphStore.getState().applyCode(code);
    const node = useGraphStore.getState().nodes.find((n) => n.id === "A")!;
    expect(node.position).toEqual({ x: 120, y: 240 });
  });
});
