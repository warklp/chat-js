"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type { ChatMessage } from "@/lib/ai/types";
import {
  createChatBootstrapEntry,
  setChatBootstrap,
} from "@/lib/chat-bootstrap";
import { useCurrentChatRoute } from "@/lib/chat-route";
import { resetDraftChatId } from "@/lib/draft-chat";
import type { ParallelRequestSpec } from "@/lib/draft-chat-submission";
import { useModelChange } from "@/providers/default-model-provider";
import { useSession } from "@/providers/session-provider";

export function useStartProvisionalChat(chatId: string) {
  const router = useRouter();
  const currentRoute = useCurrentChatRoute();
  const changeModel = useModelChange();
  const { data: session } = useSession();

  return useCallback(
    ({
      message,
      onStarted,
      requestSpecs,
    }: {
      message: ChatMessage;
      onStarted?: () => void;
      requestSpecs: ParallelRequestSpec[];
    }) => {
      if (!(session?.user && currentRoute.type === "provisional")) {
        return false;
      }

      const primaryRequest = requestSpecs[0];
      if (primaryRequest) {
        changeModel(primaryRequest.modelId);
      }

      setChatBootstrap(
        createChatBootstrapEntry({
          chatId,
          message,
          projectId: currentRoute.projectId,
          requestSpecs,
        })
      );

      if (currentRoute.source === "project" && currentRoute.projectId) {
        router.push(`/project/${currentRoute.projectId}/chat/${chatId}`);
        resetDraftChatId(currentRoute.projectId);
      } else {
        router.push(`/chat/${chatId}`);
        resetDraftChatId();
      }

      onStarted?.();

      return true;
    },
    [
      changeModel,
      chatId,
      currentRoute.projectId,
      currentRoute.source,
      currentRoute.type,
      router,
      session?.user,
    ]
  );
}
