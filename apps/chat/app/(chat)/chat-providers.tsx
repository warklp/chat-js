"use client";

import { AnonymousSessionInit } from "@/components/anonymous-session-init";
import {
  ChatRuntimeRegistryProvider,
  PersistentChatRuntimes,
} from "@/providers/chat-runtime-registry-provider";

interface ChatProvidersProps {
  children: React.ReactNode;
}

export function ChatProviders({ children }: ChatProvidersProps) {
  return (
    <>
      <AnonymousSessionInit />
      <ChatRuntimeRegistryProvider>
        <PersistentChatRuntimes />
        {children}
      </ChatRuntimeRegistryProvider>
    </>
  );
}
