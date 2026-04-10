import { existsSync } from "node:fs";
import { cp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PackageManager } from "../types";
import { normalizeScaffoldedPackageJson } from "./package-manifest";
import { runCommand } from "../utils/run-command";

function findTemplateDir(name: string): string {
  const __dir = dirname(fileURLToPath(import.meta.url));
  for (const relative of [`../templates/${name}`, `../../templates/${name}`]) {
    const candidate = resolve(__dir, relative);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    `Template "${name}" not found. Run \`bun template:sync\` to generate templates.`
  );
}

function runScript(packageManager: PackageManager, script: string): string {
  return `${packageManager} run ${script}`;
}

async function replaceInFile(
  filePath: string,
  replacements: Array<[string, string]>
): Promise<void> {
  if (!existsSync(filePath)) {
    return;
  }
  let content = await readFile(filePath, "utf8");
  for (const [search, replacement] of replacements) {
    content = content.replaceAll(search, replacement);
  }
  await writeFile(filePath, content);
}

async function normalizeChatAppFiles(
  destination: string,
  packageManager: PackageManager
): Promise<void> {
  await replaceInFile(join(destination, "playwright.config.ts"), [
    ['command: "bun dev"', `command: "${runScript(packageManager, "dev")}"`],
  ]);

  await replaceInFile(join(destination, "scripts", "check-env.ts"), [
    [
      " * Run via `bun run check-env` or automatically in prebuild.",
      ` * Run via \`${runScript(packageManager, "check-env")}\` or automatically in prebuild.`,
    ],
    [
      "bun fetch:models",
      runScript(packageManager, "fetch:models"),
    ],
  ]);

  await replaceInFile(
    join(destination, "lib", "ai", "gateways", "fallback-models.ts"),
    [
      [
        "bun fetch:models",
        runScript(packageManager, "fetch:models"),
      ],
    ]
  );

  await replaceInFile(join(destination, "scripts", "with-db.sh"), [
    ["bunx neonctl", "npx neonctl"],
    ["filter out bun's package resolution output", "filter out npx resolution output"],
    [
      "Run: bun db:branch:use main  (to switch back to main)",
      "Run: bash scripts/db-branch-use.sh main  (to switch back to main)",
    ],
  ]);

  await replaceInFile(join(destination, "scripts", "db-branch-create.sh"), [
    ["bunx neonctl", "npx neonctl"],
    [
      'echo "To use it: bun db:branch:use $BRANCH_NAME"',
      'echo "To use it: bash scripts/db-branch-use.sh $BRANCH_NAME"',
    ],
  ]);

  await replaceInFile(join(destination, "scripts", "db-branch-use.sh"), [
    ["bunx neonctl", "npx neonctl"],
    ['echo "Usage: bun db:branch:use <branch-name>"', 'echo "Usage: bash scripts/db-branch-use.sh <branch-name>"'],
    [
      'echo "       bun db:branch:use main  (switch to production)"',
      'echo "       bash scripts/db-branch-use.sh main  (switch to production)"',
    ],
    ['echo "Available branches: bun db:branch:list"', 'echo "Available branches: npx neonctl branches list"'],
    ['echo "Create branch: bun db:branch:create"', 'echo "Create branch: bash scripts/db-branch-create.sh"'],
  ]);

  await replaceInFile(join(destination, "scripts", "db-branch-delete.sh"), [
    ["bunx neonctl", "npx neonctl"],
  ]);

  await replaceInFile(join(destination, "scripts", "worktree-setup.sh"), [
    ["bun i", `${packageManager} install`],
  ]);

  const vercelJsonPath = join(destination, "vercel.json");
  const vercelJson = JSON.parse(await readFile(vercelJsonPath, "utf8")) as {
    installCommand?: string;
    buildCommand?: string;
  };
  vercelJson.installCommand = `${packageManager} install`;
  vercelJson.buildCommand = runScript(packageManager, "build");
  await writeFile(vercelJsonPath, `${JSON.stringify(vercelJson, null, 2)}\n`);
}

async function normalizeElectronFiles(
  destination: string,
  packageManager: PackageManager
): Promise<void> {
  const scriptPlaceholder = "$" + "{script}";

  await replaceInFile(join(destination, "forge.config.ts"), [
    ["Run `bun run prebuild`", `Run \`${runScript(packageManager, "prebuild")}\``],
    ["function runBunScript", "function runPackageManagerScript"],
    ['spawnSync("bun", ["run", script], {', `spawnSync("${packageManager}", ["run", script], {`],
    [`bun run ${scriptPlaceholder} failed`, `${packageManager} run ${scriptPlaceholder} failed`],
    ["  runBunScript(\"prebuild\");", "  runPackageManagerScript(\"prebuild\");"],
    [
      '        runBunScript("build", { NODE_ENV: "development" });',
      '        runPackageManagerScript("build", { NODE_ENV: "development" });',
    ],
    [
      '        runBunScript("build", { NODE_ENV: "production" });',
      '        runPackageManagerScript("build", { NODE_ENV: "production" });',
    ],
  ]);

  await replaceInFile(join(destination, "README.md"), [
    ["bun install", `${packageManager} install`],
    ["bun run dev", runScript(packageManager, "dev")],
    ["bun run generate-icons", runScript(packageManager, "generate-icons")],
    ["bun run dist:mac", runScript(packageManager, "dist:mac")],
    ["bun run dist:win", runScript(packageManager, "dist:win")],
    ["bun run dist:linux", runScript(packageManager, "dist:linux")],
    ["bun run make:mac", runScript(packageManager, "make:mac")],
    ["bun run make:win", runScript(packageManager, "make:win")],
    ["bun run make:linux", runScript(packageManager, "make:linux")],
  ]);
}

export async function scaffoldFromTemplate(
  destination: string,
  options?: { packageManager?: PackageManager }
): Promise<void> {
  const packageManager = options?.packageManager ?? "bun";
  const templateDir = findTemplateDir("chat-app");
  await cp(templateDir, destination, { recursive: true });

  const packageJsonPath = join(destination, "package.json");
  const packageJson = normalizeScaffoldedPackageJson(
    JSON.parse(await readFile(packageJsonPath, "utf8")) as Record<string, unknown>,
    {
      packageManager,
      template: "chat-app",
    }
  );
  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  await normalizeChatAppFiles(destination, packageManager);
}

export async function scaffoldElectron(
  projectDir: string,
  opts: { projectName: string; packageManager?: PackageManager }
): Promise<void> {
  const packageManager = opts.packageManager ?? "bun";
  const rootPackageJsonPath = join(projectDir, "package.json");
  const rootPackageJson = JSON.parse(
    await readFile(rootPackageJsonPath, "utf8")
  ) as {
    devDependencies?: Record<string, string>;
  };
  const templateDir = findTemplateDir("electron");
  const destination = join(projectDir, "electron");
  await cp(templateDir, destination, { recursive: true });

  const packageJsonPath = join(destination, "package.json");
  const packageJson = normalizeScaffoldedPackageJson(
    JSON.parse(
      (await readFile(packageJsonPath, "utf8"))
        .replace("__PROJECT_NAME__-electron", `${opts.projectName}-electron`)
        .replace("__GITHUB_OWNER__", "your-github-username")
        .replace("__GITHUB_REPO__", opts.projectName)
    ) as Record<string, unknown>,
    {
      packageManager,
      template: "electron",
      tsxVersion: rootPackageJson.devDependencies?.tsx,
    }
  );
  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  await normalizeElectronFiles(destination, packageManager);
}

export async function scaffoldFromGit(
  url: string,
  destination: string
): Promise<void> {
  await runCommand(
    "git",
    ["clone", "--depth", "1", url, destination],
    process.cwd()
  );
  await rm(join(destination, ".git"), { recursive: true, force: true });
}
