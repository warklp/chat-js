"use client";

import {
  ChatLayout,
  ChatLayoutHandle,
  ChatLayoutMain,
  ChatLayoutSecondary,
} from "@/components/chat/chat-layout";
import { MainChatPanel } from "@/components/chat/main-chat-panel";
import { SecondaryChatPanel } from "@/components/chat/secondary-chat-panel";
import { useArtifactSelector } from "@/hooks/use-artifact";
import type { ChatRouteSource } from "@/lib/chat-route";

export function Chat({
  id,
  isReadonly,
  projectId,
  persistedQueriesEnabled,
  routeSource,
}: {
  id: string;
  isReadonly: boolean;
  projectId?: string;
  persistedQueriesEnabled: boolean;
  routeSource: ChatRouteSource;
}) {
  const isSecondaryPanelVisible = useArtifactSelector(
    (state) => state.isVisible
  );

  return (
    <ChatLayout isSecondaryPanelVisible={isSecondaryPanelVisible}>
      <ChatLayoutMain>
        <MainChatPanel
          chatId={id}
          className="flex h-full min-w-0 flex-1 flex-col"
          isReadonly={isReadonly}
          persistedQueriesEnabled={persistedQueriesEnabled}
          projectId={projectId}
          routeSource={routeSource}
        />
      </ChatLayoutMain>

      <ChatLayoutHandle />

      <ChatLayoutSecondary>
        <SecondaryChatPanel
          className="flex h-full min-w-0 flex-1 flex-col"
          isReadonly={isReadonly}
        />
      </ChatLayoutSecondary>
    </ChatLayout>
  );
}
