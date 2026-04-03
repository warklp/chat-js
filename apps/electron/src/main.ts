import * as path from "node:path";
import {
  app,
  BrowserWindow,
  Menu,
  nativeImage,
  shell,
  Tray,
} from "electron";
import { autoUpdater } from "electron-updater";
import { APP_NAME, APP_SCHEME, APP_URL, TITLEBAR_HEIGHT, WINDOW_DEFAULTS } from "./config";
import { authClient } from "./lib/auth-client";

// Disable GPU acceleration in WSL / headless environments to prevent D3D12 crashes.
if (process.env.WSL_DISTRO_NAME || process.env.WSLENV) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("disable-software-rasterizer");
}

// Setup the @better-auth/electron main process handler.
// Registers the custom protocol, handles deep-link callbacks, and manages
// IPC bridges for the renderer. Must be called before app is ready.
authClient.setupMain();

// Register the custom protocol as default handler for deep-link callbacks.
app.setAsDefaultProtocolClient(APP_SCHEME);

// On Windows, a second instance is launched when the OS opens a deep link.
// We grab the URL from argv and quit the duplicate instance.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

let isQuitting = false;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function getAppAssetPath(...segments: string[]): string {
  return path.join(app.getAppPath(), ...segments);
}


function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    ...WINDOW_DEFAULTS,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 10 },
    webPreferences: {
      preload: getAppAssetPath("dist", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL(APP_URL);

  win.webContents.on("did-finish-load", () => {
    win.webContents.insertCSS(`
      :root { --electron-titlebar-height: ${TITLEBAR_HEIGHT}px !important; }
      body { padding-top: var(--electron-titlebar-height) !important; }
      [data-slot="sidebar-container"] {
        top: var(--electron-titlebar-height) !important;
        height: calc(100svh - var(--electron-titlebar-height)) !important;
      }
    `);
  });

  // Open all new-window requests (including OAuth popups) in the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Minimize to tray on close
  win.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });

  if (!app.isPackaged) {
    win.webContents.openDevTools({ mode: "detach" });
  }

  return win;
}

function createTray(): Tray {
  const iconPath = getAppAssetPath("build", "icon.png");
  const trayIcon = nativeImage.createFromPath(iconPath);
  const t = new Tray(trayIcon.resize({ width: 16, height: 16 }));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `Show ${APP_NAME}`,
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  t.setToolTip(APP_NAME);
  t.setContextMenu(contextMenu);

  t.on("click", () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });

  return t;
}

function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("error", (err) => {
    console.error("AutoUpdater error:", err);
  });

  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify();
  }
}

// Windows/Linux: deep link causes a second instance launch.
app.on("second-instance", () => {
  mainWindow?.show();
  mainWindow?.focus();
});

app.whenReady().then(() => {
  mainWindow = createWindow();
  tray = createTray();
  setupAutoUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    } else {
      mainWindow?.show();
    }
  });
});

app.on("before-quit", () => {
  isQuitting = true;
  tray?.destroy();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
