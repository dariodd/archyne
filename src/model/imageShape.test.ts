import { describe, expect, it } from "vitest";
import { parseDiagram, serializeDiagram } from "./diagram";
import { LABEL_SIZE, defaultSize, labelSize, type ShapeNode } from "./types";
import { measureNode } from "../measureNode";

const WITH_IMAGE = `flowchart LR
  a@{ img: "https://api.iconify.design/logos/aws.svg", label: "AWS", pos: "t", w: 60, h: 60 }
  b["Plain"]
  a --> b
`;

/** The node a test is about, as the store would hold it. */
async function shapeNode(code: string, id: string) {
  const g = await parseDiagram(code);
  return g.nodes.find((n) => n.id === id) as ShapeNode;
}

describe("a node drawn with a picture", () => {
  it("keeps the picture, its size and where the label sits", async () => {
    const a = await shapeNode(WITH_IMAGE, "a");
    expect(a.data).toMatchObject({
      label: "AWS",
      img: "https://api.iconify.design/logos/aws.svg",
      imgPos: "t",
      imgWidth: 60,
      imgHeight: 60,
    });
  });

  it("comes back out of the serializer in the form it went in", async () => {
    const g = await parseDiagram(WITH_IMAGE);
    const out = serializeDiagram(g);
    expect(out).toContain('img: "https://api.iconify.design/logos/aws.svg"');
    expect(out).toContain('label: "AWS"');
    expect(out).toContain('pos: "t"');
    expect(out).toContain("w: 60");
    // And the plain node beside it is still written the plain way.
    expect(out).toContain('b["Plain"]');
  });

  it("survives a full round trip through mermaid's parser", async () => {
    // The real risk: `@{ … }` and `[label]` are alternatives, and emitting
    // both makes a file that no longer parses.
    const once = serializeDiagram(await parseDiagram(WITH_IMAGE));
    const twice = serializeDiagram(await parseDiagram(once));
    expect(twice).toBe(once);
  });

  it("writes nothing extra for a node that has no picture", async () => {
    const out = serializeDiagram(await parseDiagram(WITH_IMAGE));
    expect(out.match(/@\{/g)).toHaveLength(1);
  });

  it("pins the size and the aspect ratio even when nobody chose either", async () => {
    // Left to itself mermaid draws the picture at the size the SVG claims —
    // `width: 1.25em`, so about 20×16 for an icon set — and then, because
    // the node has a label, widens it to the 200px wrapping width and
    // stretches it to fit. The icon arrives as a smear. Writing the size
    // and `constraint: "on"` is what makes the file draw elsewhere the way
    // it draws here.
    const code = 'flowchart LR\n  a@{ img: "https://api.iconify.design/logos/aws.svg" }\n';
    const out = serializeDiagram(await parseDiagram(code));
    expect(out).toContain("w: 60");
    expect(out).toContain("h: 60");
    expect(out).toContain('constraint: "on"');
  });

  it("keeps a chosen size, and still pins the ratio", async () => {
    const code = 'flowchart LR\n  a@{ img: "https://x/a.svg", label: "A", w: 96, h: 96 }\n';
    const out = serializeDiagram(await parseDiagram(code));
    expect(out).toContain("w: 96");
    expect(out).toContain("h: 96");
    expect(out).toContain('constraint: "on"');
  });

  it("does not change the size of the box it is drawn in", async () => {
    // The picture is fitted into the shape; the shape is not grown around
    // the picture. A node's size is the author's, and a 60px picture must
    // not silently make its node two thirds taller than its neighbours.
    const a = await shapeNode(WITH_IMAGE, "a");
    const b = await shapeNode(WITH_IMAGE, "b");
    expect(measureNode(a)).toEqual(measureNode(b));
    expect(measureNode(a)).toEqual(defaultSize(a.data.shape));
  });

  it("but with the frame off it is the size of what it shows", async () => {
    // There is no box to fit into, so a default-sized one is not a size the
    // author chose either — it is 160×54 of empty space around a 60px logo,
    // which is where the selection outline and the arriving edges stop.
    const code = `${WITH_IMAGE}  style a fill:none,stroke:none\n`;
    const a = await shapeNode(code, "a");
    const plain = defaultSize(a.data.shape);
    expect(a.data.styles).toEqual(["fill:none", "stroke:none"]);
    expect(measureNode(a).width).toBeLessThan(plain.width);
    expect(measureNode(a).height).toBeGreaterThan(plain.height);
  });

  it("and grows with the type size the node asks for", async () => {
    // `font-size` is a label style in mermaid's own reckoning, so a node
    // that carries one is drawn with it — and an unframed node, being the
    // size of what it shows, is a bigger node for it.
    const off = "fill:none,stroke:none";
    const at = async (styles: string) =>
      measureNode(await shapeNode(`${WITH_IMAGE}  style a ${styles}\n`, "a"));

    expect(labelSize([off, "font-size:24px"])).toBe(24);
    expect((await at(`${off},font-size:24px`)).height).toBeGreaterThan((await at(off)).height);
    // Width only follows once the label is the wider of the two: a three
    // letter name at 24px is still narrower than the 60px picture above it.
    const long = 'flowchart LR\n  a@{ img: "https://x/a.svg", label: "A long enough name" }\n';
    const wide = measureNode(await shapeNode(`${long}  style a ${off},font-size:24px\n`, "a"));
    const narrow = measureNode(await shapeNode(`${long}  style a ${off}\n`, "a"));
    expect(wide.width).toBeGreaterThan(narrow.width);
  });

  it("reads only a size it could write back", async () => {
    // `1.4em` is a perfectly good declaration and not one the field can
    // show or change, so it reports the default rather than a guess.
    expect(labelSize(["font-size:1.4em"])).toBe(LABEL_SIZE);
    expect(labelSize(undefined)).toBe(LABEL_SIZE);
    expect(labelSize(["font-size:18px"])).toBe(18);
  });

  it("and only when *both* halves of the frame are off", async () => {
    // A node with a border and no fill still has a frame to be fitted into.
    const code = `${WITH_IMAGE}  style a fill:none\n`;
    const a = await shapeNode(code, "a");
    expect(measureNode(a)).toEqual(defaultSize(a.data.shape));
  });

  it("hands back an `icon:` node unchanged rather than dropping it", async () => {
    // Archyne never writes one — it names a pack the reader may not have —
    // but a file that arrives with one must not lose it on the next save.
    // Nor gain anything: the sizing an `img` node is given is for the shape
    // Archyne draws, and this is not that shape.
    const code = 'flowchart LR\n  a@{ icon: "logos:aws", label: "AWS", pos: "b" }\n';
    const out = serializeDiagram(await parseDiagram(code));
    expect(out).toContain('icon: "logos:aws"');
    expect(out).toContain('pos: "b"');
    expect(out).not.toContain("constraint");
    expect(out).not.toContain("w:");
  });
});
