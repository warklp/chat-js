import { existsSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";

type Branding = {
  appName: string;
  appPrefix: string;
  appUrl: string;
  orgName?: string;
  orgEmail?: string;
};

const appRoot = __dirname;
const repoRoot = resolve(appRoot, "../..");
const branding = loadBranding();
const { appName, appPrefix, orgName, orgEmail } = branding;

function matchStringField(source: string, fieldName: string): string | undefined {
  const pattern = new RegExp(`${fieldName}:\\s*["'\`]([^"'\`]+)["'\`]`);
  return source.match(pattern)?.[1];
}

function loadBrandingFromChatConfig(configPath: string): Branding | null {
  if (!existsSync(configPath)) {
    return null;
  }

  const source = readFileSync(configPath, "utf8");
  const appName = matchStringField(source, "appName");
  const appPrefix = matchStringField(source, "appPrefix");
  const appUrl = matchStringField(source, "appUrl");
  const orgName = source.match(/organization:\s*{[\s\S]*?name:\s*["'`]([^"'`]+)["'`]/)?.[1];
  const orgEmail =
    source.match(/privacyEmail:\s*["'`]([^"'`]+)["'`]/)?.[1] ??
    source.match(/legalEmail:\s*["'`]([^"'`]+)["'`]/)?.[1];

  if (!appName || !appPrefix || !appUrl) {
    return null;
  }

  return { appName, appPrefix, appUrl, orgName, orgEmail };
}

function loadBranding(): Branding {
  const brandingPath = join(appRoot, "branding.json");
  if (existsSync(brandingPath)) {
    return JSON.parse(readFileSync(brandingPath, "utf8")) as Branding;
  }

  const candidateConfigPaths = [
    resolve(appRoot, "../chat/chat.config.ts"),
    resolve(appRoot, "../chat.config.ts"),
  ];

  for (const configPath of candidateConfigPaths) {
    const branding = loadBrandingFromChatConfig(configPath);
    if (branding) {
      return branding;
    }
  }

  return {
    appName: "ChatJS",
    appPrefix: "chatjs",
    appUrl: "https://demo.chatjs.dev",
    orgName: "ChatJS",
  };
}

function runBunScript(script: string, env: NodeJS.ProcessEnv = {}): void {
  const result = spawnSync("bun", ["run", script], {
    stdio: "inherit",
    env: { ...process.env, ...env },
  });

  if (result.status !== 0) {
    throw new Error(`bun run ${script} failed with exit code ${result.status ?? "unknown"}`);
  }
}

function removeLocalNodeModules(): void {
  rmSync(join(appRoot, "node_modules"), { recursive: true, force: true });
}

const config: ForgeConfig = {
  packagerConfig: {
    name: appName,
    executableName: appPrefix,
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
      /^\/node_modules($|\/)/,
      /^\/scripts($|\/)/,
      /^\/README\.md$/,
      /^\/tsconfig\.json$/,
    ],
  },
  makers: [
    new MakerZIP({}, ["darwin"]),
    new MakerDMG(
      {
        name: `${appName}-mac`,
      },
      ["darwin"]
    ),
    new MakerSquirrel(
      {
        name: appPrefix,
        authors: orgName ?? appName,
        description: "ChatJS desktop application",
        setupExe: `${appName}-windows.exe`,
      },
      ["win32"]
    ),
    new MakerDeb(
      {
        options: {
          bin: appPrefix,
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
          bin: appPrefix,
          homepage: branding.appUrl,
          icon: "./icon.png",
          license: "Apache-2.0",
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
      runBunScript("build", { NODE_ENV: "development" });
    },
    prePackage: async () => {
      runBunScript("build", { NODE_ENV: "production" });
      removeLocalNodeModules();
    },
  },
};

export default config;
