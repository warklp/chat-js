import { config } from "@/lib/config";

export const ELECTRON_AUTH_CLIENT_ID = "electron";
export const ELECTRON_AUTH_COOKIE_PREFIX = "better-auth";
export const ELECTRON_AUTH_CALLBACK_PATH = "/auth/callback";
export const ELECTRON_APP_SCHEME = config.appPrefix;
export const ELECTRON_TRUSTED_ORIGIN = `${ELECTRON_APP_SCHEME}:/`;
export const ELECTRON_TRANSFER_STORAGE_KEY = "chatjs-electron-transfer";

type SearchParamValue = string | string[] | undefined;

export function toSearchParamRecord(
  searchParams: Record<string, SearchParamValue>
): Record<string, string> {
  const query: Record<string, string> = {};

  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") {
      query[key] = value;
      continue;
    }

    if (Array.isArray(value) && value[0]) {
      query[key] = value[0];
    }
  }

  return query;
}

export function buildAuthPageHref(
  pathname: string,
  searchParams: Record<string, SearchParamValue>
): string {
  const query = new URLSearchParams(toSearchParamRecord(searchParams)).toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function isElectronTransferQuery(query: Record<string, string>): boolean {
  return query.client_id === ELECTRON_AUTH_CLIENT_ID;
}
