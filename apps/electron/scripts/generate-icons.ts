// Cross-platform icon generation.
// Copies icon.png into build/ for Electron Builder to consume. Electron Builder
// can derive platform-specific formats from PNG input, which avoids depending
// on macOS `iconutil` during local builds.

import { copyFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(__dirname, "..");
const src = join(root, "icon.png");
const buildDir = join(root, "build");

mkdirSync(buildDir, { recursive: true });
copyFileSync(src, join(buildDir, "icon.png"));
console.log("Generated build/icon.png");
