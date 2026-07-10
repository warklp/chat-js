// This file is rewritten by `chat-js create --storage-provider`.
// biome-ignore lint/performance/noNamespaceImport: provider factories have provider-specific names
import * as storageProviderModule from "files-sdk/vercel-blob";

export const storageProvider = {
  module: storageProviderModule as Record<string, unknown>,
  options: {},
  slug: "vercel-blob",
} as const;
