import { Modal } from "./Modal";
import { useT } from "../i18n";
import type { MessageKey } from "../i18n";

/** Shown on `?`. Keys are literal and deliberately not translated. */
const GROUPS: Array<{ title: MessageKey; rows: Array<[string, MessageKey]> }> = [
  {
    title: "shortcuts.file",
    rows: [
      ["Ctrl+O", "toolbar.open"],
      ["Ctrl+S", "toolbar.save"],
      ["Ctrl+Shift+S", "toolbar.saveAs"],
      ["Ctrl+E", "toolbar.export"],
    ],
  },
  {
    title: "shortcuts.edit",
    rows: [
      ["Ctrl+Z", "toolbar.undo"],
      ["Ctrl+Y", "toolbar.redo"],
      ["Ctrl+C", "menu.copy"],
      ["Ctrl+V", "menu.paste"],
      ["Ctrl+D", "menu.duplicate"],
      ["Ctrl+A", "shortcuts.selectAll"],
      ["Delete", "menu.delete"],
    ],
  },
  {
    title: "shortcuts.canvas",
    rows: [
      ["Tab", "shortcuts.nextNode"],
      ["C", "shortcuts.connect"],
      ["Enter", "shortcuts.completeConnect"],
      ["Escape", "shortcuts.cancel"],
      ["↑ ↓ ← →", "shortcuts.nudge"],
      ["Shift + ↑ ↓ ← →", "shortcuts.nudgeFar"],
    ],
  },
  {
    title: "shortcuts.view",
    rows: [
      ["Ctrl+K", "shortcuts.commandPalette"],
      ["?", "shortcuts.title"],
    ],
  },
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <Modal title={t("shortcuts.title")} onClose={onClose} className="shortcuts">
      <div className="modal-body shortcuts-body">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h3 className="panel-title">{t(group.title)}</h3>
            <dl className="shortcut-list">
              {group.rows.map(([keys, label]) => (
                <div key={keys} className="shortcut-row">
                  <dt>
                    <kbd>{keys}</kbd>
                  </dt>
                  <dd>{t(label)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <div className="modal-actions">
        <button onClick={onClose}>{t("about.close")}</button>
      </div>
    </Modal>
  );
}
