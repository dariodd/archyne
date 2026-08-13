import { useEffect, useRef } from "react";
import { renderWithMermaid } from "../model/mermaidRender";
import { t } from "../i18n";

/**
 * Render Mermaid code with Mermaid's own renderer.
 *
 * Used by the Preview tab, and by the canvas when the diagram is of a family
 * Archyne cannot edit visually — Mermaid is already bundled, so those files
 * can still be viewed rather than rejected.
 */
export function MermaidPreview({ code, className = "" }: { code: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    // Renders are async and racy; only the newest one may write to the DOM.
    const seq = ++seqRef.current;
    renderWithMermaid(`preview-${seq}`, code)
      .then(({ svg }) => {
        if (seq === seqRef.current && ref.current) ref.current.innerHTML = svg;
      })
      .catch((err: unknown) => {
        if (seq !== seqRef.current || !ref.current) return;
        const message = err instanceof Error ? err.message : String(err);
        ref.current.textContent = "";
        const div = document.createElement("div");
        div.className = "preview-error";
        div.textContent = t("panel.cannotRender", { message });
        ref.current.appendChild(div);
      });
  }, [code]);

  return <div className={className} ref={ref} />;
}
