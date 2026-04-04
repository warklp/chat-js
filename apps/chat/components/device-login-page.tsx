"use client";

import { CheckCircle2, LoaderCircle } from "lucide-react";
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
import {
  ELECTRON_TRANSFER_STORAGE_KEY,
  isElectronTransferQuery,
} from "@/lib/electron-auth";

type DeviceLoginState =
  | "checking-session"
  | "needs-sign-in"
  | "transferring"
  | "waiting-for-app";

export function DeviceLoginPage() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setState] = useState<DeviceLoginState>("checking-session");
  const transferStartedRef = useRef(false);

  const query = useMemo(
    () => Object.fromEntries(searchParams.entries()),
    [searchParams]
  );
  const currentHref = useMemo(() => {
    const queryString = searchParams.toString();
    return queryString ? `${pathname}?${queryString}` : pathname;
  }, [pathname, searchParams]);

  useEffect(() => {
    if (!isElectronTransferQuery(query)) {
      setState("needs-sign-in");
      return;
    }

    window.sessionStorage.setItem(
      ELECTRON_TRANSFER_STORAGE_KEY,
      JSON.stringify(query)
    );

    let cancelled = false;

    void authClient.getSession().then(async ({ data: session }) => {
      if (cancelled) {
        return;
      }

      if (!session?.user) {
        setState("needs-sign-in");
        return;
      }

      if (transferStartedRef.current) {
        return;
      }

      transferStartedRef.current = true;
      setState("transferring");

      await authClient.electron.transferUser({
        fetchOptions: {
          query,
          onSuccess: () => {
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
  }, [query]);

  return (
    <div className="container mx-auto flex min-h-dvh w-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Open ChatJS in the desktop app</CardTitle>
            <CardDescription>
              Sign in here, then we&apos;ll send you back to Electron automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {state === "checking-session" ? (
              <StatusBlock
                description="Checking whether you're already signed in..."
                icon={<LoaderCircle className="size-5 animate-spin" />}
                title="Checking session"
              />
            ) : null}

            {state === "needs-sign-in" ? (
              <>
                <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                  Continue with any provider below. After login, this page will hand the session
                  back to the Electron app.
                </div>
                <SocialAuthProviders callbackURL={currentHref} />
              </>
            ) : null}

            {state === "transferring" ? (
              <StatusBlock
                description="Your browser session is ready. Sending it to the desktop app now..."
                icon={<LoaderCircle className="size-5 animate-spin" />}
                title="Opening desktop app"
              />
            ) : null}

            {state === "waiting-for-app" ? (
              <>
                <StatusBlock
                  description="The desktop app should open or refresh momentarily."
                  icon={<CheckCircle2 className="size-5 text-green-600" />}
                  title="Session sent"
                />
                <Button
                  className="w-full"
                  onClick={() => {
                    transferStartedRef.current = false;
                    setState("transferring");
                    void authClient.electron.transferUser({
                      fetchOptions: {
                        query,
                        onSuccess: () => {
                          setState("waiting-for-app");
                        },
                      },
                    });
                  }}
                  type="button"
                  variant="outline"
                >
                  Try again
                </Button>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatusBlock({
  description,
  icon,
  title,
}: {
  description: string;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <div className="flex items-center gap-3">
        <div className="text-muted-foreground">{icon}</div>
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}
