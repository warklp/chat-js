import fs from "node:fs";
import type { PackageManager } from "../types";

export function inferPackageManager(cwd = process.cwd()): PackageManager {
  const ua = process.env.npm_config_user_agent ?? "";
  if (ua.startsWith("pnpm/")) return "pnpm";
  if (ua.startsWith("yarn/")) return "yarn";
  if (ua.startsWith("npm/")) return "npm";
  if (ua.startsWith("bun/")) return "bun";

  if (fs.existsSync(`${cwd}/pnpm-lock.yaml`)) return "pnpm";
  if (fs.existsSync(`${cwd}/yarn.lock`)) return "yarn";
  if (fs.existsSync(`${cwd}/package-lock.json`)) return "npm";
  if (fs.existsSync(`${cwd}/bun.lock`) || fs.existsSync(`${cwd}/bun.lockb`)) {
    return "bun";
  }

  return "npm";
}
