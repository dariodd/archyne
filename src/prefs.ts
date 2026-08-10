import { create } from "zustand";

/**
 * Preferences that change how input is interpreted, and how the editor reads.
 *
 * The first exists for a specific reason. WCAG 2.1.4 says a shortcut bound to
 * a bare character key must be switchable off, remappable, or active only
 * while its target has focus — because speech-input users trigger those keys
 * by talking, and anyone with a tremor triggers them by accident. Archyne
 * binds two: `C` to start a connection, and `?` to open the shortcut sheet.
 *
 * Turning them off is the mechanism offered. Remapping would mean a whole
 * key-binding editor for two keys, and focus-scoping does not work for `?`,
 * which has to be reachable from wherever you are.
 *
 * Shortcuts that need Ctrl or Meta are untouched: the criterion is about
 * keys a stray sound or twitch can produce on its own.
 *
 * The third says whether the `%% graph:…` sections the app writes into the
 * file start folded. They are machine-written, occasionally enormous, and
 * never edited by hand — but they are part of the document, so they fold
 * rather than disappear.
 *
 * The second is the Mermaid editor's type size. 12.5px is a comfortable
 * default on a laptop and too small on a 27" panel two feet away, which is
 * why every editor has this control; it is stored rather than derived from
 * the browser's zoom because zooming the page also zooms the canvas, and the
 * whole point is to read the code without shrinking the diagram.
 */
const STORAGE_KEY = "graph:prefs";

/** Matches CodeMirror's own default and the app's dense chrome. */
export const DEFAULT_EDITOR_FONT_SIZE = 12.5;
/** Below 9px the gutter numbers stop being legible; above 32 one line fills the panel. */
export const MIN_EDITOR_FONT_SIZE = 9;
export const MAX_EDITOR_FONT_SIZE = 32;

interface Stored {
  singleKeyShortcuts?: boolean;
  editorFontSize?: number;
  metaFolded?: boolean;
}

interface Prefs {
  /** Whether `C` and `?` act on their own. */
  singleKeyShortcuts: boolean;
  /** Mermaid editor type size, in px. */
  editorFontSize: number;
  /** Whether the `%% graph:…` metadata sections start folded. */
  metaFolded: boolean;
  setSingleKeyShortcuts: (on: boolean) => void;
  setMetaFolded: (folded: boolean) => void;
  /** Absolute size; clamped to the readable range. */
  setEditorFontSize: (px: number) => void;
  /** Relative step, for Ctrl+= / Ctrl+- and Ctrl+wheel. */
  nudgeEditorFontSize: (delta: number) => void;
  resetEditorFontSize: () => void;
}

function load(): Stored {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Stored;
  } catch {
    return {};
  }
}

export function clampFontSize(px: number): number {
  if (!Number.isFinite(px)) return DEFAULT_EDITOR_FONT_SIZE;
  // Half-pixel steps: the default is 12.5, and rounding it to whole pixels
  // would make the first press of Ctrl+= a bigger jump than the next one.
  const stepped = Math.round(px * 2) / 2;
  return Math.min(Math.max(stepped, MIN_EDITOR_FONT_SIZE), MAX_EDITOR_FONT_SIZE);
}

const stored = load();

export const usePrefs = create<Prefs>((set, get) => {
  const persist = () => {
    const { singleKeyShortcuts, editorFontSize, metaFolded } = get();
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ singleKeyShortcuts, editorFontSize, metaFolded }),
      );
    } catch {
      // Storage unavailable; the choice still holds for this session.
    }
  };

  return {
    singleKeyShortcuts: stored.singleKeyShortcuts !== false,
    editorFontSize: clampFontSize(stored.editorFontSize ?? DEFAULT_EDITOR_FONT_SIZE),
    metaFolded: stored.metaFolded !== false,
    setSingleKeyShortcuts: (on) => {
      set({ singleKeyShortcuts: on });
      persist();
    },
    setMetaFolded: (folded) => {
      if (get().metaFolded === folded) return;
      set({ metaFolded: folded });
      persist();
    },
    setEditorFontSize: (px) => {
      set({ editorFontSize: clampFontSize(px) });
      persist();
    },
    nudgeEditorFontSize: (delta) => {
      set({ editorFontSize: clampFontSize(get().editorFontSize + delta) });
      persist();
    },
    resetEditorFontSize: () => {
      set({ editorFontSize: DEFAULT_EDITOR_FONT_SIZE });
      persist();
    },
  };
});

/** Read outside React, for the keydown handlers. */
export function singleKeyShortcutsEnabled(): boolean {
  return usePrefs.getState().singleKeyShortcuts;
}
