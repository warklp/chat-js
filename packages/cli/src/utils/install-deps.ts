import { runCommand } from "./run-command";
import { inferPackageManager } from "./get-package-manager";

/**
 * Install npm dependencies in `cwd` using the detected package manager.
 * No-ops if `deps` is empty.
 */
export async function installDependencies(
  deps: string[],
  devDeps: string[],
  cwd: string
): Promise<void> {
  const dependencies = Array.from(new Set(deps));
  const developmentDependencies = Array.from(new Set(devDeps));

  if (!dependencies.length && !developmentDependencies.length) {
    return;
  }

  const pm = inferPackageManager();
  if (dependencies.length) {
    const args = pm === "yarn" ? ["add", ...dependencies] : ["add", ...dependencies];
    await runCommand(pm, args, cwd);
  }

  if (developmentDependencies.length) {
    const args =
      pm === "npm"
        ? ["install", "-D", ...developmentDependencies]
        : ["add", "-D", ...developmentDependencies];
    await runCommand(pm, args, cwd);
  }
}
