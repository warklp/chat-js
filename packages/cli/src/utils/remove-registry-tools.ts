import fs from "node:fs/promises";
import path from "node:path";
import { log } from "@clack/prompts";
import { fetchRegistryItem } from "../registry/fetch";
import type { RegistryToolItemFile } from "../registry/schema";
import {
  createEmptyToolsTemplate,
  createEmptyUiTemplate,
  removeTool,
} from "./inject-tool";
import { isSafeTarget } from "./is-safe-target";
import { spinner } from "./spinner";

const DEFAULT_TOOL_FILES = ["tool.ts", "renderer.tsx"] as const;

async function safeUnlink(filePath: string): Promise<boolean> {
  const stat = await fs.lstat(filePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  });

  if (!stat) {
    return false;
  }

  if (stat.isDirectory()) {
    return false;
  }

  if (stat.isSymbolicLink()) {
    throw new Error(`Refusing to remove symlinked file "${filePath}"`);
  }

  await fs.unlink(filePath);
  return true;
}

async function removeEmptyParents({
  startDir,
  stopDir,
}: {
  startDir: string;
  stopDir: string;
}): Promise<void> {
  let current = startDir;
  const resolvedStop = path.resolve(stopDir);

  while (current !== resolvedStop && current.startsWith(resolvedStop)) {
    const entries = await fs
      .readdir(current)
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
          return null;
        }
        throw error;
      });
    if (!entries || entries.length > 0) {
      return;
    }
    await fs.rmdir(current);
    current = path.dirname(current);
  }
}

async function fetchMainToolFiles({
  name,
  registryUrl,
}: {
  name: string;
  registryUrl?: string;
}): Promise<RegistryToolItemFile[]> {
  try {
    const item = await fetchRegistryItem(name, registryUrl);
    return item.files.filter((file) => file.target.startsWith(`${name}/`));
  } catch {
    log.warn(
      `Could not fetch registry metadata for ${name}; removing default tool files only.`
    );
    return DEFAULT_TOOL_FILES.map((file) => ({
      path: file,
      target: `${name}/${file}`,
      type: file === "renderer.tsx" ? "renderer" : "tool",
      content: "",
    }));
  }
}

export async function removeRegistryTools({
  tools,
  cwd,
  toolsDir,
  toolsAlias,
  registryUrl,
}: {
  tools: string[];
  cwd: string;
  toolsDir: string;
  toolsAlias: string;
  registryUrl?: string;
}): Promise<void> {
  if (tools.length === 0) {
    return;
  }

  const toolsIndexPath = path.join(toolsDir, "tools.ts");
  const uiIndexPath = path.join(toolsDir, "ui.ts");

  const collectSpinner = spinner(
    tools.length === 1
      ? `Resolving ${tools[0]}...`
      : `Resolving ${tools.length} tools...`
  );
  collectSpinner.start();
  const filesToRemove = (
    await Promise.all(
      tools.map((name) => fetchMainToolFiles({ name, registryUrl }))
    )
  ).flat();
  collectSpinner.succeed("Resolved installed files");

  const removeSpinner = spinner("Removing files...");
  removeSpinner.start();
  const removedFiles: string[] = [];
  for (const file of filesToRemove) {
    if (!isSafeTarget(file.target, toolsDir)) {
      throw new Error(
        `Refusing to remove "${file.target}" outside the tools directory`
      );
    }

    const dest = path.resolve(toolsDir, file.target);
    const removed = await safeUnlink(dest);
    if (removed) {
      removedFiles.push(dest);
      await removeEmptyParents({
        startDir: path.dirname(dest),
        stopDir: toolsDir,
      });
    }
  }
  removeSpinner.succeed(
    removedFiles.length > 0
      ? `Removed ${removedFiles.map((file) => path.relative(cwd, file)).join(", ")}`
      : `No installed files found for ${tools.join(", ")}`
  );

  const injectSpinner = spinner("Updating tool registry index...");
  injectSpinner.start();
  try {
    let toolsSource: string;
    let uiSource: string;
    try {
      toolsSource = await fs.readFile(toolsIndexPath, "utf8");
    } catch {
      toolsSource = createEmptyToolsTemplate(toolsAlias);
    }
    try {
      uiSource = await fs.readFile(uiIndexPath, "utf8");
    } catch {
      uiSource = createEmptyUiTemplate();
    }

    let updated = { toolsSource, uiSource };
    for (const name of tools) {
      updated = removeTool({
        toolsSource: updated.toolsSource,
        uiSource: updated.uiSource,
        name,
        toolsAlias,
      });
    }

    await fs.mkdir(path.dirname(toolsIndexPath), { recursive: true });
    await fs.writeFile(toolsIndexPath, updated.toolsSource, "utf8");
    await fs.writeFile(uiIndexPath, updated.uiSource, "utf8");
    injectSpinner.succeed("Updated tool registry index");
  } catch (error) {
    injectSpinner.fail("Failed to update tool registry index");
    throw error;
  }
}
