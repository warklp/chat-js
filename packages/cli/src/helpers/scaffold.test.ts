import { existsSync } from "node:fs";
import { afterEach, describe, expect, it } from "bun:test";
import { readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildConfigTs } from "./config-builder";
import { scaffoldElectron, scaffoldFromTemplate } from "./scaffold";

const tempDirs: string[] = [];

async function makeTempDir(name: string): Promise<string> {
  const dir = join(tmpdir(), `chat-js-cli-${name}-${crypto.randomUUID()}`);
  tempDirs.push(dir);
  return dir;
}

function getCliPackageRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../..");
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("buildConfigTs", () => {
  const baseInput = {
    appName: "My Chat",
    appPrefix: "my-chat",
    appUrl: "http://localhost:3000",
    features: {
      attachments: false,
      parallelResponses: true,
    },
    authentication: {
      google: false,
      github: true,
      vercel: false,
    },
    desktopApp: {
      enabled: false,
    },
    ai: {
      gateway: "vercel" as const,
      tools: {
        webSearch: { enabled: false },
        urlRetrieval: { enabled: false },
        codeExecution: { enabled: false },
        mcp: { enabled: false },
        followupSuggestions: { enabled: true },
        image: { enabled: false },
        deepResearch: { enabled: false },
      },
    },
  };

  it("writes desktopApp.enabled=false for web-only scaffolds", () => {
    const output = buildConfigTs({
      ...baseInput,
      desktopApp: {
        enabled: false,
      },
    });

    expect(output).toMatch(/desktopApp:\s*{\s*enabled:\s*false,/m);
  });
  it("writes desktopApp.enabled=true for Electron scaffolds", () => {
    const output = buildConfigTs({
      ...baseInput,
      desktopApp: {
        enabled: true,
      },
    });

    expect(output).toMatch(/desktopApp:\s*{\s*enabled:\s*true,/m);
  });

  it("maps prompt feature answers onto schema-backed config paths", () => {
    const output = buildConfigTs({
      ...baseInput,
      features: {
        attachments: true,
        parallelResponses: true,
      },
      ai: {
        ...baseInput.ai,
        tools: {
          webSearch: { enabled: true },
          urlRetrieval: { enabled: true },
          codeExecution: { enabled: true },
          mcp: { enabled: true },
          followupSuggestions: { enabled: true },
          image: { enabled: true },
          deepResearch: { enabled: true },
        },
      },
    });

    expect(output).toContain("features: {");
    expect(output).toContain("attachments: true");
    expect(output).toContain("parallelResponses: true");
    expect(output).not.toMatch(/features:\s*{[^}]*webSearch:/m);
    expect(output).toMatch(/codeExecution:\s*{\s*enabled:\s*true,/m);
    expect(output).toMatch(/webSearch:\s*{\s*enabled:\s*true,/m);
    expect(output).toMatch(/urlRetrieval:\s*{\s*enabled:\s*true,/m);
    expect(output).toMatch(/deepResearch:\s*{[\s\S]*enabled:\s*true,/m);
    expect(output).toMatch(/mcp:\s*{\s*enabled:\s*true,/m);
    expect(output).toMatch(/image:\s*{[\s\S]*enabled:\s*true,/m);
  });
});

describe("scaffoldFromTemplate", () => {
  it("writes a standalone-safe root package.json", async () => {
    const destination = await makeTempDir("chat-app");

    await scaffoldFromTemplate(destination);

    const packageJson = JSON.parse(
      await readFile(join(destination, "package.json"), "utf8"),
    ) as {
      packageManager?: string;
      dependencies: Record<string, string>;
      overrides?: Record<string, string>;
    };

    expect(packageJson.packageManager).toBe("bun@1.3.1");
    expect(packageJson.dependencies["@better-auth/core"]).toBe("1.5.6");
    expect(packageJson.dependencies["@better-auth/electron"]).toBe("1.5.6");
    expect(packageJson.dependencies["better-auth"]).toBe("1.5.6");
    expect(packageJson.overrides?.["@better-auth/core"]).toBe("1.5.6");
  });

  it("rewrites the generated web app to be npm-friendly", async () => {
    const destination = await makeTempDir("chat-app-npm");

    await scaffoldFromTemplate(destination, { packageManager: "npm" });

    const packageJson = JSON.parse(
      await readFile(join(destination, "package.json"), "utf8"),
    ) as {
      packageManager?: string;
      scripts: Record<string, string>;
    };

    expect(packageJson.packageManager).toBeUndefined();
    for (const script of Object.values(packageJson.scripts)) {
      expect(script).not.toContain("bun ");
      expect(script).not.toContain("bunx");
    }

    expect(
      await readFile(join(destination, "playwright.config.ts"), "utf8"),
    ).toContain('command: "npm run dev"');
    expect(
      await readFile(join(destination, "scripts", "check-env.ts"), "utf8"),
    ).toContain("npm run fetch:models");
    expect(
      await readFile(
        join(destination, "lib", "ai", "gateways", "fallback-models.ts"),
        "utf8",
      ),
    ).toContain("npm run fetch:models");
    expect(
      await readFile(join(destination, "scripts", "with-db.sh"), "utf8"),
    ).not.toContain("bun");
    expect(
      await readFile(join(destination, "scripts", "db-branch-use.sh"), "utf8"),
    ).not.toContain("bun");
  });

  it("falls back to repo source apps when synced templates are missing", async () => {
    const projectDir = await makeTempDir("chat-app-fallback");
    const templatesDir = join(getCliPackageRoot(), "templates");
    const backupDir = join(
      tmpdir(),
      `chat-js-cli-templates-${crypto.randomUUID()}`,
    );

    if (existsSync(templatesDir)) {
      await rename(templatesDir, backupDir);
    }

    try {
      await scaffoldFromTemplate(projectDir, { packageManager: "npm" });
      await scaffoldElectron(projectDir, {
        projectName: "my-chat-app",
        packageManager: "npm",
      });

      const packageJson = JSON.parse(
        await readFile(join(projectDir, "package.json"), "utf8"),
      ) as {
        dependencies: Record<string, string>;
      };
      const electronPackageJson = JSON.parse(
        await readFile(join(projectDir, "electron", "package.json"), "utf8"),
      ) as {
        devDependencies: Record<string, string>;
      };

      expect(packageJson.dependencies["@better-auth/core"]).toBe("1.5.6");
      expect(electronPackageJson.devDependencies["@better-auth/electron"]).toBe(
        "1.5.6",
      );
    } finally {
      if (existsSync(backupDir)) {
        await rename(backupDir, templatesDir);
      }
    }
  });
});

describe("scaffoldElectron", () => {
  it("pins Better Auth versions in the generated electron app", async () => {
    const projectDir = await makeTempDir("electron");

    await scaffoldFromTemplate(projectDir, { packageManager: "npm" });
    await scaffoldElectron(projectDir, {
      projectName: "my-chat-app",
      packageManager: "npm",
    });

    const packageJson = JSON.parse(
      await readFile(join(projectDir, "electron", "package.json"), "utf8"),
    ) as {
      packageManager?: string;
      devDependencies: Record<string, string>;
      scripts: Record<string, string>;
      overrides?: Record<string, string>;
    };

    expect(packageJson.packageManager).toBeUndefined();
    expect(packageJson.devDependencies["@better-auth/electron"]).toBe("1.5.6");
    expect(packageJson.devDependencies["better-auth"]).toBe("1.5.6");
    expect(packageJson.devDependencies.esbuild).toBeDefined();
    const rootPackageJson = JSON.parse(
      await readFile(join(projectDir, "package.json"), "utf8"),
    ) as {
      devDependencies: Record<string, string>;
    };
    expect(packageJson.devDependencies.tsx).toBe(
      rootPackageJson.devDependencies.tsx,
    );
    for (const script of Object.values(packageJson.scripts)) {
      expect(script).not.toContain("bun ");
      expect(script).not.toContain("bunx");
    }
    expect(packageJson.overrides?.["@better-auth/core"]).toBe("1.5.6");
    expect(
      await readFile(join(projectDir, "electron", "README.md"), "utf8"),
    ).not.toContain("bun ");
  });
});
