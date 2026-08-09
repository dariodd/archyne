import { describe, expect, it } from "vitest";
import {
  carryOverEdgeStyles,
  isPlain,
  patchEdgeStyles,
  readEdgeStyles,
  stripEdgeStyles,
} from "./edgeStyle";

const DIAGRAM = 'flowchart LR\n  a["A"] --> b["B"]\n';

describe("reading the edge presentation line", () => {
  it("finds nothing in a file that has none", () => {
    expect(readEdgeStyles(DIAGRAM)).toBeNull();
  });

  it("reads a dragged label and a routing choice", () => {
    const code = `${DIAGRAM}%% graph:edges {"a>b":{"label":[40,-12],"route":"straight"}}\n`;
    expect(readEdgeStyles(code)).toEqual({
      "a>b": { label: { x: 40, y: -12 }, route: "straight" },
    });
  });

  it("refuses a routing name it does not know", () => {
    const code = `${DIAGRAM}%% graph:edges {"a>b":{"route":"spiral"}}\n`;
    expect(readEdgeStyles(code)).toEqual({});
  });

  it("refuses half a label, which would put it at NaN", () => {
    const code = `${DIAGRAM}%% graph:edges {"a>b":{"label":[40]}}\n`;
    expect(readEdgeStyles(code)).toEqual({});
  });

  it("survives a line that is not JSON at all", () => {
    expect(readEdgeStyles(`${DIAGRAM}%% graph:edges {oops\n`)).toBeNull();
  });
});

describe("writing it back", () => {
  it("adds the line when there is something to say", () => {
    const code = patchEdgeStyles(DIAGRAM, { "a>b": { route: "curved" } });
    expect(code).toContain('%% graph:edges {"a>b":{"route":"curved"}}');
  });

  it("leaves no line when every edge is ordinary", () => {
    const code = patchEdgeStyles(DIAGRAM, { "a>b": { route: "orthogonal" } });
    expect(code).not.toContain("graph:edges");
  });

  it("omits an offset of nothing rather than writing zeroes", () => {
    const code = patchEdgeStyles(DIAGRAM, { "a>b": { label: { x: 0, y: 0 } } });
    expect(code).not.toContain("graph:edges");
  });

  it("replaces the line rather than stacking another one up", () => {
    const once = patchEdgeStyles(DIAGRAM, { "a>b": { route: "straight" } });
    const twice = patchEdgeStyles(once, { "a>b": { route: "curved" } });
    expect(twice.match(/graph:edges/g)).toHaveLength(1);
    expect(twice).toContain("curved");
  });

  it("takes the line away again when the last edge goes back to ordinary", () => {
    const once = patchEdgeStyles(DIAGRAM, { "a>b": { route: "straight" } });
    expect(patchEdgeStyles(once, {})).not.toContain("graph:edges");
  });

  it("comes back out the way it went in", () => {
    const style = { "a>b": { label: { x: 12, y: 34 }, route: "curved" as const } };
    expect(readEdgeStyles(patchEdgeStyles(DIAGRAM, style))).toEqual(style);
  });

  it("rounds coordinates, so the file stays readable", () => {
    const code = patchEdgeStyles(DIAGRAM, { "a>b": { label: { x: 12.4, y: 33.6 } } });
    expect(code).toContain('"label":[12,34]');
  });
});

describe("telling an ordinary edge from a styled one", () => {
  it("counts nothing, an empty object and the defaults as ordinary", () => {
    expect(isPlain(undefined)).toBe(true);
    expect(isPlain({})).toBe(true);
    expect(isPlain({ route: "orthogonal" })).toBe(true);
    expect(isPlain({ label: { x: 0, y: 0 } })).toBe(true);
  });

  it("counts a moved label or another routing as worth keeping", () => {
    expect(isPlain({ label: { x: 1, y: 0 } })).toBe(false);
    expect(isPlain({ route: "straight" })).toBe(false);
  });
});

describe("carrying styles across a rewrite", () => {
  const styled = `${DIAGRAM}%% graph:edges {"a>b":{"route":"straight"},"c>d":{"route":"curved"}}\n`;

  it("keeps the styles of edges that still exist", () => {
    const carried = carryOverEdgeStyles(styled, DIAGRAM, ["a>b"]);
    expect(readEdgeStyles(carried)).toEqual({ "a>b": { route: "straight" } });
  });

  it("drops the ones whose edges have gone", () => {
    const carried = carryOverEdgeStyles(styled, DIAGRAM, ["a>b"]);
    expect(carried).not.toContain("c>d");
  });

  it("lets a rewrite that brings its own styles win", () => {
    const fresh = `${DIAGRAM}%% graph:edges {"a>b":{"route":"curved"}}\n`;
    expect(readEdgeStyles(carryOverEdgeStyles(styled, fresh, ["a>b"]))).toEqual({
      "a>b": { route: "curved" },
    });
  });

  it("strips the line without disturbing the diagram", () => {
    expect(stripEdgeStyles(styled).trim()).toBe(DIAGRAM.trim());
  });
});
