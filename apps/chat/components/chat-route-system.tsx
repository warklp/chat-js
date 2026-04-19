"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { ChatSystem } from "@/components/chat-system";
import {
  useGetChatByIdQueryOptions,
  useGetChatMessagesQueryOptions,
} from "@/hooks/chat-sync-hooks";
import { useChatSystemInitialState } from "@/hooks/use-chat-system-initial-state";
import type { ChatBootstrapEntry } from "@/lib/chat-bootstrap";
import type { ChatRouteSource } from "@/lib/chat-route";

type InitialStateMessages = Parameters<typeof useChatSystemInitialState>[0];

interface ChatRouteSystemProps {
  bootstrapEntry?: ChatBootstrapEntry | null;
  chatId: string;
  hasLiveBootstrapEntry?: boolean;
  onBootstrapSettled?: () => void;
  projectId?: string;
  routeSource: ChatRouteSource;
}

function ResolvedChatRouteSystem({
  bootstrapEntry,
  chatId,
  hasLiveBootstrapEntry = false,
  messages,
  onBootstrapSettled,
  projectId,
  routeSource,
}: ChatRouteSystemProps & {
  messages: InitialStateMessages;
}) {
  const { initialMessages, initialTool } = useChatSystemInitialState(messages);

  return (
    <ChatSystem
      bootstrapEntry={bootstrapEntry}
      id={chatId}
      initialMessages={bootstrapEntry?.initialMessages ?? initialMessages}
      initialTool={bootstrapEntry ? null : initialTool}
      isReadonly={false}
      onBootstrapSettled={bootstrapEntry ? onBootstrapSettled : undefined}
      persistedQueriesEnabled={bootstrapEntry ? !hasLiveBootstrapEntry : true}
      projectId={projectId}
      routeSource={routeSource}
    />
  );
}

function PersistedChatRouteSystem(props: ChatRouteSystemProps) {
  const getChatByIdQueryOptions = useGetChatByIdQueryOptions(props.chatId);
  const { data: chat } = useSuspenseQuery(getChatByIdQueryOptions);
  const getMessagesByChatIdQueryOptions = useGetChatMessagesQueryOptions(
    props.chatId
  );
  const { data: messages } = useSuspenseQuery(getMessagesByChatIdQueryOptions);

  if (!chat) {
    return notFound();
  }

  return (
    <ResolvedChatRouteSystem {...props} chatId={chat.id} messages={messages} />
  );
}

export function ChatRouteSystem(props: ChatRouteSystemProps) {
  if (props.bootstrapEntry) {
    return <ResolvedChatRouteSystem {...props} messages={null} />;
  }

  return <PersistedChatRouteSystem {...props} />;
}
