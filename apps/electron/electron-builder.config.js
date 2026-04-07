const { appName, appPrefix, appUrl, orgName, orgEmail } = require("./branding.json");

function parseTargets(envName, defaults, arch) {
  const raw = process.env[envName];
  if (!raw) return defaults;

  return raw
    .split(",")
    .map((target) => target.trim())
    .filter(Boolean)
    .map((target) => ({ target, arch: [arch] }));
}

const updaterRuntimeModules = [
  "electron-updater",
  "builder-util-runtime",
  "fs-extra",
  "js-yaml",
  "lazy-val",
  "lodash.escaperegexp",
  "lodash.isequal",
  "semver",
  "tiny-typed-emitter",
  "debug",
  "sax",
  "graceful-fs",
  "jsonfile",
  "universalify",
  "argparse",
];

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: `dev.${appPrefix}.app`,
  electronVersion: "36.0.0",
  productName: appName,
  copyright: `Copyright © ${new Date().getFullYear()} ${orgName}`,
  beforeBuild: "./electron-builder.before-build.js",
  icon: "build/icon.png",
  extraMetadata: {
    author: orgEmail ? { name: orgName, email: orgEmail } : orgName,
    homepage: appUrl,
  },

  directories: {
    output: "release",
  },

  files: [
    "dist/**",
    "build/**",
    "entitlements.mac.plist",
    "package.json",
    ...updaterRuntimeModules.map((name) => ({
      from: `../../node_modules/${name}`,
      to: `node_modules/${name}`,
      filter: ["**/*"],
    })),
  ],

  publish: {
    provider: "github",
    owner: "FranciscoMoretti",
    repo: "chat-js",
    releaseType: "release",
  },

  mac: {
    artifactName: `${appName}-mac.\${ext}`,
    target: parseTargets(
      "MAC_TARGETS",
      [
        { target: "dmg", arch: ["universal"] },
        { target: "zip", arch: ["universal"] },
      ],
      "universal"
    ),
    category: "public.app-category.productivity",
    hardenedRuntime: true,
    entitlements: "entitlements.mac.plist",
    entitlementsInherit: "entitlements.mac.plist",
    gatekeeperAssess: false,
    protocols: [{ name: `${appName} Auth`, schemes: [appPrefix] }],
  },

  dmg: {
    sign: false,
  },

  win: {
    artifactName: `${appName}-windows.\${ext}`,
    target: parseTargets(
      "WIN_TARGETS",
      [{ target: "nsis", arch: ["x64"] }],
      "x64"
    ),
    protocols: [{ name: `${appName} Auth`, schemes: [appPrefix] }],
  },

  nsis: {
    artifactName: `${appName}-windows.\${ext}`,
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: "always",
    createStartMenuShortcut: true,
  },

  linux: {
    artifactName: `${appName}-linux.\${ext}`,
    target: parseTargets(
      "LINUX_TARGETS",
      [
        { target: "AppImage", arch: ["x64"] },
        { target: "deb", arch: ["x64"] },
      ],
      "x64"
    ),
    category: "Utility",
    maintainer: orgEmail ? `${orgName} <${orgEmail}>` : orgName,
    protocols: [{ name: `${appName} Auth`, schemes: [appPrefix] }],
  },
};
