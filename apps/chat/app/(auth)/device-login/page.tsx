import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DeviceLoginPage } from "@/components/device-login-page";
import { auth } from "@/lib/auth";
import { config } from "@/lib/config";
import { toSearchParamRecord } from "@/lib/electron-auth";

export const metadata: Metadata = {
  title: "Device Login",
  description: "Sign in for the desktop app",
};

export default async function DeviceLoginRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!config.desktopApp.enabled) {
    redirect("/login");
  }

  const resolvedSearchParams = await searchParams;
  const query = toSearchParamRecord(resolvedSearchParams);
  const isCompletedView = query.done === "1";
  const queryString = new URLSearchParams(query).toString();
  const currentHref = queryString
    ? `/device-login?${queryString}`
    : "/device-login";
  const session = await auth.api.getSession({ headers: await headers() });

  if (!(session?.user || isCompletedView)) {
    redirect(`/login?returnTo=${encodeURIComponent(currentHref)}`);
  }

  return <DeviceLoginPage />;
}
