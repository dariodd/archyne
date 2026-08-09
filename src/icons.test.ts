import { describe, expect, it } from "vitest";
import {
  BUILTIN_ICON_NAMES,
  carriedIconPack,
  getIconHtml,
  normaliseIconRefs,
  iconsByPrefix,
  searchIcons,
  setCarriedIcons,
} from "./icons";

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

describe("searching for what a diagram calls things", () => {
  it("finds network icons for a word the icon sets do not use", async () => {
    // "vnet" is the everyday word for an Azure virtual network and appears in
    // none of the bundled collections; the icons for one are there under
    // other names.
    const results = await searchIcons("vnet");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((n) => n.includes("network") || n.includes("vpc"))).toBe(true);
  });

  it("keeps an exact match ahead of the alternatives", async () => {
    const results = await searchIcons("vpc");
    expect(results[0]).toContain("vpc");
  });

  it("does not match a short acronym in the middle of a word", async () => {
    // "nsg" is inside "transgender", which is how it used to be the first
    // result for a network security group.
    const results = await searchIcons("nsg");
    expect(results.some((n) => n.includes("transgender"))).toBe(false);
  });

  it("still matches a long word anywhere in a name", async () => {
    const results = await searchIcons("network");
    expect(results.some((n) => n.includes("-network") || n.includes("networking"))).toBe(true);
  });

  it("finds a name written with a space, which is how anybody types it", async () => {
    // Icon names are hyphenated; a query is not. Searching two words looked
    // for the string with the space still in it and matched nothing at all.
    const spaced = await searchIcons("google cloud");
    expect(spaced.length).toBeGreaterThan(0);
    expect(spaced.some((n) => n.includes("google-cloud"))).toBe(true);
  });

  it("wants every word, in whatever order they were typed", async () => {
    const forwards = await searchIcons("google cloud");
    const backwards = await searchIcons("cloud google");
    expect(backwards).toEqual(forwards);
    // And a name with only one of the two words is not an answer.
    expect(forwards.every((n) => n.includes("google") && n.includes("cloud"))).toBe(true);
  });
});

/**
 * Iconify rewrites every gradient id on each render, so two drawings of one
 * icon are never the same string — which is the point, since two copies on a
 * canvas must not share ids. Compare what is left when they are taken out.
 */
function withoutIds(svg: string): string {
  return svg.replace(/id="[^"]*"/g, 'id=""').replace(/url\(#[^)]*\)/g, "url(#)");
}

describe("the bundled Azure set", () => {
  it("has the icons no Iconify collection carries", async () => {
    // The reason it is bundled at all: none of Iconify's 231 collections has
    // a virtual network, a subnet or a Key Vault in it.
    for (const name of ["virtual-networks", "subnet", "key-vaults", "azure-cosmos-db"]) {
      expect(await getIconHtml(`azure:${name}`), name).toContain("<svg");
    }
  });

  it("is offered by search under the name people read", async () => {
    const results = await searchIcons("virtual networks");
    expect(results).toContain("azure:virtual-networks");
  });

  it("answers to Microsoft's catalogue code, which is what Mermaid Chart writes", async () => {
    // A diagram authored elsewhere says `azure:10245-icon-service-key-vaults`.
    const byCode = await getIconHtml("azure:10245-icon-service-key-vaults");
    expect(byCode).toContain("<svg");
    expect(withoutIds(byCode)).toEqual(withoutIds(await getIconHtml("azure:key-vaults")));
  });

  it("answers to a code from another release of the pack", async () => {
    // Microsoft renumbers between releases, so the number cannot be relied
    // on; what is stable is the name after it.
    expect(withoutIds(await getIconHtml("azure:99999-icon-service-key-vaults"))).toEqual(
      withoutIds(await getIconHtml("azure:key-vaults")),
    );
  });

  it("falls back to a built-in for a name it does not have", async () => {
    expect(await getIconHtml("azure:not-a-real-azure-service")).toContain("<svg");
  });
});

describe("searching icons the diagram brought with it", () => {
  it("finds an imported icon by any of its words", async () => {
    setCarriedIcons({
      "virtual-networks": "<svg/>",
      "kubernetes-services": "<svg/>",
      monitor: "<svg/>",
    });
    try {
      expect(await searchIcons("virtual networks")).toContain("custom:virtual-networks");
      expect(await searchIcons("networks virtual")).toContain("custom:virtual-networks");
      expect(await searchIcons("kubernetes")).toContain("custom:kubernetes-services");
      // And is not offered for a word it does not have.
      expect(await searchIcons("virtual networks")).not.toContain("custom:monitor");
    } finally {
      setCarriedIcons({});
    }
  });
});

describe("handing a diagram's icons to mermaid", () => {
  it("packs the carried icons, box and all", () => {
    setCarriedIcons({ vnet: '<svg viewBox="0 0 18 18"><path d="M0 0"/></svg>' });
    try {
      const pack = carriedIconPack();
      expect(pack.prefix).toBe("custom");
      expect(pack.icons.vnet).toEqual({ body: '<path d="M0 0"/>', width: 18, height: 18 });
    } finally {
      setCarriedIcons({});
    }
  });

  it("leaves out what it cannot size rather than drawing it wrong", () => {
    setCarriedIcons({ bad: '<svg><path d="M0 0"/></svg>' });
    try {
      expect(carriedIconPack().icons.bad).toBeUndefined();
    } finally {
      setCarriedIcons({});
    }
  });

  it("rewrites a vendor's catalogue code to the name the pack holds", () => {
    // What a diagram written in another tool says.
    expect(normaliseIconRefs("service kv(azure:10001-icon-service-key-vaults)[KV]")).toBe(
      "service kv(azure:key-vaults)[KV]",
    );
  });

  it("leaves alone a prefix this build does not have", () => {
    const code = "service x(nosuch:10001-icon-service-thing)[X]";
    expect(normaliseIconRefs(code)).toBe(code);
  });

  it("leaves alone everything that is not a catalogue code", () => {
    const code = "service a(azure:virtual-networks)[A]\n  service b(logos:aws)[B]";
    expect(normaliseIconRefs(code)).toBe(code);
  });
});
