import { describe, expect, it } from "vitest";
import { parseDiagram, serializeDiagram } from "./diagram";
import { defaultSize, estimateSize, type ShapeNode } from "./types";

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
    expect(out).not.toContain("constraint");
    expect(out.match(/@\{/g)).toHaveLength(1);
  });

  it("does not change the size of the box it is drawn in", async () => {
    // The picture is fitted into the shape; the shape is not grown around
    // the picture. A node's size is the author's, and a 60px picture must
    // not silently make its node two thirds taller than its neighbours.
    const a = await shapeNode(WITH_IMAGE, "a");
    const b = await shapeNode(WITH_IMAGE, "b");
    expect(estimateSize(a)).toEqual(estimateSize(b));
    expect(estimateSize(a)).toEqual(defaultSize(a.data.shape));
  });

  it("hands back an `icon:` node unchanged rather than dropping it", async () => {
    // Archyne never writes one — it names a pack the reader may not have —
    // but a file that arrives with one must not lose it on the next save.
    const code = 'flowchart LR\n  a@{ icon: "logos:aws", label: "AWS", pos: "b" }\n';
    const out = serializeDiagram(await parseDiagram(code));
    expect(out).toContain('icon: "logos:aws"');
    expect(out).toContain('pos: "b"');
  });
});
