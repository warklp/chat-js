import type {
  DataContent,
  FilePart,
  ImagePart,
  ModelMessage,
  TextPart,
} from "ai";
import { FilesError } from "files-sdk";
import { downloadFile } from "@/lib/file-storage";
import { keyFromFileUrl } from "@/lib/file-url";
import { getBaseUrl } from "@/lib/url";

// Minimal utilities to download assets from URL-based parts and inline them.

interface DownloadResult {
  data: Uint8Array;
  mediaType: string | undefined;
}

export type DownloadImplementation = (args: {
  url: URL;
}) => Promise<DownloadResult | null>;

async function defaultDownload({
  url,
}: {
  url: URL;
}): Promise<DownloadResult | null> {
  const isApplicationUrl = url.origin === new URL(getBaseUrl()).origin;
  const key = isApplicationUrl ? keyFromFileUrl(url.toString()) : null;
  if (key) {
    try {
      const file = await downloadFile(key);
      return {
        data: new Uint8Array(await file.arrayBuffer()),
        mediaType: file.type || undefined,
      };
    } catch (error) {
      if (error instanceof FilesError && error.code === "NotFound") {
        return null;
      }
      throw error;
    }
  }

  const response = await fetch(url);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(
      `Failed to download asset: ${url.toString()} (${response.status})`
    );
  }
  const contentType = response.headers.get("content-type") || undefined;
  const arrayBuffer = await response.arrayBuffer();
  return { mediaType: contentType, data: new Uint8Array(arrayBuffer) };
}

function toHttpUrl(value: unknown): URL | null {
  if (value instanceof URL) {
    return value.protocol.startsWith("http") ? value : null;
  }
  if (typeof value === "string") {
    try {
      const url = keyFromFileUrl(value)
        ? new URL(value, getBaseUrl())
        : new URL(value);
      return url.protocol === "http:" || url.protocol === "https:" ? url : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Collects all http(s) URLs from file/image parts in the provided messages and downloads them.
 * Returns a map keyed by the normalized URL string.
 */
async function downloadAssetsFromModelMessages(
  messages: ModelMessage[],
  downloadImplementation: DownloadImplementation = defaultDownload
): Promise<Record<string, DownloadResult | null>> {
  const urlSet = new Set<string>();

  for (const message of messages) {
    if (typeof message.content === "string") {
      continue;
    }
    for (const part of message.content) {
      if (part.type !== "file" && part.type !== "image") {
        continue;
      }
      const dataOrUrl: DataContent | URL =
        part.type === "file"
          ? (part as FilePart).data
          : (part as ImagePart).image;
      const url = toHttpUrl(dataOrUrl);
      if (url) {
        urlSet.add(url.toString());
      }
    }
  }

  const urls = Array.from(urlSet).map((u) => new URL(u));
  const downloaded = await Promise.all(
    urls.map(async (url) => ({
      url,
      data: await downloadImplementation({ url }),
    }))
  );
  return Object.fromEntries(
    downloaded.map(({ url, data }) => [url.toString(), data])
  );
}

function mapFilePart(
  part: FilePart,
  downloaded: Record<string, DownloadResult | null>
): FilePart | null {
  const url = toHttpUrl(part.data);
  if (url) {
    const found = downloaded[url.toString()];
    if (found === null) {
      return null;
    }
    if (found) {
      return {
        ...part,
        data: found.data,
        mediaType: part.mediaType ?? found.mediaType,
      };
    }
  }
  return part;
}

function mapImagePart(
  part: ImagePart,
  downloaded: Record<string, DownloadResult | null>
): ImagePart | null {
  const url = toHttpUrl(part.image);
  if (url) {
    const found = downloaded[url.toString()];
    if (found === null) {
      return null;
    }
    if (found) {
      return {
        ...part,
        image: found.data,
        mediaType: part.mediaType ?? found.mediaType,
      };
    }
  }
  return part;
}

/**
 * Inlines any URL-based file/image parts within ModelMessage[] by replacing the URLs
 * with downloaded binary data. This ensures providers receive actual bytes.
 */
export async function replaceFilePartUrlByBinaryDataInMessages(
  messages: ModelMessage[],
  downloadImplementation: DownloadImplementation = defaultDownload
): Promise<ModelMessage[]> {
  const downloaded = await downloadAssetsFromModelMessages(
    messages,
    downloadImplementation
  );

  const mapPart = (
    part: TextPart | ImagePart | FilePart
  ): TextPart | ImagePart | FilePart | null => {
    if (part.type === "file") {
      return mapFilePart(part as FilePart, downloaded);
    }
    if (part.type === "image") {
      return mapImagePart(part as ImagePart, downloaded);
    }
    // pass-through for text/tool/reasoning/etc
    return part;
  };

  const mappedMessages = messages.map((message) => {
    if (message.role !== "user" || typeof message.content === "string") {
      return message;
    }

    return {
      ...message,
      content: message.content
        .map(mapPart)
        .filter(
          (part): part is TextPart | ImagePart | FilePart => part !== null
        ),
    };
  });

  return mappedMessages.filter(
    (message) =>
      !(
        message.role === "user" &&
        Array.isArray(message.content) &&
        message.content.length === 0
      )
  );
}
