/**
 * Fetching icons from links, in the browser or through the desktop shell.
 *
 * Two backends, and the difference between them is not a detail:
 *
 * 1. **Desktop** — the shell downloads, so there is no CORS to satisfy and a
 *    vendor's `.zip` can be taken whole. This is the one that works for the
 *    Azure pack, which is a zip behind a download page.
 * 2. **Browser** — `fetch` from the page, which means the host has to allow
 *    it and the CSP has to name it: single `.svg` files, from the handful of
 *    raw-file hosts in `model/iconUrl.ts`.
 *
 * What comes back is markup from somewhere on the internet, and it is not
 * trusted here at all: everything goes through `addCustomIcons`, which
 * sanitises exactly as it does for a file chosen from disk. This module's
 * only job is to decide what to ask for and to stop asking when the answer
 * gets too big.
 */
import { desktopBridge } from "./files";
import { fetchableInBrowser, iconSource, normaliseIconUrl } from "./model/iconUrl";

export interface FetchedIcon {
  /**
   * Where it came from — a URL, or an entry's path inside a vendor's zip.
   * Not the icon's name: `iconName` reduces this to one, and the folders on
   * the way are what say whose icon it is.
   */
  name: string;
  svg: string;
}

export interface FetchOutcome {
  icons: FetchedIcon[];
  /** The links that gave nothing, in the order they were given. */
  failed: string[];
}

/** An icon is a few kilobytes; anything past this is not one. */
export const MAX_ICON_BYTES = 512_000;

/** A paste is a handful of links, or a list. It is not a crawl. */
const MAX_LINKS = 200;

/** Enough to be quick over a list, few enough to be polite to the host. */
const AT_ONCE = 6;

const TIMEOUT_MS = 15_000;

/** `AbortSignal.timeout` is absent in some test environments. */
function deadline(): AbortSignal | undefined {
  return typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(TIMEOUT_MS)
    : undefined;
}

async function fetchOne(link: string): Promise<FetchedIcon | null> {
  const url = normaliseIconUrl(link);
  if (!url || !fetchableInBrowser(url)) return null;

  try {
    const res = await fetch(url, { signal: deadline(), redirect: "follow" });
    if (!res.ok) return null;

    // Asking before reading: a mislabelled link to something enormous should
    // cost one header exchange, not a download.
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_ICON_BYTES) return null;

    const svg = await res.text();
    if (svg.length > MAX_ICON_BYTES) return null;
    // The whole path, not the filename: `iconName` reduces it, and the
    // folders on the way are what say whose icon this is.
    return { name: iconSource(url), svg };
  } catch {
    // Refused by CORS, timed out, offline, DNS. All the same to the caller:
    // that link produced no icon, and the dialog says which ones did not.
    return null;
  }
}

/**
 * Fetch every link, in order, and report which gave nothing.
 *
 * Order is kept even though the requests overlap, because the caller may
 * hand the first icon to the selected node and "the first" should mean the
 * first one typed, not whichever host answered soonest.
 */
export async function fetchIcons(links: string[]): Promise<FetchOutcome> {
  const wanted = [...new Set(links.map((l) => l.trim()).filter(Boolean))].slice(0, MAX_LINKS);
  if (wanted.length === 0) return { icons: [], failed: [] };

  const bridge = desktopBridge();
  if (bridge?.fetchIcons) {
    try {
      return await bridge.fetchIcons(wanted);
    } catch {
      return { icons: [], failed: wanted };
    }
  }

  const got = new Array<FetchedIcon | null>(wanted.length).fill(null);
  let next = 0;
  const workers = Array.from({ length: Math.min(AT_ONCE, wanted.length) }, async () => {
    while (next < wanted.length) {
      const i = next++;
      got[i] = await fetchOne(wanted[i]);
    }
  });
  await Promise.all(workers);

  return {
    icons: got.filter((icon): icon is FetchedIcon => icon !== null),
    failed: wanted.filter((_, i) => got[i] === null),
  };
}
