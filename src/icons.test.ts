import { describe, expect, it } from "vitest";
import { BUILTIN_ICON_NAMES, getIconHtml, iconsByPrefix, searchIcons } from "./icons";

describe("icon search", () => {
  it("returns nothing for an empty query", async () => {
    expect(await searchIcons("")).toEqual([]);
    expect(await searchIcons("   ")).toEqual([]);
  });

  it("finds vendor icons and fully qualifies them", async () => {
    const results = await searchIcons("aws");
    expect(results.length).toBeGreaterThan(0);
    expect(results).toContain("logos:aws");
    for (const name of results) expect(name).toMatch(/^[a-z-]+:/);
  });

  it("ranks prefix matches ahead of substring matches", async () => {
    const results = await searchIcons("kafka");
    const firstLocal = results[0].slice(results[0].indexOf(":") + 1);
    expect(firstLocal.startsWith("kafka")).toBe(true);
  });

  it("respects the result limit", async () => {
    expect((await searchIcons("a", 10)).length).toBeLessThanOrEqual(10);
  });

  it("is case-insensitive", async () => {
    expect(await searchIcons("REDIS")).toEqual(await searchIcons("redis"));
  });

  it("filters a single collection by prefix", async () => {
    const results = await iconsByPrefix("logos", ["kubernetes"], 20);
    expect(results.length).toBeGreaterThan(0);
    for (const name of results) expect(name.startsWith("logos:")).toBe(true);
  });

  it("returns nothing for an unknown collection", async () => {
    expect(await iconsByPrefix("not-a-collection", ["aws"])).toEqual([]);
  });
});

describe("icon rendering", () => {
  it("renders the built-in architecture icons without any collection", async () => {
    for (const name of BUILTIN_ICON_NAMES) {
      expect(await getIconHtml(name)).toContain("<svg");
    }
  });

  it("renders an icon from a bundled collection", async () => {
    expect(await getIconHtml("logos:aws")).toContain("<svg");
  });

  it("falls back to a built-in rather than throwing on a bad name", async () => {
    expect(await getIconHtml("logos:definitely-not-an-icon")).toContain("<svg");
    expect(await getIconHtml("no-such-collection:thing")).toContain("<svg");
  });
});
