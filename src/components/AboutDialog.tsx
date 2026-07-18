import { useEffect } from "react";
import { useThemeStore } from "../theme";

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const resolved = useThemeStore((s) => s.resolved);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal about">
        <div className="about-hero">
          <img
            className="about-wordmark"
            src={resolved === "light" ? "./wordmark-light.png" : "./wordmark-dark.png"}
            alt="Merflow — Visual Mermaid Editor"
          />
        </div>

        <div className="about-body about-prose">
          <p>
            Every diagram you draw here is a standard{" "}
            <a href="https://mermaid.js.org" target="_blank" rel="noreferrer">
              Mermaid
            </a>{" "}
            file — portable, versionable, and readable by humans and AI agents
            alike. Everything runs locally: nothing ever leaves your machine.
          </p>
          <p>
            Merflow is free software, released under the{" "}
            <strong>MIT License</strong> — you may use, modify, and
            redistribute it, commercially too, as long as the license notice
            travels with it. It is built on the shoulders of open-source
            projects such as React, React&nbsp;Flow, Mermaid, the Eclipse
            Layout Kernel, and Iconify, each under a license compatible with
            this one. The complete inventory, with every notice, lives in{" "}
            <em>THIRD-PARTY-NOTICES.md</em> alongside the source code. Icon
            collections are openly licensed (CC0, MIT, Apache-2.0), though the
            vendor logos they depict remain trademarks of their respective
            owners.
          </p>
          <p className="about-version">version 0.1.0</p>
        </div>

        <div className="modal-actions">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
