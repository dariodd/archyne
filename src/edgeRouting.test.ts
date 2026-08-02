import { beforeEach, describe, expect, it } from "vitest";
import { useGraphStore } from "./store";
import { readWaypoints } from "./model/waypoints";

/**
 * Routing an edge by hand: the corners, and what has to stay true about them
 * once they are written into the file.
 */

const TWO = 'flowchart TD\n  a["One"] --> b["Two"]\n  b --> c["Three"]\n';

const load = (code: string) => useGraphStore.getState().applyCode(code);
const edge = (i = 0) => useGraphStore.getState().edges[i];
const points = (i = 0) => edge(i).data?.points ?? [];
const code = () => useGraphStore.getState().code;

beforeEach(() => {
  useGraphStore.setState({ unsupported: null, parseError: null, warning: null });
});

describe("editing the corners of an edge", () => {
  it("adds one and writes it out", async () => {
    await load(TWO);
    useGraphStore.getState().addWaypoint(edge().id, 0, { x: 120, y: 80 });
    expect(points()).toEqual([{ x: 120, y: 80 }]);
    expect(readWaypoints(code())).toEqual({ "a>b": [{ x: 120, y: 80 }] });
  });

  it("inserts at the index it is given, not at the end", async () => {
    await load(TWO);
    const id = edge().id;
    useGraphStore.getState().addWaypoint(id, 0, { x: 10, y: 10 });
    useGraphStore.getState().addWaypoint(id, 1, { x: 20, y: 20 });
    // Dragged out of the first segment, so it belongs before the others.
    useGraphStore.getState().addWaypoint(id, 0, { x: 5, y: 5 });
    expect(points().map((p) => p.x)).toEqual([5, 10, 20]);
  });

  it("moves one without disturbing the rest", async () => {
    await load(TWO);
    const id = edge().id;
    useGraphStore.getState().addWaypoint(id, 0, { x: 10, y: 10 });
    useGraphStore.getState().addWaypoint(id, 1, { x: 20, y: 20 });
    useGraphStore.getState().moveWaypoint(id, 0, { x: 99, y: 98 });
    expect(points()).toEqual([
      { x: 99, y: 98 },
      { x: 20, y: 20 },
    ]);
  });

  it("removes one", async () => {
    await load(TWO);
    const id = edge().id;
    useGraphStore.getState().addWaypoint(id, 0, { x: 10, y: 10 });
    useGraphStore.getState().addWaypoint(id, 1, { x: 20, y: 20 });
    useGraphStore.getState().removeWaypoint(id, 0);
    expect(points()).toEqual([{ x: 20, y: 20 }]);
  });

  it("straightens the edge, and takes the comment with it", async () => {
    await load(TWO);
    useGraphStore.getState().addWaypoint(edge().id, 0, { x: 10, y: 10 });
    useGraphStore.getState().clearWaypoints(edge().id);
    expect(points()).toEqual([]);
    // A diagram with nothing bent reads like one that never was.
    expect(code()).not.toContain("graph:waypoints");
  });

  it("rounds to whole pixels", async () => {
    await load(TWO);
    useGraphStore.getState().addWaypoint(edge().id, 0, { x: 10.6, y: 10.2 });
    expect(points()).toEqual([{ x: 11, y: 10 }]);
  });

  it("ignores an edge that is not there", async () => {
    await load(TWO);
    const before = code();
    useGraphStore.getState().addWaypoint("nope", 0, { x: 1, y: 1 });
    expect(code()).toBe(before);
  });
});

describe("a drag in progress", () => {
  it("does not write the file on every pointer move", async () => {
    await load(TWO);
    const before = code();
    useGraphStore.getState().addWaypoint(edge().id, 0, { x: 10, y: 10 }, false);
    useGraphStore.getState().moveWaypoint(edge().id, 0, { x: 20, y: 20 }, false);
    // Writing at 60fps would put one undo entry per frame on the stack.
    expect(code()).toBe(before);
    expect(points()).toEqual([{ x: 20, y: 20 }]);
  });

  it("writes once when the gesture ends", async () => {
    await load(TWO);
    useGraphStore.getState().addWaypoint(edge().id, 0, { x: 10, y: 10 }, false);
    useGraphStore.getState().commitWaypoints();
    expect(readWaypoints(code())).toEqual({ "a>b": [{ x: 10, y: 10 }] });
  });
});

describe("adding a corner without a pointer", () => {
  it("puts the first one halfway along the edge", async () => {
    await load(TWO);
    useGraphStore.getState().appendWaypoint(edge().id);
    expect(points()).toHaveLength(1);
  });

  it("puts the next one between the last corner and the target", async () => {
    await load(TWO);
    const id = edge().id;
    useGraphStore.getState().addWaypoint(id, 0, { x: 0, y: 0 });
    useGraphStore.getState().appendWaypoint(id);
    expect(points()).toHaveLength(2);
    // Appended, so the route reads in order rather than doubling back.
    expect(points()[0]).toEqual({ x: 0, y: 0 });
  });
});

describe("corners and the text around them", () => {
  it("comes back after a round-trip through the source", async () => {
    await load(TWO);
    useGraphStore.getState().addWaypoint(edge().id, 0, { x: 120, y: 80 });
    await load(code());
    expect(points()).toEqual([{ x: 120, y: 80 }]);
  });

  it("stays on its own edge when another is inserted above it", async () => {
    await load(TWO);
    useGraphStore.getState().addWaypoint(edge().id, 0, { x: 120, y: 80 });
    // The parsed ids carry the line number: `a>b` was e0 and becomes e1.
    // Keying by id here would move the corner onto the new edge.
    const shifted = code().replace(
      'flowchart TD\n  a["One"]',
      'flowchart TD\n  x["X"] --> y["Y"]\n  a["One"]',
    );
    await load(shifted);
    const ab = useGraphStore
      .getState()
      .edges.find((e) => e.source === "a" && e.target === "b")!;
    const xy = useGraphStore.getState().edges.find((e) => e.source === "x")!;
    expect(ab.data?.points).toEqual([{ x: 120, y: 80 }]);
    expect(xy.data?.points).toBeUndefined();
  });

  it("leaves the diagram's own text alone", async () => {
    await load(TWO);
    useGraphStore.getState().addWaypoint(edge().id, 0, { x: 1, y: 2 });
    expect(code()).toContain('a["One"] --> b["Two"]');
  });

  it("forgets the corners of a deleted edge", async () => {
    await load(TWO);
    useGraphStore.getState().addWaypoint(edge().id, 0, { x: 1, y: 2 });
    useGraphStore.getState().onEdgesChange([{ type: "remove", id: edge().id }]);
    expect(readWaypoints(code())?.["a>b"]).toBeUndefined();
  });
});

describe("what a routed edge does to the other edge behaviours", () => {
  it("keeps its own route instead of being fanned out as a parallel edge", async () => {
    await load('flowchart TD\n  a["One"] --> b["Two"]\n  a --> b\n');
    const first = useGraphStore.getState().edges[0];
    expect(first.type).toBe("parallel");
    useGraphStore.getState().addWaypoint(first.id, 0, { x: 50, y: 50 });
    // Bending one by hand is more specific than "these two overlap".
    expect(useGraphStore.getState().edges[0].type).toBe("routed");
    expect(useGraphStore.getState().edges[1].type).toBe("parallel");
  });

  it("leaves sequence messages alone", async () => {
    await load("sequenceDiagram\n  A->>B: hello\n");
    expect(useGraphStore.getState().edges[0].type).toBe("message");
  });
});
