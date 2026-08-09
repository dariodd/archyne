import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { Annotation, EditorState, Prec } from "@codemirror/state";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { mermaid } from "codemirror-lang-mermaid";
import { oneDark } from "@codemirror/theme-one-dark";
import { useThemeStore } from "../theme";
import { useGraphStore } from "../store";
import { mermaidFallback } from "./mermaidStream";
import { t } from "../i18n";

/** Dialects codemirror-lang-mermaid actually highlights. */
const LIB_KINDS = new Set(["flowchart", "sequence"]);

/**
 * The one light-theme token that does not clear WCAG AA.
 *
 * CodeMirror's default highlight style paints `typeName` and `namespace` —
 * in a Mermaid document, the keyword naming the diagram — `#008855`. That
 * measures 4.05:1 on the active line and 4.18:1 on the editor background,
 * both under the 4.5:1 floor for body text. `#00704a` is the same hue two
 * steps down and reaches 5.52:1 and 5.70:1. Every other token in the light
 * theme already runs between 6.96:1 and 12.11:1, so one colour is the whole
 * failure and the rest of the default palette is left alone.
 *
 * `Prec.highest` because `basicSetup` installs the default style, and the
 * first highlighter that has something to say about a tag wins.
 */
const lightContrastFix = Prec.highest(
  syntaxHighlighting(
    HighlightStyle.define([{ tag: [tags.typeName, tags.namespace], color: "#00704a" }]),
  ),
);

/**
 * Marks the edits this component makes to catch up with the store, so they
 * are not reported back as if the user had typed them.
 *
 * Without it the two ends chase each other: dragging a node rewrites the
 * positions comment, the effect below pushes that text into the editor, the
 * editor calls `onChange`, and the store treats it as typing — which records
 * an undo entry and schedules a re-parse 400ms later. Re-parsing the same
 * code is usually invisible, but it rebuilds every node from the source, so
 * a drag still in progress is thrown away mid-gesture.
 */
const fromStore = Annotation.define<boolean>();

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
          ...(resolved === "dark" ? [oneDark] : [lightContrastFix]),
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
            if (!update.docChanged) return;
            if (update.transactions.some((tr) => tr.annotation(fromStore))) return;
            onChangeRef.current(update.state.doc.toString());
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
        annotations: fromStore.of(true),
      });
    }
  }, [value]);

  return <div ref={hostRef} className="code-editor-cm" />;
}
