import { describe, expect, it } from "vitest";
import { allRoutes, endsOf } from "./routes";
import { absoluteBoxes, useGraphStore } from "./store";

/**
 * A connection from a node to itself.
 *
 * `bestSides` answers by comparing two centres, and for one box against
 * itself every difference is zero — it said "leave the bottom, arrive at the
 * top", which is a request to get from under the node to above it. The
 * router obliged: out of the bottom, down past the label, around the outside
 * of the enclosing group, and back up. What a loop wants is two adjacent
 * faces and the corner between them.
 */
const LOOPING = 'flowchart TD\n  a["One"] --> b["Two"]\n  b --> b\n';

const load = (code: string) => useGraphStore.getState().applyCode(code);
const state = () => useGraphStore.getState();
const loop = () => state().edges.find((e) => e.source === e.target)!;

/** The box the loop belongs to, with room for the loop itself around it. */
function near(id: string, slack: number) {
  const box = absoluteBoxes(state().nodes).get(id)!;
  return {
    x1: box.x - slack,
    y1: box.y - slack,
    x2: box.x + box.w + slack,
    y2: box.y + box.h + slack,
  };
}

describe("an edge from a node to itself", () => {
  it("leaves and arrives by two different faces", async () => {
    await load(LOOPING);
    const ends = endsOf(loop(), absoluteBoxes(state().nodes), "flowchart")!;
    expect(ends.fromSide).not.toBe(ends.toSide);
    // Adjacent, not opposite: a loop across the node would run over it.
    expect([ends.fromSide, ends.toSide].sort()).toEqual(["right", "top"]);
  });

  it("stays beside its node instead of touring the diagram", async () => {
    await load(LOOPING);
    const route = allRoutes(state().nodes, state().edges, "flowchart").get(loop().id)!;
    expect(route.length).toBeGreaterThan(2);

    // Every corner within a stub's reach of the node. The old route left the
    // bottom face and came back to the top the long way, which put points
    // hundreds of units clear of the box on both axes.
    const box = near(loop().source, 40);
    for (const p of route) {
      expect(p.x, `x of ${JSON.stringify(p)}`).toBeGreaterThanOrEqual(box.x1);
      expect(p.x, `x of ${JSON.stringify(p)}`).toBeLessThanOrEqual(box.x2);
      expect(p.y, `y of ${JSON.stringify(p)}`).toBeGreaterThanOrEqual(box.y1);
      expect(p.y, `y of ${JSON.stringify(p)}`).toBeLessThanOrEqual(box.y2);
    }
  });

  it("is squared off, like every other connection here", async () => {
    await load(LOOPING);
    const route = allRoutes(state().nodes, state().edges, "flowchart").get(loop().id)!;
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1];
      const b = route[i];
      expect(a.x === b.x || a.y === b.y, `${JSON.stringify(a)}→${JSON.stringify(b)}`).toBe(
        true,
      );
    }
  });

  it("takes the faces an architecture diagram names, when it can", async () => {
    // Those are written into the file and are the author's decision here as
    // much as anywhere: `db:B --> L:db` is a loop round the bottom-left.
    await load("architecture-beta\n  service db(database)[Database]\n  db:B --> L:db\n");
    const ends = endsOf(loop(), absoluteBoxes(state().nodes), "architecture")!;
    expect([ends.fromSide, ends.toSide]).toEqual(["bottom", "left"]);
  });

  it("but not two faces that are opposite each other", async () => {
    // Top and bottom is the very request that sent the line round the
    // outside of the diagram — there is no corner between them to go round.
    await load("architecture-beta\n  service db(database)[Database]\n  db:T --> B:db\n");
    const ends = endsOf(loop(), absoluteBoxes(state().nodes), "architecture")!;
    expect([ends.fromSide, ends.toSide]).toEqual(["right", "top"]);

    const route = allRoutes(state().nodes, state().edges, "architecture").get(loop().id)!;
    const box = near(loop().source, 40);
    for (const p of route) {
      expect(p.x).toBeGreaterThanOrEqual(box.x1);
      expect(p.x).toBeLessThanOrEqual(box.x2);
      expect(p.y).toBeGreaterThanOrEqual(box.y1);
      expect(p.y).toBeLessThanOrEqual(box.y2);
    }
  });

  it("says so when the family's own renderer cannot draw one", async () => {
    // Mermaid parses and renders `Rel(a, a, …)` without complaint and then
    // draws an arrowhead at the corner of the box instead of a loop. The
    // file is valid and this canvas draws the loop, so the edge is made —
    // and the disagreement is said out loud rather than left to be found in
    // the Live Editor.
    await load('C4Context\n  System(a, "A", "d")\n');
    state().onConnect({ source: "a", target: "a", sourceHandle: null, targetHandle: null });
    expect(state().edges).toHaveLength(1);
    expect(state().warning).toMatch(/C4 renderer/);
    expect(state().warning).toMatch(/the file is valid/);
  });

  it("and says nothing where the loop is drawn properly", async () => {
    await load(LOOPING);
    state().onConnect({ source: "a", target: "a", sourceHandle: null, targetHandle: null });
    expect(state().warning).toBeNull();
  });

  it("leaves the ordinary edge beside it alone", async () => {
    await load(LOOPING);
    const routes = allRoutes(state().nodes, state().edges, "flowchart");
    const plain = state().edges.find((e) => e.source !== e.target)!;
    expect(routes.get(plain.id)!.length).toBeGreaterThan(1);
  });
});
