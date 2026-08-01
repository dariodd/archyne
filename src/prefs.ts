import { create } from "zustand";

/**
 * Preferences that change how input is interpreted.
 *
 * Only one so far, and it exists for a specific reason. WCAG 2.1.4 says a
 * shortcut bound to a bare character key must be switchable off, remappable,
 * or active only while its target has focus — because speech-input users
 * trigger those keys by talking, and anyone with a tremor triggers them by
 * accident. Archyne binds two: `C` to start a connection, and `?` to open
 * the shortcut sheet.
 *
 * Turning them off is the mechanism offered. Remapping would mean a whole
 * key-binding editor for two keys, and focus-scoping does not work for `?`,
 * which has to be reachable from wherever you are.
 *
 * Shortcuts that need Ctrl or Meta are untouched: the criterion is about
 * keys a stray sound or twitch can produce on its own.
 */
const STORAGE_KEY = "graph:prefs";

interface Prefs {
  /** Whether `C` and `?` act on their own. */
  singleKeyShortcuts: boolean;
  setSingleKeyShortcuts: (on: boolean) => void;
}

function load(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return true;
    return (JSON.parse(raw) as { singleKeyShortcuts?: boolean }).singleKeyShortcuts !== false;
  } catch {
    return true;
  }
}

export const usePrefs = create<Prefs>((set) => ({
  singleKeyShortcuts: load(),
  setSingleKeyShortcuts: (on) => {
    set({ singleKeyShortcuts: on });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ singleKeyShortcuts: on }));
    } catch {
      // Storage unavailable; the choice still holds for this session.
    }
  },
}));

/** Read outside React, for the keydown handlers. */
export function singleKeyShortcutsEnabled(): boolean {
  return usePrefs.getState().singleKeyShortcuts;
}
