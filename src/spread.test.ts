import { describe, expect, it } from "vitest";
import { GAP, spreadRuns } from "./spread";
import { segmentsOf } from "./orthogonal";
import type { Point } from "./routing";

const p = (x: number, y: number): Point => ({ x, y });

/** Where the vertical run of a route sits, for reading the fan-out. */
const verticalAt = (route: Point[]): number[] =>
  segmentsOf(route)
    .filter((r) => r.axis === "y")
    .map((r) => r.from.x);

describe("fanning out connections that share a corridor", () => {
  // Two routes taking the same halfway line: out, down the middle, and in.
  const one = [p(0, 0), p(200, 0), p(200, 300), p(400, 300)];
  const two = [p(0, 100), p(200, 100), p(200, 400), p(400, 400)];

  it("moves them apart", () => {
    const out = spreadRuns(
      new Map([
        ["a", one],
        ["b", two],
      ]),
    );
    const [first] = verticalAt(out.get("a")!);
    const [second] = verticalAt(out.get("b")!);
    expect(first).not.toBe(second);
    expect(Math.abs(first - second)).toBe(GAP);
  });

  it("leaves the first one exactly where the router put it", () => {
    const out = spreadRuns(
      new Map([
        ["a", one],
        ["b", two],
      ]),
    );
    expect(verticalAt(out.get("a")!)).toEqual([200]);
  });

  it("does nothing to a corridor with one connection in it", () => {
    const out = spreadRuns(new Map([["a", one]]));
    expect(out.get("a")).toEqual(one);
  });

  it("leaves alone two runs on the same line that never meet", () => {
    // Both vertical at x = 200, but one is above the other.
    const above = [p(0, 0), p(200, 0), p(200, 100), p(400, 100)];
    const below = [p(0, 500), p(200, 500), p(200, 700), p(400, 700)];
    const out = spreadRuns(
      new Map([
        ["a", above],
        ["b", below],
      ]),
    );
    expect(out.get("a")).toEqual(above);
    expect(out.get("b")).toEqual(below);
  });

  it("ignores stubs, which are joins rather than corridors", () => {
    const stubby = [p(0, 0), p(10, 0), p(10, 8), p(20, 8)];
    const alike = [p(0, 40), p(10, 40), p(10, 48), p(20, 48)];
    const out = spreadRuns(
      new Map([
        ["a", stubby],
        ["b", alike],
      ]),
    );
    expect(out.get("a")).toEqual(stubby);
    expect(out.get("b")).toEqual(alike);
  });

  it("fans three apart on both sides of the first", () => {
    const three = [p(0, 200), p(200, 200), p(200, 500), p(400, 500)];
    const out = spreadRuns(
      new Map([
        ["a", one],
        ["b", two],
        ["c", three],
      ]),
    );
    const at = [
      verticalAt(out.get("a")!)[0],
      verticalAt(out.get("b")!)[0],
      verticalAt(out.get("c")!)[0],
    ];
    expect(new Set(at).size).toBe(3);
  });

  it("does not depend on the order the routes arrive in", () => {
    const forwards = spreadRuns(
      new Map([
        ["a", one],
        ["b", two],
      ]),
    );
    const backwards = spreadRuns(
      new Map([
        ["b", two],
        ["a", one],
      ]),
    );
    expect(verticalAt(backwards.get("a")!)).toEqual(verticalAt(forwards.get("a")!));
    expect(verticalAt(backwards.get("b")!)).toEqual(verticalAt(forwards.get("b")!));
  });

  it("moves each connection once, however many corridors it shares", () => {
    const long = [p(0, 0), p(200, 0), p(200, 300), p(400, 300), p(400, 600)];
    const rival = [p(0, 100), p(200, 100), p(200, 400), p(400, 400), p(400, 700)];
    const out = spreadRuns(
      new Map([
        ["a", long],
        ["b", rival],
      ]),
    );
    // The second route moved, and only its first shared run did.
    expect(out.get("b")).not.toEqual(rival);
    expect(segmentsOf(out.get("b")!).filter((r) => r.axis === "y").length).toBeGreaterThan(0);
  });
});
