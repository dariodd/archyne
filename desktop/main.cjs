/**
 * Merflow desktop shell: a thin Electron window around the static build.
 * Everything still runs locally in the renderer — no backend, no network.
 */
const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

/** .mmd file passed on the command line (double-click / "open with"). */
function fileArg(argv) {
  return argv.find((a) => a.toLowerCase().endsWith(".mmd") && fs.existsSync(a));
}

function createWindow(openFile) {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#12141a",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // External links open in the default browser, not in the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  const search = openFile
    ? `?code=${encodeURIComponent(fs.readFileSync(openFile, "utf8"))}`
    : undefined;
  void win.loadFile(path.join(__dirname, "..", "dist", "index.html"), {
    ...(search ? { search } : {}),
  });
  return win;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_e, argv) => {
    createWindow(fileArg(argv.slice(1)));
  });

  void app.whenReady().then(() => {
    createWindow(fileArg(process.argv.slice(1)));
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
