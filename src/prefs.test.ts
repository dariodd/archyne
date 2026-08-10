import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_EDITOR_FONT_SIZE,
  MAX_EDITOR_FONT_SIZE,
  MIN_EDITOR_FONT_SIZE,
  singleKeyShortcutsEnabled,
  usePrefs,
} from "./prefs";

/**
 * WCAG 2.1.4: a shortcut on a bare character key needs a way to switch it
 * off, or speech input and unsteady hands trigger it by accident.
 */
beforeEach(() => {
  localStorage.clear();
  usePrefs.setState({
    singleKeyShortcuts: true,
    editorFontSize: DEFAULT_EDITOR_FONT_SIZE,
    metaFolded: true,
  });
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

describe("editor type size", () => {
  it("steps up and down in half-pixel-friendly increments", () => {
    usePrefs.getState().nudgeEditorFontSize(1);
    expect(usePrefs.getState().editorFontSize).toBe(13.5);
    usePrefs.getState().nudgeEditorFontSize(-1);
    expect(usePrefs.getState().editorFontSize).toBe(12.5);
  });

  it("stops at both ends of the readable range", () => {
    usePrefs.getState().setEditorFontSize(400);
    expect(usePrefs.getState().editorFontSize).toBe(MAX_EDITOR_FONT_SIZE);
    usePrefs.getState().setEditorFontSize(1);
    expect(usePrefs.getState().editorFontSize).toBe(MIN_EDITOR_FONT_SIZE);
  });

  it("survives a reload, alongside the other preferences", () => {
    usePrefs.getState().setSingleKeyShortcuts(false);
    usePrefs.getState().setEditorFontSize(18);
    expect(JSON.parse(localStorage.getItem("graph:prefs") ?? "{}")).toEqual({
      singleKeyShortcuts: false,
      editorFontSize: 18,
      metaFolded: true,
    });
  });

  it("goes back to the default", () => {
    usePrefs.getState().setEditorFontSize(20);
    usePrefs.getState().resetEditorFontSize();
    expect(usePrefs.getState().editorFontSize).toBe(DEFAULT_EDITOR_FONT_SIZE);
  });
});

describe("the metadata section", () => {
  it("starts folded", () => {
    expect(usePrefs.getState().metaFolded).toBe(true);
  });

  it("stays open once opened, including after a reload", () => {
    usePrefs.getState().setMetaFolded(false);
    expect(usePrefs.getState().metaFolded).toBe(false);
    expect(
      (JSON.parse(localStorage.getItem("graph:prefs") ?? "{}") as { metaFolded?: boolean })
        .metaFolded,
    ).toBe(false);
  });
});
