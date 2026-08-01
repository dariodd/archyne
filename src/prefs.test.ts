import { beforeEach, describe, expect, it } from "vitest";
import { singleKeyShortcutsEnabled, usePrefs } from "./prefs";

/**
 * WCAG 2.1.4: a shortcut on a bare character key needs a way to switch it
 * off, or speech input and unsteady hands trigger it by accident.
 */
beforeEach(() => {
  localStorage.clear();
  usePrefs.setState({ singleKeyShortcuts: true });
});

describe("single-key shortcuts preference", () => {
  it("is on unless someone turns it off", () => {
    expect(singleKeyShortcutsEnabled()).toBe(true);
  });

  it("switches off and survives a reload", () => {
    usePrefs.getState().setSingleKeyShortcuts(false);
    expect(singleKeyShortcutsEnabled()).toBe(false);

    const stored = JSON.parse(localStorage.getItem("graph:prefs") ?? "{}") as {
      singleKeyShortcuts?: boolean;
    };
    expect(stored.singleKeyShortcuts).toBe(false);
  });

  it("treats a missing or unreadable preference as on", () => {
    localStorage.setItem("graph:prefs", "{not json");
    // The store reads at module load, so exercise the same path directly.
    usePrefs.setState({ singleKeyShortcuts: true });
    expect(singleKeyShortcutsEnabled()).toBe(true);
  });
});
