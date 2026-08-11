import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { rewriteHtml } from "./rewrite";

/**
 * The rewrite is checked against the app's real `index.html`, not a fixture.
 *
 * A fixture would keep passing after somebody tightened the policy in the
 * page, which is the change most likely to break this — and it breaks it
 * silently, as a blank panel. Reading the built page instead means the day
 * `index.html` grows a directive this cannot handle, a test says so.
 *
 * `media/app/` is the copy the extension packages, and it only exists after
 * a build; the source page one level up is always there, and is what that
 * copy is made from.
 */
// Resolved from the runner's root rather than from `import.meta.url`, which
// under vitest is a transformed module id and not a file URL at all.
const SOURCE_PAGE = resolve(process.cwd(), "index.html");
if (!existsSync(SOURCE_PAGE)) {
  throw new Error(
    `Expected the app's index.html at ${SOURCE_PAGE}; run vitest from the repo root`,
  );
}

// Both real shapes: `cspSource` is the origin `asWebviewUri` produces, so the
// base sits inside it. Fake values that did not agree would let a broken
// `base-uri` pass.
const CSP = "https://file+.vscode-resource.vscode-cdn.net";
const BASE = `${CSP}/c%3A/repo/media/app/`;

function policy(html: string): string {
  const meta = /<meta\s+http-equiv="Content-Security-Policy"[^>]*>/is.exec(html);
  if (!meta) throw new Error("no CSP meta element in the page");
  const content = /content="([^"]*)"/s.exec(meta[0]);
  if (!content) throw new Error("CSP meta element has no content");
  return content[1].replace(/\s+/g, " ").trim();
}

describe("rewriting the page for a webview", () => {
  const source = readFileSync(SOURCE_PAGE, "utf8");
  const out = rewriteHtml(source, CSP, BASE);

  it("gives the page a base to resolve its assets against", () => {
    expect(out).toContain(`<base href="${BASE}">`);
  });

  it("puts the base before the first thing that needs it", () => {
    expect(out.indexOf("<base")).toBeLessThan(out.indexOf('src="/src/'));
  });

  it("leaves no 'self' behind, which would name the wrong origin", () => {
    expect(policy(out)).not.toContain("'self'");
  });

  it("points script-src at the webview's source", () => {
    expect(policy(out)).toContain(`script-src ${CSP}`);
  });

  it("stops base-uri from blocking the base it just added", () => {
    expect(policy(out)).not.toContain("base-uri 'none'");
    expect(policy(out)).toContain(`base-uri ${CSP}`);
  });

  it("keeps blob: workers, which auto-layout runs in", () => {
    expect(policy(out)).toMatch(/worker-src[^;]*blob:/);
  });

  it("keeps the icon hosts the app fetches from", () => {
    expect(policy(out)).toContain("https://api.iconify.design");
  });

  it("leaves the directives that name nothing alone", () => {
    expect(policy(out)).toContain("object-src 'none'");
    expect(policy(out)).toContain("form-action 'none'");
  });

  it("changes nothing else about the page", () => {
    // Everything but the two policy edits and the inserted element.
    const undone = out
      .replace(`\n    <base href="${BASE}">`, "")
      .replaceAll(CSP, "'self'")
      .replace("base-uri 'self'", "base-uri 'none'");
    expect(undone).toBe(source);
  });

  it("is a rewrite, not a rebuild: the source page still needs it", () => {
    // The negative control. If the page ever stops saying these, the rewrite
    // above is passing on a page that never needed rewriting.
    expect(policy(source)).toContain("'self'");
    expect(policy(source)).toContain("base-uri 'none'");
  });
});
