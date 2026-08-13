/**
 * What colour an edge is, without asking a store.
 *
 * `parseDiagram` bakes a marker colour into every edge it builds, so it needs
 * this — and it used to get it from `theme.ts`, which is a Zustand store. That
 * put **Zustand in the parse path**, and therefore in `archyne-render`, a
 * package whose whole argument is that it is not an application.
 *
 * The resolved theme is still the store's to decide. It just pushes the answer
 * here rather than being asked, which is a one-word change for the editor and
 * the difference between a library and an application for everybody else.
 */
import { PALETTE, type PaletteName } from "./render/boxModel";

/**
 * Dark until told otherwise, matching the stylesheet's `:root`.
 *
 * A renderer with no store never sets it, and gets the same colours the editor
 * shows on first paint — which is the right default for a picture that has to
 * look like the app.
 */
let resolved: PaletteName = "dark";

export function setResolvedTheme(name: PaletteName): void {
  resolved = name;
}

export function resolvedTheme(): PaletteName {
  return resolved;
}

/**
 * Edge and marker colours, as explicit values.
 *
 * They cannot be `var(--edge)`: a captured export carries no document to
 * resolve a custom property against, and neither does the SVG `renderSvg`
 * writes. The literals come from `src/styles.css` by way of the generated box
 * model, so changing a colour there changes them here.
 */
export function edgeColors() {
  const p = PALETTE[resolved];
  return {
    stroke: p.edge,
    labelFill: p.edgeLabel,
    labelBg: p.edgeLabelBg,
    hollowFill: p.markerHollow,
  };
}
