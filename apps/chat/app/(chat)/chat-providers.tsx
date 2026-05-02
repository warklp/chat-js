"use client";

import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { AnonymousSessionInit } from "@/components/anonymous-session-init";
import { AppRuntimeSlot } from "@/components/chat-runtime-controller";
import {
  type AppRuntimeData,
  type CreateAppRuntimeInput,
  createAppRuntimeInput,
} from "@/lib/app-chat-runtime";
import { MountedRuntimes, RuntimeRegistryProvider } from "@/lib/chat-runtime";
import { createMainChatRuntimeId } from "@/lib/chat-runtime-id";
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
  const initialRuntimeId =
    draftChatId && (route.type === "home" || route.type === "projectHome")
      ? createMainChatRuntimeId(draftChatId)
      : null;
  const initialRuntimes = useMemo<CreateAppRuntimeInput[]>(() => {
    if (initialRuntimeId) {
      return [
        createAppRuntimeInput({
          bootstrap: false,
          runtimeId: initialRuntimeId,
        }),
      ];
    }

    return [];
  }, [initialRuntimeId]);

  return (
    <>
      <AnonymousSessionInit />
      <RuntimeRegistryProvider initialRuntimes={initialRuntimes}>
        <MountedRuntimes<AppRuntimeData>>
          {(runtime) => <AppRuntimeSlot runtime={runtime} />}
        </MountedRuntimes>
        {children}
      </RuntimeRegistryProvider>
    </>
  );
}
