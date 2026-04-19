"use client";
import { useSearchParams } from "next/navigation";
import { ChatSystem } from "@/components/chat-system";
import type { AppModelId } from "@/lib/ai/app-models";
import { useDraftChatId } from "@/lib/draft-chat";
import { useChatModels } from "@/providers/chat-models-provider";

export function ChatHome() {
  const id = useDraftChatId();
  const searchParams = useSearchParams();
  const { getModelById } = useChatModels();
  const value = searchParams.get("modelId");
  const overrideModelId =
    value && getModelById(value) ? (value as AppModelId) : undefined;

  if (!id) {
    return null;
  }

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
