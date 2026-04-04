import { describe, expect, it } from "vitest";
import {
  getStreamErrorMessage,
  getStreamErrorToastContent,
} from "./stream-errors";

describe("getStreamErrorMessage", () => {
  it("returns actionable gateway billing guidance", () => {
    expect(
      getStreamErrorMessage(
        new Error("AI Gateway requires a valid credit card to run this model.")
      )
    ).toBe(
      "AI Gateway requires a valid credit card. Add one in your Vercel dashboard and try again."
    );
  });

  it("returns a context-window specific message", () => {
    expect(
      getStreamErrorMessage(
        new Error("This model exceeded its maximum context length.")
      )
    ).toBe(
      "This conversation is too long for the selected model. Start a new chat or shorten the message and try again."
    );
  });

  it("falls back to the original message for unknown errors", () => {
    expect(getStreamErrorMessage(new Error("Provider exploded"))).toBe(
      "Provider exploded"
    );
  });
});

describe("getStreamErrorToastContent", () => {
  it("uses the streamed cause when the message is truncated", () => {
    const error = new Error("O", {
      cause: "Oops, the provider returned a 429.",
    });

    expect(getStreamErrorToastContent(error)).toEqual({
      message: "Oops, the provider returned a 429.",
    });
  });

  it("keeps a specific message and moves the cause to the description", () => {
    const error = new Error("Rate limit exceeded. Please wait a moment and try again.", {
      cause: "Provider returned HTTP 429",
    });

    expect(getStreamErrorToastContent(error)).toEqual({
      message: "Rate limit exceeded. Please wait a moment and try again.",
      description: "Provider returned HTTP 429",
    });
  });
});
