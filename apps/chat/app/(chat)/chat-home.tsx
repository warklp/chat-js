"use client";
import { useSearchParams } from "next/navigation";
import { ChatSystem } from "@/components/chat-system";
import type { AppModelId } from "@/lib/ai/app-models";
import { useDraftChatId } from "@/lib/draft-chat";

export function ChatHome() {
  const id = useDraftChatId();
  const searchParams = useSearchParams();
  const value = searchParams.get("modelId");
  const overrideModelId = (value as AppModelId) || undefined;

  return (
    <ChatSystem
      id={id}
      initialMessages={[]}
      isReadonly={false}
      overrideModelId={overrideModelId}
      persistedQueriesEnabled={false}
      routeSource="home"
    />
  );
}
