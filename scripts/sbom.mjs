/**
 * Generate a CycloneDX SBOM of the production dependency tree.
 *
 * Procurement asks for one, and it is also the input to the third-party
 * notices check below it. Only `dependencies` are walked — devDependencies
 * are build-time tooling and are not distributed in `dist/`.
 *
 * Run:  npm run sbom
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

/**
 * Read the tree from `package-lock.json` rather than shelling out to
 * `npm ls`. It is the same information, but deterministic, offline, and
 * free of a subprocess — and spawning `npm.cmd` on Windows now requires a
 * shell, which would mean concatenating arguments instead of escaping them.
 */
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
if (lock.lockfileVersion < 2) {
  console.error(`package-lock.json v${lock.lockfileVersion} is too old; needs v2 or newer.`);
  process.exit(1);
}

const packages = Object.entries(lock.packages ?? {})
  .filter(([path, meta]) => {
    // "" is the root project; dev-only packages are build tooling and are
    // not distributed in dist/.
    if (path === "" || meta.dev || meta.extraneous) return false;
    return path.includes("node_modules/");
  })
  .map(([path, meta]) => ({
    name: path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length),
    version: meta.version,
    license: typeof meta.license === "string" ? meta.license : null,
  }))
  .filter((p) => p.version)
  .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));

/** SPDX ids we are willing to recognise from a bare LICENSE file. */
const LICENSE_PATTERNS = [
  [/\bMIT\b/i, "MIT"],
  [/Apache License,?\s+Version 2\.0/i, "Apache-2.0"],
  [/\bISC\b/i, "ISC"],
  [/BSD 3-Clause/i, "BSD-3-Clause"],
  [/BSD 2-Clause/i, "BSD-2-Clause"],
  [/Mozilla Public License.*2\.0/i, "MPL-2.0"],
  [/Eclipse Public License.*2\.0/i, "EPL-2.0"],
  [/CC0 1\.0/i, "CC0-1.0"],
];

/**
 * Licence as declared by the installed package, never guessed from the name.
 *
 * Some packages ship a LICENSE file but omit the `license` field from
 * package.json (khroma, a mermaid dependency, is one). Reading the file is
 * still evidence; inferring from a package name would not be.
 */
function licenseOf(name) {
  const dir = join(root, "node_modules", ...name.split("/"));
  try {
    const meta = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    if (typeof meta.license === "string") return meta.license;
    if (meta.license?.type) return meta.license.type;
    if (Array.isArray(meta.licenses)) return meta.licenses.map((l) => l.type).join(" OR ");
  } catch {
    // Not installed (optional dep) — fall through to the licence file.
  }
  for (const file of ["LICENSE", "license", "LICENSE.md", "LICENCE", "LICENSE.txt"]) {
    try {
      const head = readFileSync(join(dir, file), "utf8").slice(0, 600);
      const hit = LICENSE_PATTERNS.find(([re]) => re.test(head));
      if (hit) return hit[1];
    } catch {
      // Try the next candidate filename.
    }
  }
  return null;
}

const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  version: 1,
  metadata: {
    // No timestamp: it would make the file churn on every run and defeat the
    // drift check, which wants a stable diff.
    tools: [{ name: "archyne/scripts/sbom.mjs" }],
    component: {
      type: "application",
      name: pkg.name,
      version: pkg.version,
      licenses: [{ license: { id: pkg.license } }],
    },
  },
  components: packages.map(({ name, version, license: declared }) => {
    const license = declared ?? licenseOf(name);
    return {
      type: "library",
      name,
      version,
      purl: `pkg:npm/${name.replace("@", "%40")}@${version}`,
      ...(license ? { licenses: [{ license: { id: license } }] } : {}),
    };
  }),
};

writeFileSync(join(root, "sbom.json"), JSON.stringify(sbom, null, 2) + "\n");
console.log(`Wrote sbom.json — ${sbom.components.length} production packages.`);

const unlicensed = sbom.components.filter((c) => !c.licenses);
if (unlicensed.length > 0) {
  console.warn(
    `\n${unlicensed.length} package(s) declare no licence:\n` +
      unlicensed.map((c) => `  ${c.name}@${c.version}`).join("\n"),
  );
}
