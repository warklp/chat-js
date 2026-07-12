import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import {
  loadWorkgroveConfig,
  resolveWorkgroveRuntime,
} from "workgrove/config";

const config = loadWorkgroveConfig(".workgrove.json");

describe("ChatJS Workgrove configuration", () => {
  it("resolves the stable app ports and exports for a worktree slot", () => {
    expect(
      resolveWorkgroveRuntime(config, { CHATJS_DEV_SLOT: "6" })
    ).toEqual({
      apps: {
        chat: {
          env: {
            APP_URL: "http://localhost:3060",
            PORT: "3060",
          },
          port: 3060,
          url: "http://localhost:3060",
        },
        electron: {
          env: {
            ELECTRON_APP_URL: "http://localhost:3060",
          },
          port: 3061,
          url: "http://localhost:3061",
        },
        site: {
          env: { PORT: "3062" },
          port: 3062,
          url: "http://localhost:3062",
        },
      },
      slot: 6,
    });
  });

  it("discovers the root config when the wrapper runs from a nested app", async () => {
    const child = Bun.spawn(
      ["bun", resolve(import.meta.dir, "worktree-env.ts"), "--info", "--json"],
      {
        cwd: "apps/chat",
        env: { ...process.env, CHATJS_DEV_SLOT: "6" },
        stderr: "pipe",
        stdout: "pipe",
      }
    );
    const output = (await new Response(child.stdout).json()) as {
      configFile: string;
      slot: number;
    };

    expect(await child.exited).toBe(0);
    expect(output).toMatchObject({
      configFile: resolve(".workgrove.json"),
      slot: 6,
    });
  });
});
