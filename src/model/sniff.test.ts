import { describe, expect, it } from "vitest";
import { sniffKind } from "./sniff";

describe("reading a diagram's family off its header", () => {
  it("knows each family it can edit", () => {
    expect(sniffKind("flowchart TD\n a --> b")).toBe("flowchart");
    expect(sniffKind("graph LR\n a --> b")).toBe("flowchart");
    expect(sniffKind("stateDiagram-v2\n [*] --> A")).toBe("state");
    expect(sniffKind("erDiagram\n A ||--o{ B : has")).toBe("er");
    expect(sniffKind("classDiagram\n class A")).toBe("class");
    expect(sniffKind("sequenceDiagram\n A->>B: hi")).toBe("sequence");
    expect(sniffKind("architecture-beta\n service a(server)[A]")).toBe("architecture");
    expect(sniffKind("C4Context\n Person(a, 'A')")).toBe("c4");
  });

  it("looks past the blank lines and comments above the header", () => {
    expect(sniffKind("\n\n%% a note\nflowchart TD\n a --> b")).toBe("flowchart");
  });

  it("looks past front matter, which is configuration and not a diagram", () => {
    expect(sniffKind("---\ntitle: Something\n---\nsequenceDiagram\n A->>B: hi")).toBe(
      "sequence",
    );
  });

  it("does not mistake `graph` inside a longer word", () => {
    expect(sniffKind("graphviz\n whatever")).toBeNull();
  });

  it("says nothing rather than guessing", () => {
    expect(sniffKind("")).toBeNull();
    expect(sniffKind("   \n\n")).toBeNull();
    expect(sniffKind("pie title Sales\n 'a': 10")).toBeNull();
  });

  it("reads only the first real line, so a word later on cannot mislead it", () => {
    expect(sniffKind('flowchart TD\n a["sequenceDiagram"] --> b')).toBe("flowchart");
  });
});
