import { setupRenderer } from "@better-auth/electron/preload";
import { contextBridge } from "electron";
import { TITLEBAR_HEIGHT } from "./config";

// Setup @better-auth/electron renderer bridges.
// Exposes window.requestAuth(), window.onAuthenticated(), window.signOut(), etc.
setupRenderer();

// Expose additional app metadata to the renderer process.
contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  platform: process.platform,
  titlebarHeight: TITLEBAR_HEIGHT,
});
