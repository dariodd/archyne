import { describe, expect, it } from "vitest";
import { renderSvg } from "./renderSvg";
import type { AnyNode, FlowEdge } from "../model/types";

/**
 * Where everything lands, pinned.
 *
 * The other tests check that the right elements exist and that a label cannot
 * escape. Neither would notice a box drawn twenty pixels short, a row of a
 * class landing on top of the one above it, or an arrowhead that stopped
 * reaching its node — the failures that make a picture wrong while leaving
 * every assertion true.
 *
 * So the coordinates themselves are the assertion. Not pixels: a screenshot
 * comparison would be at the mercy of whichever fonts the machine happens to
 * have, and would fail on Linux for reasons that are not about us. A digest of
 * the geometry is deterministic, and a diff on it reads as "this box moved",
 * which is the sentence you want when it breaks.
 *
 * Deterministic because the unit environment has no canvas, so `textMetrics`
 * answers with its approximation — arithmetic, identical on every machine. The
 * numbers here are therefore not "what a browser draws"; that is
 * `tests/e2e-measure.mts`'s job. These are "what the emitter decided", which is
 * the thing a regression changes.
 */

function node(id: string, type: string, data: Record<string, unknown>, y: number): AnyNode {
  return { id, type, position: { x: 0, y }, data } as unknown as AnyNode;
}

/** The positional attributes of every element, one per line. */
function geometry(svg: string): string {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (doc.querySelector("parsererror")) throw new Error("not well-formed");
  const keep = [
    "class",
    "x",
    "y",
    "width",
    "height",
    "rx",
    "cx",
    "cy",
    "r",
    "x1",
    "y1",
    "x2",
    "y2",
    "points",
    "transform",
    "d",
    "font-size",
    "text-anchor",
  ];
  const lines: string[] = [];
  const walk = (el: Element, depth: number) => {
    const attrs = keep
      .filter((a) => el.hasAttribute(a))
      .map((a) => `${a}=${el.getAttribute(a)}`)
      .join(" ");
    const text = el.children.length === 0 && el.textContent ? ` "${el.textContent}"` : "";
    lines.push(`${"  ".repeat(depth)}${el.tagName}${attrs ? " " + attrs : ""}${text}`);
    for (const child of el.children) walk(child, depth + 1);
  };
  // The `<style>` block is paint, not geometry, and it has its own cases.
  for (const child of doc.documentElement.children) {
    if (child.tagName !== "style" && child.tagName !== "defs") walk(child, 0);
  }
  return lines.join("\n");
}

describe("the geometry it emits", () => {
  it("places a flowchart the same way every time", () => {
    const nodes: AnyNode[] = [
      node("start", "shape", { label: "Start", shape: "stadium", direction: "TB" }, 0),
      node("check", "shape", { label: "Valid?", shape: "diamond", direction: "TB" }, 140),
      node(
        "work",
        "shape",
        { label: "Process the request", shape: "square", direction: "TB" },
        300,
      ),
    ];
    const edges: FlowEdge[] = [
      { id: "e1", source: "start", target: "check", data: { label: "" } },
      { id: "e2", source: "check", target: "work", data: { label: "yes" } },
    ];
    expect(geometry(renderSvg(nodes, edges, "flowchart"))).toMatchSnapshot();
  });

  it("stacks a class's rows the same way every time", () => {
    const nodes = [
      node(
        "Account",
        "class",
        {
          label: "Account",
          direction: "TB",
          members: ["+id: int", "+holder: String"],
          methods: ["+close(): void"],
          annotations: ["interface"],
        },
        0,
      ),
    ];
    expect(geometry(renderSvg(nodes, [], "class"))).toMatchSnapshot();
  });

  it("stacks an ER entity's attributes the same way every time", () => {
    const nodes = [
      node(
        "CUSTOMER",
        "entity",
        {
          label: "CUSTOMER",
          direction: "TB",
          attributes: [
            { type: "int", name: "id", keys: ["PK"], comment: "" },
            { type: "timestamptz", name: "created_at", keys: [], comment: "" },
          ],
        },
        0,
      ),
    ];
    expect(geometry(renderSvg(nodes, [], "er"))).toMatchSnapshot();
  });

  it("places a C4 element the same way every time", () => {
    const nodes = [
      node(
        "user",
        "c4",
        { label: "A person", c4Shape: "person", descr: "Uses the system", direction: "TB" },
        0,
      ),
    ];
    expect(geometry(renderSvg(nodes, [], "c4"))).toMatchSnapshot();
  });
});
