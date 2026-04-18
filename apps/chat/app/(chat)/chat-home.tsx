"use client";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { ChatSystem } from "@/components/chat-system";
import type { AppModelId } from "@/lib/ai/app-models";
import { useHomeDraftVersion } from "@/lib/home-draft-reset";
import { generateUUID } from "@/lib/utils";

export function ChatHome() {
  const draftVersion = useHomeDraftVersion();
  const id = useMemo(() => generateUUID(), [draftVersion]);
  const searchParams = useSearchParams();
  const overrideModelId = useMemo(() => {
    const value = searchParams.get("modelId");
    return (value as AppModelId) || undefined;
  }, [searchParams]);
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
