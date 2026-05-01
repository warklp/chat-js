"use client";

import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { AnonymousSessionInit } from "@/components/anonymous-session-init";
import { AppRuntimeSlot } from "@/components/chat-runtime-controller";
import {
  ChatRuntimeRegistryProvider,
  MountedChatRuntimes,
  type RuntimeId,
} from "@/lib/chat-runtime";
import { createMainChatRuntimeId } from "@/lib/chat-runtime-id";
import { useDraftChatId } from "@/lib/draft-chat";
import {
  ChatRuntimeStoreRegistryProvider,
  type CreateChatRuntimeStoreInput,
  createChatRuntimeStoreInput,
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
  const initialRuntimeId =
    draftChatId && (route.type === "home" || route.type === "projectHome")
      ? createMainChatRuntimeId(draftChatId)
      : null;
  const initialRuntimeIds = useMemo<RuntimeId[]>(() => {
    if (initialRuntimeId) {
      return [initialRuntimeId];
    }

    return [];
  }, [initialRuntimeId]);
  const initialStores = useMemo<CreateChatRuntimeStoreInput[]>(
    () =>
      initialRuntimeId
        ? [createChatRuntimeStoreInput({ runtimeId: initialRuntimeId })]
        : [],
    [initialRuntimeId]
  );

  return (
    <>
      <AnonymousSessionInit />
      <ChatRuntimeStoreRegistryProvider initialStores={initialStores}>
        <ChatRuntimeRegistryProvider initialRuntimeIds={initialRuntimeIds}>
          <MountedChatRuntimes>
            {(runtimeId) => <AppRuntimeSlot runtimeId={runtimeId} />}
          </MountedChatRuntimes>
          {children}
        </ChatRuntimeRegistryProvider>
      </ChatRuntimeStoreRegistryProvider>
    </>
  );
}
