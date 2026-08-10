import { create } from "zustand";

/**
 * Drawer state for narrow viewports, and the width of the side panel.
 *
 * The three-panel layout is fixed-width (170px palette + canvas + 380px side
 * panel), which leaves nothing for the canvas below roughly 1100px. Under the
 * breakpoint the palette and side panel become overlay drawers instead, so
 * the canvas keeps the full width and either panel is one tap away.
 *
 * Opening one closes the other: on a screen this narrow, two overlays at once
 * would cover the diagram entirely.
 *
 * `sideWidth` is the one part of that the user owns. It stays `null` until
 * somebody drags the divider, and while it is null the stylesheet decides —
 * which is what keeps the responsive steps (380 → 320 → drawer) working for
 * everyone who never touches it.
 */
const STORAGE_KEY = "graph:layout";

/**
 * Both floors are also written into `.side` in the stylesheet, which is what
 * enforces them at paint time — keep the two in step.
 *
 * Narrower than the first and the code editor is a column of broken lines;
 * past the second, the canvas the app exists for is a sliver.
 */
export const MIN_SIDE_WIDTH = 260;
const MIN_CANVAS_WIDTH = 520;

/**
 * What the panel may be right now, given the window it has to fit in.
 *
 * Used while dragging, so the divider stops where the panel stops instead of
 * banking hundreds of unusable pixels you then have to drag back. A window
 * that later gets narrower is *not* clamped through here: that would rewrite
 * the stored preference, and closing a laptop lid should not cost you the
 * width you chose on the big screen. The stylesheet fits it to the window.
 */
export function clampSideWidth(px: number, viewport = window.innerWidth): number {
  const max = Math.max(viewport - MIN_CANVAS_WIDTH, MIN_SIDE_WIDTH);
  return Math.round(Math.min(Math.max(px, MIN_SIDE_WIDTH), max));
}

interface LayoutState {
  paletteOpen: boolean;
  sideOpen: boolean;
  /** User-chosen width in px, or null to follow the stylesheet. */
  sideWidth: number | null;
  togglePalette: () => void;
  toggleSide: () => void;
  closeDrawers: () => void;
  setSideWidth: (px: number) => void;
  resetSideWidth: () => void;
}

function load(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = (JSON.parse(raw) as { sideWidth?: unknown }).sideWidth;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function persist(sideWidth: number | null) {
  try {
    if (sideWidth === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify({ sideWidth }));
  } catch {
    // Storage unavailable; the width still holds for this session.
  }
}

export const useLayoutStore = create<LayoutState>((set) => ({
  paletteOpen: false,
  sideOpen: false,
  sideWidth: load(),
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen, sideOpen: false })),
  toggleSide: () => set((s) => ({ sideOpen: !s.sideOpen, paletteOpen: false })),
  closeDrawers: () => set({ paletteOpen: false, sideOpen: false }),
  setSideWidth: (px) => {
    const width = clampSideWidth(px);
    set({ sideWidth: width });
    persist(width);
  },
  resetSideWidth: () => {
    set({ sideWidth: null });
    persist(null);
  },
}));
