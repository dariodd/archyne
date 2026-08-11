import { describe, expect, it } from "vitest";
import {
  fenceAfterWrite,
  fenceAt,
  fenceReplacement,
  findMermaidFences,
  refindFence,
  wouldBreakFence,
  type Fence,
} from "./fences";

/**
 * The fence scanner, tested on documents rather than on lines.
 *
 * Everything here is about a range being right in a file that is mostly not a
 * diagram: the failure this guards is not an exception, it is Mermaid written
 * over the paragraph above it. So the round-trip case at the bottom does what
 * the extension does — take the replacement, put it into the document, scan
 * again — because that is the only check that holds all of the arithmetic at
 * once.
 */

/** The line-range replacement `FenceBinding` performs with a `WorkspaceEdit`. */
function write(source: string, fence: Fence, code: string): string {
  const lines = source.split("\n");
  const replacement = fenceReplacement(code, fence.indent);
  return [
    ...lines.slice(0, fence.startLine),
    ...(replacement === "" ? [] : replacement.replace(/\n$/, "").split("\n")),
    ...lines.slice(fence.endLine),
  ].join("\n");
}

describe("finding Mermaid blocks in Markdown", () => {
  it("finds a block and reads its content, fences excluded", () => {
    const source = ["# Title", "", "```mermaid", "flowchart TD", "  a --> b", "```", ""].join(
      "\n",
    );
    const [fence, ...rest] = findMermaidFences(source);
    expect(rest).toEqual([]);
    expect(fence.openLine).toBe(2);
    expect(fence.startLine).toBe(3);
    expect(fence.endLine).toBe(5);
    expect(fence.text).toBe("flowchart TD\n  a --> b");
  });

  it("leaves other languages alone", () => {
    const source = ["```ts", "const a = 1;", "```", "", "```", "plain", "```"].join("\n");
    expect(findMermaidFences(source)).toEqual([]);
  });

  it("reads `mmd` too, which people write for the extension's sake", () => {
    expect(findMermaidFences("```mmd\nflowchart TD\n```")).toHaveLength(1);
  });

  it("takes the language from the first word, not the whole info string", () => {
    const source = '```mermaid title="Flow" {highlight=1}\nflowchart TD\n```';
    expect(findMermaidFences(source)).toHaveLength(1);
  });

  it("does not read a block whose language merely starts with mermaid", () => {
    expect(findMermaidFences("```mermaidjs\nflowchart TD\n```")).toEqual([]);
  });

  it("ignores a fence nested inside a wider one, which is example text", () => {
    // How this file's own README documents the feature: a longer fence holding
    // a shorter one. The inner block is prose about Mermaid, not Mermaid.
    const source = ["````markdown", "```mermaid", "flowchart TD", "```", "````"].join("\n");
    expect(findMermaidFences(source)).toEqual([]);
  });

  it("reads tilde fences, and is not closed by the wrong character", () => {
    const source = ["~~~mermaid", "flowchart TD", "```", "  a --> b", "~~~"].join("\n");
    const [fence] = findMermaidFences(source);
    expect(fence.marker).toBe("~~~");
    expect(fence.text).toBe("flowchart TD\n```\n  a --> b");
  });

  it("is not closed by a fence shorter than the one that opened it", () => {
    const source = ["````mermaid", "flowchart TD", "```", "  a --> b", "````"].join("\n");
    expect(findMermaidFences(source)[0].text).toBe("flowchart TD\n```\n  a --> b");
  });

  it("does not treat a line with a backtick in its info string as a fence", () => {
    // ```` ```mermaid` ```` is inline code in prose, not a block.
    expect(findMermaidFences("```mermaid`\nflowchart TD\n```")).toEqual([]);
  });

  it("skips an unclosed block rather than running to the end of the file", () => {
    const source = ["```mermaid", "flowchart TD", "", "## The next section", "prose"].join(
      "\n",
    );
    expect(findMermaidFences(source)).toEqual([]);
  });

  it("numbers the blocks it finds", () => {
    const source = [
      "```mermaid",
      "flowchart TD",
      "```",
      "text",
      "```ts",
      "const a = 1;",
      "```",
      "```mermaid",
      "sequenceDiagram",
      "```",
    ].join("\n");
    expect(findMermaidFences(source).map((f) => f.index)).toEqual([0, 1]);
    expect(findMermaidFences(source)[1].startLine).toBe(8);
  });

  it("gives an empty block a range with somewhere to write", () => {
    const [fence] = findMermaidFences("```mermaid\n```");
    expect(fence.text).toBe("");
    expect(fence.startLine).toBe(1);
    expect(fence.endLine).toBe(1);
    expect(write("```mermaid\n```", fence, "flowchart TD")).toBe(
      "```mermaid\nflowchart TD\n```",
    );
  });
});

describe("a block indented inside a list item", () => {
  const source = [
    "1. First, the shape of it:",
    "",
    "   ```mermaid",
    "   flowchart TD",
    "     a --> b",
    "   ```",
    "",
    "2. Then the rest.",
  ].join("\n");

  it("hands the diagram over without the Markdown's indentation", () => {
    const [fence] = findMermaidFences(source);
    expect(fence.indent).toBe("   ");
    // The diagram's own two spaces survive; the list item's three do not.
    expect(fence.text).toBe("flowchart TD\n  a --> b");
  });

  it("puts the indentation back on the way in", () => {
    const [fence] = findMermaidFences(source);
    const out = write(source, fence, "flowchart TD\n  a --> b\n  b --> c");
    expect(out.split("\n")[5]).toBe("     b --> c");
    // And the list item is still a list item: the block ends where it did.
    expect(out).toContain("   ```\n\n2. Then the rest.");
  });

  it("does not indent blank lines into trailing whitespace", () => {
    const [fence] = findMermaidFences(source);
    expect(write(source, fence, "flowchart TD\n\n  a --> b")).toContain("\n\n     a --> b");
  });
});

describe("keeping hold of a block while the document moves", () => {
  const fence = (over: Partial<Fence> = {}): Fence => ({
    index: 1,
    openLine: 10,
    startLine: 11,
    endLine: 13,
    text: "flowchart TD\n  a --> b",
    indent: "",
    marker: "```",
    ...over,
  });

  it("follows a block that moved, by its content", () => {
    const previous = fence();
    const moved = fence({ openLine: 20, startLine: 21, endLine: 23 });
    expect(refindFence([fence({ index: 0, text: "other" }), moved], previous)).toBe(moved);
  });

  it("follows a block that was edited, by its position", () => {
    const previous = fence();
    const edited = fence({ text: "flowchart TD\n  a --> c" });
    expect(refindFence([fence({ index: 0, text: "other" }), edited], previous)).toBe(edited);
  });

  it("prefers position when two blocks hold the same diagram", () => {
    // A copied block: content cannot say which of the two is ours, so it must
    // not be allowed to answer.
    const previous = fence();
    const copy = fence({ index: 0, openLine: 2, startLine: 3, endLine: 5 });
    const ours = fence();
    expect(refindFence([copy, ours], previous)).toBe(ours);
  });

  it("says a deleted block is gone rather than picking a neighbour", () => {
    expect(refindFence([fence({ index: 0, text: "other" })], fence())).toBeNull();
  });

  it("finds the block a lens points at, exactly or from inside it", () => {
    const fences = findMermaidFences("```mermaid\nflowchart TD\n  a --> b\n```");
    expect(fenceAt(fences, 1)).toBe(fences[0]);
    expect(fenceAt(fences, 0)).toBe(fences[0]);
    expect(fenceAt(fences, 2)).toBe(fences[0]);
    expect(fenceAt(fences, 9)).toBeNull();
  });
});

describe("refusing to write a diagram that would break out", () => {
  it("catches a line that would close the fence early", () => {
    // Reachable through a multi-line label: the closer is a line of its own.
    expect(wouldBreakFence('flowchart TD\n  a["one\n```\ntwo"]', "```")).toBe(true);
  });

  it("lets ordinary Mermaid through, including backticks that are not a fence", () => {
    expect(wouldBreakFence("flowchart TD\n  a --> b", "```")).toBe(false);
    expect(wouldBreakFence('flowchart TD\n  a["`bold`"]', "```")).toBe(false);
    // Backticks with anything beside them are content, not a closing fence —
    // so this is safe to write, and refusing it would be a false alarm.
    expect(wouldBreakFence('flowchart TD\n  a["```"]', "```")).toBe(false);
  });

  it("measures against the fence in hand, not against three backticks", () => {
    // Inside a ```` ```` block, three backticks are content.
    expect(wouldBreakFence("flowchart TD\n```", "````")).toBe(false);
  });
});

describe("where the block ends up after a write", () => {
  const source = ["```mermaid", "flowchart TD", "  a --> b", "```", "after"].join("\n");

  it("round-trips: what is written is what is read back", () => {
    const [fence] = findMermaidFences(source);
    const code = "flowchart LR\n  a --> b\n  b --> c\n  c --> d";
    const out = write(source, fence, code);
    const [reread] = findMermaidFences(out);
    expect(reread.text).toBe(code);
    // The one thing a bad range would take with it.
    expect(out.endsWith("```\nafter")).toBe(true);
  });

  it("agrees with the document about where the block now ends", () => {
    const [fence] = findMermaidFences(source);
    const code = "flowchart LR\n  a --> b\n  b --> c";
    const predicted = fenceAfterWrite(fence, code);
    const [actual] = findMermaidFences(write(source, fence, code));
    expect(predicted.endLine).toBe(actual.endLine);
    expect(predicted.text).toBe(actual.text);
  });

  it("agrees about a block emptied out, too", () => {
    const [fence] = findMermaidFences(source);
    const predicted = fenceAfterWrite(fence, "");
    const [actual] = findMermaidFences(write(source, fence, ""));
    expect(predicted.endLine).toBe(actual.endLine);
    expect(actual.text).toBe("");
  });

  it("does not let a trailing newline grow the block on every save", () => {
    // The canvas serializes with a trailing newline; the fence supplies its
    // own. Left alone, each round trip would add a blank line.
    const [fence] = findMermaidFences(source);
    const once = write(source, fence, "flowchart TD\n");
    const [reread] = findMermaidFences(once);
    expect(write(once, reread, "flowchart TD\n")).toBe(once);
  });
});
