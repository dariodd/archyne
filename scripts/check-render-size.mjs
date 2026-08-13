/**
 * How heavy is the renderer, on its own?
 *
 * The pitch for `archyne-render` is "easy to import", and weight is most of
 * what that means in practice — a consumer choosing between Mermaid's renderer
 * and this one is choosing what to put in their bundle. Until there is a
 * number, every packaging decision is a guess.
 *
 * So this bundles `src/render/renderSvg.ts` as a library would, with nothing
 * else in the graph, and reports what comes out. It also prints what the graph
 * actually pulled in, because the interesting failure is not "it grew 4 KB" but
 * "it now contains React".
 *
 *   node scripts/check-render-size.mjs
 *   node scripts/check-render-size.mjs --check   # fail over the budget
 */
import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = resolve(root, "src/render/renderSvg.ts");

/**
 * What the renderer must not drag in.
 *
 * Not a size limit — a shape limit. Any of these appearing in the graph means
 * the emitter has picked up a dependency on the application, and the failure
 * that produced is the one `tests/e2e-render.mts` caught the hard way: a module
 * that touches `window` while it is evaluating, so importing the renderer in
 * Node throws before a line of it runs.
 */
const FORBIDDEN = ["react", "react-dom", "@xyflow/react", "zustand", "mermaid", "codemirror"];

/** A budget with room to grow, so it flags a jump rather than every commit. */
const BUDGET_GZIP = 24 * 1024;

const result = await build({
  entryPoints: [ENTRY],
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  minify: true,
  write: false,
  metafile: true,
  // The one dependency the emitter genuinely has that a consumer would supply.
  external: [],
});

const [out] = result.outputFiles;
const raw = out.contents.byteLength;
const gzip = gzipSync(out.contents).byteLength;

const inputs = Object.keys(
  result.metafile.outputs[Object.keys(result.metafile.outputs)[0]].inputs,
);
const packages = new Set();
for (const input of inputs) {
  const m = /node_modules[/\\](@[^/\\]+[/\\][^/\\]+|[^/\\]+)/.exec(input);
  if (m) packages.add(m[1].replace(/\\/g, "/"));
}

console.log(
  `renderSvg bundled: ${(raw / 1024).toFixed(1)} KB raw, ${(gzip / 1024).toFixed(1)} KB gzipped`,
);
console.log(`  ${inputs.length} modules`);
console.log(
  `  packages: ${packages.size ? [...packages].sort().join(", ") : "none — all first-party"}`,
);

const heaviest = inputs
  .map((i) => ({
    file: relative(root, resolve(root, i)),
    bytes: result.metafile.inputs[i]?.bytes ?? 0,
  }))
  .sort((a, b) => b.bytes - a.bytes)
  .slice(0, 5);
console.log("  heaviest:");
for (const h of heaviest) console.log(`    ${(h.bytes / 1024).toFixed(1)} KB  ${h.file}`);

let failed = false;
for (const name of FORBIDDEN) {
  if (packages.has(name)) {
    console.error(`\n✗ the renderer pulled in "${name}", which makes it an application again`);
    failed = true;
  }
}
if (gzip > BUDGET_GZIP) {
  console.error(
    `\n✗ ${(gzip / 1024).toFixed(1)} KB gzipped is over the ${(BUDGET_GZIP / 1024).toFixed(0)} KB budget`,
  );
  failed = true;
}

// A sanity check on the entry itself, so a rename cannot make this pass vacuously.
const entrySource = await readFile(ENTRY, "utf8");
if (!entrySource.includes("export function renderSvg")) {
  console.error("\n✗ the entry no longer exports renderSvg — this measured the wrong thing");
  failed = true;
}

if (failed && process.argv.includes("--check")) process.exit(1);
if (!failed) console.log("\nwithin budget, and first-party only");
