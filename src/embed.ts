import { useGraphStore } from "./store";
import { buildExport, DEFAULT_EXPORT_OPTIONS, type ExportOptions } from "./export";

/**
 * Embed mode: when loaded as `/?embed=1` inside an iframe, Merflow speaks a
 * small postMessage protocol with the host page (draw.io style):
 *
 *   host → merflow : { type: "load",   code }        load a mermaid diagram
 *                    { type: "getCode" }             ask for the current code
 *                    { type: "export", options? }    render an export
 *   merflow → host : { type: "ready" }               bridge is listening
 *                    { type: "loaded" }              load completed
 *                    { type: "change", code }        user edited (debounced)
 *                    { type: "code",   code }        reply to getCode
 *                    { type: "exported", format, dataUrl }
 *                    { type: "error",  message }
 *
 * Pass `&origin=https://host.example` to restrict messaging to one origin;
 * without it the bridge answers whichever window embedded it.
 */
export function isEmbedded(): boolean {
  try {
    return new URLSearchParams(location.search).has("embed");
  } catch {
    return false;
  }
}

export function initEmbedBridge(): void {
  if (window.parent === window) return;
  const target = window.parent;
  const allowedOrigin = new URLSearchParams(location.search).get("origin") ?? "*";
  const post = (msg: Record<string, unknown>) => target.postMessage(msg, allowedOrigin);

  window.addEventListener("message", (e: MessageEvent) => {
    if (e.source !== target) return;
    if (allowedOrigin !== "*" && e.origin !== allowedOrigin) return;
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
