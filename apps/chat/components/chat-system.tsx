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
import type { ChatRouteSource } from "@/lib/chat-route";
import {
  type CustomChatStoreApi,
  CustomStoreProvider,
} from "@/lib/stores/custom-store-provider";
import { useThreadEpoch } from "@/lib/stores/hooks-threads";
import type { UIChat } from "@/lib/types/ui-chat";
import { ChatInputProvider } from "@/providers/chat-input-provider";

function ChatThreadSync({
  id,
  projectId,
  withHandler,
}: {
  id: string;
  projectId?: string;
  withHandler: boolean;
}) {
  const threadEpoch = useThreadEpoch();

  return (
    <>
      <ChatSync
        id={id}
        key={`chat-sync:${id}:${threadEpoch}`}
        projectId={projectId}
      />
      {withHandler ? (
        <DataStreamHandler key={`stream:${id}:${threadEpoch}`} />
      ) : null}
    </>
  );
}

export const ChatSystem = memo(function PureChatSystem({
  chat,
  controller = "route",
  id,
  initialMessages,
  isReadonly,
  initialTool = null,
  overrideModelId,
  projectId,
  routeSource = projectId ? "project" : "chat",
  runtimeKey,
  syncedMessages,
  store,
}: {
  chat?: UIChat | null;
  controller?: "external" | "route";
  id: string;
  initialMessages: ChatMessage[];
  isReadonly: boolean;
  initialTool?: UiToolName | null;
  overrideModelId?: AppModelId;
  projectId?: string;
  routeSource?: ChatRouteSource;
  runtimeKey: string;
  syncedMessages?: ChatMessage[] | null;
  store?: CustomChatStoreApi<ChatMessage>;
}) {
  return (
    <ArtifactProvider key={runtimeKey}>
      <DataStreamProvider key={runtimeKey}>
        <CustomStoreProvider<ChatMessage>
          initialMessages={initialMessages}
          key={runtimeKey}
          store={store}
        >
          <MessageTreeSync messages={syncedMessages} />
          {isReadonly ? (
            <>
              {controller === "route" ? (
                <ChatThreadSync
                  id={id}
                  projectId={projectId}
                  withHandler={false}
                />
              ) : null}
              <Chat
                chat={chat}
                id={id}
                isReadonly={isReadonly}
                key={runtimeKey}
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
              {controller === "route" ? (
                <ChatThreadSync
                  id={id}
                  projectId={projectId}
                  withHandler={true}
                />
              ) : null}
              <Chat
                chat={chat}
                id={id}
                isReadonly={isReadonly}
                key={runtimeKey}
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
