export type PackageManager = "bun" | "npm" | "pnpm" | "yarn";

export const GATEWAYS = [
  "vercel",
  "openrouter",
  "openai",
  "openai-compatible",
] as const;

export type Gateway = (typeof GATEWAYS)[number];

export const AUTH_PROVIDERS = ["google", "github", "vercel"] as const;

export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export const FEATURE_KEYS = [
  "sandbox",
  "webSearch",
  "urlRetrieval",
  "deepResearch",
  "mcp",
  "imageGeneration",
  "attachments",
  "followupSuggestions",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];
