"use client";

import { useEffect } from "react";
import type { ChatMessage } from "@/lib/ai/types";
import { useSetAllMessages } from "@/lib/stores/hooks-threads";

/**
 * Syncs already-loaded server messages into the chat store.
 * Fetching is intentionally owned by ChatRouteHost so history has one path.
 */
export function MessageTreeSync({
  messages,
}: {
  messages?: ChatMessage[] | null;
}) {
  const setAllMessages = useSetAllMessages();

  useEffect(() => {
    if (messages !== undefined && messages !== null) {
      setAllMessages(messages);
    }
  }, [messages, setAllMessages]);

  return null;
}
