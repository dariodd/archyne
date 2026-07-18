import { useEffect, useRef, useState } from "react";
import { withMermaid } from "../model/fromMermaid";
import { useGraphStore } from "../store";
import { CodeEditor } from "./CodeEditor";

export function CodePanel() {
  const code = useGraphStore((s) => s.code);
  const parseError = useGraphStore((s) => s.parseError);
  const warning = useGraphStore((s) => s.warning);
  const setCodeFromEditor = useGraphStore((s) => s.setCodeFromEditor);
  const [tab, setTab] = useState<"code" | "preview">("code");
  const previewRef = useRef<HTMLDivElement>(null);
  const renderSeq = useRef(0);

  useEffect(() => {
    if (tab !== "preview" || !previewRef.current) return;
    const seq = ++renderSeq.current;
    withMermaid((mermaid) => mermaid.render(`preview-${seq}`, code))
      .then(({ svg }) => {
        if (seq === renderSeq.current && previewRef.current) {
          previewRef.current.innerHTML = svg;
        }
      })
      .catch((err: unknown) => {
        if (seq === renderSeq.current && previewRef.current) {
          const msg = err instanceof Error ? err.message : String(err);
          previewRef.current.textContent = "";
          const div = document.createElement("div");
          div.className = "preview-error";
          div.textContent = `Cannot render: ${msg}`;
          previewRef.current.appendChild(div);
        }
      });
  }, [tab, code]);

  return (
    <section className="code-panel">
      <div className="tabs">
        <button className={tab === "code" ? "tab active" : "tab"} onClick={() => setTab("code")}>
          Mermaid
        </button>
        <button
          className={tab === "preview" ? "tab active" : "tab"}
          onClick={() => setTab("preview")}
        >
          Preview
        </button>
      </div>
      {tab === "code" ? (
        <>
          <CodeEditor value={code} onChange={setCodeFromEditor} />
          {parseError && <div className="parse-error">{parseError}</div>}
          {!parseError && warning && <div className="parse-warning">{warning}</div>}
        </>
      ) : (
        <div className="preview" ref={previewRef} />
      )}
    </section>
  );
}
