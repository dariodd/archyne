import { useState } from "react";
import { Modal } from "./Modal";
import { useWorkspace } from "../workspace";
import { createDoc, deleteDoc, renameDoc, switchTo, useDocDialogs } from "../documents";
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

  const activeDirty = savedCode !== null && savedCode !== code;
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
                title={d.name}
                onClick={() => void switchTo(d.id)}
                onDoubleClick={() => setRenaming(d.id)}
              >
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
        <span className="doc-tabs-hint">{t("doc.tabsHint")}</span>
      </div>

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
    <Modal title={t("doc.renameTitle")} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(value);
        }}
      >
        <div className="modal-body">
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
