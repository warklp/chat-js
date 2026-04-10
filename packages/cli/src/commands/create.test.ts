import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { create } from "./create";

const tempDirs: string[] = [];

function makeTempDir(name: string): string {
  const dir = join(tmpdir(), `chat-js-create-${name}-${crypto.randomUUID()}`);
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

describe("create command", () => {
  it("uses the explicitly requested package manager for scaffold defaults", async () => {
    const tempParent = makeTempDir("npm-app");
    const appName = "my-chat-app";
    const originalCwd = process.cwd();

    await mkdir(tempParent, { recursive: true });
    process.chdir(tempParent);
    try {
      await create.parseAsync(
        [appName, "--yes", "--no-install", "--package-manager", "npm"],
        {
          from: "user",
        }
      );
    } finally {
      process.chdir(originalCwd);
    }

    const packageJson = JSON.parse(
      await readFile(join(tempParent, appName, "package.json"), "utf8")
    ) as {
      packageManager?: string;
      overrides?: Record<string, string>;
    };

    expect(packageJson.packageManager).toBeUndefined();
    expect(packageJson.overrides?.["@better-auth/core"]).toBe("1.5.6");
  });
});
