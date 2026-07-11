import { getProvider, type ProviderSlug } from "files-sdk/providers";

export type StorageEnvironmentVariable = {
  aliases: readonly string[];
  key: string;
};

export type StorageEnvironmentRequirement = {
  description: string;
  options: StorageEnvironmentVariable[][];
};

const STORAGE_OPTION_HINT = /or pass `([^`]+)`/;

export function getStorageEnvironmentRequirements(
  provider: ProviderSlug,
  adapterOptions: Record<string, unknown> = {}
): StorageEnvironmentRequirement[] {
  const metadata = getProvider(provider);
  if (!metadata) {
    return [];
  }

  const toVariable = (variable: {
    aliases?: readonly string[];
    key: string;
  }): StorageEnvironmentVariable => ({
    aliases: variable.aliases ?? [],
    key: variable.key,
  });
  const requirements: StorageEnvironmentRequirement[] = [];
  const required = metadata.env.required?.filter((variable) => {
    const optionName = STORAGE_OPTION_HINT.exec(variable.description)?.[1];
    return (
      variable.readBy === "files-sdk" &&
      !(optionName && adapterOptions[optionName] !== undefined)
    );
  });
  if (required?.length) {
    requirements.push({
      description: `${metadata.name} configuration`,
      options: [required.map(toVariable)],
    });
  }

  const credentialModes = metadata.env.credentialModes?.map((mode) =>
    mode.vars
      .filter((variable) => variable.readBy === "files-sdk")
      .map(toVariable)
  );
  if (
    credentialModes?.length &&
    credentialModes.every((mode) => mode.length > 0)
  ) {
    requirements.push({
      description: `${metadata.name} credentials`,
      options: credentialModes,
    });
  }

  return requirements;
}
