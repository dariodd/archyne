import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState, Prec } from "@codemirror/state";
import { mermaid } from "codemirror-lang-mermaid";
import { oneDark } from "@codemirror/theme-one-dark";
import { useThemeStore } from "../theme";
import { useGraphStore } from "../store";
import { mermaidFallback } from "./mermaidStream";
import { t } from "../i18n";

/** Dialects codemirror-lang-mermaid actually highlights. */
const LIB_KINDS = new Set(["flowchart", "sequence"]);

/** CodeMirror-based mermaid editor with syntax highlighting. */
export function CodeEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (code: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  // Keep the latest callback without tearing down the editor. Assigned after
  // commit rather than during render — the updateListener below only fires
  // from user input, which is always post-commit.
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  const resolved = useThemeStore((s) => s.resolved);
  const kind = useGraphStore((s) => s.kind);
  const useLib = LIB_KINDS.has(kind);

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          useLib ? mermaid() : mermaidFallback,
          ...(resolved === "dark" ? [oneDark] : []),
          EditorView.lineWrapping,
          // The editor is a `role="textbox"`; without a name a screen reader
          // announces it as an unlabelled edit field.
          EditorView.contentAttributes.of({ "aria-label": t("panel.mermaidSource") }),
          // `Prec.highest` so our background actually wins over oneDark's.
          // It set #282c34, against which oneDark's own coral token measured
          // 4.38:1 — under the 4.5:1 floor. On the app background the same
          // token reaches 5.76:1, so overriding one colour fixes every
          // token at once rather than patching the palette.
          Prec.highest(
            EditorView.theme({
              "&": { height: "100%", fontSize: "12.5px", backgroundColor: "transparent" },
              ".cm-scroller": {
                fontFamily: '"Cascadia Code", Consolas, monospace',
                lineHeight: "1.55",
              },
              "&.cm-focused": { outline: "none" },
            }),
          ),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Recreated when the theme or language flips; `value` is synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved, useLib]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  return <div ref={hostRef} className="code-editor-cm" />;
}
