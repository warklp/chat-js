"use client";

import { useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useDataStream } from "@/components/data-stream-provider";
import { useSaveMessageMutation } from "@/hooks/chat-sync-hooks";
import { useCompleteDataPart } from "@/hooks/use-complete-data-part";
import { ChatSDKError } from "@/lib/ai/errors";
import { getStreamErrorToastContent } from "@/lib/ai/stream-errors";
import type { ChatMessage } from "@/lib/ai/types";
import type { InitialChatTransition } from "@/lib/chat-runtime-transition";
import {
  markParallelRequestSpecsFailed,
  runParallelRequestSpecs,
} from "@/lib/parallel-chat-requests";
import { useChat } from "@/lib/stores/base";
import {
  useAddMessageToTree,
  useThreadInitialMessages,
} from "@/lib/stores/hooks-threads";
import { fetchWithErrorHandlers, generateUUID } from "@/lib/utils";
import { useChatRuntimeTransition } from "@/providers/chat-runtime-transition-provider";
import { useSession } from "@/providers/session-provider";
import { useTRPC } from "@/trpc/react";

function getResumableActiveStreamId(activeStreamId: string | null | undefined) {
  return activeStreamId && !activeStreamId.startsWith("pending:")
    ? activeStreamId
    : null;
}

function isResumableActiveStreamId(activeStreamId: string | null | undefined) {
  return !!(activeStreamId && !activeStreamId.startsWith("pending:"));
}

const reconnectClaimTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const RECONNECT_CLAIM_TTL_MS = 60_000;

function claimReconnectStream(activeStreamId: string | null | undefined) {
  const streamId = getResumableActiveStreamId(activeStreamId);
  if (!streamId) {
    return false;
  }

  if (reconnectClaimTimeouts.has(streamId)) {
    return false;
  }

  const timeout = setTimeout(() => {
    reconnectClaimTimeouts.delete(streamId);
  }, RECONNECT_CLAIM_TTL_MS);
  reconnectClaimTimeouts.set(streamId, timeout);
  return true;
}

function releaseReconnectStream(activeStreamId: string | null | undefined) {
  const streamId = getResumableActiveStreamId(activeStreamId);
  if (!streamId) {
    return;
  }

  const timeout = reconnectClaimTimeouts.get(streamId);
  if (timeout) {
    clearTimeout(timeout);
  }
  reconnectClaimTimeouts.delete(streamId);
}

export function ChatSync({
  id,
  projectId,
  transition,
}: {
  id: string;
  projectId?: string;
  transition?: InitialChatTransition | null;
}) {
  const { data: session } = useSession();
  const { mutate: saveChatMessage } = useSaveMessageMutation();
  const { dataStream, setDataStream } = useDataStream();
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const [autoResume, setAutoResume] = useState(true);
  const { markTransitionPhase, settleTransition } = useChatRuntimeTransition();

  const isAuthenticated = !!session?.user;
  const threadInitialMessages = useThreadInitialMessages();
  const addMessageToTree = useAddMessageToTree();
  const hasHandledTransitionConfirmationRef = useRef(false);
  const hasSettledTransitionRef = useRef(false);
  const claimedReconnectStreamIdRef = useRef<string | null>(null);

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
      releaseReconnectStream(claimedReconnectStreamIdRef.current);
      claimedReconnectStreamIdRef.current = null;
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
        const activeStreamId = current?.metadata?.activeStreamId ?? null;
        const partialMessageId = isResumableActiveStreamId(activeStreamId)
          ? (current?.id ?? null)
          : null;
        const didClaim = claimReconnectStream(activeStreamId);

        if (!(didClaim || !partialMessageId)) {
          return {
            api: `/api/chat/${chatId}/stream?messageId=${partialMessageId}&duplicate=1`,
          };
        }

        if (didClaim) {
          claimedReconnectStreamIdRef.current = activeStreamId;
        }

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
      releaseReconnectStream(claimedReconnectStreamIdRef.current);
      claimedReconnectStreamIdRef.current = null;

      if (
        error instanceof ChatSDKError &&
        error.type === "not_found" &&
        error.surface === "stream"
      ) {
        setAutoResume(false);
      }

      if (transition && !hasSettledTransitionRef.current) {
        hasSettledTransitionRef.current = true;
        settleTransition(transition.chatId);
      }

      const { message, description } = getStreamErrorToastContent(error);
      toast.error(message, description ? { description } : undefined);
    },
  });
  const { status, stop } = chatHelpers;

  useEffect(() => {
    if (!transition) {
      hasHandledTransitionConfirmationRef.current = false;
      hasSettledTransitionRef.current = false;
      return;
    }

    if (hasHandledTransitionConfirmationRef.current) {
      return;
    }

    const isChatConfirmed = (dataStream ?? []).some(
      (delta) =>
        delta.type === "data-chatConfirmed" &&
        delta.data.chatId === transition.chatId
    );

    if (!isChatConfirmed) {
      return;
    }

    hasHandledTransitionConfirmationRef.current = true;
    markTransitionPhase(transition.chatId, "confirmed");

    const invalidatePersistedChatQueries = async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: trpc.chat.getChatMessages.queryKey({
            chatId: transition.chatId,
          }),
        }),
        queryClient.invalidateQueries({
          queryKey: trpc.chat.getChatById.queryKey({
            chatId: transition.chatId,
          }),
        }),
        queryClient.invalidateQueries({
          queryKey: trpc.chat.getAllChats.queryKey(),
          exact: false,
        }),
      ]);
    };

    const secondaryRequestSpecs = transition.requestSpecs.slice(1);

    if (secondaryRequestSpecs.length === 0) {
      invalidatePersistedChatQueries().catch(() => {
        toast.error("Failed to refresh chat history");
      });
      return;
    }

    runParallelRequestSpecs({
      chatId: transition.chatId,
      message: transition.message,
      projectId: transition.projectId,
      requestSpecs: secondaryRequestSpecs,
    })
      .then((failedRequestSpecs) => {
        if (failedRequestSpecs.length > 0) {
          markParallelRequestSpecsFailed({
            addMessageToTree,
            message: transition.message,
            requestSpecs: failedRequestSpecs,
          });
          toast.error("Failed to complete all parallel responses");
        }
      })
      .catch(() => {
        toast.error("Failed to complete all parallel responses");
      })
      .finally(() => {
        invalidatePersistedChatQueries().catch(() => {
          toast.error("Failed to refresh chat history");
        });
      });
  }, [
    addMessageToTree,
    dataStream,
    markTransitionPhase,
    queryClient,
    transition,
    trpc,
  ]);

  useEffect(() => {
    if (
      !(
        transition &&
        transition.phase === "confirmed" &&
        (status === "ready" || status === "error") &&
        !hasSettledTransitionRef.current
      )
    ) {
      return;
    }

    hasSettledTransitionRef.current = true;
    settleTransition(transition.chatId);
  }, [settleTransition, status, transition]);

  // Keep route changes from turning an in-flight stream into a client-side
  // partial finish. The server owns persisted stream finalization.
  useEffect(
    () => () => {
      stop?.();
      releaseReconnectStream(claimedReconnectStreamIdRef.current);
      claimedReconnectStreamIdRef.current = null;
      setDataStream([]);
    },
    [setDataStream, stop]
  );

  useCompleteDataPart();

  return null;
}
