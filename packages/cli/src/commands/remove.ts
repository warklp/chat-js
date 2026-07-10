import fs from "node:fs/promises";
import path from "node:path";
import { confirm, intro, isCancel, log, outro } from "@clack/prompts";
import { Command } from "commander";
import { loadProjectConfig, resolveToolsPath } from "../utils/get-config";
import { handleError } from "../utils/handle-error";
import { removeRegistryTools } from "../utils/remove-registry-tools";
import { spinner } from "../utils/spinner";

export const remove = new Command()
  .name("remove")
  .description("remove a tool from an existing ChatJS project")
  .argument("[tools...]", "tool names to remove (e.g. word-count)")
  .option("-y, --yes", "skip confirmation prompt", false)
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
          "Please specify one or more tool names, e.g. chatjs remove word-count"
        );
        process.exit(1);
      }

      try {
        await fs.stat(path.join(cwd, "chat.config.ts"));
      } catch {
        log.error(
          "No chat.config.ts found. Run `chat-js create` first or specify --cwd."
        );
        process.exit(1);
      }

      intro("chatjs remove");

      const configSpinner = spinner("Loading project config...");
      configSpinner.start();
      let config: { paths: { tools: string } };
      try {
        config = await loadProjectConfig(cwd);
        configSpinner.succeed("Project config loaded");
      } catch (error) {
        configSpinner.fail("Failed to load project config");
        throw error;
      }

      const toolsDir = resolveToolsPath(config.paths.tools, cwd);

      if (!opts.yes) {
        const answer = await confirm({
          message: `Remove ${tools.join(", ")} from ${path.relative(
            process.cwd(),
            toolsDir
          )}/?`,
        });
        if (isCancel(answer) || !answer) {
          outro("Cancelled.");
          process.exit(0);
        }
      }

      await removeRegistryTools({
        tools,
        cwd,
        toolsDir,
        toolsAlias: config.paths.tools,
        registryUrl: opts.registry,
      });

      outro(
        `Done! ${
          tools.length === 1 ? `"${tools[0]}"` : `${tools.length} tools`
        } removed successfully.`
      );
    } catch (error) {
      handleError(error);
    }
  });
