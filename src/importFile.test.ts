import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { isDot, isDrawio, isExcalidraw, isPlantuml, isSql, openAsMermaid } from "./importFile";
import type { PickedFile } from "./files";

const picked = (name: string, content: string): PickedFile => ({
  name,
  content,
  path: `C:/work/${name}`,
  handle: { name } as unknown as FileSystemFileHandle,
});

const DRAWIO = `<mxfile host="app.diagrams.net">
  <diagram name="Page-1" id="p">
    <mxGraphModel><root>
      <mxCell id="0" /><mxCell id="1" parent="0" />
      <mxCell id="2" value="Start" style="rounded=1;" vertex="1" parent="1">
        <mxGeometry x="0" y="0" width="120" height="60" as="geometry" />
      </mxCell>
      <mxCell id="3" value="Stop" style="" vertex="1" parent="1">
        <mxGeometry x="0" y="200" width="120" height="60" as="geometry" />
      </mxCell>
      <mxCell id="4" edge="1" parent="1" source="2" target="3">
        <mxGeometry relative="1" as="geometry" />
      </mxCell>
    </root></mxGraphModel>
  </diagram>
</mxfile>`;

describe("telling the formats apart", () => {
  it("recognises both spellings of a draw.io file", () => {
    expect(isDrawio(DRAWIO)).toBe(true);
    expect(isDrawio('<mxGraphModel dx="1"><root /></mxGraphModel>')).toBe(true);
  });

  it("looks past an XML declaration and a licence comment", () => {
    expect(
      isDrawio(`<?xml version="1.0" encoding="UTF-8"?>\n<!-- made earlier -->\n${DRAWIO}`),
    ).toBe(true);
  });

  it("leaves Mermaid alone, even when it mentions XML", () => {
    expect(isDrawio('flowchart TD\n  a["<mxfile>"] --> b\n')).toBe(false);
  });

  it("recognises DOT, directed or not, strict or not", () => {
    expect(isDot("digraph { a -> b }")).toBe(true);
    expect(isDot("graph G {\n a -- b\n}")).toBe(true);
    expect(isDot("strict digraph deps {\n}")).toBe(true);
    expect(isDot("// generated\ndigraph {\n}")).toBe(true);
  });

  it("does not mistake a Mermaid `graph` for DOT", () => {
    // The one real collision between the two languages: both may open with
    // the word `graph`. Only DOT opens a body on the same statement.
    expect(isDot("graph TD\n  a --> b\n")).toBe(false);
    expect(isDot("graph LR;a-->b")).toBe(false);
    expect(isDot("flowchart TD\n  a --> b\n")).toBe(false);
  });
});

describe("opening a Mermaid file", () => {
  it("passes it through untouched, binding and all", async () => {
    const file = picked("notes.mmd", "flowchart TD\n  a --> b\n");
    const opened = await openAsMermaid(file);
    expect(opened.imported).toBeNull();
    expect(opened.file).toBe(file);
  });
});

describe("opening a draw.io file", () => {
  it("hands back Mermaid, and says what it converted", async () => {
    const { file, imported } = await openAsMermaid(picked("flow.drawio", DRAWIO));
    expect(file.content).toContain("flowchart TB");
    expect(file.content).toContain("Start --> Stop");
    expect(imported).toMatchObject({ format: "drawio", nodes: 2, edges: 1, pages: ["Page-1"] });
  });

  it("cuts it loose from the file it came from", async () => {
    // The property that matters most here: Save must never be able to write
    // Mermaid over somebody's .drawio, which its own editor could not read
    // back. With no path and no handle, Save is Save-as.
    const { file } = await openAsMermaid(picked("flow.drawio", DRAWIO));
    expect(file.path).toBeNull();
    expect(file.handle).toBeNull();
  });

  it.each([
    ["flow.drawio", "flow.mmd"],
    ["flow.drawio.xml", "flow.mmd"],
    ["flow.xml", "flow.mmd"],
    ["flow", "flow.mmd"],
  ])("renames %s to %s", async (from, to) => {
    const { file } = await openAsMermaid(picked(from, DRAWIO));
    expect(file.name).toBe(to);
  });

  it("lets a broken file throw rather than opening something wrong", async () => {
    await expect(
      openAsMermaid(picked("bad.drawio", "<mxfile><diagram>%%%</diagram></mxfile>")),
    ).rejects.toThrow();
  });
});

describe("opening a Graphviz file", () => {
  const DOT = "digraph deps {\n  api -> db\n}\n";

  it("hands back Mermaid, and says what it converted", async () => {
    const { file, imported } = await openAsMermaid(picked("deps.dot", DOT));
    expect(file.content).toContain("api --> db");
    expect(imported).toMatchObject({ format: "dot", nodes: 2, edges: 1, pages: [] });
  });

  it("cuts it loose from the file it came from, like any import", async () => {
    const { file } = await openAsMermaid(picked("deps.gv", DOT));
    expect(file).toMatchObject({ name: "deps.mmd", path: null, handle: null });
  });

  it("leaves a Mermaid `graph` file to be opened as itself", async () => {
    const mermaid = "graph TD\n  a --> b\n";
    const opened = await openAsMermaid(picked("plain.mmd", mermaid));
    expect(opened.imported).toBeNull();
    expect(opened.file.content).toBe(mermaid);
  });

  it("lets a broken file throw rather than opening something wrong", async () => {
    await expect(openAsMermaid(picked("bad.dot", "digraph {"))).rejects.toThrow();
  });
});

describe("opening a SQL schema", () => {
  const SQL = "CREATE TABLE users (id INT PRIMARY KEY);\n";

  it("hands back an ER diagram, and says what it converted", async () => {
    const { file, imported } = await openAsMermaid(picked("schema.sql", SQL));
    expect(file.content).toContain("erDiagram");
    expect(file.name).toBe("schema.mmd");
    expect(imported).toMatchObject({ format: "sql", nodes: 1, edges: 0 });
  });

  it("finds the DDL past the preamble a dump opens with", async () => {
    // A `pg_dump` opens with pages of SET statements; requiring the file to
    // *start* with DDL would exclude every real one.
    const dump = `--
-- PostgreSQL database dump
--
SET statement_timeout = 0;
SET client_encoding = 'UTF8';

CREATE TABLE public.t (id integer NOT NULL);
`;
    expect(isSql(dump)).toBe(true);
    const { imported } = await openAsMermaid(picked("dump.sql", dump));
    expect(imported?.format).toBe("sql");
  });

  it("does not mistake Mermaid or DOT for SQL", () => {
    expect(isSql("flowchart TD\n a --> b\n")).toBe(false);
    expect(isSql("digraph { a -> b }")).toBe(false);
  });
});

describe("opening a PlantUML file", () => {
  it("hands back a sequence diagram", async () => {
    const puml = "@startuml\nA -> B : hi\n@enduml\n";
    expect(isPlantuml(puml)).toBe(true);
    const { file, imported } = await openAsMermaid(picked("flow.puml", puml));
    expect(file.content).toContain("sequenceDiagram");
    expect(imported).toMatchObject({ format: "plantuml", nodes: 2, edges: 1 });
  });

  it("routes a class diagram to the class converter, not the sequence one", async () => {
    const puml = "@startuml\nclass Order {\n  +int id\n}\nBase <|-- Order\n@enduml\n";
    const { file, imported } = await openAsMermaid(picked("model.puml", puml));
    expect(file.content).toContain("classDiagram");
    expect(imported).toMatchObject({ format: "plantuml", nodes: 2, edges: 1 });
  });

  it("routes a state diagram to the state converter", async () => {
    const puml = "@startuml\n[*] --> Idle\nIdle --> Busy : go\n@enduml\n";
    const { file } = await openAsMermaid(picked("states.puml", puml));
    expect(file.content).toContain("stateDiagram-v2");
  });

  it("still says which family it is for one it cannot convert", async () => {
    // Better than "not valid Mermaid", which is what refusing to recognise
    // the file at all would have produced.
    const puml = "@startuml\nobject o1\n@enduml\n";
    await expect(openAsMermaid(picked("model.puml", puml))).rejects.toThrow(/object diagram/);
  });
});

describe("opening an Excalidraw scene", () => {
  it("hands back a flowchart", async () => {
    const json = JSON.stringify({
      type: "excalidraw",
      elements: [
        { id: "a", type: "rectangle", x: 0, y: 0, width: 100, height: 50, text: "A" },
        { id: "b", type: "rectangle", x: 0, y: 200, width: 100, height: 50, text: "B" },
        {
          id: "e",
          type: "arrow",
          x: 0,
          y: 0,
          startBinding: { elementId: "a" },
          endBinding: { elementId: "b" },
        },
      ],
    });
    expect(isExcalidraw(json)).toBe(true);
    const { file, imported } = await openAsMermaid(picked("scene.excalidraw", json));
    expect(file.name).toBe("scene.mmd");
    expect(imported).toMatchObject({ format: "excalidraw", nodes: 2, edges: 1 });
  });

  it("does not mistake other JSON for a scene", () => {
    expect(isExcalidraw('{"type":"module","name":"x"}')).toBe(false);
  });
});

describe("opening a binary drawing", () => {
  it("sends the bytes to the Visio reader rather than the text", async () => {
    // The one format that is not text. `content` is empty by construction —
    // decoding a zip as UTF-8 destroys it — so the dispatch has to key off
    // the bytes or it would find nothing to convert.
    const bytes = zipSync({
      "visio/pages/pages.xml": strToU8(
        '<Pages><Page ID="0" NameU="P"><PageSheet><Cell N="PageHeight" V="11"/></PageSheet></Page></Pages>',
      ),
      "visio/pages/page1.xml": strToU8(
        '<PageContents><Shapes><Shape ID="1" Type="Shape"><Cell N="PinX" V="1"/><Cell N="PinY" V="10"/><Text>Only</Text></Shape></Shapes></PageContents>',
      ),
    });
    const file: PickedFile = {
      name: "drawing.vsdx",
      content: "",
      path: "C:/work/drawing.vsdx",
      handle: null,
      bytes,
    };

    const opened = await openAsMermaid(file);
    expect(opened.file.name).toBe("drawing.mmd");
    expect(opened.file.content).toContain('Only["Only"]');
    expect(opened.imported).toMatchObject({ format: "vsdx", nodes: 1 });
    expect(opened.file.path).toBeNull();
  });
});
