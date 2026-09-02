const { app, BrowserWindow, Menu, dialog, protocol, net, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const OUT_DIR = app.isPackaged
  ? path.join(process.resourcesPath, "out")
  : path.join(__dirname, "..", "out");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

let mainWindow = null;

function resolveOutFile(requestUrl) {
  const { pathname } = new URL(requestUrl);
  let rel = decodeURIComponent(pathname);
  if (!rel || rel === "/") rel = "/index.html";
  if (rel.endsWith("/")) rel += "index.html";
  const filePath = path.normalize(path.join(OUT_DIR, rel));
  const root = path.normalize(OUT_DIR + path.sep);
  if (!filePath.startsWith(root) && filePath !== path.normalize(OUT_DIR)) return null;
  return filePath;
}

function createWindow() {
  const indexPath = path.join(OUT_DIR, "index.html");
  if (!fs.existsSync(indexPath)) {
    dialog.showErrorBox(
      "LogCutter",
      "The app has not been built yet.\n\nFrom the project folder run:\n  npm run build\n  npm run desktop",
    );
    app.quit();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: "LogCutter",
    backgroundColor: "#09090b",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  void mainWindow.loadURL("app://localhost/index.html");
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    protocol.handle("app", async (request) => {
      const url = new URL(request.url);
      if (url.pathname === "/__runtime") {
        return new Response(JSON.stringify({ canQuit: true, kind: "electron" }), {
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      }
      if (url.pathname === "/__shutdown") {
        setTimeout(() => app.quit(), 100);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      }
      const filePath = resolveOutFile(request.url);
      if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        return new Response("Not found", { status: 404 });
      }
      return net.fetch(pathToFileURL(filePath).href);
    });
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
