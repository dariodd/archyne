import * as vscode from "vscode";

/**
 * The app's own `index.html`, made loadable inside a webview.
 *
 * Two things stand between a built page and a webview. Its asset URLs are
 * relative to wherever the page is served from, and a webview page is not
 * served from anywhere — every file has to be named through `asWebviewUri`.
 * And its Content-Security-Policy talks about `'self'`, which in a webview is
 * not the scheme the resources arrive on.
 *
 * Both are handled by rewriting rather than by keeping a second copy of the
 * page here. A `<base>` element answers the first for every asset at once,
 * including the chunks the app fetches later, which a search-and-replace over
 * the markup would never see. And the policy is taken from the page with
 * `'self'` swapped for the webview's source, so the two cannot drift: the
 * hosts the app allows for icon fetching, and anything a future commit adds
 * to that list, arrive here without this file being touched.
 */
export async function webviewHtml(
  webview: vscode.Webview,
  appRoot: vscode.Uri,
): Promise<string> {
  const indexUri = vscode.Uri.joinPath(appRoot, "index.html");
  const html = new TextDecoder().decode(await vscode.workspace.fs.readFile(indexUri));

  // Trailing slash: a base without one resolves `./assets/x.js` against the
  // parent of the last path segment, which drops the folder the app lives in.
  const base = `${webview.asWebviewUri(appRoot).toString()}/`;

  return (
    html
      // The app declares `base-uri 'none'` — correct for a page served over
      // HTTP, where nothing should be able to re-point its relative URLs, and
      // fatal here, because that is precisely the mechanism this needs. Left
      // alone the `<base>` below is ignored and every asset 404s. Widened to
      // the webview's own source rather than dropped: the directive keeps
      // doing its job, against a base pointing anywhere else.
      .replace(/base-uri 'none'/, `base-uri ${webview.cspSource}`)
      .replace(/'self'/g, webview.cspSource)
      .replace(/<head>/i, `<head>\n    <base href="${base}">`)
  );
}
