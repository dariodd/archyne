import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * No source file may carry an invisible control character.
 *
 * This is not hypothetical tidiness. Twice now a stray byte has changed what
 * the code means, silently and in a way no reviewer could see:
 *
 *   - a NUL inside a cache key in `textMetrics.ts`, which made every tool that
 *     reads the repository treat the file as **binary** — so `grep` skipped it
 *     without saying so;
 *   - a backspace (0x08) inside a regular expression in `render/renderSvg.ts`,
 *     where `<svg\b` had become `<svg` + an actual backspace. The pattern then
 *     required a backspace in the input, matched nothing, and architecture
 *     icons quietly stopped being drawn. Everything compiled; every type was
 *     correct; one test failed with `expected null not to be null`.
 *
 * Tabs and newlines are ordinary. Nothing else in the C0 range has any business
 * in a TypeScript file, and if a string genuinely needs one it should say so
 * with an escape, which is legible and greppable.
 */

// This lives under `tests/` rather than `src/` because it reads the file
// system, and `tsconfig.json` — which covers `src` — has no Node types. The
// `tests` project does. Vitest still collects it: the e2e scripts beside it
// are `e2e-*.mts` and match no test pattern.
const ROOT = resolve(import.meta.dirname, "..");
const DIRS = ["src", "tests", "scripts", "mcp"];
const EXTENSIONS = [".ts", ".tsx", ".mts", ".mjs", ".css", ".json"];
const SKIP = new Set(["node_modules", "dist", "out", "media"]);

/** Every source file under `dir`, recursively. */
async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name)) out.push(...(await walk(path)));
    } else if (EXTENSIONS.some((e) => entry.name.endsWith(e))) {
      out.push(path);
    }
  }
  return out;
}

/**
 * C0 controls, less tab, newline and carriage return.
 *
 * Written as escapes rather than as the characters themselves — otherwise
 * this very line would be the first thing the test caught, which is the point
 * it is making about legibility.
 */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;

describe("the sources", () => {
  it("carry no invisible control characters", async () => {
    const files = (await Promise.all(DIRS.map((d) => walk(join(ROOT, d))))).flat();
    expect(files.length).toBeGreaterThan(50);

    const offenders: string[] = [];
    for (const file of files) {
      const text = await readFile(file, "utf8");
      const m = CONTROL.exec(text);
      if (!m) continue;
      const line = text.slice(0, m.index).split("\n").length;
      const code = m[0].charCodeAt(0).toString(16).padStart(4, "0");
      offenders.push(`${relative(ROOT, file)}:${line} has U+${code.toUpperCase()}`);
    }
    expect(offenders).toEqual([]);
  });
});
