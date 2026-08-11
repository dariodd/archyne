import { describe, expect, it } from "vitest";
import type { SeqItem } from "./model/types";
import { dropBlock, shiftedIndex, useSeqDrag } from "./seqLayout";

/** `m0 · loop · m1 · end · m2` — one message before, inside, and after. */
const items: SeqItem[] = [
  { kind: "message", edgeId: "m0" },
  { kind: "block", op: "loop", label: "retry" },
  { kind: "message", edgeId: "m1" },
  { kind: "end" },
  { kind: "message", edgeId: "m2" },
];

describe("shiftedIndex", () => {
  it("leaves every row alone when nothing is being dragged", () => {
    for (let i = 0; i < 5; i++) expect(shiftedIndex(i, -1, -1)).toBe(i);
  });

  it("puts the dragged row on its target", () => {
    expect(shiftedIndex(4, 4, 2)).toBe(2);
    expect(shiftedIndex(0, 0, 3)).toBe(3);
  });

  it("closes the gap behind a row travelling down", () => {
    // m0 (row 0) dropped on row 3: rows 1..3 each move up one.
    expect([1, 2, 3].map((i) => shiftedIndex(i, 0, 3))).toEqual([0, 1, 2]);
    expect(shiftedIndex(4, 0, 3)).toBe(4);
  });

  it("opens a gap ahead of a row travelling up", () => {
    // m2 (row 4) dropped on row 2: rows 2..3 each move down one.
    expect([2, 3].map((i) => shiftedIndex(i, 4, 2))).toEqual([3, 4]);
    expect([0, 1].map((i) => shiftedIndex(i, 4, 2))).toEqual([0, 1]);
  });

  it("never inverts a block against its end", () => {
    for (let to = 0; to < 5; to++) {
      expect(shiftedIndex(1, 4, to)).toBeLessThan(shiftedIndex(3, 4, to));
    }
  });
});

describe("dropBlock", () => {
  it("reports the top level for a drop outside every block", () => {
    expect(dropBlock(items, 4, 0)).toBe(-1); // above the loop
    expect(dropBlock(items, 0, 4)).toBe(-1); // below its end
  });

  it("reports the loop for a drop between it and its end", () => {
    // m2 dragged onto the row the lone inner message occupies.
    expect(dropBlock(items, 4, 2)).toBe(1);
    expect(dropBlock(items, 4, 3)).toBe(1);
  });

  it("treats the block's own opening row as still outside it", () => {
    expect(dropBlock(items, 4, 1)).toBe(-1);
  });

  it("picks the innermost of nested blocks", () => {
    const nested: SeqItem[] = [
      { kind: "block", op: "alt", label: "ok" },
      { kind: "block", op: "opt", label: "cached" },
      { kind: "end" },
      { kind: "end" },
      { kind: "message", edgeId: "m0" },
    ];
    expect(dropBlock(nested, 4, 2)).toBe(1);
    expect(dropBlock(nested, 4, 3)).toBe(0);
    expect(dropBlock(nested, 4, 4)).toBe(-1);
  });
});

describe("useSeqDrag", () => {
  it("tracks a gesture and forgets it on end", () => {
    const { begin, moveTo, end } = useSeqDrag.getState();
    begin("m2", 4);
    expect(useSeqDrag.getState()).toMatchObject({ edgeId: "m2", from: 4, to: 4 });
    moveTo(2);
    expect(useSeqDrag.getState().to).toBe(2);
    end();
    expect(useSeqDrag.getState()).toMatchObject({ edgeId: null, from: -1, to: -1 });
  });

  it("keeps the same state object when the row does not change", () => {
    const { begin, moveTo, end } = useSeqDrag.getState();
    begin("m2", 4);
    moveTo(2);
    const before = useSeqDrag.getState();
    moveTo(2);
    expect(useSeqDrag.getState()).toBe(before);
    end();
  });
});
