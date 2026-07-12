import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";
import type { PendingChatConfirmation } from "@/lib/stores/with-chat-persistence";
import {
  claimProvisionalChatConfirmation,
  clearProvisionalChatConfirmations,
  registerProvisionalChatConfirmation,
} from "./provisional-chat-confirmations";

const confirmation = {
  message: { id: "user-1" },
  projectId: null,
  requestSpecs: [],
} as unknown as PendingChatConfirmation;

describe("provisional chat confirmations", () => {
  afterEach(clearProvisionalChatConfirmations);

  it("survives route-owned store replacement and can only be claimed once", () => {
    registerProvisionalChatConfirmation("chat-1", confirmation);

    assert.equal(claimProvisionalChatConfirmation("chat-1"), confirmation);
    assert.equal(claimProvisionalChatConfirmation("chat-1"), null);
  });
});
