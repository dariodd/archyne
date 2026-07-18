/**
 * Shared configuration for the browser-driven e2e scripts.
 *
 * These started as things you ran by hand against `npm run dev` in Edge, so
 * both the URL and the browser were baked in. CI has neither: the runner has
 * no Edge, and it serves the *built* app with `vite preview` on :4173 rather
 * than the dev server — the production bundle is what users get, and the dev
 * server's injected refresh preamble sits awkwardly with the app's own
 * `script-src 'self'` CSP.
 *
 * Both stay overridable, and the defaults are the local ones, so
 * `npm run dev` + `npx tsx tests/e2e-*.mts` still works with no ceremony.
 */

/** Where the app is served. CI sets this to the `vite preview` port. */
export const BASE = process.env.ARCHYNE_URL ?? "http://localhost:5173";

/**
 * Playwright browser channel. Undefined means the bundled Chromium, which is
 * what CI installs; locally `PLAYWRIGHT_CHANNEL=msedge` uses the installed
 * Edge and skips the download.
 */
export const CHANNEL = process.env.PLAYWRIGHT_CHANNEL ?? undefined;

/** `${BASE}/?code=…` for a diagram loaded through a share link. */
export function codeUrl(code: string): string {
  return `${BASE}/?code=${encodeURIComponent(code)}`;
}
