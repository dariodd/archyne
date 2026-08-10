import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { Annotation, Compartment, EditorState, Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { mermaid } from "codemirror-lang-mermaid";
import { oneDark } from "@codemirror/theme-one-dark";
import { useThemeStore } from "../theme";
import { useGraphStore } from "../store";
import { mermaidFallback } from "./mermaidStream";
import { formatDocument, registerEditorView } from "./editorCommands";
import { applyMetaFold, metaFold } from "./metaFold";
import { usePrefs } from "../prefs";
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

/**
 * Type size lives in a compartment so changing it reconfigures the running
 * editor. Rebuilding the view instead would throw away the undo history and
 * the cursor every time somebody pressed Ctrl+=.
 */
const fontSize = new Compartment();

function fontTheme(px: number) {
  return EditorView.theme({
    "&": { fontSize: `${px}px` },
    // The gutter reads as chrome rather than as code, so it stays a step
    // behind — but it has to grow with the text, or the line numbers stop
    // lining up with the lines they number.
    ".cm-gutters": { fontSize: `${Math.max(px - 1.5, 8)}px` },
  });
}

/** Ctrl+= / Ctrl+- / Ctrl+0, as every editor binds them. */
const zoomKeymap = [
  ...["Mod-=", "Mod-+", "Mod-Shift-="].map((key) => ({
    // Three spellings of the same press: which one the browser reports
    // depends on the keyboard layout — on an Italian one `+` is a shifted
    // key and `=` is not where a US layout puts it.
    key,
    run: () => {
      usePrefs.getState().nudgeEditorFontSize(1);
      return true;
    },
  })),
  {
    key: "Mod--",
    run: () => {
      usePrefs.getState().nudgeEditorFontSize(-1);
      return true;
    },
  },
  {
    key: "Mod-0",
    run: () => {
      usePrefs.getState().resetEditorFontSize();
      return true;
    },
  },
  { key: "Shift-Alt-f", run: formatDocument },
];

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
  const editorFontSize = usePrefs((s) => s.editorFontSize);

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          metaFold(),
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
          Prec.highest([
            EditorView.theme({
              "&": { height: "100%", backgroundColor: "transparent" },
              ".cm-scroller": {
                fontFamily: '"Cascadia Code", Consolas, monospace',
                lineHeight: "1.55",
              },
              "&.cm-focused": { outline: "none" },
            }),
            // Same precedence as the theme above and declared after it, so the
            // chosen size wins over the default one either would otherwise set.
            fontSize.of(fontTheme(usePrefs.getState().editorFontSize)),
            keymap.of(zoomKeymap),
          ]),
          // Ctrl+wheel, the other half of the convention. Only with the
          // modifier: a bare wheel over code scrolls it.
          EditorView.domEventHandlers({
            wheel(event) {
              if (!event.ctrlKey && !event.metaKey) return false;
              event.preventDefault();
              usePrefs.getState().nudgeEditorFontSize(event.deltaY < 0 ? 1 : -1);
              return true;
            },
          }),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            if (update.transactions.some((tr) => tr.annotation(fromStore))) return;
            onChangeRef.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    registerEditorView(view);
    applyMetaFold(view);
    return () => {
      view.destroy();
      viewRef.current = null;
      registerEditorView(null);
    };
    // Recreated when the theme or language flips; `value` is synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved, useLib]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: fontSize.reconfigure(fontTheme(editorFontSize)),
    });
  }, [editorFontSize]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
        annotations: fromStore.of(true),
      });
      // Replacing the document drops its folds, and the edit that brought us
      // here was very often a drag rewriting `graph:positions` — so the
      // metadata section would unfold itself every time a node moved.
      applyMetaFold(view);
    }
  }, [value]);

  return <div ref={hostRef} className="code-editor-cm" />;
}
