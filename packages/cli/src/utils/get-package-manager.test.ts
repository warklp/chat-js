import { describe, expect, it } from "bun:test";
import { inferPackageManager } from "./get-package-manager";

describe("inferPackageManager", () => {
  it("defaults to npm when launched through npm-compatible shims", () => {
    const originalUserAgent = process.env.npm_config_user_agent;

    process.env.npm_config_user_agent = "npm/10.9.0 node/v22.14.0 darwin arm64";

    try {
      expect(inferPackageManager()).toBe("npm");
    } finally {
      if (originalUserAgent === undefined) {
        delete process.env.npm_config_user_agent;
      } else {
        process.env.npm_config_user_agent = originalUserAgent;
      }
    }
  });
});
