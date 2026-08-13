/**
 * `archyne-render/mermaid` — the whole journey, text to picture.
 *
 * Separate from the main entry because of what it brings with it: Mermaid,
 * which does the parsing and is a **peer dependency** (consumers of a Mermaid
 * renderer have it already, and two copies of a 2 MB package in one tree helps
 * nobody), and ELK, which does the layout and is lazily imported so a caller
 * whose documents all carry their own positions never loads it.
 *
 * What it does *not* bring is icons. `renderSvgWithIcons` resolves them through
 * the bundled Iconify collections, and the first build of this package shipped
 * 1.8 MB of icon data because of it — for a renderer whose main entry is ten
 * kilobytes. Icons are injected instead: `iconNames` says which a diagram asks
 * for, and `RenderOptions.icons` takes the markup. The editor resolves its own.
 */
export { render, type RenderResult, type RenderCodeOptions } from "./fromCode";
export { iconNames } from "./iconNames";
export { UnsupportedFamilyError, canRender, type RenderOptions } from "./renderSvg";
