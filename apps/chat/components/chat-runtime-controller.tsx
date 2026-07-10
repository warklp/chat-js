"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { ChatSync } from "@/components/chat-sync";
import { type AppRuntime, getAppRuntimeStore } from "@/lib/app-chat-runtime";
import {
  markParallelRequestSpecsFailed,
  runParallelRequestSpecs,
} from "@/lib/parallel-chat-requests";
import { CustomStoreProvider } from "@/lib/stores/custom-store-provider";
import {
  useChatPersistenceActions,
  useIsChatPersisted,
  usePendingChatConfirmation,
} from "@/lib/stores/hooks-chat-persistence";
import { useAddMessageToTree } from "@/lib/stores/hooks-threads";
import { summarizeThreadMessages, traceThread } from "@/lib/thread-debug";
import { useTRPC } from "@/trpc/react";

function ChatConfirmationEffects({ chatId }: { chatId: string }) {
  const addMessageToTree = useAddMessageToTree();
  const isChatPersisted = useIsChatPersisted(chatId);
  const pendingConfirmation = usePendingChatConfirmation();
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const { clearPendingChatConfirmation } = useChatPersistenceActions();
  const handledConfirmationRef = useRef(false);

  useEffect(() => {
    if (!(isChatPersisted && pendingConfirmation)) {
      return;
    }

    if (handledConfirmationRef.current) {
      return;
    }

    handledConfirmationRef.current = true;

    traceThread("confirmation", "persisted.start", {
      chatId,
      message: summarizeThreadMessages([pendingConfirmation.message])[0],
      requestSpecs: pendingConfirmation.requestSpecs,
    });

    const invalidatePersistedChatQueries = async () => {
      traceThread("query-sync", "confirmation.invalidate.start", { chatId });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: trpc.chat.getChatMessages.queryKey({
            chatId,
          }),
        }),
        queryClient.invalidateQueries({
          queryKey: trpc.chat.getChatById.queryKey({
            chatId,
          }),
        }),
        queryClient.invalidateQueries({
          queryKey: trpc.chat.getAllChats.queryKey(),
          exact: false,
        }),
      ]);
      traceThread("query-sync", "confirmation.invalidate.finish", { chatId });
    };

    const secondaryRequestSpecs = pendingConfirmation.requestSpecs.slice(1);

    if (secondaryRequestSpecs.length === 0) {
      invalidatePersistedChatQueries()
        .catch(() => {
          toast.error("Failed to refresh chat history");
        })
        .finally(clearPendingChatConfirmation);
      return;
    }

    runParallelRequestSpecs({
      chatId,
      message: pendingConfirmation.message,
      projectId: pendingConfirmation.projectId,
      requestSpecs: secondaryRequestSpecs,
    })
      .then((failedRequestSpecs) => {
        traceThread("confirmation", "secondaryRequests.settled", {
          chatId,
          failedAssistantMessageIds: failedRequestSpecs.map(
            (request) => request.assistantMessageId
          ),
        });
        if (failedRequestSpecs.length > 0) {
          markParallelRequestSpecsFailed({
            addMessageToTree,
            message: pendingConfirmation.message,
            requestSpecs: failedRequestSpecs,
          });
          toast.error("Failed to complete all parallel responses");
        }
      })
      .catch((error: unknown) => {
        traceThread("confirmation", "secondaryRequests.error", {
          chatId,
          error: error instanceof Error ? error.message : String(error),
        });
        markParallelRequestSpecsFailed({
          addMessageToTree,
          message: pendingConfirmation.message,
          requestSpecs: secondaryRequestSpecs,
        });
        toast.error("Failed to complete all parallel responses");
      })
      .finally(() => {
        invalidatePersistedChatQueries()
          .catch(() => {
            toast.error("Failed to refresh chat history");
          })
          .finally(clearPendingChatConfirmation);
      });
  }, [
    addMessageToTree,
    chatId,
    clearPendingChatConfirmation,
    isChatPersisted,
    pendingConfirmation,
    queryClient,
    trpc,
  ]);

  return null;
}

export function AppRuntimeSlot({ runtime }: { runtime: AppRuntime }) {
  const store = getAppRuntimeStore(runtime);

  return (
    <CustomStoreProvider store={store}>
      <ChatConfirmationEffects chatId={runtime.data.chatId} />
      <ChatSync id={runtime.data.chatId} />
    </CustomStoreProvider>
  );
}
