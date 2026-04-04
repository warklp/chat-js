"use client";

import { AlertCircle, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import authClient from "@/lib/auth-client";
import { ElectronManualSignInToast } from "@/components/electron-auth-ui";
import { Button } from "@/components/ui/button";
import {
  ELECTRON_TRANSFER_STORAGE_KEY,
  isElectronTransferQuery,
} from "@/lib/electron-auth";

/**
 * Handles the electron auth redirect after OAuth completes in the browser.
 * When the user finishes OAuth, `ensureElectronRedirect` detects the
 * electron redirect cookie and sends the user back to the Electron app
 * via deep link.
 *
 * Mount this in the root layout so it runs on every page.
 */
export function ElectronAuthHandler() {
  const router = useRouter();
  const [authState, setAuthState] = useState<ElectronRendererAuthState>({
    status: "idle",
    message: null,
  });

  useEffect(() => {
    const id = authClient.ensureElectronRedirect();
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const authorizationCode = authClient.electron.getAuthorizationCode();

    if (!authorizationCode) {
      return;
    }

    console.log("[electron-auth-handler] found authorization code cookie");

    const timeoutId = window.setTimeout(() => {
      toast.custom(
        (t) => (
          <ElectronManualSignInToast authorizationCode={authorizationCode} t={t} />
        ),
        { duration: 5_000 }
      );
    }, 750);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (typeof window.requestAuth !== "function") {
      return;
    }

    if (
      typeof window.onAuthenticated !== "function" ||
      typeof window.onUserUpdated !== "function" ||
      typeof window.onAuthError !== "function" ||
      typeof window.electronAPI?.onAuthStateChanged !== "function"
    ) {
      return;
    }

    void window.electronAPI?.getAuthState?.().then((state) => {
      if (state) {
        setAuthState(state);
      }
    });

    const syncAndRefresh = async () => {
      await window.electronAPI?.syncAuthSession?.();
      router.refresh();
    };

    const unsubscribeAuthenticated = window.onAuthenticated(() => {
      void syncAndRefresh();
    });
    const unsubscribeUserUpdated = window.onUserUpdated(() => {
      void syncAndRefresh();
    });
    const unsubscribeAuthError = window.onAuthError((ctx: ElectronAuthErrorContext) => {
      toast.error(ctx.message || "Authentication failed");
    });
    const unsubscribeAuthState = window.electronAPI.onAuthStateChanged((state) => {
      console.log("[electron-auth-handler] auth state changed", state);
      setAuthState(state);
    });

    return () => {
      unsubscribeAuthenticated();
      unsubscribeUserUpdated();
      unsubscribeAuthError();
      unsubscribeAuthState();
    };
  }, [router]);

  useEffect(() => {
    if (typeof window.requestAuth === "function") {
      return;
    }

    const rawTransferState = window.sessionStorage.getItem(
      ELECTRON_TRANSFER_STORAGE_KEY
    );

    if (!rawTransferState) {
      console.log("[electron-auth-handler] no stored electron transfer state");
      return;
    }

    let query: Record<string, string> | null = null;

    try {
      query = JSON.parse(rawTransferState) as Record<string, string>;
    } catch {
      console.warn("[electron-auth-handler] failed to parse stored transfer state");
      window.sessionStorage.removeItem(ELECTRON_TRANSFER_STORAGE_KEY);
      return;
    }

    if (!query || !isElectronTransferQuery(query)) {
      console.warn("[electron-auth-handler] stored transfer state is not valid", query);
      window.sessionStorage.removeItem(ELECTRON_TRANSFER_STORAGE_KEY);
      return;
    }

    console.log("[electron-auth-handler] found stored transfer state", query);

    let cancelled = false;

    void authClient.getSession().then(async ({ data: session }) => {
      console.log("[electron-auth-handler] session lookup", {
        hasUser: !!session?.user,
        userId: session?.user?.id ?? null,
      });

      if (cancelled || !session?.user) {
        return;
      }

      await authClient.electron.transferUser({
        fetchOptions: {
          query,
          onSuccess: (ctx) => {
            console.log("[electron-auth-handler] transfer success", ctx.data);
            const authorizationCode = ctx.data?.electron_authorization_code;

            if (authorizationCode) {
              toast.custom(
                (t) => (
                  <ElectronManualSignInToast
                    authorizationCode={authorizationCode}
                    t={t}
                  />
                ),
                { duration: 5_000 }
              );
            }
          },
          onError: (ctx) => {
            console.error("[electron-auth-handler] transfer failed", ctx.error);
          },
        },
      });

      window.sessionStorage.removeItem(ELECTRON_TRANSFER_STORAGE_KEY);
      router.refresh();
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

  return <ElectronAuthOverlay state={authState} />;
}

function ElectronAuthOverlay({
  state,
}: {
  state: ElectronRendererAuthState;
}) {
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    setIsDismissed(false);
  }, [state.detail, state.message, state.status]);

  if (state.status === "idle" || !state.message) {
    return null;
  }

  const isLoading =
    state.status === "awaiting-browser" || state.status === "finishing";

  if (!isLoading && isDismissed) {
    return null;
  }

  return (
    <div className="pointer-events-auto fixed inset-0 z-[999999] flex items-center justify-center bg-background/90 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border bg-background p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 text-muted-foreground">
            {isLoading ? (
              <LoaderCircle className="size-5 animate-spin" />
            ) : (
              <AlertCircle className="size-5 text-amber-600" />
            )}
          </div>
          <div className="space-y-2">
            <p className="font-medium">{state.message}</p>
            <p className="text-sm text-muted-foreground">
              {state.status === "awaiting-browser"
                ? "Complete sign-in in your browser, then come back here."
                : state.status === "finishing"
                  ? "Your browser has returned to ChatJS. We're finalizing the session now."
                  : state.detail || "If nothing changes, try the browser flow again or use the one-time code."}
            </p>
            {!isLoading ? (
              <Button
                className="mt-2"
                onClick={() => setIsDismissed(true)}
                size="sm"
                type="button"
                variant="outline"
              >
                Dismiss
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
