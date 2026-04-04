"use client";

import { ExternalLink, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import authClient from "@/lib/auth-client";
import type { Session } from "@/lib/auth";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

export function ElectronBrowserSignIn({
  buttonLabel = "Continue in browser",
}: {
  buttonLabel?: string;
}) {
  const [hasOpenedBrowser, setHasOpenedBrowser] = useState(false);

  return (
    <div className="space-y-4">
      <Button
        className="w-full"
        onClick={() => {
          if (typeof window.requestAuth !== "function") {
            return;
          }

          void window.requestAuth();
          window.setTimeout(() => setHasOpenedBrowser(true), 300);
        }}
        type="button"
        variant="outline"
      >
        <ExternalLink className="mr-2 size-4" />
        {buttonLabel}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Authentication opens in your default browser, where you can choose any configured
        provider.
      </p>

      {hasOpenedBrowser ? (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <p className="text-muted-foreground">
            Finish sign-in in your browser. The desktop app will reconnect automatically once
            the browser flow completes.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function ElectronTransferUser({
  query,
  session,
}: {
  query: Record<string, string>;
  session: Session;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const hasStartedTransferRef = useRef(false);
  const useAnotherAccountHref = useMemo(() => {
    const params = new URLSearchParams(query);
    params.delete("client_id");
    params.delete("state");
    params.delete("code_challenge");
    params.delete("code_challenge_method");

    const nextQuery = params.toString();
    return nextQuery ? `/login?${nextQuery}` : "/login";
  }, [query]);

  useEffect(() => {
    if (hasStartedTransferRef.current) {
      return;
    }

    hasStartedTransferRef.current = true;

    startTransition(async () => {
      await authClient.electron.transferUser({
        fetchOptions: {
          query,
        },
      });

      router.refresh();
    });
  }, [query, router]);

  return (
    <Card className="w-full">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Continue in the desktop app</CardTitle>
        <CardDescription>
          You are already signed in on the web. We&apos;re sending this session back to
          Electron now.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/30 p-4 text-sm">
          <p className="font-medium">{session.user.name || session.user.email}</p>
          <p className="text-muted-foreground">{session.user.email}</p>
        </div>

        <Button
          className="w-full"
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              await authClient.electron.transferUser({
                fetchOptions: {
                  query,
                },
              });

              router.refresh();
            });
          }}
          type="button"
        >
          {isPending ? (
            <>
              <LoaderCircle className="mr-2 size-4 animate-spin" />
              Connecting...
            </>
          ) : (
            "Try transfer again"
          )}
        </Button>

        <Button asChild className="w-full" variant="ghost">
          <a href={useAnotherAccountHref}>Use another account</a>
        </Button>
      </CardContent>
    </Card>
  );
}
