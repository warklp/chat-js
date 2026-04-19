"use client";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChatSystem } from "@/components/chat-system";
import type { AppModelId } from "@/lib/ai/app-models";
import { useHomeDraftVersion } from "@/lib/home-draft-reset";
import { generateUUID } from "@/lib/utils";

export function ChatHome() {
  const draftVersion = useHomeDraftVersion();
  const [id, setId] = useState(() => generateUUID());
  const previousDraftVersion = useRef(draftVersion);
  const searchParams = useSearchParams();

  useEffect(() => {
    if (previousDraftVersion.current === draftVersion) {
      return;
    }

    previousDraftVersion.current = draftVersion;
    setId(generateUUID());
  }, [draftVersion]);

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
