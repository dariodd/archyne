/**
 * Drawing with Mermaid's own renderer.
 *
 * Split from `fromMermaid.ts`, which parses, because of what this half carries:
 * the bundled vendor icon collections, the Azure pack alone being 1.5 MB. A
 * bundler emits a dynamic import as a chunk whenever the *module* is reachable,
 * whether or not anything calls it — so leaving these loaders beside the parser
 * put the whole icon library into `archyne-render`, a package that uses Mermaid
 * as a parser and draws with its own emitter.
 *
 * The editor still needs this: the preview tab, the read-only view for families
 * the canvas cannot edit, and the "mermaid" export source all draw here.
 */
import { carriedIconPack, normaliseIconRefs } from "../iconRefs";
import { CUSTOM } from "./iconLibrary";
import { withMermaid } from "./fromMermaid";

/**
 * The bundled vendor collections, registered with Mermaid the first time it is
 * asked to *draw* something.
 *
 * They used to be registered in `getMermaid()`, which every parse goes through
 * — and the Azure pack alone is 1.5 MB. In the application that is a lazy chunk
 * nobody notices; in `archyne-render` it was the whole tarball, for a renderer
 * that only ever uses Mermaid as a *parser* and draws with its own emitter.
 *
 * So they are registered here, on the path that needs them: Mermaid's own
 * renderer, which is what the preview tab and the read-only families use.
 */
let vendorRegistered = false;

// Vendor icons for architecture-beta (bundled, no network).
function vendorPacks() {
  return [
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
  ];
}

export function renderWithMermaid(id: string, code: string): Promise<{ svg: string }> {
  return withMermaid(async (m) => {
    if (!vendorRegistered) {
      m.registerIconPacks(vendorPacks());
      vendorRegistered = true;
    }
    // Re-registered per render: it is a map assignment, and the icons a
    // document carries change as they are imported.
    m.registerIconPacks([{ name: CUSTOM, icons: carriedIconPack() }]);
    return m.render(id, normaliseIconRefs(code));
  });
}
