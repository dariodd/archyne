import { useState } from "react";
import { Modal } from "./Modal";
import { MermaidPreview } from "./MermaidPreview";
import { PanZoom } from "./PanZoom";
import { CanvasPreview } from "./CanvasPreview";
import { useT } from "../i18n";
import { placeOpened, usePendingImport } from "../documents";
import { sniffKind } from "../model/sniff";
import { openAsMermaid, type OpenedFile } from "../importFile";
import type { DiagramKind } from "../model/types";

/** The product name behind each format code. None of these is translated. */
const SOURCE: Record<string, string> = {
  drawio: "draw.io",
  dot: "Graphviz",
  sql: "SQL",
  excalidraw: "Excalidraw",
  plantuml: "PlantUML",
  vsdx: "Visio",
};

/**
 * What a conversion produced, shown before it lands.
 *
 * Every import is lossy — a foreign format says things Mermaid cannot — and
 * the moment to discover that is *before* the result has replaced what you
 * were looking at. So the conversion runs, and its outcome is put up with the
 * counts, the warnings, and the diagram itself drawn by Mermaid's own
 * renderer. Cancelling costs nothing: nothing has been placed yet.
 */
export function ImportDialog({ opened }: { opened: OpenedFile }) {
  const t = useT();
  // The canvas cannot lay out a sequence diagram — its rows come from the
  // message order rather than from geometry — so that one opens on the
  // rendering that can show it.
  const [view, setView] = useState<"canvas" | "mermaid" | "source">(
    sniffKind(opened.file.content) === "sequence" ? "mermaid" : "canvas",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => usePendingImport.setState({ pending: null });

  const { file, imported } = opened;
  const source = (imported && SOURCE[imported.format]) ?? imported?.format ?? "";
  // What it actually is, read back off the generated document rather than
  // taken on trust from the converter that wrote it.
  const kind = sniffKind(file.content);
  const choices = imported?.choices ?? [];

  /**
   * Convert again as a different family.
   *
   * Detection is a guess — a PlantUML file could be three things and a DOT
   * file two — so the reader can overrule it and see the result before
   * anything lands. A source that cannot be read that way says so instead of
   * replacing the preview with nothing.
   */
  const convertAs = (as: DiagramKind) => {
    setBusy(true);
    setError(null);
    openAsMermaid(opened.source, as)
      .then((next) => usePendingImport.setState({ pending: next }))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false));
  };

  const confirm = () => {
    setBusy(true);
    void placeOpened(opened).finally(close);
  };

  return (
    <Modal className="import-modal" title={t("import.title", { source })} onClose={close}>
      <div className="modal-body">
        <div className="export-opts">
          {/* The target family, as a control rather than a statement: the
              detection is a guess, and the reader is the one who knows. */}
          {/* Always shown, so what it decided is never a guess the reader
              has to make from the picture. Disabled when the source can only
              be read one way — the answer is still worth stating. */}
          <label>
            {t("import.readAs")}
            <select
              value={kind ?? choices[0]}
              disabled={busy || choices.length < 2}
              onChange={(e) => convertAs(e.target.value as DiagramKind)}
            >
              {(choices.includes(kind as DiagramKind) || !kind
                ? choices
                : [...choices, kind]
              ).map((c) => (
                <option key={c} value={c}>
                  {t(`kind.${c}`)}
                </option>
              ))}
            </select>
          </label>
          <p className="import-summary">
            {t("import.counts", {
              nodes: String(imported?.nodes ?? 0),
              edges: String(imported?.edges ?? 0),
            })}
          </p>

          {/* Everything the conversion could not do, stated here rather than
              in a toast that has gone by the time the diagram is on screen. */}
          {imported && imported.pages.length > 1 && (
            <p className="field-hint">
              {t("import.onePage", {
                page: imported.pages[0],
                count: String(imported.pages.length),
              })}
            </p>
          )}
          {imported?.looksLike && (
            <p className="field-hint">
              {t("import.looksLike", { family: imported.looksLike })}
            </p>
          )}
          {!!imported?.dropped && (
            <p className="field-hint">
              {t("import.dropped", { count: String(imported.dropped) })}
            </p>
          )}
          {error && <p className="preview-error">{error}</p>}
          <p className="field-hint">{t("import.unbound", { name: file.name })}</p>

          {/* Three ways to look at it: the canvas it will be edited on, the
              picture Mermaid draws, and the text that was generated. */}
          <div className="import-views" role="group" aria-label={t("import.view")}>
            {(["canvas", "mermaid", "source"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
              >
                {t(`import.view.${v}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Both views scroll, so both must be reachable by keyboard — a pane
            you can only read by dragging it is not readable at all (WCAG
            2.1.1), and axe fails it as `scrollable-region-focusable`.
            The `group` role with a name is what makes that legitimate, and
            the lint rule is configured to accept it. */}
        <div className="export-preview import-preview">
          {view === "source" && (
            <pre
              className="import-source"
              tabIndex={0}
              role="group"
              aria-label={t("import.sourceAlt")}
            >
              {file.content}
            </pre>
          )}
          {view === "mermaid" && (
            <div className="import-render">
              {/* Mermaid lays diagrams out itself and ignores the positions
                  the document carries, so for an imported drawing this pane
                  is "how it renders elsewhere" rather than a second opinion
                  on the import. Worth saying, because on a large drawing the
                  two look nothing alike and the difference is not a fault in
                  the conversion. */}
              {file.content.includes("%% graph:positions") && (
                <p className="import-render-note">{t("import.mermaidLayout")}</p>
              )}
              <PanZoom label={t("import.previewAlt")}>
                <MermaidPreview code={file.content} />
              </PanZoom>
            </div>
          )}
          {/* React Flow brings its own zoom and pan, and its own tabstops. */}
          {view === "canvas" && (
            <div className="import-canvas">
              <CanvasPreview code={file.content} />
            </div>
          )}
        </div>
      </div>
      <div className="modal-actions">
        <button onClick={close}>{t("import.cancel")}</button>
        <button className="primary" onClick={confirm} disabled={busy}>
          {t("import.confirm")}
        </button>
      </div>
    </Modal>
  );
}

/** Rendered once, wherever the other dialogs live. */
export function PendingImport() {
  const pending = usePendingImport((s) => s.pending);
  return pending ? <ImportDialog opened={pending} /> : null;
}
