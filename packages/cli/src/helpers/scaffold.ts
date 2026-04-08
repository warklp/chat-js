import { existsSync } from "node:fs";
import { cp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCommand } from "../utils/run-command";

function findTemplateDir(name: string): string {
  const __dir = dirname(fileURLToPath(import.meta.url));
  // Production (dist/index.js): ../templates/<name>
  // Dev (src/helpers/scaffold.ts): ../../templates/<name>
  for (const relative of [`../templates/${name}`, `../../templates/${name}`]) {
    const candidate = resolve(__dir, relative);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    `Template "${name}" not found. Run \`bun template:sync\` to generate templates.`
  );
}

export async function scaffoldFromTemplate(
  destination: string
): Promise<void> {
  const templateDir = findTemplateDir("chat-app");
  await cp(templateDir, destination, { recursive: true });
}

export async function scaffoldElectron(
  projectDir: string,
  opts: { projectName: string }
): Promise<void> {
  const templateDir = findTemplateDir("electron");
  const destination = join(projectDir, "electron");
  await cp(templateDir, destination, { recursive: true });

  // package.json: inject project name and repository metadata
  const packageJsonPath = join(destination, "package.json");
  const packageJson = (await readFile(packageJsonPath, "utf8"))
    .replace("__PROJECT_NAME__-electron", `${opts.projectName}-electron`)
    .replace("__GITHUB_OWNER__", "your-github-username")
    .replace("__GITHUB_REPO__", opts.projectName);
  await writeFile(packageJsonPath, packageJson);
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
