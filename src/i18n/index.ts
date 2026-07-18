import { create } from "zustand";
import { en, type MessageKey, type Messages } from "./en";

export type Locale = "en" | "es" | "it" | "de" | "ar" | "zh" | "ja";

export interface LocaleInfo {
  /** Name in its own language, as language pickers should show it. */
  label: string;
  dir: "ltr" | "rtl";
}

export const LOCALES: Record<Locale, LocaleInfo> = {
  en: { label: "English", dir: "ltr" },
  es: { label: "Español", dir: "ltr" },
  it: { label: "Italiano", dir: "ltr" },
  de: { label: "Deutsch", dir: "ltr" },
  ar: { label: "العربية", dir: "rtl" },
  zh: { label: "简体中文", dir: "ltr" },
  ja: { label: "日本語", dir: "ltr" },
};

/**
 * Catalogues load on demand — only English is in the initial bundle, so
 * adding locales costs nothing to a user who never switches.
 */
const LOADERS: Record<Exclude<Locale, "en">, () => Promise<{ messages: Messages }>> = {
  es: () => import("./es"),
  it: () => import("./it"),
  de: () => import("./de"),
  ar: () => import("./ar"),
  zh: () => import("./zh"),
  ja: () => import("./ja"),
};

const STORAGE_KEY = "graph:locale";

/** Embed hosts own persistence; matches the diagram store's behaviour. */
const EMBEDDED = (() => {
  try {
    return new URLSearchParams(location.search).has("embed");
  } catch {
    return false;
  }
})();

function isLocale(value: string | null): value is Locale {
  return value !== null && value in LOCALES;
}

/**
 * The locale to start in: a previous explicit choice, otherwise English.
 *
 * Deliberately *not* derived from `navigator.languages`. Sniffing the browser
 * means the interface silently changes language the moment a new catalogue
 * ships — an Italian-configured machine switched from English to Italian
 * purely because Italian was added. The language is the user's choice to
 * make once, from the toolbar, and it is remembered from then on.
 */
export function initialLocale(): Locale {
  if (EMBEDDED) return "en";
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    // Storage unavailable.
  }
  return "en";
}

interface I18nState {
  locale: Locale;
  messages: Messages;
  setLocale: (locale: Locale) => Promise<void>;
}

export const useI18n = create<I18nState>((set) => ({
  // Start on English synchronously so the first paint has real text; the
  // detected locale is applied by `initI18n` as soon as it resolves.
  locale: "en",
  messages: en,
  setLocale: async (locale) => {
    if (locale === "en") {
      set({ locale, messages: en });
    } else {
      const mod = await LOADERS[locale]();
      set({ locale, messages: mod.messages });
    }
    applyDocumentLocale(locale);
    try {
      if (!EMBEDDED) localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Non-fatal: the choice just won't persist.
    }
  },
}));

/** Keep `<html lang>`/`<html dir>` in step so the browser and AT agree. */
function applyDocumentLocale(locale: Locale) {
  const root = document.documentElement;
  root.lang = locale;
  root.dir = LOCALES[locale].dir;
}

export function initI18n(): void {
  const locale = initialLocale();
  applyDocumentLocale(locale);
  if (locale !== "en") void useI18n.getState().setLocale(locale);
}

/** Substitute `{name}` placeholders. Unknown placeholders are left alone. */
function format(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}

export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

/** Translate outside React (event handlers, stores, announcements). */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const { messages } = useI18n.getState();
  return format(messages[key] ?? en[key], params);
}

/** Translate inside a component, re-rendering when the locale changes. */
export function useT(): Translate {
  const messages = useI18n((s) => s.messages);
  return (key, params) => format(messages[key] ?? en[key], params);
}

export type { MessageKey, Messages };
