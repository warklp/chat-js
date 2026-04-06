import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  symlinkSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
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
    if (existsSync(target)) {
      const stat = lstatSync(target);
      if (stat.isSymbolicLink()) {
        unlinkSync(target);
      } else {
        rmSync(target, { recursive: true, force: true });
      }
    }
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
