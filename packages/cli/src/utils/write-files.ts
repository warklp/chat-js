import fs from "node:fs/promises";
import path from "node:path";
import type { RegistryToolItemFile } from "../registry/schema";
import { isSafeTarget } from "./is-safe-target";

function rewriteToolkitImports(content: string, toolsAlias: string): string {
  return content.replace(
    /(["'])@toolkit\/(lib|components|hooks)\/([^"'`]+)\1/g,
    (_match, quote: string, kind: string, rest: string) =>
      `${quote}${toolsAlias}/_shared/${kind}/${rest}${quote}`
  );
}

/**
 * Write tool files to disk.
 * Each file's `target` is resolved relative to `toolsDir`.
 * Returns the list of absolute paths that were written.
 */
export async function writeToolFiles(
  files: RegistryToolItemFile[],
  {
    overwrite = false,
    toolsDir,
    toolsAlias,
  }: {
    overwrite?: boolean;
    toolsDir: string;
    toolsAlias: string;
  }
): Promise<{ written: string[]; existing: string[] }> {
  const written: string[] = [];
  const existing: string[] = [];

  for (const file of files) {
    if (!isSafeTarget(file.target, toolsDir)) {
      throw new Error(
        `Refusing to write "${file.target}" outside the tools directory`
      );
    }

    const dest = path.resolve(toolsDir, file.target);

    const exists = await fs
      .access(dest)
      .then(() => true)
      .catch(() => false);

    if (exists && !overwrite) {
      existing.push(dest);
      continue;
    }

    await fs.mkdir(path.dirname(dest), { recursive: true });
    const content =
      dest.endsWith(".ts") || dest.endsWith(".tsx") || dest.endsWith(".js")
        ? rewriteToolkitImports(file.content, toolsAlias)
        : file.content;
    await fs.writeFile(dest, content, "utf8");
    written.push(dest);
  }

  return { written, existing };
}
