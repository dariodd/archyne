import { describe, expect, it } from "vitest";
import { isPlainNode, patchNodeStyles, readNodeStyles, stripNodeStyles } from "./nodeStyle";

const DIAGRAM = "architecture-beta\n  service web(internet)[Web]\n";

describe("reading the node presentation line", () => {
  it("finds nothing in a file that has none", () => {
    expect(readNodeStyles(DIAGRAM)).toBeNull();
  });

  it("reads a node asked to show its icon alone", () => {
    const code = `${DIAGRAM}%% graph:nodes {"web":{"look":"icon"}}\n`;
    expect(readNodeStyles(code)).toEqual({ web: { look: "icon" } });
  });

  it("refuses a look it does not know", () => {
    expect(readNodeStyles(`${DIAGRAM}%% graph:nodes {"web":{"look":"hexagon"}}\n`)).toEqual({});
  });

  it("drops the default rather than carrying it about", () => {
    expect(readNodeStyles(`${DIAGRAM}%% graph:nodes {"web":{"look":"boxed"}}\n`)).toEqual({});
  });

  it("survives a line that is not JSON at all", () => {
    expect(readNodeStyles(`${DIAGRAM}%% graph:nodes {oops\n`)).toBeNull();
  });
});

describe("writing it back", () => {
  it("adds the line when there is something to say", () => {
    expect(patchNodeStyles(DIAGRAM, { web: { look: "icon" } })).toContain(
      '%% graph:nodes {"web":{"look":"icon"}}',
    );
  });

  it("leaves no line when every node is ordinary", () => {
    expect(patchNodeStyles(DIAGRAM, { web: { look: "boxed" } })).not.toContain("graph:nodes");
  });

  it("replaces the line rather than stacking another up", () => {
    const once = patchNodeStyles(DIAGRAM, { web: { look: "icon" } });
    const twice = patchNodeStyles(once, { web: { look: "icon" }, db: { look: "icon" } });
    expect(twice.match(/graph:nodes/g)).toHaveLength(1);
    expect(twice).toContain("db");
  });

  it("takes the line away when the last node goes back to ordinary", () => {
    const once = patchNodeStyles(DIAGRAM, { web: { look: "icon" } });
    expect(patchNodeStyles(once, {})).not.toContain("graph:nodes");
  });

  it("comes back out the way it went in", () => {
    const style = { web: { look: "icon" as const } };
    expect(readNodeStyles(patchNodeStyles(DIAGRAM, style))).toEqual(style);
  });

  it("strips the line without disturbing the diagram", () => {
    const code = patchNodeStyles(DIAGRAM, { web: { look: "icon" } });
    expect(stripNodeStyles(code).trim()).toBe(DIAGRAM.trim());
  });
});

describe("telling an ordinary node from a styled one", () => {
  it("counts nothing and the default as ordinary", () => {
    expect(isPlainNode(undefined)).toBe(true);
    expect(isPlainNode({})).toBe(true);
    expect(isPlainNode({ look: "boxed" })).toBe(true);
  });

  it("counts the icon alone as worth keeping", () => {
    expect(isPlainNode({ look: "icon" })).toBe(false);
  });
});
