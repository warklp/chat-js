import fs from "node:fs/promises";
import path from "node:path";
import { log } from "@clack/prompts";
import { resolveRegistryItems } from "../registry/resolve";
import type { EnvRequirement } from "../registry/schema";
import { createEmptyToolsTemplate, createEmptyUiTemplate, injectTool } from "./inject-tool";
import { installDependencies } from "./install-deps";
import { spinner } from "./spinner";
import { writeToolFiles } from "./write-files";

function isRequirementSatisfied(
  requirement: EnvRequirement,
  env: NodeJS.ProcessEnv
): boolean {
  return requirement.options.some((option) =>
    option.every((name) => Boolean(env[name]))
  );
}

function formatRequirementDescription(requirement: EnvRequirement): string {
  return (
    requirement.description ??
    requirement.options.map((option) => option.join(" + ")).join(" or ")
  );
}

export async function installRegistryTools({
  tools,
  cwd,
  toolsDir,
  toolsAlias,
  overwrite = false,
  registryUrl,
  installDependenciesNow = true,
}: {
  tools: string[];
  cwd: string;
  toolsDir: string;
  toolsAlias: string;
  overwrite?: boolean;
  registryUrl?: string;
  installDependenciesNow?: boolean;
}): Promise<void> {
  if (tools.length === 0) {
    return;
  }

  const toolsIndexPath = path.join(toolsDir, "tools.ts");
  const uiIndexPath = path.join(toolsDir, "ui.ts");
  const processedItems = new Set<string>();

  for (const name of tools) {
    log.step(`Installing ${name}`);

    const fetchSpinner = spinner(`Fetching ${name}...`);
    fetchSpinner.start();
    let resolution: Awaited<ReturnType<typeof resolveRegistryItems>>;
    try {
      resolution = await resolveRegistryItems([name], registryUrl);
      fetchSpinner.succeed(`Fetched ${name}`);
    } catch (err) {
      fetchSpinner.fail(`Failed to fetch ${name}`);
      throw err;
    }

    const itemsToInstall = resolution.items.filter((item) => {
      if (processedItems.has(item.name)) {
        return false;
      }
      processedItems.add(item.name);
      return true;
    });

    const filesToWrite = itemsToInstall.flatMap((item) => item.files);
    const dependencies = Array.from(
      new Set(itemsToInstall.flatMap((item) => item.dependencies ?? []))
    );
    const devDependencies = Array.from(
      new Set(itemsToInstall.flatMap((item) => item.devDependencies ?? []))
    );
    const missingEnvRequirements = itemsToInstall.flatMap((item) =>
      (item.envRequirements ?? [])
        .filter((requirement) => !isRequirementSatisfied(requirement, process.env))
        .map((requirement) => ({
          tool: item.name,
          requirement: formatRequirementDescription(requirement),
        }))
    );
    const mainItem = resolution.items.find((item) => item.name === name);

    try {
      const writeSpinner = spinner("Writing files...");
      writeSpinner.start();
      const { written, existing } = await writeToolFiles(filesToWrite, {
        overwrite,
        toolsDir,
        toolsAlias,
      });
      if (existing.length > 0 && !overwrite) {
        writeSpinner.fail(
          `Refusing to overwrite existing tool files: ${existing
            .map((file) => path.relative(cwd, file))
            .join(", ")}`
        );
        throw new Error(
          `Tool install would overwrite existing files. Re-run with overwrite enabled.`
        );
      }
      writeSpinner.succeed(
        written.length > 0
          ? `Wrote ${written.map((file) => path.relative(cwd, file)).join(", ")}`
          : `No file changes needed for ${name}`
      );
    } catch (err) {
      log.error("Failed to write files");
      throw err;
    }

    if (dependencies.length > 0 || devDependencies.length > 0) {
      const depsSpinner = spinner(
        installDependenciesNow
          ? "Installing dependencies..."
          : "Updating package.json dependencies..."
      );
      depsSpinner.start();
      try {
        await installDependencies(
          dependencies,
          devDependencies,
          cwd,
          installDependenciesNow
        );
        const installed = [
          ...dependencies,
          ...devDependencies.map((dep) => `${dep} (dev)`),
        ];
        depsSpinner.succeed(
          `${installDependenciesNow ? "Installed" : "Recorded"}: ${installed.join(", ")}`
        );
      } catch (err) {
        depsSpinner.fail(
          installDependenciesNow
            ? "Failed to install dependencies"
            : "Failed to update package.json dependencies"
        );
        throw err;
      }
    }

    if (missingEnvRequirements.length > 0) {
      const details = missingEnvRequirements
        .map(({ tool, requirement }) => `${tool}: ${requirement}`)
        .join(", ");
      log.warn(`Missing env vars for installed tools: ${details}`);
    }

    const injectSpinner = spinner("Updating tool registry index...");
    injectSpinner.start();
    try {
      let toolsSource: string;
      let uiSource: string;
      try {
        toolsSource = await fs.readFile(toolsIndexPath, "utf8");
      } catch {
        toolsSource = createEmptyToolsTemplate();
      }
      try {
        uiSource = await fs.readFile(uiIndexPath, "utf8");
      } catch {
        uiSource = createEmptyUiTemplate();
      }
      const shouldInject =
        mainItem?.files.some(
          (file) => file.type === "tool" || file.type === "renderer"
        ) ?? false;
      const updated = shouldInject
        ? injectTool({
            toolsSource,
            uiSource,
            name,
            toolsAlias,
          })
        : { toolsSource, uiSource };
      await fs.mkdir(path.dirname(toolsIndexPath), { recursive: true });
      await fs.writeFile(toolsIndexPath, updated.toolsSource, "utf8");
      await fs.writeFile(uiIndexPath, updated.uiSource, "utf8");
      injectSpinner.succeed("Updated tool registry index");
    } catch (err) {
      injectSpinner.fail("Failed to update tool registry index");
      throw err;
    }
  }
}
