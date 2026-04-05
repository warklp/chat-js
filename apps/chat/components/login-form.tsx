"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { SocialAuthProviders } from "@/components/auth-providers";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const searchParams = useSearchParams();
  const [isElectron] = useState(
    () =>
      typeof window !== "undefined" && typeof window.requestAuth === "function"
  );
  const registerHref = (() => {
    const query = searchParams.toString();
    return query ? `/register?${query}` : "/register";
  })();

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">
            {isElectron ? "Continue in browser" : "Welcome back"}
          </CardTitle>
          <CardDescription>
            {isElectron
              ? "Use your browser to sign in or create an account."
              : "Sign in to your account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6">
            <Suspense>
              <SocialAuthProviders electronBrowserLabel="Continue in browser" />
            </Suspense>
            {isElectron ? (
              <div className="text-center text-muted-foreground text-sm">
                New and existing accounts both continue through the browser
                flow.
              </div>
            ) : (
              <div className="text-center text-sm">
                Don&apos;t have an account?{" "}
                <a className="underline underline-offset-4" href={registerHref}>
                  Sign up
                </a>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      <div className="text-balance text-center text-muted-foreground text-xs [&_a]:underline [&_a]:underline-offset-4 [&_a]:hover:text-primary">
        By clicking continue, you agree to our{" "}
        <Link href="/terms">Terms of Service</Link> and{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </div>
    </div>
  );
}
