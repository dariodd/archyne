import { useEffect, useRef, useState } from "react";
import { renderWithMermaid } from "../model/mermaidRender";
import { t } from "../i18n";

/**
 * How many previews have been mounted, ever — the source of an id per
 * component instance.
 *
 * `mermaid.render(id, …)` opens with `getElementById(id)?.remove()`: the id
 * names a scratch element it expects to own, so anything already carrying it
 * is torn out of the page. The sequence number below is per component, so
 * every preview used to start at `preview-1` — and the second one to draw
 * deleted the first one's SVG, leaving a blank white plate behind. Two are on
 * screen together whenever the expanded preview is open over the panel's, and
 * three when a read-only diagram fills the canvas beside the Preview tab.
 */
let previews = 0;

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
  // State rather than a ref: this is read while rendering, and it is only
  // ever set once — the initialiser runs on mount and never again.
  const [instance] = useState(() => ++previews);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    // Renders are async and racy; only the newest one may write to the DOM.
    const seq = ++seqRef.current;
    renderWithMermaid(`preview-${instance}-${seq}`, code)
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
    // `instance` never changes; it is listed because the effect reads it.
  }, [code, instance]);

  return <div className={className} ref={ref} />;
}
