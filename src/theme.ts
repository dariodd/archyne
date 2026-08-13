import { create } from "zustand";
import { setResolvedTheme } from "./edgeTheme";

export type ThemeChoice = "dark" | "light" | "system";
type Resolved = "dark" | "light";

const KEY = "graph:theme";

function systemTheme(): Resolved {
  try {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function resolve(choice: ThemeChoice): Resolved {
  return choice === "system" ? systemTheme() : choice;
}

interface ThemeState {
  choice: ThemeChoice;
  resolved: Resolved;
  setTheme: (choice: ThemeChoice) => void;
  /** Re-resolve (used when the OS theme changes under "system"). */
  sync: () => void;
}

function loadChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "system" ? v : "dark";
  } catch {
    return "dark";
  }
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  choice: loadChoice(),
  resolved: resolve(loadChoice()),

  setTheme: (choice) => {
    try {
      localStorage.setItem(KEY, choice);
    } catch {
      // best-effort
    }
    set({ choice, resolved: resolve(choice) });
  },

  sync: () => set({ resolved: resolve(get().choice) }),
}));

// Keep the DOM attribute in lockstep so CSS variables switch, and tell
// `edgeTheme` which palette is in force — it holds no store, so the store has
// to push. Set once at module load as well, since the first parse can happen
// before anything has changed.
setResolvedTheme(useThemeStore.getState().resolved);
useThemeStore.subscribe((s) => {
  document.documentElement.dataset.theme = s.resolved;
  setResolvedTheme(s.resolved);
});

// `edgeColors` moved to `./edgeTheme`, which holds no store. It was reached by
// `parseDiagram`, and a store in the parse path is Zustand in `archyne-render`.
// The store still decides the answer — it pushes it now instead of being asked.
export { edgeColors } from "./edgeTheme";
