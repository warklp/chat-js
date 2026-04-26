"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import type { ChatMessage } from "@/lib/ai/types";
<<<<<<< HEAD
import { useChatReset } from "@/lib/stores/base";
import {
  useResetThreadEpoch,
  useSetAllMessages,
} from "@/lib/stores/hooks-threads";
=======
import type { ChatRouteSource } from "@/lib/chat-route";
import { useSetAllMessages } from "@/lib/stores/hooks-threads";
>>>>>>> origin/main
import { useTRPC } from "@/trpc/react";

/**
 * Renderless component that syncs the server's message tree into the Zustand
 * store. Tree logic (sibling info, thread switching) lives in the store
 * (with-threads middleware).
 */
export function MessageTreeSync({
  chatId: id,
  persistedQueriesEnabled,
  source,
}: {
  chatId: string;
  persistedQueriesEnabled: boolean;
  source: ChatRouteSource;
}) {
  const isShared = source === "share";
  const trpc = useTRPC();
  const setAllMessages = useSetAllMessages();

  // React Query fetches the full tree from the server and feeds it into the store
  const messagesQuery = useQuery({
    ...(isShared
      ? trpc.chat.getPublicChatMessages.queryOptions({ chatId: id })
      : trpc.chat.getChatMessages.queryOptions({ chatId: id })),
    enabled: !!id && persistedQueriesEnabled,
  });

  // Sync server data → store whenever React Query resolves
  useEffect(() => {
    if (messagesQuery.data) {
      setAllMessages(messagesQuery.data as ChatMessage[]);
    }
  }, [messagesQuery.data, setAllMessages]);

  return null;
}
