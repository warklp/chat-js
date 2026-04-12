import type { GatewayType } from "../../../apps/chat/lib/ai/gateways/registry";
import type {
  AuthenticationConfig,
  ConfigInput,
  FeaturesConfig,
} from "../../../apps/chat/lib/config-schema";

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

export interface ScaffoldConfigInput extends Omit<
  ConfigInput,
  | "appName"
  | "appPrefix"
  | "appUrl"
  | "features"
  | "authentication"
  | "desktopApp"
  | "ai"
> {
  appName: string;
  appPrefix: string;
  appUrl: string;
  features: Pick<FeaturesConfig, "attachments" | "parallelResponses">;
  authentication: AuthenticationConfig;
  desktopApp: {
    enabled: boolean;
  };
  ai: {
    gateway: GatewayType;
    tools: {
      webSearch: { enabled: boolean };
      urlRetrieval: { enabled: boolean };
      codeExecution: { enabled: boolean };
      mcp: { enabled: boolean };
      followupSuggestions: { enabled: boolean };
      image: { enabled: boolean };
      deepResearch: { enabled: boolean };
    };
  };
}

export type ScaffoldFeatureSelection = Pick<ScaffoldConfigInput, "features"> & {
  ai: Pick<ScaffoldConfigInput["ai"], "tools">;
};
