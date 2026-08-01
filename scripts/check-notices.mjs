/**
 * Check that THIRD-PARTY-NOTICES.md still matches the dependency tree.
 *
 * The file is hand-maintained. Without a check it drifts silently — a
 * dependency gets added or a licence changes, and the notices keep claiming
 * something that is no longer true. That is a compliance problem, not a
 * cosmetic one, so this fails CI rather than warning.
 *
 * Run:  npm run notices:check   (after `npm run sbom`)
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const notices = readFileSync(join(root, "THIRD-PARTY-NOTICES.md"), "utf8");

let sbom;
try {
  sbom = JSON.parse(readFileSync(join(root, "sbom.json"), "utf8"));
} catch {
  console.error("sbom.json is missing — run `npm run sbom` first.");
  process.exit(1);
}

/**
 * Only direct production dependencies are checked by name.
 *
 * The full tree is 178 packages; listing every transitive one by hand would
 * guarantee drift. The notices file documents what Archyne ships and depends
 * on directly, and `sbom.json` carries the complete tree for anyone who needs
 * it — that split is what the file itself states.
 */
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const direct = Object.keys(pkg.dependencies ?? {});

const missing = direct.filter((name) => !notices.includes(name));

/** Licences present in the tree that the notices file never mentions. */
const licences = new Set(
  sbom.components.map((c) => c.licenses?.[0]?.license?.id).filter(Boolean),
);
const unmentioned = [...licences].filter((id) => !notices.includes(id)).sort();

let failed = false;

if (missing.length > 0) {
  console.error(
    `THIRD-PARTY-NOTICES.md does not mention ${missing.length} direct dependency/ies:\n` +
      missing.map((n) => `  ${n}`).join("\n"),
  );
  failed = true;
}

if (unmentioned.length > 0) {
  console.error(
    `\nLicences present in the dependency tree but absent from the notices:\n` +
      unmentioned.map((l) => `  ${l}`).join("\n"),
  );
  failed = true;
}

const unlicensed = sbom.components.filter((c) => !c.licenses);
if (unlicensed.length > 0) {
  console.warn(
    `\nPackages declaring no licence (review before a release):\n` +
      unlicensed.map((c) => `  ${c.name}@${c.version}`).join("\n"),
  );
}

if (failed) {
  console.error("\nUpdate THIRD-PARTY-NOTICES.md, then re-run.");
  process.exit(1);
}
console.log(
  `Notices cover all ${direct.length} direct dependencies and ${licences.size} licence types.`,
);
