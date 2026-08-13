import { describe, expect, it } from "vitest";
import { parseDiagram } from "./diagram";

/**
 * Parsing many documents at once gives each of them its own answer.
 *
 * Mermaid's per-kind parser databases are module singletons, cleared at the
 * start of every parse, and `withMermaid` in `fromMermaid.ts` serialises every
 * route to Mermaid because of it. This matters more than it did when that lock
 * was written for one person typing: `archyne-render` is imported by build
 * steps that render a whole directory, and a reader who reaches for
 * `Promise.all` lands here.
 *
 * **What each of these two actually establishes**, because the difference is
 * easy to assume wrongly and was checked rather than assumed:
 *
 * The first is a contract test, not a guard on the lock. Removing the lock
 * entirely does **not** make it fail — forty concurrent parses across four
 * families still came back correct. There is one `await` inside a parse, on
 * `getDiagramFromText`, and with the diagram modules already loaded nothing
 * yields between clearing a database and reading it. So the corruption the lock
 * defends against is real in principle and did not reproduce here. Keep the
 * lock — the singletons are still singletons and a slower parse would open the
 * window — but do not expect this test to notice if it goes.
 *
 * The second one is load-bearing: change `chain = run.catch(…)` to `chain =
 * run` and it fails. That is worth having, because it is the difference between
 * one malformed diagram in a directory and a build that silently renders
 * nothing after it.
 */
describe("parsing several documents at once", () => {
  // Different families on purpose: each has its own singleton database, and a
  // pair from the same family sharing one is the sharpest version of the bug.
  const documents = [
    { code: 'flowchart TD\n  a["Alpha"] --> b["Bravo"]\n', kind: "flowchart", label: "Alpha" },
    {
      code: 'flowchart LR\n  c["Charlie"] --> d["Delta"]\n',
      kind: "flowchart",
      label: "Charlie",
    },
    {
      code: "stateDiagram-v2\n  [*] --> Echo\n  Echo --> Foxtrot\n",
      kind: "state",
      label: "Echo",
    },
    {
      code: "stateDiagram-v2\n  [*] --> Golf\n  Golf --> Hotel\n",
      kind: "state",
      label: "Golf",
    },
    { code: "erDiagram\n  INDIA {\n    string name PK\n  }\n", kind: "er", label: "INDIA" },
    {
      code: "classDiagram\n  class Juliett {\n    +int id\n  }\n",
      kind: "class",
      label: "Juliett",
    },
  ];

  it("keeps each document's nodes to itself", async () => {
    const parsed = await Promise.all(documents.map((d) => parseDiagram(d.code)));

    for (const [i, result] of parsed.entries()) {
      const { kind, label } = documents[i];
      // The empty result is the failure mode, so say so where it would show.
      expect(result.nodes.length, `document ${i} (${label}) came back empty`).toBeGreaterThan(
        0,
      );
      expect(result.kind).toBe(kind);

      const labels = result.nodes.map((n) =>
        String((n.data as { label?: unknown }).label ?? ""),
      );
      expect(labels.join(" ")).toContain(label);

      // And nothing that belongs to one of the others: a corrupted parse does
      // not merely lose its own nodes, it can be handed somebody else's.
      for (const other of documents) {
        if (other.label === label) continue;
        expect(labels.join(" ")).not.toContain(other.label);
      }
    }
  });

  it("survives a failing parse in the middle of the queue", async () => {
    // The lock chains on `catch`, so a rejection must not break the chain and
    // strand everything queued behind it — which would turn one bad diagram in
    // a directory into a build that renders nothing after it.
    const results = await Promise.allSettled([
      parseDiagram(documents[0].code),
      parseDiagram("flowchart TD\n  this is not a diagram ((((\n"),
      parseDiagram(documents[2].code),
    ]);

    expect(results[0].status).toBe("fulfilled");
    expect(results[2].status).toBe("fulfilled");
    if (results[2].status === "fulfilled") {
      const labels = results[2].value.nodes.map((n) =>
        String((n.data as { label?: unknown }).label ?? ""),
      );
      expect(labels.join(" ")).toContain("Echo");
    }
  });
});
