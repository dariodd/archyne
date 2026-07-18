import type { Mermaid } from "mermaid";

// mermaid is imported lazily: it is ~2 MB and (in Node) requires DOM globals
// to exist before the module is evaluated.
let mermaidPromise: Promise<Mermaid> | null = null;

/**
 * mermaid's per-kind parser DBs are singletons cleared at the start of each
 * parse/render — two concurrent calls corrupt each other (empty results, no
 * error). Every mermaid operation must go through this lock.
 */
let chain: Promise<unknown> = Promise.resolve();
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
        securityLevel: "loose",
        // Never inject mermaid's own "Syntax error" bomb into the DOM —
        // the editor surfaces parse errors in its own banner.
        suppressErrorRendering: true,
      });
      // Vendor icons for architecture-beta (bundled, no network).
      m.default.registerIconPacks([
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
