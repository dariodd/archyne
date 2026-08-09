import type { Mermaid } from "mermaid";
import { carriedIconPack, normaliseIconRefs } from "../icons";
import { CUSTOM } from "./iconLibrary";

// mermaid is imported lazily: it is ~2 MB and (in Node) requires DOM globals
// to exist before the module is evaluated.
let mermaidPromise: Promise<Mermaid> | null = null;

/**
 * mermaid's per-kind parser DBs are singletons cleared at the start of each
 * parse/render — two concurrent calls corrupt each other (empty results, no
 * error). Every mermaid operation must go through this lock.
 */
let chain: Promise<unknown> = Promise.resolve();
/**
 * Render with mermaid, having first told it what this diagram is drawn with.
 *
 * Both of the things done here exist because the canvas and the preview drew
 * *different pictures* of one file: the canvas knows the icons a diagram
 * carries and the names it can fall back on, and mermaid knew neither.
 *
 * Every route to mermaid's renderer goes through this — the preview tab, the
 * read-only view for families Archyne cannot edit, and export — so the two
 * views cannot drift apart again by somebody forgetting a step.
 */
export function renderWithMermaid(id: string, code: string): Promise<{ svg: string }> {
  return withMermaid(async (m) => {
    // Re-registered per render: it is a map assignment, and the icons a
    // document carries change as they are imported.
    m.registerIconPacks([{ name: CUSTOM, icons: carriedIconPack() }]);
    return m.render(id, normaliseIconRefs(code));
  });
}

export function withMermaid<T>(fn: (m: Mermaid) => Promise<T>): Promise<T> {
  const run = chain.then(async () => fn(await getMermaid()));
  chain = run.catch(() => undefined);
  return run;
}

export function getMermaid(): Promise<Mermaid> {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((m) => {
      m.default.initialize({
        startOnLoad: false,
        // Diagram source is untrusted input: it arrives from `?code=` links,
        // the embed bridge's `load` message, and opened .mmd files, and the
        // rendered SVG is written straight into the DOM with innerHTML
        // (MermaidPreview).
        //
        // What this setting actually buys, measured against mermaid 11.9 —
        // labels are *not* it: `common.sanitizeText` runs DOMPurify over every
        // label at every security level, "loose" included. The live difference
        // is `utils.formatUrl`, which only calls `sanitizeUrl` when the level
        // is not "loose". So under "loose" a `click x href "javascript:…"`
        // lands in the rendered anchor verbatim, and a shared link becomes
        // one-click script execution in the app's origin; under "strict" it
        // becomes about:blank. (The other difference, `click x call fn()`, is
        // inert here either way — binding it requires calling mermaid's
        // `bindFunctions`, which Archyne never does.)
        //
        // The CSP in index.html blocks javascript: URLs too, but that is a
        // meta tag a self-hoster can drop or a proxy can rewrite; this is the
        // layer that must hold on its own. Archyne uses no `click`
        // interactions, so strict costs nothing — tests/e2e-csp.mts pins both
        // halves of that claim.
        //
        // `securityLevel` is on mermaid's `secure` list, so a `%%{init}%%`
        // directive inside a diagram cannot downgrade it back to "loose".
        securityLevel: "strict",
        // Never inject mermaid's own "Syntax error" bomb into the DOM —
        // the editor surfaces parse errors in its own banner.
        suppressErrorRendering: true,
      });
      // Vendor icons for architecture-beta (bundled, no network).
      m.default.registerIconPacks([
        {
          // Microsoft's, under their terms — see NOTICE. Registered here as
          // well as in the canvas renderer so the preview draws the same
          // diagram the canvas does.
          name: "azure",
          loader: () => import("../icons-azure.generated.json").then((mod) => mod.default),
        },
        {
          name: "logos",
          loader: () => import("@iconify-json/logos").then((mod) => mod.icons),
        },
        {
          name: "simple-icons",
          loader: () => import("@iconify-json/simple-icons").then((mod) => mod.icons),
        },
        {
          name: "devicon",
          loader: () => import("@iconify-json/devicon").then((mod) => mod.icons),
        },
        {
          name: "carbon",
          loader: () => import("@iconify-json/carbon").then((mod) => mod.icons),
        },
        {
          name: "tabler",
          loader: () => import("@iconify-json/tabler").then((mod) => mod.icons),
        },
      ]);
      return m.default;
    });
  }
  return mermaidPromise;
}
