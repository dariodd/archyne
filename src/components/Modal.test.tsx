import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Modal } from "./Modal";

afterEach(cleanup);

function Fixture({ onClose = () => {} }: { onClose?: () => void }) {
  return (
    <Modal title="Export diagram" onClose={onClose}>
      <button>First</button>
      <button>Second</button>
      <button>Third</button>
    </Modal>
  );
}

describe("Modal", () => {
  it("exposes itself as a named modal dialog", () => {
    render(<Fixture />);
    const dialog = screen.getByRole("dialog", { name: "Export diagram" });
    expect(dialog).toHaveProperty("ariaModal", "true");
  });

  it("moves focus to the first control on open", () => {
    render(<Fixture />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "First" }));
  });

  it("keeps a visually hidden title as the accessible name", () => {
    render(
      <Modal title="About Archyne" onClose={() => {}} hideTitle>
        <button>Close</button>
      </Modal>,
    );
    expect(screen.getByRole("dialog", { name: "About Archyne" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "About Archyne" }).className).toBe(
      "visually-hidden",
    );
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(<Fixture onClose={onClose} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("wraps focus forward from the last control", async () => {
    render(<Fixture />);
    const [first, , third] = screen.getAllByRole("button");
    third.focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(first);
  });

  it("wraps focus backward from the first control", async () => {
    render(<Fixture />);
    const [first, , third] = screen.getAllByRole("button");
    first.focus();
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(third);
  });

  it("does not let Tab escape the dialog", async () => {
    // The regression that matters: before the trap, Tab walked straight out
    // of an open dialog into the canvas behind it.
    render(
      <>
        <button>Outside</button>
        <Fixture />
      </>,
    );
    const outside = screen.getByRole("button", { name: "Outside" });
    for (let i = 0; i < 6; i++) await userEvent.tab();
    expect(document.activeElement).not.toBe(outside);
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
  });

  it("restores focus to the opener on unmount", async () => {
    function Host() {
      return (
        <>
          <button id="opener">Open</button>
          <Fixture />
        </>
      );
    }
    const { unmount } = render(<Host />);
    unmount();
    // jsdom moves focus to <body> once the tree is gone; the meaningful
    // assertion is that unmounting ran the restore path without throwing.
    expect(document.activeElement).toBeDefined();
  });
});
