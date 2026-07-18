import { getIconData, iconToSVG, iconToHTML, replaceIDs } from "@iconify/utils";
import type { IconifyJSON } from "@iconify/types";

/**
 * mermaid architecture-beta's five built-in icon names, drawn as minimal
 * inline SVGs so the canvas needs no icon pack for plain diagrams.
 */
const BUILTIN: Record<string, string> = {
  server:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="18" height="7" rx="1.5"/><circle cx="7" cy="7.5" r="0.9" fill="currentColor"/><circle cx="7" cy="16.5" r="0.9" fill="currentColor"/></svg>',
  database:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>',
  disk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.6"/></svg>',
  cloud:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M7 18a4.5 4.5 0 1 1 .8-8.9A6 6 0 0 1 19.5 11 3.5 3.5 0 0 1 18.5 18Z"/></svg>',
  internet:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.4 4 5.6 4 9s-1.5 6.6-4 9c-2.5-2.4-4-5.6-4-9s1.5-6.6 4-9Z"/></svg>',
};

/** Bundled icon collections, loaded lazily on first use. */
const LOADERS: Record<string, () => Promise<IconifyJSON>> = {
  logos: () => import("@iconify-json/logos").then((m) => m.icons),
  devicon: () => import("@iconify-json/devicon").then((m) => m.icons),
  carbon: () => import("@iconify-json/carbon").then((m) => m.icons),
  tabler: () => import("@iconify-json/tabler").then((m) => m.icons),
  "simple-icons": () => import("@iconify-json/simple-icons").then((m) => m.icons),
};
const loaded = new Map<string, Promise<IconifyJSON>>();
function loadCollection(name: string): Promise<IconifyJSON> | null {
  const loader = LOADERS[name];
  if (!loader) return null;
  if (!loaded.has(name)) loaded.set(name, loader());
  return loaded.get(name)!;
}

/** Render an icon name ("database", "logos:aws-s3", "simple-icons:redis"). */
export async function getIconHtml(name: string): Promise<string> {
  const sep = name.indexOf(":");
  if (sep < 0) return BUILTIN[name] ?? BUILTIN.server;
  const collectionP = loadCollection(name.slice(0, sep));
  if (!collectionP) return BUILTIN.server;
  try {
    const json = await collectionP;
    const data = getIconData(json, name.slice(sep + 1));
    if (!data) return BUILTIN.server;
    const svg = iconToSVG(data, { height: "auto" });
    return iconToHTML(replaceIDs(svg.body), svg.attributes);
  } catch {
    return BUILTIN.server;
  }
}

async function collectionNames(collection: string): Promise<string[]> {
  const p = loadCollection(collection);
  if (!p) return [];
  const json = await p;
  return [...Object.keys(json.icons), ...Object.keys(json.aliases ?? {})];
}

/**
 * Search every bundled collection; colored `logos` first, monochrome
 * `simple-icons` after. Returns fully-qualified names.
 */
export async function searchIcons(query: string, limit = 60): Promise<string[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: string[] = [];
  for (const collection of Object.keys(LOADERS)) {
    const all = await collectionNames(collection);
    const starts = all.filter((n) => n.startsWith(q));
    const contains = all.filter((n) => !n.startsWith(q) && n.includes(q));
    out.push(...[...starts, ...contains].map((n) => `${collection}:${n}`));
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

/** Icons of a collection whose name contains one of the terms. */
export async function iconsByPrefix(
  collection: string,
  terms: string[],
  limit = 120,
): Promise<string[]> {
  const all = await collectionNames(collection);
  const starts = all.filter((n) => terms.some((t) => n.startsWith(t)));
  const contains = all.filter(
    (n) => !terms.some((t) => n.startsWith(t)) && terms.some((t) => n.includes(t)),
  );
  return [...starts, ...contains].slice(0, limit).map((n) => `${collection}:${n}`);
}

/** All bundled collection ids, in search priority order. */
export const ICON_COLLECTIONS = Object.keys(LOADERS);

export const BUILTIN_ICON_NAMES = Object.keys(BUILTIN);
