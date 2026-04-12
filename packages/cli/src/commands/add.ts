import fs from "node:fs/promises";
import path from "node:path";
import { confirm, intro, isCancel, log, outro } from "@clack/prompts";
import { Command } from "commander";
import { resolveRegistryItems } from "../registry/resolve";
import type { EnvRequirement } from "../registry/schema";
import { loadProjectConfig, resolveToolsPath } from "../utils/get-config";
import { handleError } from "../utils/handle-error";
import {
  createEmptyToolsTemplate,
  createEmptyUiTemplate,
  injectTool,
} from "../utils/inject-tool";
import { installDependencies } from "../utils/install-deps";
import { spinner } from "../utils/spinner";
import { writeToolFiles } from "../utils/write-files";

function formatRequirementDescription(requirement: EnvRequirement): string {
  return (
    requirement.description ??
    requirement.options.map((option) => option.join(" + ")).join(" or ")
  );
}

export const add = new Command()
  .name("add")
  .description("add a tool to an existing ChatJS project")
  .argument("[tools...]", "tool names to add (e.g. word-count)")
  .option("-y, --yes", "skip confirmation prompt", false)
  .option("-o, --overwrite", "overwrite existing files without prompting", false)
  .option(
    "-c, --cwd <cwd>",
    "the working directory (defaults to current directory)",
    process.cwd()
  )
  .option(
    "-r, --registry <url>",
    "registry URL or local path template (e.g. ./packages/registry/items/{name}.json)"
  )
  .action(async (tools: string[], opts) => {
    try {
      const cwd = path.resolve(opts.cwd);

      if (tools.length === 0) {
        log.error(
          "Please specify one or more tool names, e.g. chatjs add word-count"
        );
        process.exit(1);
      }

      // Preflight: ensure this is a ChatJS project
      try {
        await fs.stat(path.join(cwd, "chat.config.ts"));
      } catch {
        log.error(
          "No chat.config.ts found. Run `chat-js create` first or specify --cwd."
        );
        process.exit(1);
      }

      intro("chatjs add");

      // Load project config to resolve the tools directory
      const configSpinner = spinner("Loading project config...");
      configSpinner.start();
      let config: { paths: { tools: string } };
      try {
        config = await loadProjectConfig(cwd);
        configSpinner.succeed("Project config loaded");
      } catch (err) {
        configSpinner.fail("Failed to load project config");
        throw err;
      }

      const toolsDir = resolveToolsPath(config.paths.tools, cwd);
      const toolsIndexPath = path.join(toolsDir, "tools.ts");
      const uiIndexPath = path.join(toolsDir, "ui.ts");

      // Confirm installation unless --yes
      if (!opts.yes) {
        const answer = await confirm({
          message: `Install ${tools.join(", ")} into ${path.relative(process.cwd(), toolsDir)}/?`,
        });
        if (isCancel(answer) || !answer) {
          outro("Cancelled.");
          process.exit(0);
        }
      }

      // Install each tool
      const processedItems = new Set<string>();
      for (const name of tools) {
        log.step(`Installing ${name}`);

        // 1. Resolve the full registry tree
        const fetchSpinner = spinner(`Fetching ${name}...`);
        fetchSpinner.start();
        let resolution: Awaited<ReturnType<typeof resolveRegistryItems>>;
        try {
          resolution = await resolveRegistryItems([name], opts.registry);
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
        const requiredEnvRequirements = itemsToInstall.flatMap((item) =>
          (item.envRequirements ?? []).map((requirement) => ({
            tool: item.name,
            requirement: formatRequirementDescription(requirement),
          }))
        );
        const mainItem = resolution.items.find((item) => item.name === name);

        // 2. Write files to disk
        const overwrite = opts.overwrite as boolean;
        try {
          // First pass: skip existing files unless --overwrite
          const writeSpinner = spinner("Writing files...");
          writeSpinner.start();
          const { written, existing } = await writeToolFiles(filesToWrite, {
            overwrite,
            toolsDir,
            toolsAlias: config.paths.tools,
          });
          writeSpinner.stop();

          if (existing.length > 0 && !overwrite) {
            const answer = await confirm({
              message: `${existing.map((f) => path.relative(cwd, f)).join(", ")} already exist. Overwrite?`,
            });
            if (isCancel(answer) || !answer) {
              log.warn(
                `Kept existing files for ${name}; installed remaining new files`
              );
            } else {
              // Write the files that were skipped
              const { written: rest } = await writeToolFiles(filesToWrite, {
                overwrite: true,
                toolsDir,
                toolsAlias: config.paths.tools,
              });
              written.push(...rest);
            }
          }

          if (written.length > 0) {
            log.step(written.map((f) => path.relative(cwd, f)).join(", "));
          } else {
            log.step(`No file changes needed for ${name}`);
          }
        } catch (err) {
          log.error("Failed to write files");
          throw err;
        }

        // 3. Install npm dependencies
        if (dependencies.length > 0 || devDependencies.length > 0) {
          const depsSpinner = spinner("Installing dependencies...");
          depsSpinner.start();
          try {
            await installDependencies(dependencies, devDependencies, cwd);
            const installed = [
              ...dependencies,
              ...devDependencies.map((dep) => `${dep} (dev)`),
            ];
            depsSpinner.succeed(`Installed: ${installed.join(", ")}`);
          } catch (err) {
            depsSpinner.fail("Failed to install dependencies");
            throw err;
          }
        }

        if (requiredEnvRequirements.length > 0) {
          const details = requiredEnvRequirements
            .map(({ tool, requirement }) => `${tool}: ${requirement}`)
            .join(", ");
          log.warn(`Required env vars for installed tools: ${details}`);
        }

        // 4. Inject into the CLI-managed registry files
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
                toolsAlias: config.paths.tools,
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

      outro(
        `Done! ${tools.length === 1 ? `"${tools[0]}"` : `${tools.length} tools`} installed successfully.`
      );
    } catch (error) {
      handleError(error);
    }
  });
