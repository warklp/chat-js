"use client";

import { Check, Copy, ExternalLink, LoaderCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import authClient from "@/lib/auth-client";
import type { Session } from "@/lib/auth";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";

function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      className="inline-flex items-center gap-2 font-medium text-foreground transition-colors hover:text-primary"
      onClick={async () => {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2_000);
      }}
      type="button"
    >
      <span className="font-mono text-xs tracking-wide">{code}</span>
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}

export function ElectronManualSignInToast({
  authorizationCode,
  t,
}: {
  authorizationCode: string;
  t: string | number;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-background p-4 shadow-lg">
      <div className="space-y-1 text-sm">
        <p className="font-medium">Browser redirect not working?</p>
        <p className="text-muted-foreground">
          Paste this code into the desktop app to finish signing in.
        </p>
        <CopyCodeButton code={authorizationCode} />
      </div>
      <Button onClick={() => toast.dismiss(t)} size="icon" type="button" variant="ghost">
        <span className="sr-only">Dismiss</span>
        <X className="size-4" />
      </Button>
    </div>
  );
}

export function ElectronBrowserSignIn({
  buttonLabel = "Continue in browser",
}: {
  buttonLabel?: string;
}) {
  const [authorizationCode, setAuthorizationCode] = useState("");
  const [hasOpenedBrowser, setHasOpenedBrowser] = useState(false);
  const [isManualMode, setIsManualMode] = useState(false);
  const [isPending, startTransition] = useTransition();

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
            Finish sign-in in your browser. If the desktop app does not come back automatically,
            you can paste the one-time code manually.
          </p>
          <Button
            className="mt-3 px-0"
            onClick={() => setIsManualMode((value) => !value)}
            type="button"
            variant="link"
          >
            {isManualMode ? "Hide manual code entry" : "Enter code manually"}
          </Button>
        </div>
      ) : null}

      {isManualMode ? (
        <div className="space-y-2">
          <Input
            autoComplete="off"
            inputMode="text"
            maxLength={32}
            onChange={(event) => {
              const nextCode = event.target.value.trim();
              setAuthorizationCode(nextCode);

              if (nextCode.length !== 32) {
                return;
              }

              if (typeof window.authenticate !== "function") {
                return;
              }

              const authenticate = window.authenticate;

              startTransition(async () => {
                await authenticate({ token: nextCode });
              });
            }}
            placeholder="Paste the 32-character code"
            value={authorizationCode}
          />
          <p className="text-xs text-muted-foreground">
            Start sign-in from the desktop app before pasting the fallback code.
          </p>
          {isPending ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <LoaderCircle className="size-3.5 animate-spin" />
              Verifying code...
            </div>
          ) : null}
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
  const [authorizationCode, setAuthorizationCode] = useState<string | null>(null);
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
          onSuccess: (ctx) => {
            setAuthorizationCode(ctx.data?.electron_authorization_code ?? null);
          },
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
              setAuthorizationCode(null);

              await authClient.electron.transferUser({
                fetchOptions: {
                  query,
                  onSuccess: (ctx) => {
                    setAuthorizationCode(ctx.data?.electron_authorization_code ?? null);
                  },
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

        {authorizationCode ? (
          <div className="rounded-lg border bg-muted/30 p-4 text-sm">
            <p className="font-medium">Manual fallback</p>
            <p className="mt-1 text-muted-foreground">
              If the desktop app does not open automatically, paste this code there:
            </p>
            <div className="mt-2">
              <CopyCodeButton code={authorizationCode} />
            </div>
          </div>
        ) : null}

        <Button asChild className="w-full" variant="ghost">
          <a href={useAnotherAccountHref}>Use another account</a>
        </Button>
      </CardContent>
    </Card>
  );
}
