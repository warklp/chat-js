"use client";

import { CheckCircle2, LoaderCircle, Monitor } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { SocialAuthProviders } from "@/components/auth-providers";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import authClient from "@/lib/auth-client";
import { config } from "@/lib/config";
import { isElectronTransferQuery } from "@/lib/electron-auth";

type DeviceLoginState =
  | "checking-session"
  | "needs-sign-in"
  | "transferring"
  | "waiting-for-app";

const DEVICE_LOGIN_COMPLETED_PARAM = "done";

export function DeviceLoginPage() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setState] = useState<DeviceLoginState>("checking-session");
  const transferStartedRef = useRef(false);

  const query = useMemo(
    () => Object.fromEntries(searchParams.entries()),
    [searchParams]
  );
  const isCompletedView = searchParams.get(DEVICE_LOGIN_COMPLETED_PARAM) === "1";
  const currentHref = useMemo(() => {
    const queryString = searchParams.toString();
    return queryString ? `${pathname}?${queryString}` : pathname;
  }, [pathname, searchParams]);

  useEffect(() => {
    if (isCompletedView) {
      setState("waiting-for-app");
      return;
    }

    if (!isElectronTransferQuery(query)) {
      setState("needs-sign-in");
      return;
    }

    let cancelled = false;

    void authClient.getSession().then(async ({ data: session }) => {
      if (cancelled) return;

      if (!session?.user) {
        setState("needs-sign-in");
        return;
      }

      if (transferStartedRef.current) return;

      transferStartedRef.current = true;
      setState("transferring");

      await authClient.electron.transferUser({
        fetchOptions: {
          query,
          onSuccess: () => {
            window.history.replaceState({}, "", `${pathname}?${DEVICE_LOGIN_COMPLETED_PARAM}=1`);
            setState("waiting-for-app");
          },
          onError: () => {
            transferStartedRef.current = false;
            setState("needs-sign-in");
          },
        },
      });
    });

    return () => {
      cancelled = true;
    };
  }, [isCompletedView, pathname, query]);

  if (state === "needs-sign-in") {
    return <ProviderSelectionScreen callbackURL={currentHref} />;
  }

  return (
    <DeviceAuthScreen
      onRetry={() => {
        transferStartedRef.current = false;
        setState("transferring");
        void authClient.electron.transferUser({
          fetchOptions: {
            query,
            onSuccess: () => {
              window.history.replaceState({}, "", `${pathname}?${DEVICE_LOGIN_COMPLETED_PARAM}=1`);
              setState("waiting-for-app");
            },
          },
        });
      }}
      state={state}
    />
  );
}

function ProviderSelectionScreen({ callbackURL }: { callbackURL: string }) {
  return (
    <div className="flex min-h-dvh w-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm px-6">
        <Card>
          <CardHeader className="text-center">
            <div className="mb-2 flex justify-center">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-foreground text-background">
                <Monitor className="size-7" />
              </div>
            </div>
            <CardTitle className="text-xl">Sign in to {config.appName}</CardTitle>
            <CardDescription>Continue to the desktop app</CardDescription>
          </CardHeader>
          <CardContent>
            <SocialAuthProviders callbackURL={callbackURL} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DeviceAuthScreen({
  state,
  onRetry,
}: {
  state: "checking-session" | "transferring" | "waiting-for-app";
  onRetry: () => void;
}) {
  const isLoading = state === "checking-session" || state === "transferring";

  return (
    <div className="flex min-h-dvh w-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm px-6">
        <Card>
          <CardHeader className="text-center">
            <div className="mb-2 flex justify-center">
              {isLoading ? (
                <LoaderCircle className="size-8 animate-spin text-muted-foreground" />
              ) : (
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-foreground text-background">
                  <CheckCircle2 className="size-7" />
                </div>
              )}
            </div>
            <CardTitle className="text-xl">
              {isLoading
                ? state === "checking-session"
                  ? "Checking your session…"
                  : "Opening the desktop app…"
                : "You're signed in"}
            </CardTitle>
            {!isLoading && (
              <CardDescription>
                You can close this tab and return to {config.appName}.
              </CardDescription>
            )}
          </CardHeader>
          {!isLoading && (
            <CardContent className="text-center">
              <p className="text-xs text-muted-foreground/60">
                Didn&apos;t open?{" "}
                <Button
                  className="h-auto p-0 text-xs text-muted-foreground/60 underline underline-offset-2 hover:text-muted-foreground hover:no-underline"
                  onClick={onRetry}
                  type="button"
                  variant="link"
                >
                  Try again
                </Button>
              </p>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
