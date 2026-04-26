"use client";

import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useCallback } from "react";
import type { ChatMessage } from "@/lib/ai/types";
import { useCurrentChatRoute } from "@/lib/chat-route";
import { getBaseChatRuntimeKey } from "@/lib/chat-runtime-transition";
import { resetDraftChatId } from "@/lib/draft-chat";
import type { ParallelRequestSpec } from "@/lib/draft-chat-submission";
import {
  addPendingAssistantMessages,
  createParallelRequestBody,
} from "@/lib/parallel-chat-requests";
import { useChatActions } from "@/lib/stores/base";
import { useAddMessageToTree } from "@/lib/stores/hooks-threads";
import { useChatRuntimeTransition } from "@/providers/chat-runtime-transition-provider";
import { useModelChange } from "@/providers/default-model-provider";
import { useSession } from "@/providers/session-provider";

function getProvisionalChatHref({
  chatId,
  projectId,
  source,
}: {
  chatId: string;
  projectId: string | null;
  source: "home" | "project";
}) {
  if (source === "project") {
    return projectId ? (`/project/${projectId}/chat/${chatId}` as Route) : null;
  }

  return `/chat/${chatId}` as Route;
}

function isInitialRoute(
  route: ReturnType<typeof useCurrentChatRoute>
): route is Extract<
  ReturnType<typeof useCurrentChatRoute>,
  { type: "home" | "projectHome" }
> {
  return route.type === "home" || route.type === "projectHome";
}

export function useStartProvisionalChat(chatId: string) {
  const pathname = usePathname() ?? "/";
  const currentRoute = useCurrentChatRoute();
  const changeModel = useModelChange();
  const { data: session } = useSession();
  const { sendMessage } = useChatActions<ChatMessage>();
  const addMessageToTree = useAddMessageToTree();
  const { startInitialTransition } = useChatRuntimeTransition();

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
      if (!(session?.user && isInitialRoute(currentRoute))) {
        return false;
      }

      const href = getProvisionalChatHref({
        chatId,
        projectId: currentRoute.projectId,
        source: currentRoute.source,
      });

      if (!(href && sendMessage)) {
        return false;
      }

      const runtimeKey = getBaseChatRuntimeKey({
        draftChatId: chatId,
        pathname,
        route: currentRoute,
      });

      const didStartTransition = startInitialTransition({
        chatId,
        fromPath: pathname,
        message,
        projectId: currentRoute.projectId,
        requestSpecs,
        runtimeKey,
        source: currentRoute.source,
        toPath: href,
      });

      if (!didStartTransition) {
        return false;
      }

      const primaryRequest = requestSpecs[0] ?? null;

      if (primaryRequest) {
        changeModel(primaryRequest.modelId);
        sendMessage(message, {
          body: createParallelRequestBody(primaryRequest, true),
        });
      } else {
        sendMessage(message);
      }

      addMessageToTree(message);

      addPendingAssistantMessages({
        addMessageToTree,
        message,
        requestSpecs,
      });

      window.history.pushState(null, "", href);
      setTimeout(() => resetDraftChatId(currentRoute.projectId), 0);
      onStarted?.();

      return true;
    },
    [
      addMessageToTree,
      changeModel,
      chatId,
      currentRoute,
      pathname,
      sendMessage,
      session?.user,
      startInitialTransition,
    ]
  );
}
