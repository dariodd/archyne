import { describe, expect, it } from "vitest";
import { parseDiagram, serializeDiagram } from "./diagram";
import type { AnyNode } from "./types";

/**
 * `style <id> …` in the families that have it.
 *
 * Only a flowchart shape had anywhere to keep one, so a state diagram or a
 * class diagram arriving with colours was parsed, drawn plain, and written
 * back out without them — the file quietly lost what it came with. Mermaid
 * takes the same statement in four families, and its parsers were asked
 * rather than assumed: `architecture-beta` is the one that has no `style` at
 * all, which is why there is no case for it here.
 */
const CASES: Array<[string, string, string]> = [
  ["flowchart", 'flowchart TD\n  a["One"] --> b["Two"]\n', "a"],
  ["state", "stateDiagram-v2\n  Idle --> Busy\n", "Idle"],
  ["class", "classDiagram\n  class Account\n", "Account"],
  ["er", "erDiagram\n  CUSTOMER {\n    int id\n  }\n", "CUSTOMER"],
];

const STYLE = "fill:#f9f,stroke:#333,font-size:20px";
const node = (nodes: AnyNode[], id: string) => nodes.find((n) => n.id === id)!;

describe("a node's own style", () => {
  for (const [kind, code, id] of CASES) {
    describe(kind, () => {
      const styled = `${code}  style ${id} ${STYLE}\n`;

      it("is read off the file", async () => {
        const g = await parseDiagram(styled);
        expect((node(g.nodes, id).data as { styles?: string[] }).styles).toEqual([
          "fill:#f9f",
          "stroke:#333",
          "font-size:20px",
        ]);
      });

      it("is written back out", async () => {
        const out = serializeDiagram(await parseDiagram(styled));
        expect(out).toContain(`style ${id} `);
        expect(out).toContain("fill:#f9f");
        expect(out).toContain("font-size:20px");
      });

      it("survives a round trip through mermaid's parser unchanged", async () => {
        const once = serializeDiagram(await parseDiagram(styled));
        const twice = serializeDiagram(await parseDiagram(once));
        expect(twice).toBe(once);
      });

      it("adds nothing to a node that has none", async () => {
        const out = serializeDiagram(await parseDiagram(code));
        expect(out).not.toContain("style ");
      });
    });
  }
});
