import { create } from "zustand";
import { useGraphStore, SAMPLE, NEW_DIAGRAM } from "./store";
import { pickFile, useFileStore, type PickedFile } from "./files";

import type { DiagramKind } from "./model/types";
import {
  activeDoc,
  blankDoc,
  EMBEDDED,
  patchDoc,
  readDocCode,
  removeDocCode,
  useWorkspace,
  writeDocCode,
  writeIndex,
  type DocMeta,
} from "./workspace";

/**
 * Operations on the set of open documents.
 *
 * These live apart from `workspace.ts` on purpose: that module is state and
 * storage with no dependencies, which is what lets `store.ts` import it.
 * Switching a document has to move three things at once — the source, the
 * file binding and the undo history — so the orchestration sits here, above
 * all three stores.
 */

/** Everything that belongs to a document but is held elsewhere while active. */
function captureActive(): void {
  const { activeId } = useWorkspace.getState();
  if (!activeId) return;
  const { path, handle, savedCode, name } = useFileStore.getState();
  writeDocCode(activeId, useGraphStore.getState().code);
  patchDoc(activeId, {
    path,
    handle,
    savedCode,
    // A file-backed document takes its name from the file; a scratch one
    // keeps whatever it was called.
    ...(name ? { name } : {}),
  });
}

/** Put a document's file binding back where the rest of the app looks for it. */
function adoptBinding(doc: DocMeta): void {
  const fileBacked = Boolean(doc.path || doc.handle);
  useFileStore.setState({
    // A scratch document has no file name to show in the toolbar; the
    // workspace menu is where its label lives.
    name: fileBacked ? doc.name : null,
    path: doc.path,
    handle: doc.handle,
    savedCode: doc.savedCode,
  });
}

/** Show a document, saving whatever is on screen first. */
export async function switchTo(id: string): Promise<void> {
  const { activeId, docs } = useWorkspace.getState();
  if (id === activeId) return;
  const target = docs.find((d) => d.id === id);
  if (!target) return;

  captureActive();
  useWorkspace.setState({ activeId: id });
  writeIndex(useWorkspace.getState());

  useGraphStore.getState().swapHistory(activeId, id);
  adoptBinding(target);
  await useGraphStore.getState().applyCode(readDocCode(id) ?? SAMPLE, { record: false });
}

/** Create a document and switch to it. Returns its id. */
export async function createDoc(kind?: DiagramKind): Promise<string> {
  captureActive();
  const doc = blankDoc(nextUntitledName());
  const code = kind ? NEW_DIAGRAM[kind] : SAMPLE;
  writeDocCode(doc.id, code);

  const previousId = useWorkspace.getState().activeId;
  useWorkspace.setState((s) => ({ docs: [...s.docs, doc], activeId: doc.id }));
  writeIndex(useWorkspace.getState());

  useGraphStore.getState().swapHistory(previousId, doc.id);
  adoptBinding(doc);
  await useGraphStore.getState().applyCode(code, { forceLayout: Boolean(kind), record: false });
  return doc.id;
}

/** "Untitled", then "Untitled 2", "Untitled 3" — whichever is free. */
function nextUntitledName(): string {
  const taken = new Set(useWorkspace.getState().docs.map((d) => d.name));
  if (!taken.has("Untitled")) return "Untitled";
  for (let n = 2; ; n++) {
    const candidate = `Untitled ${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export function renameDoc(id: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  patchDoc(id, { name: trimmed });
  if (id === useWorkspace.getState().activeId && useFileStore.getState().name) {
    // Keep the toolbar's name in step for a file-backed document. The file
    // on disk is untouched: renaming here is a label, not a move.
    useFileStore.setState({ name: trimmed });
  }
}

/**
 * Copy a document, including whatever is unsaved in it.
 *
 * The copy is deliberately not file-backed: it would otherwise share a path
 * with its original, and the first Save would overwrite the file the user
 * duplicated to avoid touching.
 */
export async function duplicateDoc(id: string): Promise<string> {
  if (id === useWorkspace.getState().activeId) captureActive();
  const source = useWorkspace.getState().docs.find((d) => d.id === id);
  if (!source) return "";

  const copy = blankDoc(`${source.name} copy`);
  writeDocCode(copy.id, readDocCode(id) ?? SAMPLE);
  useWorkspace.setState((s) => ({ docs: [...s.docs, copy] }));
  writeIndex(useWorkspace.getState());
  await switchTo(copy.id);
  return copy.id;
}

/**
 * Remove a document. Deleting the last one leaves a fresh empty document
 * rather than an empty workspace, because there is nowhere else to go.
 */
export async function deleteDoc(id: string): Promise<void> {
  const { docs, activeId } = useWorkspace.getState();
  if (!docs.some((d) => d.id === id)) return;

  const remaining = docs.filter((d) => d.id !== id);
  removeDocCode(id);

  if (remaining.length === 0) {
    useWorkspace.setState({ docs: [], activeId: "" });
    await createDoc();
    return;
  }

  useWorkspace.setState({ docs: remaining });
  if (id === activeId) {
    // Fall through to the most recently touched of what is left.
    const next = [...remaining].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    useWorkspace.setState({ activeId: "" }); // so switchTo does not early-return
    await switchTo(next.id);
  } else {
    writeIndex(useWorkspace.getState());
  }
}

/** Documents for a picker: most recently edited first, active one marked. */
export function documentList(): Array<DocMeta & { active: boolean }> {
  const { docs, activeId } = useWorkspace.getState();
  return [...docs]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((d) => ({ ...d, active: d.id === activeId }));
}

/**
 * Adopt a file opened from disk into the *current* document when it is an
 * untouched scratch, or into a new one otherwise.
 *
 * Opening a file used to replace whatever was on screen. With a workspace
 * that is no longer the obvious behaviour: someone with unsaved work open
 * expects a second file to arrive beside it, not on top of it.
 */
export function shouldOpenInNewDoc(): boolean {
  if (EMBEDDED) return false;
  if (!activeDoc()) return false;

  // The live binding for the document on screen is in `useFileStore`, not in
  // its metadata — the metadata only catches up when you switch away. Reading
  // the stale copy meant a second Open saw a pristine scratch and replaced a
  // document that was already backed by a file.
  const { path, handle, savedCode } = useFileStore.getState();
  const isScratch = !path && !handle && savedCode === null;
  const code = useGraphStore.getState().code;
  return !(isScratch && (code === SAMPLE || code.trim() === ""));
}

/**
 * Which document dialog is open, if any.
 *
 * Tabs own switching, closing and creating — the gestures you make on a tab
 * itself. Renaming and duplicating are rarer and live in the toolbar's
 * overflow menu, with the other occasional actions. The dialogs are rendered
 * beside the tabs, so this is how the menu asks for one.
 */
export const useDocDialogs = create<{ renaming: string | null; deleting: string | null }>(
  () => ({ renaming: null, deleting: null }),
);

/** The document entries for the toolbar's overflow panel. */
export function documentMenuActions() {
  return {
    rename: () => useDocDialogs.setState({ renaming: useWorkspace.getState().activeId }),
    duplicate: () => void duplicateDoc(useWorkspace.getState().activeId),
  };
}

/**
 * Put an opened file where it belongs.
 *
 * Opening used to replace whatever was on screen, which was the only option
 * when there was one document. With a workspace that is the wrong default:
 * someone with work in progress expects a second file to arrive beside it,
 * not on top of it. A pristine scratch document is the exception — landing
 * in it is what "open a file" means when nothing has been started.
 */
async function placeFile(file: PickedFile): Promise<void> {
  if (shouldOpenInNewDoc()) await createDoc();

  await useGraphStore.getState().applyCode(file.content, { record: true });
  useFileStore.setState({
    name: file.name,
    path: file.path,
    handle: file.handle,
    savedCode: file.content,
  });
  // The tab takes the file's name, not "Untitled".
  patchDoc(useWorkspace.getState().activeId, {
    name: file.name,
    path: file.path,
    handle: file.handle,
    savedCode: file.content,
  });
}

/**
 * Place a file read some other way — the hidden `<input type=file>` that
 * browsers without a picker fall back to.
 *
 * There is no path or handle to bind: that fallback cannot write back, so
 * Save becomes Save-as. What matters is that it goes through the same
 * placement as everything else. It did not, and on Firefox and Safari
 * opening a file still replaced whatever was on screen.
 */
export async function openContentHere(name: string, content: string): Promise<void> {
  await placeFile({ name, content, path: null, handle: null });
}

/** Show the picker, then place the result. Throws `no-picker` as before. */
export async function openFileHere(): Promise<void> {
  const picked = await pickFile();
  if (picked) await placeFile(picked);
}

/**
 * A file handed over by the desktop shell, placed the same way.
 *
 * Returns the promise rather than swallowing it: the shell has nothing to
 * wait for, but anything sequencing edits — tests, above all — needs a way
 * to know the file has actually been parsed.
 */
export function adoptFileHere(file: { path: string; content: string }): Promise<void> {
  // Either separator: the desktop shell hands over Windows paths too.
  const name = file.path.split(/[\\/]/).pop() || file.path;
  return placeFile({ name, content: file.content, path: file.path, handle: null });
}

/**
 * Every document with edits that are not on disk — not just the one on
 * screen.
 *
 * The unsaved-changes guard used to ask `isDirty()`, which only ever knew
 * about the active document. With a workspace that quietly stopped being the
 * question: closing the tab with unsaved work in the *other* four documents
 * warned about none of them.
 *
 * A document with no `savedCode` has never been written to a file. It is a
 * scratch diagram, autosaved to localStorage, and warning about it would be
 * noise — which is the same rule `isDirty()` already used.
 */
export function unsavedDocuments(): DocMeta[] {
  const { docs, activeId } = useWorkspace.getState();
  const active = useFileStore.getState();
  return docs.filter((doc) => {
    const saved = doc.id === activeId ? active.savedCode : doc.savedCode;
    if (saved === null) return false;
    const current = doc.id === activeId ? useGraphStore.getState().code : readDocCode(doc.id);
    return current !== null && current !== saved;
  });
}
