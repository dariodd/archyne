import { describe, expect, it } from "vitest";
import { excalidrawToMermaid } from "./fromExcalidraw";
import { parseDiagram } from "./diagram";
import { readPositions } from "./positions";

type Element = Record<string, unknown>;

const scene = (elements: Element[]) =>
  JSON.stringify({ type: "excalidraw", version: 2, elements });

const shape = (id: string, type: string, extra: Element = {}): Element => ({
  id,
  type,
  x: 0,
  y: 0,
  width: 120,
  height: 60,
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  ...extra,
});

const text = (id: string, containerId: string, value: string): Element => ({
  id,
  type: "text",
  x: 0,
  y: 0,
  width: 40,
  height: 20,
  text: value,
  containerId,
});

const arrow = (id: string, from: string, to: string, extra: Element = {}): Element => ({
  id,
  type: "arrow",
  x: 0,
  y: 0,
  width: 100,
  height: 0,
  startBinding: { elementId: from },
  endBinding: { elementId: to },
  ...extra,
});

function lineFor(code: string, id: string): string {
  const line = code.split("\n").find((l) => l.trim().startsWith(id));
  if (!line) throw new Error(`no line for ${id} in\n${code}`);
  return line.trim();
}

describe("shapes and their text", () => {
  it("reads a box and the text bound to it", () => {
    // The text is a separate element pointing back at the box, which is how
    // Excalidraw stores every label.
    const { code, nodes } = excalidrawToMermaid(
      scene([shape("a", "rectangle"), text("t1", "a", "Start")]),
    );
    expect(nodes).toBe(1);
    expect(lineFor(code, "Start")).toBe('Start["Start"]');
  });

  it("keeps the line breaks in a label", () => {
    const { code } = excalidrawToMermaid(
      scene([shape("a", "rectangle"), text("t1", "a", "two\nlines")]),
    );
    expect(code).toContain('["two<br/>lines"]');
  });

  it.each([
    ["rectangle", 120, 60, 'Q["Q"]'],
    ["diamond", 120, 60, 'Q{"Q"}'],
    ["ellipse", 160, 60, 'Q(["Q"])'],
    ["ellipse", 80, 80, 'Q(("Q"))'],
  ])("maps %s %sx%s", (type, width, height, expected) => {
    const { code } = excalidrawToMermaid(
      scene([shape("a", type, { width, height }), text("t", "a", "Q")]),
    );
    expect(lineFor(code, "Q")).toBe(expected);
  });

  it("carries the colours, with text that can be read on the fill", () => {
    const { code } = excalidrawToMermaid(
      scene([
        shape("a", "rectangle", { backgroundColor: "#d0f0c0", strokeColor: "#2f9e44" }),
        text("t", "a", "A"),
      ]),
    );
    expect(code).toContain("style A fill:#d0f0c0,stroke:#2f9e44,color:#111111");
  });

  it("treats a transparent background as no fill at all", () => {
    const { code } = excalidrawToMermaid(scene([shape("a", "rectangle"), text("t", "a", "A")]));
    expect(code).toContain("style A stroke:#1e1e1e");
    expect(code).not.toContain("fill:");
  });
});

describe("what does not come across", () => {
  it("leaves out freehand, images and lines, and counts them", () => {
    const { nodes, dropped } = excalidrawToMermaid(
      scene([
        shape("a", "rectangle"),
        shape("f", "freedraw"),
        shape("i", "image"),
        shape("l", "line"),
      ]),
    );
    expect(nodes).toBe(1);
    expect(dropped).toBe(3);
  });

  it("does not resurrect a deleted element", () => {
    // Excalidraw keeps them in the file until the next fresh save.
    const { nodes } = excalidrawToMermaid(
      scene([shape("a", "rectangle"), shape("b", "rectangle", { isDeleted: true })]),
    );
    expect(nodes).toBe(1);
  });

  it("refuses something that is not a scene", () => {
    expect(() => excalidrawToMermaid("{ nope")).toThrow(/valid JSON/);
    expect(() => excalidrawToMermaid('{"type":"excalidraw"}')).toThrow(/no Excalidraw scene/);
  });
});

describe("arrows", () => {
  const two = [
    shape("a", "rectangle"),
    text("ta", "a", "A"),
    shape("b", "rectangle", { x: 300 }),
    text("tb", "b", "B"),
  ];

  it("joins the shapes its bindings name", () => {
    // Bindings, not geometry: an arrow that visually touches a box may not be
    // bound to it, and one that is bound may be dragged clear of it.
    const { code, edges } = excalidrawToMermaid(scene([...two, arrow("e", "a", "b")]));
    expect(edges).toBe(1);
    expect(code).toContain("A --> B");
  });

  it("reads the label an arrow carries", () => {
    const { code } = excalidrawToMermaid(
      scene([...two, arrow("e", "a", "b"), text("te", "e", "yes")]),
    );
    expect(code).toContain('A -->|"yes"| B');
  });

  it.each([
    [{ strokeStyle: "dashed" }, "A -.-> B"],
    [{ strokeStyle: "dotted" }, "A -.-> B"],
    [{ strokeWidth: 4 }, "A ==> B"],
    [{ endArrowhead: "none" }, "A --- B"],
    [{ endArrowhead: "circle" }, "A --o B"],
    [{ startArrowhead: "arrow" }, "A <--> B"],
  ])("maps %o", (extra, expected) => {
    const { code } = excalidrawToMermaid(scene([...two, arrow("e", "a", "b", extra)]));
    expect(code).toContain(expected);
  });

  it("leaves out an arrow bound to nothing", () => {
    const { edges, dropped } = excalidrawToMermaid(
      scene([
        ...two,
        {
          id: "e",
          type: "arrow",
          x: 0,
          y: 0,
          startBinding: { elementId: "a" },
          endBinding: null,
        },
      ]),
    );
    expect([edges, dropped]).toEqual([0, 1]);
  });
});

describe("frames and layout", () => {
  const FRAMED = scene([
    { id: "f", type: "frame", x: 100, y: 100, width: 400, height: 300, name: "Backend" },
    shape("a", "rectangle", { x: 140, y: 160, frameId: "f" }),
    text("ta", "a", "Api"),
    shape("b", "rectangle", { x: 600, y: 40 }),
    text("tb", "b", "Client"),
  ]);

  it("makes a frame a subgraph holding its shapes", () => {
    const { code } = excalidrawToMermaid(FRAMED);
    expect(code).toMatch(/subgraph Backend \["Backend"\]\n\s+Api\["Api"\]\n\s+end/);
    expect(lineFor(code, "Client")).toBe('Client["Client"]');
  });

  it("makes a framed shape's position relative to its frame", () => {
    // The canvas positions a child inside its container; the scene file
    // positions everything absolutely.
    const positions = readPositions(excalidrawToMermaid(FRAMED).code)!;
    expect(positions.Backend).toEqual({ x: 100, y: 100, w: 400, h: 300 });
    expect(positions.Api).toEqual({ x: 40, y: 60, w: 120, h: 60 });
    expect(positions.Client).toEqual({ x: 600, y: 40, w: 120, h: 60 });
  });
});

describe("what comes out is a Mermaid document", () => {
  it("parses back, with every shape, arrow and frame intact", async () => {
    const json = scene([
      { id: "f", type: "frame", x: 0, y: 0, width: 500, height: 400, name: "Core" },
      shape("a", "ellipse", { x: 20, y: 20, width: 80, height: 80, frameId: "f" }),
      text("ta", "a", "Start"),
      shape("b", "diamond", { x: 20, y: 160, frameId: "f", backgroundColor: "#ffec99" }),
      text("tb", "b", "Ok?"),
      shape("c", "rectangle", { x: 600, y: 160 }),
      text("tc", "c", "Done"),
      arrow("e1", "a", "b"),
      arrow("e2", "b", "c", { strokeStyle: "dashed" }),
      text("te2", "e2", "no"),
    ]);

    const graph = await parseDiagram(excalidrawToMermaid(json).code);
    expect(graph.kind).toBe("flowchart");
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(["Core", "Done", "Ok", "Start"]);
    expect(graph.nodes.find((n) => n.id === "Start")?.parentId).toBe("Core");
    expect(graph.nodes.find((n) => n.id === "Done")?.parentId).toBeUndefined();
    expect(graph.edges.map((e) => [e.source, e.target, e.data?.label])).toEqual([
      ["Start", "Ok", ""],
      ["Ok", "Done", "no"],
    ]);
    expect(graph.edges[1].data?.stroke).toBe("dotted");
  });
});
