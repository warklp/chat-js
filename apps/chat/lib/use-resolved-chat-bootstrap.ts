"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type ChatBootstrapEntry,
  getChatBootstrap,
  useChatBootstrap,
} from "@/lib/chat-bootstrap";

export function useResolvedChatBootstrap(chatId: string | null) {
  const liveBootstrapEntry = useChatBootstrap(chatId);
  const [initialBootstrapEntry, setInitialBootstrapEntry] =
    useState<ChatBootstrapEntry | null>(() =>
      chatId ? (liveBootstrapEntry ?? getChatBootstrap(chatId)) : null
    );

  useEffect(() => {
    if (!chatId) {
      setInitialBootstrapEntry(null);
      return;
    }

    if (liveBootstrapEntry) {
      setInitialBootstrapEntry(liveBootstrapEntry);
      return;
    }

    setInitialBootstrapEntry((currentEntry) =>
      currentEntry?.chatId === chatId ? currentEntry : getChatBootstrap(chatId)
    );
  }, [chatId, liveBootstrapEntry]);

  const clearResolvedBootstrap = useCallback(() => {
    setInitialBootstrapEntry(null);
  }, []);

  return {
    bootstrapEntry: liveBootstrapEntry ?? initialBootstrapEntry,
    clearResolvedBootstrap,
    hasLiveBootstrapEntry: !!liveBootstrapEntry,
  };
}
