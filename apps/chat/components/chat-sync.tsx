"use client";

import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useSaveMessageMutation } from "@/hooks/chat-sync-hooks";
import { useCompleteDataPart } from "@/hooks/use-complete-data-part";
import { ChatSDKError } from "@/lib/ai/errors";
import { getStreamErrorToastContent } from "@/lib/ai/stream-errors";
import type { ChatMessage } from "@/lib/ai/types";
import type { UseChatHelpers } from "@/lib/stores/base";
import { useChat } from "@/lib/stores/base";
import { useChatPersistenceActions } from "@/lib/stores/hooks-chat-persistence";
import { useDataStream } from "@/lib/stores/hooks-data-stream";
import {
  useAddMessageToTree,
  useThreadInitialMessages,
} from "@/lib/stores/hooks-threads";
import { fetchWithErrorHandlers, generateUUID } from "@/lib/utils";
import { useSession } from "@/providers/session-provider";

export interface PendingChatSyncSubmission {
  message: ChatMessage;
  options?: Parameters<UseChatHelpers<ChatMessage>["sendMessage"]>[1];
}

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
  onPendingSubmissionStarted,
  pendingSubmission,
  projectId,
}: {
  id: string;
  onPendingSubmissionStarted?: () => void;
  pendingSubmission?: PendingChatSyncSubmission | null;
  projectId?: string;
}) {
  const { data: session } = useSession();
  const { mutate: saveChatMessage } = useSaveMessageMutation();
  const { setChatPersisted } = useChatPersistenceActions();
  const { setDataStream } = useDataStream();
  const [autoResume, setAutoResume] = useState(true);

  const isAuthenticated = !!session?.user;
  const threadInitialMessages = useThreadInitialMessages();
  const addMessageToTree = useAddMessageToTree();
  const hasStartedPendingSubmissionRef = useRef(false);
  const pendingSubmissionTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const hasReportedConfirmationRef = useRef(false);
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
      if (
        !hasReportedConfirmationRef.current &&
        dataPart.type === "data-chatConfirmed" &&
        dataPart.data.chatId === id
      ) {
        hasReportedConfirmationRef.current = true;
        setChatPersisted(true);
      }
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

      const { message, description } = getStreamErrorToastContent(error);
      toast.error(message, description ? { description } : undefined);
    },
  });
  const { status, stop } = chatHelpers;

  useEffect(() => {
    if (
      !(
        pendingSubmission &&
        !hasStartedPendingSubmissionRef.current &&
        !pendingSubmissionTimeoutRef.current
      )
    ) {
      return;
    }

    if (!(status === "ready" || status === "error")) {
      return;
    }

    pendingSubmissionTimeoutRef.current = setTimeout(() => {
      pendingSubmissionTimeoutRef.current = null;
      hasStartedPendingSubmissionRef.current = true;
      onPendingSubmissionStarted?.();
      chatHelpers.sendMessage(
        pendingSubmission.message,
        pendingSubmission.options
      );
    });

    return () => {
      if (pendingSubmissionTimeoutRef.current) {
        clearTimeout(pendingSubmissionTimeoutRef.current);
        pendingSubmissionTimeoutRef.current = null;
      }
    };
  }, [
    chatHelpers.sendMessage,
    onPendingSubmissionStarted,
    pendingSubmission,
    status,
  ]);

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
