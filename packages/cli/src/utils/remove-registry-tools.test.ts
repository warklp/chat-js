import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createEmptyToolsTemplate,
  createEmptyUiTemplate,
  injectTool,
} from "./inject-tool";
import { removeRegistryTools } from "./remove-registry-tools";

const tempDirs: string[] = [];

function makeTempDir(name: string): string {
  const dir = join(tmpdir(), `chat-js-remove-${name}-${crypto.randomUUID()}`);
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

describe("removeRegistryTools", () => {
  it("removes installed tool files and registry index entries", async () => {
    const cwd = makeTempDir("project");
    const toolsDir = join(cwd, "tools", "chatjs");
    const registryDir = join(cwd, "registry", "items");
    const installed = injectTool({
      toolsSource: createEmptyToolsTemplate(),
      uiSource: createEmptyUiTemplate(),
      name: "word-count",
      toolsAlias: "@/tools/chatjs",
    });

    await mkdir(join(toolsDir, "word-count"), { recursive: true });
    await mkdir(registryDir, { recursive: true });
    await writeFile(join(toolsDir, "tools.ts"), installed.toolsSource);
    await writeFile(join(toolsDir, "ui.ts"), installed.uiSource);
    await writeFile(join(toolsDir, "word-count", "tool.ts"), "export {};\n");
    await writeFile(
      join(toolsDir, "word-count", "renderer.tsx"),
      "export {};\n"
    );
    await writeFile(
      join(registryDir, "word-count.json"),
      JSON.stringify({
        name: "word-count",
        description: "Count words",
        files: [
          {
            path: "tool.ts",
            type: "tool",
            target: "word-count/tool.ts",
            content: "",
          },
          {
            path: "renderer.tsx",
            type: "renderer",
            target: "word-count/renderer.tsx",
            content: "",
          },
        ],
      })
    );

    await removeRegistryTools({
      tools: ["word-count"],
      cwd,
      toolsDir,
      toolsAlias: "@/tools/chatjs",
      registryUrl: join(registryDir, "{name}.json"),
    });

    await expect(
      readFile(join(toolsDir, "word-count", "tool.ts"), "utf8")
    ).rejects.toThrow();
    await expect(
      readFile(join(toolsDir, "word-count", "renderer.tsx"), "utf8")
    ).rejects.toThrow();

    expect(await readFile(join(toolsDir, "tools.ts"), "utf8")).not.toContain(
      "wordCount"
    );
    expect(await readFile(join(toolsDir, "ui.ts"), "utf8")).not.toContain(
      "WordCountRenderer"
    );
  });

  it("uses the configured tools alias when recreating a missing registry index", async () => {
    const cwd = makeTempDir("project");
    const toolsDir = join(cwd, "src", "tools");
    const registryDir = join(cwd, "registry", "items");

    await mkdir(registryDir, { recursive: true });
    await writeFile(
      join(registryDir, "word-count.json"),
      JSON.stringify({
        name: "word-count",
        description: "Count words",
        files: [],
      })
    );

    await removeRegistryTools({
      tools: ["word-count"],
      cwd,
      toolsDir,
      toolsAlias: "~tools",
      registryUrl: join(registryDir, "{name}.json"),
    });

    expect(await readFile(join(toolsDir, "tools.ts"), "utf8")).toContain(
      'from "~tools/_shared/lib/runtime"'
    );
  });
});
