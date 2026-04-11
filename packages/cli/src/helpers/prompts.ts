import {
	cancel,
	confirm,
	isCancel,
	multiselect,
	select,
	text,
} from "@clack/prompts";
import {
  authEnvRequirements,
  featureEnvRequirements,
  gatewayEnvRequirements,
} from "./config-requirements";
import {
  AUTH_PROVIDERS,
  FEATURE_KEYS,
  GATEWAYS,
  type AuthProvider,
  type FeatureKey,
  type Gateway,
} from "../types";
import { highlighter } from "../utils/highlighter";
import { logger } from "../utils/logger";

const FEATURE_DEFAULTS: Record<FeatureKey, boolean> = {
	sandbox: false,
	webSearch: false,
	urlRetrieval: false,
	deepResearch: false,
	mcp: false,
	imageGeneration: false,
	attachments: false,
	followupSuggestions: true,
  parallelResponses: true,
};

const AUTH_DEFAULTS: Record<AuthProvider, boolean> = {
	google: false,
	github: true,
	vercel: false,
};

const FEATURE_LABELS: Record<FeatureKey, string> = {
	sandbox: "Code Sandbox",
	webSearch: "Web Search",
	urlRetrieval: "URL Retrieval",
	deepResearch: "Deep Research",
	mcp: "MCP Tool Servers",
	imageGeneration: "Image Generation",
	attachments: "File Attachments",
	followupSuggestions: "Follow-up Suggestions",
  parallelResponses: "Parallel Responses",
};

const AUTH_LABELS: Record<AuthProvider, string> = {
	google: "Google OAuth",
	github: "GitHub OAuth",
	vercel: "Vercel OAuth",
};

function handleCancel(value: unknown): asserts value is never {
	if (isCancel(value)) {
		cancel("Operation cancelled.");
		process.exit(1);
	}
}

function toKebabCase(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function promptProjectName(
	targetArg: string | undefined,
	skipPrompt: boolean,
): Promise<string> {
	if (skipPrompt)
		return toKebabCase(targetArg ?? "my-chat-app") || "my-chat-app";

  const name = await text({
    message: "What is your project named?",
    initialValue: targetArg ?? "my-chat-app",
    validate: (value?: string) => {
      const kebab = toKebabCase(value);
      if (!kebab) return "Please enter a valid project name";
    },
  });
  handleCancel(name);

	return toKebabCase(name) || "my-chat-app";
}

export async function promptGateway(skipPrompt: boolean): Promise<Gateway> {
	if (skipPrompt) return "vercel";

  const gateway = await select({
    message: `Which ${highlighter.info("AI gateway")} would you like to use?`,
    options: GATEWAYS.map((gw) => ({
      value: gw,
      label: gw,
      hint: gatewayEnvRequirements[gw].description,
    })),
    initialValue: "vercel" as Gateway,
  });
  handleCancel(gateway);

	return gateway;
}

export async function promptFeatures(
	skipPrompt: boolean,
): Promise<Record<FeatureKey, boolean>> {
	if (skipPrompt) return { ...FEATURE_DEFAULTS };

	const defaultFeatures = FEATURE_KEYS.filter((key) => FEATURE_DEFAULTS[key]);

	const selectedFeatures = await multiselect({
		message: `Which ${highlighter.info("features")} would you like to enable? ${highlighter.dim("(space to toggle, enter to submit)")}`,
		options: FEATURE_KEYS.map((key) => ({
			value: key,
			label: FEATURE_LABELS[key],
			hint: featureEnvRequirements[key as keyof typeof featureEnvRequirements]
				?.description,
		})),
		initialValues: defaultFeatures,
		required: false,
	});
	handleCancel(selectedFeatures);

	const features: Record<FeatureKey, boolean> = { ...FEATURE_DEFAULTS };
	for (const key of FEATURE_KEYS) {
		features[key] = false;
	}
	for (const key of selectedFeatures as FeatureKey[]) {
		features[key] = true;
	}

	if (features.deepResearch) {
		features.webSearch = true;
	}

	return features;
}

export async function promptAuth(
	skipPrompt: boolean,
): Promise<Record<AuthProvider, boolean>> {
	if (skipPrompt) return { ...AUTH_DEFAULTS };

  const defaultProviders = AUTH_PROVIDERS.filter((p) => AUTH_DEFAULTS[p]);

	let selectedProviders: AuthProvider[] = [];

  while (selectedProviders.length === 0) {
    const selected = await multiselect({
      message: `Which ${highlighter.info("auth providers")} would you like to enable? ${highlighter.warn("(at least one required)")} ${highlighter.dim("(space to toggle, enter to submit)")}`,
      options: AUTH_PROVIDERS.map((p) => ({
        value: p,
        label: AUTH_LABELS[p],
        hint: authEnvRequirements[p].description,
      })),
      initialValues: defaultProviders,
      required: false,
    });
    handleCancel(selected);

		selectedProviders = selected as AuthProvider[];
		if (selectedProviders.length === 0) {
			logger.warn("At least one auth provider is required. Please select one.");
		}
	}

	const auth: Record<AuthProvider, boolean> = {
		google: false,
		github: false,
		vercel: false,
	};
	for (const p of selectedProviders) {
		auth[p] = true;
	}

	return auth;
}

export async function promptElectron(
	skipPrompt: boolean,
	explicitChoice?: boolean,
): Promise<boolean> {
	if (typeof explicitChoice === "boolean") {
		return explicitChoice;
	}

	if (skipPrompt) return false;

	const wantsElectron = await confirm({
		message: `Include an ${highlighter.info("Electron")} desktop app?`,
		initialValue: false,
	});
	handleCancel(wantsElectron);

	return wantsElectron;
}

export async function promptInstall(
	packageManager: string,
	skipPrompt: boolean,
): Promise<boolean> {
	if (skipPrompt) return true;

	const install = await confirm({
		message: `Install dependencies with ${highlighter.info(packageManager)}?`,
		initialValue: true,
	});
	handleCancel(install);

	return install;
}
