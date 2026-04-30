"use client";

import { useMemo } from "react";
import {
  type ChatRuntimeEntry,
  type EnsureProvisionalRuntimeInput,
  type StartConfirmedRuntimeInput,
  type SubmitProvisionalRuntimeInput,
  useChatRuntimeRegistry,
} from "./runtime-registry-provider";

export interface ChatRuntimeApi {
  ensureConfirmedRuntime: (
    input: StartConfirmedRuntimeInput
  ) => ChatRuntimeEntry;
  ensureProvisionalRuntime: (
    input: EnsureProvisionalRuntimeInput
  ) => ChatRuntimeEntry;
  submitProvisionalRuntime: (input: SubmitProvisionalRuntimeInput) => boolean;
}

export function useChatRuntimeApi(): ChatRuntimeApi {
  const {
    ensureConfirmedRuntime,
    ensureProvisionalRuntime,
    submitProvisionalRuntime,
  } = useChatRuntimeRegistry();

  return useMemo(
    () => ({
      ensureConfirmedRuntime,
      ensureProvisionalRuntime,
      submitProvisionalRuntime,
    }),
    [ensureConfirmedRuntime, ensureProvisionalRuntime, submitProvisionalRuntime]
  );
}

export function useChatRuntime(chatId: string | null | undefined) {
  const { getRuntimeByChatId } = useChatRuntimeRegistry();
  return getRuntimeByChatId(chatId);
}

export function useIsChatPersisted(chatId: string | null | undefined) {
  const runtime = useChatRuntime(chatId);
  return !runtime || runtime.persistenceStatus === "confirmed";
}
