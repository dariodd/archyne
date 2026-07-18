/**
 * Generate the icon *name* index used by palette search.
 *
 * The Iconify collection packages carry full SVG path data — `logos`,
 * `devicon` and `simple-icons` are 2.7 / 1.8 / 1.9 MB gzipped. Search only
 * ever needed the names, but it used to obtain them by importing every
 * collection, so typing one query pulled roughly 6 MB before returning a
 * result.
 *
 * This writes names only. The full collection for an icon is still loaded
 * lazily, but now only for the collection that actually owns an icon being
 * rendered.
 *
 * Run:  npm run icons:index
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "src", "icon-names.generated.json");

// Keep in sync with LOADERS in src/icons.ts.
const COLLECTIONS = ["logos", "devicon", "carbon", "tabler", "simple-icons"];

const index = {};
let total = 0;
for (const name of COLLECTIONS) {
  const { icons } = await import(`@iconify-json/${name}`);
  const names = [...Object.keys(icons.icons), ...Object.keys(icons.aliases ?? {})].sort();
  index[name] = names;
  total += names.length;
  console.log(`${name.padEnd(14)} ${String(names.length).padStart(5)} names`);
}

writeFileSync(out, JSON.stringify(index) + "\n");

const bytes = Buffer.byteLength(JSON.stringify(index));
console.log(`\n${total} names across ${COLLECTIONS.length} collections`);
console.log(`Wrote ${out} (${(bytes / 1024).toFixed(0)} KB raw)`);
