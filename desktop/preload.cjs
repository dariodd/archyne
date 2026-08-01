/**
 * Bridge between the sandboxed renderer and the main process.
 *
 * The renderer previously received an opened file as a URL query string
 * (`?code=…`), which broke on large diagrams and threw away the file's path,
 * so open-edit-save could never write back to the original. This exposes a
 * narrow, explicit API instead: read the file we were launched with, and
 * write back to a known path.
 *
 * Only these four calls cross the boundary — `contextIsolation` and
 * `sandbox` stay on.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("archyne", {
  /** File passed on the command line, if any. Resolves once, at startup. */
  openedFile: () => ipcRenderer.invoke("archyne:opened-file"),

  /**
   * A second instance handed us a file, or the user used the app menu.
   * @param {(file: { path: string, content: string }) => void} callback
   */
  onOpenFile: (callback) => {
    ipcRenderer.on("archyne:open-file", (_event, file) => callback(file));
  },

  /** Native open dialog. Returns `{ path, content }`, or null if cancelled. */
  showOpen: () => ipcRenderer.invoke("archyne:show-open"),

  /**
   * Native save dialog. Returns the chosen path, or null if cancelled.
   * @param {string} defaultPath
   * @param {string} content
   */
  showSave: (defaultPath, content) =>
    ipcRenderer.invoke("archyne:show-save", { defaultPath, content }),

  /**
   * Overwrite a path the user has already chosen.
   * @param {string} path
   * @param {string} content
   */
  writeFile: (path, content) => ipcRenderer.invoke("archyne:write-file", { path, content }),
});
