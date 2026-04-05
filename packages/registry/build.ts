/**
 * Build script — generates items/*.json and index.json from src/{name}/.
 *
 * Each tool directory must contain:
 *   tool.ts       — backend tool implementation
 *   renderer.tsx  — frontend renderer component
 *   meta.json     — { description, extraDependencies? }
 *
 * npm dependencies are auto-detected from import statements in tool.ts and
 * renderer.tsx. Use extraDependencies in meta.json only for packages that are
 * loaded dynamically (e.g. via require()) and would be missed by static analysis.
 *
 * Run: bun run build
 */

import fs from "node:fs/promises";
import path from "node:path";
import {
  readStaticToolMetadata,
  type StaticEnvRequirement,
} from "./src/static-tool-metadata";

const srcDir = new URL("./src", import.meta.url).pathname;
const appToolsDir = new URL(
  "../../apps/chat/tools/chatjs",
  import.meta.url
).pathname;
const itemsDir = new URL("./items", import.meta.url).pathname;
const indexPath = new URL("./index.json", import.meta.url).pathname;

// Node.js built-in module names (node: prefix is handled separately)
const NODE_BUILTINS = new Set([
  "assert", "buffer", "child_process", "cluster", "console", "constants",
  "crypto", "dgram", "dns", "domain", "events", "fs", "http", "http2",
  "https", "module", "net", "os", "path", "perf_hooks", "process",
  "punycode", "querystring", "readline", "repl", "stream", "string_decoder",
  "sys", "timers", "tls", "trace_events", "tty", "url", "util", "v8",
  "vm", "worker_threads", "zlib",
]);

/**
 * Extract npm package names from static import/export statements in source code.
 * Filters out relative imports, Node built-ins, and the node: protocol.
 */
function extractNpmImports(source: string): string[] {
  const specifiers = new Set<string>();

  // Match: import ... from "specifier" / export ... from "specifier" / import("specifier")
  const staticRe = /(?:import|export)\s+(?:.*?\s+from\s+)?["']([^"']+)["']/g;
  const dynamicRe = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

  for (const re of [staticRe, dynamicRe]) {
    for (const m of source.matchAll(re)) {
      const spec = m[1];
      if (
        spec.startsWith(".") ||    // relative
        spec.startsWith("/") ||    // absolute path
        spec.startsWith("node:") || // explicit node: protocol
        spec.startsWith("@/") ||      // app path alias
        spec.startsWith("@toolkit/")  // registry-owned shared helpers
      ) continue;

      // Extract the package name (handles scoped packages like @org/pkg)
      const pkg = spec.startsWith("@")
        ? spec.split("/").slice(0, 2).join("/")
        : spec.split("/")[0];

      if (!NODE_BUILTINS.has(pkg)) {
        specifiers.add(pkg);
      }
    }
  }

  return [...specifiers].sort();
}

type Meta = {
  description: string;
  extraDependencies?: string[];
  devDependencies?: string[];
  registryDependencies?: string[];
  files?: Array<{
    source: string;
    target: string;
    type: "tool" | "renderer" | "lib" | "component" | "hook";
  }>;
};

async function fileExists(filePath: string): Promise<boolean> {
  return fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);
}

async function main(): Promise<void> {
  await fs.mkdir(itemsDir, { recursive: true });

  const entries = await fs.readdir(srcDir);
  const dirs: string[] = [];
  for (const entry of entries) {
    const stat = await fs.stat(path.join(srcDir, entry));
    if (stat.isDirectory()) dirs.push(entry);
  }

  const index: { name: string; description: string }[] = [];

  for (const name of dirs) {
    const dir = path.join(srcDir, name);

    const meta: Meta = JSON.parse(
      await fs.readFile(path.join(dir, "meta.json"), "utf8")
    );
    const appDir = path.join(appToolsDir, name);
    const registryFiles: Array<{
      path: string;
      type: "tool" | "renderer" | "lib" | "component" | "hook";
      target: string;
      content: string;
    }> = [];

    const detected = new Set<string>();
    let envRequirements: StaticEnvRequirement[] = [];

    const registryToolPath = path.join(dir, "tool.ts");
    const registryRendererPath = path.join(dir, "renderer.tsx");
    const toolPath =
      (await fileExists(registryToolPath))
        ? registryToolPath
        : path.join(appDir, "tool.ts");
    const rendererPath =
      (await fileExists(registryRendererPath))
        ? registryRendererPath
        : path.join(appDir, "renderer.tsx");

    if (await fileExists(toolPath)) {
      const toolContent = await fs.readFile(toolPath, "utf8");
      registryFiles.push({
        path: "tool.ts",
        type: "tool",
        target: `${name}/tool.ts`,
        content: toolContent,
      });
      for (const dependency of extractNpmImports(toolContent)) {
        detected.add(dependency);
      }
      const metadata = readStaticToolMetadata(toolContent);
      envRequirements = metadata.envRequirements;
    }

    if (await fileExists(rendererPath)) {
      const rendererContent = await fs.readFile(rendererPath, "utf8");
      registryFiles.push({
        path: "renderer.tsx",
        type: "renderer",
        target: `${name}/renderer.tsx`,
        content: rendererContent,
      });
      for (const dependency of extractNpmImports(rendererContent)) {
        detected.add(dependency);
      }
    }

    for (const file of meta.files ?? []) {
      const content = await fs.readFile(path.join(dir, file.source), "utf8");
      registryFiles.push({
        path: file.source,
        type: file.type,
        target: file.target,
        content,
      });
      for (const dependency of extractNpmImports(content)) {
        detected.add(dependency);
      }
    }

    for (const dep of meta.extraDependencies ?? []) detected.add(dep);
    const dependencies = [...detected].sort();

    const item = {
      name,
      description: meta.description,
      ...(dependencies.length > 0 ? { dependencies } : {}),
      ...(meta.devDependencies?.length
        ? { devDependencies: [...new Set(meta.devDependencies)].sort() }
        : {}),
      ...(meta.registryDependencies?.length
        ? {
            registryDependencies: [
              ...new Set(meta.registryDependencies),
            ].sort(),
          }
        : {}),
      ...(envRequirements.length > 0 ? { envRequirements } : {}),
      files: registryFiles,
    };

    await fs.writeFile(
      path.join(itemsDir, `${name}.json`),
      JSON.stringify(item, null, 2) + "\n"
    );

    index.push({ name, description: meta.description });
    console.log(
      `  built ${name} (deps: ${dependencies.join(", ") || "none"})`
    );
  }

  await fs.writeFile(indexPath, JSON.stringify(index, null, 2) + "\n");

  console.log(`\n✓ ${dirs.length} tool(s) → items/ + index.json`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
