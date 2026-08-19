import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { en } from "../i18n/en";
import { CodePanel } from "./CodePanel";

// Mermaid is ~2 MB and draws by measuring text, which jsdom cannot do; the
// panel's own behaviour is what is under test, so the drawing is stubbed.
vi.mock("../model/mermaidRender", () => ({
  renderWithMermaid: vi.fn(async () => ({ svg: `<svg data-testid="drawn"></svg>` })),
}));

// CodeMirror wants a real layout to mount into.
vi.mock("./CodeEditor", () => ({ CodeEditor: () => <div data-testid="editor" /> }));

afterEach(cleanup);

/**
 * The preview is as narrow as the panel it lives in, and Mermaid draws at
 * whatever size the diagram needs — so anything wide arrives unreadable.
 * Expanding it is the way out of that column, and it must be reachable by
 * pointer and keyboard alike, then dismissable back to where it started.
 */
describe("the preview's expanded view", () => {
  async function openPreviewTab() {
    const user = userEvent.setup();
    render(<CodePanel />);
    await user.click(screen.getByRole("tab", { name: en["panel.tabPreview"] }));
    return user;
  }

  it("is not open until it is asked for", async () => {
    await openPreviewTab();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens from the expand button", async () => {
    const user = await openPreviewTab();
    await user.click(screen.getByRole("button", { name: en["panel.expand"] }));

    const dialog = await screen.findByRole("dialog", { name: en["panel.previewTitle"] });
    // Both copies are drawn: the one in the panel and the one in the dialog.
    await waitFor(() => expect(dialog.querySelector("svg")).not.toBeNull());
  });

  it("closes again, leaving the panel as it was", async () => {
    const user = await openPreviewTab();
    await user.click(screen.getByRole("button", { name: en["panel.expand"] }));
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: en["common.close"] }));
    expect(screen.queryByRole("dialog")).toBeNull();
    // Focus goes back to what opened the dialog, so keyboard users are not
    // dropped at the top of the document.
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: en["panel.expand"] }),
    );
  });
});
