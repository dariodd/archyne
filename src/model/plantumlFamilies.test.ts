import { describe, expect, it } from "vitest";
import { plantumlClassToMermaid, plantumlStateToMermaid } from "./plantumlFamilies";
import { plantumlFamily } from "./fromPlantuml";
import { parseDiagram } from "./diagram";

const uml = (body: string) => `@startuml\n${body}\n@enduml\n`;

const bodyOf = (code: string) =>
  code
    .split("\n")
    .slice(1)
    .map((l) => l.trim())
    .filter(Boolean);

describe("telling the families apart", () => {
  it.each([
    ["A -> B : hi", "sequence"],
    ["class Order", "class"],
    ["interface Payable", "class"],
    ["abstract class Base", "class"],
    ["enum Status", "class"],
    ["state Idle", "state"],
    ["[*] --> Idle", "state"],
    ["Working --> [*]", "state"],
  ])("reads %s as a %s diagram", (line, family) => {
    expect(plantumlFamily(uml(line))).toBe(family);
  });

  it("still refuses the families with no Mermaid counterpart", () => {
    expect(() => plantumlFamily(uml("usecase UC1"))).toThrow(/component diagram/);
    expect(() => plantumlFamily(uml("object o1"))).toThrow(/object diagram/);
    expect(() => plantumlFamily("@startmindmap\n* root\n@endmindmap")).toThrow(/that kind of/);
  });

  it("names the three it does read, so the message is useful", () => {
    expect(() => plantumlFamily(uml("object o1"))).toThrow(/sequence, class and state/);
  });
});

describe("class diagrams", () => {
  it("reads a class with its fields and methods", () => {
    const { code } = plantumlClassToMermaid(
      uml("class Order {\n  +int id\n  -String note\n  +total(): float\n}"),
    );
    expect(bodyOf(code)).toEqual([
      "class Order {",
      "+int id",
      "-String note",
      "+total(): float",
      "}",
    ]);
  });

  it("annotates an interface, an abstract class and an enum", () => {
    const { code } = plantumlClassToMermaid(
      uml("interface Payable\nabstract class Base\nenum Status"),
    );
    expect(code).toContain("<<interface>>");
    expect(code).toContain("<<abstract>>");
    expect(code).toContain("<<enumeration>>");
  });

  it("reads a member declared outside the body", () => {
    const { code } = plantumlClassToMermaid(uml("class Order\nOrder : +int id\nOrder : pay()"));
    expect(bodyOf(code)).toEqual(["class Order {", "+int id", "pay()", "}"]);
  });

  it("marks a static and an abstract member as Mermaid does", () => {
    const { code } = plantumlClassToMermaid(
      uml("class A {\n  {static} count(): int\n  {abstract} draw()\n}"),
    );
    expect(code).toContain("count(): int$");
    expect(code).toContain("draw()*");
  });

  it.each([
    ["Base <|-- Order", "Base <|-- Order"],
    ["Order *-- Line", "Order *-- Line"],
    ["Order o-- Customer", "Order o-- Customer"],
    ["Order --> Address", "Order --> Address"],
    ["Base <|.. Order", "Base <|.. Order"],
  ])("maps the relation %s", (line, expected) => {
    const { code } = plantumlClassToMermaid(uml(line));
    expect(bodyOf(code)).toContain(expected);
  });

  it("keeps a dashed relation dashed", () => {
    const { code } = plantumlClassToMermaid(uml("Order ..|> Payable"));
    expect(code).toContain("..");
  });

  it("carries the cardinalities and the label", () => {
    const { code } = plantumlClassToMermaid(uml('Order "1" *-- "many" Line : contains'));
    expect(code).toContain('"1"');
    expect(code).toContain('"many"');
    expect(code).toContain(": contains");
  });

  it("turns a package into a namespace", () => {
    const { code } = plantumlClassToMermaid(
      uml('package "Sales" {\n  class Order\n}\nclass Other'),
    );
    expect(code).toMatch(/namespace Sales \{\n\s+class Order\n\s+\}/);
    expect(code).toContain("class Other");
  });

  it("reads a generic parameter", () => {
    const { code } = plantumlClassToMermaid(uml("class List<T>"));
    expect(code).toContain("class List~T~");
  });

  it("refuses a file with no classes in it", () => {
    expect(() => plantumlClassToMermaid(uml("' nothing here"))).toThrow(/no classes/);
  });

  it("parses back as a Mermaid class diagram", async () => {
    const source = uml(
      [
        'package "Sales" {',
        "  class Order {",
        "    +int id",
        "    +total(): float",
        "  }",
        "}",
        "abstract class Base",
        "interface Payable",
        "Base <|-- Order",
        "Order ..|> Payable",
        'Order "1" *-- "0..*" Line : contains',
      ].join("\n"),
    );
    const { code, nodes } = plantumlClassToMermaid(source);
    expect(nodes).toBe(5); // four classes and the package

    const graph = await parseDiagram(code);
    expect(graph.kind).toBe("class");
    expect(
      graph.nodes
        .filter((n) => n.type === "class")
        .map((n) => n.id)
        .sort(),
    ).toEqual(["Base", "Line", "Order", "Payable"]);
    expect(graph.nodes.find((n) => n.id === "Order")?.parentId).toBe("Sales");
    expect(graph.edges).toHaveLength(3);
  });
});

describe("state diagrams", () => {
  it("reads the start and end markers as the pseudostates they are", () => {
    const { code } = plantumlStateToMermaid(uml("[*] --> Idle\nIdle --> [*]"));
    expect(bodyOf(code)).toEqual(["Idle", "[*] --> Idle", "Idle --> [*]"]);
  });

  it("carries a transition label", () => {
    const { code } = plantumlStateToMermaid(uml("Idle --> Busy : start"));
    expect(code).toContain("Idle --> Busy : start");
  });

  it("reads an arrow with a direction hint", () => {
    // `-down->` and `-r->` are layout hints Mermaid has no use for, but the
    // transition they carry still has to arrive.
    const { code } = plantumlStateToMermaid(uml("Idle -down-> Busy\nBusy -r-> Done"));
    expect(code).toContain("Idle --> Busy");
    expect(code).toContain("Busy --> Done");
  });

  it("turns a composite state into a nested block", () => {
    const { code } = plantumlStateToMermaid(
      uml("[*] --> Busy\nstate Busy {\n  [*] --> Working\n  Working --> Waiting\n}"),
    );
    expect(code).toMatch(/state Busy \{[\s\S]*Working --> Waiting[\s\S]*\}/);
  });

  it("reads a choice pseudostate", () => {
    const { code } = plantumlStateToMermaid(uml("state C <<choice>>\nIdle --> C"));
    expect(code).toContain("state C <<choice>>");
  });

  it("reads a description on a state", () => {
    const { code } = plantumlStateToMermaid(uml("Idle --> Busy\nIdle : waiting for work"));
    expect(code).toContain("Idle");
  });

  it("refuses a file with no transitions in it", () => {
    expect(() => plantumlStateToMermaid(uml("state Idle"))).toThrow(/no transitions/);
  });

  it("parses back as a Mermaid state diagram", async () => {
    const source = uml(
      [
        "[*] --> Idle",
        "Idle --> Busy : start",
        "state Busy {",
        "  [*] --> Working",
        "  Working --> Waiting : block",
        "}",
        "Busy --> Idle : done",
        "Busy --> [*]",
      ].join("\n"),
    );
    const graph = await parseDiagram(plantumlStateToMermaid(source).code);
    expect(graph.kind).toBe("state");
    const named = graph.nodes.filter((n) => n.type === "state" || n.type === "group");
    expect(named.map((n) => n.id)).toEqual(
      expect.arrayContaining(["Idle", "Busy", "Working", "Waiting"]),
    );
    expect(graph.edges.length).toBeGreaterThanOrEqual(5);
  });
});
