"use client";

import { Github } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ElectronBrowserSignIn } from "@/components/electron-auth-ui";
import { Button } from "@/components/ui/button";
import authClient from "@/lib/auth-client";
import { config } from "@/lib/config";
import { ELECTRON_AUTH_CLIENT_ID } from "@/lib/electron-auth";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <title>Google</title>
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function VercelIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <title>Vercel</title>
      <path d="M12 1L24 22H0L12 1z" />
    </svg>
  );
}

export function SocialAuthProviders({
  callbackURL,
  electronBrowserLabel,
}: {
  callbackURL?: string;
  electronBrowserLabel?: string;
} = {}) {
  const pathname = usePathname();
  const params = useSearchParams();

  // Detect Electron synchronously so there's no flash of the wrong UI.
  // Defaults to false on the server (SSR); the lazy initializer runs only on
  // the client where window bridges are set by the preload script.
  const [isElectron] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.requestAuth === "function"
  );

  // In the Electron app, use the @better-auth/electron bridges exposed by
  // setupRenderer() in the preload script. requestAuth() opens the sign-in
  // URL in the user's default browser with the proper PKCE params.
  if (isElectron) {
    return <ElectronBrowserSignIn buttonLabel={electronBrowserLabel} />;
  }

  // In the browser: pass electron query params (client_id, state, etc.)
  // through to social sign-in calls so the electron plugin can redirect back.
  const query = Object.fromEntries(params.entries());
  const isElectronTransfer = params.get("client_id") === ELECTRON_AUTH_CLIENT_ID;
  const returnTo = params.get("returnTo");
  const deviceLoginCallbackURL =
    typeof window !== "undefined"
      ? new URL("/device-login", window.location.origin).toString()
      : "/device-login";
  const resolvedCallbackURL =
    returnTo && !isElectronTransfer ? returnTo : callbackURL;

  async function signIn(provider: "google" | "github" | "vercel") {
    const result = await authClient.signIn.social({
      provider,
      callbackURL: isElectronTransfer ? deviceLoginCallbackURL : resolvedCallbackURL,
      ...(isElectronTransfer
        ? {
            disableRedirect: true,
            errorCallbackURL: deviceLoginCallbackURL,
            newUserCallbackURL: deviceLoginCallbackURL,
          }
        : {}),
      fetchOptions: {
        query,
      },
    });

    if (isElectronTransfer) {
      const redirectUrl = result.data?.url;

      if (redirectUrl) {
        window.location.href = redirectUrl;
      }
    }
  }

  return (
    <div className="space-y-2">
      {config.authentication.google ? (
        <Button
          className="w-full"
          onClick={() => signIn("google")}
          type="button"
          variant="outline"
        >
          <GoogleIcon className="mr-2 h-4 w-4" />
          Continue with Google
        </Button>
      ) : null}
      {config.authentication.github ? (
        <Button
          className="w-full"
          onClick={() => signIn("github")}
          type="button"
          variant="outline"
        >
          <Github className="mr-2 h-4 w-4" />
          Continue with GitHub
        </Button>
      ) : null}
      {config.authentication.vercel ? (
        <Button
          className="w-full"
          onClick={() => signIn("vercel")}
          type="button"
          variant="outline"
        >
          <VercelIcon className="mr-2 h-4 w-4" />
          Continue with Vercel
        </Button>
      ) : null}
    </div>
  );
}
