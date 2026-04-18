"use client";
import { useSuspenseQuery } from "@tanstack/react-query";
import { notFound, useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ParamsOf } from "@/.next/types/routes";
import { ChatSystem } from "@/components/chat-system";
import {
  useGetChatByIdQueryOptions,
  useGetChatMessagesQueryOptions,
} from "@/hooks/chat-sync-hooks";
import type { UiToolName } from "@/lib/ai/types";
import { getChatBootstrap, useChatBootstrap } from "@/lib/chat-bootstrap";
import { getDefaultThread } from "@/lib/thread-utils";

export function ProjectChatPage() {
  const params = useParams<ParamsOf<"/project/[projectId]/chat/[chatId]">>();
  const projectId = params.projectId;
  const chatId = params.chatId;

  if (!(chatId && projectId)) {
    return notFound();
  }

  const liveBootstrapEntry = useChatBootstrap(chatId);
  const [initialBootstrapEntry, setInitialBootstrapEntry] = useState(() =>
    chatId ? (liveBootstrapEntry ?? getChatBootstrap(chatId)) : null
  );

  useEffect(() => {
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
        projectId={projectId}
        routeSource="project"
      />
    );
  }

  const getChatByIdQueryOptions = useGetChatByIdQueryOptions(chatId);
  const { data: chat } = useSuspenseQuery(getChatByIdQueryOptions);
  const getMessagesByChatIdQueryOptions =
    useGetChatMessagesQueryOptions(chatId);
  const { data: messages } = useSuspenseQuery(getMessagesByChatIdQueryOptions);

  const initialThreadMessages = useMemo(() => {
    if (!messages) {
      return [];
    }
    return getDefaultThread(
      messages.map((msg) => ({ ...msg, id: msg.id.toString() }))
    );
  }, [messages]);

  const initialTool = useMemo<UiToolName | null>(() => {
    const lastAssistantMessage = messages?.findLast(
      (m) => m.role === "assistant"
    );
    if (!(lastAssistantMessage && Array.isArray(lastAssistantMessage.parts))) {
      return null;
    }
    for (const part of lastAssistantMessage.parts) {
      if (
        part?.type === "tool-deepResearch" &&
        part?.state === "output-available" &&
        part?.output?.format === "clarifying_questions"
      ) {
        return "deepResearch";
      }
    }
    return null;
  }, [messages]);

  if (!chat) {
    return notFound();
  }

  return (
    <ChatSystem
      id={chat.id}
      initialMessages={initialThreadMessages}
      initialTool={initialTool}
      isReadonly={false}
      projectId={projectId}
      routeSource="project"
    />
  );
}
