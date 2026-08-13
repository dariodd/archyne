/**
 * Build `archyne-render` from the application's own sources.
 *
 * There is no second copy of the renderer. `src/render/` in the repository root
 * is the renderer, the editor draws with the same modules, and this bundles two
 * entry points out of that tree. A package with its own copy of the geometry
 * would drift from the canvas within a release, which is the failure
 * `render/shapes.ts` and `render/markers.ts` exist to prevent — undoing it at
 * the packaging step would be a poor joke.
 *
 * Deliberately **not** an npm workspace, following `extensions/vscode/`: a
 * workspace changes how `npm ci` resolves at the root and how the provenance
 * publish behaves, and that pipeline has failed once already for a smaller
 * reason.
 *
 *   node scripts/build.mjs
 */
import { build } from "esbuild";
import { execFile } from "node:child_process";
import { rm, mkdir, copyFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, "..");
const root = resolve(pkg, "..", "..");
const dist = resolve(pkg, "dist");

/**
 * Left for the consumer's resolver rather than bundled.
 *
 * `mermaid` because it is a peer — anybody rendering Mermaid has it, and two
 * copies of a 2 MB package in one tree is a cost with no benefit. `elkjs`
 * because it is 1.4 MB that a document carrying its own positions never loads.
 * The Iconify collections because they are only reachable through
 * `renderSvgWithIcons`, and a consumer who draws flowcharts should not download
 * five icon packs to do it.
 */
const EXTERNAL = ["mermaid", "elkjs", "elkjs/*", "@iconify/utils", "@iconify-json/*"];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const result = await build({
  entryPoints: {
    index: resolve(root, "src/render/index.ts"),
    mermaid: resolve(root, "src/render/mermaid.ts"),
  },
  outdir: dist,
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  external: EXTERNAL,
  metafile: true,
  // Readable rather than minified: a consumer's own bundler will minify, and a
  // published library that cannot be read in `node_modules` is harder to trust
  // and harder to report a bug against.
  minify: false,
});

// Types, emitted by the compiler that already checks this code at the root.
await run("npx", ["tsc", "-p", resolve(pkg, "tsconfig.json")], { cwd: pkg, shell: true });

await copyFile(resolve(root, "LICENSE"), resolve(pkg, "LICENSE"));

/**
 * What must not be in the tarball, checked rather than hoped for.
 *
 * Every one of these has been in it. The first build shipped 1.8 MB of Iconify
 * data because the parser registered Mermaid's icon packs; the second shipped
 * React, xyflow and Zustand because `parseDiagram` imported an enum from React
 * Flow and read a colour off a store. Both were invisible until somebody
 * looked at the output, so now the build looks.
 */
const FORBIDDEN = [
  "react",
  "react-dom",
  "@xyflow",
  "zustand",
  "html-to-image",
  "codemirror",
  "@iconify-json",
  "icons-azure.generated",
  "icon-names.generated",
];

const bundled = Object.keys(result.metafile.inputs).map((f) => f.split("\\").join("/"));
const smuggled = FORBIDDEN.filter((name) => bundled.some((f) => f.includes(name)));
if (smuggled.length > 0) {
  console.error(
    `\narchyne-render pulled in ${smuggled.join(", ")} — that is an application, not a library.\n` +
      "Read the import chain from the entry, or run `npx esbuild --analyze`.",
  );
  process.exit(1);
}

const sizes = Object.entries(result.metafile.outputs)
  .filter(([f]) => f.endsWith(".js"))
  .map(([f, o]) => `  ${(o.bytes / 1024).toFixed(1)} KB  ${f.replace(/\\/g, "/")}`)
  .sort();
console.log("built archyne-render:");
for (const s of sizes) console.log(s);
