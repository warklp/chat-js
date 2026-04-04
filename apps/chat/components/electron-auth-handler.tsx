"use client";

import { AlertCircle, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import authClient from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

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
      setAuthState(state);
    });

    return () => {
      unsubscribeAuthenticated();
      unsubscribeUserUpdated();
      unsubscribeAuthError();
      unsubscribeAuthState();
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
  const canCancel = state.status === "awaiting-browser";

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
                  : state.detail || "If nothing changes, try the browser flow again."}
            </p>
            {canCancel ? (
              <Button
                className="mt-2"
                onClick={() => {
                  void window.electronAPI?.cancelAuthFlow?.();
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                Go back
              </Button>
            ) : null}
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
