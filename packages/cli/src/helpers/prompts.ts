import {
	cancel,
	confirm,
	isCancel,
	multiselect,
	select,
	text,
} from "@clack/prompts";
import type { RegistryIndexItem } from "../registry/fetch";
import {
	AUTH_PROVIDERS,
	type AuthProvider,
	BUILT_IN_TOOL_KEYS,
	type BuiltInToolKey,
	CORE_FEATURE_KEYS,
	type CoreFeatureKey,
	DOCUMENT_TYPE_KEYS,
	type DocumentTypeKey,
	GATEWAYS,
	type Gateway,
} from "../types";
import { highlighter } from "../utils/highlighter";
import { logger } from "../utils/logger";
import {
	authEnvRequirements,
	builtInToolEnvRequirements,
	coreFeatureEnvRequirements,
	gatewayEnvRequirements,
} from "./config-requirements";

const CORE_FEATURE_DEFAULTS: Record<CoreFeatureKey, boolean> = {
	attachments: false,
	parallelResponses: true,
	documents: true,
	mcp: false,
	followupSuggestions: true,
};

const DOCUMENT_TYPE_DEFAULTS: Record<DocumentTypeKey, boolean> = {
	text: true,
	code: true,
	sheet: true,
};

const BUILT_IN_TOOL_DEFAULTS: Record<BuiltInToolKey, boolean> = {
	webSearch: false,
	urlRetrieval: false,
	deepResearch: false,
	codeExecution: false,
	imageGeneration: false,
	videoGeneration: false,
};

const AUTH_DEFAULTS: Record<AuthProvider, boolean> = {
	google: false,
	github: true,
	vercel: false,
};

const CORE_FEATURE_LABELS: Record<CoreFeatureKey, string> = {
	attachments: "Attachments",
	parallelResponses: "Parallel Responses",
	documents: "Documents",
	mcp: "MCP Tool Servers",
	followupSuggestions: "Follow-up Suggestions",
};

const DOCUMENT_TYPE_LABELS: Record<DocumentTypeKey, string> = {
	text: "Text Documents",
	code: "Code Documents",
	sheet: "Spreadsheet Documents",
};

const DOCUMENT_TYPE_HINTS: Record<DocumentTypeKey, string> = {
	text: "Notes, guides, markdown, and long-form writing",
	code: "Code files and snippets",
	sheet: "CSV-based tables and structured data",
};

const BUILT_IN_TOOL_LABELS: Record<BuiltInToolKey, string> = {
	webSearch: "Web Search",
	urlRetrieval: "URL Retrieval",
	deepResearch: "Deep Research",
	codeExecution: "Code Sandbox",
	imageGeneration: "Image Generation",
	videoGeneration: "Video Generation",
};

const BUILT_IN_TOOL_HINTS: Record<BuiltInToolKey, string> = {
	webSearch: "Search the web from chat",
	urlRetrieval: "Fetch structured content from a specific URL",
	deepResearch: "Run multi-step web research and generate reports",
	codeExecution: "Execute code in a sandboxed environment",
	imageGeneration: "Generate images inside chat",
	videoGeneration: "Generate videos inside chat",
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

function toSelectionRecord<T extends string>(
	keys: readonly T[],
	selected: readonly string[],
): Record<T, boolean> {
	return Object.fromEntries(
		keys.map((key) => [key, selected.includes(key)]),
	) as Record<T, boolean>;
}

export async function promptProjectName(
	targetArg: string | undefined,
	skipPrompt: boolean,
): Promise<string> {
	if (skipPrompt) {
		return toKebabCase(targetArg ?? "my-chat-app") || "my-chat-app";
	}

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

export async function promptCoreFeatures(
	skipPrompt: boolean,
): Promise<Record<CoreFeatureKey, boolean>> {
	if (skipPrompt) return { ...CORE_FEATURE_DEFAULTS };

	const selected = await multiselect({
		message: `Which ${highlighter.info("core features")} would you like to enable? ${highlighter.dim("(space to toggle, enter to submit)")}`,
		options: CORE_FEATURE_KEYS.map((key) => ({
			value: key,
			label: CORE_FEATURE_LABELS[key],
			hint:
				key === "documents"
					? "Create, edit, and review documents in chat"
					: coreFeatureEnvRequirements[
							key as keyof typeof coreFeatureEnvRequirements
						]?.description,
		})),
		initialValues: CORE_FEATURE_KEYS.filter(
			(key) => CORE_FEATURE_DEFAULTS[key],
		),
		required: false,
	});
	handleCancel(selected);

	return toSelectionRecord(CORE_FEATURE_KEYS, selected as CoreFeatureKey[]);
}

export async function promptDocumentTypes(
	skipPrompt: boolean,
	documentsEnabled: boolean,
): Promise<Record<DocumentTypeKey, boolean>> {
	if (!documentsEnabled) {
		return toSelectionRecord(DOCUMENT_TYPE_KEYS, []);
	}

	if (skipPrompt) return { ...DOCUMENT_TYPE_DEFAULTS };

	const selected = await multiselect({
		message: `Which ${highlighter.info("document types")} would you like to enable? ${highlighter.dim("(space to toggle, enter to submit)")}`,
		options: DOCUMENT_TYPE_KEYS.map((key) => ({
			value: key,
			label: DOCUMENT_TYPE_LABELS[key],
			hint: DOCUMENT_TYPE_HINTS[key],
		})),
		initialValues: DOCUMENT_TYPE_KEYS.filter(
			(key) => DOCUMENT_TYPE_DEFAULTS[key],
		),
		required: false,
	});
	handleCancel(selected);

	return toSelectionRecord(DOCUMENT_TYPE_KEYS, selected as DocumentTypeKey[]);
}

export async function promptAssistantTools(
	registryItems: RegistryIndexItem[],
	skipPrompt: boolean,
): Promise<{
	builtInTools: Record<BuiltInToolKey, boolean>;
	installableTools: string[];
}> {
	const installableItems = registryItems.filter((item) => !item.hidden);

	if (skipPrompt) {
		return {
			builtInTools: { ...BUILT_IN_TOOL_DEFAULTS },
			installableTools: [],
		};
	}

	const selected = await multiselect({
		message: `Which ${highlighter.info("assistant tools")} would you like to enable? ${highlighter.dim("(space to toggle, enter to submit)")}`,
		options: [
			...BUILT_IN_TOOL_KEYS.map((key) => ({
				value: key,
				label: BUILT_IN_TOOL_LABELS[key],
				hint:
					builtInToolEnvRequirements[
						key as keyof typeof builtInToolEnvRequirements
					]?.description ?? BUILT_IN_TOOL_HINTS[key],
			})),
			...installableItems.map((item) => ({
				value: item.name,
				label: item.name,
				hint: item.description,
			})),
		],
		initialValues: BUILT_IN_TOOL_KEYS.filter(
			(key) => BUILT_IN_TOOL_DEFAULTS[key],
		),
		required: false,
	});
	handleCancel(selected);

	const selectedValues = selected as string[];
	const builtInTools = toSelectionRecord(
		BUILT_IN_TOOL_KEYS,
		selectedValues.filter((value): value is BuiltInToolKey =>
			(BUILT_IN_TOOL_KEYS as readonly string[]).includes(value),
		),
	);
	if (builtInTools.deepResearch) {
		builtInTools.webSearch = true;
	}

	return {
		builtInTools,
		installableTools: selectedValues.filter(
			(value) => !(BUILT_IN_TOOL_KEYS as readonly string[]).includes(value),
		),
	};
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

	return toSelectionRecord(AUTH_PROVIDERS, selectedProviders);
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
