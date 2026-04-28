"use client";

import { useCallback, useMemo } from "react";
import type { ChatMessage } from "@/lib/ai/types";
import type { UseChatHelpers } from "@/lib/stores/base";
import {
  type ChatRuntimeEntry,
  type StartProvisionalRuntimeInput,
  useChatRuntimeRegistry,
} from "@/providers/chat-runtime-registry-provider";

export type RuntimeSendMessageOptions = Parameters<
  UseChatHelpers<ChatMessage>["sendMessage"]
>[1];

export type RuntimeConfirmResult =
  | { ok: true }
  | {
      ok: false;
      reason: "runtime_not_found";
    };

export type RuntimeSendMessageResult =
  | { ok: true }
  | {
      ok: false;
      reason: "runtime_not_found" | "runtime_not_ready";
    };

export interface ChatRuntimeApi {
  confirmRuntime: (chatId: string) => RuntimeConfirmResult;
  getRuntime: (chatId: string | null | undefined) => ChatRuntimeEntry | null;
  sendMessage: (
    chatId: string,
    message: ChatMessage,
    options?: RuntimeSendMessageOptions
  ) => Promise<RuntimeSendMessageResult>;
  startProvisionalRuntime: (input: StartProvisionalRuntimeInput) => boolean;
}

export function useChatRuntimeApi(): ChatRuntimeApi {
  const { getRuntimeByChatId, markRuntimeConfirmed, startProvisionalRuntime } =
    useChatRuntimeRegistry();

  const getRuntime = useCallback(
    (chatId: string | null | undefined) => getRuntimeByChatId(chatId),
    [getRuntimeByChatId]
  );

  const confirmRuntime = useCallback(
    (chatId: string) => {
      const runtime = getRuntimeByChatId(chatId);
      if (!runtime) {
        return { ok: false, reason: "runtime_not_found" } as const;
      }

      markRuntimeConfirmed(runtime.runtimeId);
      return { ok: true } as const;
    },
    [getRuntimeByChatId, markRuntimeConfirmed]
  );

  const sendMessage = useCallback(
    async (
      chatId: string,
      message: ChatMessage,
      options?: RuntimeSendMessageOptions
    ) => {
      const runtime = getRuntimeByChatId(chatId);
      if (!runtime) {
        return { ok: false, reason: "runtime_not_found" } as const;
      }

      const runtimeSendMessage = runtime.store.getState().sendMessage;
      if (!runtimeSendMessage) {
        return { ok: false, reason: "runtime_not_ready" } as const;
      }

      await runtimeSendMessage(message, options);
      return { ok: true } as const;
    },
    [getRuntimeByChatId]
  );

  return useMemo(
    () => ({
      confirmRuntime,
      getRuntime,
      sendMessage,
      startProvisionalRuntime,
    }),
    [confirmRuntime, getRuntime, sendMessage, startProvisionalRuntime]
  );
}

export function useChatRuntime(chatId: string | null | undefined) {
  return useChatRuntimeApi().getRuntime(chatId);
}

export function useIsChatPersisted(chatId: string | null | undefined) {
  const runtime = useChatRuntime(chatId);
  return !runtime || runtime.persistenceStatus === "confirmed";
}
