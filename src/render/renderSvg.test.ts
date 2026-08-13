import { describe, expect, it } from "vitest";
import { renderSvg, UnsupportedFamilyError } from "./renderSvg";
import type { AnyNode, FlowEdge } from "../model/types";

/**
 * The emitter, checked for the three things a string renderer has to get right:
 * that it is well-formed XML, that the diagram is actually in it, and that a
 * label cannot climb out of it.
 *
 * The last one is not a nicety. Labels arrive from `?code=` links, from the
 * embed bridge and from opened files, and the output is a string that whatever
 * embeds it will put on a page without parsing it again. Nothing downstream is
 * going to catch what `esc` misses.
 */

function shape(id: string, label: string, x: number, y: number, extra = {}): AnyNode {
  return {
    id,
    type: "shape",
    position: { x, y },
    data: { label, shape: "square", direction: "TB", ...extra },
  } as unknown as AnyNode;
}

function edge(source: string, target: string, label = ""): FlowEdge {
  return { id: `${source}-${target}`, source, target, data: { label } };
}

/** Parsed, so "is it well-formed" is answered by a parser and not by a regex. */
function parse(svg: string): Document {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const error = doc.querySelector("parsererror");
  if (error) throw new Error(`not well-formed: ${error.textContent}`);
  return doc;
}

const twoNodes = () => [shape("a", "Start", 0, 0), shape("b", "Finish", 0, 200)];

describe("the document it produces", () => {
  it("is well-formed SVG", () => {
    const doc = parse(renderSvg(twoNodes(), [edge("a", "b")], "flowchart"));
    expect(doc.documentElement.tagName).toBe("svg");
  });

  it("sizes the canvas around what is drawn, with padding on each side", () => {
    const doc = parse(renderSvg(twoNodes(), [], "flowchart", { padding: 24 }));
    const svg = doc.documentElement;
    // Two 160×54 nodes 200 apart: 160 + 48 across, 254 + 48 down.
    expect(svg.getAttribute("width")).toBe("208");
    expect(svg.getAttribute("height")).toBe("302");
  });

  it("draws a group behind the nodes it contains", () => {
    const group = {
      id: "g",
      type: "group",
      position: { x: 0, y: 0 },
      style: { width: 400, height: 300 },
      data: { label: "VPC", subgraphId: "vpc" },
    } as unknown as AnyNode;
    const child = shape("a", "Inside", 20, 40);
    (child as unknown as { parentId: string }).parentId = "g";

    const svg = renderSvg([child, group], [], "flowchart");
    // Whatever order they arrived in, the frame is emitted first.
    expect(svg.indexOf('class="gf"')).toBeLessThan(svg.indexOf('class="sf"'));
  });

  it("refuses a family it cannot draw, rather than drawing half of one", () => {
    // One left, with its reason recorded at `SUPPORTED`: a sequence diagram's
    // geometry is not routed at all, so it needs its own placement rather than
    // another case in the dispatcher.
    expect(() => renderSvg([], [], "sequence")).toThrow(UnsupportedFamilyError);
    expect(() => renderSvg([], [], "sequence")).toThrow(/not implemented/);
  });

  it("has something to say about an empty diagram", () => {
    const doc = parse(renderSvg([], [], "flowchart"));
    expect(doc.documentElement.tagName).toBe("svg");
  });
});

describe("what is in it", () => {
  it("draws every node", () => {
    const doc = parse(renderSvg(twoNodes(), [], "flowchart"));
    expect(doc.querySelectorAll("rect.sf")).toHaveLength(2);
  });

  it("draws every edge, with an arrowhead", () => {
    const doc = parse(renderSvg(twoNodes(), [edge("a", "b")], "flowchart"));
    const paths = doc.querySelectorAll("path.e");
    expect(paths).toHaveLength(1);
    expect(paths[0].getAttribute("marker-end")).toBe("url(#arch-arrow)");
    expect(doc.querySelector("marker#arch-arrow")).not.toBeNull();
  });

  it("carries its labels", () => {
    const svg = renderSvg(twoNodes(), [edge("a", "b", "then")], "flowchart");
    expect(svg).toContain("Start");
    expect(svg).toContain("Finish");
    expect(svg).toContain("then");
  });

  it("honours a node's own colours, as an inline style", () => {
    // Inline, not `fill="…"`, and the distinction is the whole bug: the
    // document carries a `<style>` with `.sf { fill: … }`, and in SVG a CSS
    // rule beats a presentation attribute. The colours were in the file and
    // painted nothing.
    const styled = shape("a", "Painted", 0, 0, { styles: ["fill:#f9f", "stroke:#333"] });
    const doc = parse(renderSvg([styled], [], "flowchart"));
    const body = doc.querySelector("rect.sf");
    expect(body?.getAttribute("style")).toBe("fill:#f9f;stroke:#333");
    expect(body?.getAttribute("fill")).toBeNull();
  });

  it("colours a node through a classDef it belongs to", () => {
    // `classDef hot …` + `class a hot` is how a flowchart colours a *set*, and
    // it used to be dropped entirely: the emitter read only `data.styles`.
    const member = shape("a", "Hot", 0, 0, { classes: ["hot"] });
    const doc = parse(
      renderSvg([member], [], "flowchart", {
        classDefs: { hot: ["fill:#c04", "color:#fff"] },
      }),
    );
    expect(doc.querySelector("rect.sf")?.getAttribute("style")).toContain("fill:#c04");
    expect(doc.querySelector("text.t tspan")?.getAttribute("style")).toContain("fill:#fff");
  });

  it("lets an inline style win over the class it also carries", () => {
    const both = shape("a", "Both", 0, 0, { classes: ["hot"], styles: ["fill:#0f0"] });
    const doc = parse(
      renderSvg([both], [], "flowchart", { classDefs: { hot: ["fill:#c04"] } }),
    );
    expect(doc.querySelector("rect.sf")?.getAttribute("style")).toBe("fill:#0f0");
  });

  it("colours the families that are not flowchart shapes", () => {
    // States, ER entities and classes ignored their `style` statements
    // altogether — only flowchart shapes were painted.
    const state = {
      id: "s",
      type: "state",
      position: { x: 0, y: 0 },
      data: {
        label: "Busy",
        stateType: "normal",
        direction: "TB",
        styles: ["fill:#ff8800"],
      },
    } as unknown as AnyNode;
    const doc = parse(renderSvg([state], [], "state"));
    expect(doc.querySelector("rect.sf")?.getAttribute("style")).toContain("fill:#ff8800");
  });

  it("paints the ground, unless asked not to", () => {
    expect(renderSvg(twoNodes(), [], "flowchart")).toContain('fill="#0f1014"');
    const bare = renderSvg(twoNodes(), [], "flowchart", { background: false });
    expect(bare).not.toContain('width="100%"');
  });

  it("takes the light palette when asked for it", () => {
    const light = renderSvg(twoNodes(), [], "flowchart", { theme: "light" });
    expect(light).toContain("#ffffff");
    expect(light).not.toContain("#1c1f2b");
  });

  it("keeps its own style rules inside the document", () => {
    // The point of the exercise: nothing here may depend on a stylesheet that
    // lives in the page the SVG lands in.
    const doc = parse(renderSvg(twoNodes(), [], "flowchart"));
    const style = doc.querySelector("style");
    expect(style?.textContent).toContain(".sf{fill:");
  });
});

describe("the other families", () => {
  const node = (type: string, data: Record<string, unknown>, y = 0): AnyNode =>
    ({ id: `${type}-${y}`, type, position: { x: 0, y }, data }) as unknown as AnyNode;

  it("draws a state, and the markers that carry no text", () => {
    const doc = parse(
      renderSvg(
        [
          node("state", { label: "Idle", stateType: "normal", direction: "TB" }, 0),
          node("state", { label: "", stateType: "start", direction: "TB" }, 120),
          node("state", { label: "", stateType: "choice", direction: "TB" }, 240),
          node("state", { label: "", stateType: "fork", direction: "TB" }, 360),
        ],
        [],
        "state",
      ),
    );
    expect(doc.querySelectorAll("rect.sf")).toHaveLength(1); // the named one
    expect(doc.querySelectorAll("polygon.sf")).toHaveLength(1); // the choice
    expect(doc.querySelectorAll("circle.bar")).toHaveLength(1); // the start
    expect(doc.querySelectorAll("rect.bar")).toHaveLength(1); // the fork
  });

  it("draws an ER entity with its attributes in it", () => {
    const svg = renderSvg(
      [
        node("entity", {
          label: "CUSTOMER",
          direction: "TB",
          attributes: [{ type: "int", name: "id", keys: ["PK"], comment: "" }],
        }),
      ],
      [],
      "er",
    );
    parse(svg);
    expect(svg).toContain("CUSTOMER");
    expect(svg).toContain("id");
    expect(svg).toContain("PK");
  });

  it("draws a class with its members and methods", () => {
    const svg = renderSvg(
      [
        node("class", {
          label: "Account",
          direction: "TB",
          members: ["+id: int"],
          methods: ["+close(): void"],
          annotations: ["interface"],
        }),
      ],
      [],
      "class",
    );
    parse(svg);
    expect(svg).toContain("Account");
    expect(svg).toContain("+close(): void");
    expect(svg).toContain("«interface»");
  });

  it("draws a C4 element with its tag and description", () => {
    const svg = renderSvg(
      [
        node("c4", {
          label: "Payments",
          c4Shape: "system",
          descr: "Handles settlement",
          direction: "TB",
        }),
      ],
      [],
      "c4",
    );
    parse(svg);
    expect(svg).toContain("Payments");
    expect(svg).toContain("System"); // from C4_TAGS, not the raw shape name
    expect(svg).toContain("Handles settlement");
  });

  it("draws an architecture service with the icon it was handed", () => {
    const service = node("service", {
      label: "Postgres",
      icon: "database",
      direction: "TB",
    });
    const doc = parse(
      renderSvg([service], [], "architecture", {
        icons: { database: '<svg viewBox="0 0 24 24" width="1em"><path d="M1 1h4"/></svg>' },
      }),
    );
    const icon = doc.querySelector("svg svg");
    expect(icon).not.toBeNull();
    // The pack's own `1em` is dropped for a size that fits the node.
    expect(icon?.getAttribute("width")).not.toBe("1em");
    expect(Number(icon?.getAttribute("width"))).toBeGreaterThan(0);
    expect(doc.querySelector("path")).not.toBeNull();
  });

  it("still draws a service whose icon nobody resolved", () => {
    // A diagram missing one logo is a diagram. A diagram missing every node is
    // not, which is what returning nothing here would produce.
    const service = node("service", { label: "Cache", icon: "redis", direction: "TB" });
    const svg = renderSvg([service], [], "architecture");
    parse(svg);
    expect(svg).toContain("Cache");
  });

  it("brings every marker a family's edges might end in", () => {
    // A class diagram ends in diamonds and an ER diagram in crow's feet. Both
    // come from the same table the canvas draws from.
    const doc = parse(renderSvg([shape("a", "x", 0, 0)], [], "flowchart"));
    for (const id of ["cls-extension", "cls-composition", "er-one-more", "arch-arrow"]) {
      expect(doc.querySelector(`marker#${id}`), id).not.toBeNull();
    }
  });
});

describe("a label cannot climb out", () => {
  it("escapes markup in a node label", () => {
    const svg = renderSvg([shape("a", "<script>alert(1)</script>", 0, 0)], [], "flowchart");
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    parse(svg);
  });

  it("escapes markup in an edge label", () => {
    const svg = renderSvg(twoNodes(), [edge("a", "b", '"><script>x</script>')], "flowchart");
    expect(svg).not.toContain("<script>");
    parse(svg);
  });

  it("escapes a quote that would otherwise end an attribute", () => {
    const svg = renderSvg([shape("a", 'a" onload="alert(1)', 0, 0)], [], "flowchart");
    expect(svg).not.toContain('onload="alert(1)"');
    parse(svg);
  });

  it("escapes a colour that is really markup", () => {
    // Custom styles reach an attribute value, and they come from the file too.
    const svg = renderSvg(
      [shape("a", "x", 0, 0, { styles: ['fill:"><script>x</script>'] })],
      [],
      "flowchart",
    );
    expect(svg).not.toContain("<script>");
    parse(svg);
  });

  it("turns a line break into a second line, not an opening tag", () => {
    // `<br>` is Mermaid's own spelling inside a label. As SVG text there is no
    // break element to emit — the line becomes a second `<tspan>` on its own
    // baseline, which is also what makes the break survive an `<img>`.
    const svg = renderSvg([shape("a", "one<br>two", 0, 0)], [], "flowchart");
    const doc = parse(svg);
    const spans = [...doc.querySelectorAll("text.t tspan")].map((t) => t.textContent);
    expect(spans).toEqual(["one", "two"]);
    expect(svg).not.toContain("<br");
  });
});
