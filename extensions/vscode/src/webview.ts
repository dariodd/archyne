import * as vscode from "vscode";
import { rewriteHtml } from "./rewrite";

/**
 * The app's own `index.html`, made loadable inside a webview.
 *
 * Two things stand between a built page and a webview. Its asset URLs are
 * relative to wherever the page is served from, and a webview page is not
 * served from anywhere — every file has to be named through `asWebviewUri`.
 * And its Content-Security-Policy talks about `'self'`, which in a webview is
 * not the scheme the resources arrive on.
 *
 * This half reads the file and asks VS Code the two questions only it can
 * answer; `rewrite.ts` does the rewriting, and has the tests.
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

  return rewriteHtml(html, webview.cspSource, base);
}
