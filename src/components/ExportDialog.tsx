import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { useT } from "../i18n";
import { useGraphStore } from "../store";
import {
  buildExport,
  canCopyImage,
  copyExport,
  downloadDataUrl,
  pdfFromPng,
  previewOptions,
  DEFAULT_EXPORT_OPTIONS,
  FORMAT_INFO,
  type ExportOptions,
} from "../export";

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const nodes = useGraphStore((s) => s.nodes);
  const code = useGraphStore((s) => s.code);
  const [opts, setOpts] = useState<ExportOptions>(DEFAULT_EXPORT_OPTIONS);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const set = (patch: Partial<ExportOptions>) => setOpts((o) => ({ ...o, ...patch }));

  useEffect(() => {
    let alive = true;
    // Flip to "busy" only once the debounce actually fires, so rapid option
    // changes keep showing the last preview instead of flashing a spinner.
    const t = setTimeout(() => {
      if (!alive) return;
      setBusy(true);
      setError(null);
      // A PDF cannot go in an <img>, so the preview is the image that will be
      // placed on the page. The paper is applied when the button is pressed.
      buildExport(previewOptions(opts), nodes, code)
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

  const failed = (err: unknown) => setError(err instanceof Error ? err.message : String(err));

  const doExport = () => {
    if (!preview) return onClose();
    const { extension } = FORMAT_INFO[opts.format];
    const deliver = (url: string) => {
      downloadDataUrl(url, `diagram.${extension}`);
      onClose();
    };
    if (opts.format !== "pdf") return deliver(preview);
    setBusy(true);
    pdfFromPng(preview, opts)
      .then(deliver)
      .catch((err: unknown) => {
        failed(err);
        setBusy(false);
      });
  };

  const doCopy = () => {
    if (!preview) return;
    copyExport(preview)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(failed);
  };

  return (
    <Modal title={t("export.title")} onClose={onClose}>
      <div className="modal-body">
        <div className="export-opts">
          <label>
            {t("export.source")}
            <select
              value={opts.source}
              onChange={(e) => set({ source: e.target.value as ExportOptions["source"] })}
            >
              <option value="canvas">{t("export.sourceCanvas")}</option>
              <option value="mermaid">{t("export.sourceMermaid")}</option>
            </select>
          </label>
          <label>
            {t("export.format")}
            <select
              value={opts.format}
              onChange={(e) => set({ format: e.target.value as ExportOptions["format"] })}
            >
              <option value="png">{t("export.formatPng")}</option>
              <option value="svg">{t("export.formatSvg")}</option>
              <option value="pdf">{t("export.formatPdf")}</option>
            </select>
          </label>
          {opts.format === "pdf" && (
            <label>
              {t("export.page")}
              <select
                value={opts.page}
                onChange={(e) => set({ page: e.target.value as ExportOptions["page"] })}
              >
                <option value="fit">{t("export.pageFit")}</option>
                <option value="a4">{t("export.pageA4")}</option>
                <option value="letter">{t("export.pageLetter")}</option>
              </select>
            </label>
          )}
          <label>
            {t("export.background")}
            <select
              value={opts.background}
              onChange={(e) =>
                set({ background: e.target.value as ExportOptions["background"] })
              }
            >
              <option value="dark">{t("export.bgDark")}</option>
              <option value="light">{t("export.bgLight")}</option>
              <option value="transparent">{t("export.bgTransparent")}</option>
            </select>
          </label>
          {opts.source === "mermaid" && (
            <label>
              {t("export.mermaidTheme")}
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
          {opts.format !== "svg" && (
            <label>
              {t("export.quality")}
              <select
                value={opts.scale}
                onChange={(e) =>
                  set({ scale: Number(e.target.value) as ExportOptions["scale"] })
                }
              >
                <option value={1}>{t("export.quality1")}</option>
                <option value={2}>{t("export.quality2")}</option>
                <option value={3}>{t("export.quality3")}</option>
              </select>
            </label>
          )}
          {opts.source === "canvas" && (
            <label>
              {t("export.margin", { padding: opts.padding })}
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
          {opts.format === "pdf" && <p className="field-hint">{t("export.pdfHint")}</p>}
        </div>
        {/* The preview is regenerated as options change, so announce the
              outcome rather than leaving it to sighted users only. */}
        <div className="export-preview" aria-live="polite" aria-busy={busy}>
          {error ? (
            <div className="preview-error">{error}</div>
          ) : preview ? (
            <img src={preview} alt={t("export.previewAlt")} className={busy ? "stale" : ""} />
          ) : (
            <div className="palette-hint">{t("export.generating")}</div>
          )}
        </div>
      </div>
      <div className="modal-actions">
        <button onClick={onClose}>{t("export.cancel")}</button>
        {canCopyImage() && (
          <button onClick={doCopy} disabled={busy || !!error}>
            {copied
              ? t("export.copied")
              : opts.format === "svg"
                ? t("export.copyMarkup")
                : t("export.copyImage")}
          </button>
        )}
        <button className="primary" onClick={doExport} disabled={busy || !!error}>
          {t("export.confirm", { format: FORMAT_INFO[opts.format].extension.toUpperCase() })}
        </button>
      </div>
    </Modal>
  );
}
