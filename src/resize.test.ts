import { beforeEach, describe, expect, it } from "vitest";
import { GROUP_MIN, NODE_MIN, useGraphStore } from "./store";
import { readPositions } from "./model/positions";

/**
 * Sizing a node by hand.
 *
 * A size is not something Mermaid can express, so like a position it lives in
 * the trailing comment — which makes "does it survive a round-trip" the
 * question worth asking of every path here.
 */

const FLOWCHART = 'flowchart TD\n  a["One"] --> b["Two"]\n';
const GROUPED = 'flowchart TD\n  subgraph g1["Cluster"]\n    a["One"]\n  end\n';

const load = (code: string) => useGraphStore.getState().applyCode(code);
const stored = () => readPositions(useGraphStore.getState().code) ?? {};
const node = (id: string) => useGraphStore.getState().nodes.find((n) => n.id === id)!;

beforeEach(() => {
  useGraphStore.setState({ unsupported: null, parseError: null, warning: null });
});

describe("resizing a node", () => {
  it("records the size in the positions comment", async () => {
    await load(FLOWCHART);
    useGraphStore.getState().resizeNode("a", 240, 90);
    expect(stored().a).toMatchObject({ w: 240, h: 90 });
  });

  it("leaves untouched nodes to size themselves", async () => {
    await load(FLOWCHART);
    useGraphStore.getState().resizeNode("a", 240, 90);
    // Writing every node's measured size would bloat the comment and freeze
    // each label at whatever width it happened to render at.
    expect(stored().b.w).toBeUndefined();
    expect(stored().b.h).toBeUndefined();
  });

  it("survives the round-trip through the source", async () => {
    await load(FLOWCHART);
    useGraphStore.getState().resizeNode("a", 240, 90);
    await load(useGraphStore.getState().code);
    expect(node("a").style?.width).toBe(240);
    expect(node("a").style?.height).toBe(90);
    expect(node("b").style?.width).toBeUndefined();
  });

  it("keeps the node where it is", async () => {
    await load(FLOWCHART);
    const before = { ...node("a").position };
    useGraphStore.getState().resizeNode("a", 240, 90);
    expect(node("a").position).toEqual(before);
  });

  it("rounds to whole pixels", async () => {
    await load(FLOWCHART);
    useGraphStore.getState().resizeNode("a", 240.4, 90.6);
    expect(node("a").style).toMatchObject({ width: 240, height: 91 });
  });

  it("refuses to shrink a node past the point of grabbing it again", async () => {
    await load(FLOWCHART);
    useGraphStore.getState().resizeNode("a", 1, 1);
    expect(node("a").style).toMatchObject({ width: NODE_MIN.width, height: NODE_MIN.height });
  });

  it("holds a group to its own, larger floor", async () => {
    await load(GROUPED);
    useGraphStore.getState().resizeNode("g1", 1, 1);
    expect(node("g1").style).toMatchObject({
      width: GROUP_MIN.width,
      height: GROUP_MIN.height,
    });
  });
});

describe("giving a node its own size back", () => {
  it("clears the size and drops it from the source", async () => {
    await load(FLOWCHART);
    useGraphStore.getState().resizeNode("a", 240, 90);
    useGraphStore.getState().resetNodeSize("a");
    expect(node("a").style?.width).toBeUndefined();
    expect(stored().a.w).toBeUndefined();
    // The position is not part of what is being reset.
    expect(stored().a.x).toBe(node("a").position.x);
  });

  it("re-measures rather than keeping the old measurement", async () => {
    await load(FLOWCHART);
    useGraphStore.getState().resizeNode("a", 240, 90);
    useGraphStore.getState().resetNodeSize("a");
    expect(node("a").measured).toBeUndefined();
  });

  it("does nothing to a group, which has no size of its own to return to", async () => {
    await load(GROUPED);
    useGraphStore.getState().resizeNode("g1", 300, 200);
    useGraphStore.getState().resetNodeSize("g1");
    expect(node("g1").style).toMatchObject({ width: 300, height: 200 });
  });

  it("ignores an id that is not there", async () => {
    await load(FLOWCHART);
    const before = useGraphStore.getState().code;
    useGraphStore.getState().resetNodeSize("nope");
    expect(useGraphStore.getState().code).toBe(before);
  });
});
