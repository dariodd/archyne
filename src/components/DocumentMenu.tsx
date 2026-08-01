import { useState } from "react";
import { MenuButton, MenuItem } from "./MenuButton";
import { Modal } from "./Modal";
import { useWorkspace } from "../workspace";
import { createDoc, deleteDoc, duplicateDoc, renameDoc, switchTo } from "../documents";
import { useGraphStore } from "../store";
import { useFileStore } from "../files";
import { useT } from "../i18n";

/**
 * The document switcher: what used to be a static file name in the toolbar.
 *
 * A menu rather than a tab strip. The toolbar was deliberately compressed to
 * a single row, and a permanent tab bar would take thirty-odd pixels from the
 * canvas in an application where the canvas is the product. Fast switching
 * lives in the command palette instead, which already searches commands and
 * nodes — "which diagram" is the same question as "which node".
 */
export function DocumentMenu() {
  const t = useT();
  const docs = useWorkspace((s) => s.docs);
  const activeId = useWorkspace((s) => s.activeId);
  const code = useGraphStore((s) => s.code);
  const savedCode = useFileStore((s) => s.savedCode);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const active = docs.find((d) => d.id === activeId);
  const label = active?.name ?? t("file.untitled");
  const dirty = savedCode !== null && savedCode !== code;
  const ordered = [...docs].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <>
      <MenuButton
        className="doc-menu"
        triggerClassName="doc-trigger"
        label={t("doc.menuLabel", { name: label })}
        trigger={
          <>
            <span className="file-name">{label}</span>
            {dirty && (
              <em
                className="file-dirty"
                title={t("file.unsaved")}
                aria-label={t("file.unsaved")}
              >
                •
              </em>
            )}
            <span aria-hidden="true" className="doc-caret">
              ▾
            </span>
          </>
        }
      >
        <div className="doc-list" role="group" aria-label={t("doc.openDocuments")}>
          {ordered.map((d) => (
            <MenuItem key={d.id} onSelect={() => void switchTo(d.id)}>
              <span className="doc-check" aria-hidden="true">
                {d.id === activeId ? "✓" : ""}
              </span>
              <span className="doc-name">{d.name}</span>
              {/* Screen readers get the state in words, not as a tick glyph. */}
              {d.id === activeId && <span className="visually-hidden">{t("doc.current")}</span>}
            </MenuItem>
          ))}
        </div>

        <hr className="menu-sep" />

        <MenuItem onSelect={() => void createDoc()}>{t("doc.new")}</MenuItem>
        <MenuItem onSelect={() => setRenaming(true)}>{t("doc.rename")}</MenuItem>
        <MenuItem onSelect={() => void duplicateDoc(activeId)}>{t("doc.duplicate")}</MenuItem>
        <MenuItem onSelect={() => setConfirmDelete(true)}>{t("doc.delete")}</MenuItem>
      </MenuButton>

      {renaming && (
        <RenameDialog
          initial={label}
          onClose={() => setRenaming(false)}
          onSubmit={(name) => {
            renameDoc(activeId, name);
            setRenaming(false);
          }}
        />
      )}

      {confirmDelete && (
        <Modal
          title={t("doc.deleteTitle", { name: label })}
          onClose={() => setConfirmDelete(false)}
        >
          <div className="modal-body">
            <p>{dirty ? t("doc.deleteUnsaved") : t("doc.deleteBody")}</p>
          </div>
          <div className="modal-actions">
            <button onClick={() => setConfirmDelete(false)}>{t("common.cancel")}</button>
            <button
              className="danger"
              onClick={() => {
                setConfirmDelete(false);
                void deleteDoc(activeId);
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
