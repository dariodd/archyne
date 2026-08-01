import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => {
  const state = {
    onConnect: vi.fn(),
    nodes: [
      { id: "a", data: { label: "Alpha" } },
      { id: "b", data: { label: "Beta" } },
    ],
  };
  return { state };
});

vi.mock("../store", () => {
  const useGraphStore = <T,>(selector: (s: typeof mocks.state) => T) => selector(mocks.state);
  useGraphStore.getState = () => mocks.state;
  return { useGraphStore };
});

const { useKeyboardConnect } = await import("./useKeyboardConnect");

/** Stand-ins for the elements React Flow renders for each node. */
function Fixture() {
  const { source, message } = useKeyboardConnect();
  return (
    <div>
      <div className="react-flow__node" data-id="a">
        <button>Alpha</button>
      </div>
      <div className="react-flow__node" data-id="b">
        <button>Beta</button>
      </div>
      <output data-testid="message">{message}</output>
      <output data-testid="source">{source ?? ""}</output>
    </div>
  );
}

beforeEach(() => mocks.state.onConnect.mockClear());
afterEach(cleanup);

describe("keyboard connect", () => {
  it("connects two nodes with C then Enter", async () => {
    render(<Fixture />);
    screen.getByRole("button", { name: "Alpha" }).focus();
    await userEvent.keyboard("c");

    expect(screen.getByTestId("source").textContent).toBe("a");
    expect(screen.getByTestId("message").textContent).toContain("Connecting from Alpha");

    screen.getByRole("button", { name: "Beta" }).focus();
    await userEvent.keyboard("{Enter}");

    expect(mocks.state.onConnect).toHaveBeenCalledWith({
      source: "a",
      target: "b",
      sourceHandle: null,
      targetHandle: null,
    });
    expect(screen.getByTestId("source").textContent).toBe("");
    expect(screen.getByTestId("message").textContent).toContain("Connected Alpha to Beta");
  });

  it("cancels on Escape", async () => {
    render(<Fixture />);
    screen.getByRole("button", { name: "Alpha" }).focus();
    await userEvent.keyboard("c");
    await userEvent.keyboard("{Escape}");

    expect(screen.getByTestId("source").textContent).toBe("");
    screen.getByRole("button", { name: "Beta" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(mocks.state.onConnect).not.toHaveBeenCalled();
  });

  it("refuses to connect a node to itself", async () => {
    render(<Fixture />);
    screen.getByRole("button", { name: "Alpha" }).focus();
    await userEvent.keyboard("c");
    await userEvent.keyboard("{Enter}");

    expect(mocks.state.onConnect).not.toHaveBeenCalled();
    expect(screen.getByTestId("message").textContent).toContain("different node");
    // Still armed, so the user can just move and try again.
    expect(screen.getByTestId("source").textContent).toBe("a");
  });

  it("ignores C while typing in a field", async () => {
    render(
      <>
        <input aria-label="Label" />
        <Fixture />
      </>,
    );
    screen.getByRole("textbox", { name: "Label" }).focus();
    await userEvent.keyboard("c");
    expect(screen.getByTestId("source").textContent).toBe("");
  });

  it("does nothing when focus is not on a node", async () => {
    render(<Fixture />);
    document.body.focus();
    await userEvent.keyboard("c");
    expect(screen.getByTestId("source").textContent).toBe("");
  });
});
