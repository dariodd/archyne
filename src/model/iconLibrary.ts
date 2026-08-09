/**
 * Icons the diagram carries with it — a fifth trailing comment, e.g.
 *
 *   %% graph:icons {"azure-vnet":"<svg viewBox=…>…</svg>"}
 *
 * The bundled collections are brand logos and general-purpose glyphs. The
 * icons people actually want for a cloud architecture are the vendors' own,
 * and those cannot be shipped inside Archyne: Microsoft's terms permit their
 * use in architectural diagrams and reserve every other right, which covers
 * an editor redistributing them as a feature. The same is true of most such
 * sets.
 *
 * So the diagram holds them instead. That is the arrangement the terms are
 * written for — the icons are in a diagram, made by the person the terms give
 * permission to — and it has a plainer virtue besides: a `.mmd` opened by
 * somebody else draws correctly without their having to find the same pack.
 *
 * Referenced as `custom:azure-vnet`, the shape the bundled collections
 * already use, so nothing else has to know where an icon came from.
 */
import { sanitiseSvg } from "./svg";

export type IconLibrary = Record<string, string>;

const LINE_RE = /^\s*%%\s*graph:icons\s+(\{.*\})\s*$/m;

/** The prefix that means "in this diagram" rather than a bundled collection. */
export const CUSTOM = "custom";

/**
 * A name that is safe to put in the file and to look up again: letters,
 * digits and dashes. Vendors' filenames are full of spaces and versions
 * ("Virtual Networks (10061).svg"), and the name is what a node stores.
 *
 * It is also what a person types and searches for, which is why the vendors'
 * cataloguing is taken off the front. Microsoft's pack ships
 * `02068-icon-service-Virtual-Networks.svg`: keeping that whole string made
 * every one of its 700 icons begin with a number nobody knows, so the list
 * sorted by catalogue order and searching for the thing you wanted found it
 * only if you happened to include the middle of the name.
 */
export function iconName(raw: string): string {
  // Callers pass wherever the icon came from — a zip entry's path, a URL —
  // because the folders are what say whose icon it is (see `iconRole.ts`).
  // The name is the file at the end of it.
  const file =
    raw
      .replace(/[?#].*$/, "")
      .replace(/\\/g, "/")
      .split("/")
      .pop() ?? "";

  return (
    file
      .toLowerCase()
      .replace(/\.svg$/, "")
      // Version numbers in brackets are noise, and every vendor pack has them.
      .replace(/\(\d+\)/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      // A leading catalogue number, then the vendor's own word for "icon".
      // Only at the front, and only as whole words: an icon really called
      // "365-defender" or "service-bus" keeps its name. Four digits or more,
      // because a catalogue number is padded ("00001", "029203566") and a
      // number that belongs to a product name is short — Microsoft has both,
      // and "365" is not a catalogue entry.
      .replace(/^\d{4,}-/, "")
      .replace(/^icon-(service-|)/, "")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "icon"
  );
}

/**
 * Read the library, sanitising as it comes in.
 *
 * On the way in, not only on the way out: a file may have been written by
 * anything, and the rest of the application should never hold markup it has
 * not already cleaned.
 */
export function readIconLibrary(code: string): IconLibrary | null {
  const m = code.match(LINE_RE);
  if (!m) return null;
  try {
    const raw = JSON.parse(m[1]) as Record<string, unknown>;
    const out: IconLibrary = {};
    for (const [name, svg] of Object.entries(raw)) {
      if (typeof svg !== "string") continue;
      const clean = sanitiseSvg(svg);
      if (clean) out[iconName(name)] = clean;
    }
    return out;
  } catch {
    return null;
  }
}

export function stripIconLibrary(code: string): string {
  return code.replace(LINE_RE, "").replace(/\n+$/, "\n");
}

export function iconLibraryLine(library: IconLibrary): string {
  return `%% graph:icons ${JSON.stringify(library)}`;
}

/**
 * Replace, add or remove the line.
 *
 * An empty library removes it: a diagram using none of its own icons should
 * look exactly like one that never had any.
 */
export function patchIconLibrary(code: string, library: IconLibrary): string {
  const entries = Object.entries(library).filter(([, svg]) => svg.length > 0);
  if (entries.length === 0) return stripIconLibrary(code);
  const line = iconLibraryLine(Object.fromEntries(entries));
  if (LINE_RE.test(code)) return code.replace(LINE_RE, line);
  return `${code.replace(/\n+$/, "")}\n${line}\n`;
}

/**
 * Only the icons still referred to.
 *
 * An icon dropped from the last node that used it would otherwise sit in the
 * file for ever, and these are kilobytes each. Called when the document is
 * written, so removing a node removes its icon with it.
 */
export function usedIcons(library: IconLibrary, referenced: Iterable<string>): IconLibrary {
  const wanted = new Set<string>();
  for (const ref of referenced) {
    if (ref.startsWith(`${CUSTOM}:`)) wanted.add(ref.slice(CUSTOM.length + 1));
  }
  const out: IconLibrary = {};
  for (const [name, svg] of Object.entries(library)) {
    if (wanted.has(name)) out[name] = svg;
  }
  return out;
}
