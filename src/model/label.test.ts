import { describe, expect, it } from "vitest";
import { decodeLabel, labelLines, labelToText, textToLabel } from "./label";

describe("a label as it is drawn", () => {
  it("splits on every spelling of a mermaid line break", () => {
    expect(labelLines("a<br>b<BR/>c<br />d")).toEqual(["a", "b", "c", "d"]);
  });

  it("decodes the entities mermaid's own parser hands back", () => {
    expect(decodeLabel("DNS &amp; DDoS")).toBe("DNS & DDoS");
  });
});

describe("a label as it is edited", () => {
  it("shows a line break as a line break, not as markup", () => {
    expect(labelToText("Route53<br>DNS")).toBe("Route53\nDNS");
  });

  it("and writes it back as the one spelling mermaid understands", () => {
    expect(textToLabel("Route53\nDNS")).toBe("Route53<br>DNS");
    // A field on Windows hands back CRLF, which is not a second blank line.
    expect(textToLabel("Route53\r\nDNS")).toBe("Route53<br>DNS");
  });

  it("leaves a one-line label exactly as it was", () => {
    expect(textToLabel(labelToText("Plain"))).toBe("Plain");
  });

  it("does not decode on the way in, having no way to encode on the way out", () => {
    // `labelLines` also turns `&amp;` into `&`. Editing through that would
    // rewrite the label every time the field was opened and closed, so this
    // pair deliberately touches nothing but the line breaks.
    expect(textToLabel(labelToText("DNS &amp; DDoS"))).toBe("DNS &amp; DDoS");
  });

  it("survives a round trip through the field at any number of lines", () => {
    for (const label of ["One", "One<br>Two", "One<br>Two<br>Three"]) {
      expect(textToLabel(labelToText(label))).toBe(label);
    }
  });
});
