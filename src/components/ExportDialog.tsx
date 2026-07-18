import { useEffect, useState } from "react";
import { useGraphStore } from "../store";
import {
  buildExport,
  downloadDataUrl,
  DEFAULT_EXPORT_OPTIONS,
  type ExportOptions,
} from "../export";

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const nodes = useGraphStore((s) => s.nodes);
  const code = useGraphStore((s) => s.code);
  const [opts, setOpts] = useState<ExportOptions>(DEFAULT_EXPORT_OPTIONS);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<ExportOptions>) => setOpts((o) => ({ ...o, ...patch }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    setBusy(true);
    setError(null);
    const t = setTimeout(() => {
      buildExport(opts, nodes, code)
        .then((url) => {
          if (!alive) return;
          setPreview(url);
          setBusy(false);
        })
        .catch((err: unknown) => {
          if (!alive) return;
          setError(err instanceof Error ? err.message : String(err));
          setBusy(false);
        });
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [opts, nodes, code]);

  const doExport = () => {
    if (preview) downloadDataUrl(preview, `diagram.${opts.format}`);
    onClose();
  };

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal">
        <div className="modal-title">Export diagram</div>
        <div className="modal-body">
          <div className="export-opts">
            <label>
              Source
              <select
                value={opts.source}
                onChange={(e) => set({ source: e.target.value as ExportOptions["source"] })}
              >
                <option value="canvas">Canvas (as arranged here)</option>
                <option value="mermaid">Mermaid renderer (standard look)</option>
              </select>
            </label>
            <label>
              Format
              <select
                value={opts.format}
                onChange={(e) => set({ format: e.target.value as ExportOptions["format"] })}
              >
                <option value="png">PNG</option>
                <option value="svg">SVG (vector)</option>
              </select>
            </label>
            <label>
              Background
              <select
                value={opts.background}
                onChange={(e) =>
                  set({ background: e.target.value as ExportOptions["background"] })
                }
              >
                <option value="dark">Dark</option>
                <option value="light">White</option>
                <option value="transparent">Transparent</option>
              </select>
            </label>
            {opts.source === "mermaid" && (
              <label>
                Mermaid theme
                <select
                  value={opts.theme}
                  onChange={(e) => set({ theme: e.target.value as ExportOptions["theme"] })}
                >
                  <option value="dark">dark</option>
                  <option value="default">default</option>
                  <option value="neutral">neutral</option>
                  <option value="forest">forest</option>
                  <option value="base">base</option>
                </select>
              </label>
            )}
            {opts.format === "png" && (
              <label>
                Quality
                <select
                  value={opts.scale}
                  onChange={(e) => set({ scale: Number(e.target.value) as ExportOptions["scale"] })}
                >
                  <option value={1}>1× (screen)</option>
                  <option value={2}>2× (slides)</option>
                  <option value={3}>3× (print)</option>
                </select>
              </label>
            )}
            {opts.source === "canvas" && (
              <label>
                Margin ({opts.padding}px)
                <input
                  type="range"
                  min={0}
                  max={160}
                  step={8}
                  value={opts.padding}
                  onChange={(e) => set({ padding: Number(e.target.value) })}
                />
              </label>
            )}
          </div>
          <div className="export-preview">
            {error ? (
              <div className="preview-error">{error}</div>
            ) : preview ? (
              <img src={preview} alt="export preview" className={busy ? "stale" : ""} />
            ) : (
              <div className="palette-hint">Generating preview…</div>
            )}
          </div>
        </div>
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={doExport} disabled={busy || !!error}>
            Export {opts.format.toUpperCase()}
          </button>
        </div>
      </div>
    </div>
  );
}
