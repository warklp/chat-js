"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { ChatSync } from "@/components/chat-sync";
import { type AppRuntime, getAppRuntimeStore } from "@/lib/app-chat-runtime";
import {
  addPendingAssistantMessages,
  markParallelRequestSpecsFailed,
  runParallelRequestSpecs,
} from "@/lib/parallel-chat-requests";
import { claimProvisionalChatConfirmation } from "@/lib/provisional-chat-confirmations";
import { CustomStoreProvider } from "@/lib/stores/custom-store-provider";
import { useIsChatPersisted } from "@/lib/stores/hooks-chat-persistence";
import { useAddMessageToTree } from "@/lib/stores/hooks-threads";
import { useTRPC } from "@/trpc/react";

function ChatConfirmationEffects({ chatId }: { chatId: string }) {
  const addMessageToTree = useAddMessageToTree();
  const isChatPersisted = useIsChatPersisted(chatId);
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const handledConfirmationRef = useRef(false);

  useEffect(() => {
    if (!isChatPersisted) {
      return;
    }

    if (handledConfirmationRef.current) {
      return;
    }

    const pendingConfirmation = claimProvisionalChatConfirmation(chatId);
    if (!pendingConfirmation) {
      return;
    }

    handledConfirmationRef.current = true;

    const invalidatePersistedChatQueries = async () => {
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
    };

    const secondaryRequestSpecs = pendingConfirmation.requestSpecs.slice(1);

    if (secondaryRequestSpecs.length === 0) {
      invalidatePersistedChatQueries().catch(() => {
        toast.error("Failed to refresh chat history");
      });
      return;
    }

    addPendingAssistantMessages({
      addMessageToTree,
      message: pendingConfirmation.message,
      requestSpecs: secondaryRequestSpecs,
    });

    runParallelRequestSpecs({
      chatId,
      message: pendingConfirmation.message,
      projectId: pendingConfirmation.projectId,
      requestSpecs: secondaryRequestSpecs,
    })
      .then((failedRequestSpecs) => {
        if (failedRequestSpecs.length > 0) {
          markParallelRequestSpecsFailed({
            addMessageToTree,
            message: pendingConfirmation.message,
            requestSpecs: failedRequestSpecs,
          });
          toast.error("Failed to complete all parallel responses");
        }
      })
      .catch(() => {
        markParallelRequestSpecsFailed({
          addMessageToTree,
          message: pendingConfirmation.message,
          requestSpecs: secondaryRequestSpecs,
        });
        toast.error("Failed to complete all parallel responses");
      })
      .finally(() => {
        invalidatePersistedChatQueries().catch(() => {
          toast.error("Failed to refresh chat history");
        });
      });
  }, [addMessageToTree, chatId, isChatPersisted, queryClient, trpc]);

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
