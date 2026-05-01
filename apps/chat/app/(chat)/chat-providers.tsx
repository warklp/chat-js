"use client";

import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { AnonymousSessionInit } from "@/components/anonymous-session-init";
import { AppRuntimeSlot } from "@/components/chat-runtime-controller";
import {
  ChatRuntimeRegistryProvider,
  type CreateRuntimeInput,
  MountedChatRuntimes,
} from "@/lib/chat-runtime";
import { useDraftChatId } from "@/lib/draft-chat";
import {
  ChatRuntimeStoreRegistryProvider,
  type CreateChatRuntimeStoreInput,
} from "@/lib/stores/chat-runtime-store-registry";
import { parseChatIdFromPathname } from "@/providers/parse-chat-id-from-pathname";

interface ChatProvidersProps {
  children: React.ReactNode;
}

export function ChatProviders({ children }: ChatProvidersProps) {
  const pathname = usePathname();
  const route = useMemo(() => parseChatIdFromPathname(pathname), [pathname]);
  const projectId = route.type === "projectHome" ? route.projectId : null;
  const draftChatId = useDraftChatId(projectId);
  const initialRuntimeIds = useMemo<CreateRuntimeInput[]>(() => {
    if (
      draftChatId &&
      (route.type === "home" || route.type === "projectHome")
    ) {
      return [
        {
          chatId: draftChatId,
        },
      ];
    }

    return [];
  }, [draftChatId, route.type]);
  const initialStores = useMemo<CreateChatRuntimeStoreInput[]>(
    () => initialRuntimeIds,
    [initialRuntimeIds]
  );

  return (
    <>
      <AnonymousSessionInit />
      <ChatRuntimeStoreRegistryProvider initialStores={initialStores}>
        <ChatRuntimeRegistryProvider initialRuntimes={initialRuntimeIds}>
          <MountedChatRuntimes>
            {(runtime) => <AppRuntimeSlot runtime={runtime} />}
          </MountedChatRuntimes>
          {children}
        </ChatRuntimeRegistryProvider>
      </ChatRuntimeStoreRegistryProvider>
    </>
  );
}
