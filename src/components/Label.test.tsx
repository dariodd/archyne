import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Label } from "./Label";
import { decodeLabel, labelLines } from "../model/label";

describe("reading a Mermaid label", () => {
  it("splits on every spelling of a line break", () => {
    expect(labelLines("a<br>b<br/>c<BR />d")).toEqual(["a", "b", "c", "d"]);
  });

  it("decodes the entities Mermaid hands back", () => {
    // Mermaid escapes `&` once a label holds any markup, so a label that
    // reads `DNS & DDoS` in the file comes back as `DNS &amp; DDoS`.
    expect(decodeLabel("DNS &amp; DDoS")).toBe("DNS & DDoS");
    expect(decodeLabel("a &lt;b&gt; c")).toBe("a <b> c");
    expect(decodeLabel("say #quot;hi#quot;")).toBe('say "hi"');
  });

  it("leaves anything else exactly as it is", () => {
    expect(decodeLabel("100% & rising &notanentity;")).toBe("100% & rising &notanentity;");
  });
});

describe("drawing one", () => {
  it("puts each line on its own line", () => {
    const { container } = render(<Label text="Route53<br>DNS &amp; DDoS" />);
    expect(container.querySelectorAll("br")).toHaveLength(1);
    expect(container.textContent).toBe("Route53DNS & DDoS");
  });

  it("does not put diagram markup into the document", () => {
    // Diagram text is untrusted — it arrives from files, imports and agents.
    const { container } = render(<Label text={'<img src=x onerror="boom">'} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe('<img src=x onerror="boom">');
  });

  it("draws a plain label as itself", () => {
    const { container } = render(<Label text="Just text" />);
    expect(container.querySelectorAll("br")).toHaveLength(0);
    expect(container.textContent).toBe("Just text");
  });
});
