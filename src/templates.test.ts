import { describe, expect, it } from "vitest";
import { TEMPLATES } from "./templates";
import { parseDiagram, serializeDiagram } from "./model/diagram";
import { en } from "./i18n/en";

describe("templates", () => {
  it("have unique ids", () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("reference message keys that exist", () => {
    for (const template of TEMPLATES) {
      expect(en[template.nameKey], template.id).toBeTruthy();
      expect(en[template.descriptionKey], template.id).toBeTruthy();
    }
  });

  it("carry no positions comment, so they lay out for the window they open in", () => {
    for (const template of TEMPLATES) {
      expect(template.code, template.id).not.toContain("%% graph:positions");
    }
  });

  // The point of the suite: these are hand-written Mermaid in seven different
  // dialects. A typo in one would only surface when a user clicked it.
  for (const template of TEMPLATES) {
    it(`"${template.id}" parses as a ${template.kind}`, async () => {
      const parsed = await parseDiagram(template.code);
      expect(parsed.kind).toBe(template.kind);
      expect(parsed.nodes.length).toBeGreaterThan(1);
    });

    it(`"${template.id}" survives a round-trip`, async () => {
      const first = await parseDiagram(template.code);
      const code = serializeDiagram({
        kind: first.kind,
        direction: first.direction,
        nodes: first.nodes,
        edges: first.edges,
        classDefs: first.classDefs,
        c4Flavor: first.c4Flavor,
        title: first.title,
        accTitle: first.accTitle,
        accDescr: first.accDescr,
        items: first.items,
        positions: {},
      });
      const second = await parseDiagram(code);
      expect(second.kind).toBe(first.kind);
      expect(second.nodes.map((n) => n.id).sort()).toEqual(first.nodes.map((n) => n.id).sort());
      expect(second.edges.length).toBe(first.edges.length);
    });
  }
});
