import {
  authEnvRequirements,
  type EnvRequirement,
  envVarDescriptions,
  featureEnvRequirements,
  gatewayEnvRequirements,
} from "./config-requirements";
import {
  FEATURE_KEYS,
  type AuthProvider,
  type FeatureKey,
  type Gateway,
} from "../types";

export type EnvVarEntry = {
  /** The env var name(s), e.g. "AI_GATEWAY_API_KEY" or "AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET" */
  vars: string;
  /** Human-readable description derived from the Zod schema */
  description: string;
  /** Group key used to render "one of" alternatives together */
  oneOfGroup?: string;
};

const envDescriptions = new Map(Object.entries(envVarDescriptions));

/**
 * Expand an EnvRequirement into one or more EnvVarEntries, pulling
 * descriptions from the Zod schema.
 */
function requirementToEntries(requirement: EnvRequirement): EnvVarEntry[] {
  const oneOfGroup =
    requirement.options.length > 1
      ? requirement.options.map((group) => group.map(String).join("+")).join("|")
      : undefined;

  return requirement.options.map((group) => {
    const description = group
      .map((v) => {
        const varName = String(v);
        return envDescriptions.get(varName) ?? varName;
      })
      .join(", ");

    return {
      vars: group.map(String).join(" + "),
      description: description || requirement.description,
      oneOfGroup,
    };
  });
}

export function collectEnvChecklist(input: {
  gateway: Gateway;
  features: Record<FeatureKey, boolean>;
  auth: Record<AuthProvider, boolean>;
}): EnvVarEntry[] {
  const entries: EnvVarEntry[] = [];

  entries.push({
    vars: "AUTH_SECRET",
    description: envDescriptions.get("AUTH_SECRET") ?? "AUTH_SECRET",
  });
  entries.push({
    vars: "DATABASE_URL",
    description: envDescriptions.get("DATABASE_URL") ?? "DATABASE_URL",
  });

  // --- AI Gateway ---
  const gwReq = gatewayEnvRequirements[input.gateway];
  const gwEntries = requirementToEntries(gwReq);

  entries.push(...gwEntries);

  // --- Features ---
  const featureItems: EnvVarEntry[] = [];
  const seen = new Set<string>();

  for (const feature of FEATURE_KEYS) {
    if (!input.features[feature]) continue;
    const requirement =
      featureEnvRequirements[feature as keyof typeof featureEnvRequirements];
    if (!requirement) continue;

    // Deduplicate — e.g. webSearch and deepResearch both need TAVILY_API_KEY
    if (seen.has(requirement.description)) continue;
    seen.add(requirement.description);

    featureItems.push(...requirementToEntries(requirement));
  }

  entries.push(...featureItems);

  // --- Authentication ---
  const authItems: EnvVarEntry[] = [];

  for (const provider of Object.keys(authEnvRequirements) as AuthProvider[]) {
    if (!input.auth[provider]) continue;
    authItems.push(...requirementToEntries(authEnvRequirements[provider]));
  }

  entries.push(...authItems);

  return entries;
}
