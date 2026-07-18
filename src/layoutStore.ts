import { create } from "zustand";

/**
 * Drawer state for narrow viewports.
 *
 * The three-panel layout is fixed-width (170px palette + canvas + 380px side
 * panel), which leaves nothing for the canvas below roughly 1100px. Under the
 * breakpoint the palette and side panel become overlay drawers instead, so
 * the canvas keeps the full width and either panel is one tap away.
 *
 * Opening one closes the other: on a screen this narrow, two overlays at once
 * would cover the diagram entirely.
 */
interface LayoutState {
  paletteOpen: boolean;
  sideOpen: boolean;
  togglePalette: () => void;
  toggleSide: () => void;
  closeDrawers: () => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  paletteOpen: false,
  sideOpen: false,
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen, sideOpen: false })),
  toggleSide: () => set((s) => ({ sideOpen: !s.sideOpen, paletteOpen: false })),
  closeDrawers: () => set({ paletteOpen: false, sideOpen: false }),
}));
