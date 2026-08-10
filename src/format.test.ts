import { describe, expect, it } from "vitest";
import { formatMermaid } from "./format";
import { TEMPLATES } from "./templates";
import { NEW_DIAGRAM } from "./store";

describe("formatMermaid", () => {
  it("indents statements one level under the header", () => {
    expect(formatMermaid("flowchart TD\na --> b\n")).toBe("flowchart TD\n  a --> b\n");
  });

  it("nests subgraphs and closes them again", () => {
    const messy = `flowchart TD
subgraph edge [Edge]
a --> b
subgraph inner [Inner]
c --> d
end
end
b --> c
`;
    expect(formatMermaid(messy)).toBe(`flowchart TD
  subgraph edge [Edge]
    a --> b
    subgraph inner [Inner]
      c --> d
    end
  end
  b --> c
`);
  });

  it("puts sequence block keywords a level out from their bodies", () => {
    const messy = `sequenceDiagram
A->>B: hi
alt ok
B-->>A: yes
else not ok
B-->>A: no
end
`;
    expect(formatMermaid(messy)).toBe(`sequenceDiagram
  A->>B: hi
  alt ok
    B-->>A: yes
  else not ok
    B-->>A: no
  end
`);
  });

  it("nests brace blocks in the families that use them", () => {
    expect(formatMermaid("erDiagram\nCUSTOMER {\nstring id PK\n}\n")).toBe(
      "erDiagram\n  CUSTOMER {\n    string id PK\n  }\n",
    );
    expect(formatMermaid("classDiagram\nclass Account {\n+string id\n}\n")).toBe(
      "classDiagram\n  class Account {\n    +string id\n  }\n",
    );
    expect(formatMermaid("stateDiagram-v2\nstate Active {\n[*] --> Idle\n}\n")).toBe(
      "stateDiagram-v2\n  state Active {\n    [*] --> Idle\n  }\n",
    );
  });

  it("leaves block keywords alone in families that do not have them", () => {
    // `opt` opens a block in a sequence diagram and is an ordinary node id
    // here. Indenting the rest of the file under it would be wrong.
    expect(formatMermaid("flowchart TD\nopt --> b\nb --> c\n")).toBe(
      "flowchart TD\n  opt --> b\n  b --> c\n",
    );
  });

  it("drops trailing spaces and collapses runs of blank lines", () => {
    expect(formatMermaid("flowchart TD\n  a --> b   \n\n\n\n  b --> c\n\n\n")).toBe(
      "flowchart TD\n  a --> b\n\n  b --> c\n",
    );
  });

  it("keeps the machine-written metadata comment at column 0", () => {
    const code =
      'flowchart TD\nsubgraph g [G]\na --> b\nend\n%% graph:positions {"a":{"x":0,"y":0}}\n';
    expect(formatMermaid(code)).toBe(
      'flowchart TD\n  subgraph g [G]\n    a --> b\n  end\n%% graph:positions {"a":{"x":0,"y":0}}\n',
    );
  });

  it("indents an author's own comment with the block it sits in", () => {
    expect(formatMermaid("flowchart TD\nsubgraph g [G]\n%% why\na --> b\nend\n")).toBe(
      "flowchart TD\n  subgraph g [G]\n    %% why\n    a --> b\n  end\n",
    );
  });

  it("leaves an init directive at column 0", () => {
    expect(formatMermaid("%%{init: {'theme':'dark'}}%%\nflowchart TD\na --> b\n")).toBe(
      "%%{init: {'theme':'dark'}}%%\nflowchart TD\n  a --> b\n",
    );
  });

  it("does not touch the inside of a string that spans lines", () => {
    const code = 'flowchart TD\na["first\n    second"]\nb --> c\n';
    expect(formatMermaid(code)).toBe('flowchart TD\n  a["first\n    second"]\n  b --> c\n');
  });

  it("never adds a trailing newline the document did not have", () => {
    expect(formatMermaid("flowchart TD\na --> b")).toBe("flowchart TD\n  a --> b");
  });

  it("survives an empty document", () => {
    expect(formatMermaid("")).toBe("\n");
    expect(formatMermaid("\n\n")).toBe("\n");
  });

  it("is idempotent", () => {
    const messy = `sequenceDiagram
participant A
loop every minute
A->>A: poll
alt found
A->>A: handle
else
A->>A: wait
end
end
`;
    const once = formatMermaid(messy);
    expect(formatMermaid(once)).toBe(once);
  });

  it("leaves the shipped templates and new-diagram stubs untouched", () => {
    // The formatter and the serializers have to agree on house style, or
    // formatting a file and then dragging a node in it produce rival diffs.
    for (const tpl of TEMPLATES) {
      expect(formatMermaid(tpl.code), tpl.id).toBe(tpl.code);
    }
    for (const [kind, code] of Object.entries(NEW_DIAGRAM)) {
      expect(formatMermaid(code), kind).toBe(code);
    }
  });
});
