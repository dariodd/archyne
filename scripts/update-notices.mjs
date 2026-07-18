/**
 * Regenerate the package table in THIRD-PARTY-NOTICES.md.
 *
 * `notices:check` is a gate with no fix button, which is a bad combination:
 * every production dependency bump turns CI red, and the only way out is to
 * hand-edit a 240-row markdown table. That is exactly the kind of chore that
 * gets solved by deleting the check.
 *
 * So the table between the markers is machine-generated from `sbom.json`,
 * and everything outside them — the trademark notice, the notes on elkjs and
 * the icon collections — stays hand-written, because that part is judgement
 * rather than data.
 *
 * Run:  npm run notices:update   (regenerates sbom.json first)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const START = "<!-- notices:table:start -->";
const END = "<!-- notices:table:end -->";

let sbom;
try {
  sbom = JSON.parse(readFileSync(join(root, "sbom.json"), "utf8"));
} catch {
  console.error("sbom.json is missing — run `npm run sbom` first.");
  process.exit(1);
}

/**
 * The repository URL is not in the SBOM (CycloneDX carries `purl`, not a
 * homepage), so it comes from the installed package. A missing entry leaves
 * the cell blank rather than guessing a URL — a wrong link in a compliance
 * document is worse than no link.
 */
function repoUrl(name) {
  const manifest = join(root, "node_modules", name, "package.json");
  if (!existsSync(manifest)) return "";
  try {
    const { repository } = JSON.parse(readFileSync(manifest, "utf8"));
    const url = typeof repository === "string" ? repository : (repository?.url ?? "");
    return url
      .replace(/^git\+/, "")
      .replace(/\.git$/, "")
      .replace(/\|/g, "%7C");
  } catch {
    return "";
  }
}

const rows = sbom.components
  .map((c) => {
    const licence = c.licenses?.[0]?.license?.id ?? c.licenses?.[0]?.license?.name ?? "";
    return `| ${c.name}@${c.version} | ${licence} | ${repoUrl(c.name)} |`;
  })
  .join("\n");

const table = [
  START,
  "",
  "| Package | License | Repository |",
  "|---|---|---|",
  rows,
  "",
  END,
].join("\n");

const file = join(root, "THIRD-PARTY-NOTICES.md");
const current = readFileSync(file, "utf8");

let next;
if (current.includes(START) && current.includes(END)) {
  next = current.replace(
    new RegExp(`${START}[\\s\\S]*?${END}`),
    // A `$` in a package name would otherwise be read as a replacement
    // pattern; pass a function so the string is used literally.
    () => table,
  );
} else {
  // First run: adopt the existing table by replacing it wholesale, from its
  // header row to the last row, leaving the surrounding prose untouched.
  const match = current.match(/\| Package \| License \| Repository \|[\s\S]*?(?=\n\n|\n#)/);
  if (!match) {
    console.error(
      "Could not find the package table in THIRD-PARTY-NOTICES.md, and no " +
        `${START} / ${END} markers are present. Add the markers around the ` +
        "table by hand once, and this will keep it up to date from then on.",
    );
    process.exit(1);
  }
  next = current.replace(match[0], table);
}

if (next === current) {
  console.log(
    `THIRD-PARTY-NOTICES.md is already up to date (${sbom.components.length} packages).`,
  );
  process.exit(0);
}

writeFileSync(file, next);
console.log(
  `Rewrote the package table in THIRD-PARTY-NOTICES.md — ${sbom.components.length} production packages.\n` +
    "Review the Notes section by hand: a new licence type may need explaining there.",
);
