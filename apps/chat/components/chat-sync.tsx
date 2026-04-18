"use client";

import { useChat } from "@ai-sdk-tools/store";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useDataStream } from "@/components/data-stream-provider";
import { useSaveMessageMutation } from "@/hooks/chat-sync-hooks";
import { useCompleteDataPart } from "@/hooks/use-complete-data-part";
import { ChatSDKError } from "@/lib/ai/errors";
import { getStreamErrorToastContent } from "@/lib/ai/stream-errors";
import type { ChatMessage } from "@/lib/ai/types";
import {
  type ChatBootstrapEntry,
  clearChatBootstrap,
  runBootstrapSecondaryRequests,
  useChatBootstrap,
} from "@/lib/chat-bootstrap";
import {
  useAddMessageToTree,
  useThreadInitialMessages,
} from "@/lib/stores/hooks-threads";
import { fetchWithErrorHandlers, generateUUID } from "@/lib/utils";
import { useSession } from "@/providers/session-provider";

function isResumableActiveStreamId(activeStreamId: string | null | undefined) {
  return !!(activeStreamId && !activeStreamId.startsWith("pending:"));
}

export function ChatSync({
  bootstrapEntry,
  id,
  onBootstrapSettled,
  projectId,
}: {
  bootstrapEntry?: ChatBootstrapEntry | null;
  id: string;
  onBootstrapSettled?: () => void;
  projectId?: string;
}) {
  const { data: session } = useSession();
  const { mutate: saveChatMessage } = useSaveMessageMutation();
  const { setDataStream } = useDataStream();
  const [autoResume, setAutoResume] = useState(() => !bootstrapEntry);

  const isAuthenticated = !!session?.user;
  const threadInitialMessages = useThreadInitialMessages();
  const addMessageToTree = useAddMessageToTree();
  const hasBootstrappedRef = useRef(false);
  const hasSettledBootstrapRef = useRef(false);
  const liveBootstrapEntry = useChatBootstrap(id);

  const lastMessage = threadInitialMessages.at(-1);
  const lastMessageRef = useRef(lastMessage);
  lastMessageRef.current = lastMessage;
  const isLastMessagePartial = isResumableActiveStreamId(
    lastMessage?.metadata?.activeStreamId
  );

  const chatHelpers = useChat<ChatMessage>({
    experimental_throttle: 100,
    id,
    // TODO: this is a special "snapshot" value in the store that is only updated
    // on store init + sibling switch. Once the store can guarantee up-to-date
    // messages at ChatSync remount time, we can likely remove this override.
    messages: threadInitialMessages,
    generateId: generateUUID,
    onFinish: ({ message }) => {
      addMessageToTree(message);
      saveChatMessage({ message, chatId: id });
      setAutoResume(true);
    },
    resume: autoResume && isLastMessagePartial,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      fetch: fetchWithErrorHandlers as typeof fetch,
      prepareSendMessagesRequest({ messages, id: requestId, body }) {
        return {
          body: {
            id: requestId,
            message: messages.at(-1),
            prevMessages: isAuthenticated ? [] : messages.slice(0, -1),
            projectId,
            ...body,
          },
        };
      },
      prepareReconnectToStreamRequest({ id: chatId }) {
        const current = lastMessageRef.current;
        const partialMessageId = isResumableActiveStreamId(
          current?.metadata?.activeStreamId
        )
          ? (current?.id ?? null)
          : null;
        return {
          api: `/api/chat/${chatId}/stream${partialMessageId ? `?messageId=${partialMessageId}` : ""}`,
        };
      },
    }),
    onData: (dataPart) => {
      setAutoResume(true);
      setDataStream((ds) =>
        ds ? [...ds, dataPart as (typeof ds)[number]] : []
      );
    },
    onError: (error) => {
      if (
        error instanceof ChatSDKError &&
        error.type === "not_found" &&
        error.surface === "stream"
      ) {
        setAutoResume(false);
      }

      const { message, description } = getStreamErrorToastContent(error);
      toast.error(message, description ? { description } : undefined);
    },
  });
  const { sendMessage, setMessages, status, stop } = chatHelpers;

  useEffect(() => {
    if (!(bootstrapEntry && !hasBootstrappedRef.current)) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      hasBootstrappedRef.current = true;
      setAutoResume(false);
      setMessages([]);

      sendMessage(bootstrapEntry.message, {
        body: bootstrapEntry.primaryRequestBody ?? undefined,
      });
      addMessageToTree(bootstrapEntry.message);

      const primaryAssistantPlaceholder = bootstrapEntry.primaryRequestBody
        ? {
            assistantMessageId:
              bootstrapEntry.primaryRequestBody.assistantMessageId,
            createdAt: bootstrapEntry.message.metadata.createdAt,
            isPrimary: true,
            modelId: bootstrapEntry.primaryRequestBody.selectedModelId,
            parallelGroupId: bootstrapEntry.primaryRequestBody.parallelGroupId,
            parallelIndex: bootstrapEntry.primaryRequestBody.parallelIndex,
          }
        : null;

      for (const requestSpec of [
        ...(primaryAssistantPlaceholder ? [primaryAssistantPlaceholder] : []),
        ...bootstrapEntry.secondaryRequestSpecs,
      ]) {
        addMessageToTree({
          id: requestSpec.assistantMessageId,
          parts: [],
          role: "assistant",
          metadata: {
            createdAt: requestSpec.createdAt,
            parentMessageId: bootstrapEntry.message.id,
            parallelGroupId: requestSpec.parallelGroupId,
            parallelIndex: requestSpec.parallelIndex,
            isPrimaryParallel: requestSpec.isPrimary,
            selectedModel: requestSpec.modelId,
            activeStreamId: `pending:${requestSpec.assistantMessageId}`,
            selectedTool: undefined,
          },
        });
      }

      runBootstrapSecondaryRequests(bootstrapEntry).catch(() => {
        clearChatBootstrap(bootstrapEntry.chatId);
        toast.error("Failed to start chat");
      });
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    addMessageToTree,
    bootstrapEntry,
    id,
    sendMessage,
    setMessages,
    threadInitialMessages.length,
  ]);

  useEffect(() => {
    if (liveBootstrapEntry) {
      hasSettledBootstrapRef.current = false;
      return;
    }

    if (
      !(
        bootstrapEntry &&
        hasBootstrappedRef.current &&
        (status === "ready" || status === "error") &&
        !hasSettledBootstrapRef.current
      )
    ) {
      return;
    }

    hasSettledBootstrapRef.current = true;
    onBootstrapSettled?.();
  }, [bootstrapEntry, liveBootstrapEntry, onBootstrapSettled, status]);

  // Backstop: if we remount ChatSync (e.g. threadEpoch changes), ensure the prior
  // in-flight stream is aborted and we don't replay old deltas.
  useEffect(
    () => () => {
      stop?.();
      setDataStream([]);
    },
    [setDataStream, stop]
  );

  useCompleteDataPart();

  return null;
}
