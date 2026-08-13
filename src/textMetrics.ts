/**
 * How wide a string is drawn.
 *
 * Every size in this application is currently either measured from the DOM
 * after the fact (`contentSize.ts`) or a constant (`estimateSize` in
 * `model/types.ts`, which returns 150×46 for a state and a flat 210 for a class
 * whatever is written in it). Both are fine for an editor, where the browser
 * lays the node out a frame later and the constant only has to be a plausible
 * starting point.
 *
 * Neither is enough for a renderer. Outside the editor there is no second frame
 * and nothing to measure afterwards: the geometry written into the SVG is the
 * geometry, so the size has to be right *before* anything is drawn. That is the
 * one thing standing between this codebase and a `render(code) -> svg` that
 * other tools can import.
 *
 * So measurement becomes a dependency rather than an assumption, and this is
 * its seam. Two backends will exist:
 *
 *   - **canvas**, the one here, which asks the browser and is exact;
 *   - **fontkit or opentype**, later, which reads an embedded font file and is
 *     what a Node process without a browser would use.
 *
 * Callers never learn which one answered. That is the whole point of the shape:
 * the decision to stay browser-only for now (2026-08-12) costs nothing later,
 * because the drawing layer above never encodes the assumption.
 */
import { LABEL_SIZE } from "./model/types";

/** A font, in the terms both CSS and canvas understand. */
export interface FontSpec {
  /** The stack, written as CSS writes it. */
  family: string;
  /** Type size in px. */
  size: number;
  /** CSS weight; 400 when unsaid. */
  weight?: number | string;
}

/** One line of text, as it would be drawn. */
export interface TextSize {
  width: number;
  /** The line box, not the ink — this is what stacks into a paragraph. */
  height: number;
  /**
   * How far the baseline sits below the top of that line box.
   *
   * Only the DOM needs a line box; SVG positions text by its **baseline**, so
   * emitting `<text>` means knowing where inside the line the baseline falls.
   * Guessing it is how text ends up sitting a few pixels high in a box, and
   * `dominant-baseline` — the attribute that would avoid the arithmetic — is
   * unevenly implemented outside browsers, which is exactly the audience a
   * rendered SVG is for.
   */
  ascent: number;
}

export interface TextMetrics {
  measure(text: string, font: FontSpec): TextSize;
  /**
   * Which backend answered. Exact sizes can be checked against the DOM;
   * approximate ones cannot, and a test that compares them would be measuring
   * the fallback's error rather than anything real.
   */
  readonly exact: boolean;
}

/**
 * The font nodes are labelled in: `.shape-label` in the stylesheet, whose
 * `font-size` is `LABEL_SIZE` and whose family is inherited from `body`.
 *
 * Restated here rather than read from the document, because a renderer has no
 * document to read it from. The stylesheet is the other half of this pair and
 * says so at both sites.
 */
export const NODE_FONT: FontSpec = {
  family: '"Segoe UI", system-ui, sans-serif',
  size: LABEL_SIZE,
};

/**
 * `line-height` is `normal` on `.shape-label`, which is not a number — it is
 * whatever the font's own metrics say, typically around 1.33 for the faces in
 * that stack. The canvas backend reads the real figure; this is what the
 * approximation assumes and what either falls back to.
 */
const NORMAL_LINE_HEIGHT = 1.33;

/**
 * How that 1.33 divides above and below the baseline.
 *
 * Roughly the split the faces in this stack report; used only where the backend
 * cannot say, since the canvas one reads the font's own figures.
 */
const NORMAL_ASCENT = 1.04;

/** The `ctx.font` string, which doubles as a cache key. */
function fontKey(font: FontSpec): string {
  return `${font.weight ?? 400} ${font.size}px ${font.family}`;
}

/* ---------- the approximation ---------- */

/**
 * Character widths as a fraction of the type size.
 *
 * A flat average — which is what `framelessSize` uses today, at 0.58 — reads
 * "Illinois" and "Womanhood" as the same width, and they differ by nearly half.
 * Four classes is not precision, but it is the difference between a fallback
 * that is roughly right and one that is wrong in a way you can see.
 *
 * These are eyeballed against Segoe UI and are not claimed to be more than
 * that. The fallback exists so that a node which has never been on screen has a
 * sane size, and so that the test environment is deterministic — jsdom
 * implements neither `getBBox` nor a canvas context. Anything that needs to be
 * *correct* must run where `exact` is true.
 */
const NARROW = new Set(" iljtfrI.,'!|()[]{};:`");
const WIDE = new Set("mwMW@");
const CAPITAL = /[A-Z0-9]/;

function approximateWidth(text: string, size: number): number {
  let ratio = 0;
  for (const ch of text) {
    if (NARROW.has(ch)) ratio += 0.33;
    else if (WIDE.has(ch)) ratio += 0.92;
    else if (CAPITAL.test(ch)) ratio += 0.62;
    else ratio += 0.52;
  }
  return ratio * size;
}

const approximateMetrics: TextMetrics = {
  exact: false,
  measure(text, font) {
    return {
      width: approximateWidth(text, font.size),
      height: font.size * NORMAL_LINE_HEIGHT,
      ascent: font.size * NORMAL_ASCENT,
    };
  },
};

/* ---------- the canvas backend ---------- */

/**
 * Why canvas rather than a hidden `<svg>` and `getBBox()`.
 *
 * `getBBox` returns the *ink* box — the union of the glyph outlines — so a
 * string ending in a space measures as though the space were not there, and a
 * string of only descenders reports a height that no line box ever has. It also
 * requires the element to be in the document, which means a mutation and a
 * forced reflow for every label on every layout.
 *
 * `measureText` returns advance width, which is precisely the number the DOM
 * itself sums when it lays a line out, and it needs nothing attached to
 * anything. For predicting what the browser will do, it is not merely cheaper —
 * it is the more correct question.
 */
function createCanvasMetrics(): TextMetrics | null {
  if (typeof document === "undefined") return null;
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = document.createElement("canvas").getContext("2d");
  } catch {
    // jsdom without the optional `canvas` package throws rather than
    // returning null.
    return null;
  }
  if (!ctx) return null;
  const context = ctx;

  const metrics: TextMetrics = {
    exact: true,
    measure(text, font) {
      context.font = fontKey(font);
      const m = context.measureText(text);
      // `fontBoundingBox*` describes the line box the font asks for; the
      // `actualBoundingBox*` pair describes this particular string's ink, which
      // is not what stacks. Older engines expose neither.
      const ascent = m.fontBoundingBoxAscent;
      const descent = m.fontBoundingBoxDescent;
      const known =
        typeof ascent === "number" && typeof descent === "number" && ascent + descent > 0;
      return {
        width: m.width,
        height: known ? ascent + descent : font.size * NORMAL_LINE_HEIGHT,
        ascent: known ? ascent : font.size * NORMAL_ASCENT,
      };
    },
  };

  // Prove it answers before handing it out. A context can exist and still
  // measure everything as zero — a stubbed canvas in a test environment does
  // exactly that — and a silent zero is worse than the approximation, because
  // it produces nodes with no size at all rather than nodes of the wrong size.
  // The same reasoning as the ELK worker probe in `layout/autoLayout.ts`:
  // demonstrate the round trip, do not trust the constructor.
  const probe = metrics.measure("MMMM", NODE_FONT);
  return probe.width > 0 && probe.height > 0 ? metrics : null;
}

/* ---------- caching ---------- */

/**
 * Measuring is cheap; measuring the same eight labels on every layout pass of
 * every keystroke is not. The cache is bounded and cleared wholesale when it
 * fills, rather than evicted one entry at a time: an LRU would be more code and
 * more state to be wrong about, and the access pattern here — a document's
 * labels, over and over — refills a cleared cache almost immediately.
 */
const CACHE_LIMIT = 4096;

export function cached(inner: TextMetrics): TextMetrics {
  const store = new Map<string, TextSize>();
  return {
    exact: inner.exact,
    measure(text, font) {
      // Separated by a character that can occur in neither half, so that a
      // family ending in a digit cannot collide with a label beginning with
      // one. Written as an escape rather than typed: a raw NUL in the source
      // makes the file read as binary, and every grep then skips it silently.
      const key = `${fontKey(font)}\u0000${text}`;
      const hit = store.get(key);
      if (hit) return hit;
      const size = inner.measure(text, font);
      if (store.size >= CACHE_LIMIT) store.clear();
      store.set(key, size);
      return size;
    },
  };
}

/* ---------- selection ---------- */

let shared: TextMetrics | null = null;

/**
 * The metrics this environment can offer: exact where there is a browser,
 * approximate where there is not.
 *
 * Cached process-wide because the choice cannot change under a running page,
 * and because the memo behind it is worth keeping.
 */
export function textMetrics(): TextMetrics {
  if (!shared) shared = cached(createCanvasMetrics() ?? approximateMetrics);
  return shared;
}

/** Test seam: drop the shared instance so a case can install its own. */
export function resetTextMetrics(replacement?: TextMetrics): void {
  shared = replacement ? cached(replacement) : null;
}

/** The approximation, for callers that must be deterministic across machines. */
export function approximateTextMetrics(): TextMetrics {
  return approximateMetrics;
}

/* ---------- wrapping ---------- */

/**
 * Break `text` into the lines it would occupy at `maxWidth`.
 *
 * Built on `measure` rather than inside a backend, because every backend would
 * write the same loop. Breaks on whitespace only: the stylesheet also sets
 * `overflow-wrap: break-word`, so the browser will split a single long word
 * that cannot fit, and this will not — it leaves that word on a line of its own,
 * over-wide. The divergence is deliberate for now; a node whose label is one
 * unbroken 40-character token is rare, and guessing the break point wrongly
 * looks worse than a wide box.
 */
export function wrapText(
  text: string,
  font: FontSpec,
  maxWidth: number,
  metrics: TextMetrics = textMetrics(),
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let line = words[0];
  for (const word of words.slice(1)) {
    const candidate = `${line} ${word}`;
    if (metrics.measure(candidate, font).width <= maxWidth) line = candidate;
    else {
      lines.push(line);
      line = word;
    }
  }
  lines.push(line);
  return lines;
}

/**
 * The box a paragraph of `text` occupies at `maxWidth`: as wide as its widest
 * line — which may be narrower than the limit, and that difference is what
 * keeps a two-word node from being drawn as wide as its longest possible
 * sibling — and as tall as the lines stacked.
 */
export function measureBlock(
  text: string,
  font: FontSpec,
  maxWidth: number,
  metrics: TextMetrics = textMetrics(),
): TextSize {
  const lines = wrapText(text, font, maxWidth, metrics);
  if (lines.length === 0) return { width: 0, height: 0, ascent: 0 };
  let width = 0;
  let height = 0;
  // The block's ascent is the *first* line's: it is where the topmost baseline
  // sits, which is what a caller placing the block needs.
  let ascent = 0;
  for (const [i, line] of lines.entries()) {
    const size = metrics.measure(line, font);
    width = Math.max(width, size.width);
    height += size.height;
    if (i === 0) ascent = size.ascent;
  }
  return { width, height, ascent };
}
