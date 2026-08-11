import { create } from "zustand";
import { isEmbedded } from "./host";

/**
 * The set of diagrams a user is working on, and which one is on screen.
 *
 * Before this there was one `graph:code` key in localStorage, so opening a
 * second diagram replaced the first and working on five meant five browser
 * tabs. That is the first thing anyone hits who uses Archyne for real work
 * rather than for one drawing.
 *
 * Two deliberate choices in how this is stored:
 *
 *   - **Each document's source lives in its own key** (`graph:doc:<id>`),
 *     with only metadata in the index. Every keystroke debounce writes one
 *     small key instead of rewriting the whole workspace, and a quota error
 *     while saving one diagram cannot take the others down with it.
 *   - **The file binding is per document.** A document opened from disk keeps
 *     its own path or handle, so switching away and back still saves in
 *     place. `useFileStore` holds the binding for whichever document is
 *     active; this store swaps it on the way in and out.
 *
 * In embed mode none of this applies: the host owns the data, there is one
 * document, and nothing touches localStorage.
 */

const INDEX_KEY = "graph:workspace";
const DOC_PREFIX = "graph:doc:";
/** The single-document key this replaces. Read once, to migrate, then removed. */
const LEGACY_KEY = "graph:code";
const INDEX_VERSION = 1;

/**
 * In embed mode the host owns the data — never touch localStorage.
 *
 * This used to read `?embed=1` itself, which was the whole of embedding until
 * a VS Code webview became the second kind: there is no query string to put
 * the flag in there, so the check silently answered no and Archyne wrote the
 * host's file into its own storage — the copy it would then show, briefly,
 * the next time it opened. One predicate now answers for both.
 */
export const EMBEDDED = isEmbedded();

/**
 * What is known about a document without loading its source.
 *
 * The file-binding fields mirror `useFileStore`: `handle` is deliberately not
 * persisted, because a `FileSystemFileHandle` does not survive a reload
 * through JSON. A reloaded document keeps its name and still opens; it simply
 * needs a Save-as the first time, which is what happened before this existed
 * too.
 */
export interface DocMeta {
  id: string;
  /** Display name. A file-backed document shows its basename. */
  name: string;
  /** Last edit, for ordering the list most-recent-first. */
  updatedAt: number;
  /** Desktop absolute path, when the desktop bridge opened this document. */
  path: string | null;
  /** Browser handle, when the File System Access API opened it. Not persisted. */
  handle: FileSystemFileHandle | null;
  /** Source as last written to (or read from) disk; null for a scratch document. */
  savedCode: string | null;
}

interface StoredIndex {
  v: number;
  activeId: string;
  docs: Array<Omit<DocMeta, "handle">>;
}

export interface WorkspaceState {
  docs: DocMeta[];
  activeId: string;
}

function newId(): string {
  // Enough to not collide within one browser profile; this is not a secret.
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function readDocCode(id: string): string | null {
  try {
    return localStorage.getItem(DOC_PREFIX + id);
  } catch {
    return null;
  }
}

export function writeDocCode(id: string, code: string): void {
  if (EMBEDDED) return;
  try {
    localStorage.setItem(DOC_PREFIX + id, code);
  } catch {
    // Storage unavailable or full — persistence is best-effort, as before.
  }
}

function removeDocCode(id: string): void {
  try {
    localStorage.removeItem(DOC_PREFIX + id);
  } catch {
    // nothing to do
  }
}

function writeIndex(state: WorkspaceState): void {
  if (EMBEDDED) return;
  const stored: StoredIndex = {
    v: INDEX_VERSION,
    activeId: state.activeId,
    // `handle` is dropped: a FileSystemFileHandle does not survive JSON.
    docs: state.docs.map(({ handle: _handle, ...rest }) => rest),
  };
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(stored));
  } catch {
    // best-effort
  }
}

function blankDoc(name: string): DocMeta {
  return {
    id: newId(),
    name,
    updatedAt: Date.now(),
    path: null,
    handle: null,
    savedCode: null,
  };
}

/**
 * Build the initial workspace, migrating a pre-workspace diagram if one is
 * there. The migration is one-way and deliberate: the old key is removed
 * only after the document has been written under its new one, so an
 * interrupted migration leaves the diagram readable rather than lost.
 */
export function loadWorkspace(fallbackCode: string): { state: WorkspaceState; code: string } {
  if (EMBEDDED) {
    const doc = blankDoc("Untitled");
    return { state: { docs: [doc], activeId: doc.id }, code: fallbackCode };
  }

  let stored: StoredIndex | null = null;
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (raw) stored = JSON.parse(raw) as StoredIndex;
  } catch {
    // Malformed index: fall through and start fresh rather than fail to boot.
  }

  if (stored?.docs?.length && stored.v === INDEX_VERSION) {
    const docs: DocMeta[] = stored.docs.map((d) => ({ ...d, handle: null }));
    const activeId = docs.some((d) => d.id === stored.activeId) ? stored.activeId : docs[0].id;
    return { state: { docs, activeId }, code: readDocCode(activeId) ?? fallbackCode };
  }

  // No workspace yet. Adopt a single-document diagram if one is there.
  let legacy: string | null = null;
  try {
    legacy = localStorage.getItem(LEGACY_KEY);
  } catch {
    // no storage
  }

  const doc = blankDoc("Untitled");
  const code = legacy ?? fallbackCode;
  const state: WorkspaceState = { docs: [doc], activeId: doc.id };
  writeDocCode(doc.id, code);
  writeIndex(state);
  if (legacy !== null) {
    try {
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      // The document is already saved under its new key; leaving the old one
      // behind is untidy, not harmful.
    }
  }
  return { state, code };
}

export const useWorkspace = create<WorkspaceState>(() => ({
  docs: [],
  activeId: "",
}));

/** The active document's metadata. Never null once the store is initialised. */
export function activeDoc(): DocMeta | undefined {
  const { docs, activeId } = useWorkspace.getState();
  return docs.find((d) => d.id === activeId);
}

/** Replace the metadata of one document, then persist the index. */
export function patchDoc(id: string, patch: Partial<Omit<DocMeta, "id">>): void {
  const next = useWorkspace.getState().docs.map((d) => (d.id === id ? { ...d, ...patch } : d));
  useWorkspace.setState({ docs: next });
  writeIndex(useWorkspace.getState());
}

/** Note that the active document changed, for the most-recent-first ordering. */
export function touchActive(): void {
  const { activeId } = useWorkspace.getState();
  if (activeId) patchDoc(activeId, { updatedAt: Date.now() });
}

export { readDocCode, removeDocCode, writeIndex, blankDoc, INDEX_KEY, DOC_PREFIX, LEGACY_KEY };
