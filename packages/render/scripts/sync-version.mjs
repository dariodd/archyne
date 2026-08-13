/**
 * Keep `archyne-render`'s version equal to the application's.
 *
 * Decided deliberately: one number across the repository is the thing a
 * maintainer can hold in their head, and this project already runs that way.
 * Unlike the VS Code extension — which strips the prerelease suffix because the
 * Marketplace refuses one — npm takes `0.3.2-alpha.1` as written, so the two
 * versions are *identical* rather than merely derived.
 *
 * The cost, accepted knowingly: a library's version is normally a promise about
 * its API, and in lockstep an app-only release bumps this package with no API
 * change. That is a smaller problem than two cadences.
 *
 *   node scripts/sync-version.mjs           # write
 *   node scripts/sync-version.mjs --check   # fail if they differ
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgFile = resolve(here, "..", "package.json");
const appFile = resolve(here, "..", "..", "..", "package.json");

const app = JSON.parse(await readFile(appFile, "utf8"));
const raw = await readFile(pkgFile, "utf8");
const pkg = JSON.parse(raw);

if (process.argv.includes("--check")) {
  if (pkg.version !== app.version) {
    console.error(
      `archyne-render is ${pkg.version}; the app is ${app.version}.\n` +
        "Run: node packages/render/scripts/sync-version.mjs",
    );
    process.exit(1);
  }
  console.log(`archyne-render ${pkg.version} matches the app`);
} else if (pkg.version === app.version) {
  console.log(`already ${pkg.version}`);
} else {
  // Rewritten by hand rather than through JSON.stringify so the file keeps its
  // formatting and the diff is one line.
  const updated = raw.replace(
    /("version":\s*")[^"]*(")/,
    (_m, a, b) => `${a}${app.version}${b}`,
  );
  await writeFile(pkgFile, updated, "utf8");
  console.log(`archyne-render ${pkg.version} -> ${app.version}`);
  console.warn(
    "Now run `npm install --package-lock-only` here, or the manifest and the " +
      "lockfile drift — which is the mistake the extension keeps making.",
  );
}
