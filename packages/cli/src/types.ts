import type { GatewayType } from "../../../apps/chat/lib/config-schema";

export type PackageManager = "bun" | "npm" | "pnpm" | "yarn";

export const GATEWAYS: readonly GatewayType[] = [
  "vercel",
  "openrouter",
  "openai",
  "openai-compatible",
] as const;

export type Gateway = GatewayType;

export const AUTH_PROVIDERS = ["google", "github", "vercel"] as const;

export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export type FeatureKey =
  | "sandbox"
  | "webSearch"
  | "urlRetrieval"
  | "deepResearch"
  | "mcp"
  | "imageGeneration"
  | "attachments"
  | "followupSuggestions"
  | "parallelResponses";

export interface ScaffoldToolToggle {
  enabled: boolean;
}

export interface ScaffoldConfigInput {
  appName: string;
  appPrefix: string;
  appUrl: string;
  features: {
    attachments: boolean;
    parallelResponses: boolean;
  };
  authentication: Record<AuthProvider, boolean>;
  desktopApp: {
    enabled: boolean;
  };
  ai: {
    gateway: Gateway;
    tools: {
      webSearch: ScaffoldToolToggle;
      urlRetrieval: ScaffoldToolToggle;
      codeExecution: ScaffoldToolToggle;
      mcp: ScaffoldToolToggle;
      followupSuggestions: ScaffoldToolToggle;
      image: ScaffoldToolToggle;
      deepResearch: ScaffoldToolToggle;
    };
  };
}

export type ScaffoldFeatureSelection = Pick<ScaffoldConfigInput, "features"> & {
  ai: Pick<ScaffoldConfigInput["ai"], "tools">;
};
