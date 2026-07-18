import { Modal } from "./Modal";
import { useT } from "../i18n";

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const t = useT();

  return (
    // The wordmark is the visible title, so the heading is for screen
    // readers only — the dialog still needs an accessible name.
    <Modal title={t("about.title")} onClose={onClose} className="about" hideTitle>
      <div className="about-hero">
        <div className="about-lockup">
          <img className="about-mark" src="./logo.svg" alt="" />
          <span className="about-name">{t("app.name")}</span>
        </div>
        {/* The tagline used to be baked into the wordmark. As text it is
            translatable, and it keeps another project's name out of the
            brand lockup. */}
        <p className="about-tagline">{t("app.tagline")}</p>
      </div>

      <div className="about-body about-prose">
        <p>
          Every diagram you draw here is a standard{" "}
          <a href="https://github.com/mermaid-js/mermaid" target="_blank" rel="noreferrer">
            Mermaid
          </a>{" "}
          file — portable, versionable, and readable by humans and AI agents alike. Everything
          runs locally: nothing ever leaves your machine.
        </p>
        <p>
          Archyne is free software, released under the <strong>MIT License</strong> — you may
          use, modify, and redistribute it, commercially too, as long as the license notice
          travels with it. It is built on the shoulders of open-source projects such as React,
          React&nbsp;Flow, Mermaid, the Eclipse Layout Kernel, and Iconify, each under a license
          compatible with this one. The complete inventory, with every notice, lives in{" "}
          <em>THIRD-PARTY-NOTICES.md</em> alongside the source code. Icon collections are openly
          licensed (CC0, MIT, Apache-2.0), though the vendor logos they depict remain trademarks
          of their respective owners.
        </p>
        <p className="about-trademark">{t("about.trademark")}</p>
        <p className="about-version">{t("about.version", { version: "0.1.0" })}</p>
      </div>

      <div className="modal-actions">
        <button onClick={onClose}>{t("about.close")}</button>
      </div>
    </Modal>
  );
}
