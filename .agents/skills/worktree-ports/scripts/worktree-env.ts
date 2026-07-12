#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { dirname, join, parse, resolve } from "node:path";
import { spawn } from "bun";
import {
  loadWorkgroveConfig,
  resolveWorkgroveRuntime,
} from "workgrove/config";

const args = process.argv.slice(2);
function findConfig(start: string): string {
  let directory = resolve(start);
  const root = parse(directory).root;
  while (true) {
    const candidate = join(directory, ".workgrove.json");
    if (existsSync(candidate)) {
      return candidate;
    }
    if (directory === root) {
      throw new Error(`Missing worktree environment config above ${start}`);
    }
    directory = dirname(directory);
  }
}

const configFile = findConfig(process.cwd());
const config = loadWorkgroveConfig(configFile);
const runtime = resolveWorkgroveRuntime(config, process.env);

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (args[0] === "--info") {
  const info = { ...runtime, configFile };
  if (args[1] === "--json") {
    console.log(JSON.stringify(info, null, 2));
  } else {
    console.log(`Worktree slot ${runtime.slot}`);
    for (const [name, app] of Object.entries(runtime.apps)) {
      console.log(`${name}: ${app.url} (port ${app.port})`);
    }
  }
  process.exit(0);
}

const appName = args.shift();
if (!appName) {
  fail("Usage: worktree-env <app> -- <command>");
}

const app = runtime.apps[appName];
if (!app) {
  fail(
    `Unknown worktree app "${appName}". Expected one of: ${Object.keys(runtime.apps).join(", ")}`
  );
}

if (args[0] === "--") {
  args.shift();
}
if (args.length === 0) {
  fail("worktree-env requires a command to run");
}

console.log(`Worktree slot ${runtime.slot} · ${appName} → ${app.url}`);

const child = (() => {
  try {
    return spawn(args, {
      env: {
        ...process.env,
        ...app.env,
      },
      stderr: "inherit",
      stdin: "inherit",
      stdout: "inherit",
    });
  } catch (error) {
    fail(
      `Failed to start "${args[0]}": ${error instanceof Error ? error.message : String(error)}`
    );
  }
})();

process.on("SIGTERM", () => child.kill("SIGTERM"));

process.exit(await child.exited);
