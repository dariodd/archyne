import { describe, expect, it } from "vitest";
import { measureNode } from "./measureNode";
import type { AnyNode } from "./model/types";
import type { TextMetrics } from "./textMetrics";

/**
 * Measuring a node, which is the thing standing between this codebase and a
 * renderer other tools can import: outside the editor nothing measures the
 * element afterwards, so what is computed here is what ends up in the picture.
 *
 * The backend is fixed rather than real — ten pixels a character, twenty a line
 * — so these cases are about composition, floors and which parts of a node
 * count towards its box. How wide a `w` really is belongs to
 * `textMetrics.test.ts`, and how close all of this lands to the browser belongs
 * to the tolerance test that will drive real diagrams through the app.
 */
const fixed: TextMetrics = {
  exact: true,
  measure: (text) => ({ width: text.length * 10, height: 20, ascent: 15 }),
};

function node(type: string, data: Record<string, unknown>): AnyNode {
  return { id: "n", type, position: { x: 0, y: 0 }, data } as unknown as AnyNode;
}

const shape = (label: string, extra: Record<string, unknown> = {}) =>
  node("shape", { label, shape: "rect", direction: "TB", ...extra });

describe("flowchart shapes", () => {
  it("keeps the shape's own floor when the label is small", () => {
    // `defaultSize("rect")` is 160×54, and "ok" does not need any of it.
    expect(measureNode(shape("ok"), fixed)).toEqual({ width: 160, height: 54 });
  });

  it("does not grow for a label that does not fit — the box is the author's", () => {
    // Settled by `tests/e2e-measure.mts`, which caught this predicting 260
    // against a browser drawing 160. `ShapeNode` gives the element the shape's
    // default size and lets a long label wrap and clip inside it; a node that
    // silently widened because of what was typed in it is not a size anybody
    // chose. What the text decides is the resize floor, and `contentSize.ts`
    // asks the rendered element for that.
    const size = measureNode(shape("a payment authorisation service"), fixed);
    expect(size).toEqual({ width: 160, height: 54 });
  });

  it("keeps a circle circular even when it says nothing", () => {
    const size = measureNode(shape("x", { shape: "circle" }), fixed);
    expect(size).toEqual({ width: 96, height: 96 });
  });

  it("keeps a width it has been given", () => {
    expect(measureNode(shape("anything"), fixed, 240).width).toBe(240);
  });

  it("takes an unframed picture's size from the picture and its name", () => {
    const size = measureNode(
      shape("AWS", { img: "https://x/aws.svg", styles: ["fill:none", "stroke:none"] }),
      fixed,
    );
    // Width: the wider of the 60px picture and the 30px label, plus 16px of
    // padding. Height: the picture, the 4px gap, the label's line, and 12px.
    expect(size.width).toBe(76);
    expect(size.height).toBe(96);
  });
});

describe("states", () => {
  const state = (label: string, stateType = "normal") =>
    node("state", { label, stateType, direction: "TB" });

  it("floors at the width the stylesheet sets", () => {
    expect(measureNode(state("on"), fixed).width).toBe(120);
  });

  it("widens for a name that needs it", () => {
    expect(measureNode(state("awaiting confirmation"), fixed).width).toBeGreaterThan(120);
  });

  it("leaves the shapes that carry no text alone, at the stylesheet's sizes", () => {
    // 36, 10 and 26 — not the 40, 12 and 28 the old constants carried. Each
    // was wrong by a little, and each stayed wrong because nothing compared a
    // constant with the drawing until `tests/e2e-measure.mts` did.
    expect(measureNode(state("", "choice"), fixed)).toEqual({ width: 36, height: 36 });
    expect(measureNode(state("", "fork"), fixed)).toEqual({ width: 70, height: 10 });
    expect(measureNode(state("", "start"), fixed)).toEqual({ width: 26, height: 26 });
  });
});

describe("ER entities", () => {
  const entity = (label: string, attributes: unknown[]) =>
    node("entity", { label, attributes, direction: "TB" });

  const attr = (type: string, name: string, keys: string[] = []) => ({
    type,
    name,
    keys,
    comment: "",
  });

  it("gets taller with every attribute", () => {
    const one = measureNode(entity("user", [attr("int", "id")]), fixed);
    const three = measureNode(
      entity("user", [attr("int", "id"), attr("text", "name"), attr("text", "email")]),
      fixed,
    );
    expect(three.height).toBeGreaterThan(one.height);
  });

  it("widens for a long attribute rather than clipping it", () => {
    const short = measureNode(entity("user", [attr("int", "id")]), fixed);
    const long = measureNode(
      entity("user", [attr("timestamptz", "last_authenticated_at")]),
      fixed,
    );
    expect(long.width).toBeGreaterThan(short.width);
  });

  it("counts the key badges as part of the row", () => {
    // Wide enough to clear the 180px floor first — under it every difference
    // is the same difference, and the case would prove nothing.
    const plain = measureNode(
      entity("user", [attr("timestamptz", "last_authenticated_at")]),
      fixed,
    );
    const keyed = measureNode(
      entity("user", [attr("timestamptz", "last_authenticated_at", ["PK", "FK"])]),
      fixed,
    );
    expect(plain.width).toBeGreaterThan(180);
    expect(keyed.width).toBeGreaterThan(plain.width);
  });

  it("floors at the table's min-width", () => {
    expect(measureNode(entity("u", [attr("int", "id")]), fixed).width).toBe(180);
  });
});

describe("classes", () => {
  const cls = (data: Record<string, unknown>) =>
    node("class", {
      label: "Account",
      members: [],
      methods: [],
      annotations: [],
      direction: "TB",
      ...data,
    });

  it("counts members and methods both", () => {
    const bare = measureNode(cls({}), fixed);
    const full = measureNode(
      cls({ members: ["+id: int"], methods: ["+close(): void"] }),
      fixed,
    );
    expect(full.height).toBeGreaterThan(bare.height);
  });

  it("makes room for an annotation above the name", () => {
    const plain = measureNode(cls({}), fixed);
    const annotated = measureNode(cls({ annotations: ["interface"] }), fixed);
    expect(annotated.height).toBeGreaterThan(plain.height);
  });

  it("widens for a long method signature", () => {
    const narrow = measureNode(cls({ methods: ["+id()"] }), fixed);
    const wide = measureNode(
      cls({ methods: ["+authenticateWithProvider(provider: OAuthProvider): Session"] }),
      fixed,
    );
    expect(wide.width).toBeGreaterThan(narrow.width);
  });
});

describe("the rest of the families", () => {
  it("floors a participant at its own min-width", () => {
    const p = node("participant", { label: "api", ptype: "participant", direction: "TB" });
    expect(measureNode(p, fixed).width).toBe(130);
  });

  it("keeps room for a service's icon whatever its name says", () => {
    const s = node("service", { label: "s", icon: "cloud", direction: "TB" });
    const size = measureNode(s, fixed);
    expect(size.width).toBe(90);
    // The 44px icon, the 6px gap, a line of label, and 20px of padding.
    expect(size.height).toBeGreaterThanOrEqual(44 + 6 + 20);
  });

  it("gives a junction no content and no choices", () => {
    expect(measureNode(node("junction", {}), fixed)).toEqual({ width: 16, height: 16 });
  });

  it("leaves a group to the layout that sizes it", () => {
    const g = node("group", { label: "vpc", subgraphId: "vpc" });
    expect(measureNode(g, fixed)).toEqual({ width: 320, height: 220 });
  });

  it("caps a note at the width the stylesheet caps it at", () => {
    const long = node("note", {
      text: "a note long enough that it has to wrap more than once to fit",
      direction: "TB",
    });
    // Exactly the cap, not merely under it: the same max-content rule as the
    // C4 element, and the same reason.
    expect(measureNode(long, fixed).width).toBe(220);
  });
});

describe("C4 elements", () => {
  const c4 = (c4Shape: string, descr = "") =>
    node("c4", { label: "Payments", c4Shape, descr, direction: "TB" });

  it("carries the disc for a person and not for a system", () => {
    const person = measureNode(c4("person"), fixed);
    const system = measureNode(c4("system"), fixed);
    // `.c4-head` is 26px with a 4px margin under it, and only a person has one.
    expect(person.height - system.height).toBe(30);
  });

  it("makes room for a description when there is one", () => {
    const bare = measureNode(c4("system"), fixed);
    const described = measureNode(c4("system", "handles settlement"), fixed);
    expect(described.height).toBeGreaterThan(bare.height);
  });

  it("takes the cap when its content is wider than the cap", () => {
    // A box with a `max-width` shrink-to-fits to its **max-content** width —
    // the text on one line — and is then capped. It does not wrap first and
    // measure what the wrap left, which is what this used to do: the answer
    // then depended on where the wrap happened to fall. It agreed on Windows
    // and was 12px short on a Linux runner, whose wider fonts pushed the same
    // description past the cap. Fonts revealed it; the model was wrong anyway.
    const wide = measureNode(
      c4("system", "a description far longer than two hundred and thirty pixels allows"),
      fixed,
    );
    expect(wide.width).toBe(230);
  });

  it("stays inside the stylesheet's floor and ceiling", () => {
    const size = measureNode(
      c4("system", "a description far longer than the box allows"),
      fixed,
    );
    expect(size.width).toBeGreaterThanOrEqual(170);
    expect(size.width).toBeLessThanOrEqual(230);
  });
});

/**
 * The point of the whole exercise, stated as cases.
 *
 * `estimateSize` — removed from `model/types.ts` when these landed — answered
 * every normal state with 150×46 and every entity and class with a width of
 * exactly 210, whatever was written in them. Two nodes that draw at visibly
 * different widths were handed to ELK as the same box, and outside the editor
 * that box is what gets drawn.
 */
describe("against the constants it replaces", () => {
  /** What `estimateSize` returned for any normal state. */
  const OLD_STATE = { width: 150, height: 46 };
  /** What it returned for the width of any entity or class. */
  const OLD_TABLE_WIDTH = 210;

  it("tells apart two states it called identical", () => {
    const short = node("state", { label: "on", stateType: "normal", direction: "TB" });
    const long = node("state", {
      label: "awaiting downstream confirmation",
      stateType: "normal",
      direction: "TB",
    });

    const a = measureNode(short, fixed);
    const b = measureNode(long, fixed);
    expect(a.width).not.toEqual(b.width);
    expect(b.width).toBeGreaterThan(OLD_STATE.width);
  });

  it("tells apart two classes whose widths it fixed at 210", () => {
    const base = { label: "A", members: [], annotations: [], direction: "TB" };
    const narrow = node("class", { ...base, methods: ["+id()"] });
    const wide = node("class", {
      ...base,
      methods: ["+authenticateWithProvider(provider: OAuthProvider): Session"],
    });

    expect(measureNode(wide, fixed).width).toBeGreaterThan(measureNode(narrow, fixed).width);
    expect(measureNode(wide, fixed).width).toBeGreaterThan(OLD_TABLE_WIDTH);
  });
});
