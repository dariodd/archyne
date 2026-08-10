import { beforeEach, describe, expect, it } from "vitest";
import { clampSideWidth, MIN_SIDE_WIDTH, useLayoutStore } from "./layoutStore";

beforeEach(() => {
  localStorage.clear();
  useLayoutStore.setState({ sideWidth: null, paletteOpen: false, sideOpen: false });
});

describe("side panel width", () => {
  it("follows the stylesheet until somebody drags the divider", () => {
    expect(useLayoutStore.getState().sideWidth).toBeNull();
  });

  it("remembers a dragged width", () => {
    // Comfortably inside the range the test environment's window allows.
    useLayoutStore.getState().setSideWidth(420);
    expect(useLayoutStore.getState().sideWidth).toBe(420);
    expect(JSON.parse(localStorage.getItem("graph:layout") ?? "{}")).toEqual({
      sideWidth: 420,
    });
  });

  it("hands the width back to the stylesheet on reset", () => {
    useLayoutStore.getState().setSideWidth(420);
    useLayoutStore.getState().resetSideWidth();
    expect(useLayoutStore.getState().sideWidth).toBeNull();
    // Left behind, a stored width would come back on the next reload.
    expect(localStorage.getItem("graph:layout")).toBeNull();
  });

  it("keeps the panel readable and the canvas alive while dragging", () => {
    expect(clampSideWidth(10, 1440)).toBe(MIN_SIDE_WIDTH);
    expect(clampSideWidth(1400, 1440)).toBe(920);
    expect(clampSideWidth(400, 1440)).toBe(400);
  });

  it("never squeezes the panel below its minimum, however narrow the window", () => {
    // A window smaller than panel + canvas cannot satisfy both; the panel
    // keeps its floor rather than collapsing to a sliver.
    expect(clampSideWidth(500, 400)).toBe(MIN_SIDE_WIDTH);
  });
});
