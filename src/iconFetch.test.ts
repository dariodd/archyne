import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchIcons, MAX_ICON_BYTES } from "./iconFetch";

const RAW = "https://raw.githubusercontent.com/org/pack";

/** A `fetch` that answers from a table, and records what it was asked for. */
function serving(bodies: Record<string, string | { svg: string; delayMs: number }>) {
  const asked: string[] = [];
  const fake = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    asked.push(url);
    const body = bodies[url];
    if (body === undefined) return new Response("no", { status: 404 });
    if (typeof body !== "string") {
      await new Promise((r) => setTimeout(r, body.delayMs));
      return new Response(body.svg);
    }
    return new Response(body);
  });
  vi.stubGlobal("fetch", fake);
  return asked;
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as { archyne?: unknown }).archyne;
});

describe("fetching icons in the browser", () => {
  it("brings back an SVG, named by where it came from", async () => {
    // Asked for exactly as it was written: the escape is the server's
    // business. What comes back keeps the whole path, because the folders on
    // it are what say whose icon this is — the name is derived from it later.
    serving({ [`${RAW}/main/Virtual%20Networks.svg`]: "<svg/>" });

    const out = await fetchIcons([`${RAW}/main/Virtual%20Networks.svg`]);

    expect(out.icons).toEqual([{ name: `${RAW}/main/Virtual%20Networks.svg`, svg: "<svg/>" }]);
    expect(out.failed).toEqual([]);
  });

  it("drops the query, which is a CDN's business and not part of the path", async () => {
    serving({ [`${RAW}/main/a.svg?v=2`]: "<svg/>" });

    const out = await fetchIcons([`${RAW}/main/a.svg?v=2`]);

    expect(out.icons[0].name).toBe(`${RAW}/main/a.svg`);
  });

  it("does not even ask a host that is not on the list", async () => {
    const asked = serving({});

    const link = "https://learn.microsoft.com/icons/vnet.svg";
    const out = await fetchIcons([link]);

    expect(asked).toEqual([]);
    expect(out.failed).toEqual([link]);
  });

  it("reports a link that answered with an error, without losing the others", async () => {
    serving({ [`${RAW}/main/a.svg`]: "<svg/>" });

    const out = await fetchIcons([`${RAW}/main/a.svg`, `${RAW}/main/gone.svg`]);

    expect(out.icons.map((i) => i.name)).toEqual([`${RAW}/main/a.svg`]);
    expect(out.failed).toEqual([`${RAW}/main/gone.svg`]);
  });

  it("refuses a body too large to be an icon", async () => {
    serving({ [`${RAW}/main/huge.svg`]: "x".repeat(MAX_ICON_BYTES + 1) });

    const out = await fetchIcons([`${RAW}/main/huge.svg`]);

    expect(out.icons).toEqual([]);
    expect(out.failed).toEqual([`${RAW}/main/huge.svg`]);
  });

  it("keeps the order they were typed in, not the order they answered", async () => {
    // The caller may give the first icon to the selected node, so "first"
    // has to mean the first link and not the quickest host.
    serving({
      [`${RAW}/main/slow.svg`]: { svg: "<svg id='slow'/>", delayMs: 20 },
      [`${RAW}/main/fast.svg`]: "<svg id='fast'/>",
    });

    const out = await fetchIcons([`${RAW}/main/slow.svg`, `${RAW}/main/fast.svg`]);

    expect(out.icons.map((i) => i.svg)).toEqual(["<svg id='slow'/>", "<svg id='fast'/>"]);
  });

  it("asks for the same file once, however many times it was pasted", async () => {
    const asked = serving({ [`${RAW}/main/a.svg`]: "<svg/>" });

    await fetchIcons([`${RAW}/main/a.svg`, ` ${RAW}/main/a.svg `]);

    expect(asked).toHaveLength(1);
  });
});

describe("fetching through the desktop shell", () => {
  it("hands the links over, because it can take what the browser cannot", async () => {
    const fetchIconsBridge = vi.fn(async () => ({
      icons: [{ name: "vnet", svg: "<svg/>" }],
      failed: [],
    }));
    (globalThis as { archyne?: unknown }).archyne = { fetchIcons: fetchIconsBridge };
    const asked = serving({});

    const out = await fetchIcons(["https://example.com/pack.zip"]);

    expect(fetchIconsBridge).toHaveBeenCalledWith(["https://example.com/pack.zip"]);
    expect(out.icons).toHaveLength(1);
    // The page itself never went out: the shell did.
    expect(asked).toEqual([]);
  });

  it("reports every link as failed when the shell could not do it", async () => {
    (globalThis as { archyne?: unknown }).archyne = {
      fetchIcons: vi.fn(async () => {
        throw new Error("offline");
      }),
    };

    const out = await fetchIcons(["https://example.com/pack.zip"]);

    expect(out.icons).toEqual([]);
    expect(out.failed).toEqual(["https://example.com/pack.zip"]);
  });
});
