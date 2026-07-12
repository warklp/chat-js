import { describe, expect, it } from "bun:test";
import path from "node:path";
import { resolveProjectPath } from "./get-config";

describe("resolveProjectPath", () => {
  it("resolves common TypeScript path aliases from the project root", () => {
    const cwd = path.resolve("project");

    expect(resolveProjectPath("@/tools/chatjs", cwd)).toBe(
      path.join(cwd, "tools/chatjs")
    );
    expect(resolveProjectPath("~/components/ui", cwd)).toBe(
      path.join(cwd, "components/ui")
    );
  });
});
