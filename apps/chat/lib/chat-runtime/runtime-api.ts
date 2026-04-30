"use client";

import { useMemo } from "react";
import {
  type ChatRuntimeEntry,
  type EnsureRuntimeInput,
  type SubmitRuntimeInput,
  useChatRuntimeRegistry,
} from "./runtime-registry-provider";

export interface ChatRuntimeApi {
  ensureRuntime: (input: EnsureRuntimeInput) => ChatRuntimeEntry;
  submitRuntime: (input: SubmitRuntimeInput) => boolean;
}

export function useChatRuntimeApi(): ChatRuntimeApi {
  const { ensureRuntime, submitRuntime } = useChatRuntimeRegistry();

  return useMemo(
    () => ({
      ensureRuntime,
      submitRuntime,
    }),
    [ensureRuntime, submitRuntime]
  );
}

export function useChatRuntime(chatId: string | null | undefined) {
  const { getRuntimeByChatId } = useChatRuntimeRegistry();
  return getRuntimeByChatId(chatId);
}
