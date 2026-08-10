import type { Command, EditorView } from "@codemirror/view";
import { formatMermaid } from "../format";
import { useGraphStore } from "../store";
import { applyMetaFold } from "./metaFold";

/**
 * Commands that act on the Mermaid editor from outside it.
 *
 * Their own module rather than exports from `CodeEditor`: the Format button
 * and the command palette both need them, and a file that exports a
 * component plus loose functions loses hot reload.
 *
 * There is only ever one editor, so the view is registered here on mount
 * instead of being threaded through the panel as a ref.
 */
let activeView: EditorView | null = null;

export function registerEditorView(view: EditorView | null) {
  activeView = view;
}

/**
 * Reindent the document in place.
 *
 * A whole-document change rather than a fresh state, so it lands as one undo
 * entry, and the cursor is carried through it — formatting while typing must
 * not send you back to line 1.
 */
export const formatDocument: Command = (view) => {
  const current = view.state.doc.toString();
  const formatted = formatMermaid(current);
  if (formatted === current) return false;
  const head = view.state.selection.main.head;
  view.dispatch({
    changes: { from: 0, to: current.length, insert: formatted },
    selection: { anchor: Math.min(head, formatted.length) },
    scrollIntoView: true,
  });
  // The rewrite took the folds with it.
  applyMetaFold(view);
  return true;
};

/**
 * Format whatever the user is looking at.
 *
 * Through the editor when it is mounted, so the cursor survives; through the
 * store when it is not — the Preview and Outline tabs unmount it, and a
 * command should not depend on which tab happens to be open.
 */
export function formatActiveEditor(): boolean {
  if (activeView) return formatDocument(activeView);
  const store = useGraphStore.getState();
  const formatted = formatMermaid(store.code);
  if (formatted === store.code) return false;
  store.setCodeFromEditor(formatted);
  return true;
}
