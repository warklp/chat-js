"use client";

import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { AnonymousSessionInit } from "@/components/anonymous-session-init";
import { ChatRuntimeController } from "@/components/chat-runtime-controller";
import {
  ChatRuntimeRegistryProvider,
  type CreateRuntimeInput,
  MountedChatRuntimes,
} from "@/lib/chat-runtime";
import { useDraftChatId } from "@/lib/draft-chat";
import { parseChatIdFromPathname } from "@/providers/parse-chat-id-from-pathname";

interface ChatProvidersProps {
  children: React.ReactNode;
}

export function ChatProviders({ children }: ChatProvidersProps) {
  const pathname = usePathname();
  const route = useMemo(() => parseChatIdFromPathname(pathname), [pathname]);
  const projectId = route.type === "projectHome" ? route.projectId : null;
  const draftChatId = useDraftChatId(projectId);
  const initialRuntimes = useMemo<CreateRuntimeInput[]>(() => {
    if (
      draftChatId &&
      (route.type === "home" || route.type === "projectHome")
    ) {
      return [
        {
          chatId: draftChatId,
          projectId,
        },
      ];
    }

    return [];
  }, [draftChatId, projectId, route.type]);

  return (
    <>
      <AnonymousSessionInit />
      <ChatRuntimeRegistryProvider initialRuntimes={initialRuntimes}>
        <MountedChatRuntimes>
          <ChatRuntimeController />
        </MountedChatRuntimes>
        {children}
      </ChatRuntimeRegistryProvider>
    </>
  );
}
