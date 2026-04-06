import { readdirSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
const branding = require("./branding.json") as {
  appName: string;
  appPrefix: string;
  appUrl: string;
  orgName?: string;
  orgEmail?: string;
};

const { appName, appPrefix, orgName, orgEmail } = branding;
const appRoot = __dirname;
const repoRoot = resolve(appRoot, "../..");

function runBunScript(script: string, env: NodeJS.ProcessEnv = {}): void {
  const result = spawnSync("bun", ["run", script], {
    stdio: "inherit",
    env: { ...process.env, ...env },
  });

  if (result.status !== 0) {
    throw new Error(`bun run ${script} failed with exit code ${result.status ?? "unknown"}`);
  }
}

function ensureLocalRuntimeModules(): void {
  const localNodeModules = join(appRoot, "node_modules");
  const rootNodeModules = join(repoRoot, "node_modules");

  mkdirSync(localNodeModules, { recursive: true });

  for (const entry of readdirSync(rootNodeModules, { withFileTypes: true })) {
    if (entry.name === ".bin" || entry.name === ".cache") {
      continue;
    }

    const source = join(rootNodeModules, entry.name);
    const target = join(localNodeModules, entry.name);

    mkdirSync(dirname(target), { recursive: true });
    rmSync(target, { recursive: true, force: true });
    symlinkSync(source, target, entry.isDirectory() ? "junction" : "file");
  }
}

const config: ForgeConfig = {
  packagerConfig: {
    name: appName,
    executableName: appName,
    appBundleId: `dev.${appPrefix}.app`,
    appCategoryType: "public.app-category.productivity",
    asar: true,
    protocols: [
      {
        name: `${appName} Auth`,
        schemes: [appPrefix],
      },
    ],
    ignore: [
      /^\/out($|\/)/,
      /^\/release($|\/)/,
      /^\/src($|\/)/,
      /^\/scripts($|\/)/,
      /^\/README\.md$/,
      /^\/tsconfig\.json$/,
    ],
  },
  makers: [
    new MakerZIP({}, ["darwin"]),
    new MakerDMG({}, ["darwin"]),
    new MakerSquirrel(
      {
        name: appPrefix,
        authors: orgName ?? appName,
        description: "ChatJS desktop application",
      },
      ["win32"]
    ),
    new MakerDeb(
      {
        options: {
          maintainer: orgEmail ? `${orgName} <${orgEmail}>` : orgName,
          homepage: branding.appUrl,
          icon: "./icon.png",
          categories: ["Utility"],
        },
      },
      ["linux"]
    ),
    new MakerRpm(
      {
        options: {
          homepage: branding.appUrl,
          icon: "./icon.png",
        },
      },
      ["linux"]
    ),
  ],
  hooks: {
    generateAssets: async () => {
      runBunScript("prebuild");
    },
    preStart: async () => {
      ensureLocalRuntimeModules();
      runBunScript("build", { NODE_ENV: "development" });
    },
    prePackage: async () => {
      ensureLocalRuntimeModules();
      runBunScript("build", { NODE_ENV: "production" });
    },
  },
};

export default config;
