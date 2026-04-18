"use client";
import { useSuspenseQuery } from "@tanstack/react-query";
import { notFound, redirect, useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { ParamsOf } from "@/.next/types/routes";
import { ChatSystem } from "@/components/chat-system";
import {
  useGetChatByIdQueryOptions,
  useGetChatMessagesQueryOptions,
} from "@/hooks/chat-sync-hooks";
import { useChatSystemInitialState } from "@/hooks/use-chat-system-initial-state";
import { getChatBootstrap, useChatBootstrap } from "@/lib/chat-bootstrap";
import { useSession } from "@/providers/session-provider";

function ChatPageContent({ chatId }: { chatId: string }) {
  const getChatByIdQueryOptions = useGetChatByIdQueryOptions(chatId);
  const { data: chat } = useSuspenseQuery(getChatByIdQueryOptions);
  const getMessagesByChatIdQueryOptions =
    useGetChatMessagesQueryOptions(chatId);
  const { data: messages } = useSuspenseQuery(getMessagesByChatIdQueryOptions);

  const { initialMessages, initialTool } = useChatSystemInitialState(messages);

  if (!chat) {
    return notFound();
  }

  return (
    <ChatSystem
      id={chat.id}
      initialMessages={initialMessages}
      initialTool={initialTool}
      isReadonly={false}
      routeSource="chat"
    />
  );
}

export function ChatPage() {
  const { id: chatId } = useParams<ParamsOf<"/chat/[id]">>();
  const liveBootstrapEntry = useChatBootstrap(chatId);
  const [initialBootstrapEntry, setInitialBootstrapEntry] = useState(() =>
    chatId ? (liveBootstrapEntry ?? getChatBootstrap(chatId)) : null
  );
  const { data: session, isPending } = useSession();

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

  const handleBootstrapSettled = useCallback(() => {
    setInitialBootstrapEntry(null);
  }, []);

  // Anonymous users can't access persisted chat pages
  if (!(isPending || session?.user)) {
    redirect("/");
  }

  if (!chatId) {
    return notFound();
  }

  const bootstrapEntry = liveBootstrapEntry ?? initialBootstrapEntry;

  if (bootstrapEntry) {
    return (
      <ChatSystem
        bootstrapEntry={bootstrapEntry}
        id={chatId}
        initialMessages={bootstrapEntry.initialMessages}
        isReadonly={false}
        onBootstrapSettled={handleBootstrapSettled}
        persistedQueriesEnabled={!liveBootstrapEntry}
        routeSource="chat"
      />
    );
  }

  return <ChatPageContent chatId={chatId} />;
}
