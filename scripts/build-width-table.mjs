/**
 * Measure the fonts a diagram is lettered in, once, into a table.
 *
 * `src/textMetrics.ts` has two backends. The canvas one asks the browser and is
 * exact; the approximation is what answers everywhere else — in Node, which is
 * where a build step pre-renders a document to `.svg` files, and in jsdom,
 * which implements no canvas at all. Until now that approximation sorted every
 * character into one of four width classes, which put the median label within
 * 4.2% of the truth and the ninetieth percentile within 14.2%.
 *
 * Measured per glyph instead, the same strings land on **0.00% median**: a
 * string's advance width simply is the sum of its glyphs' advances. What is
 * left is kerning, which a per-glyph sum cannot see — "AVATAR" and "To Wave"
 * are the outliers, and they account for the p90 of about 4%.
 *
 * So this measures each glyph once, in a real browser, and commits the answer.
 * The alternative was embedding a font file, which would be a hundred times the
 * weight to answer a question about a font the reader will not be shown: the
 * emitted SVG asks for `"Segoe UI", system-ui, sans-serif`, and what that
 * resolves to is the reader's business, not ours.
 *
 *   node scripts/build-width-table.mjs           # write
 *   node scripts/build-width-table.mjs --check   # fail if it would change
 *
 * **`--check` can only check where the fonts are.** Unlike the box model,
 * which is extracted from a stylesheet and reproduces anywhere, this is a
 * measurement of fonts installed on the machine that ran it. A Linux CI runner
 * has neither Segoe UI nor Cascadia Code, so there the check reports that it
 * cannot verify and passes rather than failing for a reason that is not a
 * defect. `tests/e2e-metrics.mts` is the guard that does run everywhere: it
 * compares the table's prediction against the browser's own measurement, which
 * is a question every machine can answer about itself.
 *
 * Refusing is the point when a font is missing. Measuring a fallback silently
 * would produce a table that looks authoritative and describes a font nobody
 * named — the same failure `build-box-model.mjs` avoids by erroring on any
 * declaration it cannot find.
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, "..", "src", "widthTable.generated.ts");

/**
 * The characters worth a measured width.
 *
 * Printable ASCII, the Latin-1 letters an Italian or German label uses, and the
 * punctuation that turns up in prose — dashes, curly quotes, an ellipsis.
 * Everything outside this set falls back to the width classes, which is the
 * right answer for CJK and emoji: those are not one advance wide and no table
 * of a Latin font would know what they are.
 */
const CHARS =
  [...Array(95)].map((_, i) => String.fromCharCode(32 + i)).join("") +
  "àáâãäåèéêëìíîïòóôõöùúûüçñýÿßÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÇÑ" +
  "–—‘’“”…«»·€£°";

/**
 * Every face the box model letters something in, by the name the table is keyed
 * under, with the concrete font whose presence makes the measurement real.
 *
 * Kept in step with `src/render/boxModel.generated.ts` by
 * `tests/sourceHygiene.test.ts`'s sibling check in `textMetrics.test.ts`, which
 * fails if the stylesheet grows a face this does not cover.
 */
const FACES = [
  {
    key: "sans/400",
    stack: '"Segoe UI", system-ui, sans-serif',
    needs: "Segoe UI",
    weight: 400,
  },
  {
    key: "sans/600",
    stack: '"Segoe UI", system-ui, sans-serif',
    needs: "Segoe UI",
    weight: 600,
  },
  {
    key: "mono/400",
    stack: '"Cascadia Code", Consolas, monospace',
    needs: "Cascadia Code",
    weight: 400,
  },
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const measured = await page.evaluate(
  ([faces, chars]) => {
    const ctx = document.createElement("canvas").getContext("2d");
    const out = {};
    for (const face of faces) {
      // Whether the named font is really there, rather than a fallback wearing
      // its name. Two generic families that look nothing alike: if asking for
      // the font in front of each gives the same answer as the generic alone,
      // both times, nothing by that name was found.
      let present = false;
      for (const generic of ["monospace", "serif"]) {
        ctx.font = `${face.weight} 100px ${generic}`;
        const bare = ctx.measureText("HAMBURGEFONSTIV").width;
        ctx.font = `${face.weight} 100px "${face.needs}", ${generic}`;
        if (Math.abs(ctx.measureText("HAMBURGEFONSTIV").width - bare) > 0.5) present = true;
      }
      if (!present) {
        out[face.key] = null;
        continue;
      }
      ctx.font = `${face.weight} 100px ${face.stack}`;
      const widths = {};
      // Measured at 100px, kept to four decimals of the ratio: the rounding
      // error is then under a hundredth of a pixel per glyph at label size.
      for (const c of chars) widths[c] = Math.round(ctx.measureText(c).width * 100) / 10000;
      out[face.key] = widths;
    }
    return out;
  },
  [FACES, CHARS],
);

await browser.close();

const missing = FACES.filter((f) => measured[f.key] === null);

const banner = `/**
 * Generated by scripts/build-width-table.mjs — do not edit.
 *
 * One advance width per glyph, as a fraction of the type size, for each face
 * the diagram is lettered in. \`src/textMetrics.ts\` sums these when there is no
 * canvas to ask, which is the case in Node and in jsdom.
 *
 * Measured in a real browser on a machine that has the fonts. A face is here
 * because \`src/render/boxModel.generated.ts\` letters something in it; a
 * character is here because a Latin label might contain it. Anything else falls
 * back to the width classes in textMetrics.ts, which is the honest answer for a
 * script this table knows nothing about.
 */
`;

const text = `${banner}export const WIDTH_TABLES: Record<string, Record<string, number>> = ${JSON.stringify(
  measured,
  null,
  2,
)};\n`;

if (process.argv.includes("--check")) {
  if (missing.length) {
    console.log(
      `cannot verify the width table here: ${missing.map((f) => f.needs).join(", ")} ` +
        `not installed. tests/e2e-metrics.mts checks this machine's own fonts instead.`,
    );
    process.exit(0);
  }
  let current = "";
  try {
    current = await readFile(OUT, "utf8");
  } catch {
    console.error(`${OUT} is missing. Run: node scripts/build-width-table.mjs`);
    process.exit(1);
  }
  if (current !== text) {
    console.error(
      "src/widthTable.generated.ts does not match the fonts on this machine.\n" +
        "Run: node scripts/build-width-table.mjs",
    );
    process.exit(1);
  }
  console.log("width table matches the fonts on this machine");
} else {
  if (missing.length) {
    console.error(
      `refusing to write: ${missing.map((f) => f.needs).join(", ")} not installed here.\n` +
        `Measuring a fallback would produce a table that names a font it did not measure.`,
    );
    process.exit(1);
  }
  await writeFile(OUT, text, "utf8");
  console.log(`wrote ${OUT} (${FACES.length} faces, ${CHARS.length} characters each)`);
}
