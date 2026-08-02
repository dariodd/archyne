import { describe, expect, it } from "vitest";
import {
  carryOverWaypoints,
  patchWaypoints,
  readWaypoints,
  stripWaypoints,
  waypointKeys,
  waypointKey,
} from "./waypoints";

const BASE = 'flowchart TD\n  a["One"] --> b["Two"]\n';

describe("keying an edge across re-parses", () => {
  it("names an edge by its endpoints", () => {
    expect(waypointKey("a", "b", 0)).toBe("a>b");
  });

  it("numbers repeats between the same pair", () => {
    const keys = waypointKeys([
      { id: "e0_a_b", source: "a", target: "b" },
      { id: "e1_a_b", source: "a", target: "b" },
      { id: "e2_a_c", source: "a", target: "c" },
    ]);
    expect([...keys.values()]).toEqual(["a>b", "a>b#1", "a>c"]);
  });

  it("leaves the first of a pair unnumbered, so adding a second does not rename it", () => {
    const one = waypointKeys([{ id: "e0", source: "a", target: "b" }]);
    const two = waypointKeys([
      { id: "e0", source: "a", target: "b" },
      { id: "e1", source: "a", target: "b" },
    ]);
    expect(two.get("e0")).toBe(one.get("e0"));
  });

  it("does not follow the edge index, which the file decides", () => {
    // `e3_a_b` becomes `e4_a_b` the moment a line is inserted above it.
    const keys = waypointKeys([{ id: "e3_a_b", source: "a", target: "b" }]);
    expect(keys.get("e3_a_b")).toBe("a>b");
  });

  it("tells apart the two directions of the same pair", () => {
    const keys = waypointKeys([
      { id: "e0", source: "a", target: "b" },
      { id: "e1", source: "b", target: "a" },
    ]);
    expect([...keys.values()]).toEqual(["a>b", "b>a"]);
  });
});

describe("the waypoints comment", () => {
  it("round-trips through the file", () => {
    const code = patchWaypoints(BASE, {
      "a>b": [
        { x: 120, y: 80 },
        { x: 120.4, y: 160.6 },
      ],
    });
    expect(readWaypoints(code)).toEqual({
      "a>b": [
        { x: 120, y: 80 },
        { x: 120, y: 161 },
      ],
    });
  });

  it("leaves the diagram itself untouched", () => {
    const code = patchWaypoints(BASE, { "a>b": [{ x: 1, y: 2 }] });
    expect(stripWaypoints(code)).toBe(BASE);
  });

  it("replaces the line rather than adding a second one", () => {
    let code = patchWaypoints(BASE, { "a>b": [{ x: 1, y: 2 }] });
    code = patchWaypoints(code, { "a>b": [{ x: 9, y: 9 }] });
    expect(code.match(/graph:waypoints/g)).toHaveLength(1);
    expect(readWaypoints(code)).toEqual({ "a>b": [{ x: 9, y: 9 }] });
  });

  it("removes the line when nothing is left bent", () => {
    const code = patchWaypoints(patchWaypoints(BASE, { "a>b": [{ x: 1, y: 2 }] }), {});
    // A diagram with no bent edges reads exactly like one that never had any.
    expect(code).toBe(BASE);
    expect(readWaypoints(code)).toBeNull();
  });

  it("drops an edge whose corners were all removed", () => {
    const code = patchWaypoints(BASE, { "a>b": [], "a>c": [{ x: 5, y: 5 }] });
    expect(readWaypoints(code)).toEqual({ "a>c": [{ x: 5, y: 5 }] });
  });

  it("reads nothing from a file that has no such comment", () => {
    expect(readWaypoints(BASE)).toBeNull();
  });

  it("survives a corrupted line instead of throwing", () => {
    expect(readWaypoints(`${BASE}%% graph:waypoints {not json}\n`)).toBeNull();
  });

  it("skips a point that is not a pair of numbers", () => {
    const code = `${BASE}%% graph:waypoints {"a>b":[[1,2],[null,4],["x","y"],[5,6]]}\n`;
    // A half-read point would put a corner at NaN and take the path with it.
    expect(readWaypoints(code)).toEqual({
      "a>b": [
        { x: 1, y: 2 },
        { x: 5, y: 6 },
      ],
    });
  });

  it("coexists with the positions comment", () => {
    const withPositions = `${BASE}\n%% graph:positions {"a":{"x":0,"y":0}}\n`;
    const code = patchWaypoints(withPositions, { "a>b": [{ x: 7, y: 8 }] });
    expect(code).toContain("graph:positions");
    expect(readWaypoints(code)).toEqual({ "a>b": [{ x: 7, y: 8 }] });
  });
});

describe("carrying waypoints across a rewrite", () => {
  const bent = patchWaypoints(BASE, {
    "a>b": [{ x: 10, y: 20 }],
    "a>c": [{ x: 30, y: 40 }],
  });

  it("keeps the corners of edges that are still there", () => {
    const rewritten = carryOverWaypoints(bent, BASE, ["a>b"]);
    expect(readWaypoints(rewritten)).toEqual({ "a>b": [{ x: 10, y: 20 }] });
  });

  it("does not resurrect an edge the rewrite removed", () => {
    const rewritten = carryOverWaypoints(bent, BASE, ["a>b"]);
    expect(readWaypoints(rewritten)?.["a>c"]).toBeUndefined();
  });

  it("defers to a rewrite that brought its own", () => {
    const incoming = patchWaypoints(BASE, { "a>b": [{ x: 99, y: 99 }] });
    expect(carryOverWaypoints(bent, incoming, ["a>b"])).toBe(incoming);
  });

  it("leaves a rewrite alone when there was nothing to carry", () => {
    expect(carryOverWaypoints(BASE, BASE, ["a>b"])).toBe(BASE);
  });
});
