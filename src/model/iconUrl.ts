/**
 * A pasted link, turned into something the editor is willing to fetch.
 *
 * Archyne makes no network requests of its own — the CSP in `index.html` says
 * so — and importing an icon from a link is the single exception. It is worth
 * being exact about how narrow that exception is, because a general "fetch
 * whatever the user typed" in a page that also holds their diagrams is a
 * different program from this one.
 *
 * In the browser: **https only**, to a short list of hosts that serve raw
 * files with permissive CORS, and only paths that end in `.svg`. The list is
 * not a security boundary on its own — the browser's own CORS check is what
 * actually stops a link to somebody's intranet from returning anything — but
 * it keeps `connect-src` a closed set rather than `*`, so a bug here cannot
 * turn into an outbound channel to an arbitrary host.
 *
 * The desktop shell is not bound by CORS and does its own checking in
 * `desktop/main.cjs`; that is why it can take a vendor's `.zip` and this
 * cannot.
 */
import { iconName } from "./iconLibrary";

/**
 * Hosts the web build may fetch an icon from.
 *
 * All four serve raw files with `Access-Control-Allow-Origin: *`, which is
 * the property that makes them usable at all, and all four are where icon
 * sets actually live. Kept in step with `connect-src` in `index.html` — the
 * test beside this file fails if the two drift apart.
 */
export const ICON_HOSTS = [
  "raw.githubusercontent.com",
  "gist.githubusercontent.com",
  "cdn.jsdelivr.net",
  "unpkg.com",
  // Iconify's API, which serves one icon per request out of about two
  // hundred thousand. Five collections are bundled — sixteen thousand icons,
  // seven megabytes gzipped — and bundling the rest is not a thing anyone
  // should download. This host is how the other 184 000 are reachable
  // without the build carrying them.
  "api.iconify.design",
] as const;

/** Iconify's API, whose URLs name the collection in the path. */
const ICONIFY_API = "api.iconify.design";

/** `github.com/<owner>/<repo>/blob/<ref>/<path>` — a page, not a file. */
const GITHUB_PAGE = /^\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/;

/**
 * The URL to actually request, or null if the text is not one we will follow.
 *
 * Rewrites the GitHub link people actually have in hand — the one from the
 * address bar, which serves an HTML page — into the raw file beside it.
 * Copying a link to an icon gives you the page nine times out of ten, and
 * refusing it while accepting a URL the user would have had to construct is
 * pedantry rather than caution.
 */
export function normaliseIconUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null; // not a URL at all: a bare filename, a path, prose
  }
  if (url.protocol !== "https:") return null;

  const page = url.hostname === "github.com" ? GITHUB_PAGE.exec(url.pathname) : null;
  if (page) return `https://raw.githubusercontent.com/${page[1]}/${page[2]}/${page[3]}`;

  // A fragment is for a browser, and never part of what we ask the server.
  url.hash = "";
  return url.href;
}

/** Whether the web build may request this URL, CSP and CORS permitting. */
export function fetchableInBrowser(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    parsed.protocol === "https:" &&
    (ICON_HOSTS as readonly string[]).includes(parsed.hostname) &&
    // Only files that claim to be icons. The sanitiser is what decides
    // whether the *content* is an icon; this only avoids downloading a
    // repository's README to find out.
    parsed.pathname.toLowerCase().endsWith(".svg")
  );
}

/**
 * Where an icon came from, as the rest of the app should record it: the URL
 * without the query a CDN may have added.
 *
 * Iconify's API is the exception worth handling. `.../mdi/database.svg`
 * would be filed as plain `database`, which says nothing about which of the
 * two hundred sets it came from and collides with every other set's
 * database. The prefix belongs in the name, so it is folded in:
 * `mdi-database`.
 */
export function iconSource(url: string): string {
  const clean = url.replace(/[?#].*$/, "");
  let parsed: URL;
  try {
    parsed = new URL(clean);
  } catch {
    return clean;
  }
  if (parsed.hostname !== ICONIFY_API) return clean;

  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts.length !== 2 || !parts[1].toLowerCase().endsWith(".svg")) return clean;
  const [set, file] = parts;
  return `${parsed.origin}/${set}/${set}-${file}`;
}

/** The name to file a downloaded icon under: its filename, cleaned up. */
export function iconNameFromUrl(url: string): string {
  const path = url.split(/[?#]/)[0];
  const last = path.slice(path.lastIndexOf("/") + 1);
  try {
    return iconName(decodeURIComponent(last));
  } catch {
    // A stray `%` is not a reason to refuse the icon.
    return iconName(last);
  }
}

/**
 * Links out of a block of pasted text.
 *
 * One per line is what the dialog asks for, but people paste lists that came
 * from somewhere else — separated by commas, or wrapped in quotes by a shell
 * — and splitting on whitespace and commas costs nothing.
 */
export function parseLinks(text: string): string[] {
  const seen = new Set<string>();
  for (const piece of text.split(/[\s,]+/)) {
    const link = piece.replace(/^["'<]+|["'>]+$/g, "").trim();
    if (link) seen.add(link);
  }
  return [...seen];
}
