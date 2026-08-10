import {
  codeFolding,
  foldedRanges,
  foldEffect,
  foldService,
  unfoldEffect,
} from "@codemirror/language";
import { Prec, type EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { usePrefs } from "../prefs";
import { t } from "../i18n";

/**
 * The metadata Archyne writes into the file, folded away by default.
 *
 * `%% graph:positions`, `waypoints`, `styles` and `icons` are how a diagram
 * keeps its arrangement in a file that has to stay valid Mermaid — they are
 * written by the app, are never edited by hand, and are long: one line of
 * `graph:icons` can carry a whole imported SVG. Left open they push the
 * diagram's actual source off the screen.
 *
 * Folded, not hidden. The file is the source of truth and the panel shows the
 * file; a section you can open is a section you can check.
 */
const META = /^%%\s*graph:([A-Za-z]+)/;

interface MetaRun {
  from: number;
  to: number;
  /** `positions`, `waypoints`, … — what the folded lines carry. */
  names: string[];
}

function runAt(state: EditorState, lineNumber: number): MetaRun | null {
  const first = state.doc.line(lineNumber);
  if (!META.test(first.text)) return null;
  // Only the first line of a run offers the fold; the rest belong to it.
  if (lineNumber > 1 && META.test(state.doc.line(lineNumber - 1).text)) return null;
  let last = first;
  const names: string[] = [META.exec(first.text)![1]];
  while (last.number < state.doc.lines) {
    const next = state.doc.line(last.number + 1);
    const match = META.exec(next.text);
    if (!match) break;
    names.push(match[1]);
    last = next;
  }
  return { from: first.from, to: last.to, names };
}

/** Every run of metadata lines in the document. */
export function metaRuns(state: EditorState): MetaRun[] {
  const runs: MetaRun[] = [];
  for (let n = 1; n <= state.doc.lines; n++) {
    const run = runAt(state, n);
    if (run) runs.push(run);
  }
  return runs;
}

function isFolded(state: EditorState, run: MetaRun): boolean {
  let found = false;
  foldedRanges(state).between(run.from, run.to, (from, to) => {
    if (from === run.from && to === run.to) found = true;
  });
  return found;
}

/**
 * Bring the metadata sections into line with the preference.
 *
 * Called after anything that replaces the document — the store pushing an
 * edit made on the canvas, a format — because a whole-document change takes
 * the folds with it, and dragging a node rewrites `graph:positions` every
 * time. Without this the section would spring open on the first drag.
 */
export function applyMetaFold(view: EditorView) {
  const folded = usePrefs.getState().metaFolded;
  const effects = metaRuns(view.state)
    .filter((run) => isFolded(view.state, run) !== folded)
    .map((run) => (folded ? foldEffect : unfoldEffect).of({ from: run.from, to: run.to }));
  if (effects.length > 0) view.dispatch({ effects });
}

function placeholder(_view: EditorView, onclick: (event: Event) => void, prepared: unknown) {
  const names = Array.isArray(prepared) ? (prepared as string[]) : [];
  const el = document.createElement("span");
  el.className = "cm-metaFold";
  // The names come out of the document itself, so the visible text needs no
  // translation; what it *is* does, and that goes in the label.
  el.textContent = `%% graph: ${names.join(", ")} …`;
  el.title = t("editor.metaFolded");
  el.setAttribute("aria-label", t("editor.metaFolded"));
  el.onclick = onclick;
  return el;
}

export function metaFold(): Extension {
  return [
    foldService.of((state, lineStart) => {
      const run = runAt(state, state.doc.lineAt(lineStart).number);
      return run && { from: run.from, to: run.to };
    }),
    // Over the folding `basicSetup` configures, so these sections get the
    // placeholder that says what they are rather than a bare ellipsis.
    Prec.highest(
      codeFolding({
        preparePlaceholder: (state, range) =>
          runAt(state, state.doc.lineAt(range.from).number)?.names ?? null,
        placeholderDOM: placeholder,
      }),
    ),
    // Opening or closing the section from the gutter is a preference, not a
    // one-off: the next diagram opens the way you left this one.
    EditorView.updateListener.of((update) => {
      for (const tr of update.transactions) {
        for (const effect of tr.effects) {
          const fold = effect.is(foldEffect);
          if (!fold && !effect.is(unfoldEffect)) continue;
          // Folding a subgraph is not an opinion about the metadata, so the
          // range has to actually be one of these sections.
          const at = Math.min(effect.value.from, tr.state.doc.length);
          if (!META.test(tr.state.doc.lineAt(at).text)) continue;
          usePrefs.getState().setMetaFolded(fold);
        }
      }
    }),
  ];
}
