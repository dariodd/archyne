import { describe, expect, it } from "vitest";
import { plantumlFamily, plantumlToMermaid } from "./fromPlantuml";
import { parseDiagram } from "./diagram";

const uml = (body: string) => `@startuml\n${body}\n@enduml\n`;

/** The generated document without its header, trimmed line by line. */
const bodyOf = (code: string) =>
  code
    .split("\n")
    .slice(1)
    .map((l) => l.trim())
    .filter(Boolean);

describe("participants", () => {
  it("declares the ones a message mentions, in the order they appear", () => {
    const { code, nodes } = plantumlToMermaid(uml("Bob -> Alice : hi"));
    expect(nodes).toBe(2);
    expect(bodyOf(code)).toEqual(["participant Bob", "participant Alice", "Bob->>Alice: hi"]);
  });

  it("keeps an explicit declaration's order and kind", () => {
    const { code } = plantumlToMermaid(uml("actor User\nparticipant Web\nWeb -> User : ok"));
    expect(bodyOf(code).slice(0, 2)).toEqual(["actor User", "participant Web"]);
  });

  it("reads an alias written either way round", () => {
    const long = plantumlToMermaid(uml('participant "Web App" as W\nW -> W : tick'));
    const short = plantumlToMermaid(uml('participant W as "Web App"\nW -> W : tick'));
    for (const { code } of [long, short]) {
      expect(bodyOf(code)[0]).toBe("participant Web_App as Web App");
      expect(bodyOf(code)[1]).toBe("Web_App->>Web_App: tick");
    }
  });

  it("treats the shapes PlantUML has and Mermaid does not as participants", () => {
    const { code } = plantumlToMermaid(
      uml("database DB\nboundary UI\ncontrol C\nUI -> DB : read\nC -> DB : write"),
    );
    expect(bodyOf(code).slice(0, 3)).toEqual([
      "participant DB",
      "participant UI",
      "participant C",
    ]);
  });

  it("drops a colour and a stereotype from a name", () => {
    const { code } = plantumlToMermaid(
      uml("participant Api <<service>> #lightblue\nApi -> Api : x"),
    );
    expect(bodyOf(code)[0]).toBe("participant Api");
  });
});

describe("messages", () => {
  it.each([
    ["A -> B : m", "A->>B: m"],
    ["A --> B : m", "A-->>B: m"],
    ["A ->> B : m", "A->>B: m"],
    ["A -->> B : m", "A-->>B: m"],
    ["A ->x B : m", "A-xB: m"],
    ["A -\\ B : m", "A->>B: m"],
  ])("maps %s", (line, expected) => {
    expect(bodyOf(plantumlToMermaid(uml(line)).code)).toContain(expected);
  });

  it("keeps a solid arrowhead solid", () => {
    // PlantUML `->` is a line *with* a head; Mermaid spells that `->>` and
    // uses `->` for a line with none. Confusing the two removes every head.
    const { code } = plantumlToMermaid(uml("A -> B : m"));
    expect(code).toContain("A->>B: m");
    expect(code).not.toContain("A->B: m");
  });

  it("swaps the ends of a right-to-left arrow", () => {
    const { code } = plantumlToMermaid(uml("A <- B : reply"));
    expect(bodyOf(code)).toContain("B->>A: reply");
  });

  it("takes a message with no label", () => {
    expect(bodyOf(plantumlToMermaid(uml("A -> B")).code)).toContain("A->>B: msg");
  });

  it("reads the ++ shorthand as an activation", () => {
    const { code } = plantumlToMermaid(uml("A -> B ++ : call\nB --> A : done"));
    expect(bodyOf(code)).toEqual([
      "participant A",
      "participant B",
      "A->>B: call",
      "activate B",
      "B-->>A: done",
    ]);
  });
});

describe("blocks and notes", () => {
  it("carries alt and else through", () => {
    const { code } = plantumlToMermaid(
      uml("alt success\n  A -> B : ok\nelse failure\n  A -> B : no\nend"),
    );
    expect(bodyOf(code)).toEqual([
      "participant A",
      "participant B",
      "alt success",
      "A->>B: ok",
      "else failure",
      "A->>B: no",
      "end",
    ]);
  });

  it.each([
    ["loop 3 times", "loop 3 times"],
    ["opt maybe", "opt maybe"],
    ["par", "par"],
    ["break oops", "break oops"],
    ["critical hot", "critical hot"],
    // `group` has no Mermaid counterpart; a labelled frame is the closest.
    ["group Payment", "opt Payment"],
  ])("maps %s", (open, expected) => {
    const { code } = plantumlToMermaid(uml(`${open}\n  A -> B : m\nend`));
    expect(bodyOf(code)).toContain(expected);
  });

  it("closes a block written as `end loop`", () => {
    const { code } = plantumlToMermaid(uml("loop x\n  A -> B : m\nend loop"));
    expect(bodyOf(code).at(-1)).toBe("end");
  });

  it("reads a one-line note", () => {
    const { code } = plantumlToMermaid(uml("A -> B : m\nnote right of B : cached"));
    expect(bodyOf(code)).toContain("Note right of B: cached");
  });

  it("reads a note over two participants", () => {
    const { code } = plantumlToMermaid(uml("A -> B : m\nnote over A, B : shared"));
    expect(bodyOf(code)).toContain("Note over A,B: shared");
  });

  it("reads a note that runs to `end note`", () => {
    const { code } = plantumlToMermaid(
      uml("A -> B : m\nnote over A\n  first line\n  second line\nend note"),
    );
    expect(bodyOf(code)).toContain("Note over A: first line second line");
  });

  it("keeps a `ref over` as a note rather than losing its words", () => {
    const { code } = plantumlToMermaid(uml("A -> B : m\nref over A, B : see other diagram"));
    expect(bodyOf(code)).toContain("Note over A,B: see other diagram");
  });

  it("carries autonumber and explicit activation", () => {
    const { code } = plantumlToMermaid(
      uml("autonumber\nA -> B : m\nactivate B\nB --> A : r\ndeactivate B"),
    );
    expect(bodyOf(code)).toEqual([
      "participant A",
      "participant B",
      "autonumber",
      "A->>B: m",
      "activate B",
      "B-->>A: r",
      "deactivate B",
    ]);
  });
});

describe("what it steps over, and what it refuses", () => {
  it("ignores styling and the preprocessor", () => {
    const { code, nodes } = plantumlToMermaid(
      uml(
        [
          "!theme plain",
          "skinparam responseMessageBelowArrow true",
          "title My title",
          "hide footbox",
          "A -> B : m",
        ].join("\n"),
      ),
    );
    expect(nodes).toBe(2);
    expect(code).not.toContain("skinparam");
    expect(code).not.toContain("title");
  });

  it("ignores both comment syntaxes", () => {
    const { edges } = plantumlToMermaid(
      uml("' a line comment\n/' a block\n   comment '/\nA -> B : m"),
    );
    expect(edges).toBe(1);
  });

  it.each([
    ["usecase UC1", /component diagram/],
    ["object o1", /object diagram/],
  ])("refuses %s by name", (bodyText, expected) => {
    // The refusal moved to the family check, which is where a caller now
    // learns what a file is before any converter is chosen.
    expect(() => plantumlFamily(uml(bodyText))).toThrow(expected);
  });

  it("routes the two families that used to be refused", () => {
    expect(plantumlFamily(uml("class Foo {\n  int x\n}"))).toBe("class");
    expect(plantumlFamily(uml("state Idle\nIdle --> Busy"))).toBe("state");
  });

  it("refuses a sequence-shaped file with no messages in it", () => {
    expect(() => plantumlToMermaid(uml("participant A\nparticipant B"))).toThrow(/no messages/);
  });

  it("refuses a mindmap", () => {
    expect(() => plantumlFamily("@startmindmap\n* root\n@endmindmap")).toThrow(/that kind of/);
  });
});

describe("what comes out is a Mermaid document", () => {
  it("parses back as a sequence diagram, in order", async () => {
    const source = uml(
      [
        "autonumber",
        "actor User",
        'participant "Web app" as Web',
        "database DB",
        "",
        "User -> Web : GET /login",
        "activate Web",
        "alt cached",
        "  Web --> User : 200",
        "else miss",
        "  Web -> DB : SELECT",
        "  DB --> Web : row",
        "  Web --> User : 200",
        "end",
        "deactivate Web",
        "note right of DB : read replica",
      ].join("\n"),
    );

    const { code, nodes, edges } = plantumlToMermaid(source);
    expect([nodes, edges]).toEqual([3, 5]);

    const graph = await parseDiagram(code);
    expect(graph.kind).toBe("sequence");
    expect(graph.nodes.map((n) => n.id)).toEqual(["User", "Web_app", "DB"]);
    expect(graph.edges.map((e) => `${e.source}>${e.target}`)).toEqual([
      "User>Web_app",
      "Web_app>User",
      "Web_app>DB",
      "DB>Web_app",
      "Web_app>User",
    ]);
  });
});
