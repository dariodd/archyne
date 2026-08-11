import { describe, expect, it } from "vitest";
import type { ArchDir, FlowEdge } from "../model/types";
import { statedDirection } from "./autoLayout";

/** An architecture edge, written the way the file writes it: `a:X --> Y:b`. */
function arch(lhsDir: ArchDir, rhsDir: ArchDir): FlowEdge {
  return {
    id: `${lhsDir}${rhsDir}`,
    source: "a",
    target: "b",
    data: {
      label: "",
      arch: { lhsDir, rhsDir, lhsInto: false, rhsInto: true, lhsGroup: false, rhsGroup: false },
    },
  };
}

const plain: FlowEdge = { id: "e", source: "a", target: "b", data: { label: "" } };

describe("statedDirection", () => {
  it("leaves families that state no sides alone", () => {
    expect(statedDirection([plain, plain])).toBeNull();
    expect(statedDirection([])).toBeNull();
  });

  it("reads a left-to-right chain off the sides it attaches on", () => {
    // `web:R --> L:db` says db stands to the right of web. Laid out downwards
    // the arrow had to leave rightwards, drop past the target and come back
    // into its left face, passing behind the node it points at.
    expect(statedDirection([arch("R", "L")])).toBe("LR");
    expect(statedDirection([arch("R", "L"), arch("R", "L")])).toBe("LR");
  });

  it("reads a stack the same way", () => {
    expect(statedDirection([arch("B", "T")])).toBe("TB");
    expect(statedDirection([arch("T", "B"), arch("B", "T")])).toBe("TB");
  });

  it("follows the dominant axis when a file mixes the two", () => {
    // The webapp template: a horizontal chain with one service hanging below.
    const webapp = [arch("R", "L"), arch("R", "L"), arch("R", "L"), arch("B", "T")];
    expect(statedDirection(webapp)).toBe("LR");
    expect(statedDirection([arch("B", "T"), arch("B", "T"), arch("R", "L")])).toBe("TB");
  });

  it("prefers across on a tie, which is how these diagrams are usually read", () => {
    expect(statedDirection([arch("R", "L"), arch("B", "T")])).toBe("LR");
  });

  it("counts both ends, so a corner counts for each axis", () => {
    // `a:R --> T:b` — out of a right face, into a top one.
    expect(statedDirection([arch("R", "T"), arch("B", "B")])).toBe("TB");
  });
});
