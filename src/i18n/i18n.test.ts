import { beforeEach, describe, expect, it } from "vitest";
import { en, type MessageKey } from "./en";
import { initialLocale, LOCALES, t, useI18n, type Locale } from "./index";
import { messages as es } from "./es";
// Aliased: bare `it` is Vitest's test function.
import { messages as italian } from "./it";
import { messages as de } from "./de";
import { messages as ar } from "./ar";
import { messages as zh } from "./zh";
import { messages as ja } from "./ja";

const CATALOGUES: Record<Exclude<Locale, "en">, Record<string, string>> = {
  es,
  it: italian,
  de,
  ar,
  zh,
  ja,
};
const keys = Object.keys(en) as MessageKey[];

/** `{name}` placeholders a template expects. */
function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

describe("catalogues", () => {
  it("declares a label and direction for every locale", () => {
    for (const [code, info] of Object.entries(LOCALES)) {
      expect(info.label, code).toBeTruthy();
      expect(["ltr", "rtl"]).toContain(info.dir);
    }
  });

  for (const [code, catalogue] of Object.entries(CATALOGUES)) {
    describe(code, () => {
      it("covers every key with no extras", () => {
        expect(Object.keys(catalogue).sort()).toEqual([...keys].sort());
      });

      it("leaves no value empty", () => {
        const empty = keys.filter((k) => !catalogue[k]?.trim());
        expect(empty).toEqual([]);
      });

      it("keeps the same placeholders as the source", () => {
        // A dropped `{name}` produces a sentence that silently loses its
        // subject, which type checking cannot catch.
        const mismatched = keys.filter(
          (k) => placeholders(en[k]).join() !== placeholders(catalogue[k]).join(),
        );
        expect(mismatched).toEqual([]);
      });

      it("actually translates the prose", () => {
        // Product names and format names are legitimately identical; a large
        // overlap would mean the catalogue was copied rather than translated.
        const identical = keys.filter((k) => en[k] === catalogue[k]);
        expect(identical.length).toBeLessThan(keys.length * 0.2);
      });
    });
  }
});

describe("initialLocale()", () => {
  // jsdom's localStorage in this setup is not a complete Storage, so stub a
  // minimal one rather than let the environment decide the outcome.
  let store: Record<string, string> = {};
  beforeEach(() => {
    store = {};
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => (store[k] = v),
        removeItem: (k: string) => delete store[k],
      },
    });
  });

  it("starts in English when nothing has been chosen", () => {
    expect(initialLocale()).toBe("en");
  });

  it("ignores the browser's preferred languages", () => {
    // Sniffing `navigator.languages` meant the UI changed language on its own
    // the moment a catalogue was added: an Italian-configured machine flipped
    // from English to Italian just because Italian started existing.
    const original = Object.getOwnPropertyDescriptor(navigator, "languages");
    Object.defineProperty(navigator, "languages", {
      value: ["it-IT", "it", "de"],
      configurable: true,
    });
    expect(initialLocale()).toBe("en");
    if (original) Object.defineProperty(navigator, "languages", original);
  });

  it("remembers an explicit choice", () => {
    store["graph:locale"] = "ja";
    expect(initialLocale()).toBe("ja");
  });

  it("ignores a stored value that is not a known locale", () => {
    store["graph:locale"] = "klingon";
    expect(initialLocale()).toBe("en");
  });
});

describe("t()", () => {
  it("returns the source string by default", () => {
    expect(t("export.cancel")).toBe("Cancel");
  });

  it("substitutes placeholders", () => {
    expect(t("canvas.connectDone", { from: "A", to: "B" })).toBe("Connected A to B.");
    expect(t("menu.groupNodes", { count: 3 })).toBe("Group 3 nodes");
  });

  it("leaves unknown placeholders untouched rather than printing undefined", () => {
    expect(t("canvas.connectDone", { from: "A" })).toBe("Connected A to {to}.");
  });

  it("follows the active locale, and switching back restores English", async () => {
    await useI18n.getState().setLocale("de");
    expect(t("export.cancel")).toBe("Abbrechen");
    expect(useI18n.getState().locale).toBe("de");

    await useI18n.getState().setLocale("ar");
    expect(t("export.cancel")).toBe("إلغاء");
    expect(document.documentElement.dir).toBe("rtl");

    await useI18n.getState().setLocale("en");
    expect(t("export.cancel")).toBe("Cancel");
    expect(document.documentElement.dir).toBe("ltr");
  });
});
