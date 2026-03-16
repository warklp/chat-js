import fs from "node:fs/promises";
import path from "node:path";
import type { RegistryToolItemFile } from "../registry/schema";

/**
 * Write tool files to disk.
 * Each file's `target` is resolved relative to `toolsDir`.
 * Returns the list of absolute paths that were written.
 */
export async function writeToolFiles(
  files: RegistryToolItemFile[],
  { overwrite = false, toolsDir }: { overwrite?: boolean; toolsDir: string }
): Promise<{ written: string[]; existing: string[] }> {
  const written: string[] = [];
  const existing: string[] = [];

  for (const file of files) {
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
    await fs.writeFile(dest, file.content, "utf8");
    written.push(dest);
  }

  return { written, existing };
}
