/**
 * Keep the extension's version following the app's.
 *
 * There is one number, in the repository root's `package.json`, and this
 * derives the extension's from it. Run with `--check` it changes nothing and
 * exits non-zero when the two have drifted, which is what CI uses: a version
 * that has to be remembered is a version that goes stale, and this one had
 * already started to.
 *
 * ## Why it is not simply copied
 *
 * Archyne releases on a prerelease line — `0.3.0-alpha.1` — and the VS
 * Marketplace does not take those: `vsce publish` refuses any version with a
 * prerelease component outright (`@vscode/vsce`, `out/publish.js`), while
 * `vsce package` is happy to build one, so the rejection only arrives at the
 * last step. The suffix is therefore dropped and the package published with
 * `--pre-release`, which is how VS Code expresses the same thing: the
 * Marketplace's own flag rather than a string it will not accept.
 *
 * ## The one case this cannot decide
 *
 * Dropping the suffix maps every alpha of a version onto the same number, so
 * a second one — `0.3.0-alpha.2` after `0.3.0-alpha.1` — would want to publish
 * `0.3.0` twice, and the Marketplace refuses a version it already has. Every
 * Archyne release so far has been `alpha.1`, so this has never come up; if it
 * does, this says so plainly here rather than letting it surface as a rejected
 * publish at the end of a release.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const rootManifest = resolve(here, "..", "..", "..", "package.json");
const ownManifest = resolve(here, "..", "package.json");

const check = process.argv.includes("--check");

/** `1.2.3-alpha.4` → `{ base: "1.2.3", counter: 4 }`; `1.2.3` → counter 0. */
function split(version) {
  const m = /^(\d+\.\d+\.\d+)(?:-[0-9A-Za-z.-]*?(\d+))?$/.exec(version);
  if (!m) throw new Error(`Cannot read a version out of "${version}"`);
  return { base: m[1], counter: m[2] === undefined ? 0 : Number(m[2]) };
}

const root = JSON.parse(readFileSync(rootManifest, "utf8"));
const own = JSON.parse(readFileSync(ownManifest, "utf8"));
const { base, counter } = split(root.version);

if (counter > 1) {
  console.warn(
    `Warning: the app is at ${root.version}, which maps to ${base} — the same ` +
      `number its earlier alphas map to. Packaging works; publishing will be ` +
      `refused as a duplicate. Decide what the extension's ${base} should be ` +
      `before releasing it.`,
  );
}

if (own.version === base) {
  console.log(`Extension version is ${base}, following the app at ${root.version}.`);
  process.exit(0);
}

if (check) {
  console.error(
    `Extension version is ${own.version} but the app is ${root.version}, which ` +
      `means ${base}.\nRun \`npm run version:sync\` in extensions/vscode and ` +
      `commit the result.`,
  );
  process.exit(1);
}

// Rewritten by hand rather than through a JSON round-trip: the manifest is
// prettier-formatted and checked in CI, and re-serializing it would reformat
// the whole file to make one string change.
const source = readFileSync(ownManifest, "utf8");
const updated = source.replace(
  /^(\s*"version":\s*")[^"]*(",)$/m,
  (_, before, after) => `${before}${base}${after}`,
);
if (updated === source) throw new Error(`No "version" field found in ${ownManifest}`);
writeFileSync(ownManifest, updated);

console.log(
  `Extension version ${own.version} → ${base}, following the app at ${root.version}.`,
);
