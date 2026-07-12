import { describe, expect, it } from "vitest";
import { withAbortSignal } from "./tool";

describe("withAbortSignal", () => {
  it("rejects immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));

    await expect(
      withAbortSignal(new Promise(() => undefined), controller.signal)
    ).rejects.toThrow("cancelled");
  });

  it("rejects when an in-flight operation is aborted", async () => {
    const controller = new AbortController();
    const result = withAbortSignal(
      new Promise(() => undefined),
      controller.signal
    );

    controller.abort(new Error("cancelled in flight"));

    await expect(result).rejects.toThrow("cancelled in flight");
  });
});
