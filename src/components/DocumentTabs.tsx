import { useMemo, useState } from "react";
import { Modal } from "./Modal";
import { readDocCode, useWorkspace } from "../workspace";
import { sniffKind } from "../model/sniff";
import type { DiagramKind } from "../model/types";
import {
  closeAllDocs,
  createDoc,
  deleteDoc,
  renameDoc,
  switchTo,
  unsavedDocuments,
  useDocDialogs,
} from "../documents";
import { useGraphStore } from "../store";
import { useFileStore } from "../files";
import { useT } from "../i18n";

/**
 * One tab per open diagram.
 *
 * This started as a menu on the document name, chosen to spend no vertical
 * space on a screen where the canvas is the product. That was the wrong
 * trade: nothing on screen said other documents existed, so the feature was
 * only usable by someone who already knew it was there. Tabs cost about
 * thirty pixels and answer "how many diagrams do I have open" without being
 * asked.
 *
 * Shown even with one document, deliberately. A strip that appears when the
 * second document arrives would shift the canvas under the pointer, and a
 * lone tab beside a `+` is how every editor says "there can be more".
 */
/** Two letters per family: short enough for a tab, distinct from each other. */
const KIND_TAG: Record<DiagramKind, string> = {
  flowchart: "FL",
  state: "ST",
  er: "ER",
  class: "CL",
  sequence: "SQ",
  architecture: "AR",
  c4: "C4",
};

export function DocumentTabs() {
  const t = useT();
  const docs = useWorkspace((s) => s.docs);
  const activeId = useWorkspace((s) => s.activeId);
  const code = useGraphStore((s) => s.code);
  const savedCode = useFileStore((s) => s.savedCode);
  const renaming = useDocDialogs((s) => s.renaming);
  const confirmDelete = useDocDialogs((s) => s.deleting);
  const setRenaming = (id: string | null) => useDocDialogs.setState({ renaming: id });
  const setConfirmDelete = (id: string | null) => useDocDialogs.setState({ deleting: id });
  const [confirmCloseAll, setConfirmCloseAll] = useState(false);

  const activeDirty = savedCode !== null && savedCode !== code;
  // Named in the dialog rather than counted: "two documents have unsaved
  // changes" leaves you to work out which two.
  const unsaved = confirmCloseAll ? unsavedDocuments() : [];

  /**
   * Each document's family, read from its stored source.
   *
   * Re-read when the documents change or the open one is edited — which is
   * when a family can change, since it changes by rewriting the header. The
   * active document is taken from the store rather than from storage, so a
   * kind switched a moment ago shows immediately.
   */
  const kinds = useMemo(() => {
    const out: Record<string, DiagramKind | null> = {};
    for (const d of docs) {
      out[d.id] = sniffKind(d.id === activeId ? code : (readDocCode(d.id) ?? ""));
    }
    return out;
  }, [docs, activeId, code]);
  const target = docs.find((d) => d.id === (renaming ?? confirmDelete));

  return (
    <>
      {/* Not `role="tablist"`: these switch the whole document rather than a
          panel within one, and there is no tabpanel to point `aria-controls`
          at. A list of links-to-state with `aria-current` says what is true. */}
      <div className="doc-tabs" role="group" aria-label={t("doc.openDocuments")}>
        {docs.map((d) => {
          const active = d.id === activeId;
          return (
            <span key={d.id} className={active ? "doc-tab active" : "doc-tab"}>
              <button
                type="button"
                className="doc-tab-name"
                aria-current={active ? "true" : undefined}
                title={kinds[d.id] ? `${d.name} — ${t(`kind.${kinds[d.id]!}`)}` : d.name}
                onClick={() => void switchTo(d.id)}
                onDoubleClick={() => setRenaming(d.id)}
              >
                {/* Which family this is, without opening it. Two letters and
                    a hue rather than a drawing: at this size a glyph for
                    seven families would be seven smudges, and the letters can
                    be read as well as recognised. The full name is on the
                    tab's title and in the badge's own label. */}
                {kinds[d.id] && (
                  <span
                    className={`doc-kind k-${kinds[d.id]!}`}
                    aria-label={t(`kind.${kinds[d.id]!}`)}
                  >
                    {KIND_TAG[kinds[d.id]!]}
                  </span>
                )}
                {d.name}
                {active && activeDirty && (
                  <em className="file-dirty" aria-label={t("file.unsaved")}>
                    •
                  </em>
                )}
              </button>
              <button
                type="button"
                className="doc-tab-close"
                aria-label={t("doc.closeNamed", { name: d.name })}
                onClick={() => setConfirmDelete(d.id)}
              >
                <span aria-hidden="true">×</span>
              </button>
            </span>
          );
        })}
        <button
          type="button"
          className="doc-tab-add"
          aria-label={t("doc.new")}
          title={t("doc.new")}
          onClick={() => void createDoc()}
        >
          <span aria-hidden="true">+</span>
        </button>
        {docs.length > 1 && (
          /* Only with something to close. One document and a "close all" is
             a button that says the same thing as the × beside it. */
          <button
            type="button"
            className="doc-tab-close-all"
            onClick={() => setConfirmCloseAll(true)}
          >
            {t("doc.closeAll")}
          </button>
        )}
        <span className="doc-tabs-hint">{t("doc.tabsHint")}</span>
      </div>

      {confirmCloseAll && (
        <Modal
          title={t("doc.closeAllTitle", { count: docs.length })}
          onClose={() => setConfirmCloseAll(false)}
          className="narrow"
        >
          <div className="modal-body">
            <p>{unsaved.length > 0 ? t("doc.closeAllUnsaved") : t("doc.closeAllBody")}</p>
            {unsaved.length > 0 && (
              <ul className="doc-unsaved-list">
                {unsaved.map((d) => (
                  <li key={d.id}>{d.name}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="modal-actions">
            <button onClick={() => setConfirmCloseAll(false)}>{t("common.cancel")}</button>
            <button
              className="danger"
              onClick={() => {
                setConfirmCloseAll(false);
                void closeAllDocs();
              }}
            >
              {t("doc.closeAll")}
            </button>
          </div>
        </Modal>
      )}

      {renaming && target && (
        <RenameDialog
          initial={target.name}
          onClose={() => setRenaming(null)}
          onSubmit={(name) => {
            renameDoc(renaming, name);
            setRenaming(null);
          }}
        />
      )}

      {confirmDelete && target && (
        <Modal
          title={t("doc.deleteTitle", { name: target.name })}
          onClose={() => setConfirmDelete(null)}
          className="narrow"
        >
          <div className="modal-body">
            <p>
              {confirmDelete === activeId && activeDirty
                ? t("doc.deleteUnsaved")
                : t("doc.deleteBody")}
            </p>
          </div>
          <div className="modal-actions">
            <button onClick={() => setConfirmDelete(null)}>{t("common.cancel")}</button>
            <button
              className="danger"
              onClick={() => {
                const id = confirmDelete;
                setConfirmDelete(null);
                void deleteDoc(id);
              }}
            >
              {t("doc.delete")}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function RenameDialog({
  initial,
  onClose,
  onSubmit,
}: {
  initial: string;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const t = useT();
  const [value, setValue] = useState(initial);

  return (
    <Modal title={t("doc.renameTitle")} onClose={onClose} className="narrow">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(value);
        }}
      >
        <div className="modal-body stacked">
          <label className="field">
            {t("doc.nameLabel")}
            {/* Autofocus is the point of the dialog: it exists to take a name. */}
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
          </label>
          <p className="field-hint">{t("doc.renameHint")}</p>
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="primary">
            {t("doc.renameConfirm")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
