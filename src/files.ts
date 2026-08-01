import { create } from "zustand";
import { useGraphStore } from "./store";

/**
 * Opening and saving `.mmd` files.
 *
 * Three backends, picked in order of fidelity:
 *
 * 1. **Desktop** — the Electron preload bridge, which knows the real path of
 *    a file opened by double-click and can write straight back to it.
 * 2. **File System Access API** — Chromium browsers, where Save writes back
 *    to the file the user opened rather than dropping a new copy in
 *    Downloads.
 * 3. **Download + `<input type=file>`** — everywhere else. Open reads a copy
 *    and Save produces a new download; there is no round-trip.
 *
 * Before this, every surface used backend 3: `Save .mmd` always wrote a fresh
 * `diagram.mmd` to Downloads, so open-edit-save never returned to the
 * original file.
 */

/** Shape of the bridge exposed by `desktop/preload.cjs`. */
interface DesktopBridge {
  openedFile(): Promise<{ path: string; content: string } | null>;
  onOpenFile(cb: (file: { path: string; content: string }) => void): void;
  showOpen(): Promise<{ path: string; content: string } | null>;
  showSave(defaultPath: string, content: string): Promise<string | null>;
  writeFile(path: string, content: string): Promise<void>;
}

function desktop(): DesktopBridge | null {
  return (globalThis as { archyne?: DesktopBridge }).archyne ?? null;
}

function supportsFsAccess(): boolean {
  return typeof globalThis.showSaveFilePicker === "function";
}

const MMD_TYPES = [
  { description: "Mermaid diagram", accept: { "text/plain": [".mmd", ".mermaid", ".txt"] } },
];

interface FileState {
  /** Display name of the open file, or null for an unsaved scratch diagram. */
  name: string | null;
  /** Desktop absolute path, when the desktop bridge is in play. */
  path: string | null;
  /** Browser handle, when the File System Access API is in play. */
  handle: FileSystemFileHandle | null;
  /** Code as it was last written to (or read from) disk. */
  savedCode: string | null;

  open: () => Promise<void>;
  save: () => Promise<void>;
  saveAs: () => Promise<void>;
  /** Adopt a file the desktop shell opened for us. */
  adopt: (file: { path: string; content: string }) => Promise<void>;
}

/** True when the diagram differs from what is on disk. */
export function isDirty(): boolean {
  const { savedCode } = useFileStore.getState();
  if (savedCode === null) return false; // nothing opened yet — nothing to lose
  return savedCode !== useGraphStore.getState().code;
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

/** Last-resort download, for browsers without the File System Access API. */
function download(name: string, code: string) {
  const blob = new Blob([code], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function writeHandle(handle: FileSystemFileHandle, code: string) {
  const writable = await handle.createWritable();
  await writable.write(code);
  await writable.close();
}

export const useFileStore = create<FileState>((set, get) => ({
  name: null,
  path: null,
  handle: null,
  savedCode: null,

  adopt: async (file) => {
    await useGraphStore.getState().applyCode(file.content, { record: true });
    set({ name: basename(file.path), path: file.path, handle: null, savedCode: file.content });
  },

  open: async () => {
    const bridge = desktop();
    if (bridge) {
      const file = await bridge.showOpen();
      if (file) await get().adopt(file);
      return;
    }

    if (supportsFsAccess()) {
      let handle: FileSystemFileHandle;
      try {
        [handle] = await globalThis.showOpenFilePicker({ types: MMD_TYPES });
      } catch {
        return; // user cancelled
      }
      const content = await (await handle.getFile()).text();
      await useGraphStore.getState().applyCode(content, { record: true });
      set({ name: handle.name, path: null, handle, savedCode: content });
      return;
    }

    // No picker API: the caller falls back to a hidden <input type=file>.
    throw new Error("no-picker");
  },

  save: async () => {
    const { path, handle } = get();
    const code = useGraphStore.getState().code;
    const bridge = desktop();

    if (bridge && path) {
      await bridge.writeFile(path, code);
      set({ savedCode: code });
      return;
    }
    if (handle) {
      await writeHandle(handle, code);
      set({ savedCode: code });
      return;
    }
    await get().saveAs();
  },

  saveAs: async () => {
    const code = useGraphStore.getState().code;
    const suggested = get().name ?? "diagram.mmd";
    const bridge = desktop();

    if (bridge) {
      const path = await bridge.showSave(suggested, code);
      if (path) set({ name: basename(path), path, handle: null, savedCode: code });
      return;
    }

    if (supportsFsAccess()) {
      let handle: FileSystemFileHandle;
      try {
        handle = await globalThis.showSaveFilePicker({
          suggestedName: suggested,
          types: MMD_TYPES,
        });
      } catch {
        return; // user cancelled
      }
      await writeHandle(handle, code);
      set({ name: handle.name, path: null, handle, savedCode: code });
      return;
    }

    download(suggested, code);
    // A download is fire-and-forget: the browser never tells us where it
    // landed, so this is the one path that cannot track "saved" state.
    set({ savedCode: code });
  },
}));

/** Pick up a file the desktop shell was launched with, or opened later. */
export function initDesktopFiles(): void {
  const bridge = desktop();
  if (!bridge) return;
  void bridge.openedFile().then((file) => {
    if (file) void useFileStore.getState().adopt(file);
  });
  bridge.onOpenFile((file) => void useFileStore.getState().adopt(file));
}
