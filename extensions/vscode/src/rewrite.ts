/**
 * Turning the built page into one a webview will load.
 *
 * Kept apart from `webview.ts`, which does the VS Code half, because this half
 * is where the mistakes are: two rewrites of a security policy, either of
 * which fails as a blank panel with nothing in the log worth reading. Nothing
 * here imports `vscode`, so the repository's own test runner can hold it.
 */

/**
 * Rewrite `index.html` for a webview.
 *
 * `cspSource` is the origin the webview serves resources from
 * (`Webview.cspSource`), and `base` is the app's directory as a webview URI,
 * with a trailing slash.
 */
export function rewriteHtml(html: string, cspSource: string, base: string): string {
  return (
    html
      // The app declares `base-uri 'none'` — correct for a page served over
      // HTTP, where nothing should be able to re-point its relative URLs, and
      // fatal here, because that is precisely the mechanism this needs. Left
      // alone the `<base>` below is ignored and every asset 404s. Widened to
      // the webview's own source rather than dropped: the directive keeps
      // doing its job, against a base pointing anywhere else.
      .replace(/base-uri 'none'/, `base-uri ${cspSource}`)
      // Everything else the policy says about `'self'` — scripts, styles,
      // workers, fonts — means the webview's source here. Taken from the page
      // rather than restated, so the icon hosts it allows, and anything a
      // later commit adds to them, arrive without this file being touched.
      .replace(/'self'/g, cspSource)
      // A `<base>` answers every relative URL at once, including the chunks
      // the app fetches at run time, which rewriting the markup would miss.
      .replace(/<head>/i, `<head>\n    <base href="${base}">`)
  );
}
