import { describe, expect, it } from "vitest";
import {
  getChatRuntimeKey,
  type InitialChatTransition,
  isTransitionRouteMismatch,
  shouldUseTransitionRuntimeKey,
} from "./chat-runtime-transition";

const transition = {
  chatId: "chat-1",
  fromPath: "/",
  hasReachedToPath: false,
  message: {} as InitialChatTransition["message"],
  phase: "submitted",
  projectId: null,
  requestSpecs: [],
  runtimeKey: "path:/:draft:chat-1",
  source: "home",
  toPath: "/chat/chat-1",
} satisfies InitialChatTransition;

describe("chat runtime transition keys", () => {
  it("uses the transition runtime key on the starting path", () => {
    expect(shouldUseTransitionRuntimeKey({ pathname: "/", transition })).toBe(
      true
    );
  });

  it("uses the transition runtime key on the exact destination path", () => {
    expect(
      shouldUseTransitionRuntimeKey({
        pathname: "/chat/chat-1",
        transition,
      })
    ).toBe(true);
  });

  it("does not preserve the key on unrelated paths", () => {
    expect(
      shouldUseTransitionRuntimeKey({
        pathname: "/chat/chat-2",
        transition,
      })
    ).toBe(false);
  });

  it("does not preserve the starting path after reaching the destination", () => {
    expect(
      shouldUseTransitionRuntimeKey({
        pathname: "/",
        transition: { ...transition, hasReachedToPath: true },
      })
    ).toBe(false);
  });

  it("falls back to the normal path key after transition settlement", () => {
    expect(
      getChatRuntimeKey({
        baseRuntimeKey: "path:/chat/chat-1",
        pathname: "/chat/chat-1",
        transition: null,
      })
    ).toBe("path:/chat/chat-1");
  });

  it("does not clear the transition before the router reaches the destination", () => {
    expect(
      isTransitionRouteMismatch({
        pathname: "/",
        transition,
      })
    ).toBe(false);
  });

  it("clears the transition on unrelated paths", () => {
    expect(
      isTransitionRouteMismatch({
        pathname: "/settings",
        transition,
      })
    ).toBe(true);
  });

  it("clears the transition when returning to the starting path after reaching the destination", () => {
    expect(
      isTransitionRouteMismatch({
        pathname: "/",
        transition: { ...transition, hasReachedToPath: true },
      })
    ).toBe(true);
  });
});
