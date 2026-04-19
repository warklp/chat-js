"use client";
import { useSuspenseQuery } from "@tanstack/react-query";
import { notFound, redirect, useParams } from "next/navigation";
import type { ParamsOf } from "@/.next/types/routes";
import { ChatSystem } from "@/components/chat-system";
import {
  useGetChatByIdQueryOptions,
  useGetChatMessagesQueryOptions,
} from "@/hooks/chat-sync-hooks";
import { useChatSystemInitialState } from "@/hooks/use-chat-system-initial-state";
import { useResolvedChatBootstrap } from "@/lib/use-resolved-chat-bootstrap";
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
  const { bootstrapEntry, clearResolvedBootstrap, hasLiveBootstrapEntry } =
    useResolvedChatBootstrap(chatId);
  const { data: session, isPending } = useSession();

  // Anonymous users can't access persisted chat pages
  if (!(isPending || session?.user)) {
    redirect("/");
  }

  if (!chatId) {
    return notFound();
  }

  if (bootstrapEntry) {
    return (
      <ChatSystem
        bootstrapEntry={bootstrapEntry}
        id={chatId}
        initialMessages={bootstrapEntry.initialMessages}
        isReadonly={false}
        onBootstrapSettled={clearResolvedBootstrap}
        persistedQueriesEnabled={!hasLiveBootstrapEntry}
        routeSource="chat"
      />
    );
  }

  return <ChatPageContent chatId={chatId} />;
}
