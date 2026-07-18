import { beforeEach, describe, expect, it } from "vitest";
import { useGraphStore } from "./store";

const FLOWCHART = 'flowchart TD\n  a["One"] --> b["Two"]\n';
const GANTT = `gantt
  title Rollout
  dateFormat YYYY-MM-DD
  section Phase 1
  Design :a1, 2026-01-01, 30d
`;

async function load(code: string) {
  await useGraphStore.getState().applyCode(code);
}

beforeEach(() => {
  useGraphStore.setState({ unsupported: null, parseError: null, warning: null });
});

describe("unsupported diagram families", () => {
  it("opens a gantt file read-only instead of failing", async () => {
    await load(GANTT);
    const s = useGraphStore.getState();
    expect(s.unsupported).toBe("gantt");
    // It is not an error: the file is valid, we just cannot edit it visually.
    expect(s.parseError).toBeNull();
    expect(s.code).toBe(GANTT);
  });

  it("drops the previous graph so the canvas cannot be edited into it", async () => {
    await load(FLOWCHART);
    expect(useGraphStore.getState().nodes.length).toBe(2);

    await load(GANTT);
    expect(useGraphStore.getState().nodes).toEqual([]);
    expect(useGraphStore.getState().edges).toEqual([]);
  });

  it("never rewrites the code while read-only", async () => {
    await load(GANTT);
    // setDiagramMeta re-serializes from the parsed graph. With no graph
    // behind it that would replace the gantt with an empty flowchart.
    useGraphStore.getState().setDiagramMeta({ accTitle: "Anything" });
    expect(useGraphStore.getState().code).toBe(GANTT);

    useGraphStore.getState().setDirection("LR");
    expect(useGraphStore.getState().code).toBe(GANTT);
  });

  it("clears the flag when an editable diagram is loaded again", async () => {
    await load(GANTT);
    expect(useGraphStore.getState().unsupported).toBe("gantt");

    await load(FLOWCHART);
    const s = useGraphStore.getState();
    expect(s.unsupported).toBeNull();
    expect(s.nodes.length).toBe(2);
  });

  it("still reports genuinely broken code as a parse error", async () => {
    await load("flowchart TD\n  a --> --> b\n");
    const s = useGraphStore.getState();
    expect(s.parseError).toBeTruthy();
    expect(s.unsupported).toBeNull();
  });
});

describe("history", () => {
  it("undoes and redoes a structural edit", async () => {
    await load(FLOWCHART);
    const before = useGraphStore.getState().code;

    useGraphStore.getState().addNode({ type: "shape", shape: "square" }, { x: 0, y: 0 });
    const after = useGraphStore.getState().code;
    expect(after).not.toBe(before);
    expect(useGraphStore.getState().canUndo).toBe(true);

    await useGraphStore.getState().undo();
    expect(useGraphStore.getState().code).toBe(before);
    expect(useGraphStore.getState().canRedo).toBe(true);

    await useGraphStore.getState().redo();
    expect(useGraphStore.getState().code).toBe(after);
  });

  it("reports nothing to undo on a freshly loaded diagram", async () => {
    useGraphStore.setState({ canUndo: false, canRedo: false });
    await load(FLOWCHART);
    await useGraphStore.getState().undo();
    expect(useGraphStore.getState().code).toBe(FLOWCHART);
  });
});

describe("clipboard", () => {
  it("pastes copies with fresh ids, leaving the originals intact", async () => {
    await load(FLOWCHART);
    useGraphStore.getState().selectAll();
    useGraphStore.getState().copySelection();
    useGraphStore.getState().pasteClipboard();

    const { nodes } = useGraphStore.getState();
    expect(nodes.length).toBe(4);
    expect(new Set(nodes.map((n) => n.id)).size).toBe(4);
    // The originals survive the paste.
    for (const id of ["a", "b"]) expect(nodes.some((n) => n.id === id)).toBe(true);
  });

  it("carries edges between copied nodes across", async () => {
    await load(FLOWCHART);
    useGraphStore.getState().selectAll();
    useGraphStore.getState().copySelection();
    useGraphStore.getState().pasteClipboard();
    expect(useGraphStore.getState().edges.length).toBe(2);
  });
});

describe("layout positions", () => {
  it("writes a positions comment that keeps the file valid mermaid", async () => {
    await load(FLOWCHART);
    useGraphStore.getState().addNode({ type: "shape", shape: "square" }, { x: 120, y: 80 });
    const code = useGraphStore.getState().code;
    expect(code).toContain("%% graph:positions");

    // Round-trip: reloading its own output must not error.
    await load(code);
    expect(useGraphStore.getState().parseError).toBeNull();
  });
});

describe("selection", () => {
  it("selects exactly one node, clearing any previous selection", async () => {
    await load(FLOWCHART);
    useGraphStore.getState().selectAll();
    expect(useGraphStore.getState().nodes.every((n) => n.selected)).toBe(true);

    useGraphStore.getState().selectOnly("a", "node");
    const { nodes, edges } = useGraphStore.getState();
    expect(nodes.filter((n) => n.selected).map((n) => n.id)).toEqual(["a"]);
    expect(edges.some((e) => e.selected)).toBe(false);
  });

  it("selects an edge without leaving nodes selected", async () => {
    await load(FLOWCHART);
    useGraphStore.getState().selectAll();
    const edgeId = useGraphStore.getState().edges[0].id;

    useGraphStore.getState().selectOnly(edgeId, "edge");
    const { nodes, edges } = useGraphStore.getState();
    expect(nodes.some((n) => n.selected)).toBe(false);
    expect(edges.filter((e) => e.selected).map((e) => e.id)).toEqual([edgeId]);
  });

  it("deletes the whole selection and the edges attached to it", async () => {
    await load(FLOWCHART);
    useGraphStore.getState().selectOnly("a", "node");
    useGraphStore.getState().deleteSelection();

    const { nodes, edges } = useGraphStore.getState();
    expect(nodes.map((n) => n.id)).toEqual(["b"]);
    // The a→b edge cannot outlive its source.
    expect(edges).toEqual([]);
  });

  it("nudges only the selected nodes, and only the positions comment", async () => {
    await load(FLOWCHART);
    useGraphStore.getState().selectOnly("a", "node");
    const before = useGraphStore.getState().nodes.find((n) => n.id === "a")!.position;
    const otherBefore = useGraphStore.getState().nodes.find((n) => n.id === "b")!.position;

    useGraphStore.getState().nudgeSelection(5, -3);

    const after = useGraphStore.getState().nodes.find((n) => n.id === "a")!.position;
    const otherAfter = useGraphStore.getState().nodes.find((n) => n.id === "b")!.position;
    expect(after).toEqual({ x: before.x + 5, y: before.y - 3 });
    expect(otherAfter).toEqual(otherBefore);

    // Structure untouched: the edge line survives verbatim.
    expect(useGraphStore.getState().code).toContain('a["One"] --> b["Two"]');
  });

  it("does nothing when nothing is selected", async () => {
    await load(FLOWCHART);
    useGraphStore.setState({
      nodes: useGraphStore.getState().nodes.map((n) => ({ ...n, selected: false })),
    });
    const before = useGraphStore.getState().code;
    useGraphStore.getState().nudgeSelection(10, 10);
    expect(useGraphStore.getState().code).toBe(before);
  });
});

describe("grouping", () => {
  it("wraps the selection in a group and reparents its members", async () => {
    await load(FLOWCHART);
    useGraphStore.getState().selectAll();
    useGraphStore.getState().groupSelection();

    const { nodes } = useGraphStore.getState();
    const group = nodes.find((n) => n.type === "group");
    expect(group).toBeDefined();
    for (const id of ["a", "b"]) {
      expect(nodes.find((n) => n.id === id)?.parentId).toBe(group!.id);
    }
    // A subgraph is the flowchart spelling of a group.
    expect(useGraphStore.getState().code).toContain("subgraph");
  });

  it("dissolves a group without taking its members with it", async () => {
    await load(FLOWCHART);
    useGraphStore.getState().selectAll();
    useGraphStore.getState().groupSelection();
    const group = useGraphStore.getState().nodes.find((n) => n.type === "group")!;

    useGraphStore.getState().selectOnly(group.id, "node");
    useGraphStore.getState().ungroupSelection();

    const { nodes } = useGraphStore.getState();
    expect(nodes.some((n) => n.type === "group")).toBe(false);
    expect(nodes.map((n) => n.id).sort()).toEqual(["a", "b"]);
    expect(nodes.every((n) => !n.parentId)).toBe(true);
    expect(useGraphStore.getState().code).not.toContain("subgraph");
  });

  it("lifts a single node out of its group, leaving the group behind", async () => {
    await load(FLOWCHART);
    useGraphStore.getState().selectAll();
    useGraphStore.getState().groupSelection();
    const group = useGraphStore.getState().nodes.find((n) => n.type === "group")!;

    useGraphStore.getState().removeFromGroup("a");

    const { nodes } = useGraphStore.getState();
    expect(nodes.find((n) => n.id === "a")?.parentId).toBeUndefined();
    expect(nodes.find((n) => n.id === "b")?.parentId).toBe(group.id);
    expect(nodes.some((n) => n.type === "group")).toBe(true);
  });

  it("deleting a group frees its members rather than destroying them", async () => {
    // Deliberate: `onNodesChange` re-parents orphans instead of cascading the
    // delete, so removing a container never silently takes content with it.
    // It does mean "Delete group" and "Ungroup" land in the same place —
    // tracked as a UX question in docs/PLAN.md, not changed here.
    await load(FLOWCHART);
    useGraphStore.getState().selectAll();
    useGraphStore.getState().groupSelection();
    const group = useGraphStore.getState().nodes.find((n) => n.type === "group")!;

    useGraphStore.getState().deleteElement(group.id, "node");

    const { nodes } = useGraphStore.getState();
    expect(nodes.map((n) => n.id).sort()).toEqual(["a", "b"]);
    expect(nodes.every((n) => !n.parentId)).toBe(true);
  });
});

describe("duplicate", () => {
  it("copies a node under a fresh id, keeping the original", async () => {
    await load(FLOWCHART);
    useGraphStore.getState().duplicateNode("a");

    const { nodes } = useGraphStore.getState();
    expect(nodes.length).toBe(3);
    expect(nodes.filter((n) => n.id === "a").length).toBe(1);
    expect(new Set(nodes.map((n) => n.id)).size).toBe(3);
  });
});
