/**
 * Turn Microsoft's Azure architecture icons into a bundled Iconify pack.
 *
 * ## Why this exists
 *
 * Iconify has 231 collections and not one of them is Azure's; the icons for a
 * VNet, a Key Vault or Cosmos DB exist only in Microsoft's own download. Every
 * tool that draws Azure architecture — draw.io, Mermaid Chart — ships that
 * download, and this is Archyne doing the same.
 *
 * ## The terms, which are not MIT
 *
 * From <https://learn.microsoft.com/azure/architecture/icons/>:
 *
 *   "Microsoft permits the use of these icons in architectural diagrams,
 *    training materials, or documentation. You can copy, distribute, and
 *    display the icons only for the permitted use unless granted explicit
 *    permission by Microsoft. Microsoft reserves all other rights."
 *
 * The icons are Microsoft's, they are **not** covered by Archyne's MIT licence,
 * and NOTICE records that. Shipping them inside an editor is a wider reading of
 * "the permitted use" than the sentence plainly supports; it was a considered
 * decision by the project owner, not an oversight. If Microsoft objects, the
 * fix is one commit: delete the generated file and the loader entry, and every
 * icon remains importable by hand as it was before.
 *
 * ## What it produces
 *
 * An Iconify pack, so the icons plug into everything that already exists —
 * the palette's search, the canvas renderer, and mermaid's own renderer in the
 * preview tab — with no new plumbing.
 *
 * Each icon is filed under a readable name (`key-vaults`) with Microsoft's own
 * catalogue code kept as an alias (`10001-icon-service-key-vaults`). The alias
 * is not decoration: it is the name Mermaid Chart uses, so a diagram written
 * there opens here with its icons intact.
 *
 * Run:  npm run icons:azure
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "src", "icons-azure.generated.json");

/** Microsoft's current pack. Bump when they publish a new version. */
const VERSION = 24;
const URL = `https://arch-center.azureedge.net/icons/Azure_Public_Service_Icons_V${VERSION}.zip`;

/** Nothing in the pack is anywhere near this; a file that is, is not an icon. */
const MAX_ICON_BYTES = 512_000;

/**
 * The readable half of an icon's name.
 *
 * Mirrors `iconName` in src/model/iconLibrary.ts — the same reduction, so an
 * icon imported by hand and the same icon bundled here land on one name
 * rather than two.
 */
function readableName(file) {
  return (
    file
      .toLowerCase()
      .replace(/\.svg$/, "")
      .replace(/\(\d+\)/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/^\d{4,}-/, "")
      .replace(/^icon-(service-|)/, "")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "icon"
  );
}

/** Microsoft's catalogue code, which is what Mermaid Chart's diagrams say. */
function catalogueName(file) {
  return file
    .toLowerCase()
    .replace(/\.svg$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * An SVG as Iconify stores one: the markup inside the root element, plus the
 * box it is drawn in.
 *
 * Deliberately narrow. Anything that is not a `<svg>` with a usable box is
 * dropped rather than guessed at, and `<script>`/`<style>` never appear in
 * this pack — but the renderer sanitises everything anyway, so this is the
 * outer of two checks and not the only one.
 */
function toIconifyIcon(svg) {
  const open = /<svg\b([^>]*)>/i.exec(svg);
  if (!open) return null;
  const attrs = open[1];
  const body = svg.slice(open.index + open[0].length).replace(/<\/svg\s*>\s*$/i, "");
  if (/<script|<foreignObject/i.test(body)) return null;

  const viewBox = /viewBox\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
  const [, , w, h] = viewBox
    ? viewBox
        .trim()
        .split(/[\s,]+/)
        .map(Number)
    : [];
  const width = Number(w) || Number(/width\s*=\s*["']([\d.]+)/i.exec(attrs)?.[1]);
  const height = Number(h) || Number(/height\s*=\s*["']([\d.]+)/i.exec(attrs)?.[1]);
  if (!width || !height) return null;

  return { body: body.trim(), width: Math.round(width), height: Math.round(height) };
}

console.log(`Downloading ${URL}`);
const res = await fetch(URL);
if (!res.ok) {
  console.error(`Microsoft's CDN answered ${res.status}. Has the pack moved, or the version?`);
  process.exit(1);
}
const zip = Buffer.from(await res.arrayBuffer());
console.log(`${(zip.length / 1e6).toFixed(2)} MB`);

const files = unzipSync(zip, {
  filter: (f) => f.name.toLowerCase().endsWith(".svg") && f.originalSize <= MAX_ICON_BYTES,
});

const icons = {};
const aliases = {};
let skipped = 0;
let collided = 0;

for (const [path, bytes] of Object.entries(files)) {
  const file = path.slice(path.lastIndexOf("/") + 1);
  const icon = toIconifyIcon(Buffer.from(bytes).toString("utf8"));
  if (!icon) {
    skipped++;
    continue;
  }

  const name = readableName(file);
  // The pack repeats an icon across its category folders, and the repeats are
  // identical; the first wins and the rest are not worth a second entry.
  if (icons[name]) collided++;
  else icons[name] = icon;

  // Microsoft's code as an alias of the readable name, which is what makes a
  // Mermaid Chart diagram (`azure:10001-icon-service-key-vaults`) resolve.
  const code = catalogueName(file);
  if (code !== name && !icons[code] && !aliases[code]) aliases[code] = { parent: name };
}

const pack = {
  prefix: "azure",
  icons,
  aliases,
  info: {
    name: "Azure architecture icons",
    author: { name: "Microsoft", url: "https://learn.microsoft.com/azure/architecture/icons/" },
    license: {
      title: "Microsoft icon terms — not MIT; see NOTICE",
      url: "https://learn.microsoft.com/azure/architecture/icons/",
    },
    version: `V${VERSION}`,
  },
};

writeFileSync(out, JSON.stringify(pack) + "\n");

const bytes = Buffer.byteLength(JSON.stringify(pack));
console.log(
  `\n${Object.keys(icons).length} icons, ${Object.keys(aliases).length} catalogue aliases`,
);
console.log(`${collided} duplicates across folders, ${skipped} files unusable`);
console.log(`Wrote ${out} (${(bytes / 1e6).toFixed(2)} MB raw)`);
console.log(`\nRemember: npm run icons:index, and NOTICE says where these came from.`);
