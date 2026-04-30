"use client";

import { AnonymousSessionInit } from "@/components/anonymous-session-init";
import { ChatRuntimeController } from "@/components/chat-runtime-controller";
import {
  ChatRuntimeRegistryProvider,
  MountedChatRuntimes,
} from "@/lib/chat-runtime";

interface ChatProvidersProps {
  children: React.ReactNode;
}

export function ChatProviders({ children }: ChatProvidersProps) {
  return (
    <>
      <AnonymousSessionInit />
      <ChatRuntimeRegistryProvider>
        <MountedChatRuntimes>
          <ChatRuntimeController />
        </MountedChatRuntimes>
        {children}
      </ChatRuntimeRegistryProvider>
    </>
  );
}
