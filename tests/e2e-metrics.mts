/**
 * How wrong the browser-free measurement is, asked of the browser.
 *
 * `src/widthTable.generated.ts` holds one advance width per glyph, measured
 * once by `scripts/build-width-table.mjs` and committed. That is what
 * `textMetrics.ts` sums when there is no canvas to ask — in Node, where a build
 * step pre-renders a document to `.svg` files, and in jsdom, which implements
 * no canvas at all. A committed measurement can go stale, and nothing in the
 * app would notice: the editor re-measures every label a frame later and papers
 * over it.
 *
 * The generator's own `--check` cannot run everywhere, because it compares
 * against fonts that have to be installed. This can: every machine can be asked
 * what *it* would paint, and compared with what the table predicted.
 *
 * So there are two regimes, and the test says which one it is in:
 *
 *   - the named font is here, so the table describes the very font the browser
 *     is measuring, and the only error left is kerning — which a per-glyph sum
 *     cannot see. "AVATAR" and "To Wave" are the whole of it.
 *   - the named font is not here (a Linux runner has no Segoe UI), so the
 *     browser is measuring a fallback the table never saw. The bar is much
 *     looser and catches only a table that has become nonsense — which is still
 *     worth catching, and is the most that question can honestly ask.
 *
 * Run:  npx tsx tests/e2e-metrics.mts   (no server needed)
 */
import { chromium } from "playwright";
import { CHANNEL } from "./env.mts";
import { approximateTextMetrics, NODE_FONT } from "../src/textMetrics.js";

/** Labels of the kind diagrams actually carry, plus the known kerning traps. */
const WORDS = [
  "Start",
  "Finish",
  "Valid?",
  "Database",
  "Process the request",
  "Authentication service",
  "Illinois",
  "Womanhood",
  "API Gateway",
  "Order placed by a customer",
  "last_authenticated_at",
  "+authenticateWithProvider(provider) Session",
  "Retry now",
  "A user with a long name",
  "Web front end",
  "Does the thing this system exists to do",
  "AVATAR",
  "To Wave",
  "Città di Torino",
  "Größe",
];

let failed = false;

function check(label: string, ok: boolean, detail: string): void {
  if (ok) {
    console.log(`✓ ${label}`);
  } else {
    failed = true;
    console.error(`✗ ${label} — ${detail}`);
  }
}

const browser = await chromium.launch({ channel: CHANNEL, headless: true });
const page = await browser.newPage();

// One inline body with no named inner function: `tsx` compiles a named one
// with esbuild's `keepNames`, which injects a `__name` helper the page has not
// got. The same trap is noted in e2e-render.mts.
const seen = await page.evaluate(
  ([words, font]) => {
    const spec = font as { family: string; size: number };
    const ctx = document.createElement("canvas").getContext("2d")!;
    // Whether the stack's first named font is really here, or something else
    // is standing in for it. Two unlike generics: if naming the font in front
    // of each changes nothing, both times, it was not found.
    let present = false;
    for (const generic of ["monospace", "serif"]) {
      ctx.font = `400 100px ${generic}`;
      const bare = ctx.measureText("HAMBURGEFONSTIV").width;
      ctx.font = `400 100px "Segoe UI", ${generic}`;
      if (Math.abs(ctx.measureText("HAMBURGEFONSTIV").width - bare) > 0.5) present = true;
    }
    ctx.font = `400 ${spec.size}px ${spec.family}`;
    return { present, widths: (words as string[]).map((w) => ctx.measureText(w).width) };
  },
  [WORDS, NODE_FONT] as const,
);

await browser.close();

const approx = approximateTextMetrics();
const errors = WORDS.map(
  (w, i) => (approx.measure(w, NODE_FONT).width - seen.widths[i]) / seen.widths[i],
);
const sorted = errors.map(Math.abs).sort((a, b) => a - b);
const median = sorted[sorted.length >> 1];
const p90 = sorted[Math.floor(sorted.length * 0.9)];
const pc = (n: number) => `${(n * 100).toFixed(2)}%`;

console.log(
  `  ${seen.present ? "Segoe UI is installed here" : "Segoe UI is absent — measuring a fallback"}` +
    `: median ${pc(median)}, p90 ${pc(p90)} over ${WORDS.length} labels`,
);

if (seen.present) {
  // The table was measured from this very font, so a typical label has to come
  // out exact. Anything else means it no longer describes what is installed.
  check(
    "the table predicts the font it was measured from",
    median <= 0.005,
    `median ${pc(median)}`,
  );
  // Kerning, and only kerning. If this creeps up, a pair the sum cannot see has
  // become common enough to matter and the table needs kern data.
  check("with only kerning left over", p90 <= 0.05, `p90 ${pc(p90)}`);
} else {
  check(
    "the table is still a fair guess at an unmeasured face",
    median <= 0.15,
    `median ${pc(median)} — a fallback should not be this far off`,
  );
}

// Whatever the face, a table that stopped being consulted would show up as the
// class widths' signature: they give every digit 0.62 em, so "0000" and "1111"
// would measure the same. Segoe UI is tabular, but the check is that the table
// answered at all rather than what it said.
const digits = approx.measure("0000", NODE_FONT).width;
const narrow = approx.measure("iiii", NODE_FONT).width;
check(
  "and it is the table answering, not the width classes",
  Math.abs(narrow / NODE_FONT.size - 4 * 0.33) > 0.01,
  `"iiii" measured ${narrow.toFixed(2)}px, which is what the fallback class would say`,
);
console.log(`  ("0000" ${digits.toFixed(1)}px, "iiii" ${narrow.toFixed(1)}px)`);

console.log(
  failed
    ? "\nthe width table no longer describes what a browser paints"
    : "\nthe browser-free measurement holds up",
);
process.exit(failed ? 1 : 0);
