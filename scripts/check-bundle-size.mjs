/**
 * Bundle budget for the *initial* page load.
 *
 * Archyne lazily loads the heavy things — mermaid's per-diagram renderers and
 * the Iconify collections — so total `dist/` size is not a useful signal (it
 * is tens of megabytes and always will be). What matters is what a browser
 * must download before the editor is interactive: the entry script, every
 * chunk Vite marks as a static import (`modulepreload`), and the stylesheets.
 *
 * Run:  node scripts/check-bundle-size.mjs [--update]
 */
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const budgetFile = join(root, "bundle-budget.json");

const html = readFileSync(join(dist, "index.html"), "utf8");

/** Assets the browser fetches before the app can run. */
function initialAssets() {
  const out = new Set();
  const add = (href) => {
    if (href && !/^(https?:)?\/\//.test(href)) out.add(href.replace(/^\.?\//, ""));
  };
  for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) add(m[1]);
  for (const m of html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)) add(m[1]);
  for (const m of html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)) add(m[1]);
  return [...out].sort();
}

const assets = initialAssets();
if (assets.length === 0) {
  console.error("No initial assets found in dist/index.html — did the build run?");
  process.exit(1);
}

let total = 0;
const rows = [];
for (const rel of assets) {
  const buf = readFileSync(join(dist, rel));
  const gz = gzipSync(buf).length;
  total += gz;
  rows.push({ rel, raw: statSync(join(dist, rel)).size, gz });
}

const fmt = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log("Initial page load (gzipped):");
for (const r of rows) console.log(`  ${fmt(r.gz).padStart(10)}  ${r.rel}`);
console.log(`  ${"-".repeat(10)}`);
console.log(`  ${fmt(total).padStart(10)}  total\n`);

if (process.argv.includes("--update")) {
  const limitKb = Math.ceil(total / 1024 / 10) * 10 + 30; // round up, +30 KB headroom
  writeFileSync(budgetFile, JSON.stringify({ initialGzipKb: limitKb }, null, 2) + "\n");
  console.log(`Wrote budget: ${limitKb} KB`);
  process.exit(0);
}

const { initialGzipKb } = JSON.parse(readFileSync(budgetFile, "utf8"));
const totalKb = total / 1024;
if (totalKb > initialGzipKb) {
  console.error(
    `Bundle budget exceeded: ${fmt(total)} gzipped > ${initialGzipKb} KB budget.\n` +
      `If the growth is intentional, re-run with --update and commit bundle-budget.json.`,
  );
  process.exit(1);
}
console.log(`Within budget (${totalKb.toFixed(1)} / ${initialGzipKb} KB).`);
