import { Modal } from "./Modal";
import { useGraphStore } from "../store";
import { TEMPLATES } from "../templates";
import { useT } from "../i18n";

/**
 * Starting points, offered instead of an empty canvas.
 *
 * Each one is a small but complete diagram of its family, so a new user can
 * see what the family is for and edit it into their own case rather than
 * having to know the syntax first.
 */
export function TemplateDialog({ onClose }: { onClose: () => void }) {
  const applyCode = useGraphStore((s) => s.applyCode);
  const t = useT();

  const use = (code: string) => {
    // `forceLayout` because the templates carry no positions comment — ELK
    // arranges them for the window they are actually opened in.
    void applyCode(code, { record: true, forceLayout: true });
    onClose();
  };

  return (
    <Modal title={t("tpl.title")} onClose={onClose} className="templates">
      <div className="modal-body template-grid">
        {TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            className="template-card"
            onClick={() => use(template.code)}
          >
            <span className="template-kind">{t(`kind.${template.kind}`)}</span>
            <span className="template-name">{t(template.nameKey)}</span>
            <span className="template-desc">{t(template.descriptionKey)}</span>
          </button>
        ))}
      </div>
      <div className="modal-actions">
        <button onClick={onClose}>{t("export.cancel")}</button>
      </div>
    </Modal>
  );
}
