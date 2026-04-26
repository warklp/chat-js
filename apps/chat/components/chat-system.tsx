"use client";

import { memo } from "react";
import { Chat } from "@/components/chat";
import { ChatSync } from "@/components/chat-sync";
import { DataStreamHandler } from "@/components/data-stream-handler";
import { DataStreamProvider } from "@/components/data-stream-provider";
import { MessageTreeSync } from "@/components/message-tree-sync";
import { ArtifactProvider } from "@/hooks/use-artifact";
import type { AppModelId } from "@/lib/ai/app-models";
import type { ChatMessage, UiToolName } from "@/lib/ai/types";
import type { ChatBootstrapEntry } from "@/lib/chat-bootstrap";
import type { ChatRouteSource } from "@/lib/chat-route";
import { CustomStoreProvider } from "@/lib/stores/custom-store-provider";
import { useThreadEpoch } from "@/lib/stores/hooks-threads";
import { ChatInputProvider } from "@/providers/chat-input-provider";

function ChatThreadSync({
  bootstrapEntry,
  id,
  onBootstrapSettled,
  projectId,
  withHandler,
}: {
  bootstrapEntry?: ChatBootstrapEntry | null;
  id: string;
  onBootstrapSettled?: () => void;
  projectId?: string;
  withHandler: boolean;
}) {
  const threadEpoch = useThreadEpoch();
  return (
    <>
      <ChatSync
        bootstrapEntry={bootstrapEntry}
        id={id}
        key={`chat-sync:${id}:${threadEpoch}`}
        onBootstrapSettled={onBootstrapSettled}
        projectId={projectId}
      />
      {withHandler ? (
        <DataStreamHandler id={id} key={`stream:${id}:${threadEpoch}`} />
      ) : null}
    </>
  );
}

export const ChatSystem = memo(function PureChatSystem({
  bootstrapEntry,
  id,
  initialMessages,
  isReadonly,
  initialTool = null,
  onBootstrapSettled,
  overrideModelId,
  projectId,
  persistedQueriesEnabled = true,
  routeSource = projectId ? "project" : "chat",
}: {
  bootstrapEntry?: ChatBootstrapEntry | null;
  id: string;
  initialMessages: ChatMessage[];
  isReadonly: boolean;
  initialTool?: UiToolName | null;
  onBootstrapSettled?: () => void;
  overrideModelId?: AppModelId;
  projectId?: string;
  persistedQueriesEnabled?: boolean;
  routeSource?: ChatRouteSource;
}) {
  return (
    <ArtifactProvider key={id}>
      <DataStreamProvider key={id}>
        <CustomStoreProvider<ChatMessage>
          initialMessages={initialMessages}
          key={id}
        >
          <MessageTreeSync
            chatId={id}
            persistedQueriesEnabled={persistedQueriesEnabled}
            source={routeSource}
          />
          {isReadonly ? (
            <>
              <ChatThreadSync
                bootstrapEntry={bootstrapEntry}
                id={id}
                onBootstrapSettled={onBootstrapSettled}
                projectId={projectId}
                withHandler={false}
              />
              <Chat
                id={id}
                isReadonly={isReadonly}
                key={id}
                persistedQueriesEnabled={persistedQueriesEnabled}
                projectId={projectId}
                routeSource={routeSource}
              />
            </>
          ) : (
            <ChatInputProvider
              initialTool={initialTool ?? null}
              isProjectContext={!!projectId}
              localStorageEnabled={true}
              overrideModelId={overrideModelId}
            >
              <ChatThreadSync
                bootstrapEntry={bootstrapEntry}
                id={id}
                onBootstrapSettled={onBootstrapSettled}
                projectId={projectId}
                withHandler={true}
              />
              <Chat
                id={id}
                isReadonly={isReadonly}
                key={id}
                persistedQueriesEnabled={persistedQueriesEnabled}
                projectId={projectId}
                routeSource={routeSource}
              />
            </ChatInputProvider>
          )}
        </CustomStoreProvider>
      </DataStreamProvider>
    </ArtifactProvider>
  );
});
