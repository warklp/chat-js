import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

type PublishMode = "always" | "never";

function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
  const result = spawnSync(command, args, {
    cwd: resolve(__dirname, ".."),
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const [, , target = "dir", publishMode = "never"] = process.argv;

if (publishMode !== "always" && publishMode !== "never") {
  throw new Error(`Invalid publish mode: ${publishMode}`);
}

const env = {
  ...process.env,
  NODE_ENV: "production",
  ELECTRON_CACHE:
    process.env.ELECTRON_CACHE ?? join(resolve(__dirname, ".."), ".cache", "electron"),
  ELECTRON_BUILDER_CACHE:
    process.env.ELECTRON_BUILDER_CACHE ??
    join(resolve(__dirname, ".."), ".cache", "electron-builder"),
};

run("bun", ["run", "prebuild"], env);
run("bun", ["run", "build"], env);
run("bun", [
  "x",
  "electron-builder",
  "--config",
  "./electron-builder.config.js",
  `--${target}`,
  `--publish=${publishMode}`,
], env);
