"use client";
import { useSuspenseQuery } from "@tanstack/react-query";
import { notFound, useParams } from "next/navigation";
import type { ParamsOf } from "@/.next/types/routes";
import { ChatSystem } from "@/components/chat-system";
import {
  useGetChatByIdQueryOptions,
  useGetChatMessagesQueryOptions,
} from "@/hooks/chat-sync-hooks";
import { useChatSystemInitialState } from "@/hooks/use-chat-system-initial-state";
import { useResolvedChatBootstrap } from "@/lib/use-resolved-chat-bootstrap";

function ProjectChatPageContent({
  chatId,
  projectId,
}: {
  chatId: string;
  projectId: string;
}) {
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
      projectId={projectId}
      routeSource="project"
    />
  );
}

export function ProjectChatPage() {
  const params = useParams<ParamsOf<"/project/[projectId]/chat/[chatId]">>();
  const projectId = params.projectId;
  const chatId = params.chatId;
  const { bootstrapEntry, clearResolvedBootstrap, hasLiveBootstrapEntry } =
    useResolvedChatBootstrap(chatId);

  if (!(chatId && projectId)) {
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
        projectId={projectId}
        routeSource="project"
      />
    );
  }

  return <ProjectChatPageContent chatId={chatId} projectId={projectId} />;
}
