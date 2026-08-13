import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NODE_FONT,
  approximateTextMetrics,
  cached,
  measureBlock,
  resetTextMetrics,
  textMetrics,
  wrapText,
  type FontSpec,
  type TextMetrics,
} from "./textMetrics";

/**
 * A backend with no opinion about typography: every character is 10 wide and
 * every line 20 tall. Cases about wrapping and stacking should be about
 * wrapping and stacking, not about how wide a `w` is.
 */
const fixed: TextMetrics = {
  exact: true,
  measure: (text) => ({ width: text.length * 10, height: 20, ascent: 15 }),
};

const font: FontSpec = { family: "test", size: 12 };

afterEach(() => resetTextMetrics());

describe("the approximation", () => {
  const approx = approximateTextMetrics();

  it("has nothing to measure in an empty string", () => {
    expect(approx.measure("", NODE_FONT)).toEqual({
      width: 0,
      height: 12 * 1.33,
      ascent: 12 * 1.04,
    });
  });

  it("tells narrow characters from wide ones", () => {
    // The flat average this replaces read these as the same width, and they
    // are not close: eight of each, and the difference is nearly threefold.
    const narrow = approx.measure("iiiiiiii", NODE_FONT).width;
    const wide = approx.measure("mmmmmmmm", NODE_FONT).width;
    expect(wide).toBeGreaterThan(narrow * 2);
  });

  it("scales with the type size", () => {
    const small = approx.measure("Gateway", { ...NODE_FONT, size: 12 }).width;
    const large = approx.measure("Gateway", { ...NODE_FONT, size: 24 }).width;
    expect(large).toBeCloseTo(small * 2, 5);
  });

  it("says so", () => {
    expect(approx.exact).toBe(false);
  });
});

describe("whatever this environment offers", () => {
  it("answers with a positive size either way", () => {
    const m = textMetrics();
    const size = m.measure("Load balancer", NODE_FONT);
    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBeGreaterThan(0);
  });

  it("is longer for a longer string", () => {
    const m = textMetrics();
    const short = m.measure("db", NODE_FONT).width;
    const long = m.measure("database replica", NODE_FONT).width;
    expect(long).toBeGreaterThan(short);
  });

  it("can be replaced, so a case can pin the numbers", () => {
    resetTextMetrics(fixed);
    expect(textMetrics().measure("abcd", font)).toEqual({ width: 40, height: 20, ascent: 15 });
  });
});

describe("caching", () => {
  it("asks the backend once per distinct string", () => {
    const measure = vi.fn(fixed.measure);
    const m = cached({ exact: true, measure });

    m.measure("api", font);
    m.measure("api", font);
    m.measure("api", font);

    expect(measure).toHaveBeenCalledTimes(1);
  });

  it("keeps the same string apart at different sizes", () => {
    const measure = vi.fn(fixed.measure);
    const m = cached({ exact: true, measure });

    m.measure("api", { ...font, size: 12 });
    m.measure("api", { ...font, size: 24 });

    expect(measure).toHaveBeenCalledTimes(2);
  });

  it("carries the backend's honesty through", () => {
    expect(cached(approximateTextMetrics()).exact).toBe(false);
  });
});

describe("the baseline", () => {
  it("sits inside the line, not at its top or its foot", () => {
    // SVG places text by its baseline, so this number is what stops a label
    // from being drawn a few pixels high in its box. It has to be somewhere
    // within the line box to mean anything.
    const size = approximateTextMetrics().measure("Gateway", NODE_FONT);
    expect(size.ascent).toBeGreaterThan(0);
    expect(size.ascent).toBeLessThan(size.height);
  });

  it("scales with the type size", () => {
    const approx = approximateTextMetrics();
    const small = approx.measure("x", { ...NODE_FONT, size: 12 }).ascent;
    const large = approx.measure("x", { ...NODE_FONT, size: 24 }).ascent;
    expect(large).toBeCloseTo(small * 2, 5);
  });

  it("is the first line's, for a block of several", () => {
    // Where the topmost baseline goes is what a caller placing the block
    // needs; the lines below it are found by stepping down.
    const block = measureBlock("one two three", font, 50, fixed);
    expect(block.ascent).toBe(15);
  });
});

describe("wrapping", () => {
  it("leaves a line that fits alone", () => {
    expect(wrapText("api gateway", font, 200, fixed)).toEqual(["api gateway"]);
  });

  it("breaks where the width runs out", () => {
    // "api gateway" is 110 at this backend's rate; "api" alone is 30.
    expect(wrapText("api gateway", font, 100, fixed)).toEqual(["api", "gateway"]);
  });

  it("gives a word too long to fit a line of its own rather than cutting it", () => {
    expect(wrapText("supercalifragilistic", font, 50, fixed)).toEqual(["supercalifragilistic"]);
  });

  it("treats runs of whitespace as one break", () => {
    expect(wrapText("  api   gateway  ", font, 200, fixed)).toEqual(["api gateway"]);
  });

  it("has no lines for an empty label", () => {
    expect(wrapText("   ", font, 200, fixed)).toEqual([]);
  });
});

describe("measuring a block", () => {
  it("is as wide as its widest line, not as wide as it was allowed", () => {
    // Two lines of 30 and 70, in a box that would have permitted 100.
    const size = measureBlock("api gateway", font, 100, fixed);
    expect(size.width).toBe(70);
    expect(size.height).toBe(40);
  });

  it("stacks every line into the height", () => {
    const size = measureBlock("one two three", font, 50, fixed);
    expect(size.height).toBe(60);
  });

  it("is nothing at all when there is nothing to draw", () => {
    expect(measureBlock("", font, 100, fixed)).toEqual({ width: 0, height: 0, ascent: 0 });
  });
});
