"use client";

import { AnonymousSessionInit } from "@/components/anonymous-session-init";
import {
  ChatRuntimeRegistryProvider,
  MountedChatRuntimes,
} from "@/providers/chat-runtime-registry-provider";

interface ChatProvidersProps {
  children: React.ReactNode;
}

export function ChatProviders({ children }: ChatProvidersProps) {
  return (
    <>
      <AnonymousSessionInit />
      <ChatRuntimeRegistryProvider>
        <MountedChatRuntimes />
        {children}
      </ChatRuntimeRegistryProvider>
    </>
  );
}
