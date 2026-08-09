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
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "src", "icon-names.generated.json");

// Keep in sync with LOADERS in src/icons.ts.
const COLLECTIONS = ["logos", "devicon", "carbon", "tabler", "simple-icons"];

/**
 * Azure is not an Iconify package: it is generated from Microsoft's download
 * by `npm run icons:azure`, so it is read from disk rather than imported.
 * Its catalogue aliases are left out of the index on purpose — nobody
 * searches for "10245-icon-service-key-vaults", and listing both names would
 * show every icon twice.
 */
const LOCAL = { azure: "src/icons-azure.generated.json" };

const index = {};
let total = 0;
for (const name of COLLECTIONS) {
  const { icons } = await import(`@iconify-json/${name}`);
  const names = [...Object.keys(icons.icons), ...Object.keys(icons.aliases ?? {})].sort();
  index[name] = names;
  total += names.length;
  console.log(`${name.padEnd(14)} ${String(names.length).padStart(5)} names`);
}

for (const [name, file] of Object.entries(LOCAL)) {
  const pack = JSON.parse(readFileSync(join(root, file), "utf8"));
  const names = Object.keys(pack.icons).sort();
  index[name] = names;
  total += names.length;
  console.log(`${name.padEnd(14)} ${String(names.length).padStart(5)} names`);
}

writeFileSync(out, JSON.stringify(index) + "\n");

const bytes = Buffer.byteLength(JSON.stringify(index));
console.log(`\n${total} names across ${COLLECTIONS.length} collections`);
console.log(`Wrote ${out} (${(bytes / 1024).toFixed(0)} KB raw)`);
