import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    VERCEL_SANDBOX_RUNTIME: undefined,
    VERCEL_SANDBOX_RUNTIME_PYTHON: undefined,
    VERCEL_SANDBOX_RUNTIME_JAVASCRIPT: undefined,
  },
}));

describe("getSandboxRuntime", () => {
  it("uses Python defaults when no override is set", async () => {
    const { getSandboxRuntime } = await import("./code-execution.shared");

    expect(getSandboxRuntime("python")).toBe("python3.13");
  });

  it("uses JavaScript defaults when no override is set", async () => {
    const { getSandboxRuntime } = await import("./code-execution.shared");

    expect(getSandboxRuntime("javascript")).toBe("node22");
  });
});
