import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { ElectronTransferUser } from "@/components/electron-auth-ui";
import { LoginForm } from "@/components/login-form";
import { buttonVariants } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { config } from "@/lib/config";
import {
  ELECTRON_AUTH_CLIENT_ID,
  toSearchParamRecord,
} from "@/lib/electron-auth";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Login",
  description: "Login to your account",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const query = toSearchParamRecord(resolvedSearchParams);
  const isElectronTransfer =
    config.desktopApp.enabled && query.client_id === ELECTRON_AUTH_CLIENT_ID;
  const session = isElectronTransfer
    ? await auth.api.getSession({ headers: await headers() })
    : null;

  return (
    <div className="container mx-auto flex h-dvh w-screen flex-col items-center justify-center">
      <Link
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "absolute top-4 left-4 md:top-8 md:left-8"
        )}
        href="/"
      >
        <ChevronLeft className="mr-2 h-4 w-4" />
        Back
      </Link>
      <div className="mx-auto flex w-full flex-col items-center justify-center sm:w-[420px]">
        {session?.user && isElectronTransfer ? (
          <ElectronTransferUser query={query} session={session} />
        ) : (
          <LoginForm className="w-full" />
        )}
      </div>
    </div>
  );
}
