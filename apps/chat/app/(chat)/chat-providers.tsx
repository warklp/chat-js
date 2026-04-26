"use client";

import { AnonymousSessionInit } from "@/components/anonymous-session-init";

interface ChatProvidersProps {
  children: React.ReactNode;
}

export function ChatProviders({ children }: ChatProvidersProps) {
  return (
    <>
      <AnonymousSessionInit />
      {children}
    </>
  );
}
