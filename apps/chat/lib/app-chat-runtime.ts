import type { ChatRuntimeId } from "@/lib/chat-runtime-id";
import { parseChatRuntimeId } from "@/lib/chat-runtime-id";
import type { CreateRuntimeInput, Runtime } from "@/lib/runtime-registry";
import type { ChatMessage, UiToolName } from "./ai/types";
import {
  type CustomChatStoreApi,
  createCustomChatStore,
} from "./stores/custom-store-provider";

export interface AppRuntimeData {
  bootstrap: boolean;
  chatId: string;
  initialMessages?: ChatMessage[];
  initialTool?: UiToolName | null;
  store: CustomChatStoreApi<ChatMessage> | null;
  threadId: string;
}

export type AppRuntime = Runtime<AppRuntimeData>;
export type CreateAppRuntimeInput = CreateRuntimeInput<AppRuntimeData>;

export function createAppRuntimeInput({
  bootstrap,
  initialMessages,
  initialTool,
  runtimeId,
}: {
  bootstrap: boolean;
  initialMessages?: ChatMessage[];
  initialTool?: UiToolName | null;
  runtimeId: ChatRuntimeId;
}): CreateAppRuntimeInput {
  const parsed = parseChatRuntimeId(runtimeId);
  if (!parsed) {
    throw new Error(`Invalid chat runtime id: ${runtimeId}`);
  }

  return {
    data: {
      bootstrap,
      chatId: parsed.chatId,
      initialMessages,
      initialTool,
      store: null,
      threadId: parsed.threadId,
    },
    runtimeId,
  };
}

export function materializeAppRuntimeStore(runtime: AppRuntime) {
  if (runtime.data.store) {
    return runtime.data.store;
  }

  const store = createCustomChatStore<ChatMessage>(
    runtime.data.initialMessages ?? []
  );

  if (runtime.data.bootstrap) {
    store.getState().setChatPersisted(true);
  }

  runtime.data.store = store;
  return store;
}
