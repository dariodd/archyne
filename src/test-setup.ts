import { beforeEach } from "vitest";

/**
 * A complete `localStorage` for the test environment.
 *
 * jsdom under this setup provides something Storage-shaped but incomplete —
 * `clear()` is missing, and Node's own experimental web storage may be what
 * actually answers. Tests that persist anything were each stubbing their own
 * replacement, which is duplication that drifts.
 *
 * It is also emptied between tests: persistence bugs where one test's
 * leftovers change another's outcome are exactly what a workspace store
 * would otherwise hide.
 */
const store = new Map<string, string>();

const storage: Storage = {
  get length() {
    return store.size;
  },
  key: (i: number) => [...store.keys()][i] ?? null,
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });

beforeEach(() => {
  store.clear();
});
