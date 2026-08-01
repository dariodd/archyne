import { useState } from "react";
import { useGraphStore } from "../store";
import { CodeEditor } from "./CodeEditor";
import { MermaidPreview } from "./MermaidPreview";
import { GraphOutline } from "./GraphOutline";
import { useT } from "../i18n";

export function CodePanel() {
  const code = useGraphStore((s) => s.code);
  const parseError = useGraphStore((s) => s.parseError);
  const warning = useGraphStore((s) => s.warning);
  const setCodeFromEditor = useGraphStore((s) => s.setCodeFromEditor);
  const [tab, setTab] = useState<"code" | "preview" | "outline">("code");
  const t = useT();

  return (
    <section className="code-panel" aria-label={t("panel.mermaidSource")}>
      <div className="tabs" role="tablist" aria-label={t("panel.sourceView")}>
        <button
          className={tab === "code" ? "tab active" : "tab"}
          role="tab"
          id="tab-code"
          aria-selected={tab === "code"}
          aria-controls="panel-code"
          onClick={() => setTab("code")}
        >
          {t("panel.tabCode")}
        </button>
        <button
          className={tab === "preview" ? "tab active" : "tab"}
          role="tab"
          id="tab-preview"
          aria-selected={tab === "preview"}
          aria-controls="panel-preview"
          onClick={() => setTab("preview")}
        >
          {t("panel.tabPreview")}
        </button>
        <button
          className={tab === "outline" ? "tab active" : "tab"}
          role="tab"
          id="tab-outline"
          aria-selected={tab === "outline"}
          aria-controls="panel-outline"
          onClick={() => setTab("outline")}
        >
          {t("panel.tabOutline")}
        </button>
      </div>
      {tab === "code" ? (
        <div id="panel-code" role="tabpanel" aria-labelledby="tab-code" className="tabpanel">
          <CodeEditor value={code} onChange={setCodeFromEditor} />
          {/* Not a live region: these are only rendered on the code tab, so
              announcing from here would go silent whenever the user is on
              Preview or working on the canvas. `StatusAnnouncer` in App.tsx
              is always mounted and owns the announcement. */}
          {parseError && <div className="parse-error">{parseError}</div>}
          {!parseError && warning && <div className="parse-warning">{warning}</div>}
        </div>
      ) : tab === "outline" ? (
        <div
          id="panel-outline"
          role="tabpanel"
          aria-labelledby="tab-outline"
          className="tabpanel outline-panel"
        >
          <GraphOutline />
        </div>
      ) : (
        <div
          id="panel-preview"
          role="tabpanel"
          aria-labelledby="tab-preview"
          className="tabpanel"
        >
          <MermaidPreview code={code} className="preview" />
        </div>
      )}
    </section>
  );
}
