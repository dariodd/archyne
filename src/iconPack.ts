import { create } from "zustand";
import { iconName, type IconLibrary } from "./model/iconLibrary";
import { sanitiseSvg } from "./model/svg";
import { iconVendor, VENDORS, type IconVendor } from "./model/iconRole";

/**
 * Icons imported from disk, kept for this browser.
 *
 * They live in two places, and the split matters.
 *
 * A *diagram* keeps only the icons it uses, because a `.mmd` is a drawing and
 * not a library: carrying seven hundred unused Azure shapes in a file that
 * draws three of them would be absurd, and the pruning on save is deliberate.
 *
 * But somebody who has just imported a vendor's whole pack expects to be able
 * to *browse* it — next week, in a different diagram. That collection belongs
 * to the person, not to the drawing, so it is kept where the favourites are:
 * in this browser, alongside them.
 *
 * Everything here has been through `sanitiseSvg` before it was stored, and is
 * cleaned again on the way back in: local storage is as untrusted as a file.
 */
interface IconPack {
  icons: IconLibrary;
  /**
   * Whose each icon is, kept beside the icons rather than in them.
   *
   * The vendor is read off where the icon came from — a zip's folders, a
   * URL's path — and that is known only at the moment of import. Storing it
   * here means the palette can still file six hundred Azure icons under
   * Azure next week, when all that is left is their names.
   */
  vendors: Record<string, IconVendor>;
  /**
   * Take icons in. `name` is where each came from — a path or a URL, not
   * just a filename — because that is what says whose it is.
   *
   * Answers with the references, one per icon accepted.
   */
  add: (files: Array<{ name: string; svg: string }>) => string[];
  remove: (name: string) => void;
}

const KEY = "graph:icon-pack";
const VENDOR_KEY = "graph:icon-pack-vendors";

/** Beyond this the pack stops being a convenience and starts being a problem. */
const MAX_BYTES = 3_000_000;

function load(): IconLibrary {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, unknown>;
    const out: IconLibrary = {};
    for (const [name, svg] of Object.entries(raw)) {
      if (typeof svg !== "string") continue;
      const clean = sanitiseSvg(svg);
      if (clean) out[iconName(name)] = clean;
    }
    return out;
  } catch {
    return {};
  }
}

function loadVendors(): Record<string, IconVendor> {
  try {
    const raw = JSON.parse(localStorage.getItem(VENDOR_KEY) ?? "{}") as Record<string, unknown>;
    const out: Record<string, IconVendor> = {};
    for (const [name, vendor] of Object.entries(raw)) {
      if (typeof vendor === "string" && (VENDORS as string[]).includes(vendor)) {
        out[name] = vendor as IconVendor;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function save(icons: IconLibrary, vendors?: Record<string, IconVendor>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(icons));
    if (vendors) localStorage.setItem(VENDOR_KEY, JSON.stringify(vendors));
  } catch {
    // Out of room, or storage refused: the icons still work for this session
    // and in the documents that use them. Losing the browsable pack is the
    // least of the things that could be dropped here.
  }
}

export const useIconPack = create<IconPack>((set, get) => ({
  icons: load(),
  vendors: loadVendors(),

  add: (files) => {
    const icons = { ...get().icons };
    const vendors = { ...get().vendors };
    const refs: string[] = [];
    let bytes = JSON.stringify(icons).length;

    for (const file of files) {
      const clean = sanitiseSvg(file.svg);
      if (!clean) continue;
      const key = iconName(file.name);
      // Re-importing the same icon replaces it rather than piling up.
      if (!icons[key]) bytes += clean.length + key.length + 6;
      if (bytes > MAX_BYTES) break;
      icons[key] = clean;
      // Read from the path this arrived on, which is gone by the next line.
      const vendor = iconVendor(file.name);
      if (vendor !== "other" || !vendors[key]) vendors[key] = vendor;
      refs.push(`custom:${key}`);
    }

    set({ icons, vendors });
    save(icons, vendors);
    return refs;
  },

  remove: (name) => {
    const icons = { ...get().icons };
    const vendors = { ...get().vendors };
    const key = iconName(name);
    delete icons[key];
    delete vendors[key];
    set({ icons, vendors });
    save(icons, vendors);
  },
}));
