"use client";

import { CheckCircle2, LoaderCircle } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ElectronManualSignInToast } from "@/components/electron-auth-ui";
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
  const [authorizationCode, setAuthorizationCode] = useState<string | null>(null);
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
    console.log("[device-login] mounted", {
      href: window.location.href,
      query,
    });
  }, [query]);

  useEffect(() => {
    if (!isElectronTransferQuery(query)) {
      console.log("[device-login] missing electron transfer params");
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

      console.log("[device-login] session check", {
        hasUser: !!session?.user,
        userId: session?.user?.id ?? null,
      });

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
          onSuccess: (ctx) => {
            const code = ctx.data?.electron_authorization_code ?? null;
            console.log("[device-login] transfer success", {
              hasAuthorizationCode: !!code,
              redirect: ctx.data?.redirect ?? null,
              url: ctx.data?.url ?? null,
            });
            setAuthorizationCode(code);
            setState("waiting-for-app");
          },
          onError: (ctx) => {
            console.error("[device-login] transfer failed", ctx.error);
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
                {authorizationCode ? (
                  <ElectronManualSignInToast
                    authorizationCode={authorizationCode}
                    t="device-login-inline"
                  />
                ) : null}
                <Button
                  className="w-full"
                  onClick={() => {
                    transferStartedRef.current = false;
                    setState("transferring");
                    void authClient.electron.transferUser({
                      fetchOptions: {
                        query,
                        onSuccess: (ctx) => {
                          setAuthorizationCode(
                            ctx.data?.electron_authorization_code ?? null
                          );
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

            {process.env.NODE_ENV !== "production" ? (
              <pre className="overflow-x-auto rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                {JSON.stringify({ currentHref, query, state }, null, 2)}
              </pre>
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
