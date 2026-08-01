import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MenuButton, MenuItem } from "./MenuButton";

afterEach(cleanup);

function Fixture({ onPick = () => {} }: { onPick?: () => void }) {
  return (
    <MenuButton label="More">
      <>
        <MenuItem onSelect={onPick}>Do the thing</MenuItem>
        <label>
          Theme
          <select defaultValue="dark">
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>
      </>
    </MenuButton>
  );
}

const openPanel = () => userEvent.click(screen.getByRole("button", { name: "More" }));

describe("MenuButton", () => {
  it("opens and closes from the trigger", async () => {
    render(<Fixture />);
    expect(screen.queryByRole("group", { name: "More" })).toBeNull();

    await openPanel();
    expect(screen.getByRole("group", { name: "More" })).toBeDefined();

    await openPanel();
    expect(screen.queryByRole("group", { name: "More" })).toBeNull();
  });

  it("runs an item's handler before closing", async () => {
    // The regression this exists for: closing used to happen in a native
    // click listener racing the item's React handler, so selecting
    // "About Archyne" or "Copy code" closed the panel and did nothing else —
    // silently, with no error anywhere.
    const onPick = vi.fn();
    render(<Fixture onPick={onPick} />);

    await openPanel();
    await userEvent.click(screen.getByRole("button", { name: "Do the thing" }));

    expect(onPick).toHaveBeenCalledOnce();
    expect(screen.queryByRole("group", { name: "More" })).toBeNull();
  });

  it("leaves the panel open for settings, so two can be changed in one visit", async () => {
    render(<Fixture />);
    await openPanel();

    await userEvent.selectOptions(screen.getByLabelText("Theme"), "light");

    expect(screen.getByRole("group", { name: "More" })).toBeDefined();
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    render(<Fixture />);
    await openPanel();
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("group", { name: "More" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "More" }));
  });

  it("reports its expanded state", async () => {
    render(<Fixture />);
    const trigger = screen.getByRole("button", { name: "More" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    await openPanel();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });
});
