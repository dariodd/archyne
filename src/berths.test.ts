import { describe, expect, it } from "vitest";
import { BERTH_GAP, spreadBerths } from "./berths";
import type { Rect } from "./avoid";
import type { Ends } from "./routes";

const hub: Rect = { x: 0, y: 0, w: 120, h: 60 };
const boxes = new Map<string, Rect>([
  ["hub", hub],
  ["a", { x: -200, y: -100, w: 60, h: 40 }],
  ["b", { x: -200, y: 0, w: 60, h: 40 }],
  ["c", { x: -200, y: 100, w: 60, h: 40 }],
]);

/** Three connections leaving the same face of `hub`, towards a, b and c. */
const leaving = (): Map<string, Ends> =>
  new Map(
    (
      [
        ["e1", "a", -80],
        ["e2", "b", 20],
        ["e3", "c", 120],
      ] as const
    ).map(([id, , y]) => [
      id,
      {
        start: { x: 0, y: 30 },
        end: { x: -140, y },
        from: "x",
        to: "x",
        fromSide: "left",
        toSide: "right",
      } satisfies Ends,
    ]),
  );

const edges = [
  { id: "e1", source: "hub", target: "a" },
  { id: "e2", source: "hub", target: "b" },
  { id: "e3", source: "hub", target: "c" },
];

describe("giving connections that share a face a place each", () => {
  it("moves them apart along it", () => {
    const out = spreadBerths(edges, leaving(), boxes);
    const ys = edges.map((e) => out.get(e.id)!.start.y);
    expect(new Set(ys).size).toBe(3);
  });

  it("keeps them on the face they were given", () => {
    const out = spreadBerths(edges, leaving(), boxes);
    for (const e of edges) {
      const at = out.get(e.id)!;
      expect(at.start.x).toBe(0);
      expect(at.start.y).toBeGreaterThanOrEqual(hub.y);
      expect(at.start.y).toBeLessThanOrEqual(hub.y + hub.h);
    }
  });

  it("spreads them about the middle, so the middle one keeps it", () => {
    const out = spreadBerths(edges, leaving(), boxes);
    expect(out.get("e2")!.start.y).toBe(30);
  });

  it("hands them out in the order their far ends lie, so they do not cross", () => {
    const out = spreadBerths(edges, leaving(), boxes);
    const ys = edges.map((e) => out.get(e.id)!.start.y);
    expect(ys).toEqual([...ys].sort((x, y) => x - y));
  });

  it("leaves a face with one connection on it exactly where it was", () => {
    const ends = leaving();
    const one = new Map([["e1", ends.get("e1")!]]);
    const out = spreadBerths([edges[0]], one, boxes);
    expect(out.get("e1")!.start).toEqual({ x: 0, y: 30 });
  });

  it("sets them a gap apart when the face has room for it", () => {
    const out = spreadBerths(edges, leaving(), boxes);
    const ys = edges.map((e) => out.get(e.id)!.start.y).sort((a, b) => a - b);
    expect(ys[1] - ys[0]).toBe(BERTH_GAP);
    expect(ys[2] - ys[1]).toBe(BERTH_GAP);
  });

  it("crowds them closer rather than off the end of a short face", () => {
    const short = new Map(boxes);
    short.set("hub", { x: 0, y: 0, w: 120, h: 24 });
    const ends = new Map(leaving());
    for (const [, at] of ends) at.start = { x: 0, y: 12 };
    const out = spreadBerths(edges, ends, short);
    const ys = edges.map((e) => out.get(e.id)!.start.y).sort((a, b) => a - b);
    expect(ys[1] - ys[0]).toBeLessThan(BERTH_GAP);
    expect(ys[0]).toBeGreaterThanOrEqual(0);
    expect(ys[2]).toBeLessThanOrEqual(24);
  });

  it("gives the two ends of one connection a place on each face", () => {
    // Both edges run hub -> a, so a's right face is shared as well.
    const pair = [
      { id: "e1", source: "hub", target: "a" },
      { id: "e2", source: "hub", target: "a" },
    ];
    const ends = new Map<string, Ends>(
      pair.map((e) => [
        e.id,
        {
          start: { x: 0, y: 30 },
          end: { x: -140, y: -80 },
          from: "x",
          to: "x",
          fromSide: "left",
          toSide: "right",
        } satisfies Ends,
      ]),
    );
    const out = spreadBerths(pair, ends, boxes);
    expect(out.get("e1")!.start.y).not.toBe(out.get("e2")!.start.y);
    expect(out.get("e1")!.end.y).not.toBe(out.get("e2")!.end.y);
  });

  it("says the same thing whichever order the edges arrive in", () => {
    const one = spreadBerths(edges, leaving(), boxes);
    const two = spreadBerths([...edges].reverse(), leaving(), boxes);
    for (const e of edges) expect(two.get(e.id)!.start).toEqual(one.get(e.id)!.start);
  });
});
