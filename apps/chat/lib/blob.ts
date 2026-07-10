import { type Adapter, type Body, Files, FilesError } from "files-sdk";
import { nanoid } from "nanoid";
import { BLOB_FILE_PREFIX } from "./constants";
import { storageProvider } from "./storage-provider";

const FILE_CONTENT_PATH = "/api/files/content";
const SAFE_EXTENSION = /^\.[a-z0-9]{1,10}$/;
const STORAGE_KEY = /^[A-Za-z0-9_-]{24}(?:\.[a-z0-9]{1,10})?$/;
const PATH_SEPARATOR = /[\\/]/;
const ADAPTER_METHODS = [
  "copy",
  "delete",
  "download",
  "exists",
  "head",
  "list",
  "upload",
  "url",
] as const;

function isAdapter(value: unknown): value is Adapter {
  if (!(value && typeof value === "object")) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return ADAPTER_METHODS.every(
    (method) => typeof candidate[method] === "function"
  );
}

export function createStorageAdapter(): Adapter {
  const factoryName = storageProvider.slug.replace(
    /-([a-z0-9])/g,
    (_, character: string) => character.toUpperCase()
  );
  const factory =
    storageProvider.module[factoryName] ??
    storageProvider.module[`${factoryName}Adapter`];
  const adapter =
    typeof factory === "function" ? factory(storageProvider.options) : null;

  if (!isAdapter(adapter)) {
    throw new Error(
      `Files SDK provider "${storageProvider.slug}" does not export the expected "${factoryName}" adapter factory`
    );
  }

  return adapter;
}

let files: Files | undefined;

function getFiles(): Files {
  files ??= new Files({
    adapter: createStorageAdapter(),
    prefix: BLOB_FILE_PREFIX,
    retries: 2,
  });
  return files;
}

function sanitizeFilename(filename: string): string {
  const basename = filename.split(PATH_SEPARATOR).at(-1) ?? "";
  const withoutControlCharacters = [...basename]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("");
  return withoutControlCharacters.trim() || "file";
}

function createStorageKey(filename: string): string {
  const clean = sanitizeFilename(filename);
  const dot = clean.lastIndexOf(".");
  const candidate = dot > 0 ? clean.slice(dot).toLowerCase() : "";
  const extension = SAFE_EXTENSION.test(candidate) ? candidate : "";
  return `${nanoid(24)}${extension}`;
}

function createFileUrl(key: string): string {
  const url = new URL(FILE_CONTENT_PATH, getFileBaseUrl());
  url.searchParams.set("key", key);
  return url.toString();
}

export function keyFromFileUrl(value: string): string | null {
  return parseFileUrl(value, new URL(getFileBaseUrl()).origin);
}

function parseFileUrl(value: string, expectedOrigin?: string): string | null {
  try {
    const url = new URL(value);
    const key = url.searchParams.get("key");
    return (!expectedOrigin || url.origin === expectedOrigin) &&
      url.pathname === FILE_CONTENT_PATH &&
      url.searchParams.size === 1 &&
      key &&
      STORAGE_KEY.test(key)
      ? key
      : null;
  } catch {
    return null;
  }
}

function getFileBaseUrl(): string {
  if (process.env.APP_URL) {
    return process.env.APP_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}

export function keyFromFileRequest(value: string): string | null {
  return parseFileUrl(value);
}

export async function uploadFile(
  filename: string,
  body: Body,
  contentType?: string
) {
  const pathname = sanitizeFilename(filename);
  const uploaded = await getFiles().upload(createStorageKey(pathname), body, {
    contentType,
  });

  return {
    contentType: uploaded.contentType,
    pathname,
    url: createFileUrl(uploaded.key),
  };
}

export async function listFiles() {
  const blobs: Array<{
    pathname: string;
    uploadedAt: Date;
    url: string;
  }> = [];
  for await (const file of getFiles().listAll()) {
    blobs.push({
      pathname: file.key,
      uploadedAt: new Date(file.lastModified ?? Date.now()),
      url: createFileUrl(file.key),
    });
  }
  return { blobs };
}

export async function deleteFilesByUrls(urls: string[]): Promise<void> {
  const keys = [
    ...new Set(urls.map(keyFromFileUrl).filter(Boolean)),
  ] as string[];
  if (keys.length === 0) {
    return;
  }

  const result = await getFiles().delete(keys);
  const errors = "errors" in result ? result.errors : undefined;
  if (errors?.length) {
    throw new AggregateError(
      errors.map(({ error }) => error),
      `Failed to delete ${errors.length} stored file(s)`
    );
  }
}

export function downloadFile(
  key: string,
  range?: { start: number; end?: number }
) {
  return getFiles().download(key, range ? { range } : undefined);
}

export function getFileMetadata(key: string) {
  return getFiles().head(key);
}

export function storageSupportsRange(): boolean {
  return getFiles().capabilities.rangeRead;
}

export async function getFileProviderUrl(key: string): Promise<string | null> {
  try {
    const value = await getFiles().url(key);
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? value : null;
  } catch (error) {
    if (error instanceof FilesError && error.code === "NotFound") {
      throw error;
    }
    return null;
  }
}
