"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ChatMessage } from "@/lib/ai/types";
import type { ChatRuntimeId } from "@/lib/chat-runtime-id";
import { parseChatRuntimeId } from "@/lib/chat-runtime-id";
import {
  type CustomChatStoreApi,
  createCustomChatStore,
} from "@/lib/stores/custom-store-provider";

export interface CreateChatRuntimeStoreInput {
  chatId: string;
  initialMessages?: ChatMessage[];
  runtimeId: ChatRuntimeId;
  threadId: string;
}

export interface ChatRuntimeStoreEntry {
  chatId: string;
  runtimeId: ChatRuntimeId;
  store: CustomChatStoreApi<ChatMessage>;
  threadId: string;
}

interface ChatRuntimeStoreRegistryContextValue {
  createStoreIfMissing: (
    input: CreateChatRuntimeStoreInput
  ) => CustomChatStoreApi<ChatMessage>;
  entries: ChatRuntimeStoreEntry[];
  getEntryByRuntimeId: (
    runtimeId: string | null | undefined
  ) => ChatRuntimeStoreEntry | null;
}

const ChatRuntimeStoreRegistryContext =
  createContext<ChatRuntimeStoreRegistryContextValue | null>(null);

function createStoreEntry(
  input: CreateChatRuntimeStoreInput
): ChatRuntimeStoreEntry {
  return {
    chatId: input.chatId,
    runtimeId: input.runtimeId,
    store: createCustomChatStore(input.initialMessages ?? []),
    threadId: input.threadId,
  };
}

function createInitialStoreEntries(
  initialStores: CreateChatRuntimeStoreInput[]
) {
  const entries: ChatRuntimeStoreEntry[] = [];
  const seenRuntimeIds = new Set<string>();

  for (const initialStore of initialStores) {
    if (seenRuntimeIds.has(initialStore.runtimeId)) {
      continue;
    }

    seenRuntimeIds.add(initialStore.runtimeId);
    entries.push(createStoreEntry(initialStore));
  }

  return entries;
}

export function ChatRuntimeStoreRegistryProvider({
  children,
  initialStores = [],
}: {
  children: ReactNode;
  initialStores?: CreateChatRuntimeStoreInput[];
}) {
  const [entries, setEntries] = useState<ChatRuntimeStoreEntry[]>(() =>
    createInitialStoreEntries(initialStores)
  );
  const entriesRef = useRef<ChatRuntimeStoreEntry[]>(entries);

  const getEntryByRuntimeId = useCallback(
    (runtimeId: string | null | undefined) => {
      if (!runtimeId) {
        return null;
      }

      return (
        entriesRef.current.find((entry) => entry.runtimeId === runtimeId) ??
        null
      );
    },
    []
  );

  const createStoreIfMissing = useCallback(
    (input: CreateChatRuntimeStoreInput) => {
      const existingEntry = getEntryByRuntimeId(input.runtimeId);

      if (existingEntry) {
        return existingEntry.store;
      }

      const entry = createStoreEntry(input);
      const nextEntries = [...entriesRef.current, entry];

      entriesRef.current = nextEntries;
      setEntries(nextEntries);
      return entry.store;
    },
    [getEntryByRuntimeId]
  );

  const value = useMemo(
    () => ({
      createStoreIfMissing,
      entries,
      getEntryByRuntimeId,
    }),
    [createStoreIfMissing, entries, getEntryByRuntimeId]
  );

  return (
    <ChatRuntimeStoreRegistryContext.Provider value={value}>
      {children}
    </ChatRuntimeStoreRegistryContext.Provider>
  );
}

export function createChatRuntimeStoreInput({
  initialMessages,
  runtimeId,
}: {
  initialMessages?: ChatMessage[];
  runtimeId: ChatRuntimeId;
}): CreateChatRuntimeStoreInput {
  const parsed = parseChatRuntimeId(runtimeId);
  if (!parsed) {
    throw new Error(`Invalid chat runtime id: ${runtimeId}`);
  }

  return {
    chatId: parsed.chatId,
    initialMessages,
    runtimeId,
    threadId: parsed.threadId,
  };
}

export function useChatRuntimeStoreRegistry() {
  const context = useContext(ChatRuntimeStoreRegistryContext);
  if (!context) {
    throw new Error(
      "useChatRuntimeStoreRegistry must be used within ChatRuntimeStoreRegistryProvider"
    );
  }
  return context;
}

export function useChatRuntimeStoreActions() {
  const { createStoreIfMissing } = useChatRuntimeStoreRegistry();

  return useMemo(
    () => ({
      createStoreIfMissing,
    }),
    [createStoreIfMissing]
  );
}

export function useChatRuntimeStoreEntry(runtimeId: string | null | undefined) {
  const { entries } = useChatRuntimeStoreRegistry();

  if (!runtimeId) {
    return null;
  }

  return entries.find((entry) => entry.runtimeId === runtimeId) ?? null;
}

export function useChatRuntimeStore(runtimeId: string | null | undefined) {
  return useChatRuntimeStoreEntry(runtimeId)?.store ?? null;
}
