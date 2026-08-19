import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { renderWithMermaid } from "../model/mermaidRender";
import { MermaidPreview } from "./MermaidPreview";

/**
 * Mermaid, in miniature — including the part that bites.
 *
 * `mermaid.render(id, …)` opens with `document.getElementById(id)?.remove()`:
 * the id names a scratch element it expects to own, so anything already
 * carrying that id is torn out of the page first. The stub does the same, so
 * a preview that reuses another's id fails here exactly as it does on screen.
 */
vi.mock("../model/mermaidRender", () => ({
  renderWithMermaid: vi.fn(async (id: string) => {
    document.getElementById(id)?.remove();
    return { svg: `<svg id="${id}"></svg>` };
  }),
}));

afterEach(() => {
  cleanup();
  vi.mocked(renderWithMermaid).mockClear();
});

const CODE = "flowchart LR\n  a --> b";

describe("two previews on screen at once", () => {
  it("each draw under an id of their own", async () => {
    render(<MermaidPreview code={CODE} className="one" />);
    render(<MermaidPreview code={CODE} className="two" />);

    await waitFor(() => expect(renderWithMermaid).toHaveBeenCalledTimes(2));
    const [first, second] = vi.mocked(renderWithMermaid).mock.calls.map(([id]) => id);
    expect(first).not.toBe(second);
  });

  // The expanded preview opens over the panel's, and a read-only diagram
  // fills the canvas beside the Preview tab. Both drew a blank white plate:
  // the second render deleted the first one's SVG on its way in.
  it("leaves the one that was already drawn alone", async () => {
    render(<MermaidPreview code={CODE} className="one" />);
    await waitFor(() => expect(document.querySelector(".one svg")).not.toBeNull());

    render(<MermaidPreview code={CODE} className="two" />);
    await waitFor(() => expect(document.querySelector(".two svg")).not.toBeNull());

    expect(document.querySelector(".one svg")).not.toBeNull();
  });
});
