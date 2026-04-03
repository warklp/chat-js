import { electronClient } from "@better-auth/electron/client";
import { storage } from "@better-auth/electron/storage";
import { createAuthClient } from "better-auth/client";
import { APP_SCHEME, APP_URL } from "../config";

export const authClient = createAuthClient({
  baseURL: APP_URL,
  plugins: [
    electronClient({
      signInURL: `${APP_URL}/login`,
      protocol: {
        scheme: APP_SCHEME,
      },
      storage: storage(),
    }),
  ],
});
