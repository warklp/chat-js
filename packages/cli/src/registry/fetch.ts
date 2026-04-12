import fs from "node:fs/promises";
import path from "node:path";
import {
  registryIndexItemSchema,
  registryToolItemSchema,
  type RegistryIndexItem,
  type RegistryToolItem,
} from "./schema";

export type { RegistryToolItem } from "./schema";
export type { RegistryToolItemFile } from "./schema";
export type { RegistryIndexItem } from "./schema";

export const DEFAULT_REGISTRY_URL =
  "https://registry.chatjs.dev/items/{name}.json";

export function getRegistryUrl(override?: string): string {
  return override ?? process.env.CHATJS_REGISTRY_URL ?? DEFAULT_REGISTRY_URL;
}

function getRegistryIndexUrl(registryUrl?: string): string {
  const template = getRegistryUrl(registryUrl);
  if (template.includes("{name}")) {
    return template.replace(/items\/\{name\}\.json$/, "index.json");
  }
  return new URL("../index.json", template).toString();
}

async function fetchJson(source: string): Promise<unknown> {
  const isLocalPath = source.startsWith(".") || path.isAbsolute(source);
  const filePath = source.startsWith(".")
    ? path.resolve(process.cwd(), source)
    : source;

  if (isLocalPath) {
    const content = await fs.readFile(filePath, "utf8").catch(() => {
      throw new Error(`Registry resource not found at ${filePath}`);
    });
    return JSON.parse(content);
  }

  const res = await fetch(filePath).catch(() => {
    throw new Error(`Could not reach registry. Check your internet connection.`);
  });

  if (res.status === 404) {
    throw new Error(`Registry resource not found: ${filePath}`);
  }
  if (!res.ok) {
    throw new Error(`Registry fetch failed: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export async function fetchRegistryIndex(
  registryUrl?: string
): Promise<RegistryIndexItem[]> {
  const raw = await fetchJson(getRegistryIndexUrl(registryUrl));
  return registryIndexItemSchema.array().parse(raw);
}

export async function fetchRegistryItem(
  name: string,
  registryUrl?: string
): Promise<RegistryToolItem> {
  const template = getRegistryUrl(registryUrl);
  const resolved = template.replace("{name}", encodeURIComponent(name));
  const raw = await fetchJson(resolved).catch((error: unknown) => {
    if (
      error instanceof Error &&
      error.message.startsWith("Registry resource not found")
    ) {
      throw new Error(`Tool "${name}" not found in registry.`);
    }
    throw error;
  });

  return registryToolItemSchema.parse(raw);
}
