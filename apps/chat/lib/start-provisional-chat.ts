"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
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

export function useStartProvisionalChat(chatId: string) {
  const router = useRouter();
  const currentRoute = useCurrentChatRoute();
  const changeModel = useModelChange();
  const { data: session } = useSession();

  useEffect(() => {
    if (!(session?.user && currentRoute.type === "provisional")) {
      return;
    }

    const href = getProvisionalChatHref({
      chatId,
      projectId: currentRoute.projectId,
      source: currentRoute.source,
    });

    if (href) {
      router.prefetch(href);
    }
  }, [
    chatId,
    currentRoute.projectId,
    currentRoute.source,
    currentRoute.type,
    router,
    session?.user,
  ]);

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

      const href = getProvisionalChatHref({
        chatId,
        projectId: currentRoute.projectId,
        source: currentRoute.source,
      });

      if (!href) {
        return false;
      }

      router.push(href);

      if (currentRoute.source === "project") {
        resetDraftChatId(currentRoute.projectId);
      } else {
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
