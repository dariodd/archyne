/**
 * Archyne desktop shell: a thin Electron window around the static build.
 * Everything still runs locally in the renderer — no backend, no network.
 */
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const fsp = require("node:fs/promises");

/**
 * .mmd file passed on the command line (double-click / "open with").
 * @param {string[]} argv
 * @returns {string | undefined}
 */
function fileArg(argv) {
  return argv.find((a) => a.toLowerCase().endsWith(".mmd") && fs.existsSync(a));
}

/**
 * File the app was launched with, handed to the renderer over IPC once it
 * asks. Passing it through the URL — as this used to — broke on large
 * diagrams and lost the path, so saving could never write back to it.
 * @type {string | undefined}
 */
let pendingFile;

const FILTERS = [
  { name: "Mermaid diagram", extensions: ["mmd", "mermaid"] },
  { name: "All files", extensions: ["*"] },
];

/** @param {string} [openFile] */
function createWindow(openFile) {
  if (openFile) pendingFile = openFile;

  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    // The layout now collapses the palette and side panel into drawers below
    // 900px, so the window no longer has to stay that wide to be usable.
    minWidth: 680,
    minHeight: 520,
    backgroundColor: "#12141a",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  // External links open in the default browser, not in the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  void win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  return win;
}

/**
 * Read a file for the renderer; a failure surfaces as a rejected invoke.
 * @param {string} filePath
 */
async function readFile(filePath) {
  return { path: filePath, content: await fsp.readFile(filePath, "utf8") };
}

function registerIpc() {
  ipcMain.handle("archyne:opened-file", async () => {
    if (!pendingFile) return null;
    const filePath = pendingFile;
    pendingFile = undefined; // hand it over exactly once
    return readFile(filePath);
  });

  ipcMain.handle("archyne:show-open", async (event) => {
    // The sender's window can already be gone if the user closed it mid-call;
    // fall back to an app-modal dialog rather than crashing.
    const win = BrowserWindow.fromWebContents(event.sender);
    /** @type {import("electron").OpenDialogOptions} */
    const options = { properties: ["openFile"], filters: FILTERS };
    const { canceled, filePaths } = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    if (canceled || filePaths.length === 0) return null;
    return readFile(filePaths[0]);
  });

  ipcMain.handle("archyne:show-save", async (event, { defaultPath, content }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = { defaultPath, filters: FILTERS };
    const { canceled, filePath } = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options);
    if (canceled || !filePath) return null;
    await fsp.writeFile(filePath, content, "utf8");
    return filePath;
  });

  ipcMain.handle("archyne:write-file", async (_event, { path: filePath, content }) => {
    await fsp.writeFile(filePath, content, "utf8");
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_e, argv) => {
    const file = fileArg(argv.slice(1));
    const [existing] = BrowserWindow.getAllWindows();
    if (existing) {
      // Reuse the running window rather than stacking another one up.
      if (existing.isMinimized()) existing.restore();
      existing.focus();
      if (file) {
        void readFile(file).then((payload) =>
          existing.webContents.send("archyne:open-file", payload),
        );
      }
      return;
    }
    createWindow(file);
  });

  void app.whenReady().then(() => {
    registerIpc();
    createWindow(fileArg(process.argv.slice(1)));
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
