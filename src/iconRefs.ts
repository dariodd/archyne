/**
 * The icon knowledge the *parser* needs, without the icon data.
 *
 * `fromMermaid.ts` calls two functions before handing a document to Mermaid:
 * one hands over the icons the document carries, the other rewrites vendor
 * catalogue numbers to the names this build's packs actually hold. Both used to
 * live in `icons.ts` — and `icons.ts` holds the loaders for the bundled
 * collections, so importing either of them dragged **1.8 MB of icon data** into
 * anything that parsed a diagram. In the application that is a lazy chunk
 * nobody notices; in a published renderer it is most of the tarball.
 *
 * So the two are here, with no reference to a collection's contents. The list
 * of prefixes is shared with `icons.ts` rather than restated, because
 * `normaliseIconRefs` has to know which prefixes exist and nothing more.
 */
import type { IconifyJSON } from "@iconify/types";
import { CUSTOM, iconName, type IconLibrary } from "./model/iconLibrary";
import { svgToIcon } from "./model/svg";

/**
 * The collections this build ships. `icons.ts` keys its loaders by exactly
 * these, and a prefix missing here is one `normaliseIconRefs` leaves alone.
 */
export const COLLECTION_PREFIXES = [
  "azure",
  "logos",
  "devicon",
  "carbon",
  "tabler",
  "simple-icons",
] as const;

/**
 * Icons the open document brought with it.
 *
 * Module state rather than a parameter because every caller would otherwise
 * thread the same library through three layers to reach one call. The store
 * hands it over whenever the document changes.
 */
let carried: IconLibrary = {};

export function setCarriedIcons(library: IconLibrary): void {
  carried = library;
}

/**
 * The carried icons as an icon pack, for handing to mermaid.
 *
 * The canvas renders `custom:` icons from the markup directly, but mermaid only
 * knows *packs* — so the preview drew its "?" box for every imported icon while
 * the canvas beside it drew the icon. One diagram, two answers.
 *
 * Memoised on the library object, which the store replaces whenever the icons
 * change, so this converts once per change rather than once per render.
 */
let packed: { from: IconLibrary; pack: IconifyJSON } | null = null;

export function carriedIconPack(): IconifyJSON {
  if (packed?.from === carried) return packed.pack;
  const icons: IconifyJSON["icons"] = {};
  for (const [name, svg] of Object.entries(carried)) {
    const icon = svgToIcon(svg);
    if (icon) icons[name] = icon;
  }
  const pack: IconifyJSON = { prefix: CUSTOM, icons };
  packed = { from: carried, pack };
  return pack;
}

/** What the carried library currently holds, for `icons.ts` to render from. */
export function carriedIcons(): IconLibrary {
  return carried;
}

/**
 * Icon references rewritten to names the packs actually hold.
 *
 * Vendors number their icon files, and the number changes between releases: a
 * diagram written elsewhere may say
 * `azure:02068-icon-service-virtual-networks` where this build of the pack
 * calls the same drawing `azure:virtual-networks`.
 */
const CATALOGUE_REF = /\b([a-z][a-z0-9-]*):(\d{4,}-icon-(?:service-)?[a-z0-9-]+)/gi;
const KNOWN = new Set<string>(COLLECTION_PREFIXES);

export function normaliseIconRefs(code: string): string {
  // Only the collections this build actually has; a prefix it does not know is
  // left exactly as the author wrote it.
  return code.replace(CATALOGUE_REF, (all: string, prefix: string, name: string) =>
    KNOWN.has(prefix.toLowerCase()) ? `${prefix}:${iconName(name)}` : all,
  );
}
