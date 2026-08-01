import { useGraphStore } from "./store";
import { buildExport, DEFAULT_EXPORT_OPTIONS, type ExportOptions } from "./export";

/**
 * Embed mode: when loaded as `/?embed=1` inside an iframe, Archyne speaks a
 * small postMessage protocol with the host page (draw.io style):
 *
 *   host → archyne : { type: "load",   code }        load a mermaid diagram
 *                    { type: "getCode" }             ask for the current code
 *                    { type: "export", options? }    render an export
 *   archyne → host : { type: "ready" }               bridge is listening
 *                    { type: "loaded" }              load completed
 *                    { type: "change", code }        user edited (debounced)
 *                    { type: "code",   code }        reply to getCode
 *                    { type: "exported", format, dataUrl }
 *                    { type: "error",  message }
 *
 * The bridge is **default-deny**: the host must name itself with
 * `&origin=https://host.example` (comma-separate several). Diagram content is
 * only ever posted to an origin on that list. `origin=*` restores the old
 * answer-anyone behaviour and exists for local development only.
 */
export function isEmbedded(): boolean {
  try {
    return new URLSearchParams(location.search).has("embed");
  } catch {
    return false;
  }
}

/** Wildcard sentinel — accept and reply to any origin. Development only. */
export const ANY_ORIGIN = "*";

/**
 * Read the `origin` allowlist out of a query string.
 *
 * Returns `ANY_ORIGIN` for the explicit wildcard, a list of normalized
 * origins, or `null` when nothing usable was supplied — in which case the
 * bridge must not start. Malformed entries are dropped rather than silently
 * widening the allowlist.
 */
export function parseAllowedOrigins(search: string): string[] | typeof ANY_ORIGIN | null {
  const raw = new URLSearchParams(search).get("origin");
  if (raw === null || raw.trim() === "") return null;
  if (raw.trim() === ANY_ORIGIN) return ANY_ORIGIN;

  const origins: string[] = [];
  for (const entry of raw.split(",")) {
    const value = entry.trim();
    if (!value) continue;
    try {
      const url = new URL(value);
      // An allowlist entry must be a bare origin: scheme + host (+ port).
      // Anything with a path is a sign the host meant something else, and
      // matching it against `e.origin` would never succeed anyway.
      if (url.origin === "null" || url.origin !== value.replace(/\/$/, "")) continue;
      origins.push(url.origin);
    } catch {
      // Not a URL — drop it.
    }
  }
  return origins.length > 0 ? origins : null;
}

export function initEmbedBridge(): void {
  if (window.parent === window) return;
  const target = window.parent;

  const allowed = parseAllowedOrigins(location.search);
  if (allowed === null) {
    console.error(
      "[archyne] Embed bridge disabled: no valid `origin` parameter. " +
        "Load Archyne as `?embed=1&origin=https://your.app` so it knows which " +
        "origin may read and write the diagram. Use `origin=*` for local " +
        "development only.",
    );
    return;
  }
  const anyOrigin = allowed === ANY_ORIGIN;
  if (anyOrigin) {
    console.warn(
      "[archyne] Embed bridge running with `origin=*`: any page framing " +
        "Archyne can read and modify the diagram. Do not use this in production.",
    );
  }

  /**
   * Post to every allowed origin. `postMessage` only delivers when the
   * frame's actual origin matches the target, so naming several is safe —
   * at most one of them can receive it.
   */
  const post = (msg: Record<string, unknown>) => {
    if (anyOrigin) {
      target.postMessage(msg, ANY_ORIGIN);
      return;
    }
    for (const origin of allowed) target.postMessage(msg, origin);
  };

  window.addEventListener("message", (e: MessageEvent) => {
    if (e.source !== target) return;
    if (!anyOrigin && !allowed.includes(e.origin)) return;
    const msg = e.data as { type?: unknown; code?: unknown; options?: unknown };
    if (!msg || typeof msg.type !== "string") return;
    const s = useGraphStore.getState();
    void (async () => {
      try {
        switch (msg.type) {
          case "load":
            await s.applyCode(String(msg.code ?? ""), { record: true });
            post({ type: "loaded" });
            break;
          case "getCode":
            post({ type: "code", code: s.code });
            break;
          case "export": {
            const opts = {
              ...DEFAULT_EXPORT_OPTIONS,
              ...((msg.options as Partial<ExportOptions>) ?? {}),
            };
            const dataUrl = await buildExport(opts, s.nodes, s.code);
            post({ type: "exported", format: opts.format, dataUrl });
            break;
          }
        }
      } catch (err) {
        post({ type: "error", message: err instanceof Error ? err.message : String(err) });
      }
    })();
  });

  // Push edits to the host, debounced.
  let last = useGraphStore.getState().code;
  let timer: ReturnType<typeof setTimeout> | undefined;
  useGraphStore.subscribe((state) => {
    if (state.code === last) return;
    last = state.code;
    clearTimeout(timer);
    timer = setTimeout(() => post({ type: "change", code: last }), 300);
  });

  post({ type: "ready" });
}
