import { create } from "zustand";

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

// Keep the DOM attribute in lockstep so CSS variables switch.
useThemeStore.subscribe((s) => {
  document.documentElement.dataset.theme = s.resolved;
});

/**
 * Edge/marker colors must be explicit values (not CSS vars — captured
 * exports can't resolve custom properties on SVG), so they are derived from
 * the resolved theme here and re-applied when it changes.
 */
export function edgeColors() {
  return useThemeStore.getState().resolved === "light"
    ? { stroke: "#5f6673", labelFill: "#1c2230", labelBg: "#ffffff", hollowFill: "#ffffff" }
    : { stroke: "#8b91a3", labelFill: "#e6e9f0", labelBg: "#20242f", hollowFill: "#12141a" };
}
