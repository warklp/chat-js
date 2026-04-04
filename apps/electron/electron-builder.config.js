const { appName, appPrefix, orgName } = require("./branding.json");

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
    target: [{ target: "dmg", arch: ["x64", "arm64"] }],
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
    target: [{ target: "nsis", arch: ["x64"] }],
    protocols: [{ name: `${appName} Auth`, schemes: [appPrefix] }],
  },

  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: "always",
    createStartMenuShortcut: true,
  },

  linux: {
    target: [{ target: "AppImage", arch: ["x64"] }],
    category: "Network",
  },
};
