import { describe, expect, it } from "vitest";
import { presentEdge } from "./diagram";
import type { FlowEdge } from "./types";

/** An edge as the store holds one, before it has been presented. */
function edge(data: FlowEdge["data"], extra: Partial<FlowEdge> = {}): FlowEdge {
  return { id: "e1", source: "a", target: "b", data, ...extra };
}

/**
 * Presenting an edge twice.
 *
 * `presentEdge` spreads the edge it is given, so anything the last pass put
 * on it is still there — and a branch that only sets a marker when it wants
 * one leaves the previous one standing. That is not hypothetical: unticking
 * "arrowheads at both ends" left the edge with two arrowheads, because
 * nothing ever took the second one off.
 */
describe("presenting an edge over one already presented", () => {
  it("takes the second flowchart arrowhead off again", () => {
    const on = presentEdge("flowchart", edge({ label: "", arrow: "arrow_point", both: true }));
    expect(on.markerStart).toBeTruthy();

    const off = presentEdge("flowchart", { ...on, data: { ...on.data!, both: false } });
    expect(off.markerStart).toBeFalsy();
    expect(off.markerEnd).toBeTruthy();
  });

  it("takes the C4 back-arrow off when a birel becomes a rel", () => {
    const birel = presentEdge("c4", edge({ label: "", c4: { relType: "birel", techn: "" } }));
    expect(birel.markerStart).toBeTruthy();

    const rel = presentEdge("c4", {
      ...birel,
      data: { ...birel.data!, c4: { relType: "rel", techn: "" } },
    });
    expect(rel.markerStart).toBeFalsy();
  });

  it("leaves nothing of another family's markers on a re-presented edge", () => {
    // Switching a document's family re-presents the same edges under the new
    // one. An ER edge wears a marker at both ends; a state transition wears
    // one at the head only, and must not inherit the other.
    const er = presentEdge(
      "er",
      edge({ label: "", er: { cardA: "ONLY_ONE", cardB: "ONLY_ONE", identifying: true } }),
    );
    expect(er.markerStart).toBeTruthy();

    const state = presentEdge("state", { ...er, data: { label: "" } });
    expect(state.markerStart).toBeFalsy();
    expect(state.markerEnd).toBeTruthy();
  });

  it("still puts both heads on when both ends are asked for", () => {
    const both = presentEdge(
      "flowchart",
      edge({ label: "", arrow: "arrow_point", both: true }),
    );
    expect(both.markerStart).toEqual(both.markerEnd);
  });

  it("gives an open arrow no head at either end", () => {
    const open = presentEdge("flowchart", edge({ label: "", arrow: "arrow_open", both: true }));
    expect(open.markerEnd).toBeUndefined();
    expect(open.markerStart).toBeUndefined();
  });
});
