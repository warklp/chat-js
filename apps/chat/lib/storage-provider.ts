// This file is rewritten by `chat-js create --storage-provider`.
import { vercelBlob } from "files-sdk/vercel-blob";

const options = {} satisfies Parameters<typeof vercelBlob>[0];

export const storageProvider = {
  createAdapter: () => vercelBlob(options),
  options,
  slug: "vercel-blob",
} as const;
