import { useRef, useState } from "react";
import { useGraphStore } from "../store";
import { useThemeStore, type ThemeChoice } from "../theme";
import { ExportDialog } from "./ExportDialog";
import { AboutDialog } from "./AboutDialog";
import type { DiagramKind, Direction } from "../model/types";

const KIND_LABELS: Record<DiagramKind, string> = {
  flowchart: "Flowchart",
  state: "State diagram",
  er: "ER diagram",
  class: "Class diagram",
  sequence: "Sequence diagram",
  architecture: "Architecture",
  c4: "C4 model",
};

export function Toolbar() {
  const direction = useGraphStore((s) => s.direction);
  const kind = useGraphStore((s) => s.kind);
  const setDirection = useGraphStore((s) => s.setDirection);
  const runAutoLayout = useGraphStore((s) => s.runAutoLayout);
  const newDiagram = useGraphStore((s) => s.newDiagram);
  const applyCode = useGraphStore((s) => s.applyCode);
  const undo = useGraphStore((s) => s.undo);
  const redo = useGraphStore((s) => s.redo);
  const canUndo = useGraphStore((s) => s.canUndo);
  const canRedo = useGraphStore((s) => s.canRedo);
  const fileRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const themeChoice = useThemeStore((s) => s.choice);
  const setTheme = useThemeStore((s) => s.setTheme);

  const save = () => {
    const blob = new Blob([useGraphStore.getState().code], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "diagram.mmd";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(useGraphStore.getState().code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <header className="toolbar">
      <button className="brand-button" title="About & licenses" onClick={() => setShowAbout(true)}>
        <img src="./logo.png" alt="" className="brand-logo" />
        <span className="brand">merflow</span>
      </button>
      <span className="brand-sub">visual mermaid editor</span>
      <span className="kind-badge">{KIND_LABELS[kind]}</span>
      <div className="toolbar-spacer" />
      {kind !== "sequence" && kind !== "architecture" && kind !== "c4" && (
        <label className="toolbar-field">
          Direction
          <select
            value={direction === "TD" ? "TB" : direction}
            onChange={(e) => setDirection(e.target.value as Direction)}
          >
            <option value="TB">Top → Down</option>
            <option value="LR">Left → Right</option>
            <option value="BT">Bottom → Up</option>
            <option value="RL">Right → Left</option>
          </select>
        </label>
      )}
      <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
        ↶
      </button>
      <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)">
        ↷
      </button>
      <button onClick={() => void runAutoLayout()}>Auto-layout</button>
      <select
        value=""
        onChange={(e) => {
          if (e.target.value) newDiagram(e.target.value as DiagramKind);
          e.target.value = "";
        }}
      >
        <option value="" disabled>
          New…
        </option>
        {(Object.keys(KIND_LABELS) as DiagramKind[]).map((k) => (
          <option key={k} value={k}>
            {KIND_LABELS[k]}
          </option>
        ))}
      </select>
      <button onClick={() => fileRef.current?.click()}>Open</button>
      <button onClick={save}>Save .mmd</button>
      <button onClick={() => setShowExport(true)}>Export…</button>
      <select
        value={themeChoice}
        title="Theme"
        onChange={(e) => setTheme(e.target.value as ThemeChoice)}
      >
        <option value="dark">🌙 Dark</option>
        <option value="light">☀ Light</option>
        <option value="system">🖥 System</option>
      </select>
      {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
      {showAbout && <AboutDialog onClose={() => setShowAbout(false)} />}
      <button onClick={() => void copy()}>{copied ? "Copied!" : "Copy code"}</button>
      <input
        ref={fileRef}
        type="file"
        accept=".mmd,.txt,.md"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) await applyCode(await file.text(), { record: true });
          e.target.value = "";
        }}
      />
    </header>
  );
}
