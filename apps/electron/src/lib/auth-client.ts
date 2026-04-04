import { electronClient } from "@better-auth/electron/client";
import { storage } from "@better-auth/electron/storage";
import { createAuthClient } from "better-auth/client";
import {
  ELECTRON_AUTH_CALLBACK_PATH,
  ELECTRON_AUTH_CLIENT_ID,
  ELECTRON_AUTH_COOKIE_PREFIX,
} from "@/lib/electron-auth";
import { APP_SCHEME, APP_URL } from "../config";

export const authClient = createAuthClient({
  baseURL: APP_URL,
  plugins: [
    electronClient({
      callbackPath: ELECTRON_AUTH_CALLBACK_PATH,
      clientID: ELECTRON_AUTH_CLIENT_ID,
      cookiePrefix: ELECTRON_AUTH_COOKIE_PREFIX,
      signInURL: `${APP_URL}/device-login`,
      protocol: {
        scheme: APP_SCHEME,
      },
      storage: storage(),
    }) as any,
  ],
});

export type ElectronAuthClient = typeof authClient & {
  authenticate: (data: { token: string }) => Promise<unknown>;
  getCookie: () => string;
  getSession: () => Promise<{ data?: { user?: unknown | null } | null }>;
  requestAuth: (options?: { provider?: string }) => Promise<void>;
  signOut: () => Promise<unknown>;
  setupMain: (cfg?: {
    getWindow?: () => Electron.BrowserWindow | null;
    scheme?: boolean;
  }) => void;
};

export const electronAuthClient = authClient as ElectronAuthClient;
