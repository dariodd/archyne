/**
 * Noticing that a file changed underneath us.
 *
 * The MCP server writes `.mmd` files straight to disk, so an agent asked to
 * restructure a diagram edits the same file the user has open. Without this
 * the editor keeps showing the version it read at open time, and the next
 * save overwrites the agent's work without either side being told.
 *
 * **Polling, not watching.** The browser has no filesystem notification API —
 * a `FileSystemFileHandle` can only be asked how old the file is. Doing the
 * same thing over the desktop bridge keeps one mechanism and one set of
 * semantics instead of two that drift apart, and a `stat` every two seconds
 * costs nothing next to what the editor does per keystroke.
 *
 * **Nothing is ever overwritten.** A document with unsaved changes is left
 * exactly as it is and the user is told; only a document that matches what
 * was last read from disk is refreshed in place.
 */
import { readDocCode, useWorkspace, writeDocCode, patchDoc } from "./workspace";
import { useGraphStore } from "./store";
import { desktopBridge, useFileStore } from "./files";
import { toast } from "./toast";

/** What the two backends have in common: a path or a handle. */
export interface Binding {
  path: string | null;
  handle: FileSystemFileHandle | null;
}

export interface DiskRead {
  /** Modification time, in epoch milliseconds. */
  stamp: number;
  content: string;
}

/**
 * Read the file behind a binding, but only if it is newer than `since`.
 *
 * Returns null when there is nothing to read, nothing has changed, or the
 * file cannot be reached — a file being written to, moved or deleted is a
 * normal thing to catch mid-poll, not something to report.
 */
export async function readIfChanged(b: Binding, since: number): Promise<DiskRead | null> {
  try {
    if (b.handle) {
      const file = await b.handle.getFile();
      if (file.lastModified <= since) return null;
      return { stamp: file.lastModified, content: await file.text() };
    }
    const bridge = desktopBridge();
    if (b.path && bridge?.statFile && bridge.readFile) {
      const stat = await bridge.statFile(b.path);
      if (!stat || stat.mtimeMs <= since) return null;
      const content = await bridge.readFile(b.path);
      return content === null ? null : { stamp: stat.mtimeMs, content };
    }
  } catch {
    // Unreadable right now. The next poll asks again.
  }
  return null;
}

/**
 * The newest modification time seen per document.
 *
 * This is what keeps a conflict from being announced every two seconds: the
 * stamp moves on whether or not the change could be applied. What it is
 * deliberately *not* used for is suppressing the first pass — comparing the
 * text against what was last read from disk already covers opening a file,
 * and skipping the first pass would miss a file rewritten in the two seconds
 * after it was opened, or while the app was closed.
 */
const stamps = new Map<string, number>();

/** Forget a document, so closing and reopening a file starts clean. */
export function forgetWatched(docId: string): void {
  stamps.delete(docId);
}

/** Only used by tests, which need each case to start from nothing. */
export function resetWatched(): void {
  stamps.clear();
}

/**
 * One pass over every file-backed document.
 *
 * Exported so a test can drive it directly; the interval below is the only
 * other caller.
 */
export async function pollDisk(): Promise<void> {
  const { docs, activeId } = useWorkspace.getState();
  for (const doc of docs) {
    if (!doc.path && !doc.handle) continue;

    const active = doc.id === activeId;
    // The active document's binding lives in the file store, which is the
    // one that moves when the user saves; `DocMeta` catches up afterwards.
    const binding: Binding = active
      ? { path: useFileStore.getState().path, handle: useFileStore.getState().handle }
      : { path: doc.path, handle: doc.handle };

    const changed = await readIfChanged(binding, stamps.get(doc.id) ?? 0);
    if (!changed) continue;
    stamps.set(doc.id, changed.stamp);

    const savedCode = active ? useFileStore.getState().savedCode : doc.savedCode;
    // Our own write, or a change that produced identical text.
    if (changed.content === savedCode) continue;

    const local = active ? useGraphStore.getState().code : readDocCode(doc.id);
    if (local !== null && savedCode !== null && local !== savedCode) {
      toast("watch.conflict", "error", { name: doc.name });
      continue;
    }

    if (active) {
      await useGraphStore.getState().applyCode(changed.content, { record: true });
      useFileStore.setState({ savedCode: changed.content });
    } else {
      writeDocCode(doc.id, changed.content);
    }
    patchDoc(doc.id, { savedCode: changed.content });
    toast("watch.reloaded", "info", { name: doc.name });
  }
}

/** How often to ask. Fast enough to feel live, slow enough to be free. */
export const POLL_MS = 2000;

/**
 * Start polling; returns the stop function.
 *
 * Paused while the tab is hidden — a background tab cannot show the user
 * anything, and waking a laptop to a queue of missed reloads helps nobody.
 * The first poll after becoming visible again catches up in one step.
 */
export function watchDisk(): () => void {
  let running = false;
  const tick = () => {
    if (running || document.visibilityState !== "visible") return;
    running = true;
    void pollDisk().finally(() => {
      running = false;
    });
  };
  const handle = setInterval(tick, POLL_MS);
  document.addEventListener("visibilitychange", tick);
  return () => {
    clearInterval(handle);
    document.removeEventListener("visibilitychange", tick);
  };
}
