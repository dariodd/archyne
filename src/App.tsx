import { useEffect } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { Toolbar } from "./components/Toolbar";
import { Palette } from "./components/Palette";
import { CanvasView } from "./components/CanvasView";
import { CodePanel } from "./components/CodePanel";
import { Inspector } from "./components/Inspector";
import { loadInitialCode, useGraphStore } from "./store";
import { exportDataUrlForTest } from "./export";
import { useThemeStore } from "./theme";
import { initEmbedBridge, isEmbedded } from "./embed";

export default function App() {
  const applyCode = useGraphStore((s) => s.applyCode);

  useEffect(() => {
    void applyCode(loadInitialCode());
  }, [applyCode]);

  useEffect(() => {
    if (isEmbedded()) initEmbedBridge();
  }, []);

  useEffect(() => {
    // Apply the stored theme, follow OS changes under "system", and
    // re-derive edge colors whenever the resolved theme flips.
    document.documentElement.dataset.theme = useThemeStore.getState().resolved;
    const unsub = useThemeStore.subscribe(() =>
      useGraphStore.getState().refreshEdges(),
    );
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => useThemeStore.getState().sync();
    mq.addEventListener("change", onChange);
    return () => {
      unsub();
      mq.removeEventListener("change", onChange);
    };
  }, []);

  useEffect(() => {
    // Dev-only hooks for browser-driven e2e tests (see tests/e2e-export.mts).
    if (!import.meta.env.DEV) return;
    (window as unknown as Record<string, unknown>).__graphTest = {
      ready: () => {
        const s = useGraphStore.getState();
        return s.nodes.length > 0 && s.nodes.every((n) => n.measured?.width);
      },
      exportPng: () => exportDataUrlForTest(useGraphStore.getState().nodes),
      store: useGraphStore,
      state: () => {
        const s = useGraphStore.getState();
        return {
          kind: s.kind,
          nodes: s.nodes.length,
          edges: s.edges.length,
          parseError: s.parseError,
          warning: s.warning,
        };
      },
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const s = useGraphStore.getState();
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        s.undo();
      } else if (key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        s.redo();
      } else if (key === "c") {
        s.copySelection();
      } else if (key === "v") {
        s.pasteClipboard();
      } else if (key === "a") {
        e.preventDefault();
        s.selectAll();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const booted = useGraphStore((s) => s.booted);

  return (
    <ReactFlowProvider>
      {!booted && (
        <div className="splash">
          <img src="./wordmark-dark.png" alt="Merflow" />
          <div className="splash-sub">loading diagram engine…</div>
        </div>
      )}
      <div className="app">
        <Toolbar />
        <div className="main">
          <Palette />
          <CanvasView />
          <div className="side">
            <CodePanel />
            <Inspector />
          </div>
        </div>
      </div>
    </ReactFlowProvider>
  );
}
