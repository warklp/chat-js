"use client";

import { useMemo } from "react";
import {
  type ChatRuntimeEntry,
  type EnsureRuntimeInput,
  useChatRuntimeRegistry,
} from "./runtime-registry-provider";

export interface ChatRuntimeApi {
  ensureRuntime: (input: EnsureRuntimeInput) => ChatRuntimeEntry;
}

export function useChatRuntimeApi(): ChatRuntimeApi {
  const { ensureRuntime } = useChatRuntimeRegistry();

  return useMemo(
    () => ({
      ensureRuntime,
    }),
    [ensureRuntime]
  );
}

export function useChatRuntime(chatId: string | null | undefined) {
  const { getRuntimeByChatId } = useChatRuntimeRegistry();
  return getRuntimeByChatId(chatId);
}
