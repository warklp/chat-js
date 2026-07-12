import type { PendingChatConfirmation } from "@/lib/stores/with-chat-persistence";

const pendingConfirmations = new Map<string, PendingChatConfirmation>();

export function registerProvisionalChatConfirmation(
  chatId: string,
  confirmation: PendingChatConfirmation
) {
  pendingConfirmations.set(chatId, confirmation);
}

export function claimProvisionalChatConfirmation(chatId: string) {
  const confirmation = pendingConfirmations.get(chatId) ?? null;
  if (confirmation) {
    pendingConfirmations.delete(chatId);
  }
  return confirmation;
}

export function clearProvisionalChatConfirmations() {
  pendingConfirmations.clear();
}
