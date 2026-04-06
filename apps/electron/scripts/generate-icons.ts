// Cross-platform icon generation.
// Copies icon.png into build/, and on macOS additionally generates icon.icns
// using the system-provided `sips` and `iconutil` tools.

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(__dirname, "..");
const src = join(root, "icon.png");
const buildDir = join(root, "build");

mkdirSync(buildDir, { recursive: true });
copyFileSync(src, join(buildDir, "icon.png"));
console.log("Generated build/icon.png");

if (process.platform === "darwin") {
  const tmp = mkdtempSync(join(tmpdir(), "icons-"));
  const iconset = join(tmp, "icon.iconset");
  mkdirSync(iconset, { recursive: true });

  const sizes: Array<[number, string]> = [
    [16, "icon_16x16.png"],
    [32, "icon_16x16@2x.png"],
    [32, "icon_32x32.png"],
    [64, "icon_32x32@2x.png"],
    [128, "icon_128x128.png"],
    [256, "icon_128x128@2x.png"],
    [256, "icon_256x256.png"],
    [512, "icon_256x256@2x.png"],
    [1024, "icon_512x512@2x.png"],
  ];

  for (const [size, name] of sizes) {
    execFileSync(
      "sips",
      ["-z", String(size), String(size), src, "--out", join(iconset, name)],
      { stdio: "ignore" }
    );
  }
  copyFileSync(src, join(iconset, "icon_512x512.png"));

  execFileSync("iconutil", ["-c", "icns", iconset, "-o", join(buildDir, "icon.icns")]);
  rmSync(tmp, { recursive: true, force: true });
  console.log("Generated build/icon.icns");
}
